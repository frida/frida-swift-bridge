export class RelativePointer {
    static resolveFrom(pointer: NativePointer): NativePointer {
        return pointer.add(pointer.readS32());
    }
}
