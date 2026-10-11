import { test, expect, describe, beforeEach } from "@frida/injest/agent";
import { loadFixture, loadFixtureSyms } from "./fixtures/load.js";
import { requireSymbolTable } from "./swift.js";

import { StructType, EnumType, ClassType, ClassMetadata, ClassInstance, TupleType, MetatypeType, FunctionType, Metadata, MetadataKind, SwiftError, resolveTypeByMangledName, typeFromDescriptor, findType, asSwiftObject, metadataFor, typeOf, metadataOf } from "../src/abi.js";

import { Swift, SwiftClass, SwiftStruct, SwiftEnum, SwiftTypeFacade } from "../src/index.js";
function mangledType(mangled: string): Metadata {
  return resolveTypeByMangledName({
    address: Memory.allocUtf8String(mangled),
    length: mangled.length,
  })!;
}

function syntheticMetadata(kind: MetadataKind, ...words: NativePointer[]): Metadata {
  const handle = Memory.alloc((1 + words.length) * Process.pointerSize);
  handle.writeU32(kind);
  words.forEach((w, i) => handle.add((i + 1) * Process.pointerSize).writePointer(w));
  return new Metadata(handle);
}

describe("type reflection and facades", () => {
  beforeEach(() => { loadFixture(); });

  test("StructType describes fields; its facade builds a value", () => {
    const t = typeOf(metadataFor("fixture.LoadableStruct")!) as StructType;
    expect(t.name).toBe("fixture.LoadableStruct");
    expect(t.fields.map((f) => f.name)).toEqual(["a", "b", "c", "d"]);
    expect(t.fields.every((f) => !f.isVar)).toBe(true);
    const v = t.facade.$new({ a: 1, b: 2, c: 3, d: 4 });
    expect(v.$fields).toEqual({ a: int64(1), b: int64(2), c: int64(3), d: int64(4) });
    v.$dispose();
  });

  test("EnumType describes cases; its facade's $case builds payload and empty cases", () => {
    const t = typeOf(metadataFor("fixture.Pick")!) as EnumType;
    expect(t.cases.map((c) => c.name).sort()).toEqual(["empty", "value"]);
    const payload = t.facade.$case("value", 7);
    expect(payload.$fields).toEqual({ value: int64(7) });
    payload.$dispose();
    const empty = t.facade.$case("empty");
    expect(empty.$fields).toBe("empty");
    empty.$dispose();
  });

  test("SwiftClass.init runs the real initializer", () => {
    const obj = Swift.class("fixture.Counter")!.init(9);
    expect(obj.$field("count").read()).toEqual(int64(9));
    expect(obj.$fields).toEqual({ count: int64(9) });
  });

  test("SwiftClass.init surfaces a throwing initializer's error as SwiftError", () => {
    const t = Swift.class("fixture.ThrowingGadget")!;
    expect(t.init(7).$fields).toEqual({ id: int64(7) });
    let thrown: unknown = null;
    try {
      t.init(-1);
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof SwiftError).toBe(true);
    expect((thrown as SwiftError).value).toBe("boom");
  });

  test("SwiftClass.init throws on a failable initializer's nil instead of adopting NULL", () => {
    const t = Swift.class("fixture.FailableGadget")!;
    expect(t.init(7).$fields).toEqual({ id: int64(7) });
    expect(() => t.init(-1)).toThrow(/returned nil/);
  });

  test("SwiftClass.$initializer selects a same-arity overload by { labels }, the escape hatch for a bare name", () => {
    const t = Swift.class("fixture.Vec2")!;
    expect(() => t.init(1, 2)).toThrow(/ambiguous/);
    expect(t.$initializer({ labels: ["x", "y"] }).call(1, 2).$fields).toEqual({ a: int64(1), b: int64(2) });
    expect(t.$initializer({ labels: ["angle", "radius"] }).call(1, 2).$fields).toEqual({ a: int64(2), b: int64(6) });
  });

  test("SwiftClass.init selects a labeled overload from a { label: value } object", () => {
    const t = Swift.class("fixture.Vec2")!;
    expect(t.init({ x: 1, y: 2 }).$fields).toEqual({ a: int64(1), b: int64(2) });
    expect(t.init({ angle: 1, radius: 2 }).$fields).toEqual({ a: int64(2), b: int64(6) });
    // keys matching no initializer fall back to positional: the lone object counts as one argument
    expect(() => t.init({ foo: 1, bar: 2 })).toThrow(/got 1/);
  });

  test("swift_allocObject returns raw storage we can write", () => {
    const t = typeOf(metadataFor("fixture.Counter")!) as ClassType;
    const cls = new ClassMetadata(metadataOf(t).handle);
    const obj = asSwiftObject(
      ClassInstance.adopt(
        Swift.api.swift_allocObject(cls.handle, cls.instanceSize, cls.instanceAlignment - 1)
      )
    );
    expect(obj.$handle.isNull()).toBe(false);
    expect(obj.$owned).toBe(true);
    obj.$field("count").write(3);
    expect(obj.$field("count").read()).toEqual(int64(3));
  });

  test("kind names the Swift kind as toJSON reports it", () => {
    expect(Swift.type("fixture.Rect")!.$type.kind).toBe("struct");
    expect(Swift.type("fixture.Robot")!.$type.kind).toBe("class");
    expect(Swift.type("fixture.Pick")!.$type.kind).toBe("enum");
    expect(typeOf(mangledType("Si_Sit")).kind).toBe("tuple");
  });

  test("typeOf dispatches by metadata kind", () => {
    expect(typeOf(metadataFor("Swift.Int")!) instanceof StructType).toBe(true);
    expect(typeOf(metadataFor("fixture.Pick")!) instanceof EnumType).toBe(true);
    expect(typeOf(metadataFor("fixture.Counter")!) instanceof ClassType).toBe(true);
  });

  test("Swift.type hands out a facade of the matching kind", () => {
    expect(Swift.type("Swift.Int") instanceof SwiftStruct).toBe(true);
    expect(Swift.type("fixture.Pick") instanceof SwiftEnum).toBe(true);
    expect(Swift.type("fixture.Counter") instanceof SwiftClass).toBe(true);
    expect(Swift.type("fixture.Counter") instanceof SwiftTypeFacade).toBe(true);
  });

  test("typeOf wraps a tuple with element reflection", () => {
    const t = typeOf(mangledType("Si_Sit")); // (Int, Int)
    expect(t instanceof TupleType).toBe(true);
    const tuple = t as TupleType;
    expect(tuple.elements.length).toBe(2);
    expect(tuple.elements.every((e) => e.type instanceof StructType)).toBe(true);
    expect(tuple.name).toContain("Int");
  });

  test("typeOf wraps a metatype exposing its instance type", () => {
    const intMeta = metadataFor("Swift.Int")!;
    const t = typeOf(syntheticMetadata(MetadataKind.Metatype, intMeta.handle));
    expect(t instanceof MetatypeType).toBe(true);
    expect((t as MetatypeType).instanceType.name).toBe("Swift.Int");
  });

  test("typeOf wraps a function type exposing its signature", () => {
    const intMeta = metadataFor("Swift.Int")!;
    const t = typeOf(syntheticMetadata(MetadataKind.Function, ptr(0), intMeta.handle));
    expect(t instanceof FunctionType).toBe(true);
    const sig = (t as FunctionType).signature;
    expect(sig.parameters.length).toBe(0);
    expect(sig.throws).toBe(false);
    expect(sig.result instanceof StructType).toBe(true);
  });

  test("typeMethods and instanceMethods split static from instance keys", () => {
    const t = typeOf(metadataFor("fixture.Accumulator")!) as StructType;
    expect(t.instanceMethods().sort()).toEqual(["add(_:)", "addEight(_:_:_:_:_:_:_:_:)", "depositAsync(_:)", "describe(_:)", "drain(into:)", "peek(_:)", "peekAsync(_:)"]);
    expect(t.typeMethods().sort()).toEqual(["doubled(_:)", "sumStaticAsync(_:_:)", "summing(_:_:)", "zero()"]);
    expect(t.fields).toEqual([{ name: "total", type: t.fields[0].type, isVar: true }]);
  });

  test("an instance's $type is its type's reflection", () => {
    const t = typeOf(metadataFor("fixture.Cat")!) as ClassType;
    expect(t.facade.init().$type).toBe(t);
    expect(t.typeMethods()).toEqual([]);
  });

  test("Swift.class/struct/enum resolve their kind, throw on mismatch, null when absent", () => {
    expect(Swift.class("fixture.Counter") instanceof SwiftClass).toBe(true);
    expect(Swift.struct("fixture.LoadableStruct") instanceof SwiftStruct).toBe(true);
    expect(Swift.enum("fixture.Pick") instanceof SwiftEnum).toBe(true);
    expect(() => Swift.class("fixture.LoadableStruct")).toThrow(/is struct, not class/);
    expect(() => Swift.struct("fixture.Pick")).toThrow(/is enum, not struct/);
    expect(() => Swift.enum("fixture.Counter")).toThrow(/is class, not enum/);
    expect(Swift.class("fixture.NoSuchType")).toBeNull();
    expect(Swift.struct("fixture.NoSuchType")).toBeNull();
    expect(Swift.enum("fixture.NoSuchType")).toBeNull();
  });

  test("typeFromDescriptor dispatches by descriptor kind", () => {
    expect(typeFromDescriptor(findType("fixture.LoadableStruct")!) instanceof StructType).toBe(true);
    expect(typeFromDescriptor(findType("fixture.Pick")!) instanceof EnumType).toBe(true);
    expect(typeFromDescriptor(findType("fixture.Counter")!) instanceof ClassType).toBe(true);
  });

  test("descriptor-backed reflection answers without realizing metadata", () => {
    const t = typeFromDescriptor(findType("fixture.ConstrainedBox")!);
    expect(t.name).toBe("fixture.ConstrainedBox");
    expect(t.toJSON().kind).toBe("struct");
    expect(t.moduleName).not.toBe(null);
    expect(t.instanceMethods()).toContain("scaledStored(by:)");
    expect(t.instanceMethod("stored").address.isNull()).toBe(false);
    expect(t.facade.$type).toBe(t);
    expect(() => metadataOf(t)).toThrow();
  });

  test("descriptor-backed reflection realizes metadata on demand", () => {
    const t = typeFromDescriptor(findType("fixture.LoadableStruct")!) as StructType;
    expect(t.fields.map((f) => f.name)).toEqual(["a", "b", "c", "d"]);
    const v = t.facade.$new({ a: 1, b: 2, c: 3, d: 4 });
    expect(v.$fields).toEqual({ a: int64(1), b: int64(2), c: int64(3), d: int64(4) });
    v.$dispose();
    const c = typeFromDescriptor(findType("fixture.Counter")!) as ClassType;
    expect(c.facade.init(9).$fields).toEqual({ count: int64(9) });
  });

  test("a nested type is named and resolved under its full path", () => {
    const desc = findType("fixture.Outer.Inner");
    expect(desc).not.toBeNull();
    const inner = typeFromDescriptor(desc!) as StructType;
    expect(inner.name).toBe("fixture.Outer.Inner");
    const v = inner.facade.$new({ value: 21 });
    expect(v.$method("doubled", { self: "borrowing" }).call()).toEqual(int64(42));
  });

  test("a type nested in an extension keeps its extended parent in the full path", () => {
    const desc = findType("fixture.Outer.FromExt");
    expect(desc).not.toBeNull();
    const fromExt = typeFromDescriptor(desc!) as StructType;
    expect(fromExt.name).toBe("fixture.Outer.FromExt");
    expect(fromExt.moduleName).toBe("fixture");
    const v = fromExt.facade.$new({ mark: 7 });
    expect(v.$method("tripled", { self: "borrowing" }).call()).toEqual(int64(21));
  });
});

describe("reflection versus receiver operations", () => {
  beforeEach(() => { loadFixture(); });

  test("a type's fields describe, an instance's $fields read", () => {
    const Rect = Swift.struct("fixture.Rect")!;
    expect(Rect.$type.fields.map((f) => f.name)).toEqual(["width"]);
    const r = Rect.$new({ width: 3 });
    expect(r.$fields).toEqual({ width: int64(3) });
    expect((r.$type as StructType).fields.map((f) => f.name)).toEqual(["width"]);
  });

  test("$kind is the facade's kind, $type.kind the Swift type's", () => {
    const r = Swift.struct("fixture.Rect")!.$new({ width: 3 });
    expect(r.$kind).toBe("value");
    expect(r.$type.kind).toBe("struct");
    const robot = Swift.class("fixture.Robot")!.init("R2");
    expect(robot.$kind).toBe("object");
    expect(robot.$type.kind).toBe("class");
  });

  test("static properties read through the type facade, instance properties through the object", () => {
    expect(Swift.type("fixture.Duckling")!.$get("flockSize")).toEqual(int64(12));
    const robot = Swift.class("fixture.Robot")!.init("R2");
    expect(robot.$get("badge")).toBe("[R2]");
    robot.$set("badge", "D2");
    expect(robot.badge).toBe("[D2]");
  });

  test("a reflection object carries no receiver operations or Swift members", () => {
    const info = Swift.class("fixture.Robot")!.$type as unknown as Record<string, unknown>;
    expect(info.init).toBeUndefined();
    expect(info.$new).toBeUndefined();
    expect(info.make).toBeUndefined();
    expect(info.$name).toBeUndefined();
  });
});

describe("type-level member lookups by kind", () => {
  beforeEach(() => { loadFixture(); });

  test("$type.instanceMethod finds an instance method without an instance, and binds one to call it", () => {
    const Accumulator = Swift.struct("fixture.Accumulator")!;
    const acc = Accumulator.$new({ total: 5 });
    const peek = Accumulator.$type.instanceMethod("peek");
    expect(peek.address.equals(acc.$method("peek").address)).toBe(true);
    expect(peek.isGeneric).toBe(false);
    expect(peek.bind(acc).call(10)).toEqual(int64(15));
  });

  test("$typeMethod and $type.instanceMethod each find only their own kind", () => {
    const Accumulator = Swift.struct("fixture.Accumulator")!;
    expect(() => Accumulator.$typeMethod("peek")).toThrow(/peek/);
    expect(() => Accumulator.$type.typeMethod("peek")).toThrow(/no type method peek on fixture\.Accumulator/);
    expect(() => Accumulator.$type.instanceMethod("doubled")).toThrow(/no instance method doubled on fixture\.Accumulator/);
  });

  test("$type.typeMethods and $type.instanceMethods list each kind", () => {
    const Accumulator = Swift.struct("fixture.Accumulator")!;
    expect(Accumulator.$type.instanceMethods()).toContain("peek(_:)");
    expect(Accumulator.$type.instanceMethods()).not.toContain("doubled(_:)");
    expect(Accumulator.$type.typeMethods()).toContain("doubled(_:)");
    expect(Accumulator.$type.typeMethods()).not.toContain("peek(_:)");
  });

  test("reflection describes a type method at the address the facade binds", () => {
    const Accumulator = Swift.struct("fixture.Accumulator")!;
    const described = Accumulator.$type.typeMethod("summing");
    expect(described.address.equals(Accumulator.$typeMethod("summing").address)).toBe(true);
    expect(described.selector).toBe("summing(_:_:)");
    expect(described.origin.kind).toBe("own");
  });

  test("reflection describes a class initializer by its selector, at the address the facade binds", () => {
    const Vec2 = Swift.class("fixture.Vec2")!;
    const bySelector = Vec2.$type.initializer("init(angle:radius:)");
    expect(bySelector.address.equals(Vec2.$initializer("init(angle:radius:)").address)).toBe(true);
    expect(() => Vec2.$type.initializer()).toThrow(/ambiguous/);
  });

  test("reflection describes a value type's initializer, at the address the facade binds", (ctx) => {
    requireSymbolTable(ctx);
    loadFixtureSyms();
    const Point = Swift.struct("fixturesyms.Point")!;
    expect(Point.$type.initializer().address.equals(Point.$initializer().address)).toBe(true);
  });

  test("a listed selector resolves the same member as its bare name", () => {
    const Vec2 = Swift.class("fixture.Vec2")!;
    const robot = Swift.class("fixture.Robot")!;
    expect(robot.$type.instanceMethods()).toContain("move(to:)");
    expect(robot.$type.instanceMethod("move(to:)").selector).toBe("move(to:)");
    expect(robot.$type.instanceMethod("move(by:)").selector).toBe("move(by:)");
    expect(Vec2.$type.initializer("init(x:y:)").address.equals(Vec2.$initializer({ labels: ["x", "y"] }).address)).toBe(true);
    expect(() => robot.$type.instanceMethod("move(to:)", { labels: ["to"] })).toThrow(/drop \{ labels \}/);
    expect(() => robot.$type.instanceMethod("move(to")).toThrow(/malformed selector/);
    expect(() => robot.$type.instanceMethod("move(to:by)")).toThrow(/malformed selector/);
    expect(() => Vec2.$initializer("move(to:)")).toThrow(/not an initializer selector/);
  });

  test("a generic type named without arguments still describes its members", () => {
    const Keyed = Swift.struct("fixture.Keyed")!;
    const label = Keyed.$type.typeMethod("label");
    expect(label.address.equals(Keyed.$typeMethod("label").address)).toBe(true);
    expect(() => metadataOf(Keyed)).toThrow();
  });

  test("a generic struct named without arguments lists its fields, untyped", () => {
    const Keyed = Swift.struct("fixture.Keyed")!;
    expect(Keyed.$type.fields).toEqual([{ name: "value", type: null, isVar: true }]);
    expect(() => metadataOf(Keyed)).toThrow();
  });

  test("a generic enum named without arguments lists its cases, untyped", () => {
    const Optional = Swift.enum("Swift.Optional")!;
    expect(Optional.$type.cases).toEqual([{ name: "some", type: null, isVar: false }, { name: "none", type: null, isVar: false }]);
    expect(() => metadataOf(Optional)).toThrow();
  });

  test("a generic class named without arguments names its superclass, itself unbound", () => {
    const Hatchery = Swift.class("fixture.Hatchery")!;
    expect(Hatchery.$type.superClass).toBe(Swift.class("fixture.Coop")!.$type);
    expect(Swift.class("fixture.KeyedHolder")!.$type.superClass).toBeNull();
    expect(Swift.class("fixture.Roost")!.$type.superClass).toBe(Swift.class("fixture.Starling")!.$type.superClass);
    expect(() => metadataOf(Hatchery)).toThrow();
  });
});

describe("type identity", () => {
  beforeEach(() => { loadFixture(); });

  test("one descriptor yields one reflection object and one facade, shared with its instances' $type", () => {
    const Robot = Swift.type("fixture.Robot") as SwiftClass;
    expect(Swift.type("fixture.Robot")).toBe(Robot);
    expect(Swift.class("fixture.Robot")).toBe(Robot);
    expect(Swift.modules.fixture.Robot).toBe(Robot);
    expect(Robot.$type.facade).toBe(Robot);
    expect(Robot.init("R2").$type).toBe(Robot.$type);
    expect(typeOf(metadataFor("fixture.Robot")!)).toBe(Robot.$type);
  });

  test("a value's $type is the reflection its facade's name resolves to", () => {
    const Rect = Swift.type("fixture.Rect") as SwiftStruct;
    expect(Rect.$new({ width: 1 }).$type).toBe(Rect.$type);
  });

  test("a subclass instance's $type is its dynamic class, linked to its superclass", () => {
    const cat = Swift.class("fixture.Cat")!.init();
    expect(Swift.borrowObject(cat.$handle).$type).toBe(Swift.class("fixture.Cat")!.$type);
    expect(cat.$type.superClass).toBe(Swift.class("fixture.Animal")!.$type);
  });

  test("a metadata-backed wrapper joins the descriptor's entry with its metadata realized", () => {
    const metadata = metadataFor("fixture.Point")!;
    const fromMetadata = typeOf(metadata);
    expect(Swift.type("fixture.Point")!.$type).toBe(fromMetadata);
    expect(metadataOf(fromMetadata).handle.equals(metadata.handle)).toBe(true);
  });

  test("each specialization of a generic type is its own reflection and facade, apart from the unbound one", () => {
    const Int = metadataFor("Swift.Int")!;
    const pairOfInt = typeOf(metadataFor("fixture.Pair", [Int])!) as StructType;
    expect(typeOf(metadataFor("fixture.Pair", [Int])!)).toBe(pairOfInt);
    expect(Swift.type("fixture.Pair")!.$type).not.toBe(pairOfInt);
    expect(Swift.type("fixture.Pair")).not.toBe(pairOfInt.facade);
    expect(typeOf(metadataFor("fixture.Pair", [metadataFor("Swift.String")!])!)).not.toBe(pairOfInt);
  });

  test("runtime-uniqued structural metadata yields one wrapper", () => {
    expect(typeOf(mangledType("Si_Sit"))).toBe(typeOf(mangledType("Si_Sit")));
  });
});
