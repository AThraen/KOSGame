// KØS SEJL — js/net/mpstatus.js  (EAGER, tiny: no network, no WebSocket and no fetch at load time)
// KOS.Config  { liveRace, mpUrl, mpStatusUrl }   dev/test overrides, see resolve()
// KOS.MPStatus
//   resolve()          -> {wsUrl, statusUrl, test}    fills the URLs lazily (prod: /mp/, otherwise /mp-test/ on spil.kossejlsport.dk)
//   cached()           -> {mode,message,maxRooms,maxPlayers,at} | null      never fetches
//   refresh({force})   -> Promise<Status>      fetch (no-store, 3 s timeout), at most once per 2 min unless forced; never rejects
//   visible()          -> boolean              the "Live-kapsejlads" entry is shown (mode on or closed)
//   load()             -> Promise<void>        injects the lazy scripts (mpstate, qr, mp, lobby) once; rejects {code:'load'}
//   open(opts)         -> Promise<void>        refresh(force) + load() + KOS.Lobby.open(opts); unavailable => message, never throws
//   handlePendingJoin()                         #join=CODE (or #live=CODE) arrived with the page: opens the join screen (no network before this)
//   tooOld(status)     -> boolean              this build is below the status file's minClient / minProto (the server is the judge too: err 'old')
//   readSeat()         -> seat|null            the rejoin entry (localStorage kos.mp.seat); reads storage only, no network
//   seatBar(screen)                            puts the "Fortsæt live-løbet" banner on 'title' / 'hub' (runs on every KOS.Events 'screen')
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

  // ---- "Fortsæt live-løbet" (spec E4; replaces the old one-time dialog): mp.js keeps {code, id, key, url, exp, phase, startedAt} in
  // localStorage while a seat is alive (exp = last contact + 2 h; cleared on retire, results, kick, hostleft). Whenever one is stored, the
  // title screen and the hub show a prominent banner. Building it only READS storage: no network and no lazy script until it is tapped,
  // so it also shows offline. "Ikke nu" hides it for this visit; "Udgå" (asked first) withdraws from the race.
  function readSeat() {
    try {
      const o = JSON.parse(root.localStorage.getItem(SEAT_KEY));
      if (o && CODE_RE.test(String(o.code)) && Number.isInteger(o.id) && typeof o.key === 'string' && o.key && typeof o.exp === 'number' && o.exp > Date.now()) return o;
      if (o) root.localStorage.removeItem(SEAT_KEY);
    } catch (e) { /* no storage */ }
    return null;
  }
  function dropSeat() { try { root.localStorage.removeItem(SEAT_KEY); } catch (e) { /* ignore */ } }
  let seatLater = ''; // "Ikke nu": the code hidden for this visit (page load)
  // the seat to offer, or null: none, hidden for now, live switched off, or a seat on another server (test vs prod: not offered, not deleted)
  function offerSeat() {
    const s = readSeat();
    if (!s || s.code === seatLater || KOS.Config.liveRace === false) return null;
    let url = ''; try { url = resolve().wsUrl; } catch (e) { /* ignore */ }
    return s.url && url && s.url !== url ? null : s;
  }
  function resumeSeat(s) { lt('rejoin', 'banner'); return open({ join: s.code, auto: true, rejoin: true, via: 'seat' }); }
  function retireSeat(s, done) {
    const UI = KOS.UI;
    const go = () => {
      lt('rejoin', 'retired');
      const B = KOS.BUILD || {}, p = KOS.Storage && KOS.Storage.profile ? KOS.Storage.profile() : null;
      const fin = () => { dropSeat(); try { UI.toast(KOS.t('live.seat.retired'), { kind: 'info' }); } catch (e) { /* optional */ } if (done) done(); };
      load().then(() => KOS.MP.retire(s, { url: resolve().wsUrl, name: (p && p.name) || '', build: B.version || 'web', ver: B.version || 'dev', sha: B.sha || '' })).then(fin, fin);
    };
    if (!UI || !UI.dialog) { go(); return; }
    UI.dialog({ icon: 'flag', titleKey: 'live.seat.retireTitle', body: '<p>' + UI.esc(KOS.t('live.seat.retireBody', { code: s.code })) + '</p>', cls: 'live-seat-retire',
      buttons: [{ label: KOS.t('live.seat.stay'), kind: 'primary' }, { label: KOS.t('live.seat.retire'), kind: 'danger', onClick: go }] });
  }
  // the banner itself: one big button (straight back into the race) and two small ones
  function seatBarHtml(s) {
    const UI = KOS.UI, ic = n => (UI && UI.iconSvg ? UI.iconSvg(n) : '');
    const sub = KOS.t(s.phase === 'lobby' ? 'live.seat.subLobby' : 'live.seat.sub', { code: s.code });
    return '<div class="seatbar" role="region" aria-label="' + UI.esc(KOS.t('live.seat.go')) + '" data-code="' + s.code + '">' +
      '<button type="button" class="seatbar-go" data-seat="go"><span class="seatbar-ico">' + ic('flag') + '</span><span class="seatbar-txt"><b>' + UI.esc(KOS.t('live.seat.go')) + '</b>' +
      '<small>' + UI.esc(sub) + '</small></span><span class="seatbar-arrow">' + ic('play') + '</span></button>' +
      '<div class="seatbar-more"><button type="button" class="seatbar-small" data-seat="later">' + UI.esc(KOS.t('live.seat.later')) + '</button>' +
      '<button type="button" class="seatbar-small" data-seat="retire">' + UI.esc(KOS.t('live.seat.retire')) + '</button></div></div>';
  }
  // put the banner on the title screen (top of the menu) or the hub (above the "next" card); remove it when there is nothing to offer
  function seatBar(screen) {
    const doc = root.document; if (!doc || !KOS.UI) return;
    const sec = doc.getElementById('screen-' + screen);
    if (!sec || sec.hidden) return;
    const old = sec.querySelector('.seatbar'), s = offerSeat();
    if (!s) { if (old) old.remove(); return; }
    if (old && old.getAttribute('data-code') === s.code) return;
    const slot = screen === 'title' ? sec.querySelector('.title-menu') : sec.querySelector('.hub-bottom');
    if (!slot) return;
    if (old) old.remove();
    slot.insertAdjacentHTML('afterbegin', seatBarHtml(s));
    const bar = slot.querySelector('.seatbar');
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-seat]');
      if (!b) return;
      e.stopPropagation();
      try { KOS.Audio && KOS.Audio.sfx && KOS.Audio.sfx('click'); } catch (x) { /* optional */ }
      const a = b.getAttribute('data-seat'), cur = readSeat();
      if (!cur || cur.code !== s.code) { bar.remove(); return; }
      if (a === 'go') resumeSeat(cur);
      else if (a === 'later') { seatLater = cur.code; lt('rejoin', 'later'); bar.remove(); }
      else if (a === 'retire') retireSeat(cur, () => bar.remove());
    });
  }
  if (KOS.Events && KOS.Events.on) KOS.Events.on('screen', scr => { if (scr === 'title' || scr === 'hub') { try { seatBar(scr); } catch (e) { /* the banner never breaks a screen */ } } });

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
      const rest = String(loc().hash || '').replace(/^#/, '').split('&').filter(kv => kv && kv.indexOf('join=') !== 0 && kv.indexOf('live=') !== 0).join('&');
      if (root.history && root.history.replaceState) root.history.replaceState(root.history.state, '', loc().pathname + (loc().search || '') + (rest ? '#' + rest : ''));
    } catch (e) { /* ignore */ }
    const auto = !!KOS.pendingAuto; KOS.pendingAuto = false;
    KOS.joinArrival = code; // the lobby may still ask the update prompt to wait or to run first
    // a race link while this phone still holds a seat (spec E4): the same race is simply resumed; another race is a choice
    const s = offerSeat(), UI = KOS.UI;
    if (s && s.code === code) return resumeSeat(s);
    if (s && UI && UI.dialog && UI.dialog({ icon: 'flag', titleKey: 'live.seat.choiceTitle', body: '<p>' + UI.esc(KOS.t('live.seat.choiceBody', { code: s.code, other: code })) + '</p>', cls: 'live-seat-choice', dismissable: false,
      buttons: [{ label: KOS.t('live.seat.choiceNew', { code }), onClick: () => open({ join: code, auto, via: 'link' }) },
        { label: KOS.t('live.seat.choiceOld', { code: s.code }), kind: 'primary', icon: 'play', onClick: () => resumeSeat(s) }] })) return Promise.resolve();
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

  // #join=CODE (#live=CODE, the scheduled-race link, is the same): remember it only (no network). Cleared again by handlePendingJoin.
  (function () {
    const hp = hashParams();
    const j = String(hp.join || hp.live || '').toUpperCase().replace(/\s+/g, '');
    if (KOS.Config.liveRace === false) return;
    if (CODE_RE.test(j)) { KOS.pendingJoin = j; KOS.pendingAuto = false; try { root.sessionStorage.setItem('kos.mp.pending', JSON.stringify({ code: j, auto: false, at: Date.now() })); } catch (e) { /* ignore */ } return; }
    const p = readPending(); // the page was reloaded (update, refresh) and #join is gone
    if (p && p.auto) { KOS.pendingJoin = p.code; KOS.pendingAuto = true; }
  })();

  KOS.MPStatus = { resolve, cached, refresh, visible, load, open, handlePendingJoin, tooOld, readSeat, seatBar, keepIntent, busy, keepForReload, canAutoUpdate, markUpdated, wantsOpen };

  // the only strings the hub needs before the lobby is loaded
  if (KOS.I18n) {
    KOS.I18n.add('da', { live: { title: 'Live-kapsejlads', menuSub: 'Sejl mod dine venner, lige nu', first: { title: 'Hvem sejler?', sub: 'Skriv dit navn og vælg dit udseende. Så kan dine venner se dig i løbet.', go: 'Videre til løbet' }, card: { desc: 'Sejl mod dine kammerater i et rigtigt løb – på samme tid, hver på sin skærm.', closedTag: 'Lukket' }, unavailable: 'Live-kapsejlads er ikke tilgængelig lige nu. Prøv igen senere – eller sejl mod computeren imens.',
      seat: { go: 'Fortsæt live-løbet', sub: 'Du er stadig med i løbet {code}', subLobby: 'Du venter på starten i løbet {code}', later: 'Ikke nu', retire: 'Udgå',
        retireTitle: 'Udgå af løbet?', retireBody: 'Så er du ude af løbet {code} og får ikke en placering. Det kan ikke fortrydes.', stay: 'Bliv i løbet', retired: 'Du er udgået af løbet.',
        choiceTitle: 'Du er med i et andet løb', choiceBody: 'Du er stadig med i løbet {code}. Linket er til løbet {other}.', choiceOld: 'Fortsæt løbet {code}', choiceNew: 'Gå til {code}' } } });
    KOS.I18n.add('en', { live: { title: 'Live race', menuSub: 'Race your friends, right now', first: { title: 'Who is sailing?', sub: 'Type your name and pick your look. Then your friends can see you in the race.', go: 'On to the race' }, card: { desc: 'Race your friends in a real race – at the same time, each on their own screen.', closedTag: 'Closed' }, unavailable: 'Live race is not available right now. Try again later – or race the computer meanwhile.',
      seat: { go: 'Continue the live race', sub: 'You are still in race {code}', subLobby: 'You are waiting for the start of race {code}', later: 'Not now', retire: 'Retire',
        retireTitle: 'Retire from the race?', retireBody: 'You leave race {code} and get no place. This cannot be undone.', stay: 'Stay in the race', retired: 'You have retired from the race.',
        choiceTitle: 'You are in another race', choiceBody: 'You are still in race {code}. The link is for race {other}.', choiceOld: 'Continue race {code}', choiceNew: 'Go to {code}' } } });
  }
})(typeof window !== 'undefined' ? window : globalThis);
