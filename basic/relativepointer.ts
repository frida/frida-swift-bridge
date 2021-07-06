/**
 * TODO:
 * 	- Handle PAC pointers
 */

export class RelativeDirectPointer {
	static From (handle: NativePointer) {
		const offset = handle.readS32();

		return offset === 0 ?
			   null :
			   new RelativeDirectPointer(handle, offset);
	}

	constructor(private handle: NativePointer, private offset: number) { }

	get(): NativePointer {
		return this.handle.add(this.offset);
	}
}

export class RelativeIndirectablePointer {
	static From (handle: NativePointer) {
		const offset = handle.readS32();

		return offset === 0 ?
			   null :
			   new RelativeIndirectablePointer(handle, offset);
	}

	constructor(private handle: NativePointer, private offset: number) { }

	get(): NativePointer {
		const address = this.handle.add(this.offset & ~1);

		if (this.offset & 1) {
			return address.readPointer();
		} else {
			return address;
		}
	}
}
