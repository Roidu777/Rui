/* Briar — la Faim sans entrave, au fond de la ruelle, prisonnière de son pilori en forme d'ailes.
   D'après son modèle de jeu (référence visuelle seulement, tout est modélisé ici) : peau pâle lavande,
   carré blanc argenté aux pointes roses, grands yeux rouges, pilori sombre liseré d'or fendu de rouge,
   mains bloquées de part et d'autre de la tête, haut sombre, short bouffant à boucles dorées, jambes bandées.
   Contrat : WW.createBriar(THREE, opts) -> { root, update(state) } */
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
  const root = new THREE.Group();
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
  const hips = grp(root, V(0, 0.765, 0));
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
    legs.push({ hip, knee });
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
    g.userData = { ph: rnd() * 6.28, m, bx: m.rotation.x, bz: m.rotation.z };
    strands.push(g);
  }
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
  glow.position.set(-0.3, 1.7, -0.7); root.add(glow);
  const fill = new THREE.PointLight(0xc8d4ff, 0.7, 3.5, 2); fill.position.set(0.5, 1.6, 1.4); root.add(fill);
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  /* ---------- Animation ---------- */
  function update(state) {
    const t = state.t, h = state.hunt, howl = state.howl;
    const br = Math.sin(t * 2.2 + 0.6);
    // faim : spasme irrégulier toutes les quelques secondes
    const tw = Math.pow(Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 1.13 + 1)), 6);
    hips.position.y = 0.765 + br * 0.005 - h * 0.07 + Math.sin(t * 0.31) * 0.006;
    hips.rotation.z = Math.sin(t * 0.31) * 0.04;
    spine.rotation.x = 0.35 + br * 0.015 + h * 0.18 + tw * 0.1;
    spine.rotation.y = Math.sin(t * 0.27) * 0.1;
    for (const l of legs) { l.hip.rotation.x = -0.35 - h * 0.25; l.knee.rotation.x = 0.6 + h * 0.45; }
    // elle tourne la tête vers Warwick quand il hurle, sinon elle épie en penchant la tête
    neck.rotation.y = Math.sin(t * 0.41) * 0.3 * (1 - howl) + howl * 0.5;
    neck.rotation.x = -0.32 - h * 0.12 + tw * 0.25 - howl * 0.1;
    head.rotation.z = Math.sin(t * 0.53) * 0.22 + tw * Math.sin(t * 31) * 0.06;
    pillory.rotation.z = 0.05 + Math.sin(t * 0.31) * 0.03 + tw * Math.sin(t * 27) * 0.03;
    for (const g of strands) {
      const u = g.userData;
      u.m.rotation.x = u.bx + Math.sin(t * 1.4 + u.ph) * 0.05;
      u.m.rotation.z = u.bz + Math.sin(t * 1.1 + u.ph) * 0.04;
    }
    const grip = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 0.23);
    for (const f of fingers) f.rotation.x = -0.15 - grip * 0.5 - tw * 0.4;
    const blood = state.palette.blood;
    const eyeI = 0.065 + h * 0.05 + howl * 0.03 + Math.sin(t * 5) * 0.004;
    for (const e of eyes) { e.scale.setScalar(eyeI); e.material.color.copy(blood); }
    M.eye.color.copy(blood).lerp(hairPink, 0.3);
    M.rune.emissive.copy(blood);
    M.rune.emissiveIntensity = 1.6 + h * 1.8 + state.audio.beat * 1.5;
    glow.color.copy(blood);
    glow.intensity = 1.0 + h * 2.0 + howl * 1.0;
  }
  return { root, update };
};
})();
