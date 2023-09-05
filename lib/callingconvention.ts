/**
 * TODO:
 *  - Implement Double and other SIMD types
 *  - Add check for correct number / type of arguments.
 * 	- Can we tell whether a function throws via its metadata?
 */

import {
    EnumValue,
    ObjectInstance,
    ProtocolComposition,
    RuntimeInstance,
    StructValue,
    ValueInstance,
} from "./types";
import {
    TargetEnumMetadata,
    TargetMetadata,
    TargetStructMetadata,
    TargetValueMetadata,
} from "../abi/metadata";
import {
    ClassExistentialContainer,
    TargetOpaqueExistentialContainer,
} from "../runtime/existentialcontainer";
import { getProtocolConformancesFor } from "./macho";
import { MetadataKind } from "../abi/metadatavalues";
import {
    makeBufferFromValue,
    makeValueFromBuffer,
    moveValueToBuffer,
} from "./buffer";

export type NativeSwiftType = TargetMetadata | ProtocolComposition | NativeFunctionReturnType | NativeFunctionArgumentType;
export const MAX_LOADABLE_SIZE = Process.pointerSize * 4;
export const INDRIECT_RETURN_REGISTER = "x8";

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

export interface SwiftNativeFunction {
    address: NativePointer;
    (...args: any[]): any;
}

/**
 * TODO:
 *  - Re-cook this spaghetti
 *  - Add dynamic type checks
 */
export function makeSwiftNativeFunction(
    address: NativePointer,
    retType: NativeSwiftType,
    argTypes: NativeSwiftType[],
    context?: NativePointer,
    throws?: boolean
): SwiftNativeFunction {
    const loweredArgType = argTypes.map((ty) => lowerSemantically(ty));
    const loweredRetType = lowerSemantically(retType) as NativeFunctionReturnType;

    const swiftcallWrapper = new SwiftcallNativeFunction(
        address,
        loweredRetType,
        loweredArgType,
        context
    ).wrapper;

    const wrapper = function (...args: RuntimeInstance[]) {
        const actualArgs: any[] = [];

        for (const [i, arg] of args.entries()) {
            const argType = argTypes[i];

            /* NativeType: e.g. 'uint64', 'pointer', 'bool' */
            if (typeof argType === "string" || Array.isArray(argType)) {
                actualArgs.push(arg);
                continue;
            }

            if (argType instanceof TargetMetadata) {
                actualArgs.push(lowerPhysically(arg));
                continue;
            }

            const composition = argType;
            const typeMetadata = arg.$metadata;
            let container:
                | TargetOpaqueExistentialContainer
                | ClassExistentialContainer;

            if (!composition.isClassOnly) {
                container = TargetOpaqueExistentialContainer.alloc(
                    composition.numProtocols
                );
                container.type = typeMetadata;

                if (typeMetadata.isClassObject()) {
                    container.buffer.privateData.writePointer(arg.handle);
                } else {
                    const box = typeMetadata.allocateBoxForExistentialIn(
                        container.buffer
                    );
                    typeMetadata.vw_initializeWithCopy(box, arg.handle);
                }
            } else {
                container = ClassExistentialContainer.alloc(
                    composition.numProtocols
                );
                container.value = arg.handle;
            }

            const base = container.getWitnessTables();
            for (const [i, proto] of composition.protocols.entries()) {
                const typeName = typeMetadata.getFullTypeName();
                const conformance =
                    getProtocolConformancesFor(typeName)[proto.name];
                if (conformance === undefined) {
                    throw new Error(
                        `Type ${typeName} does not conform to protocol ${proto.name}`
                    );
                }
                const vwt = conformance.witnessTable;

                base.add(i * Process.pointerSize).writePointer(vwt);
            }

            actualArgs.push(lowerPhysically(container));
        }

        const retval = swiftcallWrapper(...actualArgs);

        if (typeof retType === "string" || Array.isArray(retType)) {
            return retval;
        }

        if (retType instanceof TargetMetadata) {
            switch (retType.getKind()) {
                case MetadataKind.Struct:
                    return new StructValue(retType as TargetStructMetadata, {
                        raw: retval as PointerSized[],
                    });
                case MetadataKind.Enum:
                    return new EnumValue(retType as TargetEnumMetadata, {
                        raw: retval as PointerSized[],
                    });
                case MetadataKind.Class:
                    return new ObjectInstance(retval as NativePointer);
                default:
                    throw new Error("Unimplemented kind: " + retType.getKind());
            }
        }

        const buf = makeBufferFromValue(retval as PointerSized[]);
        return ValueInstance.fromExistentialContainer(buf, retType);
    };

    return Object.assign(wrapper, { address });
}

function lowerSemantically(type: NativeSwiftType): NativeFunctionReturnType | NativeFunctionArgumentType {
    if (typeof type === "string" || Array.isArray(type)) {
        return type;
    }

    if (type instanceof ProtocolComposition) {
        const augmented = Array(type.numProtocols).fill("pointer");

        if (type.isClassOnly) {
            return ["pointer", ...augmented];
        } else {
            return ["pointer", "pointer", "pointer", "pointer", ...augmented];
        }
    }

    if (type.getKind() === MetadataKind.Class || shouldPassIndirectly(type)) {
        return "pointer";
    }

    const layout = (<TargetValueMetadata>type).getTypeLayout();
    /**TODO:
     * - Make it arch-agnostic
     * - Unsigned ints?
     */
    let sizeInQWords = layout.stride / 8;
    sizeInQWords = sizeInQWords > 1 ? sizeInQWords : 1;
    return Array(sizeInQWords).fill("uint64");
}

type PointerSized = UInt64 | NativePointer;

function lowerPhysically(
    value:
        | RuntimeInstance
        | TargetOpaqueExistentialContainer
        | ClassExistentialContainer
): PointerSized | PointerSized[] {
    if (value instanceof ObjectInstance) {
        return value.handle;
    } else if (value instanceof TargetOpaqueExistentialContainer) {
        return makeValueFromBuffer(value.handle, value.sizeof);
    } else if (value instanceof ClassExistentialContainer) {
        /* FIXME: use a generic, type-aware buffer-to-value transformer */
        const container = value as ClassExistentialContainer;
        const lowered: NativePointer[] = [];
        for (let i = 0; i != container.sizeof; i += 8) {
            lowered.push(container.handle.add(i).readPointer());
        }
        return lowered;
    }

    if (shouldPassIndirectly(value.$metadata)) {
        return value.handle;
    }

    return makeValueFromBuffer(
        value.handle,
        value.$metadata.getTypeLayout().stride
    );
}

export function shouldPassIndirectly(typeMetadata: TargetMetadata): boolean {
    const vwt = typeMetadata.getValueWitnesses();
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

        const item = this.#queue[this.#next++];

        return item;
    }

    resetCursor() {
        this.#next = 0;
    }

    toJSON() {
        return this.#queue;
    }
}

export class SwiftcallNativeFunction {
    #argumentBuffers: StrongQueue<NativePointer>;
    #resultType: NativeFunctionReturnType;
    #returnBufferSize?: number;
    #returnBuffer?: NativePointer;
    #extraBuffer: NativePointer;
    #nativeFunction: NativeFunction<any, any>;

    constructor(
        target: NativePointer,
        resultType: NativeFunctionReturnType,
        argTypes: NativeFunctionArgumentType[],
        context?: NativePointer,
        errorResult?: NativePointer
    ) {
        this.#argumentBuffers = new StrongQueue<NativePointer>();

        argTypes = argTypes
            .map((argType) => {
                if (Array.isArray(argType) && argType.length > 4) {
                    const buf = Memory.alloc(
                        Process.pointerSize * argType.length
                    );
                    this.#argumentBuffers.enqueue(buf);

                    return "pointer";
                }
                return argType;
            })
            .flat();

        this.#resultType = resultType;
        let indirectResult: NativePointer;

        if (Array.isArray(resultType)) {
            this.#returnBufferSize = Process.pointerSize * resultType.length;
            this.#returnBuffer = Memory.alloc(this.#returnBufferSize);

            if (resultType.length > 4) {
                indirectResult = this.#returnBuffer;
            }
        } else if (resultType === "void") {
            this.#returnBufferSize = 0;
        } else {
            this.#returnBufferSize = Process.pointerSize;
            this.#returnBuffer = Memory.alloc(this.#returnBufferSize);
        }

        this.#extraBuffer = Memory.alloc(Process.pointerSize * 2);

        const maxPatchSize = 0x4c;
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

            writer.putLdrRegAddress("x14", target);
            writer.putBlrRegNoAuth("x14");

            if (indirectResult === undefined && this.#returnBufferSize > 0) {
                writer.putLdrRegAddress("x15", this.#returnBuffer);

                let i = 0,
                    offset = 0;

                for (; offset < this.#returnBufferSize; i++, offset += 8) {
                    const reg = `x${i}` as Arm64Register;
                    writer.putStrRegRegOffset(reg, "x15", offset);
                }
            }

            writer.putLdrRegAddress("x15", this.#extraBuffer);
            writer.putLdpRegRegRegOffset("x29", "x30", "x15", 0, "post-adjust");
            writer.putRet();

            writer.flush();
        });

        this.#nativeFunction = new NativeFunction(
            trampoline,
            "pointer",
            argTypes
        );
    }

    wrapper = (...args: NativeFunctionArgumentValue[]) => {
        /* TODO: Type-check args */

        this.#argumentBuffers.resetCursor();
        args = args
            .map((arg) => {
                if (Array.isArray(arg) && arg.length > 4) {
                    const argBuf = this.#argumentBuffers.dequeue();
                    moveValueToBuffer(arg as Int64[], argBuf);

                    return argBuf;
                }
                return arg;
            })
            .flat();

        const func = this.#nativeFunction;
        func(...args);

        if (this.#returnBufferSize === 0) {
            return undefined;
        }

        const result: NativeFunctionReturnValue[] = [];

        if (!Array.isArray(this.#resultType)) {
            return this.#returnBuffer.readValue(this.#resultType);
        }

        /* TODO: handle signed values */
        for (let i = 0, j = 0; i < this.#returnBufferSize; i += 8, j++) {
            const type = this.#resultType[j];
            result.push(this.#returnBuffer.add(i).readValue(type));
        }

        return result;
    };

    call(...args: NativeFunctionArgumentValue[]): NativeFunctionReturnValue {
        return this.wrapper(args);
    }
}

declare global {
    interface NativePointer {
        readValue(type: NativeFunctionReturnType | string): NativeFunctionReturnValue;
    }
}

NativePointer.prototype.readValue = function (
    type: NativeFunctionReturnType | "string"
): NativeFunctionReturnValue {
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
};
