/**
 * TODO:
 *  - Replace Struct with a ValueType in the constructor / factory
 *  - Pretty print enum values
 *  - Parse struct fields and map Builtin Swift types to JS ones
 */

import { Enum, Type } from "./types";

export class Value implements ObjectWrapper {

    constructor(readonly type: Type, readonly handle: NativePointer) { }

    toJSON() {
        return {
            handle: this.handle,
        };
    }
}

export class EnumValue {
    constructor(readonly tag: number, readonly payload?: Value) { }

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
