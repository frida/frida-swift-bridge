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
    constructor(private type: Enum, readonly tag: number) { }

    equals(e: EnumValue) {
        return this.tag === e.tag;
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
