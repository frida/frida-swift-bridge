/**
 * TODO:
 *  - Implement TargetProtocolRequirement
 *  - Implement TargetEnumDescriptor
 *  - Use a cleaner property-caching approach
 */

import {
    ContextDescriptorKind,
    MetadataKind,
    TargetValueWitnessFlags,
    TypeContextDescriptorFlags,
    MethodDescriptorFlags,
    TypeReferenceKind,
    ConformanceFlags,
    getEnumeratedMetadataKind,
    ProtocolContextDescriptorFlags,
} from "./metadatavalues";
import {
    RelativeDirectPointer,
    RelativeIndirectablePointer,
} from "../basic/relativepointer";
import { BoxPair } from "../runtime/heapobject";
import { getApi } from "../lib/api";

export type OpaqueValue = NativePointer;

export interface TypeLayout {
    size: number;
    stride: number;
    flags: number;
    extraInhabitantCount: number;
}

export class TargetValueBuffer {
    constructor(readonly privateData: NativePointer) {}
}

type ValueBuffer = TargetValueBuffer;

export abstract class TargetMetadata {
    static readonly OFFSETOF_KIND = 0x0;

    #kind: MetadataKind;

    constructor(public readonly handle: NativePointer) {
        this.#kind = this.handle.add(TargetMetadata.OFFSETOF_KIND).readU32();
    }

    getKind(): MetadataKind {
        return getEnumeratedMetadataKind(this.#kind);
    }

    isClassObject(): boolean {
        return this.getKind() == MetadataKind.Class;
    }

    getValueWitnesses(): TargetValueWitnessTable {
        const kind = this.getKind();

        if (kind !== MetadataKind.Enum && kind !== MetadataKind.Struct) {
            throw new Error(`Kind does not have a VWT: ${kind}`);
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
        };
    }

    vw_initializeWithCopy(
        dest: NativePointer,
        src: NativePointer
    ): NativePointer {
        return this.getValueWitnesses().initializeWithCopy(
            dest,
            src,
            this.handle
        );
    }

    vw_getEnumTag(object: NativePointer): number {
        return this.getValueWitnesses().asEVWT().getEnumTag(object);
    }

    vw_destructiveInjectEnumTag(object: NativePointer, tag: number) {
        return this.getValueWitnesses()
            .asEVWT()
            .destructiveInjectEnumTag(object, tag);
    }

    abstract getDescription(): TargetTypeContextDescriptor;

    allocateBoxForExistentialIn(buffer: ValueBuffer): OpaqueValue {
        const vwt = this.getValueWitnesses();

        if (vwt.isValueInline()) {
            return buffer.privateData;
        }

        const api = getApi();
        const refAndValue = new BoxPair(api.swift_allocBox(this.handle));
        buffer.privateData.writePointer(refAndValue.object.handle);
        return refAndValue.buffer;
    }

    getFullTypeName(): string {
        return this.getDescription().getFullTypeName();
    }

    static from(handle: NativePointer): TargetMetadata {
        const tmp = new TargetValueMetadata(handle);

        switch (tmp.getKind()) {
            case MetadataKind.Class:
                return new TargetClassMetadata(handle);
            case MetadataKind.Struct:
                return new TargetStructMetadata(handle);
            case MetadataKind.Enum:
                return new TargetEnumMetadata(handle);
            default:
                throw new Error("Unknown metadata kind");
        }
    }

    toJSON() {
        return {
            handle: this.handle,
            name: this.getFullTypeName(),
        };
    }
}

export class TargetValueMetadata extends TargetMetadata {
    static readonly OFFSETOF_DESCRIPTION = Process.pointerSize;

    #description: NativePointer;

    get description(): NativePointer {
        if (this.#description === undefined) {
            this.#description = this.handle
                .add(TargetValueMetadata.OFFSETOF_DESCRIPTION)
                .readPointer();
        }

        return this.#description;
    }

    getDescription(): TargetValueTypeDescriptor {
        return new TargetValueTypeDescriptor(this.description);
    }
}

export class TargetClassMetadata extends TargetMetadata {
    static readonly OFFSTETOF_DESCRIPTION = Process.pointerSize * 8;

    #description: NativePointer;

    get description(): NativePointer {
        if (this.#description === undefined) {
            this.#description = this.handle
                .add(TargetClassMetadata.OFFSTETOF_DESCRIPTION)
                .readPointer();
        }

        return this.#description;
    }

    getDescription(): TargetClassDescriptor {
        return new TargetClassDescriptor(this.description);
    }
}

export class TargetStructMetadata extends TargetValueMetadata {
    getDescription(): TargetStructDescriptor {
        return new TargetStructDescriptor(this.description);
    }
}

export class TargetEnumMetadata extends TargetValueMetadata {
    getDescription(): TargetEnumDescriptor {
        return new TargetEnumDescriptor(this.description);
    }
}

class TargetValueWitnessTable {
    static readonly OFFSETOF_INTIALIZE_WITH_COPY = 0x10;
    static readonly OFFSETOF_SIZE = 0x40;
    static readonly OFFSETOF_STRIDE = 0x48;
    static readonly OFFSETOF_FLAGS = 0x50;
    static readonly OFFSETOF_EXTRA_INHABITANT_COUNT = 0x54;

    readonly initializeWithCopy: (
        dest: NativePointer,
        src: NativePointer,
        self: NativePointer
    ) => NativePointer;
    readonly size: number;
    readonly stride: number;
    readonly flags: TargetValueWitnessFlags;
    readonly extraInhabitantCount: number;

    constructor(protected handle: NativePointer) {
        const ptrInitializeWithCopy = this.handle
            .add(TargetValueWitnessTable.OFFSETOF_INTIALIZE_WITH_COPY)
            .readPointer();
        const initializeWithCopy = new NativeFunction(
            ptrInitializeWithCopy,
            "pointer",
            ["pointer", "pointer", "pointer"]
        );
        this.initializeWithCopy = (dest, src, self) => {
            return initializeWithCopy(dest, src, self) as NativePointer;
        };

        this.size = this.getSize();
        this.stride = this.getStride();
        this.flags = this.getFlags();
        this.extraInhabitantCount = this.getExtraInhabitantCount();
    }

    isValueInline(): boolean {
        return this.flags.isInlineStorage;
    }

    getSize(): number {
        return this.handle
            .add(TargetValueWitnessTable.OFFSETOF_SIZE)
            .readU64()
            .toNumber();
    }

    getStride(): number {
        return this.handle
            .add(TargetValueWitnessTable.OFFSETOF_STRIDE)
            .readU64()
            .toNumber();
    }

    getAlignmentMask(): number {
        return this.flags.getAlignmentMask();
    }

    getFlags(): TargetValueWitnessFlags {
        const value = this.handle
            .add(TargetValueWitnessTable.OFFSETOF_FLAGS)
            .readU32();
        return new TargetValueWitnessFlags(value);
    }

    getExtraInhabitantCount(): number {
        return this.handle
            .add(TargetValueWitnessTable.OFFSETOF_EXTRA_INHABITANT_COUNT)
            .readU32();
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
    readonly destructiveInjectEnumTag: (
        object: NativePointer,
        tag: number
    ) => void;

    constructor(handle: NativePointer) {
        super(handle);

        let pointer = this.handle
            .add(EnumValueWitnessTable.OFFSETOF_GET_ENUM_TAG)
            .readPointer();
        const getEnumTag = new NativeFunction(pointer, "uint32", [
            "pointer",
            "pointer",
        ]);
        this.getEnumTag = (object) => {
            return getEnumTag(object, this.handle) as number;
        };

        pointer = this.handle
            .add(EnumValueWitnessTable.OFFSETOF_DESTRUCTIVE_INJECT_ENUM_TAG)
            .readPointer();
        const destructiveInjectEnumTag = new NativeFunction(pointer, "void", [
            "pointer",
            "uint32",
            "pointer",
        ]);
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

    constructor(readonly handle: NativePointer) {}

    get flags(): ContextDescriptorFlags {
        if (this.#flags != undefined) {
            return this.#flags;
        }

        const value = this.handle
            .add(TargetContextDescriptor.OFFSETOF_FLAGS)
            .readU32();
        return new ContextDescriptorFlags(value);
    }

    get parent(): RelativeIndirectablePointer {
        if (this.#parent !== undefined) {
            return this.#parent;
        }

        this.#parent = RelativeIndirectablePointer.From(
            this.handle.add(TargetContextDescriptor.OFFSETOF_PARENT)
        );
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
            TargetModuleContextDescriptor.OFFSETOF_NAME
        );
        const absPtr = RelativeDirectPointer.From(relPtr).get();

        this.#name = absPtr.readCString();
        return this.#name;
    }
}

export class TargetTypeContextDescriptor extends TargetContextDescriptor {
    static readonly OFFSETOF_NAME = 0x8;
    static readonly OFFSETOF_ACCESS_FUNCTION_PTR = 0xc;
    static readonly OFFSETOF_FIELDS = 0x10;

    #name: string | undefined;
    #accessFunctionPtr: NativePointer;
    #fields: RelativeDirectPointer;

    getTypeContextDescriptorFlags(): TypeContextDescriptorFlags {
        return new TypeContextDescriptorFlags(
            this.flags.getKindSpecificFlags()
        );
    }

    get name(): string {
        if (this.#name !== undefined) {
            return this.#name;
        }

        const namePtr = RelativeDirectPointer.From(
            this.handle.add(TargetTypeContextDescriptor.OFFSETOF_NAME)
        ).get();
        this.#name = namePtr.readUtf8String();
        return this.#name;
    }

    get accessFunctionPointer(): NativePointer {
        if (this.#accessFunctionPtr !== undefined) {
            return this.#accessFunctionPtr;
        }

        return RelativeDirectPointer.From(
            this.handle.add(
                TargetTypeContextDescriptor.OFFSETOF_ACCESS_FUNCTION_PTR
            )
        ).get();
    }

    get fields(): RelativeDirectPointer {
        if (this.#fields !== undefined) {
            return this.#fields;
        }

        return RelativeDirectPointer.From(
            this.handle.add(TargetTypeContextDescriptor.OFFSETOF_FIELDS)
        );
    }

    isReflectable(): boolean {
        return this.fields !== null;
    }

    getAccessFunction(): NativeFunction {
        return new NativeFunction(this.accessFunctionPointer, "pointer", []);
    }

    /* XXX: not in the original source */
    getFullTypeName(): string {
        return `${this.getModuleContext().name}.${this.name}`;
    }
}

class TargetValueTypeDescriptor extends TargetTypeContextDescriptor {}

export class TargetClassDescriptor extends TargetTypeContextDescriptor {
    static readonly OFFSETOF_TARGET_VTABLE_DESCRIPTOR_HEADER = 0x2c;
    static readonly OFFSETOF_METHOD_DESCRIPTORS = 0x34;

    hasVTable() {
        return this.getTypeContextDescriptorFlags().class_hasVTable();
    }

    hasResilientSuperClass() {
        return this.getTypeContextDescriptorFlags().class_hasResilientSuperClass();
    }

    getVTableDescriptor(): VTableDescriptorHeader {
        if (!this.hasVTable()) {
            return null;
        }

        const pointer = this.handle.add(
            TargetClassDescriptor.OFFSETOF_TARGET_VTABLE_DESCRIPTOR_HEADER
        );
        const vtableHeader = new VTableDescriptorHeader(pointer);
        return vtableHeader;
    }

    getMethodDescriptors(): TargetMethodDescriptor[] {
        const result: TargetMethodDescriptor[] = [];

        /** TODO:
         * - Handle generic classes properly, we're skipping them for now.
         * - Handle classes with a resilient superclass
         */
        if (
            !this.hasVTable() ||
            this.isGeneric() ||
            this.hasResilientSuperClass()
        ) {
            return result;
        }

        const vtableSize = this.getVTableDescriptor().vtableSize;
        let i = this.handle.add(
            TargetClassDescriptor.OFFSETOF_METHOD_DESCRIPTORS
        );
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

    constructor(private handle: NativePointer) {}

    get vtableSize(): number {
        if (this.#vtableSize !== undefined) {
            return this.#vtableSize;
        }

        return this.handle
            .add(VTableDescriptorHeader.OFFSETOF_VTABLE_SIZE)
            .readU32();
    }
}

class TargetMethodDescriptor {
    static readonly OFFSETOF_FLAGS = 0x0;
    static readonly OFFSETOF_IMPL = 0x4;
    static sizeof = 8;

    #flags: MethodDescriptorFlags;
    #impl: RelativeDirectPointer;

    constructor(private handle: NativePointer) {}

    get flags(): MethodDescriptorFlags {
        if (this.#flags !== undefined) {
            return this.#flags;
        }

        const value = this.handle
            .add(TargetMethodDescriptor.OFFSETOF_FLAGS)
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
    static readonly OFFSETOF_FIELD_OFFSET_VECTOR_OFFSET = 0x1c;

    #numFields: number | undefined;
    #fieldOffsetVectorOffset: number | undefined;

    hasFieldOffsetVector(): boolean {
        return this.fieldOffsetVectorOffset !== 0;
    }

    get numFields(): number {
        if (this.#numFields !== undefined) {
            return this.#numFields;
        }

        return this.handle
            .add(TargetStructDescriptor.OFFSETOF_NUM_FIELDS)
            .readU32();
    }

    get fieldOffsetVectorOffset(): number {
        if (this.#fieldOffsetVectorOffset !== undefined) {
            return this.#fieldOffsetVectorOffset;
        }

        return this.handle
            .add(TargetStructDescriptor.OFFSETOF_FIELD_OFFSET_VECTOR_OFFSET)
            .readU32();
    }
}

export class TargetEnumDescriptor extends TargetTypeContextDescriptor {
    static readonly OFFSETOF_NUM_PAYLOAD_CASES_AND_PAYLOAD_SIZE_OFFSET = 0x14;
    static readonly OFFSETOF_NUM_EMPTY_CASES = 0x18;

    #numPayloadCasesAndPayloadSizeOffset: number;
    #numEmptyCases: number;

    get numPayloadCasesAndPayloaadSizeOffset(): number {
        if (this.#numPayloadCasesAndPayloadSizeOffset === undefined) {
            const num = this.handle
                .add(
                    TargetEnumDescriptor.OFFSETOF_NUM_PAYLOAD_CASES_AND_PAYLOAD_SIZE_OFFSET
                )
                .readU32();
            this.#numPayloadCasesAndPayloadSizeOffset = num;
        }

        return this.#numPayloadCasesAndPayloadSizeOffset;
    }

    get numEmptyCases(): number {
        if (this.#numEmptyCases === undefined) {
            this.#numEmptyCases = this.handle
                .add(TargetEnumDescriptor.OFFSETOF_NUM_EMPTY_CASES)
                .readU32();
        }

        return this.#numEmptyCases;
    }

    getNumPayloadCases(): number {
        return this.numPayloadCasesAndPayloaadSizeOffset & 0x00ffffff;
    }

    getNumEmptyCases(): number {
        return this.numEmptyCases;
    }

    getNumCases(): number {
        return this.getNumPayloadCases() + this.numEmptyCases;
    }

    /* XXX: not in the original source */
    isPayloadTag(tag: number): boolean {
        return this.getNumCases() > 0 && tag < this.getNumPayloadCases();
    }
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
                this.handle.add(TargetProtocolDescriptor.OFFSETOF_NAME)
            ).get();
            this.#name = pointer.readCString();
        }

        return this.#name;
    }

    get numRequirements(): number {
        if (this.#numRequirements === undefined) {
            const pointer = this.handle.add(
                TargetProtocolDescriptor.OFFSETOF_NUM_REQUIREMENTS
            );
            this.#numRequirements = pointer.readU32();
        }

        return this.#numRequirements;
    }

    getProtocolContextDescriptorFlags(): ProtocolContextDescriptorFlags {
        return new ProtocolContextDescriptorFlags(
            this.flags.getKindSpecificFlags()
        );
    }

    getFullProtocolName(): string {
        return this.getModuleContext().name + "." + this.name;
    }
}

class TargetTypeReference {
    constructor(private readonly handle: NativePointer) {}

    getTypeDescriptor(kind: TypeReferenceKind): NativePointer {
        let pointer: NativePointer = null;

        switch (kind) {
            case TypeReferenceKind.DirectTypeDescriptor:
                pointer = RelativeDirectPointer.From(this.handle).get();
                break;
            case TypeReferenceKind.IndirectTypeDescriptor:
                pointer = RelativeDirectPointer.From(this.handle).get();
                pointer = pointer.readPointer();
                break;
            /* TODO: what to do with those? */
            case TypeReferenceKind.DirectObjCClassName:
            case TypeReferenceKind.IndirectObjCClass:
                break;
        }

        return pointer;
    }
}

export class TargetProtocolConformanceDescriptor {
    static readonly OFFSETOF_PROTOTCOL = 0x0;
    static readonly OFFSETOF_TYPE_REF = 0x4;
    static readonly OFFSTEOF_WITNESS_TABLE_PATTERN = 0x8;
    static readonly OFFSETOF_FLAGS = 0xc;
    static readonly OFFSETOF_WITNESS_TABLE_PATTERN = 0x10;

    #protocol: NativePointer;
    #typeRef: TargetTypeReference;
    #witnessTablePattern: NativePointer;
    #flags: ConformanceFlags;

    constructor(readonly handle: NativePointer) {}

    get protocol(): NativePointer {
        if (this.#protocol === undefined) {
            this.#protocol = RelativeIndirectablePointer.From(
                this.handle.add(
                    TargetProtocolConformanceDescriptor.OFFSETOF_PROTOTCOL
                )
            ).get();
        }

        return this.#protocol;
    }

    get typeRef(): TargetTypeReference {
        if (this.#typeRef === undefined) {
            const pointer = this.handle.add(
                TargetProtocolConformanceDescriptor.OFFSETOF_TYPE_REF
            );
            this.#typeRef = new TargetTypeReference(pointer);
        }

        return this.#typeRef;
    }

    /* This is actually the protocol witness table */
    get witnessTablePattern(): NativePointer {
        if (this.#witnessTablePattern === undefined) {
            const witnessTable = RelativeDirectPointer.From(
                this.handle.add(
                    TargetProtocolConformanceDescriptor.OFFSTEOF_WITNESS_TABLE_PATTERN
                )
            );
            this.#witnessTablePattern = witnessTable
                ? witnessTable.get()
                : null;
        }

        return this.#witnessTablePattern;
    }

    get flags(): ConformanceFlags {
        if (this.#flags === undefined) {
            const pointer = this.handle.add(
                TargetProtocolConformanceDescriptor.OFFSETOF_FLAGS
            );
            this.#flags = new ConformanceFlags(pointer.readU32());
        }

        return this.#flags;
    }

    getTypeKind(): TypeReferenceKind {
        return this.flags.getTypeReferenceKind();
    }

    getTypeDescriptor(): NativePointer {
        return this.typeRef.getTypeDescriptor(this.getTypeKind());
    }
}

class ContextDescriptorFlags {
    constructor(public readonly value: number) {}

    getKind(): ContextDescriptorKind {
        return this.value & 0x1f;
    }

    isGeneric(): boolean {
        return (this.value & 0x80) !== 0;
    }

    getIntValue(): number {
        return this.value;
    }

    getKindSpecificFlags(): number {
        return (this.value >>> 16) & 0xffff;
    }
}
