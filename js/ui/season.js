// KØS SEJL — js/ui/season.js
// KOS.Season: small date windows for temporary seasonal events (Halloween ...). No DOM needed (also loads in Node tests).
//
//   KOS.Season.active('halloween')        -> bool  (the level + its hub promo: 24 Oct - 9 Nov 2026, local time, inclusive)
//   KOS.Season.active('halloween-deco')   -> bool  (decorative artwork only: 24 Oct - 31 Oct 2026, gone 1 Nov 00:00)
//   KOS.Season.active(id, date)           -> same for a given Date (tests)
//
// Dev override per event group (both windows of a group follow it): URL hash #halloween=1 (forced on) / #halloween=0
// (forced off) / #halloween=auto (back to the dates), stored like God mode in localStorage `kos.season.halloween`.
// In-memory overrides for tests: KOS.Season.force.halloween = true|false (null = none); KOS.Season.now = () => Date.
//
// A seasonal activity carries `season: '<window id>'`; KOS.Activities hides it (list/get) while the window is shut,
// so nothing (hub, results, suggestions, deep links) can reach it after the event. Stored stars stay in the save.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  // from/to are local calendar days, both inclusive. `group` = the override key.
  const WINDOWS = {
    halloween: { from: '2026-10-24', to: '2026-11-09', group: 'halloween' },
    'halloween-deco': { from: '2026-10-24', to: '2026-10-31', group: 'halloween' },
  };
  const KEY = g => 'kos.season.' + g;
  const dayNum = s => { const p = String(s).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
  const dateNum = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  function stored(g) {
    try { const v = root.localStorage && root.localStorage.getItem(KEY(g)); return v === '1' ? true : v === '0' ? false : null; } catch (e) { return null; }
  }

  const Season = {
    WINDOWS,
    force: {},
    now() { return new Date(); },
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
    // URL hash flags {halloween: '1'|'0'|'auto'} -> stored overrides
    applyHash(h) {
      if (!h) return;
      const groups = {};
      for (const id in WINDOWS) groups[WINDOWS[id].group] = 1;
      for (const g in groups) {
        if (h[g] === '1' || h[g] === '0') Season.setOverride(g, h[g] === '1');
        else if (h[g] === 'auto') Season.setOverride(g, null);
      }
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

  // browser: apply #halloween=1|0|auto and set the <html> classes right away (before the title's background is styled)
  if (typeof document !== 'undefined' && root.location) {
    const h = {};
    String(root.location.hash || '').replace(/^#/, '').split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) h[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
    Season.applyHash(h);
    Season.mark();
  }
})(typeof window !== 'undefined' ? window : globalThis);
