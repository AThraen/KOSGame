// Headless in-page checks for "Skrå visning" (tilted camera, docs/specs/tilt-camera.md). NEVER opens a visible window.
//
//   node tools/tilt-check.js [id] [--vp=390x844]
//     id    activity to play (default sail.free.zest)
//
// Plays the id with the tilt forced off, then forced on (KOS.Tilt.force), and checks:
//   - flat: scene._tilt is null and scene.kY === 1
//   - tilted: scene.kY ≈ cos(camera.pitch), and with camera.rot = 0.7 and biasY = 40 set by hand,
//     |screenToWorld(worldToScreen(p)) - p| < 1e-6 for 20 points spread over the view
//   - no console errors
// Prints the max round-trip error; exit code 0 if all pass, else 1.
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');

(async () => {
  const opt = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
  const id = process.argv.slice(2).find(a => !a.startsWith('--')) || 'sail.free.zest';
  const [w, h] = opt('vp', '390x844').split('x').map(Number);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  await page.goto(url.pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'Ida', age: '10-12', sailNo: '123', boatColor: '#ff7a3d' }); KOS.Storage.saveSettings({ unlockAll: true, sound: false }); });
  const fails = [];
  const play = async (on) => {
    await page.evaluate(([id, on]) => { if (KOS.App.run && KOS.App.run.host) KOS.App.run.host.quit(); KOS.Tilt.force = on; KOS.App.play(id, { force: true }); const i = KOS.App.run.inst; i && i.skipIntro && i.skipIntro(); }, [id, on]);
    await page.waitForTimeout(1500);
  };
  // flat
  await play(false);
  const flat = await page.evaluate(() => { const sc = KOS.SailScene.current; return { tilt: sc._tilt, kY: sc.kY }; });
  if (flat.tilt !== null || flat.kY !== 1) fails.push('flat: _tilt ' + JSON.stringify(flat.tilt) + ', kY ' + flat.kY);
  // tilted
  await play(true);
  const r = await page.evaluate(() => {
    const sc = KOS.SailScene.current, out = { T: sc._tiltT, pitch0: sc.camera.pitch, kY0: sc.kY };
    sc.camera.rot = 0.7; sc.biasY = 40; sc.render(1); // rebuild the projection with rot and biasY
    out.pitch = sc.camera.pitch; out.kY = sc.kY;
    let max = 0;
    for (let i = 0; i < 20; i++) {
      const p = sc.screenToWorld(((i % 5) + 0.5) / 5 * sc.w, (Math.floor(i / 5) + 0.5) / 4 * sc.h); // spread over the view
      const q = sc.screenToWorld(sc.worldToScreen(p));
      max = Math.max(max, Math.hypot(q.x - p.x, q.y - p.y));
    }
    out.max = max;
    sc.camera.rot = 0; sc.biasY = 0;
    return out;
  });
  console.log(id + '  T ' + r.T.toFixed(3) + '  pitch ' + (r.pitch * 180 / Math.PI).toFixed(2) + '°  kY ' + r.kY.toFixed(4) + '  round-trip max err ' + r.max.toExponential(2));
  if (!(r.T > 0.9)) fails.push('T not eased in: ' + r.T);
  if (!(r.pitch > 0) || Math.abs(r.kY - Math.cos(r.pitch)) > 1e-12) fails.push('kY ' + r.kY + ' vs cos(pitch) ' + Math.cos(r.pitch));
  if (!(r.max < 1e-6)) fails.push('round trip error ' + r.max);
  if (errs.length) fails.push('console: ' + errs.join(' | '));
  await browser.close();
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'OK');
  process.exit(fails.length ? 1 : 0);
})();
