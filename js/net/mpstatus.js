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
//   tooOld(status)     -> boolean              this build is below the status file's minClient / minProto (the server is the judge too: err 'old')
//   seatPrompt(then)   -> boolean              a rejoin entry (localStorage, kos.mp.seat) exists: asks "back to the race?"; reads storage only, no network
// Missing, unreachable, non-200, unparseable or unknown mode => {mode:'hidden'}. See docs/specs/live-race.md section 6.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const PROD_HOST = 'spil.kossejlsport.dk';
  const LAZY = ['js/net/mpstate.js', 'js/vendor/qr.js', 'js/net/mp.js', 'js/net/lobby.js'];
  const MIN_GAP = 120000;
  const LEVEL = 2; // client protocol level, the same number mp.js sends in hello (cp)
  const SEAT_KEY = 'kos.mp.seat';
  const CODE_RE = /^[ACDEFGHJKMNPRTUVWXY34679]{4}$/;
  const lt = (a, n, v) => { try { if (KOS.Track) KOS.Track.event('Live', a, n, v); } catch (e) { /* analytics never breaks the game */ } };

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
    // opened from file://: a cross-origin fetch would only log a CORS error, and a local copy has no live server
    if (L.protocol === 'file:' && !C.mpStatusUrl && !hp.mpstatus && !ls('kos.mpStatusUrl')) statusUrl = null;
    return { wsUrl, statusUrl, test: !prod };
  }

  let cache = null, inflight = null, lastTry = 0, loadP = null;
  const HIDDEN = () => ({ mode: 'hidden', message: '', maxRooms: 0, maxPlayers: 0, at: Date.now() });
  function parse(j) {
    if (!j || typeof j !== 'object') return HIDDEN();
    if (j.mode !== 'on' && j.mode !== 'closed') return HIDDEN();
    const n = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { mode: j.mode, message: typeof j.message === 'string' ? j.message.slice(0, 200) : '', maxRooms: n(j.maxRooms), maxPlayers: n(j.maxPlayers),
      minClient: typeof j.minClient === 'string' ? j.minClient.slice(0, 16) : '', minProto: n(j.minProto), at: Date.now() };
  }
  // "v0.8.5", "0.8.5", "v0.8.4+abc1234" -> [0,8,5]; null for a dev build
  function parseVer(v) {
    const m = /^v?(\d{1,4})\.(\d{1,4})(?:\.(\d{1,4}))?/.exec(String(v || '').trim());
    return m ? [+m[1], +m[2], +(m[3] || 0)] : null;
  }
  // the public status file may demand a newer game; a phone below it is told before it even connects. A dev build is only held to minProto.
  function tooOld(st) {
    st = st || cache;
    if (!st) return false;
    if (st.minProto && LEVEL < st.minProto) return true;
    const min = parseVer(st.minClient), mine = parseVer(KOS.BUILD && KOS.BUILD.version);
    if (!min || !mine) return false;
    for (let i = 0; i < 3; i++) if (mine[i] !== min[i]) return mine[i] < min[i];
    return false;
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

  // opens the lobby; whatever goes wrong, the lobby (or a toast) tells the player kindly.
  // 1. no profile yet (a phone that arrived through a link/QR): the short first-time setup first (name + avatar), then straight on with the same opts
  // 2. the latest app version BEFORE any lobby: a waiting/new service worker is applied (skipWaiting + reload) and the open continues by itself
  function open(opts) {
    opts = opts || {};
    const A = KOS.App;
    // a way back into a race this phone left (page closed, app swiped away, process killed): ask first, then carry on with what was asked
    if (!opts.join && !opts.rejoin && !opts.noSeat && seatPrompt(() => open(Object.assign({}, opts, { noSeat: true })))) return Promise.resolve();
    if (A && KOS.Storage && KOS.Storage.profile && !KOS.Storage.profile() && A.show) {
      if (opts.join) writePending({ code: opts.join, auto: true }); // the setup may be interrupted by a reload: the link's code is not lost
      A._afterProfile = () => open(opts);
      A.show('profile', { first: true, live: true });
      return Promise.resolve();
    }
    const latest = A && A.checkUpdate ? A.checkUpdate({ keep: () => keepIntent(opts) }) : Promise.resolve(false);
    return latest.then(reloading => {
      if (reloading) return null;
      return refresh({ force: true }).then(st => load().then(() => {
        if (KOS.Lobby && KOS.Lobby.open) KOS.Lobby.open(Object.assign({ status: st }, opts));
      }));
    }).catch(() => {
      lt('unavailable', 'server');
      if (KOS.UI && KOS.UI.toast) KOS.UI.toast(KOS.t('live.unavailable'), { kind: 'warn' });
    });
  }

  // ---- rejoin after leaving the page (spec section 16): mp.js keeps {code, id, key, url, exp} in localStorage while a seat is alive
  // (cleared on leave, results, kick; 2 h at most). This only READS storage: the network is touched after the player says yes.
  function readSeat() {
    try {
      const o = JSON.parse(root.localStorage.getItem(SEAT_KEY));
      if (o && CODE_RE.test(String(o.code)) && Number.isInteger(o.id) && typeof o.key === 'string' && o.key && typeof o.exp === 'number' && o.exp > Date.now()) return o;
      if (o) root.localStorage.removeItem(SEAT_KEY);
    } catch (e) { /* no storage */ }
    return null;
  }
  function dropSeat() { try { root.localStorage.removeItem(SEAT_KEY); } catch (e) { /* ignore */ } }
  let seatShown = false;
  function seatPrompt(then) {
    const s = readSeat(), UI = KOS.UI;
    if (!s || seatShown || KOS.Config.liveRace === false || !UI || !UI.dialog) return false;
    let url = ''; try { url = resolve().wsUrl; } catch (e) { /* ignore */ }
    if (s.url && url && s.url !== url) return false; // a seat on another server (test vs prod): not offered, not deleted
    seatShown = true;
    const done = typeof then === 'function' ? then : () => {};
    const dlg = UI.dialog({ icon: 'flag', titleKey: 'live.rejoin.title', body: '<p class="live-rejoin-body">' + UI.esc(KOS.t('live.rejoin.body', { code: s.code })) + '</p>', dismissable: false,
      buttons: [
        { label: KOS.t('live.rejoin.no'), onClick: () => { dropSeat(); lt('rejoin', 'declined'); done(); } },
        { label: KOS.t('live.rejoin.yes'), kind: 'primary', icon: 'play', onClick: () => { lt('rejoin', 'accepted'); open({ join: s.code, auto: true, rejoin: true, via: 'seat' }); } },
      ] });
    if (!dlg) { seatShown = false; return false; }
    return true;
  }

  // an update reload from the entry card / hub / host flow: open Live again by itself afterwards (a join keeps its code in the pending key instead)
  const OKEY = 'kos.mp.openlive';
  function keepIntent(opts) {
    if (opts && opts.join) writePending({ code: opts.join, auto: true });
    else { try { root.sessionStorage.setItem(OKEY, String(Date.now())); } catch (e) { /* ignore */ } }
  }
  function wantsOpen() {
    try { const v = +root.sessionStorage.getItem(OKEY); return v > 0 && Date.now() - v < 120000; } catch (e) { return false; }
  }
  function handlePendingJoin() {
    const code = KOS.pendingJoin;
    if (!code) {
      if (wantsOpen()) { try { root.sessionStorage.removeItem(OKEY); } catch (e) { /* ignore */ } return open({}); }
      return Promise.resolve();
    }
    KOS.pendingJoin = null;
    // drop only join=CODE from the hash (keeps dev overrides like mp= and mpstatus=)
    try {
      const rest = String(loc().hash || '').replace(/^#/, '').split('&').filter(kv => kv && kv.indexOf('join=') !== 0).join('&');
      if (root.history && root.history.replaceState) root.history.replaceState(null, '', loc().pathname + (loc().search || '') + (rest ? '#' + rest : ''));
    } catch (e) { /* ignore */ }
    const auto = !!KOS.pendingAuto; KOS.pendingAuto = false;
    KOS.joinArrival = code; // the lobby may still ask the update prompt to wait or to run first
    return open({ join: code, auto, via: 'link' });
  }

  // ---- reload safety (docs/specs/live-race.md section 14): the pending join (and, once joined, mp.js's resume token) live in sessionStorage
  const PKEY = 'kos.mp.pending';
  function readPending() {
    try {
      const o = JSON.parse(root.sessionStorage.getItem(PKEY));
      return o && CODE_RE.test(String(o.code)) && Date.now() - (+o.at || 0) < 30 * 60000 ? o : null;
    } catch (e) { return null; }
  }
  function writePending(o) {
    try { if (o) root.sessionStorage.setItem(PKEY, JSON.stringify({ code: o.code, auto: !!o.auto, at: Date.now() })); else root.sessionStorage.removeItem(PKEY); } catch (e) { /* private mode */ }
  }
  // true while a lobby or race of the live game is open or being joined: the "new version" prompt must wait
  function busy() {
    const L = KOS.Lobby && KOS.Lobby.state;
    return !!(L && (L.sess || L.busy || L.view === 'join' && L.code));
  }
  // before a page reload (update): remember what the player was doing so the lobby can pick it up again
  function keepForReload() {
    const L = KOS.Lobby && KOS.Lobby.state;
    const code = KOS.pendingJoin || (L && L.sess && L.sess.code) || (L && L.view === 'join' && CODE_RE.test(String(L.code)) ? L.code : null);
    if (code) writePending({ code, auto: true });
    return !!code;
  }
  // arrived through #join=CODE and nothing is joined yet: the update may be applied at once, the join continues by itself afterwards
  function canAutoUpdate() {
    let done = false; try { done = !!root.sessionStorage.getItem('kos.mp.upd'); } catch (e) { done = true; }
    const L = KOS.Lobby && KOS.Lobby.state;
    return !!(!done && (KOS.pendingJoin || KOS.joinArrival) && !(L && (L.sess || L.busy)));
  }
  function markUpdated() { try { root.sessionStorage.setItem('kos.mp.upd', '1'); } catch (e) { /* ignore */ } }

  // #join=CODE: remember it only (no network). Cleared again by handlePendingJoin.
  (function () {
    const j = String(hashParams().join || '').toUpperCase().replace(/\s+/g, '');
    if (KOS.Config.liveRace === false) return;
    if (CODE_RE.test(j)) { KOS.pendingJoin = j; KOS.pendingAuto = false; try { root.sessionStorage.setItem('kos.mp.pending', JSON.stringify({ code: j, auto: false, at: Date.now() })); } catch (e) { /* ignore */ } return; }
    const p = readPending(); // the page was reloaded (update, refresh) and #join is gone
    if (p && p.auto) { KOS.pendingJoin = p.code; KOS.pendingAuto = true; }
  })();

  KOS.MPStatus = { resolve, cached, refresh, visible, load, open, handlePendingJoin, tooOld, seatPrompt, readSeat, keepIntent, busy, keepForReload, canAutoUpdate, markUpdated, wantsOpen };

  // the only strings the hub needs before the lobby is loaded
  if (KOS.I18n) {
    KOS.I18n.add('da', { live: { title: 'Live-kapsejlads', menuSub: 'Sejl mod dine venner, lige nu', first: { title: 'Hvem sejler?', sub: 'Skriv dit navn og vælg dit udseende. Så kan dine venner se dig i løbet.', go: 'Videre til løbet' }, card: { desc: 'Sejl mod dine kammerater i et rigtigt løb – på samme tid, hver på sin skærm.', closedTag: 'Lukket' }, unavailable: 'Live-kapsejlads er ikke tilgængelig lige nu. Prøv igen senere – eller sejl mod computeren imens.',
      rejoin: { title: 'Tilbage i løbet?', body: 'Du er stadig med i løbet {code} – vil du tilbage?', yes: 'Tilbage til løbet', no: 'Nej tak' } } });
    KOS.I18n.add('en', { live: { title: 'Live race', menuSub: 'Race your friends, right now', first: { title: 'Who is sailing?', sub: 'Type your name and pick your look. Then your friends can see you in the race.', go: 'On to the race' }, card: { desc: 'Race your friends in a real race – at the same time, each on their own screen.', closedTag: 'Closed' }, unavailable: 'Live race is not available right now. Try again later – or race the computer meanwhile.',
      rejoin: { title: 'Back in the race?', body: 'You are still in race {code} – do you want to go back?', yes: 'Back to the race', no: 'No thanks' } } });
  }
})(typeof window !== 'undefined' ? window : globalThis);
