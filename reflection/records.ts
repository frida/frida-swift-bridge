import { RelativePointer } from "../lib/helpers";

export class FieldDescriptor {
    static readonly SIZE = 16;
    static readonly OFFSETOF_NUMFIELDS = 0x0C;

    #numFields: number;

    constructor(private handle: NativePointer) {
    }

    getFieldRecordBuffer(): NativePointer {
        return this.handle.add(FieldDescriptor.SIZE);
    }

    get numFields(): number {
        if (this.#numFields !== undefined) {
            return this.#numFields;
        }

        this.#numFields = this.handle.add(
            FieldDescriptor.OFFSETOF_NUMFIELDS).readU32();
        return this.#numFields;
    }

    getFields(): FieldRecord[] {
        const result: FieldRecord[] = [];
        let cursor = this.getFieldRecordBuffer();
        let record: FieldRecord;

        for (let i = 0; i < this.numFields; i++) {
            record = new FieldRecord(cursor);
            result.push(record);
            cursor = cursor.add(FieldRecord.SIZE);
        }

        return result;
    }
}

class FieldRecord {
    static readonly SIZE = 12;
    static readonly OFFSETOF_FLAGS = 0x0;
    static readonly OFFSETOF_MANGLED_TYPE_NAME = 0x4;
    static readonly OFFSETOF_FIELD_NAME = 0x8;

    #flags: number;
    #mangledTypeName: NativePointer;
    #fieldName: string;

    constructor(private handle: NativePointer) {
    }

    get flags(): number {
        if (this.#flags !== undefined) {
            return this.#flags;
        }

        this.#flags = this.handle.add(FieldRecord.OFFSETOF_FLAGS).readU32();
        return this.#flags;
    }

    get mangledTypeName(): NativePointer {
        if (this.#mangledTypeName !== undefined) {
            return this.#mangledTypeName;
        }

        this.#mangledTypeName = RelativePointer.resolveFrom(
            this.handle.add(FieldRecord.OFFSETOF_MANGLED_TYPE_NAME));
        return this.#mangledTypeName;
    }

    get fieldName(): string {
        if (this.#fieldName !== undefined) {
            return this.#fieldName;
        }

        this.#fieldName = RelativePointer.resolveFrom(
            this.handle.add(FieldRecord.OFFSETOF_FIELD_NAME)).readUtf8String();
        return this.#fieldName;
    }

    get isIndirectCase(): boolean {
        return !!(this.flags & FieldRecordFlags.IsIndirectCase);
    }

    get isVar(): boolean {
        return !!(this.flags & FieldRecordFlags.IsVar);
    }
}

enum FieldRecordFlags {
    IsIndirectCase = 0x1,
    IsVar = 0x2,
}