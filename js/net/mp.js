// KØS SEJL — js/net/mp.js  (LAZY: loaded by KOS.MPStatus.load(); loading it opens no socket)
// KOS.MP: WebSocket client for the live race relay (docs/specs/live-race.md, sections 3, 4.1, 4.7, 6.3).
//   KOS.MP.connect({url, name, timeoutMs=4000, build}) -> Promise<Session>   rejects {code:'unreachable'|'timeout'|'proto'}
//   Session: id, code, room, phase, role ('host'|'player'), rtt, offset, state ('ok'|'reconnecting'|'offline'|'closed'),
//            status {mode,msg}, T0, cfg, grid, serverNow()
//     create(cfg, hostRole) -> Promise<room>   rejects {code:'closed'|'busy'|'bad'|'timeout'}
//     join(code)            -> Promise<room>   rejects {code:'nocode'|'full'|'started'|'closed'|'timeout'}
//     setCfg(partial), kick(id), start(), rematch(), leave(), send(msg), close()
//     on(evt, fn) -> off     evts: room, start, states, fin, res, rematch, hostleft, kicked, reconnecting, reconnected, offline, status, error
//   KOS.MP.parseJoin(hash) -> 'ABCD'|null     KOS.MP.normCode(str) -> 'ABCD'|null
// All rejections are plain {code} objects; nothing is thrown out of socket handlers; no console output.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const ALPHABET = 'ACDEFGHJKMNPRTUVWXY34679';
  const CODE_RE = new RegExp('^[' + ALPHABET + ']{4}$');
  const TOKEN_KEY = 'kos.mp.rejoin';
  const RECONNECT_MS = 15000;
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
  function store(tok) {
    try { if (typeof sessionStorage !== 'undefined') { if (tok) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); else sessionStorage.removeItem(TOKEN_KEY); } } catch (e) { /* private mode */ }
  }

  function connect(opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || 4000;
    return new Promise((resolve, reject) => {
      let ws = null, done = false;
      const fail = (code) => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { ws && ws.close(); } catch (e) { /* ignore */ }
        reject({ code });
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
      try { sock.send(JSON.stringify({ t: 'hello', v: 1, name: String(opts.name || ''), build: String(opts.build || 'web') })); } catch (e) { bad('unreachable'); }
    };
    sock.onerror = () => { if (!welcomed) bad('unreachable'); };
    sock.onclose = () => { if (!welcomed) bad('unreachable'); };
    sock.onmessage = (ev) => {
      if (welcomed) return;
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
      if (m.t === 'welcome') { welcomed = true; sock.onopen = sock.onerror = sock.onclose = sock.onmessage = null; ok(sock, m); }
      else if (m.t === 'err') bad(m.code === 'proto' ? 'proto' : 'unreachable');
    };
  }

  function makeSession(opts, sock0, welcome) {
    const S = {
      id: 0, code: null, room: null, phase: 'lobby', role: 'player', rtt: 0, offset: welcome.now - now(), state: 'ok',
      status: { mode: welcome.mode, msg: welcome.msg || '' }, T0: 0, cfg: null, grid: null, token: null,
    };
    const subs = {};
    let sock = sock0, samples = [], bestRtt = Infinity, pings = 0, pingTimer = 0, fastTimer = 0;
    let final = false, lostAt = 0, retryTimer = 0, pending = null;
    S.serverNow = () => now() + S.offset;

    const emit = (evt, arg) => {
      (subs[evt] || []).slice().forEach(fn => { try { fn(arg); } catch (e) { /* listener bug must not kill the socket */ } });
    };
    S.on = (evt, fn) => {
      (subs[evt] = subs[evt] || []).push(fn);
      return () => { const l = subs[evt] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    };
    const raw = (msg) => { try { if (sock && sock.readyState === 1) sock.send(JSON.stringify(msg)); } catch (e) { /* drop */ } };
    S.send = raw;

    // ---- clock sync (spec 4.1)
    function ping() { raw({ t: 'ping', c: now() }); }
    function startSync() {
      clearTimeout(fastTimer); clearInterval(pingTimer);
      samples = []; bestRtt = Infinity; pings = 0;
      const fast = () => {
        ping();
        if (++pings < 8) fastTimer = setTimeout(fast, 250);
        else { pingTimer = setInterval(ping, 5000); pingTimer.unref && pingTimer.unref(); }
      };
      fast();
    }
    function onPong(m) {
      const M = STATE(); if (!M || typeof m.c !== 'number' || typeof m.s !== 'number') return;
      const smp = M.clockSample(m.c, now(), m.s);
      if (!(smp.rtt >= 0)) return;
      const settled = samples.length >= 8;
      if (settled && smp.rtt > 1.5 * bestRtt) return;
      samples.push(smp); if (samples.length > 8) samples.shift();
      const pk = M.pickOffset(samples); if (!pk) return;
      bestRtt = Math.min(bestRtt, smp.rtt);
      S.rtt = pk.rtt;
      if (!settled) S.offset = pk.offset;
      else { let d = 0.2 * (pk.offset - S.offset); if (d < -30) d = -30; S.offset += d; }
    }

    function setRoom(room) {
      S.room = room; S.phase = room.phase;
      S.role = room.hostId === S.id ? 'host' : 'player';
    }
    function setToken(m) {
      S.id = m.id; S.code = m.code; S.token = { code: m.code, id: m.id, key: m.key };
      store(S.token);
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
        case 'start': S.T0 = m.T0; S.cfg = m.cfg; S.grid = m.grid; if (S.phase === 'lobby') S.phase = 'countdown'; emit('start', { T0: m.T0, cfg: m.cfg, grid: m.grid }); break;
        case 's': emit('states', Array.isArray(m.a) ? m.a : []); break;
        case 'fin': emit('fin', { id: m.id, ms: m.ms }); break;
        case 'res': S.phase = 'results'; S.lastToken = S.token; clearToken(); emit('res', m.rows); break;
        case 'rematch': // host started a new race in the same room: back to the lobby with a fresh resume token
          if (m.room) { if (S.lastToken) { S.token = S.lastToken; store(S.token); } S.T0 = 0; S.grid = null; setRoom(m.room); emit('rematch', m.room); }
          break;
        case 'hostleft': clearToken(); S.phase = 'closed'; emit('hostleft'); break;
        case 'kicked': clearToken(); final = true; emit('kicked'); break;
        case 'status': S.status = { mode: m.mode, msg: m.msg || '' }; emit('status', S.status); break;
        case 'err':
          if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.rej({ code: m.code || 'bad' }); }
          else emit('error', { code: m.code, msg: m.msg });
          break;
        default: break;
      }
    }
    function attach(s) {
      s.onmessage = (ev) => {
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
        if (m && typeof m === 'object') { try { handle(m); } catch (e) { /* ignore */ } }
      };
      s.onerror = () => {};
      s.onclose = () => { if (s === sock) onLost(); };
    }

    // ---- loss and reconnect (spec 4.7)
    function onLost() {
      clearTimeout(fastTimer); clearInterval(pingTimer);
      if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.rej({ code: 'unreachable' }); }
      if (final || S.state === 'closed' || S.state === 'offline') return;
      if (S.token && (S.phase === 'countdown' || S.phase === 'racing')) {
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
              sock = sk; attach(sk);
              S.state = 'ok'; handle(m); startSync(); emit('reconnected');
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
    function shut() {
      final = true; S.state = 'closed';
      clearTimeout(fastTimer); clearTimeout(retryTimer); clearInterval(pingTimer);
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
      serverNow: () => sess.serverNow(),
      send: msg => sess.send(msg),
      on: (evt, fn) => sess.on(evt, fn),
      rematch: () => sess.rematch(),
      leave: () => { try { sess.leave(); } catch (e) { /* ignore */ } },
    };
  }

  KOS.MP = { connect, parseJoin, normCode, liveFacade, ALPHABET };
  if (typeof module !== 'undefined' && module.exports) module.exports = KOS.MP;
})(typeof window !== 'undefined' ? window : globalThis);
