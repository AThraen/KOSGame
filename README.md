# KØS SEJL ⛵

**A sailing game for the young sailors of KØS Sejlsport on Svaneknoppen, Copenhagen.**

### ▶ [Play it in your browser: athraen.github.io/KOSGame](https://athraen.github.io/KOSGame/)

Works on phone, tablet and desktop. Install it as an app from the browser menu and it also works offline.

![Title screen](docs/screenshots/1440x900-title.jpg)

In winter there isn't much sailing on Svanemøllebugten. KØS SEJL lets club members aged 8 to 26 (and their parents and
coaches) keep practising at home: racing, right of way, navigation, docking, RIB driving, rigging and knots. The
whole game takes place in our own waters: Svanemøllebugten, the club pier on Svaneknoppen, the channel past
Svanemøllehavnen and the race area out on Øresund.

The game is in **Danish** by default, with **English** under settings.

> **Status: under active development.** All areas can be played, but several modes are still being polished.

## The harbour map

![Harbour map](docs/screenshots/1440x900-hub.jpg)

Everything starts from an illustrated map of the area. Each place is a part of the game:

| Place | What you do there |
|---|---|
| **Sejlerskolen** (sailing school) | Coached lessons with Coach Søs: steering and stopping, points of sail, tacking, gybing, getting out of irons, trimming, hiking in gusts, man overboard |
| **Bugten** (the bay) | Free sailing in any unlocked boat, collect rings, clean up floating rubbish, time trials |
| **Kapsejladsbanen** (race course) | Races with a real 5-4-1-0 start (flags and horns), computer opponents, mark roundings, penalty turns and a championship for each boat class |
| **Vigeregelskolen** (right-of-way school) | "Who must give way?" situations that you then sail out yourself: the racing rules (port/starboard, windward/leeward, overtaking, tacking, mark-room) and the ordinary collision rules for motorboats, ferries and ships |
| **Sejlrenden** (the channel) | Buoyage (red and green channel marks, cardinal marks), following the channel, yellow swim-zone buoys, night sailing by lights, compass courses |
| **Broen** (the pier) | Docking and undocking under sail and with the RIB |
| **RIB-pontonen** (RIB pontoon) | Drive the club's orange RIB: tow a line of Optimists, rescue a capsized dinghy, lay race marks, collect gear that has drifted off |
| **Klubhuset** (clubhouse) | Rig and unrig every boat class, tie knots, capsize recovery, sailing quiz |

## Screenshots

<table>
<tr>
<td><img src="docs/screenshots/1440x900-play-race.opti.1.jpg" alt="Optimist race start"><br><sub>Optimist club championship: computer opponents, start countdown with flags</sub></td>
<td><img src="docs/screenshots/1440x900-play-rowschool.r10.jpg" alt="Right-of-way scenario"><br><sub>Right-of-way school: who must give way?</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/1440x900-play-rib.learn.jpg" alt="RIB driving"><br><sub>Driving the club RIB: throttle lever, wheel, speed limit zone</sub></td>
<td><img src="docs/screenshots/1440x900-play-sail.free.29er.jpg" alt="Free sailing in a 29er"><br><sub>Free sailing in a 29er: gusts on the water, no-go zone, gennaker</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/1440x900-play-rigging.opti.jpg" alt="Rigging an Optimist"><br><sub>Clubhouse: rig an Optimist, part by part</sub></td>
<td><img src="docs/screenshots/1440x900-play-knots.eight.jpg" alt="Knot tying"><br><sub>Clubhouse: tie a figure-eight knot (ottetalsknob)</sub></td>
</tr>
</table>

On a phone:

<p>
<img src="docs/screenshots/390x844-title.jpg" width="200" alt="Title on phone">
<img src="docs/screenshots/390x844-hub.jpg" width="200" alt="Map on phone">
<img src="docs/screenshots/390x844-play-sail.free.opti.jpg" width="200" alt="Sailing on phone">
</p>

## The boats

You earn stars and unlock the club's boats in the same order the club's sailors move up:
**Optimist → Tera → Feva → Zest → ILCA → 29er → H-boat → J70**, plus the club's orange **RIB**.
Each boat handles differently. The Optimist is slow and forgiving. The ILCA needs real hiking. The 29er planes and
capsizes easily. The H-boat is heavy and steady. The J70 planes downwind with its gennaker.

Three help levels make it fun for an 8-year-old as well as a 29er sailor:

- **Let** (easy): automatic sail trim, no capsizing.
- **Normal**
- **Pro**: manual trim, capsizing and penalty turns.

Parents and coaches can unlock everything in the settings.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Steer | ← → or A D | Bagbord / Styrbord buttons |
| Sheet in / out (pull the sail in / let it out) | ↑ ↓ or W S | Sheet slider (or AUTO) |
| Hike out | Hold Space | HIKE button |
| Gennaker / spinnaker | E | SPI button |
| RIB throttle | ↑ ↓ | Throttle lever and wheel |
| Pause | Esc or P | Pause button |

## Running it locally

There is no build step: the repository is the game.

- Double-click `index.html`.
- Or serve it locally (needed for installing as an app and offline play):

```sh
node tools/serve.js        # then open http://localhost:8080
```

## Testing

All browser tests run in a hidden browser (headless Chrome via Playwright: `npm install` once).

```sh
node tools/run-tests.js            # core simulation tests + offline file list check (fast)
node tools/run-tests.js all        # + translation check and a click-through of every screen and activity
node tools/test-core.js            # physics, wind, rules and computer-sailor tests (Node only)
node tools/smoke.js                # every screen and activity, phone/tablet/desktop screenshots
node tools/check-i18n.js           # missing Danish/English text
node tools/gen-precache.js         # refresh the offline file list after changing game files
```

## How it's built

Plain HTML, CSS and JavaScript with no frameworks or build tools. All scripts attach to a single global object, `KOS`.

- **Simulation** (`js/core/`): wind with moving gusts and shifts, sailing physics per boat class, the racing rules
  and collision rules, and computer-controlled sailors. It is pure and deterministic, so it also runs in Node for
  the tests.
- **Graphics**: SVG boats, buoys and characters drawn on a canvas. The painted backgrounds in `assets/bg/` were
  generated locally with ComfyUI.
- **Sound**: synthesised live with the Web Audio API, so there are no audio files.
- **App**: installable and playable offline. A service worker stores every game file on the first visit.

[`SPEC.md`](SPEC.md) is the design contract between the modules. Deploys to GitHub Pages happen automatically on every
push to `main` (see [`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

## Credits

Made by Allan Thraen for KØS Sejlsport, with Claude Code. The nautical charts used as references for the game's map
are only in `docs/reference/` and are not part of the game.
