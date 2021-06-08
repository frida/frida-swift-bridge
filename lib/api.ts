export interface API {
    [func: string]: NativeFunction,
}

let cachedApi: API = null;

export function getApi(): API {
    if (cachedApi !== null) {
        return cachedApi;
    }

    Module.ensureInitialized("libswiftCore.dylib");

    let tempApi: API = {};
    const pending = [
        {
            module: "libswiftCore.dylib",
            functions: {
                "swift_demangle": ["pointer", ["pointer", "size_t",
                    "pointer", "pointer", "int32"]],
            }
        }
    ];

    pending.forEach(api => {
        const functions = api.functions || {};
        const module = Process.getModuleByName(api.module);

        Object.keys(functions).forEach(name => {
            const exp = module.findExportByName(name);
            const returnType = functions[name][0];
            const argumentTypes = functions[name][1];
            const native = new NativeFunction(exp, returnType, argumentTypes);

            tempApi[name] = native;
        });
    });

    cachedApi = tempApi;
    return cachedApi;
}