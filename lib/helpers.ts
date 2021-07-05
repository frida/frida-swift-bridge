export class RelativePointer {
    /**
     * TODO:
     *  - Use helper function instead of class-static one
     */
    static resolveFrom(pointer: NativePointer): NativePointer {
        const value = pointer.readS32();
        if (value === 0) {
            return null;
        }
        return pointer.add(value);
    }
}

export function makeUnenumerable(target: any, propertyKey: string) {
    let descriptor = Object.getOwnPropertyDescriptor(target, propertyKey) || {};

    if (descriptor.enumerable !== false) {
        descriptor.enumerable = false;
        descriptor.writable = true;
        Object.defineProperty(target, propertyKey, descriptor)
    }
}