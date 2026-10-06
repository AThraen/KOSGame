#!/usr/bin/env node
// tools/check-badges.js — cross-check BADGES definitions in js/ui/app.js against
// every award()/give() call site under js/. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'js', 'ui', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

// 1. Collect BADGES ids: text between "const BADGES = [" and the first line that is exactly "  ];"
const start = src.indexOf('const BADGES = [');
if (start === -1) {
  console.error('ERROR: "const BADGES = [" not found in js/ui/app.js');
  process.exit(1);
}
const lines = src.slice(start).split(/\r?\n/);
let endLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === '  ];') { endLine = i; break; }
}
if (endLine === -1) {
  console.error('ERROR: end of BADGES array ("  ];") not found in js/ui/app.js');
  process.exit(1);
}
const badgesText = lines.slice(0, endLine + 1).join('\n');
const defined = [];
{
  const re = /\{ id: '([a-z0-9-]+)', icon: '/g;
  let m;
  while ((m = re.exec(badgesText)) !== null) defined.push(m[1]);
}

// 2. Collect awarded ids from every .js file under js/ (recursive)
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = walk(path.join(root, 'js'), []);
const awarded = new Map(); // id -> Set of relative file paths
function add(id, file) {
  if (!awarded.has(id)) awarded.set(id, new Set());
  awarded.get(id).add(file);
}
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f).split(path.sep).join('/');
  let m;
  const reAward = /award\(\s*['"]([a-z0-9-]+)['"]\s*\)/g;
  while ((m = reAward.exec(t)) !== null) add(m[1], rel);
  const reGive = /give\(\s*'([a-z0-9-]+)'/g;
  while ((m = reGive.exec(t)) !== null) add(m[1], rel);
}

// 3. Report
const definedSet = new Set(defined);
console.log('defined: ' + defined.length);
console.log(defined.join(', '));

const undef = [];
for (const id of awarded.keys()) if (!definedSet.has(id)) undef.push(id);
console.log('UNDEFINED (awarded but no BADGES entry):');
if (undef.length === 0) console.log('  (none)');
for (const id of undef) {
  console.log('  ' + id + '  <- ' + Array.from(awarded.get(id)).join(', '));
}

const never = defined.filter(id => !awarded.has(id));
console.log('never awarded (BADGES entry but nothing awards it):');
if (never.length === 0) console.log('  (none)');
for (const id of never) console.log('  ' + id);

// 4. Exit code
process.exit(undef.length > 0 ? 1 : 0);
