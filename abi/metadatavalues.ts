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

    get isNonPOD(): boolean {
        return !!(this.data & TargetValueWitnessFlags_Values.IsNonPOD);
    }
}

export enum MetadataKind {
    Class = 0,
    Struct = 0 | MetadataKindIsNonHeap,
    Enum = 1 | MetadataKindIsNonHeap,
}

export enum ContextDescriptorKind {
    Protocol = 3,
    TypeFirst = 16,
    Class = TypeFirst,
    Struct = TypeFirst + 1,
    Enum = TypeFirst + 2,
};

export enum TypeContextDescriptorFlags {
    Class_HasResilientSuperclass = 13,
    Class_HasVTable = 15,
};
