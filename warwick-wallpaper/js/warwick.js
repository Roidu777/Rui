/* Warwick — modèle, rig et animation (graine reprise de la v1 ; à enrichir). Contrat : CONTRACT.md */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
WW.createWarwick = function (THREE, opts) {
const scene = new THREE.Group(); // racine : pieds à y=0, face à +Z
/* ---------- Matériaux ---------- */
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, flatShading: true }, o));
const M = {
  fur: std(0x4f5a66), furDark: std(0x2c343d), belly: std(0x76818a), skin: std(0x24282e, { roughness: 0.6 }),
  bone: std(0xe7dfc7, { roughness: 0.5 }), gum: std(0x7a2630, { roughness: 0.6 }),
  metal: std(0x5a6168, { metalness: 0.85, roughness: 0.35 }), brass: std(0xb88d48, { metalness: 0.9, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xb8ffd8, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  chem: new THREE.MeshStandardMaterial({ color: 0x6cff3a, emissive: 0x46ff1c, emissiveIntensity: 1.4, roughness: 0.3 }),
  tube: std(0x26332c, { roughness: 0.55, metalness: 0.3 }),
  eye: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
};

/* ---------- Outils de modélisation ---------- */
let seed = 1987;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function add(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function group(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group(); g.position.set(...pos); g.rotation.set(...rot); parent.add(g); return g;
}
function capsule(r, len, seg = 8) {
  const h = Math.max(0, len - 2 * r), pts = [];
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a)), -h / 2 + r * Math.sin(a))); }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a)), h / 2 + r * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, seg);
}
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const UP = new THREE.Vector3(0, 1, 0);
function spike(parent, pos, dir, len, rad, mat = M.fur) {
  const m = add(parent, new THREE.ConeGeometry(rad, len, 5), mat);
  const d = new THREE.Vector3(...dir).normalize();
  m.quaternion.setFromUnitVectors(UP, d);
  m.position.set(pos[0] + d.x * len * 0.4, pos[1] + d.y * len * 0.4, pos[2] + d.z * len * 0.4);
  return m;
}
// Membre : un pivot (articulation) avec un segment qui pend vers le bas
function limb(parent, pos, rot, r, len, mat) {
  const pivot = group(parent, pos, rot);
  add(pivot, capsule(r, len), mat, [0, -len / 2, 0]);
  return pivot;
}

/* ---------- Le loup ---------- */
const wolf = group(scene);
const pelvis = group(wolf, [0, 1.6, -0.15]);
add(pelvis, sphere(0.42), M.fur, [0, 0, 0], [0, 0, 0], [1.15, 0.85, 0.95]);

const spine = group(pelvis, [0, 0.05, 0], [0.5, 0, 0]);
const chest = add(spine, sphere(0.62, 12, 9), M.fur, [0, 0.78, 0], [0, 0, 0], [1.25, 1, 0.95]);
add(spine, sphere(0.45), M.belly, [0, 0.3, 0.12], [0, 0, 0], [1, 1.15, 0.85]);
add(spine, sphere(0.42), M.belly, [0, 0.82, 0.3], [0, 0, 0], [1.2, 0.8, 0.6]);

// Crinière dorsale (évite la zone de la cuve)
for (let i = 0; i < 70; i++) {
  const th = rnd() * Math.PI * 1.1 - 0.05, ph = rnd() * Math.PI * 0.75;
  const n = [Math.cos(th) * Math.sin(ph), Math.cos(ph), -Math.sin(th) * Math.sin(ph)];
  const p = [n[0] * 0.62 * 1.2, 0.78 + n[1] * 0.6, n[2] * 0.58];
  if (Math.abs(p[0]) < 0.32 && p[2] < -0.2) continue;
  spike(spine, p, [n[0] * 0.8, n[1] * 0.6 + 0.4, n[2] - 0.6], 0.22 + rnd() * 0.25, 0.06 + rnd() * 0.04, rnd() > 0.5 ? M.fur : M.furDark);
}
// Harnais
add(spine, new THREE.TorusGeometry(0.74, 0.035, 6, 28), M.metal, [0, 0.7, 0], [Math.PI / 2 - 0.15, 0.55, 0], [1, 0.92, 1]);
add(spine, new THREE.TorusGeometry(0.74, 0.035, 6, 28), M.metal, [0, 0.7, 0], [Math.PI / 2 - 0.15, -0.55, 0], [1, 0.92, 1]);

// Cuve chimique et tuyaux
const tank = group(spine, [0, 0.9, -0.8]);
add(tank, new THREE.CylinderGeometry(0.21, 0.21, 0.82, 14, 1, true), M.glass);
const liquid = add(tank, new THREE.CylinderGeometry(0.175, 0.175, 0.66, 14), M.chem, [0, -0.05, 0]);
liquid.castShadow = false;
for (const y of [0.43, -0.43]) {
  add(tank, new THREE.CylinderGeometry(0.25, 0.23, 0.1, 10), M.metal, [0, y, 0]);
  add(tank, new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8), M.brass, [0, y + Math.sign(y) * 0.09, 0]);
}
for (let a = 0; a < 4; a++) add(tank, new THREE.BoxGeometry(0.03, 0.82, 0.03), M.metal, [Math.cos(a * Math.PI / 2 + 0.78) * 0.215, 0, Math.sin(a * Math.PI / 2 + 0.78) * 0.215]);
const bubbles = [];
for (let i = 0; i < 16; i++) {
  const b = add(tank, sphere(0.012 + rnd() * 0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd8ffc8 }), [(rnd() - 0.5) * 0.24, 0, (rnd() - 0.5) * 0.24]);
  b.userData = { speed: 0.15 + rnd() * 0.3, off: rnd() };
  bubbles.push(b);
}
const tankLight = new THREE.PointLight(0x6cff3a, 1.4, 2.6, 2); tankLight.position.set(0, 0.9, -1.1); spine.add(tankLight);
function tube(points, r = 0.035) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  add(spine, new THREE.TubeGeometry(curve, 24, r, 6), M.tube);
}
for (const s of [-1, 1]) {
  tube([[0, 1.42, -0.8], [s * 0.12, 1.6, -0.6], [s * 0.2, 1.42, -0.15], [s * 0.18, 1.18, 0.12]]);
  tube([[0, 0.38, -0.8], [s * 0.35, 0.28, -0.75], [s * 0.62, 0.42, -0.4], [s * 0.72, 0.62, -0.1]], 0.03);
}

// Tête
const head = group(spine, [0, 1.2, 0.5], [-0.4, 0, 0]);
head.scale.setScalar(1.45);
add(head, new THREE.TorusGeometry(0.3, 0.05, 6, 16), M.metal, [0, -0.12, -0.1], [Math.PI / 2 + 0.3, 0, 0]);
for (let a = 0; a < 8; a++) add(head, sphere(0.025, 5, 4), M.brass, [Math.cos(a * Math.PI / 4) * 0.33, -0.12 + Math.sin(a * Math.PI / 4) * 0.1, -0.1 + Math.sin(a * Math.PI / 4) * 0.3]);
add(head, sphere(0.3, 10, 8), M.fur, [0, 0.05, 0.05], [0, 0, 0], [1.05, 0.9, 1.1]);
add(head, new THREE.BoxGeometry(0.42, 0.08, 0.14), M.furDark, [0, 0.16, 0.25], [0.3, 0, 0]);
add(head, new THREE.CylinderGeometry(0.11, 0.19, 0.48, 7), M.fur, [0, 0.0, 0.43], [Math.PI / 2, 0, 0]);
add(head, sphere(0.075, 7, 5), M.skin, [0, 0.04, 0.68], [0, 0, 0], [1.2, 0.85, 1]);
const jaw = group(head, [0, -0.11, 0.12]);
add(jaw, new THREE.BoxGeometry(0.24, 0.07, 0.48), M.fur, [0, -0.02, 0.22], [0, 0, 0]);
add(jaw, new THREE.BoxGeometry(0.2, 0.03, 0.42), M.gum, [0, 0.02, 0.22]);
for (const s of [-1, 1]) {
  for (let k = 0; k < 4; k++) {
    add(head, new THREE.ConeGeometry(0.022, k === 0 ? 0.12 : 0.06, 4), M.bone, [s * (0.09 - k * 0.01), -0.13, 0.62 - k * 0.09], [Math.PI, 0, 0]);
    add(jaw, new THREE.ConeGeometry(0.02, k === 0 ? 0.11 : 0.05, 4), M.bone, [s * (0.085 - k * 0.01), 0.04, 0.42 - k * 0.09]);
  }
  add(head, new THREE.ConeGeometry(0.09, 0.3, 4), M.furDark, [s * 0.19, 0.33, -0.04], [-0.35, 0, -s * 0.35]);
  add(head, sphere(0.04, 6, 4), M.eye, [s * 0.13, 0.08, 0.3]);
  for (let k = 0; k < 6; k++) spike(head, [s * (0.18 + rnd() * 0.08), -0.05 + rnd() * 0.2, -0.05 - rnd() * 0.15], [s * 0.9, 0.1 + rnd() * 0.4, -0.6], 0.2 + rnd() * 0.15, 0.06);
}
for (let k = 0; k < 8; k++) spike(head, [(rnd() - 0.5) * 0.25, 0.2 + rnd() * 0.08, -0.12 - rnd() * 0.1], [(rnd() - 0.5) * 0.4, 0.6, -1], 0.25 + rnd() * 0.2, 0.06, M.furDark);
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const eyeGlows = [-1, 1].map(s => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.position.set(s * 0.13, 0.08, 0.33); sp.scale.setScalar(0.2); head.add(sp); return sp;
});

// Bras
function arm(side) {
  const sh = group(spine, [side * 0.8, 1.0, 0.05], [-0.75, 0, side * 0.22]);
  add(sh, sphere(0.32, 9, 7), M.fur, [0, -0.05, 0], [0, 0, 0], [1, 0.9, 1]);
  add(sh, new THREE.SphereGeometry(0.34, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), M.metal, [side * 0.04, 0.02, 0], [0, 0, side * -0.35]);
  for (let k = 0; k < 5; k++) spike(sh, [side * 0.2, 0.1, -0.1 + k * 0.06], [side * 0.7, 0.8, -0.3], 0.25, 0.06);
  add(sh, capsule(0.21, 0.78), M.fur, [0, -0.39, 0]);
  const el = group(sh, [0, -0.76, 0], [-0.55, 0, 0]);
  add(el, capsule(0.18, 0.82), M.fur, [0, -0.41, 0]);
  add(el, new THREE.CylinderGeometry(0.21, 0.19, 0.38, 8), M.metal, [0, -0.5, 0]);
  for (const y of [-0.33, -0.67]) add(el, new THREE.TorusGeometry(0.205, 0.025, 5, 12), M.brass, [0, y, 0], [Math.PI / 2, 0, 0]);
  const hand = group(el, [0, -0.82, 0], [0.15, 0, 0]);
  add(hand, sphere(0.17, 8, 6), M.furDark, [0, -0.08, 0.04], [0, 0, 0], [1.15, 0.85, 1]);
  for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * 0.085;
    const finger = group(hand, [x, -0.16, 0.08], [0.35, 0, x * -0.6]);
    add(finger, capsule(0.045, 0.14, 6), M.furDark, [0, -0.06, 0]);
    add(finger, new THREE.ConeGeometry(0.035, 0.34, 5), M.bone, [0, -0.28, 0.02], [Math.PI - 0.15, 0, 0]);
  }
  return { sh, el, hand };
}
const armL = arm(1), armR = arm(-1);

// Jambes digitigrades
function leg(side) {
  const hip = group(pelvis, [side * 0.36, -0.05, 0], [-0.6, 0, side * 0.06]);
  add(hip, capsule(0.26, 0.74), M.fur, [0, -0.33, 0]);
  const knee = group(hip, [0, -0.7, 0], [1.2, 0, 0]);
  add(knee, capsule(0.15, 0.62), M.fur, [0, -0.3, 0]);
  add(knee, new THREE.CylinderGeometry(0.17, 0.16, 0.2, 8), M.metal, [0, -0.15, 0]);
  const ankle = group(knee, [0, -0.6, 0], [-0.9, 0, 0]);
  add(ankle, capsule(0.11, 0.46), M.furDark, [0, -0.22, 0]);
  const foot = group(ankle, [0, -0.44, 0], [0.3, 0, 0]);
  add(foot, sphere(0.15, 8, 6), M.furDark, [0, -0.03, 0.08], [0, 0, 0], [1, 0.5, 1.4]);
  for (let k = 0; k < 3; k++) add(foot, new THREE.ConeGeometry(0.03, 0.17, 5), M.bone, [(k - 1) * 0.07, -0.05, 0.3], [Math.PI / 2 + 0.25, 0, 0]);
  return { hip, knee, ankle, foot };
}
const legL = leg(1), legR = leg(-1);

// Queue
const tail = [];
let tp = group(pelvis, [0, 0.12, -0.38], [1.9, 0, 0]);
for (let i = 0; i < 7; i++) {
  const r = 0.13 - i * 0.012, len = 0.24;
  add(tp, capsule(r, len + r), i % 2 ? M.furDark : M.fur, [0, -len / 2, 0]);
  if (i > 2) for (let k = 0; k < 3; k++) spike(tp, [(rnd() - 0.5) * 0.1, -len * rnd(), 0], [(rnd() - 0.5), -0.6, (rnd() - 0.5)], 0.18, 0.05);
  tail.push(tp);
  tp = group(tp, [0, -len, 0], [-0.18, 0, 0]);
}

wolf.traverse(o => { if (o.isMesh && o.material === M.glass) o.castShadow = false; });


const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t));
const headPos = new THREE.Vector3(0, 0.1, 0.4);

function update(state) {
  const t = state.t, huntAmt = state.hunt, sp = 1 + huntAmt * 0.6;
  const br = Math.sin(t * 1.6 * sp) + state.audio.bass * 0.6;
  const H = state.howl, S = state.sniff;
  const ts = state.swipe < 0 ? 9 : state.swipe;
  const wind = env(ts, 0, 0.22, 0.26, 0.34), strike = env(ts, 0.24, 0.34, 0.45, 0.8);

  pelvis.position.y = 1.6 + br * 0.015 - huntAmt * 0.08 + H * 0.06;
  spine.rotation.x = 0.5 + br * 0.02 - H * 0.55 - S * 0.15 + huntAmt * 0.12 + strike * 0.12;
  spine.rotation.y = wind * 0.35 - strike * 0.5 + Math.sin(t * 0.4) * 0.04;
  chest.scale.set(1.25 + br * 0.02, 1 + br * 0.025, 0.95 + br * 0.02);
  head.rotation.x = -0.4 - H * 0.95 - S * 0.35 + Math.sin(t * 0.7) * 0.05 - huntAmt * 0.08;
  head.rotation.y = Math.sin(t * 0.45) * 0.25 * (1 - H) + strike * 0.3 + S * Math.sin(t * 5) * 0.08;
  head.rotation.z = Math.sin(t * 0.3) * 0.05;
  jaw.rotation.x = 0.06 + H * 0.65 + strike * 0.35 + state.growl * 0.4 + huntAmt * (0.12 + Math.sin(t * 9) * 0.03);

  for (const [a, s] of [[armL, 1], [armR, -1]]) {
    const sway = Math.sin(t * 1.6 * sp + (s > 0 ? 0 : 1.2)) * 0.05;
    a.sh.rotation.x = -0.75 + sway - H * 0.5 - huntAmt * 0.15;
    a.sh.rotation.z = s * (0.22 + H * 0.85);
    a.el.rotation.x = -0.55 - H * 0.3 - huntAmt * 0.2 - state.flex * 0.4;
    a.hand.rotation.x = 0.15 + H * 0.3 + state.flex * 0.5;
  }
  armR.sh.rotation.x += -1.75 * wind + 2.2 * strike * (1 - wind);
  armR.sh.rotation.z += -0.45 * wind + 0.7 * strike;
  armR.el.rotation.x += 0.4 * wind - 0.2 * strike;

  for (const l of [legL, legR]) {
    l.hip.rotation.x = -0.6 - huntAmt * 0.15 - H * 0.05;
    l.knee.rotation.x = 1.2 + huntAmt * 0.2;
    l.ankle.rotation.x = -0.9 - huntAmt * 0.07;
  }
  tail.forEach((s, i) => {
    s.rotation.z = Math.sin(t * 2.2 * sp - i * 0.6) * (0.12 + huntAmt * 0.08);
    if (i) s.rotation.x = -0.18 + Math.sin(t * 1.3 - i * 0.5) * 0.04 - H * 0.06;
  });
  bubbles.forEach(b => { const y = ((t * b.userData.speed * sp + b.userData.off) % 1); b.position.y = -0.36 + y * 0.64; });
  M.chem.color.copy(state.palette.chem);
  M.chem.emissive.copy(state.palette.chem);
  M.chem.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.2 + H * 0.8 + state.audio.bass * 1.5;
  tankLight.color.copy(state.palette.chem);
  tankLight.intensity = 1.3 + Math.sin(t * 3) * 0.2 + H + state.audio.bass;
  const eyeS = 0.18 + huntAmt * 0.35 + H * 0.25 + Math.sin(t * 6) * 0.015 + state.audio.beat * 0.1;
  eyeGlows.forEach(e => { e.scale.setScalar(eyeS); e.material.color.copy(state.palette.blood); });
}

return {
  root: wolf,
  update,
  getHeadWorldPosition(v) { return head.localToWorld(v.copy(headPos)); },
};
};
})();
