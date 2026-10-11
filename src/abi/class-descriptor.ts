import { ContextDescriptor, ContextDescriptorKind } from "./context-descriptor.js";
import { ClassMetadata } from "./class-metadata.js";
import { getClassMetadataBounds } from "./class-metadata-bounds.js";
import { genericContextEnd } from "./generic-instantiation.js";
import { MangledName, symbolicMangledNameLength } from "./field-descriptor.js";
import { RelativeDirectPointer } from "../basic/relative-pointer.js";

export enum MethodDescriptorKind {
  Method = 0,
  Init = 1,
  Getter = 2,
  Setter = 3,
  ModifyCoroutine = 4,
  ReadCoroutine = 5,
}

export interface VTableEntry {
  kind: MethodDescriptorKind;
  isInstance: boolean;
  isDynamic: boolean;
  declaredImpl: NativePointer;
  metadataOffset: number; // VTableOffset + slot
}

export enum MetadataInitializationKind {
  None = 0,
  Singleton = 1,
  Foreign = 2,
}

export enum TypeReferenceKind {
  DirectTypeDescriptor = 0,
  IndirectTypeDescriptor = 1,
  DirectObjCClassName = 2,
  IndirectObjCClass = 3,
}

const OFFSETOF_SUPERCLASS_TYPE = 0x14;
// Trailing-object order: ResilientSuperclass, then Foreign xor SingletonMetadataInitialization, then VTableDescriptorHeader.
const OFFSETOF_TRAILING_OBJECTS_START = 0x2c;
const OFFSETOF_METADATA_NEGATIVE_SIZE_IN_WORDS = 0x18;
const OFFSETOF_METADATA_POSITIVE_SIZE_IN_WORDS = 0x1c;
const OFFSETOF_NUM_IMMEDIATE_MEMBERS = 0x20;

const RESILIENT_SUPERCLASS_SIZE = 4;
const FOREIGN_METADATA_INITIALIZATION_SIZE = 4;
const SINGLETON_METADATA_INITIALIZATION_SIZE = 12;

const METHOD_DESCRIPTOR_SIZE = 8;
const OFFSETOF_VTABLE_SIZE = 0x4;
const OFFSETOF_METHOD_DESCRIPTORS = 0x8;
const OFFSETOF_IMPL = 0x4;

const OFFSETOF_EXTRA_CLASS_FLAGS = 0x1c;
const VTABLE_DESCRIPTOR_HEADER_SIZE = 8;
const OVERRIDE_TABLE_HEADER_SIZE = 4;
const METHOD_OVERRIDE_DESCRIPTOR_SIZE = 12;
const OBJC_RESILIENT_CLASS_STUB_INFO_SIZE = 4;
const METADATA_LIST_COUNT_SIZE = 4;
const METADATA_LIST_ENTRY_SIZE = 4;

const KIND_FLAGS_SHIFT = 16;
const CLASS_HAS_VTABLE = 1 << 15;
const CLASS_HAS_OVERRIDE_TABLE = 1 << 14;
const CLASS_HAS_RESILIENT_SUPERCLASS = 1 << 13;
const HAS_CANONICAL_METADATA_PRESPECIALIZATIONS = 1 << 3;
const EXTRA_CLASS_HAS_OBJC_RESILIENT_CLASS_STUB = 1;
const CLASS_ARE_IMMEDIATE_MEMBERS_NEGATIVE = 1 << 12;
const CLASS_IS_DEFAULT_ACTOR = 1 << 8;
const CLASS_IS_ACTOR = 1 << 7;
const CLASS_RESILIENT_SUPERCLASS_REFERENCE_KIND_SHIFT = 9;
const CLASS_RESILIENT_SUPERCLASS_REFERENCE_KIND_MASK = 0x7;
const METADATA_INITIALIZATION_MASK = 0x3;

const KIND_MASK = 0x0f;
const IS_INSTANCE = 0x10;
const IS_DYNAMIC = 0x20;

function kindFlags(descriptor: ContextDescriptor): number {
  return descriptor.flags >>> KIND_FLAGS_SHIFT;
}

export function hasResilientSuperclass(descriptor: ContextDescriptor): boolean {
  return (kindFlags(descriptor) & CLASS_HAS_RESILIENT_SUPERCLASS) !== 0;
}

export function isActor(descriptor: ContextDescriptor): boolean {
  return (kindFlags(descriptor) & CLASS_IS_ACTOR) !== 0;
}

// May be false for an actor with a resilient superclass.
export function isDefaultActor(descriptor: ContextDescriptor): boolean {
  return (kindFlags(descriptor) & CLASS_IS_DEFAULT_ACTOR) !== 0;
}

export function metadataInitializationKind(descriptor: ContextDescriptor): MetadataInitializationKind {
  return kindFlags(descriptor) & METADATA_INITIALIZATION_MASK;
}

export function areImmediateMembersNegative(descriptor: ContextDescriptor): boolean {
  return (kindFlags(descriptor) & CLASS_ARE_IMMEDIATE_MEMBERS_NEGATIVE) !== 0;
}

export function resilientSuperclassReferenceKind(descriptor: ContextDescriptor): TypeReferenceKind {
  return (
    (kindFlags(descriptor) >>> CLASS_RESILIENT_SUPERCLASS_REFERENCE_KIND_SHIFT) &
    CLASS_RESILIENT_SUPERCLASS_REFERENCE_KIND_MASK
  );
}

export function superclassTypeName(descriptor: ContextDescriptor): MangledName | null {
  const name = RelativeDirectPointer.resolve(descriptor.handle.add(OFFSETOF_SUPERCLASS_TYPE));
  return name === null ? null : { address: name, length: symbolicMangledNameLength(name) };
}

export function numImmediateMembers(descriptor: ContextDescriptor): number {
  return descriptor.handle.add(OFFSETOF_NUM_IMMEDIATE_MEMBERS).readU32();
}

// Valid only when !hasResilientSuperclass(descriptor); that union slot otherwise holds a cache pointer.
export function metadataNegativeSizeInWords(descriptor: ContextDescriptor): number {
  return descriptor.handle.add(OFFSETOF_METADATA_NEGATIVE_SIZE_IN_WORDS).readU32();
}

export function metadataPositiveSizeInWords(descriptor: ContextDescriptor): number {
  return descriptor.handle.add(OFFSETOF_METADATA_POSITIVE_SIZE_IN_WORDS).readU32();
}

// Null means the class has no formal superclass reference at all.
export function getResilientSuperclassRef(descriptor: ContextDescriptor): NativePointer | null {
  const offset = descriptor.isGeneric
    ? genericContextEnd(descriptor)
    : OFFSETOF_TRAILING_OBJECTS_START;
  return RelativeDirectPointer.resolve(descriptor.handle.add(offset));
}

function classTrailingObjectsStart(descriptor: ContextDescriptor): number {
  let offset = OFFSETOF_TRAILING_OBJECTS_START;
  if (hasResilientSuperclass(descriptor)) {
    offset += RESILIENT_SUPERCLASS_SIZE;
  }
  switch (metadataInitializationKind(descriptor)) {
    case MetadataInitializationKind.Foreign:
      offset += FOREIGN_METADATA_INITIALIZATION_SIZE;
      break;
    case MetadataInitializationKind.Singleton:
      offset += SINGLETON_METADATA_INITIALIZATION_SIZE;
      break;
    case MetadataInitializationKind.None:
      break;
  }
  return offset;
}

export function readVTable(descriptor: ContextDescriptor): VTableEntry[] {
  if ((kindFlags(descriptor) & CLASS_HAS_VTABLE) === 0) {
    return [];
  }
  const name = descriptor.fullTypeName;
  if (descriptor.isGeneric) {
    throw new Error(`readVTable: ${name} is generic; vtable offset is not fixed`);
  }

  const base = descriptor.handle;
  const header = classTrailingObjectsStart(descriptor);
  let vtableOffset = base.add(header).readU32();
  if (hasResilientSuperclass(descriptor)) {
    vtableOffset += getClassMetadataBounds(descriptor).immediateMembersOffset / Process.pointerSize;
  }
  const size = base.add(header + OFFSETOF_VTABLE_SIZE).readU32();
  const entries: VTableEntry[] = [];
  for (let i = 0; i < size; i++) {
    const md = base.add(header + OFFSETOF_METHOD_DESCRIPTORS + i * METHOD_DESCRIPTOR_SIZE);
    const declaredImpl = RelativeDirectPointer.resolve(md.add(OFFSETOF_IMPL));
    if (declaredImpl === null) {
      continue;
    }
    const flags = md.readU32();
    entries.push({
      kind: flags & KIND_MASK,
      isInstance: (flags & IS_INSTANCE) !== 0,
      isDynamic: (flags & IS_DYNAMIC) !== 0,
      declaredImpl,
      metadataOffset: vtableOffset + i,
    });
  }
  return entries;
}

// The compiler's own specializations of a generic type, emitted in its defining module's image
// data. They trail the generic context, the metadata initialization record and, for a class, the
// vtable, the override table and the ObjC resilient class stub.
export function canonicalPrespecializedMetadata(descriptor: ContextDescriptor): NativePointer[] {
  if (!descriptor.isGeneric || (kindFlags(descriptor) & HAS_CANONICAL_METADATA_PRESPECIALIZATIONS) === 0) {
    return [];
  }
  const isClass = descriptor.kind === ContextDescriptorKind.Class;
  const base = descriptor.handle;
  let offset = genericContextEnd(descriptor);
  if (isClass && hasResilientSuperclass(descriptor)) {
    offset += RESILIENT_SUPERCLASS_SIZE;
  }
  switch (metadataInitializationKind(descriptor)) {
    case MetadataInitializationKind.Foreign:
      offset += FOREIGN_METADATA_INITIALIZATION_SIZE;
      break;
    case MetadataInitializationKind.Singleton:
      offset += SINGLETON_METADATA_INITIALIZATION_SIZE;
      break;
    case MetadataInitializationKind.None:
      break;
  }
  if (isClass) {
    if ((kindFlags(descriptor) & CLASS_HAS_VTABLE) !== 0) {
      offset += VTABLE_DESCRIPTOR_HEADER_SIZE + base.add(offset + OFFSETOF_VTABLE_SIZE).readU32() * METHOD_DESCRIPTOR_SIZE;
    }
    if ((kindFlags(descriptor) & CLASS_HAS_OVERRIDE_TABLE) !== 0) {
      offset += OVERRIDE_TABLE_HEADER_SIZE + base.add(offset).readU32() * METHOD_OVERRIDE_DESCRIPTOR_SIZE;
    }
    if (hasResilientSuperclass(descriptor) && (base.add(OFFSETOF_EXTRA_CLASS_FLAGS).readU32() & EXTRA_CLASS_HAS_OBJC_RESILIENT_CLASS_STUB) !== 0) {
      offset += OBJC_RESILIENT_CLASS_STUB_INFO_SIZE;
    }
  }
  const count = base.add(offset).readU32();
  const entries = base.add(offset + METADATA_LIST_COUNT_SIZE);
  return Array.from({ length: count }, (_, i) => RelativeDirectPointer.resolve(entries.add(i * METADATA_LIST_ENTRY_SIZE))!);
}

// A class's slots keep a fixed metadata offset in every subclass, so a base slot addresses the
// override; overrides don't recur here (they live in the override table readVTable skips).
export function readVTableChain(metadata: ClassMetadata): VTableEntry[] {
  const entries: VTableEntry[] = [];
  let cls: ClassMetadata | null = metadata;
  while (cls !== null && cls.isTypeMetadata) {
    entries.push(...readVTable(cls.description));
    cls = cls.superclass;
  }
  return entries;
}
