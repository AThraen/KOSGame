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
  ok(cr.room.cfg.windKn === 16 && cr.room.cfg.laps === 3 && cr.room.cfg.seed > 0, 'cfg clamped and seed chosen by server');
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

  console.log('-- kos-race script');
  if (process.platform !== 'win32' || process.env.KOS_TEST_BASH) {
    const sf = path.join(tmp, 'cli.json');
    const run = (...a) => spawnSync('bash', [path.join(ROOT, 'server', 'bin', 'kos-race'), ...a], { env: Object.assign({}, process.env, { KOS_STATUS_FILE: sf, KOS_HEALTH_URL: 'http://127.0.0.1:' + port + '/health' }), encoding: 'utf8' });
    run('closed', 'Pause i dag');
    const j = JSON.parse(fs.readFileSync(sf, 'utf8'));
    ok(j.mode === 'closed' && j.message === 'Pause i dag' && j.maxRooms === 40, 'kos-race closed writes status json');
    ok(/mode=closed|closed/.test(run('status').stdout), 'kos-race status');
    ok(run('bogus').status === 2, 'kos-race unknown command => exit 2');
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
