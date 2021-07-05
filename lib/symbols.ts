import { TargetTypeContextDescriptor } from "../abi/metadata";
import { getApi } from "../lib/api";
import { RelativePointer } from "./helpers";

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

export function resolveSymbolicReferences(symbol: NativePointer): string {
    const base = symbol;
    let end = base;
    let endValue = end.readU8();
    let contextDescriptor: TargetTypeContextDescriptor = null;

    while (endValue !== 0) {
        if (endValue >= 0x01 && endValue <= 0x17) {
            end = end.add(1);

            if (endValue === 0x01) {
                contextDescriptor = new TargetTypeContextDescriptor(
                    RelativePointer.resolveFrom(end));
            } else if (endValue === 0x02) {
                let p = RelativePointer.resolveFrom(end).readPointer();
                p = p.and(0x7FFFFFFFFFF); // strip PAC

                contextDescriptor = new TargetTypeContextDescriptor(p);
            }
            break;
        } else if (endValue >= 0x18 && endValue <= 0x1F) {
            console.log("UNIMPLEMENTED 0x18 - 0x1F");
        }

        end = end.add(1);
        endValue = end.readU8();
    }

    if (contextDescriptor !== null) {
        return contextDescriptor.name;
    }

    return tryDemangleSwiftSymbol("_$s" + symbol.readCString());
}

export function getSymbolAtAddress(module: Module, address: NativePointer): string {
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
    try {
        const namePtr = Memory.allocUtf8String(name);
        const demangledNamePtr = api.swift_demangle(namePtr, name.length,
            ptr(0), ptr(0), 0) as NativePointer;

        return demangledNamePtr.readUtf8String();
    } catch (e) {
        return name;
    }
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
