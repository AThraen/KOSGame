// KØS SEJL — js/ui/season.js
// KOS.Season: small date windows for temporary seasonal events (Halloween ...). No DOM needed (also loads in Node tests).
//
//   KOS.Season.active('halloween')        -> bool  (the level + its hub promo: 24 Oct - 9 Nov 2026, local time, inclusive)
//   KOS.Season.active('halloween-deco')   -> bool  (decorative artwork only: 24 Oct - 31 Oct 2026, gone 1 Nov 00:00)
//   KOS.Season.active('xmas')             -> bool  (Julekalender 2026: 29 Nov 2026 - 6 Jan 2027; 29-30 Nov = teaser)
//   KOS.Season.active('xmas-deco')        -> bool  (snow, hub decorations, Santa hats: same dates)
//   KOS.Season.active(id, date)           -> same for a given Date (tests)
//
// Dev override per event group (both windows of a group follow it): URL hash #halloween=1 (forced on) / #halloween=0
// (forced off) / #halloween=auto (back to the dates), stored like God mode in localStorage `kos.season.halloween`.
// In-memory overrides for tests: KOS.Season.force.halloween = true|false (null = none); KOS.Season.now = () => Date.
//
// Test date (God mode only): #date=YYYY-MM-DD stores localStorage `kos.season.date`, #date=auto clears it. While God mode
// is on (localStorage kos.godmode = "1", see KOS.Storage.god) Season.now() returns that day at the current time of day,
// so #god=1&date=2026-12-13 shows Lucia day. Without God mode the stored date is ignored (no spoiler links).
// Everything date-based (season windows, the Christmas calendar) must read the date via KOS.Season.now().
// KOS.Season.dateOverride() -> 'YYYY-MM-DD' while it is in effect, else null (the "Testdato" pill).
//
// A seasonal activity carries `season: '<window id>'`; KOS.Activities hides it (list/get) while the window is shut,
// so nothing (hub, results, suggestions, deep links) can reach it after the event. Stored stars stay in the save.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  // from/to are local calendar days, both inclusive. `group` = the override key.
  const WINDOWS = {
    halloween: { from: '2026-10-24', to: '2026-11-09', group: 'halloween' },
    'halloween-deco': { from: '2026-10-24', to: '2026-10-31', group: 'halloween' },
    xmas: { from: '2026-11-29', to: '2027-01-06', group: 'xmas' },
    'xmas-deco': { from: '2026-11-29', to: '2027-01-06', group: 'xmas' },
  };
  const DATE_KEY = 'kos.season.date';
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  // a real calendar day 'YYYY-MM-DD' -> [y, m, d], else null (rejects 2026-02-30 and friends)
  function parseDay(s) {
    const m = DATE_RE.exec(String(s || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = new Date(y, mo - 1, d);
    return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d ? [y, mo, d] : null;
  }
  // God mode, read the same way as KOS.Storage.god() (season.js may load before storage.js)
  function godOn() {
    if (KOS.Storage && KOS.Storage.god) return KOS.Storage.god();
    try { return !!root.localStorage && root.localStorage.getItem('kos.godmode') === '1'; } catch (e) { return false; }
  }
  const KEY = g => 'kos.season.' + g;
  const dayNum = s => { const p = String(s).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
  const dateNum = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  function stored(g) {
    try { const v = root.localStorage && root.localStorage.getItem(KEY(g)); return v === '1' ? true : v === '0' ? false : null; } catch (e) { return null; }
  }

  const Season = {
    WINDOWS,
    force: {},
    // "today": the real clock, or the God-mode test date at the current time of day
    now() {
      const real = new Date();
      const o = parseDay(Season.dateOverride());
      if (!o) return real;
      return new Date(o[0], o[1] - 1, o[2], real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
    },
    // the stored test date 'YYYY-MM-DD' while God mode is on, else null
    dateOverride() {
      if (!godOn()) return null;
      let v = null;
      try { v = root.localStorage && root.localStorage.getItem(DATE_KEY); } catch (e) { return null; }
      return parseDay(v) ? v : null;
    },
    setDateOverride(day) {
      try {
        if (!root.localStorage) return;
        if (parseDay(day)) root.localStorage.setItem(DATE_KEY, day);
        else root.localStorage.removeItem(DATE_KEY);
      } catch (e) { /* storage blocked */ }
    },
    // forced state for a group: true / false / null (follow the dates)
    override(group) {
      if (Season.force[group] === true || Season.force[group] === false) return Season.force[group];
      return stored(group);
    },
    setOverride(group, on) {
      try {
        if (!root.localStorage) return;
        if (on === true || on === false) root.localStorage.setItem(KEY(group), on ? '1' : '0');
        else root.localStorage.removeItem(KEY(group));
      } catch (e) { /* storage blocked */ }
    },
    inWindow(id, date) {
      const w = WINDOWS[id];
      if (!w) return false;
      const n = dateNum(date || Season.now());
      return n >= dayNum(w.from) && n <= dayNum(w.to);
    },
    active(id, date) {
      const w = WINDOWS[id];
      if (!w) return false;
      const o = Season.override(w.group);
      if (o !== null) return o;
      return Season.inWindow(id, date);
    },
    // URL hash flags {halloween: '1'|'0'|'auto', xmas: ..., date: 'YYYY-MM-DD'|'auto'} -> stored overrides
    applyHash(h) {
      if (!h) return;
      const groups = {};
      for (const id in WINDOWS) groups[WINDOWS[id].group] = 1;
      for (const g in groups) {
        if (h[g] === '1' || h[g] === '0') Season.setOverride(g, h[g] === '1');
        else if (h[g] === 'auto') Season.setOverride(g, null);
      }
      if (h.date === 'auto') Season.setDateOverride(null);
      else if (parseDay(h.date)) Season.setDateOverride(h.date);
    },
    // <html> classes: season-<id> for every open window (css/halloween.css hangs off these). Cheap; re-run on screen changes
    // so an app left open over midnight on 31 Oct drops the decorations on the next screen.
    // Season.on[id] = the state at the last mark() (cheap per-frame reads for renderers)
    on: {},
    mark() {
      for (const id in WINDOWS) Season.on[id] = Season.active(id);
      if (typeof document === 'undefined') return;
      const el = document.documentElement;
      for (const id in WINDOWS) el.classList.toggle('season-' + id, Season.on[id]);
    },
  };
  KOS.Season = Season;

  if (KOS.Activities && KOS.Activities.setSeasonSource) KOS.Activities.setSeasonSource(id => Season.active(id));

  // browser: apply #halloween=1|0|auto (#xmas=..., #date=...) and set the <html> classes right away (before the title's background is styled)
  if (typeof document !== 'undefined' && root.location) {
    const h = {};
    String(root.location.hash || '').replace(/^#/, '').split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) h[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
    Season.applyHash(h);
    Season.mark();
  }
})(typeof window !== 'undefined' ? window : globalThis);
