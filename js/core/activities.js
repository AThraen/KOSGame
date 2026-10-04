// KØS SEJL — js/core/activities.js
// KOS.Modes: registry of game modes. KOS.Activities: registry of playable activities (levels).
// Pure logic. Progress (stars) comes from a pluggable source set by js/ui/storage.js:
//   KOS.Activities.setProgressSource({ stars(id), done(id), total(), unlockAll() })
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  // ---------------------------------------------------------------- Modes
  const modes = {};
  KOS.Modes = {
    register(id, def) {
      if (!id || !def || typeof def.create !== 'function') throw new Error('KOS.Modes.register: bad mode ' + id);
      modes[id] = Object.assign({ id, kind: 'sea' }, def);
      if (KOS.Events && KOS.Events.emit) KOS.Events.emit('mode:registered', id);
      return modes[id];
    },
    get(id) { return modes[id] || null; },
    has(id) { return !!modes[id]; },
    list() { return Object.keys(modes); },
  };

  // ---------------------------------------------------------------- Areas
  // Hub areas in display order. Names/descriptions are i18n keys 'area.<id>.name' / 'area.<id>.desc'.
  const AREAS = ['club', 'school', 'bay', 'race', 'rules', 'nav', 'pier', 'rib'];
  const AREA_ICONS = { club: 'house', school: 'school', bay: 'sail', race: 'trophy', rules: 'rules', nav: 'compass', pier: 'anchor', rib: 'rib' };

  // ---------------------------------------------------------------- Activities
  const acts = {};
  let seq = 0;
  let source = {
    stars: () => 0,
    done: () => false,
    total: () => 0,
    unlockAll: () => false,
  };

  function norm(def) {
    if (!def || !def.id) throw new Error('KOS.Activities.add: activity needs an id');
    const a = Object.assign({
      mode: def.id.split('.')[0],
      area: 'bay',
      boat: null,
      order: 100,
      title: { da: def.id, en: def.id },
      desc: { da: '', en: '' },
      icon: null,
      params: {},
      unlock: null,
      minutes: 3,
      difficulty: 1,
    }, def);
    a._seq = acts[a.id] ? acts[a.id]._seq : seq++;
    if (!a.icon) a.icon = AREA_ICONS[a.area] || 'sail';
    return a;
  }

  function sortFn(a, b) {
    const ai = AREAS.indexOf(a.area), bi = AREAS.indexOf(b.area);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    if (a.order !== b.order) return a.order - b.order;
    return a._seq - b._seq;
  }

  const Activities = {
    AREAS,
    AREA_ICONS,
    add(defOrArray) {
      const arr = Array.isArray(defOrArray) ? defOrArray : [defOrArray];
      const out = [];
      for (const d of arr) { const a = norm(d); acts[a.id] = a; out.push(a); }
      if (KOS.Events && KOS.Events.emit) KOS.Events.emit('activities:changed', out.map(a => a.id));
      return Array.isArray(defOrArray) ? out : out[0];
    },
    get(id) { return acts[id] || null; },
    // filter: undefined | function(a) | {area, mode, boat}
    list(filter) {
      let all = Object.keys(acts).map(k => acts[k]);
      if (typeof filter === 'function') all = all.filter(filter);
      else if (filter && typeof filter === 'object') {
        all = all.filter(a => Object.keys(filter).every(k => filter[k] === undefined || a[k] === filter[k]));
      }
      return all.sort(sortFn);
    },
    byArea(area) { return Activities.list({ area }); },
    areas() { return AREAS.slice(); },
    next(id) {
      const a = acts[id];
      if (!a) return null;
      const list = Activities.byArea(a.area);
      const i = list.indexOf(a);
      return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    },
    isFirstInArea(id) {
      const a = acts[id];
      if (!a) return false;
      const list = Activities.byArea(a.area);
      return list[0] === a;
    },
    isUnlocked(id) {
      const a = acts[id];
      if (!a) return false;
      if (source.unlockAll()) return true;
      if (Activities.isFirstInArea(id)) return true;
      const u = a.unlock;
      if (!u) return true;
      if (typeof u.stars === 'number' && source.total() < u.stars) return false;
      if (u.after && acts[u.after] && !(source.stars(u.after) > 0 || source.done(u.after))) return false;
      return true;
    },
    // why is it locked? → {stars: n} | {after: activity} | null
    lockReason(id) {
      if (Activities.isUnlocked(id)) return null;
      const u = acts[id].unlock || {};
      if (typeof u.stars === 'number' && source.total() < u.stars) return { stars: u.stars, have: source.total() };
      if (u.after) return { after: acts[u.after] || null };
      return {};
    },
    areaStars(area) {
      const list = Activities.byArea(area);
      return { have: list.reduce((n, a) => n + (source.stars(a.id) || 0), 0), max: list.length * 3, count: list.length };
    },
    maxStars() { return Object.keys(acts).length * 3; },
    setProgressSource(src) { source = Object.assign({}, source, src || {}); },
  };
  KOS.Activities = Activities;

  if (KOS.I18n) {
    KOS.I18n.add('da', {
      area: {
        club: { name: 'Klubhuset', desc: 'Rig til, slå knob, rejs en kæntret jolle og tag quizzen.' },
        school: { name: 'Sejlerskolen', desc: 'Lær at styre, krydse, slå og bomme i bugten.' },
        bay: { name: 'Fri sejlads', desc: 'Sejl frit i Svanemøllebugten og saml ting op.' },
        race: { name: 'Kapsejlads', desc: 'Start, kryds, læns og mål ude på Øresund.' },
        rules: { name: 'Vigeregler', desc: 'Hvem skal vige? Bagbord, styrbord, luv og læ.' },
        nav: { name: 'Navigation', desc: 'Følg sejlrenden, læs søkortet og kend mærkerne.' },
        pier: { name: 'Havnemanøvrer', desc: 'Læg til og fra ved klubbens bro – blødt og præcist.' },
        rib: { name: 'RIB-missioner', desc: 'Kør trænerbåd: slæb joller, red sejlere, læg mærker.' },
      },
    });
    KOS.I18n.add('en', {
      area: {
        club: { name: 'Clubhouse', desc: 'Rig the boat, tie knots, right a capsized dinghy and take the quiz.' },
        school: { name: 'Sailing School', desc: 'Learn to steer, beat upwind, tack and gybe in the bay.' },
        bay: { name: 'Free Sail', desc: 'Sail freely in Svanemøllebugten and collect things.' },
        race: { name: 'Racing', desc: 'Start, beat, run and finish out on the Øresund.' },
        rules: { name: 'Right of Way', desc: 'Who gives way? Port, starboard, windward and leeward.' },
        nav: { name: 'Navigation', desc: 'Follow the channel, read the chart and know your marks.' },
        pier: { name: 'Docking', desc: 'Dock and undock at the club pier – gentle and precise.' },
        rib: { name: 'RIB Missions', desc: 'Drive the coach boat: tow dinghies, rescue sailors, lay marks.' },
      },
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
