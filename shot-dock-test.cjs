// Dock mode headless check (scratch, gitignored as shot-*). Usage: node shot-dock-test.cjs <id> <WxH> <auto|bot> [assist]
const { chromium } = require('playwright');
(async () => {
  const [id = 'dock.opti.jetty', size = '390x844', how = 'auto', assist = 'normal'] = process.argv.slice(2);
  const [W, H] = size.split('x').map(Number);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: W < 600, isMobile: W < 600 });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto('file:///C:/Projects/KOSGame/index.html');
  await page.waitForFunction(() => window.KOS && KOS.App);
  await page.evaluate(([id, assist]) => {
    // headless Chrome on this machine hangs drawing to the fixed fullscreen confetti canvas: stub it for the test only
    KOS.UI.confetti = () => ({ stop() {} });
    KOS.Storage.saveProfile({ name: 'Test', sailNo: '7' });
    KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true, lang: 'da' });
    KOS.App.play(id, { force: true });
    window.__fin = null; KOS.Events.on('play:finish', e => { window.__fin = e.result; });
  }, [id, assist]);
  const tag = id.replace(/\./g, '-') + '-' + size + '-' + how;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shot-dock-' + tag + '-1intro.png' });
  const r0 = await page.evaluate(how => { const inst = KOS.App.run.inst; inst.skipIntro(); if (how === 'auto') inst.setAutopilot(true); KOS.App.setPaused && 0; return inst.state.phase; }, how);
  // run the sim in chunks: pause the app loop and step manually so it's deterministic
  const shots = { approach: false, near: false, line: false };
  for (let chunk = 0; chunk < 400; chunk++) {
    const st = await page.evaluate(how => {
      const inst = KOS.App.run.inst; if (!inst) return { gone: true };
      const S = inst.state;
      for (let i = 0; i < 30; i++) {
        if (how === 'bot' && window.__bot) window.__bot(inst);
        inst.update(KOS.DT);
        if (window.__fin || S.phase === 'done') break;
      }
      const e = inst.debug.errors();
      return { phase: S.phase, t: S.time, d: e.d, pos: e.pos, ang: e.ang, q: S.lineQ, rope: S.rope && S.rope.state, pull: !!S.pull, v: Math.hypot(inst.boat.vx, inst.boat.vy), fin: !!window.__fin, step: S.step };
    }, how);
    if (st.gone) break;
    if (chunk % 10 === 0) console.log(JSON.stringify(st));
    if (!shots.approach && st.t > 4) { shots.approach = true; await page.waitForTimeout(150); await page.screenshot({ path: 'shot-dock-' + tag + '-2approach.png' }); }
    if (!shots.near && (st.q >= 1 || st.step === 'back')) { shots.near = true; await page.waitForTimeout(150); await page.screenshot({ path: 'shot-dock-' + tag + '-3near.png' }); }
    if (!shots.line && (st.rope === 'fly' || st.pull)) { shots.line = true; await page.waitForTimeout(100); await page.screenshot({ path: 'shot-dock-' + tag + '-4line.png' }); }
    if (st.phase === 'done') { await page.waitForTimeout(400); await page.screenshot({ path: 'shot-dock-' + tag + '-5done.png' }); 
      await page.evaluate(() => { const inst = KOS.App.run.inst; for (let i = 0; i < 400 && !window.__fin; i++) inst.update(KOS.DT); });
      break; }
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(1600);
  const fin = await page.evaluate(() => window.__fin);
  console.log('RESULT', JSON.stringify(fin));
  await page.screenshot({ path: 'shot-dock-' + tag + '-6results.png' });
  console.log(errs.join('\n') || 'no console errors');
  await browser.close();
})();
