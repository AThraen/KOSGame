const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => { const id = process.argv[2];
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: '--disable-gpu --disable-software-rasterizer'.split(' ') });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => console.log('pe', e.message)); page.on('crash', () => console.log('CRASH event'));
  await page.goto(url.pathToFileURL(path.resolve('index.html')).href); await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(id => { KOS.Storage.saveSettings({ unlockAll: true, sound: false }); KOS.App.play(id, { force: true }); }, id);
  for (const step of ['update', 'render', 'small', 'dataurl']) {
    try { const r = await page.evaluate(step => { const i = KOS.App.run.inst;
      if (step === 'update') { for (let k = 0; k < 60; k++) i.update(KOS.DT); return 'ok'; }
      if (step === 'render') { i.render(1); return 'ok'; }
      if (step === 'small') { const c = document.createElement('canvas'); c.width = 10; c.height = 10; c.getContext('2d').fillRect(0,0,5,5); return c.toDataURL().length; }
      const c = document.querySelector('canvas'); return c.width + 'x' + c.height + ' ' + c.toDataURL().length; }, step); console.log(step, r); }
    catch (e) { console.log(step, 'ERR', e.message.slice(0, 80)); break; }
  }
  process.exit(0); })();
