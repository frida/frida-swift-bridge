import Foundation

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

struct LoadableStruct {
    let a: Int
    let b: Int
    let c: Int
    let d: Int
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

func getLoadableStruct() -> LoadableStruct {
    let s = LoadableStruct(a: 1, b: 2, c: 3, d: 4)
    return s
}

func makeLoadableStruct(a: Int, b: Int, c: Int, d: Int) -> LoadableStruct {
    let s = LoadableStruct(a: a, b: b, c: c, d: d)
    return s
}
