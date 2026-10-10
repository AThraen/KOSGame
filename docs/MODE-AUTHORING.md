# Building a mode for KØS SEJL

A short, practical guide for mode builders. `SPEC.md` is the contract; this file shows how to use it.
**`js/modes/sail.js` is the reference implementation: copy its shape.** Read it once top to bottom before you start.
It is about 800 lines and covers every piece below.

## 0. What you own

| File | What goes in it |
|---|---|
| `js/modes/<mode>.js` | strings, activities and the mode (one file, already linked in `index.html`) |
| `css/modes/<mode>.css` | styles for your DOM overlays, all prefixed `.<mode>-` (already linked) |

Don't edit anyone else's files. If you find a real bug in a shared module, make the smallest possible edit and
report it. Don't add `<script>` tags, don't load files with fetch (the game must run from `file://`), and don't use
ES modules or libraries.

## 1. File skeleton (sea mode)

```js
// KØS SEJL — js/modes/race.js
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);

  // ---- 1. strings: Danish first, then English, under your own namespace
  KOS.I18n.add('da', { race: { intro: 'Klar til start! Kom over linjen lige når hornet lyder.', fx: { mark: 'Mærke rundet!' } } });
  KOS.I18n.add('en', { race: { intro: 'Ready to start! Cross the line just as the horn goes.', fx: { mark: 'Mark rounded!' } } });

  // ---- 2. activities (what the area screen lists)
  KOS.Activities.add([
    { id: 'race.club1', mode: 'race', area: 'race', order: 10, boat: 'opti', icon: 'trophy', minutes: 5, difficulty: 2,
      unlock: null,                                   // first in the area is always open
      title: { da: 'Klubmesterskab · Optimist', en: 'Club championship · Optimist' },
      desc: { da: 'Tre både, en kryds-læns-bane.', en: 'Three boats, a windward-leeward course.' },
      params: { windDeg: 225, windKn: 9, gust: 0.4, shift: 0.3, seed: 7, fleet: 5 } },
  ]);

  // ---- 3. the mode
  KOS.Modes.register('race', { kind: 'sea', create(host, activity) { return createRace(host, activity); } });

  function createRace(host, activity) {
    const P = Object.assign({ windDeg: 225, windKn: 9, gust: 0.4, shift: 0.3, seed: 1 }, activity.params);
    const venue = KOS.World.get('sound');
    const spawn = venue.spawn;
    const wind = KOS.Wind.create({ dir: U.rad(P.windDeg), speed: P.windKn, gust: P.gust, shift: P.shift, seed: P.seed,
      bounds: { x0: spawn.x - 300, y0: spawn.y - 300, x1: spawn.x + 300, y1: spawn.y + 300 } });
    const env = { wind, venue, assist: host.assist, t: 0 };
    const boat = KOS.Physics.createBoat(host.boat, { x: spawn.x, y: spawn.y, heading: spawn.heading, isPlayer: true,
      sailNo: 'DEN ' + ((host.profile && host.profile.sailNo) || 1), name: (host.profile && host.profile.name) || '' });
    let controls = KOS.Physics.controls();
    controls.autoTrim = host.assist !== 'pro';

    const scene = new KOS.SailScene(host.canvas, { venue, wind, boats: [boat], follow: boat, marks: [], lines: [] });
    const ctrl = KOS.Input.attach(host.layer, { layout: 'sail', spinnaker: boat.cls.hasSpinnaker !== 'none',
      hike: !boat.cls.keel && host.assist !== 'easy', autoTrim: controls.autoTrim, pauseButton: false });
    const hud = KOS.UI.hud(host.layer, ['wind', 'speed', 'timer']);
    const S = { phase: 'intro', time: 0, hudT: 0 };
    const onTack = e => { if (e.boat === boat) KOS.Audio.play('tack'); };
    KOS.Events.on('boat:tack', onTack);
    let cd = null;

    return {
      start() {
        KOS.UI.coach(t('race.intro'), { ms: 6000 });
        cd = KOS.UI.countdown(host.layer, 3, () => { cd = null; S.phase = 'go'; KOS.Audio.play('horn'); });
      },
      update(dt) {                                    // fixed KOS.DT steps; simulation time only
        env.t += dt; wind.update(dt);
        controls = KOS.Input.toControls(ctrl.state, boat, controls, dt);
        KOS.Physics.step(boat, controls, env, dt);
        KOS.Physics.collide([boat], venue);
        if (controls.autoTrim) ctrl.setSheet(boat.sheet);
        if (S.phase === 'go') S.time += dt;
        if ((S.hudT -= dt) <= 0) { S.hudT = 0.1;     // HUD at 10 Hz, not 60
          hud.update({ wind: { dir: boat.windDir, speed: boat.tws }, speed: U.kn(Math.abs(boat.speed)), timer: S.time * 1000 }); }
        if (S.phase === 'go' && S.time > 60) { S.phase = 'done';
          host.finish({ stars: 2, score: 1000, timeMs: S.time * 1000, success: true, stats: { tacks: boat.tacks } }); }
      },
      render(alpha) { scene.render(alpha); },          // once per animation frame
      destroy() {                                     // remove EVERYTHING you added
        KOS.Events.off('boat:tack', onTack);
        if (cd) cd.cancel();
        ctrl.detach(); hud.destroy(); scene.destroy();
        KOS.Audio.ambient(null); KOS.Audio.engine(null);
      },
      pause() { KOS.Audio.ambient(null); },            // the app stops calling update while paused
      resume() {},
      onResize() { scene.resize(); },
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

**`kind: 'dom'` modes** (rigging, knots, quiz, capsize) get `host.layer` only; `host.canvas` is `null`. Build your
UI as DOM/SVG inside `host.layer`. `update(dt)` and `render()` are still called, so use them for timers and animations.

## 2. The host (what the app gives you)

`host = {canvas, ctx2d, layer, activity, params, assist, settings, profile, boat, finish(result), quit(), setPaused(b), isPaused()}`

- `host.boat` is the activity's `boat` or, if that is null, the player's chosen boat from the Sejlerpas.
- `host.assist` is `'easy' | 'normal' | 'pro'`. Make easy really easy: auto-trim, no capsize, generous stars and hints.
- **Pause belongs to the app.** It owns the pause button (top-left), Esc/P and tab hiding. Don't handle those keys,
  and pass `pauseButton: false` to `KOS.Input.attach`. Call `host.setPaused(true)` if your mode needs to pause.
- If `create()` or `update()` throws, the app shows a friendly "something went wrong" dialog. The smoke test fails on it.
- Deep link for quick testing: `index.html#play=<activityId>` (also `#screen=hub`, `#area=bay`).

## 3. Activities

```js
{ id: '<mode>.<name>', mode, area, order, boat, icon, minutes, difficulty /*1..5*/, unlock, title: {da,en}, desc: {da,en}, params }
```
- `area` is one of `club school bay race rules nav pier rib`. Within an area the list is sorted by `order`.
- `unlock`: `null` (open), `{after: 'race.club1'}` (finish that one first) or `{stars: 12}` (total stars).
  The first activity in each area is always open. The settings switch "Lås alt op" (`unlockAll`) opens everything.
- Boat-specific activities lock by the Sejlerpas ladder: `unlock: {stars: KOS.App.BOAT_STARS[boatId]}`
  (opti 0, tera 6, feva 15, zest 25, ilca 40, 29er 55, hboat 70, j70 90, rib 20). sail.js does this for its
  "Fri sejlads" list.
- `icon` is any `KOS.UI.iconSvg` name: `sail boat rib trophy flag buoy compass anchor knot school rules quiz
  life whistle timer star trash wind map clock gauge medal ...` (see `ICONS` in `js/ui/ui.js`).
- Titles and descriptions are inline `{da, en}` (the app uses `KOS.tt`). Everything else goes through `KOS.t`.

## 4. Scene (sea modes)

```js
const scene = new KOS.SailScene(host.canvas, {tilt: host.tilt, tiltAuto: host.tiltAuto, venue, wind, boats, follow: boat, marks, lines,
  showWindArrow: true, showNoGo: false, showLaylines: false, laylineTarget: mark, night: 0, showLanes: false});
```
- **Camera:** `follow(boat)` gives a smooth follow with look-ahead and auto zoom. Use `scene.setZoom(mul)` to tune it.
  sail.js `applyZoom()` sets about `(34 + 5 × boat length)` m across the screen, which is a good gameplay distance.
  `scene.fit({x0,y0,x1,y1})` frames a whole course (call `follow(boat)` again afterwards), and `scene.fixedZoom = z`
  forces a zoom (sail.js starts zoomed out, then sets `null` to ease in). Use `scene.shake(0.3)` for impacts.
- **Marks:** `scene.marks = [{x, y, kind: 'orange'|'yellow'|'pin'|'committee'|'gate'|'finish', label, round: 'port'|'starboard', heading}]`.
  Rounding arrows are drawn from `round`. Pass the same array (plus `r`) to `KOS.Physics.collide(boats, venue, marks)`
  so boats bump into them.
- **Lines:** `scene.lines = [{a, b, kind: 'start'|'finish'|'layline'|'path'}]`. You can mutate `a`/`b` live; sail.js
  moves a dotted `path` line from the boat to the next target in easy assist.
- **Overlays:** `scene.addOverlay(fn)` draws in world space, in meters (`fn(ctx, scene)`, `scene.mpp` = meters per pixel,
  `scene.view` = visible world rect for culling, `scene.t` = render time). `scene.addOverlay(fn, {screen: true})` draws in
  screen pixels (`scene.worldToScreen(x, y)`). sail.js uses a world overlay for rings and trash (a minimum size of
  `13 * mpp` keeps them readable) and a screen overlay for the edge-of-screen target arrow. Copy `drawTargetArrow`.
- **Tilted view (Skrå visning):** pass `tilt: host.tilt, tiltAuto: host.tiltAuto` to the scene. When `scene._tilt` is non-null
  (null whenever the view is flat, so test it, never assume) the world transform is squashed vertically by `scene.kY` and everything
  on the ground (rings, zones, lines, ground lettering) squashes with it. Write overlays so they work both ways:
  - `scene.worldToScreen` / `screenToWorld` already include the tilt (exact inverse), so edge arrows and tap-to-world need no change.
  - `scene.project(x, y, z)` gives the screen px of a world point `z` metres above the water (clear a mast with it, `z = mastH`).
  - Text, badges and glyphs must not be squashed: under `if (scene._tilt)` call `scene.upright(ctx, x, y, z)` inside a `save()/restore()`.
    It resets the transform to screen-aligned CSS px at the projected point, so draw in px there (font `15px`, no `* mpp`).
    `scene.pill(ctx, x, y, text, {dy, z})` does this itself (`dy` stays in px). With tilt off keep your old code path untouched.
  - Conversions of a screen-Y offset in px to metres divide by `Z * scene.kY` (`kY` is exactly 1 when flat), as in rowschool/dock framing.
  - Things with height that must sort against the boats (a post, a mast, a committee boat) register `scene.props.push({x, y, draw(ctx, scene, tilt)})`;
    props are only iterated when tilted, depth-sorted with boats and marks, and drawn with the world transform. See the race committee boat.
  - `scene.fit()` already accounts for the squash. Never rely on the chase cam (`#chase=1` dev flag); `biasY` is 0 in the user build.
- **Effects:** `scene.effects.text(x, y, 'Vending!', {color, size})`, `.stars(x, y, n)`, `.confetti(x, y, n)`,
  `.splash(x, y, k)`, `.ripple(x, y, r, life)`, `.spray(...)`. Wakes, bow spray, heel, sail flutter, hiking crew and
  spinnaker pop are automatic.
- **Wind:** keep `bounds` small (about 600 m) around the action and call `wind.recenter(boat.x, boat.y)` every couple
  of seconds (sail.js does it every 2 s). Gust patches only show and work inside that area, and they are the
  best-looking thing on the water. Use `KOS.Wind.steady(dir, kn)` for tutorials that need no gusts.
- **More boats:** `KOS.AI.createHelm(boat, {skill, seed}).think(env, plan, boats) → controls` each step, then
  `KOS.Physics.step` and one `KOS.Physics.collide(allBoats, venue, marks)`. Plans: `{target}`, `{course: [...]}` or
  `{start: {line, t0}}` (see SPEC). `KOS.Rules.monitor()` flags fouls.
- **Physics events** go to everyone, so **filter on your boat**: `boat:tack`, `boat:gybe`, `boat:irons`, `boat:heelWarn`,
  `boat:plane`, `boat:ground`, `boat:capsize`, `boat:righted`, `boat:collide`. Always `KOS.Events.off` them in `destroy`.
  The scene already adds splashes and shake for ground, collide and capsize.

## 5. Input

```js
const ctrl = KOS.Input.attach(host.layer, {layout: 'sail'|'rib'|'none', spinnaker, spinnakerKind: 'spi'|'gennaker',
  hike, autoTrim, pauseButton: false, extraButtons: [{id: 'horn', icon: 'whistle', labelKey: 'race.btn.horn'}]});
ctrl.on('horn', () => ...);                 // extra buttons also get number keys 1-9
controls = KOS.Input.toControls(ctrl.state, boat, controls, dt);   // every update: smooth rudder, sheet, hike, spi, throttle
```
- With auto-trim on, mirror the boat's sheet onto the slider: `ctrl.setSheet(boat.sheet)`. With manual trim, show the
  green zone: `ctrl.setIdealSheet(KOS.Physics.idealSheet(boat), 0.07)` (sail.js `hudTick`).
- To teach a control, call `ctrl.highlight('hike', true)`; `setEnabled(id, false)` greys a control out.
- Keyboard: arrows or WASD steer and sheet (throttle for the RIB), Space hikes, E toggles the spinnaker, Enter/F is the action.
- For dom modes use `layout: 'none'` or no Input at all, plus normal DOM buttons of at least 44 px.

## 6. HUD, coach, feedback

- `KOS.UI.hud(layer, items)`: built-in items `wind speed pos timer place lap score heel tack penalty`. Add your own with
  `{id, icon, labelKey}` and fill them through `hud.update({custom: {id: html}})`. Update at about 10 Hz. Call
  `hud.destroy()` in destroy. The HUD sits top-centre and the app's pause button top-left; put extra panels under them
  (see `.sail-goals` in `css/modes/sail.css`, including the phone portrait and landscape media queries).
- `KOS.UI.coach(text, {ms})`: Coach Søs speech bubble, one at a time. Keep each line short and kind, and show each tip
  once per run (sail.js `tip()`). In landscape on phones the bubble moves up under the HUD automatically.
- `KOS.UI.countdown(layer, 3, onDone)` gives "3-2-1-Sejl!" and returns `{cancel()}`. `KOS.UI.toast(text, {kind, icon})`.
- Sounds: `KOS.Audio.play(name, {vol, pitch})` with names `click tap whoosh tack gybe flap luff splash spray crash bump
  horn hornShort hornLong whistle bell gull countdown go win lose star coin pop rigClick rope zip knot cheer gear`.
  Loops: `KOS.Audio.ambient({wind, waves, harbor})` (refresh every 0.5 s, `null` to stop), `KOS.Audio.engine(throttle|null)`.
  Stop the loops in `pause()` and `destroy()`. Wrap audio calls in try/catch or check `KOS.Audio`, because sound is optional.
- Juice checklist: floating text and stars on every success, `coin`/`pop` with rising pitch for combos,
  `scene.shake` on bumps, confetti on finish, and a short 1–2 s pause on the water before `host.finish` so the moment lands.

## 7. Results and stars

```js
host.finish({stars /*0..3*/, score, timeMs, success, stats: {...}, msgKey, msgVars});
```
- Call it **once**. The app saves progress, gives XP (stars × 100 plus bonuses), awards badges and shows the results screen.
- `stats` keys get their label from `ui.stat.<key>` if that string exists (`tacks gybes distance` ...), otherwise the key
  itself is looked up, so use full keys like `'race.stat.place'` for your own (sail.js `prefixStats`).
- Stars must be fair for **every boat class and assist level**. Don't hard-code seconds: compute a reference time from
  the boats' polars. `KOS.SailMode.routeTime(cls, tws, windDir, points)` and `KOS.SailMode.starsFor(ratio, assist)`
  are shared helpers for this. Then run `tools/autoplay.js` with a fast and a slow boat to check the numbers.
- Quitting from the pause menu needs nothing from you: the app calls `destroy()`.
- A mode with its own result data (soslag's wet bars) puts it in `result.soslag`; the app keeps the whole result in `KOS.App.run.lastResult`, so the mode can decorate the results card from there. A mode badge is a `BADGES` entry plus a `give(...)` line in `evalBadges` (`app.js`), gated on `a.mode`; `node tools/check-badges.js` must pass. See `js/modes/soslag.js` and `docs/specs/soslag.md`.

## 8. Strings (i18n)

- Register `da` and `en` in your file under your namespace (`race.*`). Danish comes first and must be natural and
  kid-friendly, using real sailing words: bagbord, styrbord, krydse, slå (en vending), bomme (en bomning), luv, læ,
  halvvind, slør, læns, skøde (hal ind / fier ud), rorpind, sværd, hænge ud, kæntre, mærke, startlinje, sejlrende.
- Use `{name}` placeholders, e.g. `KOS.t('race.place', {n: 2})`. Never build sentences by gluing words together.
- Shared strings exist in `common.*` and `ui.*` (port/starboard, kn, OK, ...). Check with `KOS.I18n.has(key)`.

## 9. Rules of thumb

- Simulation state lives in your instance and moves only in `update(dt)`. Don't use wall-clock time or `setTimeout` for
  gameplay, because both keep running while the game is paused. Use `KOS.U.rng(seed)` for anything random, so a level
  plays the same every time.
- Start every challenge inside the venue's water. Check spots with `KOS.World.isSolid`, `depthAt(v, x, y) > draft + 0.3`
  and `inZone(v, x, y, 'swim')` (sail.js `okSpot`). Mind the swim zone along Svanemøllestranden.
- Show the player where to go: an edge arrow with the distance, a pulsing ring on the next mark, and a coach line at the start.
- Phones first: check 390×844 and 844×390. Keep the centre of the screen (the boat) free of panels.
- `destroy()` must leave nothing behind: DOM, listeners (KOS.Events, window, layer), audio loops, timers.

## 10. Testing (all headless, never a visible window)

```bash
node tools/smoke.js --only=race            # boots, visits every screen, runs each race.* activity ~3 s with keys,
                                           # pause/resume, results; fails on any console error. Screenshots → docs/screenshots/
node tools/smoke.js --only=race --no-shots # quicker
node tools/playshot.js race.club1 390x844 7000 "ArrowLeft:600,Space:400"   # one screenshot after some input → shot-play-*.png
node tools/autoplay.js race.club1 29er normal   # fast-forward to the end (needs inst.setAutopilot / skipIntro hooks)
node tools/smoke.js --no-shots --only=race   # also runs the light "file-tilt" pass (Skrå visning on); --no-tilt skips it
node tools/tilt-check.js --fit             # tilted course fit: every course corner inside the screen at 390x844 and 844x390
node tools/test-core.js                    # core physics/rules/AI tests (run them if you touched js/core)
node tools/gen-precache.js                 # after adding or renaming files (the orchestrator runs it before commits)
```
**Look at your screenshots** with the Read tool at phone and desktop sizes. Most bugs show up there: panels covering the
boat, text that is too small, things off screen. The optional test hooks are worth the ten lines they take: expose
`setAutopilot(on)` (let `KOS.AI.createHelm` drive the player's boat, as in sail.js) and `skipIntro()` on your instance.

## 11. Done checklist

- [ ] Activities show in the right hub area with Danish and English titles, sensible order, unlocks and minutes.
- [ ] Every activity can be finished, and `tools/autoplay.js` (or a manual playshot run) proves it.
- [ ] Stars are fair for slow and fast boats and for every assist level. Easy is forgiving.
- [ ] Phone portrait and landscape, tablet and desktop all look right (screenshots checked).
- [ ] Touch, keyboard and mouse all work. Pause, resume and quit leave nothing behind.
- [ ] `node tools/smoke.js --only=<mode>` passes with zero console errors.
