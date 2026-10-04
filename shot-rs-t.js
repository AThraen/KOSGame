const { chromium } = require('playwright');
const cfgs = [['--disable-gpu','--disable-software-rasterizer'], ['--disable-gpu','--disable-gpu-compositing','--disable-software-rasterizer'], ['--use-angle=swiftshader','--use-gl=angle'], ['--single-process']];
(async () => { for (const args of cfgs) { try {
 const b = await chromium.launch({ headless: true, channel: 'chrome', args }); const p = await b.newPage();
 await p.setContent('<h1>hi</h1>');
 const n = await p.evaluate(() => new Promise(r => { let n=0; const f=()=>{n++; if(n<10) requestAnimationFrame(f); else r(n);}; requestAnimationFrame(f); setTimeout(()=>r(n), 3000); }));
 console.log(args.join(' '), 'raf', n); b.close().catch(()=>{}); } catch(e) { console.log('ERR', e.message.slice(0,100)); } }
 process.exit(0); })();
