/* Briar — la Faim sans entrave, tapie au fond de la ruelle, mains et cou pris dans son pilori.
   Silhouette d'arrière-plan : lisible par sa forme (pilori, cheveux écarlates, yeux rouges), peu coûteuse.
   Contrat : WW.createBriar(THREE, opts) -> { root, update(state) } */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
WW.createBriar = function (THREE, opts) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o || {}));
  const M = {
    skin: std(0xcdb9bd, { roughness: 0.55 }),
    hair: std(0xa3182e, { roughness: 0.6, emissive: 0x3a0510, emissiveIntensity: 0.6 }),
    hairD: std(0x5c0a18, { roughness: 0.7 }),
    cloth: std(0x1a0c12), clothR: std(0x6e0f1e, { roughness: 0.6 }),
    wood: std(0x4b2d1c, { roughness: 0.85 }),
    gold: std(0x8a6a34, { metalness: 0.8, roughness: 0.35 }),
    iron: std(0x3c3c44, { metalness: 0.8, roughness: 0.45 }),
    gem: new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1028, emissiveIntensity: 2.2 }),
  };
  const root = new THREE.Group();
  const grp = (parent, p, r) => { const g = new THREE.Group(); if (p) g.position.copy(p); if (r) g.rotation.set(r[0], r[1], r[2]); parent.add(g); return g; };
  const mesh = (parent, geo, mat, p, r, s) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.copy(p); if (r) m.rotation.set(r[0], r[1], r[2]); if (s) m.scale.set(s[0], s[1], s[2]);
    m.castShadow = false; m.receiveShadow = false; parent.add(m); return m;
  };
  const UP = V(0, 1, 0), _d = V(0, 0, 0);
  // cylindre effilé entre deux points (repère du parent)
  const seg = (parent, a, b, r0, r1, mat) => {
    _d.subVectors(b, a); const len = _d.length();
    const m = mesh(parent, new THREE.CylinderGeometry(r1, r0, len, 7), mat);
    m.position.copy(a).addScaledVector(_d, 0.5);
    m.quaternion.setFromUnitVectors(UP, _d.normalize());
    return m;
  };
  const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 10, h || 8);

  /* ---------- Corps, accroupie, prête à bondir ---------- */
  const hips = grp(root, V(0, 0.62, 0));
  mesh(hips, sph(0.15), M.cloth, null, null, [1.1, 0.8, 0.9]);
  // jupe en lambeaux
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    mesh(hips, new THREE.ConeGeometry(0.06, 0.26, 4), i % 3 ? M.cloth : M.clothR,
      V(Math.sin(a) * 0.13, -0.1, Math.cos(a) * 0.12), [Math.PI + Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = grp(hips, V(s * 0.09, -0.02, 0), [-1.0, 0, s * 0.12]);
    seg(thigh, V(0, 0, 0), V(0, -0.42, 0), 0.07, 0.055, M.cloth);
    const knee = grp(thigh, V(0, -0.42, 0), [1.6, 0, 0]);
    seg(knee, V(0, 0, 0), V(0, -0.42, 0), 0.05, 0.035, M.cloth);
    mesh(knee, sph(0.055, 7, 5), M.clothR, V(0, 0, 0.01));
    const foot = grp(knee, V(0, -0.42, 0), [-0.6, 0, 0]);
    mesh(foot, new THREE.BoxGeometry(0.07, 0.05, 0.18), M.cloth, V(0, -0.02, 0.06));
    legs.push({ thigh, knee });
  }
  const spine = grp(hips, V(0, 0.05, 0), [0.6, 0, 0]);
  mesh(spine, sph(0.13), M.cloth, V(0, 0.18, 0), null, [1, 1.3, 0.8]);
  const chest = mesh(spine, sph(0.15), M.cloth, V(0, 0.38, 0.01), null, [1.15, 0.9, 0.8]);
  mesh(spine, new THREE.TorusGeometry(0.13, 0.025, 5, 14), M.clothR, V(0, 0.22, 0), [Math.PI / 2, 0, 0]); // ceinture
  for (const s of [-1, 1]) seg(spine, V(s * 0.08, 0.5, 0.08), V(-s * 0.06, 0.18, 0.12), 0.02, 0.02, M.clothR); // rubans croisés

  /* ---------- Tête et cheveux écarlates ---------- */
  const neck = grp(spine, V(0, 0.55, 0.02), [-0.5, 0, 0]);
  seg(neck, V(0, 0, 0), V(0, 0.17, 0), 0.04, 0.035, M.skin);
  const head = grp(neck, V(0, 0.22, 0.01));
  mesh(head, sph(0.105, 12, 10), M.skin, V(0, 0.04, 0), null, [0.9, 1, 0.95]);
  mesh(head, new THREE.ConeGeometry(0.06, 0.09, 6), M.skin, V(0, -0.03, 0.04), [Math.PI + 0.3, 0, 0]); // menton
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  })();
  const eyes = [-1, 1].map(s => {
    mesh(head, sph(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3040 }), V(s * 0.038, 0.05, 0.088));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(s * 0.038, 0.05, 0.1); sp.scale.setScalar(0.09); head.add(sp); return sp;
  });
  const hair = grp(head, V(0, 0.08, -0.02));
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const strands = [];
  for (let i = 0; i < 22; i++) {
    const a = -1.3 + (i / 21) * 2.6, back = 0.25 + rnd() * 0.35;
    const g = grp(hair, V(Math.sin(a) * 0.09, 0.02 + rnd() * 0.03, Math.cos(a) * 0.05 - 0.03), [-(1.9 + rnd() * 0.5), Math.sin(a) * 0.4, -Math.sin(a) * 0.5]);
    const len = 0.28 + rnd() * 0.32;
    mesh(g, new THREE.ConeGeometry(0.035 + rnd() * 0.02, len, 5), rnd() > 0.3 ? M.hair : M.hairD, V(0, len / 2, 0));
    g.userData = { base: g.rotation.x, ph: rnd() * 6.28, back };
    strands.push(g);
  }
  for (let i = 0; i < 5; i++) mesh(hair, new THREE.ConeGeometry(0.025, 0.12, 4), M.hair, V(-0.06 + i * 0.03, 0.0, 0.08), [1.9, 0, (i - 2) * 0.2]); // mèches

  /* ---------- Pilori : planche de bois cerclée d'or, cou et poignets pris ---------- */
  const pillory = grp(spine, V(0, 0.54, 0.06), [-0.6, 0, 0]);
  mesh(pillory, new THREE.BoxGeometry(1.0, 0.15, 0.07), M.wood);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) mesh(pillory, new THREE.BoxGeometry(0.035, 0.17, 0.085), M.gold, V(x, 0, 0));
  mesh(pillory, new THREE.TorusGeometry(0.06, 0.018, 6, 14), M.gold, V(0, 0, 0.04));
  mesh(pillory, sph(0.03, 8, 6), M.gem, V(0, 0.1, 0.03));
  for (const s of [-1, 1]) mesh(pillory, new THREE.TorusGeometry(0.04, 0.014, 5, 12), M.gold, V(s * 0.4, 0, 0.04));
  // bras levés jusqu'aux trous de la planche (repère de la colonne)
  for (const s of [-1, 1]) {
    const sh = V(s * 0.17, 0.48, 0.0), el = V(s * 0.33, 0.43, 0.08), wr = V(s * 0.4, 0.54, 0.06);
    mesh(spine, sph(0.05, 7, 5), M.cloth, sh);
    seg(spine, sh, el, 0.04, 0.032, M.skin);
    seg(spine, el, wr, 0.032, 0.025, M.skin);
    // main qui dépasse devant la planche, griffes rouges
    const hand = grp(pillory, V(s * 0.4, 0, 0.07));
    mesh(hand, sph(0.035, 7, 5), M.skin, null, null, [1, 0.8, 0.7]);
    for (let k = 0; k < 4; k++) mesh(hand, new THREE.ConeGeometry(0.007, 0.06, 4), M.clothR, V((k - 1.5) * 0.015, -0.03, 0.025), [Math.PI - 0.4, 0, 0]);
  }
  // chaînes brisées qui pendent des extrémités
  const chains = [];
  const linkGeo = new THREE.TorusGeometry(0.022, 0.006, 4, 8);
  for (const s of [-1, 1]) {
    let parent = grp(pillory, V(s * 0.49, -0.07, 0));
    const links = [];
    for (let i = 0; i < 7; i++) {
      const l = grp(parent, V(0, i ? -0.038 : 0, 0));
      mesh(l, linkGeo, M.iron, V(0, -0.019, 0), [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2]);
      links.push(l); parent = l;
    }
    chains.push(links);
  }

  /* ---------- Lumière rouge qui la détache du brouillard ---------- */
  const glow = new THREE.PointLight(0xff2a3a, 1.6, 4.5, 2);
  glow.position.set(0.4, 1.4, 0.9); root.add(glow);

  /* ---------- Animation ---------- */
  const palBlood = new THREE.Color();
  function update(state) {
    const t = state.t, h = state.hunt, howl = state.howl;
    const br = Math.sin(t * 2.1 + 0.6);
    // faim : petit spasme irrégulier toutes les quelques secondes
    const tw = Math.pow(Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 1.13 + 1)), 6);
    hips.position.y = 0.62 + br * 0.008 - h * 0.04 - howl * 0.03;
    spine.rotation.x = 0.6 + br * 0.02 + h * 0.08 + tw * 0.12;
    spine.rotation.y = Math.sin(t * 0.29) * 0.08;
    // elle tourne la tête vers Warwick quand il hurle, sinon elle épie
    neck.rotation.y = Math.sin(t * 0.41) * 0.35 * (1 - howl) + howl * 0.55;
    neck.rotation.x = -0.5 - howl * 0.15 + tw * 0.2;
    head.rotation.z = Math.sin(t * 0.53) * 0.12 + tw * Math.sin(t * 31) * 0.05;
    for (const l of legs) { l.thigh.rotation.x = -1.0 - h * 0.08; l.knee.rotation.x = 1.6 + h * 0.12; }
    for (const g of strands) {
      const u = g.userData;
      g.rotation.x = u.base + Math.sin(t * 1.3 + u.ph) * 0.06 + h * 0.08 * u.back;
    }
    chains.forEach((links, ci) => links.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 1.7 + ci * 2 + i * 0.4) * (0.08 + howl * 0.25) + tw * 0.15;
      l.rotation.x = Math.sin(t * 1.1 + ci + i * 0.3) * 0.06;
    }));
    palBlood.copy(state.palette.blood);
    const eyeI = 0.08 + h * 0.05 + howl * 0.04 + Math.sin(t * 5) * 0.006;
    for (const e of eyes) { e.scale.setScalar(eyeI); e.material.color.copy(palBlood); }
    M.gem.emissive.copy(palBlood);
    M.gem.emissiveIntensity = 1.8 + h * 1.5 + state.audio.beat * 1.5;
    glow.color.copy(palBlood);
    glow.intensity = 1.4 + h * 2.2 + howl * 1.2;
  }
  return { root, update };
};
})();
