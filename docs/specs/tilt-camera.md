# Skrå visning: tilted 2.5D camera (issue #5)

Status: spec and plan, nothing implemented yet. Branch `tilt-camera`.
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
- **I1. Guard the new code.** Every new branch is guarded by `if (this._tilt)` in `scene.js` or `if (opts.tilt)` in `sprites.js`. Here `_tilt` is null or falsy when `T === 0`. The existing code path stays textually intact. No `scale(1,1)` and no `project()` call when off.
- **I2. Snap to exactly 0.** `T` snaps to exactly `0` (not 1e-9) once it eases below `0.002`. It snaps to exactly `1` above `0.998`.
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
this._tilt         // per-frame cache, null when T===0, else { T, pitch, k, s, ... } (see 3.4)
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

**Forced flat.** The target `_tiltWant` is 0 while `SailScene.view.overview` is true (the map button), whatever the setting is.

### 3.3 Transition

- `T` eases toward `_tiltWant` with `T += (want - T) * (1 - exp(-dt * 4))`, which gives about 0.6 s to 90%.
- `_snap` (a new activity) sets `T = want` immediately.
- Reduced motion (`KOS.UI.reduced()`, cached at scene construction and refreshed on the `settings` event) snaps `T` instead of easing.
- **Camera framing under tilt (`biasY`).** The camera sits "behind" the boat, so more water should show ahead (up the screen). Under tilt, set `biasY = T * 0.10 * h`. This is new code inside the tilt guard; with T=0 `biasY` is untouched (still `undefined` → 0).
- **Zoom.** Zoom is unchanged by tilt. The px/m scale along screen-X stays as today, so boats keep their width. `KOS.Tilt.ZOOM_MUL = 1.0` is a tunable, to retune after step 1.

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
- Then `project`. The chain is linear, so each boat gets one 2×3 matrix plus an offset:
  ```
  [X]   [a  c  e] [bx]   [tx]
  [Y] = [b  d  f] [by] + [ty]
                  [bz]
  ```
- `KOS.Tilt.boatMatrix(cam, tilt, boat, heel, out)` fills a reused `Float64Array(8)`, so there are no allocations.
- The `(a,b,c,d)` columns at a fixed z are an ordinary 2D affine, so a top-down bitmap (the cached hull sprite) can be drawn on the deck plane with one `ctx.setTransform(dpr*a, dpr*b, dpr*c, dpr*d, dpr*(tx + e*z), dpr*(ty + f*z))` and `drawImage`. No new sprite cache is needed.

**Shadow matrix.**
- The sun is fixed in world space. A point at height z casts its shadow at `(wx + z*SUN.x, wy + z*SUN.y, 0)` with `SUN = { x: 0.32, y: 0.50 }`. That is light from the north-west and slightly above, consistent with today's offsets `(0.18, 0.28)` and `(0.35, 0.5)`.
- The shadow matrix is the boat matrix with the z column replaced by the projected ground offset of `(SUN.x, SUN.y)`, i.e. `e' = (SUN.x*cr - SUN.y*sr)*Z`, `f' = (SUN.x*sr + SUN.y*cr)*Z*k`.
- Any 3D polygon drawn through the shadow matrix is its shadow. This is the same code path with a different matrix.

### 3.5 View culling and the "horizon"

- **No horizon.** Because the projection is affine (orthographic pitch), every screen pixel maps to a finite ground point. There is no horizon line and no near-horizon clipping is needed. The ground footprint of the screen is a parallelogram of size `w/Z` by `h/(Z*k)` metres (a rectangle when `rot = 0`).
- **`scene.view`.** It stays the AABB of the inverse-mapped corners, so all 15+ consumers in `scene.js`, `water.js` and `effects.js` keep their semantics.
- **Tall-object margin.** A post of height H whose ground point lies below the bottom edge can still show its top. Under tilt, compute the corners with the bottom edge extended to `h + HMAX*Z*s` px, with `HMAX = 12` m (J70 mast 9.5 m plus the spinnaker head). This only enlarges the AABB at the bottom.
- **No per-frame allocation.** Under tilt, the view is computed with four inline inverse calls into a reused object. The off path keeps its current allocating code (invariant I1).
- **View growth.** The view is `1/k` larger along v, so 1.18× to 1.27× more water, tiles and sparkle cells. This is budgeted in §8.

**Sky and haze band.**
- After the world pass and before the screen overlays, draw a screen-space vertical gradient over the top `0.22*h` px.
- Colours: `rgba(200,225,245, 0.55*T*zf)` at the top edge fading to transparent, then a 2 px `rgba(255,255,255,0.10*T*zf)` "horizon glint" line at y=0.
- The gradient object is cached per `(h, round(alpha*20))`.
- At night (`night > 0`) the haze colour is `rgba(20,30,60,...)`.
- It is skipped when `T === 0`. It is drawn under the screen overlays, so the HUD and target arrows stay on top.

### 3.6 Chase cam (dev flag only)

- `#chase=1` (hash) sets `scene.chase = true`. The camera's `rot` then eases toward the target boat's heading with `1 - exp(-dt*1.5)`, using the angle wrap via `KOS.U.angDiff`.
- It is ignored, with `rot` locked at 0, when `KOS.UI.reduced()` is true or `T === 0`.
- Inputs are boat-relative, so steering is unaffected.
- The existing `rotate(-rot)` counter-rotations in `pill`, `drawBuoy` and floating text already handle `rot ≠ 0`.

## 4. What moves from flat to 3D

The values below are defaults in metres. Per-class overrides go in `GEO[cls].tilt` only if the screenshots need them.

| Element | Tilted rendering | Height data |
|---|---|---|
| **Hull side (freeboard)** | Hull outline `outlineD(g,0)` filled at z=0 in `shade(hull,-0.35)`, then the cached hull sprite drawn on the deck plane at z=fb. The visible strip between them is the side band. | `fb`: 0.30 dinghy (opti/tera/feva/zest/ilca/29er), 0.55 hboat/j70, 0.50 RIB tube |
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
| **RIB** | Hull sprite on the deck plane (z=0.5) with the tube band. Console is a box `0.7×0.5` from z=0.5 to 1.4 at the sprite's console position. Driver is an upright figure. Outboard is a short post at the stern from z=0.2 to 0.9. | — |
| **Buoys / marks** | The existing upright sprite (already a billboard) is drawn in screen space at `project(x,y,0)`, with the same pixel size as today and `rotate` removed (`rot` is handled by projection). Ring and shadow ellipses are drawn on the squashed ground (world transform), the shadow stretched along SUN by `top*0.6`. Lights glow at `project(x,y,top)`. | sprite `top` per kind |
| **Pin / committee boat** | The committee hull stays flat on the ground (squashes), plus freeboard band 0.6. The stern flag mast is a post to z=4. Flags are drawn upright at the post top in screen space (the current `drawFlag` geometry, rotated so "downwind" is the projected wind direction). The pin pole is a post to z=2.4. | — |
| **Club flagpole** (`drawLandLive`) | Post to z=8 and the Dannebrog drawn upright at the top. Lighthouse lights at `project(L.x, L.y, 12)`. | — |

### 4.1 Mainsail polygon (shared by main and jib)

Inputs come from the existing `drawBoat` derivations, extracted into a shared `rigState(boat, g, st, opts)` (§4.4): `boom`, `lee`, `depth`, `flutter`, `twist=0.42`, `upper`.

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

- `drawBoat(ctx, boat, opts)` gets one line at the top, after the finite check: `if (opts.tilt) return drawBoatTilted(ctx, boat, opts);`. The rest of the body is unchanged.
- Extract pure helpers that both paths call:
  - `rigState(boat, g, st, dt)` → `{ heel, windSide, lee, boom, depth, flutter, trim, jibAng, jibFlutter, rudder, hike, spiOn }`
  - `crewSeats(...)`

  These are pure moves; the flat path must produce identical numbers. This is covered by the golden check.
- `stateOf(boat)` and the spinnaker spring update run exactly once per frame per boat, in whichever path is taken.
- New in `sprites.js`: `drawBoatTilted`, `sailPolygon3D`, `drawPoly3D(ctx, M, pts3, fill)`, `drawSailorTilted`, `drawPost(ctx, M, x,y,z0,z1, col, wPx)`. `KOS.Sprites.drawBoatTilted` is exported for tests.
- `opts.tilt` is the scene's `_tilt` object: `{ T, pitch, k, s, cr, sr, Z, ox, oy, sunE, sunF, dpr, perf, camX, camY }`. Here `ox/oy` = screen centre + biasY + shake. `drawBoatTilted` resets `ctx.setTransform` itself and must restore the world transform before returning (use `ctx.save/restore`).
- Prototype scope (step 1): `drawBoatTilted` handles `zest` and `j70` only. Other classes and capsized boats fall back to the flat path drawn in the squashed world. That fallback keeps step 1 shippable behind the dev flag.

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
| Floating text (`effects.js:150-160`) | `upright(p.x,p.y, 1.5)`, size in px as today, no `rotate(-rot)`. |
| Effects drops, confetti, stars (`y - z*k`) | Keep world-space but replace the fake `y - z*0.4` lift with `z*s/k` along screen-up. Small. Can stay as-is in step 3 if it looks fine. |
| Labels (`drawLabels`) | Stay painted on the ground (squashed). Size gate `px = size*Z*k < 9` under tilt. |
| `drawMarkExtras` rounding arc | Arc stays on the ground (ellipse). Arrowhead stays on the ground (OK). Pill is upright. |
| Wind arrow | Body stays on the ground. Its pill is upright. |
| Night glows (`drawNight`) | Each glow is drawn after `setTransform(dpr)` as a screen circle at `project(x,y,zLight)`, radius `r*Z`. Boat nav lights at z=fb+0.3, buoy lights at sprite top, lighthouse at 12. The darkening `fillRect` stays in screen space (`0,0,w,h`) under tilt. |
| Target arrows, ring markers in modes (`worldToScreen` callers: `school.js:1276`, `sail.js:623`, `race.js:1146`, `rib.js:1035,1395,1433`, `nav.js:1237-1280`, `dock.js:1047,1066`, `rowschool.js:1365-1426`) | No change: `worldToScreen` now includes the tilt. Where a marker sits *above* a boat (`rib.js:1395`, `dock.js:1066`), use `scene.project(x,y,mastH)` instead to clear the mast (optional polish). |
| Mode world overlays with text (`fillText` / `.pill(` in `dock.js:1061,1070`, `nav.js:680,700,1118,1216,1273,1299`, `race.js:1122,1167,1168`, `rib.js:1246,1310,1320,1330,1375,1403,1404,1453,1454`, `rowschool.js:1266,1324,1349,1395,1433,1457`, `sail.js:645,646`, `school.js:1174,1217,1269,1298,1299`) | Audit each one. If it is in a world overlay (not `{screen:true}`), wrap the text draw in `scene.upright(...)` when `scene._tilt`, using its world anchor. Screen-overlay ones need no change. |
| `drawCommittee` (`race.js:1116`) | Called inside race's world overlay. Pass `{ tilt: scene._tilt }`. `drawCommittee` handles the post and flags upright when present. |
| `fit(r, pad)` | Under tilt, the Y term becomes `(h-2pad)/((r.y1-r.y0)*kWant)`, where `kWant = cos(P0)` if `_tiltWant` else 1, so the course still fits. The off path is unchanged. |
| `rowschool` `fixedZoom` framing (`rowschool.js:1234`) and `dock.js:1095` | Unchanged. Their framing assumes a flat rect, but the default is auto=off for both. With `on` the view simply shows more depth. Acceptable. |

## 6. Hit-testing

- `screenToWorld` inverts the tilt exactly (§3.4), so `rowschool.js:1465-1469` (tap a boat) works unchanged. Its tolerance `26*scene.mpp` is in screen-X metres. Under tilt the vertical tolerance in metres should be `26*mpp/k`. Use `hypot(dx/1, dy_cam*k)` only if testing shows misses; otherwise leave it.
- Docking has no map taps (DOM buttons only). Docking zones are drawn in world space and squash correctly.
- Pinch, wheel and `M` handling in `setupViewZoom` are unaffected.

## 7. Setting, auto mapping, toggle, i18n, reduced motion

### 7.1 Storage
- `kos.settings.tilt` ∈ `'off' | 'on' | 'auto'`, default `'auto'`.
- `DEFAULT_SETTINGS` (`storage.js:29-31`) and validation in `Storage.settings()` (`storage.js:81-91`): `if (!['off','on','auto'].includes(s.tilt)) s.tilt = 'auto'`.
- Add `'tilt'` to `track.js` `WATCHED` and to the analytics line in `SPEC.md` (around `:390`). Add the setting to `SPEC.md` storage section (around `:254`) and to `docs/ARCHITECTURE.md`.

### 7.2 Resolving `auto`
Resolve in `app.js` at play start, next to `host.settings`, via a new `KOS.Tilt.resolve(setting, activity, perfLevel)`. This is a pure function, unit-tested. The result goes to the scene as the new constructor opt `opts.tilt` (boolean). Modes pass it through: each of the 7 `new KOS.SailScene({...})` calls gains `tilt: host.tilt`. This is a mechanical edit.

| `activity.mode` | auto → | Reason |
|---|---|---|
| `race` (`race.<cls>.<n>`) | on | issue |
| `sail` (`sail.free.*`, `sail.rings`, `sail.cleanup`, `sail.timetrial`) | on | free sailing on the bay |
| `rib` (`rib.learn` … `rib.storm`) | on | boat handling, many posts; feels good tilted |
| `school` (`school.*` lessons) | off | teaching: top-down teaches best (see open questions) |
| `rowschool` (`rowschool.r10` … `exam`) | off | issue |
| `nav` (`nav.buoys` … `nav.ferry`) | off | issue |
| `dock` (`dock.*`) | off | issue |
| anything else / DOM modes | off | — |

**Perf rule:**
- `auto` resolves to off when `KOS.Perf.level === 0` at play start.
- If the governor drops to level 0 during play while the tilt came from `auto`, the scene sets `_tiltWant = 0` (it eases out) and does not come back that run.
- An explicit `on` stays on but uses the cheap path (§8).

Precedence for `_tiltWant`:
```
overview ? 0 : (SailScene.view.tilt != null ? +view.tilt : +opts.tilt) ; then auto perf-drop rule
```

### 7.3 Quick toggle
- A new `icon-btn tilt-btn` button is placed right next to `.view-btn` in `setupViewZoom` (`app.js:390-427`), in the same `.play-chrome`.
- New icon `tilt` in `ICONS` (`ui.js:30`): a 24×24 stroke icon with a flat parallelogram (tilted plane) and a small mast and sail.
- `.on` and `aria-pressed` show the current effective state.
- Tap or key `T` flips `SailScene.view.tilt = !currentEffective`. `T` is unused today; grep confirmed no `KeyT`/`'t'` handlers.
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
| `app.tilt.help` | Se bådene skråt fra siden, så du kan se dem krænge. Automatisk: til i kapsejlads og fri sejlads, fra i regelskolen, navigation og havnemanøvrer. | See the boats at an angle, so you can watch them heel. Automatic: on for racing and free sailing, off in the rules school, navigation and docking. |
| `app.view.tilt` | Skrå visning (T) | Tilted view (T) |

Strings go in the da block (around `app.js:1372-1397`) and the en block (around `app.js:1445-1470`). `node tools/check-i18n.js` must pass.

### 7.6 Reduced motion (`KOS.UI.reduced()`)
- Tilt transitions snap; there is no 0.6 s ease.
- Chase cam is forced off and `rot` is locked at 0.
- There is no flag or sail flutter amplification beyond today's.
- Shake is not changed; it is out of scope and would break the invariant.

## 8. Performance budget and caching

**Target.** On `node tools/perf.js` with `--rate=4` (a cheap-phone proxy) at 390×844 and DPR 2:
- tilted `sail.free.zest` and `race.j70.1` p95 frame ≤ 20 ms
- tilted `inst.render` JS cost ≤ 1.35× the flat baseline for the same id

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

`js/render/tilt.js` defines `KOS.Tilt` with no DOM. It is loaded in Node via `require('./harness').load(['js/render/tilt.js'])`, in a separate `KOS` instance or appended to the existing load call. All test names start with `tilt:` so `node tools/test-core.js tilt` runs just them.

Tests:
1. `pitch=0`: `project(x,y,0)` equals the legacy `worldToScreen` formula exactly (`===`), for random cam, rot and zoom, including `rot ≠ 0`.
2. Round-trip: `unproject(project(p,0)) ≈ p` (1e-9) for pitch ∈ {20°, 32°, 38°, 45°}, rot ∈ {0, 0.7, -2.1}, zoom ∈ {2, 20}, biasY ∈ {0, 84}.
3. Inverse with z: `unproject(project(p,z), z) ≈ p`.
4. Height lifts straight up on screen: `project(p,z).x === project(p,0).x` and `ΔY = -z*Z*s`.
5. `boatMatrix` agrees with the step-by-step heel → heading → project chain for 20 random points. Heel>0 puts the mast top at screen-right of the mast foot for heading 0, rot 0.
6. Shadow matrix: a point at z=H lands at the ground projection of `(x+H*SUN.x, y+H*SUN.y)`.
7. `viewAABB` contains the projected footprints of all four corners, plus the tall-object margin.
8. Depth: for rot=0, `v` order equals y order; for rot=π/2, it equals the rotated order.
9. `resolve()` table: every row of §7.2, `perfLevel 0` → off for auto, explicit on stays on, unknown setting → auto.
10. Easing helper: `T` snaps to exactly 0 or 1 at the thresholds.

### 9.2 Smoke (`tools/smoke.js`)
- Add a `--tilt` pass, labelled `file-tilt`, run by default after the file pass.
- Settings `{tilt:'on'}`, then play `sail.free.zest`, `race.j70.1`, `race.29er.1`, `rib.tow`, `dock.opti.jetty`, `nav.night`, `rowschool.r10` and `school.steer`.
- In each: no console errors, still on the play screen, and assert `scene._tiltT > 0.9` after 2 s. The scene is reachable via `KOS.SailScene.current`.
- Round-trip assertion in the page: `sc.screenToWorld(sc.worldToScreen(b))` ≈ b within 1e-6.
- Reset `tilt:'auto'` afterwards.

### 9.3 Golden invariant (`tools/tilt-golden.js`, new)
- Headless Chrome via Playwright `channel:'chrome'`, never a visible window.
- `addInitScript` replaces:
  - `Math.random` with `mulberry32(42)`
  - `performance.now` and `Date.now` with a manual clock
  - `requestAnimationFrame` with a no-op queue, so the app loop does not run on its own
- For each id in `sail.free.zest race.j70.1 nav.night dock.opti.jetty rowschool.r10`: `KOS.App.play(id,{force:true})`, skip intro if possible, then 90×(advance clock 1/60 s; `inst.update(KOS.DT)`; `inst.render(1)`). Print `sha1(canvas.toDataURL())`.
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
- **Fallback.** If determinism proves impossible for an id (for example timers in a mode), drop that id and document why in the script header. At least 3 ids must remain.

### 9.4 Screenshots (`tools/playshot.js`)
- Step 1 adds env `KOS_TILT=on|off|auto`. Playshot then does `saveSettings({tilt})` (step 4 and later) and sets `KOS.Tilt.force` (step 1 dev flag) before `play`.
- Each step lists its shot commands. The reviewer opens the PNGs with the Read tool.
- Required sizes: 390x844, 844x390, 1440x900.
- Shots go to the repo root as `shot-*.png` (gitignored).

### 9.5 Perf (`tools/perf.js`)
- Add `--tilt=on|off`, which seeds `saveSettings({tilt})`.
- Compare `node tools/perf.js sail.free.zest race.j70.1 race.29er.1 --rate=4 --tilt=off` against `--tilt=on`. Budget is in §8.

### 9.6 Always
- `node tools/gen-precache.js` after file edits, then `node tools/run-tests.js` (core + precache), and `node tools/run-tests.js all` at the end of steps 4 and 5.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Accidental change of the flat path (byte-identity) | Guards I1–I4, golden check §9.3 at every step, a separate `drawBoatTilted` |
| Wrong ctx call order (squash vs rotate) | Unit test 1/2 plus a chase-cam dev shot with `rot≠0` in step 4 |
| Mode world overlays draw squashed text | The audit list in §5. Text squashed by k≥0.79 is still legible, so this is polish, not breakage |
| Cheap phone frame drops (bigger view, more geometry) | Level gating §8, auto → off at level 0, perf.js A/B |
| Rig looks wrong (heel sign, sail side) | Unit test 5 (heel sign). Screenshots both tacks (`ArrowLeft` / `ArrowRight` held) per class |
| `fit()` cuts the course | k-corrected `fit` (§5) |
| The upright buoy sprite size feels too big against tilted boats | Tunable `KOS.Tilt.BUOY_SCALE` (default 1.0), tune in step 3 |
| `stateOf` spring stepped twice | One path per boat per frame (§4.4) |
| Precache suite red after edits | Run `gen-precache` last in each step |

## 11. Open questions (decided defaults in brackets)

1. Should `school` (the learn-to-sail lessons) be tilted on auto? [off]
2. Should `rib` be tilted on auto? [on]
3. Should the quick toggle persist into the setting? [no, it is a per-run override]
4. A separate tilt button, or a second function on the map button (long-press or cycle)? [separate adjacent button]
5. Should chase cam become a user setting later? [dev flag only now]

---

# Part 2: Implementation plan

Each step is independently verifiable and committable on `tilt-camera`. Every step ends with:
- `node tools/gen-precache.js`
- `node tools/run-tests.js`
- `node tools/tilt-golden.js` diffed against the base worktree (empty diff)
- a commit

Shell syntax below is bash (Git Bash). Never open a visible browser.

### Step 1: Projection core, tilted camera, 3D Zest/J70 prototype behind a dev flag [opus]

**Files**
- new `js/render/tilt.js`
- `js/render/scene.js`
- `js/render/sprites.js`
- `js/main.js` (`#tilt=on`, `#chase=1`)
- `index.html` (script tag before `scene.js`)
- `tools/test-core.js` (tilt tests 1–8, 10)
- new `tools/tilt-golden.js`
- `tools/playshot.js` (`KOS_TILT` env)
- `sw.js` (regenerated)

**Work**
- `KOS.Tilt` math: `project`, `unproject`, `boatMatrix`, `shadowMatrix`, `viewAABB`, `ease`, `PITCH`, `SUN`.
- Scene camera pitch state, easing and `biasY`. Pitched `applyWorld`, `worldToScreen` and `screenToWorld`; `project` and `upright`. Tilted view AABB and depth sort.
- Pass `opts.tilt` to `drawBoat`.
- `drawBoatTilted` for zest and j70: hull band, deck sprite, mast, boom, main, jib, crew as a simple upright, hull and sail shadows. Other classes fall back to flat.
- The dev flag `KOS.Tilt.force` (from the `#tilt=on` hash or the playshot env) makes `_tiltWant = 1` in every mode.

**Acceptance**
- All tilt unit tests pass.
- The golden diff is empty (tilt off unchanged).
- Tilted Zest and J70 show heel, sails on the correct (leeward) side, and a mast leaning to leeward.
- No console errors.

**Verify**
- `node tools/run-tests.js`
- `node tools/test-core.js tilt`
- `node tools/tilt-golden.js --root=../KOSGame-base > /tmp/base.txt; node tools/tilt-golden.js > /tmp/head.txt; diff /tmp/base.txt /tmp/head.txt`
- `KOS_TILT=on node tools/playshot.js sail.free.zest 390x844 6000 "ArrowRight:700" shot-tilt-zest-390.png`
- `KOS_TILT=on node tools/playshot.js sail.free.j70 1440x900 6000 "ArrowLeft:700" shot-tilt-j70-1440.png`
- `KOS_TILT=off node tools/playshot.js sail.free.zest 390x844 6000 "ArrowRight:700" shot-flat-zest-390.png`

### Step 2: All boat classes in 3D [opus]

**Files:** `js/render/sprites.js`, `tools/test-core.js` (optional `rigState` parity test if it is made Node-loadable)

**Work**
- `drawBoatTilted` for opti (sprit), tera, feva (gennaker plus pole), ilca, 29er (wings, trapeze, asym on sprit), hboat (sym spinnaker plus pole, keel), and RIB (tube band, console box, outboard post, driver).
- Keel or board on the high side. Raised board top. Windex. Highlight ring on the ground. Ghost alpha.
- The capsized fallback stays flat.
- Level gating of rig detail (§8).
- Extract `rigState` and `crewSeats` as pure moves.

**Acceptance**
- Every class in `GEO` renders tilted without falling back, except capsized boats.
- Spinnakers are visible when `boat.spinnaker` is set.
- The golden diff is empty.
- `race.29er.1` shows the trapeze crew outside the wings.

**Verify**
- `node tools/run-tests.js`
- `node tools/tilt-golden.js` diff (as step 1)
- `for c in opti tera feva ilca 29er hboat rib; do KOS_TILT=on node tools/playshot.js sail.free.$c 390x844 6000 "ArrowRight:700" shot-tilt-$c.png; done` (`sail.free.opti` and `sail.free.<ladder id>` exist)
- `KOS_TILT=on node tools/playshot.js race.29er.1 844x390 9000 "ArrowUp:400" shot-tilt-race29.png`
- `KOS_TILT=on node tools/playshot.js race.hboat.1 1440x900 9000 "" shot-tilt-raceh.png`

### Step 3: Marks, buoys, posts, shadows, water, haze [sonnet]

**Files:** `js/render/sprites.js` (`drawBuoy`, `drawMark`, `drawCommittee`, `drawFlag` under `opts.tilt`), `js/render/scene.js` (`drawLandLive` flagpole, `drawNight` glows, haze band, item cull margins), `js/render/water.js` and `js/render/effects.js` (level-gated counts and floating text under tilt), `js/modes/race.js:1116` (pass `tilt`)

**Work**
- Everything in the §4 table rows for buoys, marks, pin, committee, flagpole and lights.
- The §3.5 haze band.
- §8 water gating.
- Floating text via `upright`.

**Acceptance**
- Buoys stand upright with ground shadows along the sun.
- The committee boat has a mast and upright flags.
- The haze band appears only when tilted.
- At night, glows sit at light height.
- The golden diff is empty.

**Verify**
- `node tools/run-tests.js`
- golden diff
- `KOS_TILT=on node tools/playshot.js race.opti.1 390x844 9000 "" shot-tilt-marks.png`
- `KOS_TILT=on node tools/playshot.js nav.night 844x390 7000 "ArrowUp:500" shot-tilt-night.png`
- `KOS_TILT=on node tools/playshot.js nav.buoys 1440x900 6000 "" shot-tilt-buoys.png`

### Step 4: Setting, quick toggle, auto, i18n, reduced motion, perf fallback, chase dev flag [sonnet]

**Files:** `js/ui/storage.js`, `js/ui/app.js` (settings panel, `setupViewZoom` button and `T` key, `host.tilt` resolve, i18n da/en), `js/ui/ui.js` (`tilt` icon), `js/ui/track.js` (`WATCHED`, line 11), the 7 mode files (pass `tilt: host.tilt` to `SailScene`), `js/render/tilt.js` (`resolve`), `js/render/scene.js` (`_tiltWant` precedence, perf-drop rule, reduced-motion snap, chase cam), `css/game.css` (`.tilt-btn`), `tools/test-core.js` (`resolve` table test 9), `tools/playshot.js` (`KOS_TILT` now via settings), `tools/perf.js` (`--tilt`), `SPEC.md`, `docs/ARCHITECTURE.md`

**Acceptance**
- With the default `auto`, `race.opti.1` and `sail.free.zest` are tilted, and `rowschool.r10`, `nav.buoys` and `dock.zest.jetty` are flat.
- With `on`, all are tilted. With `off`, none are.
- The `T` key and the button flip the view with an eased transition (snapping under reduced motion).
- Overview (`M`) forces flat.
- `check-i18n` passes. No string contains "Coach".
- The golden diff is empty with `tilt:'off'`.

**Verify**
- `node tools/run-tests.js`
- `node tools/test-core.js tilt`
- `node tools/run-tests.js i18n`
- golden diff
- `node tools/playshot.js race.opti.1 390x844 6000 "" shot-auto-race.png` (expect tilted)
- `node tools/playshot.js rowschool.r10 390x844 6000 "" shot-auto-rules.png` (expect flat)
- `node tools/playshot.js sail.free.zest 1440x900 6000 "KeyT:100" shot-toggle.png` (expect flat after the toggle)
- `node tools/playshot.js screen:settings 390x844 1500 "" shot-settings.png`
- `node tools/perf.js sail.free.zest race.j70.1 race.29er.1 --rate=4 --tilt=off` vs `--tilt=on` (budget §8)

### Step 5: Overlays, labels, tags, hit-testing, `fit`, smoke tilted pass, docs [sonnet]

**Files:**
- `js/render/scene.js` (`pill`, `drawTags`, `drawLabels` gate, `drawMarkExtras`, `drawWindArrow` pill, k-corrected `fit`)
- the mode files in the §5 audit list (upright text in world overlays)
- `js/modes/rowschool.js` (tap tolerance if needed)
- `tools/smoke.js` (`file-tilt` pass with round-trip assert)
- `docs/MODE-AUTHORING.md` (`scene.upright`, `scene.project`, `scene._tilt`)

**Acceptance**
- In tilted view, name tags, the "DIG" tag, mark pills and mode texts are upright and unsquashed, and sit above the mast.
- The course fits in `race` at start.
- Tapping a boat in `rowschool.r10` with `tilt:'on'` selects the right boat (round trip ≤ 1e-6).
- The smoke test passes, including `file-tilt`.
- The golden diff is empty.
- `run-tests all` is green.

**Verify**
- `node tools/run-tests.js all`
- `node tools/smoke.js --no-shots --only=race`
- golden diff
- `KOS_TILT=on node tools/playshot.js rowschool.r10 390x844 6000 "" shot-tilt-rules.png`
- `KOS_TILT=on node tools/playshot.js race.feva.1 844x390 9000 "" shot-tilt-tags.png`
- `KOS_TILT=on node tools/playshot.js rib.tow 1440x900 7000 "ArrowUp:600" shot-tilt-rib.png`
- `KOS_TILT=on node tools/playshot.js dock.zest.jetty 390x844 6000 "" shot-tilt-dock.png`
