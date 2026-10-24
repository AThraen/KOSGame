// KØS SEJL — js/render/spooky.js
// KOS.Spooky: friendly Halloween sprites shared by the Halloween level (js/modes/halloween.js), the race-mark pumpkins
// (js/render/sprites.js drawMark, only while KOS.Season 'halloween-deco' is open) and the hub map decorations (js/ui/hub.js).
// Canvas sprites are rendered once into small cached canvases and then drawn with drawImage (cheap on phones).
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const TAU = Math.PI * 2;
  const hasDoc = typeof document !== 'undefined';
  const cache = {};

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // jack-o'-lantern, front view, 64x64 sprite: ribbed orange body, green stem, glowing carved face
  function pumpkinSprite(lit) {
    const key = 'p' + (lit ? 1 : 0);
    if (cache[key]) return cache[key];
    if (!hasDoc) return null;
    const c = canvas(64, 64), x = c.getContext('2d');
    x.translate(32, 35);
    const ribs = [[-15, 13], [15, 13], [-7, 15], [7, 15], [0, 16]];
    for (const r of ribs) {
      const g = x.createRadialGradient(r[0] - 3, -6, 2, r[0], 0, 22);
      g.addColorStop(0, '#ffb04a'); g.addColorStop(0.6, '#f4791c'); g.addColorStop(1, '#b8460c');
      x.fillStyle = g; x.beginPath(); x.ellipse(r[0], 0, r[1], 22, 0, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(120,40,0,.45)'; x.lineWidth = 1.2; x.stroke();
    }
    x.fillStyle = '#3f7a2a'; x.beginPath(); x.moveTo(-3, -20); x.quadraticCurveTo(-2, -29, 5, -31); x.lineTo(6, -28); x.quadraticCurveTo(2, -26, 3, -20); x.closePath(); x.fill();
    const face = lit ? '#fff09a' : '#5a2a06';
    if (lit) { x.shadowColor = '#ffcc33'; x.shadowBlur = 8; }
    x.fillStyle = face;
    x.beginPath(); x.moveTo(-13, -4); x.lineTo(-5, -4); x.lineTo(-9, -11); x.closePath(); x.fill();      // eyes
    x.beginPath(); x.moveTo(13, -4); x.lineTo(5, -4); x.lineTo(9, -11); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(-2, 1); x.lineTo(2, 1); x.lineTo(0, -3); x.closePath(); x.fill();             // nose
    x.beginPath(); x.moveTo(-14, 5); x.quadraticCurveTo(0, 17, 14, 5); x.lineTo(9, 7); x.lineTo(7, 4); x.lineTo(3, 8); x.lineTo(0, 5); x.lineTo(-3, 8); x.lineTo(-7, 4); x.lineTo(-9, 7); x.closePath(); x.fill(); // grin
    cache[key] = c;
    return c;
  }

  // a pumpkin of radius r (world or px units, whatever ctx is in), bobbing a little
  function drawPumpkin(ctx, x, y, r, t, o) {
    const s = pumpkinSprite(!o || o.lit !== false); if (!s) return;
    const bob = o && o.still ? 0 : Math.sin((t || 0) * 2.2 + x * 0.7 + y * 0.3) * r * 0.06;
    ctx.drawImage(s, x - r * 1.15, y - r * 1.25 + bob, r * 2.3, r * 2.3);
  }

  // warm glow (use with globalCompositeOperation 'lighter')
  function glow(ctx, x, y, r, a, col) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = col || '255,150,40';
    g.addColorStop(0, 'rgba(' + c + ',' + a + ')'); g.addColorStop(0.35, 'rgba(' + c + ',' + a * 0.45 + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  // ghost boat = two 96x96 sprites: a pale glowing hull (top view, bow up, rotated with the course) and an upright
  // sheet ghost standing in it with a friendly "oo" face (always upright, so it reads as a ghost from any course)
  function ghostHull() {
    if (cache.gh) return cache.gh;
    if (!hasDoc) return null;
    const c = canvas(96, 96), x = c.getContext('2d');
    x.translate(48, 48);
    x.shadowColor = 'rgba(190,220,255,.9)'; x.shadowBlur = 10;
    x.fillStyle = 'rgba(215,232,255,.45)'; x.strokeStyle = 'rgba(240,248,255,.85)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -38); x.bezierCurveTo(15, -18, 15, 22, 10, 36); x.lineTo(-10, 36); x.bezierCurveTo(-15, 22, -15, -18, 0, -38); x.closePath(); x.fill(); x.stroke();
    cache.gh = c;
    return c;
  }
  function ghostSprite() {
    if (cache.g) return cache.g;
    if (!hasDoc) return null;
    const c = canvas(96, 96), x = c.getContext('2d');
    x.translate(48, 50);
    x.shadowColor = 'rgba(190,220,255,.9)'; x.shadowBlur = 8;
    x.fillStyle = 'rgba(250,252,255,.95)';
    x.beginPath(); x.moveTo(-20, 22); x.bezierCurveTo(-23, -14, -13, -34, 0, -34); x.bezierCurveTo(13, -34, 23, -14, 20, 22);
    for (let i = 0; i < 5; i++) { const x0 = 20 - i * 8; x.quadraticCurveTo(x0 - 2, 30, x0 - 4, 22); x.quadraticCurveTo(x0 - 6, 15, x0 - 8, 22); }
    x.closePath(); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#2b2f4a';
    x.beginPath(); x.ellipse(-7, -14, 3.4, 4.8, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(7, -14, 3.4, 4.8, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(0, -1, 4, 5.4, 0, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,150,190,.45)';
    x.beginPath(); x.ellipse(-12, -5, 3.4, 2, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(12, -5, 3.4, 2, 0, 0, TAU); x.fill();
    cache.g = c;
    return c;
  }
  // heading: the course on screen (rad); wob: small upright sway
  function drawGhost(ctx, x, y, size, heading, alpha, wob) {
    const h = ghostHull(), s = ghostSprite(); if (!h || !s) return;
    ctx.save(); ctx.globalAlpha = alpha == null ? 0.8 : alpha; ctx.translate(x, y);
    ctx.save(); ctx.rotate(heading || 0); ctx.drawImage(h, -size / 2, -size / 2, size, size); ctx.restore();
    ctx.rotate(wob || 0); ctx.drawImage(s, -size * 0.4, -size * 0.62, size * 0.8, size * 0.8);
    ctx.restore();
  }

  // ---- inline SVG for DOM decorations (hub map, banner). Static: no SMIL, no filters (see hub.js perf notes).
  const svg = {
    pumpkin: '<svg viewBox="-32 -34 64 62" aria-hidden="true"><g stroke="#8a3a08" stroke-width="1.2">' +
      '<ellipse cx="-14" cy="2" rx="13" ry="21" fill="#e8701a"/><ellipse cx="14" cy="2" rx="13" ry="21" fill="#e8701a"/><ellipse cx="-6" cy="2" rx="14" ry="22" fill="#f6862a"/><ellipse cx="6" cy="2" rx="14" ry="22" fill="#f6862a"/><ellipse cx="0" cy="2" rx="13" ry="22" fill="#fb9a3c"/></g>' +
      '<path d="M-3-19q0-9 8-11l1 3q-4 2-3 8z" fill="#3f7a2a"/>' +
      '<g fill="#ffe680"><path d="M-13-2h8l-4-7zM13-2h-8l4-7zM-2 3h4l-2-4z"/><path d="M-14 7q14 13 28 0l-5 2-2-3-4 4-3-3-3 3-4-4-2 3z"/></g></svg>',
    bat: '<svg viewBox="-30 -14 60 26" aria-hidden="true"><path d="M0-4c3 0 4 2 4 4 4-6 10-9 18-8-4 3-4 6-2 9-4-2-8-1-10 2-2-3-5-4-8-3-1 2-1 4-2 5-1-1-1-3-2-5-3-1-6 0-8 3-2-3-6-4-10-2 2-3 2-6-2-9 8-1 14 2 18 8 0-2 1-4 4-4z" fill="#1d1430"/><circle cx="-1.5" cy="-1" r=".9" fill="#ffd25e"/><circle cx="1.5" cy="-1" r=".9" fill="#ffd25e"/></svg>',
    ghost: '<svg viewBox="-20 -24 40 46" aria-hidden="true"><path d="M-15 18v-20c0-12 7-20 15-20s15 8 15 20v20l-5-4-5 4-5-4-5 4-5-4z" fill="rgba(245,248,255,.9)" stroke="rgba(190,210,255,.9)" stroke-width="1.5"/><ellipse cx="-5" cy="-6" rx="2.6" ry="3.6" fill="#2b2f4a"/><ellipse cx="5" cy="-6" rx="2.6" ry="3.6" fill="#2b2f4a"/><ellipse cx="0" cy="3" rx="3" ry="3.6" fill="#2b2f4a"/></svg>',
    web: '<svg viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="rgba(235,235,255,.55)" stroke-width="1"><path d="M0 0L60 60M0 0L60 24M0 0L24 60M0 0L60 0M0 0L0 60"/><path d="M14 0q2 7 0 0M0 14q6 2 14 0M14 0Q12 9 14 14q-3 4-14 0"/><path d="M28 0q-3 14 3 21q-2 9-31 7"/><path d="M44 0q-5 24 5 33q-12 10-49 12"/><path d="M60 8q-12 22 0 46q-26 0-56 6"/></g></svg>',
  };

  KOS.Spooky = { pumpkinSprite, drawPumpkin, glow, ghostSprite, ghostHull, drawGhost, svg, deco() { return !!(KOS.Season && KOS.Season.on['halloween-deco']); } }; // state at the last Season.mark() (screen change)
})(typeof window !== 'undefined' ? window : globalThis);
