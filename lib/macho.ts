import {
    TargetTypeContextDescriptor, TargetProtocolDescriptor, TargetClassDescriptor,
    TargetStructDescriptor, TargetEnumDescriptor, TargetMetadata, TargetProtocolConformanceDescriptor, TargetStructMetadata
} from "../abi/metadata";
import { ContextDescriptorKind } from "../abi/metadatavalues";
import { RelativeDirectPointer } from "../basic/relativepointer";
import { demangleSwiftSymbol } from "./symbols";

interface MachOSection {
    vmAddress: NativePointer,
    size: number,
}

interface ProtocolDescriptorMap {
    [protoName: string]: TargetProtocolDescriptor
}

export interface ProtocolConformance {
    protocol: TargetProtocolDescriptor,
    witnessTable: NativePointer,
}

export interface ProtocolConformanceMap {
    [protoName: string]: ProtocolConformance
}

interface FullTypeData {
    descriptor: TargetTypeContextDescriptor,
    metadata?: TargetMetadata,
    conformances: ProtocolConformanceMap,
}

interface FullTypeDataMap {
    [fullTypeName: string]: FullTypeData
}

interface TypeDataConstructor<T> {
    new(handle: NativePointer): T;
}

const allModules = new ModuleMap();
const protocolDescriptorMap: ProtocolDescriptorMap = {};
const fullTypeDataMap: FullTypeDataMap = {};

for (const module of allModules.values()) {
    for (const descriptor of enumerateTypeDescriptors(module)) {

        /* TODO: figure out why multiple descriptors could have the same name */
        fullTypeDataMap[descriptor.getFullTypeName()] = { descriptor, conformances: {} };
    }

    for (const descriptor of enumerateProtocolDescriptors(module)) {
        protocolDescriptorMap[descriptor.getFullProtocolName()] = descriptor;
    }
}

for (const module of allModules.values()) {
    bindProtocolConformances(module);
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

    const metadataPtr = fullTypeData.descriptor.getAccessFunction().call() as NativePointer;
    const metadata = TargetMetadata.from(metadataPtr);
    fullTypeDataMap[typeName].metadata = metadata;
    return metadata;
}

export function metadataFor<T extends TargetMetadata>(typeName: string, c: TypeDataConstructor<T>): T {
    const fullTypeData = fullTypeDataMap[typeName];

    if (fullTypeData === undefined) {
        throw new Error("Type not found: " + typeName);
    }

    if (fullTypeData.metadata !== undefined) {
        return fullTypeDataMap[typeName].metadata as T;
    }

    const metadataPtr = fullTypeData.descriptor.getAccessFunction().call() as NativePointer;
    const metadata = TargetMetadata.from(metadataPtr);
    fullTypeDataMap[typeName].metadata = metadata;
    return metadata as T;
}

export function protocolConformancesFor(typeName: string): ProtocolConformanceMap {
    const fullTypeData = fullTypeDataMap[typeName];

    if (fullTypeData === undefined) {
        throw new Error("Type not found: " + typeName);
    }

    return fullTypeData.conformances;
}

export function getAllProtocolDescriptors(): TargetProtocolDescriptor[] {
    return Object.values(protocolDescriptorMap);
}

export function findProtocolDescriptor(protoName: string): TargetProtocolDescriptor {
    return protocolDescriptorMap[protoName];
}

function enumerateTypeDescriptors(module: Module): TargetTypeContextDescriptor[] {
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
                throw new Error(`Unhandled context descriptor kind: ${kind}`);
        }

        result.push(descriptor);
    }

    return result;
}

function enumerateProtocolDescriptors(module: Module): TargetProtocolDescriptor[] {
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
        const recordPtr = section.vmAddress.add(i * RelativeDirectPointer.sizeOf);
        const descPtr = RelativeDirectPointer.From(recordPtr).get();
        const conformanceDesc = new TargetProtocolConformanceDescriptor(
            descPtr);
        const typeDescPtr = conformanceDesc.getTypeDescriptor();
        const typeDesc = new TargetTypeContextDescriptor(typeDescPtr);
        const protocolDesc = new TargetProtocolDescriptor(
            conformanceDesc.protocol);

        /** TODO:
         *  - Handle ObjC case explicitly
         *  - Implement protocol inheritance
         *  - Implement generics
         */
        if (typeDescPtr === null || typeDesc.isGeneric() ||
            typeDesc.getKind() === ContextDescriptorKind.Protocol) {
            continue;
        }

        const type = fullTypeDataMap[typeDesc.getFullTypeName()];
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

function getMachoSection(module: Module,
    sectionName: string,
    segmentName: string = "__TEXT"): MachOSection {
    Module.ensureInitialized("libmacho.dylib");
    const addr = Module.getExportByName("libmacho.dylib", "getsectiondata");
    const getsectiondata = new NativeFunction(addr, "pointer", ["pointer",
        "pointer", "pointer", "pointer"]);

    const machHeader = module.base;
    const segName = Memory.allocUtf8String(segmentName);
    const sectName = Memory.allocUtf8String(sectionName);
    const sizeOut = Memory.alloc(Process.pointerSize);

    const vmAddress = getsectiondata(machHeader, segName, sectName,
        sizeOut) as NativePointer;
    const size = sizeOut.readU32() as number;

    return { vmAddress, size };
}

interface SymbolCache {
    [moduleName: string]: {
        [address: number]: string;
    }
}

const cachedSymbols: SymbolCache = {};

export function enumerateDemangledSymbols(module: Module): ModuleSymbolDetails[] {
    let result: ModuleSymbolDetails[];
    const symbols = module.enumerateSymbols();

    result = symbols.flatMap(s => {
        const demangled = demangleSwiftSymbol(s.name);
        if (demangled) {
            s.name = demangled;
            return [s];
        } else {
            return [];
        }
    });

    return result;
}

export function findDemangledSymbol(address: NativePointer): string {
    const module = allModules.find(address)
    if (module === null) {
        return undefined;
    }

    const rawAddr = address.toUInt32();
    const cachedModule = cachedSymbols[module.name];
    if (cachedModule !== undefined) {
        return cachedModule[rawAddr];
    }

    const symbols = enumerateDemangledSymbols(module);
    cachedSymbols[module.name] = {};

    for (const s of symbols) {
        cachedSymbols[module.name][s.address.toUInt32()] = s.name;
    }

    return cachedSymbols[module.name][rawAddr];
}

export function getDemangledSymbol(address: NativePointer): string {
    const symbol = findDemangledSymbol(address);
    if (symbol === undefined) {
        throw new Error("Can't find symbol at " + address.toString());
    }
    return symbol;
}
