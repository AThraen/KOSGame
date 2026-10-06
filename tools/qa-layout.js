#!/usr/bin/env node
'use strict';

/*
 * tools/qa-layout.js
 *
 * Headless layout QA for the KOS game. Boots index.html in Chromium across
 * several viewports, visits every screen (title/hub/settings/profile/garage/
 * credits, all areas, the first activity of every mode, and the results
 * screen), checks for layout issues, screenshots each target as JPEG, and
 * writes .tmp/qa/report.json.
 *
 * Usage:
 *   node tools/qa-layout.js [--only=<substring>] [--vp=<w>x<h>]
 *
 * --only=<substring>  keep only targets whose name contains the substring
 * --vp=<w>x<h>        keep only that viewport (e.g. --vp=390x844)
 *
 * The script always exits with code 0.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const url = require('url');

const INDEX = url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const QA_DIR = path.resolve(__dirname, '..', '.tmp', 'qa');

const VIEWPORTS = [
  { w: 390, h: 844, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 1024, h: 1366, touch: true },
  { w: 1440, h: 900, touch: false },
  { w: 1920, h: 1080, touch: false },
];

const SCREENS = ['title', 'hub', 'settings', 'profile', 'garage', 'credits'];
const AREAS = ['club', 'school', 'bay', 'race', 'rules', 'nav', 'pier', 'rib'];
const MAX_ISSUES = 30;

function parseArgs() {
  const args = { only: null, vp: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--only=')) args.only = arg.slice('--only='.length);
    else if (arg.startsWith('--vp=')) args.vp = arg.slice('--vp='.length);
  }
  return args;
}

async function boot(page) {
  await page.goto(INDEX);
  await page.waitForFunction(
    () => document.documentElement.classList.contains('booted') && window.KOS && KOS.App,
    null,
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    KOS.Storage.saveProfile({ name: 'QA', age: '8-10', sailNo: '123', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings({ unlockAll: true, sound: false, music: false, lang: 'da' });
    KOS.I18n.setLang('da');
  });
}

/* Runs inside the page. Returns an array of issue strings (capped by caller). */
function layoutChecks(hasTouch) {
  const issues = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // a. HSCROLL
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1) {
    issues.push(
      'HSCROLL: document scroll ' + de.scrollWidth + 'x' + de.scrollHeight + ' exceeds viewport ' + vw + 'x' + vh
    );
  }

  const roots = ['#app', '#dialogs', '#toasts'].map((s) => document.querySelector(s)).filter(Boolean);
  const seen = new Set();
  const all = [];
  for (const r of roots) {
    for (const el of r.querySelectorAll('*')) {
      if (!seen.has(el)) {
        seen.add(el);
        all.push(el);
      }
    }
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') return false;
    if (cs.display === 'none') return false;
    if (parseFloat(cs.opacity) <= 0.05) return false;
    let p = el.parentElement;
    while (p) {
      if (p.hasAttribute('hidden')) return false;
      p = p.parentElement;
    }
    return true;
  }

  const INTERACTIVE = 'button, a, input, select, [role="button"], .btn';
  const interactive = all
    .filter((el) => {
      try {
        return el.matches(INTERACTIVE);
      } catch (e) {
        return false;
      }
    })
    .filter(isVisible);

  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = Array.from(el.classList || []).slice(0, 2).map((c) => '.' + c).join('');
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return '<' + tag + id + cls + '>' + (text ? ' "' + text + '"' : '');
  }

  // inside a scroll container or the pannable hub map: reachable by scrolling / panning, not "off-screen"
  function scrollable(el) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.classList && p.classList.contains('hub-stage')) return true;
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return true;
    }
    return false;
  }

  // b. OFFSCREEN
  for (const el of interactive) {
    if (scrollable(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -2 || r.top < -2 || r.right > vw + 2 || r.bottom > vh + 2) {
      issues.push(
        'OFFSCREEN: ' + describe(el) +
        ' rect=[' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.right) + ',' + Math.round(r.bottom) + ']'
      );
    }
  }

  // c. OVERLAP
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i];
      const b = interactive[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const ix = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      const iy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      const inter = ix * iy;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (smaller > 0 && inter / smaller > 0.25) {
        issues.push(
          'OVERLAP: ' + describe(a) + ' <-> ' + describe(b) +
          ' (shared ' + Math.round(inter) + 'px^2 > 25% of smaller)'
        );
      }
    }
  }

  // d. SMALLTARGET (touch viewports only)
  if (hasTouch) {
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) {
        issues.push('SMALLTARGET: ' + describe(el) + ' size=' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
    }
  }

  // e. TINYTEXT (max 5 per target)
  let tiny = 0;
  for (const el of all) {
    if (tiny >= 5) break;
    if (!isVisible(el)) continue;
    let direct = false;
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
        direct = true;
        break;
      }
    }
    if (!direct) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) {
      issues.push('TINYTEXT: ' + describe(el) + ' font-size=' + fs + 'px');
      tiny++;
    }
  }

  return issues;
}

async function runSingleTarget(page, vp, vpName, t, pendingErrors, results) {
  let name = t.name;
  const issues = [];
  try {
    if (t.kind === 'screen') {
      await page.evaluate(([screen, area]) => KOS.App.show(screen, area ? { area } : {}), [t.screen, t.area]);
      await page.waitForTimeout(600);
    } else if (t.kind === 'results') {
      name = 'results';
      const id = await page.evaluate(() => {
        const list = KOS.Activities.list().filter((a) => a.mode === 'sail');
        if (!list.length) return null;
        list.sort((x, y) => x.order - y.order);
        return list[0].id;
      });
      if (id) {
        await page.evaluate((aid) => KOS.App.play(aid, { force: true }), id);
        await page.waitForTimeout(1000);
        await page.evaluate(() =>
          KOS.App.run.host.finish({ stars: 2, score: 1234, timeMs: 61000, success: true, stats: {} })
        );
        await page.waitForTimeout(1200);
      }
    }
    issues.push(...(await page.evaluate(layoutChecks, vp.touch)));
    issues.push(...pendingErrors.splice(0));
    await page.screenshot({ path: path.join(QA_DIR, vpName + '-' + name + '.jpg'), type: 'jpeg', quality: 60 });
  } catch (err) {
    issues.push('ERROR: ' + (err && err.message ? err.message : String(err)));
  }
  results.push({ vp: vpName, name, issues: issues.slice(0, MAX_ISSUES) });
}

async function runPlayTargets(page, vp, vpName, only, pendingErrors, results) {
  let ids = [];
  try {
    ids = await page.evaluate(() => {
      const list = KOS.Activities.list();
      const byMode = {};
      for (const a of list) {
        if (!byMode[a.mode] || a.order < byMode[a.mode].order) byMode[a.mode] = a;
      }
      return Object.values(byMode).map((a) => a.id);
    });
  } catch (err) {
    results.push({
      vp: vpName,
      name: 'play-(list)',
      issues: ['ERROR: ' + (err && err.message ? err.message : String(err))].slice(0, MAX_ISSUES),
    });
    return;
  }
  for (const id of ids) {
    const name = 'play-' + id;
    if (only && !name.includes(only)) continue;
    const issues = [];
    try {
      pendingErrors.length = 0;
      await page.evaluate((aid) => KOS.App.play(aid, { force: true }), id);
      await page.waitForTimeout(2500);
      issues.push(...(await page.evaluate(layoutChecks, vp.touch)));
      issues.push(...pendingErrors.splice(0));
      await page.screenshot({ path: path.join(QA_DIR, vpName + '-' + name + '.jpg'), type: 'jpeg', quality: 60 });
      await page.evaluate(() => KOS.App.run.host.quit());
      await page.waitForTimeout(300);
    } catch (err) {
      issues.push('ERROR: ' + (err && err.message ? err.message : String(err)));
    }
    results.push({ vp: vpName, name, issues: issues.slice(0, MAX_ISSUES) });
  }
}

async function main() {
  const args = parseArgs();
  fs.mkdirSync(QA_DIR, { recursive: true });

  const vps = VIEWPORTS.filter((v) => !args.vp || v.w + 'x' + v.h === args.vp);
  const baseTargets = [];
  for (const name of SCREENS) baseTargets.push({ name, kind: 'screen', screen: name, area: null });
  for (const a of AREAS) baseTargets.push({ name: 'area-' + a, kind: 'screen', screen: 'area', area: a });
  baseTargets.push({ name: null, kind: 'play' });
  baseTargets.push({ name: 'results', kind: 'results' });

  const results = [];
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  for (const vp of vps) {
    const vpName = vp.w + 'x' + vp.h;
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.touch,
      isMobile: vp.touch ? vp.w < 900 : false,
    });
    const page = await context.newPage();
    const pendingErrors = [];
    page.on('pageerror', (err) => pendingErrors.push('ERROR: ' + (err && err.message ? err.message : String(err))));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pendingErrors.push('ERROR: ' + msg.text());
    });

    try {
      await boot(page);
    } catch (err) {
      results.push({
        vp: vpName,
        name: '(boot)',
        issues: ['ERROR: boot failed: ' + (err && err.message ? err.message : String(err))].slice(0, MAX_ISSUES),
      });
      await context.close().catch(() => {});
      continue;
    }
    pendingErrors.length = 0;

    for (const t of baseTargets) {
      if (t.kind === 'play') {
        await runPlayTargets(page, vp, vpName, args.only, pendingErrors, results);
        continue;
      }
      if (args.only && !t.name.includes(args.only)) continue;
      await runSingleTarget(page, vp, vpName, t, pendingErrors, results);
    }

    await context.close().catch(() => {});
  }

  await browser.close().catch(() => {});

  fs.writeFileSync(path.join(QA_DIR, 'report.json'), JSON.stringify(results, null, 2));

  let totalIssues = 0;
  let targetsWithIssues = 0;
  for (const r of results) {
    if (r.issues.length > 0) {
      targetsWithIssues++;
      totalIssues += r.issues.length;
      console.log(r.vp + ' ' + r.name + ': ' + r.issues.length + ' issues');
      for (const i of r.issues) console.log('  ' + i);
    }
  }
  console.log(
    'Totals: ' + totalIssues + ' issues in ' + targetsWithIssues + ' of ' + results.length +
    ' targets across ' + vps.length + ' viewport(s)'
  );
}

process.on('unhandledRejection', () => {});
main().catch((err) => {
  console.error('qa-layout fatal: ' + (err && err.message ? err.message : String(err)));
});
process.exitCode = 0;
