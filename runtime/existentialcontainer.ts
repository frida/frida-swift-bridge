import { OpaqueValue,
         TargetClassMetadata,
         TargetMetadata,
         TargetValueBuffer,
         TargetValueMetadata } from "../abi/metadata";
import { HeapObject } from "./heapobject";

export class TargetOpaqueExistentialContainer {
    static readonly SIZEOF = 5 * Process.pointerSize;
    static readonly OFFSETOF = {
        buffer: 0x0,
        type: Process.pointerSize * 3,
        wintessTable: Process.pointerSize * 4
    };

    #buffer: TargetValueBuffer;
    #type: TargetMetadata;

    private constructor(readonly handle: NativePointer) {
    }

    static alloc(): TargetOpaqueExistentialContainer {
        const buf = Memory.alloc(TargetOpaqueExistentialContainer.SIZEOF);
        return new TargetOpaqueExistentialContainer(buf)
    }

    static makeFromRaw(handle: NativePointer): TargetOpaqueExistentialContainer {
        const container = new TargetOpaqueExistentialContainer(handle);

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

    /* TODO: What if it's multiple witness tables? */
    getWitnessTables(): NativePointer {
        return this.handle.add(Process.pointerSize * 2);
    }

    setWitnessTable(handle: NativePointer) {
        this.handle.add(TargetOpaqueExistentialContainer.OFFSETOF.wintessTable)
                .writePointer(handle);
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
}
