// Quality-tier governor test (KOS.Perf, js/ui/app.js), headless Chrome, never a window.
//   - desktop at normal speed keeps tier 3 and remembers nothing
//   - phone-sized touch viewport starts at guess tier 2
//   - #perf=N forces a tier (data-tier on <html>, no governor)
//   - a throttled CPU (CDP, 10x) while sailing steps the tier DOWN and remembers it (Storage perfTier); a fresh page then starts there
//   - setting lowFx=true caps the tier at 1
//   heat (phones, html[data-mobile]):
//   - a 120 Hz rAF clock is drawn at ~60 fps on a phone, every vsync on desktop
//   - paused: no rAF callbacks at all (game loop and input ramp loop parked); resume draws again
//   - 5 level starts/exits leave the same number of rAF loops while playing (no leaked loops)
//   - long active play on a phone lowers the tier ('heat', not remembered); decorative menu/pause motion is off on phones
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');
const URL0 = url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('FAIL ' + msg); } else console.log('ok   ' + msg); };

async function open(browser, opts, hash, pre) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.error('PAGEERR', e.message); });
  await page.goto(URL0 + (hash || ''));
  await page.waitForFunction(() => window.KOS && KOS.App && KOS.Perf, null, { timeout: 20000 });
  await page.evaluate(p => { KOS.Storage.saveProfile({ name: 'P', sailNo: '1' }); KOS.Storage.saveSettings(Object.assign({ sound: false, unlockAll: true }, p || {})); }, pre);
  return { ctx, page };
}
const sail = async (page, ms) => {
  await page.evaluate(() => { KOS.App.play('sail.free.opti', { force: true }); const i = KOS.App.run.inst; i && i.skipIntro && i.skipIntro(); });
  await page.waitForTimeout(ms);
  return page.evaluate(() => ({ level: KOS.Perf.level, why: KOS.Perf.why, tier: document.documentElement.getAttribute('data-tier'), saved: KOS.Storage.get('perfTier', null) }));
};
const PHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 800 } };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let c = await open(browser, DESK);
  let r = await sail(c.page, 5000);
  ok(r.level === 3 && !r.saved, 'desktop at normal speed stays at tier 3, nothing remembered (' + JSON.stringify(r) + ')');
  await c.ctx.close();

  c = await open(browser, PHONE);
  ok(await c.page.evaluate(() => KOS.Perf.level === 2 && KOS.Perf.guess === 2), 'phone-sized touch screen starts at guess tier 2');
  await c.ctx.close();

  for (const t of [0, 1, 2, 3]) {
    c = await open(browser, PHONE, '#perf=' + t);
    r = await sail(c.page, 1500);
    ok(r.level === t && r.tier === String(t) && !r.saved, '#perf=' + t + ' forces tier ' + t);
    await c.ctx.close();
  }

  // throttled CPU: governor steps down and remembers; a second page in the same profile starts lower
  const ctx = await browser.newContext(PHONE);
  let page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.error('PAGEERR', e.message); });
  await page.goto(URL0);
  await page.waitForFunction(() => window.KOS && KOS.App && KOS.Perf);
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'P', sailNo: '1' }); KOS.Storage.saveSettings({ sound: false, unlockAll: true }); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });
  r = await sail(page, 9000);
  ok(r.level < 2 && r.why === 'slow' && r.saved && r.saved.level === r.level, 'slow frames step the tier down and remember it (' + JSON.stringify(r) + ')');
  const lvl = r.level;
  const saved = await page.evaluate(() => localStorage.getItem('kos.perfTier') || Object.keys(localStorage).join(','));
  const page2 = await ctx.newPage();
  await page2.goto(URL0);
  await page2.waitForFunction(() => window.KOS && KOS.Perf);
  ok(await page2.evaluate(l => KOS.Perf.level === l, lvl), 'a new session starts at the remembered tier ' + lvl + ' (' + saved + ')');
  await ctx.close();

  // stubbed frame clocks (the governor reads rAF timestamps): steady 33 ms = 30 fps cap -> stays; jittery 33-90 ms -> steps down
  for (const [name, step, expectDown] of [['steady 33 ms (30 fps cap)', '33.3', false], ['jittery 33-90 ms', '33 + Math.random() * 57', true]]) {
    c = await open(browser, DESK);
    await c.page.evaluate(step => {
      const orig = window.requestAnimationFrame.bind(window); let t = 1000, lastReal = -1;
      window.requestAnimationFrame = cb => orig(real => { if (real !== lastReal) { lastReal = real; t += eval(step); } cb(t); }); // one fake tick per real frame
    }, step);
    r = await sail(c.page, 6000);
    ok(expectDown ? r.level < 3 && r.why === 'slow' : r.level === 3 && !r.why, name + (expectDown ? ' steps the tier down' : ' does not step down') + ' (' + JSON.stringify({ level: r.level, why: r.why }) + ')');
    await c.ctx.close();
  }

  // ---- heat
  const RAF_COUNT = () => { const o = window.requestAnimationFrame.bind(window); window.__rafN = 0; window.requestAnimationFrame = cb => o(t => { window.__rafN++; cb(t); }); };
  c = await open(browser, PHONE);
  ok(await c.page.evaluate(() => document.documentElement.hasAttribute('data-mobile') && KOS.Perf.mobile), 'phone: html[data-mobile]');
  await c.ctx.close();
  c = await open(browser, DESK);
  ok(await c.page.evaluate(() => !document.documentElement.hasAttribute('data-mobile') && !KOS.Perf.mobile), 'desktop: no data-mobile');
  await c.ctx.close();

  for (const [name, opts, lo, hi] of [['phone', PHONE, 0.4, 0.62], ['desktop', DESK, 0.95, 1.01]]) {
    c = await open(browser, opts, '#perf=3');
    await c.page.evaluate(() => {
      const orig = window.requestAnimationFrame.bind(window); let t = 1000, lastReal = -1; window.__ticks = 0;
      window.requestAnimationFrame = cb => orig(real => { if (real !== lastReal) { lastReal = real; t += 1000 / 120; window.__ticks++; } cb(t); });
    });
    await sail(c.page, 1500);
    r = await c.page.evaluate(() => new Promise(res => { const R = KOS.App.run, d0 = R.drawn, k0 = window.__ticks; setTimeout(() => res((R.drawn - d0) / Math.max(1, window.__ticks - k0)), 1500); }));
    ok(r >= lo && r <= hi, name + ': 120 Hz clock -> drawn/vsync ' + r.toFixed(2) + ' (want ' + lo + '..' + hi + ')');
    await c.ctx.close();
  }

  {
    const ctx2 = await browser.newContext(PHONE); await ctx2.addInitScript(RAF_COUNT);
    const pg = await ctx2.newPage(); pg.on('pageerror', e => { fails++; console.error('PAGEERR', e.message); });
    await pg.goto(URL0 + '#perf=2'); await pg.waitForFunction(() => window.KOS && KOS.App && KOS.Perf);
    await pg.evaluate(() => { KOS.Storage.saveProfile({ name: 'P', sailNo: '1' }); KOS.Storage.saveSettings({ sound: false, unlockAll: true }); });
    // rAF callbacks per drawn game frame while sailing (game loop + input ramp loop = 2)
    const perFrame = () => pg.evaluate(() => new Promise(res => { const R = KOS.App.run, d0 = R.drawn, n0 = window.__rafN; setTimeout(() => res((window.__rafN - n0) / Math.max(1, R.drawn - d0)), 1000); }));
    const loops = [];
    for (let i = 0; i < 5; i++) {
      await sail(pg, 600); loops.push(await perFrame());
      await pg.evaluate(() => KOS.App.run.host.quit()); await pg.waitForTimeout(200);
    }
    ok(loops.every(n => n < 2.6) && loops[4] <= loops[0] + 0.3, '5 level starts/exits keep the same rAF loops per frame (' + loops.map(n => n.toFixed(2)).join(', ') + ')');
    await sail(pg, 600);
    await pg.evaluate(() => KOS.App.setPaused(true)); await pg.waitForTimeout(300);
    const paused = await pg.evaluate(() => new Promise(res => { const n0 = window.__rafN; setTimeout(() => res(window.__rafN - n0), 1000); }));
    ok(paused === 0, 'paused: no rAF callbacks (' + paused + ' in 1 s)');
    const ps = await pg.evaluate(() => getComputedStyle(document.querySelector('.pause-coach')).animationName);
    ok(ps === 'none', 'phone: the pause-card trainer holds still (' + ps + ')');
    await pg.evaluate(() => KOS.App.setPaused(false));
    const d = await pg.evaluate(() => new Promise(res => { const d0 = KOS.App.run.drawn; setTimeout(() => res(KOS.App.run.drawn - d0), 500); }));
    ok(d > 5, 'resume draws again (' + d + ' frames in 0.5 s)');
    await pg.evaluate(() => KOS.App.run.host.quit()); await pg.waitForTimeout(300);
    const kb = await pg.evaluate(() => { const e = document.querySelector('.mbg-photo'); return e ? getComputedStyle(e).animationName : 'missing'; });
    ok(kb === 'none', 'phone: menu photo stands still (' + kb + ')');
    await ctx2.close();
  }

  { // long active play on a phone: the tier ceiling drops ('heat'), the remembered tier is not touched
    c = await open(browser, PHONE);
    await c.page.evaluate(() => { KOS.Storage.set('perfTier', { level: 3, at: Date.now() }); KOS.Perf.level = 3; KOS.Perf.playMs = 5 * 60000; });
    r = await sail(c.page, 4000);
    ok(r.level === 2 && r.why === 'heat' && r.saved && r.saved.level === 3, '5 min of play on a phone: tier 3 -> 2 (heat), remembered tier kept (' + JSON.stringify(r) + ')');
    await c.ctx.close();
  }

  c = await open(browser, DESK, '', { lowFx: true });
  r = await sail(c.page, 1500);
  ok(r.level <= 1, 'lowFx=true caps the tier at 1 (' + r.level + ')');
  await c.ctx.close();

  await browser.close();
  if (fails) { console.error(fails + ' check(s) failed'); process.exit(1); }
  console.log('perf tier test passed');
})().catch(e => { console.error(e); process.exit(1); });
