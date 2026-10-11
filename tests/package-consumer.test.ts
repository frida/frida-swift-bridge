import { test, expect } from "@frida/injest/agent";

import type { Protocol, ProtocolComposition } from "frida-swift-bridge";
import Swift, {
  SwiftCoreApi,
  SwiftType,
  NominalType,
  StructType,
  EnumType,
  ClassType,
  TupleType,
  SwiftTypeFacade,
  SwiftClass,
  SwiftValueType,
  SwiftStruct,
  SwiftEnum,
  SwiftMember,
  SwiftInstanceMethod,
  SwiftValue,
  SwiftObject,
  SwiftClassObject,
  SwiftValueObject,
  SwiftField,
  SwiftBoundMethod,
  MethodResolveOptions,
  ValueMethodResolveOptions,
  CallArg,
  CallResult,
  ClosureSpec,
  AnyClosureBody,
  NativeFunctionType,
  MarshalledFunctionOptions,
  SwiftError,
} from "frida-swift-bridge";
import {
  Metadata,
  ContextDescriptor,
  TypeLayout,
  ValueInstance,
  ClassInstance,
  ClosureBody,
  GenericRequirementDescriptor,
  InvertedProtocolsRequirement,
  SelfRouting,
  CallPlan,
  SwiftBoundInitializer,
  MethodQuery,
  makeSwiftNativeFunction,
  metadataOf,
  descriptorOf,
} from "frida-swift-bridge/abi";

type _rootTypesAreImportable = [
  SwiftCoreApi, SwiftType, NominalType, StructType, EnumType, ClassType, TupleType,
  SwiftTypeFacade, SwiftClass, SwiftValueType, SwiftStruct, SwiftEnum, SwiftMember, SwiftInstanceMethod,
  Protocol, ProtocolComposition, SwiftValue, SwiftObject, SwiftClassObject,
  SwiftValueObject, SwiftField, SwiftBoundMethod, MethodResolveOptions,
  ValueMethodResolveOptions, CallArg, CallResult, ClosureSpec,
  AnyClosureBody, NativeFunctionType, MarshalledFunctionOptions,
  typeof Swift.Interceptor, SwiftError,
];
type _abiTypesAreImportable = [
  Metadata, TypeLayout, ValueInstance, ClassInstance, ClosureBody,
  GenericRequirementDescriptor, InvertedProtocolsRequirement, SelfRouting,
  CallPlan, SwiftBoundInitializer, MethodQuery,
];

function facadeKindContractsHoldAtCompileTime(
  cls: SwiftClassObject,
  val: SwiftValueObject,
  either: SwiftObject,
  field: SwiftField,
  type: SwiftType,
) {
  cls.$method("m");
  val.$method("m", { self: "mutating" });
  // @ts-expect-error self is value-only
  cls.$method("m", { self: "mutating" });

  if (either.$kind === "value") {
    either.$container();
  } else {
    either.$method("m");
  }
  // @ts-expect-error $container is value-only
  cls.$container();

  const read: SwiftValue = field.read();
  field.write(read);
  const handle: NativePointer = field.handle;
  const fieldType: SwiftType = field.type;
  const asArg: CallArg = field; // a $field view passes as a call argument without a cast
  void [handle, fieldType, asArg];
  // @ts-expect-error borrowed view hides ValueInstance.metadata
  field.metadata;
  // @ts-expect-error borrowed view hides ValueInstance.copyInto
  field.copyInto;

  Swift.NativeFunction(field.handle, type, [type], { throws: true });
  // @ts-expect-error raw hasSelf stays under /abi
  Swift.NativeFunction(field.handle, type, [type], { hasSelf: true });
}

function acquisitionPreservesFacadeKindAtCompileTime(cls: SwiftClass, st: SwiftStruct, en: SwiftEnum) {
  const borrowed: SwiftClassObject = Swift.borrowObject(NULL);
  const adopted: SwiftClassObject = Swift.adoptObject(NULL);
  const constructed: SwiftClassObject = cls.init();
  const value: SwiftValueObject = st.$new(0);
  const made: SwiftValueObject | null = en.init();
  const kase: SwiftValueObject = en.$case("none");
  void [borrowed, adopted, constructed, value, made, kase];
}

// A facade answers any Swift member name, so only its $type is checked: a misspelled reflection
// member is a compile-time error, a misspelled facade member is not.
function reflectionIsStrictAtCompileTime(cls: SwiftClass, st: SwiftStruct, o: SwiftClassObject, v: SwiftValueObject, t: SwiftType) {
  const classInfo: ClassType = cls.$type;
  const structInfo: StructType = st.$type;
  const dynamicInfo: ClassType = o.$type;
  const valueInfo: StructType | EnumType = v.$type;
  const name: string = t.name;
  const selectors: string[] = classInfo.instanceMethods();
  const found: SwiftInstanceMethod = classInfo.instanceMethod("greet");
  const typeMethod: SwiftMember = structInfo.typeMethod("make");
  const initializer: SwiftMember = classInfo.initializer("init(name:)");
  const back: SwiftClass = classInfo.facade;
  const superInfo: SwiftType | null = classInfo.superClass;
  void [dynamicInfo, valueInfo, name, selectors, found, typeMethod, initializer, back, superInfo];
  // @ts-expect-error reflection has no index signature
  classInfo.instanceMehtods();
  // @ts-expect-error reflection has no index signature
  o.$type.noSuchMember;
  // @ts-expect-error a receiver operation is not a reflection member
  classInfo.init();
  // @ts-expect-error a receiver operation is not a reflection member
  structInfo.$new(0);
  // @ts-expect-error a reflection member keeps its bare name
  cls.$type.$name;
}

function structuralReflectionHasNoDynamicMembersAtCompileTime(tuple: TupleType, any: SwiftType) {
  const elementType: SwiftType = tuple.elements[0].type;
  void elementType;
  // @ts-expect-error a structural type has no facade
  tuple.facade;
  // @ts-expect-error a structural type answers no Swift member names
  tuple.first;
  // @ts-expect-error a structural type has no Swift members to list
  tuple.instanceMethods();
  // @ts-expect-error the common base has no index signature
  any.anything;
}

function typesAreAcceptedAsReflectionOrFacadeAtCompileTime(cls: SwiftClass, info: ClassType, o: SwiftClassObject) {
  Swift.NativeFunction(NULL, cls, [info]);
  Swift.NativeFunction(NULL, info, [cls, o.$type]);
  o.$method("m", { typeArguments: [cls, info] });
  const metadata: Metadata = metadataOf(cls);
  const descriptor: ContextDescriptor = descriptorOf(info);
  void [metadata, descriptor];
}

function rawMetadataStaysUnderAbi(type: SwiftType) {
  const metadata: Metadata = metadataOf(type);
  const descriptor: ContextDescriptor = descriptorOf(type);
  void [metadata, descriptor];
  // @ts-expect-error raw metadata stays under /abi metadataOf()
  const rawMetadata: Metadata = type.metadata;
  // @ts-expect-error raw descriptor stays under /abi descriptorOf()
  const rawDescriptor: ContextDescriptor = type.descriptor;
  void [rawMetadata, rawDescriptor];
}

function protocolRawInspectionStaysUnderAbi(p: Protocol, comp: ProtocolComposition) {
  const conformers: NominalType[] = p.conformingTypes();
  void [p.name, p.fullName, p.isClassOnly, conformers];
  // @ts-expect-error raw protocol descriptor stays under /abi
  p.descriptor;
  // @ts-expect-error raw requirements stay under /abi
  p.requirements;
  // @ts-expect-error witness-table lookup stays under /abi
  p.conformanceFor;
  // @ts-expect-error existential metadata stays under /abi
  comp.metadata;
}

function rawOpsStayOffTheFacadeAtCompileTime(o: SwiftObject) {
  // @ts-expect-error $retain is an /abi-only ClassInstance op
  o.$retain();
  // @ts-expect-error $release is an /abi-only ClassInstance op
  o.$release();
  // @ts-expect-error $retainCount is an /abi-only ClassInstance op
  o.$retainCount();
  // @ts-expect-error $isUniquelyReferenced is an /abi-only ClassInstance op
  o.$isUniquelyReferenced();
  // @ts-expect-error $vtable is an /abi-only ClassInstance op
  o.$vtable();
  // @ts-expect-error $vtableMethod is an /abi-only ClassInstance op
  o.$vtableMethod();
}

void facadeKindContractsHoldAtCompileTime;
void acquisitionPreservesFacadeKindAtCompileTime;
void reflectionIsStrictAtCompileTime;
void structuralReflectionHasNoDynamicMembersAtCompileTime;
void typesAreAcceptedAsReflectionOrFacadeAtCompileTime;
void rawMetadataStaysUnderAbi;
void protocolRawInspectionStaysUnderAbi;
void rawOpsStayOffTheFacadeAtCompileTime;
void makeSwiftNativeFunction;

test("published entry points resolve as runtime values", () => {
  expect(typeof Swift.borrowObject).toBe("function");
  expect(typeof Swift.adoptObject).toBe("function");
  expect(typeof Swift.NativeFunction).toBe("function");
  expect(typeof Swift.closure).toBe("function");
  expect(typeof Swift.demangle).toBe("function");
  expect(typeof Swift.Interceptor.attach).toBe("function");
  expect(typeof ValueInstance).toBe("function");
  expect(typeof makeSwiftNativeFunction).toBe("function");
  expect(typeof metadataOf).toBe("function");
  expect(typeof descriptorOf).toBe("function");
});
