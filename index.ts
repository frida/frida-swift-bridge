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
import { SwiftModule, Type, Class, Struct, Enum, Protocol } from "./lib/types";
import { enumerateDemangledSymbols } from "./lib/symbols";
import { makeSwiftNativeFunction, SwiftType } from "./lib/callingconvention";
import { Registry } from "./lib/registry";

interface TypeEnumerationOptions {
    ownedBy: Module;
}

class Runtime {
    #api: API = null;
    #apiError: Error = null;

    constructor() {
        this.tryInitialize();
    }

    get available(): boolean {
        return this.tryInitialize();
    }

    get api(): API {
        return getApi();
    }

    enumerateTypes(options?: TypeEnumerationOptions): Type[] {
        let result: Type[] = [];
        let module = options && options.ownedBy;

        if (module !== undefined) {
            return Registry.shared().typesForModule(module.name);
        } else {
            return Object.values(Registry.shared().types).flat();
        }
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
    }

    NativeFunction(address: NativePointer, retType: SwiftType,
                   argTypes: SwiftType[], context?: NativePointer,
                   throws?: boolean) {
        return makeSwiftNativeFunction(address, retType, argTypes, context, throws);
    }
}

export const Swift = new Runtime();
