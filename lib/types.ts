import { TargetClassDescriptor,
         TargetContextDescriptor,
         TargetEnumDescriptor,
         TargetStructDescriptor,
         FieldDetails } from "../abi/metadata";
import { ContextDescriptorKind } from "../abi/metadatavalues";
import { RelativePointer } from "./helpers";
import { resolveSymbols, SimpleSymbolDetails } from "./symbols";
import { getPrivateAPI } from "./api";

type SwiftTypeKind = "Class" | "Enum" | "Struct";

export interface SwiftType {
    kind: SwiftTypeKind,
    name: string,
    accessFunction: NativeFunction,
    fields?: FieldDetails[],
    methods?: SimpleSymbolDetails[],
};

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
};

export function getSwift5Types(module: Module) {
    const section = getSwif5TypesSection(module);

    const result: SwiftType[] = [];
    /* TODO: centralize this value */
    const sizeofRelativePointer = 0x4;
    const nTypes = section.size / sizeofRelativePointer;

    for (let i = 0; i < nTypes; i++) {
        const record = section.vmAddress.add(i * sizeofRelativePointer);
        const contextDescriptorPtr = RelativePointer.resolveFrom(record);
        const contextDescriptor = new TargetContextDescriptor(contextDescriptorPtr);
        let type: SwiftType;

        switch (contextDescriptor.getKind()) {
            case ContextDescriptorKind.Class:
                const klass = new TargetClassDescriptor(contextDescriptorPtr);
                type = {
                    kind: "Class",
                    name: klass.name,
                    accessFunction: makeAccessFunction(klass.accessFunctionPointer),
                    methods: resolveSymbols(module, klass.methods),
                    fields: klass.getFieldsDetails(),
                };
                break;
            case ContextDescriptorKind.Enum:
                const enun = new TargetEnumDescriptor(contextDescriptorPtr);
                type = {
                    kind: "Enum",
                    name: enun.name,
                    accessFunction: makeAccessFunction(enun.accessFunctionPointer),
                    fields: enun.getFieldsDetails(),
                };
                break;
            case ContextDescriptorKind.Struct:
                const struct = new TargetStructDescriptor(contextDescriptorPtr);
                type = {
                    kind: "Struct",
                    name: struct.name,
                    accessFunction: makeAccessFunction(struct.accessFunctionPointer),
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
    const machHeader = module.base;
    const segName = Memory.allocUtf8String("__TEXT");
    const sectName = Memory.allocUtf8String("__swift5_types");
    const sizeOut = Memory.alloc(Process.pointerSize);
    const privAPI = getPrivateAPI();

    const vmAddr = privAPI.getsectiondata(machHeader, segName, sectName,
        sizeOut) as NativePointer;
    const size = sizeOut.readU32() as number;

    return { vmAddress: vmAddr, size: size };
}

function makeAccessFunction(pointer: NativePointer): NativeFunction {
    return new NativeFunction(pointer, "pointer", []);
}
