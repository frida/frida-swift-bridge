const MetadataKindIsNonHeap = 0x200;

enum TargetValueWitnessFlags_Values {
    AlignmentMask =       0x000000FF,
    IsNonPOD =            0x00010000,
    IsNonInline =         0x00020000,
    HasSpareBits =        0x00080000,
    IsNonBitwiseTakable = 0x00100000,
    HasEnumWitnesses =    0x00200000,
    Incomplete =          0x00400000,
}

export class TargetValueWitnessFlags {
    constructor(public data: number) {
    }

    get isPOD(): boolean {
        return !(this.data & TargetValueWitnessFlags_Values.IsNonPOD);
    }

    get isBitwiseTakable(): boolean {
        return !(this.data & TargetValueWitnessFlags_Values.IsNonBitwiseTakable);
    }
}

export enum MetadataKind {
    Class = 0,
    Struct = 0 | MetadataKindIsNonHeap,
    Enum = 1 | MetadataKindIsNonHeap,
}

export enum ContextDescriptorKind {
    Module = 0,
    Extension = 1,
    Anonymous = 2,
    Protocol = 3,
    OpaqueType = 4,
    TypeFirst = 16,
    Class = TypeFirst,
    Struct = TypeFirst + 1,
    Enum = TypeFirst + 2,
};

export enum TypeContextDescriptorFlags {
    Class_HasResilientSuperclass = 13,
    Class_HasVTable = 15,
};

export enum MethodDescriptorKind {
    Method,
    Init,
    Getter,
    Setter,
    ModifyCoroutine,
    ReadCoroutine,
};

export class MethodDescriptorFlags {
    private static readonly KindMask = 0x0F;

    constructor(readonly value: number) { }

    getKind(): MethodDescriptorKind {
        return this.value & MethodDescriptorFlags.KindMask;
    }
}

export enum TypeReferenceKind {
    DirectTypeDescriptor = 0x00,
    IndirectTypeDescriptor = 0x01,
    DirectObjCClassName = 0x02,
    IndirectObjCClass = 0x03,
}

enum ConformanceFlags_Value {
    TypeMetadataKindMask = 0x7 << 3,
    TypeMetadataKindShift = 3,
}

export class ConformanceFlags {
    constructor(private value: number) { }

    getTypeReferenceKind(): TypeReferenceKind {
        return (this.value & ConformanceFlags_Value.TypeMetadataKindMask) >>
                ConformanceFlags_Value.TypeMetadataKindShift;
    }
}
