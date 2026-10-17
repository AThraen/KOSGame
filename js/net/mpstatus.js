// KØS SEJL — js/net/mpstatus.js  (EAGER, tiny: no network, no WebSocket and no fetch at load time)
// KOS.Config  { liveRace, mpUrl, mpStatusUrl }   dev/test overrides, see resolve()
// KOS.MPStatus
//   resolve()          -> {wsUrl, statusUrl, test}    fills the URLs lazily (prod: /mp/, otherwise /mp-test/ on spil.kossejlsport.dk)
//   cached()           -> {mode,message,maxRooms,maxPlayers,at} | null      never fetches
//   refresh({force})   -> Promise<Status>      fetch (no-store, 3 s timeout), at most once per 2 min unless forced; never rejects
//   visible()          -> boolean              the "Live-kapsejlads" entry is shown (mode on or closed)
//   load()             -> Promise<void>        injects the lazy scripts (mpstate, qr, mp, lobby) once; rejects {code:'load'}
//   open(opts)         -> Promise<void>        refresh(force) + load() + KOS.Lobby.open(opts); unavailable => message, never throws
//   handlePendingJoin()                         #join=CODE arrived with the page: opens the join screen (no network before this)
// Missing, unreachable, non-200, unparseable or unknown mode => {mode:'hidden'}. See docs/specs/live-race.md section 6.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const PROD_HOST = 'spil.kossejlsport.dk';
  const LAZY = ['js/net/mpstate.js', 'js/vendor/qr.js', 'js/net/mp.js', 'js/net/lobby.js'];
  const MIN_GAP = 120000;
  const CODE_RE = /^[ACDEFGHJKMNPRTUVWXY34679]{4}$/;

  KOS.Config = Object.assign({ liveRace: true, mpUrl: null, mpStatusUrl: null }, KOS.Config || {});

  const loc = () => root.location || { hostname: '', hash: '', origin: '', protocol: 'https:', host: '' };
  function hashParams() {
    const out = {};
    String(loc().hash || '').replace(/^#/, '').split('&').forEach(kv => {
      const i = kv.indexOf('=');
      if (i < 0) return;
      try { out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* ignore */ }
    });
    return out;
  }
  function ls(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function devOk() {
    const h = loc().hostname;
    return h === 'localhost' || h === '127.0.0.1' || !!(KOS.BUILD && KOS.BUILD.channel === 'dev');
  }

  function resolve() {
    const C = KOS.Config, L = loc(), hp = hashParams(), dev = devOk();
    const channel = (KOS.BUILD && KOS.BUILD.channel) || 'dev';
    const prod = L.hostname === PROD_HOST && channel === 'prod';
    const here = L.hostname === PROD_HOST;
    const secure = L.protocol === 'https:' || !here;
    const base = here ? (L.origin || (L.protocol + '//' + L.host)) : 'https://' + PROD_HOST;
    const wsBase = (secure ? 'wss://' : 'ws://') + (here ? L.host : PROD_HOST);
    let wsUrl = C.mpUrl || (prod ? wsBase + '/mp/ws' : wsBase + '/mp-test/ws');
    let statusUrl = C.mpStatusUrl || base + (prod ? '/mp-status.json' : '/mp-test-status.json');
    if (dev) {
      wsUrl = C.mpUrl || hp.mp || ls('kos.mpUrl') || wsUrl;
      statusUrl = C.mpStatusUrl || hp.mpstatus || ls('kos.mpStatusUrl') || statusUrl;
    }
    // a plain local dev server has no status file: skip the request instead of logging a 404
    if (dev && !here && !C.mpStatusUrl && !hp.mpstatus && !ls('kos.mpStatusUrl') && (L.hostname === 'localhost' || L.hostname === '127.0.0.1')) statusUrl = null;
    return { wsUrl, statusUrl, test: !prod };
  }

  let cache = null, inflight = null, lastTry = 0, loadP = null;
  const HIDDEN = () => ({ mode: 'hidden', message: '', maxRooms: 0, maxPlayers: 0, at: Date.now() });
  function parse(j) {
    if (!j || typeof j !== 'object') return HIDDEN();
    if (j.mode !== 'on' && j.mode !== 'closed') return HIDDEN();
    const n = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { mode: j.mode, message: typeof j.message === 'string' ? j.message.slice(0, 200) : '', maxRooms: n(j.maxRooms), maxPlayers: n(j.maxPlayers), at: Date.now() };
  }

  function refresh(opts) {
    const force = !!(opts && opts.force);
    if (KOS.Config.liveRace === false) return Promise.resolve(cache = HIDDEN());
    if (inflight) return inflight;
    if (!force && cache && Date.now() - lastTry < MIN_GAP) return Promise.resolve(cache);
    lastTry = Date.now();
    inflight = new Promise(done => {
      let settled = false;
      const fin = (st) => { if (settled) return; settled = true; clearTimeout(timer); inflight = null; cache = st; done(st); };
      const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { /* ignore */ } fin(HIDDEN()); }, 3000);
      let ctl = null;
      try {
        const url = resolve().statusUrl;
        if (typeof fetch !== 'function' || !url) { fin(HIDDEN()); return; }
        ctl = typeof AbortController === 'function' ? new AbortController() : null;
        fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
          .then(r => (r && r.ok ? r.json() : null))
          .then(j => fin(parse(j)), () => fin(HIDDEN()));
      } catch (e) { fin(HIDDEN()); }
    });
    return inflight;
  }
  const cached = () => cache;
  const visible = () => KOS.Config.liveRace !== false && !!cache && cache.mode !== 'hidden';

  function load() {
    if (loadP) return loadP;
    const doc = root.document;
    loadP = LAZY.reduce((p, src) => p.then(() => new Promise((res, rej) => {
      if (!doc) { rej({ code: 'load' }); return; }
      const s = doc.createElement('script');
      s.src = src; s.async = false;
      s.onload = () => res();
      s.onerror = () => rej({ code: 'load' });
      doc.head.appendChild(s);
    })), Promise.resolve()).catch(e => { loadP = null; throw (e && e.code ? e : { code: 'load' }); });
    return loadP;
  }

  // opens the lobby; whatever goes wrong, the lobby (or a toast) tells the player kindly
  function open(opts) {
    return refresh({ force: true }).then(st => load().then(() => {
      if (KOS.Lobby && KOS.Lobby.open) KOS.Lobby.open(Object.assign({ status: st }, opts || {}));
    })).catch(() => {
      if (KOS.UI && KOS.UI.toast) KOS.UI.toast(KOS.t('live.unavailable'), { kind: 'warn' });
    });
  }

  function handlePendingJoin() {
    const code = KOS.pendingJoin;
    if (!code) return Promise.resolve();
    KOS.pendingJoin = null;
    // drop only join=CODE from the hash (keeps dev overrides like mp= and mpstatus=)
    try {
      const rest = String(loc().hash || '').replace(/^#/, '').split('&').filter(kv => kv && kv.indexOf('join=') !== 0).join('&');
      if (root.history && root.history.replaceState) root.history.replaceState(null, '', loc().pathname + (loc().search || '') + (rest ? '#' + rest : ''));
    } catch (e) { /* ignore */ }
    return open({ join: code });
  }

  // #join=CODE: remember it only (no network). Cleared again by handlePendingJoin.
  (function () {
    const j = String(hashParams().join || '').toUpperCase().replace(/\s+/g, '');
    if (CODE_RE.test(j) && KOS.Config.liveRace !== false) KOS.pendingJoin = j;
  })();

  KOS.MPStatus = { resolve, cached, refresh, visible, load, open, handlePendingJoin };

  // the only strings the hub needs before the lobby is loaded
  if (KOS.I18n) {
    KOS.I18n.add('da', { live: { title: 'Live-kapsejlads', card: { desc: 'Sejl mod dine kammerater i et rigtigt løb – på samme tid, hver på sin skærm.', closedTag: 'Lukket' }, unavailable: 'Live-kapsejlads er ikke tilgængelig lige nu. Prøv igen senere – eller sejl mod computeren imens.' } });
    KOS.I18n.add('en', { live: { title: 'Live race', card: { desc: 'Race your friends in a real race – at the same time, each on their own screen.', closedTag: 'Closed' }, unavailable: 'Live race is not available right now. Try again later – or race the computer meanwhile.' } });
  }
})(typeof window !== 'undefined' ? window : globalThis);
