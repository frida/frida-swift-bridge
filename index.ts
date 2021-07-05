/**
 * TODO:
 *  - Use proper platform checks (CPU and OS)
 *  - Use strict null checks?
 *  - Use platform-agnostic data structure sizes (size_t et al.)
 */

import { getApi, API } from "./lib/api";
import { getSwift5Types, Type, Class, Struct, Enum } from "./lib/types";
import { enumerateDemangledSymbols } from "./lib/symbols";

class Runtime {
    #api: API = null;
    #apiError: Error = null;
    #allModules: ModuleMap;
    #classRegistry: Record<string, Class> = {};
    #structRegistry: Record<string, Struct> = {};
    #enumRegistry: Record<string, Enum> = {};

    constructor() {
        this.tryInitialize();
        this.#allModules = new ModuleMap();
    }

    get available(): boolean {
        return this.tryInitialize();
    }

    get api(): API {
        return getApi();
    }

    enumerateTypes(module: Module): Type[] {
        const types: Type[] = [];

        if (module === undefined) {
            for (const m of this.#allModules.values()) {
                types.push(...getSwift5Types(m));
            }
        } else {
            types.push(...getSwift5Types(module));
        }

        return types;
    }

    loadTypeRegistries() {
        for (const m of this.#allModules.values()) {
            const types = getSwift5Types(m);

            types.forEach(t => {
                switch (t.kind) {
                    case "Class":
                        this.#classRegistry[t.name] = t as Class;
                        break;
                    case "Struct":
                        this.#structRegistry[t.name] = t as Struct;
                        break;
                    case "Enum":
                        this.#enumRegistry[t.name] = t as Enum;
                        break;
                }
            });
        }
    }

    get classes(): Record<string, Class> {
        if (Object.keys(this.#classRegistry).length !== 0) {
            return this.#classRegistry;
        }

        this.loadTypeRegistries();

        return this.#classRegistry;
    }

    get structs(): Record<string, Struct> {
        if (Object.keys(this.#structRegistry).length !== 0) {
            return this.#structRegistry;
        }

        this.loadTypeRegistries();

        return this.#structRegistry;
    }

    get enums(): Record<string, Enum> {
        if (Object.keys(this.#enumRegistry).length !== 0) {
            return this.#enumRegistry;
        }

        this.loadTypeRegistries();

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
}

export const Swift = new Runtime();
