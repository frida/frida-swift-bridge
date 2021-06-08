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
