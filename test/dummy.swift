import Foundation
import CryptoKit

/**
 * TODO:
 *  - Test and add empty types
 */

class EmptyClass { }

class SimpleClass {
    var x: Int
    var y: Int

    init(first: Int, second: Int) {
        self.x = first
        self.y = second
    }

    func multiply() -> Int {
        return self.x * self.y
    }

    func multiply(with z: Int) -> Int {
        return self.multiply() * z
    }
}

func takeSimpleClass(klass: SimpleClass) -> Int {
    return klass.x
}

func makeSimpleClass(f: Int, s: Int) -> SimpleClass {
    return SimpleClass(first: f, second: s)
}

struct BigStruct {
    let a: Int
    let b: Int
    let c: Int
    let d: Int
    let e: Int
}

func returnBigStruct() -> BigStruct {
    let s = BigStruct(a: 1, b: 2, c: 3, d: 4, e: 5)
    return s
}

func makeBigStructWithManyArguments(with loadable1: LoadableStruct,
                                    and loadable2: LoadableStruct,
                                    a: Int,
                                    b: Int,
                                    c: Int,
                                    d: Int,
                                    e: Int) -> BigStruct {
    let big = BigStruct(a: loadable1.a + loadable2.a + a,
                        b: loadable1.b + loadable2.b + b,
                        c: loadable1.c + loadable2.c + c,
                        d: loadable1.d + loadable2.d + d,
                        e: e)
    return big
}

func takeBigStruct(_ b: BigStruct) -> Bool {
    return b.a == 1 &&
           b.b == 2 &&
           b.c == 3 &&
           b.d == 4 &&
           b.e == 5
}

struct LoadableStruct {
    let a: Int
    let b: Int
    let c: Int
    let d: Int
}

func getLoadableStruct() -> LoadableStruct {
    let s = LoadableStruct(a: 1, b: 2, c: 3, d: 4)
    return s
}

func makeLoadableStruct(a: Int, b: Int, c: Int, d: Int) -> LoadableStruct {
    let s = LoadableStruct(a: a, b: b, c: c, d: d)
    return s
}

enum EmptyEnum { }

enum CStyle {
    case a
    case b
    case c
    case d
    case e
}

enum SinglePayloadEnumWithNoExtraInhabitants {
    case a
    case b
    case Some(Int)
    case c
    case d
}

enum SinglePayloadEnumWithExtraInhabitants {
    case a
    case b
    case Some(String)
    case c
    case d
}

enum MultiPayloadEnum {
    case a(Int)
    case b(String)
    case c(Double)
    case d(Bool)
    case e;
    case f;
}

func takeMultiPayloadEnum(kase: MultiPayloadEnum) -> Int {
    switch (kase) {
        case .a(_):
            return 0
        case .b(_):
            return 1
        case .c(_):
            return 2
        case .d(_):
            return 3
        case .e:
            return 4
        case .f:
            return 5
    }
}

func makeMultiPayloadEnumCase(with tag: Int) -> MultiPayloadEnum {
    switch (tag) {
        case 0:
            return .a(0x1337)
        case 1:
            return .b("Octagon")
        case 2:
            return .c(3.1415926535)
        case 3:
            return .d(false)
        case 4:
            return .e
        case 5:
            return .f
        default:
            return MultiPayloadEnum.a(-1)
    }
}

func makeString() -> String {
    return "New Cairo"
}

protocol SomeProtocol {
    var mustBeSettable: Int { get set }
    var doesNotNeedToBeSettable: Int { get }
}

protocol Togglable {
    mutating func toggle()
}

enum OnOffSwitch: Togglable {
    case off, on
    mutating func toggle() {
        switch self {
        case .off:
            self = .on
        case .on:
            self = .off
        }
    }
}

protocol Existential {
    var x: Int { get }
    var y: Int { get }
}

struct InlineExistentialStruct : Existential {
    let x = 0xCAFE
    let y = 0xBABE
}

func takeInlineExistentialStruct(_ e: Existential) -> Bool {
    return e.x == 0xCAFE && e.y == 0xBABE
}

struct OutOfLineExistentialStruct: Existential {
    let x = 0xDEAD
    let y = 0xBEEF
    let a = 0xaaaa
    let b = 0xbbbb
    let c = 0xcccc
}

func takeOutOfLineExistentialStruct(_ e: Existential) -> Bool {
    return e.x == 0xDEAD && e.y == 0xBEEF
}

class ExistentialClass: Existential {
    let x = 0x1337
    let y = 0x7331
}

func makeExistentialClass() -> ExistentialClass {
    return ExistentialClass()
}

func passThroughExistential(_ e: Existential) -> Existential {
    return e
}

protocol ClassBoundExistential: AnyObject {
    var a: Int { get }
    var b: Int { get }
}

class ClassOnlyExistentialClass: ClassBoundExistential {
    let a = 0xAAAAAAAA
    let b = 0xBBBBBBBB
}

func passClassBoundExistentialThrough(
    _ c: ClassBoundExistential
) -> ClassBoundExistential {
    return c
}

struct InlineCompositeExistentialStruct: Existential, Togglable {
    let x = 0xDEAD
    let y = 0xBEEF

    mutating func toggle() {
        print("Toggle from struct")
    }
}

func passCompositeExistentialThrough(
    _ c: Existential & Togglable
) -> Existential & Togglable {
    return c
}

class CompositeClassBoundExistentialClass: ClassBoundExistential, Togglable {
    let a = 0x0B00B135
    let b = 0xB16B00B5

    func toggle() {
        print("Toggle from class")
    }
}

func passCompositeClassBoundExistentialThrough(
    _ c: ClassBoundExistential & Existential
) -> ClassBoundExistential & Existential {
    return c
}

func change(number: inout Int) {
    number += 1337
}
