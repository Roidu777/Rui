// Génère les images d'aperçu :
//   preview.jpg            carré 720×720 centré sur Warwick (vignette Wallpaper Engine / Workshop, < 500 Ko)
//   dev/preview-21x9.jpg   image pleine taille 3440×1440 pour la vitrine
// Usage : node dev/preview.js [--state idle|howl|sniff|swipe|flex|hunt] [--wait 4] [--size 720]
//                             [--w 3440 --h 1440] [--query "quality=ultra"] [--title]
// Rendu headless (SwiftShader, CPU) : compter 1 à 3 minutes en 3440×1440.
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes('--' + k);
const ROOT = path.resolve(__dirname, '..');
const W = +arg('w', 3440), H = +arg('h', 1440);
const STATE = arg('state', 'idle');   // silhouette compacte : lisible en vignette carrée
const WAIT = +arg('wait', 4);
const SIZE = +arg('size', 720);
const MAX_THUMB = 480 * 1024;      // Wallpaper Engine : 1 Mo maximum, < 500 Ko recommandé
const MAX_WIDE = 1600 * 1024;
const query = ['dev', 'events=0', 'camerasway=0', 'parallax=0', flag('title') ? 'showtitle=1' : '', arg('query', '')].filter(Boolean).join('&');
const url = 'file://' + path.join(ROOT, 'index.html') + '?' + query;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // On anime en petit (rapide sous SwiftShader), puis on passe en pleine taille juste avant la capture.
  const page = await browser.newPage({ viewport: { width: Math.round(W / 4), height: Math.round(H / 4) } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ww && window.__ww.state.t > 0.5, null, { timeout: 180000 });
  // Laisse la brume, les particules et la lumière se stabiliser (temps de la scène, pas temps réel).
  await page.waitForFunction(s => __ww.state.t > s, WAIT, { timeout: 600000 });

  const S = STATE;
  if (S === 'howl') { await page.evaluate(() => __ww.trigger('howl')); await page.waitForFunction(() => __ww.state.howl > 0.95, null, { timeout: 600000 }); }
  else if (S === 'sniff') { await page.evaluate(() => __ww.trigger('howl')); await page.waitForFunction(() => __ww.state.sniff > 0.95, null, { timeout: 600000 }); }
  else if (S === 'swipe') { await page.evaluate(() => __ww.trigger('swipe')); await page.waitForFunction(() => __ww.state.swipe > 0.3, null, { timeout: 600000 }); }
  else if (S === 'flex') { await page.evaluate(() => __ww.trigger('flex')); await page.waitForFunction(() => __ww.state.flex > 0.95, null, { timeout: 600000 }); }
  else if (S === 'hunt') { await page.evaluate(() => __ww.set({ mode: 'hunt' })); await page.waitForFunction(() => __ww.state.hunt > 0.97, null, { timeout: 600000 }); }

  await page.setViewportSize({ width: W, height: H });
  await page.evaluate(() => new Promise(r => { const t0 = __ww.state.t; const f = () => (__ww.state.t > t0 + 0.08 ? r() : requestAnimationFrame(f)); f(); }));

  // Où est Warwick à l'écran ? (centre du carré de la vignette)
  // Milieu horizontal de sa silhouette projetée (boîte englobante du groupe placé à l'origine par main.js),
  // sinon milieu tête/pieds.
  const cx = await page.evaluate(() => {
    const { THREE, camera, state, scene } = __ww;
    const wolf = scene.children.find(o => o.isGroup && o.position.lengthSq() < 1e-6 && Math.abs(o.rotation.y + 0.45) < 1e-3);
    if (wolf) {
      const box = new THREE.Box3().setFromObject(wolf);
      if (!box.isEmpty() && box.max.y - box.min.y < 6) {
        let lo = 1, hi = -1; const v = new THREE.Vector3();
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
          lo = Math.min(lo, v.x); hi = Math.max(hi, v.x);
        }
        return ((lo + hi) / 2) * 0.5 + 0.5;
      }
    }
    const head = state.headPos.clone().project(camera);
    const feet = new THREE.Vector3(0, 0, 0).project(camera);
    return ((head.x + feet.x) / 2 * 0.5 + 0.5);
  });

  const stats = await page.evaluate(() => __ww.stats());
  // Fige la boucle via la vraie API de pause (sinon chaque capture attend une image de plusieurs secondes).
  await page.evaluate(() => window.wallpaperPropertyListener && window.wallpaperPropertyListener.setPaused(true));
  const wide = await page.screenshot({ type: 'png', timeout: 300000 });
  await browser.close();

  // Encodage JPEG et recadrage dans une page vierge (aucun outil externe nécessaire).
  const b2 = await chromium.launch();
  const p2 = await b2.newPage();
  const encode = async (png, sx, sy, sw, sh, dw, dh, maxBytes) => {
    return p2.evaluate(async ({ src, sx, sy, sw, sh, dw, dh, maxBytes }) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = dw; c.height = dh;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      let q = 0.92, out;
      do { out = c.toDataURL('image/jpeg', q); q -= 0.04; } while (out.length * 0.75 > maxBytes && q > 0.5);
      return { data: out.split(',')[1], q: +(q + 0.04).toFixed(2) };
    }, { src: 'data:image/png;base64,' + png.toString('base64'), sx, sy, sw, sh, dw, dh, maxBytes });
  };
  const side = Math.min(W, H);
  const sx = Math.round(Math.min(W - side, Math.max(0, cx * W - side / 2)));
  const thumb = await encode(wide, sx, 0, side, side, SIZE, SIZE, MAX_THUMB);
  const full = await encode(wide, 0, 0, W, H, W, H, MAX_WIDE);
  await b2.close();

  const fThumb = path.join(ROOT, 'preview.jpg');
  const fWide = path.join(ROOT, 'dev', 'preview-21x9.jpg');
  fs.writeFileSync(fThumb, Buffer.from(thumb.data, 'base64'));
  fs.writeFileSync(fWide, Buffer.from(full.data, 'base64'));
  const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' Ko';
  console.log('aperçu', fThumb, SIZE + '×' + SIZE, 'q' + thumb.q, kb(fThumb), '(Warwick à ' + (cx * 100).toFixed(0) + ' % de la largeur)');
  console.log('vitrine', fWide, W + '×' + H, 'q' + full.q, kb(fWide));
  console.log('rendu', W + '×' + H, ': appels de dessin', stats.calls, '· triangles', stats.triangles, '· programmes', stats.programs);
  if (errors.length) console.log('console :\n' + [...new Set(errors)].slice(0, 10).join('\n'));
})().catch(e => { console.error('ECHEC', e.message); process.exit(1); });
