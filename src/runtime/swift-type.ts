import { Metadata, MetadataKind, getMetadata } from "../abi/metadata.js";
import { ContextDescriptor, ContextDescriptorKind } from "../abi/context-descriptor.js";
import { ClassMetadata, objcClassOf } from "../abi/class-metadata.js";
import { isActor, isDefaultActor, superclassTypeName } from "../abi/class-descriptor.js";
import { SwiftObject } from "./object-facade.js";
import { enumerateFields, fieldTypeIn, leadingContextDescriptor } from "../abi/field-descriptor.js";
import { makeSwiftNativeFunction, indirect } from "./calling-convention.js";
import { parseSwiftSignature, symbolicate, resolveParsedType, resolveTypeExpr, resolveType, ParamConvention } from "./symbolication.js";
import { specializedMetadataOf } from "./choose.js";
import {
  SwiftBoundMethod,
  CallArg,
  CallResult,
  ValueMethodResolveOptions,
  MemberOrigin,
  SwiftMemberSignature,
  memberSignature,
  withHookTarget,
  hookTargetOf,
  PropertyInfo,
  callMarshalled,
  enumerateMethods,
  enumerateProperties,
  lowerResolveOptions,
  splitSelector,
  initializerLookup,
  findMember,
  importedObjCClassName,
  isImportedObjCClass,
} from "./method.js";
import { enumerateTupleElements, tupleLabels } from "../abi/tuple.js";
import { metatypeInstanceType } from "../abi/metatype.js";
import { readFunctionType, ParameterOwnership } from "../abi/function-type.js";
import { typeName } from "./type-name.js";
import { objcClassName } from "./objc.js";
import { findType } from "../reflection/registry.js";
import { Protocol, protocolsForType } from "./protocol.js";
import { SwiftTypeFacade, SwiftClass, SwiftStruct, SwiftEnum, SwiftObjCClass, typeFacade } from "./type-facade.js";

export interface TypeMember {
  name: string;
  type: SwiftType | null;
  isVar: boolean;
}

// Listing is exploratory: the defining module by default; deep sweeps every loaded module's
// extensions and the protocol extensions the type conforms to.
export interface MemberQuery {
  deep?: boolean;
}

export interface MethodQuery extends MemberQuery {
  inherited?: boolean;
}

// The type-level lookups each name one kind of member, so they take no static option.
export type MemberLookupOptions = Omit<ValueMethodResolveOptions, "static">;

// A member found by name alone, never by resolving its types, so it is found and hookable whether
// or not it or its type is generic. The facades bind one to call it.
export interface SwiftMember {
  readonly address: NativePointer;
  readonly selector: string;
  readonly isGeneric: boolean;
  readonly origin: MemberOrigin;
  readonly signature: SwiftMemberSignature;
}

export interface SwiftInstanceMethod extends SwiftMember {
  bind(receiver: SwiftObject): SwiftBoundMethod;
}

export type TypeKind =
  | "class"
  | "struct"
  | "enum"
  | "tuple"
  | "metatype"
  | "function"
  | "existential"
  | "objc-class"
  | "foreign-class"
  | "foreign-reference"
  | "type";

function typeKindName(metadata: Metadata): TypeKind {
  switch (metadata.kind) {
    case MetadataKind.Class:
      return "class";
    case MetadataKind.Struct:
      return "struct";
    case MetadataKind.Enum:
    case MetadataKind.Optional:
      return "enum";
    case MetadataKind.Tuple:
      return "tuple";
    case MetadataKind.Metatype:
    case MetadataKind.ExistentialMetatype:
      return "metatype";
    case MetadataKind.Function:
      return "function";
    case MetadataKind.ObjCClassWrapper:
      return "objc-class";
    case MetadataKind.Existential:
    case MetadataKind.ExtendedExistential:
      return "existential";
    case MetadataKind.ForeignClass:
      return "foreign-class";
    case MetadataKind.ForeignReferenceType:
      return "foreign-reference";
    default:
      return "type";
  }
}

interface RawState {
  descriptor: ContextDescriptor | null;
  metadata: Metadata | null;
  facade: SwiftTypeFacade | null;
}

const RAW_STATE: unique symbol = Symbol("swift.type.raw");

interface WithRawState {
  [RAW_STATE]: RawState;
}

function rawStateOf(type: SwiftType): RawState {
  return (type as unknown as WithRawState)[RAW_STATE];
}

// Reflection on a type: its identity and what it declares. Members are read through this; the
// operations that need a receiver live on the type's facade, and raw metadata stays under /abi.
export class SwiftType {
  /**
   * @internal Construct wrappers through `typeOf` (from a Metadata) or `typeFromDescriptor`
   * (from a ContextDescriptor); both source types are /abi records. Kept in the emitted
   * declarations (`stripInternal` is off), so this is a documentation-level boundary only.
   */
  constructor(source: Metadata | ContextDescriptor) {
    (this as unknown as WithRawState)[RAW_STATE] =
      source instanceof ContextDescriptor
        ? { descriptor: source, metadata: null, facade: null }
        : { descriptor: null, metadata: source, facade: null };
  }

  toString(): string {
    return this.name;
  }

  get name(): string {
    return backingDescriptorOf(this)?.fullTypeName ?? typeName(metadataOf(this));
  }

  get superClass(): SwiftType | null {
    return null;
  }

  get moduleName(): string | null {
    return descriptorOf(this).moduleName;
  }

  toJSON(): { kind: string; name: string; module: string | null } {
    return { kind: this.kind, name: this.name, module: this.jsonModule() };
  }

  get kind(): TypeKind {
    switch (backingDescriptorOf(this)?.kind) {
      case ContextDescriptorKind.Class:
        return "class";
      case ContextDescriptorKind.Struct:
        return "struct";
      case ContextDescriptorKind.Enum:
        return "enum";
      default:
        return typeKindName(metadataOf(this));
    }
  }

  private jsonModule(): string | null {
    if (backingDescriptorOf(this) === null) {
      const kind = metadataOf(this).kind;
      if (
        kind !== MetadataKind.Class &&
        kind !== MetadataKind.Struct &&
        kind !== MetadataKind.Enum &&
        kind !== MetadataKind.Optional
      ) {
        return null;
      }
    }
    return this.moduleName;
  }
}

// A class, struct or enum: the types with Swift members, and the ones that have a facade.
export abstract class NominalType extends SwiftType {
  abstract get facade(): SwiftTypeFacade;

  typeMethods(options: MethodQuery = {}): string[] {
    return this.selectors(true, options);
  }

  instanceMethods(options: MethodQuery = {}): string[] {
    return this.selectors(false, options);
  }

  instanceMethod(name: string, options: MemberLookupOptions = {}): SwiftInstanceMethod {
    const member = this.member(name, { ...options, static: false }, `instance method ${name}`);
    return withHookTarget({ ...member, bind: (receiver) => receiver.$method(name, options) }, hookTargetOf(member) ?? null);
  }

  typeMethod(name: string, options: MemberLookupOptions = {}): SwiftMember {
    return this.member(name, { ...options, static: true }, `type method ${name}`);
  }

  initializer(selector?: string | MemberLookupOptions, options: MemberLookupOptions = {}): SwiftMember {
    return this.member(this.initializerSymbolName(), initializerLookup(selector, options), "initializer");
  }

  // A subscript's getter unless { accessor: "setter" }; the selector names its labels.
  subscript(selector?: string | MemberLookupOptions, options: MemberLookupOptions = {}): SwiftMember {
    return this.member(...subscriptLookup(selector, options, false), "subscript");
  }

  typeSubscript(selector?: string | MemberLookupOptions, options: MemberLookupOptions = {}): SwiftMember {
    return this.member(...subscriptLookup(selector, options, true), "type subscript");
  }

  protected initializerSymbolName(): string {
    return "init";
  }

  private member(selector: string, selectorOptions: ValueMethodResolveOptions, description: string): SwiftMember {
    const { name, options } = splitSelector(selector, selectorOptions);
    const found = findMember(this.name, name, lowerResolveOptions(options));
    if (found === null) {
      throw new Error(`no ${description} on ${this.name}`);
    }
    return withHookTarget(
      { address: found.address, selector: found.selector, isGeneric: found.generic, origin: found.origin, signature: memberSignature(found.signature) },
      { address: found.address, signature: found.signature, witnessDispatched: false }
    );
  }

  private selectors(isStatic: boolean, { inherited = true, deep = false }: MethodQuery): string[] {
    return enumerateMethods(this.name, deep ? "allLoadedModules" : "definingModule", inherited ? "withSuperclasses" : "thisType")
      .filter((m) => m.kind === "method" && m.isStatic === isStatic)
      .map((m) => m.selector);
  }

  protocols(): { [name: string]: Protocol } {
    return protocolsForType(descriptorOf(this).handle);
  }

  // Answered afresh on each call: the specializations built so far, whether or not any instance lives.
  specializations(): SwiftTypeFacade[] {
    if (!isUnboundGeneric(this)) {
      throw new Error(`${this.name} is not a generic type named without its arguments`);
    }
    return specializedMetadataOf(descriptorOf(this)).map((metadata) => (typeOf(metadata) as NominalType).facade);
  }

  properties({ deep = false }: MemberQuery = {}): PropertyInfo[] {
    return enumerateProperties(this.name, deep ? "allLoadedModules" : "definingModule");
  }
}

export class StructType extends NominalType {
  get facade(): SwiftStruct {
    return facadeOf(this, () => typeFacade(new SwiftStruct(this)));
  }

  get fields(): TypeMember[] {
    return storedMembersOf(this);
  }
}

export class EnumType extends NominalType {
  get facade(): SwiftEnum {
    return facadeOf(this, () => typeFacade(new SwiftEnum(this)));
  }

  get cases(): TypeMember[] {
    return storedMembersOf(this);
  }
}

function storedMembersOf(type: StructType | EnumType): TypeMember[] {
  if (isUnboundGeneric(type)) {
    return [...enumerateFields(descriptorOf(type))].map((f) => ({ name: f.name, type: null, isVar: f.isVar }));
  }
  const metadata = metadataOf(type);
  return [...enumerateFields(metadata.description)].map((f) => {
    const fieldType = fieldTypeIn(metadata, f);
    return { name: f.name, type: fieldType === null ? null : typeOf(fieldType), isVar: f.isVar };
  });
}

export class ClassType extends NominalType {
  get facade(): SwiftClass {
    return facadeOf(this, () => typeFacade(new SwiftClass(this)));
  }

  get superClass(): SwiftType | null {
    if (isUnboundGeneric(this)) {
      return unboundSuperclassOf(descriptorOf(this));
    }
    const superclass = new ClassMetadata(metadataOf(this).handle).superclass;
    return superclass !== null && superclass.isTypeMetadata
      ? typeOf(new Metadata(superclass.handle))
      : null;
  }

  get isActor(): boolean {
    return isActor(descriptorOf(this));
  }

  get isDefaultActor(): boolean {
    return isDefaultActor(descriptorOf(this));
  }

  protected initializerSymbolName(): string {
    return "__allocating_init";
  }
}

function unboundSuperclassOf(descriptor: ContextDescriptor): SwiftType | null {
  const name = superclassTypeName(descriptor);
  const superDescriptor = name === null ? null : leadingContextDescriptor(name);
  return superDescriptor === null ? null : typeFromDescriptor(superDescriptor);
}

export class ObjCClassWrapperType extends NominalType {
  get facade(): SwiftObjCClass {
    return facadeOf(this, () => typeFacade(new SwiftObjCClass(this)));
  }

  get objcClass(): NativePointer {
    return objcClassOf(metadataOf(this));
  }

  // swift_getTypeName prints the class bare; its symbols spell it under the __C module.
  get name(): string {
    return `__C.${objcClassName(this.objcClass)}`;
  }

  get moduleName(): string {
    return "__C";
  }

  protocols(): { [name: string]: Protocol } {
    throw new Error(`${this.name} is an Objective-C class; its conformances are not listed`);
  }
}

export class ForeignClassType extends SwiftType {
  get superClass(): ForeignClassType | null {
    const superclass = metadataOf(this).handle.add(2 * Process.pointerSize).readPointer().strip();
    return superclass.isNull() ? null : (typeOf(new Metadata(superclass)) as ForeignClassType);
  }
}

export class ForeignReferenceType extends SwiftType {}

export interface TupleTypeElement {
  label: string | null;
  type: SwiftType;
}

export class TupleType extends SwiftType {
  get elements(): TupleTypeElement[] {
    const metadata = metadataOf(this);
    // Swift stores the labels as one space-separated string, one token per element (empty = none).
    const labelString = tupleLabels(metadata);
    const labels = labelString === null ? [] : labelString.split(" ");
    return [...enumerateTupleElements(metadata)].map((e, i) => ({
      label: labels[i] ? labels[i] : null,
      type: typeOf(e.type),
    }));
  }
}

export class MetatypeType extends SwiftType {
  get instanceType(): SwiftType {
    return typeOf(metatypeInstanceType(metadataOf(this)));
  }
}

export type ParameterConvention = "borrowing" | "consuming" | "inout";

export interface FunctionTypeParameter {
  type: SwiftType;
  convention: ParameterConvention;
  isVariadic: boolean;
}

export interface FunctionTypeSignature {
  parameters: FunctionTypeParameter[];
  result: SwiftType;
  throws: boolean;
  isAsync: boolean;
  isEscaping: boolean;
}

function parameterConvention(ownership: ParameterOwnership): ParameterConvention {
  switch (ownership) {
    case ParameterOwnership.InOut:
      return "inout";
    case ParameterOwnership.Owned:
      return "consuming";
    default:
      return "borrowing";
  }
}

export class FunctionType extends SwiftType {
  get signature(): FunctionTypeSignature {
    const raw = readFunctionType(metadataOf(this));
    return {
      parameters: raw.parameters.map((p) => ({
        type: typeOf(p.type),
        convention: parameterConvention(p.ownership),
        isVariadic: p.isVariadic,
      })),
      result: typeOf(raw.resultType),
      throws: raw.isThrowing,
      isAsync: raw.isAsync,
      isEscaping: raw.isEscaping,
    };
  }
}

function subscriptLookup(
  selector: string | MemberLookupOptions | undefined,
  options: MemberLookupOptions,
  isStatic: boolean
): [string, ValueMethodResolveOptions] {
  const lookup = typeof selector === "string" ? { selector, options } : { selector: "subscript", options: selector ?? options };
  return [lookup.selector, { accessor: "getter", ...lookup.options, static: isStatic }];
}

function facadeOf<T extends SwiftTypeFacade>(type: NominalType, make: () => T): T {
  const state = rawStateOf(type);
  if (state.facade === null) {
    state.facade = make();
  }
  return state.facade as T;
}

// A facade and its reflection name the same type; either is accepted where a type is expected.
function reflectionOf(type: SwiftType | SwiftTypeFacade): SwiftType {
  return type instanceof SwiftType ? type : type.$type;
}

export function metadataOf(type: SwiftType | SwiftTypeFacade): Metadata {
  const state = rawStateOf(reflectionOf(type));
  if (state.metadata === null) {
    state.metadata = getMetadata(state.descriptor!);
  }
  return state.metadata;
}

export function descriptorOf(type: SwiftType | SwiftTypeFacade): ContextDescriptor {
  const reflection = reflectionOf(type);
  return rawStateOf(reflection).descriptor ?? metadataDescriptorOf(reflection);
}

function backingDescriptorOf(type: SwiftType): ContextDescriptor | null {
  return rawStateOf(type).descriptor;
}

// A generic type named without its arguments has a descriptor but no metadata.
export function isUnboundGeneric(type: SwiftType): boolean {
  const state = rawStateOf(type);
  return state.metadata === null && state.descriptor !== null && state.descriptor.isGeneric;
}

function metadataDescriptorOf(type: SwiftType): ContextDescriptor {
  const metadata = metadataOf(type);
  if (type instanceof ClassType) {
    return new ClassMetadata(metadata.handle).description;
  }
  if (type instanceof ForeignClassType || type instanceof ForeignReferenceType) {
    return new ContextDescriptor(metadata.handle.add(Process.pointerSize).readPointer().strip());
  }
  return metadata.description;
}

export type NativeFunctionType = SwiftType | SwiftTypeFacade;

export interface MarshalledFunctionOptions {
  throws?: boolean;
}

function marshalledMetadataOf(type: NativeFunctionType, role: string): Metadata {
  if (!(type instanceof SwiftType) && !(type instanceof SwiftTypeFacade)) {
    throw new Error(`swiftFunction: ${role} is not a SwiftType`);
  }
  return metadataOf(type);
}

// Best-effort: an address with no exported symbol (stripped/private) is assumed to borrow its
// arguments and, if it throws, to throw an untyped error.
function symbolSignatureAt(address: NativePointer): { conventions: ParamConvention[]; thrown: Metadata | undefined } {
  const symbol = symbolicate(address);
  const parsed = symbol === null ? null : parseSwiftSignature(symbol.demangled);
  if (parsed === null || parsed.kind !== "function") {
    return { conventions: [], thrown: undefined };
  }
  const thrown = parsed.thrownType === null ? null : resolveParsedType(parsed.thrownType, () => null);
  if (parsed.thrownType !== null && thrown === null) {
    throw new Error(`swiftFunction: cannot resolve thrown type ${parsed.thrownType.text}`);
  }
  return { conventions: parsed.params.map((p) => p.convention), thrown: thrown ?? undefined };
}

export function swiftFunction(
  address: NativePointer,
  returnType: NativeFunctionType | null,
  argTypes: NativeFunctionType[],
  options: MarshalledFunctionOptions = {}
): (...args: CallArg[]) => CallResult {
  const { conventions, thrown } = symbolSignatureAt(address);
  const argMetadata = argTypes.map((t, i) => marshalledMetadataOf(t, `argument type ${i}`));
  const returnMetadata = returnType === null ? null : marshalledMetadataOf(returnType, "return type");
  const lowered = argMetadata.map((m, i) => (conventions[i] === "inout" ? indirect(m) : m));
  const raw = makeSwiftNativeFunction(address, returnMetadata, lowered, { throws: options.throws, errorType: thrown });
  return (...args: CallArg[]): CallResult =>
    callMarshalled(argMetadata, args, returnMetadata, (argPtrs) => raw(...argPtrs), conventions);
}

const wrappers = new Map<string, SwiftType>();

function cachedWrapper<T extends SwiftType>(key: NativePointer, make: () => T): T {
  const id = key.toString();
  let wrapper = wrappers.get(id);
  if (wrapper === undefined) {
    wrapper = make();
    wrappers.set(id, wrapper);
  }
  return wrapper as T;
}

function wrapperFromDescriptor(descriptor: ContextDescriptor): NominalType {
  switch (descriptor.kind) {
    case ContextDescriptorKind.Class:
      return new ClassType(descriptor);
    case ContextDescriptorKind.Struct:
      return new StructType(descriptor);
    case ContextDescriptorKind.Enum:
      return new EnumType(descriptor);
    default:
      throw new Error(`descriptor kind ${descriptor.kind} is not a type`);
  }
}

export function typeFromDescriptor(descriptor: ContextDescriptor): NominalType {
  return cachedWrapper(descriptor.handle, () => wrapperFromDescriptor(descriptor));
}

function wrapperFromMetadata(metadata: Metadata): SwiftType {
  switch (metadata.kind) {
    case MetadataKind.Struct:
      return new StructType(metadata);
    case MetadataKind.Enum:
    case MetadataKind.Optional:
      return new EnumType(metadata);
    case MetadataKind.Class:
      return new ClassType(metadata);
    case MetadataKind.Tuple:
      return new TupleType(metadata);
    case MetadataKind.Metatype:
    case MetadataKind.ExistentialMetatype:
      return new MetatypeType(metadata);
    case MetadataKind.Function:
      return new FunctionType(metadata);
    case MetadataKind.ObjCClassWrapper:
      return new ObjCClassWrapperType(metadata);
    case MetadataKind.ForeignClass:
      return new ForeignClassType(metadata);
    case MetadataKind.ForeignReferenceType:
      return new ForeignReferenceType(metadata);
    case MetadataKind.FixedArray:
    case MetadataKind.Borrow:
      throw new Error(`unsupported metadata kind ${MetadataKind[metadata.kind]}`);
    default:
      return new SwiftType(metadata);
  }
}

function nominalDescriptorOf(metadata: Metadata): ContextDescriptor | null {
  switch (metadata.kind) {
    case MetadataKind.Struct:
    case MetadataKind.Enum:
    case MetadataKind.Optional:
      return metadata.description;
    case MetadataKind.Class: {
      const cls = new ClassMetadata(metadata.handle);
      return cls.isTypeMetadata ? cls.description : null;
    }
    default:
      return null;
  }
}

// "Module.Name" is a declaration; "Module.Name<Args>" is a specialization, with its metadata built.
export function nominalTypeNamed(name: string): NominalType | null {
  if (name.includes("<")) {
    const metadata = resolveTypeExpr(name, () => null);
    const type = metadata === null ? null : typeOf(metadata);
    return type instanceof NominalType ? type : null;
  }
  const descriptor = isImportedObjCClass(name) ? null : findType(name);
  if (descriptor !== null) {
    return typeFromDescriptor(descriptor);
  }
  const objcClass = importedObjCClassName(name);
  const metadata = objcClass === null ? null : resolveType(objcClass);
  const type = metadata === null ? null : typeOf(metadata);
  return type instanceof NominalType ? type : null;
}

// A non-generic nominal type has one wrapper, shared by its descriptor and its metadata; every
// generic specialization and every structural type is keyed by its runtime-uniqued metadata.
export function typeOf(metadata: Metadata): SwiftType {
  const descriptor = nominalDescriptorOf(metadata);
  if (descriptor === null || descriptor.isGeneric) {
    return cachedWrapper(metadata.handle, () => wrapperFromMetadata(metadata));
  }
  const wrapper = cachedWrapper(descriptor.handle, () => wrapperFromMetadata(metadata));
  const state = rawStateOf(wrapper);
  state.metadata ??= metadata;
  state.descriptor ??= descriptor;
  return wrapper;
}
