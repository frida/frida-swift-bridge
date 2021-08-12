/**
 * TODO:
 *  - Use conventional ordering of declarations
 *  - Implement Objective-C enumeration, e.g. __C.NSURL?
 */

import { TargetClassDescriptor,
         TargetClassMetadata,
         TargetEnumDescriptor,
         TargetEnumMetadata,
         TargetProtocolConformanceDescriptor,
         TargetProtocolDescriptor,
         TargetStructDescriptor,
         TargetStructMetadata,
         TargetTypeContextDescriptor,
         TargetValueMetadata,
         TypeLayout, } from "../abi/metadata";
import { ContextDescriptorKind,
         MethodDescriptorKind } from "../abi/metadatavalues";
import { resolveSymbolicReferences } from "../lib/symbols";
import { FieldDescriptor } from "../reflection/records";
import { RelativeDirectPointer } from "../basic/relativepointer";
import { getSymbolAtAddress } from "./symbols";
import { getPrivateAPI } from "./api";
import { EnumValue,
         ValueInstance,
         StructValue,
         RuntimeInstance } from "./runtime";

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
};

interface TypeProtocolConformance {
    protocol: TargetProtocolDescriptor,
    witnessTable: NativePointer,
};

export class SwiftModule {
    readonly $name: string;
    readonly $allTypes: Type[] = [];
    readonly $classes: Class[] = [];
    readonly $structs: Struct[] = [];
    readonly $enums: Enum[] = [];
    readonly $protocols: Protocol[] = [];

    constructor(readonly $native: Module) {
        this.cacheTypes();
        this.cacheProtocols();

        if (this.$allTypes.length > 0) {
            this.$name = this.$allTypes[0].moduleName;
        }
    }

    private cacheTypes() {
        const section = this.getSwif5TypesSection();
        const nTypes = section.size / RelativeDirectPointer.sizeOf;

        for (let i = 0; i < nTypes; i++) {
            const record = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
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
                value: type
            })
        }
    }

    private cacheProtocols() {
        const section = this.getSwift5ProtocolsSection();
        const numProtos = section.size / RelativeDirectPointer.sizeOf;

        for (let i = 0; i < numProtos; i++) {
            const record = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
            const ctxDescPtr = RelativeDirectPointer.From(record).get();
            const ctxDesc = new TargetProtocolDescriptor(ctxDescPtr);
            const protocol = new Protocol(ctxDesc);

            this.$protocols.push(protocol);

            Object.defineProperty(this, protocol.name, {
                configurable: true,
                enumerable: true,
                writable: false,
                value: protocol
            });
        }
    }

    bindProtocolConformances(cachedTypes: Record<string, Type>) {
        const section = this.getSwift5ProtocolConformanceSection();
        const numRecords = section.size / RelativeDirectPointer.sizeOf;

        for (let i = 0; i < numRecords; i++) {
            const recordPtr = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
            const descPtr = RelativeDirectPointer.From(recordPtr).get();
            const conformanceDesc = new TargetProtocolConformanceDescriptor(
                    descPtr);
            const typeDescPtr = conformanceDesc.getTypeDescriptor();
            const typeDesc = new TargetTypeContextDescriptor(typeDescPtr);

            /* TODO: handle generics */
            /* typeDescPtr is null when it's an ObjC class */
            if (typeDescPtr === null || typeDesc.isGeneric()) {
                continue;
            }

            const protocolDesc = new TargetProtocolDescriptor(
                        conformanceDesc.protocol);
            const cachedType = this[typeDesc.name] ||
                               cachedTypes[typeDesc.name];

            if (cachedType instanceof Type) {
                const conformance = {
                    protocol: protocolDesc,
                    witnessTable: conformanceDesc.witnessTablePattern,
                };

                cachedType.conformances[protocolDesc.name] = conformance;
            }
        }
    }

    private getSwif5TypesSection(): MachOSection {
        return this.getMachoSection("__swift5_types");
    }

    private getSwift5ProtocolsSection(): MachOSection {
        return this.getMachoSection("__swift5_protos");
    }

    private getSwift5ProtocolConformanceSection(): MachOSection {
        return this.getMachoSection("__swift5_proto");
    }

    private getMachoSection(sectionName: string, segmentName: string = "__TEXT"): MachOSection {
        const machHeader = this.$native.base;
        const segName = Memory.allocUtf8String(segmentName);
        const sectName = Memory.allocUtf8String(sectionName);
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
            protocols: this.$protocols.length,
        };
    }
}

/* TODO: make this an abstract class */
export class Type {
    readonly name: string;
    readonly flags: number;
    readonly fields?: FieldDetails[];
    readonly moduleName: string;
    readonly metadataPointer: NativePointer;
    readonly conformances: Record<string, TypeProtocolConformance>;

    constructor (readonly module: Module,
                 readonly kind: SwiftTypeKind,
                 readonly descriptor: TargetTypeContextDescriptor) {
        this.name = descriptor.name;
        this.flags = descriptor.flags.value;
        this.fields = Type.getFieldsDetails(descriptor);
        this.moduleName = descriptor.getModuleContext().name;
        this.metadataPointer = descriptor.getAccessFunction()
                .call() as NativePointer;
        this.conformances = {};
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
            name: this.name,
            fields: this.fields,
            conformances: Object.keys(this.conformances),
        }
    }
}

export class Class extends Type {
    readonly $metadata: TargetClassMetadata;
    readonly $methods: MethodDetails[];

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetClassDescriptor(descriptorPtr);
        super(module, "Class", descriptor);

        this.$metadata = new TargetClassMetadata(this.metadataPointer);
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

export abstract class ValueType extends Type {
    readonly metadata: TargetValueMetadata;
    readonly typeLayout: TypeLayout;

    constructor(module: Module, kind: SwiftTypeKind,
                descriptor: TargetTypeContextDescriptor) {
        super(module, kind, descriptor);

        this.metadata = new TargetValueMetadata(this.metadataPointer);

        if (!this.descriptor.flags.isGeneric()) {
           this.typeLayout = this.metadata.getTypeLayout();
        }
    }

    copy(dest: ValueInstance, src: ValueInstance) {
        this.metadata.vw_initializeWithCopy(dest.handle, src.handle);
    }

    copyRaw(dest: NativePointer, src: NativePointer) {
        this.metadata.vw_initializeWithCopy(dest, src);
    }

    intializeWithCopyRaw(src: NativePointer): RuntimeInstance{
        const dest = this.makeEmptyValue();
        this.metadata.vw_initializeWithCopy(dest.handle, src);
        return dest;
    }

    abstract makeValueFromRaw(buffer: NativePointer): RuntimeInstance;
    abstract makeEmptyValue(): RuntimeInstance;
}

export class Struct extends ValueType {
    readonly metadata: TargetStructMetadata;

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetStructDescriptor(descriptorPtr);
        super(module, "Struct", descriptor);

        this.metadata = new TargetStructMetadata(this.metadataPointer);
    }

    makeValueFromRaw(buffer: NativePointer): StructValue {
        return new StructValue(this, buffer);
    }

    makeEmptyValue(): StructValue {
        const buffer = Memory.alloc(this.typeLayout.stride);
        return new StructValue(this, buffer);
    }
}

enum EnumKind {
    NoPayload,
    SinglePayload,
    MutliPayload
}

export class Enum extends ValueType {
    readonly metadata: TargetEnumMetadata;
    private readonly enumKind: EnumKind;
    readonly emptyCases: FieldDetails[];
    readonly payloadCases: FieldDetails[];

    constructor(module: Module, descriptroPtr: NativePointer) {
        const descriptor = new TargetEnumDescriptor(descriptroPtr);
        super(module, "Enum", descriptor);

        this.metadata = new TargetEnumMetadata(this.metadataPointer);

        if (this.fields === undefined) {
            return;
        }

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

            const associatedValueWrapper = (payload: RuntimeInstance) => {
                if (payload === undefined) {
                    throw new Error("Case requires an associated value");
                }

                /* TODO: check type here
                if (value.type !== caseType) {
                    throw new Error(`Case ${kase.name} requires an associated value of type: ${caseType.name}`);
                }
                */

                const enumValue = this.makeEmptyValue();
                enumValue.setContent(caseTag, payload);

                return enumValue;
            }

            Object.defineProperty(this, kase.name, {
                configurable: false,
                enumerable: true,
                value: associatedValueWrapper,
                writable: false
            });
        }

        for (const [i, kase] of this.emptyCases.entries()) {
            const caseTag = tagIndex++;

            Object.defineProperty(this, kase.name, {
                configurable: true,
                enumerable: true,
                get: () => {
                    const enumVal = this.makeEmptyValue();
                    enumVal.setContent(caseTag);

                    Object.defineProperty(this, kase.name, { value: enumVal });
                    return enumVal;
                }
            });
        }
    }

    makeValueFromRaw(buffer: NativePointer): EnumValue {
        return new EnumValue(this, buffer);
    }

    makeEmptyValue(): EnumValue {
        const buffer = Memory.alloc(this.typeLayout.stride);
        return new EnumValue(this, buffer);
    }
}

export class Protocol {
    readonly name: string;
    readonly numRequirements: number;

    constructor(readonly descriptor: TargetProtocolDescriptor) {
        this.name = descriptor.name;
        this.numRequirements = descriptor.numRequirements;
    }

    toJSON() {
        return {
            numRequirements: this.descriptor.numRequirements
        }
    }
}

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
};
