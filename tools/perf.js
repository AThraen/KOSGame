// Headless frame-time probe: measures rAF frame intervals (frames, avg, p50, p95, max),
// per-step update/render cost, and KOS.Perf.level for each activity id, with CPU throttling
// via CDP Emulation.setCPUThrottlingRate and a phone viewport (390x844, deviceScaleFactor 2).
// Use it to spot heavy screens before they ship. NEVER opens a visible window.
//
//   node tools/perf.js [ids...] [--rate=4] [--secs=5] [--vp=390x844]
//     ids     activity ids to probe (default: sail.free.opti race.opti.1 race.29er.1 nav.night
//             rib.tow dock.opti.jetty school.steer rowschool.r10); the id `hub` means the hub screen
//     --rate  CPU throttling rate (default 4)
//     --secs  measuring window per id, in seconds (default 5)
//     --vp    viewport WxH (default 390x844)
//
// Prints one aligned line per id, then `worst p95: <ms> (<id>)`. Exit code 0 if every p95 <= 20 ms, else 1.
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

const DEFAULT_IDS = ['sail.free.opti', 'race.opti.1', 'race.29er.1', 'nav.night', 'rib.tow', 'dock.opti.jetty', 'school.steer', 'rowschool.r10'];

(async () => {
  const opt = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
  const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!ids.length) ids.push(...DEFAULT_IDS);
  const rate = +opt('rate', 4);
  const secs = +opt('secs', 5);
  const [vw, vh] = opt('vp', '390x844').split('x').map(Number);

  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'P', sailNo: '1' }); KOS.Storage.saveSettings({ sound: false, unlockAll: true, assist: 'normal' }); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });

  let worst = { ms: -1, id: null };
  for (const id of ids) {
    if (id === 'hub') await page.evaluate(() => KOS.App.show('hub'));
    else await page.evaluate(id => { KOS.App.play(id, { force: true }); const i = KOS.App.run.inst; i && i.skipIntro && i.skipIntro(); }, id);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(winMs => new Promise(res => {
      const ts = []; let last = performance.now(); const t0 = performance.now();
      function f(now) {
        ts.push(now - last); last = now;
        if (now - t0 < winMs) requestAnimationFrame(f);
        else {
          ts.sort((a, b) => a - b);
          const avg = ts.reduce((a, b) => a + b, 0) / ts.length;
          res({ frames: ts.length, avg: +avg.toFixed(1), p50: +ts[ts.length >> 1].toFixed(1), p95: +ts[Math.floor(ts.length * .95)].toFixed(1), max: +ts[ts.length - 1].toFixed(1) });
        }
      }
      requestAnimationFrame(f);
    }), secs * 1000);
    // profile JS cost per frame: time update+render
    const cost = await page.evaluate(() => {
      const i = KOS.App.run.inst; if (!i) return null;
      const n = 30; let u = 0, rn = 0;
      for (let k = 0; k < n; k++) {
        let a = performance.now(); i.update(KOS.DT); u += performance.now() - a;
        a = performance.now(); i.render && i.render(1); rn += performance.now() - a;
      }
      return { updMs: +(u / n).toFixed(2), renMs: +(rn / n).toFixed(2) };
    });
    const lvl = await page.evaluate(() => KOS.Perf && KOS.Perf.level);
    console.log(
      id.padEnd(18)
      + String(r.frames).padStart(5) + 'f '
      + 'avg ' + String(r.avg).padStart(6)
      + '  p50 ' + String(r.p50).padStart(6)
      + '  p95 ' + String(r.p95).padStart(6)
      + '  max ' + String(r.max).padStart(6)
      + '  upd ' + (cost ? String(cost.updMs).padStart(6) : '     -')
      + '  ren ' + (cost ? String(cost.renMs).padStart(6) : '     -')
      + '  perf ' + lvl
    );
    if (r.p95 > worst.ms) worst = { ms: r.p95, id };
    if (id !== 'hub') await page.evaluate(() => KOS.App.run.host && KOS.App.run.host.quit());
    await page.waitForTimeout(300);
  }
  console.log('worst p95: ' + worst.ms + ' (' + worst.id + ')');
  await browser.close();
  process.exit(worst.ms <= 20 ? 0 : 1);
})();
