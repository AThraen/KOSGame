// KØS SEJL — js/core/i18n.js
// KOS.I18n: tiny dictionary-based i18n. Danish first, English second.
//   KOS.I18n.add(lang, dict)    merge strings (flat keys like 'race.start.title', or nested objects)
//   KOS.I18n.setLang('da'|'en') switch language (emits KOS.Events 'lang')
//   KOS.I18n.lang               current language
//   KOS.t(key, vars)            lookup with {name} interpolation; falls back to en, then da, then the key
//   KOS.tt({da, en})            pick an inline translation object
//   KOS.I18n.apply(rootEl)      fill [data-i18n], [data-i18n-title], [data-i18n-aria], [data-i18n-placeholder]
// Pure logic: apply() only touches the element it is given.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const LANGS = ['da', 'en'];
  const dicts = { da: {}, en: {} };

  function flatten(obj, prefix, out) {
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      const v = obj[k];
      const key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = v;
    }
    return out;
  }

  function interpolate(s, vars) {
    if (!vars || typeof s !== 'string') return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  }

  const I18n = {
    langs: LANGS.slice(),
    lang: 'da',
    add(lang, dict) {
      if (!dicts[lang]) dicts[lang] = {};
      flatten(dict || {}, '', dicts[lang]);
      return I18n;
    },
    has(key, lang) {
      return dicts[lang || I18n.lang] && dicts[lang || I18n.lang][key] !== undefined;
    },
    setLang(lang) {
      if (!dicts[lang]) lang = 'da';
      const changed = lang !== I18n.lang;
      I18n.lang = lang;
      if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
      if (changed && KOS.Events && KOS.Events.emit) KOS.Events.emit('lang', lang);
      return lang;
    },
    t(key, vars) {
      if (key === undefined || key === null) return '';
      const L = I18n.lang;
      let s = dicts[L] && dicts[L][key];
      if (s === undefined) s = dicts.en[key];
      if (s === undefined) s = dicts.da[key];
      if (s === undefined) return String(key);
      if (typeof s === 'function') return s(vars || {});
      return interpolate(s, vars);
    },
    tt(obj, vars) {
      if (obj === undefined || obj === null) return '';
      if (typeof obj === 'string') return interpolate(obj, vars);
      const s = obj[I18n.lang] !== undefined ? obj[I18n.lang] : (obj.en !== undefined ? obj.en : obj.da);
      return interpolate(s === undefined ? '' : s, vars);
    },
    // plural helper: KOS.I18n.plural(n, 'key.one', 'key.many', vars)
    plural(n, one, many, vars) {
      return I18n.t(n === 1 ? one : many, Object.assign({ n }, vars || {}));
    },
    apply(rootEl) {
      if (!rootEl || !rootEl.querySelectorAll) return;
      const all = [rootEl].concat(Array.prototype.slice.call(rootEl.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-aria],[data-i18n-placeholder]')));
      for (const el of all) {
        if (!el.getAttribute) continue;
        const k = el.getAttribute('data-i18n');
        if (k) el.textContent = I18n.t(k);
        const kt = el.getAttribute('data-i18n-title');
        if (kt) el.setAttribute('title', I18n.t(kt));
        const ka = el.getAttribute('data-i18n-aria');
        if (ka) el.setAttribute('aria-label', I18n.t(ka));
        const kp = el.getAttribute('data-i18n-placeholder');
        if (kp) el.setAttribute('placeholder', I18n.t(kp));
      }
    },
    _dicts: dicts,
  };

  KOS.I18n = I18n;
  KOS.t = I18n.t;
  KOS.tt = I18n.tt;

  // Shared, module-neutral words any module may use.
  I18n.add('da', {
    common: {
      ok: 'OK', cancel: 'Annuller', close: 'Luk', back: 'Tilbage', next: 'Næste', retry: 'Prøv igen', yes: 'Ja', no: 'Nej',
      play: 'Spil', start: 'Start', resume: 'Fortsæt', restart: 'Start forfra', quit: 'Afslut', save: 'Gem', loading: 'Henter …',
      locked: 'Låst', unlocked: 'Låst op', stars: 'stjerner', star: 'stjerne', min: 'min', on: 'Til', off: 'Fra',
      port: 'Bagbord', starboard: 'Styrbord', knots: 'knob', kn: 'kn', m: 'm', seconds: 'sek.', score: 'Point', time: 'Tid',
      comingSoon: 'Kommer snart!',
    },
  });
  I18n.add('en', {
    common: {
      ok: 'OK', cancel: 'Cancel', close: 'Close', back: 'Back', next: 'Next', retry: 'Try again', yes: 'Yes', no: 'No',
      play: 'Play', start: 'Start', resume: 'Resume', restart: 'Restart', quit: 'Quit', save: 'Save', loading: 'Loading …',
      locked: 'Locked', unlocked: 'Unlocked', stars: 'stars', star: 'star', min: 'min', on: 'On', off: 'Off',
      port: 'Port', starboard: 'Starboard', knots: 'knots', kn: 'kn', m: 'm', seconds: 's', score: 'Score', time: 'Time',
      comingSoon: 'Coming soon!',
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
