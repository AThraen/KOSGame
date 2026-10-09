// Headless in-page checks for "Skrå visning" (tilted camera, docs/specs/tilt-camera.md). NEVER opens a visible window.
//
//   node tools/tilt-check.js [id] [--vp=390x844]
//   node tools/tilt-check.js --fit       course fit under tilt (step 5): race.opti.1 and race.j70.1 with tilt on, right after the intro fit(), every corner of
//                                        the course box maps through worldToScreen to inside [0,w]x[0,h], at 390x844 and 844x390
//   node tools/tilt-check.js --auto      the Skrå visning setting (auto/on/off), quick toggle V, overview M and the perf rule (step 4)
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
  if (process.argv.includes('--auto')) { // setting → _tiltWant table, V / M keys, perf-sticky rule
    const IDS = [['race.opti.1', 1], ['sail.free.zest', 1], ['rowschool.r10', 0], ['nav.buoys', 0], ['dock.zest.jetty', 0]];
    const start = async (id, setting) => {
      await page.evaluate(([id, setting]) => { if (KOS.App.run && KOS.App.run.host) KOS.App.run.host.quit(); KOS.Tilt.force = null; KOS.Storage.saveSettings({ tilt: setting }); KOS.App.play(id, { force: true }); const i = KOS.App.run.inst; i && i.skipIntro && i.skipIntro(); }, [id, setting]);
      await page.waitForTimeout(900);
    };
    const want = () => page.evaluate(() => KOS.SailScene.current._tiltWant);
    for (const setting of ['auto', 'on', 'off']) {
      const row = [];
      for (const [id, auto] of IDS) {
        await start(id, setting);
        const w = await want(), exp = setting === 'auto' ? auto : setting === 'on' ? 1 : 0;
        row.push(id + '=' + w);
        if (w !== exp) fails.push(setting + ' ' + id + ': _tiltWant ' + w + ', expected ' + exp);
      }
      console.log(setting.padEnd(5) + row.join('  '));
    }
    // quick toggle V (and the button) flips with an eased transition; M forces flat; T (penalty turn key) does not touch _tiltWant
    await start('race.opti.1', 'auto');
    await page.evaluate(() => { KOS.Storage.saveSettings({ assist: 'normal' }); });
    await start('race.opti.1', 'auto');
    const st = () => page.evaluate(() => { const s = KOS.SailScene.current; return { w: s._tiltWant, T: s._tiltT, tilt: KOS.SailScene.view.tilt }; });
    const t0 = await st();
    await page.keyboard.press('KeyV'); await page.waitForTimeout(150);
    const t1 = await st();
    if (!(t0.w === 1 && t1.w === 0 && t1.T < 1 && t1.T > 0)) fails.push('V: want ' + t0.w + ' -> ' + t1.w + ', T mid-ease ' + t1.T);
    await page.waitForTimeout(1500);
    const t2 = await st(); if (t2.T !== 0) fails.push('V: T not eased out to exactly 0: ' + t2.T);
    await page.keyboard.press('KeyV'); await page.waitForTimeout(100);
    if ((await st()).w !== 1) fails.push('V again: tilt not back on');
    await page.keyboard.press('KeyT'); await page.waitForTimeout(100);
    if ((await st()).w !== 1) fails.push('T changed _tiltWant');
    await page.keyboard.press('KeyM'); await page.waitForTimeout(150);
    if ((await st()).w !== 0) fails.push('overview M does not force _tiltWant 0');
    await page.keyboard.press('KeyV'); await page.waitForTimeout(100); // ignored-ish while overview (button disabled)
    await page.keyboard.press('KeyM'); await page.waitForTimeout(150);
    console.log('toggle  V: ' + t0.w + ' -> ' + t1.w + ' (T ' + t1.T.toFixed(2) + ') -> ' + t2.w + ' (T ' + t2.T + ');  M: _tiltWant forced 0');
    // reduced motion snaps
    await page.evaluate(() => { KOS.Storage.saveSettings({ reducedMotion: true }); }); await page.waitForTimeout(100);
    await page.evaluate(() => { KOS.SailScene.view.tilt = false; }); await page.waitForTimeout(250);
    const rm = await st(); if (rm.T !== 0) fails.push('reduced motion: T did not snap, ' + rm.T);
    await page.evaluate(() => { KOS.Storage.saveSettings({ reducedMotion: false }); });
    // perf-sticky: level 0 pinned -> a new auto run is off; an explicit on is still on
    await page.evaluate(() => { KOS.Perf.level = 0; KOS.Perf.max = 0; });
    await start('race.opti.1', 'auto'); const pa = await want(); await start('race.opti.1', 'on'); const pn = await want();
    console.log('perf level 0: auto race.opti.1 = ' + pa + ', on = ' + pn);
    if (pa !== 0) fails.push('perf level 0: auto _tiltWant ' + pa); if (pn !== 1) fails.push('perf level 0: explicit on _tiltWant ' + pn);
    if (errs.length) fails.push('console: ' + errs.join(' | '));
    await browser.close();
    console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'OK');
    process.exit(fails.length ? 1 : 0);
  }
  if (process.argv.includes('--fit')) {
    for (const rid of ['race.opti.1', 'race.j70.1']) for (const [vw, vh] of [[390, 844], [844, 390]]) {
      await page.setViewportSize({ width: vw, height: vh });
      await page.evaluate(([id]) => { if (KOS.App.run && KOS.App.run.host) KOS.App.run.host.quit(); KOS.Tilt.force = true; KOS.App.play(id, { force: true }); }, [rid]); // no skipIntro: the intro card shows the fitted course
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const inst = KOS.App.run.inst, sc = KOS.SailScene.current, cb = inst.debug.cb;
        sc.resize(); inst.debug.fitCourse(); sc.render(1); // the intro fit() at this viewport, then rebuild the projection
        let min = Infinity, n = 0;
        for (const [x, y] of [[cb.x0, cb.y0], [cb.x1, cb.y0], [cb.x0, cb.y1], [cb.x1, cb.y1]]) { const p = sc.worldToScreen(x, y); min = Math.min(min, p.x, sc.w - p.x, p.y, sc.h - p.y); if (p.x >= 0 && p.x <= sc.w && p.y >= 0 && p.y <= sc.h) n++; }
        return { w: sc.w, h: sc.h, want: sc._tiltWant, tilted: !!sc._tilt, kY: sc.kY, zoom: sc.camera.zoom, inside: n, margin: min };
      });
      console.log(rid + ' ' + vw + 'x' + vh + '  tilted ' + r.tilted + '  kY ' + r.kY.toFixed(3) + '  zoom ' + r.zoom.toFixed(3) + '  corners inside ' + r.inside + '/4  min margin ' + r.margin.toFixed(1) + ' px');
      if (r.want !== 1) fails.push(rid + ' ' + vw + 'x' + vh + ': _tiltWant ' + r.want); // the course zoom can fade the pitch to 0 (zoom < 1.5 px/m): then the flat fit applies and the corners must still be inside
      if (r.inside !== 4) fails.push(rid + ' ' + vw + 'x' + vh + ': ' + (4 - r.inside) + ' course corner(s) outside the screen');
    }
    if (errs.length) fails.push('console: ' + errs.join(' | '));
    await browser.close();
    console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'OK');
    process.exit(fails.length ? 1 : 0);
  }
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
