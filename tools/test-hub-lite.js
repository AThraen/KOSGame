// Hub lite-mode test (headless Chrome, never a window): the slow-device safety net of js/ui/hub.js.
//   - fast frames (stubbed rAF clock, 16 ms)      -> stays in full mode, nothing remembered
//   - slow frames (120 ms) / slow first frame      -> switches to lite on the fly, remembers it (kos.hubLite), and the
//                                                    next visit starts lite straight away
//   - settings: lowFx=true forces lite, lowFx=false forces full even when remembered, reducedMotion implies lite
// The rAF clock is stubbed (the hub's probe reads rAF timestamps), so this does not depend on how fast the machine is.
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('FAIL ' + msg); } else console.log('ok   ' + msg); };

async function fresh(browser, settings) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.error('PAGEERR', e.message); });
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App && KOS.Hub, null, { timeout: 20000 });
  await page.evaluate(s => { KOS.Storage.saveProfile({ name: 'P', sailNo: '1' }); KOS.Storage.saveSettings(Object.assign({ sound: false, reducedMotion: false }, s || {})); }, settings);
  return { ctx, page };
}
// visit the hub with a stubbed frame clock: every rAF callback sees time advance by dt (first = extra added to the first step)
async function visit(page, dt) {
  await page.evaluate(dt => {
    if (!window.__origRaf) window.__origRaf = window.requestAnimationFrame.bind(window);
    window.__t = 1000;
    window.requestAnimationFrame = cb => window.__origRaf(() => { window.__t += dt; cb(window.__t); });
    KOS.App.show('title');
  }, dt);
  await page.waitForTimeout(300);
  await page.evaluate(() => KOS.App.show('hub'));
  await page.waitForFunction(() => document.querySelector('.hub.hub-in'), null, { timeout: 8000 });
  // probe needs ~2 s of stubbed time = up to 40 frames
  await page.waitForTimeout(1800);
  return page.evaluate(() => ({ lite: KOS.Hub.liteNow, flag: KOS.Storage.get('hubLite', null), info: KOS.Hub.probeInfo, cls: document.querySelector('.hub').className }));
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  let { ctx, page } = await fresh(browser);
  let r = await visit(page, 16);
  ok(!r.lite && !r.flag, 'fast frames stay in full mode and remember nothing (' + JSON.stringify(r.info) + ')');
  await ctx.close();

  ({ ctx, page } = await fresh(browser));
  r = await visit(page, 120);
  ok(r.lite && r.flag && r.flag.on && r.info.why === 'frames', 'slow frames (120 ms) switch to lite and remember it (' + JSON.stringify(r.info) + ')');
  // next visit starts lite immediately (before any measuring)
  await page.evaluate(() => { KOS.App.show('title'); });
  await page.waitForTimeout(300);
  const early = await page.evaluate(() => { KOS.App.show('hub'); return document.querySelector('.hub').classList.contains('hub-lite'); });
  ok(early, 'the next hub visit starts in lite mode right at mount');
  const noImgBig = await page.evaluate(() => { const s = document.querySelector('.hub-base') && document.querySelector('.hub-base').parentNode.querySelector('source').srcset; return s; });
  ok(noImgBig && noImgBig.indexOf('2x.webp') < 0, 'lite mode uses the 1x base image only');
  // the player forces full mode: lowFx=false wins over the remembered flag
  await page.evaluate(() => { KOS.Storage.saveSettings({ lowFx: false }); KOS.App.show('title'); });
  await page.waitForTimeout(300);
  const forcedFull = await page.evaluate(() => { KOS.App.show('hub'); return !document.querySelector('.hub').classList.contains('hub-lite'); });
  ok(forcedFull, 'lowFx=false overrides the remembered lite flag');
  await ctx.close();

  ({ ctx, page } = await fresh(browser, { lowFx: true }));
  r = await visit(page, 16);
  ok(r.lite, 'lowFx=true forces lite even with fast frames');
  await ctx.close();

  ({ ctx, page } = await fresh(browser, { reducedMotion: true }));
  r = await visit(page, 16);
  ok(r.lite || /hub-reduced/.test(r.cls), 'reducedMotion keeps the map still (' + r.cls + ')');
  await ctx.close();

  // first painted frame way over 1.5 s: the first measured step is huge
  ({ ctx, page } = await fresh(browser));
  await page.evaluate(() => {
    window.__origRaf = window.requestAnimationFrame.bind(window); window.__t = 1000; let n = 0;
    window.requestAnimationFrame = cb => window.__origRaf(() => { if (document.querySelector('.hub.hub-in')) n++; window.__t += (n === 2 ? 2500 : 16); cb(window.__t); });
  });
  await page.evaluate(() => KOS.App.show('hub'));
  await page.waitForFunction(() => document.querySelector('.hub.hub-in'), null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => ({ lite: KOS.Hub.liteNow, info: KOS.Hub.probeInfo, flag: KOS.Storage.get('hubLite', null) }));
  ok(r.lite && r.flag, 'a slow first frame also triggers lite (' + JSON.stringify(r.info) + ')');
  await ctx.close();

  await browser.close();
  if (fails) { console.error(fails + ' check(s) failed'); process.exit(1); }
  console.log('hub lite test passed');
})().catch(e => { console.error(e); process.exit(1); });
