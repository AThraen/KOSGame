// KØS SEJL — runs the test suites one after another and prints a summary. Never opens a window.
//
//   node tools/run-tests.js              core + precache (fast, Node-only)
//   node tools/run-tests.js all          all suites (i18n, mobile + smoke use headless Chrome)
//   node tools/run-tests.js <name> ...   only the named suites: core, precache, i18n, mobile, smoke
//
// Exit code: 0 all good, 1 a suite failed, 2 unknown suite name.
// A suite whose script file does not exist is reported as SKIP (not a failure).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SUITES = {
  core: { script: 'tools/test-core.js', args: [] },
  precache: { script: 'tools/gen-precache.js', args: ['--check'] },
  i18n: { script: 'tools/check-i18n.js', args: [] },
  mobile: { script: 'tools/test-mobile.js', args: [] },
  smoke: { script: 'tools/smoke.js', args: ['--no-shots'] },
};
const NAMES = Object.keys(SUITES);
const DEFAULT = ['core', 'precache'];

const argv = process.argv.slice(2);
let selected;
if (argv.length === 0) selected = DEFAULT;
else if (argv.length === 1 && argv[0] === 'all') selected = NAMES;
else selected = argv;

const unknown = selected.filter(n => !SUITES[n]);
if (unknown.length) {
  console.error('Unknown suite' + (unknown.length > 1 ? 's' : '') + ': ' + unknown.join(', '));
  console.error('Valid suites: ' + NAMES.join(', '));
  process.exit(2);
}

const results = [];
for (const name of selected) {
  const s = SUITES[name];
  if (!fs.existsSync(path.join(ROOT, s.script))) {
    console.log('\n== ' + name + ' — SKIP (' + s.script + ' not found)');
    results.push({ name, status: 'SKIP', secs: 0 });
    continue;
  }
  console.log('\n== ' + name + ' — node ' + s.script + (s.args.length ? ' ' + s.args.join(' ') : ''));
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [s.script, ...s.args], { stdio: 'inherit', cwd: ROOT });
  const secs = (Date.now() - t0) / 1000;
  results.push({ name, status: r.status === 0 ? 'PASS' : 'FAIL', secs });
}

const wName = Math.max(5, ...results.map(r => r.name.length));
const wStatus = Math.max(4, ...results.map(r => r.status.length));
console.log('');
console.log('Summary');
console.log('  ' + 'suite'.padEnd(wName) + '  ' + 'status'.padEnd(wStatus) + '  seconds');
for (const r of results) {
  console.log('  ' + r.name.padEnd(wName) + '  ' + r.status.padEnd(wStatus) + '  ' + r.secs.toFixed(1));
}
const failed = results.filter(r => r.status === 'FAIL').length;
const skipped = results.filter(r => r.status === 'SKIP').length;
const passed = results.length - failed - skipped;
console.log('  ' + passed + ' passed, ' + failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
process.exit(failed ? 1 : 0);
