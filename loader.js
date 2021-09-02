const Swift = require("./dist");
Object.defineProperty(global, "Swift", {
    value: Swift,
    configurable: true,
    enumerable: true,
});
