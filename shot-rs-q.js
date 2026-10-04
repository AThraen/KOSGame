const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [w, h] = (process.argv[2] || '390x844').split('x').map(Number); const id = process.argv[3] || 'rowschool.r13'; const ms = +(process.argv[4] || 3000);
  const mobile = w < 900;
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--disable-software-rasterizer'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href); await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(id => { KOS.Storage.saveSettings({ unlockAll: true, assist: 'normal', sound: false }); KOS.App.play(id, { force: true }); }, id);
  await page.waitForTimeout(ms); await page.screenshot({ path: 'shot-q.png' });
  console.log(await page.evaluate(() => { const i = KOS.App.run.inst; return { phase: i.state.phase, fx: i.scene.effects && JSON.stringify(Object.keys(i.scene.effects)).slice(0, 200) }; }));
  console.log(errs.join('\n') || 'no errors'); await browser.close();
})();
