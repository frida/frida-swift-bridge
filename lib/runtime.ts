/**
 * TODO:
 *  - Replace Struct with a ValueType in the constructor / factory
 *  - Pretty print enum values
 */

import { Enum, Type } from "./types";

export class Value implements ObjectWrapper {
    readonly handle: NativePointer;

    constructor(readonly type: Type, readonly buffer: ArrayBuffer) {
        this.handle = buffer.unwrap();
    }

    toJSON() {
        return {
            handle: this.handle,
        };
    }
}

export class EnumValue {
    private constructor(readonly tag?: number,
                        readonly payload?: Value) { }

    static withTag(tag: number) {
        return new EnumValue(tag);
    }

    static withPayload(payload: Value) {
        return new EnumValue(undefined, payload);
    }

    equals(e: EnumValue) {
        if (this.tag !== undefined && e.tag !== undefined) {
            return this.tag === e.tag;
        }

        if (this.payload !== undefined && e.payload !== undefined) {
            /* TODO: handle value type equality properly */
            return this.payload.handle.equals(this.payload.handle);
        }

        return false;
    }
}

export class Instance implements ObjectWrapper {
    constructor(readonly handle: NativePointer) { }

    toJSON() {
        return {
            handle: this.handle,
        }
    }
}
