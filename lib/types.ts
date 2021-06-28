/**
 * TODO:
 *  - Use conventional ordering of declarations
 */

import { TargetClassDescriptor,
         TargetMetadata,
         TargetTypeContextDescriptor,
         TypeLayout, } from "../abi/metadata";
import { ContextDescriptorKind } from "../abi/metadatavalues";
import { resolveSymbolicReferences } from "../lib/symbols";
import { FieldDescriptor } from "../reflection/records";
import { RelativePointer } from "./helpers";
import { resolveSymbols, SimpleSymbolDetails } from "./symbols";
import { getPrivateAPI } from "./api";

type SwiftTypeKind = "Class" | "Enum" | "Struct";

interface FieldDetails {
    name: string;
    type?: string;
    isVar?: boolean;
}

export class Type {
    readonly kind: SwiftTypeKind;
    readonly name: string;
    readonly flags: number;
    readonly metadataPointer: NativePointer;
    readonly fields?: FieldDetails[];
    readonly methods?: SimpleSymbolDetails[];
    readonly typeLayout?: TypeLayout;

    constructor (module: Module, descriptorPtr: NativePointer) {
        /* TODO: only type context descriptors exist in __swift5_types? */
        const descriptor = new TargetTypeContextDescriptor(descriptorPtr);
        const kind = descriptor.getKind();

        switch (kind) {
            case ContextDescriptorKind.Class:
                const klass = new TargetClassDescriptor(descriptorPtr);
                this.kind = "Class";
                this.methods = resolveSymbols(module, klass.methods);
                break;

            case ContextDescriptorKind.Struct:
            case ContextDescriptorKind.Enum:
                this.kind = kind === ContextDescriptorKind.Enum ?
                                     "Enum" :
                                     "Struct";
                /* TODO: handle generics? */
                if (!descriptor.flags.isGeneric()) {
                    this.metadataPointer = descriptor.getAccessFunction()
                        .call() as NativePointer;
                    this.typeLayout = new TargetMetadata(this.metadataPointer)
                        .getTypeLayout();
                }
                break;

            default:
                console.log(`Unhandled context descriptor kind: ${kind}`);
                return;
        }

        this.fields = Type.getFieldsDetails(descriptor);
        this.name = descriptor.name;
        this.flags = descriptor.flags.value;
    }

    static getFieldsDetails(descriptor: TargetTypeContextDescriptor):
        FieldDetails[] {
        const result: FieldDetails[] = [];

        if (!descriptor.isReflectable()) {
            return undefined;
        }

       const fieldsDescriptor = new FieldDescriptor(descriptor.fields);
       if (fieldsDescriptor.numFields === 0) {
           return undefined; /* TODO: return undefined bad? */
       }

       const fields = fieldsDescriptor.getFields();
       for (const f of fields) {
           result.push({
               name: f.fieldName,
               type: f.mangledTypeName === null ?
                                       undefined :
                                       resolveSymbolicReferences(f.mangledTypeName),
               isVar: f.isVar,
           });
       }

       return result;
    }
}

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
};

export function getSwift5Types(module: Module) {
    const section = getSwif5TypesSection(module);

    const result: Type[] = [];
    /* TODO: centralize this value */
    const sizeofRelativePointer = 0x4;
    const nTypes = section.size / sizeofRelativePointer;

    for (let i = 0; i < nTypes; i++) {
        const record = section.vmAddress.add(i * sizeofRelativePointer);
        const contextDescriptorPtr = RelativePointer.resolveFrom(record);
        const type = new Type(module, contextDescriptorPtr);

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
