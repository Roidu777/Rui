// Captures headless : node dev/shoot.js --w 1720 --h 720 --out /tmp/shots --states idle,howl,swipe,hunt [--query "quality=high"]
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = +arg('w', 1720), H = +arg('h', 720), out = arg('out', '/tmp/ww-shots');
const states = arg('states', 'idle,howl,swipe,hunt').split(',');
const query = arg('query', '');
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?dev' + (query ? '&' + query : '') + '&events=0';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ww && window.__ww.state.t > 0.5, null, { timeout: 300000 });
  const snap = async name => { const f = path.join(out, name + '.png'); await page.screenshot({ path: f, timeout: 300000 }); console.log('shot', f); };
  for (const s of states) {
    if (s === 'idle') { await page.waitForTimeout(800); await snap('idle'); }
    else if (s === 'howl') { await page.evaluate(() => __ww.trigger('howl')); await page.waitForFunction(() => __ww.state.howl > 0.95, null, { timeout: 300000 }); await snap('howl'); await page.waitForFunction(() => __ww.state.howl < 0.01 && __ww.state.sniff < 0.01, null, { timeout: 300000 }); }
    else if (s === 'sniff') { await page.evaluate(() => __ww.trigger('howl')); await page.waitForFunction(() => __ww.state.sniff > 0.95, null, { timeout: 300000 }); await snap('sniff'); await page.waitForFunction(() => __ww.state.howl < 0.01 && __ww.state.sniff < 0.01 && __ww.state.t > 0, null, { timeout: 300000 }); }
    else if (s === 'swipe') { await page.evaluate(() => __ww.trigger('swipe')); await page.waitForFunction(() => __ww.state.swipe > 0.3, null, { timeout: 300000 }); await snap('swipe'); }
    else if (s === 'duel') {
      await page.evaluate(() => __ww.trigger('duel'));
      for (const [name, at] of [['duel1-flaire', 1.3], ['duel2-remarque', 2.8], ['duel3-gronde', 3.6], ['duel4-bond', 5.2], ['duel5-rugit', 6.3], ['duel6-recule', 8.2]]) {
        await page.waitForFunction(x => __ww.state.duel.t > x, at, { timeout: 900000 }); await snap(name);
      }
      await page.waitForFunction(() => __ww.state.duel.t < 0, null, { timeout: 900000 });
    }
    else if (s === 'flex') { await page.evaluate(() => __ww.trigger('flex')); await page.waitForFunction(() => __ww.state.flex > 0.95, null, { timeout: 300000 }); await snap('flex'); }
    else if (s === 'hunt') { await page.evaluate(() => __ww.set({ mode: 'hunt' })); await page.waitForFunction(() => __ww.state.hunt > 0.97, null, { timeout: 400000 }); await snap('hunt'); await page.evaluate(() => __ww.set({ mode: 'zaun' })); }
    else if (s.startsWith('pointer')) { await page.mouse.move(s.endsWith('L') ? 5 : W - 5, H / 2); await page.waitForTimeout(2500); await snap(s); }
  }
  const stats = await page.evaluate(() => __ww.stats());
  console.log('stats', JSON.stringify(stats));
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 20) requestAnimationFrame(f); else r((n / (performance.now() - t0) * 1000).toFixed(1)); }; requestAnimationFrame(f); }));
  console.log('swiftshader fps (indicatif seulement)', fps);
  console.log(errors.length ? 'console:\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'console: aucune erreur');
  await browser.close();
})().catch(e => { console.error('ECHEC', e.message); process.exit(1); });
