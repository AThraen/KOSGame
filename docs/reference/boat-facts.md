# Boat card facts: sources

Not shown in the game. Used by `js/core/boatfacts.js` (the Bådkort in the Sejlerpas). Only facts seen on the pages below are used.
Wikipedia is a secondary source; no class association or World Sailing page was reachable during research. Anything not verified is left out.

Fact-box numbers (length, beam, sail area, crew, sails) come from the game's own boat definitions in `js/core/boats.js`; skrogvægt (hull weight) is from the pages below.
"I KØS" lines come only from the "Club facts" and "Club boat photos" sections of `SPEC.md`.

| Boat | Source | Used for |
|---|---|---|
| Optimist | https://en.wikipedia.org/wiki/Optimist_(dinghy) | Clark Mills, 1947, Clearwater (Florida), age 7-15, hull 35 kg, biggest youth class, one 3.3 m2 sail, Axel Damgaard brought it to Europe, World Sailing class |
| RS Tera | https://en.wikipedia.org/wiki/RS_Tera | Paul Handley, RS Sailing (UK), Mini/Sport/Pro sails (Mini from age 5), self-draining cockpit, floating daggerboard, international class. Launch year left out (sources conflict). |
| RS Feva | https://en.wikipedia.org/wiki/RS_Feva | Paul Handley, 2002, UK, single-line gennaker (asymmetric spinnaker), rotomoulded polyethylene, 1-3 sailors (2 recommended), international class |
| RS Zest | https://www.rssailing.com/why-is-the-rs-zest-the-right-sailboat-for-you/ ; https://en.wikipedia.org/wiki/RS_Sailing | Jo Richards, 2017, UK, rotomoulded hull, roller-reefing main, uses incl. superyacht tender, SAIL Best Daysailer 2018. No class status found, none shown. |
| ILCA | https://en.wikipedia.org/wiki/ILCA_Dinghy | Bruce Kirby and Ian Bruce, 1970, Canada, renamed ILCA in 2019 after the Laser licence/trademark dispute, 223,000+ boats in 120 countries, Olympic since 1996 (Radial/ILCA 6 for women 2008), hull 58.97 kg, three rigs |
| 29er | https://en.wikipedia.org/wiki/29er_(dinghy) | Julian Bethwaite, first produced 1998, hull 74 kg, trapeze, derived from the Olympic 49er, about 7,000 registered, Youth Worlds. Country of origin left out (not stated on the page). |
| H-boat | https://en.wikipedia.org/wiki/H-boat | Hans Groop (Finland), 1967, H = Hestia, 5,000+ hulls, crew of three, Paul Elvstrom improved rudder and mast in 1971, international status 1977. Hull weight left out (the game's total mass differs). |
| J/70 | https://en.wikipedia.org/wiki/J/70 | Alan Johnstone, 2012, J Boats (USA), retractable carbon bowsprit, lifting lead keel, 1,451+ built by 2019, World and European championships |
| RIB | https://en.wikipedia.org/wiki/Rigid-hulled_inflatable_boat | Idea c. 1962 at Atlantic College (Wales) under Rear-Admiral Desmond Hoare, 1964 plywood repair, Avon Searider 1969, rigid hull + air-filled tubes, rescue/patrol/dive support |

## Left out because it could not be verified
- Typical sailor age and weight for Tera, Feva, Zest, ILCA, 29er, H-boat, J/70 (no source seen). Only the Optimist (7-15) is shown.
- RS Tera launch year (2007 vs 1997 in different sources), 29er country, Zest class status, hull weights other than Optimist, ILCA and 29er.
- Optimist length: the class page says 2.36 m, the game model uses 2.31 m, so the length is not repeated in the fun facts.

## Club fleet sheet (weight windows, club rigs)
Source: KØS Sejlsport, "Vores jolleflåde" (club handout, 2026-10). Only the data is transcribed (the handout has photos of club sailors and is not in the repo). See SPEC.md "Club facts (fleet sheet ...)".
- Weight windows (core / extended, kg per sailor; edge = extended ±2.5) and the "typisk sejler" kg text come from the sheet, bar ends read to the nearest kg. The 29er ends were read as core 58–64, extended 55–68 (not 59–65 / 55–69).
- Sail areas on the card are the club's: Optimist 3.3, Tera Sport 3.7 / Pro 4.8, ILCA 4 = 4.7 / ILCA 6 = 5.76 (the game's physics models an ILCA 7, 7.06 m2; the card says the class has rigs 4/6/7 and that KØS sails 4 and 6), Feva 6.4, 29er 10.8.
- Game `boats.js` keeps its own sailArea (Feva 8.0, 29er 12.5, ILCA 7.06) so speeds are unchanged; the card does not show those.
- RS Feva official (RS Sailing rigging manual, rssailing.com/wp-content/uploads/guides/RSFevaRiggingGuide.pdf; also Wikipedia RS_Feva): main 5.5 m2 (S, reefing) or 6.5 m2 (XL), jib 2.1 m2, gennaker 7.0 m2. Club 6.4 m2 is NOT main+jib (that would be 7.6 / 8.6); it is close to the XL main alone. Card shows "6,4 m2 (klubbens tal)" and gennaker 7,0 m2 (verified).
- 29er: Wikipedia and Mackay give upwind 13.19 m2 and spinnaker 16.83 m2; Ovington and an Australian brochure give 12.5 m2 and 15 m2. No official class figure was reachable, so the club's 10.8 m2 is shown as "klubbens tal" and no gennaker area is shown.
- Progression, introduction-boat and Zest (mikrosejlere, parent + child) texts come from the sheet and the user's notes in SPEC.md.
