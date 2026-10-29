// KØS SEJL — js/ui/xmas.js
// KOS.Xmas: the Julekalender 2026 (issue #6, docs/superpowers/specs/2026-10-29-christmas-calendar-design.md).
// This part is the data + state core: no DOM work at load, so it also runs in Node tests (tools/test-core.js).
//
//   KOS.Xmas.DOORS[n-1]        {day, act, icon, coach, title{da,en}, text{da,en}, hint{da,en}}  (24 doors, spec 4.3)
//   KOS.Xmas.ELVES[n-1]        {n, name, tag{da,en}, spot}                                      (24 elves, spec 5)
//   KOS.Xmas.dayInfo(date)     -> {phase: 'before'|'teaser'|'advent'|'after'|'closed', today: 1..24|null, openable: [n..]}
//   KOS.Xmas.canOpen(n, date)  -> door n may be opened on that day
//   KOS.Xmas.openDoor(n, date) -> true when newly opened (silver bauble)
//   KOS.Xmas.markGold(n)       -> true when newly gold (only after the door was opened)
//   KOS.Xmas.findElf(n)        -> true when newly found (only while the elf is visible: its door opened, season on)
//   KOS.Xmas.state() / save(s) / reset()     the saved state (Storage key 'xmas2026'), validated on every read
//   KOS.Xmas.merge(a, b)       pure: union of open/gold/elves (earliest ts), later `seen` values (for #35 sync)
//
// Dates always come from KOS.Season.now() (honours the God-mode test date #date=YYYY-MM-DD), never new Date().
// A successful finish of door N's activity after door N was opened turns it gold (the 'progress' listener below),
// whether it was launched from the calendar or not. Each change emits KOS.Events 'xmas' {kind: 'door'|'gold'|'elf', n}.
// Saved shape: {v: 1, open: {"1": ts}, gold: {"3": ts}, elves: {"7": ts}, seen: {toast: ts, coachDay: 'YYYY-MM-DD'}}.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});

  const YEAR = 2026;
  const KEY = 'xmas' + YEAR; // KOS.Storage key (stored as kos.xmas2026); next year's calendar gets its own
  const N = 24;
  const COACHES = ['anton', 'storm', 'marius', 'ida', 'maria', 'nicolas', 'peter', 'jesper'];

  // ------------------------------------------------------------------ doors (spec 4.3). hint = where that day's elf hides.
  // [act, icon, title da, title en, text da, text en]
  const D = [
    ['xmas.presents', 'sparkle', 'Gavejagt i bugten', 'Present hunt in the bay',
      'Julemanden har tabt gaverne i bugten. Sejl ud og saml dem!', 'Santa dropped the presents in the bay. Sail out and collect them!'],
    ['quiz.xmas1', 'quiz', 'Julequiz 1', 'Christmas quiz 1',
      'Fem julede spørgsmål om sejlerlivet om vinteren.', 'Five Christmassy questions about sailing life in winter.'],
    ['knots.eight', 'knot', 'Bind snoren om julegaven', 'Tie up the present',
      'Et ottetalsknob holder gavebåndet – og skødet i blokken.', 'A figure-eight holds the ribbon – and the sheet in the block.'],
    ['shed.tidy', 'wrench', 'Juleoprydning i skuret', 'Christmas tidy-up in the shed',
      'Skuret skal være pænt til jul. Alt på sin plads!', 'The shed must be neat for Christmas. Everything in its place!'],
    ['dock.opti.jetty', 'anchor', 'Nissen skal i land', 'The elf needs to get ashore',
      'Læg til ved broen, så nissen kan nå risengrøden.', 'Come alongside the jetty so the elf makes it to the rice pudding.'],
    ['rib.tow', 'rib', 'Træk juletræet hjem', 'Tow the Christmas tree home',
      'Juletræet flyder ude i bugten. Træk det hjem til klubben med RIB’en.', 'The Christmas tree is floating in the bay. Tow it home to the club with the RIB.'],
    ['quiz.xmas2', 'quiz', 'Julequiz 2', 'Christmas quiz 2',
      'Fem nye spørgsmål – kan du dem alle?', 'Five new questions – can you get them all?'],
    ['rigging.opti', 'wrench', 'Rig julebåden', 'Rig the Christmas boat',
      'Optimisten skal rigges til julesejlads.', 'The Optimist needs rigging for a Christmas sail.'],
    ['knots.bowline', 'knot', 'Pælestik til kanen', 'A bowline for the sleigh',
      'Rensdyrene skal bindes fast med et pælestik.', 'The reindeer need tying up with a bowline.'],
    ['nav.buoys', 'buoy', 'Julemandens bøjer', 'Santa’s buoys',
      'Kend bøjerne, så julemanden ikke går på grund.', 'Know your buoys so Santa doesn’t run aground.'],
    ['sail.cleanup', 'drop', 'Julerod i bugten', 'Christmas mess in the bay',
      'Gavepapir og bånd i vandet! Sejl rundt og ryd op.', 'Wrapping paper and ribbon in the water! Sail round and clean up.'],
    ['capsize.opti', 'life', 'Isbad!', 'Ice bath!',
      'Brr! Øv kæntring – og kom hurtigt op igen.', 'Brr! Practise a capsize – and get back up fast.'],
    ['xmas.lucia', 'star', 'Luciasejlads', 'Lucia sail',
      'Sejl med lys i mørket på Luciadagen.', 'Sail with lights in the dark on Lucia day.'],
    ['quiz.xmas3', 'quiz', 'Julequiz 3', 'Christmas quiz 3',
      'Endnu fem julede spørgsmål.', 'Five more Christmassy questions.'],
    ['knots.clove', 'knot', 'Dobbelt halvstik om juletræet', 'A clove hitch round the tree',
      'Gør juletræet fast med et dobbelt halvstik.', 'Make the Christmas tree fast with a clove hitch.'],
    ['rowschool.r10', 'rules', 'Hvem viger?', 'Who gives way?',
      'To både på vej til julefrokost. Hvem skal vige?', 'Two boats on their way to the Christmas lunch. Who gives way?'],
    ['dock.rib.pontoon', 'rib', 'Julemandens RIB', 'Santa’s RIB',
      'Julemandens RIB skal fortøjes ved pontonen.', 'Santa’s RIB needs mooring at the pontoon.'],
    ['sail.timetrial', 'timer', 'Kanen mod tiden', 'Sleigh against the clock',
      'Julemanden har travlt. Sejl banen så hurtigt du kan!', 'Santa is in a hurry. Sail the course as fast as you can!'],
    ['nav.night', 'compass', 'Nattesejlads under julestjernen', 'Night sail under the Christmas star',
      'Find vej i mørket – lygterne viser hvem der er hvem.', 'Find your way in the dark – the lights show who is who.'],
    ['shed.rush', 'clock', 'Travlt i nisseværkstedet', 'Rush in the elves’ workshop',
      'Nisserne har travlt. Hjælp med at finde grejet!', 'The elves are busy. Help find the gear!'],
    ['knots.cleat', 'knot', 'Vintersolhverv: fortøj båden', 'Winter solstice: make her fast',
      'Årets korteste dag. Gør fortøjningen fast på klampen.', 'The shortest day of the year. Make the line fast on the cleat.'],
    ['rib.rescue', 'life', 'Nissen faldt i vandet!', 'The elf fell in!',
      'Plask! Sejl hurtigt ud med RIB’en og saml nissen op.', 'Splash! Hurry out in the RIB and pick up the elf.'],
    ['quiz.xmas4', 'quiz', 'Lillejuleaftens-quiz', 'Little Christmas Eve quiz',
      'Den store quiz med otte spørgsmål.', 'The big quiz with eight questions.'],
    ['xmas.finale', 'trophy', 'Juleaftens store gavejagt', 'The great Christmas Eve hunt',
      'Saml alle gaverne – og sæt stjernen på toppen af træet!', 'Collect all the presents – and put the star on top of the tree!'],
  ];

  // ------------------------------------------------------------------ elves (spec 5). spot = where elf n hides (the UI
  // places it there; ids are adjustable). screen: hub (map spot id), calendar, garage, passport, settings, title, places
  // ("Alle steder"), area (area id), results (shown after finishing act). 12 hub, 2 calendar, 2 garage/passport,
  // 1 settings, 1 title, 1 places, 3 area, 2 results.
  // [name, tagline da, tagline en, spot, hint da, hint en]
  const E = [
    ['Skøde-Søren', 'Holder altid styr på skødet.', 'Always keeps the sheet in hand.', { screen: 'hub', id: 'jetty' },
      'Skøde-Søren gemmer sig ved broen på havnekortet.', 'Skøde-Søren is hiding by the jetty on the harbour map.'],
    ['Fender-Frida', 'Ingen skrammer på hendes vagt.', 'No scratches on her watch.', { screen: 'calendar', id: 'wall-1' },
      'Fender-Frida kigger frem på julekalenderen.', 'Fender-Frida is peeking out of the Christmas calendar.'],
    ['Knob-Karl', 'Kan binde alle knob – med lukkede øjne.', 'Ties every knot – with his eyes shut.', { screen: 'area', area: 'club' },
      'Knob-Karl gemmer sig inde i klubhuset.', 'Knob-Karl is hiding inside the clubhouse.'],
    ['Ror-Rikke', 'Styrer altid lige mod målet.', 'Always steers straight for the finish.', { screen: 'hub', id: 'harbour' },
      'Ror-Rikke gemmer sig ved havneindløbet på kortet.', 'Ror-Rikke is hiding at the harbour entrance on the map.'],
    ['Bom-Bent', 'Dukker sig, når bommen kommer.', 'Ducks when the boom comes over.', { screen: 'garage', id: 'garage' },
      'Bom-Bent gemmer sig blandt bådene i garagen.', 'Bom-Bent is hiding among the boats in the garage.'],
    ['Sejl-Sofie', 'Trimmer sejlet til perfektion.', 'Trims the sail to perfection.', { screen: 'hub', id: 'school' },
      'Sejl-Sofie gemmer sig ved sejlerskolen på kortet.', 'Sejl-Sofie is hiding by the sailing school on the map.'],
    ['Mast-Mads', 'Klatrer helt op i masten.', 'Climbs right to the top of the mast.', { screen: 'hub', id: 'club' },
      'Mast-Mads gemmer sig ved klubhuset på kortet.', 'Mast-Mads is hiding by the clubhouse on the map.'],
    ['Jolle-Julie', 'Elsker sin lille jolle.', 'Loves her little dinghy.', { screen: 'title', id: 'title' },
      'Jolle-Julie gemmer sig på forsiden af spillet.', 'Jolle-Julie is hiding on the game’s front page.'],
    ['Bøje-Bo', 'Runder altid bøjen tæt.', 'Always rounds the buoy close.', { screen: 'hub', id: 'bay' },
      'Bøje-Bo gemmer sig ved bøjerne ude i bugten.', 'Bøje-Bo is hiding by the buoys out in the bay.'],
    ['Vante-Vera', 'Har altid varme vanter med.', 'Always brings warm mittens.', { screen: 'settings', id: 'settings' },
      'Vante-Vera gemmer sig i indstillingerne.', 'Vante-Vera is hiding in the settings.'],
    ['Ankér-Anton', 'Ligger trygt for anker.', 'Lies safely at anchor.', { screen: 'hub', id: 'pier' },
      'Ankér-Anton gemmer sig ved molen på kortet.', 'Ankér-Anton is hiding by the pier on the map.'],
    ['Kompas-Klara', 'Finder altid nord.', 'Always finds north.', { screen: 'area', area: 'nav' },
      'Kompas-Klara gemmer sig hos navigationen.', 'Kompas-Klara is hiding with the navigation.'],
    ['Lucia-Lea', 'Bærer lys i mørket.', 'Carries light in the dark.', { screen: 'results', act: 'xmas.lucia' },
      'Lucia-Lea venter, når du har sejlet Luciasejladsen.', 'Lucia-Lea is waiting once you have sailed the Lucia sail.'],
    ['Pagaj-Per', 'Padler, når vinden svigter.', 'Paddles when the wind dies.', { screen: 'hub', id: 'rib' },
      'Pagaj-Per gemmer sig ved RIB’erne på kortet.', 'Pagaj-Per is hiding by the RIBs on the map.'],
    ['Vimpel-Vilma', 'Ved altid, hvor vinden kommer fra.', 'Always knows where the wind is from.', { screen: 'hub', id: 'race' },
      'Vimpel-Vilma gemmer sig ved kapsejladsbanen.', 'Vimpel-Vilma is hiding by the race course.'],
    ['Klampe-Klaus', 'Gør alt fast på klampen.', 'Makes everything fast on a cleat.', { screen: 'places', id: 'places' },
      'Klampe-Klaus gemmer sig i listen over alle steder.', 'Klampe-Klaus is hiding in the list of all places.'],
    ['Kaase-Kamma', 'Holder skøderne ryddelige.', 'Keeps the lines tidy.', { screen: 'passport', id: 'passport' },
      'Kaase-Kamma gemmer sig i dit sejlerpas.', 'Kaase-Kamma is hiding in your sailing passport.'],
    ['Bølge-Bertil', 'Surfer på hver eneste bølge.', 'Surfs every single wave.', { screen: 'hub', id: 'sea' },
      'Bølge-Bertil gemmer sig langt ude på vandet.', 'Bølge-Bertil is hiding far out on the water.'],
    ['Spiler-Signe', 'Sætter spileren med et smil.', 'Hoists the spinnaker with a smile.', { screen: 'area', area: 'race' },
      'Spiler-Signe gemmer sig hos kapsejladserne.', 'Spiler-Signe is hiding with the races.'],
    ['Tovværk-Thor', 'Stærk som et ankertov.', 'Strong as an anchor rope.', { screen: 'hub', id: 'shed' },
      'Tovværk-Thor gemmer sig ved skuret på kortet.', 'Tovværk-Thor is hiding by the shed on the map.'],
    ['Rorpind-Rasmus', 'Holder altid fast i rorpinden.', 'Never lets go of the tiller.', { screen: 'hub', id: 'rules' },
      'Rorpind-Rasmus gemmer sig ved vigereglerne på kortet.', 'Rorpind-Rasmus is hiding by the rules on the map.'],
    ['Redningsvest-Ronja', 'Altid vest på – også til jul.', 'Always wears a life jacket – even at Christmas.', { screen: 'hub', id: 'rescue' },
      'Redningsvest-Ronja gemmer sig på stranden på kortet.', 'Redningsvest-Ronja is hiding on the beach on the map.'],
    ['Pejling-Palle', 'Pejler sig frem til julegaverne.', 'Takes bearings to find the presents.', { screen: 'calendar', id: 'wall-2' },
      'Pejling-Palle gemmer sig på julekalenderen.', 'Pejling-Palle is hiding on the Christmas calendar.'],
    ['Julestjerne-Nisse', 'Sætter stjernen på toppen.', 'Puts the star on top.', { screen: 'results', act: 'xmas.finale' },
      'Julestjerne-Nisse venter, når du har klaret juleaftens gavejagt.', 'Julestjerne-Nisse is waiting once you finish the Christmas Eve hunt.'],
  ];

  const DOORS = D.map((d, i) => ({
    day: i + 1, act: d[0], icon: d[1], coach: COACHES[i % COACHES.length],
    title: { da: d[2], en: d[3] }, text: { da: d[4], en: d[5] }, hint: { da: E[i][4], en: E[i][5] }, elf: i + 1,
  }));
  const ELVES = E.map((e, i) => ({ n: i + 1, name: e[0], tag: { da: e[1], en: e[2] }, spot: e[3] }));
  // the shuffled-but-fixed order of the doors on the boat shed wall (classic calendar look)
  const WALL = [7, 19, 2, 13, 22, 10, 16, 4, 24, 11, 1, 18, 9, 21, 6, 14, 3, 23, 12, 17, 8, 20, 15, 5];

  const BADGES = [
    { id: 'xmas-elf-8', icon: 'eye', name: { da: 'Nissespejder', en: 'Elf scout' }, desc: { da: 'Find 8 nisser i julekalenderen.', en: 'Find 8 elves in the Christmas calendar.' } },
    { id: 'xmas-elf-16', icon: 'eye', name: { da: 'Nissedetektiv', en: 'Elf detective' }, desc: { da: 'Find 16 nisser i julekalenderen.', en: 'Find 16 elves in the Christmas calendar.' } },
    { id: 'xmas-elf-24', icon: 'medal', name: { da: 'Nissemester', en: 'Elf master' }, desc: { da: 'Find alle 24 nisser.', en: 'Find all 24 elves.' } },
    { id: 'xmas-doors-24', icon: 'calendar', name: { da: 'Juleaften!', en: 'Christmas Eve!' }, desc: { da: 'Åbn alle 24 låger i julekalenderen.', en: 'Open all 24 doors of the Christmas calendar.' } },
    { id: 'xmas-gold-24', icon: 'trophy', name: { da: 'Guldjul', en: 'Golden Christmas' }, desc: { da: 'Gør alle 24 julekugler gyldne.', en: 'Turn all 24 baubles gold.' } },
  ];

  // ------------------------------------------------------------------ dates
  const dateNum = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const FIRST = YEAR * 10000 + 1201, LAST = YEAR * 10000 + 1224; // the advent days
  const TEASER = YEAR * 10000 + 1129; // 1st Advent: the calendar shows, every door locked
  const nowDate = () => (KOS.Season && KOS.Season.now ? KOS.Season.now() : new Date(Date.now()));
  const seasonOn = date => !!(KOS.Season && KOS.Season.active('xmas', date));
  const range = n => { const a = []; for (let i = 1; i <= n; i++) a.push(i); return a; };
  const validN = n => Number.isInteger(+n) && +n >= 1 && +n <= N && String(+n) === String(n);

  // phase of the calendar on a day. Outside the window (or #xmas=0) it is 'before' / 'closed'. Forced on (#xmas=1) outside
  // the dates counts as 'after', so a tester can open every door any time of year.
  function dayInfo(date) {
    date = date || nowDate();
    const n = dateNum(date);
    if (!seasonOn(date)) return { phase: n < TEASER ? 'before' : 'closed', today: null, openable: [] };
    if (n >= TEASER && n < FIRST) return { phase: 'teaser', today: null, openable: [] };
    if (n >= FIRST && n <= LAST) { const d = n - FIRST + 1; return { phase: 'advent', today: d, openable: range(d) }; }
    return { phase: 'after', today: null, openable: range(N) };
  }
  // days until door n opens (0 = openable now); null outside the season
  function daysUntil(n, date) {
    date = date || nowDate();
    const info = dayInfo(date);
    if (info.phase === 'before' || info.phase === 'closed') return null;
    if (info.openable.indexOf(+n) >= 0) return 0;
    const target = new Date(YEAR, 11, +n);
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((target - today) / 86400000);
  }
  const canOpen = (n, date) => validN(n) && dayInfo(date).openable.indexOf(+n) >= 0;

  // ------------------------------------------------------------------ state
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const okTs = v => typeof v === 'number' && isFinite(v) && v > 0;
  const empty = () => ({ v: 1, open: {}, gold: {}, elves: {}, seen: {} });
  function cleanMap(m) {
    const out = {};
    if (!isObj(m)) return out;
    for (const k in m) if (validN(k) && okTs(m[k])) out[k] = m[k];
    return out;
  }
  // garbage in -> empty state; bad entries dropped; gold only on opened doors
  function sanitize(s) {
    if (!isObj(s) || s.v !== 1) return empty();
    const out = { v: 1, open: cleanMap(s.open), gold: {}, elves: cleanMap(s.elves), seen: {} };
    const gold = cleanMap(s.gold);
    for (const k in gold) if (out.open[k]) out.gold[k] = gold[k];
    if (isObj(s.seen)) {
      if (okTs(s.seen.toast)) out.seen.toast = s.seen.toast;
      if (typeof s.seen.coachDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.seen.coachDay)) out.seen.coachDay = s.seen.coachDay;
    }
    return out;
  }
  let mem = null; // Node / no KOS.Storage
  function state() {
    if (KOS.Storage && KOS.Storage.get) return sanitize(KOS.Storage.get(KEY, null));
    return sanitize(mem);
  }
  function save(s) {
    s = sanitize(s);
    if (KOS.Storage && KOS.Storage.set) KOS.Storage.set(KEY, s); else mem = s;
    return s;
  }
  function reset() { if (KOS.Storage && KOS.Storage.remove) KOS.Storage.remove(KEY); mem = null; emit('reset', 0); }

  // pure: union of open/gold/elves with the earliest timestamp, the later of each `seen` value
  function merge(a, b) {
    a = sanitize(a); b = sanitize(b);
    const out = empty();
    ['open', 'gold', 'elves'].forEach(f => {
      [a[f], b[f]].forEach(m => { for (const k in m) out[f][k] = out[f][k] ? Math.min(out[f][k], m[k]) : m[k]; });
    });
    const t = Math.max(a.seen.toast || 0, b.seen.toast || 0);
    if (t) out.seen.toast = t;
    const cd = [a.seen.coachDay, b.seen.coachDay].filter(Boolean).sort().pop();
    if (cd) out.seen.coachDay = cd;
    return sanitize(out);
  }

  function emit(kind, n) {
    if (KOS.Events && KOS.Events.emit) KOS.Events.emit('xmas', { kind, n });
    if (n && KOS.Track && KOS.Track.event) { try { KOS.Track.event('julekalender', kind, String(n), n); } catch (e) { /* analytics never matters */ } }
  }
  const stamp = () => nowDate().getTime();

  const isOpen = n => !!state().open[n];
  const isGold = n => !!state().gold[n];
  const isFound = n => !!state().elves[n];
  // elf n sits at its spot once door n is opened, until found, while the season is on (until 6 Jan)
  const isElfVisible = (n, date) => validN(n) && seasonOn(date || nowDate()) && isOpen(n) && !isFound(n);

  function openDoor(n, date) {
    if (!canOpen(n, date)) return false;
    const s = state();
    if (s.open[n]) return false;
    s.open[n] = stamp();
    save(s); emit('door', +n); checkBadges();
    return true;
  }
  function markGold(n) {
    if (!validN(n)) return false;
    const s = state();
    if (!s.open[n] || s.gold[n]) return false;
    s.gold[n] = stamp();
    save(s); emit('gold', +n); checkBadges();
    return true;
  }
  function findElf(n, date) {
    if (!isElfVisible(n, date)) return false;
    const s = state();
    s.elves[n] = stamp();
    save(s); emit('elf', +n); checkBadges();
    return true;
  }
  // one-off markers: seen('toast') -> ts|undefined; markSeen('toast'); markSeen('coachDay', 'YYYY-MM-DD')
  const seen = k => state().seen[k];
  function markSeen(k, v) {
    const s = state();
    s.seen[k] = v === undefined ? stamp() : v;
    save(s);
  }

  const counts = s => { s = s ? sanitize(s) : state(); return { open: Object.keys(s.open).length, gold: Object.keys(s.gold).length, elves: Object.keys(s.elves).length }; };
  // the doors whose activity is `act` (a door's activity may also be played outside the calendar)
  const doorsFor = act => DOORS.filter(d => d.act === act).map(d => d.day);

  // ------------------------------------------------------------------ badges (KOS.App.addBadges; awarded by id, not literal)
  function badgesFor(s) {
    const c = counts(s), ids = [];
    if (c.elves >= 8) ids.push('xmas-elf-8');
    if (c.elves >= 16) ids.push('xmas-elf-16');
    if (c.elves >= 24) ids.push('xmas-elf-24');
    if (c.open >= N) ids.push('xmas-doors-24');
    if (c.gold >= N) ids.push('xmas-gold-24');
    return ids;
  }
  let registered = false;
  function registerBadges() {
    if (registered || !(KOS.App && KOS.App.addBadges)) return registered;
    KOS.App.addBadges(BADGES);
    return (registered = true);
  }
  // awards every earned badge not yet held; returns the newly awarded ids
  function checkBadges() {
    registerBadges();
    if (!(KOS.Storage && KOS.Storage.award)) return [];
    return badgesFor(state()).filter(id => KOS.Storage.award(id));
  }

  // ------------------------------------------------------------------ gold: a successful finish after the door was opened
  function onProgress(p) {
    if (!p || !p.id || !p.result || !p.result.success) return;
    doorsFor(p.id).forEach(n => { if (isOpen(n)) markGold(n); });
  }
  if (KOS.Events && KOS.Events.on) KOS.Events.on('progress', onProgress);

  KOS.Xmas = {
    YEAR, KEY, N, COACHES, DOORS, ELVES, WALL, BADGES,
    dayInfo, daysUntil, canOpen,
    state, save, reset, sanitize, merge,
    isOpen, isGold, isFound, isElfVisible, openDoor, markGold, findElf, seen, markSeen, counts, doorsFor,
    badgesFor, registerBadges, checkBadges, onProgress,
    door: n => DOORS[+n - 1] || null,
    elf: n => ELVES[+n - 1] || null,
  };

  // badges show in the passport only once the calendar is (or was) in play
  try { if (seasonOn() || counts().open) registerBadges(); } catch (e) { /* storage not ready */ }
})(typeof window !== 'undefined' ? window : globalThis);
