// Sails scenario r10a with REAL keyboard input (a tiny closed-loop "human" pressing ←/→), no autopilot.
const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href); await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(() => { KOS.Storage.saveSettings({ unlockAll: true, assist: 'normal', sound: false }); KOS.Storage.set('boat', 'opti'); KOS.App.play('rowschool.r10', { force: true }); KOS.App.run.inst.skipIntro(); });
  await page.waitForFunction(() => KOS.App.run.inst.state.phase === 'ask'); await page.keyboard.press('1');
  await page.waitForFunction(() => KOS.App.run.inst.state.phase === 'explain'); await page.waitForTimeout(500); await page.keyboard.press('Enter');
  await page.waitForFunction(() => KOS.App.run.inst.state.phase === 'sail', null, { timeout: 10000 });
  let held = null, last = '';
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => { const i = KOS.App.run.inst, sim = i.sim, sc = sim.plan.scn; let h = sc.me.hdg; for (const e of sc.auto) if (sim.t >= e.t - 0.6) h = e.h;
      const want = sim.plan.F.hW(h); return { phase: i.state.phase, t: sim.t, err: KOS.U.angDiff(sim.player.heading, want) * 180 / Math.PI, idx: i.state.idx, fail: i.state.fail && i.state.fail.kind }; });
    if (s.phase !== 'sail') { last = JSON.stringify(s); break; }
    const k = s.err > 6 ? 'ArrowRight' : s.err < -6 ? 'ArrowLeft' : null;
    if (k !== held) { if (held) await page.keyboard.up(held); if (k) await page.keyboard.down(k); held = k; }
    await page.waitForTimeout(50);
  }
  if (held) await page.keyboard.up(held);
  console.log('ended sail with', last);
  console.log(errs.join('\n') || 'no errors'); await browser.close();
})();
