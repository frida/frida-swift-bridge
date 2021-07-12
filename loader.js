const Swift = require('./index.js').Swift;
Object.defineProperty(global, 'Swift', {
  value: Swift,
  configurable: true,
  enumerable: true,
});
