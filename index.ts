/**
 * TODO:
 *  - Use proper platform checks (CPU and OS)
 *  - Use strict null checks?
 *  - Use platform-agnostic data structure sizes (size_t et al.)
 *  - Register for notification when a new module is added
 *  - Add demangled symbol look-up
 *  - Add parsing of function names
 */

import { getApi, API } from "./lib/api";
import { Class, Struct, Enum, Protocol,
         ProtocolComposition } from "./lib/types";
import { enumerateDemangledSymbols } from "./lib/symbols";
import { makeSwiftNativeFunction, SwiftType } from "./lib/callingconvention";
import { Registry } from "./lib/registry";
import { SwiftModule } from "./lib/macho";
import { ObjectInstance, StructValue } from "./lib/runtime";

class Runtime {
    #api: API = null;
    #apiError: Error = null;

    constructor() {
        try {
            this.tryInitialize();
        } catch (e) {
        }
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

    readonly Class = ObjectInstance;
    readonly Struct = StructValue;

    NativeFunction(address: NativePointer, retType: SwiftType,
                   argTypes: SwiftType[], context?: NativePointer,
                   throws?: boolean) {
        return makeSwiftNativeFunction(address, retType, argTypes, context, throws);
    }

    /* TODO: namespace it */
    ComposeProtocol(...protocols: Protocol[]) {
        return new ProtocolComposition(protocols);
    }

    enumerateDemangledSymbols(module: Module): ModuleSymbolDetails[] {
        return enumerateDemangledSymbols(module);
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
