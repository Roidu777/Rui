/* Décor de Zaun — bas-fonds, lumières, brouillard, sol mouillé, puits de lumière, particules.
   Contrat : CONTRACT.md. Tout est procédural (canvas + géométrie fusionnée par matériau), aucun téléchargement.
   Repères : Warwick à l'origine ; la caméra regarde vers -Z ; le canyon de Zaun s'enfonce vers la gauche (axe CU). */
(() => {
'use strict';
const WW = window.WW = window.WW || {};

WW.createEnvironment = function (THREE, scene, opts) {
const PI = Math.PI, TAU = PI * 2;
let seed = 20517;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();
const chance = p => rnd() < p;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lin = (r, g, b) => new THREE.Color(r, g, b);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let quality = opts.quality || { name: 'high', particles: 1, shadows: true };

/* ======================================================================
   Repères de mise en scène
   ====================================================================== */
// Caméra de référence figée : elle pilote le placement procédural (ne pas la modifier, sinon tout le tirage aléatoire
// du canyon change). VIEW = cadrage réel de main.js (CAM_POS, CAM_TARGET, fov, lensShift à 21:9) : sert à assombrir
// le coin des icônes (haut-gauche) sans toucher au tirage.
const REF = { pos: V3(1.25, 0.7, 7.25), target: V3(0, 1.5, 0), fov: 31, aspect: 2.389, shift: 0.29 };
const VIEW = { pos: V3(1.25, 0.7, 7.25), target: V3(0, 1.5, 0), fov: 29.5, aspect: 2.389, shift: 0.273 };
// Axe du canyon : part de la jonction derrière Warwick et s'enfonce vers la gauche de l'image.
const CA = 0.58;
const CU = V3(-Math.sin(CA), 0, -Math.cos(CA));   // vers le fond du canyon
const CV = V3(Math.cos(CA), 0, -Math.sin(CA));    // côté droit du canyon
const M0 = V3(-3.1, 0, -3.5);
const cw = (l, y, s) => V3(M0.x + CU.x * s + CV.x * l, y, M0.z + CU.z * s + CV.z * l);
// Lumière principale : vient de haut, derrière et à gauche (puits de lumière de Piltover).
const LDIR = V3(-0.55, 1.0, -0.75).normalize();
const KEY_TARGET = V3(0.2, 1.0, 0.4);

function makeCam(R) {
  const c = new THREE.PerspectiveCamera(R.fov, R.aspect, 0.1, 400);
  c.position.copy(R.pos); c.lookAt(R.target); c.updateMatrixWorld(true); c.updateProjectionMatrix();
  c.projectionMatrix.elements[8] -= R.shift;
  return c;
}
const refCam = makeCam(REF), viewCam = makeCam(VIEW);
const _sp = new THREE.Vector3(), SCR = { x: 0, y: 0 };
function screenOf(p, cam) {
  cam = cam || refCam;
  _sp.copy(p).applyMatrix4(cam.matrixWorldInverse);
  if (_sp.z > -0.2) return null;
  _sp.applyMatrix4(cam.projectionMatrix);
  SCR.x = _sp.x * 0.5 + 0.5; SCR.y = _sp.y * 0.5 + 0.5;
  return SCR;
}
// 1 = en plein dans la zone des icônes (haut-gauche), 0 = ailleurs. (Version figée : pilote le tirage.)
function calmness(p) {
  const s = screenOf(p);
  if (!s) return 0;
  return (1 - smooth(0.16, 0.34, s.x)) * smooth(0.3, 0.52, s.y);
}
// Même idée dans le cadrage réel, zone un peu plus large (marge pour la dérive de caméra et la parallaxe).
function calmView(p) {
  const s = screenOf(p, viewCam);
  return s ? (1 - smooth(0.2, 0.38, s.x)) * smooth(0.26, 0.5, s.y) : 0;
}

/* ======================================================================
   Uniforms partagés + GLSL commun
   ====================================================================== */
const U = {
  uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.03 },
  uChem: { value: new THREE.Color(0.49, 1, 0.31) }, uBlood: { value: new THREE.Color(1, 0.17, 0.17) },
  uHunt: { value: 0 }, uHowl: { value: 0 }, uBass: { value: 0 }, uHigh: { value: 0 }, uFlick: { value: 1 },
  uHead: { value: new THREE.Vector3(0, 2.4, 0.6) }, uViewH: { value: 1440 }, uDustT: { value: 99 },
  uShaftCol: { value: new THREE.Color() }, uLean: { value: new THREE.Vector2(LDIR.x / LDIR.y, LDIR.z / LDIR.y) },
};
// Bruit tuilable précalculé (une texture) : beaucoup moins cher que du bruit procédural par pixel.
function noiseTexture() {
  const S = 256, data = new Uint8Array(S * S * 4);
  const lattice = (n, sd) => { const a = new Float32Array(n * n); let k = sd; for (let i = 0; i < n * n; i++) { k = (k * 16807) % 2147483647; a[i] = k / 2147483647; } return a; };
  const vn = (L, n, x, y) => {
    const fx = x * n, fy = y * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
    const x0 = ix % n, y0 = iy % n, x1 = (ix + 1) % n, y1 = (iy + 1) % n;
    const a = L[y0 * n + x0], b = L[y0 * n + x1], c = L[y1 * n + x0], d = L[y1 * n + x1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const oct = [4, 8, 16, 32, 64].map((n, i) => ({ n, L: lattice(n, 1234 + i * 77) }));
  const g8 = [8, 16, 32].map((n, i) => ({ n, L: lattice(n, 999 + i * 31) }));
  const b32 = { n: 32, L: lattice(32, 4321) };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let r = 0, amp = 0.5, tot = 0; for (const o of oct) { r += vn(o.L, o.n, u, v) * amp; tot += amp; amp *= 0.5; } r /= tot;
    let g = 0; amp = 0.5; tot = 0; for (const o of g8) { g += vn(o.L, o.n, u, v) * amp; tot += amp; amp *= 0.5; } g /= tot;
    const i = (y * S + x) * 4;
    data[i] = Math.min(255, Math.max(0, (r - 0.5) * 1.7 * 255 + 128)); data[i + 1] = Math.min(255, Math.max(0, (g - 0.5) * 1.6 * 255 + 128));
    data[i + 2] = vn(b32.L, b32.n, u, v) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
U.uNoise = { value: noiseTexture() };
// « Cookie » de la lumière clé : la directionnelle n'éclaire le décor que dans les puits et autour de Warwick.
const NSHAFT = 5, KEYFEET = [];
for (let i = 0; i < NSHAFT; i++) KEYFEET.push(new THREE.Vector4(0, -999, 0, 0.001));
U.uKeyFeet = { value: KEYFEET }; U.uLdir = { value: LDIR.clone() }; U.uKeyAmb = { value: 0.025 };
U.uKeyPool = { value: new THREE.Vector4(0.45, 0.35, 2.5, 3.0) };
const KEYMASK = `
uniform vec4 uKeyFeet[${NSHAFT}]; uniform vec3 uLdir; uniform float uKeyAmb; uniform vec4 uKeyPool;
float keyMask(vec3 p){
  float m = uKeyAmb;
  for (int i = 0; i < ${NSHAFT}; i++) {
    vec3 d = p - uKeyFeet[i].xyz; vec3 pr = d - uLdir * dot(d, uLdir); float r = uKeyFeet[i].w;
    m += smoothstep(r * 1.9, r * 0.45, length(pr));
  }
  vec2 q = (p.xz - uKeyPool.xy) / uKeyPool.zw;
  m += smoothstep(1.0, 0.35, length(q)) * smoothstep(4.5, 2.5, p.y);
  return min(m, 1.0);
}
`;
const NOISE = `
uniform sampler2D uNoise;
float nzR(vec2 p){ return texture2D(uNoise, p).r; }
float nzG(vec2 p){ return texture2D(uNoise, p).g; }
float nzB(vec2 p){ return texture2D(uNoise, p).b; }
float puddle(vec2 xz){ return smoothstep(0.5, 0.6, nzR(xz * 0.085 + vec2(0.31, 0.17))); }
`;
const FOG = `uniform vec3 uFogColor; uniform float uFogDensity;
float fogF(float d){ float x = uFogDensity * d; return 1.0 - exp(-x * x); }`;
const OUT = `
#include <tonemapping_fragment>
#include <encodings_fragment>`;

/* ======================================================================
   Outils de géométrie : lots fusionnés (1 appel de dessin par matériau)
   ====================================================================== */
const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _q = new THREE.Quaternion();
const _eu = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = V3(0, 1, 0);
function M(x, y, z, rx, ry, rz, sx, sy, sz) {
  _eu.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_eu);
  _v.set(x, y, z); _s.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
  return _m4.compose(_v, _q, _s);
}
const ni = g => (g.index ? g.toNonIndexed() : g);
const G = {
  box: ni(new THREE.BoxGeometry(1, 1, 1)),
  boxSub: ni(new THREE.BoxGeometry(1, 1, 1, 3, 18, 1)), // façades : assez de sommets pour l'éclairage par sommet
  plane: ni(new THREE.PlaneGeometry(1, 1)),
  cyl5: ni(new THREE.CylinderGeometry(1, 1, 1, 5, 1)),
  cyl8: ni(new THREE.CylinderGeometry(1, 1, 1, 8, 1)),
  cyl12: ni(new THREE.CylinderGeometry(1, 1, 1, 12, 1)),
  cyl16: ni(new THREE.CylinderGeometry(1, 1, 1, 16, 1)),
  cyl16o: ni(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)),
  cone8: ni(new THREE.ConeGeometry(1, 1, 8, 1)),
  ico: ni(new THREE.IcosahedronGeometry(1, 0)),
  link: ni(new THREE.TorusGeometry(1, 0.28, 4, 8)),
};
class Batch {
  constructor(hdr, def) { this.hdr = !!hdr; this.def = def || null; this.P = []; this.N = []; this.C = []; this.F = hdr ? [] : null; }
  add(geo, m, c, fx, shade) {
    const pa = geo.attributes.position.array, na = geo.attributes.normal.array, e = m.elements;
    _n3.getNormalMatrix(m); const n = _n3.elements;
    for (let i = 0; i < pa.length; i += 3) {
      const x = pa[i], y = pa[i + 1], z = pa[i + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = na[i], b = na[i + 1], cc = na[i + 2];
      const nx = n[0] * a + n[3] * b + n[6] * cc, ny = n[1] * a + n[4] * b + n[7] * cc, nz = n[2] * a + n[5] * b + n[8] * cc;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      this.P.push(wx, wy, wz); this.N.push(nx / l, ny / l, nz / l);
      const k = (shade ? shade(wx, wy, wz) : 1) * (this.def ? this.def(wx, wy, wz) : 1);
      this.C.push(c.r * k, c.g * k, c.b * k);
      if (this.F) this.F.push(fx ? fx[0] : 0, fx ? fx[1] : 0, fx ? fx[2] : 0, fx ? fx[3] : 0);
    }
  }
  build(mat, name) {
    const g = new THREE.BufferGeometry(), nv = this.P.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    if (this.hdr) {
      g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.C, 3));
      g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.F, 4));
    } else {
      const N = new Int8Array(nv * 3), C = new Uint16Array(nv * 3);
      for (let i = 0; i < nv * 3; i++) { N[i] = Math.round(this.N[i] * 127); C[i] = Math.round(Math.min(1, Math.max(0, this.C[i])) * 65535); }
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
    }
    g.computeBoundingSphere();
    this.P = this.N = this.C = this.F = null;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name || ''; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
    return mesh;
  }
}
const I4 = new THREE.Matrix4();
// Cylindre (ou autre géométrie d'axe Y) entre deux points
function seg(batch, geo, a, b, r, c, fx, shade) {
  _d.subVectors(b, a); const len = _d.length() || 1e-4; _d.divideScalar(len);
  _q.setFromUnitVectors(UP, _d); _v.addVectors(a, b).multiplyScalar(0.5); _s.set(r, len, r);
  batch.add(geo, _m4.compose(_v, _q, _s), c, fx, shade);
}
// Repère local (façade, passerelle...) : F * M(...)
function frame(origin, ry) { return new THREE.Matrix4().makeRotationY(ry).setPosition(origin); }
function FM(F, x, y, z, rx, ry, rz, sx, sy, sz) { return _m4b.multiplyMatrices(F, M(x, y, z, rx, ry, rz, sx, sy, sz)); }
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3();
function fsegment(batch, geo, F, ax, ay, az, bx, by, bz, r, c, fx, shade) {
  _fa.set(ax, ay, az).applyMatrix4(F); _fb.set(bx, by, bz).applyMatrix4(F);
  seg(batch, geo, _fa, _fb, r, c, fx, shade);
}
function catenary(batch, a, b, sag, r, c, n) {
  const pts = [];
  n = n || 14;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t))); }
  const tube = ni(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, r, 4, false));
  batch.add(tube, I4, c);
  tube.dispose();
}

/* ======================================================================
   Textures procédurales (canvas)
   ====================================================================== */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
function deckTextures() {
  const S = 512, cA = canvas(S), cR = canvas(S), g = cA.getContext('2d'), r = cR.getContext('2d');
  g.fillStyle = '#2a2e31'; g.fillRect(0, 0, S, S);
  r.fillStyle = 'rgb(0,190,0)'; r.fillRect(0, 0, S, S);
  const plates = [[0, 0, 256, 256], [256, 0, 256, 128], [256, 128, 256, 128], [0, 256, 128, 256], [128, 256, 128, 256], [256, 256, 256, 256]];
  plates.forEach(([x, y, w, h], i) => {
    const v = 24 + rnd() * 14, tint = rnd();
    g.fillStyle = `rgb(${v + tint * 4 | 0},${v + 3 | 0},${v + 6 - tint * 4 | 0})`; g.fillRect(x, y, w, h);
    r.fillStyle = `rgb(0,${150 + rnd() * 70 | 0},0)`; r.fillRect(x, y, w, h);
    if (i === 0 || i === 5) { // tôle larmée
      g.strokeStyle = 'rgba(120,130,140,0.18)'; r.strokeStyle = 'rgba(0,200,0,0.5)'; g.lineWidth = r.lineWidth = 3;
      for (let yy = y + 10; yy < y + h; yy += 16) for (let xx = x + 8 + ((yy / 16) % 2) * 8; xx < x + w - 6; xx += 16) {
        const d = ((xx + yy) / 16) % 2 ? 1 : -1;
        g.beginPath(); g.moveTo(xx - 4, yy - 4 * d); g.lineTo(xx + 4, yy + 4 * d); g.stroke();
        r.beginPath(); r.moveTo(xx - 4, yy - 4 * d); r.lineTo(xx + 4, yy + 4 * d); r.stroke();
      }
    }
    // crasse et rouille
    for (let k = 0; k < 40; k++) {
      const px = x + rnd() * w, py = y + rnd() * h, rad = 4 + rnd() * 26, rust = rnd() < 0.35;
      const gr = g.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, rust ? 'rgba(96,46,18,0.32)' : 'rgba(8,10,10,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      if (rust) { r.fillStyle = 'rgba(0,230,0,0.3)'; r.beginPath(); r.arc(px, py, rad * 0.6, 0, TAU); r.fill(); }
    }
    // rayures
    g.strokeStyle = 'rgba(170,180,190,0.08)'; g.lineWidth = 1;
    for (let k = 0; k < 18; k++) { const px = x + rnd() * w, py = y + rnd() * h, a = rnd() * TAU, l = 10 + rnd() * 50; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); }
    // joints, chanfreins, rivets
    g.strokeStyle = '#07090a'; g.lineWidth = 5; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    r.strokeStyle = 'rgb(0,255,0)'; r.lineWidth = 5; r.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    g.strokeStyle = 'rgba(150,160,170,0.22)'; g.lineWidth = 1.2; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    for (let k = 14; k < w - 8; k += 30) for (const yy of [y + 11, y + h - 11]) rivet(g, x + k, yy);
    for (let k = 14; k < h - 8; k += 30) for (const xx of [x + 11, x + w - 11]) rivet(g, xx, y + k);
  });
  function rivet(c, x, y) {
    c.fillStyle = 'rgba(5,6,7,0.8)'; c.beginPath(); c.arc(x + 1, y + 1, 3.6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(140,150,158,0.55)'; c.beginPath(); c.arc(x - 0.6, y - 0.6, 2.4, 0, TAU); c.fill();
  }
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5);
    t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; return t;
  };
  return { map: mk(cA, true), rough: mk(cR, false) };
}
function grateTexture() {
  const S = 128, c = canvas(S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  for (let i = 0; i < S; i += 16) { g.fillRect(i, 0, 5, S); }
  for (let i = 0; i < S; i += 32) { g.fillRect(0, i, S, 4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/* ======================================================================
   Carte d'environnement (cube canvas) : ambiance + reflets du métal mouillé
   ====================================================================== */
const ENV_S = 64, envFaces = [];
for (let i = 0; i < 6; i++) envFaces.push(canvas(ENV_S));
const envCube = new THREE.CubeTexture(envFaces);
envCube.encoding = THREE.sRGBEncoding;
const _ec = new THREE.Color();
const css = (c, k) => `rgb(${Math.min(255, Math.pow(Math.max(0, c.r * k), 1 / 2.2) * 255) | 0},${Math.min(255, Math.pow(Math.max(0, c.g * k), 1 / 2.2) * 255) | 0},${Math.min(255, Math.pow(Math.max(0, c.b * k), 1 / 2.2) * 255) | 0})`;
const envSeedBase = 777;
function drawEnv(chem, hunt) {
  const sky = _ec.setRGB(0.022, 0.032, 0.05).lerp(lin(0.09, 0.02, 0.025), hunt);
  const skyCss = css(sky, 1), glowCss = css(chem, 0.04), midCss = css(chem, 0.008), deep = css(chem, 0.018);
  const shaftCss = css(lin(0.75, 0.85, 1).lerp(lin(1, 0.45, 0.45), hunt), 0.55);
  let s = envSeedBase; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let f = 0; f < 6; f++) {
    const g = envFaces[f].getContext('2d'), S = ENV_S;
    if (f === 2) { // +Y : dessous de Piltover, fentes de grilles froides
      g.fillStyle = skyCss; g.fillRect(0, 0, S, S);
      g.fillStyle = shaftCss;
      for (let i = 0; i < 7; i++) g.fillRect(r() * S, r() * S, 3 + r() * 8, 1.5);
      continue;
    }
    if (f === 3) { // -Y : lueur chimique de l'abîme
      const gr = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.7);
      gr.addColorStop(0, glowCss); gr.addColorStop(1, deep);
      g.fillStyle = gr; g.fillRect(0, 0, S, S); continue;
    }
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, skyCss); gr.addColorStop(0.45, midCss); gr.addColorStop(0.62, css(chem, 0.014)); gr.addColorStop(1, glowCss);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // puits de lumière lointains et fenêtres
    g.globalAlpha = 0.5; g.fillStyle = shaftCss;
    for (let i = 0; i < 2; i++) g.fillRect(r() * S, 0, 2 + r() * 3, S * (0.4 + r() * 0.3));
    g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) {
      const warm = r() < 0.5;
      g.fillStyle = warm ? css(lin(1, 0.55, 0.2).lerp(lin(1, 0.15, 0.1), hunt), 0.35) : css(chem, 0.3);
      g.fillRect(r() * S, S * (0.3 + r() * 0.45), 1, 1);
    }
  }
  envCube.needsUpdate = true;
}
drawEnv(U.uChem.value, 0);

/* ======================================================================
   Matériaux
   ====================================================================== */
// Crasse procédurale en coordonnées monde (rouille, coulures, zones mouillées), sans UV.
const DIR_STD = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
const DIR_LAM = 'getDirectionalDirectLightIrradiance( directionalLights[ i ], geometry, directLight );';
function keyUniforms(sh) { for (const k of ['uNoise', 'uKeyFeet', 'uLdir', 'uKeyAmb', 'uKeyPool']) sh.uniforms[k] = U[k]; }
const stdLights = () => '#include <lights_fragment_begin>';
const keyedStdLights = () => THREE.ShaderChunk.lights_fragment_begin.replace(DIR_STD, DIR_STD + '\n\t\tdirectLight.color *= keyMask(vWPos);');
const keyedLamLights = () => THREE.ShaderChunk.lights_lambert_vertex.replace(DIR_LAM, DIR_LAM + '\n\t\tdirectLight.color *= keyMask(vWPos);');
function grime(mat, rust, wet, key) {
  mat.defines = Object.assign({}, mat.defines, { GR_RUST: rust.toFixed(2), GR_WET: wet.toFixed(2) });
  const lambert = !!mat.isMeshLambertMaterial;
  mat.onBeforeCompile = sh => {
    keyUniforms(sh);
    sh.vertexShader = 'varying vec3 vWPos;\n' + (lambert ? KEYMASK : '') + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    if (lambert) sh.vertexShader = sh.vertexShader.replace('#include <lights_lambert_vertex>', keyedLamLights());
    else sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', keyedStdLights());
    sh.fragmentShader = 'varying vec3 vWPos;\n' + NOISE + (lambert ? '' : KEYMASK) + sh.fragmentShader
      .replace('void main() {', 'void main() {\n\tfloat grN = 0.5, grR = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
	grN = nzR(vWPos.xz * 0.0925 + vWPos.y * 0.0525);
	float grS = nzG(vec2((vWPos.x + vWPos.z) * 0.34, vWPos.y * 0.041));
	grR = smoothstep(0.55, 0.85, grN * 0.75 + grS * 0.45) * GR_RUST;
	diffuseColor.rgb *= 0.62 + 0.75 * grN * (0.75 + 0.5 * grS);
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.085, 0.035) * (0.5 + grS), grR);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = clamp(roughnessFactor + grR * 0.4 - (1.0 - grN) * GR_WET, 0.06, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'zaun-grime-' + key;
  return mat;
}
// Proche de Warwick : PBR complet (reflets de la carte d'environnement, ombres). Loin : Lambert éclairé par sommet
// (les grandes surfaces du canyon coûtent alors presque rien par pixel, même en 3440×1440).
const matNear = grime(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.5, roughness: 0.5, envMap: envCube, envMapIntensity: 0.9 }), 0.7, 0.35, 'near');
const matBack = grime(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.45, roughness: 0.55 }), 0.8, 0.35, 'back');
const matMetal = grime(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.8, 0, 'metal');
const matWall = grime(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.6, 0, 'wall');

// Lumières émissives (fenêtres, bandes chimiques, néons, ampoules) : un seul matériau, teinte suivant la palette.
const glowMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `
attribute vec3 aCol; attribute vec4 aFx; // x : part chimique, y : phase de clignotement, z : réaction aux basses, w : part sang (traque)
uniform float uTime, uHunt, uBass, uFlick; uniform vec3 uChem, uBlood;
varying vec3 vC; varying float vF;
${FOG}
float flick(float ph, float t){
  float k = floor(t * 7.0 + ph * 31.0);
  float r = fract(sin(k * 12.9898 + ph * 78.233) * 43758.5453);
  return r > 0.9 ? 0.12 + r * 0.2 : 0.88 + 0.12 * sin(t * 37.0 + ph * 9.0);
}
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vF = fogF(-mv.z);
  float lum = dot(aCol, vec3(0.3, 0.55, 0.15));
  vec3 c = mix(aCol, uChem * lum * 1.25, aFx.x);
  c = mix(c, uBlood * lum * 1.15, uHunt * aFx.w * (1.0 - aFx.x));
  if (aFx.y > 0.0) c *= flick(aFx.y, uTime);
  c *= (1.0 + aFx.z * uBass * 1.6) * mix(1.0, uFlick, aFx.w);
  vC = c;
}`,
  fragmentShader: `
uniform vec3 uFogColor; varying vec3 vC; varying float vF;
void main(){ gl_FragColor = vec4(mix(vC, uFogColor, vF), 1.0);${OUT}
}`,
});

/* ======================================================================
   Lots
   ====================================================================== */
const _cv = new THREE.Vector3();
const calmDark = (k) => (x, y, z) => { _cv.set(x, y, z); return 1 - k * Math.max(calmness(_cv), calmView(_cv)); };
const B = { metal: new Batch(false, calmDark(0.85)), back: new Batch(), near: new Batch(), wall: new Batch(false, calmDark(0.75)), glow: new Batch(true, calmDark(0.95)) };
// Couleurs (linéaires) — sombres : la lumière fait le travail
const C = {
  steel: lin(0.15, 0.16, 0.17), steelDark: lin(0.075, 0.08, 0.085), rustM: lin(0.2, 0.11, 0.07), brass: lin(0.36, 0.24, 0.11),
  rail: lin(0.13, 0.135, 0.14), pipe: lin(0.11, 0.12, 0.115), pipeG: lin(0.08, 0.1, 0.085), black: lin(0.025, 0.026, 0.028),
  walls: [lin(0.06, 0.066, 0.064), lin(0.075, 0.06, 0.05), lin(0.05, 0.058, 0.07), lin(0.066, 0.07, 0.056), lin(0.045, 0.048, 0.05)],
  amber: lin(1.0, 0.52, 0.18), warmW: lin(1.0, 0.72, 0.42), cold: lin(0.62, 0.8, 1.0), red: lin(1.0, 0.12, 0.1), mag: lin(0.95, 0.2, 0.55),
  glass: lin(0.012, 0.02, 0.024),
};
// fx : [chimique, clignote, basses, sang]
const FX_CHEM = [1, 0, 1, 0], FX_WARM = [0, 0, 0, 0.6], FX_COLD = [0, 0, 0, 0.45], FX_SIGN = [0, 0, 0.3, 1], FX_RED = [0, 0, 0.2, 1];
const fxFlick = (base, ph) => [base[0], ph, base[2], base[3]];
const halos = [];       // { p, c, size, chem, blood }
const vents = [];       // émetteurs de vapeur
function halo(p, c, size, chem, blood) { halos.push({ p: p.clone(), c, size, chem: chem || 0, blood: blood == null ? 0.6 : blood }); }
// Ombre de profondeur : plus sombre vers l'abîme
const abyss = (x, y) => 0.35 + 0.65 * smooth(-22, 4, y);

/* ======================================================================
   1. Plate-forme (jonction) : tôles, grilles lumineuses, flaques
   ====================================================================== */
const deckTex = deckTextures(), grateTex = grateTexture();
const DECK = [[-4.6, 12], [-4.6, -3.4], [-1.4, -3.4], [1.6, -8.6], [12, -8.6], [12, 12]];
const GRATES = [{ x: -1.15, z: 2.75, w: 1.9, d: 1.1, steam: true, glow: 0.4 }, { x: 2.15, z: -4.9, w: 1.5, d: 1.5 }, { x: -3.3, z: -1.6, w: 1.0, d: 1.4 }];
const deckShape = new THREE.Shape();
DECK.forEach(([x, z], i) => (i ? deckShape.lineTo(x, -z) : deckShape.moveTo(x, -z)));
for (const g of GRATES) {
  const h = new THREE.Path();
  h.moveTo(g.x - g.w / 2, -(g.z - g.d / 2)); h.lineTo(g.x + g.w / 2, -(g.z - g.d / 2)); h.lineTo(g.x + g.w / 2, -(g.z + g.d / 2)); h.lineTo(g.x - g.w / 2, -(g.z + g.d / 2));
  deckShape.holes.push(h);
}
const deckGeo = new THREE.ShapeGeometry(deckShape); deckGeo.rotateX(-PI / 2);
const floorMat = new THREE.MeshStandardMaterial({ map: deckTex.map, roughnessMap: deckTex.rough, metalness: 0.3, roughness: 1, envMap: envCube, envMapIntensity: 1.0 });
floorMat.onBeforeCompile = sh => {
  keyUniforms(sh);
  sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'varying vec3 vWPos;\n' + NOISE + KEYMASK + sh.fragmentShader.replace('#include <lights_fragment_begin>', keyedStdLights())
    .replace('#include <map_fragment>', `#include <map_fragment>
	float pud = puddle(vWPos.xz);
	float grime = nzG(vWPos.xz * 0.16);
	diffuseColor.rgb *= (0.7 + 0.6 * grime) * (1.0 - 0.55 * pud);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix(roughnessFactor * 0.85, 0.035, pud);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	metalnessFactor = mix(metalnessFactor, 0.0, pud);`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
	reflectedLight.directSpecular *= mix(0.22, 1.0, pud);
	reflectedLight.indirectSpecular *= mix(0.5, 1.4, pud);`);
};
floorMat.customProgramCacheKey = () => 'zaun-floor';
const floor = new THREE.Mesh(deckGeo, floorMat);
floor.receiveShadow = true; floor.matrixAutoUpdate = false; scene.add(floor);

// Grilles : fosses lumineuses sous des caillebotis
// Caillebotis : barreaux sombres sur la fosse lumineuse. Même « cookie » que le sol pour la clé froide
// (sinon les barreaux fins virent au blanc pur et scintillent / frangent au post-traitement).
const grateMat = new THREE.MeshStandardMaterial({ color: 0x22282b, metalness: 0.5, roughness: 0.55, alphaMap: grateTex, alphaTest: 0.5, side: THREE.DoubleSide, envMap: envCube, envMapIntensity: 0.7 });
grateMat.onBeforeCompile = sh => {
  keyUniforms(sh);
  sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'varying vec3 vWPos;\n' + KEYMASK + sh.fragmentShader.replace('#include <lights_fragment_begin>', keyedStdLights());
};
grateMat.customProgramCacheKey = () => 'zaun-grate';
{
  const P = [], N = [], UV = [];
  for (const g of GRATES) {
    const x0 = g.x - g.w / 2, x1 = g.x + g.w / 2, z0 = g.z - g.d / 2, z1 = g.z + g.d / 2, y = -0.03;
    const quad = [[x0, z1], [x1, z1], [x1, z0], [x0, z1], [x1, z0], [x0, z0]];
    for (const [x, z] of quad) { P.push(x, y, z); N.push(0, 1, 0); UV.push(x / 0.5, -z / 0.5); }
    // fosse : parois sombres + fond lumineux
    const depth = 0.55;
    for (const [px, pz, sx, sz] of [[g.x, z0, g.w, 0.04], [g.x, z1, g.w, 0.04], [x0, g.z, 0.04, g.d], [x1, g.z, 0.04, g.d]]) {
      B.near.add(G.box, M(px, -depth / 2, pz, 0, 0, 0, sx, depth, sz), C.steelDark);
    }
    { const k = 0.95 * (g.glow || 1); B.glow.add(G.plane, M(g.x, -depth + 0.02, g.z, -PI / 2, 0, 0, g.w, g.d, 1), lin(k, k, k), FX_CHEM); } // la grille au premier plan, plus discrète
    // cadre de la grille
    for (const [px, pz, sx, sz] of [[g.x, z0, g.w + 0.12, 0.08], [g.x, z1, g.w + 0.12, 0.08], [x0, g.z, 0.08, g.d], [x1, g.z, 0.08, g.d]]) {
      B.near.add(G.box, M(px, -0.015, pz, 0, 0, 0, sx, 0.05, sz), C.steel);
    }
    if (g.steam) vents.push({ p: V3(g.x, -0.1, g.z), dir: V3(0.1, 1, 0.05), len: 1.6, size: 0.9, n: 22, rate: 0.12, col: 'chem', k: 0.028, spread: 0.6 });
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  gg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  const grates = new THREE.Mesh(gg, grateMat); grates.receiveShadow = true; grates.matrixAutoUpdate = false; scene.add(grates);
}

// Rebords de la plate-forme (poutres de rive) + structure qui plonge dans l'abîme
function edgeBeam(ax, az, bx, bz) {
  const a = V3(ax, -0.22, az), b = V3(bx, -0.22, bz);
  _d.subVectors(b, a); const len = _d.length(), ang = Math.atan2(_d.x, _d.z);
  B.back.add(G.box, M((ax + bx) / 2, -0.24, (az + bz) / 2, 0, ang, 0, 0.16, 0.5, len), C.steelDark);
  B.back.add(G.box, M((ax + bx) / 2, -0.02, (az + bz) / 2, 0, ang, 0, 0.24, 0.05, len), C.steel);
  B.back.add(G.box, M((ax + bx) / 2, -0.5, (az + bz) / 2, 0, ang, 0, 0.3, 0.06, len), C.steelDark);
}
edgeBeam(-4.6, 12, -4.6, -3.4); edgeBeam(-4.6, -3.4, -1.4, -3.4); edgeBeam(-1.4, -3.4, 1.6, -8.6);
// piliers sous la plate-forme
for (const [x, z] of [[-4.4, 9], [-4.4, 3.5], [-4.4, -2], [-0.2, -5.3], [1.3, -8.0]]) {
  B.wall.add(G.box, M(x + 0.25, -20.5, z, 0, 0, 0, 0.5, 40, 0.5), C.steelDark, null, abyss);
  for (let y = -2; y > -16; y -= 4) B.wall.add(G.box, M(x + 0.25, y, z, 0.6, 0, 0, 0.12, 0.12, 5.2), C.steelDark, null, abyss);
}

/* ======================================================================
   2. Garde-corps
   ====================================================================== */
function railing(batch, a, b, h, o) {
  o = o || {};
  _d.subVectors(b, a); const len = _d.length(), n = Math.max(1, Math.round(len / (o.step || 1.35)));
  const c = o.c || C.rail;
  for (let i = 0; i <= n; i++) {
    if (o.skip && o.skip(i, n)) continue;
    const p = new THREE.Vector3().lerpVectors(a, b, i / n);
    batch.add(G.box, M(p.x, p.y + h / 2, p.z, 0, Math.atan2(_d.x, _d.z), 0, 0.065, h, 0.065), c);
  }
  _fa.copy(a).setY(a.y + h); _fb.copy(b).setY(b.y + h); seg(batch, G.cyl8, _fa.clone(), _fb.clone(), 0.032, c);
  _fa.copy(a).setY(a.y + h * 0.52); _fb.copy(b).setY(b.y + h * 0.52); seg(batch, G.cyl5, _fa.clone(), _fb.clone(), 0.022, c);
  if (!o.noKick) {
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    batch.add(G.box, M((a.x + b.x) / 2, a.y + 0.06, (a.z + b.z) / 2, 0, ang, 0, 0.02, 0.12, len), c);
  }
}
railing(B.near, V3(-4.5, 0, 12), V3(-4.5, 0, -3.3), 1.08);
railing(B.near, V3(-1.35, 0, -3.5), V3(1.55, 0, -8.5), 1.08);

/* ======================================================================
   3. Accessoires de la plate-forme (projettent des ombres)
   ====================================================================== */
function barrel(x, z, ry, tilt, c, glowTop) {
  const F = new THREE.Matrix4().compose(V3(x, tilt ? 0.34 : 0.48, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt ? PI / 2 : 0, ry, 0)), V3(1, 1, 1));
  B.near.add(G.cyl12, FM(F, 0, 0, 0, 0, 0, 0, 0.33, 0.94, 0.33), c);
  for (const y of [-0.3, 0, 0.3]) B.near.add(G.cyl12, FM(F, 0, y, 0, 0, 0, 0, 0.345, 0.05, 0.345), C.steelDark);
  if (glowTop) {
    B.glow.add(G.cyl12, FM(F, 0, 0.475, 0, 0, 0, 0, 0.26, 0.012, 0.26), lin(1.6, 1.6, 1.6), FX_CHEM);
    halo(V3(x, 1.0, z), lin(0.5, 1, 0.4), 1.1, 1);
  }
}
barrel(3.05, -2.35, 0.3, false, C.rustM, true);
barrel(3.75, -1.6, 1.1, false, lin(0.12, 0.17, 0.12));
barrel(2.55, -3.45, 0.9, true, C.rustM);
// caisses
function crate(x, y, z, s, ry, c) {
  B.near.add(G.box, M(x, y + s / 2, z, 0, ry, 0, s, s, s), c);
  const F = new THREE.Matrix4().compose(V3(x, y + s / 2, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), V3(1, 1, 1));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.near.add(G.box, FM(F, sx * s * 0.47, 0, sz * s * 0.47, 0, 0, 0, s * 0.09, s * 1.02, s * 0.09), C.steelDark);
}
crate(4.0, 1.2, -4.5, 0.7, 0.5, lin(0.1, 0.11, 0.1));
crate(4.3, 0, -4.4, 1.2, -0.3, lin(0.1, 0.09, 0.07));
// tuyau tombé au premier plan + chaînes au sol
// borne / lampadaire (lampe chaude pratique) sur le garde-corps gauche
const LAMP = V3(-4.25, 2.55, -1.0);
seg(B.near, G.cyl8, V3(-4.35, 0, -1.0), V3(-4.35, 2.7, -1.0), 0.06, C.steelDark);
seg(B.near, G.cyl8, V3(-4.35, 2.7, -1.0), V3(-3.95, 2.78, -1.0), 0.04, C.steelDark);
B.near.add(G.cone8, M(-3.95, 2.68, -1.0, 0, 0, 0, 0.2, 0.16, 0.2), C.steelDark);
B.glow.add(G.ico, M(-3.95, 2.56, -1.0, 0, 0, 0, 0.075, 0.075, 0.075), lin(6, 3.4, 1.4), [0, 0, 0, 0.6]);
halo(V3(-3.95, 2.52, -1.0), lin(1, 0.55, 0.22), 1.6, 0, 0.6);

/* ======================================================================
   4. Mur du fond (droite) : cuve chimique, rideau métallique, coursive
   ====================================================================== */
{
  const z = -8.6;
  B.wall.add(G.boxSub, M(8.3, -9, z - 5, 0, 0, 0, 15.4, 62, 10), C.walls[0], null, abyss);
  // rideau métallique et sa fente lumineuse
  const gx = 3.1, gw = 2.6, gh = 3.2;
  for (let y = 0.15; y < gh; y += 0.17) B.back.add(G.box, M(gx, y, z + 0.08, 0, 0, 0, gw, 0.13, 0.08), y < 0.4 ? C.rustM : C.steel);
  B.back.add(G.box, M(gx - gw / 2 - 0.15, gh / 2, z + 0.12, 0, 0, 0, 0.3, gh + 0.3, 0.25), C.steelDark);
  B.back.add(G.box, M(gx + gw / 2 + 0.15, gh / 2, z + 0.12, 0, 0, 0, 0.3, gh + 0.3, 0.25), C.steelDark);
  B.back.add(G.box, M(gx, gh + 0.25, z + 0.18, 0, 0, 0, gw + 0.6, 0.5, 0.36), C.steelDark);
  B.glow.add(G.plane, M(gx, 0.05, z + 0.13, 0, 0, 0, gw * 0.98, 0.08, 1), lin(2.2, 1.1, 0.4), FX_WARM);
  // coursive à 4,2 m
  const cy = 4.2;
  B.back.add(G.box, M(7, cy, z + 0.65, 0, 0, 0, 13, 0.14, 1.3), C.steelDark);
  railing(B.back, V3(0.6, cy, z + 1.25), V3(13, cy, z + 1.25), 1.0, { noKick: true });
  for (let x = 1; x < 13; x += 2.4) seg(B.back, G.box, V3(x, cy - 0.05, z + 1.2), V3(x, cy - 1.0, z + 0.05), 0.06, C.steelDark);
  // tuyauterie murale
  seg(B.back, G.cyl12, V3(0.6, 2.75, z + 0.35), V3(14, 2.75, z + 0.35), 0.16, C.pipe);
  seg(B.back, G.cyl12, V3(0.6, 3.15, z + 0.3), V3(14, 3.15, z + 0.3), 0.1, C.brass);
  seg(B.back, G.cyl16, V3(0.6, 6.6, z + 0.9), V3(16, 6.6, z + 0.9), 0.65, C.pipeG);
  for (let x = 1.4; x < 16; x += 2.8) {
    B.back.add(G.cyl16, M(x, 6.6, z + 0.9, 0, 0, PI / 2, 0.7, 0.12, 0.7), C.steelDark);
    if (x > 3) B.glow.add(G.cyl16, M(x + 1.4, 6.6, z + 0.9, 0, 0, PI / 2, 0.665, 0.18, 0.665), lin(0.9, 0.9, 0.9), FX_CHEM);
  }
  seg(B.back, G.cyl12, V3(1.15, -1, z + 0.4), V3(1.15, 9, z + 0.4), 0.2, C.pipe);
  seg(B.back, G.cyl8, V3(1.6, 0, z + 0.3), V3(1.6, 9, z + 0.3), 0.08, C.brass);
  // fenêtres au-dessus
  for (let y = 7.8; y < 22; y += 3.3) for (let x = 1.8; x < 15; x += 1.9) {
    if (chance(0.3)) B.glow.add(G.plane, M(x, y, z + 0.02, 0, 0, 0, 0.9, 1.3, 1), chance(0.6) ? C.amber.clone().multiplyScalar(rr(0.3, 0.7)) : lin(0.3, 0.5, 0.3).multiplyScalar(rr(0.4, 0.9)), chance(0.5) ? FX_WARM : [0.7, 0, 0.3, 0]);
    else B.glow.add(G.plane, M(x, y, z + 0.02, 0, 0, 0, 0.9, 1.3, 1), C.glass, FX_COLD);
  }
  for (let y = 7; y < 24; y += 3.3) B.wall.add(G.box, M(8.3, y, z + 0.12, 0, 0, 0, 15.4, 0.2, 0.3), C.walls[4]);
  // lampe-cage murale + évent qui crache de la vapeur
  // (sous le linteau du rideau, devant lui : sinon l'ampoule est cachée et il ne reste qu'un halo sans source)
  B.back.add(G.box, M(2.3, 3.14, z + 0.5, 0, 0, 0, 0.3, 0.12, 0.3), C.steelDark);
  B.back.add(G.cone8, M(2.3, 3.0, z + 0.55, 0, 0, 0, 0.17, 0.14, 0.17), C.steelDark);
  B.glow.add(G.ico, M(2.3, 2.9, z + 0.55, 0, 0, 0, 0.08, 0.08, 0.08), lin(4, 2.2, 0.9), FX_WARM);
  halo(V3(2.3, 2.88, z + 0.6), lin(1, 0.6, 0.25), 1.1, 0, 0.6);
  B.back.add(G.cyl12, M(6.4, 5.2, z + 0.35, PI / 2, 0, 0, 0.3, 0.7, 0.3), C.steelDark);
  vents.push({ p: V3(6.4, 5.2, z + 0.75), dir: V3(-0.25, 0.7, 0.6), len: 3.2, size: 1.6, n: 40, rate: 0.16, col: 'cold', k: 0.06, spread: 0.7 });

  // Cuve chimique (bord droit)
  const vx = 4.35, vz = -6.3, vr = 1.45, vh = 3.6;
  B.back.add(G.cyl16, M(vx, vh / 2 + 0.2, vz, 0, 0, 0, vr, vh, vr), lin(0.1, 0.12, 0.11));
  for (const y of [0.35, 1.3, 2.4, 3.55]) B.back.add(G.cyl16, M(vx, y, vz, 0, 0, 0, vr + 0.05, 0.12, vr + 0.05), C.steelDark);
  B.back.add(G.cone8, M(vx, vh + 0.55, vz, 0, 0.2, 0, vr, 0.7, vr), C.steelDark);
  for (let a = 0; a < 6; a++) {
    const an = a / 6 * TAU + 0.3;
    seg(B.back, G.box, V3(vx + Math.cos(an) * vr * 0.9, 0, vz + Math.sin(an) * vr * 0.9), V3(vx + Math.cos(an) * vr * 0.9, 0.3, vz + Math.sin(an) * vr * 0.9), 0.2, C.steelDark);
  }
  // hublots verticaux de liquide lumineux, tournés vers la caméra
  for (const an of [1.85, 2.25, 2.65]) {
    const px = vx + Math.cos(an) * (vr + 0.01), pz = vz + Math.sin(an) * (vr + 0.01);
    B.glow.add(G.box, M(px, 1.85, pz, 0, -an + PI / 2, 0, 0.16, 1.9, 0.04), lin(0.26, 0.26, 0.26), [1, 0, 1, 0]);
    B.back.add(G.box, M(px, 1.85, pz, 0, -an + PI / 2, 0, 0.26, 2.05, 0.03), C.steelDark);
    for (let y = 1.06; y < 2.7; y += 0.32) B.back.add(G.box, M(px, y, pz, 0, -an + PI / 2, 0, 0.22, 0.045, 0.075), C.steelDark);
  }
  halo(V3(vx - 0.9, 1.9, vz + 1.15), lin(0.5, 1, 0.4), 2.6, 1);
  seg(B.back, G.cyl12, V3(vx - 0.5, vh + 0.8, vz), V3(vx - 0.5, vh + 2.3, vz), 0.18, C.pipe);
  seg(B.back, G.cyl12, V3(vx - 0.5, vh + 2.3, vz), V3(vx - 0.5, vh + 2.3, z + 0.3), 0.18, C.pipe);
  seg(B.back, G.cyl12, V3(vx + 0.6, 0.6, vz - 1.2), V3(vx + 0.6, 0.6, z + 0.3), 0.22, C.brass);
  // gyrophare rouge
  B.back.add(G.cyl8, M(vx - 0.4, vh + 0.95, vz + 0.4, 0, 0, 0, 0.12, 0.12, 0.12), C.steelDark);
  B.glow.add(G.ico, M(vx - 0.4, vh + 1.08, vz + 0.4, 0, 0, 0, 0.1, 0.12, 0.1), lin(5, 0.4, 0.3), [0, 0, 0, 1]);
  halo(V3(vx - 0.4, vh + 1.1, vz + 0.42), lin(1, 0.12, 0.1), 1.5, 0, 1);
}

/* ======================================================================
   5. Canyon de Zaun (gauche) : façades empilées
   ====================================================================== */
const WIN_COLS = [
  { c: C.amber, fx: FX_WARM, w: 0.5 }, { c: C.warmW, fx: FX_WARM, w: 0.18 },
  { c: lin(0.45, 1, 0.35), fx: [1, 0, 0.4, 0], w: 0.22 }, { c: C.cold, fx: FX_COLD, w: 0.1 },
];
function winColor() { let r = rnd(); for (const w of WIN_COLS) { if ((r -= w.w) <= 0) return w; } return WIN_COLS[0]; }
const _wp = new THREE.Vector3();
function building(side, s0, s1, lf, yTop, o) {
  o = o || {};
  const w = s1 - s0, sm = (s0 + s1) / 2, dep = o.depth || 9;
  const F = frame(cw(side > 0 ? lf : -lf, 0, sm), side > 0 ? CA - PI / 2 : CA + PI / 2);
  const base = o.color || C.walls[(rnd() * C.walls.length) | 0];
  const yB = -42;
  B.wall.add(G.boxSub, FM(F, 0, (yTop + yB) / 2, -dep / 2, 0, 0, 0, w, yTop - yB, dep), base, null, abyss);
  // retrait en hauteur
  if (yTop > 12 && chance(0.5)) B.wall.add(G.box, FM(F, rr(-0.2, 0.2) * w, yTop + 2.5, -dep / 2 - 1.2, 0, 0, 0, w * rr(0.5, 0.75), 5, dep - 2), base);
  const fh = o.fh || rr(3.0, 3.7), style = o.style || (chance(0.35) ? 'strip' : 'grid');
  const lit = o.lit != null ? o.lit : rr(0.12, 0.38);
  // pilastres
  const nPil = Math.max(1, Math.round(w / rr(3.5, 6)));
  for (let i = 0; i <= nPil; i++) {
    const x = -w / 2 + (i / nPil) * w;
    B.wall.add(G.box, FM(F, x, (yTop + yB) / 2, 0.12, 0, 0, 0, 0.32, yTop - yB, 0.3), base.clone().multiplyScalar(1.25), null, abyss);
  }
  for (let y = Math.ceil(-14 / fh) * fh; y < yTop - 0.5; y += fh) {
    B.wall.add(G.box, FM(F, 0, y, 0.18, 0, 0, 0, w + 0.1, 0.16, 0.42), base.clone().multiplyScalar(1.35), null, abyss);
    _wp.set(0, y + fh / 2, 0.3).applyMatrix4(F);
    const calm = calmness(_wp), dim = 1 - calm * 0.8;
    if (style === 'strip') {
      if (chance(lit * 1.3 * (1 - calm * 0.7))) {
        const wc = winColor(), k = rr(0.25, 0.75) * dim * smooth(-16, 0, y);
        B.glow.add(G.plane, FM(F, rr(-0.1, 0.1) * w, y + fh * 0.55, 0.03, 0, 0, 0, w * rr(0.5, 0.85), fh * 0.28, 1), wc.c.clone().multiplyScalar(k), chance(0.06) ? fxFlick(wc.fx, rnd() + 0.01) : wc.fx);
      } else if (chance(0.5)) B.glow.add(G.plane, FM(F, 0, y + fh * 0.55, 0.03, 0, 0, 0, w * 0.7, fh * 0.28, 1), C.glass, FX_COLD);
    } else {
      const sp = rr(1.4, 2.1), n = Math.max(1, Math.floor((w - 0.8) / sp)), ww = sp * rr(0.42, 0.6), wh = fh * rr(0.35, 0.5);
      for (let i = 0; i < n; i++) {
        const x = -((n - 1) * sp) / 2 + i * sp;
        if (chance(lit * (1 - calm * 0.7))) {
          const wc = winColor(), k = rr(0.2, 0.9) * dim * smooth(-16, 0, y) * (chance(0.06) ? 2.4 : 1);
          B.glow.add(G.plane, FM(F, x, y + fh * 0.55, 0.03, 0, 0, 0, ww, wh, 1), wc.c.clone().multiplyScalar(k), chance(0.05) ? fxFlick(wc.fx, rnd() + 0.01) : wc.fx);
        } else if (chance(0.55)) B.glow.add(G.plane, FM(F, x, y + fh * 0.55, 0.03, 0, 0, 0, ww, wh, 1), C.glass, FX_COLD);
        if (chance(0.05)) B.metal.add(G.box, FM(F, x, y + fh * 0.2, 0.3, 0, 0, 0, 0.7, 0.45, 0.5), C.steelDark);
      }
    }
  }
  // balcons / coursives
  if (chance(o.balc != null ? o.balc : 0.5)) {
    const nb = 1 + (rnd() * 2 | 0);
    for (let k = 0; k < nb; k++) {
      const y = Math.round(rr(-6, Math.min(yTop - 2, 12)) / fh) * fh + 0.05, bw = w * rr(0.5, 0.95), bx = rr(-0.5, 0.5) * (w - bw);
      B.metal.add(G.box, FM(F, bx, y, 0.75, 0, 0, 0, bw, 0.1, 1.2), C.steelDark);
      const a = V3(bx - bw / 2, y, 1.32).applyMatrix4(F), b = V3(bx + bw / 2, y, 1.32).applyMatrix4(F);
      railing(B.metal, a, b, 1.0, { noKick: true, step: 1.2 });
    }
  }
  // tuyaux verticaux
  const np = o.pipes != null ? o.pipes : (rnd() * 3 | 0);
  for (let k = 0; k < np; k++) {
    const x = rr(-0.45, 0.45) * w, r = rr(0.08, 0.24);
    fsegment(B.metal, G.cyl8, F, x, -30, r + 0.3, x, yTop - rr(0, 4), r + 0.3, r, chance(0.3) ? C.brass : C.pipe);
    if (chance(0.3)) for (let y = rr(-6, 0); y < yTop - 2; y += rr(3, 6)) if (calmness(_wp.set(x, y, r + 0.3).applyMatrix4(F)) < 0.15) B.glow.add(G.cyl8, FM(F, x, y, r + 0.3, 0, 0, 0, r + 0.025, 0.14, r + 0.025), lin(0.8, 0.8, 0.8), FX_CHEM);
  }
  return { s0, s1, lf };
}
// Enseignes : placées par profondeur dans le canyon (visibles entre le mur gauche et Warwick, jamais côté icônes)
function facadeAt(list, side, s) {
  const b = list.find(b => s >= b.s0 && s <= b.s1) || list[0];
  return frame(cw(side > 0 ? b.lf : -b.lf, 0, s), side > 0 ? CA - PI / 2 : CA + PI / 2);
}
function ringSign(F, y, r, col, fx, k) {
  const z = r + 0.55, n = 22;
  B.metal.add(G.cyl12, FM(F, 0, y, z, 0, 0, PI / 2, r * 1.08, 0.12, r * 1.08), C.black);
  fsegment(B.metal, G.box, F, 0, y + r * 0.5, 0.05, 0, y + r * 0.5, z, 0.06, C.steelDark);
  for (const sd of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, a2 = (i + 0.72) / n * TAU;
      fsegment(B.glow, G.box, F, sd * 0.07, y + Math.sin(a) * r * 0.9, z + Math.cos(a) * r * 0.9, sd * 0.07, y + Math.sin(a2) * r * 0.9, z + Math.cos(a2) * r * 0.9, 0.035, col.clone().multiplyScalar(k), fx);
    }
    // glyphe intérieur : croc stylisé (deux traits) + barre
    fsegment(B.glow, G.box, F, sd * 0.07, y + r * 0.45, z - r * 0.25, sd * 0.07, y - r * 0.4, z, 0.03, col.clone().multiplyScalar(k * 0.9), fx);
    fsegment(B.glow, G.box, F, sd * 0.07, y + r * 0.45, z + r * 0.25, sd * 0.07, y - r * 0.4, z, 0.03, col.clone().multiplyScalar(k * 0.9), fx);
    fsegment(B.glow, G.box, F, sd * 0.07, y - r * 0.62, z - r * 0.4, sd * 0.07, y - r * 0.62, z + r * 0.4, 0.03, col.clone().multiplyScalar(k * 0.8), fx);
  }
  _wp.set(0, y, z).applyMatrix4(F);
  halo(_wp, col, r * 3.2, fx[0], fx[3]);
}
function sign(F, x, y, s) {
  const h = s.h || 3.2, d = s.d || 1.1, col = s.c || C.red, fx = s.fx || FX_SIGN;
  fsegment(B.metal, G.box, F, x, y + h * 0.3, 0.05, x, y + h * 0.3, 0.3, 0.05, C.steelDark);
  fsegment(B.metal, G.box, F, x, y - h * 0.3, 0.05, x, y - h * 0.3, 0.3, 0.05, C.steelDark);
  B.metal.add(G.box, FM(F, x, y, d / 2 + 0.25, 0, 0, 0, 0.14, h, d), C.black);
  for (const sd of [-1, 1]) {
    const px = x + sd * 0.075;
    const k = s.k || 1.6;
    B.glow.add(G.box, FM(F, px, y, d / 2 + 0.25, 0, 0, 0, 0.012, h * 0.94, d * 0.92), col.clone().multiplyScalar(k * 0.09), fx);
    // cadre néon
    for (const e of [-1, 1]) {
      B.glow.add(G.box, FM(F, px * 1.15, y + e * (h / 2 - 0.08), d / 2 + 0.25, 0, 0, 0, 0.02, 0.06, d * 0.9), col.clone().multiplyScalar(k), fx);
      B.glow.add(G.box, FM(F, px * 1.15, y, d / 2 + 0.25 + e * d * 0.45, 0, 0, 0, 0.02, h - 0.1, 0.06), col.clone().multiplyScalar(k), fx);
    }
    // glyphes : barres et cercle
    const n = 3 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const yy = y + h / 2 - 0.45 - i * ((h - 0.9) / Math.max(1, n - 1)), len = d * rr(0.3, 0.7);
      B.glow.add(G.box, FM(F, px * 1.15, yy, d / 2 + 0.25 + rr(-0.12, 0.12) * d, 0, 0, 0, 0.02, h * 0.045, len), col.clone().multiplyScalar(k * rr(0.75, 1.1)), s.flick && i % 2 ? fxFlick(fx, 0.37 + i * 0.11) : fx);
    }
  }
  _wp.set(x, y, d / 2 + 0.25).applyMatrix4(F);
  halo(_wp, col, h * 1.1, fx[0], fx[3]);
}
// Mur droit du canyon (face à la caméra en biais)
{
  let s = 2.2;
  const RW = [];
  for (let i = 0; s < 74; i++) {
    const w = rr(5, 10), lf = 6.2 + rr(-0.6, 0.9), top = rr(16, 38) + s * 0.15;
    RW.push(building(1, s, s + w, lf, top, { lit: i === 0 ? 0.08 : undefined }));
    s += w + rr(0, 0.6);
  }
  sign(facadeAt(RW, 1, 27), 0, 9.5, { c: C.red, h: 5.5, d: 2.0, flick: true, k: 2.6 });
  sign(facadeAt(RW, 1, 36), 0, 4.0, { c: lin(0.45, 1, 0.35), fx: [1, 0, 0.6, 0], h: 4.2, d: 1.6, k: 2.2 });
  sign(facadeAt(RW, 1, 49), 0, 12, { c: C.amber, fx: [0, 0, 0.2, 0.8], h: 6.5, d: 2.2, k: 3.2 });
  sign(facadeAt(RW, 1, 58), 0, 2.5, { c: C.mag, h: 4.5, d: 1.8, k: 3.2 });
  ringSign(facadeAt(RW, 1, 42), 7.4, 1.7, lin(0.45, 1, 0.35), [1, 0, 0.8, 0], 3.0);
}
// Mur gauche du canyon (grande façade sombre, côté icônes : calme)
{
  let s = -8;
  const LW = [];
  for (let i = 0; s < 74; i++) {
    const w = rr(6, 11), lf = 7.6 + rr(-0.6, 1.2), top = rr(18, 40);
    LW.push(building(-1, s, s + w, lf, top, { lit: rr(0.08, 0.25), balc: 0.35 }));
    s += w + rr(0, 0.6);
  }
  sign(facadeAt(LW, -1, 40), 0, 1.6, { c: C.red, h: 2.2, d: 0.9, flick: true, k: 1.2 });
}
// Tours lointaines, dissoutes dans la brume
for (let i = 0; i < 16; i++) {
  const s = rr(70, 110), l = rr(-26, 22), w = rr(5, 13), top = rr(25, 60);
  const F = frame(cw(l, 0, s), CA + rr(-0.3, 0.3));
  B.wall.add(G.box, FM(F, 0, (top - 42) / 2, 0, 0, 0, 0, w, top + 42, w * rr(0.6, 1)), C.walls[4]);
  for (let k = 0; k < 14; k++) B.glow.add(G.plane, FM(F, rr(-0.4, 0.4) * w, rr(-5, top - 3), w * 0.31 + 0.02, 0, 0, 0, rr(0.6, 2.5), 0.5, 1), (chance(0.6) ? C.amber : lin(0.45, 1, 0.35)).clone().multiplyScalar(rr(1, 3)), chance(0.5) ? FX_WARM : [1, 0, 0.3, 0]);
}

/* ======================================================================
   6. Passerelle, ponts, conduites géantes, câbles
   ====================================================================== */
const FC = frame(M0, CA); // repère du canyon : x = latéral (droite), -z = profondeur
{
  // passerelle principale
  const L = 30, wdt = 2.5;
  B.metal.add(G.box, FM(FC, 0, -0.12, -(L / 2) + 1.5, 0, 0, 0, wdt, 0.22, L), C.steelDark);
  B.metal.add(G.box, FM(FC, -wdt / 2, -0.38, -(L / 2) + 1.5, 0, 0, 0, 0.12, 0.5, L), C.steelDark);
  B.metal.add(G.box, FM(FC, wdt / 2, -0.38, -(L / 2) + 1.5, 0, 0, 0, 0.12, 0.5, L), C.steelDark);
  for (const sd of [-1, 1]) railing(B.metal, V3(sd * wdt / 2, 0, -1).applyMatrix4(FC), V3(sd * wdt / 2, 0, -L + 1.5).applyMatrix4(FC), 1.05, { step: 1.5 });
  for (let s = 5; s < L; s += 7.5) {
    for (const sd of [-1, 1]) fsegment(B.wall, G.box, FC, sd * 1.0, -0.3, -s, sd * 1.0, -40, -s, 0.16, C.steelDark, null, abyss);
    fsegment(B.wall, G.box, FC, -1.1, -2.6, -s, 1.1, -2.6, -s, 0.1, C.steelDark, null, abyss);
    fsegment(B.wall, G.box, FC, -1.0, -0.4, -s, 1.0, -2.6, -s, 0.06, C.steelDark, null, abyss);
    // lampadaires de passerelle
    const p = V3(1.15, 0, -s + 2.5).applyMatrix4(FC);
    seg(B.metal, G.cyl5, p, V3(p.x, 2.1, p.z), 0.035, C.steelDark);
    const warm = s % 15 < 7;
    B.glow.add(G.ico, M(p.x, 2.15, p.z, 0, 0, 0, 0.07, 0.07, 0.07), warm ? lin(5, 2.6, 1) : lin(2.8, 3.6, 5), warm ? FX_WARM : FX_COLD);
    halo(V3(p.x, 2.15, p.z), warm ? lin(1, 0.55, 0.22) : lin(0.6, 0.78, 1), 1.4, 0, 0.6);
  }
  // plate-forme d'arrivée au fond
  B.metal.add(G.box, FM(FC, 0, -0.2, -L - 1.5, 0, 0, 0, 7, 0.4, 5), C.steelDark);
  B.glow.add(G.plane, FM(FC, -3.3, 1.4, -L - 2.5, 0, PI / 2, 0, 1.6, 2.6, 1), lin(2.5, 1.3, 0.5), FX_WARM);
  halo(V3(-3.2, 1.4, -L - 2.5).applyMatrix4(FC), lin(1, 0.55, 0.2), 4, 0, 0.6);
}
function bridge(s, y, w, o) {
  o = o || {};
  const l0 = -8, l1 = 6.6, len = l1 - l0, lm = (l0 + l1) / 2;
  const F = frame(cw(lm, y, s), CA);
  B.metal.add(G.box, FM(F, 0, 0, 0, 0, 0, 0, len, 0.25, w), C.steelDark);
  for (const sd of [-1, 1]) {
    B.metal.add(G.box, FM(F, 0, 1.1, sd * w / 2, 0, 0, 0, len, 0.1, 0.1), C.rail);
    B.metal.add(G.box, FM(F, 0, -0.35, sd * w / 2, 0, 0, 0, len, 0.35, 0.12), C.steelDark);
    const n = Math.round(len / 1.6);
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + i * len / n;
      fsegment(B.metal, G.box, F, x, 0, sd * w / 2, x, 1.1, sd * w / 2, 0.05, C.rail);
      if (i < n) fsegment(B.metal, G.box, F, x, -0.45, sd * w / 2, x + len / n, 1.1, sd * w / 2, 0.035, C.steelDark);
    }
  }
  if (o.lamps) for (const x of o.lamps) {
    fsegment(B.metal, G.cyl5, F, x, -0.2, 0, x, -1.0, 0, 0.015, C.black);
    _wp.set(x, -1.08, 0).applyMatrix4(F);
    B.glow.add(G.cone8, M(_wp.x, _wp.y + 0.08, _wp.z, 0, 0, 0, 0.16, 0.12, 0.16), lin(0.05, 0.05, 0.05), [0, 0, 0, 0]);
    B.glow.add(G.ico, M(_wp.x, _wp.y, _wp.z, 0, 0, 0, 0.07, 0.07, 0.07), o.warm ? lin(5, 2.7, 1) : lin(3, 3.8, 5), o.warm ? FX_WARM : FX_COLD);
    halo(_wp, o.warm ? lin(1, 0.55, 0.22) : lin(0.6, 0.78, 1), 1.8, 0, 0.6);
  }
  // câbles qui pendent sous le pont
  for (let i = 0; i < (o.cables || 3); i++) {
    const a = V3(rr(-len / 2, len / 2), -0.3, rr(-w / 2, w / 2)).applyMatrix4(F), b = a.clone(); b.y -= rr(1.5, 5);
    seg(B.metal, G.cyl5, a, b, 0.018, C.black);
  }
  return F;
}
bridge(19, 7.8, 2.2, { lamps: [-2.5, 2.4], cables: 4 });
bridge(31, 3.6, 2.4, { lamps: [0], warm: true });
bridge(43, 12, 2.6, { lamps: [-3, 2] });
bridge(56, 1.5, 2.4, { lamps: [-1], warm: true });
// conduites géantes le long des murs du canyon
function bigPipe(l, y, s0, s1, r, bands) {
  const a = cw(l, y, s0), b = cw(l, y, s1);
  seg(B.metal, G.cyl16, a, b, r, C.pipeG);
  for (let s = s0 + 2; s < s1; s += rr(3.5, 5.5)) {
    const p = cw(l, y, s);
    B.metal.add(G.cyl16, M(p.x, p.y, p.z, PI / 2, CA, 0, r * 1.08, 0.18, r * 1.08), C.steelDark);
    if (bands && chance(0.6)) {
      const p2 = cw(l, y, s + 1.2);
      B.glow.add(G.cyl16, M(p2.x, p2.y, p2.z, PI / 2, CA, 0, r * 1.035, 0.22, r * 1.035), lin(1.1, 1.1, 1.1), FX_CHEM);
    }
    // supports
    const q = cw(l, y - r, s), q2 = cw(l, -30, s);
    seg(B.wall, G.box, q, q2, 0.12, C.steelDark, null, abyss);
  }
}
bigPipe(5.0, 1.0, 1.5, 70, 0.85, true);
bigPipe(5.2, 2.75, 2, 70, 0.42, false);
bigPipe(-6.9, -2.2, -6, 70, 0.75, true);
// conduites verticales qui descendent du plafond
for (const [l, s, r] of [[-6.6, 18, 0.5], [4.2, 31, 0.7], [-6, 44, 0.6]]) {
  const p = cw(l, 0, s);
  seg(B.metal, G.cyl12, V3(p.x, -40, p.z), V3(p.x, 40, p.z), r, C.pipe);
  for (let y = -8; y < 26; y += rr(2.5, 4)) B.glow.add(G.cyl12, M(p.x, y, p.z, 0, 0, 0, r * 1.04, 0.16, r * 1.04), lin(1, 1, 1), FX_CHEM);
}
// conduite qui traverse le canyon au-dessus de la jonction
seg(B.metal, G.cyl12, cw(-8, 12.5, 12), cw(6.6, 12.0, 12), 0.4, C.pipe);
// câbles en chaînette à travers le canyon
for (let i = 0; i < 16; i++) {
  const s = rr(8, 62), y1 = rr(5, 16), y2 = y1 + rr(-2, 2), ds = rr(-3, 3);
  catenary(B.metal, cw(-7.4, y1, s), cw(5.9, y2, s + ds), rr(0.6, 2.8), rr(0.02, 0.05), C.black, 12);
}
for (let i = 0; i < 6; i++) {
  const side = chance(0.5) ? 5.8 : -7.3, s = rr(8, 50), y = rr(3, 12);
  catenary(B.metal, cw(side, y, s), cw(side, y + rr(-1, 1), s + rr(4, 9)), rr(0.5, 1.5), 0.03, C.black, 10);
}
// câbles et chaînes autour de la jonction (devant le mur du fond)
catenary(B.metal, V3(0.9, 6.2, -8.4), V3(6, 5.4, -8.4), 0.9, 0.035, C.black);
catenary(B.metal, V3(-1.2, 7.4, -9.5), V3(4.5, 7.8, -7.5), 1.6, 0.03, C.black);

/* ======================================================================
   7. Premier plan : silhouettes sombres qui cadrent l'image
   ====================================================================== */
// colonne de tuyaux au bord droit
seg(B.near, G.cyl12, V3(2.05, -1, 3.65), V3(2.05, 12, 3.65), 0.19, C.steelDark);
seg(B.near, G.cyl8, V3(2.36, -1, 3.5), V3(2.36, 12, 3.5), 0.065, C.brass);
for (const y of [0.6, 2.4, 4.2]) B.near.add(G.cyl12, M(2.05, y, 3.65, 0, 0, 0, 0.25, 0.1, 0.25), C.black);
// colonne sombre au bord gauche (silhouette de premier plan sous les icônes : Lambert assombri par la zone calme)
{
  const x = -3.45, z = 3.1, fade = (px, py) => 1 - 0.85 * smooth(1.2, 3.6, py);
  seg(B.metal, G.cyl12, V3(x, -1, z), V3(x, 16, z), 0.26, C.black, null, fade);
  seg(B.metal, G.cyl8, V3(x + 0.42, -1, z - 0.12), V3(x + 0.42, 16, z - 0.12), 0.08, lin(0.05, 0.04, 0.03), null, fade);
  for (const y of [0.15, 2.9, 5.6, 8.3]) {
    B.metal.add(G.cyl12, M(x, y, z, 0, 0, 0, 0.32, 0.16, 0.32), C.steelDark, null, fade);
    B.metal.add(G.box, M(x + 0.24, y + 0.02, z - 0.06, 0, 0.28, 0, 0.42, 0.07, 0.07), C.black, null, fade);
  }
  B.metal.add(G.box, M(x, 0.04, z, 0, 0.3, 0, 0.8, 0.08, 0.8), C.steelDark);
}
// grosse conduite au ras du sol, le long du bord gauche
seg(B.near, G.cyl16, V3(-5.15, 0.3, 14), V3(-5.15, 0.3, -3.6), 0.42, lin(0.035, 0.04, 0.04));
for (let z = 12; z > -3; z -= 2.6) B.near.add(G.cyl16, M(-5.15, 0.3, z, PI / 2, 0, 0, 0.46, 0.14, 0.46), C.steelDark);
// chaînes suspendues près de la caméra (se balancent)
const chains = [];
function chain(x, y, z, len, phase) {
  const b = new Batch(), n = Math.round(len / 0.13);
  for (let i = 0; i < n; i++) b.add(G.link, M(0, -i * 0.13, 0, PI / 2, i % 2 ? PI / 2 : 0, 0, 0.085, 0.085, 0.085), C.black);
  b.add(G.cone8, M(0, -n * 0.13 - 0.12, 0, PI, 0, 0, 0.09, 0.22, 0.09), C.rustM);
  const mesh = b.build(matMetal, 'chaine');
  mesh.matrixAutoUpdate = true; mesh.position.set(x, y, z);
  chains.push({ mesh, phase });
}
chain(1.75, 8.5, 1.0, 6.3, 0);
chain(2.05, 8.5, 1.7, 5.7, 1.7);

/* ======================================================================
   Construction des lots
   ====================================================================== */
const meshMetal = B.metal.build(matMetal, 'zaun-metal');
const meshBack = B.back.build(matBack, 'zaun-fond');
const meshNear = B.near.build(matNear, 'zaun-proche');
meshNear.castShadow = true; meshNear.receiveShadow = true;
const meshWall = B.wall.build(matWall, 'zaun-murs');
const meshGlow = B.glow.build(glowMat, 'zaun-lumieres');

/* ======================================================================
   8. Ciel / fond : dôme dégradé (brume chimique en bas, noir bleuté en haut)
   ====================================================================== */
const domeU = { uSky: { value: new THREE.Color() }, uNoise: U.uNoise, uTop: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uFogColor: U.uFogColor, uCanyon: { value: new THREE.Vector2(CU.x, CU.z) } };
const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
  uniforms: domeU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uTop, uGlow, uFogColor, uSky; uniform vec2 uCanyon; varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  vec3 c = mix(uFogColor, uTop, smoothstep(0.0, 0.42, d.y));
  float cz = pow(max(0.0, dot(normalize(d.xz + 1e-5), uCanyon)), 5.0);
  float below = smoothstep(0.03, -0.3, d.y);
  c += uGlow * (below * (0.35 + 0.65 * cz) + cz * 0.35 * exp(-abs(d.y - 0.02) * 9.0));
  c += uSky * pow(max(0.0, dot(normalize(d.xz + 1e-5), uCanyon)), 3.0) * smoothstep(0.04, 0.32, d.y);
  c *= 0.85 + 0.3 * nzR(vec2(atan(d.z, d.x) * 0.9549, d.y * 2.0));
  gl_FragColor = vec4(c, 1.0);${OUT}
}`,
}));
dome.renderOrder = -100; dome.frustumCulled = false; scene.add(dome);

/* ======================================================================
   9. Puits de lumière (cônes additifs, sensibles au brouillard)
   ====================================================================== */
const shaftVS = `varying vec3 vN, vV; varying vec2 vUv; varying float vD;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz); vec4 mv = viewMatrix * wp; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const shaftFS = `uniform vec3 uShaftCol; uniform float uInt, uTime, uBars, uLen, uSeed, uFoot;
varying vec3 vN, vV; varying vec2 vUv; varying float vD;
${FOG}
${NOISE}
void main(){
  float f = abs(dot(normalize(vN), normalize(vV)));
  float core = f * f * (0.6 + 0.4 * f);
  float y = vUv.y;
  float vert = smoothstep(0.0, uFoot, y) * (1.0 - smoothstep(0.35, 1.0, y));
  float bars = 0.5 + 0.5 * smoothstep(-0.4, 0.8, sin(vUv.x * 6.2831 * uBars + uSeed));
  float dust = 0.55 + 0.8 * nzG(vec2(vUv.x * 2.0 + uSeed, y * uLen * 0.09 + uTime * 0.055));
  float a = core * vert * bars * dust * uInt * (1.0 - fogF(vD) * 0.75);
  gl_FragColor = vec4(uShaftCol * a, 1.0);${OUT}
}`;
const shafts = [];
function shaft(p0, r0, r1, len, inten, bars, foot) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, 28, 1, true); geo.translate(0, len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNoise: U.uNoise, uShaftCol: U.uShaftCol, uTime: U.uTime, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uInt: { value: inten }, uBars: { value: bars }, uLen: { value: len }, uSeed: { value: rnd() * 50 }, uFoot: { value: foot || 0.04 } },
    vertexShader: shaftVS, fragmentShader: shaftFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(p0); m.quaternion.setFromUnitVectors(UP, LDIR); m.renderOrder = 5;
  if (shafts.length < NSHAFT) KEYFEET[shafts.length].set(p0.x, p0.y, p0.z, r0);
  m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m);
  shafts.push({ m, base: inten, ph: rnd() * 10 });
  return m;
}
const KEY_FOOT = V3(0.15, 0, -2.3);
shaft(KEY_FOOT, 1.1, 2.0, 34, 0.8, 5, 0.03);
shaft(cw(-0.6, 0, 13), 1.6, 2.6, 46, 0.95, 4);
shaft(cw(2.4, 0, 27), 2.2, 3.2, 52, 0.9, 3);
shaft(cw(-3.5, -6, 40), 2.4, 3.6, 60, 0.7, 4);

/* ======================================================================
   10. Reflets mouillés : flaques de lumière + traînées étirées vers la caméra
   ====================================================================== */
const streakGeo = new THREE.BufferGeometry();
{
  const P = [], UV = [], CO = [], cam = REF.pos;
  function streak(src, c, width, len, k) {
    // traînée anisotrope du sol mouillé : part du pied de la source et s'étire vers la caméra
    const rx = src.x, rz = src.z;
    const dx = cam.x - rx, dz = cam.z - rz, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, px = -uz, pz = ux;
    const a0 = -0.35, a1 = Math.min(len, dl - 1.5);
    const corners = [[-1, a0], [1, a0], [1, a1], [-1, a0], [1, a1], [-1, a1]];
    for (const [sx, a] of corners) {
      P.push(rx + px * sx * width + ux * a, 0.006, rz + pz * sx * width + uz * a);
      UV.push(sx * 0.5 + 0.5, (a - a0) / (a1 - a0)); CO.push(c.r * k, c.g * k, c.b * k);
    }
  }
  streak(V3(KEY_FOOT.x - 0.4, 3.5, KEY_FOOT.z - 0.5), lin(0.7, 0.82, 1), 0.7, 4.5, 0.4);
  streak(LAMP, lin(1, 0.55, 0.22), 0.3, 3.2, 0.9);
  streak(V3(2.3, 2.9, -8.05), lin(1, 0.6, 0.25), 0.25, 3, 0.5);
  streak(V3(3.4, 1.9, -5.0), lin(0.5, 1, 0.4), 0.55, 3.5, 0.55);
  streak(V3(3.95, 4.7, -5.9), lin(1, 0.12, 0.1), 0.3, 3.2, 0.6);
  streak(V3(-1.15, 0.25, 2.75), lin(0.5, 1, 0.4), 0.9, 1.6, 0.35);
  streakGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  streakGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  streakGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(CO, 3));
}
const streakMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aCol; varying vec3 vC; varying vec2 vUv; varying vec3 vW; varying float vF; uniform float uHunt; uniform vec3 uBlood;
${FOG}
void main(){ vUv = uv; vec3 c = aCol; float lum = dot(c, vec3(0.3, 0.55, 0.15)); vC = mix(c, uBlood * lum * 1.2, uHunt * 0.7);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vF = fogF(-mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vC; varying vec2 vUv; varying vec3 vW; varying float vF; uniform float uTime;
${NOISE}
void main(){
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.6);
  float wet = 0.25 + 0.75 * puddle(vW.xz);
  float rip = 0.65 + 0.35 * nzB(vec2(vUv.x * 0.2, vUv.y * 1.25 - uTime * 0.02));
  float a = 1.4 * pow(across, 2.5) * along * wet * rip * (1.0 - vF);
  gl_FragColor = vec4(vC * a, 1.0);${OUT}
}`,
});
const streaks = new THREE.Mesh(streakGeo, streakMat); streaks.renderOrder = 4; streaks.frustumCulled = false; scene.add(streaks);
// flaque de lumière au pied du puits principal
const poolMat = new THREE.ShaderMaterial({
  uniforms: { uNoise: U.uNoise, uShaftCol: U.uShaftCol, uTime: U.uTime, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uInt: { value: 0.5 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uShaftCol; uniform float uInt; varying vec2 vUv; varying vec3 vW;
${NOISE}
void main(){ vec2 q = vUv * 2.0 - 1.0; float r = dot(q, q); float a = exp(-r * 3.0) * (1.0 - smoothstep(0.7, 1.0, r));
  a *= 0.55 + 0.6 * puddle(vW.xz) + 0.25 * nzB(vW.xz * 0.16);
  gl_FragColor = vec4(uShaftCol * a * uInt, 1.0);${OUT} }`,
});
const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat);
pool.rotation.set(-PI / 2, 0, Math.atan2(LDIR.x, LDIR.z)); pool.scale.set(3.0, 4.6, 1);
pool.position.set(KEY_FOOT.x - 0.25, 0.008, KEY_FOOT.z - 0.4); pool.renderOrder = 4; scene.add(pool);

/* ======================================================================
   11. Brume : nappe au sol, lueur de l'abîme, voiles de profondeur
   ====================================================================== */
const mistMat = new THREE.ShaderMaterial({
  uniforms: Object.assign({ uK: { value: 1 } }, U), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vW; varying float vF; ${FOG}
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vF = fogF(-mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uChem, uShaftCol, uFogColor; uniform float uTime, uK; varying vec3 vW; varying float vF;
${NOISE}
void main(){
  vec2 p = vW.xz * 0.22 + vec2(uTime * 0.018, -uTime * 0.011);
  float n = nzR(p * 0.25 + nzG(p * 0.4 - uTime * 0.003) * 0.2);
  float m = smoothstep(0.35, 0.85, n);
  vec3 c = uChem * 0.035 + uFogColor * 1.2;
  gl_FragColor = vec4(c * m * uK * (1.0 - vF * 0.7), 1.0);${OUT}
}`,
});
function mistPlane(x, y, z, w, d, k) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mistMat.clone());
  m.material.uniforms = Object.assign({}, U, { uK: { value: k } });
  m.rotation.x = -PI / 2; m.position.set(x, y, z); m.renderOrder = 3; scene.add(m);
  return m;
}
const mists = [mistPlane(3, 0.12, 2, 18, 22, 0.6), mistPlane(3, 0.5, -1, 18, 18, 0.35)];
// lueur chimique dans l'abîme
const abyssGlow = [];
for (const [y, k] of [[-2.5, 1.2], [-7, 1.6], [-14, 2.0]]) {
  const p = cw(-0.5, y, 28);
  const m = mistPlane(p.x, y, p.z, 30, 80, k); m.rotation.z = CA; abyssGlow.push(m);
}
// voiles de brume verticaux (profondeur)
const veilGeo = new THREE.BufferGeometry();
{
  const P = [], UV = [], CO = [];
  const veil = (c, w, h, k, ry) => {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [sx, sy] of corners) {
      P.push(c.x + Math.cos(ry) * sx * w / 2, c.y + sy * h / 2, c.z - Math.sin(ry) * sx * w / 2);
      UV.push(sx * 0.5 + 0.5, sy * 0.5 + 0.5); CO.push(k, k, k);
    }
  };
  const ry = Math.atan2(REF.pos.x - REF.target.x, REF.pos.z - REF.target.z);
  veil(cw(0, -1, 12), 22, 12, 0.5, ry);
  veil(cw(-1, 0, 24), 30, 16, 0.6, ry);
  veil(cw(1, 2, 40), 44, 24, 0.7, ry);
  veil(V3(3, 1.5, -8.2), 14, 5, 0.25, 0);
  veilGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  veilGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  veilGeo.setAttribute('aK', new THREE.Float32BufferAttribute(CO, 3));
}
const veils = new THREE.Mesh(veilGeo, new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec3 aK; varying vec2 vUv; varying float vK; varying vec3 vW; void main(){ vUv = uv; vK = aK.x; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uChem, uFogColor, uShaftCol; uniform float uTime; varying vec2 vUv; varying float vK; varying vec3 vW;
${NOISE}
void main(){
  vec2 q = vUv * 2.0 - 1.0;
  float a = (1.0 - smoothstep(0.2, 1.0, abs(q.x))) * (1.0 - smoothstep(-0.2, 1.0, q.y)) * smoothstep(-1.0, -0.6, q.y);
  a *= 0.6 + 0.6 * nzR(vec2(vW.x * 0.03 + uTime * 0.005, vW.y * 0.05));
  vec3 col = mix(uChem * 0.055, uShaftCol * 0.05, smoothstep(-0.3, 0.6, q.y)) + uFogColor * 0.5;
  gl_FragColor = vec4(col * a * vK, 1.0);${OUT}
}`,
}));
veils.renderOrder = 2; veils.frustumCulled = false; scene.add(veils);

/* ======================================================================
   12. Halos (sprites additifs autour des sources)
   ====================================================================== */
const ptVS = (body) => `uniform float uTime, uViewH, uHunt, uHowl, uHigh, uBass; uniform vec3 uChem, uBlood, uHead;
varying vec3 vC; varying float vA;
${FOG}
${NOISE}
float pxSize(float s, float depth){ return clamp(s * uViewH * projectionMatrix[1][1] * 0.5 / depth, 0.0, uViewH * 0.18); }
${body}`;
const ptFS = (shape) => `varying vec3 vC; varying float vA;
void main(){ vec2 q = gl_PointCoord - 0.5; ${shape}
  gl_FragColor = vec4(vC * a * vA, 1.0);${OUT} }`;
const SOFT = 'float r = dot(q, q) * 4.0; float a = exp(-r * 3.5) * (1.0 - smoothstep(0.75, 1.0, r));';
function points(pos, attrs, vs, fs, renderOrder) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const k in attrs) g.setAttribute(k, new THREE.Float32BufferAttribute(attrs[k].a, attrs[k].n));
  const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.frustumCulled = false; m.renderOrder = renderOrder || 6; scene.add(m);
  return m;
}
{
  const P = [], CO = [], SZ = [];
  for (const h of halos) { P.push(h.p.x, h.p.y, h.p.z); CO.push(h.c.r, h.c.g, h.c.b); SZ.push(h.size, h.chem, h.blood); }
  points(P, { aCol: { a: CO, n: 3 }, aS: { a: SZ, n: 3 } }, ptVS(`attribute vec3 aCol, aS;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  float lum = dot(aCol, vec3(0.3, 0.55, 0.15));
  vec3 c = mix(aCol, uChem * lum * 1.2, aS.y); c = mix(c, uBlood * lum * 1.1, uHunt * aS.z * (1.0 - aS.y));
  vC = c * 0.32 * (1.0 + aS.y * uBass * 1.2); vA = 1.0 - fogF(-mv.z) * 0.85; gl_PointSize = pxSize(aS.x, -mv.z); }`), ptFS(SOFT), 7);
}

/* ======================================================================
   13. Particules : spores, gouttes dans les puits, vapeur, braises, poussière
   ====================================================================== */
const PS = {};
// spores chimiques réparties dans le cadre de la caméra
{
  const N = 1800, P = [], S = [];
  const camF = V3().subVectors(REF.target, REF.pos).normalize(), camR = V3().crossVectors(camF, UP).normalize(), camU = V3().crossVectors(camR, camF);
  for (let i = 0; i < N; i++) {
    const d = 4 + Math.pow(rnd(), 1.4) * 32, sx = rr(-0.95, 0.5) * 1.0, sy = rr(-0.35, 0.35);
    const p = REF.pos.clone().addScaledVector(camF, d).addScaledVector(camR, sx * d).addScaledVector(camU, sy * d);
    P.push(p.x, p.y, p.z); S.push(rnd(), rnd(), rnd(), rr(0.008, 0.026) * (chance(0.04) ? 1.8 : 1));
  }
  PS.spores = points(P, { aSeed: { a: S, n: 4 } }, ptVS(`attribute vec4 aSeed;
void main(){
  vec3 p = position; float t = uTime;
  float H = 11.0, y0 = p.y - 5.0;
  p.y = y0 + mod(5.0 + t * (0.04 + aSeed.x * 0.14), H);
  p.x += sin(t * 0.21 + aSeed.y * 6.28) * 0.55 + sin(t * 0.63 + aSeed.z * 6.28) * 0.12;
  p.z += cos(t * 0.17 + aSeed.z * 6.28) * 0.55;
  vec3 dh = p - uHead; float dl = length(dh) + 0.001;
  p += dh / dl * uHowl * 2.2 * exp(-dl * 0.35);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  float edge = smoothstep(0.0, 1.0, p.y - y0) * smoothstep(0.0, 1.0, y0 + H - p.y) * smoothstep(1.8, 3.5, depth);
  float tw = 0.55 + 0.45 * sin(t * (1.3 + aSeed.x * 2.7) + aSeed.y * 40.0);
  float spark = 1.0 + uHigh * 3.0 * step(0.82, fract(aSeed.z * 13.0 + t * 0.7));
  vec3 c = aSeed.x > 0.86 ? vec3(0.75, 0.85, 1.0) * 0.9 : uChem;
  vC = c * (0.75 + uBass * 0.6);
  vA = edge * tw * spark * (1.0 - fogF(depth));
  gl_PointSize = max(1.5, pxSize(aSeed.w, depth));
}`), ptFS(SOFT));
  PS.spores.userData.n = N;
}
// gouttes / poussière qui tombent dans les puits de lumière
{
  const P = [], S = [];
  const feet = [[KEY_FOOT, 1.4, 150], [cw(-0.6, 0, 13), 1.8, 200]];
  for (const [f, r, n] of feet) for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * r;
    P.push(f.x + Math.cos(a) * d, f.y, f.z + Math.sin(a) * d); S.push(rnd(), rr(2.5, 5.5), rnd(), rr(0.12, 0.3));
  }
  PS.drips = points(P, { aSeed: { a: S, n: 4 } }, ptVS(`attribute vec4 aSeed; uniform vec2 uLean; uniform vec3 uShaftCol;
void main(){
  float H = 9.0; float ph = fract(uTime * aSeed.y / H + aSeed.x);
  float y = H * (1.0 - ph);
  vec3 p = position + vec3(uLean.x * y, y, uLean.y * y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  vA = smoothstep(0.0, 0.08, ph) * smoothstep(0.0, 0.5, y) * (1.0 - smoothstep(6.0, 9.0, y)) * (1.0 - fogF(depth)) * (0.4 + 0.6 * aSeed.z);
  vC = uShaftCol * 0.9;
  gl_PointSize = max(2.0, pxSize(aSeed.w, depth));
}`), ptFS('float a = smoothstep(0.09, 0.0, abs(q.x)) * smoothstep(0.5, 0.0, abs(q.y)) * (0.35 + q.y * 1.3);'));
  PS.drips.userData.n = P.length / 3;
}
// vapeur
{
  const P = [], S = [], D = [], CO = [];
  for (const v of vents) for (let i = 0; i < v.n; i++) {
    P.push(v.p.x, v.p.y, v.p.z); S.push(rnd(), v.rate * rr(0.8, 1.2), rnd(), v.size * rr(0.7, 1.3));
    D.push(v.dir.x * v.len, v.dir.y * v.len, v.dir.z * v.len, v.spread);
    CO.push(v.col === 'chem' ? 1 : 0, v.k, 0);
  }
  PS.steam = points(P, { aSeed: { a: S, n: 4 }, aDir: { a: D, n: 4 }, aK: { a: CO, n: 3 } }, ptVS(`attribute vec4 aSeed, aDir; attribute vec3 aK; uniform vec3 uShaftCol;
void main(){
  float age = fract(uTime * aSeed.y + aSeed.x);
  vec3 p = position + aDir.xyz * (age * (0.6 + 0.4 * aSeed.z));
  p.x += sin(uTime * 0.7 + aSeed.x * 20.0) * aDir.w * age; p.z += cos(uTime * 0.5 + aSeed.z * 20.0) * aDir.w * age;
  p.y += age * age * 0.8;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  vA = smoothstep(0.0, 0.12, age) * (1.0 - age) * (1.0 - fogF(-mv.z)) * aK.y;
  vC = mix(vec3(0.7, 0.8, 0.9) + uShaftCol * 0.3, uChem * 1.4 + 0.25, aK.x);
  gl_PointSize = pxSize(aSeed.w * (0.35 + age), -mv.z);
}`), ptFS(SOFT.replace('3.5', '2.2')), 8);
}
// braises (traque) et poussière qui tombe (hurlement)
{
  const N = 700, P = [], S = [];
  for (let i = 0; i < N; i++) {
    const deep = chance(0.45), p = deep ? cw(rr(-7, 6), rr(-6, 0), rr(0, 30)) : V3(rr(-5, 5), 0, rr(-6, 5));
    P.push(p.x, p.y, p.z); S.push(rnd(), rr(0.08, 0.22), rnd(), rr(0.02, 0.05));
  }
  PS.embers = points(P, { aSeed: { a: S, n: 4 } }, ptVS(`attribute vec4 aSeed;
void main(){
  float age = fract(uTime * aSeed.y * 0.5 + aSeed.x);
  vec3 p = position + vec3(sin(uTime * 0.9 + aSeed.z * 30.0) * 0.6 * age, age * 7.0, cos(uTime * 0.7 + aSeed.x * 30.0) * 0.6 * age);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float fl = 0.6 + 0.4 * sin(uTime * 13.0 + aSeed.z * 90.0);
  vA = uHunt * smoothstep(0.0, 0.1, age) * (1.0 - age) * fl * (1.0 - fogF(-mv.z));
  vC = mix(vec3(1.0, 0.35, 0.08), uBlood, 0.5) * 2.2;
  gl_PointSize = max(1.5, pxSize(aSeed.w, -mv.z));
}`), ptFS(SOFT));
  PS.embers.userData.n = N;
  const N2 = 900, P2 = [], S2 = [];
  for (let i = 0; i < N2; i++) {
    const r = rnd(), p = r < 0.25 ? V3(rr(-2.5, 3), rr(3.6, 6), rr(-1, 4)) : r < 0.7 ? V3(rr(-6, 5), rr(4.5, 9), rr(-9, 3)) : cw(rr(-7, 6), rr(5, 12), rr(0, 22));
    P2.push(p.x, p.y, p.z); S2.push(rnd(), rr(0.6, 1.4), rnd(), rr(0.016, 0.045));
  }
  PS.dust = points(P2, { aSeed: { a: S2, n: 4 } }, ptVS(`attribute vec4 aSeed; uniform float uDustT; uniform vec3 uShaftCol;
void main(){
  float tt = uDustT - aSeed.x * 1.6;
  vec3 p = position;
  p.y -= 0.5 * 2.2 * aSeed.y * tt * tt * step(0.0, tt);
  p.x += sin(tt * 2.0 + aSeed.z * 20.0) * 0.15;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  vA = step(0.0, tt) * smoothstep(0.0, 0.3, tt) * (1.0 - smoothstep(2.4, 4.2, tt)) * step(-0.5, p.y) * (1.0 - fogF(-mv.z));
  vC = vec3(0.7, 0.74, 0.76) + uShaftCol * 0.45;
  gl_PointSize = max(1.0, pxSize(aSeed.w, -mv.z));
}`), ptFS(SOFT));
  PS.dust.userData.n = N2;
}

/* ======================================================================
   14. Lumières (toutes ici)
   ====================================================================== */
scene.fog = new THREE.FogExp2(0x06100d, 0.03);
scene.background = new THREE.Color(0x050807);
const hemi = new THREE.HemisphereLight(0x22324a, 0x0c2210, 0.14); scene.add(hemi);
// Clé froide venue du puits, derrière Warwick : dessine le liseré de sa silhouette. Seule ombre portée.
const keyLight = new THREE.DirectionalLight(0xcfe0ff, 2.6);
keyLight.position.copy(KEY_TARGET).addScaledVector(LDIR, 16);
keyLight.target.position.copy(KEY_TARGET);
keyLight.castShadow = !!quality.shadows;
Object.assign(keyLight.shadow.camera, { left: -3.4, right: 3.4, top: 3.6, bottom: -3.2, near: 9, far: 24 });
keyLight.shadow.camera.updateProjectionMatrix();
keyLight.shadow.bias = -0.0006; keyLight.shadow.normalBias = 0.02;
keyLight.shadow.mapSize.set(quality.shadowMap || 2048, quality.shadowMap || 2048);
scene.add(keyLight); scene.add(keyLight.target);
// Remplissage chimique : la grille lumineuse devant lui (par en dessous, à gauche)
const chemFill = new THREE.PointLight(0x7cff4f, 1.1, 6.5, 2); chemFill.position.set(-1.15, 0.22, 2.75); scene.add(chemFill);
// Accent rouge : liseré sur l'autre flanc (côté du gyrophare de la cuve). Projecteur serré sur Warwick :
// un point lumineux noyait les fûts et la cuve de rouge saturé.
const redRim = new THREE.SpotLight(0xff2a30, 4.0, 9, 0.42, 0.75, 2);
redRim.position.set(2.5, 3.0, -2.5); redRim.target.position.set(0.05, 1.55, 0.1);
scene.add(redRim); scene.add(redRim.target);
// Lampe pratique chaude (lampadaire de gauche) : réchauffe le museau
const warmLamp = new THREE.PointLight(0xffa04a, 1.6, 9, 2); warmLamp.position.copy(LAMP).add(V3(0.1, -0.15, 0)); scene.add(warmLamp);
// Lueur de l'abîme : éclaire les façades du canyon par en dessous
const abyssLight = new THREE.PointLight(0x7cff4f, 3.0, 26, 1.5); abyssLight.position.copy(cw(0, -3.5, 12)); scene.add(abyssLight);

/* ======================================================================
   Mise à jour par image (aucune allocation)
   ====================================================================== */
const FOG_Z = new THREE.Color(0.01, 0.026, 0.032), FOG_H = new THREE.Color(0.05, 0.006, 0.008);
const TOP_Z = new THREE.Color(0.004, 0.008, 0.016), TOP_H = new THREE.Color(0.01, 0.0015, 0.002);
const KEY_Z = new THREE.Color(0xcfe0ff), KEY_H = new THREE.Color(0xffb8b4);
const SHAFT_Z = new THREE.Color(0.55, 0.68, 0.95), SHAFT_H = new THREE.Color(0.9, 0.3, 0.3);
const WARM = new THREE.Color(0xffa04a), HEMI_SKY_Z = new THREE.Color(0x22324a), HEMI_SKY_H = new THREE.Color(0x3a0c10);
const chemNow = new THREE.Color(), tmpC = new THREE.Color();
let envKey = -1, envT = -1, lastHowl = 0, howlStart = -99, canvasEl = null, viewTimer = 0;
const BASE_DENSITY = 0.03;

function drawRange(m, dens, k) { m.geometry.setDrawRange(0, Math.floor(m.userData.n * Math.min(1, dens * k))); }

function update(state, camera) {
  const t = state.t, h = state.hunt, au = state.audio || {}, bass = au.bass || 0, high = au.high || 0;
  U.uTime.value = t % 8192;   // float32 côté GPU : on reste précis même après des heures (un seul saut toutes les ~2 h 16)
  chemNow.copy(state.palette.chem).lerp(state.palette.blood, h);
  U.uChem.value.copy(chemNow); U.uBlood.value.copy(state.palette.blood);
  U.uHunt.value = h; U.uHowl.value = state.howl; U.uBass.value = bass; U.uHigh.value = high;
  U.uHead.value.copy(state.headPos);
  // Vacillement des lumières en traque + hurlement qui fait trembler les puits
  const fl = 1 - h * 0.18 * (Math.sin(t * 23.0) * Math.sin(t * 7.3) > 0.6 ? 1 : 0) - h * 0.05 * (0.5 + 0.5 * Math.sin(t * 11.0));
  U.uFlick.value = fl;
  // Brouillard et fond
  tmpC.copy(state.palette.chem).multiplyScalar(0.012);
  scene.fog.color.copy(FOG_Z).add(tmpC).lerp(FOG_H, h);
  scene.fog.density = BASE_DENSITY * (1 + h * 0.12);
  U.uFogColor.value.copy(scene.fog.color); U.uFogDensity.value = scene.fog.density;
  scene.background.copy(scene.fog.color);
  domeU.uTop.value.copy(TOP_Z).lerp(TOP_H, h);
  domeU.uGlow.value.copy(chemNow).multiplyScalar(0.06 * (1 - h * 0.3) + bass * 0.02);
  if (camera) dome.position.copy(camera.position);
  // Puits de lumière
  U.uShaftCol.value.copy(SHAFT_Z).lerp(SHAFT_H, h);
  domeU.uSky.value.copy(U.uShaftCol.value).multiplyScalar(0.05 * (1 - h * 0.5));
  const howlFl = state.howl > 0.05 ? 1 - state.howl * 0.35 * (0.5 + 0.5 * Math.sin(t * 31.0) * Math.sin(t * 17.0)) : 1;
  for (let i = 0; i < shafts.length; i++) {
    const s = shafts[i];
    s.m.material.uniforms.uInt.value = s.base * (0.88 + 0.12 * Math.sin(t * 0.3 + s.ph)) * howlFl * (1 - h * 0.25) * fl;
  }
  poolMat.uniforms.uInt.value = 0.55 * howlFl * (1 - h * 0.2);
  // Lumières
  keyLight.color.copy(KEY_Z).lerp(KEY_H, h);
  keyLight.intensity = (2.6 - h * 0.7) * howlFl * fl;
  chemFill.color.copy(chemNow); chemFill.intensity = (1.1 + bass * 1.6) * (1 - h * 0.3) * fl;
  abyssLight.color.copy(chemNow); abyssLight.intensity = (3.0 + bass * 2) * (1 - h * 0.2);
  const beacon = 0.5 + 0.5 * Math.sin(t * (1.6 + h * 3.0));
  redRim.color.copy(state.palette.blood);
  redRim.intensity = (3.2 + beacon * 1.4) * (1 + h * 1.2) + state.howl * 2.0 + (state.growl || 0) * 2.5;
  warmLamp.color.copy(WARM).lerp(state.palette.blood, h * 0.6);
  warmLamp.intensity = 1.6 * (1 - h * 0.45) * fl * (Math.sin(t * 0.37) * Math.sin(t * 5.1) > 0.92 ? 0.55 : 1);
  hemi.color.copy(HEMI_SKY_Z).lerp(HEMI_SKY_H, h); hemi.groundColor.copy(chemNow).multiplyScalar(0.06);
  hemi.intensity = 0.14 * (1 - h * 0.35);
  // Carte d'environnement : redessinée seulement quand la palette change vraiment
  const key = Math.round(h * 16) * 16777216 + chemNow.getHex();
  if (key !== envKey && t - envT > 0.15) { envKey = key; envT = t; drawEnv(chemNow, h); }
  // Chaînes qui se balancent (et vibrent au hurlement)
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    c.mesh.rotation.z = Math.sin(t * 0.6 + c.phase) * 0.025 + state.howl * Math.sin(t * 9 + c.phase) * 0.03;
    c.mesh.rotation.x = Math.sin(t * 0.45 + c.phase * 2) * 0.02;
  }
  // Poussière : départ au début du hurlement
  if (state.howl > 0.2 && lastHowl <= 0.2) howlStart = t;
  lastHowl = state.howl;
  U.uDustT.value = Math.min(99, t - howlStart);
  PS.dust.visible = U.uDustT.value < 6;   // hors hurlement : rien à dessiner
  // Particules : densité et taille en pixels
  const dens = Math.max(0, Math.min(1.5, state.particles == null ? 1 : state.particles));
  drawRange(PS.spores, dens, 1); drawRange(PS.drips, dens, 1.2); drawRange(PS.dust, dens, 1);
  PS.embers.visible = h > 0.01; drawRange(PS.embers, dens, 1);
  if (--viewTimer <= 0) {
    viewTimer = 30;
    if (!canvasEl || !canvasEl.isConnected) canvasEl = document.querySelector('#stage canvas') || document.querySelector('canvas');
    U.uViewH.value = canvasEl ? canvasEl.height : (window.innerHeight || 1080);
  }
}

function setQuality(q) {
  quality = q || quality;
  const low = quality.name === 'low';
  for (const m of mists) m.visible = !low;
  veils.visible = !low;
  meshNear.castShadow = !!quality.shadows;
}
setQuality(quality);

// Point d'ancrage pour Briar : sur la passerelle, au fond de la ruelle, tournée vers Warwick
const briarAnchor = { position: V3(-0.35, 0, -8.5).applyMatrix4(FC), rotationY: CA + 0.35 };
return { update, keyLight, setQuality, briarAnchor };
};
})();
