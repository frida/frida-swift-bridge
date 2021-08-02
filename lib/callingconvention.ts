/**
 * TODO:
 *  - Implement Double and other SIMD types
 *  - Add check for correct number / type of arguments.
 * 	- Can we tell whether a function throws via its metadata?
 */

import { Enum, Struct, Type } from "./types";
import { EnumValue, Value } from "./runtime";

type SwiftType = Type;
type SwiftcallReturnKind = "direct" | "indirect" | "expand";

interface SwiftcallResultOptions {
    kind: SwiftcallReturnKind;
    buffer?: NativePointer;
    bufferSize?: number;
};
interface SwiftNativeFunctionObject {
    readonly extraStorage: ArrayBuffer;
};

export type SwiftNativeFunctionType = Function & SwiftNativeFunctionObject;

class TrampolinePool {
    private static pages: NativePointer[];
    private static currentSlot: NativePointer;

    private static get currentPage(): NativePointer {
        return TrampolinePool.pages[TrampolinePool.pages.length - 1];
    }

    private static _initialize() {
        TrampolinePool.pages = [Memory.alloc(Process.pageSize)];
        TrampolinePool.currentSlot = TrampolinePool.currentPage;
    }

    public static allocateTrampoline(size: number): NativePointer {
        if (TrampolinePool.pages === undefined) {
            TrampolinePool._initialize();
        }

        let currentPage = TrampolinePool.currentPage;
        const currentPageEnd = currentPage.add(Process.pageSize);

        if (TrampolinePool.currentSlot.add(size).compare(currentPageEnd) > 0) {
            currentPage = Memory.alloc(Process.pageSize);
            TrampolinePool.pages.push(currentPage);
        }

        const currentSlot = TrampolinePool.currentSlot;
        TrampolinePool.currentSlot = TrampolinePool.currentSlot.add(size);

        return currentSlot;
    }
}

export function makeSwiftNativeFunction(address: NativePointer,
                                        retType: SwiftType,
                                        argTypes: SwiftType[],
                                        context?: NativePointer,
                                        throws?: boolean): SwiftNativeFunctionType {
    let nativeRetType = makeCType(retType);
    const nativeArgTypes = argTypes.map(ty => makeCType(ty)).flat();
    const retOpts: SwiftcallResultOptions = { kind: "direct" };

    if (Array.isArray(nativeRetType)) {
        const stride = retType.metadata.getTypeLayout().stride;
        const buffer = Memory.alloc(stride);

        if (nativeRetType.length > 4) {
            retOpts.kind = "indirect";
        } else {
            retOpts.kind = "expand";
        }

        retOpts.buffer = buffer;
        retOpts.bufferSize = stride;
        nativeRetType = "pointer";
    }

    const extraStorage = new ArrayBuffer(16);
    const formattedArgs = `[${nativeArgTypes.map(a => `"${a}"`)}]`;
    const trampoline = jitSwiftcallTrampoline(address, extraStorage.unwrap(),
                                              retOpts, context, throws);
    const nativeFunction = eval(`var f = new NativeFunction(ptr(${trampoline}),` +
                                `"${nativeRetType}",${formattedArgs}); f;`);
    const wrapper = function(...args: Value[]) {
        const acutalArgs: any[] = [];

        for (const arg of args) {
            const cValue = makeCValue(arg);

            if (Array.isArray(cValue)) {
                acutalArgs.push(...cValue);
            } else {
                acutalArgs.push(cValue);
            }
        }

        const retval = nativeFunction(...acutalArgs);

        if (retOpts.kind === "indirect" || retOpts.kind === "expand") {
            if (retType instanceof Enum) {
                const asEnum = retType as Enum;
                return asEnum.makeFromRaw(retOpts.buffer);
            }
            return new Value(retType, retOpts.buffer);
        }

        /* TODO: don't lose type metadata for register-sized values */
        return retval;
    }

    return Object.assign(wrapper, { extraStorage });
}

function makeCType(type: Type): NativeType {
    if (type.kind === "Class") {
        return "pointer";
    } else {
        const asStruct = type as Struct;
        /**TODO:
         * - Make it arch-agnostic
         * - Unsigned ints?
         */
        const sizeInQWords = asStruct.typeLayout.stride / 8;
        return sizeInQWords === 1 ?
               "uint64" :
               Array(sizeInQWords).fill("uint64");
    }
}

function makeCValue(value: Value): UInt64 | UInt64[] | NativePointer {
    const type = value.type;
    const result: UInt64[] = [];

    if (shouldPassIndirectly(type)) {
        return value.handle;
    } else if (value instanceof EnumValue) {
        const asEnum = type as Enum;
        const enumValue = value as EnumValue;

        if (asEnum.payloadCases.length > 0) {
            const stride = asEnum.typeLayout.stride;
            const tmp = Memory.alloc(stride);
            let payloadSize: number;

            if (enumValue.payload.type instanceof Struct) {
                const payloadType = enumValue.payload.type as Struct;
                payloadSize = payloadType.typeLayout.stride;
            } else {
                payloadSize = Process.pointerSize; // TODO: bad?
            }

            Memory.copy(tmp, enumValue.payload.handle, payloadSize);
            asEnum.metadata.vw_destructiveInjectEnumTag(tmp, enumValue.tag);

            for (let i = 0; i < stride; i += 8) {
                result.push(tmp.add(i).readU64());
            }
        } else {
            result.push(uint64(enumValue.tag));
        }
    } else {
        const asStruct = type as Struct;
        const stride = asStruct.typeLayout.stride;

        for (let i = 0; i < stride; i += 8) {
            result.push(value.handle.add(i).readU64());
        }
    }

    return result.length === 1 ? result[0] : result;
}

function shouldPassIndirectly(type: Type) {
    // TODO: enums with references?
    const vwt = type.metadata.getValueWitnesses();
    return !vwt.flags.isBitwiseTakable || vwt.stride > 32;
}

function jitSwiftcallTrampoline(target: NativePointer,
                                extraStorage: NativePointer,
                                resultOpts: SwiftcallResultOptions,
                                context?: NativePointer,
                                throws?: boolean): NativePointer {
    const maxPatchSize = 0x44;
    const trampoline = TrampolinePool.allocateTrampoline(maxPatchSize);

    Memory.patchCode(trampoline, maxPatchSize, (code) => {
        const writer = new Arm64Writer(code, { pc: trampoline });

        /* TODO: not thread safe? */
        writer.putLdrRegAddress("x15", extraStorage);
        writer.putStpRegRegRegOffset("x29", "x30", "x15", 0, "post-adjust");

        if (context !== undefined) {
            writer.putLdrRegAddress("x20", context);
        }

        if (!!throws) {
            writer.putAndRegRegImm("x21", "x21", 0);
        }

        if (resultOpts.kind === "indirect") {
            writer.putLdrRegAddress("x8", resultOpts.buffer);
        }

        writer.putLdrRegAddress("x14", target)
        writer.putBlrRegNoAuth("x14");

        if (resultOpts.kind === "expand") {
            const buffer = resultOpts.buffer;
            let i = 0, offset = 0;

            writer.putLdrRegAddress("x15", buffer);

            for (; offset < resultOpts.bufferSize; i++, offset += 8) {
                const reg = `x${i}` as Arm64Register;
                writer.putStrRegRegOffset(reg, "x15", offset);
            }
        }

        writer.putLdrRegAddress("x15", extraStorage);
        writer.putLdpRegRegRegOffset("x29", "x30", "x15", 0, "post-adjust");
        writer.putRet();

        writer.flush();
    });;

    return trampoline;
}
