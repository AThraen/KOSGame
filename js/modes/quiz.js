// KØS SEJL — js/modes/quiz.js
// The 'quiz' mode (kind 'dom', hub area 'club'): sailing quiz with 70+ illustrated questions in Danish + English.
// Categories: vigeregler, bådens dele, knob, vejr & vind, sikkerhed, navigation/afmærkning, KØS & havnen.
// Each round draws N questions (deterministic per play count), has a per-question timer, a streak bonus,
// a "Spørg Søs" 50/50 lifeline (easy/normal) and an explanation after every answer.
// Test hooks: inst.setAutopilot(on) answers correctly by itself, inst.skipIntro() jumps to the first question.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const esc = s => (KOS.UI && KOS.UI.esc ? KOS.UI.esc(s) : String(s));

  // ======================================================================== 1. question bank
  // q(cat, img, [qDa, qEn], [[correctDa, correctEn], [wrongDa, wrongEn], ...], [explainDa, explainEn])
  // The correct answer is always written first; answers are shuffled at runtime.
  const BANK = [];
  function q(c, img, qq, a, ex) { BANK.push({ c, img, q: qq, a, ex }); }

  // ---- vigeregler (right of way)
  q('rules', 'portStbd', ['To joller mødes. Den ene har vinden ind over styrbord side, den anden over bagbord side. Hvem skal vige?', 'Two dinghies meet. One has the wind over her starboard side, the other over her port side. Who must keep clear?'],
    [['Båden på bagbords halse', 'The boat on port tack'], ['Båden på styrbords halse', 'The boat on starboard tack'], ['Den største båd', 'The biggest boat'], ['Den der kom sidst', 'The one that came last']],
    ['Bagbord viger for styrbord! Kommer vinden ind over din venstre side, er du på bagbords halse og skal holde af vejen.', 'Port gives way to starboard! If the wind comes over your left side you are on port tack and must keep clear.']);
  q('rules', 'windLee', ['To både sejler på samme halse ved siden af hinanden. Hvem skal vige?', 'Two boats sail side by side on the same tack. Who must keep clear?'],
    [['Luvbåden (den tættest på vinden)', 'The windward boat (closest to the wind)'], ['Læbåden', 'The leeward boat'], ['Den langsomste båd', 'The slowest boat'], ['Ingen af dem', 'Neither of them']],
    ['Luv viger for læ. Den båd, der er nærmest vinden, skal holde sig fri af den anden.', 'Windward keeps clear of leeward. The boat closest to the wind must stay clear of the other.']);
  q('rules', 'overtake', ['Du er ved at indhente en anden båd bagfra. Hvem skal vige?', 'You are catching up with another boat from behind. Who must keep clear?'],
    [['Dig – den der indhenter', 'You – the overtaking boat'], ['Båden foran dig', 'The boat ahead'], ['Den der er på styrbords halse', 'Whoever is on starboard'], ['Den der råber først', 'Whoever shouts first']],
    ['Den båd, der kommer klart agterfra, skal holde af vejen for båden foran.', 'A boat coming from clear astern must keep clear of the boat ahead.']);
  q('rules', 'tacking', ['Du er midt i en vending og står næsten i vindøjet. Hvad siger reglerne?', 'You are in the middle of a tack, almost head to wind. What do the rules say?'],
    [['Du skal holde dig fri af de andre', 'You must keep clear of the others'], ['Alle andre skal vige for dig', 'Everyone else must keep clear of you'], ['Du har altid ret, når du vender', 'You always have right of way when tacking'], ['Der gælder ingen regler', 'No rules apply']],
    ['En båd, der vender, skal holde sig fri af andre både, indtil den er færdig med vendingen.', 'A boat that is tacking must keep clear of other boats until the tack is finished.']);
  q('rules', 'motorSail', ['En motorbåd og en lille sejlbåd sejler mod hinanden på åbent vand. Hvem viger normalt?', 'A motorboat and a small sailing boat head towards each other on open water. Who normally gives way?'],
    [['Motorbåden', 'The motorboat'], ['Sejlbåden', 'The sailing boat'], ['Den hurtigste', 'The fastest'], ['Begge stopper', 'Both stop']],
    ['Motor viger for sejl – men pas på: store skibe, der ikke kan dreje, skal du altid holde dig fra.', 'Power gives way to sail – but careful: always stay away from big ships that cannot turn.']);
  q('rules', 'ship', ['En stor færge kommer sejlende i sejlrenden. Hvad gør du i din jolle?', 'A big ferry is coming along the channel. What do you do in your dinghy?'],
    [['Holder mig langt væk fra sejlrenden', 'Stay well away from the channel'], ['Sejler foran den – sejl har jo ret', 'Sail in front of it – sail has right of way'], ['Vinker, så den stopper', 'Wave so it stops'], ['Lægger mig midt i renden', 'Stop in the middle of the channel']],
    ['Store skibe kan hverken stoppe eller dreje hurtigt, og de kan ikke se dig tæt på. Hold dig ude af sejlrenden!', 'Big ships can neither stop nor turn quickly, and they cannot see you up close. Stay out of the channel!']);
  q('rules', 'headon', ['To motorbåde sejler direkte mod hinanden. Hvad skal de gøre?', 'Two motorboats are heading straight at each other. What should they do?'],
    [['Begge drejer til styrbord (højre)', 'Both turn to starboard (right)'], ['Begge drejer til bagbord (venstre)', 'Both turn to port (left)'], ['Den største sejler lige ud', 'The biggest keeps going'], ['Begge bakker', 'Both reverse']],
    ['Mødes to motorbåde stævn mod stævn, drejer begge til styrbord og passerer hinanden bagbord mod bagbord.', 'When two motorboats meet head on, both turn to starboard and pass port side to port side.']);
  q('rules', 'zone', ['Hvor stor er zonen omkring et mærke i kapsejlads?', 'How big is the zone around a mark in racing?'],
    [['Tre bådlængder', 'Three boat lengths'], ['En bådlængde', 'One boat length'], ['Ti meter', 'Ten metres'], ['Så langt du kan råbe', 'As far as you can shout']],
    ['Zonen er tre skroglængder rundt om mærket. Inde i zonen gælder reglen om mærkerum.', 'The zone is three hull lengths around the mark. Inside the zone the mark-room rule applies.']);
  q('rules', 'penalty', ['Du støder ind i en anden båd, og det er din skyld. Hvad er straffen i kapsejlads?', 'You hit another boat and it is your fault. What is the penalty in a race?'],
    [['To strafrunder (720°)', 'Two penalty turns (720°)'], ['En strafrunde (360°)', 'One penalty turn (360°)'], ['Du skal sejle hjem', 'You must sail home'], ['Ingen straf', 'No penalty']],
    ['Bryder du en vigeregel, tager du to hele runder – en 720’er – så hurtigt du kan, væk fra de andre.', 'If you break a right-of-way rule you do two full turns – a 720 – as soon as possible, away from the others.']);
  q('rules', 'markTouch', ['Du kommer til at røre et kapsejladsmærke. Hvad gør du?', 'You touch a race mark by accident. What do you do?'],
    [['Tager en strafrunde (360°)', 'Do one penalty turn (360°)'], ['Tager to strafrunder', 'Do two penalty turns'], ['Udgår af løbet', 'Retire from the race'], ['Ingenting', 'Nothing']],
    ['Rører du et mærke, er straffen én hel runde – en 360’er.', 'If you touch a mark, the penalty is one full turn – a 360.']);
  q('rules', 'flagP', ['Ved starten går flaget P op (blåt med en hvid firkant). Hvad betyder det?', 'At the start, flag P goes up (blue with a white square). What does it mean?'],
    [['Der er 4 minutter til start', 'There are 4 minutes to the start'], ['Starten er udsat', 'The start is postponed'], ['Alle skal sejle hjem', 'Everyone must sail home'], ['Nu er der start', 'The race starts now']],
    ['P er forberedelsessignalet: det går op 4 minutter før start og ned, når der er 1 minut tilbage.', 'P is the preparatory signal: it goes up 4 minutes before the start and comes down with 1 minute to go.']);
  q('rules', 'crossing', ['To motorbåde krydser hinandens kurs. Hvem skal vige?', 'Two motorboats are crossing. Who must give way?'],
    [['Den der har den anden på sin styrbord side', 'The one that has the other on her starboard side'], ['Den der har den anden på sin bagbord side', 'The one that has the other on her port side'], ['Den hurtigste', 'The fastest'], ['Den mindste', 'The smallest']],
    ['For motorbåde gælder: har du en båd på din styrbord side (højre), skal du vige for den.', 'For motorboats: if a boat is on your starboard (right) side, you give way to it.']);

  // ---- bådens dele (parts of the boat)
  q('parts', 'part:tiller', ['Hvad hedder stangen, du styrer jollen med?', 'What is the stick you steer the dinghy with called?'],
    [['Rorpinden', 'The tiller'], ['Bommen', 'The boom'], ['Masten', 'The mast'], ['Sværdet', 'The daggerboard']],
    ['Rorpinden sidder på roret. Skub den væk fra dig, og båden drejer op mod vinden.', 'The tiller is attached to the rudder. Push it away from you and the boat turns towards the wind.']);
  q('parts', 'part:boom', ['Hvad hedder stangen nederst på storsejlet, som svinger over, når du bommer?', 'What is the pole at the bottom of the mainsail that swings across when you gybe?'],
    [['Bommen', 'The boom'], ['Rorpinden', 'The tiller'], ['Sprydet', 'The sprit'], ['Rælingen', 'The gunwale']],
    ['Bommen holder sejlets underkant. Duk hovedet, når den svinger over!', 'The boom holds the foot of the sail. Duck your head when it swings across!']);
  q('parts', 'part:board', ['Hvad hedder pladen, der stikker ned gennem bunden og stopper båden i at drive sidelæns?', 'What is the board that sticks down through the hull and stops the boat sliding sideways?'],
    [['Sværdet', 'The daggerboard'], ['Roret', 'The rudder'], ['Kølen på en Opti', 'The keel of an Opti'], ['Øsekarret', 'The bailer']],
    ['Sværdet giver båden fat i vandet, så den kan sejle op mod vinden uden at drive i læ.', 'The daggerboard grips the water, so the boat can sail upwind without drifting sideways.']);
  q('parts', 'part:sheet', ['Hvad hedder tovet, du trimmer sejlet med?', 'What is the rope you trim the sail with called?'],
    [['Skødet', 'The sheet'], ['Faldet', 'The halyard'], ['Fangelinen', 'The painter'], ['Vanten', 'The shroud']],
    ['Med skødet haler du sejlet ind eller fierer det ud. Et sejl, der blafrer, skal hales ind.', 'With the sheet you pull the sail in or ease it out. A flapping sail needs sheeting in.']);
  q('parts', 'part:halyard', ['Hvilket tov bruger man til at hejse sejlet op i masten?', 'Which rope do you use to hoist the sail up the mast?'],
    [['Faldet', 'The halyard'], ['Skødet', 'The sheet'], ['Fangelinen', 'The painter'], ['Udhalet', 'The outhaul']],
    ['Faldet går op til toppen af masten. Når du haler i det, kommer sejlet op.', 'The halyard runs to the top of the mast. Pull it and the sail goes up.']);
  q('parts', 'part:bow', ['Hvad hedder den forreste ende af båden?', 'What is the front end of the boat called?'],
    [['Stævnen', 'The bow'], ['Agterspejlet', 'The transom'], ['Kahytten', 'The cabin'], ['Rælingen', 'The gunwale']],
    ['Forrest er stævnen, bagerst er agterenden med agterspejlet.', 'At the front is the bow, at the back the stern with the transom.']);
  q('parts', 'part:jib', ['Hvad hedder det lille sejl foran masten?', 'What is the small sail in front of the mast called?'],
    [['Fokken', 'The jib'], ['Storsejlet', 'The mainsail'], ['Spilet', 'The spinnaker'], ['Agterliget', 'The leech']],
    ['Fokken sidder foran masten, storsejlet bag den. En Opti har kun et storsejl.', 'The jib sits in front of the mast, the mainsail behind it. An Opti only has a mainsail.']);
  q('parts', 'part:luff', ['Hvad hedder sejlets forreste kant, der sidder ind mod masten?', 'What is the front edge of the sail, along the mast, called?'],
    [['Forliget', 'The luff'], ['Agterliget', 'The leech'], ['Underliget', 'The foot'], ['Skødehornet', 'The clew']],
    ['Forliget er forkanten, agterliget er bagkanten, og underliget er nederst langs bommen.', 'The luff is the front edge, the leech the back edge and the foot runs along the boom.']);
  q('parts', 'part:shrouds', ['Hvad hedder wirerne, der holder masten oppe fra siderne?', 'What are the wires that hold the mast up from the sides called?'],
    [['Vanterne', 'The shrouds'], ['Skøderne', 'The sheets'], ['Faldene', 'The halyards'], ['Trapezerne', 'The trapezes']],
    ['Vanterne holder masten fra siderne, og forstaget holder den forfra.', 'The shrouds hold the mast from the sides and the forestay holds it from the front.']);
  q('parts', 'bailer', ['Hvad bruger man et øsekar til?', 'What do you use a bailer for?'],
    [['At øse vand ud af båden', 'Scooping water out of the boat'], ['At drikke af', 'Drinking from'], ['At holde sejlet', 'Holding the sail'], ['At styre med', 'Steering']],
    ['I en Opti kommer der vand ind. Med øsekarret (der skal være bundet fast!) øser du det ud igen.', 'Water gets into an Opti. With the bailer (which must be tied on!) you scoop it out again.']);
  q('parts', 'boat:feva', ['Hvad hedder det store, bugede forsejl, en Feva bruger på slør og læns?', 'What is the big, bulging front sail a Feva uses when sailing downwind?'],
    [['Gennaker', 'Gennaker'], ['Stormfok', 'Storm jib'], ['Mesan', 'Mizzen'], ['Topsejl', 'Topsail']],
    ['Gennakeren er en slags spiler, der sættes fra et spryd i stævnen. Den giver masser af fart på slør og læns.', 'The gennaker is a kind of spinnaker set from a pole at the bow. It gives loads of speed downwind.']);
  q('parts', 'trapeze', ['Hvad er en trapez i en 29er?', 'What is a trapeze on a 29er?'],
    [['En wire, man hænger i ude over siden', 'A wire you hang from outside the boat'], ['En slags sejl', 'A kind of sail'], ['Et redskab til at øse', 'A bailing tool'], ['Et lys på masten', 'A light on the mast']],
    ['I trapezen står du ude på rælingen og hænger i en wire fra masten. Så kan du holde båden flad i meget vind.', 'On the trapeze you stand on the edge hanging from a wire from the mast. That keeps the boat flat in strong wind.']);
  q('parts', 'boat:hboat', ['Hvorfor kæntrer en H-båd ikke som en jolle?', 'Why does an H-boat not capsize like a dinghy?'],
    [['Den har en tung køl', 'It has a heavy keel'], ['Den har ingen sejl', 'It has no sails'], ['Den er lavet af træ', 'It is made of wood'], ['Den sejler kun i havnen', 'It only sails in the harbour']],
    ['Kølen er tung og sidder dybt. Den trækker båden op igen, når den krænger.', 'The keel is heavy and deep. It pulls the boat back up when it heels.']);
  q('parts', 'boat:ilca', ['ILCA-jollen hed tidligere noget andet. Hvad?', 'The ILCA dinghy used to have another name. What?'],
    [['Laser', 'Laser'], ['Optimist', 'Optimist'], ['Pirat', 'Pirat'], ['Folkebåd', 'Folkboat']],
    ['ILCA er den samme populære enmandsjolle, som mange kender som Laser.', 'ILCA is the same popular single-hander many people know as the Laser.']);

  // ---- knob (knots)
  q('knots', 'knot:bowline', ['Hvilket knob laver en fast løkke, der ikke strammer sig sammen?', 'Which knot makes a fixed loop that does not tighten?'],
    [['Pælestik', 'Bowline'], ['Råbåndsknob', 'Reef knot'], ['Ottetalsknob', 'Figure-eight knot'], ['Halvstik', 'Half hitch']],
    ['Pælestikket er sømandens yndlingsknob: løkken holder, og det er let at løse op igen.', 'The bowline is the sailor’s favourite: the loop holds and is easy to untie again.']);
  q('knots', 'rabbit', ['”Kaninen kommer op af hullet, løber rundt om træet og ned i hullet igen.” Hvilket knob er det?', '“The rabbit comes out of the hole, runs round the tree and back down the hole.” Which knot is that?'],
    [['Pælestik', 'Bowline'], ['Dobbelt halvstik', 'Clove hitch'], ['Ottetalsknob', 'Figure-eight knot'], ['Råbåndsknob', 'Reef knot']],
    ['Hullet er den lille løkke, træet er den faste part, og kaninen er tampen.', 'The hole is the small loop, the tree is the standing part and the rabbit is the end.']);
  q('knots', 'knot:eight', ['Hvorfor slår man et ottetalsknob i enden af skødet?', 'Why do you tie a figure-eight knot at the end of the sheet?'],
    [['Så det ikke smutter ud gennem blokken', 'So it cannot run out through the block'], ['For at det ser pænt ud', 'Because it looks nice'], ['For at gøre skødet længere', 'To make the sheet longer'], ['For at fortøje båden', 'To moor the boat']],
    ['Ottetalsknobet er et stopperknob. Det er tykt og kan ikke trækkes gennem blokken.', 'The figure-eight is a stopper knot. It is fat and cannot be pulled through the block.']);
  q('knots', 'knot:reef', ['Hvilket knob binder to ender af samme tykkelse sammen, f.eks. når man reber sejlet?', 'Which knot ties two ends of the same thickness together, e.g. when reefing a sail?'],
    [['Råbåndsknob', 'Reef knot'], ['Pælestik', 'Bowline'], ['Ottetalsknob', 'Figure-eight knot'], ['Klampe', 'Cleat hitch']],
    ['Råbåndsknobet: højre over venstre og under, venstre over højre og under.', 'The reef knot: right over left and under, left over right and under.']);
  q('knots', 'knot:reef', ['Laver du råbåndsknobet forkert, får du et knob, der kan glide op. Hvad hedder det?', 'Tie a reef knot wrong and you get a knot that can slip. What is it called?'],
    [['Kællingeknude', 'Granny knot'], ['Pælestik', 'Bowline'], ['Flagstik', 'Sheet bend'], ['Klampe', 'Cleat hitch']],
    ['Krydser du samme vej begge gange, bliver det en kællingeknude. Den glider – så husk at skifte!', 'Cross the same way both times and you get a granny knot. It slips – so remember to switch!']);
  q('knots', 'knot:clove', ['Hvilket knob er hurtigt at slå om en pæl eller en stang, f.eks. til en fender?', 'Which knot is quick to tie around a post or rail, e.g. for a fender?'],
    [['Dobbelt halvstik', 'Clove hitch'], ['Råbåndsknob', 'Reef knot'], ['Ottetalsknob', 'Figure-eight knot'], ['Kællingeknude', 'Granny knot']],
    ['Dobbelt halvstik er to tørn om stangen, hvor den sidste stikkes under krydset.', 'The clove hitch is two turns around the rail with the last one tucked under the cross.']);
  q('knots', 'knot:cleat', ['Hvordan gør man et tov fast på en klampe?', 'How do you make a rope fast on a cleat?'],
    [['Rundtørn, ottetaller og et låsestik', 'Round turn, figure-eights and a locking hitch'], ['Bare et ottetalsknob', 'Just a figure-eight knot'], ['Man binder en sløjfe', 'You tie a bow'], ['Man stikker det i lommen', 'You put it in your pocket']],
    ['Først en rundtørn om klampens fod, så et par ottetaller over hornene og til sidst et låsestik.', 'First a round turn around the base, then a few figure-eights over the horns and finally a locking hitch.']);
  q('knots', 'knot:roundturn', ['Hvilket knob er godt til at fortøje båden til en ring eller pæl?', 'Which knot is good for mooring the boat to a ring or post?'],
    [['Rundtørn og to halvstik', 'Round turn and two half hitches'], ['Råbåndsknob', 'Reef knot'], ['Kællingeknude', 'Granny knot'], ['Ottetalsknob', 'Figure-eight knot']],
    ['Rundtørnen tager trækket, og de to halvstik holder enden på plads. Det kan løses, selv når der er træk på.', 'The round turn takes the load and the two half hitches hold the end. You can untie it even under load.']);
  q('knots', 'rope', ['Hvad kalder man den løse ende af et tov, som man slår knobet med?', 'What do you call the loose end of a rope that you tie the knot with?'],
    [['Tampen', 'The working end'], ['Den faste part', 'The standing part'], ['Bugten', 'The bight'], ['Faldet', 'The halyard']],
    ['Tampen er enden, du arbejder med. Den faste part er resten af tovet, der fx går til sejlet.', 'The working end is the end you tie with. The standing part is the rest of the rope, e.g. going to the sail.']);

  // ---- vejr & vind (weather & wind)
  q('weather', 'windWest', ['Det blæser en vestenvind. Hvor kommer vinden fra?', 'There is a westerly wind. Where does the wind come from?'],
    [['Fra vest', 'From the west'], ['Mod vest', 'Towards the west'], ['Fra øst', 'From the east'], ['Fra alle sider', 'From all sides']],
    ['Vinden får navn efter, hvor den kommer FRA. En vestenvind blæser fra vest mod øst.', 'Wind is named after where it comes FROM. A westerly blows from west to east.']);
  q('weather', 'gust', ['Du ser en mørk, kruset plet på vandet komme mod dig. Hvad er det?', 'You see a dark, rippled patch on the water coming towards you. What is it?'],
    [['Et vindpust', 'A gust'], ['En stime fisk', 'A school of fish'], ['Lavt vand', 'Shallow water'], ['En skygge fra en sky', 'A cloud shadow']],
    ['Mørke krusninger betyder mere vind. Gør dig klar til at hænge ud eller fiere skødet.', 'Dark ripples mean more wind. Get ready to hike out or ease the sheet.']);
  q('weather', 'beaufort', ['Hvad måler Beaufort-skalaen?', 'What does the Beaufort scale measure?'],
    [['Vindens styrke', 'Wind strength'], ['Vandets dybde', 'Water depth'], ['Temperaturen', 'Temperature'], ['Bølgernes farve', 'The colour of waves']],
    ['Beaufort går fra 0 (stille) til 12 (orkan). En god jolledag er omkring 2-4 Beaufort.', 'Beaufort goes from 0 (calm) to 12 (hurricane). A good dinghy day is around force 2-4.']);
  q('weather', 'ms', ['Vinden er 5 m/s. Cirka hvor mange knob er det?', 'The wind is 5 m/s. About how many knots is that?'],
    [['Cirka 10 knob', 'About 10 knots'], ['Cirka 5 knob', 'About 5 knots'], ['Cirka 2 knob', 'About 2 knots'], ['Cirka 50 knob', 'About 50 knots']],
    ['Tommelfingerregel: knob er cirka det dobbelte af m/s. 5 m/s ≈ 10 knob.', 'Rule of thumb: knots are about double the m/s. 5 m/s ≈ 10 knots.']);
  q('weather', 'thunder', ['Du hører torden, mens du er ude at sejle. Hvad gør du?', 'You hear thunder while out sailing. What do you do?'],
    [['Sejler i havn med det samme', 'Sail back to harbour at once'], ['Sejler hen under skyen', 'Sail under the cloud'], ['Hejser et større sejl', 'Hoist a bigger sail'], ['Venter og ser', 'Wait and see']],
    ['Masten er det højeste punkt på vandet. Ved torden skal du hurtigt i havn – og der kommer ofte kraftige vindstød.', 'The mast is the highest point on the water. With thunder, get to the harbour fast – strong gusts often come too.']);
  q('weather', 'offshore', ['Vinden blæser ud fra land. Hvorfor skal du passe ekstra på?', 'The wind is blowing off the land. Why should you be extra careful?'],
    [['Den blæser dig væk fra land og er stærkere længere ude', 'It blows you away from land and is stronger further out'], ['Den er altid varm', 'It is always warm'], ['Der er ingen bølger, så det er kedeligt', 'There are no waves, so it is boring'], ['Den gør vandet salt', 'It makes the water salty']],
    ['Fralandsvind ser rolig ud tæt på land, men længere ude blæser det mere, og det er svært at krydse hjem.', 'Offshore wind looks calm near the shore, but further out it blows harder and it is hard to beat home.']);
  q('weather', 'seabreeze', ['En varm, solrig sommerdag – hvad sker der ofte med vinden ved kysten om eftermiddagen?', 'A warm, sunny summer day – what often happens to the wind at the coast in the afternoon?'],
    [['Søbrisen kommer ind fra havet', 'A sea breeze comes in from the sea'], ['Vinden forsvinder altid helt', 'The wind always disappears'], ['Det begynder at sne', 'It starts snowing'], ['Vinden blæser kun om natten', 'The wind only blows at night']],
    ['Land bliver varmere end vand. Den varme luft stiger op, og kølig luft fra havet strømmer ind: søbrise.', 'Land gets warmer than water. Warm air rises and cool air from the sea flows in: a sea breeze.']);
  q('weather', 'cloud', ['Du ser en stor, mørk, tårnhøj sky nærme sig. Hvad kan den bringe?', 'You see a huge, dark, towering cloud approaching. What can it bring?'],
    [['Kraftige vindstød og regn', 'Strong gusts and rain'], ['Mere solskin', 'More sunshine'], ['Helt stille vejr', 'Completely calm weather'], ['Regnbuer uden vind', 'Rainbows with no wind']],
    ['Bygeskyer kan give pludselige, kraftige vindstød. Rev, eller sejl ind i god tid.', 'Shower clouds can bring sudden, strong gusts. Reef, or head in early.']);
  q('weather', 'windward', ['Hvilken side af båden er luv?', 'Which side of the boat is windward?'],
    [['Den side, vinden kommer ind fra', 'The side the wind comes from'], ['Den side, vinden blæser hen mod', 'The side the wind blows towards'], ['Altid venstre side', 'Always the left side'], ['Forenden', 'The front']],
    ['Luv er der, hvor vinden kommer fra. Den modsatte side er læ.', 'Windward is where the wind comes from. The opposite side is leeward.']);
  q('weather', 'telltale', ['Hvad viser den lille vimpel eller vindviser i toppen af masten?', 'What does the little pennant or wind indicator at the masthead show?'],
    [['Hvor vinden kommer fra', 'Where the wind comes from'], ['Hvor hurtigt båden sejler', 'How fast the boat goes'], ['Hvor dybt vandet er', 'How deep the water is'], ['Hvilken klub du er fra', 'Which club you belong to']],
    ['Vindviseren peger med vinden. Den hjælper dig med at se, hvordan du skal trimme og styre.', 'The wind indicator points with the wind. It helps you see how to trim and steer.']);
  q('weather', 'cold', ['Hvorfor har man våddragt eller tørdragt på, når man sejler om foråret?', 'Why do you wear a wetsuit or drysuit when sailing in spring?'],
    [['Vandet er koldt, hvis man kæntrer', 'The water is cold if you capsize'], ['Det er en del af uniformen', 'It is part of the uniform'], ['Den gør båden hurtigere', 'It makes the boat faster'], ['For at holde sig tør i regnvejr', 'To stay dry in the rain']],
    ['Selv når luften er lun, er vandet i Øresund koldt om foråret. Dragten holder dig varm, hvis du ryger i.', 'Even when the air is mild, the water in the Øresund is cold in spring. The suit keeps you warm if you fall in.']);

  // ---- sikkerhed (safety)
  q('safety', 'lifejacket', ['Hvornår skal du have svømmevest på i jollen?', 'When should you wear a buoyancy aid in the dinghy?'],
    [['Altid, når jeg er på vandet', 'Always when I am on the water'], ['Kun når det blæser meget', 'Only when it is very windy'], ['Kun til kapsejlads', 'Only when racing'], ['Kun hvis jeg ikke kan svømme', 'Only if I can’t swim']],
    ['Svømmevesten skal altid være på og lynet – også på stille dage og når man er en god svømmer.', 'The buoyancy aid is always on and zipped up – even on calm days and even if you swim well.']);
  q('safety', 'capsize', ['Du kæntrer et stykke fra land. Hvad gør du?', 'You capsize some way from shore. What do you do?'],
    [['Bliver ved båden', 'Stay with the boat'], ['Svømmer i land', 'Swim to shore'], ['Svømmer efter en anden båd', 'Swim after another boat'], ['Dykker ned under båden', 'Dive under the boat']],
    ['Båden flyder og er nem at få øje på. Hold fast i den, så kommer hjælpen til dig.', 'The boat floats and is easy to spot. Hold on to it and help will come to you.']);
  q('safety', 'mob', ['Din makker falder over bord. Hvad er det vigtigste først?', 'Your crew falls overboard. What is the most important thing first?'],
    [['Råbe ”mand over bord” og holde øje med personen', 'Shout “man overboard” and keep watching the person'], ['Sejle videre for at hente fart', 'Keep sailing to build speed'], ['Tage sejlet ned', 'Take the sail down'], ['Ringe til mor', 'Call mum']],
    ['Råb, peg og slip ikke personen med øjnene. Så vender du og sejler tilbage for at samle op.', 'Shout, point and never take your eyes off them. Then turn round and sail back to pick them up.']);
  q('safety', 'boom', ['Hvad skal du især passe på, når du bommer?', 'What must you watch out for especially when you gybe?'],
    [['At dukke hovedet, når bommen svinger over', 'Ducking your head as the boom swings across'], ['At holde skødet helt stramt', 'Holding the sheet very tight'], ['At stå op i båden', 'Standing up in the boat'], ['At kigge bagud', 'Looking backwards']],
    ['Ved en bomning svinger bommen hurtigt over til den anden side. Hold hovedet nede!', 'In a gybe the boom swings quickly to the other side. Keep your head down!']);
  q('safety', 'help', ['Hvordan signalerer du, at du har brug for hjælp på vandet?', 'How do you signal that you need help on the water?'],
    [['Løfter og sænker armene langsomt', 'Slowly raise and lower your arms'], ['Klapper i hænderne', 'Clap your hands'], ['Vinker hurtigt med én hånd', 'Wave quickly with one hand'], ['Synger højt', 'Sing loudly']],
    ['Strakte arme, der langsomt løftes og sænkes, er det internationale tegn for ”hjælp”.', 'Outstretched arms slowly raised and lowered is the international sign for “help”.']);
  q('safety', 'vhf', ['Hvilken VHF-kanal er nød- og anråbskanalen til søs?', 'Which VHF channel is the distress and calling channel at sea?'],
    [['Kanal 16', 'Channel 16'], ['Kanal 1', 'Channel 1'], ['Kanal 99', 'Channel 99'], ['Kanal 112', 'Channel 112']],
    ['Kanal 16 bruges til nødopkald og til at kalde op. Trænerbådene har ofte en VHF med.', 'Channel 16 is for distress calls and calling. Coach boats often carry a VHF.']);
  q('safety', 'phone', ['Hvilket nummer ringer du til i Danmark, hvis der er fare for liv?', 'Which number do you call in Denmark if someone’s life is in danger?'],
    [['112', '112'], ['114', '114'], ['911', '911'], ['118', '118']],
    ['112 er alarmnummeret i Danmark og resten af EU.', '112 is the emergency number in Denmark and the rest of the EU.']);
  q('safety', 'tellsomeone', ['Hvad skal du gøre, før du sejler ud?', 'What should you do before you sail out?'],
    [['Fortælle nogen i land, hvor jeg sejler hen', 'Tell someone ashore where I am going'], ['Slukke telefonen', 'Switch off my phone'], ['Spise en is', 'Eat an ice cream'], ['Ingenting', 'Nothing']],
    ['Nogen i land skal vide, hvor du sejler, og hvornår du er tilbage – så kan de reagere, hvis noget går galt.', 'Someone ashore should know where you sail and when you will be back – so they can act if something goes wrong.']);
  q('safety', 'turtle', ['Båden har vendt bunden helt i vejret, og masten peger lige ned. Hvad kalder sejlere det?', 'The boat has turned completely upside down with the mast pointing straight down. What do sailors call that?'],
    [['Den er turtlet (ligger som en skildpadde)', 'It has turtled'], ['Den er på grund', 'It has run aground'], ['Den er rebet', 'It is reefed'], ['Den planer', 'It is planing']],
    ['En turtlet båd rejser man ved at kravle op på bunden og læne sig tilbage i sværdet.', 'You right a turtled boat by climbing onto the hull and leaning back on the daggerboard.']);
  q('safety', 'sun', ['Det er overskyet, men sommer. Skal du huske solcreme?', 'It is cloudy, but summer. Do you need sunscreen?'],
    [['Ja – solen og vandet giver solskoldning', 'Yes – sun and water reflections burn'], ['Nej, aldrig når det er overskyet', 'No, never when it is cloudy'], ['Kun på fødderne', 'Only on your feet'], ['Kun om vinteren', 'Only in winter']],
    ['Vandet spejler solen, og man bliver let forbrændt på vandet – også når det er gråvejr.', 'The water reflects the sun and you burn easily on the water – even on a grey day.']);
  q('safety', 'cold2', ['Du fryser og ryster efter en kæntring. Hvad gør du?', 'You are cold and shivering after a capsize. What do you do?'],
    [['Siger det til træneren og sejler ind', 'Tell the coach and head in'], ['Bider tænderne sammen og sejler videre', 'Grit your teeth and keep going'], ['Hopper i vandet igen', 'Jump back into the water'], ['Tager svømmevesten af', 'Take off your buoyancy aid']],
    ['Kulde gør dig træt og klodset. Sig det altid til en voksen – det er klogt, ikke pinligt.', 'Cold makes you tired and clumsy. Always tell an adult – it is smart, not embarrassing.']);

  // ---- navigation & afmærkning (IALA A)
  q('nav', 'buoy:port', ['Du sejler IND i havnen. Hvilken side skal den røde bøje være på?', 'You sail INTO the harbour. Which side should the red buoy be on?'],
    [['Bagbord (venstre)', 'Port (left)'], ['Styrbord (højre)', 'Starboard (right)'], ['Lige foran', 'Straight ahead'], ['Det er lige meget', 'It does not matter']],
    ['I Danmark (IALA A) er rød bagbord og grøn styrbord, når du sejler ind mod havnen.', 'In Denmark (IALA A) red is port and green is starboard when sailing into harbour.']);
  q('nav', 'buoy:stbd', ['Hvilken topbetegnelse har et grønt styrbordsmærke?', 'What top mark does a green starboard mark have?'],
    [['En kegle med spidsen opad', 'A cone pointing up'], ['En cylinder', 'A cylinder'], ['Et kryds', 'A cross'], ['To kugler', 'Two balls']],
    ['Grøn = kegle (spids). Rød = cylinder (”dåse”). Så kan du kende dem, selv i modlys.', 'Green = cone (pointy). Red = cylinder (“can”). So you can tell them apart even against the light.']);
  q('nav', 'buoy:swim', ['Hvad betyder gule bøjer langs stranden?', 'What do yellow buoys along the beach mean?'],
    [['Badezone – her må du ikke sejle', 'Swim zone – no sailing here'], ['Kapsejladsbane', 'A race course'], ['Godt fiskested', 'A good fishing spot'], ['Dybt vand', 'Deep water']],
    ['Inden for de gule bøjer bader folk. Hold dig ude med båden!', 'People swim inside the yellow buoys. Keep your boat out!']);
  q('nav', 'buoy:cardN', ['Du ser en nord-kompasafmærkning (sort over gul, to kegler med spidsen op). Hvor skal du sejle?', 'You see a north cardinal mark (black over yellow, two cones pointing up). Where should you sail?'],
    [['Nord om mærket', 'North of the mark'], ['Syd om mærket', 'South of the mark'], ['Lige hen over det', 'Straight over it'], ['Lige meget hvor', 'Anywhere']],
    ['Et nordmærke betyder: det sikre vand er mod nord. Faren ligger syd for mærket.', 'A north mark means: safe water is to the north. The danger lies south of the mark.']);
  q('nav', 'buoy:cardS', ['Hvordan ser topbetegnelsen ud på en syd-kompasafmærkning?', 'What does the top mark of a south cardinal mark look like?'],
    [['To kegler med spidserne nedad', 'Two cones pointing down'], ['To kegler med spidserne opad', 'Two cones pointing up'], ['En rød kugle', 'A red ball'], ['Et gult kryds', 'A yellow cross']],
    ['Keglerne peger mod den sikre side: op = nord, ned = syd.', 'The cones point to the safe side: up = north, down = south.']);
  q('nav', 'buoy:isolated', ['Hvad betyder et sort mærke med rødt bånd og to sorte kugler?', 'What does a black mark with a red band and two black balls mean?'],
    [['Enkeltstående fare – hold afstand', 'Isolated danger – keep away'], ['Sikkert vand overalt', 'Safe water all around'], ['Badezone', 'Swim zone'], ['Startlinje', 'Start line']],
    ['Mærket står lige på en lille fare, fx en sten. Der er vand rundt om, men sejl ikke tæt på.', 'The mark stands right on a small danger, like a rock. There is water around, but don’t sail close.']);
  q('nav', 'buoy:safe', ['Et rød- og hvidstribet mærke med en rød kugle. Hvad betyder det?', 'A red and white striped mark with a red ball. What does it mean?'],
    [['Sikkert vand – fx midt i en sejlrende', 'Safe water – e.g. the middle of a channel'], ['Stor fare', 'Big danger'], ['Badezone', 'Swim zone'], ['Her må man ankre', 'Anchoring allowed here']],
    ['Midtfarvandsmærket viser sikkert vand hele vejen rundt.', 'The safe water mark shows safe water all the way round.']);
  q('nav', 'flash', ['På søkortet står der ved et fyr ”Fl W 3s”. Hvad betyder det?', 'On the chart a light says “Fl W 3s”. What does it mean?'],
    [['Et hvidt blink hvert 3. sekund', 'A white flash every 3 seconds'], ['Tre hvide blink hele tiden', 'Three white flashes all the time'], ['Lyset er tændt i 3 timer', 'The light is on for 3 hours'], ['Flag W i 3 sekunder', 'Flag W for 3 seconds']],
    ['Fl = flash (blink), W = white (hvid), 3s = gentages hvert 3. sekund. Som fyret på molen ved Svanemøllestranden.', 'Fl = flash, W = white, 3s = repeats every 3 seconds. Like the light on the mole by the beach.']);
  q('nav', 'lights', ['Om natten ser du et rødt lys på en båd. Hvilken side af båden ser du?', 'At night you see a red light on a boat. Which side of the boat are you looking at?'],
    [['Bagbord side', 'Her port side'], ['Styrbord side', 'Her starboard side'], ['Agterenden', 'Her stern'], ['Toppen af masten', 'Her masthead']],
    ['Rødt lys sidder i bagbord side, grønt i styrbord og hvidt agter. Lidt ligesom bøjerne.', 'Red is on the port side, green on starboard and white at the stern. A bit like the buoys.']);
  q('nav', 'compass', ['Du styrer kurs 90° på kompasset. Hvilken retning sejler du?', 'You steer a compass course of 90°. Which way are you sailing?'],
    [['Øst', 'East'], ['Nord', 'North'], ['Syd', 'South'], ['Vest', 'West']],
    ['0° er nord, 90° øst, 180° syd og 270° vest.', '0° is north, 90° east, 180° south and 270° west.']);
  q('nav', 'chart', ['Hvad betyder de små tal i vandet på et søkort?', 'What do the small numbers in the water on a chart mean?'],
    [['Vanddybden i meter', 'The water depth in metres'], ['Hvor mange både der er', 'How many boats there are'], ['Bølgernes højde', 'The height of the waves'], ['Fartgrænsen', 'The speed limit']],
    ['Tallene er dybden. I Svanemøllebugten er der mange steder kun 2-3 meter.', 'The numbers are the depth. In Svanemøllebugten there are only 2-3 metres in many places.']);
  q('nav', 'shallow', ['Vandet bliver lysere og lysere grønt-turkis foran dig. Hvad betyder det tit?', 'The water gets lighter and lighter turquoise ahead. What does that often mean?'],
    [['Det bliver lavvandet', 'It is getting shallow'], ['Det bliver dybere', 'It is getting deeper'], ['Der er en hval', 'There is a whale'], ['Det bliver varmere', 'It is getting warmer']],
    ['Lyst vand er ofte lavt vand. Hiv sværdet lidt op og hold øje med bunden.', 'Light water is often shallow water. Lift the board a bit and watch the bottom.']);

  // ---- KØS & havnen (general, safe facts)
  q('club', 'map', ['I hvilken by ligger Svanemøllehavnen?', 'In which city is Svanemøllehavnen?'],
    [['København', 'Copenhagen'], ['Aarhus', 'Aarhus'], ['Odense', 'Odense'], ['Aalborg', 'Aalborg']],
    ['Svanemøllehavnen ligger på Østerbro i København, lige ud til Øresund.', 'Svanemøllehavnen is in Østerbro, Copenhagen, right on the Øresund.']);
  q('club', 'sound', ['Hvilket farvand ligger lige uden for Svanemøllehavnen?', 'Which body of water lies just outside Svanemøllehavnen?'],
    [['Øresund', 'The Øresund'], ['Limfjorden', 'Limfjorden'], ['Vesterhavet', 'The North Sea'], ['Lillebælt', 'Lillebælt']],
    ['Øresund er sundet mellem Danmark og Sverige.', 'The Øresund is the strait between Denmark and Sweden.']);
  q('club', 'sweden', ['Hvilket land kan du se på den anden side af Øresund?', 'Which country can you see across the Øresund?'],
    [['Sverige', 'Sweden'], ['Norge', 'Norway'], ['Tyskland', 'Germany'], ['Holland', 'The Netherlands']],
    ['På en klar dag kan man se den svenske kyst fra vandet ud for København.', 'On a clear day you can see the Swedish coast from the water off Copenhagen.']);
  q('club', 'boat:opti', ['Hvilken jolle starter de fleste unge sejlere i?', 'Which dinghy do most young sailors start in?'],
    [['Optimistjollen', 'The Optimist'], ['29’eren', 'The 29er'], ['J70’eren', 'The J70'], ['H-båden', 'The H-boat']],
    ['Optimisten (”Opti’en”) er lille, robust og perfekt til at lære at sejle i.', 'The Optimist (“Opti”) is small, sturdy and perfect for learning to sail.']);
  q('club', 'rib', ['Hvilken farve har KØS’ trænerbåde (RIB’erne)?', 'What colour are the KØS coach boats (RIBs)?'],
    [['Orange', 'Orange'], ['Lilla', 'Purple'], ['Sort', 'Black'], ['Lyserød', 'Pink']],
    ['De orange RIB’er er lette at få øje på – også når det er gråvejr.', 'The orange RIBs are easy to spot – even on a grey day.']);
  q('club', 'beach', ['Hvad hedder stranden lige ved siden af Svanemøllehavnen?', 'What is the beach right next to Svanemøllehavnen called?'],
    [['Svanemøllestranden', 'Svanemøllestranden'], ['Skagen Strand', 'Skagen beach'], ['Bornholms Strand', 'Bornholm beach'], ['Rømø Strand', 'Rømø beach']],
    ['Svanemøllestranden har badezone med gule bøjer – der må jollerne ikke sejle ind.', 'Svanemøllestranden has a swim zone with yellow buoys – dinghies must stay out.']);
  q('club', 'boat:opti', ['Cirka hvor lang er en Optimistjolle?', 'About how long is an Optimist dinghy?'],
    [['Cirka 2,3 meter', 'About 2.3 metres'], ['Cirka 5 meter', 'About 5 metres'], ['Cirka 1 meter', 'About 1 metre'], ['Cirka 10 meter', 'About 10 metres']],
    ['En Opti er kun lidt over 2,3 meter lang – omtrent som en seng.', 'An Opti is only a little over 2.3 metres long – about the length of a bed.']);
  q('club', 'boat:29er', ['Hvad er særligt ved en 29er?', 'What is special about a 29er?'],
    [['Den er hurtig, planer og har trapez', 'It is fast, planes and has a trapeze'], ['Den har en tung køl', 'It has a heavy keel'], ['Den har motor', 'It has an engine'], ['Den sejles af fem personer', 'It is sailed by five people']],
    ['29’eren er en let skiff for to. Den planer let – og kæntrer også let!', 'The 29er is a light two-person skiff. It planes easily – and capsizes easily too!']);
  q('club', 'ladder', ['Hvilken båd er en kølbåd, man kan sejle flere sammen i?', 'Which boat is a keelboat that several people can sail together?'],
    [['J70', 'J70'], ['Optimist', 'Optimist'], ['ILCA', 'ILCA'], ['Tera', 'Tera']],
    ['J70 er en sporty kølbåd med gennaker til 3-5 personer. Den kan endda plane på læns.', 'The J70 is a sporty keelboat with a gennaker for 3-5 people. It can even plane downwind.']);
  q('club', 'pier', ['Hvad gør du med jollen, når du er færdig med at sejle for i dag?', 'What do you do with your dinghy when you are done sailing for the day?'],
    [['Skyller den, rigger af og lægger alt på plads', 'Rinse it, unrig and put everything away'], ['Lader den ligge på slæbestedet', 'Leave it on the slipway'], ['Lader sejlet blafre hele natten', 'Leave the sail flapping all night'], ['Giver den til en måge', 'Give it to a seagull']],
    ['En god sejler passer på grejet: skyl saltvandet af, rig af og læg tingene pænt på plads til næste gang.', 'A good sailor looks after the kit: rinse off the salt water, unrig and put things away for next time.']);

  // ======================================================================== 2. strings
  // Register every question through KOS.I18n under quiz.q.<n>.{q,a0..a3,ex} (Danish first).
  const qDa = {}, qEn = {};
  BANK.forEach((it, i) => {
    it.id = i;
    const d = { q: it.q[0], ex: it.ex[0] }, e = { q: it.q[1], ex: it.ex[1] };
    it.a.forEach((a, j) => { d['a' + j] = a[0]; e['a' + j] = a[1]; });
    qDa[i] = d; qEn[i] = e;
  });

  KOS.I18n.add('da', {
    quiz: {
      q: qDa,
      cat: { rules: 'Vigeregler', parts: 'Bådens dele', knots: 'Knob', weather: 'Vejr & vind', safety: 'Sikkerhed', nav: 'Afmærkning', club: 'KØS & havnen' },
      intro: {
        title: 'Klar til quiz?', sub: '{n} spørgsmål · {sec} sek. pr. spørgsmål', subFree: '{n} spørgsmål · tag den tid, du har brug for',
        start: 'Start quizzen', keys: 'Tastatur: 1-4 eller A-D for at svare · Enter for næste',
        coach: 'Svar hurtigt for bonuspoint – og jo flere rigtige i træk, jo større bonus!',
      },
      hud: { q: 'Spørgsmål', score: 'Point', streak: 'I træk' },
      lifeline: 'Spørg Søs', lifelineLeft: '{n} tilbage',
      next: 'Næste', finish: 'Se resultat',
      right: { r0: 'Rigtigt!', r1: 'Sådan!', r2: 'Flot!', r3: 'Korrekt!', r4: 'Yes!' },
      wrong: 'Ikke helt…', timeout: 'Tiden løb ud!',
      correctWas: 'Det rigtige svar: {a}',
      didYouKnow: 'Vidste du?',
      fx: { streak: '{n} i træk!', bonus: '+{n}', fast: 'Lynhurtig!' },
      coach: {
        streak3: 'Tre rigtige i træk – du er varm!',
        streak5: 'Fem i træk! Du er en ægte sømand!',
        wrong2: 'Bare rolig – læs forklaringen, så husker du den næste gang.',
        lifeline: 'Søs fjerner to forkerte svar for dig.',
      },
      res: { msg: '{n} af {of} rigtige · flest i træk: {streak}' },
      stat: { correct: 'Rigtige svar', streak: 'Flest i træk', avg: 'Gns. svartid' },
    },
  });
  KOS.I18n.add('en', {
    quiz: {
      q: qEn,
      cat: { rules: 'Right of way', parts: 'Parts of the boat', knots: 'Knots', weather: 'Weather & wind', safety: 'Safety', nav: 'Buoyage', club: 'KØS & the harbour' },
      intro: {
        title: 'Ready for the quiz?', sub: '{n} questions · {sec} sec per question', subFree: '{n} questions · take the time you need',
        start: 'Start the quiz', keys: 'Keyboard: 1-4 or A-D to answer · Enter for next',
        coach: 'Answer fast for bonus points – and the more right in a row, the bigger the streak bonus!',
      },
      hud: { q: 'Question', score: 'Score', streak: 'Streak' },
      lifeline: 'Ask Søs', lifelineLeft: '{n} left',
      next: 'Next', finish: 'See result',
      right: { r0: 'Correct!', r1: 'Nice!', r2: 'Great!', r3: 'Right!', r4: 'Yes!' },
      wrong: 'Not quite…', timeout: 'Time’s up!',
      correctWas: 'The right answer: {a}',
      didYouKnow: 'Did you know?',
      fx: { streak: '{n} in a row!', bonus: '+{n}', fast: 'Lightning fast!' },
      coach: {
        streak3: 'Three in a row – you’re on fire!',
        streak5: 'Five in a row! You’re a real sailor!',
        wrong2: 'Don’t worry – read the explanation and you’ll remember it next time.',
        lifeline: 'Søs removes two wrong answers for you.',
      },
      res: { msg: '{n} of {of} correct · best streak {streak}' },
      stat: { correct: 'Correct answers', streak: 'Best streak', avg: 'Avg. answer time' },
    },
  });

  // ======================================================================== 3. activities
  KOS.Activities.add([
    { id: 'quiz.basics', mode: 'quiz', area: 'club', order: 21.5, boat: null, icon: 'quiz', minutes: 4, difficulty: 1, unlock: null,
      title: { da: 'Quiz: Begynder', en: 'Quiz: Beginner' },
      desc: { da: 'Bådens dele, knob, sikkerhed og havnen. 10 spørgsmål.', en: 'Parts of the boat, knots, safety and the harbour. 10 questions.' },
      params: { cats: ['parts', 'knots', 'safety', 'club'], n: 10, seed: 11 } },
    { id: 'quiz.rules', mode: 'quiz', area: 'club', order: 22.5, boat: null, icon: 'rules', minutes: 4, difficulty: 2, unlock: { after: 'quiz.basics' },
      title: { da: 'Quiz: Vigeregler & afmærkning', en: 'Quiz: Rules & buoyage' },
      desc: { da: 'Hvem skal vige? Og hvilken side skal bøjen være på?', en: 'Who must give way? And which side should the buoy be on?' },
      params: { cats: ['rules', 'nav'], n: 10, seed: 23 } },
    { id: 'quiz.weather', mode: 'quiz', area: 'club', order: 23.5, boat: null, icon: 'wind', minutes: 4, difficulty: 2, unlock: { after: 'quiz.basics' },
      title: { da: 'Quiz: Vejr, vind & sikkerhed', en: 'Quiz: Weather, wind & safety' },
      desc: { da: 'Pust, søbrise, torden – og hvad du gør, hvis du kæntrer.', en: 'Gusts, sea breeze, thunder – and what to do when you capsize.' },
      params: { cats: ['weather', 'safety'], n: 10, seed: 37 } },
    { id: 'quiz.master', mode: 'quiz', area: 'club', order: 26.5, boat: null, icon: 'trophy', minutes: 6, difficulty: 4, unlock: { stars: 12 },
      title: { da: 'Mesterquizzen', en: 'The Master Quiz' },
      desc: { da: '15 spørgsmål fra alle emner – hurtigere ur!', en: '15 questions from every topic – faster clock!' },
      params: { cats: ['rules', 'parts', 'knots', 'weather', 'safety', 'nav', 'club'], n: 15, seed: 51, fast: true } },
  ]);

  // ======================================================================== 4. illustrations (small inline SVGs)
  const SEA = '<defs><linearGradient id="qzSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ec8f2"/><stop offset="1" stop-color="#2b6cb0"/></linearGradient></defs>';
  const WAVES = '<path d="M0 98 Q10 94 20 98 T40 98 T60 98 T80 98 T100 98 T120 98 T140 98 T160 98" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>';
  function svgWrap(body, vb) { return '<svg viewBox="' + (vb || '0 0 160 120') + '" aria-hidden="true">' + body + '</svg>'; }
  function seaBg() { return SEA + '<rect x="0" y="0" width="160" height="120" rx="14" fill="url(#qzSea)"/>' + WAVES.replace(/98/g, '30') + WAVES.replace(/98/g, '70') + WAVES; }
  // top-down mini dinghy at x,y heading h (deg), boom side +1 = boom to starboard
  function topBoat(x, y, h, col, boom, label) {
    boom = boom || 1;
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + h + ')">' +
      '<path d="M0 -15 C7 -9 7 7 5 13 L-5 13 C-7 7 -7 -9 0 -15Z" fill="' + col + '" stroke="#0d1321" stroke-width="1.2"/>' +
      '<path d="M0 -6 Q' + (boom * 9) + ' 2 ' + (boom * 7) + ' 12" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="0" cy="-6" r="1.6" fill="#0d1321"/>' + (label ? '<text x="0" y="5" font-size="7" text-anchor="middle" font-weight="900" fill="#0d1321" transform="rotate(' + (-h) + ')">' + label + '</text>' : '') + '</g>';
  }
  function windArrow(x, y, deg) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + deg + ')"><path d="M0 -14 V10" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M-6 6 L0 15 L6 6Z" fill="#fff"/></g>' +
      '<text x="' + x + '" y="' + (y - 18) + '" font-size="8" fill="#fff" text-anchor="middle" font-weight="800">' + esc(KOS.I18n.lang === 'en' ? 'WIND' : 'VIND') + '</text>';
  }
  function motorBoat(x, y, h, col) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + h + ')"><path d="M0 -16 C8 -8 8 10 7 14 L-7 14 C-8 10 -8 -8 0 -16Z" fill="' + (col || '#ff7a3d') + '" stroke="#0d1321" stroke-width="1.2"/>' +
      '<rect x="-4" y="-2" width="8" height="7" rx="1.5" fill="#1d2433"/><rect x="-2.5" y="14" width="5" height="4" fill="#1d2433"/></g>';
  }
  function boatSide(parts) { // side view of a dinghy with one highlighted part
    const hi = '#ffd25e', base = '#f4f6fb', dim = 'rgba(255,255,255,.75)';
    const c = k => (parts === k ? hi : dim);
    const w = k => (parts === k ? 4 : 2.2);
    return SEA + '<rect x="0" y="0" width="160" height="120" rx="14" fill="#9fd8f5"/><rect x="0" y="86" width="160" height="34" fill="url(#qzSea)"/>' +
      '<path d="M30 84 L130 84 L122 96 L40 96Z" fill="#ff7a3d" stroke="#0d1321" stroke-width="1.4"/>' +
      '<line x1="74" y1="84" x2="74" y2="12" stroke="' + c('mast') + '" stroke-width="' + w('mast') + '"/>' +
      '<line x1="74" y1="13" x2="36" y2="84" stroke="' + c('shrouds') + '" stroke-width="' + (parts === 'shrouds' ? 2.5 : 1) + '"/><line x1="74" y1="13" x2="112" y2="84" stroke="' + c('shrouds') + '" stroke-width="' + (parts === 'shrouds' ? 2.5 : 1) + '"/>' +
      '<path d="M76 14 L76 74 L118 74 Z" fill="' + base + '" opacity=".92" stroke="#0d1321" stroke-width="1"/>' +
      '<path d="M76 14 L76 74" stroke="' + (parts === 'luff' ? hi : 'transparent') + '" stroke-width="4"/>' +
      '<path d="M72 18 L72 80 L42 80 Z" fill="' + (parts === 'jib' ? hi : 'rgba(255,255,255,.75)') + '" stroke="#0d1321" stroke-width="1"/>' +
      '<line x1="74" y1="76" x2="122" y2="76" stroke="' + c('boom') + '" stroke-width="' + w('boom') + '" stroke-linecap="round"/>' +
      '<path d="M118 76 Q116 82 110 84" fill="none" stroke="' + c('sheet') + '" stroke-width="' + (parts === 'sheet' ? 3 : 1.4) + '"/>' +
      '<path d="M73 13 Q66 40 70 84" fill="none" stroke="' + c('halyard') + '" stroke-width="' + (parts === 'halyard' ? 2.8 : 0) + '"/>' +
      '<rect x="80" y="94" width="5" height="22" rx="2" fill="' + c('board') + '" stroke="#0d1321" stroke-width="1"/>' +
      '<path d="M127 90 L131 112 L124 112 L122 92Z" fill="' + (parts === 'rudder' ? hi : '#e6e6e6') + '" stroke="#0d1321" stroke-width="1"/>' +
      '<line x1="126" y1="88" x2="104" y2="82" stroke="' + c('tiller') + '" stroke-width="' + w('tiller') + '" stroke-linecap="round"/>' +
      (parts === 'bow' ? '<circle cx="32" cy="88" r="10" fill="none" stroke="' + hi + '" stroke-width="3"/>' : '') +
      (parts === 'tiller' || parts === 'boom' || parts === 'board' || parts === 'mast' ? '' : '');
  }
  function knotMini(k) {
    const r = (d, col) => '<path d="' + d + '" fill="none" stroke="#7a4a1f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + (col || '#f2c879') + '" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3"/>';
    const bg = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/>';
    const shapes = {
      eight: r('M10 62 H62 C82 62 90 40 74 34 C58 28 50 48 66 64 C80 78 100 82 104 66 C108 50 90 50 84 62 C78 76 100 84 150 80'),
      bowline: r('M80 4 V44 C66 44 62 60 76 64 C92 68 94 50 82 50 C70 54 58 92 80 108 C104 120 118 92 96 76 C90 60 98 40 86 36'),
      reef: r('M10 46 H70 C96 46 96 74 70 74 H10', '#ff9b5c') + r('M150 54 H86 C60 54 60 82 86 82 H150', '#8fd3ff'),
      clove: '<rect x="70" y="10" width="20" height="100" rx="6" fill="#a0703d"/>' + r('M10 40 H72 M88 46 L72 70 M88 74 L72 96 H40'),
      cleat: '<path d="M30 60 Q80 46 130 60 Q80 74 30 60Z" fill="#c9ced8" stroke="#0d1321" stroke-width="1.5"/>' + r('M10 100 C50 90 70 80 104 50 M56 50 L104 70 M56 70 L104 50'),
      roundturn: '<rect x="96" y="6" width="22" height="108" rx="6" fill="#a0703d"/>' + r('M10 70 H98 M116 60 L98 50 M116 46 L98 36 C70 40 60 60 70 72 C78 80 52 82 50 70'),
    };
    return bg + (shapes[k] || shapes.eight);
  }
  function weatherIll(k) {
    const sky = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#7cc4ec"/>';
    const sea = '<rect x="0" y="84" width="160" height="36" fill="#2b6cb0"/>' + WAVES.replace(/98/g, '96');
    const cloud = (x, y, s, col) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="' + (col || '#fff') + '"><circle cx="0" cy="0" r="12"/><circle cx="14" cy="-6" r="15"/><circle cx="30" cy="0" r="12"/><rect x="0" y="0" width="30" height="12"/></g>';
    switch (k) {
      case 'thunder': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#4a5470"/>' + sea + cloud(48, 30, 1.6, '#2a3048') + '<path d="M84 52 L74 74 L84 74 L76 96 L96 66 L86 66 L94 52Z" fill="#ffd25e"/>';
      case 'cloud': return sky + sea + '<path d="M30 80 C20 60 40 40 60 46 C64 20 100 16 108 40 C130 34 144 56 130 80Z" fill="#535b73"/>' + '<path d="M50 86 l-6 14 M70 86 l-6 14 M90 86 l-6 14 M110 86 l-6 14" stroke="#cfe3ff" stroke-width="2"/>';
      case 'seabreeze': return sky + '<circle cx="34" cy="24" r="12" fill="#ffd25e"/><rect x="0" y="84" width="70" height="36" fill="#e9d48a"/><rect x="70" y="84" width="90" height="36" fill="#2b6cb0"/>' +
        '<path d="M140 74 H40" stroke="#fff" stroke-width="3" marker-end="url(#)"/><path d="M48 68 L36 74 L48 80Z" fill="#fff"/><path d="M30 60 C30 40 60 36 70 30" fill="none" stroke="#ffb547" stroke-width="3" stroke-dasharray="4 4"/>';
      case 'offshore': return sky + '<rect x="0" y="40" width="40" height="80" fill="#e9d48a"/><rect x="40" y="84" width="120" height="36" fill="#2b6cb0"/>' +
        '<path d="M44 66 H82 M60 50 H120 M70 34 H150" stroke="#fff" stroke-width="2.5"/><path d="M80 61 l8 5 -8 5Z M118 45 l8 5 -8 5Z M148 29 l8 5 -8 5Z" fill="#fff"/>' + topBoat(110, 92, 90, '#ff7a3d', 1).replace('rotate(90)', 'rotate(90) scale(.8)');
      case 'gust': return seaBg() + '<ellipse cx="70" cy="56" rx="44" ry="22" fill="rgba(13,30,70,.45)"/><path d="M40 50 l6 -3 M56 60 l6 -3 M74 48 l6 -3 M88 62 l6 -3 M64 70 l6-3" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/>' + topBoat(124, 84, -20, '#fff', -1);
      case 'beaufort': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/>' + [0, 1, 2, 3, 4, 5, 6].map(i => '<rect x="' + (14 + i * 19) + '" y="' + (96 - i * 11) + '" width="14" height="' + (10 + i * 11) + '" rx="3" fill="' + ['#3ee08f', '#7fe08f', '#c8e05e', '#ffd25e', '#ffb547', '#ff7a3d', '#ff4d5e'][i] + '"/>').join('') + '<text x="80" y="20" font-size="12" text-anchor="middle" fill="#fff" font-weight="900">0 – 12</text>';
      case 'ms': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/><text x="80" y="54" font-size="26" text-anchor="middle" fill="#fff" font-weight="900">5 m/s</text><text x="80" y="92" font-size="22" text-anchor="middle" fill="#ffd25e" font-weight="900">≈ ? kn</text>';
      case 'windWest': return seaBg() + '<text x="14" y="64" font-size="18" fill="#fff" font-weight="900">' + (KOS.I18n.lang === 'en' ? 'W' : 'V') + '</text><text x="134" y="64" font-size="18" fill="#fff" font-weight="900">' + (KOS.I18n.lang === 'en' ? 'E' : 'Ø') + '</text><path d="M34 58 H118" stroke="#fff" stroke-width="4"/><path d="M114 50 L128 58 L114 66Z" fill="#fff"/>';
      case 'windward': return seaBg() + windArrow(36, 40, -45) + topBoat(98, 70, 0, '#ff7a3d', 1) + '<text x="70" y="74" font-size="9" font-weight="900" fill="#ffd25e">' + esc(KOS.I18n.lang === 'en' ? 'WW' : 'LUV') + '</text><text x="112" y="74" font-size="9" font-weight="900" fill="#fff">' + esc(KOS.I18n.lang === 'en' ? 'LW' : 'LÆ') + '</text>';
      case 'telltale': return sky + '<line x1="70" y1="120" x2="70" y2="20" stroke="#dfe4ee" stroke-width="5"/><path d="M70 20 L106 14 L106 26Z" fill="#ff4d5e"/>' + windArrow(30, 60, -90);
      case 'cold': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#a9d6f0"/><rect x="0" y="64" width="160" height="56" fill="#2b6cb0"/><text x="80" y="100" font-size="22" text-anchor="middle" fill="#fff" font-weight="900">8 °C</text><path d="M118 20 l6 10 M124 20 l-6 10 M114 25 h14" stroke="#fff" stroke-width="2"/>';
    }
    return sky + sea;
  }
  function safetyIll(k) {
    const bg = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/>';
    switch (k) {
      case 'lifejacket': return bg + '<path d="M52 20 L68 20 L80 36 L92 20 L108 20 L118 44 L114 104 L46 104 L42 44Z" fill="#ff7a3d" stroke="#0d1321" stroke-width="2"/><path d="M80 40 V104" stroke="#0d1321" stroke-width="3"/><rect x="50" y="60" width="60" height="7" fill="#1d2433"/><rect x="50" y="80" width="60" height="7" fill="#1d2433"/>';
      case 'capsize': return seaBg() + '<g transform="translate(80 70) rotate(80)"><path d="M-20 0 L20 0 L16 10 L-16 10Z" fill="#fff" stroke="#0d1321"/><line x1="0" y1="0" x2="0" y2="-60" stroke="#dfe4ee" stroke-width="3"/></g>' + sailorHead(110, 82);
      case 'mob': return seaBg() + topBoat(50, 60, 40, '#ff7a3d', 1) + sailorHead(118, 70) + '<path d="M60 40 L108 64" stroke="#ffd25e" stroke-width="2" stroke-dasharray="4 3"/>';
      case 'boom': return seaBg() + topBoat(80, 60, 0, '#ff7a3d', -1) + '<path d="M66 40 A30 30 0 0 1 98 42" fill="none" stroke="#ffd25e" stroke-width="3"/><path d="M98 36 L102 46 L92 44Z" fill="#ffd25e"/>';
      case 'help': return seaBg() + sailorHead(80, 78) + '<path d="M72 74 L50 44 M88 74 L110 44" stroke="#ff7a3d" stroke-width="6" stroke-linecap="round"/><path d="M44 34 v-10 M116 34 v-10" stroke="#fff" stroke-width="2"/><path d="M40 28 l4 -6 4 6 M112 28 l4 -6 4 6" fill="none" stroke="#fff" stroke-width="2"/>';
      case 'vhf': return bg + '<rect x="60" y="22" width="40" height="86" rx="8" fill="#1d2433" stroke="#ffd25e" stroke-width="2"/><rect x="66" y="32" width="28" height="18" rx="3" fill="#3ee08f"/><text x="80" y="46" font-size="13" text-anchor="middle" font-weight="900" fill="#0d1321">16</text><line x1="90" y1="22" x2="90" y2="4" stroke="#1d2433" stroke-width="5" stroke-linecap="round"/>';
      case 'phone': return bg + '<rect x="56" y="14" width="48" height="92" rx="10" fill="#1d2433" stroke="#fff" stroke-width="2"/><text x="80" y="68" font-size="20" text-anchor="middle" font-weight="900" fill="#ff4d5e">SOS</text>';
      case 'tellsomeone': return bg + '<rect x="18" y="70" width="124" height="40" fill="#e9d48a"/>' + sailorHead(56, 60) + sailorHead(104, 60, '#49c6f2') + '<path d="M64 34 h40 a8 8 0 0 1 8 8 v8 a8 8 0 0 1 -8 8 h-26 l-10 8 v-8 h-4 a8 8 0 0 1 -8 -8 v-8 a8 8 0 0 1 8 -8z" fill="#fff"/><text x="84" y="50" font-size="10" text-anchor="middle" font-weight="900" fill="#0d1321">17:00</text>';
      case 'turtle': return seaBg() + '<g transform="translate(80 54)"><path d="M-26 0 L26 0 L20 -12 L-20 -12Z" fill="#fff" stroke="#0d1321"/><line x1="0" y1="0" x2="0" y2="60" stroke="rgba(223,228,238,.5)" stroke-width="3"/><rect x="-3" y="-34" width="6" height="22" fill="#1d2433"/></g>';
      case 'sun': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#9fb3c8"/><circle cx="96" cy="44" r="18" fill="#ffd25e" opacity=".8"/><path d="M40 50 C34 34 58 26 66 36 C70 20 98 22 100 36 C116 34 122 52 108 58 L44 58Z" fill="#e6ebf2"/>';
      case 'cold2': return bg + sailorHead(80, 64) + '<path d="M54 58 l-8 -4 M54 66 l-8 0 M106 58 l8 -4 M106 66 l8 0" stroke="#9fe7ff" stroke-width="2.5" stroke-linecap="round"/>';
    }
    return bg;
  }
  function sailorHead(x, y, col) {
    return '<g transform="translate(' + x + ' ' + y + ')"><path d="M-12 14 Q0 2 12 14 V22 H-12Z" fill="' + (col || '#ff7a3d') + '"/><circle cx="0" cy="0" r="9" fill="#f6c39f"/><path d="M-9 -2 Q0 -14 9 -2" fill="#5a3720"/><circle cx="-3" cy="1" r="1.3" fill="#1b2335"/><circle cx="3" cy="1" r="1.3" fill="#1b2335"/></g>';
  }
  function navIll(k) {
    const bg = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/>';
    switch (k) {
      case 'flash': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#0b1630"/><rect x="72" y="50" width="16" height="50" fill="#e6e6e6"/><circle cx="80" cy="44" r="8" fill="#fff"/><circle cx="80" cy="44" r="26" fill="rgba(255,255,255,.18)"/><text x="80" y="18" font-size="12" text-anchor="middle" fill="#ffd25e" font-weight="900">Fl W 3s</text>';
      case 'lights': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#0b1630"/><path d="M40 80 L120 80 L110 92 L50 92Z" fill="#1d2433"/><circle cx="60" cy="74" r="7" fill="#ff4d5e"/><circle cx="60" cy="74" r="18" fill="rgba(255,77,94,.25)"/>';
      case 'compass': return bg + '<circle cx="80" cy="60" r="44" fill="#f4f6fb"/><g font-size="12" font-weight="900" text-anchor="middle" fill="#0d1321"><text x="80" y="28">N</text><text x="116" y="64">' + (KOS.I18n.lang === 'en' ? 'E' : 'Ø') + '</text><text x="80" y="100">S</text><text x="44" y="64">' + (KOS.I18n.lang === 'en' ? 'W' : 'V') + '</text></g><path d="M80 60 L112 60" stroke="#ff4d5e" stroke-width="4" stroke-linecap="round"/><circle cx="80" cy="60" r="4" fill="#0d1321"/>';
      case 'chart': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#cfe9f7"/><path d="M0 0 H60 C50 30 40 60 0 80Z" fill="#fff4b8" stroke="#8a7a3a"/><g font-size="11" font-style="italic" fill="#1f3c66"><text x="74" y="40">2,1</text><text x="104" y="64">3,5</text><text x="70" y="86">1,6</text><text x="124" y="100">6</text></g>';
      case 'shallow': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2b6cb0"/><path d="M0 0 H160 V40 C120 60 60 40 0 50Z" fill="#7fe0d8"/>' + topBoat(80, 84, 0, '#ff7a3d', 1);
    }
    return bg;
  }
  function rulesIll(k) {
    const sea = seaBg();
    switch (k) {
      case 'portStbd': return sea + windArrow(80, 30, 0) + topBoat(48, 76, 45, '#e8323c', 1, '') + topBoat(112, 76, -45, '#18a957', -1, '') +
        '<text x="36" y="108" font-size="9" font-weight="900" fill="#fff">' + esc(KOS.I18n.lang === 'en' ? 'PORT' : 'BB') + '</text><text x="102" y="108" font-size="9" font-weight="900" fill="#fff">' + esc(KOS.I18n.lang === 'en' ? 'STBD' : 'STB') + '</text>';
      case 'windLee': return sea + windArrow(30, 40, 0) + topBoat(70, 52, 45, '#ff7a3d', 1) + topBoat(98, 80, 45, '#49c6f2', 1);
      case 'overtake': return sea + topBoat(80, 40, 0, '#49c6f2', 1) + topBoat(80, 92, 0, '#ff7a3d', 1) + '<path d="M96 96 V44" stroke="#ffd25e" stroke-width="2" stroke-dasharray="4 3"/>';
      case 'tacking': return sea + windArrow(80, 28, 0) + topBoat(80, 76, 0, '#ff7a3d', 1) + '<path d="M58 84 A26 26 0 0 1 102 84" fill="none" stroke="#ffd25e" stroke-width="2.5"/><path d="M98 78 L104 88 L94 88Z" fill="#ffd25e"/>';
      case 'motorSail': return sea + motorBoat(50, 60, 90) + topBoat(118, 60, -90, '#fff', 1);
      case 'ship': return sea + '<rect x="56" y="0" width="48" height="120" fill="rgba(255,255,255,.1)"/><path d="M80 6 C96 20 96 92 92 110 L68 110 C64 92 64 20 80 6Z" fill="#d7dce6" stroke="#0d1321" stroke-width="1.5"/><rect x="70" y="60" width="20" height="26" fill="#1d2433"/>' + topBoat(130, 70, -30, '#ff7a3d', 1);
      case 'headon': return sea + motorBoat(80, 30, 180, '#49c6f2') + motorBoat(80, 92, 0) + '<path d="M90 82 Q100 62 92 44" fill="none" stroke="#3ee08f" stroke-width="2.5"/><path d="M70 40 Q60 60 68 78" fill="none" stroke="#3ee08f" stroke-width="2.5"/>';
      case 'crossing': return sea + motorBoat(50, 70, 90) + motorBoat(110, 40, 180, '#49c6f2');
      case 'zone': return sea + '<circle cx="80" cy="60" r="40" fill="none" stroke="#ffd25e" stroke-width="2" stroke-dasharray="5 4"/>' + markIll(80, 60) + topBoat(120, 90, -40, '#fff', 1);
      case 'penalty': return sea + topBoat(70, 60, 30, '#ff7a3d', 1) + topBoat(92, 64, -60, '#49c6f2', 1) + '<path d="M78 46 l6 -8 M86 50 l10 -4 M74 50 l-8 -6" stroke="#ffd25e" stroke-width="2.5" stroke-linecap="round"/>';
      case 'markTouch': return sea + markIll(80, 60) + topBoat(98, 62, 0, '#ff7a3d', 1) + '<path d="M60 90 A26 26 0 1 0 60 89" fill="none" stroke="#ffd25e" stroke-width="2" stroke-dasharray="4 3"/>';
      case 'flagP': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#9fd8f5"/><line x1="40" y1="12" x2="40" y2="112" stroke="#dfe4ee" stroke-width="4"/><rect x="42" y="16" width="86" height="58" fill="#1d4fb0"/><rect x="68" y="32" width="34" height="26" fill="#fff"/>';
    }
    return sea;
  }
  function markIll(x, y) { return '<g transform="translate(' + x + ' ' + y + ')"><circle r="8" fill="#ff7a3d" stroke="#0d1321" stroke-width="1.5"/><circle r="3" fill="#ffb98a"/></g>'; }
  function clubIll(k) {
    const bg = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/>';
    switch (k) {
      case 'map': case 'sound': case 'sweden': case 'beach': case 'pier':
        return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#7fc4f0"/><path d="M0 0 H70 C66 30 60 50 40 64 C30 80 20 100 0 120Z" fill="#fff4b8" stroke="#b8a356"/>' +
          '<path d="M160 0 H130 C126 30 132 60 140 90 C146 110 150 120 160 120Z" fill="#e6f0c8" stroke="#9db06a"/>' +
          '<circle cx="56" cy="52" r="5" fill="#e8323c"/><text x="64" y="48" font-size="8" font-weight="900" fill="#0d1321">KØS</text>' +
          (k === 'beach' ? '<g fill="#ffd25e"><circle cx="36" cy="84" r="3"/><circle cx="26" cy="96" r="3"/><circle cx="44" cy="72" r="3"/></g>' : '') +
          '<text x="100" y="66" font-size="9" font-style="italic" fill="#1f3c66">Øresund</text>';
      case 'rib': return '<rect x="0" y="0" width="160" height="120" rx="14" fill="#9fb3c8"/><rect x="0" y="72" width="160" height="48" fill="#2b6cb0"/><path d="M24 70 H124 C140 70 140 90 124 90 H34 C24 90 20 80 24 70Z" fill="#ff7a3d" stroke="#0d1321" stroke-width="1.5"/><path d="M24 80 H130" stroke="#1d2433" stroke-width="3"/><rect x="70" y="52" width="22" height="18" fill="#ff8f57" stroke="#0d1321"/><rect x="128" y="64" width="10" height="26" rx="2" fill="#1d2433"/><rect x="28" y="72" width="24" height="9" rx="3" fill="#1d2433"/><text x="40" y="79.5" font-size="7" text-anchor="middle" fill="#fff" font-weight="900">KØS</text>';
      case 'ladder': return bg + ['opti', 'feva', 'ilca', 'j70'].map((b, i) => '<rect x="' + (10 + i * 36) + '" y="' + (80 - i * 18) + '" width="32" height="' + (30 + i * 18) + '" rx="4" fill="rgba(255,181,71,' + (0.35 + i * 0.18) + ')"/>').join('');
    }
    return bg;
  }
  function illustration(key) {
    if (!key) return '';
    const [kind, arg] = key.split(':');
    try {
      if (kind === 'buoy' && KOS.Sprites && KOS.Sprites.buoy) {
        return '<div class="quiz-ill-buoy">' + KOS.Sprites.buoy(arg === 'swim' ? 'swim' : arg) + '</div>';
      }
      if (kind === 'boat' && KOS.Sprites && KOS.Sprites.boatCard) return '<div class="quiz-ill-card">' + KOS.Sprites.boatCard(arg) + '</div>';
    } catch (e) { /* fall back to drawn illustrations */ }
    let body;
    if (kind === 'part') body = boatSide(arg);
    else if (kind === 'knot') body = knotMini(arg);
    else if (kind === 'buoy') body = navIll('chart');
    else if (kind === 'boat') body = clubIll('ladder');
    else if (kind === 'rabbit') body = knotMini('bowline') + '<g transform="translate(118 30)"><ellipse cx="0" cy="8" rx="11" ry="9" fill="#fff"/><ellipse cx="-5" cy="-8" rx="3.5" ry="11" fill="#fff"/><ellipse cx="5" cy="-8" rx="3.5" ry="11" fill="#fff"/><circle cx="-4" cy="6" r="1.5" fill="#1b2335"/><circle cx="4" cy="6" r="1.5" fill="#1b2335"/><circle cx="0" cy="10" r="1.5" fill="#ff8a9a"/></g>';
    else if (kind === 'rope') body = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/><path d="M10 80 C50 80 70 30 120 40" fill="none" stroke="#f2c879" stroke-width="9" stroke-linecap="round"/><rect x="114" y="34" width="14" height="12" rx="3" fill="#e8323c" transform="rotate(10 121 40)"/><text x="120" y="70" font-size="10" text-anchor="middle" fill="#ffd25e" font-weight="900">?</text>';
    else if (kind === 'bailer') body = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#2a3552"/><path d="M40 50 H110 L100 96 H50Z" fill="#ffb547" stroke="#0d1321" stroke-width="2"/><path d="M110 56 Q130 60 126 80" fill="none" stroke="#ffb547" stroke-width="6"/><g fill="#7fd3ff"><circle cx="60" cy="38" r="4"/><circle cx="76" cy="28" r="3"/><circle cx="92" cy="36" r="4"/></g>';
    else if (kind === 'trapeze') body = '<rect x="0" y="0" width="160" height="120" rx="14" fill="#9fd8f5"/><rect x="0" y="92" width="160" height="28" fill="#2b6cb0"/><line x1="80" y1="0" x2="80" y2="88" stroke="#dfe4ee" stroke-width="4"/><path d="M40 92 L120 92 L112 100 L48 100Z" fill="#fff"/><line x1="80" y1="10" x2="34" y2="62" stroke="#1d2433" stroke-width="1.5"/>' + '<g transform="translate(26 70) rotate(-70)"><rect x="-4" y="-6" width="8" height="30" rx="4" fill="#ff7a3d"/><circle cx="0" cy="-12" r="6" fill="#f6c39f"/></g>';
    else if (/^(portStbd|windLee|overtake|tacking|motorSail|ship|headon|crossing|zone|penalty|markTouch|flagP)$/.test(kind)) body = rulesIll(kind);
    else if (/^(thunder|cloud|seabreeze|offshore|gust|beaufort|ms|windWest|windward|telltale|cold)$/.test(kind)) body = weatherIll(kind);
    else if (/^(lifejacket|capsize|mob|boom|help|vhf|phone|tellsomeone|turtle|sun|cold2)$/.test(kind)) body = safetyIll(kind);
    else if (/^(flash|lights|compass|chart|shallow)$/.test(kind)) body = navIll(kind);
    else body = clubIll(kind);
    return svgWrap(body);
  }

  // ======================================================================== 5. the mode
  KOS.Modes.register('quiz', { kind: 'dom', create(host, activity) { return createQuiz(host, activity); } });

  const CAT_ICON = { rules: 'rules', parts: 'boat', knots: 'knot', weather: 'wind', safety: 'life', nav: 'buoy', club: 'house' };

  function sfx(name, o) { try { if (KOS.Audio) KOS.Audio.play(name, o); } catch (e) { /* sound is optional */ } }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function createQuiz(host, activity) {
    const P = Object.assign({ cats: ['parts', 'knots', 'safety', 'club'], n: 10, seed: 1, fast: false }, activity.params || {});
    const assist = host.assist || 'easy';
    const layer = host.layer;
    let plays = 0;
    try { plays = (KOS.Storage.progress(activity.id) || {}).plays || 0; } catch (e) { /* storage optional */ }
    const rng = U.rng((P.seed * 7919 + plays * 104729 + hashStr(activity.id)) >>> 0);
    const timeLimit = assist === 'easy' ? 0 : assist === 'pro' ? (P.fast ? 10 : 12) : (P.fast ? 15 : 20); // 0 = no time-out
    const bonusWindow = assist === 'easy' ? 25 : timeLimit;  // time bonus decays over this many seconds
    let lifelines = assist === 'easy' ? 2 : assist === 'normal' ? 1 : 0;

    // pick questions: round-robin over categories so every topic shows up
    const pools = P.cats.map(c => shuffle(BANK.filter(b => b.c === c)));
    const picked = [];
    for (let i = 0; picked.length < P.n && i < 200; i++) { const p = pools[i % pools.length]; if (p.length) picked.push(p.pop()); }
    shuffle(picked);
    const N = picked.length;

    const S = {
      phase: 'intro', idx: -1, score: 0, streak: 0, best: 0, correct: 0, qT: 0, answered: false, finishT: -1,
      order: [], times: [], wrongs: 0, auto: false, autoT: 0, hidden: [],
    };

    // ---- DOM
    const root_ = document.createElement('div');
    root_.className = 'quiz-root';
    root_.innerHTML =
      '<div class="quiz-top">' +
        '<div class="quiz-dots" aria-hidden="true">' + picked.map((_, i) => '<i data-i="' + i + '"></i>').join('') + '</div>' +
        '<div class="quiz-stats">' +
          '<div class="quiz-stat quiz-stat-q"><span>' + esc(t('quiz.hud.q')) + '</span><b class="quiz-qn">–</b></div>' +
          '<div class="quiz-stat quiz-stat-score"><span>' + esc(t('quiz.hud.score')) + '</span><b class="quiz-score">0</b></div>' +
          '<div class="quiz-stat quiz-stat-streak"><span>' + esc(t('quiz.hud.streak')) + '</span><b class="quiz-streak"><i class="quiz-flame">' + flameSvg() + '</i><em>0</em></b></div>' +
        '</div>' +
      '</div>' +
      '<div class="quiz-stage"></div>';
    layer.appendChild(root_);
    const stage = root_.querySelector('.quiz-stage');
    const elScore = root_.querySelector('.quiz-score');
    const elStreak = root_.querySelector('.quiz-streak');
    const elQn = root_.querySelector('.quiz-qn');
    let card = null, timerBar = null, timerNum = null;

    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

    function showIntro() {
      const cats = P.cats.map(c => '<span class="quiz-chip">' + KOS.UI.iconSvg(CAT_ICON[c] || 'quiz') + esc(t('quiz.cat.' + c)) + '</span>').join('');
      stage.innerHTML = '<div class="quiz-card quiz-intro glass">' +
        '<div class="quiz-intro-ico">' + KOS.UI.iconSvg('quiz') + '</div>' +
        '<h2>' + esc(t('quiz.intro.title')) + '</h2>' +
        '<p class="quiz-intro-sub">' + esc(timeLimit ? t('quiz.intro.sub', { n: N, sec: timeLimit }) : t('quiz.intro.subFree', { n: N })) + '</p>' +
        '<div class="quiz-chips">' + cats + '</div>' +
        '<button type="button" class="btn btn-primary btn-big quiz-go">' + KOS.UI.iconSvg('play') + '<span>' + esc(t('quiz.intro.start')) + '</span></button>' +
        '<p class="quiz-keys">' + esc(t('quiz.intro.keys')) + '</p></div>';
      stage.querySelector('.quiz-go').addEventListener('click', () => { sfx('click'); nextQuestion(); });
      KOS.UI.coach(t('quiz.intro.coach'), { ms: 6500, pos: 'top' });
    }

    function nextQuestion() {
      if (S.phase === 'done') return;
      S.idx++;
      if (S.idx >= N) { endRound(); return; }
      S.phase = 'question'; S.answered = false; S.qT = 0; S.hidden = [];
      const it = picked[S.idx];
      S.order = shuffle(it.a.map((_, j) => j));
      const key = 'quiz.q.' + it.id;
      elQn.innerHTML = (S.idx + 1) + '<small>/' + N + '</small>';
      root_.querySelectorAll('.quiz-dots i').forEach((d, i) => d.classList.toggle('cur', i === S.idx));
      const letters = ['A', 'B', 'C', 'D'];
      stage.innerHTML = '<div class="quiz-card quiz-q glass" data-cat="' + it.c + '">' +
        '<div class="quiz-q-head"><span class="quiz-chip quiz-chip-sm">' + KOS.UI.iconSvg(CAT_ICON[it.c] || 'quiz') + esc(t('quiz.cat.' + it.c)) + '</span>' +
          (timeLimit || assist === 'easy' ? '<div class="quiz-timer"><div class="quiz-timer-bar"><i></i></div><b class="quiz-timer-num"></b></div>' : '') + '</div>' +
        '<div class="quiz-q-body">' +
          '<div class="quiz-ill">' + illustration(it.img) + '</div>' +
          '<h2 class="quiz-question">' + esc(t(key + '.q')) + '</h2>' +
        '</div>' +
        '<div class="quiz-answers">' + S.order.map((j, k) =>
          '<button type="button" class="quiz-ans" data-j="' + j + '" style="--k:' + k + '"><span class="quiz-ans-l">' + letters[k] + '</span><span class="quiz-ans-t">' + esc(t(key + '.a' + j)) + '</span></button>').join('') + '</div>' +
        '<div class="quiz-foot">' +
          (lifelines > 0 ? '<button type="button" class="btn btn-glass btn-sm quiz-life">' + KOS.UI.iconSvg('help') + '<span>' + esc(t('quiz.lifeline')) + '</span><small>' + esc(t('quiz.lifelineLeft', { n: lifelines })) + '</small></button>' : '') +
        '</div>' +
        '<div class="quiz-explain" hidden></div>' +
      '</div>';
      card = stage.firstChild;
      timerBar = card.querySelector('.quiz-timer-bar i');
      timerNum = card.querySelector('.quiz-timer-num');
      card.querySelectorAll('.quiz-ans').forEach(b => b.addEventListener('click', () => answer(+b.getAttribute('data-j'))));
      const lb = card.querySelector('.quiz-life');
      if (lb) lb.addEventListener('click', useLifeline);
      sfx('whoosh', { vol: 0.35, pitch: 1.3 });
    }

    function useLifeline() {
      if (S.answered || lifelines <= 0 || S.hidden.length) return;
      lifelines--;
      const wrong = S.order.filter(j => j !== 0);
      shuffle(wrong);
      S.hidden = wrong.slice(0, 2);
      S.hidden.forEach(j => { const b = card.querySelector('.quiz-ans[data-j="' + j + '"]'); if (b) { b.classList.add('gone'); b.disabled = true; } });
      const lb = card.querySelector('.quiz-life');
      if (lb) lb.disabled = true;
      sfx('pop', { pitch: 1.4 });
      floatText(lb || card, t('quiz.coach.lifeline'), 'fast');
    }

    function answer(j) {
      if (S.phase !== 'question' || S.answered) return;
      S.answered = true; S.phase = 'explain';
      const it = picked[S.idx];
      const ok = j === 0;
      const timeout = j < 0;
      S.times.push(S.qT);
      const btns = card.querySelectorAll('.quiz-ans');
      btns.forEach(b => {
        b.disabled = true;
        const bj = +b.getAttribute('data-j');
        if (bj === 0) b.classList.add('right');
        else if (bj === j) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      const lb = card.querySelector('.quiz-life'); if (lb) lb.disabled = true;
      const dot = root_.querySelector('.quiz-dots i[data-i="' + S.idx + '"]');
      let gained = 0, coachLine = '';
      if (ok) {
        S.correct++; S.streak++; S.best = Math.max(S.best, S.streak);
        const tb = bonusWindow ? Math.round(50 * U.clamp(1 - S.qT / bonusWindow, 0, 1)) : 0;
        const sb = Math.min(100, 20 * (S.streak - 1));
        gained = 100 + tb + sb;
        S.score += gained;
        sfx('coin', { pitch: 1 + Math.min(0.6, (S.streak - 1) * 0.08) });
        if (S.streak >= 3) sfx('cheer', { vol: 0.25 + Math.min(0.3, S.streak * 0.03) });
        if (dot) dot.classList.add('ok');
        const rightBtn = card.querySelector('.quiz-ans.right');
        floatText(rightBtn, '+' + gained, 'good');
        if (S.qT < 4) floatText(rightBtn, t('quiz.fx.fast'), 'fast', 260);
        if (S.streak >= 2) floatText(elStreak, t('quiz.fx.streak', { n: S.streak }), 'streak', 120);
        sparkle(rightBtn);
        if (S.streak === 3) coachLine = t('quiz.coach.streak3');
        if (S.streak === 5) coachLine = t('quiz.coach.streak5');
      } else {
        S.streak = 0; S.wrongs++;
        sfx(timeout ? 'whistle' : 'bump', { vol: 0.6 });
        if (dot) dot.classList.add('bad');
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        if (S.wrongs === 2) coachLine = t('quiz.coach.wrong2');
      }
      updateTop(true);
      const rightText = t('quiz.q.' + it.id + '.a0');
      const head = ok ? t('quiz.right.r' + Math.floor(rng() * 5)) : timeout ? t('quiz.timeout') : t('quiz.wrong');
      const ex = card.querySelector('.quiz-explain');
      ex.innerHTML = '<div class="quiz-ex-head ' + (ok ? 'ok' : 'bad') + '">' + KOS.UI.iconSvg(ok ? 'check' : 'close') + '<b>' + esc(head) + '</b>' +
        (!ok ? '<span>' + esc(t('quiz.correctWas', { a: rightText })) + '</span>' : '') + '</div>' +
        '<p class="quiz-ex-txt"><em>' + esc(t('quiz.didYouKnow')) + '</em> ' + esc(t('quiz.q.' + it.id + '.ex')) + '</p>' +
        (coachLine ? '<div class="quiz-coachline"><span class="quiz-coach-av">' + KOS.UI.coachSvg(ok ? 'wow' : 'oops') + '</span><span><b>' + esc(t('ui.coach.name')) + '</b> ' + esc(coachLine) + '</span></div>' : '') +
        '<button type="button" class="btn btn-primary quiz-next">' + esc(S.idx + 1 >= N ? t('quiz.finish') : t('quiz.next')) + KOS.UI.iconSvg('next') + '</button>';
      ex.hidden = false;
      card.classList.add('answered');
      ex.querySelector('.quiz-next').addEventListener('click', () => { sfx('click'); nextQuestion(); });
      try { ex.querySelector('.quiz-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      try { ex.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    }

    function updateTop(bump) {
      elScore.textContent = S.score.toLocaleString(KOS.I18n.lang === 'en' ? 'en-GB' : 'da-DK');
      elStreak.querySelector('em').textContent = S.streak;
      elStreak.classList.toggle('hot', S.streak >= 3);
      if (bump) { const s = root_.querySelector('.quiz-stat-score'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
    }

    function floatText(anchor, text, kind, delay) {
      if (!anchor) return;
      const r = anchor.getBoundingClientRect(), lr = layer.getBoundingClientRect();
      const n = document.createElement('div');
      n.className = 'quiz-float quiz-float-' + kind;
      n.textContent = text;
      n.style.left = (r.left - lr.left + r.width / 2) + 'px';
      n.style.top = (r.top - lr.top) + 'px';
      if (delay) n.style.animationDelay = delay + 'ms';
      root_.appendChild(n);
      n.addEventListener('animationend', () => n.remove());
    }
    function sparkle(anchor) {
      if (!anchor || (KOS.UI.reduced && KOS.UI.reduced())) return;
      const r = anchor.getBoundingClientRect(), lr = layer.getBoundingClientRect();
      for (let i = 0; i < 10; i++) {
        const n = document.createElement('i');
        n.className = 'quiz-spark';
        const a = (i / 10) * Math.PI * 2;
        n.style.left = (r.left - lr.left + r.width / 2) + 'px';
        n.style.top = (r.top - lr.top + r.height / 2) + 'px';
        n.style.setProperty('--dx', Math.cos(a) * (60 + (i % 3) * 20) + 'px');
        n.style.setProperty('--dy', Math.sin(a) * (40 + (i % 2) * 18) + 'px');
        n.style.background = ['#ffd25e', '#3ee08f', '#49c6f2', '#ff7a3d'][i % 4];
        root_.appendChild(n);
        n.addEventListener('animationend', () => n.remove());
      }
    }

    function starsFor() {
      const r = S.correct / Math.max(1, N);
      const th = assist === 'easy' ? [0.4, 0.65, 0.85] : assist === 'pro' ? [0.6, 0.8, 0.95] : [0.5, 0.7, 0.9];
      return r >= th[2] ? 3 : r >= th[1] ? 2 : r >= th[0] ? 1 : 0;
    }

    function endRound() {
      S.phase = 'done';
      const stars = starsFor();
      const avg = S.times.length ? S.times.reduce((a, b) => a + b, 0) / S.times.length : 0;
      S.result = {
        stars, score: S.score + S.best * 25, timeMs: Math.round(S.times.reduce((a, b) => a + b, 0) * 1000), success: stars > 0,
        stats: { 'quiz.stat.correct': S.correct + ' / ' + N, 'quiz.stat.streak': S.best, 'quiz.stat.avg': avg.toFixed(1) + ' s' },
        msgKey: 'quiz.res.msg', msgVars: { n: S.correct, of: N, streak: S.best },
      };
      if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* ignore */ } sfx('win'); } else if (stars > 0) sfx('cheer', { vol: 0.5 }); else sfx('lose');
      stage.innerHTML = '<div class="quiz-card quiz-end glass"><div class="quiz-end-big">' + S.correct + '<small>/' + N + '</small></div>' + KOS.UI.stars(stars) + '</div>';
      S.finishT = 1.4;
    }

    function onKey(e) {
      if (e.repeat) return;
      const k = e.key;
      if (S.phase === 'intro' && (k === 'Enter' || k === ' ')) { e.preventDefault(); nextQuestion(); return; }
      if (S.phase === 'question') {
        let n = -1;
        if (/^[1-4]$/.test(k)) n = +k - 1;
        else if (/^[a-dA-D]$/.test(k)) n = k.toLowerCase().charCodeAt(0) - 97;
        if (n >= 0 && n < S.order.length) { const j = S.order[n]; if (S.hidden.indexOf(j) < 0) { e.preventDefault(); answer(j); } }
        else if ((k === 'h' || k === 'H' || k === '?') && lifelines > 0) useLifeline();
      } else if (S.phase === 'explain' && (k === 'Enter' || k === ' ' || k === 'ArrowRight')) { e.preventDefault(); nextQuestion(); }
    }
    window.addEventListener('keydown', onKey);

    return {
      start() { showIntro(); updateTop(false); },
      update(dt) {
        if (S.phase === 'question') {
          S.qT += dt;
          if (timeLimit && S.qT >= timeLimit) answer(-1);
        }
        if (S.auto) {
          S.autoT += dt;
          if (S.phase === 'intro' && S.autoT > 0.3) { S.autoT = 0; nextQuestion(); }
          else if (S.phase === 'question' && S.autoT > 0.6) { S.autoT = 0; answer(0); }
          else if (S.phase === 'explain' && S.autoT > 0.6) { S.autoT = 0; nextQuestion(); }
        }
        if (S.phase === 'done' && S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      },
      render() {
        if (S.phase !== 'question' || !timerBar) return;
        const lim = timeLimit || bonusWindow;
        const k = U.clamp(1 - S.qT / lim, 0, 1);
        timerBar.style.transform = 'scaleX(' + k.toFixed(3) + ')';
        timerBar.parentNode.classList.toggle('low', !!timeLimit && k < 0.3);
        if (timerNum) { const s = Math.max(0, Math.ceil(lim - S.qT)); if (timerNum.textContent !== String(s)) timerNum.textContent = timeLimit ? s : ''; }
      },
      destroy() {
        window.removeEventListener('keydown', onKey);
        root_.remove();
      },
      pause() {}, resume() {},
      // ---- test hooks
      setAutopilot(on) { S.auto = !!on; },
      skipIntro() { if (S.phase === 'intro') nextQuestion(); },
      debug: { S, picked, answer, BANK_SIZE: BANK.length },
    };
  }

  function flameSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3-1-3 0-6 1-9.5z" fill="currentColor"/></svg>';
  }

  KOS.QuizBank = { illustration, list: () => BANK.map(b => b.img), size: () => BANK.length, cats: () => BANK.reduce((o, b) => { o[b.c] = (o[b.c] || 0) + 1; return o; }, {}) };
})(typeof window !== 'undefined' ? window : globalThis);
