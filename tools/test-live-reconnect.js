// KØS SEJL — live race reconnect and resume (suite 'livereconnect', docs/superpowers/specs/2026-10-30-live-rules-and-race-list-design.md
// part E). Headless Chrome; each sailor's socket goes through its own local TCP proxy that can cut cleanly (RST/FIN, new connections
// refused) or black-hole (half-open: nothing passes, nothing is closed), so the real browser WebSocket sees what a phone sees.
// The scenarios run side by side, each in its own room on one in-process server; each prints its block when it is done.
//   matrix   one room, ten sailors: clean cuts and black holes of 2, 10, 40 and 90 s, context.setOffline + the online event, and an
//            Android-like background (hidden with timers running, the network down for 20 s after the return, back with an attempt
//            hung in the dead network). Each comes back in the same race instance with no teleport, the host sees the boat again, and
//            the race ends with an official result for all of them
//   cut      a clean 20 s cut: "Forbinder igen…", after 15 s "vi prøver stadig" + "Prøv nu" and unofficial; "Prøv nu" = back at once
//   bg       iOS-like background: page frozen (CDP lifecycle) + hidden for 45 s with the network gone; back = an immediate retry
//   reload   reload mid race with 2 penalty turns owed: the sessionStorage snapshot puts the boat back with the exact turns
//   kill     the app killed mid race (2 turns owed): a fresh context from storageState; title + hub banner, resume, pose, leg, the 2 turns
//   quit     "Til kortet" mid race: the seat is kept (no leave), the hub banner "Fortsæt live-løbet" leads straight back into the race
//   replaced a second window resumes the seat: the first gets 4409, says "åbent i et andet vindue" and does not steal it back
//   lobby    the lobby half-open: the 8 s lobby watchdog gets the sailor into the race that started meanwhile
//   ended    the race ended while away: off the network (the official table on the race screen), after "Til kortet" (late resume), the
//            room gone (the stored result, or "Løbet er slut")
//   banner   the banner shows offline without a WebSocket, "Ikke nu", a #join for another race, "Udgå"; on screen at phone + laptop size
//   finfail  the network drops right at the finish (a clean cut and a black hole): the finish still reaches the server (review round 1)
//   lobbyseat the lobby seat is gone while the phone is away (dropped, restart): the resume joins the open lobby again, never "Løbet er slut"
//   rescut   a drop on the podium, the host's rematch meanwhile: the sailor lands in the new lobby
//   entry    "Til kortet" lands on the hub; the Live entry view offers "Fortsæt live-løbet", and typing the same code resumes the seat
//   finoff   finishing after 15 s offline: the unofficial result screen comes up by itself, and the finish still reaches the server
//            once the network is back (review round 2)
//   abortdrop a 3 s drop while the host aborts: the sailor leaves the dead race screen for the lobby and is in the next race with a session
//   ghost    a 25 s drop while the host ends the race and starts a rematch: the old race's table (my row marked), then the new lobby
// Only some: node tools/test-live-reconnect.js matrix,kill. Screenshots of the banner: SHOTS=dir/ node tools/test-live-reconnect.js banner
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { chromium } = require('playwright');
const { serve } = require('./serve');

const ROOT = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(ROOT, 'server', 'node_modules', 'ws'))) { console.log('SKIP livereconnect: server/node_modules is missing (npm install in server/).'); process.exit(0); }
const { createServer } = require(path.join(ROOT, 'server', 'index.js'));

let fails = 0, checks = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const want = n => !ONLY.length || ONLY.includes(n);
const T_START = Date.now();

// a TCP proxy in front of the race server: cut() = connections reset and new ones refused; black() = everything silently dropped.
// up() lets traffic through again; up(true) leaves the black-holed connections hanging (as a phone's sockets do when the network
// comes back), so only a NEW attempt gets through
function proxy(target) {
  const conns = new Set(); let mode = 'up';
  const srv = net.createServer(c => {
    if (mode === 'refuse') { c.destroy(); return; }
    const o = { c, dead: mode === 'black' };
    conns.add(o);
    if (o.dead) { c.on('error', () => {}); c.on('close', () => conns.delete(o)); return; }
    const u = net.connect(target, '127.0.0.1'); o.u = u;
    c.on('data', d => { if (!o.dead) u.write(d); }); u.on('data', d => { if (!o.dead) c.write(d); });
    const end = () => { conns.delete(o); c.destroy(); u.destroy(); };
    c.on('close', () => { if (!o.dead) end(); }); u.on('close', () => { if (!o.dead) end(); }); c.on('error', () => {}); u.on('error', () => {});
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({
    port: srv.address().port,
    cut() { mode = 'refuse'; for (const o of conns) { o.c.destroy(); o.u && o.u.destroy(); } conns.clear(); },
    black() { mode = 'black'; for (const o of conns) o.dead = true; },
    up(keepHung) { mode = 'up'; if (!keepHung) for (const o of conns) if (o.dead) { o.c.destroy(); o.u && o.u.destroy(); conns.delete(o); } },
    close() { for (const o of conns) { o.c.destroy(); o.u && o.u.destroy(); } srv.close(); },
  })));
}

async function main() {
  const web = await serve({ port: 0 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-reconnect-'));
  const statusFile = path.join(tmp, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ mode: 'on', message: '', maxRooms: 20, maxPlayers: 12 }));
  const STATUS_URL = web.url.replace(/\/$/, '') + '/mp-status.json';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  // a short server heartbeat: a half-open socket is cut after 6 s instead of 25 s (the client must cope either way). Every socket comes
  // from 127.0.0.1, so the per-IP connection limit is lifted for the rooms running side by side
  const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_PING_MS: '2000', KOS_DEAD_MS: '6000', KOS_MAX_PER_IP: '400' });
  const port = await srv.listen();
  const SHOTS = process.env.SHOTS || '';

  async function newPage(WS, name, opts) {
    opts = opts || {};
    const ctx = await (opts.br || browser).newContext({ viewport: opts.viewport || { width: 900, height: 700 }, serviceWorkers: 'block', storageState: opts.storage });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push(e.message));
    await page.route('**/mp-status.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'on', message: '', maxRooms: 20, maxPlayers: 12 }) }));
    await page.addInitScript(n => {
      // every WebSocket the page opens (count + time), and when the last 'online' event came
      window.__ws = 0; window.__wsT = []; const W = window.WebSocket;
      window.WebSocket = function (u, p) { window.__ws++; window.__wsT.push(performance.now()); return new W(u, p); }; window.WebSocket.prototype = W.prototype;
      Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
      window.addEventListener('online', () => { window.__onlineT = performance.now(); }, true);
      try { if (!localStorage.getItem('kos.profile')) localStorage.setItem('kos.profile', JSON.stringify({ name: n, sailNo: '7', avatar: null })); } catch (e) { /* */ }
    }, name);
    await page.goto(web.url + (opts.hash || '#area=race') + '&mp=' + encodeURIComponent(WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL));
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await page.evaluate(n => { KOS.Storage.saveProfile({ name: n, sailNo: '7', avatar: null }); KOS.Storage.saveSettings({ sound: false, music: false, reducedMotion: true, unlockAll: true }); }, name);
    page.ctx = ctx;
    return page;
  }
  const waitView = (p, v, ms) => p.waitForFunction(x => { const e = document.getElementById('screen-live'); return e && !e.hidden && e.getAttribute('data-live-view') === x; }, v, { timeout: ms || 10000 });
  const act = (p, a) => p.click('#screen-live [data-act="' + a + '"]');
  const inRace = (p, ms) => p.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, { timeout: ms || 20000 });
  const bot = p => p.evaluate(() => { const i = KOS.App.run.inst; i.setAutopilot(true); i.skipIntro(); });
  // per frame: the biggest jump of my own boat beyond what it can sail in the race time of that frame (6 m/s; a teleport is one big step).
  // Measured against the race clock, so a slow frame on a busy machine, or catching up a short lag, is not a jump
  const jumpWatch = p => p.evaluate(() => {
    window.__inst = KOS.App.run.inst; window.__jump = 0; let last = null;
    const f = () => { const i = KOS.App.run.inst; if (i && i === window.__inst && i.boat) { const b = i.boat, c = i.state.clock; if (last) window.__jump = Math.max(window.__jump, Math.hypot(b.x - last.x, b.y - last.y) - 6 * Math.max(0, c - last.c)); last = { x: b.x, y: b.y, c }; } if (!window.__stopJ) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  // emulated page visibility (hidden = the app is in the background); the events go to document as on a phone
  const setHidden = (p, h) => p.evaluate(h => {
    if (!window.__visHook) {
      window.__visHook = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hid });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hid ? 'hidden' : 'visible') });
    }
    window.__hid = h; document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  const until = async (p, fn, arg, ms) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const snapIn = (p, store) => p.evaluate(s => { try { const o = JSON.parse(window[s].getItem('kos.mp.snap')); return !!o && o.code === KOS.Lobby.state.sess.code; } catch (e) { return false; } }, store);

  // A room: the host (direct) and the sailors, each through a proxy of its own. sailors: [{name, viewport}] (default one 'Dorte').
  async function room(start, opts) {
    opts = opts || {};
    const WSd = 'ws://127.0.0.1:' + port + '/ws';
    const h = await newPage(WSd, opts.hostName || 'Vaert', { viewport: opts.hostViewport, br: opts.hostBr || opts.br });
    await h.waitForSelector('.live-card'); await h.click('.live-card'); await waitView(h, 'entry'); await act(h, 'host'); await waitView(h, 'setup');
    await h.evaluate(c => Object.assign(KOS.Lobby.state.cfg, { boat: 'ilca', laps: 3, windKn: 12, windDeg: 225, countdownS: 8, help: 'free', finishS: 0 }, c || {}), opts.cfg);
    await act(h, 'create'); await waitView(h, 'room');
    const code = await h.evaluate(() => document.getElementById('live-code-show').textContent);
    const S = await Promise.all((opts.sailors || [{ name: 'Dorte' }]).map(async s => {
      const px = await proxy(port);
      const WSp = 'ws://127.0.0.1:' + px.port + '/ws';
      const p = await newPage(WSp, s.name, { viewport: s.viewport || opts.viewport, br: opts.br });
      await p.waitForSelector('.live-card'); await p.click('.live-card'); await waitView(p, 'entry'); await act(p, 'joinview'); await waitView(p, 'join');
      await p.fill('#live-code', code); await act(p, 'join'); await waitView(p, 'room');
      const id = await p.evaluate(() => KOS.Lobby.state.sess.id);
      return Object.assign({}, s, { p, px, WSp, id });
    }));
    const R = { h, S, d: S[0].p, px: S[0].px, WSp: S[0].WSp, code, r: () => srv.rooms.rooms.get(code) };
    R.by = name => S.find(s => s.name === name);
    R.seat = (name) => { const r = R.r(); const p = r && [...r.players.values()].find(x => x.name === (name || S[0].name)); return p ? { phase: r.phase, lost: !!p.lost, left: !!p.left, status: p.status || null } : { phase: r && r.phase, gone: true }; };
    R.dst = (p) => (p || R.d).evaluate(() => {
      const s = KOS.Lobby.state.sess, i = KOS.App.run && KOS.App.run.inst, st = i && i.state;
      return { cur: KOS.App.cur, st: s && s.state, away: !!(s && s.away), rc: s && s.reconnects, unoff: i && i.live ? i.live.unofficial : null, net: st ? st.netMode : null,
        banner: (document.querySelector('.race-live-banner:not([hidden])') || {}).textContent || '', tryBtn: !!document.querySelector('.race-live-banner [data-net]'),
        x: i && i.boat ? i.boat.x : null, y: i && i.boat ? i.boat.y : null, leg: i && i.boat && i.boat.rc ? i.boat.rc.leg : null, seatLS: !!localStorage.getItem('kos.mp.seat') };
    });
    // the host's view of a sailor's boat (found by its seat id)
    R.hostSees = (s) => h.evaluate(id => { const L = KOS.App.run.inst && KOS.App.run.inst.live, b = L && L.remotes.find(x => x.rid === id); return b ? { lost: !!b.lost, x: b.x, y: b.y } : null; }, (s || S[0]).id);
    R.same = (p) => (p || R.d).evaluate(() => KOS.App.run.inst === window.__inst);
    R.done = async () => { await h.ctx.close().catch(() => {}); for (const s of S) { await s.p.ctx.close().catch(() => {}); s.px.close(); } };
    if (start) {
      await act(h, 'start');
      await Promise.all([h].concat(S.map(s => s.p)).map(async p => { await inRace(p); await bot(p); }));
      await R.d.waitForFunction(() => KOS.App.run.inst.state.clock > 3, null, { timeout: 20000 });
    }
    return R;
  }
  // the checks after a sailor is back: same race instance, official, no teleport, the host sees the boat near where it is
  async function backChecks(R, s, ok, tag) {
    const c = await R.dst(s.p);
    const jump = await s.p.evaluate(() => window.__jump);
    ok(await R.same(s.p) && c.unoff === false && c.cur === 'play' && !c.banner, tag + 'same race instance, official again, banner gone (' + JSON.stringify([c.cur, c.unoff, c.banner]) + ')');
    ok(jump < 3, tag + 'no teleport: the biggest step of my own boat beyond its speed was ' + jump.toFixed(2) + ' m');
    // the host shows the boat from the next state batch on; a few seconds of grace for a busy test machine
    let hs = null, dist = -1;
    for (let k = 0; k < 8; k++) {
      const me = await R.dst(s.p); hs = await R.hostSees(s);
      dist = hs ? Math.hypot(hs.x - me.x, hs.y - me.y) : -1;
      if (hs && !hs.lost && dist < 25) break;
      await sleep(500);
    }
    ok(hs && !hs.lost && dist < 25, tag + 'the host sees the boat again, near where it is (' + (hs ? Math.round(dist) + ' m' : '-') + ')');
    ok(!R.seat(s.name).lost && R.seat(s.name).phase === 'racing', tag + 'the server seat is back (not lost)');
  }

  // ================================================================ the scenarios
  const SCEN = [];
  const scen = (name, title, fn) => SCEN.push({ name, title, fn });

  // ---------------------------------------------------------------- the cut matrix (and setOffline, Android) in one room
  scen('matrix', 'clean cuts + black holes of 2/10/40/90 s, setOffline + online, Android-like background, all in one race', async (ok) => {
    const CUTS = [['clean', 2], ['clean', 10], ['clean', 40], ['clean', 90], ['black', 2], ['black', 10], ['black', 40], ['black', 90]];
    const small = { width: 480, height: 360 };
    const sailors = CUTS.map(([k, s]) => ({ name: (k === 'clean' ? 'Klip' : 'Sort') + s, kind: k, secs: s, viewport: small }))
      .concat([{ name: 'Offline', viewport: small }, { name: 'Android', viewport: small }]);
    // 2 laps: about 3 minutes of racing, so even the 90 s cut is back well before the finish
    // the sailors share a browser (and GPU process) of their own; the host, whose view of the boats is checked, has another one: on one
    // busy browser the host's page fell seconds behind with its messages, which no host phone does
    const br = await chromium.launch({ headless: true, channel: 'chrome' }), hostBr = await chromium.launch({ headless: true, channel: 'chrome' });
    const R = await room(true, { sailors, hostViewport: small, cfg: { laps: 2, maxP: 12 }, br, hostBr });
    for (const s of R.S) await jumpWatch(s.p);
    const T = Date.now();
    const runCut = async (s) => {
      const tag = (s.kind === 'clean' ? 'clean cut ' : 'black hole ') + s.secs + ' s: ';
      if (s.kind === 'clean') s.px.cut(); else s.px.black();
      await sleep(s.secs * 1000 - 500);
      const a = await R.dst(s.p);
      if (s.secs >= 10) ok(a.st === 'reconnecting' && a.cur === 'play', tag + 'still in the race, reconnecting (' + a.st + ')');
      if (s.secs >= 40) ok(a.away && a.unoff === true && a.tryBtn && a.seatLS && !R.seat(s.name).left, tag + 'still trying ("vi prøver stadig" + "Prøv nu"), unofficial, the seat kept');
      s.px.up();
      ok(await until(s.p, () => KOS.Lobby.state.sess.state === 'ok' && KOS.Lobby.state.sess.reconnects > 0, null, 16000), tag + 'back by itself (the retry chain)');
      await sleep(2500);
      await backChecks(R, s, ok, tag);
    };
    const runOffline = async (s) => {
      const tag = 'setOffline 25 s: ';
      await s.p.ctx.setOffline(true); s.px.cut();
      await sleep(25000);
      const a = await R.dst(s.p);
      ok(a.st === 'reconnecting' && a.away && a.unoff === true && await s.p.evaluate(() => navigator.onLine === false), tag + 'offline: still trying, unofficial');
      s.px.up();
      await s.p.ctx.setOffline(false);
      const t0 = Date.now();
      ok(await until(s.p, () => KOS.Lobby.state.sess.state === 'ok', null, 16000), tag + 'back online: reconnected (' + (Date.now() - t0) + ' ms)');
      ok(await s.p.evaluate(() => window.__onlineT > 0 && window.__wsT.some(t => t >= window.__onlineT && t - window.__onlineT < 600)), tag + 'the online event tried at once (no waiting for the 10 s step)');
      await sleep(2500);
      await backChecks(R, s, ok, tag);
    };
    const runAndroid = async (s) => {
      const tag = 'Android background: ';
      await setHidden(s.p, true); // timers keep running (no freeze): the socket stays up
      ok(await snapIn(s.p, 'sessionStorage'), tag + 'going to the background writes the snapshot');
      await sleep(25000);
      ok((await R.dst(s.p)).st === 'ok', tag + 'hidden 25 s with timers running: still connected');
      await setHidden(s.p, false);
      s.px.black(); // ... and the network goes down right after the return, for 20 s
      await sleep(20000);
      // the network is back while a resume attempt hangs in the dead network: 'online' must not wait for that attempt to time out
      const n0 = await s.p.evaluate(() => window.__ws);
      await until(s.p, n => window.__ws > n, n0, 15000);
      await sleep(400);
      s.px.up(true);
      const t0 = Date.now();
      await s.p.evaluate(() => window.dispatchEvent(new Event('online')));
      ok(await until(s.p, () => KOS.Lobby.state.sess.state === 'ok' && KOS.Lobby.state.sess.reconnects > 0, null, 16000) && Date.now() - t0 < 2500, tag + 'network back (an attempt hung): reconnected at once (' + (Date.now() - t0) + ' ms)');
      await sleep(2500);
      await backChecks(R, s, ok, tag);
    };
    await Promise.all(R.S.map(s => (s.kind ? runCut(s) : s.name === 'Offline' ? runOffline(s) : runAndroid(s))));
    const left = await R.d.evaluate(() => KOS.App.run.inst.state.raceT);
    ok(R.r().phase === 'racing', 'everybody was back while the race was still on (' + Math.round((Date.now() - T) / 1000) + ' s, race time ' + Math.round(left) + ' s)');
    // the finish: everybody's own screen shows the server's table (official), and every row is a finish
    const all = [R.h].concat(R.S.map(s => s.p));
    const fin = await Promise.all(all.map(p => until(p, () => { const i = KOS.App.run.inst; return !!(i && i.state.liveRes && !i.state.unofficial); }, null, 360000)));
    ok(fin.every(Boolean), 'every phone shows the official result (' + fin.filter(Boolean).length + '/' + fin.length + ')');
    const rows = (R.r() && R.r().results) || [];
    ok(rows.length === 11 && rows.every(x => x.status === 'fin'), 'the official table: all 11 boats finished (' + rows.map(x => x.name + ':' + x.status).join(' ') + ')');
    const errs = all.reduce((a, p) => a.concat(p.errs), []);
    ok(errs.length === 0, 'no page errors (' + errs.slice(0, 2).join(' | ') + ')');
    await R.done();
    await br.close(); await hostBr.close();
  });

  // ---------------------------------------------------------------- clean cut, 20 s: the banner texts and "Prøv nu"
  scen('cut', 'a clean 20 s cut mid race: the banners and "Prøv nu"', async (ok) => {
    const R = await room(true);
    await jumpWatch(R.d);
    R.px.cut();
    await sleep(2500);
    const a = await R.dst();
    ok(a.st === 'reconnecting' && a.net === 'retry' && /Forbinder igen/.test(a.banner) && !a.unoff, '+2 s: reconnecting, "Forbinder igen…", still official (' + JSON.stringify([a.st, a.net, a.banner]) + ')');
    await sleep(14500);
    const b = await R.dst();
    ok(b.st === 'reconnecting' && b.away && b.unoff === true && /vi prøver stadig/.test(b.banner) && b.tryBtn, '+17 s: "Forbindelsen er væk – vi prøver stadig" + "Prøv nu", unofficial (' + b.banner + ')');
    ok(b.seatLS && !R.seat().left, 'the seat stays (localStorage and server)');
    // review round 1: one line, inside the screen, under the pause card and dialogs; on a small phone the short text, under the HUD
    const geo = () => R.d.evaluate(() => { const e = document.querySelector('.race-live-banner'), r = e.getBoundingClientRect(), h = document.querySelector('.hud'), hr = h && h.getBoundingClientRect(), sh = e.querySelector('.nb-short');
      return { h: Math.round(r.height), top: Math.round(r.top), hudB: hr ? Math.round(hr.bottom) : null, z: +getComputedStyle(e).zIndex, short: !!sh, inside: r.left >= 0 && r.right <= innerWidth }; });
    let g = await geo();
    ok(g.h <= 52 && g.z < 40 && g.inside, 'the banner is one line, inside the screen, below the pause card (' + JSON.stringify(g) + ')');
    await R.d.setViewportSize({ width: 320, height: 568 }); await sleep(500);
    g = await geo();
    ok(g.h <= 52 && g.short && g.inside && (g.hudB === null || g.top >= g.hudB), '320x568: the short text on one line, under the HUD (' + JSON.stringify(g) + ')');
    // review round 2: the text that shows is complete (never "Ingen forbindelse – prøv…"), and a coach bubble waits while the banner is up
    const shown = () => R.d.evaluate(() => [...document.querySelectorAll('.race-live-banner span')].filter(e => getComputedStyle(e).display !== 'none').map(e => ({ t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 })));
    let sh = await shown();
    ok(sh.length === 1 && sh[0].t === 'Ingen forbindelse' && !sh[0].cut, '320x568: "Ingen forbindelse" in full next to "Prøv nu" (' + JSON.stringify(sh) + ')');
    await R.d.setViewportSize({ width: 390, height: 844 }); await sleep(400);
    sh = await shown();
    ok(sh.length === 1 && /prøver igen/.test(sh[0].t) && !sh[0].cut, '390x844: the short text in full (' + JSON.stringify(sh) + ')');
    await R.d.evaluate(() => KOS.UI.coach('Test', { ms: 3000 })); await sleep(300);
    ok(await R.d.evaluate(() => getComputedStyle(document.querySelector('.coach')).visibility === 'hidden'), 'a coach bubble does not show on top of / under the banner');
    await R.d.setViewportSize({ width: 900, height: 700 });
    await sleep(3000);
    R.px.up();
    const t0 = Date.now();
    await R.d.click('.race-live-banner [data-net]'); // "Prøv nu": no waiting for the next 10 s step
    const back = await until(R.d, () => KOS.Lobby.state.sess.state === 'ok', null, 4000);
    ok(back, '"Prøv nu" reconnects at once (' + (Date.now() - t0) + ' ms)');
    await sleep(2500);
    await backChecks(R, R.S[0], ok, '');
    ok(R.d.errs.length === 0 && R.h.errs.length === 0, 'no page errors (' + R.d.errs.concat(R.h.errs).slice(0, 2).join(' | ') + ')');
    await R.done();
  });

  // ---------------------------------------------------------------- iOS-like background 45 s
  scen('bg', 'iOS-like background: frozen + hidden 45 s, the network down meanwhile', async (ok) => {
    const R = await room(true);
    await jumpWatch(R.d);
    const cdp = await R.d.context().newCDPSession(R.d);
    await setHidden(R.d, true);
    ok(await snapIn(R.d, 'sessionStorage'), 'going to the background writes the snapshot');
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(1000); R.px.black();
    await sleep(45000);
    R.px.up();
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    const t0 = Date.now();
    await setHidden(R.d, false);
    const back = await until(R.d, () => KOS.Lobby.state.sess.state === 'ok' && KOS.Lobby.state.sess.reconnects > 0, null, 12000);
    ok(back && Date.now() - t0 < 4000, 'back in the foreground: reconnected at once (' + (Date.now() - t0) + ' ms)');
    await sleep(2500);
    await backChecks(R, R.S[0], ok, '');
    await R.done();
  });

  // ---------------------------------------------------------------- reload with 2 penalty turns owed
  // owe 2 penalty turns (autopilot off, so they stay owed), wait for the 2 s snapshot; returns the pose before
  const owe2 = async (p) => {
    await p.evaluate(() => { const i = KOS.App.run.inst; i.setAutopilot(false); i.debug.penAll(); i.debug.penAll(); });
    await until(p, () => { try { const o = JSON.parse(sessionStorage.getItem('kos.mp.snap')); return o && o.pen && o.pen.need > 12; } catch (e) { return false; } }, null, 10000);
    return p.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, leg: i.boat.rc.leg, need: i.boat.rc.pen ? i.boat.rc.pen.need : 0 }; });
  };
  const poseNow = p => p.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, leg: i.boat.rc.leg, need: i.boat.rc.pen ? i.boat.rc.pen.need : 0, how: i.state.restored }; });
  scen('reload', 'reload mid race with 2 penalty turns owed (sessionStorage snapshot)', async (ok) => {
    const R = await room(true);
    const before = await owe2(R.d);
    ok(before.need > 12 && before.need < 13, '2 turns owed before the reload (' + (before.need / (2 * Math.PI)).toFixed(2) + ')');
    await R.d.reload();
    await R.d.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    const inr = await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.state.restored, null, 15000);
    ok(inr, 'after the reload the race comes back by itself, restored');
    const after = await poseNow(R.d);
    ok(after.how === 'snap' || after.how === 'server', 'restored from the newer of the snapshot (pagehide) and the server copy (' + after.how + ')');
    ok(after.need && Math.abs(after.need - before.need) < 1e-6, 'the exact penalty count is restored (' + (after.need / (2 * Math.PI)).toFixed(2) + ' turns)');
    ok(after.leg === before.leg && Math.hypot(after.x - before.x, after.y - before.y) < 40, 'same leg, near the same place (' + Math.round(Math.hypot(after.x - before.x, after.y - before.y)) + ' m)');
    await sleep(1500);
    const hs = await R.hostSees();
    ok(!R.seat().left && !R.seat().lost && hs && !hs.lost, 'the server seat is the same and live, the host sees the boat');
    await R.done();
  });

  // ---------------------------------------------------------------- the app killed: a fresh context from storageState
  scen('kill', 'the app is killed mid race with 2 turns owed; a fresh browser context (storageState) comes back', async (ok) => {
    const R = await room(true);
    const before = await owe2(R.d);
    const st = await R.d.context().storageState();
    await R.d.ctx.close(); // killed: sessionStorage is gone with it
    await sleep(3000);
    const d2 = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#' });
    ok(await d2.waitForSelector('#screen-title .seatbar [data-seat="go"]', { timeout: 8000 }).then(() => true, () => false), 'the title screen shows "Fortsæt live-løbet"');
    await d2.evaluate(() => KOS.App.show('hub'));
    ok(await d2.waitForSelector('#screen-hub .seatbar [data-seat="go"]', { timeout: 8000 }).then(() => true, () => false), 'and so does the hub');
    await d2.click('#screen-hub .seatbar [data-seat="go"]');
    const inr = await until(d2, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.state.restored, null, 15000);
    ok(inr, 'tapping it goes straight back into the race, restored');
    const after = await poseNow(d2);
    ok(after.leg === before.leg && Math.hypot(after.x - before.x, after.y - before.y) < 40, 'same leg, near the same place (' + Math.round(Math.hypot(after.x - before.x, after.y - before.y)) + ' m, ' + after.how + ')');
    ok(after.need && Math.abs(after.need - before.need) < 1e-6, 'the exact penalty count is restored (' + (after.need / (2 * Math.PI)).toFixed(2) + ' turns)');
    await sleep(1500);
    const hs = await R.hostSees();
    ok(hs && !hs.lost && !R.seat().lost, 'the host sees the boat again');
    ok(d2.errs.length === 0, 'no page errors (' + d2.errs.slice(0, 2).join(' | ') + ')');
    await d2.ctx.close();
    await R.done();
  });

  // ---------------------------------------------------------------- "Til kortet" -> hub banner -> back in the race
  scen('quit', '"Til kortet" mid race keeps the seat; the hub banner leads back', async (ok) => {
    const R = await room(true);
    await R.d.evaluate(() => KOS.App.setPaused(true));
    await R.d.waitForSelector('.pause-overlay [data-p="quit"]');
    ok(await R.d.evaluate(() => !!document.querySelector('.pause-overlay [data-p="retire"]') && /forsiden/.test(document.querySelector('.pause-live-note').textContent)), 'the live pause card: "Til kortet", a note that the race goes on, and a separate "Udgå af løbet"');
    const before = await R.d.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, leg: i.boat.rc.leg }; });
    await R.d.click('.pause-overlay [data-p="quit"]');
    await sleep(1200);
    const s1 = R.seat();
    ok(!s1.left && s1.phase === 'racing', '"Til kortet" sent no leave: the server keeps the seat (' + JSON.stringify(s1) + ')');
    ok(await R.d.evaluate(() => !!localStorage.getItem('kos.mp.seat') && KOS.Lobby.state.sess === null), 'the seat record stays, the session is detached');
    await R.d.evaluate(() => KOS.App.show('hub'));
    await R.d.waitForSelector('#screen-hub .seatbar [data-seat="go"]', { timeout: 5000 });
    ok(await R.d.evaluate(c => document.querySelector('#screen-hub .seatbar').textContent.indexOf(c) > 0 && /Fortsæt live-løbet/.test(document.querySelector('#screen-hub .seatbar').textContent), R.code), 'the hub shows "Fortsæt live-løbet" for ' + R.code);
    await R.d.evaluate(() => KOS.App.show('title'));
    ok(await R.d.waitForSelector('#screen-title .seatbar [data-seat="go"]', { timeout: 5000 }).then(() => true, () => false), 'and so does the title screen');
    await sleep(3000);
    await R.d.click('#screen-title .seatbar [data-seat="go"]');
    const inr = await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.state.restored, null, 15000);
    ok(inr, 'tapping it goes straight back into the race');
    const after = await R.d.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, leg: i.boat.rc.leg }; });
    ok(after.leg === before.leg && Math.hypot(after.x - before.x, after.y - before.y) < 40, 'the boat is where it was left (' + Math.round(Math.hypot(after.x - before.x, after.y - before.y)) + ' m, leg ' + after.leg + ')');
    await sleep(1500);
    const hs = await R.hostSees();
    ok(hs && !hs.lost && !R.seat().lost, 'the host sees the boat again');
    // "Udgå af løbet" from the pause card: asked first, then leave
    await R.d.evaluate(() => KOS.App.setPaused(true));
    await R.d.click('.pause-overlay [data-p="retire"]');
    await R.d.waitForSelector('.dialog.live-retire .btn-danger');
    await R.d.click('.dialog.live-retire .btn-danger');
    await sleep(1200);
    ok(R.seat().left || R.seat().gone || R.seat().status === 'dnf' || R.seat().status === 'ret', '"Udgå af løbet" (confirmed) sends leave (' + JSON.stringify(R.seat()) + ')');
    ok(await R.d.evaluate(() => KOS.App.cur !== 'play' && !localStorage.getItem('kos.mp.seat')), 'the seat record is gone and no banner is left to offer');
    ok(R.d.errs.length === 0, 'no page errors (' + R.d.errs.slice(0, 2).join(' | ') + ')');
    await R.done();
  });

  // ---------------------------------------------------------------- 4409: a second window takes the seat
  scen('replaced', 'a second window resumes the seat: the first one gets 4409 and lets go', async (ok) => {
    const R = await room(true);
    const st = await R.d.context().storageState();
    const d2 = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#' });
    await d2.waitForSelector('#screen-title .seatbar [data-seat="go"]', { timeout: 8000 });
    await d2.click('#screen-title .seatbar [data-seat="go"]');
    ok(await until(d2, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 15000), 'the second window is in the race');
    const gave = await until(R.d, () => KOS.App.run.inst && KOS.App.run.inst.state.netMode === 'replaced', null, 8000);
    ok(gave, 'the first window shows "Løbet er åbent i et andet vindue"');
    const n0 = await R.d.evaluate(() => window.__ws);
    await sleep(6000);
    ok(await R.d.evaluate(n => { const i = KOS.App.run.inst; return i.live.unofficial && /andet vindue/.test(document.querySelector('.race-live-banner').textContent) && window.__ws === n; }, n0) && await d2.evaluate(() => KOS.Lobby.state.sess.state === 'ok'), 'it does not steal the seat back (no new socket; the second window stays connected)');
    await d2.ctx.close();
    await R.done();
  });

  // ---------------------------------------------------------------- lobby half-open
  scen('lobby', 'the lobby socket goes half-open; the host starts meanwhile', async (ok) => {
    const R = await room(false);
    R.px.black();
    await sleep(2000);
    await act(R.h, 'start'); await inRace(R.h);
    await sleep(5000); R.px.up(true); // the dead socket stays dead: only the watchdog can notice
    const got = await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 25000);
    ok(got, 'the 8 s lobby watchdog + resume put the sailor into the race');
    ok(!R.seat().lost, 'the seat is live on the server');
    await R.done();
  });

  // ---------------------------------------------------------------- the race ended while away
  scen('ended', 'the race ended while away', async (ok) => {
    const R = await room(true, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    const E = R.by('Erik');
    E.px.black(); // Erik is off the network when the race ends
    await R.d.evaluate(() => KOS.App.setPaused(true));
    await R.d.click('.pause-overlay [data-p="quit"]'); // Dorte went to the map
    await sleep(800);
    await R.h.evaluate(() => KOS.App.run.inst.live && KOS.App.run.host.live.hostEnd());
    await R.h.waitForFunction(() => KOS.App.run.inst && KOS.App.run.inst.state.liveRes, null, { timeout: 10000 }).catch(() => {});
    ok(R.r() && R.r().phase === 'results', 'the host ended the race (results)');
    // off the network: when it comes back, the race screen gets the official table
    await sleep(3000);
    E.px.up();
    ok(await until(E.p, () => { const i = KOS.App.run.inst; return !!(i && i.state.liveRes && i.state.liveRes.length === 3 && !i.state.unofficial); }, null, 16000), 'back on the network: the race screen shows the official table');
    // after "Til kortet": the banner's late resume shows the official table
    await R.d.evaluate(() => KOS.App.show('hub'));
    await R.d.waitForSelector('#screen-hub .seatbar [data-seat="go"]');
    await R.d.click('#screen-hub .seatbar [data-seat="go"]');
    await waitView(R.d, 'results', 12000).catch(() => {});
    ok(await R.d.evaluate(() => document.getElementById('screen-live').getAttribute('data-live-view') === 'results' && document.querySelectorAll('.live-results li').length === 3), 'a late resume shows the official table');
    ok(await R.d.evaluate(c => { const o = JSON.parse(localStorage.getItem('kos.mp.lastResult')); return o && o.code === c && o.rows.length === 3 && !localStorage.getItem('kos.mp.seat'); }, R.code), 'kos.mp.lastResult keeps the table, the seat is cleared');
    // the room is gone and the server has nothing: the stored result is shown; with nothing stored, "Løbet er slut"
    const fake = await R.d.evaluate(() => { const s = { code: 'KKKK', id: 3, key: 'nokey1234', url: KOS.MPStatus.resolve().wsUrl, exp: Date.now() + 3600000, phase: 'racing', startedAt: 1 }; localStorage.setItem('kos.mp.seat', JSON.stringify(s)); sessionStorage.removeItem('kos.mp.rejoin'); return s; });
    await R.d.evaluate(() => KOS.App.show('title'));
    await R.d.waitForSelector('#screen-title .seatbar [data-seat="go"]');
    await R.d.click('#screen-title .seatbar [data-seat="go"]');
    await waitView(R.d, 'msg', 12000).catch(() => {});
    ok(await R.d.evaluate(() => /Løbet er slut – vi kunne ikke hente resultatet/.test(document.getElementById('screen-live').textContent) && !localStorage.getItem('kos.mp.seat')), 'a race nobody has: "Løbet er slut – vi kunne ikke hente resultatet", the seat cleared');
    await R.d.evaluate(f => { localStorage.setItem('kos.mp.seat', JSON.stringify(f)); localStorage.setItem('kos.mp.lastResult', JSON.stringify({ code: f.code, rows: [{ id: 3, name: 'Dorte', place: 1, ms: 61000 }], myId: 3, at: Date.now() })); KOS.App.show('title'); }, fake);
    await R.d.waitForSelector('#screen-title .seatbar [data-seat="go"]');
    await R.d.click('#screen-title .seatbar [data-seat="go"]');
    await waitView(R.d, 'results', 12000).catch(() => {});
    ok(await R.d.evaluate(() => /Dorte/.test(document.querySelector('.live-results').textContent)), 'with a stored result for that race, the stored table is shown');
    await R.done();
  });

  // ---------------------------------------------------------------- review round 1: the finish, the lobby, the podium, the way back
  const srvUntil = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(200); } return !!fn(); };
  scen('finfail', 'the network drops 200 ms before the finish (clean cut and black hole); back after 5 s', async (ok) => {
    const R = await room(true, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    await R.d.waitForFunction(() => KOS.App.run.inst.state.clock > 6, null, { timeout: 20000 });
    const D = R.by('Dorte'), E = R.by('Erik');
    D.px.cut(); E.px.black();
    await sleep(200);
    for (const x of [D, E]) await x.p.evaluate(() => KOS.App.run.inst.debug.finishNow());
    await sleep(5000);
    D.px.up(); E.px.up(true); // Erik's dead socket stays dead: only the watchdog notices
    ok(await srvUntil(() => R.seat('Dorte').status === 'fin', 15000), 'clean cut at the finish: the server has Dorte as finished (' + JSON.stringify(R.seat('Dorte')) + ')');
    ok(await srvUntil(() => R.seat('Erik').status === 'fin', 15000), 'black hole at the finish: the server has Erik as finished (' + JSON.stringify(R.seat('Erik')) + ')');
    await R.h.evaluate(() => KOS.App.run.host.live.hostEnd());
    ok(await srvUntil(() => R.r() && R.r().phase === 'results' && R.r().results.filter(x => x.status === 'fin').length >= 2, 8000), 'the official table has both as finished, not DNF');
    await R.done();
  });
  scen('lobbyseat', 'the lobby seat is gone while the phone is away; the lobby is still open', async (ok) => {
    const R = await room(false);
    R.px.cut();
    await sleep(1500);
    R.r().players.delete(R.S[0].id); // as after a long drop or a server restart: the room lives, the seat does not
    await sleep(1500);
    R.px.up();
    ok(await until(R.d, () => { const L = KOS.Lobby.state; return L.view === 'room' && L.sess && L.sess.state === 'ok'; }, null, 15000), 'the resume joined the open lobby again (view: room)');
    ok(await R.d.evaluate(() => !/Løbet er slut/.test(document.getElementById('screen-live').textContent) && !!localStorage.getItem('kos.mp.seat')), 'no "Løbet er slut", the seat record is back');
    ok([...R.r().players.values()].some(p => p.name === 'Dorte' && !p.lost), 'the server has Dorte in the lobby');
    await act(R.h, 'start');
    ok(await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 20000), 'the host starts: Dorte is in the race');
    // the race started without the seat: a true message, not "Løbet er slut"
    const R2 = await room(false, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    const D2 = R2.by('Dorte');
    D2.px.cut(); await sleep(1000);
    R2.r().players.delete(D2.id);
    await act(R2.h, 'start'); await inRace(R2.h);
    await sleep(1000); D2.px.up();
    ok(await until(D2.p, () => { const e = document.getElementById('screen-live'); return e && !e.hidden && /startet uden dig/.test(e.textContent); }, null, 15000), 'dropped from the lobby, the race started: "… løbet er startet uden dig"');
    await R2.done();
    await R.done();
  });
  scen('rescut', 'a 3 s drop on the podium while the host starts a rematch', async (ok) => {
    const R = await room(true, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    await R.h.evaluate(() => KOS.App.run.host.live.hostEnd());
    ok(await until(R.d, () => { const i = KOS.App.run.inst; return !!(i && i.state.liveRes); }, null, 10000), 'Dorte sees the result');
    const E = R.by('Erik'); // a reload on the podium: the official table again (the tab's token lives through the results)
    await until(E.p, () => { const i = KOS.App.run.inst; return !!(i && i.state.liveRes); }, null, 10000);
    await E.p.reload(); await E.p.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    ok(await until(E.p, () => { const e = document.getElementById('screen-live'); return e && !e.hidden && e.getAttribute('data-live-view') === 'results' && document.querySelectorAll('.live-results li').length === 3; }, null, 15000), 'a reload on the podium shows the official table again');
    ok(await E.p.evaluate(() => !localStorage.getItem('kos.mp.seat') && !document.querySelector('.seatbar')), 'and no "Fortsæt live-løbet" for a race whose result is in');
    R.px.cut();
    await sleep(800);
    await R.h.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 10000 }).catch(() => {});
    await R.h.evaluate(() => KOS.Lobby.rematch()); // the host's "Ny kapsejlads med samme deltagere" on the results card
    await sleep(2200);
    R.px.up();
    ok(await until(R.d, () => { const L = KOS.Lobby.state; return KOS.App.cur === 'live' && L.view === 'room' && L.sess && L.sess.state === 'ok'; }, null, 15000), 'Dorte lands in the new lobby');
    ok(R.r().phase === 'lobby' && ['Vaert', 'Dorte', 'Erik'].every(n => [...R.r().players.values()].some(p => p.name === n && !p.lost)), 'the server lobby has Dorte (and the host and Erik)');
    ok(await R.d.evaluate(() => !document.querySelector('.seatbar')), 'no stale banner');
    await R.done();
  });
  // ---------------------------------------------------------------- review round 2
  scen('finoff', 'finishing after 17 s offline: the unofficial result screen, then the network comes back', async (ok) => {
    const R = await room(true, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    R.px.cut();
    await sleep(17000);
    await R.d.evaluate(() => KOS.App.run.inst.debug.finishNow());
    ok(await until(R.d, () => KOS.App.cur === 'results', null, 15000), 'the unofficial result screen comes up by itself');
    ok(await R.d.evaluate(() => { const s = KOS.Lobby.state.sess; return !!s && s.state !== 'closed' && s.finPending != null; }), 'the session is kept with the finish to send (not detached)');
    R.px.up();
    ok(await srvUntil(() => R.seat('Dorte').status === 'fin', 25000), 'the network is back: the server has Dorte as finished (' + JSON.stringify(R.seat('Dorte')) + ')');
    ok(await until(R.d, () => { const s = KOS.Lobby.state.sess; return !s || s.state === 'closed'; }, null, 8000), 'then the session lets go by itself');
    await R.h.evaluate(() => KOS.App.run.host.live.hostEnd());
    ok(await srvUntil(() => R.r() && R.r().phase === 'results' && (R.r().results.find(x => x.name === 'Dorte') || {}).status === 'fin', 8000), 'the official table has Dorte as finished, not lost');
    ok(R.d.errs.length === 0, 'no page errors (' + R.d.errs.slice(0, 2).join(' | ') + ')');
    await R.done();
  });
  scen('abortdrop', 'a 3 s drop while the host aborts the race; then the host starts again', async (ok) => {
    const R = await room(true, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    R.px.cut();
    await sleep(500);
    await R.h.evaluate(() => KOS.App.run.host.live.hostAbort());
    await sleep(2500);
    R.px.up();
    ok(await until(R.d, () => { const L = KOS.Lobby.state; return KOS.App.cur === 'live' && L.view === 'room' && L.sess && L.sess.state === 'ok' && L.sess.phase === 'lobby'; }, null, 15000),
      'Dorte leaves the aborted race screen for the lobby (' + JSON.stringify(await R.dst()) + ')');
    await R.h.waitForFunction(() => KOS.App.cur === 'live' && KOS.Lobby.state.view === 'room', null, { timeout: 10000 }).catch(() => {});
    await act(R.h, 'start');
    ok(await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 20000), 'the host starts again: Dorte is in the new race');
    await sleep(3000);
    ok(await R.d.evaluate(() => { const s = KOS.Lobby.state.sess; return !!s && s.state === 'ok' && (s.phase === 'countdown' || s.phase === 'racing'); }), 'with a live session (the old race screen did not close it)');
    ok(!R.seat('Dorte').lost && (R.seat('Dorte').phase === 'countdown' || R.seat('Dorte').phase === 'racing'), 'the server seat is live in the new race (' + JSON.stringify(R.seat('Dorte')) + ')');
    ok(R.d.errs.length === 0, 'no page errors (' + R.d.errs.slice(0, 2).join(' | ') + ')');
    await R.done();
  });
  scen('ghost', 'a 25 s drop while the host ends the race and starts a rematch', async (ok) => {
    const R = await room(true, { sailors: [{ name: 'Dorte' }, { name: 'Erik' }] });
    R.px.cut();
    await sleep(800);
    await R.h.evaluate(() => KOS.App.run.host.live.hostEnd());
    await R.h.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 10000 }).catch(() => {});
    await sleep(22000); // longer than the lobby grace: the rematch leaves the dropped seat behind
    await R.h.evaluate(() => KOS.Lobby.rematch());
    await sleep(1500);
    R.px.up();
    ok(await until(R.d, () => { const L = KOS.Lobby.state; return KOS.App.cur === 'live' && L.view === 'results' && document.querySelectorAll('.live-results li').length === 3; }, null, 20000),
      'Dorte sees the table of the race that ended while she was away (' + JSON.stringify(await R.d.evaluate(() => ({ view: KOS.Lobby.state.view, res: KOS.Lobby.state.results, lr: localStorage.getItem('kos.mp.lastResult'), ph: KOS.Lobby.state.sess && KOS.Lobby.state.sess.phase }))) + ')');
    ok(await R.d.evaluate(() => { const me = document.querySelector('.live-results li.is-me'); return !!me && /Dorte/.test(me.textContent); }), 'her own row is marked');
    await act(R.d, 'toroom');
    ok(await until(R.d, () => { const L = KOS.Lobby.state; return L.view === 'room' && L.sess && L.sess.state === 'ok' && L.sess.phase === 'lobby'; }, null, 8000), 'OK: the new lobby, with a live session');
    ok([...R.r().players.values()].some(p => p.name === 'Dorte' && !p.lost), 'the server lobby has Dorte');
    await act(R.h, 'start');
    ok(await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live && KOS.Lobby.state.sess && KOS.Lobby.state.sess.state === 'ok', null, 20000), 'and she is in the next race');
    ok(R.d.errs.length === 0, 'no page errors (' + R.d.errs.slice(0, 2).join(' | ') + ')');
    await R.done();
  });
  scen('entry', '"Til kortet" -> hub; the Live entry view and the same code lead back into the race', async (ok) => {
    const R = await room(true);
    const quit = async () => { await R.d.evaluate(() => KOS.App.setPaused(true)); await R.d.waitForSelector('.pause-overlay [data-p="quit"]'); await R.d.click('.pause-overlay [data-p="quit"]'); };
    await quit();
    ok(await until(R.d, () => KOS.App.cur === 'hub' && !!document.querySelector('#screen-hub .seatbar [data-seat="go"]'), null, 6000), '"Til kortet" from a live race lands on the hub with "Fortsæt live-løbet"');
    await R.d.evaluate(() => KOS.App.show('area', { area: 'race' }));
    await R.d.waitForSelector('.live-card'); await R.d.click('.live-card'); await waitView(R.d, 'entry');
    ok(await R.d.evaluate(c => { const b = document.querySelector('#screen-live [data-act="resumeseat"]'); return !!b && b === document.querySelector('#screen-live .live-big-btns > button') && b.textContent.indexOf(c) > 0; }, R.code), 'the Live entry view offers "Fortsæt live-løbet" first');
    await act(R.d, 'resumeseat');
    ok(await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 15000), 'tapping it: back in the race');
    await sleep(1500);
    await quit();
    await R.d.waitForFunction(() => KOS.App.cur === 'hub');
    await R.d.evaluate(() => KOS.App.show('area', { area: 'race' }));
    await R.d.waitForSelector('.live-card'); await R.d.click('.live-card'); await waitView(R.d, 'entry');
    await act(R.d, 'joinview'); await waitView(R.d, 'join');
    await R.d.fill('#live-code', R.code); await act(R.d, 'join');
    ok(await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 15000), 'typing the same code resumes the seat (not "Løbet er allerede startet")');
    ok(!R.seat().left && R.seat().phase === 'racing', 'the same seat on the server');
    await R.done();
  });

  // ---------------------------------------------------------------- the banner itself: offline, "Ikke nu", "Udgå", on screen
  scen('banner', 'the banner: no network needed to show it, "Ikke nu", "Udgå", #join with another race', async (ok) => {
    const R = await room(true);
    const st = await R.d.context().storageState();
    await R.d.ctx.close();
    // the server is unreachable: the banner still shows (it only reads localStorage), and nothing opened a WebSocket
    R.px.cut();
    const off = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#' });
    ok(await off.waitForSelector('#screen-title .seatbar', { timeout: 8000 }).then(() => true, () => false), 'the title banner shows with the server unreachable');
    ok(await off.evaluate(() => window.__ws === 0 && !window.KOS.MP), 'showing it opened no WebSocket and loaded no live script');
    await off.click('#screen-title .seatbar [data-seat="go"]');
    await waitView(off, 'msg', 12000).catch(() => {});
    ok(await off.evaluate(() => /vi prøver stadig/.test(document.getElementById('screen-live').textContent) && !!document.querySelector('#screen-live [data-act="trynow"]')), 'tapped offline: "Forbindelsen er væk – vi prøver stadig" + "Prøv nu"');
    R.px.up();
    await off.click('#screen-live [data-act="trynow"]');
    ok(await until(off, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 15000), 'network back + "Prøv nu": straight into the race');
    await off.ctx.close();
    // "Ikke nu" hides it for this visit only
    const p2 = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#' });
    await p2.waitForSelector('#screen-title .seatbar');
    await p2.click('#screen-title .seatbar [data-seat="later"]');
    await p2.evaluate(() => { KOS.App.show('hub'); });
    await sleep(600);
    ok(await p2.evaluate(() => !document.querySelector('.seatbar') && !!localStorage.getItem('kos.mp.seat')), '"Ikke nu": gone for this visit (hub too), the seat kept');
    await p2.reload(); await p2.waitForFunction(() => window.KOS && KOS.modesReady);
    ok(await p2.waitForSelector('#screen-title .seatbar', { timeout: 5000 }).then(() => true, () => false), 'the next visit shows it again');
    // a #join link to another race: a choice, not a silent switch
    await p2.goto(p2.url().split('#')[0] + '#join=KKKK&mp=' + encodeURIComponent(R.WSp) + '&mpstatus=x');
    await p2.reload(); await p2.waitForFunction(() => window.KOS && KOS.modesReady);
    ok(await p2.waitForSelector('.dialog.live-seat-choice', { timeout: 6000 }).then(() => true, () => false), 'a #join for another race while seated: the player chooses');
    await p2.ctx.close();
    // title + hub, phone and laptop: on screen and nothing on top of it (screenshots with SHOTS=)
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const p = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#', viewport: vp });
      await p.waitForSelector('#screen-title .seatbar'); await sleep(1200);
      const vis = sel => p.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width * 0.3, r.top + r.height / 2); return r.width > 200 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!top && e.contains(top); }, sel);
      ok(await vis('#screen-title .seatbar-go'), vp.width + 'x' + vp.height + ': the title banner is fully on screen, nothing covers it');
      if (SHOTS) await p.screenshot({ path: SHOTS + 'seatbar-title-' + vp.width + '.png' });
      await p.evaluate(() => KOS.App.show('hub'));
      await p.waitForSelector('#screen-hub .seatbar'); await sleep(1500);
      ok(await vis('#screen-hub .seatbar-go'), vp.width + 'x' + vp.height + ': the hub banner is fully on screen, nothing covers it (no coach tip)');
      if (SHOTS) await p.screenshot({ path: SHOTS + 'seatbar-hub-' + vp.width + '.png' });
      await p.ctx.close();
    }
    // "Udgå" on the banner: asked first, then leave; the seat is forgotten
    const p3 = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#' });
    await p3.waitForSelector('#screen-title .seatbar');
    await p3.click('#screen-title .seatbar [data-seat="retire"]');
    await p3.waitForSelector('.dialog.live-seat-retire .btn-danger');
    await p3.click('.dialog.live-seat-retire .btn-danger');
    ok(await until(p3, () => !localStorage.getItem('kos.mp.seat') && !document.querySelector('.seatbar'), null, 8000), '"Udgå": the seat record and the banner are gone');
    await sleep(500);
    ok(R.seat().left || R.seat().gone, 'and the server got the leave (' + JSON.stringify(R.seat()) + ')');
    await p3.ctx.close();
    await R.done();
  });

  // ================================================================ run them side by side
  // The matrix (eleven pages, its own browser) starts first; the others follow once its short cuts are done, LANES at a time. More at once
  // starves the renderers (a socket reset then goes unnoticed for seconds) and the timing checks would test the machine, not the game.
  const runOne = async (s) => {
    const lines = [], t0 = Date.now();
    const ok = (c, msg) => { checks++; if (!c) fails++; lines.push((c ? '  ok   ' : '  FAIL ') + msg); };
    try { await s.fn(ok); } catch (e) { fails++; checks++; lines.push('  FAIL the scenario threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e)); }
    console.log('-- ' + s.name + ': ' + s.title + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)\n' + lines.join('\n'));
  };
  const LANES = 3;
  const todo = SCEN.filter(s => want(s.name));
  const mx = todo.find(s => s.name === 'matrix'), rest = todo.filter(s => s !== mx);
  const lanes = async () => { if (mx) await sleep(60000); await Promise.all(Array.from({ length: LANES }, async () => { while (rest.length) await runOne(rest.shift()); })); };
  await Promise.all([mx ? runOne(mx) : null, lanes()]);

  await browser.close(); await srv.close(); web.close && web.close();
  console.log('\n' + (checks - fails) + '/' + checks + ' checks passed (' + Math.round((Date.now() - T_START) / 1000) + ' s)');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
