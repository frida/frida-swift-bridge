/**
 * TODO:
 *  - Pretty print enum values
 */

import { TargetClassMetadata,
         TargetEnumDescriptor,
         TargetEnumMetadata,
         TargetMetadata,
         TargetStructMetadata,
         TargetValueMetadata } from "../abi/metadata";
import { HeapObject } from "../runtime/heapobject";
import { makeBufferFromValue, RawFields } from "./buffer";
import { makeSwiftNativeFunction } from "./callingconvention";
import { Registry } from "./registry";
import { parseSwiftAccessorSignature, parseSwiftMethodSignature } from "./symbols";
import { Class, Enum, Struct, ValueType } from "./types";

/* XXX: If you think this is bad, please suggest a better name */
export abstract class RuntimeInstance {
    readonly typeMetadata: TargetMetadata;
    readonly handle: NativePointer;

    equals(other: RuntimeInstance) {
        return this.handle.equals(other.handle);
    }

    toJSON() {
        return {
            handle: this.handle
        }
    }
}

export abstract class ValueInstance extends RuntimeInstance {
    readonly typeMetadata: TargetValueMetadata;
}

interface StructValueConstructionOptions {
    raw?: RawFields,
    handle?: NativePointer,
}

interface StructValueConstructor {
    new (metadata: TargetStructMetadata, options: StructValueConstructionOptions): StructValue;
}

export class StructValue implements ValueInstance {
    readonly typeMetadata: TargetStructMetadata;
    readonly handle: NativePointer;

    constructor(readonly type: Struct, options: StructValueConstructionOptions) {
        if (options.handle === undefined && options.raw === undefined) {
            throw new Error("Either a handle or raw fields must be provided");
        }

        this.typeMetadata = type.metadata;
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

interface EnumValueConstructor {
    new (metadata: TargetEnumMetadata, options: EnumValueConstructionOptions): EnumValue;
}

export class EnumValue implements ValueInstance {
    readonly descriptor: TargetEnumDescriptor;
    readonly typeMetadata: TargetEnumMetadata;
    readonly handle: NativePointer;

    #tag: number;
    #payload: RuntimeInstance;

    constructor(readonly type: Enum, options: EnumValueConstructionOptions) {
        this.descriptor = type.descriptor as TargetEnumDescriptor;
        this.typeMetadata = type.$metadata as TargetEnumMetadata;

        if (options.tag === undefined &&
            options.handle === undefined &&
            options.raw === undefined) {
            throw new Error("Either a tag, handle or raw fields must be provided");
        }

        if (options.tag !== undefined) {
            const tag = options.tag;
            this.handle = Memory.alloc(this.typeMetadata.getTypeLayout().stride);
            const payload = options.payload;

            if (tag === undefined || tag >= this.descriptor.getNumCases()) {
                throw new Error("Invalid tag for an enum of this type");
            }

            if (this.descriptor.isPayloadTag(tag)) {
                if (payload === undefined) {
                    throw new Error("Payload must be provided for this tag");
                }

                const typeName = this.type.$fields[tag].typeName;
                const type = Registry.shared().typeByName(typeName);

                if (payload.typeMetadata.getDescription().name !== type.$name) {
                    throw new Error("Payload must be of type " + typeName);
                }

                if (payload instanceof ObjectInstance) {
                    this.handle.writePointer(payload.handle);
                    this.#payload = payload;
                } else {
                    const valueType = type as ValueType;
                    this.#payload = valueType.makeValueFromRaw(this.handle);
                    valueType.$copyRaw(this.#payload.handle, payload.handle);
                }
            }

            this.type.metadata.vw_destructiveInjectEnumTag(this.handle, tag);
            this.#tag = tag;
        } else {
            this.handle = options.handle || makeBufferFromValue(options.raw);
            const tag = this.type.metadata.vw_getEnumTag(this.handle);
            let payload: RuntimeInstance;

            if (tag >= this.descriptor.getNumCases()) {
                throw new Error("Invalid pointer for an enum of this type");
            }

            if (this.descriptor.isPayloadTag(tag)) {
                const typeName = this.type.$fields[tag].typeName;
                const type = Registry.shared().typeByName(typeName);
                payload = (type instanceof ValueType) ?
                          type.makeValueFromRaw(this.handle) :
                          new ObjectInstance(this.handle);
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
    readonly typeMetadata: TargetClassMetadata;

    #heapObject: HeapObject;

    constructor(readonly handle: NativePointer) {
        super();
        this.#heapObject = new HeapObject(handle);
        this.typeMetadata = this.#heapObject.getMetadata(TargetClassMetadata);
        const klass = Registry.shared()
                .typeByName(this.typeMetadata.getFullTypeName()) as Class;

        for (const method of klass.$methods) {
            switch (method.type) {
                case "Getter": {
                    const parsed = parseSwiftAccessorSignature(method.name);
                    if (parsed === undefined) {
                        break;
                    }

                    const memberType = Registry.shared()
                            .typeByName(parsed.memberTypeName);
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

                    const memberType = Registry.shared()
                            .typeByName(parsed.memberTypeName);
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
                                    Registry.shared().typeByName(parsed.retTypeName);
                    const argTypes = parsed.argTypeNames.map(ty =>
                                Registry.shared().typeByName(ty));
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
