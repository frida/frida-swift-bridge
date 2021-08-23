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
