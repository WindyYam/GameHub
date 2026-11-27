/**
 * LandStranding Main Bootstrap, HDR MSAA Post-Processing Pipeline,
 * Third-Person Camera, Input Controller, HUD Wiring & Verification API.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { clamp, mix } from './noise.js';
import {
  DEFAULT_SEED_STR,
  setWorldSeed,
  getWorldSeed,
  getCellFeatures,
  getTerrainHeight,
  getRiverCaveState,
  findSpawnPosition
} from './world.js';
import { createTextureLibrary } from './textures.js';
import { ATMO_UNIFORMS, createSkyDome, createEnvironmentController } from './atmosphere.js';
import { createWeatherFX } from './weather_fx.js';
import { createTerrainSystem } from './terrain.js';
import { createWaterSystem } from './water.js';
import { createLandmarkSystem } from './landmarks.js';
import { createPorter } from './character.js';
import { createAudioSystem } from './audio.js';

// 1. Renderer & Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.35, 16000);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// 2. Optimized HalfFloat 2x MSAA HDR Post-Processing Composer + Half-Res Bloom
const rtW = Math.max(1, Math.floor(window.innerWidth * dpr));
const rtH = Math.max(1, Math.floor(window.innerHeight * dpr));
const msaaTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
  type: THREE.HalfFloatType,
  samples: 2
});

const composer = new EffectComposer(renderer, msaaTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(Math.max(1, Math.floor(window.innerWidth * 0.5)), Math.max(1, Math.floor(window.innerHeight * 0.5))),
  0.22,
  0.34,
  1.15
);
composer.addPass(bloomPass);

// Stephen Hill ACES Filmic Resolve + Nordic Photographic Grading + Vignette + IGN Dither + sRGB
const resolvePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.05 },
    uNightFactor: ATMO_UNIFORMS.uNightFactor,
    uAspect: { value: window.innerWidth / Math.max(window.innerHeight, 1) }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uNightFactor;
    uniform float uAspect;
    varying vec2 vUv;

    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }

    vec3 tmACES(vec3 color) {
      const mat3 ACES_IN = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777)
      );
      const mat3 ACES_OUT = mat3(
        vec3(1.60475, -0.10208, -0.00327),
        vec3(-0.53108, 1.10813, -0.07276),
        vec3(-0.07367, -0.00605, 1.07602)
      );
      return clamp(ACES_OUT * RRTAndODTFit(ACES_IN * (color / 0.6)), 0.0, 1.0);
    }

    float ignDither(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
      c = tmACES(c);

      // Photographic Icelandic filmic contrast (rich deep volcanic blacks + crisp earthy olive moss + cool slate shadows)
      c = pow(max(c, vec3(0.0)), vec3(1.07));
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.16);
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, mix(1.04, 1.08, uNightFactor));
      c = mix(c * vec3(0.95, 0.98, 1.03), c, smoothstep(0.0, 0.42, luma));

      vec2 uvC = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = 1.0 - dot(uvC, uvC) * 0.28;
      c *= clamp(vig, 0.64, 1.0);

      c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
      c += (ignDither(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `
});
composer.addPass(resolvePass);

// 3. World Systems Initialization (100% Pure Procedural — Every Seed Uses Same Generator)
setWorldSeed(DEFAULT_SEED_STR);
const texLib = createTextureLibrary();
const skyDome = createSkyDome();
scene.add(skyDome.mesh);

const envCtrl = createEnvironmentController(scene, renderer, skyDome);
const weatherFX = createWeatherFX(scene);
const terrainSys = createTerrainSystem(texLib, scene);
const waterSys = createWaterSystem(texLib, scene);
const landmarkSys = createLandmarkSystem(texLib, scene);
const audioSys = createAudioSystem();

const porter = createPorter(scene, (surface, sprint) => {
  audioSys.playFootstep(surface, sprint);
});

// 4. Camera State & Gimbal-Stabilized Third-Person Over-Shoulder Framing
const camState = {
  yaw: 0.0,
  pitch: 0.08,
  distance: 7.4,
  smoothYaw: 0.0,
  smoothPitch: 0.08,
  smoothDist: 7.4,
  smoothFloorLift: 0.0,
  target: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  customOverride: false
};

function resetVista() {
  camState.customOverride = false;
  const sp = findSpawnPosition();
  // Porter faces forward into the valley vista; camera sits squarely aligned behind over right shoulder
  porter.placeAt(sp.x, sp.z, sp.yaw);
  camState.yaw = sp.yaw + Math.PI;
  camState.pitch = 0.08;
  camState.distance = 7.4;
  syncCameraImmediate();
}

function syncCameraImmediate() {
  const p = porter.state.pos;
  camState.smoothYaw = camState.yaw;
  camState.smoothPitch = camState.pitch;
  camState.smoothDist = camState.distance;
  camState.smoothFloorLift = 0.0;

  // Tight, aligned third-person shoulder pivot directly centered on the porter's upper back/shoulders
  const rightX = Math.cos(camState.smoothYaw);
  const rightZ = -Math.sin(camState.smoothYaw);
  const lookX = p.x + rightX * 0.42;
  const lookY = p.y + 1.56;
  const lookZ = p.z + rightZ * 0.42;
  camState.target.set(lookX, lookY, lookZ);

  const cp = Math.cos(camState.smoothPitch);
  const sp = Math.sin(camState.smoothPitch);
  const offsetX = Math.sin(camState.smoothYaw) * cp * camState.smoothDist;
  const offsetY = sp * camState.smoothDist + 0.24;
  const offsetZ = Math.cos(camState.smoothYaw) * cp * camState.smoothDist;

  camState.pos.set(lookX + offsetX, lookY + offsetY, lookZ + offsetZ);
  const floorY = getTerrainHeight(camState.pos.x, camState.pos.z) + 0.85;
  if (camState.pos.y < floorY) {
    camState.smoothFloorLift = floorY - camState.pos.y;
    camState.pos.y = floorY;
  }

  camera.position.copy(camState.pos);
  // Look cleanly through the character's aligned shoulder pivot while keeping towering snow peaks framed above!
  camera.lookAt(lookX, lookY + 0.56 + camState.smoothFloorLift * 0.45, lookZ);
}

// Initial world build around procedural spawn
resetVista();
terrainSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
waterSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
landmarkSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
porter.placeAt(porter.state.pos.x, porter.state.pos.z, porter.state.yaw);
syncCameraImmediate();

// 5. Input Handling
const input = { forward: false, backward: false, left: false, right: false, sprint: false, jump: false };
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function ensureAudioStarted() {
  audioSys.init();
}

window.addEventListener('keydown', (e) => {
  ensureAudioStarted();
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') input.forward = true;
  if (k === 's' || e.key === 'ArrowDown') input.backward = true;
  if (k === 'a' || e.key === 'ArrowLeft') input.left = true;
  if (k === 'd' || e.key === 'ArrowRight') input.right = true;
  if (e.key === 'Shift') input.sprint = true;
  if (e.code === 'Space') input.jump = true;
  if (k === 'q') {
    porter.triggerScan();
    audioSys.playOdradekChime();
  }
  if (k === 'v') {
    resetVista();
  }
  if (k === 'h') {
    document.getElementById('hud').classList.toggle('hidden');
  }
  if (k === 'm') {
    const muted = audioSys.toggleMute();
    document.getElementById('btn-audio').textContent = muted ? 'Audio: Muted' : 'Audio: On';
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') input.forward = false;
  if (k === 's' || e.key === 'ArrowDown') input.backward = false;
  if (k === 'a' || e.key === 'ArrowLeft') input.left = false;
  if (k === 'd' || e.key === 'ArrowRight') input.right = false;
  if (e.key === 'Shift') input.sprint = false;
  if (e.code === 'Space') input.jump = false;
});

container.addEventListener('pointerdown', (e) => {
  ensureAudioStarted();
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  camState.customOverride = false;
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  camState.yaw -= dx * 0.0055;
  camState.pitch = clamp(camState.pitch + dy * 0.0045, -0.35, 1.05);
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

container.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camState.distance = clamp(camState.distance + e.deltaY * 0.01, 2.4, 24.0);
  },
  { passive: false }
);

// 6. HUD Bindings
const elHud = document.getElementById('hud');
const elTelemetry = document.getElementById('telemetry');
const elPanel = document.getElementById('env-panel');
const elSlTime = document.getElementById('sl-time');
const elLblTime = document.getElementById('lbl-time');
const elBtnCycle = document.getElementById('btn-cycle');
const elBtnAurora = document.getElementById('btn-aurora');
const elBtnAudio = document.getElementById('btn-audio');
const elNeedle = document.getElementById('compass-needle');

function formatClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function refreshHudControls() {
  elSlTime.value = envCtrl.state.timeOfDay;
  elLblTime.textContent = formatClock(envCtrl.state.timeOfDay);
  elBtnCycle.textContent = envCtrl.state.timeSpeed > 0 ? 'Cycling' : 'Paused';
  elBtnCycle.classList.toggle('active', envCtrl.state.timeSpeed > 0);
  elBtnAurora.textContent = `Aurora: ${envCtrl.state.auroraMode.toUpperCase()}`;
  elBtnAurora.classList.toggle('active', envCtrl.state.auroraMode === 'on');

  document.querySelectorAll('#wx-btns button').forEach((b) => {
    b.classList.toggle('active', b.dataset.wxSet === envCtrl.state.weather);
  });
}

document.getElementById('btn-env').addEventListener('click', () => {
  elPanel.classList.toggle('collapsed');
});
document.getElementById('btn-vista').addEventListener('click', resetVista);
document.getElementById('btn-hide-hud').addEventListener('click', () => elHud.classList.toggle('hidden'));
elBtnAudio.addEventListener('click', () => {
  ensureAudioStarted();
  const muted = audioSys.toggleMute();
  elBtnAudio.textContent = muted ? 'Audio: Muted' : 'Audio: On';
});

elSlTime.addEventListener('input', (e) => {
  envCtrl.setTimeOfDay(parseFloat(e.target.value));
  refreshHudControls();
});

document.querySelectorAll('[data-time]').forEach((btn) => {
  btn.addEventListener('click', () => {
    envCtrl.setTimeOfDay(parseFloat(btn.dataset.time));
    if (btn.dataset.wx) envCtrl.setWeather(btn.dataset.wx);
    if (btn.dataset.aurora) envCtrl.setAuroraMode(btn.dataset.aurora);
    else envCtrl.setAuroraMode('auto');
    refreshHudControls();
  });
});

elBtnCycle.addEventListener('click', () => {
  envCtrl.state.timeSpeed = envCtrl.state.timeSpeed > 0 ? 0 : 60;
  refreshHudControls();
});

elBtnAurora.addEventListener('click', () => {
  const order = ['auto', 'on', 'off'];
  const next = order[(order.indexOf(envCtrl.state.auroraMode) + 1) % order.length];
  envCtrl.setAuroraMode(next);
  refreshHudControls();
});

document.querySelectorAll('#wx-btns button').forEach((btn) => {
  btn.addEventListener('click', () => {
    envCtrl.setWeather(btn.dataset.wxSet);
    refreshHudControls();
  });
});

function switchWorldSeed(seedStr) {
  setWorldSeed(seedStr);
  resetVista();
  terrainSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
  waterSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
  landmarkSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
  porter.placeAt(porter.state.pos.x, porter.state.pos.z, porter.state.yaw);
  syncCameraImmediate();
}

function teleportToFeature(kind) {
  const f = getCellFeatures(0, 0);
  if (kind === 'village' && f.village) {
    const vx = f.village.x - Math.sin(f.village.yaw) * 44;
    const vz = f.village.z - Math.cos(f.village.yaw) * 44;
    const lookYaw = Math.atan2(f.village.x - vx, f.village.z - vz);
    camState.customOverride = false;
    porter.placeAt(vx, vz, lookYaw);
    camState.yaw = lookYaw + Math.PI;
    camState.pitch = 0.14;
    terrainSys.update(vx, vz, true);
    waterSys.update(vx, vz);
    landmarkSys.update(vx, vz);
    porter.placeAt(vx, vz, lookYaw);
    syncCameraImmediate();
  } else if (kind === 'waterfall' && f.waterfall) {
    const wf = f.waterfall;
    const wx = wf.plungeX + wf.nx * 78;
    const wz = wf.plungeZ + wf.nz * 78;
    const lookYaw = Math.atan2(wf.x - wx, wf.z - wz);
    camState.customOverride = false;
    porter.placeAt(wx, wz, lookYaw);
    camState.yaw = lookYaw + Math.PI;
    camState.pitch = 0.08;
    terrainSys.update(wx, wz, true);
    waterSys.update(wx, wz);
    landmarkSys.update(wx, wz);
    porter.placeAt(wx, wz, lookYaw);
    syncCameraImmediate();
  }
}

const btnSeedRand = document.getElementById('btn-seed-rand');
if (btnSeedRand) {
  btnSeedRand.addEventListener('click', () => {
    const prefixes = ['FJORD', 'VIK', 'REYKJA', 'SKOGA', 'KATLA', 'HEKLA', 'SNÆFELL', 'EYJA'];
    const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
    const tag = `${pref}-${Math.floor(100 + Math.random() * 899)}`;
    switchWorldSeed(tag);
  });
}
const btnVisitVillage = document.getElementById('btn-visit-village');
if (btnVisitVillage) btnVisitVillage.addEventListener('click', () => teleportToFeature('village'));
const btnVisitWaterfall = document.getElementById('btn-visit-waterfall');
if (btnVisitWaterfall) btnVisitWaterfall.addEventListener('click', () => teleportToFeature('waterfall'));

// 7. Resize Handler
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
  resolvePass.uniforms.uAspect.value = w / h;
});

// 8. Main Animation Loop
let lastTimeMs = performance.now();
let telemetryTick = 0;
let lastHudWeather = '';
refreshHudControls();

function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastTimeMs) / 1000, 0.05);
  lastTimeMs = nowMs;

  porter.update(dt, input, camState.yaw, terrainSys, landmarkSys);

  const px = porter.state.pos.x;
  const pz = porter.state.pos.z;

  terrainSys.update(px, pz, false);
  waterSys.update(px, pz);
  landmarkSys.update(px, pz);
  envCtrl.update(dt, porter.state.pos);
  weatherFX.update(camera, envCtrl.curWx.rainIntensity, porter.state.pos, dt);
  audioSys.update(
    porter.state.pos,
    waterSys.getWaterfallPositions(),
    envCtrl.curWx.windStrength,
    envCtrl.curWx.rainIntensity,
    ATMO_UNIFORMS.uAuroraStrength.value
  );

  if (!camState.customOverride) {
    // Exponential frame-rate-independent gimbal smoothing (prevents horizon bobbing over moss hummocks & uneven slopes!)
    const rotAlpha = 1.0 - Math.exp(-16.0 * dt);
    camState.smoothYaw = mix(camState.smoothYaw, camState.yaw, rotAlpha);
    camState.smoothPitch = mix(camState.smoothPitch, camState.pitch, rotAlpha);

    const rightX = Math.cos(camState.smoothYaw);
    const rightZ = -Math.sin(camState.smoothYaw);
    const targetLookX = px + rightX * 0.42;
    const targetLookY = porter.state.pos.y + 1.56;
    const targetLookZ = pz + rightZ * 0.42;

    // Responsive XZ follow + heavily damped gimbal vertical Y follow (filters out high-frequency moss pillow bumps!)
    const fXZ = 1.0 - Math.exp(-11.0 * dt);
    const yDelta = Math.abs(targetLookY - camState.target.y);
    // Stay silky slow on small ±0.6m moss bumps, accelerate smoothly only on large climbs/jumps (>1.4m)
    const yRate = porter.state.grounded ? mix(2.4, 6.0, clamp((yDelta - 0.35) / 1.4, 0, 1)) : 5.2;
    const fY = 1.0 - Math.exp(-yRate * dt);

    camState.target.x = mix(camState.target.x, targetLookX, fXZ);
    camState.target.y = mix(camState.target.y, targetLookY, fY);
    camState.target.z = mix(camState.target.z, targetLookZ, fXZ);

    const cp = Math.cos(camState.smoothPitch);
    const sp = Math.sin(camState.smoothPitch);
    const rayX = Math.sin(camState.smoothYaw) * cp;
    const rayZ = Math.cos(camState.smoothYaw) * cp;

    // Spring-arm terrain clearance: check along the camera boom so uphill terrain smoothly shortens boom instead of pitching horizon down!
    let targetDist = camState.distance;
    const caveCheck = getRiverCaveState(
      camState.target.x + rayX * targetDist,
      camState.target.z + rayZ * targetDist,
      porter.state.pos.y
    );

    if (!caveCheck.inCave) {
      for (let s = 1; s <= 4; s++) {
        const dTest = (s / 4) * camState.distance;
        const tx = camState.target.x + rayX * dTest;
        const tz = camState.target.z + rayZ * dTest;
        const ty = camState.target.y + sp * dTest + 0.24;
        const gH = getTerrainHeight(tx, tz) + 0.65;
        if (ty < gH && dTest > 2.2) {
          // Gently pull camera slightly closer when a steep hill rises directly behind the player
          const pull = clamp((gH - ty) * 0.65, 0, camState.distance - 2.6);
          targetDist = Math.min(targetDist, Math.max(2.6, camState.distance - pull));
        }
      }
    }

    const distAlpha = 1.0 - Math.exp(-(targetDist < camState.smoothDist ? 9.0 : 3.5) * dt);
    camState.smoothDist = mix(camState.smoothDist, targetDist, distAlpha);

    const desiredX = camState.target.x + rayX * camState.smoothDist;
    const desiredY = camState.target.y + sp * camState.smoothDist + 0.24;
    const desiredZ = camState.target.z + rayZ * camState.smoothDist;

    let neededLift = 0.0;
    const caveCam = getRiverCaveState(desiredX, desiredZ, porter.state.pos.y);
    if (caveCam.inCave) {
      const clampedY = clamp(desiredY, caveCam.floorY + 1.0, caveCam.ceilingY - 1.1);
      neededLift = clampedY - desiredY;
    } else {
      const floorY = getTerrainHeight(desiredX, desiredZ) + 0.78;
      if (floorY > desiredY) neededLift = floorY - desiredY;
    }

    // Smoothly damp any remaining floor-clearance lift AND carry partial lift into lookAt so pitch angle stays rock-steady!
    const liftRate = neededLift > camState.smoothFloorLift ? 8.5 : 2.6;
    camState.smoothFloorLift = mix(camState.smoothFloorLift, neededLift, 1.0 - Math.exp(-liftRate * dt));

    // Lock camera directly to the already-smoothed gimbal pivot (eliminates double-lerp pitch oscillation!)
    camState.pos.set(desiredX, desiredY + camState.smoothFloorLift, desiredZ);
    camera.position.copy(camState.pos);
    camera.lookAt(camState.target.x, camState.target.y + 0.56 + camState.smoothFloorLift * 0.65, camState.target.z);
  }

  resolvePass.uniforms.uExposure.value = mix(1.06, 1.38, ATMO_UNIFORMS.uNightFactor.value);

  telemetryTick += dt;
  if (telemetryTick > 0.2) {
    telemetryTick = 0;
    const wxLabel = envCtrl.state.weather.toUpperCase();
    const aur = ATMO_UNIFORMS.uAuroraStrength.value > 0.15 ? ' · AURORA ACTIVE' : '';
    elTelemetry.textContent = `SEED: ${getWorldSeed()} · ${formatClock(envCtrl.state.timeOfDay)} · ${wxLabel}${aur} · ${Math.round(px)}m, ${Math.round(pz)}m`;
    elNeedle.style.transform = `rotate(${(-camState.yaw * 180) / Math.PI}deg)`;
    if (envCtrl.state.timeSpeed > 0) {
      elSlTime.value = envCtrl.state.timeOfDay;
      elLblTime.textContent = formatClock(envCtrl.state.timeOfDay);
    }
    if (envCtrl.state.weather !== lastHudWeather) {
      lastHudWeather = envCtrl.state.weather;
      refreshHudControls();
    }
  }

  // Capture main scene render stats BEFORE post-processing passes reset renderer.info
  composer.render();
}
let lastSceneCalls = 0;
let lastSceneTris = 0;
const _origRenderPassRender = renderPass.render.bind(renderPass);
renderPass.render = function (r, writeBuf, readBuf, deltaTime, maskActive) {
  _origRenderPassRender(r, writeBuf, readBuf, deltaTime, maskActive);
  lastSceneCalls = r.info.render.calls;
  lastSceneTris = r.info.render.triangles;
};
animate();

// 9. Verification & Debug Hook
window.__LANDSTRANDING__ = {
  setTime(hours) {
    envCtrl.setTimeOfDay(hours);
    envCtrl.update(0.016, porter.state.pos);
    refreshHudControls();
    composer.render();
  },
  setWeather(wx) {
    envCtrl.setWeather(wx);
    for (let i = 0; i < 6; i++) envCtrl.update(0.5, porter.state.pos);
    weatherFX.update(camera, envCtrl.curWx.rainIntensity, porter.state.pos, 0.016);
    refreshHudControls();
    composer.render();
  },
  setAurora(mode) {
    envCtrl.setAuroraMode(mode);
    envCtrl.update(0.016, porter.state.pos);
    refreshHudControls();
    composer.render();
  },
  setHudVisible(v) {
    elHud.classList.toggle('hidden', !v);
  },
  setCamera(pos, lookAt) {
    camState.customOverride = true;
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    composer.render();
  },
  resetHeroVista() {
    resetVista();
    composer.render();
  },
  teleportToVillage() {
    teleportToFeature('village');
    composer.render();
  },
  teleportToWaterfall() {
    teleportToFeature('waterfall');
    composer.render();
  },
  teleport(x, z) {
    camState.customOverride = false;
    porter.placeAt(x, z, Math.PI);
    terrainSys.update(x, z, true);
    waterSys.update(x, z);
    landmarkSys.update(x, z);
    porter.placeAt(x, z, Math.PI);
    syncCameraImmediate();
    composer.render();
  },
  setSeed(seedStr) {
    switchWorldSeed(seedStr);
    composer.render();
  },
  triggerScan() {
    porter.triggerScan();
  },
  getCellSummary() {
    const f = getCellFeatures(0, 0);
    return {
      seed: getWorldSeed(),
      hasEscarpment: f.hasEscarpment,
      hasRiver: f.hasRiver,
      hasWaterfall: !!f.waterfall,
      village: f.village ? { x: f.village.x, z: f.village.z, buildings: f.village.buildings.length } : null,
      hotSprings: f.hotSprings.length,
      basaltColumns: f.basaltColumns.length,
      bridges: f.bridges.length,
      cairns: f.cairns.length,
      outposts: f.outposts.length,
      relays: f.relays.length
    };
  },
  sampleHeight(x, z) {
    return getTerrainHeight(x, z);
  },
  getState() {
    return {
      seed: getWorldSeed(),
      pos: porter.state.pos.toArray(),
      speed: porter.state.speed,
      timeOfDay: envCtrl.state.timeOfDay,
      weather: envCtrl.state.weather,
      auroraStrength: ATMO_UNIFORMS.uAuroraStrength.value,
      nightFactor: ATMO_UNIFORMS.uNightFactor.value,
      calls: lastSceneCalls || renderer.info.render.calls,
      triangles: lastSceneTris || renderer.info.render.triangles
    };
  }
};
