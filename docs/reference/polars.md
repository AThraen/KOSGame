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
No published polars found: ORC does not rate dinghies, and class associations don't publish speed tables. Options for
calibration: RYA Portsmouth Yardstick numbers (relative race speed between classes), GPS logs from club sailors
(e.g. Velocitek/phone tracks from KØS training), or coach knowledge.

## Game vs reference (measured 2026-10-06, `KOS.Physics`, steady wind)
- J70 best downwind with gennaker: game 10.5 @12, 12.7 @16, 14.9 @20, 17.4 @25 TWS.
  ORC 135°: 7.2 @12, 9.2 @16, 12.6 @20. The game is already faster than the ORC VPP; real J70s surf to 15–20 kn
  in 20+ kn with waves.
- H-boat: maxKn 6.8 caps it, but ORC has 8–10 kn at 135° in 20–24 kn with spinnaker → raise the cap for strong wind.
  Upwind boatspeed ~5.4 kn in 10 kn vs ORC ≈ 5.0 kn (3.81 VMG at 40°) → slightly fast.
