import { bindProtocolConformances, ClassMap, enumerateProtocols, enumerateTypes, EnumMap, ProtocolMap, StructMap,
         SwiftModule, TypeMap } from "./macho";
import { Class, Enum, Struct, Type } from "./types";

export class Registry {
    private static sharedInstance: Registry;

    readonly modules: Record<string, SwiftModule> = {};
    readonly classes: ClassMap = {};
    readonly structs: StructMap = {};
    readonly enums: EnumMap = {};
    readonly protocols: ProtocolMap  = {};
    readonly cachedTypes: TypeMap = {};

    private readonly swiftyNameMap: Record<string, string> = {};

    static shared() {
        if (Registry.sharedInstance === undefined) {
            Registry.sharedInstance = new Registry();
        }

        return Registry.sharedInstance;
    }

    private constructor() {
        const allModules = new ModuleMap().values();

        for (const module of allModules) {
            for (const type of enumerateTypes(module)) {
                const moduleName = type.$moduleName;

                switch (type.kind) {
                    case "Class":
                        const klass = type as Class;
                        this.getModule(moduleName).addClass(klass);
                        this.classes[klass.$name] = klass;
                        break;
                    case "Struct":
                        const struct = type as Struct;
                        this.getModule(moduleName).addStruct(struct);
                        this.structs[type.$name] = type as Struct;
                        break;
                    case "Enum":
                        const anEnum = type as Enum;
                        this.getModule(moduleName).addEnum(anEnum);
                        this.enums[type.$name] = anEnum;
                        break;
                }
            }

            for (const proto of enumerateProtocols(module)) {
                this.getModule(proto.moduleName).addProtocol(proto);
                this.protocols[proto.name] = proto;
            }
        }

        for (const module of allModules) {
            bindProtocolConformances(module, this.typeByName.bind(this));
        }
    }

    typesForModule(nativeName: string): Type[] {
        const swiftyName = this.swiftyNameMap[nativeName];
        const module = this.modules[swiftyName];

        if (module === undefined) {
            return [];
        }

        return [...Object.values(module.classes),
                ...Object.values(module.structs),
                ...Object.values(module.enums)];
    }

    typeByName(name: string) {
        if (name in this.cachedTypes) {
            return this.cachedTypes[name];
        }

        const moduleName = name.split(".")[0];
        const typeName = name.split(".")[1];
        if (moduleName === undefined || typeName === undefined) {
            throw new Error("Bad type name: " + name);
        }

        const module = this.modules[moduleName];
        if (module === undefined) {
            throw new Error("Module not found: " + moduleName);
        }

        const type = module.classes[typeName] ||
                     module.structs[typeName] ||
                     module.enums[typeName];

        if (type === undefined) {
            throw new Error("Type not found: " + name);
        }

        this.cachedTypes[name] = type;
        return type;
    }

    private getModule(name: string) {
        if (name in this.modules) {
            return this.modules[name];
        }

        const module = new SwiftModule(name);
        this.modules[name] = module;
        return module;
    }
}
