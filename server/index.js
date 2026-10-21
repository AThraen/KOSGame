'use strict';
// KOS race server: relays states and keeps the clock. Only dependency: ws.
// Env: PORT (default 8787), HOST (127.0.0.1), KOS_STATUS_FILE, KOS_ORIGINS (comma list of hostnames),
//      KOS_MAX_ROOMS, KOS_MAX_PLAYERS, KOS_MAX_CONNS, KOS_MAX_PER_IP, KOS_MIN_CLIENT (e.g. 0.8.5), KOS_MIN_PROTO (e.g. 2).
// The status file may carry minClient / minProto too (watched like mode, no restart); the stricter of file and env wins.
const http = require('http');
const { WebSocketServer } = require('ws');
const P = require('./lib/protocol');
const { createRooms } = require('./lib/rooms');
const { createBucket, createConnCounter, createDropTracker } = require('./lib/limits');
const { createStatus } = require('./lib/status');

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

function createServer(env) {
  env = env || process.env;
  const PORT = env.PORT === undefined ? 8787 : parseInt(env.PORT, 10);
  const HOST = env.HOST || '127.0.0.1';
  const HARD = { maxRooms: num(env.KOS_MAX_ROOMS, 40), maxPlayers: num(env.KOS_MAX_PLAYERS, 24) };
  const origins = (env.KOS_ORIGINS || 'spil.kossejlsport.dk,athraen.github.io,localhost,127.0.0.1')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const IDLE_MS = num(env.KOS_IDLE_MS, 60000);

  const rooms = createRooms({ limits: Object.assign({}, HARD), lobbyGraceMs: num(env.KOS_LOBBY_GRACE_MS, 20000) });
  const conns = createConnCounter({ maxTotal: num(env.KOS_MAX_CONNS, 300), maxPerIp: num(env.KOS_MAX_PER_IP, 20) });
  const started = Date.now();

  // Version gate: with a minimum set, clients below it AND clients that send no version (v0.8.4 and older) are refused with err code 'old'.
  function minimum() {
    const s = status.current();
    const fv = P.parseVer(s.minClient), ev = P.parseVer(env.KOS_MIN_CLIENT);
    const ver = fv && ev ? (P.cmpVer(fv, ev) >= 0 ? fv : ev) : fv || ev;
    const proto = Math.max(s.minProto || 0, num(env.KOS_MIN_PROTO, 0));
    return { ver, proto };
  }
  function tooOld(c) {
    const m = minimum();
    if (!m.ver && !m.proto) return false;
    if (!(c.cp > 0)) return true; // no version at all: an old build
    if (m.proto && c.cp < m.proto) return true;
    const v = P.parseVer(c.ver);
    return !!(m.ver && v && P.cmpVer(v, m.ver) < 0); // a dev build (not a dotted number) is only held to the protocol level
  }
  const minText = () => { const m = minimum(); return m.ver ? m.ver.join('.') : ''; };

  function applyLimits() {
    const s = status.current();
    rooms.setLimits({
      maxRooms: Math.min(HARD.maxRooms, s.maxRooms || HARD.maxRooms),
      maxPlayers: Math.min(HARD.maxPlayers, s.maxPlayers || HARD.maxPlayers),
    });
  }
  const status = createStatus({
    file: env.KOS_STATUS_FILE, pollMs: num(env.KOS_STATUS_POLL_MS, 5000),
    onChange: (s) => {
      applyLimits();
      for (const r of rooms.rooms.values()) if (r.phase === 'lobby') rooms.broadcast(r, { t: 'status', mode: s.mode, msg: s.message });
    },
  });

  const server = http.createServer((req, res) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (req.url === '/health' && local && !req.headers['x-forwarded-for'] && !req.headers['x-real-ip']) {
      const st = rooms.stats();
      const m = process.memoryUsage();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, mode: status.current().mode, rooms: st.rooms, players: st.players, conns: conns.total(),
        rssMb: Math.round(m.rss / 1048576), uptimeS: Math.round((Date.now() - started) / 1000) }));
      return;
    }
    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({
    server, maxPayload: 4096,
    verifyClient: (info) => {
      const o = info.origin;
      if (!o) return true; // non-browser client
      try { return origins.includes(new URL(o).hostname.toLowerCase()); } catch (e) { return false; }
    },
  });

  function clientIp(req) {
    const a = req.socket.remoteAddress || '';
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a) && req.headers['x-real-ip']) return String(req.headers['x-real-ip']).slice(0, 64);
    return a;
  }

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    if (!conns.add(ip)) { ws.close(1013, 'busy'); return; }
    const c = { ws, ip, hello: false, name: '', room: null, id: 0, strikes: 0, last: Date.now(),
      // state frames: a phone that was backgrounded flushes a burst of queued frames; the burst is absorbed (burst 60) and any excess is
      // dropped silently. A player in a countdown/race is NEVER closed for state traffic (only a lobby/idle socket can be).
      stB: createBucket({ rate: 14, burst: 60 }), msgB: createBucket({ rate: 10, burst: 30 }),
      drops: createDropTracker({ limit: 50, windowMs: 10000 }) };
    const racing = () => !!(c.room && (c.room.phase === 'racing' || c.room.phase === 'countdown'));
    const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    c.send = send;
    const err = (code, msg) => send(msg ? { t: 'err', code, msg } : { t: 'err', code });
    const strike = () => { err('bad'); if (++c.strikes >= 3) ws.close(4400, 'bad'); };
    const bind = (res, t) => {
      c.room = res.room; c.id = res.player.id;
      send({ t, code: res.room.code, id: res.player.id, key: res.player.key, room: rooms.info(res.room) });
    };

    ws.on('message', (data, isBinary) => {
      c.last = Date.now();
      if (isBinary) return strike();
      const rawTxt = data.toString();
      const v = P.validate(rawTxt);
      if (!v.ok) {
        // a state frame that fails validation (a NaN becomes null in JSON, an oversized frame ...) is dropped, not a strike:
        // three of them used to close a racing player's socket for good
        if (c.room && rawTxt.slice(0, 16).replace(/ /g, '').startsWith('{"t":"st",')) { c.badSt = (c.badSt || 0) + 1; if (Date.now() - (c.badAt || 0) > 1000) { c.badAt = Date.now(); err('bad'); } return; }
        return strike();
      }
      const m = v.msg;
      if (m.t === 'st') {
        if (!c.stB.take()) { if (c.drops.drop() && !racing()) ws.close(4429, 'rate'); return; }
      } else if (!c.msgB.take()) {
        err('rate'); if (c.drops.drop() && !racing()) ws.close(4429, 'rate'); return;
      }
      if (!c.hello) {
        if (m.t !== 'hello') return strike();
        if (m.v !== P.PROTOCOL_VERSION) { err('proto'); ws.close(4400, 'proto'); return; }
        c.name = m.name; c.ver = m.ver; c.cp = m.cp;
        if (tooOld(c)) { send({ t: 'err', code: 'old', min: minText(), proto: minimum().proto || 0 }); setTimeout(() => ws.close(4426, 'old'), 50); return; }
        c.hello = true;
        const s = status.current();
        send({ t: 'welcome', v: P.PROTOCOL_VERSION, id: 0, now: Date.now(), mode: s.mode, msg: s.message });
        return;
      }
      const r = c.room;
      switch (m.t) {
        case 'ping': send({ t: 'pong', c: m.c, s: Date.now() }); break;
        case 'create': {
          if (r) return err('bad');
          if (tooOld(c)) return err('old');
          const s = status.current();
          if (s.mode !== 'on') return err('closed', s.message);
          const res = rooms.create({ name: c.name, send, ip, ver: c.ver }, m.cfg, m.hostRole);
          if (res.err) return err(res.err);
          bind(res, 'created');
          break;
        }
        case 'join': {
          if (r) return err('bad');
          if (tooOld(c)) return err('old');
          const s = status.current();
          if (s.mode === 'hidden') return err('closed', s.message);
          const res = rooms.join({ name: c.name, send, ip, ver: c.ver }, m.code);
          if (res.err) return err(res.err);
          bind(res, 'joined');
          break;
        }
        case 'resume': {
          if (r) return err('bad');
          const res = rooms.resume({ send, ip, ver: c.ver }, m.code, m.id, m.key);
          if (res.err) return err(res.err);
          bind(res, 'joined');
          if (res.room.phase === 'countdown' || res.room.phase === 'racing') {
            send({ t: 'start', T0: res.room.T0, cfg: res.room.cfg, grid: [...res.room.players.values()].filter(p => p.boat).map((p, i) => ({ id: p.id, slot: i, name: p.name, color: p.color })) });
          }
          if (res.room.finishAt && res.room.phase === 'racing') send({ t: 'fwin', endAt: res.room.finishAt });
          // the last valid state of this seat (position, heading, speed, flags, leg): a client that was reloaded puts its boat back there
          send({ t: 'me', s: res.player.state || null, fin: res.player.finMs || null, T0: res.room.T0, now: Date.now() });
          if (res.room.phase === 'results') send({ t: 'res', rows: res.room.results });
          break;
        }
        case 'cfgset': if (r) rooms.setCfg(r, c.id, m.cfg); break;
        case 'kick': {
          if (!r) return;
          const k = rooms.kick(r, c.id, m.id);
          if (k && k.send) { /* socket closed below by owner */ }
          if (k) for (const sock of wss.clients) if (sock._kosPlayer === k) sock.close(4403, 'kicked');
          break;
        }
        case 'start': if (r) { const res = rooms.start(r, c.id); if (res === 'few') err('few'); else if (res === 'denied') err('bad'); } break;
        case 'hend': if (r && rooms.endNow(r, c.id) !== 'ok') err('bad'); break;
        case 'habort': if (r && rooms.abort(r, c.id) !== 'ok') err('bad'); break;
        case 'hlobby': if (r && rooms.lobbyAfter(r, c.id, m.on) !== 'ok') err('bad'); break;
        case 'rematch': if (r && rooms.rematch(r, c.id) !== 'ok') err('bad'); break;
        case 'st': if (r && rooms.state(r, c.id, m.s)) { /* relayed on tick */ } break;
        case 'fin': if (r) rooms.finish(r, c.id, m.ms); break;
        case 'leave': if (r) { rooms.disconnect(r, c.id, true); c.room = null; } break;
        default: strike();
      }
      if (c.room) ws._kosPlayer = c.room.players.get(c.id);
    });

    ws.on('close', () => {
      conns.remove(ip);
      const r = c.room;
      if (r && r.players.get(c.id) && r.players.get(c.id) === ws._kosPlayer && r.players.get(c.id).send === send) rooms.disconnect(r, c.id, false);
    });
    ws.on('error', () => {});
    // a racing player is never closed as idle (a backgrounded phone sends nothing for a while; the grace period handles real drops)
    c.idleCheck = () => { if (Date.now() - c.last > (racing() ? 10 * 60000 : IDLE_MS)) ws.close(4408, 'idle'); };
    ws._kos = c;
  });

  let timers = [];
  function listen() {
    status.start();
    applyLimits();
    timers.push(setInterval(() => { rooms.tick(); for (const r of rooms.rooms.values()) rooms.flush(r); }, 100));
    timers.push(setInterval(() => { for (const ws of wss.clients) ws._kos && ws._kos.idleCheck(); }, 5000));
    return new Promise((resolve) => server.listen(PORT, HOST, () => resolve(server.address().port)));
  }
  function close() {
    timers.forEach(clearInterval); timers = [];
    status.stop();
    for (const ws of wss.clients) ws.terminate();
    return new Promise((resolve) => wss.close(() => server.close(() => resolve())));
  }
  return { listen, close, rooms, status, server, wss };
}

module.exports = { createServer };

if (require.main === module) {
  const s = createServer();
  s.listen().then((port) => console.log('kos-race listening on ' + (process.env.HOST || '127.0.0.1') + ':' + port));
  const stop = () => s.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
