/* Briar — la Faim sans entrave, au fond de la ruelle, prisonnière de son pilori en forme d'ailes.
   D'après son modèle de jeu (référence visuelle seulement, tout est modélisé ici) : peau pâle lavande,
   carré blanc argenté aux pointes roses, grands yeux rouges, pilori sombre liseré d'or fendu de rouge,
   mains bloquées de part et d'autre de la tête, haut sombre, short bouffant à boucles dorées, jambes bandées.
   Contrat : WW.createBriar(THREE, opts) -> { root, update(state), getHeadWorldPosition(v) }
   main.js place `root` (position, rotation) ; tout le mouvement propre (bond du face-à-face) passe par `body`. */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
WW.createBriar = function (THREE) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0 }, o || {}));
  const M = {
    skin: std(0xb9adbd, { roughness: 0.5 }),
    hair: std(0xffffff, { roughness: 0.55, vertexColors: true }),
    top: std(0x1c1a22, { roughness: 0.6 }),
    shorts: std(0x1d1f33, { roughness: 0.65 }),
    wrap: std(0x111015, { roughness: 0.8 }),
    gold: std(0xa8803e, { metalness: 0.85, roughness: 0.32 }),
    board: std(0x2a1d18, { metalness: 0.35, roughness: 0.55 }),
    boardD: std(0x17100d, { metalness: 0.4, roughness: 0.5 }),
    rune: new THREE.MeshStandardMaterial({ color: 0xff2a3c, emissive: 0xff1030, emissiveIntensity: 2.0 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xff4060 }),
    nail: std(0x8a1428, { roughness: 0.4 }),
  };
  const root = new THREE.Group(); root.name = 'briar';
  const body = new THREE.Group(); body.name = 'briarBody'; root.add(body); // bond, demi-tour : jamais root
  const grp = (parent, p, r) => { const g = new THREE.Group(); if (p) g.position.copy(p); if (r) g.rotation.set(r[0], r[1], r[2]); parent.add(g); return g; };
  const mesh = (parent, geo, mat, p, r, s) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.copy(p); if (r) m.rotation.set(r[0], r[1], r[2]); if (s) m.scale.set(s[0], s[1], s[2]);
    parent.add(m); return m;
  };
  const UP = V(0, 1, 0), _d = V(0, 0, 0);
  // membre effilé et arrondi (cylindre + rotules) entre deux points du repère parent
  const limb = (parent, a, b, r0, r1, mat, caps) => {
    _d.subVectors(b, a); const len = _d.length();
    const m = mesh(parent, new THREE.CylinderGeometry(r1, r0, len, 12, 1, true), mat);
    m.position.copy(a).addScaledVector(_d, 0.5);
    m.quaternion.setFromUnitVectors(UP, _d.clone().normalize());
    if (caps !== false) { mesh(parent, new THREE.SphereGeometry(r0, 12, 8), mat, a); mesh(parent, new THREE.SphereGeometry(r1, 12, 8), mat, b); }
    return m;
  };
  const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 12);

  /* ---------- Bassin et jambes : debout, genoux un peu fléchis, pieds tournés en dedans ---------- */
  const HIP_Y = 0.81; // pieds posés sur le tablier (y≈0) par la cinématique inverse des jambes
  const hips = grp(body, V(0, HIP_Y, 0));
  // short bouffant
  mesh(hips, new THREE.CylinderGeometry(0.15, 0.2, 0.2, 16, 1), M.shorts, V(0, -0.06, 0));
  mesh(hips, sph(0.15), M.shorts, V(0, 0.02, 0), null, [1.05, 0.6, 0.85]);
  for (const s of [-1, 1]) {
    mesh(hips, new THREE.TorusGeometry(0.035, 0.008, 6, 12), M.gold, V(s * 0.09, -0.06, 0.15), [0, 0, 0]); // boucles
    limb(hips, V(s * 0.09, -0.01, 0.15), V(s * 0.09, -0.12, 0.155), 0.01, 0.01, M.gold, false);
  }
  mesh(hips, new THREE.TorusGeometry(0.16, 0.012, 6, 20), M.gold, V(0, 0.04, 0), [Math.PI / 2, 0, 0]); // ceinture
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = grp(hips, V(s * 0.085, -0.1, 0), [-0.35, 0, -s * 0.06]);
    limb(hip, V(0, 0, 0), V(0, -0.36, 0.0), 0.065, 0.048, M.skin);
    const knee = grp(hip, V(0, -0.36, 0), [0.6, 0, s * 0.1]);
    limb(knee, V(0, 0, 0), V(0, -0.36, 0), 0.046, 0.032, M.skin);
    // bandes noires croisées et jambières à pointes
    for (let i = 0; i < 6; i++) mesh(knee, new THREE.TorusGeometry(0.044 - i * 0.002, 0.009, 5, 14), M.wrap, V(0, -0.06 - i * 0.05, 0), [Math.PI / 2 + (i % 2 ? 0.25 : -0.25), 0, 0]);
    mesh(knee, new THREE.ConeGeometry(0.012, 0.07, 5), M.wrap, V(s * 0.04, -0.3, -0.01), [0, 0, -s * 1.4]);
    const foot = grp(knee, V(0, -0.36, 0), [-0.25, -s * 0.35, 0]);
    mesh(foot, sph(0.042, 12, 8), M.wrap, V(0, -0.02, 0.03), null, [0.9, 0.55, 1.5]);
    mesh(foot, sph(0.03, 10, 6), M.skin, V(0, -0.035, 0.09), null, [1, 0.5, 1]); // orteils nus
    legs.push({ hip, knee, foot, s });
  }

  /* ---------- Buste ---------- */
  const spine = grp(hips, V(0, 0.05, 0), [0.35, 0, 0]);
  // buste d'un seul tenant : taille fine, poitrine, épaules (profil tourné)
  const prof = [[0.0, 0.0], [0.11, 0.0], [0.1, 0.08], [0.085, 0.17], [0.11, 0.27], [0.125, 0.34], [0.12, 0.4], [0.07, 0.45], [0.0, 0.46]].map(p => new THREE.Vector2(p[0], p[1]));
  mesh(spine, new THREE.LatheGeometry(prof, 18), M.top, V(0, 0, 0), null, [1.1, 1, 0.72]);
  mesh(spine, new THREE.CylinderGeometry(0.05, 0.065, 0.06, 12), M.top, V(0, 0.46, 0)); // col montant
  mesh(spine, new THREE.TorusGeometry(0.055, 0.008, 6, 14), M.gold, V(0, 0.47, 0), [Math.PI / 2, 0, 0]);
  mesh(spine, new THREE.BoxGeometry(0.03, 0.18, 0.01), M.gold, V(0, 0.31, 0.11)); // lacet doré

  /* ---------- Tête ---------- */
  const neck = grp(spine, V(0, 0.48, 0), [-0.32, 0, 0]);
  limb(neck, V(0, 0, 0), V(0, 0.07, 0.005), 0.032, 0.03, M.skin, false);
  const head = grp(neck, V(0, 0.15, 0.01));
  mesh(head, sph(0.1, 20, 16), M.skin, V(0, 0, 0), null, [0.92, 1, 0.95]);
  mesh(head, sph(0.06, 14, 10), M.skin, V(0, -0.055, 0.035), null, [1, 0.8, 0.9]); // joues, menton
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  })();
  const eyes = [-1, 1].map(s => {
    mesh(head, sph(0.022, 12, 8), M.eye, V(s * 0.038, 0.0, 0.082), [0, s * 0.35, 0], [1, 1.15, 0.45]);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(s * 0.038, 0, 0.1); sp.scale.setScalar(0.07); head.add(sp); return sp;
  });

  // Cheveux : carré gonflé blanc argenté, pointes roses (dégradé par sommet)
  const hairWhite = new THREE.Color(0xe9e4ee), hairPink = new THREE.Color(0xe0507a);
  const tipGeo = (r, len) => {
    const g = new THREE.ConeGeometry(r, len, 6, 3);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = 0.5 - pos.getY(i) / len; // 0 à la racine, 1 à la pointe
      c.copy(hairWhite).lerp(hairPink, Math.max(0, (u - 0.45) / 0.55));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.translate(0, -len / 2, 0); // la racine à l'origine, la mèche pend vers -y
    return g;
  };
  const capGeo = new THREE.SphereGeometry(0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.4);
  { const n = capGeo.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([hairWhite.r, hairWhite.g, hairWhite.b], i * 3); capGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  mesh(head, capGeo, M.hair, V(0, 0.01, -0.012), [-0.55, 0, 0], [1.06, 1.05, 1.1]);
  mesh(head, capGeo, M.hair, V(0, -0.02, -0.03), [-1.5, 0, 0], [1.08, 1.0, 1.05]); // arrière du carré
  let seed = 233;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const strands = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, front = Math.cos(a) > 0.55;
    const len = front ? 0.08 + rnd() * 0.04 : 0.15 + rnd() * 0.07;
    const g = grp(head, V(Math.sin(a) * 0.095, 0.03 + rnd() * 0.02, Math.cos(a) * 0.09 - 0.005));
    const m = mesh(g, tipGeo(0.03 + rnd() * 0.012, len), M.hair);
    m.rotation.set(Math.cos(a) * (front ? 0.5 : 0.35), 0, -Math.sin(a) * 0.45);
    g.userData = { ph: rnd() * 6.28, m, bx: m.rotation.x, bz: m.rotation.z, fw: front ? 0.2 : 1 }; // la frange s'ébouriffe peu
    strands.push(g);
  }
  // bouche (fermée hors feulement) et crocs
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a0509 }), fangMat = new THREE.MeshBasicMaterial({ color: 0xf2e8ec });
  const mouth = grp(head, V(0, -0.07, 0.083), [0.25, 0, 0]);
  const mouthM = mesh(mouth, sph(1, 12, 8), mouthMat, null, null, [0.02, 0.004, 0.012]);
  const fangs = [-1, 1].map(s => mesh(mouth, new THREE.ConeGeometry(0.0045, 0.018, 5), fangMat, V(s * 0.011, 0.004, 0.012), [Math.PI, 0, 0]));
  mouth.visible = false;
  // l'épi sur le dessus
  mesh(head, tipGeo(0.012, 0.09), M.hair, V(0.01, 0.12, 0.0), [-2.4, 0, 0.3]);

  /* ---------- Pilori en ailes, derrière la nuque ---------- */
  const pillory = grp(spine, V(0, 0.5, -0.06), [-0.3, 0, 0.05]);
  const wing = (sx, sy) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.11 * sy);
    sh.lineTo(0.32 * sx, -0.12 * sy); sh.lineTo(0.58 * sx, -0.06 * sy); sh.lineTo(0.9 * sx, 0.07 * sy);
    sh.lineTo(0.56 * sx, 0.1 * sy); sh.lineTo(0.42 * sx, 0.2 * sy); sh.lineTo(0.2 * sx, 0.16 * sy); sh.lineTo(0, 0.14 * sy);
    sh.lineTo(-0.2 * sx, 0.16 * sy); sh.lineTo(-0.42 * sx, 0.2 * sy); sh.lineTo(-0.56 * sx, 0.1 * sy); sh.lineTo(-0.9 * sx, 0.07 * sy);
    sh.lineTo(-0.58 * sx, -0.06 * sy); sh.lineTo(-0.32 * sx, -0.12 * sy); sh.closePath();
    return sh;
  };
  const boardShape = wing(1, 1);
  const neckHole = new THREE.Path(); neckHole.absarc(0, 0, 0.05, 0, Math.PI * 2, true); boardShape.holes.push(neckHole);
  const board = new THREE.ExtrudeGeometry(boardShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
  board.translate(0, 0, -0.035);
  mesh(pillory, board, M.board);
  const rim = new THREE.ExtrudeGeometry(wing(1.035, 1.12), { depth: 0.05, bevelEnabled: false });
  rim.translate(0, 0, -0.025);
  mesh(pillory, rim, M.gold, V(0, 0, -0.012));
  // fentes rouges lumineuses et gros rivets
  for (const s of [-1, 1]) {
    mesh(pillory, new THREE.BoxGeometry(0.24, 0.012, 0.01), M.rune, V(s * 0.5, 0.02, 0.05), [0, 0, s * 0.18]);
    mesh(pillory, new THREE.BoxGeometry(0.1, 0.01, 0.01), M.rune, V(s * 0.26, -0.05, 0.05), [0, 0, -s * 0.1]);
    for (const x of [0.4, 0.62]) mesh(pillory, new THREE.CylinderGeometry(0.032, 0.032, 0.11, 12), M.boardD, V(s * x, -0.055, 0), [Math.PI / 2, 0, 0]);
    mesh(pillory, new THREE.TorusGeometry(0.045, 0.012, 6, 14), M.gold, V(s * 0.22, 0.04, 0.05)); // anneau du poignet
  }
  mesh(pillory, new THREE.TorusGeometry(0.058, 0.012, 6, 16), M.gold, V(0, 0, 0.05));

  /* ---------- Bras : mains bloquées de part et d'autre de la tête, paumes ouvertes ---------- */
  const fingers = [];
  for (const s of [-1, 1]) {
    const sh = V(s * 0.15, 0.42, -0.01), el = V(s * 0.27, 0.36, -0.03);
    mesh(spine, sph(0.045, 12, 8), M.top, sh, null, [1, 0.8, 1]);
    limb(spine, sh, el, 0.035, 0.028, M.skin);
    // l'avant-bras remonte vers l'anneau du pilori (repère de la colonne : anneau à ~(±0.22, 0.54, -0.01))
    limb(spine, el, V(s * 0.22, 0.54, -0.01), 0.028, 0.022, M.skin);
    const hand = grp(pillory, V(s * 0.22, 0.1, 0.06), [0.15, 0, s * 0.25]);
    mesh(hand, sph(0.03, 12, 8), M.skin, null, null, [1, 1.1, 0.55]);
    for (let k = 0; k < 4; k++) {
      const f = grp(hand, V((k - 1.5) * 0.016, 0.025, 0.0), [-0.15, 0, (k - 1.5) * 0.18]);
      limb(f, V(0, 0, 0), V(0, 0.045, 0.006), 0.007, 0.005, M.skin, false);
      mesh(f, new THREE.ConeGeometry(0.0055, 0.022, 5), M.nail, V(0, 0.056, 0.008));
      fingers.push(f);
    }
    const th = grp(hand, V(s * -0.028, 0.0, 0.01), [0, 0, s * 0.9]);
    limb(th, V(0, 0, 0), V(0, 0.035, 0.005), 0.007, 0.005, M.skin, false);
  }

  /* ---------- Lumière rouge qui la détache du brouillard ---------- */
  const glow = new THREE.PointLight(0xff2a3a, 1.2, 4.5, 2);
  glow.position.set(-0.3, 1.7, -0.7); body.add(glow);
  const fill = new THREE.PointLight(0xc8d4ff, 0.7, 3.5, 2); fill.position.set(0.5, 1.6, 1.4); body.add(fill);
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  /* ---------- Animation ---------- */
  // Face-à-face (state.duel, voir CONTRACT.md) : elle le fixe, se ramasse, bondit sur la passerelle vers lui,
  // feule, puis rebondit à sa place. Tout est relatif à `body` (root appartient à main.js).
  const NO_DUEL = { t: -1, briarLook: 0, alert: 0, lunge: 0, hiss: 0, flare: 0 };
  const L1 = 0.36, L2 = 0.36, FOOT_Y = 0.035, FOOT_Z = 0.03;
  // axe de la passerelle dans le repère de root (ancre = CA + 0.35) et son travers (vers le milieu du tablier)
  const WALK = -0.35, WDX = Math.sin(WALK), WDZ = Math.cos(WALK), LDX = Math.cos(WALK), LDZ = -Math.sin(WALK), LAT = 0.3;
  const DIST = 3.6, HOP = 0.55, EXT = 0.12, TUCK = 0.2, DEEP = 0.27, P0 = 0.14, P1 = 0.86;
  const cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sm = x => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
  const bump = (x, a, b, c, d) => sm((x - a) / (b - a)) * (1 - sm((x - c) / (d - c)));
  const _v = V(0, 0, 0);
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
    mouth.visible = open > 0.03;
    if (mouth.visible) { mouthM.scale.set(0.02 + open * 0.006, 0.004 + open * 0.024, 0.012); for (const f of fangs) f.position.y = 0.004 - open * 0.006; }

    /* --- Pilori : tremble et vibre (frénésie), traîne pendant le bond --- */
    const shake = hs * (Math.sin(t * 29) + Math.sin(t * 47) * 0.6);
    pillory.rotation.z = 0.05 + Math.sin(t * 0.31) * 0.03 + tw * Math.sin(t * 27) * 0.03 + shake * 0.09 + hs * Math.sin(t * 6.3 - 0.6) * 0.06;
    pillory.rotation.x = -0.3 + hs * Math.sin(t * 23) * 0.06 - air * Math.sin(2 * Math.PI * j) * 0.18 - al * 0.08;
    pillory.position.y = 0.5 + hs * (Math.sin(t * 37) * 0.01 + Math.abs(Math.sin(t * 7.5 + 0.8)) * 0.045); // elle tire sur le carcan
    // cheveux : ébouriffés et dressés au feulement, soulevés à la retombée du bond
    const fall = air ? cl(back ? 1 - 2 * j : 2 * j - 1, -1, 1) : 0;
    const flare = hs * 0.9 + al * 0.15 + fall * 0.6;
    for (const g of strands) {
      const u = g.userData, k = 1 + flare * u.fw;
      u.m.rotation.x = u.bx * k + Math.sin(t * 1.4 + u.ph) * 0.05 + hs * u.fw * Math.sin(t * 37 + u.ph * 3) * 0.18;
      u.m.rotation.z = u.bz * k + Math.sin(t * 1.1 + u.ph) * 0.04 + hs * Math.sin(t * 31 + u.ph * 5) * 0.16;
    }
    // doigts : agrippent le bois, griffent l'air en frénésie
    const grip = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.23);
    for (let k = 0; k < fingers.length; k++) {
      const claw = hs * (0.55 + 0.45 * Math.sin(t * 17 + k * 1.3));
      const fb = -0.15 - grip * 0.5 - tw * 0.4;
      fingers[k].rotation.x = fb + (-0.85 - fb) * al * (1 - hs) - claw * 1.1;
    }

    /* --- Yeux, runes, lueur : s'embrasent quand elle le repère --- */
    const blood = state.palette.blood;
    const flick = 0.85 + 0.15 * Math.sin(t * 43) * Math.sin(t * 17);
    const eyeI = (0.065 + h * 0.05 + howl * 0.03 + Math.sin(t * 5) * 0.004) * (1 + al * 0.9 + hs * 0.6 * flick);
    for (const e of eyes) { e.scale.setScalar(eyeI); e.material.color.copy(blood); }
    M.eye.color.copy(blood).lerp(hairPink, 0.3 * (1 - al));
    M.rune.emissive.copy(blood);
    M.rune.emissiveIntensity = 1.6 + h * 1.8 + state.audio.beat * 1.5 + al * 2.6 + hs * 2.4 * flick;
    glow.color.copy(blood);
    glow.intensity = 1.0 + h * 2.0 + howl * 1.0 + al * 1.4 + hs * 2.2 * flick;
  }
  function getHeadWorldPosition(v) { return head.getWorldPosition(v); }
  return { root, update, getHeadWorldPosition };
};
})();
