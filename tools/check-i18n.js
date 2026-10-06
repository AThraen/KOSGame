// KØS SEJL — tools/check-i18n.js
// Headless i18n audit. NEVER opens a visible window (Playwright, headless Chrome).
//
//   node tools/check-i18n.js            human-readable report
//   node tools/check-i18n.js --json     report as JSON
//
// What it does:
//   1. Loads index.html (file://) and wraps KOS.t / KOS.I18n.t so that any lookup that
//      falls through to the key itself (missing in every language) is recorded in
//      window.__i18nMiss. (Modules that captured KOS.t in a local before the wrap are
//      not caught — that is acceptable, we report what we catch.)
//   2. For each language ('da' then 'en'): setLang, visit every screen and every hub
//      area, then start every activity (KOS.App.play(id, {force:true})), wait, and
//      return to the hub. Each step is wrapped in try/catch; errors are logged and
//      the run continues.
//   3. Static parity from KOS.I18n._dicts: keys only in da, keys only in en, and
//      keys whose value is an empty string.
//   4. Prints a report (counts + lists, max 200 lines per list). Exit code 1 if
//      missing-at-runtime keys or da-only/en-only keys exist, else 0.
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
const JSON_OUT = process.argv.includes('--json');
const SELFTEST = process.argv.includes('--selftest'); // asks for a key that does not exist: must be reported
const SCREENS = ['title', 'hub', 'garage', 'settings', 'profile', 'credits'];
const AREAS = ['club', 'school', 'bay', 'race', 'rules', 'nav', 'pier', 'rib'];
const MAX_LINES = 200;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const note = (...a) => console.error('[check-i18n]', ...a);

// ------------------------------------------------------------------ in-page: miss recorder
// Wraps KOS.t and KOS.I18n.t (whichever exist) around the ORIGINAL function so a
// lookup that returns the key itself is recorded in window.__i18nMiss.
const INSTALL_RECORDER = () => {
  if (window.__i18nInstalled) return { installed: false };
  window.__i18nMiss = new Set();
  const K = window.KOS;
  if (!K || !K.I18n || typeof K.I18n.t !== 'function') return { installed: false, reason: 'no KOS.I18n.t' };
  const orig = K.I18n.t;
  const wrapped = function (key, vars) {
    const out = orig.call(this, key, vars);
    try {
      if (typeof key === 'string' && key.length > 0 && key.indexOf('.') >= 0 && out === String(key)) {
        window.__i18nMiss.add(key);
      }
    } catch (e) { /* never break the game */ }
    return out;
  };
  K.I18n.t = wrapped;
  if (K.t !== wrapped) K.t = wrapped; // KOS.t is normally === KOS.I18n.t; keep both pointing at the wrapper
  window.__i18nInstalled = true;
  return { installed: true };
};

// ------------------------------------------------------------------ in-page: one language pass
async function runLang(page, lang) {
  const step = async (label, fn) => {
    try { await fn(); } catch (e) { note('step failed (' + lang + ' ' + label + '):', (e && e.message) || e); }
  };

  await step('setLang', () => page.evaluate(l => KOS.I18n.setLang(l), lang));
  if (SELFTEST) await step('selftest', () => page.evaluate(() => KOS.t('selftest.missing.key')));

  for (const s of SCREENS) {
    await step('screen ' + s, async () => {
      await page.evaluate(sc => KOS.App.show(sc, {}), s);
      await page.waitForTimeout(300);
    });
  }
  for (const a of AREAS) {
    await step('area ' + a, async () => {
      await page.evaluate(ar => KOS.App.show('area', { area: ar }), a);
      await page.waitForTimeout(300);
    });
  }
  const ids = await page.evaluate(() => KOS.Activities.list().map(a => a.id));
  for (const id of ids) {
    await step('play ' + id, async () => {
      await page.evaluate(i => KOS.App.play(i, { force: true }), id);
      await page.waitForTimeout(700);
      await page.evaluate(() => KOS.App.show('hub', {}));
      await page.waitForTimeout(200);
    });
  }
  return { lang, ids: ids.length, misses: await page.evaluate(() => Array.from(window.__i18nMiss || [])) };
}

// ------------------------------------------------------------------ static parity
function staticParity(dicts) {
  const da = dicts.da || {};
  const en = dicts.en || {};
  const daKeys = Object.keys(da).sort();
  const enKeys = Object.keys(en).sort();
  const daOnly = daKeys.filter(k => !(k in en));
  const enOnly = enKeys.filter(k => !(k in da));
  const empty = [];
  for (const k of daKeys) if (da[k] === '') empty.push({ key: k, langs: ['da'] });
  for (const k of enKeys) if (en[k] === '') {
    const e = empty.find(x => x.key === k);
    if (e) e.langs.push('en'); else empty.push({ key: k, langs: ['en'] });
  }
  empty.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return { daOnly, enOnly, empty };
}

// ------------------------------------------------------------------ report
function printReport(report) {
  const section = (title, list, extra) => {
    console.log('');
    console.log(title + ' — ' + list.length + (extra ? ' ' + extra : ''));
    if (!list.length) { console.log('  (none)'); return; }
    for (const line of list.slice(0, MAX_LINES)) console.log('  ' + line);
    if (list.length > MAX_LINES) console.log('  … ' + (list.length - MAX_LINES) + ' more');
  };
  console.log('KØS SEJL i18n check');
  console.log('  languages: ' + report.langs.map(l => l.lang + ' (' + l.activities + ' activities, ' + l.misses + ' misses)').join(', '));
  section('Missing at runtime (key returned as-is)', report.missing);
  section('Keys in da but not en', report.daOnly);
  section('Keys in en but not da', report.enOnly);
  section('Empty values', report.empty.map(e => e.key + ' [' + e.langs.join(',') + ']'));
  const fail = report.missing.length > 0 || report.daOnly.length > 0 || report.enOnly.length > 0;
  console.log('');
  console.log(fail ? 'RESULT: FAIL' : 'RESULT: OK');
  return fail ? 1 : 0;
}

// ------------------------------------------------------------------ main
(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let page = null;
  let report = null;
  let exitCode = 0;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push((e && (e.stack || e.message)) || String(e)));
    page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(800);

    const inst = await page.evaluate(INSTALL_RECORDER);
    if (!inst.installed) note('miss recorder not installed:', inst.reason || 'unknown');

    // Fresh profile + everything unlocked so every activity can start; sound off keeps logs quiet.
    await page.evaluate(() => {
      try {
        KOS.Storage.saveProfile({ name: 'I18nCheck', sailNo: '1' });
        KOS.Storage.saveSettings({ unlockAll: true, sound: false, music: false });
      } catch (e) { /* optional */ }
    });

    const dicts = await page.evaluate(() => {
      const d = (typeof KOS.I18n._dicts === 'function' ? KOS.I18n._dicts() : KOS.I18n._dicts);
      const plain = o => { const r = {}; for (const k in o) r[k] = typeof o[k] === 'function' ? '[fn]' : o[k]; return r; };
      return { da: plain(d.da || {}), en: plain(d.en || {}) };
    });

    const langs = [];
    for (const lang of ['da', 'en']) {
      note('language pass:', lang);
      langs.push(await runLang(page, lang));
    }

    const missing = [...new Set(langs.flatMap(l => l.misses))].sort();
    const parity = staticParity(dicts);
    report = {
      langs: langs.map(l => ({ lang: l.lang, activities: l.ids, misses: l.misses.length })),
      missing,
      daOnly: parity.daOnly,
      enOnly: parity.enOnly,
      empty: parity.empty,
    };
    if (pageErrors.length) note('page errors (' + pageErrors.length + '):');
    for (const e of pageErrors.slice(0, 20)) note('  ' + e);
  } catch (e) {
    note('crashed:', (e && (e.stack || e.message)) || e);
    exitCode = 1;
  } finally {
    if (page) { try { await page.close(); } catch (e) { /* ignore */ } }
    await browser.close();
  }

  if (report) {
    if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
    else exitCode = printReport(report);
  }
  note('done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, exit ' + exitCode);
  process.exit(exitCode);
})().catch(e => { console.error('[check-i18n] fatal:', (e && (e.stack || e.message)) || e); process.exit(1); });
