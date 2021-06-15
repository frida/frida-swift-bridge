import { TargetClassDescriptor,
         TargetContextDescriptor,
         TargetEnumDescriptor,
         TargetStructDescriptor,
         FieldDetails } from "../abi/metadata";
import { ContextDescriptorKind } from "../abi/metadatavalues";
import { RelativePointer } from "./helpers";
import { resolveSymbols, SimpleSymbolDetails } from "./symbols";

type SwiftTypeKind = "Class" | "Enum" | "Struct";

export interface SwiftType {
    kind: SwiftTypeKind,
    name: string,
    fields?: FieldDetails[],
    methods?: SimpleSymbolDetails[],
};

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
};

export function getSwift5Types(module: Module) {
    const section = getSwif5TypesSection(module);

    if (section === null) {
        return [];
    }

    const result: SwiftType[] = [];
    /* TODO: centralize this value */
    const sizeofRelativePointer = 0x4;
    const nTypes = section.size / sizeofRelativePointer;

    for (let i = 0; i < nTypes; i++) {
        const record = section.vmAddress.add(i * sizeofRelativePointer);
        const contextDescriptorPtr = RelativePointer.resolveFrom(record);
        const contextDescriptor = new TargetContextDescriptor(contextDescriptorPtr);
        let type: SwiftType;

        switch (contextDescriptor.getTypeKind()) {
            case ContextDescriptorKind.Class:
                const klass = new TargetClassDescriptor(contextDescriptorPtr);
                type = {
                    kind: "Class",
                    name: klass.name,
                    methods: resolveSymbols(module, klass.methods),
                    fields: klass.getFieldsDetails(),
                };
                break;
            case ContextDescriptorKind.Enum:
                const enun = new TargetEnumDescriptor(contextDescriptorPtr);
                type = {
                    kind: "Enum",
                    name: enun.name,
                    fields: enun.getFieldsDetails(),
                };
                break;
            case ContextDescriptorKind.Struct:
                const struct = new TargetStructDescriptor(contextDescriptorPtr);
                type = {
                    kind: "Struct",
                    name: struct.name,
                    fields: struct.getFieldsDetails(),
                };
                break;
        }

        if (type === undefined) {
            continue;
        }

        result.push(type);
    }

    return result;
}

function getSwif5TypesSection(module: Module): MachOSection {
    const OFFSETOF_MACHO_NCMDS= 0x10;
    const OFFSETOF_MACHO_LOAD_COMMANDS = 0x20;
    const LC_SEGMENT_64 = 0x19;
    const SIZEOF_SEGMENT_COMMAND_64 = 0x48;
    const OFFSETOF_SEGMENT_COMMAND_64_NSECTS = 0x40;
    const SIZEOF_SECT64_HEADER = 0x50;
    const OFFSETOF_SECTION64_SIZE = 0x28;
    const OFFSETOF_SECTION64_OFFSET = 0x30;

    const base = module.base;
    const magic = base.readU32();

    if (magic !== 0xfeedfacf) {
        throw new Error("Non 64-bit Mach-O binary");
    }

    const nCmds = base.add(OFFSETOF_MACHO_NCMDS).readU32();
    let offset = base.add(OFFSETOF_MACHO_LOAD_COMMANDS);

    for (let i = 0; i < nCmds; i++) {
        const cmd = offset.readU32();
        const cmdSize = offset.add(4).readU32();

        if (cmd === LC_SEGMENT_64) {
          const nsects = offset.add(OFFSETOF_SEGMENT_COMMAND_64_NSECTS).readU32();
          let tempOffset = offset.add(SIZEOF_SEGMENT_COMMAND_64);

          for (let j = 0; j < nsects; j++) {
            const sectname = tempOffset.readCString();
            if (sectname === '__swift5_types') {
              const offset = tempOffset.add(OFFSETOF_SECTION64_OFFSET).readU32();
              const vmAddr = module.base.add(offset);
              const size = tempOffset.add(OFFSETOF_SECTION64_SIZE)
                .readU64().toNumber();

              return { vmAddress: vmAddr, size: size };
            }

            tempOffset = tempOffset.add(SIZEOF_SECT64_HEADER);
          }
        }

        offset = offset.add(cmdSize);
    }

    return null;
}
