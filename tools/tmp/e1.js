(() => {
const v = KOS.World.get('harbor'); const out = [];
let t0 = performance.now(); for (let i = 0; i < 1000; i++) KOS.World.depthAt(v, 700 + i % 50, -300 - i % 70); out.push('depthAt x1000 ' + (performance.now() - t0).toFixed(1));
t0 = performance.now(); for (let i = 0; i < 1000; i++) KOS.World.isSolid(v, 700 + i % 50, -300 - i % 70); out.push('isSolid x1000 ' + (performance.now() - t0).toFixed(1));
out.push('depth polys ' + v.depth.length + ' pts ' + v.depth.map(z => z.poly.length).join(','));
out.push('coast pts ' + v.land[0].length);
KOS.Storage.saveSettings({ assist: 'easy', sound: false, unlockAll: true });
t0 = performance.now(); KOS.App.play('nav.buoys', { force: true }); out.push('play ' + (performance.now() - t0).toFixed(0));
const inst = KOS.App.run.inst; inst.setAutopilot(true); 
t0 = performance.now(); inst.skipIntro(); out.push('skip ' + (performance.now() - t0).toFixed(0));
t0 = performance.now(); inst.update(KOS.DT); out.push('upd1 ' + (performance.now() - t0).toFixed(0));
t0 = performance.now(); inst.update(KOS.DT); out.push('upd2 ' + (performance.now() - t0).toFixed(0));
t0 = performance.now(); inst.render(0); out.push('render ' + (performance.now() - t0).toFixed(0));
t0 = performance.now(); inst.render(0); out.push('render2 ' + (performance.now() - t0).toFixed(0));
return out.join('\n');
})()
