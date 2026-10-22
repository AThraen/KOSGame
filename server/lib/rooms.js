'use strict';
// Pure room/phase logic. No sockets: a player has a send(msg) function.
// Time is injected (now() in ms) and advanced through tick().
const crypto = require('crypto');
const P = require('./protocol');

const LOST_GRACE_MS = 45000; // (kept for the export; a racing seat no longer expires, it waits for a rejoin until the race ends)
const RESULTS_KEEP_MS = 180000; // long enough for a podium on the projector and a rematch
const HOSTLEFT_KEEP_MS = 5000;
const EMPTY_KEEP_MS = 30000; // an empty LOBBY
const EMPTY_RACE_KEEP_MS = 5 * 60000; // a countdown/race/result where everybody dropped: the seats wait (a rejoin brings the race back)
const LOST_END_MS = 120000; // the race may end for the others when every boat that is still out is a seat that has been gone this long
const GONE_LOST_MS = 20000; // a racing seat whose socket is gone this long no longer holds the others up
const GONE_STALE_MS = 30000; // ...and so does a seat whose socket is open but that has sent no state for this long (frozen tab, dead tunnel)
const LOST_WINDOW_MS = 60000; // once every boat that is still here has finished, the ones that are gone get this long to come back, then DNF
const SAFE_FACTOR = 3; // safety net: the race ends at 3x the first finisher's time (at least 5 minutes after it), whatever the finish window says
const SAFE_MIN_EXTRA_MS = 5 * 60000;
const HARD_RACE_MS = 45 * 60000; // absolute cap on a race, whatever maxS is
const LOBBY_GRACE_MS = 20000; // a lobby/countdown seat whose socket dropped (phone locked, tunnel) keeps its place this long; the host too
const LOBBY_AFTER_MS = 12000; // the podium stays this long when the host chose "back to the lobby after the race"
const LOBBY_MAX_MS = 30 * 60000;
const HARD_MAX_MS = 2 * 3600000;

function createRooms(opts) {
  const o = opts || {};
  const now = o.now || Date.now;
  const randInt = o.randInt || ((n) => crypto.randomInt(n));
  const lim = Object.assign({ maxRooms: 40, maxPlayers: 24 }, o.limits || {});
  const lobbyGrace = o.lobbyGraceMs || LOBBY_GRACE_MS;
  const rooms = new Map();

  function newCode() {
    for (let i = 0; i < 200; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += P.ALPHABET[randInt(P.ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    return null;
  }
  const newKey = () => crypto.randomBytes(9).toString('base64url');
  const send = (p, msg) => { if (p.send && !p.lost) { try { p.send(msg); } catch (e) { /* ignore */ } } };
  const broadcast = (r, msg) => { for (const p of r.players.values()) send(p, msg); };
  const hasBoat = (p) => p.boat;

  function info(r) {
    return {
      code: r.code, phase: r.phase, cfg: r.cfg, hostRole: r.hostRole, hostId: r.hostId,
      players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, host: p.host, lost: !!p.lost, v: p.ver || '' })),
    };
  }
  const pushRoom = (r) => broadcast(r, { t: 'room', room: info(r) });

  function addPlayer(r, conn, host, boat) {
    const id = r.nextId++;
    let name = P.clean(conn.name, 16) || 'Sejler';
    const taken = new Set([...r.players.values()].map(p => p.name));
    if (taken.has(name)) {
      let n = 2;
      const base = name.slice(0, 13);
      while (taken.has(base + ' ' + n)) n++;
      name = base + ' ' + n;
    }
    const p = {
      id, name, color: P.COLORS[(id - 1) % P.COLORS.length], host, boat, key: newKey(), send: conn.send,
      ip: conn.ip, ver: P.clean(conn.ver, 16), lost: false, lostAt: 0, final: false, finMs: null, lg: 0, status: null, state: null, sent: new Map(),
    };
    r.players.set(id, p);
    return p;
  }

  function effMaxPlayers(r) { return Math.min(r.cfg.maxP, lim.maxPlayers); }

  function create(conn, cfg, hostRole) {
    if (rooms.size >= lim.maxRooms) return { err: 'busy' };
    const code = newCode();
    if (!code) return { err: 'busy' };
    const t = now();
    const base = Object.assign({}, P.CFG_DEFAULTS, { seed: randInt(2147483647) });
    const r = {
      code, phase: 'lobby', cfg: P.sanitizeCfg(cfg, base, lim.maxPlayers), hostRole, hostId: 0, players: new Map(), nextId: 1,
      T0: 0, created: t, deleteAt: 0, emptyAt: 0, results: null, finishAt: 0, lobbyAfter: false, lobbyAt: 0,
    };
    const host = addPlayer(r, conn, true, hostRole === 'sail');
    r.hostId = host.id;
    rooms.set(code, r);
    return { room: r, player: host };
  }

  function join(conn, code) {
    const r = code && rooms.get(code);
    if (!r || r.phase === 'closing') return { err: 'nocode' };
    if (r.phase !== 'lobby') return { err: 'started' };
    if (r.players.size >= effMaxPlayers(r)) return { err: 'full' };
    const p = addPlayer(r, conn, false, true);
    pushRoom(r);
    return { room: r, player: p };
  }

  function resume(conn, code, id, key) {
    const r = rooms.get(code);
    const p = r && r.players.get(id);
    // the seat belongs to the key for the whole room: lobby, countdown, racing and results (only a kick or an explicit leave ends it)
    if (!p || p.key !== key || p.kicked || p.left || r.phase === 'closing') return { err: 'nocode' };
    p.send = conn.send; p.ip = conn.ip; if (conn.ver) p.ver = P.clean(conn.ver, 16); p.lost = false; p.lostAt = 0; p.seenAt = now(); r.emptyAt = 0;
    pushRoom(r);
    return { room: r, player: p };
  }

  // Connection dropped (graceful=true for an explicit leave: no resume).
  function disconnect(r, id, graceful) {
    const p = r.players.get(id);
    if (!p || r.phase === 'closing') return;
    if (r.phase === 'lobby' || r.phase === 'countdown') {
      if (!graceful) { // a dropped socket is not a decision to leave: the seat waits (tick() finishes it after lobbyGrace)
        p.lost = true; p.lostAt = now(); p.send = null;
        pushRoom(r); checkEmpty(r);
        return;
      }
      if (p.host) {
        broadcast(r, { t: 'hostleft' });
        r.phase = 'closing'; r.deleteAt = now() + HOSTLEFT_KEEP_MS;
        return;
      }
      if (r.phase === 'lobby') { r.players.delete(id); pushRoom(r); checkEmpty(r); return; }
    }
    p.lost = true; p.lostAt = now(); p.send = null;
    if (graceful) p.left = true;
    if (graceful || r.phase === 'results') { p.final = true; if (!p.status) p.status = 'lost'; }
    pushRoom(r);
    checkEmpty(r);
    if (r.phase === 'racing') maybeFinish(r);
  }
  function checkEmpty(r) {
    if (![...r.players.values()].some(p => !p.lost)) r.emptyAt = r.emptyAt || now();
  }

  function kick(r, hostId, id) {
    if (r.hostId !== hostId || id === hostId || !(r.phase === 'lobby' || r.phase === 'countdown' || r.phase === 'racing')) return false;
    const p = r.players.get(id);
    if (!p) return false;
    send(p, { t: 'kicked' });
    if (r.phase === 'lobby') { r.players.delete(id); pushRoom(r); return p; }
    // in a race the boat stays in the table as a DNF (the others still have it on their map)
    p.kicked = true; p.final = true; p.lost = true; p.lostAt = now(); p.send = null; p.status = 'dnf';
    pushRoom(r);
    maybeFinish(r);
    return p;
  }

  function setCfg(r, hostId, cfg) {
    if (r.hostId !== hostId || r.phase !== 'lobby') return false;
    r.cfg = P.sanitizeCfg(cfg, r.cfg, lim.maxPlayers);
    pushRoom(r);
    return true;
  }

  function start(r, hostId) {
    if (r.hostId !== hostId || r.phase !== 'lobby') return 'denied';
    for (const p of [...r.players.values()]) if (p.lost && !p.host) r.players.delete(p.id); // a seat that is still dropped when the host starts is gone
    const boats = [...r.players.values()].filter(hasBoat).length;
    if (r.hostRole === 'sail' ? boats < 2 : boats < 1) { pushRoom(r); return 'few'; }
    const t = now();
    r.phase = 'countdown';
    r.T0 = t + r.cfg.countdownS * 1000;
    const grid = [...r.players.values()].filter(hasBoat).map((p, i) => ({ id: p.id, slot: i, name: p.name, color: p.color }));
    broadcast(r, { t: 'start', T0: r.T0, cfg: r.cfg, grid });
    return 'ok';
  }

  // "Ny kapsejlads med samme deltagere": host only, from the results phase. The room goes back to the lobby with the players
  // who are still connected, a fresh seed and the same cfg; everybody gets {t:'rematch', room}.
  function rematch(r, hostId) {
    if (r.hostId !== hostId || r.phase !== 'results') return 'denied';
    const host = r.players.get(hostId);
    if (!host || host.lost) return 'denied';
    for (const p of [...r.players.values()]) {
      if (p.lost) { r.players.delete(p.id); continue; }
      p.final = false; p.finMs = null; p.lg = 0; p.status = null; p.state = null; p.sent = new Map();
    }
    r.phase = 'lobby'; r.T0 = 0; r.results = null; r.deleteAt = 0; r.emptyAt = 0; r.created = now(); r.finishAt = 0; r.lobbyAfter = false; r.lobbyAt = 0;
    r.cfg = Object.assign({}, r.cfg, { seed: randInt(2147483647) });
    broadcast(r, { t: 'rematch', room: info(r) });
    return 'ok';
  }

  // host controls during a race. endNow: unfinished boats become DNF and the results go out. abort: back to the lobby, no result.
  function endNow(r, hostId) {
    if (r.hostId !== hostId || r.phase !== 'racing') return 'denied';
    endRace(r);
    return 'ok';
  }
  function abort(r, hostId) {
    if (r.hostId !== hostId || (r.phase !== 'racing' && r.phase !== 'countdown')) return 'denied';
    for (const p of [...r.players.values()]) {
      if (p.lost && !p.host) { r.players.delete(p.id); continue; }
      p.final = false; p.finMs = null; p.lg = 0; p.status = null; p.state = null; p.sent = new Map();
    }
    r.phase = 'lobby'; r.T0 = 0; r.results = null; r.deleteAt = 0; r.emptyAt = 0; r.created = now(); r.finishAt = 0; r.lobbyAfter = false; r.lobbyAt = 0;
    r.cfg = Object.assign({}, r.cfg, { seed: randInt(2147483647) });
    broadcast(r, { t: 'rematch', room: info(r), aborted: true });
    return 'ok';
  }
  function lobbyAfter(r, hostId, on) {
    if (r.hostId !== hostId || !(r.phase === 'racing' || r.phase === 'countdown' || r.phase === 'results')) return 'denied';
    r.lobbyAfter = !!on;
    if (r.phase === 'results') r.lobbyAt = on ? now() + LOBBY_AFTER_MS : 0;
    return 'ok';
  }

  function state(r, id, arr) {
    const p = r.players.get(id);
    if (!p || !p.boat || p.final || !(r.phase === 'racing' || r.phase === 'countdown')) return false;
    // out-of-range values (a buggy or hostile client) are dropped: positions within 100 km, speed under 60 m/s, sane flags and leg
    if (Math.abs(arr[2]) > 1e5 || Math.abs(arr[3]) > 1e5 || Math.abs(arr[5]) > 60 || Math.abs(arr[6]) > 10 || !(arr[7] >= 0 && arr[7] < 256) || !(arr[8] >= -1 && arr[8] < 500)) return false;
    const t = now();
    // seq must grow; but a seat that has been silent for 1.5 s may restart its sequence (a reload, a stamp that ran ahead of the real clock)
    if (p.state && arr[1] <= p.state[1] && t - (p.stAt || 0) < 1500) return false;
    const a = arr.slice(); a[0] = id;
    p.state = a; p.lg = a[8]; p.stAt = t; p.seenAt = t;
    return true;
  }

  function finish(r, id, ms) {
    const p = r.players.get(id);
    if (!p || !p.boat || p.final || r.phase !== 'racing') return false;
    p.final = true;
    if (ms >= 5000 && ms <= r.cfg.maxS * 1000 + 5000) { p.finMs = Math.round(ms); p.status = 'fin'; }
    else p.status = 'dnf';
    if (p.status === 'fin') {
      broadcast(r, { t: 'fin', id, ms: p.finMs });
      if (!r.finishAt && r.cfg.finishS > 0) { r.finishAt = now() + r.cfg.finishS * 1000; broadcast(r, { t: 'fwin', endAt: r.finishAt }); }
    }
    maybeFinish(r);
    return true;
  }

  function buildResults(r) {
    const ps = [...r.players.values()].filter(hasBoat);
    const fins = ps.filter(p => p.status === 'fin').sort((a, b) => a.finMs - b.finMs);
    const rest = ps.filter(p => p.status !== 'fin').sort((a, b) => b.lg - a.lg);
    const rows = [];
    let place = 0;
    fins.forEach((p, i) => {
      if (i === 0 || p.finMs !== fins[i - 1].finMs) place = i + 1;
      rows.push({ id: p.id, name: p.name, place, ms: p.finMs, status: 'fin' });
    });
    rest.forEach((p, i) => rows.push({ id: p.id, name: p.name, place: fins.length + i + 1, ms: null, status: p.status === 'lost' ? 'lost' : 'dnf' }));
    return rows;
  }

  function endRace(r) {
    for (const p of r.players.values()) if (p.boat && !p.final) { p.final = true; p.status = p.lost ? 'lost' : 'dnf'; }
    r.phase = 'results';
    r.results = buildResults(r);
    r.deleteAt = now() + RESULTS_KEEP_MS;
    r.lobbyAt = r.lobbyAfter ? now() + LOBBY_AFTER_MS : 0;
    broadcast(r, { t: 'res', rows: r.results });
  }
  // how long a boat that has not finished has been out of touch: socket gone, or open but no state frame
  function silentMs(r, p, t) { return p.lost ? t - p.lostAt : t - (p.seenAt || r.T0 || t); }
  function isGone(r, p, t) { return silentMs(r, p, t) >= (p.lost ? GONE_LOST_MS : GONE_STALE_MS); }
  // a short window for the boats that are gone (never longer than the one already running); everybody sees the countdown
  function lostWindow(r) {
    const at = now() + LOST_WINDOW_MS;
    if (r.finishAt && r.finishAt <= at) return;
    r.finishAt = at; broadcast(r, { t: 'fwin', endAt: r.finishAt });
  }
  // The race must never wait for a boat that cannot finish. Ends when: every boat is final; every boat still here is final and the
  // gone ones have had LOST_WINDOW_MS (also with "no limit"); nobody finished and everybody still out has been gone LOST_END_MS; or
  // the safety deadline (3x the first finisher) / maxS / HARD_RACE_MS has passed. The host can end at any time (endNow).
  function maybeFinish(r) {
    if (r.phase !== 'racing') return;
    const boats = [...r.players.values()].filter(hasBoat);
    if (!boats.length) return;
    const t = now(), open = boats.filter(p => !p.final);
    if (!open.length) { endRace(r); return; }
    const fins = boats.filter(p => p.status === 'fin');
    if (fins.length) {
      const first = Math.min.apply(null, fins.map(p => p.finMs));
      if (t >= r.T0 + Math.max(first * SAFE_FACTOR, first + SAFE_MIN_EXTRA_MS)) { endRace(r); return; }
      if (open.every(p => isGone(r, p, t))) lostWindow(r);
    } else if (open.every(p => silentMs(r, p, t) >= LOST_END_MS)) endRace(r);
  }

  // Latest-wins relay, one frame per recipient (called every 100 ms by the server).
  function flush(r) {
    if (r.phase !== 'racing' && r.phase !== 'countdown') return;
    for (const rec of r.players.values()) {
      if (rec.lost || !rec.send) continue;
      const a = [];
      for (const p of r.players.values()) {
        if (p.id === rec.id || !p.state) continue;
        if (rec.sent.get(p.id) === p.state[1]) continue;
        rec.sent.set(p.id, p.state[1]);
        a.push(p.state);
      }
      if (a.length) send(rec, { t: 's', a });
    }
  }

  function remove(r) { rooms.delete(r.code); }

  function tick() {
    const t = now();
    for (const r of [...rooms.values()]) {
      if (r.phase === 'closing') { if (t >= r.deleteAt) remove(r); continue; }
      if (t - r.created > HARD_MAX_MS) { broadcast(r, { t: 'err', code: 'closed' }); remove(r); continue; }
      if (r.phase === 'lobby' && t - r.created > LOBBY_MAX_MS) { broadcast(r, { t: 'hostleft' }); remove(r); continue; }
      if (r.emptyAt && t - r.emptyAt >= (r.phase === 'lobby' ? EMPTY_KEEP_MS : EMPTY_RACE_KEEP_MS) && ![...r.players.values()].some(p => !p.lost)) { remove(r); continue; }
      if (r.phase === 'lobby' || r.phase === 'countdown') {
        for (const p of [...r.players.values()]) {
          if (!p.lost || p.final || t - p.lostAt < lobbyGrace) continue;
          if (p.host) { // a host that never comes back closes a LOBBY; a countdown/race goes on without them (their seat waits for a rejoin like any other)
            if (r.phase !== 'lobby') continue;
            broadcast(r, { t: 'hostleft' }); r.phase = 'closing'; r.deleteAt = t + HOSTLEFT_KEEP_MS; break;
          }
          if (r.phase === 'lobby') { r.players.delete(p.id); pushRoom(r); }
        }
        if (r.phase === 'closing') continue;
      }
      if (r.phase === 'countdown' && t >= r.T0) r.phase = 'racing';
      if (r.phase === 'racing') {
        // (no timeout on a lost seat here any more: it stays until it returns or the race ends; see maybeFinish)
        if (t >= r.T0 + Math.min(r.cfg.maxS * 1000, HARD_RACE_MS) || (r.finishAt && t >= r.finishAt)) endRace(r); else maybeFinish(r);
      }
      if (r.phase === 'results' && r.lobbyAt && t >= r.lobbyAt) { r.lobbyAt = 0; if (rematch(r, r.hostId) !== 'ok') r.lobbyAfter = false; }
      if (r.phase === 'results' && t >= r.deleteAt) remove(r);
    }
  }

  function stats() {
    let players = 0;
    for (const r of rooms.values()) for (const p of r.players.values()) if (!p.lost) players++;
    return { rooms: rooms.size, players };
  }
  function setLimits(l) { Object.assign(lim, l); }

  return { rooms, create, join, resume, disconnect, kick, setCfg, start, rematch, endNow, abort, lobbyAfter, state, finish, flush, tick, info, stats, setLimits, broadcast, send };
}

module.exports = { createRooms, LOST_GRACE_MS, RESULTS_KEEP_MS };
