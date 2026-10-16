/* Warwick · la Furie déchaînée de Zaun — modèle, rig et animation (fan-art 100 % procédural). Contrat : CONTRACT.md
 *
 * Silhouette de référence : fourrure ardoise sombre bleu-gris à reflet froid (museau, collerette, plastron et pattes
 * gris-bleu clair) en grandes touffes couchées qui se chevauchent, hautes oreilles en V à conque sombre liserée de rouge,
 * yeux rouge sang, rictus aux gencives rouges et longs crocs, cicatrices, immense panache de queue large et aplati,
 * chimtech de bronze vieilli (vert-de-gris, crasse) : épaulières, brassards à grosses fioles vertes, griffes-lames,
 * collier, cuve verte sur le dos surmontée d'une flèche, tubes de verre lumineux arqués au-dessus des épaules,
 * module lombaire ; short kaki en lambeaux et ceinture.
 * Tout le corps est UN SkinnedMesh à UN matériau : couleur, rugosité, métal et émission (chimie, yeux) sont
 * portés par les sommets ; un petit shader injecté ajoute le hérissement de la crinière, le flux lumineux dans
 * les tuyaux, le reflet vert de la cuve sur la fourrure, un liseré de contre-jour et un appoint de lumière propre
 * au personnage (le bleu reste lisible dans la ruelle verte).
 * À côté : liquide de la cuve (additif), verre, bulles (instanciées), deux halos d'yeux, et pendant les événements
 * la bave et la traînée des griffes → 6 à 8 appels de dessin (+1 pour l'ombre), ~40 k triangles (~36 k en « low »).
 * Animation : couches de sinus incommensurables + ressorts amortis (jamais de boucle visible), pieds plantés par IK
 * analytique à 2 os (bassin libre), coup de griffe piloté par une IK du bras droit sur une trajectoire chorégraphiée.
 * Repère : mètres, pieds à y = 0, face à +Z. Les os ont une rotation de repos nulle ; la posture voûtée (buste
 * penché de HUNCH, tête basse projetée en avant, bras longs portés devant) est ajoutée dans update() et le
 * hurlement la redresse. Toutes les rotations animées sont des écarts autour des axes du modèle.
 */
(() => {
'use strict';
const WW = window.WW = window.WW || {};

WW.createWarwick = function (THREE, opts) {
opts = opts || {};
const V3 = THREE.Vector3, Quat = THREE.Quaternion;
const v3 = (x, y, z) => new V3(x, y, z);
let seed = 1987;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const env4 = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t));
const lerp = (a, b, t) => a + (b - a) * t;
const col = h => new THREE.Color(h).convertSRGBToLinear();
const qE = (x, y, z, o) => new Quat().setFromEuler(new THREE.Euler(x, y, z, o || 'XYZ'));
function hash3(x, y, z) {
  const h = Math.sin(Math.round(x * 1e4) * 0.01271 + Math.round(y * 1e4) * 0.03117 + Math.round(z * 1e4) * 0.00747) * 43758.5453;
  return h - Math.floor(h);
}
const _mb = new THREE.Matrix4();
// Rotation qui envoie +Y sur dir, +Z vers hint (orthogonalisé)
function quatAlong(dir, hint) {
  const y = dir.clone().normalize();
  const z = hint ? hint.clone() : v3(0, 0, 1);
  z.addScaledVector(y, -z.dot(y));
  if (z.lengthSq() < 1e-6) { z.set(1, 0, 0).addScaledVector(y, -y.x); }
  z.normalize();
  const x = new V3().crossVectors(y, z);
  return new Quat().setFromRotationMatrix(_mb.makeBasis(x, y, z));
}

/* =====================================================================================
 * Squelette (positions de liaison en repère modèle)
 * ===================================================================================== */
const root = new THREE.Group(); root.name = 'Warwick';
const bones = [], B = {};
function bone(name, parent, x, y, z) {
  const b = new THREE.Bone(); b.name = name;
  b.userData.bind = v3(x, y, z); b.userData.i = bones.length;
  if (parent) { B[parent].add(b); b.position.set(x, y, z).sub(B[parent].userData.bind); } else b.position.set(x, y, z);
  bones.push(b); B[name] = b; return b;
}
const J = n => B[n].userData.bind;
const I = n => B[n].userData.i;
const SIDES = [1, -1], SK = s => (s > 0 ? 'L' : 'R');

bone('pelvis', null, 0, 1.30, -0.22);
bone('spine1', 'pelvis', 0, 1.56, -0.18);
bone('spine2', 'spine1', 0, 1.86, -0.08);
bone('ribs', 'spine2', 0, 1.98, 0.14);
bone('neck', 'spine2', 0, 2.30, 0.22);
bone('head', 'neck', 0, 2.36, 0.56);
const HS = 1.2; // échelle de la tête (tout ce qui est construit via hp/jp/hr)
bone('jaw', 'head', 0, 2.36 - 0.08 * HS, 0.56 + 0.06 * HS);
const HAND = {};
for (const s of SIDES) {
  const k = SK(s);
  bone('ear' + k, 'head', s * 0.115 * HS, 2.36 + 0.13 * HS, 0.56 - 0.07 * HS);
  bone('clav' + k, 'spine2', s * 0.20, 2.26, 0.02);
  bone('arm' + k, 'clav' + k, s * 0.70, 2.14, 0.10);
  bone('fore' + k, 'arm' + k, s * 0.94, 1.44, 0.26);
  bone('hand' + k, 'fore' + k, s * 0.99, 0.80, 0.46);
  const W = J('hand' + k), hd = W.clone().sub(J('fore' + k)).normalize();
  const spread = v3(s * 0.38, 0, 1).normalize();
  const palm = new V3().crossVectors(hd, spread).multiplyScalar(s).normalize(); // vers le corps / l'arrière
  HAND[k] = { hd, spread, palm, fingers: [] };
  for (let f = 0; f < 4; f++) {
    const kp = W.clone().addScaledVector(hd, 0.19).addScaledVector(spread, (1.5 - f) * 0.056);
    bone('f' + k + f, 'hand' + k, kp.x, kp.y, kp.z);
  }
  const tp = W.clone().addScaledVector(hd, 0.07).addScaledVector(spread, 0.09).addScaledVector(palm, 0.05);
  bone('th' + k, 'hand' + k, tp.x, tp.y, tp.z);
  // jambes écartées, appui décalé (gauche en avant, droite en arrière) : posture de traque
  const fz = s > 0 ? 0.08 : -0.06;
  bone('thigh' + k, 'pelvis', s * 0.30, 1.22, -0.18);
  bone('shin' + k, 'thigh' + k, s * 0.44, 0.78, 0.16 + fz);
  bone('meta' + k, 'shin' + k, s * 0.47, 0.42, -0.20 + fz);
  bone('foot' + k, 'meta' + k, s * 0.49, 0.075, 0.10 + fz);
}
// Queue : énorme panache, aussi long que le corps, qui retombe bas derrière lui et balaie vers sa gauche
const TAIL_N = 10, TAILP = [];
{
  const P = [[0, 1.36, -0.52], [0.03, 1.17, -0.68], [0.08, 0.98, -0.86], [0.14, 0.82, -1.06], [0.21, 0.7, -1.28], [0.29, 0.62, -1.51],
    [0.37, 0.57, -1.74], [0.45, 0.55, -1.97], [0.53, 0.56, -2.19], [0.6, 0.6, -2.4], [0.66, 0.67, -2.59]];
  let parent = 'pelvis';
  for (let i = 0; i < TAIL_N; i++) {
    bone('tail' + i, parent, P[i][0], P[i][1], P[i][2]); TAILP.push(v3(P[i][0], P[i][1], P[i][2]));
    parent = 'tail' + i;
  }
  TAILP.push(v3(P[TAIL_N][0], P[TAIL_N][1], P[TAIL_N][2]));
}

// Cuve chimique : verticale, haut sur le dos entre les omoplates (inclinée en arrière dans la pose de liaison pour
// redevenir verticale une fois le buste voûté), surmontée d'une longue flèche de bronze qui dépasse de la tête
const HUNCH = 0.42; // tangage cumulé du buste au repos (voir update)
const TC = v3(0.1, 2.66, -0.6), TAX = v3(0, Math.cos(HUNCH), -Math.sin(HUNCH)), TR = 0.15, TH = 0.5;
const TPX = v3(1, 0, 0).addScaledVector(TAX, -TAX.x).normalize(), TPZ = new V3().crossVectors(TPX, TAX).normalize();
const tankAt = h => TC.clone().addScaledVector(TAX, h);
const tankDist = p => { const d = p.clone().sub(TC), h = clamp(d.dot(TAX), -TH / 2 - 0.1, TH / 2 + 0.1); return d.addScaledVector(TAX, -h).length(); };

/* =====================================================================================
 * Palette (hex sRGB → linéaire) et réglages de surface [rugosité, métal, émission chimie, émission yeux]
 * ===================================================================================== */
// Fourrure ardoise sombre bleu-gris (reflet froid bleu-vert), museau, collerette, plastron et pattes gris-bleu clair,
// griffes-lames de bronze ; chimtech en bronze vieilli (vert-de-gris, crasse) ; short kaki délavé en lambeaux.
const C = {
  furD: col(0x161c28), furM: col(0x29334a), furB: col(0x3c4862), furV: col(0x343e52), furL: col(0x76829a), furP: col(0x9ea8bc),
  furN: col(0x1b2232), furW: col(0x535f78),
  skin: col(0x0e0c10), skinG: col(0x29313a), gum: col(0x8e1c24), tongue: col(0xa8404c), tooth: col(0xd8ceac),
  clawB: col(0x0a0a0c), clawT: col(0x302e2c),
  copper: col(0x5e4b2e), copperD: col(0x30271a), copperL: col(0x84704a), verdi: col(0x44624e), grime: col(0x15120c),
  leather: col(0x201d18), rubber: col(0x2c8a24), eye: col(0x5a0a08), liquid: col(0x2c6a1c),
  cloth: col(0x2e2a1b), clothD: col(0x1c190e), clothL: col(0x48422d), earIn: col(0x84505e), earInD: col(0x301c26), earRed: col(0xb0262c), scar: col(0x8a1c22),
};
const SF = {
  fur: [0.9, 0, 0, 0], skin: [0.5, 0, 0, 0], gum: [0.4, 0, 0, 0], tooth: [0.3, 0.05, 0, 0], claw: [0.72, 0.1, 0, 0],
  leather: [0.66, 0, 0, 0], rubber: [0.3, 0.05, 0.14, 0],
  copper: [0.5, 0.7, 0, 0], copperD: [0.62, 0.6, 0, 0], cloth: [0.96, 0, 0, 0],
  glow: [0.3, 0, 1, 0], vial: [0.22, 0, 1.1, 0], eye: [0.3, 0, 0, 1], tube: [0.15, 0.05, 0.42, 0],
};

/* =====================================================================================
 * Accumulateur de géométrie (non indexée)
 * ===================================================================================== */
function Bld() { this.p = []; this.n = []; this.c = []; this.si = []; this.sw = []; this.s = []; this.f = []; }
Bld.prototype.push = function (p, n, c, w, s, f) {
  this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(c.r, c.g, c.b);
  this.si.push(w[0], w[1], 0, 0); this.sw.push(w[2], w[3], 0, 0);
  this.s.push(s[0], s[1], s[2], s[3]);
  if (f) this.f.push(f[0], f[1], f[2], f[3]); else this.f.push(0, 0, 0, 0);
};
const core = new Bld(), extra = new Bld();

const _a = new V3(), _b = new V3(), _c = new V3(), _n = new V3(), _cen = new V3(), _t1 = new V3(), _t2 = new V3();
const _col = new THREE.Color(), _w = [0, 0, 1, 0], _fx = [0, 0, 0, 0];
const TINTS = [col(0x2c3a4c), col(0x2c3248), col(0x1e2634), col(0x3a465e)]; // ardoise bleutée, reflet froid

function wRigid(name) { const i = I(name); return (p, w) => { w[0] = i; w[1] = i; w[2] = 1; w[3] = 0; }; }
function wLerp(a, b, f) { const ia = I(a), ib = I(b); return (p, w) => { const t = f(p); w[0] = ia; w[1] = ib; w[2] = 1 - t; w[3] = t; }; }
function setW(o, p) {
  if (typeof o.w === 'function') o.w(p, _w);
  else { const i = typeof o.w === 'string' ? I(o.w) : o.w; _w[0] = i; _w[1] = i; _w[2] = 1; _w[3] = 0; }
}
function faceColor(o, cen, n, out) {
  if (typeof o.color === 'function') o.color(cen, n, out); else out.copy(o.color || C.furM);
  const j = o.jitter != null ? o.jitter : 0.08;
  if (j > 0) {
    if (o.tint !== false) out.lerp(TINTS[(rnd() * TINTS.length) | 0], rnd() * (o.tint || 0.22));
    out.multiplyScalar(1 + (rnd() - 0.5) * 2 * j);
  }
}
// Triangles (positions modèle, CCW vers l'extérieur) → accumulateur. o.vfx(p, out4) optionnel par sommet.
function emitTris(bld, a, o) {
  const surf = o.surf || SF.fur;
  for (let i = 0; i + 8 < a.length; i += 9) {
    _a.fromArray(a, i); _b.fromArray(a, i + 3); _c.fromArray(a, i + 6);
    _n.crossVectors(_t1.subVectors(_b, _a), _t2.subVectors(_c, _a));
    if (_n.lengthSq() < 1e-14) continue;
    _n.normalize();
    _cen.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    faceColor(o, _cen, _n, _col);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? _a : k === 1 ? _b : _c;
      setW(o, p);
      let fx = null;
      if (o.vfx) { _fx[0] = _fx[1] = _fx[2] = _fx[3] = 0; o.vfx(p, _fx, i / 3 + k, o); fx = _fx; }
      bld.push(p, _n, _col, _w, surf, fx);
    }
  }
}
function geoTris(g) { const ng = g.index ? g.toNonIndexed() : g; return ng; }
function emitGeo(bld, g, mat, o) {
  const ng = geoTris(g); if (mat) ng.applyMatrix4(mat);
  emitTris(bld, ng.attributes.position.array, o);
  if (ng !== g) ng.dispose(); g.dispose();
}
const _cm = new THREE.Matrix4(), _one = v3(1, 1, 1);
const M4 = (p, q, s) => new THREE.Matrix4().compose(p, q || new Quat(), s || _one);

/* ---------- Volumes (ellipsoïdes) : sculpture, test d'occlusion de la fourrure, enveloppe des sangles ---------- */
const vols = [];
function ellip(bld, c, r, q, o) {
  q = q || new Quat();
  const g = new THREE.IcosahedronGeometry(1, o.detail != null ? o.detail : 2);
  const a = g.attributes.position.array, bump = o.bump != null ? o.bump : 0.07;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    const b = 1 + (hash3(x + c.x, y + c.y, z + c.z) - 0.5) * bump;
    _a.set(x * r.x * b, y * r.y * b, z * r.z * b).applyQuaternion(q).add(c);
    a[i] = _a.x; a[i + 1] = _a.y; a[i + 2] = _a.z;
  }
  emitTris(bld, a, o);
  g.dispose();
  if (o.vol === false) return null;
  const v = { c: c.clone(), r: r.clone(), q: q.clone(), qi: q.clone().invert(), w: o.w, tag: o.tag || '' };
  vols.push(v); return v;
}
function vol(c, r, q, w) { q = q || new Quat(); const v = { c: c.clone(), r: r.clone(), q: q.clone(), qi: q.clone().invert(), w, tag: '' }; vols.push(v); return v; }
function insideVol(v, p, lim) {
  _t1.copy(p).sub(v.c).applyQuaternion(v.qi);
  const x = _t1.x / v.r.x, y = _t1.y / v.r.y, z = _t1.z / v.r.z;
  return x * x + y * y + z * z < lim * lim;
}
function occluded(p, self, lim) {
  for (let i = 0; i < vols.length; i++) { const v = vols[i]; if (v !== self && insideVol(v, p, lim)) return true; }
  return false;
}
// point et normale sur un ellipsoïde pour une direction unitaire locale u
function volPoint(v, u, p, n) {
  p.set(u.x * v.r.x, u.y * v.r.y, u.z * v.r.z).applyQuaternion(v.q).add(v.c);
  n.set(u.x / v.r.x, u.y / v.r.y, u.z / v.r.z).applyQuaternion(v.q).normalize();
}
// sortie de rayon (la plus lointaine) parmi un ensemble de volumes → { t, v }
function rayExit(o, d, set) {
  let best = -1, bv = null;
  for (const v of set) {
    _t1.copy(o).sub(v.c).applyQuaternion(v.qi).divide(v.r);
    _t2.copy(d).applyQuaternion(v.qi).divide(v.r);
    const A = _t2.dot(_t2), Bq = 2 * _t1.dot(_t2), Cq = _t1.dot(_t1) - 1, disc = Bq * Bq - 4 * A * Cq;
    if (disc < 0) continue;
    const t = (-Bq + Math.sqrt(disc)) / (2 * A);
    if (t > best) { best = t; bv = v; }
  }
  return { t: best, v: bv };
}

/* ---------- Mèches de fourrure : prisme triangulaire effilé en 2 tronçons (9 triangles), dégradé racine → pointe, hérissable ---------- */
const RB = [new V3(), new V3(), new V3()], RM = [new V3(), new V3(), new V3()];
const _sd = new V3(), _up = new V3(), _b0 = new V3(), _m = new V3(), _tip = new V3(), _dr = new V3(), _q1 = new V3(), _q2 = new V3();
const _cR = new THREE.Color(), _cT = new THREE.Color(), _cMid = new THREE.Color();
const FX0 = [0, 0, 0, 0], FXM = [0, 0, 0, 0], FXT = [0, 0, 0, 0];
const _e1 = new V3(), _e2 = new V3(), _fn = new V3(), _rc = new V3();
function triO(bld, A, Bv, Cv, cA, cB, cC, fA, fB, fC, ref, s) {
  _e1.subVectors(Bv, A); _e2.subVectors(Cv, A); _fn.crossVectors(_e1, _e2);
  if (_fn.lengthSq() < 1e-14) return;
  _rc.copy(A).add(Bv).add(Cv).multiplyScalar(1 / 3).sub(ref);
  if (_fn.dot(_rc) < 0) { _fn.negate(); let t = Bv; Bv = Cv; Cv = t; t = cB; cB = cC; cC = t; t = fB; fB = fC; fC = t; }
  _fn.normalize();
  bld.push(A, _fn, cA, _w, s, fA); bld.push(Bv, _fn, cB, _w, s, fB); bld.push(Cv, _fn, cC, _w, s, fC);
}
const _ref = new V3();
function lock(bld, p, n, dir, len, wid, cR, cT, o) {
  o = o || {};
  _sd.crossVectors(n, dir); if (_sd.lengthSq() < 1e-8) _sd.set(1, 0, 0); _sd.normalize();
  _up.crossVectors(dir, _sd).normalize();
  const th = wid * (o.thick || 0.3), arch = len * (o.arch != null ? o.arch : 0.08), curl = len * (o.curl != null ? o.curl : 0.08);
  _b0.copy(p).addScaledVector(n, -0.015);
  // section : arête dorsale + deux flancs (le dessous, collé au corps, ne se voit pas)
  RB[0].copy(_b0).addScaledVector(_sd, wid).addScaledVector(_up, -th * 0.35); RB[1].copy(_b0).addScaledVector(_up, th);
  RB[2].copy(_b0).addScaledVector(_sd, -wid).addScaledVector(_up, -th * 0.35);
  // touffe en feuille : corps large jusqu'aux deux tiers, pointe courte
  const mw = o.mid != null ? o.mid : 0.86;
  _m.copy(_b0).addScaledVector(dir, len * 0.58).addScaledVector(_up, arch);
  RM[0].copy(_m).addScaledVector(_sd, wid * mw).addScaledVector(_up, -th * 0.25); RM[1].copy(_m).addScaledVector(_up, th * 0.75);
  RM[2].copy(_m).addScaledVector(_sd, -wid * mw).addScaledVector(_up, -th * 0.25);
  _tip.copy(_b0).addScaledVector(dir, len).addScaledVector(_up, arch * 0.5 + curl);
  // hérissement : la mèche se redresse vers la normale
  const raise = o.raise != null ? o.raise : 1;
  _dr.copy(dir).addScaledVector(n, 1.4).normalize();
  _q1.copy(_b0).addScaledVector(_dr, len * 1.05).sub(_tip).multiplyScalar(raise);
  _q2.copy(_b0).addScaledVector(_dr, len * 0.6).sub(_m).multiplyScalar(raise);
  FXT[0] = _q1.x; FXT[1] = _q1.y; FXT[2] = _q1.z; FXT[3] = 0;
  FXM[0] = _q2.x; FXM[1] = _q2.y; FXM[2] = _q2.z; FXM[3] = 0;
  _cMid.copy(cR).lerp(cT, 0.55);
  setW(o, p);
  const s = o.surf || SF.fur;
  for (let k = 0; k < 3; k++) {
    const k1 = k === 2 ? 0 : k + 1;
    _ref.copy(_b0).add(_m).multiplyScalar(0.5);
    triO(bld, RB[k], RB[k1], RM[k1], cR, cR, _cMid, FX0, FX0, FXM, _ref, s);
    triO(bld, RB[k], RM[k1], RM[k], cR, _cMid, _cMid, FX0, FXM, FXM, _ref, s);
    _ref.copy(_m).add(_tip).multiplyScalar(0.5);
    triO(bld, RM[k], RM[k1], _tip, _cMid, _cMid, cT, FXM, FXM, FXT, _ref, s);
  }
}
// Peigne de mèches sur une zone d'un volume (par touffes de 1 à 3 mèches)
const _u = new V3(), _p = new V3(), _nn = new V3(), _d = new V3(), _pc = new V3(), _dc = new V3(), _tg = new V3();
const FD = 1.0; // densité de la couche principale (peu de mèches, larges : touffes calmes qui se chevauchent)
function fur(bld, v, count, o) {
  let made = 0;
  count = Math.round(count * (bld === core ? FD : 1));
  const clump = o.clump || 2;
  for (let tries = 0; made < count && tries < count * 40; tries++) {
    const z = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, rxy = Math.sqrt(1 - z * z);
    _u.set(rxy * Math.cos(ph), rxy * Math.sin(ph), z);
    volPoint(v, _u, _p, _nn);
    if (o.filter && !o.filter(_p, _nn)) continue;
    if (o.occl !== false && occluded(_p, v, o.occLim || 0.93)) continue;
    o.flow(_p, _nn, _d);
    const dl = _d.length();
    _d.addScaledVector(_nn, -_d.dot(_nn));
    if (_d.lengthSq() < 0.3 * dl * dl) continue; // flux presque normal (calottes) : la mèche se dresserait en pique
    _d.normalize();
    const lf = o.lift != null ? o.lift : 0.3;
    const len0 = rr(o.len[0], o.len[1]) * (o.lenFn ? o.lenFn(_p, _nn) : 1);
    const wid0 = rr(o.wid[0], o.wid[1]) * (o.lenFn ? Math.sqrt(o.lenFn(_p, _nn)) : 1);
    o.cR(_p, _nn, _cR); o.cT(_p, _nn, _cT);
    const j = 1 + (rnd() - 0.5) * 0.2; _cR.multiplyScalar(j); _cT.multiplyScalar(j * (1 + (rnd() - 0.5) * 0.15));
    if (rnd() < 0.3) _cT.lerp(TINTS[(rnd() * 4) | 0], 0.15);
    _tg.crossVectors(_nn, _d).normalize();
    const nc = 1 + ((rnd() * clump) | 0);
    for (let c = 0; c < nc; c++) {
      const off = c === 0 ? 0 : (rnd() - 0.5) * wid0 * 2.4;
      _pc.copy(_p).addScaledVector(_tg, off).addScaledVector(_d, -Math.abs(off) * 0.5 - (c === 0 ? 0 : wid0 * 0.6));
      _dc.copy(_d).addScaledVector(_tg, off * 0.5 + (rnd() - 0.5) * 0.05).addScaledVector(_nn, lf + rr(-0.04, 0.06)).normalize();
      const k = c === 0 ? 1 : rr(0.7, 0.88);
      lock(bld, _pc, _nn, _dc, len0 * k, wid0 * (c === 0 ? 1 : 0.85), _cR, _cT, { w: o.w || v.w, raise: o.raise, arch: o.arch, curl: o.curl != null ? o.curl : -0.02, thick: o.thick || 0.36 });
    }
    made++;
  }
}
const cst = c => (p, n, out) => out.copy(c);
const cmix = (a, b, t) => (p, n, out) => out.copy(a).lerp(b, t);

/* ---------- Lame courbe (griffes, crocs) ---------- */
const _bt = new V3(), _bw = new V3(), _bth = new V3(), _bp = new V3();
function blade(bld, base, dir, curve, len, wid, o) {
  o = o || {};
  const segs = o.segs || 4, thin = o.thin || 0.5, rings = [];
  const d = dir.clone().normalize(), cv = curve.clone().addScaledVector(d, -curve.dot(d)).normalize();
  const bend = o.bend != null ? o.bend : 0.32;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    _bp.copy(base).addScaledVector(d, len * t).addScaledVector(cv, len * bend * t * t);
    _bt.copy(d).addScaledVector(cv, 2 * bend * t).normalize();
    _bw.copy(cv).addScaledVector(_bt, -cv.dot(_bt)).normalize();
    _bth.crossVectors(_bt, _bw).normalize();
    const wd = wid * Math.pow(1 - t, 0.75), tk = wid * thin * (1 - t * 0.85);
    rings.push([
      _bp.clone().addScaledVector(_bw, wd * 0.85), _bp.clone().addScaledVector(_bth, tk),
      _bp.clone().addScaledVector(_bw, -wd), _bp.clone().addScaledVector(_bth, -tk), _bp.clone(),
    ]);
  }
  const tip = base.clone().addScaledVector(d, len).addScaledVector(cv, len * bend);
  setW(o, base);
  const s = o.surf || SF.claw;
  const cA = o.c0 || C.clawB, cB = o.c1 || C.clawT;
  const colAt = i => _cMid.copy(cA).lerp(cB, Math.pow(i / segs, 0.8)).clone();
  for (let i = 0; i < segs; i++) {
    const r0 = rings[i], r1 = i + 1 < segs ? rings[i + 1] : null, c0 = colAt(i), c1 = colAt(i + 1);
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) & 3;
      if (r1) {
        _ref.copy(r0[4]).add(r1[4]).multiplyScalar(0.5);
        triO(bld, r0[k], r0[k1], r1[k1], c0, c0, c1, null, null, null, _ref, s);
        triO(bld, r0[k], r1[k1], r1[k], c0, c1, c1, null, null, null, _ref, s);
      } else {
        _ref.copy(r0[4]).add(tip).multiplyScalar(0.5);
        triO(bld, r0[k], r0[k1], tip, c0, c0, c1, null, null, null, _ref, s);
      }
    }
  }
  if (o.cap !== false) { // fond de la lame (caché dans la chair, mais ferme la silhouette en contre-plongée)
    const r0 = rings[0];
    _ref.copy(r0[4]).addScaledVector(d, len * 0.3);
    triO(bld, r0[0], r0[1], r0[2], cA, cA, cA, null, null, null, _ref, s);
    triO(bld, r0[0], r0[2], r0[3], cA, cA, cA, null, null, null, _ref, s);
  }
}

/* ---------- Triangle orienté automatiquement + loft facetté (museau, mâchoire) ---------- */
function triAuto(bld, A, Bv, Cv, ref, o) {
  _e1.subVectors(Bv, A); _e2.subVectors(Cv, A); _fn.crossVectors(_e1, _e2);
  if (_fn.lengthSq() < 1e-14) return;
  _rc.copy(A).add(Bv).add(Cv).multiplyScalar(1 / 3);
  if (_fn.dot(_t1.copy(_rc).sub(ref)) < 0) { const t = Bv; Bv = Cv; Cv = t; _fn.negate(); }
  _fn.normalize();
  faceColor(o, _rc, _fn, _col);
  setW(o, _rc);
  const sf = o.surf || SF.fur;
  bld.push(A, _fn, _col, _w, sf, null); bld.push(Bv, _fn, _col, _w, sf, null); bld.push(Cv, _fn, _col, _w, sf, null);
}
// sections [z, y0 (bas), y1 (haut), demi-largeurs bas / milieu / haut] dans un repère local ; xf(x, y, z) → V3 modèle
function loftZ(bld, secs, tip, xf, o) {
  const rings = secs.map(([z, y0, y1, wb, wm, wt]) => {
    const h = y1 - y0;
    return [[0, y1], [wt, y1 - 0.12 * h], [wm, y0 + 0.55 * h], [wb, y0 + 0.12 * h], [0, y0], [-wb, y0 + 0.12 * h], [-wm, y0 + 0.55 * h], [-wt, y1 - 0.12 * h]]
      .map(([x, y]) => xf(x, y, z));
  });
  const ctr = secs.map(([z, y0, y1]) => xf(0, (y0 + y1) / 2, z));
  for (let r = 0; r + 1 < rings.length; r++) {
    const A = rings[r], Bq = rings[r + 1], ref = ctr[r].clone().add(ctr[r + 1]).multiplyScalar(0.5);
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) & 7;
      triAuto(bld, A[k], A[k1], Bq[k1], ref, o);
      triAuto(bld, A[k], Bq[k1], Bq[k], ref, o);
    }
  }
  const last = rings[rings.length - 1], T = xf(tip[0], tip[1], tip[2]), refT = ctr[ctr.length - 1].clone().add(T).multiplyScalar(0.5);
  for (let k = 0; k < 8; k++) triAuto(bld, last[k], last[(k + 1) & 7], T, refT, o);
}

/* ---------- Pièces mécaniques ---------- */
// bronze vieilli : arêtes hautes polies plus claires, plaques de vert-de-gris, crasse sombre sur les faces tournées
// vers le bas, dans les creux (contre le corps) et par taches
function copperCol(base, amt) {
  return (c, n, out) => {
    out.copy(base);
    const r = hash3(c.x * 4.3, c.y * 4.3, c.z * 4.3), g = hash3(c.x * 9.7 + 3.1, c.y * 9.7 - 1.7, c.z * 9.7);
    if (r > 1 - amt) out.lerp(C.verdi, 0.35 + (r - 1 + amt) / amt * 0.35);
    if (n.y > 0.35) out.lerp(C.copperL, 0.5 * (n.y - 0.35));
    let gr = (n.y < -0.2 ? 0.25 + 0.4 * ss(-0.2, -0.8, n.y) : 0) + (g < 0.22 ? 0.4 : 0);
    if (occluded(c, null, 1.04)) gr += 0.35;
    out.lerp(C.grime, Math.min(0.8, gr));
  };
}
const COPPER = { color: copperCol(C.copper, 0.22), surf: SF.copper, jitter: 0.1, tint: false };
const COPPERD = { color: copperCol(C.copperD, 0.25), surf: SF.copperD, jitter: 0.1, tint: false };
const LEATHER = { color: C.leather, surf: SF.leather, jitter: 0.12, tint: false };
const wo = (o, w, extra) => Object.assign({}, o, { w }, extra || {});
function cylAB(bld, a, b, r0, r1, seg, o, open) {
  const d = b.clone().sub(a), h = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, !!open);
  emitGeo(bld, g, M4(a.clone().add(b).multiplyScalar(0.5), quatAlong(d, o.hint)), o);
}
function ring(bld, c, axis, R, tube, rs, ts, o, scale) {
  const g = new THREE.TorusGeometry(R, tube, rs, ts);
  emitGeo(bld, g, M4(c, new Quat().setFromUnitVectors(v3(0, 0, 1), axis.clone().normalize()), scale), o);
}
function box(bld, c, sx, sy, sz, q, o) { emitGeo(bld, new THREE.BoxGeometry(sx, sy, sz), M4(c, q), o); }
function rivet(bld, p, r, o) { ellip(bld, p, v3(r, r, r), null, Object.assign({ detail: 0, bump: 0, vol: false }, o || COPPER)); }
function hose(bld, pts, r, o) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const L = curve.getLength(), segs = Math.max(8, Math.round(L * 30));
  const g = new THREE.TubeGeometry(curve, segs, r, o.glow ? 8 : 6, false);
  const ng = g.toNonIndexed(); g.dispose();
  const uv = ng.attributes.uv.array, wFn = o.w;
  // o.glow : tube de verre plein de chimie (émissif, le flux lumineux y circule), sinon durite de caoutchouc vert
  const colF = o.glow ? (cc, n, out) => out.copy(C.liquid).multiplyScalar(n.y > 0.4 ? 1.3 : n.y < -0.3 ? 0.6 : 0.95)
    : (cc, n, out) => out.copy(C.rubber).multiplyScalar(n.y < -0.2 ? 0.6 : 1);
  emitTris(bld, ng.attributes.position.array, Object.assign({}, o, {
    surf: o.glow ? SF.tube : SF.rubber, color: colF, jitter: 0.1, tint: false, w: wFn,
    vfx: (p, fx, vi) => { fx[3] = 0.001 + uv[vi * 2] * L; },
  }));
  ng.dispose();
  // bagues de bronze aux extrémités (et colliers intermédiaires)
  for (const u of [0.02, 0.98].concat(o.clamps || [])) {
    const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    cylAB(bld, p.clone().addScaledVector(tg, -0.03), p.clone().addScaledVector(tg, 0.03), r * 1.5, r * 1.5, 7, Object.assign({}, COPPER, { w: wFn }));
  }
}
// pointe conique de bronze (flèches, piques), base en a, pointe en b
function spike(bld, a, b, r, o) {
  const d = b.clone().sub(a), g = new THREE.ConeGeometry(r, d.length(), 6, 1, false);
  emitGeo(bld, g, M4(a.clone().add(b).multiplyScalar(0.5), quatAlong(d)), o);
}
// coque (calotte d'ellipsoïde) à double paroi + liseré
function shell(bld, c, pole, R, theta, scale, twist, o, rimO) {
  const q = quatAlong(pole, twist);
  const g = new THREE.SphereGeometry(R, 12, 5, 0, Math.PI * 2, 0, theta);
  emitGeo(bld, g, M4(c, q, scale), o);
  const gi = new THREE.SphereGeometry(R * 0.93, 12, 5, 0, Math.PI * 2, 0, theta).toNonIndexed();
  const a = gi.attributes.position.array;
  for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  emitGeo(bld, gi, M4(c, q, scale), o);
  const tr = new THREE.TorusGeometry(R * Math.sin(theta) * 0.97, R * 0.045, 4, 18);
  tr.applyMatrix4(M4(v3(0, R * Math.cos(theta) * 0.97, 0), qE(Math.PI / 2, 0, 0)));
  emitGeo(bld, tr, M4(c, q, scale), rimO || o);
  return { q, rimY: R * Math.cos(theta), rimR: R * Math.sin(theta) };
}

/* =====================================================================================
 * Corps
 * ===================================================================================== */
const shadeN = (dir, a, b, cA, cB) => { const d = dir.clone().normalize(); return (c, n, out) => out.copy(cA).lerp(cB, ss(a, b, n.dot(d))); };
const wTorso = (p, w) => {
  if (p.y < 1.5) { const t = ss(1.36, 1.52, p.y); w[0] = I('pelvis'); w[1] = I('spine1'); w[2] = 1 - t; w[3] = t; }
  else { const t = ss(1.74, 1.92, p.y); w[0] = I('spine1'); w[1] = I('spine2'); w[2] = 1 - t; w[3] = t; }
};
const wNeck = (p, w) => {
  if (p.z < 0.34) { const t = ss(0.04, 0.34, p.z); w[0] = I('spine2'); w[1] = I('neck'); w[2] = 1 - t; w[3] = t; }
  else { const t = ss(0.44, 0.6, p.z); w[0] = I('neck'); w[1] = I('head'); w[2] = 1 - t; w[3] = t; }
};
const FWD = v3(0, 0, 1), UP = v3(0, 1, 0);
const torsoCol = shadeN(v3(0, -0.4, 1), 0.35, 0.95, C.furM, C.furW);
const backCol = shadeN(v3(0, -0.3, 1), 0.0, 0.9, C.furD, C.furM);
// short : toile olive délavée, rapiécée (taches plus sombres / plus claires)
const clothCol = (c, n, out) => {
  const r = hash3(c.x * 2.3, c.y * 2.3, c.z * 2.3);
  out.copy(C.cloth).lerp(r < 0.3 ? C.clothD : C.clothL, r < 0.3 ? 0.5 : r > 0.85 ? 0.35 : 0);
  if (n.y < -0.4) out.multiplyScalar(0.6);
};
const BELT_Y = 1.53;
const underBelt = (cA, y0) => (c, n, out) => { if (c.y < (y0 || BELT_Y)) clothCol(c, n, out); else cA(c, n, out); };
const TORSO = [];
const pelV = ellip(core, v3(0, 1.33, -0.25), v3(0.36, 0.29, 0.32), qE(0.15, 0, 0), { w: wTorso, color: underBelt(backCol, 1.58), surf: SF.cloth, tint: false, jitter: 0.12 });
TORSO.push(pelV);
const GLUTE = {};
for (const s of SIDES) TORSO.push(GLUTE[s] = ellip(core, v3(s * 0.19, 1.28, -0.38), v3(0.22, 0.25, 0.2), qE(0.2, 0, 0), { w: wTorso, color: clothCol, surf: SF.cloth, tint: false, jitter: 0.12 }));
const absV = ellip(core, v3(0, 1.57, -0.06), v3(0.3, 0.31, 0.29), qE(0.3, 0, 0), { w: wTorso, color: underBelt(torsoCol) });
TORSO.push(absV);
const ribV = ellip(core, v3(0, 1.98, 0.06), v3(0.47, 0.43, 0.43), qE(0.35, 0, 0), { w: 'ribs', color: torsoCol, detail: 2, bump: 0.1 });
TORSO.push(ribV);
const PEC = {};
for (const s of SIDES) {
  TORSO.push(PEC[s] = ellip(core, v3(s * 0.21, 2.07, 0.35), v3(0.26, 0.19, 0.16), qE(0.55, s * 0.32, -s * 0.22), { w: 'ribs', color: shadeN(v3(0, -0.3, 1), 0.3, 0.95, C.furM, C.furW), bump: 0.1 }));
  ellip(core, v3(s * 0.36, 1.86, 0.2), v3(0.1, 0.2, 0.09), qE(0.3, 0, s * 0.5), { w: 'ribs', color: C.furM, detail: 1, bump: 0.12 }); // dentelé
  for (let k = 0; k < 3; k++) // abdominaux sculptés
    TORSO.push(ellip(core, v3(s * 0.085, 1.80 - k * 0.12, 0.33 - k * 0.045), v3(0.085, 0.06, 0.05), qE(0.3, 0, 0), { w: k === 0 ? 'ribs' : wTorso, color: C.furW, detail: 1, bump: 0.15 }));
}
const humpV = ellip(core, v3(0, 2.29, -0.12), v3(0.52, 0.34, 0.46), qE(-0.25, 0, 0), { w: 'spine2', color: backCol, detail: 3 });
TORSO.push(humpV);
const LAT_V = {}, TRAP = {};
for (const s of SIDES) {
  TORSO.push(LAT_V[s] = ellip(core, v3(s * 0.36, 1.87, -0.17), v3(0.25, 0.43, 0.29), qE(0, 0, s * 0.22), { w: 'spine2', color: backCol }));
  TORSO.push(TRAP[s] = ellip(core, v3(s * 0.33, 2.33, 0.03), v3(0.33, 0.18, 0.26), qE(0, 0, -s * 0.42), { w: wLerp('spine2', 'clav' + SK(s), p => ss(0.3, 0.55, Math.abs(p.x))), color: backCol }));
}
const neckV = ellip(core, v3(0, 2.33, 0.38), v3(0.22, 0.23, 0.28), qE(-0.18, 0, 0), { w: wNeck, color: backCol });
const throatV = ellip(core, v3(0, 2.2, 0.45), v3(0.17, 0.14, 0.2), qE(0.1, 0, 0), { w: wNeck, color: C.furL, tint: 0.1 });
TORSO.push(neckV, throatV);

/* ---------- Bras ---------- */
const ARMV = {}, CLAW_L = [0.34, 0.38, 0.35, 0.28];
for (const s of SIDES) {
  const k = SK(s), SL = J('arm' + k), EL = J('fore' + k), WL = J('hand' + k), h = HAND[k];
  const ua = EL.clone().sub(SL), la = WL.clone().sub(EL), uaL = ua.length(), laL = la.length();
  const out = v3(s, 0, 0);
  const qa = quatAlong(ua, FWD), ql = quatAlong(la, FWD);
  const deltCol = shadeN(v3(s * 0.3, 1, 0.3), 0.2, 1, C.furM, C.furD);
  const delt = ellip(core, SL.clone().add(v3(s * 0.05, 0.04, 0.0)), v3(0.28, 0.28, 0.28), qa, { w: 'arm' + k, color: deltCol, detail: 3 });
  const upper = ellip(core, SL.clone().addScaledVector(ua, 0.5), v3(0.18, uaL * 0.55, 0.19), qa, { w: 'arm' + k, color: C.furM });
  const bic = ellip(core, SL.clone().addScaledVector(ua, 0.5).addScaledVector(FWD, 0.09), v3(0.13, uaL * 0.3, 0.12), qa, { w: 'arm' + k, color: C.furB });
  const tri = ellip(core, SL.clone().addScaledVector(ua, 0.42).addScaledVector(FWD, -0.1).addScaledVector(out, 0.03), v3(0.145, uaL * 0.37, 0.14), qa, { w: 'arm' + k, color: C.furM });
  ellip(core, EL.clone().addScaledVector(FWD, -0.04), v3(0.13, 0.13, 0.13), ql, { w: 'fore' + k, color: C.furM, detail: 1 });
  const foreU = ellip(core, EL.clone().addScaledVector(la, 0.3), v3(0.175, laL * 0.38, 0.165), ql, { w: 'fore' + k, color: C.furM });
  const foreL = ellip(core, EL.clone().addScaledVector(la, 0.72), v3(0.12, laL * 0.33, 0.115), ql, { w: 'fore' + k, color: C.furD });
  // main (bleu-violet sombre) : paume, jointures, pouce, doigts griffus
  const qh = quatAlong(h.hd, h.spread);
  ellip(core, WL.clone().addScaledVector(h.hd, 0.08), v3(0.105, 0.13, 0.14), qh, { w: 'hand' + k, color: C.furV, detail: 1 });
  ellip(core, WL.clone().addScaledVector(h.hd, 0.17), v3(0.085, 0.065, 0.15), qh, { w: 'hand' + k, color: C.skinG, detail: 1, vol: false });
  for (let f = 0; f < 4; f++) {
    const kn = J('f' + k + f), fd = h.hd.clone().addScaledVector(h.palm, 0.15).normalize();
    ellip(core, kn.clone().addScaledVector(fd, 0.05), v3(0.036, 0.068, 0.036), quatAlong(fd, h.spread), { w: 'f' + k + f, color: C.skinG, detail: 1, vol: false });
    const cl = CLAW_L[f];
    // griffes-lames de bronze : base encrassée, fil poli
    blade(core, kn.clone().addScaledVector(fd, 0.09), fd, h.palm.clone().multiplyScalar(0.75).add(v3(0, 0, 0.5)), cl, 0.036, { w: 'f' + k + f, bend: 0.36, segs: 5, c0: C.grime, c1: C.copperL, surf: SF.copper });
    h.fingers.push(B['f' + k + f]);
  }
  {
    const tb = J('th' + k), td = h.palm.clone().multiplyScalar(0.6).add(h.hd).add(v3(0, 0, 0.4)).normalize();
    ellip(core, tb.clone().addScaledVector(td, 0.04), v3(0.038, 0.062, 0.038), quatAlong(td), { w: 'th' + k, color: C.skinG, detail: 1, vol: false });
    blade(core, tb.clone().addScaledVector(td, 0.08), td, h.hd, 0.17, 0.027, { w: 'th' + k, bend: 0.35 });
  }
  ARMV[k] = { delt, upper, bic, tri, foreU, foreL, qa, ql, ua, la };
}

/* ---------- Jambes digitigrades ---------- */
const LEGV = {};
for (const s of SIDES) {
  const k = SK(s), HP = J('thigh' + k), K = J('shin' + k), A = J('meta' + k), BL = J('foot' + k);
  const th = K.clone().sub(HP), sh = A.clone().sub(K), mt = BL.clone().sub(A);
  const qt = quatAlong(th, FWD), qs = quatAlong(sh, FWD), qm = quatAlong(mt, FWD);
  const out = v3(s, 0, 0);
  const thighCol = shadeN(v3(s * 0.5, 0.3, -1), 0.0, 0.8, C.furM, C.furD);
  // short : la toile couvre la cuisse jusqu'à mi-hauteur, ourlet déchiqueté
  const thL = th.length(), thN = th.clone().normalize();
  const uTh = p => _t2.copy(p).sub(HP).dot(thN) / thL;
  const HEM = 0.56;
  const legCol = cA => (c, n, out) => { if (uTh(c) < HEM + (hash3(c.x * 9.1, c.y * 9.1, c.z * 9.1) - 0.5) * 0.14) clothCol(c, n, out); else (typeof cA === 'function' ? cA(c, n, out) : out.copy(cA)); };
  const legO = (cA, extra) => Object.assign({ w: 'thigh' + k, color: legCol(cA), tint: false, jitter: 0.1 }, extra);
  const thigh = ellip(core, HP.clone().addScaledVector(th, 0.45).addScaledVector(out, 0.04), v3(0.25, thL * 0.64, 0.27), qt, legO(thighCol, { detail: 3 }));
  ellip(core, HP.clone().addScaledVector(th, 0.6).addScaledVector(FWD, 0.08), v3(0.17, thL * 0.44, 0.15), qt, legO(C.furM));
  ellip(core, HP.clone().addScaledVector(th, 0.3).addScaledVector(FWD, -0.13), v3(0.19, thL * 0.44, 0.17), qt, legO(C.furD));
  { // jambe de short ample : tube ouvert (paroi double), bas en dents de scie, quelques lambeaux qui pendent
    const g = new THREE.CylinderGeometry(0.305, 0.3, thL * 0.62, 11, 2, true).toNonIndexed(), a = g.attributes.position.array;
    const hh = thL * 0.31;
    for (let i = 0; i < a.length; i += 3) {
      const y = a[i + 1];
      // +Y local = vers le genou
      if (y > hh - 1e-4) { const an = Math.atan2(a[i + 2], a[i]); a[i + 1] += (0.5 + 0.5 * Math.sin(an * 5.5 + s)) * 0.09 + hash3(a[i], s, a[i + 2]) * 0.05; a[i] *= 1.06; a[i + 2] *= 1.06; }
      else if (y < -hh + 1e-4) { a[i] *= 1.12; a[i + 2] *= 1.05; }
      else { a[i] *= 1.04; a[i + 2] *= 1.04; }
    }
    const m = M4(HP.clone().addScaledVector(th, 0.27).addScaledVector(out, 0.03), qt);
    const wSh = (p, w) => { const t = ss(0.0, 0.2, uTh(p)); w[0] = I('pelvis'); w[1] = I('thigh' + k); w[2] = 1 - t; w[3] = t; };
    const gi = g.clone(), ai = gi.attributes.position.array;
    for (let i = 0; i < ai.length; i += 9) for (let q = 0; q < 3; q++) { const t = ai[i + 3 + q]; ai[i + 3 + q] = ai[i + 6 + q]; ai[i + 6 + q] = t; }
    for (let i = 0; i < ai.length; i += 3) { ai[i] *= 0.96; ai[i + 2] *= 0.96; }
    emitGeo(core, g, m, { w: wSh, color: clothCol, surf: SF.cloth, tint: false, jitter: 0.14 });
    emitGeo(core, gi, m, { w: wSh, color: C.clothD, surf: SF.cloth, tint: false, jitter: 0.1 });
  }
  ellip(core, K.clone(), v3(0.13, 0.13, 0.14), qs, { w: 'shin' + k, color: C.furM, detail: 1 });
  const shin = ellip(core, K.clone().addScaledVector(sh, 0.5), v3(0.115, sh.length() * 0.56, 0.12), qs, { w: 'shin' + k, color: C.furD });
  const back = new V3().crossVectors(v3(1, 0, 0), sh).normalize(); // vers l'arrière-haut du tibia
  const calf = ellip(core, K.clone().addScaledVector(sh, 0.32).addScaledVector(back, -0.07), v3(0.13, sh.length() * 0.38, 0.15), qs, { w: 'shin' + k, color: C.furM });
  ellip(core, A.clone(), v3(0.09, 0.095, 0.095), qm, { w: 'meta' + k, color: C.furD, detail: 1 });
  const meta = ellip(core, A.clone().addScaledVector(mt, 0.5), v3(0.078, mt.length() * 0.56, 0.088), qm, { w: 'meta' + k, color: C.furV });
  // patte : coussinet, orteils, griffes
  // grosse patte (semelle à y = 0) : coussinet, quatre orteils écartés, griffes qui mordent le sol
  ellip(core, BL.clone().add(v3(0, 0.005, 0.09)), v3(0.18, 0.085, 0.22), null, { w: 'foot' + k, color: C.furV, detail: 2 });
  for (let t = 0; t < 4; t++) {
    const ox = (t - 1.5) * 0.075, tp = BL.clone().add(v3(ox + s * 0.012, -0.02, 0.29 - Math.abs(t - 1.5) * 0.045));
    ellip(core, tp, v3(0.055, 0.052, 0.09), qE(0.2, ox * 1.5, 0), { w: 'foot' + k, color: C.skinG, detail: 1, vol: false });
    blade(core, tp.clone().add(v3(0, 0.006, 0.075)), v3(ox * 0.8, -0.28, 1), v3(0, -1, 0), 0.14, 0.03, { w: 'foot' + k, bend: 0.42 });
  }
  blade(core, A.clone().add(v3(0, -0.02, 0.05)), v3(s * 0.2, -1, 0.5), v3(0, 0, 1), 0.08, 0.02, { w: 'meta' + k }); // ergot
  LEGV[k] = { thigh, shin, calf, meta, back, uTh, HEM };
}

/* ---------- Queue ---------- */
// panache : mince à la racine, très large aux deux tiers, effilé en pointe
const TAIL_R = [0.11, 0.15, 0.21, 0.27, 0.31, 0.34, 0.34, 0.3, 0.22, 0.11];
const TAILV = [], TAILW = [];
for (let i = 0; i < TAIL_N; i++) {
  const a = TAILP[i], b = TAILP[i + 1], d = b.clone().sub(a), r = TAIL_R[i];
  const w = i < TAIL_N - 1 ? wLerp('tail' + i, 'tail' + (i + 1), p => ss(0.55, 1.05, p.clone().sub(a).dot(d) / d.lengthSq())) : 'tail' + i;
  TAILW.push(w);
  TAILV.push(ellip(core, a.clone().addScaledVector(d, 0.5), v3(r * 1.22, d.length() * 0.74, r * 0.74), quatAlong(d, UP), { w, color: shadeN(UP, -0.3, 0.8, C.furD, C.furN), detail: 2 })); // panache large et aplati
}

/* ---------- Tête (construite à l'échelle HS autour de l'articulation) ---------- */
const HJ = J('head'), JJ = J('jaw');
const hp = (x, y, z) => v3(HJ.x + x * HS, HJ.y + y * HS, HJ.z + z * HS);
const jp = (x, y, z) => v3(JJ.x + x * HS, JJ.y + y * HS, JJ.z + z * HS);
const hr = (x, y, z) => v3(x * HS, y * HS, z * HS);
// masque facial : crâne bleu marine, front et arcades bleu clair, joues, côtés du museau et menton presque blancs
const headCol = shadeN(v3(0, -1, 0.3), 0.1, 0.8, C.furW, C.furL);
const tooth = { surf: SF.tooth, c0: C.tooth, c1: C.tooth, cap: false };
const HEADV = [];
const cran = ellip(core, hp(0, 0.05, 0.0), hr(0.18, 0.165, 0.21), null, {
  w: 'head', detail: 2,
  color: (c, n, out) => { out.copy(C.furM).lerp(C.furD, ss(0.2, 0.9, n.y - n.z)); if (n.z > 0.55) out.lerp(C.furW, ss(0.55, 0.9, n.z)); },
});
HEADV.push(cran);
HEADV.push(ellip(core, hp(0, 0.04, -0.13), hr(0.15, 0.14, 0.11), null, { w: 'head', color: C.furD, detail: 1 }));
HEADV.push(ellip(core, hp(0, 0.11, 0.17), hr(0.17, 0.06, 0.085), qE(0.3, 0, 0), { w: 'head', color: C.furW, detail: 1 })); // arcade
const cheek = {};
for (const s of SIDES) {
  HEADV.push(ellip(core, hp(s * 0.085, 0.112, 0.205), hr(0.075, 0.04, 0.07), qE(0.2, s * 0.3, s * 0.35), { w: 'head', color: C.furL, detail: 1, tint: 0.12 })); // sourcils froncés
  HEADV.push(cheek[s] = ellip(core, hp(s * 0.12, -0.02, 0.13), hr(0.112, 0.105, 0.135), qE(0, s * 0.3, 0), { w: 'head', color: headCol, detail: 1, tint: 0.1 }));
}
const toHead = p => _t2.copy(p).sub(HJ).divideScalar(HS);
const muzCol = (c, n, out) => {
  const l = toHead(c);
  if (n.y > 0.55) out.copy(C.furB).lerp(C.furW, 0.35 + 0.4 * ss(0.3, 0.6, l.z));
  else if (l.y < -0.07 && n.y < 0.2) out.copy(C.skin);
  else if (n.y < -0.5) out.copy(C.skin);
  else out.copy(C.furW).lerp(C.furL, 0.4 + 0.6 * ss(0.03, -0.05, l.y));
};
loftZ(core, [[0.12, -0.125, 0.105, 0.125, 0.14, 0.08], [0.27, -0.118, 0.083, 0.108, 0.118, 0.068], [0.42, -0.106, 0.062, 0.09, 0.096, 0.056],
  [0.55, -0.096, 0.047, 0.074, 0.077, 0.046], [0.625, -0.086, 0.036, 0.057, 0.058, 0.036]], [0, -0.035, 0.665], hp, { w: 'head', color: muzCol, jitter: 0.06, tint: 0.08 });
const muzzle = vol(hp(0, -0.01, 0.38), hr(0.11, 0.09, 0.26), null, 'head');
HEADV.push(muzzle);
for (let k = 0; k < 3; k++) ellip(core, hp(0, 0.083 - k * 0.006, 0.27 + k * 0.055), hr(0.062 - k * 0.006, 0.012, 0.014), qE(0.15, 0, 0), { w: 'head', color: C.furN, surf: SF.skin, detail: 1, vol: false }); // rides du rictus
ellip(core, hp(0, 0.02, 0.632), hr(0.058, 0.04, 0.045), qE(0.25, 0, 0), { w: 'head', color: C.skin, surf: SF.skin, detail: 1, jitter: 0.15, vol: false }); // truffe
for (const s of SIDES) {
  ellip(core, hp(s * 0.026, 0.008, 0.668), hr(0.016, 0.012, 0.012), null, { w: 'head', color: col(0x050405), surf: SF.skin, detail: 0, vol: false, jitter: 0 }); // narines
  ellip(core, hp(s * 0.098, 0.062, 0.24), hr(0.054, 0.03, 0.032), qE(0, s * 0.45, -s * 0.3), { w: 'head', color: C.skin, surf: SF.skin, detail: 1, vol: false }); // orbite
  ellip(core, hp(s * 0.101, 0.064, 0.255), hr(0.042, 0.02, 0.022), qE(0, s * 0.45, -s * 0.3), { w: 'head', color: C.eye, surf: SF.eye, detail: 1, jitter: 0, vol: false }); // œil
  // babine retroussée : gencive rouge bien visible au-dessus des crocs
  ellip(core, hp(s * 0.083, -0.088, 0.43), hr(0.026, 0.026, 0.19), qE(0, -s * 0.13, 0), { w: 'head', color: C.gum, surf: SF.gum, detail: 1, vol: false, jitter: 0.12 });
  // crocs supérieurs, prémolaires
  blade(core, hp(s * 0.06, -0.08, 0.565), v3(0, -1, 0.06), v3(0, 0, -1), 0.13 * HS, 0.023 * HS, Object.assign({ w: 'head', bend: 0.14, segs: 3 }, tooth));
  for (let t = 0; t < 4; t++) blade(core, hp(s * (0.075 - t * 0.003), -0.095, 0.49 - t * 0.065), v3(0, -1, 0), v3(0, 0, 1), 0.05 * HS, 0.016 * HS, Object.assign({ w: 'head', bend: 0.1, segs: 2 }, tooth));
}
for (let t = 0; t < 4; t++) blade(core, hp((t - 1.5) * 0.022, -0.08, 0.625), v3(0, -1, 0.1), v3(0, 0, -1), 0.035 * HS, 0.009 * HS, Object.assign({ w: 'head', segs: 2 }, tooth));
ellip(core, hp(0, -0.075, 0.40), hr(0.07, 0.02, 0.22), null, { w: 'head', color: C.gum, surf: SF.gum, detail: 1, vol: false, jitter: 0.1 }); // palais
// mâchoire
loftZ(core, [[0.0, -0.08, 0.0, 0.088, 0.098, 0.088], [0.18, -0.075, -0.004, 0.082, 0.088, 0.078], [0.36, -0.064, -0.008, 0.068, 0.072, 0.062],
  [0.49, -0.052, -0.012, 0.052, 0.054, 0.047]], [0, -0.03, 0.535], jp, {
  w: 'jaw', jitter: 0.06, tint: 0.06, color: (c, n, out) => { if (n.y > 0.6) out.copy(C.gum).multiplyScalar(0.7); else if (n.y > 0.1) out.copy(C.skin); else out.copy(C.furL).lerp(C.furP, ss(0.2, -0.7, n.y)); },
});
const jawV = vol(jp(0, -0.04, 0.26), hr(0.085, 0.045, 0.27), null, 'jaw');
ellip(core, jp(0, -0.005, 0.27), hr(0.064, 0.02, 0.22), null, { w: 'jaw', color: C.gum, surf: SF.gum, detail: 1, vol: false });
ellip(core, jp(0, 0.008, 0.24), hr(0.05, 0.016, 0.2), null, { w: 'jaw', color: C.tongue, surf: SF.gum, detail: 1, vol: false });
for (const s of SIDES) {
  ellip(core, jp(s * 0.066, -0.004, 0.33), hr(0.02, 0.018, 0.16), qE(0, -s * 0.12, 0), { w: 'jaw', color: C.gum, surf: SF.gum, detail: 1, vol: false, jitter: 0.12 }); // gencive inférieure
  blade(core, jp(s * 0.05, -0.01, 0.43), v3(0, 1, 0.08), v3(0, 0, -1), 0.095 * HS, 0.02 * HS, Object.assign({ w: 'jaw', bend: 0.12, segs: 3 }, tooth));
  for (let t = 0; t < 3; t++) blade(core, jp(s * 0.062, -0.005, 0.36 - t * 0.07), v3(0, 1, 0), v3(0, 0, 1), 0.04 * HS, 0.014 * HS, Object.assign({ w: 'jaw', segs: 2 }, tooth));
}
/* Oreilles : hautes, en V, rabattues vers l'arrière ; coque épaisse en gouttière (face interne creusée sombre, liseré
 * rouge sur le bord intérieur, dos bombé couvert de fourrure). Surface paramétrée : u le long de l'oreille, v en travers. */
for (const s of SIDES) {
  const k = SK(s), eb = J('ear' + k);
  const dir = v3(s * 0.5, 0.84, -0.36).normalize();
  const open = v3(s * 0.42, 0.12, 1).addScaledVector(dir, -v3(s * 0.42, 0.12, 1).dot(dir)).normalize(); // la conque regarde devant / dehors
  const wd = new V3().crossVectors(dir, open).normalize();
  const back = v3(0, 0.15, -1).normalize();
  const L = 0.7, W0 = 0.13, NU = 9, NV = 8;
  const F = [], Bk = [], Ax = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, w = W0 * Math.pow(1 - u, 0.8) * (1 + 0.32 * Math.sin(u * Math.PI)) + 0.002;
    const th = 0.045 * (1 - u) + 0.008, D = 0.62 * w, Bb = 0.28 * w;
    // axe légèrement arqué : la pointe file vers l'arrière
    const ax = eb.clone().addScaledVector(dir, u * L).addScaledVector(back, u * u * 0.16);
    Ax.push(ax);
    const fr = [], br = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV * 2 - 1, cup = D * (v * v - 1);
      fr.push(ax.clone().addScaledVector(wd, v * w).addScaledVector(open, th * 0.5 + cup));
      br.push(ax.clone().addScaledVector(wd, v * w * 1.03).addScaledVector(open, -th * 0.5 + cup * 0.8 - Bb * (1 - v * v)));
    }
    F.push(fr); Bk.push(br);
  }
  setW({ w: 'ear' + k }, eb);
  const _r = new V3(), cI = new THREE.Color(), cB = new THREE.Color();
  const inCol = (u, v, out) => {
    const av = Math.abs(v);
    out.copy(C.earInD).lerp(C.earIn, ss(0.05, 0.55, u) * (1 - 0.55 * av));
    out.lerp(C.earRed, ss(0.4, 0.68, av) * (1 - ss(0.86, 1.0, av)) * (1 - 0.6 * ss(0.75, 1, u)));
    return out.lerp(C.furD, ss(0.9, 1.0, av) * 0.7);
  };
  const bkCol = (u, v, out) => out.copy(C.furM).lerp(C.furB, 0.2 + 0.4 * Math.abs(v) - 0.15 * u);
  const c0 = new THREE.Color(), c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color();
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const u0 = i / NU, u1 = (i + 1) / NU, v0 = j / NV * 2 - 1, v1 = (j + 1) / NV * 2 - 1;
    const jit = 1 + (rnd() - 0.5) * 0.1;
    inCol(u0, v0, c0).multiplyScalar(jit); inCol(u0, v1, c1).multiplyScalar(jit); inCol(u1, v1, c2).multiplyScalar(jit); inCol(u1, v0, c3).multiplyScalar(jit);
    _r.copy(F[i][j]).add(F[i + 1][j + 1]).multiplyScalar(0.5).addScaledVector(open, -1);
    triO(core, F[i][j], F[i][j + 1], F[i + 1][j + 1], c0, c1, c2, null, null, null, _r, SF.skin);
    triO(core, F[i][j], F[i + 1][j + 1], F[i + 1][j], c0, c2, c3, null, null, null, _r, SF.skin);
    bkCol(u0, v0, c0).multiplyScalar(jit); bkCol(u0, v1, c1).multiplyScalar(jit); bkCol(u1, v1, c2).multiplyScalar(jit); bkCol(u1, v0, c3).multiplyScalar(jit);
    _r.copy(Bk[i][j]).add(Bk[i + 1][j + 1]).multiplyScalar(0.5).addScaledVector(open, 1);
    triO(core, Bk[i][j], Bk[i][j + 1], Bk[i + 1][j + 1], c0, c1, c2, null, null, null, _r, SF.fur);
    triO(core, Bk[i][j], Bk[i + 1][j + 1], Bk[i + 1][j], c0, c2, c3, null, null, null, _r, SF.fur);
  }
  // liseré (épaisseur du bord), plus clair pour détacher la silhouette
  for (let i = 0; i < NU; i++) for (const j of [0, NV]) {
    _r.copy(Ax[i]).add(Ax[i + 1]).multiplyScalar(0.5);
    bkCol(i / NU, 1, cB); cI.copy(cB).lerp(C.furW, 0.35);
    triO(core, F[i][j], Bk[i][j], Bk[i + 1][j], cI, cB, cB, null, null, null, _r, SF.fur);
    triO(core, F[i][j], Bk[i + 1][j], F[i + 1][j], cI, cB, cI, null, null, null, _r, SF.fur);
  }
  // fond de l'oreille (ferme la coque à la base)
  for (let j = 0; j < NV; j++) {
    _r.copy(Ax[0]).addScaledVector(dir, 0.1);
    bkCol(0, 0, cB);
    triO(core, F[0][j], F[0][j + 1], Bk[0][j + 1], cB, cB, cB, null, null, null, _r, SF.fur);
    triO(core, F[0][j], Bk[0][j + 1], Bk[0][j], cB, cB, cB, null, null, null, _r, SF.fur);
  }
  // touffes : quelques mèches gris-bleu au fond de la conque, mèches sombres qui fondent la base dans la crinière
  for (let t = 0; t < 4; t++) {
    const v = -0.45 + t * 0.3, i = 1 + (t & 1);
    const bp = F[i][Math.round((v + 1) / 2 * NV)].clone().addScaledVector(open, 0.008);
    const dd = Ax[NU].clone().sub(bp).normalize().addScaledVector(open, 0.25).normalize();
    lock(core, bp, open, dd, (0.13 + 0.04 * rnd()) * HS, 0.03 * HS, C.furW, C.furL, { w: 'ear' + k, raise: 0.2, thick: 0.25 });
  }
  for (let t = 0; t < 4; t++) {
    const bp = Bk[t % 2][t < 2 ? NV : 0].clone();
    const dd = dir.clone().addScaledVector(wd, (t < 2 ? 1 : -1) * 0.5).addScaledVector(back, 0.5).normalize();
    lock(core, bp, wd.clone().multiplyScalar(t < 2 ? 1 : -1), dd, 0.2 * HS, 0.05 * HS, C.furD, C.furM, { w: 'ear' + k, raise: 0.5, thick: 0.3 });
  }
  if (s > 0) { // anneau de bronze au bord de l'oreille gauche
    const rp = F[3][NV].clone().addScaledVector(wd, 0.012);
    ring(core, rp, open, 0.03, 0.009, 4, 10, wo(COPPER, 'ear' + k));
  }
}
// fourrure de la tête (même échelle)
const maneR = cmix(C.furD, C.furM, 0.3), maneT = (p, n, out) => out.copy(C.furM).lerp(rnd() < 0.3 ? C.furW : C.furB, rnd() < 0.3 ? 0.35 : 0.6);
const lightR = cst(C.furL), lightT = cst(C.furP);
const darkR = cst(C.furD), midT = cmix(C.furN, C.furB, 0.5);
const awayFromEars = p => p.distanceTo(J('earL')) > 0.1 * HS && p.distanceTo(J('earR')) > 0.1 * HS;
fur(core, cran, 16, {
  filter: (p, n) => n.y > -0.1 && p.z < HJ.z + 0.07 && awayFromEars(p), flow: (p, n, d) => d.set(p.x * 1.2, 0.2, -1),
  len: [0.15, 0.24], wid: [0.07, 0.1], lift: 0.22, cR: maneR, cT: maneT, raise: 0.8,
});
for (const s of SIDES) {
  fur(core, cheek[s], 18, { // grande collerette gris-bleu des joues, rejetée en arrière et vers l'extérieur
    filter: (p, n) => n.x * s > 0.15 && n.z < 0.75, flow: (p, n, d) => d.set(s * 1.0, -0.3, -0.85),
    len: [0.22, 0.34], wid: [0.075, 0.105], lift: 0.18, cR: cmix(C.furW, C.furL, 0.55), cT: cmix(C.furL, C.furP, 0.4), raise: 0.6, clump: 2,
  });
}
fur(core, jawV, 10, { // barbiche gris-bleu clair
  filter: (p, n) => n.y < -0.35 && p.z < JJ.z + 0.32, flow: (p, n, d) => d.set(0, -1, -0.5),
  len: [0.12, 0.19], wid: [0.045, 0.065], lift: 0.18, cR: lightR, cT: lightT, raise: 0.3,
});

/* =====================================================================================
 * Fourrure du corps
 * ===================================================================================== */
// Module lombaire (bronze) : point d'ancrage sur l'échine, calculé ici pour dégager la fourrure autour
const MOD = (() => {
  const org = v3(0, 1.98, -0.1), dir = v3(0, 0.12, -1).normalize(), h = rayExit(org, dir, TORSO);
  return { p: org.clone().addScaledVector(dir, h.t), n: dir, w: h.v.w };
})();
// zones dégagées (module, cicatrices du dos)
const BACK_SCAR = v3(-0.16, 2.05, -0.72);
const clearBack = p => p.distanceTo(MOD.p) > 0.17 && p.distanceTo(BACK_SCAR) > 0.2;
// crinière : bosse, cou, épaules (bleu marine, pointes bleu vif / pâles)
fur(core, humpV, 78, {
  filter: (p, n) => n.y > -0.3 && p.z < 0.3 && tankDist(p) > 0.3 && clearBack(p), flow: (p, n, d) => d.set(p.x * 1.2, -0.35, -1),
  len: [0.3, 0.46], wid: [0.11, 0.15], lift: 0.14, cR: maneR, cT: maneT, raise: 1, clump: 2,
  lenFn: p => 0.8 + 0.2 * ss(1.95, 2.55, p.y),
});
fur(core, neckV, 40, {
  filter: (p, n) => n.y > -0.45, flow: (p, n, d) => d.set(p.x * 1.3, -0.05, -1),
  len: [0.3, 0.46], wid: [0.1, 0.14], lift: 0.18, cR: maneR, cT: maneT, raise: 1, clump: 2,
});
for (const s of SIDES) {
  const k = SK(s);
  fur(core, TRAP[s], 24, {
    filter: (p, n) => n.y > -0.15, flow: (p, n, d) => d.set(s * 0.8, -0.5, -0.65),
    len: [0.24, 0.36], wid: [0.09, 0.13], lift: 0.14, cR: maneR, cT: maneT, raise: 1, clump: 2,
  });
  const a = ARMV[k], uFore = p => _t2.copy(p).sub(J('fore' + k)).dot(a.la) / a.la.lengthSq();
  fur(core, a.delt, 10, { // les épaulières couvrent le dessus des épaules
    filter: (p, n) => n.x * s > 0.4 && n.y < 0.3 && n.z < 0.3, flow: (p, n, d) => d.set(s * 0.45, -1, -0.15),
    len: [0.16, 0.24], wid: [0.075, 0.11], lift: 0.12, cR: darkR, cT: midT, raise: 0.6,
  });
  fur(core, a.foreU, 16, { // avant-bras : mèches vers le coude, côté extérieur/arrière
    filter: (p, n) => n.dot(v3(s * 0.7, 0.1, -0.7)) > 0.05 && uFore(p) < 0.33, flow: (p, n, d) => d.copy(a.la).multiplyScalar(-0.8).add(v3(s * 0.2, 0, -0.5)),
    len: [0.16, 0.26], wid: [0.07, 0.1], lift: 0.2, cR: darkR, cT: midT, raise: 0.6, lenFn: p => 0.65 + 0.55 * ss(J('hand' + k).y + 0.2, J('fore' + k).y, p.y),
  });
  fur(core, a.tri, 9, {
    filter: (p, n) => n.z < 0.1, flow: (p, n, d) => d.set(s * 0.3, -1, -0.4),
    len: [0.13, 0.19], wid: [0.07, 0.1], lift: 0.12, cR: darkR, cT: midT, raise: 0.4,
  });
  fur(core, a.upper, 8, {
    filter: (p, n) => n.x * s > 0.3, flow: (p, n, d) => d.set(s * 0.2, -1, -0.2),
    len: [0.13, 0.19], wid: [0.07, 0.1], lift: 0.1, cR: darkR, cT: midT, raise: 0.3,
  });
  const lg = LEGV[k];
  fur(core, lg.thigh, 16, { // sous l'ourlet du short seulement
    filter: (p, n) => n.x * s > -0.3 && lg.uTh(p) > lg.HEM + 0.08, flow: (p, n, d) => d.set(s * 0.25, -1, -0.35),
    len: [0.15, 0.22], wid: [0.075, 0.11], lift: 0.1, cR: darkR, cT: midT, raise: 0.4,
  });
  fur(core, lg.calf, 12, {
    filter: (p, n) => n.dot(lg.back) < 0.3, flow: (p, n, d) => d.set(s * 0.1, -0.5, -1),
    len: [0.17, 0.26], wid: [0.07, 0.1], lift: 0.18, cR: darkR, cT: midT, raise: 0.5,
  });
  fur(core, lg.meta, 5, {
    filter: (p, n) => n.z < -0.2 && p.y > 0.25, flow: (p, n, d) => d.set(0, -0.4, -1),
    len: [0.11, 0.16], wid: [0.05, 0.07], lift: 0.2, cR: darkR, cT: midT, raise: 0.3,
  });
  fur(core, LAT_V[s], 18, { // dorsaux et flancs
    filter: (p, n) => n.z < 0.3 && p.y > BELT_Y + 0.08 && clearBack(p), flow: (p, n, d) => d.set(s * 0.3, -0.8, -0.65),
    len: [0.17, 0.26], wid: [0.085, 0.12], lift: 0.1, cR: darkR, cT: midT, raise: 0.7,
  });
}
// gorge, plastron : grande collerette pâle sous la tête
fur(core, throatV, 20, {
  filter: (p, n) => n.y < 0.35, flow: (p, n, d) => d.set(0, -1, -0.1),
  len: [0.22, 0.34], wid: [0.075, 0.105], lift: 0.16, cR: cmix(C.furW, C.furL, 0.5), cT: cmix(C.furL, C.furP, 0.4), raise: 0.5, clump: 2,
});
fur(core, ribV, 20, {
  filter: (p, n) => n.z > 0.55 && p.y > 1.95 && Math.abs(p.x) < 0.22, flow: (p, n, d) => d.set(0, -1, 0.1),
  len: [0.17, 0.26], wid: [0.075, 0.1], lift: 0.1, cR: cmix(C.furW, C.furL, 0.4), cT: cmix(C.furL, C.furP, 0.3), raise: 0.4, occLim: 0.98,
});
for (const s of SIDES) fur(core, PEC[s], 11, {
  filter: (p, n) => n.z > 0.2 && n.y > -0.3, flow: (p, n, d) => d.set(-s * 0.15, -1, 0.15),
  len: [0.11, 0.16], wid: [0.065, 0.09], lift: 0.08, cR: cst(C.furW), cT: cmix(C.furW, C.furL, 0.5), raise: 0.3,
});
// queue : grandes mèches larges couchées le long du panache (flux continu vers la pointe), peu soulevées
const tailRoot = (p, nn, out) => out.copy(C.furD).lerp(C.furN, nn.y > 0 ? 0.45 : 0);
const tailTip = (p, nn, out) => out.copy(C.furN).lerp(rnd() < 0.3 ? C.furB : C.furM, 0.55).multiplyScalar(nn.y < -0.2 ? 0.7 : 1);
for (let i = 0; i < TAIL_N; i++) {
  const a = TAILP[i], b = TAILP[i + 1], d = b.clone().sub(a).normalize(), R = TAIL_R[i];
  const n = Math.round(5 + 22 * R), tip = Math.max(0, i - (TAIL_N - 4)) / 3; // 0 → 1 sur les trois derniers tronçons
  fur(core, TAILV[i], n, {
    occl: false, flow: (p, nn, out) => out.copy(d).addScaledVector(nn, -0.3 * tip), len: [0.26, 0.36], wid: [0.2, 0.27], lift: 0.0 - 0.05 * tip, clump: 2,
    lenFn: () => (0.6 + 1.4 * R) * (1 - 0.25 * tip), cR: tailRoot, cT: tailTip, raise: 0.3, w: TAILW[i], arch: 0.03, curl: -0.1, thick: 0.26,
  });
}
{ // pointe : un faisceau de mèches qui converge
  const i = TAIL_N - 1, a = TAILP[i], b = TAILP[TAIL_N], d = b.clone().sub(a).normalize();
  for (let t = 0; t < 6; t++) {
    const an = t / 6 * Math.PI * 2, o = v3(Math.cos(an), 0, Math.sin(an) * 0.6).applyQuaternion(quatAlong(d, UP));
    const bp = a.clone().lerp(b, 0.2).addScaledVector(o, 0.08);
    lock(core, bp, o, d.clone().addScaledVector(o, -0.12).normalize(), 0.5 + rnd() * 0.12, 0.1, C.furD, C.furB, { w: 'tail' + i, raise: 0.3, arch: 0.02, curl: 0.0, thick: 0.3 });
  }
}
// ventre et flancs
fur(core, absV, 14, {
  filter: (p, n) => n.z > 0.2 && n.y < 0.2 && p.y > BELT_Y + 0.08, flow: (p, n, d) => d.set(0, -1, 0.1),
  len: [0.1, 0.15], wid: [0.06, 0.085], lift: 0.08, cR: cst(C.furW), cT: cmix(C.furW, C.furL, 0.4), raise: 0.2, occLim: 0.98,
});
for (const s of SIDES) fur(core, ribV, 12, {
  filter: (p, n) => n.x * s > 0.55 && n.z < 0.5, flow: (p, n, d) => d.set(s * 0.2, -1, -0.35),
  len: [0.15, 0.22], wid: [0.08, 0.11], lift: 0.1, cR: darkR, cT: midT, raise: 0.5,
});
// couche secondaire (qualité moyenne et plus) : seconde rangée de grandes touffes, plus courtes et plus couchées
fur(extra, humpV, 60, {
  filter: (p, n) => n.y > -0.25 && p.z < 0.3 && tankDist(p) > 0.32 && clearBack(p), flow: (p, n, d) => d.set(p.x * 1.3, -0.3, -1),
  len: [0.24, 0.38], wid: [0.09, 0.13], lift: 0.2, cR: maneR, cT: maneT, raise: 1, occLim: 0.97, clump: 2,
});
fur(extra, neckV, 30, {
  filter: (p, n) => n.y > -0.3, flow: (p, n, d) => d.set(p.x * 1.4, 0.05, -1),
  len: [0.24, 0.36], wid: [0.085, 0.12], lift: 0.24, cR: maneR, cT: maneT, raise: 1, occLim: 0.97, clump: 2,
});
for (const s of SIDES) {
  const k = SK(s), a = ARMV[k], lg = LEGV[k], uFore = p => _t2.copy(p).sub(J('fore' + k)).dot(a.la) / a.la.lengthSq();
  fur(extra, TRAP[s], 18, { filter: (p, n) => n.y > -0.1, flow: (p, n, d) => d.set(s * 0.8, -0.4, -0.7), len: [0.2, 0.32], wid: [0.08, 0.11], lift: 0.2, cR: maneR, cT: maneT, raise: 1, occLim: 0.97 });
  fur(extra, LAT_V[s], 14, { filter: (p, n) => n.z < 0.3 && p.y > BELT_Y + 0.08 && clearBack(p), flow: (p, n, d) => d.set(s * 0.3, -0.8, -0.65), len: [0.15, 0.22], wid: [0.075, 0.1], lift: 0.14, cR: darkR, cT: midT, raise: 0.7, occLim: 0.97 });
  fur(extra, lg.thigh, 11, { filter: (p, n) => n.x * s > -0.3 && lg.uTh(p) > lg.HEM + 0.1, flow: (p, n, d) => d.set(s * 0.25, -1, -0.35), len: [0.13, 0.2], wid: [0.065, 0.095], lift: 0.14, cR: darkR, cT: midT, raise: 0.4, occLim: 0.97 });
  fur(extra, a.foreU, 10, { filter: (p, n) => n.dot(v3(s * 0.7, 0.1, -0.7)) > 0.1 && uFore(p) < 0.33, flow: (p, n, d) => d.copy(a.la).multiplyScalar(-0.8).add(v3(s * 0.2, 0, -0.5)), len: [0.15, 0.22], wid: [0.06, 0.09], lift: 0.24, cR: darkR, cT: midT, raise: 0.6, occLim: 0.97 });
  fur(extra, a.delt, 5, { filter: (p, n) => n.x * s > 0.5 && n.y < 0.2, flow: (p, n, d) => d.set(s * 0.45, -1, -0.15), len: [0.14, 0.22], wid: [0.065, 0.095], lift: 0.16, cR: darkR, cT: midT, raise: 0.6, occLim: 0.97 });
  fur(extra, lg.calf, 7, { filter: (p, n) => n.dot(lg.back) < 0.3, flow: (p, n, d) => d.set(s * 0.1, -0.5, -1), len: [0.15, 0.22], wid: [0.06, 0.09], lift: 0.22, cR: darkR, cT: midT, raise: 0.5, occLim: 0.97 });
}
for (let i = 0; i < TAIL_N; i++) {
  const a = TAILP[i], b = TAILP[i + 1], d = b.clone().sub(a).normalize(), R = TAIL_R[i];
  const tip = Math.max(0, i - (TAIL_N - 4)) / 3;
  fur(extra, TAILV[i], Math.round(4 + 18 * R), { occl: false, flow: (p, nn, out) => out.copy(d).addScaledVector(nn, 0.02 - 0.35 * tip), len: [0.24, 0.34], wid: [0.17, 0.24], lift: 0.03 - 0.06 * tip, lenFn: () => (0.6 + 1.4 * R) * (1 - 0.25 * tip), cR: tailRoot, cT: tailTip, raise: 0.6, clump: 2, w: TAILW[i], thick: 0.26, curl: -0.08, arch: 0.03 });
}

/* =====================================================================================
 * Chimtech de Zaun (bronze vieilli) : cuve dorsale et sa flèche, module lombaire, tubes de verre et durites vertes, collier, épaulières,
 * brassards à fioles ; ceinture et pagne ; cicatrices
 * ===================================================================================== */
const S2 = J('spine2');
const wS2 = { w: 'spine2' };
const cuS2 = wo(COPPER, 'spine2'), cudS2 = wo(COPPERD, 'spine2');
const TORSO_SET = vols.filter(v => TORSO.includes(v) || v === ARMV.L.delt || v === ARMV.R.delt);
/* ---------- Cuve : berceau, bagues, montants, chapeau, flèche ---------- */
{
  const base = tankAt(-TH / 2);
  // berceau posé sur le haut du dos (plaque + selle), deux piques vers l'arrière
  box(core, base.clone().addScaledVector(TAX, -0.1).addScaledVector(TPZ, 0.04), 0.46, 0.08, 0.34, quatAlong(TAX, TPZ), cudS2);
  cylAB(core, tankAt(-TH / 2 - 0.08), tankAt(-TH / 2 + 0.03), 0.205, 0.19, 12, cuS2);
  for (const s of SIDES) {
    const sp = base.clone().addScaledVector(TPX, s * 0.2).addScaledVector(TAX, -0.08).addScaledVector(TPZ, -0.08);
    spike(core, sp, sp.clone().addScaledVector(TPX, s * 0.1).addScaledVector(TPZ, -0.18).addScaledVector(TAX, 0.04), 0.035, cuS2);
  }
  for (const h of [-TH / 2 + 0.035, 0.0, TH / 2 - 0.035]) ring(core, tankAt(h), TAX, TR + 0.012, 0.02, 4, 18, cudS2);
  for (let a = 0; a < 4; a++) {
    const an = Math.PI / 4 + a * Math.PI / 2, o = TPX.clone().multiplyScalar(Math.cos(an) * (TR + 0.01)).addScaledVector(TPZ, Math.sin(an) * (TR + 0.01));
    cylAB(core, tankAt(-TH / 2).add(o), tankAt(TH / 2).add(o), 0.012, 0.012, 5, cuS2);
  }
  // chapeau : large collerette, dôme, bague, puis la flèche effilée qui dépasse au-dessus de la tête
  cylAB(core, tankAt(TH / 2 - 0.03), tankAt(TH / 2 + 0.03), 0.19, 0.2, 12, cuS2);
  cylAB(core, tankAt(TH / 2 + 0.03), tankAt(TH / 2 + 0.055), 0.235, 0.235, 14, cudS2);
  cylAB(core, tankAt(TH / 2 + 0.055), tankAt(TH / 2 + 0.11), 0.15, 0.09, 10, cuS2);
  ring(core, tankAt(TH / 2 + 0.135), TAX, 0.055, 0.018, 4, 10, cudS2);
  cylAB(core, tankAt(TH / 2 + 0.11), tankAt(TH / 2 + 0.17), 0.05, 0.045, 8, cuS2);
  spike(core, tankAt(TH / 2 + 0.17), tankAt(TH / 2 + 0.45), 0.042, cuS2);
  // fiole arrière couchée, pique vers l'arrière (silhouette de profil)
  const r0 = tankAt(-0.04).addScaledVector(TPZ, -(TR + 0.02)), rd = TPZ.clone().multiplyScalar(-1).addScaledVector(TAX, 0.35).normalize();
  cylAB(core, r0, r0.clone().addScaledVector(rd, 0.05), 0.07, 0.07, 10, cudS2);
  cylAB(core, r0.clone().addScaledVector(rd, 0.05), r0.clone().addScaledVector(rd, 0.2), 0.05, 0.05, 10, Object.assign({}, wS2, { color: C.liquid, surf: SF.vial, jitter: 0.05, tint: false }));
  for (const u of [0.05, 0.2]) ring(core, r0.clone().addScaledVector(rd, u), rd, 0.056, 0.014, 4, 10, cuS2);
  cylAB(core, r0.clone().addScaledVector(rd, 0.2), r0.clone().addScaledVector(rd, 0.25), 0.065, 0.06, 10, cudS2);
  spike(core, r0.clone().addScaledVector(rd, 0.25), r0.clone().addScaledVector(rd, 0.5), 0.035, cuS2);
}
/* ---------- Module lombaire : disque de bronze à cœur vert, pique vers l'arrière ---------- */
{
  const p = MOD.p.clone().addScaledVector(MOD.n, 0.07), n = MOD.n, w = { w: MOD.w };
  cylAB(core, MOD.p.clone().addScaledVector(n, -0.02), p, 0.06, 0.06, 8, wo(COPPERD, MOD.w));
  cylAB(core, p, p.clone().addScaledVector(n, 0.04), 0.13, 0.12, 12, wo(COPPERD, MOD.w));
  ring(core, p.clone().addScaledVector(n, 0.045), n, 0.1, 0.03, 5, 14, wo(COPPER, MOD.w));
  ellip(core, p.clone().addScaledVector(n, 0.05), v3(0.075, 0.03, 0.075), quatAlong(n), Object.assign({}, w, { color: C.liquid, surf: SF.vial, detail: 1, jitter: 0, tint: false, vol: false }));
  cylAB(core, p.clone().addScaledVector(n, 0.04), p.clone().addScaledVector(n, 0.1), 0.035, 0.03, 8, wo(COPPER, MOD.w));
  spike(core, p.clone().addScaledVector(n, 0.1), p.clone().addScaledVector(n, 0.32).add(v3(0, -0.05, 0)), 0.03, wo(COPPER, MOD.w));
}
/* ---------- Tuyaux verts (le flux lumineux circule de la cuve vers le corps) ---------- */
const wHoseNeck = (p, w) => { const t = ss(-0.25, 0.15, p.z); w[0] = I('spine2'); w[1] = I('neck'); w[2] = 1 - t; w[3] = t; };
for (const s of SIDES) {
  const k = SK(s);
  // cuve → grand tube de verre lumineux arqué au-dessus de l'épaule (silhouette en cornes) → épaulière
  hose(core, [tankAt(TH / 2 - 0.06).addScaledVector(TPX, s * (TR + 0.02)), tankAt(TH / 2 + 0.06).addScaledVector(TPX, s * 0.3).addScaledVector(TPZ, -0.06),
    v3(s * 0.52, 2.92, -0.5), v3(s * 0.78, 2.7, -0.28), v3(s * 0.88, 2.44, -0.1), v3(s * 0.86, 2.34, -0.06)], 0.034,
  { glow: true, clamps: [0.36, 0.7], w: (p, w) => { const t = ss(0.6, 0.84, Math.abs(p.x)); w[0] = I('spine2'); w[1] = I('arm' + k); w[2] = 1 - t; w[3] = t; } });
  // anses de verre en C sur les flancs de la cuve
  hose(core, [tankAt(-0.14).addScaledVector(TPX, s * (TR + 0.02)), tankAt(-0.06).addScaledVector(TPX, s * (TR + 0.15)).addScaledVector(TPZ, -0.05),
    tankAt(0.1).addScaledVector(TPX, s * (TR + 0.16)).addScaledVector(TPZ, -0.05), tankAt(TH / 2 - 0.02).addScaledVector(TPX, s * (TR + 0.03))], 0.024, { glow: true, w: 'spine2' });
  // cuve → collier (côtés du cou)
  hose(core, [tankAt(-0.08).addScaledVector(TPX, s * (TR + 0.02)), tankAt(-0.12).addScaledVector(TPX, s * 0.3).addScaledVector(TPZ, 0.1),
    v3(s * 0.34, 2.6, -0.12), v3(s * 0.31, 2.48, 0.12), v3(s * 0.27, 2.38, 0.26)], 0.026, { w: wHoseNeck });
}
// cuve → long de l'échine → module lombaire
hose(core, [tankAt(-TH / 2 - 0.06).addScaledVector(TPZ, -0.12), tankAt(-TH / 2 - 0.2).addScaledVector(TPZ, -0.2).add(v3(0.05, 0, 0)),
  MOD.p.clone().addScaledVector(MOD.n, 0.14).add(v3(0.08, 0.16, 0)), MOD.p.clone().addScaledVector(MOD.n, 0.1).add(v3(0.0, 0.06, 0))], 0.03, { w: 'spine2' });
/* ---------- Collier de bronze (sous la crinière) et médaillons latéraux ---------- */
{
  const nc = v3(0, 2.34, 0.31), nax = v3(0, 0.18, 0.98).normalize();
  const wN = { w: wNeck };
  ring(core, nc, nax, 0.25, 0.045, 5, 16, Object.assign({}, COPPERD, wN), v3(1.08, 1, 1));
  ring(core, nc.clone().addScaledVector(nax, 0.045), nax, 0.24, 0.018, 4, 16, Object.assign({}, COPPER, wN), v3(1.08, 1, 1));
  for (let a = 0; a < 8; a++) {
    const an = a / 8 * Math.PI * 2, rp = v3(Math.cos(an) * 0.295 * 1.08, Math.sin(an) * 0.295, 0).applyQuaternion(new Quat().setFromUnitVectors(v3(0, 0, 1), nax)).add(nc);
    rivet(core, rp, 0.02, Object.assign({}, COPPER, wN));
  }
  for (const s of SIDES) {
    const mc = v3(s * 0.27, 2.38, 0.26), md = v3(s, 0.1, 0.2).normalize();
    cylAB(core, mc.clone().addScaledVector(md, -0.03), mc.clone().addScaledVector(md, 0.03), 0.075, 0.07, 10, Object.assign({}, COPPER, wN));
    ellip(core, mc.clone().addScaledVector(md, 0.035), v3(0.035, 0.012, 0.035), quatAlong(md), Object.assign({}, wN, { color: C.liquid, surf: SF.vial, detail: 1, jitter: 0, tint: false, vol: false }));
  }
}
/* ---------- Épaulières de bronze (les deux épaules) ---------- */
for (const s of SIDES) {
  const k = SK(s), SL = J('arm' + k), a = ARMV[k], wA = { w: 'arm' + k };
  const c0 = SL.clone().add(v3(s * 0.06, 0.07, 0.0));
  const PAUL = wo(COPPER, 'arm' + k, { jitter: 0.1 });
  const pole0 = v3(s * 0.72, 0.68, 0.04);
  const sh1 = shell(core, c0, pole0, 0.3, 1.08, v3(1, 0.75, 1.08), v3(0, 0, 1), PAUL, wo(COPPERD, 'arm' + k));
  const c1 = SL.clone().addScaledVector(a.ua, 0.22).add(v3(s * 0.05, 0, 0));
  shell(core, c1, v3(s * 0.97, 0.22, 0.06), 0.25, 0.98, v3(1, 0.8, 1.12), v3(0, 0, 1), wo(COPPERD, 'arm' + k), wo(COPPER, 'arm' + k));
  for (let r = 0; r < 10; r++) {
    const an = r / 10 * Math.PI * 2, rp = v3(Math.cos(an) * sh1.rimR, sh1.rimY, Math.sin(an) * sh1.rimR).multiply(v3(1, 0.75, 1.08)).applyQuaternion(sh1.q).add(c0);
    rivet(core, rp, 0.018, wo(COPPERD, 'arm' + k));
  }
  for (let i = 0; i < 2; i++) { // piques de l'épaulière
    const p = c0.clone().add(pole0.clone().normalize().multiplyScalar(0.19)).add(v3(0, 0, -0.1 + i * 0.13));
    spike(core, p, p.clone().add(v3(s * 0.08, 0.17 - i * 0.04, -0.06)), 0.035, wo(COPPER, 'arm' + k));
  }
  ring(core, SL.clone().addScaledVector(a.ua, 0.44), a.ua, 0.18, 0.026, 4, 12, Object.assign({}, LEATHER, wA));
  cylAB(core, v3(s * 0.86, 2.34, -0.06), v3(s * 0.82, 2.3, 0.01), 0.048, 0.052, 8, wo(COPPER, 'arm' + k));
}
/* ---------- Brassards de bronze à grosses fioles vertes ---------- */
for (const s of SIDES) {
  const k = SK(s), EL = J('fore' + k), a = ARMV[k], wF = 'fore' + k;
  const q = quatAlong(a.la, v3(s, 0, 0));
  const R0 = 0.185, R1 = 0.15, U0 = 0.32, U1 = 0.88, rad = u => lerp(R0, R1, (u - U0) / (U1 - U0));
  // trois plaques qui se chevauchent, chacune évasée côté coude (lèvre épaisse), plus une coque intérieure sombre
  for (const [ua, ub] of [[U0, 0.62], [0.58, U1]]) {
    const ra = rad(ua) + 0.012, rb = rad(ub);
    cylAB(core, EL.clone().addScaledVector(a.la, ua), EL.clone().addScaledVector(a.la, ub), ra, rb, 7, wo(COPPER, wF, { hint: v3(s, 0, 0) }), true);
    ring(core, EL.clone().addScaledVector(a.la, ua + 0.012), a.la, ra + 0.004, 0.026, 4, 7, wo(COPPERD, wF), null);
  }
  cylAB(core, EL.clone().addScaledVector(a.la, U1 - 0.005), EL.clone().addScaledVector(a.la, U0 + 0.005), R1 * 0.95, R0 * 0.95, 7, wo(COPPERD, wF, { hint: v3(s, 0, 0) }), true);
  ring(core, EL.clone().addScaledVector(a.la, U1 - 0.01), a.la, R1 + 0.006, 0.026, 4, 7, wo(COPPERD, wF));
  for (let i = 0; i < 5; i++) { // rivets de la première plaque
    const an = (i / 5) * Math.PI * 2, rp = v3(Math.cos(an) * (rad(0.42) + 0.022), 0, Math.sin(an) * (rad(0.42) + 0.022)).applyQuaternion(q).add(EL.clone().addScaledVector(a.la, 0.42));
    rivet(core, rp, 0.016, wo(COPPERD, wF));
  }
  // fenêtre côté extérieur : trois fioles lumineuses entre des montants
  const outv = v3(0, 0, 1).applyQuaternion(q), side = v3(1, 0, 0).applyQuaternion(q);
  const barAt = ang => { const d = outv.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang)); cylAB(core, EL.clone().addScaledVector(a.la, 0.36).addScaledVector(d, rad(0.36) + 0.05), EL.clone().addScaledVector(a.la, 0.84).addScaledVector(d, rad(0.84) + 0.05), 0.013, 0.013, 5, wo(COPPER, wF)); };
  for (const ang of [-0.54, -0.18, 0.18, 0.54]) barAt(ang);
  box(core, EL.clone().addScaledVector(a.la, 0.6).addScaledVector(outv, rad(0.6) + 0.018), 0.22, a.la.length() * 0.5, 0.03, q, wo(COPPERD, wF, { color: C.copperD.clone().multiplyScalar(0.5) }));
  for (let j = -1; j <= 1; j++) {
    const ang = j * 0.36, dirO = outv.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
    const u0 = 0.38, u1 = 0.82;
    const pa = EL.clone().addScaledVector(a.la, u0).addScaledVector(dirO, rad(u0) + 0.046), pb = EL.clone().addScaledVector(a.la, u1).addScaledVector(dirO, rad(u1) + 0.046);
    cylAB(core, pa, pb, 0.032, 0.032, 7, { w: wF, color: C.liquid, surf: SF.vial, jitter: 0.06, tint: false }); // grosse fiole de chimie lumineuse
    const ld = pb.clone().sub(pa).normalize();
    for (const [pp, sg] of [[pa, -1], [pb, 1]]) cylAB(core, pp.clone().addScaledVector(ld, -sg * 0.012), pp.clone().addScaledVector(ld, sg * 0.03), 0.038, 0.034, 7, wo(COPPERD, wF));
  }
  // petit tuyau de la fiole vers le dos de la main
  const vc = EL.clone().addScaledVector(a.la, U1).addScaledVector(outv, R1 + 0.01);
  hose(core, [vc, vc.clone().addScaledVector(a.la, 0.12).addScaledVector(outv, 0.02), J('hand' + k).clone().addScaledVector(outv, 0.1).add(v3(0, 0.06, 0.02))], 0.016, { w: wF });
}
/* ---------- Sangles qui épousent le corps (lancer de rayons sur les volumes) : ceinture, cicatrices ---------- */
function strap(aims, width, thick, o) {
  const set = o.set || TORSO_SET, orgF = o.org || (a => v3(0, a.y, Math.min(a.z, 0.05) * 0.4 - 0.05));
  const curve = new THREE.CatmullRomCurve3(aims), N = Math.max(2, Math.round(curve.getLength() * (o.density || 26)));
  const P = [], Nn = [], Wv = [];
  for (let i = 0; i <= N; i++) {
    const a = curve.getPointAt(i / N), org = orgF(a);
    const dir = a.clone().sub(org).normalize(), hit = rayExit(org, dir, set);
    const p = org.clone().addScaledVector(dir, hit.t + thick * 0.6);
    _t1.copy(p).sub(hit.v.c).applyQuaternion(hit.v.qi).divide(hit.v.r).divide(hit.v.r).applyQuaternion(hit.v.q).normalize();
    P.push(p); Nn.push(_t1.clone()); Wv.push(hit.v.w);
  }
  const sideV = [];
  for (let i = 0; i <= N; i++) {
    const tg = P[Math.min(N, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
    const taper = o.taper ? Math.sin(Math.PI * (0.08 + 0.84 * i / N)) : 1;
    sideV.push(new V3().crossVectors(tg, Nn[i]).normalize().multiplyScalar(width / 2 * taper));
  }
  const cS = o.color || C.leather;
  for (let i = 0; i < N; i++) {
    const q = [];
    for (const j of [i, i + 1]) {
      const p = P[j], n = Nn[j], sd = sideV[j];
      q.push(p.clone().add(sd), p.clone().sub(sd), p.clone().sub(sd).addScaledVector(n, thick), p.clone().add(sd).addScaledVector(n, thick));
    }
    const ref = P[i].clone().add(P[i + 1]).multiplyScalar(0.5).addScaledVector(Nn[i], thick * 0.5);
    const wSrc = Wv[i]; setW({ w: wSrc }, P[i]);
    const cc = _col.copy(cS).multiplyScalar(0.85 + rnd() * 0.3).clone();
    for (const [x, y] of [[3, 2], [0, 3], [2, 1]]) {
      triO(core, q[x], q[y], q[y + 4], cc, cc, cc, null, null, null, ref, o.surf || SF.leather);
      triO(core, q[x], q[y + 4], q[x + 4], cc, cc, cc, null, null, null, ref, o.surf || SF.leather);
    }
    if (o.rivets && i % o.rivets === 0 && i > 0) rivet(core, P[i].clone().addScaledVector(Nn[i], thick * 1.1), 0.013, Object.assign({}, COPPER, { w: wSrc }));
  }
  return { P, Nn, Wv };
}
const belt = strap([v3(0.45, 1.56, 0.1), v3(0.3, 1.52, 0.3), v3(0, 1.5, 0.38), v3(-0.3, 1.52, 0.3), v3(-0.45, 1.56, 0.1), v3(-0.42, 1.6, -0.2), v3(0, 1.64, -0.42), v3(0.42, 1.6, -0.2), v3(0.45, 1.56, 0.1)], 0.1, 0.03, { rivets: 6 });
{ // boucle de bronze
  const i = Math.round(belt.P.length * 0.25), p = belt.P[i], n = belt.Nn[i];
  box(core, p.clone().addScaledVector(n, 0.03), 0.12, 0.13, 0.025, quatAlong(UP, n), Object.assign({}, COPPER, { w: belt.Wv[i] }));
  box(core, p.clone().addScaledVector(n, 0.045), 0.06, 0.07, 0.02, quatAlong(UP, n), Object.assign({}, LEATHER, { w: belt.Wv[i] }));
}
/* ---------- Pagne : rabats de toile kaki (devant, derrière par-dessus la base de la queue, hanches) ---------- */
function flap(top, down, across, out, wTop, wBot, len, rows, o) {
  // grille rows × 3 colonnes, double face, bas déchiqueté
  const cols = 4, G = [];
  for (let r = 0; r <= rows; r++) {
    const f = r / rows, row = [];
    for (let c = 0; c <= cols; c++) {
      const v = c / cols * 2 - 1, wd = lerp(wTop, wBot, f);
      const p = top.clone().addScaledVector(down, f * len).addScaledVector(across, v * wd).addScaledVector(out, (o.bulge || 0.04) * Math.sin(f * Math.PI * 0.9) + (o.flare || 0) * f * f);
      if (r === rows) p.addScaledVector(down, (c & 1 ? -0.06 : 0.03) + (hash3(p.x, p.y, p.z) - 0.5) * 0.06);
      row.push(p);
    }
    G.push(row);
  }
  setW(o, top);
  const cF = new THREE.Color(), cB = new THREE.Color(), _r = new V3();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cF.copy(o.color).multiplyScalar(0.85 + rnd() * 0.3).lerp(C.clothD, r === rows - 1 ? 0.25 : 0);
    cB.copy(cF).multiplyScalar(0.55);
    const A = G[r][c], Bq = G[r][c + 1], Cq = G[r + 1][c + 1], D = G[r + 1][c];
    _r.copy(A).add(Cq).multiplyScalar(0.5).addScaledVector(out, -1);
    triO(core, A, Bq, Cq, cF, cF, cF, null, null, null, _r, SF.cloth); triO(core, A, Cq, D, cF, cF, cF, null, null, null, _r, SF.cloth);
    _r.copy(A).add(Cq).multiplyScalar(0.5).addScaledVector(out, 1);
    triO(core, A, Bq, Cq, cB, cB, cB, null, null, null, _r, SF.cloth); triO(core, A, Cq, D, cB, cB, cB, null, null, null, _r, SF.cloth);
  }
}
{
  const ib = Math.round(belt.P.length * 0.25), pf = belt.P[ib].clone().addScaledVector(belt.Nn[ib], 0.02);
  flap(pf.clone().add(v3(0, -0.04, 0)), v3(0, -1, 0.12).normalize(), v3(1, 0, 0), v3(0, 0.1, 1).normalize(), 0.17, 0.15, 0.5, 3, { w: 'pelvis', color: C.clothL, bulge: 0.05, flare: 0.06 });
  const iBk = Math.round(belt.P.length * 0.75), pb = belt.P[iBk].clone().addScaledVector(belt.Nn[iBk], 0.02);
  flap(pb.clone().add(v3(0, -0.03, 0)), v3(0, -1, -0.55).normalize(), v3(-1, 0, 0), v3(0, 0.3, -1).normalize(), 0.18, 0.15, 0.42, 3, { w: 'pelvis', color: C.clothL, bulge: 0.08, flare: 0.1 });
  for (const s of SIDES) {
    const iS = Math.round(belt.P.length * (s > 0 ? 0.04 : 0.5)), ps = belt.P[iS].clone().addScaledVector(belt.Nn[iS], 0.02);
    flap(ps.clone().add(v3(0, -0.03, 0)), v3(s * 0.15, -1, 0).normalize(), v3(0, 0, 1), v3(s, 0.1, 0).normalize(), 0.11, 0.08, 0.3, 2, { w: 'pelvis', color: C.cloth, bulge: 0.04, flare: 0.08 });
  }
}
/* ---------- Cicatrices rouges (griffures) : front et arcade droite, poitrail gauche, dos ---------- */
const SCAR = { color: C.scar, surf: SF.skin, density: 60, taper: true };
{
  const org = () => hp(0, 0.0, 0.05);
  for (let i = 0; i < 3; i++) {
    const o = i * 0.032;
    strap([hp(-0.02 - o, 0.2, 0.12), hp(-0.07 - o, 0.14, 0.2), hp(-0.12 - o, 0.06, 0.22)], 0.016 * HS, 0.008, Object.assign({ set: HEADV, org }, SCAR));
  }
  strap([hp(0.03, 0.1, 0.25), hp(0.0, 0.07, 0.33), hp(-0.03, 0.05, 0.4)], 0.014 * HS, 0.006, Object.assign({ set: HEADV, org: () => hp(0, -0.02, 0.25) }, SCAR));
  for (let i = 0; i < 3; i++) {
    const o = i * 0.06;
    strap([v3(0.12 + o, 2.28 - o * 0.3, 0.5), v3(0.22 + o, 2.12 - o * 0.3, 0.5), v3(0.3 + o, 1.96 - o * 0.3, 0.46)], 0.03, 0.012, SCAR);
    strap([v3(-0.06 - o, 2.22 - o * 0.2, -0.8), v3(-0.16 - o, 2.06 - o * 0.2, -0.8), v3(-0.24 - o, 1.88 - o * 0.2, -0.7)], 0.034, 0.014, SCAR);
  }
}

/* =====================================================================================
 * Maillage, matériaux et liaison
 * ===================================================================================== */
const U = {
  uChem: { value: new THREE.Color() }, uBlood: { value: new THREE.Color() }, uBounce: { value: new THREE.Color() },
  uRim: { value: new THREE.Color() }, uTankPos: { value: TC.clone() }, uTime: { value: 0 },
  uBristle: { value: 0 }, uRipple: { value: 0.05 }, uFlow: { value: 1 }, uRimK: { value: 1.6 }, uFill: { value: new THREE.Color() },
};
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
bodyMat.skinning = true;
bodyMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec4 aSurf;
attribute vec4 aFx;
uniform vec3 uTankPos;
uniform float uTime, uBristle, uRipple, uFlow;
varying vec2 vRM;
varying vec3 vEm;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
float wv = sin(uTime * 1.35 + position.x * 3.1 + position.y * 4.7 - position.z * 2.3);
transformed += aFx.xyz * (uBristle + uRipple * wv);
vRM = aSurf.xy;
float fl = 0.0;
if (aFx.w > 0.0) { float sw = max(0.0, sin(aFx.w * 7.0 - uTime * 3.1)); sw *= sw; sw *= sw; sw *= sw; fl = sw * uFlow; }
float tb = 1.0 - smoothstep(0.15, 0.95, distance(position, uTankPos));
vEm = vec3(aSurf.z * (1.0 + fl * 5.0), aSurf.w, tb * tb * (1.0 - aSurf.y));`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uChem, uBlood, uBounce, uRim, uFill;
uniform float uRimK;
varying vec2 vRM;
varying vec3 vEm;`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uChem * vEm.x + uBlood * vEm.y + diffuseColor.rgb * uBounce * vEm.z;
float frs = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float fr3 = frs * frs * frs;
vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
float upK = clamp(dot(normal, upV) * 0.5 + 0.55, 0.0, 1.0);
totalEmissiveRadiance += uRim * diffuseColor.rgb * fr3 * upK * (1.0 - vRM.y * 0.5);
// lumière d'appoint propre au personnage (la ruelle l'éclaire surtout à contre-jour) : garde lisibles le bleu
// ardoise de la fourrure, le gris-bleu du masque et le bronze, plus fort sur les faces tournées vers le haut
totalEmissiveRadiance += diffuseColor.rgb * uFill * (0.35 + 0.65 * upK);
// reflet d'ambiance du bronze (pas de carte d'environnement sur le personnage) : voûte froide au-dessus, sol sombre
vec3 rvw = reflect(-normalize(vViewPosition), normal);
float ek = clamp(dot(rvw, upV) * 0.55 + 0.5, 0.0, 1.0);
totalEmissiveRadiance += diffuseColor.rgb * vRM.y * (0.04 + 0.4 * ek * ek * ek) * (1.0 - 0.5 * vRM.x);
#if NUM_DIR_LIGHTS > 0
// liseré de contre-jour : la clé de la scène (derrière lui) déborde sur la silhouette
float rl = clamp(dot(normal, directionalLights[0].direction) + 0.55, 0.0, 1.0);
totalEmissiveRadiance += directionalLights[0].color * diffuseColor.rgb * (fr3 * rl * uRimK);
#endif`);
};
bodyMat.customProgramCacheKey = () => 'ww-warwick-body-v2';

function concat(key, n) { const a = core[key], b = extra[key], out = new Float32Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; }
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(concat('p'), 3));
geo.setAttribute('normal', new THREE.BufferAttribute(concat('n'), 3));
geo.setAttribute('color', new THREE.BufferAttribute(concat('c'), 3));
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(core.si).concat(extra.si), 4));
geo.setAttribute('skinWeight', new THREE.BufferAttribute(concat('sw'), 4));
geo.setAttribute('aSurf', new THREE.BufferAttribute(concat('s'), 4));
geo.setAttribute('aFx', new THREE.BufferAttribute(concat('f'), 4));
geo.computeBoundingSphere();
const coreCount = core.p.length / 3, totalCount = coreCount + extra.p.length / 3;

const body = new THREE.SkinnedMesh(geo, bodyMat);
body.name = 'warwick-corps';
body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
body.add(B.pelvis);
root.add(body);
root.updateMatrixWorld(true);
const skeleton = new THREE.Skeleton(bones);
body.bind(skeleton);

/* ---------- Cuve : liquide additif (volume lumineux), verre, bulles ---------- */
const toS2 = p => p.clone().sub(S2);
const liqMat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color() }, uTime: { value: 0 } }]),
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
#include <fog_pars_vertex>
void main() { vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz; vH = position.y + position.z * 0.3;
gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
  fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH;
#include <common>
#include <fog_pars_fragment>
void main() { float f = abs(dot(normalize(vN), normalize(vV)));
float band = 0.85 + 0.15 * sin(vH * 38.0 - uTime * 2.2) * sin(vH * 11.0 + uTime * 0.7);
gl_FragColor = vec4(uColor * (0.1 + 0.8 * f * f) * band, 1.0);
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
}`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
});
function cylGeoAB(a, b, r, seg, open) {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, open);
  g.applyMatrix4(M4(toS2(a.clone().add(b).multiplyScalar(0.5)), quatAlong(d)));
  return g.toNonIndexed();
}
const liqGeo = cylGeoAB(tankAt(-TH / 2 + 0.03), tankAt(TH / 2 - 0.06), TR - 0.02, 16, false);
const liquid = new THREE.Mesh(liqGeo, liqMat); liquid.name = 'warwick-chimie'; liquid.renderOrder = 2;
B.spine2.add(liquid);
const glassMat = new THREE.MeshStandardMaterial({ color: col(0xd8f5e6), transparent: true, opacity: 0.12, roughness: 0.06, metalness: 0.1, depthWrite: false, emissive: new THREE.Color() });
glassMat.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float gf = 1.0 - abs(dot(normal, normalize(vViewPosition)));
diffuseColor.a = mix(diffuseColor.a, 0.72, gf * gf * gf);`);
};
glassMat.customProgramCacheKey = () => 'ww-warwick-glass';
const glassGeo = cylGeoAB(tankAt(-TH / 2), tankAt(TH / 2), TR, 20, true);
const glass = new THREE.Mesh(glassGeo, glassMat); glass.name = 'warwick-verre'; glass.renderOrder = 3;
B.spine2.add(glass);

const BUB_N = 26;
const bubMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), bubMat, BUB_N);
bubbles.name = 'warwick-bulles'; bubbles.frustumCulled = false;
B.spine2.add(bubbles);
const bub = [];
for (let i = 0; i < BUB_N; i++) bub.push({ a: rnd() * 6.283, r: 0.02 + rnd() * 0.09, sp: 0.07 + rnd() * 0.16, off: rnd(), sz: 0.006 + rnd() * 0.012, wob: rnd() * 6.283 });
const tankBase = toS2(tankAt(-TH / 2 + 0.05)), tankAxis = TAX.clone(), tankPX = TPX.clone(), tankPZ = TPZ.clone();
const tankFill = TH - 0.12;

/* ---------- Halos des yeux ---------- */
// Texture : noyau brûlant, halo doux et traînée horizontale (reflet anamorphique) : un regard qui « tranche ».
const glowTex = (() => {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.2)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2); g.scale(1, 0.06);
  gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, S / 2, 0, Math.PI * 2); g.fill(); g.restore();
  const t = new THREE.CanvasTexture(c); return t;
})();
const eyeMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
// sortie de l'orbite (avant + extérieur) : les arcades et la collerette ne masquent plus le halo de trois quarts
const eyeGlows = SIDES.map(s => {
  const sp = new THREE.Sprite(eyeMat);
  sp.position.copy(hp(s * 0.118, 0.066, 0.31)).sub(HJ); sp.scale.set(0.3, 0.16, 1); sp.renderOrder = 4;
  B.head.add(sp); return sp;
});

/* ---------- Bave chimique : une goutte se forme à la commissure, tombe, s'écrase ---------- */
const droolMat = new THREE.MeshBasicMaterial({ color: 0x66ff44, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const drool = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), droolMat);
drool.name = 'warwick-bave'; drool.visible = false; drool.frustumCulled = false; drool.renderOrder = 4;
root.add(drool);
const lipLocal = hp(0.072, -0.112, 0.43).sub(HJ);
const DR = { phase: 0, t0: 0, next: 7, vy: 0 };

/* =====================================================================================
 * Animation
 * ===================================================================================== */
const P0 = B.pelvis.position.clone();
// colonne, cou, tête : lacet appliqué en dernier (« il pivote, puis se cambre ») → le hurlement présente son profil
for (const n of ['pelvis', 'spine1', 'spine2', 'neck', 'head']) B[n].rotation.order = 'YXZ';
const nz = (t, k) => (Math.sin(t * 0.731 + k) + 0.6 * Math.sin(t * 1.377 + k * 2.13) + 0.3 * Math.sin(t * 2.913 + k * 3.71)) / 1.9;
let aseed = 9157;
const arnd = () => ((aseed = (aseed * 16807) % 2147483647) / 2147483647);
const st = {
  bp: 0, tp: 0, lx: 0, ly: 0, lz: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, fx: 0, fy: 0, fz: 0, lookNext: 1.5, lastT: -1,
  ear: [{ t0: -9, next: 3.2, amp: 1 }, { t0: -9, next: 5.1, amp: 1 }], sniffT0: -9, sniffNext: 8, blinkT0: -9, blinkNext: 3.5,
};
function resetTimers(t) {
  st.lookNext = t + 1; st.ear[0].next = t + 2 + arnd() * 4; st.ear[1].next = t + 3 + arnd() * 5;
  st.sniffNext = t + 6 + arnd() * 8; st.blinkNext = t + 2 + arnd() * 4;
  DR.phase = 0; DR.next = t + 4 + arnd() * 6; drool.visible = false;
}
// IK des jambes : données de liaison
const LAT = s => v3(1, 0, -0.16 * s).normalize();
const _x = new V3(), _y = new V3(), _z = new V3();
function basisQ(dir, lat, out) {
  _y.copy(dir).normalize(); _z.crossVectors(lat, _y).normalize(); _x.crossVectors(_y, _z);
  _mb.makeBasis(_x, _y, _z); return out.setFromRotationMatrix(_mb);
}
const LEGS = SIDES.map(s => {
  const k = SK(s), hip = J('thigh' + k), kn = J('shin' + k), hk = J('meta' + k), ball = J('foot' + k), lat = LAT(s);
  return {
    s, thigh: B['thigh' + k], shin: B['shin' + k], meta: B['meta' + k], foot: B['foot' + k], lat,
    hipLocal: B['thigh' + k].position.clone(), ball: ball.clone(),
    lT: kn.distanceTo(hip), lS: hk.distanceTo(kn), lM: ball.distanceTo(hk), mDir0: hk.clone().sub(ball).normalize(),
    iT: basisQ(kn.clone().sub(hip), lat, new Quat()).invert(),
    iS: basisQ(hk.clone().sub(kn), lat, new Quat()).invert(),
    iM: basisQ(ball.clone().sub(hk), lat, new Quat()).invert(),
  };
});
const _hip = new V3(), _hock = new V3(), _knee = new V3(), _dd = new V3(), _perp = new V3(), _md = new V3();
const _qT = new Quat(), _qS = new Quat(), _qM = new Quat(), _qP = new Quat(), _qa = new Quat();
function solveLeg(L, metaTilt) {
  _hip.copy(L.hipLocal).applyMatrix4(B.pelvis.matrix);
  _md.copy(L.mDir0).applyAxisAngle(L.lat, metaTilt);
  _hock.copy(L.ball).addScaledVector(_md, L.lM);
  _dd.subVectors(_hock, _hip);
  let dist = _dd.length();
  const a = L.lT, b = L.lS;
  dist = clamp(dist, Math.abs(a - b) + 0.02, (a + b) * 0.996);
  _dd.normalize();
  _perp.crossVectors(_dd, L.lat).normalize();
  const x = (a * a - b * b + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, a * a - x * x));
  _knee.copy(_hip).addScaledVector(_dd, x).addScaledVector(_perp, h);
  _hock.copy(_hip).addScaledVector(_dd, dist);
  basisQ(_t1.subVectors(_knee, _hip), L.lat, _qT).multiply(L.iT);
  basisQ(_t1.subVectors(_hock, _knee), L.lat, _qS).multiply(L.iS);
  basisQ(_t1.subVectors(L.ball, _hock), L.lat, _qM).multiply(L.iM);
  L.thigh.quaternion.copy(_qP).invert().multiply(_qT);
  L.shin.quaternion.copy(_qT).invert().multiply(_qS);
  L.meta.quaternion.copy(_qS).invert().multiply(_qM);
  L.foot.quaternion.copy(_qM).invert();
}
// doigts : axe de flexion (repère du parent = repère modèle au repos)
const FING = SIDES.map(s => {
  const k = SK(s), h = HAND[k];
  return { s, k, fingers: h.fingers, thumb: B['th' + k], axis: h.spread.clone().multiplyScalar(-s), taxis: h.hd.clone().cross(h.palm).normalize().multiplyScalar(s) };
});
const AR = SIDES.map(s => { const k = SK(s); return { s, clav: B['clav' + k], arm: B['arm' + k], fore: B['fore' + k], hand: B['hand' + k] }; });

/* ---------- IK du bras droit (coup de griffe) : le poignet suit une trajectoire chorégraphiée ----------
 * Clés en coordonnées « modèle au repos » attachées au buste (spine2) : la torsion du buste s'ajoute au geste.
 * [poignet, direction du coude] : armé derrière l'épaule → arc haut devant → fin de frappe basse en travers → accompagnement. */
const SWK = [
  [v3(-1.28, 3.22, -0.04), v3(-0.3, -0.8, -0.5)],   // armé : patte levée bien au-dessus et en dehors de l'épaule (silhouette)
  [v3(-0.78, 2.5, 0.95), v3(-0.9, -0.15, -0.4)],    // frappe, haut devant
  [v3(0.22, 1.38, 1.0), v3(-0.55, -0.35, -0.75)],   // frappe, bas en travers
  [v3(0.42, 1.12, 0.62), v3(-0.45, -0.45, -0.8)],   // accompagnement
];
const ARM_IK = (() => {
  const k = 'R', SL = J('armR'), EL = J('foreR'), WL = J('handR');
  const u0 = EL.clone().sub(SL), f0 = WL.clone().sub(EL), n0 = new V3().crossVectors(u0, f0).normalize();
  return {
    a: u0.length(), b: f0.length(), S2: J('spine2').clone(), shoulderLocal: B.armR.position.clone(),
    iA: basisQ(u0, n0, new Quat()).invert(), iF: basisQ(f0, n0, new Quat()).invert(), k,
  };
})();
const _m4a = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _qS2 = new Quat(), _qC = new Quat(), _qAb = new Quat(), _qFb = new Quat();
const _sh = new V3(), _tg2 = new V3(), _pole = new V3(), _el = new V3(), _ad = new V3(), _an = new V3(), _ik1 = new V3(), _ik2 = new V3();
const _qIKa = new Quat(), _qIKf = new Quat();
// Catmull-Rom sur les clés (extrémités dupliquées), u ∈ [0, n-1]
const cr = (a, b, c, d, f) => 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
function swPath(u, outP, outPole) {
  const n = SWK.length, i = Math.min(n - 2, Math.max(0, Math.floor(u))), f = clamp(u - i, 0, 1);
  const p0 = SWK[Math.max(0, i - 1)][0], p1 = SWK[i][0], p2 = SWK[i + 1][0], p3 = SWK[Math.min(n - 1, i + 2)][0];
  outP.set(cr(p0.x, p1.x, p2.x, p3.x, f), cr(p0.y, p1.y, p2.y, p3.y, f), cr(p0.z, p1.z, p2.z, p3.z, f));
  outPole.copy(SWK[i][1]).lerp(SWK[i + 1][1], f * f * (3 - 2 * f)).normalize();
}
// Résout bras + avant-bras droits (repère du corps) et écrit les quaternions locaux dans _qIKa / _qIKf.
function solveArmIK(wristBind, poleBind) {
  const P = B.pelvis, A = AR[1];
  P.updateMatrix(); B.spine1.updateMatrix(); B.spine2.updateMatrix(); A.clav.updateMatrix();
  _m4a.multiplyMatrices(P.matrix, B.spine1.matrix).multiply(B.spine2.matrix);       // buste → corps
  _qS2.copy(P.quaternion).multiply(B.spine1.quaternion).multiply(B.spine2.quaternion);
  _qC.copy(_qS2).multiply(A.clav.quaternion);
  _m4b.multiplyMatrices(_m4a, A.clav.matrix);
  _sh.copy(ARM_IK.shoulderLocal).applyMatrix4(_m4b);                                  // épaule
  _tg2.copy(wristBind).sub(ARM_IK.S2).applyMatrix4(_m4a);                             // cible du poignet
  _pole.copy(poleBind).applyQuaternion(_qS2);
  const a = ARM_IK.a, b = ARM_IK.b;
  _ad.subVectors(_tg2, _sh);
  const dist = clamp(_ad.length(), Math.abs(a - b) + 0.03, (a + b) * 0.995);
  _ad.normalize();
  _pole.addScaledVector(_ad, -_pole.dot(_ad)).normalize();
  const x = (a * a - b * b + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, a * a - x * x));
  _el.copy(_sh).addScaledVector(_ad, x).addScaledVector(_pole, h);
  _tg2.copy(_sh).addScaledVector(_ad, dist);
  _ik1.subVectors(_el, _sh); _ik2.subVectors(_tg2, _el);
  _an.crossVectors(_ik1, _ik2);
  if (_an.lengthSq() < 1e-8) _an.crossVectors(_ik1, _pole);
  _an.normalize();
  basisQ(_ik1, _an, _qAb).multiply(ARM_IK.iA);
  basisQ(_ik2, _an, _qFb).multiply(ARM_IK.iF);
  _qIKa.copy(_qC).invert().multiply(_qAb);
  _qIKf.copy(_qAb).invert().multiply(_qFb);
}
const _swP = new V3(), _swPole = new V3(), _XAX = v3(1, 0, 0);

/* ---------- Traînée des griffes : 4 rubans additifs qui suivent les pointes pendant la frappe ---------- */
const TR_N = 14, TR_C = 4;
const trPos = new Float32Array(TR_C * TR_N * 2 * 3), trA = new Float32Array(TR_C * TR_N * 2);
const trHist = new Float32Array(TR_C * TR_N * 6); // par griffe et par échantillon : pointe (3) + base (3)
const trAge = new Float64Array(TR_N); // temps absolus : double précision (le fond tourne des heures)
let trHead = 0, trFill = 0;
const trGeo = new THREE.BufferGeometry();
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
trGeo.setAttribute('aA', new THREE.BufferAttribute(trA, 1).setUsage(THREE.DynamicDrawUsage));
{
  const idx = [];
  for (let c = 0; c < TR_C; c++) for (let i = 0; i + 1 < TR_N; i++) {
    const o = (c * TR_N + i) * 2;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  trGeo.setIndex(idx);
}
const trMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color() } },
  vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, 1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const trail = new THREE.Mesh(trGeo, trMat);
trail.name = 'warwick-griffes'; trail.frustumCulled = false; trail.visible = false; trail.renderOrder = 5;
root.add(trail);
// pointes et bases des griffes droites, dans le repère de chaque phalange
const TR_TIP = [], TR_BASE = [];
{
  const h = HAND.R;
  for (let f = 0; f < 4; f++) {
    const kn = J('fR' + f), fd = h.hd.clone().addScaledVector(h.palm, 0.15).normalize();
    const cv = h.palm.clone().multiplyScalar(0.75).add(v3(0, 0, 0.5)), cl = CLAW_L[f];
    const base = kn.clone().addScaledVector(fd, 0.09), cvn = cv.clone().addScaledVector(fd, -cv.dot(fd)).normalize();
    const tip = base.clone().addScaledVector(fd, cl).addScaledVector(cvn, cl * 0.36);
    TR_TIP.push(tip.sub(kn)); TR_BASE.push(base.clone().addScaledVector(fd, cl * 0.78).sub(kn));
  }
}
const _rootInv = new THREE.Matrix4(), _trv = new V3();
const EARS = SIDES.map(s => B['ear' + SK(s)]);
const TAIL = []; for (let i = 0; i < TAIL_N; i++) TAIL.push(B['tail' + i]);
const _o3 = new THREE.Object3D(), _bubP = new V3();
const _chem = new THREE.Color(), _tmpC = new THREE.Color();
const RIM = col(0x9cbce8), FILL = new THREE.Color(0.13, 0.14, 0.2); // liseré froid, appoint bleuté (compense la brume verte)
const _eyeC = new THREE.Color(), _tmpC2 = new THREE.Color();
const ZERO_AUDIO = { level: 0, bass: 0, mid: 0, high: 0, beat: 0 }, ZERO_PTR = { x: 0, y: 0 };
// période de bouclage du temps shader : 40π s contient un nombre entier de cycles de toutes ses fréquences
const TWRAP = 40 * Math.PI;
let bubCount = BUB_N;

// Échantillonne les pointes à ~60 Hz (longueur de traînée indépendante du nombre d'images), l'échantillon de tête suit la griffe.
const TR_COL = col(0xb4d0ff), _trC = new THREE.Color();
function updateTrail(ts, t, Hn, blood) {
  if (ts < 0.27 || ts >= 0.8) { if (trail.visible) trail.visible = false; trFill = 0; return; }
  if (ts < 0.6) {
    root.updateMatrixWorld(true);
    _rootInv.copy(root.matrixWorld).invert();
    if (trFill === 0 || t - trAge[trHead] >= 0.016) { trHead = (trHead + 1) % TR_N; trFill = Math.min(TR_N, trFill + 1); trAge[trHead] = t; }
    for (let c = 0; c < TR_C; c++) {
      const mw = FING[1].fingers[c].matrixWorld, o = (c * TR_N + trHead) * 6;
      _trv.copy(TR_TIP[c]).applyMatrix4(mw).applyMatrix4(_rootInv);
      trHist[o] = _trv.x; trHist[o + 1] = _trv.y; trHist[o + 2] = _trv.z;
      _trv.copy(TR_BASE[c]).applyMatrix4(mw).applyMatrix4(_rootInv);
      trHist[o + 3] = _trv.x; trHist[o + 4] = _trv.y; trHist[o + 5] = _trv.z;
    }
  }
  if (trFill < 2) { trail.visible = false; return; }
  for (let c = 0; c < TR_C; c++) {
    for (let i = 0; i < TR_N; i++) {
      const live = i < trFill, j = (trHead - (live ? i : trFill - 1) + TR_N) % TR_N;
      const h = (c * TR_N + j) * 6, v = (c * TR_N + i) * 2;
      const a = live ? Math.max(0, 1 - (t - trAge[j]) / 0.22) * (1 - i / TR_N) : 0;
      trPos[v * 3] = trHist[h]; trPos[v * 3 + 1] = trHist[h + 1]; trPos[v * 3 + 2] = trHist[h + 2];
      trPos[v * 3 + 3] = trHist[h + 3]; trPos[v * 3 + 4] = trHist[h + 4]; trPos[v * 3 + 5] = trHist[h + 5];
      trA[v] = a; trA[v + 1] = a * 0.05; // tranchant lumineux à la pointe, fondu vers la base
    }
  }
  trGeo.attributes.position.needsUpdate = true; trGeo.attributes.aA.needsUpdate = true;
  trMat.uniforms.uColor.value.copy(TR_COL).lerp(blood, 0.08 + 0.8 * Hn).multiplyScalar(1.35);
  trail.visible = true;
}

function update(state) {
  const t = state.t || 0, dt = clamp(state.dt || 0, 0, 0.05);
  const Hn = clamp(state.hunt || 0, 0, 1), H = clamp(state.howl || 0, 0, 1), S = clamp(state.sniff || 0, 0, 1);
  const F = clamp(state.flex || 0, 0, 1), G = clamp(state.growl || 0, 0, 1);
  const au = state.audio || ZERO_AUDIO, ptr = state.pointer || ZERO_PTR;
  const ts = state.swipe != null && state.swipe >= 0 ? state.swipe : -1;
  const swA = ts < 0 ? 0 : env4(ts, 0, 0.25, 0.29, 0.44);
  const swS = ts < 0 ? 0 : env4(ts, 0.29, 0.44, 0.5, 0.64);
  const swF = ts < 0 ? 0 : env4(ts, 0.46, 0.62, 0.68, 0.995);
  const swAny = Math.max(swA, swS, swF);
  if (t < st.lastT - 0.5 || t > st.lastT + 10) resetTimers(t);
  st.lastT = t;

  // respiration (phase accumulée : pas de saut quand le rythme change)
  const rate = 0.22 + 0.2 * Hn + 0.1 * G + 0.1 * F - 0.08 * H;
  st.bp = (st.bp + dt * Math.PI * 2 * rate) % (Math.PI * 2);
  const br = Math.sin(st.bp + 0.35 * Math.sin(st.bp)), bA = 1 + 0.7 * Hn + 0.4 * F;

  // regard : cibles tenues quelques secondes, ressort amorti
  if (t > st.lookNext) {
    const r = arnd();
    if (r < 0.5) { st.ty = -0.5 + arnd() * 0.4; st.tx = -0.05 + arnd() * 0.15; st.tz = 0; }
    else if (r < 0.82) { st.ty = -0.12 + arnd() * 0.32; st.tx = -0.12 + arnd() * 0.18; st.tz = (arnd() - 0.5) * 0.25; }
    else { st.ty = 0.5 + arnd() * 0.12; st.tx = 0.02; st.tz = (arnd() - 0.5) * 0.15; } // il regarde l'écran
    st.lookNext = t + 2.2 + arnd() * 4.5;
  }
  // cible filtrée (accélération continue) puis ressort critique : tourne la tête sans à-coup
  const kf = 1 - Math.exp(-dt * (2.2 + 1.5 * Hn));
  st.fy += (st.ty + ptr.x * 0.22 - st.fy) * kf; st.fx += (st.tx + ptr.y * 0.1 - st.fx) * kf; st.fz += (st.tz - st.fz) * kf;
  const lw = 4.2 + 1.8 * Hn;
  st.vy += (lw * lw * (st.fy - st.ly) - 2 * lw * st.vy) * dt; st.ly += st.vy * dt;
  st.vx += (lw * lw * (st.fx - st.lx) - 2 * lw * st.vx) * dt; st.lx += st.vx * dt;
  st.vz += (lw * lw * (st.fz - st.lz) - 2 * lw * st.vz) * dt; st.lz += st.vz * dt;
  const lookW = (1 - H) * (1 - 0.7 * S) * (1 - 0.6 * swAny);

  // reniflements spontanés
  if (t > st.sniffNext) { st.sniffT0 = t; st.sniffNext = t + 9 + arnd() * 12; }
  const sn = t - st.sniffT0, sniffB = env4(sn, 0, 0.15, 0.9, 1.2) * Math.pow(Math.max(0, Math.sin(sn * Math.PI * 2 * 3.2)), 2);
  const sniffS = S * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 3.4)), 2);
  const sniff = sniffB * 0.6 + sniffS;

  // oreilles
  for (let e = 0; e < 2; e++) {
    const E = st.ear[e];
    if (t > E.next) { E.t0 = t; E.amp = 0.6 + arnd() * 0.6; E.next = t + (arnd() < 0.25 ? 0.5 : 3 + arnd() * 7); }
  }

  // clignement
  if (t > st.blinkNext) { st.blinkT0 = t; st.blinkNext = t + 3 + arnd() * 6; }
  const blink = 1 - env4(t - st.blinkT0, 0, 0.05, 0.1, 0.22) * 0.92;

  const ws = nz(t * 0.11, 1.3), yawN = nz(t * 0.07, 4.2);
  /* --- bassin et colonne ---
   * hurlement : il se dresse sur ses pattes, bascule le buste en arrière (poitrail en avant) et pivote vers
   * la gauche de l'écran pour présenter son profil, gueule au ciel, devant le puits de lumière.
   * griffe : armé (torsion à droite, léger recul) → frappe (torsion à gauche, plongée) → accompagnement. */
  const pel = B.pelvis;
  pel.position.set(
    P0.x + ws * 0.035 + swS * 0.04,
    P0.y + br * 0.007 * bA - Hn * 0.13 + H * 0.085 + S * 0.02 - swA * 0.04 - swS * 0.06 - swF * 0.03 - G * 0.03 - F * 0.02,
    P0.z - H * 0.05 + Hn * 0.03 - swA * 0.03 + swS * 0.07 + swF * 0.05);
  pel.rotation.set(Hn * 0.1 - H * 0.1 - S * 0.03 - swA * 0.03 + swS * 0.1 + swF * 0.06 + G * 0.04,
    yawN * 0.04 - H * 0.12 - swA * 0.06 + swS * 0.12 + swF * 0.1, -ws * 0.03 + swS * 0.03);
  B.spine1.rotation.set(Hn * 0.08 - H * 0.1 - S * 0.03 - swA * 0.04 + swS * 0.08 + swF * 0.04 + G * 0.04,
    -H * 0.15 - swA * 0.08 + swS * 0.17 + swF * 0.12, ws * 0.02);
  B.spine2.rotation.set(Hn * 0.08 - H * 0.15 - S * 0.05 - br * 0.014 * bA - F * 0.06 - swA * 0.06 + swS * 0.1 + swF * 0.04,
    st.ly * 0.12 * lookW - H * 0.15 - swA * 0.12 + swS * 0.24 + swF * 0.16, ws * 0.025 + swA * 0.06 - swS * 0.05);
  B.ribs.scale.set(1 + br * 0.016 * bA + H * 0.05, 1 + br * 0.008 * bA + H * 0.02, 1 + br * 0.024 * bA + H * 0.07);
  /* --- cou, tête, mâchoire --- */
  B.neck.rotation.set(Hn * 0.06 - H * 0.15 - S * 0.12 + G * 0.2 + st.lx * 0.4 * lookW + F * 0.08 + swA * 0.16 + swS * 0.08,
    st.ly * 0.38 * lookW - H * 0.1 + swA * 0.14 - swS * 0.04, -ws * 0.02);
  B.head.rotation.set(-Hn * 0.26 - H * 0.38 - S * 0.24 + G * 0.12 + st.lx * 0.6 * lookW - sniff * 0.035 + F * 0.12 + br * 0.008 - swA * 0.08 + swS * 0.06,
    st.ly * 0.5 * lookW - H * 0.1 + swA * 0.08 + swS * 0.05 + swF * 0.05,
    st.lz * lookW + nz(t * 0.13, 7) * 0.04 + G * 0.06 - ws * 0.02 + H * 0.06);
  // posture voûtée au repos (HUNCH au total sur le buste ; le hurlement le redresse) : tête basse projetée en avant
  const hb = 1 - 0.85 * H;
  pel.position.y -= 0.08 * hb; pel.position.z += 0.03 * hb; // genoux plus fléchis : accroupi, prêt à bondir
  pel.rotation.x += 0.1 * hb; B.spine1.rotation.x += 0.14 * hb; B.spine2.rotation.x += (HUNCH - 0.24) * hb;
  B.neck.rotation.x += 0.12 * hb; B.head.rotation.x -= (HUNCH + 0.06) * hb;
  const rumble = G * Math.sin(t * 61) * 0.012 + Hn * Math.sin(t * 47) * 0.004;
  B.jaw.rotation.x = 0.13 + br * 0.015 * (0.5 + Hn) + Hn * 0.1 + H * (0.8 + 0.03 * Math.sin(t * 8.3)) + G * 0.3 + swA * 0.1 + swS * 0.3 + swF * 0.12 + F * 0.08 + rumble - sniff * 0.02;
  for (let e = 0; e < 2; e++) {
    const s = SIDES[e], E = st.ear[e], tw = env4(t - E.t0, 0, 0.05, 0.1, 0.38) * E.amp;
    EARS[e].rotation.set(-0.12 * Hn - 0.55 * H - 0.55 * G + 0.18 * S - 0.45 * tw + nz(t * 0.21, 9 + e) * 0.05 - swS * 0.3 - swA * 0.2, 0, s * (0.18 * tw + 0.1 * Hn + 0.2 * G + 0.12 * H));
  }
  /* --- bras : hurlement = bras grands ouverts vers l'arrière, poignets cassés, griffes déployées --- */
  for (let i = 0; i < 2; i++) {
    const A = AR[i], s = A.s, sw = nz(t * 0.17, s * 3) * 0.03 + br * 0.012 * bA;
    const roll = F * Math.sin(t * 4.4 + s), roll2 = F * Math.cos(t * 4.4 + s);
    A.clav.rotation.set(-roll * 0.1 + H * 0.06, -s * roll2 * 0.08 + s * H * 0.22, s * (br * 0.03 * bA + H * 0.2 + F * 0.05 + Hn * 0.05 + roll2 * 0.05));
    // bras droit (côté caméra) ouvert vers l'avant-gauche de l'image, bras gauche rejeté en arrière : les deux restent lisibles
    A.arm.rotation.set(-Hn * 0.2 + H * (s > 0 ? 0.15 : -0.1) - F * 0.5 + sw, s * H * (s > 0 ? 0.42 : -0.05), s * (H * (s > 0 ? 0.78 : 0.95) + Hn * 0.06 + F * 0.12));
    A.fore.rotation.set(-Hn * 0.25 - H * 0.3 - F * 0.75 - br * 0.02 - 0.22 * hb, 0, 0);
    // repos : bras longs portés en avant et écartés (compense le tangage du buste)
    A.arm.rotation.x -= 0.5 * hb; A.arm.rotation.z += s * 0.1 * hb;
    A.hand.rotation.set(-Hn * 0.12 + H * 0.4 - F * 0.25, 0, s * H * 0.2);
  }
  { // coup de griffe : épaule droite qui recule puis jaillit, bras gauche en contrepoids
    const A = AR[1];
    A.clav.rotation.x += swA * 0.15 - swS * 0.2;
    A.clav.rotation.y += -swA * 0.15 + swS * 0.25 + swF * 0.1;
    A.clav.rotation.z += -swA * 0.3 + swS * 0.05;
    A.hand.rotation.x += swA * 0.55 - swS * 0.35 - swF * 0.15;
    AR[0].arm.rotation.x += swA * 0.2 + swS * 0.3; AR[0].arm.rotation.z += swA * 0.1 + swS * 0.2;
    AR[0].fore.rotation.x += -swA * 0.3 - swS * 0.2;
  }
  // bras droit : IK sur la trajectoire de frappe, mêlée à la pose d'attente
  if (ts >= 0) {
    const wIK = ss(0, 0.2, ts) * (1 - ss(0.66, 0.98, ts));
    if (wIK > 0.001) {
      const p = clamp((ts - 0.27) / (0.62 - 0.27), 0, 1);
      swPath((SWK.length - 1) * p * p * (3 - 2 * p), _swP, _swPole);
      // clés écrites pour un buste droit : on retire le tangage de repos
      _swP.sub(ARM_IK.S2).applyAxisAngle(_XAX, -HUNCH * hb).add(ARM_IK.S2); _swPole.applyAxisAngle(_XAX, -HUNCH * hb);
      const coil = env4(ts, 0.1, 0.25, 0.27, 0.33); // il ramène encore la patte juste avant de lâcher le coup
      _swP.x -= coil * 0.06; _swP.y += coil * 0.05; _swP.z -= coil * 0.12;
      solveArmIK(_swP, _swPole);
      AR[1].arm.quaternion.slerp(_qIKa, wIK);
      AR[1].fore.quaternion.slerp(_qIKf, wIK);
    }
  }
  /* --- doigts --- */
  for (let i = 0; i < 2; i++) {
    const Fh = FING[i];
    for (let f = 0; f < 4; f++) {
      let c = 0.12 + nz(t * 0.23, f * 1.7 + i * 5) * 0.07 + Hn * 0.18 - H * 0.5;
      c += F * (0.75 * (0.5 + 0.5 * Math.sin(t * 7.2 - f * 0.55 + i)) - 0.35);
      if (i === 1) c += swA * 0.3 - swS * 0.5 - swF * 0.15;
      Fh.fingers[f].quaternion.setFromAxisAngle(Fh.axis, c);
    }
    Fh.thumb.quaternion.setFromAxisAngle(Fh.taxis, 0.1 + F * 0.3 * Math.sin(t * 7.2 + i) + Hn * 0.1 - H * 0.2);
  }
  /* --- jambes (pieds plantés) --- */
  pel.updateMatrix();
  _qP.copy(pel.quaternion);
  const tilt = -H * 0.36 + Hn * 0.18 + swA * 0.04 + swS * 0.06;
  solveLeg(LEGS[0], tilt); solveLeg(LEGS[1], tilt);
  /* --- queue (onde qui se propage le long de la chaîne ; dressée pendant le hurlement) --- */
  st.tp = (st.tp + dt * (1.0 + Hn * 0.6 + H * 0.4)) % (Math.PI * 200);
  for (let i = 0; i < TAIL_N; i++) {
    const amp = (0.022 + i * 0.006) * (1 - Hn * 0.35) * (1 + swAny * 0.6);
    const lift = i === 0 ? H * 0.38 + Hn * 0.06 + G * 0.08 + swS * 0.08 : (H * 0.025 - Hn * 0.01 + G * 0.015);
    TAIL[i].rotation.set(lift + 0.016 * Math.sin(st.tp * 0.63 - i * 0.45), amp * Math.sin(st.tp - i * 0.55) + (i === 0 ? -ws * 0.12 - swS * 0.2 + swA * 0.1 : 0), 0);
  }
  /* --- chimie, yeux, fourrure --- */
  const pal = state.palette;
  _chem.copy(pal && pal.chem ? pal.chem : _tmpC.setRGB(0.49, 1, 0.31)).lerp(pal && pal.blood ? pal.blood : RIM, Hn * 0.3);
  const tankI = 1.9 + Math.sin(t * 1.9) * 0.12 + nz(t * 0.5, 2) * 0.1 + au.bass * 1.6 + au.beat * 0.5 + H * 0.8 + swS * 0.5;
  liqMat.uniforms.uColor.value.copy(_chem).multiplyScalar(tankI);
  liqMat.uniforms.uTime.value = t % TWRAP;
  U.uChem.value.copy(_chem).multiplyScalar(1.4 + au.bass * 0.8 + H * 0.4);
  U.uBounce.value.copy(_chem).multiplyScalar(0.45 * tankI);
  glassMat.emissive.copy(_chem).multiplyScalar(0.06 * tankI);
  bubMat.color.copy(_chem).lerp(_tmpC.setRGB(1, 1, 1), 0.55).multiplyScalar(1.3 + au.beat * 0.6);
  const blood = pal && pal.blood ? pal.blood : _tmpC.setRGB(1, 0.17, 0.17);
  // yeux : rouges même au plus fort (pas de blanc cramé), > 1 pour le bloom ; pulsation lente + battement
  const eyeP = 0.5 + 0.5 * Math.sin(t * 1.7 + Math.sin(t * 0.37) * 1.5);
  const eyeI = (1.7 + eyeP * 0.35 + Hn * 2.0 + H * 1.2 + G * 1.2 + swS * 1.2 + au.beat * 0.8) * blink;
  // yeux rouge sang ; plus saturés (et plus intenses, voir eyeI) en traque
  _eyeC.copy(blood).lerp(_tmpC2.copy(blood).multiply(blood), Hn * 0.7);
  U.uBlood.value.copy(_eyeC).multiplyScalar(eyeI * (0.75 + 0.25 * Hn));
  eyeMat.color.copy(_eyeC).multiplyScalar((0.85 + eyeP * 0.2 + Hn * 0.75 + H * 0.4 + G * 0.3 + au.beat * 0.3) * blink);
  const es = (1 + eyeP * 0.08 + Hn * 0.45 + H * 0.2 + G * 0.25 + au.beat * 0.12) * (0.25 + 0.75 * blink);
  eyeGlows[0].scale.set(0.3 * es, 0.15 * es * (0.35 + 0.65 * blink), 1); eyeGlows[1].scale.copy(eyeGlows[0].scale);
  U.uRim.value.copy(RIM).multiplyScalar(0.22).lerp(_tmpC2.copy(blood).multiplyScalar(0.3), Hn);
  U.uFill.value.copy(FILL).lerp(_tmpC2.copy(blood).multiplyScalar(0.16), Hn * 0.35).multiplyScalar(1 + au.bass * 0.15);
  U.uBristle.value = clamp(Hn * 0.55 + H * 0.7 + G * 0.8 + swS * 0.4, 0, 1);
  U.uRipple.value = 0.05 + Hn * 0.03;
  U.uTime.value = t % TWRAP;
  /* --- bave --- */
  if (DR.phase === 0 && t > DR.next) { DR.phase = 1; DR.t0 = t; }
  if (DR.phase === 1) { // la goutte grossit, accrochée à la lèvre
    const k = Math.min(1, (t - DR.t0) / 1.6);
    _bubP.copy(lipLocal); B.head.localToWorld(_bubP); root.worldToLocal(_bubP);
    drool.position.copy(_bubP); drool.position.y -= 0.02 * k * k;
    drool.scale.set(0.011 * k + 0.002, (0.014 + 0.022 * k * k) * k + 0.002, 0.011 * k + 0.002);
    drool.visible = true;
    if (k >= 1) { DR.phase = 2; DR.vy = 0; }
  } else if (DR.phase === 2) { // chute
    DR.vy -= 9.8 * dt; drool.position.y += DR.vy * dt;
    drool.scale.set(0.01, 0.014 + Math.min(0.05, -DR.vy * 0.006), 0.01);
    if (drool.position.y <= 0.01) { drool.position.y = 0.005; DR.phase = 3; DR.t0 = t; }
  } else if (DR.phase === 3) { // éclaboussure
    const k = Math.min(1, (t - DR.t0) / 0.4);
    drool.scale.set(0.02 + 0.06 * k, 0.003, 0.02 + 0.06 * k);
    if (k >= 1) { DR.phase = 0; drool.visible = false; DR.next = t + (6 + arnd() * 10) * (1 - Hn * 0.5); }
  }
  if (drool.visible) {
    const fade = DR.phase === 3 ? 1 - Math.min(1, (t - DR.t0) / 0.4) : 1;
    droolMat.color.copy(_chem).multiplyScalar(1.5 * fade);
  }
  /* --- bulles --- */
  const n = Math.max(6, Math.round(BUB_N * clamp((state.particles != null ? state.particles : 1) * 1.2, 0.25, 1)));
  if (n !== bubCount) { bubCount = n; bubbles.count = n; }
  const bsp = 1 + Hn * 0.8 + H * 0.6 + au.bass * 0.8;
  for (let i = 0; i < bubCount; i++) {
    const b = bub[i];
    b.off = (b.off + dt * b.sp * bsp / tankFill) % 1;
    const h = b.off, ang = b.a + h * 2.5 + Math.sin(t * 1.3 + b.wob) * 0.3;
    _bubP.copy(tankBase).addScaledVector(tankAxis, h * tankFill)
      .addScaledVector(tankPX, Math.cos(ang) * b.r).addScaledVector(tankPZ, Math.sin(ang) * b.r);
    _o3.position.copy(_bubP); _o3.scale.setScalar(b.sz * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, h * 1.3))));
    _o3.updateMatrix(); bubbles.setMatrixAt(i, _o3.matrix);
  }
  bubbles.instanceMatrix.needsUpdate = true;
  /* --- traînée des griffes --- */
  updateTrail(ts, t, Hn, blood);
}

const headLocal = v3(0, -0.04, 0.5);
const api = {
  root,
  update,
  getHeadWorldPosition(v) { return B.head.localToWorld(v.copy(headLocal)); },
  setQuality(q) { geo.setDrawRange(0, q && q.name === 'low' ? coreCount : totalCount); },
};
try { if (/[?&]dev\b/.test(location.search)) window.__wwWolf = api; } catch (e) { /* hors navigateur */ }
return api;
};
})();
