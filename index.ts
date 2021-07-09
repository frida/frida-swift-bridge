/**
 * TODO:
 *  - Use proper platform checks (CPU and OS)
 *  - Use strict null checks?
 *  - Use platform-agnostic data structure sizes (size_t et al.)
 *  - Register for notification when a new module is added
 */

import { getApi, API } from "./lib/api";
import { SwiftModule, Type, Class, Struct, Enum } from "./lib/types";
import { enumerateDemangledSymbols } from "./lib/symbols";

interface TypeEnumerationOptions {
    ownedBy: Module;
}

class Runtime {
    #api: API = null;
    #apiError: Error = null;
    #allModules = new ModuleMap();
    #swiftyNameMapping: Record<string, string> = {};
    #moduleRegistry: Record<string, SwiftModule> = {};
    #classRegistry: Record<string, Class> = {};
    #structRegistry: Record<string, Struct> = {};
    #enumRegistry: Record<string, Enum> = {};

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
            return this.tryGetCachedModuleTypes(module);
        } else {
            for (module of this.#allModules.values()) {
                result.push(...this.tryGetCachedModuleTypes(module));
            }
        }

        return result;
    }

    get modules(): Record<string, SwiftModule> {
        if (Object.keys(this.#moduleRegistry).length !== 0) {
            return this.#moduleRegistry;
        }

        this.enumerateTypes();

        return this.#moduleRegistry;
    }

    get classes(): Record<string, Class> {
        if (Object.keys(this.#classRegistry).length !== 0) {
            return this.#classRegistry;
        }

        this.enumerateTypes();

        return this.#classRegistry;
    }

    get structs(): Record<string, Struct> {
        if (Object.keys(this.#structRegistry).length !== 0) {
            return this.#structRegistry;
        }

        this.enumerateTypes();

        return this.#structRegistry;
    }

    get enums(): Record<string, Enum> {
        if (Object.keys(this.#enumRegistry).length !== 0) {
            return this.#enumRegistry;
        }

        this.enumerateTypes();

        return this.#enumRegistry;
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

    tryGetCachedModuleTypes(module: Module): Type[] {
        const swiftyName = this.#swiftyNameMapping[module.name];
        if (swiftyName !== undefined) {
            return this.#moduleRegistry[swiftyName].$allTypes;
        }

        const swiftModule = new SwiftModule(module);
        if (swiftModule.$allTypes.length ===  0) {
            return [];
        }

        this.#swiftyNameMapping[swiftModule.$name] = module.name;
        this.#moduleRegistry[swiftModule.$name] = swiftModule;

        for (const klass of swiftModule.$classes) {
            this.#classRegistry[klass.name] = klass;
        }

        for (const struct of swiftModule.$structs) {
            this.#structRegistry[struct.name] = struct;
        }

        for (const anEnum of swiftModule.$enums) {
            this.#enumRegistry[anEnum.name] = anEnum;
        }

        return swiftModule.$allTypes;
    }
}

export const Swift = new Runtime();
