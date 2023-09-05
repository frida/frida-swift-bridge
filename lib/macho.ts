import {
    TargetTypeContextDescriptor,
    TargetProtocolDescriptor,
    TargetClassDescriptor,
    TargetStructDescriptor,
    TargetEnumDescriptor,
    TargetMetadata,
    TargetProtocolConformanceDescriptor,
} from "../abi/metadata";
import { ContextDescriptorKind } from "../abi/metadatavalues";
import { getPrivateAPI } from "./api";
import { RelativeDirectPointer } from "../basic/relativepointer";
import { demangledSymbolFromAddress } from "./symbols";

interface MachOSection {
    vmAddress: NativePointer;
    size: number;
}

interface ProtocolDescriptorMap {
    [protoName: string]: TargetProtocolDescriptor;
}

export interface ProtocolConformance {
    protocol: TargetProtocolDescriptor;
    witnessTable: NativePointer;
}

export interface ProtocolConformanceMap {
    [protoName: string]: ProtocolConformance;
}

interface FullTypeData {
    descriptor: TargetTypeContextDescriptor;
    metadata?: TargetMetadata;
    conformances: ProtocolConformanceMap;
}

interface FullTypeDataMap {
    [fullTypeName: string]: FullTypeData;
}

interface TypeDataConstructor<T> {
    new (handle: NativePointer): T;
}

const allModules = new ModuleMap();
const protocolDescriptorMap: ProtocolDescriptorMap = {};
const fullTypeDataMap: FullTypeDataMap = {};
const demangledSymbols = new Map<string, string>();

/* XXX: Ugly hack(TM) until we lazily-parse MachOs */
if (Process.arch === "arm64" && Process.platform === "darwin") {
    for (const module of allModules.values()) {
        for (const descriptor of enumerateTypeDescriptors(module)) {
            /* TODO: figure out why multiple descriptors could have the same name */
            fullTypeDataMap[descriptor.getFullTypeName()] = {
                descriptor,
                conformances: {},
            };
        }

        for (const descriptor of enumerateProtocolDescriptors(module)) {
            protocolDescriptorMap[descriptor.getFullProtocolName()] = descriptor;
        }
    }

    for (const module of allModules.values()) {
        bindProtocolConformances(module);
    }
}


export function getAllFullTypeData(): FullTypeData[] {
    return Object.values(fullTypeDataMap);
}

export function untypedMetadataFor(typeName: string): TargetMetadata {
    const fullTypeData = fullTypeDataMap[typeName];

    if (fullTypeData === undefined) {
        throw new Error("Type not found: " + typeName);
    }

    if (fullTypeData.metadata !== undefined) {
        return fullTypeDataMap[typeName].metadata;
    }

    const metadataPtr = fullTypeData.descriptor
        .getAccessFunction()
        .call() as NativePointer;
    const metadata = TargetMetadata.from(metadataPtr);
    fullTypeDataMap[typeName].metadata = metadata;
    return metadata;
}

export function metadataFor<T extends TargetMetadata>(
    typeName: string,
    c: TypeDataConstructor<T>
): T {
    const fullTypeData = fullTypeDataMap[typeName];

    if (fullTypeData === undefined) {
        throw new Error("Type not found: " + typeName);
    }

    if (fullTypeData.metadata !== undefined) {
        return fullTypeDataMap[typeName].metadata as T;
    }

    const metadataPtr = fullTypeData.descriptor
        .getAccessFunction()
        .call() as NativePointer;
    const metadata = new c(metadataPtr);
    fullTypeDataMap[typeName].metadata = metadata;
    return metadata as T;
}

export function getProtocolConformancesFor(
    typeName: string
): ProtocolConformanceMap {
    const fullTypeData = fullTypeDataMap[typeName];

    if (fullTypeData === undefined) {
        throw new Error("Type not found: " + typeName);
    }

    return fullTypeData.conformances;
}

export function getAllProtocolDescriptors(): TargetProtocolDescriptor[] {
    return Object.values(protocolDescriptorMap);
}

export function findProtocolDescriptor(
    protoName: string
): TargetProtocolDescriptor {
    return protocolDescriptorMap[protoName];
}

export function getProtocolDescriptor(
    protoName: string
): TargetProtocolDescriptor {
    const desc = protocolDescriptorMap[protoName];
    if (desc === undefined) {
        throw new Error(`Can't find protocol descriptor for: "${protoName}"`);
    }
    return desc;
}

function enumerateTypeDescriptors(
    module: Module
): TargetTypeContextDescriptor[] {
    const result: TargetTypeContextDescriptor[] = [];
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
        let descriptor: TargetTypeContextDescriptor;

        switch (kind) {
            case ContextDescriptorKind.Class:
                descriptor = new TargetClassDescriptor(ctxDescPtr);
                break;
            case ContextDescriptorKind.Struct:
                descriptor = new TargetStructDescriptor(ctxDescPtr);
                break;
            case ContextDescriptorKind.Enum:
                descriptor = new TargetEnumDescriptor(ctxDescPtr);
                break;
            default:
                continue;
        }

        result.push(descriptor);
    }

    return result;
}

function enumerateProtocolDescriptors(
    module: Module
): TargetProtocolDescriptor[] {
    const result: TargetProtocolDescriptor[] = [];
    const section = getSwift5ProtocolsSection(module);
    const numProtos = section.size / RelativeDirectPointer.sizeOf;

    for (let i = 0; i < numProtos; i++) {
        const record = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
        const ctxDescPtr = RelativeDirectPointer.From(record).get();
        const ctxDesc = new TargetProtocolDescriptor(ctxDescPtr);

        result.push(ctxDesc);
    }

    return result;
}

function bindProtocolConformances(module: Module) {
    const section = getSwift5ProtocolConformanceSection(module);
    const numRecords = section.size / RelativeDirectPointer.sizeOf;

    for (let i = 0; i < numRecords; i++) {
        const recordPtr = section.vmAddress.add(
            i * RelativeDirectPointer.sizeOf
        );
        const descPtr = RelativeDirectPointer.From(recordPtr).get();
        const conformanceDesc = new TargetProtocolConformanceDescriptor(
            descPtr
        );
        const typeDescPtr = conformanceDesc.getTypeDescriptor();
        const typeDesc = new TargetTypeContextDescriptor(typeDescPtr);
        const protocolDesc = new TargetProtocolDescriptor(
            conformanceDesc.protocol
        );

        /** TODO:
         *  - Handle ObjC case explicitly
         *  - Implement protocol inheritance
         *  - Implement generics
         */
        if (
            typeDescPtr === null ||
            typeDesc.isGeneric() ||
            typeDesc.getKind() === ContextDescriptorKind.Protocol
        ) {
            continue;
        }

        const type = fullTypeDataMap[typeDesc.getFullTypeName()];
        if (type === undefined) {
            continue;
        }
        const conformance = {
            protocol: protocolDesc,
            witnessTable: conformanceDesc.witnessTablePattern,
        };

        type.conformances[protocolDesc.name] = conformance;
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

function getMachoSection(
    module: Module,
    sectionName: string,
    segmentName = "__TEXT"
): MachOSection {
    const machHeader = module.base;
    const segName = Memory.allocUtf8String(segmentName);
    const sectName = Memory.allocUtf8String(sectionName);
    const sizeOut = Memory.alloc(Process.pointerSize);

    const vmAddress = getPrivateAPI().getsectiondata(
        machHeader,
        segName,
        sectName,
        sizeOut
    ) as NativePointer;
    const size = sizeOut.readU32() as number;

    return { vmAddress, size };
}

export function findDemangledSymbol(address: NativePointer): string {
    const module = allModules.find(address);
    if (module === null) {
        return undefined;
    }

    const rawAddr = address.toString();
    const cached = demangledSymbols.get(rawAddr);
    if (cached !== undefined) {
        return cached;
    }

    const demangled = demangledSymbolFromAddress(address);
    if (demangled === undefined) {
        return undefined;
    }

    demangledSymbols.set(rawAddr, demangled);
    return demangled;
}

export function getDemangledSymbol(address: NativePointer): string {
    const symbol = findDemangledSymbol(address);
    if (symbol === undefined) {
        throw new Error("Can't find symbol at " + address.toString());
    }
    return symbol;
}
