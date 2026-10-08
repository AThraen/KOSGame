// KØS SEJL — js/ui/track.js
// KOS.Track: anonymous usage statistics via Matomo (cookieless, honours Do-Not-Track). Tells the club whether the
// game is used and which options people pick. Never sends names or any personal data: the Matomo User ID is a
// random per-device player id, plus age band, boat and progress as custom dimensions (DIM). A no-op on localhost,
// file:, headless/automated browsers and in God mode. Every call is wrapped: an adblocker or being offline
// changes nothing for the player. See SPEC.md (Analytics).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const BASE = 'https://matomo.bering.codeart.dk/';
  const SITE_ID = '13';
  const WATCHED = ['lang', 'sound', 'music', 'assist', 'controls', 'reducedMotion', 'unlockAll']; // volume is too chatty
  // Custom dimension ids as created in Matomo (Administration > Websites > Custom Dimensions). 0 = not sent.
  // Visit scope: who is playing; action scope: progress at the moment of each page view / event.
  const DIM = { age: 1, boat: 2, done: 3, stars: 4, level: 5 };
  let state = 0; // 0 not started, 1 live, -1 disabled
  let lastScreen = null;
  let lastSettings = null;

  function allowed() {
    try {
      const loc = root.location, nav = root.navigator || {};
      if (!loc || !/^https?:$/.test(loc.protocol)) return false;
      if (/^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/.test(loc.hostname)) return false;
      if (nav.webdriver || /HeadlessChrome|Playwright|Puppeteer/i.test(nav.userAgent || '')) return false;
      if (KOS.Storage && KOS.Storage.god && KOS.Storage.god()) return false;
      return true;
    } catch (e) { return false; }
  }
  // lazy: nothing is loaded or queued until the first real event (by then #god=1 has been applied)
  function start() {
    if (state) return state > 0;
    state = -1;
    try {
      if (!allowed()) return false;
      const _paq = (root._paq = root._paq || []);
      _paq.push(['setDoNotTrack', true]);
      _paq.push(['disableCookies']);
      _paq.push(['enableLinkTracking']);
      _paq.push(['setTrackerUrl', BASE + 'matomo.php']);
      _paq.push(['setSiteId', SITE_ID]);
      const pid = playerId();
      if (pid) _paq.push(['setUserId', pid]);
      const d = root.document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
      g.async = true; g.src = BASE + 'matomo.js';
      g.onerror = () => { /* blocked or offline: ignore */ };
      (s && s.parentNode ? s.parentNode : d.head).insertBefore(g, s || null);
      state = 1;
    } catch (e) { state = -1; }
    return state > 0;
  }
  function push(args) { try { if (start()) root._paq.push(args); } catch (e) { /* ignore */ } }

  // anonymous player id: random, made on this device, never derived from the name (e.g. "P-7K3QX9")
  function playerId() {
    try {
      const S = KOS.Storage;
      let id = S.get('pid', '');
      if (!/^P-[0-9A-Z]{6}$/.test(id)) {
        const A = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', r = new Uint8Array(6);
        (root.crypto && root.crypto.getRandomValues) ? root.crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 256; });
        id = 'P-' + Array.from(r, b => A[b % A.length]).join('');
        S.set('pid', id);
      }
      return id;
    } catch (e) { return ''; }
  }
  // progress snapshot sent with every hit (dimensions are re-set each time so they're never stale)
  function dims() {
    try {
      const S = KOS.Storage, p = S.profile() || {}, all = S._allProgress();
      let done = 0;
      for (const k in all) if (all[k] && all[k].done) done++;
      const xp = S.xp(), rank = KOS.App && KOS.App.rankOf ? KOS.App.rankOf(xp) : null;
      const v = { age: p.age || '', boat: S.get('boat', 'opti'), done: String(done), stars: String(S.totalStars()), level: rank ? String(rank.level) : '' };
      for (const k in DIM) if (DIM[k] && v[k] !== '') push(['setCustomDimension', DIM[k], v[k]]);
    } catch (e) { /* ignore */ }
  }

  const Track = (KOS.Track = {
    event(category, action, name, value) {
      const a = ['trackEvent', category, action];
      if (name != null) a.push(String(name));
      if (value != null && isFinite(value)) a.push(+value);
      dims();
      push(a);
    },
    // virtual page view for a screen change (not for a re-render of the same screen)
    screen(screen, id) {
      const key = screen + (id ? '/' + id : '');
      if (key === lastScreen) return;
      lastScreen = key;
      push(['setCustomUrl', '/#' + key]);
      push(['setDocumentTitle', 'KØS SEJL - ' + key]);
      dims();
      push(['trackPageView']);
    },
  });

  function boot() {
    const E = KOS.Events;
    if (!E || !E.on) return;
    try { lastSettings = Object.assign({}, KOS.Storage.settings()); } catch (e) { lastSettings = {}; }
    E.on('screen', s => { Track.screen(s, s === 'play' && KOS.App && KOS.App.run && KOS.App.run.act ? KOS.App.run.act.id : ''); });
    E.on('play:start', p => {
      if (!p) return;
      Track.event('Activity', 'start', p.id);
      if (p.boat) Track.event('Boat', 'sailed', p.boat);
    });
    E.on('play:finish', p => {
      if (!p || !p.result) return;
      const r = p.result;
      Track.event('Activity', 'finish', p.id + (r.success ? ' pass' : ' fail'), Math.max(0, Math.min(3, Math.round(+r.stars || 0))));
      if (r.success && r.timeMs > 0) Track.event('Activity', 'time (s)', p.id, Math.round(r.timeMs / 1000));
    });
    E.on('settings', next => {
      if (!next || !lastSettings) { lastSettings = Object.assign({}, next || {}); return; }
      WATCHED.forEach(k => { if (next[k] !== lastSettings[k]) Track.event('Settings', k, next[k]); });
      lastSettings = Object.assign({}, next);
    });
  }
  boot();
})(typeof window !== 'undefined' ? window : globalThis);
