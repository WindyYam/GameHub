/**
 * LandStranding Main Bootstrap, HDR MSAA Post-Processing Pipeline,
 * Third-Person Camera, Input Controller, HUD Wiring & Verification API.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
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
  sampleLake,
  getActiveLakesAround,
  getOriginLakes,
  findLakeOverlook,
  findSpawnPosition
} from './world.js';
import { createTextureLibrary } from './textures.js';
import { ATMO_UNIFORMS, createSkyDome, createEnvironmentController } from './atmosphere.js';
import { createWeatherFX } from './weather_fx.js';
import { createTerrainSystem } from './terrain.js';
import { createWaterSystem } from './water.js';
import { createLandmarkSystem } from './landmarks.js';
import { createPorter } from './character.js';
import { createMotorcycleSystem } from './motorcycle.js';
import { createAudioSystem } from './audio.js';

// 1. Renderer & Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.35, 16000);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let dpr = Math.min(window.devicePixelRatio || 1, 1.0);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// 2. Optimized Single-Pass 2x MSAA HDR Composer + Selective Low-Res Planar Lake Reflection (ZERO SSR Ghosting, High FPS!)
const rtW = Math.max(1, Math.floor(window.innerWidth * dpr));
const rtH = Math.max(1, Math.floor(window.innerHeight * dpr));

const IS_MOBILE_PRIMARY = (
  (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 0)
);

const msaaTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
  type: THREE.HalfFloatType,
  samples: IS_MOBILE_PRIMARY ? 0 : 2
});

// Lightweight planar mirror reflection RT (scales with active render resolution -> fast even at 240p!)
function calcReflSize(w, h) {
  const aspect = w / Math.max(h, 1);
  const maxW = IS_MOBILE_PRIMARY ? 360 : 640;
  const rw = Math.min(maxW, Math.max(200, Math.round(w * 0.42)));
  const rh = Math.max(112, Math.round(rw / Math.max(aspect, 0.5)));
  return [rw, rh];
}
const [initReflW, initReflH] = calcReflSize(window.innerWidth, window.innerHeight);
const reflRT = new THREE.WebGLRenderTarget(initReflW, initReflH, {
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
  samples: 0
});

const reflCam = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.35, 16000);
const reflSkyScene = new THREE.Scene();
let reflSkyMesh = null;

const _BIAS_MAT = new THREE.Matrix4().set(
  0.5, 0.0, 0.0, 0.5,
  0.0, 0.5, 0.0, 0.5,
  0.0, 0.0, 0.5, 0.5,
  0.0, 0.0, 0.0, 1.0
);
const _reflMatrix = new THREE.Matrix4();
const _camWorldPos = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camTargetW = new THREE.Vector3();
const _reflTargetW = new THREE.Vector3();
const _reflPlane = new THREE.Plane();
const _reflPlaneNorm = new THREE.Vector3(0, 1, 0);
const _clipVec = new THREE.Vector4();
const _qVec = new THREE.Vector4();

let lastSceneCalls = 0;
let lastSceneTris = 0;
let lastReflRendered = false;
let shadowMapWarmed = false;

const _reflProjPt = new THREE.Vector3();

const planarLakePass = {
  enabled: true,
  needsSwap: false,
  clear: true,
  renderToScreen: false,
  setSize(w, h) {
    const [rw, rh] = calcReflSize(w, h);
    reflRT.setSize(rw, rh);
  },
  render(r, writeBuffer, readBuffer) {
    camera.updateMatrixWorld();

    // Step 1: Frustum-check visible lakes — skip planar reflection pass completely when disabled or no lake is in view (0.0ms!)
    const visLake = qualityState.reflections && waterSys ? waterSys.getBestVisibleLake(camera) : null;
    if (visLake && camera.position.y > visLake.waterY + 0.15) {
      const waterY = visLake.waterY;

      // Compute exact screen-space NDC bounds of the lake when all perimeter points are in front of the near plane
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let allInFront = true;
      let anyInFront = false;
      const extRx = visLake.rx * 1.60;
      const extRz = visLake.rz * 1.60;
      for (let si = -1; si <= 1; si++) {
        for (let sj = -1; sj <= 1; sj++) {
          if (si === 0 && sj === 0) continue;
          const lx = si * extRx;
          const lz = sj * extRz;
          _reflProjPt.set(
            visLake.cx + lx * visLake.cosR - lz * visLake.sinR,
            waterY,
            visLake.cz + lx * visLake.sinR + lz * visLake.cosR
          );
          const viewZ = _reflProjPt.clone().applyMatrix4(camera.matrixWorldInverse).z;
          if (viewZ >= -camera.near) {
            allInFront = false;
          } else {
            anyInFront = true;
            _reflProjPt.project(camera);
            if (_reflProjPt.x < minX) minX = _reflProjPt.x;
            if (_reflProjPt.x > maxX) maxX = _reflProjPt.x;
            if (_reflProjPt.y < minY) minY = _reflProjPt.y;
            if (_reflProjPt.y > maxY) maxY = _reflProjPt.y;
          }
        }
      }

      if (!anyInFront || (allInFront && (maxX < -1.0 || minX > 1.0 || maxY < -1.0 || minY > 1.0))) {
        if (waterSys) waterSys.updateLakeUniforms(null, null, 16.5, false);
        lastReflRendered = false;
      } else {
        const rw = reflRT.width;
        const rh = reflRT.height;
        let sx = 0, sy = 0, sw = rw, sh = rh;
        if (allInFront) {
          const padNdc = 0.18;
          const rMinX = clamp(minX - padNdc, -1.0, 1.0);
          const rMaxX = clamp(maxX + padNdc, -1.0, 1.0);
          const rMinY = clamp(-maxY - padNdc, -1.0, 1.0);
          const rMaxY = clamp(-minY + padNdc, -1.0, 1.0);
          sx = Math.max(0, Math.floor((rMinX * 0.5 + 0.5) * rw));
          sy = Math.max(0, Math.floor((rMinY * 0.5 + 0.5) * rh));
          const ex = Math.min(rw, Math.ceil((rMaxX * 0.5 + 0.5) * rw));
          const ey = Math.min(rh, Math.ceil((rMaxY * 0.5 + 0.5) * rh));
          sw = Math.max(1, ex - sx);
          sh = Math.max(1, ey - sy);
        }

        _camWorldPos.setFromMatrixPosition(camera.matrixWorld);
        _camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
        _camTargetW.copy(_camWorldPos).add(_camFwd);

        // Exact mirrored reflection camera across horizontal plane y = waterY (right-handed, zero inverted culling!)
        reflCam.fov = camera.fov;
        reflCam.aspect = camera.aspect;
        reflCam.near = camera.near;
        reflCam.far = camera.far;
        reflCam.position.set(_camWorldPos.x, 2.0 * waterY - _camWorldPos.y, _camWorldPos.z);
        _reflTargetW.set(_camTargetW.x, 2.0 * waterY - _camTargetW.y, _camTargetW.z);
        reflCam.up.set(0, 1, 0);
        reflCam.lookAt(_reflTargetW);
        reflCam.updateMatrixWorld();
        reflCam.updateProjectionMatrix();

        // Store non-oblique projection-view-bias matrix for exact pixel alignment in lake shader
        _reflMatrix.copy(_BIAS_MAT).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);

        // Step 1a: Clear full reflRT first, then scissor to lake reflection footprint & render Sky Dome with full far plane
        r.setRenderTarget(reflRT);
        r.setScissorTest(false);
        r.autoClear = true;
        r.clear(true, true, true);
        if (allInFront) {
          r.setScissorTest(true);
          r.setScissor(sx, sy, sw, sh);
        }
        if (reflSkyMesh) {
          reflSkyMesh.position.copy(reflCam.position);
          r.render(reflSkyScene, reflCam);
        }

        // Tighten far plane for terrain/object reflection pass after sky dome is rendered
        reflCam.far = Math.min(camera.far, Math.max(2600.0, visLake.boundR * 2.4 + 1800.0));
        reflCam.updateProjectionMatrix();

        // Step 1b: Apply Lengyel's oblique near-plane clip (y >= waterY - 0.14) so underwater terrain never blocks the mirror camera!
        _reflPlane.set(_reflPlaneNorm, -waterY + 0.14);
        _reflPlane.applyMatrix4(reflCam.matrixWorldInverse);
        if (_reflPlane.constant < -0.02) {
          _clipVec.set(_reflPlane.normal.x, _reflPlane.normal.y, _reflPlane.normal.z, _reflPlane.constant);
          const pe = reflCam.projectionMatrix.elements;
          _qVec.set(
            (Math.sign(_clipVec.x) + pe[8]) / pe[0],
            (Math.sign(_clipVec.y) + pe[9]) / pe[5],
            -1.0,
            (1.0 + pe[10]) / pe[14]
          );
          const denom = _clipVec.dot(_qVec);
          if (Math.abs(denom) > 1e-5) {
            _clipVec.multiplyScalar(2.0 / denom);
            pe[2] = _clipVec.x;
            pe[6] = _clipVec.y;
            pe[10] = _clipVec.z + 1.0;
            pe[14] = _clipVec.w;
          }
        }

        // Step 1c: Selective low-LOD reflection render — skip lakes, clutter, distant boulders, rain VFX & shadow-map rebuild
        const prevShadowAuto = r.shadowMap.autoUpdate;
        if (shadowMapWarmed) r.shadowMap.autoUpdate = false;
        skyDome.mesh.visible = false;
        waterSys.setLakesVisible(false);
        terrainSys.setReflectionMode(true);
        weatherFX.setVisible(false);

        r.autoClear = false;
        r.render(scene, reflCam);

        r.setScissorTest(false);
        skyDome.mesh.visible = true;
        waterSys.setLakesVisible(true);
        terrainSys.setReflectionMode(false);
        weatherFX.setVisible(true);
        r.shadowMap.autoUpdate = prevShadowAuto;
        shadowMapWarmed = true;

        waterSys.updateLakeUniforms(reflRT.texture, _reflMatrix, waterY, true);
        lastReflRendered = true;
      }
    } else {
      if (waterSys) waterSys.updateLakeUniforms(null, null, 16.5, false);
      lastReflRendered = false;
    }

    // Step 2: Single-pass main scene render directly into 2x MSAA HDR composer buffer (zero depth-copy overhead!)
    r.setRenderTarget(this.renderToScreen ? null : readBuffer);
    r.autoClear = true;
    r.clear(true, true, true);
    r.render(scene, camera);
    lastSceneCalls = r.info.render.calls;
    lastSceneTris = r.info.render.triangles;
  }
};

const composer = new EffectComposer(renderer, msaaTarget);
composer.addPass(planarLakePass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(Math.max(1, Math.floor(window.innerWidth * 0.35)), Math.max(1, Math.floor(window.innerHeight * 0.35))),
  0.24,
  0.36,
  1.12
);
bloomPass.enabled = !IS_MOBILE_PRIMARY;
composer.addPass(bloomPass);

// Stephen Hill ACES Filmic Resolve + Nordic Photographic Grading + Vignette + IGN Dither + sRGB (single texture tap!)
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

      // Photographic Icelandic filmic contrast (rich deep volcanic blacks + crisp earthy olive moss + luminous glacial blues)
      c = pow(max(c, vec3(0.0)), vec3(1.07));
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.16);
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, mix(1.05, 1.09, uNightFactor));
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
function generateRandomSeed() {
  const prefixes = ['FJORD', 'VIK', 'REYKJA', 'SKOGA', 'KATLA', 'HEKLA', 'SNÆFELL', 'EYJA'];
  const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${pref}-${Math.floor(100 + Math.random() * 899)}`;
}

setWorldSeed(generateRandomSeed());
const texLib = createTextureLibrary();
const skyDome = createSkyDome();
scene.add(skyDome.mesh);
reflSkyMesh = new THREE.Mesh(skyDome.mesh.geometry, skyDome.material);
reflSkyMesh.frustumCulled = false;
reflSkyScene.add(reflSkyMesh);

const envCtrl = createEnvironmentController(scene, renderer, skyDome);
if (IS_MOBILE_PRIMARY && envCtrl.sunLight && envCtrl.sunLight.shadow) {
  envCtrl.sunLight.shadow.mapSize.set(512, 512);
}
const weatherFX = createWeatherFX(scene);
const terrainSys = createTerrainSystem(texLib, scene);
const waterSys = createWaterSystem(texLib, scene);
const landmarkSys = createLandmarkSystem(texLib, scene);
const audioSys = createAudioSystem();

const porter = createPorter(scene, (surface, sprint) => {
  audioSys.playFootstep(surface, sprint);
});
const bikeSys = createMotorcycleSystem(scene, audioSys);

let lastCamManualTime = 0;

function triggerPrintMotorcycle() {
  ensureAudioStarted();
  if (bikeSys.state.riding) {
    bikeSys.dismount(porter, terrainSys, landmarkSys);
  }
  bikeSys.startPrint(porter);
  refreshBikeHud();
}

function toggleMountMotorcycle() {
  ensureAudioStarted();
  if (bikeSys.state.riding) {
    bikeSys.dismount(porter, terrainSys, landmarkSys);
    refreshBikeHud();
    return true;
  }
  if (bikeSys.canMount(porter.state.pos)) {
    bikeSys.mount(porter);
    camState.yaw = bikeSys.state.yaw + Math.PI;
    refreshBikeHud();
    return true;
  }
  return false;
}

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
  if (bikeSys.state.riding) {
    bikeSys.dismount(porter, terrainSys, landmarkSys);
  }
  camState.customOverride = false;
  const sp = findSpawnPosition();
  // Porter faces forward into the valley vista; camera sits squarely aligned behind over right shoulder
  porter.placeAt(sp.x, sp.z, sp.yaw);
  camState.yaw = sp.yaw + Math.PI;
  camState.pitch = 0.08;
  camState.distance = 7.4;
  syncCameraImmediate();
}

const TITLE_CAM_RADIUS = 100.0;
const TITLE_CAM_HEIGHT = 50.0;

function updateTitleCamera(yaw) {
  const px = porter.state.pos.x;
  const py = porter.state.pos.y;
  const pz = porter.state.pos.z;
  const camX = px + Math.sin(yaw) * TITLE_CAM_RADIUS;
  const camZ = pz + Math.cos(yaw) * TITLE_CAM_RADIUS;
  const camY = Math.max(py + TITLE_CAM_HEIGHT, getTerrainHeight(camX, camZ) + 2.0);
  camState.pos.set(camX, camY, camZ);
  camState.target.set(px, camY, pz);
  camera.position.copy(camState.pos);
  camera.lookAt(camState.target);
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

// Title Screen & Staged Async World Boot
let gameState = 'loading'; // 'loading' | 'title' | 'playing'
const elTitleScreen = document.getElementById('title-screen');
const elLoadingWrap = document.getElementById('loading-wrap');
const elLoadingStatus = document.getElementById('loading-status');
const elLoadingFill = document.getElementById('loading-fill');
const elBtnStart = document.getElementById('btn-start-game');
const elTitleHint = document.getElementById('title-hint');
const IDLE_INPUT = { forward: false, backward: false, left: false, right: false, sprint: false, jump: false, analogX: 0, analogY: 0 };

function setLoadProgress(pct, label) {
  if (elLoadingFill) elLoadingFill.style.width = `${pct}%`;
  if (elLoadingStatus) elLoadingStatus.textContent = label;
}

function nextFrameTick() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// Strict mobile touch detection: desktop/laptop PCs with touchscreens (pointer: fine & hover: hover) NEVER show mobile UI!
function isMobileTouchPrimary() {
  const coarseNoHover = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const fineDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fineDesktop) return false;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  return coarseNoHover || (uaMobile && navigator.maxTouchPoints > 0);
}

function startGame() {
  if (gameState !== 'title') return;
  gameState = 'playing';
  ensureAudioStarted();
  camState.yaw = porter.state.yaw + Math.PI;
  camState.distance = 7.4;
  camState.pitch = 0.08;
  camState.customOverride = false;
  syncCameraImmediate();
  if (elTitleScreen) {
    elTitleScreen.classList.add('fade-out');
    setTimeout(() => { elTitleScreen.style.display = 'none'; }, 700);
  }
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.classList.remove('hidden');

  if (isMobileTouchPrimary()) {
    document.body.classList.add('touch-active');
    tryLockLandscape(true);
  } else {
    document.body.classList.remove('touch-active');
    if (renderer.domElement.requestPointerLock) {
      try {
        const p = renderer.domElement.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    }
  }
}

if (elBtnStart) {
  elBtnStart.addEventListener('click', startGame);
}

async function bootWorld() {
  setLoadProgress(15, 'Generating Icelandic Sector...');
  await nextFrameTick();
  resetVista();

  setLoadProgress(40, 'Sculpting Volcanic Terrain...');
  await nextFrameTick();
  terrainSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);

  setLoadProgress(65, 'Carving Glacial Rivers & Waterfalls...');
  await nextFrameTick();
  waterSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);

  setLoadProgress(85, 'Placing Bridges & Outposts...');
  await nextFrameTick();
  landmarkSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);

  setLoadProgress(98, 'Warming Shaders & Atmosphere...');
  await nextFrameTick();
  porter.placeAt(porter.state.pos.x, porter.state.pos.z, porter.state.yaw);
  // Populate PMREM scene.environment IBL BEFORE shader warmup so bike PBR shaders compile with USE_ENVMAP active!
  envCtrl.update(0.016, porter.state.pos);
  updateTitleCamera(camState.yaw);
  camera.updateMatrixWorld(true);
  bikeSys.prewarmShaders(composer, camera);
  landmarkSys.finishPrewarm();
  composer.render();

  setLoadProgress(100, 'Ready');
  gameState = 'title';
  if (elTitleScreen) elTitleScreen.classList.add('ready');
  if (elLoadingWrap) elLoadingWrap.classList.add('hidden');
  if (elBtnStart) elBtnStart.classList.remove('hidden');
  if (elTitleHint) elTitleHint.classList.remove('hidden');
  lastTimeMs = performance.now();
  requestAnimationFrame(animate);
}

// 5. Input Handling (Keyboard, Mouse & Multi-Touch Mobile Controls)
const input = { forward: false, backward: false, left: false, right: false, sprint: false, jump: false, analogX: 0, analogY: 0 };
const activePointers = new Map();
let camPointerId = null;
let lastCamX = 0;
let lastCamY = 0;
let lastPinchDist = 0;
let landscapeAttempted = false;

function lockOrientationLandscape() {
  if (screen.orientation && screen.orientation.lock) {
    return screen.orientation.lock('landscape').catch(() => false);
  }
  return Promise.resolve(false);
}

function tryLockLandscape(withFullscreen = true) {
  if (!isMobileTouchPrimary()) return Promise.resolve(false);
  const docEl = document.documentElement;
  const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
  if (withFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement && reqFs) {
    try {
      const res = reqFs.call(docEl, { navigationUI: 'hide' });
      if (res && typeof res.then === 'function') {
        return res.then(lockOrientationLandscape).catch(lockOrientationLandscape);
      }
    } catch (_) {
      try {
        const res2 = reqFs.call(docEl);
        if (res2 && typeof res2.then === 'function') {
          return res2.then(lockOrientationLandscape).catch(lockOrientationLandscape);
        }
      } catch (_2) {}
    }
  }
  return lockOrientationLandscape();
}

function ensureAudioStarted() {
  audioSys.init();
}

window.addEventListener('keydown', (e) => {
  if (gameState === 'title') {
    if (e.key === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      startGame();
    }
    return;
  }
  if (gameState !== 'playing') return;
  document.body.classList.remove('touch-active');
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
  if (k === 'b' && !e.repeat) {
    if (!bikeSys.state.riding) {
      triggerPrintMotorcycle();
    }
  }
  if ((k === 'e' || k === 'f') && !e.repeat) {
    if (!bikeSys.state.riding && landmarkSys.toggleNearestDoor(porter.state.pos.x, porter.state.pos.y, porter.state.pos.z)) {
      return;
    }
    toggleMountMotorcycle();
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
  if (e.pointerType === 'touch' && isMobileTouchPrimary()) {
    document.body.classList.add('touch-active');
    if (!landscapeAttempted) {
      landscapeAttempted = true;
      tryLockLandscape(true);
    }
  } else {
    document.body.classList.remove('touch-active');
    if (e.button === 0 && document.pointerLockElement !== renderer.domElement && renderer.domElement.requestPointerLock) {
      try {
        const p = renderer.domElement.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    }
  }
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 1) {
    camPointerId = e.pointerId;
    lastCamX = e.clientX;
    lastCamY = e.clientY;
  } else if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values());
    lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    camPointerId = null;
  }
  camState.customOverride = false;
});

window.addEventListener('pointermove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    camState.yaw -= (e.movementX || 0) * 0.0028;
    camState.pitch = clamp(camState.pitch + (e.movementY || 0) * 0.0024, -0.35, 1.05);
    camState.customOverride = false;
    lastCamManualTime = performance.now();
    return;
  }
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (lastPinchDist > 0) {
      camState.distance = clamp(camState.distance - (dist - lastPinchDist) * 0.025, 2.4, 24.0);
    }
    lastPinchDist = dist;
  } else if (e.pointerId === camPointerId) {
    const dx = e.clientX - lastCamX;
    const dy = e.clientY - lastCamY;
    lastCamX = e.clientX;
    lastCamY = e.clientY;
    const sens = e.pointerType === 'touch' ? 0.0068 : 0.0055;
    camState.yaw -= dx * sens;
    camState.pitch = clamp(camState.pitch + dy * (sens * 0.82), -0.35, 1.05);
    lastCamManualTime = performance.now();
  }
});

function releaseCamPointer(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.delete(e.pointerId);
  if (e.pointerId === camPointerId) camPointerId = null;
  if (activePointers.size === 1) {
    const [remId, pt] = activePointers.entries().next().value;
    camPointerId = remId;
    lastCamX = pt.x;
    lastCamY = pt.y;
    lastPinchDist = 0;
  } else if (activePointers.size === 0) {
    lastPinchDist = 0;
  }
}
window.addEventListener('pointerup', releaseCamPointer);
window.addEventListener('pointercancel', releaseCamPointer);

// Mobile Virtual Joystick & Action Buttons
const joyBase = document.getElementById('joy-base');
const joyKnob = document.getElementById('joy-knob');
if (joyBase && joyKnob) {
  let joyPointerId = null;
  const maxJoyR = 40;

  const updateJoy = (clientX, clientY) => {
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxJoyR) {
      dx = (dx / dist) * maxJoyR;
      dy = (dy / dist) * maxJoyR;
    }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.analogX = dx / maxJoyR;
    input.analogY = dy / maxJoyR;
  };

  const resetJoy = () => {
    joyPointerId = null;
    joyKnob.style.transform = 'translate(0px, 0px)';
    input.analogX = 0;
    input.analogY = 0;
  };

  joyBase.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    ensureAudioStarted();
    document.body.classList.add('touch-active');
    joyPointerId = e.pointerId;
    joyBase.setPointerCapture(e.pointerId);
    updateJoy(e.clientX, e.clientY);
  });
  joyBase.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointerId) return;
    e.stopPropagation();
    updateJoy(e.clientX, e.clientY);
  });
  joyBase.addEventListener('pointerup', (e) => {
    if (e.pointerId !== joyPointerId) return;
    resetJoy();
  });
  joyBase.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== joyPointerId) return;
    resetJoy();
  });
}

const btnMJudge = document.getElementById('btn-m-jump');
if (btnMJudge) {
  btnMJudge.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    ensureAudioStarted();
    input.jump = true;
  });
  const releaseJump = () => { input.jump = false; };
  btnMJudge.addEventListener('pointerup', releaseJump);
  btnMJudge.addEventListener('pointercancel', releaseJump);
}

const btnMSprint = document.getElementById('btn-m-sprint');
if (btnMSprint) {
  let sprintLocked = false;
  btnMSprint.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    ensureAudioStarted();
    sprintLocked = !sprintLocked;
    input.sprint = sprintLocked;
    btnMSprint.classList.toggle('active', sprintLocked);
  });
}

const btnMScan = document.getElementById('btn-m-scan');
if (btnMScan) {
  btnMScan.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    ensureAudioStarted();
    porter.triggerScan();
    audioSys.playOdradekChime();
  });
}

const btnMBike = document.getElementById('btn-m-bike');
if (btnMBike) {
  btnMBike.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    ensureAudioStarted();
    if (bikeSys.state.riding || bikeSys.canMount(porter.state.pos)) {
      toggleMountMotorcycle();
    } else if (!bikeSys.state.printing) {
      triggerPrintMotorcycle();
    }
  });
}

const landscapePrompt = document.getElementById('landscape-prompt');
const btnLockLandscape = document.getElementById('btn-lock-landscape');
const btnDismissLandscape = document.getElementById('btn-dismiss-landscape');
if (btnLockLandscape && landscapePrompt) {
  btnLockLandscape.addEventListener('click', () => {
    tryLockLandscape(true).then((locked) => {
      if (locked !== false || window.innerWidth > window.innerHeight) {
        landscapePrompt.classList.add('dismissed');
      } else {
        const subEl = landscapePrompt.querySelector('.landscape-sub');
        if (subEl) {
          subEl.textContent = 'This browser blocks automatic rotation — please rotate your phone horizontally (or tap Continue).';
        }
      }
    });
  });
}
if (btnDismissLandscape && landscapePrompt) {
  btnDismissLandscape.addEventListener('click', () => {
    landscapePrompt.classList.add('dismissed');
  });
}
tryLockLandscape(false);
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && isMobileTouchPrimary()) {
    lockOrientationLandscape();
  }
});
window.addEventListener('orientationchange', () => {
  if (isMobileTouchPrimary()) {
    lockOrientationLandscape();
    if (landscapePrompt && window.innerHeight > window.innerWidth) {
      landscapePrompt.classList.remove('dismissed');
    }
  }
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
const elQualityPanel = document.getElementById('quality-panel');
const elSlTime = document.getElementById('sl-time');
const elLblTime = document.getElementById('lbl-time');
const elBtnCycle = document.getElementById('btn-cycle');
const elBtnAurora = document.getElementById('btn-aurora');
const elBtnQuality = document.getElementById('btn-quality');
const elBtnQBloom = document.getElementById('btn-q-bloom');
const elBtnQMsaa = document.getElementById('btn-q-msaa');
const elBtnQRefl = document.getElementById('btn-q-refl');
const elBtnQShadow = document.getElementById('btn-q-shadow');
const elBtnAudio = document.getElementById('btn-audio');
const elBtnPrintBike = document.getElementById('btn-print-bike');
const elBikeBanner = document.getElementById('bike-banner');
const elBikeBannerTitle = document.getElementById('bike-banner-title');
const elBikeBannerSub = document.getElementById('bike-banner-sub');
const elBikeProgTrack = document.getElementById('bike-progress-track');
const elBikeProgFill = document.getElementById('bike-progress-fill');
const elHudKeyHints = document.getElementById('hud-key-hints');
const elNeedle = document.getElementById('compass-needle');

let lastBikeHudMode = '';

function refreshBikeHud() {
  const bs = bikeSys.state;
  const nearMount = bikeSys.canMount(porter.state.pos);

  if (elBtnPrintBike) {
    if (bs.printing) {
      elBtnPrintBike.textContent = `Printing ${Math.round(bs.printProgress * 100)}%`;
      elBtnPrintBike.classList.add('active');
    } else if (bs.riding) {
      elBtnPrintBike.textContent = 'Dismount Bike (E)';
      elBtnPrintBike.classList.add('active');
    } else if (bs.exists) {
      elBtnPrintBike.textContent = 'Reprint Bike (B)';
      elBtnPrintBike.classList.remove('active');
    } else {
      elBtnPrintBike.textContent = '3D Print Bike (B)';
      elBtnPrintBike.classList.remove('active');
    }
  }

  if (btnMBike) {
    if (bs.printing) btnMBike.textContent = `${Math.round(bs.printProgress * 100)}%`;
    else if (bs.riding) btnMBike.textContent = 'Exit';
    else if (nearMount) btnMBike.textContent = 'Ride';
    else btnMBike.textContent = 'Print';
    btnMBike.classList.toggle('active', bs.printing || bs.riding || nearMount);
  }

  if (elBikeBanner) {
    elBikeBanner.classList.add('hidden');
  }

  const mode = bs.riding ? 'riding' : 'foot';
  if (elHudKeyHints && mode !== lastBikeHudMode) {
    lastBikeHudMode = mode;
    if (mode === 'riding') {
      elHudKeyHints.innerHTML =
        '<div class="key-chip"><b>W/S</b> Throttle / Brake</div>' +
        '<div class="key-chip"><b>A/D</b> Steer</div>' +
        '<div class="key-chip"><b>Shift</b> Chiral Boost</div>' +
        '<div class="key-chip"><b>Space</b> Hop / Handbrake</div>' +
        '<div class="key-chip"><b>E</b> Dismount</div>' +
        '<div class="key-chip"><b>Q</b> Odradek Scan</div>' +
        '<div class="key-chip"><b>V</b> Reset Vista</div>';
    } else {
      elHudKeyHints.innerHTML =
        '<div class="key-chip"><b>WASD</b> Walk</div>' +
        '<div class="key-chip"><b>Shift</b> Sprint</div>' +
        '<div class="key-chip"><b>Space</b> Jump</div>' +
        '<div class="key-chip"><b>B</b> 3D Print Bike</div>' +
        '<div class="key-chip"><b>E</b> Ride Bike</div>' +
        '<div class="key-chip"><b>Q</b> Odradek Scan</div>' +
        '<div class="key-chip"><b>Click / Mouse</b> Look</div>' +
        '<div class="key-chip"><b>Scroll</b> Zoom</div>' +
        '<div class="key-chip"><b>V</b> Reset Vista</div>';
    }
  }
}

if (elBtnPrintBike) {
  elBtnPrintBike.addEventListener('click', (e) => {
    e.stopPropagation();
    if (bikeSys.state.riding) {
      toggleMountMotorcycle();
    } else {
      triggerPrintMotorcycle();
    }
  });
}

if (elBikeBanner) {
  elBikeBanner.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!bikeSys.state.printing && !bikeSys.state.riding && bikeSys.canMount(porter.state.pos)) {
      toggleMountMotorcycle();
    }
  });
}

const RES_PRESETS = [
  { label: 'Auto', height: 0 },
  { label: '240p', height: 240 },
  { label: '360p', height: 360 },
  { label: '480p', height: 480 },
  { label: '720p', height: 720 },
  { label: '1080p', height: 1080 },
  { label: '2K', height: 1440 }
];
let resPresetIdx = 0;

const qualityState = {
  preset: IS_MOBILE_PRIMARY ? 'balanced' : 'high',
  bloom: !IS_MOBILE_PRIMARY,
  msaa: !IS_MOBILE_PRIMARY,
  reflections: true,
  shadow: IS_MOBILE_PRIMARY ? 'med' : 'high' // 'high' (1024) | 'med' (512) | 'off'
};

function applyQualitySettings() {
  bloomPass.enabled = qualityState.bloom;

  const targetSamples = qualityState.msaa ? 2 : 0;
  if (msaaTarget.samples !== targetSamples) {
    msaaTarget.samples = targetSamples;
    msaaTarget.dispose();
  }

  if (envCtrl.sunLight) {
    const shOff = qualityState.shadow === 'off';
    envCtrl.sunLight.castShadow = !shOff;
    renderer.shadowMap.enabled = !shOff;
    if (!shOff && envCtrl.sunLight.shadow) {
      const sz = qualityState.shadow === 'high' ? 1024 : 512;
      if (envCtrl.sunLight.shadow.mapSize.x !== sz) {
        envCtrl.sunLight.shadow.mapSize.set(sz, sz);
        if (envCtrl.sunLight.shadow.map) {
          envCtrl.sunLight.shadow.map.dispose();
          envCtrl.sunLight.shadow.map = null;
        }
      }
    }
    shadowMapWarmed = false;
  }

  applyRenderResolution();
  refreshQualityControls();
}

function applyQualityPreset(name) {
  qualityState.preset = name;
  if (name === 'high') {
    resPresetIdx = 0; // Auto
    qualityState.bloom = true;
    qualityState.msaa = !IS_MOBILE_PRIMARY;
    qualityState.reflections = true;
    qualityState.shadow = 'high';
  } else if (name === 'balanced') {
    resPresetIdx = 0; // Auto (540p cap on mobile)
    qualityState.bloom = !IS_MOBILE_PRIMARY;
    qualityState.msaa = false;
    qualityState.reflections = true;
    qualityState.shadow = 'med';
  } else if (name === 'performance') {
    resPresetIdx = IS_MOBILE_PRIMARY ? 2 : 3; // 360p mobile / 480p desktop
    qualityState.bloom = false;
    qualityState.msaa = false;
    qualityState.reflections = false;
    qualityState.shadow = 'off';
  }
  applyQualitySettings();
}

function refreshQualityControls() {
  const presetLabelMap = { high: 'High', balanced: 'Balanced', performance: 'Perf', custom: 'Custom' };
  if (elBtnQuality) {
    elBtnQuality.textContent = `Quality: ${presetLabelMap[qualityState.preset] || 'Custom'}`;
  }
  document.querySelectorAll('#quality-preset-btns button').forEach((b) => {
    b.classList.toggle('active', b.dataset.qpreset === qualityState.preset);
  });
  document.querySelectorAll('#res-btns button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.res) === resPresetIdx);
  });
  if (elBtnQBloom) {
    elBtnQBloom.textContent = `Bloom: ${qualityState.bloom ? 'On' : 'Off'}`;
    elBtnQBloom.classList.toggle('active', qualityState.bloom);
  }
  if (elBtnQMsaa) {
    elBtnQMsaa.textContent = `MSAA: ${qualityState.msaa ? '2x' : 'Off'}`;
    elBtnQMsaa.classList.toggle('active', qualityState.msaa);
  }
  if (elBtnQRefl) {
    elBtnQRefl.textContent = `Refl: ${qualityState.reflections ? 'On' : 'Off'}`;
    elBtnQRefl.classList.toggle('active', qualityState.reflections);
  }
  if (elBtnQShadow) {
    const shMap = { high: 'High', med: 'Med', off: 'Off' };
    elBtnQShadow.textContent = `Shadow: ${shMap[qualityState.shadow] || 'High'}`;
    elBtnQShadow.classList.toggle('active', qualityState.shadow !== 'off');
  }
}

function applyRenderResolution() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  const minDim = Math.max(1, Math.min(w, h));
  const preset = RES_PRESETS[resPresetIdx];
  dpr = preset && preset.height > 0
    ? preset.height / minDim
    : (IS_MOBILE_PRIMARY
      ? Math.min(window.devicePixelRatio || 1, 1.0, 540 / minDim)
      : Math.min(window.devicePixelRatio || 1, 1.0));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  bloomPass.setSize(
    Math.max(1, Math.floor(w * dpr * 0.35)),
    Math.max(1, Math.floor(h * dpr * 0.35))
  );
  resolvePass.uniforms.uAspect.value = w / h;
}

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
  const aurLabelMap = {
    auto: 'AUTO',
    on: 'DYNAMIC',
    drapery: 'DRAPERY',
    corona: 'CORONA',
    crimson: 'CRIMSON',
    glacial: 'CYAN-VIOLET',
    off: 'OFF'
  };
  const am = envCtrl.state.auroraMode;
  elBtnAurora.textContent = `Aurora: ${aurLabelMap[am] || am.toUpperCase()}`;
  elBtnAurora.classList.toggle('active', am !== 'auto' && am !== 'off');

  document.querySelectorAll('#wx-btns button').forEach((b) => {
    b.classList.toggle('active', b.dataset.wxSet === envCtrl.state.weather);
  });
}

document.getElementById('btn-env').addEventListener('click', () => {
  elPanel.classList.toggle('collapsed');
  if (elQualityPanel && !elPanel.classList.contains('collapsed')) {
    elQualityPanel.classList.add('collapsed');
  }
});
if (elBtnQuality && elQualityPanel) {
  elBtnQuality.addEventListener('click', () => {
    elQualityPanel.classList.toggle('collapsed');
    if (!elQualityPanel.classList.contains('collapsed')) {
      elPanel.classList.add('collapsed');
    }
  });
}
document.querySelectorAll('#quality-preset-btns button').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyQualityPreset(btn.dataset.qpreset);
  });
});
document.querySelectorAll('#res-btns button').forEach((btn) => {
  btn.addEventListener('click', () => {
    resPresetIdx = Number(btn.dataset.res) || 0;
    qualityState.preset = 'custom';
    applyRenderResolution();
    refreshQualityControls();
  });
});
if (elBtnQBloom) {
  elBtnQBloom.addEventListener('click', () => {
    qualityState.bloom = !qualityState.bloom;
    qualityState.preset = 'custom';
    applyQualitySettings();
  });
}
if (elBtnQMsaa) {
  elBtnQMsaa.addEventListener('click', () => {
    qualityState.msaa = !qualityState.msaa;
    qualityState.preset = 'custom';
    applyQualitySettings();
  });
}
if (elBtnQRefl) {
  elBtnQRefl.addEventListener('click', () => {
    qualityState.reflections = !qualityState.reflections;
    qualityState.preset = 'custom';
    applyQualitySettings();
  });
}
if (elBtnQShadow) {
  elBtnQShadow.addEventListener('click', () => {
    const order = ['high', 'med', 'off'];
    qualityState.shadow = order[(order.indexOf(qualityState.shadow) + 1) % order.length];
    qualityState.preset = 'custom';
    applyQualitySettings();
  });
}
refreshQualityControls();
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
    const wasAuroraOn = envCtrl.state.auroraMode !== 'auto' && envCtrl.state.auroraMode !== 'off';
    envCtrl.setTimeOfDay(parseFloat(btn.dataset.time));
    if (btn.dataset.wx) envCtrl.setWeather(btn.dataset.wx);
    if (btn.dataset.aurora) {
      if (wasAuroraOn) envCtrl.stepAuroraPhase();
      envCtrl.setAuroraMode(btn.dataset.aurora);
    } else {
      envCtrl.setAuroraMode('auto');
    }
    refreshHudControls();
  });
});

elBtnCycle.addEventListener('click', () => {
  envCtrl.state.timeSpeed = envCtrl.state.timeSpeed > 0 ? 0 : 60;
  refreshHudControls();
});

elBtnAurora.addEventListener('click', () => {
  const order = ['auto', 'on', 'drapery', 'corona', 'crimson', 'glacial', 'off'];
  const idx = order.indexOf(envCtrl.state.auroraMode);
  const next = order[(idx + 1) % order.length];
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
  if (bikeSys.state.riding) {
    bikeSys.dismount(porter, terrainSys, landmarkSys);
  }
  bikeSys.clear();
  setWorldSeed(seedStr);
  resetVista();
  terrainSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
  waterSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
  landmarkSys.rebuildAll(porter.state.pos.x, porter.state.pos.z);
  porter.placeAt(porter.state.pos.x, porter.state.pos.z, porter.state.yaw);
  syncCameraImmediate();
  refreshBikeHud();
}

function placePlayerOrBikeAt(x, z, yaw) {
  if (bikeSys.state.riding) {
    bikeSys.teleportWithRider(x, z, yaw);
    bikeSys.update(0.016, IDLE_INPUT, porter, terrainSys, landmarkSys);
  } else {
    porter.placeAt(x, z, yaw);
  }
}

function teleportToFeature(kind) {
  const f = getCellFeatures(0, 0);
  if (kind === 'village' && f.village) {
    const vx = f.village.x - Math.sin(f.village.yaw) * 44;
    const vz = f.village.z - Math.cos(f.village.yaw) * 44;
    const lookYaw = Math.atan2(f.village.x - vx, f.village.z - vz);
    camState.customOverride = false;
    placePlayerOrBikeAt(vx, vz, lookYaw);
    camState.yaw = lookYaw + Math.PI;
    camState.pitch = 0.14;
    terrainSys.update(vx, vz, true);
    waterSys.update(vx, vz);
    landmarkSys.update(vx, vz);
    placePlayerOrBikeAt(vx, vz, lookYaw);
    syncCameraImmediate();
  } else if (kind === 'waterfall' && f.waterfall) {
    const wf = f.waterfall;
    const wx = wf.plungeX + wf.nx * 78;
    const wz = wf.plungeZ + wf.nz * 78;
    const lookYaw = Math.atan2(wf.x - wx, wf.z - wz);
    camState.customOverride = false;
    placePlayerOrBikeAt(wx, wz, lookYaw);
    camState.yaw = lookYaw + Math.PI;
    camState.pitch = 0.08;
    terrainSys.update(wx, wz, true);
    waterSys.update(wx, wz);
    landmarkSys.update(wx, wz);
    placePlayerOrBikeAt(wx, wz, lookYaw);
    syncCameraImmediate();
  } else if (kind === 'lake' || kind === 'grand_lake') {
    const originLakes = getOriginLakes();
    let targetLake = kind === 'grand_lake' ? originLakes.grand : originLakes.medium;
    if (!targetLake) {
      const nearby = getActiveLakesAround(porter.state.pos.x, porter.state.pos.z, 14000);
      targetLake = nearby.find((l) => (kind === 'grand_lake' ? l.tier === 'macro' : l.tier === 'medium')) || nearby[0];
    }
    if (targetLake) {
      const ov = findLakeOverlook(targetLake);
      camState.customOverride = false;
      placePlayerOrBikeAt(ov.x, ov.z, ov.yaw);
      camState.yaw = ov.yaw + Math.PI;
      camState.pitch = targetLake.tier === 'macro' ? 0.14 : 0.12;
      terrainSys.update(ov.x, ov.z, true);
      waterSys.update(ov.x, ov.z);
      landmarkSys.update(ov.x, ov.z);
      placePlayerOrBikeAt(ov.x, ov.z, ov.yaw);
      syncCameraImmediate();
    }
  }
}

const btnSeedRand = document.getElementById('btn-seed-rand');
if (btnSeedRand) {
  btnSeedRand.addEventListener('click', () => {
    switchWorldSeed(generateRandomSeed());
  });
}
const btnVisitVillage = document.getElementById('btn-visit-village');
if (btnVisitVillage) btnVisitVillage.addEventListener('click', () => teleportToFeature('village'));
const btnVisitWaterfall = document.getElementById('btn-visit-waterfall');
if (btnVisitWaterfall) btnVisitWaterfall.addEventListener('click', () => teleportToFeature('waterfall'));
const btnVisitLake = document.getElementById('btn-visit-lake');
if (btnVisitLake) btnVisitLake.addEventListener('click', () => teleportToFeature('lake'));
const btnVisitGrandLake = document.getElementById('btn-visit-grand-lake');
if (btnVisitGrandLake) btnVisitGrandLake.addEventListener('click', () => teleportToFeature('grand_lake'));

// 7. Resize Handler
window.addEventListener('resize', applyRenderResolution);

// 8. Main Animation Loop
let lastTimeMs = performance.now();
let telemetryTick = 0;
let lastHudWeather = '';
let titleShadowTick = 0;
let lastShadowX = 1e9;
let lastShadowZ = 1e9;
let lastShadowSunY = 1e9;
refreshHudControls();

function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastTimeMs) / 1000, 0.05);
  lastTimeMs = nowMs;

  if (gameState === 'title') {
    // Slowly pan around the porter on the live title/loading screen (~100m away, 50m high, looking horizontally)
    camState.yaw += dt * 0.14;
    porter.update(dt, IDLE_INPUT, camState.yaw, terrainSys, landmarkSys);
    titleShadowTick = (titleShadowTick + 1) & 3;
    renderer.shadowMap.autoUpdate = !shadowMapWarmed || titleShadowTick === 0;
  } else {
    titleShadowTick = (titleShadowTick + 1) & 3;
    const sunY = ATMO_UNIFORMS.uSunDir.value.y;
    const movedForShadow =
      Math.abs(porter.state.pos.x - lastShadowX) > 0.25 ||
      Math.abs(porter.state.pos.z - lastShadowZ) > 0.25 ||
      Math.abs(sunY - lastShadowSunY) > 0.002 ||
      bikeSys.state.printing;
    const shouldShadow = !shadowMapWarmed || (titleShadowTick === 0 && (movedForShadow || porter.state.speed > 0.08 || bikeSys.state.riding));
    renderer.shadowMap.autoUpdate = shouldShadow;
    if (shouldShadow) {
      lastShadowX = porter.state.pos.x;
      lastShadowZ = porter.state.pos.z;
      lastShadowSunY = sunY;
    }
    if (bikeSys.state.riding) {
      bikeSys.update(dt, input, porter, terrainSys, landmarkSys);
    } else {
      porter.update(dt, input, camState.yaw, terrainSys, landmarkSys);
      bikeSys.update(dt, IDLE_INPUT, porter, terrainSys, landmarkSys);
    }
    refreshBikeHud();
  }

  const px = porter.state.pos.x;
  const pz = porter.state.pos.z;

  terrainSys.update(px, pz, false);
  waterSys.update(px, pz);
  landmarkSys.update(px, pz, dt);
  envCtrl.update(dt, porter.state.pos);
  const shelter = landmarkSys.getNearestShelterBox(px, porter.state.pos.y, pz);
  weatherFX.update(camera, envCtrl.curWx.rainIntensity, porter.state.pos, dt, shelter);
  audioSys.update(
    porter.state.pos,
    waterSys.getWaterfallPositions(),
    envCtrl.curWx.windStrength,
    envCtrl.curWx.rainIntensity,
    ATMO_UNIFORMS.uAuroraStrength.value
  );

  if (gameState === 'title') {
    updateTitleCamera(camState.yaw);
  } else if (!camState.customOverride) {
    // Gentle behind-bike auto-alignment while driving when user isn't actively orbiting camera
    if (bikeSys.state.riding && Math.abs(bikeSys.state.speed) > 1.8 && (nowMs - lastCamManualTime) > 1100) {
      const desiredYaw = bikeSys.state.yaw + Math.PI;
      let diff = desiredYaw - camState.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      camState.yaw += diff * (1.0 - Math.exp(-3.2 * dt));
    }

    const isIndoor = !!(shelter && shelter.inside);
    if (camState.indoorBlend === undefined) camState.indoorBlend = 0.0;
    camState.indoorBlend = mix(camState.indoorBlend, isIndoor ? 1.0 : 0.0, 1.0 - Math.exp(-7.0 * dt));
    const inB = camState.indoorBlend;

    // Dynamic speed FOV while riding the RT-04 motorcycle (44° -> 52° during chiral boost!) or wider indoor view (54°)
    const targetFov = bikeSys.state.riding
      ? mix(45.5, 52.5, clamp(Math.abs(bikeSys.state.speed) / 26.0, 0, 1))
      : mix(44.0, 54.0, inB);
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = mix(camera.fov, targetFov, 1.0 - Math.exp(-6.0 * dt));
      camera.updateProjectionMatrix();
    }

    // Exponential frame-rate-independent gimbal smoothing (prevents horizon bobbing over moss hummocks & uneven slopes!)
    const rotAlpha = 1.0 - Math.exp(-16.0 * dt);
    camState.smoothYaw = mix(camState.smoothYaw, camState.yaw, rotAlpha);
    camState.smoothPitch = mix(camState.smoothPitch, camState.pitch, rotAlpha);

    const rightX = Math.cos(camState.smoothYaw);
    const rightZ = -Math.sin(camState.smoothYaw);
    const shoulderOff = bikeSys.state.riding ? 0.14 : mix(0.42, 0.34, inB);
    const targetLookX = px + rightX * shoulderOff;
    const baseEyeH = bikeSys.state.riding ? 1.48 : mix(1.56, 1.24, inB);
    const targetLookY = (porter.state.smoothBodyY !== undefined ? porter.state.smoothBodyY : porter.state.pos.y) + baseEyeH;
    const targetLookZ = pz + rightZ * shoulderOff;

    // Responsive XZ follow + heavily damped gimbal vertical Y follow (filters out high-frequency moss pillow bumps!)
    const fXZ = 1.0 - Math.exp(-(bikeSys.state.riding ? 16.0 : 11.0) * dt);
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
    const rideDistBoost = bikeSys.state.riding
      ? mix(0.85, 1.85, clamp(Math.abs(bikeSys.state.speed) / 26.0, 0, 1))
      : 0.0;
    let targetDist = mix(camState.distance + rideDistBoost, Math.min(camState.distance, 2.75), inB);
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
    const desiredY = camState.target.y + sp * camState.smoothDist + mix(0.24, 0.02, inB);
    const desiredZ = camState.target.z + rayZ * camState.smoothDist;

    let neededLift = 0.0;
    const caveCam = getRiverCaveState(desiredX, desiredZ, porter.state.pos.y);
    if (caveCam.inCave) {
      const clampedY = clamp(desiredY, caveCam.floorY + 1.0, caveCam.ceilingY - 1.1);
      neededLift = clampedY - desiredY;
    } else {
      let floorY = getTerrainHeight(desiredX, desiredZ) + 0.78;
      // Keep camera smoothly above glacial lake water surface so it never dips underwater!
      const camLk = sampleLake(desiredX, desiredZ, _camLakeTmp);
      if (camLk.lake && camLk.shoreMeters > -3.0) {
        floorY = Math.max(floorY, camLk.waterY + 0.65);
      }
      if (floorY > desiredY) neededLift = floorY - desiredY;
    }

    // Smoothly damp any remaining floor-clearance lift AND carry partial lift into lookAt so pitch angle stays rock-steady!
    const liftRate = neededLift > camState.smoothFloorLift ? 8.5 : 2.6;
    camState.smoothFloorLift = mix(camState.smoothFloorLift, neededLift, 1.0 - Math.exp(-liftRate * dt));

    // Lock camera directly to the already-smoothed gimbal pivot (eliminates double-lerp pitch oscillation!)
    camState.pos.set(desiredX, desiredY + camState.smoothFloorLift, desiredZ);
    landmarkSys.clampCameraPos(camState.target, camState.pos);
    camera.position.copy(camState.pos);
    camera.lookAt(camState.target.x, camState.target.y + mix(0.56, 0.16, inB) + camState.smoothFloorLift * 0.65, camState.target.z);
  }

  const elDoorPrompt = document.getElementById('door-prompt');
  if (elDoorPrompt) {
    const nearDoor = !bikeSys.state.riding
      ? landmarkSys.getNearestDoor(porter.state.pos.x, porter.state.pos.y, porter.state.pos.z)
      : null;
    if (nearDoor) {
      elDoorPrompt.textContent = `[E] ${nearDoor.isOpen ? 'Close' : 'Open'} ${nearDoor.label} Door`;
      elDoorPrompt.classList.remove('hidden');
    } else {
      elDoorPrompt.classList.add('hidden');
    }
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

  // Capture main scene render stats inside lakeScenePass
  composer.render();
}
const _camLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };
bootWorld();

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
  setAurora(mode, timeOffsetSec = null) {
    envCtrl.setAuroraMode(mode);
    if (typeof timeOffsetSec === 'number') {
      ATMO_UNIFORMS.uAuroraTime.value = timeOffsetSec;
    }
    for (let i = 0; i < 6; i++) envCtrl.update(0.35, porter.state.pos);
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
  teleportToLake(kind = 'medium') {
    teleportToFeature(kind === 'grand' ? 'grand_lake' : 'lake');
    composer.render();
  },
  getLakes() {
    const px = porter.state.pos.x;
    const pz = porter.state.pos.z;
    return getActiveLakesAround(px, pz, 12000).map((l) => ({
      id: l.id,
      tier: l.tier,
      cx: Math.round(l.cx),
      cz: Math.round(l.cz),
      diameterM: Math.round(l.rx * 2),
      widthM: Math.round(l.rz * 2),
      waterY: Number(l.waterY.toFixed(2)),
      maxDepthM: Math.round(l.maxDepth),
      distM: Math.round(Math.hypot(l.cx - px, l.cz - pz))
    }));
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
  printMotorcycle() {
    triggerPrintMotorcycle();
    composer.render();
  },
  setBikePrintProgress(p) {
    bikeSys.setPrintProgressForDebug(p, porter);
    porter.update(0.016, IDLE_INPUT, camState.yaw, terrainSys, landmarkSys);
    bikeSys.setPrintProgressForDebug(p, porter);
    refreshBikeHud();
    composer.render();
  },
  mountMotorcycle() {
    if (!bikeSys.state.exists || bikeSys.state.printing) {
      bikeSys.setPrintProgressForDebug(1.0, porter);
    }
    bikeSys.mount(porter);
    bikeSys.update(0.016, IDLE_INPUT, porter, terrainSys, landmarkSys);
    camState.yaw = bikeSys.state.yaw + Math.PI;
    syncCameraImmediate();
    refreshBikeHud();
    composer.render();
  },
  dismountMotorcycle() {
    bikeSys.dismount(porter, terrainSys, landmarkSys);
    refreshBikeHud();
    composer.render();
  },
  getBikeState() {
    return {
      exists: bikeSys.state.exists,
      printing: bikeSys.state.printing,
      printProgress: Number(bikeSys.state.printProgress.toFixed(3)),
      riding: bikeSys.state.riding,
      pos: bikeSys.state.pos.toArray(),
      groundY: Number(bikeSys.state.lastGroundY.toFixed(3)),
      speed: Number(bikeSys.state.speed.toFixed(2)),
      steerAngle: Number(bikeSys.state.steerAngle.toFixed(3)),
      frontTravel: Number(bikeSys.state.frontWheelTravel.toFixed(3)),
      rearTravel: Number(bikeSys.state.rearWheelTravel.toFixed(3)),
      terrainPitch: Number(bikeSys.state.terrainPitch.toFixed(3)),
      onRock: bikeSys.state.onRock,
      grounded: bikeSys.state.grounded,
      canMount: bikeSys.canMount(porter.state.pos)
    };
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
      auroraMode: envCtrl.state.auroraMode,
      auroraStrength: ATMO_UNIFORMS.uAuroraStrength.value,
      auroraProfile: ATMO_UNIFORMS.uAuroraProfile.value.toArray().map((v) => Number(v.toFixed(3))),
      nightFactor: ATMO_UNIFORMS.uNightFactor.value,
      calls: lastSceneCalls || renderer.info.render.calls,
      triangles: lastSceneTris || renderer.info.render.triangles,
      planarReflActive: lastReflRendered
    };
  },
  getNearestDoor() {
    const d = landmarkSys.getNearestDoor(porter.state.pos.x, porter.state.pos.y, porter.state.pos.z, 6.0);
    return d ? { id: d.id, label: d.label, isOpen: d.isOpen, openProgress: d.openProgress, worldX: d.worldX, worldY: d.worldY, worldZ: d.worldZ } : null;
  },
  getVillageBuildings() {
    const f = getCellFeatures(Math.round(porter.state.pos.x / 800), Math.round(porter.state.pos.z / 800));
    return f.village ? f.village.buildings.map((b) => ({ kind: b.kind, x: b.x, z: b.z, yaw: b.yaw, scale: b.scale || 1 })) : [];
  }
};
