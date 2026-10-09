// KØS SEJL — js/render/tilt.js
// KOS.Tilt: pure math for "Skrå visning", the tilted 2.5D camera (docs/specs/tilt-camera.md §3). No DOM.
// The projection is an affine (orthographic) pitch applied after the camera rotation:
//   u = dx*cr - dy*sr ; v = dx*sr + dy*cr            (dx,dy = world - camera; cr/sr = cos/sin(-rot))
//   X = cx + u*Z ;      Y = cy + v*Z*k - z*Z*s         (k = cos(pitch), s = sin(pitch), cx/cy = screen centre + biasY)
// A tilt object `t` (from makeTilt) carries { T, pitch, k, s, cr, sr, Z, camX, camY, cx, cy, ox, oy, shx, shy, dpr, perf }.
// cx/cy exclude shake (worldToScreen/screenToWorld); ox/oy = cx/cy + shake (drawing). With pitch 0 (k=1, s=0) project()
// reduces exactly to the legacy SailScene.worldToScreen. The scene only builds `t` when pitch >= PITCH_MIN.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const D = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); };

  const T = {
    PITCH: { portrait: 38 * D, phone: 32 * D, desk: 35 * D }, // base pitch P0 by viewport shape (§3.2), tunable
    PITCH_MIN: 2 * D,    // below this the frame takes the flat path (no 3D-rig pop)
    PITCH_MAX: 45 * D,   // cap: k >= 0.707, no division blow-up in the inverse
    SUN: { x: 0.20, y: 0.30 }, // world shadow offset per metre of height (light from NW, above), tunable
    BIAS: 0.06,          // chase-cam camera bias (fraction of h), §3.3
    ZOOM_MUL: 1.0,       // zoom multiplier under tilt (tunable, unused at 1)
    BUOY_SCALE: 1.0,     // size of the upright buoy / mark sprite under tilt (tunable)
    HMAX: 12,            // tallest upright thing (m): J70 mast + spinnaker head, for viewItems
    force: null,         // dev override: true/false bypasses the setting (#tilt=on, KOS_TILT, perf --tilt)
    chase: false,        // dev flag #chase=1 (chase cam, step 4)
  };

  // base pitch for a viewport (CSS px)
  T.basePitch = function (w, h) { return h > w * 1.15 ? T.PITCH.portrait : Math.min(w, h) < 600 ? T.PITCH.phone : T.PITCH.desk; };
  // zoom fade: far out (overview) reads as a map → pitch 0; normal play zoom (8..30 px/m) → full pitch
  T.zoomFade = function (ppmCss) { return smooth(1.5, 5, ppmCss); };
  // ease T toward want (0|1), ~0.6 s to 90%; snaps by direction only (invariant I2)
  T.ease = function (t, want, dt, snap) {
    if (snap) return want;
    t += (want - t) * (1 - Math.exp(-dt * 4));
    if (want === 0 && t < 0.002) return 0;
    if (want === 1 && t > 0.998) return 1;
    return t;
  };

  // auto mapping (§7.2): the activity modes that get the tilted view by default (race, free sailing, RIB); school, rowschool, nav, dock and DOM modes stay top-down
  const AUTO_ON = { race: 1, sail: 1, rib: 1 };
  // resolve the user setting ('off'|'on'|'auto') for an activity ({mode} or an id like 'race.opti.1') to a boolean; auto is off at perf level 0
  T.resolve = function (setting, activity, perfLevel) {
    if (setting === 'on') return true;
    if (setting !== 'auto') return false;
    if (perfLevel === 0) return false;
    const m = activity && typeof activity === 'object' ? activity.mode : String(activity || '').split('.')[0];
    return !!AUTO_ON[m];
  };

  // build (or refill `out`) the per-frame tilt object; null when the effective pitch < PITCH_MIN (incl. T === 0)
  // o: { T, cam:{x,y,zoom,rot}, w, h, biasY, dpr, shx, shy, perf }
  T.makeTilt = function (o, out) {
    const c = o.cam, P0 = T.basePitch(o.w, o.h), zf = T.zoomFade(c.zoom);
    const pitch = Math.min(T.PITCH_MAX, (o.T || 0) * P0 * zf);
    if (!(pitch >= T.PITCH_MIN)) return null;
    const t = out || {};
    t.T = o.T; t.zf = zf; t.pitch = pitch; t.k = Math.cos(pitch); t.s = Math.sin(pitch);
    t.cr = Math.cos(-(c.rot || 0)); t.sr = Math.sin(-(c.rot || 0)); t.Z = c.zoom; t.camX = c.x; t.camY = c.y;
    t.w = o.w; t.h = o.h; t.cx = o.w / 2; t.cy = o.h / 2 + (o.biasY || 0);
    t.shx = o.shx || 0; t.shy = o.shy || 0; t.ox = t.cx + t.shx; t.oy = t.cy + t.shy;
    t.dpr = o.dpr || 1; t.perf = o.perf == null ? 2 : o.perf;
    return t;
  };

  // world (x, y, z up) → screen CSS px (no shake). `out` optional.
  T.project = function (t, x, y, z, out) {
    const dx = x - t.camX, dy = y - t.camY, Z = t.Z;
    const u = dx * t.cr - dy * t.sr, v = dx * t.sr + dy * t.cr;
    out = out || {};
    out.x = t.cx + u * Z; out.y = t.cy + (v * Z * t.k - (z || 0) * Z * t.s);
    return out;
  };
  // camera-space depth v (metres; bigger = nearer the viewer = lower on screen)
  T.depth = function (t, x, y) { return (x - t.camX) * t.sr + (y - t.camY) * t.cr; };
  // screen CSS px → world, on the plane at height z (default 0). Exact inverse of project().
  T.unproject = function (t, X, Y, z, out) {
    const u = (X - t.cx) / t.Z, v = (Y - t.cy) / (t.Z * t.k) + (z || 0) * t.s / t.k;
    // un-rotate: cos(rot) = cr, sin(rot) = -sr
    out = out || {};
    out.x = t.camX + u * t.cr + v * t.sr; out.y = t.camY - u * t.sr + v * t.cr;
    return out;
  };

  // ground AABB of the screen (inverse-mapped corners), into `out`; bottom edge extended by extraPx (viewItems)
  function aabb(t, w, h, extraPx, out) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const p = aabb.p || (aabb.p = {});
    for (let i = 0; i < 4; i++) {
      T.unproject(t, i & 1 ? w : 0, i & 2 ? h + extraPx : 0, 0, p);
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    out = out || {}; out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
    return out;
  }
  T.viewAABB = function (t, w, h, out) { return aabb(t, w, h, 0, out); };
  // items: a post of height HMAX whose ground point is below the bottom edge can still show its top
  T.viewItemsAABB = function (t, w, h, out) { return aabb(t, w, h, T.HMAX * t.Z * t.s, out); };

  // Per-boat 2x3 screen matrix (CSS px, no shake) for boat-local (bx, by, bz): bow -y, starboard +x, z up.
  // Heel h > 0 heels to starboard (rotation about the boat's y axis), then heading, then project.
  // out = [a, b, c, d, e, f, tx, ty]:  X = a*bx + c*by + e*bz + tx ;  Y = b*bx + d*by + f*bz + ty
  // `cam` is unused (the tilt object carries the camera); kept for the spec signature.
  function fill(t, x0, y0, wx0, wy0, wz0, wx1, wy1, wz1, wx2, wy2, wz2, out) {
    const Z = t.Z, Zk = Z * t.k, Zs = Z * t.s, cr = t.cr, sr = t.sr;
    out[0] = Z * (wx0 * cr - wy0 * sr); out[1] = Zk * (wx0 * sr + wy0 * cr) - Zs * wz0;
    out[2] = Z * (wx1 * cr - wy1 * sr); out[3] = Zk * (wx1 * sr + wy1 * cr) - Zs * wz1;
    out[4] = Z * (wx2 * cr - wy2 * sr); out[5] = Zk * (wx2 * sr + wy2 * cr) - Zs * wz2;
    const dx = x0 - t.camX, dy = y0 - t.camY;
    out[6] = t.cx + Z * (dx * cr - dy * sr); out[7] = t.cy + Zk * (dx * sr + dy * cr);
    return out;
  }
  T.boatMatrix = function (cam, t, boat, heel, out) {
    out = out || new Float64Array(8);
    const H = boat.heading || 0, cH = Math.cos(H), sH = Math.sin(H), ch = Math.cos(heel || 0), sh = Math.sin(heel || 0);
    // W columns (world x, y, z per unit bx, by, bz), §3.4
    return fill(t, boat.x, boat.y, ch * cH, ch * sH, -sh, -sH, cH, 0, sh * cH, sh * sH, ch, out);
  };
  // shadow matrix P·S·W: a world point (wx,wy,wz) falls at (wx + wz*SUN.x, wy + wz*SUN.y, 0)
  T.shadowMatrix = function (cam, t, boat, heel, out) {
    out = out || new Float64Array(8);
    const H = boat.heading || 0, cH = Math.cos(H), sH = Math.sin(H), ch = Math.cos(heel || 0), sh = Math.sin(heel || 0), S = T.SUN;
    return fill(t, boat.x, boat.y, ch * cH - sh * S.x, ch * sH - sh * S.y, 0, -sH, cH, 0, sh * cH + ch * S.x, sh * sH + ch * S.y, 0, out);
  };
  // apply a boat matrix to a boat-local point
  T.apply = function (M, bx, by, bz, out) { out = out || {}; out.x = M[0] * bx + M[2] * by + M[4] * bz + M[6]; out.y = M[1] * bx + M[3] * by + M[5] * bz + M[7]; return out; };

  KOS.Tilt = T;
})(typeof window !== 'undefined' ? window : globalThis);
