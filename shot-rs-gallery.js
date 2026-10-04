const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [w, h] = (process.argv[2] || '390x844').split('x').map(Number); const tag = w + 'x' + h; const mobile = w < 900 || h < 500;
  const list = (process.argv[3] || 'rowschool.r18:0,rowschool.ships:0,rowschool.ships:1,rowschool.rib:0,rowschool.exam:0,rowschool.exam:1').split(',');
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href); await page.waitForFunction(() => window.KOS && KOS.App);
  for (const it of list) {
    const [id, n] = it.split(':');
    await page.evaluate(([id, n]) => { KOS.Storage.saveProfile({ name: 'Ida', sailNo: '123' }); KOS.Storage.saveSettings({ unlockAll: true, assist: 'easy', sound: false }); KOS.App.play(id, { force: true });
      const i = KOS.App.run.inst; if (+n) { i.setAutopilot(true); let k = 0; while (i.state.idx < +n && k++ < 60 * 200) i.update(KOS.DT); i.setAutopilot(false); }
      i.skipIntro(); }, [id, n]);
    await page.waitForTimeout(3500); await page.screenshot({ path: `shot-rs-g-${tag}-${id.split('.')[1]}${n}-ask.png` });
    await page.evaluate(() => { const i = KOS.App.run.inst; i.answer(i.state.plan.ans); });
    await page.waitForTimeout(5000); await page.screenshot({ path: `shot-rs-g-${tag}-${id.split('.')[1]}${n}-explain.png` });
    await page.evaluate(() => KOS.App.run.inst.startSail()); await page.waitForTimeout(5500);
    await page.screenshot({ path: `shot-rs-g-${tag}-${id.split('.')[1]}${n}-sail.png` });
    console.log(it, await page.evaluate(() => KOS.App.run.inst.state.phase));
    await page.evaluate(() => KOS.App.show('hub'));
  }
  console.log(errs.join('\n') || 'no errors'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
