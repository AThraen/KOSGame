// KØS SEJL — js/ui/hub.js
// KOS.Hub: the illustrated, animated harbor map (Svanemøllebugten · Svaneknoppen · Kalkbrænderiløbet · Øresund).
//   KOS.Hub.mount(sectionEl)  build the screen into a section (idempotent; re-mount refreshes)
//   KOS.Hub.unmount()         tear down listeners/animations
//   KOS.Hub.refresh()         re-read stars / profile / language
//   KOS.Hub.areas             [{id, icon, color, minStars, anchor}], KOS.Hub.isAreaUnlocked(id), KOS.Hub.areaLockStars(id)
// The map is drawn from KOS.World geometry through a gentle "fisheye" projection centred on the club, so the
// little club basin is big and tappable while the far Sound is still on the map. Pins are HTML (constant size).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  // ------------------------------------------------------------------ strings
  const STR = {
    da: {
      hub: {
        title: 'Havnekortet',
        loc: { club: 'Klubhuset', school: 'Sejlerskolen', bay: 'Bugten', race: 'Kapsejladsbanen', rules: 'Vigeregelskolen', nav: 'Sejlrenden', pier: 'Broen', rib: 'RIB-pontonen' },
        sub: { club: 'Rigning · knob · quiz', school: 'Lær at sejle', bay: 'Fri sejlads', race: 'Ude på Øresund', rules: 'Hvem skal vige?', nav: 'Mærker & søkort', pier: 'Læg til og fra', rib: 'Trænerbåd-missioner' },
        stars: '{have}/{max}',
        locked: 'Låst',
        needStars: '{n} ★',
        lockedToast: 'Saml {n} stjerner mere for at låse {name} op! ⭐',
        soon: 'Kommer snart',
        new: 'NY',
        garage: 'Sejlerpas',
        settings: 'Indstillinger',
        profile: 'Din profil',
        sailor: 'Sejler',
        hello: 'Ahoj, {name}!',
        totalStars: 'Stjerner i alt',
        next: 'Næste udfordring',
        play: 'Sejl!',
        hint: 'Træk i kortet for at kigge rundt · tryk på et sted',
        zoomIn: 'Zoom ind', zoomOut: 'Zoom ud', recenter: 'Tilbage til klubben',
        places: 'Alle steder', placesTitle: 'Hvor vil du hen?', startHere: 'Start her', close: 'Luk',
        wind: 'Vind {kn} kn fra {dir}',
        level: 'Niveau {n}', toNext: '{n} XP til næste niveau',
        rank: ['Ælling', 'Letmatros', 'Matros', 'Bådsmand', 'Styrmand', 'Skipper', 'Kaptajn', 'Admiral'],
        dirs: ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'],
      },
    },
    en: {
      hub: {
        title: 'Harbour map',
        loc: { club: 'Clubhouse', school: 'Sailing School', bay: 'The Bay', race: 'Race Course', rules: 'Right-of-Way School', nav: 'The Channel', pier: 'The Pier', rib: 'RIB Pontoon' },
        sub: { club: 'Rigging · knots · quiz', school: 'Learn to sail', bay: 'Free sailing', race: 'Out on the Øresund', rules: 'Who gives way?', nav: 'Marks & charts', pier: 'Docking practice', rib: 'Coach-boat missions' },
        stars: '{have}/{max}',
        locked: 'Locked',
        needStars: '{n} ★',
        lockedToast: 'Collect {n} more stars to unlock {name}! ⭐',
        soon: 'Coming soon',
        new: 'NEW',
        garage: 'Sailing passport',
        settings: 'Settings',
        profile: 'Your profile',
        sailor: 'Sailor',
        hello: 'Ahoy, {name}!',
        totalStars: 'Total stars',
        next: 'Next challenge',
        play: 'Sail!',
        hint: 'Drag the map to look around · tap a place',
        zoomIn: 'Zoom in', zoomOut: 'Zoom out', recenter: 'Back to the club',
        places: 'All places', placesTitle: 'Where to?', startHere: 'Start here', close: 'Close',
        wind: 'Wind {kn} kn from {dir}',
        level: 'Level {n}', toNext: '{n} XP to the next level',
        rank: ['Duckling', 'Deckhand', 'Sailor', 'Bosun', 'First Mate', 'Skipper', 'Captain', 'Admiral'],
        dirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
      },
    },
  };
  // arrays are stored as indexed keys (hub.rank.0 …) by the flattening i18n
  function flatArrays(o) {
    const out = {};
    for (const k in o) {
      const v = o[k];
      if (Array.isArray(v)) v.forEach((s, i) => { out[k + '.' + i] = s; });
      else if (v && typeof v === 'object') out[k] = flatArrays(v);
      else out[k] = v;
    }
    return out;
  }
  if (KOS.I18n) { KOS.I18n.add('da', flatArrays(STR.da)); KOS.I18n.add('en', flatArrays(STR.en)); }
  function t(key, vars) {
    if (KOS.t) { const s = KOS.t(key, vars); if (s !== key) return s; }
    const lang = (KOS.I18n && KOS.I18n.lang) || 'da';
    let s = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), STR[lang] || STR.da);
    if (s === undefined) return key;
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------ areas
  const ICONS = {
    club: '<path d="M3.5 11.2 12 4.5l8.5 6.7"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/><path d="M15.5 4.5v3"/>',
    school: '<path d="M2 9.5 12 5l10 4.5L12 14z"/><path d="M6 11.5v4.2c3.3 2.6 8.7 2.6 12 0v-4.2"/><path d="M22 9.5v5.5"/>',
    bay: '<path d="M12 3v14"/><path d="M12 4c4.2 3 6.4 7.6 6.4 12H12"/><path d="M10.6 6.5C8 9 6.4 12.4 6.4 16h4.2"/><path d="M3 18.5h18c-1 1.6-2.6 2.5-4.3 2.5H7.3C5.6 21 4 20.1 3 18.5z"/>',
    race: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3.3 4"/><path d="M16.5 6h3a3 3 0 0 1-3.3 4"/><path d="M12 13.5v3.5"/><path d="M8.5 20.5h7"/><path d="M9.5 17h5v3.5h-5z"/>',
    rules: '<path d="M12 3.2 21.5 19.5h-19z"/><path d="M12 9.5v4.5"/><path d="M12 16.8v.2"/>',
    nav: '<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21"/>',
    pier: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13.5"/><path d="M8 10.5h8"/><path d="M4.8 13.5c.3 4.2 3.3 7 7.2 7s6.9-2.8 7.2-7"/><path d="m3 15.3 1.8-1.8 1.8 1.8M17.4 15.3l1.8-1.8 1.8 1.8"/>',
    rib: '<path d="M2.5 14.5h16.2l2.8-2.8"/><path d="M4 14.5 6 18h11.3c2 0 3.4-1.3 4.2-3.5"/><path d="M9.5 14.5v-4.5h4.2l2 4.5"/><path d="M11 10V6.8"/>',
    star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>',
    passport: '<rect x="4.5" y="2.8" width="15" height="18.4" rx="2.2"/><circle cx="12" cy="10" r="3.4"/><path d="M8.5 16.8h7"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    home: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  };
  const icon = (name, cls) => `<svg class="hub-ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.bay}</svg>`;

  // anchor = world point (m) the pin points at; off = pin offset in map px from the anchor (for crowded spots)
  const AREAS = [
    { id: 'club', icon: 'club', color: '#ff8a3d', minStars: 0, anchor: 'club', off: [110, 20] },
    { id: 'pier', icon: 'pier', color: '#4aa8ff', minStars: 2, anchor: 'pier', off: [-130, -60] },
    { id: 'rib', icon: 'rib', color: '#ff5a36', minStars: 20, anchor: 'rib', off: [70, -150] },
    { id: 'school', icon: 'school', color: '#2fd0c3', minStars: 0, anchor: 'school', off: [0, -90] },
    { id: 'bay', icon: 'bay', color: '#3ee08f', minStars: 0, anchor: 'bay', off: [0, 0] },
    { id: 'rules', icon: 'rules', color: '#a77bff', minStars: 2, anchor: 'rules', off: [0, 0] },
    { id: 'nav', icon: 'nav', color: '#18c06a', minStars: 6, anchor: 'nav', off: [0, 0] },
    { id: 'race', icon: 'race', color: '#ffc845', minStars: 4, anchor: 'race', off: [-90, 80] },
  ];

  function totalStars() { try { return KOS.Storage ? KOS.Storage.totalStars() : 0; } catch (e) { return 0; } }
  function unlockAll() { try { return !!(KOS.Storage && KOS.Storage.settings().unlockAll); } catch (e) { return false; } }
  function areaLockStars(id) {
    const a = AREAS.find(q => q.id === id);
    if (!a || unlockAll()) return 0;
    return Math.max(0, a.minStars - totalStars());
  }
  function isAreaUnlocked(id) { return areaLockStars(id) === 0; }
  function areaStars(id) {
    if (KOS.Activities && KOS.Activities.areaStars) { try { return KOS.Activities.areaStars(id); } catch (e) { /* ignore */ } }
    return { have: 0, max: 0, count: 0 };
  }
  function areaHasNew(id) {
    if (!KOS.Activities || !KOS.Storage) return false;
    try {
      return KOS.Activities.byArea(id).some(a => KOS.Activities.isUnlocked(a.id) && !KOS.Storage.progress(a.id).plays);
    } catch (e) { return false; }
  }
  function firstLessonDone() {
    try { return !!(KOS.Storage && KOS.Storage.progress('school.steer').done); } catch (e) { return true; }
  }
  function nextActivity() {
    if (!KOS.Activities || !KOS.Storage) return null;
    try {
      if (KOS.App && KOS.App.suggest) return KOS.App.suggest();
      const all = KOS.Activities.list().filter(a => isAreaUnlocked(a.area) && KOS.Activities.isUnlocked(a.id));
      return all.find(a => !KOS.Storage.progress(a.id).plays) || all.find(a => KOS.Storage.progress(a.id).stars < 3) || null;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ projection (world m → map px)
  const MAP_W = 1800;
  let PROJ = null;
  function makeProj() {
    const F = { x: 0, y: -350 }, r0 = 320;
    const rect = { x0: -1100, y0: -3600, x1: 5000, y1: 700 };
    const fx = (x, y) => {
      const dx = x - F.x, dy = y - F.y, r = Math.hypot(dx, dy);
      const k = r < 1e-6 ? 1 / r0 : Math.log(1 + r / r0) / r;
      return [dx * k, dy * k];
    };
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const corners = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      for (let s = 0; s <= 40; s++) {
        const q = fx(a[0] + (b[0] - a[0]) * s / 40, a[1] + (b[1] - a[1]) * s / 40);
        // use the inner envelope so the map edge never shows outside the drawn world
        bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]);
      }
    }
    // trim a bit so curved edges stay off-screen
    const tw = (bx1 - bx0) * 0.05, th = (by1 - by0) * 0.05;
    bx0 += tw; bx1 -= tw; by0 += th; by1 -= th;
    const sc = MAP_W / (bx1 - bx0);
    const p = (x, y) => { const q = fx(x, y); return [(q[0] - bx0) * sc, (q[1] - by0) * sc]; };
    const local = (x, y) => {
      const r = Math.hypot(x - F.x, y - F.y) || 1;
      return sc * Math.sqrt((Math.log(1 + r / r0) / r) * (1 / (r0 + r)));
    };
    return { p, local, W: MAP_W, H: Math.round((by1 - by0) * sc) };
  }
  function densify(poly, step, closed) {
    const out = [];
    const n = poly.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(L / step));
      for (let s = 0; s < k; s++) out.push([a[0] + (b[0] - a[0]) * s / k, a[1] + (b[1] - a[1]) * s / k]);
    }
    if (!closed) out.push(poly[n - 1]);
    return out;
  }
  const f1 = (n) => Math.round(n * 10) / 10;
  function pathOf(poly, closed, step) {
    const pts = densify(poly, step || 40, closed !== false);
    let d = '';
    for (let i = 0; i < pts.length; i++) { const q = PROJ.p(pts[i][0], pts[i][1]); d += (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); }
    return d + (closed !== false ? 'Z' : '');
  }
  function smoothPath(points, closed) {
    // Catmull-Rom → cubic Bézier through projected points
    const P = points.map(p => PROJ.p(p[0], p[1]));
    const n = P.length;
    const get = (i) => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
    let d = 'M' + f1(P[0][0]) + ' ' + f1(P[0][1]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + f1(c1[0]) + ' ' + f1(c1[1]) + ' ' + f1(c2[0]) + ' ' + f1(c2[1]) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
    }
    return d + (closed ? 'Z' : '');
  }
  function loop(cx, cy, rx, ry, n, rot) {
    const out = [], a = (rot || 0) * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;
      out.push([cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
    }
    return out;
  }

  // ------------------------------------------------------------------ the map SVG
  const DEPTH_STOPS = [[0.6, '#bff0f4'], [1.0, '#a6e6f1'], [1.6, '#8bdbef'], [2.0, '#7bd0ec'], [2.2, '#72c8ea'], [2.6, '#63bbe5'], [3.0, '#56aee0'], [3.5, '#4aa2da'], [5.2, '#3b88cc'], [7, '#3173be'], [9.5, '#2a60aa'], [12, '#234f95'], [13, '#1e4689']];
  function depthColor(d) { for (const s of DEPTH_STOPS) if (d <= s[0]) return s[1]; return DEPTH_STOPS[DEPTH_STOPS.length - 1][1]; }
  const BUOY_COL = { port: '#ff3b47', stbd: '#1fc46a', swim: '#ffd84a', special: '#ffd84a', cardN: '#ffd84a', cardE: '#ffd84a', cardS: '#ffd84a', cardW: '#ffd84a', isolated: '#ff3b47', safe: '#ff3b47' };

  function buildMap() {
    const W = KOS.World, G = W.global;
    PROJ = PROJ || makeProj();
    const P = PROJ;
    const out = [];
    const push = (s) => out.push(s);
    push(`<svg class="hub-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.W} ${P.H}" width="${P.W}" height="${P.H}" preserveAspectRatio="none">`);
    push(`<defs>
      <linearGradient id="hubSea" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3d8fd0"/><stop offset="1" stop-color="#1b3f80"/></linearGradient>
      <linearGradient id="hubLand" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#f6ecc4"/><stop offset="1" stop-color="#e9d9a2"/></linearGradient>
      <linearGradient id="hubPark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe08f"/><stop offset="1" stop-color="#a3cf78"/></linearGradient>
      <radialGradient id="hubCloud"><stop offset="0" stop-color="#0b1a3a" stop-opacity=".22"/><stop offset="1" stop-color="#0b1a3a" stop-opacity="0"/></radialGradient>
      <radialGradient id="hubGlow"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".4" stop-color="#ffe680" stop-opacity=".45"/><stop offset="1" stop-color="#ffe680" stop-opacity="0"/></radialGradient>
      <radialGradient id="hubSun" cx=".85" cy=".1" r=".9"><stop offset="0" stop-color="#ffd59a" stop-opacity=".35"/><stop offset=".5" stop-color="#ffb07a" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <filter id="hubSoft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="hubShadow" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0a2550" flood-opacity=".38"/></filter>
      <pattern id="hubWaves" width="130" height="90" patternUnits="userSpaceOnUse">
        <path d="M6 14q7-6 14 0t14 0" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="2" stroke-linecap="round"/>
        <path d="M80 62q6-5 12 0t12 0" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="1.8" stroke-linecap="round"/>
      </pattern>
      <symbol id="hubSail" viewBox="-12 -12 24 24" overflow="visible">
        <ellipse cx="-1" cy="1.6" rx="8" ry="2.8" fill="#06264d" opacity=".22"/>
        <path d="M-12 0 l-6 -2.5 M-12 0 l-6 2.5" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M-8 -2.6Q2 -3.6 8.5 0Q2 3.6 -8 2.6Z" fill="#fff" stroke="#24364f" stroke-width=".7"/>
        <path d="M1.5 0Q-2 6 -7.5 7.5L-6.8 0.3Z" fill="var(--sail,#fff)" stroke="#24364f" stroke-width=".6"/>
        <circle cx="1.5" cy="0" r=".9" fill="#24364f"/>
      </symbol>
      <symbol id="hubOpti" viewBox="-8 -8 16 16" overflow="visible">
        <ellipse cx="-.5" cy="1.2" rx="4.8" ry="2.2" fill="#06264d" opacity=".22"/>
        <path d="M-4.5 -2.2H3.6Q5 -2.2 5 0Q5 2.2 3.6 2.2H-4.5Z" fill="#fff" stroke="#24364f" stroke-width=".6"/>
        <path d="M1.4 0L-4 4.6L-4.6 0.4Z" fill="var(--sail,#ff8a3d)" stroke="#24364f" stroke-width=".5"/>
        <circle cx="-2.4" cy="-.6" r="1.1" fill="#ffcf4a"/>
      </symbol>
      <symbol id="hubRib" viewBox="-12 -8 24 16" overflow="visible">
        <path d="M-9 -2 L-20 -5 M-9 2 L-20 5" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <path d="M-8 -3.6H4Q9 -3.6 9.5 0Q9 3.6 4 3.6H-8Z" fill="#ff7a1f" stroke="#1d1d1d" stroke-width="1.1"/>
        <rect x="-3" y="-1.6" width="3.6" height="3.2" rx=".8" fill="#ff9a4a" stroke="#222" stroke-width=".5"/>
        <rect x="-10" y="-1.4" width="2.4" height="2.8" rx=".5" fill="#1d1d1d"/>
        <circle cx="-1.5" cy="0" r="1.1" fill="#ffd2a8"/>
      </symbol>
      <symbol id="hubFerry" viewBox="-30 -10 60 20" overflow="visible">
        <ellipse cx="0" cy="3" rx="30" ry="7" fill="#06264d" opacity=".2"/>
        <path d="M-28 -7H18Q30 -6 31 0Q30 6 18 7H-28Z" fill="#f4f6fa" stroke="#24364f" stroke-width="1"/>
        <rect x="-20" y="-4.5" width="28" height="9" rx="2" fill="#dfe6f0" stroke="#7d8ba0" stroke-width=".6"/>
        <rect x="-12" y="-2.6" width="6" height="5.2" rx="1" fill="#2d6bd0"/>
        <path d="M-34 -4l-8 -2M-34 4l-8 2" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>
      </symbol>
      <symbol id="hubShip" viewBox="-40 -10 80 20" overflow="visible">
        <path d="M-38 -7H26Q38 -5 40 0Q38 5 26 7H-38Z" fill="#c2423a" stroke="#3a1714" stroke-width="1"/>
        <rect x="-30" y="-5" width="10" height="10" fill="#e8b84a"/><rect x="-18" y="-5" width="10" height="10" fill="#4a8be8"/><rect x="-6" y="-5" width="10" height="10" fill="#4ae8a0"/><rect x="6" y="-5" width="10" height="10" fill="#e8e8e8"/>
        <rect x="-37" y="-4" width="6" height="8" rx="1" fill="#f6f6f6"/>
      </symbol>
      <symbol id="hubGull" viewBox="-8 -5 16 10" overflow="visible">
        <path class="hub-wing" d="M-7 0Q-3.5 -4.5 0 0Q3.5 -4.5 7 0" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </symbol>
    </defs>`);
    push(`<rect width="${P.W}" height="${P.H}" fill="url(#hubSea)"/>`);
    // depth (soft painterly gradient)
    push('<g filter="url(#hubSoft)">');
    for (const z of G.depth) push(`<path d="${pathOf(z.poly, true, 60)}" fill="${depthColor(z.d)}"/>`);
    push('</g>');
    // waves pattern drifting (CSS animated group)
    push(`<g class="hub-waves"><rect x="-90" y="-56" width="${P.W + 180}" height="${P.H + 112}" fill="url(#hubWaves)"/></g>`);
    // sparkles
    {
      let s = 7;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      push('<g class="hub-sparkles">');
      for (let i = 0; i < 46; i++) {
        const x = -900 + r() * 5400, y = -3800 + r() * 3600;
        if (W.isLand('sound', x, y)) continue;
        const q = P.p(x, y);
        push(`<path d="M${f1(q[0] - 7)} ${f1(q[1])}q3.5 -3.5 7 0t7 0" style="animation-delay:${(-r() * 6).toFixed(2)}s"/>`);
      }
      push('</g>');
    }
    // lanes & zones
    for (const l of G.lanes) {
      const d = pathOf(l.points, false, 50);
      if (l.kind === 'ferry') push(`<path d="${d}" class="hub-lane-ferry"/>`);
      else push(`<path d="${d}" class="hub-lane-chan"/>`);
    }
    for (const z of G.zones) {
      if (z.kind === 'swim') push(`<path d="${pathOf(z.poly, true, 30)}" class="hub-zone-swim"/>`);
      if (z.kind === 'course') { const q = P.p(z.x, z.y); push(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(z.r * P.local(z.x, z.y))}" class="hub-zone-course"/>`); }
    }
    // land: foam line, shadowed fill
    const coastD = pathOf(G.coast, true, 30);
    push(`<path d="${coastD}" class="hub-foam"/>`);
    push(`<path d="${coastD}" class="hub-foam2"/>`);
    push(`<path d="${coastD}" fill="url(#hubLand)" filter="url(#hubShadow)"/>`);
    // land cover
    for (const l of G.landmarks) {
      if (l.kind === 'park' && l.poly) push(`<path d="${pathOf(l.poly, true, 25)}" fill="url(#hubPark)" opacity=".9"/>`);
      if (l.kind === 'beach' && l.poly) push(`<path d="${pathOf(l.poly, true, 20)}" fill="#ffe6a0"/>`);
    }
    // city blocks & little parks on a jittered grid (texture for the land, denser inland)
    {
      let sd = 11;
      const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const parks = G.landmarks.filter(l => (l.kind === 'park' || l.kind === 'beach' || l.kind === 'marina') && l.poly);
      const U = W.util;
      const blocks = [];
      for (let y = -1900; y <= 760; y += 64) {
        for (let x = -1300; x <= 4400; x += 72) {
          const jx = x + (r() - 0.5) * 22, jy = y + (r() - 0.5) * 18;
          if (!W.isLand('bay', jx, jy)) continue;
          if (jx > -160 && jx < 540 && jy > -130 && jy < 110) continue; // the club & Svaneknoppen park
          if (parks.some(p => U.pointInPoly(jx, jy, p.poly))) continue;
          const sh = U.polyNearest(jx, jy, G.coast).d;
          if (sh < 38) continue;
          const roll = r();
          if (roll < 0.08) continue;
          const q = P.p(jx, jy), k = P.local(jx, jy);
          const w = Math.max(3, (40 + r() * 14) * k), h = Math.max(2.5, (30 + r() * 12) * k);
          const park = roll < 0.2;
          const col = park ? '#a9d27e' : ['#e3d4b0', '#d9c9a4', '#e8dcc0', '#d6c2a8', '#cfd3d6'][Math.floor(r() * 5)];
          blocks.push(`<rect x="${f1(q[0] - w / 2)}" y="${f1(q[1] - h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(Math.min(w, h) * 0.18)}" fill="${col}"${park ? '' : ' stroke="rgba(120,100,70,.18)" stroke-width=".6"'}/>`);
          if (park && w > 5) blocks.push(`<circle cx="${f1(q[0] - w * 0.2)}" cy="${f1(q[1])}" r="${f1(h * 0.28)}" fill="#7fb85a"/><circle cx="${f1(q[0] + w * 0.22)}" cy="${f1(q[1] - h * 0.1)}" r="${f1(h * 0.24)}" fill="#6fae4a"/>`);
        }
      }
      push('<g class="hub-city">' + blocks.join('') + '</g>');
    }
    // Nordhavn: a few extra green strips & roads for texture
    push(`<path d="${pathOf([[740, 600], [800, -100], [1000, -700], [1150, -1100]], false, 40)}" class="hub-road"/>`);
    push(`<path d="${pathOf([[-800, 900], [-700, -300], [-720, -1800]], false, 40)}" class="hub-road"/>`);
    push(`<path d="${pathOf([[1300, -1000], [2350, -500], [3600, -1080]], false, 50)}" class="hub-road"/>`);
    // buildings + trees (sorted north→south for overlap)
    const lm = G.landmarks.slice().sort((a, b) => a.y - b.y);
    for (const l of lm) {
      const q = P.p(l.x, l.y), k = P.local(l.x, l.y);
      if (l.kind === 'tree') {
        const r = Math.max(2.4, l.r * k * 1.6);
        push(`<circle cx="${f1(q[0] + r * 0.35)}" cy="${f1(q[1] + r * 0.45)}" r="${f1(r)}" fill="#3d6b2a" opacity=".35"/><circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(r)}" fill="#6fae4a"/><circle cx="${f1(q[0] - r * 0.3)}" cy="${f1(q[1] - r * 0.3)}" r="${f1(r * 0.45)}" fill="#8fcb62"/>`);
      } else if (l.w && l.h && l.kind !== 'boatpark') {
        const w = Math.max(5, l.w * k * 1.2), h = Math.max(4, l.h * k * 1.2), rot = l.rot || 0;
        const tall = l.kind === 'tower' || l.kind === 'silo' ? Math.max(6, (l.floors || 6) * 1.5) : l.kind === 'powerstation' ? 10 : Math.max(2, (l.floors || 1) * 1.4);
        let roof = l.color || '#cfc7b8', side = '#8a7f70';
        if (l.kind === 'clubhouse') { roof = '#ff7a3d'; side = '#b8481c'; }
        if (l.kind === 'powerstation') { roof = '#b5523a'; side = '#7a2f1f'; }
        if (l.kind === 'tower') side = '#7d8796';
        if (l.kind === 'silo') { roof = '#e9e4da'; side = '#8f8a80'; }
        if (l.kind === 'container') { side = '#333'; }
        push(`<g transform="translate(${f1(q[0])} ${f1(q[1])}) rotate(${rot})">` +
          `<rect x="${f1(-w / 2 + tall * 0.25)}" y="${f1(-h / 2 + tall * 0.2)}" width="${f1(w)}" height="${f1(h)}" fill="#0a2550" opacity=".16"/>` +
          `<rect x="${f1(-w / 2)}" y="${f1(-h / 2 - tall)}" width="${f1(w)}" height="${f1(h + tall)}" rx="1.2" fill="${side}"/>` +
          `<rect x="${f1(-w / 2)}" y="${f1(-h / 2 - tall)}" width="${f1(w)}" height="${f1(h)}" rx="1.2" fill="${roof}" stroke="rgba(0,0,0,.18)" stroke-width=".6"/>` +
          (l.kind === 'tower' ? `<path d="M${f1(-w / 2 + 2)} ${f1(-h / 2 - tall + 3)}h${f1(w - 4)}" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>` : '') +
          (l.kind === 'powerstation' ? `<rect x="${f1(w / 2 - 6)}" y="${f1(-h / 2 - tall - 22)}" width="4.5" height="24" fill="#a9452f"/>` : '') +
          '</g>');
        if (l.kind === 'powerstation') push(`<g class="hub-smoke" transform="translate(${f1(q[0] + w / 2 - 4)} ${f1(q[1] - h / 2 - tall - 24)})"><circle r="4"/><circle r="5" cx="4" cy="-6"/><circle r="6" cx="9" cy="-13"/></g>`);
      } else if (l.kind === 'boatpark') {
        push(`<g transform="translate(${f1(q[0])} ${f1(q[1])}) rotate(${l.rot || 0})">` + [0, 1, 2, 3].map(i => `<path d="M${-8 + i * 5} -5l2 0 0 10 -2 0z" fill="${['#fff', '#ff8a3d', '#fff', '#ffd84a'][i]}" stroke="#24364f" stroke-width=".4"/>`).join('') + '</g>');
      } else if (l.kind === 'crane') {
        push(`<g transform="translate(${f1(q[0])} ${f1(q[1])}) rotate(${l.rot})"><path d="M0 0h34" stroke="#d8473a" stroke-width="3"/><path d="M0 0h34" stroke="#fff" stroke-width="1" stroke-dasharray="3 3"/><rect x="-4" y="-4" width="8" height="8" fill="#d8473a"/></g>`);
      }
    }
    // breakwaters (rock) and piers (wood)
    for (const b of G.breakwaters) push(`<path d="${pathOf(b, true, 15)}" class="hub-rock"/>`);
    for (const p of G.piers) push(`<path d="${pathOf(p, true, 15)}" class="${p.kind === 'pontoon' || p.kind === 'gangway' ? 'hub-pontoon' : 'hub-pier'}"/>`);
    {
      const sl = G.landmarks.find(l => l.kind === 'slipway');
      if (sl) push(`<path d="${pathOf(sl.poly, true, 10)}" fill="#c9c6bd" stroke="#8b877c" stroke-width=".8"/>`);
    }
    // moored boats at berths + marina masts
    for (const b of G.berths) {
      const q = P.p(b.x, b.y), deg = b.heading * 180 / Math.PI - 90;
      const opti = b.len < 4;
      push(`<use href="#${opti ? 'hubOpti' : (b.jetty === 'C' ? 'hubRib' : 'hubSail')}" x="-8" y="-8" width="16" height="16" transform="translate(${f1(q[0])} ${f1(q[1])}) rotate(${f1(deg)}) scale(${opti ? 0.9 : 0.75})" style="--sail:${['#ff8a3d', '#fff', '#ffd84a', '#49c6f2'][b.id.charCodeAt(1) % 4]}"/>`);
    }
    {
      const r0 = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 11; j++) {
        const x = 180 + j * 26, y = 150 + i * 70 + (j % 2 ? 8 : -8);
        const q = P.p(x, y);
        push(`<rect x="${f1(q[0] - 2.4)}" y="${f1(q[1] - 1.2)}" width="4.8" height="2.4" rx="1.2" fill="${Math.abs(r0(i * 11 + j)) > 0.7 ? '#e9eef6' : '#fff'}" stroke="#4b5b72" stroke-width=".4"/>`);
      }
    }
    // buoys and lights
    for (const b of G.buoys) {
      const q = P.p(b.x, b.y);
      const lit = b.light ? ' hub-buoy-lit' : '';
      push(`<g class="hub-buoy${lit}" transform="translate(${f1(q[0])} ${f1(q[1])})" style="animation-delay:${((b.x * 7 + b.y * 3) % 3000 / 1000).toFixed(2)}s"><circle r="4.4" fill="#06264d" opacity=".25" cy="1.4"/><circle r="3.4" fill="${BUOY_COL[b.kind] || '#f80'}" stroke="#16243a" stroke-width="1"/>${b.kind.startsWith('card') ? '<path d="M-3.4 0h6.8" stroke="#16243a" stroke-width="1.6"/>' : ''}</g>`);
    }
    for (const l of G.lights) {
      const q = P.p(l.x, l.y);
      push(`<g transform="translate(${f1(q[0])} ${f1(q[1])})"><circle class="hub-lightglow" r="16" fill="url(#hubGlow)"/><circle r="3" fill="#fff" stroke="#333" stroke-width="1"/></g>`);
    }
    // race marks on the course
    {
      const c = G.zones.find(z => z.kind === 'course');
      if (c) {
        const top = P.p(c.x, c.y - 420), bot = P.p(c.x - 40, c.y + 380), bot2 = P.p(c.x + 40, c.y + 380);
        push(`<path d="M${f1(bot[0])} ${f1(bot[1])}L${f1(bot2[0])} ${f1(bot2[1])}" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3"/>`);
        for (const m of [top, bot, bot2]) push(`<g class="hub-buoy hub-buoy-lit" transform="translate(${f1(m[0])} ${f1(m[1])})"><circle r="5" fill="#06264d" opacity=".25" cy="1.5"/><path d="M-4 2.5L0 -5.5L4 2.5Z" fill="#ff7a1f" stroke="#3a1a08" stroke-width="1"/></g>`);
      }
    }
    // moving boats
    push('<g class="hub-boats">');
    const boat = (sym, pathPts, dur, opts) => {
      opts = opts || {};
      const d = opts.closed === false ? smoothPath(pathPts, false) : smoothPath(pathPts, true);
      const n = opts.n || 1;
      for (let i = 0; i < n; i++) {
        const begin = -((dur / n) * i + (opts.offset || 0));
        const sz = opts.size || 16;
        push(`<g class="hub-mover" data-kind="${opts.kind || 'boat'}" style="--sail:${(opts.sails || ['#fff'])[i % (opts.sails || ['#fff']).length]}"><use href="#${sym}" x="${-sz / 2}" y="${-sz / 2}" width="${sz}" height="${sz}"/>` +
          `<animateMotion dur="${dur}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite" rotate="auto" path="${d}"/></g>`);
      }
    };
    boat('hubOpti', loop(-320, -170, 150, 95, 14, -10), 46, { n: 5, size: 22, sails: ['#ff8a3d', '#fff', '#ffd84a', '#ff5a6a', '#49c6f2'], kind: 'opti' });
    boat('hubSail', [[-300, -900], [-120, -760], [-40, -560], [-180, -480], [-340, -560], [-380, -760]], 70, { n: 2, size: 28, sails: ['#fff', '#ffcf6a'] });
    boat('hubRib', [[64, -48], [20, -190], [180, -330], [380, -260], [300, -150], [130, -90]], 30, { size: 26, kind: 'rib' });
    boat('hubSail', [[470, 110], [560, 60], [chanX(-400) - 25, -400], [chanX(-1100) - 25, -1100], [1300, -1900], [1600, -3000], [1250, -2600], [900, -1700], [chanX(-700) + 25, -700], [chanX(-100) + 25, -100], [500, 120]], 120, { n: 2, size: 28, sails: ['#fff', '#ff8a3d'] });
    boat('hubSail', [[3750, -1580], [3600, -2000], [3750, -2420], [3900, -2000]], 60, { n: 6, size: 24, sails: ['#fff', '#ff8a3d', '#49c6f2', '#ffd84a', '#ff5a6a', '#3ee08f'], kind: 'race' });
    boat('hubSail', [[2200, -2000], [2800, -2300], [3200, -3000], [2900, -3400], [2200, -3200], [1900, -2500]], 110, { size: 30, sails: ['#fff'] });
    {
      const lane = G.lanes.find(l => l.kind === 'ferry');
      if (lane) {
        const pts = lane.points.concat(lane.points.slice(1, -1).reverse());
        push(`<g class="hub-mover" data-kind="ferry"><use href="#hubFerry" x="-36" y="-12" width="72" height="24"/><animateMotion dur="160s" begin="-30s" repeatCount="indefinite" rotate="auto" path="${smoothPath(pts, true)}"/></g>`);
      }
    }
    push(`<g class="hub-mover" data-kind="ship"><use href="#hubShip" x="-36" y="-9" width="72" height="18"/><animateMotion dur="200s" begin="-60s" repeatCount="indefinite" rotate="auto" path="${smoothPath([[4600, -500], [4300, -2000], [4100, -4300], [4400, -4300], [4650, -2000], [4800, -500]], true)}"/></g>`);
    push('</g>');
    // cloud shadows
    push('<g class="hub-clouds">');
    [[0.2, 0.3, 260, 120], [0.65, 0.15, 340, 150], [0.45, 0.7, 300, 120], [0.85, 0.55, 260, 110]].forEach((c, i) => {
      push(`<ellipse class="hub-cloud" style="animation-delay:${-i * 23}s" cx="${f1(c[0] * P.W)}" cy="${f1(c[1] * P.H)}" rx="${c[2]}" ry="${c[3]}" fill="url(#hubCloud)"/>`);
    });
    push('</g>');
    // gulls
    push('<g class="hub-gulls">');
    [[[-500, -300], [200, -700], [900, -400], [400, 0]], [[0, -1100], [700, -1300], [1100, -900], [300, -800]], [[2500, -1200], [3300, -1600], [3000, -2400], [2300, -1900]], [[-300, -600], [-100, -100], [-500, 50], [-650, -500]]].forEach((pts, i) => {
      push(`<g class="hub-gull" data-kind="gull"><use href="#hubGull" x="-13" y="-8" width="26" height="16"/><animateMotion dur="${34 + i * 9}s" begin="${-i * 7}s" repeatCount="indefinite" rotate="auto" path="${smoothPath(pts, true)}"/></g>`);
      push(`<g class="hub-gull hub-gull-b" data-kind="gull"><use href="#hubGull" x="-10" y="-6" width="20" height="12"/><animateMotion dur="${34 + i * 9}s" begin="${-i * 7 - 1.4}s" repeatCount="indefinite" rotate="auto" path="${smoothPath(pts, true)}"/></g>`);
    });
    push('</g>');
    // warm sunset glow
    push(`<rect width="${P.W}" height="${P.H}" fill="url(#hubSun)" pointer-events="none"/>`);
    // leader lines + anchor rings for pins (filled per pin)
    push('<g class="hub-anchors">');
    for (const a of AREAS) {
      const w = W.poi[a.anchor];
      const q = P.p(w.x, w.y);
      const px = q[0] + a.off[0], py = q[1] + a.off[1];
      if (a.off[0] || a.off[1]) push(`<path class="hub-leader" d="M${f1(q[0])} ${f1(q[1])}L${f1(px)} ${f1(py)}" style="--c:${a.color}"/>`);
      push(`<circle class="hub-anchor" data-area="${a.id}" cx="${f1(q[0])}" cy="${f1(q[1])}" r="6" style="--c:${a.color}"/>`);
    }
    push('</g>');
    push('</svg>');
    return out.join('');
  }
  const chanX = (y) => (KOS.World && KOS.World.chanX ? KOS.World.chanX(y) : 610 - 0.36 * y);

  // ------------------------------------------------------------------ DOM / state
  let state = null;
  let mapCache = null;

  function pinHtml(a) {
    return `<button class="hub-pin" type="button" data-area="${a.id}" style="--c:${a.color}">
      <span class="hub-pin-ring"></span>
      <span class="hub-pin-badge">${icon(a.icon)}<span class="hub-pin-lock">${icon('lock')}</span></span>
      <span class="hub-pin-new"></span>
      <span class="hub-pin-start" hidden></span>
      <span class="hub-pin-label"><b class="hub-pin-name"></b><span class="hub-pin-stars">${icon('star', 'hub-star')}<span class="hub-pin-count"></span></span></span>
    </button>`;
  }

  // place names: HTML so they stay readable at every zoom (counter-scaled like the pins)
  function labelsHtml() {
    const out = [];
    for (const l of KOS.World.global.labels) {
      if (l.kind === 'depth' || l.kind === 'club' || l.size < 12) continue;
      const q = PROJ.p(l.x, l.y);
      const size = Math.max(11, Math.min(24, Math.sqrt(l.size) * 2.7));
      out.push(`<span class="hub-label hub-label-${l.kind}" style="left:${(q[0] / PROJ.W * 100).toFixed(3)}%;top:${(q[1] / PROJ.H * 100).toFixed(3)}%;font-size:${size.toFixed(1)}px;--rot:${l.rot ? Math.max(-80, Math.min(80, l.rot)) : 0}deg">${esc(l.text)}</span>`);
    }
    return out.join('');
  }

  function topHtml() {
    return `<header class="hub-top">
      <button class="hub-me hub-glass" type="button" data-act="profile">
        <span class="hub-avatar"></span><span class="hub-lvl" aria-hidden="true">1</span>
        <span class="hub-me-txt"><b class="hub-name"></b><small class="hub-rank"></small><span class="hub-xp"><i></i></span></span>
      </button>
      <div class="hub-top-right">
        <div class="hub-stars hub-glass" role="status">${icon('star', 'hub-star')}<b class="hub-stars-have">0</b><span class="hub-stars-max"></span></div>
        <button class="hub-btn hub-glass" type="button" data-act="garage">${icon('passport')}<span class="hub-btn-txt" data-k="hub.garage"></span></button>
        <button class="hub-btn hub-glass hub-btn-icon" type="button" data-act="settings">${icon('gear')}</button>
      </div>
    </header>`;
  }

  function mount(sectionEl) {
    if (!sectionEl) sectionEl = typeof document !== 'undefined' && document.getElementById('screen-hub');
    if (!sectionEl) return;
    if (state && state.host === sectionEl && sectionEl.contains(state.root)) { refresh(); state.paused = false; return; }
    if (state) unmount();
    if (!KOS.World) { sectionEl.textContent = 'KOS.World missing'; return; }
    if (!mapCache) mapCache = buildMap();
    const rootEl = document.createElement('div');
    rootEl.className = 'hub';
    rootEl.innerHTML = `<h1 class="sr-only" data-k="hub.title"></h1><div class="hub-viewport"><div class="hub-stage" style="width:${PROJ.W}px;height:${PROJ.H}px">${mapCache}<div class="hub-labels">${labelsHtml()}</div><div class="hub-pins">${AREAS.map(pinHtml).join('')}</div></div></div>
      ${topHtml()}
      <div class="hub-zoom"><button type="button" class="hub-glass hub-places-btn" data-act="places">${icon('list')}</button><button type="button" class="hub-glass" data-act="zin">${icon('plus')}</button><button type="button" class="hub-glass" data-act="zout">${icon('minus')}</button><button type="button" class="hub-glass" data-act="home">${icon('home')}</button></div>
      <div class="hub-compass" aria-hidden="true"><svg viewBox="-30 -30 60 60"><circle r="27" fill="rgba(13,19,33,.55)" stroke="rgba(255,255,255,.25)"/><path d="M0 -24L5 0L0 4L-5 0Z" fill="#ff5a5a"/><path d="M0 24L5 0L0 -4L-5 0Z" fill="#e8eef8"/><text y="-12" text-anchor="middle" font-size="9" fill="#fff" font-weight="800" dy="-3">N</text></svg></div>
      <div class="hub-bottom"><div class="hub-next hub-glass" hidden><div class="hub-next-txt"><small data-k="hub.next"></small><b class="hub-next-title"></b></div><button type="button" class="hub-next-go" data-act="next">${icon('play')}<span data-k="hub.play"></span></button></div><div class="hub-hint" data-k="hub.hint"></div></div>`;
    sectionEl.classList.add('hub-host');
    sectionEl.innerHTML = '';
    sectionEl.appendChild(rootEl);
    const vp = rootEl.querySelector('.hub-viewport'), stage = rootEl.querySelector('.hub-stage');
    lastInv = ''; if (applyRaf) { cancelAnimationFrame(applyRaf); applyRaf = 0; }
    state = { host: sectionEl, root: rootEl, vp, stage, tx: 0, ty: 0, s: 1, min: 1, max: 4, pointers: new Map(), listeners: [], unsub: [] };
    // place pins
    for (const a of AREAS) {
      const w = KOS.World.poi[a.anchor];
      const q = PROJ.p(w.x, w.y);
      const el = rootEl.querySelector(`.hub-pin[data-area="${a.id}"]`);
      el.style.left = ((q[0] + a.off[0]) / PROJ.W * 100).toFixed(3) + '%';
      el.style.top = ((q[1] + a.off[1]) / PROJ.H * 100).toFixed(3) + '%';
    }
    const reduce = (() => { try { return (KOS.Storage && KOS.Storage.settings().reducedMotion) || root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
    if (reduce) { rootEl.classList.add('hub-reduced'); try { rootEl.querySelector('svg.hub-map').pauseAnimations(); } catch (e) { /* ignore */ } }
    else {
      // slow device: the living map (sailing boats, ferry, gulls, clouds) costs frames; if the first seconds run well
      // under 60 fps (or the game already dropped its quality level), freeze the map animations, keep the pins alive
      const lite = () => { if (!state || state.root !== rootEl) return; rootEl.classList.add('hub-lite'); try { rootEl.querySelector('svg.hub-map').pauseAnimations(); } catch (e) { /* ignore */ } };
      if (KOS.Perf && KOS.Perf.level < 2) lite();
      else {
        let n = 0, t0 = 0, raf = 0;
        const tick = (now) => {
          if (!state || state.root !== rootEl) return;
          if (!t0) t0 = now;
          n++;
          if (now - t0 < 2500) { raf = requestAnimationFrame(tick); return; }
          const avg = (now - t0) / Math.max(1, n - 1);
          if (avg > 24) { lite(); if (KOS.Perf) { KOS.Perf.level = Math.min(KOS.Perf.level, 1); KOS.Perf.max = KOS.Perf.level; } }
        };
        setTimeout(() => { raf = requestAnimationFrame(tick); }, 600); // skip the mount/entry animation
        state.listeners.push(() => cancelAnimationFrame(raf));
      }
    }

    bindInput();
    rootEl.addEventListener('click', onClick);
    const on = (ev, fn) => { if (KOS.Events && KOS.Events.on) { KOS.Events.on(ev, fn); state.unsub.push(() => KOS.Events.off && KOS.Events.off(ev, fn)); } };
    ['progress', 'lang', 'profile', 'settings', 'activities:changed', 'badge'].forEach(ev => on(ev, refresh));
    const ro = () => fit(false);
    root.addEventListener('resize', ro);
    state.listeners.push(() => root.removeEventListener('resize', ro));
    refresh();
    fit(true);
    const hint = rootEl.querySelector('.hub-hint');
    const hideHint = () => hint && hint.classList.add('is-gone');
    const ht = setTimeout(hideHint, 7000);
    vp.addEventListener('pointerdown', hideHint, { once: true });
    state.listeners.push(() => clearTimeout(ht));
    requestAnimationFrame(() => rootEl.classList.add('hub-in'));
  }

  function unmount() {
    if (!state) return;
    for (const off of state.listeners) off();
    for (const off of state.unsub) off();
    if (state.root && state.root.parentNode) state.root.parentNode.removeChild(state.root);
    if (state.host) state.host.classList.remove('hub-host');
    state = null;
  }

  function refresh() {
    if (!state) return;
    const R = state.root;
    R.querySelectorAll('[data-k]').forEach(el => { el.textContent = t(el.getAttribute('data-k')); });
    R.querySelector('[data-act="settings"]').setAttribute('aria-label', t('hub.settings'));
    R.querySelector('[data-act="garage"]').setAttribute('aria-label', t('hub.garage'));
    R.querySelector('[data-act="zin"]').setAttribute('aria-label', t('hub.zoomIn'));
    R.querySelector('[data-act="zout"]').setAttribute('aria-label', t('hub.zoomOut'));
    R.querySelector('[data-act="home"]').setAttribute('aria-label', t('hub.recenter'));
    R.querySelector('[data-act="places"]').setAttribute('aria-label', t('hub.places'));
    R.querySelector('[data-act="places"]').setAttribute('title', t('hub.places'));
    // profile
    let prof = null;
    try { prof = KOS.Storage && KOS.Storage.profile(); } catch (e) { /* ignore */ }
    const name = (prof && prof.name) || t('hub.sailor');
    R.querySelector('.hub-name').textContent = name;
    R.querySelector('[data-act="profile"]').setAttribute('aria-label', t('hub.profile') + ': ' + name);
    const av = R.querySelector('.hub-avatar');
    let avHtml = '';
    try { if (KOS.Sprites && KOS.Sprites.avatar && prof) avHtml = KOS.Sprites.avatar(prof) || ''; } catch (e) { avHtml = ''; }
    if (typeof avHtml !== 'string' || avHtml.indexOf('<') < 0) {
      const jacket = (prof && prof.avatar && prof.avatar.jacket) || '#ff7a3d';
      avHtml = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#2a3b5c"/><path d="M6 40c1-9 7-13 14-13s13 4 14 13z" fill="${esc(jacket)}"/><circle cx="20" cy="17" r="8" fill="#f2c7a0"/><path d="M12 15c0-6 4-9 8-9s8 3 8 9c-3-2-6-3-8-3s-5 1-8 3z" fill="#5a3a22"/><text x="20" y="38" text-anchor="middle" font-size="7" font-weight="900" fill="#fff">${esc(name.charAt(0).toUpperCase())}</text></svg>`;
    }
    av.innerHTML = avHtml;
    // xp / rank
    let xp = 0; try { xp = KOS.Storage ? KOS.Storage.xp() : 0; } catch (e) { /* ignore */ }
    // same ranks as the Sejlerpas (KOS.App.rankOf); fallback: 500 XP per level
    const rk = KOS.App && KOS.App.rankOf ? KOS.App.rankOf(xp) : { level: Math.floor(xp / 500) + 1, key: null, frac: (xp % 500) / 500, toNext: 500 - xp % 500 };
    const rank = rk.key ? t(rk.key) : t('hub.rank.' + Math.min(7, rk.level - 1));
    R.querySelector('.hub-rank').textContent = t('hub.level', { n: rk.level }) + ' · ' + rank;
    R.querySelector('.hub-xp i').style.width = (Math.max(0, Math.min(1, rk.frac)) * 100).toFixed(1) + '%';
    R.querySelector('.hub-lvl').textContent = rk.level;
    R.querySelector('.hub-xp').setAttribute('title', xp + ' XP' + (rk.toNext ? ' · ' + t('hub.toNext', { n: rk.toNext }) : ''));
    // stars
    const have = totalStars();
    let max = 0; try { max = KOS.Activities ? KOS.Activities.maxStars() : 0; } catch (e) { /* ignore */ }
    R.querySelector('.hub-stars-have').textContent = have;
    R.querySelector('.hub-stars-max').textContent = max ? '/' + max : '';
    R.querySelector('.hub-stars').setAttribute('aria-label', t('hub.totalStars') + ': ' + have);
    // pins
    const next = nextActivity();
    for (const a of AREAS) {
      const el = R.querySelector(`.hub-pin[data-area="${a.id}"]`);
      const st = areaStars(a.id), need = areaLockStars(a.id), locked = need > 0;
      el.querySelector('.hub-pin-name').textContent = t('hub.loc.' + a.id);
      const cnt = el.querySelector('.hub-pin-count');
      el.querySelector('.hub-pin-stars .hub-star').style.display = locked ? 'none' : '';
      if (locked) cnt.textContent = t('hub.needStars', { n: a.minStars });
      else if (st.count) cnt.textContent = t('hub.stars', st);
      else cnt.textContent = t('hub.sub.' + a.id);
      el.classList.toggle('is-locked', locked);
      el.classList.toggle('is-empty', !locked && !st.count);
      el.classList.toggle('is-done', !locked && st.count > 0 && st.have >= st.max);
      el.classList.toggle('is-next', !!(next && next.area === a.id));
      const isNew = !locked && areaHasNew(a.id);
      const nb = el.querySelector('.hub-pin-new');
      nb.textContent = isNew ? t('hub.new') : '';
      nb.hidden = !isNew;
      // first-timers: the sailing school is where to begin until the first lesson is done
      const sp = el.querySelector('.hub-pin-start');
      const startHere = a.id === 'school' && !locked && !firstLessonDone();
      sp.textContent = startHere ? t('hub.startHere') : '';
      sp.hidden = !startHere;
      el.classList.toggle('is-start', startHere);
      if (startHere) { nb.hidden = true; nb.textContent = ''; }
      el.setAttribute('aria-label', t('hub.loc.' + a.id) + (locked ? ' — ' + t('hub.locked') : st.count ? ' — ' + st.have + '/' + st.max + ' ★' : ''));
    }
    // next card
    const card = R.querySelector('.hub-next');
    if (next) {
      card.hidden = false;
      card.querySelector('.hub-next-title').textContent = (KOS.tt ? KOS.tt(next.title) : (next.title && (next.title.da || next.title.en))) || next.id;
      card.dataset.id = next.id;
    } else card.hidden = true;
  }

  // ------------------------------------------------------------------ pan / zoom
  // one style write per frame (pointermove can fire at 120+ Hz on phones); --inv only changes on zoom, and
  // rewriting it restyles every pin, which made the map flash while dragging on mobile
  let applyRaf = 0, lastInv = '';
  function applySoon() {
    if (applyRaf) return;
    applyRaf = requestAnimationFrame(() => { applyRaf = 0; apply(); });
  }
  function apply() {
    const s = state;
    if (!s || !s.stage) return;
    s.stage.style.transform = `translate3d(${s.tx.toFixed(1)}px, ${s.ty.toFixed(1)}px, 0) scale(${s.s.toFixed(4)})`;
    const inv = (1 / s.s).toFixed(3);
    if (inv !== lastInv) { lastInv = inv; s.stage.style.setProperty('--inv', inv); }
  }
  function clamp() {
    const s = state, vw = s.vp.clientWidth, vh = s.vp.clientHeight;
    s.s = Math.max(s.min, Math.min(s.max, s.s));
    const w = PROJ.W * s.s, h = PROJ.H * s.s;
    // keep a little room under the top bar
    const topPad = 0, botPad = 0;
    s.tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, s.tx));
    s.ty = h <= vh ? (vh - h) / 2 : Math.min(topPad, Math.max(vh - h - botPad, s.ty));
  }
  function centerOn(wx, wy, scale, mapCoords) {
    const s = state, vw = s.vp.clientWidth, vh = s.vp.clientHeight;
    const q = mapCoords ? [wx, wy] : PROJ.p(wx, wy);
    if (scale) s.s = scale;
    s.tx = vw / 2 - q[0] * s.s;
    s.ty = vh * 0.5 - q[1] * s.s;
    clamp(); apply();
  }
  function fit(initial) {
    if (!state) return;
    const s = state, vw = s.vp.clientWidth || root.innerWidth, vh = s.vp.clientHeight || root.innerHeight;
    const cover = Math.max(vw / PROJ.W, vh / PROJ.H);
    const old = s.min;
    s.min = cover;
    s.max = Math.max(cover * 3.2, 1.6);
    if (initial) {
      // phones: zoom so the bay + channel fill the screen; desktop: show (nearly) the whole map
      // map-px framing: portrait shows the bay + club, landscape shows bay → Sound
      const portrait = vh > vw * 1.1;
      const club = PROJ.p(KOS.World.poi.club.x, KOS.World.poi.club.y), race = PROJ.p(KOS.World.poi.race.x, KOS.World.poi.race.y), bay = PROJ.p(-600, -700);
      const school = PROJ.p(KOS.World.poi.school.x, KOS.World.poi.school.y), bayPin = PROJ.p(KOS.World.poi.bay.x, KOS.World.poi.bay.y);
      const nav = PROJ.p(KOS.World.poi.nav.x, KOS.World.poi.nav.y);
      if (portrait) {
        const x0 = school[0] - 125, x1 = vw >= 600 ? nav[0] + 150 : club[0] + 250;
        const sc = Math.max(cover, vw / (x1 - x0));
        centerOn((x0 + x1) / 2, (bayPin[1] + club[1]) / 2 + 40 + 70 / sc, sc, true); // + keeps the club pin clear of the bottom card
      } else {
        const x0 = bay[0] - 40, x1 = race[0] + 140, y0 = race[1] - 70, y1 = club[1] + 210; // room for the top bar and the bottom card
        const sc = Math.max(cover, Math.min(vw / (x1 - x0), (vh - 70) / (y1 - y0)));
        centerOn((x0 + x1) / 2, (y0 + y1) / 2 - 35 / sc, sc, true);
      }
      // keep the place pins clear of the top bar and the bottom card. The free area comes from the real element rects,
      // then the shift that shows the most pins (and surely the suggested one, "Næste udfordring") wins.
      {
        const vr = s.vp.getBoundingClientRect();
        const top = vr.top + 8, bot = vr.bottom - 8, left = vr.left + 8, right = vr.right - 8;
        const R_ = s.root;
        // everything the pins must stay clear of: top bar cards, the next-challenge card, zoom buttons, compass
        const obst = [];
        R_.querySelectorAll('.hub-top .hub-glass, .hub-next, .hub-zoom button, .hub-compass').forEach(el => {
          if (el.hidden) return;
          const r = el.getBoundingClientRect();
          if (r.width && r.height) obst.push({ l: r.left - 4, r: r.right + 4, t: r.top - 4, b: r.bottom + 4 });
        });
        const pins = Array.from(R_.querySelectorAll('.hub-pin'));
        const rects = pins.map(el => el.getBoundingClientRect());
        const nextEl = R_.querySelector('.hub-pin.is-next');
        const nextI = nextEl ? pins.indexOf(nextEl) : -1;
        const vw_ = s.vp.clientWidth, vh_ = s.vp.clientHeight, w_ = PROJ.W * s.s, h_ = PROJ.H * s.s;
        const loX = w_ <= vw_ ? s.tx : vw_ - w_, hiX = w_ <= vw_ ? s.tx : 0, loY = h_ <= vh_ ? s.ty : vh_ - h_, hiY = h_ <= vh_ ? s.ty : 0;
        let best = null;
        for (let dy = -320; dy <= 320; dy += 8) for (let dx = -320; dx <= 320; dx += 8) {
          const ax = Math.max(loX, Math.min(hiX, s.tx + dx)) - s.tx, ay = Math.max(loY, Math.min(hiY, s.ty + dy)) - s.ty;
          let n = 0, nextIn = false;
          rects.forEach((r, i) => {
            const L_ = r.left + ax, R2 = r.right + ax, T_ = r.top + ay, B_ = r.bottom + ay;
            const inside = L_ >= left && R2 <= right && T_ >= top && B_ <= bot && !obst.some(o => L_ < o.r && R2 > o.l && T_ < o.b && B_ > o.t);
            if (inside) { n++; if (i === nextI) nextIn = true; }
          });
          const score = n * 100 + (nextIn ? 150 : 0) - (Math.abs(ax) + Math.abs(ay)) * 0.05;
          if (!best || score > best.score) best = { score, ax, ay };
        }
        if (best && (best.ax || best.ay)) { s.tx += best.ax; s.ty += best.ay; clamp(); apply(); }
      }
    } else {
      s.s = s.s * (cover / (old || cover));
      clamp(); apply();
    }
  }
  function zoomAt(f, cx, cy) {
    const s = state;
    const ns = Math.max(s.min, Math.min(s.max, s.s * f));
    const k = ns / s.s;
    s.tx = cx - (cx - s.tx) * k;
    s.ty = cy - (cy - s.ty) * k;
    s.s = ns;
    clamp(); apply();
  }
  function bindInput() {
    const s = state, vp = s.vp;
    let drag = null, pinch = null, moved = 0;
    const local = (e) => { const r = vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e) => {
      if (e.button !== undefined && e.button > 0) return;
      s.pointers.set(e.pointerId, local(e));
      if (s.pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, tx: s.tx, ty: s.ty }; moved = 0; }
      else if (s.pointers.size === 2) {
        const p = Array.from(s.pointers.values());
        pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), s: s.s, tx: s.tx, ty: s.ty, cx: (p[0][0] + p[1][0]) / 2, cy: (p[0][1] + p[1][1]) / 2 };
        drag = null;
      }
    };
    const move = (e) => {
      if (!s.pointers.has(e.pointerId)) return;
      s.pointers.set(e.pointerId, local(e));
      if (pinch && s.pointers.size >= 2) {
        const p = Array.from(s.pointers.values());
        const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        const cx = (p[0][0] + p[1][0]) / 2, cy = (p[0][1] + p[1][1]) / 2;
        const ns = Math.max(s.min, Math.min(s.max, pinch.s * d / (pinch.d || 1)));
        const k = ns / pinch.s;
        s.s = ns;
        s.tx = cx - (pinch.cx - pinch.tx) * k;
        s.ty = cy - (pinch.cy - pinch.ty) * k;
        moved = 99;
        clamp(); applySoon();
      } else if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        moved = Math.max(moved, Math.hypot(dx, dy));
        if (moved > 6) {
          vp.classList.add('is-dragging');
          s.tx = drag.tx + dx; s.ty = drag.ty + dy;
          clamp(); applySoon();
        }
      }
    };
    const up = (e) => {
      s.pointers.delete(e.pointerId);
      if (s.pointers.size < 2) pinch = null;
      if (s.pointers.size === 0) { drag = null; vp.classList.remove('is-dragging'); if (moved > 6) s.dragEndT = performance.now(); moved = 0; }
      else if (s.pointers.size === 1) { const p = Array.from(s.pointers.values())[0]; const r = vp.getBoundingClientRect(); drag = { x: p[0] + r.left, y: p[1] + r.top, tx: s.tx, ty: s.ty }; }
    };
    const wheel = (e) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p[0], p[1]);
    };
    const key = (e) => {
      if (!state || state.host.hidden) return;
      const st = 60;
      if (e.key === '+' || e.key === '=') zoomAt(1.25, vp.clientWidth / 2, vp.clientHeight / 2);
      else if (e.key === '-') zoomAt(0.8, vp.clientWidth / 2, vp.clientHeight / 2);
      else if (e.key === 'ArrowLeft') { s.tx += st; clamp(); apply(); }
      else if (e.key === 'ArrowRight') { s.tx -= st; clamp(); apply(); }
      else if (e.key === 'ArrowUp') { s.ty += st; clamp(); apply(); }
      else if (e.key === 'ArrowDown') { s.ty -= st; clamp(); apply(); }
      else return;
      e.preventDefault();
    };
    vp.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    vp.addEventListener('wheel', wheel, { passive: false });
    root.addEventListener('keydown', key);
    s.listeners.push(() => {
      vp.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      vp.removeEventListener('wheel', wheel);
      root.removeEventListener('keydown', key);
    });
  }

  // ------------------------------------------------------------------ clicks
  function sfx(name, o) { try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(name, o); } catch (e) { /* ignore */ } }
  function go(screen, params) {
    if (KOS.App && KOS.App.show) KOS.App.show(screen, params);
    else if (KOS.Events && KOS.Events.emit) KOS.Events.emit('hub:navigate', { screen, params });
  }
  // the list of all places: always reachable, even when a pin is panned off screen
  function togglePlaces(open) {
    if (!state) return;
    let box = state.root.querySelector('.hub-places');
    if (!open) { if (box) box.remove(); return; }
    if (box) return;
    const next = nextActivity();
    box = document.createElement('div');
    box.className = 'hub-places';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('hub.placesTitle'));
    box.innerHTML = `<div class="hub-places-in hub-glass"><h2>${esc(t('hub.placesTitle'))}</h2><div class="hub-places-grid">` +
      AREAS.map(a => {
        const need = areaLockStars(a.id), st = areaStars(a.id);
        const sub = need > 0 ? t('hub.needStars', { n: a.minStars }) : st.count ? t('hub.stars', st) + ' ★' : t('hub.sub.' + a.id);
        return `<button type="button" class="hub-place${need > 0 ? ' is-locked' : ''}${next && next.area === a.id ? ' is-next' : ''}" data-area="${a.id}" style="--c:${a.color}"><span class="hub-place-badge">${icon(need > 0 ? 'lock' : a.icon)}</span><span class="hub-place-txt"><b>${esc(t('hub.loc.' + a.id))}</b><small>${esc(sub)}</small></span></button>`;
      }).join('') +
      `</div><button type="button" class="hub-places-close" data-act="places-close">${esc(t('hub.close'))}</button></div>`;
    state.root.appendChild(box);
    const first = box.querySelector('.hub-place.is-next') || box.querySelector('.hub-place');
    if (first && first.focus) first.focus();
  }
  function openArea(id, pin) {
    const need = areaLockStars(id);
    if (need > 0) {
      sfx('bump');
      if (pin) { pin.classList.remove('shake'); void pin.offsetWidth; pin.classList.add('shake'); }
      const msg = t('hub.lockedToast', { n: need, name: t('hub.loc.' + id) });
      if (KOS.UI && KOS.UI.toast) KOS.UI.toast(msg, { kind: 'info' });
      return;
    }
    sfx('tap');
    if (pin) pin.classList.add('is-pressed');
    setTimeout(() => { if (pin) pin.classList.remove('is-pressed'); go('area', { area: id }); }, 140);
  }
  function onClick(e) {
    if (!state) return;
    // swallow the click that ends a map drag
    if (state.dragEndT && performance.now() - state.dragEndT < 250 && state.vp.contains(e.target)) { state.dragEndT = 0; return; }
    const actEl = e.target.closest('[data-act]');
    if (actEl) {
      const act = actEl.getAttribute('data-act');
      const vp = state.vp;
      sfx('click');
      if (act === 'zin') zoomAt(1.35, vp.clientWidth / 2, vp.clientHeight / 2);
      else if (act === 'zout') zoomAt(1 / 1.35, vp.clientWidth / 2, vp.clientHeight / 2);
      else if (act === 'home') { state.stage.classList.add('is-easing'); centerOn(KOS.World.poi.club.x, KOS.World.poi.club.y - 200, Math.min(state.max, state.min * 1.8)); setTimeout(() => state && state.stage.classList.remove('is-easing'), 450); }
      else if (act === 'next') { const id = actEl.closest('.hub-next').dataset.id; if (id && KOS.App && KOS.App.play) KOS.App.play(id); else if (id) go('area', { area: KOS.Activities.get(id).area }); }
      else if (act === 'places') togglePlaces(true);
      else if (act === 'places-close') togglePlaces(false);
      else go(act);
      return;
    }
    const row = e.target.closest('.hub-place');
    if (row) { togglePlaces(false); openArea(row.getAttribute('data-area'), state.root.querySelector(`.hub-pin[data-area="${row.getAttribute('data-area')}"]`)); return; }
    if (e.target.classList && e.target.classList.contains('hub-places')) { togglePlaces(false); return; }
    const pin = e.target.closest('.hub-pin');
    if (pin) { openArea(pin.getAttribute('data-area'), pin); return; }
    const mover = e.target.closest('.hub-gull, .hub-mover');
    if (mover) {
      const kind = mover.getAttribute('data-kind');
      if (kind === 'gull') { sfx('gull', { pitch: 0.9 + Math.random() * 0.3 }); mover.classList.add('flee'); setTimeout(() => mover.classList.remove('flee'), 1600); }
      else if (kind === 'ferry' || kind === 'ship') sfx('hornLong');
      else if (kind === 'rib') sfx('hornShort');
      else sfx('whistle');
      mover.classList.remove('boing'); void mover.getBBox; mover.classList.add('boing');
      setTimeout(() => mover.classList.remove('boing'), 600);
    }
  }

  KOS.Hub = {
    mount, unmount, refresh,
    areas: AREAS.map(a => ({ id: a.id, icon: a.icon, color: a.color, minStars: a.minStars, anchor: KOS.World ? KOS.World.poi[a.anchor] : null })),
    isAreaUnlocked, areaLockStars,
    iconSvg: icon,
    get mounted() { return !!state; },
    _project: (x, y) => { PROJ = PROJ || makeProj(); return PROJ.p(x, y); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
