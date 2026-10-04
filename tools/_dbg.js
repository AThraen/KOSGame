const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'index.html')).href);
  await page.waitForTimeout(400);
  await page.evaluate(() => { KOS.Storage.saveProfile({ name: 'Ida', sailNo: '1' }); KOS.App.play(process_id = (window.ACT || 'sail.rings'), { force: true }); });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    console.log(await page.evaluate(() => { const i = KOS.App.run.inst, b = i.boat; return [i.state.phase, b.x.toFixed(1), b.y.toFixed(1), KOS.U.kn(b.speed).toFixed(2), b.heading.toFixed(2), b.pos, b.grounded, b.inIrons, b.distanceSailed.toFixed(1), KOS.App.run.paused, KOS.App.run.running].join(' '); }));
  }
  await browser.close();
})();
