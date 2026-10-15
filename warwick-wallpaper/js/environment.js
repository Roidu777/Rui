/* Décor de Zaun — lumières, brouillard, sol, tuyaux, particules (graine v1 ; à enrichir). Contrat : CONTRACT.md */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
WW.createEnvironment = function (THREE, scene, opts) {
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  scene.background = new THREE.Color(0x070b0a);
  scene.fog = new THREE.FogExp2(0x0b1410, 0.06);

  const hemi = new THREE.HemisphereLight(0x3a4a5c, 0x081008, 0.45); scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xffe4c8, 1.2);
  keyLight.position.set(4, 7, 5); keyLight.castShadow = true;
  Object.assign(keyLight.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2, near: 1, far: 20 });
  keyLight.shadow.bias = -0.0008; scene.add(keyLight);
  const rimGreen = new THREE.PointLight(0x6cff3a, 3.2, 9, 1.6); rimGreen.position.set(0.5, 2.2, -3); scene.add(rimGreen);
  const rimRed = new THREE.PointLight(0xff3040, 2.2, 10, 1.6); rimRed.position.set(-3.5, 2.6, -1.2); scene.add(rimRed);

  const metal = new THREE.MeshStandardMaterial({ color: 0x5a6168, metalness: 0.85, roughness: 0.35, flatShading: true });
  const chem = new THREE.MeshStandardMaterial({ color: 0x6cff3a, emissive: 0x46ff1c, emissiveIntensity: 1.4 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x0b0f0e, roughness: 0.85, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grate = new THREE.GridHelper(40, 80, 0x1f2b26, 0x1a2420); grate.position.y = 0.002; scene.add(grate);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (0.55 + 0.9 * (i / 11)) + (rnd() - 0.5) * 0.2, d = 7 + rnd() * 5, r = 0.25 + rnd() * 0.4;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 14, 10), metal); p.position.set(x, 7, z); p.castShadow = true; scene.add(p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.04, 0.05, 6, 16), chem); ring.position.set(x, 1 + rnd() * 5, z); ring.rotation.x = Math.PI / 2; scene.add(ring);
  }
  const N = 900, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, d = 1 + rnd() * 10; pos.set([Math.cos(a) * d, rnd() * 7, Math.sin(a) * d], i * 3); spd[i] = 0.1 + rnd() * 0.35; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0x7cff4f, size: 0.05, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(geo, pMat));
  const red = new THREE.Color(), fogA = new THREE.Color(0x0b1410), fogB = new THREE.Color(0x1a0507);

  function update(state) {
    const dt = state.dt, h = state.hunt;
    geo.setDrawRange(0, Math.floor(N * Math.min(1, state.particles)));
    for (let i = 0; i < N; i++) { pos[i * 3 + 1] += spd[i] * dt * (1 + h * 0.6); if (pos[i * 3 + 1] > 7) pos[i * 3 + 1] = 0; }
    geo.attributes.position.needsUpdate = true;
    pMat.color.copy(state.palette.chem).lerp(state.palette.blood, h);
    chem.color.copy(state.palette.chem); chem.emissive.copy(state.palette.chem);
    rimGreen.color.copy(state.palette.chem);
    rimRed.intensity = 2.2 + h * 4 + state.howl * 2;
    rimGreen.intensity = 3.2 * (1 - h * 0.6) + state.audio.bass * 3;
    scene.fog.color.copy(fogA).lerp(fogB, h);
    scene.background.copy(scene.fog.color).multiplyScalar(0.7);
  }
  return { update, keyLight };
};
})();
