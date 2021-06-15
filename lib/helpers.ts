export class RelativePointer {
    static resolveFrom(pointer: NativePointer): NativePointer {
        const value = pointer.readS32();
        if (value === 0) {
            return null;
        }
        return pointer.add(value);
    }
}
