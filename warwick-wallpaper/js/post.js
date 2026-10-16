/* Post-traitement : scène HDR (demi-flottants, MSAA), bloom, traînée anamorphique, étalonnage ACES + sRGB,
   aberration chromatique, vignette, grain, onde du hurlement, FXAA. Contrat : CONTRACT.md

   Chaîne (haute qualité, 3440×1440) :
     1. scène  -> rtScene   (HalfFloat linéaire, MSAA si WebGL2, sinon FXAA en fin de chaîne)
     2. bloom  -> passe haute (q.bloomRes) + 5 mips flous de THREE.UnrealBloomPass + composite (pleine taille du mip 0)
     3. traînée anamorphique -> 3 petites passes horizontales (¼ × ⅛ de l'écran)
     4. étalonnage -> écran (ou rtLDR puis FXAA -> écran)
   Plein écran : scène + résolution MSAA + étalonnage (+ FXAA). Tout le reste est à résolution réduite.

   En r128, la tonalisation dépend de renderer.toneMapping au moment où chaque matériau est compilé, et l'encodage
   de sortie d'une cible de rendu est celui de sa texture (linéaire). On compile donc la scène SANS tonalisation
   (renderer.toneMapping = NoToneMapping) et on applique ici exactement l'ACES filmique de three r128 (exposition
   comprise) puis la conversion sRGB. Sans demi-flottants : la scène est tonalisée et encodée par les matériaux
   (cible sRGB 8 bits) et cette passe n'applique que l'étalonnage. Si quoi que ce soit échoue : rendu direct.

   Réglages de développement (URL) : ?post=direct | neutral | nobloom | noaa | fxaa | ldr | heat
*/
(() => {
'use strict';
const WW = window.WW = window.WW || {};

WW.createPost = function (THREE, renderer, scene, camera, opts) {
  const DEBUG = (new URLSearchParams(location.search).get('post') || '').toLowerCase();
  const gl = renderer.getContext();
  const isGL2 = !!renderer.capabilities.isWebGL2;
  const maxSamples = isGL2 ? (renderer.capabilities.maxSamples || 4) : 0;
  const ORIG_TONEMAP = renderer.toneMapping !== THREE.NoToneMapping ? renderer.toneMapping : THREE.ACESFilmicToneMapping;
  const LUMA = 'const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);';

  let q = (opts && opts.quality) || { name: 'high', bloomRes: 0.5, msaa: 4 };
  let mode = 'direct';            // 'hdr' | 'ldr' | 'direct'
  let halfType = null;            // THREE.HalfFloatType si rendu possible
  let msaaOK = false;             // cible MSAA demi-flottante (ou 8 bits en ldr) possible
  let W = 0, H = 0, built = false, dirty = true, fails = 0, checked = false;
  let rtScene = null, rtLDR = null, rtStreakA = null, rtStreakB = null, bloom = null;
  let useMSAA = false, useFXAA = false, useStreak = false;
  const bufSize = new THREE.Vector2(), headV = new THREE.Vector3();
  let howlPrev = 0, waveT = -1;

  /* ---------- Diagnostic du matériel ---------- */
  function clearErrors() { for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++); }
  function probe(type, samples) {
    let rt = null, ok = false;
    try {
      const P = { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false };
      if (samples > 0) { rt = new THREE.WebGLMultisampleRenderTarget(8, 8, P); rt.samples = samples; }
      else rt = new THREE.WebGLRenderTarget(8, 8, P);
      clearErrors();
      renderer.setRenderTarget(rt);
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
    } catch (e) { ok = false; }
    try { renderer.setRenderTarget(null); if (rt) rt.dispose(); } catch (e) { /* rien */ }
    return ok;
  }

  try {
    if (DEBUG !== 'direct' && THREE.WebGLRenderTarget) {
      if (isGL2) renderer.extensions.get('EXT_color_buffer_float');
      else { renderer.extensions.get('OES_texture_half_float'); renderer.extensions.get('OES_texture_half_float_linear'); renderer.extensions.get('EXT_color_buffer_half_float'); }
      if (DEBUG !== 'ldr' && probe(THREE.HalfFloatType, 0)) { halfType = THREE.HalfFloatType; mode = 'hdr'; }
      else if (probe(THREE.UnsignedByteType, 0)) mode = 'ldr';
      if (mode !== 'direct' && isGL2 && THREE.WebGLMultisampleRenderTarget)
        msaaOK = probe(halfType || THREE.UnsignedByteType, Math.min(4, maxSamples));
    }
  } catch (e) { mode = 'direct'; }

  /* ---------- Quad plein écran ---------- */
  const fsQuad = THREE.FullScreenQuad ? new THREE.FullScreenQuad(null) : (() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    return { set material(m) { mesh.material = m; }, get material() { return mesh.material; }, render(r) { r.render(mesh, cam); }, dispose() { mesh.geometry.dispose(); } };
  })();
  function pass(mat, target) {
    fsQuad.material = mat;
    renderer.setRenderTarget(target);
    fsQuad.render(renderer);
  }
  const VS = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function mat(defs, uniforms, fs) {
    return new THREE.ShaderMaterial({ defines: defs, uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
  }

  /* ---------- Bloom : passe haute (genou doux, anti-lucioles) ---------- */
  const hpU = {
    tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) },
    uThreshold: { value: 1.0 }, uKnee: { value: 0.6 }, uClamp: { value: 14.0 },
  };
  const hpMat = mat({}, hpU, `
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold, uKnee, uClamp;
varying vec2 vUv;
vec3 tap(vec2 o){ vec3 c = texture2D(tDiffuse, vUv + o * uTexel).rgb; return min(c, vec3(uClamp)); }
void main(){
  // 4 lectures bilinéaires = moyenne 4×4 de la source : pas de scintillement des petits points lumineux
  vec3 c = 0.25 * (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  c *= max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c, 1.0);
}`);

  /* ---------- Traînée anamorphique (horizontale) ---------- */
  const stU = { tSrc: { value: null }, uStep: { value: 1 }, uDecay: { value: 0.3 }, uSrcTexel: { value: new THREE.Vector2(1, 1) }, uThr: { value: 2.5 } };
  const STREAK_FS = `
uniform sampler2D tSrc; uniform float uStep, uThr, uDecay; uniform vec2 uSrcTexel;
varying vec2 vUv;
vec3 fetch(vec2 uv){
#ifdef PREFILTER
  vec3 c = 0.5 * (texture2D(tSrc, uv + vec2(0.0, uSrcTexel.y)).rgb + texture2D(tSrc, uv - vec2(0.0, uSrcTexel.y)).rgb);
  float br = max(c.r, max(c.g, c.b));
  return c * (max(br - uThr, 0.0) / max(br, 1e-4));
#else
  return texture2D(tSrc, uv).rgb;
#endif
}
void main(){
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = -6; i <= 6; i++) {
    float fi = float(i), w = exp(-abs(fi) * uDecay);
    acc += fetch(vUv + vec2(fi * uStep, 0.0)) * w; ws += w;
  }
  gl_FragColor = vec4(acc / ws, 1.0);
}`;
  const streakPre = mat({ PREFILTER: 1 }, stU, STREAK_FS);
  const streakBlur = mat({}, stU, STREAK_FS);

  /* ---------- Étalonnage final ---------- */
  const gU = {
    tScene: { value: null }, tBloom: { value: null }, tStreak: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSeed: { value: new THREE.Vector2() },
    uExposure: { value: 1 }, uBloom: { value: 0 }, uBloomTint: { value: new THREE.Color(1, 1, 1) },
    uStreak: { value: 0 }, uStreakTint: { value: new THREE.Color(0.55, 0.72, 1.0) },
    uGrade: { value: 1 }, uHunt: { value: 0 }, uBlood: { value: new THREE.Color(1, 0.17, 0.17) },
    uCA: { value: 1 }, uVig: { value: 1 }, uGrain: { value: 1 },
    uHead: { value: new THREE.Vector2(0.64, 0.7) }, uWave: { value: new THREE.Vector3(0, 0, 0.05) }, uWave2: { value: new THREE.Vector3(0, 0, 0.05) },
    uWaveTint: { value: new THREE.Color(0.6, 0.78, 1.0) }, uHowl: { value: 0 },
  };
  const GRADE_FS = `
uniform sampler2D tScene, tBloom, tStreak;
uniform vec2 uRes, uSeed, uHead;
uniform float uTime, uExposure, uBloom, uStreak, uGrade, uHunt, uCA, uVig, uGrain, uHowl;
uniform vec3 uBloomTint, uStreakTint, uBlood, uWave, uWave2, uWaveTint;
varying vec2 vUv;
${LUMA}

// ACES filmique, identique à ACESFilmicToneMapping de three r128 (exposition comprise)
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 acesFilmic(vec3 color){
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

#ifdef HDR_INPUT
// Traque sanglante, en linéaire : verts désaturés, rouges poussés, teinte sang (luminance conservée)
vec3 huntGrade(vec3 col){
  float L = dot(col, LUMA);
  float gm = clamp((col.g - max(col.r, col.b)) / (col.g + 1e-3), 0.0, 1.0);
  vec3 hc = mix(col, vec3(L), gm * 0.9);
  float rm = clamp((col.r - max(col.g, col.b)) / (col.r + 1e-3), 0.0, 1.0);
  hc = max(mix(vec3(L), hc, 1.0 + 0.45 * rm), 0.0);
  vec3 bt = uBlood / max(max(uBlood.r, max(uBlood.g, uBlood.b)), 1e-3);
  hc *= mix(vec3(1.0), bt, 0.22);
  hc *= mix(1.0, L / max(dot(hc, LUMA), 1e-5), 0.8);
  return mix(col, hc, uHunt);
}
#endif
// Lumière de scène (linéaire HDR) -> affichage linéaire (ACES), puis sRGB
vec3 dispLin(vec3 col){
#ifdef HDR_INPUT
  if (uHunt > 0.001) col = huntGrade(col);
  return acesFilmic(col);
#else
  return clamp(col, 0.0, 1.0);
#endif
}
vec3 toDisplay(vec3 col){
#ifdef HDR_INPUT
  return linearToSRGB(dispLin(col));
#else
  return dispLin(col);
#endif
}
float encode1(float v){
#ifdef HDR_INPUT
  return v <= 0.0031308 ? v * 12.92 : pow(v, 0.41666) * 1.055 - 0.055;
#else
  return v;
#endif
}
// Un canal décalé de l'aberration chromatique, filtré bilinéairement APRÈS tonalisation : un filtrage
// matériel sur la scène HDR mélangerait un texel très lumineux à ses voisins sombres et donnerait des
// franges saturées sur les motifs fins (grilles).
float caTap(vec2 uv, vec3 mask, vec3 add, float gain){
  vec2 px = uv * uRes - 0.5;
  vec2 f = fract(px);
  vec2 b = (floor(px) + 0.5) / uRes;
  vec2 ix = vec2(1.0 / uRes.x, 0.0), iy = vec2(0.0, 1.0 / uRes.y);
  float a0 = encode1(dot(dispLin((texture2D(tScene, b).rgb + add) * gain), mask));
  float a1 = encode1(dot(dispLin((texture2D(tScene, b + ix).rgb + add) * gain), mask));
  float a2 = encode1(dot(dispLin((texture2D(tScene, b + iy).rgb + add) * gain), mask));
  float a3 = encode1(dot(dispLin((texture2D(tScene, b + ix + iy).rgb + add) * gain), mask));
  return mix(mix(a0, a1, f.x), mix(a2, a3, f.x), f.y);
}

void main(){
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv;

  // Onde du hurlement : anneau réfractif qui part de la tête
  // (deux fronts : l'onde principale et un écho plus faible)
  float ring = 0.0;
  if (uWave.y + uWave2.y > 0.0) {
    vec2 dh = (uv - uHead) * vec2(aspect, 1.0);
    float d = length(dh);
    float x1 = (d - uWave.x) / uWave.z, g1 = exp(-x1 * x1);
    float x2 = (d - uWave2.x) / uWave2.z, g2 = exp(-x2 * x2);
    ring = g1 * uWave.y + g2 * uWave2.y;
    float disp = x1 * g1 * uWave.y + x2 * g2 * uWave2.y;
    uv -= (dh / max(d, 1e-4)) / vec2(aspect, 1.0) * disp * 0.02;
  }

  vec3 add = uWaveTint * (ring * 0.075);
#ifdef BLOOM
  add += texture2D(tBloom, uv).rgb * uBloomTint * uBloom;
#endif
#ifdef STREAK
  add += texture2D(tStreak, uv).rgb * uStreakTint * uStreak;
#endif

  // Vignette (en lumière linéaire) : centrée sur Warwick, adoucie sous les icônes (haut gauche)
  vec2 vp = (vUv - vec2(0.57, 0.52)) * vec2(aspect / 1.55, 1.0);
  float vig = smoothstep(0.32, 1.22, length(vp));
  float icons = (1.0 - smoothstep(0.0, 0.48, vUv.x)) * smoothstep(0.42, 1.0, vUv.y);
  vig *= 1.0 - 0.5 * icons;
  vig += 0.22 * (1.0 - smoothstep(0.0, 0.22, vUv.y)) * (1.0 - icons);   // sol plus sombre, ancre le cadre
  float gain = (1.0 - uVig * clamp(vig, 0.0, 1.0) * 0.62) * (1.0 + ring * 0.6);

  vec3 c = toDisplay((texture2D(tScene, uv).rgb + add) * gain);

  // Aberration chromatique : seulement en périphérie (bords gauche/droit et coins du 21:9), quelques pixels au plus
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float pl = length(p);
  vec2 off = p / max(pl, 1e-4) * smoothstep(0.62, 1.35, pl) * (0.0034 * uCA) / vec2(aspect, 1.0)
           + (uv - uHead) * ring * 0.004;
  vec2 offPx = off * uRes;
  if (dot(offPx, offPx) > 0.1) {
    c.r = caTap(uv + off, vec3(1.0, 0.0, 0.0), add, gain);
    c.b = caTap(uv - off, vec3(0.0, 0.0, 1.0), add, gain);
  }

  // Étalonnage cinéma (espace perceptuel) : ombres sarcelle-vert, hautes lumières chaudes, courbe en S douce
  float Ls = dot(c, LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.5, Ls);
  float hi = smoothstep(0.42, 1.0, Ls);
  c *= mix(vec3(1.0), vec3(0.90, 1.015, 1.035), sh * uGrade);
  c *= mix(vec3(1.0), vec3(1.045, 1.012, 0.95), hi * uGrade);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.2 * uGrade + 0.12 * uHunt);
  float Lc = dot(c, LUMA);
  c = max(mix(vec3(Lc), c, 1.0 + 0.08 * uGrade), 0.0);
  // Traque : noirs écrasés
  float crush = 0.018 * uHunt;
  c = max(c - crush, 0.0) / (1.0 - crush);

  // Grain argentique fin (24 i/s), surtout dans les tons moyens ; sert aussi de tramage
  vec2 fc = gl_FragCoord.xy;
  float n = hash12(fc + uSeed) + hash12(fc.yx * 1.37 + uSeed.yx + 17.0) - 1.0;
  float Lg = dot(c, LUMA);
  c += n * (uGrain * (0.22 + 3.2 * Lg * (1.0 - Lg)) * 0.026 + 0.5 / 255.0);

#ifdef HEATMAP
  // Débogage (?post=heat) : luminance HDR de la scène — bleu <0,25, cyan <0,5, vert <1, jaune <2, rouge <4, blanc au-delà
  float hl = dot(texture2D(tScene, vUv).rgb, LUMA);
  c = hl < 0.25 ? vec3(0.0, 0.0, 0.3 + 2.8 * hl) : hl < 0.5 ? vec3(0.0, 0.8, 1.0) : hl < 1.0 ? vec3(0.0, 0.9, 0.2) : hl < 2.0 ? vec3(1.0, 0.9, 0.0) : hl < 4.0 ? vec3(1.0, 0.1, 0.0) : vec3(1.0);
#endif
  gl_FragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));
}`;
  let gradeMat = null, gradeKey = '';
  function gradeMaterial() {
    const key = [mode, useStreak, DEBUG].join('|');
    if (gradeMat && key === gradeKey) return gradeMat;
    if (gradeMat) gradeMat.dispose();
    const defs = { BLOOM: 1 };
    if (DEBUG === 'heat') defs.HEATMAP = 1;
    if (mode === 'hdr') defs.HDR_INPUT = 1;
    if (useStreak) defs.STREAK = 1;
    gradeMat = mat(defs, gU, GRADE_FS);
    gradeKey = key; checked = false;
    return gradeMat;
  }

  /* ---------- FXAA (luma dans l'alpha, pour que les arêtes rouges de la traque soient lissées aussi) ---------- */
  let fxaaMat = null;
  if (THREE.FXAAShader) {
    const fs = THREE.FXAAShader.fragmentShader
      .replace('#define FXAA_GREEN_AS_LUMA 1', '#define FXAA_GREEN_AS_LUMA 0')
      .replace('gl_FragColor.a = texture2D(tDiffuse, vUv).a;', 'gl_FragColor.a = 1.0;');
    fxaaMat = mat({}, { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } }, fs);
  }

  /* ---------- Cibles ---------- */
  function makeRT(w, h, o) {
    const P = Object.assign({ format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }, o);
    const rt = new THREE.WebGLRenderTarget(w, h, P);
    rt.texture.generateMipmaps = false;
    return rt;
  }
  function disposeTargets() {
    for (const rt of [rtScene, rtLDR, rtStreakA, rtStreakB]) if (rt) rt.dispose();
    rtScene = rtLDR = rtStreakA = rtStreakB = null;
    if (bloom) { bloom.dispose(); bloom = null; }
    built = false;
  }
  function build() {
    renderer.getDrawingBufferSize(bufSize);
    const w = Math.max(1, bufSize.x | 0), h = Math.max(1, bufSize.y | 0);
    const wantMSAA = DEBUG !== 'noaa' && DEBUG !== 'fxaa' && (q.msaa || 0) > 0 && msaaOK;
    const wantFXAA = DEBUG !== 'noaa' && !wantMSAA && !!fxaaMat && (DEBUG === 'fxaa' || q.name !== 'low');
    const samples = wantMSAA ? Math.max(1, Math.min(q.msaa, maxSamples)) : 0;
    const type = mode === 'hdr' ? halfType : THREE.UnsignedByteType;
    const enc = mode === 'hdr' ? THREE.LinearEncoding : THREE.sRGBEncoding;

    // Cible de scène : on la recrée si le type d'AA change, sinon simple redimensionnement
    const sceneOK = rtScene && !!rtScene.isWebGLMultisampleRenderTarget === wantMSAA && (!wantMSAA || rtScene.samples === samples);
    if (!sceneOK) {
      if (rtScene) rtScene.dispose();
      const P = { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false, encoding: enc };
      rtScene = wantMSAA ? new THREE.WebGLMultisampleRenderTarget(w, h, P) : new THREE.WebGLRenderTarget(w, h, P);
      if (wantMSAA) rtScene.samples = samples;
      rtScene.texture.generateMipmaps = false;
      rtScene.texture.encoding = enc;
    } else rtScene.setSize(w, h);
    useMSAA = wantMSAA;

    useFXAA = wantFXAA;
    if (useFXAA) { if (!rtLDR) rtLDR = makeRT(w, h, { type: THREE.UnsignedByteType }); else rtLDR.setSize(w, h); }
    else if (rtLDR) { rtLDR.dispose(); rtLDR = null; }

    // Bloom : THREE.UnrealBloomPass piloté à la main (sa passe de fusion plein écran est remplacée par l'étalonnage)
    const br = Math.min(1, Math.max(0.2, q.bloomRes || 0.5));
    const bw = Math.max(4, Math.round(w * br)), bh = Math.max(4, Math.round(h * br));
    if (!bloom && THREE.UnrealBloomPass) {
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(bw * 2, bh * 2), 1, 0.4, 1);
      const rts = [bloom.renderTargetBright].concat(bloom.renderTargetsHorizontal, bloom.renderTargetsVertical);
      for (const rt of rts) { rt.depthBuffer = false; rt.texture.type = type; }
      for (const m of bloom.separableBlurMaterials.concat([bloom.compositeMaterial])) { m.depthTest = false; m.depthWrite = false; }
      bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.85, 0.7, 0.55, 0.45];
    }
    if (bloom) bloom.setSize(bw * 2, bh * 2);
    hpU.uTexel.value.set(1 / w, 1 / h);

    useStreak = !!bloom && q.name !== 'low';
    const sw = Math.max(4, Math.round(w / 4)), sh = Math.max(4, Math.round(h / 8));
    if (useStreak) {
      if (!rtStreakA) { rtStreakA = makeRT(sw, sh, { type }); rtStreakB = makeRT(sw, sh, { type }); }
      else { rtStreakA.setSize(sw, sh); rtStreakB.setSize(sw, sh); }
      stU.uSrcTexel.value.set(1 / bw, 1 / bh);
    } else if (rtStreakA) { rtStreakA.dispose(); rtStreakB.dispose(); rtStreakA = rtStreakB = null; }

    if (fxaaMat) fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
    gU.uRes.value.set(w, h);
    W = w; H = h; built = true; dirty = false; checked = false;
    gradeMaterial();
  }

  /* ---------- Modes ---------- */
  function invalidateMaterials() {
    scene.traverse(o => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) for (let i = 0; i < m.length; i++) m[i].needsUpdate = true;
      else m.needsUpdate = true;
    });
  }
  function setMode(m) {
    const tm = m === 'hdr' ? THREE.NoToneMapping : ORIG_TONEMAP;
    mode = m;
    if (renderer.toneMapping !== tm) { renderer.toneMapping = tm; invalidateMaterials(); }
    if (m === 'direct') disposeTargets();
  }
  function degrade(e) {
    if (mode === 'direct') return;
    console.error('[post] post-traitement désactivé, rendu direct :', e);
    try { setMode('direct'); } catch (e2) { mode = 'direct'; }
  }
  setMode(mode);

  // Programmes de shaders invalides (pilote exotique) -> rendu direct plutôt qu'un écran noir
  function checkPrograms() {
    const mats = [gradeMat, hpMat];
    if (useStreak) mats.push(streakPre, streakBlur);
    if (useFXAA) mats.push(fxaaMat);
    if (bloom) mats.push(bloom.separableBlurMaterials[0], bloom.compositeMaterial);
    for (const m of mats) {
      const p = m && renderer.properties.get(m).currentProgram;
      if (p && p.diagnostics && p.diagnostics.runnable === false) return false;
    }
    checked = true;
    return true;
  }

  /* ---------- Brouillard : même rendu que le chemin direct ----------
     En r128, le brouillard des matériaux intégrés est mélangé APRÈS la tonalisation et l'encodage sRGB
     (fog_fragment suit encodings_fragment) : en rendu direct, scene.fog.color est donc une valeur d'affichage.
     Dans la scène linéaire on la remplace, le temps du rendu, par la lumière qui donne cette valeur après
     ACES + sRGB (inversion numérique, mise en cache). Les shaders du décor qui mélangent leur brouillard
     avant OUT ont leur propre uniforme et ne sont pas concernés. */
  const fogSave = new THREE.Color(), bgSave = new THREE.Color();
  const fogKey = new THREE.Color(-1, -1, -1), fogLin = new THREE.Color(), bgKey = new THREE.Color(-1, -1, -1), bgLin = new THREE.Color();
  let fogKeyE = -1, bgKeyE = -1;
  const acesOut = [0, 0, 0];
  const fit = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function acesJS(r, g, b, e) {
    r *= e / 0.6; g *= e / 0.6; b *= e / 0.6;
    const ir = fit(0.59719 * r + 0.35458 * g + 0.04823 * b);
    const ig = fit(0.07600 * r + 0.90834 * g + 0.01566 * b);
    const ib = fit(0.02840 * r + 0.13383 * g + 0.83777 * b);
    acesOut[0] = clamp01(1.60475 * ir - 0.53108 * ig - 0.07367 * ib);
    acesOut[1] = clamp01(-0.10208 * ir + 1.10813 * ig - 0.00605 * ib);
    acesOut[2] = clamp01(-0.00327 * ir - 0.07276 * ig + 1.07602 * ib);
  }
  const srgbToLin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  function displayToScene(src, out, e) {
    const tr = srgbToLin(clamp01(src.r)), tg = srgbToLin(clamp01(src.g)), tb = srgbToLin(clamp01(src.b));
    let r = tr, g = tg, b = tb;
    for (let i = 0; i < 10; i++) {               // Newton, pente diagonale estimée par différences finies
      acesJS(r, g, b, e);
      const fr = acesOut[0], fg = acesOut[1], fb = acesOut[2], h = 1e-4 + 1e-3 * Math.max(r, g, b);
      acesJS(r + h, g, b, e); const sr = Math.max(0.02, (acesOut[0] - fr) / h);
      acesJS(r, g + h, b, e); const sg = Math.max(0.02, (acesOut[1] - fg) / h);
      acesJS(r, g, b + h, e); const sb = Math.max(0.02, (acesOut[2] - fb) / h);
      r = Math.min(8, Math.max(0, r + (tr - fr) / sr));
      g = Math.min(8, Math.max(0, g + (tg - fg) / sg));
      b = Math.min(8, Math.max(0, b + (tb - fb) / sb));
    }
    out.setRGB(r, g, b);
  }
  function beginLinearFog() {
    const e = renderer.toneMappingExposure;
    const fog = scene.fog;
    if (fog && fog.color) {
      fogSave.copy(fog.color);
      if (!fogKey.equals(fog.color) || fogKeyE !== e) { fogKey.copy(fog.color); fogKeyE = e; displayToScene(fog.color, fogLin, e); }
      fog.color.copy(fogLin);
    }
    const bg = scene.background;
    if (bg && bg.isColor) {
      bgSave.copy(bg);
      if (!bgKey.equals(bg) || bgKeyE !== e) { bgKey.copy(bg); bgKeyE = e; displayToScene(bg, bgLin, e); }
      bg.copy(bgLin);
    }
  }
  function endLinearFog() {
    if (scene.fog && scene.fog.color) scene.fog.color.copy(fogSave);
    if (scene.background && scene.background.isColor) scene.background.copy(bgSave);
  }

  /* ---------- Rendu ---------- */
  const DIR_X = THREE.UnrealBloomPass ? THREE.UnrealBloomPass.BlurDirectionX : new THREE.Vector2(1, 0);
  const DIR_Y = THREE.UnrealBloomPass ? THREE.UnrealBloomPass.BlurDirectionY : new THREE.Vector2(0, 1);

  function renderBloom(radius) {
    hpU.tDiffuse.value = rtScene.texture;
    pass(hpMat, bloom.renderTargetBright);
    let input = bloom.renderTargetBright;
    for (let i = 0; i < bloom.nMips; i++) {
      const m = bloom.separableBlurMaterials[i];
      m.uniforms.colorTexture.value = input.texture;
      m.uniforms.direction.value = DIR_X;
      pass(m, bloom.renderTargetsHorizontal[i]);
      m.uniforms.colorTexture.value = bloom.renderTargetsHorizontal[i].texture;
      m.uniforms.direction.value = DIR_Y;
      pass(m, bloom.renderTargetsVertical[i]);
      input = bloom.renderTargetsVertical[i];
    }
    const cu = bloom.compositeMaterial.uniforms;
    cu.bloomStrength.value = 1;
    cu.bloomRadius.value = radius;
    pass(bloom.compositeMaterial, bloom.renderTargetsHorizontal[0]);
  }
  function renderStreak() {
    const sw = rtStreakA.width;
    stU.tSrc.value = bloom.renderTargetBright.texture;
    stU.uStep.value = 1 / sw; stU.uDecay.value = 0.3;
    pass(streakPre, rtStreakA);
    stU.tSrc.value = rtStreakA.texture; stU.uStep.value = 4 / sw; stU.uDecay.value = 0.4;
    pass(streakBlur, rtStreakB);
    stU.tSrc.value = rtStreakB.texture; stU.uStep.value = 12 / sw; stU.uDecay.value = 0.55;
    pass(streakBlur, rtStreakA);
  }

  // Front d'onde : rayon (en hauteurs d'écran), amplitude, épaisseur
  function setWave(v, k, amp) {
    if (k < 0) { v.y = 0; return; }
    const fade = 1 - Math.min(1, k / 2.4);
    v.set(0.04 + k * 0.62, amp * Math.min(1, k / 0.12) * fade * fade, 0.05 + k * 0.05);
  }

  function renderPost(state) {
    renderer.getDrawingBufferSize(bufSize);
    if (dirty || !built || bufSize.x !== W || bufSize.y !== H) build();
    const neutral = DEBUG === 'neutral';
    const t = state.t || 0, dt = state.dt || 0;
    const au = state.audio || {}, hunt = state.hunt || 0, howl = state.howl || 0;
    const blood = state.palette && state.palette.blood;
    if (blood) gU.uBlood.value.copy(blood);

    // 1. Scène
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(rtScene);
    if (mode === 'hdr') {
      beginLinearFog();
      try { renderer.render(scene, camera); } finally { endLinearFog(); }
    } else renderer.render(scene, camera);
    renderer.autoClear = false;

    // Onde du hurlement (temps de la scène, donc indépendant des FPS)
    if (howl > 0.06 && howlPrev <= 0.06) waveT = 0;
    howlPrev = howl;
    if (waveT >= 0) { waveT += dt; if (waveT > 2.6) waveT = -1; }
    headV.copy(state.headPos || headV).project(camera);
    if (headV.z < 1) gU.uHead.value.set(headV.x * 0.5 + 0.5, headV.y * 0.5 + 0.5);
    setWave(gU.uWave.value, neutral ? -1 : waveT, 1);
    setWave(gU.uWave2.value, neutral || waveT < 0 ? -1 : waveT - 0.32, 0.45);
    gU.uWaveTint.value.setRGB(0.6, 0.78, 1.0).lerp(gU.uBlood.value, hunt);

    // 2. Bloom
    const bloomUser = neutral || DEBUG === 'nobloom' ? 0 : Math.max(0, state.bloom == null ? 0.6 : state.bloom);
    const bloomAmt = bloomUser * (1 + 0.85 * howl + 0.3 * hunt + 0.7 * (au.bass || 0) + 0.25 * (au.beat || 0));
    const doBloom = !!bloom && bloomAmt > 0.002;
    if (doBloom) {
      const hdr = mode === 'hdr';
      hpU.uThreshold.value = hdr ? 0.85 - 0.12 * howl : 0.72;
      hpU.uKnee.value = hdr ? 0.55 : 0.18;
      hpU.uClamp.value = hdr ? 16 : 1;
      renderBloom(0.35 + 0.25 * howl);
      if (useStreak) {
        stU.uThr.value = hdr ? 1.2 : 0.7;
        renderStreak();
      }
    }
    gU.tScene.value = rtScene.texture;
    gU.tBloom.value = bloom ? bloom.renderTargetsHorizontal[0].texture : rtScene.texture;
    gU.tStreak.value = rtStreakA ? rtStreakA.texture : rtScene.texture;
    gU.uBloom.value = doBloom ? bloomAmt * 0.4 : 0;
    gU.uStreak.value = doBloom && useStreak ? bloomUser * 1.1 * (1 + 0.3 * howl) : 0;
    gU.uBloomTint.value.setRGB(1, 1, 1).lerp(gU.uBlood.value, hunt * 0.25);
    gU.uStreakTint.value.setRGB(0.5, 0.7, 1.0).lerp(gU.uBlood.value, hunt * 0.8);

    // 3. Étalonnage
    gU.uExposure.value = renderer.toneMappingExposure * (1 - 0.04 * hunt);
    gU.uGrade.value = neutral ? 0 : 1;
    gU.uHunt.value = neutral ? 0 : hunt;
    gU.uCA.value = neutral ? 0 : 1 + 0.5 * howl;
    gU.uVig.value = neutral ? 0 : 1 + 0.15 * hunt;
    gU.uGrain.value = neutral ? 0 : Math.sqrt(Math.min(1, q.scale || 1));   // grain plus discret quand l'image est agrandie
    gU.uHowl.value = howl;
    gU.uTime.value = t;
    const f = Math.floor(t * 24);
    gU.uSeed.value.set((f * 37) % 211, (f * 61) % 223);

    const gm = gradeMat || gradeMaterial();   // reconstruit dans build() seulement (pas d'allocation par image)
    if (useFXAA) {
      pass(gm, rtLDR);
      fxaaMat.uniforms.tDiffuse.value = rtLDR.texture;
      pass(fxaaMat, null);
    } else pass(gm, null);
    renderer.autoClear = oldAutoClear;
    if (!checked && !checkPrograms()) degrade(new Error('shader de post-traitement invalide'));
  }

  const api = {
    render(state) {
      if (mode === 'direct') { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      try { renderPost(state); fails = 0; }
      catch (e) {
        renderer.autoClear = true;
        if (++fails >= 2) degrade(e);
        try { renderer.setRenderTarget(null); renderer.render(scene, camera); } catch (e2) { /* rien */ }
      }
    },
    setSize(w, h, pixelRatio) { dirty = true; },
    setQuality(nq) { if (nq) { q = nq; dirty = true; } },
    dispose() { disposeTargets(); },
    get mode() { return mode; },
    debugWave(k) { waveT = k; howlPrev = 1; },
    get debug() { return { uniforms: gU, waveT, useMSAA, useFXAA, useStreak, W, H }; },
  };
  if (new URLSearchParams(location.search).has('dev')) window.__wwPost = api;
  return api;
};
})();
