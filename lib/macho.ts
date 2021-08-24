import { TargetProtocolConformanceDescriptor, TargetTypeContextDescriptor,
         TargetProtocolDescriptor } from "../abi/metadata";
import { ContextDescriptorKind } from "../abi/metadatavalues";
import { RelativeDirectPointer } from "../basic/relativepointer";
import { getPrivateAPI } from "./api";
import { Type, Class, Struct, Enum, Protocol } from "./types";

export type TypeMap = Record<string, Type>;
export type ClassMap = Record<string, Class>;
export type StructMap = Record<string, Struct>;
export type EnumMap = Record<string, Enum>;
export type ProtocolMap = Record<string, Protocol>;

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
}

export function enumerateTypes(module: Module): Type[] {
    const result: Type[] = [];
    const section = getSwif5TypesSection(module);
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
                type = new Class(module, ctxDescPtr);
                break;
            case ContextDescriptorKind.Struct:
                type = new Struct(module, ctxDescPtr);
                break;
            case ContextDescriptorKind.Enum:
                type = new Enum(module, ctxDescPtr);
                break;
            default:
                throw new Error(`Unhandled context descriptor kind: ${kind}`);
        }

        result.push(type);
    }

    return result;
}

export function enumerateProtocols(module: Module) {
    const result: Protocol[] = [];
    const section = getSwift5ProtocolsSection(module);
    const numProtos = section.size / RelativeDirectPointer.sizeOf;

    for (let i = 0; i < numProtos; i++) {
        const record = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
        const ctxDescPtr = RelativeDirectPointer.From(record).get();
        const ctxDesc = new TargetProtocolDescriptor(ctxDescPtr);
        const protocol = new Protocol(ctxDesc);

        result.push(protocol);
    }

    return result;
}

export function bindProtocolConformances(module: Module,
                                         typeFinder: (name: string) => Type) {
    const section = getSwift5ProtocolConformanceSection(module);
    const numRecords = section.size / RelativeDirectPointer.sizeOf;

    for (let i = 0; i < numRecords; i++) {
        const recordPtr = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
        const descPtr = RelativeDirectPointer.From(recordPtr).get();
        const conformanceDesc = new TargetProtocolConformanceDescriptor(
                descPtr);
        const typeDescPtr = conformanceDesc.getTypeDescriptor();
        const typeDesc = new TargetTypeContextDescriptor(typeDescPtr);
        const protocolDesc = new TargetProtocolDescriptor(
                    conformanceDesc.protocol);

        /**
         * TODO:
         *  - Handle ObjC case explicitly
         *  - Implement protocol inheritance
         *  - Implement generics
        */
        if (typeDescPtr === null || typeDesc.isGeneric() ||
            typeDesc.getKind() === ContextDescriptorKind.Protocol) {
            continue;
        }

        const cachedType = typeFinder(typeDesc.getFullTypeName());
        const conformance = {
            protocol: protocolDesc,
            witnessTable: conformanceDesc.witnessTablePattern,
        };
        cachedType.$conformances[protocolDesc.name] = conformance;
    }
}

function getSwif5TypesSection(module: Module): MachOSection {
    return getMachoSection(module, "__swift5_types");
}

function getSwift5ProtocolsSection(module: Module): MachOSection {
    return getMachoSection(module, "__swift5_protos");
}

function getSwift5ProtocolConformanceSection(module: Module): MachOSection {
    return getMachoSection(module, "__swift5_proto");
}

function getMachoSection(module: Module,
                            sectionName: string,
                            segmentName: string = "__TEXT"): MachOSection {
    const machHeader = module.base;
    const segName = Memory.allocUtf8String(segmentName);
    const sectName = Memory.allocUtf8String(sectionName);
    const sizeOut = Memory.alloc(Process.pointerSize);
    const privAPI = getPrivateAPI();

    const vmAddress = privAPI.getsectiondata(machHeader, segName, sectName,
        sizeOut) as NativePointer;
    const size = sizeOut.readU32() as number;

    return { vmAddress, size };
}

export class SwiftModule {
    readonly classes: ClassMap = {};
    readonly structs: StructMap = {};
    readonly enums: EnumMap = {};
    readonly protocols: ProtocolMap = {};

    constructor(readonly name: string) {
    }

    addClass(klass: Class) {
        this.classes[klass.$name] = klass;
    }

    addStruct(struct: Struct) {
        this.structs[struct.$name] = struct;
    }

    addEnum(anEnum: Enum) {
        this.enums[anEnum.$name] = anEnum;
    }

    addProtocol(protocol: Protocol) {
        this.protocols[protocol.name] = protocol;
    }

    toJSON() {
        return {
            classes: Object.keys(this.classes).length,
            structs: Object.keys(this.structs).length,
            enums: Object.keys(this.enums).length,
            protocols: Object.keys(this.protocols).length,
        };
    }
}
