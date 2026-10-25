// KØS SEJL — js/core/boatfacts.js
// KOS.BoatFacts: researched facts for the Bådkort (boat card), per boat id. Pure data.
//   Club fields: weight {twoPerson, total, rows:[{label,sail,core,ext}]} (KØS weight windows; edge = ext +-2.5), sails [{label,m2}] (club rigs shown on the card),
//   gennaker (m2), rigs{da,en}, sailNoteClub (true = show "klubbens tal"), next [{id,name,why{da,en}}], nextIntro{da,en}.
//   KOS.BoatFacts.get(id) -> { designer, year, country{da,en}, status{da,en}, sailor{da,en}, hull (kg), facts:[{da,en}], teaser:[idx], club:[{da,en}] }
// Every fact is sourced in docs/reference/boat-facts.md (not shown in the game). Fields that could not be verified are left out.
// `club` holds ONLY what SPEC.md "Club facts" says about the KØS boats; no club numbers are invented.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const f = (da, en) => ({ da, en });
  const row = (label, sail, core, ext) => ({ label, sail, core, ext });
  const DATA = {
    opti: {
      designer: 'Clark Mills', year: 1947, country: f('USA', 'USA'), status: f('World Sailing-klasse', 'World Sailing class'),
      sailor: f('7–15 år', 'Age 7–15'), hull: 35,
      facts: [
        f('Optimisten blev tegnet i 1947 af Clark Mills i Clearwater i Florida.', 'The Optimist was designed in 1947 by Clark Mills in Clearwater, Florida.'),
        f('Det er verdens største klasse for unge kapsejlere.', 'It is the biggest youth racing class in the world.'),
        f('Den har kun ét sejl på 3,3 kvadratmeter – ingen fok og ingen gennaker.', 'It has just one sail of 3.3 square metres – no jib and no gennaker.'),
        f('Axel Damgaard tog den med til Europa.', 'Axel Damgaard brought it to Europe.'),
      ],
      teaser: [0, 1],
      weight: { rows: [row('Optimist', 3.3, [38, 48], [30, 50])] },
      next: [
        { id: 'tera', name: f('RS Tera Pro', 'RS Tera Pro'), why: f('Passer, når du vejer ca. 45–55 kg, og der sejler flere i den.', 'Fits when you weigh about 45–55 kg and others sail it too.') },
        { id: 'ilca', name: f('ILCA 4', 'ILCA 4'), why: f('Passer ved ca. 50–57 kg.', 'Fits at about 50–57 kg.') },
        { id: 'feva', name: f('RS Feva', 'RS Feva'), why: f('Sejles to og to, og passer ved ca. 45–52 kg pr. sejler.', 'Sailed in pairs, and fits at about 45–52 kg per sailor.') },
      ],
      club: [
        f('Optimisten er stadig KØS’ første båd til de yngste og den vigtigste introduktionsbåd.', 'The Optimist is still the first KØS boat for the youngest and the main introduction boat.'),
        f('Halvsejl eller mastforhøjer giver mindre kraft på et skrog, du kender i forvejen. Det er en god start i hård vind.', 'A half sail or a mast raiser gives less power on a hull you already know. A good start in strong wind.'),
        f('KØS’ optimister er hvide med blåt mærke og blåt sejlnummer.', 'The KØS Optimists are white with a blue logo and a blue sail number.'),
        f('Mast, sejl og bom hører sammen. Ror og sværd lægger du i båden på land.', 'The mast, sail and boom go together. You put the rudder and board in the boat on land.'),
        f('Sejlet rulles ikke. Det bliver siddende på masten, og masten med sejlet bæres ind og ud af skuret.', 'The sail is never rolled. It stays on the mast, and the mast with the sail is carried in and out of the shed.'),
        f('Storskødet sidder midt på bommen foran sejleren – ikke yderst på bommen som på Tera, Feva og ILCA.', 'The mainsheet is fastened to the middle of the boom in front of the sailor – not at the end of the boom as on the Tera, Feva and ILCA.'),
      ],
    },
    tera: {
      designer: 'Paul Handley', country: f('Storbritannien', 'UK'), status: f('World Sailing-klasse', 'World Sailing class'),
      facts: [
        f('Teraen er tegnet af Paul Handley og bygget af RS Sailing i England.', 'The Tera was designed by Paul Handley and built by RS Sailing in England.'),
        f('Den fås med tre størrelser sejl: Mini til børn helt ned til 5 år, Sport og Pro.', 'It comes with three sail sizes: Mini for kids as young as 5, Sport and Pro.'),
        f('Cockpittet tømmer sig selv, og sværdet flyder. Så er den nem at få op efter en kæntring.', 'The cockpit drains itself and the daggerboard floats. That makes it easy to recover after a capsize.'),
      ],
      teaser: [0, 1],
      sails: [{ label: f('Sport', 'Sport'), m2: 3.7 }, { label: f('Pro', 'Pro'), m2: 4.8 }],
      weight: { rows: [row('RS Tera Sport', 3.7, [38, 45], [34, 50]), row('RS Tera Pro', 4.8, [45, 55], [40, 60])] },
      next: [
        { id: 'ilca', name: f('ILCA 4', 'ILCA 4'), why: f('Passer, når du vejer ca. 50–57 kg.', 'Fits when you weigh about 50–57 kg.') },
      ],
      club: [
        f('KØS har Teraen som Sport og Pro. Pro har det største sejl.', 'KØS has the Tera as Sport and Pro. The Pro has the bigger sail.'),
        f('Et stormsejl holder båden håndterbar, når vinden er over det normale.', 'A storm sail keeps the boat manageable when the wind is above normal.'),
        f('Mast og sejl sættes op sammen. Mellem turene ligger masten med sejlet rullet om i skuret.', 'The mast and sail are stepped together. Between sessions the mast with the sail rolled round it lives in the shed.'),
      ],
    },
    feva: {
      designer: 'Paul Handley', year: 2002, country: f('Storbritannien', 'UK'), status: f('World Sailing-klasse', 'World Sailing class'),
      facts: [
        f('Fevaen blev tegnet i 2002 af Paul Handley og bygges af RS Sailing.', 'The Feva was designed in 2002 by Paul Handley and is built by RS Sailing.'),
        f('Gennakeren er let at hejse og tage ned med kun én line.', 'The gennaker is easy to hoist and drop with just one line.'),
        f('Skroget er lavet af hård plast (rotationsstøbt polyethylen), så det tåler lidt af hvert.', 'The hull is made of tough rotomoulded polyethylene, so it can take a few knocks.'),
        f('Der er plads til 1–3 sejlere, men 2 er bedst.', 'There is room for 1–3 sailors, but 2 is best.'),
      ],
      teaser: [1, 3],
      sails: [{ label: null, m2: 6.4 }], sailNoteClub: true, gennaker: 7.0,
      weight: { twoPerson: true, total: [85, 110], rows: [row('RS Feva', 6.4, [45, 52], [43, 55])] },
      next: [
        { id: '29er', name: f('29’er', '29er'), why: f('Passer ved ca. 58–64 kg pr. sejler.', 'Fits at about 58–64 kg per sailor.') },
      ],
      club: [
        f('Fevaen sejles altid med to sejlere.', 'The Feva is always sailed with two sailors.'),
        f('Et stormsejl gør de første ture overskuelige.', 'A storm sail makes the first trips manageable.'),
        f('Masten, vanterne og bovsprydet bliver stående hele sæsonen.', 'The mast, shrouds and bowsprit stay up all season.'),
        f('KØS’ Feva har grå og lime-gule sejl og en gul gennaker.', 'The KØS Fevas have grey and lime-yellow sails and a yellow gennaker.'),
      ],
    },
    zest: {
      designer: 'Jo Richards', year: 2017, country: f('Storbritannien', 'UK'),
      facts: [
        f('Zesten kom frem i 2017 og er tegnet af Jo Richards.', 'The Zest came out in 2017 and was designed by Jo Richards.'),
        f('Skroget er af hård plast, og storsejlet kan rulles ind om masten.', 'The hull is tough plastic and the mainsail can be rolled in around the mast.'),
        f('Den bruges til sejlerskole, familieture og som lille hjælpebåd til store yachter.', 'It is used for sailing lessons, family trips and even as a small tender for big yachts.'),
        f('I 2018 vandt den prisen "Best Daysailer" i bladet SAIL.', 'In 2018 it won "Best Daysailer" from SAIL magazine.'),
      ],
      teaser: [2, 3],
      next: [
        { id: 'opti', name: f('Optimist', 'Optimist'), why: f('Her sejler du helt selv. Zesten er båden, du sejler sammen med mor eller far.', 'There you sail all on your own. The Zest is the boat you sail with mum or dad.') },
      ],
      club: [
        f('Zesten er en introduktionsbåd: en stabil begynderjolle, som du kan sejle med eller uden fok.', 'The Zest is an introduction boat: a stable beginner dinghy you can sail with or without the jib.'),
        f('Den bruges på holdene for mikrosejlere, hvor de yngste sejler sammen med en forælder. Det passer rigtig godt til Zesten.', 'It is used in the classes for micro-sailors (mikrosejlere), where the youngest kids sail together with a parent. The Zest is great for that.'),
        f('Der er plads til en træner eller voksen og to børn.', 'There is room for a Træner or an adult and two kids.'),
        f('Fokken bindes på masten, før masten rejses. Mellem turene ligger masten med sejlet rullet om i skuret.', 'The jib is tied to the mast before the mast is raised. Between sessions the mast with the sail rolled round it lives in the shed.'),
      ],
    },
    ilca: {
      designer: 'Bruce Kirby og Ian Bruce', year: 1970, country: f('Canada', 'Canada'), status: f('Olympisk klasse', 'Olympic class'), hull: 59,
      facts: [
        f('I 1970 tegnede Bruce Kirby bådens form. Den hed dengang Laser.', 'In 1970 Bruce Kirby drew the shape of the boat. It was called the Laser back then.'),
        f('I 2019 fik den navnet ILCA efter en strid om navnet Laser.', 'In 2019 it was renamed ILCA after a dispute over the name Laser.'),
        f('Der er bygget over 223.000 både i 120 lande.', 'Over 223,000 boats have been built in 120 countries.'),
        f('Den har været olympisk siden 1996 – og med det mindre sejl ILCA 6 for kvinder siden 2008.', 'It has been Olympic since 1996 – and with the smaller ILCA 6 sail for women since 2008.'),
        f('Du kan skifte mellem tre størrelser rig: ILCA 7, 6 og 4.', 'You can pick between three rig sizes: ILCA 7, 6 and 4.'),
      ],
      teaser: [1, 2],
      sails: [{ label: f('ILCA 4', 'ILCA 4'), m2: 4.7 }, { label: f('ILCA 6', 'ILCA 6'), m2: 5.76 }],
      rigs: f('4 · 6 · 7 (KØS sejler 4 og 6)', '4 · 6 · 7 (KØS sails 4 and 6)'),
      weight: { rows: [row('ILCA 4', 4.7, [50, 57], [45, 60]), row('ILCA 6', 5.76, [62, 72], [58, 75])] },
      next: [
        { id: 'ilca', name: f('ILCA 6', 'ILCA 6'), why: f('Samme båd med større rig, når du vejer ca. 62–72 kg.', 'The same boat with a bigger rig, when you weigh about 62–72 kg.') },
        { id: '29er', name: f('29’er', '29er'), why: f('Passer ved ca. 58–64 kg pr. sejler, hvis du vil sejle to.', 'Fits at about 58–64 kg per sailor, if you want to sail as a pair.') },
      ],
      club: [
        f('KØS sejler ILCA 4 og ILCA 6, men ikke ILCA 7.', 'KØS sails the ILCA 4 and ILCA 6, but not the ILCA 7.'),
        f('KØS’ ILCA’er er hvide med rødt ILCA-logo.', 'The KØS ILCAs are white with a red ILCA logo.'),
      ],
    },
    '29er': {
      designer: 'Julian Bethwaite', year: 1998, status: f('Ungdoms-VM-klasse', 'Youth World Championship class'), hull: 74,
      facts: [
        f('29’eren er tegnet af Julian Bethwaite og blev første gang bygget i 1998.', 'The 29er was designed by Julian Bethwaite and first built in 1998.'),
        f('Den har trapez, så sejlerne kan hænge langt ud over siden.', 'It has a trapeze, so the sailors can hang far out over the side.'),
        f('Den er en mindre udgave af den olympiske 49er og bruges til at træne til den.', 'It is a smaller version of the Olympic 49er and is used to train for it.'),
        f('Der er cirka 7.000 29’ere i verden.', 'There are about 7,000 29ers registered around the world.'),
      ],
      teaser: [1, 2],
      sails: [{ label: null, m2: 10.8 }], sailNoteClub: true,
      weight: { twoPerson: true, total: [110, 135], rows: [row('29er', 10.8, [58, 64], [55, 68])] },
      next: [
        { id: 'hboat', name: f('H-båd', 'H-boat'), why: f('En køl-båd med tre om bord.', 'A keelboat with three aboard.') },
      ],
      club: [
        f('KØS’ 29’ere har hvidt skrog, orange-røde sejlkanter og en lilla gennaker.', 'The KØS 29ers have a white hull, red-orange sail tape and a purple gennaker.'),
        f('Vinger, mast, trapez, bom og bovspryd er en del af båden.', 'The wings, mast, trapeze, boom and bowsprit are part of the boat.'),
      ],
    },
    hboat: {
      designer: 'Hans Groop', year: 1967, country: f('Finland', 'Finland'), status: f('International klasse', 'International class'),
      facts: [
        f('H-båden blev tegnet i 1967 af finnen Hans Groop.', 'The H-boat was designed in 1967 by the Finn Hans Groop.'),
        f('H’et står for Hestia, en græsk gudinde.', 'The H stands for Hestia, a Greek goddess.'),
        f('Der er lavet over 5.000 skrog.', 'More than 5,000 hulls have been made.'),
        f('Danske Paul Elvstrøm gjorde ror og mast bedre i 1971.', 'The Danish sailor Paul Elvstrøm improved the rudder and mast in 1971.'),
        f('Man sejler den med tre om bord.', 'You race it with a crew of three.'),
      ],
      teaser: [1, 3],
      club: [
        f('KØS’ H-både er røde med hvidt dæk og "KØS Sejlsport" på siden.', 'The KØS H-boats are red with a white deck and "KØS Sejlsport" on the side.'),
        f('Hele riggen bliver på båden hele sæsonen.', 'The whole rig stays on the boat all season.'),
      ],
    },
    j70: {
      designer: 'Alan Johnstone', year: 2012, country: f('USA', 'USA'), status: f('Klasse med VM og EM', 'Class with World and European championships'),
      facts: [
        f('J/70 er tegnet af Alan Johnstone og første gang bygget i 2012 af J Boats.', 'The J/70 was designed by Alan Johnstone and first built in 2012 by J Boats.'),
        f('Den har et bovspryd af kulfiber, som kan trækkes ind.', 'It has a carbon-fibre bowsprit that can be pulled in.'),
        f('Kølen kan hejses op, og den er tung af bly.', 'The keel can be lifted, and it is heavy with lead.'),
        f('I 2019 var der bygget mindst 1.451 J/70’ere.', 'By 2019 at least 1,451 J/70s had been built.'),
      ],
      teaser: [1, 3],
      club: [
        f('KØS’ J/70’ere ligger rigget inde i Svanemøllehavnen, syd for klubhuset.', 'The KØS J/70s are kept rigged inside Svanemøllehavnen, south of the clubhouse.'),
        f('Fokken ligger rullet på forstaget i en strømpe. Der er også en gennaker.', 'The jib lives furled on the forestay inside a sock. There is also a gennaker.'),
      ],
    },
    rib: {
      year: '1960’erne', country: f('Storbritannien (Wales)', 'UK (Wales)'),
      facts: [
        f('Ideen opstod omkring 1962 på Atlantic College i Wales, hos admiral Desmond Hoare.', 'The idea started around 1962 at Atlantic College in Wales, under Admiral Desmond Hoare.'),
        f('I 1964 lappede Hoare og eleverne en rift i bunden af en oppustelig redningsbåd med en plade krydsfiner.', 'In 1964 Hoare and his students fixed a torn bottom of an inflatable rescue boat with a sheet of plywood.'),
        f('Den første RIB, man kunne købe, var Avon Searider fra 1969.', 'The first RIB you could buy was the Avon Searider from 1969.'),
        f('RIB betyder en båd med hård bund og oppustelige slanger.', 'RIB means a boat with a hard bottom and air-filled tubes.'),
        f('RIB’er bruges til redning, patrulje og dykkerstøtte.', 'RIBs are used for rescue, patrol and dive support.'),
      ],
      teaser: [3, 4],
      club: [
        f('KØS’ RIB’er er orange med mørkegrå overflade og et sort "KØS" på stævnen.', 'The KØS RIBs are orange with a dark grey deck and a black "KØS" on the bow.'),
        f('De har gule oppustelige pølser, som bruges som mærker.', 'They carry yellow inflatable sausages that are used as marks.'),
      ],
    },
  };
  KOS.BoatFacts = { data: DATA, ids: Object.keys(DATA), get(id) { return DATA[id] || null; } };
})(typeof window !== 'undefined' ? window : globalThis);
