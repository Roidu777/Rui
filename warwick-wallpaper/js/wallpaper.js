/* Warwick · Furie de Zaun — pont Wallpaper Engine : propriétés, audio, limite d'images, pause.
 * Contrat : CONTRACT.md (WW.createBridge). Script classique, aucune dépendance.
 *
 * Wallpaper Engine peut appeler wallpaperPropertyListener et l'écouteur audio avant que main.js
 * n'existe : tout est donc enregistré dès le chargement de ce script et mis en tampon jusqu'à
 * WW.createBridge(). Hors de Wallpaper Engine, les mêmes clés se lisent dans l'URL
 * (index.html?mode=hunt&quality=low&chemcolor=0.2,0.8,1) ; « fps=30 » simule la limite d'images
 * et « audiodemo » génère un faux spectre musical pour tester la réaction audio.
 */
(function () {
'use strict';
var WW = window.WW = window.WW || {};

/* ------------------------------------------------------------------ schéma ---------- */
// Bornes et choix valides (les défauts viennent de opts.defaults, fournis par main.js).
var SCHEMA = {
  mode: { options: ['zaun', 'hunt', 'cycle'] },
  events: {},
  eventinterval: { min: 10, max: 120 },
  camerasway: {},
  parallax: {},
  audioreact: { min: 0, max: 100 },
  quality: { options: ['low', 'medium', 'high', 'ultra'] },
  bloom: { min: 0, max: 100 },
  particles: { min: 0, max: 100 },
  showtitle: {},
  chemcolor: {},
  bloodcolor: {},
};
var FALLBACK_DEFAULTS = {
  mode: 'cycle', events: true, eventinterval: 30, camerasway: true, parallax: true, audioreact: 60,
  quality: 'high', bloom: 60, particles: 70, showtitle: false, chemcolor: [0.49, 1, 0.31], bloodcolor: [1, 0.17, 0.17],
};

/* ------------------------------------------------------- tampon global (au chargement) ---------- */
var raw = {};            // dernières valeurs brutes reçues de Wallpaper Engine, par clé
var inWE = false;        // vrai dès que Wallpaper Engine nous parle
var fpsLimit = 0;        // 0 = illimité
var paused = false;
var current = null;      // instance créée par createBridge
var warned = {};
function warnOnce(k, e) { if (!warned[k]) { warned[k] = 1; console.error('[ww] pont Wallpaper Engine (' + k + ') :', e); } }

var prev = window.wallpaperPropertyListener || null; // on chaîne un éventuel écouteur existant
window.wallpaperPropertyListener = {
  applyUserProperties: function (p) {
    inWE = true;
    try {
      if (p && typeof p === 'object') for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) {
        var e = p[k];
        raw[k] = e && typeof e === 'object' && 'value' in e ? e.value : e;
      }
      if (current) current._sync(p);
    } catch (e) { warnOnce('propriétés', e); }
    if (prev && prev.applyUserProperties) try { prev.applyUserProperties(p); } catch (e) { warnOnce('écouteur chaîné', e); }
  },
  applyGeneralProperties: function (p) {
    inWE = true;
    try {
      if (p && p.fps !== undefined) {
        var f = +p.fps;
        fpsLimit = isFinite(f) && f > 0 ? Math.min(f, 1000) : 0;
        if (current) current.fpsLimit = fpsLimit;
      }
    } catch (e) { warnOnce('fps', e); }
    if (prev && prev.applyGeneralProperties) try { prev.applyGeneralProperties(p); } catch (e) { warnOnce('écouteur chaîné', e); }
  },
  setPaused: function (isPaused) {
    inWE = true;
    setPausedState(!!isPaused);
    if (prev && prev.setPaused) try { prev.setPaused(isPaused); } catch (e) { warnOnce('écouteur chaîné', e); }
  },
};
if (prev) {
  if (prev.userDirectoryFilesAddedOrChanged) window.wallpaperPropertyListener.userDirectoryFilesAddedOrChanged = prev.userDirectoryFilesAddedOrChanged;
  if (prev.userDirectoryFilesRemoved) window.wallpaperPropertyListener.userDirectoryFilesRemoved = prev.userDirectoryFilesRemoved;
}

function setPausedState(p) {
  if (p === paused) return;          // seulement les vrais changements (main relance sa boucle sur false)
  paused = p;
  if (!current) return;
  current.paused = p;
  var subs = current._pauseSubs;
  for (var i = 0; i < subs.length; i++) try { subs[i](p); } catch (e) { warnOnce('onPause', e); }
}

/* ------------------------------------------------------------------- audio ---------- */
// Wallpaper Engine : 128 valeurs ~30 fois/s, 0..63 gauche, 64..127 droite, graves -> aigus, ~0..1.
var BANDS = [[0, 5], [6, 23], [24, 63]];        // graves, médiums, aigus (bornes incluses)
var FLOOR = [0.025, 0.015, 0.007];              // gain maximal = 1 / plancher (pas d'amplification du bruit)
var GATE = [0.008, 0.005, 0.0025];              // en dessous : silence
var PEAK_RELEASE = 5;                           // s : auto-gain lent
var ATTACK = [0.045, 0.06, 0.035], RELEASE = [0.24, 0.2, 0.14];
var STALE_MS = 350;                             // plus de trame audio depuis : on retombe à 0

var A = {
  peak: new Float32Array([FLOOR[0], FLOOR[1], FLOOR[2]]),
  avg: new Float32Array(3),                    // moyenne glissante (~1 s) : un son continu reste modéré
  target: new Float32Array(3),                 // valeurs normalisées instantanées 0..1
  lastFrame: 0, frames: 0,
  slowBass: 0, prevBass: 0, lastBeat: -1e9, beatPending: 0,
};

function onAudio(arr) {
  if (!arr || arr.length < 128) return;
  var now = performance.now();
  var dtA = A.lastFrame ? Math.min(0.25, Math.max(0.001, (now - A.lastFrame) / 1000)) : 1 / 30;
  A.lastFrame = now; A.frames++;
  var relax = Math.exp(-dtA / PEAK_RELEASE);
  for (var b = 0; b < 3; b++) {
    var lo = BANDS[b][0], hi = BANDS[b][1], sum = 0, mx = 0;
    for (var i = lo; i <= hi; i++) {
      var l = +arr[i] || 0, r = +arr[i + 64] || 0;
      var v = (l + r) * 0.5;
      if (v > 1.5) v = 1.5; else if (v < 0) v = 0;
      sum += v; if (v > mx) mx = v;
    }
    var x = (sum / (hi - lo + 1)) * 0.65 + mx * 0.35;
    // Auto-gain : crête montante rapide, redescente lente, jamais sous le plancher.
    var pk = A.peak[b];
    pk = x > pk ? pk + (x - pk) * 0.35 : pk * relax;
    if (pk < FLOOR[b]) pk = FLOOR[b];
    A.peak[b] = pk;
    var n = (x - GATE[b]) / (pk * 0.92 - GATE[b]);
    n = n > 1 ? 1 : n < 0 ? 0 : n;
    // Contraste : ce qui dépasse la moyenne récente (attaques) monte à 1, un bourdon continu plafonne vers 0,55.
    var av = A.avg[b] += (x - A.avg[b]) * (1 - Math.exp(-dtA / 1.2));
    var c = (x - av) / Math.max(pk - av, pk * 0.15);
    c = c > 1 ? 1 : c < 0 ? 0 : c;
    A.target[b] = n * (0.55 + 0.45 * c);
  }
  // Détection d'attaque sur les graves : saut net au-dessus de la moyenne récente.
  var nb = A.target[0];
  var flux = nb - A.prevBass;
  if (nb > A.slowBass * 1.25 + 0.14 && flux > 0.07 && now - A.lastBeat > 260) {
    var s = (nb - A.slowBass) * 2.2;
    s = s > 1 ? 1 : s < 0.35 ? 0.35 : s;
    if (s > A.beatPending) A.beatPending = s;
    A.lastBeat = now;
  }
  A.slowBass += (nb - A.slowBass) * (1 - Math.exp(-dtA / 0.45));
  A.prevBass = nb;
}

if (typeof window.wallpaperRegisterAudioListener === 'function') {
  try { window.wallpaperRegisterAudioListener(onAudio); inWE = true; } catch (e) { warnOnce('audio', e); }
}

/* ----------------------------------------------------------------- URL ---------- */
var query;
try { query = new URLSearchParams(location.search); } catch (e) { query = null; }
function qGet(k) { return query && query.has(k) ? query.get(k) : null; }

// Faux spectre (navigateur seulement) : grosse caisse à 120 BPM, charleston, nappe.
if (query && query.has('audiodemo') && typeof window.wallpaperRegisterAudioListener !== 'function') {
  var demo = new Float32Array(128), demoT0 = performance.now();
  setInterval(function () {
    var t = (performance.now() - demoT0) / 1000, beat = t % 0.5, off = (t + 0.25) % 0.5;
    var kick = Math.exp(-beat * 11), hat = Math.exp(-off * 28) * 0.5, pad = 0.18 + 0.1 * Math.sin(t * 0.7);
    var loud = 0.55 + 0.45 * Math.sin(t * 0.11);      // couplets / refrains : teste l'auto-gain
    for (var i = 0; i < 64; i++) {
      var f = i / 63;
      var v = (kick * Math.exp(-i / 4) * 0.9 + pad * Math.exp(-Math.abs(f - 0.25) * 6) + hat * f * 0.6) * loud;
      v *= 0.85 + 0.15 * Math.sin(t * 9 + i);
      demo[i] = v; demo[i + 64] = v * 0.95;
    }
    onAudio(demo);
  }, 33);
}

/* -------------------------------------------------------------- conversions ---------- */
function toBool(v) {
  if (typeof v === 'string') { v = v.trim().toLowerCase(); return !(v === '0' || v === 'false' || v === 'non' || v === 'off' || v === ''); }
  return !!v;
}
function toColor(v, fallback) {
  var a;
  if (Array.isArray(v)) a = v.slice(0, 3);
  else {
    var s = String(v == null ? '' : v).trim();
    var hex = /^#?([0-9a-f]{6})$/i.exec(s);
    if (hex) { var n = parseInt(hex[1], 16); a = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
    else a = s.split(/[\s,;]+/).map(Number);
  }
  if (a.length < 3 || a.some(function (x) { return !isFinite(x); })) return fallback.slice();
  if (a[0] > 1 || a[1] > 1 || a[2] > 1) a = a.map(function (x) { return x / 255; }); // tolère 0..255
  return a.slice(0, 3).map(function (x) { return x < 0 ? 0 : x > 1 ? 1 : Math.round(x * 10000) / 10000; });
}
// Convertit une valeur brute (Wallpaper Engine ou URL) selon le type du défaut ; null si invalide.
function convert(key, v, def, fromUrl) {
  var sc = SCHEMA[key] || {};
  if (v === undefined || v === null) return null;
  if (typeof def === 'boolean') return fromUrl ? (v !== '0' && v !== 'false') : toBool(v);
  if (typeof def === 'number') {
    var n = +v;
    if (!isFinite(n)) return null;
    if (sc.min !== undefined && n < sc.min) n = sc.min;
    if (sc.max !== undefined && n > sc.max) n = sc.max;
    return n;
  }
  if (Array.isArray(def)) return toColor(v, def);
  var s = String(v);
  if (sc.options && sc.options.indexOf(s) < 0) {
    var low = s.trim().toLowerCase();
    return sc.options.indexOf(low) >= 0 ? low : null;
  }
  return s;
}
function same(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
  return a === b;
}

/* ---------------------------------------------------------------- fabrique ---------- */
WW.createBridge = function (opts) {
  var defaults = (opts && opts.defaults) || FALLBACK_DEFAULTS;
  var keys = Object.keys(defaults);
  var props = {};
  keys.forEach(function (k) { var d = defaults[k]; props[k] = Array.isArray(d) ? d.slice() : d; });

  // URL d'abord (navigateur), puis tout ce que Wallpaper Engine a déjà envoyé par-dessus.
  keys.forEach(function (k) {
    var q = qGet(k);
    if (q === null) return;
    var c = convert(k, q, defaults[k], true);
    if (c !== null) props[k] = c;
  });
  keys.forEach(function (k) {
    if (!(k in raw)) return;
    var c = convert(k, raw[k], defaults[k], false);
    if (c !== null) props[k] = c;
  });

  var qfps = qGet('fps');
  if (!inWE && qfps !== null && isFinite(+qfps) && +qfps > 0) fpsLimit = +qfps;

  var subs = [];
  var audio = { level: 0, bass: 0, mid: 0, high: 0, beat: 0 };
  var sm = new Float32Array(3);
  var lastSeenFrames = 0;

  var bridge = {
    props: props,
    audio: audio,
    fpsLimit: fpsLimit,
    paused: paused,
    get inWallpaperEngine() { return inWE; },
    _pauseSubs: [],

    onProps: function (cb) {
      if (typeof cb !== 'function') return;
      subs.push(cb);
      try { cb(props, keys.slice()); } catch (e) { warnOnce('onProps', e); }
    },

    onPause: function (cb) {
      if (typeof cb !== 'function') return;
      bridge._pauseSubs.push(cb);
      // On ne signale que la pause effective : un « false » initial relancerait une 2e boucle dans main.js.
      if (paused) try { cb(true); } catch (e) { warnOnce('onPause', e); }
    },

    update: function (dt) {
      dt = +dt;
      if (!(dt > 0)) return;
      if (dt > 0.25) dt = 0.25;
      var stale = !A.lastFrame || performance.now() - A.lastFrame > STALE_MS;
      if (stale) {
        // Plus de son : les cibles tombent à 0, le lissage fait le reste ; l'attaque repart de zéro.
        A.target[0] = A.target[1] = A.target[2] = 0;
        A.prevBass = 0; A.slowBass *= 0.9;
      }
      for (var b = 0; b < 3; b++) {
        var T = A.target[b], v = sm[b];
        v += (T - v) * (1 - Math.exp(-dt / (T > v ? ATTACK[b] : RELEASE[b])));
        sm[b] = v < 1e-4 ? 0 : v;
      }
      audio.bass = sm[0]; audio.mid = sm[1]; audio.high = sm[2];
      var lv = sm[0] * 0.5 + sm[1] * 0.32 + sm[2] * 0.18;
      audio.level = lv > 1 ? 1 : lv;

      if (A.beatPending > 0 && A.frames !== lastSeenFrames) {
        if (A.beatPending > audio.beat) audio.beat = A.beatPending;
        A.beatPending = 0;
      }
      lastSeenFrames = A.frames;
      var bt = audio.beat * Math.exp(-dt / 0.16);
      audio.beat = bt < 0.002 ? 0 : bt;
      // Toujours suivre la limite et la pause (au cas où main lit ces champs directement).
      bridge.fpsLimit = fpsLimit;
      bridge.paused = paused;
    },

    // Interne : nouvelles valeurs Wallpaper Engine -> conversion -> abonnés (clés réellement changées).
    _sync: function (p) {
      var changed = [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!p || !Object.prototype.hasOwnProperty.call(p, k)) continue;
        var c = convert(k, raw[k], defaults[k], false);
        if (c === null || same(c, props[k])) continue;
        props[k] = c;
        changed.push(k);
      }
      if (!changed.length) return;
      for (var j = 0; j < subs.length; j++) try { subs[j](props, changed); } catch (e) { warnOnce('onProps', e); }
    },
  };

  current = bridge;
  WW.bridge = bridge; // accès de débogage
  return bridge;
};

// Aide aux tests hors Wallpaper Engine : WW.simulateWallpaperEngine({ mode: 'hunt' }, { fps: 30 })
WW.simulateWallpaperEngine = function (user, general, pause) {
  var L = window.wallpaperPropertyListener, u = {};
  if (user) for (var k in user) u[k] = { value: Array.isArray(user[k]) ? user[k].join(' ') : user[k] };
  if (user) L.applyUserProperties(u);
  if (general) L.applyGeneralProperties(general);
  if (pause !== undefined) L.setPaused(pause);
};
WW.feedAudio = onAudio; // tests : WW.feedAudio(tableau de 128 valeurs)
})();
