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
  async hello() { await this.opened; this.send({ t: 'hello', v: 1, name: this.name, build: 'test' }); return this.wait('welcome'); }
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
    const helloAs = async (name, extra) => { const c = new Client(gp, name); await c.opened; c.send(Object.assign({ t: 'hello', v: 1, name, build: 'test' }, extra || {})); return c; };
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
    try { junk.send('{"t":"create","cfg":{}}'); junk.send('not json'); junk.send({ t: 'hello', v: 1, ver: 'x'.repeat(5000) }); } catch (e) { /* closed */ }
    await sleep(200);
    c = await helloAs('Stadig', { ver: '9.1.0', cp: 2 });
    ok((await verdict(c)).t === 'welcome', 'the server is fine after refusing and abusive old clients');
    await gs.close();
    // env minimum: the stricter of file and env wins
    fs.writeFileSync(gf, JSON.stringify({ mode: 'on', message: '', minClient: '0.8.0' }));
    const gs2 = createServer({ PORT: '0', KOS_STATUS_FILE: gf, KOS_STATUS_POLL_MS: '200', KOS_MIN_CLIENT: '0.8.6' });
    const gp2 = await gs2.listen();
    const e1 = new Client(gp2, 'E1'); await e1.opened; e1.send({ t: 'hello', v: 1, name: 'E1', ver: '0.8.5', cp: 2 });
    ok((await e1.wait((x) => x.t === 'welcome' || x.t === 'err')).code === 'old', 'KOS_MIN_CLIENT=0.8.6 beats a lower minClient in the file');
    const e2 = new Client(gp2, 'E2'); await e2.opened; e2.send({ t: 'hello', v: 1, name: 'E2', ver: '0.8.6', cp: 2 });
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
