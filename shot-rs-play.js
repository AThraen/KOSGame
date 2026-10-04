// Plays rowschool.r10 to completion in real time: wrong answer (key) → right answer (mouse/tap on chip) → explain/replay
// → sail it: first try held course (fails) → retry with autopilot → next scenarios via autopilot → results screen.
const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [w, h] = (process.argv[2] || '390x844').split('x').map(Number); const tag = w + 'x' + h;
  const mobile = w < 900;
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'Ida', sailNo: '123', boatColor: '#ff7a3d' }); KOS.Storage.saveSettings({ unlockAll: true, assist: 'normal', sound: false }); KOS.App.play('rowschool.r10', { force: true }); });
  const st = () => page.evaluate(() => { const i = KOS.App.run && KOS.App.run.inst; return i && i.state ? { phase: i.state.phase, idx: i.state.idx, screen: KOS.App.cur } : { screen: KOS.App.cur }; });
  const waitPhase = async (p, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (s.phase === p || s.screen === p || (p === 'win' && s.idx >= 1)) return s; await page.waitForTimeout(100); } throw new Error('timeout waiting ' + p + ' ' + JSON.stringify(await st())); };
  await page.waitForTimeout(1200); await page.screenshot({ path: `shot-rs-${tag}-1intro.png` });
  await waitPhase('ask'); await page.waitForTimeout(700); await page.screenshot({ path: `shot-rs-${tag}-2ask.png` });
  await page.keyboard.press('2'); await page.waitForTimeout(600); await page.screenshot({ path: `shot-rs-${tag}-3wrong.png` });
  if (mobile) await page.tap('.rs-choice[data-c="me"]'); else await page.click('.rs-choice[data-c="me"]');
  await waitPhase('explain'); await page.waitForTimeout(3500); await page.screenshot({ path: `shot-rs-${tag}-4explain.png` });
  if (mobile) await page.tap('.rs-go'); else await page.click('.rs-go');
  await waitPhase('sail', 8000); await page.waitForTimeout(1500); await page.screenshot({ path: `shot-rs-${tag}-5sail.png` });
  await waitPhase('fail', 20000); await page.waitForTimeout(1300); await page.screenshot({ path: `shot-rs-${tag}-6fail.png` });
  await page.keyboard.press('Enter');
  await waitPhase('count', 3000); await page.evaluate(() => KOS.App.run.inst.setAutopilot(true));
  await waitPhase('win', 30000); await page.evaluate(() => KOS.App.run.inst.setAutopilot(false)); await page.waitForTimeout(500); await page.screenshot({ path: `shot-rs-${tag}-7win.png` });
  await waitPhase('ask', 10000).catch(() => {}); await page.waitForTimeout(500); await page.screenshot({ path: `shot-rs-${tag}-8ask2.png` });
  // remaining scenarios: autopilot answers + sails in real time
  await page.evaluate(() => { const i = KOS.App.run.inst; i.answer(i.state.plan.ans); }); await waitPhase('explain', 10000); await page.waitForTimeout(2500); await page.screenshot({ path: `shot-rs-${tag}-9explain2.png` });
  await page.evaluate(() => KOS.App.run.inst.setAutopilot(true)); await waitPhase('results', 90000); await page.waitForTimeout(1500); await page.screenshot({ path: `shot-rs-${tag}-10results.png` });
  const res = await page.evaluate(() => { const p = KOS.Storage.progress('rowschool.r10'); return p; });
  console.log(tag, 'progress', JSON.stringify(res));
  console.log(errs.join('\n') || 'no errors'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
