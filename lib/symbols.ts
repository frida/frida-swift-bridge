/**
 * TODO:
 *  - Move to registry.ts
 */

import { getApi } from "../lib/api";

export interface SimpleSymbolDetails {
    address: string,
    name?: string,
}

export function demangleSwiftSymbol(name: string): string {
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
        return undefined;
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

/**
 * @returns undefined for methods it (willingly, for now) fails to parse, e.g. (extension in Foundation):__C.NSTimer.TimerPublisher.__allocating_init(interval: Swift.Double, tolerance: Swift.Optional<Swift.Double>, runLoop: __C.NSRunLoop, mode: __C.NSRunLoopMode, options: Swift.Optional<(extension in Foundation):__C.NSRunLoop.SchedulerOptions>) -> (extension in Foundation):__C.NSTimer.TimerPublisher
 */
export function parseSwiftMethodSignature(signature: string):
        MethodSignatureParseResult {
    const methNameAndRetTypeExp = /([a-zA-Z_]\w+)(<.+>)*\(.*\) -> ([\w.]+|\([\w.]*\))$/g;
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
    }
}

export function tryParseSwiftMethodSignature(signature: string): MethodSignatureParseResult {
    try {
        return parseSwiftMethodSignature(signature);
    } catch (e) {
        return undefined;
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
    }
}

export function tryParseSwiftAccessorSignature(signature: string) {
    try {
        return parseSwiftAccessorSignature(signature);
    } catch (e) {
        return undefined;
    }
}