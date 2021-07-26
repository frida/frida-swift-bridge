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
import { EnumValue, Value } from "./runtime";

type SwiftTypeKind = "Class" | "Enum" | "Struct";
type MethodType = "Init" | "Getter" | "Setter" | "ModifyCoroutine" |
    "ReadCoroutine" | "Method";

interface FieldDetails {
    name: string;
    type?: string;
    isVar?: boolean;
};

interface MethodDetails {
    address: NativePointer;
    name: string;
    type: MethodType;
}

export class SwiftModule {
    readonly $name: string;
    readonly $allTypes: Type[] = [];
    readonly $classes: Class[] = [];
    readonly $structs: Struct[] = [];
    readonly $enums: Enum[] = [];

    constructor(readonly $native: Module) {
        this.cacheSwfit5Types();

        if (this.$allTypes.length > 0) {
            this.$name = this.$allTypes[0].moduleName;
        }
    }

    cacheSwfit5Types() {
        const section = this.getSwif5TypesSection();
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
                    type = new Class(this.$native, ctxDescPtr);
                    this.$classes.push(type as Class);
                    break;
                case ContextDescriptorKind.Enum:
                    type = new Enum(this.$native, ctxDescPtr);
                    this.$enums.push(type as Enum)
                    break;
                case ContextDescriptorKind.Struct:
                    type = new Struct(this.$native, ctxDescPtr);
                    this.$structs.push(type as Struct);
                    break;
                default:
                    throw new Error(`Unhandled context descriptor kind: ${kind}`);
            }

            this.$allTypes.push(type);

            Object.defineProperty(this, type.name, {
                configurable: true,
                enumerable: true,
                writable: false,
                value: type,
            })
        }
    }

    getSwif5TypesSection(): MachOSection {
        const machHeader = this.$native.base;
        const segName = Memory.allocUtf8String("__TEXT");
        const sectName = Memory.allocUtf8String("__swift5_types");
        const sizeOut = Memory.alloc(Process.pointerSize);
        const privAPI = getPrivateAPI();

        const vmAddress = privAPI.getsectiondata(machHeader, segName, sectName,
            sizeOut) as NativePointer;
        const size = sizeOut.readU32() as number;

        return { vmAddress, size };
    }

    toJSON() {
        return {
            classes: this.$classes.length,
            structs: this.$structs.length,
            enums: this.$enums.length,
        };
    }
}

export class Type {
    readonly name: string;
    readonly flags: number;
    readonly fields?: FieldDetails[];
    readonly moduleName: string;
    readonly metadataPointer: NativePointer;
    readonly metadata: TargetMetadata;

    constructor (readonly module: Module,
                 readonly kind: SwiftTypeKind,
                 readonly descriptor: TargetTypeContextDescriptor) {
        /* TODO: handle generics */
        if (descriptor.flags.isGeneric()) {
            return undefined;
        }

        this.name = descriptor.name;
        this.flags = descriptor.flags.value;
        this.fields = Type.getFieldsDetails(descriptor);
        this.moduleName = descriptor.getModuleContext().name;
        this.metadataPointer = descriptor.getAccessFunction()
                .call() as NativePointer;
        this.metadata = new TargetMetadata(this.metadataPointer);
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
    readonly $methods: MethodDetails[];

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetClassDescriptor(descriptorPtr);
        super(module, "Class", descriptor);

        this.$methods = this.getMethodsDetails();
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
}

interface ValueType {
    readonly typeLayout: TypeLayout;
    makeFromRaw(buffer: ArrayBuffer): Value;
    makeFromRegion(handle: NativePointer): Value;
}

export class Struct extends Type implements ValueType {
    readonly typeLayout: TypeLayout;

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetStructDescriptor(descriptorPtr);
        super(module, "Struct", descriptor);

        if (!this.descriptor.flags.isGeneric()) {
            this.typeLayout = this.metadata.getTypeLayout();
        }
    }

    makeFromRaw(buffer: ArrayBuffer): Value {
        if (this.descriptor.flags.isGeneric()) {
            throw new Error("Unimplemneted");
        }

        if (buffer.byteLength > this.typeLayout.size) {
            throw new Error(`Buffer must of be of size <= ${this.typeLayout.size} for this type`);
        }

        return new Value(this, buffer);
    }

    /* TODO: remove? */
    makeFromRegion(handle: NativePointer): Value {
        if (this.descriptor.flags.isGeneric()) {
            throw new Error("Unimplemented");
        }

        const buffer = ArrayBuffer.wrap(handle, this.typeLayout.size);

        return new Value(this, buffer);
    }

    /* TODO: remove this? */
    makeFromContext(context: CpuContext): Value {
        if (this.descriptor.flags.isGeneric()) {
            throw new Error("Unimplemented");
        }

        if (this.typeLayout.stride > 32) {
            throw new Error("Maximum loadable struct size is 32");
        }

        const stride = this.typeLayout.stride;
        const buffer = new ArrayBuffer(stride);
        const view = new DataView(buffer);
        let offset = 0, i = 0;

        /* TODO: Make it arch-agnostic */
        for (; offset < stride; offset += 8, i++) {
            const reg = context[`x${i}`];
            const p = Number(reg);
            const left = p & 0xFFFFFFFF00000000;
            const right = p & 0x00000000FFFFFFFF;

            view.setUint32(offset, left);
            view.setUint32(offset + 4, right);
        }

        return new Value(this, buffer);
    }
}

type EnumKind = "cstyle" | "singlepayload" | "multipayload";
export type EnumTagGetterFunction = () => number;

export class Enum extends Type implements ValueType {
    readonly typeLayout: TypeLayout;
    private readonly enumKind: EnumKind;
    private readonly noPayloadCases: FieldDetails[];
    private readonly payloadCases: FieldDetails[];

    constructor(module: Module, descriptroPtr: NativePointer) {
        const descriptor = new TargetEnumDescriptor(descriptroPtr);

        super(module, "Enum", descriptor);

        if (!this.descriptor.flags.isGeneric()) {
            this.typeLayout = this.metadata.getTypeLayout();
        }

        if (this.fields === undefined) {
            return;
        }

        this.noPayloadCases = [];
        this.payloadCases = [];
        this.enumKind = "cstyle";

        for (const field of this.fields) {
            if (field.type === undefined) {
                this.noPayloadCases.push(field);
            } else {
                this.payloadCases.push(field);

                this.enumKind = this.enumKind === "cstyle" ?
                                "singlepayload" :
                                this.enumKind === "singlepayload" ?
                                "multipayload" : this.enumKind;
            }
        }

        for (const [i, kase] of this.noPayloadCases.entries()) {
            Object.defineProperty(this, kase.name, {
                configurable: false,
                enumerable: true,
                value: this.makeWithTagIndex(i),
                writable: false
            });
        }
    }

    makeFromRaw(buffer: ArrayBuffer): EnumValue {
        const dataView = new DataView(buffer);
        const tagGetter = this.makeTagGetter(dataView);
        return new EnumValue(this, buffer, tagGetter);
    }

    makeFromRegion(handle: NativePointer): Value {
        throw new Error("Unimplemented");
    }

    private makeWithTagIndex(tagIndex: number): EnumValue {
        const bytes = this.getByteLength();

        if (bytes > 4) {
            throw new Error("Freakishly huge no-payload enums are not allowed");
        }

        const buffer = new ArrayBuffer(bytes);
        const view = new DataView(buffer);
        const tagGetter = this.makeTagGetter(view);

        if (bytes < 2) {
            view.setUint8(0, tagIndex);
        } else if (bytes < 4) {
            view.setUint16(0, tagIndex, true);
        } else {
            view.setUint32(0, tagIndex, true);
        }

        return new EnumValue(this, buffer, tagGetter);
    }

    /* TODO: handle other enum kinds */
    private makeTagGetter(view: DataView): EnumTagGetterFunction {
        const bytes = view.byteLength;

        if (bytes < 2) {
            return () => { return view.getUint8(0); };
        } else if (bytes < 4) {
            return () => { return view.getUint16(0, true); };
        } else {
            return () => { return view.getUint32(0, true); };
        }
    }

    private getByteLength(): number {
        return Math.ceil(this.noPayloadCases.length / 0xFF);
    }
}

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
};
