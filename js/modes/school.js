// KØS SEJL — js/modes/school.js
// The 'school' mode: Sejlerskolen. Guided lessons in Svanemøllebugten (venue 'bay', hub area 'school') with coach Storm,
// ghost hints (heading zones, turn arrows, target rings, edge arrows) and success checks per step.
//
// A lesson = a start position + marks + a list of steps. Every step has:
//   say/task strings (school.l.<lesson>.<step>.say|task), enter(), tick(dt) → progress 0..1 (≥ 1 = done),
//   optional target() (ring + edge arrow), zone() (green heading sector), turn() (curved turn arrow), hl (control to
//   highlight), par (seconds, for the stars), track() (precision: fraction of time the condition holds), auto() (test bot).
// Stars = time vs. par (KOS.SailMode.starsFor) − 1 for grounding − 1 for too many mistakes. Distances scale with the
// boat's speed (kD) so every class gets the same lesson in about the same time.
//
// Activity params: lesson (id below), windDeg, windKn, gust, shift, seed.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const TAU = Math.PI * 2;
  const R = d => d * Math.PI / 180;

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    school: {
      card: { lesson: 'Lektion {n}', school: 'Sejlerskolen', learn: 'Det lærer du', go: 'Sejl!',
        keys: 'Tastatur: ←/→ styr · ↑/↓ skøde · Mellemrum hæng ud · Enter start' },
      panel: { step: 'Trin {n}/{m}', lesson: 'Lektion {n}' },
      btn: { call: 'Råb' },
      hud: { step: 'Trin' },
      dia: { nogo: 'Vindøjet', close: 'Bidevind', beam: 'Halvvind', broad: 'Slør', run: 'Læns', wind: 'Vind' },
      side: { left: 'venstre', right: 'højre' },
      mobName: 'Bobby',
      praise: ['Godt!', 'Flot!', 'Sådan!', 'Super!', 'Perfekt!', 'Yes!', 'Mega godt!'],
      fx: { stop: 'Stop!', tack: 'Vending!', gybe: 'Bomning!', ground: 'Grundstødning!', mob: 'Mand over bord!',
        saved: 'Reddet!', fast: 'For stærkt!', flat: 'Flad båd!', plane: 'Planing!', gust: 'Pust!', mark: 'Mærke {n}!',
        start: 'Start!', buoy: 'Bøje!', edge: 'Kanten!', free: 'Fri!', hoist: 'Gennaker!', oops: 'Ups!', irons: 'Vindøjet!' },
      call: { tack: 'Klar til at vende?', gybe: 'Klar til at bomme?', ready: 'Klar!', tacking: 'Ror i læ!', gybing: 'Bom over!' },
      tip: {
        irons: 'Du ligger i vindøjet! Hold roret til den ene side, så falder båden af.',
        straighten: 'Båden sejler fremad nu – ret roret op, ellers drejer du tilbage i vindøjet!',
        ironsTack: 'Du gik i stå i vindøjet. Drej lidt hurtigere igennem – og hav god fart på inden vendingen.',
        ground: 'Av, grundt vand! Styr ud mod det mørkere vand.',
        luff: 'Sejlet blafrer – hal skødet lidt ind.',
        stall: 'Skødet er for stramt – fier lidt ud, så kører båden hurtigere.',
        heel: 'Båden krænger! Hæng ud – hold HÆNG UD eller mellemrum.',
        gust: 'Mørkt vand = vindpust! Gør dig klar til at hænge ud.',
        backwards: 'Båden sejler baglæns – så virker roret omvendt!',
        capsize: 'Plask – kæntret! Båden bliver rejst om lidt. Næste gang: hæng ud og fier i pustene.',
        wild: 'Hov, det var en vild bomning! Drej roligere – og hal gerne skødet lidt ind først.',
        mobFast: 'For stærkt! Luf op mod vinden for at bremse.',
        mobDown: 'Reddet! Men næste gang: kom op til ham med vinden skråt forfra, så kan du bremse.',
        callFirst: 'Husk at råbe først, så mandskabet er klar!',
        collapse: 'Gennakeren klapper sammen – luf lidt op!',
        autoOff: 'I denne lektion trimmer du selv – AUTO er slået fra.',
        wrongWay: 'Hov – rundt om B skal du den modsatte vej af A.',
        wrongSide: 'Mærket skal rundes om bagbord – altså med mærket på din venstre side.',
        outside: 'Uden for ringen! Fald af, få lidt fart og prøv igen.',
        precision: 'Det gik – men prøv at holde kursen mere præcist næste gang.',
        spiGennaker: 'Tip: hejs gennakeren (E) for endnu mere fart!',
      },
      res: {
        great: 'Perfekt lektion på {time}! Træner Storm giver dig en high five.',
        good: 'Godt sejlet – lektionen er klaret på {time}. Prøv igen for alle tre stjerner!',
        ok: 'Lektionen er klaret! Øv dig lidt mere, så bliver det endnu bedre.',
      },
      stat: { mistakes: 'Fejl', grounds: 'Grundstødninger', precision: 'Præcision', steps: 'Trin klaret' },
      l: {
        steer: {
          intro: 'Du lærer at styre båden og at stoppe den. Det smarte trick: drej op mod vinden – så blafrer sejlet, og båden bremser helt af sig selv.',
          buoy: { say: 'Hej, jeg er Storm, ungdomstræner i KØS! Styr hen til den orange bøje – tryk til venstre og højre for at dreje.', task: 'Sejl hen til bøje 1' },
          stop: { say: 'Stop inde i ringen! Luf op: drej snuden op mod vinden, så blafrer sejlet, og båden bremser.', task: 'Luf op og stop i ringen' },
          go: { say: 'Flot stop! Fald af igen – drej væk fra vinden, til sejlet fylder – og sejl hen til bøje 2.', task: 'Fald af og sejl til bøje 2' },
        },
        beam: {
          intro: 'Halvvind betyder, at vinden kommer lige ind fra siden. Det er den nemmeste kurs – perfekt til at sejle frem og tilbage.',
          set: { say: 'Styr, så vinden kommer lige ind fra siden. Læg båden i det grønne felt, og hold kursen.', task: 'Hold halvvind i 3 sek.' },
          sail: { say: 'Super! Bliv på halvvind hele vejen hen til bøjen.', task: 'Sejl halvvind til bøjen' },
          back: { say: 'Vend rundt, og sejl halvvind hjem til den gule startbøje. Nu kommer vinden ind fra den anden side.', task: 'Halvvind hjem til start' },
        },
        beat: {
          intro: 'Lige op mod vinden kan ingen sejlbåd sejle – det kaldes vindøjet (det røde felt). Men tæt på kanten kan du sejle bidevind og krydse dig op mod vinden.',
          edge: { say: 'Luf langsomt op mod vinden, indtil sejlet begynder at blafre. Dér starter vindøjet!', task: 'Luf op til sejlet blafrer' },
          fill: { say: 'Fald en lille smule af, så sejlet fylder igen. Hold båden lige på kanten af vindøjet.', task: 'Hold bidevind i 5 sek.' },
          go: { say: 'Sådan sejler man bidevind! Sejl op til bøjen – helt tæt på vindøjet, uden at vende.', task: 'Bidevind op til bøjen' },
        },
        tack: {
          intro: 'For at komme op mod vinden sejler du zigzag: bidevind til den ene side, en vending, og bidevind til den anden. Det hedder at krydse.',
          t1: { say: 'Klar til at vende? Drej op gennem vinden – hele vejen over, til sejlet fylder på den anden side. Følg den buede pil!', task: 'Lav en vending' },
          t2: { say: 'Flot vending! Få farten op igen, og vend tilbage.', task: 'Vend tilbage igen' },
          mark: { say: 'Nu kan du krydse! Kryds op til bøjen – vend så mange gange du vil.', task: 'Kryds op til bøjen' },
        },
        downwind: {
          intro: 'Når vinden kommer bagfra, sejler du slør (skråt bagfra) eller læns (lige bagfra). Så skal sejlet ud på tværs af båden.',
          broad: { say: 'Fald af – drej væk fra vinden, til den kommer skråt bagfra. Sejlet går ud. Nu sejler du slør!', task: 'Hold slør i 3 sek.' },
          run: { say: 'Fald endnu mere af, til vinden kommer lige agterfra. Det er læns – stille og roligt.', task: 'Hold læns i 3 sek.' },
          mark: { say: 'Læns ned til bøjen. Pas på: drejer du for langt, slår bommen over!', task: 'Læns ned til bøjen' },
        },
        gybe: {
          intro: 'At bomme er at skifte side med vinden bagfra. Bommen fejer hen over båden – så gør det roligt, og husk at dukke dig!',
          run: { say: 'Sejl læns – med vinden lige agterfra.', task: 'Sejl læns i 2 sek.' },
          g1: { say: 'Klar til at bomme? Styr roligt lidt videre, til vinden kommer ind fra den anden side, og bommen svinger over. Duk dig!', task: 'Bom roligt' },
          g2: { say: 'Flot bomning! Bom tilbage igen – lige så roligt.', task: 'Bom tilbage' },
          mark: { say: 'Du kan bomme! Sejl ned til bøjen.', task: 'Sejl til bøjen' },
        },
        irons: {
          intro: 'Peger snuden lige op i vinden, står båden helt stille – den ligger i vindøjet. Bare rolig: her lærer du at komme fri.',
          o1: { say: 'Øv, du ligger i vindøjet! Hold roret til den ene side og vent – så drejer båden, og sejlet fylder igen.', task: 'Kom ud af vindøjet' },
          o2: { say: 'Godt! Jeg skubber dig tilbage i vindøjet. Kom fri igen – men denne gang ved at dreje mod {side}.', task: 'Drej mod {side} og kom fri' },
          go: { say: 'Du er fri! Sejl halvvind hen til bøjen.', task: 'Halvvind til bøjen' },
        },
        trim: {
          intro: 'Skødet er tovet, der styrer sejlet. Hal ind, og sejlet kommer ind – fier ud, og det går ud. Sejlet trækker bedst, når det lige akkurat ikke blafrer.',
          beam: { say: 'Nu trimmer du selv! Sejlet blafrer – hal skødet ind, til det lige holder op. Grønt felt = perfekt trim.', task: 'Trim på halvvind i 3 sek.' },
          broad: { say: 'Fald af til slør. Vinden kommer mere bagfra, så skødet skal fieres ud!', task: 'Fald af og fier ud' },
          close: { say: 'Luf op til bidevind, og hal skødet helt hjem.', task: 'Luf op og hal hjem' },
        },
        hike: {
          intro: 'De mørke pletter på vandet er vindpust. Når et pust rammer, krænger båden. Hæng ud over kanten, så holder du den flad – og en flad båd er en hurtig båd!',
          h: { say: 'Hold HÆNG UD-knappen (eller mellemrum). Så læner du dig ud over kanten.', task: 'Hæng ud i 2 sek.' },
          gusts: { say: 'Sejl til de 3 bøjer. Se efter mørkt vand – når pustet rammer, så hæng ud!', task: 'Bøjer {n}/3 – hold båden flad' },
        },
        mob: {
          intro: 'Falder nogen i vandet, skal du holde øje med dem, vende roligt og sejle tilbage med vinden skråt forfra – så kan du bremse lige ved siden af.',
          alarm: { say: 'MAND OVER BORD! Bobby er faldet i. Peg på ham, og vend båden rundt mod ham.', task: 'Vend om mod Bobby' },
          pick: { say: 'Sejl op til Bobby med vinden skråt forfra – og luf op, så du står stille lige ved siden af ham.', task: 'Stop ved siden af Bobby' },
        },
        eight: {
          intro: 'Et ottetal om to bøjer er klassisk sejlerskole-træning. Du får brug for det hele: halvvind, vending, bomning – og at styre præcist.',
          a: { say: 'Sejl hele vejen rundt om den gule bøje A. Følg den stiplede bane.', task: 'Rundt om bøje A' },
          b: { say: 'Nu hele vejen rundt om bøje B – den modsatte vej. Så tegner du et 8-tal!', task: 'Rundt om B – modsat vej' },
          mid: { say: 'Næsten! Afslut gennem midten mellem bøjerne.', task: 'Sejl gennem midten' },
        },
        triangle: {
          intro: 'Din første rigtige bane: over startlinjen, kryds op til mærke 1, slør over til mærke 2 og hjem over linjen. Rund mærkerne om bagbord – med mærket på din venstre side.',
          start: { say: 'Sejl over startlinjen mellem bøjen og dommerbåden.', task: 'Over startlinjen' },
          m1: { say: 'Kryds op til mærke 1, og rund det om bagbord.', task: 'Rund mærke 1 om bagbord' },
          m2: { say: 'Fald af, og sejl slør til mærke 2 – også om bagbord.', task: 'Rund mærke 2 om bagbord' },
          fin: { say: 'Sidste ben! Hjem over mållinjen.', task: 'Over mållinjen' },
        },
        feva: {
          intro: 'RS Feva har en gennaker – et stort, farvestrålende forsejl til slør. Den giver masser af ekstra fart, men skal hejses og tages ned på det rigtige tidspunkt.',
          bear: { say: 'Fald af til slør – gennakeren virker kun, når vinden kommer skråt bagfra.', task: 'Fald af til slør' },
          hoist: { say: 'Hejs gennakeren! Tryk på GENNAKER-knappen (eller E).', task: 'Hejs gennakeren' },
          fly: { say: 'Wow, mærk farten! Sejl slør hen til bøjen. Falder du for langt af, klapper gennakeren sammen.', task: 'Slør til bøjen med gennaker' },
          drop: { say: 'Tag gennakeren ned igen – tryk på knappen.', task: 'Tag gennakeren ned' },
          luff: { say: 'Luf op til bidevind – nu er båden klar til næste kryds.', task: 'Luf op til bidevind' },
        },
        skiff: {
          intro: '29\'eren er en lynhurtig skiff. Gasten står ude i trapezen og holder båden flad – og når farten kommer op, planer båden oven på vandet.',
          trap: { say: 'Ud i trapezen! Hold HÆNG UD, så gasten hænger helt ude over vandet. Hold båden flad.', task: 'Ud i trapezen i 2 sek.' },
          plane: { say: 'Fald lidt af, og hold båden flad – så kommer den op og planer. Hold den i planing!', task: 'Plan i 4 sek.' },
          blast: { say: 'Wiii! Plan hele vejen hen til bøjen.', task: 'Plan hen til bøjen' },
        },
        keel: {
          intro: 'På en J/70 er I fire om bord. Godt mandskabsarbejde er at råbe tydeligt, sidde rigtigt og gøre tingene samtidig.',
          rail: { say: 'Alle mand op på kanten! Hold HÆNG UD, mens I sejler bidevind.', task: 'På kanten – bidevind i 3 sek.' },
          tack: { say: 'Før en vending råber rorsmanden: »Klar til at vende?« Tryk RÅB – og vend så.', task: 'Råb og vend ({n}/2)' },
          hoist: { say: 'Fald af til slør, og hejs gennakeren.', task: 'Slør med gennaker i 3 sek.' },
          gybe: { say: 'Nu en bomning med gennakeren oppe. Råb først: »Klar til at bomme?«', task: 'Råb og bom' },
          drop: { say: 'Tag gennakeren ned, og luf op til bidevind.', task: 'Gennaker ned – bidevind' },
        },
      },
    },
  });
  KOS.I18n.add('en', {
    school: {
      card: { lesson: 'Lesson {n}', school: 'Sailing school', learn: 'You will learn', go: 'Sail!',
        keys: 'Keyboard: ←/→ steer · ↑/↓ sheet · Space hike · Enter start' },
      panel: { step: 'Step {n}/{m}', lesson: 'Lesson {n}' },
      btn: { call: 'Call' },
      hud: { step: 'Step' },
      dia: { nogo: 'No-go', close: 'Close-hauled', beam: 'Beam reach', broad: 'Broad reach', run: 'Run', wind: 'Wind' },
      side: { left: 'the left', right: 'the right' },
      mobName: 'Bobby',
      praise: ['Good!', 'Nice!', 'That\'s it!', 'Super!', 'Perfect!', 'Yes!', 'Awesome!'],
      fx: { stop: 'Stop!', tack: 'Tack!', gybe: 'Gybe!', ground: 'Aground!', mob: 'Man overboard!',
        saved: 'Rescued!', fast: 'Too fast!', flat: 'Flat boat!', plane: 'Planing!', gust: 'Gust!', mark: 'Mark {n}!',
        start: 'Start!', buoy: 'Buoy!', edge: 'The edge!', free: 'Free!', hoist: 'Gennaker!', oops: 'Oops!', irons: 'In irons!' },
      call: { tack: 'Ready about?', gybe: 'Ready to gybe?', ready: 'Ready!', tacking: 'Lee-ho!', gybing: 'Gybe-ho!' },
      tip: {
        irons: 'You are in irons! Hold the helm to one side and the bow will fall off.',
        straighten: 'The boat is moving forwards now – straighten the helm, or you will turn back into irons!',
        ironsTack: 'You got stuck in irons. Turn through a bit faster – and have good speed before the tack.',
        ground: 'Ouch, shallow water! Steer towards the darker water.',
        luff: 'The sail is flapping – sheet in a little.',
        stall: 'The sheet is too tight – ease a little and the boat goes faster.',
        heel: 'The boat is heeling! Hike out – hold HIKE or Space.',
        gust: 'Dark water = a gust! Get ready to hike out.',
        backwards: 'The boat is going backwards – so the helm works the other way round!',
        capsize: 'Splash – capsized! The boat will be righted in a moment. Next time: hike out and ease in the gusts.',
        wild: 'Whoa, that was a wild gybe! Turn more gently – and sheet in a little first.',
        mobFast: 'Too fast! Luff up into the wind to brake.',
        mobDown: 'Rescued! But next time: come up to him with the wind at an angle from ahead, so you can brake.',
        callFirst: 'Remember to call first so the crew is ready!',
        collapse: 'The gennaker is collapsing – luff up a little!',
        autoOff: 'In this lesson you trim yourself – AUTO is switched off.',
        wrongWay: 'Oops – go round B the opposite way to A.',
        wrongSide: 'Leave the mark to port – that is, with the mark on your left.',
        outside: 'Outside the ring! Bear away, pick up some speed and try again.',
        precision: 'Done – but try to hold your course more precisely next time.',
        spiGennaker: 'Tip: hoist the gennaker (E) for even more speed!',
      },
      res: {
        great: 'Perfect lesson in {time}! Coach Storm gives you a high five.',
        good: 'Well sailed – lesson done in {time}. Try again for all three stars!',
        ok: 'Lesson done! Practise a bit more and it will get even better.',
      },
      stat: { mistakes: 'Mistakes', grounds: 'Groundings', precision: 'Precision', steps: 'Steps done' },
      l: {
        steer: {
          intro: 'Learn to steer the boat and to stop it. The clever trick: turn up into the wind – the sail flaps and the boat brakes all by itself.',
          buoy: { say: 'Hi, I\'m Storm, youth coach at KØS! Steer to the orange buoy – press left and right to turn.', task: 'Sail to buoy 1' },
          stop: { say: 'Stop inside the ring! Luff up: turn the bow into the wind, the sail flaps and the boat slows down.', task: 'Luff up and stop in the ring' },
          go: { say: 'Great stop! Bear away again – turn away from the wind until the sail fills – and sail to buoy 2.', task: 'Bear away and sail to buoy 2' },
        },
        beam: {
          intro: 'A beam reach means the wind comes straight in from the side. It is the easiest course – perfect for sailing back and forth.',
          set: { say: 'Steer so the wind comes straight in from the side. Put the boat in the green zone and hold your course.', task: 'Hold a beam reach for 3 sec' },
          sail: { say: 'Super! Stay on a beam reach all the way to the buoy.', task: 'Beam reach to the buoy' },
          back: { say: 'Turn around and beam-reach home to the yellow start buoy. Now the wind comes from the other side.', task: 'Beam reach back to start' },
        },
        beat: {
          intro: 'No sailing boat can sail straight into the wind – that is the no-go zone (the red wedge). But close to its edge you can sail close-hauled and beat your way upwind.',
          edge: { say: 'Slowly luff up towards the wind until the sail starts to flap. That is where the no-go zone begins!', task: 'Luff up until the sail flaps' },
          fill: { say: 'Bear away just a little so the sail fills again. Keep the boat right on the edge of the no-go zone.', task: 'Hold close-hauled for 5 sec' },
          go: { say: 'That\'s close-hauled! Sail up to the buoy – close to the no-go zone, without tacking.', task: 'Close-hauled to the buoy' },
        },
        tack: {
          intro: 'To get upwind you sail a zigzag: close-hauled one way, a tack, and close-hauled the other way. That is called beating.',
          t1: { say: 'Ready to tack? Turn up through the wind – all the way over until the sail fills on the other side. Follow the curved arrow!', task: 'Do a tack' },
          t2: { say: 'Nice tack! Build your speed again and tack back.', task: 'Tack back again' },
          mark: { say: 'Now you can beat! Beat up to the buoy – tack as often as you like.', task: 'Beat up to the buoy' },
        },
        downwind: {
          intro: 'When the wind comes from behind you sail a broad reach (from behind at an angle) or a run (straight from behind). Then the sail goes right out across the boat.',
          broad: { say: 'Bear away – turn away from the wind until it comes from behind at an angle. The sail goes out. Now you are on a broad reach!', task: 'Hold a broad reach for 3 sec' },
          run: { say: 'Bear away even more until the wind is right behind you. That is a run – nice and easy.', task: 'Hold a run for 3 sec' },
          mark: { say: 'Run down to the buoy. Careful: turn too far and the boom swings across!', task: 'Run down to the buoy' },
        },
        gybe: {
          intro: 'Gybing is changing sides with the wind behind you. The boom sweeps across the boat – so do it calmly, and remember to duck!',
          run: { say: 'Sail on a run – with the wind straight from behind.', task: 'Run for 2 sec' },
          g1: { say: 'Ready to gybe? Steer calmly a little further until the wind comes from the other side and the boom swings across. Duck!', task: 'Gybe calmly' },
          g2: { say: 'Nice gybe! Gybe back again – just as calmly.', task: 'Gybe back' },
          mark: { say: 'You can gybe! Sail down to the buoy.', task: 'Sail to the buoy' },
        },
        irons: {
          intro: 'With the bow pointing straight into the wind, the boat stops dead – it is in irons. Don\'t worry: here you learn how to get free.',
          o1: { say: 'Oops, you are in irons! Hold the helm to one side and wait – the boat turns and the sail fills again.', task: 'Get out of irons' },
          o2: { say: 'Good! I\'ll push you back into irons. Get free again – but this time by turning to {side}.', task: 'Turn to {side} and get free' },
          go: { say: 'You\'re free! Beam-reach to the buoy.', task: 'Beam reach to the buoy' },
        },
        trim: {
          intro: 'The sheet is the rope that controls the sail. Pull in and the sail comes in – ease out and it goes out. The sail pulls best when it is only just not flapping.',
          beam: { say: 'Now you trim yourself! The sail is flapping – sheet in until it just stops. Green zone = perfect trim.', task: 'Trim on a beam reach for 3 sec' },
          broad: { say: 'Bear away to a broad reach. The wind comes more from behind, so ease the sheet out!', task: 'Bear away and ease out' },
          close: { say: 'Luff up to close-hauled and sheet right in.', task: 'Luff up and sheet in' },
        },
        hike: {
          intro: 'The dark patches on the water are gusts. When a gust hits, the boat heels. Hike out over the side to keep it flat – and a flat boat is a fast boat!',
          h: { say: 'Hold the HIKE button (or Space). That makes you lean out over the side.', task: 'Hike for 2 sec' },
          gusts: { say: 'Sail to the 3 buoys. Watch for dark water – when the gust hits, hike out!', task: 'Buoys {n}/3 – keep her flat' },
        },
        mob: {
          intro: 'If someone falls in, keep your eyes on them, turn calmly and come back with the wind at an angle from ahead – so you can brake right next to them.',
          alarm: { say: 'MAN OVERBOARD! Bobby has fallen in. Point at him and turn the boat round towards him.', task: 'Turn back towards Bobby' },
          pick: { say: 'Sail up to Bobby with the wind at an angle from ahead – and luff up so you stop right next to him.', task: 'Stop next to Bobby' },
        },
        eight: {
          intro: 'A figure of eight round two buoys is classic sailing-school training. You need it all: beam reach, tack, gybe – and precise steering.',
          a: { say: 'Sail all the way round yellow buoy A. Follow the dotted track.', task: 'Round buoy A' },
          b: { say: 'Now all the way round buoy B – the other way. That draws an 8!', task: 'Round B – the other way' },
          mid: { say: 'Almost! Finish through the middle between the buoys.', task: 'Sail through the middle' },
        },
        triangle: {
          intro: 'Your first real course: across the start line, beat up to mark 1, reach over to mark 2 and home across the line. Leave the marks to port – mark on your left.',
          start: { say: 'Sail across the start line between the buoy and the committee boat.', task: 'Cross the start line' },
          m1: { say: 'Beat up to mark 1 and leave it to port.', task: 'Round mark 1 to port' },
          m2: { say: 'Bear away and reach to mark 2 – also to port.', task: 'Round mark 2 to port' },
          fin: { say: 'Last leg! Home across the finish line.', task: 'Cross the finish line' },
        },
        feva: {
          intro: 'The RS Feva has a gennaker – a big, colourful headsail for reaching. It gives loads of extra speed, but must go up and come down at the right moment.',
          bear: { say: 'Bear away to a broad reach – the gennaker only works with the wind from behind at an angle.', task: 'Bear away to a broad reach' },
          hoist: { say: 'Hoist the gennaker! Press the GENNAKER button (or E).', task: 'Hoist the gennaker' },
          fly: { say: 'Wow, feel the speed! Reach to the buoy. Bear away too far and the gennaker collapses.', task: 'Reach to the buoy with gennaker' },
          drop: { say: 'Take the gennaker down again – press the button.', task: 'Drop the gennaker' },
          luff: { say: 'Luff up to close-hauled – now the boat is ready for the next beat.', task: 'Luff up to close-hauled' },
        },
        skiff: {
          intro: 'The 29er is a lightning-fast skiff. The crew stands out on the trapeze to keep it flat – and when the speed builds, the boat planes on top of the water.',
          trap: { say: 'Out on the trapeze! Hold HIKE so the crew hangs right out over the water. Keep the boat flat.', task: 'On the trapeze for 2 sec' },
          plane: { say: 'Bear away a little and keep her flat – she\'ll pop up and plane. Keep her planing!', task: 'Plane for 4 sec' },
          blast: { say: 'Wheee! Plane all the way to the buoy.', task: 'Plane to the buoy' },
        },
        keel: {
          intro: 'On a J/70 there are four of you on board. Good crew work means calling clearly, sitting in the right place and doing things together.',
          rail: { say: 'Everyone up on the rail! Hold HIKE while you sail close-hauled.', task: 'On the rail – close-hauled 3 sec' },
          tack: { say: 'Before a tack the helm calls: "Ready about?" Press CALL – then tack.', task: 'Call and tack ({n}/2)' },
          hoist: { say: 'Bear away to a broad reach and hoist the gennaker.', task: 'Broad reach with gennaker 3 sec' },
          gybe: { say: 'Now a gybe with the gennaker up. Call first: "Ready to gybe?"', task: 'Call and gybe' },
          drop: { say: 'Drop the gennaker and luff up to close-hauled.', task: 'Gennaker down – close-hauled' },
        },
      },
    },
  });

  // ======================================================================== 2. activities
  const BOAT_STARS = (KOS.App && KOS.App.BOAT_STARS) || { opti: 0, tera: 6, feva: 15, zest: 25, ilca: 40, '29er': 55, hboat: 70, j70: 90, rib: 20 };
  // [lesson, icon, minutes, difficulty, title {da,en}, desc {da,en}, params, boat]
  const LESSONS = [
    ['steer', 'school', 2, 1, { da: 'Styr og stop', en: 'Steer & stop' },
      { da: 'Lær at styre – og at stoppe ved at luffe op mod vinden.', en: 'Learn to steer – and to stop by luffing up into the wind.' },
      { windDeg: 0, windKn: 7, gust: 0.15 }],
    ['beam', 'pos', 2, 1, { da: 'Halvvind', en: 'Beam reach' },
      { da: 'Sejl med vinden lige ind fra siden – ud til bøjen og hjem igen.', en: 'Sail with the wind straight from the side – out to the buoy and back.' },
      { windDeg: 0, windKn: 8, gust: 0.15 }],
    ['beat', 'compass', 2, 2, { da: 'Bidevind', en: 'Close-hauled' },
      { da: 'Find kanten af vindøjet – og sejl så tæt på vinden som muligt.', en: 'Find the edge of the no-go zone – and sail as close to the wind as you can.' },
      { windDeg: 0, windKn: 8, gust: 0.15 }],
    ['tack', 'tack', 3, 2, { da: 'Vending', en: 'Tacking' },
      { da: 'Drej op gennem vinden – og kryds op til en bøje.', en: 'Turn up through the wind – and beat up to a buoy.' },
      { windDeg: 0, windKn: 8, gust: 0.15 }],
    ['downwind', 'sail', 2, 2, { da: 'Slør og læns', en: 'Broad reach & run' },
      { da: 'Sejl med vinden bagfra – og få sejlet helt ud.', en: 'Sail with the wind behind you – and let the sail right out.' },
      { windDeg: 0, windKn: 8, gust: 0.15 }],
    ['gybe', 'wind', 3, 2, { da: 'Bomning', en: 'Gybing' },
      { da: 'Skift side med vinden bagfra – roligt og sikkert.', en: 'Change sides with the wind behind you – calmly and safely.' },
      { windDeg: 0, windKn: 9, gust: 0.15 }],
    ['irons', 'help', 2, 2, { da: 'Ud af vindøjet', en: 'Out of irons' },
      { da: 'Står du stille med snuden op i vinden? Sådan kommer du fri.', en: 'Stuck with the bow into the wind? Here\'s how to get free.' },
      { windDeg: 0, windKn: 8, gust: 0.1 }],
    ['trim', 'gauge', 3, 3, { da: 'Trim sejlet', en: 'Trim the sail' },
      { da: 'Hal ind og fier ud – find selv det perfekte trim uden AUTO.', en: 'Sheet in and ease out – find the perfect trim yourself, without AUTO.' },
      { windDeg: 0, windKn: 8, gust: 0.15 }],
    ['hike', 'heel', 3, 3, { da: 'Hæng ud i pustene', en: 'Hike in the gusts' },
      { da: 'Hold båden flad, når de mørke vindpust rammer.', en: 'Keep the boat flat when the dark gusts hit.' },
      { windDeg: 0, windKn: 12, gust: 0.9 }],
    ['mob', 'life', 3, 3, { da: 'Mand over bord', en: 'Man overboard' },
      { da: 'Bobby er faldet i! Vend om, og stop lige ved siden af ham.', en: 'Bobby fell in! Turn back and stop right next to him.' },
      { windDeg: 0, windKn: 8, gust: 0.15 }],
    ['eight', 'buoy', 4, 3, { da: 'Ottetal', en: 'Figure of eight' },
      { da: 'Sejl et 8-tal om to bøjer – med vending og bomning.', en: 'Sail a figure of eight round two buoys – with a tack and a gybe.' },
      { windDeg: 0, windKn: 8, gust: 0.2 }],
    ['triangle', 'flag', 5, 4, { da: 'Trekantsbanen', en: 'The triangle' },
      { da: 'Din første bane: start, kryds, slør og mål. Mærkerne om bagbord.', en: 'Your first course: start, beat, reach and finish. Marks to port.' },
      { windDeg: 240, windKn: 9, gust: 0.35, shift: 0.15 }],
    ['feva', 'sail', 3, 3, { da: 'Gennaker op og ned · RS Feva', en: 'Gennaker up & down · RS Feva' },
      { da: 'Hejs gennakeren på slør, flyv mod bøjen – og tag den ned i tide.', en: 'Hoist the gennaker on a reach, fly to the buoy – and drop it in time.' },
      { windDeg: 0, windKn: 10, gust: 0.25 }, 'feva'],
    ['skiff', 'speed', 3, 4, { da: 'Trapez og planing · 29er', en: 'Trapeze & planing · 29er' },
      { da: 'Ud i trapezen, hold båden flad – og plan afsted over vandet.', en: 'Out on the trapeze, keep her flat – and plane away across the water.' },
      { windDeg: 0, windKn: 13, gust: 0.35 }, '29er'],
    ['keel', 'whistle', 4, 4, { da: 'Mandskabsarbejde · J/70', en: 'Crew work · J/70' },
      { da: 'Råb »Klar til at vende?«, sid på kanten, og sejl med gennaker som et rigtigt hold.', en: 'Call "Ready about?", sit on the rail and sail with the gennaker like a real team.' },
      { windDeg: 0, windKn: 11, gust: 0.25 }, 'j70'],
  ];
  const acts = LESSONS.map((L, i) => {
    const id = 'school.' + L[0], prev = i ? 'school.' + LESSONS[i - 1][0] : null, boat = L[7] || null;
    const unlock = !prev ? null : boat ? { after: prev, stars: BOAT_STARS[boat] || 0 } : { after: prev };
    return {
      id, mode: 'school', area: 'school', order: (i + 1) * 10, boat, icon: L[1], minutes: L[2], difficulty: L[3], unlock,
      title: L[4], desc: L[5], params: Object.assign({ lesson: L[0], n: i + 1, seed: 100 + i * 7 }, L[6]),
    };
  });
  KOS.Activities.add(acts);

  // ======================================================================== 3. the mode
  KOS.Modes.register('school', { kind: 'sea', create(host, activity) { return createSchool(host, activity); } });

  function createSchool(host, activity) {
    const P = Object.assign({ lesson: 'steer', n: 1, windDeg: 0, windKn: 8, gust: 0.15, shift: 0, seed: 3 }, activity.params || {});
    const assist = host.assist || 'easy';
    const easy = assist === 'easy', pro = assist === 'pro';
    const venue = KOS.World.get('bay');
    let clsId = activity.boat || host.boat;
    if (!KOS.Boats.get(clsId) || KOS.Boats.get(clsId).motor) clsId = 'opti';
    const cls = KOS.Boats.get(clsId);
    const profile = host.profile || {};
    const WD = U.rad(P.windDeg);
    const C = { x: P.cx != null ? P.cx : -80, y: P.cy != null ? P.cy : -700 };   // the school area, open water north of the mole
    const beamKn = cls.polar(Math.PI / 2, P.windKn);
    const beamMs = U.ms(beamKn);
    const kD = U.clamp(beamKn / 4.5, 1, 2.2);           // lesson distances grow with the boat's speed
    const UP = U.vec(WD), RT = U.vec(WD + Math.PI / 2);
    const at = (u, r) => ({ x: C.x + (UP.x * u + RT.x * r) * kD, y: C.y + (UP.y * u + RT.y * r) * kD });
    const H = twaDeg => U.wrapPi(WD - R(twaDeg));        // heading for a signed true wind angle (+ = starboard tack)
    const ngD = U.deg(cls.noGo);
    const tol = easy ? 8 : pro ? 0 : 4;                   // degrees of slack on the point-of-sail checks
    const ringK = easy ? 1.35 : pro ? 0.8 : 1;            // target ring size
    const heelLimit = cls.canCapsize ? cls.capsizeHeel * 0.62 : R(cls.maxHeel || 30) * 0.72;
    // hiking lessons judge 'flat' much tighter: un-hiked a dinghy sits at ~15-25 deg in these gusts, hiked ~0-10 deg
    const hikeFlat = R((cls.optHeel || 6) + (cls.hikeRight || 20) * 0.4);
    const SM = KOS.SailMode || {};
    const starsFor = SM.starsFor || ((r, a) => { const th = a === 'easy' ? [1.35, 1.9] : a === 'pro' ? [1.0, 1.4] : [1.15, 1.6]; return r <= th[0] ? 3 : r <= th[1] ? 2 : 1; });
    const legSpeed = SM.legSpeed || ((c, tws, a) => U.ms(c.polar(Math.max(a, c.noGo + 0.1), tws)) * 0.8);

    // ---- wind: light gusts in the early lessons, a small gust area that follows the boat
    const wind = KOS.Wind.create({ dir: WD, speed: P.windKn, gust: P.gust, shift: P.shift || 0, seed: P.seed,
      bounds: { x0: C.x - 300, y0: C.y - 300, x1: C.x + 300, y1: C.y + 300 } });
    for (let i = 0; i < 160; i++) wind.update(0.5);
    const env = { wind, venue, assist, t: 0 };

    const boat = KOS.Physics.createBoat(clsId, {
      x: C.x, y: C.y, heading: 0, isPlayer: true,
      sailNo: profile.sailNo ? 'DEN ' + profile.sailNo : 'DEN 1', name: profile.name || '',
      colors: profile.boatColor && !cls.keel ? { hull: profile.boatColor } : undefined,
    });

    const S = {
      phase: 'card', time: 0, idx: -1, step: null, wait: 0, par: 0, err: 0, grounds: 0, groundCd: 0,
      tips: {}, tipT: -99, hudT: 0, ambT: 0, windT: 0, finishT: -1, result: null, praiseI: 0,
      prec: [], marks: [], rings: [], dummy: null, call: null, reply: null, luffT: 0, gustOn: false, done: 0,
      stepFlash: 0,
    };

    // ==================================================================== geometry helpers
    function okSpot(x, y, margin) {
      if (KOS.World.isSolid(venue, x, y)) return false;
      if (KOS.World.depthAt(venue, x, y) < (cls.draft || 0.8) + 0.3) return false;
      if (KOS.World.inZone && KOS.World.inZone(venue, x, y, 'swim')) return false;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, px = x + Math.cos(a) * margin, py = y + Math.sin(a) * margin;
        if (KOS.World.isSolid(venue, px, py)) return false;
      }
      return true;
    }
    // a point `d` m from the boat along heading h, moved to safe water (tries the mirror side, then shorter)
    function ahead(h, d, mirrorTwa) {
      const tries = [[h, 1], [mirrorTwa != null ? H(mirrorTwa) : h + Math.PI / 3, 1], [h, 0.7], [h, 0.5]];
      for (const [hh, k] of tries) {
        const v = U.vec(hh), p = { x: boat.x + v.x * d * k, y: boat.y + v.y * d * k };
        if (okSpot(p.x, p.y, 12)) return p;
      }
      const v = U.vec(h); return { x: boat.x + v.x * d * 0.5, y: boat.y + v.y * d * 0.5 };
    }
    const dist = p => Math.hypot(p.x - boat.x, p.y - boat.y);
    const hullDist = p => { const b = KOS.Physics.bow(boat), s = KOS.Physics.stern(boat); return U.segDistance(p.x, p.y, b.x, b.y, s.x, s.y); };
    const side = () => (boat.twa >= 0 ? 1 : -1);          // +1 starboard tack, −1 port tack
    const twaD = () => Math.abs(U.deg(boat.twa));
    const moving = k => Math.abs(boat.speed) > beamMs * (k == null ? 0.3 : k);
    const inRange = (lo, hi) => { const a = twaD(); return a >= lo - tol && a <= hi + tol; };
    const isBeam = () => inRange(75, 105) && moving();
    const isClose = () => { const a = twaD(); return a >= ngD - 1 && a <= ngD + 14 + tol && moving(0.25); };
    const isBroad = () => inRange(110, 150) && moving();
    const isRun = () => twaD() >= 155 - tol && moving(0.25);
    const spiFull = () => boat.spinnaker && !boat.spiCollapsed;
    const hiking = () => (ctrl.state.hike || 0) > 0.6 || (autopilot && boat.hike > 0.5);
    const placeBoat = (pt, twa, vK) => {
      boat.x = pt.x; boat.y = pt.y; boat.heading = H(twa);
      boat.speed = beamMs * (vK || 0); boat.slip = 0; boat.yawRate = 0;
      const f = U.vec(boat.heading); boat.vx = f.x * boat.speed; boat.vy = f.y * boat.speed;
      boat._init = false; boat.wake = [];
    };
    function mark(p, kind, label, o) {
      const m = Object.assign({ x: p.x, y: p.y, kind: kind || 'orange', label: label || null, r: 1.2, scale: 0, bornT: S.time, solid: true }, o || {});
      S.marks.push(m);
      return m;
    }
    function dropMark(m, burst) {
      const i = S.marks.indexOf(m); if (i >= 0) S.marks.splice(i, 1);
      if (burst && scene.effects) { scene.effects.stars(m.x, m.y, 12); scene.effects.ripple(m.x, m.y, 4, 1); }
    }
    // time (s) a good sailor needs from the boat to p
    function parTo(p) {
      const dx = p.x - boat.x, dy = p.y - boat.y, d = Math.hypot(dx, dy);
      const a = Math.abs(U.wrapPi(U.heading(dx, dy) - wind.dir));
      return d / Math.max(0.3, legSpeed(cls, P.windKn, a)) + 4;
    }

    // ==================================================================== step builders
    function holdTick(secs, cond, decay) {
      return function (dt) {
        this.v = this.v || 0;
        if (cond()) this.v += dt; else this.v = Math.max(0, this.v - dt * (decay == null ? 0.7 : decay));
        return this.v / secs;
      };
    }
    function hold(id, secs, cond, o) {
      return Object.assign({ id, par: secs + 6, tick: holdTick(secs, cond, o && o.decay), holdS: secs }, o || {});
    }
    function zoneOf(lo, hi, sd) { return () => ({ lo, hi, side: sd != null ? sd : side() }); }
    function reach(id, getPt, o) {
      o = o || {};
      return Object.assign({
        id, r: 6,
        enter() {
          let p = typeof getPt === 'function' ? getPt() : getPt;
          if (!p.kind && !o.ringOnly) p = mark(p, o.kind || 'orange', o.label || null);
          this.pt = p; this.d0 = Math.max(10, dist(p)); this.par = parTo(p);
        },
        tick() { const d = dist(this.pt); return d < this.r * ringK + cls.length * 0.4 ? 1 : U.clamp(1 - d / this.d0, 0, 0.95); },
        exit() { if (this.pt.kind && !o.keep) dropMark(this.pt, true); },
        target() { return { x: this.pt.x, y: this.pt.y, r: this.r * ringK, color: '#ffb547', label: this.pt.label }; },
        auto() { return { target: this.pt }; },
      }, o);
    }
    // turn arrow for a tack (dir = towards the wind) or a gybe (dir = away from the wind)
    const tackTurn = () => ({ to: H(-side() * (ngD + 8)), dir: side() });
    const gybeTurn = () => ({ to: H(-side() * 155), dir: -side() });

    // ==================================================================== the lessons
    function buildLesson(id) {
      const B = LESSON[id] || LESSON.steer;
      const l = Object.assign({ id, span: 42, steps: [], start: { u: 0, r: 0, twa: 90, v: 0.5 } }, B());
      return l;
    }
    const LESSON = {
      // 1 ------------------------------------------------------------- steer & stop
      steer: () => {
        const A = at(-14, -24), B = at(-6, -48), Cc = at(-22, -80);
        return {
          start: { u: -30, r: 26, twa: 90, v: 0.6 },
          steps: [
            reach('buoy', A, { label: '1' }),
            {
              id: 'stop', ring: B, stopR: 7, par: 14,
              enter() { this.d0 = Math.max(8, dist(B)); this.h = 0; this.outT = 0; this.v0 = Math.max(0.5, Math.abs(boat.speed)); this.vStop = Math.max(0.28, beamMs * (easy ? 0.2 : pro ? 0.12 : 0.16)); },
              tick(dt) {
                const d = dist(B), inside = d < this.stopR * ringK, slow = Math.abs(boat.speed) < this.vStop;
                if (inside && slow) this.h += dt; else this.h = Math.max(0, this.h - dt);
                // stuck in irons outside the ring: point at the pad that bears off
                if (boat.inIrons && !inside) { this.ironT = (this.ironT || 0) + dt; if (this.ironT > 3) { this.ironT = -5; tip('irons', true); flashCtrl(side() > 0 ? 'left' : 'right'); } }
                else if (!boat.inIrons && this.ironT > 0) this.ironT = 0;
                if (!inside && slow && Math.abs(boat.twa) < cls.noGo) { this.outT += dt; if (this.outT > 1.6) { this.outT = -99; if (!this.warned) { this.warned = true; mistake(); } floatText(t('school.fx.oops'), '#ff9a6b'); tip('outside', true); } }
                else if (!slow && this.outT < 0) this.outT = 0;
                if (this.h > 0.5) { floatText(t('school.fx.stop'), '#3ee08f'); sfx('bell'); return 1; }
                return inside ? 0.6 + 0.35 * U.clamp(1 - Math.abs(boat.speed) / this.v0, 0, 1) : 0.6 * U.clamp(1 - d / this.d0, 0, 1);
              },
              target() { return { x: B.x, y: B.y, r: this.stopR * ringK, color: '#3ee08f', stop: true }; },
              turn() { return dist(B) < 26 * kD && Math.abs(boat.twa) > cls.noGo ? { to: H(side() * 4), dir: side() } : null; },
              auto() { return dist(B) > 3.5 + Math.abs(boat.speed) * 2.4 ? { target: B } : { heading: WD }; },
            },
            reach('go', Cc, { label: '2' }),
          ],
        };
      },
      // 2 ------------------------------------------------------------- beam reach
      beam: () => {
        const S0 = at(0, 44), A = at(0, -36);
        let home = null;
        return {
          start: { u: 0, r: 34, twa: 58, v: 0.5 },
          init() { home = mark(S0, 'yellow', 'S', { scale: 1.6 }); },
          steps: [
            hold('set', 3, isBeam, { zone: zoneOf(80, 100), auto: () => ({ heading: H(side() * 90) }) }),
            reach('sail', A, { track: isBeam, zone: zoneOf(80, 100), r: 6 }),
            reach('back', () => home, { keep: true, track: isBeam, zone: () => (dist(home) < 25 * kD ? null : { lo: 80, hi: 100, side: side() }) }),
          ],
        };
      },
      // 3 ------------------------------------------------------------- close-hauled
      beat: () => ({
        start: { u: 0, r: 30, twa: 90, v: 0.6 }, noGo: true,
        steps: [
          {
            id: 'edge', par: 8,
            tick() {
              if (twaD() <= ngD + 4 || (boat.luffing && twaD() < 70)) { floatText(t('school.fx.edge'), '#ff9a6b'); sfx('luff', { vol: 0.6 }); return 1; }
              return U.clamp(1 - (twaD() - ngD - 4) / (90 - ngD - 4), 0, 0.95);
            },
            turn() { return { to: H(side() * (ngD - 2)), dir: side() }; },
            auto() { return { heading: H(side() * (ngD - 4)) }; },
          },
          hold('fill', 5, isClose, { zone: () => ({ lo: ngD + 1, hi: ngD + 12, side: side() }), decay: 1, auto: () => ({ heading: H(side() * (ngD + 6)) }) }),
          reach('go', () => ahead(H(side() * (ngD + 12)), 46 * kD, -side() * (ngD + 12)), { track: isClose, zone: () => ({ lo: ngD + 1, hi: ngD + 12, side: side() }), r: 7 }),
        ],
      }),
      // 4 ------------------------------------------------------------- tacking
      tack: () => {
        const A = at(30, -16);
        const tackStep = id => ({
          id, par: 11, ironsErr: true,
          enter() { this.n0 = boat.tacks; this.s0 = side(); this.done = false; },
          onTack() { this.done = true; },
          tick() {
            if (this.done) { if (twaD() >= ngD && moving(0.3)) return 1; return 0.75; }
            return U.clamp(0.6 * (1 - (twaD() - ngD) / 40), 0, 0.6);
          },
          turn() { return this.done ? null : tackTurn(); },
          zone() { return this.done ? { lo: ngD + 1, hi: ngD + 12, side: side() } : null; },
          auto() { return { heading: H(-this.s0 * (ngD + 8)) }; },
        });
        return {
          start: { u: -32, r: -6, twa: ngD + 6, v: 0.65 }, noGo: easy,
          steps: [tackStep('t1'), tackStep('t2'), reach('mark', A, { r: 7 })],
        };
      },
      // 5 ------------------------------------------------------------- broad reach & run
      downwind: () => ({
        start: { u: 34, r: 24, twa: 90, v: 0.6 },
        steps: [
          hold('broad', 3, isBroad, { zone: zoneOf(115, 145), auto: () => ({ heading: H(side() * 130) }) }),
          hold('run', 3, isRun, { zone: () => ({ lo: 158, hi: 178, side: side() }), auto: () => ({ heading: H(side() * 168) }) }),
          reach('mark', () => ahead(WD + Math.PI, 50 * kD, null), { track: () => twaD() > 120, r: 7, auto() { return { heading: U.heading(this.pt.x - boat.x, this.pt.y - boat.y) }; } }),
        ],
      }),
      // 6 ------------------------------------------------------------- gybing
      gybe: () => {
        const gybeStep = id => ({
          id, par: 10,
          enter() { this.s0 = side(); this.g = -1; this.maxHeel = 0; },
          onGybe(e) { if (this.g < 0) { this.g = 0; this.power = e.power || 0; } },
          tick(dt) {
            if (this.g >= 0) {
              this.g += dt; this.maxHeel = Math.max(this.maxHeel, Math.abs(boat.heel));
              if (this.g > 1.6) {
                const wild = !cls.keel && (boat.capsized || this.maxHeel > cls.capsizeHeel * 0.78);
                if (wild && !boat.capsized) { mistake(); tip('wild', true); }
                return 1;
              }
              return 0.8;
            }
            return U.clamp((twaD() - 120) / 60, 0, 0.6);
          },
          turn() { return this.g >= 0 ? null : gybeTurn(); },
          auto() { return { heading: H(-this.s0 * 162) }; },
        });
        return {
          start: { u: 36, r: 20, twa: 160, v: 0.7 },
          steps: [
            hold('run', 2, isRun, { zone: () => ({ lo: 158, hi: 178, side: side() }), auto: () => ({ heading: H(side() * 165) }) }),
            gybeStep('g1'), gybeStep('g2'),
            reach('mark', () => ahead(H(side() * 150), 40 * kD, null), { r: 7 }),
          ],
        };
      },
      // 7 ------------------------------------------------------------- out of irons
      irons: () => {
        const outStep = (id, need) => ({
          id, par: 12,
          enter() {
            this.need = need ? -S.exitSide : 0;    // 0 = either side; ±1 = must end on that tack
            if (need) { // the coach pushes the boat back into irons, a little towards the "wrong" side
              boat.heading = U.wrapPi(WD - R(this.need * -4)); boat.speed = 0; boat.vx = 0; boat.vy = 0; boat.yawRate = 0;
              if (scene.effects) scene.effects.ripple(boat.x, boat.y, 5, 1);
              sfx('whoosh', { vol: 0.6 });
            }
            this.stuck = 0;
          },
          sayVars() { return { side: t('school.side.' + (this.need > 0 ? 'left' : 'right')) }; },
          tick(dt) {
            if (Math.abs(boat.speed) < 0.1) this.stuck += dt;
            if (!easy && boat.speed < -0.08 && this.stuck > 4) tip('backwards');
            const ok = twaD() > ngD + 12 && moving(0.3) && (!this.need || side() === this.need);
            if (ok) { S.exitSide = side(); floatText(t('school.fx.free'), '#3ee08f'); return 1; }
            const sideOk = !this.need || side() === this.need || twaD() < 6;
            return sideOk ? U.clamp(twaD() / (ngD + 12) * 0.6 + U.clamp(boat.speed / (beamMs * 0.3), 0, 1) * 0.35, 0, 0.95) : 0.05;
          },
          turn() {
            if (twaD() > ngD + 10) return null;
            const s = this.need || (boat.yawRate >= 0 ? -1 : 1);   // turning right (+) ends on port tack (−)
            return { to: H(s * (ngD + 16)), dir: -s };
          },
          auto() { const s = this.need || this.botS || (this.botS = 1); return { heading: H(s * (ngD + 22)), irons: true }; },
        });
        return {
          start: { u: 0, r: 0, twa: 0, v: 0 },
          steps: [outStep('o1', false), outStep('o2', true), reach('go', () => ahead(H(side() * 90), 44 * kD, -side() * 90), { r: 6, zone: zoneOf(80, 100) })],
        };
      },
      // 8 ------------------------------------------------------------- trim (manual sheet)
      trim: () => {
        const thr = easy ? 0.84 : pro ? 0.93 : 0.89;
        const good = () => boat.trim >= thr && !boat.luffing && !boat.stalled && moving(0.2);
        const auto = tw => () => ({ heading: H(side() * tw), sheet: true });
        return {
          start: { u: 0, r: 36, twa: 90, v: 0.4 }, manualTrim: true,
          init() { boat.sheet = 1; },
          steps: [
            hold('beam', 3, () => good() && inRange(65, 115), { hl: 'sheet', zone: zoneOf(80, 100), auto: auto(90) }),
            hold('broad', 3, () => good() && inRange(112, 155), { hl: 'sheet', zone: zoneOf(118, 148), auto: auto(132) }),
            hold('close', 3, () => good() && isClose(), { hl: 'sheet', zone: () => ({ lo: ngD + 1, hi: ngD + 12, side: side() }), auto: auto(ngD + 7) }),
          ],
        };
      },
      // 9 ------------------------------------------------------------- hiking in gusts
      hike: () => {
        const pts = [at(3, 10), at(-4, -32), at(3, -74)];
        return {
          start: { u: 0, r: 52, twa: 90, v: 0.6 }, hike: true, heelHud: true, span: 50,
          steps: [
            hold('h', 2, hiking, { hl: 'hike', par: 8, auto: () => ({ heading: H(side() * 90), hike: 1 }) }),
            {
              id: 'gusts', i: 0, flat: 0, tot: 0,
              enter() { this.m = pts.map((p, i) => mark(p, 'orange', String(i + 1))); this.par = 0; let q = { x: boat.x, y: boat.y }; for (const p of pts) { const bx = boat.x, by = boat.y; boat.x = q.x; boat.y = q.y; this.par += parTo(p); boat.x = bx; boat.y = by; q = p; } this.d0 = dist(pts[0]); gustAhead(pts[0]); },
              taskVars() { return { n: this.i }; },
              tick(dt) {
                this.tot += dt; if (Math.abs(boat.heel) < hikeFlat) this.flat += dt;
                const p = this.m[this.i];
                if (dist(p) < 6 * ringK + cls.length * 0.4) {
                  dropMark(p, true); sfx('coin', { pitch: 1 + this.i * 0.12 }); floatText(t('school.fx.buoy'), '#ffd25e', p.x, p.y);
                  this.i++;
                  if (this.i >= this.m.length) return 1;
                  this.d0 = dist(this.m[this.i]); gustAhead(this.m[this.i]);
                }
                return (this.i + U.clamp(1 - dist(this.m[this.i]) / this.d0, 0, 0.95)) / this.m.length;
              },
              exit() { const f = this.tot ? this.flat / this.tot : 1; S.prec.push(f); if (f < (easy ? 0.45 : pro ? 0.75 : 0.6)) { mistake(); tip('precision', true); } else floatText(t('school.fx.flat'), '#3ee08f'); },
              target() { const p = this.m[this.i]; return p ? { x: p.x, y: p.y, r: 6 * ringK, color: '#ffb547', label: p.label } : null; },
              auto() { return { target: this.m[this.i], hike: Math.abs(boat.heel) > R(cls.optHeel || 6) ? 1 : 0.3 }; },
            },
          ],
        };
      },
      // 10 ------------------------------------------------------------ man overboard
      mob: () => ({
        start: { u: 0, r: 30, twa: 90, v: 0.7 }, span: 48,
        steps: [
          {
            id: 'alarm', par: 12,
            enter() {
              const st = KOS.Physics.stern(boat), b = U.vec(boat.heading);
              S.dummy = { x: st.x - b.x * 2, y: st.y - b.y * 2, ph: 0, picked: -1 };
              if (scene.effects) scene.effects.splash(S.dummy.x, S.dummy.y, 1);
              sfx('splash'); sfx('whistle'); scene.shake(0.3);
              floatText(t('school.fx.mob'), '#ff4d5e', S.dummy.x, S.dummy.y);
              this.away = 0;
            },
            tick(dt) {
              const d = S.dummy, br = U.heading(d.x - boat.x, d.y - boat.y), off = Math.abs(U.angDiff(boat.heading, br));
              if (dist(d) > 8) this.away += dt;
              if (off < R(60) && this.away > 1) return 1;
              return U.clamp(1 - off / Math.PI, 0, 0.9);
            },
            target() { return { x: S.dummy.x, y: S.dummy.y, r: 4, color: '#ff4d5e', label: t('school.mobName') }; },
            auto() { const ap = approachPoint(); if (!this.atAp && dist(ap) > 8) return { target: ap }; this.atAp = true; return { heading: U.heading(S.dummy.x - boat.x, S.dummy.y - boat.y) }; },
          },
          {
            id: 'pick', par: 0, fastCd: 0,
            enter() { this.ap = approachPoint(); this.par = parTo(this.ap) + 10; this.rP = (cls.beam || 1.4) * 0.5 + (easy ? 3.6 : pro ? 2.6 : 3.0); this.vP = Math.max(0.45, beamMs * (easy ? 0.42 : pro ? 0.24 : 0.32)); },
            tick(dt) {
              const d = hullDist(S.dummy), v = Math.abs(boat.speed);
              this.fastCd -= dt;
              if (d < this.rP && v < this.vP) {
                if (twaD() > 100) { mistake(); tip('mobDown', true); }
                S.dummy.picked = 0; floatText(t('school.fx.saved'), '#3ee08f', S.dummy.x, S.dummy.y);
                sfx('cheer', { vol: 0.6 }); if (scene.effects) { scene.effects.splash(S.dummy.x, S.dummy.y, 0.6); scene.effects.stars(S.dummy.x, S.dummy.y, 16); }
                return 1;
              }
              if (d < this.rP + 1.5 && v > this.vP * 1.5 && this.fastCd <= 0) { this.fastCd = 5; if (!this.fastN) mistake(); this.fastN = (this.fastN || 0) + 1; floatText(t('school.fx.fast'), '#ff9a6b'); tip('mobFast', true); }
              return U.clamp(1 - d / 40, 0, 0.9);
            },
            target() { return { x: S.dummy.x, y: S.dummy.y, r: this.rP + cls.length * 0.25, color: '#3ee08f', label: t('school.mobName'), stop: true }; },
            auto() {
              const d = S.dummy, dd = hullDist(d), ap = this.ap;
              const br = U.heading(d.x - boat.x, d.y - boat.y), fetch = Math.abs(U.wrapPi(br - WD)) > cls.noGo + R(12);
              if (!this.passed && dist(ap) > 5 && !(fetch && dd < 16)) return { target: ap };
              this.passed = true;
              if (!fetch && dd > 6) { this.passed = false; this.ap = approachPoint(); return { target: this.ap }; }
              if (dd > 2.2 + Math.abs(boat.speed) * 2.6) return { heading: br };
              if (Math.abs(boat.speed) > this.vP * 0.7) return { heading: WD };          // brake: luff head to wind
              const off = U.wrapPi(br - WD), lim = cls.noGo * 0.95;                       // creep: as close to him as the no-go zone allows
              return { heading: Math.abs(off) >= lim ? br : U.wrapPi(WD + (off >= 0 ? lim : -lim)) };
            },
          },
        ],
      }),
      // 11 ------------------------------------------------------------ figure of eight
      eight: () => {
        let A, Bm;
        const M = at(0, 0);
        const roundStep = (id, getM, needDir) => ({
          id, par: 0,
          enter() { this.m = getM(); this.sw = 0; this.last = null; this.warned = false; this.par = (Math.PI * 2 * 12 * kD + 40 * kD) / Math.max(0.5, beamMs * 0.75) + cls.tackTime * 2 + 4; },
          tick() {
            const m = this.m, d = dist(m), b = U.heading(boat.x - m.x, boat.y - m.y);
            if (d < 36 * kD) { if (this.last != null) this.sw += U.wrapPi(b - this.last); this.last = b; } else { this.last = null; this.sw *= 0.98; }
            const want = needDir ? needDir() : 0;
            if (want && this.sw * want < -2.4 && !this.warned) { this.warned = true; mistake(); tip('wrongWay', true); }
            const prog = want ? this.sw * want : Math.abs(this.sw);
            if (prog > 4.4) { S.eightDir = Math.sign(this.sw); sfx('bell'); floatText(t('school.fx.mark', { n: m.label }), '#ffd25e', m.x, m.y); return 1; }
            return U.clamp(prog / 4.4, 0, 0.95);
          },
          target() { return { x: this.m.x, y: this.m.y, r: 12 * kD, color: '#ffe066', label: this.m.label, ring: 'round' }; },
          auto() { return { target: eightAutoTarget(this.m, needDir ? needDir() : 1) }; },
        });
        return {
          start: { u: -8, r: 6, twa: 90, v: 0.6 }, span: 54, guide: 'eight',
          init() { A = mark(at(0, -20), 'yellow', 'A', { scale: 1.6 }); Bm = mark(at(0, 20), 'yellow', 'B', { scale: 1.6 }); },
          steps: [
            roundStep('a', () => A, null),
            roundStep('b', () => Bm, () => -(S.eightDir || 1)),
            reach('mid', () => ({ x: M.x, y: M.y }), { ringOnly: true, r: 7 }),
          ],
        };
      },
      // 12 ------------------------------------------------------------ the triangle
      triangle: () => {
        let m1, m2, pin, com;
        const roundM = (id, getM) => ({
          id, par: 0,
          enter() { this.m = getM(); this.m.round = 'port'; this.sw = 0; this.last = null; this.par = parTo(this.m) + 3; },
          tick() {
            const m = this.m, d = dist(m), b = U.heading(boat.x - m.x, boat.y - m.y);
            if (d < 40 * kD) { if (this.last != null) this.sw += U.wrapPi(b - this.last); this.last = b; } else { this.last = null; this.sw = 0; }
            if (this.sw > 2.2 && !S.tips.wrongSide) { mistake(); tip('wrongSide', true); }
            if (this.sw < -2.0) { m.round = null; sfx('bell'); floatText(t('school.fx.mark', { n: m.label }), '#ffb547', m.x, m.y); if (scene.effects) scene.effects.stars(m.x, m.y, 12); return 1; }
            return U.clamp(Math.max(0.6 * (1 - d / 120), -this.sw / 2.0 * 0.4 + 0.55 * (d < 40 * kD)), 0, 0.95);
          },
          target() { return { x: this.m.x, y: this.m.y, r: 8 * kD, color: '#ffb547', label: this.m.label, ring: 'round' }; },
          auto() { return { courseAll: course() }; },
        });
        const lineStep = (id, finish) => ({
          id, par: 0,
          enter() { this.par = finish ? parTo(mid()) + 2 : 6; this.px = boat.x; this.py = boat.y; if (finish) scene.lines[0].kind = 'finish'; },
          tick() {
            const crossed = U.segCross(this.px, this.py, boat.x, boat.y, pin.x, pin.y, com.x, com.y);
            this.px = boat.x; this.py = boat.y;
            if (crossed) { sfx(finish ? 'hornLong' : 'hornShort'); floatText(t(finish ? 'school.fx.buoy' : 'school.fx.start'), '#ffffff'); return 1; }
            return U.clamp(1 - dist(mid()) / 80, 0, 0.9);
          },
          target() { const p = mid(); return { x: p.x, y: p.y, r: 0, color: '#ffffff', label: t(finish ? 'sail.hud.finish' : 'sail.hud.start') }; },
          auto() { if (!finish) return { heading: H(side() * (ngD + 8)) }; const p = mid(), q = { x: p.x - UP.x * 5 * kD, y: p.y - UP.y * 5 * kD }; return { heading: U.heading(q.x - boat.x, q.y - boat.y) }; },
        });
        const mid = () => ({ x: (pin.x + com.x) / 2, y: (pin.y + com.y) / 2 });
        let crs = null;
        const course = () => crs || (crs = [{ line: [pin, com] }, { x: m1.x, y: m1.y, round: 'port' }, { x: m2.x, y: m2.y, round: 'port' }, { line: [pin, com] }]);
        return {
          start: { u: -12, r: 8, twa: ngD + 8, v: 0.5 }, span: 50,
          init() {
            m1 = mark(at(64, 0), 'orange', '1', { scale: 1.6 });
            m2 = mark(at(30, -46), 'orange', '2', { scale: 1.6 });
            pin = mark(at(0, -16), 'pin', null, { scale: 1.6, r: 1 });
            com = mark(at(0, 16), 'committee', null, { scale: 1.6, r: 3, heading: WD });
            scene.lines = [{ a: pin, b: com, kind: 'start' }];
            if (easy) { S.pathLine = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, kind: 'path' }; scene.lines.push(S.pathLine); }
          },
          steps: [lineStep('start', false), roundM('m1', () => m1), roundM('m2', () => m2), lineStep('fin', true)],
        };
      },
      // 13 ------------------------------------------------------------ Feva: gennaker up and down
      feva: () => ({
        start: { u: 40, r: 30, twa: 95, v: 0.6 }, span: 50,
        steps: [
          hold('bear', 2.5, isBroad, { zone: zoneOf(118, 145), auto: () => ({ heading: H(side() * 132) }) }),
          hold('hoist', 3, () => spiFull(), { hl: 'spi', decay: 1.5, zone: zoneOf(118, 145), auto: () => ({ heading: H(side() * 132), spi: true }) }),
          reach('fly', () => ahead(H(side() * 135), 70 * kD, -side() * 135), { r: 9, track: spiFull, zone: zoneOf(118, 148), auto() { return { heading: U.heading(this.pt.x - boat.x, this.pt.y - boat.y), spi: true }; } }),
          hold('drop', 0.4, () => !boat.spinnaker, { hl: 'spi', par: 5, auto: () => ({ heading: H(side() * 120), spi: false }) }),
          hold('luff', 2, isClose, { zone: () => ({ lo: ngD + 1, hi: ngD + 12, side: side() }), turn: () => (twaD() > ngD + 20 ? { to: H(side() * (ngD + 6)), dir: side() } : null), auto: () => ({ heading: H(side() * (ngD + 6)), spi: false }) }),
        ],
      }),
      // 14 ------------------------------------------------------------ 29er: trapeze & planing
      skiff: () => ({
        start: { u: 40, r: 40, twa: 100, v: 0.7 }, hike: true, heelHud: true, span: 46,
        steps: [
          hold('trap', 2, () => hiking() && Math.abs(boat.heel) < heelLimit, { hl: 'hike', zone: zoneOf(90, 115), auto: () => ({ heading: H(side() * 100), hike: 1 }) }),
          hold('plane', 4, () => boat.planing, { decay: 0, par: 12, zone: zoneOf(100, 135), hint: cls.hasSpinnaker !== 'none' ? 'spiGennaker' : null, auto: () => ({ heading: H(side() * 115), hike: 1, spi: true }) }),
          reach('blast', () => ahead(H(side() * 115), 80 * kD, -side() * 115), { r: 9, track: () => boat.planing, zone: zoneOf(100, 135), auto() { return { target: this.pt, hike: 1, spi: true }; } }),
        ],
      }),
      // 15 ------------------------------------------------------------ J/70: crew work
      keel: () => {
        const calledStep = (id, kind, need, o) => Object.assign({
          id, call: kind, par: 12 * need,
          enter() { this.n = 0; this.s0 = side(); },
          taskVars() { return { n: this.n }; },
          maneuver() {
            if (S.call && S.call.kind === kind && S.time - S.call.t < 9) {
              this.n++; S.call = null; floatText(t('school.call.' + (kind === 'tack' ? 'tacking' : 'gybing')), '#ffffff', boat.x, boat.y - 3);
              sfx('cheer', { vol: 0.3 }); this.s0 = side();
            } else { mistake(); tip('callFirst', true); }
          },
          tick() { return this.n / need; },
          turn() { return S.call && S.call.kind === kind ? (kind === 'tack' ? tackTurn() : gybeTurn()) : null; },
          auto() {
            if (!S.call && !this.wait) { this.wait = 1; doCall(); }
            if (S.call && S.time - S.call.t > 1.2) return kind === 'tack' ? { heading: H(-this.s0 * (ngD + 8)), hike: 1 } : { heading: H(-this.s0 * 150), spi: true };
            return kind === 'tack' ? { heading: H(this.s0 * (ngD + 8)), hike: 1 } : { heading: H(this.s0 * 150), spi: true };
          },
        }, o);
        const tack = calledStep('tack', 'tack', 2, { hl: 'call', ironsErr: true, onTack() { this.maneuver(); this.wait = 0; } });
        const gybe = calledStep('gybe', 'gybe', 1, { hl: 'call', onGybe() { this.maneuver(); this.wait = 0; } });
        return {
          start: { u: -40, r: 10, twa: ngD + 6, v: 0.6 }, hike: true, call: true, span: 54, noGo: easy,
          steps: [
            hold('rail', 3, () => hiking() && isClose(), { hl: 'hike', zone: () => ({ lo: ngD + 1, hi: ngD + 12, side: side() }), auto: () => ({ heading: H(side() * (ngD + 6)), hike: 1 }) }),
            tack,
            hold('hoist', 3, () => spiFull() && inRange(110, 160), { hl: 'spi', zone: zoneOf(118, 150), auto: () => ({ heading: H(side() * 140), spi: true }) }),
            gybe,
            hold('drop', 2, () => !boat.spinnaker && isClose(), { hl: 'spi', zone: () => ({ lo: ngD + 1, hi: ngD + 12, side: side() }), auto: () => ({ heading: H(side() * (ngD + 6)), spi: false, hike: 1 }) }),
          ],
        };
      },
    };

    // eight: steer round a mark on a circle (for the test bot)
    function eightAutoTarget(m, dir) {
      const b = U.heading(boat.x - m.x, boat.y - m.y), rr = 13 * kD;
      const nb = b + dir * 0.9, v = U.vec(nb);
      return { x: m.x + v.x * rr, y: m.y + v.y * rr, r: 4 };
    }
    // MOB: the spot to start the final approach (downwind of the dummy, close reach towards it)
    function approachPoint() {
      const d = S.dummy; if (!d) return { x: boat.x, y: boat.y };
      const s = (U.angDiff(WD, U.heading(boat.x - d.x, boat.y - d.y)) >= 0) ? 1 : -1;
      const h = H(s * 60), v = U.vec(h);        // approach heading: close reach, coming in from the boat's side of the wind axis
      return { x: d.x - v.x * 24 * kD, y: d.y - v.y * 24 * kD, h };
    }
    // hike lesson: roll a strong gust onto the course just upwind of the next buoy
    function gustAhead(p) {
      const g = wind.gusts.filter(x => !x.lull).sort((a, b) => b.kMax - a.kMax)[0] || wind.gusts[0];
      if (!g) return;
      const mx = (boat.x + p.x) / 2, my = (boat.y + p.y) / 2;
      g.x = mx + UP.x * 18 * kD; g.y = my + UP.y * 18 * kD; g.r = 34 * kD;
      g.kMax = 1 + Math.max(0.45, P.gust * 0.55); g.lull = false; g.life = 9; g.dur = Math.max(g.dur, 70);
    }

    // ---- the lesson
    const L = buildLesson(P.lesson);
    let controls = KOS.Physics.controls();
    controls.autoTrim = !pro && !L.manualTrim;
    controls.autoHike = easy && !L.hike;

    // ---- scene
    const scene = new KOS.SailScene(host.canvas, { venue, wind, boats: [boat], follow: boat, marks: S.marks, lines: S.lines || [],
      showNoGo: !!L.noGo, showWindArrow: true });
    if (L.lines) scene.lines = L.lines;
    scene.addOverlay(drawWorld);
    scene.addOverlay(drawScreen, { screen: true });
    let userZoom = 1;
    function applyZoom() {
      const small = Math.min(scene.w, scene.h) < 600;
      const span = (L.span || 42) * Math.sqrt(kD) + 5 * cls.length;
      scene.setZoom(1);
      const base = scene.baseZoom() / (1 + U.clamp(Math.abs(boat.speed) / 25, 0, 0.35));
      scene.setZoom(Math.sqrt(scene.w * scene.h) * (small ? 1.3 : 1) / (span * (small ? 0.85 : 1)) / base * userZoom);
    }
    applyZoom();
    scene.fixedZoom = scene.baseZoom() * 0.55;   // a wider view while the lesson card is up; eases in at the start

    // ---- input
    const showHike = !!L.hike || (!cls.keel && !easy);
    const ctrl = KOS.Input.attach(host.layer, {
      layout: 'sail', spinnaker: cls.hasSpinnaker !== 'none', spinnakerKind: cls.hasSpinnaker === 'asym' ? 'gennaker' : 'spi',
      hike: showHike, autoTrim: controls.autoTrim, pauseButton: false,
      extraButtons: L.call ? [{ id: 'call', icon: 'whistle', labelKey: 'school.btn.call' }] : [],
    });
    ctrl.on('call', () => doCall());
    ctrl.on('action', () => { if (S.phase === 'card') beginLesson(); else if (L.call) doCall(); });
    if (L.manualTrim) { ctrl.setAutoTrim(false); ctrl.setSheet(1); }

    // ---- HUD + lesson panel + intro card
    const hudItems = ['wind', 'speed', 'pos', 'timer'];
    if (L.heelHud) hudItems.push('heel');
    const hud = KOS.UI.hud(host.layer, hudItems);
    const panel = document.createElement('div');
    panel.className = 'school-panel';
    host.layer.appendChild(panel);
    let card = buildCard();

    // ---- physics events (our boat only)
    const handlers = {
      'boat:tack': e => { if (e.boat !== boat || S.phase !== 'go') return; sfx('tack'); floatText(t('school.fx.tack'), '#9fe7ff'); if (S.step && S.step.onTack) S.step.onTack(); },
      'boat:gybe': e => { if (e.boat !== boat || S.phase !== 'go') return; sfx('gybe'); floatText(t('school.fx.gybe'), '#ffd25e'); scene.shake(0.2 + 0.2 * Math.min(1, e.power || 0)); if (S.step && S.step.onGybe) S.step.onGybe(e); },
      'boat:irons': e => {
        if (e.boat !== boat || S.phase !== 'go' || L.id === 'irons') return;
        S.ironsT = 0; S.ironsCounted = false;      // judged by how long the boat stays stuck (a clean tack dips in briefly)
      },
      'boat:heelWarn': e => { if (e.boat !== boat || S.phase !== 'go' || controls.autoHike) return; tip('heel'); flashCtrl('hike'); },
      'boat:plane': e => { if (e.boat !== boat || S.phase !== 'go') return; sfx('whoosh', { vol: 0.7 }); floatText(t('school.fx.plane'), '#3ee08f'); },
      'boat:ground': e => {
        if (e.boat !== boat || S.phase !== 'go') return;
        sfx(e.speed > 1.5 ? 'crash' : 'bump', { vol: Math.min(1, 0.4 + e.speed / 3) });
        if (e.speed > 0.4 && S.groundCd <= 0) { S.grounds++; S.groundCd = 3; floatText(t('school.fx.ground'), '#ff4d5e'); tip('ground', true); }
      },
      'boat:capsize': e => { if (e.boat !== boat) return; sfx('splash'); mistake(); tip('capsize', true); },
      'boat:righted': e => { if (e.boat === boat) sfx('splash', { vol: 0.5 }); },
      'boat:spiCollapse': e => { if (e.boat === boat && S.phase === 'go') { sfx('flap', { vol: 0.6 }); tip('collapse'); } },
      'boat:collide': e => { if ((e.a === boat || e.b === boat) && e.type === 'mark') sfx('bump', { vol: 0.6 }); },
    };
    for (const k in handlers) KOS.Events.on(k, handlers[k]);
    const onWheel = e => { if (e.target.closest && e.target.closest('.kc, .school-card')) return; e.preventDefault(); userZoom = U.clamp(userZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.5); applyZoom(); };
    host.layer.addEventListener('wheel', onWheel, { passive: false });

    // ==================================================================== lesson flow
    function stepKey(s, part) { return 'school.l.' + L.id + '.' + s.id + '.' + part; }
    function enterStep(i) {
      if (S.step) { if (S.step.exit) S.step.exit(); if (S.step.hl) ctrl.highlight(S.step.hl, false); }
      S.idx = i; S.step = L.steps[i] || null;
      const s = S.step; if (!s) return;
      s.p = 0; s.trk = 0; s.trkT = 0; s.v = 0;
      if (s.enter) s.enter();
      S.par += (s.par || 8) + 3;
      if (s.hl) ctrl.highlight(s.hl, true);
      say(t(stepKey(s, 'say'), s.sayVars ? s.sayVars() : null), { ms: 7500, mood: i === 0 ? undefined : 'wow' });
      S.stepT0 = S.time;
      S.tipT = S.time;            // let the instruction breathe before tips
      paintPanel(true);
    }
    function stepDone() {
      const s = S.step;
      if (s.track && s.trkT > 0.5) {
        const f = s.trk / s.trkT; S.prec.push(f);
        if (f < (easy ? 0.4 : pro ? 0.7 : 0.55)) { mistake(); tip('precision', true); }
      }
      S.done++;
      sfx('star', { pitch: 1 + S.idx * 0.08 });
      const praise = t('school.praise');
      const word = Array.isArray(praise) ? praise[S.praiseI++ % praise.length] : praise;
      floatText(word, '#ffd25e', boat.x, boat.y - 4);
      if (scene.effects) scene.effects.stars(boat.x, boat.y, 14);
      KOS.Input.haptic && KOS.Input.haptic([15, 30, 15]);
      S.stepFlash = 1;
      if (S.idx >= L.steps.length - 1) { if (s.exit) s.exit(); if (s.hl) ctrl.highlight(s.hl, false); S.step = null; complete(); return; }
      S.wait = 1.0;
      paintPanel(true);
    }

    function complete() {
      S.phase = 'done'; S.finishT = 2.2;
      const time = S.time;
      const ratio = time / Math.max(15, S.par / 0.85);
      let stars = starsFor(ratio, assist);
      const allow = easy ? 2 : pro ? 0 : 1;
      if (S.grounds > (easy ? 1 : 0)) stars--;
      if (S.err > allow) stars--;
      stars = U.clamp(stars, 1, 3);
      const prec = S.prec.length ? S.prec.reduce((a, b) => a + b, 0) / S.prec.length : 1;
      sfx('win', { vol: 0.55 });
      if (stars === 3) { sfx('cheer', { vol: 0.6 }); try { KOS.UI.confetti(); } catch (e) { /* optional */ } }
      if (scene.effects) { scene.effects.confetti(boat.x, boat.y, stars === 3 ? 160 : 80); scene.effects.text(boat.x, boat.y - 6, '★'.repeat(stars), { color: '#ffd25e', size: 36 }); }
      scene.shake(0.25);
      const timeStr = KOS.UI.fmtTime(time * 1000);
      say(t('school.res.' + (stars === 3 ? 'great' : stars === 2 ? 'good' : 'ok'), { time: timeStr }), { ms: 4000, mood: 'wow' });
      paintPanel(true);
      const stats = { 'school.stat.steps': S.done + '/' + L.steps.length, 'school.stat.precision': Math.round(prec * 100) + ' %', 'school.stat.mistakes': S.err, 'school.stat.grounds': S.grounds };
      if (boat.tacks) stats.tacks = boat.tacks;
      if (boat.gybes) stats.gybes = boat.gybes;
      S.result = {
        stars, success: true, timeMs: Math.round(time * 1000),
        score: Math.round(1000 * Math.min(2.5, (S.par / 0.85) / Math.max(1, time)) + prec * 500 - S.err * 100 - S.grounds * 150 + stars * 200),
        stats, msgKey: 'school.res.' + (stars === 3 ? 'great' : stars === 2 ? 'good' : 'ok'), msgVars: { time: timeStr },
      };
    }

    function mistake() { S.err++; }
    let coachApi = null;
    function say(text, o) { try { coachApi = KOS.UI.coach(text, o); } catch (e) { coachApi = null; } }

    // ==================================================================== small helpers
    function sfx(name, o) { try { KOS.Audio && KOS.Audio.play(name, o); } catch (e) { /* audio optional */ } }
    function floatText(str, color, x, y) { if (scene.effects) scene.effects.text(x != null ? x : boat.x, y != null ? y : boat.y - 2, str, { color: color || '#fff', size: 22 }); }
    function tip(key, force) {
      if (S.tips[key] && !force) return;
      if (S.time - S.tipT < 5 && !force) return;
      if (force && S.tips[key] && S.time - (S.tips[key] || 0) < 8) return;
      S.tips[key] = S.time || 0.01; S.tipT = S.time;
      say(t('school.tip.' + key), { ms: 5000, mood: /ground|capsize|wild|fast|First|wrong|outside|irons|precision|Down/.test(key) ? 'oops' : undefined });
    }
    const flashTimers = [];
    function flashCtrl(id) { ctrl.highlight(id, true); flashTimers.push(setTimeout(() => { if (!(S.step && S.step.hl === id)) ctrl.highlight(id, false); }, 2500)); }
    function doCall() {
      if (S.phase !== 'go' || !L.call) return;
      const s = S.step, kind = s && s.call ? s.call : (twaD() > 100 ? 'gybe' : 'tack');
      S.call = { kind, t: S.time };
      S.reply = 0.7;
      sfx('whistle', { vol: 0.5 });
      floatText(t('school.call.' + kind), '#ffffff', boat.x, boat.y - 3);
    }

    // ==================================================================== DOM: card + panel
    function buildCard() {
      const el = document.createElement('div');
      el.className = 'school-card';
      const touch = KOS.Input.isTouchDevice ? KOS.Input.isTouchDevice() : false;
      const steps = L.steps.map(s => '<li>' + KOS.UI.esc(t(stepKey(s, 'task'), s.taskVars ? { n: 0 } : s.sayVars ? { side: '…' } : null)) + '</li>').join('');
      el.innerHTML = '<div class="sc-in">' +
        '<div class="sc-kicker">' + KOS.UI.iconSvg('school') + '<span>' + KOS.UI.esc(t('school.card.school') + ' · ' + t('school.card.lesson', { n: P.n })) + '</span></div>' +
        '<h2 class="sc-title">' + KOS.UI.esc(KOS.tt(activity.title || { da: '', en: '' })) + '</h2>' +
        '<div class="sc-body"><div class="sc-dia">' + diagramSvg() + '</div>' +
        '<div class="sc-txt"><p class="sc-intro">' + KOS.UI.esc(t('school.l.' + L.id + '.intro')) + '</p>' +
        '<ol class="sc-steps">' + steps + '</ol></div></div>' +
        (touch ? '' : '<div class="sc-keys">' + KOS.UI.esc(t('school.card.keys')) + '</div>') +
        '<button type="button" class="btn btn-primary btn-big sc-go">' + KOS.UI.iconSvg('play') + '<span>' + KOS.UI.esc(t('school.card.go')) + '</span></button>' +
        '</div>';
      host.layer.appendChild(el);
      host.layer.classList.add('has-intro-card');
      el.querySelector('.sc-go').addEventListener('click', e => { e.stopPropagation(); beginLesson(); });
      el.addEventListener('pointerdown', e => e.stopPropagation());
      return el;
    }
    function closeCard() {
      if (!card) return;
      const el = card; card = null;
      host.layer.classList.remove('has-intro-card');
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    }
    let lastPanel = '';
    function paintPanel(force) {
      const s = S.step;
      const n = L.steps.length;
      let dots = '';
      for (let i = 0; i < n; i++) dots += '<i class="' + (i < S.done ? 'ok' : i === S.idx && S.phase === 'go' ? 'cur' : '') + '"></i>';
      const task = S.phase === 'done' ? '✓' : s ? t(stepKey(s, 'task'), s.taskVars ? s.taskVars() : s.sayVars ? s.sayVars() : null) : (S.wait > 0 ? '✓' : '');
      const p = S.phase === 'done' ? 1 : S.wait > 0 ? 1 : s ? U.clamp(s.p || 0, 0, 1) : 0;
      const html = '<div class="sp-head"><span class="sp-badge">' + KOS.UI.esc(t('school.panel.lesson', { n: P.n })) + '</span>' +
        '<span class="sp-step">' + KOS.UI.esc(t('school.panel.step', { n: Math.min(n, S.done + (S.phase === 'done' ? 0 : 1)), m: n })) + '</span></div>' +
        '<div class="sp-task' + (S.wait > 0 || S.phase === 'done' ? ' ok' : '') + '">' + KOS.UI.esc(task) + '</div>' +
        '<div class="sp-bar"><b style="width:' + Math.round(p * 100) + '%"></b></div><div class="sp-dots">' + dots + '</div>';
      if (html !== lastPanel || force) {
        const structural = !lastPanel || lastPanel.split('sp-bar')[0] !== html.split('sp-bar')[0];
        if (structural) { panel.innerHTML = html; if (lastPanel) { panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('pop'); } }
        else { const b = panel.querySelector('.sp-bar b'); if (b) b.style.width = Math.round(p * 100) + '%'; }
        lastPanel = html;
      }
      panel.classList.toggle('show', S.phase !== 'card');
    }

    // ---- card diagram: the points-of-sail wheel (or a small course sketch) as inline SVG
    function diagramSvg() {
      const g = L.guide || L.id;
      const hi = { steer: ['beam', 'nogo'], beam: ['beam'], beat: ['nogo', 'close'], tack: ['close', 'nogo'], downwind: ['broad', 'run'], gybe: ['run'],
        irons: ['nogo'], trim: ['close', 'beam', 'broad'], hike: ['beam'], feva: ['broad'], skiff: ['beam', 'broad'], keel: ['close', 'broad'] }[g];
      const W = 200, c = 100;
      const pol = (a, r) => [c + Math.sin(R(a)) * r, c - Math.cos(R(a)) * r];
      const sector = (a0, a1, r0, r1) => { const p = [pol(a0, r1), pol(a1, r1), pol(a1, r0), pol(a0, r0)]; const lg = Math.abs(a1 - a0) > 180 ? 1 : 0; return 'M' + p[0].join(' ') + 'A' + r1 + ' ' + r1 + ' 0 ' + lg + ' 1 ' + p[1].join(' ') + 'L' + p[2].join(' ') + 'A' + r0 + ' ' + r0 + ' 0 ' + lg + ' 0 ' + p[3].join(' ') + 'Z'; };
      const windArrow = '<g><path d="M100 4v26" stroke="#49c6f2" stroke-width="5" stroke-linecap="round"/><path d="M90 24l10 12 10-12z" fill="#49c6f2"/>' +
        '<text x="122" y="16" fill="#9fe7ff" font-size="11" font-weight="900">' + KOS.UI.esc(t('school.dia.wind')) + '</text></g>';
      const boatAt = (a, s) => { const [x, y] = pol(a, 70); return '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + a + ') scale(' + (s || 1) + ')"><path d="M0 -9C4 -5 4.5 3 3.5 9H-3.5C-4.5 3 -4 -5 0 -9z" fill="#fff" stroke="#1b2335" stroke-width="1.2"/><path d="M0 -4L' + (a > 0 && a < 180 ? -1 : 1) * Math.min(7, Math.abs(Math.sin(R(a))) * 3 + (Math.abs(a) > 90 ? 5 : 2)) + ' 6" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round"/></g>'; };
      if (hi) {
        const ng = Math.round(ngD);
        const secs = [['nogo', -ng, ng, '#ff4d5e'], ['close', ng, ng + 15, '#49c6f2'], ['beam', 75, 105, '#3ee08f'], ['broad', 110, 150, '#ffb547'], ['run', 150, 180, '#a35cff']];
        let s = '';
        for (const [k, a0, a1, col] of secs) {
          const on = hi.includes(k), op = on ? 0.85 : 0.16;
          s += '<path d="' + sector(a0, a1, 30, 58) + '" fill="' + col + '" opacity="' + op + '"/>';
          if (k !== 'nogo') s += '<path d="' + sector(-a1, -a0, 30, 58) + '" fill="' + col + '" opacity="' + op + '"/>';
        }
        let labels = '';
        for (const [k, a0, a1, col] of secs) {
          if (!hi.includes(k)) continue;
          const am = k === 'nogo' ? 0 : (a0 + a1) / 2, [x, y] = pol(am, k === 'nogo' ? 44 : 86);
          labels += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + (k === 'nogo' ? 'middle' : 'start') + '" fill="#fff" font-size="12" font-weight="900" paint-order="stroke" stroke="#0d1321" stroke-width="3">' + KOS.UI.esc(t('school.dia.' + k)) + '</text>';
        }
        const boats = hi.filter(k => k !== 'nogo').map(k => boatAt({ close: ng + 8, beam: 90, broad: 130, run: 172 }[k])).join('');
        return '<svg viewBox="0 0 ' + W + ' ' + W + '" aria-hidden="true"><circle cx="100" cy="100" r="60" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.15)"/>' + s +
          '<path d="M100 100v-58" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 4"/>' + boats + windArrow + labels + '</svg>';
      }
      // course sketches
      let body = '';
      if (g === 'mob') {
        body = '<path d="M150 150C150 90 60 120 70 60" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 6"/><path d="M62 70l8-14 6 15z" fill="#fff"/>' +
          '<circle cx="78" cy="50" r="9" fill="#ff7a3d" stroke="#fff" stroke-width="2"/><circle cx="78" cy="50" r="3.5" fill="#f6c39f"/>' +
          '<circle cx="78" cy="50" r="18" fill="none" stroke="#3ee08f" stroke-width="2.5" stroke-dasharray="4 4"/>' + boatAt(0, 1.1).replace(/translate\([^)]*\) rotate\(0\)/, 'translate(150 158) rotate(-20)');
      } else if (g === 'eight') {
        body = '<path d="M100 110C130 70 170 70 170 110S130 150 100 110 30 70 30 110 70 150 100 110z" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="7 6"/>' +
          '<circle cx="60" cy="110" r="8" fill="#ffe066" stroke="#1b2335" stroke-width="2"/><text x="60" y="114" text-anchor="middle" font-size="9" font-weight="900" fill="#1b2335">A</text>' +
          '<circle cx="140" cy="110" r="8" fill="#ffe066" stroke="#1b2335" stroke-width="2"/><text x="140" y="114" text-anchor="middle" font-size="9" font-weight="900" fill="#1b2335">B</text>';
      } else {
        body = '<path d="M70 170L100 60 50 110 100 170" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="7 6" stroke-linejoin="round"/>' +
          '<circle cx="100" cy="56" r="8" fill="#ff8a3d" stroke="#1b2335" stroke-width="2"/><text x="100" y="60" text-anchor="middle" font-size="9" font-weight="900" fill="#1b2335">1</text>' +
          '<circle cx="48" cy="110" r="8" fill="#ff8a3d" stroke="#1b2335" stroke-width="2"/><text x="48" y="114" text-anchor="middle" font-size="9" font-weight="900" fill="#1b2335">2</text>' +
          '<path d="M60 172H140" stroke="#fff" stroke-width="2"/><circle cx="60" cy="172" r="5" fill="#ff8a3d"/><rect x="134" y="166" width="14" height="10" rx="3" fill="#fff"/>';
      }
      return '<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="105" r="92" fill="rgba(127,196,240,.14)"/>' + body + windArrow + '</svg>';
    }

    // ==================================================================== drawing
    function drawWorld(ctx, sc) {
      const mpp = sc.mpp, tm = sc.t;
      if (L.guide === 'eight' && S.phase !== 'done') drawEight(ctx, sc);
      // target / stop rings
      const s = S.step;
      const tg = s && s.target && S.phase === 'go' && S.wait <= 0 ? s.target() : null;
      if (tg && tg.r > 0) {
        const pulse = 1 + 0.06 * Math.sin(tm * 5);
        const r = Math.max(tg.r, 14 * mpp) * pulse;
        ctx.save(); ctx.translate(tg.x, tg.y);
        if (tg.stop) {
          const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
          g.addColorStop(0, 'rgba(62,224,143,0.05)'); g.addColorStop(1, 'rgba(62,224,143,0.32)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(62,224,143,0.95)'; ctx.lineWidth = Math.max(0.2, 3 * mpp); ctx.stroke();
          if (!S.dummy) { ctx.scale(mpp, mpp); ctx.font = '900 15px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText(t('school.fx.stop').replace('!', ''), 0, 0); }
        } else {
          ctx.strokeStyle = tg.ring === 'round' ? 'rgba(255,224,102,0.55)' : 'rgba(255,181,71,0.9)';
          ctx.lineWidth = Math.max(0.2, 3 * mpp); ctx.setLineDash([7 * mpp, 6 * mpp]); ctx.lineDashOffset = -tm * 12 * mpp;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
      if (S.dummy) drawDummy(ctx, sc);
      // ghosts around the boat (not in pro, not during transitions)
      if (S.phase === 'go' && s && S.wait <= 0 && !pro) {
        const z = s.zone ? s.zone() : null;
        if (z) drawZone(ctx, sc, z);
        const tr = s.turn ? s.turn() : null;
        if (tr) drawTurn(ctx, sc, tr);
      }
    }
    function drawZone(ctx, sc, z) {
      const mpp = sc.mpp, Rz = Math.max(cls.length * 2.4, 74 * mpp);
      const h1 = H(z.side * z.lo), h2 = H(z.side * z.hi), hm = H(z.side * (z.lo + z.hi) / 2);
      const a1 = h1 - Math.PI / 2, a2 = h2 - Math.PI / 2;
      const inside = Math.abs(U.angDiff(boat.heading, hm)) <= R((z.hi - z.lo) / 2 + tol);
      const cw = U.wrapPi(a2 - a1) > 0;
      ctx.save(); ctx.translate(boat.x, boat.y);
      const g = ctx.createRadialGradient(0, 0, Rz * 0.25, 0, 0, Rz);
      const col = inside ? '62,224,143' : '255,255,255';
      g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(1, 'rgba(' + col + ',' + (inside ? 0.38 : 0.22) + ')');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Rz, a1, a2, !cw); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = Math.max(0.12, 2 * mpp);
      ctx.beginPath(); ctx.arc(0, 0, Rz, a1, a2, !cw); ctx.stroke();
      // centre arrow
      const v = U.vec(hm), L0 = Rz * 0.45, L1 = Rz * 1.12, hs = Math.max(0.8, 10 * mpp);
      const pulse = inside ? 1 : 0.6 + 0.4 * Math.sin(sc.t * 6);
      ctx.strokeStyle = 'rgba(' + (inside ? '62,224,143' : '255,255,255') + ',' + (0.9 * pulse) + ')'; ctx.lineWidth = Math.max(0.2, 4 * mpp); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(v.x * L0, v.y * L0); ctx.lineTo(v.x * L1, v.y * L1); ctx.stroke();
      const px = -v.y, py = v.x; ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(v.x * (L1 + hs), v.y * (L1 + hs)); ctx.lineTo(v.x * L1 + px * hs * 0.7, v.y * L1 + py * hs * 0.7); ctx.lineTo(v.x * L1 - px * hs * 0.7, v.y * L1 - py * hs * 0.7); ctx.closePath(); ctx.fill();
      // label (which point of sail)
      const key = z.lo >= 155 ? 'run' : z.lo >= 110 ? 'broad' : z.lo >= 70 ? 'beam' : 'close';
      const lv = U.vec(hm), lr = Rz * 1.12 + 22 * mpp;
      ctx.translate(lv.x * lr, lv.y * lr); ctx.scale(mpp, mpp);
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(13,19,33,0.75)'; ctx.strokeText(t('school.dia.' + key), 0, 0);
      ctx.fillStyle = inside ? '#3ee08f' : '#fff'; ctx.fillText(t('school.dia.' + key), 0, 0);
      ctx.restore();
    }
    function drawTurn(ctx, sc, tr) {
      const mpp = sc.mpp, Rt = Math.max(cls.length * 1.7, 52 * mpp);
      const a0 = boat.heading - Math.PI / 2;
      let sweep = U.wrapPi(tr.to - boat.heading);
      if (tr.dir > 0 && sweep < 0) sweep += TAU; else if (tr.dir < 0 && sweep > 0) sweep -= TAU;
      if (Math.abs(sweep) < 0.08) return;
      ctx.save(); ctx.translate(boat.x, boat.y);
      ctx.strokeStyle = 'rgba(255,214,94,0.95)'; ctx.lineWidth = Math.max(0.25, 5 * mpp); ctx.lineCap = 'round';
      ctx.setLineDash([10 * mpp, 7 * mpp]); ctx.lineDashOffset = -sc.t * 22 * mpp * Math.sign(sweep);
      ctx.beginPath(); ctx.arc(0, 0, Rt, a0, a0 + sweep, sweep < 0); ctx.stroke(); ctx.setLineDash([]);
      const ae = a0 + sweep, ex = Math.cos(ae) * Rt, ey = Math.sin(ae) * Rt, d = Math.sign(sweep);
      const tx = -Math.sin(ae) * d, ty = Math.cos(ae) * d, hs = Math.max(1, 13 * mpp);
      ctx.fillStyle = 'rgba(255,214,94,0.95)';
      ctx.beginPath(); ctx.moveTo(ex + tx * hs, ey + ty * hs); ctx.lineTo(ex - ty * hs * 0.6, ey + tx * hs * 0.6); ctx.lineTo(ex + ty * hs * 0.6, ey - tx * hs * 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function drawEight(ctx, sc) {
      const mpp = sc.mpp, a = 33 * kD, sgn = S.eightDir ? -S.eightDir : 1;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(0.2, 3 * mpp); ctx.setLineDash([8 * mpp, 8 * mpp]);
      ctx.lineDashOffset = sc.t * 14 * mpp * sgn;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const q = i / 120 * TAU, d = 1 + Math.sin(q) * Math.sin(q);
        const xr = a * Math.cos(q) / d, yu = -a * Math.sin(q) * Math.cos(q) / d * 1.1;   // along RT / UP
        const x = C.x + RT.x * xr + UP.x * yu, y = C.y + RT.y * xr + UP.y * yu;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }
    function drawDummy(ctx, sc) {
      const d = S.dummy, mpp = sc.mpp, tm = sc.t;
      if (d.picked >= 0.5) return;
      const k = Math.max(1, 15 * mpp / 0.55) * (d.picked >= 0 ? 1 - d.picked * 2 : 1);
      ctx.save(); ctx.translate(d.x, d.y);
      const rp = (tm * 0.7) % 1;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * (1 - rp)) + ')'; ctx.lineWidth = Math.max(0.05, 2 * mpp);
      ctx.beginPath(); ctx.arc(0, 0, (0.8 + rp * 1.6) * k * 0.55, 0, TAU); ctx.stroke();
      ctx.scale(k, k); ctx.rotate(Math.sin(tm * 1.3) * 0.3);
      ctx.fillStyle = 'rgba(0,30,60,0.3)'; ctx.beginPath(); ctx.ellipse(0.06, 0.08, 0.5, 0.42, 0, 0, TAU); ctx.fill();
      const wave = Math.sin(tm * 7) * 0.5;
      ctx.strokeStyle = '#f6c39f'; ctx.lineWidth = 0.13; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.3, -0.05); ctx.lineTo(-0.62, -0.42 + wave * 0.3); ctx.moveTo(0.3, -0.05); ctx.lineTo(0.62, -0.42 - wave * 0.3); ctx.stroke();
      ctx.fillStyle = '#ff7a3d'; ctx.strokeStyle = '#b8461b'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.ellipse(0, 0.05, 0.34, 0.3, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd25e'; ctx.fillRect(-0.3, 0.02, 0.6, 0.07);
      ctx.fillStyle = '#f6c39f'; ctx.beginPath(); ctx.arc(0, -0.12, 0.17, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6b3a20'; ctx.beginPath(); ctx.arc(0, -0.16, 0.15, Math.PI, TAU); ctx.fill();
      ctx.restore();
      if (sc.pill && d.picked < 0) sc.pill(ctx, d.x, d.y, t('school.mobName'), { dy: -34, bg: 'rgba(232,50,60,0.85)' });
    }
    // screen space: edge arrow to the target (from sail.js), keeps clear of HUD, panel and controls
    function drawScreen(ctx, sc) {
      const s = S.step;
      if (S.phase !== 'go' || !s || !s.target || S.wait > 0) return;
      const tg = s.target(); if (!tg) return;
      const p = sc.worldToScreen(tg.x, tg.y), W = sc.w, Hh = sc.h;
      const hb = hud.el.getBoundingClientRect(), pb = panel.getBoundingClientRect(), land = Hh < 500;
      const m = { l: land ? 150 : 34, r: land ? 150 : 34, t: Math.max(60, hb.bottom + 34, W < 560 ? pb.bottom + 30 : 0), b: land ? 60 : W < 700 ? 200 : 140 };
      const dd = Math.round(dist(tg));
      ctx.font = '900 13px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const col = tg.color || '#ffb547';
      if (p.x > m.l && p.x < W - m.r && p.y > m.t && p.y < Hh - m.b) {
        const by = p.y - 34 - Math.abs(Math.sin(sc.t * 4)) * 8;
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(13,19,33,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 10, by - 8); ctx.lineTo(p.x + 10, by - 8); ctx.lineTo(p.x, by + 4); ctx.closePath(); ctx.stroke(); ctx.fill();
        return;
      }
      const cx = W / 2, cy = Hh / 2, dx = p.x - cx, dy = p.y - cy;
      const k = Math.min(Math.abs((dx > 0 ? W - m.r - cx : cx - m.l) / (dx || 1e-6)), Math.abs((dy > 0 ? Hh - m.b - cy : cy - m.t) / (dy || 1e-6)));
      const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx);
      const pulse = 1 + 0.08 * Math.sin(sc.t * 6);
      ctx.save(); ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(13,19,33,0.72)'; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.rotate(ang); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(19, -9); ctx.lineTo(19, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillText(tg.label && String(tg.label).length < 4 ? tg.label : dd + ' m', ax, ay);
      if (tg.label && String(tg.label).length < 4) { ctx.font = '800 10px ui-rounded,"Segoe UI",system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(dd + ' m', ax, ay + 32); }
    }

    // ==================================================================== instance
    function setupStart() {
      const st = L.start;
      placeBoat(at(st.u, st.r), st.twa, st.v);
      if (L.init) L.init();
      for (const m of S.marks) if (!m.scale) m.scale = 1.6;
    }
    setupStart();

    function start() {
      ambient();
      paintPanel(true);
    }
    function beginLesson() {
      if (S.phase !== 'card') return;
      closeCard();
      sfx('whistle', { vol: 0.5 }); sfx('go', { vol: 0.5 });
      S.phase = 'go';
      scene.fixedZoom = null;
      enterStep(0);
    }

    function update(dt) {
      env.t += dt;
      wind.update(dt);
      if ((S.windT += dt) > 2) { S.windT = 0; wind.recenter(boat.x, boat.y); }
      const st = ctrl.state;
      if (S.phase === 'card') { // hold the boat on its start spot while the card is up; sails and heel stay alive
        const hold = { x: boat.x, y: boat.y, heading: boat.heading, distanceSailed: boat.distanceSailed };
        controls = KOS.Input.toControls(st, boat, controls, dt);
        controls.rudder = 0;
        if (L.manualTrim) controls.autoTrim = false;
        KOS.Physics.step(boat, controls, env, dt);
        Object.assign(boat, hold);
        hudTick(dt);
        return;
      }
      controls = KOS.Input.toControls(st, boat, controls, dt);
      controls.autoHike = easy && !L.hike;
      if (L.manualTrim && st.autoTrim) { ctrl.setAutoTrim(false); controls.autoTrim = false; tip('autoOff', true); }
      if (autopilot && S.phase === 'go') applyAutopilot();
      KOS.Physics.step(boat, controls, env, dt);
      KOS.Physics.collide([boat], venue, S.marks.filter(m => m.solid));
      if (controls.autoTrim) ctrl.setSheet(boat.sheet);
      if (!pro && L.id !== 'irons') scene.showNoGo = !!L.noGo || (easy && (Math.abs(boat.twa) < cls.noGo + 0.12 || boat.inIrons));
      else if (L.id === 'irons') scene.showNoGo = true;
      // spawn pop for marks
      for (const m of S.marks) if (m.scale < 1.6) { const a = U.clamp((S.time - m.bornT) / 0.5, 0, 1); m.scale = 1.6 * (a < 1 ? 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2) : 1); if (a >= 1) m.scale = 1.6; }
      if (S.dummy) {
        const dw = U.vec(WD + Math.PI); S.dummy.x += dw.x * 0.1 * dt; S.dummy.y += dw.y * 0.1 * dt;
        if (S.dummy.picked >= 0) S.dummy.picked += dt;
      }
      S.groundCd -= dt;
      if (boat.inIrons && S.phase === 'go' && L.id !== 'irons' && !S.ironsCounted) {
        S.ironsT = (S.ironsT || 0) + dt;
        if (S.ironsT > (easy ? 3.5 : 2.5)) { S.ironsCounted = true; if (S.step && S.step.ironsErr) { mistake(); tip('ironsTack', true); } else tip('irons'); }
      }
      if (L.id === 'irons' && S.phase === 'go' && S.step && S.step.id !== 'go' && boat.speed > 0.12 && twaD() > 12 && controls.rudder * boat.twa > 0.12 && !autopilot) tip('straighten');
      if (S.reply != null) { S.reply -= dt; if (S.reply <= 0) { S.reply = null; floatText(t('school.call.ready'), '#3ee08f', boat.x + 1.5, boat.y); sfx('pop', { pitch: 1.3 }); } }

      if (S.phase === 'go') {
        S.time += dt;
        if (S.wait > 0) { S.wait -= dt; if (S.wait <= 0) enterStep(S.idx + 1); }
        else if (S.step) {
          const s = S.step;
          if (s.track) { s.trkT += dt; if (s.track()) s.trk += dt; }
          const p = s.tick(dt);
          s.p = Math.max(0, Math.min(1, p));
          if (p >= 1) stepDone();
        }
        sailFeedback(dt);
      }
      if (S.phase === 'done' && S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      S.stepFlash = Math.max(0, S.stepFlash - dt);
      hudTick(dt);
    }

    function sailFeedback(dt) {
      if (S.step && S.step.hint && S.time - S.stepT0 > 7 && S.step.p < 0.2) tip(S.step.hint);
      S.luffT -= dt;
      if (boat.luffing && !boat.inIrons && S.luffT <= 0 && Math.abs(boat.twa) > cls.noGo) { sfx('luff', { vol: 0.3 }); S.luffT = 1.1; if (!controls.autoTrim && L.id !== 'trim') tip('luff'); }
      if (boat.stalled && !controls.autoTrim && Math.abs(boat.speed) > 0.3 && L.id !== 'trim') tip('stall');
      const base = wind.base ? wind.base.speed : P.windKn;
      const gusty = boat.tws > base * 1.18;
      if (gusty && !S.gustOn) { S.gustOn = true; sfx('whoosh', { vol: 0.4 }); floatText(t('school.fx.gust'), '#9fe7ff'); if (L.hike) tip('gust'); }
      else if (!gusty && boat.tws < base * 1.08) S.gustOn = false;
    }

    function hudTick(dt) {
      S.hudT -= dt; S.ambT -= dt;
      if (S.hudT <= 0) {
        S.hudT = 0.1;
        hud.update({ wind: { dir: boat.windDir || wind.dir, speed: boat.tws || wind.speed }, speed: U.kn(Math.abs(boat.speed)), pos: boat.pos,
          timer: S.time * 1000, heel: boat.heel, heelMax: L.hike ? hikeFlat / 0.8 : cls.capsizeHeel || 0.8 });
        ctrl.setIdealSheet(controls.autoTrim || boat.inIrons ? null : KOS.Physics.idealSheet(boat), L.manualTrim ? (easy ? 0.11 : pro ? 0.05 : 0.08) : 0.07);
        if (S.pathLine && S.step && S.step.target) { const tg = S.step.target(); if (tg) { S.pathLine.a.x = boat.x; S.pathLine.a.y = boat.y; S.pathLine.b.x = tg.x; S.pathLine.b.y = tg.y; } }
        paintPanel(false);
      }
      if (S.ambT <= 0) { S.ambT = 0.5; ambient(); }
    }
    function ambient() {
      try { KOS.Audio.ambient({ wind: boat.tws || P.windKn, waves: U.clamp(0.25 + (boat.tws || P.windKn) / 22 + Math.abs(boat.speed) / 12, 0, 1), harbor: 0.15 }); } catch (e) { /* optional */ }
    }

    function render(alpha) { scene.render(alpha); }

    function destroy() {
      for (const k in handlers) KOS.Events.off(k, handlers[k]);
      host.layer.removeEventListener('wheel', onWheel);
      flashTimers.forEach(clearTimeout);
      ctrl.detach();
      hud.destroy();
      panel.remove();
      if (card) card.remove();
      if (coachApi && coachApi.close) coachApi.close(true);
      scene.destroy();
      try { KOS.Audio.ambient(null); KOS.Audio.engine(null); } catch (e) { /* optional */ }
    }
    function pause() { try { KOS.Audio.ambient(null); } catch (e) { /* optional */ } }
    function resume() { ambient(); }
    function onResize() { scene.resize(); applyZoom(); }

    // ---- test hooks: a simple lesson-aware bot (uses KOS.AI for "go to" targets) + skipIntro
    let autopilot = null;
    function setAutopilot(on) { autopilot = on ? { helm: KOS.AI.createHelm(boat, { skill: 0.95, seed: 5 }), spi: false } : null; }
    function applyAutopilot() {
      const s = S.step; if (!s || !s.auto || S.wait > 0) return;
      const a = s.auto() || {};
      if (a.target || a.courseAll) {
        let plan;
        if (a.target) plan = { target: { x: a.target.x, y: a.target.y, r: 2 } };
        else { if (!autopilot.plan || autopilot.plan.course !== a.courseAll) autopilot.plan = { course: a.courseAll }; plan = autopilot.plan; if (autopilot.legSet !== S.idx) { plan.leg = S.idx; autopilot.legSet = S.idx; } else delete plan.leg; }
        const c = autopilot.helm.think(env, plan, [boat]);
        controls.rudder = c.rudder;
      } else if (a.heading != null) {
        const rev = a.irons && !easy && boat.speed < -0.03 ? -1 : 1;     // sternway: the rudder works the other way round
        controls.rudder = U.clamp((U.angDiff(boat.heading, a.heading) * 2.2 - boat.yawRate * 0.4) * rev, -1, 1);
      } else if (a.rudder != null) controls.rudder = a.rudder;
      if (a.hike != null) { controls.hike = a.hike; controls.autoHike = false; }
      if (a.spi != null) { controls.spinnaker = a.spi; ctrl.setSpinnaker(a.spi); }
      if (a.sheet || !controls.autoTrim) { controls.sheet = KOS.Physics.idealSheet(boat); ctrl.setSheet(controls.sheet); }
    }
    function skipIntro() { beginLesson(); }

    return { start, update, render, destroy, pause, resume, onResize, boat, scene, state: S, lesson: L, ctrl, setAutopilot, skipIntro, get controls() { return controls; } };
  }
})(typeof window !== 'undefined' ? window : globalThis);
