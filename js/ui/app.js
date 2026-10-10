// KØS SEJL — js/ui/app.js
// KOS.App: screens, router, fixed-step game loop, settings, profile, Sejlerpas (garage), results, credits, PWA.
// Screens are the <section id="screen-*"> elements in index.html. See SPEC.md.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const doc = root.document;
  const t = (k, v) => KOS.t(k, v);
  const tt = (o, v) => KOS.tt(o, v);
  const UI = () => KOS.UI;
  const ico = (n, c) => KOS.UI.iconSvg(n, c);
  const esc = s => KOS.UI.esc(s);
  const S = () => KOS.Storage;
  function finePointer() { try { return !!(root.matchMedia && root.matchMedia('(hover:hover) and (pointer:fine)').matches); } catch (e) { return true; } }

  function sfx(name, opts) { try { if (KOS.Audio && KOS.Audio.play) KOS.Audio.play(name, opts); } catch (e) { /* optional */ } }
  function audio(fn) { try { if (KOS.Audio && typeof KOS.Audio[fn] === 'function') return KOS.Audio[fn].apply(KOS.Audio, [].slice.call(arguments, 1)); } catch (e) { /* optional */ } }
  function track(c, a, n, v) { try { if (KOS.Track) KOS.Track.event(c, a, n, v); } catch (e) { /* analytics never breaks the game */ } }
  function on(name, fn) { if (KOS.Events && KOS.Events.on) KOS.Events.on(name, fn); }
  function emit(name, p) { if (KOS.Events && KOS.Events.emit) KOS.Events.emit(name, p); }

  // ------------------------------------------------------------------ boats (fallback if KOS.Boats is missing)
  const BOAT_STARS = { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90, rib: 20 };
  const BOAT_FALLBACK = [
    { id: 'opti', name: 'Optimist', crew: 1, length: 2.3, colors: { hull: '#ffffff', deck: '#e9eef5', sail: '#f7f7f2' } },
    { id: 'tera', name: 'RS Tera', crew: 1, length: 2.87, colors: { hull: '#ffffff', deck: '#dfe8ef', sail: '#f2f2f2' } },
    { id: 'feva', name: 'RS Feva', crew: 2, length: 3.64, colors: { hull: '#e8323c', deck: '#f2f2f2', sail: '#ffffff' } },
    { id: 'zest', name: 'RS Zest', crew: 2, length: 3.5, colors: { hull: '#49c6f2', deck: '#f2f2f2', sail: '#ffffff' } },
    { id: 'ilca', name: 'ILCA', crew: 1, length: 4.23, colors: { hull: '#ffffff', deck: '#e8eef5', sail: '#f5f5f5' } },
    { id: '29er', name: '29er', crew: 2, length: 4.45, colors: { hull: '#1d2433', deck: '#ffffff', sail: '#f0f0f0' } },
    { id: 'hboat', name: 'H-båd', crew: 3, length: 8.28, colors: { hull: '#2b6cb0', deck: '#e9dcc0', sail: '#ffffff' } },
    { id: 'j70', name: 'J/70', crew: 4, length: 6.93, colors: { hull: '#ffffff', deck: '#f0f0f0', sail: '#2a2f3a' } },
    { id: 'rib', name: 'RIB', crew: 2, length: 5.2, colors: { hull: '#ff7a1a', deck: '#1d2433', sail: '#ff7a1a' } },
  ];
  function boatList() {
    if (KOS.Boats && Array.isArray(KOS.Boats.list) && KOS.Boats.list.length) return KOS.Boats.list;
    return BOAT_FALLBACK;
  }
  function boatGet(id) {
    if (KOS.Boats && KOS.Boats.get) { const b = KOS.Boats.get(id); if (b) return b; }
    return BOAT_FALLBACK.find(b => b.id === id) || null;
  }
  function boatUnlocked(id) {
    if (S().settings().unlockAll) return true;
    return S().totalStars() >= (BOAT_STARS[id] || 0);
  }
  function boatPlaceholder(b) {
    const c = (b && b.colors) || {};
    const hull = c.hull || '#ffffff', sail = c.sail || '#f5f5f5';
    if (b && b.id === 'rib') {
      return '<svg class="boat-ph" viewBox="0 0 200 120" aria-hidden="true"><path d="M20 78h150c14 0 22 8 22 16s-8 14-22 14H40c-14 0-24-10-20-30z" fill="#ff7a1a" stroke="#1d2433" stroke-width="3"/>' +
        '<path d="M24 96h168" stroke="#1d2433" stroke-width="6"/><rect x="90" y="52" width="34" height="26" rx="4" fill="#ff8f3a" stroke="#1d2433" stroke-width="3"/>' +
        '<path d="M98 52l6-14h18" stroke="#c9ced8" stroke-width="3" fill="none"/><rect x="2" y="66" width="20" height="40" rx="5" fill="#1d2433"/>' +
        '<rect x="140" y="84" width="30" height="14" rx="5" fill="#1d2433"/><text x="155" y="94.5" font-size="10" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">KØS</text></svg>';
    }
    const two = b && b.crew >= 2;
    return '<svg class="boat-ph" viewBox="0 0 200 120" aria-hidden="true">' +
      '<path d="M96 8v86" stroke="#c9ced8" stroke-width="3"/>' +
      '<path d="M98 10c26 22 44 50 50 78H98z" fill="' + sail + '" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>' +
      (two ? '<path d="M93 18L58 88h35z" fill="' + sail + '" stroke="rgba(0,0,0,.25)" stroke-width="1.5" opacity=".95"/>' : '') +
      '<path d="M96 88h58" stroke="#8a93a6" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M30 92h150c-6 12-18 18-34 18H58c-14 0-24-6-28-18z" fill="' + hull + '" stroke="rgba(0,0,0,.35)" stroke-width="2"/>' +
      '<path d="M34 97h142" stroke="rgba(0,0,0,.18)" stroke-width="2"/></svg>';
  }
  function boatCardSvg(id) {
    try {
      if (KOS.Sprites && typeof KOS.Sprites.boatCard === 'function') {
        const s = KOS.Sprites.boatCard(id);
        if (s && typeof s === 'string') return s;
      }
    } catch (e) { /* fall back */ }
    return boatPlaceholder(boatGet(id));
  }

  // ------------------------------------------------------------------ ranks / XP
  const RANKS = [0, 300, 800, 1600, 3000, 5000, 8000, 12000];
  function rankOf(xp) {
    let i = 0;
    while (i < RANKS.length - 1 && xp >= RANKS[i + 1]) i++;
    const lo = RANKS[i], hi = RANKS[i + 1];
    return { level: i + 1, key: 'app.rank.' + i, frac: hi ? (xp - lo) / (hi - lo) : 1, toNext: hi ? hi - xp : 0 };
  }

  // ------------------------------------------------------------------ badges ("mærker")
  const BADGES = [
    { id: 'first-sail', icon: 'sail', name: { da: 'Første tur', en: 'First trip' }, desc: { da: 'Gennemfør din første aktivitet.', en: 'Finish your first activity.' } },
    { id: 'three-stars', icon: 'star', name: { da: 'Tre stjerner', en: 'Three stars' }, desc: { da: 'Få tre stjerner i en aktivitet.', en: 'Get three stars in an activity.' } },
    { id: 'ten-tacks', icon: 'tack', name: { da: 'Vendekongen', en: 'Tack master' }, desc: { da: 'Lav 10 vendinger på én tur.', en: 'Do 10 tacks in one trip.' } },
    { id: 'first-race-win', icon: 'trophy', name: { da: 'Første sejr', en: 'First win' }, desc: { da: 'Vind din første kapsejlads.', en: 'Win your first race.' } },
    { id: 'capsize-recovery', icon: 'life', name: { da: 'Op igen!', en: 'Back up!' }, desc: { da: 'Rejs en kæntret jolle.', en: 'Right a capsized dinghy.' } },
    { id: 'all-knots', icon: 'knot', name: { da: 'Knobmester', en: 'Knot master' }, desc: { da: 'Slå alle knobene.', en: 'Tie all the knots.' } },
    { id: 'perfect-docking', icon: 'anchor', name: { da: 'Blødt anløb', en: 'Soft landing' }, desc: { da: 'Læg perfekt til ved broen.', en: 'Dock perfectly at the pier.' } },
    { id: 'rules-master', icon: 'rules', name: { da: 'Regelekspert', en: 'Rules master' }, desc: { da: 'Klar alle vigeregel-opgaver.', en: 'Clear every right-of-way task.' } },
    { id: 'navigator', icon: 'compass', name: { da: 'Navigatør', en: 'Navigator' }, desc: { da: 'Sejl hele sejlrenden uden at gå på grund.', en: 'Sail the whole channel without grounding.' } },
    { id: 'rib-driver', icon: 'rib', name: { da: 'RIB-kører', en: 'RIB driver' }, desc: { da: 'Klar din første RIB-mission.', en: 'Complete your first RIB mission.' } },
    { id: 'school-grad', icon: 'school', name: { da: 'Sejlerskole-diplom', en: 'Sailing school diploma' }, desc: { da: 'Klar alle grundlektionerne i Sejlerskolen – helt til trekantbanen.', en: 'Finish every basic Sailing School lesson – all the way to the triangle.' } },
    { id: 'podium', icon: 'place', name: { da: 'På podiet', en: 'On the podium' }, desc: { da: 'Bliv nummer 1, 2 eller 3 i en kapsejlads.', en: 'Finish 1st, 2nd or 3rd in a race.' } },
    { id: 'race-five', icon: 'flag', name: { da: 'Kapsejler', en: 'Racer' }, desc: { da: 'Gennemfør 5 kapsejladser.', en: 'Finish 5 races.' } },
    { id: 'rigger', icon: 'wrench', name: { da: 'Riggemester', en: 'Master rigger' }, desc: { da: 'Rig tre forskellige både til.', en: 'Rig three different boats.' } },
    { id: 'quiz-whiz', icon: 'quiz', name: { da: 'Quizhaj', en: 'Quiz whiz' }, desc: { da: 'Få tre stjerner i en quiz.', en: 'Get three stars in a quiz.' } },
    { id: 'night-sailor', icon: 'buoy', name: { da: 'Natsejler', en: 'Night sailor' }, desc: { da: 'Find vej efter fyrlysene om natten.', en: 'Find your way by the lights at night.' } },
    { id: 'rescuer', icon: 'whistle', name: { da: 'Redder', en: 'Rescuer' }, desc: { da: 'Red en kæntret sejler med RIB’en.', en: 'Rescue a capsized sailor with the RIB.' } },
    { id: 'clean-sea', icon: 'heart', name: { da: 'Ren havn', en: 'Clean harbour' }, desc: { da: 'Saml affald op i Svanemøllebugten.', en: 'Clean up rubbish in Svanemøllebugten.' } },
    { id: 'explorer', icon: 'map', name: { da: 'Opdagelsesrejsende', en: 'Explorer' }, desc: { da: 'Prøv en aktivitet alle otte steder på kortet.', en: 'Try an activity in all eight places on the map.' } },
    { id: 'stars-30', icon: 'sparkle', name: { da: 'Stjernesamler', en: 'Star collector' }, desc: { da: 'Saml 30 stjerner.', en: 'Collect 30 stars.' } },
    { id: 'stars-100', icon: 'medal', name: { da: 'Stjernekaptajn', en: 'Star captain' }, desc: { da: 'Saml 100 stjerner.', en: 'Collect 100 stars.' } },
    { id: 'pro-sailor', icon: 'shield', name: { da: 'Pro-sejler', en: 'Pro sailor' }, desc: { da: 'Få tre stjerner på hjælpeniveau Pro.', en: 'Get three stars on the Pro assist level.' } },
    { id: 'skiff-pilot', icon: 'speed', name: { da: 'Skiffpilot', en: 'Skiff pilot' }, desc: { da: 'Gennemfør en aktivitet i 29’eren.', en: 'Finish an activity in the 29er.' } },
    { id: 'keelboat', icon: 'anchor', name: { da: 'Kølbådsskipper', en: 'Keelboat skipper' }, desc: { da: 'Gennemfør en aktivitet i H-båden eller J/70’eren.', en: 'Finish an activity in the H-boat or the J/70.' } },
    { id: 'boat-ladder', icon: 'boat', name: { da: 'Hele bådstigen', en: 'The whole ladder' }, desc: { da: 'Lås alle klubbens både op i Sejlerpasset.', en: 'Unlock all the club’s boats in the Sailing Passport.' } },
    { id: 'soslag', icon: 'drop', name: { da: 'Søslagsmester', en: 'Water-fight champion' }, desc: { da: 'Vind et søslag i bugten.', en: 'Win a water fight in the bay.' } },
  ];
  // milestone badges, checked after every finished activity (modes may also award their own via KOS.Storage.award)
  function evalBadges(a, result) {
    const all = S()._allProgress();
    const done = id => !!(all[id] && all[id].done);
    const ok = result.success !== false && (+result.stars || 0) > 0;
    const st = +result.stars || 0;
    const stats = result.stats || {};
    const ids = [];
    const give = (id, cond) => { if (cond) ids.push(id); };
    give('first-sail', ok);
    give('three-stars', st >= 3);
    give('ten-tacks', +stats.tacks >= 10);
    if (a.mode === 'race' && ok) {
      const place = result.msgVars && +result.msgVars.place;
      give('first-race-win', place === 1);
      give('podium', place > 0 && place <= 3);
      give('race-five', Object.keys(all).filter(k => k.indexOf('race.') === 0 && all[k].done).length >= 5);
    }
    give('soslag', a.mode === 'soslag' && ok && st >= 2);
    give('navigator', a.id === 'nav.channel' && ok && Object.keys(stats).some(k => /ground$/.test(k) && +stats[k] === 0));
    give('night-sailor', a.id === 'nav.night' && ok);
    give('rib-driver', a.area === 'rib' && ok);
    give('rescuer', a.id === 'rib.rescue' && ok);
    give('clean-sea', a.id === 'sail.cleanup' && ok);
    give('quiz-whiz', a.mode === 'quiz' && st >= 3);
    give('capsize-recovery', a.mode === 'capsize' && ok);
    give('rigger', Object.keys(all).filter(k => /^rigging\.(?!unrig)/.test(k) && all[k].done).length >= 3);
    give('school-grad', KOS.Activities.byArea('school').filter(x => !x.boat).every(x => done(x.id)));
    give('rules-master', KOS.Activities.byArea('rules').every(x => done(x.id)));
    give('all-knots', KOS.Activities.list({ mode: 'knots' }).filter(x => x.id !== 'knots.speed').every(x => done(x.id)));
    give('explorer', KOS.Activities.areas().every(ar => KOS.Activities.byArea(ar).some(x => all[x.id] && all[x.id].plays > 0)));
    const total = S().totalStars();
    give('stars-30', total >= 30);
    give('stars-100', total >= 100);
    give('pro-sailor', st >= 3 && settings().assist === 'pro');
    const boat = a.boat || (run.host && run.host.boat);
    give('skiff-pilot', ok && boat === '29er');
    give('keelboat', ok && (boat === 'hboat' || boat === 'j70'));
    give('boat-ladder', total >= Math.max.apply(null, Object.keys(BOAT_STARS).map(k => BOAT_STARS[k])));
    return ids.filter(id => S().award(id));
  }
  function addBadges(defs) { (Array.isArray(defs) ? defs : [defs]).forEach(d => { const i = BADGES.findIndex(b => b.id === d.id); if (i >= 0) BADGES[i] = d; else BADGES.push(d); }); }

  // ------------------------------------------------------------------ "what should I do next?"
  // A beginner path that mixes the sailing school with the clubhouse, harbour, rules and the first races, so a new
  // 8-year-old always gets one clear next step. After the path: the easiest unlocked activity not yet done, then the
  // easiest one that still has stars to win.
  const PATH = [
    'school.steer', 'school.beam', 'rigging.opti', 'school.beat', 'knots.eight', 'school.tack', 'capsize.opti',
    'school.downwind', 'dock.opti.jetty', 'rowschool.r10', 'school.gybe', 'quiz.basics', 'sail.rings', 'school.irons',
    'race.opti.1', 'nav.buoys', 'school.trim', 'knots.bowline', 'rowschool.r11', 'dock.opti.leave', 'school.hike',
    'sail.cleanup', 'race.opti.2', 'school.mob', 'nav.channel', 'rowschool.r13', 'school.eight', 'race.opti.3',
    'school.triangle', 'rigging.unrig.opti', 'quiz.rules',
  ];
  function areaOpen(area) { try { return !KOS.Hub || !KOS.Hub.isAreaUnlocked || KOS.Hub.isAreaUnlocked(area); } catch (e) { return true; } }
  function suggest() {
    if (!KOS.Activities) return null;
    const A = KOS.Activities;
    const open = a => a && areaOpen(a.area) && A.isUnlocked(a.id);
    const fresh = a => { const p = S().progress(a.id); return !p.done && !(p.stars > 0); };
    for (const id of PATH) { const a = A.get(id); if (open(a) && fresh(a)) return a; }
    const all = A.list().filter(open);
    const byEase = (x, y) => (x.difficulty || 1) - (y.difficulty || 1) || A.AREAS.indexOf(x.area) - A.AREAS.indexOf(y.area) || x.order - y.order;
    const notDone = all.filter(fresh).sort(byEase);
    if (notDone.length) return notDone[0];
    const more = all.filter(a => S().progress(a.id).stars < 3).sort(byEase);
    return more[0] || null;
  }

  // ------------------------------------------------------------------ who coaches what (the real KØS coaches)
  // Jesper (family trainer, club president) is the default: quiz, map, menus, free sailing. Ida runs the Sailing School
  // (the lesson script introduces Ida) and the Opti/Tera activities; Storm (youth coach) racing; Nicolas the H-boat and the
  // rules school; Marius (youth coach) the RIB and the youth dinghies; Maria J70 sailing/racing and navigation; Anton
  // (head coach) the other J70 activities (docking and rigging); Peter keeps the club's shed tidy (shed mode).
  function coachFor(a, boat) {
    if (a.mode === 'shed') return 'peter';
    if (a.mode === 'school') return 'ida';
    if (boat === 'j70' && (a.mode === 'sail' || a.mode === 'race')) return 'maria';
    if (boat === 'hboat' || a.mode === 'rowschool') return 'nicolas';
    if (boat === 'j70') return 'anton';
    if (a.mode === 'nav') return 'maria';
    if (a.mode === 'race') return 'storm';
    if (a.boat === 'opti' || a.boat === 'tera') return 'ida'; // the activity's own boat, not the player's default Opti
    if (a.mode === 'rib' || ['feva', 'zest', 'ilca', '29er'].includes(boat)) return 'marius';
    return 'jesper';
  }

  // ------------------------------------------------------------------ first run: profile → hub → first school lesson
  function onboard(name) {
    const first = KOS.Activities && KOS.Activities.get('school.steer');
    if (!first) { UI().coach(t('app.coach.welcome', { name }), { ms: 7000, pos: 'bottom', coach: 'jesper' }); return; }
    const step = (n, icon, key) => '<li><span class="ob-n">' + n + '</span>' + ico(icon) + '<span>' + esc(t(key)) + '</span></li>';
    UI().dialog({
      title: t('app.onboard.title', { name }), cls: 'onboard-dialog',
      body: '<div class="ob-coach">' + UI().coachSvg('happy', 'jesper') + '</div><p class="ob-lead">' + esc(t('app.onboard.body')) + '</p>' +
        '<ol class="ob-steps">' + step(1, 'school', 'app.onboard.s1') + step(2, 'star', 'app.onboard.s2') + step(3, 'boat', 'app.onboard.s3') + '</ol>',
      buttons: [{ labelKey: 'app.onboard.later' }, { labelKey: 'app.onboard.go', kind: 'primary', icon: 'play', onClick: () => { track('Onboarding', 'start-first-lesson'); App.play(first.id); } }],
    });
  }

  // ------------------------------------------------------------------ helpers
  function $(sel, rootEl) { return (rootEl || doc).querySelector(sel); }
  function screenEl(id) { return doc.getElementById('screen-' + id); }
  function bind(sec, acts) {
    sec.onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b || !sec.contains(b) || b.disabled) return;
      const fn = acts[b.getAttribute('data-act')];
      if (fn) { fn(b, e); }
    };
  }
  function backBtn() { return '<button type="button" class="icon-btn" data-act="back" aria-label="' + esc(t('common.back')) + '">' + ico('back') + '</button>'; }
  function header(title, sub, right) {
    return '<header class="screen-head">' + backBtn() + '<div class="head-title"><h1>' + esc(title) + '</h1>' + (sub ? '<div class="head-sub">' + sub + '</div>' : '') + '</div>' +
      '<div class="head-right">' + (right || '') + '</div></header>';
  }
  function starPill() {
    const max = KOS.Activities ? KOS.Activities.maxStars() : 0;
    return '<div class="pill" title="' + esc(t('app.stars')) + '"><span class="pill-ico star-ico">' + ico('star') + '</span><b>' + S().totalStars() + '</b>' + (max ? '<span class="pill-dim">/ ' + max + '</span>' : '') + '</div>';
  }
  function xpPill() {
    const xp = S().xp(), r = rankOf(xp);
    return '<div class="pill pill-xp" title="' + esc(t(r.key)) + '"><span class="lvl">' + r.level + '</span><div class="pill-xp-txt"><b>' + esc(t(r.key)) + '</b><span class="xpbar"><i style="width:' + Math.round(r.frac * 100) + '%"></i></span></div></div>';
  }
  function settingsBtn() { return '<button type="button" class="icon-btn" data-act="settings" aria-label="' + esc(t('app.settings.title')) + '">' + ico('settings') + '</button>'; }
  function profileAvatar(cls) { const p = S().profile(); return UI().avatarSvg(p && p.avatar, { cls }); }
  function sailNoText(p) { return 'DEN ' + ((p && p.sailNo) || '—'); }
  function difficultyDots(d) {
    let s = '<span class="diff" aria-label="' + esc(t('app.area.difficulty')) + ' ' + d + '/5">';
    for (let i = 1; i <= 5; i++) s += '<i class="' + (i <= d ? 'on' : '') + '"></i>';
    return s + '</span>';
  }
  function settings() { return S().settings(); }

  // ------------------------------------------------------------------ menu background (sunset over Øresund)
  function buildMenuBg() {
    if (doc.getElementById('menu-bg')) return;
    const bg = doc.createElement('div');
    bg.id = 'menu-bg';
    bg.setAttribute('aria-hidden', 'true');
    // skyline: Nordhavn towers, cranes, the red-brick power station chimney, distant Swedish coast
    const towers = [[60, 40, 70], [110, 26, 96], [140, 34, 58], [182, 22, 120], [208, 30, 82], [246, 40, 64], [300, 18, 104], [322, 28, 76], [360, 46, 52]];
    let sky = '';
    towers.forEach(([x, w, h]) => {
      sky += '<rect x="' + (1000 + x) + '" y="' + (560 - h) + '" width="' + w + '" height="' + h + '" fill="#4b4a72"/>';
      for (let yy = 560 - h + 8; yy < 552; yy += 12) sky += '<rect x="' + (1000 + x + 5) + '" y="' + yy + '" width="' + (w - 10) + '" height="3" fill="#ffcf8a" opacity=".22"/>';
    });
    bg.innerHTML =
      '<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">' +
      '<defs>' +
      '<linearGradient id="mbg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f73"/><stop offset=".35" stop-color="#8a6fa8"/><stop offset=".62" stop-color="#f19a86"/><stop offset=".8" stop-color="#ffc98e"/><stop offset="1" stop-color="#ffe3b0"/></linearGradient>' +
      '<radialGradient id="mbg-sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".25" stop-color="#ffe2a0" stop-opacity=".9"/><stop offset="1" stop-color="#ffb47a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="mbg-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f8fb4"/><stop offset=".18" stop-color="#6c7fa8"/><stop offset=".6" stop-color="#3f5f8f"/><stop offset="1" stop-color="#1f3a63"/></linearGradient>' +
      '<linearGradient id="mbg-glint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a8" stop-opacity=".75"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></linearGradient>' +
      '</defs>' +
      '<rect width="1600" height="1000" fill="url(#mbg-sky)"/>' +
      '<circle class="mbg-sunglow" cx="620" cy="520" r="260" fill="url(#mbg-sun)"/>' +
      '<circle cx="620" cy="530" r="46" fill="#fff3cf" opacity=".95"/>' +
      '<g class="mbg-clouds" fill="#ffd9c4" opacity=".45"><ellipse cx="260" cy="250" rx="180" ry="26"/><ellipse cx="360" cy="232" rx="110" ry="20"/><ellipse cx="1180" cy="190" rx="200" ry="24"/><ellipse cx="1300" cy="176" rx="120" ry="18"/><ellipse cx="860" cy="330" rx="150" ry="14"/></g>' +
      '<path d="M0 548 C200 540 380 544 560 546 S900 540 1000 548 L1000 562 L0 562Z" fill="#7d78a3" opacity=".7"/>' + // Swedish coast haze
      '<g>' + sky +
      '<path d="M1370 560v-120h8v120M1374 446l70 0M1440 446v24" stroke="#4b4a72" stroke-width="5" fill="none"/>' + // crane
      '<path d="M1460 560v-90h6v90M1462 476l-50 0M1414 476v18" stroke="#4b4a72" stroke-width="4" fill="none"/>' +
      '<rect x="1490" y="500" width="80" height="60" fill="#6b4458"/><rect x="1520" y="380" width="18" height="122" fill="#6b4458"/>' + // power station + chimney
      '<rect x="1580" y="520" width="40" height="40" fill="#4b4a72"/></g>' +
      '<rect y="558" width="1600" height="442" fill="url(#mbg-sea)"/>' +
      '<path d="M560 560 L680 560 L760 1000 L480 1000Z" fill="url(#mbg-glint)" opacity=".55"/>' +
      '<g class="mbg-waves w1" stroke="#cfd7f0" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round">' + waveRows(600, 6, 34) + '</g>' +
      '<g class="mbg-waves w2" stroke="#e6ecff" stroke-opacity=".28" stroke-width="4" fill="none" stroke-linecap="round">' + waveRows(760, 6, 56) + '</g>' +
      '<g class="mbg-boat b1"><path d="M0 0l-1-46 24 42z" fill="#fff8ee"/><path d="M-3 -2l-18 0 17-36z" fill="#ffe9d6"/><path d="M-26 2h52l-6 7h-40z" fill="#2a2f4a"/></g>' +
      '<g class="mbg-boat b2"><path d="M0 0l-1-30 16 27z" fill="#fff2e0"/><path d="M-16 1h32l-4 5h-24z" fill="#2a2f4a"/></g>' +
      '<g class="mbg-gull g1" stroke="#3a3f63" stroke-width="3" fill="none" stroke-linecap="round"><path d="M-14 0q7-8 14 0q7-8 14 0"/></g>' +
      '<g class="mbg-gull g2" stroke="#3a3f63" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M-10 0q5-6 10 0q5-6 10 0"/></g>' +
      '</svg><div class="mbg-photo"></div><div class="mbg-vignette"></div>';
    doc.body.insertBefore(bg, doc.body.firstChild);
  }
  function waveRows(y0, rows, gap) {
    let s = '';
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * gap + r * r * 3;
      const len = 30 + r * 10;
      for (let x = (r % 2) * 60 - 200; x < 1800; x += 120 + r * 30) {
        s += '<path d="M' + x + ' ' + y + ' q' + len / 2 + ' -' + (6 + r) + ' ' + len + ' 0"/>';
      }
    }
    return s;
  }

  // ------------------------------------------------------------------ title logo (animated SVG boat + KØS SEJL)
  function logoSvg() {
    return '<svg class="logo-boat" viewBox="0 0 320 150" aria-hidden="true">' +
      '<defs><linearGradient id="lg-sail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe1c2"/></linearGradient>' +
      '<linearGradient id="lg-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="lg-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="150"><rect width="320" height="150" fill="url(#lg-fade)"/></mask></defs>' +
      '<g class="lb-sun"><circle cx="246" cy="44" r="20" fill="#ffd98a" opacity=".55"/></g>' +
      '<g class="lb-bob"><g class="lb-heel">' +
      '<path d="M160 18v86" stroke="#f3f4f7" stroke-width="4" stroke-linecap="round"/>' +
      '<path class="lb-main" d="M163 20c28 22 44 52 48 82h-48z" fill="url(#lg-sail)"/>' +
      '<path class="lb-jib" d="M156 28c-16 22-30 46-36 72h36z" fill="#fff6ea" opacity=".95"/>' +
      '<path d="M170 46h24M168 64h33M166 82h40" stroke="#ffb27a" stroke-width="1.6" opacity=".6"/>' +
      '<rect x="176" y="50" width="22" height="12" rx="3" fill="#ff7a3d"/><text x="187" y="59.5" font-size="8.5" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui,Segoe UI,sans-serif">KØS</text>' +
      '<path d="M98 104h132c-8 14-22 20-40 20h-62c-16 0-26-8-30-20z" fill="#ff7a3d"/>' +
      '<path d="M100 109h127" stroke="#ffc65c" stroke-width="3"/>' +
      '<circle cx="204" cy="98" r="6" fill="#ffd2a8"/><path d="M200 104l12 4" stroke="#1d2433" stroke-width="6" stroke-linecap="round"/>' +
      '</g></g>' +
      '<g mask="url(#lg-mask)"><g class="lb-wave w-back"><path d="M-40 124 q20-10 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V160 H-40z" fill="#49c6f2" opacity=".55"/></g>' +
      '<g class="lb-wave w-front"><path d="M-40 132 q20-9 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V160 H-40z" fill="#2b8fd0"/>' +
      '<path d="M-40 132 q20-9 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#bfefff" stroke-width="2.5" stroke-linecap="round"/></g>' +
      '</g><g class="lb-spray"><circle cx="96" cy="118" r="2.5" fill="#fff"/><circle cx="88" cy="112" r="1.8" fill="#fff"/><circle cx="92" cy="106" r="1.3" fill="#fff"/></g>' +
      '</svg>' +
      '<svg class="logo-text" viewBox="0 0 640 150" role="img" aria-label="KØS SEJL">' +
      '<defs><linearGradient id="lg-txt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".45" stop-color="#ffe2a6"/><stop offset="1" stop-color="#ffab45"/></linearGradient></defs>' +
      '<g font-family="ui-rounded,\'SF Pro Rounded\',\'Segoe UI Variable Display\',\'Segoe UI\',system-ui,sans-serif" font-weight="900" font-size="128" text-anchor="middle" letter-spacing="6">' +
      '<text x="326" y="128" fill="#7a4a32" textLength="600" lengthAdjust="spacingAndGlyphs">KØS SEJL</text>' +
      '<text x="320" y="120" fill="url(#lg-txt)" stroke="#fff3dc" stroke-width="1.2" textLength="600" lengthAdjust="spacingAndGlyphs">KØS SEJL</text>' +
      '</g></svg>';
  }

  // ------------------------------------------------------------------ App
  const App = {
    cur: null,
    params: {},
    stack: [],
    BOAT_STARS,
    BADGES,
    RANKS,
    rankOf,
    suggest,
    PATH,
    addBadges,
    boatList,
    boatUnlocked,
    boatCardSvg,
    installPrompt: null,
  };

  const renderers = {};
  const leave = {};

  // Page pinch-zoom is allowed on menus (accessibility), but during play every touch steers the boat, so a stray
  // pinch on an overlay could zoom the page with no way back out. Lock zoom while playing, and snap back to 100 %.
  // iOS ignores user-scalable=no and touch-action on the steering buttons (they use pointer events, which can't cancel
  // a double-tap zoom), so quick taps on STYRBORD zoomed the page, and touch-action then blocked pinching back out.
  let viewportMeta = null, viewportBase = '', lastTouchEnd = 0, unzoomT = 0;
  const VV = window.visualViewport;
  const LOCKED = () => viewportBase + ', maximum-scale=1, user-scalable=no';
  const playing = () => doc.documentElement.classList.contains('in-play');
  const noGesture = e => { if (playing()) e.preventDefault(); };
  function noDoubleTap(e) {
    if (!playing()) return;
    const now = e.timeStamp, quick = now - lastTouchEnd < 400;
    lastTouchEnd = now;
    const el = e.target && e.target.closest ? e.target : null;
    if (el && el.closest('input, textarea, select, .play-chrome, .play-menu, .pc-chip')) return; // the menu button, menu and goals chip must always get their click
    // the controls never need a click (pointerdown drives them); elsewhere only swallow the second tap of a pair
    if (e.cancelable && (quick || (el && el.closest('.kc')))) e.preventDefault();
  }
  // re-applying maximum-scale=1 makes iOS snap a zoomed page back to 100 %
  function unzoom() {
    if (!viewportMeta || !VV || VV.scale <= 1.01) return;
    viewportMeta.setAttribute('content', viewportBase);
    requestAnimationFrame(() => { if (playing()) viewportMeta.setAttribute('content', LOCKED()); });
  }
  doc.addEventListener('touchend', noDoubleTap, { passive: false, capture: true });
  doc.addEventListener('dblclick', noGesture, { capture: true });
  doc.addEventListener('gesturestart', noGesture, { passive: false, capture: true });
  doc.addEventListener('gesturechange', noGesture, { passive: false, capture: true });
  if (VV) VV.addEventListener('resize', () => { if (playing()) { clearTimeout(unzoomT); unzoomT = setTimeout(unzoom, 250); } });
  function lockZoom(on) {
    const de = doc.documentElement;
    if (de.classList.contains('in-play') === on) return;
    de.classList.toggle('in-play', on);
    viewportMeta = viewportMeta || doc.querySelector('meta[name="viewport"]');
    if (!viewportMeta) return;
    viewportBase = viewportBase || viewportMeta.getAttribute('content');
    viewportMeta.setAttribute('content', on ? LOCKED() : viewportBase);
    if (on) setTimeout(unzoom, 50);
  }
  // Sea modes: zoom out to see more of the water. Overview button (or M) shows the whole venue; two-finger pinch on
  // the water, the mouse wheel or +/- change the zoom (KOS.SailScene.view, applied by the scene camera).
  function setupViewZoom(sec, chrome) {
    const SS = KOS.SailScene;
    if (!SS || !SS.view) return;
    const V = SS.view;
    V.mul = 1; V.overview = false; V.tilt = null; // the tilt quick toggle (Skrå visning) lasts for this run only
    const btn = doc.createElement('button');
    btn.type = 'button'; btn.className = 'icon-btn view-btn';
    btn.setAttribute('aria-label', t('app.view.overview')); btn.title = t('app.view.overview') + ' (M)';
    btn.innerHTML = ico('map');
    const sync = () => { sec.classList.toggle('view-overview', V.overview); btn.classList.toggle('on', V.overview); btn.setAttribute('aria-pressed', V.overview ? 'true' : 'false'); };
    const toggle = () => { sfx('click'); V.overview = !V.overview; if (V.overview) track('View', 'overview', run.act && run.act.id); if (!V.overview && V.mul < 1) V.mul = 1; sync(); };
    btn.addEventListener('click', toggle);
    chrome.appendChild(btn); sync();
    // Skrå visning quick toggle: flips the effective state for this run (not persisted); dimmed while the overview forces flat
    const tbtn = doc.createElement('button');
    tbtn.type = 'button'; tbtn.className = 'icon-btn tilt-btn';
    tbtn.setAttribute('aria-label', t('app.view.tilt')); tbtn.title = t('app.view.tilt');
    tbtn.innerHTML = ico('tilt');
    let tLast = '';
    const tsync = () => {
      const sc = SS.current, on = V.tilt != null ? !!V.tilt : !!(sc && sc._tiltWant), dis = !!V.overview, k = (on ? 1 : 0) + '' + (dis ? 1 : 0);
      if (k === tLast) return; tLast = k;
      tbtn.classList.toggle('on', on && !dis); tbtn.setAttribute('aria-pressed', on && !dis ? 'true' : 'false'); tbtn.setAttribute('aria-disabled', dis ? 'true' : 'false');
    };
    const tiltToggle = () => { if (V.overview) return; sfx('click'); const sc = SS.current; V.tilt = !(V.tilt != null ? V.tilt : !!(sc && sc._tiltWant)); track('View', 'tilt', run.act && run.act.id); tLast = ''; tsync(); };
    tbtn.addEventListener('click', tiltToggle);
    chrome.appendChild(tbtn); tsync(); run.tiltSync = tsync;
    // ⋯ menu (phones, body.phone-ui): pause, overview and Skrå visning collapse into one small button top-left. While it is open
    // the game is paused (silently, without the pause card); it closes on a choice or a tap outside.
    const dots = doc.createElement('button');
    dots.type = 'button'; dots.className = 'icon-btn dots-btn';
    dots.setAttribute('aria-label', t('app.menu.more')); dots.setAttribute('aria-haspopup', 'true'); dots.setAttribute('aria-expanded', 'false');
    dots.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>';
    chrome.insertBefore(dots, chrome.firstChild);
    let menuEl = null, menuScrim = null;
    const menuClose = () => {
      if (!menuEl) return;
      menuEl.remove(); menuScrim.remove(); menuEl = menuScrim = null; run.menuOpen = false; run.menuClose = null;
      dots.classList.remove('on'); dots.setAttribute('aria-expanded', 'false');
      if (run.running && run.paused) { // resume the game
        run.paused = false; run.last = performance.now();
        try { run.inst && run.inst.resume && run.inst.resume(); } catch (e) { console.error(e); }
        emit('play:pause', false);
      }
    };
    const menuOpen = () => {
      if (menuEl || !run.running || run.finished || run.paused) return;
      sfx('click'); track('View', 'menu', run.act && run.act.id);
      run.paused = true; run.menuOpen = true; run.menuClose = menuClose;
      try { run.inst && run.inst.pause && run.inst.pause(); } catch (e) { console.error(e); }
      if (UI().coachClose) UI().coachClose();
      audio('engine', null);
      emit('play:pause', true);
      const cur = settings().tilt;
      const row = (act, icon, label, extra) => '<button type="button" class="pm-row' + (extra && extra.on ? ' on' : '') + '" data-pm="' + act + '">' + ico(icon) + '<span>' + esc(label) + '</span>' + ((extra && extra.badge) || '') + '</button>';
      menuScrim = doc.createElement('div'); menuScrim.className = 'play-menu-scrim';
      menuEl = doc.createElement('div'); menuEl.className = 'play-menu glass'; menuEl.setAttribute('role', 'menu');
      // mode-provided items (host.menuItems: {id, icon, labelKey, show(), on(), run()}), portrait phones only: they replace round
      // buttons that would otherwise sit over the sailing area (race: spol frem, laylines)
      const mItems = (run.host && run.host.menuItems && root.matchMedia && root.matchMedia('(orientation: portrait)').matches ? run.host.menuItems : []).filter(it => { try { return !it.show || it.show(); } catch (e) { return false; } });
      menuEl.innerHTML =
        row('pause', 'pause', t('app.pause.title')) +
        mItems.map((it, i) => row('item' + i, it.icon, t(it.labelKey), { on: it.on && it.on(), badge: it.on ? '<i class="pm-state">' + esc(t(it.on() ? 'app.menu.on' : 'app.menu.off')) + '</i>' : '' })).join('') +
        row('overview', 'map', t('app.menu.overview'), { on: V.overview, badge: '<i class="pm-state">' + esc(t(V.overview ? 'app.menu.on' : 'app.menu.off')) + '</i>' }) +
        '<div class="pm-tilt"><span class="pm-lbl">' + ico('tilt') + '<span>' + esc(t('app.menu.tilt')) + '</span></span><span class="pm-seg" role="group">' +
        [['off', 'app.tilt.off'], ['on', 'app.tilt.on'], ['auto', 'app.tilt.auto']].map(o => '<button type="button" data-tilt="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '"' + (cur === o[0] ? ' class="on"' : '') + '>' + esc(t(o[1])) + '</button>').join('') + '</span></div>' +
        (iosNeedsGuide() ? '<button type="button" class="pm-hint" data-pm="install">' + ico('download') + '<span>' + esc(t('app.menu.install')) + '</span></button>' : '');
      menuEl.addEventListener('click', e => {
        const tb = e.target.closest('[data-tilt]');
        if (tb) {
          const v = tb.getAttribute('data-tilt'); sfx('click');
          try { S().saveSettings({ tilt: v }); } catch (er) { /* storage blocked */ }
          V.tilt = !!(KOS.Tilt && KOS.Tilt.resolve(v, run.act, Perf.level)); tLast = ''; tsync();
          menuEl.querySelectorAll('[data-tilt]').forEach(b => { const on = b === tb; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          setTimeout(menuClose, 220);
          return;
        }
        const b = e.target.closest('[data-pm]'); if (!b) return;
        const act = b.getAttribute('data-pm'); sfx('click');
        menuClose();
        const mi = /^item(\d+)$/.exec(act);
        if (mi && mItems[+mi[1]]) { try { mItems[+mi[1]].run(); } catch (er) { console.error(er); } }
        else if (act === 'pause') setPaused(true);
        else if (act === 'overview') toggle();
        else if (act === 'install') { setPaused(true); App.install(); }
      });
      menuScrim.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); menuClose(); });
      sec.appendChild(menuScrim); sec.appendChild(menuEl);
      dots.classList.add('on'); dots.setAttribute('aria-expanded', 'true');
    };
    dots.addEventListener('click', () => { if (menuEl) menuClose(); else menuOpen(); });
    const zoomBy = k => { if (!V.zt) { V.zt = 1; track('View', 'zoom', run.act && run.act.id); } V.overview = false; V.mul = Math.max(0.05, Math.min(3, V.mul * k)); sync(); };
    const inControls = el => !!(el && el.closest && el.closest('.kc, .pause-overlay, button, .dialog'));
    let pinch = null;
    const dist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    const offs = [];
    const listen = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); offs.push(() => el.removeEventListener(ev, fn, o)); };
    listen(sec, 'touchstart', e => {
      if (e.touches.length === 2 && !inControls(e.touches[0].target) && !inControls(e.touches[1].target)) { pinch = { d: dist(e.touches), mul: V.mul }; V.overview = false; sync(); }
    }, { passive: true });
    listen(sec, 'touchmove', e => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      V.mul = Math.max(0.05, Math.min(3, pinch.mul * dist(e.touches) / (pinch.d || 1)));
    }, { passive: false });
    listen(sec, 'touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });
    // wheel: some modes zoom on the wheel themselves (free sail) and call preventDefault; leave those alone
    listen(sec, 'wheel', e => { if (e.defaultPrevented || inControls(e.target)) return; e.preventDefault(); zoomBy(e.deltaY > 0 ? 0.88 : 1.14); }, { passive: false });
    listen(root, 'keydown', e => {
      if (run.paused || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'm' || e.key === 'M') { if (!e.repeat) toggle(); } // toggles ignore key auto-repeat (holding M or V would flicker); zoom keys repeat
      else if (e.key === 'v' || e.key === 'V') { if (!e.repeat) tiltToggle(); }
      else if (e.key === '-' || e.key === '_') zoomBy(0.8);
      else if (e.key === '+' || e.key === '=') zoomBy(1.25);
    });
    run.viewOff = () => { offs.forEach(f => f()); menuClose(); run.tiltSync = null; V.mul = 1; V.overview = false; V.tilt = null; sec.classList.remove('view-overview'); };
  }
  App.show = function (screen, params, opts) {
    opts = opts || {};
    if (!renderers[screen]) screen = 'title';
    // startup phase 2 (see js/main.js): the mode scripts register the activities every other screen needs
    if (screen !== 'title' && !KOS.modesReady) {
      App._held = [screen, params, opts];
      doc.body.classList.add('modes-wait');
      return screenEl(App.cur || 'title');
    }
    const prev = App.cur;
    if (prev && prev !== screen && leave[prev]) { try { leave[prev](); } catch (e) { console.error(e); } }
    if (prev && !opts.isBack && !opts.replace && prev !== screen && prev !== 'play' && prev !== 'results') {
      App.stack.push({ screen: prev, params: App.params });
      if (App.stack.length > 20) App.stack.shift();
    }
    while (App.stack.length && App.stack[App.stack.length - 1].screen === screen) App.stack.pop();
    App.cur = screen;
    App.params = params || {};
    lockZoom(screen === 'play');
    doc.querySelectorAll('#app > .screen').forEach(s => {
      const hide = s.id !== 'screen-' + screen;
      // empty hidden screens: duplicate SVG ids (gradients, masks) inside display:none sections break painting
      if (hide && !s.hidden && s.id !== 'screen-play') { s.onclick = null; s.innerHTML = ''; }
      s.hidden = hide;
    });
    const sec = screenEl(screen);
    doc.body.setAttribute('data-screen', screen);
    doc.body.setAttribute('data-area', (screen === 'area' && App.params.area) || (screen === 'play' && run.act && run.act.area) || '');
    renderers[screen](sec, App.params);
    if (KOS.I18n) KOS.I18n.apply(sec);
    if (!UI().reduced() && prev !== screen) { sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter'); }
    if (screen !== 'play') {
      if (settings().music) audio('music', 'menu');
      const sc = sec.querySelector('.scroll');
      if (sc && !opts.keepScroll) sc.scrollTop = 0;
    }
    if (screen !== 'play') announceScreen(sec);
    emit('screen', screen);
    return sec;
  };
  // called once by main.js when all mode scripts have run: play a held screen request, or fill the title in place
  App.modesReady = function () {
    doc.body.classList.remove('modes-wait');
    const held = App._held;
    App._held = null;
    if (held) { App.show(held[0], held[1], held[2]); return; }
    const sec = screenEl('title');
    if (App.cur !== 'title' || !sec) return;
    // the title was rendered before the activities existed: patch the star total and the quick-start button in place
    // (a full re-render would replay the logo animation)
    const pill = sec.querySelector('.topbar-left .pill');
    if (pill) pill.outerHTML = starPill();
    const quick = sec.querySelector('[data-act="quick"]');
    if (quick && KOS.Activities && KOS.Activities.byArea('bay')[0]) quick.disabled = false;
  };
  App.back = function () {
    const prev = App.stack.pop();
    if (prev) App.show(prev.screen, prev.params, { isBack: true });
    else App.show('title', {}, { isBack: true });
  };
  App.refresh = function () { if (App.cur && App.cur !== 'play') App.show(App.cur, App.params, { replace: true, keepScroll: true }); };

  // ================================================================== TITLE
  // screen readers: say which screen opened and park focus on its heading (the live region is in index.html)
  function announceScreen(sec) {
    try {
      const h = sec.querySelector('h1, h2');
      if (!h) return;
      const live = doc.getElementById('sr-live');
      if (live) live.textContent = h.textContent;
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    } catch (e) { /* optional */ }
  }
  renderers.title = function (sec) {
    const p = S().profile();
    const bay = KOS.Activities ? KOS.Activities.byArea('bay')[0] : null;
    sec.innerHTML =
      '<h1 class="sr-only">KØS SEJL</h1>' +
      '<div class="topbar">' +
      '<div class="topbar-left">' + starPill() + (p ? xpPill() : '') + (S().god() ? '<span class="god-pill" title="God mode">GOD</span>' : '') + '</div>' +
      '<div class="topbar-right">' +
      (canInstall() ? '<button type="button" class="icon-btn" data-act="install" aria-label="' + esc(t('app.install')) + '">' + ico('download') + '</button>' : '') +
      (doc.fullscreenEnabled ? '<button type="button" class="icon-btn hide-sm" data-act="fullscreen" aria-label="' + esc(t('app.fullscreen')) + '">' + ico('fullscreen') + '</button>' : '') +
      '<button type="button" class="icon-btn avatar-btn" data-act="profile" aria-label="' + esc(t('app.profile.title')) + '">' + profileAvatar() + '</button>' +
      settingsBtn() + '</div></div>' +
      '<div class="title-main">' +
      '<div class="title-logo">' + logoSvg() +
      '<p class="tagline">' + esc(t('app.title.tag1')) + ' <span>' + esc(t('app.title.tag2')) + '</span></p></div>' +
      '<div class="title-menu">' +
      (p ? '<div class="hello">' + esc(t('app.title.hello', { name: p.name || '' })) + '</div>' : '') +
      '<button type="button" class="btn btn-primary btn-play" data-act="play">' + ico('play') + '<span>' + esc(t('app.title.play')) + '</span></button>' +
      '<button type="button" class="menu-btn" data-act="garage"><span class="mb-ico c-orange">' + ico('passport') + '</span><span class="mb-txt"><b>' + esc(t('app.garage.title')) + '</b><small>' + esc(t('app.title.garageSub')) + '</small></span></button>' +
      '<button type="button" class="menu-btn" data-act="quick"' + (bay ? '' : ' disabled') + '><span class="mb-ico c-blue">' + ico('wind') + '</span><span class="mb-txt"><b>' + esc(t('app.title.quick')) + '</b><small>' + esc(t('app.title.quickSub')) + '</small></span></button>' +
      '</div></div>' +
      '<footer class="title-foot"><span class="hint">' + (finePointer() ? esc(t('app.title.hint')) : '') + '</span>' +
      '<button type="button" class="link-btn" data-act="credits">' + esc(t('app.credits.title')) + '</button></footer>';
    bind(sec, {
      play: () => { sfx('click'); if (!S().profile()) App.show('profile', { first: true }); else App.show('hub'); },
      garage: () => { sfx('click'); App.show('garage'); },
      quick: () => { sfx('click'); const b = KOS.Activities ? KOS.Activities.byArea('bay')[0] : null; if (b) App.play(b.id); },
      settings: () => { sfx('click'); App.show('settings'); },
      profile: () => { sfx('click'); App.show('profile', {}); },
      credits: () => { sfx('click'); App.show('credits'); },
      fullscreen: () => { sfx('click'); toggleFullscreen(); },
      install: () => { sfx('click'); App.install(); },
    });
  };
  function toggleFullscreen() {
    try {
      if (doc.fullscreenElement) doc.exitFullscreen();
      else doc.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch (e) { /* unsupported */ }
  }

  // ================================================================== HUB
  renderers.hub = function (sec) {
    sec.classList.remove('hub-fallback');
    if (KOS.Hub && typeof KOS.Hub.mount === 'function') {
      sec.onclick = null;
      sec.innerHTML = '';
      try { KOS.Hub.mount(sec); return; } catch (e) { console.error('KOS.Hub.mount failed', e); }
    }
    const areas = KOS.Activities ? KOS.Activities.areas() : [];
    sec.classList.add('hub-fallback');
    sec.innerHTML = header(t('app.hub.title'), esc(t('app.hub.sub')), starPill() + settingsBtn()) +
      '<div class="scroll"><div class="grid area-grid">' +
      areas.map((a, i) => {
        const st = KOS.Activities.areaStars(a);
        return '<button type="button" class="card area-card a-' + a + '" data-act="area" data-area="' + a + '" style="--i:' + i + '">' +
          '<span class="ac-ico">' + ico(KOS.Activities.AREA_ICONS[a] || 'sail') + '</span>' +
          '<span class="ac-txt"><b>' + esc(t('area.' + a + '.name')) + '</b><small>' + esc(t('area.' + a + '.desc')) + '</small></span>' +
          '<span class="ac-meta">' + (st.count ? '<span class="mini-star">' + ico('star') + st.have + '/' + st.max + '</span>' : '<span class="soon">' + esc(t('common.comingSoon')) + '</span>') + '</span>' +
          '</button>';
      }).join('') + '</div></div>';
    bind(sec, {
      back: () => { sfx('click'); App.back(); },
      settings: () => { sfx('click'); App.show('settings'); },
      area: b => { sfx('click'); App.show('area', { area: b.getAttribute('data-area') }); },
    });
  };
  leave.hub = function () { if (KOS.Hub && typeof KOS.Hub.unmount === 'function') { try { KOS.Hub.unmount(); } catch (e) { console.error(e); } } };

  // ================================================================== AREA
  renderers.area = function (sec, params) {
    const area = params.area || 'bay';
    const list = KOS.Activities ? KOS.Activities.byArea(area).filter(a => !a.pickHidden) : []; // free sailing: one card, the per-boat ids stay registered
    const st = KOS.Activities ? KOS.Activities.areaStars(area) : { have: 0, max: 0 };
    sec.innerHTML = header(t('area.' + area + '.name'), esc(t('area.' + area + '.desc')),
      '<div class="pill"><span class="pill-ico star-ico">' + ico('star') + '</span><b>' + st.have + '</b><span class="pill-dim">/ ' + st.max + '</span></div>') +
      '<div class="scroll"><div class="grid act-grid">' +
      (list.length ? list.map((a, i) => actCard(a, i)).join('') :
        '<div class="empty glass"><div class="empty-ico">' + ico('sail') + '</div><p>' + esc(t('app.area.empty')) + '</p></div>') +
      '</div></div>';
    bind(sec, {
      back: () => { sfx('click'); App.back(); },
      act: b => {
        const id = b.getAttribute('data-id');
        if (!KOS.Activities.isUnlocked(id)) {
          sfx('bump');
          b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
          UI().toast(lockText(id), { kind: 'warn', icon: 'lock' });
          return;
        }
        sfx('click');
        const a = KOS.Activities.get(id);
        if (a && a.pick) { startPick(a); return; }
        App.play(id);
      },
    });
  };
  function lockText(id) {
    const r = KOS.Activities.lockReason(id) || {};
    if (r.stars) return t('app.area.needStars', { n: r.stars, have: r.have });
    if (r.after) return t('app.area.needAfter', { name: tt(r.after.title) });
    return t('common.locked');
  }
  // ------------------------------------------------------------------ boat on the level cards / boat picker (docs/specs/boat-pick.md)
  const MINI_BOAT = {};   // class id -> blob URL (or data URI) of the side-view boat card, built once
  function boatThumb(id) {
    if (!MINI_BOAT[id]) {
      let svg = boatCardSvg(id), url = '';
      try {
        if (svg.indexOf('xmlns') < 0) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        url = (root.URL && root.Blob) ? root.URL.createObjectURL(new root.Blob([svg], { type: 'image/svg+xml' })) : '';
      } catch (e) { url = ''; }
      MINI_BOAT[id] = url || ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    }
    return '<img class="boat-thumb" alt="" draggable="false" src="' + MINI_BOAT[id] + '">';
  }
  function favBoat() { const f = S().get('boat', 'opti'); return boatGet(f) && !boatGet(f).motor ? f : 'opti'; }
  function sailedBoat(id) {
    return KOS.Activities.list().some(x => x.boat === id && (S().progress(x.id).stars > 0 || S().progress(x.id).done));
  }
  // {a, key, free, offered, chosen, def, actId} for a pick card, else null. actId = the activity that is really played.
  function pickInfo(a) {
    if (!a || !a.pick || a.pickHidden || !KOS.BoatPick) return null;
    const BP = KOS.BoatPick, free = a.pick.group === 'free';
    const cands = free ? BP.FREE_BOATS : BP.SAIL_BOATS;
    const def = free ? (a.boat || 'opti') : favBoat();
    const list = BP.offered(cands, { def, unlockAll: !!settings().unlockAll,
      sailed: sailedBoat, allow: free ? (id => KOS.Activities.isUnlocked('sail.free.' + id)) : null });
    const key = a.pick.key || a.id;
    const chosen = BP.resolve(S().boatPicks()[key], list, def);
    return { a, key, free, offered: list, chosen, def, actId: free ? 'sail.free.' + chosen : a.id };
  }
  // the boat a level really sails (nothing for knots, quiz, shed, theory)
  function cardBoat(a) {
    const pk = pickInfo(a);
    if (pk) return pk.chosen;
    if (a.boat) return a.boat;
    if (a.mode === 'school' || a.mode === 'nav') return favBoat();   // those modes sail the favourite boat (never the RIB)
    return null;
  }
  App.cardBoat = cardBoat;
  App.pickInfo = pickInfo;
  function startPick(a) {
    const pk = pickInfo(a);
    if (!pk) { App.play(a.id); return; }
    const go = boat => {
      S().setBoatPick(pk.key, boat);
      track('Boat', 'pick', pk.a.id + ':' + boat);
      if (pk.free) App.play('sail.free.' + boat); else App.play(a.id, { boat });
    };
    if (pk.offered.length < 2) { go(pk.chosen); return; }
    let sel = pk.chosen;
    const tiles = pk.offered.map(id => {
      const b = boatGet(id);
      return '<button type="button" class="pick-tile' + (id === sel ? ' on' : '') + '" role="radio" aria-checked="' + (id === sel ? 'true' : 'false') + '" tabindex="' + (id === sel ? '0' : '-1') + '" data-boat="' + esc(id) + '">' +
        '<span class="pick-art">' + boatThumb(id) + '</span><span class="pick-name">' + esc(b ? b.name : id) + '</span></button>';
    }).join('');
    const dlg = UI().dialog({
      title: tt(a.pickTitle || a.title), icon: 'boat', cls: 'boat-pick-dialog',
      body: '<p class="pick-hint">' + esc(t('app.pick.hint')) + '</p><div class="pick-grid" role="radiogroup" aria-label="' + esc(t('app.pick.label')) + '">' + tiles + '</div>',
      buttons: [{ labelKey: 'common.cancel' }, { labelKey: 'app.pick.start', kind: 'primary', icon: 'play', onClick: () => { go(sel); } }],
    });
    if (!dlg || !dlg.el) return;
    const grid = dlg.el.querySelector('.pick-grid');
    const all = () => Array.prototype.slice.call(grid.querySelectorAll('.pick-tile'));
    const choose = (btn, focus) => {
      sel = btn.getAttribute('data-boat');
      all().forEach(x => { const on = x === btn; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
      if (focus) btn.focus();
    };
    grid.addEventListener('click', e => { const b = e.target.closest('.pick-tile'); if (b) { sfx('click'); choose(b, false); } });
    grid.addEventListener('keydown', e => {
      const b = e.target.closest('.pick-tile'); if (!b) return;
      const L = all(), i = L.indexOf(b);
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % L.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i + L.length - 1) % L.length;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = L.length - 1;
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); choose(b, false); return; }
      if (n >= 0) { e.preventDefault(); choose(L[n], true); }
    });
    setTimeout(() => { const on = grid.querySelector('.pick-tile.on'); if (on) { try { on.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, 60);
  }
  function actCard(a, i) {
    const pk = pickInfo(a);
    const unlocked = KOS.Activities.isUnlocked(a.id);
    const pr = S().progress(pk ? pk.actId : a.id);
    const bid = cardBoat(a), boat = bid ? boatGet(bid) : null;
    const canPick = !!(pk && unlocked && pk.offered.length > 1);
    const title = pk && a.pickTitle ? a.pickTitle : a.title, desc = pk && a.pickDesc ? a.pickDesc : a.desc;
    return '<button type="button" class="card act-card' + (unlocked ? '' : ' locked') + (pr.stars === 3 ? ' perfect' : '') + '" data-act="act" data-id="' + esc(a.id) + '" style="--i:' + i + '">' +
      '<span class="act-num">' + (i + 1) + '</span>' +
      '<span class="act-ico">' + ico(unlocked ? (a.icon || 'sail') : 'lock') + '</span>' +
      '<span class="act-txt"><b>' + esc(tt(title)) + '</b><small>' + esc(tt(desc, a.params && a.params.windKn ? { wind: KOS.U.windTxt(a.params.windKn, true) } : undefined)) + '</small>' +
      '<span class="act-meta">' + difficultyDots(a.difficulty || 1) +
      '<span class="meta-chip">' + ico('clock') + (a.minutes || 3) + ' ' + esc(t('common.min')) + '</span>' +
      (boat ? '<span class="boat-chip' + (canPick ? ' can-pick' : '') + '">' + boatThumb(boat.id) + '<span class="boat-chip-name">' + esc(boat.name) + '</span>' + (canPick ? '<span class="boat-chip-change">' + esc(t('app.pick.change')) + ' ▾</span>' : '') + '</span>' : '') +
      '</span></span>' +
      '<span class="act-side">' + (unlocked ? UI().stars(pr.stars) : '<span class="lock-tag">' + ico('lock') + esc(lockShort(a.id)) + '</span>') + '</span>' +
      '</button>';
  }
  function lockShort(id) {
    const r = KOS.Activities.lockReason(id) || {};
    if (r.stars) return r.stars + ' ★';
    return t('common.locked');
  }

  // ================================================================== PLAY (mode host + fixed-step loop)
  const run = {
    act: null, inst: null, mode: null, host: null, raf: 0, running: false, paused: false, finished: false,
    acc: 0, last: 0, pauseEl: null, failed: false,
  };
  App.run = run;
  const DT = () => KOS.DT || 1 / 60;

  App.play = function (id, opts) {
    opts = opts || {};
    const a = KOS.Activities && KOS.Activities.get(id);
    if (!a) { UI().toast(t('common.comingSoon'), { kind: 'info', icon: 'sail' }); return false; }
    if (!opts.force && !KOS.Activities.isUnlocked(id)) { UI().toast(lockText(id), { kind: 'warn', icon: 'lock' }); return false; }
    const mode = KOS.Modes && KOS.Modes.get(a.mode);
    if (!mode) { UI().toast(t('common.comingSoon'), { kind: 'info', icon: 'wrench' }); return false; }
    stopRun();
    run.act = a;
    run.mode = mode;
    run.boatPick = null;
    if (a.pick && !a.pickHidden) { // chosen boat for a pick activity (docs/specs/boat-pick.md); force:true without a boat keeps the old behaviour
      let b = opts.boat;
      if (!b && !opts.force) { const pk = pickInfo(a); if (pk && !pk.free && pk.chosen !== pk.def) b = pk.chosen; }
      const bb = b && boatList().find(x => x.id === b);
      if (bb && !(bb.motor && a.pick.group !== 'free')) run.boatPick = b;
    }
    App.show('play', { id });
    return true;
  };

  // phone UI (body.phone-ui): ⋯ menu instead of three buttons, goals / lesson panels collapse to a chip, two-thumb controls
  function syncPhoneUi() { try { doc.body.classList.toggle('phone-ui', !!(KOS.Input && KOS.Input.isPhone && KOS.Input.isPhone())); } catch (e) { /* optional */ } }
  App.syncPhoneUi = syncPhoneUi;
  renderers.play = function (sec) {
    const a = run.act;
    if (!a) { setTimeout(() => App.show('hub', {}, { replace: true }), 0); return; }
    let layer = doc.getElementById('play-layer');
    if (!layer) { layer = doc.createElement('div'); layer.id = 'play-layer'; sec.appendChild(layer); }
    layer.innerHTML = '';
    layer.className = 'play-layer mode-' + a.mode;
    sec.querySelectorAll('.play-chrome,.pause-overlay').forEach(n => n.remove());
    sec.onclick = null;
    const chrome = doc.createElement('div');
    chrome.className = 'play-chrome';
    chrome.innerHTML = '<button type="button" class="icon-btn pause-btn" aria-label="' + esc(t('app.pause.title')) + '">' + ico('pause') + '</button>';
    chrome.querySelector('button').addEventListener('click', () => { sfx('click'); setPaused(!run.paused); });
    sec.appendChild(chrome);
    syncPhoneUi();
    if (run.mode.kind !== 'dom') setupViewZoom(sec, chrome);

    const kind = run.mode.kind === 'dom' ? 'dom' : 'sea';
    doc.body.classList.toggle('mode-sea', kind === 'sea');
    doc.body.classList.toggle('mode-dom', kind === 'dom');
    const canvas = doc.getElementById('game-canvas');
    sizeCanvas(canvas);
    const st = settings();
    run.paused = false;
    run.finished = false;
    run.failed = false;
    run.capsized = false;
    run.playBadges = [];
    const host = {
      canvas: kind === 'sea' ? canvas : null,
      ctx2d: kind === 'sea' ? canvas.getContext('2d') : null,
      layer,
      activity: a,
      params: a.params || {},
      assist: st.assist,
      settings: st,
      tilt: !!(KOS.Tilt && KOS.Tilt.resolve(st.tilt, a, Perf.level)), tiltAuto: st.tilt === 'auto', // Skrå visning: resolved once at play start (scene applies the override, overview and perf-drop rules)
      profile: S().profile() || {},
      boat: run.boatPick || a.boat || S().get('boat', 'opti'),
      finish: result => finish(result),
      quit: () => quit(),
      setPaused: b => setPaused(!!b),
      isPaused: () => run.paused,
    };
    run.host = host;
    if (UI().setCoach) UI().setCoach(coachFor(a, host.boat));
    audio('music', null);
    try {
      run.inst = run.mode.create(host, a);
      if (!run.inst) throw new Error('mode ' + a.mode + ' create() returned nothing');
      if (run.inst.start) run.inst.start();
    } catch (e) {
      crash(e);
      return;
    }
    run.running = true;
    run.acc = 0;
    run.last = performance.now();
    run.startT = run.last; Perf.reset();
    cancelAnimationFrame(run.raf);
    run.raf = requestAnimationFrame(frame);
    emit('play:start', { id: a.id, boat: host.boat });
  };
  leave.play = function () { stopRun(); if (UI().setCoach) UI().setCoach('jesper'); };
  leave.results = function () { doc.body.classList.remove('mode-sea', 'mode-dom', 'results-over-sea'); };

  // Quality tiers (KOS.Perf.level) - ONE place decides how much decoration the renderers draw:
  //   3 full | 2 no ambient extras (sparkles, flag flutter, shore-foam motion, whitecap layer, hub ambience)
  //   1 lighter (no 2nd wave layer, half the wind streaks, thinner spray, canvas DPR <= 1.5) | 0 minimal (DPR 1.15, 1 wave layer)
  // Gameplay information (marks, boats, wind arrow, laylines, labels, HUD, controls) is never dropped. See docs/ARCHITECTURE.md.
  // Start tier: #perf=0..3 forces one (no governor, nothing remembered); else the tier remembered for this device
  // (Storage 'perfTier'); else a guess: iPhone/iPad/Safari and small touch screens start at 2, everything else at 3.
  // Then the governor measures: median/p95 of a rolling window of frame times steps DOWN fast (2 bad windows, ~1 s) and UP
  // slowly (20 s of good windows, never within 60 s of a drop, never above a tier that dropped twice this session).
  // Settings: lowFx=true caps the tier at 1.
  const Perf = KOS.Perf = KOS.Perf || { level: 3 };
  Object.assign(Perf, { buf: [], bad: 0, goodT: 0, holdUntil: 0, ceiling: 3, downs: {}, forced: null, ema: 16.7 });
  Perf.cap = function () { try { return S().settings().lowFx === true ? 1 : 3; } catch (e) { return 3; } };
  Perf.init = function () {
    let m = null; try { m = /[#&]perf=([0-3])/.exec(root.location.hash || ''); } catch (e) { /* no location */ }
    if (m) { Perf.forced = +m[1]; Perf.level = Perf.forced; Perf.mark(); return; }
    let guess = 3;
    try {
      const n = root.navigator, small = Math.min(root.innerWidth, root.innerHeight) < 600 && root.matchMedia('(pointer: coarse)').matches;
      if (/iPhone|iPad|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1) || 'GestureEvent' in root || small) guess = 2;
    } catch (e) { /* keep 3 */ }
    Perf.guess = guess;
    let lvl = guess;
    try { const v = S().get('perfTier', null); if (v && v.level >= 0 && v.level <= 3) lvl = v.level | 0; } catch (e) { /* none */ }
    Perf.level = Math.min(lvl, Perf.cap()); Perf.mark();
  };
  // html[data-tier] lets CSS drop cosmetic work too (frosted-glass blur over the sea canvas below tier 3, see css/game.css)
  Perf.mark = function () { try { doc.documentElement.setAttribute('data-tier', String(Perf.level)); } catch (e) { /* ignore */ } };
  Perf.reset = function () { Perf.buf.length = 0; Perf.bad = 0; Perf.goodT = 0; if (Perf.forced === null) Perf.level = Math.min(Perf.level, Perf.cap()); Perf.mark(); };
  Perf.set = function (lvl, why) {
    if (lvl === Perf.level) return;
    Perf.level = lvl; Perf.buf.length = 0; Perf.bad = 0; Perf.goodT = 0; Perf.why = why; Perf.mark();
    try { S().set('perfTier', { level: lvl, at: Date.now() }); } catch (e) { /* ignore */ }
    emit('perf:tier', { level: lvl, why });
  };
  Perf.init();
  function govern(ms) {
    if (Perf.forced !== null || !(ms > 0) || ms > 250) return; // forced tier; tab switches / breakpoints
    const buf = Perf.buf; if (!buf.length) Perf.winT = 0; buf.push(ms); Perf.winT += ms;
    if (buf.length < 45 && !(Perf.winT >= 900 && buf.length >= 5)) return; // a window = 45 frames, or ~1 s on a slow device
    const s = buf.slice().sort((x, y) => x - y), med = s[s.length >> 1], p95 = s[Math.floor(s.length * 0.95)];
    Perf.ema = med; Perf.med = med; Perf.p95 = p95;
    const t = performance.now(), age = t - run.startT; buf.length = 0;
    if (age < 2500) return;
    // a steady ~33 ms clock with little jitter is a 30 fps cap (iOS Low Power Mode, Android battery saver), not a struggling
    // device: 30 fps is then the target, and only frames clearly worse than the cap (median > 45 ms or p95 > 70 ms) count as bad
    const capped = Math.abs(med - 33.3) <= 3 && p95 - med <= 6;
    Perf.capped = capped;
    const bad = capped ? false : (med > 21 || p95 > 45);
    if (bad) {
      Perf.goodT = 0;
      if (++Perf.bad >= 2 && Perf.level > 0) {
        Perf.downs[Perf.level] = (Perf.downs[Perf.level] || 0) + 1;
        if (Perf.downs[Perf.level] >= 2) Perf.ceiling = Math.min(Perf.ceiling, Perf.level - 1);
        Perf.holdUntil = t + 60000; Perf.set(Perf.level - 1, 'slow');
      }
    } else {
      Perf.bad = 0;
      if (med < 17.9 && p95 < 24) {
        Perf.goodT += Perf.winT;
        if (Perf.goodT > 20000 && t > Perf.holdUntil && Perf.level < Math.min(Perf.ceiling, Perf.cap())) Perf.set(Perf.level + 1, 'headroom');
      } else Perf.goodT = 0;
    }
  }

  function frame(now) {
    if (!run.running) return;
    run.raf = requestAnimationFrame(frame);
    if (run.paused) { run.last = now; return; }
    let dt = (now - run.last) / 1000;
    run.last = now;
    if (!(dt > 0)) dt = 0;
    govern(dt * 1000);
    run.acc += Math.min(dt, 0.25);
    const step = DT();
    let n = 0;
    try {
      while (run.acc >= step && n < 15) {
        run.inst.update(step);
        run.acc -= step;
        n++;
        if (!run.running || run.paused) break;
      }
      if (run.running && run.inst && run.inst.render) run.inst.render(Math.min(1, run.acc / step));
      if (run.tiltSync) run.tiltSync();
    } catch (e) { crash(e); }
  }

  function crash(e) {
    if (run.failed) return;
    run.failed = true;
    console.error('[KOS] mode crashed:', e);
    stopRun();
    UI().dialog({
      titleKey: 'app.crash.title', icon: 'wrench', body: '<p>' + esc(t('app.crash.body')) + '</p>',
      buttons: [{ labelKey: 'common.back', kind: 'primary', onClick: () => App.show('hub', {}, { replace: true }) }],
      dismissable: false,
    });
  }

  function stopRun() {
    run.running = false;
    if (run.viewOff) { run.viewOff(); run.viewOff = null; }
    cancelAnimationFrame(run.raf);
    if (run.inst) { const inst = run.inst; run.inst = null; try { inst.destroy && inst.destroy(); } catch (e) { console.error(e); } }
    hidePause();
    run.paused = false;
    audio('engine', null);
    if (KOS.UI) { const c = doc.querySelector('.coach'); if (c) c.remove(); doc.querySelectorAll('.countdown').forEach(n => n.remove()); }
    const layer = doc.getElementById('play-layer');
    if (layer) layer.innerHTML = '';
  }

  function sizeCanvas(canvas) {
    if (!canvas) return;
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(root.innerWidth * dpr)), h = Math.max(1, Math.round(root.innerHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  function setPaused(b) {
    if (!run.running || run.finished) return;
    if (run.menuOpen && run.menuClose) { run.menuClose(); if (!b) return; } // the ⋯ menu pauses silently; P / Esc closes it
    if (b === run.paused) return;
    run.paused = b;
    if (b) {
      try { run.inst && run.inst.pause && run.inst.pause(); } catch (e) { console.error(e); }
      if (UI().coachClose) UI().coachClose();
      showPause();
      audio('engine', null);
    } else {
      hidePause();
      run.last = performance.now();
      try { run.inst && run.inst.resume && run.inst.resume(); } catch (e) { console.error(e); }
    }
    emit('play:pause', b);
  }
  App.setPaused = setPaused;

  function showPause() {
    hidePause();
    const sec = screenEl('play');
    const st = settings();
    const o = doc.createElement('div');
    o.className = 'pause-overlay';
    o.innerHTML = '<div class="pause-card glass" role="dialog" aria-modal="true">' +
      '<div class="pause-coach">' + UI().coachSvg() + '</div>' +
      '<h2>' + esc(t('app.pause.title')) + '</h2>' +
      '<p class="pause-act">' + esc(tt(run.act.title)) + '</p>' +
      '<button type="button" class="btn btn-primary btn-wide" data-p="resume">' + ico('play') + '<span>' + esc(t('common.resume')) + '</span></button>' +
      '<button type="button" class="btn btn-glass btn-wide" data-p="restart">' + ico('retry') + '<span>' + esc(t('common.restart')) + '</span></button>' +
      (S().god() ? '<div class="pause-row god-row"><span class="god-pill">GOD</span>' +
        [1, 2, 3].map(n => '<button type="button" class="btn btn-glass" data-p="win' + n + '">' + n + ' ★</button>').join('') + '</div>' : '') +
      '<div class="pause-row">' +
      '<button type="button" class="icon-btn" data-p="sound" aria-label="' + esc(t('app.settings.sound')) + '">' + ico(st.sound ? 'sound' : 'soundOff') + '</button>' +
      '<button type="button" class="btn btn-glass" data-p="quit">' + ico('map') + '<span>' + esc(t('app.pause.quit')) + '</span></button>' +
      '</div>' +
      '<p class="pause-tip">' + ico('info') + esc(t('app.pause.tip' + (1 + Math.floor(Math.random() * 6)))) + '</p>' +
      '</div>';
    o.addEventListener('click', e => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      sfx('click');
      const k = b.getAttribute('data-p');
      if (k === 'resume') setPaused(false);
      else if (k === 'restart') App.play(run.act.id, { force: true, boat: run.boatPick });
      else if (k === 'quit') quit();
      else if (k.indexOf('win') === 0) { const n = +k.slice(3); setPaused(false); finish({ stars: n, success: true, score: n * 1000, timeMs: 60000, stats: { godmode: true } }); }
      else if (k === 'sound') {
        const s = S().saveSettings({ sound: !settings().sound });
        applySettings(s);
        b.innerHTML = ico(s.sound ? 'sound' : 'soundOff');
      }
    });
    sec.appendChild(o);
    run.pauseEl = o;
    run.pauseRelease = UI().trapFocus ? UI().trapFocus(o.querySelector('.pause-card'), [doc.getElementById('play-layer')]) : null;
    requestAnimationFrame(() => o.classList.add('in'));
    setTimeout(() => { const r = o.querySelector('[data-p=resume]'); if (r) try { r.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
  }
  function hidePause() {
    if (run.pauseRelease) { run.pauseRelease(); run.pauseRelease = null; }
    if (run.pauseEl) { run.pauseEl.remove(); run.pauseEl = null; }
  }

  function quit() {
    const a = run.act;
    stopRun();
    doc.body.classList.remove('mode-sea', 'mode-dom');
    if (a) App.show('area', { area: a.area }, { replace: true });
    else App.show('hub', {}, { replace: true });
  }

  function finish(result) {
    if (run.finished || !run.act) return;
    run.finished = true;
    result = result || {};
    const a = run.act;
    let rec = {};
    try { rec = S().record(a.id, result); } catch (e) { console.error(e); }
    // badges: the ones a mode awarded during play + milestones checked now
    let newBadges = (run.playBadges || []).slice();
    try { newBadges = newBadges.concat(evalBadges(a, result)); } catch (e) { console.error(e); }
    newBadges = newBadges.filter((id, i) => newBadges.indexOf(id) === i);
    run.playBadges = [];
    if (UI().coachClose) UI().coachClose();
    run.running = false;
    cancelAnimationFrame(run.raf);
    setTimeout(() => {
      stopRun();
      run.lastResult = { result, rec, activity: a, newBadges, capsized: run.capsized };
      App.show('results', { id: a.id }, { replace: true });
    }, 650);
    emit('play:finish', { id: a.id, result, rec });
  }

  // ================================================================== RESULTS
  renderers.results = function (sec) {
    const lr = run.lastResult;
    if (!lr) { App.show('hub', {}, { replace: true }); return; }
    const a = lr.activity;
    // Næste: the next activity in this area that is already open (skip ones still locked behind stars or a
    // later boat); if none is open, keep the locked button and say what it takes
    const later = (() => { const list = KOS.Activities.byArea(a.area), i = list.indexOf(a); return i >= 0 ? list.slice(i + 1) : []; })();
    const next = later.find(x => KOS.Activities.isUnlocked(x.id)) || later[0] || null;
    const nextUnlocked = !!next && KOS.Activities.isUnlocked(next.id);
    const card = UI().results(lr.result, a, { record: lr.rec, next, nextUnlocked, capsized: !!lr.capsized });
    sec.innerHTML = '<div class="scroll center"></div>';
    sec.firstChild.appendChild(card);
    if (next && !nextUnlocked) card.querySelector('.results-buttons').insertAdjacentHTML('afterend', '<p class="results-locknote">' + ico('lock') + '<span>' + esc(tt(next.title)) + ': ' + esc(lockText(next.id)) + '</span></p>');
    const win = lr.result.success !== false && (+lr.result.stars || 0) > 0;
    if (lr.rec && lr.rec.starsGained) {
      card.insertAdjacentHTML('afterbegin', '<div class="results-gain">' + ico('star') + '+' + lr.rec.starsGained + '</div>');
    }
    setTimeout(() => {
      if (win) { sfx('win'); UI().confetti(); setTimeout(() => sfx('cheer', { vol: 0.6 }), 300); } else sfx('lose');
    }, 200);
    const nb = (lr.newBadges || []).map(id => BADGES.find(x => x.id === id)).filter(Boolean);
    if (nb.length) {
      const strip = doc.createElement('div');
      strip.className = 'results-badges';
      strip.innerHTML = '<span class="rb-label">' + esc(t(nb.length > 1 ? 'app.badge.newMany' : 'app.badge.newOne')) + '</span>' +
        nb.map((b, i) => '<button type="button" class="rb-medal" data-badge="' + esc(b.id) + '" style="--i:' + i + '" title="' + esc(tt(b.name)) + '"><span class="badge-medal">' + ico(b.icon) + '</span><b>' + esc(tt(b.name)) + '</b></button>').join('');
      const btns = card.querySelector('.results-buttons');
      card.insertBefore(strip, btns);
      strip.addEventListener('click', e => {
        const m = e.target.closest('[data-badge]');
        if (!m) return;
        const b = BADGES.find(x => x.id === m.getAttribute('data-badge'));
        if (b) { sfx('click'); UI().dialog({ title: tt(b.name), icon: b.icon, body: '<p>' + esc(tt(b.desc)) + '</p><p class="good-txt">' + esc(t('app.badge.have')) + '</p>' }); }
      });
    }
    nb.forEach((b, i) => {
      setTimeout(() => {
        if (App.cur !== 'results') return;
        const m = sec.querySelector('.rb-medal[data-badge="' + b.id + '"]');
        if (m) m.classList.add('in');
        sfx('coin', { pitch: 1 + i * 0.1 }); setTimeout(() => sfx('star', { pitch: 1.3 }), 120);
      }, 1600 + i * 900);
    });
    // boats unlocked by this result
    if (lr.rec && lr.rec.starsGained && !settings().unlockAll) {
      const before = S().totalStars() - lr.rec.starsGained;
      boatList().forEach((bt, i) => {
        const need = BOAT_STARS[bt.id] || 0;
        if (need > 0 && before < need && S().totalStars() >= need) {
          setTimeout(() => { sfx('coin'); UI().toast(t('app.garage.unlockedToast', { name: bt.name }), { kind: 'good', icon: 'boat', ms: 4200 }); }, 2400 + i * 300);
        }
      });
    }
    lr.shown = true;
    bind(sec, {
      retry: () => { sfx('click'); App.play(a.id, { force: true, boat: run.boatPick }); },
      next: () => { sfx('click'); if (next) App.play(next.id); },
      map: () => { sfx('click'); App.stack = App.stack.filter(s => s.screen === 'title'); App.show('hub', {}, { replace: true }); },
    });
  };

  // ================================================================== SETTINGS
  renderers.settings = function (sec) {
    const s = settings();
    // lowFx is null = automatic; show what the hub will actually do
    try { if (s.lowFx !== true && s.lowFx !== false) s.lowFx = !!(KOS.Hub && KOS.Hub.lite && KOS.Hub.lite.effective()); } catch (e) { s.lowFx = false; }
    const seg = (key, opts) => '<div class="seg" role="radiogroup">' + opts.map(o =>
      '<button type="button" role="radio" aria-checked="' + (s[key] === o.v) + '" class="' + (s[key] === o.v ? 'on' : '') + '" data-act="set" data-k="' + key + '" data-v="' + o.v + '">' +
      (o.icon ? ico(o.icon) : '') + '<span>' + esc(o.label) + '</span></button>').join('') + '</div>';
    const sw = (key, label, icon) => '<div class="set-row"><span class="set-ico">' + ico(icon) + '</span><span class="set-label">' + esc(label) + '</span>' +
      '<button type="button" class="switch' + (s[key] ? ' on' : '') + '" role="switch" aria-checked="' + !!s[key] + '" aria-label="' + esc(label) + '" data-act="toggle" data-k="' + key + '"><i></i></button></div>';
    sec.innerHTML = header(t('app.settings.title'), '', '') +
      '<div class="scroll"><div class="panel-col">' +
      '<section class="panel glass"><h2>' + ico('globe') + esc(t('app.settings.lang')) + '</h2>' +
      seg('lang', [{ v: 'da', label: 'Dansk' }, { v: 'en', label: 'English' }]) + '</section>' +
      '<section class="panel glass"><h2>' + ico('sound') + esc(t('app.settings.audio')) + '</h2>' +
      sw('sound', t('app.settings.sound'), 'sound') + sw('music', t('app.settings.music'), 'music') +
      '<div class="set-row"><span class="set-ico">' + ico('gauge') + '</span><span class="set-label">' + esc(t('app.settings.volume')) + '</span>' +
      '<input type="range" class="range" min="0" max="100" step="5" value="' + Math.round(s.volume * 100) + '" data-k="volume" aria-label="' + esc(t('app.settings.volume')) + '"></div></section>' +
      '<section class="panel glass"><h2>' + ico('wind') + esc(t('app.settings.windUnit')) + '</h2>' +
      seg('windUnit', [{ v: 'ms', label: t('app.windUnit.ms') }, { v: 'kn', label: t('app.windUnit.kn') }]) + '</section>' +
      '<section class="panel glass"><h2>' + ico('sail') + esc(t('app.settings.assist')) + '</h2>' +
      seg('assist', [{ v: 'easy', label: t('app.assist.easy') }, { v: 'normal', label: t('app.assist.normal') }, { v: 'pro', label: t('app.assist.pro') }]) +
      '<p class="set-help">' + esc(t('app.assist.' + s.assist + 'Help')) + '</p></section>' +
      '<section class="panel glass"><h2>' + ico('joystick') + esc(t('app.settings.controls')) + '</h2>' +
      seg('controls', [{ v: 'auto', label: t('app.controls.auto'), icon: 'sparkle' }, { v: 'tiller', label: t('app.controls.tiller'), icon: 'sail' }, { v: 'buttons', label: t('app.controls.buttons'), icon: 'buttons' }, { v: 'joystick', label: t('app.controls.joystick'), icon: 'joystick' }]) +
      '<p class="set-help">' + esc(t('app.controls.help')) + '</p>' +
      sw('reducedMotion', t('app.settings.reducedMotion'), 'motion') + sw('lowFx', t('app.settings.lowFx'), 'gauge') + '</section>' +
      '<section class="panel glass"><h2>' + ico('tilt') + esc(t('app.settings.tilt')) + '</h2>' +
      seg('tilt', [{ v: 'auto', label: t('app.tilt.auto'), icon: 'sparkle' }, { v: 'on', label: t('app.tilt.on'), icon: 'tilt' }, { v: 'off', label: t('app.tilt.off'), icon: 'map' }]) +
      '<p class="set-help">' + esc(t('app.tilt.help')) + '</p></section>' +
      '<section class="panel glass panel-coach"><h2>' + ico('whistle') + esc(t('app.settings.coach')) + '</h2>' +
      '<p class="set-help">' + esc(t('app.settings.coachHelp')) + '</p>' +
      '<div class="set-row"><span class="set-ico">' + ico(s.unlockAll ? 'unlock' : 'lock') + '</span><span class="set-label">' + esc(t('app.settings.unlockAll')) + '</span>' +
      '<span class="switch static' + (s.unlockAll ? ' on' : '') + '" aria-hidden="true"><i></i></span></div>' +
      '<button type="button" class="btn btn-glass btn-wide hold-btn" data-hold="unlock"><span class="hold-fill"></span>' + ico('hand') + '<span>' + esc(t('app.settings.hold')) + '</span></button>' +
      '<button type="button" class="btn btn-danger btn-wide" data-act="reset">' + ico('trash') + '<span>' + esc(t('app.settings.reset')) + '</span></button></section>' +
      '<section class="panel glass panel-links">' +
      (canInstall() ? '<button type="button" class="btn btn-primary btn-wide" data-act="install">' + ico('download') + '<span>' + esc(t('app.install')) + '</span></button>' : '') +
      '<button type="button" class="btn btn-glass btn-wide" data-act="credits">' + ico('heart') + '<span>' + esc(t('app.credits.title')) + '</span></button>' +
      KOS.Feedback.html(esc, ico) +
      '<p class="version" title="' + esc(App.version || '') + '">KØS SEJL · ' + esc(KOS.Feedback.versionText()) + '</p></section>' +
      '</div></div>';
    KOS.Feedback.bind(sec);
    const save = patch => { const ns = S().saveSettings(patch); applySettings(ns); return ns; };
    bind(sec, {
      back: () => { sfx('click'); App.back(); },
      set: b => {
        const k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
        sfx('tap');
        save({ [k]: v });
        App.refresh();
      },
      toggle: b => {
        const k = b.getAttribute('data-k');
        let cur = !!settings()[k];
        if (k === 'lowFx') { try { cur = !!KOS.Hub.lite.effective(); if (cur) KOS.Hub.lite.forget(); } catch (e) { /* ignore */ } } // automatic -> what it does now
        const ns = save({ [k]: !cur });
        sfx('tap');
        b.classList.toggle('on', !!ns[k]);
        b.setAttribute('aria-checked', String(!!ns[k]));
      },
      reset: () => {
        UI().dialog({
          titleKey: 'app.settings.resetTitle', icon: 'trash', body: '<p>' + esc(t('app.settings.resetBody')) + '</p>',
          buttons: [{ labelKey: 'common.cancel' }, { labelKey: 'app.settings.resetYes', kind: 'danger', onClick: () => { S().reset(false); UI().toast(t('app.settings.resetDone'), { kind: 'info' }); App.refresh(); } }],
        });
      },
      credits: () => { sfx('click'); App.show('credits'); },
      install: () => App.install(),
    });
    const range = sec.querySelector('.range');
    range.addEventListener('input', () => { const v = +range.value / 100; audio('setVolume', v); range.style.setProperty('--v', range.value + '%'); });
    range.addEventListener('change', () => { save({ volume: +range.value / 100 }); sfx('tap'); });
    range.style.setProperty('--v', range.value + '%');
    // parent gate: hold for 3 s
    const hold = sec.querySelector('.hold-btn');
    let ht = null, t0 = 0, hr = 0;
    const fill = hold.querySelector('.hold-fill');
    const stop = () => { clearTimeout(ht); cancelAnimationFrame(hr); fill.style.width = '0%'; hold.classList.remove('holding'); };
    hold.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { hold.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      t0 = performance.now();
      hold.classList.add('holding');
      (function anim() { fill.style.width = Math.min(100, (performance.now() - t0) / 30) + '%'; hr = requestAnimationFrame(anim); })();
      ht = setTimeout(() => {
        stop();
        const ns = save({ unlockAll: !settings().unlockAll });
        sfx(ns.unlockAll ? 'coin' : 'click');
        UI().toast(t(ns.unlockAll ? 'app.settings.unlockedAll' : 'app.settings.lockedAll'), { kind: ns.unlockAll ? 'good' : 'info', icon: ns.unlockAll ? 'unlock' : 'lock' });
        App.refresh();
      }, 3000);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => hold.addEventListener(ev, stop));
    hold.addEventListener('click', e => { e.preventDefault(); if (!hold.classList.contains('holding')) UI().toast(t('app.settings.holdHint'), { kind: 'info', icon: 'hand', sound: false }); });
  };

  // ================================================================== PROFILE
  const AGES = ['8-10', '11-13', '14-17', '18+'];
  const BOAT_COLORS = ['#ffffff', '#ff7a3d', '#ffb547', '#e8323c', '#18a957', '#49c6f2', '#2b6cb0', '#7b5cff', '#ff6f91', '#1d2433'];
  let draft = null;
  function randomAvatar() {
    const A = UI().AVATAR, pick = arr => arr[Math.floor(Math.random() * arr.length)];
    return { skin: pick(A.skin), hair: pick(A.hair.slice(0, 7)), jacket: pick(A.jacket), style: pick(A.styles) };
  }
  function boatTopSvg(color, sailNo) {
    const dark = UI().shade(color, -0.3);
    return '<svg class="boat-top" viewBox="0 0 120 200" aria-hidden="true">' +
      '<path d="M60 8c22 22 32 58 32 100 0 34-6 62-10 80H38c-4-18-10-46-10-80 0-42 10-78 32-100z" fill="' + color + '" stroke="' + dark + '" stroke-width="3"/>' +
      '<path d="M60 20c16 20 23 50 23 88 0 30-4 54-8 70H45c-4-16-8-40-8-70 0-38 7-68 23-88z" fill="rgba(255,255,255,.18)"/>' +
      '<circle cx="60" cy="74" r="5" fill="#c9ced8"/>' +
      '<path d="M60 74Q30 118 40 170L46 170Q42 120 60 74Z" fill="#fbfbf6" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/><path d="M60 74L44 170" stroke="#8a93a6" stroke-width="3" stroke-linecap="round"/>' +
      '<text x="60" y="140" font-size="18" font-weight="900" text-anchor="middle" fill="' + (isLight(color) ? '#1d2433' : '#ffffff') + '" font-family="system-ui,Segoe UI,sans-serif" transform="rotate(-90 60 140)">' + esc(sailNo || '') + '</text>' +
      '</svg>';
  }
  function isLight(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 160;
  }
  renderers.profile = function (sec, params) {
    const p = S().profile();
    if (!draft || params.fresh !== false) {
      draft = p ? JSON.parse(JSON.stringify(p)) : { name: '', age: '', avatar: randomAvatar(), sailNo: String(100 + Math.floor(Math.random() * 900)), boatColor: '#ff7a3d' };
      draft.avatar = Object.assign(randomAvatar(), draft.avatar || {});
      params.fresh = false;
    }
    const A = UI().AVATAR;
    const sw = (key, cols) => '<div class="swatches">' + cols.map(c => '<button type="button" class="swatch' + (draft.avatar[key] === c ? ' on' : '') + '" style="--c:' + c + '" data-act="av" data-k="' + key + '" data-v="' + c + '" aria-label="' + c + '"></button>').join('') + '</div>';
    sec.innerHTML = header(params.first ? t('app.profile.newTitle') : t('app.profile.title'), esc(t('app.profile.sub')), '') +
      '<div class="scroll"><div class="profile-wrap">' +
      '<div class="profile-preview glass">' +
      '<div class="pp-avatar">' + UI().avatarSvg(draft.avatar) + '</div>' +
      '<div class="pp-boat" style="--boat:' + draft.boatColor + '">' + boatTopSvg(draft.boatColor, draft.sailNo) + '</div>' +
      '<div class="pp-name">' + esc(draft.name || t('app.profile.namePh')) + '</div><div class="pp-sail">' + esc(sailNoText(draft)) + '</div>' +
      '<button type="button" class="btn btn-glass btn-sm" data-act="random">' + ico('dice') + '<span>' + esc(t('app.profile.random')) + '</span></button>' +
      '</div>' +
      '<div class="profile-form">' +
      '<section class="panel glass"><label class="field"><span>' + esc(t('app.profile.name')) + '</span>' +
      '<input type="text" class="input" id="pf-name" maxlength="16" autocomplete="off" value="' + esc(draft.name) + '" placeholder="' + esc(t('app.profile.namePh')) + '"></label>' +
      '<div class="field"><span>' + esc(t('app.profile.age')) + '</span><div class="chips">' +
      AGES.map(a => '<button type="button" class="chip' + (draft.age === a ? ' on' : '') + '" data-act="age" data-v="' + a + '">' + esc(t('app.profile.ageOpt', { a })) + '</button>').join('') +
      '</div></div></section>' +
      '<section class="panel glass"><h2>' + ico('user') + esc(t('app.profile.look')) + '</h2>' +
      '<div class="field"><span>' + esc(t('app.profile.style')) + '</span><div class="chips">' +
      A.styles.map(s => '<button type="button" class="chip' + (draft.avatar.style === s ? ' on' : '') + '" data-act="av" data-k="style" data-v="' + s + '">' + esc(t('app.profile.styles.' + s)) + '</button>').join('') + '</div></div>' +
      '<div class="field"><span>' + esc(t('app.profile.skin')) + '</span>' + sw('skin', A.skin) + '</div>' +
      '<div class="field"><span>' + esc(t('app.profile.hair')) + '</span>' + sw('hair', A.hair) + '</div>' +
      '<div class="field"><span>' + esc(t('app.profile.jacket')) + '</span>' + sw('jacket', A.jacket) + '</div></section>' +
      '<section class="panel glass"><h2>' + ico('boat') + esc(t('app.profile.boat')) + '</h2>' +
      '<label class="field"><span>' + esc(t('app.profile.sailNo')) + '</span><span class="sailno-input"><b>DEN</b>' +
      '<input type="text" class="input" id="pf-sail" inputmode="numeric" maxlength="5" autocomplete="off" value="' + esc(draft.sailNo) + '"></span></label>' +
      '<div class="field"><span>' + esc(t('app.profile.boatColor')) + '</span><div class="swatches">' +
      BOAT_COLORS.map(c => '<button type="button" class="swatch' + (draft.boatColor === c ? ' on' : '') + '" style="--c:' + c + '" data-act="bc" data-v="' + c + '" aria-label="' + c + '"></button>').join('') + '</div></div></section>' +
      '<button type="button" class="btn btn-primary btn-wide btn-big" data-act="save">' + ico('check') + '<span>' + esc(params.first ? t('app.profile.saveFirst') : t('common.save')) + '</span></button>' +
      '</div></div></div>';
    const upd = () => {
      sec.querySelector('.pp-avatar').innerHTML = UI().avatarSvg(draft.avatar);
      sec.querySelector('.pp-boat').innerHTML = boatTopSvg(draft.boatColor, draft.sailNo);
      sec.querySelector('.pp-name').textContent = draft.name || t('app.profile.namePh');
      sec.querySelector('.pp-sail').textContent = sailNoText(draft);
      sec.querySelector('.pp-avatar').classList.remove('wiggle'); void sec.offsetWidth; sec.querySelector('.pp-avatar').classList.add('wiggle');
    };
    const mark = (b, group) => { sec.querySelectorAll(group).forEach(x => x.classList.toggle('on', x === b)); };
    const nameIn = sec.querySelector('#pf-name'), sailIn = sec.querySelector('#pf-sail');
    nameIn.addEventListener('input', () => { draft.name = nameIn.value.replace(/[<>]/g, '').slice(0, 16); upd(); });
    sailIn.addEventListener('input', () => { sailIn.value = sailIn.value.replace(/\D/g, '').slice(0, 5); draft.sailNo = sailIn.value; upd(); });
    bind(sec, {
      back: () => { sfx('click'); App.back(); },
      av: b => { sfx('tap'); const k = b.getAttribute('data-k'); draft.avatar[k] = b.getAttribute('data-v'); mark(b, '[data-act=av][data-k=' + k + ']'); upd(); },
      bc: b => { sfx('tap'); draft.boatColor = b.getAttribute('data-v'); mark(b, '[data-act=bc]'); upd(); },
      age: b => { sfx('tap'); draft.age = b.getAttribute('data-v'); mark(b, '[data-act=age]'); },
      random: () => {
        sfx('pop');
        draft.avatar = randomAvatar();
        draft.boatColor = BOAT_COLORS[Math.floor(Math.random() * BOAT_COLORS.length)];
        App.show('profile', Object.assign({}, params, { fresh: false }), { replace: true, keepScroll: true });
      },
      save: () => {
        const name = (draft.name || '').trim();
        if (!name) { sfx('bump'); nameIn.focus(); nameIn.classList.remove('shake'); void nameIn.offsetWidth; nameIn.classList.add('shake'); UI().toast(t('app.profile.needName'), { kind: 'warn', icon: 'edit' }); return; }
        const isNew = !S().profile();
        S().saveProfile({ name, age: draft.age || '', avatar: draft.avatar, sailNo: draft.sailNo || '', boatColor: draft.boatColor });
        if (isNew) { S().saveSettings({ assist: 'easy' }); track('Onboarding', 'profile-created'); }
        sfx('coin');
        draft = null;
        if (params.first || isNew) {
          App.stack = [{ screen: 'title', params: {} }];
          App.show('hub', {}, { replace: true });
          if (isNew) setTimeout(() => { if (App.cur === 'hub') onboard(name); }, 650);
          else setTimeout(() => UI().coach(t('app.coach.welcome', { name }), { ms: 7000, pos: 'bottom', coach: 'jesper' }), 500);
        } else {
          UI().toast(t('app.profile.saved'), { kind: 'good' });
          App.back();
        }
      },
    });
  };
  leave.profile = function () { draft = null; };

  // ================================================================== GARAGE / SEJLERPAS
  renderers.garage = function (sec) {
    const p = S().profile() || {};
    const total = S().totalStars();
    const xp = S().xp(), r = rankOf(xp);
    const owned = S().badges();
    const fav = S().get('boat', 'opti');
    const boats = boatList();
    sec.innerHTML = header(t('app.garage.title'), esc(t('app.garage.sub')), starPill()) +
      '<div class="scroll"><div class="garage-wrap">' +
      '<section class="passport glass">' +
      '<div class="pass-stamp">' + ico('anchor') + '<span>KØS</span></div>' +
      '<div class="pass-avatar">' + UI().avatarSvg(p.avatar) + '</div>' +
      '<div class="pass-info"><div class="pass-label">' + esc(t('app.garage.passport')) + '</div>' +
      '<div class="pass-name">' + esc(p.name || t('app.garage.noName')) + '</div>' +
      '<div class="pass-sail">' + esc(sailNoText(p)) + '</div>' +
      '<div class="pass-rank"><span class="lvl">' + r.level + '</span><b>' + esc(t(r.key)) + '</b><span class="pill-dim">' + xp.toLocaleString(KOS.I18n.lang === 'en' ? 'en-GB' : 'da-DK') + ' XP</span></div>' +
      '<div class="xpbar big"><i style="width:' + Math.round(r.frac * 100) + '%"></i></div>' +
      (r.toNext ? '<small class="pass-next">' + esc(t('app.garage.toNext', { n: r.toNext })) + '</small>' : '') +
      '</div></section>' +
      '<h2 class="sec-title">' + ico('boat') + esc(t('app.garage.boats')) + '</h2>' +
      '<div class="grid boat-grid">' +
      boats.map((b, i) => {
        const need = BOAT_STARS[b.id] || 0;
        const un = boatUnlocked(b.id);
        const frac = need ? Math.min(1, total / need) : 1;
        return '<button type="button" class="card boat-card' + (un ? '' : ' locked') + (fav === b.id ? ' fav' : '') + '" data-act="boat" data-id="' + esc(b.id) + '" style="--i:' + i + '">' +
          '<span class="bc-art">' + boatCardSvg(b.id) + '</span>' +
          '<span class="bc-name">' + esc(b.name) + (fav === b.id ? '<span class="fav-tag">' + ico('heart') + '</span>' : '') + '</span>' +
          '<span class="bc-meta">' + ico('user') + (b.crew || 1) + (b.length ? ' · ' + (+b.length).toFixed(1).replace('.', KOS.I18n.lang === 'da' ? ',' : '.') + ' m' : '') + '</span>' +
          (un ? '<span class="bc-ok">' + ico('check') + esc(t('common.unlocked')) + '</span>' :
            '<span class="bc-lock">' + ico('lock') + '<b>' + total + '/' + need + '</b>' + ico('star', 'tiny-star') + '</span><span class="bc-bar"><i style="width:' + Math.round(frac * 100) + '%"></i></span>') +
          '</button>';
      }).join('') + '</div>' +
      '<h2 class="sec-title">' + ico('medal') + esc(t('app.garage.badges')) + ' <span class="pill-dim">' + BADGES.filter(b => owned.indexOf(b.id) >= 0).length + '/' + BADGES.length + '</span></h2>' +
      '<div class="grid badge-grid">' +
      BADGES.map((b, i) => {
        const has = owned.indexOf(b.id) >= 0;
        return '<button type="button" class="badge' + (has ? ' has' : '') + '" data-act="badge" data-id="' + esc(b.id) + '" style="--i:' + i + '"><span class="badge-medal">' + ico(has ? b.icon : 'lock') + '</span><span class="badge-name">' + esc(tt(b.name)) + '</span></button>';
      }).join('') + '</div>' +
      '</div></div>';
    bind(sec, {
      back: () => { sfx('click'); App.back(); },
      boat: btn => { sfx('click'); boatDialog(btn.getAttribute('data-id')); },
      badge: btn => {
        sfx('click');
        const b = BADGES.find(x => x.id === btn.getAttribute('data-id'));
        const has = owned.indexOf(b.id) >= 0;
        UI().dialog({ title: tt(b.name), icon: has ? b.icon : 'lock', body: '<p>' + esc(tt(b.desc)) + '</p>' + (has ? '<p class="good-txt">' + esc(t('app.badge.have')) + '</p>' : '<p class="dim">' + esc(t('app.badge.locked')) + '</p>') });
      },
    });
  };
  function boatDialog(id) {
    const b = boatGet(id);
    if (!b) return;
    const un = boatUnlocked(id);
    const need = BOAT_STARS[id] || 0;
    const bar = (label, v) => '<div class="stat-row"><span>' + esc(label) + '</span><span class="stat-bar"><i style="width:' + Math.round(Math.max(0.08, Math.min(1, v)) * 100) + '%"></i></span></div>';
    const maxKn = b.maxKn || (b.motor && b.motor.maxKn) || 6;
    const stab = b.keel ? 1 : b.canCapsize === false ? 0.95 : b.capsizeHeel ? Math.min(1, b.capsizeHeel / 1.0) : 0.5;
    const body = '<div class="boat-dialog-art">' + boatCardSvg(id) + '</div>' +
      (b.desc ? '<p>' + esc(tt(b.desc)) + '</p>' : '') +
      (b.ageHint ? '<p class="dim">' + ico('user') + ' ' + esc(tt(b.ageHint)) + '</p>' : '') +
      '<div class="stats">' + bar(t('app.garage.statSpeed'), maxKn / 22) + bar(t('app.garage.statStab'), stab) + bar(t('app.garage.statCrew'), (b.crew || 1) / 4) + '</div>' +
      (un ? '' : '<p class="lock-txt">' + ico('lock') + ' ' + esc(t('app.garage.needStars', { n: need, have: S().totalStars() })) + '</p>');
    UI().dialog({
      title: b.name, body, cls: 'boat-dialog',
      buttons: un ? [{ labelKey: 'common.close' }, { labelKey: 'app.garage.choose', kind: 'primary', icon: 'heart', onClick: () => { S().set('boat', id); track('Boat', 'chosen', id); sfx('coin'); UI().toast(t('app.garage.chosen', { name: b.name }), { kind: 'good', icon: 'boat' }); App.refresh(); } }]
        : [{ labelKey: 'common.close', kind: 'primary' }],
    });
  }

  // ================================================================== CREDITS
  renderers.credits = function (sec) {
    sec.innerHTML = header(t('app.credits.title'), '', '') +
      '<div class="scroll"><div class="panel-col credits">' +
      '<div class="credits-logo">' + logoSvg() + '</div>' +
      '<section class="panel glass"><p class="lead">' + esc(t('app.credits.lead')) + '</p>' +
      '<p class="credit-author">' + esc(t('app.credits.idea')) + '</p><p class="credit-volunteer">' + esc(t('app.credits.volunteer')) + '</p></section>' +
      '<section class="panel glass"><h2>' + ico('heart') + esc(t('app.credits.made')) + '</h2>' +
      '<ul class="credit-list"><li><b>' + esc(t('app.credits.club')) + '</b><span><a class="credit-link" href="https://kossejlsport.dk" target="_blank" rel="noopener">KØS Sejlsport</a> · Svaneknoppen</span></li>' +
      '<li><b>' + esc(t('app.credits.code')) + '</b><span>' + esc(t('app.credits.codeWho')) + '</span></li>' +
      '<li><b>' + esc(t('app.credits.thanks')) + '</b><span>' + esc(t('app.credits.thanksWho')) + '</span></li></ul></section>' +
      '<section class="panel glass">' + KOS.Feedback.html(esc, ico) + '</section>' +
      '<section class="panel glass safety"><h2>' + ico('life') + esc(t('app.credits.safetyTitle')) + '</h2><p>' + esc(t('app.credits.safety')) + '</p></section>' +
      '<div class="coach-inline">' + UI().coachSvg(null, 'jesper') + '<p>' + esc(t('app.credits.coach')) + '</p></div>' +
      '<p class="version" title="' + esc(App.version || '') + '">KØS SEJL · ' + esc(KOS.Feedback.versionText()) + '</p>' +
      '</div></div>';
    KOS.Feedback.bind(sec);
    bind(sec, { back: () => { sfx('click'); App.back(); } });
  };

  // ------------------------------------------------------------------ settings application
  function applySettings(s) {
    s = s || settings();
    if (KOS.I18n && KOS.I18n.lang !== s.lang) KOS.I18n.setLang(s.lang);
    if (KOS.U && KOS.U.setWindUnit) KOS.U.setWindUnit(s.windUnit);
    doc.documentElement.classList.toggle('reduce-motion', !!s.reducedMotion);
    audio('setVolume', s.volume);
    audio('mute', !s.sound);
    if (App.cur && App.cur !== 'play') audio('music', s.music ? 'menu' : null);
  }
  App.applySettings = applySettings;

  // ------------------------------------------------------------------ PWA
  // iPhone/iPad never fire beforeinstallprompt: there the install button opens a "Sådan installerer du" guide instead
  // (Share → Føj til hjemmeskærm). iPadOS reports itself as a Mac, so a Mac with touch counts too. Hidden once installed.
  function iosNeedsGuide() {
    try {
      const nav = root.navigator || {};
      const ios = /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
      const standalone = nav.standalone === true || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
      return ios && !standalone;
    } catch (e) { return false; }
  }
  function canInstall() { return !!App.installPrompt || iosNeedsGuide(); }
  function iosGuide() {
    track('Install', 'ios-guide');
    const SHARE = '<svg class="ios-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9H6v12h12V9h-2M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ADD = '<svg class="ios-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const step = (n, key, icon) => '<li><span class="ob-n">' + n + '</span>' + (icon || '') + '<span>' + esc(t(key)) + '</span></li>';
    UI().dialog({
      title: t('app.ios.title'), icon: 'download', cls: 'ios-install-dialog',
      body: '<p class="ob-lead">' + esc(t('app.ios.lead')) + '</p><ol class="ob-steps">' + step(1, 'app.ios.s1', SHARE) + step(2, 'app.ios.s2', ADD) + step(3, 'app.ios.s3', ico('check')) + '</ol>' +
        '<p class="dim">' + esc(t('app.ios.note')) + '</p>',
      buttons: [{ labelKey: 'app.ios.ok', kind: 'primary' }],
    });
  }
  App.install = function () {
    const ev = App.installPrompt;
    if (!ev) { if (iosNeedsGuide()) iosGuide(); return; }
    App.installPrompt = null;
    try {
      ev.prompt();
      if (ev.userChoice) ev.userChoice.then(c => { track('Install', c && c.outcome === 'accepted' ? 'accepted' : 'dismissed'); if (c && c.outcome === 'accepted') UI().toast(t('app.installed'), { kind: 'good', icon: 'download' }); }).catch(() => {});
    } catch (e) { /* ignore */ }
    App.refresh();
  };
  function setupPwa() {
    root.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      App.installPrompt = e;
      track('Install', 'offered');
      // add the install button in place: a full refresh would replay the title's logo animation
      if (doc.querySelector('[data-act="install"]')) return;
      const lbl = esc(t('app.install'));
      const top = App.cur === 'title' && doc.querySelector('#screen-title .topbar-right');
      if (top) top.insertAdjacentHTML('afterbegin', '<button type="button" class="icon-btn" data-act="install" aria-label="' + lbl + '">' + ico('download') + '</button>');
      const links = App.cur === 'settings' && doc.querySelector('#screen-settings .panel-links');
      if (links) links.insertAdjacentHTML('afterbegin', '<button type="button" class="btn btn-primary btn-wide" data-act="install">' + ico('download') + '<span>' + lbl + '</span></button>');
    });
    root.addEventListener('appinstalled', () => { App.installPrompt = null; UI().toast(t('app.installed'), { kind: 'good', icon: 'download' }); });
    const nav = root.navigator;
    if (!nav || !nav.serviceWorker || !/^https?:$/.test(root.location.protocol)) return;
    let refreshing = false;
    nav.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !App._updateAccepted) return;
      refreshing = true;
      root.location.reload();
    });
    // never interrupt a run: the update prompt waits until the player is back on a menu screen
    let pendingWorker = null;
    on('screen', scr => { if (pendingWorker && scr !== 'play') { const w = pendingWorker; pendingWorker = null; setTimeout(() => offerUpdate(w), 600); } });
    const offerUpdate = worker => {
      if (App.cur === 'play') { pendingWorker = worker; return; }
      UI().toast(t('app.update.ready'), {
        kind: 'info', icon: 'sparkle', ms: 0,
        action: { label: t('app.update.reload'), onClick: () => { App._updateAccepted = true; worker.postMessage({ type: 'skipWaiting' }); } },
      });
    };
    root.addEventListener('load', () => {
      nav.serviceWorker.register('sw.js').then(reg => {
        if (reg.waiting && nav.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && nav.serviceWorker.controller) offerUpdate(w);
          });
        });
        // check for updates when the app comes back to the foreground
        doc.addEventListener('visibilitychange', () => { if (!doc.hidden) reg.update().catch(() => {}); });
      }).catch(err => console.warn('[KOS] service worker registration failed', err));
      if (nav.serviceWorker.controller) {
        nav.serviceWorker.controller.postMessage({ type: 'version' });
      }
    });
    nav.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'version') { App.version = e.data.version; } });
  }

  // ------------------------------------------------------------------ global input
  function onKey(e) {
    if (App.cur === 'play' && run.running) {
      const k = e.key;
      if (k === 'Escape' || k === 'p' || k === 'P') {
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) setPaused(!run.paused);
        return;
      }
      if (run.paused) {
        // the pause card owns the keyboard while open (Enter/Space activate the focused button)
        if (k !== 'Tab' && k !== 'Enter' && k !== ' ') { e.stopImmediatePropagation(); }
        return;
      }
      return;
    }
    if (e.key === 'Escape') {
      const d = UI().topDialog();
      if (d) { if (d.dismissable) d.close(); return; }
      if (App.cur && App.cur !== 'title' && App.cur !== 'results') { e.preventDefault(); App.back(); }
    }
  }

  App.init = function () {
    buildMenuBg();
    const s = settings();
    if (KOS.I18n) KOS.I18n.setLang(s.lang);
    applySettings(s);
    root.addEventListener('keydown', onKey, true);
    root.addEventListener('resize', () => {
      syncPhoneUi();
      if (App.cur === 'play' && run.inst) {
        sizeCanvas(doc.getElementById('game-canvas'));
        try { run.inst.onResize && run.inst.onResize(); } catch (e) { console.error(e); }
      }
    });
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden && App.cur === 'play' && run.running && !run.paused) setPaused(true);
      if (doc.hidden) audio('music', null);
      else if (App.cur !== 'play' && settings().music) audio('music', 'menu');
    });
    // first gesture unlocks Web Audio
    const unlock = () => { audio('unlock'); applySettings(); root.removeEventListener('pointerdown', unlock, true); root.removeEventListener('keydown', unlock, true); };
    root.addEventListener('pointerdown', unlock, true);
    root.addEventListener('keydown', unlock, true);
    // button feedback for every button
    doc.addEventListener('pointerdown', e => {
      const b = e.target.closest && e.target.closest('.btn,.icon-btn,.menu-btn,.card,.chip,.swatch,.badge');
      if (b && !b.disabled) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 160); }
    }, { passive: true });
    on('lang', () => { App.refresh(); });
    on('boat:capsize', e => { if (run.running && run.inst && e && e.boat && e.boat === run.inst.boat) run.capsized = true; });
    on('badge', id => {
      if (App.cur === 'play') { if (run.playBadges && run.playBadges.indexOf(id) < 0) run.playBadges.push(id); return; } // shown on the results screen
      if (App.cur === 'results') return; // results screen announces its own
      const b = BADGES.find(x => x.id === id);
      if (b) UI().toast(t('app.badge.new', { name: tt(b.name) }), { kind: 'star', icon: b.icon });
    });
    setupPwa();
    // blocked / full localStorage: the game works, but the player should know progress will not survive the tab
    if (S().available === false) setTimeout(() => { try { UI().toast(t('app.storage.volatile'), { kind: 'info', icon: 'info', ms: 7000 }); } catch (e) { /* optional */ } }, 1500);
  };

  KOS.App = App;

  // ------------------------------------------------------------------ strings
  KOS.I18n.add('da', {
    app: {
      stars: 'Stjerner',
      install: 'Installer appen', installed: 'KØS SEJL er installeret – god vind!', fullscreen: 'Fuld skærm',
      ios: { title: 'Sådan installerer du', lead: 'Læg KØS SEJL på hjemmeskærmen, så åbner det som en app – i fuld skærm og også uden net.',
        s1: 'Tryk på Del-knappen i Safari (firkanten med pilen op).', s2: 'Rul ned, og vælg "Føj til hjemmeskærm".', s3: 'Tryk "Tilføj" – så ligger KØS SEJL på din hjemmeskærm.',
        note: 'Bruger du Chrome på iPhone, ligger Del-knappen i adresselinjen.', ok: 'Forstået' },
      update: { ready: 'Ny version klar!', reload: 'Opdater' },
      storage: { volatile: 'Dit fremskridt kan ikke gemmes i denne browser – det forsvinder, når du lukker fanen.' },
      rank: { 0: 'Sejlerspire', 1: 'Letmatros', 2: 'Matros', 3: 'Styrmand', 4: 'Skipper', 5: 'Kaptajn', 6: 'Kommandør', 7: 'Admiral' },
      title: {
        tag1: 'Rig til. Sejl ud.', tag2: 'Vind!', play: 'Spil', hello: 'Hej {name}! Klar til at sejle?',
        garageSub: 'Dine både, mærker og niveau', quick: 'Fri sejlads', quickSub: 'Hop direkte ud i bugten',
        hint: 'Styr med ← → · Hal og fir skødet med ↑ ↓ · Hæng ud med mellemrum',
      },
      hub: { title: 'Havnen', sub: 'Vælg hvor du vil sejle hen' },
      area: {
        difficulty: 'Sværhed', empty: 'Her kommer snart nye opgaver. Kig forbi igen!',
        needStars: 'Du skal bruge {n} ★ for at låse op (du har {have}).', needAfter: 'Klar først: {name}',
      },
      pick: {
        hint: 'Vælg den båd, du vil sejle i.', label: 'Vælg båd', start: 'Sejl af sted', change: 'Skift båd',
      },
      view: { overview: 'Oversigt – se hele farvandet', tilt: 'Skrå visning (V)' },
      menu: { more: 'Menu', overview: 'Overblik', tilt: 'Skrå visning', on: 'Til', off: 'Fra', install: 'Føj til hjemmeskærm for fuld skærm' },
      tilt: { auto: 'Automatisk', on: 'Til', off: 'Fra', help: 'Se bådene skråt fra siden, så du kan se dem krænge. Automatisk: til i kapsejlads, fri sejlads og RIB, fra i sejlerskolen, regelskolen, navigation og havnemanøvrer.' },
      pause: {
        title: 'Pause', quit: 'Til kortet',
        tip1: 'Husk: bagbord vige for styrbord!', tip2: 'Kan du ikke sejle direkte mod vinden? Så kryds!',
        tip3: 'Flagrer sejlet? Skød lidt ind.', tip4: 'Hæng ud når det blæser op – så krænger båden mindre.',
        tip5: 'Rødt mærke om bagbord når du sejler ind i havnen.', tip6: 'Altid redningsvest på – også når du er god!',
      },
      crash: { title: 'Ups – en bølge for meget!', body: 'Noget gik galt i denne aktivitet. Prøv en anden, mens vi retter det.' },
      settings: {
        title: 'Indstillinger', lang: 'Sprog', audio: 'Lyd', sound: 'Lydeffekter', music: 'Musik', volume: 'Lydstyrke',
        assist: 'Hjælpeniveau', windUnit: 'Vindstyrke i', controls: 'Styring', reducedMotion: 'Færre animationer', tilt: 'Skrå visning', lowFx: 'Spar på telefonen (stille kort)',
        coach: 'Træner og forældre', coachHelp: 'Kun for voksne: hold knappen nede i 3 sekunder for at låse alt op (eller låse igen).',
        unlockAll: 'Lås alt op', hold: 'Hold i 3 sekunder', holdHint: 'Hold knappen nede i 3 sekunder.',
        unlockedAll: 'Alt er låst op!', lockedAll: 'Låst igen – sejl dig til stjernerne.',
        reset: 'Nulstil fremskridt', resetTitle: 'Nulstil alt?', resetBody: 'Alle stjerner, mærker, XP og din profil bliver slettet. Det kan ikke fortrydes.',
        resetYes: 'Ja, nulstil', resetDone: 'Fremskridt nulstillet.',
      },
      windUnit: { ms: 'm/s', kn: 'knob' },
      assist: {
        easy: 'Let', normal: 'Normal', pro: 'Pro',
        easyHelp: 'Sejlene trimmer sig selv, du kan ikke kæntre, og træneren viser vejen.',
        normalHelp: 'Sejlet trimmer sig selv, og du justerer med skødet: skub for at hale ind eller fire lidt. Pas på krængningen!',
        proHelp: 'Som i virkeligheden: manuelt trim, kæntring og strafrunder. Kun for hajer!',
      },
      controls: { auto: 'Auto', tiller: 'Rorpind + skøde', buttons: 'Knapper', joystick: 'Joystick', help: 'Auto vælger rorpind + skøde på telefon, knapper på tablet og tastatur på computer. Rorpind: træk med venstre tommel for at styre, skødet sidder til højre.' },
      profile: {
        title: 'Din profil', newTitle: 'Ny sejler', sub: 'Hvem skal til søs i dag?', name: 'Dit navn', namePh: 'Skriv dit navn',
        age: 'Alder', ageOpt: '{a} år', look: 'Udseende', style: 'Frisure', skin: 'Hudfarve', hair: 'Hårfarve', jacket: 'Sejlerjakke',
        styles: { short: 'Kort', long: 'Langt', curly: 'Krøller', cap: 'Kasket', bun: 'Knold' },
        boat: 'Din båd', sailNo: 'Sejlnummer', boatColor: 'Bådens farve', random: 'Overrask mig',
        saveFirst: 'Gem og sejl ud!', saved: 'Profil gemt!', needName: 'Skriv dit navn først.',
      },
      coach: { welcome: 'Hej {name}! Jeg er Jesper, træner i KØS. Velkommen i klubben – vælg et sted på kortet, så sejler vi!' },
      onboard: {
        title: 'Velkommen i KØS, {name}!', body: 'Jeg er Jesper, træner i KØS. Vi starter i Sejlerskolen ude i bugten – der lærer Ida dig at styre og stoppe båden.',
        s1: 'Tag din første lektion i Sejlerskolen', s2: 'Saml stjerner – op til tre i hver opgave', s3: 'Stjernerne låser nye både og steder op',
        go: 'Første lektion!', later: 'Se kortet først',
      },
      garage: {
        title: 'Sejlerpas', sub: 'Dine både og mærker', passport: 'SEJLERPAS · KØS SEJLSPORT', noName: 'Ny sejler',
        toNext: '{n} XP til næste niveau', boats: 'Bådstigen', badges: 'Mærker',
        statSpeed: 'Fart', statStab: 'Stabilitet', statCrew: 'Besætning', needStars: 'Lås op med {n} ★ (du har {have}).',
        choose: 'Vælg som min båd', chosen: '{name} er nu din båd!', unlockedToast: 'Ny båd låst op: {name}!',
      },
      badge: { new: 'Nyt mærke: {name}!', have: 'Du har dette mærke!', newOne: 'Nyt mærke!', newMany: 'Nye mærker!', locked: 'Ikke låst op endnu', count: '{n} af {of} mærker' },
      credits: {
        title: 'Om spillet', lead: 'KØS SEJL er lavet til de unge sejlere i KØS Sejlsport på Svaneknoppen – så du kan øve dig hele vinteren og være skarp, når bådene kommer i vandet igen.',
        made: 'Lavet af', club: 'Klub', code: 'Spil og kode', codeWho: 'Frivillige i KØS med hjælp fra Claude',
        thanks: 'Tak til', thanksWho: 'Alle trænere, forældre og sejlere i KØS',
        safetyTitle: 'Sejl sikkert', safety: 'Brug altid redningsvest. Sejl aldrig alene uden en træner i nærheden, og hold dig ude af sejlrenden og badezonerne.',
        coach: 'Vi ses på vandet!',
      },
    },
  });
  KOS.I18n.add('en', {
    app: {
      stars: 'Stars',
      install: 'Install the app', installed: 'KØS SEJL is installed – fair winds!', fullscreen: 'Fullscreen',
      ios: { title: 'How to install', lead: 'Put KØS SEJL on your home screen and it opens like an app – full screen, and it works offline too.',
        s1: 'Tap the Share button in Safari (the square with the arrow pointing up).', s2: 'Scroll down and choose "Add to Home Screen".', s3: 'Tap "Add" – KØS SEJL is now on your home screen.',
        note: 'Using Chrome on iPhone? The Share button is in the address bar.', ok: 'Got it' },
      update: { ready: 'New version ready!', reload: 'Update' },
      storage: { volatile: 'Your progress cannot be saved in this browser – it disappears when you close the tab.' },
      rank: { 0: 'Sprout Sailor', 1: 'Deckhand', 2: 'Able Sailor', 3: 'Mate', 4: 'Skipper', 5: 'Captain', 6: 'Commodore', 7: 'Admiral' },
      title: {
        tag1: 'Rig it. Sail out.', tag2: 'Win!', play: 'Play', hello: 'Hi {name}! Ready to sail?',
        garageSub: 'Your boats, badges and level', quick: 'Free sail', quickSub: 'Jump straight into the bay',
        hint: 'Steer with ← → · Trim the sheet with ↑ ↓ · Hike with Space',
      },
      hub: { title: 'The Harbour', sub: 'Choose where to sail' },
      area: {
        difficulty: 'Difficulty', empty: 'New challenges are coming soon. Check back later!',
        needStars: 'You need {n} ★ to unlock this (you have {have}).', needAfter: 'Finish first: {name}',
      },
      pick: {
        hint: 'Choose the boat you want to sail.', label: 'Choose boat', start: 'Set sail', change: 'Change boat',
      },
      view: { overview: 'Overview – see the whole area', tilt: 'Tilted view (V)' },
      menu: { more: 'Menu', overview: 'Overview', tilt: 'Tilted view', on: 'On', off: 'Off', install: 'Add to home screen for full screen' },
      tilt: { auto: 'Automatic', on: 'On', off: 'Off', help: 'See the boats at an angle, so you can watch them heel. Automatic: on for racing, free sailing and the RIB, off in the sailing school, the rules school, navigation and docking.' },
      pause: {
        title: 'Paused', quit: 'To the map',
        tip1: 'Remember: port gives way to starboard!', tip2: 'Can’t sail straight into the wind? Beat upwind!',
        tip3: 'Sail flapping? Sheet in a bit.', tip4: 'Hike out when the wind picks up – the boat heels less.',
        tip5: 'Keep red marks to port when entering the harbour.', tip6: 'Always wear a life jacket – even when you’re good!',
      },
      crash: { title: 'Oops – one wave too many!', body: 'Something went wrong in this activity. Try another one while we fix it.' },
      settings: {
        title: 'Settings', lang: 'Language', audio: 'Sound', sound: 'Sound effects', music: 'Music', volume: 'Volume',
        assist: 'Assist level', windUnit: 'Wind speed in', controls: 'Controls', reducedMotion: 'Reduce motion', tilt: 'Tilted view', lowFx: 'Save battery (still map)',
        coach: 'Coaches and parents', coachHelp: 'Grown-ups only: hold the button for 3 seconds to unlock everything (or lock again).',
        unlockAll: 'Unlock everything', hold: 'Hold for 3 seconds', holdHint: 'Hold the button down for 3 seconds.',
        unlockedAll: 'Everything unlocked!', lockedAll: 'Locked again – sail for those stars.',
        reset: 'Reset progress', resetTitle: 'Reset everything?', resetBody: 'All stars, badges, XP and your profile will be deleted. This cannot be undone.',
        resetYes: 'Yes, reset', resetDone: 'Progress reset.',
      },
      windUnit: { ms: 'm/s', kn: 'knots' },
      assist: {
        easy: 'Easy', normal: 'Normal', pro: 'Pro',
        easyHelp: 'Sails trim themselves, you can’t capsize, and your coach shows the way.',
        normalHelp: 'The sail trims itself and you fine-tune with the sheet: nudge it to haul in or ease a little. Watch the heel!',
        proHelp: 'Like the real thing: manual trim, capsizing and penalty turns. Sharks only!',
      },
      controls: { auto: 'Auto', tiller: 'Tiller + sheet', buttons: 'Buttons', joystick: 'Joystick', help: 'Auto picks tiller + sheet on phones, buttons on tablets and keyboard on computers. Tiller: drag with your left thumb to steer, the sheet sits on the right.' },
      profile: {
        title: 'Your profile', newTitle: 'New sailor', sub: 'Who’s going to sea today?', name: 'Your name', namePh: 'Type your name',
        age: 'Age', ageOpt: '{a} yrs', look: 'Look', style: 'Hair style', skin: 'Skin', hair: 'Hair colour', jacket: 'Sailing jacket',
        styles: { short: 'Short', long: 'Long', curly: 'Curly', cap: 'Cap', bun: 'Bun' },
        boat: 'Your boat', sailNo: 'Sail number', boatColor: 'Boat colour', random: 'Surprise me',
        saveFirst: 'Save and sail out!', saved: 'Profile saved!', needName: 'Type your name first.',
      },
      coach: { welcome: 'Hi {name}! I’m Jesper, a coach at KØS. Welcome to the club – pick a spot on the map and let’s sail!' },
      onboard: {
        title: 'Welcome to KØS, {name}!', body: 'I’m Jesper, coach at KØS. We start at the Sailing School out in the bay – that’s where Ida teaches you to steer and stop the boat.',
        s1: 'Take your first Sailing School lesson', s2: 'Collect stars – up to three per challenge', s3: 'Stars unlock new boats and places',
        go: 'First lesson!', later: 'Look at the map first',
      },
      garage: {
        title: 'Sailing Passport', sub: 'Your boats and badges', passport: 'SAILING PASSPORT · KØS SEJLSPORT', noName: 'New sailor',
        toNext: '{n} XP to the next level', boats: 'The boat ladder', badges: 'Badges',
        statSpeed: 'Speed', statStab: 'Stability', statCrew: 'Crew', needStars: 'Unlock with {n} ★ (you have {have}).',
        choose: 'Make it my boat', chosen: '{name} is now your boat!', unlockedToast: 'New boat unlocked: {name}!',
      },
      badge: { new: 'New badge: {name}!', have: 'You have this badge!', newOne: 'New badge!', newMany: 'New badges!', locked: 'Not unlocked yet', count: '{n} of {of} badges' },
      credits: {
        title: 'About', lead: 'KØS SEJL is made for the young sailors of KØS Sejlsport on Svaneknoppen – so you can practise all winter and be sharp when the boats go back in the water.',
        made: 'Made by', club: 'Club', code: 'Game and code', codeWho: 'KØS volunteers with help from Claude',
        thanks: 'Thanks to', thanksWho: 'All the coaches, parents and sailors at KØS',
        safetyTitle: 'Sail safe', safety: 'Always wear a life jacket. Never sail alone without a coach nearby, and stay out of the channel and swim zones.',
        coach: 'See you on the water!',
      },
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
