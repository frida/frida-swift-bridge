import { Class, Enum, Struct, SwiftModule, Type } from "./types";

export class Registry {
    private static sharedInstance: Registry;

    readonly modules: Record<string, SwiftModule> = {};
    readonly types: Record<string, Type> = {};
    readonly classes: Record<string, Class> = {};
    readonly structs: Record<string, Struct> = {};
    readonly enums: Record<string, Enum> = {};

    private readonly swiftyNameMap: Record<string, string> = {};

    static shared() {
        if (Registry.sharedInstance === undefined) {
            Registry.sharedInstance = new Registry();
        }

        return Registry.sharedInstance;
    }

    private constructor() {
        const allModules = new ModuleMap();

        for (const module of allModules.values()) {
            const swiftModule = new SwiftModule(module);
            const swiftyName = swiftModule.$name;

            /* Module doesn't have any Swift types */
            if (swiftyName === undefined) {
                continue;
            }

            this.swiftyNameMap[module.name] = swiftyName;
            this.modules[swiftyName] = swiftModule;

            for (const type of swiftModule.$allTypes) {
                this.types[type.name] = type;

                switch (type.kind) {
                    case "Class":
                        this.classes[type.name] = type as Class;
                        break;
                    case "Struct":
                        this.structs[type.name] = type as Struct;
                        break;
                    case "Enum":
                        this.enums[type.name] = type as Enum;
                        break;
                    default:
                        throw new Error(`Unknown type kind: ${type.kind}`);
                }
            }
        }
    }

    typesForModule(nativeName: string): Type[] {
        const swiftyName = this.swiftyNameMap[nativeName];
        const module = this.modules[swiftyName];
        if (module === undefined) {
            return [];
        }
        return module.$allTypes;
    }

    typeByName(name: string) {
        if (name.startsWith("Swift.")) {
            name = name.substring(6);
        }
        return this.types[name];
    }
}