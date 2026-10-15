/* Warwick · Furie de Zaun — orchestration : renderer, caméra 21:9, scénario, état partagé. */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
const THREE = window.THREE;
const stage = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');

if (!THREE) { console.error('three.js manquant'); return; }

/* ---------- Qualité ---------- */
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const QUALITY = {
  low:    { name: 'low',    scale: 0.6, shadows: false, shadowMap: 1024, particles: 0.4, bloomRes: 0.35, msaa: 0 },
  medium: { name: 'medium', scale: 0.8, shadows: true,  shadowMap: 1024, particles: 0.7, bloomRes: 0.5,  msaa: 0 },
  high:   { name: 'high',   scale: 1.0, shadows: true,  shadowMap: 2048, particles: 1.0, bloomRes: 0.5,  msaa: 4 },
  ultra:  { name: 'ultra',  scale: 1.0, shadows: true,  shadowMap: 4096, particles: 1.3, bloomRes: 0.75, msaa: 8 },
};

/* ---------- Pont Wallpaper Engine (ou remplaçant) ---------- */
const DEFAULT_PROPS = {
  mode: 'cycle', events: true, eventinterval: 30, camerasway: true, parallax: true, audioreact: 60,
  quality: 'high', bloom: 60, particles: 70, showtitle: false, chemcolor: [0.49, 1, 0.31], bloodcolor: [1, 0.17, 0.17],
};
function fallbackBridge() {
  const props = Object.assign({}, DEFAULT_PROPS);
  for (const [k, v] of params) {
    if (!(k in props)) continue;
    const d = DEFAULT_PROPS[k];
    props[k] = typeof d === 'boolean' ? v !== '0' && v !== 'false' : typeof d === 'number' ? +v : Array.isArray(d) ? v.split(/[ ,]+/).map(Number) : v;
  }
  const subs = [];
  return {
    props, audio: { level: 0, bass: 0, mid: 0, high: 0, beat: 0 }, fpsLimit: 0, paused: false,
    onProps(cb) { subs.push(cb); cb(props, Object.keys(props)); }, update() {}, onPause() {},
  };
}
const bridge = safe('createBridge', () => WW.createBridge({ defaults: DEFAULT_PROPS }), fallbackBridge);

function safe(name, make, fallback) {
  try {
    if (typeof WW[name] !== 'function') throw new Error(name + ' absent');
    return make();
  } catch (e) {
    console.error('[ww] ' + name + ' indisponible, remplaçant utilisé :', e);
    return fallback();
  }
}

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x050807, 1);
stage.appendChild(renderer.domElement);
if (DEV) renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 21 / 9, 0.1, 120);

/* ---------- État partagé ---------- */
const toColor = a => new THREE.Color(a[0], a[1], a[2]);
const state = {
  t: 0, dt: 0, hunt: 0, sniff: 0, howl: 0, swipe: -1, flex: 0, growl: 0,
  audio: { level: 0, bass: 0, mid: 0, high: 0, beat: 0 },
  pointer: { x: 0, y: 0 }, q: QUALITY.high, particles: 0.7, bloom: 0.6,
  headPos: new THREE.Vector3(0, 2.4, 0.6),
  palette: { chem: toColor(DEFAULT_PROPS.chemcolor), blood: toColor(DEFAULT_PROPS.bloodcolor) },
};
const opts = { quality: state.q, palette: state.palette, camera };

/* ---------- Modules ---------- */
const env = safe('createEnvironment', () => WW.createEnvironment(THREE, scene, opts), () => {
  scene.background = new THREE.Color(0x07100c);
  scene.fog = new THREE.FogExp2(0x0b1410, 0.06);
  scene.add(new THREE.HemisphereLight(0x3a4a5c, 0x081008, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffe4c8, 1.2);
  keyLight.position.set(4, 7, 5); keyLight.castShadow = true; scene.add(keyLight);
  const g = new THREE.Mesh(new THREE.CircleGeometry(20, 32), new THREE.MeshStandardMaterial({ color: 0x0c100f }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  return { update() {}, keyLight };
});

const wolf = safe('createWarwick', () => WW.createWarwick(THREE, opts), () => {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x55606c }));
  m.position.y = 1.3; root.add(m);
  return { root, update() {}, getHeadWorldPosition: v => v.set(0, 2.4, 0.5) };
});
wolf.root.rotation.y = -0.45;
scene.add(wolf.root);

const post = safe('createPost', () => WW.createPost(THREE, renderer, scene, camera, opts), () => ({
  render() { renderer.render(scene, camera); },
  setSize() {},
}));

/* ---------- Cadrage 21:9 ---------- */
const CAM_POS = new THREE.Vector3(1.7, 1.1, 8.6);
const CAM_TARGET = new THREE.Vector3(0, 1.55, 0);
let lensShift = 0, W = 0, H = 0;
function frame() {
  const aspect = W / H;
  camera.aspect = aspect;
  // Écran étroit (aperçu, portrait) : on élargit le champ pour garder Warwick entier.
  camera.fov = aspect >= 1.6 ? 28 : aspect >= 1.1 ? 34 : 50;
  // Décentrement : Warwick vers ~64 % de la largeur en 21:9, recentré quand l'écran s'étroitise.
  lensShift = THREE.MathUtils.clamp((aspect - 1.25) * 0.24, 0, 0.29);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] -= lensShift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
function resize() {
  W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
  const pr = DPR * state.q.scale;
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  post.setSize(W, H, pr);
  frame();
}
addEventListener('resize', resize);

function applyQuality(name) {
  const q = QUALITY[name] || QUALITY.high;
  if (q === state.q && W) return;
  const shadowsChanged = q.shadows !== state.q.shadows;
  state.q = opts.quality = q;
  renderer.shadowMap.enabled = q.shadows;
  if (env.keyLight && env.keyLight.shadow) {
    env.keyLight.castShadow = q.shadows;
    env.keyLight.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    if (env.keyLight.shadow.map) { env.keyLight.shadow.map.dispose(); env.keyLight.shadow.map = null; }
  }
  if (shadowsChanged) scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)); });
  for (const m of [env, wolf, post]) if (m.setQuality) try { m.setQuality(q); } catch (e) { console.error(e); }
  resize();
}

/* ---------- Scénario ---------- */
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env4 = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t));
const ev = { howl: -99, swipe: -99, flex: -99, growl: -99 };
let nextEvent = 6, huntTarget = 0, lastHuntTarget = 0, rngSeed = 7;
const rnd = () => ((rngSeed = (rngSeed * 16807) % 2147483647) / 2147483647);
function scheduleNext(reset) {
  const base = settings.eventinterval;
  nextEvent = (reset ? state.t : state.t) + base * (0.6 + rnd() * 0.8);
}
function trigger(name) {
  if (name === 'howl') ev.howl = state.t;
  else if (name === 'swipe') ev.swipe = state.t;
  else if (name === 'flex') ev.flex = state.t;
  else if (name === 'growl') ev.growl = state.t;
}
function busy() { return state.t - ev.howl < 5 || state.t - ev.swipe < 1.2 || state.t - ev.flex < 1.6; }
function updateScenario(dt) {
  const t = state.t;
  // Ambiance
  if (settings.mode === 'hunt') huntTarget = 1;
  else if (settings.mode === 'zaun') huntTarget = 0;
  else huntTarget = (t % 110) > 78 ? 1 : 0; // 78 s de chimie, 32 s de traque
  if (huntTarget && !lastHuntTarget) trigger('growl');
  lastHuntTarget = huntTarget;
  state.hunt += (huntTarget - state.hunt) * Math.min(1, dt * 0.8);

  // Animations spontanées
  if (settings.events && t > nextEvent && !busy()) {
    const r = rnd(), aggressive = state.hunt > 0.5;
    trigger(r < (aggressive ? 0.3 : 0.45) ? 'howl' : r < (aggressive ? 0.75 : 0.72) ? 'swipe' : 'flex');
    scheduleNext();
  }
  // Séquence du hurlement : il flaire (0–1,8 s) puis hurle (1,5–4,7 s)
  const th = t - ev.howl;
  state.sniff = env4(th, 0, 0.35, 1.4, 1.8);
  state.howl = env4(th - 1.5, 0, 0.5, 2.6, 3.2);
  const ts = t - ev.swipe;
  state.swipe = ts >= 0 && ts <= 1 ? ts : -1;
  state.flex = env4(t - ev.flex, 0, 0.25, 0.9, 1.4);
  state.growl = env4(t - ev.growl, 0, 0.2, 0.8, 1.3);
}

/* ---------- Pointeur ---------- */
const pointerRaw = { x: 0, y: 0 };
addEventListener('mousemove', e => {
  pointerRaw.x = (e.clientX / innerWidth) * 2 - 1;
  pointerRaw.y = (e.clientY / innerHeight) * 2 - 1;
});

/* ---------- Caméra vivante ---------- */
const tmpV = new THREE.Vector3(), lookAt = new THREE.Vector3();
function updateCamera(dt) {
  const t = state.t, k = Math.min(1, dt * 2.5);
  const px = settings.parallax ? pointerRaw.x : 0, py = settings.parallax ? pointerRaw.y : 0;
  state.pointer.x += (px - state.pointer.x) * k;
  state.pointer.y += (py - state.pointer.y) * k;
  const sway = settings.camerasway ? 1 : 0;
  camera.position.copy(CAM_POS);
  camera.position.x += sway * (Math.sin(t * 0.071) * 0.32 + Math.sin(t * 0.023) * 0.12) + state.pointer.x * 0.28;
  camera.position.y += sway * Math.sin(t * 0.053 + 1.3) * 0.1 - state.pointer.y * 0.12;
  camera.position.z += sway * Math.sin(t * 0.041 + 0.4) * 0.25;
  lookAt.copy(CAM_TARGET);
  lookAt.y += state.howl * 0.12;
  camera.lookAt(lookAt);
  // Tremblement du hurlement
  const shake = Math.max(0, state.howl - 0.45) * 0.018 + state.audio.beat * 0.004;
  if (shake > 0) {
    camera.position.x += (Math.sin(t * 43.1) + Math.sin(t * 71.7)) * shake;
    camera.position.y += (Math.sin(t * 52.3) + Math.sin(t * 87.9)) * shake;
  }
}

/* ---------- Boucle ---------- */
let last = performance.now(), lastDraw = 0, running = true;
if (bridge.onPause) bridge.onPause(p => {
  running = !p;
  if (running) { last = performance.now(); requestAnimationFrame(loop); }
});
function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);
  const limit = bridge.fpsLimit || 0;
  if (limit > 0 && now - lastDraw < 1000 / limit - 2) return;
  lastDraw = now;
  if (DEV) renderer.info.reset();
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  state.t += dt; state.dt = dt;

  bridge.update(dt);
  const react = settings.audioreact / 100, a = bridge.audio || {};
  for (const k of ['level', 'bass', 'mid', 'high', 'beat']) state.audio[k] = (a[k] || 0) * react;
  state.particles = (settings.particles / 100) * state.q.particles;

  updateScenario(dt);
  updateCamera(dt);
  try { wolf.update(state); } catch (e) { reportOnce('warwick', e); }
  try { wolf.root.updateMatrixWorld(); wolf.getHeadWorldPosition(state.headPos); } catch (e) { reportOnce('head', e); }
  try { env.update(state, camera); } catch (e) { reportOnce('environment', e); }
  try { post.render(state); } catch (e) { reportOnce('post', e); renderer.render(scene, camera); }
}
const reported = {};
function reportOnce(k, e) { if (!reported[k]) { reported[k] = 1; console.error('[ww] ' + k + '.update :', e); } }

/* ---------- Propriétés ---------- */
const settings = Object.assign({}, DEFAULT_PROPS);
const titleEl = document.getElementById('title');
bridge.onProps((p, changed) => {
  Object.assign(settings, p);
  if (!changed || changed.includes('quality')) applyQuality(settings.quality);
  state.bloom = settings.bloom / 100;
  state.palette.chem.setRGB(...settings.chemcolor);
  state.palette.blood.setRGB(...settings.bloodcolor);
  titleEl.hidden = !settings.showtitle;
  titleEl.style.setProperty('--chem', '#' + state.palette.chem.getHexString());
  if (changed && changed.includes('eventinterval')) scheduleNext(true);
});

applyQuality(settings.quality);
resize();
requestAnimationFrame(loop);

if (DEV) {
  window.__ww = {
    THREE, state, settings, scene, camera, renderer, trigger,
    advance(seconds) { state.t += seconds; },
    set(p) { Object.assign(settings, p); if (p.quality) applyQuality(p.quality); },
    stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs || []).length }; },
  };
}
})();
