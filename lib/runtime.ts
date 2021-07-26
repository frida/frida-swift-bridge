/**
 * TODO:
 *  - Replace Struct with a ValueType in the constructor / factory
 *  - Pretty print enum values
 */

import { Enum, EnumTagGetterFunction, Type } from "./types";

export class Value implements ObjectWrapper {
    readonly handle: NativePointer;

    constructor(readonly type: Type, readonly buffer: ArrayBuffer) {
        /** TODO: investigate V8 crash happening here */
        this.handle = buffer.unwrap();
    }

    toJSON() {
        return {
            handle: this.handle,
        };
    }
}

export class EnumValue extends Value {
    constructor(type: Enum, buffer: ArrayBuffer,
                private readonly tagGetter: EnumTagGetterFunction) {
        super(type, buffer);
    }

    private getTag(): number {
        return this.tagGetter();
    }

    equals(e: EnumValue) {
        return this.getTag() === e.getTag();
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
