// KØS SEJL — live race client tests (suite 'liveclient'). Headless Chromium against a locally started race server;
// the status file is served through page.route so every state (on / closed / hidden / missing) can be tested.
//   - startup and a normal hub/race-area visit touch no WebSocket and no /mp* URL; server OFF => no entry, no errors
//   - closed => greyed entry with the message, host/join disabled; on + unreachable => the trainer's kind message + AI race button
//   - host creates (code, link, QR), two clients join via link and via code, player list, kick, start -> countdown arrives
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
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.errs = []; page.mpReqs = [];
    page.on('pageerror', e => page.errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) page.errs.push('console ' + m.text()); });
    page.on('request', r => { if (/\/mp[-/]/.test(new URL(r.url()).pathname)) page.mpReqs.push(r.url()); });
    await page.route('**/mp-status.json', route => (status ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }) : route.fulfill({ status: 404, body: '' })));
    await page.addInitScript(() => {
      window.__ws = 0; const W = window.WebSocket;
      window.WebSocket = function (u, p) { window.__ws++; return new W(u, p); }; window.WebSocket.prototype = W.prototype;
      Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    });
    const ov = opts.noOverride ? '' : 'mp=' + encodeURIComponent(opts.ws || WS) + '&mpstatus=' + encodeURIComponent(STATUS_URL);
    await page.goto(web.url + '#' + [hash, ov].filter(Boolean).join('&'));
    await page.waitForFunction(() => window.KOS && KOS.modesReady, null, { timeout: 30000 });
    if (name) await page.evaluate(n => { KOS.Storage.saveProfile({ name: n, sailNo: '7', avatar: null }); KOS.Storage.saveSettings({ sound: false, reducedMotion: true }); }, name);
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

  await browser.close();
  await srv.close();
  await web.close();
  console.log('\nliveclient: ' + checks + ' checks, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
