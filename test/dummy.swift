class SomeClass {
    var someFirstMember: String
    var someSecondMember: Int
    var someThirdMember: (Int, String) 
    var someFourthMember: EmptyClass

    func someFunc() {
        print("hello")
    }

    init(first: String, second: Int, third: (Int, String), fourth: EmptyClass) {
        self.someFirstMember = first
        self.someSecondMember = second
        self.someThirdMember = third
        self.someFourthMember = fourth
    }
}

class EmptyClass {
}

enum SomeEnumeration {
    case emptyCase1
    case emptyCase2
    case payloadCase(some: String)
}


struct SomeStructure {
    var width = 0
    var height = 0
    let someConstField = 1337

    func area() -> Int {
        return width * height
    }
}

protocol SomeProtocol {
    var mustBeSettable: Int { get set }
    var doesNotNeedToBeSettable: Int { get }

    static func random() -> Double
}

struct Stack<Element> {
    var items: [Element] = []

    mutating func push(_ item: Element) {
        items.append(item)
    }

    mutating func pop() -> Element {
        return items.removeLast()
    }
}

func mymain() {
    let s = SomeStructure()
    print(s.area())
}

