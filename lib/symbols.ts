/**
 * TODO:
 *  - Move to registry.ts
 */

import { TargetTypeContextDescriptor } from "../abi/metadata";
import { RelativeDirectPointer } from "../basic/relativepointer";
import { getApi } from "../lib/api";

type ModuleName = string;

interface CachedSymbolEntry {
    [address: string]: string;
}

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
                    RelativeDirectPointer.From(end).get());
            } else if (endValue === 0x02) {
                let p = RelativeDirectPointer.From(end).get().readPointer();
                p = p.and(0x7FFFFFFFFFF); // TODO: strip PAC

                contextDescriptor = new TargetTypeContextDescriptor(p);
            }
            break;
        } else if (endValue >= 0x18 && endValue <= 0x1F) {
            throw new Error("UNIMPLEMENTED 0x18 - 0x1F");
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

interface MethodSignatureParseResult {
    methodName: string,
    argNames: string[],
    argTypeNames: string[],
    retTypeName: string,
    jsSignature: string,
}

export function parseSwiftMethodSignature(signature: string):
        MethodSignatureParseResult {
    const methNameAndRetTypeExp = /([a-zA-Z_]\w+)(<.+>)*\(.*\) -> ([\w.]+)$/g;
    const argsExp = /(\w+): ([\w.]+)(?:, )*/g;

    const methNameAndTypeMatch = methNameAndRetTypeExp.exec(signature);

    if (methNameAndTypeMatch === null) {
        return undefined;
    }

    const methodName = methNameAndTypeMatch[1];
    const retTypeName = methNameAndTypeMatch[3] || "void";

    if (methodName === undefined) {
        return undefined;
    }

    const argNames: string[] = [];
    const argTypeNames: string[] = [];
    let match;

    while ((match = argsExp.exec(signature)) !== null) {
        argNames.push(match[1]);
        argTypeNames.push(match[2]);
    }

    if (argNames.length !== argTypeNames.length) {
        return undefined;
    }

    let jsSignature = methodName;
    jsSignature += argNames.length > 0 ? "_" : "";
    jsSignature += argNames.join("_");
    jsSignature += argNames.length > 0 ? "_" : "";

    return {
        methodName,
        argNames,
        argTypeNames,
        retTypeName,
        jsSignature,
    }
}

interface AccessorSignatureParseResult {
    accessorType: "getter" | "setter",
    memberName: string,
    memberTypeName: string,
}

export function parseSwiftAccessorSignature(signature: string):
        AccessorSignatureParseResult {
    const exp = /(\w+).(getter|setter) : ([\w.]+)$/g;
    const match = exp.exec(signature);

    if (match === null) {
        return undefined;
    }

    const accessorType = match[2];

    if (accessorType !== "getter" && accessorType !== "setter") {
        return undefined;
    }

    const memberName = match[1];
    const memberTypeName = match[3];

    return {
        accessorType,
        memberName,
        memberTypeName,
    }
}
