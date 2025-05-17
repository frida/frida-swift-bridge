export interface Api {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [func: string]: Function;
}

const CSTypeRef: NativeFunctionReturnType = ["pointer", "pointer"];

let cachedApi: Api = null;
let cachedPrivateAPI: Api = null;

export function getApi(): Api {
    if (Process.arch !== "arm64" || Process.platform  !== "darwin") {
        throw new Error("Only arm64(e) Darwin is currently supported");
    }

    if (cachedApi !== null) {
        return cachedApi;
    }

    cachedApi = makeAPI([
        {
            module: "libswiftCore.dylib",
            functions: {
                swift_demangle: [
                    "pointer",
                    ["pointer", "size_t", "pointer", "pointer", "int32"],
                ],
            },
        },
    ]);

    const swiftAPI = makeAPI([
        {
            module: "libswiftCore.dylib",
            functions: {
                swift_allocBox: [["pointer", "pointer"], ["pointer"]],
            },
        },
    ]);
    cachedApi = Object.assign(cachedApi, swiftAPI);

    return cachedApi;
}

export function getPrivateAPI(): Api {
    if (cachedPrivateAPI !== null) {
        return cachedPrivateAPI;
    }

    Process.getModuleByName("CoreFoundation").ensureInitialized();

    if (Process.findModuleByName("CoreSymbolication") === null) {
        try {
            Module.load("/System/Library/PrivateFrameworks/CoreSymbolication.framework/CoreSymbolication");
        } catch (e) {
            Module.load("/System/Library/PrivateFrameworks/CoreSymbolication.framework/Versions/A/CoreSymbolication");
        }
    }

    cachedPrivateAPI = makeAPI([
        {
            module: "libmacho.dylib",
            functions: {
                getsectiondata: [
                    "pointer",
                    ["pointer", "pointer", "pointer", "pointer"],
                ],
            },
        },
        {
            module: "CoreSymbolication",
            functions: {
                CSSymbolicatorCreateWithPid: [
                    CSTypeRef,
                    ["int"]
                ],
                CSSymbolicatorCreateWithTask: [
                    CSTypeRef,
                    ["uint"]
                ],
                CSSymbolicatorGetSymbolWithAddressAtTime: [
                    CSTypeRef,
                    [CSTypeRef, "pointer", "uint64"]
                ],
                CSIsNull: [
                    "bool",
                    [CSTypeRef]
                ],
                CSSymbolGetMangledName: [
                    "pointer",
                    [CSTypeRef]
                ],
                CSRelease: [
                    "void",
                    [CSTypeRef]
                ]
            }
        },
        {
            module: "libsystem_kernel.dylib",
            functions: {
                mach_task_self: [
                    "uint",
                    []
                ],
            }
        }
    ]);

    return cachedPrivateAPI;
}

type ApiSpec = ApiSpecEntry[];

interface ApiSpecEntry {
    module: string;
    functions: Record<string, [NativeFunctionReturnType, NativeFunctionArgumentType[]]>;
}

function makeAPI(spec: ApiSpec): Api {
    const result: Api = {};

    for (const entry of spec) {
        const module = Process.getModuleByName(entry.module);
        module.ensureInitialized();

        for (const [name, [returnType, argumentTypes]] of Object.entries(entry.functions)) {
            const impl = module.getExportByName(name);
            result[name] = new NativeFunction(impl, returnType, argumentTypes);
        }
    }

    return result;
}
