const MINIMUM_FRIDA = [17, 22, 1];

let resolver: ApiResolver | null = null;
let resolverModuleCount = -1;

// The resolver snapshots the loaded modules when made, so one made before a module loaded would
// not know that module's declarations: a changed module count makes a fresh one.
export function swiftMatches(query: string): ApiResolverMatch[] {
  const count = Process.enumerateModules().length;
  if (resolver === null || count !== resolverModuleCount) {
    requireFrida(MINIMUM_FRIDA);
    resolver = new ApiResolver("swift");
    resolverModuleCount = count;
  }
  return resolver.enumerateMatches(query);
}

export type NameFilter = Module | string;

// A string filter is a glob over the qualified name, matched by the resolver.
export function nameQuery(kind: "types" | "protocols" | "functions", filter?: NameFilter): string {
  if (filter === undefined) {
    return `${kind}:*!*`;
  }
  if (typeof filter === "string") {
    return `${kind}:*!${filter}`;
  }
  if (typeof filter?.path !== "string") {
    throw new Error("expected a Module or a name glob");
  }
  return `${kind}:${filter.path}!*`;
}

function requireFrida(minimum: number[]): void {
  const running = Frida.version.split(".").map((part) => parseInt(part, 10));
  for (let i = 0; i < minimum.length; i++) {
    const have = running[i] ?? 0;
    if (have > minimum[i]) {
      return;
    }
    if (have < minimum[i]) {
      throw new Error(`frida-swift-bridge requires Frida ${minimum.join(".")} or newer, running ${Frida.version}`);
    }
  }
}
