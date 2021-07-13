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

func getLoadableStruct() -> LoadableStruct {
    let s = LoadableStruct(a: 1, b: 2, c: 3, d: 4)
    return s
}

func makeLoadableStruct(a: Int, b: Int, c: Int, d: Int) -> LoadableStruct {
    let s = LoadableStruct(a: a, b: b, c: c, d: d)
    return s
}
