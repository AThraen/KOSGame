// KØS SEJL — js/modes/rib.js
// The 'rib' mode: coach-boat missions in the club's orange RIB (hub area 'rib', venues 'bay' and 'sound').
//
// Missions (activity.params.kind):
//   learn   throttle, wheel, reverse, the slow zone by the jetties, park at the RIB pontoon
//   tow     pick up a line of Optimists on a springy towline and bring them home (snap / tangle / swamp)
//   rescue  approach a capsized dinghy from leeward, stop alongside and hold to help right it
//   marks   lay race marks on GPS targets out on the Øresund (the wind drifts you while you aim)
//   coach   follow the Opti fleet round the course, stay within shouting distance, never cross their course
//   gear    collect drifting paddles, bailers etc. before they drift onto the rocks
//   storm   storm warning: tow everyone home (several trips) before the squall hits
// Shape follows js/modes/sail.js (strings → activities → mode). Test hooks: setAutopilot(on), skipIntro().
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2, PI = Math.PI;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    rib: {
      hud: { step: 'Opgave', optis: 'Optier', rescued: 'Reddet', marks: 'Mærker', gps: 'Til krydset', near: 'Tæt på', left: 'Tid tilbage',
        gear: 'Grej', home: 'I havn', squall: 'Bygen om' },
      btn: { help: 'Hjælp op', drop: 'Smid mærke', shout: 'Råb', fix: 'Ordn line' },
      zone: { title: 'Fartzone', max: 'max {kn} kn', slow: 'Sænk farten!' },
      card: { learn: 'Lær at køre', tow: 'På slæb', rescue: 'Redning', marks: 'Banelægning', coach: 'Trænerbåd', gear: 'Grej over bord', storm: 'Stormvarsel' },
      intro: {
        learn: 'Velkommen i RIB\'en! Skub gashåndtaget frem for at køre, og styr med rattet. Inde ved broerne er der fartzone: max {kn} knob, så ingen får bølger.',
        tow: 'Træningen er slut, og {n} optier skal hjem. Kør helt langsomt hen til hver jolle, så griber sejleren slæbelinen. Kør blødt – max {kn} knob med joller på slæb!',
        rescue: 'Hjælp! En optimist er kæntret. Kom ind fra læ-siden – med stævnen op mod vinden – kør helt langsomt, og stop lige ved siden af jollen.',
        marks: 'Kapsejladsen starter snart! Kør ud til GPS-krydserne, og smid mærkerne præcist. Husk: vinden skubber RIB\'en, når du ligger stille.',
        coach: 'I dag er du træner! Følg optierne rundt på banen, og bliv inden for råbeafstand – men kryds aldrig foran dem. Hjælp dem, der får et udråbstegn.',
        gear: 'Et hold har tabt grej i vandet! Saml pagajer, øsekar og andet op, før det driver ind på stenene ved stranden.',
        storm: 'Stormvarsel! En byge er på vej. Hent alle optierne, og slæb dem hjem til Optibroen, før uvejret når frem.',
      },
      keys: 'Tastatur: ←/→ rat · ↑/↓ gas frem/bak · F handling',
      step: {
        s1: 'Giv lidt gas, og kør gennem ringen',
        s2: 'Sving rundt – og videre til næste gule ring',
        s3: 'Kør ud af fartzonen – roligt forbi bølgebryderen',
        s4: 'Fuld gas! Kom i planing i {n} sek',
        s5: 'Drej, og ram den gule ring',
        s6: 'Tilbage i fartzonen – sænk farten først!',
        s7: 'Sæt i bak, og bak {n} m',
        s8: 'Læg til ved RIB-pontonen: stop i den grønne boks',
      },
      task: {
        pick: 'Saml optierne op: {n} af {total} på slæb',
        home: 'Slæb dem hjem til Optibroen, og stop helt',
        rescue: 'Kom ind fra læ, og stop ved jollen ({n}/{total})',
        hold: 'Hold HJÆLP OP inde, mens sejleren rejser jollen',
        mark: 'Smid mærke {n} af {total}: {name}',
        coach: 'Følg flåden – bliv inden for råbeafstand',
        gear: 'Saml grejet op, før det driver i land',
        storm: 'Hent optierne hjem: {n} af {total} i havn',
        fix: 'Stop, og hold ORDN LINE inde',
      },
      mark: { pin: 'Startmærket', gate1: 'Gate, venstre', gate2: 'Gate, højre', top: 'Luvmærket' },
      fx: {
        ring: 'Ring!', plane: 'Planing!', hooked: 'På slæb!', snap: 'Linen sprang!', tangle: 'Filtret!', prop: 'Linen i skruen!',
        swamp: 'Fyldt med vand!', bailed: 'Øset læns!', wake: 'Hækbølge!', bump: 'Bump!', fixed: 'Linen er klar!', righted: 'Rejst!',
        thanks: 'Tak, træner!', bull: 'Lige i plet!', great: 'Flot!', ok: 'Godkendt', miss: 'Ved siden af!', saved: 'Reddet!',
        lost: 'Tabt!', shout: 'Godt råbt!', cross: 'Kryds ikke!', home: 'Hjemme!', parked: 'Fortøjet!', slow: 'Langsomt!',
        oops: 'Åh nej – en til!', reverse: 'Bak!', zone: 'Fartzone', whoosh: 'For stærkt!', squall: 'BYGEN!',
        paddle: 'Pagaj!', bailer: 'Øsekar!', fender: 'Fender!', vest: 'Redningsvest!', cap: 'Kasket!', bottle: 'Drikkedunk!', sponge: 'Svamp!',
      },
      tip: {
        wake: 'Hov, for stærkt i fartzonen! Din hækbølge får bådene ved broen til at gynge. Sænk farten.',
        zone: 'Nu er du i fartzonen ved broerne. Kør stille og roligt – max {kn} knob.',
        reverse: 'Træk gashåndtaget tilbage forbi N for at bakke. Rattet virker omvendt, når du bakker!',
        park: 'Kør langsomt ind i boksen, og giv et lille tryk bak for at stoppe helt.',
        plane: 'Wiii! Nu planer RIB\'en – den glider oven på vandet.',
        towFast: 'For hurtigt! Optierne begynder at tage vand ind over stævnen. Sænk farten.',
        snap: 'Linen sprang, fordi du rykkede for hårdt. Kør tilbage, saml dem op igen – og giv gas blødt.',
        tangle: 'Du drejede for skarpt, så linen filtrede sig. Stop helt, og hold ORDN LINE inde.',
        prop: 'Bak aldrig med joller på slæb – linen kom i skruen! Hold ORDN LINE inde for at få den fri.',
        pickSlow: 'Kør helt langsomt hen til jollen, så kan sejleren gribe linen.',
        homeStop: 'Godt! Stop helt ved Optibroen, så sejlerne kan gå i land.',
        windward: 'Du ligger på luv-siden! Vinden skubber dig ind over jollen. Kør rundt, og kom ind fra læ.',
        tooFast: 'Langsomt! Der ligger en sejler i vandet.',
        hold: 'Perfekt! Hold HJÆLP OP inde, mens sejleren rejser jollen.',
        drift: 'Kan du mærke, at vinden skubber dig? Giv lidt gas for at blive på pladsen.',
        dropSlow: 'Stop næsten helt, før du smider mærket – ellers glider det væk.',
        miss: 'Mærket landede for langt fra krydset. Det er samlet op igen – prøv en gang til!',
        cross: 'Kryds aldrig foran optierne – du tager deres vind og laver bølger.',
        far: 'Du er for langt væk – sejlerne kan ikke høre dig. Kom tættere på.',
        close: 'Lidt for tæt på – giv dem plads til at sejle.',
        problem: '{name} har brug for hjælp! Kør tæt på, og tryk RÅB.',
        gearFast: 'For stærkt – din bølge skubbede grejet væk. Kør langsomt hen til det.',
        gearLost: 'Øv, noget grej drev ind på stenene. Skynd dig efter resten!',
        storm: 'Bygen kommer nærmere – vinden tager til!',
        stormLast: 'Sidste chance – skynd dig hjem!',
        maxTow: 'Du kan højst have {n} joller på slæb ad gangen. Kør dem hjem først.',
        wakeNear: 'Din hækbølge vipper optierne! Kør langsomt, når du er tæt på flåden.',
      },
      shout: {
        luff: 'Hal skødet ind, {name} – sejlet blafrer!',
        stall: 'Fier lidt på skødet, {name}, så kører du hurtigere!',
        hike: 'Hæng ud, {name} – helt ud over kanten!',
        none: 'Godt sejlet, alle sammen!',
      },
      problem: { luff: 'Sejlet blafrer', stall: 'Skødet for stramt', hike: 'Krænger for meget' },
      res: {
        learn: 'Du kan køre RIB! Klaret på {time} med {wakes} hækbølger i fartzonen.',
        tow: '{n} optier slæbt sikkert hjem på {time}.',
        rescue: '{n} kæntrede sejlere hjulpet op på {time}.',
        marks: 'Banen er lagt! I snit {avg} m fra krydset.',
        coach: 'Du var inden for råbeafstand {pct} % af tiden og hjalp {n} sejlere.',
        coachFail: 'Du var kun tæt på flåden {pct} % af tiden. Bliv tættere på næste gang!',
        gear: 'Du reddede {n} af {total} stykker grej.',
        gearFail: 'Kun {n} af {total} stykker grej reddet. Prøv igen!',
        storm: 'Alle i havn med {time} til overs – flot klaret i uvejret!',
        stormFail: 'Bygen kom, før alle var hjemme ({n} af {total}). Prøv igen!',
      },
      stat: { wakes: 'Hækbølger i fartzonen', mishaps: 'Uheld med linen', swamps: 'Fyldte joller', bumps: 'Bump', precision: 'Snit-afstand (m)',
        misses: 'Ved siden af', coverage: 'Inden for råbeafstand', helped: 'Hjulpet', crossings: 'Krydset kurs', saved: 'Grej reddet',
        lost: 'Grej tabt', home: 'I havn', left: 'Tid til overs', top: 'Topfart (knob)' },
    },
  });
  KOS.I18n.add('en', {
    rib: {
      hud: { step: 'Task', optis: 'Optis', rescued: 'Rescued', marks: 'Marks', gps: 'To target', near: 'Close', left: 'Time left',
        gear: 'Gear', home: 'Home', squall: 'Squall in' },
      btn: { help: 'Help up', drop: 'Drop mark', shout: 'Shout', fix: 'Fix line' },
      zone: { title: 'Slow zone', max: 'max {kn} kn', slow: 'Slow down!' },
      card: { learn: 'Learn to drive', tow: 'On tow', rescue: 'Rescue', marks: 'Laying the course', coach: 'Coach boat', gear: 'Gear overboard', storm: 'Storm warning' },
      intro: {
        learn: 'Welcome aboard the RIB! Push the throttle forward to go and steer with the wheel. Near the jetties there is a slow zone: max {kn} knots, so nobody gets rocked by waves.',
        tow: 'Practice is over and {n} Optis need to go home. Drive really slowly up to each dinghy so the sailor can grab the towline. Drive gently – max {kn} knots with dinghies on tow!',
        rescue: 'Help! An Optimist has capsized. Come in from the leeward side – bow up into the wind – go really slowly and stop right next to the dinghy.',
        marks: 'The race starts soon! Drive out to the GPS targets and drop the marks precisely. Remember: the wind pushes the RIB when you sit still.',
        coach: 'Today you are the coach! Follow the Optis round the course and stay within shouting distance – but never cross in front of them. Help the ones who get an exclamation mark.',
        gear: 'A group has lost gear in the water! Pick up paddles, bailers and the rest before it drifts onto the rocks by the beach.',
        storm: 'Storm warning! A squall is coming. Fetch all the Optis and tow them home to the Opti jetty before the weather hits.',
      },
      keys: 'Keyboard: ←/→ wheel · ↑/↓ throttle ahead/astern · F action',
      step: {
        s1: 'Give a little throttle and drive through the ring',
        s2: 'Swing round – on to the next yellow ring',
        s3: 'Drive out of the slow zone – gently past the breakwater',
        s4: 'Full throttle! Plane for {n} sec',
        s5: 'Turn and hit the yellow ring',
        s6: 'Back into the slow zone – slow down first!',
        s7: 'Shift into reverse and back up {n} m',
        s8: 'Come alongside the RIB pontoon: stop in the green box',
      },
      task: {
        pick: 'Pick up the Optis: {n} of {total} on tow',
        home: 'Tow them home to the Opti jetty and stop',
        rescue: 'Come in from leeward and stop by the dinghy ({n}/{total})',
        hold: 'Hold HELP UP while the sailor rights the dinghy',
        mark: 'Drop mark {n} of {total}: {name}',
        coach: 'Follow the fleet – stay within shouting distance',
        gear: 'Pick up the gear before it drifts ashore',
        storm: 'Bring the Optis home: {n} of {total} in harbour',
        fix: 'Stop and hold FIX LINE',
      },
      mark: { pin: 'Start mark', gate1: 'Gate, left', gate2: 'Gate, right', top: 'Windward mark' },
      fx: {
        ring: 'Ring!', plane: 'Planing!', hooked: 'On tow!', snap: 'Line snapped!', tangle: 'Tangled!', prop: 'Line in the prop!',
        swamp: 'Swamped!', bailed: 'Bailed out!', wake: 'Wake!', bump: 'Bump!', fixed: 'Line clear!', righted: 'Righted!',
        thanks: 'Thanks, coach!', bull: 'Bull\'s-eye!', great: 'Great!', ok: 'Approved', miss: 'Missed!', saved: 'Saved!',
        lost: 'Lost!', shout: 'Good shout!', cross: 'Don\'t cross!', home: 'Home!', parked: 'Moored!', slow: 'Slowly!',
        oops: 'Oh no – another one!', reverse: 'Reverse!', zone: 'Slow zone', whoosh: 'Too fast!', squall: 'SQUALL!',
        paddle: 'Paddle!', bailer: 'Bailer!', fender: 'Fender!', vest: 'Life jacket!', cap: 'Cap!', bottle: 'Water bottle!', sponge: 'Sponge!',
      },
      tip: {
        wake: 'Oops, too fast in the slow zone! Your wake rocks the boats at the jetty. Slow down.',
        zone: 'You are in the slow zone by the jetties now. Nice and easy – max {kn} knots.',
        reverse: 'Pull the throttle back past N to reverse. The wheel works the other way round when you go backwards!',
        park: 'Drive slowly into the box and give a little reverse to stop completely.',
        plane: 'Wheee! The RIB is planing – skimming on top of the water.',
        towFast: 'Too fast! The Optis are taking water over the bow. Slow down.',
        snap: 'The line snapped because you jerked it too hard. Go back, pick them up again – and throttle up gently.',
        tangle: 'You turned too sharply and the line tangled. Stop completely and hold FIX LINE.',
        prop: 'Never reverse with dinghies on tow – the line got caught in the prop! Hold FIX LINE to free it.',
        pickSlow: 'Drive really slowly up to the dinghy so the sailor can grab the line.',
        homeStop: 'Good! Stop completely at the Opti jetty so the sailors can step ashore.',
        windward: 'You are on the windward side! The wind pushes you onto the dinghy. Go round and come in from leeward.',
        tooFast: 'Slowly! There is a sailor in the water.',
        hold: 'Perfect! Hold HELP UP while the sailor rights the dinghy.',
        drift: 'Can you feel the wind pushing you? Give a little throttle to stay in place.',
        dropSlow: 'Stop almost completely before you drop the mark – otherwise it slides away.',
        miss: 'The mark landed too far from the target. It has been picked up – try again!',
        cross: 'Never cross in front of the Optis – you take their wind and make waves.',
        far: 'You are too far away – the sailors can\'t hear you. Get closer.',
        close: 'A bit too close – give them room to sail.',
        problem: '{name} needs help! Get close and press SHOUT.',
        gearFast: 'Too fast – your wave pushed the gear away. Drive up to it slowly.',
        gearLost: 'Oh no, some gear drifted onto the rocks. Hurry after the rest!',
        storm: 'The squall is getting closer – the wind is picking up!',
        stormLast: 'Last chance – hurry home!',
        maxTow: 'You can tow at most {n} dinghies at a time. Take them home first.',
        wakeNear: 'Your wake is rocking the Optis! Go slowly when you are close to the fleet.',
      },
      shout: {
        luff: 'Sheet in, {name} – your sail is flapping!',
        stall: 'Ease the sheet a little, {name}, and you\'ll go faster!',
        hike: 'Hike out, {name} – right out over the side!',
        none: 'Good sailing, everyone!',
      },
      problem: { luff: 'Sail flapping', stall: 'Sheet too tight', hike: 'Heeling too much' },
      res: {
        learn: 'You can drive a RIB! Done in {time} with {wakes} wakes in the slow zone.',
        tow: '{n} Optis towed home safely in {time}.',
        rescue: '{n} capsized sailors helped up in {time}.',
        marks: 'The course is laid! On average {avg} m from the target.',
        coach: 'You were within shouting distance {pct} % of the time and helped {n} sailors.',
        coachFail: 'You were only close to the fleet {pct} % of the time. Stay closer next time!',
        gear: 'You saved {n} of {total} pieces of gear.',
        gearFail: 'Only {n} of {total} pieces of gear saved. Try again!',
        storm: 'Everyone home with {time} to spare – well done in the rough weather!',
        stormFail: 'The squall hit before everyone was home ({n} of {total}). Try again!',
      },
      stat: { wakes: 'Wakes in the slow zone', mishaps: 'Towline mishaps', swamps: 'Swamped dinghies', bumps: 'Bumps', precision: 'Average distance (m)',
        misses: 'Misses', coverage: 'Within shouting distance', helped: 'Helped', crossings: 'Crossed their course', saved: 'Gear saved',
        lost: 'Gear lost', home: 'Home', left: 'Time to spare', top: 'Top speed (kn)' },
    },
  });

  // ======================================================================== 2. activities
  const ACTS = [
    { id: 'rib.learn', order: 10, icon: 'rib', minutes: 3, difficulty: 1, unlock: null,
      title: { da: 'Lær at køre RIB', en: 'Learn to drive the RIB' },
      desc: { da: 'Gas, rat, bak og fartzonen ved broerne. Slut af med at lægge til ved RIB-pontonen.', en: 'Throttle, wheel, reverse and the slow zone by the jetties. Finish by coming alongside the RIB pontoon.' },
      params: { kind: 'learn', windDeg: 240, windKn: 6, gust: 0.25, shift: 0.2, seed: 101 } },
    { id: 'rib.tow', order: 20, icon: 'boat', minutes: 4, difficulty: 2, unlock: { after: 'rib.learn' },
      title: { da: 'Optier på slæb', en: 'Optis on tow' },
      desc: { da: 'Saml optierne op på en slæbeline, og bring dem blødt hjem. Ryk ikke – så springer linen!', en: 'Pick up the Optis on a towline and bring them home gently. Don\'t jerk – or the line snaps!' },
      params: { kind: 'tow', windDeg: 250, windKn: 8, gust: 0.35, shift: 0.2, seed: 202 } },
    { id: 'rib.rescue', order: 30, icon: 'life', minutes: 4, difficulty: 2, unlock: { after: 'rib.tow' },
      title: { da: 'Kæntret jolle!', en: 'Capsized dinghy!' },
      desc: { da: 'Kom ind fra læ, stop ved siden af, og hjælp sejleren med at rejse jollen.', en: 'Come in from leeward, stop alongside and help the sailor right the dinghy.' },
      params: { kind: 'rescue', windDeg: 235, windKn: 11, gust: 0.45, shift: 0.25, seed: 303, count: 2, drift: 0.06 } },
    { id: 'rib.marks', order: 40, icon: 'buoy', minutes: 5, difficulty: 3, unlock: { after: 'rib.rescue' },
      title: { da: 'Læg banen ud', en: 'Lay the race course' },
      desc: { da: 'Kør ud på Øresund, og smid kapsejladsmærkerne præcist på GPS-krydserne. Vinden driver dig!', en: 'Head out on the Øresund and drop the race marks precisely on the GPS targets. The wind drifts you!' },
      params: { kind: 'marks', venue: 'sound', windDeg: 225, windKn: 13, gust: 0.4, shift: 0.2, seed: 404, drift: 0.05 } },
    { id: 'rib.coach', order: 50, icon: 'whistle', minutes: 3, difficulty: 3, unlock: { after: 'rib.marks' },
      title: { da: 'Trænerbåd', en: 'Coach boat' },
      desc: { da: 'Følg Opti-flåden rundt på banen, råb gode råd – og kryds aldrig deres kurs.', en: 'Follow the Opti fleet round the course, shout good advice – and never cross their course.' },
      params: { kind: 'coach', windDeg: 250, windKn: 9, gust: 0.4, shift: 0.25, seed: 505, fleet: 5 } },
    { id: 'rib.gear', order: 60, icon: 'hand', minutes: 4, difficulty: 3, unlock: { after: 'rib.coach' },
      title: { da: 'Grej over bord', en: 'Gear overboard' },
      desc: { da: 'Pagajer og øsekar driver mod land. Saml det hele op, før det er for sent!', en: 'Paddles and bailers are drifting ashore. Pick it all up before it is too late!' },
      params: { kind: 'gear', windDeg: 75, windKn: 11, gust: 0.45, shift: 0.3, seed: 606 } },
    { id: 'rib.storm', order: 70, icon: 'wind', minutes: 6, difficulty: 4, unlock: { after: 'rib.gear' },
      title: { da: 'Stormvarsel!', en: 'Storm warning!' },
      desc: { da: 'En byge er på vej. Slæb alle optierne hjem i flere ture, før uvejret rammer.', en: 'A squall is coming. Tow all the Optis home in several trips before the weather hits.' },
      params: { kind: 'storm', windDeg: 255, windKn: 9, gust: 0.5, shift: 0.3, seed: 707 } },
  ];
  KOS.Activities.add(ACTS.map(a => Object.assign({ mode: 'rib', area: 'rib', boat: 'rib' }, a)));

  // ======================================================================== tuning per assist level
  const AST = {
    easy: { zoneKn: 6, towKn: 7, snap: 1700, pick: 9, pickKn: 5, helpR: 8, helpKn: 1.8, helpT: 1.6, lee: -0.15, markR: 12, gearR: 4.6,
      gearKn: 11, fixT: 1.0, maxTow: 5, nTow: 3, nStorm: 4, stormT: 400, mishaps: 2, th: [1.45, 2.1], drift: 0.7, near: [6, 52], pct: 0.45, ring: 9 },
    normal: { zoneKn: 5, towKn: 6, snap: 1150, pick: 7, pickKn: 3.8, helpR: 6.5, helpKn: 1.2, helpT: 2.4, lee: 0.15, markR: 8, gearR: 3.7,
      gearKn: 8.5, fixT: 1.8, maxTow: 3, nTow: 4, nStorm: 5, stormT: 470, mishaps: 1, th: [1.2, 1.75], drift: 1, near: [8, 42], pct: 0.55, ring: 7 },
    pro: { zoneKn: 4, towKn: 5.5, snap: 900, pick: 6, pickKn: 3, helpR: 5.5, helpKn: 0.9, helpT: 3, lee: 0.35, markR: 6, gearR: 3.1,
      gearKn: 7, fixT: 2.4, maxTow: 4, nTow: 6, nStorm: 5, stormT: 600, mishaps: 0, th: [1.05, 1.5], drift: 1.2, near: [9, 36], pct: 0.65, ring: 6 },
  };
  const NAMES = ['Sofie', 'Emil', 'Ida', 'Noah', 'Freja', 'Oscar', 'Alma', 'Karl', 'Ella', 'Malte'];
  const HULLS = ['#ffffff', '#bfe3ff', '#ffe27a', '#ff9f9f', '#a8f0c6', '#ffd0a1', '#d9c8ff'];
  const TOW = { first: 7, between: 4.5, k: 420, c: 170, mR: 900 };
  // the RIB pontoon box (west side of pontoon C) and the Opti jetty home spot, in world meters
  const PARK = { x: 52.6, y: -30.2, h: U.rad(-15), len: 7.2, wid: 3.4 };
  const HOME = { x: -84, y: -8, r: 13 };
  // the slow zone round the club jetties and the RIB pontoon (points on land are fine: only the water side is drawn)
  const SLOW = [[-118, 12], [-92, -66], [-10, -84], [90, -74], [118, -40], [60, 0], [-40, 60], [-98, 62]];

  // ======================================================================== 3. the mode
  KOS.Modes.register('rib', { kind: 'sea', create(host, activity) { return createRib(host, activity); } });

  function createRib(host, activity) {
    const P = Object.assign({ kind: 'learn', windDeg: 240, windKn: 8, gust: 0.4, shift: 0.2, seed: 1, drift: 0.025 }, activity.params || {});
    const assist = AST[host.assist] ? host.assist : 'easy';
    const AS = AST[assist];
    const venue = KOS.World.get(P.venue || 'bay');
    const isBay = venue.id === 'bay';
    const rand = U.rng((P.seed || 1) * 7919 + 17);
    const profile = host.profile || {};
    const S = {
      phase: 'intro', introT: 0, time: 0, finishT: -1, result: null, hudT: 0, ambT: 0, windT: 0,
      tips: {}, tipT: -99, wakes: 0, overT: 0, wakeCd: 0, inZone: false, bumps: 0, bumpCd: 0, mishaps: 0, swamps: 0, topKn: 0,
      foul: null, fixT: 0, holdT: 0, botAction: false, flash: 0, thunderT: -1, actPrev: false,
    };

    // ---- wind + env
    const spawn = P.kind === 'marks' ? { x: venue.spawn.x, y: venue.spawn.y, heading: U.rad(200) }
      : P.kind === 'coach' ? null : { x: PARK.x, y: PARK.y, heading: PARK.h };
    const wind = KOS.Wind.create({ dir: U.rad(P.windDeg), speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: -300, y0: -300, x1: 300, y1: 300 } });
    const env = { wind, venue, assist, t: 0 };
    const envFleet = { wind, venue, assist: 'easy', t: 0 };

    // ---- the player's RIB
    const boat = KOS.Physics.createBoat('rib', { x: 0, y: 0, heading: 0, isPlayer: true, sailNo: 'KØS 1', name: profile.name || '' });
    let controls = KOS.Physics.controls();
    controls.autoTrim = true;

    // ---- shared mission state
    const optis = [];     // all scripted dinghies (towed / capsized / sailing)
    const chain = [];     // optis currently on the towline, in order
    const marks = [];     // scene marks (race marks, fleet marks)
    const items = [];     // drifting gear
    const fleet = [];     // AI-sailed optis (coach)
    let M = null;         // mission hooks

    const MISSIONS = { learn: mLearn, tow: mTow, rescue: mRescue, marks: mMarks, coach: mCoach, gear: mGear, storm: mStorm };
    M = (MISSIONS[P.kind] || mLearn)();
    const start0 = M.spawn || spawn;
    boat.x = start0.x; boat.y = start0.y; boat.heading = start0.heading;
    wind.recenter(boat.x, boat.y);
    for (let i = 0; i < 200; i++) wind.update(0.5);

    // ---- scene
    const scene = new KOS.SailScene(host.canvas, { venue, wind, boats: [boat].concat(optis, fleet), follow: boat, marks, lines: [], showWindArrow: true });
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawScreen, { screen: true });
    let userZoom = 1;
    function applyZoom() {
      const small = Math.min(scene.w, scene.h) < 600;
      const span = (M.span || 70) * (small ? 0.85 : 1);
      scene.setZoom(1);
      const base = scene.baseZoom();
      scene.setZoom(Math.sqrt(scene.w * scene.h) / span / base * userZoom);
    }
    applyZoom();

    // ---- controls + HUD + panels
    const ctrl = KOS.Input.attach(host.layer, { layout: 'rib', pauseButton: false, autoTrim: false,
      extraButtons: M.button ? [{ id: 'action', icon: M.button.icon, labelKey: M.button.key }] : [] });
    const hud = KOS.UI.hud(host.layer, M.hud || ['speed', 'timer']);
    const card = document.createElement('div');
    card.className = 'rib-card';
    host.layer.appendChild(card);
    const badge = document.createElement('div');
    badge.className = 'rib-zone';
    badge.innerHTML = '<span class="rz-sign"><b>' + AS.zoneKn + '</b></span><span class="rz-txt"><b>' + KOS.UI.esc(t('rib.zone.title')) + '</b><small>' +
      KOS.UI.esc(t('rib.zone.max', { kn: AS.zoneKn })) + '</small></span>';
    host.layer.appendChild(badge);

    const handlers = {
      'boat:ground': e => { if (e.boat !== boat) return; sfx(e.speed > 1.5 ? 'crash' : 'bump', { vol: Math.min(1, 0.4 + e.speed / 3) }); },
      'boat:plane': e => { if (e.boat !== boat) return; sfx('whoosh', { vol: 0.6 }); },
      'boat:collide': e => { if ((e.a === boat || e.b === boat) && S.phase === 'go') { sfx('bump', { vol: 0.7 }); bump(); } },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);
    if (M.onAction) ctrl.on('action', M.onAction);
    const onWheel = e => { if (e.target.closest && e.target.closest('.kc')) return; e.preventDefault(); userZoom = U.clamp(userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.5); applyZoom(); };
    host.layer.addEventListener('wheel', onWheel, { passive: false });

    // ==================================================================== small helpers
    function sfx(name, o) { try { if (KOS.Audio) KOS.Audio.play(name, o); } catch (e) { /* optional */ } }
    function fx() { return scene.effects; }
    function floatText(str, color, x, y, size) { if (fx()) fx().text(x != null ? x : boat.x, y != null ? y : boat.y - 2, str, { color: color || '#fff', size: size || 22 }); }
    function tip(key, vars, force) {
      if (S.tips[key] && !force) return;
      if (S.time - S.tipT < 5 && !force) return;
      S.tips[key] = true; S.tipT = S.time;
      KOS.UI.coach(t('rib.tip.' + key, vars), { ms: 5200 });
    }
    function kn() { return U.kn(Math.abs(boat.speed)); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function inSlow(x, y) { return isBay && U.pointInPoly(x, y, SLOW); }
    function okWater(x, y, margin) {
      if (KOS.World.isSolid(venue, x, y) || KOS.World.depthAt(venue, x, y) < 1) return false;
      if (KOS.World.inZone(venue, x, y, 'swim')) return false;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; if (KOS.World.isSolid(venue, x + Math.cos(a) * margin, y + Math.sin(a) * margin)) return false; }
      return true;
    }
    function action() { return !!(ctrl.state.action || S.botAction); }
    function down() { return U.vec(wind.dir + PI); }
    function windMs() { return U.ms(wind.speed); }
    function bump() {
      if (S.bumpCd > 0) return;
      S.bumpCd = 1.5; S.bumps++;
      floatText(t('rib.fx.bump'), '#ff9a8a'); scene.shake(0.35);
      if (KOS.Input.haptic) KOS.Input.haptic(30);
    }
    function makeOpti(x, y, h, i) {
      const name = NAMES[i % NAMES.length];
      const o = KOS.Physics.createBoat('opti', { x, y, heading: h, sailNo: 'DEN ' + (211 + i * 37), name, crewNames: [name], colors: { hull: HULLS[i % HULLS.length] } });
      Object.assign(o, { luffing: true, boom: 0.15, twa: 1, hike: 0, trim: 0, mass: 85, water: 0, swamped: false, state: 'free', tension: 0, ph: rand() * TAU, idx: i });
      optis.push(o);
      return o;
    }
    // edge-of-screen target arrow, set by each mission
    function currentTarget() { return M.target ? M.target() : null; }
    function prefixStats(o) {
      const out = {};
      for (const k in o) out[KOS.I18n.has('ui.stat.' + k) ? k : 'rib.stat.' + k] = o[k];
      return out;
    }

    // ==================================================================== towline physics (tow + storm)
    // Each opti is a point mass with a hull: low drag along its heading, high drag sideways. The line is a one-sided
    // spring with damping from the leader's stern to the opti's bow: it only pulls when stretched.
    function optiDrift() { const d = down(), k = windMs() * 0.025; return { x: d.x * k, y: d.y * k }; }
    function optiStep(o, dt) {
      const dr = optiDrift();
      const f = U.vec(o.heading), r = U.vec(o.heading + PI / 2);
      const wx = o.vx - dr.x, wy = o.vy - dr.y;
      let u = wx * f.x + wy * f.y, v = wx * r.x + wy * r.y;
      const m = o.mass + o.water * 160, mul = o.swamped ? 3.2 : 1 + o.water;
      u -= (10 * mul * u * Math.abs(u) / m + 0.12 * u) * dt;
      v -= (110 * v * Math.abs(v) / m + 1.2 * v) * dt;
      o.vx = dr.x + f.x * u + r.x * v; o.vy = dr.y + f.y * u + r.y * v;
      const sp = Math.hypot(o.vx, o.vy);
      if (sp > 0.45) o.heading = U.angLerp(o.heading, U.heading(o.vx, o.vy), U.approach(dt, 1.6));
      else if (o.state === 'free') o.heading = U.angLerp(o.heading, wind.dir + PI / 2 * (o.idx % 2 ? 1 : -1), U.approach(dt, 8));
      // keep off land
      const h = KOS.World.hit(venue, o.x + o.vx * dt, o.y + o.vy * dt, 1.2);
      if (h && (h.type === 'land' || h.type === 'breakwater' || h.type === 'pier')) { const vn = o.vx * h.nx + o.vy * h.ny; if (vn < 0) { o.vx -= vn * h.nx * 1.4; o.vy -= vn * h.ny * 1.4; } }
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.speed = u; o.slip = v;
      o.boom = 0.15 * Math.sin(S.time * 1.7 + o.ph) + (o.state === 'tow' ? 0 : 0.25);
      o.t = (o.t || 0) + dt;
    }
    function towStep(dt) {
      for (let i = 0; i < chain.length; i++) {
        const o = chain[i], lead = i ? chain[i - 1] : boat;
        const Pp = KOS.Physics.stern(lead), B = KOS.Physics.bow(o);
        const L = i ? TOW.between : TOW.first;
        const dx = Pp.x - B.x, dy = Pp.y - B.y, d = Math.hypot(dx, dy) || 1e-6;
        o.ropeD = d; o.ropeL = L; o.grace = Math.max(0, (o.grace || 0) - dt);
        if (d <= L) { o.tension = 0; continue; }
        const nx = dx / d, ny = dy / d;
        const vrel = (lead.vx - o.vx) * nx + (lead.vy - o.vy) * ny;
        const F = Math.max(0, TOW.k * (d - L) + TOW.c * vrel);
        o.tension = F;
        const mo = o.mass + o.water * 160;
        o.vx += nx * F / mo * dt; o.vy += ny * F / mo * dt;
        if (lead === boat) {
          const dvx = -nx * F / TOW.mR * dt, dvy = -ny * F / TOW.mR * dt;
          const f = U.vec(boat.heading), r = U.vec(boat.heading + PI / 2);
          boat.speed += dvx * f.x + dvy * f.y; boat.slip += dvx * r.x + dvy * r.y; boat.vx += dvx; boat.vy += dvy;
        } else {
          const ml = lead.mass + lead.water * 160;
          lead.vx -= nx * F / ml * dt; lead.vy -= ny * F / ml * dt;
        }
        o.heading = U.angLerp(o.heading, U.heading(nx, ny), U.approach(dt, 0.6) * Math.min(1, F / 120));
        if (d > L + 3) { const ex = d - L - 3; o.x += nx * ex; o.y += ny * ex; }
        if (F > AS.snap && S.phase === 'go' && !o.grace) { snapAt(i); return; }
      }
    }
    function snapAt(i) {
      const loose = chain.splice(i);
      const o = loose[0];
      loose.forEach(x => { x.state = 'free'; x.tension = 0; x.vx *= 0.5; x.vy *= 0.5; });
      S.mishaps++; S.snaps = (S.snaps || 0) + 1;
      sfx('crash', { vol: 0.5, pitch: 1.6 }); sfx('splash', { vol: 0.6 });
      floatText(t('rib.fx.snap'), '#ff4d5e', o.x, o.y, 26); scene.shake(0.5);
      if (fx()) fx().splash(o.x, o.y, 0.6);
      tip('snap', null, true);
    }
    function towChecks(dt) {
      if (!chain.length) { S.revT = 0; return; }
      if (!S.foul) {
        // line runs forward along the side of the RIB in a sharp turn → tangle
        const st = KOS.Physics.stern(boat), b0 = KOS.Physics.bow(chain[0]);
        const dx = b0.x - st.x, dy = b0.y - st.y, d = Math.hypot(dx, dy) || 1;
        const f = U.vec(boat.heading), back = -(dx * f.x + dy * f.y) / d;
        if (back < -0.5 && !chain[0].grace && Math.abs(boat.speed) > 1.8 && d > TOW.first * 0.92) foul('tangle');
        // reversing over your own line → rope in the prop
        S.revT = controls.throttle < -0.12 && boat.speed < -0.25 ? (S.revT || 0) + dt : 0;
        if (S.revT > 0.7) foul('prop');
      }
      // swamping: too fast with dinghies behind
      for (const o of chain) {
        const k = U.kn(Math.hypot(o.vx, o.vy));
        if (k > AS.towKn) {
          o.water = Math.min(1.2, o.water + (k - AS.towKn) * 0.11 * dt);
          if (fx() && Math.random() < dt * 8) fx().spray(KOS.Physics.bow(o).x, KOS.Physics.bow(o).y, o.heading, 0.5);
          if (o.water > 0.25) tip('towFast');
        } else if (k < 3.2) o.water = Math.max(0, o.water - 0.07 * dt);
        if (!o.swamped && o.water >= 1) { o.swamped = true; S.swamps++; o.tagColor = 'rgba(255,77,94,0.85)'; floatText(t('rib.fx.swamp'), '#49c6f2', o.x, o.y); sfx('splash', { vol: 0.5 }); }
        if (o.swamped && o.water < 0.25) { o.swamped = false; o.tagColor = null; floatText(t('rib.fx.bailed'), '#3ee08f', o.x, o.y); }
      }
    }
    function foul(kind) {
      S.foul = kind; S.fixT = 0; S.mishaps++; S[kind] = (S[kind] || 0) + 1;
      sfx(kind === 'prop' ? 'crash' : 'rope', { vol: 0.6, pitch: kind === 'prop' ? 0.6 : 1 });
      floatText(t('rib.fx.' + kind), '#ff4d5e', boat.x, boat.y - 3, 26); scene.shake(0.4);
      ctrl.highlight('action', true);
      tip(kind, null, true);
    }
    function foulTick(dt) {
      if (!S.foul) return;
      const okSpeed = S.foul === 'prop' || Math.abs(boat.speed) < 0.6;
      if (action() && okSpeed) {
        S.fixT += dt;
        if (Math.random() < dt * 6) sfx('rope', { vol: 0.3, pitch: 1.2 });
        if (S.fixT >= AS.fixT) { S.foul = null; ctrl.highlight('action', false); sfx('knot'); floatText(t('rib.fx.fixed'), '#3ee08f'); if (fx()) fx().stars(boat.x, boat.y, 10); }
      } else S.fixT = Math.max(0, S.fixT - dt * 0.5);
    }
    function pickups() {
      for (const o of optis) {
        if (o.state !== 'free') continue;
        const d = dist(o, boat);
        if (d > AS.pick) continue;
        if (chain.length >= AS.maxTow && P.kind === 'storm') { tip('maxTow', { n: AS.maxTow }); continue; }
        if (S.foul) continue;
        if (kn() > AS.pickKn) { tip('pickSlow'); continue; }
        chain.push(o); o.state = 'tow'; o.grace = 4;
        sfx('rope', { vol: 0.7 }); sfx('coin', { pitch: 1 + chain.length * 0.08 });
        floatText(t('rib.fx.hooked'), '#ffd25e', o.x, o.y);
        if (fx()) { fx().stars(o.x, o.y, 10); fx().ripple(o.x, o.y, 3, 0.9); }
        if (KOS.Input.haptic) KOS.Input.haptic(18);
      }
    }
    function berths(n) { // tie-up spots along the Opti jetty (A), bows out
      const out = [], root = { x: -31, y: 45 }, h = U.rad(-40), f = U.vec(h), l = U.vec(h - PI / 2);
      for (let k = 0; out.length < n && k < 20; k++) {
        const s = 9 + Math.floor(k / 2) * 5.5, side = k % 2 ? -1 : 1;
        const x = root.x + f.x * s + l.x * side * 2.6, y = root.y + f.y * s + l.y * side * 2.6;
        if (!KOS.World.isSolid(venue, x, y)) out.push({ x, y, h });
      }
      while (out.length < n) out.push({ x: HOME.x + out.length * 3, y: HOME.y + 10, h });
      return out;
    }
    let BERTHS = null;
    function deliver() {
      if (!BERTHS) BERTHS = berths(optis.length);
      const n = chain.length;
      chain.splice(0).forEach(o => { const b = BERTHS[S.homeN || 0]; S.homeN = (S.homeN || 0) + 1; o.state = 'home'; o.berth = b; o.tension = 0; o.homeT = 0; o.tag = '✓ ' + o.name; o.tagColor = 'rgba(30,150,90,0.8)'; });
      sfx('bell'); sfx('cheer', { vol: 0.35 });
      floatText(t('rib.fx.home'), '#3ee08f', boat.x, boat.y - 3, 28);
      if (fx()) { fx().confetti(HOME.x, HOME.y, 40 + n * 10); fx().stars(boat.x, boat.y, 12); }
      return n;
    }
    function homeAnim(o, dt) { // glide to the berth and lie still
      o.homeT += dt;
      const k = U.approach(dt, 0.7);
      o.x += (o.berth.x - o.x) * k; o.y += (o.berth.y - o.y) * k;
      o.heading = U.angLerp(o.heading, o.berth.h, k); o.vx = o.vy = 0; o.speed = 0;
      o.boom = 0.1 * Math.sin(S.time + o.ph);
    }

    // ==================================================================== slow zone (bay)
    function zoneTick(dt) {
      if (!isBay) return;
      const z = inSlow(boat.x, boat.y);
      if (z && !S.inZone && S.phase === 'go') { tip('zone', { kn: AS.zoneKn }); floatText(t('rib.fx.zone'), '#ffd25e'); }
      S.inZone = z;
      S.wakeCd -= dt;
      const over = z && kn() > AS.zoneKn + 0.3;
      S.overT = over ? S.overT + dt : 0;
      if (S.overT > 0.8 && S.wakeCd <= 0 && S.phase === 'go') {
        S.wakes++; S.wakeCd = 3;
        sfx('whistle', { vol: 0.8 }); floatText(t('rib.fx.wake'), '#ff4d5e', boat.x, boat.y - 3, 26);
        if (fx()) { const st = KOS.Physics.stern(boat); fx().ripple(st.x, st.y, 6, 1.6); fx().ripple(st.x, st.y, 10, 2, 0.3); }
        scene.shake(0.2); tip('wake');
      }
    }

    // ==================================================================== RIB bot (test hook): drive to a point
    // is the straight line clear of land, piers and breakwaters with a few meters to spare?
    function clearLine(a, b, r) {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      for (let k = 1; k <= n; k++) {
        if (L * (1 - k / n) < 7) break; // the last few meters (a berth, the box by the pontoon) are the target itself
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n; const h = KOS.World.hit(venue, x, y, r); if (h && h.type !== 'shallow') return false;
      }
      return true;
    }
    const WAYPTS = isBay ? [{ x: -78, y: -72 }, { x: -100, y: -135 }, { x: 22, y: -64 }, { x: 140, y: -90 }, { x: 180, y: -175 }, { x: -60, y: -40 }] : [];
    let route = null;
    function drive(tx, ty, wantKn, o) {
      o = o || {};
      // simple routing round the island breakwater and the jetties
      const tgt = { x: tx, y: ty };
      // re-plan a few times a second (World.hit sampling is not free), or when the target jumps
      if (!route || env.t - route.t > 0.35 || Math.hypot(route.tx - tx, route.ty - ty) > 4) {
        let best = null;
        if (WAYPTS.length && Math.hypot(tx - boat.x, ty - boat.y) > 8 && !clearLine(boat, tgt, 3.5)) {
          let bd = Infinity;
          for (const w of WAYPTS) {
            if (Math.hypot(w.x - boat.x, w.y - boat.y) < 11 || !clearLine(boat, w, 3.5)) continue;
            const c = Math.hypot(w.x - boat.x, w.y - boat.y) + Math.hypot(tx - w.x, ty - w.y) + (clearLine(w, tgt, 3.5) ? 0 : 400);
            if (c < bd) { bd = c; best = w; }
          }
        }
        route = { t: env.t, tx, ty, via: best };
      }
      if (route.via) { tx = route.via.x; ty = route.via.y; o = Object.assign({}, o, { min: Math.max(o.min || 0, 3) }); }
      const dx = tx - boat.x, dy = ty - boat.y, d = Math.hypot(dx, dy);
      const err = U.angDiff(boat.heading, U.heading(dx, dy));
      let k = Math.min(wantKn, (o.stopAt != null ? Math.max(0, d - o.stopAt) : d) * (o.brake || 0.7) + (o.min || 0));
      if (Math.abs(err) > 1.2 && d < 25) k = Math.min(k, 4);
      const cur = U.kn(boat.speed);
      const thr = U.clamp(k / 28 + (k - cur) * 0.07, o.noReverse ? 0 : -0.5, 1);
      return { rudder: U.clamp(err * 2.4, -(o.maxRud || 1), o.maxRud || 1), throttle: thr };
    }
    function zoneSafeKn(x, y, k) { // the bot slows down before it enters the slow zone (look ahead ~4 s)
      if (!isBay) return k;
      const ahead = { x: boat.x + boat.vx * 4, y: boat.y + boat.vy * 4 };
      const z = p => inSlow(p.x, p.y);
      return z(boat) || z(ahead) ? Math.min(k, AS.zoneKn - 0.8) : k;
    }

    // ==================================================================== missions
    // A mission returns hooks: {spawn?, span, hud, button?, update(dt), target(), card() → {head, text, bar?}, hudData(d), bot(), draw?(ctx, sc), drawScreen?(ctx, sc)}

    // ---------------------------------------------------------------- 1. learn to drive
    function mLearn() {
      const steps = [
        { type: 'ring', key: 's1', x: 15, y: -52 },
        { type: 'ring', key: 's3', x: -88, y: -92 },
        { type: 'plane', key: 's4', n: 3 },
        { type: 'ring', key: 's5', x: -175, y: -330, yellow: true },
        { type: 'ring', key: 's2', x: -265, y: -250, yellow: true },
        { type: 'ring', key: 's6', x: -30, y: -68 },
        { type: 'reverse', key: 's7', n: 8 },
        { type: 'park', key: 's8' },
      ];
      let i = 0, v = 0, parkT = 0, revStart = null;
      // reference time: legs inside the zone at zone speed, outside at a brisk pace, plus the exercises
      const pts = [spawn].concat(steps.filter(s => s.x != null)).concat([PARK]);
      let ref = 26;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ref += Math.hypot(b.x - a.x, b.y - a.y) / (inSlow(mx, my) ? U.ms(AS.zoneKn) * 0.85 : 9) + 3;
      }
      const cur = () => steps[i];
      function next() {
        i++; v = 0; revStart = null;
        sfx('star', { pitch: 1 + i * 0.05 });
        if (fx()) fx().stars(boat.x, boat.y, 12);
        const s = cur();
        if (!s) { finishLearn(); return; }
        if (s.type === 'reverse') tip('reverse', null, true);
        if (s.type === 'park') tip('park', null, true);
      }
      function finishLearn() {
        floatText(t('rib.fx.parked'), '#3ee08f', boat.x, boat.y - 3, 28);
        complete({ success: true, ratio: S.time / ref, care: S.wakes + S.bumps, msgKey: 'rib.res.learn',
          msgVars: { time: KOS.UI.fmtTime(S.time * 1000), wakes: S.wakes }, stats: { wakes: S.wakes, bumps: S.bumps, top: +S.topKn.toFixed(1) } });
      }
      return {
        span: 72, hud: ['speed', 'timer', { id: 'step', icon: 'flag', labelKey: 'rib.hud.step' }],
        update(dt) {
          const s = cur(); if (!s) return;
          if (s.type === 'ring') {
            if (Math.hypot(boat.x - s.x, boat.y - s.y) < AS.ring) {
              floatText(t('rib.fx.ring'), s.yellow ? '#ffd25e' : '#9fe7ff', s.x, s.y); sfx('coin', { pitch: 1 + i * 0.06 });
              if (fx()) fx().ripple(s.x, s.y, AS.ring, 1);
              next();
            }
          } else if (s.type === 'plane') {
            if (boat.planing) { v += dt; if (v >= s.n) { floatText(t('rib.fx.plane'), '#3ee08f'); tip('plane'); next(); } } else v = Math.max(0, v - dt * 0.5);
          } else if (s.type === 'reverse') {
            if (boat.speed < -0.2) { if (!revStart) revStart = { x: boat.x, y: boat.y }; v = Math.hypot(boat.x - revStart.x, boat.y - revStart.y); if (v >= s.n) { floatText(t('rib.fx.reverse'), '#9fe7ff'); next(); } }
          } else if (s.type === 'park') {
            const f = U.vec(PARK.h), r = U.vec(PARK.h + PI / 2), dx = boat.x - PARK.x, dy = boat.y - PARK.y;
            const inBox = Math.abs(dx * f.x + dy * f.y) < PARK.len / 2 && Math.abs(dx * r.x + dy * r.y) < PARK.wid / 2 + (assist === 'easy' ? 1.2 : 0.4);
            parkT = inBox && Math.abs(boat.speed) < (assist === 'easy' ? 0.5 : 0.32) ? parkT + dt : 0;
            v = parkT;
            if (parkT > 1) next();
          }
        },
        target() {
          const s = cur(); if (!s) return null;
          if (s.type === 'ring') return { x: s.x, y: s.y, color: s.yellow ? '#ffd25e' : '#9fe7ff' };
          if (s.type === 'park') return { x: PARK.x, y: PARK.y, color: '#3ee08f', label: 'P' };
          return null;
        },
        card() {
          const s = cur(); if (!s) return null;
          const bar = s.type === 'plane' ? v / s.n : s.type === 'reverse' ? v / s.n : s.type === 'park' ? parkT : null;
          return { head: t('rib.card.learn') + ' · ' + (i + 1) + '/' + steps.length, text: t('rib.step.' + s.key, { n: s.n }), bar, dots: { n: steps.length, i } };
        },
        hudData(d) { d.custom = { step: Math.min(i + 1, steps.length) + '<small>/' + steps.length + '</small>' }; },
        bot() {
          const s = cur(); if (!s) return null;
          if (s.type === 'ring') return drive(s.x, s.y, zoneSafeKn(s.x, s.y, s.yellow ? 26 : 18), { min: 3 });
          if (s.type === 'plane') return { rudder: 0, throttle: 1 };
          if (s.type === 'reverse') return { rudder: 0, throttle: boat.speed > 0.3 ? -0.25 : -0.45 };
          const d = dist(boat, PARK);
          if (d < 1.4) return { rudder: 0, throttle: U.clamp(-boat.speed * 0.4, -0.3, 0.3) };
          return drive(PARK.x, PARK.y, Math.min(AS.zoneKn - 1, 1.2 + d * 0.25), { brake: 0.3 });
        },
        draw(ctx, sc) {
          const tm = sc.t, mpp = sc.mpp;
          steps.forEach((s, k) => { if (s.type === 'ring' && k >= i && k <= i + 1) drawRing(ctx, s.x, s.y, AS.ring, k === i, s.yellow, tm, mpp, String(k + 1)); });
          drawParkBox(ctx, tm, mpp, cur() && cur().type === 'park');
        },
      };
    }

    // ---------------------------------------------------------------- 2. tow a line of Optis home
    function mTow() {
      const n = AS.nTow;
      const spots = [[-220, -300], [-262, -342], [-305, -305], [-250, -392], [-322, -372], [-200, -362]];
      for (let k = 0; k < n; k++) makeOpti(spots[k][0], spots[k][1], rand() * TAU, k);
      let ref = 0; { let p = spawn; const left = optis.slice(); while (left.length) { left.sort((a, b) => dist(a, p) - dist(b, p)); const o = left.shift(); ref += dist(p, o) / (chain.length ? 2.6 : 8) + 6; p = o; } ref += dist(p, HOME) / 2.6 + 20; ref *= 1.05; }
      let done = false;
      return {
        span: 92, hud: ['wind', 'speed', 'timer', { id: 'optis', icon: 'boat', labelKey: 'rib.hud.optis' }], button: { icon: 'knot', key: 'rib.btn.fix' },
        update(dt) {
          if (done) return;
          pickups();
          if (chain.length === n && dist(boat, HOME) < HOME.r + (assist === 'easy' ? 4 : 0)) {
            tip('homeStop');
            if (kn() < (assist === 'easy' ? 2 : 1.4) && !S.foul) {
              done = true; deliver();
              complete({ success: true, ratio: S.time / ref, care: S.mishaps + S.swamps + S.wakes, msgKey: 'rib.res.tow',
                msgVars: { n, time: KOS.UI.fmtTime(S.time * 1000) }, stats: { optis: n, mishaps: S.mishaps, swamps: S.swamps, wakes: S.wakes } });
            }
          }
        },
        target() {
          if (S.foul) return null;
          if (chain.length < n) { const o = nearestFree(); return o ? { x: o.x, y: o.y, color: '#ffd25e' } : null; }
          return { x: HOME.x, y: HOME.y, color: '#3ee08f', label: '⚓' };
        },
        card() {
          if (S.foul) return { head: t('rib.card.tow'), text: t('rib.task.fix'), bar: S.fixT / AS.fixT, warn: true };
          return { head: t('rib.card.tow') + ' · ' + chain.length + '/' + n, text: chain.length < n ? t('rib.task.pick', { n: chain.length, total: n }) : t('rib.task.home') };
        },
        hudData(d) { d.custom = { optis: chain.length + '<small>/' + n + '</small>' }; },
        bot() { return towBot(n); },
        draw(ctx, sc) { drawHome(ctx, sc, chain.length === n); },
      };
    }
    function nearestFree() { let b = null, bd = Infinity; for (const o of optis) if (o.state === 'free') { const d = dist(o, boat); if (d < bd) { bd = d; b = o; } } return b; }
    function towBot(need) {
      if (S.foul) { S.botAction = true; return { rudder: 0, throttle: Math.abs(boat.speed) > 0.3 ? -boat.speed * 0.15 : 0 }; }
      S.botAction = false;
      const o = chain.length < need ? nearestFree() : null;
      const towing = chain.length > 0;
      const maxRud = towing ? 0.42 : 1;
      if (o) {
        const d = dist(o, boat);
        return drive(o.x, o.y, zoneSafeKn(o.x, o.y, d < 30 ? AS.pickKn - 1.2 : towing ? AS.towKn - 0.7 : 18), { maxRud, min: 1.2, brake: towing ? 0.2 : 0.35, noReverse: towing });
      }
      const d = dist(boat, HOME);
      if (d < HOME.r - 4) return { rudder: 0, throttle: boat.speed > 0.2 ? -0.25 : 0 };
      return drive(HOME.x, HOME.y, zoneSafeKn(HOME.x, HOME.y, AS.towKn - 0.7), { maxRud, min: 1, brake: 0.18, noReverse: true });
    }

    // ---------------------------------------------------------------- 3. rescue a capsized dinghy
    function mRescue() {
      const total = P.count || 2;
      const spots = [{ x: -230, y: -290 }, { x: -140, y: -470 }, { x: -320, y: -520 }];
      const victims = [];
      for (let k = 0; k < total; k++) {
        const o = makeOpti(spots[k].x, spots[k].y, wind.dir + PI / 2, k + 2);
        o.state = k === 0 ? 'capsized' : 'sailing';
        o.helm = KOS.AI.createHelm(o, { skill: 0.6, seed: 31 + k });
        o.plan = { course: [{ x: spots[k].x - 40, y: spots[k].y - 30, r: 8 }, { x: spots[k].x + 40, y: spots[k].y + 20, r: 8 }, { x: spots[k].x - 40, y: spots[k].y - 30, r: 8 }, { x: spots[k].x + 40, y: spots[k].y + 20, r: 8 }] };
        o.ctl = KOS.Physics.controls();
        victims.push(o);
      }
      KOS.Physics.capsize(victims[0], 1);
      let vi = 0, rightT = 0, saved = 0;
      let ref = 0; { let p = spawn; victims.forEach(v => { ref += dist(p, v) / 8 + 30; p = v; }); }
      const cur = () => victims[vi];
      function lee(o) { const rx = boat.x - o.x, ry = boat.y - o.y, d = Math.hypot(rx, ry) || 1, dw = down(); return (rx * dw.x + ry * dw.y) / d; }
      return {
        span: 70, hud: ['wind', 'speed', 'timer', { id: 'res', icon: 'life', labelKey: 'rib.hud.rescued' }], button: { icon: 'hand', key: 'rib.btn.help' },
        update(dt) {
          for (const o of victims) {
            if (o.state === 'capsized') {
              const dw = down(), k = windMs() * 0.012;
              o.vx = dw.x * k; o.vy = dw.y * k; o.x += o.vx * dt; o.y += o.vy * dt; o.speed = 0; o.t = (o.t || 0) + dt;
            } else if (o.state === 'sailing' || o.state === 'away') {
              const c = o.helm.think(envFleet, o.plan, [o]);
              Object.assign(o.ctl, c);
              KOS.Physics.step(o, o.ctl, envFleet, dt);
              if (o.state === 'away' && (o.awayT = (o.awayT || 0) + dt) > 30) o.hidden = true;
            }
          }
          const o = cur(); if (!o) return;
          const d = dist(o, boat);
          if (o.state !== 'capsized') return;
          if (d < 16 && kn() > 4) { if (S.fastCd <= 0 || S.fastCd == null) { S.fastCd = 3; S.bumps++; floatText(t('rib.fx.slow'), '#ff9a8a', o.x, o.y); tip('tooFast', null, true); sfx('whistle', { vol: 0.5 }); } }
          S.fastCd = (S.fastCd || 0) - dt;
          if (d < 3.4) { // touching the dinghy: push apart
            const nx = (boat.x - o.x) / (d || 1), ny = (boat.y - o.y) / (d || 1);
            boat.x += nx * (3.4 - d); boat.y += ny * (3.4 - d);
            if (Math.abs(boat.speed) > 0.5 || lee(o) < 0) bump();
          }
          const close = d < AS.helpR, slow = kn() < AS.helpKn, leeOK = lee(o) > AS.lee;
          if (close && !leeOK) tip('windward', null, true);
          else if (d < 30 && !S.tips.drift && S.time > 5) tip('drift');
          S.canHelp = close && slow && leeOK;
          if (S.canHelp) { tip('hold'); ctrl.highlight('action', true); }
          else ctrl.highlight('action', false);
          if (S.canHelp && action()) {
            S.holdT += dt;
            if (Math.random() < dt * 4) { sfx('splash', { vol: 0.25, pitch: 1.4 }); if (fx()) fx().ripple(o.x, o.y, 2, 0.8); }
            if (S.holdT >= AS.helpT) {
              S.holdT = 0; saved++; o.state = 'righting'; rightT = 0; ctrl.highlight('action', false);
            }
          } else S.holdT = Math.max(0, S.holdT - dt * 0.6);
        },
        late(dt) {
          const o = cur(); if (!o || o.state !== 'righting') return;
          rightT += dt;
          if (rightT > 0.6 && o.capsized) {
            KOS.Physics.right(o, wind.dir);
            sfx('splash', { vol: 0.7 }); sfx('cheer', { vol: 0.4 });
            floatText(t('rib.fx.righted'), '#3ee08f', o.x, o.y, 26); floatText(t('rib.fx.thanks'), '#ffd25e', o.x, o.y - 5, 20);
            if (fx()) { fx().stars(o.x, o.y, 14); fx().confetti(o.x, o.y, 40); }
          }
          if (rightT > 1.6) {
            o.state = 'away'; o.plan = { target: { x: -60, y: -120, r: 10 } };
            vi++;
            const n2 = cur();
            if (n2) { KOS.Physics.capsize(n2, -1); n2.state = 'capsized'; n2.luffing = true; sfx('splash'); floatText(t('rib.fx.oops'), '#ff9a8a', n2.x, n2.y, 24); }
            else complete({ success: true, ratio: S.time / ref, care: S.bumps + S.wakes, msgKey: 'rib.res.rescue',
              msgVars: { n: saved, time: KOS.UI.fmtTime(S.time * 1000) }, stats: { helped: saved, bumps: S.bumps, wakes: S.wakes } });
          }
        },
        target() { const o = cur(); return o && o.state === 'capsized' ? { x: o.x, y: o.y, color: '#ff7a3d' } : null; },
        card() {
          const o = cur(); if (!o) return null;
          const holding = S.canHelp || S.holdT > 0;
          return { head: t('rib.card.rescue') + ' · ' + saved + '/' + total, text: holding ? t('rib.task.hold') : t('rib.task.rescue', { n: saved + 1, total }), bar: holding ? S.holdT / AS.helpT : null };
        },
        hudData(d) { d.custom = { res: saved + '<small>/' + total + '</small>' }; },
        bot() {
          const o = cur(); if (!o || o.state !== 'capsized') { S.botAction = false; return { rudder: 0, throttle: 0 }; }
          const dw = down(), A = { x: o.x + dw.x * 18, y: o.y + dw.y * 18 }, B = { x: o.x + dw.x * 4.0, y: o.y + dw.y * 4.0 };
          const d = dist(boat, o), lv = lee(o);
          S.botAction = S.canHelp;
          if (lv < 0.6 && d < 40) { // go round to leeward, well clear of the dinghy
            const side = U.vec(wind.dir + PI / 2), sx = (boat.x - o.x) * side.x + (boat.y - o.y) * side.y >= 0 ? 1 : -1;
            const C = { x: o.x + side.x * sx * 14 + dw.x * 20, y: o.y + side.y * sx * 14 + dw.y * 20 };
            return drive(C.x, C.y, 5, { min: 1.5 });
          }
          if (d > 40) return drive(A.x, A.y, 16, { min: 2 });
          const db = dist(boat, B);
          if (db < 0.8) return { rudder: U.clamp(U.angDiff(boat.heading, wind.dir) * 2, -1, 1), throttle: U.clamp(0.04 - boat.speed * 0.25, -0.15, 0.15) };
          return drive(B.x, B.y, Math.min(AS.helpKn + 1.5, 0.5 + db * 0.4), { brake: 0.5, min: 0.5 });
        },
        draw(ctx, sc) {
          const o = cur(); if (!o || (o.state !== 'capsized' && o.state !== 'righting')) return;
          drawLeeWedge(ctx, o, sc);
          if (S.holdT > 0 || S.canHelp) drawHoldRing(ctx, o.x, o.y, 5, S.holdT / AS.helpT, sc);
        },
      };
    }

    // ---------------------------------------------------------------- 4. lay race marks (Øresund)
    function mMarks() {
      const C = venue.courseArea || { x: 3750, y: -2000 };
      const up = U.vec(U.rad(P.windDeg)), right = U.vec(U.rad(P.windDeg) + PI / 2);
      const at = (u, r) => ({ x: C.x + up.x * u + right.x * r, y: C.y + up.y * u + right.y * r });
      const targets = [
        Object.assign(at(-110, -55), { kind: 'pin', key: 'pin' }),
        Object.assign(at(-30, -14), { kind: 'gate', key: 'gate1' }),
        Object.assign(at(-30, 14), { kind: 'gate', key: 'gate2' }),
        Object.assign(at(240, 0), { kind: 'orange', key: 'top' }),
      ];
      const com = Object.assign(at(-110, 55), { kind: 'committee', heading: U.rad(P.windDeg), r: 3 });
      marks.push(com);
      let i = 0, falling = null, misses = 0;
      const dists = [];
      let ref = 0; { let p = spawn; targets.forEach(tg => { ref += dist(p, tg) / 9 + 14; p = tg; }); }
      const sp = { x: venue.spawn.x, y: venue.spawn.y, heading: U.heading(targets[0].x - venue.spawn.x, targets[0].y - venue.spawn.y) };
      function drop() {
        if (falling || !targets[i] || S.phase !== 'go') return;
        const st = KOS.Physics.stern(boat);
        if (kn() > 2.5) tip('dropSlow');
        falling = { x: st.x, y: st.y, vx: boat.vx, vy: boat.vy, t: 0, kind: targets[i].kind, label: String(i + 1), r: 1.2 };
        marks.push(falling);
        sfx('splash', { vol: 0.6 }); sfx('rope', { vol: 0.4 });
        if (fx()) fx().splash(st.x, st.y, 0.5);
      }
      return {
        spawn: sp, span: 80, hud: ['wind', 'speed', 'timer', { id: 'gps', icon: 'compass', labelKey: 'rib.hud.gps' }, { id: 'mk', icon: 'buoy', labelKey: 'rib.hud.marks' }],
        button: { icon: 'buoy', key: 'rib.btn.drop' }, onAction: drop,
        update(dt) {
          const tg = targets[i];
          if (tg && dist(boat, tg) < AS.markR * 2.2 && !falling) ctrl.highlight('action', kn() < 2.5);
          if (tg && dist(boat, tg) < 30 && kn() < 1 && S.time > 8) tip('drift');
          if (!falling) return;
          falling.t += dt;
          const k = Math.exp(-2.4 * dt), dw = down(), wd = windMs() * 0.035;
          falling.vx *= k; falling.vy *= k;
          falling.x += (falling.vx + dw.x * wd) * dt; falling.y += (falling.vy + dw.y * wd) * dt;
          if (falling.t > 1.4) {
            const dd = dist(falling, tg), q = dd / AS.markR;
            ctrl.highlight('action', false);
            if (q <= 1) {
              dists.push(dd);
              const lbl = q <= 0.34 ? 'bull' : q <= 0.67 ? 'great' : 'ok';
              floatText(t('rib.fx.' + lbl) + '  ' + dd.toFixed(1) + ' m', lbl === 'bull' ? '#ffd25e' : '#3ee08f', falling.x, falling.y, lbl === 'bull' ? 28 : 22);
              sfx(lbl === 'bull' ? 'star' : 'coin', { pitch: lbl === 'bull' ? 1.2 : 1 });
              if (fx()) { fx().stars(falling.x, falling.y, lbl === 'bull' ? 16 : 8); if (lbl === 'bull') fx().confetti(falling.x, falling.y, 40); }
              tg.done = true; falling.done = true; falling = null; i++;
              if (i >= targets.length) {
                const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
                const precise = (avg / AS.markR + misses * 0.25) <= 0.45;
                complete({ success: true, ratio: S.time / ref, care: precise ? 0 : 99, msgKey: 'rib.res.marks',
                  msgVars: { avg: avg.toFixed(1) }, stats: { precision: +avg.toFixed(1), misses } });
              }
            } else {
              misses++;
              floatText(t('rib.fx.miss') + '  ' + Math.round(dd) + ' m', '#ff4d5e', falling.x, falling.y, 24);
              sfx('lose', { vol: 0.35 }); tip('miss', null, true);
              const m = falling; marks.splice(marks.indexOf(m), 1); falling = null;
              if (fx()) fx().splash(m.x, m.y, 0.4);
            }
          }
        },
        target() { const tg = targets[i]; return tg ? { x: tg.x, y: tg.y, color: '#ff7a3d', label: String(i + 1) } : null; },
        card() {
          const tg = targets[i]; if (!tg) return null;
          return { head: t('rib.card.marks') + ' · ' + i + '/' + targets.length, text: t('rib.task.mark', { n: i + 1, total: targets.length, name: t('rib.mark.' + tg.key) }) };
        },
        hudData(d) { const tg = targets[i]; d.custom = { gps: tg ? Math.round(dist(boat, tg)) + '<small> m</small>' : '✓', mk: i + '<small>/' + targets.length + '</small>' }; },
        bot() {
          const tg = targets[i]; S.botAction = false;
          if (!tg || falling) return { rudder: 0, throttle: U.clamp(-boat.speed * 0.2, -0.2, 0.2) };
          const st = KOS.Physics.stern(boat), d = dist(st, tg);
          if (d < 1.6 && Math.abs(boat.speed) < 0.5) { S.botAction = true; drop(); return { rudder: 0, throttle: 0 }; }
          if (d < 9) { const f = U.vec(boat.heading), hl = boat.cls.length / 2; return drive(tg.x + f.x * hl, tg.y + f.y * hl, 1.4 + d * 0.3, { brake: 0.3, min: 0.5 }); }
          return drive(tg.x, tg.y, 22, { brake: 0.22, min: 0.8 });
        },
        draw(ctx, sc) {
          targets.forEach((tg, k) => { if (!tg.done) drawTargetCross(ctx, tg, AS.markR, k === i, sc, String(k + 1)); });
        },
      };
    }

    // ---------------------------------------------------------------- 5. coach boat: follow the Opti fleet
    function mCoach() {
      const wd = U.rad(P.windDeg), up = U.vec(wd), right = U.vec(wd + PI / 2);
      const L = { x: -225, y: -470 }, W = { x: L.x + up.x * 105, y: L.y + up.y * 105 };
      marks.push({ x: W.x, y: W.y, kind: 'orange', round: 'port', r: 1.2, label: '1' }, { x: L.x, y: L.y, kind: 'orange', round: 'port', r: 1.2, label: '2' });
      const plan = { course: [{ x: W.x, y: W.y, round: 'port' }, { x: L.x, y: L.y, round: 'port' }, { x: W.x, y: W.y, round: 'port' }, { x: L.x, y: L.y, round: 'port' }] };
      const n = P.fleet || 5;
      for (let k = 0; k < n; k++) {
        const x = L.x + up.x * (6 + (k % 3) * 5) + right.x * (-16 + k * 8), y = L.y + up.y * (6 + (k % 3) * 5) + right.y * (-16 + k * 8);
        const b = KOS.Physics.createBoat('opti', { x, y, heading: U.wrapPi(wd - 0.9), speed: 1, sailNo: 'DEN ' + (300 + k * 23), name: NAMES[(k + 3) % NAMES.length], colors: { hull: HULLS[(k + 2) % HULLS.length] } });
        b.helm = KOS.AI.createHelm(b, { skill: 0.55 + 0.08 * (k % 4), seed: 77 + k });
        b.plan = Object.assign({}, plan, { course: plan.course.slice() });
        b.cross = 0; b.problem = null;
        fleet.push(b);
      }
      const dur = assist === 'pro' ? 120 : assist === 'easy' ? 90 : 105;
      let inT = 0, helped = 0, problems = 0, crossings = 0, nextProb = 7, shoutCd = 0, nearState = 'ok', nearT = 0;
      const sp = { x: L.x + right.x * 32 - up.x * 10, y: L.y + right.y * 32 - up.y * 10, heading: U.wrapPi(wd + PI) };
      function shout() {
        if (S.phase !== 'go' || shoutCd > 0) return;
        shoutCd = 0.8;
        const b = fleet.find(x => x.problem && dist(x, boat) < (assist === 'easy' ? 42 : 32));
        sfx('whistle', { vol: 0.5, pitch: 1.3 });
        if (b) {
          KOS.UI.coach(t('rib.shout.' + b.problem.kind, { name: b.name }), { ms: 2600 });
          b.problem = null; helped++;
          floatText(t('rib.fx.shout'), '#3ee08f', b.x, b.y - 3, 24); sfx('coin', { pitch: 1 + helped * 0.06 });
          if (fx()) fx().stars(b.x, b.y, 10);
        } else floatText('📣', '#ffffff', boat.x, boat.y - 3, 22);
      }
      function centroid() { let x = 0, y = 0; fleet.forEach(b => { x += b.x; y += b.y; }); return { x: x / fleet.length, y: y / fleet.length }; }
      return {
        spawn: sp, span: 115, hud: ['wind', 'speed', { id: 'left', icon: 'clock', labelKey: 'rib.hud.left' }, { id: 'near', icon: 'eye', labelKey: 'rib.hud.near' }],
        button: { icon: 'whistle', key: 'rib.btn.shout' }, onAction: shout,
        update(dt) {
          shoutCd -= dt;
          for (const b of fleet) {
            let c = b.helm.think(envFleet, b.plan, fleet.concat([boat]));
            if (b.problem) {
              b.problem.t -= dt;
              c = Object.assign({}, c);
              if (b.problem.kind === 'luff') c.trimBias = 0.7; else if (b.problem.kind === 'stall') c.trimBias = -0.5; else { c.autoHike = false; c.hike = 0; }
              if (b.problem.t <= 0) { b.problem = null; }
            }
            KOS.Physics.step(b, c, envFleet, dt);
            // crossing in front of their bow?
            const f = U.vec(b.heading), r = U.vec(b.heading + PI / 2), dx = boat.x - b.x, dy = boat.y - b.y;
            const along = dx * f.x + dy * f.y, lat = Math.abs(dx * r.x + dy * r.y);
            b.cross -= dt;
            if (along > 2 && along < 22 && lat < 5 && b.cross <= 0 && S.phase === 'go') {
              b.cross = 4; crossings++;
              floatText(t('rib.fx.cross'), '#ff4d5e', b.x, b.y - 3, 22); sfx('hornShort', { vol: 0.5 }); tip('cross', null, true);
            }
            if (Math.hypot(dx, dy) < 18 && kn() > 9 && b.cross <= 0) { b.cross = 4; crossings++; floatText(t('rib.fx.wake'), '#ff4d5e', b.x, b.y - 3); tip('wakeNear', null, true); }
          }
          KOS.Physics.collide([boat].concat(fleet), venue, marks);
          // shouting distance
          let dn = Infinity; fleet.forEach(b => { dn = Math.min(dn, dist(b, boat)); });
          const st = dn < AS.near[0] ? 'close' : dn > AS.near[1] ? 'far' : 'ok';
          if (st === 'ok') inT += dt;
          if (st !== nearState) { nearState = st; nearT = 0; }
          nearT += dt;
          if (st !== 'ok' && nearT > 2.5 && S.phase === 'go') tip(st);
          // problems pop up
          nextProb -= dt;
          if (nextProb <= 0 && S.phase === 'go') {
            nextProb = 10 + rand() * 4;
            const cand = fleet.filter(b => !b.problem);
            if (cand.length) { const b = cand[Math.floor(rand() * cand.length)]; b.problem = { kind: ['luff', 'stall', 'hike'][problems % 3], t: assist === 'easy' ? 13 : 10, max: assist === 'easy' ? 13 : 10 }; problems++; sfx('bell', { vol: 0.4, pitch: 1.3 }); tip('problem', { name: b.name }); }
          }
          if (S.time >= dur) {
            const pct = inT / Math.max(1, S.time), ok = pct >= AS.pct;
            const careOK = crossings <= AS.mishaps && helped >= Math.ceil(problems * 0.6);
            complete({ success: ok, stars: ok ? 1 + (pct >= AS.pct + 0.2 ? 1 : 0) + (careOK ? 1 : 0) : 0,
              msgKey: ok ? 'rib.res.coach' : 'rib.res.coachFail', msgVars: { pct: Math.round(pct * 100), n: helped },
              stats: { coverage: Math.round(pct * 100) + ' %', helped: helped + '/' + problems, crossings }, score: Math.round(pct * 2000 + helped * 250 - crossings * 150) });
          }
        },
        target() {
          const b = fleet.find(x => x.problem);
          if (b) return { x: b.x, y: b.y, color: '#ffd25e', label: '!' };
          if (nearState === 'far') { const c = centroid(); return { x: c.x, y: c.y, color: '#9fe7ff' }; }
          return null;
        },
        card() {
          return { head: t('rib.card.coach'), text: t('rib.task.coach'), bar: inT / Math.max(1, S.time), barGood: AS.pct, warn: nearState !== 'ok' };
        },
        hudData(d) {
          d.custom = { left: KOS.UI.fmtTime(Math.max(0, dur - S.time) * 1000).replace(/\.\d$/, ''), near: Math.round(100 * inT / Math.max(1, S.time)) + '<small>%</small>' };
        },
        bot() {
          const b = fleet.find(x => x.problem);
          const c = centroid();
          const dw = down();
          let tx, ty;
          if (b && dist(b, boat) > 20) { tx = b.x + dw.x * 16 + right.x * 6; ty = b.y + dw.y * 16 + right.y * 6; }
          else { tx = c.x + right.x * 24 + dw.x * 6; ty = c.y + right.y * 24 + dw.y * 6; }
          S.botAction = !!(b && dist(b, boat) < 30);
          if (S.botAction) shout();
          return drive(tx, ty, 8, { brake: 0.35 });
        },
        drawScreen(ctx, sc) {
          for (const b of fleet) if (b.problem) drawProblem(ctx, sc, b);
          // shouting-distance ring around the RIB
          const p = sc.worldToScreen(boat.x, boat.y), rr = (assist === 'easy' ? 42 : 32) / sc.mpp;
          ctx.save(); ctx.setLineDash([4, 6]); ctx.strokeStyle = fleet.some(x => x.problem) ? 'rgba(255,210,94,0.55)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke(); ctx.restore();
        },
      };
    }

    // ---------------------------------------------------------------- 6. drifting gear
    function mGear() {
      const kinds = ['paddle', 'bailer', 'fender', 'vest', 'cap', 'bottle', 'sponge'];
      const waves = [{ t: 0, x: -470, y: -215 }, { t: 18, x: -455, y: -70 }, { t: 36, x: -490, y: -295 }, { t: 54, x: -400, y: -150 }];
      const per = 3, total = waves.length * per;
      let saved = 0, lost = 0, w = 0, spawned = 0, done = false;
      function spawnWave(wv) {
        for (let k = 0; k < per; k++) {
          for (let tries = 0; tries < 60; tries++) {
            const x = wv.x + (rand() - 0.5) * 50, y = wv.y + (rand() - 0.5) * 50;
            if (!okWater(x, y, 8)) continue;
            items.push({ kind: kinds[(spawned + k) % kinds.length], x, y, rot: rand() * TAU, vr: (rand() - 0.5) * 0.6, f: 0.8 + rand() * 0.5, ph: rand() * TAU, state: 'drift', t: 0 });
            break;
          }
        }
        spawned += per;
        sfx('splash', { vol: 0.5 }); if (w > 0) floatText('!', '#ffd25e', wv.x, wv.y, 30);
      }
      return {
        span: 95, hud: ['wind', 'speed', 'timer', { id: 'gear', icon: 'hand', labelKey: 'rib.hud.gear' }],
        update(dt) {
          while (w < waves.length && S.time >= waves[w].t) { spawnWave(waves[w]); w++; }
          const dw = down();
          for (const it of items) {
            if (it.state !== 'drift') { it.t += dt; continue; }
            const v = windMs() * 0.11 * it.f;
            it.x += dw.x * v * dt; it.y += dw.y * v * dt; it.rot += it.vr * dt;
            const d = dist(it, boat);
            if (d < AS.gearR) {
              if (kn() > AS.gearKn) { // bow wave pushes it away
                const nx = (it.x - boat.x) / (d || 1), ny = (it.y - boat.y) / (d || 1); it.x += nx * 3; it.y += ny * 3;
                floatText(t('rib.fx.whoosh'), '#ff9a8a', it.x, it.y); tip('gearFast', null, true); sfx('splash', { vol: 0.3 });
              } else {
                it.state = 'saved'; it.t = 0; saved++;
                floatText(t('rib.fx.' + it.kind), '#7dffb5', it.x, it.y); sfx('pop', { pitch: 1 + saved * 0.05 });
                if (fx()) { fx().stars(it.x, it.y, 8); fx().ripple(it.x, it.y, 2.5, 0.8); }
                if (KOS.Input.haptic) KOS.Input.haptic(15);
              }
            } else if (KOS.World.isSolid(venue, it.x + dw.x * 5, it.y + dw.y * 5) || KOS.World.depthAt(venue, it.x, it.y) < 0.8) {
              it.state = 'lost'; it.t = 0; lost++;
              floatText(t('rib.fx.lost'), '#ff4d5e', it.x, it.y, 22); sfx('lose', { vol: 0.3 }); tip('gearLost', null, true);
              if (fx()) fx().splash(it.x, it.y, 0.4);
            }
          }
          if (!done && w >= waves.length && saved + lost >= total) {
            done = true;
            const q = saved / total, th = assist === 'easy' ? [0.9, 0.65, 0.4] : assist === 'pro' ? [1, 0.84, 0.58] : [0.92, 0.75, 0.5];
            const stars = q >= th[0] ? 3 : q >= th[1] ? 2 : q >= th[2] ? 1 : 0;
            complete({ success: stars > 0, stars, msgKey: stars ? 'rib.res.gear' : 'rib.res.gearFail', msgVars: { n: saved, total },
              stats: { saved: saved + '/' + total, lost, wakes: S.wakes }, score: saved * 300 + Math.max(0, 600 - S.time * 3) });
          }
        },
        target() { let b = null, bd = Infinity; for (const it of items) if (it.state === 'drift') { const d = dist(it, boat); if (d < bd) { bd = d; b = it; } } return b ? { x: b.x, y: b.y, color: '#7dffb5' } : null; },
        card() { return { head: t('rib.card.gear') + ' · ' + saved + '/' + total, text: t('rib.task.gear'), bar: saved / total }; },
        hudData(d) { d.custom = { gear: saved + '<small>/' + total + '</small>' }; },
        bot() {
          const tg = this.target(); if (!tg) return drive(-300, -200, 10);
          const d = dist(boat, tg);
          return drive(tg.x, tg.y, zoneSafeKn(tg.x, tg.y, d < 25 ? AS.gearKn - 1.5 : 24), { brake: 0.5, min: 2 });
        },
        draw(ctx, sc) { drawGear(ctx, sc); },
      };
    }

    // ---------------------------------------------------------------- 7. storm call: multi-tow before the squall
    function mStorm() {
      const n = AS.nStorm;
      const spots = [[-170, -170], [-250, -215], [-130, -250], [-290, -150], [-200, -300], [-90, -200]];
      for (let k = 0; k < n; k++) makeOpti(spots[k][0], spots[k][1], rand() * TAU, k);
      const T = AS.stormT;
      let done = false, w0 = P.windKn, warned = 0;
      return {
        span: 95, hud: ['wind', 'speed', { id: 'squall', icon: 'clock', labelKey: 'rib.hud.squall' }, { id: 'home', icon: 'anchor', labelKey: 'rib.hud.home' }],
        button: { icon: 'knot', key: 'rib.btn.fix' },
        update(dt) {
          if (done) return;
          const k = U.clamp(S.time / T, 0, 1);
          wind.setBase(U.rad(P.windDeg) + k * 0.25, w0 + k * 9);
          if (k > 0.45 && warned === 0) { warned = 1; tip('storm', null, true); sfx('hornLong', { vol: 0.4 }); }
          if (k > 0.82 && warned === 1) { warned = 2; tip('stormLast', null, true); }
          if (k > 0.65 && rand() < dt * 0.06 * k) { S.flash = 1; S.thunderT = S.time + 0.6 + rand() * 1.4; }
          if (S.thunderT > 0 && S.time >= S.thunderT) { S.thunderT = -1; sfx('crash', { vol: 0.35, pitch: 0.35 }); }
          pickups();
          if (chain.length && dist(boat, HOME) < HOME.r + (assist === 'easy' ? 4 : 0)) {
            tip('homeStop');
            if (kn() < 2 && !S.foul) deliver();
          }
          const home = optis.filter(o => o.state === 'home').length;
          if (home === n) {
            done = true;
            const left = T - S.time;
            complete({ success: true, stars: 1 + (left >= T * 0.15 ? 1 : 0) + (S.mishaps + S.swamps <= AS.mishaps ? 1 : 0),
              msgKey: 'rib.res.storm', msgVars: { time: KOS.UI.fmtTime(left * 1000) }, score: Math.round(left * 10 + n * 300),
              stats: { home: n + '/' + n, left: KOS.UI.fmtTime(left * 1000), mishaps: S.mishaps, swamps: S.swamps } });
          } else if (S.time >= T) {
            done = true; S.flash = 1.4; sfx('crash', { vol: 0.6, pitch: 0.4 });
            floatText(t('rib.fx.squall'), '#ffffff', boat.x, boat.y - 4, 34); scene.shake(0.8);
            wind.setBase(U.rad(P.windDeg) + 0.4, w0 + 16);
            complete({ success: false, stars: 0, msgKey: 'rib.res.stormFail', msgVars: { n: home, total: n }, score: home * 200,
              stats: { home: home + '/' + n, mishaps: S.mishaps } });
          }
        },
        target() {
          if (S.foul) return null;
          const o = chain.length < AS.maxTow ? nearestFree() : null;
          if (o && (!chain.length || dist(o, boat) < 120)) return { x: o.x, y: o.y, color: '#ffd25e' };
          return chain.length ? { x: HOME.x, y: HOME.y, color: '#3ee08f', label: '⚓' } : null;
        },
        card() {
          if (S.foul) return { head: t('rib.card.storm'), text: t('rib.task.fix'), bar: S.fixT / AS.fixT, warn: true };
          const home = optis.filter(o => o.state === 'home').length;
          return { head: t('rib.card.storm') + ' · ' + home + '/' + n, text: t('rib.task.storm', { n: home, total: n }), bar: 1 - S.time / T, warn: S.time > T * 0.75 };
        },
        hudData(d) {
          const home = optis.filter(o => o.state === 'home').length;
          d.custom = { squall: KOS.UI.fmtTime(Math.max(0, T - S.time) * 1000).replace(/\.\d$/, ''), home: home + '<small>/' + n + '</small>' };
        },
        bot() {
          if (S.foul) return towBot(0);
          const free = optis.filter(o => o.state === 'free').length;
          const want = Math.min(AS.maxTow, chain.length + free);
          const nf = nearestFree();
          // go home when full, or when the next free dinghy is far and we already carry some
          if (chain.length >= want || (nf && chain.length && dist(nf, boat) > 140)) return towBot(chain.length);
          return towBot(chain.length + 1);
        },
        draw(ctx, sc) { drawHome(ctx, sc, chain.length > 0); },
        drawScreen(ctx, sc) { drawStorm(ctx, sc, U.clamp(S.time / T, 0, 1)); },
      };
    }

    // ==================================================================== completion
    function complete(o) {
      if (S.phase !== 'go') return;
      S.phase = 'done'; S.finishT = o.success ? 2.0 : 1.6;
      let stars = o.stars;
      if (stars == null) {
        const timeStar = o.ratio <= AS.th[1] ? 1 : 0;
        const careStar = o.care <= AS.mishaps ? 1 : 0;
        stars = o.success ? 1 + timeStar + careStar : 0;
        if (o.success && o.ratio <= AS.th[0] && careStar && !timeStar) stars = 3;
      }
      stars = U.clamp(stars, 0, 3);
      if (o.success) {
        sfx('win', { vol: 0.5 });
        if (fx()) { fx().confetti(boat.x, boat.y, 120); fx().text(boat.x, boat.y - 5, '★'.repeat(Math.max(1, stars)), { color: '#ffd25e', size: 34 }); }
        if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* optional */ } sfx('cheer', { vol: 0.5 }); }
      } else sfx('lose', { vol: 0.5 });
      ctrl.highlight('action', false);
      const stats = Object.assign({ top: +S.topKn.toFixed(1) }, o.stats || {});
      S.result = {
        stars, success: !!o.success, timeMs: Math.round(S.time * 1000),
        score: o.score != null ? Math.max(0, Math.round(o.score)) : Math.round(1000 * Math.min(3, 1 / Math.max(0.3, o.ratio || 1)) + stars * 300),
        stats: prefixStats(stats), msgKey: o.msgKey, msgVars: o.msgVars,
      };
    }

    // ==================================================================== drawing helpers (world space, meters)
    function drawWorld(ctx, sc) {
      if (isBay) drawSlowZone(ctx, sc);
      drawRopes(ctx, sc);
      drawOptiExtras(ctx, sc);
      if (M.draw) M.draw(ctx, sc);
      // wake warning: a red pulse around the RIB while speeding in the zone
      if (S.overT > 0.15) {
        const a = 0.35 + 0.3 * Math.sin(sc.t * 12);
        ctx.strokeStyle = 'rgba(255,77,94,' + a + ')'; ctx.lineWidth = Math.max(0.2, 3 * sc.mpp);
        ctx.beginPath(); ctx.arc(boat.x, boat.y, 5 + Math.sin(sc.t * 6), 0, TAU); ctx.stroke();
      }
    }
    function drawScreen(ctx, sc) {
      if (M.drawScreen) M.drawScreen(ctx, sc);
      drawTargetArrow(ctx, sc);
      if (S.flash > 0) { ctx.fillStyle = 'rgba(235,240,255,' + Math.min(0.75, S.flash * 0.6) + ')'; ctx.fillRect(0, 0, sc.w, sc.h); }
    }
    // the bay's slow zone: dashed edge on the water side only + little yellow "speed limit" sign buoys
    let zoneSegs = null;
    function drawSlowZone(ctx, sc) {
      const z = { poly: SLOW };
      if (!zoneSegs) {
        zoneSegs = []; const signs = [];
        for (let k = 0; k < z.poly.length; k++) {
          const a = z.poly[k], b = z.poly[(k + 1) % z.poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(len / 4);
          let run = null;
          for (let j = 0; j <= n; j++) {
            const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n;
            const wet = !KOS.World.isSolid(venue, x, y) && KOS.World.depthAt(venue, x, y) > 0.6;
            if (wet) { if (!run) { run = [[x, y]]; zoneSegs.push(run); } else run.push([x, y]); if (j % 15 === 7 && okWater(x, y, 6)) signs.push({ x, y }); } else run = null;
          }
        }
        zoneSegs.signs = signs;
      }
      const v = sc.view, mpp = sc.mpp;
      ctx.save(); ctx.setLineDash([6 * mpp, 5 * mpp]); ctx.lineWidth = Math.max(0.3, 2 * mpp); ctx.strokeStyle = S.inZone ? 'rgba(255,214,60,0.75)' : 'rgba(255,214,60,0.45)';
      for (const run of zoneSegs) { if (run.length < 2) continue; ctx.beginPath(); run.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
      ctx.restore();
      for (const s of zoneSegs.signs) {
        if (s.x < v.x0 - 10 || s.x > v.x1 + 10 || s.y < v.y0 - 10 || s.y > v.y1 + 10) continue;
        const k = Math.max(1, 12 * mpp / 0.9), bob = Math.sin(sc.t * 2 + s.x) * 0.05;
        ctx.save(); ctx.translate(s.x, s.y); ctx.scale(k, k);
        ctx.fillStyle = 'rgba(0,30,60,0.25)'; ctx.beginPath(); ctx.ellipse(0.15, 0.2, 0.7, 0.45, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.arc(0, bob, 0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e8323c'; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.arc(0, -0.95 + bob, 0.55, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1d2433'; ctx.font = '900 0.62px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(AS.zoneKn), 0, -0.93 + bob);
        ctx.restore();
      }
    }
    // towlines: slack ones curve on the water, taut ones go straight and turn yellow → red near the breaking load
    function drawRopes(ctx, sc) {
      const mpp = sc.mpp;
      for (let i = 0; i < chain.length; i++) {
        const o = chain[i], lead = i ? chain[i - 1] : boat;
        const A = KOS.Physics.stern(lead), B = KOS.Physics.bow(o);
        const L = o.ropeL || TOW.first, d = Math.hypot(B.x - A.x, B.y - A.y) || 1e-6;
        const slack = Math.max(0, L - d), nx = (B.x - A.x) / d, ny = (B.y - A.y) / d;
        const sag = Math.sqrt(slack * L) * 0.42 * (i % 2 ? -1 : 1);
        const q = U.clamp((o.tension || 0) / AS.snap, 0, 1);
        const jit = q > 0.6 ? Math.sin(sc.t * 70 + i) * 0.06 * q : 0;
        const mx = (A.x + B.x) / 2 - ny * (sag + jit), my = (A.y + B.y) / 2 + nx * (sag + jit);
        const col = q < 0.45 ? '#f4f1e6' : q < 0.75 ? '#ffd25e' : '#ff4d5e';
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(10,20,40,0.45)'; ctx.lineWidth = Math.max(0.14, 3.4 * mpp);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.08, 1.8 * mpp);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y); ctx.stroke();
        ctx.setLineDash([0.25, 0.35]); ctx.strokeStyle = 'rgba(30,90,200,0.55)';
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y); ctx.stroke(); ctx.setLineDash([]);
        if (slack > 0.6) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(mx, my, Math.max(0.15, 2 * mpp), 0, TAU); ctx.fill(); }
      }
      if (S.foul) { // a messy knot at the stern
        const st = KOS.Physics.stern(boat), r = Math.max(0.5, 7 * mpp);
        ctx.strokeStyle = '#f4f1e6'; ctx.lineWidth = Math.max(0.08, 1.6 * mpp);
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(st.x + Math.sin(k * 2.1) * r * 0.3, st.y + Math.cos(k * 1.7) * r * 0.3, r * 0.6, r * 0.35, k + sc.t * 0.6, 0, TAU); ctx.stroke(); }
        drawHoldRing(ctx, st.x, st.y, 3.4, S.fixT / AS.fixT, sc);
      }
    }
    function drawOptiExtras(ctx, sc) { // water sloshing in swamping optis, glow on free ones waiting for a tow
      const mpp = sc.mpp;
      for (const o of optis) {
        if (o.hidden) continue;
        if (o.water > 0.05) {
          ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.heading);
          ctx.fillStyle = 'rgba(40,140,230,' + Math.min(0.75, o.water * 0.65) + ')';
          ctx.beginPath(); ctx.ellipse(0, 0.15 + Math.sin(sc.t * 5) * 0.05, 0.45, 0.85 * Math.min(1, o.water), 0, 0, TAU); ctx.fill(); ctx.restore();
        }
        if (o.state === 'free' && (P.kind === 'tow' || P.kind === 'storm')) {
          const r = (2.6 + Math.sin(sc.t * 4 + o.ph) * 0.3) * Math.max(1, 3 * mpp);
          ctx.strokeStyle = 'rgba(255,210,94,0.6)'; ctx.lineWidth = Math.max(0.12, 2 * mpp);
          ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.stroke();
        }
      }
    }
    function drawRing(ctx, x, y, r, active, yellow, tm, mpp, label) {
      const col = yellow ? '255,210,94' : '125,220,255', pulse = active ? 1 + 0.06 * Math.sin(tm * 5) : 1;
      ctx.save(); ctx.globalAlpha = active ? 1 : 0.4;
      const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * pulse);
      g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(0.8, 'rgba(' + col + ',0.18)'); g.addColorStop(1, 'rgba(' + col + ',0.0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, TAU); ctx.fill();
      ctx.lineWidth = Math.max(0.35, 3.5 * mpp); ctx.strokeStyle = 'rgba(' + col + ',0.95)';
      ctx.setLineDash([2.2, 1.4]); ctx.lineDashOffset = -tm * 3;
      ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 0; k < 4; k++) { // little floats round the ring
        const a = k / 4 * TAU + tm * 0.3, px = x + Math.cos(a) * r * pulse, py = y + Math.sin(a) * r * pulse;
        ctx.fillStyle = k % 2 ? '#ffffff' : (yellow ? '#ffb21e' : '#ff7a3d'); ctx.beginPath(); ctx.arc(px, py, Math.max(0.35, 4 * mpp), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3 * mpp;
      ctx.font = '900 ' + (16 * mpp) + 'px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(label, x, y); ctx.fillText(label, x, y);
      ctx.restore();
    }
    function drawParkBox(ctx, tm, mpp, active) {
      ctx.save(); ctx.translate(PARK.x, PARK.y); ctx.rotate(PARK.h);
      const a = active ? 0.55 + 0.25 * Math.sin(tm * 4) : 0.3;
      ctx.fillStyle = 'rgba(62,224,143,' + (a * 0.35) + ')'; ctx.fillRect(-PARK.wid / 2, -PARK.len / 2, PARK.wid, PARK.len);
      ctx.strokeStyle = 'rgba(62,224,143,' + (a + 0.2) + ')'; ctx.lineWidth = Math.max(0.15, 2.5 * mpp); ctx.setLineDash([0.6, 0.4]);
      ctx.strokeRect(-PARK.wid / 2, -PARK.len / 2, PARK.wid, PARK.len); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,' + (a + 0.2) + ')'; ctx.font = '900 2px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('P', 0, 0);
      ctx.restore();
    }
    function drawHome(ctx, sc, active) {
      const tm = sc.t, mpp = sc.mpp, r = HOME.r + (assist === 'easy' ? 4 : 0);
      ctx.save(); ctx.globalAlpha = active ? 1 : 0.45;
      ctx.strokeStyle = 'rgba(62,224,143,0.9)'; ctx.lineWidth = Math.max(0.3, 3 * mpp); ctx.setLineDash([2, 1.5]); ctx.lineDashOffset = tm * 2;
      ctx.beginPath(); ctx.arc(HOME.x, HOME.y, r * (active ? 1 + 0.04 * Math.sin(tm * 4) : 1), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(62,224,143,0.12)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.max(3, 18 * mpp) + 'px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚓', HOME.x, HOME.y);
      ctx.restore();
    }
    function drawLeeWedge(ctx, o, sc) { // green "come in here" wedge downwind of the dinghy, red on the windward side
      if (assist === 'pro') return;
      const dwh = wind.dir + PI, R = 22, half = Math.acos(U.clamp(AS.lee, -0.9, 0.9));
      ctx.save(); ctx.translate(o.x, o.y);
      const g = ctx.createRadialGradient(0, 0, 3, 0, 0, R);
      g.addColorStop(0, 'rgba(62,224,143,0.35)'); g.addColorStop(1, 'rgba(62,224,143,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, dwh - PI / 2 - half, dwh - PI / 2 + half); ctx.closePath(); ctx.fill();
      const g2 = ctx.createRadialGradient(0, 0, 3, 0, 0, R * 0.8);
      g2.addColorStop(0, 'rgba(255,77,94,0.22)'); g2.addColorStop(1, 'rgba(255,77,94,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 0.8, wind.dir - PI / 2 - 0.9, wind.dir - PI / 2 + 0.9); ctx.closePath(); ctx.fill();
      // "LÆ" chevrons pointing the way in (towards the dinghy, up into the wind)
      const dv = down();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(0.2, 2.2 * sc.mpp); ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const s = 8 + k * 4 - ((sc.t * 4) % 4), cx = dv.x * s, cy = dv.y * s, f = U.vec(wind.dir), rr = U.vec(wind.dir + PI / 2);
        ctx.beginPath(); ctx.moveTo(cx - f.x * 0.8 + rr.x * 1.3, cy - f.y * 0.8 + rr.y * 1.3); ctx.lineTo(cx + f.x * 0.6, cy + f.y * 0.6); ctx.lineTo(cx - f.x * 0.8 - rr.x * 1.3, cy - f.y * 0.8 - rr.y * 1.3); ctx.stroke();
      }
      ctx.restore();
    }
    function drawHoldRing(ctx, x, y, r, frac, sc) {
      const lw = Math.max(0.3, 4 * sc.mpp);
      ctx.save();
      ctx.strokeStyle = 'rgba(13,19,33,0.5)'; ctx.lineWidth = lw * 1.8; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#3ee08f'; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, r, -PI / 2, -PI / 2 + TAU * U.clamp(frac, 0, 1)); ctx.stroke();
      ctx.restore();
    }
    function drawTargetCross(ctx, tg, R, active, sc, label) { // GPS target: bull's-eye rings + crosshair
      const tm = sc.t, mpp = sc.mpp;
      ctx.save(); ctx.translate(tg.x, tg.y); ctx.globalAlpha = active ? 1 : 0.45;
      const rings = [[1, 'rgba(255,122,61,0.16)'], [0.67, 'rgba(255,255,255,0.14)'], [0.34, 'rgba(255,210,94,0.32)']];
      rings.forEach(([k, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, R * k, 0, TAU); ctx.fill(); });
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.12, 1.5 * mpp);
      rings.forEach(([k]) => { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, TAU); ctx.stroke(); });
      const s = R * 1.25 * (active ? 1 + 0.05 * Math.sin(tm * 5) : 1);
      ctx.strokeStyle = active ? '#ff7a3d' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(0.2, 2.5 * mpp);
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-R * 0.15, 0); ctx.moveTo(R * 0.15, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, -R * 0.15); ctx.moveTo(0, R * 0.15); ctx.lineTo(0, s); ctx.stroke();
      if (active) { ctx.rotate(tm * 0.8); ctx.setLineDash([R * 0.25, R * 0.18]); ctx.beginPath(); ctx.arc(0, 0, R * 1.12, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.rotate(-tm * 0.8); }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3 * mpp;
      ctx.font = '900 ' + (15 * mpp) + 'px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(label, R * 0.9, -R * 0.9); ctx.fillText(label, R * 0.9, -R * 0.9);
      ctx.restore();
    }
    function drawGear(ctx, sc) {
      const mpp = sc.mpp, tm = sc.t, v = sc.view;
      for (const it of items) {
        if (it.state === 'saved' && it.t > 0.5) continue;
        if (it.state === 'lost' && it.t > 1.5) continue;
        if (it.x < v.x0 - 10 || it.x > v.x1 + 10 || it.y < v.y0 - 10 || it.y > v.y1 + 10) continue;
        const k = Math.max(1, 13 * mpp / 0.9), a = it.state === 'saved' ? it.t / 0.5 : it.state === 'lost' ? it.t / 1.5 : 0;
        ctx.save(); ctx.translate(it.x, it.y - (it.state === 'saved' ? a * 3 : 0)); ctx.globalAlpha = 1 - a;
        const s = k * (1 + 0.05 * Math.sin(tm * 2.5 + it.ph)) * (it.state === 'saved' ? 1 + a : 1);
        ctx.scale(s, s);
        if (it.state === 'drift') { const rp = (tm * 0.7 + it.ph) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + 0.45 * (1 - rp) + ')'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(0, 0, 1.2 + rp * 1.3, 0, TAU); ctx.stroke(); }
        ctx.rotate(it.rot + Math.sin(tm * 0.8 + it.ph) * 0.25);
        drawGearItem(ctx, it.kind);
        ctx.restore();
      }
    }
    function drawProblem(ctx, sc, b) { // speech bubble with "!" over a sailor who needs a shout
      const p = sc.worldToScreen(b.x, b.y), y = p.y - 46 - Math.abs(Math.sin(sc.t * 4)) * 5;
      const txt = t('rib.problem.' + b.problem.kind);
      ctx.save(); ctx.font = '800 12px ui-rounded,"Segoe UI",system-ui,sans-serif';
      const w = Math.max(70, ctx.measureText(txt).width + 40), h = 26;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.strokeStyle = 'rgba(13,19,33,0.5)'; ctx.lineWidth = 1.5;
      rr(ctx, p.x - w / 2, y - h / 2, w, h, 13); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 6, y + h / 2 - 1); ctx.lineTo(p.x, y + h / 2 + 7); ctx.lineTo(p.x + 6, y + h / 2 - 1); ctx.fill();
      ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.arc(p.x - w / 2 + 14, y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillText('!', p.x - w / 2 + 14, y + 0.5);
      ctx.fillStyle = '#1d2433'; ctx.font = '800 12px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(txt, p.x - w / 2 + 28, y + 0.5);
      // timer bar
      const f = U.clamp(b.problem.t / b.problem.max, 0, 1);
      ctx.fillStyle = f > 0.35 ? '#3ee08f' : '#ff4d5e'; ctx.fillRect(p.x - w / 2 + 10, y + h / 2 - 4, (w - 20) * f, 2.5);
      ctx.restore();
    }
    // storm: grey tint, wind-driven rain streaks, lightning flash
    function drawStorm(ctx, sc, k) {
      if (k <= 0.02) return;
      const W = sc.w, H = sc.h;
      ctx.fillStyle = 'rgba(28,36,52,' + (0.42 * k) + ')'; ctx.fillRect(0, 0, W, H);
      const rain = U.clamp((k - 0.3) / 0.7, 0, 1); if (rain <= 0) return;
      const d = down(), len = 14 + 16 * rain, n = Math.round(60 + 220 * rain);
      ctx.strokeStyle = 'rgba(220,232,255,' + (0.25 + 0.25 * rain) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const h1 = fract(Math.sin(i * 12.9898) * 43758.5453), h2 = fract(Math.sin(i * 78.233 + 1.7) * 24634.6345);
        const sp = 700 + 500 * h2;
        const x = ((h1 * W * 1.4 + d.x * sc.t * sp * 0.4) % (W * 1.2) + W * 1.2) % (W * 1.2) - W * 0.1;
        const y = ((h2 * H + sc.t * sp) % (H + 40) + H + 40) % (H + 40) - 20;
        ctx.moveTo(x, y); ctx.lineTo(x - d.x * len * 0.6, y - len);
      }
      ctx.stroke();
    }
    // screen-space: arrow at the screen edge towards the target, or a bouncing chevron over it when visible
    function drawTargetArrow(ctx, sc) {
      if (S.phase === 'intro' || S.phase === 'done') return;
      const tg = currentTarget(); if (!tg) return;
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, H = sc.h;
      const hb = hud.el.getBoundingClientRect(), land = H < 500;
      const m = { l: land ? 150 : 34, r: land ? 150 : 34, t: Math.max(60, hb.bottom + 34), b: land ? 60 : W < 700 ? 200 : 140 };
      const dd = Math.round(Math.hypot(tg.x - boat.x, tg.y - boat.y));
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < H - m.b) {
        const by = p.y - 30 - Math.abs(Math.sin(sc.t * 4)) * 8;
        ctx.fillStyle = tg.color; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 10, by - 8); ctx.lineTo(p.x + 10, by - 8); ctx.lineTo(p.x, by + 4); ctx.closePath(); ctx.stroke(); ctx.fill();
        return;
      }
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? H - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx), pulse = 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = tg.color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = tg.color;
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillText(tg.label && dd < 999 ? tg.label : dd + ' m', ax, ay);
      if (tg.label) { ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(dd + ' m', ax, ay + 32); }
    }

    // ==================================================================== mission card (DOM)
    let cardLast = '';
    function paintCard() {
      const c = M.card ? M.card() : null;
      if (!c) { if (cardLast) { card.innerHTML = ''; card.classList.add('rib-hidden'); cardLast = ''; } return; }
      let h = '<div class="rc-head">' + KOS.UI.iconSvg(ACTS.find(a => a.params.kind === P.kind).icon) + '<span>' + KOS.UI.esc(c.head) + '</span></div>' +
        '<div class="rc-text">' + KOS.UI.esc(c.text) + '</div>';
      if (c.dots) { h += '<div class="rc-dots">'; for (let k = 0; k < c.dots.n; k++) h += '<i class="' + (k < c.dots.i ? 'on' : k === c.dots.i ? 'cur' : '') + '"></i>'; h += '</div>'; }
      if (c.bar != null) h += '<i class="rc-bar' + (c.barGood != null && c.bar >= c.barGood ? ' good' : '') + '"><b style="width:' + Math.round(U.clamp(c.bar, 0, 1) * 100) + '%"></b>' +
        (c.barGood != null ? '<u style="left:' + Math.round(c.barGood * 100) + '%"></u>' : '') + '</i>';
      if (h !== cardLast) { card.innerHTML = h; cardLast = h; card.classList.remove('rib-hidden'); }
      card.classList.toggle('warn', !!c.warn);
    }
    let badgeOn = null, badgeBad = null;
    function paintBadge() {
      const on = S.inZone && S.phase !== 'intro', bad = on && kn() > AS.zoneKn + 0.3;
      if (on !== badgeOn) { badge.classList.toggle('on', on); badgeOn = on; }
      if (bad !== badgeBad) { badge.classList.toggle('bad', bad); badge.querySelector('small').textContent = bad ? t('rib.zone.slow') : t('rib.zone.max', { kn: AS.zoneKn }); badgeBad = bad; }
    }

    // ==================================================================== instance
    let coachIntro = null;
    function start() {
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      const intro = t('rib.intro.' + P.kind, { kn: P.kind === 'tow' ? AS.towKn : AS.zoneKn, n: P.kind === 'tow' ? AS.nTow : optis.length }) + (touch ? '' : '  ' + t('rib.keys'));
      coachIntro = KOS.UI.coach(intro, { ms: 9000 });
      ambient();
      try { KOS.Audio.engine(0); } catch (e) { /* optional */ }
      // short overview of the mission area, then the camera eases in on the RIB
      const pts = [boat].concat(optis, fleet, marks.filter(m => m.kind !== 'committee'));
      const tg = currentTarget(); if (tg) pts.push(tg);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
      const pad = 40;
      scene.fit({ x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }, 60);
      S.phase = 'intro'; S.introT = 0;
      paintCard();
    }
    function endIntro() {
      if (S.phase !== 'intro') return;
      S.phase = 'go'; scene.unfit(); scene.follow(boat); scene._snap = false; applyZoom();
      sfx('hornShort', { vol: 0.5 });
    }

    function update(dt) {
      env.t += dt; envFleet.t += dt;
      wind.update(dt);
      if ((S.windT += dt) > 2) { S.windT = 0; wind.recenter(boat.x, boat.y); }
      S.flash = Math.max(0, S.flash - dt * 2.5);
      if (S.phase === 'intro') {
        S.introT += dt;
        if (S.introT > 2.2) endIntro();
        for (const o of optis) if (o.state === 'free' || o.state === 'capsized') o.t = (o.t || 0) + dt;
        hudTick(dt);
        return;
      }
      S.bumpCd -= dt;
      controls = KOS.Input.toControls(ctrl.state, boat, controls, dt);
      if (autopilot && S.phase === 'go') { const c = M.bot ? M.bot() : null; if (c) Object.assign(controls, c); }
      if (S.foul) controls.throttle = 0;
      if (S.phase === 'done') controls.throttle = Math.min(controls.throttle, 0) * 0;
      KOS.Physics.step(boat, controls, env, dt);
      // the wind pushes a slow RIB sideways (strong in the rescue and mark-laying missions)
      const spd = Math.abs(boat.speed), dk = AS.drift * P.drift * windMs() * U.clamp(1 - spd / 2.5, 0, 1);
      if (dk > 0) { const dw = down(); boat.x += dw.x * dk * dt; boat.y += dw.y * dk * dt; }
      // towline + dinghies
      towStep(dt);
      for (const o of optis) {
        if (o.state === 'free' || o.state === 'tow') optiStep(o, dt);
        else if (o.state === 'home') homeAnim(o, dt);
      }
      // RIB vs dinghies on the line: keep them apart
      for (const o of optis) {
        if (o.state !== 'free' && o.state !== 'tow') continue;
        const d = dist(o, boat);
        if (d < 3.3 && d > 0.01) {
          const nx = (o.x - boat.x) / d, ny = (o.y - boat.y) / d, push = 3.3 - d;
          o.x += nx * push * 0.7; o.y += ny * push * 0.7; boat.x -= nx * push * 0.3; boat.y -= ny * push * 0.3;
          const vn = (boat.vx - o.vx) * nx + (boat.vy - o.vy) * ny;
          if (vn > 0) { o.vx += nx * vn * 0.8; o.vy += ny * vn * 0.8; }
          if (vn > 1.2 && S.phase === 'go') bump();
        }
      }
      if (P.kind !== 'coach') KOS.Physics.collide([boat], venue, marks);
      if (S.phase === 'go') {
        S.time += dt;
        const k = kn(); if (k > S.topKn) S.topKn = k;
        towChecks(dt);
        foulTick(dt);
        zoneTick(dt);
        M.update(dt);
      } else if (P.kind === 'rescue' || P.kind === 'coach') M.update(dt);
      if (M.late) M.late(dt);
      if (S.phase === 'done' && S.finishT > 0) {
        S.finishT -= dt;
        if (S.finishT <= 0) host.finish(S.result);
      }
      hudTick(dt);
    }

    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        const d = { wind: { dir: wind.dir, speed: wind.speed }, speed: kn(), timer: S.time * 1000 };
        if (M.hudData) M.hudData(d);
        hud.update(d);
        paintCard(); paintBadge();
        try { KOS.Audio.engine(S.foul === 'prop' ? 0 : boat.throttle); } catch (e) { /* optional */ }
      }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() {
      const club = Math.hypot(boat.x - 60, boat.y + 20);
      try { KOS.Audio.ambient({ wind: wind.speed, waves: U.clamp(0.25 + wind.speed / 22 + Math.abs(boat.speed) / 14, 0, 1), harbor: isBay ? U.clamp(1 - club / 350, 0, 0.8) : 0 }); } catch (e) { /* optional */ }
    }
    function render(alpha) { scene.render(alpha); }
    function destroy() {
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      host.layer.removeEventListener('wheel', onWheel);
      if (coachIntro) coachIntro.close(true);
      ctrl.detach();
      hud.destroy();
      card.remove(); badge.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function pause() { try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); try { KOS.Audio.engine(boat.throttle); } catch (e) { /* optional */ } }
    function onResize() { scene.resize(); applyZoom(); }

    // ---- test hooks
    let autopilot = false;
    function setAutopilot(on) { autopilot = !!on; if (!on) S.botAction = false; }
    function skipIntro() { if (coachIntro) { coachIntro.close(true); coachIntro = null; } endIntro(); }

    return { start, update, render, destroy, pause, resume, onResize, boat, scene, state: S, ctrl, mission: M, optis, chain, fleet, items, marks,
      setAutopilot, skipIntro, get controls() { return controls; } };
  }

  // ======================================================================== pure drawing helpers
  function fract(v) { return v - Math.floor(v); }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // drifting gear, about 2 m across in a unit space (scaled by the caller)
  function drawGearItem(ctx, kind) {
    ctx.fillStyle = 'rgba(0,30,60,0.28)'; ctx.beginPath(); ctx.ellipse(0.12, 0.16, 1.05, 0.6, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 0.07; ctx.strokeStyle = 'rgba(20,30,40,0.6)';
    if (kind === 'paddle') {
      ctx.fillStyle = '#c98a4b'; rr(ctx, -1.25, -0.09, 1.7, 0.18, 0.08); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.ellipse(0.75, 0, 0.5, 0.3, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1d2433'; rr(ctx, -1.3, -0.12, 0.3, 0.24, 0.06); ctx.fill();
    } else if (kind === 'bailer') { // the classic cut-off bottle scoop
      ctx.fillStyle = '#49c6f2'; ctx.beginPath(); ctx.moveTo(-0.7, -0.55); ctx.lineTo(0.55, -0.45); ctx.quadraticCurveTo(0.9, 0, 0.55, 0.45); ctx.lineTo(-0.7, 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a8fc0'; ctx.beginPath(); ctx.ellipse(-0.25, 0, 0.32, 0.38, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; rr(ctx, 0.5, -0.12, 0.45, 0.24, 0.1); ctx.fill(); ctx.stroke();
    } else if (kind === 'fender') {
      ctx.fillStyle = '#ffffff'; rr(ctx, -0.95, -0.38, 1.9, 0.76, 0.38); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a7fd4'; ctx.fillRect(-0.55, -0.38, 0.14, 0.76); ctx.fillRect(0.41, -0.38, 0.14, 0.76);
      ctx.strokeStyle = '#f4f1e6'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0.95, 0); ctx.quadraticCurveTo(1.3, 0.3, 1.1, 0.6); ctx.stroke();
    } else if (kind === 'vest') {
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.75, -0.7); ctx.lineTo(-0.2, -0.75); ctx.lineTo(0, -0.35); ctx.lineTo(0.2, -0.75); ctx.lineTo(0.75, -0.7); ctx.lineTo(0.8, 0.7); ctx.lineTo(-0.8, 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1d2433'; ctx.fillRect(-0.8, 0.12, 1.6, 0.14);
      ctx.fillStyle = '#e8eef5'; ctx.fillRect(-0.55, -0.35, 0.18, 0.22); ctx.fillRect(0.37, -0.35, 0.18, 0.22);
    } else if (kind === 'cap') {
      ctx.fillStyle = '#e8323c'; ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b8222b'; ctx.beginPath(); ctx.ellipse(0.75, 0, 0.42, 0.35, 0, -PI / 2, PI / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 0.1, 0, TAU); ctx.fill();
    } else if (kind === 'bottle') {
      ctx.fillStyle = '#3ee08f'; rr(ctx, -0.8, -0.3, 1.3, 0.6, 0.25); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1d2433'; rr(ctx, 0.45, -0.18, 0.4, 0.36, 0.08); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-0.65, -0.2, 0.9, 0.08);
    } else { // sponge
      ctx.fillStyle = '#ffd23a'; rr(ctx, -0.7, -0.45, 1.4, 0.9, 0.18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3aa35b'; ctx.fillRect(-0.7, 0.18, 1.4, 0.27);
      ctx.fillStyle = 'rgba(200,150,0,0.6)'; [[-0.35, -0.2], [0.1, -0.1], [0.4, -0.25], [-0.1, 0.0]].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 0.07, 0, TAU); ctx.fill(); });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
