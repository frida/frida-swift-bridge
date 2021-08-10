/**
 * TODO:
 *  - Use a common generic base class for struct and enum values?
 *  - Replace Struct with a ValueType in the constructor / factory
 *  - Pretty print enum values
 *  - Parse struct fields and map Builtin Swift types to JS ones
 */

import { Registry } from "./registry";
import { Enum, Struct, Type, ValueType } from "./types";

export type SwiftValue = ObjectInstance | RuntimeValue;

export interface RuntimeValue {
    type: ValueType;
    handle: NativePointer;

    equals(other: RuntimeValue): boolean;
    toJSON(): any;
}

export function makeRuntimeValue(type: ValueType, handle: NativePointer): RuntimeValue {
    if (type.kind === "Struct") {
        return new StructValue(type as Struct, handle);
    } else if (type.kind === "Enum") {
        return new EnumValue(type as Enum, handle);
    } else {
        throw new Error("Not a value type");
    }
}

export class StructValue implements RuntimeValue {
    constructor(readonly type: Struct, readonly handle: NativePointer) {
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

export class EnumValue implements RuntimeValue {
    #tag: number;
    #payload: SwiftValue;

    constructor(readonly type: Enum, readonly handle: NativePointer) {
        const tag = this.type.metadata.vw_getEnumTag(handle);
        let payload: RuntimeValue;

        if (tag - this.type.payloadCases.length >= this.type.emptyCases.length) {
            throw new Error("Invalid pointer for an enum of this type");
        }

        if (this.isPayloadTag(tag)) {
            const typeName = this.type.payloadCases[tag].typeName;
            const type = Registry.shared().typeByName(typeName);
            payload = makeRuntimeValue(type as ValueType, handle);
        }

        this.#tag = tag;
        this.#payload = payload;
    }

    setContent(tag: number, payload?: SwiftValue) {
        if (tag - this.type.payloadCases.length >= this.type.emptyCases.length) {
            throw new Error("Invalid tag for an enum of this type");
        }

        if (this.isPayloadTag(tag)) {
            if (payload instanceof ObjectInstance) {
                Memory.copy(this.handle, payload.handle, Process.pointerSize);
                this.#payload = payload;
            } else {
                const typeName = this.type.payloadCases[tag].typeName;
                const type = Registry.shared().typeByName(typeName) as ValueType;

                if (payload.type.name !== type.name) {
                    throw new Error("Payload must be of type " + typeName);
                }

                this.#payload = type.makeValueFromRaw(this.handle);
                type.copy(this.#payload as RuntimeValue, payload);
            }
        }

        this.type.metadata.vw_destructiveInjectEnumTag(this.handle, tag);
        this.#tag = tag;
    }

    get tag(): number {
        return this.#tag;
    }

    get payload(): SwiftValue {
        return this.#payload;
    }

    equals(e: EnumValue) {
        let result = false;

        if (this.tag !== undefined && e.tag !== undefined) {
            result = this.tag === e.tag;
        }

        if (this.payload !== undefined && e.payload !== undefined) {
            /* TODO: handle value type equality properly */
            result &&= this.payload.handle.equals(e.payload.handle);
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

    private isPayloadTag(tag: number) {
        return tag < this.type.payloadCases.length;
    }
}

export class ObjectInstance implements ObjectWrapper {
    constructor(readonly handle: NativePointer) { }

    toJSON() {
        return {
            handle: this.handle,
        }
    }
}
