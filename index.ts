/**
 * TODO:
 *  - Use proper platform checks (CPU and OS)
 *  - Use strict null checks?
 *  - Use platform-agnostic data structure sizes (size_t et al.)
 *  - Register for notification when a new module is added
 *  - Add demangled symbol look-up
 *  - Add parsing of function names
 *  - inout params
 */

import { getApi, API } from "./lib/api";
import {
    Class,
    Struct,
    Enum,
    Protocol,
    ProtocolComposition,
    EnumValue,
    ObjectInstance,
    StructValue,
    Type,
} from "./lib/types";
import {
    makeSwiftNativeFunction,
    NativeSwiftType,
} from "./lib/callingconvention";
import { Registry, SwiftModule } from "./lib/registry";
import { SwiftInterceptor } from "./lib/interceptor";

type ConvenientSwiftType = Type | Protocol | ProtocolComposition | NativeType;

class Runtime {
    #api: API = null;
    #apiError: Error = null;

    constructor() {
        try {
            this.tryInitialize();
        } catch (e) {}
    }

    get available(): boolean {
        return this.tryInitialize();
    }

    get api(): API {
        return this.#api;
    }

    get modules(): Record<string, SwiftModule> {
        return Registry.shared().modules;
    }

    get classes(): Record<string, Class> {
        return Registry.shared().classes;
    }

    get structs(): Record<string, Struct> {
        return Registry.shared().structs;
    }

    get enums(): Record<string, Enum> {
        return Registry.shared().enums;
    }

    get protocols(): Record<string, Protocol> {
        return Registry.shared().protocols;
    }

    readonly Object = ObjectInstance;
    readonly Struct = StructValue;
    readonly Enum = EnumValue;
    readonly ProtocolComposition = ProtocolComposition;
    readonly Interceptor = SwiftInterceptor;

    NativeFunction(
        address: NativePointer,
        retType: ConvenientSwiftType,
        argTypes: ConvenientSwiftType[],
        context?: NativePointer,
        throws?: boolean
    ) {
        function getNativeType(type: ConvenientSwiftType): NativeSwiftType {
            if (type instanceof Type) {
                return type.$metadata;
            } else if (type instanceof Protocol) {
                return new ProtocolComposition(type);
            }

            return type;
        }

        const nativeRetType = getNativeType(retType);
        const nativeArgType = argTypes.map((ty) => getNativeType(ty));

        return makeSwiftNativeFunction(
            address,
            nativeRetType,
            nativeArgType,
            context,
            throws
        );
    }

    private tryInitialize(): boolean {
        if (this.#api !== null) {
            return true;
        }

        if (this.#apiError !== null) {
            throw this.#apiError;
        }

        try {
            this.#api = getApi();
        } catch (e) {
            this.#apiError = e;
            throw e;
        }

        return this.#api !== null;
    }
}

export const Swift = new Runtime();
