const Swift = require('./dist/index.js');
Object.defineProperty(global, 'Swift', {
  value: Swift.Swift, // TS not like JS?
  configurable: true,
  enumerable: true,
});
