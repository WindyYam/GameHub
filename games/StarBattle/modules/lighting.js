'use strict';

/* =====================================================================
   STEP 10 — IMAGE-BASED LIGHTING: the real sky (nebula, star, ringed giant, galaxy) is captured once into a
   cube map and pre-filtered (GGX) so every PBR surface gets physically plausible ambient light and reflections
   ===================================================================== */
(() => {
  const env = new THREE.Scene();
  const dome = SKY.dome.clone(); dome.position.set(0, 0, 0); env.add(dome);
  const stars = SKY.stars.clone(); stars.position.set(0, 0, 0); env.add(stars);
  const facing = src => { const m = new THREE.Mesh(src.geometry, src.material); m.scale.copy(src.scale); m.position.copy(src.position); m.renderOrder = src.renderOrder; m.lookAt(0, 0, 0); env.add(m); };
  facing(BG.sun); facing(BG.hole);
  env.add(BG.planetGroup.clone());
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false });
  const cc = new THREE.CubeCamera(1.5, 60000, rt);
  const keepAC = renderer.autoClear; renderer.autoClear = true;
  cc.update(renderer, env);
  renderer.autoClear = keepAC;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromCubemap(rt.texture).texture;
  pmrem.dispose(); rt.dispose();
  // pull every PBR surface that did not set its own value up to the sky-lit look
  scene.traverse(o => { const m = o.material; if (m && m.isMeshStandardMaterial && m.envMapIntensity === 1) m.envMapIntensity = 1.3; });
})();

window.__sb = { THREE, scene, camera, controls, finalUniforms, renderer, SHIPS, BG, BG_POS, CAM_HOME, explode, impact, fireBolt, FIRE, SMOKE, BOLTS, V3, ts: v => { timeScale = v; } };
frame();
setTimeout(() => document.getElementById('loading').classList.add('gone'), 400);
