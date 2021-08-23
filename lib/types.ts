/**
 * TODO:
 *  - Use conventional ordering of declarations
 *  - Implement Objective-C enumeration, e.g. __C.NSURL?
 */

import { TargetClassDescriptor,
         TargetClassMetadata,
         TargetEnumDescriptor,
         TargetEnumMetadata,
         TargetProtocolDescriptor,
         TargetStructDescriptor,
         TargetStructMetadata,
         TargetTypeContextDescriptor,
         TargetValueMetadata,
         TypeLayout, } from "../abi/metadata";
import { MethodDescriptorKind,
         ProtocolClassConstraint } from "../abi/metadatavalues";
import { resolveSymbolicReferences } from "../lib/symbols";
import { FieldDescriptor } from "../reflection/records";
import { getSymbolAtAddress } from "./symbols";
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
}

interface MethodDetails {
    address: NativePointer;
    name: string;
    type: MethodType;
}

interface TypeProtocolConformance {
    protocol: TargetProtocolDescriptor,
    witnessTable: NativePointer,
}

export abstract class Type {
    readonly $name: string;
    readonly $fields?: FieldDetails[];
    readonly $moduleName: string;
    readonly $metadataPointer: NativePointer;
    readonly $conformances: Record<string, TypeProtocolConformance>;

    constructor (readonly module: Module,
                 readonly kind: SwiftTypeKind,
                 readonly descriptor: TargetTypeContextDescriptor) {
        this.$name = descriptor.name;
        this.$fields = Type.getFieldsDetails(descriptor);
        this.$moduleName = descriptor.getModuleContext().name;
        this.$metadataPointer = descriptor.getAccessFunction()
                .call() as NativePointer;
        this.$conformances = {};
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
            fields: this.$fields,
            conformances: Object.keys(this.$conformances),
        }
    }
}

export class Class extends Type {
    readonly $metadata: TargetClassMetadata;
    readonly $methods: MethodDetails[];

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetClassDescriptor(descriptorPtr);
        super(module, "Class", descriptor);

        this.$metadata = new TargetClassMetadata(this.$metadataPointer);
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

    toJSON() {
        const base = super.toJSON();
        return Object.assign(base, {
            methods: this.$methods
        });
    }
}

export abstract class ValueType extends Type {
    readonly $metadata: TargetValueMetadata;
    readonly $typeLayout: TypeLayout;

    constructor(module: Module, kind: SwiftTypeKind,
                descriptor: TargetTypeContextDescriptor) {
        super(module, kind, descriptor);

        this.$metadata = new TargetValueMetadata(this.$metadataPointer);

        if (!this.descriptor.flags.isGeneric()) {
           this.$typeLayout = this.$metadata.getTypeLayout();
        }
    }

    $copyRaw(dest: NativePointer, src: NativePointer) {
        this.$metadata.vw_initializeWithCopy(dest, src);
    }

    $intializeWithCopyRaw(src: NativePointer): RuntimeInstance{
        const dest = this.makeEmptyValue();
        this.$metadata.vw_initializeWithCopy(dest.handle, src);
        return dest;
    }

    abstract makeValueFromRaw(buffer: NativePointer): ValueInstance;
    abstract makeEmptyValue(): RuntimeInstance;
}

export class Struct extends ValueType {
    readonly metadata: TargetStructMetadata;

    constructor(module: Module, descriptorPtr: NativePointer) {
        const descriptor = new TargetStructDescriptor(descriptorPtr);
        super(module, "Struct", descriptor);

        this.metadata = new TargetStructMetadata(this.$metadataPointer);
    }

    makeValueFromRaw(buffer: NativePointer): StructValue {
        return new StructValue(this, buffer);
    }

    makeEmptyValue(): StructValue {
        const buffer = Memory.alloc(this.$typeLayout.stride);
        return new StructValue(this, buffer);
    }
}

enum EnumKind {
    NoPayload,
    SinglePayload,
    MutliPayload
}

/* TODO: handle "default" protocol witnesses? See OnOffSwitch for an example */
export class Enum extends ValueType {
    readonly metadata: TargetEnumMetadata;
    private readonly enumKind: EnumKind;
    readonly emptyCases: FieldDetails[];
    readonly payloadCases: FieldDetails[];

    constructor(module: Module, descriptroPtr: NativePointer) {
        const descriptor = new TargetEnumDescriptor(descriptroPtr);
        super(module, "Enum", descriptor);

        this.metadata = new TargetEnumMetadata(this.$metadataPointer);

        if (this.$fields === undefined) {
            return;
        }

        this.emptyCases = [];
        this.payloadCases = [];
        this.enumKind = EnumKind.NoPayload;

        for (const field of this.$fields) {
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
        const buffer = Memory.alloc(this.$typeLayout.stride);
        return new EnumValue(this, buffer);
    }
}

export class Protocol {
    readonly name: string;
    readonly numRequirements: number;
    readonly isClassOnly: boolean;
    readonly moduleName: string;

    constructor(readonly descriptor: TargetProtocolDescriptor) {
        this.name = descriptor.name;
        this.numRequirements = descriptor.numRequirements;
        this.isClassOnly = descriptor.getProtocolContextDescriptorFlags()
                .getClassConstraint() == ProtocolClassConstraint.Class;
        this.moduleName = descriptor.getModuleContext().name;
    }

    toJSON() {
        return {
            numRequirements: this.descriptor.numRequirements,
            isClassOnly: this.isClassOnly,
        }
    }
}

export class ProtocolComposition {
    readonly protocols: Protocol[];
    readonly numProtocols: number;
    readonly isClassOnly: boolean;

    constructor(...protocols: Protocol[]) {
        this.protocols = [...protocols];
        this.numProtocols = protocols.length;
        this.isClassOnly = false;

        for (const proto of protocols) {
            if (proto.isClassOnly) {
                this.isClassOnly = true;
                break;
            }
        }
    }
}

