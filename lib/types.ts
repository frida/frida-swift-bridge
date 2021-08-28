/**
 * TODO:
 *  - Use conventional ordering of declarations
 *  - Implement Objective-C enumeration, e.g. __C.NSURL?
 */

import { TargetClassDescriptor, TargetClassMetadata, TargetEnumDescriptor,
         TargetEnumMetadata, TargetMetadata, TargetProtocolDescriptor,
         TargetStructDescriptor, TargetStructMetadata,
         TargetTypeContextDescriptor, TargetValueBuffer, TargetValueMetadata,
         TypeLayout } from "../abi/metadata";
import { MetadataKind, MethodDescriptorKind,
         ProtocolClassConstraint } from "../abi/metadatavalues";
import { demangleSwiftSymbol, parseSwiftAccessorSignature, parseSwiftMethodSignature } from "../lib/symbols";
import { makeSwiftNativeFunction, NativeSwiftType } from "./callingconvention";
import { HeapObject } from "../runtime/heapobject";
import { RawFields, makeBufferFromValue } from "./buffer";
import { findDemangledSymbol, metadataFor, ProtocolConformance, ProtocolConformanceMap, untypedMetadataFor } from "./macho";
import { FieldDescriptor } from "../reflection/records";
import { RelativeDirectPointer } from "../basic/relativepointer";

type SwiftTypeKind = "Class" | "Enum" | "Struct";

export abstract class Type {
    readonly $name: string;
    readonly $fields?: FieldDetails[];
    readonly $moduleName: string;

    abstract readonly $metadata: TargetMetadata;

    constructor (readonly kind: SwiftTypeKind,
                 readonly descriptor: TargetTypeContextDescriptor,
                 readonly $conformances: ProtocolConformanceMap) {
        this.$name = descriptor.name;
        this.$fields = getFieldsDetails(descriptor);
        this.$moduleName = descriptor.getModuleContext().name;
    }

    get $metadataPointer(): NativePointer {
        return this.$metadata.handle;
    }

    toJSON() {
        return {
            fields: this.$fields,
            conformances: Object.keys(this.$conformances),
        }
    }
}

export class Class extends Type {
    readonly $methods: MethodDetails[];

    constructor(descriptor: TargetClassDescriptor, conformances: ProtocolConformanceMap) {
        super("Class", descriptor, conformances);
        this.$methods = getMethodsDetails(descriptor);

        for (const method of this.$methods) {
            if (method.type === "Init") {
                const parsed = parseSwiftMethodSignature(method.name);
                if (parsed === undefined) {
                    continue;
                }

                Object.defineProperty(this, parsed.jsSignature, {
                    configurable: true,
                    get() {
                        const argTypes = parsed.argTypeNames.map(ty =>
                                untypedMetadataFor(ty));
                        const fn = makeSwiftNativeFunction(method.address,
                                            this.$metadata,
                                            argTypes,
                                            this.$metadataPointer);

                        Object.defineProperty(this, parsed.jsSignature, {
                            configurable: true,
                            value: fn,
                        });

                        return fn;
                    }
                });
            }
        }
    }

    get $metadata(): TargetClassMetadata {
        return metadataFor(this.descriptor.getFullTypeName(), TargetClassMetadata);
    }

    toJSON() {
        const base = super.toJSON();
        return Object.assign(base, {
            methods: this.$methods
        });
    }
}

export class Struct extends Type {
    constructor(descriptor: TargetStructDescriptor,
                conformances: ProtocolConformanceMap) {
        super("Struct", descriptor, conformances);

    }

    get $metadata(): TargetStructMetadata {
        return metadataFor(this.descriptor.getFullTypeName(), TargetStructMetadata);
    }
}

/* TODO: handle "default" protocol witnesses? See OnOffSwitch for an example */
export class Enum extends Type {
    constructor(descriptor: TargetEnumDescriptor,
                conformances: ProtocolConformanceMap) {
        super("Enum", descriptor, conformances);

        if (this.$fields === undefined) {
            return;
        }

        for (const [i, kase] of this.$fields.entries()) {
            const caseTag = i;

            if (descriptor.isPayloadTag(caseTag)) {
                const associatedValueWrapper = (payload: RuntimeInstance) => {
                    if (payload === undefined) {
                        throw new Error("Case requires an associated value");
                    }

                    /* TODO: type-check argument */
                    const enumValue = new EnumValue(this.$metadata, {
                        tag: caseTag,
                        payload
                    });

                    return enumValue;
                }

                Object.defineProperty(this, kase.name, {
                    configurable: false,
                    enumerable: true,
                    value: associatedValueWrapper,
                    writable: false
                });
            } else {
                Object.defineProperty(this, kase.name, {
                    configurable: true,
                    enumerable: true,
                    get: () => {
                        const enumVal = new EnumValue(this.$metadata, {
                            tag: caseTag
                        });
                        Object.defineProperty(this, kase.name, { value: enumVal });
                        return enumVal;
                    }
                });
            }
        }
    }

    get $metadata(): TargetEnumMetadata {
        return metadataFor(this.descriptor.getFullTypeName(), TargetEnumMetadata);
    }
}

export class Protocol {
    readonly name: string;
    readonly numRequirements: number;
    readonly isClassOnly: boolean;
    readonly moduleName: string;

    constructor(readonly descriptor: TargetProtocolDescriptor) {
        this.name = descriptor.name;
        this.numRequirements = descriptor.numRequirements;
        this.isClassOnly = descriptor.getProtocolContextDescriptorFlags()
                .getClassConstraint() == ProtocolClassConstraint.Class;
        this.moduleName = descriptor.getModuleContext().name;
    }

    toJSON() {
        return {
            numRequirements: this.descriptor.numRequirements,
            isClassOnly: this.isClassOnly,
        }
    }
}

export class ProtocolComposition {
    readonly protocols: Protocol[];
    readonly numProtocols: number;
    readonly isClassOnly: boolean;

    constructor(...protocols: Protocol[]) {
        this.protocols = [...protocols];
        this.numProtocols = protocols.length;
        this.isClassOnly = false;

        for (const proto of protocols) {
            if (proto.isClassOnly) {
                this.isClassOnly = true;
                break;
            }
        }
    }
}

export abstract class RuntimeInstance {
    abstract readonly $metadata: TargetMetadata;
    abstract readonly handle: NativePointer;

    equals(other: RuntimeInstance) {
        return this.handle.equals(other.handle);
    }

    toJSON() {
        return {
            handle: this.handle
        }
    }

    static fromAdopted(handle: NativePointer, metadata: TargetMetadata): RuntimeInstance {
        if (metadata.getKind() === MetadataKind.Class) {
            return new ObjectInstance(handle);
        } else {
            return ValueInstance.fromAdopted(handle, metadata as TargetValueMetadata);
        }
    }
}

export abstract class ValueInstance extends RuntimeInstance {
    readonly $metadata: TargetValueMetadata;

    static fromCopy(src: NativePointer, metadata: TargetValueMetadata): ValueInstance {
        const dest = Memory.alloc(metadata.getTypeLayout().stride);
        metadata.vw_initializeWithCopy(dest, src);

        if (metadata.getKind() === MetadataKind.Struct) {
            return new StructValue(metadata as TargetStructMetadata, {
                handle: dest
            });
        } else {
            return new EnumValue(metadata as TargetEnumMetadata, {
                handle: dest
            });
        }
    }

    static fromAdopted(handle: NativePointer, metadata: TargetValueMetadata): ValueInstance {
        if (metadata.getKind() === MetadataKind.Struct) {
            return new StructValue(metadata as TargetStructMetadata, { handle });
        } else {
            return new EnumValue(metadata as TargetEnumMetadata, { handle });
        }
    }
}

interface StructValueConstructionOptions {
    raw?: RawFields,
    handle?: NativePointer,
}

export class StructValue implements ValueInstance {
    readonly $metadata: TargetStructMetadata;
    readonly handle: NativePointer;

    /* TODO accept TargetMetadata */
    constructor(type: Struct | TargetStructMetadata, options: StructValueConstructionOptions) {
        if (options.handle === undefined && options.raw === undefined) {
            throw new Error("Either a handle or raw fields must be provided");
        }

        this.$metadata = (type instanceof Struct) ?
                         type.$metadata :
                         type;
        this.handle = options.handle || makeBufferFromValue(options.raw);
    }

    equals(other: StructValue) {
        return this.handle.equals(other.handle);
    }

    toJSON() {
        return {
            handle: this.handle,
        };
    }
}


interface EnumValueConstructionOptions {
    handle?: NativePointer,
    tag?: number,
    payload?: RuntimeInstance,
    raw?: RawFields,
}

export class EnumValue implements ValueInstance {
    readonly $metadata: TargetEnumMetadata;
    readonly handle: NativePointer;
    readonly descriptor: TargetEnumDescriptor;

    #tag: number;
    #payload: RuntimeInstance;

    constructor(type: Enum | TargetEnumMetadata, options: EnumValueConstructionOptions) {
        this.$metadata = (type instanceof Enum) ?
                         type.$metadata :
                         type;
        this.descriptor = this.$metadata.getDescription();
        const fields = getFieldsDetails(this.descriptor);

        if (options.tag === undefined &&
            options.handle === undefined &&
            options.raw === undefined) {
            throw new Error("Either a tag, handle or raw fields must be provided");
        }

        if (options.tag !== undefined) {
            const tag = options.tag;
            const payload = options.payload;
            this.handle = Memory.alloc(this.$metadata.getTypeLayout().stride);

            if (tag === undefined || tag >= this.descriptor.getNumCases()) {
                throw new Error("Invalid tag for an enum of this type");
            }

            if (this.descriptor.isPayloadTag(tag)) {
                if (payload === undefined) {
                    throw new Error("Payload must be provided for this tag");
                }

                const typeName = fields[tag].typeName;

                if (payload.$metadata.getFullTypeName() !== typeName) {
                    throw new Error("Payload must be of type " + typeName);
                }

                if (payload instanceof ObjectInstance) {
                    this.handle.writePointer(payload.handle);
                    this.#payload = payload;
                } else {
                    this.#payload = ValueInstance.fromAdopted(this.handle,
                            payload.$metadata as TargetValueMetadata);
                    this.$metadata.vw_initializeWithCopy(this.handle,
                            payload.handle);
                }
            }

            this.$metadata.vw_destructiveInjectEnumTag(this.handle, tag);
            this.#tag = tag;
        } else {
            this.handle = options.handle || makeBufferFromValue(options.raw);
            const tag = this.$metadata.vw_getEnumTag(this.handle);
            let payload: RuntimeInstance;

            if (tag >= this.descriptor.getNumCases()) {
                throw new Error("Invalid pointer for an enum of this type");
            }

            if (this.descriptor.isPayloadTag(tag)) {
                const typeName = fields[tag].typeName;
                /* FIXME: metadata should be TargetMetadata, but it's abstract and TS disallows it */
                const typeMetadata = metadataFor(typeName, TargetValueMetadata);
                payload = RuntimeInstance.fromAdopted(this.handle, typeMetadata);
            }

            this.#tag = tag;
            this.#payload = payload;

        }
    }

    get $tag(): number {
        return this.#tag;
    }

    get $payload(): RuntimeInstance {
        return this.#payload;
    }

    equals(e: EnumValue) {
        let result = false;

        if (this.$tag !== undefined && e.$tag !== undefined) {
            result = this.$tag === e.$tag;
        }

        if (this.$payload !== undefined && e.$payload !== undefined) {
            /* TODO: handle value type equality properly */
            result &&= this.$payload.handle.equals(e.$payload.handle);
        }

        return result;
    }

    toJSON() {
        return {
            handle: this.handle,
            tag: this.#tag,
            payload: this.#payload,
        }
    }
}

export class ObjectInstance extends RuntimeInstance {
    readonly $metadata: TargetClassMetadata;

    #heapObject: HeapObject;

    constructor(readonly handle: NativePointer) {
        super();
        this.#heapObject = new HeapObject(handle);
        this.$metadata = this.#heapObject.getMetadata(TargetClassMetadata);
        const descriptor = this.$metadata.getDescription();

        for (const method of getMethodsDetails(descriptor)) {
            switch (method.type) {
                case "Getter": {
                    const parsed = parseSwiftAccessorSignature(method.name);
                    if (parsed === undefined) {
                        break;
                    }

                    const memberType = untypedMetadataFor(parsed.memberTypeName);
                    const getter = makeSwiftNativeFunction(method.address,
                                memberType, [], this.handle);

                    Object.defineProperty(this, parsed.memberName, {
                        configurable: true,
                        enumerable: true,
                        get: getter as () => any,
                    });
                    break;
                }
                case "Setter": {
                    const parsed = parseSwiftAccessorSignature(method.name);
                    if(parsed === undefined) {
                        break;
                    }

                    const memberType = untypedMetadataFor(parsed.memberTypeName);
                    const setter = makeSwiftNativeFunction(method.address,
                                "void", [memberType], this.handle);

                    Object.defineProperty(this, parsed.memberName, {
                        configurable: true,
                        enumerable: true,
                        set: setter as (any) => void,
                    });
                    break;
                }
                case "Method": {
                    const parsed = parseSwiftMethodSignature(method.name);
                    if (parsed === undefined) {
                        break;
                    }

                    const retType = parsed.retTypeName === "void" ?
                                    "void" :
                                    untypedMetadataFor(parsed.retTypeName);
                    const argTypes = parsed.argTypeNames.map(ty =>
                                untypedMetadataFor(ty));
                    const fn = makeSwiftNativeFunction(method.address, retType,
                            argTypes, this.handle);

                    Object.defineProperty(this, parsed.jsSignature, {
                        configurable: true,
                        enumerable: true,
                        value: fn,
                    });
                    break;
                }
            }
        }
    }
}

interface FieldDetails {
    name: string;
    typeName?: string;
    isVar?: boolean;
}

type MethodType = "Init" | "Getter" | "Setter" | "ModifyCoroutine" |
                  "ReadCoroutine" | "Method";

interface MethodDetails {
    address: NativePointer;
    name: string;
    type: MethodType;
}

/* XXX: not in original source */
function getFieldsDetails(descriptor: TargetTypeContextDescriptor): FieldDetails[] {
    const result: FieldDetails[] = [];

    if (!descriptor.isReflectable()) {
        return undefined;
    }

    const fieldsDescriptor = new FieldDescriptor(descriptor.fields.get());
    if (fieldsDescriptor.numFields === 0) {
        return undefined;
    }

    const fields = fieldsDescriptor.getFields();
    for (const f of fields) {
        result.push({
            name: f.fieldName,
            typeName: f.mangledTypeName === null ?
                        undefined :
                        resolveSymbolicReferences(f.mangledTypeName.get()),
            isVar: f.isVar,
        });
    }

    return result;
}

function getMethodsDetails(descriptor: TargetClassDescriptor): MethodDetails[] {
    const result: MethodDetails[] = [];

    for (const methDesc of descriptor.getMethodDescriptors()) {
        const address = methDesc.impl.get();
        const name = findDemangledSymbol(address);
        const kind = methDesc.flags.getKind();
        let type: MethodType;

        switch (kind) {
            case MethodDescriptorKind.Init:
                type = "Init";
                break;
            case MethodDescriptorKind.Getter:
                type = "Getter";
                break;
            case MethodDescriptorKind.Setter:
                type = "Setter";
                break;
            case MethodDescriptorKind.ReadCoroutine:
                type = "ReadCoroutine";
                break;
            case MethodDescriptorKind.ModifyCoroutine:
                type = "ModifyCoroutine";
                break;
            case MethodDescriptorKind.Method:
                type = "Method";
                break;
            default:
                throw new Error(`Invalid method descriptor kind: ${kind}`);
        }

        result.push({
            address,
            name,
            type,
        });
    }

    return result;
}

function resolveSymbolicReferences(symbol: NativePointer): string {
    const base = symbol;
    let end = base;
    let endValue = end.readU8();
    let contextDescriptor: TargetTypeContextDescriptor = null;

    while (endValue !== 0) {
        if (endValue >= 0x01 && endValue <= 0x17) {
            end = end.add(1);

            if (endValue === 0x01) {
                contextDescriptor = new TargetTypeContextDescriptor(
                    RelativeDirectPointer.From(end).get());
            } else if (endValue === 0x02) {
                let p = RelativeDirectPointer.From(end).get().readPointer();
                p = p.and(0x7FFFFFFFFFF); // TODO: strip PAC

                contextDescriptor = new TargetTypeContextDescriptor(p);
            }
            break;
        } else if (endValue >= 0x18 && endValue <= 0x1F) {
            throw new Error("UNIMPLEMENTED 0x18 - 0x1F");
        }

        end = end.add(1);
        endValue = end.readU8();
    }

    if (contextDescriptor !== null) {
        return contextDescriptor.name;
    }

    return demangleSwiftSymbol("_$s" + symbol.readCString());
}
