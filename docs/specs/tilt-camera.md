# Skrå visning: tilted 2.5D camera (issue #5)

Status: spec and plan (revised after review, see "Review notes" at the end), nothing implemented yet. Branch `tilt-camera`.
Source: GitHub issue #5 ("Skrå visning: 2.5D-kamera hvor man kan se bådene krænge"), option 2 of 3: a tilted map plus boats drawn with height, in Canvas 2D.

Line numbers below refer to commit `847860f` and will drift as the work proceeds. Re-grep before editing.

---

# Part 1: Spec

## 1. Goals and non-goals

**Goals**
- G1. Add a tilted camera. The water, land tiles, wakes and zones are drawn with a pitch, as a vertical squash applied after the camera rotation.
- G2. Draw things with height using a small 3D projection `project(x, y, z)`:
  - mast, boom, mainsail, jib, spinnaker/gennaker
  - hull freeboard band
  - keel or daggerboard showing on the high side when heeled
  - hiking or trapezing crew
  - buoys, marks, poles, the committee boat mast and the RIB console
- G3. Heel becomes visible as real geometry: the rig rotates about the centreline.
- G4. Shadows fall on the water from a fixed sun. A haze band at the top of the screen gives depth.
- G5. A setting "Skrå visning" with values `off`, `on` and `auto`. There is also an in-game quick toggle.
- G6. The HUD never tilts. Labels, tags, marks and arrows stay upright and readable.
- G7. Screen→world conversion inverts the tilt (tap-to-world in rules school, culling, target arrows).
- G8. It runs on cheap phones. Low performance makes `auto` resolve to off.

**Non-goals**
- N1. No WebGL or true perspective. The projection is an affine (orthographic) pitch, so there is no vanishing point and no horizon singularity (§3.5).
- N2. Physics is unchanged. `js/core/*` is not touched apart from tests.
- N3. Land stays flat. Buildings, trees and jetties stay as baked top-down tiles that squash with the camera. Only the club flagpole and lighthouses get a post or light height.
- N4. No new DOM-mode behaviour (capsize, knots, quiz, rigging, shed).
- N5. Chase cam (the camera turning with the boat) is a dev flag only in this round (`#chase=1`). It is not a user setting (see open questions).
- N6. The DOM SVG sprites (`KOS.Sprites.boat`, `boatCard`, `sail`, `avatar`, `icon`) are unchanged.

## 2. Hard invariant: tilt off is unchanged

When the effective tilt `T` (§3.2) is exactly 0, every canvas call and every return value of `worldToScreen`, `screenToWorld`, `view`, `mpp` and the item order must be identical to `847860f`.

Rules for implementers:
- **I1. Guard the new code.** Every new branch is guarded by `if (this._tilt)` in `scene.js` or `if (opts.tilt)` in `sprites.js`. Here `_tilt` is null whenever the effective pitch is below `PITCH_MIN` (2°, §3.2), which includes `T === 0`. The existing code path stays textually intact. No `scale(1,1)` and no `project()` call when off. In particular the flat `drawBoat` body is **not refactored**: the tilted path duplicates the rig derivations it needs (§4.4).
- **I2. Snap by direction.** Easing snaps `T` to exactly `0` only when `want === 0` and `T < 0.002`, and to exactly `1` only when `want === 1` and `T > 0.998`. A one-sided threshold would trap `T` at 0 when easing up with a tiny `dt`.
- **I3. Shake randomness.** `applyWorld` keeps calling `Math.random()` exactly as today: twice per call when shaking, once per frame. The shake offset is stored on `this._shx/_shy` so upright tilted draws can reuse it. When off, the stored value is not read anywhere.
- **I4. Item sort.** With tilt off it stays `a.y - b.y`.
- **I5. Golden check.** A deterministic check, `tools/tilt-golden.js` (§9.3), renders fixed frames of several activities and hashes the canvas pixels. With tilt off, the hashes must equal those produced by the same script against a worktree of the base commit.

## 3. Camera model

### 3.1 State

New fields on `SailScene`:

```
camera = { x, y, zoom, rot, pitch }   // pitch in radians, 0 = top-down (current), eased
this._tiltT        // 0..1 eased blend factor T
this._tiltWant     // 0 or 1, the resolved target (from setting/override/overview/perf)
this._tilt         // per-frame cache, null when pitch < PITCH_MIN (incl. T===0), else { T, pitch, k, s, ... } (see 3.4)
```

`SailScene.view` (the static singleton) gets `tilt: null | true | false`. This is the in-game quick-toggle override. It is reset to `null` with `mul` and `overview` at `app.js:394` and `app.js:426`.

### 3.2 Pitch values

The pitch is measured from vertical. Base pitch `P0` depends on the device shape:

| Viewport | P0 | k = cos | s = sin |
|---|---|---|---|
| portrait (`h > w*1.15`) | 38° | 0.788 | 0.616 |
| landscape phone (`min(w,h) < 600`) | 32° | 0.848 | 0.530 |
| desktop or tablet otherwise | 35° | 0.819 | 0.574 |

These are tunable constants in `KOS.Tilt.PITCH` and can be retuned after the step 1 screenshots.

**Zoom fade.** Far out the view should read as a map. Use `ppmCss = camera.zoom` (CSS px per metre). Then:

```
zf = smoothstep(1.5, 5, ppmCss)
pitch = T * P0 * zf
```

Pitch is 0 at the venue overview, and normal play zoom (about 8 to 30 px/m) gets the full pitch.

**Flat below `PITCH_MIN`.** When `pitch < PITCH_MIN = 2°` (k ≥ 0.9994), `_tilt` is null and the frame takes the flat path. This hides the switch from the 3D rig to the flat sprite: at 2° the 3D rig is visually indistinguishable from the flat sprite, so there is no one-frame pop when easing out or when zooming out.

**Forced flat.** The target `_tiltWant` is 0 while `SailScene.view.overview` is true (the map button), whatever the setting is.

### 3.3 Transition

- `T` eases toward `_tiltWant` with `T += (want - T) * (1 - exp(-dt * 4))`, which gives about 0.6 s to 90%. The snap rule is directional (I2).
- `_snap` (a new activity) sets `T = want` immediately.
- **Initial state.** The constructor sets `_tiltWant` from `opts.tilt` (or `KOS.Tilt.force`) and `T = _tiltWant`, so a run starts already tilted. This matters because modes call `fit()` from their constructor before the first render (`race.js:460`, `rib.js:1491`), and `fit()` reads `_tiltWant` (§5).
- Reduced motion (`KOS.UI.reduced()`, cached at scene construction and refreshed on the `settings` event) snaps `T` instead of easing. The `settings` listener is added to the existing `this._handlers` map (`scene.js:77-86`), so the existing `destroy()` (`scene.js:87`) removes it with the others.
- **Camera framing under tilt (`biasY`).** `scene.biasY` already exists in `worldToScreen`, `screenToWorld` and `applyWorld` (`scene.js:157,162,169`), but nothing sets it today. Shifting the camera to show "more water ahead" only makes sense when ahead is up the screen, which is true only under the chase cam. Without chase cam, a boat heading south would get the bias the wrong way, and the shift would also push the boat toward the bottom touch controls (target-arrow margins of 130 to 190 px in `race.js:1150`). Rule:
  - `biasY = 0` unless all of these hold: the chase cam is on, there is a follow `target`, and `fixedZoom` is null.
  - When they hold: `biasY = T * zf * KOS.Tilt.BIAS * h`, with `BIAS = 0.06` (tunable). At 844 px that is at most 51 px, which keeps the boat above the 190 px control band.
  - So in the user build (no chase cam) `biasY` stays 0, and `fit()` is unaffected.
- **Zoom.** Zoom is unchanged by tilt. The px/m scale along screen-X stays as today, so boats keep their width. `KOS.Tilt.ZOOM_MUL = 1.0` is a tunable, to retune after step 1.
- **`scene.kY`.** A read-only per-frame value: `k` when `_tilt`, else exactly `1`. Mode framing code that converts a screen-Y offset to metres divides by `Z * scene.kY` (§5).

### 3.4 Projection math (exact)

Notation:
- `C = camera`, `rot = C.rot`
- `cr = cos(-rot)`, `sr = sin(-rot)`. These match the current `worldToScreen`.
- `Z = C.zoom`, `k = cos(pitch)`, `s = sin(pitch)`
- `cx = w/2 + shx`, `cy = h/2 + biasY + shy`. Shake is included only in the ctx transform and in upright draws. `worldToScreen` and `screenToWorld` keep excluding shake, as today.

**World to camera (ground plane):**
```
dx = x - C.x ;  dy = y - C.y
u  = dx*cr - dy*sr          // screen-right, metres
v  = dx*sr + dy*cr          // screen-down (= toward the camera), metres
```

**Project** (world metres, z up in metres) **to screen in CSS px:**
```
X = w/2 + u*Z
Y = h/2 + biasY + v*Z*k - z*Z*s
```

`project(x, y, 0)` is the new `worldToScreen`. With pitch 0 (k=1, s=0) it reduces exactly to today's formula.

**Inverse, for z = 0 (the new `screenToWorld`):**
```
u  = (X - w/2) / Z
v  = (Y - h/2 - biasY) / (Z*k)
x  = C.x + u*cos(rot) - v*sin(rot)
y  = C.y + u*sin(rot) + v*cos(rot)
```
This is exact, because the map is affine and invertible for k > 0. Pitch is capped at 45° in code, so k ≥ 0.707 and there is no division blow-up.

**Inverse for a known height z** (for hit-testing upright things, optional): add `z*s/k` to `v` before un-rotating.

**ctx transform (applyWorld under tilt).** The order matters. The squash is applied in screen space after the rotation, so in canvas call order it comes before `rotate`:

```
ctx.setTransform(dpr,0,0,dpr,0,0)
ctx.translate(w/2 + shx, h/2 + biasY + shy)
ctx.scale(1, k)          // squash screen-Y  (NEW, only when _tilt)
ctx.rotate(-rot)         // unchanged
ctx.scale(Z, Z)
ctx.translate(-C.x, -C.y)
```

Point mapping is `p → T·Sk·R·Z·(p - cam)`, which matches the formulas above.

> The code map suggested `scale(1,k)` *after* `rotate`. That would squash along a world-rotated axis and break `worldToScreen` as soon as `rot ≠ 0`. Use the order above.

**Depth.** Camera-space depth is `v` (bigger means nearer the viewer, lower on screen). Under tilt, items are drawn in ascending `v`.

**Per-boat 3D matrix (performance).**
- Boat-local coordinates `(bx, by, bz)`: bow is `-y`, starboard is `+x`, z is up from the waterline.
- Heel `h > 0` heels to starboard, matching `sprites.js` (`heel>0` darkens +x and pushes the mast top to +x).
- Heel is a rotation about the boat's y axis:
  ```
  hx' = bx*cos(h) + bz*sin(h)
  hz' = -bx*sin(h) + bz*cos(h)
  hy' = by
  ```
- Then heading (`ctx.rotate(heading)` semantics):
  ```
  wx = x0 + hx'*cosH - hy'*sinH
  wy = y0 + hx'*sinH + hy'*cosH
  ```
- World height is `wz = hz'`.
- Written as a 3×3 world matrix `W` (columns for `bx`, `by`, `bz`; rows world x, y, z), with `ch = cos(h)`, `sh = sin(h)`:
  ```
  W = [ ch*cosH   -sinH   sh*cosH ]
      [ ch*sinH    cosH   sh*sinH ]
      [ -sh         0      ch     ]
  ```
- Then `project`. The chain is linear, so each boat gets one 2×3 matrix `P·W` plus an offset:
  ```
  [X]   [a  c  e] [bx]   [tx]
  [Y] = [b  d  f] [by] + [ty]
                  [bz]
  ```
- `KOS.Tilt.boatMatrix(cam, tilt, boat, heel, out)` fills a reused `Float64Array(8)`, so there are no allocations.
- The `(a,b,c,d)` columns at a fixed z are an ordinary 2D affine, so a top-down bitmap (the cached hull sprite) can be drawn on the deck plane with one `ctx.setTransform(dpr*a, dpr*b, dpr*c, dpr*d, dpr*(tx + e*z), dpr*(ty + f*z))` and `drawImage`. No new sprite cache is needed.

**Shadow matrix.**
- The sun is fixed in world space. A world point `(wx, wy, wz)` casts its shadow at `(wx + wz*SUN.x, wy + wz*SUN.y, 0)`.
- `KOS.Tilt.SUN = { x: 0.20, y: 0.30 }` is a **tunable** constant (light from the north-west and above). It is deliberately longer than the flat sprites' fake offset (`sprites.js:550`: `0.35 + mastH*0.06`, about 0.06 to 0.08 m per metre of height), because the tilted view shows the shadow as a real cast shadow; it is not meant to match the flat path. With these values a 9.5 m J70 mast casts a shadow of about 3.4 m. Retune from the step 1 screenshots.
- The shadow map is `S = [[1,0,SUN.x],[0,1,SUN.y],[0,0,0]]` applied in world space, then `project` at z=0. So the shadow matrix is `P·S·W` (same `P` as the boat matrix). Column by column, before projection:
  - `bx` column: `(ch*cosH - sh*SUN.x, ch*sinH - sh*SUN.y, 0)`. Heel lowers the windward side, so its shadow moves against the sun.
  - `by` column: `(-sinH, cosH, 0)`, the same as the boat matrix.
  - `bz` column: `(sh*cosH + ch*SUN.x, sh*sinH + ch*SUN.y, 0)`. This is the ground-projected lateral shift from heel plus the sun offset scaled by `ch`, with no vertical lift.
- So the shadow matrix is **not** the boat matrix with only the z column swapped. The `bx` column changes too whenever `h ≠ 0`. A z-column-only swap would detach mast and sail shadows from the hull as soon as the boat heels.
- `KOS.Tilt.shadowMatrix(cam, tilt, boat, heel, out)` builds `P·S·W` directly into a reused `Float64Array(8)`.
- Any 3D polygon drawn through the shadow matrix is its shadow. This is the same code path with a different matrix.

### 3.5 View culling and the "horizon"

- **No horizon.** Because the projection is affine (orthographic pitch), every screen pixel maps to a finite ground point. There is no horizon line and no near-horizon clipping is needed. The ground footprint of the screen is a parallelogram of size `w/Z` by `h/(Z*k)` metres (a rectangle when `rot = 0`).
- **`scene.view`.** It stays the AABB of the inverse-mapped corners, so all 15+ consumers in `scene.js`, `water.js` and `effects.js` keep their semantics.
- **Tall-object margin, separate `viewItems`.** A post of height H whose ground point lies below the bottom edge can still show its top. `scene.view` stays the ground AABB, so water, tiles and sparkle do not grow beyond the 1/k below. A second AABB, `scene.viewItems`, is computed with the bottom edge extended to `h + HMAX*Z*s` px, with `HMAX = 12` m (J70 mast 9.5 m plus the spinnaker head). Only the item culling loop (buoys, marks, boats, props; `scene.js:205-208`) uses `viewItems`. With tilt off, `viewItems` is not computed and the loop reads `view` exactly as today.
- **No per-frame allocation.** Under tilt, both AABBs are computed with inline inverse calls into reused objects. The off path keeps its current allocating code (invariant I1).
- **View growth.** The ground view is `1/k` larger along v, so 1.18× to 1.27× more water, tiles and sparkle cells. This is budgeted in §8.

**Sky and haze band.**
- After the world pass and before the screen overlays, draw a screen-space vertical gradient over the top `0.22*h` px.
- Colours: `rgba(200,225,245, 0.55*T*zf)` at the top edge fading to transparent, then a 2 px `rgba(255,255,255,0.10*T*zf)` "horizon glint" line at y=0.
- The gradient object is cached per `(h, round(alpha*20))`.
- At night (`night > 0`) the haze colour is `rgba(20,30,60,...)`.
- It is skipped when `T === 0`. It is drawn under the screen overlays, so the HUD and target arrows stay on top.

### 3.6 Chase cam (dev flag only)

- `#chase=1` (hash) sets `scene.chase = true`. The camera's `rot` then eases toward the target boat's heading with `1 - exp(-dt*1.5)`, using the angle wrap via `KOS.U.angDiff`. This is the only case where `biasY` is non-zero (§3.3).
- It is ignored, with `rot` locked at 0, when `KOS.UI.reduced()` is true or `T === 0`.
- Inputs are boat-relative, so steering is unaffected.
- The existing `rotate(-rot)` counter-rotations in `pill`, `drawBuoy` and floating text already handle `rot ≠ 0`.

## 4. What moves from flat to 3D

The values below are defaults in metres. Per-class overrides go in `GEO[cls].tilt` only if the screenshots need them.

| Element | Tilted rendering | Height data |
|---|---|---|
| **Hull side (freeboard)** | Hull outline `outlineD(g,0)` filled at z=0 and at z=fb/2 in `shade(hull,-0.35)`, then stroked once at z=fb/2 with the same colour and `lineWidth = fb*Z*s` px (round joins), then the cached hull sprite drawn on the deck plane at z=fb. Filling only z=0 and z=fb would leave notches at the bow and stern, where the hull is narrower than the vertical shift; the middle slice plus the stroke closes them. | `fb`: 0.30 dinghy (opti/tera/feva/zest/ilca/29er), 0.55 hboat/j70, 0.50 RIB tube |
| **Hull bottom on the high side** | When `|heel| > 0.05`, the outline is filled at z=-0.12 in `shade(hull,-0.45)` before the side band. Heel lifts the windward chine into view. | — |
| **Keel / daggerboard** | When `|heel| > 0.12`, a tapered quad on the centreline from z=-0.05 to z=-D, at `g.board` (dinghy) or `cabin[0]..` midpoint (keel). Fill `#26364d` (keel) or `#3a3f48` (board), alpha `clamp((|heel|-0.12)*2.5,0,0.85)`. It is drawn before the hull, so the hull covers what should be hidden. Only the high-side half ends up visible. | D: board 0.9×(1-up) for `hasBoard`, keel 1.4 hboat / 1.6 j70 |
| **Raised daggerboard top** | A quad from deck to deck+`up*0.6` at `g.board`. | — |
| **Mast** | Line from `(0,mastY,fb)` to `(0,mastY,mastH)` through the matrix (heel included). Width `max(1.2, 0.09*Z)` px, colour `g.mastCol`. | `g.mastH` |
| **Boom** | Line from `(0,mastY,zB)` to the clew `(sin(boom)*g.boom, mastY+cos(boom)*g.boom, zB)`. | `zB = fb + 0.75` dinghy, `fb + 0.95` keel boats |
| **Mainsail** | Polygon (§4.1) of luff, roached leech and cambered foot, filled with a sun-shaded colour. Draft line and battens are kept at full perf only. | head at `mastH*0.97` |
| **Jib** | Triangle-ish polygon: tack `(0, -L/2+L*g.jib, fb+0.1)`, head `(0, mastY, mastH*(L>6?0.80:0.72))` (stay line), clew from `jibAng` and `jibChord` at z=`fb+0.25`, with camber as the main. | — |
| **Spinnaker / gennaker** | The existing 2D bezier footprint (`drawSpinnaker` tack/clew) is lifted. Tack and clew at z=fb+0.3, head at `mastH*0.88`. The body polygon is the footprint arc at z=0.3 to 0.6·head plus the head point, scaled by `st.spi`. Colour bands become 2 to 3 horizontal stripe polygons (full perf) or a flat fill (low perf). | — |
| **Spar extras** | Sprit (opti) from the mast at z=fb+0.4 to the peak at 0.95·mastH. Bowsprit at z=fb. Feva pole the same. Windex is a 4 px red tick at the masthead when `ppm>14`. | — |
| **Crew** | Upright figure (§4.2) per seat. Torso is a capsule from hip `(seatX, seatY, fb)` to shoulder, leaning outboard by angle `hike*65°` (hike/rail) or hanging along the trapeze wire at ~80° (trap). Head is a disc at the shoulder plus 0.25. Helmet and jacket colours come from `crewLook`. The trapeze wire goes from the shoulder to `(0, mastY, mastH*0.72)`. | torso 0.55, head r 0.13 |
| **Rudder / tiller** | Flat as today, drawn on the deck plane (tiller at z=fb+0.15). | — |
| **Capsized** | Unchanged flat `drawCapsized` path drawn on the squashed ground (z=0). It reads as a boat lying on the water, which is correct. | — |
| **Heel clamp** | After righting, `boat.heel` eases down from about 88° while `boat.capsized` is already false. The tilted path clamps the heel it uses to `±cls.capsizeHeel` (48° to 55°, `boats.js`), so the rig never lies flat on, or under, the water during recovery. The physics value is not changed. | — |
| **RIB** | Hull sprite on the deck plane (z=0.5) with the tube band. Console is a box `0.7×0.5` from z=0.5 to 1.4 at the sprite's console position. Driver is an upright figure. Outboard is a short post at the stern from z=0.2 to 0.9. | — |
| **Buoys / marks** | The existing upright sprite (already a billboard) is drawn in screen space at `project(x,y,0)`, with the same pixel size as today and `rotate` removed (`rot` is handled by projection). Ring and shadow ellipses are drawn on the squashed ground (world transform), the shadow stretched along SUN by `top*0.6`. Lights glow at `project(x,y,top)`. | sprite `top` per kind |
| **Pin / committee boat** | The committee hull stays flat on the ground (squashes), plus freeboard band 0.6. The stern flag mast is a post to z=4. Flags are drawn upright at the post top in screen space (the current `drawFlag` geometry, rotated so "downwind" is the projected wind direction). The pin pole is a post to z=2.4. **Depth sorting:** the pin is already a scene mark (`race.js:442`, `marks.concat([pin])`), so it sorts with the other items. The committee is not: race draws it in its world overlay (`race.js:1116`), after all items, so a tilted committee mast would paint over boats south of it. Under tilt, race registers the committee as a scene **prop** (§4.6) and skips the overlay call; with tilt off it keeps the overlay call exactly as today. | — |
| **Club flagpole** (`drawLandLive`) | Post to z=8 and the Dannebrog drawn upright at the top. Lighthouse lights at `project(L.x, L.y, 12)`. | — |

### 4.1 Mainsail polygon (shared by main and jib)

Inputs come from `rigStateTilted(boat, g, st, opts)` (§4.4), a copy of the `drawBoat` derivations used only by the tilted path: `boom`, `lee`, `depth`, `flutter`, `twist=0.42`, `upper`.

For `n = 7` (full) or `n = 4` (low perf) heights `f_i = i/(n-1)`:
- Height `z_i = zB + f_i*(head - zB)`.
- Chord `c_i = g.boom * (1 - f_i*upper) * (1 + 0.08*sin(pi*f_i))`. The last term is roach.
- Angle `a_i = boom + lee*twist*f_i + flutter*sin(t*18 + phase + f_i*3)`.
- Leech point `(sin(a_i)*c_i, mastY + cos(a_i)*c_i, z_i)`.
- Camber is applied to the 5 foot points between tack and clew: offset along the in-plane normal by `lee*depth*c*4*q*(1-q)`.

The polygon order is luff bottom→top (2 pts), leech top→bottom (n pts), foot clew→tack (5 pts), so 7 + n vertices.

**Shading.**
- Normal `N = (clew - tack) × (head - tack)` in world space, normalised.
- `light = 0.72 + 0.28*|dot(N, SUN3)|` with `SUN3 = normalise(-0.32, -0.5, 1)`.
- The fill is `shade(col, light-1)`, cached per (colour, quantised light in 8 steps).
- No gradients are created per frame in the tilted path.

### 4.2 Upright crew

`drawSailorTilted(ctx, M, seat, look, lean)` draws in screen space using matrix `M`:
- legs: 1 line
- torso: 1 thick round-cap line
- head: 1 arc
- helmet tint: 1 arc

That is 4 primitives per crew member, so 4 for a J70 and 16 for 4 crew.

### 4.3 Draw order inside one boat (painter's, cheap)

1. Shadows through the shadow matrix: hull outline, sail polygons, mast line, all `rgba(0,25,60,0.16)`. Skipped at Perf level 0 apart from the hull shadow.
2. Keel or board (if visible), hull bottom, side band, hull sprite on the deck.
3. Rudder and tiller.
4. "Parts" list `{depth, draw}`: main, jib, spinnaker, mast plus boom, each crew member. `depth` = the v of the part's centroid (from the matrix rows; cheap). Sort ascending (≤ 8 items, insertion sort, no allocation: reuse a module array).
5. Windex.

### 4.4 Code structure in `sprites.js`

- `drawBoat(ctx, boat, opts)` gets one line at the top, after the finite check: `if (opts.tilt) return drawBoatTilted(ctx, boat, opts);`. The rest of the body is **unchanged**. No helpers are extracted from it (invariant I1).
- The tilted path has its own `rigStateTilted(boat, g, st, opts)` → `{ heel, windSide, lee, boom, depth, flutter, trim, jibAng, jibFlutter, rudder, hike, spiOn }` and `crewSeatsTilted(...)`. These copy the formulas from `drawBoat`, including the parts that mutate `st` (the `crewSide` hysteresis and the spinnaker spring). That duplication is deliberate: extraction would not be a pure move, because those parts write to `st`, and the flat path must stay textually intact. A comment at each copy names the `drawBoat` lines it mirrors, so later edits update both.
- `stateOf(boat)` is shared. Its per-frame mutations (crew side, spinnaker spring) run exactly once per frame per boat, in whichever path is taken. A boat switching paths mid-run (toggle) continues from the same `st`.
- New in `sprites.js`: `drawBoatTilted`, `sailPolygon3D`, `drawPoly3D(ctx, M, pts3, fill)`, `drawSailorTilted`, `drawPost(ctx, M, x,y,z0,z1, col, wPx)`. `KOS.Sprites.drawBoatTilted` is exported for tests.
- `opts.tilt` is the scene's `_tilt` object: `{ T, pitch, k, s, cr, sr, Z, ox, oy, dpr, perf, camX, camY }`. Here `ox/oy` = screen centre + biasY + shake. `drawBoatTilted` resets `ctx.setTransform` itself and must restore the world transform before returning (use `ctx.save/restore`).
- Prototype scope (step 1): `drawBoatTilted` handles `zest` only, and only hull band, deck sprite, mast and mainsail. Other classes, other rig parts and capsized boats fall back to the flat path drawn in the squashed world. Step 2 adds jib, boom, spinnaker, crew, keel/board, shadows and all other classes. That fallback keeps each step shippable behind the dev flag.

### 4.6 Scene props (depth-sorted extras from modes)

- New `scene.props` array (default empty). Each prop is `{ x, y, draw(ctx, scene, tilt) }`.
- Props are added to the item list with `k: 3` **only when `scene._tilt`**. With tilt off they are not iterated at all, so the flat item list and order are unchanged (I4).
- Under tilt they are culled by `viewItems` and sorted by `v` with the other items.
- `draw` is called with the world transform active, like the overlays.
- First user: race's committee boat (§4 table). The race overlay checks `scene._tilt` and skips its own `drawCommittee` call when the prop handles it.

### 4.5 What stays flat (squashed through the ctx transform)

The following stay flat and squash through the ctx transform:
- water base, depth cache, wave patterns, gusts, cat's-paws, streaks, sparkle
- shore foam, zones (swim, nowake, lanes)
- wakes, ripples, foam
- land tiles and their baked labels
- start and finish lines, laylines, no-go wedge
- the wind arrow body (it reads as an arrow painted on the water)
- capsized boats
- mode world overlays that draw ground geometry: rings, trash, rocks, jetty zones, course lines

None of these need code changes beyond the transform, apart from the cases in §5.

The tile cache needs no rebuild when the pitch changes, because the bucket is chosen from `zoom` (screen-X scale).

## 5. Upright text, labels, tags, arrows

New scene helper:

```
scene.upright(ctx, x, y, z)  // ctx.setTransform(dpr,0,0,dpr, dpr*(X+shx), dpr*(Y+shy))  where {X,Y}=project(x,y,z)
                             // → caller draws in CSS px, screen-aligned, unsquashed. Caller wraps in save/restore.
```

With tilt off, callers do not call it, because each fix below is guarded.

| Item | Change under tilt |
|---|---|
| `pill` (`scene.js:641`) | `upright(x,y,0)` then `translate(0,dy)`. Same pixel size. Tag `dy` = `-(projected mast-top height in px + 18)` for boats: `-(L*Z*0.6+26)` becomes `-(mastH*Z*s + L*Z*k*0.3 + 18)`. Mark pills use `z = top`. |
| Floating text (`effects.js:150-160`) | `upright(o.x, o.y, o.z)`, using the animated `o.z` (`effects.js:111`), so the float-up motion is kept. Size in px as today (`mpp*o.px*pop`, converted to px), no `rotate(-rot)`. |
| Effects drops, confetti, stars (`y - z*k`) | Keep world-space but replace the fake `y - z*0.4` lift with `z*s/k` along screen-up. Small. Can stay as-is in step 3 if it looks fine. |
| Labels (`drawLabels`) | Stay painted on the ground (squashed). Size gate `px = size*Z*k < 9` under tilt. |
| `drawMarkExtras` rounding arc | Arc stays on the ground (ellipse). Arrowhead stays on the ground (OK). Pill is upright. |
| Wind arrow | Body stays on the ground. Its pill is upright. |
| Night glows (`drawNight`) | Each glow is drawn after `setTransform(dpr)` as a screen circle at `project(x,y,zLight)`, radius `r*Z`. Boat nav lights at z=fb+0.3, buoy lights at sprite top, lighthouse at 12. The darkening `fillRect` stays in screen space (`0,0,w,h`) under tilt. |
| Target arrows, ring markers in modes (`worldToScreen` callers: `school.js:1276`, `sail.js:623`, `race.js:1146`, `rib.js:1035,1395,1433`, `nav.js:1237-1280`, `dock.js:1047,1066`, `rowschool.js:1365-1426`) | No change: `worldToScreen` now includes the tilt. Where a marker sits *above* a boat (`rib.js:1395`, `dock.js:1066`), use `scene.project(x,y,mastH)` instead to clear the mast (optional polish). |
| Mode world overlays with text (`fillText` / `.pill(` in `dock.js:1061,1070`, `nav.js:680,700,1118,1216,1273,1299`, `race.js:1122,1167,1168`, `rib.js:1246,1310,1320,1330,1375,1403,1404,1453,1454`, `rowschool.js:1266,1324,1349,1395,1433,1457`, `sail.js:645,646`, `school.js:1174,1217,1269,1298,1299`) | Audit each one. If it is in a world overlay (not `{screen:true}`), wrap the text draw in `scene.upright(...)` when `scene._tilt`, using its world anchor. Screen-overlay ones need no change. |
| `drawCommittee` (`race.js:1116`) | Under tilt it is drawn from a scene prop (§4.6), so it depth-sorts. `drawCommittee` gets `{ tilt: scene._tilt }` and handles the post and flags upright when present. With tilt off the overlay call is unchanged. |
| `fit(r, pad)` | `fit` is called with no follow target (`race.js:460`, `rib.js:1491`), so `biasY` is 0 there (§3.3). Under tilt (`_tiltWant` = 1, set in the constructor before these calls), the Y term becomes `(h-2pad)/((r.y1-r.y0)*kWant)` with `kWant = cos(P0)`. That is conservative: the actual pitch is `P0*zf ≤ P0`, so the actual k is ≥ kWant and the course still fits. The off path is unchanged. |
| `rowschool` `fixedZoom` framing (`rowschool.js:1236`: `camT.y = cy - (sy - H/2)/z`) and `dock.js:1095` (`cam.y = fy + ((padB - padT)/2)/z`) | These convert a screen-Y offset in px to metres. Under tilt the conversion must be `/(z * scene.kY)`. `scene.kY` is exactly 1 with tilt off, so the expression is numerically unchanged off. Default for both modes is auto=off, so this is only for the explicit `on` setting. Low priority, step 5. |

## 6. Hit-testing

- `screenToWorld` inverts the tilt exactly (§3.4), so `rowschool.js:1465-1469` (tap a boat) works unchanged. Its tolerance `26*scene.mpp` is in screen-X metres. Under tilt the vertical tolerance in metres should be `26*mpp/k`. Use `hypot(dx/1, dy_cam*k)` only if testing shows misses; otherwise leave it.
- Docking has no map taps (DOM buttons only). Docking zones are drawn in world space and squash correctly.
- Pinch, wheel and `M` handling in `setupViewZoom` are unaffected.

## 7. Setting, auto mapping, toggle, i18n, reduced motion

### 7.1 Storage
- `kos.settings.tilt` ∈ `'off' | 'on' | 'auto'`, default `'auto'`.
- `DEFAULT_SETTINGS` (`storage.js:29-31`) and validation in `Storage.settings()` (`storage.js:59-67`): `if (!['off','on','auto'].includes(s.tilt)) s.tilt = 'auto'`.
- Add `'tilt'` to `track.js` `WATCHED` and to the analytics line in `SPEC.md` (around `:390`). Add the setting to `SPEC.md` storage section (around `:254`) and to `docs/ARCHITECTURE.md`.

### 7.2 Resolving `auto`
Resolve in `app.js` at play start, next to `host.settings`, via a new `KOS.Tilt.resolve(setting, activity, perfLevel)`. This is a pure function, unit-tested. The result goes to the scene as the new constructor opt `opts.tilt` (boolean). Modes pass it through: each of the 7 `new KOS.SailScene({...})` calls gains `tilt: host.tilt`. This is a mechanical edit.

| `activity.mode` | auto → | Reason |
|---|---|---|
| `race` (`race.<cls>.<n>`) | on | issue |
| `sail` (`sail.free.*`, `sail.rings`, `sail.cleanup`, `sail.timetrial`) | on | free sailing on the bay |
| `rib` (`rib.learn` … `rib.storm`) | on | not in the issue; our default (open question 2): boat handling, many posts. Named in the help text (§7.5). |
| `school` (`school.*` lessons) | off | not in the issue; our default (open question 1): top-down teaches best. Named in the help text (§7.5). |
| `rowschool` (`rowschool.r10` … `exam`) | off | issue |
| `nav` (`nav.buoys` … `nav.ferry`) | off | issue |
| `dock` (`dock.*`) | off | issue |
| anything else / DOM modes | off | — |

**Perf rule:**
- `auto` resolves to off when `KOS.Perf.level === 0` at play start.
- If the governor drops to level 0 during play while the tilt came from `auto`, the scene sets `_tiltWant = 0` (it eases out) and does not come back that run.
- **Session-sticky.** After any drop, the governor pins `Perf.max` (`app.js:696`), so the level can never climb back above it. If it reached 0, `auto` resolves to off for every later run in that session (until reload). This is intended: a phone that could not hold the frame rate once will not be asked again.
- An explicit `on` stays on but uses the cheap path (§8).
- `KOS.Tilt.force` (dev flag: `#tilt=on`, playshot `KOS_TILT`, perf `--tilt`) bypasses `resolve()` and the perf rule. It is the only way to measure the tilted path on a run where the level is already 0.

Precedence for `_tiltWant`:
```
overview ? 0 : (SailScene.view.tilt != null ? +view.tilt : +opts.tilt) ; then auto perf-drop rule
```

### 7.3 Quick toggle
- A new `icon-btn tilt-btn` button is placed right next to `.view-btn` in `setupViewZoom` (`app.js:390-427`), in the same `.play-chrome`.
- New icon `tilt` in `ICONS` (`ui.js:30`): a 24×24 stroke icon with a flat parallelogram (tilted plane) and a small mast and sail.
- `.on` and `aria-pressed` show the current effective state.
- Tap or key `V` (for *visning*) flips `SailScene.view.tilt = !currentEffective`. `T` is **not** free: race registers the penalty-turn extra button with `key: 'T'` when assist is not easy (`race.js:463`), and `input.js:525` matches extra-button keys by `e.key` case-insensitively. `V` is unused: there is no `KeyV`, and no `KEYMAP` entry or extra button uses `v`/`V` (the only `'V'` strings are the Danish compass letter in labels). Step 4 re-greps `KEYMAP` and every `extraButtons` `key:` before wiring it.
- The override lasts for the current activity run. It resets like `V.mul`. It is not persisted, so the setting stays the user's default.
- `track('View','tilt', actId)`.
- While overview is on, the tilt button is shown disabled (dimmed) because overview forces flat.
- The key handler follows the `M` handler rules: ignored while paused or with ctrl/meta/alt.

### 7.4 Settings screen
- New panel in `renderers.settings` right after the controls panel (`app.js:931-934`):
  ```
  <section class="panel glass"><h2>{ico('tilt')} Skrå visning</h2>
  seg('tilt', [{v:'auto', label, icon:'sparkle'}, {v:'on', label, icon:'tilt'}, {v:'off', label, icon:'map'}])
  <p class="set-help">…</p></section>
  ```
- The generic `set` handler needs no change.

### 7.5 i18n (Danish default; never the word "Coach" or "coach")

| key | da | en |
|---|---|---|
| `app.settings.tilt` | Skrå visning | Tilted view |
| `app.tilt.auto` | Automatisk | Automatic |
| `app.tilt.on` | Til | On |
| `app.tilt.off` | Fra | Off |
| `app.tilt.help` | Se bådene skråt fra siden, så du kan se dem krænge. Automatisk: til i kapsejlads, fri sejlads og RIB, fra i sejlerskolen, regelskolen, navigation og havnemanøvrer. | See the boats at an angle, so you can watch them heel. Automatic: on for racing, free sailing and the RIB, off in the sailing school, the rules school, navigation and docking. |
| `app.view.tilt` | Skrå visning (V) | Tilted view (V) |

Strings go in the da block (around `app.js:1372-1397`) and the en block (around `app.js:1445-1470`). `node tools/check-i18n.js` must pass. `check-i18n` does not test for the word "Coach", so step 4 also runs `grep -niE "tilt.*coach" js/ui/app.js` and it must print nothing. (The word already appears in existing rib strings; that is out of scope.)

### 7.6 Reduced motion (`KOS.UI.reduced()`)
- Tilt transitions snap; there is no 0.6 s ease.
- Chase cam is forced off and `rot` is locked at 0.
- There is no flag or sail flutter amplification beyond today's.
- Shake is not changed; it is out of scope and would break the invariant.

## 8. Performance budget and caching

**Baseline (measured by the reviewer on the untouched branch, `node tools/perf.js sail.free.zest race.j70.1 --rate=4`).** `sail.free.zest`: p95 16.9 ms, render 7.1 ms, ending at perf level 2. `race.j70.1`: p95 49.8 ms, with `KOS.Perf.level` already 0. An absolute 20 ms p95 budget is therefore impossible for `race.j70.1` even flat, and under `auto` the level-0 rule would resolve it to off, so an `auto` run would only measure the flat path.

**Target (relative, under explicit forced tilt).** Run `perf.js` with `--tilt=off` and `--tilt=on` (which sets `KOS.Tilt.force`, bypassing `resolve()` and the level-0 rule) at `--rate=4`, 390×844, DPR 2, same ids. For each id:
- tilted `inst.render` JS cost ≤ 1.35× the flat render cost
- tilted p95 frame ≤ flat p95 + 2 ms
- Record both numbers in the step's commit message. Each step from step 1 on runs the A/B, because steps 1 to 3 add most of the geometry.

**Caching and cheap paths:**
- The hull sprite cache is reused as is: same bitmap, drawn via `setTransform` on the deck plane.
- The buoy sprite cache is reused as is.
- No new sprite caches. Per-boat 3D work is about 60 projected points and about 10 fills or strokes per boat at full perf.
- One `Float64Array(8)` matrix per boat and one shared parts array. No per-frame `DOMMatrix`, gradient or closure allocation in the tilted path.
- Sail shades are cached per (colour, light step).
- View AABB is reused under tilt (§3.5).

**Level gating (`KOS.Perf.level`, or `tilt.perf`):**

| level | tilted path |
|---|---|
| 2 | everything: sail shadows, n=7 sail samples, spinnaker stripes, battens/draft line, haze, keel |
| 1 | n=5, no battens or draft line, spinnaker flat fill, sail shadows only for the target boat, third wave layer skipped |
| 0 | `auto` → off (§7.2). Explicit `on`: n=4, only hull and mast shadow, no keel, second wave layer skipped, sparkle cell ×1.5 |

**Water under tilt** grows by `1/k` in area. At level ≤ 1, scale the `water.js` streak count by `k` and multiply the sparkle cell by `1/k`, so the cost stays flat. These changes go inside the tilt guard in `water.js`, reading `scene._tilt`.

## 9. Test strategy

### 9.1 Node unit tests (`tools/test-core.js`, pure math in `js/render/tilt.js`)

`js/render/tilt.js` defines `KOS.Tilt` with no DOM. `tools/test-core.js` line 3 already calls `require('./harness').load()`; change that one call to `load(['js/render/tilt.js'])`. Do not add a second `load()`, because each call re-executes all the core files. All test names start with `tilt:` so `node tools/test-core.js tilt` runs just them.

Tests:
1. `pitch=0`: `project(x,y,0)` equals the legacy `worldToScreen` formula exactly (`===`), for random cam, rot and zoom, including `rot ≠ 0`.
2. Round-trip: `unproject(project(p,0)) ≈ p` (1e-9) for pitch ∈ {20°, 32°, 38°, 45°}, rot ∈ {0, 0.7, -2.1}, zoom ∈ {2, 20}, biasY ∈ {0, 84}.
3. Inverse with z: `unproject(project(p,z), z) ≈ p`.
4. Height lifts straight up on screen: `project(p,z).x === project(p,0).x` and `ΔY = -z*Z*s`.
5. `boatMatrix` agrees with the step-by-step heel → heading → project chain for 20 random points, with heel and heading both non-zero. Mast lean sign: with heading 0, rot 0, heel > 0, `boatMatrix(mast top).X − boatMatrix(mast foot).X > 0` (to starboard); with heel < 0 it is `< 0`. This is the numeric check for "the mast leans to leeward".
6. Shadow matrix, with **heel ≠ 0 and heading ≠ 0** (for example heel 0.4, heading 1.1, rot 0.3): for 20 random boat-local points `(bx, by, bz)`, `shadowMatrix · p` equals `project(wx + wz*SUN.x, wy + wz*SUN.y, 0)` where `(wx, wy, wz)` comes from the step-by-step chain. Plus: the mast-foot shadow at z=0 coincides with the mast foot itself (shadows stay attached). With heel 0 a wrong z-column-only matrix would also pass, which is why heel ≠ 0 is required.
7. `viewAABB` contains the projected footprints of all four corners. `viewItemsAABB` contains `viewAABB` and also the ground point whose `project(.., HMAX)` lands on the bottom edge.
8. Depth: for rot=0, `v` order equals y order; for rot=π/2, it equals the rotated order.
9. `resolve()` table: every row of §7.2, `perfLevel 0` → off for auto, explicit on stays on, unknown setting → auto.
10. Easing helper, directional snap: with `want = 1, T = 0, dt = 1e-4`, repeated steps increase `T` and never snap it back to 0; with `want = 0` it snaps to exactly 0 below 0.002; with `want = 1` it snaps to exactly 1 above 0.998.
11. `PITCH_MIN`: the helper that builds `_tilt` returns null for pitch < 2° and non-null at 2° or above.

### 9.2 Smoke (`tools/smoke.js`)
- Add a separate light routine `tiltPass(browser, base)`, labelled `file-tilt`, run by default after the file pass. It does **not** reuse `pass()`, which walks every screen, area and activity.
- It boots once, sets `{tilt:'on'}`, then plays only `sail.free.zest`, `race.j70.1`, `race.29er.1`, `rib.tow`, `dock.opti.jetty`, `nav.night`, `rowschool.r10` and `school.steer`.
- `--only=<prefix>` filters this fixed list too (same `startsWith` rule as `pass()`). `--http` skips it, `--file` runs it, and a new `--no-tilt` skips it.
- In each: no console errors, still on the play screen, and assert `scene._tiltT > 0.9` after 2 s. The scene is reachable via `KOS.SailScene.current`.
- Round-trip assertion in the page: `sc.screenToWorld(sc.worldToScreen(b))` ≈ b within 1e-6.
- Reset `tilt:'auto'` afterwards.

### 9.3 Golden invariant (`tools/tilt-golden.js`, new)
- Headless Chrome via Playwright `channel:'chrome'`, never a visible window.
- `addInitScript` replaces:
  - `Math.random` with `mulberry32(42)`
  - `performance.now` and `Date.now` with a manual clock
  - `requestAnimationFrame` with a no-op queue, so the app loop does not run on its own
- Seed storage exactly like `playshot.js:30-31`: `saveProfile({ name: 'Ida', age: '10-12', sailNo: '123', boatColor: '#ff7a3d' })` and `saveSettings({ unlockAll: true, sound: false, tilt: 'off' })`, before any `play`.
- For each id in `sail.free.zest race.j70.1 race.29er.1 race.hboat.1 nav.night dock.opti.jetty rowschool.r10`: `KOS.App.play(id,{force:true})`, skip intro if possible, then 90×(advance clock 1/60 s; `inst.update(KOS.DT)`; `inst.render(1)`). Print `id sha1(canvas.toDataURL())` per id.
- **Coverage scenarios.** Each is one extra hashed frame sequence after the plain one, driven through public state only (no new API, so it runs on the base):
  - shake: `KOS.SailScene.current.shake(1)` at frame 30 (any id)
  - spinnaker: `race.hboat.1`, set the player boat's `spinnaker = true` after each `update` (physics may reset it from the controls)
  - trapeze/hike: `race.29er.1`, set the player boat's `hike = 1` (`physics.js:298`) after each `update`
  - capsized: `sail.free.zest`, set `boat.capsized = true` and `heel = 1.5` after each `update`
  - ghost: `race.j70.1`, set `ghost = true` on one AI boat (the field race sets at `race.js:823`) at frame 0
- `--root=<dir>` loads `index.html` from another checkout.
- **Usage:**
  ```
  git worktree add ../KOSGame-base 847860f
  node tools/tilt-golden.js --root=../KOSGame-base > base.txt
  node tools/tilt-golden.js > head.txt
  diff base.txt head.txt
  ```
  The diff must be empty with tilt off. Remove the worktree afterwards.
- `tilt-golden.js` itself must not depend on any new API, so it runs against the base. It forces `{tilt:'off'}` via `saveSettings`; the base ignores the unknown key.
- **Fallback.** If determinism proves impossible for an id (for example timers in a mode), drop that id and document why in the script header. At least 3 ids must remain, and every coverage scenario must remain on some id.
- **Proof of determinism (step 0).** Before any renderer edit: run the script twice on the base checkout and diff (must be empty). Then a negative control: temporarily change one pixel in a render path (for example `ctx.fillRect(0,0,1,1)` at the end of `SailScene.render`), rerun, and confirm the affected hashes change. Revert the control.

### 9.4 Screenshots (`tools/playshot.js`)
- Step 1 adds env `KOS_TILT=on|off|auto`. Playshot then does `saveSettings({tilt})` (step 4 and later) and sets `KOS.Tilt.force` (step 1 dev flag) before `play`.
- Each step lists its shot commands. The reviewer opens the PNGs with the Read tool.
- Required sizes: 390x844, 844x390, 1440x900.
- Shots go to the repo root as `shot-*.png` (gitignored).

### 9.5 Perf (`tools/perf.js`)
- Step 1 adds `--tilt=on|off`. `on` sets `KOS.Tilt.force = true` before each `play` (so the level-0 auto rule cannot turn it off); `off` sets `force = false` and `saveSettings({tilt:'off'})` (the latter is ignored before step 4).
- Compare `node tools/perf.js sail.free.zest race.j70.1 race.29er.1 --rate=4 --tilt=off` against `--tilt=on`. The budget is relative (§8).

### 9.6 Always
- `node tools/gen-precache.js` after file edits, then `node tools/run-tests.js` (core + precache), and `node tools/run-tests.js all` at the end of steps 4 and 5.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Accidental change of the flat path (byte-identity) | Guards I1–I4, golden check §9.3 at every step, a separate `drawBoatTilted` |
| Wrong ctx call order (squash vs rotate) | Unit tests 1/2, an in-page round trip with `rot ≠ 0` in step 1, and a chase-cam dev shot in step 4 |
| Mode world overlays draw squashed text | The audit list in §5. Text squashed by k≥0.79 is still legible, so this is polish, not breakage |
| Cheap phone frame drops (bigger view, more geometry) | Level gating §8, auto → off at level 0, perf.js A/B |
| Rig looks wrong (heel sign, sail side) | Unit test 5 (heel sign). Screenshots both tacks (`ArrowLeft` / `ArrowRight` held) per class |
| `fit()` cuts the course | k-corrected `fit` (§5), `biasY` 0 without chase cam, numeric corner check in step 5 |
| Shadows detach on heel | Full `P·S·W` shadow matrix (§3.4), unit test 6 with heel ≠ 0 |
| Committee paints over boats | Scene props (§4.6) |
| Key clash with the penalty turn | Toggle key `V`, not `T` (§7.3) |
| The upright buoy sprite size feels too big against tilted boats | Tunable `KOS.Tilt.BUOY_SCALE` (default 1.0), tune in step 3 |
| `stateOf` spring stepped twice | One path per boat per frame (§4.4) |
| Duplicated rig formulas drift apart | Cross-reference comments at each copy (§4.4); visual A/B shots flat vs tilted per class |
| Precache suite red after edits | Run `gen-precache` last in each step |

## 11. Open questions (decided defaults in brackets)

1. Should `school` (the learn-to-sail lessons) be tilted on auto? [off]
2. Should `rib` be tilted on auto? [on]
3. Should the quick toggle persist into the setting? [no, it is a per-run override]
4. A separate tilt button, or a second function on the map button (long-press or cycle)? [separate adjacent button]
5. Should chase cam become a user setting later? [dev flag only now]

---

# Part 2: Implementation plan

Each step is independently verifiable and committable on `tilt-camera`. From step 1 on, every step ends with:
- `node tools/gen-precache.js`
- `node tools/run-tests.js`
- the golden diff against the base worktree (empty diff), see step 0
- the perf A/B (§8), numbers in the commit message
- a commit

Shell syntax below is bash (Git Bash). Never open a visible browser. `$SP` is the session scratchpad directory.

**Golden diff** (used by every step):
```
git worktree add ../KOSGame-base 847860f      # once, in step 0
node tools/tilt-golden.js --root=../KOSGame-base > $SP/base.txt
node tools/tilt-golden.js > $SP/head.txt
diff $SP/base.txt $SP/head.txt                # must be empty
```
The worktree is removed after step 5 (`git worktree remove ../KOSGame-base`).

### Step 0: Golden tool, proven deterministic [sonnet]

**Files:** new `tools/tilt-golden.js` only. No renderer change.

**Work**
- The script as in §9.3: seeded `Math.random`, manual clock, no-op `requestAnimationFrame`, storage seeded like `playshot.js:30-31` with `unlockAll`, the 7 ids plus the 5 coverage scenarios (shake, spinnaker, hike/trapeze, capsized, ghost), `--root`.
- Prove determinism and sensitivity before any other edit.

**Acceptance**
- Two runs on the base checkout give identical output.
- Two runs on `HEAD` (no renderer change yet) give output identical to the base.
- Negative control: a deliberate one-pixel change (`ctx.fillRect(0,0,1,1)` at the end of `SailScene.render`, temporary and reverted) changes every hash. After reverting, the diff is empty again.
- All 5 coverage scenarios appear in the output. Any dropped id is documented in the script header, with at least 3 ids left.

**Verify**
- `git worktree add ../KOSGame-base 847860f`
- `node tools/tilt-golden.js --root=../KOSGame-base > $SP/b1.txt; node tools/tilt-golden.js --root=../KOSGame-base > $SP/b2.txt; diff $SP/b1.txt $SP/b2.txt` (empty)
- `node tools/tilt-golden.js > $SP/h.txt; diff $SP/b1.txt $SP/h.txt` (empty)
- negative control: apply the 1 px change, `node tools/tilt-golden.js > $SP/n.txt; diff $SP/b1.txt $SP/n.txt` (non-empty, every line differs), then `git checkout js/render/scene.js` and rerun the empty diff
- `grep -cE "shake|spi|hike|capsized|ghost" $SP/b1.txt` ≥ 5

### Step 1: Projection core, pitched camera, Zest hull + mast + main prototype [opus]

**Files**
- new `js/render/tilt.js` (`project`, `unproject`, `boatMatrix`, `shadowMatrix`, `viewAABB`, `viewItemsAABB`, `ease`, `makeTilt`, `PITCH`, `PITCH_MIN`, `SUN`, `BIAS`, `force`)
- `js/render/scene.js` (pitch state, constructor init of `_tiltWant`/`T` from `opts.tilt`/`force`, directional easing, pitched `applyWorld`/`worldToScreen`/`screenToWorld`, `project`, `upright`, `kY`, `view` + `viewItems`, depth sort by `v` under tilt, pass `opts.tilt` to `drawBoat`)
- `js/render/sprites.js` (`drawBoatTilted` for `zest` only: hull band with middle slice and stroke, deck sprite, mast, mainsail; everything else falls back to flat)
- `js/main.js` (`#tilt=on`, `#chase=1`)
- `index.html` (script tag before `scene.js`)
- `tools/test-core.js` (change line 3 to `load(['js/render/tilt.js'])`; tilt tests 1 to 8, 10, 11)
- `tools/playshot.js` (`KOS_TILT` env sets `KOS.Tilt.force`)
- `tools/perf.js` (`--tilt=on|off` via `KOS.Tilt.force`)
- `sw.js` (regenerated)

**Acceptance**
- All tilt unit tests pass, including test 5 (mast lean sign) and test 10 (directional snap).
- Golden diff empty.
- In-page numeric round trip (forced tilt, `sail.free.zest`, `camera.rot = 0.7`, `biasY = 40` set by hand for the test): for 20 points spread over the view, `|screenToWorld(worldToScreen(p)) − p| < 1e-6`.
- In-page: `scene.kY === 1` with tilt off and `≈ cos(pitch)` under tilt.
- The tilted Zest shot shows the hull side band (no bow/stern notches), the mast leaning to leeward and the main on the leeward side. The flat shot looks as before.
- Perf A/B for `sail.free.zest` within §8.
- No console errors.

**Verify**
- `node tools/run-tests.js`
- `node tools/test-core.js tilt`
- golden diff
- `KOS_TILT=on node tools/playshot.js sail.free.zest 390x844 6000 "ArrowRight:700" shot-tilt-zest-390.png`
- `KOS_TILT=on node tools/playshot.js sail.free.zest 844x390 6000 "ArrowLeft:700" shot-tilt-zest-844.png`
- `KOS_TILT=off node tools/playshot.js sail.free.zest 390x844 6000 "ArrowRight:700" shot-flat-zest-390.png`
- the in-page round trip via a small `node -e` Playwright snippet or a `tools/tilt-check.js` helper (headless; prints max error, exits non-zero above 1e-6)
- `node tools/perf.js sail.free.zest --rate=4 --tilt=off` vs `--tilt=on`

### Step 2: Full rig, crew, shadows, all classes [opus]

**Files:** `js/render/sprites.js`, `tools/test-core.js` (shadow test 6 if not already in step 1)

**Work**
- `rigStateTilted` and `crewSeatsTilted` (copies, §4.4; the flat `drawBoat` body is not edited).
- Boom, jib, spinnaker/gennaker, crew (hike and trapeze), keel/board on the high side, raised board top, windex, highlight ring, ghost alpha, heel clamp to `capsizeHeel`.
- Shadows via `P·S·W` (§3.4).
- All classes: zest, j70, opti (sprit), tera, feva (gennaker plus pole), ilca, 29er (wings, trapeze, asym on sprit), hboat (sym spinnaker plus pole, keel), RIB (tube band, console box, outboard post, driver).
- Capsized boats stay on the flat path.
- Level gating of rig detail (§8).

**Acceptance**
- Every class in `GEO` renders through `drawBoatTilted` (not capsized). A one-off in-page check: `KOS.Sprites._tiltFallbacks` (a dev counter) stays 0 over 2 s for each class.
- Spinnakers are visible when `boat.spinnaker` is set.
- `race.29er.1` shows the trapeze crew outside the wings.
- Shadows stay attached to the hull while heeled (unit test 6 with heel ≠ 0).
- Golden diff empty (covers spinnaker, hike, capsized, ghost and shake on the flat path).
- Perf A/B for `sail.free.zest`, `race.j70.1`, `race.29er.1` within §8.

**Verify**
- `node tools/run-tests.js`
- `node tools/test-core.js tilt`
- golden diff
- `for c in opti tera feva ilca 29er hboat j70 rib; do KOS_TILT=on node tools/playshot.js sail.free.$c 390x844 6000 "ArrowRight:700" shot-tilt-$c.png; done`
- `KOS_TILT=on node tools/playshot.js race.29er.1 844x390 9000 "ArrowUp:400" shot-tilt-race29.png`
- `KOS_TILT=on node tools/playshot.js race.hboat.1 1440x900 9000 "" shot-tilt-raceh.png`
- `node tools/perf.js sail.free.zest race.j70.1 race.29er.1 --rate=4 --tilt=off` vs `--tilt=on`

### Step 3: Marks, buoys, posts, committee prop, water, haze [sonnet]

**Files:** `js/render/sprites.js` (`drawBuoy`, `drawMark`, `drawCommittee`, `drawFlag` under `opts.tilt`), `js/render/scene.js` (scene `props` §4.6, `drawLandLive` flagpole, `drawNight` glows, haze band), `js/render/water.js` and `js/render/effects.js` (level-gated counts; floating text via `upright(o.x, o.y, o.z)`), `js/modes/race.js` (committee as a scene prop under tilt, overlay call skipped only when `scene._tilt`)

**Work**
- The §4 table rows for buoys, marks, pin, committee, flagpole and lights.
- Scene props and the race committee prop.
- The §3.5 haze band. §8 water gating.

**Acceptance**
- Buoys stand upright with ground shadows along the sun.
- The committee boat has a mast and upright flags, and a boat south of it is drawn in front of it (in-page check: in `race.opti.1` with forced tilt, the committee prop's index in the sorted item list is lower than that of any boat with a larger `v`).
- The haze band appears only when tilted.
- At night, glows sit at light height.
- Floating text still rises (its screen Y decreases over its life).
- Golden diff empty. Perf A/B within §8.

**Verify**
- `node tools/run-tests.js`
- golden diff
- `KOS_TILT=on node tools/playshot.js race.opti.1 390x844 9000 "" shot-tilt-marks.png`
- `KOS_TILT=on node tools/playshot.js nav.night 844x390 7000 "ArrowUp:500" shot-tilt-night.png`
- `KOS_TILT=on node tools/playshot.js nav.buoys 1440x900 6000 "" shot-tilt-buoys.png`
- `node tools/perf.js sail.free.zest race.j70.1 --rate=4 --tilt=off` vs `--tilt=on`

### Step 4: Setting, quick toggle, auto, i18n, reduced motion, perf fallback, chase dev flag [sonnet]

**Files:** `js/ui/storage.js` (`DEFAULT_SETTINGS`, `Storage.settings()` at `:59-67`), `js/ui/app.js` (settings panel, `setupViewZoom` button and key `V`, `host.tilt` resolve, i18n da/en), `js/ui/ui.js` (`tilt` icon), `js/ui/track.js` (`WATCHED`), the 7 mode files (pass `tilt: host.tilt` to `SailScene`), `js/render/tilt.js` (`resolve`), `js/render/scene.js` (`_tiltWant` precedence, perf-drop rule, reduced-motion snap, `settings` handler in `_handlers`, chase cam with `biasY` rule), `css/game.css` (`.tilt-btn`), `tools/test-core.js` (`resolve` table test 9), `tools/playshot.js` (`KOS_TILT` now via settings, `force` kept for `on`), `SPEC.md`, `docs/ARCHITECTURE.md`

**Acceptance**
- Numeric, under the default `auto` (in-page, `KOS.SailScene.current._tiltWant` after `play`): `race.opti.1` → 1, `sail.free.zest` → 1, `rowschool.r10` → 0, `nav.buoys` → 0, `dock.zest.jetty` → 0.
- With `on`, all five are 1. With `off`, all are 0.
- Key `V` and the button flip the view with an eased transition (snap under reduced motion). In `race.opti.1` with assist `normal`, pressing `V` does not start a penalty turn and pressing `T` does not change `_tiltWant`.
- Overview (`M`) forces `_tiltWant` 0.
- After `KOS.Perf.level = 0; KOS.Perf.max = 0`, a new `auto` run of `race.opti.1` has `_tiltWant` 0 (session-sticky rule).
- `check-i18n` passes and `grep -niE "tilt.*coach" js/ui/app.js` prints nothing.
- Golden diff empty with `tilt:'off'`.

**Verify**
- `node tools/run-tests.js`
- `node tools/test-core.js tilt`
- `node tools/run-tests.js i18n`
- `grep -niE "tilt.*coach" js/ui/app.js` (no output)
- `grep -nE "key: *'[vV]'|KeyV" js -r` (only the new handler)
- golden diff
- a headless in-page check script (`tools/tilt-check.js --auto`) that plays each of the five ids under `auto`, `on` and `off` and prints `_tiltWant`; exits non-zero on any mismatch
- `node tools/playshot.js race.opti.1 390x844 6000 "" shot-auto-race.png` (expect tilted)
- `node tools/playshot.js rowschool.r10 390x844 6000 "" shot-auto-rules.png` (expect flat)
- `node tools/playshot.js sail.free.zest 1440x900 6000 "KeyV:100" shot-toggle.png` (expect flat after the toggle)
- `node tools/playshot.js screen:settings 390x844 1500 "" shot-settings.png`
- `node tools/perf.js sail.free.zest race.j70.1 race.29er.1 --rate=4 --tilt=off` vs `--tilt=on`

### Step 5: Overlays, labels, tags, hit-testing, `fit`, framing, smoke tilted pass, docs [sonnet]

**Files:**
- `js/render/scene.js` (`pill`, `drawTags`, `drawLabels` gate, `drawMarkExtras`, `drawWindArrow` pill, k-corrected `fit`)
- the mode files in the §5 audit list (upright text in world overlays)
- `js/modes/rowschool.js` (`:1236` framing `/ (z*scene.kY)`, tap tolerance if needed), `js/modes/dock.js` (`:1095` framing)
- `tools/smoke.js` (`tiltPass`, `file-tilt`, `--no-tilt`, round-trip assert)
- `docs/MODE-AUTHORING.md` (`scene.upright`, `scene.project`, `scene.kY`, `scene.props`, `scene._tilt`)

**Acceptance**
- In tilted view, name tags, the "DIG" tag, mark pills and mode texts are upright and unsquashed, and sit above the mast.
- Course fits, numerically: in `race.opti.1` and `race.j70.1` with `tilt:'on'`, right after the intro `fit()`, every corner of the course box `cb` maps through `worldToScreen` to inside `[0,w]×[0,h]`, at both 390x844 and 844x390.
- Tapping a boat in `rowschool.r10` with `tilt:'on'` selects the right boat (round trip ≤ 1e-6).
- The smoke test passes, including `file-tilt`.
- Golden diff empty. `run-tests all` green.

**Verify**
- `node tools/run-tests.js all`
- `node tools/smoke.js --no-shots --only=race`
- `node tools/tilt-check.js --fit` (course-corner check at both viewports; exits non-zero on failure)
- golden diff
- `KOS_TILT=on node tools/playshot.js rowschool.r10 390x844 6000 "" shot-tilt-rules.png`
- `KOS_TILT=on node tools/playshot.js race.feva.1 844x390 9000 "" shot-tilt-tags.png`
- `KOS_TILT=on node tools/playshot.js rib.tow 1440x900 7000 "ArrowUp:600" shot-tilt-rib.png`
- `KOS_TILT=on node tools/playshot.js dock.zest.jetty 390x844 6000 "" shot-tilt-dock.png`
- `git worktree remove ../KOSGame-base`

---

# Review notes

Changes made in response to the spec review. Each point was checked against the code at `2d70ecd`.

1. **`T` key** (accepted). `race.js:463` registers `key: 'T'` for the penalty turn and `input.js:525` matches it case-insensitively. The toggle key is now `V` (§7.3, §7.5, step 4).
2. **Shadow matrix** (accepted). The z-column-only swap was wrong under heel. §3.4 now gives `W` and the shadow matrix `P·S·W` column by column. Test 6 requires heel ≠ 0 and heading ≠ 0.
3. **`biasY`** (accepted, resolved differently). `biasY` already exists in `scene.js:157,162,169` but nothing sets it. It now stays 0 unless the chase cam is on with a follow target and no `fixedZoom`, scaled by `zf`, with `BIAS = 0.06` to stay clear of the 130 to 190 px control band. `_tiltWant` is initialised in the constructor (§3.3).
4. **Perf budget** (accepted; numbers taken from the review, not rerun). The budget is now relative under forced tilt. The session-sticky `Perf.max` pin (`app.js:696`) is documented. `perf.js --tilt` moves to step 1.
5. **Step 1 too big** (accepted). New step 0 builds and proves the golden tool (double run plus a negative control). Step 1 is now math, camera, tests and a Zest hull, mast and main only. Golden coverage adds shake, spinnaker, hike/trapeze, capsized and ghost. Storage is seeded like `playshot.js:30-31`.
6. **Committee depth** (accepted). The pin is already a scene mark (`race.js:442`). The committee becomes a scene prop under tilt (§4.6, step 3).
7. **Storage line ref** (accepted). Now `storage.js:59-67`.
8. **Snap direction** (accepted). I2, §3.3 and test 10.
9. **View margin** (accepted). Separate `viewItems` (§3.5).
10. **`rigState` extraction** (accepted, first option). The flat `drawBoat` is left alone; the tilted path has its own copies (§4.4).
11. **Numeric checks** (accepted). The round trip with `rot ≠ 0` moves to step 1. `_tiltWant` per activity, mast lean sign, course corners at both viewports, and a coach grep were added.
12. **Floating text height** (accepted). Uses `o.z`.
13. **`SUN` claim** (accepted). The claim is dropped and `SUN` is a tunable. It was also shortened to `(0.20, 0.30)`.
14. **Rendering details** (accepted). Middle slice plus stroke for the side band, flat path below `PITCH_MIN = 2°`, and the heel clamp to `capsizeHeel`.
15. **Test and smoke plumbing** (accepted, one part already handled). `test-core.js` line 3 becomes `load(['js/render/tilt.js'])`. `file-tilt` is its own light routine and `--only` applies. The `settings` listener: the scene already removes everything in `this._handlers` in `destroy()` (`scene.js:87`), so the new listener just goes in that map. No separate removal code is needed.
16. **Mode framing and auto mapping** (accepted). `scene.kY` is added, and the rowschool and dock framing divide by it (step 5). The help text now names the RIB (on) and the sailing school (off), and §7.2 marks both as our defaults rather than the issue's.
