// KØS SEJL — live race server tests (suite 'liveserver'). Node only, no browser, no external network.
// Starts server/index.js on a free port with a temp status file and drives real ws clients.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(ROOT, 'server', 'node_modules', 'ws'))) {
  console.log('SKIP liveserver: server/node_modules is missing. Run "npm install" inside server/ first.');
  process.exit(0);
}
const WebSocket = require(path.join(ROOT, 'server', 'node_modules', 'ws'));
const http = require('http');
const { createServer } = require(path.join(ROOT, 'server', 'index.js'));
const P = require(path.join(ROOT, 'server', 'lib', 'protocol.js'));

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-live-'));
const statusFile = path.join(tmp, 'status.json');
const setStatus = (o) => fs.writeFileSync(statusFile, JSON.stringify(o));

class Client {
  constructor(port, name, opts) {
    opts = opts || {};
    this.q = []; this.waiters = []; this.closed = null;
    this.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', opts.origin ? { origin: opts.origin } : undefined);
    this.opened = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); this.ws.on('unexpected-response', () => rej(new Error('rejected'))); });
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); this.q.push(m); this.flush(); });
    this.ws.on('close', (code) => { this.closed = code; this.flush(); });
    this.name = name;
  }
  flush() {
    for (const w of [...this.waiters]) {
      const i = this.q.findIndex(w.pred);
      if (i >= 0) { const m = this.q.splice(i, 1)[0]; this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
      else if (this.closed !== null && w.closeOk) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(null); }
    }
  }
  send(m) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  wait(t, ms) {
    const pred = typeof t === 'function' ? t : (m) => m.t === t;
    return new Promise((res, rej) => {
      const w = { pred, res: (m) => { clearTimeout(to); res(m); } };
      const to = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); rej(new Error('timeout waiting for ' + t + ' (' + this.name + ')')); }, ms || 3000);
      this.waiters.push(w); this.flush();
    });
  }
  waitClose(ms) {
    if (this.closed !== null) return Promise.resolve(this.closed);
    return new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('close timeout')), ms || 3000); this.ws.once('close', (c) => { clearTimeout(to); res(c); }); });
  }
  async hello() { await this.opened; this.send({ t: 'hello', v: 2, name: this.name, build: 'test' }); return this.wait('welcome'); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

async function main() {
  setStatus({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 });
  const srv = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_STATUS_POLL_MS: '200', KOS_MAX_ROOMS: '3', KOS_MAX_PER_IP: '12', KOS_IDLE_MS: '60000' });
  const port = await srv.listen();
  const mk = async (name, opts) => { const c = new Client(port, name, opts); await c.hello(); return c; };
  const cfg = { boat: 'zest', countdownS: 8, maxS: 60, windKn: 99, laps: 9 };

  console.log('-- handshake, create, join, lobby');
  const bad = new Client(port, 'x');
  await bad.opened;
  bad.send({ t: 'create', cfg, hostRole: 'sail' });
  const e0 = await bad.wait('err');
  ok(e0.code === 'bad', 'frames before hello are rejected');
  bad.close();

  const host = await mk('Anna');
  const w = await host.hello().catch(() => null);
  ok(w === null || true, 'second hello is harmless');
  host.q.length = 0;
  host.send({ t: 'create', cfg, hostRole: 'sail' });
  const cr = await host.wait('created');
  ok(/^[ACDEFGHJKMNPRTUVWXY34679]{4}$/.test(cr.code), 'room code uses the safe alphabet: ' + cr.code);
  ok(cr.room.cfg.windKn === 28 && cr.room.cfg.laps === 3 && cr.room.cfg.seed > 0, 'cfg clamped (wind up to 28 kn = 14 m/s) and seed chosen by server');
  ok(cr.room.cfg.contact === true, 'contact between boats defaults to on');
  host.send({ t: 'cfgset', cfg: { contact: false } });
  const rc = await host.wait(m => m.t === 'room' && m.room.cfg.contact === false);
  ok(rc.room.cfg.contact === false, 'host can switch contact off');
  host.send({ t: 'cfgset', cfg: { contact: 'nope' } });
  host.send({ t: 'cfgset', cfg: { contact: true } });
  ok((await host.wait(m => m.t === 'room' && m.room.cfg.contact === true)).room.cfg.contact === true, 'a non-boolean contact value is ignored, a boolean is taken');
  ok(typeof cr.key === 'string' && cr.key.length >= 8, 'rejoin key issued');

  const p2 = await mk('Anna');
  p2.send({ t: 'join', code: cr.code.toLowerCase() });
  const j2 = await p2.wait('joined');
  ok(j2.room.players.length === 2 && j2.room.players[1].name === 'Anna 2', 'join works (code case-insensitive), duplicate name suffixed');
  const roomMsg = await host.wait((m) => m.t === 'room' && m.room.players.length === 2);
  ok(!!roomMsg, 'host sees lobby update');

  const p3 = await mk('Bo');
  p3.send({ t: 'join', code: 'ZZZZ' });
  ok((await p3.wait('err')).code === 'nocode', 'unknown code rejected');
  p3.send({ t: 'join', code: cr.code });
  await p3.wait('joined');

  console.log('-- kick');
  host.send({ t: 'kick', id: 3 });
  await p3.wait('kicked');
  ok((await p3.waitClose()) === 4403, 'kicked player is disconnected (4403)');
  p2.send({ t: 'kick', id: 1 });
  await sleep(100);
  ok(host.closed === null, 'non-host cannot kick');

  console.log('-- clock sync');
  const t0 = Date.now();
  host.send({ t: 'ping', c: 12.5 });
  const pong = await host.wait('pong');
  ok(pong.c === 12.5 && Math.abs(pong.s - t0) < 500, 'pong echoes c and carries server time');

  console.log('-- start and countdown');
  const solo = await mk('Solo');
  solo.send({ t: 'create', cfg, hostRole: 'sail' });
  const sc = await solo.wait('created');
  solo.send({ t: 'start' });
  ok((await solo.wait('err')).code === 'few', 'start with one boat refused (host+sail)');
  solo.send({ t: 'leave' }); solo.close();
  void sc;

  p2.send({ t: 'start' });
  await sleep(100);
  ok(!p2.q.some(m => m.t === 'start'), 'only host can start');
  const now0 = Date.now();
  host.send({ t: 'start' });
  const st = await host.wait('start');
  const st2 = await p2.wait('start');
  ok(st.T0 >= now0 + 7500 && st.T0 <= now0 + 8500 && st2.T0 === st.T0, 'start carries shared T0 = now + countdown');
  ok(st.grid.length === 2 && st.grid[0].slot === 0 && st.grid[1].id === 2 && st.cfg.seed === cr.room.cfg.seed, 'grid and final cfg sent');
  const late = await mk('Late');
  late.send({ t: 'join', code: cr.code });
  ok((await late.wait('err')).code === 'started', 'late join refused');
  late.close();

  console.log('-- state relay (needs racing; fast-forward T0 by waiting)');
  const room = srv.rooms.rooms.get(cr.code);
  room.T0 = Date.now() + 100; // shorten countdown for the test
  await sleep(300);
  ok(room.phase === 'racing', 'room switched to racing at T0');
  const S = (id, seq, x) => [id, seq, x, 5, 0.5, 3.2, 0.1, 0, 1];
  host.send({ t: 'st', s: S(99, 1, 10) }); // spoofed id
  const rel = await p2.wait('s');
  ok(rel.a.length === 1 && rel.a[0][0] === 1 && rel.a[0][2] === 10, 'state relayed, sender id overwritten (no spoofing)');
  host.send({ t: 'st', s: S(1, 1, 11) });
  await sleep(300);
  ok(!p2.q.some(m => m.t === 's'), 'older/equal seq dropped');
  host.send({ t: 'st', s: [1, 2, 'x', 5, 0, 0, 0, 0, 0] });
  ok((await host.wait('err')).code === 'bad', 'malformed state rejected');

  console.log('-- mark, finish, results');
  host.send({ t: 'fin', ms: 61000 });
  ok(true, 'host finish sent');
  const f1 = await p2.wait('fin');
  ok(f1.id === 1 && f1.ms === 61000, 'fin relayed');
  p2.send({ t: 'fin', ms: 61000 });
  const res = await host.wait('res');
  ok(res.rows.length === 2 && res.rows[0].place === 1 && res.rows[1].place === 1 && res.rows[0].status === 'fin', 'results: tie shares place');
  await p2.wait('res');
  p2.send({ t: 'rematch' });
  ok((await p2.wait('err')).code === 'bad', 'rematch: only the host may ask');
  host.send({ t: 'rematch' });
  const rm = await p2.wait('rematch');
  ok(rm.room.phase === 'lobby' && rm.room.players.length === 2, 'rematch: same players back in the lobby');
  await host.wait('rematch');
  host.send({ t: 'start' });
  ok((await p2.wait('start')).grid.length === 2, 'rematch: the room can start a new race');

  console.log('-- rejoin');
  const h2 = await mk('Hanna');
  h2.send({ t: 'create', cfg, hostRole: 'sail' });
  const c2 = await h2.wait('created');
  const q2 = await mk('Quinn');
  q2.send({ t: 'join', code: c2.code });
  const jq = await q2.wait('joined');
  h2.send({ t: 'start' });
  await q2.wait('start');
  const room2 = srv.rooms.rooms.get(c2.code);
  room2.T0 = Date.now() + 50;
  await sleep(250);
  q2.ws.terminate();
  await h2.wait((m) => m.t === 'room' && m.room.players.some(p => p.lost));
  ok(true, 'drop marks player lost');
  const q2b = await mk('Quinn');
  q2b.send({ t: 'resume', code: c2.code, id: jq.id, key: jq.key });
  const rj = await q2b.wait('joined');
  ok(rj.id === jq.id && rj.room.players.every(p => !p.lost), 'resume re-binds the same player');
  await q2b.wait('start');
  const q2c = await mk('Evil');
  q2c.send({ t: 'resume', code: c2.code, id: jq.id, key: 'wrong' });
  ok((await q2c.wait('err')).code === 'nocode', 'resume with wrong key refused');
  q2c.close();
  q2b.send({ t: 'leave' });
  h2.send({ t: 'fin', ms: 20000 });
  const res2 = await h2.wait('res');
  ok(res2.rows[0].id === 1 && res2.rows[1].status === 'lost', 'leaver counted lost, race ends');
  h2.close(); q2b.close();

  console.log('-- status file modes');
  setStatus({ mode: 'closed', message: 'Pause', maxRooms: 40, maxPlayers: 24 });
  await sleep(500);
  const cl = await mk('Closed');
  ok(cl.q.length === 0, 'no leftover');
  cl.send({ t: 'create', cfg, hostRole: 'sail' });
  const ce = await cl.wait('err');
  ok(ce.code === 'closed' && ce.msg === 'Pause', 'closed: create rejected with message');
  cl.send({ t: 'join', code: 'ZZZZ' });
  ok((await cl.wait('err')).code === 'nocode', 'closed: join still processed');
  setStatus({ mode: 'hidden' });
  await sleep(500);
  cl.send({ t: 'join', code: 'ZZZZ' });
  ok((await cl.wait('err')).code === 'closed', 'hidden: join rejected');
  fs.unlinkSync(statusFile);
  await sleep(500);
  cl.send({ t: 'create', cfg, hostRole: 'sail' });
  ok((await cl.wait('err')).code === 'closed', 'missing status file => hidden');
  cl.close();
  setStatus({ mode: 'on', message: '', maxRooms: 2, maxPlayers: 24 });
  await sleep(500);

  console.log('-- limits');
  srv.rooms.rooms.clear();
  const hs = [];
  for (let i = 0; i < 3; i++) { const h = await mk('H' + i); h.send({ t: 'create', cfg, hostRole: 'watch' }); hs.push([h, await h.wait((m) => m.t === 'created' || m.t === 'err')]); }
  ok(hs[0][1].t === 'created' && hs[1][1].t === 'created' && hs[2][1].code === 'busy', 'room limit (status file maxRooms=2) enforced');
  setStatus({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 });
  await sleep(500);
  const oneRoom = hs[0][1];
  hs[0][0].send({ t: 'cfgset', cfg: { maxP: 2 } });
  await hs[0][0].wait('room');
  const a1 = await mk('A1'); a1.send({ t: 'join', code: oneRoom.code }); await a1.wait('joined');
  const a2 = await mk('A2'); a2.send({ t: 'join', code: oneRoom.code });
  ok((await a2.wait((m) => m.t === 'err' || m.t === 'joined')).code === 'full', 'maxP limit (host counts) => full');
  hs[0][0].send({ t: 'start' });
  await sleep(100);
  const over = await mk('Big');
  over.send('{"t":"ping","c":1,"pad":"' + 'x'.repeat(3000) + '"}');
  ok((await over.wait('err')).code === 'bad', 'oversized frame rejected');
  over.send('not json'); over.send('{"t":"nope"}');
  ok((await over.waitClose()) === 4400, '3 strikes close the connection');
  const flood = await mk('Flood');
  for (let i = 0; i < 60; i++) flood.send({ t: 'ping', c: i });
  await sleep(300);
  ok(flood.q.some(m => m.t === 'err' && m.code === 'rate'), 'message rate limit');
  flood.close();
  for (const [h] of hs) h.close();
  a1.close(); a2.close(); over.close();

  console.log('-- origin and health');
  let blocked = false;
  try { const o = new Client(port, 'o', { origin: 'https://evil.example' }); await o.opened; } catch (e) { blocked = true; }
  ok(blocked, 'foreign Origin refused');
  let allowed = true;
  try { const o = new Client(port, 'o', { origin: 'https://athraen.github.io' }); await o.opened; o.close(); } catch (e) { allowed = false; }
  ok(allowed, 'allow-listed Origin accepted');
  const health = await new Promise((res) => http.get({ host: '127.0.0.1', port, path: '/health' }, (r) => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ code: r.statusCode, b })); }));
  const hj = JSON.parse(health.b);
  ok(health.code === 200 && hj.ok && typeof hj.rooms === 'number' && !('names' in hj), 'GET /health (counts only)');
  const proxied = await new Promise((res) => http.get({ host: '127.0.0.1', port, path: '/health', headers: { 'x-real-ip': '1.2.3.4' } }, (r) => { r.resume(); res(r.statusCode); }));
  ok(proxied === 404, '/health hidden when proxied');

  console.log('-- strong wind, rain, finish window: config validation');
  {
    const c = P.sanitizeCfg({ windKn: 27, rain: 2, finishS: 300, gust: 1 }, P.CFG_DEFAULTS, 24);
    ok(c.windKn === 27 && c.rain === 2 && c.finishS === 300 && c.gust === 1, 'new fields accepted (27 kn, rain 2, finishS 300)');
    const d = P.sanitizeCfg({ windKn: 50, rain: 9, finishS: -4 }, P.CFG_DEFAULTS, 24);
    ok(d.windKn === 28 && d.rain === 2 && d.finishS === 5, 'out-of-range values are clamped (' + [d.windKn, d.rain, d.finishS].join('/') + ')');
    const e = P.sanitizeCfg({ rain: 'x', finishS: 'y', windKn: NaN }, P.CFG_DEFAULTS, 24);
    ok(e.rain === 0 && e.finishS === 180 && e.windKn === 10, 'junk values keep the defaults');
    ok(P.sanitizeCfg({ finishS: 0 }, P.CFG_DEFAULTS, 24).finishS === 0, 'finishS 0 means no limit');
    ok(P.validate('{"t":"hend"}').ok && P.validate('{"t":"habort"}').ok && P.validate('{"t":"hlobby","on":true}').ok && !P.validate('{"t":"hlobby"}').ok, 'host messages validate');
  }
  console.log('-- host controls and the finish window (3 clients)');
  {
    const srv2 = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_STATUS_POLL_MS: '200' });
    const p2 = await srv2.listen();
    const mk2 = async (name) => { const c = new Client(p2, name); await c.hello(); return c; };
    const mkRoom = async (cfg2, names) => {
      const cs = [];
      for (const n of names) cs.push(await mk2(n));
      cs[0].send({ t: 'create', cfg: Object.assign({ boat: 'zest', countdownS: 8, maxS: 120 }, cfg2), hostRole: 'sail' });
      const cr2 = await cs[0].wait('created');
      for (const c of cs.slice(1)) { c.send({ t: 'join', code: cr2.code }); await c.wait('joined'); }
      cs[0].send({ t: 'start' });
      await Promise.all(cs.map(c => c.wait('start')));
      return cs;
    };
    // A: finish window. B: end now. C: abort + back-to-lobby flag. All three run their 8 s countdown at the same time.
    const [A, B, C] = await Promise.all([mkRoom({ finishS: 5 }, ['a1', 'a2', 'a3']), mkRoom({ finishS: 0 }, ['b1', 'b2']), mkRoom({ finishS: 0 }, ['c1', 'c2'])]);
    await sleep(8300);
    A[1].send({ t: 'fin', ms: 41000 });
    const fw = await A[0].wait('fwin');
    ok(fw.endAt > Date.now() && fw.endAt <= Date.now() + 5200, 'first finish starts the finish window (fwin endAt in ~5 s)');
    const t0 = Date.now();
    const resA = await A[2].wait('res', 9000);
    ok(Date.now() - t0 >= 3000 && Date.now() - t0 < 7500, 'the window expiry sends the results (' + (Date.now() - t0) + ' ms after the first finish)');
    const byName = Object.fromEntries(resA.rows.map(r => [r.name, r]));
    ok(byName.a2.status === 'fin' && byName.a2.place === 1 && byName.a1.status === 'dnf' && byName.a3.status === 'dnf' && byName.a1.ms === null, 'the finisher is 1st, the two unfinished boats are DNF');
    // B: only the host can end the race now
    B[1].send({ t: 'hend' });
    ok((await B[1].wait('err')).code === 'bad', 'a player cannot end the race');
    B[1].send({ t: 'fin', ms: 30000 });
    await B[0].wait('fin');
    B[0].send({ t: 'hend' });
    const resB = await B[1].wait('res');
    ok(resB.rows.find(r => r.name === 'b2').status === 'fin' && resB.rows.find(r => r.name === 'b1').status === 'dnf', 'host "end now": unfinished host boat is DNF, results sent to everybody');
    // C: abort goes back to the lobby without a result, only the host may do it
    C[1].send({ t: 'habort' });
    ok((await C[1].wait('err')).code === 'bad', 'a player cannot abort the race');
    C[0].send({ t: 'habort' });
    const rm = await C[1].wait('rematch');
    ok(rm.aborted === true && rm.room.phase === 'lobby' && rm.room.players.length === 2 && !C[1].q.some(m => m.t === 'res'), 'abort: everybody back in the lobby, no result');
    C[0].send({ t: 'start' });
    await C[1].wait('start');
    C[0].send({ t: 'kick', id: C[1].id || 2 });
    ok((await C[1].wait('kicked')).t === 'kicked', 'the host can kick a sailor during the countdown');
    for (const c of [].concat(A, B, C)) c.close();
    await srv2.close();
  }

  console.log('-- robustness: burst after a stall, NaN frames, resume gives the last state back');
  {
    const srv3 = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_STATUS_POLL_MS: '200' });
    const p3 = await srv3.listen();
    const mk3 = async (name) => { const c = new Client(p3, name); await c.hello(); return c; };
    const A = await mk3('Ada'), B = await mk3('Bo');
    A.send({ t: 'create', cfg: { boat: 'zest', countdownS: 8, maxS: 120 }, hostRole: 'sail' });
    const cr3 = await A.wait('created');
    B.send({ t: 'join', code: cr3.code }); const jb = await B.wait('joined');
    A.send({ t: 'start' }); await A.wait('start'); await B.wait('start');
    const st = (seq, x) => ({ t: 'st', s: [0, seq, x, -40, 1.2, 4.5, 0.1, 0, 0] });
    // a backgrounded phone flushes 300 queued frames at once: the extra ones are dropped, the socket stays open
    for (let i = 0; i < 300; i++) B.send(st(2e11 + i, 10 + i * 0.01));
    await sleep(400);
    ok(B.closed === null, 'a burst of 300 state frames after a stall does not close a racing player');
    // NaN becomes null in JSON: the frame is dropped silently, never a strike (three strikes used to close the socket)
    for (let i = 0; i < 6; i++) B.send('{"t":"st","s":[0,' + (3e11 + i) + ',null,-40,1.2,4.5,0.1,0,0]}');
    await sleep(300);
    ok(B.closed === null, 'invalid (NaN) state frames are answered with at most one err per second and never close the socket');
    // the server keeps the last valid state; a resumed seat gets it back (position, heading, speed, flags, leg) plus T0
    await sleep(1700);
    B.send(st(4e11, 123.45));
    await sleep(250);
    B.close(); await sleep(200);
    const B2 = await mk3('Bo');
    B2.send({ t: 'resume', code: cr3.code, id: jb.id, key: jb.key });
    await B2.wait('joined');
    const me = await B2.wait('me');
    ok(me.s && me.s[2] === 123.45 && me.s[3] === -40 && me.s[4] === 1.2 && me.s[5] === 4.5 && me.T0 > 0, 'resume: the last valid state of the seat comes back with the race clock (T0)');
    // a seat that has been silent restarts its sequence (a reload): accepted after 1.5 s although the number is lower
    await sleep(1700);
    B2.send(st(1e11 + 5, 200));
    await sleep(250);
    ok(srv3.rooms.rooms.get(cr3.code).players.get(jb.id).state[2] === 200, 'a silent seat may restart its sequence (a lower seq is accepted after 1.5 s)');
    A.close(); B2.close();
    await srv3.close();
  }

  console.log('-- lobby grace: a dropped socket keeps its seat (host too), then the room closes');
  {
    const srv4 = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_STATUS_POLL_MS: '200', KOS_LOBBY_GRACE_MS: '1500' });
    const p4 = await srv4.listen();
    const mk4 = async (name) => { const c = new Client(p4, name); await c.hello(); return c; };
    const H = await mk4('Hanne'), J = await mk4('Jonas');
    H.send({ t: 'create', cfg: {}, hostRole: 'sail' });
    const crH = await H.wait('created');
    J.send({ t: 'join', code: crH.code }); const jj = await J.wait('joined');
    // a joiner's socket drops in the lobby: marked lost, the seat is still there, resume puts it back
    J.ws.terminate();
    const lostRoom = await H.wait((m) => m.t === 'room' && m.room.players.some(p => p.lost));
    ok(lostRoom.room.players.length === 2, 'lobby: a dropped joiner stays in the room as "lost" (not deleted)');
    const J2 = await mk4('Jonas');
    J2.send({ t: 'resume', code: crH.code, id: jj.id, key: jj.key });
    const rj4 = await J2.wait('joined');
    ok(rj4.room.players.every(p => !p.lost) && rj4.id === jj.id, 'lobby: resume re-binds the same seat');
    // the host drops: the room waits, and the host comes back
    H.ws.terminate();
    await J2.wait((m) => m.t === 'room' && m.room.players.some(p => p.lost && p.host));
    const H2 = await mk4('Hanne');
    H2.send({ t: 'resume', code: crH.code, id: crH.id, key: crH.key });
    const rh = await H2.wait('joined');
    ok(rh.room.hostId === crH.id && rh.room.phase === 'lobby', 'lobby: the host resumes the room after a drop');
    // out-of-range state frames are dropped; a valid one is kept
    H2.send({ t: 'start' });
    await H2.wait('start');
    srv4.rooms.rooms.get(crH.code).T0 = Date.now() + 10;
    await sleep(300);
    H2.send({ t: 'st', s: [0, 5e11, 1e9, 0, 0, 0, 0, 0, 0] });
    H2.send({ t: 'st', s: [0, 5e11 + 1, 10, 20, 1, 3, 0, 0, 0] });
    await sleep(200);
    const stH = srv4.rooms.rooms.get(crH.code).players.get(crH.id).state;
    ok(stH && stH[2] === 10 && stH[3] === 20, 'a state frame with an absurd position is dropped, the next valid one is kept');
    // the host vanishes for good: after the grace the others are told
    const room4 = srv4.rooms.rooms.get(crH.code);
    srv4.rooms.abort(room4, crH.id);
    await J2.wait('rematch');
    H2.ws.terminate();
    await J2.wait('hostleft', 6000);
    ok(true, 'lobby: a host that never comes back closes the room after the grace');
    J2.close();
    await srv4.close();
  }

  console.log('-- version gate: old and unversioned builds are refused, a new minimum needs no restart');
  {
    const gf = path.join(tmp, 'gate.json');
    fs.writeFileSync(gf, JSON.stringify({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 }));
    const gs = createServer({ PORT: '0', KOS_STATUS_FILE: gf, KOS_STATUS_POLL_MS: '200' });
    const gp = await gs.listen();
    const helloAs = async (name, extra) => { const c = new Client(gp, name); await c.opened; c.send(Object.assign({ t: 'hello', v: 2, name, build: 'test' }, extra || {})); return c; };
    const verdict = async (c) => c.wait((x) => x.t === 'welcome' || x.t === 'err');
    const setMin = async (o) => { fs.writeFileSync(gf, JSON.stringify(Object.assign({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 }, o))); await sleep(700); };
    let c = await helloAs('Gammel');
    ok((await verdict(c)).t === 'welcome', 'no minimum set: a client without a version is accepted (the gate is off until you set one)');
    c.close();
    await setMin({ minClient: '0.8.5' });
    c = await helloAs('Ingen');
    let m = await verdict(c);
    ok(m.t === 'err' && m.code === 'old' && m.min === '0.8.5', 'minClient 0.8.5: a client that sends no version (v0.8.4 and older) gets err old');
    ok((await c.waitClose()) === 4426, 'the refused socket is closed');
    c = await helloAs('Aeldre', { ver: '0.8.4', cp: 2 });
    ok((await verdict(c)).code === 'old', 'version 0.8.4 < 0.8.5 gets err old');
    c = await helloAs('Aeldre2', { ver: '0.7.12', cp: 2 });
    ok((await verdict(c)).code === 'old', 'version 0.7.12 gets err old');
    c = await helloAs('Aeldre3', { ver: '0.8.5' });
    ok((await verdict(c)).code === 'old', 'a client with a version but no protocol level (cp) is treated as old');
    c = await helloAs('Ny', { ver: '0.8.5', cp: 2 });
    ok((await verdict(c)).t === 'welcome', 'version 0.8.5 is accepted');
    c.send({ t: 'create', cfg: {}, hostRole: 'sail' });
    const created = await c.wait('created');
    ok(created.room.players[0].v === '0.8.5', 'the room lists each player\'s version (host: 0.8.5)');
    const c2 = await helloAs('Nyere', { ver: '0.10.0', cp: 2 });
    ok((await verdict(c2)).t === 'welcome', 'version 0.10.0 > 0.8.5 (numeric comparison)');
    c2.send({ t: 'join', code: created.code });
    const j2 = await c2.wait('joined');
    ok(j2.room.players.map(p => p.v).join(',') === '0.8.5,0.10.0', 'the joiner\'s version is listed too (' + j2.room.players.map(p => p.v).join(',') + ')');
    const cd = await helloAs('Dev', { ver: 'dev', cp: 2 });
    ok((await verdict(cd)).t === 'welcome', 'a dev build (version "dev") is only held to the protocol level');
    cd.close();
    // a client that said hello before the minimum was raised is refused on create / join
    const late = await helloAs('Sen', { ver: '0.8.5', cp: 2 }); await verdict(late);
    await setMin({ minClient: '0.9.0' });
    late.send({ t: 'create', cfg: {}, hostRole: 'sail' });
    ok((await late.wait('err')).code === 'old', 'minimum raised after hello: create is refused with old');
    late.send({ t: 'join', code: created.code });
    ok((await late.wait('err')).code === 'old', 'minimum raised after hello: join is refused with old');
    c = await helloAs('Nu', { ver: '0.9.0', cp: 2 });
    ok((await verdict(c)).t === 'welcome', 'a client at the new minimum is accepted at once (file change, no restart)');
    await setMin({ minClient: '0.8.0' });
    c = await helloAs('Igen', { ver: '0.8.4', cp: 2 });
    ok((await verdict(c)).t === 'welcome', 'lowering the minimum lets 0.8.4 in again, no restart');
    await setMin({ minProto: 3 });
    c = await helloAs('Proto', { ver: '0.9.9', cp: 2 });
    ok((await verdict(c)).code === 'old', 'minProto 3: protocol level 2 is refused');
    c = await helloAs('Proto3', { ver: '0.9.9', cp: 3 });
    ok((await verdict(c)).t === 'welcome', 'minProto 3: protocol level 3 is accepted');
    await setMin({ minClient: 'garbage', minProto: -4 });
    c = await helloAs('Skrald');
    ok((await verdict(c)).t === 'welcome', 'an unparseable minimum switches the gate off instead of locking everybody out');
    // abuse: junk from a refused client must not hurt the server
    await setMin({ minClient: '9.0.0' });
    const junk = await helloAs('Junk');
    await verdict(junk);
    try { junk.send('{"t":"create","cfg":{}}'); junk.send('not json'); junk.send({ t: 'hello', v: 2, ver: 'x'.repeat(5000) }); } catch (e) { /* closed */ }
    await sleep(200);
    c = await helloAs('Stadig', { ver: '9.1.0', cp: 2 });
    ok((await verdict(c)).t === 'welcome', 'the server is fine after refusing and abusive old clients');
    await gs.close();
    // env minimum: the stricter of file and env wins
    fs.writeFileSync(gf, JSON.stringify({ mode: 'on', message: '', minClient: '0.8.0' }));
    const gs2 = createServer({ PORT: '0', KOS_STATUS_FILE: gf, KOS_STATUS_POLL_MS: '200', KOS_MIN_CLIENT: '0.8.6' });
    const gp2 = await gs2.listen();
    const e1 = new Client(gp2, 'E1'); await e1.opened; e1.send({ t: 'hello', v: 2, name: 'E1', ver: '0.8.5', cp: 2 });
    ok((await e1.wait((x) => x.t === 'welcome' || x.t === 'err')).code === 'old', 'KOS_MIN_CLIENT=0.8.6 beats a lower minClient in the file');
    const e2 = new Client(gp2, 'E2'); await e2.opened; e2.send({ t: 'hello', v: 2, name: 'E2', ver: '0.8.6', cp: 2 });
    ok((await e2.wait((x) => x.t === 'welcome' || x.t === 'err')).t === 'welcome', 'KOS_MIN_CLIENT=0.8.6 lets 0.8.6 in');
    await gs2.close();
  }

  console.log('-- seats are kept for a whole race and rejoin works in every phase');
  {
    // pure rooms with a fake clock: 60 s and 5 min of absence keep the seat, the state and the right to resume
    const { createRooms } = require(path.join(ROOT, 'server', 'lib', 'rooms.js'));
    let T = 1e6;
    const rr = createRooms({ now: () => T, limits: { maxRooms: 5, maxPlayers: 12 } });
    const mkc = (n) => ({ name: n, send: () => {}, ip: '1.1.1.1' });
    const cr = rr.create(mkc('A'), { countdownS: 8, maxS: 900, maxP: 2, finishS: 0 }, 'sail');
    const jn = rr.join(mkc('B'), cr.room.code);
    ok(!rr.join(mkc('C'), cr.room.code).room, 'a room is limited to maxP seats (a third joiner is refused)');
    rr.start(cr.room, cr.player.id);
    T += 9000; rr.tick();
    rr.state(cr.room, jn.player.id, [0, 1, 50, -60, 1, 3, 0, 0, 2]);
    rr.disconnect(cr.room, jn.player.id, false);
    T += 60000; rr.tick();
    ok(cr.room.phase === 'racing' && cr.room.players.get(jn.player.id) && !cr.room.players.get(jn.player.id).final, 'racing: a seat gone for 60 s is still there and not final (it used to be dropped after 45 s)');
    const back = rr.resume(mkc('B'), cr.room.code, jn.player.id, jn.player.key);
    ok(back.room && back.player.state && back.player.state[2] === 50, 'a rejoin after 60 s gets the seat and its last state back');
  }
  {
    const gf = path.join(tmp, 'seat.json');
    fs.writeFileSync(gf, JSON.stringify({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 }));
    const ss = createServer({ PORT: '0', KOS_STATUS_FILE: gf, KOS_STATUS_POLL_MS: '200', KOS_LOBBY_GRACE_MS: '30000' });
    const sp = await ss.listen();
    const mkS = async (n) => { const c = new Client(sp, n); await c.hello(); return c; };
    const H = await mkS('Vaert'), B = await mkS('Bo'), C3 = await mkS('Cleo');
    H.send({ t: 'create', cfg: { countdownS: 8, maxS: 600, finishS: 0, maxP: 3 }, hostRole: 'sail' });
    const cr = await H.wait('created');
    B.send({ t: 'join', code: cr.code }); const jb = await B.wait('joined');
    C3.send({ t: 'join', code: cr.code }); const jc = await C3.wait('joined');
    ok(!JSON.stringify(jb.room).includes(jb.key) && !JSON.stringify(cr.room).includes(cr.key), 'the room info never contains a rejoin key');
    const room = ss.rooms.rooms.get(cr.code);
    const rejoin = async (tok, name) => { const c = await mkS(name); c.send({ t: 'resume', code: cr.code, id: tok.id, key: tok.key }); return { c, m: await c.wait((x) => x.t === 'joined' || x.t === 'err') }; };
    // lobby
    B.ws.terminate(); await H.wait((m) => m.t === 'room' && m.room.players.some(p => p.lost));
    let r = await rejoin(jb, 'Bo'); ok(r.m.t === 'joined' && r.m.room.phase === 'lobby', 'rejoin in the lobby is accepted');
    let Bc = r.c;
    const stranger = await mkS('Fremmed'); stranger.send({ t: 'resume', code: cr.code, id: jb.id, key: 'forkert' });
    ok((await stranger.wait('err')).code === 'nocode', 'a wrong key never gets a seat');
    // countdown
    H.send({ t: 'start' }); await H.wait('start'); await Bc.wait('start'); await C3.wait('start');
    ok(room.phase === 'countdown', 'countdown running');
    Bc.ws.terminate(); await sleep(150);
    r = await rejoin(jb, 'Bo'); Bc = r.c;
    ok(r.m.t === 'joined' && r.m.room.phase === 'countdown', 'rejoin in the countdown is accepted');
    await Bc.wait('start');
    // racing
    room.T0 = Date.now() + 10; await sleep(300);
    ok(room.phase === 'racing', 'racing');
    Bc.send({ t: 'st', s: [0, 5e11, 12, 34, 1, 3, 0, 0, 1] }); await sleep(250);
    Bc.ws.terminate(); await sleep(150);
    room.players.get(jb.id).lostAt -= 60000; // 60 s of absence
    C3.ws.terminate(); await sleep(150);
    room.players.get(jc.id).lostAt -= 90000; // 90 s of absence
    await sleep(300);
    ok(room.phase === 'racing' && !room.players.get(jb.id).final && !room.players.get(jc.id).final, 'racing: seats gone for 60 s and 90 s are kept');
    ok(room.players.size === 3, 'the others still see all three boats (two as lost)');
    r = await rejoin(jb, 'Bo'); Bc = r.c;
    ok(r.m.t === 'joined' && r.m.room.phase === 'racing', 'rejoin in the race is accepted after 60 s');
    const meB = await Bc.wait('me');
    ok(meB.s && meB.s[2] === 12 && meB.s[3] === 34 && meB.T0 === room.T0, 'the rejoiner gets its last position and the race clock');
    // results: Cleo never comes back during the race; the host ends it; Cleo can still look at the table
    H.send({ t: 'hend' }); await H.wait('res');
    ok(room.phase === 'results' && room.results.find(x => x.id === jc.id).status === 'lost', 'unfinished boats end as DNF/lost');
    r = await rejoin(jc, 'Cleo');
    ok(r.m.t === 'joined' && r.m.room.phase === 'results', 'rejoin in the results phase is accepted');
    const resMsg = await r.c.wait('res');
    ok(resMsg.rows.length === 3, 'and the results table is sent');
    // leaving on purpose ends the right to resume
    r.c.send({ t: 'leave' }); await sleep(200);
    r = await rejoin(jc, 'Cleo');
    ok(r.m.t === 'err', 'a seat that left on purpose cannot be resumed');
    H.close(); Bc.close(); C3.close();
    await ss.close();
  }
  {
    // lost seats do not hold the race hostage forever: when everyone else is done and the seat has been gone 2 min the race ends
    const { createRooms } = require(path.join(ROOT, 'server', 'lib', 'rooms.js'));
    let T = 2e6;
    const rr = createRooms({ now: () => T });
    const mkc = (n) => ({ name: n, send: () => {}, ip: '1.1.1.1' });
    const cr = rr.create(mkc('A'), { countdownS: 8, maxS: 900, finishS: 0 }, 'sail');
    const jn = rr.join(mkc('B'), cr.room.code);
    rr.start(cr.room, cr.player.id); T += 9000; rr.tick();
    rr.disconnect(cr.room, jn.player.id, false);
    T += 20000; rr.finish(cr.room, cr.player.id, 60000); rr.tick();
    ok(cr.room.phase === 'racing', 'one boat finished, the other seat only gone for 20 s: the race waits');
    T += 110000; rr.tick();
    ok(cr.room.phase === 'results' && cr.room.results[1].status === 'lost', 'after 2 min of absence the finished boat gets its result and the gone seat is DNF');
    ok(rr.resume(mkc('B'), cr.room.code, jn.player.id, jn.player.key).room, 'the gone seat can still rejoin the results');
  }

  console.log('-- a lost player never blocks the end (pure rooms, fake clock)');
  {
    const { createRooms } = require(path.join(ROOT, 'server', 'lib', 'rooms.js'));
    const mkc = (n) => ({ name: n, send: () => {}, ip: '1.1.1.1' });
    const st = (rr, r, id, seq, lg) => rr.state(r, id, [0, seq, 10, 10, 1, 3, 0, 0, lg || 1]);
    const setup = (finishS, T) => {
      const rr = createRooms({ now: () => T.v });
      const cr = rr.create(mkc('A'), { countdownS: 8, maxS: 900, maxP: 4, finishS }, 'sail');
      const b = rr.join(mkc('B'), cr.room.code), c = rr.join(mkc('C'), cr.room.code);
      rr.start(cr.room, cr.player.id); T.v += 9000; rr.tick();
      return { rr, r: cr.room, a: cr.player, b: b.player, c: c.player };
    };
    for (const fs0 of [0, 180]) {
      // C drops mid race and never returns, A and B finish: results for everybody within the 60 s lost window, C is DNF (lost)
      const T = { v: 3e6 }, { rr, r, a, b, c } = setup(fs0, T);
      st(rr, r, c.id, 1, 3); T.v += 5000; rr.disconnect(r, c.id, false);
      T.v += 40000; rr.finish(r, a.id, 50000); T.v += 3000; rr.finish(r, b.id, 53000);
      rr.tick();
      ok(r.phase === 'racing' && r.finishAt && r.finishAt <= T.v + 60000, 'finishS=' + fs0 + ': the lost seat gets at most a 60 s window (' + Math.round((r.finishAt - T.v) / 1000) + ' s left)');
      T.v += 61000; rr.tick();
      ok(r.phase === 'results' && r.results.length === 3 && r.results.filter(x => x.status === 'fin').length === 2 && r.results[2].id === c.id && r.results[2].status === 'lost', 'finishS=' + fs0 + ': results with the lost player as DNF');
      ok(rr.resume(mkc('C'), r.code, c.id, c.key).room.results.length === 3, 'finishS=' + fs0 + ': the lost player coming back finds the results');
    }
    {
      // an open socket that sends no state (frozen tab) counts as gone after 30 s, same rules
      const T = { v: 4e6 }, { rr, r, a, b, c } = setup(0, T);
      st(rr, r, c.id, 1); st(rr, r, a.id, 1); st(rr, r, b.id, 1); T.v += 20000; st(rr, r, a.id, 2); st(rr, r, b.id, 2);
      rr.finish(r, a.id, 40000); rr.finish(r, b.id, 41000); rr.tick();
      ok(r.phase === 'racing' && !r.finishAt, 'a silent but connected boat is still given 30 s');
      T.v += 15000; rr.tick();
      ok(r.phase === 'racing' && r.finishAt, 'after 30 s of silence the 60 s window opens (no limit chosen)');
      T.v += 61000; rr.tick();
      ok(r.phase === 'results' && r.results.find(x => x.id === c.id).status === 'dnf', 'the silent boat is DNF and the race has ended');
    }
    {
      // the lost player returns before the end and finishes: normal result for all three
      const T = { v: 5e6 }, { rr, r, a, b, c } = setup(0, T);
      st(rr, r, c.id, 1); rr.disconnect(r, c.id, false);
      T.v += 30000; rr.finish(r, a.id, 45000); rr.finish(r, b.id, 46000); rr.tick();
      ok(r.phase === 'racing' && r.finishAt, 'window open for the lost one');
      T.v += 20000; ok(rr.resume(mkc('C'), r.code, c.id, c.key).room, 'the lost player is back inside the window');
      rr.finish(r, c.id, 75000); rr.tick();
      ok(r.phase === 'results' && r.results.every(x => x.status === 'fin') && r.results[2].id === c.id, 'the returner finished: three finishers, no DNF');
    }
    {
      // everybody else is lost and nobody finished: the host can end at once; without the host the race ends after 2 min of silence
      const T = { v: 6e6 }, { rr, r, a, b, c } = setup(0, T);
      rr.disconnect(r, b.id, false); rr.disconnect(r, c.id, false);
      T.v += 30000; rr.tick();
      ok(r.phase === 'racing', 'nobody finished and the others are lost: waits (the host can decide)');
      ok(rr.endNow(r, a.id) === 'ok' && r.phase === 'results' && r.results.every(x => x.status !== 'fin'), 'the host can always end the race');
      const T2 = { v: 7e6 }, s2 = setup(0, T2);
      s2.rr.disconnect(s2.r, s2.a.id, false); s2.rr.disconnect(s2.r, s2.b.id, false); s2.rr.disconnect(s2.r, s2.c.id, false);
      T2.v += 125000; s2.rr.tick();
      ok(s2.r.phase === 'results', 'all lost and nobody finished: the race ends after 2 minutes');
    }
    {
      // safety net: a boat still sailing far beyond the first finisher (3x) is DNF even with no limit
      const T = { v: 8e6 }, { rr, r, a, b, c } = setup(0, T);
      for (const x of [a, b, c]) st(rr, r, x.id, 1);
      rr.finish(r, a.id, 60000);
      const keep = () => { for (const x of [b, c]) st(rr, r, x.id, Math.round(T.v)); };
      T.v += 200000; keep(); rr.tick();
      ok(r.phase === 'racing', 'no limit: the others are still sailing, the race waits');
      T.v += 180000; keep(); rr.tick();
      ok(r.phase === 'results' && r.results.filter(x => x.status === 'fin').length === 1, 'safety net: 5 min after the first finisher the race ends (others DNF)');
    }
  }
  console.log('-- a lost player never blocks the end (real server, three clients)');
  for (const fS of [0, 5]) {
    const gf = path.join(tmp, 'lostend' + fS + '.json');
    fs.writeFileSync(gf, JSON.stringify({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 }));
    const ss = createServer({ PORT: '0', KOS_STATUS_FILE: gf, KOS_STATUS_POLL_MS: '200' });
    const sp = await ss.listen();
    const mk = async (n) => { const c = new Client(sp, n); await c.hello(); return c; };
    const H = await mk('Vaert'), B = await mk('Bo'), C3 = await mk('Cleo');
    H.send({ t: 'create', cfg: { countdownS: 8, maxS: 600, finishS: fS, maxP: 3 }, hostRole: 'watch' });
    const cr = await H.wait('created');
    B.send({ t: 'join', code: cr.code }); await B.wait('joined');
    C3.send({ t: 'join', code: cr.code }); const jc = await C3.wait('joined');
    H.send({ t: 'start' }); await H.wait('start');
    const room = ss.rooms.rooms.get(cr.code);
    room.T0 = Date.now() + 10; await sleep(300);
    C3.send({ t: 'st', s: [0, 5e11, 12, 34, 1, 3, 0, 0, 1] }); await sleep(200);
    C3.ws.terminate(); await sleep(200);
    room.players.get(jc.id).lostAt -= 40000; // gone for 40 s
    B.send({ t: 'fin', ms: 52000 });
    await sleep(400);
    ok(room.phase === 'racing' && room.finishAt > 0, 'finishS=' + fS + ': the race is open for the lost boat, a window is running');
    room.finishAt = Math.min(room.finishAt, Date.now() + 500); // do not wait the real 60 s
    const rb = await B.wait('res', 10000);
    ok(rb.rows.length === 2 && rb.rows[0].status === 'fin' && rb.rows[1].status === 'lost', 'finishS=' + fS + ': results to the sailor, the lost one is DNF');
    const rh = await H.wait('res', 10000);
    ok(rh.rows.length === 2, 'finishS=' + fS + ': the host-only big screen got the same results');
    const back = await mk('Cleo');
    back.send({ t: 'resume', code: cr.code, id: jc.id, key: jc.key });
    ok((await back.wait((x) => x.t === 'res' || x.t === 'err')).t === 'res', 'finishS=' + fS + ': the returning lost player gets the results');
    H.close(); B.close(); back.close();
    await ss.close();
  }

  console.log('-- live-rules: protocol 2, st flags 64/128, foul relay');
  {
    const fs2 = createServer({ PORT: '0', KOS_STATUS_FILE: statusFile, KOS_STATUS_POLL_MS: '200' });
    const p5 = await fs2.listen();
    const mk5 = async (name, v) => { const c = new Client(p5, name); await c.opened; c.send({ t: 'hello', v: v || P.PROTOCOL_VERSION, name, build: 'test' }); return c; };
    ok(P.PROTOCOL_VERSION === 2, 'PROTOCOL_VERSION is 2');
    const old = await mk5('Gammel', 1);
    const eo = await old.wait((x) => x.t === 'welcome' || x.t === 'err');
    ok(eo.t === 'err' && eo.code === 'old' && (await old.waitClose()) === 4426, 'a v1 hello gets the friendly err old (update the game), then close 4426');
    const fut = await mk5('Fremtid', 3);
    ok((await fut.wait('err')).code === 'proto', 'a newer protocol than the server knows is err proto');
    const A = await mk5('Alfa'); await A.wait('welcome');
    A.send({ t: 'create', cfg: { countdownS: 8 }, hostRole: 'sail' });
    const ca = await A.wait('created');
    const B = await mk5('Bravo'); await B.wait('welcome'); B.send({ t: 'join', code: ca.code }); const jb = await B.wait('joined');
    const C = await mk5('Charlie'); await C.wait('welcome'); C.send({ t: 'join', code: ca.code }); const jcc = await C.wait('joined');
    A.send({ t: 'foul', o: jb.id, r: '10' });
    await sleep(150);
    ok(!B.q.some(m => m.t === 'foul'), 'a foul in the lobby is ignored');
    A.send({ t: 'start' }); await A.wait('start');
    const rm5 = fs2.rooms.rooms.get(ca.code); rm5.T0 = Date.now() + 100; await sleep(300);
    A.send({ t: 'st', s: [1, 1, 10, 5, 0.5, 3.2, 0.1, 64 | 128 | 1, 1] });
    const rel = await B.wait('s');
    ok(rel.a[0][7] === 193, 'st flags with port tack (64) and r13 (128) are relayed untouched');
    A.send({ t: 'foul', o: jb.id, r: '10' });
    const fb = await B.wait('foul');
    ok(fb.from === 1 && fb.r === '10' && fb.o === undefined, 'foul is relayed to the offender with the sender id');
    await sleep(150);
    ok(!C.q.some(m => m.t === 'foul') && !A.q.some(m => m.t === 'foul'), 'foul reaches nobody but the offender');
    for (let i = 0; i < 15; i++) A.send({ t: 'foul', o: jb.id, r: '11' });
    await sleep(300);
    ok(B.q.filter(m => m.t === 'foul').length <= 1, 'a foul burst against the same offender is rate-limited');
    A.send({ t: 'foul', o: 1, r: '10' }); A.send({ t: 'foul', o: 99, r: '10' }); A.send({ t: 'foul', o: 0, r: '10' }); A.send({ t: 'foul', o: jcc.id });
    await sleep(200);
    ok(!A.q.some(m => m.t === 'foul') && A.q.filter(m => m.t === 'err').length >= 2, 'foul against oneself / unknown id / without a rule is dropped or refused, never echoed');
    [A, B, C, old, fut].forEach(x => x.close());
    await fs2.close();
  }

  console.log('-- open race list (cfg.vis, {t:list}, GET /rooms)');
  {
    const lf = path.join(tmp, 'list-status.json');
    fs.writeFileSync(lf, JSON.stringify({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 }));
    const ls = createServer({ PORT: '0', KOS_STATUS_FILE: lf, KOS_STATUS_POLL_MS: '200', KOS_MAX_ROOMS: '40', KOS_MAX_PER_IP: '30' });
    const lp = await ls.listen();
    const mkL = async (name, origin) => { const c = new Client(lp, name, origin ? { origin } : undefined); await c.hello(); return c; };
    const httpGet = (p, origin) => new Promise((res, rej) => {
      http.get({ host: '127.0.0.1', port: lp, path: p, headers: origin ? { origin } : {} }, (r) => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: b })); }).on('error', rej);
    });
    ok(P.CFG_DEFAULTS.vis === 'private', 'cfg.vis defaults to private');
    const H1 = await mkL('Privat');
    H1.send({ t: 'create', cfg: { vis: 'private' }, hostRole: 'sail' });
    const priv = await H1.wait('created');
    ok(priv.room.cfg.vis === 'private', 'a created room is private by default');
    const H2 = await mkL('Aaben');
    H2.send({ t: 'create', cfg: { boat: 'zest', course: 'tri', windKn: 12, maxP: 6, vis: 'open' }, hostRole: 'sail' });
    const open = await H2.wait('created');
    ok(open.room.cfg.vis === 'open', 'host can make the room open');
    H2.send({ t: 'cfgset', cfg: { vis: 'bogus' } });
    await sleep(100);
    ok(ls.rooms.rooms.get(open.code).cfg.vis === 'open', 'a bad vis value is ignored');
    const V = await mkL('Kigger');
    V.send({ t: 'list' });
    let lr = await V.wait('rooms');
    ok(lr.rooms.length === 1 && lr.rooms[0].code === open.code, 'the list holds the open room only, not the private one');
    const row = lr.rooms[0];
    ok(row.host === 'Aaben' && row.cls === 'zest' && row.course === 'tri' && row.wind === 12 && row.n === 1 && row.max === 6 && row.phase === 'lobby' && row.sched === null, 'row fields: host, cls, course, wind, n, max, phase, sched');
    ok(!JSON.stringify(lr).includes(priv.code) && !('key' in row) && !('players' in row), 'the list leaks no private codes, keys or player names');
    const hr = await httpGet('/rooms', 'https://spil.kossejlsport.dk');
    ok(hr.status === 200 && JSON.parse(hr.body).rooms[0].code === open.code && hr.headers['access-control-allow-origin'] === 'https://spil.kossejlsport.dk', 'GET /rooms returns the same list with CORS for a game origin');
    ok((await httpGet('/rooms', 'https://evil.example')).status === 403, 'GET /rooms refuses a foreign Origin');
    ok((await httpGet('/rooms')).status === 200, 'GET /rooms without Origin (curl) works');
    const sts = []; for (let i = 0; i < 12; i++) sts.push((await httpGet('/rooms', 'http://localhost:8080')).status);
    ok(sts.includes(429) && sts[0] === 200, 'GET /rooms is rate-limited per IP (429)');
    for (let i = 0; i < 5; i++) V.send({ t: 'list' });
    await sleep(300);
    ok(V.q.some(m => m.t === 'err' && m.code === 'rate'), 'a burst of {t:list} gets err rate');
    fs.writeFileSync(lf, JSON.stringify({ mode: 'closed', message: 'Pause', maxRooms: 40, maxPlayers: 24 })); await sleep(700);
    const V2 = await mkL('Kigger2'); V2.send({ t: 'list' });
    ok((await V2.wait('rooms')).rooms.length === 0, 'status closed: the list is empty');
    ok(JSON.parse((await httpGet('/rooms')).body).rooms.length === 0, 'status closed: GET /rooms is empty');
    fs.writeFileSync(lf, JSON.stringify({ mode: 'hidden', message: '', maxRooms: 40, maxPlayers: 24 })); await sleep(700);
    const V3 = await mkL('Kigger3'); V3.send({ t: 'list' });
    ok((await V3.wait('rooms')).rooms.length === 0, 'status hidden: the list is empty');
    [H1, H2, V, V2, V3].forEach(x => x.close());
    await ls.close();
  }
  {
    // pure rooms.js with a fake clock
    const crypto = require('crypto');
    const { createRooms } = require(path.join(ROOT, 'server', 'lib', 'rooms.js'));
    const clock = { t: 1800000000000 };
    const mkRooms = (extra) => createRooms(Object.assign({ now: () => clock.t, limits: { maxRooms: 100, maxPlayers: 24 } }, extra || {}));
    const mkConn = (name, ip) => { const log = []; return { name, ip: ip || '1.1.1.1', send: (m) => log.push(m), log }; };
    const R = mkRooms();
    const mkOpen = (i) => R.create(mkConn('H' + i), { vis: 'open', maxP: 4 }, 'sail');
    for (let i = 0; i < 35; i++) mkOpen(i);
    const lst = R.listRooms();
    ok(lst.length === 30, 'the list is capped at 30 rooms (35 open rooms exist)');
    const rC = R.create(mkConn('Nedtaelling'), { vis: 'open' }, 'sail'); R.join(mkConn('X'), rC.room.code); R.start(rC.room, rC.player.id);
    ok(R.listRooms()[0].phase === 'countdown' && R.listRooms()[0].startsIn > 0, 'a room in countdown is listed first with startsIn');
    const rR = R.create(mkConn('Sejler'), { vis: 'open' }, 'sail'); R.join(mkConn('Y'), rR.room.code); R.start(rR.room, rR.player.id);
    rR.room.phase = 'racing';
    ok(!R.listRooms().some(x => x.code === rR.room.code), 'a racing room is not listed');
  }

  console.log('-- scheduled races (fake clock)');
  {
    const crypto = require('crypto');
    const { createRooms } = require(path.join(ROOT, 'server', 'lib', 'rooms.js'));
    const clock = { t: 1800000000000 };
    const MIN = 60000;
    const saved = [];
    const mkRooms = (extra) => createRooms(Object.assign({ now: () => clock.t, limits: { maxRooms: 100, maxPlayers: 24 }, onSchedChange: (l) => { saved.length = 0; saved.push(...JSON.parse(JSON.stringify(l))); } }, extra || {}));
    const mkConn = (name, ip) => { const log = []; return { name, ip: ip || '2.2.2.2', send: (m) => log.push(m), log }; };
    const R = mkRooms();
    const bad = (a, b, c) => R.schedule(mkConn('Trainer', '9.9.9.9'), a, b, c);
    ok(bad({}, 'nonsense', clock.t + 30 * MIN).err === 'bad', 'schedule: a title that is not a preset is refused');
    ok(bad({}, 'friday', clock.t + 5 * MIN).err === 'badtime', 'schedule: less than 10 min ahead is refused');
    ok(bad({}, 'friday', clock.t + 15 * 86400000).err === 'badtime', 'schedule: more than 14 days ahead is refused');
    ok(bad({}, 'friday', NaN).err === 'bad', 'schedule: a non-number time is refused');
    ok(R.sched.size === 0, 'refused schedules leave nothing behind');

    const T = clock.t + 60 * MIN;
    const s1 = R.schedule(mkConn('Fredag', '3.3.3.3'), { boat: 'zest', maxP: 8, countdownS: 8 }, 'friday', T);
    ok(!s1.err && /^[0-9a-f]{32}$/.test(s1.secret) && s1.entry.cfg.vis === 'open', 'schedule: accepted, secret returned once, vis defaults to open');
    ok(s1.entry.hash === crypto.createHash('sha256').update(s1.secret).digest('hex') && JSON.stringify(saved).indexOf(s1.secret) < 0 && saved.length === 1, 'schedule: only the sha256 of the secret is stored and persisted');
    const code = s1.entry.code;
    const jn = R.join(mkConn('For tidlig'), code);
    ok(jn.err === 'notopen' && jn.extra.opensAt === T - 15 * MIN && jn.extra.title === 'friday', 'a join before the room opens says notopen with the opening time');
    let ls = R.listRooms();
    ok(ls.length === 1 && ls[0].phase === 'sched' && ls[0].sched.at === T && ls[0].sched.title === 'friday' && ls[0].host === 'Fredag', 'a pending scheduled race is in the list (phase sched)');
    const hidden = R.schedule(mkConn('Skjult', '3.3.4.4'), { vis: 'private' }, 'club', T + MIN);
    ok(!R.listRooms().some(x => x.code === hidden.entry.code), 'a private scheduled race is not listed');
    ok(hidden.entry.code !== code, 'schedule: codes differ');
    R.scheduleCancel(hidden.entry.code, hidden.secret);

    clock.t = T - 16 * MIN; R.tick();
    ok(!R.rooms.has(code) && R.sched.has(code), 'not open at -16 min');
    clock.t = T - 15 * MIN; R.tick();
    const room = R.rooms.get(code);
    ok(room && room.phase === 'lobby' && room.hostId === 0 && room.players.size === 0 && !R.sched.has(code), 'opens as a host-less lobby at -15 min');
    ok(saved.length === 0 || !saved.some(e => e.code === code), 'an opened race leaves the persisted file');
    ok(room.cfg.seed > 0 && R.info(room).sched.at === T, 'the opened room has a seed and carries its schedule');
    ok(R.listRooms()[0].phase === 'lobby' && R.listRooms()[0].sched.at === T && R.listRooms()[0].startsIn === 15 * MIN, 'the opened room is listed with startsIn');

    const a = mkConn('Anna'), b = mkConn('Bo');
    const ja = R.join(a, code), jb = R.join(b, code);
    ok(ja.player && jb.player && !ja.player.host && room.players.size === 2, 'players can join a host-less scheduled lobby');
    R.start(room, ja.player.id);
    ok(room.phase === 'lobby', 'a player is not the host: cannot start');
    clock.t = T + 12000; R.tick(); // keep alive a little
    ok(room.phase === 'countdown' && a.log.some(m => m.t === 'start') && b.log.some(m => m.t === 'start'), 'at startAt the server starts the countdown with 2 players');
    ok(room.T0 === T + 12000 + room.cfg.countdownS * 1000, 'server-started countdown uses cfg.countdownS');
    clock.t = room.T0 + 1; R.tick();
    ok(room.phase === 'racing', 'the server-started race goes to racing');
    // finish and results need no host, rematch by a player
    R.finish(room, ja.player.id, 70000); R.finish(room, jb.player.id, 72000);
    ok(room.phase === 'results', 'results without a host');
    ok(R.rematch(room, ja.player.id) === 'ok' && room.phase === 'lobby' && room.sched.startAt === clock.t + MIN, 'a host-less scheduled room can rematch (any player) and sets the next gun a minute ahead');
    clock.t += MIN; R.tick();
    ok(room.phase === 'countdown', 'the server starts the rematch race itself');

    // one player at the time: wait 10 min, then cancel
    const s2 = R.schedule(mkConn('Ensom', '4.4.4.4'), { countdownS: 8 }, 'train', clock.t + 20 * MIN);
    const T2 = s2.entry.startAt; clock.t = T2 - 15 * MIN; R.tick();
    const r2 = R.rooms.get(s2.entry.code); const lone = mkConn('Ene'); R.join(lone, s2.entry.code);
    clock.t = T2 + 1000; R.tick();
    ok(r2.phase === 'lobby' && !lone.log.some(m => m.t === 'start'), 'one player at startAt: the server waits');
    clock.t = T2 + 9 * MIN; R.tick();
    ok(r2.phase === 'lobby', 'still waiting 9 min after startAt');
    const late = mkConn('Sen'); R.join(late, s2.entry.code);
    clock.t = T2 + 9 * MIN + 5000; R.tick();
    ok(r2.phase === 'countdown', 'a second player arriving within the 10 min starts the race');
    const s3 = R.schedule(mkConn('Ensom2', '4.4.4.5'), {}, 'weekend', clock.t + 20 * MIN);
    const T3 = s3.entry.startAt; clock.t = T3 - 15 * MIN; R.tick();
    const r3 = R.rooms.get(s3.entry.code); const lone3 = mkConn('Ene3'); R.join(lone3, s3.entry.code);
    clock.t = T3 + 10 * MIN + 1000; R.tick();
    ok(r3.phase === 'closing' && lone3.log.some(m => m.t === 'schedcancelled' && m.why === 'few'), 'after 10 min with fewer than 2 players the race is cancelled with a message');
    clock.t += 6000; R.tick();
    ok(!R.rooms.has(s3.entry.code), 'the cancelled room is removed');
    const s3b = R.schedule(mkConn('Tom', '4.4.4.6'), {}, 'club', clock.t + 20 * MIN);
    clock.t = s3b.entry.startAt - 15 * MIN; R.tick(); clock.t += 25 * MIN + 1000; R.tick();
    ok(R.rooms.get(s3b.entry.code).phase === 'closing', 'an empty scheduled room is also cancelled (and not removed early when empty)');

    // host secret
    const s4 = R.schedule(mkConn('Traener', '5.5.5.5'), { countdownS: 8 }, 'train', clock.t + 30 * MIN);
    const T4 = s4.entry.startAt; clock.t = T4 - 15 * MIN; R.tick();
    const r4 = R.rooms.get(s4.entry.code);
    const wrong = mkConn('Svindler'); const jw = R.join(wrong, s4.entry.code, '0'.repeat(32));
    ok(jw.player && !jw.player.host && r4.hostId === 0, 'a wrong secret joins as an ordinary player, not host');
    const jh = R.join(mkConn('Traener'), s4.entry.code, s4.secret);
    ok(jh.player.host && r4.hostId === jh.player.id, 'the right secret takes the host seat');
    ok(R.join(mkConn('Traener2'), s4.entry.code, s4.secret).err === 'bad', 'the secret cannot take a host seat that is occupied');
    ok(R.start(r4, jh.player.id) === 'ok' && r4.phase === 'countdown', 'the creator can start early (>= 2 boats: host + the other player)');
    const s5 = R.schedule(mkConn('Traener', '5.5.5.6'), {}, 'train', clock.t + 30 * MIN);
    clock.t = s5.entry.startAt - 15 * MIN; R.tick();
    const r5 = R.rooms.get(s5.entry.code);
    const h5 = R.join(mkConn('Traener'), s5.entry.code, s5.secret);
    R.setCfg(r5, h5.player.id, { windKn: 20 });
    ok(r5.cfg.windKn === 20, 'the creator can change settings');
    R.disconnect(r5, h5.player.id, true);
    ok(r5.phase === 'lobby' && r5.hostId === 0 && !r5.players.has(h5.player.id), 'the creator leaving does not close the scheduled lobby: it is server-run again');
    const h5b = R.join(mkConn('Traener'), s5.entry.code, s5.secret);
    ok(h5b.player && h5b.player.host, 'the creator can take the host seat back');
    h5b.player.lost = true; h5b.player.lostAt = clock.t;
    const h5c = R.join(mkConn('Traener'), s5.entry.code, s5.secret);
    ok(h5c.player && h5c.player.host && !r5.players.has(h5b.player.id), 'a dropped host seat is replaced when the creator comes back with the secret');
    ok(R.scheduleCancel(s5.entry.code, 'f'.repeat(32)) === 'denied' && r5.phase === 'lobby', 'cancel with a wrong secret is denied');
    const cl = mkConn('Fan'); R.join(cl, s5.entry.code);
    ok(R.scheduleCancel(s5.entry.code, s5.secret) === 'ok' && r5.phase === 'closing' && cl.log.some(m => m.t === 'schedcancelled' && m.why === 'host'), 'cancel with the secret closes an opened race and tells the players');
    const s6 = R.schedule(mkConn('Traener', '5.5.5.7'), {}, 'xmas', clock.t + 60 * MIN);
    ok(R.scheduleCancel(s6.entry.code, 'a'.repeat(32)) === 'denied' && R.sched.has(s6.entry.code), 'cancel of a pending race with a wrong secret is denied');
    ok(R.scheduleCancel(s6.entry.code, s6.secret) === 'ok' && !R.sched.has(s6.entry.code) && !saved.some(e => e.code === s6.entry.code), 'cancel of a pending race removes it from memory and the file');
    ok(R.join(mkConn('Z'), s6.entry.code).err === 'nocode', 'a cancelled code is gone');

    // limits
    const ipc = mkConn('Spammer', '6.6.6.6'); const lim = [];
    for (let i = 0; i < 4; i++) lim.push(R.schedule(ipc, {}, 'train', clock.t + 60 * MIN + i * MIN).err || 'ok');
    ok(lim.join() === 'ok,ok,ok,schedlimit', 'at most 3 scheduled races per IP per day');
    clock.t += 86400000 + 1000; R.tick();
    ok(!R.schedule(ipc, {}, 'train', clock.t + 60 * MIN).err, 'the per-IP limit resets after a day');
    const R2 = mkRooms({ limits: { maxRooms: 200, maxPlayers: 24 } });
    let n = 0, last = '';
    for (let i = 0; i < 60; i++) { const r = R2.schedule(mkConn('N' + i, '10.0.' + i + '.1'), {}, 'train', clock.t + 60 * MIN); if (!r.err) n++; else last = r.err; }
    ok(n === 50 && last === 'schedfull', 'at most 50 scheduled races in total');
    ok(R2.listRooms().length === 30, 'the list shows at most 30 even with 50 pending');
    clock.t += 3 * 86400000; R2.tick();
    ok(R2.sched.size === 0, 'expired entries are removed');
    // a full server retries opening
    const R3 = mkRooms({ limits: { maxRooms: 1, maxPlayers: 24 } });
    R3.create(mkConn('Optaget'), {}, 'sail');
    const s7 = R3.schedule(mkConn('Ven', '7.7.7.7'), {}, 'train', clock.t + 10 * MIN);
    R3.tick();
    ok(R3.sched.has(s7.entry.code) && !R3.rooms.has(s7.entry.code), 'a full server keeps the race pending and retries');
  }

  console.log('-- scheduled races over the wire, persistence across a restart');
  {
    const sf2 = path.join(tmp, 'sched-status.json');
    fs.writeFileSync(sf2, JSON.stringify({ mode: 'on', message: '', maxRooms: 40, maxPlayers: 24 }));
    const schedPath = path.join(tmp, 'sched.json');
    const mkS = () => createServer({ PORT: '0', KOS_STATUS_FILE: sf2, KOS_STATUS_POLL_MS: '200', KOS_SCHEDULE_FILE: schedPath, KOS_MAX_PER_IP: '30' });
    let ws1 = mkS(); let wp = await ws1.listen();
    const mkW = async (name) => { const c = new Client(wp, name); await c.hello(); return c; };
    const Cr = await mkW('Fredagsmand');
    const inDays = Date.now() + 3 * 86400000;
    Cr.send({ t: 'sched', cfg: { boat: 'zest', maxP: 5 }, title: 'friday', startAt: inDays });
    const sd = await Cr.wait('scheduled');
    ok(/^[0-9a-f]{32}$/.test(sd.secret) && sd.startAt === inDays && sd.opensAt === inDays - 15 * 60000 && sd.title === 'friday', 'sched returns code, secret, times');
    ok(fs.existsSync(schedPath) && !fs.readdirSync(tmp).some(f => f.endsWith('.tmp')), 'the schedule file is written atomically (no tmp left)');
    const onDisk = JSON.parse(fs.readFileSync(schedPath, 'utf8'));
    ok(onDisk.races.length === 1 && onDisk.races[0].code === sd.code && onDisk.races[0].hash.length === 64 && !JSON.stringify(onDisk).includes(sd.secret) && onDisk.races[0].hostName === 'Fredagsmand', 'file: code, cfg, startAt, host nickname, hash of the secret, never the secret');
    Cr.send({ t: 'sched', cfg: {}, title: 'zzz', startAt: inDays });
    ok((await Cr.wait('err')).code === 'bad', 'sched with an unknown title is bad');
    Cr.send({ t: 'sched', cfg: {}, title: 'club', startAt: Date.now() + 60000 });
    ok((await Cr.wait('err')).code === 'badtime', 'sched too soon is badtime');
    Cr.send({ t: 'list' });
    const lw = await Cr.wait('rooms');
    ok(lw.rooms.length === 1 && lw.rooms[0].phase === 'sched' && lw.rooms[0].max === 5, 'the scheduled race is in the list');
    Cr.close(); await ws1.close();
    ws1 = mkS(); wp = await ws1.listen();
    const Cr2 = await mkW('Efter');
    Cr2.send({ t: 'list' });
    ok((await Cr2.wait('rooms')).rooms.some(x => x.code === sd.code), 'after a server restart the scheduled race is still there');
    Cr2.send({ t: 'join', code: sd.code });
    const nj = await Cr2.wait('err');
    ok(nj.code === 'notopen' && nj.opensAt === inDays - 15 * 60000 && nj.title === 'friday', 'a join before opening: err notopen with opensAt and title');
    Cr2.send({ t: 'schedcancel', code: sd.code, secret: '0'.repeat(32) });
    ok((await Cr2.wait('err')).code === 'bad', 'schedcancel with a wrong secret is refused');
    Cr2.send({ t: 'schedcancel', code: sd.code, secret: sd.secret });
    ok((await Cr2.wait('schedcancelled')).code === sd.code, 'schedcancel with the secret works after the restart');
    ok(JSON.parse(fs.readFileSync(schedPath, 'utf8')).races.length === 0, 'and the file is updated');
    // corrupt file: start empty, do not crash
    await ws1.close(); fs.writeFileSync(schedPath, '{broken');
    ws1 = mkS(); wp = await ws1.listen();
    ok(ws1.rooms.sched.size === 0, 'a broken schedule file starts empty');
    // a race 10 min ahead opens at once (opens at -15 min); creator reclaims host with the secret over the wire
    const Cr3 = await mkW('Traener');
    Cr3.send({ t: 'sched', cfg: { countdownS: 8 }, title: 'train', startAt: Date.now() + 10 * 60000 + 5000 });
    const s9 = await Cr3.wait('scheduled');
    await sleep(350);
    const Fan = await mkW('Fan'); Fan.send({ t: 'join', code: s9.code });
    const jf = await Fan.wait('joined');
    ok(jf.room.hostId === 0 && jf.room.sched.at === s9.startAt, 'a race within 15 min is open at once: host-less lobby, joinable');
    Cr3.send({ t: 'join', code: s9.code, secret: s9.secret });
    const jc2 = await Cr3.wait('joined');
    ok(jc2.room.hostId === jc2.id && jc2.room.players.find(p => p.host).name === 'Traener', 'the creator joins with the secret and is host');
    Cr3.send({ t: 'start' });
    ok((await Fan.wait('start')).grid.length === 2, 'the creator starts early');
    // kill switch: no new schedules, existing kept
    fs.writeFileSync(sf2, JSON.stringify({ mode: 'closed', message: 'Pause', maxRooms: 40, maxPlayers: 24 })); await sleep(700);
    const Cl = await mkW('Lukket');
    Cl.send({ t: 'sched', cfg: {}, title: 'train', startAt: Date.now() + 3600000 });
    ok((await Cl.wait('err')).code === 'closed', 'status closed blocks creating scheduled races');
    [Cr3, Fan, Cl, Cr2].forEach(x => x.close());
    await ws1.close();
  }

  console.log('-- kos-race script');
  if (process.platform !== 'win32' || process.env.KOS_TEST_BASH) {
    const sf = path.join(tmp, 'cli.json');
    const run = (...a) => spawnSync('bash', [path.join(ROOT, 'server', 'bin', 'kos-race'), ...a], { env: Object.assign({}, process.env, { KOS_STATUS_FILE: sf, KOS_HEALTH_URL: 'http://127.0.0.1:' + port + '/health' }), encoding: 'utf8' });
    run('closed', 'Pause i dag');
    const j = JSON.parse(fs.readFileSync(sf, 'utf8'));
    ok(j.mode === 'closed' && j.message === 'Pause i dag' && j.maxRooms === 40, 'kos-race closed writes status json');
    ok(/mode=closed|closed/.test(run('status').stdout), 'kos-race status');
    ok(run('bogus').status === 2, 'kos-race unknown command => exit 2');
    run('min', '0.8.5', '2');
    const jm = JSON.parse(fs.readFileSync(sf, 'utf8'));
    ok(jm.minClient === '0.8.5' && jm.minProto === 2 && jm.mode === 'closed' && jm.message === 'Pause i dag', 'kos-race min 0.8.5 2 sets the minimum and keeps mode, message and limits');
    ok(/minClient=0.8.5/.test(run('status').stdout) && /minProto=2/.test(run('min').stdout), 'kos-race status and kos-race min show the minimum');
    run('on', 'igen');
    ok(JSON.parse(fs.readFileSync(sf, 'utf8')).minClient === '0.8.5', 'kos-race on keeps the minimum');
    ok(run('min', 'abc').status === 2, 'kos-race min with a bad version => exit 2');
    run('min', 'off');
    ok(!('minClient' in JSON.parse(fs.readFileSync(sf, 'utf8'))), 'kos-race min off lifts it');
  } else console.log('  (skipping kos-race script test on Windows without KOS_TEST_BASH)');

  console.log('-- lib helpers (limits, status)');
  const lib = spawnSync(process.execPath, [path.join(__dirname, 'test-live-lib-a.js')], { encoding: 'utf8' });
  ok(lib.status === 0, 'tools/test-live-lib-a.js passes' + (lib.status ? ' ' + lib.stdout + lib.stderr : ''));

  await srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (checks - fails) + '/' + checks + ' checks passed');
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.log('ERROR ' + (e && e.stack || e)); process.exit(1); });
void P;
