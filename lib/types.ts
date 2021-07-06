/**
 * TODO:
 *  - Use conventional ordering of declarations
 */

import { TargetClassDescriptor,
         TargetEnumDescriptor,
         TargetMetadata,
         TargetStructDescriptor,
         TargetTypeContextDescriptor,
         TypeLayout, } from "../abi/metadata";
import { ContextDescriptorKind,
         MethodDescriptorKind } from "../abi/metadatavalues";
import { resolveSymbolicReferences } from "../lib/symbols";
import { FieldDescriptor } from "../reflection/records";
import { RelativeDirectPointer } from "../basic/relativepointer";
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
    readonly name: string;
    readonly flags: number;
    readonly fields?: FieldDetails[];
    readonly metadataPointer: NativePointer;
    readonly metadata: TargetMetadata;

    constructor (readonly module: Module,
                 readonly kind: SwiftTypeKind,
                 readonly descriptor: TargetTypeContextDescriptor) {
        this.name = descriptor.name;
        this.flags = descriptor.flags.value;
        this.fields = Type.getFieldsDetails(descriptor);

        /* TODO: handle generics? */
        if (!descriptor.flags.isGeneric()) {
            this.metadataPointer = descriptor.getAccessFunction()
                .call() as NativePointer;
            this.metadata = new TargetMetadata(this.metadataPointer);
        }
    }

    static getFieldsDetails(descriptor: TargetTypeContextDescriptor):
        FieldDetails[] {
        const result: FieldDetails[] = [];

        if (!descriptor.isReflectable()) {
            return undefined;
        }

       const fieldsDescriptor = new FieldDescriptor(descriptor.fields.get());
       if (fieldsDescriptor.numFields === 0) {
           return undefined; /* TODO: return undefined bad? */
       }

       const fields = fieldsDescriptor.getFields();
       for (const f of fields) {
           result.push({
               name: f.fieldName,
               type: f.mangledTypeName === null ?
                                       undefined :
                                       resolveSymbolicReferences(f.mangledTypeName.get()),
               isVar: f.isVar,
           });
       }

       return result;
    }

    toJSON() {
        return {
            kind: this.kind,
            name: this.name,
            flags: this.flags,
            fields: this.fields,
        }
    }
}

export class Class extends Type {
    readonly methods: MethodDetails[];

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetClassDescriptor(descriptorPtr);
        super(module, "Class", descriptor);

        this.methods = this.getMethodsDetails();
    }

    getMethodsDetails(): MethodDetails[] {
        const descriptor = this.descriptor as TargetClassDescriptor;
        const result: MethodDetails[] = [];

        for (const methDesc of descriptor.getMethodDescriptors()) {
            const address = methDesc.impl.get();
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

    toJSON() {
        const parent = super.toJSON();
        return Object.assign(parent, {
            methods: this.methods,
        });
    }
}

export class Struct extends Type {
    readonly typeLayout: TypeLayout;

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetStructDescriptor(descriptorPtr);
        super(module, "Struct", descriptor);

        if (!this.descriptor.flags.isGeneric()) {
            this.typeLayout = this.metadata.getTypeLayout();
        }
    }

    toJSON() {
        const parent = super.toJSON();
        return Object.assign(super.toJSON(), {
            typeLayout: this.typeLayout,
        });
    }
}

export class Enum extends Type {
    constructor(module: Module, descriptroPtr: NativePointer) {
        const descriptor = new TargetEnumDescriptor(descriptroPtr);
        super(module, "Enum", descriptor);
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

	/* TODO: only type context descriptors exist in __swift5_types? */
    for (let i = 0; i < nTypes; i++) {
        const record = section.vmAddress.add(i * sizeofRelativePointer);
        const ctxDescPtr = RelativeDirectPointer.From(record).get();
        const ctxDesc = new TargetTypeContextDescriptor(ctxDescPtr);
        const kind = ctxDesc.getKind();
        let type: Type;

        switch (kind) {
            case ContextDescriptorKind.Class:
                type = new Class(module, ctxDescPtr);
                break;
            case ContextDescriptorKind.Enum:
                type = new Enum(module, ctxDescPtr);
                break;
            case ContextDescriptorKind.Struct:
                type = new Struct(module, ctxDescPtr);
                break;
            default:
                throw new Error(`Unhandled context descriptor kind: ${kind}`);
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
