/* Warwick · la Furie déchaînée de Zaun — modèle, rig et animation (fan-art 100 % procédural). Contrat : CONTRACT.md
 *
 * Tout le corps est UN SkinnedMesh à UN matériau : couleur, rugosité, métal et émission (chimie, yeux) sont
 * portés par les sommets ; un petit shader injecté ajoute le hérissement de la crinière, le flux lumineux dans
 * les tuyaux, le reflet vert de la cuve sur la fourrure et un liseré de contre-jour.
 * À côté : liquide de la cuve (additif), verre, bulles (instanciées) et deux halos d'yeux → ~7 appels de dessin.
 * Repère : mètres, pieds à y = 0, face à +Z. Les os ont une rotation de repos nulle (pose de liaison = pose
 * d'attente), toutes les rotations animées sont donc des écarts autour des axes du modèle.
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
  bone('ear' + k, 'head', s * 0.12 * HS, 2.36 + 0.14 * HS, 0.56 - 0.03 * HS);
  bone('clav' + k, 'spine2', s * 0.20, 2.26, 0.02);
  bone('arm' + k, 'clav' + k, s * 0.70, 2.14, 0.10);
  bone('fore' + k, 'arm' + k, s * 0.88, 1.42, 0.24);
  bone('hand' + k, 'fore' + k, s * 0.88, 0.80, 0.40);
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
  bone('thigh' + k, 'pelvis', s * 0.30, 1.22, -0.18);
  bone('shin' + k, 'thigh' + k, s * 0.38, 0.78, 0.16);
  bone('meta' + k, 'shin' + k, s * 0.38, 0.42, -0.20);
  bone('foot' + k, 'meta' + k, s * 0.38, 0.075, 0.10);
}
const TAIL_N = 8, TAILP = [];
{
  const ang = [-0.55, -0.85, -1.0, -0.95, -0.72, -0.4, -0.08, 0.22];
  const yaw = [0.06, 0.14, 0.2, 0.26, 0.3, 0.34, 0.38, 0.42];
  const len = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13];
  const p = v3(0, 1.36, -0.52);
  let parent = 'pelvis';
  for (let i = 0; i < TAIL_N; i++) {
    bone('tail' + i, parent, p.x, p.y, p.z); TAILP.push(p.clone());
    p.add(v3(Math.sin(yaw[i]) * Math.cos(ang[i]), Math.sin(ang[i]), -Math.cos(yaw[i]) * Math.cos(ang[i])).multiplyScalar(len[i]));
    parent = 'tail' + i;
  }
  TAILP.push(p.clone());
}

// Cuve chimique : sur l'omoplate gauche (côté caméra), inclinée vers l'arrière et vers l'extérieur
const TC = v3(0.17, 2.68, -0.84), TAX = v3(0.2, 1, -0.3).normalize(), TR = 0.19, TH = 0.74;
const TPX = v3(1, 0, 0).addScaledVector(TAX, -TAX.x).normalize(), TPZ = new V3().crossVectors(TPX, TAX).normalize();
const tankAt = h => TC.clone().addScaledVector(TAX, h);
const tankDist = p => { const d = p.clone().sub(TC), h = clamp(d.dot(TAX), -TH / 2 - 0.1, TH / 2 + 0.1); return d.addScaledVector(TAX, -h).length(); };

/* =====================================================================================
 * Palette (hex sRGB → linéaire) et réglages de surface [rugosité, métal, émission chimie, émission yeux]
 * ===================================================================================== */
const C = {
  furD: col(0x151b25), furM: col(0x283242), furB: col(0x41526d), furV: col(0x312c42), furL: col(0x5f6b7b), furP: col(0x96a1ae),
  skin: col(0x141013), skinG: col(0x3a3036), gum: col(0x5a1420), tongue: col(0x7c2632), tooth: col(0xe4dcc6),
  clawB: col(0x2a2522), clawT: col(0xd9d1bc), iron: col(0x464c53), ironD: col(0x24282d), rust: col(0x5e3420), brass: col(0x9c7136),
  leather: col(0x33241b), rubber: col(0x121815), white: col(0xffffff), eye: col(0xffe0d0), liquid: col(0x335533),
};
const SF = {
  fur: [0.9, 0, 0, 0], skin: [0.5, 0, 0, 0], gum: [0.4, 0, 0, 0], tooth: [0.3, 0.05, 0, 0], claw: [0.3, 0.45, 0, 0],
  iron: [0.5, 0.6, 0, 0], brass: [0.35, 0.85, 0, 0], leather: [0.66, 0, 0, 0], rubber: [0.4, 0.05, 0.035, 0],
  glow: [0.3, 0, 1, 0], eye: [0.3, 0, 0, 1],
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
const TINTS = [col(0x2b3d5e), col(0x3a3352), col(0x243f45), col(0x45464f)];

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

/* ---------- Mèches de fourrure : losange effilé en 2 tronçons, dégradé racine → pointe, hérissable ---------- */
const RB = [new V3(), new V3(), new V3(), new V3()], RM = [new V3(), new V3(), new V3(), new V3()];
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
  RB[0].copy(_b0).addScaledVector(_sd, wid); RB[1].copy(_b0).addScaledVector(_up, th);
  RB[2].copy(_b0).addScaledVector(_sd, -wid); RB[3].copy(_b0).addScaledVector(_up, -th * 0.6);
  _m.copy(_b0).addScaledVector(dir, len * 0.5).addScaledVector(_up, arch);
  RM[0].copy(_m).addScaledVector(_sd, wid * 0.62); RM[1].copy(_m).addScaledVector(_up, th * 0.75);
  RM[2].copy(_m).addScaledVector(_sd, -wid * 0.62); RM[3].copy(_m).addScaledVector(_up, -th * 0.45);
  _tip.copy(_b0).addScaledVector(dir, len).addScaledVector(_up, arch * 0.5 + curl);
  // hérissement : la mèche se redresse vers la normale
  const raise = o.raise != null ? o.raise : 1;
  _dr.copy(dir).addScaledVector(n, 1.4).normalize();
  _q1.copy(_b0).addScaledVector(_dr, len * 1.05).sub(_tip).multiplyScalar(raise);
  _q2.copy(_b0).addScaledVector(_dr, len * 0.52).sub(_m).multiplyScalar(raise);
  FXT[0] = _q1.x; FXT[1] = _q1.y; FXT[2] = _q1.z; FXT[3] = 0;
  FXM[0] = _q2.x; FXM[1] = _q2.y; FXM[2] = _q2.z; FXM[3] = 0;
  _cMid.copy(cR).lerp(cT, 0.55);
  setW(o, p);
  const s = o.surf || SF.fur;
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) & 3;
    _ref.copy(_b0).add(_m).multiplyScalar(0.5);
    triO(bld, RB[k], RB[k1], RM[k1], cR, cR, _cMid, FX0, FX0, FXM, _ref, s);
    triO(bld, RB[k], RM[k1], RM[k], cR, _cMid, _cMid, FX0, FXM, FXM, _ref, s);
    _ref.copy(_m).add(_tip).multiplyScalar(0.5);
    triO(bld, RM[k], RM[k1], _tip, _cMid, _cMid, cT, FXM, FXM, FXT, _ref, s);
  }
}
// Peigne de mèches sur une zone d'un volume (par touffes de 1 à 3 mèches)
const _u = new V3(), _p = new V3(), _nn = new V3(), _d = new V3(), _pc = new V3(), _dc = new V3(), _tg = new V3();
const FD = 1.4; // densité de la couche principale
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
    _d.addScaledVector(_nn, -_d.dot(_nn));
    if (_d.lengthSq() < 1e-6) _d.copy(_nn); else _d.normalize();
    const lf = o.lift != null ? o.lift : 0.3;
    const len0 = rr(o.len[0], o.len[1]) * (o.lenFn ? o.lenFn(_p, _nn) : 1);
    const wid0 = rr(o.wid[0], o.wid[1]) * (o.lenFn ? Math.sqrt(o.lenFn(_p, _nn)) : 1);
    o.cR(_p, _nn, _cR); o.cT(_p, _nn, _cT);
    const j = 1 + (rnd() - 0.5) * 0.3; _cR.multiplyScalar(j); _cT.multiplyScalar(j * (1 + (rnd() - 0.5) * 0.25));
    if (rnd() < 0.35) _cT.lerp(TINTS[(rnd() * 4) | 0], 0.3);
    _tg.crossVectors(_nn, _d).normalize();
    const nc = 1 + ((rnd() * clump) | 0);
    for (let c = 0; c < nc; c++) {
      const off = c === 0 ? 0 : (rnd() - 0.5) * wid0 * 3.2;
      _pc.copy(_p).addScaledVector(_tg, off).addScaledVector(_d, -Math.abs(off) * 0.4);
      _dc.copy(_d).addScaledVector(_tg, off * 1.6 + (rnd() - 0.5) * 0.12).addScaledVector(_nn, lf + rr(-0.08, 0.12)).normalize();
      const k = c === 0 ? 1 : rr(0.65, 0.9);
      lock(bld, _pc, _nn, _dc, len0 * k, wid0 * (c === 0 ? 1 : 0.8), _cR, _cT, { w: o.w || v.w, raise: o.raise, arch: o.arch, curl: o.curl, thick: o.thick });
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
function rustCol(base, amt) {
  return (c, n, out) => {
    out.copy(base);
    const r = hash3(c.x * 3.7, c.y * 3.7, c.z * 3.7);
    if (r > 1 - amt) out.lerp(C.rust, 0.35 + (r - 1 + amt) / amt * 0.5);
    if (n.y < -0.3) out.multiplyScalar(0.7);
  };
}
const IRON = { color: rustCol(C.iron, 0.3), surf: SF.iron, jitter: 0.1, tint: false };
const IROND = { color: rustCol(C.ironD, 0.25), surf: SF.iron, jitter: 0.08, tint: false };
const BRASS = { color: C.brass, surf: SF.brass, jitter: 0.07, tint: false };
const LEATHER = { color: C.leather, surf: SF.leather, jitter: 0.12, tint: false };
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
function rivet(bld, p, r, o) { ellip(bld, p, v3(r, r, r), null, Object.assign({ detail: 0, bump: 0, vol: false }, o || BRASS)); }
function hose(bld, pts, r, o) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const L = curve.getLength(), segs = Math.max(8, Math.round(L * 30));
  const g = new THREE.TubeGeometry(curve, segs, r, 6, false);
  const ng = g.toNonIndexed(); g.dispose();
  const uv = ng.attributes.uv.array, wFn = o.w;
  emitTris(bld, ng.attributes.position.array, Object.assign({}, o, {
    surf: SF.rubber, color: (cc, n, out) => out.copy(C.rubber), jitter: 0.1, tint: false, w: wFn,
    vfx: (p, fx, vi) => { fx[3] = 0.001 + uv[vi * 2] * L; },
  }));
  ng.dispose();
  // bagues de laiton aux extrémités
  for (const u of [0.02, 0.98]) {
    const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    cylAB(bld, p.clone().addScaledVector(tg, -0.03), p.clone().addScaledVector(tg, 0.03), r * 1.45, r * 1.45, 7, Object.assign({}, BRASS, { w: wFn }));
  }
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
const torsoCol = shadeN(v3(0, -0.4, 1), 0.35, 0.95, C.furM, C.furL);
const backCol = shadeN(v3(0, -0.3, 1), 0.0, 0.9, C.furD, C.furM);
const TORSO = [];
const pelV = ellip(core, v3(0, 1.33, -0.25), v3(0.35, 0.28, 0.31), qE(0.15, 0, 0), { w: wTorso, color: backCol });
TORSO.push(pelV);
const GLUTE = {};
for (const s of SIDES) TORSO.push(GLUTE[s] = ellip(core, v3(s * 0.18, 1.28, -0.38), v3(0.2, 0.23, 0.18), qE(0.2, 0, 0), { w: wTorso, color: backCol }));
const absV = ellip(core, v3(0, 1.57, -0.06), v3(0.3, 0.31, 0.29), qE(0.3, 0, 0), { w: wTorso, color: torsoCol });
TORSO.push(absV);
const ribV = ellip(core, v3(0, 1.98, 0.06), v3(0.47, 0.43, 0.43), qE(0.35, 0, 0), { w: 'ribs', color: torsoCol, detail: 2, bump: 0.1 });
TORSO.push(ribV);
const PEC = {};
for (const s of SIDES) {
  TORSO.push(PEC[s] = ellip(core, v3(s * 0.21, 2.07, 0.35), v3(0.26, 0.19, 0.16), qE(0.55, s * 0.32, -s * 0.22), { w: 'ribs', color: shadeN(v3(0, -0.3, 1), 0.3, 0.95, C.furM, C.furL), bump: 0.1 }));
  ellip(core, v3(s * 0.36, 1.86, 0.2), v3(0.1, 0.2, 0.09), qE(0.3, 0, s * 0.5), { w: 'ribs', color: C.furM, detail: 1, bump: 0.12 }); // dentelé
  for (let k = 0; k < 3; k++) // abdominaux sculptés
    TORSO.push(ellip(core, v3(s * 0.085, 1.80 - k * 0.12, 0.33 - k * 0.045), v3(0.085, 0.06, 0.05), qE(0.3, 0, 0), { w: k === 0 ? 'ribs' : wTorso, color: C.furL, detail: 1, bump: 0.15 }));
}
const humpV = ellip(core, v3(0, 2.29, -0.12), v3(0.52, 0.34, 0.46), qE(-0.25, 0, 0), { w: 'spine2', color: backCol, detail: 3 });
TORSO.push(humpV);
const LAT_V = {}, TRAP = {};
for (const s of SIDES) {
  TORSO.push(LAT_V[s] = ellip(core, v3(s * 0.36, 1.87, -0.17), v3(0.25, 0.43, 0.29), qE(0, 0, s * 0.22), { w: 'spine2', color: backCol }));
  TORSO.push(TRAP[s] = ellip(core, v3(s * 0.33, 2.33, 0.03), v3(0.33, 0.18, 0.26), qE(0, 0, -s * 0.42), { w: wLerp('spine2', 'clav' + SK(s), p => ss(0.3, 0.55, Math.abs(p.x))), color: backCol }));
}
const neckV = ellip(core, v3(0, 2.33, 0.38), v3(0.22, 0.23, 0.28), qE(-0.18, 0, 0), { w: wNeck, color: backCol });
const throatV = ellip(core, v3(0, 2.2, 0.45), v3(0.17, 0.14, 0.2), qE(0.1, 0, 0), { w: wNeck, color: C.furL });
TORSO.push(neckV, throatV);

/* ---------- Bras ---------- */
const ARMV = {};
for (const s of SIDES) {
  const k = SK(s), SL = J('arm' + k), EL = J('fore' + k), WL = J('hand' + k), h = HAND[k];
  const ua = EL.clone().sub(SL), la = WL.clone().sub(EL), uaL = ua.length(), laL = la.length();
  const out = v3(s, 0, 0);
  const qa = quatAlong(ua, FWD), ql = quatAlong(la, FWD);
  const deltCol = shadeN(v3(s * 0.3, 1, 0.3), 0.2, 1, C.furM, C.furD);
  const delt = ellip(core, SL.clone().add(v3(s * 0.05, 0.04, 0.0)), v3(0.28, 0.28, 0.28), qa, { w: 'arm' + k, color: deltCol, detail: 3 });
  const upper = ellip(core, SL.clone().addScaledVector(ua, 0.5), v3(0.18, uaL * 0.55, 0.19), qa, { w: 'arm' + k, color: C.furM });
  const bic = ellip(core, SL.clone().addScaledVector(ua, 0.5).addScaledVector(FWD, 0.09), v3(0.13, uaL * 0.3, 0.12), qa, { w: 'arm' + k, color: C.furL });
  const tri = ellip(core, SL.clone().addScaledVector(ua, 0.42).addScaledVector(FWD, -0.1).addScaledVector(out, 0.03), v3(0.145, uaL * 0.37, 0.14), qa, { w: 'arm' + k, color: C.furM });
  ellip(core, EL.clone().addScaledVector(FWD, -0.04), v3(0.13, 0.13, 0.13), ql, { w: 'fore' + k, color: C.furM, detail: 1 });
  const foreU = ellip(core, EL.clone().addScaledVector(la, 0.3), v3(0.175, laL * 0.38, 0.165), ql, { w: 'fore' + k, color: C.furM });
  const foreL = ellip(core, EL.clone().addScaledVector(la, 0.72), v3(0.12, laL * 0.33, 0.115), ql, { w: 'fore' + k, color: C.furD });
  // main : paume, jointures, pouce, doigts griffus
  const qh = quatAlong(h.hd, h.spread);
  ellip(core, WL.clone().addScaledVector(h.hd, 0.08), v3(0.095, 0.12, 0.13), qh, { w: 'hand' + k, color: C.furD, detail: 1 });
  ellip(core, WL.clone().addScaledVector(h.hd, 0.17), v3(0.075, 0.06, 0.14), qh, { w: 'hand' + k, color: C.skinG, detail: 1, vol: false });
  for (let f = 0; f < 4; f++) {
    const kn = J('f' + k + f), fd = h.hd.clone().addScaledVector(h.palm, 0.15).normalize();
    ellip(core, kn.clone().addScaledVector(fd, 0.05), v3(0.036, 0.068, 0.036), quatAlong(fd, h.spread), { w: 'f' + k + f, color: C.skinG, detail: 1, vol: false });
    const cl = [0.3, 0.34, 0.31, 0.25][f];
    blade(core, kn.clone().addScaledVector(fd, 0.09), fd, h.palm.clone().multiplyScalar(0.75).add(v3(0, 0, 0.5)), cl, 0.032, { w: 'f' + k + f, bend: 0.36, segs: 5 });
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
  const thigh = ellip(core, HP.clone().addScaledVector(th, 0.45).addScaledVector(out, 0.04), v3(0.25, th.length() * 0.64, 0.27), qt, { w: 'thigh' + k, color: thighCol, detail: 3 });
  ellip(core, HP.clone().addScaledVector(th, 0.6).addScaledVector(FWD, 0.08), v3(0.17, th.length() * 0.44, 0.15), qt, { w: 'thigh' + k, color: C.furM });
  ellip(core, HP.clone().addScaledVector(th, 0.3).addScaledVector(FWD, -0.13), v3(0.19, th.length() * 0.44, 0.17), qt, { w: 'thigh' + k, color: C.furD });
  ellip(core, K.clone(), v3(0.13, 0.13, 0.14), qs, { w: 'shin' + k, color: C.furM, detail: 1 });
  const shin = ellip(core, K.clone().addScaledVector(sh, 0.5), v3(0.115, sh.length() * 0.56, 0.12), qs, { w: 'shin' + k, color: C.furD });
  const back = new V3().crossVectors(v3(1, 0, 0), sh).normalize(); // vers l'arrière-haut du tibia
  const calf = ellip(core, K.clone().addScaledVector(sh, 0.32).addScaledVector(back, -0.07), v3(0.13, sh.length() * 0.38, 0.15), qs, { w: 'shin' + k, color: C.furM });
  ellip(core, A.clone(), v3(0.09, 0.095, 0.095), qm, { w: 'meta' + k, color: C.furD, detail: 1 });
  const meta = ellip(core, A.clone().addScaledVector(mt, 0.5), v3(0.078, mt.length() * 0.56, 0.088), qm, { w: 'meta' + k, color: C.furD });
  // patte : coussinet, orteils, griffes
  ellip(core, BL.clone().add(v3(0, -0.0, 0.07)), v3(0.14, 0.075, 0.17), null, { w: 'foot' + k, color: C.furD, detail: 2 });
  for (let t = 0; t < 4; t++) {
    const ox = (t - 1.5) * 0.06, tp = BL.clone().add(v3(ox + s * 0.01, -0.025, 0.23 - Math.abs(t - 1.5) * 0.035));
    ellip(core, tp, v3(0.045, 0.045, 0.075), qE(0.2, ox * 1.5, 0), { w: 'foot' + k, color: C.skinG, detail: 1, vol: false });
    blade(core, tp.clone().add(v3(0, 0.005, 0.06)), v3(ox * 0.8, -0.25, 1), v3(0, -1, 0), 0.11, 0.024, { w: 'foot' + k, bend: 0.4 });
  }
  blade(core, A.clone().add(v3(0, -0.02, 0.05)), v3(s * 0.2, -1, 0.5), v3(0, 0, 1), 0.08, 0.02, { w: 'meta' + k }); // ergot
  LEGV[k] = { thigh, shin, calf, meta, back };
}

/* ---------- Queue ---------- */
const TAILV = [];
for (let i = 0; i < TAIL_N; i++) {
  const a = TAILP[i], b = TAILP[i + 1], d = b.clone().sub(a), r = 0.11 - i * 0.008;
  const w = i < TAIL_N - 1 ? wLerp('tail' + i, 'tail' + (i + 1), p => ss(0.6, 1.0, p.clone().sub(a).dot(d) / d.lengthSq())) : 'tail' + i;
  TAILV.push(ellip(core, a.clone().addScaledVector(d, 0.5), v3(r, d.length() * 0.7, r), quatAlong(d), { w, color: i % 3 === 1 ? C.furM : C.furD, detail: 1 }));
}

/* ---------- Tête (construite à l'échelle HS autour de l'articulation) ---------- */
const HJ = J('head'), JJ = J('jaw');
const hp = (x, y, z) => v3(HJ.x + x * HS, HJ.y + y * HS, HJ.z + z * HS);
const jp = (x, y, z) => v3(JJ.x + x * HS, JJ.y + y * HS, JJ.z + z * HS);
const hr = (x, y, z) => v3(x * HS, y * HS, z * HS);
const headCol = shadeN(v3(0, -1, 0.3), 0.1, 0.8, C.furM, C.furL);
const tooth = { surf: SF.tooth, c0: C.tooth, c1: C.tooth, cap: false };
const cran = ellip(core, hp(0, 0.05, 0.0), hr(0.18, 0.165, 0.21), null, { w: 'head', color: shadeN(v3(0, 1, -0.3), 0, 1, C.furM, C.furD), detail: 2 });
ellip(core, hp(0, 0.04, -0.13), hr(0.15, 0.14, 0.11), null, { w: 'head', color: C.furD, detail: 1 });
ellip(core, hp(0, 0.11, 0.17), hr(0.17, 0.06, 0.085), qE(0.3, 0, 0), { w: 'head', color: C.furD, detail: 1 }); // arcade
const cheek = {};
for (const s of SIDES) {
  ellip(core, hp(s * 0.085, 0.112, 0.205), hr(0.075, 0.04, 0.07), qE(0.2, s * 0.3, s * 0.35), { w: 'head', color: C.furD, detail: 1 }); // sourcils froncés
  cheek[s] = ellip(core, hp(s * 0.12, -0.02, 0.13), hr(0.108, 0.1, 0.13), qE(0, s * 0.3, 0), { w: 'head', color: headCol, detail: 1 });
}
const toHead = p => _t2.copy(p).sub(HJ).divideScalar(HS);
const muzCol = (c, n, out) => {
  const l = toHead(c);
  if (n.y > 0.55) out.copy(C.furD).lerp(C.furB, 0.25);
  else if (l.y < -0.07 && n.y < 0.2) out.copy(C.skinG);
  else if (n.y < -0.5) out.copy(C.skin);
  else out.copy(C.furM).lerp(C.furL, ss(0.0, -0.06, l.y) * 0.6);
};
loftZ(core, [[0.12, -0.125, 0.105, 0.125, 0.14, 0.08], [0.27, -0.118, 0.083, 0.108, 0.118, 0.068], [0.42, -0.106, 0.062, 0.09, 0.096, 0.056],
  [0.55, -0.096, 0.047, 0.074, 0.077, 0.046], [0.625, -0.086, 0.036, 0.057, 0.058, 0.036]], [0, -0.035, 0.665], hp, { w: 'head', color: muzCol, jitter: 0.06 });
const muzzle = vol(hp(0, -0.01, 0.38), hr(0.11, 0.09, 0.26), null, 'head');
for (let k = 0; k < 3; k++) ellip(core, hp(0, 0.083 - k * 0.006, 0.27 + k * 0.055), hr(0.062 - k * 0.006, 0.012, 0.014), qE(0.15, 0, 0), { w: 'head', color: C.skin, surf: SF.skin, detail: 1, vol: false }); // rides du rictus
ellip(core, hp(0, 0.02, 0.632), hr(0.058, 0.04, 0.045), qE(0.25, 0, 0), { w: 'head', color: C.skin, surf: SF.skin, detail: 1, jitter: 0.15, vol: false }); // truffe
for (const s of SIDES) {
  ellip(core, hp(s * 0.026, 0.008, 0.668), hr(0.016, 0.012, 0.012), null, { w: 'head', color: col(0x050405), surf: SF.skin, detail: 0, vol: false, jitter: 0 }); // narines
  ellip(core, hp(s * 0.098, 0.062, 0.24), hr(0.054, 0.03, 0.032), qE(0, s * 0.45, -s * 0.3), { w: 'head', color: C.skin, surf: SF.skin, detail: 1, vol: false }); // orbite
  ellip(core, hp(s * 0.101, 0.064, 0.255), hr(0.04, 0.019, 0.022), qE(0, s * 0.45, -s * 0.3), { w: 'head', color: C.eye, surf: SF.eye, detail: 1, jitter: 0, vol: false }); // œil
  // crocs supérieurs, prémolaires
  blade(core, hp(s * 0.06, -0.08, 0.565), v3(0, -1, 0.06), v3(0, 0, -1), 0.11 * HS, 0.021 * HS, Object.assign({ w: 'head', bend: 0.12, segs: 3 }, tooth));
  for (let t = 0; t < 4; t++) blade(core, hp(s * (0.073 - t * 0.003), -0.09, 0.49 - t * 0.065), v3(0, -1, 0), v3(0, 0, 1), 0.045 * HS, 0.015 * HS, Object.assign({ w: 'head', bend: 0.1, segs: 2 }, tooth));
}
for (let t = 0; t < 4; t++) blade(core, hp((t - 1.5) * 0.022, -0.08, 0.625), v3(0, -1, 0.1), v3(0, 0, -1), 0.035 * HS, 0.009 * HS, Object.assign({ w: 'head', segs: 2 }, tooth));
ellip(core, hp(0, -0.075, 0.40), hr(0.07, 0.02, 0.22), null, { w: 'head', color: C.gum, surf: SF.gum, detail: 1, vol: false, jitter: 0.1 }); // palais
// mâchoire
const toJaw = p => _t2.copy(p).sub(JJ).divideScalar(HS);
loftZ(core, [[0.0, -0.08, 0.0, 0.088, 0.098, 0.088], [0.18, -0.075, -0.004, 0.082, 0.088, 0.078], [0.36, -0.064, -0.008, 0.068, 0.072, 0.062],
  [0.49, -0.052, -0.012, 0.052, 0.054, 0.047]], [0, -0.03, 0.535], jp, {
  w: 'jaw', jitter: 0.06, color: (c, n, out) => { if (n.y > 0.6) out.copy(C.gum).multiplyScalar(0.55); else if (n.y > 0.1) out.copy(C.skinG); else out.copy(C.furM).lerp(C.furL, ss(0.2, -0.7, n.y)); },
});
const jawV = vol(jp(0, -0.04, 0.26), hr(0.085, 0.045, 0.27), null, 'jaw');
ellip(core, jp(0, -0.005, 0.27), hr(0.064, 0.02, 0.22), null, { w: 'jaw', color: C.gum, surf: SF.gum, detail: 1, vol: false });
ellip(core, jp(0, 0.004, 0.24), hr(0.046, 0.013, 0.18), null, { w: 'jaw', color: C.tongue, surf: SF.gum, detail: 1, vol: false });
for (const s of SIDES) {
  blade(core, jp(s * 0.05, -0.01, 0.43), v3(0, 1, 0.08), v3(0, 0, -1), 0.08 * HS, 0.018 * HS, Object.assign({ w: 'jaw', bend: 0.1, segs: 3 }, tooth));
  for (let t = 0; t < 3; t++) blade(core, jp(s * 0.06, -0.005, 0.36 - t * 0.07), v3(0, 1, 0), v3(0, 0, 1), 0.037 * HS, 0.013 * HS, Object.assign({ w: 'jaw', segs: 2 }, tooth));
}
// oreilles : pyramide aplatie, intérieur de peau, touffe
for (const s of SIDES) {
  const k = SK(s), eb = J('ear' + k), tipP = eb.clone().add(hr(s * 0.12, 0.27, -0.19));
  const f0 = eb.clone().add(hr(-s * 0.07, -0.01, 0.06)), f1 = eb.clone().add(hr(s * 0.095, -0.03, 0.04)), bk = eb.clone().add(hr(0, 0.0, -0.09));
  const fm = f0.clone().add(f1).multiplyScalar(0.5).addScaledVector(tipP.clone().sub(eb), 0.35).add(hr(0, 0, -0.04));
  const ref = eb.clone().add(hr(0, 0.08, -0.04)), refI = eb.clone().add(hr(0, 0.1, -0.12));
  setW({ w: 'ear' + k }, eb);
  const cO = C.furD, cI = C.skinG;
  triO(core, f0, fm, tipP, cI, cI, cI, null, null, null, refI, SF.skin);
  triO(core, fm, f1, tipP, cI, cI, cI, null, null, null, refI, SF.skin);
  triO(core, f0, bk, tipP, cO, cO, C.furB, null, null, null, ref, SF.fur);
  triO(core, f1, bk, tipP, cO, cO, C.furB, null, null, null, ref, SF.fur);
  for (let t = 0; t < 4; t++) { // touffe claire à l'intérieur de l'oreille
    const bp = f0.clone().lerp(f1, 0.25 + t * 0.17).addScaledVector(tipP.clone().sub(eb), 0.08).add(hr(0, 0, -0.01));
    lock(core, bp, v3(0, 0, 1), tipP.clone().sub(bp).normalize().add(v3(0, 0, 0.25)).normalize(), 0.13 * HS, 0.022 * HS, C.furL, C.furP, { w: 'ear' + k, raise: 0 });
  }
}
// fourrure de la tête (même échelle)
const sideOf = p => (p.x >= 0 ? 1 : -1);
const maneR = cmix(C.furD, C.furV, 0.2), maneT = (p, n, out) => out.copy(C.furB).lerp(C.furP, rnd() < 0.2 ? 0.5 : 0.08);
const lightR = cst(C.furL), lightT = cst(C.furP);
const darkR = cst(C.furD), midT = cmix(C.furM, C.furB, 0.6);
fur(core, cran, 40, {
  filter: (p, n) => n.y > -0.1 && p.z < HJ.z + 0.07, flow: (p, n, d) => d.set(p.x * 1.2, 0.2, -1),
  len: [0.16, 0.28], wid: [0.045, 0.07], lift: 0.4, cR: maneR, cT: maneT, raise: 0.8,
});
for (const s of SIDES) {
  fur(core, cheek[s], 26, { // collerette des joues
    filter: (p, n) => n.x * s > 0.2 && n.z < 0.7, flow: (p, n, d) => d.set(s * 0.9, -0.3, -0.8),
    len: [0.18, 0.3], wid: [0.045, 0.07], lift: 0.25, cR: cmix(C.furM, C.furL, 0.6), cT: lightT, raise: 0.6, clump: 3,
  });
}
fur(core, jawV, 12, {
  filter: (p, n) => n.y < -0.4 && p.z < JJ.z + 0.3, flow: (p, n, d) => d.set(0, -1, -0.4),
  len: [0.09, 0.15], wid: [0.03, 0.045], lift: 0.25, cR: lightR, cT: lightT, raise: 0.3,
});

/* =====================================================================================
 * Fourrure du corps
 * ===================================================================================== */
// crinière : bosse, cou, épaules
fur(core, humpV, 170, {
  filter: (p, n) => n.y > -0.3 && p.z < 0.3 && tankDist(p) > 0.3, flow: (p, n, d) => d.set(p.x * 1.4, -0.3, -1),
  len: [0.26, 0.42], wid: [0.06, 0.1], lift: 0.32, cR: maneR, cT: maneT, raise: 1, clump: 3,
  lenFn: p => 0.75 + 0.45 * ss(1.95, 2.55, p.y),
});
fur(core, neckV, 90, {
  filter: (p, n) => n.y > -0.45, flow: (p, n, d) => d.set(p.x * 1.6, 0.05, -1),
  len: [0.28, 0.46], wid: [0.06, 0.095], lift: 0.38, cR: maneR, cT: maneT, raise: 1, clump: 3,
});
for (const s of SIDES) {
  const k = SK(s);
  fur(core, TRAP[s], 50, {
    filter: (p, n) => n.y > -0.15, flow: (p, n, d) => d.set(s * 0.9, -0.45, -0.55),
    len: [0.22, 0.36], wid: [0.055, 0.09], lift: 0.32, cR: maneR, cT: maneT, raise: 1, clump: 3,
  });
  const a = ARMV[k];
  fur(core, a.delt, s > 0 ? 18 : 40, { // l'épaulière couvre l'épaule gauche
    filter: (p, n) => (s > 0 ? n.x * s > 0.4 && n.y < 0.3 && n.z < 0.3 : n.y > -0.3), flow: (p, n, d) => d.set(s * 0.45, -1, -0.15),
    len: [0.15, 0.24], wid: [0.05, 0.08], lift: 0.2, cR: darkR, cT: midT, raise: 0.6,
  });
  fur(core, a.foreU, 30, { // avant-bras : mèches vers le coude, côté extérieur/arrière
    filter: (p, n) => n.dot(v3(s * 0.7, 0.1, -0.7)) > 0.05, flow: (p, n, d) => d.copy(a.la).multiplyScalar(-0.8).add(v3(s * 0.2, 0, -0.5)),
    len: [0.15, 0.26], wid: [0.045, 0.075], lift: 0.35, cR: darkR, cT: midT, raise: 0.6, lenFn: p => 0.65 + 0.55 * ss(J('hand' + k).y + 0.2, J('fore' + k).y, p.y),
  });
  fur(core, a.tri, 16, {
    filter: (p, n) => n.z < 0.1, flow: (p, n, d) => d.set(s * 0.3, -1, -0.4),
    len: [0.12, 0.18], wid: [0.045, 0.07], lift: 0.2, cR: darkR, cT: midT, raise: 0.4,
  });
  fur(core, a.upper, 14, {
    filter: (p, n) => n.x * s > 0.3, flow: (p, n, d) => d.set(s * 0.2, -1, -0.2),
    len: [0.12, 0.18], wid: [0.045, 0.07], lift: 0.15, cR: darkR, cT: midT, raise: 0.3,
  });
  const lg = LEGV[k];
  fur(core, lg.thigh, 44, {
    filter: (p, n) => n.x * s > -0.2 && n.z < 0.7, flow: (p, n, d) => d.set(s * 0.25, -1, -0.35),
    len: [0.14, 0.22], wid: [0.05, 0.085], lift: 0.18, cR: darkR, cT: midT, raise: 0.4,
  });
  fur(core, GLUTE[s], 26, {
    filter: (p, n) => n.y < 0.6, flow: (p, n, d) => d.set(s * 0.3, -1, -0.3),
    len: [0.14, 0.22], wid: [0.05, 0.08], lift: 0.18, cR: darkR, cT: midT, raise: 0.4,
  });
  fur(core, lg.calf, 22, {
    filter: (p, n) => n.dot(lg.back) < 0.3, flow: (p, n, d) => d.set(s * 0.1, -0.5, -1),
    len: [0.16, 0.26], wid: [0.045, 0.07], lift: 0.35, cR: darkR, cT: midT, raise: 0.5,
  });
  fur(core, lg.meta, 8, {
    filter: (p, n) => n.z < -0.2 && p.y > 0.25, flow: (p, n, d) => d.set(0, -0.4, -1),
    len: [0.1, 0.16], wid: [0.035, 0.05], lift: 0.4, cR: darkR, cT: midT, raise: 0.3,
  });
  fur(core, LAT_V[s], 34, { // dorsaux et flancs
    filter: (p, n) => n.z < 0.3, flow: (p, n, d) => d.set(s * 0.35, -0.8, -0.6),
    len: [0.15, 0.25], wid: [0.055, 0.085], lift: 0.22, cR: darkR, cT: midT, raise: 0.7,
  });
}
// gorge, plastron (clairs)
fur(core, throatV, 34, {
  filter: (p, n) => n.y < 0.35, flow: (p, n, d) => d.set(0, -1, -0.1),
  len: [0.18, 0.3], wid: [0.045, 0.07], lift: 0.22, cR: lightR, cT: lightT, raise: 0.5, clump: 3,
});
fur(core, ribV, 40, {
  filter: (p, n) => n.z > 0.55 && p.y > 1.95 && Math.abs(p.x) < 0.22, flow: (p, n, d) => d.set(0, -1, 0.1),
  len: [0.16, 0.26], wid: [0.05, 0.075], lift: 0.18, cR: lightR, cT: lightT, raise: 0.4, occLim: 0.98,
});
for (const s of SIDES) fur(core, PEC[s], 20, {
  filter: (p, n) => n.z > 0.2 && n.y > -0.3, flow: (p, n, d) => d.set(-s * 0.15, -1, 0.15),
  len: [0.1, 0.16], wid: [0.045, 0.065], lift: 0.12, cR: lightR, cT: lightT, raise: 0.3,
});
// queue touffue
for (let i = 0; i < TAIL_N; i++) {
  const a = TAILP[i], b = TAILP[i + 1], d = b.clone().sub(a).normalize();
  const n = 16 + Math.round(8 * Math.sin((i / (TAIL_N - 1)) * Math.PI));
  fur(core, TAILV[i], n, {
    occl: false, flow: (p, nn, out) => out.copy(d), len: [0.22, 0.34], wid: [0.06, 0.09], lift: 0.38, clump: 3,
    lenFn: () => 0.7 + 0.5 * Math.sin(((i + 0.5) / TAIL_N) * Math.PI), cR: darkR,
    cT: (p, nn, out) => out.copy(i > TAIL_N - 3 ? C.furP : C.furB).lerp(C.furD, nn.y < 0 ? 0.3 : 0), raise: 0.8,
  });
}
// ventre et flancs
fur(core, absV, 26, {
  filter: (p, n) => n.z > 0.2 && n.y < 0.2, flow: (p, n, d) => d.set(0, -1, 0.1),
  len: [0.09, 0.15], wid: [0.04, 0.06], lift: 0.12, cR: lightR, cT: lightT, raise: 0.2, occLim: 0.98,
});
for (const s of SIDES) fur(core, ribV, 22, {
  filter: (p, n) => n.x * s > 0.55 && n.z < 0.5, flow: (p, n, d) => d.set(s * 0.2, -1, -0.3),
  len: [0.14, 0.22], wid: [0.05, 0.08], lift: 0.18, cR: darkR, cT: midT, raise: 0.5,
});
// couche secondaire (qualité moyenne et plus) : densifie crinière, épaules, flancs, membres et queue
fur(extra, humpV, 150, {
  filter: (p, n) => n.y > -0.25 && p.z < 0.3 && tankDist(p) > 0.32, flow: (p, n, d) => d.set(p.x * 1.5, -0.2, -1),
  len: [0.22, 0.38], wid: [0.05, 0.085], lift: 0.46, cR: maneR, cT: maneT, raise: 1, occLim: 0.97, clump: 3,
});
fur(extra, neckV, 80, {
  filter: (p, n) => n.y > -0.3, flow: (p, n, d) => d.set(p.x * 1.6, 0.25, -1),
  len: [0.22, 0.36], wid: [0.05, 0.08], lift: 0.5, cR: maneR, cT: maneT, raise: 1, occLim: 0.97, clump: 3,
});
for (const s of SIDES) {
  const k = SK(s), a = ARMV[k], lg = LEGV[k];
  fur(extra, TRAP[s], 40, { filter: (p, n) => n.y > -0.1, flow: (p, n, d) => d.set(s * 0.9, -0.35, -0.6), len: [0.2, 0.32], wid: [0.05, 0.08], lift: 0.42, cR: maneR, cT: maneT, raise: 1, occLim: 0.97 });
  fur(extra, LAT_V[s], 30, { filter: (p, n) => n.z < 0.3, flow: (p, n, d) => d.set(s * 0.35, -0.8, -0.6), len: [0.14, 0.22], wid: [0.05, 0.08], lift: 0.3, cR: darkR, cT: midT, raise: 0.7, occLim: 0.97 });
  fur(extra, lg.thigh, 34, { filter: (p, n) => n.x * s > -0.2 && n.z < 0.7, flow: (p, n, d) => d.set(s * 0.25, -1, -0.35), len: [0.12, 0.2], wid: [0.045, 0.075], lift: 0.25, cR: darkR, cT: midT, raise: 0.4, occLim: 0.97 });
  fur(extra, a.foreU, 20, { filter: (p, n) => n.dot(v3(s * 0.7, 0.1, -0.7)) > 0.1, flow: (p, n, d) => d.copy(a.la).multiplyScalar(-0.8).add(v3(s * 0.2, 0, -0.5)), len: [0.14, 0.22], wid: [0.04, 0.065], lift: 0.45, cR: darkR, cT: midT, raise: 0.6, occLim: 0.97 });
  fur(extra, a.delt, s > 0 ? 10 : 24, { filter: (p, n) => (s > 0 ? n.x * s > 0.5 && n.y < 0.2 : n.y > -0.2), flow: (p, n, d) => d.set(s * 0.45, -1, -0.15), len: [0.14, 0.22], wid: [0.045, 0.07], lift: 0.3, cR: darkR, cT: midT, raise: 0.6, occLim: 0.97 });
  fur(extra, lg.calf, 14, { filter: (p, n) => n.dot(lg.back) < 0.3, flow: (p, n, d) => d.set(s * 0.1, -0.5, -1), len: [0.14, 0.22], wid: [0.04, 0.065], lift: 0.45, cR: darkR, cT: midT, raise: 0.5, occLim: 0.97 });
}
for (let i = 0; i < TAIL_N; i++) {
  const a = TAILP[i], b = TAILP[i + 1], d = b.clone().sub(a).normalize();
  fur(extra, TAILV[i], 12, { occl: false, flow: (p, nn, out) => out.copy(d), len: [0.2, 0.3], wid: [0.05, 0.075], lift: 0.5, cR: darkR, cT: midT, raise: 0.8, clump: 3 });
}

/* =====================================================================================
 * Chimtech de Zaun : cuve, tuyaux, harnais, collier, muselière, épaulière, gantelets
 * ===================================================================================== */
const S2 = J('spine2');
const wS2 = { w: 'spine2' };
const ironS2 = Object.assign({}, IRON, wS2), brassS2 = Object.assign({}, BRASS, wS2), irondS2 = Object.assign({}, IROND, wS2);
// plaque dorsale et berceau
box(core, v3(0.05, 2.24, -0.6), 0.5, 0.62, 0.06, qE(-0.42, 0, 0), irondS2);
for (const s of SIDES) for (const y of [-0.24, 0.24]) rivet(core, v3(s * 0.2 + 0.05, 2.24 + y * 0.91, -0.6 - y * 0.41 - 0.035), 0.02, brassS2);
cylAB(core, tankAt(-TH / 2 - 0.07), tankAt(-TH / 2 + 0.02), 0.235, 0.225, 12, ironS2);
cylAB(core, tankAt(TH / 2 - 0.02), tankAt(TH / 2 + 0.07), 0.225, 0.235, 12, ironS2);
ring(core, tankAt(-TH / 2 + 0.02), TAX, 0.222, 0.018, 4, 18, brassS2);
ring(core, tankAt(TH / 2 - 0.02), TAX, 0.222, 0.018, 4, 18, brassS2);
cylAB(core, tankAt(TH / 2 + 0.07), tankAt(TH / 2 + 0.16), 0.07, 0.05, 8, brassS2); // vanne
ring(core, tankAt(TH / 2 + 0.17), TAX, 0.075, 0.012, 4, 10, ironS2);
cylAB(core, tankAt(-TH / 2 - 0.07), tankAt(-TH / 2 - 0.14), 0.12, 0.08, 8, ironS2);
{
  const px = TPX, pz = TPZ;
  for (let a = 0; a < 4; a++) {
    const an = Math.PI / 4 + a * Math.PI / 2, o = px.clone().multiplyScalar(Math.cos(an) * 0.205).addScaledVector(pz, Math.sin(an) * 0.205);
    cylAB(core, tankAt(-TH / 2).add(o), tankAt(TH / 2).add(o), 0.014, 0.014, 5, ironS2);
  }
  // manomètre
  const gp = tankAt(-TH / 2 + 0.12).addScaledVector(pz, -0.24);
  cylAB(core, gp.clone().addScaledVector(pz, 0.03), gp.clone().addScaledVector(pz, -0.02), 0.055, 0.055, 10, brassS2);
  cylAB(core, gp.clone().addScaledVector(pz, -0.02), gp.clone().addScaledVector(pz, -0.03), 0.045, 0.045, 10, Object.assign({}, wS2, { color: C.tooth, surf: SF.tooth, jitter: 0 }));
}
// supports entre plaque et cuve
for (const s of SIDES) for (const h of [-0.22, 0.12]) cylAB(core, v3(s * 0.12 + 0.06, 2.36 + h * 0.5, -0.6), tankAt(h).addScaledVector(TPX, s * 0.12).addScaledVector(TPZ, 0.17), 0.022, 0.022, 6, ironS2);
// bonbonnes latérales
const CAN = [];
for (const s of SIDES) {
  const cc = v3(s * 0.3, 2.28, -0.62), ax = v3(s * 0.25, 1, -0.2).normalize();
  CAN.push({ c: cc, ax, s });
  cylAB(core, cc.clone().addScaledVector(ax, -0.19), cc.clone().addScaledVector(ax, -0.13), 0.095, 0.09, 10, ironS2);
  cylAB(core, cc.clone().addScaledVector(ax, 0.13), cc.clone().addScaledVector(ax, 0.19), 0.09, 0.095, 10, ironS2);
  cylAB(core, cc.clone().addScaledVector(ax, 0.19), cc.clone().addScaledVector(ax, 0.24), 0.035, 0.03, 6, brassS2);
  cylAB(core, cc.clone().add(v3(-s * 0.05, 0, 0.06)), v3(s * 0.16, 2.26, -0.55), 0.02, 0.02, 5, ironS2);
}
// tuyaux (le flux lumineux circule de la cuve vers le corps)
const wHoseNeck = (p, w) => { const t = ss(-0.25, 0.15, p.z); w[0] = I('spine2'); w[1] = I('neck'); w[2] = 1 - t; w[3] = t; };
for (const s of SIDES) {
  hose(core, [tankAt(TH / 2 + 0.04).addScaledVector(TPX, s * 0.15), tankAt(TH / 2 + 0.12).addScaledVector(TPX, s * 0.3).add(v3(0, -0.05, 0.12)), v3(s * 0.3 + 0.05, 2.86, -0.24), v3(s * 0.3, 2.56, 0.1), v3(s * 0.235, 2.39, 0.27)], 0.03, { w: wHoseNeck });
  hose(core, [tankAt(-TH / 2 - 0.1).addScaledVector(TPX, s * 0.07), v3(s * 0.16 + 0.08, 2.05, -0.88), v3(s * 0.2, 1.72, -0.66), v3(s * 0.13, 1.6, -0.43)], 0.026, { w: (p, w) => { const t = ss(1.95, 1.7, p.y); w[0] = I('spine2'); w[1] = I('spine1'); w[2] = 1 - t; w[3] = t; } });
  cylAB(core, v3(s * 0.13, 1.6, -0.43), v3(s * 0.11, 1.62, -0.36), 0.05, 0.055, 8, Object.assign({}, IRON, { w: 'spine1' }));
}
hose(core, [v3(0.36, 2.52, -0.66), v3(0.55, 2.62, -0.5), v3(0.8, 2.5, -0.22), v3(0.9, 2.36, -0.04)], 0.03, { w: (p, w) => { const t = ss(0.45, 0.8, p.x); w[0] = I('spine2'); w[1] = I('armL'); w[2] = 1 - t; w[3] = t; } });

// collier de fer
{
  const nc = v3(0, 2.34, 0.31), nax = v3(0, 0.18, 0.98).normalize();
  const wN = { w: wNeck };
  ring(core, nc, nax, 0.245, 0.05, 5, 16, Object.assign({}, IROND, wN), v3(1.08, 1, 1));
  ring(core, nc.clone().addScaledVector(nax, 0.05), nax, 0.235, 0.018, 4, 16, Object.assign({}, BRASS, wN), v3(1.08, 1, 1));
  for (let a = 0; a < 10; a++) {
    const an = a / 10 * Math.PI * 2, rp = v3(Math.cos(an) * 0.29 * 1.08, Math.sin(an) * 0.29, 0).applyQuaternion(new Quat().setFromUnitVectors(v3(0, 0, 1), nax)).add(nc);
    rivet(core, rp, 0.022, Object.assign({}, BRASS, wN));
    if (a >= 1 && a <= 4) blade(core, rp, rp.clone().sub(nc).normalize(), nax, 0.11, 0.025, { w: wNeck, surf: SF.iron, c0: C.ironD, c1: C.iron, bend: 0.1, segs: 2 });
  }
  for (const s of SIDES) cylAB(core, v3(s * 0.25, 2.38, 0.24), v3(s * 0.22, 2.39, 0.29), 0.042, 0.042, 8, Object.assign({}, IRON, wN));
}
// muselière / attelle de mâchoire
{
  const wH = { w: 'head' }, wJ = { w: 'jaw' };
  ring(core, hp(0, -0.018, 0.46), v3(0, -0.12, 1), 0.104 * HS, 0.017 * HS, 4, 12, Object.assign({}, IROND, wH), v3(1.0, 0.88, 1));
  for (const s of SIDES) {
    const a = hp(s * 0.1, -0.035, 0.45), b = hp(s * 0.15, -0.07, 0.12);
    box(core, a.clone().add(b).multiplyScalar(0.5), 0.034 * HS, a.distanceTo(b), 0.018 * HS, quatAlong(b.clone().sub(a), v3(s, 0, 0)), Object.assign({}, IRON, wH));
    cylAB(core, hp(s * 0.16, -0.075, 0.1), hp(s * 0.135, -0.075, 0.1), 0.042 * HS, 0.042 * HS, 8, Object.assign({}, BRASS, wH));
    rivet(core, hp(s * 0.112, -0.03, 0.46), 0.015 * HS, Object.assign({}, BRASS, wH));
  }
  box(core, jp(0, -0.08, 0.3), 0.125 * HS, 0.018 * HS, 0.22 * HS, qE(-0.06, 0, 0), Object.assign({}, IROND, wJ));
  for (const z of [0.2, 0.4]) rivet(core, jp(0, -0.09, z), 0.012 * HS, Object.assign({}, BRASS, wJ));
}
// épaulière gauche (fer rouillé, laiton) + tuyau
{
  const k = 'L', SL = J('armL'), a = ARMV.L, wA = { w: 'armL' };
  const c0 = SL.clone().add(v3(0.06, 0.06, 0.0));
  const PAUL = { color: rustCol(col(0x5f666e), 0.42), surf: [0.55, 0.42, 0, 0], jitter: 0.12, tint: false, w: 'armL' };
  const sh1 = shell(core, c0, v3(0.72, 0.68, 0.06), 0.27, 1.05, v3(1, 0.78, 1.05), v3(0, 0, 1), PAUL, Object.assign({}, BRASS, wA));
  const c1 = SL.clone().addScaledVector(a.ua, 0.2).add(v3(0.04, 0, 0));
  shell(core, c1, v3(0.97, 0.22, 0.06), 0.24, 0.95, v3(1, 0.8, 1.1), v3(0, 0, 1), Object.assign({}, PAUL, { color: rustCol(col(0x4b5158), 0.35) }), Object.assign({}, BRASS, wA));
  for (let r = 0; r < 9; r++) {
    const an = r / 9 * Math.PI * 2, rp = v3(Math.cos(an) * sh1.rimR, sh1.rimY, Math.sin(an) * sh1.rimR).multiply(v3(1, 0.78, 1.05)).applyQuaternion(sh1.q).add(c0);
    rivet(core, rp, 0.017, Object.assign({}, BRASS, wA));
  }
  for (let i = 0; i < 3; i++) { // crête
    const p = c0.clone().add(v3(0.72, 0.68, 0.06).normalize().multiplyScalar(0.2)).add(v3(0, 0, -0.12 + i * 0.12));
    blade(core, p, v3(0.6, 0.8, 0), v3(0, 0, 1), 0.1 - Math.abs(i - 1) * 0.03, 0.03, { w: 'armL', surf: SF.iron, c0: C.ironD, c1: C.iron, bend: 0.05, segs: 2 });
  }
  ring(core, SL.clone().addScaledVector(a.ua, 0.42), a.ua, 0.175, 0.025, 4, 12, Object.assign({}, LEATHER, wA));
  cylAB(core, v3(0.9, 2.36, -0.04), v3(0.86, 2.32, 0.03), 0.045, 0.05, 8, Object.assign({}, BRASS, wA));
}
// gantelets
for (const s of SIDES) {
  const k = SK(s), EL = J('fore' + k), a = ARMV[k], wF = { w: 'fore' + k };
  const g0 = EL.clone().addScaledVector(a.la, 0.36), g1 = EL.clone().addScaledVector(a.la, 0.9);
  cylAB(core, g0, g1, 0.168, 0.13, 9, Object.assign({}, IRON, wF, { hint: v3(s, 0, 0) }), true);
  for (const u of [0.38, 0.62, 0.88]) {
    const c = EL.clone().addScaledVector(a.la, u), r = lerp(0.17, 0.133, (u - 0.36) / 0.54);
    ring(core, c, a.la, r + 0.008, 0.016, 4, 14, Object.assign({}, BRASS, wF));
  }
  for (let i = 0; i < 6; i++) {
    const an = i / 6 * Math.PI * 2 + 0.3, u = 0.5, r = lerp(0.17, 0.133, (u - 0.36) / 0.54) + 0.01;
    const q = quatAlong(a.la), rp = v3(Math.cos(an) * r, 0, Math.sin(an) * r).applyQuaternion(q).add(EL.clone().addScaledVector(a.la, u));
    rivet(core, rp, 0.014, Object.assign({}, IROND, wF));
  }
  // ampoule chimique sur l'extérieur du gantelet (émissive) et tuyau vers le poignet
  const vc = EL.clone().addScaledVector(a.la, 0.62).add(v3(s * 0.19, 0, -0.04));
  ellip(core, vc, v3(0.04, 0.08, 0.04), quatAlong(a.la), { w: 'fore' + k, color: C.liquid, surf: SF.glow, detail: 1, jitter: 0.05, vol: false });
  cylAB(core, vc.clone().addScaledVector(a.la, -0.1), vc.clone().addScaledVector(a.la, -0.07), 0.05, 0.05, 8, Object.assign({}, IROND, wF));
  cylAB(core, vc.clone().addScaledVector(a.la, 0.07), vc.clone().addScaledVector(a.la, 0.1), 0.05, 0.05, 8, Object.assign({}, IROND, wF));
  for (let i = 0; i < 3; i++) {
    const an = i / 3 * Math.PI * 2, q = quatAlong(a.la), o = v3(Math.cos(an) * 0.045, 0, Math.sin(an) * 0.045).applyQuaternion(q);
    cylAB(core, vc.clone().addScaledVector(a.la, -0.08).add(o), vc.clone().addScaledVector(a.la, 0.08).add(o), 0.008, 0.008, 4, Object.assign({}, IRON, wF));
  }
  hose(core, [vc.clone().addScaledVector(a.la, 0.1), vc.clone().addScaledVector(a.la, 0.2).add(v3(s * 0.03, 0, 0.02)), J('hand' + k).clone().add(v3(s * 0.12, 0.08, 0.02))], 0.018, { w: 'fore' + k });
}
// harnais : sangles de cuir qui épousent le torse (lancer de rayons sur les volumes)
const TORSO_SET = vols.filter(v => TORSO.includes(v) || v === ARMV.L.delt || v === ARMV.R.delt);
function strap(aims, width, thick, o) {
  const curve = new THREE.CatmullRomCurve3(aims), N = Math.round(curve.getLength() * 26);
  const P = [], Nn = [], Wv = [];
  for (let i = 0; i <= N; i++) {
    const a = curve.getPointAt(i / N), org = v3(0, a.y, Math.min(a.z, 0.05) * 0.4 - 0.05);
    const dir = a.clone().sub(org).normalize(), hit = rayExit(org, dir, TORSO_SET);
    const p = org.clone().addScaledVector(dir, hit.t + thick * 0.6);
    _t1.copy(p).sub(hit.v.c).applyQuaternion(hit.v.qi).divide(hit.v.r).divide(hit.v.r).applyQuaternion(hit.v.q).normalize();
    P.push(p); Nn.push(_t1.clone()); Wv.push(hit.v.w);
  }
  const sideV = [];
  for (let i = 0; i <= N; i++) {
    const tg = P[Math.min(N, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
    sideV.push(new V3().crossVectors(tg, Nn[i]).normalize().multiplyScalar(width / 2));
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
    if (o.rivets && i % o.rivets === 0 && i > 0) rivet(core, P[i].clone().addScaledVector(Nn[i], thick * 1.1), 0.013, Object.assign({}, BRASS, { w: wSrc }));
  }
  return { P, Nn, Wv };
}
for (const s of SIDES) {
  strap([v3(s * 0.18, 2.36, -0.5), v3(s * 0.36, 2.52, -0.2), v3(s * 0.42, 2.44, 0.12), v3(s * 0.34, 2.2, 0.36), v3(s * 0.26, 1.95, 0.46), v3(s * 0.3, 1.7, 0.36), v3(s * 0.36, 1.55, 0.18)], 0.075, 0.022, { rivets: 6 });
}
const belt = strap([v3(0.45, 1.56, 0.1), v3(0.3, 1.52, 0.3), v3(0, 1.5, 0.38), v3(-0.3, 1.52, 0.3), v3(-0.45, 1.56, 0.1), v3(-0.42, 1.6, -0.2), v3(0, 1.64, -0.42), v3(0.42, 1.6, -0.2), v3(0.45, 1.56, 0.1)], 0.09, 0.025, { rivets: 5 });
{ // boucle
  const i = Math.round(belt.P.length * 0.25), p = belt.P[i], n = belt.Nn[i];
  box(core, p.clone().addScaledVector(n, 0.03), 0.11, 0.12, 0.025, quatAlong(UP, n), Object.assign({}, BRASS, { w: belt.Wv[i] }));
  box(core, p.clone().addScaledVector(n, 0.045), 0.06, 0.07, 0.02, quatAlong(UP, n), Object.assign({}, IROND, { w: belt.Wv[i] }));
}
// cicatrice agrafée sur le torse
for (let i = 0; i < 6; i++) {
  const a = v3(0.08 + i * 0.05, 2.14 - i * 0.045, 0.6), org = v3(0, a.y, -0.02), dir = a.clone().sub(org).normalize();
  const hit = rayExit(org, dir, TORSO_SET), p = org.clone().addScaledVector(dir, hit.t + 0.005);
  box(core, p, 0.012, 0.06, 0.012, qE(0, 0, 0.9), Object.assign({}, IRON, { w: hit.v.w }));
  ellip(core, p.clone().add(v3(0.0, 0.0, -0.008)), v3(0.03, 0.012, 0.012), qE(0, 0, -0.7), { w: hit.v.w, color: C.skinG, surf: SF.skin, detail: 0, vol: false });
}

/* =====================================================================================
 * Maillage, matériaux et liaison
 * ===================================================================================== */
const U = {
  uChem: { value: new THREE.Color() }, uBlood: { value: new THREE.Color() }, uBounce: { value: new THREE.Color() },
  uRim: { value: new THREE.Color() }, uTankPos: { value: TC.clone() }, uTime: { value: 0 },
  uBristle: { value: 0 }, uRipple: { value: 0.05 }, uFlow: { value: 1 }, uRimK: { value: 1.6 },
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
vEm = vec3(aSurf.z * (1.0 + fl * 16.0), aSurf.w, tb * tb * (1.0 - aSurf.y));`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uChem, uBlood, uBounce, uRim;
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
#if NUM_DIR_LIGHTS > 0
// liseré de contre-jour : la clé de la scène (derrière lui) déborde sur la silhouette
float rl = clamp(dot(normal, directionalLights[0].direction) + 0.55, 0.0, 1.0);
totalEmissiveRadiance += directionalLights[0].color * diffuseColor.rgb * (fr3 * rl * uRimK);
#endif`);
};
bodyMat.customProgramCacheKey = () => 'ww-warwick-body-v1';

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
const merge = gs => {
  const U8 = THREE.BufferGeometryUtils;
  const g = U8 && U8.mergeBufferGeometries ? U8.mergeBufferGeometries(gs) : gs[0];
  return g;
};
const liqGeo = merge([cylGeoAB(tankAt(-TH / 2 + 0.03), tankAt(TH / 2 - 0.12), 0.168, 16, false)].concat(CAN.map(c => cylGeoAB(c.c.clone().addScaledVector(c.ax, -0.13), c.c.clone().addScaledVector(c.ax, 0.09), 0.068, 10, false))));
const liquid = new THREE.Mesh(liqGeo, liqMat); liquid.name = 'warwick-chimie'; liquid.renderOrder = 2;
B.spine2.add(liquid);
const glassMat = new THREE.MeshStandardMaterial({ color: col(0xd8f5e6), transparent: true, opacity: 0.12, roughness: 0.06, metalness: 0.1, depthWrite: false, emissive: new THREE.Color() });
glassMat.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float gf = 1.0 - abs(dot(normal, normalize(vViewPosition)));
diffuseColor.a = mix(diffuseColor.a, 0.72, gf * gf * gf);`);
};
glassMat.customProgramCacheKey = () => 'ww-warwick-glass';
const glassGeo = merge([cylGeoAB(tankAt(-TH / 2), tankAt(TH / 2), TR, 20, true)].concat(CAN.map(c => cylGeoAB(c.c.clone().addScaledVector(c.ax, -0.14), c.c.clone().addScaledVector(c.ax, 0.14), 0.082, 12, true))));
const glass = new THREE.Mesh(glassGeo, glassMat); glass.name = 'warwick-verre'; glass.renderOrder = 3;
B.spine2.add(glass);

const BUB_N = 26;
const bubMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), bubMat, BUB_N);
bubbles.name = 'warwick-bulles'; bubbles.frustumCulled = false;
B.spine2.add(bubbles);
const bub = [];
for (let i = 0; i < BUB_N; i++) bub.push({ a: rnd() * 6.283, r: 0.03 + rnd() * 0.12, sp: 0.07 + rnd() * 0.16, off: rnd(), sz: 0.006 + rnd() * 0.012, wob: rnd() * 6.283 });
const tankBase = toS2(tankAt(-TH / 2 + 0.05)), tankAxis = TAX.clone(), tankPX = TPX.clone(), tankPZ = TPZ.clone();
const tankFill = TH - 0.2;

/* ---------- Halos des yeux ---------- */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
})();
const eyeMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const eyeGlows = SIDES.map(s => {
  const sp = new THREE.Sprite(eyeMat);
  sp.position.copy(hp(s * 0.104, 0.066, 0.27)).sub(HJ); sp.scale.setScalar(0.25); sp.renderOrder = 4;
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
const EARS = SIDES.map(s => B['ear' + SK(s)]);
const TAIL = []; for (let i = 0; i < TAIL_N; i++) TAIL.push(B['tail' + i]);
const _o3 = new THREE.Object3D(), _bubP = new V3();
const _chem = new THREE.Color(), _tmpC = new THREE.Color();
const RIM = col(0x9cc4ff);
const ZERO_AUDIO = { level: 0, bass: 0, mid: 0, high: 0, beat: 0 }, ZERO_PTR = { x: 0, y: 0 };
// période de bouclage du temps shader : 40π s contient un nombre entier de cycles de toutes ses fréquences
const TWRAP = 40 * Math.PI;
let bubCount = BUB_N;

function update(state) {
  const t = state.t || 0, dt = clamp(state.dt || 0, 0, 0.05);
  const Hn = clamp(state.hunt || 0, 0, 1), H = clamp(state.howl || 0, 0, 1), S = clamp(state.sniff || 0, 0, 1);
  const F = clamp(state.flex || 0, 0, 1), G = clamp(state.growl || 0, 0, 1);
  const au = state.audio || ZERO_AUDIO, ptr = state.pointer || ZERO_PTR;
  const ts = state.swipe != null && state.swipe >= 0 ? state.swipe : -1;
  const swA = ts < 0 ? 0 : env4(ts, 0, 0.24, 0.26, 0.45);
  const swS = ts < 0 ? 0 : env4(ts, 0.26, 0.45, 0.47, 0.63);
  const swF = ts < 0 ? 0 : env4(ts, 0.47, 0.63, 0.68, 0.995);
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
  /* --- bassin et colonne --- */
  const pel = B.pelvis;
  pel.position.set(
    P0.x + ws * 0.035 + swS * 0.03,
    P0.y + br * 0.007 * bA - Hn * 0.13 + H * 0.035 + S * 0.015 - swA * 0.05 - swS * 0.04 - G * 0.03 - F * 0.02,
    P0.z - H * 0.06 + Hn * 0.03 + swS * 0.05 + swF * 0.04);
  pel.rotation.set(Hn * 0.1 - H * 0.08 - S * 0.02 + swA * 0.04 + swS * 0.08 + G * 0.04, yawN * 0.04 - swA * 0.07 + swS * 0.09 + swF * 0.07, -ws * 0.03);
  B.spine1.rotation.set(Hn * 0.08 - H * 0.07 - S * 0.02 + swS * 0.06 + G * 0.04, -swA * 0.09 + swS * 0.13 + swF * 0.1, ws * 0.02);
  B.spine2.rotation.set(Hn * 0.08 - H * 0.15 - S * 0.04 - br * 0.014 * bA - F * 0.06 + swS * 0.06, st.ly * 0.12 * lookW - swA * 0.13 + swS * 0.18 + swF * 0.14, ws * 0.025 + swA * 0.04);
  B.ribs.scale.set(1 + br * 0.016 * bA + H * 0.03, 1 + br * 0.008 * bA, 1 + br * 0.024 * bA + H * 0.04);
  /* --- cou, tête, mâchoire --- */
  B.neck.rotation.set(Hn * 0.06 - H * 0.16 - S * 0.12 + G * 0.2 + st.lx * 0.4 * lookW + F * 0.08, st.ly * 0.38 * lookW + swS * 0.06, -ws * 0.02);
  B.head.rotation.set(-Hn * 0.26 - H * 0.5 - S * 0.24 + G * 0.12 + st.lx * 0.6 * lookW - sniff * 0.035 + F * 0.12 + br * 0.008,
    st.ly * 0.5 * lookW + swS * 0.1 + swF * 0.05, st.lz * lookW + nz(t * 0.13, 7) * 0.04 + G * 0.06 - ws * 0.02);
  const rumble = G * Math.sin(t * 61) * 0.012 + Hn * Math.sin(t * 47) * 0.004;
  B.jaw.rotation.x = 0.03 + br * 0.015 * (0.5 + Hn) + Hn * 0.1 + H * (0.75 + 0.03 * Math.sin(t * 8.3)) + G * 0.3 + swS * 0.28 + swF * 0.12 + F * 0.08 + rumble - sniff * 0.02;
  for (let e = 0; e < 2; e++) {
    const s = SIDES[e], E = st.ear[e], tw = env4(t - E.t0, 0, 0.05, 0.1, 0.38) * E.amp;
    EARS[e].rotation.set(-0.12 * Hn - 0.5 * H - 0.55 * G + 0.18 * S - 0.45 * tw + nz(t * 0.21, 9 + e) * 0.05 - swS * 0.3, 0, s * (0.18 * tw + 0.1 * Hn + 0.2 * G + 0.1 * H));
  }
  /* --- bras --- */
  for (let i = 0; i < 2; i++) {
    const A = AR[i], s = A.s, sw = nz(t * 0.17, s * 3) * 0.03 + br * 0.012 * bA;
    const roll = F * Math.sin(t * 4.4 + s), roll2 = F * Math.cos(t * 4.4 + s);
    A.clav.rotation.set(-roll * 0.1 + H * 0.1, -s * roll2 * 0.08 + s * H * 0.15, s * (br * 0.03 * bA + H * 0.16 + F * 0.05 + Hn * 0.05 + roll2 * 0.05));
    A.arm.rotation.set(-Hn * 0.2 + H * 0.15 - F * 0.5 + sw, -s * H * 0.25, s * (H * 0.62 + Hn * 0.06 + F * 0.12));
    A.fore.rotation.set(-Hn * 0.25 - H * 0.85 - F * 0.75 - br * 0.02, 0, 0);
    A.hand.rotation.set(-Hn * 0.12 + H * 0.3 - F * 0.25, 0, 0);
  }
  { // coup de griffe (bras droit) : armé → frappe → accompagnement → retour
    const A = AR[1];
    A.clav.rotation.x += swA * 0.2 - swS * 0.15; A.clav.rotation.z += -swA * 0.25;
    A.arm.rotation.x += swA * 0.05 - swS * 1.1 - swF * 0.7;
    A.arm.rotation.y += -swA * 0.55 + swS * 0.2 + swF * 0.4;
    A.arm.rotation.z += -swA * 1.95 + swS * 0.2 + swF * 0.55;
    A.fore.rotation.x += -swA * 1.6 - swS * 0.1 - swF * 0.25;
    A.hand.rotation.x += swA * 0.4 - swS * 0.25 - swF * 0.1;
    AR[0].arm.rotation.x += swA * 0.15 + swS * 0.25; AR[0].arm.rotation.z += swS * 0.15;
  }
  /* --- doigts --- */
  for (let i = 0; i < 2; i++) {
    const Fh = FING[i];
    for (let f = 0; f < 4; f++) {
      let c = 0.12 + nz(t * 0.23, f * 1.7 + i * 5) * 0.07 + Hn * 0.18 - H * 0.35;
      c += F * (0.75 * (0.5 + 0.5 * Math.sin(t * 7.2 - f * 0.55 + i)) - 0.35);
      if (i === 1) c += swA * 0.5 - swS * 0.45 - swF * 0.2;
      Fh.fingers[f].quaternion.setFromAxisAngle(Fh.axis, c);
    }
    Fh.thumb.quaternion.setFromAxisAngle(Fh.taxis, 0.1 + F * 0.3 * Math.sin(t * 7.2 + i) + Hn * 0.1);
  }
  /* --- jambes (pieds plantés) --- */
  pel.updateMatrix();
  _qP.copy(pel.quaternion);
  const tilt = -H * 0.32 + Hn * 0.18 + swA * 0.06;
  solveLeg(LEGS[0], tilt); solveLeg(LEGS[1], tilt);
  /* --- queue (onde qui se propage le long de la chaîne) --- */
  st.tp = (st.tp + dt * (1.0 + Hn * 0.6 + H * 0.4)) % (Math.PI * 200);
  for (let i = 0; i < TAIL_N; i++) {
    const amp = (0.035 + i * 0.012) * (1 - Hn * 0.35) * (1 + swAny * 0.6);
    const lift = i === 0 ? H * 0.55 + Hn * 0.12 + G * 0.1 + swS * 0.1 : (H * 0.04 - Hn * 0.015 + G * 0.03);
    TAIL[i].rotation.set(lift + 0.03 * Math.sin(st.tp * 0.63 - i * 0.45), amp * Math.sin(st.tp - i * 0.55) + (i === 0 ? -ws * 0.12 - swS * 0.2 : 0), 0);
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
  const eyeI = (2.4 + Hn * 3 + H * 2 + G * 2 + swS * 2 + au.beat * 1.5 + Math.sin(t * 2.1) * 0.2) * blink;
  U.uBlood.value.copy(blood).multiplyScalar(eyeI);
  eyeMat.color.copy(blood).multiplyScalar((0.9 + Hn * 0.7 + H * 0.4 + au.beat * 0.3) * blink);
  const es = (0.24 + Hn * 0.14 + H * 0.06 + G * 0.05 + au.beat * 0.04) * (0.3 + 0.7 * blink);
  eyeGlows[0].scale.setScalar(es); eyeGlows[1].scale.setScalar(es);
  U.uRim.value.copy(RIM).multiplyScalar(0.22).lerp(_tmpC.copy(blood).multiplyScalar(0.3), Hn);
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
