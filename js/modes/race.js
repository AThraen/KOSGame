// KØS SEJL — js/modes/race.js
// The 'race' mode: Kapsejlads. Hub area 'race' (Kapsejladsbanen) out in the Øresund ('sound' venue), the Opti club
// championship in Svanemøllebugten ('bay').
//
// What happens in a race:
//   prestart  committee boat (starboard end) + pin (port end), a shortened 5-4-1-0 sequence with class flag, P flag
//             and horns (KOS.Audio), countdown in the HUD flag panel, line bias (favoured end), fast-forward button.
//   gun       OCS check (X flag + horn, the boat must dip back below the line), "perfect start" bonus.
//   race      windward-leeward ('wl') or triangle ('tri') course, 1–2 laps, laylines toggle, 3–11 AI boats of the same
//             class (KOS.AI with varied skill), live positions, legs, gust patches & wind shifts (rummer/skralder),
//             mark rounding by winding number (string rule → correct side), 3-length zone, KOS.Rules.monitor fouls →
//             360° penalty turns (easy assist only warns) explained by the coach.
//   finish    finish horn per boat, live finish board, results table (times, points, stars by place) on the results
//             screen, low-point series score per championship (KOS.Storage).
//
// Activity params: series, race (1-based), races, venue ('sound'|'bay'), course ('wl'|'tri'), laps, fleet (AI boats),
//   windDeg, windKn, gust, shift, bias (deg, + = pin end favoured), targetS (wanted race length, s), seed, skill [lo, hi].
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    race: {
      hud: { leg: 'Ben', toStart: 'Til start', fleet: 'Feltet', you: 'Dig', finished: 'I mål', lap: 'Omgang {n}/{of}', shift: 'Vindskift', lift: 'rummer', header: 'skralder' },
      leg: { start: 'Start', beat: 'Kryds', reach: 'Slør', run: 'Læns', finish: 'Mål', done: 'I mål' },
      seq: { warn: '60 s', prep: '48 s', one: '12 s', go: 'Start', short: 'Startproceduren er kortet ned: 5-4-1-0 tager et minut' },
      flag: { cls: 'Klasseflag', P: 'P-flag', X: 'X-flag' },
      btn: { ff: 'Spol frem', layl: 'Laylines', next: 'Videre' },
      intro: 'Kapsejlads! Vær lige bag startlinjen, når startskuddet lyder.',
      introBay: 'Vær lige bag startlinjen, når hornet lyder. Så op til mærke 1!',
      card: { kicker: 'Kapsejlads', title: 'Klar til start?', goal: 'Sejl hen til startlinjen, og kryds den lige efter, at hornet lyder. Så går det rundt om mærkerne og i mål.', skip: 'Gider du ikke vente? Tryk på » for at spole frem.', go: 'Sejl!' },
      keys: 'Tastatur: ←/→ styr · ↑/↓ skøde · L laylines · T strafrunde',
      sig: {
        warn: 'Varselssignal! Klasseflaget går op. Rigtig start er 5-4-1-0 minutter – her kører vi 5 gange hurtigere.',
        prep: 'Forberedelsessignal! P-flaget går op. Nu gælder kapsejladsreglerne.',
        one: 'Ét minut! P-flaget går ned. Gør dig klar til at sejle mod linjen.',
        go: 'START! Sejl, sejl, sejl!',
        ocs: 'X-flaget er oppe – du var over linjen for tidligt! Vend om og sejl tilbage under linjen, og start igen.',
        ocsOk: 'Fint! Nu er du under linjen igen – kryds den og kom af sted.',
        ocsOthers: 'X-flag: nogle både var over linjen for tidligt og skal tilbage.',
      },
      tip: {
        bias: 'Linjen er skæv: {end} ligger tættest på vinden. Start i den ende, så er du foran fra start!',
        biasPin: 'pinden', biasBoat: 'dommerbåden',
        ff: 'Tryk "Spol frem" hvis du vil springe ventetiden over.',
        laylines: 'De stiplede linjer er laylines. Når du rammer en af dem, kan du slå og lige netop nå mærket.',
        gust: 'Pust på vej! Den mørke krusning på vandet giver mere fart – sejl hen i den.',
        lift: 'Vinden rummer – du kan styre højere op. Bliv på denne halse!',
        header: 'Vinden skralder – du må falde af. Når det skralder, så slå!',
        wrongSide: 'Hov – mærket skal rundes om bagbord (mærket på din venstre side). Sejl tilbage og rund det rigtigt.',
        zone: 'Den stiplede cirkel er zonen på 3 bådlængder. Den inderste båd i zonen har ret til mærkeplads.',
        lastLeg: 'Sidste ben – nu gælder det! Hjem over mållinjen.',
        penLeft: 'Du skylder stadig en strafrunde. Tag den nu – ellers får du tidsstraf i mål.',
        irons: 'Du står i vindøjet! Læg roret til den ene side, så falder båden af.',
        heel: 'Båden krænger meget – hæng ud!',
        rail: 'Ud på kanten! Når det blæser op, skal mandskabet sidde på rælingen – så krænger båden mindre og sejler hurtigere.',
        finishLine: 'Mållinjen er mellem dommerbåden og pinden.',
        capsize: 'Kæntret! Op igen – kapsejladsen er ikke slut!',
        missLine: 'Du er ikke startet endnu! Sejl tilbage og kryds startlinjen MELLEM dommerbåden og pinden.',
      },
      pen: {
        title360: 'Strafrunde 360°', warn: 'Advarsel',
        do360: 'Sejl én hel runde rundt (360°) – tryk STRAFRUNDE, så hjælper jeg.',
        easy: 'På Let-niveau slipper du for strafrunden – men husk reglen næste gang!',
        done: 'Strafrunde klaret!',
        progress: 'Strafrunde',
        right: 'Du havde ret! {offender} skulle have holdt af vejen og tager en strafrunde.',
        rightTitle: 'Du havde ret',
        timePen: '+{n} sek. straf for strafrunder, du ikke tog.',
        ai: 'Strafrunde!',
      },
      rule: { R31: 'Rør ikke mærket', R31text: 'Du rørte mærket! Mærker må ikke røres under kapsejlads.' },
      fx: {
        perfect: 'Perfekt start!', good: 'God start!', mark: 'Mærke {n}!', place: '{n}. plads', up: '+{n} plads!',
        gust: 'Pust!', lift: 'Rummer!', header: 'Skralder!', tack: 'Vending!', gybe: 'Bomning!', ocs: 'X – for tidligt!',
        finish: 'I MÅL!', win: 'SEJR!', plane: 'Planing!',
      },
      res: {
        title1: 'Du vandt sejladsen!', title2: '2. plads – flot!', title3: '3. plads – på podiet!', titleN: '{place}. plads!',
        msg: 'Du kom i mål som nr. {place} af {of} på {time}.',
        dnf: 'Du nåede ikke i mål denne gang. Prøv igen – du kan godt!',
        dnfTitle: 'Ikke i mål',
        table: 'Resultatliste', pos: 'Nr.', boat: 'Båd', time: 'Tid', pts: 'Point', still: 'sejler', est: '≈',
        series: 'Serien: {pts} point efter {n} af {of} sejladser',
      },
      stat: { points: 'Point (lavpoint)', series: 'Seriepoint', start: 'Start', ocs: 'Tyvstart (X)', fouls: 'Regelbrud', top: 'Topfart (knob)' },
      startQ: { perfect: 'Perfekt', good: 'God', late: 'Sen', ocs: 'Over for tidligt' },
    },
  });
  KOS.I18n.add('en', {
    race: {
      hud: { leg: 'Leg', toStart: 'To start', fleet: 'Fleet', you: 'You', finished: 'Finished', lap: 'Lap {n}/{of}', shift: 'Wind shift', lift: 'lift', header: 'header' },
      leg: { start: 'Start', beat: 'Beat', reach: 'Reach', run: 'Run', finish: 'Finish', done: 'Finished' },
      seq: { warn: '60 s', prep: '48 s', one: '12 s', go: 'Start', short: 'The start sequence is shortened: 5-4-1-0 takes one minute' },
      flag: { cls: 'Class flag', P: 'P flag', X: 'X flag' },
      btn: { ff: 'Fast forward', layl: 'Laylines', next: 'Continue' },
      intro: 'Race time! Be right behind the start line when the gun goes.',
      introBay: 'Be right behind the start line when the horn goes. Then up to mark 1!',
      card: { kicker: 'Race', title: 'Ready to start?', goal: 'Sail up to the start line and cross it just after the horn. Then round the marks and finish.', skip: 'Do not want to wait? Tap » to fast-forward.', go: 'Sail!' },
      keys: 'Keyboard: ←/→ steer · ↑/↓ sheet · L laylines · T penalty turn',
      sig: {
        warn: 'Warning signal! The class flag goes up. A real start is 5-4-1-0 minutes – here we run it 5 times faster.',
        prep: 'Preparatory signal! The P flag goes up. The racing rules apply now.',
        one: 'One minute! The P flag comes down. Get ready to sail for the line.',
        go: 'START! Go, go, go!',
        ocs: 'The X flag is up – you were over the line too early! Turn back below the line and start again.',
        ocsOk: 'Good! You are below the line again – cross it and go.',
        ocsOthers: 'X flag: some boats were over early and must go back.',
      },
      tip: {
        bias: 'The line is skewed: the {end} end is closer to the wind. Start there and you are ahead from the gun!',
        biasPin: 'pin', biasBoat: 'committee boat',
        ff: 'Tap "Fast forward" to skip the waiting.',
        laylines: 'The dashed lines are laylines. When you hit one, tack and you will just make the mark.',
        gust: 'Gust coming! The dark ripples on the water mean more speed – sail into them.',
        lift: 'The wind is lifting you – you can point higher. Stay on this tack!',
        header: 'The wind is heading you – you have to bear away. When headed, tack!',
        wrongSide: 'Oops – leave the mark to port (mark on your left). Go back and round it properly.',
        zone: 'The dashed circle is the 3-length zone. The inside boat in the zone gets mark-room.',
        lastLeg: 'Last leg – this is it! Home across the finish line.',
        penLeft: 'You still owe a penalty turn. Do it now – or you get a time penalty at the finish.',
        irons: 'You are in irons! Push the tiller to one side and the bow falls off.',
        heel: 'The boat is heeling a lot – hike out!',
        rail: 'Hike out! When the breeze builds, the crew sits on the rail – the boat heels less and sails faster.',
        finishLine: 'The finish line is between the committee boat and the pin.',
        capsize: 'Capsized! Back up – the race is not over!',
        missLine: 'You have not started yet! Go back and cross the start line BETWEEN the committee boat and the pin.',
      },
      pen: {
        title360: 'Penalty turn 360°', warn: 'Warning',
        do360: 'Sail one full circle (360°) – tap PENALTY TURN and I will help.',
        easy: 'On Easy you skip the penalty turn – but remember the rule next time!',
        done: 'Penalty turn done!',
        progress: 'Penalty turn',
        right: 'You had right of way! {offender} should have kept clear and is doing a penalty turn.',
        rightTitle: 'Your right of way',
        timePen: '+{n} s penalty for turns you did not take.',
        ai: 'Penalty turn!',
      },
      rule: { R31: 'Don\'t touch the mark', R31text: 'You touched the mark! Marks must not be touched while racing.' },
      fx: {
        perfect: 'Perfect start!', good: 'Good start!', mark: 'Mark {n}!', place: '{n}. place', up: '+{n} place!',
        gust: 'Gust!', lift: 'Lift!', header: 'Header!', tack: 'Tack!', gybe: 'Gybe!', ocs: 'X – too early!',
        finish: 'FINISHED!', win: 'VICTORY!', plane: 'Planing!',
      },
      res: {
        title1: 'You won the race!', title2: '2nd place – great!', title3: '3rd place – on the podium!', titleN: 'Place {place}!',
        msg: 'You finished {place} of {of} in {time}.',
        dnf: 'You did not finish this time. Try again – you can do it!',
        dnfTitle: 'Did not finish',
        table: 'Results', pos: 'Pos', boat: 'Boat', time: 'Time', pts: 'Pts', still: 'racing', est: '≈',
        series: 'Series: {pts} points after {n} of {of} races',
      },
      stat: { points: 'Points (low point)', series: 'Series points', start: 'Start', ocs: 'Over early (X)', fouls: 'Fouls', top: 'Top speed (kn)' },
      startQ: { perfect: 'Perfect', good: 'Good', late: 'Late', ocs: 'Over early' },
    },
  });

  // ======================================================================== 2. activities (championship ladder)
  const BOAT_STARS = (KOS.App && KOS.App.BOAT_STARS) || { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90 };
  // per class: championship name, venue, and a list of races [fleet, windKn, course, laps, gust, shift, bias, targetS]
  const SERIES = [
    { cls: 'opti', venue: 'bay', name: { da: 'Klubmesterskab', en: 'Club Championship' }, wind: 230, races: [
      [3, 6, 'wl', 1, 0.35, 0.2, 0, 140], [5, 7, 'tri', 1, 0.45, 0.3, 6, 170], [7, 8, 'wl', 2, 0.5, 0.35, -5, 200]] },
    { cls: 'tera', venue: 'sound', name: { da: 'Tera Cup', en: 'Tera Cup' }, wind: 210, races: [
      [5, 7, 'wl', 1, 0.4, 0.3, 4, 150], [7, 9, 'tri', 1, 0.5, 0.35, -6, 180]] },
    { cls: 'feva', venue: 'sound', name: { da: 'Feva Duo', en: 'Feva Duo' }, wind: 200, races: [
      [5, 9, 'wl', 1, 0.45, 0.3, 5, 150], [7, 10, 'tri', 1, 0.5, 0.35, -5, 180], [9, 11, 'wl', 2, 0.55, 0.4, 7, 220]] },
    { cls: 'zest', venue: 'sound', name: { da: 'Zest Trophy', en: 'Zest Trophy' }, wind: 240, races: [
      [5, 8, 'wl', 1, 0.4, 0.3, -4, 150], [7, 10, 'tri', 1, 0.5, 0.4, 6, 180], [9, 11, 'wl', 2, 0.55, 0.45, -7, 220]] },
    { cls: 'ilca', venue: 'sound', name: { da: 'ILCA Øresund', en: 'ILCA Øresund' }, wind: 225, races: [
      [7, 10, 'wl', 1, 0.5, 0.35, 5, 160], [9, 12, 'tri', 1, 0.55, 0.4, -6, 190], [11, 14, 'wl', 2, 0.6, 0.45, 8, 230]] },
    { cls: '29er', venue: 'sound', name: { da: '29er Skiff Series', en: '29er Skiff Series' }, wind: 215, races: [
      [5, 11, 'wl', 1, 0.5, 0.35, 4, 150], [7, 13, 'wl', 2, 0.55, 0.4, -6, 200], [9, 14, 'tri', 1, 0.6, 0.45, 7, 190], [11, 16, 'wl', 2, 0.65, 0.5, -8, 230]] },
    { cls: 'hboat', venue: 'sound', name: { da: 'H-båd Nordhavn', en: 'H-boat Nordhavn' }, wind: 250, races: [
      [5, 9, 'wl', 1, 0.4, 0.3, 5, 170], [7, 11, 'tri', 1, 0.5, 0.35, -5, 200], [9, 13, 'wl', 2, 0.55, 0.4, 7, 240]] },
    { cls: 'j70', venue: 'sound', name: { da: 'J70 Sound Series', en: 'J70 Sound Series' }, wind: 205, races: [
      [5, 11, 'wl', 1, 0.45, 0.35, 5, 160], [7, 13, 'wl', 2, 0.5, 0.4, -6, 210], [9, 15, 'tri', 1, 0.55, 0.45, 7, 200], [11, 17, 'wl', 2, 0.6, 0.5, -8, 240]] },
  ];
  const COURSE_TXT = {
    wl: { da: 'op-og-ned-bane (kryds og læns)', en: 'windward-leeward course' },
    tri: { da: 'trekantbane (kryds, slør, slør)', en: 'triangle course (beat, reach, reach)' },
  };
  const acts = [];
  SERIES.forEach((s, si) => {
    const bn = (KOS.Boats && KOS.Boats.get(s.cls) || {}).name || s.cls;
    s.races.forEach((r, ri) => {
      const [fleet, kn, course, laps, gust, shift, bias, targetS] = r;
      const id = 'race.' + s.cls + '.' + (ri + 1);
      const ct = COURSE_TXT[course];
      acts.push({
        id, mode: 'race', area: 'race', boat: s.cls, order: 10 + si * 10 + ri, icon: ri === s.races.length - 1 ? 'trophy' : 'flag',
        minutes: Math.round(targetS / 60 + 2), difficulty: Math.min(5, 1 + Math.floor(si / 2) + (ri > 1 ? 1 : 0)),
        unlock: ri === 0 ? (si === 0 ? null : { stars: BOAT_STARS[s.cls] || 0 }) : { after: 'race.' + s.cls + '.' + ri },
        title: { da: s.name.da + ' · Sejlads ' + (ri + 1), en: s.name.en + ' · Race ' + (ri + 1) },
        desc: {
          da: bn + ' mod ' + fleet + ' andre både på en ' + ct.da + (laps > 1 ? ', ' + laps + ' omgange' : '') + '. {wind} vind.',
          en: bn + ' against ' + fleet + ' other boats on a ' + ct.en + (laps > 1 ? ', ' + laps + ' laps' : '') + '. {wind} of wind.',
        },
        params: {
          series: s.cls, race: ri + 1, races: s.races.length, venue: s.venue, course, laps, fleet,
          windDeg: s.wind + (ri % 2 ? 12 : -8) * (si % 2 ? 1 : -1), windKn: kn, gust, shift, bias, targetS,
          seed: 101 + si * 17 + ri * 5,
        },
      });
    });
  });
  KOS.Activities.add(acts);

  // ======================================================================== helpers (pure)
  const NAMES = ['Freja', 'Oscar', 'Ida', 'Malthe', 'Alma', 'Noah', 'Clara', 'Viggo', 'Ellen', 'Karl', 'Asta', 'Johan', 'Sofie', 'Lukas', 'Ella', 'Storm', 'Agnes', 'Valdemar', 'Liva', 'Aksel', 'Silke', 'Bertram'];
  const HULLS = ['#e8323c', '#1a7fd4', '#18a957', '#ffd21f', '#8a5cf6', '#ff7a3d', '#13b5c8', '#e85aa8', '#ffffff', '#2b3a55', '#9fd36b', '#c0c6d0'];
  const CLASS_FLAG = {
    opti: { bg: '#ffffff', fg: '#1a5fd4', txt: 'OP' }, tera: { bg: '#18a957', fg: '#fff', txt: 'T' },
    feva: { bg: '#ff7a3d', fg: '#fff', txt: 'F' }, zest: { bg: '#13b5c8', fg: '#fff', txt: 'Z' },
    ilca: { bg: '#e8323c', fg: '#fff', txt: 'IL' }, '29er': { bg: '#1d2433', fg: '#ffd21f', txt: '29' },
    hboat: { bg: '#1a5fd4', fg: '#fff', txt: 'H' }, j70: { bg: '#ffd21f', fg: '#1d2433', txt: 'J' },
  };
  // shortened 5-4-1-0 sequence (sim seconds before the gun)
  const SEQ = { warn: 60, prep: 48, one: 12 };
  const PRE = 68; // the run starts this many seconds before the gun

  function flagSvg(kind, cls) {
    const box = (inner, bg) => '<svg viewBox="0 0 36 26" class="race-flagsvg" aria-hidden="true"><rect x="0.5" y="0.5" width="35" height="25" rx="2" fill="' + bg + '" stroke="rgba(0,0,0,.35)"/>' + inner + '</svg>';
    if (kind === 'P') return box('<rect x="11" y="7.5" width="14" height="11" fill="#fff"/>', '#1a5fd4');
    if (kind === 'X') return box('<rect x="15" y="0.5" width="6" height="25" fill="#1a5fd4"/><rect x="0.5" y="10" width="35" height="6" fill="#1a5fd4"/>', '#ffffff');
    const c = CLASS_FLAG[cls] || CLASS_FLAG.opti;
    return box('<text x="18" y="18" text-anchor="middle" font-size="' + (c.txt.length > 1 ? 12 : 15) + '" font-weight="900" fill="' + c.fg + '" font-family="ui-rounded,Segoe UI,system-ui,sans-serif">' + c.txt + '</text>', c.bg);
  }

  function starsForPlace(place, n, assist) {
    if (place === 1) return 3;
    if (assist === 'easy') return place <= Math.max(2, Math.ceil(n / 3)) ? 3 : place <= Math.ceil(n * 2 / 3) ? 2 : 1;
    if (assist === 'pro') return place <= Math.max(2, Math.ceil(n / 4)) ? 2 : 1;
    return place <= Math.max(2, Math.ceil(n / 2)) ? 2 : 1;
  }

  // ---- results table on the app's results screen (module level: the instance is gone by then)
  function injectTable(screen) {
    if (screen !== 'results') return;
    const lr = KOS.App && KOS.App.run && KOS.App.run.lastResult;
    const tb = lr && lr.result && lr.result.raceTable;
    if (!tb || !lr.activity || lr.activity.mode !== 'race') return;
    const card = document.querySelector('#screen-results .results-card');
    if (!card || card.querySelector('.race-rtable')) return;
    const esc = KOS.UI.esc;
    const wrap = document.createElement('div');
    wrap.className = 'race-rtable';
    let h = '<div class="race-rt-head">' + KOS.UI.iconSvg('trophy') + '<span>' + esc(t('race.res.table')) + '</span></div><table><thead><tr><th>' + esc(t('race.res.pos')) +
      '</th><th class="l">' + esc(t('race.res.boat')) + '</th><th>' + esc(t('race.res.time')) + '</th><th>' + esc(t('race.res.pts')) + '</th></tr></thead><tbody>';
    tb.rows.forEach(r => {
      h += '<tr class="' + (r.me ? 'me' : '') + (r.place <= 3 ? ' pod p' + r.place : '') + '"><td><b class="race-medal">' + r.place + '</b></td><td class="l"><i class="race-dot" style="background:' + esc(r.color) + '"></i>' +
        esc(r.name) + ' <small>' + esc(r.sailNo) + '</small>' + (r.ocs ? ' <em class="race-x">X</em>' : '') + '</td><td>' + (r.timeMs == null ? '<small>' + esc(t('race.res.still')) + '</small>' : (r.est ? '<small>' + esc(t('race.res.est')) + '</small>' : '') + esc(KOS.UI.fmtTime(r.timeMs))) +
        '</td><td>' + r.pts + '</td></tr>';
    });
    h += '</tbody></table>';
    if (tb.series) h += '<div class="race-rt-series">' + KOS.UI.iconSvg('medal') + esc(tb.series) + '</div>';
    wrap.innerHTML = h;
    const stats = card.querySelector('.results-stats');
    if (stats) card.insertBefore(wrap, stats); else card.appendChild(wrap);
  }
  if (KOS.Events && KOS.Events.on) KOS.Events.on('screen', injectTable);

  // ======================================================================== 3. the mode
  KOS.Modes.register('race', { kind: 'sea', create(host, activity) { return createRace(host, activity); } });

  function createRace(host, activity) {
    const P = Object.assign({ series: 'opti', race: 1, races: 1, venue: 'sound', course: 'wl', laps: 1, fleet: 5, windDeg: 220, windKn: 8,
      gust: 0.4, shift: 0.3, bias: 0, targetS: 160, seed: 7 }, activity.params || {});
    const assist = host.assist || 'easy';
    const venue = KOS.World.get(P.venue || 'sound');
    const rand = U.rng((P.seed || 1) * 7919 + 3);
    const clsId = KOS.Boats.get(activity.boat || host.boat) ? (activity.boat || host.boat) : 'opti';
    const cls = KOS.Boats.get(clsId);
    const L = cls.length;
    const profile = host.profile || {};
    const wd = U.rad(P.windDeg);
    const S = {
      phase: 'pre', clock: -PRE, raceT: 0, hudT: 0, ambT: 0, rankT: 0, tips: {}, tipT: -99, introT: 0,
      sig: {}, flags: { cls: false, P: false, X: false }, xT: 0, ff: false, fin: [], finishT: -1, result: null,
      pen: null, penServed: 0, penOwedEnd: 0, fouls: 0, cool: {}, place: 0, lastPlace: 0, topKn: 0, startQ: null,
      shiftRef: null, shiftT: 0, gustOn: false, laylines: assist === 'easy', boardT: 0, waitT: 0, done: false,
    };

    // ---------------------------------------------------------------- course geometry
    const up = U.vec(wd), right = U.vec(wd + Math.PI / 2);
    const nBoats = P.fleet + 1;
    const lineLen = Math.max(28, 1.9 * L * nBoats + 14);
    // beat length: scale so that a good boat sails the course in about targetS seconds
    // mark spots in (u = upwind, r = to the right) metres from the line centre. The leeward marks sit off the pin end,
    // clear of the start area.
    const side = (B) => -lineLen / 2 - Math.max(10, 3 * L) - 0.08 * B;
    const LAY = {
      m1: B => [B, 0],
      m2: B => P.course === 'tri' ? [0.5 * B, -0.75 * B] : [0.12 * B, side(B)],
      m3: B => P.course === 'tri' ? [0.1 * B, side(B)] : [-0.15 * B, side(B)],
    };
    function coursePts(B, O) {
      const at = (u, r) => ({ x: O.x + up.x * u + right.x * r, y: O.y + up.y * u + right.y * r });
      const m1 = at(B, 0);
      const pts = [at(-0.05 * B, 0), m1];
      if (P.course === 'tri') {
        const m2 = at(...LAY.m2(B)), m3 = at(...LAY.m3(B));
        pts.push(m2, m3);
        for (let l = 1; l < P.laps; l++) pts.push(m1, m3);
        pts.push(at(0, 0));
      } else {
        const m2 = at(...LAY.m2(B));
        for (let l = 1; l < P.laps; l++) pts.push(m2, m1);
        pts.push(at(0, 0));
      }
      return pts;
    }
    const RT = (KOS.SailMode && KOS.SailMode.routeTime) || ((c, tws, w, pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += U.dist(pts[i - 1], pts[i]) / 1.5; return s; });
    const t1 = RT(cls, P.windKn, wd, coursePts(100, { x: 0, y: 0 })), t2 = RT(cls, P.windKn, wd, coursePts(200, { x: 0, y: 0 }));
    const slope = (t2 - t1) / 100, icpt = t1 - slope * 100;
    const B = U.clamp((P.targetS * 0.8 - icpt) / Math.max(0.05, slope), Math.max(65, 20 * L), 480);

    function okSpot(x, y, margin) {
      if (KOS.World.isSolid(venue, x, y)) return false;
      if (KOS.World.depthAt(venue, x, y) < (cls.draft || 1) + 0.6) return false;
      if (KOS.World.inZone(venue, x, y, 'swim')) return false;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, px = x + Math.cos(a) * margin, py = y + Math.sin(a) * margin;
        if (KOS.World.isSolid(venue, px, py) || KOS.World.inZone(venue, px, py, 'swim') || KOS.World.depthAt(venue, px, py) < (cls.draft || 1) + 0.3) return false;
      }
      return true;
    }
    function fits(O) {
      const at = (u, r) => ({ x: O.x + up.x * u + right.x * r, y: O.y + up.y * u + right.y * r });
      const probes = [at(0, -lineLen / 2 - 10), at(0, lineLen / 2 + 10), at(B + 15, 0), at(-Math.max(40, 12 * L), 0), at(B * 0.5, -B * 0.4), at(B * 0.5, B * 0.4),
        at(B * 0.5, -0.7 * B), at(-20, -lineLen / 2), at(-20, lineLen / 2), at(...LAY.m2(B)), at(...LAY.m3(B))];
      return probes.every(p => okSpot(p.x, p.y, 12));
    }
    let O = null;
    const area = venue.courseArea || (P.venue === 'bay' ? { x: -290, y: -640, r: 260 } : { x: venue.spawn.x, y: venue.spawn.y, r: 400 });
    for (let k = 0; k < 260 && !O; k++) {
      const rr = k === 0 ? 0 : area.r * Math.sqrt(rand()), a = rand() * TAU;
      const c = { x: area.x + Math.cos(a) * rr, y: area.y + Math.sin(a) * rr };
      const o = { x: c.x - up.x * B * 0.4, y: c.y - up.y * B * 0.4 };
      if (fits(o)) O = o;
    }
    if (!O) O = { x: area.x - up.x * B * 0.4, y: area.y - up.y * B * 0.4 };
    const at = (u, r) => ({ x: O.x + up.x * u + right.x * r, y: O.y + up.y * u + right.y * r });

    const bias = U.rad(P.bias || 0), h = lineLen / 2;
    const pin = Object.assign(at(h * Math.sin(bias), -h * Math.cos(bias)), { kind: 'pin', r: 0.9, id: 'pin' });
    const com = Object.assign(at(-h * Math.sin(bias), h * Math.cos(bias)), { kind: 'committee', r: 3.4, id: 'committee', heading: wd });
    const line = { a: pin, b: com };
    let nrm = U.vec(U.bearing(pin, com) + Math.PI / 2);
    if (nrm.x * up.x + nrm.y * up.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
    const sOf = (x, y) => (x - pin.x) * nrm.x + (y - pin.y) * nrm.y; // > 0 = course side
    const mid = { x: (pin.x + com.x) / 2, y: (pin.y + com.y) / 2 };
    const m1 = Object.assign(at(B, 0), { kind: 'orange', round: 'port', label: '1', r: 1.2, id: 'm1', upwind: true });
    const marks = [m1];
    let m2 = null, m3 = null;
    if (P.course === 'tri') {
      m2 = Object.assign(at(...LAY.m2(B)), { kind: 'orange', round: 'port', label: '2', r: 1.2, id: 'm2' });
      m3 = Object.assign(at(...LAY.m3(B)), { kind: 'orange', round: 'port', label: '3', r: 1.2, id: 'm3' });
      marks.push(m2, m3);
    } else if (P.laps > 1) {
      m2 = Object.assign(at(...LAY.m2(B)), { kind: 'orange', round: 'port', label: '2', r: 1.2, id: 'm2' });
      marks.push(m2);
    }
    // the sequence every boat sails: start, marks..., finish (W-L finishes downwind through the line, triangle upwind)
    const seq = [{ type: 'start' }];
    if (P.course === 'tri') { seq.push({ type: 'mark', m: m1 }, { type: 'mark', m: m2 }, { type: 'mark', m: m3 }); for (let l = 1; l < P.laps; l++) seq.push({ type: 'mark', m: m1 }, { type: 'mark', m: m3 }); }
    else { seq.push({ type: 'mark', m: m1 }); for (let l = 1; l < P.laps; l++) seq.push({ type: 'mark', m: m2 }, { type: 'mark', m: m1 }); }
    seq.push({ type: 'finish', dir: P.course === 'tri' ? 'up' : 'down' });
    const ptOf = it => it.type === 'mark' ? it.m : mid;
    const legLen = seq.map((it, i) => i === 0 ? 0 : U.dist(ptOf(seq[i - 1]), ptOf(it)));
    const remAfter = seq.map((_, i) => legLen.slice(i + 1).reduce((a, b) => a + b, 0));
    function legKind(i) {
      const it = seq[i]; if (!it) return 'done';
      if (it.type === 'start') return 'start';
      const from = ptOf(seq[i - 1]), to = ptOf(it);
      const a = Math.abs(U.wrapPi(U.bearing(from, to) - wd));
      const k = a < U.rad(70) ? 'beat' : a > U.rad(150) ? 'run' : 'reach';
      return it.type === 'finish' && k === 'beat' ? 'beat' : k;
    }
    const zoneR = 3 * L;
    const roundR = Math.min(Math.max(22, 7 * L), 0.4 * B);
    const collMarks = marks.concat([pin, com]);

    // ---------------------------------------------------------------- wind
    const wind = KOS.Wind.create({ dir: wd, speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: mid.x - 300, y0: mid.y - 300, x1: mid.x + 300, y1: mid.y + 300 } });
    for (let i = 0; i < 240; i++) wind.update(0.5);
    const env = { wind, venue, assist, t: 0 };

    // ---------------------------------------------------------------- boats
    const crew2 = cls.crew >= 2;
    const names = NAMES.filter(n => n.toLowerCase() !== String(profile.name || '').trim().toLowerCase());
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const x = names[i]; names[i] = names[j]; names[j] = x; }
    const fs = KOS.AI.fleetSkill(profile, assist, KOS.Storage && KOS.Storage.totalStars ? KOS.Storage.totalStars() : 0); // fleet strength follows the player's level
    const skillR = [fs.lo, fs.hi];
    const lvl = U.clamp((P.race - 1) / Math.max(1, P.races - 1), 0, 1) * 0.08;
    const boats = [];
    const startRow = (i) => { // spread along below the line
      const f = (i + 0.5) / nBoats;
      const r = U.lerp(-lineLen * 0.55, lineLen * 0.55, f);
      const u = -Math.max(22, 7 * L) - (i % 2) * Math.max(8, 2.5 * L);
      return at(u, r);
    };
    const pStart = startRow(Math.floor(nBoats / 2));
    const startSpeed = U.ms(cls.polar(Math.PI / 2, P.windKn)) * 0.5;
    const me = KOS.Physics.createBoat(clsId, { x: pStart.x, y: pStart.y, heading: U.wrapPi(wd - Math.PI / 2 - 0.2), speed: startSpeed, isPlayer: true,
      sailNo: 'DEN ' + (profile.sailNo || 1), name: profile.name || t('race.hud.you'), colors: profile.boatColor ? { hull: profile.boatColor } : undefined });
    me.noTag = true;
    boats.push(me);
    const ai = [];
    let slot = 0;
    for (let i = 0; i < P.fleet; i++) {
      if (slot === Math.floor(nBoats / 2)) slot++;
      const p = startRow(slot++);
      const nm = crew2 ? names[(2 * i) % names.length] + ' & ' + names[(2 * i + 1) % names.length] : names[i % names.length];
      const short = names[(crew2 ? 2 * i : i) % names.length];
      const b = KOS.Physics.createBoat(clsId, { x: p.x, y: p.y, heading: U.wrapPi(wd + (i % 2 ? 1 : -1) * (Math.PI / 2 + 0.2)), speed: startSpeed,
        sailNo: 'DEN ' + (100 + Math.floor(rand() * 899)), name: nm, colors: { hull: HULLS[(i + P.seed) % HULLS.length] } });
      b.short = short;
      const skill = U.clamp(U.lerp(skillR[0], skillR[1], i / Math.max(1, P.fleet - 1)) + lvl + (rand() - 0.5) * 0.08, 0.05, 0.98);
      b.helm = KOS.AI.createHelm(b, { skill, aggression: 0.3 + rand() * 0.5, seed: P.seed * 31 + i });
      b.pace = KOS.AI.paceFor(skill, fs);
      boats.push(b); ai.push(b);
    }
    // per-boat race tracker
    boats.forEach(b => { b.rc = { leg: 0, wind: 0, minD: 1e9, prevB: null, ocs: false, started: false, finT: null, place: 0, rem: 0, pen: null, wrongTip: false, startT: null }; });
    // AI course = our sequence (index for index), the start line first; plan.leg keeps each helm in step with our tracker
    const lp = f => ({ x: U.lerp(pin.x, com.x, f), y: U.lerp(pin.y, com.y, f) });
    // each boat aims at its own bit of the finish line, so the fleet doesn't pile up at the middle
    const courseFor = f => seq.map(it => it.type === 'mark' ? { x: it.m.x, y: it.m.y, round: 'port' } : it.type === 'finish' ? { line: [lp(Math.max(0.05, f - 0.12)), lp(Math.min(0.95, f + 0.12))] } : { line: [pin, com] });
    let park = at(-Math.max(30, 8 * L), lineLen / 2 + Math.max(25, 5 * L)); // where finished boats wait (below the committee boat)
    if (!okSpot(park.x, park.y, 8)) park = at(-Math.max(30, 8 * L), -lineLen / 2 - Math.max(25, 5 * L));
    const planFor = i => ({ course: courseFor(0.2 + 0.6 * ((i * 0.618 + 0.3) % 1)), start: { line: [pin, com], t0: PRE }, marks, mode: 'race', leg: 0 });
    boats.forEach((b, i) => { b.plan = planFor(i); });
    const parkPlan = { target: { x: park.x, y: park.y, r: 6 }, leg: 0 };
    let controls = KOS.Physics.controls();
    controls.autoTrim = assist !== 'pro';
    controls.autoHike = assist === 'easy';
    const monitor = KOS.Rules.monitor({ mode: 'race', cooldown: 1 });

    // ---------------------------------------------------------------- scene, input, HUD
    const scene = new KOS.SailScene(host.canvas, { tilt: host.tilt, tiltAuto: host.tiltAuto, venue, wind, boats, follow: me, marks: marks.concat([pin]), lines: [{ a: pin, b: com, kind: 'start' }],
      showWindArrow: true, showNoGo: false, showLaylines: false });
    const pathLine = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, kind: 'path' };
    scene.addOverlay(drawWorld);
    // under tilt the committee boat is a depth-sorted scene prop (its mast must not paint over boats south of it); flat keeps the overlay call
    scene.props.push({ x: com.x, y: com.y, draw(ctx, sc, tl) { if (KOS.Sprites && KOS.Sprites.drawCommittee) KOS.Sprites.drawCommittee(ctx, com.x, com.y, wd, { t: sc.t, windDir: wind.dir, flags: committeeFlags(), tilt: tl }); } });
    scene.addOverlay(drawTargetArrow, { screen: true });
    let userZoom = 1;
    function applyZoom() {
      const small = Math.min(scene.w, scene.h) < 600;
      const span = (44 + 5.5 * L) * (small ? 0.85 : 1);
      scene.setZoom(1);
      const base = scene.baseZoom() / (1 + U.clamp(Math.abs(me.speed) / 25, 0, 0.35));
      scene.setZoom(Math.sqrt(scene.w * scene.h) * (small ? 1.3 : 1) / span / base * userZoom);
    }
    applyZoom();
    // course overview first, then ease in on the boat
    const cb = { x0: Math.min(pin.x, com.x, m1.x, (m2 || m1).x, (m3 || m1).x, me.x) - 20, y0: Math.min(pin.y, com.y, m1.y, (m2 || m1).y, (m3 || m1).y, me.y) - 20,
      x1: Math.max(pin.x, com.x, m1.x, (m2 || m1).x, (m3 || m1).x, me.x) + 20, y1: Math.max(pin.y, com.y, m1.y, (m2 || m1).y, (m3 || m1).y, me.y) + 20 };

    function fitCourse() { scene.resize(); if (scene.w > 160 && scene.h > 160) scene.fit(cb, Math.min(60, scene.w * 0.12)); }

    const extra = [{ id: 'ff', icon: 'forward', labelKey: 'race.btn.ff', key: 'G' }, { id: 'layl', icon: 'compass', labelKey: 'race.btn.layl', key: 'L' }];
    if (assist !== 'easy') extra.push({ id: 'turn', icon: 'turn', labelKey: 'input.turn', key: 'T' });
    const ctrl = KOS.Input.attach(host.layer, Object.assign({
      layout: 'sail', spinnaker: cls.hasSpinnaker !== 'none', spinnakerKind: cls.hasSpinnaker === 'asym' ? 'asym' : 'spi',
      hike: assist !== 'easy', hikeKeel: !!cls.keel, autoTrim: controls.autoTrim, pauseButton: false, extraButtons: extra,
    }, KOS.SailAids.inputOpts(cls, assist))); // + daggerboard button / jib slider on Normal/Pro
    const aids = KOS.SailAids.create({ ctrl, boat: me, assist, coach: txt => say(txt) });
    ctrl.on('ff', () => { if (S.phase === 'pre' && S.clock < -14) { S.ff = !S.ff; sfx('whoosh', { vol: 0.5 }); ctrl.highlight('ff', S.ff); } });
    ctrl.on('layl', () => { S.laylines = !S.laylines; sfx('rigClick'); ctrl.highlight('layl', S.laylines); if (S.laylines) tip('laylines'); });
    ctrl.on('turn', () => { if (S.pen) { S.pen.auto = true; sfx('tap'); } });
    ctrl.highlight('layl', S.laylines);
    host.layer.classList.add('race-layer');

    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', 'timer', 'place']);
    const panel = document.createElement('div');
    panel.className = 'race-panel glass';
    host.layer.appendChild(panel);
    const card = document.createElement('div');
    card.className = 'race-card';
    host.layer.appendChild(card);
    let cardTimer = null, coachH = null;
    let board = null;

    const handlers = {
      'boat:tack': e => { if (e.boat === me) sfx('tack'); },
      'boat:gybe': e => { if (e.boat === me) { sfx('gybe'); scene.shake(0.2); } },
      'boat:irons': e => { if (e.boat === me && S.phase !== 'pre') tip('irons'); },
      'boat:heelWarn': e => { if (e.boat === me && !controls.autoHike) { tip('heel'); ctrl.highlight('hike', true); setTimeout(() => ctrl.highlight('hike', false), 2500); } },
      'boat:plane': e => { if (e.boat === me) { sfx('whoosh', { vol: 0.7 }); floatText(t('race.fx.plane'), '#3ee08f'); } },
      'boat:capsize': e => { if (e.boat === me) { sfx('splash'); tip('capsize', true); } },
      'boat:collide': e => { if (e.a === me || e.b === me) sfx('bump', { vol: Math.min(1, 0.3 + (e.speed || 0) / 3) }); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);
    const onWheel = e => { if (e.target.closest && e.target.closest('.kc,.race-board')) return; e.preventDefault(); userZoom = U.clamp(userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.4, 2.5); applyZoom(); };
    host.layer.addEventListener('wheel', onWheel, { passive: false });

    // ==================================================================== small helpers
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function floatText(str, color, x, y, size) { if (scene.effects) scene.effects.text(x != null ? x : me.x, y != null ? y : me.y - 2, str, { color: color || '#fff', size: size || 22 }); }
    function tip(key, force, vars) {
      if (S.tips[key] && !force) return;
      if (env.t - S.tipT < 5 && !force) return;
      S.tips[key] = true; S.tipT = env.t;
      coachH = KOS.UI.coach(t('race.tip.' + key, vars), { ms: 5600 });
    }
    function say(text, ms, mood) { S.tipT = env.t; coachH = KOS.UI.coach(text, { ms: ms || 5600, mood }); }
    function hideCoach() { try { if (coachH && coachH.close) coachH.close(true); if (coachIntro && coachIntro.close) coachIntro.close(true); } catch (e) { /* optional */ } }
    function showCard(kind, title, sub) {
      card.className = 'race-card show ' + kind;
      card.innerHTML = '<div class="rc-ico">' + KOS.UI.iconSvg(kind === 'good' ? 'check' : kind === 'warn' ? 'info' : 'penalty') + '</div><div class="rc-txt"><b>' + KOS.UI.esc(title) + '</b>' +
        (sub ? '<span>' + KOS.UI.esc(sub) + '</span>' : '') + '</div>';
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => { card.className = 'race-card'; }, 6500);
    }
    function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

    // ==================================================================== start sequence
    function signals() {
      const T = -S.clock; // seconds to the gun
      if (!S.sig.warn && T <= SEQ.warn) { S.sig.warn = true; S.flags.cls = true; sfx('horn'); say(t('race.sig.warn')); pulseFlags(); }
      if (!S.sig.prep && T <= SEQ.prep) { S.sig.prep = true; S.flags.P = true; sfx('horn'); say(t('race.sig.prep')); pulseFlags(); setTimeout(() => biasTip(), 6500); }
      if (!S.sig.one && T <= SEQ.one) { S.sig.one = true; S.flags.P = false; sfx('hornLong'); say(t('race.sig.one')); pulseFlags(); if (S.ff) { S.ff = false; ctrl.highlight('ff', false); } }
      if (S.sig.one && T <= 5 && T > 0) { const n = Math.ceil(T); if (S.beep !== n) { S.beep = n; sfx('countdown', { pitch: 1 + (5 - n) * 0.05 }); } }
      if (S.ff && T <= 15) { S.ff = false; ctrl.highlight('ff', false); }
      if (T <= 0) gun();
    }
    function biasTip() {
      if (destroyed || S.phase !== 'pre' || Math.abs(P.bias || 0) < 3 || assist === 'pro') return;
      tip('bias', false, { end: t(P.bias > 0 ? 'race.tip.biasPin' : 'race.tip.biasBoat') });
    }
    function pulseFlags() { panel.classList.remove('pulse'); void panel.offsetWidth; panel.classList.add('pulse'); }
    function gun() {
      S.phase = 'race'; S.flags.cls = false; S.ff = false;
      host.layer.classList.add('race-go');
      sfx('horn', { vol: 1 });
      let anyOcs = false;
      for (const b of boats) {
        const rc = b.rc;
        let s;
        if (b === me) { const f = U.vec(b.heading, L / 2); s = sOf(b.x + f.x, b.y + f.y); rc.ocs = s > 0.1; }
        else { s = sOf(b.x, b.y); rc.ocs = s > 0.3; }
        if (!rc.ocs && s > 0) { rc.started = true; rc.startT = 0; setLeg(b, 1); }
        if (rc.ocs) anyOcs = true;
      }
      if (anyOcs) { S.flags.X = true; S.xT = 30; setTimeout(() => sfx('hornShort'), 450); }
      if (me.rc.ocs) {
        S.startQ = 'ocs'; sfx('whistle'); floatText(t('race.fx.ocs'), '#ff4d5e'); say(t('race.sig.ocs'), 7000, 'oops');
        showCard('bad', t('race.flag.X'), t('race.startQ.ocs'));
      } else {
        say(anyOcs ? t('race.sig.go') + ' ' + t('race.sig.ocsOthers') : t('race.sig.go'), 4000, 'wow');
        if (me.rc.started) startBonus(0);
      }
      pulseFlags();
    }
    function startBonus(late) {
      if (S.startQ) return;
      const dLine = Math.abs(sOf(me.x, me.y));
      if (late < 1.6 && dLine < 3 * L) { S.startQ = 'perfect'; floatText(t('race.fx.perfect'), '#ffd25e', null, null, 26); sfx('coin', { pitch: 1.3 }); if (scene.effects) scene.effects.stars(me.x, me.y, 16); }
      else if (late < 4) { S.startQ = 'good'; floatText(t('race.fx.good'), '#9fe7ff'); sfx('coin'); }
      else S.startQ = 'late';
    }

    // ==================================================================== race progress per boat
    function setLeg(b, n) { b.rc.leg = n; if (b.plan) b.plan.leg = n; resetLeg(b.rc); }
    function resetLeg(rc) { rc.wind = 0; rc.minD = 1e9; rc.prevB = null; rc.wrongTip = false; }
    function track(b, px, py) {
      const rc = b.rc;
      if (rc.finT != null) return;
      const s0 = sOf(px, py), s1 = sOf(b.x, b.y);
      const crossed = U.segCross(px, py, b.x, b.y, pin.x, pin.y, com.x, com.y);
      const it = seq[rc.leg];
      if (S.phase === 'pre') return;
      const hl = b.helm || (b === me ? autopilot : null);
      if (hl && !rc.ocs && hl.leg > rc.leg && hl.leg < seq.length && (rc.leg >= 1 || s1 > 0)) { if (rc.leg === 0) { rc.started = true; rc.startT = S.raceT; } setLeg(b, hl.leg); return; } // trust the AI helm's own rounding
      if (it.type === 'start') {
        if (rc.ocs) {
          if (s1 < -0.3) {
            rc.ocs = false;
            if (b === me) { say(t('race.sig.ocsOk'), 4000); sfx('pop'); }
          }
          return;
        }
        if (crossed && s0 <= 0 && s1 > 0) {
          rc.started = true; rc.startT = S.raceT; setLeg(b, 1);
          if (b === me) { startBonus(S.raceT); sfx('hornShort', { vol: 0.4 }); }
        }
        return;
      }
      if (it.type === 'finish') {
        const ok = it.dir === 'down' ? (s0 >= 0 && s1 < 0) : (s0 <= 0 && s1 > 0);
        let fin = crossed && ok;
        if (!fin && ((b.helm && b.helm.finished) || (b === me && autopilot && autopilot.finished))) fin = true; // the AI helm judged it
        if (fin) finished(b);
        return;
      }
      // a mark: winding number of the bearing mark→boat (string rule). Port rounding = anticlockwise = negative.
      const m = it.m, d = U.dist(b, m);
      const bb = U.heading(b.x - m.x, b.y - m.y);
      if (rc.prevB != null) rc.wind += U.wrapPi(bb - rc.prevB);
      rc.prevB = bb;
      if (d < rc.minD) rc.minD = d;
      if (rc.minD < roundR && rc.wind < -2.2) {
        setLeg(b, rc.leg + 1);
        if (b === me) markRounded(m);
      } else if (b === me && rc.minD < roundR && rc.wind > 2.2 && !rc.wrongTip) { rc.wrongTip = true; tip('wrongSide', true); sfx('whistle', { vol: 0.5 }); }
    }
    function markRounded(m) {
      sfx('bell'); sfx('coin', { pitch: 1.15 });
      floatText(t('race.fx.mark', { n: m.label }) + (S.place ? ' · ' + t('race.fx.place', { n: S.place }) : ''), '#ffb547', m.x, m.y - 2);
      if (scene.effects) { scene.effects.stars(m.x, m.y, 14); scene.effects.ripple(m.x, m.y, 4, 1); }
      KOS.Input.haptic && KOS.Input.haptic(20);
      if (seq[me.rc.leg] && seq[me.rc.leg].type === 'finish') { tip('lastLeg', true); }
      else if (legKind(me.rc.leg) === 'beat' && !S.laylines) tip('laylines');
    }
    function finished(b) {
      const rc = b.rc;
      rc.finT = S.raceT;
      S.fin.push(b);
      const place = S.fin.length;
      rc.place = place;
      if (b === me) playerFinished(place);
      else {
        const near = U.dist(b, me) < 150;
        sfx('hornShort', { vol: near ? 0.5 : 0.2 });
        if (near) floatText(place + '.', '#ffffff', b.x, b.y - 2, 18);
      }
    }
    function playerFinished(place) {
      S.phase = 'finish'; S.waitT = 0;
      host.layer.classList.add('race-done');
      hideCoach();
      sfx('hornLong');
      if (place <= 3) { sfx('cheer', { vol: 0.6 }); }
      if (place === 1) { try { KOS.UI.confetti(); } catch (e) { /* optional */ } }
      if (scene.effects) { scene.effects.confetti(me.x, me.y, place === 1 ? 160 : 80); scene.effects.text(me.x, me.y - 4, place === 1 ? t('race.fx.win') : t('race.fx.finish'), { color: '#ffd25e', size: 34 }); }
      scene.shake(0.3);
      buildBoard();
    }

    // ==================================================================== rules: fouls, mark touches, penalty turns
    function onFoul(f) {
      const now = env.t;
      if (S.phase === 'pre' && !S.sig.prep) return; // rules apply from the preparatory signal
      if (f.type === 'mark') {
        const b = f.offender;
        if (!b || b.rc.finT != null) return;
        const key = b.id + '|m|' + (f.mark && f.mark.id);
        const wasCool = S.cool[key] > now;
        S.cool[key] = now + (wasCool ? 12 : 25); // one penalty per mark visit: staying in contact does not charge again
        if (wasCool) return;
        if (f.mark && f.mark.id === 'committee') return;
        penalize(b, 1, 'R31', f);
        return;
      }
      const a = f.offender, v = f.victim;
      if (!a || !v || a.rc.finT != null || v.rc.finT != null) return;
      if (v.rc.pen) return; // RRS 22.2: a boat taking a penalty keeps clear and has no right of way (no chain of penalties round a spinning boat)
      const gap = KOS.Rules.hullGap ? KOS.Rules.hullGap(a, v) : 0;
      if (!f.contact) { // close call, no contact: the coach warns the player once in a while, no penalty
        if (a === me && gap < 0.4 * L && now > (S.closeT || 0)) { S.closeT = now + 25; say(t(f.reasonKey, f.reasonVars || {}), 5000, 'oops'); sfx('whistle', { vol: 0.4 }); }
        return;
      }
      const rel = Math.hypot(a.vx - v.vx, a.vy - v.vy);
      if (rel < 0.35) return; // a gentle rub is not worth a penalty
      if (a === me && now < (S.myFoulT || 0)) return;
      const key = a.id + '|' + v.id;
      if (S.cool[key] > now) return;
      S.cool[key] = now + 12;
      if (a === me) S.myFoulT = now + 15;
      penalize(a, 2, f.rule, f);
    }
    function penalize(b, sev, rule, f) {
      const turns = 1; // RRS rule 44: one turn (one tack and one gybe) for Part 2 fouls and rule 31 alike
      if (b === me) {
        S.fouls++;
        sfx('whistle');
        const title = rule === 'R31' ? t('race.rule.R31') : KOS.Rules.ruleName(rule);
        const why = rule === 'R31' ? t('race.rule.R31text') : t(f.reasonKey, f.reasonVars || {});
        if (assist === 'easy') {
          showCard('warn', t('race.pen.warn') + ' · ' + title, null);
          say(why + ' ' + t('race.pen.easy'), 8000, 'oops');
          return;
        }
        addPen(b, turns);
        showCard('bad', title, t('race.pen.title360'));
        say(why + ' ' + t('race.pen.do360'), 8500, 'oops');
        ctrl.highlight('turn', true);
        return;
      }
      // an AI boat broke a rule
      if (f && f.victim === me) {
        showCard('good', t('race.pen.rightTitle'), KOS.Rules.ruleName(rule));
        say(t('race.pen.right', { offender: b.short || b.name }), 5000);
      }
      if (assist === 'easy' && f && f.victim !== me && rule !== 'R31') return; // easy: AI only turns when it fouled you or a mark
      addPen(b, turns);
      if (U.dist(b, me) < 120) floatText(t('race.pen.ai'), '#ff9a3d', b.x, b.y - 3, 16);
    }
    function addPen(b, turns) {
      const rc = b.rc;
      if (!rc.pen) rc.pen = { need: 0, acc: 0, prevH: b.heading, auto: false, dir: 0, T: 0 };
      rc.pen.need += turns * TAU;
      if (b === me) { S.pen = rc.pen; host.layer.classList.add('race-pen'); }
    }
    function penStep(b, dt) {
      const p = b.rc.pen; if (!p) return;
      p.T += dt;
      const dh = U.wrapPi(b.heading - p.prevH); p.prevH = b.heading;
      if (!p.dir && Math.abs(p.acc + dh) > 0.4) p.dir = Math.sign(p.acc + dh);
      p.acc += dh;
      if (Math.abs(p.acc) >= p.need - 0.05) {
        b.rc.pen = null;
        if (b === me) {
          S.pen = null; S.penServed += Math.round(p.need / TAU);
          host.layer.classList.remove('race-pen'); ctrl.highlight('turn', false);
          sfx('coin', { pitch: 1.2 }); floatText(t('race.pen.done'), '#3ee08f');
          if (scene.effects) scene.effects.stars(me.x, me.y, 10);
        }
      }
    }
    // steer a penalty turn: keep turning one way, but build speed on a close reach first if the boat would stall head to wind
    function penControls(b, c) {
      const p = b.rc.pen;
      if (!p) return c;
      const twa = U.wrapPi(wind.dir - b.heading), sg = twa >= 0 ? 1 : -1;
      if (!p.dir) p.dir = -sg; // first bear away
      const back = b.speed < -0.05 && assist !== 'easy' ? -1 : 1;
      if (p.build) {
        p.buildT += KOS.DT;
        const H = U.wrapPi(wind.dir - sg * (cls.noGo + 0.45));
        c.rudder = U.clamp(U.angDiff(b.heading, H) * 2.5, -1, 1) * back;
        if (b.speed > 0.85 * cls.uRef || p.buildT > 10) p.build = false;
      } else {
        const a = Math.abs(twa), into = sg === p.dir; // turning towards the wind (a tack is coming)
        c.rudder = p.dir * (into && a < cls.noGo + 0.25 ? 1 : 0.8) * back;
        if (into && a > cls.noGo + 0.1 && a < cls.noGo + 0.6 && b.speed < 0.7 * cls.uRef) { p.build = true; p.buildT = 0; }
      }
      c.spinnaker = false; c.autoTrim = true; c.trimBias = 0;
      return c;
    }

    // ==================================================================== ranking
    function rank() {
      for (const b of boats) {
        const rc = b.rc;
        if (rc.finT != null) { rc.rem = -1e6 + rc.place; continue; }
        const it = seq[rc.leg];
        let d;
        if (it.type === 'start') d = U.dist(b, mid) + (rc.ocs ? 50 : 0);
        else d = U.dist(b, ptOf(it));
        rc.rem = d + remAfter[rc.leg] + (rc.pen ? (rc.pen.need - Math.abs(rc.pen.acc)) / TAU * 3 * L : 0);
      }
      const order = boats.slice().sort((a, b) => a.rc.rem - b.rc.rem);
      order.forEach((b, i) => { if (b.rc.finT == null) b.rc.place = i + 1; });
      return order;
    }
    let order = boats.slice();

    // ==================================================================== instance
    let destroyed = false;
    let coachIntro = null;
    let introCard = null;
    function closeIntroCard() {
      if (!introCard) return;
      const el = introCard; introCard = null;
      host.layer.classList.remove('has-intro-card');
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    }
    function beginRace() {
      if (!introCard) return;
      closeIntroCard();
      sfx('whistle', { vol: 0.5 });
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      coachIntro = KOS.UI.coach(t(P.venue === 'bay' ? 'race.introBay' : 'race.intro') + (touch ? '' : '  ' + t('race.keys') + aids.keys()), { ms: 6000 });
    }
    function buildIntroCard() {
      const el = document.createElement('div');
      el.className = 'school-card race-intro-card';
      el.innerHTML = '<div class="sc-in">' +
        '<div class="sc-kicker">' + KOS.UI.iconSvg('flag') + '<span>' + KOS.UI.esc(t('race.card.kicker')) + '</span></div>' +
        '<h2 class="sc-title">' + KOS.UI.esc(t('race.card.title')) + '</h2>' +
        '<p class="sc-intro">' + KOS.UI.esc(t('race.card.goal')) + '</p>' +
        '<p class="sc-intro" style="opacity:.75;font-size:.85em">' + KOS.UI.esc(t('race.card.skip')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-big sc-go">' + KOS.UI.iconSvg('play') + '<span>' + KOS.UI.esc(t('race.card.go')) + '</span></button>' +
        '</div>';
      host.layer.appendChild(el);
      host.layer.classList.add('has-intro-card');
      el.querySelector('.sc-go').addEventListener('click', e => { e.stopPropagation(); beginRace(); });
      el.addEventListener('pointerdown', e => e.stopPropagation());
      return el;
    }
    function start() {
      introCard = buildIntroCard();
      fitCourse();
      if (host.settings && host.settings.music) { try { KOS.Audio.music('race'); } catch (e) { /* optional */ } }
      ambient();
      paintPanel(true);
    }

    function simStep(dt) {
      env.t += dt;
      S.clock += dt;
      wind.update(dt);
      if ((S.windT = (S.windT || 0) + dt) > 2) { S.windT = 0; wind.recenter(me.x, me.y); }
      if (S.phase === 'pre') signals();
      if (S.phase !== 'pre') S.raceT += dt;
      if (S.xT > 0 && (S.xT -= dt) <= 0) S.flags.X = false;
      if (S.flags.X && boats.every(b => !b.rc.ocs)) { S.xT = Math.min(S.xT, 3); }
      const pre = boats.map(b => ({ x: b.x, y: b.y }));
      const live = boats.filter(b => !b.ghost && !b.hidden);
      // player controls
      controls = KOS.Input.toControls(ctrl.state, me, controls, dt);
      if (assist === 'easy') controls.autoHike = true;
      aids.apply(controls);
      if (autopilot) Object.assign(controls, autopilot.think(env, autoPlan(), live));
      if (S.phase === 'finish') { controls.trimBias = 0.4; }
      if (S.pen && (S.pen.auto || autopilot)) penControls(me, controls);
      KOS.Physics.step(me, controls, env, dt);
      // AI
      for (const b of ai) {
        if (b.hidden) continue;
        if (b.rc.finT != null && S.raceT - b.rc.finT > 14) { b.ghost = true; if (S.raceT - b.rc.finT > 22) b.hidden = true; }
        let c = b.helm.think(env, b.rc.finT != null ? parkPlan : b.plan, live);
        if (b.rc.finT != null && U.dist(b, park) < 18) { c.trimBias = 1; c.rudder = 0; c.spinnaker = false; }
        if (b.rc.pen) c = penControls(b, c);
        KOS.Physics.step(b, c, env, dt);
      }
      const hits = KOS.Physics.collide(live, venue, collMarks) || [];
      // an AI boat pinned against a mark / the committee boat with no speed (no steerage) pushes off by hand,
      // like a real sailor, instead of grinding on it for half a minute
      for (const h of hits) {
        if (h.type !== 'mark') continue;
        const b = h.a && h.a.helm ? h.a : h.b && h.b.helm ? h.b : null;
        const m = b === h.a ? h.b : h.a;
        if (!b || !m || b.hidden || b.speed > 0.35) continue;
        b.rc.stuckT = (b.rc.stuckT || 0) + dt;
        if (b.rc.stuckT < 0.8) continue;
        const away = U.bearing(m, b);
        const e = U.angDiff(b.heading, away);
        b.heading = U.wrapPi(b.heading + Math.sign(e) * Math.min(Math.abs(e), 1.1 * dt));
        b.x += Math.sin(away) * 0.5 * dt; b.y -= Math.cos(away) * 0.5 * dt;
      }
      for (const b of ai) if (b.rc.stuckT && b.speed > 0.6) b.rc.stuckT = 0;
      boats.forEach((b, i) => { track(b, pre[i].x, pre[i].y); if (b.rc.pen) penStep(b, dt); });
      const fouls = monitor.update(live, wind, collMarks.filter(m => m.id !== 'committee'), dt) || [];
      for (const f of fouls) onFoul(f);
      if ((S.rankT -= dt) <= 0) { S.rankT = 0.25; order = rank(); placeFeedback(); }
    }

    function update(dt) {
      if (destroyed) return;
      if (introCard) return; // the sim waits for the "Sejl!" button
      S.introT += dt;
      if (S.introT > 3.2 && S.introT - dt <= 3.2) { scene.fixedZoom = null; scene.follow(me); applyZoom(); }
      const n = S.ff ? 5 : S.phase === 'finish' ? 4 : 1;
      for (let i = 0; i < n; i++) simStep(dt);
      if (controls.autoTrim) ctrl.setSheet(me.sheet);
      aids.tick(dt * n, S.phase === 'race');
      if (assist === 'easy') scene.showNoGo = Math.abs(me.twa) < cls.noGo + 0.12 || me.inIrons;
      if (S.phase === 'race') raceFeedback(dt);
      if (S.phase === 'finish') {
        S.waitT += dt * n;
        S.boardT -= dt;
        if (S.boardT <= 0) { S.boardT = 0.3; paintBoard(); }
        const allIn = boats.every(b => b.rc.finT != null);
        if ((allIn && S.waitT > 3) || S.waitT > 45) complete();
      }
      if (S.phase === 'race' && S.fin.length === ai.length && !S.dnfT) S.dnfT = S.raceT;
      if (S.phase === 'race' && ((S.dnfT && S.raceT - S.dnfT > (assist === 'easy' ? 240 : 150)) || S.raceT > P.targetS * 6)) dnf();
      if (S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0 && S.result) host.finish(S.result); }
      hudTick(dt);
    }

    function placeFeedback() {
      if (S.phase !== 'race' || !me.rc.started) return;
      const p = me.rc.place;
      if (S.lastPlace && p < S.lastPlace && S.raceT > 8) {
        const k = S.lastPlace - p;
        floatText(t('race.fx.up', { n: k }), '#3ee08f'); sfx('pop', { pitch: 1.1 + Math.min(0.4, (boats.length - p) * 0.04) });
      }
      S.lastPlace = p; S.place = p;
    }

    function raceFeedback(dt) {
      const kn = U.kn(Math.abs(me.speed)); if (kn > S.topKn) S.topKn = kn;
      // gusts
      const base = wind.base ? wind.base.speed : P.windKn;
      if (cls.keel && !controls.autoHike && me.tws > 10 && Math.abs(me.heel) > U.rad(cls.optHeel + 3) && me.hike < 0.3 && S.raceT > 10) tip('rail');
      const gusty = me.tws > base * 1.18;
      if (gusty && !S.gustOn) { S.gustOn = true; sfx('whoosh', { vol: 0.35 }); floatText(t('race.fx.gust'), '#9fe7ff'); if (S.raceT > 15) tip('gust'); }
      else if (!gusty && me.tws < base * 1.08) S.gustOn = false;
      // shifts (only meaningful upwind): lift = wind frees you, header = you have to bear away
      S.shiftT -= dt;
      const lk = legKind(me.rc.leg);
      if (S.shiftT <= 0) {
        S.shiftT = 1;
        const w = wind.at(me.x, me.y).dir;
        if (S.shiftRef == null || lk !== 'beat') S.shiftRef = w;
        const d = U.wrapPi(w - S.shiftRef);
        if (Math.abs(d) > U.rad(6) && lk === 'beat' && !me.inIrons) {
          const lift = (me.tack === 'starboard') === (d > 0);
          floatText(t(lift ? 'race.fx.lift' : 'race.fx.header'), lift ? '#3ee08f' : '#ff9a3d');
          if (assist !== 'pro' && S.raceT > 20) tip(lift ? 'lift' : 'header');
          S.shiftRef = w;
        } else S.shiftRef = U.angLerp(S.shiftRef, w, 0.05);
      }
      if (S.pen && S.pen.T > 14 && !S.pen.auto) tip('penLeft');
      // sailed round the end of the line instead of across it
      if (!me.rc.started && !me.rc.ocs && sOf(me.x, me.y) > 2 * L) { S.missT = (S.missT || 0) + dt; if (S.missT > 5) { S.missT = -20; tip('missLine', true); } }
      const nx = seq[me.rc.leg];
      if (nx && nx.type === 'mark' && U.dist(me, nx.m) < zoneR * 3 && assist !== 'pro') tip('zone');
    }

    function currentTarget() {
      const rc = me.rc, it = seq[rc.leg];
      if (!it || rc.finT != null) return null;
      if (it.type === 'start') return { x: mid.x, y: mid.y, color: rc.ocs ? '#ff4d5e' : '#ffffff', label: t('race.leg.start') };
      if (it.type === 'finish') return { x: mid.x, y: mid.y, color: '#49c6f2', label: t('race.leg.finish') };
      return { x: it.m.x, y: it.m.y, color: '#ff9a3d', label: it.m.label, mark: it.m };
    }

    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        const nb = boats.length;
        hud.update({
          wind: { dir: me.windDir || wind.dir, speed: me.tws || wind.speed }, speed: U.kn(Math.abs(me.speed)),
          timer: S.phase === 'pre' ? -S.clock * 1000 : (me.rc.finT != null ? me.rc.finT : S.raceT) * 1000,
          place: S.phase === 'pre' || !me.rc.started ? { place: '–', of: nb } : { place: me.rc.place, of: nb },
        });
        paintPanel();
        // laylines + path hint
        const tg = currentTarget(), lk = legKind(me.rc.leg);
        const beat = (lk === 'beat' || (lk === 'start' && S.phase !== 'pre')) && tg;
        scene.showLaylines = !!(S.laylines && beat && S.phase !== 'finish');
        scene.laylineTarget = beat ? (tg.mark || mid) : null;
        const wantPath = assist === 'easy' && tg && !beat && S.phase !== 'pre';
        const has = scene.lines.indexOf(pathLine) >= 0;
        if (wantPath) { pathLine.a.x = me.x; pathLine.a.y = me.y; pathLine.b.x = tg.x; pathLine.b.y = tg.y; if (!has) scene.lines.push(pathLine); }
        else if (has) scene.lines.splice(scene.lines.indexOf(pathLine), 1);
        scene.lines[0].kind = seq[me.rc.leg] && seq[me.rc.leg].type === 'finish' ? 'finish' : 'start';
        // AI tags: place + name, red X when over early, ↻ in a penalty turn
        for (const b of ai) {
          b.tag = (S.phase !== 'pre' ? b.rc.place + ' · ' : '') + (b.short || b.name) + (b.rc.pen ? ' ↻' : '');
          b.tagColor = b.rc.ocs ? 'rgba(232,50,60,0.85)' : b.rc.finT != null ? 'rgba(24,169,87,0.8)' : null;
        }
        if (!controls.autoTrim) ctrl.setIdealSheet(me.inIrons ? null : KOS.Physics.idealSheet(me), 0.07);
        else ctrl.setIdealSheet(null);
      }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() {
      try { KOS.Audio.ambient({ wind: me.tws || P.windKn, waves: U.clamp(0.3 + (me.tws || P.windKn) / 20 + Math.abs(me.speed) / 12, 0, 1), harbor: P.venue === 'bay' ? 0.25 : 0 }); } catch (e) { /* optional */ }
    }

    // ---------------------------------------------------------------- the HUD flag / standings panel
    function paintPanel() {
      const esc = KOS.UI.esc;
      let html;
      if (S.phase === 'pre') {
        const T = -S.clock;
        const steps = [['warn', SEQ.warn], ['prep', SEQ.prep], ['one', SEQ.one], ['go', 0]];
        const flags = [];
        if (S.flags.cls) flags.push('<span class="rp-flag up">' + flagSvg('cls', clsId) + '<i>' + esc(t('race.flag.cls')) + '</i></span>');
        if (S.flags.P) flags.push('<span class="rp-flag up">' + flagSvg('P') + '<i>' + esc(t('race.flag.P')) + '</i></span>');
        if (!flags.length) flags.push('<span class="rp-flag off">' + flagSvg('cls', clsId) + '<i>' + esc(t('race.flag.cls')) + '</i></span>');
        // built once per flag change; clock and steps update in place so the flags don't re-animate every second
        const key = 'pre|' + S.flags.cls + '|' + S.flags.P;
        if (panel.dataset.pk !== key) {
          panel.dataset.pk = key; paintPanel.last = null;
          panel.innerHTML = '<div class="rp-head"><span>' + esc(t('race.hud.toStart')) + '</span><b class="rp-clock"></b></div>' +
            '<div class="rp-flags">' + flags.join('') + '</div><div class="rp-steps">' + steps.map(s => '<span class="' + (s[0] === 'go' ? 'go' : '') + '" data-s="' + s[1] + '">' + esc(t('race.seq.' + s[0])) + '</span>').join('') + '</div>';
        }
        const ck = panel.querySelector('.rp-clock');
        if (ck) { const txt = mmss(T); if (ck.textContent !== txt) ck.textContent = txt; ck.classList.toggle('hot', T <= 10); }
        panel.querySelectorAll('.rp-steps span').forEach(el => el.classList.toggle('on', T <= +el.dataset.s));
        return;
      } else {
        const lk = legKind(me.rc.leg);
        const legN = Math.min(me.rc.leg, seq.length - 1), legT = seq.length - 1;
        const rows = [];
        const top = order.slice(0, Math.min(order.length, 4));
        if (top.indexOf(me) < 0) top.push(me);
        top.forEach(b => {
          rows.push('<div class="rp-row' + (b === me ? ' me' : '') + (b.rc.finT != null ? ' fin' : '') + '"><b>' + b.rc.place + '</b><i class="race-dot" style="background:' + esc(b.colors.hull) + '"></i><span>' +
            esc(b === me ? t('race.hud.you') : (b.short || b.name)) + '</span>' + (b.rc.ocs ? '<em class="race-x">X</em>' : b.rc.pen ? '<em class="race-pen">↻</em>' : b.rc.finT != null ? '<em class="race-ok">✓</em>' : '') + '</div>');
        });
        let pen = '';
        if (S.pen) {
          const fr = U.clamp(Math.abs(S.pen.acc) / S.pen.need, 0, 1);
          pen = '<div class="rp-pen"><span>' + esc(t('race.pen.progress')) + ' ' + Math.round(Math.abs(S.pen.acc) * 180 / Math.PI) + '°/' + Math.round(S.pen.need * 180 / Math.PI) + '°</span><i><b style="width:' + Math.round(fr * 100) + '%"></b></i></div>';
        }
        // lap counter (multi-lap courses): a lap ends at the leeward mark (W-L) / the last triangle mark
        let lapTxt = '';
        if (P.laps > 1 && me.rc.finT == null) {
          const lapMark = P.course === 'tri' ? m3 : m2;
          let n = 1;
          for (let i = 1; i < me.rc.leg; i++) if (seq[i].type === 'mark' && seq[i].m === lapMark) n++;
          lapTxt = '<div class="rp-lap">' + esc(t('race.hud.lap', { n: Math.min(n, P.laps), of: P.laps })) + '</div>';
        }
        // wind shift against the course axis: + = veered (clockwise). On a beat it is a lift or a header for your tack.
        let shiftTxt = '';
        if (me.rc.finT == null) {
          const d = U.wrapPi(wind.at(me.x, me.y).dir - wd), deg = Math.round(d * 180 / Math.PI);
          let cls2 = '', word = '';
          if (Math.abs(deg) >= 3 && lk === 'beat') {
            const lift = (me.tack === 'starboard') === (d > 0);
            cls2 = lift ? ' lift' : ' header'; word = ' · ' + t(lift ? 'race.hud.lift' : 'race.hud.header');
          }
          shiftTxt = '<div class="rp-shift' + cls2 + '"><span>' + esc(t('race.hud.shift')) + '</span><b>' + (deg > 0 ? '↻ ' : deg < 0 ? '↺ ' : '') + Math.abs(deg) + '°' + esc(word) + '</b></div>';
        }
        html = (S.flags.X ? '<div class="rp-flags x"><span class="rp-flag up">' + flagSvg('X') + '<i>' + esc(t('race.flag.X')) + '</i></span></div>' : '') +
          '<div class="rp-head"><span>' + esc(t('race.hud.leg')) + ' ' + (me.rc.finT != null ? '' : legN + '/' + legT) + '</span><b class="rp-leg ' + lk + '">' + esc(t('race.leg.' + (me.rc.finT != null ? 'done' : lk))) + '</b></div>' +
          lapTxt + shiftTxt + pen + '<div class="rp-list">' + rows.join('') + '</div>';
      }
      if (html !== paintPanel.last) { panel.innerHTML = html; paintPanel.last = html; delete panel.dataset.pk; }
    }

    // ---------------------------------------------------------------- finish board (live, while the rest finish)
    function buildBoard() {
      board = document.createElement('div');
      board.className = 'race-board glass';
      host.layer.appendChild(board);
      board.addEventListener('click', e => { if (e.target.closest('[data-act="next"]')) { sfx('click'); complete(); } });
      paintBoard();
    }
    function paintBoard() {
      if (!board) return;
      const esc = KOS.UI.esc;
      const rows = tableRows();
      const html = '<div class="rb-head">' + KOS.UI.iconSvg('flag') + '<span>' + esc(t('race.res.table')) + '</span></div><div class="rb-list">' +
        rows.map(r => '<div class="rb-row' + (r.me ? ' me' : '') + (r.place <= 3 && r.timeMs != null && !r.est ? ' pod p' + r.place : '') + '"><b class="race-medal">' + r.place + '</b><i class="race-dot" style="background:' + esc(r.color) + '"></i><span>' + esc(r.name) + '</span><em>' +
          (r.timeMs == null || r.est ? '<small>' + esc(t('race.res.still')) + '</small>' : esc(KOS.UI.fmtTime(r.timeMs))) + '</em></div>').join('') +
        '</div><button type="button" class="btn btn-primary rb-next" data-act="next"><span>' + esc(t('race.btn.next')) + '</span>' + KOS.UI.iconSvg('next') + '</button>';
      if (html !== paintBoard.last) { board.innerHTML = html; paintBoard.last = html; }
    }
    function tableRows() {
      const ord = rank();
      const n = boats.length;
      return ord.map((b, i) => {
        const fin = b.rc.finT != null;
        let timeMs = fin ? Math.round(b.rc.finT * 1000) : null, est = false;
        if (!fin && S.done) { // estimate from the distance still to sail
          const v = Math.max(0.4, U.ms(KOS.Boats.optimal(cls, P.windKn, 'up').vmg) * 0.95);
          timeMs = Math.round((S.raceT + Math.max(0, b.rc.rem) / v) * 1000); est = true;
        }
        const place = i + 1;
        return { place, name: b === me ? (profile.name || t('race.hud.you')) : b.name, sailNo: b.sailNo, color: b.colors.hull, timeMs, est, pts: place, me: b === me, ocs: false, n };
      });
    }

    // ---------------------------------------------------------------- results
    function complete() {
      if (S.done) return;
      S.done = true;
      const place = me.rc.place || S.fin.indexOf(me) + 1;
      const n = boats.length;
      const owed = S.pen ? Math.ceil((S.pen.need - Math.abs(S.pen.acc)) / TAU - 0.01) : 0;
      const rows = tableRows();
      // unserved penalty turns cost places: +20 s per turn on your time
      let myPlace = place, timeS = me.rc.finT;
      if (owed > 0) {
        timeS += owed * 20;
        const mine = rows.find(r => r.me);
        mine.timeMs = Math.round(timeS * 1000);
        rows.sort((a, b) => (a.timeMs == null ? 1e12 : a.timeMs) - (b.timeMs == null ? 1e12 : b.timeMs));
        rows.forEach((r, i) => { r.place = i + 1; r.pts = i + 1; });
        myPlace = mine.place;
      }
      const stars = starsForPlace(myPlace, n, assist);
      // series (low point): keep the best score per race
      let series = null, seriesPts = null;
      try {
        const key = 'race.series.' + P.series;
        const sv = KOS.Storage.get(key, {}) || {};
        if (sv[activity.id] == null || myPlace < sv[activity.id]) sv[activity.id] = myPlace;
        KOS.Storage.set(key, sv);
        const ids = Object.keys(sv);
        seriesPts = ids.reduce((a, k) => a + sv[k], 0);
        series = t('race.res.series', { pts: seriesPts, n: ids.length, of: P.races });
      } catch (e) { /* storage optional */ }
      const stats = { place: myPlace + '/' + n };
      if (seriesPts != null) stats['race.stat.series'] = seriesPts;
      stats['race.stat.start'] = t('race.startQ.' + (S.startQ || 'late'));
      if (S.penServed || owed) stats.penalties = S.penServed + (owed ? ' (+' + owed * 20 + ' s)' : '');
      if (S.fouls) stats['race.stat.fouls'] = S.fouls;
      stats.tacks = me.tacks;
      stats['race.stat.top'] = +S.topKn.toFixed(1);
      S.result = {
        stars, success: true, timeMs: Math.round(timeS * 1000),
        score: Math.max(100, Math.round((n - myPlace + 1) / n * 2000 + (S.startQ === 'perfect' ? 250 : S.startQ === 'good' ? 120 : 0) - S.fouls * 50)),
        stats,
        titleKey: myPlace === 1 ? 'race.res.title1' : myPlace === 2 ? 'race.res.title2' : myPlace === 3 ? 'race.res.title3' : 'race.res.titleN',
        msgKey: 'race.res.msg', msgVars: { place: myPlace, of: n, time: KOS.UI.fmtTime(timeS * 1000) },
        raceTable: { rows, series },
      };
      if (owed) say(t('race.pen.timePen', { n: owed * 20 }), 3000);
      S.finishT = 0.6;
    }
    function dnf() {
      if (S.done) return;
      S.done = true; S.phase = 'finish';
      S.result = { stars: 0, success: false, timeMs: Math.round(S.raceT * 1000), score: 0, stats: { tacks: me.tacks, gybes: me.gybes }, titleKey: 'race.res.dnfTitle', msgKey: 'race.res.dnf', raceTable: { rows: tableRows(), series: null } };
      S.finishT = 0.8;
    }

    // ==================================================================== drawing
    function committeeFlags() {
      const fl = [];
      if (S.flags.cls) fl.push((CLASS_FLAG[clsId] || CLASS_FLAG.opti).bg);
      if (S.flags.P) fl.push('#1a5fd4');
      if (S.flags.X) fl.push('#ffffff');
      return fl.length ? fl : ['#ff7a1a'];
    }
    function drawWorld(ctx, sc) {
      const mpp = sc.mpp, tm = sc.t;
      // committee boat with the signal flags (tilted: drawn by the scene prop, depth-sorted)
      if (!sc._tilt && KOS.Sprites && KOS.Sprites.drawCommittee) KOS.Sprites.drawCommittee(ctx, com.x, com.y, wd, { t: tm, windDir: wind.dir, flags: committeeFlags() });
      // favoured end sparkle (easy / normal, prestart)
      if (S.phase === 'pre' && assist !== 'pro' && Math.abs(P.bias || 0) >= 3 && S.sig.prep) {
        const e = P.bias > 0 ? pin : com, r = Math.max(4, 22 * mpp) * (1 + 0.15 * Math.sin(tm * 5));
        ctx.strokeStyle = 'rgba(62,224,143,0.85)'; ctx.lineWidth = Math.max(0.25, 3 * mpp); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
        sc.pill(ctx, e.x, e.y, '★', { dy: -36, color: '#3ee08f' });
      }
      // next mark: pulsing target ring + 3-length zone
      const tg = currentTarget();
      if (tg && tg.mark) {
        ctx.setLineDash([6 * mpp, 5 * mpp]); ctx.lineWidth = Math.max(0.2, 2 * mpp);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(tg.x, tg.y, zoneR, 0, TAU); ctx.stroke();
        const r = Math.max(5, 30 * mpp) * (1 + 0.15 * Math.sin(tm * 5));
        ctx.strokeStyle = 'rgba(255,181,71,0.9)'; ctx.lineWidth = Math.max(0.25, 3 * mpp);
        ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      // penalty turn ring round the player
      if (S.pen) {
        const fr = U.clamp(Math.abs(S.pen.acc) / S.pen.need, 0, 1), r = L * 1.4 + 6 * mpp;
        ctx.lineWidth = Math.max(0.25, 4 * mpp); ctx.strokeStyle = 'rgba(255,77,94,0.35)';
        ctx.beginPath(); ctx.arc(me.x, me.y, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ff9a3d'; ctx.beginPath(); ctx.arc(me.x, me.y, r, -Math.PI / 2, -Math.PI / 2 + fr * TAU); ctx.stroke();
      }
    }
    function drawTargetArrow(ctx, sc) {
      if (S.introT < 3.2 || S.phase === 'finish') return;
      const tg = currentTarget(); if (!tg) return;
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, H = sc.h;
      const hb = hud.el.getBoundingClientRect(), land = H < 500;
      const m = { l: land ? 150 : 34, r: land ? KOS.Input.sideR(ctrl) : 34, t: Math.max(60, hb.bottom + 34), b: land ? 60 : W < 700 ? 190 : 130 };
      const dist = Math.round(U.dist(tg, me));
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < H - m.b) {
        const by = p.y - 30 - Math.abs(Math.sin(sc.t * 4)) * 8;
        ctx.fillStyle = tg.color; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 10, by - 8); ctx.lineTo(p.x + 10, by - 8); ctx.lineTo(p.x, by + 4); ctx.closePath(); ctx.stroke(); ctx.fill();
        return;
      }
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? H - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx);
      const pulse = 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = tg.color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = tg.color;
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillText(tg.label, ax, ay);
      ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(dist + ' m', ax, ay + 32);
    }

    function render(alpha) { scene.render(alpha); }
    function destroy() {
      destroyed = true;
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      host.layer.removeEventListener('wheel', onWheel);
      host.layer.classList.remove('race-layer', 'race-go', 'race-pen', 'race-done');
      clearTimeout(cardTimer);
      host.layer.classList.remove('has-intro-card');
      if (introCard) { introCard.remove(); introCard = null; }
      if (coachIntro) coachIntro.close(true);
      ctrl.detach(); hud.destroy(); panel.remove(); card.remove(); if (board) board.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function pause() { hideCoach(); try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); }
    function onResize() { scene.resize(); if (S.introT < 3.2) fitCourse(); else applyZoom(); }

    // ---- test hooks: autopilot (KOS.AI sails the player's boat, start sequence included) and skipIntro
    let autopilot = null;
    
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(me, { skill: 0.97, aggression: 0.6, seed: 5 }) : null; }
    function autoPlan() { return me.rc.finT != null ? parkPlan : me.plan; }
    function skipIntro() { closeIntroCard(); S.introT = Math.max(S.introT, 3.21); scene.fixedZoom = null; scene.follow(me); applyZoom(); if (S.phase === 'pre') { S.ff = true; } }
    const debug = {
      get seq() { return seq; }, get order() { return order; }, get ap() { return autopilot; }, marks, pin, com, line, cb, fitCourse,
      jump(sec) { const n = Math.round(sec / KOS.DT); for (let i = 0; i < n && !S.done; i++) simStep(KOS.DT); },
      foul(rule) { penalize(me, rule === 'R31' ? 1 : 2, rule || 'R10', { reasonKey: 'rules.reason.R10', reasonVars: { give: t('rules.you'), stand: ai[0] && ai[0].short } }); },
      penAll() { boats.forEach(b => addPen(b, 1)); },
      finishNow() { if (me.rc.finT == null) finished(me); },
      complete,
    };

    return { start, update, render, destroy, pause, resume, onResize, boat: me, boats, scene, state: S, ctrl, setAutopilot, skipIntro, debug, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
