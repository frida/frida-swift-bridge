/**
 * TODO:
 *  - Move to registry.ts
 */

import { getApi, getPrivateAPI } from "../lib/api";

export interface SimpleSymbolDetails {
    address: string;
    name?: string;
}

type CSSymbolicator = [NativePointer, NativePointer];
const kCSNow = 0x8000000000000000;

const demangleCache = new Map<string, string>();
let cachedSymbolicator: CSSymbolicator | null = null;

export function demangledSymbolFromAddress(address: NativePointer): string {
    const api = getPrivateAPI();

    const symbol = api.CSSymbolicatorGetSymbolWithAddressAtTime(
        getSymbolicator(),
        address,
        kCSNow
    );

    if (api.CSIsNull(symbol)) {
        return undefined;
    }

    const namePtr = api.CSSymbolGetMangledName(symbol) as NativePointer;
    const mangled = namePtr.readCString();

    if (mangled === null) {
        return undefined;
    }

    return tryDemangleSymbol(mangled);
}

export function tryDemangleSymbol(name: string): string {
    if (!isSwiftSymbol(name)) {
        return undefined;
    }

    const cached = demangleCache.get(name);
    if (cached !== undefined) {
        return cached;
    }

    const api = getApi();

    try {
        const namePtr = Memory.allocUtf8String(name);
        const demangledNamePtr = api.swift_demangle(
            namePtr,
            name.length,
            ptr(0),
            ptr(0),
            0
        ) as NativePointer;

        const demangled = demangledNamePtr.readUtf8String();
        demangleCache.set(name, demangled);

        return demangled;
    } catch (e) {
        return undefined;
    }
}

function isSwiftSymbol(name: string): boolean {
    if (name.length == 0) {
        return false;
    }

    const prefixes = [
        "_T0", // Swif4 4
        "$S",
        "_$S", // Swift 4.xx
        "$s",
        "_$s", // Swift 5+
    ];

    for (const p of prefixes) {
        if (name.startsWith(p)) {
            return true;
        }
    }

    return false;
}

interface MethodSignatureParseResult {
    methodName: string;
    argNames: string[];
    argTypeNames: string[];
    retTypeName: string;
    jsSignature: string;
}

/**
 * @returns undefined for methods it (willingly, for now) fails to parse, e.g. (extension in Foundation):__C.NSTimer.TimerPublisher.__allocating_init(interval: Swift.Double, tolerance: Swift.Optional<Swift.Double>, runLoop: __C.NSRunLoop, mode: __C.NSRunLoopMode, options: Swift.Optional<(extension in Foundation):__C.NSRunLoop.SchedulerOptions>) -> (extension in Foundation):__C.NSTimer.TimerPublisher
 */
export function parseSwiftMethodSignature(
    signature: string
): MethodSignatureParseResult {
    const methNameAndRetTypeExp =
        /([a-zA-Z_]\w+)(<.+>)*\(.*\) -> ([\w.]+(?: & [\w.]+)*|\([\w.]*\))$/g;
    /**
     * If there's only one unlabled argument, the demangler emits just the type name.
     */
    const argsExp = /(\w+): ([\w.]+)(?:, )*|\(([\w.]+)\)/g;

    const methNameAndTypeMatch = methNameAndRetTypeExp.exec(signature);

    if (methNameAndTypeMatch === null) {
        throw new Error("Couldn't parse function with signature: " + signature);
    }

    const methodName = methNameAndTypeMatch[1];
    const retTypeName = methNameAndTypeMatch[3] || "void";

    if (methodName === undefined) {
        throw new Error("Couldn't parse function with signature: " + signature);
    }

    const argNames: string[] = [];
    const argTypeNames: string[] = [];
    let match;

    while ((match = argsExp.exec(signature)) !== null) {
        const singleUnlabledArg = match[3];
        if (singleUnlabledArg !== undefined) {
            argNames.push("");
            argTypeNames.push(singleUnlabledArg);
        } else {
            argNames.push(match[1]);
            argTypeNames.push(match[2]);
        }
    }

    if (argNames.length !== argTypeNames.length) {
        throw new Error("Couldn't parse function with signature: " + signature);
    }

    let jsSignature = methodName;
    if (argNames.length > 0) {
        jsSignature += "$" + argNames.join("_") + "_";
    }

    return {
        methodName,
        argNames,
        argTypeNames,
        retTypeName,
        jsSignature,
    };
}

export function tryParseSwiftMethodSignature(
    signature: string
): MethodSignatureParseResult {
    try {
        return parseSwiftMethodSignature(signature);
    } catch (e) {
        return undefined;
    }
}

interface AccessorSignatureParseResult {
    accessorType: "getter" | "setter";
    memberName: string;
    memberTypeName: string;
}

export function parseSwiftAccessorSignature(
    signature: string
): AccessorSignatureParseResult {
    const exp = /(\w+).(getter|setter) : ([\w.]+)$/g;
    const match = exp.exec(signature);

    if (match === null) {
        throw new Error("Couldn't parse accessor signature " + signature);
    }

    const accessorType = match[2];

    if (accessorType !== "getter" && accessorType !== "setter") {
        throw new Error("Couldn't parse accessor signature " + signature);
    }

    const memberName = match[1];
    const memberTypeName = match[3];

    return {
        accessorType,
        memberName,
        memberTypeName,
    };
}

export function tryParseSwiftAccessorSignature(
    signature: string
): AccessorSignatureParseResult {
    try {
        return parseSwiftAccessorSignature(signature);
    } catch (e) {
        return undefined;
    }
}

function getSymbolicator(): CSSymbolicator {
    if (cachedSymbolicator !== null) {
        return cachedSymbolicator;
    }

    const api = getPrivateAPI();
    const symbolicator = api.CSSymbolicatorCreateWithPid(Process.id);
    if (api.CSIsNull(symbolicator)) {
        throw new Error("Failed to create symbolicator");
    }

    cachedSymbolicator = symbolicator;

    // FIXME: Remove this `Script as any` hack once we've moved to the latest @types/frida-gum.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Script as any).bindWeak(cachedSymbolicator, releaseSymbolicator);

    return symbolicator;
}

function releaseSymbolicator() {
    getPrivateAPI().CSRelease(cachedSymbolicator);
}
