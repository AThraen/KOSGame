// Node check for js/modes/school.js i18n completeness: node tools/check-school-i18n.js
// 1) Evaluates the file in a vm context with a stub KOS to capture the objects passed to
//    KOS.I18n.add('da', ...) and KOS.I18n.add('en', ...), flattens them into dotted keys
//    (same rules as js/core/i18n.js) and reports keys present in one language but missing in the other.
// 2) Regex-scans the source for string literals that are (or build) 'school.*' keys and reports
//    any that are missing from the 'da' dictionary.
// Exit code 1 if anything is missing, 0 otherwise.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'js', 'modes', 'school.js');
const src = fs.readFileSync(FILE, 'utf8');

// ---------------------------------------------------------------- flatten (mirrors js/core/i18n.js)
function flatten(obj, prefix, out) {
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------- stub KOS
function makeKOS() {
  const captured = { da: null, en: null };
  const noop = () => {};
  const I18n = {
    add(lang, dict) {
      if (lang === 'da' || lang === 'en') captured[lang] = dict;
      return I18n;
    },
    t: noop,
    tt: noop,
    has: () => false,
    setLang: noop,
    apply: noop,
    plural: noop,
  };
  const KOS = {
    I18n,
    U: noop,
    t: noop,
    tt: noop,
    Modes: { register: noop },
    Activities: { add: noop },
  };
  // Anything else on KOS (UI, Physics, World, Audio, Boats, Wind, Events, App, AI, SailMode, ...)
  // resolves to a no-op function; calling it returns another no-op function so
  // `KOS.X.y(...)` chains stay inert.
  return new Proxy(KOS, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      const f = () => f;
      return f;
    },
  });
}

// ---------------------------------------------------------------- 1. evaluate the file
let da = null, en = null, evalError = null;
try {
  const KOS = makeKOS();
  const sandbox = { KOS, console, Math, Object, Array, JSON, Date, setTimeout, clearTimeout, isNaN, parseInt, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: FILE });
  da = KOS.I18n === undefined ? null : null; // (placeholder, real capture below)
  const cap = KOS.__captured; // not used; see below
  // The proxy returns the real I18n object for 'I18n', so read the capture from it.
  da = KOS.I18n._captured ? KOS.I18n._captured.da : null;
  en = KOS.I18n._captured ? KOS.I18n._captured.en : null;
} catch (e) {
  evalError = e;
}

// The stub above stores captures on the I18n object; rewire makeKOS to expose them.
// (Implemented directly here to keep the stub minimal.)
function makeKOS2() {
  const captured = { da: null, en: null };
  const noop = () => {};
  const I18n = {
    add(lang, dict) {
      if (lang === 'da' || lang === 'en') captured[lang] = dict;
      return I18n;
    },
    t: noop, tt: noop, has: () => false, setLang: noop, apply: noop, plural: noop,
    _captured: captured,
  };
  const KOS = { I18n, U: noop, t: noop, tt: noop, Modes: { register: noop }, Activities: { add: noop } };
  return new Proxy(KOS, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      const f = () => f;
      return f;
    },
  });
}

let daDict = null, enDict = null;
try {
  const KOS = makeKOS2();
  const sandbox = { KOS, console, Math, Object, Array, JSON, Date, setTimeout, clearTimeout, isNaN, parseInt, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: FILE });
  daDict = KOS.I18n._captured.da;
  enDict = KOS.I18n._captured.en;
} catch (e) {
  evalError = e;
}

const daFlat = daDict ? flatten(daDict, '', {}) : null;
const enFlat = enDict ? flatten(enDict, '', {}) : null;

// ---------------------------------------------------------------- 2. regex scan for 'school.*' keys in string literals
// Matches: t('school.x.y'), 'school.x.y' literals, and 'school.x.' + expr / 'school.x.' + 'y' concatenations.
const keyRe = /(?:\bt\(\s*|['"])(school\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)['"]?/g;
const found = new Set();
let m;
while ((m = keyRe.exec(src)) !== null) {
  let k = m[1];
  // If the literal ends with a dot, the key continues in the next expression: 'school.x.' + expr
  const after = src.slice(m.index + m[0].length);
  if (k.endsWith('.')) {
    k = k.slice(0, -1);
    const cont = /^\s*\+\s*['"]([A-Za-z0-9_]+)['"]/.exec(after);
    if (cont) k += '.' + cont[1];
  }
  found.add(k);
}

// ---------------------------------------------------------------- report
let problems = 0;
const list = (title, items) => {
  console.log(title);
  if (!items.length) { console.log('  (none)'); return; }
  for (const k of items) console.log('  ' + k);
};

console.log('check-school-i18n: ' + FILE);
if (evalError) {
  console.log('ERROR: failed to evaluate file in vm context: ' + (evalError && evalError.stack || evalError));
  process.exit(1);
}
if (!daDict || !enDict) {
  console.log('ERROR: could not capture KOS.I18n.add(' + (daDict ? 'en' : 'da') + ', ...) from the file.');
  process.exit(1);
}

console.log('\n[1] da/en key parity (' + Object.keys(daFlat).length + ' da keys, ' + Object.keys(enFlat).length + ' en keys)');
const daOnly = Object.keys(daFlat).filter(k => !(k in enFlat)).sort();
const enOnly = Object.keys(enFlat).filter(k => !(k in daFlat)).sort();
list('  in da but missing in en:', daOnly);
list('  in en but missing in da:', enOnly);
problems += daOnly.length + enOnly.length;

console.log('\n[2] school.* keys referenced in source but missing from da (' + found.size + ' distinct keys found)');
const missingDa = [...found].filter(k => !(k in daFlat)).sort();
list('  missing from da:', missingDa);
problems += missingDa.length;

console.log('\n' + (problems ? 'FAIL: ' + problems + ' missing key(s)' : 'OK: all keys present in both languages'));
process.exit(problems ? 1 : 0);
