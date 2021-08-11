/**
 * TODO:
 *  - Implement Double and other SIMD types
 *  - Add check for correct number / type of arguments.
 * 	- Can we tell whether a function throws via its metadata?
 */

import { Struct, Type, ValueType } from "./types";
import { makeRuntimeValue, ObjectInstance, RuntimeValue, SwiftValue } from "./runtime";

type SwiftType = Type;

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

function makeBufferFromValue(fields: UInt64[]): NativePointer {
    const size = Process.pointerSize * fields.length;
    const buffer = Memory.alloc(size);

    for (let i = 0, offset = 0; offset < size; i++, offset += Process.pointerSize) {
        buffer.add(offset).writeU64(fields[i])
    }

    return buffer;
}

function moveValueToBuffer(fields: UInt64[], buffer: NativePointer) {
    const size =  Process.pointerSize * fields.length;

    for (let i = 0, offset = 0; offset < size; i++, offset += Process.pointerSize) {
        buffer.add(offset).writeU64(fields[i]);
    }
}

export function makeSwiftNativeFunction(address: NativePointer,
                                        retType: SwiftType,
                                        argTypes: SwiftType[],
                                        context?: NativePointer,
                                        throws?: boolean): Function {
    const loweredArgType = argTypes.map(ty => lowerSemantically(ty));
    const loweredRetType = lowerSemantically(retType);

    const swiftcallWrapper = new SwiftcallNativeFunction(address, loweredRetType,
                loweredArgType, context).wrapper;

    const wrapper = function(...args: RuntimeValue[]) {
        const acutalArgs: any[] = [];

        for (const arg of args) {
            acutalArgs.push(lowerPhysically(arg));
        }

        const retval = swiftcallWrapper(...acutalArgs);

        switch (retType.kind) {
            case "Struct":
            case "Enum":
                const buffer = makeBufferFromValue(retval);
                return makeRuntimeValue(retType as ValueType, buffer);
            case "Class":
                return new ObjectInstance(retval as NativePointer);
            default:
                console.warn("Unimplemented kind: " + retType.kind);
                return retval;
        }
    }

    return wrapper;
}

function lowerSemantically(type: Type): NativeType {
    if (type.kind === "Class") {
        return "pointer";
    }

    const valueType = type as ValueType;
    /**TODO:
     * - Make it arch-agnostic
     * - Unsigned ints?
     */
    let sizeInQWords = valueType.typeLayout.stride / 8;
    sizeInQWords = sizeInQWords > 1 ? sizeInQWords : 1;
    return Array(sizeInQWords).fill("uint64");
}

function lowerPhysically(value: SwiftValue): UInt64 | UInt64[] | NativePointer {
    const result: UInt64[] = [];

    if (value instanceof ObjectInstance) {
        return value.handle;
    }

    value as RuntimeValue;
    const type = value.type;

    if (shouldPassIndirectly(type)) {
        return value.handle;
    }

    const stride = type.typeLayout.stride;

    for (let i = 0; i < stride; i += 8) {
        result.push(value.handle.add(i).readU64());
    }

    return result;
}

function shouldPassIndirectly(type: Type) {
    const vwt = type.metadata.getValueWitnesses();
    return !vwt.flags.isBitwiseTakable;
}

class StrongQueue<T> {
    #queue: Record<number, T> = {};
    #next = 0;

    get length(): number {
        return Object.keys(this.#queue).length - this.#next;
    }

    enqueue(item: T) {
        const tail = Object.keys(this.#queue).length;
        this.#queue[tail] = item;
    }

    dequeue(): T {
        if (Object.keys(this.#queue).length === 0) {
            return undefined;
        }

        const item = this.#queue[this.#next];
        delete this.#queue[this.#next++];

        return item;
    }

    toJSON() {
        return this.#queue;
    }
}

export class SwiftcallNativeFunction {
    #argumentBuffers: StrongQueue<NativePointer>;
    #resultType: NativeType;
    #returnBufferSize?: number;
    #returnBuffer?: NativePointer;
    #extraBuffer: NativePointer;
    #nativeFunction: NativeFunction;

    constructor(target: NativePointer, resultType: NativeType,
                argTypes: NativeType[], context?: NativePointer,
                errorResult?: NativePointer) {
        this.#argumentBuffers = new StrongQueue<NativePointer>();

        argTypes = argTypes.map(argType => {
            if (Array.isArray(argType) && argType.length > 4) {
                const buf = Memory.alloc(Process.pointerSize * argType.length);
                this.#argumentBuffers.enqueue(buf);

                return "pointer";
            }
            return argType;
        }).flat();

        this.#resultType = resultType;
        let indirectResult: NativePointer;

        if (Array.isArray(resultType)) {
            this.#returnBufferSize = Process.pointerSize * resultType.length;
            this.#returnBuffer = Memory.alloc(this.#returnBufferSize);

            if (resultType.length > 4) {
                indirectResult = this.#returnBuffer;
            }
        } else {
            this.#returnBufferSize = Process.pointerSize;
            this.#returnBuffer = Memory.alloc(this.#returnBufferSize);
        }

        this.#extraBuffer= Memory.alloc(Process.pointerSize * 2);

        const maxPatchSize = 0x4C;
        const trampoline = TrampolinePool.allocateTrampoline(maxPatchSize);

        Memory.patchCode(trampoline, maxPatchSize, (code) => {
            const writer = new Arm64Writer(code, { pc: trampoline });

            /* TODO: not thread safe? */
            writer.putLdrRegAddress("x15", this.#extraBuffer);
            writer.putStpRegRegRegOffset("x29", "x30", "x15", 0, "post-adjust");

            if (context !== undefined) {
                writer.putLdrRegAddress("x20", context);
            }

            /* TODO: test this */
            if (errorResult !== undefined) {
                writer.putLdrRegAddress("x21", errorResult);
            }

            if (indirectResult !== undefined) {
                writer.putLdrRegAddress("x8", indirectResult);
            }

            writer.putLdrRegAddress("x14", target)
            writer.putBlrRegNoAuth("x14");

            if (indirectResult === undefined && this.#returnBufferSize > 0) {
                let i = 0, offset = 0;
                writer.putLdrRegAddress("x15", this.#returnBuffer);

                for (; offset < this.#returnBufferSize; i++, offset += 8) {
                    const reg = `x${i}` as Arm64Register;
                    writer.putStrRegRegOffset(reg, "x15", offset);
                }
            }

            writer.putLdrRegAddress("x15", this.#extraBuffer);
            writer.putLdpRegRegRegOffset("x29", "x30", "x15", 0, "post-adjust");
            writer.putRet();

            writer.flush();
        });;

        this.#nativeFunction = new NativeFunction(trampoline, "pointer", argTypes)
    }

    wrapper = (...args: NativeArgumentValue[]) => {
        /* TODO: Type-check args? */

        args = args.map(arg => {
            if (Array.isArray(arg) && arg.length > 4) {
                const argBuf = this.#argumentBuffers.dequeue();
                moveValueToBuffer(arg, argBuf);

                return argBuf;
            }
            return arg;
        }).flat();

        const func = this.#nativeFunction;
        func(...args);

        if (this.#returnBufferSize === 0) {
            return undefined;
        }

        const result: NativeReturnValue[] = [];

        if (!Array.isArray(this.#resultType)) {
            return this.#returnBuffer.readValue(this.#resultType);
        }

        /* TODO: handle signed values */
        for (let i = 0, j = 0; i < this.#returnBufferSize; i += 8, j++) {
            const type = this.#resultType[j];
            result.push(this.#returnBuffer.add(i).readValue(type));
        }

        return result;
    }

    call(...args: NativeArgumentValue[]): NativeReturnValue[] {
        return this.wrapper(args);
    }
}

declare global {
    interface NativePointer {
        readValue(type: NativeType);
    }
}

NativePointer.prototype.readValue = function(type: NativeType): NativeReturnValue {
    switch (type) {
        case "pointer":
            return this.readPointer();
        case "string":
            return this.readCString();
        case "int":
            return this.readInt();
        case "uint":
            return this.readUInt();
        case "long":
            return this.readLong();
        case "ulong":
            return this.readULong();
        case "int8":
            return this.readS8();
        case "uint8":
            return this.readU8();
        case "int16":
            return this.readS16();
        case "uint16":
            return this.readU16();
        case "int32":
            return this.readS32();
        case "uint32":
            return this.readU32();
        case "int64":
            return this.readS64();
        case "uint64":
            return this.readU64();
        default:
            throw new Error(`Unimplemented type: ${type}`);
    }
}
