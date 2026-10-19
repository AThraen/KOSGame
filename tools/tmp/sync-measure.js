// KØS SEJL — live-race sync measurement harness (headless). Usage: node tools/tmp/sync-measure.js [scenario ...] [--secs=75] [--out=file.json]
// Scenarios: a (no latency) b (80ms+-40) c (250ms+jitter+bursts) d (30fps/120Hz clients) e (clock skew +-2s) f (tab frozen 5 s)
//            g (clock RATE drift +-0.1%, 150 s) h (client main thread blocked 4 s around the gun, 30 ms rtt)
// 3 sailors (autopilot) on a local server behind per-client delaying WebSocket proxies. Every rendered frame records the client's own boat
// (truth) and where it draws / judges (predictRemote) every other boat, keyed by the real wall clock; the error is measured against the owner's log.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('../serve');
const ROOT = path.resolve(__dirname, '..', '..');
const WSLib = require(path.join(ROOT, 'server', 'node_modules', 'ws'));
const { createServer } = require(path.join(ROOT, 'server', 'index.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2);
const SECS_ARG = (args.find(a => a.startsWith('--secs=')) || '').split('=')[1];
const OUT = (args.find(a => a.startsWith('--out=')) || '').split('=')[1];
const want = args.filter(a => !a.startsWith('--'));

// delaying proxy: one-way base +- jitter (uniform), order preserved (TCP), rare stalls (loss-like bursts)
function proxy(target, cfg) {
  const wss = new WSLib.Server({ port: 0 });
  wss.on('connection', (cl) => {
    const up = new WSLib(target);
    const q = { c2s: { last: 0, stall: 0 }, s2c: { last: 0, stall: 0 } };
    const buf = [];
    const fwd = (dir, to, data, bin) => {
      const st = q[dir]; const now = Date.now();
      if (cfg.burst && Math.random() < cfg.burst) st.stall = now + 300 + Math.random() * 500;
      let r = now + Math.max(0, cfg.base + (Math.random() * 2 - 1) * cfg.jit);
      r = Math.max(r, st.last, st.stall); st.last = r;
      setTimeout(() => { if (to.readyState === 1) to.send(data, { binary: bin }); }, r - now);
    };
    cl.on('message', (d, bin) => { if (up.readyState === 1) fwd('c2s', up, d, bin); else buf.push([d, bin]); });
    up.on('open', () => { buf.splice(0).forEach(([d, b]) => fwd('c2s', up, d, b)); });
    up.on('message', (d, bin) => fwd('s2c', cl, d, bin));
    cl.on('close', () => { try { up.close(); } catch (e) { /* */ } });
    up.on('close', () => { try { cl.close(); } catch (e) { /* */ } });
    up.on('error', () => {}); cl.on('error', () => {});
  });
  return new Promise(res => wss.on('listening', () => res({ port: wss.address().port, close: () => wss.close() })));
}

const N = { base: 10, jit: 5 }; // fast wifi / ethernet
const SCEN = {
  a: { desc: 'no added latency', c: [{ base: 0, jit: 0 }, { base: 0, jit: 0 }, { base: 0, jit: 0 }] },
  b: { desc: '80 ms +-40 jitter', c: [{ base: 40, jit: 40 }, { base: 40, jit: 40 }, { base: 40, jit: 40 }] },
  c: { desc: '250 ms, jitter, 1% bursts', c: [{ base: 125, jit: 60, burst: 0.01 }, { base: 125, jit: 60, burst: 0.01 }, { base: 125, jit: 60, burst: 0.01 }] },
  d: { desc: 'C1 30fps (4x CPU), C2 120Hz, 30 ms', c: [{ ...N, cpu: 4 }, { ...N, fast: true }, { ...N }] },
  e: { desc: 'C1 clock +2 s, C2 clock -2 s, 30 ms', c: [{ ...N, skew: 2000 }, { ...N, skew: -2000 }, { ...N }] },
  f: { desc: 'C1 tab frozen 5 s (rAF paused), 30 ms', c: [{ ...N, freezeAt: 30, freezeS: 5 }, { ...N }, { ...N }] },
  g: { desc: 'C1 clock runs 0.1% fast, C2 0.1% slow (150 s)', secs: 150, c: [{ ...N, rate: 1.001 }, { ...N, rate: 0.999 }, { ...N }] },
  h: { desc: 'C3 main thread blocked 4 s around the gun', c: [{ ...N }, { ...N }, { ...N, block: 4000 }] },
};

const REC = `(() => {
  const inst = KOS.App.run.inst, live = inst.live, o = inst.render;
  const R = window.__rec = { me: [], rem: [], t0: 0 };
  const rn = window.__realNow;
  inst.render = function () {
    const r = o.apply(this, arguments);
    try {
      if (inst.state.clock > -9) {
        const t = rn(), b = inst.boat;
        R.me.push([t, b.x, b.y, b.heading, b.speed]);
        for (const x of live.remotes) {
          const p = live.predict(x);
          R.rem.push([t, x.rid, x.x, x.y, p ? p.x : null, p ? p.y : null, x.buf.items.length, x.lost ? 1 : 0, b.x, b.y, inst.state.clock]);
        }
      }
    } catch (e) { R.err = String(e); }
    return r;
  };
})()`;

async function runScenario(key, browser, web, statusFile) {
  const sc = SCEN[key];
  const SECS = SECS_ARG ? +SECS_ARG : (sc.secs || 75);
  const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
  const port = await srv.listen();
  const real = 'ws://127.0.0.1:' + port + '/ws';
  const proxies = []; const ctxs = []; const pages = [];
  const STATUS_URL = web.url.replace(/\/$/, '') + '/mp-status.json';
  async function newPage(i, hash, name) {
    const cfg = sc.c[i];
    const px = await proxy(real, cfg); proxies.push(px);
    const WS = 'ws://127.0.0.1:' + px.port;
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
    ctxs.push(ctx);
    const page = await ctx.newPage();
    const skew = cfg.skew || 0, rate = cfg.rate || 1;
    await page.addInitScript(`(() => { const o = performance.now.bind(performance), to = performance.timeOrigin; window.__realNow = () => to + o();
      const sk = ${skew}, rt = ${rate}; if (sk || rt !== 1) performance.now = () => o() * rt + sk;
      window.__rafGate = { paused: false, q: [] }; const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => { if (window.__rafGate.paused) { window.__rafGate.q.push(cb); return 0; } return raf(cb); };
      window.__rafResume = () => { window.__rafGate.paused = false; const q = window.__rafGate.q.splice(0); q.forEach(cb => raf(cb)); }; })()`);
    page.on('pageerror', e => console.log('pageerror', e.message));
    await page.route('**/mp-status.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }) }));
    const ov = 'mp=' + encodeURIComponent(WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL);
    await page.goto(web.url + '#' + [hash, ov].filter(Boolean).join('&'));
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await page.evaluate(n => { KOS.Storage.saveProfile({ name: n, sailNo: '7', avatar: null }); KOS.Storage.saveSettings({ sound: false, music: false, reducedMotion: true, unlockAll: true }); }, name);
    if (cfg.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.cpu }); }
    pages.push(page);
    return page;
  }
  const waitView = (page, v, ms) => page.waitForFunction(x => { const e = document.getElementById('screen-live'); return e && !e.hidden && e.getAttribute('data-live-view') === x; }, v, { timeout: ms || 15000 });
  const clickAct = (page, act) => page.click('#screen-live [data-act="' + act + '"]');
  const names = ['Ane', 'Bo', 'Cy'];
  const host = await newPage(0, 'area=race', names[0]);
  await host.waitForSelector('.live-card', { timeout: 8000 }); await host.click('.live-card'); await waitView(host, 'entry');
  await clickAct(host, 'host'); await waitView(host, 'setup');
  await host.evaluate(c => Object.assign(KOS.Lobby.state.cfg, c), { boat: 'ilca', laps: 2, windKn: 12, windDeg: 225, countdownS: 12, gust: 0.3, shift: 0.3, pen: true, help: 'locked' });
  await clickAct(host, 'create'); await waitView(host, 'room');
  const code = await host.evaluate(() => document.getElementById('live-code-show').textContent);
  for (let i = 1; i < 3; i++) {
    const p = await newPage(i, 'area=race', names[i]);
    await p.waitForSelector('.live-card', { timeout: 8000 }); await p.click('.live-card'); await waitView(p, 'entry');
    await clickAct(p, 'joinview'); await waitView(p, 'join'); await p.fill('#live-code', code); await clickAct(p, 'join'); await waitView(p, 'room');
  }
  await host.waitForFunction(() => document.querySelectorAll('.live-player').length === 3, null, { timeout: 8000 });
  await clickAct(host, 'start');
  const blk = sc.c.findIndex(c => c.block);
  if (blk >= 0) { await sleep(5000); pages[blk].evaluate(ms => { const e = performance.now() + ms; while (performance.now() < e); }, sc.c[blk].block).catch(() => {}); }
  for (const p of pages) await p.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, { timeout: 30000 });
  for (const p of pages) await p.evaluate(() => { const i = KOS.App.run.inst; i.setAutopilot(true); i.skipIntro(); });
  for (const p of pages) await p.waitForFunction(() => KOS.App.run.inst.state.clock > -9, null, { timeout: 60000 });
  for (const p of pages) await p.evaluate(REC);
  await pages[0].waitForFunction(() => KOS.App.run.inst.state.raceT > 4, null, { timeout: 60000 });
  const ids = await Promise.all(pages.map(p => p.evaluate(() => KOS.App.run.host.live.myId)));
  const t0 = Date.now();
  const c0 = sc.c[0];
  if (c0.freezeAt) {
    sleep(c0.freezeAt * 1000).then(async () => { await pages[0].evaluate(() => { window.__rafGate.paused = true; }); await sleep(c0.freezeS * 1000); await pages[0].evaluate(() => window.__rafResume()); });
  }
  await sleep(SECS * 1000);
  const dumps = await Promise.all(pages.map(p => p.evaluate(() => ({ rec: window.__rec, L: KOS.App.run.inst.boat.cls.length, rtt: KOS.App.run.host.live.rtt }))));
  for (const c of ctxs) await c.close().catch(() => {});
  proxies.forEach(p => p.close()); try { await srv.close(); } catch (e) { /* */ }
  return { key, desc: sc.desc, ids, dumps, t0, secs: SECS, freeze: c0.freezeAt ? [t0 + c0.freezeAt * 1000, t0 + (c0.freezeAt + c0.freezeS) * 1000] : null };
}

// ---- analysis
function interp(rows, t) { // rows [t,x,y,hd,sp]
  let lo = 0, hi = rows.length - 1;
  if (!rows.length || t < rows[0][0] || t > rows[hi][0]) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
  const a = rows[lo], b = rows[hi]; if (b[0] - a[0] > 400) return null;
  const f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, sp: a[4] + (b[4] - a[4]) * f };
}
function stats(v) { if (!v.length) return { n: 0, mean: NaN, p95: NaN, max: NaN }; const s = v.slice().sort((a, b) => a - b); return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }; }
function analyse(R) {
  const L = R.dumps[0].L;
  const pre = [], drawn = [], judged = [], dLag = [], jLag = [], depth = [], near = [], far = [], late = [];
  R.dumps.forEach((vw, vi) => {
    for (const row of vw.rec.rem) {
      const [t, rid, dx, dy, px, py, depthN, lost, mx, my, clk] = row;
      const oi = R.ids.indexOf(rid); if (oi < 0) continue;
      if (R.freeze && (vi === 0 || oi === 0) && t > R.freeze[0] && t < R.freeze[1] + 4000) continue; // a frozen tab catches up
      const tr = interp(R.dumps[oi].rec.me, t); if (!tr || lost) continue;
      const ed = Math.hypot(dx - tr.x, dy - tr.y), ej = px == null ? null : Math.hypot(px - tr.x, py - tr.y);
      if (clk >= 0) drawn.push(ed); if (clk >= 0 && ej != null) judged.push(ej); depth.push(depthN);
      if (clk < 0) { pre.push(ed); continue; }
      (Math.hypot(dx - mx, dy - my) < 4 * L ? near : far).push(ed);
      if (tr.sp > 1) { dLag.push(ed / tr.sp); if (ej != null) jLag.push(ej / tr.sp); }
      if (t - R.t0 < 15000) late.push(ed);
    }
  });
  return { L, fps: R.dumps.map(d => +(d.rec.me.length / R.secs).toFixed(0)), drawn: stats(drawn), judged: stats(judged), dLag: stats(dLag), jLag: stats(jLag), near: stats(near), far: stats(far), depth: stats(depth), first15: stats(late), pre: stats(pre) };
}

(async () => {
  const web = await serve({ port: 0 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-sync-'));
  const statusFile = path.join(tmp, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }));
  const fastArgs = ['--disable-frame-rate-limit', '--disable-gpu-vsync'];
  const out = {};
  for (const key of want.length ? want : Object.keys(SCEN)) {
    const browser = await chromium.launch({ headless: true, channel: 'chrome', args: key === 'd' ? fastArgs : [] });
    try {
      const R = await runScenario(key, browser, web, statusFile);
      R.t0 = R.t0 || 0;
      const A = analyse(R); out[key] = { desc: R.desc, ...A };
      const f = s => s.n ? s.mean.toFixed(2) + '/' + s.p95.toFixed(2) + '/' + s.max.toFixed(2) : '-';
      console.log(`[${key}] ${R.desc}  L=${A.L}m fps=${A.fps} rtt=${R.dumps.map(d => Math.round(d.rtt))}\n   drawn err m (mean/p95/max): ${f(A.drawn)}  lag s: ${f(A.dLag)}\n   judged err m: ${f(A.judged)}  lag s: ${f(A.jLag)}\n   near ${f(A.near)}  far ${f(A.far)}  first15s ${f(A.first15)}  PRE-GUN ${f(A.pre)}  buf depth mean ${A.depth.mean.toFixed(1)}  n=${A.drawn.n}`);
    } catch (e) { console.log(`[${key}] FAILED`, e.message); out[key] = { error: e.message }; }
    await browser.close();
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  web.close && web.close();
  process.exit(0);
})();
