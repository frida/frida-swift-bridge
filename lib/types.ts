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
import { Registry } from "./registry";

type SwiftTypeKind = "Class" | "Enum" | "Struct";
type MethodType = "Init" | "Getter" | "Setter" | "ModifyCoroutine" |
    "ReadCoroutine" | "Method";

interface FieldDetails {
    name: string;
    typeName?: string;
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
        this.cacheSwift5Types();

        if (this.$allTypes.length > 0) {
            this.$name = this.$allTypes[0].moduleName;
        }
    }

    cacheSwift5Types() {
        const section = this.getSwif5TypesSection();
        /* TODO: centralize this value */
        const sizeofRelativePointer = 0x4;
        const nTypes = section.size / sizeofRelativePointer;

        /* TODO: only type context descriptors exist in __swift5_types? */
        for (let i = 0; i < nTypes; i++) {
            const record = section.vmAddress.add(i * sizeofRelativePointer);
            const ctxDescPtr = RelativeDirectPointer.From(record).get();
            const ctxDesc = new TargetTypeContextDescriptor(ctxDescPtr);

            if (ctxDesc.isGeneric()) {
                continue;
            }

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
               typeName: f.mangledTypeName === null ?
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

/* TODO: agree on interface for structs and enums
interface ValueType {
    readonly typeLayout: TypeLayout;
    makeFromRaw(buffer: ArrayBuffer): Value;
    makeFromRegion(handle: NativePointer): Value;
}
*/

export class Struct extends Type {
    readonly typeLayout: TypeLayout;

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetStructDescriptor(descriptorPtr);
        super(module, "Struct", descriptor);

        if (!this.descriptor.flags.isGeneric()) {
            this.typeLayout = this.metadata.getTypeLayout();
        }
    }

    makeFromRaw(handle: NativePointer): Value {
        if (this.descriptor.flags.isGeneric()) {
            throw new Error("Unimplemneted");
        }

        return new Value(this, handle);
    }
}

enum EnumKind {
    NoPayload,
    SinglePayload,
    MutliPayload
}

export class Enum extends Type {
    readonly typeLayout: TypeLayout;
    private readonly enumKind: EnumKind;
    private readonly emptyCases: FieldDetails[];
    private readonly payloadCases: FieldDetails[];

    constructor(module: Module, descriptroPtr: NativePointer) {
        const descriptor = new TargetEnumDescriptor(descriptroPtr);

        super(module, "Enum", descriptor);

        if (this.fields === undefined) {
            return;
        }

        this.typeLayout = this.metadata.getTypeLayout();
        this.emptyCases = [];
        this.payloadCases = [];
        this.enumKind = EnumKind.NoPayload;

        for (const field of this.fields) {
            if (field.typeName === undefined) {
                this.emptyCases.push(field);
            } else {
                this.payloadCases.push(field);

                if (this.enumKind === EnumKind.NoPayload) {
                    this.enumKind = EnumKind.SinglePayload;
                } else if (this.enumKind === EnumKind.SinglePayload) {
                    this.enumKind = EnumKind.MutliPayload;
                }
            }
        }

        let tagIndex = 0;

        for (const kase of this.payloadCases) { //test this
            const caseTag = tagIndex++;

            const associatedValueWrapper = (value: Value) => {
                if (value === undefined) {
                    throw new Error("Case requires an associated value");
                }

                /* TODO: check type here
                if (value.type !== caseType) {
                    throw new Error(`Case ${kase.name} requires an associated value of type: ${caseType.name}`);
                }
                */

                return new EnumValue(caseTag, value);
            }

            Object.defineProperty(this, kase.name, {
                configurable: false,
                enumerable: true,
                value: associatedValueWrapper,
                writable: false
            });
        }

        for (const [i, kase] of this.emptyCases.entries()) {
            Object.defineProperty(this, kase.name, {
                configurable: false,
                enumerable: true,
                value: new EnumValue(tagIndex++),
                writable: false
            });
        }

    }

    makeFromRaw(handle: NativePointer): EnumValue {
        const tag = this.metadata.vw_getEnumTag(handle);
        let payload: Value;

        if (tag - this.payloadCases.length >= this.emptyCases.length) {
            throw new Error("Invalid pointer for an enum of this type");
        }

        if (tag < this.payloadCases.length) {
            const typeName = this.payloadCases[tag].typeName;
            const type = Registry.shared().typeByName(typeName);
            payload = new Value(type, handle);
        }

        return new EnumValue(tag, payload);
    }
}

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
};
