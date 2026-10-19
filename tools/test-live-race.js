// KØS SEJL — live race tests (suite 'liverace'). Real headless Chromium clients race a short course on a local race server,
// steered by the AI autopilot (race instance .setAutopilot). Needs server/node_modules (ws); skips without it.
//   1. host-only (big screen) + two sailors: everybody gets the same official table, remotes follow the real boats, big screen shows a board
//   2. host + sailor, the server is killed mid race: ~15 s of reconnecting, then both finish locally, result marked unofficial, no freeze
//   3. contact between players: a port/starboard crossing steered by a fixed-heading bot ends in contact; the port boat is penalised on its own
//      client (and the big screen board shows it), the starboard boat is not; contact OFF = boats pass through; penalties OFF = bump only
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./serve');

const ROOT = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(ROOT, 'server', 'node_modules', 'ws'))) { console.log('SKIP liverace: server/node_modules is missing (npm install in server/).'); process.exit(0); }
const { createServer } = require(path.join(ROOT, 'server', 'index.js'));

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const IGNORE = /Failed to load resource|WebSocket connection|net::ERR/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const web = await serve({ port: 0 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-liverace-'));
  const statusFile = path.join(tmp, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }));
  const STATUS_URL = web.url.replace(/\/$/, '') + '/mp-status.json';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const pages = [];

  async function newPage(WS, hash, name) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.errs = []; page.sent = [];
    page.on('websocket', ws => ws.on('framesent', f => page.sent.push(String(f.payload))));
    page.on('pageerror', e => page.errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) page.errs.push('console ' + m.text()); });
    await page.route('**/mp-status.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }) }));
    const ov = 'mp=' + encodeURIComponent(WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL);
    await page.goto(web.url + '#' + [hash, ov].filter(Boolean).join('&'));
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await page.evaluate(n => { KOS.Storage.saveProfile({ name: n, sailNo: '7', avatar: null }); KOS.Storage.saveSettings({ sound: false, music: false, reducedMotion: true, unlockAll: true }); }, name);
    pages.push(ctx);
    return page;
  }
  const waitView = (page, v, ms) => page.waitForFunction(x => { const e = document.getElementById('screen-live'); return e && !e.hidden && e.getAttribute('data-live-view') === x; }, v, { timeout: ms || 8000 });
  const clickAct = (page, act) => page.click('#screen-live [data-act="' + act + '"]');

  // host (role) creates, the others join by code; everyone is then in the room view. cfg tweaks go straight into the lobby's config.
  async function lobby(WS, role, names, cfg, clicks) {
    const host = await newPage(WS, 'area=race', names[0]);
    await host.waitForSelector('.live-card', { timeout: 8000 });
    await host.click('.live-card');
    await waitView(host, 'entry');
    await clickAct(host, 'host');
    await waitView(host, 'setup');
    if (role === 'watch') await host.click('#screen-live [data-act="role"][data-v="watch"]');
    await host.evaluate(c => Object.assign(KOS.Lobby.state.cfg, c), cfg);
    for (const [k, v] of clicks || []) await host.click('#screen-live [data-act="opt"][data-k="' + k + '"][data-v="' + v + '"]'); // the real chips, as a host taps them
    await clickAct(host, 'create');
    await waitView(host, 'room');
    const code = await host.evaluate(() => document.getElementById('live-code-show').textContent);
    const others = [];
    for (const n of names.slice(1)) {
      const p = await newPage(WS, 'area=race', n);
      await p.waitForSelector('.live-card', { timeout: 8000 });
      await p.click('.live-card');
      await waitView(p, 'entry');
      await clickAct(p, 'joinview');
      await waitView(p, 'join');
      await p.fill('#live-code', code);
      await clickAct(p, 'join');
      await waitView(p, 'room');
      others.push(p);
    }
    const want = names.length;
    await host.waitForFunction(k => document.querySelectorAll('.live-player').length === k, want, { timeout: 8000 });
    return { host, others, all: [host].concat(others), code };
  }
  const inRace = p => p.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, { timeout: 15000 });
  const botOn = p => p.evaluate(() => { const i = KOS.App.run.inst; if (i.boat && !i.boat.hidden) { i.setAutopilot(true); } i.skipIntro(); });
  const resultOf = p => p.evaluate(() => { const lr = KOS.App.run.lastResult; return lr ? { r: lr.result, rows: lr.result.raceTable && lr.result.raceTable.rows } : null; });
  const snapshot = p => p.evaluate(() => {
    const i = KOS.App.run.inst; if (!i) return null;
    return { me: { x: i.boat.x, y: i.boat.y }, clock: i.state.clock, phase: i.state.phase, drawn: KOS.App.run.drawn || 0,
      remotes: i.live.remotes.map(b => ({ rid: b.rid, x: b.x, y: b.y, lost: !!b.lost, leg: b.rc.leg })), unofficial: i.live.unofficial };
  });

  // ================================================================== 1. host-only + two sailors on a real server
  console.log('-- big screen + two sailors race to the finish');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const WS = 'ws://127.0.0.1:' + port + '/ws';
    const L = await lobby(WS, 'watch', ['Storskaerm', 'Ane', 'Bo'], { boat: 'ilca', laps: 1, windKn: 12, windDeg: 225, countdownS: 20, gust: 0.2, shift: 0.2, pen: true, help: 'locked' });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    ok(true, 'all three clients are in the live race screen');
    const [big, a, b] = L.all;
    ok(await big.evaluate(() => KOS.App.run.act.liveRace === true && KOS.App.run.host.live.role === 'watch'), 'the host runs the big-screen role');
    ok(await a.evaluate(() => KOS.App.run.host.live.role === 'sail' && KOS.App.run.inst.state.clock < 0), 'a sailor waits for the gun (clock < 0)');
    ok(await big.evaluate(() => !!document.querySelector('.race-board.rb-watch') && !document.querySelector('.race-live-banner:not([hidden])') && KOS.App.run.inst.boats.length === 2), 'big screen: leader board panel, two boats, no own boat');
    // the pause button only opens a leave card: no resume-pause, no restart, the clock keeps running, Esc closes it
    await a.evaluate(() => document.querySelector('.pause-btn').click());
    ok(await a.evaluate(() => !!document.querySelector('.pause-overlay [data-p=quit]') && !document.querySelector('.pause-overlay [data-p=restart]') && KOS.App.run.paused === false), 'live: the pause button offers leaving only');
    await a.keyboard.press('Escape');
    ok(await a.evaluate(() => !document.querySelector('.pause-overlay')), 'live: Esc closes the leave card');
    await botOn(a); await botOn(b); await botOn(big);
    const c = await Promise.all(L.all.map(p => p.evaluate(() => KOS.App.run.inst.state.clock)));
    ok(Math.max.apply(null, c) - Math.min.apply(null, c) < 0.5, 'the start clocks agree within half a second (' + c.map(x => x.toFixed(2)).join(', ') + ')');
    ok(await a.evaluate(() => KOS.App.run.inst.state.laylines === false), 'help locked: everybody sails on the same assist level (laylines off)');
    ok(await a.evaluate(() => { const c = KOS.App.run.inst.debug.lostCfg; return c.gap >= 45 && c.thr >= 14; }), 'Normal (locked help): the off-course hints are rarer and slower than on Let');

    // wait until well into the race, then compare each real boat with how the others see it
    await a.waitForFunction(() => KOS.App.run.inst.state.phase === 'race' && KOS.App.run.inst.state.raceT > 25, null, { timeout: 90000 });
    const sn = await Promise.all(L.all.map(snapshot));
    const ids = await Promise.all([a, b].map(p => p.evaluate(() => KOS.App.run.host.live.myId)));
    const seen = (viewer, rid) => viewer.remotes.find(r => r.rid === rid);
    const dAB = Math.hypot(seen(sn[2], ids[0]).x - sn[1].me.x, seen(sn[2], ids[0]).y - sn[1].me.y);
    const dBA = Math.hypot(seen(sn[1], ids[1]).x - sn[2].me.x, seen(sn[1], ids[1]).y - sn[2].me.y);
    const dBig = Math.hypot(seen(sn[0], ids[0]).x - sn[1].me.x, seen(sn[0], ids[0]).y - sn[1].me.y);
    ok(dAB < 12 && dBA < 12 && dBig < 12, 'remote boats track the real boats (gaps ' + [dAB, dBA, dBig].map(x => x.toFixed(1)).join(', ') + ' m)');
    ok(sn[1].remotes.length === 1 && sn[0].remotes.length === 2 && !sn[1].remotes[0].lost, 'a sailor sees one other boat, the big screen sees both');
    const moved = await Promise.all([a, b, big].map(p => p.evaluate(() => KOS.App.run.inst.live.remotes.map(r => r.x + ',' + r.y).join('|'))));
    await sleep(1500);
    const moved2 = await Promise.all([a, b, big].map(p => p.evaluate(() => KOS.App.run.inst.live.remotes.map(r => r.x + ',' + r.y).join('|'))));
    ok(moved.every((m, i) => m !== moved2[i]), 'remote boats keep moving');
    ok(await big.evaluate(() => document.querySelectorAll('.race-board.rb-watch .rb-row').length === 2 && document.querySelectorAll('.race-board.rb-watch .rb-cols span').length === 7), 'the big screen board lists both sailors with gap, speed, next mark, distance and penalty columns');
    // board: speed column, no horizontal overflow, stable column widths, cells updated in place (same nodes), at 1920x1080, 1280x800 and a phone
    const boardInfo = () => big.evaluate(() => {
      const bd = document.querySelector('.race-board.rb-watch'), ls = bd.querySelector('.rb-list'), r0 = bd.querySelector('.rb-row');
      const w = k => { const e = r0 && r0.querySelector('.c-' + k); return e ? Math.round(e.getBoundingClientRect().width * 10) / 10 : -1; };
      return { over: bd.scrollWidth > bd.clientWidth + 1 || ls.scrollWidth > ls.clientWidth + 1, kn: [...bd.querySelectorAll('.rb-row .c-kn')].map(e => e.textContent), id: r0 && (r0.__id = r0.__id || Math.random()), widths: ['pos', 'name', 'gap', 'kn', 'mark', 'dist', 'pen'].map(w).join(','), w: innerWidth };
    });
    for (const [vw, vh, tag] of [[1920, 1080, 'board-1920'], [1280, 800, 'board-1280'], [390, 780, 'board-phone']]) {
      await big.setViewportSize({ width: vw, height: vh }); await sleep(1500);
      const b1 = await boardInfo(); await sleep(1600); const b2 = await boardInfo();
      ok(!b1.over && !b2.over, vw + 'px: the board has no horizontal overflow');
      ok(b1.widths === b2.widths && b1.id === b2.id, vw + 'px: column widths stable and the rows are the same nodes across updates (' + b1.widths + ')');
      ok(b2.kn.length === 2 && b2.kn.every(x => /^\d+\.\d$/.test(x)), vw + 'px: speed column shows knots (' + b2.kn.join(' / ') + ')');
      if (process.env.SHOTS) await big.screenshot({ path: process.env.SHOTS + 'live4-' + tag + '.png' });
    }
    await big.setViewportSize({ width: 900, height: 700 });

    await big.click('.watch-follow');
    ok(await big.evaluate(() => KOS.App.run.inst.state.follow === true && !!KOS.App.run.inst.scene.target), 'follow the leader: the camera tracks a boat');
    await big.click('.watch-follow');
    ok(await big.evaluate(() => KOS.App.run.inst.state.follow === false && !KOS.App.run.inst.scene.target), 'overview again after the toggle');

    // finish: both sailors reach the results screen
    for (const p of [a, b]) await p.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 240000 });
    const ra = await resultOf(a), rb = await resultOf(b);
    ok(ra && rb && ra.r.live === true && !ra.r.unofficial && !rb.r.unofficial, 'both results are official live results (no stars)');
    const key = rows => rows.map(r => r.place + ':' + r.name + ':' + r.timeMs).join(' | ');
    ok(ra.rows.length === 2 && key(ra.rows) === key(rb.rows), 'both clients show the same table (' + key(ra.rows) + ')');
    ok(ra.rows.every(r => r.timeMs > 5000) && ra.rows[0].place === 1 && ra.rows[1].place >= 1, 'two finish times after the shared gun, ranked');
    ok(await a.evaluate(() => /Resultat|vandt|plads/i.test(document.querySelector('.results-title').textContent) && !document.querySelector('.results-stars')), 'results screen: place title, no star row');
    ok(await a.evaluate(() => JSON.stringify(KOS.Storage.get('progress', {})).indexOf('race.live') < 0), 'a live race never writes progress');
    ok(await big.evaluate(() => KOS.App.run.inst.state.liveRes && KOS.App.run.inst.state.liveRes.length === 2), 'the big screen got the official table too');
    // big screen end card: podium, table, rematch; the sailors' results card has a waiting note
    await big.waitForSelector('.watch-end', { timeout: 8000 });
    ok(await big.evaluate(() => document.querySelectorAll('.watch-end .we-step').length === 2 && document.querySelectorAll('.watch-end .we-row').length === 2 && !!document.querySelector('.watch-end [data-we="rematch"]')), 'big screen: podium, results table and rematch button');
    ok(await a.evaluate(() => !!document.querySelector('.live-rematch-wait') && !document.querySelector('[data-act="retry"]')), 'sailor results card: waits for the host instead of a retry button');
    await big.click('.watch-end [data-we="rematch"]');
    for (const p of L.all) await waitView(p, 'room', 15000);
    ok(await a.evaluate(() => KOS.Lobby.state.room && KOS.Lobby.state.room.phase === 'lobby' && KOS.Lobby.state.room.players.length === 3), 'rematch: everybody is back in the lobby of the same room (3 people)');
    await clickAct(big, 'start');
    for (const p of L.all) await inRace(p);
    ok(await a.evaluate(() => KOS.App.run.inst.state.clock < 0 && KOS.App.run.inst.live.remotes.length === 1), 'rematch: a second race starts with the same people');
    const errs2 = [].concat(...L.all.map(p => p.errs));
    ok(errs2.length === 0, 'no errors on any page (' + errs2.join(' | ') + ')');
    for (const c of pages.splice(0)) await c.close();
    await srv.close();
  }

  // ================================================================== 2. the server dies mid race
  console.log('-- server killed mid race');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const WS = 'ws://127.0.0.1:' + port + '/ws';
    const L = await lobby(WS, 'sail', ['Vært', 'Dorte'], { boat: 'ilca', laps: 1, windKn: 12, windDeg: 225, countdownS: 20, gust: 0.2, shift: 0.2, pen: false, help: 'free' });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    for (const p of L.all) await botOn(p);
    const [h, d] = L.all;
    await h.waitForFunction(() => KOS.App.run.inst.state.phase === 'race' && KOS.App.run.inst.state.raceT > 12, null, { timeout: 60000 });
    ok(await h.evaluate(() => KOS.App.run.inst.live.remotes.length === 1 && !KOS.App.run.inst.live.unofficial), 'racing online before the kill');
    await srv.close();
    const t0 = Date.now();
    await h.waitForFunction(() => KOS.App.run.inst && KOS.App.run.inst.live.unofficial, null, { timeout: 40000 });
    const dt = (Date.now() - t0) / 1000;
    ok(dt > 10 && dt < 30, 'after ~15 s of reconnecting the race goes on locally (' + dt.toFixed(1) + ' s)');
    const f1 = await snapshot(h); await sleep(1500); const f2 = await snapshot(h);
    ok(f2.drawn > f1.drawn + 20 && f2.clock > f1.clock + 1, 'no freeze: frames and the race clock keep advancing');
    for (const p of [h, d]) await p.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 240000 });
    for (const p of [h, d]) {
      const r = await resultOf(p);
      ok(r.r.unofficial === true && r.r.titleKey === 'live.res.unofficial', 'result marked unofficial (' + r.r.titleKey + ')');
    }
    ok(await h.evaluate(() => /Uofficielt/.test(document.querySelector('.results-title').textContent)), 'results title says "Uofficielt resultat"');
    const errs = [].concat(...L.all.map(p => p.errs));
    ok(errs.length === 0, 'no errors on any page (' + errs.join(' | ') + ')');
    for (const c of pages.splice(0)) await c.close();
  }

  // ================================================================== 3. contact and rules between players
  // Both sailors are put on a collision course (port tack boat from the left, starboard tack boat from the right, wind from north) and hold their
  // heading with a fixed-heading helm (deterministic). Each client judges only its own boat.
  async function crossing(label, cfg, withBig) {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const WS = 'ws://127.0.0.1:' + port + '/ws';
    const names = withBig ? ['Storskaerm', 'Styrbord', 'Bagbord'] : ['Styrbord', 'Bagbord'];
    const L = await lobby(WS, withBig ? 'watch' : 'sail', names, Object.assign({ boat: 'ilca', laps: 1, windKn: 10, windDeg: 0, countdownS: 8, gust: 0, shift: 0, help: 'locked' }, cfg));
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    const sail = withBig ? L.all.slice(1) : L.all, big = withBig ? L.all[0] : null;
    for (const p of sail) await p.evaluate(() => KOS.App.run.inst.skipIntro());
    await sail[0].waitForFunction(() => KOS.App.run.inst.state.phase === 'race' && KOS.App.run.inst.state.raceT > 2, null, { timeout: 40000 });
    // starboard tack boat heads NW, port tack boat NE; both aim at X, 70 m upwind of the line, 22 m away
    const setup = (p, sgn) => p.evaluate(sg => {
      const i = KOS.App.run.inst, b = i.boat, U = KOS.U, H = sg * Math.PI / 3;
      const d = i.debug, X = { x: (d.pin.x + d.com.x) / 2, y: (d.pin.y + d.com.y) / 2 - 70 };
      const f = U.vec(H);
      b.x = X.x - f.x * 22; b.y = X.y - f.y * 22; b.heading = H; b.vx = f.x * 3; b.vy = f.y * 3; b.speed = 3; b.slip = 0; b.yawRate = 0;
      window.__H = H;
      KOS.Input.toControls = (st, bb) => { const c = KOS.Physics.controls(); c.autoTrim = true; c.autoHike = true; c.rudder = U.clamp(U.angDiff(bb.heading, window.__H) * 2.2 - bb.yawRate * 0.6, -1, 1); return c; };
      window.__minGap = 1e9; window.__v0 = 3; window.__maxSp = 0;
      window.__iv = setInterval(() => { const r = i.live.remotes[0]; if (r) window.__minGap = Math.min(window.__minGap, KOS.Rules.hullGap(b, r)); }, 40);
    }, sgn);
    await Promise.all([setup(sail[0], -1), setup(sail[1], 1)]);
    await sleep(500);
    const tacks = await Promise.all(sail.map(p => p.evaluate(() => KOS.App.run.inst.boat.tack)));
    ok(tacks[0] === 'starboard' && tacks[1] === 'port', label + ': one boat on starboard, one on port tack (' + tacks.join('/') + ')');
    await sleep(11000);
    const res = await Promise.all(sail.map(p => p.evaluate(() => { const i = KOS.App.run.inst, S = i.state; clearInterval(window.__iv);
      return { fouls: S.fouls, pen: !!i.boat.rc.pen, minGap: window.__minGap, speed: i.boat.speed, dist: Math.hypot(i.boat.x - i.live.remotes[0].x, i.boat.y - i.live.remotes[0].y) }; })));
    let board = null;
    if (big) board = await big.evaluate(() => { const i = KOS.App.run.inst; return { penN: i.live.remotes.map(r => ({ name: r.name, n: r.rc.penN || 0, pen: !!r.rc.pen })), html: document.querySelector('.race-board.rb-watch').innerText }; });
    const errs = [].concat(...L.all.map(p => p.errs));
    const keep = { L, sail, big, srv };
    return { res, board, errs, keep };
  }
  async function closeAll(k) { for (const c of pages.splice(0)) await c.close(); await k.srv.close(); }

  console.log('-- contact ON, penalties ON: port/starboard crossing');
  {
    const r = await crossing('contact', { contact: true, pen: true }, true);
    const [sb, pt] = r.res;
    ok(sb.minGap < 0.3 && pt.minGap < 0.3, 'the hulls touched on both clients (' + sb.minGap.toFixed(2) + ', ' + pt.minGap.toFixed(2) + ' m)');
    ok(pt.fouls >= 1 && pt.pen === true, 'the port boat is penalised on its own client (fouls ' + pt.fouls + ', penalty turn owed)');
    ok(sb.fouls === 0 && sb.pen === false, 'the starboard boat is not penalised');
    ok(r.board.penN.find(x => x.name === 'Bagbord').n >= 1 && r.board.penN.find(x => x.name === 'Styrbord').n === 0, 'the big screen sees the penalty for the port boat only (' + JSON.stringify(r.board.penN) + ')');
    ok(/↻/.test(r.board.html), 'the big screen board shows the penalty mark');
    ok(r.errs.length === 0, 'no errors (' + r.errs.join(' | ') + ')');
    await closeAll(r.keep);
  }
  console.log('-- contact OFF: ghosts');
  {
    const r = await crossing('ghost', { contact: false, pen: true }, false);
    const [sb, pt] = r.res;
    ok(sb.minGap < -0.2 && pt.minGap < -0.2, 'the boats pass through each other (' + sb.minGap.toFixed(2) + ', ' + pt.minGap.toFixed(2) + ' m)');
    ok(sb.fouls === 0 && pt.fouls === 0 && !sb.pen && !pt.pen, 'no foul and no penalty on either client');
    ok(r.errs.length === 0, 'no errors (' + r.errs.join(' | ') + ')');
    await closeAll(r.keep);
  }
  console.log('-- contact ON, penalties OFF: bump and a note only');
  {
    const r = await crossing('nopen', { contact: true, pen: false }, false);
    const [sb, pt] = r.res;
    ok(sb.minGap < 0.3 && pt.minGap < 0.3, 'the hulls touched');
    ok(pt.fouls >= 1 && pt.pen === false, 'the port boat gets the trainer note (fouls ' + pt.fouls + ') but no penalty turn');
    ok(sb.fouls === 0 && !sb.pen, 'the starboard boat gets nothing');
    ok(r.errs.length === 0, 'no errors (' + r.errs.join(' | ') + ')');
    await closeAll(r.keep);
  }


  // ================================================================== 5. the course the host taps is the course that is sailed
  // Exactly the user's path: tap chips in the setup (also the already-selected "Op og ned"), change boat/venue before and after,
  // then check the chip state, the frame sent to the server, the room cfg echoed back and the marks the race builds on both clients.
  console.log('-- course and laps chosen with the real chips are the ones sailed');
  for (const [course, laps, marks, seq] of [['wl', 1, ['m1'], ['start', 'm1', 'finish:down']], ['wl', 2, ['m1', 'm2'], ['start', 'm1', 'm2', 'm1', 'finish:down']], ['wl', 3, ['m1', 'm2'], ['start', 'm1', 'm2', 'm1', 'm2', 'm1', 'finish:down']],
    ['tri', 1, ['m1', 'm2', 'm3'], ['start', 'm1', 'm2', 'm3', 'finish:up']], ['tri', 2, ['m1', 'm2', 'm3'], ['start', 'm1', 'm2', 'm3', 'm1', 'm3', 'finish:up']]]) {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const clicks = course === 'wl' ? [['boat', 'zest'], ['course', 'wl'], ['laps', laps], ['venue', 'bay'], ['boat', 'ilca'], ['venue', 'sound']] : [['course', 'wl'], ['venue', 'bay'], ['course', 'tri'], ['boat', 'zest'], ['laps', laps], ['boat', 'ilca'], ['venue', 'sound']];
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Ane'], { countdownS: 20 }, clicks);
    const sent = L.host.sent.map(f => { try { return JSON.parse(f); } catch (e) { return {}; } }).find(m => m.t === 'create');
    ok(sent && sent.cfg.course === course && sent.cfg.laps === laps && sent.cfg.boat === 'ilca' && sent.cfg.venue === 'sound', course + ' x' + laps + ': the create frame carries the tapped values (' + JSON.stringify(sent && sent.cfg).slice(0, 90) + ')');
    ok(await L.host.evaluate(() => KOS.Lobby.state.room.cfg.course) === course && await L.others[0].evaluate(() => KOS.Lobby.state.room.cfg.course) === course, course + ': the room cfg echoed by the server (host and joiner)');
    ok(await L.host.evaluate(c => document.querySelector('.live-sum').textContent.indexOf(c === 'wl' ? 'Op og ned' : 'Trekant') >= 0, course), course + ': the room summary names the course');
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    for (const p of L.all) {
      const ci = await p.evaluate(() => KOS.App.run.inst.debug.courseInfo());
      ok(ci.course === course && ci.laps === laps && JSON.stringify(ci.marks) === JSON.stringify(marks) && JSON.stringify(ci.seq) === JSON.stringify(seq), course + ' x' + laps + ' on a client: ' + JSON.stringify(ci));
    }
    if (course === 'wl' && laps === 2 && process.env.SHOTS) { await L.host.evaluate(() => KOS.App.run.inst.skipIntro()); await sleep(1200); await L.host.screenshot({ path: process.env.SHOTS + 'live4-course-wl-sailor.png' }); }
    await closeAll({ srv });
  }
  // the chip that shows selected is the value that is stored (setup screen)
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const host = await newPage('ws://127.0.0.1:' + port + '/ws', 'area=race', 'Vaert');
    await host.waitForSelector('.live-card'); await host.click('.live-card'); await waitView(host, 'entry'); await clickAct(host, 'host'); await waitView(host, 'setup');
    const on = () => host.evaluate(() => ({ chip: (document.querySelector('[data-k="course"].on') || { dataset: {} }).dataset.v, cfg: KOS.Lobby.state.cfg.course }));
    ok(JSON.stringify(await on()) === '{"chip":"wl","cfg":"wl"}', 'setup default: "Op og ned" selected and stored');
    for (const [k, v, want] of [['course', 'tri', 'tri'], ['boat', 'zest', 'tri'], ['venue', 'bay', 'tri'], ['laps', 3, 'tri'], ['course', 'wl', 'wl'], ['boat', 'opti', 'wl'], ['venue', 'sound', 'wl']]) {
      await host.click('#screen-live [data-act="opt"][data-k="' + k + '"][data-v="' + v + '"]');
      const o = await on(); ok(o.chip === want && o.cfg === want, 'after tapping ' + k + '=' + v + ' the course chip and the stored course are both ' + want);
    }
    await closeAll({ srv });
  }

  // ================================================================== 6. host finishes first, the others never finish; finish window, DNF, lobby afterwards
  console.log('-- sailing host finishes first: window, DNF for the others, back to the lobby');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Ane', 'Bo'], { boat: 'ilca', laps: 1, countdownS: 8, finishS: 6, windKn: 14, rain: 1 });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    const [h, a, b] = L.all;
    ok(await h.evaluate(() => !!document.querySelector('.host-btn')) && !(await a.evaluate(() => !!document.querySelector('.host-btn'))), 'only the host has the host button');
    ok(await a.evaluate(() => KOS.App.run.host.live.cfg.rain === 1 && KOS.App.run.host.live.cfg.windKn === 14), 'rain and wind arrive in the race config');
    await h.waitForFunction(() => KOS.App.run.inst.state.raceT > 6, null, { timeout: 40000 });
    await h.click('.host-btn');
    ok(await h.evaluate(() => document.querySelectorAll('.host-menu .hm-row').length === 3 && ['end', 'abort', 'lobby'].every(k => !!document.querySelector('.host-menu [data-hm="' + k + '"]'))), 'host menu: standings with 3 boats, end, abort, lobby-after');
    await h.click('.host-menu [data-hm="lobby"]');
    ok(await h.evaluate(() => KOS.App.run.inst.state.lobbyAfter === true), 'lobby-after is switched on');
    await h.click('.host-menu [data-hm="close"]');
    await h.evaluate(() => KOS.App.run.inst.debug.finishNow());
    ok(await h.evaluate(() => /1/.test((document.querySelector('.race-board .rb-me b') || {}).textContent || '') && /2/.test((document.querySelector('.race-board .rb-me span') || {}).textContent || '')), 'my finish place and "waiting for 2 sailors" show at once');
    await a.waitForFunction(() => { const e = document.querySelector('.race-fwin'); return e && !e.hidden && /[0-9]:[0-9][0-9]/.test(e.textContent); }, null, { timeout: 5000 });
    ok(true, 'the others see the finish window countdown');
    await h.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 20000 });
    for (const p of [a, b]) await p.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 20000 });
    const rh = await resultOf(h), ra = await resultOf(a);
    ok(rh.rows.find(r => r.me).place === 1 && rh.rows.filter(r => r.dnf).length === 2 && ra.rows.filter(r => r.dnf).length === 2, 'official table: host 1st, the two who never finished are DNF (same on every client)');
    for (const p of L.all) await p.waitForFunction(() => KOS.App.cur === 'live' && document.getElementById('screen-live').getAttribute('data-live-view') === 'room', null, { timeout: 30000 });
    ok(true, 'lobby-after: everybody is back in the lobby of the same room');
    ok(L.all.every(p => p.errs.length === 0), 'no errors (' + L.all.map(p => p.errs.join('|')).join(' / ') + ')');
    await closeAll({ srv });
  }

  // ================================================================== 7. big-screen host: abort, then end now
  console.log('-- big-screen host: abort back to the lobby, then end now');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'watch', ['Storskaerm', 'Ane', 'Bo'], { boat: 'zest', laps: 1, countdownS: 8, windKn: 10 });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    const [big, a, b] = L.all;
    await big.click('.host-btn');
    ok(await big.evaluate(() => document.querySelectorAll('.host-menu .hm-row').length === 2 && document.querySelectorAll('.host-menu [data-hm="kick"]').length === 2), 'big screen host menu: two boats, a kick button each');
    await big.click('.host-menu [data-hm="abort"]'); await big.click('.host-menu [data-hm="yes"]');
    for (const p of L.all) await p.waitForFunction(() => KOS.App.cur === 'live' && document.getElementById('screen-live').getAttribute('data-live-view') === 'room', null, { timeout: 15000 });
    ok(true, 'abort: everybody back in the lobby, no result screen');
    await clickAct(big, 'start');
    for (const p of L.all) await inRace(p);
    await big.waitForFunction(() => KOS.App.run.inst.state.raceT > 1, null, { timeout: 30000 });
    await big.click('.host-btn'); await big.click('.host-menu [data-hm="end"]'); await big.click('.host-menu [data-hm="yes"]');
    for (const p of [a, b]) await p.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 15000 });
    await big.waitForFunction(() => !!document.querySelector('.watch-end .we-card'), null, { timeout: 15000 });
    ok(await big.evaluate(() => document.querySelectorAll('.watch-end .we-row').length === 2), 'end now: the big screen shows the final table, the sailors the results card');
    ok((await resultOf(a)).rows.every(r => r.dnf), 'nobody had finished: both sailors are DNF');
    ok(L.all.every(p => p.errs.length === 0), 'no errors (' + L.all.map(p => p.errs.join('|')).join(' / ') + ')');
    await closeAll({ srv });
  }

  // ================================================================== 8. personal off-course trainer
  console.log('-- off-course hints: only for a boat sailing away from the mark, rate limited, local only');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Ane'], { boat: 'ilca', laps: 1, windKn: 10, windDeg: 0, countdownS: 20, gust: 0, shift: 0, help: 'free' });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    const [lost, good] = L.all;
    ok(await lost.evaluate(() => { const c = KOS.App.run.inst.debug.lostCfg; return c.thr > 0 && c.thr <= 10 && c.gap >= 15; }), 'Let: simple, frequent hints are configured');
    await botOn(good); await botOn(lost);
    await lost.waitForFunction(() => KOS.App.run.inst.boat.rc.started && KOS.App.run.inst.state.raceT > 3, null, { timeout: 90000 });
    // from here the "lost" sailor holds a heading straight away from the next mark; the other sailor keeps racing correctly
    await lost.evaluate(() => {
      const i = KOS.App.run.inst, b = i.boat, U = KOS.U, tg = i.debug.marks[0];
      i.setAutopilot(false); i.debug.lost.log.length = 0; i.debug.lost.n = 0; i.debug.lost.last = -999; i.debug.lost.away = 0;
      window.__H = U.bearing(tg, b);
      KOS.Input.toControls = (st, bb) => { const c = KOS.Physics.controls(); c.autoTrim = true; c.autoHike = true; c.rudder = U.clamp(U.angDiff(bb.heading, window.__H) * 2.2 - bb.yawRate * 0.6, -1, 1); return c; };
    });
    const t0 = Date.now();
    await lost.waitForFunction(() => KOS.App.run.inst.debug.lost.log.length >= 1, null, { timeout: 60000 });
    const took = (Date.now() - t0) / 1000;
    ok(took > 4 && took < 45, 'the hint comes after a sustained spell of sailing away, not at once (' + took.toFixed(1) + ' s)');
    ok(await lost.evaluate(() => KOS.App.run.inst.debug.lost.log[0] === 'lostAway' && /Mærket er derovre/.test(document.body.innerText)), 'the trainer says where the mark is (Danish bubble on screen)');
    if (process.env.SHOTS) { await lost.setViewportSize({ width: 390, height: 780 }); await sleep(900); await lost.screenshot({ path: process.env.SHOTS + 'live4-hint-phone.png' }); await lost.setViewportSize({ width: 900, height: 700 }); }
    await sleep(9000);
    ok(await lost.evaluate(() => KOS.App.run.inst.debug.lost.log.length) === 1, 'rate limit: no second hint within the Let gap');
    ok(await good.evaluate(() => KOS.App.run.inst.debug.lost.log.length) === 0, 'a boat sailing correctly gets no hint (' + await good.evaluate(() => JSON.stringify(KOS.App.run.inst.debug.lost.log) + KOS.App.run.inst.boat.rc.leg) + ')');
    ok(!L.host.sent.concat(L.others[0].sent).some(f => /lost|hint|trainer/i.test(f)), 'no hint frame was sent to the server (local only)');
    ok(L.all.every(p => p.errs.length === 0), 'no errors (' + L.all.map(p => p.errs.join('|')).join(' / ') + ')');
    await closeAll({ srv });
  }

  await browser.close();
  await web.close();
  console.log('\nliverace: ' + checks + ' checks, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
