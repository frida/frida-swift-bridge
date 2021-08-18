import { OpaqueValue,
         TargetClassMetadata,
         TargetMetadata,
         TargetValueBuffer,
         TargetValueMetadata } from "../abi/metadata";
import { HeapObject } from "./heapobject";

export class TargetOpaqueExistentialContainer {
    static readonly INITIAL_SIZE = 4 * Process.pointerSize;
    static readonly OFFSETOF = {
        buffer: 0,
        type: Process.pointerSize * 3,
        wintessTable: Process.pointerSize * 4
    };

    #buffer: TargetValueBuffer;
    #type: TargetMetadata;

    private constructor(readonly handle: NativePointer, private numWitnessTables) {
    }

    static alloc(numWitnessTables: number): TargetOpaqueExistentialContainer {
        const size = TargetOpaqueExistentialContainer.INITIAL_SIZE +
                     numWitnessTables * Process.pointerSize;
        const buf = Memory.alloc(size);
        return new TargetOpaqueExistentialContainer(buf, numWitnessTables);
    }

    static makeFromRaw(handle: NativePointer, numWitnessTables: number):
            TargetOpaqueExistentialContainer {
        const container = new TargetOpaqueExistentialContainer(handle,
                numWitnessTables);

        const metadataPtr = handle.add(
                TargetOpaqueExistentialContainer.OFFSETOF.type).readPointer();
        const tmpMetadata = new TargetValueMetadata(metadataPtr);
        container.#type = tmpMetadata.isClassObject() ?
                          new TargetClassMetadata(metadataPtr) :
                          tmpMetadata;

        return container;
    }

    set type(metadata: TargetMetadata) {
        this.handle.add(TargetOpaqueExistentialContainer.OFFSETOF.type)
                .writePointer(metadata.handle);
        this.#type = metadata;
    }

    get buffer(): TargetValueBuffer {
        if (this.#buffer === undefined) {
            this.#buffer = new TargetValueBuffer(this.handle);
        }

        return this.#buffer;
    }

    get type(): TargetMetadata {
        return this.#type;
    }

    getWitnessTables(): NativePointer {
        return this.handle.add(
                TargetOpaqueExistentialContainer.OFFSETOF.wintessTable);
    }

    isValueInline(): boolean {
        return this.type.getValueWitnesses().isValueInline();
    }

    projectValue(): OpaqueValue {
        const vwt = this.type.getValueWitnesses();

        if (vwt.isValueInline()) {
            return this.buffer.privateData;
        }

        const heapObject = this.buffer.privateData.readPointer();
        const alignMask = vwt.getAlignmentMask();
        const byteOffset = (HeapObject.SIZEOF + alignMask) & ~alignMask;
        return heapObject.add(byteOffset);
    }

    get sizeof() {
        return TargetOpaqueExistentialContainer.INITIAL_SIZE +
               this.numWitnessTables * Process.pointerSize;
    }
}

/* FIXME: prefix name with 'Target' */
export class ClassExistentialContainer {
    static readonly INITIAL_SIZE = Process.pointerSize;
    static readonly OFFSETOF = {
        value: 0,
        witnessTables: Process.pointerSize
    };

    #value: NativePointer;

    constructor(readonly handle: NativePointer, private numWitnessTables:number) {
    }

    static alloc(numWitnessTables: number): ClassExistentialContainer {
        const size = ClassExistentialContainer.INITIAL_SIZE +
                     numWitnessTables * Process.pointerSize;
        const buf = Memory.alloc(size);
        return new ClassExistentialContainer(buf, numWitnessTables);
    }

    static makeFromRaw(handle: NativePointer, numWitnessTables: number) {
        const container = new ClassExistentialContainer(handle,
                numWitnessTables);
        container.#value = handle.add(ClassExistentialContainer.OFFSETOF.value)
                .readPointer();

        return container;
    }

    get value(): NativePointer {
        return this.#value;
    }

    set value(newValue: NativePointer) {
        this.handle.add(ClassExistentialContainer.OFFSETOF.value)
                .writePointer(newValue);
        this.#value = newValue;
    }

    getWitnessTables(): NativePointer {
        return this.handle.add(ClassExistentialContainer.OFFSETOF.witnessTables);
    }

    get sizeof() {
        return ClassExistentialContainer.INITIAL_SIZE +
               this.numWitnessTables * Process.pointerSize;
    }
}
