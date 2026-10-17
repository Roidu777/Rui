/* Briar — la Faim sans entrave, au fond de la ruelle, prisonnière de son pilori en forme d'ailes.
   D'après son modèle de jeu (référence visuelle seulement, tout est modélisé ici, visage peint au canvas) :
   peau pâle lavande, grands yeux en amande aux iris rouges, sourire en coin et deux petits crocs, carré blanc
   argenté gonflé en mèches courbes aux pointes rose-rouge, pilori sombre liseré d'or fendu de runes rouges,
   mains griffues bloquées de part et d'autre de la tête, haut sombre à col montant, short bouffant à boucles
   dorées, jambes bandées en spirale à pointes, orteils nus.
   Coût : une matière partagée (couleurs par sommet + petite texture « matières » rugosité/métal/émission),
   géométries fusionnées par os -> ~25 appels de dessin. Mèches et doigts animés par cibles de morph.
   Contrat : WW.createBriar(THREE, opts) -> { root, update(state), getHeadWorldPosition(v) }
   main.js place `root` (position, rotation) ; tout le mouvement propre (bond du face-à-face) passe par `body`. */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
WW.createBriar = function (THREE) {
  const PI = Math.PI;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const C = hex => new THREE.Color(hex).convertSRGBToLinear();
  const cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sm = x => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
  let seed = 233;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  /* ---------- Palette (sRGB -> linéaire) ---------- */
  const COL = {
    skin: C(0xdccfe4), toe: C(0xe6cbdc), knee: C(0xe2c3d6),
    top: C(0x343c39), topD: C(0x222826),
    shorts: C(0x3a3762), shortsD: C(0x24223f),
    wrap: C(0x26232d), wrapL: C(0x4b4556),
    leather: C(0x4a3226), gold: C(0xd8a24c), red: C(0x8e1a2c),
    board: C(0x553a2c), boardD: C(0x2c1d16), boardL: C(0x6e4c38),
    rune: C(0xff3a52), claw: C(0xb8163e), mouth: C(0x4a0c1a), tongue: C(0xc8506c), tooth: C(0xf6f0f4),
    hairW: C(0xf6f3fa), hairS: C(0xb9acd0), hairP: C(0xf27aaa), hairR: C(0xd0245a),
  };
  const _c = new THREE.Color();

  /* ---------- Matières : une colonne de texels par « matière » (G = rugosité, B = métal ; émission à part) ----------
     Tout le corps partage la même matière : couleur par sommet + uv qui pointe la colonne -> un appel par os. */
  const K = { cloth: 0, skin: 1, gold: 2, board: 3, rune: 4, leather: 5, claw: 6, hair: 7 };
  const RM = [[0.8, 0], [0.5, 0], [0.3, 0.9], [0.5, 0.5], [0.4, 0], [0.55, 0.15], [0.28, 0.1], [0.5, 0]];
  const rmD = new Uint8Array(32), emD = new Uint8Array(32);
  RM.forEach((v, i) => { rmD.set([255, Math.round(v[0] * 255), Math.round(v[1] * 255), 255], i * 4); emD.set(i === K.rune ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4); });
  const dtex = d => { const t = new THREE.DataTexture(d, 8, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; };
  const rmT = dtex(rmD), emT = dtex(emD);
  const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, roughnessMap: rmT, metalnessMap: rmT, emissive: 0xff1030, emissiveMap: emT, emissiveIntensity: 2 });
  const MATF = MAT.clone(); MATF.flatShading = true;   // pilori : facettes
  const MATM = MAT.clone(); MATM.morphTargets = true;  // cheveux, mains
  const MATS = [MAT, MATF, MATM];

  const root = new THREE.Group(); root.name = 'briar';
  const body = new THREE.Group(); body.name = 'briarBody'; root.add(body); // bond, demi-tour : jamais root
  const grp = (parent, p, r) => { const g = new THREE.Group(); if (p) g.position.copy(p); if (r) g.rotation.set(r[0], r[1], r[2]); parent.add(g); return g; };
  const UP = V(0, 1, 0), ZP = V(0, 0, 1);

  /* ---------- Outils de construction (exécutés une fois) ---------- */
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _s4 = V(1, 1, 1), _p4 = V(0, 0, 0), _a4 = V(0, 0, 0);
  // place une géométrie : position, rotation (euler) ou direction (Vector3 : l'axe +Y vise cette direction), échelle
  const xf = (g, p, r, s) => {
    if (r && r.isVector3) _q4.setFromUnitVectors(UP, _a4.copy(r).normalize()); else if (r) _q4.setFromEuler(_e4.set(r[0], r[1], r[2])); else _q4.identity();
    if (s == null) _s4.set(1, 1, 1); else if (typeof s === 'number') _s4.setScalar(s); else _s4.set(s[0], s[1], s[2]);
    return g.applyMatrix4(_m4.compose(p ? _p4.copy(p) : _p4.set(0, 0, 0), _q4, _s4));
  };
  const sph = (w, h) => new THREE.SphereGeometry(1, w || 12, h || 9);
  const _dv = V(0, 0, 0);
  // Lot fusionné : positions, normales, couleurs, uv « matière », déplacements de morph
  class Batch {
    constructor(nm) { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.m = []; this.count = 0; for (let k = 0; k < (nm || 0); k++) this.m.push([]); }
    add(geo, kind, col, dm) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const P = geo.attributes.position, N = geo.attributes.normal, n = P.count, b = this.count, uu = (kind + 0.5) / 8;
      for (let i = 0; i < n; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        this.p.push(x, y, z); this.n.push(N.getX(i), N.getY(i), N.getZ(i)); this.u.push(uu, 0.5);
        const c = typeof col === 'function' ? col(x, y, z, i) : col; this.c.push(c.r, c.g, c.b);
        for (let k = 0; k < this.m.length; k++) { if (dm) dm(k, i, x, y, z, _dv.set(0, 0, 0)); else _dv.set(0, 0, 0); this.m[k].push(_dv.x, _dv.y, _dv.z); }
      }
      if (geo.index) { const a = geo.index.array; for (let k = 0; k < a.length; k++) this.i.push(b + a[k]); }
      else for (let k = 0; k < n; k++) this.i.push(b + k);
      this.count += n; geo.dispose(); return this;
    }
    put(geo, kind, col, p, r, s, dm) { return this.add(xf(geo, p, r, s), kind, col, dm); }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      g.setIndex(this.i);
      if (this.m.length) { g.morphAttributes.position = this.m.map(a => new THREE.Float32BufferAttribute(a, 3)); g.morphTargetsRelative = true; }
      g.computeBoundingSphere();
      return g;
    }
    mesh(parent, mat) { const m = new THREE.Mesh(this.build(), mat || MAT); parent.add(m); return m; }
  }
  // membre de révolution : profil [[y, r], ...] croissant en y, fermé par des calottes arrondies (pas de rotules)
  const lathe = (prof, seg, lo, hi) => {
    const pts = [], f = prof[0], l = prof[prof.length - 1];
    if (lo !== false) for (let k = 0; k < 4; k++) { const a = k / 4 * PI / 2; pts.push(new THREE.Vector2(f[1] * Math.sin(a), f[0] - f[1] * 0.7 * Math.cos(a))); }
    for (const q of prof) pts.push(new THREE.Vector2(q[1], q[0]));
    if (hi !== false) for (let k = 3; k >= 0; k--) { const a = k / 4 * PI / 2; pts.push(new THREE.Vector2(l[1] * Math.sin(a), l[0] + l[1] * 0.7 * Math.cos(a))); }
    return new THREE.LatheGeometry(pts, seg || 14);
  };
  const profR = (prof, y) => { // rayon d'un profil à la hauteur y
    if (y <= prof[0][0]) return prof[0][1];
    for (let i = 1; i < prof.length; i++) if (y <= prof[i][0]) { const a = prof[i - 1], b = prof[i]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); }
    return prof[prof.length - 1][1];
  };
  // tube effilé le long d'une polyligne ; rad(u) -> [demi-largeur (B), demi-épaisseur (N)] ; ref(u, p, out) : direction N voulue
  const _T = V(0, 0, 0), _N = V(0, 0, 0), _B = V(0, 0, 0), _R = V(0, 0, 0);
  const sweep = (pts, seg, rad, ref) => {
    const n = pts.length, pos = new Float32Array(n * seg * 3), U = new Float32Array(n * seg), S = new Float32Array(n * seg), idx = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), p = pts[i];
      _T.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
      ref(u, p, _R); _N.copy(_R).addScaledVector(_T, -_R.dot(_T)).normalize(); _B.crossVectors(_T, _N);
      const r = rad(u);
      for (let k = 0; k < seg; k++) {
        const a = k / seg * PI * 2, ca = Math.cos(a) * r[0], sa = Math.sin(a) * r[1], o = i * seg + k;
        pos[o * 3] = p.x + _B.x * ca + _N.x * sa; pos[o * 3 + 1] = p.y + _B.y * ca + _N.y * sa; pos[o * 3 + 2] = p.z + _B.z * ca + _N.z * sa;
        U[o] = u; S[o] = Math.sin(a);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + (k + 1) % seg; idx.push(a, a + seg, b, b, a + seg, b + seg); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.userData.u = U; g.userData.s = S; return g;
  };

  /* ---------- Bassin : short bouffant, ceinture, boucles dorées en D, sangles ---------- */
  const HIP_Y = 0.81; // pieds posés sur le tablier (y≈0) par la cinématique inverse des jambes
  const hips = grp(body, V(0, HIP_Y, 0));
  {
    const b = new Batch();
    const prof = [[-0.15, 0.13], [-0.12, 0.147], [-0.07, 0.153], [-0.02, 0.141], [0.03, 0.114], [0.07, 0.092], [0.1, 0.087]];
    const g = lathe(prof, 22, true, false), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { // plis du tissu bouffant
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + 0.045 * Math.sin(Math.atan2(x, z) * 7 + y * 20) * sm((0.04 - y) / 0.14);
      P.setXYZ(i, x * k, y, z * k * 0.8);
    }
    g.computeVertexNormals();
    b.add(g, K.cloth, (x, y) => _c.copy(COL.shortsD).lerp(COL.shorts, sm((y + 0.15) / 0.13)));
    b.put(new THREE.TorusGeometry(0.094, 0.011, 6, 28), K.leather, COL.leather, V(0, 0.072, 0), [PI / 2, 0, 0], [1, 0.8, 1]); // ceinture
    b.put(new THREE.BoxGeometry(0.03, 0.024, 0.008), K.gold, COL.gold, V(0, 0.072, 0.077)); // boucle de ceinture
    // deux grandes boucles en D qui se chevauchent sur le devant, sangles de cuir
    for (const [x, y, s] of [[-0.042, -0.035, -1], [0.04, -0.06, 1]]) {
      const z = profR(prof, y) * 0.8 * Math.cos(x / 0.15) + 0.006;
      b.put(new THREE.TorusGeometry(0.027, 0.0065, 5, 14, PI * 1.15), K.gold, COL.gold, V(x, y, z), [0, -x * 2.5, s > 0 ? -1.05 : PI - 1.05]);
      b.put(new THREE.BoxGeometry(0.008, 0.05, 0.008), K.gold, COL.gold, V(x - s * 0.012, y, z), [0, -x * 2.5, 0]);
      b.put(new THREE.BoxGeometry(0.02, 0.1, 0.006), K.leather, COL.leather, V(x + s * 0.01, y + 0.045, z - 0.004), [-0.15, -x * 2.5, s * 0.25]);
    }
    // sacoche sur la hanche
    b.put(new THREE.BoxGeometry(0.05, 0.06, 0.03), K.leather, COL.leather, V(0.13, -0.03, -0.035), [0, 1.0, -0.15]);
    b.put(new THREE.BoxGeometry(0.012, 0.012, 0.006), K.gold, COL.gold, V(0.143, -0.015, -0.01), [0, 1.0, -0.15]);
    b.mesh(hips);
  }
  /* ---------- Jambes : cuisses fuselées, mollets bandés en spirale, pointes, orteils nus ---------- */
  const legs = [];
  const thighP = [[-0.355, 0.037], [-0.32, 0.041], [-0.24, 0.05], [-0.12, 0.059], [-0.03, 0.066], [0.03, 0.066]];
  const calfP = [[-0.375, 0.026], [-0.34, 0.027], [-0.25, 0.034], [-0.15, 0.045], [-0.08, 0.045], [-0.04, 0.041], [-0.012, 0.035], [0.008, 0.031]];
  const helix = (y0, y1, turns, prof, w, th, ph, dir) => {
    const pts = [], n = Math.ceil(turns * 14) + 1;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), y = y0 + (y1 - y0) * u, a = ph + dir * u * turns * PI * 2, r = profR(prof, y) + th + 0.0015;
      pts.push(V(Math.sin(a) * r, y + 0.006 * Math.sin(a * 2.0), Math.cos(a) * r));
    }
    return sweep(pts, 4, () => [w, th], (u, p, o) => o.set(p.x, 0, p.z));
  };
  for (const s of [-1, 1]) {
    const hip = grp(hips, V(s * 0.085, -0.1, 0), [-0.35, 0, -s * 0.06]);
    const knee = grp(hip, V(0, -0.36, 0), [0.6, 0, s * 0.1]);
    const foot = grp(knee, V(0, -0.36, 0), [-0.25, -s * 0.35, 0]);
    const bt = new Batch();
    bt.add(lathe(thighP, 16), K.skin, (x, y) => _c.copy(COL.knee).lerp(COL.skin, sm((y + 0.37) / 0.12)));
    bt.add(lathe([[-0.115, 0.077], [-0.09, 0.087], [-0.04, 0.091], [0.03, 0.084]], 16, false, false), K.cloth, (x, y) => _c.copy(COL.shortsD).lerp(COL.shorts, sm((y + 0.1) / 0.08)));
    bt.put(new THREE.TorusGeometry(0.077, 0.006, 5, 18), K.cloth, COL.shortsD, V(0, -0.115, 0), [PI / 2, 0, 0]);
    bt.mesh(hip);
    const bk = new Batch();
    bk.add(lathe(calfP, 14), K.skin, COL.skin);
    bk.put(sph(10, 8), K.skin, COL.knee, V(0, -0.005, 0.024), null, [0.02, 0.024, 0.012]); // rotule
    // bandes noires en spirale (deux couches croisées, la peau lavande perce entre les tours)
    const wc = (x, y, z, i) => _c.copy(COL.wrap).lerp(COL.wrapL, 0.25 + 0.25 * Math.sin(y * 90 + x * 40));
    bk.add(helix(-0.05, -0.36, 4.2, calfP, 0.021, 0.0035, s, 1), K.cloth, wc);
    bk.add(helix(-0.12, -0.355, 1.6, calfP, 0.014, 0.0045, s + 2, -1), K.cloth, COL.wrap);
    bk.put(new THREE.TorusGeometry(0.03, 0.006, 5, 14), K.cloth, COL.wrap, V(0, -0.345, 0), [PI / 2, 0, 0]);
    bk.put(new THREE.BoxGeometry(0.018, 0.016, 0.006), K.gold, COL.gold, V(0, -0.33, 0.031)); // boucle de cheville
    // pointes : une grosse à la cheville, une petite au mollet
    bk.put(new THREE.ConeGeometry(0.011, 0.08, 5), K.leather, COL.wrapL, V(s * 0.058, -0.325, -0.008), V(s, -0.25, -0.15));
    bk.put(new THREE.ConeGeometry(0.008, 0.045, 5), K.leather, COL.wrapL, V(s * 0.055, -0.17, -0.012), V(s, 0.35, -0.3));
    bk.mesh(knee);
    const bf = new Batch();
    bf.put(sph(14, 10), K.cloth, COL.wrap, V(0, -0.01, 0.022), null, [0.031, 0.027, 0.062]); // talon et cou-de-pied bandés
    bf.put(sph(12, 8), K.skin, COL.toe, V(0, -0.02, 0.07), null, [0.029, 0.016, 0.032]);   // avant-pied nu
    for (let k = 0; k < 5; k++) { // orteils, le gros à l'intérieur
      const r = k === 0 ? 0.0088 : 0.0068 - k * 0.0005, x = -s * (0.017 - k * 0.0085);
      bf.put(sph(8, 6), K.skin, COL.toe, V(x, -0.025, 0.1 - k * k * 0.0012 - (k ? 0.003 : 0)), null, [r, r * 0.85, r * 1.15]);
    }
    bf.put(new THREE.TorusGeometry(0.029, 0.0075, 5, 14), K.cloth, COL.wrap, V(0, -0.012, 0.045), [PI / 2 - 0.5, 0, 0], [1.05, 1, 1]);
    bf.mesh(foot);
    legs.push({ hip, knee, foot, s });
  }

  /* ---------- Buste : taille fine, haut sombre sans manches à col montant, épaules nues, liserés dorés ---------- */
  const spine = grp(hips, V(0, 0.05, 0), [0.35, 0, 0]);
  {
    const b = new Batch();
    const prof = [[-0.05, 0.088], [0.0, 0.086], [0.06, 0.079], [0.13, 0.074], [0.2, 0.085], [0.26, 0.094], [0.32, 0.097], [0.37, 0.095], [0.405, 0.084], [0.43, 0.064], [0.45, 0.042]];
    const zF = y => profR(prof, y) * 0.74;
    // haut dos-nu : épaules et omoplates nues, bande de cou (dégradé de couleur par sommet)
    const g = lathe(prof, 24, false, true);
    g.scale(1.16, 1, 0.74);
    b.add(g, K.cloth, (x, y, z) => {
      const ax = Math.abs(x), lim = 0.095 - (y - 0.3) * 0.45;
      const bare = (y > 0.3 && ax > lim) || (z < -0.02 && y > 0.29 && ax > 0.018);
      return bare ? COL.skin : _c.copy(COL.topD).lerp(COL.top, sm((y + 0.05) / 0.25));
    });
    for (const s of [-1, 1]) {
      b.put(sph(12, 10), K.cloth, COL.top, V(s * 0.04, 0.283, 0.05), [0, s * 0.35, 0], [0.04, 0.034, 0.026]); // poitrine
      b.put(sph(12, 10), K.skin, COL.skin, V(s * 0.12, 0.393, -0.004), null, [0.04, 0.035, 0.036]);           // épaules
      b.put(new THREE.BoxGeometry(0.007, 0.1, 0.004), K.gold, COL.gold, V(s * 0.03, 0.385, zF(0.385) + 0.004), [0.35, 0, s * 0.5]); // harnais en V
      b.put(new THREE.BoxGeometry(0.005, 0.16, 0.004), K.leather, COL.topD, V(s * 0.024, 0.18, zF(0.18) + 0.001)); // coutures
    }
    b.put(new THREE.TorusGeometry(0.011, 0.0035, 4, 12), K.gold, COL.gold, V(0, 0.34, zF(0.34) + 0.006));
    for (let k = 0; k < 4; k++) { // laçage doré du corset
      const y = 0.115 + k * 0.035;
      for (const s of [-1, 1]) b.put(new THREE.BoxGeometry(0.036, 0.0045, 0.003), K.gold, COL.gold, V(0, y, zF(y) + 0.002), [0, 0, s * 0.55]);
    }
    // col montant et ses liserés
    b.add(lathe([[0.425, 0.05], [0.47, 0.044], [0.53, 0.043]], 16, false, false), K.cloth, COL.top);
    b.put(new THREE.TorusGeometry(0.0435, 0.005, 5, 18), K.gold, COL.gold, V(0, 0.53, 0), [PI / 2, 0, 0]);
    b.put(new THREE.TorusGeometry(0.05, 0.005, 5, 18), K.gold, COL.gold, V(0, 0.428, 0), [PI / 2, 0, 0]);
    b.put(new THREE.BoxGeometry(0.016, 0.03, 0.006), K.gold, COL.gold, V(0, 0.47, 0.044));
    b.mesh(spine);
  }

  /* ---------- Cou et tête ---------- */
  const neck = grp(spine, V(0, 0.48, 0), [-0.32, 0, 0]);
  new Batch().add(lathe([[-0.06, 0.03], [0.03, 0.027], [0.1, 0.026]], 12, false, false), K.skin, COL.skin).mesh(neck);
  const head = grp(neck, V(0, 0.14, 0.012));
  const R = 0.1;
  // Forme de la tête : sphère déformée (face plate, mâchoire fine, petit menton pointu, nuque pleine)
  const headShape = v => {
    const t = v.y < 0 ? -v.y / R : 0, f = v.z > 0 ? v.z / R : 0;
    const x = v.x * 0.86 * (1 - 0.58 * Math.pow(t, 1.25) * (0.8 + 0.2 * f));
    const y = v.y * (v.y < 0 ? 1.06 + 0.12 * t * f : 1);
    let z = v.z * (v.z > 0 ? 0.9 - 0.16 * t * t : 1.04 - 0.3 * t * t);
    if (v.z > 0) z += 0.01 * t * t * t * f;
    return v.set(x, y, z);
  };
  const surf = (a, b, out) => headShape(out.set(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).multiplyScalar(R));
  // Visage peint au canvas, en projection équirectangulaire sur l'hémisphère avant (u' = 2u : texels hors face = bord = peau)
  const FS = 1024, SP = FS / PI, fx = a => FS / 2 + a * SP, fy = b => FS / 2 - b * SP;
  const EYE_A = 0.365, EYE_B = -0.1, MOUTH_B = -0.54;
  const drawEye = (g, s, glow) => {
    const w = 0.215 * SP, h = 0.158 * SP;
    g.save(); g.translate(fx(s * EYE_A), fy(EYE_B)); g.scale(s, 1); // +x vers l'extérieur
    const lid = () => { g.beginPath(); g.moveTo(-w, h * 0.12); g.bezierCurveTo(-w * 0.55, -h * 0.95, w * 0.45, -h * 1.15, w * 1.02, -h * 0.42); g.bezierCurveTo(w * 0.72, h * 0.55, -w * 0.35, h * 0.88, -w, h * 0.12); g.closePath(); };
    const ix = w * 0.04, iy = h * 0.02, ir = h * 0.8;
    if (!glow) {
      lid(); g.fillStyle = '#f7f1f6'; g.fill();
      g.save(); lid(); g.clip();
      let gr = g.createRadialGradient(ix, iy + ir * 0.35, ir * 0.08, ix, iy, ir);
      gr.addColorStop(0, '#ffb0c0'); gr.addColorStop(0.35, '#ff4a6e'); gr.addColorStop(0.75, '#c3123c'); gr.addColorStop(1, '#55061a');
      g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, ir, 0, PI * 2); g.fill();
      g.fillStyle = '#2a0610'; g.beginPath(); g.ellipse(ix, iy - ir * 0.05, ir * 0.24, ir * 0.32, 0, 0, PI * 2); g.fill();
      gr = g.createLinearGradient(0, -h * 1.05, 0, -h * 0.15); gr.addColorStop(0, 'rgba(70,25,60,0.6)'); gr.addColorStop(1, 'rgba(70,25,60,0)');
      g.fillStyle = gr; g.fillRect(-w * 1.2, -h * 1.3, w * 2.4, h * 1.2);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ix - ir * 0.36, iy - ir * 0.36, ir * 0.2, 0, PI * 2); g.fill();
      g.beginPath(); g.arc(ix + ir * 0.34, iy + ir * 0.36, ir * 0.09, 0, PI * 2); g.fill();
      g.restore();
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#2b1529';
      g.lineWidth = 0.024 * SP; g.beginPath(); g.moveTo(-w * 0.96, -h * 0.02); g.bezierCurveTo(-w * 0.55, -h * 1.0, w * 0.45, -h * 1.2, w * 1.1, -h * 0.6); g.stroke();
      g.lineWidth = 0.014 * SP; g.beginPath(); g.moveTo(w * 0.85, -h * 0.66); g.lineTo(w * 1.3, -h * 0.92); g.stroke();
      g.strokeStyle = 'rgba(110,60,100,0.85)'; g.lineWidth = 0.008 * SP;
      g.beginPath(); g.moveTo(w * 0.95, -h * 0.3); g.bezierCurveTo(w * 0.62, h * 0.58, -w * 0.2, h * 0.88, -w * 0.62, h * 0.58); g.stroke();
      g.strokeStyle = 'rgba(150,120,170,0.9)'; g.lineWidth = 0.011 * SP; // sourcil (presque caché par la frange)
      g.beginPath(); g.moveTo(-w * 0.75, -h * 1.75); g.quadraticCurveTo(w * 0.1, -h * (s > 0 ? 2.25 : 2.05), w * 0.95, -h * 1.75); g.stroke();
    } else {
      g.save(); lid(); g.clip();
      const gr = g.createRadialGradient(ix, iy + ir * 0.3, ir * 0.05, ix, iy, ir);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#c8c8c8'); gr.addColorStop(1, '#202020');
      g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, ir, 0, PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(ix, iy - ir * 0.05, ir * 0.26, ir * 0.34, 0, 0, PI * 2); g.fill();
      g.restore();
    }
    g.restore();
  };
  const faceCanvas = (glow) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = FS;
    const g = cv.getContext('2d');
    g.fillStyle = glow ? '#000' : '#dccfe4'; g.fillRect(0, 0, FS, FS);
    if (!glow) {
      let gr = g.createLinearGradient(0, fy(0.62), 0, fy(0.18)); // ombre de la frange sur le front
      gr.addColorStop(0, 'rgba(120,95,150,0.6)'); gr.addColorStop(1, 'rgba(120,95,150,0)'); g.fillStyle = gr; g.fillRect(0, fy(0.7), FS, fy(0.18) - fy(0.7));
      gr = g.createLinearGradient(0, fy(-0.82), 0, fy(-1.15)); // ombre sous le menton
      gr.addColorStop(0, 'rgba(120,95,150,0)'); gr.addColorStop(1, 'rgba(110,85,140,0.7)'); g.fillStyle = gr; g.fillRect(0, fy(-0.82), FS, fy(-1.4) - fy(-0.82));
      for (const s of [-1, 1]) { // joues roses
        const cx = fx(s * 0.47), cy = fy(-0.32), r = 0.15 * SP;
        gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(240,110,160,0.5)'); gr.addColorStop(1, 'rgba(240,110,160,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r * 1.3, r, 0, 0, PI * 2); g.fill();
      }
      g.lineCap = 'round'; g.strokeStyle = 'rgba(150,105,150,0.85)'; g.lineWidth = 0.009 * SP; // petit nez
      g.beginPath(); g.moveTo(fx(0.03), fy(-0.32)); g.quadraticCurveTo(fx(0.045), fy(-0.37), fx(0.012), fy(-0.385)); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(fx(-0.005), fy(-0.33), 0.008 * SP, 0, PI * 2); g.fill();
      // sourire en coin : fente sombre, coin droit relevé, deux petits crocs
      g.save(); g.translate(fx(0.0), fy(MOUTH_B));
      const mw = 0.13 * SP, q = SP;
      g.fillStyle = '#5c1426';
      g.beginPath(); g.moveTo(-mw, -0.012 * q); g.quadraticCurveTo(0, 0.03 * q, mw * 1.05, -0.05 * q); g.quadraticCurveTo(mw * 0.15, 0.08 * q, -mw, -0.012 * q); g.fill();
      g.fillStyle = '#f8f2f5';
      for (const [x0, y0] of [[-0.42, 0.006], [0.3, -0.002]]) { const x = x0 * mw, y = y0 * q; g.beginPath(); g.moveTo(x - 0.011 * q, y - 0.004 * q); g.lineTo(x + 0.011 * q, y - 0.006 * q); g.lineTo(x + 0.001 * q, y + 0.032 * q); g.closePath(); g.fill(); }
      g.strokeStyle = '#3e1428'; g.lineWidth = 0.009 * q;
      g.beginPath(); g.moveTo(-mw * 1.05, -0.016 * q); g.quadraticCurveTo(0, 0.026 * q, mw * 1.08, -0.054 * q); g.stroke();
      g.lineWidth = 0.006 * q; g.beginPath(); g.moveTo(mw * 1.0, -0.07 * q); g.quadraticCurveTo(mw * 1.12, -0.05 * q, mw * 1.06, -0.03 * q); g.stroke(); // fossette du coin
      g.strokeStyle = 'rgba(235,150,185,0.8)'; g.lineWidth = 0.007 * q;
      g.beginPath(); g.moveTo(-mw * 0.3, 0.075 * q); g.quadraticCurveTo(mw * 0.05, 0.088 * q, mw * 0.35, 0.07 * q); g.stroke();
      g.restore();
    }
    for (const s of [-1, 1]) drawEye(g, s, glow);
    const t = new THREE.CanvasTexture(cv);
    t.repeat.set(2, 1); t.anisotropy = 4;
    if (!glow) t.encoding = THREE.sRGBEncoding;
    return t;
  };
  const HEADM = new THREE.MeshStandardMaterial({ map: faceCanvas(false), emissiveMap: faceCanvas(true), emissive: 0xff2040, emissiveIntensity: 1.5, roughness: 0.55, metalness: 0 });
  {
    const W = 40, H = 30, hg = new THREE.SphereGeometry(R, W, H), P = hg.attributes.position, v = V(0, 0, 0);
    for (let i = 0; i < P.count; i++) { headShape(v.fromBufferAttribute(P, i)); P.setXYZ(i, v.x, v.y, v.z); }
    hg.computeVertexNormals();
    const N = hg.attributes.normal; // recoud la couture de la sphère
    for (let iy = 0; iy <= H; iy++) { const a = iy * (W + 1), b = a + W; v.fromBufferAttribute(N, a).add(_dv.fromBufferAttribute(N, b)).normalize(); N.setXYZ(a, v.x, v.y, v.z); N.setXYZ(b, v.x, v.y, v.z); }
    const parts = [hg];
    for (const s of [-1, 1]) { // oreilles pointues d'elfe
      const e = xf(new THREE.ConeGeometry(0.017, 0.055, 6), V(s * 0.093, -0.005, -0.012), V(s * 0.85, 0.5, -0.45), [1, 1, 0.4]);
      const uv = e.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.95, 0.5);
      parts.push(e);
    }
    const hm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(parts), HEADM); head.add(hm);
  }
  // bouche ouverte (aux aguets, feulement) : posée sur la peau, échelle animée
  const mouth = grp(head);
  {
    const p = surf(0.0, MOUTH_B - 0.01, V(0, 0, 0)), p1 = surf(0, MOUTH_B + 0.03, V(0, 0, 0)), p2 = surf(0.03, MOUTH_B - 0.01, V(0, 0, 0));
    const n = p2.sub(p).cross(p1.sub(p)).normalize();
    mouth.position.copy(p).addScaledVector(n, -0.0015); mouth.quaternion.setFromUnitVectors(ZP, n);
    const b = new Batch();
    b.put(sph(14, 10), K.cloth, COL.mouth, null, null, [0.016, 0.011, 0.005]);
    b.put(sph(10, 6), K.skin, COL.tongue, V(0, -0.006, 0.002), null, [0.01, 0.005, 0.0035]);
    b.put(new THREE.BoxGeometry(0.02, 0.0028, 0.002), K.skin, COL.tooth, V(0, 0.0085, 0.004));
    for (const s of [-1, 1]) b.put(new THREE.ConeGeometry(0.0024, 0.009, 5), K.skin, COL.tooth, V(s * 0.0075, 0.005, 0.0045), [PI, 0, 0]);
    b.mesh(mouth);
    mouth.visible = false;
  }
  // halo discret autour des iris (lisible de loin)
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  })();
  const eyes = [-1, 1].map(s => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    surf(s * (EYE_A + 0.01), EYE_B, sp.position); sp.position.z += 0.006; sp.scale.setScalar(0.02); head.add(sp); return sp;
  });

  /* ---------- Cheveux : carré gonflé en mèches courbes, frange, mèches roses qui encadrent le visage, épi ----------
     Une seule géométrie ; trois cibles de morph : vague A/B (phase propre à chaque mèche), gonflement. */
  const HC = V(0, 0.014, -0.006);
  const hb = new Batch(3);
  const hairCol = (u, t0, red) => {
    _c.copy(COL.hairS).lerp(COL.hairW, 0.45 + 0.55 * sm(u / 0.3));
    const p = sm((u - t0) / (1 - t0));
    if (p > 0) { _c.lerp(COL.hairP, p); if (red && p > 0.55) _c.lerp(COL.hairR, (p - 0.55) / 0.45 * red); }
    return _c;
  };
  const lock = (pts, w0, th0, t0, red, amp, wf) => {
    const g = sweep(pts, 6, u => [w0 * (0.4 + 0.6 * sm(u / 0.35)) * Math.pow(1 - u, 0.65) + 0.0008, th0 * (1 - 0.7 * u) + 0.0006], (u, p, o) => o.subVectors(p, HC));
    const U = g.userData.u, Sn = g.userData.s, ph = rnd() * PI * 2, jit = 0.9 + rnd() * 0.1;
    const tip = pts[pts.length - 1], out = V(tip.x - HC.x, 0, tip.z - HC.z).normalize(), lat = V(out.z, 0, -out.x);
    const dir = lat.clone().multiplyScalar(0.8).addScaledVector(out, 0.4);
    hb.add(g, K.hair, (x, y, z, i) => hairCol(U[i], t0, red).multiplyScalar(jit * (Sn[i] < -0.3 ? 0.74 : 1)), (k, i, x, y, z, d) => {
      const u = U[i];
      if (k === 0) d.copy(dir).multiplyScalar(amp * Math.pow(u, 1.6) * Math.cos(ph));
      else if (k === 1) d.copy(dir).multiplyScalar(amp * Math.pow(u, 1.6) * Math.sin(ph));
      else d.copy(out).multiplyScalar(0.6 * wf).add(_R.set(0, 0.45 * wf, 0)).multiplyScalar(0.011 * Math.pow(u, 1.5));
    });
  };
  // trajectoire sur le volume : th (depuis le sommet) de th0 à th1, azimut phi (0 = devant), rayon r0 -> r1 + pointe relevée
  const path = (phi, twist, th0, th1, r0, r1, flick, n) => {
    const pts = []; n = n || 10;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), th = th0 + (th1 - th0) * u, ph = phi + twist * u, r = r0 + (r1 - r0) * sm(u * 1.3) + flick * u * u * u;
      pts.push(V(HC.x + Math.sin(th) * Math.sin(ph) * r, HC.y + Math.cos(th) * r, HC.z + Math.sin(th) * Math.cos(ph) * r));
    }
    return pts;
  };
  {
    // sous-couche : calotte et nuque (pas de cuir chevelu entre les mèches)
    hb.put(new THREE.SphereGeometry(0.103, 24, 10, 0, PI * 2, 0, PI * 0.5), K.hair, COL.hairS, HC, [-0.38, 0, 0]);
    hb.put(new THREE.SphereGeometry(0.1065, 24, 6, 0, PI * 2, 0, PI * 0.3), K.hair, _c.copy(COL.hairS).lerp(COL.hairW, 0.7).clone(), HC);
    hb.put(new THREE.SphereGeometry(0.109, 28, 12, PI / 2 + 1.0, PI * 2 - 2.0, PI * 0.12, PI * 0.56), K.hair, (x, y) => _c.copy(COL.hairS).lerp(COL.hairW, 0.55).lerp(COL.hairP, 0.5 * sm((-0.03 - y) / 0.04)), HC, null, [1, 1.04, 1]);
    // carré : couche intérieure puis extérieure, de l'avant des oreilles jusqu'à la nuque
    for (let layer = 0; layer < 2; layer++) {
      const n = layer ? 22 : 15;
      for (let i = 0; i < n; i++) {
        const phi = 1.22 + (PI * 2 - 2.44) * (i + (layer ? 0 : 0.5)) / (n - (layer ? 1 : 0)), back = 0.5 - 0.5 * Math.cos(phi);
        const th1 = 2.05 + rnd() * 0.22 + 0.18 * back - (layer ? 0 : 0.12);
        lock(path(phi, (rnd() - 0.5) * 0.35, 0.16 + rnd() * 0.3, th1, 0.102 + layer * 0.004 + rnd() * 0.004, (layer ? 0.126 : 0.117) + rnd() * 0.008, 0.012 + rnd() * 0.014),
          layer ? 0.05 : 0.048, 0.008, 0.55 + rnd() * 0.1, 0.5, 0.008, 1);
      }
    }
    // dessus : mèches qui partent de l'épi vers l'avant et les côtés (volume)
    for (let i = 0; i < 8; i++) {
      const phi = -1.0 + 2.0 * i / 7;
      lock(path(phi, (rnd() - 0.5) * 0.3, 0.05, 1.0 + rnd() * 0.25, 0.11 + rnd() * 0.004, 0.113, 0.004), 0.03, 0.007, 0.9, 0, 0.006, 0.12);
    }
    // frange en pointes, longueurs inégales, une mèche qui balaie l'œil droit
    for (let i = 0; i < 9; i++) {
      const phi = -0.72 + 1.44 * i / 8;
      lock(path(phi, -0.12 + (rnd() - 0.5) * 0.2, 0.28 + rnd() * 0.12, 1.28 + rnd() * 0.17 - Math.abs(phi) * 0.05, 0.105, 0.11, -0.01), 0.022, 0.006, 0.82, 0, 0.004, 0.08);
    }
    lock(path(0.25, -0.85, 0.3, 1.62, 0.106, 0.11, -0.008, 12), 0.022, 0.006, 0.7, 0.3, 0.006, 0.08);
    // mèches qui encadrent le visage, devant les oreilles : rose puis rouge, recourbées vers l'avant
    for (const s of [-1, 1]) for (const [phi, th1, w] of [[0.98, 2.62, 0.02], [1.14, 2.45, 0.022], [0.86, 2.2, 0.016]]) {
      const pts = path(s * phi, s * 0.06, 0.55, th1, 0.106, 0.114, 0.0, 11);
      for (let i = 7; i < pts.length; i++) { const k = (i - 6) / (pts.length - 7); pts[i].z += 0.022 * k * k; pts[i].x -= s * 0.012 * k * k; pts[i].y += 0.01 * k * k * k; }
      lock(pts, w, 0.0075, 0.3, 1, 0.014, 1.2);
    }
    // épi (ahoge)
    lock([V(0.004, 0.098, 0.0), V(0.008, 0.14, -0.006), V(0.012, 0.175, 0.006), V(0.014, 0.19, 0.032), V(0.012, 0.18, 0.058), V(0.009, 0.162, 0.068)], 0.006, 0.004, 0.75, 0.3, 0.01, 0.5);
  }
  const hairM = hb.mesh(head, MATM);

  /* ---------- Pilori en ailes, derrière la nuque : plaques en relief, filigrane doré, découpes, runes et œil rouges ---------- */
  const pillory = grp(spine, V(0, 0.5, -0.06), [-0.3, 0, 0.05]);
  {
    const half = [[0, 0.15], [0.13, 0.17], [0.3, 0.205], [0.4, 0.255], [0.47, 0.16], [0.6, 0.13], [0.92, 0.065], [0.63, -0.02], [0.52, -0.085], [0.36, -0.115], [0.16, -0.13], [0, -0.12]];
    const wing = (kx, ky, dy) => {
      const sh = new THREE.Shape(), all = half.concat(half.slice(1, -1).reverse().map(p => [-p[0], p[1]]));
      all.forEach((p, i) => (i ? sh.lineTo(p[0] * kx, p[1] * ky + (dy || 0)) : sh.moveTo(p[0] * kx, p[1] * ky + (dy || 0))));
      sh.closePath(); return sh;
    };
    const ext = (sh, depth, bev) => new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bev, bevelThickness: bev || 0, bevelSize: bev || 0, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -depth / 2);
    const b = new Batch();
    const hole = (sh, cx, cy, r) => { const h = new THREE.Path(); h.absarc(cx, cy, r, 0, PI * 2, true); sh.holes.push(h); };
    const main = wing(1, 1); hole(main, 0, 0, 0.05);
    b.add(ext(main, 0.055, 0.01), K.board, (x, y) => _c.copy(COL.boardD).lerp(COL.board, sm((y + 0.12) / 0.3)));
    b.put(ext(wing(1.035, 1.13), 0.04), K.gold, COL.gold, V(0, 0, -0.008)); // liseré doré qui dépasse tout autour
    // plaque avant en relief, ajourée : les fentes laissent voir des runes rouges
    const plate = wing(0.86, 0.7, 0.012); hole(plate, 0, 0, 0.068);
    const slots = [];
    for (const s of [-1, 1]) for (const [x0, y0, x1, y1] of [[0.25, -0.03, 0.4, 0.04], [0.68, 0.05, 0.8, 0.035], [0.25, 0.07, 0.36, 0.1]]) {
      const h = new THREE.Path(), dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * 0.011, ny = dx / l * 0.011;
      h.moveTo(s * (x0 + nx), y0 + ny); h.lineTo(s * (x1 + nx * 0.4), y1 + ny * 0.4); h.lineTo(s * (x1 - nx * 0.4), y1 - ny * 0.4); h.lineTo(s * (x0 - nx), y0 - ny); h.closePath();
      plate.holes.push(h); slots.push([s * (x0 + x1) / 2, (y0 + y1) / 2, l, Math.atan2(dy, s * dx)]);
    }
    b.put(ext(plate, 0.012, 0.004), K.board, COL.boardL, V(0, 0, 0.0435));
    for (const [x, y, l, a] of slots) b.put(new THREE.BoxGeometry(l * 0.95, 0.012, 0.004), K.rune, COL.rune, V(x, y, 0.039), [0, 0, a]);
    for (const s of [-1, 1]) {
      // médaillon à l'œil rouge
      b.put(new THREE.CylinderGeometry(0.058, 0.064, 0.018, 18), K.board, COL.boardD, V(s * 0.53, 0.03, 0.058), [PI / 2, 0, 0]);
      b.put(new THREE.TorusGeometry(0.058, 0.006, 5, 22), K.gold, COL.gold, V(s * 0.53, 0.03, 0.067));
      b.put(sph(16, 8), K.rune, COL.rune, V(s * 0.53, 0.03, 0.066), null, [0.036, 0.016, 0.006]);
      b.put(new THREE.BoxGeometry(0.007, 0.03, 0.004), K.board, COL.boardD, V(s * 0.53, 0.03, 0.072));
      for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2 + 0.3; b.put(new THREE.TetrahedronGeometry(0.008), K.gold, COL.gold, V(s * 0.53 + Math.cos(a) * 0.045, 0.03 + Math.sin(a) * 0.045, 0.069)); }
      // runes en zigzag
      for (const [x, y] of [[0.73, 0.075], [0.39, -0.075]]) for (let k = 0; k < 3; k++) b.put(new THREE.BoxGeometry(k === 1 ? 0.03 : 0.018, 0.005, 0.004), K.rune, COL.rune, V(s * (x + (k - 1) * 0.004), y + (1 - k) * 0.011, 0.058), [0, 0, k === 1 ? -s * 0.9 : 0]);
      // filigrane doré : volutes
      for (const [x, y, r, a] of [[0.2, 0.135, 0.028, 0.2], [0.33, 0.165, 0.022, 2.6], [0.68, 0.105, 0.024, 0.1], [0.36, -0.095, 0.026, 3.6], [0.64, -0.035, 0.02, 3.3]]) {
        b.put(new THREE.TorusGeometry(r, 0.0035, 4, 14, PI * 1.35), K.gold, COL.gold, V(s * x, y, 0.058), [0, s > 0 ? 0 : PI, a]);
        b.put(new THREE.TorusGeometry(r * 0.45, 0.003, 4, 10, PI * 1.5), K.gold, COL.gold, V(s * (x + r * 0.55), y - r * 0.1, 0.058), [0, s > 0 ? 0 : PI, a + 2.2]);
      }
      for (let k = 0; k < 9; k++) { const x = 0.12 + k * 0.075; b.put(sph(6, 4), K.gold, COL.gold, V(s * x, -0.088 + Math.max(0, x - 0.5) * 0.18 + 0.004 * (k % 2), 0.055), null, 0.007); }
      // gros boulons
      for (const x of [0.3, 0.62]) {
        b.put(new THREE.CylinderGeometry(0.033, 0.033, 0.11, 14), K.board, COL.boardD, V(s * x, -0.068 + (x > 0.5 ? 0.02 : 0), 0), [PI / 2, 0, 0]);
        b.put(new THREE.TorusGeometry(0.03, 0.006, 5, 14), K.gold, COL.gold, V(s * x, -0.068 + (x > 0.5 ? 0.02 : 0), 0.055));
      }
      // pointes du bord supérieur
      b.put(new THREE.ConeGeometry(0.014, 0.07, 5), K.board, COL.boardL, V(s * 0.2, 0.19, 0), V(s * 0.2, 1, -0.1));
      // carcan des poignets : anneau doré épais + ferrure
      b.put(new THREE.TorusGeometry(0.028, 0.0095, 6, 16), K.gold, COL.gold, V(s * 0.215, 0.035, 0.09), [PI / 2, 0, 0]);
      b.put(new THREE.BoxGeometry(0.03, 0.022, 0.05), K.board, COL.boardD, V(s * 0.215, 0.035, 0.05));
    }
    // fente rouge en V au-dessus de la nuque
    for (const s of [-1, 1]) b.put(new THREE.BoxGeometry(0.006, 0.07, 0.004), K.rune, COL.rune, V(s * 0.018, 0.1, 0.058), [0, 0, -s * 0.3]);
    b.put(new THREE.TorusGeometry(0.062, 0.009, 6, 20), K.gold, COL.gold, V(0, 0, 0.05)); // anneau du cou
    b.mesh(pillory, MATF);
  }
  // bouts de chaîne cassée qui pendent sous les ailes (balancier)
  const chains = [-1, 1].map(s => {
    const g = grp(pillory, V(s * 0.74, 0.0, 0.0));
    const b = new Batch();
    for (let k = 0; k < 4; k++) b.put(new THREE.TorusGeometry(0.014, 0.004, 4, 10, k === 3 ? PI * 1.4 : PI * 2), K.gold, COL.gold, V(0, -0.012 - k * 0.022, 0), [0, k % 2 ? PI / 2 : 0, PI / 2], [1.25, 1, 1]);
    b.mesh(g, MATF); return g;
  });

  /* ---------- Bras (cinématique inverse épaule -> carcan) et mains griffues (morph de fermeture) ---------- */
  const LU = 0.2, LF = 0.19;
  const arms = [];
  const hands = [];
  const buildHand = (s, c) => {
    const b = new Batch();
    b.put(sph(12, 10), K.skin, COL.skin, V(0, 0.038, 0.0), null, [0.0225, 0.029, 0.0095]);
    b.put(new THREE.CylinderGeometry(0.0135, 0.016, 0.03, 10), K.skin, COL.skin, V(0, 0.006, 0), null, [1, 1, 0.75]);
    const F = [[0.034, 0.025], [0.037, 0.027], [0.034, 0.025], [0.027, 0.02]];
    const dir = (a, cu, o) => o.set(-Math.sin(a) * Math.cos(cu), Math.cos(a) * Math.cos(cu), Math.sin(cu));
    const d1 = V(0, 0, 0), d2 = V(0, 0, 0);
    const finger = (base, a, cu, L1, L2, r) => {
      dir(a, cu, d1); dir(a, cu * 2.1, d2);
      const j = base.clone().addScaledVector(d1, L1), tip = j.clone().addScaledVector(d2, L2);
      const pts = [base, base.clone().addScaledVector(d1, L1 * 0.5), j, j.clone().addScaledVector(d2, L2 * 0.5), tip];
      b.add(sweep(pts, 6, u => [r * (1 - 0.35 * u), r * (1 - 0.35 * u)], (u, p, o) => o.set(1, 0, 0)), K.skin, COL.skin);
      b.put(new THREE.ConeGeometry(r * 0.75, 0.017, 5), K.claw, COL.claw, tip.clone().addScaledVector(d2, 0.006), _a4.copy(d2).addScaledVector(dir(a, cu * 2.1 + 0.6, d1), 0.4));
    };
    for (let k = 0; k < 4; k++) {
      const x = -s * (0.018 - k * 0.012), a = s * (0.22 - k * 0.15);
      finger(V(x, 0.062 - Math.abs(k - 1.3) * 0.003, 0.001), a, c * (0.9 + k * 0.07), F[k][0], F[k][1], 0.0058 - k * 0.0004);
    }
    finger(V(-s * 0.022, 0.022, 0.006), s * 0.85, 0.35 + c * 0.5, 0.024, 0.02, 0.0062); // pouce
    return b;
  };
  for (const s of [-1, 1]) {
    const ua = new Batch();
    ua.add(lathe([[0, 0.032], [0.05, 0.031], [0.13, 0.026], [0.2, 0.023]], 12), K.skin, COL.skin);
    ua.put(new THREE.TorusGeometry(0.031, 0.005, 4, 14), K.cloth, COL.wrap, V(0, 0.045, 0), [PI / 2, 0, 0]); // brassard
    ua.put(new THREE.TorusGeometry(0.0305, 0.003, 4, 14), K.gold, COL.gold, V(0, 0.058, 0), [PI / 2, 0, 0]);
    const fa = new Batch();
    fa.add(lathe([[0, 0.023], [0.04, 0.025], [0.12, 0.02], [0.19, 0.016]], 12), K.skin, COL.skin);
    fa.add(lathe([[0.05, 0.027], [0.1, 0.028], [0.16, 0.023], [0.178, 0.022]], 12, false, false), K.cloth, (x, y) => _c.copy(COL.wrap).lerp(COL.wrapL, 0.3 * Math.sin(y * 160) * 0.5 + 0.15));
    fa.put(new THREE.TorusGeometry(0.0285, 0.0035, 4, 14), K.cloth, COL.red, V(0, 0.09, 0), [PI / 2, 0, 0]);
    fa.put(new THREE.TorusGeometry(0.023, 0.0035, 4, 14), K.gold, COL.gold, V(0, 0.176, 0), [PI / 2, 0, 0]);
    arms.push({ s, upper: ua.mesh(spine), fore: fa.mesh(spine), sh: V(s * 0.125, 0.392, -0.004), wr: V(s * 0.215, 0.035, 0.09), pole: V(s * 0.75, -0.8, 0.45).normalize() });
    const hand = grp(pillory, V(s * 0.215, 0.035, 0.09), [0.2, 0, -s * 0.15]);
    const poses = [0.22, 0.72, 1.25].map(c => buildHand(s, c).build());
    const g0 = poses[0], P0 = g0.attributes.position.array;
    g0.morphAttributes.position = poses.slice(1).map(g => { const a = g.attributes.position.array, d = new Float32Array(a.length); for (let i = 0; i < a.length; i++) d[i] = a[i] - P0[i]; g.dispose(); return new THREE.BufferAttribute(d, 3); });
    g0.morphTargetsRelative = true; g0.computeBoundingSphere();
    const hm = new THREE.Mesh(g0, MATM); hand.add(hm);
    hands.push({ s, m: hm });
  }

  /* ---------- Lumière rouge qui la détache du brouillard ---------- */
  const glow = new THREE.PointLight(0xff2a3a, 1.2, 4.5, 2);
  glow.position.set(-0.3, 1.7, -0.7); body.add(glow);
  const fill = new THREE.PointLight(0xd8dcff, 1.5, 3.2, 2); fill.position.set(0.25, 1.75, 1.0); body.add(fill); // éclaire le visage
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  /* ---------- Animation ---------- */
  // Face-à-face (state.duel, voir CONTRACT.md) : elle le fixe, se ramasse, bondit sur la passerelle vers lui,
  // feule, puis rebondit à sa place. Tout est relatif à `body` (root appartient à main.js).
  const NO_DUEL = { t: -1, briarLook: 0, alert: 0, lunge: 0, hiss: 0, flare: 0 };
  const L1 = 0.36, L2 = 0.36, FOOT_Y = 0.035, FOOT_Z = 0.03;
  // axe de la passerelle dans le repère de root (ancre = CA + 0.35) et son travers (vers le milieu du tablier)
  const WALK = -0.35, WDX = Math.sin(WALK), WDZ = Math.cos(WALK), LDX = Math.cos(WALK), LDZ = -Math.sin(WALK), LAT = 0.3;
  const DIST = 3.6, HOP = 0.55, EXT = 0.12, TUCK = 0.2, DEEP = 0.27, P0 = 0.14, P1 = 0.86;
  const bump = (x, a, b, c, d) => sm((x - a) / (b - a)) * (1 - sm((x - c) / (d - c)));
  const _v = V(0, 0, 0), _w = V(0, 0, 0), _el = V(0, 0, 0), _pp = V(0, 0, 0), _dd = V(0, 0, 0), _tt = V(0, 0, 0);
  // Jambe à deux os dans son plan sagittal : pied (repère de body) posé en (fy, fz), bassin en (hy, hz) incliné de hp
  function legIK(l, hy, hz, hp, fy, fz, toe) {
    const c = Math.cos(hp), s = Math.sin(hp);
    const by = fy - (hy - 0.1 * c), bz = fz - (hz - 0.1 * s);
    const dy = by * c + bz * s, dz = -by * s + bz * c;
    const D = cl(Math.sqrt(dy * dy + dz * dz), 0.2, L1 + L2 - 0.008);
    const b = Math.PI - Math.acos(cl((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const a = Math.atan2(-dz, -dy) - Math.acos(cl((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    l.hip.rotation.x = a; l.knee.rotation.x = b;
    l.foot.rotation.x = toe - (a + b + hp); // pied à plat (toe = 0) ou pointe tendue en vol
  }
  // Bras : épaule (colonne) -> poignet tenu par le carcan (pilori), coude poussé vers le pôle
  function armIK(a) {
    _w.copy(a.wr).applyMatrix4(pillory.matrix);
    _dd.subVectors(_w, a.sh); const d = cl(_dd.length(), 0.06, LU + LF - 0.002); _dd.normalize();
    const ax = (LU * LU + d * d - LF * LF) / (2 * d), hh = Math.sqrt(Math.max(0, LU * LU - ax * ax));
    _pp.copy(a.pole).addScaledVector(_dd, -a.pole.dot(_dd)).normalize();
    _el.copy(a.sh).addScaledVector(_dd, ax).addScaledVector(_pp, hh);
    a.upper.position.copy(a.sh); a.upper.quaternion.setFromUnitVectors(UP, _tt.subVectors(_el, a.sh).normalize());
    a.fore.position.copy(_el); a.fore.quaternion.setFromUnitVectors(UP, _tt.subVectors(_w, _el).normalize());
  }

  function update(state) {
    const t = state.t, h = state.hunt, howl = state.howl;
    const D = state.duel || NO_DUEL, td = D.t;
    const al = D.alert || 0, hs = D.hiss || 0, lg = D.lunge || 0;
    const br = Math.sin(t * 2.2 + 0.6);
    // faim : spasme irrégulier toutes les quelques secondes (étouffé quand elle guette)
    const tw = Math.pow(Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 1.13 + 1)), 6) * (1 - al * 0.7);

    /* --- Bond : élan accroupi, arc de saut, réception accroupie (même courbe à l'envers au retour) --- */
    const j = cl((lg - P0) / (P1 - P0), 0, 1), air = lg > P0 && lg < P1 ? 1 : 0, arc = Math.sin(Math.PI * j);
    const back = td > 6.5 ? 1 : 0;                         // le retour (lunge 1 -> 0) : elle recule face à lui
    const coil = td >= 0 ? bump(td, 3.6, 4.15, 4.35, 4.7) + bump(td, 7.1, 7.55, 7.75, 8.1) : 0; // elle se tasse avant chaque bond
    const base = h * 0.07 + al * 0.13 + coil * 0.08 + hs * 0.05;
    let drop;
    if (air) drop = DEEP - EXT * arc;
    else if (lg <= P0) drop = base + (DEEP - base) * sm(lg / P0);
    else drop = base + (DEEP - base) * sm((1 - lg) / (1 - P1));
    const hop = air ? HOP * 4 * j * (1 - j) : 0, d = DIST * j;
    const lat = LAT * j; // elle se recentre sur le tablier : les ailes du pilori restent entre les garde-corps
    body.position.set(WDX * d + LDX * lat, hop, WDZ * d + LDZ * lat);
    // elle pivote vers Warwick pendant le bond (en l'air : les pieds ne glissent pas)
    root.updateWorldMatrix(true, false);
    _v.copy(state.headPos); root.worldToLocal(_v);
    const yawW = Math.atan2(_v.x - body.position.x, _v.z - body.position.z);
    body.rotation.y = cl(yawW, -1.2, 1.2) * sm(j * 1.4 - 0.2);

    const pump = hs * Math.abs(Math.sin(t * 7.5));        // frénésie : elle pompe sur ses jambes
    const hy = HIP_Y + br * 0.005 - drop + Math.sin(t * 0.31) * 0.006 - pump * 0.06, hz = -drop * 0.22 + hs * 0.05;
    hips.position.set(hs * Math.sin(t * 23) * 0.006, hy, hz);
    hips.rotation.z = Math.sin(t * 0.31) * 0.04 * (1 - al * 0.6);
    const hp = 0;
    for (const l of legs) {
      // vol : jambes repliées sous elle, pieds qui traînent au décollage et se tendent vers la réception
      const fy = FOOT_Y + (air ? hop + TUCK * arc : 0);
      const fz = FOOT_Z + (air ? 0.24 * (j - 0.5) * arc : 0);
      legIK(l, hy, hz, hp, fy, fz, air ? 0.7 * arc : 0);
    }

    /* --- Buste : penché, plus encore aux aguets, en piqué pendant le bond, projeté en avant au feulement --- */
    const lean = 0.35 + br * 0.015 * (1 - hs) + h * 0.18 + tw * 0.1 + al * 0.14 + coil * 0.2 + hs * 0.28
      + air * arc * (back ? -0.12 : 0.38);
    spine.rotation.x = lean + hs * Math.sin(t * 19) * 0.03;
    spine.rotation.z = hs * (Math.sin(t * 6.3) * 0.13 + Math.sin(t * 17) * 0.03); // elle se débat d'une épaule à l'autre (lisible de face)
    const look = Math.max(D.briarLook || 0, howl * 0.8);
    // le regard : torse puis cou, visés dans les bons repères (hanches, puis colonne), mélangés à l'inactif
    hips.updateWorldMatrix(true, false);
    _v.copy(state.headPos); hips.worldToLocal(_v);
    const yawH = Math.atan2(_v.x, _v.z - 0.12);
    spine.rotation.y = Math.sin(t * 0.27) * 0.1 * (1 - look) + cl(yawH, -1.4, 1.4) * 0.4 * look;
    spine.updateWorldMatrix(false, false);
    _v.copy(state.headPos); spine.worldToLocal(_v);
    _v.y -= 0.6; _v.z -= 0.08; // depuis la base de la tête
    const aimX = Math.atan2(-_v.y, _v.z), aimY = Math.asin(cl(_v.x / (_v.length() || 1), -1, 1));
    const idleY = Math.sin(t * 0.41) * 0.3, idleX = -0.32 - h * 0.12 + tw * 0.25;
    // aux aguets : tête basse, regard par en dessous ; feulement : cou tendu vers lui
    neck.rotation.y = idleY + (cl(aimY, -1.3, 1.3) - idleY) * look + hs * (Math.sin(t * 27) * 0.05 + Math.sin(t * 11) * 0.12);
    neck.rotation.x = idleX + (aimX + 0.1 * al - 0.12 * hs - idleX) * look;
    neck.position.z = hs * 0.035;
    head.position.z = 0.01 + hs * 0.045;
    head.rotation.z = Math.sin(t * 0.53) * 0.22 * (1 - look * 0.6) + 0.12 * al * (1 - hs) + tw * Math.sin(t * 31) * 0.06
      + hs * Math.sin(t * 33) * 0.08;
    head.rotation.x = -0.18 * hs;
    // bouche : entrouverte aux aguets, grande ouverte au feulement
    const open = al * 0.25 * (1 - hs) + hs * (0.85 + 0.15 * Math.sin(t * 41));
    mouth.visible = open > 0.05;
    if (mouth.visible) mouth.scale.set(0.75 + 0.3 * open, 0.2 + 0.85 * open, 1);

    /* --- Pilori : tremble et vibre (frénésie), traîne pendant le bond --- */
    const shake = hs * (Math.sin(t * 29) + Math.sin(t * 47) * 0.6);
    pillory.rotation.z = 0.05 + Math.sin(t * 0.31) * 0.03 + tw * Math.sin(t * 27) * 0.03 + shake * 0.09 + hs * Math.sin(t * 6.3 - 0.6) * 0.06;
    pillory.rotation.x = -0.3 + hs * Math.sin(t * 23) * 0.06 - air * Math.sin(2 * Math.PI * j) * 0.18 - al * 0.08;
    pillory.position.y = 0.5 + hs * (Math.sin(t * 37) * 0.01 + Math.abs(Math.sin(t * 7.5 + 0.8)) * 0.045); // elle tire sur le carcan
    pillory.updateMatrix();
    for (const a of arms) armIK(a);
    for (let k = 0; k < 2; k++) {
      const c = chains[k], s = k ? 1 : -1;
      c.rotation.z = -pillory.rotation.z * 0.8 + Math.sin(t * 1.7 + s) * 0.08 + shake * 0.25 + spine.rotation.z * -0.6;
      c.rotation.x = Math.sin(t * 1.3 + s * 2) * 0.06 - air * arc * 0.5 + hs * Math.sin(t * 21 + s) * 0.15;
    }
    // cheveux : vague lente à phase propre à chaque mèche, ébouriffés au feulement, soulevés à la retombée du bond
    const fall = air ? cl(back ? 1 - 2 * j : 2 * j - 1, -1, 1) : 0;
    const hi = hairM.morphTargetInfluences, wa = t * 1.4, wb = t * 37;
    hi[0] = 0.6 * Math.sin(wa) + hs * 0.5 * Math.sin(wb) + tw * 0.4 * Math.sin(t * 29);
    hi[1] = 0.6 * Math.cos(wa) + hs * 0.5 * Math.cos(wb);
    hi[2] = hs * 0.5 + al * 0.2 + fall * 0.7;
    // mains : agrippent, griffent l'air en frénésie
    const grip = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.23);
    for (const hd of hands) {
      let g = 0.12 + grip * 0.3 + tw * 0.3;
      g += (0.62 - g) * al * (1 - hs);
      g += (0.15 + 0.8 * (0.5 + 0.5 * Math.sin(t * 17 + hd.s * 1.3)) - g) * hs;
      g = cl(g, 0, 1);
      const mi = hd.m.morphTargetInfluences;
      mi[0] = g < 0.5 ? g * 2 : 2 - g * 2; mi[1] = g < 0.5 ? 0 : g * 2 - 1;
    }

    /* --- Yeux, runes, lueur : s'embrasent quand elle le repère --- */
    const blood = state.palette.blood;
    const flick = 0.85 + 0.15 * Math.sin(t * 43) * Math.sin(t * 17);
    const eyeI = (0.02 + h * 0.012 + howl * 0.008 + Math.sin(t * 5) * 0.001) * (1 + al * 0.9 + hs * 0.6 * flick);
    for (const e of eyes) { e.scale.setScalar(eyeI); e.material.color.copy(blood); }
    HEADM.emissive.copy(blood);
    HEADM.emissiveIntensity = (0.9 + h * 0.8 + howl * 0.4) * (1 + al * 1.4 + hs * 0.8 * flick);
    const ri = 1.6 + h * 1.8 + state.audio.beat * 1.5 + al * 2.6 + hs * 2.4 * flick;
    for (const m of MATS) { m.emissive.copy(blood); m.emissiveIntensity = ri; }
    glow.color.copy(blood);
    glow.intensity = 1.0 + h * 2.0 + howl * 1.0 + al * 1.4 + hs * 2.2 * flick;
  }
  function getHeadWorldPosition(v) { return head.getWorldPosition(v); }
  return { root, update, getHeadWorldPosition };
};
})();
