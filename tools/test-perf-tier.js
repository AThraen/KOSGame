// Quality-tier governor test (KOS.Perf, js/ui/app.js), headless Chrome, never a window.
//   - desktop at normal speed keeps tier 3 and remembers nothing
//   - phone-sized touch viewport starts at guess tier 2
//   - #perf=N forces a tier (data-tier on <html>, no governor)
//   - a throttled CPU (CDP, 10x) while sailing steps the tier DOWN and remembers it (Storage perfTier); a fresh page then starts there
//   - setting lowFx=true caps the tier at 1
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

  c = await open(browser, DESK, '', { lowFx: true });
  r = await sail(c.page, 1500);
  ok(r.level <= 1, 'lowFx=true caps the tier at 1 (' + r.level + ')');
  await c.ctx.close();

  await browser.close();
  if (fails) { console.error(fails + ' check(s) failed'); process.exit(1); }
  console.log('perf tier test passed');
})().catch(e => { console.error(e); process.exit(1); });
