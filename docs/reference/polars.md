# Reference polars (real boat speed data)

Boat speed in **knots** by **true wind speed** (columns) and **true wind angle** (rows), from ORC (Offshore Racing
Congress) VPP certificates. ORC VPPs are handicap predictions: realistic for displacement sailing, conservative for
planing/surfing peaks (a J70 in 20+ kn with waves surfs at 15–20 kn for short bursts).
Reaching/downwind numbers assume the spinnaker/gennaker is set where it is faster.

## J/70 (ORC one-design, TUR 1081 — TUR 1321 is within ±0.05 kn)
Source: https://data.orc.org/public/WPub.dll/CC/04590002JUP.pdf

| TWA \ TWS   | 6    | 8    | 10   | 12   | 14   | 16   | 20    |
|-------------|------|------|------|------|------|------|-------|
| Beat angle  | 43.2°| 41.7°| 39.4°| 37.6°| 37.3°| 37.2°| 38.4° |
| Beat VMG    | 3.09 | 3.77 | 4.25 | 4.56 | 4.65 | 4.68 | 4.63  |
| 52°         | 4.70 | 5.60 | 6.07 | 6.38 | 6.57 | 6.66 | 6.71  |
| 60°         | 4.95 | 5.79 | 6.23 | 6.59 | 6.86 | 6.99 | 7.11  |
| 75°         | 5.10 | 5.90 | 6.37 | 6.81 | 7.24 | 7.58 | 7.91  |
| 90°         | 5.38 | 6.23 | 6.73 | 7.02 | 7.34 | 7.92 | 8.88  |
| 110°        | 5.45 | 6.34 | 7.05 | 7.73 | 8.26 | 8.75 | 9.72  |
| 120°        | 5.31 | 6.23 | 6.95 | 7.77 | 8.68 | 9.47 | 10.93 |
| 135°        | 4.79 | 5.85 | 6.54 | 7.23 | 8.11 | 9.18 | 12.60 |
| 150°        | 4.07 | 5.15 | 5.93 | 6.48 | 7.04 | 7.82 | 10.76 |
| Run VMG     | 3.52 | 4.46 | 5.13 | 5.61 | 6.10 | 6.77 | 9.32  |
| Gybe angle  | 144° | 148° | 150° | 148° | 146° | 144° | 140°  |

## H-boat (ORC one-design certificate "HBOAT")
Source: https://data.orc.org/public/WPub.dll/CC/0292000482J

| TWA \ TWS   | 4    | 6    | 8    | 10   | 12   | 14   | 16   | 20   | 24   |
|-------------|------|------|------|------|------|------|------|------|------|
| Beat angle  | 46.0°| 43.6°| 42.2°| 40.1°| 38.7°| 38.3°| 38.2°| 38.5°| 39.8°|
| Beat VMG    | 1.91 | 2.76 | 3.37 | 3.81 | 4.08 | 4.20 | 4.26 | 4.29 | 4.22 |
| 52°         | 3.00 | 4.21 | 5.05 | 5.53 | 5.79 | 5.93 | 6.00 | 6.06 | 6.06 |
| 60°         | 3.23 | 4.44 | 5.25 | 5.70 | 5.95 | 6.10 | 6.19 | 6.27 | 6.29 |
| 75°         | 3.37 | 4.58 | 5.38 | 5.84 | 6.11 | 6.31 | 6.48 | 6.66 | 6.75 |
| 90°         | 3.42 | 4.74 | 5.61 | 6.04 | 6.29 | 6.43 | 6.64 | 7.07 | 7.30 |
| 110°        | 3.43 | 4.76 | 5.64 | 6.12 | 6.49 | 6.84 | 7.16 | 7.55 | 7.89 |
| 120°        | 3.27 | 4.57 | 5.49 | 6.03 | 6.43 | 6.83 | 7.26 | 8.02 | 8.70 |
| 135°        | 2.83 | 4.07 | 5.02 | 5.76 | 6.19 | 6.57 | 7.00 | 8.06 | 9.95 |
| 150°        | 2.33 | 3.47 | 4.44 | 5.26 | 5.85 | 6.24 | 6.60 | 7.48 | 8.75 |
| Run VMG     | 2.02 | 3.00 | 3.85 | 4.58 | 5.25 | 5.73 | 6.11 | 6.79 | 7.63 |
| Gybe angle  | 143° | 148° | 152° | 155° | 163° | 171° | 177° | 176° | 165° |

## Dinghies (Optimist, Tera, Feva, Zest, ILCA, 29er)
See **Dinghy reference data and game comparison** below (researched 2026-10-11). Nobody publishes ORC-style polars
for these classes, so the reference is built from GPS race tracking, two sports-science GPS papers, one Laser VPP paper
and the RYA Portsmouth Yardstick.

## Game vs reference (measured 2026-10-06, `KOS.Physics`, steady wind)
- J70 best downwind with gennaker: game 10.5 @12, 12.7 @16, 14.9 @20, 17.4 @25 TWS.
  ORC 135°: 7.2 @12, 9.2 @16, 12.6 @20. The game is already faster than the ORC VPP; real J70s surf to 15–20 kn
  in 20+ kn with waves.
- H-boat: maxKn 6.8 caps it, but ORC has 8–10 kn at 135° in 20–24 kn with spinnaker → raise the cap for strong wind.
  Upwind boatspeed ~5.4 kn in 10 kn vs ORC ≈ 5.0 kn (3.81 VMG at 40°) → slightly fast.

# Dinghy reference data and game comparison (researched 2026-10-11)

This was research only: nothing in `js/` was changed. Scripts used (local, gitignored): `tools/tmp/polars-measure.js`
(game polar and steady-state physics grid), `tools/tmp/polars-cmp.js`, `tools/tmp/polars-pn.js`,
`tools/tmp/polars-proposal.js` (re-evaluates `boats.js` with the proposed numbers below), and
`tools/tmp/sap-pull.js` + `sap-agg.js` (SAP data).

## Sources and how far to trust them

| # | Source | What it gives | Trust |
|---|--------|---------------|-------|
| S1 | **SAP Sailing Analytics public API**: `https://www.sapsailing.com/sailingserver/api/v1/regattas/{regatta}/races/{race}/competitors/legs` and `/regattas/{regatta}/windsummary` | GNSS tracker data from real regattas: average and max speed over ground (SOG) for every boat on every leg, tacks/gybes per leg, wind range per race. Pulled 2026-10-11, up to 10 regattas × 14 races per class | **Good for boat speed, fair for wind.** Real boats and sailors, large samples (n in the table). Caveats: a leg average includes tacks, gybes and tactics, so steady straight-line speed is ~5–10 % higher. Wind is SAP's per-race range (mid-point used), which is coarse and least reliable in the 0–6 kn bin (omitted) and at training events. The true wind angle of "reach" legs is unknown (typically 100–130°). Mostly elite youth fleets in Kiel/Travemünde chop. **Cross-check:** H-boat and J/70 upwind SOG from the same pipeline lands within 0.1–0.3 kn of the ORC boat speeds above, so the method holds up. |
| S2 | Caraballo, Pezelj, Ramos-Álvarez 2024, *Analysis of the Performance and Sailing Variables of the Optimist Class in a Variety of Wind Conditions*, J. Funct. Morphol. Kinesiol. 9(1):18, https://pmc.ncbi.nlm.nih.gov/articles/PMC10801571/ | 203 elite Optimist sailors aged 9–15 at Travemünder Woche 2017 (SAP GNSS): leg-average VMG by wind range | Good (peer reviewed, large sample). A leg-average VMG includes tacks and shifts, so it is lower than polar VMG. |
| S3 | *Analysis of sailing variables and performance of laser sailors with different rankings under the condition of certain wind speed*, Heliyon 2022, https://pmc.ncbi.nlm.nih.gov/articles/PMC9719898/ | Leg-average VMG for the Laser fleet at World Cup Series 2019/20 and Tokyo 2020 (SAP GNSS), by wind range | Good. Elite men, almost certainly ILCA 7. Same leg-average caveat. |
| S4 | A. H. Day 2017, *Performance prediction for sailing dinghies*, Ocean Engineering, https://pureportal.strath.ac.uk/files-asset/64217569/Day_OE_2017_Performance_prediction_for_sailing_dinghies.pdf | Laser VPP validated against measured data: best upwind TWA **40–46°** in flat water, upwind boat speed in the **3–5 kn** range, sailed flat up to ~9 kn TWS, depowering from ~9 kn | Good for angles and trends. The speed polars exist only as figures (no text values). |
| S5 | RYA Portsmouth Yardstick 2025 (https://britishsailingteam.rya.org.uk/media/vc0bdum2/py_list_2025-1.pdf) and 2026 (https://www.yachtsandyachting.com/news/293896/RYA-reveals-2026-Portsmouth-Yardstick-numbers) | Relative race speed (PN ∝ elapsed time, so the speed ratio is the inverse) | Good for relative club-racing pace averaged over all conditions. Says nothing about polar shape. |
| S6 | West Wittering SC 2026 handicaps, https://www.wwsc.co.uk/racing/2026%20handicaps | RS Zest PN 1300 (a club number: the Zest is not on the RYA list) | Weak (one club, few returns). |
| S7 | ILCA class news *Australian Speed Rivalry*, https://ilcasailing.org/australian-speed-rivalry/ | ILCA 6 peaks: 22.2 kn (SAP tracker, Radial Worlds Kiel 2018, reach in a big gust) and 21.6 kn (Garmin, 40+ kn gusts) | Weak/anecdotal: freak peaks, not polar values. |
| S8 | YouTube "20 Knots in a 29er on GO PRO", https://www.youtube.com/watch?v=Es5I4LROIBQ | 29er peak of ~20 kn | Weak (video title only). |

Not found despite searching: any published polar or VPP table for the Optimist, RS Tera, RS Feva, RS Zest or 29er;
open Velocitek/SailMon datasets; Bethwaite's 29er numbers (only in the printed book). The RS Tera has SAP races but no
wind data.

### Portsmouth Yardstick (RYA 2025 / 2026)
| Class | PN 2025 | PN 2026 | Speed vs ILCA 7 (1103/PN) |
|-------|---------|---------|----------------------------|
| Optimist | 1631 | 1629 | 0.68 |
| RS Tera Sport (3.7 m², the game's rig) | 1445 | 1452 | 0.76 |
| RS Tera Pro | 1370 | 1368 | 0.81 |
| RS Zest | – | 1300 (club, S6) | ≈0.85 |
| RS Feva XL | 1244 | 1248 | 0.88 |
| ILCA 4 | 1216 | 1218 | 0.91 |
| ILCA 6 | 1154 | 1156 | 0.95 |
| ILCA 7 | 1104 | 1103 | 1.00 |
| 29er | 900 | 900 | 1.23 |

The game's `ilca` has sailArea 7.06 m², so it models the **ILCA 7** (full rig). KØS youth sailors are more likely on
ILCA 4/6, so data for those rigs is included below.

## Real speeds from SAP tracking (S1)
Each value is the median over legs of the **top 25 % of boats' average SOG** on that leg, in kn. The max column is the
fleet's 90th-percentile max SOG (a "burst" speed, median over legs). Wind = the race's wind-range mid-point in kn.
n = number of legs.

| Class (regattas) | Wind | Upwind SOG | Reach SOG | Downwind SOG | p90 max SOG | n (up/reach/down) |
|------------------|------|-----------|-----------|--------------|-------------|-------------------|
| **Optimist** (SAP Opti-Cup 2015, Optikrokodil, ODM 2024, SCGN training) | 6–9 | 2.6 | 2.6 | 2.9 | 4.1–4.2 | 29/23/34 |
|  | 9–12 | 3.0 | – | 3.6 | 5.0 | 2/0/3 |
|  | 12–15 | 3.3 | – | 4.3 | 5.7 | 6/0/9 |
| **RS Tera** (OYC Prague 2022, Omniplast Cup 2023; **no wind data**) | ? | 2.9 (1.8–3.5) | 3.7 | 3.5 (2.5–4.6) | 5.2 (p99 5.9) | 24/11/25 |
| **RS Feva** (Travemünder Woche 2015, ODM 2024) | 6–9 | 3.0 | 2.7 | 3.2 | 5.2 | 7/3/6 |
|  | 9–12 | 4.0 | 6.5 | 5.2 | 8.3–9.9 | 6/3/9 |
|  | 12–15 | 4.3 | 5.5 | 5.9 | 9.6 | 6/6/8 |
| **ILCA 4** (TW 2015/2017, KW 2015/2021) | 6–9 | 3.3 | 4.4 | 3.6 | 5.6 | 23/34/26 |
|  | 9–12 | 4.2 | 5.5 | 5.5 | 8.2 | 21/28/22 |
|  | 12–15 | 4.5 | 6.9 | 6.2 | 9.6 | 26/27/23 |
| **ILCA 6** (World Cup Hyères/Qingdao/Melbourne, KW 2013/2017, TW 2015) | 6–9 | 4.1 | 5.4 | 4.8 | 7.4 | 18/16/23 |
|  | 9–12 | 4.4 | 6.4 | 5.7 | 8.5 | 36/46/38 |
|  | 12–15 | 4.5 | 7.4 | 6.5 | 10.1 | 18/21/18 |
|  | 15+ | 4.5 | 8.9 | 9.6 | 13.3 | 18/17/23 |
| **ILCA 7** (KW 2017/2026, WCS Hyères 2018, Olympic test event 2023) | 6–9 | 4.0 | 4.9 | 4.2 | 6.4 | 15/23/18 |
|  | 9–12 | 4.9 | 6.8 | 5.5 | 8.4 | 17/16/20 |
|  | 12–15 | 4.9 | 8.3 | 6.7 | 9.8 | 6/5/6 |
|  | 15+ | 5.3 | 9.6 | 9.0 | 12.8 | 3/6/3 |
| **29er** (Worlds, Youth Worlds 2022/2025, KW 2021, TW 2017, YES 2015, JOC) | 6–9 | 4.9 | 5.7 | 6.2 | 10.3 | 43/34/48 |
|  | 9–12 | 5.6 | 8.1 | 8.8 | 13.1 | 29/31/29 |
|  | 12–15 | 7.3 | 9.5 | 11.9 | 15.9 | 20/26/16 |
|  | 15+ | 8.0 | 11.8 | 13.4 | 17.8 | 8/4/8 |
| **H-boat** (KW 2013/2015, IDM, Danish points series 2021) | 6–9 | 4.2 | 4.9 | 5.2 | 6.5 | 12/12/14 |
|  | 9–12 | 5.0 | 5.1 | 5.6 | 6.8 | 3/6/4 |
| **J/70** (Kieler Woche 2015/2018/2020) | 6–9 | 5.4 | 6.4 | 5.7 | 8.2 | 11/7/14 |
|  | 12–15 | 5.6 | 7.5 | 8.2 | 11.4 | 6/2/8 |
|  | 15+ | 5.6 | 8.3 | 10.1 | 14.7 | 13/10/15 |

Leg-average VMG from the papers (S2, S3), top group:

| | Wind | Upwind VMG | Broad-reach / reach VMG | Run / downwind VMG |
|-|------|-----------|-------------------------|--------------------|
| Optimist, Travemünde 2017 (S2, P25 group) | 5–8 | 1.6 | 3.3 | 3.1 |
|  | 8–12 | 1.6 | 3.8 | 3.4 |
|  | 12–15 | 1.9 | 4.0 | 4.0 |
| Laser (ILCA 7) elite (S3, top 10) | <8 | 2.7 | 4.4 | 3.4 |
|  | 8–12 | 3.3 | 6.1 | 4.7 |
|  | >12 | 3.8 | 9.5 | 7.9 |

## The game today (measured 2026-10-11 on origin/main 0543696)
- **Steady-state physics matches the raw polar.** With auto-trim and auto-hike, a boat pinned on a heading settles to
  `def.polar` × `spiFactor` within 0.1 kn everywhere. The exception is upwind in 16–20 kn, where heel takes off
  0.1–0.7 kn (29er 7.9 → 7.2 kn at the optimum in 20 kn). No boat capsized in the steady test on `normal` assist.
- **Planing does not change the speed.** `cls.plane` only sets `boat.planing` and fires `boat:plane`. Above 10 kn the
  polar grows linearly (`kUp`/`kDown`), so there is no planing "jump".
- **Every class points about 5° too wide.** The VMG optimum always lands at noGo + 6…12°: Opti 51°, Tera 51°, Zest
  50°, Feva 49°, ILCA 48°, 29er 52°, H-boat/J70 46°. Real values: Laser 40–46° (S4), ORC H-boat/J70 38–43°.

Game speeds at the SAP bin centres (`KOS.Boats.optimal`, kite where fitted; "speed (TWA)"):

| Boat | | 7.5 kn | 10.5 kn | 13.5 kn | 17 kn |
|------|-|--------|---------|---------|-------|
| Opti | up | 2.9 (51°) | 3.5 | 3.6 | 3.7 |
| | down | 3.0 (164°) | 3.8 | 4.0 | 4.3 |
| | reach 110° | 3.7 | 4.6 | 4.8 | 5.0 |
| Tera | up / down / reach | 2.9 / 3.4 / 4.0 | 3.6 / 4.3 / 5.1 | 3.7 / 4.6 / 5.4 | 3.9 / 5.1 / 5.8 |
| Feva | up | 3.4 (49°) | 4.3 | 4.5 | 4.6 |
| | down + gennaker | 5.2 (151°) | 6.5 | 7.4 | 8.4 |
| | reach 110° + gennaker | 6.1 | 7.6 | 8.4 | 9.2 |
| Zest | up / down / reach | 3.2 / 3.6 / 4.2 | 4.0 / 4.5 / 5.3 | 4.1 / 4.9 / 5.6 | 4.2 / 5.4 / 6.0 |
| ILCA | up | 3.8 (48°) | 4.8 | 5.0 | 5.2 |
| | down | 4.3 (165°) | 5.5 | 6.4 | 7.3 |
| | reach 110° | 5.0 | 6.5 | 7.1 | 7.9 |
| 29er | up | 5.7 (52°) | 7.3 | 7.6 | 8.0 |
| | down + gennaker | 9.1 (147°) | 12.1 | 14.7 | 17.8 |
| | reach 110° + gennaker | 10.9 | 14.2 | 16.3 | 18.8 |
| H-boat | up / down + spi | 4.5 / 4.8 | 5.3 / 5.8 | 5.4 / 6.0 | 5.5 / 6.3 |
| J/70 | up / down + gennaker | 4.6 / 7.2 | 5.6 / 9.0 | 5.8 / 10.5 | 5.9 / 12.4 |

Effect of the gennaker/spinnaker (`spiFactor`, before the maxKn cap): Feva ×1.25, 29er ×1.32 and J70 ×1.30 from
~100° TWA onwards, fading towards a dead run for asymmetric kites; H-boat ×1.12. On the asymmetric boats the kite
moves the best gybe angle from ~163° to 147–151°.

Windward-leeward lap speed relative to the ILCA (harmonic mean of best up and down VMG) vs the PN ratio:

| | PN ratio | game @6 kn | @10 | @14 | @18 |
|-|----------|-----------|-----|-----|-----|
| Opti | 0.68 | 0.72 | 0.69 | 0.66 | 0.63 |
| Tera (Sport) | 0.76 | 0.75 | 0.73 | 0.71 | 0.69 |
| Zest | ≈0.85 | 0.84 | 0.81 | 0.79 | 0.77 |
| Feva | 0.88 | 0.97 | 0.94 | 0.93 | 0.92 |
| 29er | 1.23 | 1.50 | 1.54 | 1.57 | 1.59 |

The ladder order is right (Opti < Tera < Zest < Feva < ILCA < 29er). Relative to the others, the **29er is ~25 % too
fast** and the **Feva ~6 % too fast**. The rest sit within a few percent of PN. As a cross-check, the same lap index
built from the SAP numbers (29er vs ILCA 7 in 9–12 kn) gives 1.24, close to the PN ratio.

## Game vs real, per boat, with recommendations
Keep in mind that SAP SOG is a leg average (≈5–10 % below steady speed) sailed by elite youths. Kids in the game should
feel roughly real numbers, but the ladder order and the feeling that each new boat is faster matter more than ±0.3 kn.

**Optimist: keep the speeds, optionally fix pointing.** Upwind the game gives 2.9/3.5/3.6 kn vs real 2.6/3.0/3.3:
10–15 % fast, or about right once tacks are allowed for. Downwind 3.0/3.8/4.0 vs real 2.9/3.6/4.3: good. The leg VMG
from S2 (1.6–1.9 up, 3.4–4.0 down) agrees. maxKn 6.2 vs p90 bursts of 5–5.7 kn: fine. Only the shape is off: the game
Opti tacks through ~102°. Optional tweak: `noGoDeg 45→41, up 3.5→3.25`, which keeps the same upwind VMG with the best
TWA at 47°. Keep the forgiving feel, since this is the starter boat.

**RS Tera (Sport): keep.** There is no wind-tagged data. The SAP medians (wind unknown, mostly light to moderate) are
up 2.9 / reach 3.7 / down 3.5 kn, with bursts of ~5.2 kn. The game's 10 kn values (3.6/5.1/4.3) are plausible for
moderate wind. PN index 0.76 vs game 0.71–0.75: fine. If the club's Teras use the **Pro** rig (4.5 m²), raise all four
speeds by ~6 %.

**RS Feva (XL): tweak, because the gennaker is too strong in light and medium air.** Upwind 3.4/4.3/4.5 kn vs real
3.0/4.0/4.3: fine. Downwind with gennaker 5.2/6.5/7.4 vs real 3.2/5.2/5.9: 25–60 % fast. Reach 7.6 vs 6.5 at 10 kn.
Real bursts are ~9–10 kn, so maxKn 12 (×1.05) is a little high. Suggested numbers (checked with `polars-proposal.js`):
`noGoDeg 43→40, up 4.3→4.2, reach 6.0→5.4, broad 5.6→4.8, run 4.5→4.2, spinnakerBoost 1.25→1.2, lightExp
0.75→0.9, kDown 0.45→0.55, maxKn 12→13`. Result: up 3.2/4.2/4.4 kn at 46°, down 4.0/5.3/6.2/7.2, reach 5.0/6.6/7.3/8.2,
lap index 0.86–0.90 (PN 0.88). The gennaker still adds a clear +20 %, which keeps the "it flies" moment.

**RS Zest: keep (no real data).** Only a club PN (~1300) exists. The game index of 0.77–0.84 sits between the Tera and
the Feva, as it should. It is a trainer that does not plane, so it is fine as it is.

**ILCA (= ILCA 7): small tweak for more strong-wind reaching/planing and better pointing.** Upwind 3.8/4.8/5.0/5.2 kn vs
real 4.0/4.9/4.9/5.3: excellent. Downwind 4.3/5.5/6.4/7.3 vs 4.2/5.5/6.7/9.0, and reach 5.0/6.5/7.1/7.9 vs
4.9/6.8/8.3/9.6: right in light and medium wind, too slow above ~13 kn because there is no planing growth. Real bursts
are 10–14 kn against a game cap of 12. Suggested: `noGoDeg 42→39, up 4.8→4.6, kDown 0.5→0.75, maxKn 12→14`. That
gives up 3.7/4.6/4.8/5.0 at 45°, down 4.3/5.6/6.8/8.2 and reach 5.0/6.5/7.5/8.6. If the club sails ILCA 6/4, an ILCA 6
variant would be ≈5 % slower upwind (real 4.1/4.4/4.5) and about the same downwind.

**29er: bigger change, because it is too fast everywhere except upwind in a breeze.** Upwind 5.7/7.3/7.6/8.0 kn vs real
4.9/5.6/7.3/8.0: too fast in light and medium wind, and it does not gain enough with wind (real trapeze boats keep
accelerating upwind). Downwind with gennaker 9.1/12.1/14.7/17.8 vs 6.2/8.8/11.9/13.4, and reach 10.9/14.2/16.3/18.8 vs
5.7/8.1/9.5/11.8: 30–45 % fast. Real bursts are ~16–18 kn in 15+ kn and extreme records ~20 kn; the game allows 23.
Best upwind TWA is 52° vs a real ~42°. Suggested: `noGoDeg 40→37, up 6.2→5.8, reach 10.5→8.2, broad 9.6→7.6, run
6.6→5.4, kUp 0.15→0.5, lightExp 0.85→0.7, maxKn 22→20` (keep spinnakerBoost 1.32). Result: up 4.7/5.9/6.8/7.8 kn at
43°, down 7.6/9.6/11.7/14.1, reach 8.9/11.2/13.3/15.8, lap index 1.37–1.61 (the SAP-based index is 1.24 at 10 kn and
1.52 at 13.5 kn). It is still by far the fastest dinghy, but it no longer goes twice as fast as the ILCA on a reach.
**Playability:** keep the 29er thrilling. If the lower numbers feel flat in testing, add speed through a planing bonus
(below) rather than raising the base polar again.

**H-boat: keep (slightly fast upwind).** SAP upwind 4.2/5.0 kn (6–9 / 9–12 kn wind) vs game 4.5/5.3, and ORC 5.0 at
10 kn. Downwind SAP 5.2/5.6 vs game 4.8/5.8. Optional: `up 5.3→5.0`. The note above about raising maxKn for 20+ kn
still stands.

**J/70: keep.** SAP upwind 5.4–5.6 kn vs game 4.6 (at 7.5 kn) and 5.6–5.9, so the game is a little slow in light air
(ORC gives 5.0 at 8 kn). Downwind SAP 5.7/8.2/10.1 vs game 7.2/10.5/12.4: the game is ~20 % fast in a breeze, as already
noted against ORC. That is acceptable for the "fun" gennaker boat.

### Cross-cutting suggestions
1. **Pointing (all classes):** the polar table puts the VMG optimum 6–12° above `noGoDeg`. Either lower every
   `noGoDeg` by ~3–4° (and trim `up` by ~4 % to keep VMG), or change the table so the optimum sits at ~noGo + 3°.
   Real tacking angles are ~85–90° for dinghies and ~80° for keelboats; the game's 95–105° teaches slightly wrong
   laylines.
2. **Planing jump (Feva, ILCA, 29er, J70):** the real data shows a step once the boat planes (29er downwind 8.8 →
   11.9 kn going from 9–12 to 12–15 kn of wind; ILCA reach 6.8 → 8.3). `boat.planing` already exists, so a ×1.10–1.15
   target-speed bonus while planing (with hysteresis) would give kids a "whoosh" moment they can feel without raising
   the base polar. This is a physics change and needs its own task.
3. **Light air** is fine for every class. Nothing needs to be slower than today below 6 kn for playability.
