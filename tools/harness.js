// Loads js/core/*.js into Node (same order as index.html) and returns the KOS global. No DOM.
// Usage: const KOS = require('./harness').load();
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CORE = ['kos', 'i18n', 'boats', 'wind', 'physics', 'rules', 'ai', 'world', 'activities'];
let cached = null;
function load(extra = []) {
  if (cached && !extra.length) return cached;
  for (const name of CORE.map(n => 'js/core/' + n + '.js').concat(extra)) {
    const file = path.join(__dirname, '..', name);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
  cached = globalThis.KOS;
  return cached;
}
module.exports = { load };
