// KØS SEJL — js/net/mp.js  (LAZY: loaded by KOS.MPStatus.load(); loading it opens no socket)
// KOS.MP: WebSocket client for the live race relay (docs/specs/live-race.md, sections 3, 4.1, 4.7, 6.3).
//   KOS.MP.connect({url, name, timeoutMs=4000, build}) -> Promise<Session>   rejects {code:'unreachable'|'timeout'|'proto'}
//   Session: id, code, room, phase, role ('host'|'player'), rtt, offset, state ('ok'|'reconnecting'|'offline'|'closed'),
//            status {mode,msg}, T0, cfg, grid, serverNow()
//     create(cfg, hostRole) -> Promise<room>   rejects {code:'closed'|'busy'|'bad'|'timeout'}
//     join(code, secret?)   -> Promise<room>   rejects {code:'nocode'|'full'|'started'|'closed'|'timeout'} or {code:'notopen', opensAt, startAt, title, now}
//     list()                -> Promise<rows>   the open race list over the socket (KOS.MP.fetchRooms needs none)
//     schedule(cfg, title, startAt) -> Promise<{code, secret, title, startAt, opensAt, cfg}>   rejects {code:'badtime'|'schedlimit'|'schedfull'|'closed'|'busy'|'bad'}
//     schedCancel(code, secret)     -> Promise<{code, why}>   rejects {code:'nocode'|'bad'}
//     setCfg(partial), kick(id), start(), rematch(), resume(token), hostEnd(), hostAbort(), hostLobby(on), leave(), send(msg), close()
//     retryNow()            the "Prøv nu" button / back online: an immediate resume attempt (still one retry chain)
//     detach()              the race screen was left ("Til kortet", back, quit): the socket is closed, the seat is KEPT (no leave)
//     on(evt, fn) -> off     evts: room, start, states, fin, foul, res, rematch, hostleft, kicked, schedcancelled, reconnecting, reconnected,
//                            away (15 s reconnecting: "still trying"), gone ({rows}: the race ended while away, nocode), replaced (4409:
//                            the seat is open in another window), detached, offline (lost with no seat), status, error
//   KOS.MP.parseJoin(hash) -> 'ABCD'|null     KOS.MP.normCode(str) -> 'ABCD'|null
//   KOS.MP.fetchRooms(wsUrl, {timeoutMs}) -> Promise<rows>   GET /rooms next to the socket URL (no socket); rejects {code:'unreachable'|'rate'}
//   KOS.MP.roomsUrl(wsUrl) -> 'https://host/mp/rooms'
//   KOS.MP.seat() -> {code,id,key,url,exp,phase,startedAt}|null   the rejoin entry in localStorage (spec E4): exp = last contact + 2 h,
//                         refreshed on contact and every 60 s; cleared on retire (leave), kick, hostleft, results and expiry
//   KOS.MP.lastResult(code?) -> {code, rows, myId, at}|null   the official table of the last race (30 min, localStorage)
//   KOS.MP.retire(seat, {url, name}) -> Promise   "Udgå" from the title/hub banner: resume + leave, then the seat is forgotten (always resolves)
//   KOS.MP.clearSeat()    KOS.MP.LEVEL   client protocol level sent in hello (cp); the server can refuse builds below it ('old')
// All rejections are plain {code} objects; nothing is thrown out of socket handlers; no console output.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const ALPHABET = 'ACDEFGHJKMNPRTUVWXY34679';
  const CODE_RE = new RegExp('^[' + ALPHABET + ']{4}$');
  const TOKEN_KEY = 'kos.mp.rejoin';
  const SEAT_KEY = 'kos.mp.seat';   // localStorage: {code, id, key, url, exp, phase, startedAt}: the way back into a race after the page was closed, swiped away or killed
  const SEAT_MS = 2 * 3600000;      // exp = last contact + this (the server keeps a seat, or its archived result, as long)
  const SNAP_KEY = 'kos.mp.snap';   // localStorage copy of the race screen's own-boat snapshot (js/modes/race.js): goes with the seat
  const RESULT_KEY = 'kos.mp.lastResult', RESULT_MS = 30 * 60000; // localStorage: {code, rows, myId, at}: the official table, for a late resume
  const LEVEL = 2;                  // client protocol level (hello.cp): 2 = version gate, seat rejoin in every phase
  const PENDING_KEY = 'kos.mp.pending'; // {code, at, auto}: the page may reload (update, refresh); on load the lobby resumes or joins again
  const AWAY_MS = 15000;      // reconnecting this long (counted in the foreground): "still trying" + "Prøv nu", the race shows unofficial (reversible)
  const BACKOFF = [500, 1000, 2000, 5000, 10000]; // then every 10 s, +-20 % jitter; retries never stop while a seat exists (spec E1)
  const WATCHDOG_MS = 2500;   // countdown/racing: nothing at all from the server (no S batch, no pong) for this long = the socket is dead, reconnect
  const LOBBY_DOG_MS = 8000;  // lobby: pongs come every 3 s; a half-open socket must not miss the start
  const STATE = () => KOS.MPState || (typeof require === 'function' ? require('./mpstate.js') : null);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function normCode(s) {
    const c = String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '');
    return CODE_RE.test(c) ? c : null;
  }
  function parseJoin(hash) {
    const m = /(?:^|[#&])(?:join|live)=([^&]*)/.exec(String(hash || '')); // #live=CODE is the same link (scheduled races)
    if (!m) return null;
    let v = m[1];
    try { v = decodeURIComponent(v); } catch (e) { /* keep raw */ }
    return normCode(v);
  }
  // x: {phase, startedAt (the gun, server ms; 0 before it), at (last contact)}. Clearing with x.code only removes the record of that race
  // (a session that ends must not wipe the seat of another race this phone is still in)
  function storeSeat(tok, url, x) {
    try {
      if (typeof localStorage === 'undefined') return;
      x = x || {};
      if (!tok && x.code) { const o = JSON.parse(localStorage.getItem(SEAT_KEY)); if (o && o.code !== x.code) return; }
      if (tok) localStorage.setItem(SEAT_KEY, JSON.stringify({ code: tok.code, id: tok.id, key: tok.key, url: String(url || ''), exp: (x.at || Date.now()) + SEAT_MS,
        phase: String(x.phase || 'lobby'), startedAt: +x.startedAt || 0 }));
      else {
        localStorage.removeItem(SEAT_KEY);
        const sn = JSON.parse(localStorage.getItem(SNAP_KEY));
        if (sn && (!x.code || sn.code === x.code)) localStorage.removeItem(SNAP_KEY);
      }
    } catch (e) { /* private mode, storage full */ }
  }
  function saveResult(code, rows, myId) {
    try { if (Array.isArray(rows) && normCode(code)) localStorage.setItem(RESULT_KEY, JSON.stringify({ code, rows, myId, at: Date.now() })); } catch (e) { /* ignore */ }
  }
  function lastResult(code) {
    try {
      const o = JSON.parse(localStorage.getItem(RESULT_KEY));
      if (o && Array.isArray(o.rows) && Date.now() - (+o.at || 0) < RESULT_MS) return !code || o.code === code ? o : null;
      if (o) localStorage.removeItem(RESULT_KEY);
    } catch (e) { /* none */ }
    return null;
  }
  function seat() {
    try {
      const o = JSON.parse(localStorage.getItem(SEAT_KEY));
      if (o && normCode(o.code) && Number.isInteger(o.id) && typeof o.key === 'string' && o.key && typeof o.exp === 'number' && o.exp > Date.now()) return o;
      if (o) localStorage.removeItem(SEAT_KEY); // expired or malformed
    } catch (e) { /* none */ }
    return null;
  }
  function store(tok, url, x) {
    storeSeat(tok, url, x);
    try {
      if (typeof sessionStorage === 'undefined') return;
      if (!tok && x && x.code) { const o = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); if (o && o.code !== x.code) return; }
      if (tok) { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); sessionStorage.setItem(PENDING_KEY, JSON.stringify({ code: tok.code, at: Date.now(), auto: true })); }
      else { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(PENDING_KEY); }
    } catch (e) { /* private mode */ }
  }
  function savedToken() {
    try { const o = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); if (o && normCode(o.code) && Number.isInteger(o.id) && typeof o.key === 'string') return o; } catch (e) { /* fall through */ }
    const s = seat(); // a new tab/process: the localStorage entry is the token
    return s ? { code: s.code, id: s.id, key: s.key } : null;
  }

  function connect(opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || 7000; // a phone on a weak mobile signal needs more than 4 s for TLS + WebSocket
    return new Promise((resolve, reject) => {
      let ws = null, done = false;
      const fail = (code, m) => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { ws && ws.close(); } catch (e) { /* ignore */ }
        reject(m && m.min ? { code, min: m.min } : { code });
      };
      const timer = setTimeout(() => fail('timeout'), timeoutMs);
      openSocket(opts, (sock, welcome) => {
        if (done) { try { sock.close(); } catch (e) { /* ignore */ } return; }
        done = true; clearTimeout(timer);
        resolve(makeSession(opts, sock, welcome));
      }, fail, (s) => { ws = s; });
    });
  }

  // opens a socket, sends hello, calls ok(sock, welcomeMsg) or bad(code). onSock(sock) lets the caller close it.
  function openSocket(opts, ok, bad, onSock) {
    let sock;
    try { sock = new WebSocket(opts.url); } catch (e) { bad('unreachable'); return; }
    onSock && onSock(sock);
    let welcomed = false;
    sock.onopen = () => {
      try { sock.send(JSON.stringify({ t: 'hello', v: 2, name: String(opts.name || ''), build: String(opts.build || 'web'), ver: String(opts.ver || opts.build || '').slice(0, 16), sha: String(opts.sha || '').slice(0, 12), cp: LEVEL })); } catch (e) { bad('unreachable'); }
    };
    sock.onerror = () => { if (!welcomed) bad('unreachable'); };
    sock.onclose = () => { if (!welcomed) bad('unreachable'); };
    sock.onmessage = (ev) => {
      if (welcomed) return;
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
      if (m.t === 'welcome') { welcomed = true; sock.onopen = sock.onerror = sock.onclose = sock.onmessage = null; ok(sock, m); }
      else if (m.t === 'err') bad(m.code === 'proto' ? 'proto' : m.code === 'old' ? 'old' : 'unreachable', m);
    };
  }

  // a server 'err' as a plain rejection: {code} plus the extras some codes carry ('old': min; 'notopen': opensAt, startAt, title, now =
  // the server's clock, so a phone whose clock is off can count down to the server's opensAt)
  function errOf(m) {
    const e = { code: m.code || 'bad' };
    if (m.min) e.min = m.min;
    if (m.code === 'notopen') ['opensAt', 'startAt', 'now'].forEach(k => { if (typeof m[k] === 'number') e[k] = m[k]; });
    if (m.code === 'notopen' && typeof m.title === 'string') e.title = m.title;
    if (m.code === 'nocode' && Array.isArray(m.rows)) e.rows = m.rows; // a resume after the race ended: the official table (spec E4)
    return e;
  }

  // The open race list over plain HTTP, next to the socket: ws(s)://host/x/ws -> http(s)://host/x/rooms. No socket, no seat.
  function roomsUrl(wsUrl) {
    const u = String(wsUrl || '');
    if (!/^wss?:\/\//.test(u)) return '';
    return u.replace(/^ws/, 'http').replace(/[?#].*$/, '').replace(/\/ws$/, '').replace(/\/$/, '') + '/rooms';
  }
  function fetchRooms(wsUrl, o) {
    const url = roomsUrl(wsUrl), ms = (o && o.timeoutMs) || 5000;
    return new Promise((res, rej) => {
      if (!url || typeof fetch !== 'function') { rej({ code: 'unreachable' }); return; }
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { /* ignore */ } rej({ code: 'unreachable' }); }, ms);
      fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(r => {
        if (r.status === 429) throw { code: 'rate' };
        if (!r.ok) throw { code: 'unreachable' };
        return r.json();
      }).then(j => { clearTimeout(timer); res(j && Array.isArray(j.rooms) ? j.rooms.filter(x => x && normCode(x.code)) : []); },
        e => { clearTimeout(timer); rej(e && e.code === 'rate' ? e : { code: 'unreachable' }); });
    });
  }

  function makeSession(opts, sock0, welcome) {
    const S = {
      id: 0, code: null, room: null, phase: 'lobby', role: 'player', rtt: 0, offset: welcome.now - now(), state: 'ok',
      status: { mode: welcome.mode, msg: welcome.msg || '' }, T0: 0, cfg: null, grid: null, token: null,
    };
    const subs = {};
    let sock = sock0, samples = [], bestRtt = Infinity, pings = 0, pingTimer = 0, fastTimer = 0;
    let final = false, lostAt = 0, retryTimer = 0, pending = null, lastRx = now(), grace = 0, dogTimer = 0, lastForce = 0;
    let tries = 0, trying = false, dropTry = null, tryAt = 0, awayTimer = 0, lastContact = Date.now(), seatAt = 0, seatTimer = 0;
    S.serverNow = () => now() + S.offset;
    S.away = false;

    const emit = (evt, arg, arg2) => {
      (subs[evt] || []).slice().forEach(fn => { try { fn(arg, arg2); } catch (e) { /* listener bug must not kill the socket */ } });
    };
    S.on = (evt, fn) => {
      (subs[evt] = subs[evt] || []).push(fn);
      return () => { const l = subs[evt] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    };
    const racing = () => S.phase === 'countdown' || S.phase === 'racing';
    const seated = () => !!S.token && (S.phase === 'lobby' || racing()); // a seat the server keeps for us: a lost socket is resumed, never given up
    // a send that fails, or a socket that is not OPEN while racing, starts the reconnect (the watchdog below does the same on silence)
    const raw = (msg) => {
      try {
        if (sock && sock.readyState === 1) { sock.send(JSON.stringify(msg)); return true; }
      } catch (e) { if (racing()) setTimeout(() => forceReconnect('send'), 0); return false; }
      if (racing() && S.state === 'ok' && msg && msg.t === 'st') setTimeout(() => forceReconnect('notopen'), 0);
      return false;
    };
    S.send = raw;

    // ---- clock sync (spec 4.1)
    // Every pong joins a ring of the last 8; the offset is the median of the 3 lowest-rtt samples (a lucky early low rtt can no longer
    // lock out all later samples, which froze the offset for good on wifi/phones). Ping every 3 s. A far-off estimate (the phone slept,
    // timers were throttled, the clock stepped) is stepped to at once; small differences are slewed (<= 15 ms per pong, so no visible jump).
    const PING_MS = 3000;
    const pingEvery = () => (racing() ? 1000 : PING_MS); // racing: a pong at least every second doubles as the liveness signal
    let lastPingAt = 0, step = true, synced = false, disagree = 0;
    S.clk = { steps: 0, pongs: 0, resyncs: 0, lastPong: 0, jit: 0, lastRtt: 0, err: 0 };
    function ping() {
      const t = now();
      if (lastPingAt && t - lastPingAt > PING_MS * 2.5) resync(); // our timer was starved (background tab, sleep): the old estimate is suspect
      lastPingAt = t; raw({ t: 'ping', c: t });
    }
    function burst(n) {
      clearTimeout(fastTimer); clearInterval(pingTimer);
      pings = 0;
      const fast = () => {
        lastPingAt = now(); raw({ t: 'ping', c: lastPingAt });
        if (++pings < n) fastTimer = setTimeout(fast, 200);
        else { pingTimer = setInterval(() => { if (now() - lastPingAt >= pingEvery() - 50) ping(); }, 500); pingTimer.unref && pingTimer.unref(); }
      };
      fast();
    }
    function startSync() { samples = []; synced = false; step = true; burst(8); }
    function resync() { S.clk.resyncs++; samples = []; step = true; burst(5); }
    function onPong(m) {
      const M = STATE(); if (!M || typeof m.c !== 'number' || typeof m.s !== 'number') return;
      const t1 = now(), smp = M.clockSample(m.c, t1, m.s);
      if (!(smp.rtt >= 0)) return;
      smp.at = t1; samples.push(smp); if (samples.length > 8) samples.shift();
      // a run of samples that all disagree with the estimate (the clock stepped, the device slept) beats the old low-rtt ones
      disagree = Math.abs(smp.offset - S.offset) > 80 ? disagree + 1 : 0;
      if (disagree >= 3) { samples = samples.slice(-3); disagree = 0; step = true; }
      while (samples.length > 3 && t1 - samples[0].at > 12000) samples.shift(); // drifting clocks: old samples are stale
      const pk = M.pickOffset(samples); if (!pk) return;
      const c = S.clk; c.pongs++; c.lastPong = t1; c.jit += 0.2 * (Math.abs(smp.rtt - c.lastRtt) - c.jit); c.lastRtt = smp.rtt;
      S.rtt = pk.rtt;
      const err = pk.offset - S.offset; c.err = err;
      if (!synced) { S.offset = pk.offset; synced = true; c.steps++; }
      else if (step && samples.length >= 3) { S.offset = pk.offset; step = false; c.steps++; }
      else if (Math.abs(err) > 120 && samples.length >= 3) { S.offset = pk.offset; c.steps++; }
      else { let d = 0.3 * err; if (d > 15) d = 15; else if (d < -15) d = -15; S.offset += d; }
    }
    // a phone that was asleep or a hidden tab: timers stood still, so measure again as soon as we are back. Back in the foreground, back
    // online, a bfcache restore or focus: a lost seat is tried again AT ONCE (spec E1; still one retry chain)
    function wake(ev) {
      if (final) return;
      if (ev && ev.type === 'visibilitychange' && document.hidden) return;
      if (ev && ev.type !== 'online') grace = now() + 3000; // timers were starved while hidden: the silence is not the server's fault, measure again first
      if (S.state === 'reconnecting') { if (!S.away) armAway(); retryNow(ev && ev.type === 'online'); } // the 15 s count starts again, in the foreground
      else if (S.state === 'ok' && sock && sock.readyState === 1) { if (ev && ev.type !== 'focus') { resync(); raw({ t: 'ping', c: now() }); } }
      else if (S.state === 'ok' && seated()) forceReconnect('wake');
    }
    const wakeOn = [];
    try {
      if (typeof document !== 'undefined' && document.addEventListener) { document.addEventListener('visibilitychange', wake); wakeOn.push([document, 'visibilitychange']); }
      if (typeof window !== 'undefined' && window.addEventListener) ['online', 'pageshow', 'focus'].forEach(e => { window.addEventListener(e, wake); wakeOn.push([window, e]); });
    } catch (e) { /* no document */ }

    function setRoom(room) {
      const ph = S.phase;
      S.room = room; S.phase = room.phase;
      S.role = room.hostId === S.id ? 'host' : 'player';
      if (ph !== S.phase) touchSeat(true);
    }
    function setToken(m) {
      S.id = m.id; S.code = m.code; S.token = { code: m.code, id: m.id, key: m.key };
      store(S.token, opts.url, seatX());
    }
    function clearToken() { S.token = null; store(null, null, { code: S.code }); }
    // the seat record (spec E4): exp = last contact + 2 h, rewritten at most once a minute (and at once when the phase changes)
    const seatX = () => ({ phase: S.phase, startedAt: S.T0 || 0, at: lastContact });
    function touchSeat(force) {
      if (!S.token || final) return;
      const t = Date.now();
      if (!force && t - seatAt < 60000) return;
      seatAt = t; storeSeat(S.token, opts.url, seatX());
    }
    seatTimer = setInterval(() => touchSeat(true), 60000); seatTimer.unref && seatTimer.unref();

    // ---- message handling (shared by the first socket and reconnected sockets)
    function handle(m) {
      switch (m.t) {
        case 'pong': onPong(m); break;
        case 'created': case 'joined':
          setToken(m); setRoom(m.room);
          if (pending && pending.t === m.t) { const p = pending; pending = null; clearTimeout(p.timer); p.res(m.room); }
          else emit('room', m.room);
          break;
        case 'rooms': if (pending && pending.t === 'rooms') { const p = pending; pending = null; clearTimeout(p.timer); p.res(Array.isArray(m.rooms) ? m.rooms : []); } break;
        case 'scheduled': if (pending && pending.t === 'scheduled') { const p = pending; pending = null; clearTimeout(p.timer); p.res(m); } break;
        case 'schedcancelled': // our own cancel request, or the scheduled room we sit in was called off (why 'host' | 'few')
          if (pending && pending.t === 'schedcancelled') { const p = pending; pending = null; clearTimeout(p.timer); p.res({ code: m.code, why: m.why }); }
          else if (S.room && m.code === S.code) { clearToken(); final = true; S.phase = 'closed'; emit('schedcancelled', { code: m.code, why: m.why === 'host' ? 'host' : 'few' }); }
          break;
        case 'room': setRoom(m.room); emit('room', m.room); break;
        case 'start': { // the server repeats 'start' on every resume: the same gun on a session that already has it is NOT a new race (it used to relaunch the race screen = the boat went back to the start line)
          const dup = S.T0 === m.T0 && !!S.grid;
          S.T0 = m.T0; S.cfg = m.cfg; S.grid = m.grid; if (S.phase === 'lobby') S.phase = 'countdown';
          touchSeat(true);
          if (!dup) emit('start', { T0: m.T0, cfg: m.cfg, grid: m.grid });
          break;
        }
        case 's': S.lastStates = now(); emit('states', Array.isArray(m.a) ? m.a : []); break;
        case 'me': S.me = { s: Array.isArray(m.s) ? m.s : null, fin: typeof m.fin === 'number' ? m.fin : null, T0: m.T0, now: m.now }; emit('restore', S.me); break; // the server's copy of my last state, sent on every resume
        case 'fin': emit('fin', { id: m.id, ms: m.ms }); break;
        case 'foul': if (typeof m.from === 'number') emit('foul', { from: m.from, r: String(m.r || ''), self: m.s === 1 }); break; // another phone says our boat fouled theirs (self: its own boat fouled ours)
        case 'fwin': if (typeof m.endAt === 'number') { S.finishAt = m.endAt; emit('fwin', { endAt: m.endAt }); } break;
        case 'res': S.phase = 'results'; S.rows = m.rows; S.lastToken = S.token || S.lastToken; saveResult(S.code, m.rows, S.id); clearToken(); emit('res', m.rows); break;
        case 'rematch': // host started a new race in the same room: back to the lobby with a fresh resume token
          if (m.room) { if (S.lastToken) { S.token = S.lastToken; store(S.token, opts.url, seatX()); } S.T0 = 0; S.grid = null; S.finishAt = 0; S.rows = null; setRoom(m.room); emit('rematch', m.room, !!m.aborted); }
          break;
        case 'hostleft': clearToken(); S.phase = 'closed'; emit('hostleft'); break;
        case 'kicked': clearToken(); final = true; emit('kicked'); break;
        case 'status': S.status = { mode: m.mode, msg: m.msg || '' }; emit('status', S.status); break;
        case 'err':
          if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.rej(errOf(m)); }
          else emit('error', { code: m.code, msg: m.msg });
          break;
        default: break;
      }
    }
    function attach(s) {
      s.onmessage = (ev) => {
        lastRx = now(); lastContact = Date.now();
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
        if (m && typeof m === 'object') { try { handle(m); } catch (e) { /* ignore */ } }
        touchSeat(false);
      };
      s.onerror = () => {};
      s.onclose = (ev) => { if (s !== sock) return; if (ev && ev.code === 4409) replaced(); else onLost(); }; // a socket we dropped ourselves never gets here
    }

    // ---- loss and reconnect (spec 4.7, live-rules spec E1/E5/E7)
    // the watchdog, in every phase with a seat: no frame at all for WATCHDOG_MS (countdown/racing) or LOBBY_DOG_MS (lobby), and not just
    // back from the background => drop the socket and resume
    function forceReconnect(why) {
      if (final || S.state !== 'ok' || !seated()) return;
      const t = Date.now();
      if (t - lastForce < 1500) return;
      lastForce = t; S.forced = (S.forced || 0) + 1; S.forcedWhy = why;
      const old = sock; sock = null;
      if (old) { old.onclose = old.onmessage = old.onerror = null; try { old.close(); } catch (e) { /* ignore */ } }
      lose();
    }
    function dog() {
      if (final || S.state !== 'ok' || !seated()) return;
      if (now() < grace) return;
      if (!sock || sock.readyState !== 1) { forceReconnect('notopen'); return; }
      if (now() - lastRx > (racing() ? WATCHDOG_MS : LOBBY_DOG_MS)) forceReconnect('silent');
    }
    dogTimer = setInterval(dog, 500); dogTimer.unref && dogTimer.unref();
    S.watchdog = dog;
    S.reconnects = 0;
    // test hooks (headless suites): a dropped socket, and a socket that is open but dead (nothing comes in, nothing goes out)
    S.testDrop = () => { try { sock && sock.close(); } catch (e) { /* ignore */ } };
    S.testMute = () => { if (!sock) return; sock.onmessage = () => {}; sock.send = () => {}; };
    function onLost() {
      clearTimeout(fastTimer); clearInterval(pingTimer);
      if (S.state === 'reconnecting') return; // forceReconnect already took over
      if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.rej({ code: 'unreachable' }); }
      if (final || S.state === 'closed' || S.state === 'offline') return;
      if (seated()) lose(); // the lobby too: a locked phone must not lose its seat
      else { S.state = 'offline'; emit('offline'); }
    }
    // the seat may still be alive: there is no final "offline" while we hold it. Retries stop only on nocode, res, kicked, hostleft
    // (and 4409, a leave, a detach).
    function lose() {
      clearTimeout(fastTimer); clearInterval(pingTimer);
      S.state = 'reconnecting'; lostAt = Date.now(); tries = 0; S.away = false;
      emit('reconnecting');
      armAway();
      scheduleRetry();
    }
    function armAway() {
      clearTimeout(awayTimer);
      awayTimer = setTimeout(() => { if (S.state === 'reconnecting' && !S.away) { S.away = true; emit('away'); } }, AWAY_MS);
    }
    function scheduleRetry() {
      clearTimeout(retryTimer);
      if (S.state !== 'reconnecting' || trying) return; // one retry chain at a time
      const wait = BACKOFF[Math.min(tries, BACKOFF.length - 1)] * (0.8 + 0.4 * Math.random());
      retryTimer = setTimeout(attempt, Math.round(wait));
    }
    // "Prøv nu", back online, back in the foreground: the backoff starts over with an immediate try. An attempt still in flight that went
    // out over the dead network (its packets are lost, it would only end at its 6 s guard) is dropped for a new one: always when the
    // network just came back (fresh = the 'online' event), else when it is older than 1.5 s
    function retryNow(fresh) {
      if (final || S.state !== 'reconnecting') return;
      tries = 0;
      if (trying && dropTry && (fresh === true || now() - tryAt > 1500)) dropTry();
      if (trying) return; // a fresh attempt in flight goes on; when it fails the next one is 0.5 s later
      clearTimeout(retryTimer); attempt();
    }
    S.retryNow = retryNow;
    function attempt() {
      if (S.state !== 'reconnecting' || trying || final) return;
      trying = true; tries++; S.tries = (S.tries || 0) + 1; tryAt = now();
      let s2 = null, over = false;
      const drop = () => { if (over) return false; over = true; trying = false; dropTry = null; clearTimeout(guard); try { s2 && s2.close(); } catch (e) { /* ignore */ } return true; };
      const next = () => { if (drop()) scheduleRetry(); };
      dropTry = drop;
      const guard = setTimeout(next, 6000); // TLS + hello + resume on a weak phone signal
      openSocket(opts, (sk) => {
        if (over || S.state !== 'reconnecting') { try { sk.close(); } catch (e) { /* ignore */ } return; }
        s2 = sk;
        let resumed = false;
        sk.onmessage = (ev) => {
          let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
          if (resumed) return;
          if (over) { try { sk.close(); } catch (e) { /* ignore */ } return; } // a dropped attempt that got through late: the newer one is the chain
          if (m.t === 'joined') {
            resumed = true; clearTimeout(guard); over = true; trying = false;
            clearTimeout(awayTimer); clearTimeout(retryTimer);
            sock = sk; attach(sk); lastRx = now(); lastContact = Date.now(); grace = now() + 2000;
            S.state = 'ok'; S.away = false; S.reconnects++; handle(m); touchSeat(true); startSync(); emit('reconnected');
          } else if (m.t === 'err' && m.code === 'nocode') { // the race is over and its room gone (or the seat was dropped): stop for good
            over = true; clearTimeout(guard); trying = false;
            try { sk.close(); } catch (e) { /* ignore */ }
            const rows = Array.isArray(m.rows) ? m.rows : null;
            if (rows) saveResult(S.code, rows, S.id);
            clearToken(); shut(); emit('gone', { rows: rows || (lastResult(S.code) || {}).rows || null });
          } else if (m.t === 'err') next();
        };
        sk.onclose = () => { if (!resumed) next(); };
        sk.onerror = () => {};
        try { sk.send(JSON.stringify({ t: 'resume', code: S.token.code, id: S.token.id, key: S.token.key })); } catch (e) { next(); }
      }, () => next(), (s) => { s2 = s; });
    }
    // 4409: the server gave this seat to a newer socket (the race is open in another window). Never steal it back.
    function replaced() {
      S.token = null; // this tab forgets it (a reload here must not resume); the seat record in localStorage belongs to the other window now
      try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
      S.replaced = true; shut(); emit('replaced');
    }

    // ---- requests
    function request(t, msg) {
      return new Promise((res, rej) => {
        if (pending) { rej({ code: 'bad' }); return; }
        const timer = setTimeout(() => { if (pending && pending.timer === timer) { pending = null; rej({ code: 'timeout' }); } }, 5000);
        pending = { t, res, rej, timer };
        raw(msg);
      });
    }
    S.create = (cfg, hostRole) => request('created', { t: 'create', cfg: cfg || {}, hostRole: hostRole === 'watch' ? 'watch' : 'sail' });
    S.join = (code, secret) => {
      const c = normCode(code);
      const msg = { t: 'join', code: c };
      if (typeof secret === 'string' && /^[0-9a-f]{32}$/.test(secret)) msg.secret = secret; // the creator of a scheduled race takes the host seat
      return c ? request('joined', msg) : Promise.reject({ code: 'nocode' });
    };
    S.list = () => request('rooms', { t: 'list' });
    S.schedule = (cfg, title, startAt) => request('scheduled', { t: 'sched', cfg: cfg || {}, title: String(title || ''), startAt: Math.round(+startAt || 0) });
    S.schedCancel = (code, secret) => request('schedcancelled', { t: 'schedcancel', code: normCode(code) || '', secret: String(secret || '') });
    S.setCfg = (cfg) => raw({ t: 'cfgset', cfg });
    S.kick = (id) => raw({ t: 'kick', id });
    S.start = () => raw({ t: 'start' });
    S.rematch = () => raw({ t: 'rematch' });
    S.resume = (tok) => { S.resumed = true; return request('joined', { t: 'resume', code: tok.code, id: tok.id, key: tok.key }); };
    S.hostEnd = () => raw({ t: 'hend' });
    S.hostAbort = () => raw({ t: 'habort' });
    S.hostLobby = (on) => raw({ t: 'hlobby', on: !!on });
    function shut() {
      final = true; S.state = 'closed';
      clearTimeout(fastTimer); clearTimeout(retryTimer); clearTimeout(awayTimer); clearInterval(pingTimer); clearInterval(dogTimer); clearInterval(seatTimer);
      wakeOn.forEach(([el, e]) => { try { el.removeEventListener(e, wake); } catch (x) { /* ignore */ } });
      const s = sock; sock = null;
      if (s) { s.onclose = s.onmessage = s.onerror = null; try { s.close(); } catch (e) { /* ignore */ } }
    }
    // withdrawing: the server makes the seat RET/DNF. Only the explicit "Udgå af løbet" / lobby "Forlad" does this (spec E3)
    S.leave = () => { raw({ t: 'leave' }); clearToken(); shut(); };
    S.close = () => shut();
    // leaving the race screen ("Til kortet", back, the app closed): the seat stays for a resume from the title/hub banner
    S.detach = () => { if (final) return; touchSeat(true); shut(); emit('detached'); };

    attach(sock);
    startSync();
    return S;
  }

  // The thin facade race.js sees as host.live (spec 5.1): no socket knowledge, easy to stub in tests.
  function liveFacade(sess) {
    const room = sess.room || {};
    const cfg = sess.cfg || room.cfg || {};
    return {
      cfg, grid: sess.grid || [], T0: sess.T0, myId: sess.id, code: sess.code,
      role: room.hostRole === 'watch' && room.hostId === sess.id ? 'watch' : 'sail',
      countdownS: cfg.countdownS || 20,
      get state() { return sess.state; }, get away() { return !!sess.away; },
      get resumed() { return !!sess.resumed; }, get restore() { return sess.me || null; }, // after a reload: the seat's last state from the server (me = null: nothing stored)
      serverNow: () => sess.serverNow(),
      get rtt() { return sess.rtt || 0; }, // ms, lowest of the last 8 pings
      get offset() { return sess.offset; }, get clk() { return sess.clk; }, // clock offset (server - performance.now) and sync counters, for the network overlay
      send: msg => sess.send(msg),
      on: (evt, fn) => sess.on(evt, fn),
      rematch: () => sess.rematch(),
      isHost: room.hostId === sess.id,
      get finishAt() { return sess.finishAt || 0; },
      get players() { return (sess.room && sess.room.players) || room.players || []; },
      hostEnd: () => sess.hostEnd(), hostAbort: () => sess.hostAbort(), hostLobby: on => sess.hostLobby(on), kick: id => sess.kick(id),
      leave: () => { if (sess.phase === 'lobby' && sess.state === 'ok') return; /* the host aborted/rematched: the lobby owns the seat now */ try { sess.leave(); } catch (e) { /* ignore */ } },
      // leaving the race screen keeps the seat (spec E3); the lobby still owns the session after an official result or a rematch
      detach: () => { if (sess.state === 'closed' || sess.phase === 'results' || sess.phase === 'lobby' && sess.state === 'ok') return; try { sess.detach(); } catch (e) { /* ignore */ } },
      retire: () => { try { sess.leave(); } catch (e) { /* ignore */ } }, // "Udgå af løbet": the server makes it RET/DNF
      retryNow: () => { try { sess.retryNow(); } catch (e) { /* ignore */ } },
    };
  }

  // "Udgå" on the title/hub banner (spec E4): resume the seat just long enough to send leave. Offline or gone: the seat is forgotten here
  // anyway (the server lists it lost/DNF). Always resolves.
  function retire(st, o) {
    o = o || {};
    const forget = () => { storeSeat(null); try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); if (!t || t.code === st.code) { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(PENDING_KEY); } } catch (e) { /* ignore */ } };
    if (!st || !st.code) { forget(); return Promise.resolve(false); }
    return connect({ url: st.url || o.url, name: o.name, build: o.build, ver: o.ver, sha: o.sha, timeoutMs: 6000 })
      .then(sess => sess.resume({ code: st.code, id: st.id, key: st.key }).then(() => { sess.leave(); return true; }, () => { sess.close(); return false; }))
      .catch(() => false).then(v => { forget(); return v; });
  }

  KOS.MP = { connect, parseJoin, normCode, liveFacade, savedToken, seat, clearSeat: () => storeSeat(null), lastResult, retire, fetchRooms, roomsUrl, LEVEL, ALPHABET };
  if (typeof module !== 'undefined' && module.exports) module.exports = KOS.MP;
})(typeof window !== 'undefined' ? window : globalThis);
