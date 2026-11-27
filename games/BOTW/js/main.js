import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  WORLD_HALF,
  VOLCANO_POS,
  LAKE_BOUNDS,
  getQuayX,
  getCityTerraceY,
  getTerrainHeight,
  isInCityBounds,
  getCityDistrict,
  getHighwayInfo,
  HIGHWAY_SAMPLES,
  WATER_LEVEL,
  clamp
} from './noise.js';
import { createTextureLibrary } from './textures.js';
import {
  ATMO_UNIFORMS,
  createSkyDome,
  createDaylightSystem,
  dayNightSpec,
  formatTimeOfDay
} from './atmosphere.js';
import { createAssetManager, createLODManager } from './assets.js';
import { createTerrainSystem } from './terrain.js';
import { createWaterSystem } from './water.js';
import { createFoliageSystem } from './foliage.js';
import { createLandmarks } from './landmarks.js';
import { createAdventurer } from './character.js';
import { createModernCity, getCityGroundY } from './city.js';
import { createVehicleSystem } from './vehicles.js';
import { createCombatSystem } from './combat.js';

// ============================================================================
// 1. RENDERER, SCENE, CAMERA & BABYLON HDR MSAA POST-PROCESSING RESOLVE
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.35, 16000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const dpr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const rtWidth = Math.max(1, Math.floor(window.innerWidth * dpr));
const rtHeight = Math.max(1, Math.floor(window.innerHeight * dpr));
const msaaTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
  type: THREE.HalfFloatType,
  samples: 4
});

const composer = new EffectComposer(renderer, msaaTarget);
const renderPass = new RenderPass(scene, camera);
const sceneStats = { calls: 0, triangles: 0 };
const origRenderPassRender = renderPass.render.bind(renderPass);
renderPass.render = function (...args) {
  origRenderPassRender(...args);
  sceneStats.calls = renderer.info.render.calls;
  sceneStats.triangles = renderer.info.render.triangles;
};
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.22,  // subtle natural bloom
  0.28,
  2.6    // high HDR threshold: only solar disc, water glint, streetlamps & magma
);
composer.addPass(bloomPass);

// Babylon Exact Resolve Pass: Exposure + Balance + Sun Veil + Stephen Hill ACES + Warm Trim + Purkinje Night + Vignette + sRGB + Dither
const resolvePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uSunScreenUv: { value: new THREE.Vector2(0.8, 0.7) },
    uSunInView: { value: 0.0 },
    uSunColor: ATMO_UNIFORMS.uSunColor,
    uNightFactor: ATMO_UNIFORMS.uNightFactor,
    uExposure: { value: 1.0 },
    uBalance: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uContrast: { value: 1.05 },
    uSaturation: { value: 1.18 },
    uWarmSat: { value: 1.0 },
    uLift: { value: 0.0015 },
    uVignette: { value: 0.14 },
    uAspect: { value: window.innerWidth / Math.max(window.innerHeight, 1) },
    uNightGrade: { value: new THREE.Vector4(0.88, 0.98, 1.16, 0.62) },
    uNightRange: { value: new THREE.Vector3(0.0, 0.05, 0.36) },
    uDither: { value: 1.0 }
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
    uniform vec2 uSunScreenUv;
    uniform float uSunInView;
    uniform vec3 uSunColor;
    uniform float uNightFactor;
    uniform float uExposure;
    uniform vec3 uBalance;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uWarmSat;
    uniform float uLift;
    uniform float uVignette;
    uniform float uAspect;
    uniform vec4 uNightGrade;
    uniform vec3 uNightRange;
    uniform float uDither;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

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
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;

      // Subtle optical sun veil in linear HDR before tone mapping
      if (uSunInView > 0.01) {
        vec2 delta = (vUv - uSunScreenUv) * vec2(uAspect, 1.0);
        float veil = exp(-length(delta) * 3.8) * 0.065 * uSunInView * (1.0 - uNightFactor);
        c += uSunColor * veil;
      }

      // Calibrated mode exposure & white balance -> Exact Stephen Hill ACES Filmic
      c = max(c * uExposure * uBalance, 0.0);
      c = tmACES(c);

      // Display-linear contrast about 0.18 mid-grey + selective warm saturation trim
      c = 0.18 * pow(max(c, vec3(1e-6)) / 0.18, vec3(uContrast));
      float warm = smoothstep(0.1, 0.5, (c.r - c.b) / max(max(c.r, max(c.g, c.b)), 1e-4));
      c = mix(vec3(dot(c, LUMA)), c, uSaturation * mix(1.0, uWarmSat, warm));
      c = clamp(c, 0.0, 1.0);

      // Purkinje scotopic night grade: dims/cools moonlight while preserving warm windows, lamps & lava
      if (uNightRange.x > 0.001) {
        float nl = dot(c, LUMA);
        float nm = uNightRange.x * (1.0 - smoothstep(uNightRange.y, uNightRange.z, nl));
        c = mix(c, mix(vec3(nl), c, uNightGrade.a) * uNightGrade.rgb, nm);
      }

      // Subtle shadow lift + aspect-aware fourth-power lens vignette
      c += uLift * (1.0 - c) * (1.0 - c);
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) / length(vec2(uAspect, 1.0) * 0.5);
      float r2 = dot(q, q);
      c *= 1.0 - uVignette * r2 * r2;

      // IEC sRGB encoding + triangular IGN dither to eliminate 8-bit sky/haze banding
      c = mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-6)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      float d1 = ignDither(gl_FragCoord.xy);
      float d2 = ignDither(gl_FragCoord.xy + vec2(37.0, 17.0));
      c += (d1 + d2 - 1.0) * (uDither / 255.0);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
    }
  `
});
composer.addPass(resolvePass);

// ============================================================================
// 2. LIGHTING & BABYLON PRE-BAKED SKY-DRIVEN IBL
// ============================================================================
const hemiLight = new THREE.HemisphereLight(0xa9bcd9, 0xb9a27c, 0.35);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff4e2, 2.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 900;
const shadowExtent = 160;
sunLight.shadow.camera.left = -shadowExtent;
sunLight.shadow.camera.right = shadowExtent;
sunLight.shadow.camera.top = shadowExtent;
sunLight.shadow.camera.bottom = -shadowExtent;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight);
scene.add(sunLight.target);

// ============================================================================
// 3. BUILD WORLD SYSTEMS (SKY DOME + DAYLIGHT IBL, ASSETS, TERRAIN, CITY)
// ============================================================================
const texLib = createTextureLibrary();
const assetManager = createAssetManager(texLib);
const lodManager = createLODManager();

const skyDome = createSkyDome();
scene.add(skyDome.mesh);

const daylight = createDaylightSystem(renderer, scene, skyDome);

const terrainSystem = createTerrainSystem(texLib, assetManager);
scene.add(terrainSystem.root);

const waterSystem = createWaterSystem(texLib, assetManager, lodManager);
scene.add(waterSystem);

const foliageSystem = createFoliageSystem(texLib, assetManager, lodManager);
scene.add(foliageSystem.root);

const landmarks = createLandmarks(texLib, assetManager, lodManager);
scene.add(landmarks.root);

const adventurer = createAdventurer(texLib);
scene.add(adventurer.root);

const city = createModernCity(texLib, assetManager, lodManager);
scene.add(city.root);

const vehicles = createVehicleSystem(texLib, city, assetManager, lodManager);
scene.add(vehicles.root);

const combat = createCombatSystem(scene, adventurer, city, vehicles);

// ============================================================================
// 4. PLAYER PHYSICS, CAMERA ORBIT & ICONIC VISTA FRAMING
// ============================================================================
const VISTA_STATE = {
  playerPos: new THREE.Vector3(0.0, getTerrainHeight(0.0, 0.0), 0.0),
  playerYaw: 0.04,
  camYaw: 0.04,
  camPitch: 0.06,
  camDist: 7.4
};

const player = {
  pos: VISTA_STATE.playerPos.clone(),
  vel: new THREE.Vector3(),
  yaw: VISTA_STATE.playerYaw,
  onGround: true,
  gliding: false,
  sprinting: false,
  stamina: 1.0,
  exhausted: false,
  animPhase: 0,
  inVehicle: false,
  activeCar: null
};

const camState = {
  yaw: VISTA_STATE.camYaw,
  pitch: VISTA_STATE.camPitch,
  dist: VISTA_STATE.camDist,
  targetYaw: VISTA_STATE.camYaw,
  targetPitch: VISTA_STATE.camPitch,
  targetDist: VISTA_STATE.camDist,
  dragging: false,
  dragDist: 0,
  lastX: 0,
  lastY: 0,
  freePos: null,
  freeLook: null
};

const keys = {};
const touchInput = { x: 0, y: 0, sprint: false };

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

const sfxCallbacks = {
  onSlash: () => playSlashSfx(false),
  onSpin: () => playSlashSfx(true),
  onBolt: () => playBoltSfx(),
  onImpact: () => playImpactSfx(),
  onKill: (npc) => showToast(`+$${npc.cashReward || 25}`),
  onPlayerHit: (dmg, attacker) => {
    combat.hurtPlayer(dmg, attacker, {
      onKnockout: () => {
        showToast('Revived at Overlook!');
        resetToIconicVista();
      }
    });
  },
  onCrime: (stars) => combat.addWanted(stars)
};

function exitActiveCar() {
  if (!player.inVehicle || !player.activeCar) return false;
  const exitPos = vehicles.exitCar(player.activeCar);
  player.inVehicle = false;
  player.activeCar = null;
  adventurer.root.visible = true;
  if (exitPos) player.pos.copy(exitPos);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  camState.targetDist = Math.min(camState.targetDist, 7.6);
  showToast('Exited Vehicle');
  return true;
}

function hijackOrExitCar() {
  if (player.inVehicle) {
    return exitActiveCar();
  }
  const near = vehicles.findNearestCar(player.pos, 5.8);
  if (!near) {
    showToast('No car nearby');
    return false;
  }
  const res = vehicles.enterOrRobCar(near.car);
  player.inVehicle = true;
  player.activeCar = near.car;
  player.gliding = false;
  adventurer.root.visible = false;
  camState.targetDist = Math.max(camState.targetDist, 9.2);
  camState.targetPitch = Math.max(camState.targetPitch, 0.16);
  if (res.stolen) {
    combat.addWanted(1);
    playHijackSfx();
    showToast(`Robbed ${res.label}! +1 ★`);
  } else {
    showToast(`Driving ${res.label}`);
  }
  return true;
}

function warpPlayer(x, z, yaw, camYaw, camPitch, camDist, toastMsg) {
  if (player.inVehicle) exitActiveCar();
  camState.freePos = null;
  camState.freeLook = null;
  player.pos.set(x, getCityGroundY(x, z), z);
  player.vel.set(0, 0, 0);
  player.yaw = yaw;
  player.onGround = true;
  player.gliding = false;
  player.stamina = 1.0;
  player.exhausted = false;
  camState.yaw = camState.targetYaw = camYaw;
  camState.pitch = camState.targetPitch = camPitch;
  camState.dist = camState.targetDist = camDist;
  if (toastMsg) showToast(toastMsg);
}

function resetToIconicVista() {
  warpPlayer(
    VISTA_STATE.playerPos.x,
    VISTA_STATE.playerPos.z,
    VISTA_STATE.playerYaw,
    VISTA_STATE.camYaw,
    VISTA_STATE.camPitch,
    VISTA_STATE.camDist,
    'Great Plateau Overlook'
  );
  player.pos.y = getTerrainHeight(player.pos.x, player.pos.z);
}

function teleportToCity() {
  warpPlayer(-335.0, -551.2, -Math.PI * 0.5 + 0.08, -Math.PI * 0.5 + 0.10, 0.10, 8.8, 'Citadel Financial District');
}

function teleportToMarina() {
  warpPlayer(getQuayX(-560.0) + 6.0, -560.0, -Math.PI * 0.5, -Math.PI * 0.5 + 0.06, 0.08, 8.0, 'Lakefront Marina');
}

function teleportToHighway() {
  warpPlayer(210.0, -125.0, Math.PI * 0.5, Math.PI * 0.5 + 0.14, 0.11, 8.6, 'Hyrule Ring Expressway');
}

// Keyboard & Pointer Controls
window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
    e.preventDefault();
  }
  if (code === 'Space' && !keys[code] && !player.inVehicle) {
    handleJumpOrGlide();
  }
  if ((code === 'KeyE' || code === 'KeyF') && !keys[code]) hijackOrExitCar();
  if (code === 'KeyJ' && !keys[code]) combat.triggerLightAttack(player, sfxCallbacks);
  if (code === 'KeyK' && !keys[code]) combat.triggerSpinAttack(player, sfxCallbacks);
  if (code === 'KeyR' && !keys[code]) combat.triggerEnergyShot(player, player.inVehicle ? player.activeCar.yaw : player.yaw, sfxCallbacks);
  if (code === 'KeyG' && !keys[code] && player.inVehicle) playHornSfx();
  if (code === 'KeyC' && !keys[code]) teleportToCity();
  if (code === 'KeyB' && !keys[code]) teleportToMarina();
  if (code === 'KeyN' && !keys[code]) teleportToHighway();
  if (code === 'KeyV') resetToIconicVista();
  if (code === 'KeyM') toggleAudio();
  if (code === 'KeyH') toggleHUD();
  keys[code] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function handleJumpOrGlide() {
  if (player.inVehicle) return;
  if (player.onGround) {
    player.vel.y = 10.8;
    player.onGround = false;
    player.gliding = false;
  } else if (!player.gliding && player.stamina > 0.08 && !player.exhausted) {
    player.gliding = true;
    if (player.vel.y < -2.0) player.vel.y = -2.0;
    showToast('Paraglider Deployed');
  } else if (player.gliding) {
    player.gliding = false;
  }
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    combat.triggerSpinAttack(player, sfxCallbacks);
    return;
  }
  camState.dragging = true;
  camState.dragDist = 0;
  camState.lastX = e.clientX;
  camState.lastY = e.clientY;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && camState.dragging && camState.dragDist < 6) {
    combat.triggerLightAttack(player, sfxCallbacks);
  }
  camState.dragging = false;
});

window.addEventListener('mousemove', (e) => {
  if (!camState.dragging && document.pointerLockElement !== renderer.domElement) return;
  const dx = document.pointerLockElement === renderer.domElement ? e.movementX : (e.clientX - camState.lastX);
  const dy = document.pointerLockElement === renderer.domElement ? e.movementY : (e.clientY - camState.lastY);
  camState.dragDist += Math.hypot(dx, dy);
  camState.lastX = e.clientX;
  camState.lastY = e.clientY;
  camState.targetYaw -= dx * 0.0052;
  camState.targetPitch = clamp(camState.targetPitch + dy * 0.0046, -0.55, 1.12);
});

renderer.domElement.addEventListener('wheel', (e) => {
  camState.targetDist = clamp(camState.targetDist + e.deltaY * 0.008, 3.8, 22.0);
}, { passive: true });

// Touch Controls
let camTouchId = null;
renderer.domElement.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    camTouchId = e.touches[0].identifier;
    camState.lastX = e.touches[0].clientX;
    camState.lastY = e.touches[0].clientY;
  }
}, { passive: true });

renderer.domElement.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === camTouchId) {
      const dx = t.clientX - camState.lastX;
      const dy = t.clientY - camState.lastY;
      camState.lastX = t.clientX;
      camState.lastY = t.clientY;
      camState.targetYaw -= dx * 0.006;
      camState.targetPitch = clamp(camState.targetPitch + dy * 0.005, -0.55, 1.12);
    }
  }
}, { passive: true });

const touchPad = document.getElementById('touch-pad');
const touchKnob = document.getElementById('touch-knob');
let joyTouchId = null;
touchPad.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  joyTouchId = e.changedTouches[0].identifier;
}, { passive: true });
touchPad.addEventListener('touchmove', (e) => {
  e.stopPropagation();
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) {
      const rect = touchPad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width * 0.36;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      touchKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      touchInput.x = dx / maxR;
      touchInput.y = dy / maxR;
    }
  }
}, { passive: true });
const resetJoy = () => {
  joyTouchId = null;
  touchInput.x = 0;
  touchInput.y = 0;
  touchKnob.style.transform = 'translate(0px, 0px)';
};
touchPad.addEventListener('touchend', resetJoy);
touchPad.addEventListener('touchcancel', resetJoy);

document.getElementById('touch-jump').addEventListener('touchstart', (e) => { e.preventDefault(); handleJumpOrGlide(); });
document.getElementById('touch-sprint').addEventListener('touchstart', (e) => { e.preventDefault(); touchInput.sprint = true; });
document.getElementById('touch-sprint').addEventListener('touchend', () => { touchInput.sprint = false; });
document.getElementById('touch-attack').addEventListener('touchstart', (e) => { e.preventDefault(); combat.triggerLightAttack(player, sfxCallbacks); });
document.getElementById('touch-car').addEventListener('touchstart', (e) => { e.preventDefault(); hijackOrExitCar(); });

// ============================================================================
// 5. BABYLON 24-HOUR ASTRONOMICAL DAYLIGHT CONTROLLER & HUD SYNC
// ============================================================================
const todSlider = document.getElementById('tod-slider');
const todText = document.getElementById('tod-text');
const todPlayBtn = document.getElementById('tod-play');
const todSpeedBtn = document.getElementById('tod-speed');
const modePillEls = Array.from(document.querySelectorAll('#mode-pills .mode-pill'));

let dayTime = 0.06;
let dayRunning = true;
let daySpeed = 1;
const DAY_CYCLE_SEC = 150.0;
let pinnedMode = null;
let lastDayHudMs = -1000;
let activeDayState = null;
let todSliderDragging = false;
const MODE_DAYTIME = { morning: 0.0, afternoon: 0.16, golden: 0.34, blue: 0.65 };
const MODE_LABELS = { morning: 'Morning', afternoon: 'Afternoon', golden: 'Golden Hour', blue: 'Night' };

function syncDaylightHud(force = false) {
  if (todText) {
    todText.textContent = pinnedMode
      ? `${MODE_LABELS[pinnedMode] || pinnedMode} \u00B7 Locked`
      : formatTimeOfDay(dayTime);
  }
  if (todSlider && (force || !todSliderDragging)) {
    todSlider.value = String(Math.round(((dayTime % 1.0) + 1.0) % 1.0 * 1000));
  }
  if (todPlayBtn) {
    const running = dayRunning && !pinnedMode;
    todPlayBtn.textContent = running ? 'Pause' : 'Play';
    todPlayBtn.classList.toggle('active', !running);
  }
  if (todSpeedBtn) {
    todSpeedBtn.textContent = `${daySpeed}x`;
    todSpeedBtn.classList.toggle('active', daySpeed > 1);
  }
  modePillEls.forEach((el) => {
    el.classList.toggle('active', el.dataset.mode === pinnedMode);
  });
}

function applyDaylight(tSec, forceHud = false) {
  const spec = pinnedMode ? { a: pinnedMode, b: pinnedMode, k: 0 } : dayNightSpec(dayTime);
  const st = daylight.update(spec, {
    sunLight,
    hemiLight,
    camPos: camera.position,
    fov: camera.fov,
    viewH: window.innerHeight,
    t: tSec
  });
  activeDayState = st;
  sunLight.castShadow = st.keyIntensity > 0.04;

  const u = resolvePass.uniforms;
  u.uExposure.value = st.exposure;
  u.uBalance.value.set(st.grade.balance[0], st.grade.balance[1], st.grade.balance[2]);
  u.uContrast.value = st.grade.contrast;
  u.uSaturation.value = st.grade.saturation;
  u.uWarmSat.value = st.grade.warmSat;
  u.uNightRange.value.x = st.night;

  const nowMs = performance.now();
  if (forceHud || nowMs - lastDayHudMs >= 150) {
    lastDayHudMs = nowMs;
    syncDaylightHud(forceHud);
  }
}

if (todSlider) {
  todSlider.addEventListener('pointerdown', () => { todSliderDragging = true; });
  window.addEventListener('pointerup', () => { todSliderDragging = false; });
  todSlider.addEventListener('input', (e) => {
    pinnedMode = null;
    dayTime = clamp(parseFloat(e.target.value) / 1000.0, 0.0, 1.0);
    applyDaylight(ATMO_UNIFORMS.uTime.value, true);
  });
}
if (todPlayBtn) {
  todPlayBtn.addEventListener('click', () => {
    if (pinnedMode) {
      pinnedMode = null;
      dayRunning = true;
    } else {
      dayRunning = !dayRunning;
    }
    applyDaylight(ATMO_UNIFORMS.uTime.value, true);
  });
}
if (todSpeedBtn) {
  todSpeedBtn.addEventListener('click', () => {
    daySpeed = daySpeed === 1 ? 3 : daySpeed === 3 ? 8 : 1;
    syncDaylightHud(true);
  });
}
modePillEls.forEach((btn) => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.mode;
    if (pinnedMode === m) {
      pinnedMode = null;
    } else {
      pinnedMode = m;
      if (MODE_DAYTIME[m] !== undefined) dayTime = MODE_DAYTIME[m];
    }
    applyDaylight(ATMO_UNIFORMS.uTime.value, true);
  });
});

// ============================================================================
// 6. PROCEDURAL WEB AUDIO SOUNDSCAPE (WIND + SPARSE PIANO)
// ============================================================================
let audioCtx = null;
let audioRunning = false;
let windGain = null;
let pianoTimer = null;

function toggleAudio() {
  const btn = document.getElementById('btn-audio');
  if (!audioRunning) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufSize = audioCtx.sampleRate * 3;
        const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.4;
        }
        const noiseSrc = audioCtx.createBufferSource();
        noiseSrc.buffer = buffer;
        noiseSrc.loop = true;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 340;
        filter.Q.value = 0.85;

        windGain = audioCtx.createGain();
        windGain.gain.value = 0.0;

        noiseSrc.connect(filter);
        filter.connect(windGain);
        windGain.connect(audioCtx.destination);
        noiseSrc.start();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      windGain.gain.setTargetAtTime(0.11, audioCtx.currentTime, 0.8);
      audioRunning = true;
      btn.textContent = 'Audio: On';
      btn.classList.add('active');
      scheduleBotWPianoNote();
      showToast('Ambient Soundscape On');
    } catch {
      showToast('Audio unavailable');
    }
  } else {
    if (windGain && audioCtx) {
      windGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.4);
    }
    clearTimeout(pianoTimer);
    audioRunning = false;
    btn.textContent = 'Audio: Off';
    btn.classList.remove('active');
  }
}

const PIANO_FREQS = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];
function scheduleBotWPianoNote() {
  if (!audioRunning || !audioCtx) return;
  const playPhrase = () => {
    if (!audioRunning) return;
    const notesInPhrase = Math.random() < 0.55 ? 2 : 3;
    for (let n = 0; n < notesInPhrase; n++) {
      const delay = n * (0.45 + Math.random() * 0.55);
      const freq = PIANO_FREQS[Math.floor(Math.random() * PIANO_FREQS.length)];
      const t0 = audioCtx.currentTime + delay;

      const osc = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 2.0;

      const g2 = audioCtx.createGain();
      g2.gain.value = 0.08;

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.055, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);

      osc.connect(gain);
      osc2.connect(g2);
      g2.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(t0);
      osc2.start(t0);
      osc.stop(t0 + 3.5);
      osc2.stop(t0 + 3.5);
    }
    pianoTimer = setTimeout(scheduleBotWPianoNote, 3200 + Math.random() * 4800);
  };
  playPhrase();
}

function playTone(freqStart, freqEnd, dur, type = 'triangle', vol = 0.08) {
  if (!audioRunning || !audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function playSlashSfx(isSpin = false) {
  playTone(isSpin ? 620 : 480, 140, isSpin ? 0.34 : 0.16, 'sawtooth', isSpin ? 0.07 : 0.05);
}
function playImpactSfx() {
  playTone(180, 52, 0.14, 'square', 0.09);
}
function playBoltSfx() {
  playTone(940, 320, 0.18, 'sine', 0.06);
}
function playHornSfx() {
  playTone(392, 385, 0.24, 'sawtooth', 0.07);
  playTone(494, 488, 0.24, 'sawtooth', 0.06);
}
function playHijackSfx() {
  playTone(540, 220, 0.20, 'triangle', 0.08);
}

document.getElementById('btn-city').addEventListener('click', teleportToCity);
const btnMarinaEl = document.getElementById('btn-marina');
if (btnMarinaEl) btnMarinaEl.addEventListener('click', teleportToMarina);
const btnHighwayEl = document.getElementById('btn-highway');
if (btnHighwayEl) btnHighwayEl.addEventListener('click', teleportToHighway);
document.getElementById('btn-vista').addEventListener('click', resetToIconicVista);
document.getElementById('btn-audio').addEventListener('click', toggleAudio);
function toggleHUD() {
  document.getElementById('hud').classList.toggle('hidden');
}
document.getElementById('btn-hide').addEventListener('click', toggleHUD);

// ============================================================================
// 7. MAIN UPDATE & RENDER LOOP
// ============================================================================
const staminaContainer = document.getElementById('stamina-container');
const staminaArc = document.getElementById('stamina-arc');
const compassRing = document.getElementById('compass-ring');
const regionNameEl = document.getElementById('region-name');
const heartEls = Array.from(document.querySelectorAll('#hearts-bar .heart'));
const cashBadgeEl = document.getElementById('cash-badge');
const wantedWrapEl = document.getElementById('wanted-stars');
const wantedStarEls = Array.from(document.querySelectorAll('#wanted-stars .wanted-star'));
const carPromptEl = document.getElementById('car-prompt');
const speedoHudEl = document.getElementById('speedo-hud');
const speedoValEl = document.getElementById('speedo-val');
const speedoNameEl = document.getElementById('speedo-name');
const STAMINA_CIRCUMFERENCE = 2 * Math.PI * 24;

const moveDir = new THREE.Vector3();
const forwardVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const sunProjVec = new THREE.Vector3();

let lastFrameMs = performance.now();
let smoothFps = 60;

function resolvePlayerBuildingCollision() {
  const r = 0.55;
  for (let i = 0; i < city.colliders.length; i++) {
    const c = city.colliders[i];
    if (player.pos.y > c.maxY) continue;
    if (player.pos.x + r > c.minX && player.pos.x - r < c.maxX && player.pos.z + r > c.minZ && player.pos.z - r < c.maxZ) {
      const dl = Math.abs(player.pos.x - c.minX);
      const dr = Math.abs(c.maxX - player.pos.x);
      const dt = Math.abs(player.pos.z - c.minZ);
      const db = Math.abs(c.maxZ - player.pos.z);
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) player.pos.x = c.minX - r;
      else if (m === dr) player.pos.x = c.maxX + r;
      else if (m === dt) player.pos.z = c.minZ - r;
      else player.pos.z = c.maxZ + r;
    }
  }
}

function updatePlayer(dt) {
  let ix = touchInput.x;
  let iy = touchInput.y;
  if (keys['KeyW'] || keys['ArrowUp']) iy -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) iy += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) ix += 1;

  const t = ATMO_UNIFORMS.uTime.value;

  if (player.inVehicle && player.activeCar) {
    player.sprinting = false;
    player.gliding = false;
    player.stamina = Math.min(1.0, player.stamina + dt * 0.45);
    player.exhausted = false;
    player.pos.copy(player.activeCar.pos);
    player.yaw = player.activeCar.yaw;
    staminaContainer.classList.remove('visible');
  } else {
    const inputMag = Math.min(1, Math.hypot(ix, iy));
    const wantSprint = (keys['ShiftLeft'] || keys['ShiftRight'] || touchInput.sprint) && inputMag > 0.1 && player.onGround;

    if (wantSprint && !player.exhausted && player.stamina > 0.02) {
      player.sprinting = true;
      player.stamina = Math.max(0, player.stamina - dt * 0.28);
      if (player.stamina <= 0.01) player.exhausted = true;
    } else {
      player.sprinting = false;
      if (player.gliding) {
        player.stamina = Math.max(0, player.stamina - dt * 0.095);
        if (player.stamina <= 0.01) {
          player.gliding = false;
          player.exhausted = true;
        }
      } else {
        player.stamina = Math.min(1.0, player.stamina + dt * 0.36);
        if (player.exhausted && player.stamina > 0.35) player.exhausted = false;
      }
    }

    forwardVec.set(-Math.sin(camState.yaw), 0, -Math.cos(camState.yaw));
    rightVec.set(Math.cos(camState.yaw), 0, -Math.sin(camState.yaw));
    moveDir.set(0, 0, 0);
    if (inputMag > 0.05) {
      moveDir.addScaledVector(forwardVec, -iy);
      moveDir.addScaledVector(rightVec, ix);
      moveDir.normalize();
    }

    const maxSpeed = player.gliding ? 15.5 : (player.sprinting ? 12.2 : 6.8);
    const accel = player.onGround ? 14.0 : 4.2;
    player.vel.x = THREE.MathUtils.lerp(player.vel.x, moveDir.x * maxSpeed, Math.min(1, accel * dt));
    player.vel.z = THREE.MathUtils.lerp(player.vel.z, moveDir.z * maxSpeed, Math.min(1, accel * dt));

    if (inputMag > 0.08) {
      const targetYaw = Math.atan2(-moveDir.x, -moveDir.z);
      let diff = targetYaw - player.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.yaw += diff * Math.min(1, 10.5 * dt);
    }

    if (player.gliding) {
      let lift = 0;
      for (const th of landmarks.thermals) {
        const d = Math.hypot(player.pos.x - th.x, player.pos.z - th.z);
        if (d < th.radius) {
          lift = Math.max(lift, th.strength * (1.0 - d / th.radius));
        }
      }
      const targetVy = lift > 0 ? Math.min(8.5, lift) : -2.6;
      player.vel.y = THREE.MathUtils.lerp(player.vel.y, targetVy, Math.min(1, 3.8 * dt));
    } else {
      player.vel.y -= 26.0 * dt;
    }

    player.pos.addScaledVector(player.vel, dt);
    player.pos.x = clamp(player.pos.x, -5600, 5600);
    player.pos.z = clamp(player.pos.z, -5600, 5600);
    resolvePlayerBuildingCollision();

    const groundY = Math.max(WATER_LEVEL + 0.15, getCityGroundY(player.pos.x, player.pos.z));
    if (player.pos.y <= groundY + 0.05 && player.vel.y <= 0) {
      player.pos.y = groundY;
      player.vel.y = 0;
      player.onGround = true;
      player.gliding = false;
    } else if (player.pos.y > groundY + 0.35) {
      player.onGround = false;
    }

    adventurer.root.position.copy(player.pos);
    adventurer.root.rotation.y = player.yaw;
    adventurer.gliderGroup.visible = player.gliding;

    const horizSpeed = Math.hypot(player.vel.x, player.vel.z);

    if (player.gliding) {
      adventurer.bodyPivot.rotation.x = 0.22;
      adventurer.leftArm.rotation.x = -2.85;
      adventurer.rightArm.rotation.x = -2.85;
      adventurer.leftLeg.rotation.x = 0.25 + Math.sin(t * 4.0) * 0.08;
      adventurer.rightLeg.rotation.x = 0.15 - Math.sin(t * 4.0) * 0.08;
      adventurer.gliderGroup.rotation.z = Math.sin(t * 2.5) * 0.04;
      adventurer.scarf.rotation.x = 0.85 + Math.sin(t * 9.0) * 0.18;
    } else if (!player.onGround) {
      adventurer.bodyPivot.rotation.x = 0.08;
      adventurer.leftArm.rotation.x = -0.9;
      adventurer.rightArm.rotation.x = -0.9;
      adventurer.leftLeg.rotation.x = 0.35;
      adventurer.rightLeg.rotation.x = -0.25;
      adventurer.scarf.rotation.x = 0.65 + Math.sin(t * 7.0) * 0.16;
    } else if (horizSpeed > 0.4) {
      player.animPhase += dt * (player.sprinting ? 14.5 : 9.2);
      const swing = Math.sin(player.animPhase) * (player.sprinting ? 0.85 : 0.55);
      adventurer.bodyPivot.rotation.x = player.sprinting ? 0.16 : 0.06;
      adventurer.bodyPivot.position.y = Math.abs(Math.cos(player.animPhase)) * 0.07;
      adventurer.leftLeg.rotation.x = swing;
      adventurer.rightLeg.rotation.x = -swing;
      adventurer.leftArm.rotation.x = -swing * 0.8;
      adventurer.rightArm.rotation.x = swing * 0.8;
      adventurer.scarf.rotation.x = (player.sprinting ? 0.72 : 0.45) + Math.sin(t * 6.5) * 0.12;
    } else {
      adventurer.bodyPivot.rotation.x = 0;
      adventurer.bodyPivot.position.y = Math.sin(t * 2.2) * 0.015;
      adventurer.leftLeg.rotation.x = THREE.MathUtils.lerp(adventurer.leftLeg.rotation.x, 0, 8 * dt);
      adventurer.rightLeg.rotation.x = THREE.MathUtils.lerp(adventurer.rightLeg.rotation.x, 0, 8 * dt);
      adventurer.leftArm.rotation.x = THREE.MathUtils.lerp(adventurer.leftArm.rotation.x, 0.04, 8 * dt);
      adventurer.rightArm.rotation.x = THREE.MathUtils.lerp(adventurer.rightArm.rotation.x, -0.04, 8 * dt);
      adventurer.scarf.rotation.x = 0.28 + Math.sin(t * 2.4) * 0.09;
    }
    adventurer.ponytail.rotation.z = Math.sin(t * 3.1) * 0.11;
    adventurer.scarf.rotation.z = Math.sin(t * 2.7 + 0.5) * 0.08;

    const showStamina = player.stamina < 0.99 || player.gliding || player.sprinting;
    staminaContainer.classList.toggle('visible', showStamina);
    staminaArc.style.strokeDashoffset = (STAMINA_CIRCUMFERENCE * (1.0 - player.stamina)).toFixed(2);
    staminaArc.style.stroke = (player.exhausted || player.stamina < 0.25) ? '#ff6b4a' : '#58f287';
  }

  // Update Vehicle Drive Input, City NPCs & Combat Systems
  const driveInput = {
    throttle: (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - touchInput.y,
    steer: (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + touchInput.x,
    handbrake: !!(keys['Space']),
    nitro: !!(keys['ShiftLeft'] || keys['ShiftRight'] || touchInput.sprint)
  };
  vehicles.update(dt, t, driveInput, player, combat.state.wantedStars, sfxCallbacks);
  city.update(dt, t, player, combat.state.wantedStars, sfxCallbacks);
  combat.update(dt, player, sfxCallbacks);

  // Sync HUD Status (Region Badge, Hearts, Cash, Wanted Stars, Car Prompt, Speedometer)
  const district = getCityDistrict(player.pos.x, player.pos.z);
  const hw = getHighwayInfo(player.pos.x, player.pos.z);
  const inLake = Math.hypot((player.pos.x - LAKE_BOUNDS.cx) / LAKE_BOUNDS.rx, (player.pos.z - LAKE_BOUNDS.cz) / LAKE_BOUNDS.rz) < 0.96;
  if (district === 'citadel') regionNameEl.textContent = 'Citadel Financial District';
  else if (district === 'waterfront') regionNameEl.textContent = 'Lakefront Marina';
  else if (district === 'midtown') regionNameEl.textContent = 'Midtown Avenue';
  else if (district === 'urban_sea' || isInCityBounds(player.pos.x, player.pos.z, 14)) regionNameEl.textContent = 'New Hyrule Metro';
  else if (hw.dist < 14) regionNameEl.textContent = 'Hyrule Ring Expressway';
  else if (player.pos.z > -35 && player.pos.y > 54) regionNameEl.textContent = 'Great Plateau Overlook';
  else if (player.pos.x > 2100) regionNameEl.textContent = 'Red-Rock Canyon';
  else if (inLake) regionNameEl.textContent = 'Great Lake Hylia';
  else if (Math.hypot(player.pos.x - 150, player.pos.z + 1500) > 2600) regionNameEl.textContent = 'Alpine Highlands';
  else regionNameEl.textContent = 'Hyrule Emerald Valley';

  const filledHearts = Math.ceil((combat.state.health / combat.state.maxHealth) * heartEls.length);
  heartEls.forEach((el, idx) => el.classList.toggle('empty', idx >= filledHearts));
  if (cashBadgeEl) cashBadgeEl.textContent = `$${combat.state.cash}`;
  if (wantedWrapEl) wantedWrapEl.classList.toggle('active', combat.state.wantedStars > 0);
  wantedStarEls.forEach((el, idx) => el.classList.toggle('off', idx >= combat.state.wantedStars));

  if (player.inVehicle && player.activeCar) {
    if (carPromptEl) carPromptEl.classList.remove('show');
    if (speedoHudEl) speedoHudEl.classList.add('active');
    if (speedoValEl) speedoValEl.textContent = `${Math.round(Math.abs(player.activeCar.speed) * 3.6)} KM/H`;
    if (speedoNameEl) speedoNameEl.textContent = `${player.activeCar.spec.label} • [E] Exit`;
  } else {
    if (speedoHudEl) speedoHudEl.classList.remove('active');
    const near = vehicles.findNearestCar(player.pos, 5.8);
    if (carPromptEl) {
      if (near) {
        carPromptEl.textContent = near.car.hasAiDriver
          ? `[E] Rob ${near.car.spec.label}`
          : `[E] Drive ${near.car.spec.label}`;
        carPromptEl.classList.add('show');
      } else {
        carPromptEl.classList.remove('show');
      }
    }
  }

  ATMO_UNIFORMS.uPlayerPos.value.copy(player.pos);
}

// ============================================================================
// GTA LIVE RADAR MINIMAP RENDERER
// ============================================================================
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
let lastMinimapMs = -1000;

function drawMinimap(nowMs) {
  if (!minimapCtx || nowMs - lastMinimapMs < 48) return;
  lastMinimapMs = nowMs;

  const ctx = minimapCtx;
  const W = 156;
  const H = 156;
  const cx = W * 0.5;
  const cy = H * 0.5;
  const scale = 0.16; // ~975m radar diameter
  const rot = camState.yaw;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  const toRadar = (wx, wz) => {
    const dx = (wx - player.pos.x) * scale;
    const dz = (wz - player.pos.z) * scale;
    return [cx + dx * cosR - dz * sinR, cy + dx * sinR + dz * cosR];
  };

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#19261d';
  ctx.fillRect(0, 0, W, H);

  // Huge Great Lake Hylia ellipse on radar
  ctx.save();
  const [lx, ly] = toRadar(LAKE_BOUNDS.cx, LAKE_BOUNDS.cz);
  ctx.translate(lx, ly);
  ctx.rotate(rot);
  ctx.fillStyle = '#154958';
  ctx.beginPath();
  ctx.ellipse(0, 0, LAKE_BOUNDS.rx * scale, LAKE_BOUNDS.rz * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Western land / city apron mask over western shore up to curved quay
  ctx.fillStyle = '#1f2622';
  ctx.beginPath();
  const [qxStart, qyStart] = toRadar(-WORLD_HALF * 0.4, -1750);
  ctx.moveTo(qxStart, qyStart);
  for (let z = -1750; z <= -140; z += 60) {
    const [rx, ry] = toRadar(getQuayX(z), z);
    ctx.lineTo(rx, ry);
  }
  const [qxEnd, qyEnd] = toRadar(-WORLD_HALF * 0.4, -140);
  ctx.lineTo(qxEnd, qyEnd);
  ctx.closePath();
  ctx.fill();

  // Curved Stone Waterfront Quay line
  ctx.strokeStyle = '#9b917c';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  for (let z = -1740; z <= -140; z += 60) {
    const [rx, ry] = toRadar(getQuayX(z), z);
    if (z === -1740) ctx.moveTo(rx, ry);
    else ctx.lineTo(rx, ry);
  }
  ctx.stroke();

  // Ring Expressway Loop
  ctx.strokeStyle = '#626870';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  for (let i = 0; i < HIGHWAY_SAMPLES.length; i += 2) {
    const s = HIGHWAY_SAMPLES[i];
    const [rx, ry] = toRadar(s.x, s.z);
    if (i === 0) ctx.moveTo(rx, ry);
    else ctx.lineTo(rx, ry);
  }
  ctx.closePath();
  ctx.stroke();

  // City Organic Street Polylines (culled outside ~620m radius)
  ctx.strokeStyle = '#3c424b';
  ctx.lineCap = 'round';
  const streets = city.layout ? city.layout.streets : [];
  for (let si = 0; si < streets.length; si++) {
    const st = streets[si];
    ctx.lineWidth = st.kind === 'boulevard' ? 3.4 : st.kind === 'main' ? 2.4 : 1.5;
    for (let j = 0; j < st.pts.length - 1; j++) {
      const a = st.pts[j];
      const b = st.pts[j + 1];
      const mx = (a[0] + b[0]) * 0.5;
      const mz = (a[1] + b[1]) * 0.5;
      if (Math.hypot(mx - player.pos.x, mz - player.pos.z) > 620.0) continue;
      const [x0, y0] = toRadar(a[0], a[1]);
      const [x1, y1] = toRadar(b[0], b[1]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  // Nearby City Building Footprints (culled > 550m in X or Z)
  ctx.fillStyle = 'rgba(136, 149, 166, 0.42)';
  for (let i = 0; i < city.colliders.length; i++) {
    const c = city.colliders[i];
    const bcx = (c.minX + c.maxX) * 0.5;
    const bcz = (c.minZ + c.maxZ) * 0.5;
    if (Math.abs(bcx - player.pos.x) > 550 || Math.abs(bcz - player.pos.z) > 550) continue;
    const [p0x, p0y] = toRadar(c.minX, c.minZ);
    const [p1x, p1y] = toRadar(c.maxX, c.minZ);
    const [p2x, p2y] = toRadar(c.maxX, c.maxZ);
    const [p3x, p3y] = toRadar(c.minX, c.maxZ);
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.closePath();
    ctx.fill();
  }

  // Nearby Vehicles + Police Siren Dots
  const sirenFlash = Math.floor(nowMs * 0.008) % 2 === 0;
  for (let i = 0; i < vehicles.cars.length; i++) {
    const car = vehicles.cars[i];
    if (car.isPlayerDriven) continue;
    const [vx, vy] = toRadar(car.pos.x, car.pos.z);
    if (vx < 4 || vx > W - 4 || vy < 4 || vy > H - 4) continue;
    ctx.fillStyle =
      car.spec.isPolice && combat.state.wantedStars > 0
        ? (sirenFlash ? '#ff3838' : '#3898ff')
        : (car.hasAiDriver ? '#d8dfe6' : '#58f287');
    ctx.beginPath();
    ctx.arc(vx, vy, car.spec.isPolice ? 3.2 : 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Centered Player Orientation Chevron
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-(player.yaw - camState.yaw));
  ctx.fillStyle = '#e6cf8b';
  ctx.strokeStyle = '#12161c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const shadowDirVec = new THREE.Vector3();
const shadowUpRef = new THREE.Vector3(0, 1, 0);
const shadowRightVec = new THREE.Vector3();
const shadowUpVec = new THREE.Vector3();
const camFwdVec = new THREE.Vector3();
const SHADOW_TEXEL = (2.0 * shadowExtent) / 2048.0;

function updateCameraAndSun(dt) {
  let lookFocus = player.pos;
  if (camState.freePos && camState.freeLook) {
    camera.position.copy(camState.freePos);
    camera.lookAt(camState.freeLook);
    lookFocus = camState.freeLook;
  } else {
    if (player.inVehicle && player.activeCar && !camState.dragging && Math.abs(player.activeCar.speed) > 3.5) {
      let diff = player.activeCar.yaw - camState.targetYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      camState.targetYaw += diff * Math.min(1, 2.4 * dt);
    }

    camState.yaw = THREE.MathUtils.lerp(camState.yaw, camState.targetYaw, Math.min(1, 9.5 * dt));
    camState.pitch = THREE.MathUtils.lerp(camState.pitch, camState.targetPitch, Math.min(1, 9.5 * dt));
    camState.dist = THREE.MathUtils.lerp(camState.dist, camState.targetDist, Math.min(1, 8.0 * dt));

    const targetOffsetY = player.inVehicle ? 1.45 : 2.55;
    const shakeAmt = combat.state.cameraShake;
    const sx = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt : 0;
    const sy = shakeAmt > 0 ? (Math.random() - 0.5) * shakeAmt : 0;

    const lookTarget = new THREE.Vector3(
      player.pos.x - Math.sin(camState.yaw) * 1.5 + sx,
      player.pos.y + targetOffsetY + sy,
      player.pos.z - Math.cos(camState.yaw) * 1.5
    );

    const camX = player.pos.x + Math.sin(camState.yaw) * Math.cos(camState.pitch) * camState.dist;
    const camY = player.pos.y + (player.inVehicle ? 1.85 : 2.35) + Math.sin(camState.pitch) * camState.dist;
    const camZ = player.pos.z + Math.cos(camState.yaw) * Math.cos(camState.pitch) * camState.dist;

    const camGround = getCityGroundY(camX, camZ) + 1.05;
    camera.position.set(camX + sx, Math.max(camY, camGround) + sy, camZ);
    camera.lookAt(lookTarget);
  }

  // Single Sun <-> Moon key light with texel-snapped ortho shadow frustum to eliminate shimmer
  const srcKey = activeDayState ? activeDayState.keyDir : ATMO_UNIFORMS.uSunDir.value;
  shadowDirVec.copy(srcKey);
  shadowDirVec.y = Math.max(shadowDirVec.y, 0.14);
  shadowDirVec.normalize();

  shadowRightVec.crossVectors(shadowUpRef, shadowDirVec);
  if (shadowRightVec.lengthSq() < 1e-5) shadowRightVec.set(1, 0, 0);
  else shadowRightVec.normalize();
  shadowUpVec.crossVectors(shadowDirVec, shadowRightVec).normalize();

  const projU = Math.round(lookFocus.dot(shadowRightVec) / SHADOW_TEXEL) * SHADOW_TEXEL;
  const projV = Math.round(lookFocus.dot(shadowUpVec) / SHADOW_TEXEL) * SHADOW_TEXEL;
  const projD = lookFocus.dot(shadowDirVec);
  sunLight.target.position
    .set(0, 0, 0)
    .addScaledVector(shadowRightVec, projU)
    .addScaledVector(shadowUpVec, projV)
    .addScaledVector(shadowDirVec, projD);
  sunLight.position.copy(sunLight.target.position).addScaledVector(shadowDirVec, 360);

  const sunBelowHorizon = (activeDayState && activeDayState.keyIsMoon) || ATMO_UNIFORMS.uSunDir.value.y < -0.02;
  if (sunBelowHorizon) {
    resolvePass.uniforms.uSunInView.value = 0.0;
  } else {
    sunProjVec.copy(camera.position).addScaledVector(ATMO_UNIFORMS.uSunDir.value, 500);
    sunProjVec.project(camera);
    camera.getWorldDirection(camFwdVec);
    const sunDot = clamp(camFwdVec.dot(ATMO_UNIFORMS.uSunDir.value), 0, 1);
    resolvePass.uniforms.uSunScreenUv.value.set(sunProjVec.x * 0.5 + 0.5, sunProjVec.y * 0.5 + 0.5);
    resolvePass.uniforms.uSunInView.value = Math.pow(sunDot, 1.8);
  }

  compassRing.style.transform = `rotate(${(camState.yaw * 180 / Math.PI).toFixed(1)}deg)`;
}

function animate(nowMs) {
  requestAnimationFrame(animate);
  const dt = Math.min((nowMs - lastFrameMs) * 0.001, 0.05);
  lastFrameMs = nowMs;
  if (dt > 0.0001) {
    smoothFps = THREE.MathUtils.lerp(smoothFps, 1.0 / dt, 0.08);
  }

  ATMO_UNIFORMS.uTime.value += dt;
  const t = ATMO_UNIFORMS.uTime.value;
  if (dayRunning && !pinnedMode) {
    dayTime = (dayTime + (dt * daySpeed) / DAY_CYCLE_SEC) % 1.0;
  }

  updatePlayer(dt);
  updateCameraAndSun(dt);
  applyDaylight(t, false);

  // Stream terrain chunks, textured grass tufts & multi-LOD objects around live camera
  terrainSystem.update(camera);
  foliageSystem.update(camera);
  lodManager.update(camera);
  landmarks.update(t, camera);
  drawMinimap(nowMs);

  composer.render();
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const currDpr = Math.min(window.devicePixelRatio || 1, 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(currDpr);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  resolvePass.uniforms.uAspect.value = w / Math.max(h, 1);
});

// Clean inspection / test API for iterative visual verification
window.__BOTW__ = {
  setCamera(yaw, pitch, dist) {
    camState.freePos = null;
    camState.freeLook = null;
    camState.yaw = camState.targetYaw = yaw;
    camState.pitch = camState.targetPitch = pitch;
    camState.dist = camState.targetDist = dist;
  },
  setCameraAt(x, y, z, lx, ly, lz) {
    camState.freePos = new THREE.Vector3(x, y, z);
    camState.freeLook = new THREE.Vector3(lx, ly, lz);
    updateCameraAndSun(0.016);
    terrainSystem.update(camera, true);
    foliageSystem.update(camera, true);
    lodManager.update(camera, true);
  },
  clearFreeCam() {
    camState.freePos = null;
    camState.freeLook = null;
  },
  setPlayerPos(x, z, gliding = false, elevationOffset = 0) {
    if (player.inVehicle) exitActiveCar();
    camState.freePos = null;
    camState.freeLook = null;
    player.pos.set(x, getCityGroundY(x, z) + elevationOffset, z);
    player.vel.set(0, 0, 0);
    player.gliding = gliding;
    player.onGround = !gliding && elevationOffset <= 0.1;
  },
  teleportToCity() {
    teleportToCity();
  },
  teleportToMarina() {
    teleportToMarina();
  },
  teleportToHighway() {
    teleportToHighway();
  },
  triggerAttack(mode = 'combo') {
    if (mode === 'spin') return combat.triggerSpinAttack(player, sfxCallbacks);
    if (mode === 'bolt') return combat.triggerEnergyShot(player, player.inVehicle ? player.activeCar.yaw : player.yaw, sfxCallbacks);
    return combat.triggerLightAttack(player, sfxCallbacks);
  },
  hijackNearestCar() {
    if (player.inVehicle) return true;
    const near = vehicles.findNearestCar(player.pos, 80.0);
    if (!near) return false;
    player.pos.copy(near.car.pos);
    return hijackOrExitCar();
  },
  exitCar() {
    return exitActiveCar();
  },
  setDayTime(u) {
    pinnedMode = null;
    dayTime = ((u % 1.0) + 1.0) % 1.0;
    applyDaylight(ATMO_UNIFORMS.uTime.value, true);
  },
  setTimeOfDay(u) {
    window.__BOTW__.setDayTime(u);
  },
  setLightMode(modeOrNull) {
    pinnedMode = modeOrNull || null;
    if (pinnedMode && MODE_DAYTIME[pinnedMode] !== undefined) {
      dayTime = MODE_DAYTIME[pinnedMode];
    }
    applyDaylight(ATMO_UNIFORMS.uTime.value, true);
  },
  setDayRunning(running) {
    dayRunning = !!running;
    syncDaylightHud(true);
  },
  resetVista() {
    resetToIconicVista();
  },
  setHudVisible(visible) {
    document.getElementById('hud').classList.toggle('hidden', !visible);
  },
  getTelemetry() {
    const near = vehicles.findNearestCar(player.pos, 140.0);
    return {
      playerPos: player.pos.toArray(),
      camPos: camera.position.toArray(),
      regionName: regionNameEl.textContent,
      fps: Math.round(smoothFps),
      drawCalls: sceneStats.calls,
      triangles: sceneStats.triangles,
      dayTime: Number(dayTime.toFixed(4)),
      pinnedMode,
      clockLabel: formatTimeOfDay(dayTime),
      sunElDeg: activeDayState ? Number(activeDayState.sunElevationDeg.toFixed(2)) : null,
      nightFactor: Number(ATMO_UNIFORMS.uNightFactor.value.toFixed(3)),
      buildingCount: city.buildingCount,
      tileCount: city.tileCount,
      volcanoDist: Math.round(Math.hypot(player.pos.x - VOLCANO_POS.x, player.pos.z - VOLCANO_POS.z)),
      inVehicle: player.inVehicle,
      vehicleName: player.activeCar ? player.activeCar.spec.label : null,
      vehicleSpeed: player.activeCar ? Math.round(Math.abs(player.activeCar.speed) * 3.6) : 0,
      wantedStars: combat.state.wantedStars,
      cash: combat.state.cash,
      health: Math.round(combat.state.health),
      nearbyCarDist: near ? Number(near.dist.toFixed(2)) : null,
      carCount: vehicles.cars.length,
      npcCount: city.npcs.length,
      isAttacking: combat.state.attackTimer > 0,
      assetStats: assetManager.getStats(),
      lodStats: lodManager.getStats(),
      terrainStats: terrainSystem.getStats(),
      grassStats: foliageSystem.getStats()
    };
  }
};

resetToIconicVista();
updateCameraAndSun(0.016);
applyDaylight(0, true);
terrainSystem.update(camera, true);
foliageSystem.update(camera, true);
lodManager.update(camera, true);

requestAnimationFrame((t) => {
  lastFrameMs = t;
  animate(t);
});
