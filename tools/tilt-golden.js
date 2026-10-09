// Golden-frame check for the tilted camera (docs/specs/tilt-camera.md §9.3). Renders fixed, deterministic frame
// sequences of several activities with tilt OFF and prints "<id> <sha1 of the canvas pixels>" per line. Run it on the base
// worktree and on HEAD: the outputs must be identical (the flat path may never change). NEVER opens a visible window.
//
//   node tools/tilt-golden.js [--root=<dir>] [--frames=90]
//     --png=<dir>  also save each final canvas as <dir>/<label>.png (to eyeball that the frames are not blank)
//     --root  load index.html from another checkout (default: this repo), e.g. ../KOSGame-base at commit 847860f
//   git worktree add ../KOSGame-base 847860f
//   node tools/tilt-golden.js --root=../KOSGame-base > base.txt; node tools/tilt-golden.js > head.txt; diff base.txt head.txt
//
// Determinism: Math.random = mulberry32(42) (re-seeded per run), performance.now/Date.now = manual clock advanced 1/60 s
// per frame, requestAnimationFrame = no-op (the app loop never runs on its own; we call update/render by hand).
// Uses only public state (no new API), so it runs on the base. Ids dropped as non-deterministic: none.
// Coverage scenarios (extra hashed runs, id:name): shake, spinnaker, hike (trapeze), capsized, ghost.
const { chromium } = require('playwright');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const IDS = ['sail.free.zest', 'race.j70.1', 'race.29er.1', 'race.hboat.1', 'nav.night', 'dock.opti.jetty', 'rowschool.r10'];
// [label, activity id, frame to act on (or 'each' = after every update), action run in the page]
const SCEN = [
  ['shake', 'sail.free.zest', 30, `KOS.SailScene.current.shake(1)`],
  ['spinnaker', 'race.hboat.1', 'each', `inst.boat.spinnaker = true`],
  ['hike', 'race.29er.1', 'each', `inst.boat.hike = 1`],
  ['capsized', 'sail.free.zest', 'each', `inst.boat.capsized = true; inst.boat.heel = 1.5`],
  ['ghost', 'race.j70.1', 0, `const b = (inst.boats || []).find(x => x !== inst.boat); if (b) b.ghost = true; else throw new Error('no AI boat for ghost')`],
];

(async () => {
  const opt = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
  const root = path.resolve(process.cwd(), opt('root', path.join(__dirname, '..')));
  const frames = +opt('frames', 90), pngDir = opt('png', '');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error') logs.push('error ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.addInitScript(() => {
    function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    window.__seed = () => { Math.random = mulberry32(42); };
    window.__seed();
    let now = 1000;
    window.__tick = ms => { now += ms; };
    performance.now = () => now;
    Date.now = () => 1700000000000 + now;
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
  await page.goto(url.pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App, null, { timeout: 15000 });
  await page.evaluate(() => {
    KOS.Storage.saveProfile({ name: 'Ida', age: '10-12', sailNo: '123', boatColor: '#ff7a3d' });
    KOS.Storage.saveSettings({ unlockAll: true, sound: false, tilt: 'off' });
  });

  // one run: fresh seed + clock-driven frames; returns the sha1 of the final canvas
  async function run(label, id, frame, act, n) {
    const r = await page.evaluate(async ({ id, frame, act, n }) => {
      window.__seed();
      const ok = KOS.App.play(id, { force: true });
      if (!ok) return { err: 'could not start ' + id };
      const inst = KOS.App.run.inst;
      if (inst.skipIntro) inst.skipIntro();
      const doAct = act ? new Function('inst', act) : null;
      if (doAct && frame === 0) doAct(inst);
      for (let f = 0; f < n; f++) {
        window.__tick(1000 / 60);
        inst.update(KOS.DT);
        if (doAct && (frame === 'each' || frame === f + 1 && frame !== 0)) doAct(inst);
        inst.render(1);
      }
      const c = (KOS.SailScene && KOS.SailScene.current && KOS.SailScene.current.canvas) || document.querySelector('canvas');
      return { data: c.toDataURL(), w: c.width, h: c.height };
    }, { id, frame, act, n });
    if (r.err) throw new Error(r.err);
    if (pngDir) require('fs').writeFileSync(path.join(pngDir, label.replace(/[^\w.-]/g, '_') + '.png'), Buffer.from(r.data.split(',')[1], 'base64'));
    return crypto.createHash('sha1').update(r.data).digest('hex');
  }

  const out = [];
  for (const id of IDS) out.push(id + ' ' + await run(id, id, null, null, frames));
  for (const [name, id, frame, act] of SCEN) out.push(id + ':' + name + ' ' + await run(id + ':' + name, id, frame, act, frames));
  console.log(out.join('\n'));
  if (logs.length) console.error(logs.join('\n'));
  await browser.close();
  process.exit(logs.some(l => l.startsWith('pageerror')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
