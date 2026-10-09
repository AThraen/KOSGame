// Headless smoke test for the whole game. NEVER opens a visible window (Playwright, headless Chrome).
//
//   node tools/smoke.js                 file:// (all activities) + http via tools/serve.js (screens, 1 activity per mode, PWA)
//   node tools/smoke.js --only=sail     only activities whose id starts with "sail" (both passes)
//   node tools/smoke.js --file          file:// pass only          --http   http pass only
//   node tools/smoke.js --full          every activity in both passes
//   node tools/smoke.js --no-shots      skip the screenshots       --secs=3  seconds per activity (default 3)
//   node tools/smoke.js --no-tilt       skip the light "file-tilt" pass (Skrå visning on: 8 activities, see tiltPass)
//
// For every pass: boots index.html with a fresh profile, visits every screen and every hub area, starts each
// activity for a few seconds with simulated keyboard input (steer, sheet, hike, action, pause/resume), finishes one
// activity to render the results screen, and FAILS on any console error, uncaught exception, failed request,
// crashed mode, or an activity whose mode is not registered.
// Screenshots (JPEG) go to docs/screenshots/<w>x<h>-<screen>.jpg at 390x844, 844x390, 1024x1366 and 1440x900.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { serve } = require('./serve');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const flag = n => ARGS.includes('--' + n);
const opt = (n, d) => { const a = ARGS.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const ONLY = opt('only', '');
const SECS = +opt('secs', 3);
const SHOTS = !flag('no-shots');
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots');
const VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 844, h: 390, mobile: true },
  { w: 1024, h: 1366, mobile: true },
  { w: 1440, h: 900, mobile: false },
];

const problems = [];
const t0 = Date.now();
const log = (...a) => console.log(...a);

async function newPage(browser, vp, label) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1,
    hasTouch: !!vp.mobile, isMobile: !!vp.mobile && vp.w < 900,
    serviceWorkers: label.startsWith('http') ? 'allow' : 'block',
  });
  const page = await ctx.newPage();
  page.__errors = [];
  const rec = (kind, msg) => { page.__errors.push(kind + ': ' + msg); };
  page.on('console', m => { if (m.type() === 'error') rec('console.error', m.text()); });
  page.on('pageerror', e => rec('pageerror', (e && (e.stack || e.message)) || String(e)));
  page.on('requestfailed', r => { const f = r.failure(); if (f && /ERR_ABORTED/.test(f.errorText)) return; rec('requestfailed', r.url() + ' ' + (f ? f.errorText : '')); });
  page.on('response', r => { if (r.status() >= 400) rec('http ' + r.status(), r.url()); });
  return { ctx, page };
}

function check(page, where) {
  if (page.__errors.length) {
    for (const e of page.__errors) problems.push('[' + where + '] ' + e);
    log('  FAIL', where, '\n    ' + page.__errors.join('\n    '));
    page.__errors.length = 0;
    return false;
  }
  return true;
}

async function boot(page, base) {
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.classList.contains('booted') && window.KOS && KOS.App, null, { timeout: 15000 });
  // fresh player: profile + everything unlocked so every activity can start; sound off keeps logs quiet
  await page.evaluate(() => {
    KOS.Storage.saveProfile({ name: 'Smoke', age: '10-12', avatar: KOS.Storage.profile() ? KOS.Storage.profile().avatar : undefined, sailNo: '123', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings({ unlockAll: true, sound: false, music: false, lang: 'da' });
    KOS.I18n.setLang('da');
  });
}

async function show(page, screen, params) {
  await page.evaluate(([s, p]) => KOS.App.show(s, p || {}), [screen, params]);
  await page.waitForTimeout(350);
  const cur = await page.evaluate(() => KOS.App.cur);
  if (cur !== screen) problems.push('screen "' + screen + '" did not open (got "' + cur + '")');
}

async function playActivity(page, id, secs, label) {
  const r = await page.evaluate(id => {
    const a = KOS.Activities.get(id);
    if (!a) return 'no such activity';
    if (!KOS.Modes.get(a.mode)) return 'mode "' + a.mode + '" is not registered';
    return KOS.App.play(id, { force: true }) ? 'ok' : 'App.play refused';
  }, id);
  if (r !== 'ok') { problems.push('[' + label + '] ' + id + ': ' + r); log('  FAIL', id, r); return false; }
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = document.querySelector('.sc-go'); if (g) g.click(); }); // dismiss the lesson / race intro card
  // simulated play: steer, sheet, hike, action, number keys; then pause + resume
  const kb = page.keyboard;
  const seq = [['ArrowLeft', 500], ['ArrowUp', 300], ['Space', 400], ['ArrowRight', 600], ['ArrowDown', 250], ['Enter', 80], ['KeyE', 80], ['Digit1', 80]];
  const end = Date.now() + secs * 1000;
  let i = 0;
  while (Date.now() < end) {
    const [k, ms] = seq[i++ % seq.length];
    if (k === 'Digit1' && /^sail\.free/.test(id)) { await page.waitForTimeout(ms); continue; } // "1" would end the trip
    await kb.down(k); await page.waitForTimeout(ms); await kb.up(k);
  }
  await kb.press('Escape'); await page.waitForTimeout(200);
  const paused = await page.evaluate(() => KOS.App.run.paused);
  await kb.press('Escape'); await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({ cur: KOS.App.cur, failed: KOS.App.run.failed, running: KOS.App.run.running, paused: KOS.App.run.paused }));
  if (st.failed) { problems.push('[' + label + '] ' + id + ': mode crashed'); log('  FAIL', id, 'mode crashed'); }
  else if (st.cur !== 'play' && st.cur !== 'results') { problems.push('[' + label + '] ' + id + ': left the play screen (' + st.cur + ')'); }
  else if (st.cur === 'play' && !paused) { problems.push('[' + label + '] ' + id + ': Escape did not pause'); }
  return !st.failed;
}

async function quitPlay(page) {
  await page.evaluate(() => { if (KOS.App.cur === 'play' && KOS.App.run.host) KOS.App.run.host.quit(); });
  await page.waitForTimeout(200);
}

async function pass(browser, base, label, opts) {
  log('\n== ' + label + ' ' + base);
  const { ctx, page } = await newPage(browser, { w: 1440, h: 900 }, label);
  await boot(page, base);
  check(page, label + ' boot');
  // screens
  for (const s of ['title', 'hub', 'garage', 'settings', 'profile', 'credits']) { await show(page, s); check(page, label + ' screen ' + s); }
  const areas = await page.evaluate(() => KOS.Activities.areas());
  for (const a of areas) { await show(page, 'area', { area: a }); check(page, label + ' area ' + a); }
  // English pass over a couple of screens (strings + re-render)
  await page.evaluate(() => { KOS.Storage.saveSettings({ lang: 'en' }); KOS.I18n.setLang('en'); });
  await show(page, 'hub'); await show(page, 'area', { area: 'bay' }); check(page, label + ' english');
  await page.evaluate(() => { KOS.Storage.saveSettings({ lang: 'da' }); KOS.I18n.setLang('da'); });
  // activities
  let ids = await page.evaluate(() => KOS.Activities.list().map(a => a.id));
  if (ONLY) ids = ids.filter(id => id.startsWith(ONLY));
  if (!opts.all) { const seen = new Set(); ids = ids.filter(id => { const m = id.split('.')[0]; if (seen.has(m)) return false; seen.add(m); return true; }); }
  log('  activities:', ids.length);
  let ok = 0;
  for (const id of ids) {
    if (await playActivity(page, id, SECS, label)) ok++;
    await quitPlay(page);
    if (check(page, label + ' play ' + id)) process.stdout.write('  ✓ ' + id + '\n');
  }
  // results screen: finish the first activity through the host
  if (ids.length) {
    await page.evaluate(id => KOS.App.play(id, { force: true }), ids[0]);
    await page.waitForTimeout(400);
    await page.evaluate(() => KOS.App.run.host.finish({ stars: 2, score: 1234, timeMs: 83000, success: true, stats: { tacks: 4, distance: '420 m' } }));
    await page.waitForTimeout(1600);
    const cur = await page.evaluate(() => KOS.App.cur);
    if (cur !== 'results') problems.push('[' + label + '] finish() did not open results (got ' + cur + ')');
    check(page, label + ' results');
  }
  // PWA (http only): the service worker must install and control the page after a reload
  if (opts.pwa) {
    const sw = await page.evaluate(() => new Promise(res => {
      if (!navigator.serviceWorker) return res('no serviceWorker API');
      const to = setTimeout(() => res('timeout'), 15000);
      navigator.serviceWorker.ready.then(r => { clearTimeout(to); res(r.active ? 'active' : 'no active worker'); }).catch(e => res('error ' + e.message));
    }));
    if (sw !== 'active') problems.push('[' + label + '] service worker: ' + sw);
    else {
      await page.reload(); await page.waitForTimeout(1200);
      const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
      if (!ctl) problems.push('[' + label + '] service worker does not control the page after reload');
      log('  service worker:', sw, ctl ? '(controls page)' : '');
    }
    check(page, label + ' pwa');
  }
  log('  played', ok + '/' + ids.length);
  await ctx.close();
}

// Light Skrå visning pass (docs/specs/tilt-camera.md §9.2): boots once, sets {tilt:'on'} and plays a fixed handful of activities
// (--only filters it by id prefix like pass()). Per activity: no console errors, still on the play screen, the scene has eased
// in (_tiltT > 0.9 after 2 s) and screenToWorld(worldToScreen(p)) round-trips. Resets tilt to 'auto' afterwards.
const TILT_IDS = ['sail.free.zest', 'race.j70.1', 'race.29er.1', 'rib.tow', 'dock.opti.jetty', 'nav.night', 'rowschool.r10', 'school.steer'];
async function tiltPass(browser, base) {
  const label = 'file-tilt';
  log('\n== ' + label + ' ' + base);
  const { ctx, page } = await newPage(browser, { w: 1440, h: 900 }, label);
  await boot(page, base);
  check(page, label + ' boot');
  await page.evaluate(() => { KOS.Storage.saveSettings({ tilt: 'on' }); });
  const ids = ONLY ? TILT_IDS.filter(id => id.startsWith(ONLY)) : TILT_IDS;
  let ok = 0;
  for (const id of ids) {
    const started = await page.evaluate(id => !!KOS.Activities.get(id) && KOS.App.play(id, { force: true }), id);
    if (!started) { problems.push('[' + label + '] ' + id + ': could not start'); log('  FAIL', id, 'could not start'); continue; }
    await page.waitForTimeout(300);
    await page.evaluate(() => { const g = document.querySelector('.sc-go'); if (g) g.click(); }); // dismiss the lesson / race intro card
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => {
      const sc = KOS.SailScene.current; if (!sc) return { err: 'no scene' };
      const b = sc.target || (sc.boats && sc.boats[0]) || sc.camera, q = sc.screenToWorld(sc.worldToScreen(b));
      return { T: sc._tiltT, err: Math.hypot(q.x - b.x, q.y - b.y), cur: KOS.App.cur, failed: KOS.App.run.failed };
    });
    let bad = '';
    if (r.err === 'no scene') bad = 'no scene';
    else if (r.failed) bad = 'mode crashed';
    else if (r.cur !== 'play') bad = 'left the play screen (' + r.cur + ')';
    else if (!(r.T > 0.9)) bad = '_tiltT ' + r.T + ' after 2 s';
    else if (!(r.err < 1e-6)) bad = 'screenToWorld(worldToScreen(p)) error ' + r.err;
    if (bad) { problems.push('[' + label + '] ' + id + ': ' + bad); log('  FAIL', id, bad); } else ok++;
    await quitPlay(page);
    if (check(page, label + ' play ' + id) && !bad) process.stdout.write('  ✓ ' + id + '\n');
  }
  await page.evaluate(() => { KOS.Storage.saveSettings({ tilt: 'auto' }); });
  log('  played', ok + '/' + ids.length);
  await ctx.close();
}

async function screenshots(browser, base) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  for (const f of fs.readdirSync(SHOT_DIR)) if (/\.(jpg|png)$/.test(f)) fs.unlinkSync(path.join(SHOT_DIR, f));
  log('\n== screenshots → docs/screenshots/');
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await newPage(browser, vp, 'file');
    await boot(page, base);
    const snap = async name => { await page.screenshot({ path: path.join(SHOT_DIR, vp.w + 'x' + vp.h + '-' + name + '.jpg'), type: 'jpeg', quality: 72 }); };
    for (const s of ['title', 'hub', 'garage', 'settings', 'profile']) { await show(page, s); await page.waitForTimeout(700); await snap(s); }
    await show(page, 'area', { area: 'bay' }); await page.waitForTimeout(700); await snap('area-bay');
    // first activity of every mode, mid-play (after the intro/countdown)
    let ids = await page.evaluate(() => { const seen = new Set(); return KOS.Activities.list().filter(a => { if (seen.has(a.mode) || !KOS.Modes.get(a.mode)) return false; seen.add(a.mode); return true; }).map(a => a.id); });
    if (ONLY) ids = ids.filter(id => id.startsWith(ONLY));
    // the sail mode's challenges are the most telling screens
    if (!ONLY || 'sail'.startsWith(ONLY) || ONLY.startsWith('sail')) for (const extra of ['sail.rings', 'sail.timetrial', 'sail.free.29er']) if (!ids.includes(extra)) ids.push(extra);
    for (const id of ids) {
      const ok = await page.evaluate(id => !!KOS.Activities.get(id) && KOS.App.play(id, { force: true }), id);
      if (!ok) continue;
      await page.waitForTimeout(1100);
      await page.evaluate(() => { const g = document.querySelector('.sc-go'); if (g) g.click(); }); // dismiss the lesson / race intro card
      await page.waitForTimeout(3500);
      await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(700); await page.keyboard.up('ArrowLeft');
      await page.waitForTimeout(500);
      await snap('play-' + id.replace(/[^\w.-]/g, '_'));
      await quitPlay(page);
    }
    if (ids.length) {
      await page.evaluate(id => KOS.App.play(id, { force: true }), ids[0]);
      await page.waitForTimeout(500);
      await page.evaluate(() => KOS.App.run.host.finish({ stars: 3, score: 2480, timeMs: 95400, success: true, stats: { tacks: 6, gybes: 2, distance: '640 m' } }));
      await page.waitForTimeout(3200);
      await snap('results');
    }
    check(page, 'screenshots ' + vp.w + 'x' + vp.h);
    await ctx.close();
    log('  ' + vp.w + 'x' + vp.h + ' done');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const fileUrl = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
  let srv = null;
  try {
    if (!flag('http')) await pass(browser, fileUrl, 'file', { all: true });
    if (!flag('http') && !flag('no-tilt')) await tiltPass(browser, fileUrl);
    if (!flag('file')) {
      srv = await serve({ port: 0, root: ROOT });
      await pass(browser, srv.url, 'http', { all: flag('full'), pwa: true });
    }
    if (SHOTS) await screenshots(browser, fileUrl);
  } catch (e) {
    problems.push('smoke crashed: ' + (e.stack || e.message));
  } finally {
    if (srv) await srv.close();
    await browser.close();
  }
  log('\n' + (problems.length ? 'SMOKE FAILED (' + problems.length + ' problems)\n  ' + problems.join('\n  ') : 'SMOKE OK') + '  [' + ((Date.now() - t0) / 1000).toFixed(0) + ' s]');
  process.exit(problems.length ? 1 : 0);
})();
