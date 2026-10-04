// Playtest: every rowschool activity, phone (touch, taps on boats) or desktop (keyboard). Fast-forwards sims, real UI input.
// node shot-rs-pt.js 390x844 [actFilter] [assist]
const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [w, h] = (process.argv[2] || '390x844').split('x').map(Number); const tag = w + 'x' + h;
  const filt = process.argv[3] || ''; const assist = process.argv[4] || 'normal';
  const mobile = w < 900;
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(() => {
    window.__kd = 0; const a = window.addEventListener, r = window.removeEventListener;
    window.addEventListener = function (t, f, o) { if (t === 'keydown') window.__kd++; return a.call(this, t, f, o); };
    window.removeEventListener = function (t, f, o) { if (t === 'keydown') window.__kd--; return r.call(this, t, f, o); };
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(a => { localStorage.clear(); KOS.Storage.saveProfile({ name: 'Ida', sailNo: '123', boatColor: '#ff7a3d' }); KOS.Storage.saveSettings({ unlockAll: true, assist: a, sound: false }); KOS.Storage.set('boat', 'opti'); }, assist);
  const st = () => page.evaluate(() => { const i = KOS.App.run && KOS.App.run.inst; return i && i.state ? { phase: i.state.phase, idx: i.state.idx, screen: KOS.App.cur, t: i.sim && +i.sim.t.toFixed(1) } : { screen: KOS.App.cur }; });
  // fast-forward until predicate on state (string phase) or seconds
  const ff = (phase, maxS = 60) => page.evaluate(([phase, maxS]) => {
    const i = KOS.App.run.inst; let n = 0;
    while (n++ < maxS * 60) { if (KOS.App.cur !== 'play' || (phase && i.state.phase === phase)) break; i.update(KOS.DT); }
    return { phase: i.state.phase, n, screen: KOS.App.cur };
  }, [phase, maxS]);
  const tapAt = async (x, y) => { if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  const boatXY = who => page.evaluate(who => {
    const i = KOS.App.run.inst, sc = i.scene, v = i.state.view, b = who === 'me' ? v.player : v.focus().o;
    const p = sc.worldToScreen(b.x, b.y), r = document.querySelector('#play canvas, canvas').getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top };
  }, who);
  const acts = await page.evaluate(() => KOS.Activities.list({ mode: 'rowschool' }).map(a => a.id).filter(id => id.startsWith('rowschool.')));
  const summary = [];
  for (const id of acts) {
    if (filt && !id.includes(filt)) continue;
    await page.evaluate(id => KOS.App.play(id, { force: true }), id);
    await page.waitForTimeout(300);
    const n = await page.evaluate(() => KOS.App.run.act.params.scenarios.length);
    for (let k = 0; k < n; k++) {
      await ff('ask', 10); await page.waitForTimeout(450);
      const sid = await page.evaluate(() => KOS.App.run.inst.state.plan.id);
      await page.screenshot({ path: `shot-pt-${tag}-${sid}-1ask.png` });
      const ans = await page.evaluate(() => KOS.App.run.inst.state.plan.ans);
      const wrong = ans === 'me' ? 'other' : 'me';
      if (k === 0) { // a wrong guess first
        if (mobile) { const p = await boatXY(wrong); await tapAt(p.x, p.y); } else await page.keyboard.press(wrong === 'me' ? '1' : '2');
        await page.waitForTimeout(500);
        if (k === 0 && id === acts[0]) await page.screenshot({ path: `shot-pt-${tag}-${sid}-1wrong.png` });
      }
      if (ans === 'both') { if (mobile) await page.tap('.rs-choice[data-c="both"]'); else await page.keyboard.press('3'); }
      else if (mobile) { const p = await boatXY(ans); await tapAt(p.x, p.y); } else await page.keyboard.press(ans === 'me' ? '1' : '2');
      await page.waitForTimeout(800);
      let s = await st(); if (s.phase !== 'explain') { console.log('  !! answer did not register', id, sid, JSON.stringify(s)); await page.evaluate(a => KOS.App.run.inst.answer(a), ans); await page.waitForTimeout(800); }
      await ff(null, 3); await page.waitForTimeout(400);
      await page.screenshot({ path: `shot-pt-${tag}-${sid}-2explain.png` });
      if (mobile) await page.tap('.rs-go'); else await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await ff('sail', 6);
      if (k === 0) { // do nothing: does idle fail when it should?
        const r = await ff('fail', 40); s = await st();
        if (r.phase === 'fail') { await page.waitForTimeout(1200); await page.screenshot({ path: `shot-pt-${tag}-${sid}-3fail.png` });
          const fk = await page.evaluate(() => KOS.App.run.inst.state.fail.kind); console.log('  idle →', sid, 'fail', fk);
          if (mobile) await page.tap('.rs-retry'); else await page.keyboard.press('Enter');
          await page.waitForTimeout(200); await ff('sail', 6);
        } else console.log('  idle →', sid, r.phase);
      }
      s = await st();
      if (s.phase === 'sail') {
        await page.evaluate(() => KOS.App.run.inst.setAutopilot(true));
        await ff(null, 5); await page.waitForTimeout(400); await page.screenshot({ path: `shot-pt-${tag}-${sid}-4sail.png` });
        const r = await ff('win', 60); await page.evaluate(() => KOS.App.run.inst.setAutopilot(false));
        if (r.phase !== 'win') console.log('  !! no win', sid, JSON.stringify(r));
      }
      await ff(k + 1 < n ? 'intro' : 'done', 5);
    }
    await page.waitForTimeout(2500);
    const res = await page.evaluate(id => ({ screen: KOS.App.cur, prog: KOS.Storage.progress(id), kd: window.__kd, left: document.querySelectorAll('[class*="rowschool-"]').length }), id);
    await page.screenshot({ path: `shot-pt-${tag}-${id.split('.')[1]}-results.png` });
    console.log(id, JSON.stringify(res));
    summary.push(res);
  }
  console.log(errs.join('\n') || 'no errors'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
