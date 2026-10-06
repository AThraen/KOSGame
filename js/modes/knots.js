// KØS SEJL — js/modes/knots.js
// The 'knots' mode (kind 'dom', hub area 'club'): tie real sailing knots by dragging the rope end along a glowing
// path. The rope is drawn as a thick, laid SVG rope with shadows where it crosses itself; every over/under is part of
// the path data (control points flagged 'o' over, 'u' under, 'f' in front of / 'b' behind a prop).
// Knots: ottetalsknob, pælestik, dobbelt halvstik, råbåndsknob, klampe, rundtørn og to halvstik + a speed round.
// Normal/Pro: after the guided round you tie the knot again with only a short piece of the path visible.
// Input: drag with finger/mouse (pointer events), or hold the arrow keys in the direction of the path.
// Test hooks: inst.setAutopilot(on), inst.skipIntro(), inst.debug.
(function (root) {
  const KOS = (root.KOS = root.KOS || {});
  const U = KOS.U;
  const t = (k, v) => KOS.t(k, v);
  const esc = s => (KOS.UI && KOS.UI.esc ? KOS.UI.esc(s) : String(s));

  // ======================================================================== 1. strings
  KOS.I18n.add('da', {
    knots: {
      k: {
        eight: { name: 'Ottetalsknob', use: 'Et stopperknob i enden af skødet, så det ikke smutter ud gennem blokken.',
          s1: 'Lav en løkke: før tampen op og ned OVER den faste part.', s2: 'Før tampen rundt BAG om den faste part.', s3: 'Stik tampen ned gennem løkken – over og under.' },
        bowline: { name: 'Pælestik', use: 'En fast løkke, der ikke strammer. Bruges til at fortøje og til redning.',
          s1: 'Kaninen kommer op af hullet …', s2: '… løber rundt om træet …', s3: '… og ned i hullet igen!' },
        clove: { name: 'Dobbelt halvstik', use: 'Hurtigt knob om en stang eller pæl – fx til fendere.',
          s1: 'Før tampen op foran stangen og over.', s2: 'Ned bag om stangen.', s3: 'Skråt op foran stangen – det bliver krydset.', s4: 'Ned bag om stangen igen.', s5: 'Stik tampen ind UNDER krydset.' },
        reef: { name: 'Råbåndsknob', use: 'Binder to ender af samme tykkelse sammen – fx når sejlet rebes. Husk: højre over venstre, venstre over højre.',
          s1: 'Før den blå tamp OVER den orange bugt og ind i den …', s2: '… rundt, og tilbage UNDER den orange bugt!' },
        cleat: { name: 'Klampe', use: 'Sådan gør du et tov fast på en klampe – skødet, fortøjningen, faldet.',
          s1: 'Rundtørn: før tovet rundt om klampens fod, under begge horn.', s2: 'Ottetal: skråt over klampen og under hornene.', s3: 'Låsestik: en sidste gang over – og tampen ind under sig selv.' },
        roundturn: { name: 'Rundtørn og to halvstik', use: 'Et stærkt knob til at fortøje båden til en pæl eller ring.',
          s1: 'Rundtørn: to gange rundt om pælen.', s2: 'Første halvstik: rundt om den faste part og ind under sig selv.', s3: 'Andet halvstik: præcis det samme én gang til.' },
      },
      label: { tree: 'Træet', hole: 'Hullet', rabbit: 'Kaninen', standing: 'Fast part', end: 'Tamp', block: 'Blok', post: 'Pæl', rail: 'Stang', cleat: 'Klampe', right: 'Højre', left: 'Venstre' },
      cross: { o: 'OVER', u: 'UNDER', f: 'FORAN', b: 'BAG OM' },
      ui: {
        step: 'Trin {n}/{of}', mistakes: 'Fejl', time: 'Tid', knot: 'Knob {n}/{of}',
        start: 'Slå knobet', again: 'Prøv uden spor', go: 'Kør!',
        drag: 'Træk tampen langs det lysende spor', keys: 'Tastatur: hold piletasterne i sporets retning',
        round2: 'Nu uden spor! Kun et lille stykke vises – kan du huske vejen?',
        speedTitle: 'Knob på tid', speedIntro: 'Slå {n} knob så hurtigt du kan. Uret kører!',
        tight: 'Stramt!', stepDone: 'Godt!', crossOk: '{c} ✓', slip: 'Hov – følg sporet!',
      },
      coach: {
        start: 'Tag fat i den lysende ende af tovet, og træk den langs sporet. Følg OVER og UNDER!',
        bowline: 'Husk historien: Kaninen kommer op af hullet, rundt om træet og ned i hullet igen.',
        slips: 'Gå lidt langsommere, og hold fingeren lige på sporet.',
        round2: 'Godt klaret! Nu skal du slå det igen – men sporet er næsten væk.',
        done: 'Flot knob! Det holder.',
        speed: 'Hurtige fingre! Følg sporet – fejl koster tid.',
      },
      res: { knot: '{name} slået med {m} fejl.', speed: '{n} knob på {time}.' },
      stat: { mistakes: 'Fejl', knots: 'Knob slået' },
    },
  });
  KOS.I18n.add('en', {
    knots: {
      k: {
        eight: { name: 'Figure-eight knot', use: 'A stopper knot at the end of the sheet, so it cannot run out through the block.',
          s1: 'Make a loop: bring the end up and down OVER the standing part.', s2: 'Take the end round BEHIND the standing part.', s3: 'Push the end down through the loop – over and under.' },
        bowline: { name: 'Bowline', use: 'A fixed loop that does not tighten. Used for mooring and rescue.',
          s1: 'The rabbit comes out of the hole …', s2: '… runs round the tree …', s3: '… and back down the hole!' },
        clove: { name: 'Clove hitch', use: 'A quick knot around a rail or post – e.g. for fenders.',
          s1: 'Bring the end up in front of the rail and over.', s2: 'Down behind the rail.', s3: 'Diagonally up across the front – that makes the cross.', s4: 'Down behind the rail again.', s5: 'Tuck the end UNDER the cross.' },
        reef: { name: 'Reef knot', use: 'Ties two ends of the same thickness together – e.g. when reefing the sail. Remember: right over left, left over right.',
          s1: 'Take the blue end OVER the orange bight and into it …', s2: '… round, and back UNDER the orange bight!' },
        cleat: { name: 'Cleat hitch', use: 'How to make a rope fast on a cleat – sheets, mooring lines, halyards.',
          s1: 'Round turn: take the rope round the base, under both horns.', s2: 'Figure-eight: diagonally over the cleat and under the horns.', s3: 'Locking hitch: one last time over – and the end under itself.' },
        roundturn: { name: 'Round turn & two half hitches', use: 'A strong knot for mooring the boat to a post or ring.',
          s1: 'Round turn: twice round the post.', s2: 'First half hitch: round the standing part and under itself.', s3: 'Second half hitch: exactly the same once more.' },
      },
      label: { tree: 'The tree', hole: 'The hole', rabbit: 'The rabbit', standing: 'Standing part', end: 'End', block: 'Block', post: 'Post', rail: 'Rail', cleat: 'Cleat', right: 'Right', left: 'Left' },
      cross: { o: 'OVER', u: 'UNDER', f: 'IN FRONT', b: 'BEHIND' },
      ui: {
        step: 'Step {n}/{of}', mistakes: 'Mistakes', time: 'Time', knot: 'Knot {n}/{of}',
        start: 'Tie the knot', again: 'Try without the path', go: 'Go!',
        drag: 'Drag the end along the glowing path', keys: 'Keyboard: hold the arrow keys in the direction of the path',
        round2: 'Now without the path! Only a little bit shows – can you remember the way?',
        speedTitle: 'Knots against the clock', speedIntro: 'Tie {n} knots as fast as you can. The clock is running!',
        tight: 'Tight!', stepDone: 'Good!', crossOk: '{c} ✓', slip: 'Oops – follow the path!',
      },
      coach: {
        start: 'Grab the glowing end of the rope and drag it along the path. Follow OVER and UNDER!',
        bowline: 'Remember the story: the rabbit comes out of the hole, round the tree and back down the hole.',
        slips: 'Go a little slower and keep your finger right on the path.',
        round2: 'Well done! Now tie it again – but the path is almost gone.',
        done: 'Great knot! That will hold.',
        speed: 'Quick fingers! Follow the path – mistakes cost time.',
      },
      res: { knot: '{name} tied with {m} mistakes.', speed: '{n} knots in {time}.' },
      stat: { mistakes: 'Mistakes', knots: 'Knots tied' },
    },
  });

  // ======================================================================== 2. knot data
  // Coordinates in board units (y down). A control point is [x, y, flag?, radius?]; flags: 'o' over, 'u' under
  // (rope-rope crossings), 'f' in front of the prop, 'b' behind the prop. `start` = index of the control point the
  // rope is already laid up to. Steps end at a control point index of the moving rope.
  const KNOTS = {
    eight: {
      props: [{ kind: 'block', x: 40, y: 150 }],
      ropes: [{ col: 'orange', start: 3, pts: [[-30, 150], [40, 150], [100, 150], [150, 150],
        [200, 150], [242, 132], [252, 95], [222, 66], [180, 74], [163, 108], [160, 150, 'o'], [152, 186],
        [128, 202], [104, 186], [108, 150, 'u'], [122, 114], [146, 98],
        [168, 100, 'o'], [198, 112], [220, 143, 'u'], [246, 182], [290, 200], [340, 204]] }],
      steps: [{ to: 11, key: 's1' }, { to: 16, key: 's2' }, { to: 22, key: 's3' }],
      labels: [{ x: 40, y: 196, key: 'block' }, { x: 96, y: 128, key: 'standing', ax: 96, ay: 146 }],
      tight: { cx: 190, cy: 140, r: 120, k: 0.74 },
      vb: [-10, 40, 370, 200],
    },
    bowline: {
      ropes: [{ col: 'orange', start: 18, pts: [[196, -40], [197, 30], [199, 80], [200, 108], [216, 126], [222, 150], [205, 170], [182, 162], [175, 135], [200, 108, 'o', 12],
        [228, 92], [252, 108], [263, 150], [256, 200], [232, 248], [188, 268], [148, 252], [132, 215], [140, 190],
        [156, 178], [180, 160, 'u'], [194, 140], [186, 121, 'o', 12], [178, 98], [184, 70],
        [190, 56], [198, 52, 'u'], [214, 54], [228, 72],
        [220, 96, 'o', 11], [212, 122, 'o', 11], [208, 146], [207, 168, 'u'], [210, 196], [206, 226]] }],
      steps: [{ to: 24, key: 's1' }, { to: 28, key: 's2' }, { to: 34, key: 's3' }],
      labels: [{ x: 140, y: 30, key: 'tree', ax: 192, ay: 26 }, { x: 290, y: 140, key: 'hole', ax: 228, ay: 140 }],
      rabbit: true,
      tight: { cx: 202, cy: 130, r: 100, k: 0.72 },
      vb: [90, 0, 230, 290],
    },
    clove: {
      props: [{ kind: 'rail', y0: 128, y1: 172, x0: 20, x1: 340 }],
      ropes: [{ col: 'orange', start: 2, pts: [[120, 330], [124, 260], [128, 200],
        [130, 172, 'f'], [132, 150, 'f'], [134, 128, 'f'], [142, 110],
        [150, 140, 'b'], [153, 165, 'b'], [160, 188],
        [174, 174, 'f'], [190, 150, 'f'], [206, 128, 'f'], [214, 110],
        [222, 140, 'b'], [224, 165, 'b'], [228, 190],
        [208, 202], [170, 182, 'u', 13], [150, 196], [146, 240], [148, 320]] }],
      steps: [{ to: 6, key: 's1' }, { to: 9, key: 's2' }, { to: 13, key: 's3' }, { to: 16, key: 's4' }, { to: 21, key: 's5' }],
      labels: [{ x: 290, y: 116, key: 'rail' }],
      tight: { cx: 178, cy: 150, r: 110, kx: 0.8, ky: 0.96 },
      vb: [40, 70, 290, 240],
    },
    reef: {
      ropes: [
        { col: 'orange', start: 10, pts: [[-30, 200], [60, 200], [170, 200], [240, 200], [282, 192], [300, 160], [282, 128], [240, 120], [170, 120], [90, 118], [40, 108]] },
        { col: 'blue', start: 1, pts: [[430, 180], [360, 180],
          [322, 180], [289, 180, 'o', 13], [240, 182], [170, 182], [128, 177], [107, 160],
          [118, 143], [160, 140], [240, 140], [289, 140, 'u', 13], [340, 140], [385, 128]] },
      ],
      steps: [{ rope: 1, to: 7, key: 's1' }, { rope: 1, to: 13, key: 's2' }],
      labels: [{ x: 30, y: 160, key: 'left' }, { x: 370, y: 205, key: 'right' }],
      tight: { cx: 200, cy: 160, r: 150, kx: 0.7, ky: 0.8 },
      vb: [0, 70, 400, 180], vbP: [50, 92, 300, 136],
    },
    cleat: {
      props: [{ kind: 'cleat', x: 200, y: 150 }],
      ropes: [{ col: 'white', start: 2, pts: [[0, 300], [70, 252], [130, 216],
        [210, 202], [262, 184], [284, 164, 'b'], [284, 136, 'b'], [256, 116], [200, 110], [144, 116], [116, 136, 'b'], [116, 164, 'b'], [146, 184],
        [175, 168], [200, 151, 'f'], [228, 132], [258, 124], [276, 138, 'b'], [276, 162, 'b'], [252, 176],
        [224, 168], [200, 152, 'f'], [172, 132], [142, 124], [124, 140, 'b'], [124, 160, 'b'], [146, 174],
        [172, 166], [200, 150, 'f'], [226, 134], [246, 128], [262, 146, 'b'], [244, 160], [217, 141, 'u', 10], [198, 126], [184, 114]] }],
      steps: [{ to: 12, key: 's1' }, { to: 26, key: 's2' }, { to: 35, key: 's3' }],
      labels: [{ x: 330, y: 110, key: 'cleat', ax: 296, ay: 146 }],
      tight: { cx: 200, cy: 150, r: 120, kx: 0.97, ky: 0.94 },
      vb: [10, 70, 350, 220],
    },
    roundturn: {
      props: [{ kind: 'post', x0: 172, x1: 228, y0: 20, y1: 320 }],
      ropes: [{ col: 'orange', start: 2, pts: [[-30, 200], [60, 196], [124, 190],
        [168, 187], [190, 184, 'b', 12], [210, 180, 'b', 12], [229, 175], [214, 168, 'f', 12], [186, 158, 'f', 12], [171, 151], [190, 147, 'b', 12], [210, 143, 'b', 12], [229, 138], [214, 131, 'f', 12], [186, 121, 'f', 12], [170, 114],
        [140, 104], [104, 120], [98, 160], [100, 193, 'o', 12], [98, 222], [114, 232], [124, 212], [122, 190, 'u', 12], [116, 160], [100, 150, 'u', 11], [78, 150],
        [62, 166], [56, 196, 'o', 12], [54, 224], [70, 234], [80, 214], [78, 194, 'u', 12], [74, 168], [66, 158, 'u', 10], [40, 150], [14, 140]] }],
      steps: [{ to: 15, key: 's1' }, { to: 26, key: 's2' }, { to: 36, key: 's3' }],
      labels: [{ x: 270, y: 60, key: 'post', ax: 230, ay: 60 }],
      tight: { cx: 92, cy: 190, r: 80, k: 0.9 },
      vb: [0, 40, 300, 220],
    },
  };
  const ORDER = ['eight', 'bowline', 'clove', 'reef', 'cleat', 'roundturn'];

  const COLORS = {
    orange: { base: '#ff8a3a', dark: '#8f3a0e', stripe: '#c85a1c', light: '#ffd2a6', whip: '#1d2433' },
    blue: { base: '#3aa6f2', dark: '#123f70', stripe: '#1f72b8', light: '#c8ecff', whip: '#ffd25e' },
    white: { base: '#f1ece0', dark: '#7d7566', stripe: '#c9c0ae', light: '#ffffff', whip: '#e8323c', fleck: '#2b6cb0' },
  };
  const W = 13; // rope thickness in board units

  // ======================================================================== 3. activities
  const ACTS = [
    ['eight', 20, 1, { da: 'Ottetalsknob', en: 'Figure-eight knot' }, { da: 'Stopperknobet, der holder skødet i blokken.', en: 'The stopper that keeps the sheet in the block.' }],
    ['bowline', 21, 2, { da: 'Pælestik', en: 'Bowline' }, { da: 'Kaninen, hullet og træet – sømandens yndlingsknob.', en: 'The rabbit, the hole and the tree – the sailor’s favourite.' }],
    ['clove', 22, 2, { da: 'Dobbelt halvstik', en: 'Clove hitch' }, { da: 'Hurtigt knob om en stang – perfekt til fendere.', en: 'A quick knot around a rail – perfect for fenders.' }],
    ['reef', 23, 2, { da: 'Råbåndsknob', en: 'Reef knot' }, { da: 'Højre over venstre, venstre over højre.', en: 'Right over left, left over right.' }],
    ['cleat', 24, 3, { da: 'Klampe', en: 'Cleat hitch' }, { da: 'Gør skødet fast på klampen – rundtørn, ottetal, låsestik.', en: 'Make the line fast on a cleat – turn, figure-eights, lock.' }],
    ['roundturn', 25, 3, { da: 'Rundtørn og to halvstik', en: 'Round turn & two half hitches' }, { da: 'Fortøj båden sikkert til en pæl.', en: 'Moor the boat safely to a post.' }],
  ];
  KOS.Activities.add(ACTS.map(([k, order, diff, title, desc], i) => ({
    id: 'knots.' + k, mode: 'knots', area: 'club', order, boat: null, icon: 'knot', minutes: 2, difficulty: diff,
    unlock: i === 0 ? null : { after: 'knots.' + ACTS[i - 1][0] }, title, desc, params: { knots: [k] },
  })).concat([{
    id: 'knots.speed', mode: 'knots', area: 'club', order: 26, boat: null, icon: 'timer', minutes: 3, difficulty: 4,
    unlock: { after: 'knots.roundturn' },
    title: { da: 'Knob på tid', en: 'Knots against the clock' },
    desc: { da: 'Fire knob i træk – så hurtigt du kan!', en: 'Four knots in a row – as fast as you can!' },
    params: { knots: ['eight', 'bowline', 'clove', 'reef', 'cleat', 'roundturn'], speed: true, count: 4, seed: 5 },
  }]));

  KOS.Modes.register('knots', { kind: 'dom', create(host, activity) { return createKnots(host, activity); } });

  // ======================================================================== 4. geometry
  function catmull(p0, p1, p2, p3, s) {
    const s2 = s * s, s3 = s2 * s;
    const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
    return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
  }
  const FLAGZ = { o: 2, f: 2, u: 0, b: 0 };
  function buildRope(def) {
    const P = def.pts, n = P.length;
    const s = [], cp = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
      cp[i] = s.length;
      for (let k = 0; k < m; k++) s.push(catmull(p0, p1, p2, p3, k / m));
    }
    cp[n - 1] = s.length; s.push([P[n - 1][0], P[n - 1][1]]);
    const L = [0];
    for (let i = 1; i < s.length; i++) L[i] = L[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    const z = new Array(s.length).fill(1);
    const flags = [];
    P.forEach((p, i) => {
      if (!p[2]) return;
      const r = p[3] || 15, c = cp[i], Lc = L[c];
      for (let j = c; j >= 0 && Lc - L[j] <= r; j--) z[j] = FLAGZ[p[2]];
      for (let j = c; j < s.length && L[j] - Lc <= r; j++) z[j] = FLAGZ[p[2]];
      flags.push({ i, s: c, f: p[2], x: p[0], y: p[1] });
    });
    return { def, s, cp, L, z, flags, col: COLORS[def.col] || COLORS.orange, n: s.length };
  }
  function pointAt(R, p) { // fractional sample index → [x, y]
    const i = Math.max(0, Math.min(R.n - 1, Math.floor(p))), f = p - i;
    const a = R.s[i], b = R.s[Math.min(R.n - 1, i + 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  function arcAt(R, p) { const i = Math.max(0, Math.min(R.n - 1, Math.floor(p))), f = p - i; return R.L[i] + (R.L[Math.min(R.n - 1, i + 1)] - R.L[i]) * f; }
  function tangentAt(R, p) {
    const a = pointAt(R, Math.max(0, p - 1)), b = pointAt(R, Math.min(R.n - 1, p + 3));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  }
  const f1 = v => Math.round(v * 10) / 10;
  function dOf(pts) { let d = ''; for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + f1(pts[i][0]) + ' ' + f1(pts[i][1]); return d; }

  // diagonal strand lines across the rope (a laid, three-strand look), phase-locked to the arc length
  const LAY = 4.6;
  function layD(pts, arc0) {
    let d = '', acc = arc0, next = Math.ceil(arc0 / LAY) * LAY;
    const hw = W * 0.44;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const sl = Math.hypot(b[0] - a[0], b[1] - a[1]); if (sl < 1e-6) continue;
      const tx = (b[0] - a[0]) / sl, ty = (b[1] - a[1]) / sl, nx = -ty, ny = tx;
      while (next <= acc + sl) {
        const k = (next - acc) / sl, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
        d += 'M' + f1(x + nx * hw - tx * 2.6) + ' ' + f1(y + ny * hw - ty * 2.6) + 'L' + f1(x - nx * hw + tx * 2.6) + ' ' + f1(y - ny * hw + ty * 2.6);
        next += LAY;
      }
      acc += sl;
    }
    return d || 'M0 0';
  }
  // laid-rope piece: shadow, outline, base, strands, highlight
  function pieceSvg(pts, col, arc0, z) {
    if (pts.length < 2) return '';
    const d = dOf(pts);
    const off = (-arc0).toFixed(1);
    const sh = z >= 2 ? 'translate(2.5 4.5)' : z <= 0 ? 'translate(1 2)' : 'translate(2 3.5)';
    return '<g stroke-linecap="butt"><path d="' + d + '" transform="' + sh + '" stroke="rgba(5,10,25,' + (z >= 2 ? 0.55 : 0.4) + ')" stroke-width="' + (W + 5) + '" filter="url(#knBlur)"/>' +
      '<path d="' + d + '" stroke="' + col.dark + '" stroke-width="' + (W + 2.6) + '"/>' +
      '<path d="' + d + '" stroke="' + col.base + '" stroke-width="' + W + '"/>' +
      '<path d="' + d + '" stroke="' + col.light + '" stroke-width="' + (W * 0.55) + '" opacity=".28"/>' +
      '<path d="' + layD(pts, arc0) + '" stroke="' + col.stripe + '" stroke-width="1.7" opacity=".9"/>' +
      (col.fleck ? '<path d="' + d + '" stroke="' + col.fleck + '" stroke-width="' + (W * 0.3) + '" stroke-dasharray="1.2 13" stroke-dashoffset="' + off + '" stroke-linecap="butt" opacity=".8"/>' : '') +
      '<path d="' + d + '" transform="translate(-1.2 -1.8)" stroke="rgba(255,255,255,.38)" stroke-width="' + (W * 0.2) + '"/></g>';
  }
  function whipSvg(R, p, back) { // whipped rope end (tape) over the last few units
    const src = R.tight ? { s: R.tight, n: R.n } : R;
    const tip = pointAt(src, p), tg = tangentAt(src, Math.max(0, p - 2));
    const a = [tip[0] - tg[0] * (back || 7), tip[1] - tg[1] * (back || 7)];
    return '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(tip[0]) + ' ' + f1(tip[1]) + '" stroke="' + R.col.dark + '" stroke-width="' + (W + 3) + '"/>' +
      '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(tip[0]) + ' ' + f1(tip[1]) + '" stroke="' + R.col.whip + '" stroke-width="' + (W + 0.6) + '"/>' +
      '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(tip[0]) + ' ' + f1(tip[1]) + '" transform="translate(-1 -1.6)" stroke="rgba(255,255,255,.35)" stroke-width="2.4"/>';
  }

  function knotBounds(k) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    k.ropes.forEach(r => r.pts.forEach((p, i) => { if (i < r.start - 1 && r.start < r.pts.length - 1) return; if (i < r.pts.length - 6 && r.start >= r.pts.length - 1) return; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    const pad = 26;
    return [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
  }
  function propSvg(p) {
    switch (p.kind) {
      case 'block':
        return '<g transform="translate(' + p.x + ' ' + p.y + ')"><path d="M-14 -40 L14 -40 L10 -26 L-10 -26Z" fill="#9aa3b5" stroke="#1d2433" stroke-width="2"/>' +
          '<circle cx="0" cy="-48" r="7" fill="none" stroke="#c9ced8" stroke-width="4"/>' +
          '<rect x="-22" y="-28" width="44" height="56" rx="20" fill="#2b3346" stroke="#0d1321" stroke-width="2.5"/>' +
          '<rect x="-15" y="-22" width="30" height="44" rx="14" fill="#c9ced8"/><circle cx="0" cy="0" r="12" fill="#5c6478"/><circle cx="0" cy="0" r="4" fill="#e6e9f0"/>' +
          '<path d="M-15 -8 Q0 -16 15 -8" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2"/></g>';
      case 'rail':
        return '<g><rect x="' + p.x0 + '" y="' + (p.y0 + 6) + '" width="' + (p.x1 - p.x0) + '" height="' + (p.y1 - p.y0) + '" rx="' + ((p.y1 - p.y0) / 2) + '" fill="rgba(5,10,25,.4)" filter="url(#knBlur)"/>' +
          '<rect x="' + p.x0 + '" y="' + p.y0 + '" width="' + (p.x1 - p.x0) + '" height="' + (p.y1 - p.y0) + '" rx="' + ((p.y1 - p.y0) / 2) + '" fill="url(#knSteel)" stroke="#0d1321" stroke-width="2"/>' +
          '<rect x="' + (p.x0 + 8) + '" y="' + (p.y0 + 7) + '" width="' + (p.x1 - p.x0 - 16) + '" height="5" rx="2.5" fill="rgba(255,255,255,.55)"/></g>';
      case 'post': {
        const w = p.x1 - p.x0;
        return '<g><rect x="' + (p.x0 + 6) + '" y="' + p.y0 + '" width="' + w + '" height="' + (p.y1 - p.y0) + '" fill="rgba(5,10,25,.4)" filter="url(#knBlur)"/>' +
          '<rect x="' + p.x0 + '" y="' + p.y0 + '" width="' + w + '" height="' + (p.y1 - p.y0) + '" rx="6" fill="url(#knWood)" stroke="#2a1a0c" stroke-width="2.5"/>' +
          '<path d="M' + (p.x0 + 12) + ' ' + (p.y0 + 10) + ' V' + (p.y1 - 10) + ' M' + (p.x0 + 30) + ' ' + (p.y0 + 30) + ' V' + (p.y1 - 30) + ' M' + (p.x0 + 44) + ' ' + (p.y0 + 4) + ' V' + (p.y1 - 50) + '" stroke="rgba(40,20,5,.35)" stroke-width="1.5"/>' +
          '<rect x="' + (p.x0 - 4) + '" y="' + (p.y0 - 6) + '" width="' + (w + 8) + '" height="14" rx="5" fill="#3a3f4c" stroke="#0d1321" stroke-width="2"/></g>';
      }
      case 'cleat':
        return '<g transform="translate(' + p.x + ' ' + p.y + ')">' +
          '<path d="M-98 4 Q-60 -18 0 -16 Q60 -18 98 4 Q60 22 0 20 Q-60 22 -98 4Z" fill="rgba(5,10,25,.45)" filter="url(#knBlur)" transform="translate(3 6)"/>' +
          '<rect x="-40" y="-22" width="80" height="44" rx="14" fill="#5c6478" stroke="#0d1321" stroke-width="2"/>' +
          '<circle cx="-28" cy="0" r="4" fill="#9aa3b5"/><circle cx="28" cy="0" r="4" fill="#9aa3b5"/>' +
          '<path d="M-98 0 Q-96 -11 -60 -11 L60 -11 Q96 -11 98 0 Q96 11 60 11 L-60 11 Q-96 11 -98 0Z" fill="url(#knSteel)" stroke="#0d1321" stroke-width="2.2"/>' +
          '<path d="M-86 -5 Q-60 -8 0 -8 Q60 -8 86 -5" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.5" stroke-linecap="round"/></g>';
    }
    return '';
  }
  function bunnySvg() {
    return '<g class="knots-bunny"><ellipse cx="-6" cy="-24" rx="4.5" ry="13" fill="#fff" stroke="#c7b8b0" stroke-width="1.2" transform="rotate(-14 -6 -24)"/><ellipse cx="6" cy="-24" rx="4.5" ry="13" fill="#fff" stroke="#c7b8b0" stroke-width="1.2" transform="rotate(14 6 -24)"/>' +
      '<ellipse cx="-6" cy="-24" rx="2" ry="8" fill="#ffb3c1" transform="rotate(-14 -6 -24)"/><ellipse cx="6" cy="-24" rx="2" ry="8" fill="#ffb3c1" transform="rotate(14 6 -24)"/>' +
      '<circle cx="0" cy="-8" r="11" fill="#fff" stroke="#c7b8b0" stroke-width="1.2"/><circle cx="-4" cy="-10" r="1.8" fill="#1b2335"/><circle cx="4" cy="-10" r="1.8" fill="#1b2335"/>' +
      '<ellipse cx="0" cy="-5" rx="2.2" ry="1.6" fill="#ff8a9a"/><path d="M-3 -2 Q0 1 3 -2" fill="none" stroke="#1b2335" stroke-width="1"/></g>';
  }

  // ======================================================================== 5. the mode
  function sfx(name, o) { try { if (KOS.Audio) KOS.Audio.play(name, o); } catch (e) { /* optional */ } }

  function createKnots(host, activity) {
    const P = Object.assign({ knots: ['eight'], speed: false, count: 4, seed: 1 }, activity.params || {});
    const assist = host.assist || 'easy';
    const layer = host.layer;
    const tol = assist === 'easy' ? 34 : assist === 'pro' ? 18 : 25;      // how far (board units) the finger may stray
    const keySpeed = assist === 'easy' ? 170 : assist === 'pro' ? 125 : 145; // units/s with the arrow keys
    const memoryRound = !P.speed && assist !== 'easy';
    let list = P.knots.slice();
    if (P.speed) {
      let plays = 0;
      try { plays = (KOS.Storage.progress(activity.id) || {}).plays || 0; } catch (e) { /* optional */ }
      const rng = U.rng(P.seed * 977 + plays * 7907);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = list[i]; list[i] = list[j]; list[j] = x; }
      list = list.slice(0, assist === 'pro' ? Math.max(P.count, 5) : P.count);
    }

    const S = {
      phase: 'intro', ki: 0, round: 1, step: 0, time: 0, knotT: 0, mistakes: 0, knotMistakes: [], prog: 0, offPath: false,
      dragging: false, ptr: null, keys: { x: 0, y: 0 }, wrongKeyT: 0, idleT: 0, ropeSfxT: 0, auto: false,
      tightT: -1, finishT: -1, flagDone: {}, coachSlips: false, dirty: true, totalLen: 0, result: null, transT: -1,
    };
    let K = null, ropes = [], moving = null, steps = [];

    // ---- DOM
    const root_ = document.createElement('div');
    root_.className = 'knots-root' + (P.speed ? ' is-speed' : '');
    root_.innerHTML =
      '<div class="knots-top">' +
        '<div class="knots-title"><span class="knots-ico">' + KOS.UI.iconSvg(P.speed ? 'timer' : 'knot') + '</span><div><b class="knots-name"></b><small class="knots-sub"></small></div></div>' +
        '<div class="knots-stats"><div class="knots-stat"><span>' + esc(t('knots.ui.time')) + '</span><b class="knots-time">0:00.0</b></div>' +
        '<div class="knots-stat knots-stat-m"><span>' + esc(t('knots.ui.mistakes')) + '</span><b class="knots-m">0</b></div></div>' +
      '</div>' +
      '<div class="knots-board"><svg class="knots-svg" xmlns="http://www.w3.org/2000/svg">' +
        '<defs>' +
          '<filter id="knBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
          '<filter id="knGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
          '<linearGradient id="knSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f6"/><stop offset=".45" stop-color="#b9c0cc"/><stop offset="1" stop-color="#6c7486"/></linearGradient>' +
          '<linearGradient id="knWood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4f28"/><stop offset=".35" stop-color="#b07a43"/><stop offset=".7" stop-color="#9a6634"/><stop offset="1" stop-color="#5e3a1a"/></linearGradient>' +
        '</defs>' +
        '<g class="kn-under" fill="none" stroke-linecap="round" stroke-linejoin="round"></g>' +
        '<g class="kn-props"></g>' +
        '<g class="kn-mid" fill="none" stroke-linecap="round" stroke-linejoin="round"></g>' +
        '<g class="kn-over" fill="none" stroke-linecap="round" stroke-linejoin="round"></g>' +
        '<g class="kn-top"></g>' +
        '<g class="kn-guide" fill="none" stroke-linecap="round" stroke-linejoin="round"></g>' +
        '<g class="kn-labels"></g>' +
        '<g class="kn-tip"></g>' +
      '</svg><div class="knots-fx"></div></div>' +
      '<div class="knots-instr"><div class="knots-steps"></div><p class="knots-text"></p><p class="knots-hint"></p></div>' +
      '<div class="knots-overlay" hidden></div>';
    layer.appendChild(root_);
    const svg = root_.querySelector('.knots-svg');
    const G = { under: svg.querySelector('.kn-under'), props: svg.querySelector('.kn-props'), mid: svg.querySelector('.kn-mid'), over: svg.querySelector('.kn-over'),
      top: svg.querySelector('.kn-top'), guide: svg.querySelector('.kn-guide'), labels: svg.querySelector('.kn-labels'), tip: svg.querySelector('.kn-tip') };
    const elName = root_.querySelector('.knots-name'), elSub = root_.querySelector('.knots-sub');
    const elTime = root_.querySelector('.knots-time'), elM = root_.querySelector('.knots-m');
    const elSteps = root_.querySelector('.knots-steps'), elText = root_.querySelector('.knots-text'), elHint = root_.querySelector('.knots-hint');
    const overlay = root_.querySelector('.knots-overlay');
    const fxLayer = root_.querySelector('.knots-fx');
    const touchy = (root.matchMedia && root.matchMedia('(hover: none)').matches);

    // ---- knot setup
    function loadKnot(id) {
      K = KNOTS[id]; K.id = id;
      ropes = K.ropes.map(buildRope);
      steps = K.steps.map(s => ({ rope: s.rope || 0, to: s.to, key: s.key }));
      moving = ropes[steps[0].rope];
      ropes.forEach(R => { R.prog = R.cp[R.def.start]; R.tight = null; });
      S.step = 0; S.prog = moving.prog; S.flagDone = {}; S.tightT = -1; S.offPath = false; S.knotT = 0; S.idleT = 0;
      S.vbKey = '';
      fitView();
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      G.props.innerHTML = (K.props || []).map(propSvg).join('');
      G.labels.innerHTML = (K.labels || []).map(l => {
        const txt = esc(t('knots.label.' + l.key));
        const w = txt.length * 6.2 + 16;
        return '<g class="kn-label">' + (l.ax !== undefined ? '<path d="M' + l.x + ' ' + l.y + 'L' + l.ax + ' ' + l.ay + '" stroke="rgba(255,255,255,.55)" stroke-width="1.5" stroke-dasharray="3 3"/>' : '') +
          '<rect x="' + (l.x - w / 2) + '" y="' + (l.y - 10) + '" width="' + w + '" height="20" rx="10" fill="rgba(13,19,33,.75)" stroke="rgba(255,255,255,.25)"/>' +
          '<text x="' + l.x + '" y="' + (l.y + 4) + '" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">' + txt + '</text></g>';
      }).join('');
      elName.textContent = t('knots.k.' + id + '.name');
      S.dirty = true;
      updateInstr();
    }
    // keep the rope a friendly size: never more than ~2.5 px per board unit (big desktop screens get more margin)
    function fitView() {
      const r = svg.getBoundingClientRect();
      const vb = r.width < r.height * 0.95 && K.vb[2] > K.vb[3] * 1.1 ? (K.vbP || (K.vbP = knotBounds(K))) : K.vb; // phones in portrait: zoom in on the knot itself
      let x = vb[0], y = vb[1], w = vb[2], h = vb[3];
      if (r.width > 0 && r.height > 0) {
        const maxS = 2.5, s = Math.min(r.width / w, r.height / h);
        if (s > maxS) { const nw = r.width / maxS, nh = r.height / maxS; x -= (nw - w) / 2; y -= (nh - h) / 2; w = nw; h = nh; }
      }
      const key = [x, y, w, h].map(v => v.toFixed(1)).join(' ');
      if (key !== S.vbKey) { S.vbKey = key; svg.setAttribute('viewBox', key); }
      S.vbW = r.width; S.vbH = r.height;
    }
    function curStep() { return steps[S.step]; }
    function stepEnd() { const st = curStep(); return st ? ropes[st.rope].cp[st.to] : moving.n - 1; }

    function updateInstr() {
      const of = steps.length;
      elSteps.innerHTML = steps.map((s, i) => '<i class="' + (i < S.step ? 'done' : i === S.step ? 'cur' : '') + '">' + (i < S.step ? '✓' : i + 1) + '</i>').join('');
      const st = curStep();
      elText.textContent = st ? t('knots.k.' + K.id + '.' + st.key) : t('knots.ui.tight');
      elText.classList.remove('pop'); void elText.offsetWidth; elText.classList.add('pop');
      elHint.textContent = S.round === 2 ? t('knots.ui.round2') : (touchy ? t('knots.ui.drag') : t('knots.ui.drag') + ' · ' + t('knots.ui.keys'));
      elSub.textContent = P.speed ? t('knots.ui.knot', { n: S.ki + 1, of: list.length }) : t('knots.ui.step', { n: Math.min(S.step + 1, of), of });
    }

    // ---- drawing
    function drawRopes() {
      const items = [];
      ropes.forEach((R, ri) => {
        const end = R.prog;
        const ei = Math.floor(end);
        const pts = R.tight ? R.tight : R.s;
        let runStart = 0;
        for (let j = 1; j <= ei + 1; j++) {
          if (j > ei || R.z[j] !== R.z[runStart]) {
            const a = Math.max(0, runStart - 1), b = Math.min(j, ei);
            const seg = pts.slice(a, b + 1);
            if (j > ei && end > ei) seg.push(R.tight ? pts[Math.min(R.n - 1, ei + 1)] : pointAt(R, end));
            items.push({ z: R.z[runStart], ri, from: runStart, html: pieceSvg(seg, R.col, R.L[a], R.z[runStart]) });
            runStart = j;
          }
        }
        // whipped end on the working end (and on finished ropes)
        items.push({ z: R.z[Math.min(R.n - 1, ei)], ri, from: 1e6, html: whipSvg(R, end) });
      });
      items.sort((a, b) => a.z - b.z || a.ri - b.ri || a.from - b.from);
      let u = '', m = '', o = '';
      items.forEach(it => { if (it.z <= 0) u += it.html; else if (it.z === 1) m += it.html; else o += it.html; });
      G.under.innerHTML = u; G.mid.innerHTML = m; G.over.innerHTML = o;
      const blockProps = (K.props || []).filter(p => p.kind === 'block');
      G.top.innerHTML = blockProps.map(propSvg).join(''); // the block sits over the rope running through it
    }
    function drawGuide() {
      if (S.phase !== 'tie' || !moving) { G.guide.innerHTML = ''; return; }
      const R = moving, se = stepEnd();
      const a = Math.floor(S.prog);
      let ahead = R.n - 1;
      let fadeLen = 0;
      if (S.round === 2) { // memory round: only a short look-ahead
        const L0 = arcAt(R, S.prog);
        ahead = a; while (ahead < se && R.L[ahead] - L0 < 46) ahead++;
        fadeLen = 1;
      }
      const nowPts = R.s.slice(a, Math.min(se, ahead) + 1); nowPts.unshift(pointAt(R, S.prog));
      const laterPts = S.round === 2 ? [] : R.s.slice(se, R.n);
      let h = '';
      if (laterPts.length > 1) h += '<path d="' + dOf(laterPts) + '" stroke="rgba(255,255,255,.18)" stroke-width="4" stroke-dasharray="2 9"/>';
      if (nowPts.length > 1) {
        h += '<path d="' + dOf(nowPts) + '" stroke="rgba(255,214,120,.35)" stroke-width="' + (W + 10) + '" filter="url(#knGlow)"/>' +
          '<path class="kn-guide-dash" d="' + dOf(nowPts) + '" stroke="#fff6d8" stroke-width="4" stroke-dasharray="7 9"/>';
      }
      // target ring at the end of the step
      if (S.round === 1 || ahead >= se) { const e = R.s[se]; h += '<circle class="kn-target" cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="13" stroke="#3ee08f" stroke-width="3.5"/>'; }
      // over/under badges for crossings still ahead in this step
      let first = true, lastF = null;
      R.flags.forEach(fl => {
        if (fl.s <= S.prog + 1 || fl.s > se) return;
        if (lastF && lastF.f === fl.f && R.L[fl.s] - R.L[lastF.s] < 45) return;
        lastF = fl;
        if (S.round === 2 && fl.s > ahead + 12) return;
        const lbl = esc(t('knots.cross.' + fl.f));
        const w = lbl.length * 6.6 + 14;
        const tg = tangentAt(R, fl.s);
        const nx = -tg[1], ny = tg[0];
        const bx = fl.x + nx * 24, by = fl.y + ny * 24;
        const cls = 'kn-badge kn-badge-' + fl.f + (first ? ' next' : '');
        h += '<g class="' + cls + '" transform="translate(' + f1(bx) + ' ' + f1(by) + ')"><g class="kn-badge-in"><rect x="' + (-w / 2) + '" y="-10" width="' + w + '" height="20" rx="10"/><text y="4" text-anchor="middle">' + lbl + '</text></g></g>';
        first = false;
      });
      if (fadeLen) h = '<g opacity=".95">' + h + '</g>';
      G.guide.innerHTML = h;
    }
    function drawTip() {
      if (S.phase !== 'tie' || !moving) { G.tip.innerHTML = ''; return; }
      const p = pointAt(moving, S.prog);
      const off = S.offPath;
      let h = '<g transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ')">' +
        '<circle class="kn-tip-ring' + (off ? ' off' : '') + (S.dragging ? ' grab' : '') + '" r="17"/>';
      if (K.rabbit) h += bunnySvg();
      h += '</g>';
      // idle hand hint gliding along the path
      if (!S.dragging && S.idleT > 2.2 && S.round === 1) {
        const L0 = arcAt(moving, S.prog), k = ((S.idleT - 2.2) * 70) % 90;
        let j = Math.floor(S.prog); const se = stepEnd();
        while (j < se && moving.L[j] - L0 < k) j++;
        const hp = moving.s[j];
        h += '<g class="kn-hand" transform="translate(' + f1(hp[0] + 6) + ' ' + f1(hp[1] + 8) + ')" opacity="' + (k < 75 ? 1 : (90 - k) / 15).toFixed(2) + '">' +
          '<path d="M0 0 L0 -14 a3 3 0 0 1 6 0 V-6 h2 V-11 a3 3 0 0 1 6 0 V-4 h1 V-8 a3 3 0 0 1 6 0 V4 c0 8 -6 12 -12 12 c-5 0 -8 -3 -10 -6 L-8 2 a3 3 0 0 1 5 -4z" fill="#fff" stroke="#0d1321" stroke-width="1.6"/></g>';
      }
      G.tip.innerHTML = h;
    }

    // ---- floating feedback (DOM, positioned from board coords)
    function boardToLayer(x, y) {
      const m = svg.getScreenCTM(); const lr = fxLayer.getBoundingClientRect();
      if (!m) return { x: 0, y: 0 };
      return { x: m.a * x + m.c * y + m.e - lr.left, y: m.b * x + m.d * y + m.f - lr.top };
    }
    function floatText(x, y, text, kind) {
      const q = boardToLayer(x, y);
      const n = document.createElement('div');
      n.className = 'knots-float knots-float-' + (kind || 'good');
      n.textContent = text; n.style.left = q.x + 'px'; n.style.top = q.y + 'px';
      fxLayer.appendChild(n);
      n.addEventListener('animationend', () => n.remove());
    }
    function burst(x, y, n) {
      if (KOS.UI.reduced && KOS.UI.reduced()) return;
      const q = boardToLayer(x, y);
      for (let i = 0; i < (n || 12); i++) {
        const e = document.createElement('i');
        e.className = 'knots-spark';
        const a = (i / (n || 12)) * Math.PI * 2;
        e.style.left = q.x + 'px'; e.style.top = q.y + 'px';
        e.style.setProperty('--dx', (Math.cos(a) * (50 + (i % 3) * 22)).toFixed(0) + 'px');
        e.style.setProperty('--dy', (Math.sin(a) * (50 + (i % 2) * 22)).toFixed(0) + 'px');
        e.style.background = ['#ffd25e', '#3ee08f', '#49c6f2', '#ff7a3d'][i % 4];
        fxLayer.appendChild(e);
        e.addEventListener('animationend', () => e.remove());
      }
    }

    // ---- progress
    function advanceTo(target) {
      const se = stepEnd();
      if (moving.L[se] - arcAt(moving, target) < 8) target = se; // close enough to the step end: snap (finger lifted a hair early)
      target = Math.min(target, se);
      if (target <= S.prog) return;
      const before = S.prog;
      S.prog = target; moving.prog = target; S.dirty = true; S.idleT = 0;
      // crossings passed
      moving.flags.forEach(fl => {
        if (fl.s > before && fl.s <= target && !S.flagDone[fl.s]) {
          S.flagDone[fl.s] = true;
          const dup = S.lastFlag && S.lastFlag.f === fl.f && moving.L[fl.s] - moving.L[S.lastFlag.s] < 45;
          S.lastFlag = fl;
          if (dup) return;
          floatText(fl.x, fl.y - 18, t('knots.ui.crossOk', { c: t('knots.cross.' + fl.f) }), 'cross');
          sfx('pop', { pitch: fl.f === 'o' || fl.f === 'f' ? 1.35 : 0.9, vol: 0.5 });
        }
      });
      if (S.ropeSfxT <= 0) { sfx('rope', { vol: 0.22, pitch: 0.9 + Math.random() * 0.3 }); S.ropeSfxT = 0.28; }
      if (S.prog >= se - 0.01) completeStep();
    }
    function completeStep() {
      const e = moving.s[stepEnd()];
      S.step++;
      if (S.step >= steps.length) { finishKnot(); return; }
      floatText(e[0], e[1] - 20, t('knots.ui.stepDone'), 'good');
      sfx('rigClick', { pitch: 1.1 });
      burst(e[0], e[1], 8);
      const nr = ropes[curStep().rope];
      if (nr !== moving) { moving = nr; S.prog = nr.prog; }
      updateInstr();
      S.dirty = true;
    }
    function finishKnot() {
      S.phase = 'tight'; S.tightT = 0; S.dragging = false;
      updateInstr();
      sfx('knot');
      // precompute the tightened shape of every rope
      const tg = K.tight;
      ropes.forEach(R => {
        R.loose = R.s;
        R.tightTarget = R.s.map(p => {
          const dx = p[0] - tg.cx, dy = p[1] - tg.cy, d = Math.hypot(dx, dy);
          const w0 = U.clamp((tg.r - d) / (tg.r * 0.55), 0, 1), w = w0 * w0 * (3 - 2 * w0);
          const kx = 1 - (1 - (tg.kx || tg.k)) * w, ky = 1 - (1 - (tg.ky || tg.k)) * w;
          return [tg.cx + dx * kx, tg.cy + dy * ky];
        });
      });
      G.guide.innerHTML = ''; G.tip.innerHTML = '';
    }
    function afterTight() {
      const tg = K.tight;
      floatText(tg.cx, tg.cy - 40, t('knots.ui.tight'), 'big');
      burst(tg.cx, tg.cy, 16);
      sfx('star', { pitch: 1.1 });
      S.knotMistakes.push(S.mistakes - (S.mStart || 0)); S.mStart = S.mistakes;
      if (P.speed) {
        if (S.ki + 1 < list.length) { S.phase = 'trans'; S.transT = 0.9; }
        else endGame();
      } else if (memoryRound && S.round === 1) {
        S.phase = 'trans'; S.transT = 1.0;
      } else endGame();
    }
    function slip() {
      S.mistakes++; S.offPath = true; S.dirty = true;
      elM.textContent = S.mistakes;
      const st = root_.querySelector('.knots-stat-m'); st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump');
      sfx('bump', { vol: 0.5 });
      const p = pointAt(moving, S.prog);
      floatText(p[0], p[1] - 24, t('knots.ui.slip'), 'bad');
      if (S.mistakes >= 3 && !S.coachSlips) { S.coachSlips = true; KOS.UI.coach(t('knots.coach.slips'), { ms: 3800, pos: 'top' }); }
      if (P.speed) S.time += 1.5;
    }

    // ---- pointer input
    function toBoard(e) {
      const m = svg.getScreenCTM(); if (!m) return null;
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(m.inverse()); return [q.x, q.y];
    }
    function nearestAhead(p, maxArc) {
      const R = moving, se = stepEnd(), L0 = arcAt(R, S.prog);
      let best = -1, bd = 1e9;
      for (let j = Math.floor(S.prog); j <= se; j++) {
        if (R.L[j] - L0 > maxArc) break;
        const d = Math.hypot(R.s[j][0] - p[0], R.s[j][1] - p[1]);
        if (d < bd) { bd = d; best = j; }
      }
      return { j: best, d: bd };
    }
    function onDown(e) {
      if (S.phase !== 'tie') return;
      const p = toBoard(e); if (!p) return;
      const tip = pointAt(moving, S.prog);
      const dTip = Math.hypot(tip[0] - p[0], tip[1] - p[1]);
      const near = nearestAhead(p, 90);
      if (dTip < tol + 22 || near.d < tol) {
        S.dragging = true; S.ptr = p; S.offPath = false; S.dirty = true;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        sfx('tap', { vol: 0.4 });
        e.preventDefault();
      }
    }
    function onMove(e) { if (!S.dragging) return; const p = toBoard(e); if (p) S.ptr = p; e.preventDefault(); }
    function onUp() { if (S.dragging) { S.dragging = false; S.offPath = false; S.dirty = true; } }
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('lostpointercapture', onUp);

    function dragStep() {
      if (!S.dragging || !S.ptr) return;
      const near = nearestAhead(S.ptr, 110);
      if (near.d <= tol) {
        if (S.offPath) { S.offPath = false; S.dirty = true; }
        if (near.j > S.prog) advanceTo(near.j);
        return;
      }
      // pointer is further along the path than the window: let the tip catch up
      const far = nearestAhead(S.ptr, 260);
      if (far.d <= tol) { advanceTo(Math.min(far.j, S.prog + 40)); return; }
      const tip = pointAt(moving, S.prog);
      const dTip = Math.hypot(tip[0] - S.ptr[0], tip[1] - S.ptr[1]);
      if (!S.offPath && near.d > tol * 1.6 && dTip > tol * 1.4) slip();
    }

    // ---- keyboard input: hold arrows in the direction of the path
    const held = {};
    function onKey(e) {
      const down = e.type === 'keydown';
      const k = e.key;
      const map = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', a: 'l', d: 'r', w: 'u', s: 'd', A: 'l', D: 'r', W: 'u', S: 'd' };
      if (map[k]) { held[map[k]] = down; e.preventDefault(); }
      if (down && !e.repeat && (k === 'Enter' || k === ' ')) {
        if (S.phase === 'intro' || S.phase === 'between') { e.preventDefault(); const b = overlay.querySelector('.btn-primary'); if (b) b.click(); }
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    function keyStep(dt) {
      const kx = (held.r ? 1 : 0) - (held.l ? 1 : 0), ky = (held.d ? 1 : 0) - (held.u ? 1 : 0);
      if (!kx && !ky) { S.wrongKeyT = 0; return; }
      const l = Math.hypot(kx, ky), tg = tangentAt(moving, S.prog);
      const dot = (kx * tg[0] + ky * tg[1]) / l;
      if (dot > 0.3) {
        S.wrongKeyT = 0; S.offPath = false;
        const L0 = arcAt(moving, S.prog), want = L0 + keySpeed * dt * (0.55 + 0.45 * dot);
        let j = S.prog; while (j < moving.n - 1 && arcAt(moving, j) < want) j += 0.25;
        advanceTo(j);
      } else if (dot < -0.2) {
        S.wrongKeyT += dt;
        if (S.wrongKeyT > 0.35 && !S.offPath) slip();
      }
    }

    // ---- overlays
    function showIntro() {
      S.phase = 'intro';
      const id = list[S.ki];
      loadKnot(id);
      const preview = previewSvg(id);
      overlay.innerHTML = '<div class="knots-card glass">' +
        '<div class="knots-preview">' + preview + '</div>' +
        '<div class="knots-card-txt">' +
          (P.speed ? '<span class="knots-kicker">' + esc(t('knots.ui.speedTitle')) + '</span>' : '') +
          '<h2>' + esc(P.speed ? t('knots.ui.speedTitle') : t('knots.k.' + id + '.name')) + '</h2>' +
          '<p>' + esc(P.speed ? t('knots.ui.speedIntro', { n: list.length }) : t('knots.k.' + id + '.use')) + '</p>' +
          '<button type="button" class="btn btn-primary btn-big">' + KOS.UI.iconSvg('play') + '<span>' + esc(P.speed ? t('knots.ui.go') : t('knots.ui.start')) + '</span></button>' +
        '</div></div>';
      overlay.hidden = false;
      overlay.querySelector('.btn-primary').addEventListener('click', () => { sfx('click'); beginTie(); });
      drawRopes();
    }
    function previewSvg(id) {
      const k = KNOTS[id];
      const rs = k.ropes.map(buildRope);
      let u = '', m = '', o = '';
      rs.forEach(R => {
        let a = 0;
        for (let j = 1; j <= R.n; j++) {
          if (j === R.n || R.z[j] !== R.z[a]) {
            const html = pieceSvg(R.s.slice(Math.max(0, a - 1), Math.min(R.n, j + 1)), R.col, R.L[Math.max(0, a - 1)], R.z[a]);
            if (R.z[a] <= 0) u += html; else if (R.z[a] === 1) m += html; else o += html;
            a = j;
          }
        }
        o += whipSvg(R, R.n - 1);
      });
      return '<svg viewBox="' + k.vb.join(' ') + '" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke-linecap="round" stroke-linejoin="round">' + u + '</g>' +
        (k.props || []).map(propSvg).join('') + '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' + m + o + '</g></svg>';
    }
    function beginTie() {
      overlay.hidden = true; overlay.innerHTML = '';
      S.phase = 'tie'; S.dirty = true; S.idleT = 0;
      updateInstr();
      if (S.ki === 0 && S.round === 1) {
        if (P.speed) KOS.UI.coach(t('knots.coach.speed'), { ms: 3500, pos: 'top' });
        else if (K.id === 'bowline') KOS.UI.coach(t('knots.coach.bowline'), { ms: 6000, pos: 'top' });
        else KOS.UI.coach(t('knots.coach.start'), { ms: 5500, pos: 'top' });
      }
    }
    function startRound2() {
      S.round = 2; S.mistakes = 0; S.mStart = 0; elM.textContent = '0';
      loadKnot(list[S.ki]);
      overlay.innerHTML = '<div class="knots-card knots-card-sm glass"><div class="knots-card-txt"><h2>' + esc(t('knots.ui.again')) + '</h2><p>' + esc(t('knots.ui.round2')) + '</p>' +
        '<button type="button" class="btn btn-primary btn-big">' + KOS.UI.iconSvg('play') + '<span>' + esc(t('knots.ui.go')) + '</span></button></div></div>';
      overlay.hidden = false; S.phase = 'between';
      overlay.querySelector('.btn-primary').addEventListener('click', () => { sfx('click'); beginTie(); });
      KOS.UI.coach(t('knots.coach.round2'), { ms: 3500, pos: 'top' });
      drawRopes();
    }
    function nextSpeedKnot() {
      S.ki++;
      loadKnot(list[S.ki]);
      S.phase = 'tie'; S.dirty = true;
      sfx('whoosh', { vol: 0.5 });
    }

    function starsFor() {
      const m = P.speed ? S.mistakes : (S.knotMistakes.length ? Math.max.apply(null, S.knotMistakes) : S.mistakes);
      if (P.speed) {
        // reference time from the path lengths: kids drag roughly 110-150 units/s along a path
        const len = list.reduce((a, id) => a + KNOTS[id].ropes.reduce((b, r) => { const R = buildRope(r); return b + R.L[R.n - 1] - R.L[R.cp[r.start]]; }, 0), 0);
        const ref = len / (assist === 'easy' ? 85 : assist === 'pro' ? 135 : 110) + list.length * 2;
        const r = S.time / ref;
        return r <= 1 ? 3 : r <= 1.5 ? 2 : 1;
      }
      const th = assist === 'easy' ? [4, 9] : assist === 'pro' ? [0, 2] : [1, 4];
      return m <= th[0] ? 3 : m <= th[1] ? 2 : 1;
    }
    function endGame() {
      S.phase = 'done';
      const stars = starsFor();
      const totalM = S.knotMistakes.reduce((a, b) => a + b, 0);
      const score = Math.max(100, Math.round(1500 * list.length - totalM * 90 - S.time * 6));
      const res = { stars, score, timeMs: Math.round(S.time * 1000), success: true,
        stats: P.speed ? { 'knots.stat.knots': list.length, 'knots.stat.mistakes': totalM } : { 'knots.stat.mistakes': totalM } };
      if (P.speed) { res.msgKey = 'knots.res.speed'; res.msgVars = { n: list.length, time: KOS.UI.fmtTime(S.time * 1000) }; }
      else { res.msgKey = 'knots.res.knot'; res.msgVars = { name: t('knots.k.' + list[0] + '.name'), m: totalM }; }
      S.result = res;
      if (stars >= 3) { try { KOS.UI.confetti(); } catch (e) { /* ignore */ } sfx('win'); } else sfx('cheer', { vol: 0.5 });
      KOS.UI.coach(t('knots.coach.done'), { ms: 2500, pos: 'top', mood: 'wow' });
      // badge: all six knots tied
      try {
        const all = ORDER.every(id => ('knots.' + id) === activity.id || (KOS.Storage.progress('knots.' + id) || {}).done);
        if (all) KOS.Storage.award('all-knots');
      } catch (e) { /* optional */ }
      S.finishT = 1.6;
    }

    // ---- instance
    return {
      start() { showIntro(); },
      update(dt) {
        if (S.phase === 'tie') {
          S.time += dt; S.knotT += dt; S.idleT += dt; S.ropeSfxT -= dt;
          if (S.auto) {
            const L0 = arcAt(moving, S.prog); let j = S.prog;
            while (j < moving.n - 1 && arcAt(moving, j) < L0 + 420 * dt) j += 0.25;
            advanceTo(j);
          } else { dragStep(); keyStep(dt); }
        } else if (S.phase === 'tight') {
          S.tightT += dt;
          const k = U.clamp(S.tightT / 0.55, 0, 1), e = k < 0.7 ? (k / 0.7) * 1.08 : 1.08 - 0.08 * ((k - 0.7) / 0.3);
          ropes.forEach(R => { R.tight = R.loose.map((p, i) => [p[0] + (R.tightTarget[i][0] - p[0]) * e, p[1] + (R.tightTarget[i][1] - p[1]) * e]); });
          S.dirty = true;
          if (S.tightT >= 0.75) { S.phase = 'tightDone'; afterTight(); }
        } else if (S.phase === 'trans') {
          S.transT -= dt;
          if (S.transT <= 0) { if (P.speed) nextSpeedKnot(); else startRound2(); }
        } else if (S.phase === 'intro' || S.phase === 'between') {
          if (S.auto) beginTie();
        }
        if (S.phase === 'done' && S.finishT > 0) { S.finishT -= dt; if (S.finishT <= 0) host.finish(S.result); }
      },
      render() {
        if (K && ((S.fitT = (S.fitT || 0) - 1) <= 0)) { S.fitT = 20; const r = svg.getBoundingClientRect(); if (Math.abs(r.width - S.vbW) > 1 || Math.abs(r.height - S.vbH) > 1) fitView(); }
        if (S.dirty) { S.dirty = false; drawRopes(); }
        drawGuide(); drawTip();
        const tt = KOS.UI.fmtTime(S.time * 1000);
        if (elTime.textContent !== tt) elTime.textContent = tt;
      },
      destroy() {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        root_.remove();
      },
      pause() { S.dragging = false; for (const k in held) held[k] = false; },
      onResize() { if (K) fitView(); },
      resume() {},
      setAutopilot(on) { S.auto = !!on; },
      skipIntro() { if (S.phase === 'intro' || S.phase === 'between') beginTie(); },
      debug: { S, get K() { return K; }, get ropes() { return ropes; }, KNOTS },
    };
  }

  KOS.KnotsData = { KNOTS, ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
