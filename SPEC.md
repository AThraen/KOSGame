# KØS SEJL — game spec (binding contract)

A sailing game for **KØS Sejlsport**, a youth sailing club on **Svaneknoppen** (Svanemøllehavnen, Copenhagen, Øresund).
Players are 8–26 (plus some adults). They play at home in winter. The game follows the club's boat ladder:
**Optimist → Tera → Feva → Zest → ILCA → 29er → H-boat → J70**, plus the club's **RIB** coach boats.

This file is the contract between modules. Parallel builders rely on the names and shapes below. If you must change
a contract, change it here too and keep backwards compatibility.

Reference material in `docs/reference/`:
- `chart-overview.webp`: nautical chart of the area. The club is on **Svaneknoppen** (red cross), the point between
  **Svanemøllebugten** (shallow bay to the west, 1.6–3.5 m, yellow swim-zone marks "Y" along the beach) and
  **Kalkbrænderiløbet**. To the north is the beach mole ("Badestrandens mole, Fl W 3s"), to the north-east
  **Færgehavn Nord**, **Skudeløbet**, **Stubben** and the open **Øresund** (5–13 m). Cardinal/lateral marks: red = port,
  green = starboard (IALA A, Denmark).
- `chart-svaneknoppen-pier.webp`: close-up of the club's pier: a big bay (1.6 m) closed by rock breakwaters ("Obstn"),
  a curved island breakwater, small jetties at the club near "Svane…".
- `spangame-title.png`, `spangame-ingame.png`: the visual style to follow (from our sister game SPAN).
- Mood photo (described, not on disk): a young sailor hiking out on a white keelboat at sunset, pastel orange/lilac sky,
  grey-blue choppy water, Nordhavn's modern apartment towers on the horizon. That is the mood for backgrounds.
- Club RIB photo (described): the KØS coach boats are **bright orange "Tornado" RIBs** with a black rubbing strake
  along the tube, a rope grab-line, **"KØS" in a black rounded box on the bow**, an orange centre console with a steering
  wheel and a stainless grab rail, a black **Mercury** outboard (draw it as a generic black outboard, no brand). Kids drive
  them and tow other RIBs/dinghies on a line. Harbor backdrop: forest of sailboat masts, wooden pier, rusty steel sheet
  piling, glassy office blocks and an old red-brick power station. Overcast grey sky. Orange = the club's signature colour.

## Hard rules

- **Plain HTML + CSS + JS. No build step, no framework, no runtime deps.** Classic `<script>` files, all attaching to
  one global `KOS`. Must work from `file://` (no ES modules, no fetch of local JSON) and from http (PWA).
- Every file is wrapped: `(function (root) { const KOS = (root.KOS = root.KOS || {}); ... })(typeof window !== 'undefined' ? window : globalThis);`
- **`js/core/*` is pure logic**: no DOM, no `Math.random` (use `KOS.U.rng(seed)`), no wall clock. Loads in Node via
  `tools/harness.js` for tests.
- **Danish is the default language, English the second.** Every user-visible string goes through `KOS.t(key, vars)`.
  Each module registers its own strings in its own file: `KOS.I18n.add('da', {...}); KOS.I18n.add('en', {...});`
  Keys are namespaced by module (`race.start.title`). Danish should be natural, kid-friendly, and use real Danish
  sailing words (bagbord, styrbord, krydse, slå, bom/jibbe, luv, læ, kryds, slør, læns, halvvind, skøde, rorpind, sværd,
  hænge ud, kæntre, mærke, kapsejlads, startlinje, sejlrende...).
- Graphics: **SVG** (hand-authored, inline or generated strings) drawn as DOM or rasterised to canvas. Painterly
  backgrounds generated with ComfyUI live in `assets/bg/`. No external images or fonts from the network.
- Sound: synthesised with Web Audio in `js/ui/audio.js` (no audio files needed).
- Responsive: phone portrait + landscape, tablet, desktop. Touch, mouse and keyboard. Minimum touch target 44 px.
  Respect safe-area insets. No page scroll during play.
- PWA: `manifest.webmanifest`, `sw.js` precaching every game file (generated list via `node tools/gen-precache.js`),
  installable, fully offline after first visit.
- **Never open visible windows** (browsers etc.). All browser checks are headless Playwright (`node tools/shot.js`).
- Every agent: don't touch files owned by another module except where this spec says so. Don't `git commit` unless
  your task says to.

## Look & feel (SPAN style)

- Full-window scene with **glassy dark panels** (`rgba(13,19,33,.7)` + backdrop blur, 1px white-12% border, 16 px
  radius), **orange gradient primary buttons** (`#ffc65c → #ff7a3d`, dark text), rounded bold display font
  (system `ui-rounded`/"Segoe UI Variable Display"), big friendly title with a warm gradient and a hard drop shadow.
- Painterly backgrounds (ComfyUI) behind menus: Øresund at sunset, Nordhavn skyline, the club pier, winter harbor.
- In-game water is top-down, stylised: layered blues by depth (like the chart: shallow = lighter cyan, deep =
  deep blue), animated wave crests, darker **gust patches** moving downwind, white **wakes**, splash particles.
- Boats are top-down SVG with **sails that swing with the boom**, luff (flutter) when eased too far, fill when
  trimmed, sailors that **hike out** in gusts, a spinnaker/gennaker that pops open. Juicy animations: bobbing,
  spray, camera ease, confetti on wins, stars that bounce in.
- Tokens in `css/style.css` `:root` (see SPAN): `--primary #ffb547`, `--primary-2 #ff7a3d`, `--blue #49c6f2`,
  `--good #3ee08f`, `--bad #ff4d5e`, `--star #ffd25e`, plus nautical: `--port #e8323c` (red), `--stbd #18a957` (green),
  `--sea-deep #2b6cb0`, `--sea-shallow #7fc4f0`, `--land #fff4b8` (chart yellow).

## Coordinates & units

- World units are **meters**. `x` grows east, `y` grows **south** (screen down). North is up.
- Headings are **radians**, `0` = north, increasing **clockwise**. `KOS.U.vec(h) = {x: Math.sin(h), y: -Math.cos(h)}`.
- Wind direction is where the wind comes **FROM** (meteorological), radians, same convention. Data/authoring may use
  degrees (`windDeg: 225`); convert with `KOS.U.rad()`.
- Speeds inside physics are m/s; display knots (`KOS.U.kn(ms)`, 1 kn = 0.5144 m/s).
- `twa` (true wind angle) on a boat is signed in radians, range (−π, π]: **positive = wind over the starboard side =
  starboard tack**, negative = port tack.
- Fixed simulation step `KOS.DT = 1/60` s.

## Load order (index.html)

```
js/core/kos.js        KOS.U (math, angles, rng, lerp, clamp, poly helpers), KOS.DT, KOS.Events (tiny bus)
js/core/i18n.js       KOS.I18n, KOS.t
js/core/boats.js      KOS.Boats
js/core/wind.js       KOS.Wind
js/core/physics.js    KOS.Physics
js/core/rules.js      KOS.Rules
js/core/ai.js         KOS.AI
js/core/world.js      KOS.World
js/core/activities.js KOS.Activities, KOS.Modes
js/render/sprites.js  KOS.Sprites
js/render/effects.js  KOS.Effects
js/render/water.js    KOS.Water
js/render/scene.js    KOS.SailScene
js/ui/storage.js      KOS.Storage
js/ui/audio.js        KOS.Audio
js/ui/input.js        KOS.Input
js/ui/sailaids.js     KOS.SailAids (daggerboard + jib controls/tips shared by sail, race, nav)
js/ui/ui.js           KOS.UI (toasts, dialogs, HUD, coach bubbles, results)
js/ui/hub.js          KOS.Hub (the harbor map screen)
js/ui/track.js        KOS.Track (anonymous Matomo stats, see Analytics)
js/ui/app.js          KOS.App (screens, router, loop, settings, profile)
js/modes/sail.js      free sail (reference mode)
js/modes/school.js    sailing school lessons
js/modes/race.js      races
js/modes/rowschool.js right-of-way school
js/modes/nav.js       navigation & buoyage
js/modes/dock.js      docking / undocking (sail and RIB)
js/modes/rib.js       RIB coach-boat missions
js/modes/rigging.js   rig / unrig mini-game
js/modes/knots.js     knot tying mini-game
js/modes/capsize.js   capsize recovery mini-game
js/modes/quiz.js      sailing quiz
js/main.js            boot
```
CSS: `css/style.css` (tokens, shell, buttons, screens), `css/game.css` (HUD, touch controls, results),
`css/hub.css`, and one `css/modes/<mode>.css` per mode (only if needed). `index.html` already links them all.

## Module contracts

### KOS.U (core/kos.js)
`clamp, lerp, wrapPi(a) → (−π,π], angDiff(a,b), rad(deg), deg(rad), vec(h), len(x,y), dist(a,b), rng(seed) → fn()→[0,1)`
(mulberry32), `kn(ms)`, `ms(kn)`, `pointInPoly(x,y,poly)`, `segDistance`, `polyNearest(x,y,poly) → {x,y,d}`,
`smoothstep`, `noise1(seed,t)` (smooth value noise). `KOS.Events.on/off/emit`.
Implemented notes: `angDiff(a, b) = wrapPi(b − a)` = the signed turn from heading a to heading b (+ = turn right).
`noise1`/`noise2` return [−1, 1]. Extras: `heading(dx,dy)` (inverse of vec), `bearing(a,b)`, `segNearest`, `segSeg`,
`segCross`, `side`, `polyBounds/polyArea/polyCentroid`, `approach(dt,tau)`, `hash`, `rng(seed).range/int/pick/sign`, `Events.once`.

### KOS.I18n (core/i18n.js)
`KOS.I18n.add(lang, dict)`, `KOS.I18n.setLang('da'|'en')`, `KOS.I18n.lang`, `KOS.t(key, vars)` with `{name}`
interpolation, falls back to `en` then the key. `KOS.tt(obj)` picks `obj[lang] || obj.en || obj.da` for inline
`{da, en}` objects (used by activity data). `data-i18n="key"` attributes are filled by `KOS.I18n.apply(rootEl)`.

### KOS.Boats (core/boats.js)
`KOS.Boats.list` (ordered ladder) and `KOS.Boats.get(id)`. Ids: `opti tera feva zest ilca 29er hboat j70 rib`.
Each: `{id, name, crew, length, beam, mass, sailArea, maxKn, polar(twaAbsRad, twsKn) → target knots,
 noGo (rad, half-angle), tackTime (s), turnRate, hasSpinnaker ('none'|'asym'|'sym'), spinnakerBoost, canCapsize,
 capsizeHeel, keel (bool), plane (kn at which it planes, or 0), colors: {hull, deck, sail}, desc: {da,en},
 ageHint: {da,en}, motor (rib only): {maxKn, accel}}`.
Implemented extras: `hasBoard` (daggerboard/centreboard dinghies: opti tera feva zest ilca 29er), `hasJib` + `jibShare`
(boats with a jib: feva zest 29er hboat j70; jibShare = the jib's part of the drive, 0.3–0.35).
Make the characters distinct: Opti slow & forgiving, Tera tiny & tippy, Feva 2-person with gennaker, Zest
stable trainer, ILCA physical single-hander (hiking matters a lot), 29er fast skiff that planes and capsizes easily
(sym-asym gennaker, trapeze), H-boat keelboat (can't capsize, heavy, steady), J70 sporty keelboat with gennaker
that planes downwind, RIB motor boat.

### KOS.Wind (core/wind.js)
`KOS.Wind.create({dir, speed /*kn*/, gust /*0..1*/, shift /*0..1*/, seed, bounds})` → wind object:
`wind.update(dt)`, `wind.t`, `wind.at(x, y) → {dir, speed /*kn*/}` (deterministic for a seed), `wind.base → {dir, speed}`,
`wind.gusts → [{x, y, r, k /*speed multiplier*/, vx, vy}]` (moving patches; renderer draws them),
`wind.dir`, `wind.speed`. Shifts oscillate the direction ±(shift·15°) slowly; gusts add up to +60 % locally.
Implemented extras: `wind.setBase(dir, speed)`, `wind.toVec(x, y)`, `wind.recenter(x, y)` (moves the gust area, same size, to
follow the action: keep `bounds` ~600 m around the play area and recenter on the player every ~2 s, see `js/modes/sail.js`).

### KOS.Physics (core/physics.js)
- `KOS.Physics.createBoat(classId, {x, y, heading, sailNo, name, colors, isPlayer, crewNames})` → boat:
  `{id, cls (boat def), x, y, heading, vx, vy, speed /*m/s along heading*/, yawRate, heel /*rad, + = leaning to starboard*/,
  twa, tws, awa, tack ('port'|'starboard'), pos ('irons'|'closehauled'|'closereach'|'beamreach'|'broadreach'|'run'),
  boom /*rad rel. to centerline, signed; + = boom out to starboard*/, sheet, trim /*0..1 quality*/, luffing, stalled,
  inIrons, hike, spinnaker, capsized, capsizeT, planing, wake: [], distanceSailed, tacks, gybes, t}`.
- `KOS.Physics.controls()` → default controls `{rudder: 0 /*-1 left..1 right*/, sheet: 0.5 /*0 = sheeted hard in, 1 = fully eased*/,
  hike: 0 /*0..1*/, spinnaker: false, throttle: 0 /*-1..1 RIB*/, autoTrim: true, autoHike: false}`.
- `KOS.Physics.step(boat, controls, env, dt)` where `env = {wind, venue, assist: 'easy'|'normal'|'pro', t}`.
  Applies apparent wind, polar target speed × trim efficiency × heel penalty × gust, momentum (heavy boats keep way),
  no-go zone (speed bleeds, `inIrons`), rudder turning that needs speed (and works in reverse when going backwards),
  tacks/gybes (counted, emit events `boat:tack`, `boat:gybe`), luffing when over-eased, stall when over-sheeted,
  heel from wind × sheet minus hiking; capsize when heel exceeds `capsizeHeel` (not in `easy` assist, never keelboats);
  `autoTrim` sets the ideal sheet for the current awa. RIB: throttle/rudder motor model with wake, no sails.
  Shallow water / land collisions via `KOS.World` (bounce + stop + `boat:ground` event).
- `KOS.Physics.collide(boats, venue)` → `[{type:'boat'|'shore'|'mark'|'pier', a, b, speed}]` with simple circle/capsule
  separation (boats as capsules of their length/beam).
- `KOS.Physics.idealSheet(boat)`, `KOS.Physics.vmg(boat, targetDir)`, `KOS.Physics.laylines(...)` helpers.
- Events are emitted via `KOS.Events.emit(name, payload)`.
- Implemented extras: control `trimBias` (added to auto-trim, + = ease); `env.autoRecover` (default true: a capsized dinghy
  rights itself after `cls.recoverTime` s, ×1.5 in pro; set false and call `KOS.Physics.right(boat, windDir)` from the capsize
  mini-game). Extra boat fields: `aws, windDir, slip, power, targetKn, spiCollapsed, r13` (tacking, for R13), `maneuverT,
  grounded, depower, wakeSize` (RIB 0..1, biggest at displacement-hump speed), `skid` (RIB), `throttle, rudder`.
  `wake` = `[{x, y, t, s, h, w}]` (stern points, last 5 s). Events: `boat:tack`/`boat:gybe {boat, from, to, power?}`,
  `boat:capsize`, `boat:righted`, `boat:irons`, `boat:plane`, `boat:spiCollapse`, `boat:heelWarn {boat, k}`,
  `boat:ground {boat, type, speed, depth}`, `boat:collide {type, a, b, speed, x, y}`. `collide(boats, venue, marks)` takes
  optional race marks `[{x, y, r?, id?}]`. Helpers: `laylines(mark, windDir, cls, tws, {down, spi, length})` →
  `{twa, headings: {starboard, port}, starboard: {a, b}, port: {a, b}}`, `optimal(cls, tws, 'up'|'down', spi)` → `{twa, speed, vmg}`
  (same as `KOS.Boats.optimal`), `neededHike(boat)`, `pointOfSail(twaAbs, cls)`, `capsize(boat)`, `right(boat, windDir)`,
  `tow(a, b, len, dt)` (rope from a's stern to b's bow), `bow(boat)`, `stern(boat)`. Boat defs also carry `draft, recoverTime,
  trapeze, heelAt10, hikeRight, spiFactor(twaAbs)`. `KOS.Wind.steady(dir, kn)` = constant wind. Easy assist: no capsize, some
  steerage even when stopped, no reversed steering in sternway (normal/pro: realistic).
- **Daggerboard** (`cls.hasBoard`): controls `board` (0..1 wanted position, 1 = fully down, default) or `autoBoard: true`
  (follows `idealBoard`); `boat.board` moves there at 1.4/s (Ned → Op ≈ 0.6 s). Board 1 is exactly the classic model.
  Less board: leeway × up to ~7 (scaled by sail power, so mostly upwind) and a drive loss `0.55·(need − board)²` below the
  board the angle needs (`need` 1 up to 55° TWA, 0.55 at 100°, 0.25 from 145°); less wetted area gives up to +7 % speed
  from a reach to a run; right up (< 0.3) on a run she rolls a little and loses ~1 %. Measured (Opti, 10 kn): close-hauled
  board 1 / 0.5 / 0.15 → VMG 2.0 / 1.6 / 0.6 kn, leeway 4° / 8° / 24°; run 170° → 3.59 / 3.77 / 3.75 kn.
  Helpers `idealBoard(cls, twaAbs)` (1 upwind, ~0.55 beam reach, 0.3 on a run; always 1 without a board) and
  `boardFactor(board, twaAbs)` (speed multiplier).
- **Jib** (`cls.hasJib`): controls `autoJib` (default true = the crew trims it with the main: exactly the classic model) and
  `jib` (0..1 sheet, same scale as the main sheet; used when `autoJib === false`). Boat fields `jib, jibAng` (signed, for
  drawing), `jibManual, jibTrim, jibLuffing` (eased too far: it flaps, up to −27 % speed), `jibStalled` (over-sheeted).
  Trimmed right by hand (within ~0.05 of `idealJib(boat)`): +2.5 % speed and 15 % less leeway upwind (telltales streaming).

### KOS.Rules (core/rules.js)
Racing Rules of Sailing Part 2 (simplified) and the basic collision rules (COLREGs) for navigation.
- `KOS.Rules.rightOfWay(a, b, ctx)` → `{standOn, giveWay, rule, reasonKey}` where rule is one of `'R10'` (port/starboard),
  `'R11'` (windward/leeward, overlapped same tack), `'R12'` (clear astern), `'R13'` (while tacking), `'R18'` (mark-room,
  needs `ctx.marks` and the zone = 3 lengths), `'C-power-sail'` (power gives way to sail), `'C-overtaking'`,
  `'C-headon'` (power vs power: both turn to starboard), `'C-crossing'` (power: give way to the one on your starboard side).
  `reasonKey` is an i18n key with a kid-friendly explanation (rules.js registers these strings).
  Implemented: results also carry `reasonVars {give, stand}` (boat names; "Du"/"You" for `isPlayer`); `C-headon` returns
  `{standOn: null, giveWay: a, both: true}`. `ctx = {wind (object or dir rad), marks, zone (lengths, default 3), mode: 'race'|'colreg'}`.
  Extras: `explain(result)` → localized text, `ruleName(rule)`, `overtaking(a, b)`, `hullGap(a, b)`, `isPower(b)`. The monitor also
  reports mark touches `{type: 'mark', rule: 'R31'}`. Scenario boats may be plain objects `{x, y, heading, length?, tack?, r13?,
  isPower?, speed?, name?}`.
- `KOS.Rules.overlapped(a, b)`, `KOS.Rules.isWindward(a, b, wind)`, `KOS.Rules.clearAstern(a, b)`, `KOS.Rules.tackOf(boat)`.
- `KOS.Rules.monitor()` → object with `update(boats, wind, marks, dt) → [{type:'foul', offender, victim, rule}]` that
  flags contact or "had to take avoiding action" situations (distance < 1 boat length while the give-way boat closes in).

### KOS.AI (core/ai.js)
`KOS.AI.createHelm(boat, {skill /*0..1*/, aggression, seed})` → `helm.think(env, plan, others) → controls`.
`plan` is `{target: {x, y}}` or `{course: [{x, y, round: 'port'|'starboard'}], leg}`; sails to waypoints, tacks
on laylines when upwind, gybes downwind, keeps clear when it is the give-way boat (uses `KOS.Rules`), does start
sequences when `plan.start = {line: [p1, p2], t0}` (holds back, accelerates at the gun). Deterministic per seed.
Implemented: course items may also be `{line: [p1, p2]}` (finish/gate, must be crossed) or `{x, y, r?}` without `round`
(pass within r). `env.t` drives the start clock. Helm state: `helm.leg, helm.finished, helm.finishT, helm.target, helm.avoiding`
(rule id), `helm.ocs` (over early at the gun → dips back; `plan.start.recall = false` disables), `helm.state`
('prestart'|'beat'|'reach'|'run'|'build'|'avoid'|'irons'|'ocs'|'finished'|'motor'|'capsized'). A numeric `plan.leg` jumps the
helm to that leg. RIB helms motor to waypoints and alter course to starboard when giving way.

### KOS.World (core/world.js)
Venues traced (approximately, stylised) from the chart. `KOS.World.venues` keyed by id:
- `bay` — Svanemøllebugten + Svaneknoppen pier and club jetties (training area, ~700 × 900 m).
- `pier` — close-up of the club pier: jetties with berths, breakwaters, curved island breakwater, slipway, RIB pontoon.
- `harbor` — Svanemøllehavnen entrance + Kalkbrænderiløbet channel with lateral marks (navigation).
- `sound` — open Øresund north-east of Nordhavn (Stubben, Skudeløbet), deep water: race area, big course space.
Each venue: `{id, name: {da,en}, bounds: {x0, y0, x1, y1}, land: [poly], piers: [poly], breakwaters: [poly],
 depth: [{poly, d}] (deepest last wins, default depth), buoys: [{id, kind, x, y, light}], labels: [{x, y, text, size}],
 berths: [{id, x, y, heading, len, beam, side}], slip: {x, y, heading}, spawn: {x, y, heading}, landmarks: [{kind, x, y, ...}]}`.
`kind` for buoys: `port stbd cardN cardE cardS cardW special swim isolated safe mark-orange mark-yellow`.
Helpers: `KOS.World.isLand(v, x, y)`, `KOS.World.depthAt(v, x, y)`, `KOS.World.hit(v, x, y, r) → {type, nx, ny, depth}`,
`KOS.World.get(id)`. Polygons are arrays of `[x, y]`.

### KOS.Activities & KOS.Modes (core/activities.js)
- `KOS.Modes.register(id, {kind: 'sea'|'dom', create(host, activity) → instance})`.
- Instance: `{start(), update(dt), render(alpha), destroy(), onResize?(), pause?(), resume?()}`.
  `update` is called at fixed `KOS.DT` steps, `render` once per animation frame.
- `host` = `{canvas, ctx2d, layer /*DOM div over the canvas for HUD/overlays*/, finish(result), quit(),
  setPaused(bool), assist, settings}`. `kind: 'dom'` modes get a `layer` only (canvas hidden).
- `result` = `{stars /*0..3*/, score, timeMs, success: bool, stats: {...}, titleKey?, msgKey?, msgVars?}`.
  The app shows the results screen (retry / next / back to the map), saves progress and awards XP.
- `KOS.Activities.add(defOrArray)`: `{id, mode, area, boat, order, title: {da,en}, desc: {da,en}, icon, params,
  unlock: {stars: n} | {after: id} | null, minutes, difficulty: 1..5}`. `area` ∈ hub areas below.
- `KOS.Activities.list(filter)`, `.get(id)`, `.isUnlocked(id)`, `.next(id)`, `.byArea(area)`.
- Hub areas (`area`): `club` (clubhouse: rigging, knots, quiz, capsize), `school` (sailing school in the bay),
  `bay` (free sail), `race` (race course out in the Sound), `rules` (right-of-way school), `nav` (harbor channel /
  navigation), `pier` (docking), `rib` (RIB pontoon / coach missions).

### KOS.Storage (ui/storage.js)
localStorage behind try/catch, key prefix `kos.`. `get(k, def)`, `set(k, v)`, `settings()` / `saveSettings(s)`
(`{lang, sound, music, volume, assist: 'easy'|'normal'|'pro', controls: 'auto'|'buttons'|'joystick', unlockAll, reducedMotion}`),
`profile()` / `saveProfile(p)` (`{name, avatar: {skin, hair, jacket}, sailNo, boatColor, createdAt}`),
`progress(id)` → `{stars, best, plays, done}`, `record(id, result)` → `{newBest, starsGained}`, `totalStars()`, `xp()`,
`badges()` / `award(badgeId)`.

### KOS.Audio (ui/audio.js)
`KOS.Audio.unlock()` (on first gesture), `play(name, {vol, pitch, pan})`. Names: `click tap whoosh tack gybe flap
luff splash spray crash bump horn hornShort hornLong whistle bell gull countdown go win lose star coin pop
rigClick rope zip knot cheer`. Continuous: `ambient({wind /*kn*/, waves /*0..1*/, harbor /*0..1*/})`,
`engine(throttle /*-1..1*/ | null)`, `music('menu'|'race'|'calm'|null)` (gentle generative loop, off by default
if `settings.music` false). `setVolume(v)`, `mute(bool)`.

### KOS.Input (ui/input.js)
`KOS.Input.attach(layer, {layout: 'sail'|'rib'|'none', spinnaker, hike, autoTrim, extraButtons: [{id, icon, labelKey}]})`
→ `ctrl` with `ctrl.state` = `{steer /*-1..1*/, sheet /*0..1*/, sheetDelta, hike, spinnaker, throttle, action}`,
`ctrl.on(evt, fn)` for `action`, `pause`, button ids; `ctrl.detach()`.
Keyboard: ←/→ or A/D steer, ↑/↓ or W/S sheet in/out (throttle for RIB), Space hike (hold), E spinnaker toggle,
Enter/F action, P/Esc pause. Touch: big left/right tiller pads (bottom-left / bottom-right in portrait, sides in
landscape), a vertical sheet slider, a HIKE hold button, SPI button; optional virtual joystick. Mouse works on all.
`KOS.Input.toControls(state, boat, prevControls)` → physics controls (steer → rudder smoothing).
Implemented extras: `opts.board` adds a compact **Sværd** button to the extras (cycles Ned → Halvt → Op = `state.board`
1 / 0.5 / 0.15, key **B**, event `board`, `ctrl.showBoard(actual)` paints the icon at the boat's real board position);
`opts.jib` adds a narrow **Fok** slider left of the sheet slider with its own AUTO (`state.jib`, `state.autoJib`, keys **Q / Z**
or **Shift+↑/↓**, events `jib`, `autojib`, `ctrl.setJib`, `setIdealJib`, `setAutoJib`). With the board button the portrait
extras form a row along the top edge. `toControls` copies `board`, `jib`, `autoJib`.
**KOS.SailAids** (ui/sailaids.js) wires both into a sea mode: `inputOpts(cls, assist)` → `{board, jib, autoJib}` for attach
(shown on Normal/Pro only; the jib starts on AUTO on Normal, by hand on Pro), `create({ctrl, boat, assist, coach})` →
`apply(controls)` (Easy: `autoBoard` + auto jib) and `tick(dt, sailing)` (syncs the button/slider; once per session the
Træner says "Prøv at hive sværdet halvt op på læns …" after 4 s on a run (TWA > 140°) with the board down, "Sværdet ned,
når du krydser …" after 3 s close-hauled with it up, and "Fokken blafrer – hal den lidt ind!" after 2.5 s of a flapping
jib), `keys()` (keyboard hint for the intro). Used by sail.js, race.js and nav.js; the Sailing School keeps the board down
and the jib automatic. AI helms (`KOS.AI`) set `board` to `idealBoard` ± a skill-based error and, on Normal/Pro, trim the
jib by hand near `idealJib` (Easy: auto), so races stay fair.

### KOS.UI (ui/ui.js)
`toast(text, {kind, ms})`, `dialog({titleKey|title, body (html), buttons: [{labelKey, kind, onClick}]})`,
`coach(text, {avatar, ms, pos})` (speech bubble from cartoons of the real KØS coaches Jesper (default), Ida (Sailing School, Opti and Tera activities), Storm (racing), Nicolas (H-boat, rules school), Marius (RIB, youth dinghies), Maria (J70 sailing and racing, navigation) and Anton (J70 docking and rigging)),
`hud(layer, items)` → `{update(data), el}` with items `wind speed pos timer place lap score heel tack penalty`,
`countdown(layer, seconds, onDone)`, `stars(n)` (svg html), `confetti()`, `iconSvg(name)`, `results(result, activity)`.
Implemented: `coachClose()` closes the current coach bubble (the app calls it on pause and finish). During play a coach bubble
ignores touches (it closes by itself) unless it was opened with `ms: 0` / `tapToClose`; on sea modes it sits under the touch
controls and, on portrait phones, left of the sheet slider and above HIKE. Modes don't need their own coach workarounds.

### KOS.SailScene (render/scene.js)
`new KOS.SailScene(canvas, {venue, wind, boats, marks, follow, zoom, showWindArrow, showLaylines, showNoGo})`:
`render(alpha)`, `camera {x, y, zoom, rot}`, `follow(boat)`, `worldToScreen`, `screenToWorld`, `shake(k)`,
`addOverlay(fn(ctx, scene))` / `removeOverlay(fn)` for mode-specific drawing (course lines, ghost paths, arrows,
highlight rings), `marks` = `[{x, y, kind: 'orange'|'yellow'|'pin'|'committee'|'gate'|'finish', label, round}]`,
`lines` = `[{a, b, kind: 'start'|'finish'|'layline'|'path'}]`, `resize()`, `effects` (KOS.Effects instance).
Draws: water (KOS.Water) with depth shading, gusts, waves; land (chart yellow with stylised buildings/trees/beach);
piers and breakwaters (rocks); buoys (proper IALA shapes, top marks, light flashes); boats (KOS.Sprites) with wakes,
spray, heel, sails and crew; wind arrow; no-go wedge and laylines when enabled.

### KOS.Sprites (render/sprites.js)
SVG generators returning SVG strings and cached canvases: `boat(clsId, {colors, sailNo})` (hull top view),
`sail(clsId, kind 'main'|'jib'|'spi')` drawn procedurally with `drawBoat(ctx, boat, opts)` (hull, crew posture by
hike, boom & sail angle, luff flutter, spinnaker), `buoy(kind)`, `mark(kind)`, `icon(name)`, `avatar(profile)`,
`boatCard(clsId)` (side-view SVG used in menus, garage and rigging), `rib()`.

### KOS.App (ui/app.js)
Screens (DOM sections in index.html): `title`, `hub`, `area` (activity list for an area), `play`, `results`,
`settings`, `profile`, `garage` (boat ladder / "Sejlerpas"), `credits`.
`KOS.App.show(screen, params)`, `KOS.App.play(activityId)`, `KOS.App.back()`. Main loop with fixed step and
pause on `visibilitychange`. Handles the PWA install prompt and update toast.
Implemented: `KOS.App.suggest()` → the activity a player should do next (curated beginner path `KOS.App.PATH`, then the easiest
unfinished unlocked activity) — used by the hub's "Næste udfordring" card. `KOS.App.rankOf(xp)` → `{level, key, frac, toNext}`
(shared by the hub top bar and the Sejlerpas). `KOS.App.BADGES` / `addBadges(defs)`: badge definitions; milestones are checked
after every finished activity, and badges a mode awards with `KOS.Storage.award(id)` during play are shown on the results
screen (medal strip + sound). First run: profile → hub → Jesper welcome dialog → `school.steer`.
`KOS.Perf.level` (2 full, 1 lighter, 0 slow device) is set by the app's frame-time governor; the scene lowers its DPR cap and
the effects thin out cosmetic particles at lower levels.

## Progression

- Stars 0–3 per activity. XP = stars × 100 + bonuses. Badges ("mærker") for milestones (first race win, 10 tacks,
  first capsize recovery, all knots, perfect docking, rules master, navigator...).
- **Sejlerpas** (sailing passport): boats unlock by total stars: opti 0, tera 6, feva 15, zest 25, ilca 40,
  29er 55, hboat 70, j70 90, rib 20. `settings.unlockAll` (coach/parent switch) unlocks everything.
- Within an area, activities unlock by `unlock` rules; the first activity of each area is always open.
- Assist levels: **Let** (easy: auto-trim, no capsize, ghost hints, generous scoring; daggerboard and jib automatic),
  **Normal** (+ Sværd button and Fok slider, jib on AUTO), **Pro** (manual trim incl. the jib, capsize, penalty turns,
  stricter stars). Default `easy` for new profiles; the profile asks age range.

## Content plan (each mode registers its own activities)

- `school` — Sejlerskole: steering & stopping, points of sail (halvvind, kryds, slør, læns), tacking, gybing,
  getting out of irons, hiking in gusts, man-overboard pick-up, "sail the figure-8", per boat lessons.
- `bay` — Free sail in Svanemøllebugten with collectibles (rings, gulls, floating bottles of trash to clean up),
  any unlocked boat, time trials around the bay.
- `race` — Kapsejlads: proper start sequence (5-4-1-0 with flags & horns: P flag, class flag), windward-leeward and
  triangle courses, AI fleets of the same class, gusts and shifts, mark rounding, penalty turns (720 / 360), protests
  shown as replays, championship series per boat class ("Klubmesterskab", "DM", "Optimist Holland Cup"-style fun names).
- `rules` — Vigeregler: interactive scenarios ("who must give way?" then sail it out), port/starboard, windward/leeward,
  overtaking, tacking, mark-room, power vs sail, ferries and big ships (stay out of the channel).
- `nav` — Navigation: IALA A lateral and cardinal marks, follow the channel out of Svanemøllehavnen, light characters
  at night ("Fl W 3s"), swim zones (yellow marks — stay out!), chart reading, compass course legs, depth (don't ground).
- `pier` — Docking / undocking at the club pier under sail and with the RIB, in different wind directions: approach on
  a close reach, luff up to stop, line handling timing, points for gentle touch and position.
- `rib` — RIB missions: tow a line of Optimists home, rescue a capsized dinghy, lay out race marks at GPS spots,
  follow the fleet as coach, "keep the wake low near the jetties" speed limits.
- `club` — Clubhouse mini-games: **rigging/unrigging** each class the KØS way (see "Club facts ... rigging" below):
  drag each part onto its glowing spot (or tap + "Sæt på", or hold a card and drag in any direction, or the keyboard); a
  ghost-finger demo shows the drag at the start (static hint with reduced motion). A kid sailor stands next to the boat
  (dinghies: holding the trolley handle; keelboats: on the pontoon). Dinghies: land jobs → **life jacket gate** → the
  launch (the kid backs the boat down the slipway stern first and hops in) → in-water jobs with the boat afloat at the foot
  of the slipway → the boat turns and sails off. Keelboats: pontoon jobs → life jacket gate → step aboard, leave. At the
  gate the tray shows one "Redningsvest" card with its target on the kid (Træner: "Båden er klar! Men først:
  redningsvesten på – det er regel nummer ét."); the player drags it on (or tap + "Tag den på" / Enter) and only then the
  film runs. It is not a job (not in "Opgaver x/y", never a mistake); the finger demo shows it if the player has not
  dragged anything yet. Where the boom is its own job (Tera, Zest, ILCA, Feva) the sail's foot hangs loose until it is on.
  Unrigging is the exact reverse (in-water jobs, the boat pulled up the slipway, land jobs, rinse, roll the sail; the life
  jacket comes off at the very end). **knots** (trace the rope: pælestik/bowline,
  ottetalsknob/figure-8, råbåndsknob/reef knot, dobbelt halvstik/clove hitch, klampe/cleat), **capsize recovery**
  (timing mini-game on the centreboard), **quiz** (rules, parts of the boat, weather, safety, knots).

## Analytics (Matomo)

`js/ui/track.js` (`KOS.Track`) loads Matomo (matomo.bering.codeart.dk, site 13) on the first real event: cookieless, honours Do-Not-Track, never sends
names or other personal data. It is a no-op on localhost/127.x, `file:`, headless/automated browsers (`navigator.webdriver`, HeadlessChrome) and in God
mode, so tests never touch the network. `sw.js` ignores cross-origin requests, so matomo.js/php are never cached. Everything is try/catch: blocked
or offline changes nothing. Screen changes are virtual page views on real-looking paths (Matomo drops `#...`): `/kort`, `/profil`, `/sejlerpas`,
`/indstillinger`, `/om-spillet`, `/start`, one per area (`/sejlerskolen`, `/klubhuset`, `/fri-sejlads`, `/kapsejlads`, `/vigeregler`, `/navigation`,
`/havnemanoevrer`, `/rib-missioner`), activities as `/<area>/<activity id>` and `/<area>/<activity id>/resultat`; titles are fixed Danish
(`KØS SEJL / Sejlerskolen / Styr og stop`), with `setReferrerUrl` to the previous screen. No cookies: `disableCookies` is set before any hit. Events (category / action / name [value]):
Activity start|finish|time (s), Boat sailed|chosen, Settings lang|sound|music|assist|controls|reducedMotion|unlockAll, View overview|zoom,
Install offered|accepted|dismissed, Onboarding profile-created|start-first-lesson, Controls board|jib <activity id> (first use per
activity, from the `controls:use` bus event that KOS.SailAids emits). Game code hooks the `KOS.Events` bus (`screen`, `play:start`,
`play:finish`, `settings`) plus a few direct `KOS.Track.event` calls in app.js.
Matomo User ID = a random per-device player id (`P-` + 6 chars, localStorage `kos.pid`, never derived from the name). Custom dimensions
(ids in `DIM` in track.js, must match the ones created in Matomo): visit scope 1 age band, 2 boat; action scope 3 activities completed,
4 total stars, 5 player level. They are set before every page view and event.

## Testing

- `node tools/test-core.js` — Node tests for core (physics sanity per class: speeds by point of sail, irons, tacking,
  capsize rules, determinism; rules scenarios; world helpers; AI finishes a course).
- `node tools/smoke.js` — headless Chrome: boot, visit every screen, start every activity for a few seconds with
  simulated input, fail on any console error / uncaught exception; screenshots at phone/tablet/desktop sizes into
  `docs/screenshots/` (gitignored `shot*.png` are scratch).
- `node tools/gen-precache.js --check` must pass before finishing.
- Mode builders: read `docs/MODE-AUTHORING.md` (skeleton, wiring, testing). Helpers: `node tools/playshot.js <id> [WxH]
  [ms] [keys]` (one headless screenshot), `node tools/autoplay.js <id> [boat] [assist]` (fast-forward a level to its result
  using the mode's optional `setAutopilot`/`skipIntro` test hooks), `node tools/smoke.js --only=<mode>`.

## Wishlist (from the club, 2026-10-06 — not built yet)

- **Docking: box berths ("bås").** Box-berth docking between mooring poles, bow or stern to the pier. Takes the wind
  into account: catch the windward pole, line on, then go forward. Plus leaving a box berth.
- **RIB drive-on docks.** The club's RIBs park on drive-on floating docks: line up straight, keep enough throttle to
  slide up onto the dock, cut the engine at the right moment. Too slow = slides back; too fast/crooked = bump/scrape.
- **Man-overboard (MOB) drills** for the RIB, J70 and H-boat (the dinghy MOB lesson already exists in `school`):
  shout + point + throw the lifebuoy (timing), keep eyes on the person, return manoeuvre (RIB: wide turn, approach
  upwind/into the current, engine in neutral near the person; keelboats: quick-stop / figure-8, approach on a close
  reach and stop to windward of the person), pick-up alongside. Score by time, distance kept, and safe approach.
- **Physics tuning (club feedback 2026-10-06):**
  - *H-boat shoots head to wind.* In reality it carries way for several boat lengths when luffing up. Free sail already
    does this; the docking mode's extra "luff brake" on Let/Normal (dock.js ~line 681) stops it far too fast. Keep that
    brake for dinghies, make it very light for keelboats, and adjust the docking tips. Confirm with the user which
    activity they saw it in.
  - *J70 is a speed monster.* It should plane easily with the gennaker and reach 15–20 kn downwind. Measured now
    (best angle, kite up): 10.5 kn @12 kn TWS, 12.7 @16, 14.9 @20, 17.4 @25. Target roughly 11–12 (planing) @12,
    15–16 @16, 17–18 @20, 19–20 @25 (maxKn 19–20).
- **Sail controls (agreed with the user 2026-10-06):** the jib stays automatic, following the main sheet. Gennaker/spinnaker
  hoist and drop stay manual (SPI button / E). On the Let level, add a coach prompt for when to hoist and drop
  ("Sæt gennakeren!" / "Tag den ned!"), plus a warning when it is about to collapse. A separate gennaker sheet for Pro
  only if the older racers ask for it.
- **J70 tuning (agreed):** keep the current top speeds (already above ORC; see docs/reference/polars.md), make it plane
  more easily in 12–16 kn, add surfing bursts in gusts, and add strong-wind J70 races. H-boat: raise the strong-wind
  downwind cap to the ORC 8–10 kn and trim its upwind speed to about 5.0 kn in 10 kn.
- **Capsizing on advanced levels (user 2026-10-06):** today dinghies capsize only on Normal/Pro assist and auto-right
  after `recoverTime` (3–6 s, x1.5 Pro); new players start on Let and never capsize. Plan: activity flag
  `params.capsize: true` on strong-wind lessons/races (ILCA, 29er, Feva, later championship races) enables capsizing
  even on Let, shown as a "Kæntringsrisiko!" badge on the card; beginner levels stay capsize-free. When capsized at
  sea, run a short inline version of the clubhouse capsize mini-game (free the sheet → climb on the daggerboard with a
  timing meter → bail) instead of the timer: good timing = back sailing sooner; 29er can turtle in very strong wind.
  Add Tera and Zest to the capsize mini-game, and a sailing-school lesson "stay upright in gusts / get back up".
- **Heavy weather + reefing (user 2026-10-06):** today the windiest activities are ~13 kn (most 7–10) and no boat can
  reduce sail. Plan: a late-unlocked "Hårdt vejr" chapter at 16–25 kn with strong gusts, bigger waves/spray, a
  "Kuling-varsel" card, capsizing on even at Let. Teach depowering (hike, ease in gusts, feather), safe gybes / the
  "chicken gybe" (tack round instead), and when to reef or head home. Sail area: **Reb** button for H-boat (slab reef in
  the main, optional smaller jib; must luff up and slow down, takes seconds with crew animation) and Zest (KØS Zests
  reef by rotating the mast twice so the sail rolls around it: a two-step "Rul masten" action, about 25 % less sail); ILCA chooses rig on land (ILCA 4/6/7 = smaller sail for lighter sailors / strong wind);
  J70: gennaker stays down; Optimist: no reef → go home early or call the coach RIB. Physics: less sail = less power
  and heel, slower in light wind, so reefing too early or too late both cost.
- **Hiking everywhere + crew commands (user 2026-10-06):** the HIKE button is hidden on Let (free sail/race/nav), for
  keelboats always, in dock and rowschool, and in most school lessons. Plan: show it for every dinghy and keelboat in
  all sea modes; on Let auto-hike stays but pressing adds a bonus; keelboats "Ud på kanten!" (rail weight, small heel
  reduction), 29er "Trapez ud!". Advanced levels add crew commands, unlocked along the boat ladder with a coach
  intro the first time: "Klar til at vende?" → "Ro fra!" (2-person boats: good timing = smoother tack), "Klar til at
  bomme?" → "Bom!" (+ chicken gybe in strong wind), "Sæt gennaker!" / "Tag den ned!", "Træk kickeren!" / "Cunningham!"
  (depower: ILCA, 29er, J70), "Reb!" (H-boat, Zest if confirmed), "Mand over bord!" (keelboats, RIB). Beginners only see
  steer, sheet and hike.
- **J70 crew & trimming (user 2026-10-06: "J70 has multiple trimming options and commands"):** player = helm,
  commanding a crew of three; commands as quick buttons, crew sprites act them out, timing rewarded.
  Main: mainsheet + traveller (power/pointing), kicker + cunningham (depower). Jib: sheet + lead in/out (pointing).
  Gennaker/bow: "Bovspryd ud!", "Hejs!", sheet trim (ease until the luff curls), "Skift!" in gybes, "Tag ned!".
  Crew weight: rail upwind, forward in light air, aft when planing. Let = crew auto-trims, player gives big calls;
  Pro = player trims one sail or rotates positions. Lighter version for H-boat (main, jib, spinnaker, rail);
  two-person version for Feva/29er. ASK the club which J70 commands/controls and Danish words they use before building.
- **Club facts (user 2026-10-07):** KØS J70s are kept rigged (rudder + halyards on) and lie **inside Svanemøllehavnen,
  south of the clubhouse**, not at the club pier: J70 docking/undocking and race departures should start there
  (world venue 'harbor'). H-boats: red topsides with "KØS Sejlsport", white deck, rudder/tiller/halyards kept on.
- **Club facts (user 2026-10-08, rigging - the club's answers, authoritative):**
  - The life jacket is not a rigging job, but the player puts it on the sailor at the gate just before launching /
    boarding (the film is locked until it is on); it comes off automatically at the very end of unrigging.
  - Tera / Zest: the boom is not stored with the mast and sail - it is fitted after the mast is stepped (gooseneck +
    clew/outhaul); unrigging takes it off before the sail is rolled round the mast.
  - Dinghies: rudder and daggerboard are put IN the boat on land ("Læg ror og sværd i båden") and only fitted / lowered
    afloat; the boat is pushed in stern first. Unrigging = reverse, except RS Tera and RS Zest: the sail is rolled round
    the mast and the whole mast with sail goes to the shed (their last job).
  - Optimist: land: mast with sail and boom (one part) → sprit + sprit halyard → mast lock → kicker ("bomnedhal"), rudder +
    board in the boat. Water: clip the mainsheet to the boom, lower the board, fit the rudder. Mainsheet rope, painter
    and bailer live in the boat (not jobs). No paddle at all in the game's Opti (user 2026-10-08); the Opti decoy part
    is a gennaker.
  - RS Tera: mast and sail are one component (stepped together) → boom → outhaul, kicker, painter, rudder + board in the
    boat. Water: mainsheet, board, rudder.
  - RS Feva: mast, shrouds and bowsprit stay up all season; NO forestay, NO gennaker sock. Land: hoist the main (locked at
    the top) and the jib (tack tied down), cunningham, boom, kicker, mainsheet, jib sheets, gennaker (tied to the bowsprit,
    halyard, downhaul, sheets). Water: board, rudder.
  - RS Zest: has a jib, tied to the mast before the mast (one component with the sail) is raised; no shrouds/forestay
    jobs. Land: jib on mast → raise the mast → boom → kicker, outhaul. Water: mainsheet, rudder, kick-up board.
  - ILCA: join the two mast sections → pull the sail's sleeve over the mast → step mast with sail (order fixed) → boom →
    outhaul, kicker, cunningham → mainsheet. Water: board, rudder.
  - 29er: wings, mast, shrouds, forestay, trapeze, boom and bowsprit are part of the boat. Land: hoist the main → jib →
    sheets → gennaker. Water: daggerboard and rudder.
  - H-boat: the full rig stays on all season; pontoon jobs: cover off, jib sheets + main, jib, cast off, fenders in
    (confirmed, no outboard / boat hook / bilge job).
  - J/70: rudder, tiller, halyards and bowsprit stay on; the jib lives furled on the forestay inside a sock. Jobs: cover
    off, sock off the jib ("Tag strømpen af fokken"), jib sheets, hoist the main, unfurl the jib ("Rul fokken ud"),
    gennaker ready, cast off, fenders in; unrigging furls the jib and puts the sock back on. Confirmed (club 2026-10-08): the main is hoisted at the pontoon,
    and there is a gennaker besides the furled headsail.
  - RS Tera / RS Zest: the mast with its sail rolled round it lives in the club's shed (skuret) between sessions.
- **Club boat photos (user 2026-10-07, described, not on disk).** What the real KØS boats look like:
  - **29er:** white hull, clear/white mylar main + jib with **red-orange leech tape and batten pockets**, red "29er"
    logo at the head, sail number **DEN 63**; **purple asymmetric spinnaker** (game today: pink/navy/white). Crew of two
    in dark wetsuits, trapezing. Backdrop: grey overcast Øresund, red-brick power station with three tall thin white
    chimneys on the shore.
  - **RS Feva:** white hull with a **red-white-blue band at the transom** (boat name "STORM" on the side); grey mylar
    main and white jib with **lime-yellow panels**, pink "RS Feva" logo; **yellow gennaker** (game today: red/yellow/white).
    Two kids, blue life jackets.
  - **ILCA:** white hulls and sails, **red "ILCA" logo**, red sail numbers (e.g. 221362, 219042 DEN), **blue patch at
    the clew/tack**. Launched from a grey wooden floating pontoon; rock breakwater and white apartment blocks behind.
    Sailors in blue wetsuits, one green helmet.
  - **Optimist:** white hull, white sail with **blue** Optimist logo and blue sail number (DEN 8445); sailor in a
    blue life jacket. Nordhavn towers on the horizon, deep-blue choppy water, big cumulus.
  - **J70:** white hull with **bow number "48"** and name **"Julia"** at the stern quarter; main with a **red head
    panel with a big white X** and the J/70 logo; white jib with grey stripes; 4–5 kids in life jackets in the cockpit.
    Backdrop: white Nordhavn apartment blocks and a red tower crane.
  - **H-boat (photo 2):** red topsides with white "KØS Sejlsport", white deck and cabin top, cream sails, red "H"
    logo and navy **DEN 123** on the main, Danish flag on the stern; 3 kids in life jackets.
  - **RIBs (photo 2):** orange tubes with a **dark grey non-slip top** and black rubbing strake, black "KØS" box on the
    bow, orange console with a black front panel, wheel, stainless rail, black outboard; they carry **yellow
    inflatable sausage marks**. Moored at a grey concrete floating pontoon in front of a rock breakwater
    (Nordhavn towers behind). Visiting coach RIBs are grey with a race number board ("COACH RIB 20").
