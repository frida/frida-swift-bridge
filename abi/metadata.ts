/**
 * TODO:
 *  - Use a cleaner property-caching approach
 */

import { ContextDescriptorKind,
         MetadataKind,
         TargetValueWitnessFlags,
         TypeContextDescriptorFlags,
         MethodDescriptorFlags } from "./metadatavalues";
import { RelativeDirectPointer,
         RelativeIndirectablePointer } from "../basic/relativepointer";

export interface TypeLayout {
    size: number,
    stride: number,
    flags: number,
    extraInhabitantCount: number,
}

export class TargetMetadata {
    static readonly OFFSETOF_KIND = 0x0;

    readonly kind: MetadataKind;

    constructor(public readonly handle: NativePointer) {
        this.kind = this.getKind();
    }

    getKind(): MetadataKind {
        return this.handle.add(TargetMetadata.OFFSETOF_KIND).readU32();
    }

    getValueWitnesses(): TargetValueWitnessTable {
        if (this.kind !== MetadataKind.Enum &&
            this.kind !== MetadataKind.Struct) {
            throw new Error(`Kind does not have a VWT: ${this.kind}`);
        }

        const handle = this.handle.sub(Process.pointerSize).readPointer();
        return new TargetValueWitnessTable(handle);
    }

    getTypeLayout(): TypeLayout {
        const valueWitnesses = this.getValueWitnesses();
        return {
            size: valueWitnesses.size,
            stride: valueWitnesses.stride,
            flags: valueWitnesses.flags.data,
            extraInhabitantCount: valueWitnesses.extraInhabitantCount,
        }
    }

    vw_getEnumTag(object: NativePointer): number {
        return this.getValueWitnesses().asEVWT().getEnumTag(object);
    }

    vw_destructiveInjectEnumTag(object: NativePointer, tag: number) {
        return this.getValueWitnesses().asEVWT().destructiveInjectEnumTag(object,
                tag);
    }
}

class TargetValueWitnessTable {
    static readonly OFFSETOF_SIZE = 0x40;
    static readonly OFFSETOF_STRIDE = 0x48;
    static readonly OFFSETOF_FLAGS = 0x50;
    static readonly OFFSETOF_EXTRA_INHABITANT_COUNT = 0x54;

    readonly size: number;
    readonly stride: number;
    readonly flags: TargetValueWitnessFlags;
    readonly extraInhabitantCount: number;

    constructor (protected handle: NativePointer) {
        this.size = this.getSize();
        this.stride = this.getStride();
        this.flags = this.getFlags();
        this.extraInhabitantCount = this.getExtraInhabitantCount();
    }

    getSize(): number {
        return this.handle.add(
            TargetValueWitnessTable.OFFSETOF_SIZE).readU64().toNumber();
    }

    getStride(): number {
		return this.handle.add(
			TargetValueWitnessTable.OFFSETOF_STRIDE).readU64().toNumber();
    }

    getFlags(): TargetValueWitnessFlags {
        const value = this.handle.add(
            TargetValueWitnessTable.OFFSETOF_FLAGS).readU32();
        return new TargetValueWitnessFlags(value);
    }

    getExtraInhabitantCount(): number {
		return this.handle.add(
			TargetValueWitnessTable.OFFSETOF_EXTRA_INHABITANT_COUNT).readU32();
    }

    asEVWT(): EnumValueWitnessTable {
        return new EnumValueWitnessTable(this.handle);
    }
}

/** Implemented in include/Swift/Runtime/Metadata.h */
export class EnumValueWitnessTable extends TargetValueWitnessTable {
    static readonly OFFSETOF_GET_ENUM_TAG = 0x58;
    static readonly OFFSETOF_DESTRUCTIVE_INJECT_ENUM_TAG = 0x68;

    readonly getEnumTag: (object: NativePointer) => number;
    readonly destructiveInjectEnumTag: (object: NativePointer, tag: number) => void;

    constructor(handle: NativePointer) {
        super(handle);

        let pointer = this.handle.add(
            EnumValueWitnessTable.OFFSETOF_GET_ENUM_TAG)
            .readPointer();
        const getEnumTag = new NativeFunction(pointer, "uint32",
                ["pointer", "pointer"]);
        this.getEnumTag = (object) => {
            return getEnumTag(object, this.handle) as number;
        };

        pointer = this.handle.add(
            EnumValueWitnessTable.OFFSETOF_DESTRUCTIVE_INJECT_ENUM_TAG)
            .readPointer();
        const destructiveInjectEnumTag = new NativeFunction(pointer, "void",
                ["pointer", "uint32", "pointer"]);
        this.destructiveInjectEnumTag = (object, tag) => {
            return destructiveInjectEnumTag(object, tag, this.handle);
        };
    }
}

export class TargetContextDescriptor {
    static readonly OFFSETOF_FLAGS = 0x0;
    static readonly OFFSETOF_PARENT = 0x4;

    #flags: ContextDescriptorFlags;
    #parent: RelativeIndirectablePointer;

    constructor(protected handle: NativePointer) { }

    get flags(): ContextDescriptorFlags {
        if (this.#flags != undefined) {
            return this.#flags;
        }

        const value = this.handle.add(TargetContextDescriptor.OFFSETOF_FLAGS)
            .readU32();
        return new ContextDescriptorFlags(value);
    }

    get parent(): RelativeIndirectablePointer {
        if (this.#parent !== undefined) {
            return this.#parent;
        }

        this.#parent = RelativeIndirectablePointer.From(
            this.handle.add(TargetContextDescriptor.OFFSETOF_PARENT));
        return this.#parent;
    }

    isGeneric(): boolean {
        return this.flags.isGeneric();
    }

    getKind(): ContextDescriptorKind {
        return this.flags.getKind();
    }

    getModuleContext(): TargetModuleContextDescriptor {
        let m = new TargetModuleContextDescriptor(this.parent.get());

        while (m.flags.getKind() !== ContextDescriptorKind.Module) {
            m = new TargetModuleContextDescriptor(m.parent.get());
        }

        return m;
    }
}

export class TargetModuleContextDescriptor extends TargetContextDescriptor {
    private static OFFSETOF_NAME = 0x8;

    #name: string;

    get name(): string {
        if (this.#name !== undefined) {
            return this.#name;
        }

        const relPtr = this.handle.add(
            TargetModuleContextDescriptor.OFFSETOF_NAME);
        const absPtr = RelativeDirectPointer.From(relPtr).get();

        this.#name = absPtr.readCString();
        return this.#name;
    }
}

export class TargetTypeContextDescriptor extends TargetContextDescriptor {
    static readonly OFFSETOF_NAME = 0x8;
    static readonly OFFSETOF_ACCESS_FUNCTION_PTR = 0xC;
    static readonly OFFSETOF_FIELDS = 0x10;

    #name: string | undefined;
    #accessFunctionPtr: NativePointer;
    #fields: RelativeDirectPointer;

    getTypeContextDescriptorFlags(): number {
        return this.flags.getKindSpecificFlags();
    }

    get name(): string {
        if (this.#name !== undefined) {
            return this.#name;
        }

        const namePtr = RelativeDirectPointer.From(this.handle.add(
            TargetTypeContextDescriptor.OFFSETOF_NAME)).get();
        return namePtr.readUtf8String();
    }

    get accessFunctionPointer(): NativePointer {
        if (this.#accessFunctionPtr !== undefined) {
            return this.#accessFunctionPtr;
        }

        return RelativeDirectPointer.From(this.handle.add(
            TargetTypeContextDescriptor.OFFSETOF_ACCESS_FUNCTION_PTR)).get();
    }

    get fields(): RelativeDirectPointer {
        if (this.#fields !== undefined) {
            return this.#fields;
        }

        return RelativeDirectPointer.From(this.handle.add(
            TargetTypeContextDescriptor.OFFSETOF_FIELDS));
    }

    isReflectable(): boolean {
        return this.fields !== null;
    }

    getAccessFunction(): NativeFunction {
        return new NativeFunction(this.accessFunctionPointer, "pointer", []);
    }
}

export class TargetClassDescriptor extends TargetTypeContextDescriptor {
    static readonly OFFSETOF_TARGET_VTABLE_DESCRIPTOR_HEADER = 0x2C;
    static readonly OFFSETOF_METHOD_DESCRIPTORS = 0x34;

    hasVTable(): boolean {
        return !!(this.getTypeContextDescriptorFlags() &
            (1 << TypeContextDescriptorFlags.Class_HasVTable));
    }

    getVTableDescriptor(): VTableDescriptorHeader {
        if (!this.hasVTable()) {
            return null;
        }

        const pointer = this.handle.add(
            TargetClassDescriptor.OFFSETOF_TARGET_VTABLE_DESCRIPTOR_HEADER);
        const vtableHeader = new VTableDescriptorHeader(pointer);
        return vtableHeader;
    }

    getMethodDescriptors(): TargetMethodDescriptor[] {
        const result: TargetMethodDescriptor[] = [];

        /** TODO: handle generic classes properly, we're skipping them for now.
         */
        if (!this.hasVTable() || this.isGeneric()) {
            return result;
        }

        const vtableSize = this.getVTableDescriptor().vtableSize;
        let i = this.handle.add(
            TargetClassDescriptor.OFFSETOF_METHOD_DESCRIPTORS);
        const end = i.add(vtableSize * TargetMethodDescriptor.sizeof);

        for (; !i.equals(end); i = i.add(TargetMethodDescriptor.sizeof)) {
            const methodDescriptor = new TargetMethodDescriptor(i);

            /* TODO: figure out what the flags signify in this case */
            if (methodDescriptor.impl === null) {
                continue;
            }

            result.push(methodDescriptor);
        }

        return result;
    }
}

class VTableDescriptorHeader {
    static readonly OFFSETOF_VTABLE_OFFSET = 0x0;
    static readonly OFFSETOF_VTABLE_SIZE = 0x4;

    #vtableSize: number | undefined;

    constructor(private handle: NativePointer) {
    }

    get vtableSize(): number {
        if (this.#vtableSize !== undefined) {
            return this.#vtableSize;
        }

        return this.handle.add(VTableDescriptorHeader.OFFSETOF_VTABLE_SIZE)
            .readU32();
    }
}

class TargetMethodDescriptor {
    static readonly OFFSETOF_FLAGS = 0x0;
    static readonly OFFSETOF_IMPL = 0x4;
    static sizeof = 8;

    #flags: MethodDescriptorFlags;
    #impl: RelativeDirectPointer;

    constructor(private handle: NativePointer) {
    }

    get flags(): MethodDescriptorFlags {
        if (this.#flags !== undefined) {
            return this.#flags;
        }

        const value = this.handle.add(TargetMethodDescriptor.OFFSETOF_FLAGS)
            .readU32();
        return new MethodDescriptorFlags(value);
    }

    get impl(): RelativeDirectPointer {
        if (this.#impl !== undefined) {
            return this.#impl;
        }

        const pointer = this.handle.add(TargetMethodDescriptor.OFFSETOF_IMPL);
        return RelativeDirectPointer.From(pointer);
    }
}

export class TargetStructDescriptor extends TargetTypeContextDescriptor {
    static readonly OFFSETOF_NUM_FIELDS = 0x18;
    static readonly OFFSETOF_FIELD_OFFSET_VECTOR_OFFSET = 0x1C;

    #numFields: number | undefined;
    #fieldOffsetVectorOffset: number | undefined;

    hasFieldOffsetVector(): boolean {
        return this.fieldOffsetVectorOffset !== 0;
    }

    get numFields(): number {
        if (this.#numFields !== undefined) {
            return this.#numFields;
        }

        return this.handle.add(TargetStructDescriptor.OFFSETOF_NUM_FIELDS)
            .readU32();
    }

    get fieldOffsetVectorOffset(): number {
        if (this.#fieldOffsetVectorOffset !== undefined) {
            return this.#fieldOffsetVectorOffset;
        }

        return this.handle.add(
            TargetStructDescriptor.OFFSETOF_FIELD_OFFSET_VECTOR_OFFSET).readU32();
    }
}

export class TargetEnumDescriptor extends TargetTypeContextDescriptor {
}

export class TargetProtocolDescriptor extends TargetContextDescriptor {
    static readonly OFFSETOF_NAME = 0x8;
    static readonly OFFSETOF_NUM_REQUIREMENTS = 0x10;

    #name: string;
    #numRequirements: number;

    constructor(handle: NativePointer) {
        super(handle);
    }

    get name(): string {
        if (this.#name === undefined) {
            const pointer = RelativeDirectPointer.From(
                this.handle.add(TargetProtocolDescriptor.OFFSETOF_NAME)).get();
            this.#name = pointer.readCString();
        }

        return this.#name;
    }

    get numRequirements(): number {
        if (this.#numRequirements === undefined) {
            const pointer = this.handle.add(
                TargetProtocolDescriptor.OFFSETOF_NUM_REQUIREMENTS);
            this.#numRequirements = pointer.readU32();
        }

        return this.#numRequirements;
    }
}

export interface FieldDetails {
    name: string;
    type?: string;
    isVar?: boolean;
}

class ContextDescriptorFlags {
    constructor (public readonly value: number) {
    }

    getKind(): ContextDescriptorKind {
        return this.value & 0x1F;
    }

    isGeneric(): boolean {
        return (this.value & 0x80) !== 0;
    }

    getIntValue(): number {
        return this.value;
    }

    getKindSpecificFlags(): number {
        return (this.value >>> 16) & 0xFFFF;
    }
}
