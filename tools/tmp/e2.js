(() => {
const out = []; const T = {};
const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally { const d = performance.now() - t0; T[label] = T[label] || [0, 0]; T[label][0] += d; T[label][1]++; } }; };
wrap(KOS.World, 'depthAt', 'depthAt'); wrap(KOS.World, 'isSolid', 'isSolid'); wrap(KOS.World, 'hit', 'hit');
wrap(KOS.Physics, 'step', 'step'); wrap(KOS.Physics, 'collide', 'collide'); wrap(KOS.Input, 'toControls', 'toControls');
wrap(KOS.AI, 'createHelm', 'createHelm');
KOS.Storage.saveSettings({ assist: 'easy', sound: false, unlockAll: true });
KOS.App.play('nav.buoys', { force: true });
const inst = KOS.App.run.inst; inst.setAutopilot(true); inst.skipIntro();
// wrap helm think
let t0 = performance.now(); inst.update(KOS.DT); out.push('upd1 ' + (performance.now() - t0).toFixed(0));
out.push(JSON.stringify(T));
return out.join('\n');
})()
