import { getApi } from "../lib/api";

type ModuleName = string;

interface CachedSymbolEntry {
    [address: string]: string;
};

export interface SimpleSymbolDetails {
    address: string,
    name?: string,
}

const cachedSymbols: Record<ModuleName, CachedSymbolEntry> = {};

export function resolveSymbols(module: Module, ptrs: NativePointer[]): SimpleSymbolDetails[] {
    const result: SimpleSymbolDetails[] = [];

    for (const ptr of ptrs) {
        let name = getSymbolAtAddress(module, ptr);
        result.push({
            address: ptr.toString(),
            name: name
        });
     }

    return result;
}

function getSymbolAtAddress(module: Module, address: NativePointer): string {
   const strAddr = address.toString();

    if (module.name in cachedSymbols) {
        return cachedSymbols[module.name][strAddr];
    }

    const swiftSymbols: ModuleSymbolDetails[] = enumerateDemangledSymbols(module);
    cachedSymbols[module.name] = {};

    swiftSymbols.forEach(s => {
        cachedSymbols[module.name][s.address.toString()] = s.name;
    });

    return cachedSymbols[module.name][strAddr];
}

export function enumerateDemangledSymbols(module: Module): ModuleSymbolDetails[] {
    let result: ModuleSymbolDetails[];
    const symbols = module.enumerateSymbols();

    result = symbols.map(s => {
        s.name = tryDemangleSwiftSymbol(s.name);
        return s;
    });

    return result;
}

function tryDemangleSwiftSymbol(name: string): string {
    if (!isSwiftSmybol(name)) {
        return name;
    }

    const api = getApi();
    const namePtr = Memory.allocUtf8String(name);
    const demangledNamePtr = api.swift_demangle(namePtr, name.length,
        ptr(0), ptr(0), 0) as NativePointer;

    return demangledNamePtr.readUtf8String();
}

function isSwiftSmybol(name: string): boolean {
    if (name.length == 0){
        return false;
    }

    const prefixes = [
        "_T0",          // Swif4 4
        "$S", "_$S",    // Swift 4.xx
        "$s", "_$s",    // Swift 5+
    ];

    for (const p of prefixes) {
        if (name.startsWith(p)) {
            return true;
        }
    }

    return false;
}
