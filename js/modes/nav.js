// KØS SEJL — js/modes/nav.js
// The 'nav' mode: navigation & buoyage (hub area 'nav', "Sejlrenden"). Venues: 'harbor' (Kalkbrænderiløbet +
// Svanemøllehavnen), 'sound' (Øresund off Stubben) and 'bay' (the swim zone at Svanemøllestranden).
// Shape follows js/modes/sail.js: 1. strings  2. activities  3. KOS.Modes.register('nav', ...).
//
// Activity params: kind: 'buoys' | 'channel' | 'swim' | 'cardinal' | 'compass' | 'night' | 'depth' | 'ferry'
//   venue, windDeg, windKn, gust, shift, seed, lives {easy, normal, pro} (0 = unlimited; errors only cost stars)
//
// Inside one run everything is built from "steps" the player clears in order:
//   gate   {a, b, wrong: [[p, q]...]}  cross the segment a→b; crossing a "wrong" segment = passed on the wrong side
//   round  {m}                          sail all the way round a mark (bearing sweep > 250°)
//   wp     {x, y, r}                    reach a point (compass legs: hidden, can be missed)
// Shoals are extra depth polygons added to a COPY of the venue, so KOS.Physics grounds the boat on them for real.
// HUD extras (DOM, all .nav-*): mini chart (canvas), compass card (svg), echo sounder (canvas), briefing / quiz cards.
// Test hooks on the instance: setAutopilot(on), skipIntro(), state, boat.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    nav: {
      hud: { gate: 'Port', mark: 'Mærke', lives: 'Liv', errors: 'Fejl', depth: 'Under kølen', rings: 'Ringe', penalty: 'Straf', leg: 'Ben', cross: 'Over', log: 'Log', dist: 'Afstand' },
      compass: { N: 'N', E: 'Ø', S: 'S', W: 'V', course: 'Kurs {c}', title: 'Kompas' },
      chart: { title: 'Søkort', you: 'Dig' },
      sounder: { title: 'Ekkolod' },
      mark: { port: 'Bagbord', stbd: 'Styrbord', safe: 'Rund mig!', N: 'N', E: 'Ø', S: 'S', W: 'V', finish: 'Mål', home: 'Havn' },
      dir: { N: 'nord', E: 'øst', S: 'syd', W: 'vest' },
      dirC: { N: 'Nord', E: 'Øst', S: 'Syd', W: 'Vest' },
      card: {
        buoysTitle: 'Rød om bagbord ind!',
        buoysBody: 'Når du sejler IND fra havet, skal de røde bøjer være på din venstre side (bagbord) og de grønne på din højre side (styrbord). Sejler du UD, er det lige omvendt.',
        red: 'Rød dåse', redSub: 'bagbord · venstre', green: 'Grøn kegle', greenSub: 'styrbord · højre',
        harbor: 'HAVN', sea: 'HAV',
        cardTitle: 'Kardinalmærker',
        cardBody: 'Et kardinalmærke fortæller, hvor det sikre vand er. Sejl forbi på den side, mærket hedder – nord om Nord-mærket. Grunden ligger på den anden side!',
        cardHint: 'Kig på topmærkerne: begge spidser op = nord, begge ned = syd, ▲▼ som et æg = øst, ▼▲ som et timeglas = vest.',
        rock: 'Grund',
        go: 'Forstået – sejl!',
      },
      quiz: {
        title: 'Lær lysene at kende', q: 'Hvilket mærke blinker sådan her i mørket?',
        right: 'Rigtigt! ⭐', wrong: 'Ikke helt – det var: {a}', next: 'Næste lys', start: 'Sejl hjem!', of: 'Lys {n} af {m}',
      },
      light: {
        stbd: 'Grøn bøje · styrbord', port: 'Rød bøje · bagbord', mole: 'Molefyret på Badestrandens mole',
        sector: 'Sektorfyr – hvidt lys midt i renden', cardE: 'Øst-kardinal',
        stbdD: 'Fl G 3s – et grønt blink hvert 3. sekund', portD: 'Fl R 3s – et rødt blink hvert 3. sekund',
        moleD: 'Fl W 3s – et hvidt blink hvert 3. sekund', sectorD: 'Iso WRG 4s – lige længe tændt og slukket. Hvid, rød eller grøn alt efter hvor du er',
        cardED: 'Q(3) 10s – tre hurtige hvide blink hvert 10. sekund',
      },
      intro: {
        buoys: 'Du kommer ind fra havet. Hold de røde bøjer om bagbord (venstre) og de grønne om styrbord (højre). Sejl gennem alle portene og ind til målet!',
        channel: 'Sejl ud af Svanemøllehavnen, op gennem sejlrenden, helt rundt om den rød-hvide ansteuringsbøje og hjem igen. Husk: på vej UD er rød på styrbord!',
        swim: 'Sejl langs Svanemøllestranden op til målet. De gule bøjer viser badezonen – der må du ikke sejle ind. Saml ringene tæt på kanten!',
        cardinal: 'Fire grunde med kardinalmærker. Sejl forbi hvert mærke på den side, det hedder – så går du fri af stenene!',
        compass: 'Ingen bøjer her – kun kompasset! Drej, til det orange mærke står øverst ved pilen, og find de skjulte waypoints.',
        compassPro: 'Bestikregning! Styr den kurs, kompasset viser, og sejl distancen på loggen. Waypointet er skjult.',
        night: 'Det er blevet mørkt! Følg lysene hjem: rød om bagbord, grøn om styrbord. Hvidt lys fra sektorfyret betyder, at du er midt i renden.',
        depth: 'Du sejler en {boat} med køl – den stikker {d} m ned. Hold øje med ekkoloddet og søkortet, og find vej mellem grundene til målbøjen.',
        depthPro: 'Pro: grundene kan ikke ses i vandet. Brug søkortet og ekkoloddet – kølen stikker {d} m ned.',
        ferry: 'Færgeruten! Kryds den vinkelret og hurtigt – over og tilbage igen. Hold dig klar af færgerne: de kan ikke vige for dig.',
      },
      keys: 'Tastatur: ←/→ styr · ↑/↓ skøde · tryk på søkortet for at gøre det stort',
      tip: {
        wrongIn: 'Forkert side! Ind fra havet: rød om bagbord (venstre), grøn om styrbord (højre).',
        wrongOut: 'Forkert side! På vej UD er det omvendt: rød på styrbord (højre), grøn på bagbord (venstre).',
        wrongCard: 'Forkert side! {dirC}-mærket skal passeres på {dir}-siden – grunden ligger på den anden side.',
        ground: 'Av! Du gik på grund. Hold dig i det mørkeblå vand mellem bøjerne – kig på søkortet!',
        groundKeel: 'Bonk! Kølen ramte bunden. Ekkoloddet viste for lidt vand under kølen.',
        lives: 'Du har {n} liv tilbage. Rolig nu – du kan godt!',
        swim: 'Badezone! Ud igen – her bader folk. Hold de gule bøjer på din venstre side.',
        ringClose: 'Jo tættere på de gule bøjer, jo flere ringe – men ikke indenfor!',
        ferryClose: 'Fem korte tut = FARE! Du er alt for tæt på færgen. Hold dig klar!',
        ferryAngle: 'Kryds vinkelret – så er du hurtigst over færgeruten og bliver nemmere set.',
        ferryWait: 'Der kommer en færge! Vent hellere uden for ruten, til den er forbi.',
        sectorR: 'Rødt lys fra sektorfyret: du er for langt mod øst. Styr mod styrbord, til lyset bliver hvidt.',
        sectorG: 'Grønt lys fra sektorfyret: du er for langt mod vest. Styr mod bagbord, til lyset bliver hvidt.',
        round: 'Sejl helt rundt om ansteuringsbøjen – og så hjem igen gennem renden. Nu er rød om bagbord!',
        miss: 'Du ramte ikke helt waypointet. Næste kurs er sat – prøv at holde kompasset mere stille.',
        shallow: 'Pas på – lavt vand! Ekkoloddet bipper hurtigere, jo mindre vand der er under kølen.',
        light2: 'Lyst vand er ikke altid farligt – læs tallet på søkortet. Over {d} m kan du godt sejle.',
        last: 'Sidste port – nu ind i havnen mellem det grønne og det røde lys!',
        legDone: 'Waypoint fundet! Nyt ben – drej til den nye kurs.',
        halfway: 'Halvvejs! Vend om og kryds tilbage – stadig vinkelret.',
      },
      fx: { gate: 'Port {n}!', ok: 'Rigtig side!', wrong: 'Forkert side!', ground: 'På grund!', ring: '+1 ring', swim: '+10 sek', round: 'Rundet!',
        wp: 'Waypoint!', perfect: 'Perfekt!', miss: '{n} m forbi', cross: 'Over!', toot: 'TUUT TUUT!', sector: 'Hvidt lys!', home: 'Hjemme!' },
      res: {
        buoys: 'Ind gennem sejlrenden på {time} med {err} fejl.',
        channel: 'Ud og hjem gennem sejlrenden på {time} – {err} fejl.',
        swim: 'Langs stranden på {time}. {rings} ringe og {err} gange i badezonen.',
        cardinal: 'Alle fire grunde passeret på {time} – {err} fejl.',
        compass: 'Alle waypoints fundet på {time}. Kursen holdt du inden for {acc}° i gennemsnit.',
        night: 'Hjemme i havn på {time}! Du kendte {quiz} lys.',
        depth: 'Målbøjen nået på {time} med {err} grundstødninger.',
        ferry: 'Over færgeruten og tilbage på {time}. Gennemsnitlig vinkel: {angle}° fra vinkelret.',
        fail: 'Ups – du løb tør for liv. Prøv igen – du kan godt!',
        ferryHit: 'Bang! Du kom i vejen for færgen. Kryds bag om den næste gang – eller vent.',
      },
      stat: { errors: 'Fejl', gates: 'Porte', rings: 'Ringe', quiz: 'Lys gættet', acc: 'Kursafvigelse (°)', miss: 'Gns. afstand til waypoint (m)',
        ground: 'Grundstødninger', angle: 'Krydsningsvinkel (°)', laneTime: 'Tid i færgeruten', swims: 'Badezone-straf' },
    },
  });
  KOS.I18n.add('en', {
    nav: {
      hud: { gate: 'Gate', mark: 'Mark', lives: 'Lives', errors: 'Errors', depth: 'Under keel', rings: 'Rings', penalty: 'Penalty', leg: 'Leg', cross: 'Across', log: 'Log', dist: 'Distance' },
      compass: { N: 'N', E: 'E', S: 'S', W: 'W', course: 'Course {c}', title: 'Compass' },
      chart: { title: 'Chart', you: 'You' },
      sounder: { title: 'Depth sounder' },
      mark: { port: 'Port', stbd: 'Starboard', safe: 'Round me!', N: 'N', E: 'E', S: 'S', W: 'W', finish: 'Finish', home: 'Harbour' },
      dir: { N: 'north', E: 'east', S: 'south', W: 'west' },
      dirC: { N: 'North', E: 'East', S: 'South', W: 'West' },
      card: {
        buoysTitle: 'Red to port coming in!',
        buoysBody: 'When you sail IN from the sea, keep the red buoys on your left (port) and the green ones on your right (starboard). Sailing OUT it is the other way round.',
        red: 'Red can', redSub: 'port · left', green: 'Green cone', greenSub: 'starboard · right',
        harbor: 'HARBOUR', sea: 'SEA',
        cardTitle: 'Cardinal marks',
        cardBody: 'A cardinal mark tells you where the safe water is. Pass it on the side it is named after – north of the North mark. The danger is on the other side!',
        cardHint: 'Look at the top marks: both points up = north, both down = south, ▲▼ like an egg = east, ▼▲ like an hourglass = west.',
        rock: 'Rocks',
        go: 'Got it – sail!',
      },
      quiz: {
        title: 'Learn the lights', q: 'Which mark flashes like this in the dark?',
        right: 'Correct! ⭐', wrong: 'Not quite – it was: {a}', next: 'Next light', start: 'Sail home!', of: 'Light {n} of {m}',
      },
      light: {
        stbd: 'Green buoy · starboard', port: 'Red buoy · port', mole: 'The light on the beach mole',
        sector: 'Sector light – white in the middle of the channel', cardE: 'East cardinal',
        stbdD: 'Fl G 3s – one green flash every 3 seconds', portD: 'Fl R 3s – one red flash every 3 seconds',
        moleD: 'Fl W 3s – one white flash every 3 seconds', sectorD: 'Iso WRG 4s – equal on and off. White, red or green depending on where you are',
        cardED: 'Q(3) 10s – three quick white flashes every 10 seconds',
      },
      intro: {
        buoys: 'You are coming in from the sea. Keep the red buoys to port (left) and the green ones to starboard (right). Sail through every gate to the finish!',
        channel: 'Sail out of Svanemøllehavnen, up the channel, all the way round the red-and-white safe-water buoy and home again. Remember: going OUT, red is on starboard!',
        swim: 'Sail along Svanemøllestranden to the finish. The yellow buoys mark the swim zone – no sailing inside. Collect the rings close to the edge!',
        cardinal: 'Four shoals with cardinal marks. Pass each mark on the side it is named after – then you stay clear of the rocks!',
        compass: 'No buoys here – just the compass! Turn until the orange marker sits at the top by the arrow and find the hidden waypoints.',
        compassPro: 'Dead reckoning! Steer the course on the compass and sail the distance on the log. The waypoint is hidden.',
        night: 'It is dark now! Follow the lights home: red to port, green to starboard. White light from the sector light means you are in the middle of the channel.',
        depth: 'You are sailing a {boat} with a keel – it reaches {d} m down. Watch the depth sounder and the chart and find a way between the shoals to the finish buoy.',
        depthPro: 'Pro: the shoals are invisible in the water. Use the chart and the depth sounder – the keel reaches {d} m down.',
        ferry: 'The ferry route! Cross it at right angles and quickly – over and back again. Keep clear of the ferries: they cannot turn away for you.',
      },
      keys: 'Keyboard: ←/→ steer · ↑/↓ sheet · tap the chart to make it big',
      tip: {
        wrongIn: 'Wrong side! Coming in from sea: red to port (left), green to starboard (right).',
        wrongOut: 'Wrong side! Going OUT it is the other way round: red on starboard (right), green on port (left).',
        wrongCard: 'Wrong side! Pass the {dirC} mark on its {dir} side – the danger is on the other side.',
        ground: 'Ouch! You ran aground. Stay in the dark blue water between the buoys – check the chart!',
        groundKeel: 'Bonk! The keel hit the bottom. The depth sounder showed too little water under the keel.',
        lives: 'You have {n} lives left. Steady now – you can do it!',
        swim: 'Swim zone! Get out – people are swimming here. Keep the yellow buoys on your left.',
        ringClose: 'The closer to the yellow buoys, the more rings – but never inside!',
        ferryClose: 'Five short blasts = DANGER! You are far too close to the ferry. Keep clear!',
        ferryAngle: 'Cross at right angles – the quickest way over the ferry route, and easier to be seen.',
        ferryWait: 'A ferry is coming! Better wait outside the route until it has passed.',
        sectorR: 'Red light from the sector light: you are too far east. Steer to starboard until the light turns white.',
        sectorG: 'Green light from the sector light: you are too far west. Steer to port until the light turns white.',
        round: 'Sail all the way round the safe-water buoy – then home through the channel. Now red is to port!',
        miss: 'You missed the waypoint a little. The next course is set – try to keep the compass steadier.',
        shallow: 'Careful – shallow water! The depth sounder beeps faster the less water is under the keel.',
        light2: 'Light-coloured water is not always dangerous – read the number on the chart. Over {d} m is fine.',
        last: 'Last gate – now into the harbour between the green and the red light!',
        legDone: 'Waypoint found! New leg – turn to the new course.',
        halfway: 'Halfway! Turn round and cross back – at right angles again.',
      },
      fx: { gate: 'Gate {n}!', ok: 'Right side!', wrong: 'Wrong side!', ground: 'Aground!', ring: '+1 ring', swim: '+10 s', round: 'Rounded!',
        wp: 'Waypoint!', perfect: 'Perfect!', miss: '{n} m off', cross: 'Across!', toot: 'TOOT TOOT!', sector: 'White light!', home: 'Home!' },
      res: {
        buoys: 'In through the channel in {time} with {err} errors.',
        channel: 'Out and home through the channel in {time} – {err} errors.',
        swim: 'Along the beach in {time}. {rings} rings and {err} times in the swim zone.',
        cardinal: 'All four shoals passed in {time} – {err} errors.',
        compass: 'All waypoints found in {time}. You kept your course within {acc}° on average.',
        night: 'Home in the harbour in {time}! You knew {quiz} lights.',
        depth: 'Finish buoy reached in {time} with {err} groundings.',
        ferry: 'Across the ferry route and back in {time}. Average angle: {angle}° off square.',
        fail: 'Oops – you ran out of lives. Try again – you can do it!',
        ferryHit: 'Bang! You got in the way of the ferry. Cross behind it next time – or wait.',
      },
      stat: { errors: 'Errors', gates: 'Gates', rings: 'Rings', quiz: 'Lights known', acc: 'Course error (°)', miss: 'Avg. distance to waypoint (m)',
        ground: 'Groundings', angle: 'Crossing angle (°)', laneTime: 'Time in the ferry route', swims: 'Swim-zone penalties' },
    },
  });

  // ======================================================================== 2. activities
  const ACTS = [
    { id: 'nav.buoys', order: 10, icon: 'buoy', minutes: 3, difficulty: 1, unlock: null,
      title: { da: 'Rød om bagbord ind', en: 'Red to port coming in' },
      desc: { da: 'Lær de røde og grønne bøjer at kende, og sejl ind gennem sejlrenden fra havet.', en: 'Learn the red and green buoys and sail in through the channel from the sea.' },
      params: { kind: 'buoys', venue: 'harbor', windDeg: 290, windKn: 8, gust: 0.2, shift: 0.1, seed: 101, lives: { easy: 0, normal: 0, pro: 3 } } },
    { id: 'nav.channel', order: 20, icon: 'flag', minutes: 5, difficulty: 2, unlock: { after: 'nav.buoys' },
      title: { da: 'Ud og hjem gennem sejlrenden', en: 'Out and back through the channel' },
      desc: { da: 'Fra Svanemøllehavnen ud gennem Kalkbrænderiløbet, rundt om ansteuringsbøjen og hjem. Forkert side eller grundstødning koster liv!', en: 'From Svanemøllehavnen out through Kalkbrænderiløbet, round the safe-water buoy and home. Wrong side or running aground costs a life!' },
      params: { kind: 'channel', venue: 'harbor', windDeg: 145, windKn: 10, gust: 0.25, shift: 0.1, seed: 202 } },
    { id: 'nav.swim', order: 30, icon: 'life', minutes: 4, difficulty: 2, unlock: { after: 'nav.channel' },
      title: { da: 'Badezonen ved stranden', en: 'The swim zone' },
      desc: { da: 'Gule bøjer = badezone. Sejl langs Svanemøllestranden og saml ringe – uden at komme ind til de badende.', en: 'Yellow buoys = swim zone. Sail along Svanemøllestranden collecting rings – without getting in among the swimmers.' },
      params: { kind: 'swim', venue: 'bay', windDeg: 90, windKn: 8, gust: 0.3, shift: 0.15, seed: 303 } },
    { id: 'nav.cardinal', order: 40, icon: 'compass', minutes: 4, difficulty: 3, unlock: { after: 'nav.swim' },
      title: { da: 'Kardinalmærker ved Stubben', en: 'Cardinal marks off Stubben' },
      desc: { da: 'Nord, øst, syd og vest: læs topmærkerne og sejl forbi grundene på den rigtige side.', en: 'North, east, south and west: read the top marks and pass the shoals on the right side.' },
      params: { kind: 'cardinal', venue: 'sound', windDeg: 280, windKn: 9, gust: 0.35, shift: 0.2, seed: 404 } },
    { id: 'nav.compass', order: 50, icon: 'compass', minutes: 4, difficulty: 3, unlock: { after: 'nav.cardinal' },
      title: { da: 'Kompaskurs', en: 'Compass course' },
      desc: { da: 'Ingen bøjer – kun kompasset. Styr de rigtige kurser og find de skjulte waypoints ude på Øresund.', en: 'No buoys – only the compass. Steer the right courses and find the hidden waypoints out on the Øresund.' },
      params: { kind: 'compass', venue: 'sound', windDeg: 240, windKn: 9, gust: 0.3, shift: 0.15, seed: 505, lives: { easy: 0, normal: 0, pro: 0 } } },
    { id: 'nav.night', order: 60, icon: 'eye', minutes: 5, difficulty: 4, unlock: { after: 'nav.compass' },
      title: { da: 'Natsejlads hjem', en: 'Night sail home' },
      desc: { da: 'Lær lysene at kende – Fl G, Fl R, Fl W og sektorfyret Iso WRG – og find hjem i mørket.', en: 'Learn the lights – Fl G, Fl R, Fl W and the Iso WRG sector light – and find your way home in the dark.' },
      params: { kind: 'night', venue: 'harbor', windDeg: 110, windKn: 9, gust: 0.2, shift: 0.1, seed: 606 } },
    { id: 'nav.depth', order: 70, icon: 'gauge', minutes: 5, difficulty: 4, unlock: { after: 'nav.night' }, boat: 'hboat',
      title: { da: 'Ekkolod og søkort · H-båd', en: 'Depth sounder and chart · H-boat' },
      desc: { da: 'Prøv klubbens kølbåd! Find vej mellem grundene med ekkoloddet og søkortet – uden at gå på grund.', en: 'Try the club keelboat! Find your way between the shoals with the depth sounder and the chart – without running aground.' },
      params: { kind: 'depth', venue: 'sound', windDeg: 230, windKn: 10, gust: 0.3, shift: 0.15, seed: 707 } },
    { id: 'nav.ferry', order: 80, icon: 'whistle', minutes: 4, difficulty: 5, unlock: { after: 'nav.depth' },
      title: { da: 'Kryds færgeruten', en: 'Cross the ferry route' },
      desc: { da: 'Store skibe kan ikke vige. Kryds færgeruten vinkelret – over og tilbage – og hold dig klar af færgerne.', en: 'Big ships cannot turn away. Cross the ferry route at right angles – over and back – and keep clear of the ferries.' },
      params: { kind: 'ferry', venue: 'sound', windDeg: 258, windKn: 9, gust: 0.3, shift: 0.15, seed: 808 } },
  ];
  KOS.Activities.add(ACTS.map(a => Object.assign({ mode: 'nav', area: 'nav', boat: null }, a)));

  // ======================================================================== helpers (pure)
  const P2 = (x, y) => ({ x, y });
  const add = (a, b, k) => ({ x: a.x + b.x * (k == null ? 1 : k), y: a.y + b.y * (k == null ? 1 : k) });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const deg3 = r => { let d = Math.round(((r / D2R) % 360 + 360) % 360) % 360; return String(d).padStart(3, '0') + '°'; };
  const DIRV = { N: P2(0, -1), E: P2(1, 0), S: P2(0, 1), W: P2(-1, 0) };
  function blobPoly(cx, cy, r, rnd, n, amp) {
    n = n || 14; amp = amp == null ? 0.25 : amp;
    const pts = [], ph = rnd() * TAU, k = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, rr = r * (1 + amp * (0.6 * Math.sin(a * k + ph) + 0.4 * (rnd() - 0.5)));
      pts.push([+(cx + Math.cos(a) * rr).toFixed(1), +(cy + Math.sin(a) * rr).toFixed(1)]);
    }
    return pts;
  }
  function ellPoly(cx, cy, rx, ry, rot, n) {
    n = n || 16; const pts = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * c - y * s, cy + x * s + y * c]); }
    return pts;
  }
  function pointInPoly(x, y, poly) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }
  function polyDist(x, y, pts) { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, U.segDistance(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)); return d; }
  const fmtDec = (v, n) => { const s = v.toFixed(n == null ? 1 : n); return KOS.I18n.lang === 'en' ? s : s.replace('.', ','); };

  // Kalkbrænderiløbet axis (from KOS.World.chanX): s = metres along the channel outwards from y = 60, off = metres to the east side
  const AXIS = (function () {
    const cx = KOS.World && KOS.World.chanX ? KOS.World.chanX : (y => 610 - 0.36 * y);
    const c0 = P2(cx(60), 60), u = unit(0.36, -1), n = P2(-u.y, u.x);
    return { c0, u, n, hOut: U.heading(u.x, u.y), at: (s, off) => P2(c0.x + u.x * s + n.x * (off || 0), c0.y + u.y * s + n.y * (off || 0)) };
  })();

  // ======================================================================== small SVGs for the cards
  function svgCan(col, top) {
    return '<svg viewBox="0 0 60 92" class="nav-bsvg"><ellipse cx="30" cy="84" rx="25" ry="5" fill="rgba(0,40,90,.35)"/>' +
      '<path d="M12 44h36v36q-18 7-36 0z" fill="' + col + '"/><path d="M12 44h8v38q-5-1-8-2z" fill="rgba(255,255,255,.22)"/>' +
      '<ellipse cx="30" cy="44" rx="18" ry="4.5" fill="' + top + '"/><path d="M30 44V26" stroke="#3a3f48" stroke-width="2.6"/>' +
      '<rect x="22" y="10" width="16" height="16" rx="2" fill="' + col + '"/></svg>';
  }
  function svgCone(col) {
    return '<svg viewBox="0 0 60 92" class="nav-bsvg"><ellipse cx="30" cy="84" rx="25" ry="5" fill="rgba(0,40,90,.35)"/>' +
      '<path d="M11 80L24 40Q30 34 36 40L49 80Q30 87 11 80Z" fill="' + col + '"/><path d="M11 80L24 40Q26 38 28 37L20 83Q15 82 11 80Z" fill="rgba(255,255,255,.22)"/>' +
      '<path d="M30 37V26" stroke="#3a3f48" stroke-width="2.6"/><path d="M21 26H39L30 9Z" fill="' + col + '"/></svg>';
  }
  function svgCard(k) {
    const Y = '#ffd21f', B = '#1e2128';
    const bands = { N: [B, Y], S: [Y, B], E: [B, Y, B], W: [Y, B, Y] }[k];
    const h = 44 / bands.length;
    let body = '';
    bands.forEach((c, i) => { body += '<rect x="' + (17 + i * 0) + '" y="' + (38 + i * h) + '" width="26" height="' + (h + 0.5) + '" fill="' + c + '"/>'; });
    const up = y => '<path d="M22 ' + y + 'H38L30 ' + (y - 13) + 'Z" fill="' + B + '"/>';
    const dn = y => '<path d="M22 ' + (y - 13) + 'H38L30 ' + y + 'Z" fill="' + B + '"/>';
    const tops = { N: up(18) + up(34), S: dn(18) + dn(34), E: up(18) + dn(34), W: dn(18) + up(34) }[k];
    return '<svg viewBox="0 0 60 92" class="nav-bsvg"><ellipse cx="30" cy="84" rx="22" ry="5" fill="rgba(0,40,90,.35)"/>' + body +
      '<path d="M17 38h26v44q-13 4-26 0z" fill="none" stroke="rgba(0,0,0,.25)"/><path d="M30 38V34" stroke="#3a3f48" stroke-width="2.4"/>' + tops + '</svg>';
  }
  function svgLight(kind) {
    if (kind === 'stbd') return svgCone('#18a957');
    if (kind === 'port') return svgCan('#e8323c', '#ff6a72');
    if (kind === 'cardE') return svgCard('E');
    if (kind === 'mole') return '<svg viewBox="0 0 60 92" class="nav-bsvg"><path d="M2 84h56v8H2z" fill="#7d7f86"/><path d="M22 84l3-50h10l3 50z" fill="#fff"/><path d="M23.5 62h13l.8 10h-14.6z" fill="#e8323c"/><rect x="21" y="24" width="18" height="10" rx="2" fill="#2b3442"/><path d="M19 24l11-9 11 9z" fill="#e8323c"/></svg>';
    return '<svg viewBox="0 0 60 92" class="nav-bsvg"><path d="M30 50L4 20A36 36 0 0 1 22 10Z" fill="#33ff7a" opacity=".75"/><path d="M30 50L22 10A36 36 0 0 1 38 10Z" fill="#fffbe0"/><path d="M30 50L38 10A36 36 0 0 1 56 20Z" fill="#ff3b3b" opacity=".8"/><path d="M26 86l2-36h4l2 36z" fill="#d9dde3"/></svg>';
  }

  // ======================================================================== 3. the mode
  KOS.Modes.register('nav', { kind: 'sea', create(host, activity) { return createNav(host, activity); } });

  function createNav(host, activity) {
    const P = Object.assign({ kind: 'buoys', venue: 'harbor', windDeg: 270, windKn: 9, gust: 0.25, shift: 0.15, seed: 1 }, activity.params || {});
    const kind = P.kind;
    const assist = host.assist || 'easy';
    const easy = assist === 'easy', pro = assist === 'pro';
    let clsId = KOS.Boats.get(host.boat) ? host.boat : 'opti';
    if (KOS.Boats.get(clsId).motor) clsId = kind === 'depth' ? 'hboat' : 'opti'; // the RIB has no sails: nav is a sailing lesson
    const cls = KOS.Boats.get(clsId);
    const draft = cls.draft || 0.8;
    const profile = host.profile || {};
    const rand = U.rng((P.seed || 1) * 977 + 7);
    const base = KOS.World.get(P.venue) || KOS.World.get('harbor');
    const windDir = U.rad(P.windDeg);
    const LIVES = P.lives || { easy: 0, normal: 3, pro: 1 };

    const S = {
      phase: 'intro', time: 0, penalty: 0, errors: 0, lastErr: -99, lives: LIVES[assist] || 0, livesLeft: 0,
      steps: [], stepI: 0, marks: [], shoals: [], route: [], lights: [], rings: [], swimmers: [], ferries: [], pops: [],
      soundings: [], rocks: [], guide: [], guideI: 0, trail: [], depthHist: [],
      tips: {}, tipT: -99, hudT: 0, ambT: 0, chartT: 0, trailT: 0, finishT: -1, result: null,
      gatesOk: 0, ringsGot: 0, swims: 0, inSwim: false, grounds: 0, quizOk: 0, quizN: 0,
      accSum: 0, accN: 0, accT: 0, misses: [], laneErr: 0, laneN: 0, laneT: 0, inLane: false, angleBadT: 0,
      hornQ: [], beepT: 0, sectorCol: 'W', sectorT: 0, ref: 60, shallowT: 0,
    };
    S.livesLeft = S.lives;

    // ---------------------------------------------------------------- content
    let spawn = { x: base.spawn.x, y: base.spawn.y, heading: base.spawn.heading };
    const BUILD = { buoys: buildBuoys, channel: buildChannel, swim: buildSwim, cardinal: buildCardinal, compass: buildCompass, night: buildNight, depth: buildDepth, ferry: buildFerry };
    (BUILD[kind] || buildBuoys)();

    // venue copy: our shoals are real depth for the physics; lateral marks of the real channel are hidden (we lay our own)
    const extraDepth = S.shoals.map((s, i) => ({ id: 'nav' + i, d: s.d, poly: s.poly }));
    const venue = Object.assign({}, base, {
      buoys: base.buoys.filter(b => !(P.venue === 'harbor' && (b.kind === 'port' || b.kind === 'stbd'))),
      depth: base.depth.concat(extraDepth),
    });
    const sceneVenue = kind === 'depth' && pro ? Object.assign({}, venue, { depth: base.depth }) : venue;
    S.chart = chartBounds();

    // ---- wind, boat
    const wind = KOS.Wind.create({ dir: windDir, speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: spawn.x - 300, y0: spawn.y - 300, x1: spawn.x + 300, y1: spawn.y + 300 } });
    for (let i = 0; i < 200; i++) wind.update(0.5);
    const env = { wind, venue, assist, t: 0 };
    const boat = KOS.Physics.createBoat(clsId, {
      x: spawn.x, y: spawn.y, heading: spawn.heading, speed: U.ms(cls.polar(Math.PI / 2, P.windKn)) * 0.5, isPlayer: true,
      sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : 'DEN 1', name: profile.name || '',
      colors: profile.boatColor && !cls.keel ? { hull: profile.boatColor } : undefined,
    });
    let controls = KOS.Physics.controls();
    controls.autoTrim = !pro;
    controls.autoHike = easy;
    S.ref = refTime();

    // ---- scene
    const lines = [];
    S.steps.forEach(st => { if (st.type === 'finish') lines.push({ a: st.a, b: st.b, kind: 'finish' }); });
    if (easy && kind !== 'compass') { S.pathLine = { a: P2(0, 0), b: P2(0, 0), kind: 'path' }; lines.push(S.pathLine); }
    const scene = new KOS.SailScene(host.canvas, {
      venue: sceneVenue, wind, boats: [boat], follow: boat, marks: S.marks, lines,
      showWindArrow: kind !== 'night', showNoGo: false, showLanes: kind === 'ferry', night: 0,
    });
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawScreen, { screen: true });
    function applyZoom() {
      const L = cls.length, small = Math.min(scene.w, scene.h) < 600;
      const k = kind === 'ferry' ? 2.4 : kind === 'night' ? 1.35 : kind === 'depth' ? 1.0 : 1.15;
      const span = (40 + 5 * L) * k * (small ? 0.85 : 1);
      scene.setZoom(1);
      scene.setZoom(Math.sqrt(scene.w * scene.h) / span / scene.baseZoom() * userZoom);
    }
    let userZoom = 1;
    applyZoom();
    scene.fixedZoom = scene.baseZoom() * 0.35;
    const onWheel = e => { if (e.target.closest && e.target.closest('.kc,.nav-card')) return; e.preventDefault(); userZoom = U.clamp(userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.5); applyZoom(); };
    host.layer.addEventListener('wheel', onWheel, { passive: false });

    // ---- controls + HUD
    const ctrl = KOS.Input.attach(host.layer, {
      layout: 'sail', spinnaker: cls.hasSpinnaker !== 'none', spinnakerKind: cls.hasSpinnaker === 'asym' ? 'gennaker' : 'spi',
      hike: !cls.keel && !easy, autoTrim: controls.autoTrim, pauseButton: false,
    });
    ctrl.on('action', () => { if (card && card.primary) card.primary.click(); });
    const hudItems = ['speed', 'timer'];
    if (kind === 'swim') hudItems.push({ id: 'rings', icon: 'star', labelKey: 'nav.hud.rings' }, { id: 'pen', icon: 'whistle', labelKey: 'nav.hud.penalty' });
    else if (kind === 'compass') hudItems.push({ id: 'step', icon: 'compass', labelKey: 'nav.hud.leg' }, { id: 'log', icon: 'gauge', labelKey: pro ? 'nav.hud.log' : 'nav.hud.dist' });
    else if (kind === 'depth') hudItems.push({ id: 'depth', icon: 'anchor', labelKey: 'nav.hud.depth' }, livesItem());
    else if (kind === 'ferry') hudItems.push({ id: 'step', icon: 'flag', labelKey: 'nav.hud.cross' }, livesItem());
    else hudItems.push({ id: 'step', icon: kind === 'cardinal' ? 'compass' : 'buoy', labelKey: kind === 'cardinal' ? 'nav.hud.mark' : 'nav.hud.gate' }, livesItem());
    function livesItem() { return { id: 'lives', icon: 'heart', labelKey: S.lives ? 'nav.hud.lives' : 'nav.hud.errors' }; }
    const hud = KOS.UI.hud(host.layer, hudItems);

    const panels = buildPanels();
    const flashEl = document.createElement('div'); flashEl.className = 'nav-flash'; host.layer.appendChild(flashEl);
    let card = null;

    // ---- physics events
    const handlers = {
      'boat:tack': e => { if (e.boat === boat) sfx('tack'); },
      'boat:gybe': e => { if (e.boat === boat) { sfx('gybe'); scene.shake(0.2); } },
      'boat:ground': e => {
        if (e.boat !== boat || S.phase !== 'go') return;
        if (e.type === 'shallow' || e.type === 'shore' || e.type === 'land' || e.type === 'breakwater') {
          S.grounds++;
          error('ground', cls.keel ? 'groundKeel' : 'ground');
        }
      },
      'boat:collide': e => { if ((e.a === boat || e.b === boat) && e.type === 'mark') sfx('bump', { vol: 0.6 }); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);
    const onKey = e => {
      if (!card || !card.opts) return;
      const n = +e.key; if (n >= 1 && n <= card.opts.length) { e.preventDefault(); card.opts[n - 1].click(); }
    };
    window.addEventListener('keydown', onKey);

    // ==================================================================== builders
    function addMark(x, y, k, o) { const m = Object.assign({ x, y, kind: k, r: 1 }, o || {}); S.marks.push(m); return m; }
    function sideLabel(k) { return easy ? t(k === 'port' ? 'nav.mark.port' : 'nav.mark.stbd') : null; }
    // pair gate between a red (port-hand) and a green (starboard-hand) buoy
    function pairGate(red, green, o) {
      o = o || {};
      const u = unit(green.x - red.x, green.y - red.y), ext = o.ext || 80;
      const st = { type: 'gate', a: red, b: green, wrong: [[red, add(red, u, -ext)], [green, add(green, u, ext)]], wrongTip: o.tip || 'wrongIn', n: o.n };
      if (!o.noMarks) {
        st.marks = [addMark(red.x, red.y, 'port', { light: o.lightR || 'Fl R 3s', label: o.labels === false ? null : sideLabel(o.out ? 'stbd' : 'port') }),
          addMark(green.x, green.y, 'stbd', { light: o.lightG || 'Fl G 3s', label: o.labels === false ? null : sideLabel(o.out ? 'port' : 'stbd') })];
      }
      S.steps.push(st); return st;
    }
    // one buoy: pass on the `ok` side (unit vector from the buoy to the safe water)
    function singleGate(pos, k, ok, W, o) {
      o = o || {};
      const st = { type: 'gate', a: pos, b: add(pos, ok, W), wrong: [[pos, add(pos, ok, -(o.ext || 90))]], wrongTip: o.tip || 'wrongIn', n: o.n,
        aim: add(pos, ok, Math.min(W * 0.5, o.aimD || 26)), card: o.card };
      st.marks = [addMark(pos.x, pos.y, k, { light: o.light, label: o.label })];
      S.steps.push(st); return st;
    }
    function channelShoals(s0, s1, hw) {
      for (const sg of [-1, 1]) {
        const inner = [], outer = [];
        for (let s = s0; s <= s1 + 0.1; s += 15) {
          const w = hw + 13 + 4 * Math.sin(s * 0.09 + sg * 2) + 2 * Math.sin(s * 0.27);
          inner.push(AXIS.at(s, sg * w)); outer.push(AXIS.at(s, sg * (hw + 120)));
        }
        S.shoals.push({ poly: inner.concat(outer.reverse()).map(p => [+p.x.toFixed(1), +p.y.toFixed(1)]), d: 0.5, rocks: 26 });
      }
    }
    function addRoute(pts) { S.route = pts.map(p => P2(p.x, p.y)); }

    function buildBuoys() {
      const hw = 28;
      spawn = Object.assign(AXIS.at(430, 0), { heading: U.wrapPi(AXIS.hOut + Math.PI) });
      let n = 1;
      pairGate(AXIS.at(370, hw), AXIS.at(370, -hw), { n: n++ });
      singleGate(AXIS.at(300, -hw), 'stbd', AXIS.n, hw * 2, { n: n++, light: 'Fl G 3s', label: sideLabel('stbd') });
      singleGate(AXIS.at(230, hw), 'port', P2(-AXIS.n.x, -AXIS.n.y), hw * 2, { n: n++, light: 'Fl R 3s', label: sideLabel('port') });
      pairGate(AXIS.at(160, hw), AXIS.at(160, -hw), { n: n++ });
      const fa = AXIS.at(100, hw), fb = AXIS.at(100, -hw);
      addMark(fa.x, fa.y, 'finish'); addMark(fb.x, fb.y, 'finish');
      S.steps.push({ type: 'finish', a: fa, b: fb, n: n });
      channelShoals(125, 470, hw);
      addRoute([spawn].concat(S.steps.map(aimOf)));
    }
    function buildChannel() {
      const hw = 30;
      spawn = { x: 440, y: 115, heading: 90 * D2R };
      const mG = P2(521, 84), mR = P2(526, 132);
      const gm1 = { type: 'gate', a: mG, b: mR, wrong: [], n: 1, silent: false };
      addMark(mG.x, mG.y, 'stbd', { light: 'Fl G 3s', scale: 1.3 }); addMark(mR.x, mR.y, 'port', { light: 'Fl R 3s', scale: 1.3 });
      S.steps.push(gm1);
      const g1 = pairGate(AXIS.at(64, hw), AXIS.at(64, -hw), { n: 2, out: true, tip: 'wrongOut' });
      const g2 = pairGate(AXIS.at(170, hw), AXIS.at(170, -hw), { n: 3, out: true, tip: 'wrongOut' });
      const sp = AXIS.at(262, 0);
      const safe = addMark(sp.x, sp.y, 'safe', { light: 'LFl 10s', label: easy ? t('nav.mark.safe') : null, scale: 1.5 });
      S.steps.push({ type: 'round', m: safe, sweep: 0 });
      // home again: same gates, now "red to port"
      S.steps.push({ type: 'gate', a: g2.a, b: g2.b, wrong: g2.wrong, wrongTip: 'wrongIn', n: 4, marks: g2.marks, back: true });
      S.steps.push({ type: 'gate', a: g1.a, b: g1.b, wrong: g1.wrong, wrongTip: 'wrongIn', n: 5, marks: g1.marks, back: true });
      S.steps.push({ type: 'gate', a: mG, b: mR, wrong: [], n: 6, last: true });
      channelShoals(22, 300, hw);
      addRoute([spawn, mid(mG, mR), aimOf(g1), aimOf(g2), add(sp, AXIS.n, 22), add(sp, AXIS.u, 22), add(sp, AXIS.n, -22), aimOf(g2), aimOf(g1), mid(mG, mR)]);
    }
    function buildNight() {
      const hw = 28;
      spawn = Object.assign(AXIS.at(345, 0), { heading: U.wrapPi(AXIS.hOut + Math.PI) });
      let n = 1;
      [275, 185, 95].forEach(s => pairGate(AXIS.at(s, hw), AXIS.at(s, -hw), { n: n++, labels: false }));
      const mG = P2(521, 84), mR = P2(526, 132);
      S.steps.push({ type: 'gate', a: mG, b: mR, wrong: [], n: n, last: true });
      channelShoals(40, 390, hw);
      const sl = AXIS.at(-95, 0);
      S.sector = { x: sl.x, y: sl.y, light: 'Iso W 4s', axis: AXIS.hOut, half: 3.2 * D2R };
      addRoute([spawn].concat(S.steps.map(aimOf)));
      S.quiz = makeQuiz();
    }
    function buildSwim() {
      spawn = { x: -398, y: -505, heading: -8 * D2R };
      const ys = [-610, -720, -830];
      ys.forEach((y, i) => S.steps.push({ type: 'gate', a: P2(-452, y), b: P2(-180, y), wrong: [], n: i + 1, silent: true, aim: P2(-428, y) }));
      const fa = P2(-447, -930), fb = P2(-385, -930);
      addMark(fa.x, fa.y, 'finish'); addMark(fb.x, fb.y, 'finish');
      S.steps.push({ type: 'finish', a: fa, b: fb, n: 4, aim: P2(-425, -930) });
      for (let i = 0; i < 9; i++) { const y = -560 - i * 42; S.rings.push({ x: -441 + (i % 3) * 5, y, r: 1.6, ph: rand() * TAU, taken: false }); }
      for (let i = 0; i < 26; i++) S.swimmers.push({ x: -535 + rand() * 72, y: -980 + rand() * 500, ph: rand() * TAU, cap: ['#ff7a3d', '#ffd21f', '#e8323c', '#49c6f2', '#ffffff', '#b78cff'][i % 6], vx: (rand() - 0.5) * 0.25 });
      S.swimmers.push({ x: -500, y: -700, ph: 1, sup: true, rot: 0.3 }, { x: -480, y: -860, ph: 2, sup: true, rot: -0.5 }, { x: -470, y: -560, ph: 3, flamingo: true, rot: 0.6 });
      addRoute([spawn].concat(S.steps.map(aimOf)));
    }
    function buildCardinal() {
      spawn = { x: 3480, y: -1440, heading: -10 * D2R };
      const defs = [['W', 3480, -1560], ['N', 3590, -1660], ['E', 3700, -1790], ['S', 3830, -1900]];
      const route = [spawn];
      defs.forEach((d, i) => {
        const k = d[0], m = P2(d[1], d[2]), ok = DIRV[k];
        const lab = easy ? t('nav.dirC.' + k) : pro ? null : t('nav.mark.' + k);
        const st = singleGate(m, 'card' + k, ok, 110, { n: i + 1, light: { N: 'Q', E: 'Q(3) 10s', S: 'Q(6)+LFl 15s', W: 'Q(9) 15s' }[k], label: lab, ext: 110, aimD: 30, tip: 'wrongCard', card: k });
        st.tipVars = { dir: t('nav.dir.' + k), dirC: t('nav.dirC.' + k) };
        const c = add(m, ok, -46);
        S.shoals.push({ poly: ellPoly(c.x, c.y, k === 'N' || k === 'S' ? 34 : 24, k === 'N' || k === 'S' ? 24 : 34, 0, 18), d: 0.3, rocks: 9, reef: true });
        route.push(st.aim);
      });
      const f = P2(3920, -1990);
      addMark(f.x, f.y, 'orange', { label: t('nav.mark.finish') });
      S.steps.push({ type: 'wp', x: f.x, y: f.y, r: 16, n: 5, finish: true });
      route.push(f);
      addRoute(route);
    }
    function buildCompass() {
      spawn = { x: 3500, y: -1500, heading: 0 };
      const legs = [[0, 130], [70, 120], [330, 110], [150, 120]];
      let p = P2(spawn.x, spawn.y);
      const route = [p];
      legs.forEach((l, i) => {
        const h = l[0] * D2R, q = add(p, U.vec(h), l[1]);
        S.steps.push({ type: 'wp', x: q.x, y: q.y, r: easy ? 20 : pro ? 17 : 14, n: i + 1, hidden: true, missable: true, course: h, len: l[1], from: p, dmin: Infinity });
        route.push(q); p = q;
      });
      addRoute(route);
    }
    function buildDepth() {
      spawn = { x: 3450, y: -1420, heading: 10 * D2R };
      const route = [P2(3450, -1420), P2(3470, -1565), P2(3595, -1655), P2(3560, -1785), P2(3690, -1905)];
      S.guide = route.slice(1);
      const f = route[route.length - 1];
      addMark(f.x, f.y, 'orange', { label: t('nav.mark.finish') });
      S.steps.push({ type: 'wp', x: f.x, y: f.y, r: 18, n: 1, finish: true });
      const r2 = U.rng(P.seed * 31 + 5);
      const blobs = [];
      for (let k = 0; k < 900 && blobs.length < 30; k++) {
        const r = 20 + r2() * 38, x = 3320 + r2() * 520, y = -2010 + r2() * 650;
        if (polyDist(x, y, route) < r * 1.2 + 30) continue;
        if (Math.hypot(x - f.x, y - f.y) < r + 50 || Math.hypot(x - spawn.x, y - spawn.y) < r + 50) continue;
        if (blobs.some(b => Math.hypot(b.x - x, b.y - y) < (b.r + r) * 0.75)) continue;
        blobs.push({ x, y, r });
      }
      blobs.forEach(b => { const d = +(0.4 + r2() * 0.7).toFixed(1); S.shoals.push({ poly: blobPoly(b.x, b.y, b.r, r2), d, sand: true }); S.soundings.push({ x: b.x, y: b.y, d }); });
      // light-coloured but deep enough: teach to read the numbers
      for (let i = 0, k = 0; i < 6 && k < 400; k++) {
        const x = 3360 + r2() * 440, y = -1960 + r2() * 560, r = 24 + r2() * 22;
        if (polyDist(x, y, route) > 30) continue;
        const d = +(draft + 0.9 + r2() * 0.6).toFixed(1);
        S.shoals.unshift({ poly: blobPoly(x, y, r, r2), d, sand: true }); S.soundings.push({ x, y, d }); i++;
      }
      for (let i = 0; i < 14; i++) { const p = route[Math.min(route.length - 2, Math.floor(i / 3.5))], q = route[Math.min(route.length - 1, Math.floor(i / 3.5) + 1)], a = (i % 3.5) / 3.5; const x = U.lerp(p.x, q.x, a) + (r2() - 0.5) * 20, y = U.lerp(p.y, q.y, a) + (r2() - 0.5) * 20; S.soundings.push({ x, y, d: null }); }
      addRoute(route);
    }
    function buildFerry() {
      const lane = (base.lanes || []).find(l => l.kind === 'ferry');
      const A = lane ? P2(lane.points[5][0], lane.points[5][1]) : P2(2000, -2150), B = lane ? P2(lane.points[6][0], lane.points[6][1]) : P2(3000, -2350);
      const C = mid(A, B), d = unit(B.x - A.x, B.y - A.y), n = P2(d.y, -d.x);
      S.lane = { C, d, n, half: (lane ? lane.width : 140) / 2 };
      const st = add(C, n, -112);
      spawn = { x: st.x, y: st.y, heading: U.heading(n.x, n.y) };
      const w1 = add(C, n, 108), w2 = add(C, n, -108);
      addMark(w1.x, w1.y, 'yellow', { label: easy ? '1' : null }); addMark(w2.x, w2.y, 'yellow', { label: easy ? '2' : null });
      S.steps.push({ type: 'wp', x: w1.x, y: w1.y, r: 16, n: 1 }, { type: 'wp', x: w2.x, y: w2.y, r: 16, n: 2, finish: true });
      const names = ['NORDLYS', 'ØRESUND', 'HAVØRN', 'SKARVEN'];
      [[-420, 1], [700, 1], [1020, -1], [-160, -1]].forEach((f, i) => S.ferries.push({ s: f[0], dir: f[1], lat: f[1] > 0 ? -34 : 34, v: 5, L: 110, B: 20, name: names[i], horned: false, warnT: 0, hitT: 0, x: 0, y: 0, h: 0 }));
      S.ferries.forEach(placeFerry);
      addRoute([spawn, w1, w2]);
    }
    function makeQuiz() {
      const all = ['stbd', 'port', 'mole', 'sector', 'cardE'];
      const lightOf = { stbd: 'Fl G 3s', port: 'Fl R 3s', mole: 'Fl W 3s', sector: 'Iso W 4s', cardE: 'Q(3) 10s' };
      const order = ['stbd', 'port', 'mole', 'sector'];
      return order.map((a, i) => {
        const others = all.filter(x => x !== a);
        const opts = [a, others[(i * 2) % others.length], others[(i * 2 + 1) % others.length]];
        const sh = (i * 7 + 3) % 3; for (let k = 0; k < sh; k++) opts.push(opts.shift());
        return { a, light: lightOf[a], opts };
      });
    }

    function chartBounds() {
      const pts = S.route.concat(S.marks, S.steps.filter(s => s.type === 'wp'));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const pad = kind === 'ferry' ? 200 : 70;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, h = Math.max(x1 - x0, y1 - y0) / 2 + pad;
      return { x0: cx - h, y0: cy - h, x1: cx + h, y1: cy + h };
    }
    function refTime() {
      const SM = KOS.SailMode;
      if (!SM || !SM.routeTime) return 120;
      let r = SM.routeTime(cls, P.windKn, windDir, S.route);
      if (kind === 'ferry') r += 15;
      if (kind === 'channel') r += 12;
      return r;
    }

    // ==================================================================== panels (chart, compass, sounder)
    function esc(s) { return KOS.UI.esc ? KOS.UI.esc(s) : String(s); }
    function buildPanels() {
      const wrap = document.createElement('div');
      wrap.className = 'nav-panels nav-k-' + kind;
      let ticks = '';
      for (let d = 0; d < 360; d += 10) ticks += '<line x1="0" y1="-46" x2="0" y2="' + (d % 30 ? -42.5 : -39) + '" transform="rotate(' + d + ')"/>';
      let labels = '';
      [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(l => { labels += '<text class="nc-card' + (l[0] === 'N' ? ' n' : '') + '" transform="rotate(' + l[1] + ') translate(0 -29)">' + esc(t('nav.compass.' + l[0])) + '</text>'; });
      [30, 60, 120, 150, 210, 240, 300, 330].forEach(d => { labels += '<text class="nc-num" transform="rotate(' + d + ') translate(0 -30)">' + d + '</text>'; });
      wrap.innerHTML =
        '<div class="nav-chart glass-nav" role="img"><div class="nav-ph">' + KOS.UI.iconSvg('map') + '<span>' + esc(t('nav.chart.title')) + '</span></div><canvas></canvas></div>' +
        '<div class="nav-compass glass-nav"><svg viewBox="-56 -56 112 112" aria-hidden="true">' +
        '<circle r="54" class="nc-bg"/><g class="nc-rose"><circle r="47" class="nc-ring"/><g class="nc-ticks">' + ticks + '</g>' + labels +
        '<g class="nc-wind"><path d="M0 -55 L0 -47" /><path d="M-4 -51 L0 -46 L4 -51Z"/></g>' +
        '<g class="nc-bug"><path d="M0 -47 L6 -55 L-6 -55Z"/></g></g>' +
        '<path class="nc-lubber" d="M0 -40 L5 -50 L-5 -50Z"/><circle r="17" class="nc-mid"/>' +
        '<text class="nc-hdg" y="3">000°</text><text class="nc-sub" y="12"></text></svg></div>' +
        (kind === 'depth' ? '<div class="nav-sounder glass-nav"><div class="nav-ph">' + KOS.UI.iconSvg('anchor') + '<span>' + esc(t('nav.sounder.title')) + '</span><b class="ns-val">–</b></div><canvas></canvas></div>' : '');
      host.layer.appendChild(wrap);
      const chartEl = wrap.querySelector('.nav-chart');
      chartEl.addEventListener('pointerdown', e => { e.stopPropagation(); chartEl.classList.toggle('big'); sfx('click'); S.chartT = 0; });
      return {
        wrap, chartEl, chart: chartEl.querySelector('canvas'),
        rose: wrap.querySelector('.nc-rose'), bug: wrap.querySelector('.nc-bug'), windEl: wrap.querySelector('.nc-wind'),
        hdg: wrap.querySelector('.nc-hdg'), sub: wrap.querySelector('.nc-sub'),
        sounder: wrap.querySelector('.nav-sounder canvas'), sval: wrap.querySelector('.ns-val'),
        last: {},
      };
    }
    function layoutPanels() {
      const hb = hud.el.getBoundingClientRect(), lb = host.layer.getBoundingClientRect();
      const top = Math.round(hb.bottom - lb.top + 8);
      if (panels.last.top !== top) { panels.last.top = top; host.layer.style.setProperty('--nav-top', top + 'px'); }
    }
    let chartBg = null;
    function bakeChart() {
      const N = 110, B = S.chart, c = document.createElement('canvas'); c.width = c.height = N;
      const g = c.getContext('2d'), img = g.createImageData(N, N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = B.x0 + (i + 0.5) / N * (B.x1 - B.x0), y = B.y0 + (j + 0.5) / N * (B.y1 - B.y0);
        let col;
        if (KOS.World.isSolid(venue, x, y)) col = [255, 233, 160];
        else {
          const d = KOS.World.depthAt(venue, x, y);
          col = d < draft ? [124, 196, 236] : d < 2 ? [158, 212, 242] : d < 4 ? [192, 228, 248] : d < 6 ? [222, 241, 252] : [246, 251, 255];
        }
        const o = (j * N + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }
    const MARKCOL = { port: '#e8323c', stbd: '#18a957', safe: '#e8323c', cardN: '#ffd21f', cardE: '#ffd21f', cardS: '#ffd21f', cardW: '#ffd21f', swim: '#ffd21f', yellow: '#ffd21f', orange: '#ff7a1a', finish: '#1a7fd4', special: '#ffd21f', isolated: '#1e2128' };
    function drawChart() {
      const cv = panels.chart, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!chartBg) chartBg = bakeChart();
      g.imageSmoothingEnabled = true; g.drawImage(chartBg, 0, 0, W, H);
      const B = S.chart, k = W / (B.x1 - B.x0), X = x => (x - B.x0) * k, Y = y => (y - B.y0) * k;
      g.lineCap = 'round'; g.lineJoin = 'round';
      // swim zone + ferry lane
      for (const z of venue.zones || []) if (z.kind === 'swim' && z.poly) { g.beginPath(); z.poly.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.closePath(); g.fillStyle = 'rgba(255,210,31,.25)'; g.fill(); g.setLineDash([3, 2]); g.strokeStyle = '#d9a800'; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
      if (S.lane) { const L = S.lane; g.strokeStyle = 'rgba(200,40,140,.7)'; g.lineWidth = 1; g.setLineDash([4, 3]); for (const sg of [-1, 1]) { const a = add(add(L.C, L.d, -1500), L.n, sg * L.half), b = add(add(L.C, L.d, 1500), L.n, sg * L.half); g.beginPath(); g.moveTo(X(a.x), Y(a.y)); g.lineTo(X(b.x), Y(b.y)); g.stroke(); } g.setLineDash([]); }
      // soundings
      if (S.soundings.length) {
        g.font = 'italic 700 ' + Math.max(8, W / 22) + 'px ui-rounded,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const s of S.soundings) { const d = s.d != null ? s.d : KOS.World.depthAt(venue, s.x, s.y); g.fillStyle = d < draft ? '#b3122a' : '#1c3f7a'; g.fillText(fmtDec(d, d < 10 ? 1 : 0), X(s.x), Y(s.y)); }
      }
      // route hint
      if (easy && S.route.length > 1) { g.strokeStyle = 'rgba(255,122,61,.75)'; g.lineWidth = 1.2; g.setLineDash([2, 3]); g.beginPath(); S.route.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))); g.stroke(); g.setLineDash([]); }
      // marks
      for (const m of S.marks) { const c = MARKCOL[m.kind] || '#ff7a1a'; g.beginPath(); g.arc(X(m.x), Y(m.y), Math.max(2.2, W / 60), 0, TAU); g.fillStyle = c; g.fill(); g.strokeStyle = m.kind.indexOf('card') === 0 ? '#1e2128' : 'rgba(255,255,255,.9)'; g.lineWidth = 1; g.stroke(); }
      for (const b of venue.buoys) if (b.kind === 'swim' && b.x > B.x0 && b.x < B.x1 && b.y > B.y0 && b.y < B.y1) { g.beginPath(); g.arc(X(b.x), Y(b.y), 2, 0, TAU); g.fillStyle = '#ffd21f'; g.fill(); }
      // ferries
      for (const f of S.ferries) { g.save(); g.translate(X(f.x), Y(f.y)); g.rotate(f.h); g.fillStyle = '#1d3557'; g.fillRect(-f.B * k / 2 - 1, -f.L * k / 2, f.B * k + 2, f.L * k); g.restore(); }
      // current target
      const tg = target();
      if (tg) { const pr = 5 + 2 * Math.sin(scene.t * 5); g.strokeStyle = '#ff7a3d'; g.lineWidth = 2; g.beginPath(); g.arc(X(tg.x), Y(tg.y), pr, 0, TAU); g.stroke(); }
      // trail + boat
      if (S.trail.length > 1) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.4; g.beginPath(); S.trail.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))); g.lineTo(X(boat.x), Y(boat.y)); g.strokeStyle = 'rgba(30,40,60,.55)'; g.stroke(); }
      g.save(); g.translate(X(boat.x), Y(boat.y)); g.rotate(boat.heading);
      const s = Math.max(5, W / 22);
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.55, s * 0.7); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.55, s * 0.7); g.closePath();
      g.fillStyle = '#ff7a3d'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke(); g.restore();
      // north + frame
      g.fillStyle = 'rgba(13,19,33,.8)'; g.font = '900 ' + Math.max(9, W / 16) + 'px ui-rounded,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('N', W - 10, 5); g.beginPath(); g.moveTo(W - 10, H * 0 + 4 + W / 16 + 2); g.lineTo(W - 14, 24 + W / 30); g.lineTo(W - 6, 24 + W / 30); g.closePath(); g.fill();
    }
    function drawSounder() {
      const cv = panels.sounder; if (!cv) return;
      const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d3a66'); gr.addColorStop(1, '#06182e'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const maxD = 6, Yd = d => 4 + Math.min(1, d / maxD) * (H - 8);
      const hist = S.depthHist, n = hist.length;
      if (n > 1) {
        g.beginPath(); g.moveTo(0, H);
        hist.forEach((d, i) => g.lineTo(i / 59 * W, Yd(d)));
        g.lineTo((n - 1) / 59 * W, H); g.closePath();
        const sg = g.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, '#ffcf6e'); sg.addColorStop(1, '#a8682a'); g.fillStyle = sg; g.fill();
      }
      g.strokeStyle = '#ff4d5e'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, Yd(draft)); g.lineTo(W, Yd(draft)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#e8eef8'; g.fillRect(W - 10, 3, 6, Yd(draft) - 3);
    }
    function updateCompass() {
      const L = panels.last;
      const h = Math.round(boat.heading / D2R * 2) / 2;
      if (L.h !== h) { L.h = h; panels.rose.setAttribute('transform', 'rotate(' + (-h) + ')'); const txt = deg3(boat.heading); if (L.ht !== txt) { L.ht = txt; panels.hdg.textContent = txt; } }
      const w = Math.round((boat.windDir != null ? boat.windDir : wind.dir) / D2R);
      if (L.w !== w) { L.w = w; panels.windEl.setAttribute('transform', 'rotate(' + w + ')'); }
      const c = courseToSteer();
      const cd = c == null ? null : Math.round(c / D2R);
      if (L.c !== cd) {
        L.c = cd;
        panels.bug.style.display = cd == null ? 'none' : '';
        if (cd != null) panels.bug.setAttribute('transform', 'rotate(' + cd + ')');
        panels.sub.textContent = cd == null ? '' : t('nav.compass.course', { c: deg3(c) });
      }
      const on = cd != null && Math.abs(U.angDiff(boat.heading, c)) < 8 * D2R;
      if (L.on !== on) { L.on = on; panels.wrap.classList.toggle('nav-oncourse', on); }
    }

    // ==================================================================== small helpers
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function floatText(str, color, x, y, size) { if (scene.effects) scene.effects.text(x != null ? x : boat.x, y != null ? y : boat.y - 2, str, { color: color || '#fff', size: size || 22 }); }
    function tip(key, force, vars) {
      if (S.tips[key] && !force) return;
      if (S.time - S.tipT < 5 && !force) return;
      S.tips[key] = true; S.tipT = S.time;
      KOS.UI.coach(t('nav.tip.' + key, vars), { ms: 5600, mood: key.indexOf('wrong') === 0 || key.indexOf('ground') === 0 || key === 'swim' || key === 'ferryClose' ? 'oops' : undefined });
    }
    function flash(cls) { flashEl.className = 'nav-flash'; void flashEl.offsetWidth; flashEl.className = 'nav-flash on ' + (cls || ''); }
    function curStep() { return S.steps[S.stepI] || null; }
    function aimOf(st) {
      if (!st) return null;
      if (st.aim) return st.aim;
      if (st.type === 'gate' || st.type === 'finish') return mid(st.a, st.b);
      if (st.type === 'round') return P2(st.m.x, st.m.y);
      return P2(st.x, st.y);
    }
    function target() {
      const st = curStep(); if (!st) return null;
      if (kind === 'depth' && easy && S.guide[S.guideI]) return S.guide[S.guideI];
      if (st.hidden && !easy) return null;
      return aimOf(st);
    }
    function courseToSteer() {
      const st = curStep(); if (!st || S.phase === 'done') return null;
      if (kind === 'compass' && pro) return st.course;
      if (kind === 'ferry' && S.lane) { const toN = st.n === 1; return U.heading(S.lane.n.x * (toN ? 1 : -1), S.lane.n.y * (toN ? 1 : -1)); }
      const tg = kind === 'depth' && !easy ? null : target();
      return tg ? U.heading(tg.x - boat.x, tg.y - boat.y) : null;
    }
    function prefixStats(o) { const out = {}; for (const k in o) out[KOS.I18n.has('ui.stat.' + k) ? k : 'nav.stat.' + k] = o[k]; return out; }

    // ==================================================================== rules
    function error(what, tipKey, vars) {
      if (S.phase !== 'go') return;
      if (S.time - S.lastErr < 2.5) return;
      S.lastErr = S.time; S.errors++;
      sfx(what === 'ground' ? 'crash' : what === 'ferry' ? 'horn' : 'bump', { vol: 0.8 });
      if (what === 'wrong') sfx('whistle', { vol: 0.6 });
      scene.shake(what === 'ground' ? 0.6 : 0.35); flash('bad');
      floatText(t('nav.fx.' + (what === 'ferry' ? 'toot' : what)), '#ff6b78', null, null, 26);
      if (KOS.Input.haptic) KOS.Input.haptic([30, 40, 30]);
      if (S.lives) {
        S.livesLeft--;
        if (S.livesLeft <= 0) { tip(tipKey, true, vars); fail('nav.res.fail'); return; }
        tip(tipKey, true, vars);
        try { KOS.UI.toast(t('nav.tip.lives', { n: S.livesLeft }), { kind: 'bad', icon: 'heart', ms: 2600 }); } catch (e) { /* optional */ }
      } else tip(tipKey, true, vars);
    }
    function passStep(st, x, y) {
      st.done = true; S.stepI++; S.gatesOk++;
      const nxt = curStep();
      if (st.marks) st.marks.forEach(m => { m.passed = true; });
      const p = x != null ? P2(x, y) : aimOf(st);
      if (st.silent) { sfx('tap', { pitch: 1.3 }); if (scene.effects) scene.effects.ripple(boat.x, boat.y, 3, 0.7); }
      else {
        sfx(nxt ? 'bell' : 'win', { pitch: 1 + 0.05 * S.gatesOk, vol: 0.8 });
        sfx('coin', { pitch: 1 + 0.07 * S.gatesOk, vol: 0.5 });
        if (scene.effects) { scene.effects.stars(p.x, p.y, 14); scene.effects.ripple(p.x, p.y, 5, 1); }
        const label = st.type === 'round' ? t('nav.fx.round') : st.card ? t('nav.fx.ok') : st.type === 'wp' ? t('nav.fx.wp') : st.n ? t('nav.fx.gate', { n: st.n }) : t('nav.fx.ok');
        floatText(label, '#ffd25e', p.x, p.y, 24);
        flash('good');
      }
      if (!nxt) { complete(); return; }
      if (nxt.last) tip('last', true);
      if (st.type === 'round') tip('round', true);
      if (kind === 'ferry' && st.n === 1) tip('halfway', true);
    }
    function checkStep(px, py) {
      const st = curStep(); if (!st) return;
      if (st.type === 'gate' || st.type === 'finish') {
        if (U.segCross(px, py, boat.x, boat.y, st.a.x, st.a.y, st.b.x, st.b.y)) { passStep(st, boat.x, boat.y); return; }
        for (const w of st.wrong || []) if (U.segCross(px, py, boat.x, boat.y, w[0].x, w[0].y, w[1].x, w[1].y)) { error('wrong', st.wrongTip || 'wrongIn', st.tipVars); break; }
      } else if (st.type === 'round') {
        const m = st.m, d = dist(boat, m);
        if (d < 75) {
          const b0 = U.heading(px - m.x, py - m.y), b1 = U.heading(boat.x - m.x, boat.y - m.y);
          st.sweep += U.wrapPi(b1 - b0);
          if (Math.abs(st.sweep) > 4.4) passStep(st, m.x, m.y);
        } else if (d > 95) st.sweep = 0;
      } else if (st.type === 'wp') {
        const d = dist(boat, st);
        st.dmin = Math.min(st.dmin == null ? Infinity : st.dmin, d);
        if (d < st.r) {
          if (st.missable) { S.misses.push(d); revealWp(st, false); if (d < st.r * 0.4) floatText(t('nav.fx.perfect'), '#3ee08f', st.x, st.y - 3, 26); }
          passStep(st, st.x, st.y);
          if (st.missable && curStep()) { tip('legDone'); legStart(); }
        } else if (st.missable && st.dmin < st.r * 3.2 && d > st.dmin + 24) {
          S.misses.push(st.dmin); revealWp(st, true);
          floatText(t('nav.fx.miss', { n: Math.round(st.dmin) }), '#ffb547', st.x, st.y);
          S.errors++; sfx('bump', { vol: 0.5 }); tip('miss');
          st.done = true; S.stepI++;
          if (!curStep()) complete(); else legStart();
        }
      }
    }
    function revealWp(st, missed) {
      st.hidden = false;
      addMark(st.x, st.y, 'special', { label: missed ? '✗' : '✓', pop: 0 });
      if (scene.effects) { scene.effects.ripple(st.x, st.y, 8, 1.2); if (!missed) scene.effects.confetti(st.x, st.y, 30); }
    }
    function legStart() { S.legFrom = P2(boat.x, boat.y); S.legDist = 0; }

    function pickRings() {
      const reach = cls.length * 0.55 + (easy ? 3 : 2.2);
      for (const r of S.rings) {
        if (r.taken || Math.hypot(r.x - boat.x, r.y - boat.y) > reach + r.r) continue;
        r.taken = true; S.ringsGot++;
        S.pops.push({ x: r.x, y: r.y, t: 0 });
        sfx('coin', { pitch: 1 + S.ringsGot * 0.06 });
        floatText(t('nav.fx.ring'), '#ffd25e', r.x, r.y);
        if (scene.effects) { scene.effects.stars(r.x, r.y, 10); scene.effects.splash(r.x, r.y, 0.4); }
        if (S.ringsGot === 1) tip('ringClose');
      }
    }
    function swimZone() {
      const z = KOS.World.inZone(venue, boat.x, boat.y, 'swim');
      if (z && !S.inSwim) {
        S.inSwim = true; S.swims++; S.errors++; S.penalty += 10;
        sfx('whistle'); scene.shake(0.3); flash('bad'); floatText(t('nav.fx.swim'), '#ff6b78');
        for (const s of S.swimmers) if (Math.hypot(s.x - boat.x, s.y - boat.y) < 60) s.scare = 2.5;
        tip('swim', true);
      } else if (!z) S.inSwim = false;
    }
    function placeFerry(f) {
      const L = S.lane, fw = P2(L.d.x * f.dir, L.d.y * f.dir);
      f.x = L.C.x + L.d.x * f.s + L.n.x * f.lat; f.y = L.C.y + L.d.y * f.s + L.n.y * f.lat;
      f.h = U.heading(fw.x, fw.y); f.fw = fw; f.pp = P2(-fw.y, fw.x);
    }
    function ferries(dt) {
      for (const f of S.ferries) {
        f.s += f.dir * f.v * dt;
        if (f.dir > 0 && f.s > 1150) { f.s -= 2300; f.horned = false; }
        if (f.dir < 0 && f.s < -1150) { f.s += 2300; f.horned = false; }
        placeFerry(f);
        f.warnT = Math.max(0, f.warnT - dt); f.hitT = Math.max(0, f.hitT - dt);
        if (S.phase !== 'go') continue;
        const rx = boat.x - f.x, ry = boat.y - f.y, along = rx * f.fw.x + ry * f.fw.y, lat = rx * f.pp.x + ry * f.pp.y;
        const dd = Math.hypot(rx, ry);
        if (!f.horned && dd < 420 && along > 0) { f.horned = true; sfx('hornLong', { vol: 0.55 }); if (S.inLane || Math.abs((boat.x - S.lane.C.x) * S.lane.n.x + (boat.y - S.lane.C.y) * S.lane.n.y) < S.lane.half + 40) tip('ferryWait'); }
        const contact = Math.abs(along) < f.L / 2 + 1.5 && Math.abs(lat) < f.B / 2 + 1.5;
        const danger = (along > f.L / 2 - 5 && along < f.L / 2 + 110 && Math.abs(lat) < f.B / 2 + 16) || (Math.abs(along) < f.L / 2 + 10 && Math.abs(lat) < f.B / 2 + 9);
        f.danger = danger;
        if (contact && f.hitT <= 0) {
          f.hitT = 3; scene.shake(1); sfx('crash'); if (scene.effects) scene.effects.splash(boat.x, boat.y, 1.2);
          if (easy) {
            const sg = lat >= 0 ? 1 : -1; boat.x += f.pp.x * sg * (f.B / 2 + 6 - Math.abs(lat)); boat.y += f.pp.y * sg * (f.B / 2 + 6 - Math.abs(lat));
            boat.vx = f.pp.x * sg * 1.5; boat.vy = f.pp.y * sg * 1.5;
            S.lastErr = -99; error('ferry', 'ferryClose');
          } else { fail('nav.res.ferryHit'); return; }
        } else if (danger && f.warnT <= 0) {
          f.warnT = 9;
          for (let i = 0; i < 5; i++) S.hornQ.push(S.time + i * 0.42);
          error('ferry', 'ferryClose');
        }
      }
      // lane statistics: crossing angle
      const L = S.lane, lat = (boat.x - L.C.x) * L.n.x + (boat.y - L.C.y) * L.n.y;
      S.inLane = Math.abs(lat) < L.half;
      if (S.inLane && S.phase === 'go') {
        S.laneT += dt;
        const sp = Math.hypot(boat.vx, boat.vy);
        if (sp > 0.4) {
          const cog = U.heading(boat.vx, boat.vy), hn = U.heading(L.n.x, L.n.y);
          const e = Math.min(Math.abs(U.angDiff(cog, hn)), Math.abs(U.angDiff(cog, hn + Math.PI)));
          S.laneErr += e * dt; S.laneN += dt;
          if (e > 30 * D2R) { S.angleBadT += dt; if (S.angleBadT > 2.5) tip('ferryAngle'); } else S.angleBadT = 0;
        }
      }
      while (S.hornQ.length && S.hornQ[0] <= S.time) { S.hornQ.shift(); sfx('hornShort', { vol: 0.7 }); }
    }
    function sector(dt) {
      const L = S.sector, b = U.heading(boat.x - L.x, boat.y - L.y), dlt = U.wrapPi(b - L.axis);
      const col = Math.abs(dlt) < L.half ? 'W' : dlt > 0 ? 'R' : 'G';
      if (col !== S.sectorCol) {
        S.sectorCol = col;
        if (S.phase === 'go') {
          if (col === 'W') { floatText(t('nav.fx.sector'), '#fffbe0'); sfx('pop', { vol: 0.4, pitch: 1.4 }); }
          else if (S.time > 4) tip(col === 'R' ? 'sectorR' : 'sectorG');
        }
      }
    }
    function sounder(dt) {
      const d = KOS.World.depthAt(venue, boat.x, boat.y), uk = d - draft;
      S.uk = uk;
      if ((S.sndT = (S.sndT || 0) - dt) <= 0) { S.sndT = 0.2; S.depthHist.push(d); if (S.depthHist.length > 60) S.depthHist.shift(); }
      if (S.phase !== 'go') return;
      if (uk < 1.0) {
        S.beepT -= dt;
        if (S.beepT <= 0) { sfx('tap', { pitch: 1.8, vol: 0.35 }); S.beepT = 0.18 + 1.0 * U.clamp(uk, 0, 1); }
        S.shallowT += dt; if (S.shallowT > 0.6) tip('shallow');
      } else S.shallowT = 0;
      if (d < 3.5 && d >= draft + 0.5 && S.time > 6) tip('light2', false, { d: fmtDec(draft + 0.3) });
    }

    function complete() {
      if (S.phase !== 'go') return;
      S.phase = 'done'; S.finishT = 2.0;
      const time = S.time + S.penalty;
      const ratio = time / Math.max(20, S.ref);
      const SM = KOS.SailMode;
      const tStars = SM && SM.starsFor ? SM.starsFor(ratio, assist) : (ratio < 1.3 ? 3 : ratio < 1.8 ? 2 : 1);
      let acc = 3 - S.errors * (easy ? 0.5 : pro ? 1.5 : 1);
      const accDeg = S.accN ? S.accSum / S.accN / D2R : 0;
      const angle = S.laneN ? S.laneErr / S.laneN / D2R : 0;
      if (kind === 'compass') { const lim = easy ? 22 : pro ? 12 : 16; if (accDeg > lim) acc -= 1; if (accDeg > lim * 2) acc -= 1; }
      if (kind === 'night') acc -= (S.quizN - S.quizOk) * (easy ? 0.34 : 0.6);
      if (kind === 'swim' && S.ringsGot < S.rings.length / 2) acc -= 1;
      if (kind === 'ferry') { const lim = easy ? 25 : pro ? 12 : 18; if (angle > lim) acc -= 1; if (angle > lim * 2) acc -= 1; }
      const stars = U.clamp(Math.min(tStars, Math.round(acc)), 1, 3);
      sfx('win', { vol: 0.6 }); if (stars === 3) sfx('cheer', { vol: 0.5 });
      if (scene.effects) { scene.effects.confetti(boat.x, boat.y, 140); scene.effects.text(boat.x, boat.y - 4, '★'.repeat(stars), { color: '#ffd25e', size: 36 }); }
      if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* optional */ } }
      scene.shake(0.3);
      const stats = { errors: S.errors };
      if (['buoys', 'channel', 'night', 'cardinal'].indexOf(kind) >= 0) stats.gates = S.gatesOk;
      if (kind === 'swim') { stats.rings = S.ringsGot + '/' + S.rings.length; stats.swims = S.swims; }
      if (kind === 'night') stats.quiz = S.quizOk + '/' + S.quizN;
      if (kind === 'compass') { stats.acc = Math.round(accDeg); stats.miss = S.misses.length ? Math.round(S.misses.reduce((a, b) => a + b, 0) / S.misses.length) : 0; }
      if (kind === 'depth' || kind === 'channel' || kind === 'night') stats.ground = S.grounds;
      if (kind === 'ferry') { stats.angle = Math.round(angle); stats.laneTime = KOS.UI.fmtTime(S.laneT * 1000); }
      S.result = {
        stars, success: true, timeMs: Math.round(time * 1000),
        score: Math.max(0, Math.round(1000 * Math.min(3, S.ref / time) + S.ringsGot * 100 + S.quizOk * 150 - S.errors * 150)),
        stats: prefixStats(stats),
        msgKey: 'nav.res.' + kind,
        msgVars: { time: KOS.UI.fmtTime(time * 1000), err: S.errors, rings: S.ringsGot, quiz: S.quizOk + '/' + S.quizN, acc: Math.round(accDeg), angle: Math.round(angle) },
      };
    }
    function fail(msgKey) {
      if (S.phase === 'done') return;
      S.phase = 'done'; S.finishT = 2.2;
      sfx('lose', { vol: 0.7 }); scene.shake(0.6);
      S.result = { stars: 0, success: false, timeMs: Math.round((S.time + S.penalty) * 1000), score: S.gatesOk * 100,
        stats: prefixStats({ errors: S.errors, gates: S.gatesOk }), msgKey };
    }

    // ==================================================================== cards (briefing, light quiz)
    function closeCard() { if (card) { card.el.classList.add('out'); const el = card.el; setTimeout(() => el.remove(), 260); card = null; } }
    function openCard(html, cls) {
      closeCard();
      const el = document.createElement('div');
      el.className = 'nav-card-wrap';
      el.innerHTML = '<div class="nav-card ' + (cls || '') + '">' + html + '</div>';
      el.addEventListener('pointerdown', e => e.stopPropagation());
      host.layer.appendChild(el);
      requestAnimationFrame(() => el.classList.add('in'));
      card = { el, primary: el.querySelector('.btn-primary'), opts: null };
      return card;
    }
    function briefCard() {
      let html;
      if (kind === 'buoys') {
        html = '<h2 class="nav-card-title">' + esc(t('nav.card.buoysTitle')) + '</h2>' +
          '<div class="nav-buoys"><div class="nb-col nb-red">' + svgCan('#e8323c', '#ff6a72') + '<b>' + esc(t('nav.card.red')) + '</b><small>' + esc(t('nav.card.redSub')) + '</small></div>' +
          '<div class="nb-map"><svg viewBox="0 0 120 150"><text x="60" y="14" class="nbm-t">' + esc(t('nav.card.harbor')) + '</text><text x="60" y="146" class="nbm-t">' + esc(t('nav.card.sea')) + '</text>' +
          '<path d="M20 22V128M100 22V128" stroke="rgba(255,255,255,.18)" stroke-width="18"/>' +
          [36, 76, 116].map(y => '<rect x="24" y="' + (y - 7) + '" width="10" height="14" rx="2" fill="#e8323c"/><path d="M86 ' + (y + 7) + 'L91 ' + (y - 8) + 'L96 ' + (y + 7) + 'Z" fill="#18a957"/>').join('') +
          '<path class="nbm-boat" d="M60 70l8 22h-16z" fill="#ff7a3d" stroke="#fff" stroke-width="1.5"/><path d="M60 128V100M54 106l6-8 6 8" stroke="#fff" stroke-width="2.5" fill="none" stroke-dasharray="4 3" class="nbm-arrow"/></svg></div>' +
          '<div class="nb-col nb-green">' + svgCone('#18a957') + '<b>' + esc(t('nav.card.green')) + '</b><small>' + esc(t('nav.card.greenSub')) + '</small></div></div>' +
          '<p class="nav-card-body">' + esc(t('nav.card.buoysBody')) + '</p>';
      } else {
        html = '<h2 class="nav-card-title">' + esc(t('nav.card.cardTitle')) + '</h2>' +
          '<div class="nav-cards4"><div class="nc4 n">' + svgCard('N') + '<b>' + esc(t('nav.dirC.N')) + '</b></div><div class="nc4 w">' + svgCard('W') + '<b>' + esc(t('nav.dirC.W')) + '</b></div>' +
          '<div class="nc4 rock"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="rgba(160,120,70,.35)"/><path d="M14 36q6-14 16-10t16 8q-8 8-18 6t-14-4z" fill="#6c6458"/><path d="M22 30q4-6 10-3" stroke="#a49a8a" stroke-width="2" fill="none"/></svg><b>' + esc(t('nav.card.rock')) + '</b></div>' +
          '<div class="nc4 e">' + svgCard('E') + '<b>' + esc(t('nav.dirC.E')) + '</b></div><div class="nc4 s">' + svgCard('S') + '<b>' + esc(t('nav.dirC.S')) + '</b></div></div>' +
          '<p class="nav-card-body">' + esc(t('nav.card.cardBody')) + '</p><p class="nav-card-hint">' + esc(t('nav.card.cardHint')) + '</p>';
      }
      html += '<button type="button" class="btn btn-primary nav-go">' + KOS.UI.iconSvg('sail') + '<span>' + esc(t('nav.card.go')) + '</span></button>';
      const c = openCard(html, 'nav-brief');
      c.primary.addEventListener('click', () => { sfx('click'); closeCard(); beginCountdown(); });
      sfx('whoosh', { vol: 0.4 });
    }
    function quizCard(i) {
      const q = S.quiz[i];
      S.quizI = i; S.quizT = 0; S.quizAnswered = false;
      const html = '<div class="nq-top"><span>' + esc(t('nav.quiz.title')) + '</span><span>' + esc(t('nav.quiz.of', { n: i + 1, m: S.quiz.length })) + '</span></div>' +
        '<div class="nq-night"><div class="nq-stars"></div><div class="nq-light" data-col="' + (q.light.match(/\b(R|G|W|Y)\b/) || [, 'W'])[1] + '"></div><div class="nq-refl"></div><div class="nq-char">' + esc(q.light.replace('Iso W 4s', 'Iso WRG 4s')) + '</div></div>' +
        '<p class="nq-q">' + esc(t('nav.quiz.q')) + '</p>' +
        '<div class="nq-opts">' + q.opts.map((o, k) => '<button type="button" class="nq-opt" data-o="' + o + '"><span class="nq-key">' + (k + 1) + '</span>' + svgLight(o) + '<span class="nq-txt">' + esc(t('nav.light.' + o)) + '</span></button>').join('') + '</div>' +
        '<div class="nq-fb" aria-live="polite"></div><button type="button" class="btn btn-primary nq-next" hidden><span>' + esc(t(i === S.quiz.length - 1 ? 'nav.quiz.start' : 'nav.quiz.next')) + '</span></button>';
      const c = openCard(html, 'nav-quiz');
      c.primary = null;
      c.lightEl = c.el.querySelector('.nq-light'); c.reflEl = c.el.querySelector('.nq-refl');
      const next = c.el.querySelector('.nq-next');
      c.opts = Array.from(c.el.querySelectorAll('.nq-opt'));
      c.opts.forEach(b => b.addEventListener('click', () => answer(b.getAttribute('data-o'))));
      next.addEventListener('click', () => { sfx('click'); if (i + 1 < S.quiz.length) quizCard(i + 1); else { closeCard(); beginCountdown(); } });
      function answer(o) {
        if (S.quizAnswered) return;
        S.quizAnswered = true; S.quizN++;
        const ok = o === q.a;
        if (ok) { S.quizOk++; sfx('coin', { pitch: 1.1 + S.quizOk * 0.08 }); sfx('star', { vol: 0.5 }); }
        else sfx('bump');
        c.opts.forEach(b => { const v = b.getAttribute('data-o'); b.classList.add(v === q.a ? 'right' : v === o ? 'wrong' : 'dim'); b.disabled = true; });
        const fb = c.el.querySelector('.nq-fb');
        fb.className = 'nq-fb ' + (ok ? 'ok' : 'bad');
        fb.innerHTML = '<b>' + esc(ok ? t('nav.quiz.right') : t('nav.quiz.wrong', { a: t('nav.light.' + q.a) })) + '</b><span>' + esc(t('nav.light.' + q.a + 'D')) + '</span>';
        next.hidden = false; c.primary = next; c.opts = null;
        try { next.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
      return answer;
    }
    function quizTick(dt) {
      if (!card || !card.lightEl) return;
      S.quizT += dt;
      const q = S.quiz[S.quizI];
      const pl = KOS.Sprites && KOS.Sprites.parseLight ? KOS.Sprites.parseLight(q.light) : null;
      const on = pl ? KOS.Sprites.lightLevel(pl, S.quizT + 0.3) : (S.quizT % 3 < 0.4);
      if (card.on !== !!on) { card.on = !!on; card.lightEl.classList.toggle('on', !!on); card.reflEl.classList.toggle('on', !!on); }
      if (q.a === 'sector') { const col = ['W', 'R', 'W', 'G'][Math.floor(S.quizT / 4) % 4]; if (card.lightEl.getAttribute('data-col') !== col) { card.lightEl.setAttribute('data-col', col); card.reflEl.setAttribute('data-col', col); } }
    }

    // ==================================================================== drawing: world overlay (meters)
    const rockCache = [];
    S.shoals.forEach((s, si) => {
      if (!s.rocks) return;
      const pb = KOS.U.polyBounds ? KOS.U.polyBounds(s.poly) : null; if (!pb) return;
      const rr = U.rng(si * 13 + 3);
      for (let i = 0, k = 0; i < s.rocks && k < 400; k++) {
        const x = U.lerp(pb.x0, pb.x1, rr()), y = U.lerp(pb.y0, pb.y1, rr());
        if (!pointInPoly(x, y, s.poly)) continue;
        if (!s.reef && polyDistToEdge(x, y, s.poly) > 30) continue;
        rockCache.push({ x, y, r: (s.reef ? 1.6 : 1.1) + rr() * 1.8, ph: rr() * TAU, rot: rr() * TAU }); i++;
      }
    });
    function polyDistToEdge(x, y, poly) { let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, U.segDistance(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1])); return d; }

    function drawWorld(ctx, sc) {
      const mpp = sc.mpp, tm = sc.t, v = sc.view;
      const inV = (x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
      // rocks with breaking surf
      if (!(kind === 'depth' && pro)) for (const r of rockCache) {
        if (!inV(r.x, r.y, 6)) continue;
        const fr = 0.5 + 0.5 * Math.sin(tm * 1.6 + r.ph);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.4 * fr) + ')'; ctx.lineWidth = Math.max(0.12, 1.2 * mpp);
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (1.5 + 0.35 * fr), r.r * (1.2 + 0.3 * fr), r.rot, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(0,30,60,.25)'; ctx.beginPath(); ctx.ellipse(r.x + 0.3, r.y + 0.35, r.r, r.r * 0.75, r.rot, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7c7366'; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.72, r.rot, 0, TAU); ctx.fill();
        ctx.fillStyle = '#a69c8c'; ctx.beginPath(); ctx.ellipse(r.x - r.r * 0.25, r.y - r.r * 0.2, r.r * 0.5, r.r * 0.32, r.rot, 0, TAU); ctx.fill();
      }
      // sand bank ripples (depth, visible levels)
      if (kind === 'depth' && !pro) for (const s of S.soundings) {
        if (s.d == null || s.d >= draft || !inV(s.x, s.y, 60)) continue;
        ctx.strokeStyle = 'rgba(255,240,200,' + (0.16 + 0.08 * Math.sin(tm + s.x)) + ')'; ctx.lineWidth = Math.max(0.15, 1 * mpp);
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(s.x, s.y, i * 6 + (tm * 1.5 % 6), 0, TAU); ctx.stroke(); }
      }
      // current gate: dashed passage + direction chevrons; wrong sides in red (easy)
      const st = curStep();
      if (st && (st.type === 'gate' || st.type === 'finish') && !st.silent && S.phase !== 'done' && kind !== 'night') {
        const a = st.a, b = st.type === 'gate' && st.aim ? add(st.a, unit(st.b.x - st.a.x, st.b.y - st.a.y), Math.min(dist(st.a, st.b), 60)) : st.b;
        const pulse = 0.55 + 0.45 * Math.sin(tm * 5);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(62,224,143,' + (0.45 + 0.4 * pulse) + ')'; ctx.lineWidth = Math.max(0.35, 3.5 * mpp);
        ctx.setLineDash([7 * mpp, 6 * mpp]); ctx.lineDashOffset = -tm * 20 * mpp;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        if (easy) for (const w of st.wrong || []) {
          const q = add(w[0], unit(w[1].x - w[0].x, w[1].y - w[0].y), 18);
          ctx.strokeStyle = 'rgba(255,77,94,.55)'; ctx.lineWidth = Math.max(0.3, 2.5 * mpp); ctx.setLineDash([3 * mpp, 5 * mpp]);
          ctx.beginPath(); ctx.moveTo(w[0].x, w[0].y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
          const s = Math.max(1.2, 9 * mpp); ctx.save(); ctx.translate(q.x, q.y); ctx.strokeStyle = 'rgba(255,77,94,.9)'; ctx.lineWidth = Math.max(0.3, 3 * mpp);
          ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke(); ctx.restore();
        }
      }
      if (st && st.type === 'round' && S.phase !== 'done') {
        const R = Math.max(8, 30 * mpp) * (1 + 0.1 * Math.sin(tm * 4));
        ctx.strokeStyle = 'rgba(255,181,71,.9)'; ctx.lineWidth = Math.max(0.3, 3 * mpp); ctx.setLineDash([6 * mpp, 5 * mpp]); ctx.lineDashOffset = -tm * 18 * mpp;
        ctx.beginPath(); ctx.arc(st.m.x, st.m.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        const frac = Math.min(1, Math.abs(st.sweep) / 4.4);
        if (frac > 0.02) { ctx.strokeStyle = '#3ee08f'; ctx.lineWidth = Math.max(0.5, 5 * mpp); ctx.beginPath(); ctx.arc(st.m.x, st.m.y, R, -Math.PI / 2, -Math.PI / 2 + Math.sign(st.sweep || 1) * frac * TAU, st.sweep < 0); ctx.stroke(); }
      }
      // waypoints: easy shows a ring for hidden ones; normal wps get a pulsing ring
      for (const w of S.steps) {
        if (w.type !== 'wp' || w.done || w !== st) continue;
        if (w.hidden && !easy) continue;
        const R = w.r * (1 + 0.06 * Math.sin(tm * 4));
        ctx.strokeStyle = w.hidden ? 'rgba(255,255,255,.55)' : 'rgba(255,181,71,.9)'; ctx.lineWidth = Math.max(0.3, 2.5 * mpp); ctx.setLineDash([5 * mpp, 6 * mpp]); ctx.lineDashOffset = -tm * 12 * mpp;
        ctx.beginPath(); ctx.arc(w.x, w.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (w.hidden) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '900 ' + Math.max(3, 18 * mpp) + 'px ui-rounded,system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', w.x, w.y); }
      }
      // cardinal hint (easy): green chevrons pointing to the safe side
      if (easy && st && st.card && S.phase === 'go') {
        const m = st.a, ok = DIRV[st.card];
        for (let i = 0; i < 3; i++) {
          const ph = ((tm * 0.8 + i / 3) % 1), p = add(m, ok, 10 + ph * 26), s = Math.max(1.4, 8 * mpp);
          const h = U.heading(ok.x, ok.y);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(h); ctx.globalAlpha = Math.sin(ph * Math.PI);
          ctx.strokeStyle = '#3ee08f'; ctx.lineWidth = Math.max(0.4, 4 * mpp); ctx.beginPath(); ctx.moveTo(-s, s * 0.5); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s, s * 0.5); ctx.stroke(); ctx.restore();
        }
      }
      // rings
      for (const r of S.rings) { if (r.taken || !inV(r.x, r.y, 10)) continue; const k = Math.max(1, 13 * mpp / r.r) * (1 + 0.06 * Math.sin(tm * 2.4 + r.ph)); ctx.save(); ctx.translate(r.x, r.y); ctx.scale(r.r * k, r.r * k); drawRing(ctx, tm, r.ph); ctx.restore(); }
      for (let i = S.pops.length - 1; i >= 0; i--) { const p = S.pops[i], a = p.t / 0.5; if (a >= 1) { S.pops.splice(i, 1); continue; } const k = Math.max(1, 13 * mpp / 1.4) * 1.4 * (1 + a); ctx.save(); ctx.globalAlpha = 1 - a; ctx.translate(p.x, p.y - a * 3); ctx.scale(k, k); drawRing(ctx, tm, 0); ctx.restore(); }
      // swimmers
      for (const s of S.swimmers) if (inV(s.x, s.y, 8)) drawSwimmer(ctx, s, tm, mpp);
      // sector light tower
      if (S.sector) { const L = S.sector, k = Math.max(1, 10 * mpp / 1.2); ctx.save(); ctx.translate(L.x, L.y); ctx.scale(k, k); ctx.fillStyle = 'rgba(0,20,40,.3)'; ctx.beginPath(); ctx.arc(0.3, 0.3, 1.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8eef5'; ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8323c'; ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, TAU); ctx.fill(); ctx.restore(); }
      // ferries
      for (const f of S.ferries) if (inV(f.x, f.y, 260)) drawFerry(ctx, f, tm, mpp, sc);
    }
    function drawRing(ctx, tm, ph) {
      const g = ctx.createRadialGradient(0, 0, 0.4, 0, 0, 2.1);
      g.addColorStop(0, 'rgba(255,214,94,0.55)'); g.addColorStop(1, 'rgba(255,214,94,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 2.1, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ffb21e';
        const a0 = i / 8 * TAU + tm * 0.4, a1 = (i + 1) / 8 * TAU + tm * 0.4;
        ctx.beginPath(); ctx.arc(0, 0, 1, a0, a1); ctx.arc(0, 0, 0.52, a1, a0, true); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(tm * 3 + ph)) + ')'; ctx.beginPath(); ctx.ellipse(-0.45, -0.6, 0.22, 0.09, -0.6, 0, TAU); ctx.fill();
    }
    function drawSwimmer(ctx, s, tm, mpp) {
      const k = Math.max(1, 9 * mpp / 0.45);
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(k, k);
      const ph = tm * 2.2 + s.ph, scare = s.scare > 0;
      if (s.sup || s.flamingo) {
        ctx.rotate(s.rot + Math.sin(tm * 0.5 + s.ph) * 0.08);
        if (s.sup) {
          ctx.fillStyle = 'rgba(0,30,60,.2)'; ctx.beginPath(); ctx.ellipse(0.1, 0.15, 0.5, 1.7, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#49c6f2'; ctx.beginPath(); ctx.ellipse(0, 0, 0.42, 1.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-0.05, -1.3, 0.1, 2.6);
          ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.arc(0, 0.1, 0.32, 0, TAU); ctx.fill(); ctx.fillStyle = '#f1b38c'; ctx.beginPath(); ctx.arc(0, -0.05, 0.2, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#2b3442'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-0.7, -0.6 + Math.sin(ph) * 0.3); ctx.lineTo(0.5, 0.4 + Math.sin(ph) * 0.3); ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(0,30,60,.2)'; ctx.beginPath(); ctx.arc(0.12, 0.15, 1.05, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff8fb8'; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.arc(0, 0, 0.45, 0, TAU, true); ctx.fill('evenodd');
          ctx.beginPath(); ctx.ellipse(0, -1.3, 0.16, 0.5, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -1.8, 0.25, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2b3442'; ctx.beginPath(); ctx.moveTo(0, -2.0); ctx.lineTo(0.12, -2.3); ctx.lineTo(-0.1, -2.15); ctx.fill();
          ctx.fillStyle = '#f1b38c'; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#8a4b2a'; ctx.beginPath(); ctx.arc(0, -0.05, 0.22, Math.PI, TAU); ctx.fill();
        }
      } else {
        const rp = (tm * 0.7 + s.ph) % 1;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - rp)) + ')'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(0, 0, 0.5 + rp * 0.9, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#f1b38c';
        const ax = Math.sin(ph) * 0.35, up = scare ? -0.5 : 0;
        ctx.beginPath(); ctx.ellipse(-0.42, -0.1 + ax + up, 0.1, 0.32, 0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0.42, -0.1 - ax + up, 0.1, 0.32, -0.3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, 0.26, 0, TAU); ctx.fill();
        ctx.fillStyle = s.cap; ctx.beginPath(); ctx.arc(0, -0.03, 0.27, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
        if (scare) { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + tm * 4; ctx.beginPath(); ctx.arc(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.08, 0, TAU); ctx.fill(); } }
      }
      ctx.restore();
    }
    function drawFerry(ctx, f, tm, mpp, sc) {
      const L = f.L, B = f.B;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.h);
      // danger zone ahead of the bow (easy + normal)
      if (!pro) {
        const a = 0.1 + (f.danger ? 0.18 + 0.12 * Math.sin(tm * 10) : 0.04 * Math.sin(tm * 3));
        const g = ctx.createLinearGradient(0, -L / 2, 0, -L / 2 - 110);
        g.addColorStop(0, 'rgba(255,77,94,' + (a + 0.12) + ')'); g.addColorStop(1, 'rgba(255,77,94,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-B / 2 - 6, -L / 2 + 10); ctx.lineTo(-B / 2 - 16, -L / 2 - 110); ctx.lineTo(B / 2 + 16, -L / 2 - 110); ctx.lineTo(B / 2 + 6, -L / 2 + 10); ctx.closePath(); ctx.fill();
      }
      // wake
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2.2;
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sg * B * 0.45, L / 2 - 6); ctx.quadraticCurveTo(sg * (B * 0.9), L / 2 + 60, sg * (B * 2.3), L / 2 + 190); ctx.stroke(); }
      const wg = ctx.createLinearGradient(0, L / 2, 0, L / 2 + 160); wg.addColorStop(0, 'rgba(240,250,255,.55)'); wg.addColorStop(1, 'rgba(240,250,255,0)');
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(-B * 0.42, L / 2); ctx.lineTo(B * 0.42, L / 2); ctx.lineTo(B * 0.7 + Math.sin(tm * 3) * 2, L / 2 + 160); ctx.lineTo(-B * 0.7, L / 2 + 160); ctx.closePath(); ctx.fill();
      // shadow + hull
      const hull = () => { ctx.beginPath(); ctx.moveTo(0, -L / 2); ctx.quadraticCurveTo(B / 2, -L / 2 + L * 0.1, B / 2, -L / 2 + L * 0.3); ctx.lineTo(B / 2, L / 2 - 3); ctx.quadraticCurveTo(B / 2, L / 2, B / 2 - 3, L / 2); ctx.lineTo(-B / 2 + 3, L / 2); ctx.quadraticCurveTo(-B / 2, L / 2, -B / 2, L / 2 - 3); ctx.lineTo(-B / 2, -L / 2 + L * 0.3); ctx.quadraticCurveTo(-B / 2, -L / 2 + L * 0.1, 0, -L / 2); ctx.closePath(); };
      ctx.save(); ctx.translate(3, 4); hull(); ctx.fillStyle = 'rgba(0,20,50,.3)'; ctx.fill(); ctx.restore();
      hull(); ctx.fillStyle = '#1d3557'; ctx.fill();
      ctx.save(); ctx.scale(0.86, 0.95); hull(); ctx.fillStyle = '#eef2f6'; ctx.fill(); ctx.restore();
      // bow wave
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 + 0.3 * Math.sin(tm * 6)) + ')'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-B * 0.55, -L / 2 + 14); ctx.quadraticCurveTo(0, -L / 2 - 6, B * 0.55, -L / 2 + 14); ctx.stroke();
      // superstructure
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-B * 0.38, -L * 0.18, B * 0.76, L * 0.52);
      ctx.fillStyle = '#2b4a72'; for (let y = -L * 0.16; y < L * 0.32; y += 4.5) { ctx.fillRect(-B * 0.36, y, 1.2, 2.6); ctx.fillRect(B * 0.36 - 1.2, y, 1.2, 2.6); }
      ctx.fillStyle = '#d5dde6'; ctx.fillRect(-B / 2 - 1, -L * 0.2, B + 2, 4); // bridge wings
      ctx.fillStyle = '#16263d'; ctx.fillRect(-B * 0.3, -L * 0.195, B * 0.6, 2.2);
      // lifeboats
      ctx.fillStyle = '#ff7a1a'; for (let y = -L * 0.06; y < L * 0.24; y += 9) { rr(ctx, -B * 0.5 - 0.5, y, 3, 7, 1.4); ctx.fill(); rr(ctx, B * 0.5 - 2.5, y, 3, 7, 1.4); ctx.fill(); }
      // funnel
      ctx.fillStyle = '#2b6cb0'; rr(ctx, -3.2, L * 0.2, 6.4, 9, 2.5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-3.2, L * 0.2 + 3, 6.4, 1.6);
      ctx.fillStyle = 'rgba(40,40,40,.55)'; ctx.beginPath(); ctx.arc(0, L * 0.2 + 1.6, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
      sc.pill(ctx, f.x, f.y, f.name, { dy: -Math.max(30, L * 0.5 / mpp * 0.6), size: 11, bg: f.danger ? 'rgba(255,77,94,.85)' : 'rgba(13,19,33,.7)' });
    }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    // ==================================================================== drawing: screen overlay (css px)
    const LCOL = { R: '#ff3b3b', G: '#33ff7a', W: '#fffbe0', Y: '#ffd400' };
    function lightSources() {
      if (S._ls) return S._ls;
      const out = [];
      for (const m of S.marks) if (m.light) out.push({ x: m.x, y: m.y, light: m.light, top: 3 });
      for (const l of venue.lights || []) out.push({ x: l.x, y: l.y, light: l.light, col: l.color, top: 4 });
      for (const b of venue.buoys || []) if (b.light) out.push({ x: b.x, y: b.y, light: b.light, top: 3 });
      if (S.sector) out.push({ x: S.sector.x, y: S.sector.y, light: 'Iso W 4s', sector: true, label: 'Iso WRG 4s', top: 4 });
      out.forEach(o => { o.pl = KOS.Sprites && KOS.Sprites.parseLight ? KOS.Sprites.parseLight(o.light) : null; o.ph = ((o.x * 0.37 + o.y * 0.71) % 6.28) % 1.3; });
      S._ls = out; return out;
    }
    function drawScreen(ctx, sc) {
      if (kind === 'night') drawNight(ctx, sc);
      drawTargetArrow(ctx, sc);
    }
    function drawNight(ctx, sc) {
      const W = sc.w, H = sc.h, bp = sc.worldToScreen(boat.x, boat.y);
      const R = Math.max(70, 22 / sc.mpp);
      const g = ctx.createRadialGradient(bp.x, bp.y, R * 0.2, bp.x, bp.y, R * 1.7);
      g.addColorStop(0, 'rgba(4,8,26,0.42)'); g.addColorStop(1, 'rgba(4,8,26,0.9)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // a few stars' reflections twinkling on the water
      ctx.fillStyle = 'rgba(200,220,255,.35)';
      for (let i = 0; i < 40; i++) { const x = (i * 197.3 + sc.camera.x * 0.0) % W, y = (i * 113.7) % H; if (Math.sin(sc.t * 2 + i) > 0.6) ctx.fillRect(x, y, 1.5, 1.5); }
      ctx.globalCompositeOperation = 'lighter';
      const labels = [];
      for (const L of lightSources()) {
        const p = sc.worldToScreen(L.x, L.y);
        if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;
        const col = L.sector ? LCOL[S.sectorCol] : LCOL[L.col] || (L.pl ? LCOL[L.pl.col] : LCOL.W);
        const on = L.pl ? KOS.Sprites.lightLevel(L.pl, sc.t + L.ph) : 1;
        const py = p.y - L.top / sc.mpp * 0.4;
        if (on) {
          const r = L.sector ? 34 : 24;
          const gg = ctx.createRadialGradient(p.x, py, 0, p.x, py, r);
          gg.addColorStop(0, col); gg.addColorStop(0.18, hexA(col, 0.75)); gg.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, py, r, 0, TAU); ctx.fill();
          const rg = ctx.createLinearGradient(0, py, 0, py + 70);
          rg.addColorStop(0, hexA(col, 0.4)); rg.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(p.x, py + 34, 3.5 + Math.sin(sc.t * 3 + L.x) * 1, 36, 0, 0, TAU); ctx.fill();
        } else if (easy) { ctx.fillStyle = hexA(col, 0.18); ctx.beginPath(); ctx.arc(p.x, py, 4, 0, TAU); ctx.fill(); }
        const near = Math.hypot(L.x - boat.x, L.y - boat.y) < 170;
        if (easy || (!pro && near)) labels.push({ x: p.x, y: py + 18, txt: L.label || L.light, col });
      }
      // own navigation lights: red port, green starboard, white stern
      const h = boat.heading, Lb = cls.length, f = U.vec(h), r = P2(Math.cos(h), Math.sin(h));
      [[0.4, -0.5, LCOL.R], [0.4, 0.5, LCOL.G], [-0.5, 0, LCOL.W]].forEach(q => {
        const wx = boat.x + f.x * Lb * q[0] + r.x * q[1], wy = boat.y + f.y * Lb * q[0] + r.y * q[1], p = sc.worldToScreen(wx, wy);
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12); gg.addColorStop(0, q[2]); gg.addColorStop(1, hexA(q[2], 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, TAU); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '800 11px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const l of labels) { const w = ctx.measureText(l.txt).width + 10; ctx.fillStyle = 'rgba(5,10,25,.65)'; rr(ctx, l.x - w / 2, l.y - 8, w, 16, 8); ctx.fill(); ctx.fillStyle = l.col; ctx.fillText(l.txt, l.x, l.y + 0.5); }
    }
    function hexA(hex, a) { return KOS.Sprites && KOS.Sprites.rgba ? KOS.Sprites.rgba(hex, a) : hex; }
    function drawTargetArrow(ctx, sc) {
      if (S.phase === 'intro' || S.phase === 'brief' || S.phase === 'quiz' || S.phase === 'done') return;
      const tg = target(); if (!tg) return;
      const color = kind === 'night' ? '#fffbe0' : '#ffb547';
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, H = sc.h;
      const hb = hud.el.getBoundingClientRect(), land = H < 500;
      const m = { l: land ? 150 : 34, r: land ? 150 : 34, t: Math.max(60, hb.bottom + 34), b: land ? 60 : W < 700 ? 190 : 130 };
      const d = Math.round(Math.hypot(tg.x - boat.x, tg.y - boat.y));
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < H - m.b) {
        const by = p.y - 40 - Math.abs(Math.sin(sc.t * 4)) * 8;
        ctx.fillStyle = color; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 10, by - 8); ctx.lineTo(p.x + 10, by - 8); ctx.lineTo(p.x, by + 4); ctx.closePath(); ctx.stroke(); ctx.fill();
        return;
      }
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const s = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? H - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * s, ay = cy + dy * s, ang = Math.atan2(dy, dx), pulse = 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillText(d + ' m', ax, ay);
    }

    // ==================================================================== instance
    let introCd = null, coachIntro = null;
    function start() {
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      layoutPanels();
      ambient();
      if (kind === 'buoys' || kind === 'cardinal') { S.phase = 'brief'; briefCard(); return; }
      if (kind === 'night') { S.phase = 'quiz'; quizCard(0); return; }
      const key = kind === 'compass' && pro ? 'compassPro' : kind === 'depth' && pro ? 'depthPro' : kind;
      coachIntro = KOS.UI.coach(t('nav.intro.' + key, { boat: cls.name, d: fmtDec(draft) }) + (touch ? '' : '  ' + t('nav.keys')), { ms: 8500 });
      beginCountdown(true);
    }
    function beginCountdown(skipCoach) {
      if (!skipCoach) {
        const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
        coachIntro = KOS.UI.coach(t('nav.intro.' + kind) + (touch ? '' : '  ' + t('nav.keys')), { ms: 7500 });
      }
      S.phase = 'intro';
      scene.fixedZoom = null;
      introCd = KOS.UI.countdown(host.layer, 3, () => { introCd = null; if (S.phase === 'intro') { S.phase = 'go'; sfx('horn'); legStart(); } });
    }

    function update(dt) {
      env.t += dt;
      wind.update(dt);
      if ((S.windT = (S.windT || 0) + dt) > 2) { S.windT = 0; wind.recenter(boat.x, boat.y); }
      if (S.lane) ferries(dt);
      if (S.phase === 'quiz') quizTick(dt);
      if (S.phase === 'brief' || S.phase === 'quiz' || S.phase === 'intro') {
        const hold = { x: boat.x, y: boat.y, heading: boat.heading, distanceSailed: boat.distanceSailed };
        controls = KOS.Input.toControls(ctrl.state, boat, controls, dt); controls.rudder = 0;
        KOS.Physics.step(boat, controls, env, dt);
        Object.assign(boat, hold);
        if (autopilot && S.phase === 'quiz' && !S.quizAnswered && card && card.opts) card.opts.find(b => b.getAttribute('data-o') === S.quiz[S.quizI].a).click();
        else if (autopilot && card && card.primary) card.primary.click();
        hudTick(dt);
        return;
      }
      const px = boat.x, py = boat.y;
      controls = KOS.Input.toControls(ctrl.state, boat, controls, dt);
      if (easy) controls.autoHike = true;
      if (autopilot) controls = Object.assign(controls, autopilot.think(env, autoPlan(), [boat]));
      KOS.Physics.step(boat, controls, env, dt);
      KOS.Physics.collide([boat], venue, S.marks);
      if (controls.autoTrim) ctrl.setSheet(boat.sheet);
      if (S.phase === 'go') {
        S.time += dt;
        checkStep(px, py);
        if (S.legFrom) S.legDist += Math.hypot(boat.x - px, boat.y - py);
        if (S.rings.length) pickRings();
        if (kind === 'swim') swimZone();
        if (kind === 'depth' && S.guide[S.guideI] && dist(boat, S.guide[S.guideI]) < 24) S.guideI = Math.min(S.guide.length - 1, S.guideI + 1);
        if (kind === 'compass' && (S.accT -= dt) <= 0) {
          S.accT = 0.25;
          const c = courseToSteer();
          if (c != null && Math.abs(boat.speed) > 0.4) { S.accSum += Math.abs(U.angDiff(boat.heading, c)); S.accN++; }
        }
        if ((S.trailT -= dt) <= 0) { S.trailT = 1.5; S.trail.push(P2(boat.x, boat.y)); if (S.trail.length > 160) S.trail.shift(); }
      }
      if (S.sector) sector(dt);
      if (kind === 'depth') sounder(dt);
      for (const s of S.swimmers) { if (s.scare > 0) s.scare -= dt; if (s.vx) s.x += s.vx * dt; }
      for (const p of S.pops) p.t += dt;
      if (S.phase === 'done' && S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      hudTick(dt);
    }

    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt; S.chartT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        const d = { speed: U.kn(Math.abs(boat.speed)), timer: (S.time + S.penalty) * 1000, custom: {} };
        const total = S.steps.length, done = Math.min(S.stepI, total);
        if (kind === 'swim') { d.custom.rings = S.ringsGot + '<small>/' + S.rings.length + '</small>'; d.custom.pen = S.penalty ? '+' + S.penalty + 's' : '0'; }
        else if (kind === 'compass') {
          const st = curStep();
          d.custom.step = Math.min(S.stepI + 1, total) + '<small>/' + total + '</small>';
          d.custom.log = st ? (pro ? Math.round(S.legDist || 0) + '<small>/' + st.len + '</small>' : Math.round(dist(boat, st)) + '<small> m</small>') : '✓';
        } else if (kind === 'depth') {
          const uk = S.uk != null ? S.uk : 3;
          d.custom.depth = '<span class="nav-dep ' + (uk < 0.4 ? 'bad' : uk < 1 ? 'low' : 'ok') + '">' + fmtDec(Math.max(0, uk)) + '</span><small> m</small>';
          if (panels.sval) { const v = fmtDec(KOS.World.depthAt(venue, boat.x, boat.y)) + ' m'; if (panels.last.sv !== v) { panels.last.sv = v; panels.sval.textContent = v; } }
        } else d.custom.step = (S.phase === 'done' && S.result && S.result.success ? total : Math.min(done + 1, total)) + '<small>/' + total + '</small>';
        if (kind !== 'swim' && kind !== 'compass') d.custom.lives = S.lives ? '<span class="nav-hearts">' + '♥'.repeat(Math.max(0, S.livesLeft)) + '<i>' + '♥'.repeat(Math.max(0, S.lives - S.livesLeft)) + '</i></span>' : String(S.errors);
        hud.update(d);
        if (S.pathLine) { const tg = target(); if (tg && S.phase !== 'done') { S.pathLine.a.x = boat.x; S.pathLine.a.y = boat.y; S.pathLine.b.x = tg.x; S.pathLine.b.y = tg.y; } else { S.pathLine.b.x = S.pathLine.a.x = boat.x; S.pathLine.b.y = S.pathLine.a.y = boat.y; } }
        if (!controls.autoTrim) ctrl.setIdealSheet(boat.inIrons ? null : KOS.Physics.idealSheet(boat), 0.07);
        if (Math.random() < 0.1) layoutPanels();
      }
      if (S.chartT <= 0) { S.chartT = 0.2; drawChart(); drawSounder(); }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() {
      try { KOS.Audio.ambient({ wind: boat.tws || P.windKn, waves: U.clamp(0.25 + (boat.tws || P.windKn) / 22 + Math.abs(boat.speed) / 12, 0, 1), harbor: P.venue === 'harbor' ? 0.5 : P.venue === 'bay' ? 0.25 : 0.05 }); } catch (e) { /* optional */ }
    }
    function render(alpha) { scene.render(alpha); updateCompass(); }
    function destroy() {
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      window.removeEventListener('keydown', onKey);
      host.layer.removeEventListener('wheel', onWheel);
      host.layer.style.removeProperty('--nav-top');
      if (introCd) introCd.cancel();
      if (coachIntro) coachIntro.close(true);
      if (card) card.el.remove();
      ctrl.detach(); hud.destroy(); panels.wrap.remove(); flashEl.remove();
      scene.destroy();
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function pause() { try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); }
    function onResize() { scene.resize(); applyZoom(); layoutPanels(); S.chartT = 0; }

    // ---- test hooks
    let autopilot = null;
    function setAutopilot(on) { autopilot = on ? KOS.AI.createHelm(boat, { skill: 0.95, seed: 5 }) : null; }
    function autoPlan() {
      const st = curStep();
      if (!st) return { target: { x: boat.x, y: boat.y, r: 1 } };
      if (kind === 'depth') { const g = S.guide[S.guideI] || st; return { target: { x: g.x, y: g.y, r: 1 } }; }
      if (st.type === 'round') { const m = st.m, b = U.heading(boat.x - m.x, boat.y - m.y), q = add(m, U.vec(b + (st.sweep < 0 ? -1.1 : 1.1)), 20); return { target: { x: q.x, y: q.y, r: 1 } }; }
      const a = aimOf(st);
      return { target: { x: a.x, y: a.y, r: 1 } };
    }
    function skipIntro() {
      if (introCd) { introCd.cancel(); introCd = null; }
      if (S.phase === 'quiz' && S.quiz) { while (S.quizN < S.quiz.length) { S.quizN++; S.quizOk++; } }
      if (card) { card.el.remove(); card = null; }
      if (S.phase !== 'go' && S.phase !== 'done') { S.phase = 'go'; legStart(); }
      scene.fixedZoom = null;
    }

    return { start, update, render, destroy, pause, resume, onResize, boat, scene, state: S, ctrl, setAutopilot, skipIntro, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
