import { ContextDescriptor } from "./context-descriptor.js";
import { Metadata } from "./metadata.js";
import { RelativeDirectPointer } from "../basic/relative-pointer.js";
import { getSwiftCoreApi } from "../runtime/api.js";

const OFFSETOF_FD_FIELD_RECORD_SIZE = 0xa;
const OFFSETOF_FD_NUM_FIELDS = 0xc;
const OFFSETOF_FD_RECORDS = 0x10;

const OFFSETOF_FR_FLAGS = 0x0;
const OFFSETOF_FR_MANGLED_TYPE_NAME = 0x4;
const OFFSETOF_FR_FIELD_NAME = 0x8;

const FIELD_FLAG_INDIRECT_CASE = 0x1;
const FIELD_FLAG_VAR = 0x2;

export interface MangledName {
  address: NativePointer;
  length: number;
}

const SYMBOLIC_DIRECT_CONTEXT_DESCRIPTOR = 0x01;
const SYMBOLIC_INDIRECT_CONTEXT_DESCRIPTOR = 0x02;

export function leadingContextDescriptor(name: MangledName): ContextDescriptor | null {
  const reference = name.address.add(1);
  switch (name.address.readU8()) {
    case SYMBOLIC_DIRECT_CONTEXT_DESCRIPTOR:
      return new ContextDescriptor(RelativeDirectPointer.resolve(reference)!);
    case SYMBOLIC_INDIRECT_CONTEXT_DESCRIPTOR:
      return new ContextDescriptor(RelativeDirectPointer.resolve(reference)!.readPointer().strip());
    default:
      return null;
  }
}

export function symbolicMangledNameLength(base: NativePointer): number {
  return scanSymbolicMangledName(base).length;
}

// The text past the last symbolic reference is where a storage operator can follow the type.
function scanSymbolicMangledName(base: NativePointer): { length: number; trailingText: string } {
  let offset = 0;
  let textStart = 0;
  let byte = base.readU8();
  while (byte !== 0) {
    if (byte >= 0x01 && byte <= 0x17) {
      offset += 4;
      textStart = offset + 1;
    } else if (byte >= 0x18 && byte <= 0x1f) {
      offset += 8;
      textStart = offset + 1;
    }
    offset += 1;
    byte = base.add(offset).readU8();
  }
  return { length: offset, trailingText: base.add(textStart).readUtf8String(offset - textStart) ?? "" };
}

export type ReferenceStorage = "weak" | "unowned" | "unmanaged";

const REFERENCE_STORAGE_OPERATORS: Record<string, ReferenceStorage> = { Xw: "weak", Xo: "unowned", Xu: "unmanaged" };

export class Field {
  constructor(readonly handle: NativePointer) {}

  get flags(): number {
    return this.handle.add(OFFSETOF_FR_FLAGS).readU32();
  }

  get isVar(): boolean {
    return (this.flags & FIELD_FLAG_VAR) !== 0;
  }

  get isIndirectCase(): boolean {
    return (this.flags & FIELD_FLAG_INDIRECT_CASE) !== 0;
  }

  get name(): string {
    const ptr = RelativeDirectPointer.resolve(this.handle.add(OFFSETOF_FR_FIELD_NAME));
    return ptr === null ? "" : ptr.readUtf8String()!;
  }

  get mangledTypeName(): MangledName | null {
    const ptr = RelativeDirectPointer.resolve(this.handle.add(OFFSETOF_FR_MANGLED_TYPE_NAME));
    return ptr === null ? null : { address: ptr, length: symbolicMangledNameLength(ptr) };
  }

  // A weak, unowned or unowned(unsafe) field's type mangles with a trailing storage operator that
  // the runtime drops when resolving it, so the slot's layout is only told apart here.
  get referenceStorage(): ReferenceStorage | null {
    const ptr = RelativeDirectPointer.resolve(this.handle.add(OFFSETOF_FR_MANGLED_TYPE_NAME));
    if (ptr === null) {
      return null;
    }
    const { trailingText } = scanSymbolicMangledName(ptr);
    return REFERENCE_STORAGE_OPERATORS[trailingText.slice(-2)] ?? null;
  }
}

export function* enumerateFields(descriptor: ContextDescriptor): Generator<Field> {
  const fieldDescriptor = descriptor.fields;
  if (fieldDescriptor === null) {
    return;
  }

  const recordSize = fieldDescriptor.add(OFFSETOF_FD_FIELD_RECORD_SIZE).readU16();
  const numFields = fieldDescriptor.add(OFFSETOF_FD_NUM_FIELDS).readU32();
  const records = fieldDescriptor.add(OFFSETOF_FD_RECORDS);
  for (let i = 0; i < numFields; i++) {
    yield new Field(records.add(i * recordSize));
  }
}

export function resolveTypeByMangledName(
  name: MangledName,
  context: ContextDescriptor | null = null,
  genericArguments: NativePointer | null = null
): Metadata | null {
  const result = getSwiftCoreApi().swift_getTypeByMangledNameInContext(
    name.address,
    name.length,
    context === null ? ptr(0) : context.handle,
    genericArguments ?? ptr(0)
  );
  return result.isNull() ? null : new Metadata(result);
}

export function resolveFieldType(
  field: Field,
  context: ContextDescriptor | null = null,
  genericArguments: NativePointer | null = null
): Metadata | null {
  const mangled = field.mangledTypeName;
  return mangled === null ? null : resolveTypeByMangledName(mangled, context, genericArguments);
}

export function fieldTypeIn(metadata: Metadata, field: Field): Metadata | null {
  const description = metadata.description;
  const genericArguments = description.isGeneric ? metadata.genericArguments : null;
  return resolveFieldType(field, description, genericArguments);
}
