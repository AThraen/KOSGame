// scratch diagnostic for race mode (not part of the game)
const { chromium } = require('playwright'); const path = require('path'); const url = require('url');
(async () => {
  const [id = 'race.opti.1', boat = 'opti', assist = 'easy', ap = '1'] = process.argv.slice(2);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url.pathToFileURL(path.resolve('C:/Projects/KOSGame/index.html')).href);
  await page.waitForFunction(() => window.KOS && KOS.App);
  const info = await page.evaluate(([id, boat, assist, ap]) => {
    KOS.Storage.saveProfile({ name: 'Auto', sailNo: '1' }); KOS.Storage.saveSettings({ assist, sound: false, unlockAll: true });
    window.__f=[]; const om=KOS.Rules.monitor; KOS.Rules.monitor=function(o){const m=om(o);const u=m.update.bind(m);m.update=function(b,w,mk,dt){const r=u(b,w,mk,dt)||[];r.forEach(f=>{if((f.offender&&f.offender.isPlayer)||(f.victim&&f.victim.isPlayer))window.__f.push([Math.round(KOS.App.run.inst.state.clock),f.type,f.rule,f.contact?'C':'-',f.offender&&f.offender.isPlayer?'ME':'them',f.mark&&f.mark.id].join(' '));});return r;};return m;};KOS.App.play(id, { force: true }); const inst = KOS.App.run.inst; window.__res = null;
    KOS.Events.on('play:finish', e => { window.__res = e && e.result; });
    if (ap === '1') inst.setAutopilot(true); inst.skipIntro();
    const B = inst.debug, U = KOS.U;
    return 'm1 ' + Math.round(U.dist(B.marks[0], B.pin)) + 'm line ' + Math.round(U.dist(B.pin, B.com)) + 'm seq ' + B.seq.length + ' boats ' + inst.boats.length;
  }, [id, boat, assist, ap]);
  console.log(info);
  for (let k = 0; k < 120; k++) {
    const t0 = Date.now();
    const line = await page.evaluate(() => {
      const inst = KOS.App.run.inst; if (!inst || window.__res) return null; const S = inst.state, me = inst.boat, B = inst.debug;
      for (let s = 0; s < 600 && !window.__res; s++) inst.update(KOS.DT);
      return [S.phase, Math.round(S.clock), 'leg', me.rc.leg, 'pl', me.rc.place, 'kn', KOS.U.kn(me.speed).toFixed(1), me.pos, B.ap && B.ap.state, 'pen', !!S.pen, 'f', S.fouls,
        'ai', inst.boats.slice(1).map(b => b.rc.leg + (b.helm.state[0]) + (b.rc.finT != null ? '*' : '')).join(',')].join(' ');
    });
    if (!line) break; console.log(line + '  (' + (Date.now() - t0) + 'ms)');
  }
  const r = await page.evaluate(() => { const res = window.__res; return res && { stars: res.stars, t: res.timeMs, stats: res.stats, rows: res.raceTable.rows.map(r => r.place + ' ' + r.name + ' ' + r.timeMs + (r.est ? '~' : '')) }; });
  console.log(JSON.stringify(r)); console.log((await page.evaluate(()=>window.__f)).join(' | ')); console.log(errs.join('\n') || 'no errors');
  await browser.close();
})();
