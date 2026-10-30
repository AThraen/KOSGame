// KØS SEJL — live race client tests (suite 'liveclient'). Headless Chromium against a locally started race server;
// the status file is served through page.route so every state (on / closed / hidden / missing) can be tested.
//   - startup and a normal hub/race-area visit touch no WebSocket and no /mp* URL; server OFF => no entry, no errors
//   - closed => greyed entry with the message, host/join disabled; on + unreachable => the trainer's kind message + AI race button
//   - host creates (code, link, QR), two clients join via link and via code, player list, kick, start -> countdown arrives
//   - live-rules spec B/C: "Find et løb" (render over GET /rooms without a socket, 10 s refresh only while open, empty state, join from the
//     list, kill switch), "Planlæg til senere" (validation, schedule, private), "Mine planlagte løb" (QR, .ics reminder, cancel),
//     #live=CODE for a race that is not open yet (the wait card), a server-run scheduled room and the creator taking the host seat
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./serve');

const ROOT = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(ROOT, 'server', 'node_modules', 'ws'))) { console.log('SKIP liveclient: server/node_modules is missing (npm install in server/).'); process.exit(0); }
const { createServer } = require(path.join(ROOT, 'server', 'index.js'));

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };
const IGNORE = /Failed to load resource|WebSocket connection|net::ERR/i;

async function main() {
  const web = await serve({ port: 0 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-liveclient-'));
  const statusFile = path.join(tmp, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }));
  const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile });
  const port = await srv.listen();
  const WS = 'ws://127.0.0.1:' + port + '/ws';
  const STATUS_URL = web.url.replace(/\/$/, '') + '/mp-status.json';
  let status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }; // what the fake static file says (null = missing)
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  async function newPage(hash, name, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, serviceWorkers: 'block', storageState: opts.storage });
    const page = await ctx.newPage();
    page.errs = []; page.mpReqs = [];
    page.on('pageerror', e => page.errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) page.errs.push('console ' + m.text()); });
    page.on('request', r => { if (/\/mp[-/]/.test(new URL(r.url()).pathname)) page.mpReqs.push(r.url()); });
    await page.route('**/mp-status.json', route => (status ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }) : route.fulfill({ status: 404, body: '' })));
    if (opts.clockMs) await page.addInitScript(d => { const n = Date.now; Date.now = () => n() + d; }, opts.clockMs); // a phone whose clock is off
    await page.addInitScript(() => {
      window.__ws = 0; const W = window.WebSocket;
      window.WebSocket = function (u, p) { window.__ws++; return new W(u, p); }; window.WebSocket.prototype = W.prototype;
      Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    });
    // the profile exists BEFORE the page loads (a returning player); opts.noProfile = a brand-new phone
    if (name !== null && !opts.noProfile) await page.addInitScript(n => { try { if (!localStorage.getItem('kos.profile')) localStorage.setItem('kos.profile', JSON.stringify({ name: n, sailNo: '7', avatar: null })); } catch (e) { /* ignore */ } }, name || 'Tester');
    const ov = opts.noOverride ? '' : 'mp=' + encodeURIComponent(opts.ws || WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL);
    await page.goto(web.url + '#' + [hash, ov].filter(Boolean).join('&'));
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    if (name !== null && !opts.noProfile) await page.evaluate(n => { KOS.Storage.saveProfile({ name: n, sailNo: '7', avatar: null }); KOS.Storage.saveSettings({ sound: false, reducedMotion: true }); }, name || 'Tester');
    return { ctx, page };
  }
  const waitView = (page, v, ms) => page.waitForFunction(x => { const e = document.getElementById('screen-live'); return e && !e.hidden && e.getAttribute('data-live-view') === x; }, v, { timeout: ms || 8000 });
  const clickAct = (page, act) => page.click('#screen-live [data-act="' + act + '"]');

  // ---------------------------------------------------------------- 1. nothing happens without the entry
  console.log('-- startup and server OFF');
  let { ctx, page } = await newPage('area=race', null, { noOverride: true });
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__ws) === 0, 'no WebSocket constructed on a normal visit to the race area');
  ok(page.mpReqs.length === 0, 'no /mp* request on a normal visit (local dev server, no override)');
  ok(await page.evaluate(() => !document.querySelector('.live-card')), 'no live entry when the status cannot be read');
  ok(await page.evaluate(() => !(KOS.MP || KOS.Lobby || KOS.QR)), 'lazy modules (mp, lobby, qr) are not loaded');
  ok(page.errs.length === 0, 'no console/page errors (' + page.errs.join(' | ') + ')');
  await ctx.close();

  status = null;
  ({ ctx, page } = await newPage('area=race'));
  await page.waitForTimeout(800);
  ok(page.mpReqs.length >= 1 && await page.evaluate(() => window.__ws) === 0, 'status file read lazily in the race area, still no WebSocket');
  ok(await page.evaluate(() => !document.querySelector('.live-card')), 'missing status file => entry hidden');
  ok(await page.evaluate(() => document.querySelectorAll('.act-card').length > 0), 'the ordinary race levels are still there');
  ok(page.errs.length === 0, 'missing status: no errors (' + page.errs.join(' | ') + ')');
  await ctx.close();

  status = { mode: 'hidden', message: '', maxRooms: 1, maxPlayers: 1 };
  ({ ctx, page } = await newPage('area=race'));
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => !document.querySelector('.live-card')), 'mode hidden => entry hidden');
  await ctx.close();

  // ---------------------------------------------------------------- 2. closed
  console.log('-- closed');
  status = { mode: 'closed', message: 'Vi tester lige serveren.', maxRooms: 10, maxPlayers: 12 };
  ({ ctx, page } = await newPage('area=race'));
  await page.waitForSelector('.live-card', { timeout: 8000 });
  ok(await page.evaluate(() => document.querySelector('.live-card').textContent.indexOf('Vi tester lige serveren.') >= 0), 'closed => entry shows the status message');
  ok(await page.evaluate(() => window.__ws) === 0, 'closed: still no WebSocket');
  await page.click('.live-card');
  await waitView(page, 'entry');
  ok(await page.evaluate(() => document.querySelector('#screen-live [data-act="host"]').disabled && document.querySelector('#screen-live [data-act="joinview"]').disabled), 'closed => host and join disabled');
  ok(await page.evaluate(() => document.getElementById('screen-live').textContent.indexOf('Vi tester lige serveren.') >= 0), 'the trainer speaks the closed message');
  await ctx.close();

  // ---------------------------------------------------------------- 3. on, server unreachable
  console.log('-- on, server unreachable');
  status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 };
  ({ ctx, page } = await newPage('area=race', 'Anna', { ws: 'ws://127.0.0.1:1/ws' }));
  await page.waitForSelector('.live-card', { timeout: 8000 });
  await page.click('.live-card');
  await waitView(page, 'entry');
  await clickAct(page, 'host');
  await waitView(page, 'setup');
  await clickAct(page, 'create');
  await waitView(page, 'msg', 8000);
  const txt = await page.evaluate(() => document.getElementById('screen-live').textContent);
  ok(/ikke tilgængelig lige nu|Kan ikke nå løbsserveren/.test(txt), 'unreachable => the trainer says it kindly');
  ok(await page.evaluate(() => /Jesper/.test(document.querySelector('.live-trainer .coach-name').textContent)), 'it is Træner Jesper talking');
  ok(await page.evaluate(() => !!document.querySelector('#screen-live [data-act="ai"]')), 'a button offers an ordinary AI race');
  await clickAct(page, 'ai');
  await page.waitForFunction(() => KOS.App.cur === 'play', null, { timeout: 10000 });
  ok(await page.evaluate(() => KOS.App.run.act && !KOS.App.run.act.liveRace), 'the AI button starts an ordinary race');
  ok(page.errs.length === 0, 'no errors in the unreachable flow (' + page.errs.join(' | ') + ')');
  await ctx.close();

  // ---------------------------------------------------------------- 4. host + clients
  console.log('-- host, link join, code join, kick, start');
  const host = await newPage('area=race', 'Vært Vibe');
  await host.page.waitForSelector('.live-card', { timeout: 8000 });
  await host.page.click('.live-card');
  await waitView(host.page, 'entry');
  ok(await host.page.evaluate(() => !!(KOS.MP && KOS.Lobby && KOS.QR)), 'opening the entry lazy-loads mp, lobby and qr');
  await clickAct(host.page, 'host');
  await waitView(host.page, 'setup');
  ok(await host.page.evaluate(() => document.querySelectorAll('#screen-live [data-act="opt"][data-k="boat"]').length >= 1), 'setup lists the unlocked boats');
  await host.page.click('#screen-live [data-act="opt"][data-k="laps"][data-v="1"]');
  await host.page.click('#screen-live [data-act="opt"][data-k="countdownS"][data-v="20"]');
  await clickAct(host.page, 'create');
  await waitView(host.page, 'room');
  const code = await host.page.evaluate(() => document.getElementById('live-code-show').textContent);
  ok(/^[ACDEFGHJKMNPRTUVWXY34679]{4}$/.test(code), 'host sees a 4-character code (' + code + ')');
  ok(await host.page.evaluate(() => document.getElementById('live-link').textContent.indexOf('#join=') > 0), 'host sees the join link');
  ok(await host.page.evaluate(() => { const s = document.querySelector('#live-qr svg'); return !!s && s.querySelectorAll('path').length === 1 && !!s.getAttribute('viewBox'); }), 'QR code renders (svg)');
  ok(await host.page.evaluate(() => document.querySelector('#screen-live [data-act="start"]').disabled), 'Start is disabled with one sailor');

  const link = await host.page.evaluate(() => document.getElementById('live-link').textContent);
  const hash = link.slice(link.indexOf('#') + 1);
  const c1 = await newPage(hash, 'Bo');
  await waitView(c1.page, 'join');
  ok(await c1.page.evaluate(c => document.getElementById('live-code').value === c, code), 'link join: code prefilled from #join=');
  ok(await c1.page.evaluate(() => location.hash.indexOf('join=') < 0), 'the hash is cleared afterwards');
  await clickAct(c1.page, 'join');
  await waitView(c1.page, 'room');

  const c2 = await newPage('area=race', 'Cille');
  await c2.page.waitForSelector('.live-card', { timeout: 8000 });
  await c2.page.click('.live-card');
  await waitView(c2.page, 'entry');
  await clickAct(c2.page, 'joinview');
  await waitView(c2.page, 'join');
  await c2.page.fill('#live-code', 'zzzz');
  await clickAct(c2.page, 'join');
  await c2.page.waitForFunction(() => document.getElementById('live-joinerr').textContent.length > 0, null, { timeout: 8000 });
  ok(await c2.page.evaluate(() => /findes ikke/.test(document.getElementById('live-joinerr').textContent)), 'a wrong code gives the kind "findes ikke" message');
  await c2.page.fill('#live-code', code.toLowerCase().slice(0, 2) + ' ' + code.slice(2));
  await clickAct(c2.page, 'join');
  await waitView(c2.page, 'room');

  await host.page.waitForFunction(() => document.querySelectorAll('.live-player').length === 3, null, { timeout: 8000 });
  const names = await host.page.evaluate(() => [...document.querySelectorAll('.live-player b')].map(b => b.textContent));
  ok(names.some(n => n.indexOf('Bo') === 0) && names.some(n => n.indexOf('Cille') === 0), 'player list shows both joiners (' + names.join(', ') + ')');
  ok(await host.page.evaluate(() => document.querySelectorAll('.live-player .live-ready').length === 3), 'every player shows ready');
  ok(await host.page.evaluate(() => !document.querySelector('#screen-live [data-act="start"]').disabled), 'Start is enabled with three sailors');
  ok(await c1.page.evaluate(() => !document.querySelector('#screen-live [data-act="start"]') && document.getElementById('screen-live').textContent.indexOf('Venter på værten') >= 0), 'a joiner sees "Venter på værten" and no Start');

  // kick Cille, she gets the message; then she comes back by code
  const cilleId = await host.page.evaluate(() => [...document.querySelectorAll('.live-player')].find(li => li.textContent.indexOf('Cille') >= 0).getAttribute('data-id'));
  await host.page.click('.live-player[data-id="' + cilleId + '"] [data-act="kick"]');
  await waitView(c2.page, 'msg');
  ok(await c2.page.evaluate(() => /fjernet dig/.test(document.getElementById('screen-live').textContent)), 'kicked player gets "Værten har fjernet dig"');
  await host.page.waitForFunction(() => document.querySelectorAll('.live-player').length === 2, null, { timeout: 8000 });
  await clickAct(c2.page, 'entry');
  await clickAct(c2.page, 'joinview');
  await waitView(c2.page, 'join');
  await c2.page.fill('#live-code', code);
  await clickAct(c2.page, 'join');
  await waitView(c2.page, 'room');
  await host.page.waitForFunction(() => document.querySelectorAll('.live-player').length === 3, null, { timeout: 8000 });

  await clickAct(host.page, 'start');
  const all = [host.page, c1.page, c2.page];
  for (const p of all) await p.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, { timeout: 10000 });
  ok((await Promise.all(all.map(p => p.evaluate(() => KOS.App.run.act.liveRace === true && KOS.App.run.inst.state.clock < 0)))).every(Boolean), 'start builds the live race on host and both clients, waiting for the gun');
  const ns = await Promise.all(all.map(p => p.evaluate(() => KOS.App.run.inst.state.clock)));
  ok(Math.max.apply(null, ns) - Math.min.apply(null, ns) <= 1, 'the shared start clock agrees within a second (' + ns.map(x => x.toFixed(1)).join(',') + ')');
  const errs = host.page.errs.concat(c1.page.errs, c2.page.errs);
  ok(errs.length === 0, 'no errors on any page (' + errs.join(' | ') + ')');
  await host.ctx.close(); await c1.ctx.close(); await c2.ctx.close();

  // ---------------------------------------------------------------- 5. "Kun vært"
  console.log('-- host only');
  const w = await newPage('area=race', 'Storskærm');
  await w.page.waitForSelector('.live-card', { timeout: 8000 });
  await w.page.click('.live-card');
  await waitView(w.page, 'entry');
  await clickAct(w.page, 'host');
  await waitView(w.page, 'setup');
  await w.page.click('#screen-live [data-act="role"][data-v="watch"]');
  await clickAct(w.page, 'create');
  await waitView(w.page, 'room');
  ok(await w.page.evaluate(() => KOS.Lobby.state.room.hostRole === 'watch' && document.querySelector('#screen-live [data-act="start"]').disabled), 'host-only: room created, Start needs a sailor');
  const wl = await w.page.evaluate(() => document.getElementById('live-link').textContent);
  const j = await newPage(wl.slice(wl.indexOf('#') + 1), 'Dan');
  await waitView(j.page, 'join'); await clickAct(j.page, 'join'); await waitView(j.page, 'room');
  await w.page.waitForFunction(() => !document.querySelector('#screen-live [data-act="start"]').disabled, null, { timeout: 8000 });
  ok(true, 'host-only: Start enabled with one sailor');
  await w.ctx.close(); await j.ctx.close();

  // ---------------------------------------------------------------- reload safety (the update prompt kicked a joiner out)
  console.log('-- reload: the joiner is back in the same room');
  {
    const h = await newPage('area=race', 'Vaert');
    await h.page.waitForSelector('.live-card', { timeout: 8000 });
    await h.page.click('.live-card');
    await waitView(h.page, 'entry'); await clickAct(h.page, 'host'); await waitView(h.page, 'setup');
    await h.page.evaluate(() => Object.assign(KOS.Lobby.state.cfg, { countdownS: 20 }));
    await clickAct(h.page, 'create'); await waitView(h.page, 'room');
    const code = await h.page.evaluate(() => document.getElementById('live-code-show').textContent);
    const link = await h.page.evaluate(() => document.getElementById('live-link').textContent);
    const a = await newPage(link.slice(link.indexOf('#') + 1), 'Ane');
    await waitView(a.page, 'join'); await clickAct(a.page, 'join'); await waitView(a.page, 'room');
    ok(await a.page.evaluate(() => KOS.MPStatus.busy() && !KOS.MPStatus.canAutoUpdate()), 'in a live room the update prompt must wait (busy)');
    ok(await a.page.evaluate(() => !!sessionStorage.getItem('kos.mp.pending') && !!sessionStorage.getItem('kos.mp.rejoin')), 'join intent and resume token are in sessionStorage');
    // 1. plain reload (hash has lost #join)
    await a.page.reload();
    await a.page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await waitView(a.page, 'room', 12000);
    ok(await a.page.evaluate(c => KOS.Lobby.state.room.code === c, code), 'reload: back in room ' + code + ' without any tap');
    await h.page.waitForFunction(() => document.querySelectorAll('.live-player').length === 2, null, { timeout: 8000 });
    ok(await h.page.evaluate(() => [...document.querySelectorAll('.live-player b')].some(b => /Ane/.test(b.textContent))), 'the host still sees the joiner');
    // 2. the whole URL hash is gone
    await a.page.goto(web.url + '#');
    await a.page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    ok(true, '(navigated to a bare URL)');
    await a.page.waitForTimeout(100);
    // no mp= override any more on this page: it cannot reach the test server, so only check the intent survived
    ok(await a.page.evaluate(() => !!sessionStorage.getItem('kos.mp.pending')), 'the pending join survives a bare-URL reload');
    await a.ctx.close();
    // 3. arriving via #join=CODE, the update is applied before the join: intent saved, reload, joined by itself
    const b = await newPage(link.slice(link.indexOf('#') + 1), 'Bo');
    await waitView(b.page, 'join');
    ok(await b.page.evaluate(() => KOS.MPStatus.keepForReload() === true && JSON.parse(sessionStorage.getItem('kos.mp.pending')).auto === true), 'keepForReload stores the code with auto');
    await b.page.reload();
    await b.page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await waitView(b.page, 'room', 12000);
    ok(await b.page.evaluate(c => KOS.Lobby.state.room.code === c, code), 'after the update reload the join continues straight into the room');
    // 4. mid-countdown: the seat is resumed (same id), the race screen comes back
    await h.page.waitForFunction(() => !document.querySelector('#screen-live [data-act="start"]').disabled, null, { timeout: 8000 });
    const idBefore = await b.page.evaluate(() => KOS.Lobby.state.sess.id);
    await clickAct(h.page, 'start');
    await b.page.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, { timeout: 15000 });
    await b.page.reload();
    await b.page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await b.page.waitForFunction(() => KOS.App.cur === 'play' && KOS.App.run.inst && KOS.App.run.inst.live, null, { timeout: 15000 });
    ok(await b.page.evaluate(i => KOS.App.run.host.live.myId === i && KOS.App.run.inst.state.clock < 0, idBefore), 'reload during the countdown: same seat, back in the race before the gun');
    ok(b.page.errs.length === 0 && h.page.errs.length === 0, 'no console errors (' + b.page.errs.concat(h.page.errs).join(' | ') + ')');
    await h.ctx.close(); await b.ctx.close();
  }

  // ---------------------------------------------------------------- Live is reachable without progress; first-time setup via link; update before the lobby
  console.log('-- live is always reachable (hub, title), first-time setup via link');
  {
    status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 };
    // a brand-new player (no progress at all, nothing unlocked): the hub and the title menu both have the entry
    const n = await newPage('screen=hub', 'Nyt');
    await n.page.waitForSelector('.hub-livebtn:not([hidden])', { timeout: 8000 });
    ok(await n.page.evaluate(() => KOS.Storage.totalStars() === 0), 'hub: the Live entry shows with 0 stars and nothing unlocked');
    if (process.env.SHOTS) { await n.page.setViewportSize({ width: 1000, height: 700 }); await n.page.waitForTimeout(1200); await n.page.screenshot({ path: process.env.SHOTS + 'live5-hub-entry.png' }); }
    await n.page.click('.hub-livebtn');
    await waitView(n.page, 'entry');
    ok(await n.page.evaluate(() => !document.querySelector('#screen-live [data-act="host"]').disabled), 'hub entry opens the Live lobby (host and join enabled)');
    // the host's boat picker offers every boat, not only the unlocked ones; the help level can be locked
    await clickAct(n.page, 'host'); await waitView(n.page, 'setup');
    ok(await n.page.evaluate(() => { const b = [...document.querySelectorAll('#screen-live [data-act="opt"][data-k="boat"]')].map(x => x.getAttribute('data-v')); return ['opti', 'hboat', 'j70', '29er'].every(x => b.indexOf(x) >= 0); }), 'host boat picker: all boats offered with no unlocks (H-boat, J/70, 29er ...)');
    await n.page.click('#screen-live [data-act="opt"][data-k="help"][data-v="locked"]');
    ok(await n.page.evaluate(() => KOS.Lobby.state.cfg.help === 'locked'), 'help level "Låst" can be chosen');
    await n.page.click('#screen-live [data-act="opt"][data-k="boat"][data-v="hboat"]');
    await clickAct(n.page, 'create'); await waitView(n.page, 'room');
    const code = await n.page.evaluate(() => document.getElementById('live-code-show').textContent);
    ok(await n.page.evaluate(() => KOS.Lobby.state.cfg.boat === 'hboat'), 'the host created an H-boat race without having unlocked it');
    const tt = await newPage('', 'Nyt2');
    n.page2 = tt.page;
    await tt.page.waitForSelector('.menu-live:not([hidden])', { timeout: 8000 });
    ok(true, 'title menu: the Live entry shows too');
    if (process.env.SHOTS) await tt.page.screenshot({ path: process.env.SHOTS + 'live5-title-entry.png' });

    // a brand-new phone arrives through the link: first the short setup, then the room, with the chosen name
    const f = await newPage('join=' + code, null, { noProfile: true });
    await f.page.waitForSelector('#screen-profile #pf-name', { timeout: 10000 });
    ok(await f.page.evaluate(() => !KOS.Storage.profile() && document.querySelectorAll('#screen-profile .panel').length === 1 && !document.querySelector('#screen-live:not([hidden])')), 'no profile: the short first-time setup comes first (one panel: name + age), not the lobby');
    if (process.env.SHOTS) { await f.page.setViewportSize({ width: 390, height: 780 }); await f.page.waitForTimeout(600); await f.page.screenshot({ path: process.env.SHOTS + 'live5-first-setup-phone.png' }); }
    await f.page.click('#screen-profile [data-act="save"]');
    ok(await f.page.evaluate(() => !KOS.Storage.profile()), 'an empty name is not accepted');
    await f.page.fill('#pf-name', 'Mia');
    await f.page.click('#screen-profile [data-act="save"]');
    await waitView(f.page, 'join');
    ok(await f.page.evaluate(c => document.getElementById('live-code').value === c && KOS.Storage.profile().name === 'Mia', code), 'after the setup the join screen has the code from the link and the profile name');
    await clickAct(f.page, 'join'); await waitView(f.page, 'room');
    ok(await f.page.evaluate(() => KOS.Lobby.state.room.players.some(p => p.name === 'Mia')), 'the room lists the new sailor under the chosen name (Mia)');
    ok(f.page.errs.length === 0, 'no errors in the first-time flow (' + f.page.errs.join(' | ') + ')');
    await f.ctx.close(); await n.ctx.close();
  }

  console.log('-- an update that is waiting is applied before the join, then the join continues');
  {
    // a real service worker: the page registers sw.js; then the served sw.js changes (a new version) and Live is opened through a link
    const hostP = await newPage('area=race', 'Vaert2');
    await hostP.page.waitForSelector('.live-card', { timeout: 8000 });
    await hostP.page.click('.live-card'); await waitView(hostP.page, 'entry'); await clickAct(hostP.page, 'host'); await waitView(hostP.page, 'setup');
    await clickAct(hostP.page, 'create'); await waitView(hostP.page, 'room');
    const code = await hostP.page.evaluate(() => document.getElementById('live-code-show').textContent);

    let swBump = ''; // sw.js served with a changed tail = a new version (page.route cannot see the worker script request)
    const web2 = await serve({ port: 0, transform: (rel, buf) => (rel === 'sw.js' && swBump ? Buffer.concat([buf, Buffer.from(swBump)]) : null) });
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, serviceWorkers: 'allow' });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push('pageerror ' + e.message));
    await page.route('**/mp-status.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }));
    await page.addInitScript(() => { try { if (!localStorage.getItem('kos.profile')) localStorage.setItem('kos.profile', JSON.stringify({ name: 'Ulla', sailNo: '7', avatar: null })); } catch (e) { /* ignore */ } });
    const ov = '&mp=' + encodeURIComponent(WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL);
    await page.goto(web2.url + '#screen=hub' + ov);
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!(r && r.active)), null, { timeout: 30000 });
    await page.reload();
    await page.waitForFunction(() => window.KOS && KOS.modesReady && !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    await page.evaluate(() => sessionStorage.removeItem('kos.mp.upd'));
    swBump = '\n// new version ' + Date.now() + '\n';
    // the link is opened in the already running app (a controlled page): a new worker is found, installed and applied by the open itself
    const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
    await page.evaluate(c => { KOS.MPStatus.open({ join: c, via: 'link' }); }, code);
    await nav;
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    ok(await page.evaluate(() => !!sessionStorage.getItem('kos.mp.upd')), 'a waiting update was applied before the lobby opened (the page reloaded once)');
    await waitView(page, 'room', 20000);
    ok(await page.evaluate(c => KOS.Lobby.state.room.code === c, code), 'after the update reload the join continued straight into room ' + code);
    ok(page.errs.length === 0, 'no errors (' + page.errs.join(' | ') + ')');
    // no update at all while sitting in the room: a worker that shows up now waits (no reload, no prompt)
    swBump = '\n// even newer ' + Date.now() + '\n';
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForTimeout(2500);
    ok(await page.evaluate(() => document.getElementById('screen-live').getAttribute('data-live-view') === 'room' && !document.querySelector('.toast-action, .toast [data-act]') && KOS.Lobby.state.sess.state === 'ok'), 'in the room: a newer version triggers no prompt and no reload');
    await ctx.close(); await hostP.ctx.close(); await web2.close();
  }

  console.log('-- version gate: a too-old build gets the kind update message; the button updates and the join continues');
  {
    const setSrv = (extra) => fs.writeFileSync(statusFile, JSON.stringify(Object.assign({ mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 }, extra || {})));
    const hostP = await newPage('area=race', 'Vaert4');
    await hostP.page.waitForSelector('.live-card', { timeout: 8000 });
    await hostP.page.click('.live-card'); await waitView(hostP.page, 'entry'); await clickAct(hostP.page, 'host'); await waitView(hostP.page, 'setup');
    await clickAct(hostP.page, 'create'); await waitView(hostP.page, 'room');
    const code = await hostP.page.evaluate(() => document.getElementById('live-code-show').textContent);
    ok(await hostP.page.evaluate(() => KOS.Lobby.state.room.players[0].v === KOS.BUILD.version && KOS.MP.LEVEL === 2), 'the host\'s room entry carries its game version (' + await hostP.page.evaluate(() => KOS.BUILD.version) + ') and the client protocol level is 2');

    // a real service worker, as in the update test above; the SERVER refuses (the public status file knows nothing about versions)
    let swBump = '';
    const web2 = await serve({ port: 0, transform: (rel, buf) => (rel === 'sw.js' && swBump ? Buffer.concat([buf, Buffer.from(swBump)]) : null) });
    const ctx = await browser.newContext({ viewport: { width: 900, height: 760 }, serviceWorkers: 'allow' });
    const page = await ctx.newPage();
    page.errs = []; page.sent = [];
    page.on('websocket', ws => ws.on('framesent', f => page.sent.push(String(f.payload))));
    page.on('pageerror', e => page.errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) page.errs.push('console ' + m.text()); });
    await page.route('**/mp-status.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }));
    await page.addInitScript(() => { try { if (!localStorage.getItem('kos.profile')) localStorage.setItem('kos.profile', JSON.stringify({ name: 'Gamle Gert', sailNo: '7', avatar: null })); } catch (e) { /* ignore */ } });
    const ov = '&mp=' + encodeURIComponent(WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL);
    await page.goto(web2.url + '#screen=hub' + ov);
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!(r && r.active)), null, { timeout: 30000 });
    await page.reload();
    await page.waitForFunction(() => window.KOS && KOS.modesReady && !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    await page.evaluate(() => { sessionStorage.removeItem('kos.mp.upd'); KOS.Storage.saveSettings({ sound: false, reducedMotion: true }); });
    setSrv({ minProto: 3 }); await page.waitForTimeout(500);
    await page.evaluate(c => { KOS.MPStatus.open({ join: c, via: 'link' }); }, code);
    await waitView(page, 'join');
    await clickAct(page, 'join');
    await waitView(page, 'msg');
    const hello = page.sent.map(f => { try { return JSON.parse(f); } catch (e) { return {}; } }).find(m => m.t === 'hello');
    ok(hello && hello.cp === 2 && typeof hello.ver === 'string' && hello.ver.length > 0 && 'sha' in hello, 'hello carries the version, sha and the protocol level (' + JSON.stringify(hello) + ')');
    const txt = await page.evaluate(() => document.querySelector('#screen-live .live-trainer-text').textContent);
    ok(txt === 'Der er kommet en ny version af spillet – opdater for at være med', 'a refused build gets the trainer\'s kind message in Danish (' + txt + ')');
    ok(await page.evaluate(() => !!document.querySelector('#screen-live [data-act="update"]') && !/Coach/.test(document.getElementById('screen-live').textContent)), 'the message has an update button and never says Coach');
    ok(await page.evaluate(() => !KOS.Lobby.state.sess), 'the refused connection is closed and no session is kept');
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + 'live6-update-required.png' });
    ok(page.errs.length === 0, 'no console/page errors on a refusal (' + page.errs.join(' | ') + ')');
    ok(srv.rooms.stats().rooms >= 1, 'the server is fine');

    // the button, but no newer version exists yet: the kind "close and reopen" note, no reload
    await clickAct(page, 'update');
    await page.waitForFunction(() => /Luk spillet/.test(document.querySelector('#screen-live .live-trainer-text').textContent), null, { timeout: 15000 });
    ok(true, 'update button without a newer version: the player is told what to do, nothing reloads');
    // a new version is out (sw.js changed) and the server minimum is met by it: the button updates, reloads and the join continues with the same code
    swBump = '\n// new version ' + Date.now() + '\n';
    setSrv({}); await page.waitForTimeout(500);
    const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
    await clickAct(page, 'update');
    await nav;
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    ok(await page.evaluate(() => !!sessionStorage.getItem('kos.mp.upd')), 'the update button applied the new version (skipWaiting + reload)');
    await waitView(page, 'room', 20000);
    ok(await page.evaluate(c => KOS.Lobby.state.room.code === c && KOS.Lobby.state.room.players.length === 2, code), 'after the update the join continued by itself into room ' + code);
    // the host sees both versions in the lobby (equal here: no warning), and a differing version gets the small warning
    await hostP.page.waitForFunction(() => document.querySelectorAll('.live-player .live-ver').length === 2, null, { timeout: 8000 });
    ok(await hostP.page.evaluate(() => [...document.querySelectorAll('.live-player .live-ver')].every(e => !e.classList.contains('is-diff'))), 'host lobby: both players show their version, same version = no warning');
    await hostP.page.evaluate(() => { const L = KOS.Lobby.state; const r = JSON.parse(JSON.stringify(L.room)); r.players[1].v = 'v0.8.3'; L.room = r; KOS.Lobby._render(document.getElementById('screen-live')); });
    ok(await hostP.page.evaluate(() => { const e = document.querySelectorAll('.live-player .live-ver'); return e[1].classList.contains('is-diff') && e[1].textContent.indexOf('v0.8.3') >= 0 && e[1].getAttribute('title').length > 5 && !e[0].classList.contains('is-diff'); }), 'a player on another version (v0.8.3) gets the small warning in the host lobby');
    await hostP.page.setViewportSize({ width: 900, height: 800 });
    if (process.env.SHOTS) await hostP.page.screenshot({ path: process.env.SHOTS + 'live6-host-lobby-versions.png' });
    ok(page.errs.length === 0 && hostP.page.errs.length === 0, 'no errors (' + page.errs.concat(hostP.page.errs).join(' | ') + ')');
    await ctx.close(); await hostP.ctx.close(); await web2.close();

    // the public status file can demand a newer build too: the phone is told before it connects (no WebSocket at all)
    status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12, minProto: 3 };
    const pre = await newPage('area=race', 'Gammel2');
    await pre.page.waitForSelector('.live-card', { timeout: 8000 });
    await pre.page.click('.live-card'); await waitView(pre.page, 'msg');
    ok(await pre.page.evaluate(() => window.__ws === 0 && !!document.querySelector('#screen-live [data-act="update"]')), 'public status minProto: the update message shows without any WebSocket');
    ok(pre.page.errs.length === 0, 'no errors (' + pre.page.errs.join(' | ') + ')');
    await pre.ctx.close();
    status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 };
    setSrv({});
  }

  console.log('-- rejoin prompt: a seat survives closing the page; yes goes back, no forgets it');
  {
    const hostP = await newPage('area=race', 'Vaert5');
    await hostP.page.waitForSelector('.live-card', { timeout: 8000 });
    await hostP.page.click('.live-card'); await waitView(hostP.page, 'entry'); await clickAct(hostP.page, 'host'); await waitView(hostP.page, 'setup');
    await clickAct(hostP.page, 'create'); await waitView(hostP.page, 'room');
    const code = await hostP.page.evaluate(() => document.getElementById('live-code-show').textContent);
    const jp = await newPage('area=race', 'Bent');
    await jp.page.waitForSelector('.live-card'); await jp.page.click('.live-card'); await waitView(jp.page, 'entry'); await clickAct(jp.page, 'joinview'); await waitView(jp.page, 'join');
    await jp.page.fill('#live-code', code); await clickAct(jp.page, 'join'); await waitView(jp.page, 'room');
    const myId = await jp.page.evaluate(() => KOS.Lobby.state.sess.id);
    const seat = await jp.page.evaluate(() => JSON.parse(localStorage.getItem('kos.mp.seat')));
    ok(seat && seat.code === code && seat.id === myId && typeof seat.key === 'string' && seat.key.length >= 8 && /\/ws$/.test(seat.url) && seat.exp > Date.now() + 100 * 60000 && seat.exp < Date.now() + 130 * 60000, 'localStorage keeps {code, id, key, server url, expiry about 2 h} while seated');
    const stored = await jp.ctx.storageState();
    await jp.ctx.close(); // the tab is closed / the app swiped away
    await hostP.page.waitForFunction(() => KOS.Lobby.state.room.players.some(p => p.lost), null, { timeout: 8000 });
    ok(true, 'the host sees the closed phone as lost, the seat is still there');

    // back with the same storage: the prompt (before any network), "yes" resumes the same seat
    let r = await newPage('', 'Bent', { storage: stored });
    await r.page.waitForSelector('.dialog .live-rejoin-body', { timeout: 8000 });
    ok(await r.page.evaluate(c => document.querySelector('.dialog .live-rejoin-body').textContent === 'Du er stadig med i løbet ' + c + ' – vil du tilbage?' && window.__ws === 0, code), 'the prompt asks "Du er stadig med i løbet ' + code + ' – vil du tilbage?" and nothing has touched the network yet');
    ok(await r.page.evaluate(() => [...document.querySelectorAll('.dialog .btn')].map(b => b.textContent.trim()).join('|') === 'Nej tak|Tilbage til løbet'), 'two buttons: Nej tak / Tilbage til løbet');
    if (process.env.SHOTS) await r.page.screenshot({ path: process.env.SHOTS + 'live6-rejoin-prompt.png' });
    await r.page.click('.dialog .btn-primary');
    await waitView(r.page, 'room', 15000);
    ok(await r.page.evaluate(id => KOS.Lobby.state.sess.id === id && KOS.Lobby.state.room.players.length === 2, myId), 'yes: the same seat is back in the lobby (no second player)');
    ok(await hostP.page.evaluate(() => KOS.Lobby.state.room.players.length === 2 && KOS.Lobby.state.room.players.every(p => !p.lost)), 'the host sees the player back');
    ok(r.page.errs.length === 0, 'no errors (' + r.page.errs.join(' | ') + ')');
    await r.ctx.close();

    // "no thanks": the entry is cleared, nothing connects, the next start does not ask again
    r = await newPage('', 'Bent', { storage: stored });
    await r.page.waitForSelector('.dialog .live-rejoin-body', { timeout: 8000 });
    await r.page.click('.dialog .btn-glass');
    await r.page.waitForFunction(() => !document.querySelector('.dialog .live-rejoin-body'));
    ok(await r.page.evaluate(() => localStorage.getItem('kos.mp.seat') === null && window.__ws === 0), 'no thanks: the entry is cleared and no connection was made');
    await r.page.reload(); await r.page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 }); await r.page.waitForTimeout(600);
    ok(await r.page.evaluate(() => !document.querySelector('.dialog .live-rejoin-body')), 'the next start does not ask again');
    await r.ctx.close();

    // an expired entry is never offered and is removed
    const old = JSON.parse(JSON.stringify(stored));
    for (const o of old.origins) for (const it of o.localStorage) if (it.name === 'kos.mp.seat') { const v = JSON.parse(it.value); v.exp = Date.now() - 1000; it.value = JSON.stringify(v); }
    r = await newPage('', 'Bent', { storage: old });
    await r.page.waitForTimeout(800);
    ok(await r.page.evaluate(() => !document.querySelector('.dialog .live-rejoin-body') && localStorage.getItem('kos.mp.seat') === null && window.__ws === 0), 'an expired entry is not offered, is removed, and no network is touched');
    await r.ctx.close();
    // a normal visit without any entry: no prompt, no network
    const clean = await newPage('', 'Frisk');
    await clean.page.waitForTimeout(600);
    ok(await clean.page.evaluate(() => !document.querySelector('.dialog') && window.__ws === 0), 'no entry: no prompt and still no WebSocket at startup');
    await clean.ctx.close(); await hostP.ctx.close();
  }

  // ---------------------------------------------------------------- live-rules spec B/C: open list + scheduled races
  {
    const WSM = require(path.join(ROOT, 'server', 'node_modules', 'ws'));
    // a phone of its own (its own IP via x-real-ip, so the per-IP schedule limit is not shared with the browser pages)
    const bot = (name, ip) => new Promise((res, rej) => {
      const ws = new WSM(WS, { headers: { 'x-real-ip': ip } });
      const waiters = [];
      ws.on('message', d => { const m = JSON.parse(String(d)); const i = waiters.findIndex(w => w.t.includes(m.t)); if (i >= 0) waiters.splice(i, 1)[0].fn(m); });
      const call = (msg, t) => new Promise(r => { waiters.push({ t, fn: r }); ws.send(JSON.stringify(msg)); });
      ws.on('open', () => call({ t: 'hello', v: 2, name, build: 'test', ver: 'dev', cp: 2 }, ['welcome', 'err']).then(() => res({ ws, call })));
      ws.on('error', rej);
    });
    const listOpen = async (page) => {
      await page.waitForSelector('.live-card', { timeout: 8000 }); await page.click('.live-card'); await waitView(page, 'entry');
      await clickAct(page, 'listview'); await waitView(page, 'list');
    };
    status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 };
    const inDays = (d, h, m) => { const x = new Date(Date.now() + d * 86400000); x.setHours(h, m || 0, 0, 0); return x.getTime(); };

    console.log('-- open list: render, refresh while open, empty state, join from the list');
    const anton = await bot('Anton', '10.9.0.1');
    const fri = await anton.call({ t: 'sched', cfg: { boat: 'opti', course: 'tri', windKn: 10, maxP: 12 }, title: 'friday', startAt: inDays(3, 18) }, ['scheduled', 'err']);
    ok(fri.t === 'scheduled' && /^[0-9a-f]{32}$/.test(fri.secret), 'seed: a scheduled Friday race (' + fri.code + ')');
    const mille = await bot('Mille', '10.9.0.2');
    const mRoom = await mille.call({ t: 'create', cfg: { boat: 'zest', vis: 'open', maxP: 8 }, hostRole: 'sail' }, ['created']);
    const priv = await bot('Hemmelig', '10.9.0.3');
    const pRoom = await priv.call({ t: 'create', cfg: { boat: 'zest' }, hostRole: 'sail' }, ['created']);
    const lp = await newPage('area=race', 'Liva');
    const roomsReq = []; lp.page.on('request', r => { if (/\/rooms$/.test(new URL(r.url()).pathname)) roomsReq.push(Date.now()); });
    await listOpen(lp.page);
    await lp.page.waitForSelector('#live-listbox .live-item', { timeout: 8000 });
    const rows = await lp.page.evaluate(() => [...document.querySelectorAll('#live-listbox .live-sect')].map(sec => ({ h: sec.querySelector('.live-h').textContent, items: [...sec.querySelectorAll('.live-item')].map(b => ({ code: b.getAttribute('data-code'), txt: b.textContent, dis: b.disabled })) })));
    ok(rows.length === 2 && /^Åbne løb \(\d+\)$/.test(rows[0].h) && rows[1].h === 'Planlagte løb (1)', 'two sections with a count each, the races you can join now first (' + rows.map(r => r.h).join(' / ') + ')');
    // review round 2: every card has the same four rows: title (one line) / status + sailors / class, course, wind / host
    ok(await lp.page.evaluate(() => [...document.querySelectorAll('#live-listbox .live-item')].every(b => [...b.children].map(c => c.className.split(' ')[0]).join() === 'live-item-name,live-item-top,live-item-bot,live-item-by')),
      'list cards: title / status + sailors / class, course, wind / host, in that order on every card');
    ok(await lp.page.evaluate(() => !!document.querySelector('#screen-live .screen-head [data-act="relist"]')), 'Refresh sits in the screen head');
    ok(rows[1] && rows[1].items.some(i => i.code === fri.code && /Fredagsræs/.test(i.txt) && /Planlagt/.test(i.txt) && /Vært: Anton/.test(i.txt) && /Optimist/.test(i.txt) && /Trekant/.test(i.txt) && /Åbner kl\./.test(i.txt)), 'the scheduled race shows title, "Planlagt <when>", host, class, course and its opening time');
    ok(rows[0] && rows[0].items.some(i => i.code === mRoom.code && /^Milles løb/.test(i.txt) && /Vært: Mille/.test(i.txt) && /I lobbyen/.test(i.txt) && /1\/8 sejlere/.test(i.txt) && /m\/s/.test(i.txt)),
      'the open lobby: "Milles løb", "Vært: Mille", "I lobbyen", players 1/8 and wind in the player\'s unit');
    ok(!rows.some(r => r.items.some(i => i.code === pRoom.code)), 'a private lobby is not listed');
    ok(await lp.page.evaluate(() => window.__ws) === 0 && roomsReq.length >= 1, 'the list comes over GET /rooms: no WebSocket is opened to show it');
    // the 10 s refresh while the list is open
    const ole = await bot('Ole', '10.9.0.4');
    const oRoom = await ole.call({ t: 'create', cfg: { boat: 'opti', vis: 'open', maxP: 4 }, hostRole: 'sail' }, ['created']);
    const t0 = Date.now();
    await lp.page.waitForFunction(c => !!document.querySelector('#live-listbox [data-code="' + c + '"]'), oRoom.code, { timeout: 14000 });
    ok(Date.now() - t0 < 13000, 'a new open lobby shows up by itself within one 10 s refresh (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    // join from the list = the same flow as a code
    await lp.page.click('#live-listbox [data-code="' + mRoom.code + '"]');
    await waitView(lp.page, 'room');
    ok(await lp.page.evaluate(c => KOS.Lobby.state.room.code === c && KOS.Lobby.state.room.players.length === 2, mRoom.code), 'tapping a list entry joins that room (2 sailors in Mille\'s lobby)');
    await clickAct(lp.page, 'leave'); await waitView(lp.page, 'entry');
    const nReq = roomsReq.length;
    await lp.page.waitForTimeout(11000);
    ok(roomsReq.length === nReq, 'no list requests once the list is closed (none in 11 s)');
    // the empty state
    await lp.page.route('**/rooms', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"rooms":[]}' }));
    await clickAct(lp.page, 'listview'); await waitView(lp.page, 'list');
    await lp.page.waitForSelector('#live-listbox .live-empty', { timeout: 8000 });
    ok(await lp.page.evaluate(() => /Ingen åbne løb lige nu – start dit eget eller planlæg et\./.test(document.querySelector('#live-listbox .live-empty').textContent) &&
      !!document.querySelector('#live-listbox [data-act="host"]') && !!document.querySelector('#live-listbox [data-act="planview"]')), 'empty list: the trainer says "Ingen åbne løb lige nu …" with host + schedule buttons');
    await lp.page.unroute('**/rooms');
    ok(lp.page.errs.length === 0, 'no errors in the list flow (' + lp.page.errs.join(' | ') + ')');
    await lp.ctx.close();

    console.log('-- host room at 320 px (review round 1): nothing wider than the screen');
    for (const lang of ['en', 'da']) {
      const hp = await newPage('area=race', 'Frederikke');
      await hp.page.setViewportSize({ width: 320, height: 568 });
      await hp.page.evaluate(l => KOS.I18n.setLang(l), lang);
      await hp.page.waitForSelector('.live-card', { timeout: 8000 }); await hp.page.click('.live-card'); await waitView(hp.page, 'entry');
      await clickAct(hp.page, 'host'); await waitView(hp.page, 'setup');
      await clickAct(hp.page, 'create'); await waitView(hp.page, 'room', 10000);
      await hp.page.waitForSelector('#screen-live [data-act="visroom"]');
      const over = await hp.page.evaluate(() => { const W = innerWidth, r = []; document.querySelectorAll('#screen-live *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && b.right > W + 0.5) r.push(e.tagName + '.' + e.className + ' ' + Math.round(b.right)); }); return r; });
      ok(over.length === 0, lang + ' 320x568 host room: no element past the right edge (' + over.slice(0, 4).join(', ') + ')');
      const chips = await hp.page.evaluate(() => [...document.querySelectorAll('#screen-live [data-act="visroom"]')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width)]; }));
      ok(chips.length === 2 && chips[0][0] === chips[1][0] && Math.abs(chips[0][1] - chips[1][1]) <= 1, lang + ': the two visibility chips share one row at equal width (' + JSON.stringify(chips) + ')');
      ok(hp.page.errs.length === 0, lang + ': no errors (' + hp.page.errs.join(' | ') + ')');
      await hp.ctx.close();
    }

    console.log('-- schedule a race: validation, private, my scheduled races (QR, reminder, cancel)');
    const pp = await newPage('area=race', 'Trine');
    await pp.page.waitForSelector('.live-card', { timeout: 8000 }); await pp.page.click('.live-card'); await waitView(pp.page, 'entry');
    await clickAct(pp.page, 'host'); await waitView(pp.page, 'setup');
    ok(await pp.page.evaluate(() => document.querySelectorAll('#screen-live [data-act="vis"]').length === 2 && document.querySelector('#screen-live [data-act="vis"][data-v="private"]').classList.contains('on')), 'host setup has the visibility setting, private by default');
    ok(await pp.page.evaluate(() => { const rows = [...document.querySelectorAll('#screen-live .live-form > .live-row')], vi = rows.findIndex(r => r.querySelector('[data-act="vis"]')), ci = rows.findIndex(r => r.querySelector('[data-k="course"]')); return ci >= 0 && vi === ci + 1; }),
      'review round 2: "Hvem kan være med" sits right under class and course');
    await pp.page.click('#screen-live [data-act="vis"][data-v="open"]');
    ok(await pp.page.evaluate(() => /Alle kan se dit navn og være med/.test(document.querySelector('#screen-live .live-vishint').textContent)), 'open: the hint says everyone can see your name');
    await pp.page.click('#screen-live [data-act="vis"][data-v="private"]');
    await clickAct(pp.page, 'planview'); await waitView(pp.page, 'plan');
    ok(await pp.page.evaluate(() => [...document.querySelectorAll('#screen-live [data-act="ptitle"]')].map(b => b.textContent).join('|') === 'Træningsløb|Fredagsræs|Klubmesterskab|Juleræs|Weekendræs' &&
      !document.querySelector('#screen-live input[type="text"], #screen-live textarea')), 'five preset race names and no free text field');
    ok(await pp.page.evaluate(() => document.querySelector('#screen-live [data-act="pvis"][data-v="open"]').classList.contains('on')), 'a scheduled race is listed (open) by default');
    ok(await pp.page.evaluate(() => { const d = document.getElementById('live-plan-day').value, tm = document.getElementById('live-plan-time').value; const at = new Date(d + 'T' + tm).getTime(); return at >= Date.now() + 10 * 60000 && document.getElementById('live-plan-when').textContent.length > 0 && !!document.getElementById('live-plan-when').closest('.live-plan-bar'); }),
      'the form opens on a time that can be used (never already too soon), the summary in the bar with the button');
    const setWhen = (ms) => pp.page.evaluate(ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); const day = document.getElementById('live-plan-day'), tm = document.getElementById('live-plan-time');
      day.value = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); tm.value = p(d.getHours()) + ':' + p(d.getMinutes()); tm.dispatchEvent(new Event('change')); }, ms);
    const ws0 = await pp.page.evaluate(() => window.__ws);
    await setWhen(Date.now() + 3 * 60000); await clickAct(pp.page, 'plan');
    ok(await pp.page.evaluate(() => /mindst 10 minutter/.test(document.getElementById('live-plan-err').textContent) && /mindst 10 minutter/.test(document.getElementById('live-plan-err2').textContent)), 'a time 3 min ahead: "mindst 10 minutter fra nu" (at the pickers and above the button)');
    await setWhen(Date.now() + 15 * 86400000); await clickAct(pp.page, 'plan');
    ok(await pp.page.evaluate(() => /højst planlægge 14 dage/.test(document.getElementById('live-plan-err').textContent)), '15 days ahead: "højst planlægge 14 dage frem"');
    await pp.page.evaluate(() => { document.getElementById('live-plan-time').value = ''; document.getElementById('live-plan-time').dispatchEvent(new Event('change')); });
    await clickAct(pp.page, 'plan');
    ok(await pp.page.evaluate(() => /både dag og tidspunkt/.test(document.getElementById('live-plan-err').textContent)), 'no time: "Vælg både dag og tidspunkt"');
    ok(await pp.page.evaluate(() => window.__ws) === ws0, 'a form that fails validation sends nothing');
    const at = inDays(2, 17, 30);
    await setWhen(at);
    ok(await pp.page.evaluate(() => /kl\. 17\.30 · Åbner kl\. 17\.15/.test(document.getElementById('live-plan-when').textContent)), 'the form says when it starts and when it opens (' + await pp.page.evaluate(() => document.getElementById('live-plan-when').textContent) + ')');
    await pp.page.click('#screen-live [data-act="ptitle"][data-v="weekend"]');
    await pp.page.click('#screen-live [data-act="pvis"][data-v="private"]');
    ok(await pp.page.evaluate(() => !document.querySelector('#screen-live [data-k="maxP"]') && !document.querySelector('#screen-live [data-k="windKn"]')), 'wind and the less common options wait behind "Flere valg"');
    await clickAct(pp.page, 'pmore');
    await pp.page.click('#screen-live [data-act="opt"][data-k="maxP"][data-v="4"]');
    ok(await pp.page.evaluate(() => !!document.querySelector('#screen-live [data-k="windKn"]') && /Færre valg/.test(document.querySelector('#screen-live [data-act="pmore"]').textContent)), '"Flere valg" shows wind, max sailors, penalties and contact');
    await clickAct(pp.page, 'plan');
    await waitView(pp.page, 'mine', 10000);
    const st = await pp.page.evaluate(() => JSON.parse(localStorage.getItem('kos.liveSched') || 'null'));
    const mine = st && st[0];
    ok(Array.isArray(st) && st.length === 1 && /^[ACDEFGHJKMNPRTUVWXY34679]{4}$/.test(mine.code) && /^[0-9a-f]{32}$/.test(mine.secret) && mine.title === 'weekend' && mine.startAt === at && mine.opensAt === at - 15 * 60000,
      'KOS.Storage liveSched keeps {code, secret, title, startAt, opensAt} (' + (mine && mine.code) + ')');
    const e = mine && srv.rooms.sched.get(mine.code);
    ok(!!e && e.title === 'weekend' && e.startAt === at && e.cfg.vis === 'private' && e.cfg.maxP === 4 && e.hostName === 'Trine', 'the server stores the race: title id, start, private, max 4, host nickname');
    ok(await pp.page.evaluate(c => { const it = document.querySelector('.live-mitem[data-code="' + c + '"]'); return !!it && /Weekendræs/.test(it.textContent) && /Kun med kode/.test(it.textContent) && !it.querySelector('.live-qr svg'); }, mine.code), 'my scheduled races: title, code, "Kun med kode"; the QR waits behind its button');
    await pp.page.click('#screen-live [data-act="mqr"][data-code="' + mine.code + '"]');
    ok(await pp.page.evaluate(c => !!document.querySelector('.live-mitem[data-code="' + c + '"] .live-qr svg'), mine.code), '"QR-kode" shows the QR code');
    ok(await pp.page.evaluate(c => { const it = document.querySelector('.live-mitem[data-code="' + c + '"]'); const b = it.querySelector('[data-act="mcancel"]'); return !!b && !b.closest('.live-mbtns') && b.getBoundingClientRect().height >= 44; }, mine.code), '"Aflys" sits on its own line, away from the other buttons, 44 px tall');
    ok(await pp.page.evaluate(() => !document.querySelector('#screen-live [data-act="mgo"]')), 'not open yet: no "Gå til løbet" button');
    const listed = await (await fetch(web.url.replace(/\/$/, '').replace(/:\d+$/, '') + ':' + port + '/rooms')).json();
    ok(!listed.rooms.some(r => r.code === mine.code), 'a private scheduled race is not in the open list');
    // "Påmind mig": a calendar file made in the browser
    const [dl] = await Promise.all([pp.page.waitForEvent('download', { timeout: 8000 }), pp.page.click('#screen-live [data-act="mremind"][data-code="' + mine.code + '"]')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    const z = new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    ok(/\.ics$/.test(dl.suggestedFilename()) && /^BEGIN:VCALENDAR\r\n/.test(ics) && ics.indexOf('DTSTART:' + z) > 0 && /SUMMARY:Weekendræs/.test(ics) && ics.indexOf(mine.code) > 0 && /TRIGGER:-PT15M/.test(ics) && /END:VCALENDAR\r\n$/.test(ics),
      '"Påmind mig" downloads an .ics with the start (UTC), the title, the code and a 15 min alarm');
    ok(ics.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75) && /\r\n /.test(ics), 'the .ics lines are folded at 75 UTF-8 octets (RFC 5545), æ/ø/å and the dash included');
    // the entry shows the button with a count
    await pp.page.click('#screen-live .screen-head [data-act="back"]'); await waitView(pp.page, 'entry');
    ok(await pp.page.evaluate(() => { const b = document.querySelector('#screen-live [data-act="mineview"]'); return !!b && b.textContent === 'Mine planlagte løb (1)'; }), 'the entry shows "Mine planlagte løb (1)"');
    await clickAct(pp.page, 'mineview'); await waitView(pp.page, 'mine');
    // cancel
    await pp.page.click('#screen-live [data-act="mcancel"][data-code="' + mine.code + '"]');
    await pp.page.waitForSelector('.dialog .btn-danger', { timeout: 5000 });
    ok(await pp.page.evaluate(() => /Aflys Weekendræs/.test(document.querySelector('.dialog').textContent)), 'cancel asks first ("Aflys Weekendræs …?")');
    await pp.page.click('.dialog .btn-danger');
    await pp.page.waitForFunction(() => !document.querySelector('.live-mitem'), null, { timeout: 8000 });
    ok(!srv.rooms.sched.has(mine.code) && await pp.page.evaluate(() => JSON.parse(localStorage.getItem('kos.liveSched')).length === 0), 'cancelled on the server and forgotten on the phone');
    ok(await pp.page.evaluate(() => /ingen planlagte løb/.test(document.getElementById('screen-live').textContent)), 'my scheduled races: the empty text');
    ok(pp.page.errs.length === 0, 'no errors in the schedule flow (' + pp.page.errs.join(' | ') + ')');
    if (process.env.SHOTS) await pp.page.screenshot({ path: process.env.SHOTS + 'live-mine-empty.png' });
    await pp.ctx.close();

    console.log('-- #live=CODE for a race that is not open yet, a server-run scheduled room, the creator takes the host seat');
    const wp = await newPage('live=' + fri.code, 'Wilma');
    await waitView(wp.page, 'join');
    ok(await wp.page.evaluate(c => document.getElementById('live-code').value === c && location.hash.indexOf('live=') < 0, fri.code), '#live=CODE opens the join screen with the code (and leaves the hash)');
    await clickAct(wp.page, 'join');
    await waitView(wp.page, 'wait');
    ok(await wp.page.evaluate(() => { const x = document.getElementById('screen-live').textContent; return /Fredagsræs – [^:]+: åbner kl\. 17\.45 · starter kl\. 18\.00\./.test(x) && (x.match(/nov|dec|jan|feb|mar|apr|maj|jun|jul|aug|sep|okt/g) || []).length <= 1 && /Åbner om \d+ (t|dage)/.test(x) && /Siden går selv ind i løbet, når det åbner\./.test(x); }),
      'not open yet: "Fredagsræs – <day>: åbner kl. 17.45 · starter kl. 18.00." (the date once), a countdown and "Siden går selv ind …"');
    ok(await wp.page.evaluate(() => /Tjek om løbet er åbent/.test(document.querySelector('#screen-live [data-act="waitjoin"]').textContent)), 'the button says what it does: "Tjek om løbet er åbent"');
    ok(await wp.page.evaluate(() => !!document.querySelector('#screen-live [data-act="remind"]') && !KOS.Lobby.state.sess), 'the wait card offers "Påmind mig" and holds no connection');
    ok(wp.page.errs.length === 0, 'no errors (' + wp.page.errs.join(' | ') + ')');
    await wp.ctx.close();
    // review round 2: a phone whose clock is 40 min fast counts down to the server's opensAt (the notopen error carries the server time)
    const fast = await newPage('live=' + fri.code, 'Frida', { clockMs: 40 * 60000 });
    await waitView(fast.page, 'join'); await clickAct(fast.page, 'join'); await waitView(fast.page, 'wait');
    ok(await fast.page.evaluate(() => { const w = KOS.Lobby.state.wait, el = document.querySelector('#screen-live .live-waitleft [data-until]');
      return Math.abs(w.skew + 40 * 60000) < 5000 && +el.getAttribute('data-until') === Math.round(w.opensAt - w.skew); }),
      'clock 40 min fast: the countdown and the join tries use opensAt on the phone\'s clock (opensAt - skew)');
    await fast.ctx.close();

    // a race 11 min ahead opens at once (startAt - 15 min) as a lobby without a host
    const maria = await bot('Maria', '10.9.0.5');
    const soon = await maria.call({ t: 'sched', cfg: { boat: 'zest', course: 'wl', maxP: 8 }, title: 'train', startAt: Date.now() + 11 * 60000 }, ['scheduled', 'err']);
    maria.ws.close();
    const rp = await newPage('area=race', 'Rasmus');
    await rp.page.waitForFunction(c => true, null);
    await listOpen(rp.page);
    await rp.page.waitForSelector('#live-listbox [data-code="' + soon.code + '"]', { timeout: 8000 });
    ok(await rp.page.evaluate(c => { const b = document.querySelector('#live-listbox [data-code="' + c + '"]'); return /Træningsløb/.test(b.textContent) && /Starter om (10|11):/.test(b.textContent) && !b.disabled; }, soon.code), 'an opened scheduled race is listed with its title and "Starter om 10:xx"');
    await rp.page.click('#live-listbox [data-code="' + soon.code + '"]');
    await waitView(rp.page, 'room');
    ok(await rp.page.evaluate(() => { const x = document.getElementById('screen-live'); return x.querySelector('.screen-head h1').textContent === 'Træningsløb' && /starter af sig selv/.test(x.textContent) && /Starter om \d+:\d\d/.test(x.querySelector('.live-schedin').textContent) && !x.querySelector('[data-act="start"]'); }),
      'the server-run room: title, "Løbet starter af sig selv …" with a countdown, no start button');
    ok(await rp.page.evaluate(() => { const top = document.querySelector('#screen-live .live-schedtop'), room = document.querySelector('#screen-live .live-room');
      return !!top && !!top.querySelector('.live-schedin') && !!top.querySelector('[data-act="leave"]') && !!(top.compareDocumentPosition(room) & Node.DOCUMENT_POSITION_FOLLOWING) && !document.querySelector('#screen-live .live-qr svg'); }),
      'a waiting sailor sees the schedule card (countdown + "Forlad") first; the QR is behind a button');
    await rp.page.setViewportSize({ width: 320, height: 568 }); await rp.page.waitForTimeout(200);
    ok(await rp.page.evaluate(() => { const r = document.querySelector('#screen-live .live-schedtop').getBoundingClientRect(); return r.bottom <= innerHeight; }), '320x568: the countdown and "Forlad" are visible without scrolling');
    await rp.page.setViewportSize({ width: 1000, height: 800 });
    // the creator (Maria's phone) joins with the secret from "Mine planlagte løb" and becomes host
    const cp = await newPage('area=race', 'Maria');
    await cp.page.evaluate(x => KOS.Storage.set('liveSched', [x]), { code: soon.code, secret: soon.secret, title: soon.title, startAt: soon.startAt, opensAt: soon.opensAt, boat: 'zest', course: 'wl', wind: 10, maxP: 8, vis: 'open', url: WS });
    await cp.page.waitForSelector('.live-card', { timeout: 8000 }); await cp.page.click('.live-card'); await waitView(cp.page, 'entry');
    await clickAct(cp.page, 'mineview'); await waitView(cp.page, 'mine');
    ok(await cp.page.evaluate(() => /Løbet er åbent nu!/.test(document.getElementById('screen-live').textContent) && !!document.querySelector('#screen-live [data-act="mgo"]')), 'my scheduled race is open: "Løbet er åbent nu!" and "Gå til løbet"');
    await clickAct(cp.page, 'mgo');
    await waitView(cp.page, 'room');
    ok(await cp.page.evaluate(() => KOS.Lobby.state.sess.role === 'host' && /Start løbet nu/.test(document.querySelector('#screen-live [data-act="start"]').textContent)), 'the creator takes the host seat with the secret and may start early');
    await rp.page.waitForFunction(() => /Venter på værten/.test(document.getElementById('screen-live').textContent), null, { timeout: 8000 });
    ok(true, 'the other sailor now waits for the host');
    // the creator cancels from the room's own lobby: everybody gets the kind message
    await clickAct(cp.page, 'leave'); await waitView(cp.page, 'entry');
    await rp.page.waitForFunction(() => /starter af sig selv/.test(document.getElementById('screen-live').textContent), null, { timeout: 8000 });
    ok(true, 'the creator leaves: the room is server-run again');
    await clickAct(cp.page, 'mineview'); await waitView(cp.page, 'mine');
    await cp.page.click('#screen-live [data-act="mcancel"]'); await cp.page.waitForSelector('.dialog .btn-danger'); await cp.page.click('.dialog .btn-danger');
    await waitView(rp.page, 'msg', 8000);
    ok(await rp.page.evaluate(() => /Løbet er aflyst\./.test(document.getElementById('screen-live').textContent)), 'the sailor in the opened room is told "Løbet er aflyst."');
    ok(rp.page.errs.length === 0 && cp.page.errs.length === 0, 'no errors (' + rp.page.errs.concat(cp.page.errs).join(' | ') + ')');
    await rp.ctx.close(); await cp.ctx.close();

    console.log('-- kill switch: closed hides the list and scheduling, my races stay visible');
    status = { mode: 'closed', message: 'Pause i dag.', maxRooms: 10, maxPlayers: 12 };
    const kp = await newPage('area=race', 'Kim');
    await kp.page.evaluate(x => KOS.Storage.set('liveSched', [x]), { code: fri.code, secret: fri.secret, title: 'friday', startAt: fri.startAt, opensAt: fri.opensAt, boat: 'opti', course: 'tri', wind: 10, maxP: 12, vis: 'open', url: WS });
    await kp.page.waitForSelector('.live-card', { timeout: 8000 }); await kp.page.click('.live-card'); await waitView(kp.page, 'entry');
    ok(await kp.page.evaluate(() => !document.querySelector('#screen-live [data-act="listview"]') && !!document.querySelector('#screen-live [data-act="mineview"]')), 'closed: no "Find et løb", "Mine planlagte løb" is still there');
    await clickAct(kp.page, 'mineview'); await waitView(kp.page, 'mine');
    ok(await kp.page.evaluate(() => !document.querySelector('#screen-live [data-act="planview"]') && !!document.querySelector('.live-mitem')), 'closed: my race is shown, "Planlæg til senere" is not');
    await kp.ctx.close();
    status = { mode: 'on', message: '', maxRooms: 10, maxPlayers: 12 };
    [anton, mille, priv, ole].forEach(b => { try { b.ws.close(); } catch (x) { /* ignore */ } });
  }

  await browser.close();
  await srv.close();
  await web.close();
  console.log('\nliveclient: ' + checks + ' checks, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
