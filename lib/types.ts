/**
 * TODO:
 *  - Use conventional ordering of declarations
 */

import { TargetClassDescriptor,
         TargetMetadata,
         TargetTypeContextDescriptor,
         TypeLayout, } from "../abi/metadata";
import { ContextDescriptorKind,
         MethodDescriptorKind } from "../abi/metadatavalues";
import { resolveSymbolicReferences } from "../lib/symbols";
import { FieldDescriptor } from "../reflection/records";
import { RelativePointer } from "./helpers";
import { getSymbolAtAddress } from "./symbols";
import { getPrivateAPI } from "./api";

type SwiftTypeKind = "Class" | "Enum" | "Struct";
type MethodType = "Init" | "Getter" | "Setter" | "ModifyCoroutine" |
    "ReadCoroutine" | "Method";

interface FieldDetails {
    name: string;
    type?: string;
    isVar?: boolean;
}

interface MethodDetails {
    address: NativePointer;
    name: string;
    type: MethodType;
}

export class Type {
    readonly kind: SwiftTypeKind;
    readonly name: string;
    readonly flags: number;
    readonly metadataPointer: NativePointer;
    readonly fields?: FieldDetails[];
    readonly methods?: MethodDetails[];
    readonly typeLayout?: TypeLayout;
    protected descriptor: TargetTypeContextDescriptor;
    protected metadata: TargetMetadata;

    constructor (protected module: Module, descriptorPtr: NativePointer) {
        /* TODO: only type context descriptors exist in __swift5_types? */
        const descriptor = new TargetTypeContextDescriptor(descriptorPtr);
        const kind = descriptor.getKind();

        switch (kind) {
            case ContextDescriptorKind.Class:
                const klass = new TargetClassDescriptor(descriptorPtr);
                this.descriptor = klass;
                this.kind = "Class";
                this.methods = this.getMethodsDetails();
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
                    this.metadata = new TargetMetadata(this.metadataPointer);
                    this.typeLayout = this.metadata.getTypeLayout();
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

    getMethodsDetails(): MethodDetails[] {
        const descriptor = this.descriptor as TargetClassDescriptor;
        const result: MethodDetails[] = [];

        for (const methDesc of descriptor.getMethodDescriptors()) {
            const address = methDesc.impl;
            const name = getSymbolAtAddress(this.module, address);
            const kind = methDesc.flags.getKind();
            let type: MethodType;

            switch (kind) {
                case MethodDescriptorKind.Init:
                    type = "Init";
                    break;
                case MethodDescriptorKind.Getter:
                    type = "Getter";
                    break;
                case MethodDescriptorKind.Setter:
                    type = "Setter";
                    break;
                case MethodDescriptorKind.ReadCoroutine:
                    type = "ReadCoroutine";
                    break;
                case MethodDescriptorKind.ModifyCoroutine:
                    type = "ModifyCoroutine";
                    break;
                case MethodDescriptorKind.Method:
                    type = "Method";
                    break;
                default:
                    throw new Error(`Invalid method descriptor kind: ${kind}`);
            }

            result.push({
                address,
                name,
                type,
            });
        }

        return result;
    }

    isAddressOnly(): boolean {
        return this.descriptor.isGeneric() ||
               this.metadata.getValueWitnesses().flags.isNonPOD;
    }

    toJSON(): any {
        return {
            kind: this.kind,
            name: this.name,
            flags: this.flags,
            fields: this.fields,
            methods: this.methods,
            typeLayout: this.typeLayout,
        }
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
