// Frame-free play test (headless Chrome currently produces no frames on this machine): drives inst.update manually,
// clicks DOM buttons, presses keys, and dumps canvas renders (toDataURL) + overlay boxes at key moments.
const { chromium } = require('playwright'); const path = require('path'); const url = require('url'); const fs = require('fs');
(async () => {
  const [w, h] = (process.argv[2] || '390x844').split('x').map(Number); const tag = w + 'x' + h; const mobile = w < 900;
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-accelerated-2d-canvas'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'Ida', sailNo: '123', boatColor: '#ff7a3d' }); KOS.Storage.saveSettings({ unlockAll: true, assist: 'normal', sound: false }); KOS.App.play('rowschool.r10', { force: true }); window.__fin = null; KOS.Events.on('play:finish', e => { window.__fin = e && e.result; }); });
  const run = (sec) => page.evaluate(sec => { const i = KOS.App.run.inst; for (let k = 0; k < sec * 60; k++) i.update(KOS.DT); return { phase: i.state.phase, idx: i.state.idx, t: i.sim && +i.sim.t.toFixed(1) }; }, sec);
  const until = (ph, max = 60) => page.evaluate(([ph, max]) => { const i = KOS.App.run.inst; let k = 0; for (; k < max * 60 && i.state.phase !== ph && !window.__fin; k++) i.update(KOS.DT); return { phase: i.state.phase, idx: i.state.idx, s: k / 60 }; }, [ph, max]);
  const snap = async name => {
    const d = await page.evaluate(() => { const i = KOS.App.run.inst; i.render(1); const c = document.querySelector('canvas'); 
      const boxes = [...document.querySelectorAll('.rowschool-card:not([hidden]), .rowschool-title:not([hidden]), .rowschool-role:not([hidden]), .coach, .hud, .kc')].map(e => { const r = e.getBoundingClientRect(); return { c: e.className.split(' ')[0], x: r.x|0, y: r.y|0, w: r.width|0, h: r.height|0, txt: e.innerText.replace(/\s+/g, ' ').slice(0, 140) }; });
      return { img: c.toDataURL('image/png'), boxes }; });
    fs.writeFileSync(`shot-rs-${tag}-${name}.png`, Buffer.from(d.img.split(',')[1], 'base64'));
    console.log('--', name); for (const b of d.boxes) if (b.w) console.log('   ', b.c, b.x, b.y, b.w + 'x' + b.h, '|', b.txt);
  };
  console.log(await run(1)); await snap('1intro');
  console.log(await until('ask')); await run(0.5); await snap('2ask');
  await page.keyboard.press('2'); await run(0.3);
  console.log('hint:', await page.evaluate(() => document.querySelector('.rs-hint').innerText));
  await page.evaluate(() => document.querySelector('.rs-choice[data-c="me"]').click());
  console.log(await until('explain', 3)); await run(3.5); await snap('3explain');
  await page.evaluate(() => document.querySelector('.rs-go').click());
  console.log(await until('sail', 5)); await run(2); await snap('4sail');
  // player holds course with no input → must fail (give-way boat)
  console.log(await until('fail', 30)); await run(1); await snap('5fail');
  await page.keyboard.press('Enter'); await run(0.1);
  console.log('after enter', await run(0));
  // steer for real with keys: bear away (ArrowRight on port tack heading 50 local... just use autopilot for the retry)
  await page.evaluate(() => KOS.App.run.inst.setAutopilot(true));
  console.log(await until('win', 40)); await run(0.6); await snap('6win');
  console.log(await until('ask', 10)); await snap('7ask2');
  console.log(await until('explain', 10)); await run(2.5); await snap('8explain2');
  const r = await page.evaluate(() => { const i = KOS.App.run.inst; for (let k = 0; k < 200 * 60 && !window.__fin; k++) i.update(KOS.DT); return window.__fin; });
  console.log('RESULT', JSON.stringify(r), 'screen', await page.evaluate(() => KOS.App.cur));
  console.log(errs.join('\n') || 'no errors'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
