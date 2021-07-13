/**
 * TODO:
 *  - Replace Struct with a ValueType in the constructor / factory
 */

import { Type } from "./types";

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

export class Instance implements ObjectWrapper {
    constructor(readonly handle: NativePointer) { }

    toJSON() {
        return {
            handle: this.handle,
        }
    }
}
