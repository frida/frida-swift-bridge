export type PointerSized = UInt64 | NativePointer | number;
export type RawFields = PointerSized[];

export function makeBufferFromValue(fields: RawFields): NativePointer {
    if (!Array.isArray(fields)) {
        fields = [fields];
    }

    const size = Process.pointerSize * fields.length;
    const buffer = Memory.alloc(size);

    for (let i = 0, offset = 0; offset < size; i++, offset += Process.pointerSize) {
        const field = fields[i];
        const target = buffer.add(offset);

        if (field instanceof NativePointer) {
            target.writePointer(field);
        } else {
            target.writeU64(field);
        }
    }

    return buffer;
}

export function makeValueFromBuffer(buffer: NativePointer, lengthInBytes: number): UInt64[] {
    const result: UInt64[] = [];

    /* XXX: Assume only buffer sizes that are multiples of 8 for now  */
    for (let i = 0; i < lengthInBytes; i += 8) {
        result.push(buffer.add(i).readU64());
    }

    return result;
}

export function moveValueToBuffer(fields: UInt64[], buffer: NativePointer) {
    const size =  Process.pointerSize * fields.length;

    for (let i = 0, offset = 0; offset < size; i++, offset += Process.pointerSize) {
        buffer.add(offset).writeU64(fields[i]);
    }
}

export function sizeInQWordsRounded(stride: number) {
    stride = stride < 8 ? 8 : stride;
    return stride / 8;
}