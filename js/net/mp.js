// KØS SEJL — js/net/mp.js  (LAZY: loaded by KOS.MPStatus.load(); loading it opens no socket)
// KOS.MP: WebSocket client for the live race relay (docs/specs/live-race.md, sections 3, 4.1, 4.7, 6.3).
//   KOS.MP.connect({url, name, timeoutMs=4000, build}) -> Promise<Session>   rejects {code:'unreachable'|'timeout'|'proto'}
//   Session: id, code, room, phase, role ('host'|'player'), rtt, offset, state ('ok'|'reconnecting'|'offline'|'closed'),
//            status {mode,msg}, T0, cfg, grid, serverNow()
//     create(cfg, hostRole) -> Promise<room>   rejects {code:'closed'|'busy'|'bad'|'timeout'}
//     join(code)            -> Promise<room>   rejects {code:'nocode'|'full'|'started'|'closed'|'timeout'}
//     setCfg(partial), kick(id), start(), rematch(), resume(token), hostEnd(), hostAbort(), hostLobby(on), leave(), send(msg), close()
//     on(evt, fn) -> off     evts: room, start, states, fin, res, rematch, hostleft, kicked, reconnecting, reconnected, offline, status, error
//   KOS.MP.parseJoin(hash) -> 'ABCD'|null     KOS.MP.normCode(str) -> 'ABCD'|null
//   KOS.MP.seat() -> {code,id,key,url,exp}|null   the rejoin entry kept in localStorage for 2 h (survives closing the page / an update reload)
//   KOS.MP.clearSeat()    KOS.MP.LEVEL   client protocol level sent in hello (cp); the server can refuse builds below it ('old')
// All rejections are plain {code} objects; nothing is thrown out of socket handlers; no console output.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const ALPHABET = 'ACDEFGHJKMNPRTUVWXY34679';
  const CODE_RE = new RegExp('^[' + ALPHABET + ']{4}$');
  const TOKEN_KEY = 'kos.mp.rejoin';
  const SEAT_KEY = 'kos.mp.seat';   // localStorage: {code, id, key, url, exp}: the way back into a race after the page was closed, swiped away or killed
  const SEAT_MS = 2 * 3600000;      // the room lives at most this long on the server
  const LEVEL = 2;                  // client protocol level (hello.cp): 2 = version gate, seat rejoin in every phase
  const PENDING_KEY = 'kos.mp.pending'; // {code, at, auto}: the page may reload (update, refresh); on load the lobby resumes or joins again
  const RECONNECT_MS = 15000; // counted from the moment the page is in the foreground again (a hidden phone must not run it down)
  const WATCHDOG_MS = 2500;   // racing: nothing at all from the server (no S batch, no pong) for this long = the socket is dead, reconnect
  const STATE = () => KOS.MPState || (typeof require === 'function' ? require('./mpstate.js') : null);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function normCode(s) {
    const c = String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '');
    return CODE_RE.test(c) ? c : null;
  }
  function parseJoin(hash) {
    const m = /(?:^|[#&])join=([^&]*)/.exec(String(hash || ''));
    if (!m) return null;
    let v = m[1];
    try { v = decodeURIComponent(v); } catch (e) { /* keep raw */ }
    return normCode(v);
  }
  function storeSeat(tok, url) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (tok) localStorage.setItem(SEAT_KEY, JSON.stringify({ code: tok.code, id: tok.id, key: tok.key, url: String(url || ''), exp: Date.now() + SEAT_MS }));
      else localStorage.removeItem(SEAT_KEY);
    } catch (e) { /* private mode, storage full */ }
  }
  function seat() {
    try {
      const o = JSON.parse(localStorage.getItem(SEAT_KEY));
      if (o && normCode(o.code) && Number.isInteger(o.id) && typeof o.key === 'string' && o.key && typeof o.exp === 'number' && o.exp > Date.now()) return o;
      if (o) localStorage.removeItem(SEAT_KEY); // expired or malformed
    } catch (e) { /* none */ }
    return null;
  }
  function store(tok, url) {
    storeSeat(tok, url);
    try {
      if (typeof sessionStorage === 'undefined') return;
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
      try { sock.send(JSON.stringify({ t: 'hello', v: 1, name: String(opts.name || ''), build: String(opts.build || 'web'), ver: String(opts.ver || opts.build || '').slice(0, 16), sha: String(opts.sha || '').slice(0, 12), cp: LEVEL })); } catch (e) { bad('unreachable'); }
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

  function makeSession(opts, sock0, welcome) {
    const S = {
      id: 0, code: null, room: null, phase: 'lobby', role: 'player', rtt: 0, offset: welcome.now - now(), state: 'ok',
      status: { mode: welcome.mode, msg: welcome.msg || '' }, T0: 0, cfg: null, grid: null, token: null,
    };
    const subs = {};
    let sock = sock0, samples = [], bestRtt = Infinity, pings = 0, pingTimer = 0, fastTimer = 0;
    let final = false, lostAt = 0, retryTimer = 0, pending = null, lastRx = now(), grace = 0, dogTimer = 0, lastForce = 0;
    S.serverNow = () => now() + S.offset;

    const emit = (evt, arg) => {
      (subs[evt] || []).slice().forEach(fn => { try { fn(arg); } catch (e) { /* listener bug must not kill the socket */ } });
    };
    S.on = (evt, fn) => {
      (subs[evt] = subs[evt] || []).push(fn);
      return () => { const l = subs[evt] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    };
    const racing = () => S.phase === 'countdown' || S.phase === 'racing';
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
    // a phone that was asleep or a hidden tab: timers stood still, so measure again as soon as we are back
    try {
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) return;
          grace = now() + 3000; // timers were starved while hidden: the silence is not the server's fault, measure again first
          if (S.state === 'reconnecting') { lostAt = Date.now(); clearTimeout(retryTimer); scheduleRetry(0); } // the 15 s start now, in the foreground
          else if (S.state === 'ok' && sock && sock.readyState === 1) { resync(); raw({ t: 'ping', c: now() }); }
          else if (S.state === 'ok' && racing()) forceReconnect('visible');
        });
      }
    } catch (e) { /* no document */ }

    function setRoom(room) {
      S.room = room; S.phase = room.phase;
      S.role = room.hostId === S.id ? 'host' : 'player';
    }
    function setToken(m) {
      S.id = m.id; S.code = m.code; S.token = { code: m.code, id: m.id, key: m.key };
      store(S.token, opts.url);
    }
    function clearToken() { S.token = null; store(null); }

    // ---- message handling (shared by the first socket and reconnected sockets)
    function handle(m) {
      switch (m.t) {
        case 'pong': onPong(m); break;
        case 'created': case 'joined':
          setToken(m); setRoom(m.room);
          if (pending && pending.t === m.t) { const p = pending; pending = null; clearTimeout(p.timer); p.res(m.room); }
          else emit('room', m.room);
          break;
        case 'room': setRoom(m.room); emit('room', m.room); break;
        case 'start': { // the server repeats 'start' on every resume: the same gun on a session that already has it is NOT a new race (it used to relaunch the race screen = the boat went back to the start line)
          const dup = S.T0 === m.T0 && !!S.grid;
          S.T0 = m.T0; S.cfg = m.cfg; S.grid = m.grid; if (S.phase === 'lobby') S.phase = 'countdown';
          if (!dup) emit('start', { T0: m.T0, cfg: m.cfg, grid: m.grid });
          break;
        }
        case 's': S.lastStates = now(); emit('states', Array.isArray(m.a) ? m.a : []); break;
        case 'me': S.me = { s: Array.isArray(m.s) ? m.s : null, fin: typeof m.fin === 'number' ? m.fin : null, T0: m.T0, now: m.now }; emit('restore', S.me); break; // the server's copy of my last state, sent on every resume
        case 'fin': emit('fin', { id: m.id, ms: m.ms }); break;
        case 'fwin': if (typeof m.endAt === 'number') { S.finishAt = m.endAt; emit('fwin', { endAt: m.endAt }); } break;
        case 'res': S.phase = 'results'; S.rows = m.rows; S.lastToken = S.token || S.lastToken; clearToken(); emit('res', m.rows); break;
        case 'rematch': // host started a new race in the same room: back to the lobby with a fresh resume token
          if (m.room) { if (S.lastToken) { S.token = S.lastToken; store(S.token, opts.url); } S.T0 = 0; S.grid = null; S.finishAt = 0; S.rows = null; setRoom(m.room); emit('rematch', m.room, !!m.aborted); }
          break;
        case 'hostleft': clearToken(); S.phase = 'closed'; emit('hostleft'); break;
        case 'kicked': clearToken(); final = true; emit('kicked'); break;
        case 'status': S.status = { mode: m.mode, msg: m.msg || '' }; emit('status', S.status); break;
        case 'err':
          if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.rej(m.min ? { code: m.code || 'bad', min: m.min } : { code: m.code || 'bad' }); }
          else emit('error', { code: m.code, msg: m.msg });
          break;
        default: break;
      }
    }
    function attach(s) {
      s.onmessage = (ev) => {
        lastRx = now();
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
        if (m && typeof m === 'object') { try { handle(m); } catch (e) { /* ignore */ } }
      };
      s.onerror = () => {};
      s.onclose = () => { if (s === sock) onLost(); };
    }

    // ---- loss and reconnect (spec 4.7)
    // the watchdog: racing, state ok, no frame at all for WATCHDOG_MS (and not just back from the background) => drop the socket and resume
    function forceReconnect(why) {
      if (final || S.state !== 'ok' || !S.token || !racing()) return;
      const t = Date.now();
      if (t - lastForce < 1500) return;
      lastForce = t; S.forced = (S.forced || 0) + 1; S.forcedWhy = why;
      const old = sock; sock = null;
      if (old) { old.onclose = old.onmessage = old.onerror = null; try { old.close(); } catch (e) { /* ignore */ } }
      clearTimeout(fastTimer); clearInterval(pingTimer);
      S.state = 'reconnecting'; lostAt = t; emit('reconnecting');
      scheduleRetry(0);
    }
    function dog() {
      if (final || S.state !== 'ok' || !racing()) return;
      if (now() < grace) return;
      if (!sock || sock.readyState !== 1) { forceReconnect('notopen'); return; }
      if (now() - lastRx > WATCHDOG_MS) forceReconnect('silent');
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
      if (S.token && (S.phase === 'lobby' || S.phase === 'countdown' || S.phase === 'racing')) { // the lobby too: a locked phone must not lose its seat
        S.state = 'reconnecting'; lostAt = Date.now(); emit('reconnecting');
        scheduleRetry(0);
      } else { S.state = 'offline'; emit('offline'); }
    }
    function scheduleRetry(n) {
      const delays = [500, 1000, 2000, 3000, 4000];
      const wait = delays[Math.min(n, delays.length - 1)];
      const left = RECONNECT_MS - (Date.now() - lostAt);
      if (left <= 0) { giveUp(); return; }
      retryTimer = setTimeout(() => attempt(n), Math.min(wait, left));
    }
    function giveUp() { if (S.state === 'reconnecting') { S.state = 'offline'; emit('offline'); } }
    function attempt(n) {
      if (S.state !== 'reconnecting') return;
      let s2 = null, over = false;
      const next = () => { if (over) return; over = true; try { s2 && s2.close(); } catch (e) { /* ignore */ } scheduleRetry(n + 1); };
      const guard = setTimeout(next, 3000);
      openSocket(opts, (sk) => {
        if (over || S.state !== 'reconnecting') { try { sk.close(); } catch (e) { /* ignore */ } return; }
        s2 = sk;
        let resumed = false;
        sk.onmessage = (ev) => {
          let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
          if (!resumed) {
            if (m.t === 'joined') {
              resumed = true; clearTimeout(guard); over = true;
              sock = sk; attach(sk); lastRx = now(); grace = now() + 2000;
              S.state = 'ok'; S.reconnects++; handle(m); startSync(); emit('reconnected');
            } else if (m.t === 'err') { clearTimeout(guard); next(); }
          }
        };
        sk.onclose = () => { if (!resumed) { clearTimeout(guard); next(); } };
        sk.onerror = () => {};
        try { sk.send(JSON.stringify({ t: 'resume', code: S.token.code, id: S.token.id, key: S.token.key })); } catch (e) { clearTimeout(guard); next(); }
      }, () => { clearTimeout(guard); next(); }, (s) => { s2 = s; });
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
    S.join = (code) => {
      const c = normCode(code);
      return c ? request('joined', { t: 'join', code: c }) : Promise.reject({ code: 'nocode' });
    };
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
      clearTimeout(fastTimer); clearTimeout(retryTimer); clearInterval(pingTimer); clearInterval(dogTimer);
      try { sock && sock.close(); } catch (e) { /* ignore */ }
    }
    S.leave = () => { raw({ t: 'leave' }); clearToken(); shut(); };
    S.close = () => shut();

    attach(sock);
    startSync();
    return S;
  }

  // The thin facade race.js sees as host.live (spec 5.1): no socket knowledge, easy to stub in tests.
  function liveFacade(sess) {
    const room = sess.room || {};
    const cfg = sess.cfg || room.cfg || {};
    return {
      cfg, grid: sess.grid || [], T0: sess.T0, myId: sess.id,
      role: room.hostRole === 'watch' && room.hostId === sess.id ? 'watch' : 'sail',
      countdownS: cfg.countdownS || 20,
      get state() { return sess.state; },
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
    };
  }

  KOS.MP = { connect, parseJoin, normCode, liveFacade, savedToken, seat, clearSeat: () => storeSeat(null), LEVEL, ALPHABET };
  if (typeof module !== 'undefined' && module.exports) module.exports = KOS.MP;
})(typeof window !== 'undefined' ? window : globalThis);
