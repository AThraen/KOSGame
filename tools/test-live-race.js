// KØS SEJL — live race tests (suite 'liverace'). Real headless Chromium clients race a short course on a local race server,
// steered by the AI autopilot (race instance .setAutopilot). Needs server/node_modules (ws); skips without it.
//   1. host-only (big screen) + two sailors: everybody gets the same official table, remotes follow the real boats, big screen shows a board
//   2. host + sailor, the server is killed mid race: ~15 s of reconnecting, then both finish locally, result marked unofficial, no freeze
//   13. finish direction + a lost sailor (see the section at the end)
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
const NOWS = 'ws://127.0.0.1:9/ws'; // a pages that never goes live

async function main() {
  const web = await serve({ port: 0 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-liverace-'));
  const statusFile = path.join(tmp, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }));
  const STATUS_URL = web.url.replace(/\/$/, '') + '/mp-status.json';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const pages = [];

  async function newPage(WS, hash, name, storage) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block', storageState: storage });
    const page = await ctx.newPage();
    page.errs = []; page.sent = [];
    page.on('websocket', ws => ws.on('framesent', f => page.sent.push(String(f.payload))));
    page.on('pageerror', e => page.errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) page.errs.push('console ' + m.text()); });
    await page.route('**/mp-status.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }) }));
    await page.addInitScript(n => { try { if (!localStorage.getItem('kos.profile')) localStorage.setItem('kos.profile', JSON.stringify({ name: n, sailNo: '7', avatar: null })); } catch (e) { /* ignore */ } }, name);
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
  for (const [course, laps, marks, seq] of [['wl', 1, ['m1', 'm1a'], ['start', 'm1', 'm1a', 'finish:down']], ['wl', 2, ['m1', 'm1a', 'g2s', 'g2b'], ['start', 'm1', 'm1a', 'g2', 'm1', 'm1a', 'finish:down']], ['wl', 3, ['m1', 'm1a', 'g2s', 'g2b'], ['start', 'm1', 'm1a', 'g2', 'm1', 'm1a', 'g2', 'm1', 'm1a', 'finish:down']],
    ['tri', 1, ['m1', 'm2', 'g3s', 'g3b'], ['start', 'm1', 'm2', 'g3', 'finish:up']], ['tri', 2, ['m1', 'm2', 'g3s', 'g3b'], ['start', 'm1', 'm2', 'g3', 'm1', 'g3', 'finish:up']]]) {
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

  // ================================================================== 9. self-healing: drop, dead socket, background, burst, stale boat, reload
  console.log('-- robust: socket drop, dead socket, 10 s background, burst, stale boat, reload (H-boat, 20 kn, countdown)');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Dorte'], { boat: 'hboat', laps: 1, windKn: 20, windDeg: 225, countdownS: 110, gust: 0.8, shift: 0.4, help: 'free' });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    const [h, d] = L.all;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mine = p => p.evaluate(() => { const b = KOS.App.run.inst.boat; return { x: b.x, y: b.y, sp: b.speed, clock: KOS.App.run.inst.state.clock }; });
    const hostView = async () => { const id = await d.evaluate(() => KOS.App.run.host.live.myId); return h.evaluate(rid => { const b = KOS.App.run.inst.live.remotes.find(r => r.rid === rid); return b ? { x: b.x, y: b.y, lost: !!b.lost, tag: b.tag || '' } : null; }, id); };
    // sampler on Dorte's page: the largest jump of her own boat between two samples (100 ms apart)
    await d.evaluate(() => { window.__inst = KOS.App.run.inst; window.__trk = []; window.__trkT = setInterval(() => { const b = window.__inst.boat; window.__trk.push([b.x, b.y]); }, 100); });
    const maxJump = () => d.evaluate(() => { const t = window.__trk; let m = 0; for (let i = 1; i < t.length; i++) m = Math.max(m, Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1])); window.__trk.length = 0; return m; });
    const sameInst = () => d.evaluate(() => KOS.App.run.inst === window.__inst);
    const seenOk = async (what) => {
      await h.waitForFunction(() => { const r = KOS.App.run.inst.live.remotes[0]; return r && !r.lost; }, null, { timeout: 6000 });
      const v = await hostView(), m = await mine(d);
      ok(v && !v.lost && dist(v, m) < 25, 'host sees Dorte again after ' + what + ' (gap ' + (v ? dist(v, m).toFixed(1) : '?') + ' m)');
    };
    await sleep(3000);
    ok(await d.evaluate(() => !!KOS.App.run.inst.state && KOS.App.run.inst.state.clock < -60), 'racing screen up in the countdown (clock ' + (await mine(d)).clock.toFixed(0) + ')');
    await maxJump();

    // 1. the socket drops
    const sock0 = await d.evaluate(() => KOS.Lobby.state.sess.reconnects);
    await d.evaluate(() => KOS.Lobby.state.sess.testDrop());
    await d.waitForFunction(n => KOS.Lobby.state.sess.reconnects > n, sock0, { timeout: 10000 });
    ok(await sameInst(), 'socket drop: the race screen is NOT rebuilt (the boat keeps its place; it used to restart at the start line)');
    ok((await maxJump()) < 6, 'socket drop: no teleport of my own boat');
    await seenOk('a socket drop');

    // 2. dead socket (open, but silent): the watchdog notices within a few seconds
    const forced0 = await d.evaluate(() => KOS.Lobby.state.sess.forced || 0);
    const rc1 = await d.evaluate(() => KOS.Lobby.state.sess.reconnects);
    await d.evaluate(() => KOS.Lobby.state.sess.testMute());
    const tm = Date.now();
    await d.waitForFunction(n => KOS.Lobby.state.sess.reconnects > n, rc1, { timeout: 12000 });
    ok(Date.now() - tm < 9000 && (await d.evaluate(() => KOS.Lobby.state.sess.forced)) > forced0, 'dead socket: the watchdog reconnects by itself (' + ((Date.now() - tm) / 1000).toFixed(1) + ' s)');
    ok(await sameInst() && (await maxJump()) < 6, 'dead socket: same race screen, no teleport');
    await seenOk('a dead socket');

    // 3. the phone is in the background for 10 s: rAF stops. Coming back must not fly the boat off.
    await maxJump();
    const before = await mine(d);
    await d.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
    await sleep(10000);
    await d.evaluate(() => { window.requestAnimationFrame = window.__raf; KOS.App.kickFrame(); });
    await sleep(1500);
    const after = await mine(d);
    const sk = await d.evaluate(() => ({ n: KOS.App.run.inst.state.skips, s: KOS.App.run.inst.state.skippedS }));
    ok(sk.n >= 1 && sk.s > 6, 'background 10 s: the lost time was skipped, not simulated (' + sk.n + ' skip, ' + sk.s.toFixed(1) + ' s)');
    ok(dist(before, after) < 20, 'background 10 s: my boat moved ' + dist(before, after).toFixed(1) + ' m (under 20), it did not fly away (open-loop catch-up would be ~' + Math.round(Math.abs(before.sp) * 11) + '+ m)');
    ok(await sameInst() && await d.evaluate(() => KOS.Lobby.state.sess.state === 'ok'), 'background 10 s: same race screen, connection ok');
    await seenOk('10 s in the background');

    // 4. a burst of queued frames after a stall does not get the client closed
    const rc2 = await d.evaluate(() => KOS.Lobby.state.sess.reconnects);
    const lastSt = JSON.parse(d.sent.filter(f => /"t":"st"/.test(f)).pop());
    await d.evaluate(s => { const S = KOS.Lobby.state.sess; for (let i = 1; i <= 250; i++) { const a = s.slice(); a[1] = s[1] + i; S.send({ t: 'st', s: a }); } }, lastSt.s);
    await sleep(1500);
    ok(await d.evaluate(n => KOS.Lobby.state.sess.state === 'ok' && KOS.Lobby.state.sess.reconnects === n, rc2), 'a burst of 250 queued frames: the socket stays open, no reconnect');
    await seenOk('a burst of frames');

    // 5. a stale boat: Dorte stops sending for 4 s => host shows "mistet forbindelse", then she is back
    await d.evaluate(() => { KOS.App.run.inst.state.holdSend = true; });
    await h.waitForFunction(() => { const r = KOS.App.run.inst.live.remotes[0]; return r && r.lost; }, null, { timeout: 8000 });
    await sleep(1500);
    const stale = await hostView();
    ok(stale && stale.lost && /⚠/.test(stale.tag), 'stale boat: shown as lost on the host (faded, warning mark in its tag: "' + (stale && stale.tag) + '")');
    if (process.env.SHOTS) { await h.setViewportSize({ width: 900, height: 700 }); await h.screenshot({ path: process.env.SHOTS + 'live5-lost-boat.png' }); }
    await d.evaluate(() => { KOS.App.run.inst.state.holdSend = false; });
    await h.waitForFunction(() => { const r = KOS.App.run.inst.live.remotes[0]; return r && !r.lost; }, null, { timeout: 6000 });
    const back = await hostView(), me2 = await mine(d);
    ok(back && !back.lost && dist(back, me2) < 25, 'stale boat: fresh states bring it back (gap ' + dist(back, me2).toFixed(1) + ' m)');

    // 6. a reload: the boat comes back where it was, not on the start line
    await sleep(2000);
    const p0 = await mine(d);
    const hd0 = await d.evaluate(() => KOS.App.run.inst.boat.heading);
    const startSlot = await d.evaluate(() => { const g = KOS.App.run.host.live.grid, i = g.findIndex(x => x.id === KOS.App.run.host.live.myId); return i; });
    await sleep(600); // let the server hold a state newer than p0
    await d.reload();
    await d.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await inRace(d);
    await d.waitForFunction(() => KOS.App.run.inst.state.restored === true, null, { timeout: 8000 });
    await sleep(1500);
    const p1 = await mine(d);
    const dt = p1.clock - p0.clock;
    const ex = { x: p0.x + Math.sin(hd0) * p0.sp * dt, y: p0.y - Math.cos(hd0) * p0.sp * dt };
    const slot = await d.evaluate(() => { const i = KOS.App.run.inst, b = i.boat; return { dx: b.x, dy: b.y }; });
    ok(dist(p1, p0) < Math.max(40, Math.abs(p0.sp) * (dt + 2) * 1.5) && dist(p1, p0) > 0, 'reload: the boat is back where it was (' + dist(p1, p0).toFixed(1) + ' m from the last position, ' + dt.toFixed(1) + ' s later at ' + p0.sp.toFixed(1) + ' m/s)');
    ok(dist(p1, ex) < 15, 'reload: within ' + dist(p1, ex).toFixed(1) + ' m of the straight-line estimate (gap sailed from the restored pose, not the start line)');
    ok(await d.evaluate(() => KOS.App.run.inst.state.clock < 0), 'reload: still before the gun (clock ' + p1.clock.toFixed(1) + ')');
    await seenOk('a reload');
    void startSlot; void slot;
    ok(L.all.every(p => p.errs.length === 0), 'no errors (' + L.all.map(p => p.errs.join('|')).join(' / ') + ')');
    for (const c of pages.splice(0)) await c.close(); await srv.close();
  }

  // ================================================================== 10. chaos: random drops, dead sockets, stalls, reloads, clock steps on 4 clients
  console.log('-- chaos: 4 clients, random drops / dead sockets / stalls / reloads / clock steps / bursts through the countdown and the race');
  {
    let seed = +(process.env.CHAOS_SEED || 7) >>> 0;
    const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Ane', 'Bo', 'Cille'], { boat: 'ilca', laps: 1, windKn: 14, windDeg: 225, countdownS: 40, gust: 0.4, shift: 0.3, pen: false, contact: false, help: 'free' });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    for (const p of L.all) await botOn(p);
    const ids = await Promise.all(L.all.map(p => p.evaluate(() => KOS.App.run.host.live.myId)));
    const t0 = Date.now();
    const quiet = L.all.map(() => 0); // ms timestamp until which a client counts as "being disturbed" (+ recovery time)
    const log = [];
    // sampler: how long is a boat lost in somebody else's view although nobody was disturbed for a while?
    let worst = 0, worstWho = '';
    const lostSince = new Map();
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const views = await Promise.all(L.all.map(p => p.evaluate(() => { const i = KOS.App.run.inst; return i && i.live ? i.live.remotes.map(r => [r.rid, !!r.lost]) : []; }).catch(() => [])));
        const now = Date.now();
        views.forEach((v, vi) => v.forEach(([rid, lost]) => {
          const ti = ids.indexOf(rid), key = vi + ':' + ti;
          if (!lost) { lostSince.delete(key); return; }
          if (!lostSince.has(key)) lostSince.set(key, now);
          const calm = Math.max(quiet[vi], quiet[ti]);
          const bad = now - Math.max(lostSince.get(key), calm);
          if (bad > worst) { worst = bad; worstWho = 'view ' + vi + ' of ' + ti; }
        }));
        await sleep(400);
      }
    })();
    const actions = ['drop', 'mute', 'stall', 'reload', 'clock', 'burst', 'clock', 'reload'];
    const reloaded = new Set();
    let n = 0;
    while (Date.now() - t0 < 45000 && n < 9) {
      await sleep(1500 + rnd() * 3500);
      const ci = Math.floor(rnd() * L.all.length), p = L.all[ci];
      let act = pick(actions);
      if (act === 'reload' && reloaded.has(ci)) act = 'drop';
      quiet[ci] = Date.now() + 1e9;
      log.push(((Date.now() - t0) / 1000).toFixed(0) + 's c' + ci + ' ' + act);
      try {
        if (act === 'drop') await p.evaluate(() => KOS.Lobby.state.sess.testDrop());
        else if (act === 'mute') await p.evaluate(() => KOS.Lobby.state.sess.testMute());
        else if (act === 'stall') {
          const ms = 3000 + Math.floor(rnd() * 9000);
          await p.evaluate(() => { window.__raf = window.__raf || window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
          await sleep(ms);
          await p.evaluate(() => { window.requestAnimationFrame = window.__raf; KOS.App.kickFrame(); });
        } else if (act === 'clock') {
          const step = (rnd() < 0.5 ? -1 : 1) * (1000 + Math.floor(rnd() * 7000));
          await p.evaluate(s => { KOS.Lobby.state.sess.offset += s; }, step);
        } else if (act === 'burst') {
          const s = p.sent.filter(f => /"t":"st"/.test(f)).pop();
          if (s) await p.evaluate(x => { const S = KOS.Lobby.state.sess; for (let i = 1; i <= 200; i++) { const a = x.slice(); a[1] += i; S.send({ t: 'st', s: a }); } }, JSON.parse(s).s);
        } else if (act === 'reload') {
          reloaded.add(ci);
          await p.reload();
          await p.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
          await inRace(p);
          await botOn(p);
        }
      } catch (e) { log.push('  (' + act + ' failed: ' + String(e.message).split('\n')[0] + ')'); }
      quiet[ci] = Date.now() + 5000; // recovery budget: 5 s after the disturbance ended
      n++;
    }
    console.log('  chaos log: ' + log.join(' | '));
    // everybody finishes with the same official table
    for (const p of L.all) await p.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 280000 });
    sampling = false; await sampler;
    ok(worst <= 4000, 'no boat stayed lost for more than a few seconds after the disturbance ended (worst ' + (worst / 1000).toFixed(1) + ' s, ' + worstWho + ')');
    const res = await Promise.all(L.all.map(resultOf));
    const key = rows => rows.map(r => r.place + ':' + r.name + ':' + r.timeMs).join(' | ');
    ok(res.every(r => r && r.r.live === true && !r.r.unofficial), 'every client ends with an official live result (no one fell back to unofficial)');
    ok(res.every(r => r.rows.length === 4 && key(r.rows) === key(res[0].rows)), 'all four clients show the same table (' + (res[0] ? key(res[0].rows) : '') + ')');
    ok(res[0].rows.every(r => r.timeMs > 5000), 'all four finished (no DNF / lost among them)');
    ok(L.all.every(p => p.errs.length === 0), 'no errors on any page (' + L.all.map(p => p.errs.join('|')).join(' / ') + ')');
    for (const c of pages.splice(0)) await c.close();
    await srv.close();
  }

  // ================================================================== 11. the page is closed mid race; the prompt brings the boat back
  console.log('-- page closed mid race: rejoin prompt, back at the last position, the others saw it lost and then back');
  {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const WS = 'ws://127.0.0.1:' + port + '/ws';
    const L = await lobby(WS, 'sail', ['Vaert', 'Dorte'], { boat: 'ilca', laps: 1, windKn: 12, windDeg: 225, countdownS: 8, gust: 0.2, shift: 0.2, pen: false, help: 'free', finishS: 0 });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    for (const p of L.all) await botOn(p);
    const [h, d] = L.all;
    await d.waitForFunction(() => KOS.App.run.inst.state.phase === 'race' && KOS.App.run.inst.state.raceT > 14, null, { timeout: 60000 });
    const myId = await d.evaluate(() => KOS.App.run.host.live.myId);
    const seat = await d.evaluate(() => JSON.parse(localStorage.getItem('kos.mp.seat')));
    ok(seat && seat.id === myId && seat.code === L.code, 'while racing the seat is in localStorage (' + (seat && seat.code) + ')');
    const before = await d.evaluate(() => { const i = KOS.App.run.inst; return { x: i.boat.x, y: i.boat.y, sp: i.boat.speed, leg: i.boat.rc.leg }; });
    const stored = await d.context().storageState();
    pages.splice(pages.indexOf(d.context()), 1);
    await d.context().close(); // closed tab / swiped away app
    const t0 = Date.now();
    await h.waitForFunction(rid => { const r = KOS.App.run.inst.live.remotes.find(b => b.rid === rid); return r && r.lost; }, myId, { timeout: 12000 });
    ok(true, 'the host sees Dorte\'s boat as lost');
    await sleep(Math.max(0, 8000 - (Date.now() - t0))); // a few seconds away
    const frozen = await h.evaluate(rid => { const r = KOS.App.run.inst.live.remotes.find(b => b.rid === rid); return { x: r.x, y: r.y, lost: !!r.lost }; }, myId);
    ok(frozen.lost && Math.hypot(frozen.x - before.x, frozen.y - before.y) < 30, 'while she is away the boat waits at its last known place on the others\' screens (' + Math.hypot(frozen.x - before.x, frozen.y - before.y).toFixed(1) + ' m off)');

    const r = await newPage(WS, '', 'Dorte', stored);
    await r.waitForSelector('.dialog .live-rejoin-body', { timeout: 10000 });
    ok(await r.evaluate(c => document.querySelector('.dialog .live-rejoin-body').textContent.indexOf(c) > 0, L.code), 'the prompt names the race ' + L.code);
    await r.click('.dialog .btn-primary');
    await inRace(r);
    await r.waitForFunction(() => KOS.App.run.inst.state.restored === true, null, { timeout: 15000 });
    const after = await r.evaluate(() => { const i = KOS.App.run.inst, S = i.state; return { x: i.boat.x, y: i.boat.y, rx: S.rest.st.x, ry: S.rest.st.y, gap: S.restoredGapS, clock: S.clock, leg: i.boat.rc.leg, phase: S.phase }; });
    const dRest = Math.hypot(after.rx - before.x, after.ry - before.y), dNow = Math.hypot(after.x - before.x, after.y - before.y);
    ok(dRest < 6, 'the server\'s copy of the boat is the last position (' + dRest.toFixed(1) + ' m from where the tab closed)');
    ok(dNow < 9 && after.gap > 4, 'back at the last position within a few metres after ' + after.gap + ' s away (' + dNow.toFixed(1) + ' m), not flown on');
    ok(after.leg === before.leg || after.leg === before.leg + 1, 'mark progress kept (leg ' + before.leg + ' -> ' + after.leg + ')');
    const ck = await Promise.all([h, r].map(p => p.evaluate(() => KOS.App.run.inst.state.clock)));
    ok(Math.abs(ck[0] - ck[1]) < 0.8, 'the race clock is the shared one again (' + ck.map(x => x.toFixed(2)).join(' / ') + ')');
    await h.waitForFunction(rid => { const x = KOS.App.run.inst.live.remotes.find(b => b.rid === rid); return x && !x.lost; }, myId, { timeout: 12000 });
    await sleep(1500);
    const seen = await Promise.all([h.evaluate(rid => { const x = KOS.App.run.inst.live.remotes.find(b => b.rid === rid); return { x: x.x, y: x.y, lost: !!x.lost }; }, myId), r.evaluate(() => ({ x: KOS.App.run.inst.boat.x, y: KOS.App.run.inst.boat.y }))]);
    ok(!seen[0].lost && Math.hypot(seen[0].x - seen[1].x, seen[0].y - seen[1].y) < 12, 'the host sees her boat back (not lost) where it really is (' + Math.hypot(seen[0].x - seen[1].x, seen[0].y - seen[1].y).toFixed(1) + ' m)');
    await botOn(r);
    for (const p of [h, r]) await p.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 280000 });
    const [ra, rb] = await Promise.all([h, r].map(resultOf));
    ok(ra.rows.length === 2 && ra.rows.every(x => x.timeMs > 5000) && JSON.stringify(ra.rows.map(x => x.name)) === JSON.stringify(rb.rows.map(x => x.name)) && !ra.r.unofficial && !rb.r.unofficial, 'both finish and share the official table after the rejoin');
    ok(await r.evaluate(() => localStorage.getItem('kos.mp.seat') === null), 'the entry is cleared at the results');
    ok([h, r].every(p => p.errs.length === 0), 'no errors (' + [h, r].map(p => p.errs.join('|')).join(' / ') + ')');
    for (const c of pages.splice(0)) await c.close();
    await srv.close();
  }

  // ================================================================== 12. every water layer follows the wind
  // The crest pattern is read from the real canvas: CanvasPattern.setTransform is spied on, so what is measured is what is drawn.
  // wave direction = the way the crests roll (their convex side leads), compared with the wind the renderer's scene holds (and with the
  // wind the physics uses and the configured wind direction).
  console.log('-- waves follow the wind (live races with windDir 45/135/225/315, an ordinary race, free sail, school)');
  const spyWaves = p => p.evaluate(() => {
    if (window.__wv) return;
    window.__wv = []; const o = CanvasPattern.prototype.setTransform;
    CanvasPattern.prototype.setTransform = function (m) {
      try {
        const sc = KOS.App.run && KOS.App.run.inst && KOS.App.run.inst.scene, v = sc && sc.view;
        if (sc && sc.water && Math.abs(Math.hypot(m.a, m.b) - 30 / 256) < 1e-6) { window.__wv.push([performance.now(), m.a, m.b, m.c, m.d, m.e, m.f, sc.wind ? sc.wind.dir : null, v ? (v.x0 + v.x1) / 2 : 0, v ? (v.y0 + v.y1) / 2 : 0]); if (window.__wv.length > 400) window.__wv.splice(0, 200); }
      } catch (e) { /* spy only */ }
      return o.call(this, m);
    };
  });
  const D = Math.PI / 180, wrapD = a => { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; };
  const readWaves = async (p, label, cfgDeg) => {
    await spyWaves(p); await p.evaluate(() => { window.__wv.length = 0; });
    await sleep(2500);
    const info = await p.evaluate(() => {
      const i = KOS.App.run.inst, sc = i.scene, w = sc.wind;
      return { wind: w.dir / Math.PI * 180, base: w.base.dir / Math.PI * 180, phys: i.boat && i.boat.windDir != null ? i.boat.windDir / Math.PI * 180 : null, waveDir: sc.water.waveDir == null ? null : sc.water.waveDir / Math.PI * 180, samples: window.__wv.slice(-60), tilt: !!sc._tilt };
    });
    const S = info.samples;
    ok(S.length > 20, label + ': the renderer drew the wave layer (' + S.length + ' frames sampled)');
    const last = S[S.length - 1];
    // "from" bearing of the crests: the pattern's -y (convex side) points the way they roll; the bearing they come from is atan2(c, -d)
    const from = Math.atan2(last[3], -last[4]) / D, wdir = last[7] / D;
    ok(Math.abs(wrapD(from - wdir)) <= 10, label + ': waves come from ' + from.toFixed(0) + ' deg, the wind blows from ' + wdir.toFixed(0) + ' deg (<= 10 deg apart)');
    // crest lines lie across the wind (fronts), so the motion the eye follows is along the wind
    const axis = Math.atan2(last[2], last[1]) / D;
    ok(Math.abs(Math.abs(wrapD(axis - (wdir - 90))) - 90) <= 10, label + ': crest lines lie across the wind');
    // drift of the pattern at the view centre, summed over the window = where the waves travel to
    let sx = 0, sy = 0, n = 0;
    for (let k = 1; k < S.length; k++) {
      const A = S[k - 1], B = S[k], dt = (B[0] - A[0]) / 1000; if (dt <= 0 || dt > 0.2) continue;
      const det = A[1] * A[4] - A[2] * A[3], px = A[8] - A[5], py = A[9] - A[6];
      const qx = (A[4] * px - A[3] * py) / det, qy = (-A[2] * px + A[1] * py) / det;
      sx += (B[1] * qx + B[3] * qy + B[5] - A[8]) ; sy += (B[2] * qx + B[4] * qy + B[6] - A[9]); n += dt;
    }
    const tr = Math.atan2(sx, -sy) / D; // bearing the waves travel TOWARDS expressed like a "from" bearing of the opposite side
    const downwind = ((wdir + 180) % 360 + 360) % 360;
    // (tr is the heading of the travel vector; compare with the downwind heading)
    ok(Math.abs(wrapD(tr - downwind)) <= 10 && Math.hypot(sx, sy) / n > 0.8 && Math.hypot(sx, sy) / n < 4.5, label + ': the crests roll downwind at ' + (Math.hypot(sx, sy) / n).toFixed(1) + ' m/s (heading ' + tr.toFixed(0) + ' vs downwind ' + downwind.toFixed(0) + ')');
    ok(info.waveDir != null && Math.abs(wrapD(info.waveDir - info.wind)) < 0.01, label + ': every layer takes its direction from the one wind the scene holds (water.waveDir = scene.wind.dir)');
    if (cfgDeg != null) ok(Math.abs(wrapD(info.base - cfgDeg)) < 0.01 && Math.abs(wrapD(wdir - cfgDeg)) <= 14, label + ': the scene wind is the configured one (' + cfgDeg + ' deg, now ' + wdir.toFixed(0) + ' with the shifts)');
    if (info.phys != null) ok(Math.abs(wrapD(info.phys - wdir)) <= 12, label + ': the physics wind (' + info.phys.toFixed(0) + ') and the water wind (' + wdir.toFixed(0) + ') agree');
    return info;
  };
  for (const wdeg of [45, 135, 225, 315]) {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Ane'], { boat: 'ilca', laps: 1, windKn: 10, windDeg: wdeg, countdownS: 8, gust: 0.4, shift: 0.4, pen: false });
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    for (const p of L.all) await botOn(p);
    await L.host.waitForFunction(() => KOS.App.run.inst.state.clock > 0, null, { timeout: 40000 });
    await readWaves(L.host, 'live ' + wdeg, wdeg);
    if (wdeg === 225 && process.env.SHOTS) await L.host.screenshot({ path: process.env.SHOTS + 'live6-waves-after-live.png' });
    for (const c of pages.splice(0)) await c.close();
    await srv.close();
  }
  {
    const play = async (id, label) => {
      const pg = await newPage(NOWS, '', 'Vandrer');
      await pg.evaluate(i => { KOS.App.play(i, { force: true }); }, id);
      await pg.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.scene, null, { timeout: 20000 });
      await pg.evaluate(() => { try { KOS.App.run.inst.skipIntro(); } catch (e) { /* none */ } });
      await sleep(1500);
      const dir = await pg.evaluate(() => KOS.App.run.act.params && KOS.App.run.act.params.windDeg);
      await readWaves(pg, label, null);
      if (dir != null) {
        const w = await pg.evaluate(() => KOS.App.run.inst.scene.wind.base.dir / Math.PI * 180);
        ok(Math.abs(wrapD(w - dir)) < 0.01, label + ': the scene wind is the activity\'s wind (' + dir + ' deg)');
      }
      for (const c of pages.splice(0)) await c.close();
    };
    const acts = await (async () => { const pg = await newPage(NOWS, '', 'X'); const r = await pg.evaluate(() => { const A = KOS.Activities; return { race: A.byArea('race').find(a => !a.liveRace && !a.pickHidden).id, sail: 'sail.free.opti', school: A.byArea('school')[0].id }; }); for (const c of pages.splice(0)) await c.close(); return r; })();
    await play(acts.race, 'ordinary race (' + acts.race + ')');
    await play(acts.sail, 'free sail');
    await play(acts.school, 'school (' + acts.school + ')');
  }

  // ================================================================== 13. the finish counts when crossed the natural way (from the last mark); AI races and live
  // Root cause of the report "it wants you to pass the goal line from the wrong side": the triangle's finish required a crossing from the
  // pre-start side to the course side ('up'), but the last leg (mark 3 -> line) arrives from the course side. The AI helm judged any crossing,
  // so bots never noticed. These tests steer the player's own boat through the rule itself (debug.crossFinish) and also sail bots to the line.
  const FIN_JS = {
    // wrong way first (must not count and the trainer says so), then the natural way from the last mark's side
    geometry: () => {
      const i = KOS.App.run.inst, d = i.debug, S = i.state, fi = d.seq.length - 1, it = d.seq[fi];
      let g = 0; while (S.phase !== 'race' && g++ < 400) d.jump(1);
      d.setLeg(fi);
      const lm = d.seq[fi - 1], from = lm.type === 'mark' ? lm.m : d.line.a;
      const mid = d.fl.mid;
      const dx = mid.x - from.x, dy = mid.y - from.y, n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
      const A = { x: mid.x - ux * 12, y: mid.y - uy * 12 }, B = { x: mid.x + ux * 12, y: mid.y + uy * 12 }; // A = last-mark side, B = beyond the line
      const wrong = d.crossFinish(B.x, B.y, A.x, A.y); // from beyond the line back towards the last mark
      const coachTxt = (document.querySelector('.coach, .trainer, .kc-coach') || {}).textContent || '';
      const wrongDone = i.boat.rc.finT != null;
      const right = d.crossFinish(A.x, A.y, B.x, B.y);
      return { dir: it.dir, wrong, wrongDone, right, byLine: i.boat.rc.byLine === true, coach: coachTxt.slice(0, 80) };
    },
    // a bot sails the whole course; it must finish, and through the line the right way round
    bot: () => {
      const i = KOS.App.run.inst; i.setAutopilot(true); i.skipIntro();
      let t = 0; // one synchronous run: the real frame loop must not interleave (it makes the sail path frame-rate dependent)
      while (i.boat.rc.finT == null && t < 2400) { i.debug.jump(10); t += 10; }
      return { fin: i.boat.rc.finT != null, t, leg: i.boat.rc.leg, n: i.debug.seq.length };
    },
  };
  console.log('-- finish direction: W-L and triangle, 1/2/3 laps, ordinary (AI) races');
  {
    const errsAll = [];
    let page;
    const start = (id, course, laps) => page.evaluate(([i, c, l]) => {
      if (!KOS.Activities.get(i)) KOS.Activities.add({ id: i, mode: 'race', area: 'race', boat: 'zest', pickHidden: true, params: { series: 'zest', race: 1, races: 1, venue: 'sound', course: c, laps: l, fleet: 0, windDeg: 225, windKn: 12, gust: 0, shift: 0, bias: 0, targetS: 400, seed: 11 } });
      KOS.App.play(i, { force: true });
    }, [id, course, laps]);
    for (const [course, laps] of [['wl', 1], ['wl', 2], ['wl', 3], ['tri', 1], ['tri', 2], ['tri', 3]]) {
      const id = 'race.rf3.' + course + laps;
      page = await newPage(NOWS, '', 'Fin'); // a fresh page per course (one race per page)
      await start(id, course, laps);
      await page.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.debug, null, { timeout: 15000 });
      await page.evaluate(() => KOS.App.run.inst.skipIntro());
      const g = await page.evaluate(FIN_JS.geometry);
      ok((g.dir === 'down' && g.wrong === false && g.wrongDone === false || g.dir === 'any') && g.right === true && g.byLine, 'AI race ' + course + ' x' + laps + ': finish is crossed from the last mark (' + g.dir + '); the wrong way does not count, the natural way does');
      if (course === 'tri' && g.dir !== 'any') ok(/forkert|Wrong/i.test(g.coach), 'AI race ' + course + ' x' + laps + ': the wrong way gets a hint ("' + g.coach + '")');
      errsAll.push(...page.errs);
      await page.context().close(); pages.pop();
      page = await newPage(NOWS, '', 'Fin'); // the bot sails on its own page
      await start(id, course, laps);
      await page.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.debug, null, { timeout: 15000 });
      const b = await page.evaluate(FIN_JS.bot);
      ok(b.fin, 'AI race ' + course + ' x' + laps + ': a bot sails the course and finishes through the line (' + b.t + ' s, leg ' + b.leg + '/' + (b.n - 1) + ')');
      await page.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 40000 }).catch(() => {});
      errsAll.push(...page.errs);
      await page.context().close(); pages.pop();
    }
    ok(errsAll.length === 0, 'no errors (' + errsAll.join('|') + ')');
  }
  console.log('-- Dansk Sejlunion courses (live): layout, gates, finish direction from the real marks, bots sail every course');
  {
    // a live race with a stub session: no server, no clock; the race is driven synchronously through debug.jump
    const stubRace = async (course, laps, wdeg) => {
      const page = await newPage(NOWS, '', 'Dsu');
      await page.evaluate(() => KOS.MPStatus.load()); // the lazy net modules (race.js packs states through KOS.MPState)
      await page.evaluate(([c, l, w]) => {
        const T0 = performance.now() + Date.now();
        const live = { cfg: { boat: 'ilca', venue: 'sound', course: c, laps: l, windDeg: w, windKn: 12, gust: 0, shift: 0, seed: 11, maxP: 4, maxS: 900, countdownS: 8, pen: true, contact: false, help: 'free', rain: 0, finishS: 0 },
          grid: [{ id: 1, slot: 0, name: 'Bot', color: '#ff7a1a' }], myId: 1, role: 'sail', countdownS: 8, T0, sent: [], serverNow: () => T0 - 8000, send(m) { this.sent.push(m); }, on() { return () => {}; }, leave() {} };
        window.__live = live;
        KOS.App.play('race.live', { force: true, live });
      }, [course, laps, wdeg]);
      await page.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.debug, null, { timeout: 15000 });
      await page.evaluate(() => { const i = KOS.App.run.inst; i.skipIntro(); let g = 0; while (i.state.phase !== 'race' && g++ < 400) i.debug.jump(1); });
      return page;
    };
    const SEQS = { wl1: ['start', 'm1', 'm1a', 'finish:down'], wl2: ['start', 'm1', 'm1a', 'g2', 'm1', 'm1a', 'finish:down'], wl3: ['start', 'm1', 'm1a', 'g2', 'm1', 'm1a', 'g2', 'm1', 'm1a', 'finish:down'],
      tri1: ['start', 'm1', 'm2', 'g3', 'finish:up'], tri2: ['start', 'm1', 'm2', 'g3', 'm1', 'g3', 'finish:up'], tri3: ['start', 'm1', 'm2', 'g3', 'm1', 'g3', 'm1', 'g3', 'finish:up'] };
    const geo = () => {
      // the natural approach: from the last mark / gate across the finish line; the reverse must not count, the wrong way gets a hint
      const i = KOS.App.run.inst, d = i.debug, fi = d.seq.length - 1, lm = d.seq[fi - 1].m, FL = d.fl;
      d.setLeg(fi);
      const dx = FL.mid.x - lm.x, dy = FL.mid.y - lm.y, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
      const A = { x: FL.mid.x - ux * 12, y: FL.mid.y - uy * 12 }, B = { x: FL.mid.x + ux * 12, y: FL.mid.y + uy * 12 };
      const sLast = d.sOfF(lm.x, lm.y), want = Math.abs(sLast) / n < 0.26 ? 'any' : sLast > 0 ? 'down' : 'up';
      const rev = d.crossFinish(B.x, B.y, A.x, A.y), hint = ((document.querySelector('.coach, .trainer, .kc-coach') || {}).textContent || '');
      const nat = d.crossFinish(A.x, A.y, B.x, B.y);
      return { dir: d.seq[fi].dir, want, rev, nat, hint: hint.slice(0, 60), sep: FL.sep, seq: d.courseInfo().seq, marks: d.courseInfo().marks };
    };
    for (const [course, laps, wd] of [['wl', 1, 225], ['wl', 2, 45], ['wl', 3, 135], ['tri', 1, 0], ['tri', 2, 90], ['tri', 3, 315]]) {
      const key = course + laps, page = await stubRace(course, laps, wd);
      const g = await page.evaluate(geo);
      ok(JSON.stringify(g.seq) === JSON.stringify(SEQS[key]), key + ' wind ' + wd + ': sequence ' + g.seq.join('-'));
      ok(g.dir === g.want && g.dir !== 'any' && g.nat === true && g.rev === false, key + ' wind ' + wd + ': finish "' + g.dir + '" follows the last mark; natural approach counts, the reverse does not' + (g.sep ? ' (own finish line above mark 1)' : ' (start line)'));
      if (course === 'tri') ok(g.sep === true && g.dir === 'up', key + ': the finish is a separate line crossed upwind');
      ok(g.rev === false && /forkert|Wrong/i.test(g.hint), key + ': the wrong way shows a hint ("' + g.hint + '")');
      await page.context().close(); pages.pop();
    }
    // layouts: pure rule checks on odd marks (both sides, in line)
    {
      const page = await stubRace('wl', 1, 200);
      const r = await page.evaluate(() => {
        const d = KOS.App.run.inst.debug, FL = d.fl, ex = FL.b.x - FL.a.x, ey = FL.b.y - FL.a.y, e = Math.hypot(ex, ey), nx = FL.nrm.x, ny = FL.nrm.y, out = [];
        for (const [al, ac] of [[0, 90], [0, -90], [60, 90], [-60, 70], [60, -90], [80, 6], [-80, -6], [0, 10]]) { // metres along the line, metres across it (+ = course side)
          const pt = { x: FL.mid.x + ex / e * al + nx * ac, y: FL.mid.y + ey / e * al + ny * ac }, dir = d.finDirFrom(pt), s = d.sOfF(pt.x, pt.y);
          out.push({ al, ac, dir, fromSide: d.finOk(dir, s, -s), back: d.finOk(dir, -s, s) });
        }
        return out;
      });
      const good = r.every(x => x.dir === 'any' ? x.fromSide && x.back : x.fromSide && !x.back) && r.filter(x => x.dir === 'down').length >= 3 && r.filter(x => x.dir === 'up').length >= 2 && r.some(x => x.dir === 'any');
      ok(good, 'odd last-mark layouts: crossing from the last mark\'s side counts, the reverse not; a mark nearly in line with the line accepts both (' + r.map(x => x.dir).join(',') + ')');
      await page.context().close(); pages.pop();
    }
    // gates: either mark counts when rounded its own way, from inside the gate; the wrong way round does not
    for (const course of ['wl', 'tri']) {
      const page = await stubRace(course, 2, 225);
      const r = await page.evaluate(() => {
        const i = KOS.App.run.inst, d = i.debug, gi = d.seq.findIndex(it => it.m && it.m.gate), gate = d.seq[gi].m.gate, out = {}, rad = 8;
        const circ = (mk, from, to, n) => { const pts = []; for (let k = 0; k <= n; k++) { const b = from + (to - from) * k / n, v = KOS.Util ? null : null; pts.push({ x: mk.x + Math.sin(b) * rad, y: mk.y - Math.cos(b) * rad }); } return pts; }; // bearing from the mark, 0 = north, clockwise
        const lab = k => gate[k].label;
        const run = (k, from, to) => { d.setLeg(gi); const leg = d.walk(circ(gate[k], from, to, 40)); return leg > gi; };
        const D = Math.PI / 180;
        // starboard mark (s): boat arrives from inside the gate (east of 2s when facing down => the side towards 2b), turns clockwise: bearing grows
        out.sOK = run(0, 90 * D, 360 * D); out.sWrong = run(0, 360 * D, 90 * D);
        out.bOK = run(1, 270 * D, 0); out.bWrong = run(1, 0, 270 * D);
        out.labels = [lab(0), lab(1)];
        return out;
      });
      ok(r.sOK && r.bOK && !r.sWrong && !r.bWrong, course + ': gate ' + r.labels.join('/') + ' accepts either mark rounded its own way (s ' + r.sOK + ', b ' + r.bOK + '), not the wrong way (' + r.sWrong + ', ' + r.bWrong + ')');
      await page.context().close(); pages.pop();
    }
    // bots sail every course to the finish: the whole sequence including both gates, then the line
    for (const [course, laps, wd] of [['wl', 1, 225], ['wl', 2, 100], ['wl', 3, 300], ['tri', 1, 20], ['tri', 2, 200], ['tri', 3, 250]]) {
      const page = await stubRace(course, laps, wd);
      const b = await page.evaluate(() => { const i = KOS.App.run.inst; i.setAutopilot(true); let t = 0; while (i.boat.rc.finT == null && t < 2400) { i.debug.jump(10); t += 10; } return { fin: i.boat.rc.finT != null, t, leg: i.boat.rc.leg, n: i.debug.seq.length, sent: window.__live.sent.filter(m => m.t === 'fin').length }; });
      ok(b.fin && b.sent === 1, 'live ' + course + ' x' + laps + ' wind ' + wd + ': a bot sails the whole course and finishes (' + b.t + ' s, leg ' + b.leg + '/' + (b.n - 1) + ', fin sent ' + b.sent + 'x)');
      await page.context().close(); pages.pop();
    }
  }
  console.log('-- live: the triangle finish counts; a lost sailor never blocks the results');
  for (const [course, lost] of [['tri', true]]) {
    const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
    const port = await srv.listen();
    const L = await lobby('ws://127.0.0.1:' + port + '/ws', 'sail', ['Vaert', 'Bo', 'Cleo'], { boat: 'ilca', laps: 1, course, countdownS: 8, finishS: 0, windKn: 14, gust: 0, shift: 0, windDeg: 225 }, [['course', course]]);
    await clickAct(L.host, 'start');
    for (const p of L.all) await inRace(p);
    const [h, bo, cl] = L.all;
    await h.waitForFunction(() => KOS.App.run.inst.state.phase === 'race' && KOS.App.run.inst.state.raceT > 1, null, { timeout: 40000 });
    ok(await h.evaluate(() => KOS.App.run.inst.debug.courseInfo().course) === course, 'live ' + course + ': the room sails a ' + course);
    await botOn(bo); await botOn(cl);
    await sleep(8000);
    // Cleo loses her connection for good: the page is closed mid race and never comes back
    { const cx = cl.context(); pages.splice(pages.indexOf(cx), 1); await cx.close(); }
    const g = await h.evaluate(FIN_JS.geometry); // the host finishes the natural way (the wrong way first: no finish)
    ok(g.dir === 'down' && g.wrong === false && g.wrongDone === false && g.right === true, 'live ' + course + ': the host\'s boat counts the finish crossed from the last mark, not the wrong way');
    // Bo (a bot) sails the whole triangle live and finishes; then the lost seat gets its window and the race ends with results on everybody
    const t0 = Date.now();
    await bo.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 420000 });
    await h.waitForFunction(() => KOS.App.cur === 'results', null, { timeout: 120000 });
    const rb = await resultOf(bo), rh = await resultOf(h);
    ok(rb.rows.length === 3 && rh.rows.length === 3, 'live: the same three-row table on both clients (' + Math.round((Date.now() - t0) / 1000) + ' s after the host finished)');
    ok(rb.rows.filter(r => !r.dnf).length === 2 && rb.rows.filter(r => r.dnf).length === 1 && rb.rows.find(r => r.dnf).name === 'Cleo', 'live: Bo and the host finished, Cleo (lost) is DNF');
    ok([h, bo].every(p => p.errs.length === 0), 'no errors (' + [h, bo].map(p => p.errs.join('|')).join(' / ') + ')');
    await closeAll({ srv });
  }

  await browser.close();
  await web.close();
  console.log('\nliverace: ' + checks + ' checks, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
