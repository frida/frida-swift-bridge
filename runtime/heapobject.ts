import { OpaqueValue, TargetMetadata } from "../abi/metadata";

type HeapMetadata = TargetMetadata;

/* Defined in stdlib/public/SwiftShims/HeapObject.h */
export class HeapObject {
    static readonly SIZEOF = Process.pointerSize * 2;

    readonly metadata: HeapMetadata;
    readonly refCounts: number;

    constructor(readonly handle: NativePointer) {
    }

    getMetadata<T extends TargetMetadata>(c: new (handle: NativePointer) => T ):
                T {
        return new c(this.handle);
    }
}

export class BoxPair {
    readonly object: HeapObject;
    readonly buffer: OpaqueValue;

    constructor(objAndBuffer: NativePointer[]) {
        this.object = new HeapObject(objAndBuffer[0]);
        this.buffer = objAndBuffer[1];
    }
}
