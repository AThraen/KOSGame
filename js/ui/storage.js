// KØS SEJL — js/ui/storage.js
// KOS.Storage: localStorage behind try/catch (key prefix 'kos.'), with an in-memory fallback
// when storage is blocked (private mode, file:// quirks). See SPEC.md.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const PREFIX = 'kos.';
  const mem = {};
  let ls = null;
  try {
    ls = root.localStorage;
    const probe = PREFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch (e) { ls = null; }

  function rawGet(k) {
    try { if (ls) return ls.getItem(PREFIX + k); } catch (e) { /* fall through */ }
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
  }
  function rawSet(k, s) {
    mem[k] = s;
    try { if (ls) ls.setItem(PREFIX + k, s); } catch (e) { /* quota / blocked: memory only */ }
  }
  function rawDel(k) {
    delete mem[k];
    try { if (ls) ls.removeItem(PREFIX + k); } catch (e) { /* ignore */ }
  }

  const DEFAULT_SETTINGS = {
    lang: 'da', sound: true, music: false, volume: 0.8, assist: 'easy', controls: 'auto', unlockAll: false, reducedMotion: false, windUnit: 'ms',
  };

  function emit(name, payload) { if (KOS.Events && KOS.Events.emit) KOS.Events.emit(name, payload); }

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  const Storage = {
    available: !!ls,
    // validate(v) -> bool: a value that fails (hand-edited or half-written storage) falls back to def.
    get(k, def, validate) {
      const s = rawGet(k);
      if (s === null || s === undefined) return def;
      let v;
      try { v = JSON.parse(s); } catch (e) { return def; }
      if (typeof validate === 'function') { try { if (!validate(v)) return def; } catch (e) { return def; } }
      return v;
    },
    set(k, v) {
      if (v === undefined) { rawDel(k); return v; }
      try { rawSet(k, JSON.stringify(v)); } catch (e) { /* unserialisable */ }
      return v;
    },
    remove(k) { rawDel(k); },

    // God mode (testing): localStorage kos.godmode = "1", or open the game with #god=1 (#god=0 turns it off).
    // Unlocks everything and adds a "win" button to the pause menu.
    god() { try { return root.localStorage.getItem('kos.godmode') === '1'; } catch (e) { return false; } },
    setGod(on) { try { if (on) root.localStorage.setItem('kos.godmode', '1'); else root.localStorage.removeItem('kos.godmode'); } catch (e) { /* storage blocked */ } },
    settings() {
      const s = Object.assign({}, DEFAULT_SETTINGS, Storage.get('settings', {}, isObj) || {});
      if (Storage.god()) s.unlockAll = true;
      if (s.lang !== 'da' && s.lang !== 'en') s.lang = 'da';
      if (['easy', 'normal', 'pro'].indexOf(s.assist) < 0) s.assist = 'easy';
      if (['auto', 'buttons', 'joystick'].indexOf(s.controls) < 0) s.controls = 'auto';
      if (s.windUnit !== 'ms' && s.windUnit !== 'kn') s.windUnit = 'ms';
      s.volume = Math.max(0, Math.min(1, +s.volume || 0));
      return s;
    },
    saveSettings(s) {
      const next = Object.assign({}, Storage.settings(), s || {});
      Storage.set('settings', next);
      emit('settings', next);
      return next;
    },
    defaultSettings() { return Object.assign({}, DEFAULT_SETTINGS); },

    profile() { return Storage.get('profile', null, isObj); },
    saveProfile(p) {
      const prev = Storage.profile() || {};
      const next = Object.assign({ createdAt: Date.now() }, prev, p || {});
      if (!next.createdAt) next.createdAt = Date.now();
      Storage.set('profile', next);
      emit('profile', next);
      return next;
    },

    _allProgress() { return Storage.get('progress', {}, isObj) || {}; },
    progress(id) {
      const p = Storage._allProgress()[id];
      return Object.assign({ stars: 0, best: 0, plays: 0, done: false }, p || {});
    },
    // result = {stars, score, timeMs, success, stats}
    record(id, result) {
      result = result || {};
      const all = Storage._allProgress();
      const prev = Object.assign({ stars: 0, best: 0, plays: 0, done: false }, all[id] || {});
      const stars = Math.max(0, Math.min(3, Math.round(+result.stars || 0)));
      const score = +result.score || 0;
      const starsGained = Math.max(0, stars - prev.stars);
      const newBest = prev.plays > 0 ? score > prev.best : score > 0;
      const firstDone = !prev.done && !!result.success;
      const next = {
        stars: Math.max(prev.stars, stars),
        best: Math.max(prev.best, score),
        plays: prev.plays + 1,
        done: prev.done || !!result.success,
        bestTimeMs: result.success && result.timeMs ? Math.min(prev.bestTimeMs || Infinity, result.timeMs) : prev.bestTimeMs,
        last: Date.now(),
      };
      all[id] = next;
      Storage.set('progress', all);
      // XP = stars × 100 for newly earned stars + bonuses (first finish, new best, a little for practice)
      const xpGained = starsGained * 100 + (firstDone ? 50 : 0) + (newBest && prev.plays > 0 ? 25 : 0) + (result.success ? 10 : 5);
      Storage.set('xp', Storage.xp() + xpGained);
      const out = { newBest: newBest && prev.plays > 0, starsGained, xpGained, firstDone, prev, progress: next };
      emit('progress', { id, result, out });
      return out;
    },
    totalStars() {
      const all = Storage._allProgress();
      let n = 0;
      for (const k in all) n += (all[k] && all[k].stars) || 0;
      return n;
    },
    xp() { return +Storage.get('xp', 0) || 0; },
    addXp(n) { Storage.set('xp', Storage.xp() + (+n || 0)); return Storage.xp(); },

    badges() { return Storage.get('badges', [], Array.isArray) || []; },
    hasBadge(id) { return Storage.badges().indexOf(id) >= 0; },
    award(badgeId) {
      const b = Storage.badges();
      if (b.indexOf(badgeId) >= 0) return false;
      b.push(badgeId);
      Storage.set('badges', b);
      emit('badge', badgeId);
      return true;
    },

    // wipe progress (keeps settings unless all = true)
    reset(all) {
      ['progress', 'xp', 'badges', 'profile', 'boat'].forEach(rawDel);
      if (all) rawDel('settings');
      emit('progress', { reset: true });
    },
  };

  KOS.Storage = Storage;

  if (KOS.Activities && KOS.Activities.setProgressSource) {
    KOS.Activities.setProgressSource({
      stars: id => Storage.progress(id).stars,
      done: id => Storage.progress(id).done,
      total: () => Storage.totalStars(),
      unlockAll: () => !!Storage.settings().unlockAll,
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
