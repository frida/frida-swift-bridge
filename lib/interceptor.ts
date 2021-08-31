/* eslint-disable @typescript-eslint/no-namespace */
import {
    TargetEnumMetadata,
    TargetStructMetadata,
    TargetValueMetadata,
} from "../abi/metadata";
import { MetadataKind } from "../abi/metadatavalues";
import { makeBufferFromValue, RawFields, sizeInQWordsRounded } from "./buffer";
import {
    INDRIECT_RETURN_REGISTER,
    MAX_LOADABLE_SIZE,
    shouldPassIndirectly,
} from "./callingconvention";
import {
    findProtocolDescriptor,
    getDemangledSymbol,
    untypedMetadataFor,
} from "./macho";
import { parseSwiftMethodSignature } from "./symbols";
import {
    EnumValue,
    ObjectInstance,
    ProtocolComposition,
    RuntimeInstance,
    StructValue,
    ValueInstance,
} from "./types";

type InvocationOnLeaveCallback = (
    this: InvocationContext,
    retval: InvocationReturnValue
) => void;

type SwiftInvocationArguments = RuntimeInstance[];
type SwiftInvocationReturnValue = RuntimeInstance;

interface SwiftScriptInvocationListenerCallbacks {
    onEnter?: (this: InvocationContext, args: SwiftInvocationArguments) => void;
    onLeave?: (
        this: InvocationContext,
        retval: SwiftInvocationReturnValue
    ) => void;
}

export namespace SwiftInterceptor {
    export function attach(
        target: NativePointer,
        callbacks: SwiftScriptInvocationListenerCallbacks
    ): InvocationListener {
        const symbol = getDemangledSymbol(target);
        const parsed = parseSwiftMethodSignature(symbol);
        let indirectRetAddr: NativePointer;

        const onEnter = function (
            this: InvocationContext,
            args: InvocationArguments
        ) {
            indirectRetAddr = this.context[INDRIECT_RETURN_REGISTER];

            if (callbacks.onEnter !== undefined) {
                const swiftyArgs: RuntimeInstance[] = [];
                let argsIndex = 0;
                let currentArg: RuntimeInstance;

                for (const argTypeName of parsed.argTypeNames) {
                    if (isProtocolTypeName(argTypeName)) {
                        const composition =
                            ProtocolComposition.fromSignature(argTypeName);
                        const size = composition.sizeofExistentialContainer;
                        let buf: NativePointer;

                        if (size <= MAX_LOADABLE_SIZE) {
                            const sizeQWords = sizeInQWordsRounded(size);
                            const end = argsIndex + sizeQWords;
                            const raw = sliceArgs(args, argsIndex, end);
                            buf = makeBufferFromValue(raw);
                            argsIndex += sizeQWords;
                        } else {
                            buf = args[argsIndex++];
                        }

                        currentArg = ValueInstance.fromExistentialContainer(
                            buf,
                            composition
                        );
                        swiftyArgs.push(currentArg);
                        continue;
                    }

                    const argType = untypedMetadataFor(argTypeName);
                    if (argType.isClassObject()) {
                        currentArg = new ObjectInstance(args[argsIndex++]);
                    } else {
                        const sizeQWords = sizeInQWordsRounded(
                            argType.getTypeLayout().stride
                        );
                        const kind = argType.getKind();
                        const end = argsIndex + sizeQWords;
                        const raw = sliceArgs(args, argsIndex, end);

                        if (kind === MetadataKind.Struct) {
                            const metadata = argType as TargetStructMetadata;
                            currentArg = new StructValue(metadata, { raw });
                        } else if (kind === MetadataKind.Enum) {
                            const metadata = argType as TargetEnumMetadata;
                            currentArg = new EnumValue(metadata, { raw });
                        } else {
                            throw new Error("Unhandled metadata kind: " + kind);
                        }

                        argsIndex += sizeQWords;
                    }
                    swiftyArgs.push(currentArg);
                }

                const swiftyOnEnter = callbacks.onEnter.bind(this);
                swiftyOnEnter(swiftyArgs);
            }
        };

        let onLeave: InvocationOnLeaveCallback;
        if (callbacks.onLeave !== undefined) {
            onLeave = function (
                this: InvocationContext,
                retval: InvocationReturnValue
            ) {
                const retTypeName = parsed.retTypeName;
                let swiftyRetval: RuntimeInstance;

                if (isProtocolTypeName(retTypeName)) {
                    const composition =
                        ProtocolComposition.fromSignature(retTypeName);
                    const size = composition.sizeofExistentialContainer;
                    let buf: NativePointer;

                    if (size <= MAX_LOADABLE_SIZE) {
                        const sizeQWords = sizeInQWordsRounded(size);
                        const raw: RawFields = [];
                        for (let i = 0; i != sizeQWords; i++) {
                            raw.push(this.context[`x${i}`]);
                        }
                        buf = makeBufferFromValue(raw);
                    } else {
                        buf = indirectRetAddr;
                    }

                    swiftyRetval = ValueInstance.fromExistentialContainer(
                        buf,
                        composition
                    );
                } else {
                    const retType = untypedMetadataFor(parsed.retTypeName);
                    if (retType.isClassObject()) {
                        swiftyRetval = new ObjectInstance(retval);
                    } else {
                        const stride = retType.getTypeLayout().stride;

                        if (
                            stride <= MAX_LOADABLE_SIZE &&
                            !shouldPassIndirectly(retType)
                        ) {
                            const sizeQWords = sizeInQWordsRounded(
                                retType.getTypeLayout().stride
                            );
                            const raw: RawFields = [];

                            for (let i = 0; i < sizeQWords; i++) {
                                raw.push(this.context[`x${i}`]);
                            }

                            swiftyRetval = ValueInstance.fromRaw(
                                raw,
                                retType as TargetValueMetadata
                            );
                        } else {
                            swiftyRetval = ValueInstance.fromCopy(
                                indirectRetAddr,
                                retType as TargetValueMetadata
                            );
                        }
                    }
                }

                const swiftyOnLeave = callbacks.onLeave.bind(this);
                swiftyOnLeave(swiftyRetval);
            };
        }

        return Interceptor.attach(target, {
            onEnter,
            onLeave,
        });
    }
}

function isProtocolTypeName(name: string) {
    return name.indexOf("&") > -1 || findProtocolDescriptor(name);
}

function sliceArgs(
    args: InvocationArguments,
    start: number,
    end: number
): InvocationArguments {
    const result: InvocationArguments = [];
    for (let i = start; i != end; i++) {
        result.push(args[i]);
    }
    return result;
}
