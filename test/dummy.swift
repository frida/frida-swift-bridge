import Foundation

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
}

func makeMultiPayloadEnumCaseWithTag(tag: Int) -> MultiPayloadEnum {
    switch (tag) {
        case 0:
            return MultiPayloadEnum.a(0x1337)
        case 1:
            return MultiPayloadEnum.b("Pentagon")
        case 2:
            return MultiPayloadEnum.c(3.1415926535)
        case 3:
            return MultiPayloadEnum.d(false)
        default:
            return MultiPayloadEnum.a(0xDEAD)
    }
}

enum SingledPayloadReferenceEnum {
    case a
    case Some(SimpleClass)
    case b
    case c
}

enum MultiPayloadReferenceEnum {
    case a
    case One(EmptyClass)
    case Two(SimpleClass)
    case b
}

func makeString() -> String {
    return "New Cairo"
}
