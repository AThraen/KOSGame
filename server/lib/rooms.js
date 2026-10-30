'use strict';
// Pure room/phase logic. No sockets: a player has a send(msg) function.
// Time is injected (now() in ms) and advanced through tick().
const crypto = require('crypto');
const P = require('./protocol');
const { ipKey } = require('./limits');

const LOST_GRACE_MS = 45000; // (kept for the export; a racing seat no longer expires, it waits for a rejoin until the race ends)
const RESULTS_KEEP_MS = 180000; // long enough for a podium on the projector and a rematch
const HOSTLEFT_KEEP_MS = 5000;
const EMPTY_KEEP_MS = 30000; // an empty LOBBY
const EMPTY_RACE_KEEP_MS = 5 * 60000; // a countdown/race/result where everybody dropped: the seats wait (a rejoin brings the race back)
const LOST_END_MS = EMPTY_RACE_KEEP_MS; // nobody finished and every boat still out has been gone this long: the race ends (as long as an empty race room waits; club Wi-Fi down for 2 min must not end it)
const GONE_LOST_MS = 20000; // a racing seat whose socket is gone this long no longer holds the others up
const GONE_STALE_MS = 30000; // ...and so does a seat whose socket is open but that has sent no state for this long (frozen tab, dead tunnel)
const LOST_WINDOW_MS = 60000; // once every boat that is still here has finished, the ones that are gone get this long to come back, then DNF
const SAFE_FACTOR = 3; // safety net: the race ends at 3x the first finisher's time (at least 5 minutes after it), whatever the finish window says
const SAFE_MIN_EXTRA_MS = 5 * 60000;
const HARD_RACE_MS = 45 * 60000; // absolute cap on a race, whatever maxS is
const LOBBY_GRACE_MS = 20000; // a lobby/countdown seat whose socket dropped (phone locked, tunnel) is "lost" this long before the rules below apply
const LOBBY_SEAT_MS = 5 * 60000; // a dropped sailor's seat in a (not scheduled) lobby waits this long (the kid only waits for the host); a scheduled one until the gun
const HOST_GRACE_MS = 3 * 60000; // a dropped host closes its lobby only after this long (kids are often still joining; LOBBY_MAX_MS still bounds it)
const LOBBY_AFTER_MS = 12000; // the podium stays this long when the host chose "back to the lobby after the race"
const LOBBY_MAX_MS = 30 * 60000;
const HARD_MAX_MS = 2 * 3600000;
// scheduled races (part C of the live-rules spec)
const SCHED_OPEN_MS = 15 * 60000; // the room opens this long before startAt
const SCHED_WAIT_MS = 10 * 60000; // after startAt the server waits this long for a second player, then cancels
const SCHED_MIN_LEAD_MS = 10 * 60000, SCHED_LEAD_SLACK_MS = 60000; // a new schedule must be this far ahead (minus slack for a slow request)
const SCHED_MAX_LEAD_MS = 14 * 86400000;
const SCHED_PER_IP = 3, SCHED_IP_WINDOW_MS = 86400000, SCHED_TOTAL = 50;
const SCHED_PER_DAY = 20; // new schedules per day on the whole server (lim.schedPerDay): rotating addresses cannot fill the 50 in one burst
const SCHED_PENDING_PER_IP = 5; // races not yet run per IP (counted from the salted IP hash in the entries, so it survives a restart)
const SCHED_REGUN_MS = 60000; // a scheduled room that lost its host after its first race: the server's next gun at the earliest this far ahead
const LIST_MAX = 30, LIST_SCHED_MAX = 15; // pending scheduled races never take more than half the list from the lobbies you can join now
const FOUL_PAIR_MS = 500; // the same sender may report the same offender at most this often
// a seat whose room is gone (removed after the results, or deleted by a rematch) still gets its official result on resume this long:
// the same 2 h as the client's seat record (kos.mp.seat exp = last contact + 2 h)
const PAST_KEEP_MS = 2 * 3600000, PAST_MAX = 300;

function createRooms(opts) {
  const o = opts || {};
  const now = o.now || Date.now;
  const randInt = o.randInt || ((n) => crypto.randomInt(n));
  const lim = Object.assign({ maxRooms: 40, maxPlayers: 24, schedPerDay: SCHED_PER_DAY }, o.limits || {});
  const lobbyGrace = o.lobbyGraceMs || LOBBY_GRACE_MS;
  const lobbySeat = o.lobbySeatMs || LOBBY_SEAT_MS, hostGrace = o.hostGraceMs || HOST_GRACE_MS;
  const rooms = new Map();
  const sched = new Map(); // code -> pending scheduled race {code, title, cfg, startAt, hostName, hash, created, iph}; becomes a room at startAt - 15 min
  const opened = new Map(); // code -> the entry of an opened scheduled room whose race has not begun: still persisted (a restart opens it again)
  const schedIp = new Map(); // ipKey -> creation times (memory only, never persisted)
  let schedDay = []; // creation times of every schedule on this server in the last day (memory; the entries' created times cover a restart)
  const onSched = o.onSchedChange || (() => {});
  const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
  const ipSalt = o.ipSalt || crypto.randomBytes(16).toString('hex');
  const ipHash = (ip) => sha(ipSalt + '|' + String(ip || '')); // per-IP limits that survive a restart without storing the IP itself
  const hashOk = (secret, hash) => {
    if (typeof secret !== 'string' || !secret || typeof hash !== 'string') return false;
    const a = Buffer.from(sha(secret)), b = Buffer.from(hash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const keyOk = (key, want) => { // a seat key, compared in constant time like the secrets
    if (typeof key !== 'string' || typeof want !== 'string') return false;
    const a = Buffer.from(key), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  const past = new Map(); // code -> [{rows, seats: Map id -> key, at}] results of races whose seats may still come back (memory only)
  let pastPruneAt = 0;
  const gone = new Set(); // codes the operator took off the server (dropCode): never handed out again by this process
  function newCode() {
    for (let i = 0; i < 200; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += P.ALPHABET[randInt(P.ALPHABET.length)];
      if (!rooms.has(c) && !sched.has(c) && !gone.has(c)) return c; // a scheduled code is reserved from the moment it is made
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
      ...(r.sched ? { sched: { at: r.sched.startAt, title: r.sched.title } } : {}),
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

  function join(conn, code, secret) {
    const r = code && rooms.get(code);
    if (!r || r.phase === 'closing') {
      const e = code && sched.get(code);
      if (e && now() >= e.startAt - SCHED_OPEN_MS) return { err: 'busy' }; // due, but the server is full: it opens as soon as a room is free
      return e ? { err: 'notopen', extra: { opensAt: e.startAt - SCHED_OPEN_MS, startAt: e.startAt, title: e.title, now: now() } } : { err: 'nocode' };
    }
    if (r.phase !== 'lobby') return { err: 'started' };
    // the creator of a scheduled race takes the host seat with the secret (also from a dropped host seat)
    const claim = !!(r.sched && secret && hashOk(secret, r.sched.hash));
    if (claim) {
      const old = r.players.get(r.hostId);
      if (old && !old.lost) return { err: 'bad' }; // the creator is already in
      if (old) r.players.delete(old.id);
      for (const q of [...r.players.values()]) if (q.wasHost && q.lost) r.players.delete(q.id); // the creator's old seat, demoted while it was away
    }
    // a lobby keeps dropped seats: a scheduled one to the gun (spec E6: a kid who locked the phone while waiting keeps the place, so
    // a full scheduled lobby stays full), any other one LOBBY_SEAT_MS (tick); a full one gives such an expired seat up at once
    if (r.players.size >= effMaxPlayers(r) && !r.sched) {
      const old = [...r.players.values()].filter(q => q.lost && !q.host && now() - q.lostAt >= lobbySeat).sort((a, b) => a.lostAt - b.lostAt)[0];
      if (old) r.players.delete(old.id);
    }
    if (r.players.size >= effMaxPlayers(r)) return { err: 'full' };
    const p = addPlayer(r, conn, claim, true);
    if (claim) { r.hostId = p.id; r.emptyAt = 0; }
    pushRoom(r);
    return { room: r, player: p };
  }

  function resume(conn, code, id, key) {
    const r = rooms.get(code);
    const p = r && r.players.get(id);
    // the seat belongs to the key for the whole room: lobby, countdown, racing and results (only a kick or an explicit leave ends it)
    if (!p || !keyOk(key, p.key) || p.kicked || p.left || r.phase === 'closing') {
      // the race is over and the room gone (or this seat was dropped by a rematch): the official result instead of a bare nocode.
      // alive: the room is still there but the seat is not (dropped from the lobby, a rematch, a restart): its phase, so the client
      // can join the lobby again or say what happened, instead of "the race is over"
      const rows = !(p && (p.kicked || p.left)) && pastResult(code, id, key);
      const alive = r && r.phase !== 'closing' && !(p && (p.kicked || p.left)) ? r.phase : '';
      const e = { err: 'nocode' };
      if (rows) e.rows = rows;
      if (alive) e.alive = alive;
      return e;
    }
    p.send = conn.send; p.ip = conn.ip; if (conn.ver) p.ver = P.clean(conn.ver, 16); p.lost = false; p.lostAt = 0; p.seenAt = now(); r.emptyAt = 0;
    // the creator of a scheduled race whose seat was demoted while it was away (tick: server-run) is host again, in the lobby (spec C)
    if (r.sched && r.phase === 'lobby' && !r.hostId && p.wasHost) { p.host = true; p.wasHost = false; r.hostId = p.id; }
    pushRoom(r);
    if (r.phase === 'racing') lostBack(r); // a boat back in the race: the short window for the gone boats no longer applies
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
      if (p.host && r.sched) { // the room is server-run: it goes on without a host; in a countdown the boat stays on the grid as a seat that left
        serverRun(r);
        if (r.phase === 'lobby') { r.players.delete(id); pushRoom(r); return; }
        p.host = false;
      } else if (p.host && r.phase === 'lobby') { // a host who leaves the lobby closes it; in a countdown the race goes on without them
        broadcast(r, { t: 'hostleft' });
        r.phase = 'closing'; r.deleteAt = now() + HOSTLEFT_KEEP_MS;
        return;
      }
      if (r.phase === 'lobby') { r.players.delete(id); pushRoom(r); checkEmpty(r); return; }
    }
    p.lost = true; p.lostAt = now(); p.send = null;
    if (graceful) p.left = true;
    if (graceful || r.phase === 'results') { p.final = true; if (!p.status) p.status = 'lost'; }
    if (p.host && r.sched && (graceful || r.phase === 'results')) hostGone(r);
    pushRoom(r);
    checkEmpty(r);
    if (r.phase === 'racing') maybeFinish(r);
  }
  function checkEmpty(r) {
    if (![...r.players.values()].some(p => !p.lost)) r.emptyAt = r.emptyAt || now();
  }
  // a scheduled room loses its host: the server runs it again. After its first race the next server gun is at least a minute away
  // (startAt is long past by then: it would fire at once, or cancel the room for too few boats).
  function serverRun(r) {
    r.hostId = 0;
    if (r.sched.fired) r.sched.startAt = Math.max(r.sched.startAt, now() + SCHED_REGUN_MS);
  }
  // a scheduled room whose host seat left in a race, or is still dropped when the results are in: server-run again, so any seated
  // player may ask for the rematch and the server's gun applies (spec C "Fallback": results and rematch need no host)
  function hostGone(r) {
    if (!r.sched || !r.hostId) return;
    const h = r.players.get(r.hostId);
    if (h && !h.lost) return;
    if (h) h.host = false;
    serverRun(r);
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
    // an opened scheduled lobby is still in the file: a restart must reopen it with these settings (a host who made it private
    // must not find it listed again)
    const e = r.sched && opened.get(r.code);
    if (e) { e.cfg = Object.assign({}, r.cfg, { seed: 0 }); schedSave(); }
    pushRoom(r);
    return true;
  }

  function start(r, hostId) {
    if (!hostId || r.hostId !== hostId || r.phase !== 'lobby') return 'denied';
    return begin(r);
  }
  function begin(r) {
    // a seat that is dropped at the gun is NOT deleted (spec E6): it goes on the grid and may resume; one that never comes back is lost
    // in the results. Only the boats that are here count for the minimum.
    const boats = [...r.players.values()].filter(p => hasBoat(p) && !p.lost).length;
    if (r.hostRole === 'sail' ? boats < 2 : boats < 1) { pushRoom(r); return 'few'; }
    const t = now();
    if (r.sched && !r.sched.fired) { r.sched.fired = true; dropOpened(r.code); } // the scheduled race has begun: nothing left to restore
    r.phase = 'countdown';
    r.T0 = t + r.cfg.countdownS * 1000;
    const grid = [...r.players.values()].filter(hasBoat).map((p, i) => ({ id: p.id, slot: i, name: p.name, color: p.color }));
    broadcast(r, { t: 'start', T0: r.T0, cfg: r.cfg, grid });
    return 'ok';
  }

  // "Ny kapsejlads med samme deltagere": host only, from the results phase. The room goes back to the lobby with the players
  // who are still connected, a fresh seed and the same cfg; everybody gets {t:'rematch', room}.
  function rematch(r, hostId) {
    const serverRun = !!(r.sched && !r.hostId); // a server-run room has no host: any seated player may ask, and the server starts the next race itself
    if ((r.hostId !== hostId && !(serverRun && r.players.has(hostId))) || r.phase !== 'results') return 'denied';
    const host = r.players.get(hostId);
    if (!host || host.lost) return 'denied';
    archive(r); // the seats dropped here can still fetch this result
    const t = now();
    for (const p of [...r.players.values()]) {
      // a seat that dropped only moments ago (a phone that locked on the podium) comes along as a dropped lobby seat; older ones are gone
      if (p.lost && (p.left || p.kicked || t - p.lostAt >= lobbyGrace)) { r.players.delete(p.id); continue; }
      if (p.lost) p.lostAt = t;
      p.final = false; p.finMs = null; p.lg = 0; p.status = null; p.state = null; p.sent = new Map();
    }
    r.phase = 'lobby'; r.T0 = 0; r.results = null; r.deleteAt = 0; r.emptyAt = 0; r.created = now(); r.finishAt = 0; r.finWin = 0; r.lostWin = false; r.lobbyAfter = false; r.lobbyAt = 0;
    r.cfg = Object.assign({}, r.cfg, { seed: randInt(2147483647) });
    if (serverRun) r.sched.startAt = now() + 60000; // next gun in a minute, with >= 2 players
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
      if (p.kicked || p.left) { r.players.delete(p.id); continue; }
      if (p.lost) p.lostAt = now(); // a dropped seat waits in the lobby again (the lobby grace, or until the gun in a scheduled room)
      p.final = false; p.finMs = null; p.lg = 0; p.status = null; p.state = null; p.sent = new Map();
    }
    r.phase = 'lobby'; r.T0 = 0; r.results = null; r.deleteAt = 0; r.emptyAt = 0; r.created = now(); r.finishAt = 0; r.finWin = 0; r.lostWin = false; r.lobbyAfter = false; r.lobbyAt = 0;
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
    if (Math.abs(arr[2]) > 1e5 || Math.abs(arr[3]) > 1e5 || Math.abs(arr[5]) > 60 || Math.abs(arr[6]) > 10 || !(arr[7] >= 0 && arr[7] < 512) || !(arr[8] >= -1 && arr[8] < 500)) return false;
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
      if (!r.finWin && r.cfg.finishS > 0) {
        r.finWin = now() + r.cfg.finishS * 1000; // the finish window the host chose; finishAt may run shorter while every open boat is gone
        if (!r.finishAt || r.finWin < r.finishAt) { r.finishAt = r.finWin; broadcast(r, { t: 'fwin', endAt: r.finishAt }); }
      }
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
    r.results = buildResults(r); r.resAt = now();
    r.deleteAt = now() + RESULTS_KEEP_MS;
    r.lobbyAt = r.lobbyAfter ? now() + LOBBY_AFTER_MS : 0;
    broadcast(r, { t: 'res', rows: r.results });
    if (r.sched && r.hostId) { hostGone(r); if (!r.hostId) pushRoom(r); } // a host seat still dropped at the results
  }
  // how long a boat that has not finished has been out of touch: socket gone, or open but no state frame
  function silentMs(r, p, t) { return p.lost ? t - p.lostAt : t - (p.seenAt || r.T0 || t); }
  function isGone(r, p, t) { return silentMs(r, p, t) >= (p.lost ? GONE_LOST_MS : GONE_STALE_MS); }
  // a short window for the boats that are gone (never longer than the one already running); everybody sees the countdown.
  // It is provisional (r.lostWin): a gone boat that comes back and sails on gets the host's window (finWin) or no limit again (lostBack)
  function lostWindow(r) {
    const at = now() + LOST_WINDOW_MS;
    if (r.finishAt && r.finishAt <= at) return;
    r.finishAt = at; r.lostWin = true; broadcast(r, { t: 'fwin', endAt: r.finishAt });
  }
  function lostBack(r) {
    if (!r.lostWin) return;
    const t = now();
    if (r.players.size && [...r.players.values()].every(p => !hasBoat(p) || p.final || isGone(r, p, t))) return;
    r.lostWin = false; r.finishAt = r.finWin || 0;
    broadcast(r, { t: 'fwin', endAt: r.finishAt });
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
      if (open.every(p => isGone(r, p, t))) lostWindow(r); else lostBack(r);
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

  function remove(r) { archive(r); rooms.delete(r.code); dropOpened(r.code); }
  // keeps a finished race's table for the seats that may still come back (resume -> err nocode + rows)
  function archive(r) {
    if (!r.results) return;
    const seats = new Map();
    for (const p of r.players.values()) if (p.boat && !p.kicked && !p.left) seats.set(p.id, p.key);
    const list = (past.get(r.code) || []).filter(x => x.rows !== r.results);
    list.push({ rows: r.results, seats, at: r.resAt || now() }); // counted from the results: a seat away since before them has an older client record
    past.delete(r.code); past.set(r.code, list.slice(-3));
    while (past.size > PAST_MAX) past.delete(past.keys().next().value);
  }
  function pastResult(code, id, key) {
    const list = past.get(code) || [], t = now();
    for (let i = list.length - 1; i >= 0; i--) if (t - list[i].at < PAST_KEEP_MS && keyOk(key, list[i].seats.get(id))) return list[i].rows;
    return null;
  }

  function tick() {
    const t = now();
    if (t - pastPruneAt > 60000) { pastPruneAt = t; for (const [c, l] of past) { const k = l.filter(x => t - x.at < PAST_KEEP_MS); if (k.length) past.set(c, k); else past.delete(c); } }
    openDue(t);
    for (const r of [...rooms.values()]) {
      if (r.phase === 'closing') { if (t >= r.deleteAt) remove(r); continue; }
      if (t - r.created > HARD_MAX_MS) { broadcast(r, { t: 'err', code: 'closed' }); remove(r); continue; }
      if (r.phase === 'lobby' && t - r.created > LOBBY_MAX_MS) { broadcast(r, { t: 'hostleft' }); remove(r); continue; }
      if (r.sched && r.phase === 'lobby') r.emptyAt = 0; // a scheduled lobby waits for its time even when nobody is in it
      if (r.emptyAt && t - r.emptyAt >= (r.phase === 'lobby' ? EMPTY_KEEP_MS : EMPTY_RACE_KEEP_MS) && ![...r.players.values()].some(p => !p.lost)) {
        if (r.phase === 'racing') endRace(r); // the table is kept (archive): a seat that comes back later still gets its result
        remove(r); continue;
      }
      if (r.phase === 'lobby' || r.phase === 'countdown') {
        for (const p of [...r.players.values()]) {
          if (!p.lost || p.final || t - p.lostAt < lobbyGrace) continue;
          if (p.host && !r.sched && r.phase === 'lobby' && t - p.lostAt < hostGrace) continue; // the trainer's phone locked: the lobby waits
          if (p.host && r.sched) { // server-run from now on; the seat stays as a player's (to the gun in a lobby, on the grid in a countdown)
            serverRun(r);
            p.host = false; p.wasHost = true;
            pushRoom(r); continue;
          }
          if (p.host) { // a host that never comes back closes a LOBBY; a countdown/race goes on without them (their seat waits for a rejoin like any other)
            if (r.phase !== 'lobby') continue;
            broadcast(r, { t: 'hostleft' }); r.phase = 'closing'; r.deleteAt = t + HOSTLEFT_KEEP_MS; break;
          }
          if (r.phase === 'lobby' && !r.sched && t - p.lostAt >= lobbySeat) { r.players.delete(p.id); pushRoom(r); } // a scheduled lobby seat waits until the gun (spec E6)
        }
        if (r.phase === 'closing') continue;
      }
      // the server's own gun: >= 2 players start the countdown, otherwise wait SCHED_WAIT_MS more, then call it off. It fires for the
      // scheduled race itself, and afterwards only while nobody is host (a host back in the lobby after an abort or a rematch decides)
      if (r.sched && r.phase === 'lobby' && t >= r.sched.startAt && (!r.sched.fired || !r.hostId)) {
        if ([...r.players.values()].filter(p => p.boat && !p.lost).length >= 2) begin(r);
        else if (t >= r.sched.startAt + SCHED_WAIT_MS) {
          broadcast(r, { t: 'schedcancelled', code: r.code, why: 'few' }); r.phase = 'closing'; r.deleteAt = t + HOSTLEFT_KEEP_MS; dropOpened(r.code); continue;
        }
      }
      if (r.phase === 'countdown' && t >= r.T0) r.phase = 'racing';
      if (r.phase === 'racing') {
        // (no timeout on a lost seat here any more: it stays until it returns or the race ends; see maybeFinish)
        if (t >= r.T0 + Math.min(r.cfg.maxS * 1000, HARD_RACE_MS) || (r.finishAt && t >= r.finishAt)) endRace(r); else maybeFinish(r);
      }
      if (r.phase === 'results' && r.lobbyAt && t >= r.lobbyAt) { // "back to the lobby after": the host, or in a server-run room any seated player
        r.lobbyAt = 0;
        const by = r.hostId || (r.sched && ([...r.players.values()].find(p => !p.lost) || {}).id);
        if (!by || rematch(r, by) !== 'ok') r.lobbyAfter = false;
      }
      if (r.phase === 'results' && t >= r.deleteAt) remove(r);
    }
  }

  // ---- scheduled races ----
  // persisted: the pending races and the opened ones whose race has not begun (a restart in the 15 min before the start opens them again)
  const schedList = () => [...sched.values(), ...opened.values()].map(e => ({ code: e.code, title: e.title, cfg: e.cfg, startAt: e.startAt, hostName: e.hostName, hash: e.hash, created: e.created, iph: e.iph }));
  const schedSave = () => { try { onSched(schedList()); } catch (e) { /* a full disk must not stop the game */ } };
  function dropOpened(code) { if (opened.delete(code)) schedSave(); }
  const schedCount = () => sched.size + [...rooms.values()].filter(r => r.sched).length;

  // Loads the persisted entries (called once by the server); drops what is invalid or long over.
  function restore(list) {
    const t = now();
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!e || typeof e !== 'object' || sched.size >= SCHED_TOTAL) continue;
      const code = P.normCode(e.code);
      if (!code || sched.has(code) || rooms.has(code) || P.SCHED_TITLES.indexOf(e.title) < 0 || !Number.isFinite(e.startAt) || e.startAt + SCHED_WAIT_MS < t) continue;
      if (typeof e.hash !== 'string' || !/^[0-9a-f]{64}$/.test(e.hash)) continue;
      const base = Object.assign({}, P.CFG_DEFAULTS, { vis: 'open' });
      sched.set(code, { code, title: e.title, cfg: P.sanitizeCfg(e.cfg, base, lim.maxPlayers), startAt: Math.round(e.startAt), hostName: P.clean(e.hostName, 16) || 'Sejler', hash: e.hash,
        created: Number.isFinite(e.created) ? e.created : t, iph: typeof e.iph === 'string' && /^[0-9a-f]{64}$/.test(e.iph) ? e.iph : '' });
    }
  }

  // conn: {name, ip}. Returns {entry, secret} (the secret is not kept, only its sha256) or {err}.
  function schedule(conn, cfg, title, startAt) {
    const t = now();
    if (P.SCHED_TITLES.indexOf(title) < 0 || !Number.isFinite(startAt)) return { err: 'bad' };
    if (startAt < t + SCHED_MIN_LEAD_MS - SCHED_LEAD_SLACK_MS || startAt > t + SCHED_MAX_LEAD_MS) return { err: 'badtime' };
    if (schedCount() >= SCHED_TOTAL) return { err: 'schedfull' };
    const all = [...sched.values(), ...opened.values()];
    schedDay = schedDay.filter(x => t - x < SCHED_IP_WINDOW_MS);
    if (Math.max(schedDay.length, all.filter(e => t - e.created < SCHED_IP_WINDOW_MS).length) >= lim.schedPerDay) return { err: 'schedfull' };
    const key = ipKey(conn.ip); // an IPv6 /64 is one client
    const mine = (schedIp.get(key) || []).filter(x => t - x < SCHED_IP_WINDOW_MS);
    // the same limits from the stored entries (salted IP hash): a restart does not reset them
    const iph = ipHash(key), kept = all.filter(e => e.iph === iph);
    if (kept.length >= SCHED_PENDING_PER_IP) return { err: 'schedlimit' };
    if (Math.max(mine.length, kept.filter(e => t - e.created < SCHED_IP_WINDOW_MS).length) >= SCHED_PER_IP) { schedIp.set(key, mine); return { err: 'schedlimit' }; }
    const code = newCode();
    if (!code) return { err: 'busy' };
    mine.push(t); schedIp.set(key, mine); schedDay.push(t);
    if (schedIp.size > 500) for (const [k, v] of schedIp) if (!v.some(x => t - x < SCHED_IP_WINDOW_MS)) schedIp.delete(k);
    const secret = crypto.randomBytes(16).toString('hex');
    const base = Object.assign({}, P.CFG_DEFAULTS, { vis: 'open' }); // scheduled races are listed unless the creator says private
    const entry = { code, title, cfg: P.sanitizeCfg(cfg, base, lim.maxPlayers), startAt: Math.round(startAt), hostName: P.clean(conn.name, 16) || 'Sejler', hash: sha(secret), created: t, iph };
    sched.set(code, entry);
    schedSave();
    return { entry, secret };
  }

  // Cancels a pending race, or an opened scheduled lobby, with the creator's secret.
  function scheduleCancel(code, secret) {
    const e = sched.get(code);
    if (e) {
      if (!hashOk(secret, e.hash)) return 'denied';
      sched.delete(code); schedSave();
      return 'ok';
    }
    const r = rooms.get(code);
    if (!r || !r.sched) return 'nocode';
    if (!hashOk(secret, r.sched.hash) || r.phase !== 'lobby') return 'denied';
    broadcast(r, { t: 'schedcancelled', code, why: 'host' });
    r.phase = 'closing'; r.deleteAt = now() + HOSTLEFT_KEEP_MS;
    dropOpened(code);
    return 'ok';
  }

  // At startAt - 15 min a pending race becomes a server-run lobby (no host needed). When the server is full it retries every tick until the race is over.
  function openDue(t) {
    let changed = false;
    for (const e of [...sched.values()]) {
      if (t + SCHED_OPEN_MS < e.startAt) continue;
      if (t > e.startAt + SCHED_WAIT_MS) { sched.delete(e.code); changed = true; continue; }
      if (rooms.size >= lim.maxRooms) continue;
      const cfg = Object.assign({}, e.cfg, { seed: randInt(2147483647) });
      rooms.set(e.code, {
        code: e.code, phase: 'lobby', cfg, hostRole: 'sail', hostId: 0, players: new Map(), nextId: 1,
        T0: 0, created: t, deleteAt: 0, emptyAt: 0, results: null, finishAt: 0, lobbyAfter: false, lobbyAt: 0,
        sched: { startAt: e.startAt, title: e.title, hostName: e.hostName, hash: e.hash, fired: false },
      });
      sched.delete(e.code); opened.set(e.code, e); changed = true; // kept in the file until the race begins (or is called off)
    }
    if (changed) schedSave();
  }

  // The open race list: listed (cfg.vis 'open') lobbies and countdowns (joinable now: opened scheduled rooms first, then countdowns,
  // then the fullest lobbies), then pending scheduled races by time. Pending ones get at most LIST_SCHED_MAX rows unless the lobbies
  // leave room. Never names beyond the host nickname.
  function listRooms() {
    const t = now(), out = [];
    const row = (code, host, cfg, n, max, phase, startsIn, sc) => ({ code, host, cls: cfg.boat, course: cfg.course, wind: cfg.windKn, n, max, phase, startsIn, sched: sc });
    for (const e of sched.values()) {
      if (e.cfg.vis !== 'open') continue;
      out.push(row(e.code, e.hostName, e.cfg, 0, Math.min(e.cfg.maxP, lim.maxPlayers), 'sched', Math.max(0, e.startAt - t), { at: e.startAt, title: e.title, opens: e.startAt - SCHED_OPEN_MS }));
    }
    for (const r of rooms.values()) {
      if (r.cfg.vis !== 'open' || (r.phase !== 'lobby' && r.phase !== 'countdown')) continue;
      const host = r.players.get(r.hostId);
      const startsIn = r.phase === 'countdown' ? Math.max(0, r.T0 - t) : r.sched ? Math.max(0, r.sched.startAt - t) : null;
      out.push(row(r.code, host ? host.name : r.sched ? r.sched.hostName : '', r.cfg, [...r.players.values()].filter(p => !p.lost).length, effMaxPlayers(r), r.phase, startsIn,
        r.sched ? { at: r.sched.startAt, title: r.sched.title, opens: r.sched.startAt - SCHED_OPEN_MS } : null));
    }
    const rank = (x) => (x.phase === 'sched' ? 3 : x.sched ? 0 : x.phase === 'countdown' ? 1 : 2);
    out.sort((a, b) => rank(a) - rank(b) || (a.sched && b.sched ? a.sched.at - b.sched.at : b.n - a.n));
    const join = out.filter(x => x.phase !== 'sched'), pend = out.filter(x => x.phase === 'sched');
    const nj = Math.min(join.length, LIST_MAX - Math.min(pend.length, LIST_SCHED_MAX));
    return join.slice(0, nj).concat(pend.slice(0, LIST_MAX - nj));
  }

  // The stand-on phone says "this boat fouled me" (or, self, "I fouled this boat"). Relayed to that boat only, with the sender's id.
  // Returns true when relayed.
  function foul(r, id, offender, rule, self) {
    if (!(r.phase === 'racing' || r.phase === 'countdown') || id === offender) return false;
    const a = r.players.get(id), b = r.players.get(offender);
    if (!a || !b || !a.boat || !b.boat || b.lost || !b.send || a.final) return false;
    const t = now(), key = 'f' + offender;
    if (a.foulAt && t - (a.foulAt[key] || 0) < FOUL_PAIR_MS) return false;
    (a.foulAt = a.foulAt || {})[key] = t;
    send(b, self ? { t: 'foul', from: id, r: rule, s: 1 } : { t: 'foul', from: id, r: rule });
    return true;
  }

  // The operator takes one race off the server (kos-race unsched CODE, through the status file's dropCodes): a pending scheduled
  // race is deleted from memory and the file, an open room is closed for everyone in it. Moderation, e.g. a bad host nickname on
  // the public list. Returns 'sched' | 'room' | null (unknown code).
  function dropCode(code) {
    gone.add(code);
    if (sched.delete(code)) { schedSave(); return 'sched'; }
    const r = rooms.get(code);
    if (!r) return null;
    broadcast(r, { t: 'err', code: 'closed' });
    remove(r);
    return 'room';
  }

  function stats() {
    let players = 0;
    for (const r of rooms.values()) for (const p of r.players.values()) if (!p.lost) players++;
    return { rooms: rooms.size, players };
  }
  function setLimits(l) { Object.assign(lim, l); }

  return { rooms, sched, restore, schedule, scheduleCancel, dropCode, listRooms, foul, create, join, resume, disconnect, kick, setCfg, start, rematch, endNow, abort, lobbyAfter, state, finish, flush, tick, info, stats, setLimits, broadcast, send };
}

module.exports = { createRooms, LOST_GRACE_MS, RESULTS_KEEP_MS, PAST_KEEP_MS };
