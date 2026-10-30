// KØS SEJL — live race reconnect and resume (suite 'livereconnect', docs/superpowers/specs/2026-10-30-live-rules-and-race-list-design.md
// part E). Headless Chrome; the sailor's socket goes through a local TCP proxy that can cut cleanly (RST/FIN) or black-hole (half-open:
// nothing passes, nothing is closed), so the real browser WebSocket sees what a phone sees.
//   1. a clean 20 s cut mid race: "Forbinder igen…", after 15 s "vi prøver stadig" + "Prøv nu" and unofficial; back = same race instance,
//      no teleport, official again, the host sees the boat again
//   2. a half-open 40 s black hole: the watchdog notices, retries never stop, back in the same instance
//   3. iOS-like background: page frozen (CDP lifecycle) + hidden for 45 s with the network gone; back = an immediate retry
//   4. reload mid race with 2 penalty turns owed: the sessionStorage snapshot puts the boat back with the exact turns
//   5. "Til kortet" mid race: the seat is kept (no leave), the hub banner "Fortsæt live-løbet" leads straight back into the race
//   6. a second window resumes the seat: the first gets 4409, says "åbent i et andet vindue" and does not steal it back
//   7. the lobby half-open: the 8 s lobby watchdog gets the sailor into the race that started meanwhile
//   8. the race ended while away: the banner shows the official table (late resume) or the stored result / "Løbet er slut"
//   9. "Udgå" on the banner and "Udgå af løbet" in the race send leave; the banner shows offline and without a WebSocket
// Screenshots of the banner (title + hub, 390x844 and 1280x800): SHOTS=dir/ node tools/test-live-reconnect.js
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
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const want = n => !ONLY.length || ONLY.includes(n);

// a TCP proxy in front of the race server: cut() = connections reset and new ones refused; black() = everything silently dropped
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
    up() { mode = 'up'; for (const o of conns) if (o.dead) { o.c.destroy(); o.u && o.u.destroy(); conns.delete(o); } },
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
  // a short server heartbeat: a half-open socket is cut after 6 s instead of 25 s (the client must cope either way)
  const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_PING_MS: '2000', KOS_DEAD_MS: '6000' });
  const port = await srv.listen();
  const SHOTS = process.env.SHOTS || '';

  async function newPage(WS, name, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 900, height: 700 }, serviceWorkers: 'block', storageState: opts.storage });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push(e.message));
    await page.route('**/mp-status.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'on', message: '', maxRooms: 20, maxPlayers: 12 }) }));
    await page.addInitScript(n => {
      window.__ws = 0; const W = window.WebSocket;
      window.WebSocket = function (u, p) { window.__ws++; return new W(u, p); }; window.WebSocket.prototype = W.prototype;
      Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
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
  // per frame: the biggest jump of my own boat (a teleport shows up as one big step)
  const jumpWatch = p => p.evaluate(() => {
    window.__inst = KOS.App.run.inst; window.__jump = 0; let last = null;
    const f = () => { const i = KOS.App.run.inst; if (i && i === window.__inst && i.boat) { const b = i.boat; if (last) window.__jump = Math.max(window.__jump, Math.hypot(b.x - last.x, b.y - last.y)); last = { x: b.x, y: b.y }; } if (!window.__stopJ) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });

  async function room(start, opts) {
    opts = opts || {};
    const px = await proxy(port);
    const WSd = 'ws://127.0.0.1:' + port + '/ws', WSp = 'ws://127.0.0.1:' + px.port + '/ws';
    const h = await newPage(WSd, 'Vaert');
    await h.waitForSelector('.live-card'); await h.click('.live-card'); await waitView(h, 'entry'); await act(h, 'host'); await waitView(h, 'setup');
    await h.evaluate(c => Object.assign(KOS.Lobby.state.cfg, { boat: 'ilca', laps: 3, windKn: 12, windDeg: 225, countdownS: 8, help: 'free', finishS: 0 }, c || {}), opts.cfg);
    await act(h, 'create'); await waitView(h, 'room');
    const code = await h.evaluate(() => document.getElementById('live-code-show').textContent);
    const d = await newPage(WSp, 'Dorte', { viewport: opts.viewport });
    await d.waitForSelector('.live-card'); await d.click('.live-card'); await waitView(d, 'entry'); await act(d, 'joinview'); await waitView(d, 'join');
    await d.fill('#live-code', code); await act(d, 'join'); await waitView(d, 'room');
    const R = { h, d, px, code, WSp, r: () => srv.rooms.rooms.get(code) };
    R.seat = () => { const r = R.r(); const p = r && [...r.players.values()].find(x => x.name === 'Dorte'); return p ? { phase: r.phase, lost: !!p.lost, left: !!p.left, status: p.status || null } : { phase: r && r.phase, gone: true }; };
    R.dst = (p) => (p || d).evaluate(() => {
      const s = KOS.Lobby.state.sess, i = KOS.App.run && KOS.App.run.inst, st = i && i.state;
      return { cur: KOS.App.cur, st: s && s.state, away: !!(s && s.away), rc: s && s.reconnects, unoff: i && i.live ? i.live.unofficial : null, net: st ? st.netMode : null,
        banner: (document.querySelector('.race-live-banner:not([hidden])') || {}).textContent || '', tryBtn: !!document.querySelector('.race-live-banner [data-net]'),
        x: i && i.boat ? i.boat.x : null, y: i && i.boat ? i.boat.y : null, leg: i && i.boat && i.boat.rc ? i.boat.rc.leg : null, seatLS: !!localStorage.getItem('kos.mp.seat') };
    });
    R.hostSees = () => h.evaluate(() => { const b = KOS.App.run.inst && KOS.App.run.inst.live && KOS.App.run.inst.live.remotes[0]; return b ? { lost: !!b.lost, x: b.x, y: b.y } : null; });
    R.done = async () => { await h.ctx.close().catch(() => {}); await d.ctx.close().catch(() => {}); px.close(); };
    if (start) {
      await act(h, 'start'); await inRace(h); await inRace(d); await bot(h); await bot(d);
      await d.waitForFunction(() => KOS.App.run.inst.state.clock > 3, null, { timeout: 20000 });
    }
    return R;
  }
  const same = R => R.d.evaluate(() => KOS.App.run.inst === window.__inst);
  const until = async (p, fn, arg, ms) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };

  // ---------------------------------------------------------------- 1. clean cut, 20 s
  if (want('cut')) {
    console.log('-- 1. a clean 20 s cut mid race');
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
    await sleep(3000);
    R.px.up();
    const t0 = Date.now();
    await R.d.click('.race-live-banner [data-net]'); // "Prøv nu": no waiting for the next 10 s step
    const back = await until(R.d, () => KOS.Lobby.state.sess.state === 'ok', null, 4000);
    ok(back, '"Prøv nu" reconnects at once (' + (Date.now() - t0) + ' ms)');
    await sleep(2500);
    const c = await R.dst();
    ok(await same(R) && c.unoff === false && !c.banner && c.cur === 'play', 'back in the same race instance, official again, banner gone');
    const jump = await R.d.evaluate(() => window.__jump);
    ok(jump < 3, 'no teleport: the biggest step of my own boat was ' + jump.toFixed(2) + ' m');
    const hs = await R.hostSees();
    ok(hs && !hs.lost && Math.hypot(hs.x - c.x, hs.y - c.y) < 25, 'the host sees the boat again, near where it is (' + (hs ? Math.round(Math.hypot(hs.x - c.x, hs.y - c.y)) : '-') + ' m)');
    ok(!R.seat().lost && R.seat().phase === 'racing', 'the server seat is back (not lost)');
    ok(R.d.errs.length === 0 && R.h.errs.length === 0, 'no page errors (' + R.d.errs.concat(R.h.errs).slice(0, 2).join(' | ') + ')');
    await R.done();
  }

  // ---------------------------------------------------------------- 2. half-open, 40 s
  if (want('black')) {
    console.log('-- 2. a half-open (black-holed) socket for 40 s');
    const R = await room(true);
    await jumpWatch(R.d);
    R.px.black();
    await sleep(4000);
    ok((await R.dst()).st === 'reconnecting', 'the 2.5 s watchdog notices the silent socket');
    await sleep(36000);
    const a = await R.dst();
    ok(a.st === 'reconnecting' && a.unoff === true && a.tryBtn, 'after 40 s it is still trying (never a final offline)');
    R.px.up();
    const back = await until(R.d, () => KOS.Lobby.state.sess.state === 'ok', null, 16000);
    ok(back, 'the network is back: the retry chain (every 10 s) gets back in');
    await sleep(2500);
    const c = await R.dst();
    ok(await same(R) && c.unoff === false && (await R.d.evaluate(() => window.__jump)) < 3, 'same instance, official, no teleport');
    const hs = await R.hostSees();
    ok(hs && !hs.lost, 'the host sees the boat again');
    await R.done();
  }

  // ---------------------------------------------------------------- 3. background 45 s
  if (want('bg')) {
    console.log('-- 3. iOS-like background: frozen + hidden 45 s, the network down meanwhile');
    const R = await room(true);
    await jumpWatch(R.d);
    const cdp = await R.d.context().newCDPSession(R.d);
    await R.d.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hid }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hid ? 'hidden' : 'visible') }); window.__hid = true; document.dispatchEvent(new Event('visibilitychange')); });
    ok(await R.d.evaluate(() => { try { const s = JSON.parse(sessionStorage.getItem('kos.mp.snap')); return !!s && s.code === KOS.Lobby.state.sess.code; } catch (e) { return false; } }), 'going to the background writes the snapshot');
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(1000); R.px.black();
    await sleep(45000);
    R.px.up();
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    const t0 = Date.now();
    await R.d.evaluate(() => { window.__hid = false; document.dispatchEvent(new Event('visibilitychange')); });
    const back = await until(R.d, () => KOS.Lobby.state.sess.state === 'ok' && KOS.Lobby.state.sess.reconnects > 0, null, 12000);
    ok(back, 'back in the foreground: reconnected (' + (Date.now() - t0) + ' ms)');
    await sleep(2000);
    const c = await R.dst();
    ok(await same(R) && c.unoff === false && c.cur === 'play', 'same race instance, official');
    const hs = await R.hostSees();
    ok(hs && !hs.lost, 'the host sees the boat again');
    await R.done();
  }

  // ---------------------------------------------------------------- 4. reload with 2 penalty turns owed
  if (want('reload')) {
    console.log('-- 4. reload mid race with 2 penalty turns owed (sessionStorage snapshot)');
    const R = await room(true);
    await R.d.evaluate(() => { const i = KOS.App.run.inst; i.setAutopilot(false); i.debug.penAll(); i.debug.penAll(); });
    await sleep(2600); // the 2 s snapshot
    const before = await R.d.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, leg: i.boat.rc.leg, need: i.state.pen && i.state.pen.need, acc: i.state.pen && i.state.pen.acc }; });
    ok(before.need > 12 && before.need < 13, '2 turns owed before the reload (' + (before.need / (2 * Math.PI)).toFixed(2) + ')');
    await R.d.reload();
    await R.d.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    const inr = await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.state.restored, null, 15000);
    ok(inr, 'after the reload the race comes back by itself, restored');
    const after = await R.d.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, leg: i.boat.rc.leg, need: i.state.pen && i.state.pen.need, acc: i.state.pen && i.state.pen.acc, how: i.state.restored }; });
    ok(after.how === 'snap', 'the snapshot was newer than the server copy and won (' + after.how + ')');
    ok(after.need && Math.abs(after.need - before.need) < 1e-6, 'the exact penalty count is restored (' + (after.need / (2 * Math.PI)).toFixed(2) + ' turns)');
    ok(after.leg === before.leg && Math.hypot(after.x - before.x, after.y - before.y) < 40, 'same leg, near the same place (' + Math.round(Math.hypot(after.x - before.x, after.y - before.y)) + ' m)');
    ok(!R.seat().left && !R.seat().lost, 'the server seat is the same and live');
    await R.done();
  }

  // ---------------------------------------------------------------- 5. "Til kortet" -> hub banner -> back in the race
  if (want('quit')) {
    console.log('-- 5. "Til kortet" mid race keeps the seat; the hub banner leads back');
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
  }

  // ---------------------------------------------------------------- 6. 4409: a second window takes the seat
  if (want('replaced')) {
    console.log('-- 6. a second window resumes the seat: the first one gets 4409 and lets go');
    const R = await room(true);
    const st = await R.d.context().storageState();
    const d2 = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#' });
    await d2.waitForSelector('#screen-title .seatbar [data-seat="go"]', { timeout: 8000 });
    await d2.click('#screen-title .seatbar [data-seat="go"]');
    ok(await until(d2, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 15000), 'the second window is in the race');
    const gave = await until(R.d, () => KOS.App.run.inst && KOS.App.run.inst.state.netMode === 'replaced', null, 8000);
    ok(gave, 'the first window shows "Løbet er åbent i et andet vindue"');
    await sleep(6000);
    ok(await R.d.evaluate(() => { const i = KOS.App.run.inst; return i.live.unofficial && /andet vindue/.test(document.querySelector('.race-live-banner').textContent); }) && await d2.evaluate(() => KOS.Lobby.state.sess.state === 'ok'), 'it does not steal the seat back (the second window stays connected)');
    await d2.ctx.close();
    await R.done();
  }

  // ---------------------------------------------------------------- 7. lobby half-open
  if (want('lobby')) {
    console.log('-- 7. the lobby socket goes half-open; the host starts meanwhile');
    const R = await room(false);
    R.px.black();
    await sleep(2000);
    await act(R.h, 'start'); await inRace(R.h);
    await sleep(5000); R.px.up();
    const got = await until(R.d, () => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, 25000);
    ok(got, 'the 8 s lobby watchdog + resume put the sailor into the race');
    ok(!R.seat().lost, 'the seat is live on the server');
    await R.done();
  }

  // ---------------------------------------------------------------- 8. the race ended while away
  if (want('ended')) {
    console.log('-- 8. the race ended while away');
    const R = await room(true);
    await R.d.evaluate(() => KOS.App.setPaused(true));
    await R.d.click('.pause-overlay [data-p="quit"]');
    await sleep(800);
    await R.h.evaluate(() => KOS.App.run.inst.live && KOS.App.run.host.live.hostEnd());
    await R.h.waitForFunction(() => KOS.App.run.inst && KOS.App.run.inst.state.liveRes, null, { timeout: 10000 }).catch(() => {});
    ok(R.r() && R.r().phase === 'results', 'the host ended the race (results)');
    await R.d.evaluate(() => KOS.App.show('hub'));
    await R.d.waitForSelector('#screen-hub .seatbar [data-seat="go"]');
    await R.d.click('#screen-hub .seatbar [data-seat="go"]');
    await waitView(R.d, 'results', 12000).catch(() => {});
    ok(await R.d.evaluate(() => document.getElementById('screen-live').getAttribute('data-live-view') === 'results' && document.querySelectorAll('.live-results li').length === 2), 'a late resume shows the official table');
    ok(await R.d.evaluate(c => { const o = JSON.parse(localStorage.getItem('kos.mp.lastResult')); return o && o.code === c && o.rows.length === 2 && !localStorage.getItem('kos.mp.seat'); }, R.code), 'kos.mp.lastResult keeps the table, the seat is cleared');
    // the room is gone and the server has nothing: the stored result is shown; with nothing stored, "Løbet er slut"
    const fake = await R.d.evaluate(() => { const s = { code: 'XXXX'.replace(/X/g, 'K'), id: 3, key: 'nokey1234', url: KOS.MPStatus.resolve().wsUrl, exp: Date.now() + 3600000, phase: 'racing', startedAt: 1 }; localStorage.setItem('kos.mp.seat', JSON.stringify(s)); sessionStorage.removeItem('kos.mp.rejoin'); return s; });
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
  }

  // ---------------------------------------------------------------- 9. the banner itself: offline, "Ikke nu", "Udgå", screenshots
  if (want('banner')) {
    console.log('-- 9. the banner: no network needed to show it, "Ikke nu", "Udgå", #join with another race');
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
    // screenshots: title + hub, phone and laptop
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const p = await newPage(R.WSp, 'Dorte', { storage: st, hash: '#', viewport: vp });
      await p.waitForSelector('#screen-title .seatbar'); await sleep(1200);
      const vis = sel => p.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width * 0.3, r.top + r.height / 2); return r.width > 200 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!top && e.contains(top); }, sel); // on screen and nothing on top of it
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
  }

  await browser.close(); await srv.close(); web.close && web.close();
  console.log('\n' + (checks - fails) + '/' + checks + ' checks passed');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
