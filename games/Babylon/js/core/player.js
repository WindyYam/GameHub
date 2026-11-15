// js/core/player.js — 3D Third-Person Player character (high-detail rigged human), physics/collision, camera, and landmarks.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from './mathx.js';
import { createRig, makePose, clearPose, fk, NB } from '../modules/people/rig.js';
import { buildHuman, SKEL, B, bit, poseWalk, poseStand, poseArms } from '../modules/people/human.js';

const PLAYER_RADIUS = 0.45;
const WALK_SPEED = 5.8;
const SPRINT_SPEED = 13.5;
const FLIGHT_SPEED = 36.0;
const BOOST_SPEED = 72.0;
const GRAVITY = -22.0;
const JUMP_VEL = 8.8;
const STEP_UP_MAX = 1.35;

function ringCenter(ring) {
  if (!ring || !ring.length) return [0, 0];
  let sx = 0, sz = 0;
  for (const p of ring) { sx += p[0]; sz += p[1]; }
  return [sx / ring.length, sz / ring.length];
}

function pushOutOfPolygon(x, z, ring, radius) {
  if (!ring || ring.length < 3) return null;
  if (!M.pointInPolygon(x, z, ring)) return null;
  let bestD = Infinity, bestX = x, bestZ = z;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz || 1;
    const t = M.clamp(((x - a[0]) * abx + (z - a[1]) * abz) / len2, 0, 1);
    const px = a[0] + abx * t, pz = a[1] + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestD) {
      bestD = d;
      const nx = (px - x) / (d || 1), nz = (pz - z) / (d || 1);
      bestX = px + nx * radius;
      bestZ = pz + nz * radius;
    }
  }
  return [bestX, bestZ];
}

function createHeroCharacter(ctx) {
  const group = new THREE.Group();
  group.name = 'player-character';
  ctx.scene.add(group);

  const pctx = Object.create(ctx);
  pctx.module = { group };

  const rig = createRig(pctx, { rows: 4, tag: 'player' });
  const C = (id, k = 1) => {
    const c = ctx.materials.color(id);
    return [c.r * k, c.g * k, c.b * k];
  };
  const tones = {
    wood: C('palmWood'),
    pottery: C('bakedBrickRed', 1.05),
    potteryPale: C('bakedBrickBuff'),
    bronze: C('bronze'),
    reed: C('reedMat'),
    gold: C('gold'),
    leather: C('woolBrown', 0.8),
    sack: C('woolDark', 1.2),
    dates: C('woolBrown', 0.7),
    hide: C('woolCream', 0.95),
  };

  const cloth = rig.material('woolCream', 'player-hero-cloth', { roughness: 0.92, relief: 0.7, detail: 0.8 });
  const geo = buildHuman(0, tones).toGeometry(THREE);
  const set = rig.set({
    name: 'player-hero',
    geometry: geo,
    material: cloth,
    capacity: 1,
    castShadow: true,
    shadowTexel: 0.3,
    reflect: true,
  });

  const row = rig.alloc();
  const P = makePose();
  const bones = new Float32Array(SKEL.n * 12);

  // Superman appearance: royal blue suit, crimson red cape/boots, gold belt accent, short black hair
  const mask = bit('tunic', 'hairShort');
  const A = [0.06, 0.22, 0.72];
  const Bcol = [0.80, 0.08, 0.08];
  const Ccol = C('skin', 0.96);
  const Dcol = [0.95, 0.78, 0.16];
  const Ecol = [0.80, 0.08, 0.08];
  const hair = 0.02;
  const scale = 1.04;

  // Dynamic flowing red cape attached to shoulders (character faces -Z, back is +Z in local space)
  // Top edge (v=0) tucks into the collar/shoulders (z ~ 0.065) so there is zero gap from any angle
  const CAPE_COLS = 8, CAPE_ROWS = 10;
  const capeGeo = new THREE.PlaneGeometry(0.62, 1.32, CAPE_COLS, CAPE_ROWS);
  const capePos = capeGeo.attributes.position;
  const capeBase = new Float32Array(capePos.array.length);
  for (let i = 0; i < capePos.count; i++) {
    const u = capePos.getX(i) / 0.62;               // -0.5..0.5
    const v = 0.5 - capePos.getY(i) / 1.32;         // 0 at top (shoulders) .. 1 at hem
    const shoulderCurve = 1 - (2 * u) * (2 * u);    // 1 at spine, 0 at shoulder tips
    const x = u * (0.36 + v * 0.48);
    const y = -v * 1.30 - (1 - shoulderCurve) * 0.03 * (1 - v);
    const z = 0.065 + (1 - v) * 0.015 * shoulderCurve + Math.sin(Math.min(1, v * 3.5) * Math.PI * 0.5) * 0.06 + v * 0.09;
    capePos.setXYZ(i, x, y, z);
    capeBase[i * 3] = x; capeBase[i * 3 + 1] = y; capeBase[i * 3 + 2] = z;
  }
  capeGeo.computeVertexNormals();
  const capeMat = new THREE.MeshStandardMaterial({
    name: 'player-cape',
    color: 0xc41016,
    roughness: 0.76,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  ctx.materials.register(capeMat, { owner: 'player', noVariation: true });
  const capeMesh = new THREE.Mesh(capeGeo, capeMat);
  capeMesh.castShadow = true;

  // Superman chest emblem (gold diamond crest on front -Z chest)
  const emblemGeo = new THREE.OctahedronGeometry(0.10, 0);
  emblemGeo.scale(1.15, 0.95, 0.25);
  const emblemMat = new THREE.MeshStandardMaterial({
    name: 'player-emblem',
    color: 0xf4c418,
    emissive: 0x3a1800,
    roughness: 0.35,
    metalness: 0.25,
  });
  ctx.materials.register(emblemMat, { owner: 'player', noVariation: true });
  const emblemMesh = new THREE.Mesh(emblemGeo, emblemMat);
  emblemMesh.position.set(0, -0.15, -0.128);

  const torsoPivot = new THREE.Group();
  const shoulderPivot = new THREE.Group();
  shoulderPivot.position.set(0, 1.43 * scale, 0);
  shoulderPivot.scale.setScalar(scale);
  shoulderPivot.add(capeMesh);
  shoulderPivot.add(emblemMesh);
  torsoPivot.add(shoulderPivot);
  group.add(torsoPivot);

  // Secondary Attack VFX: twin HDR crimson Heat Vision laser beams + impact glow
  const laserMat = new THREE.MeshBasicMaterial({
    name: 'player-laser',
    color: new THREE.Color(5.5, 0.35, 0.1),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  ctx.materials.register(laserMat, { owner: 'player', skipHooks: true });
  const laserCoreMat = new THREE.MeshBasicMaterial({
    name: 'player-laser-core',
    color: new THREE.Color(9.0, 5.0, 1.8),
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  ctx.materials.register(laserCoreMat, { owner: 'player', skipHooks: true });

  const laserCylGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8, 1, true);
  laserCylGeo.translate(0, 0.5, 0);
  laserCylGeo.rotateX(Math.PI * 0.5);
  const laserCoreGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
  laserCoreGeo.translate(0, 0.5, 0);
  laserCoreGeo.rotateX(Math.PI * 0.5);

  const laserGroup = new THREE.Group();
  laserGroup.visible = false;
  const laserBeamL = new THREE.Mesh(laserCylGeo, laserMat);
  const laserBeamR = new THREE.Mesh(laserCylGeo, laserMat);
  const laserCoreL = new THREE.Mesh(laserCoreGeo, laserCoreMat);
  const laserCoreR = new THREE.Mesh(laserCoreGeo, laserCoreMat);
  const impactMesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), laserCoreMat);
  for (const m of [laserBeamL, laserBeamR, laserCoreL, laserCoreR, impactMesh]) {
    m.frustumCulled = false;
  }
  laserGroup.add(laserBeamL, laserBeamR, laserCoreL, laserCoreR, impactMesh);
  group.add(laserGroup);

  function animateCape(flying, boost, speed, timeSec) {
    const flow = flying ? M.clamp(0.45 + speed / BOOST_SPEED, 0.45, 1.35) : M.clamp(0.08 + speed / SPRINT_SPEED * 0.35, 0.08, 0.45);
    const freq = flying ? (boost ? 18.0 : 12.0) : (4.0 + speed * 0.45);
    for (let i = 0; i < capePos.count; i++) {
      const bx = capeBase[i * 3];
      const by = capeBase[i * 3 + 1];
      const bz = capeBase[i * 3 + 2];
      const v = Math.min(1, -by / 1.32);
      const wave1 = Math.sin(timeSec * freq - v * 6.5 + bx * 3.0) * (0.04 + 0.14 * flow) * v * v;
      const wave2 = Math.cos(timeSec * (freq * 0.7) - v * 4.2 - bx * 2.5) * 0.06 * flow * v;
      if (flying) {
        // When pitched forward (-flightPitch), local -Y streams behind feet and +Z is upward above his back
        capePos.setXYZ(i, bx + wave2 * 0.6, by, bz + v * 0.18 * flow + wave1);
      } else {
        capePos.setXYZ(i, bx + wave2 * 0.5, by, bz + v * 0.24 * flow + wave1);
      }
    }
    capePos.needsUpdate = true;
    capeGeo.computeVertexNormals();
  }

  const _eyeL = new THREE.Vector3(), _eyeR = new THREE.Vector3();
  const _upAxis = new THREE.Vector3(0, 1, 0);

  function updatePose(pos, facingYaw, speed, walkPhase, timeSec, onGround, inWater, visible, flying, boost, flightPitch, punchPhase, laserTarget) {
    group.visible = visible;
    if (!visible) return;

    clearPose(P);
    let pitch = 0;
    if (flying && !inWater) {
      if (speed > 1.5) {
        // Iconic horizontal head-first Superman flying pose (negative pitch tilts +Y toward -Z forward)
        pitch = -flightPitch;
        P.rx[B.ARM_R] = 3.04;
        P.rz[B.ARM_R] = -0.06;
        P.rx[B.FORE_R] = 0.06;
        if (boost) {
          P.rx[B.ARM_L] = 3.02;
          P.rz[B.ARM_L] = 0.06;
          P.rx[B.FORE_L] = 0.06;
        } else {
          P.rx[B.ARM_L] = -0.15;
          P.rz[B.ARM_L] = -0.16;
          P.rx[B.FORE_L] = 0.42;
        }
        P.rx[B.HEAD] = 0.85;
        P.rx[B.THIGH_L] = -0.06;
        P.rx[B.THIGH_R] = 0.04;
        P.rx[B.SHIN_L] = -0.10;
      } else {
        // Heroic mid-air hover
        pitch = -flightPitch;
        poseStand(P, timeSec, 0.3);
        P.rx[B.ARM_L] = 0.12;
        P.rz[B.ARM_L] = -0.16;
        P.rx[B.ARM_R] = 0.12;
        P.rz[B.ARM_R] = 0.16;
      }
    } else if (inWater) {
      pitch = -0.65;
      poseWalk(P, walkPhase * 1.2, 0.55, 0.1, 0);
      P.rx[B.ARM_L] = 1.1 + Math.sin(walkPhase * 1.2) * 0.7;
      P.rx[B.ARM_R] = 1.1 - Math.sin(walkPhase * 1.2) * 0.7;
    } else if (!onGround) {
      poseWalk(P, walkPhase, 0.35, 0.08, 0);
      P.rx[B.ARM_L] = 0.55;
      P.rx[B.ARM_R] = 0.35;
      P.rx[B.THIGH_L] = 0.45;
      P.rx[B.SHIN_L] = -0.65;
    } else if (speed > 0.25) {
      const amp = M.clamp(0.32 + (speed / SPRINT_SPEED) * 0.25, 0.32, 0.58);
      const lean = M.clamp((speed / SPRINT_SPEED) * 0.12, 0.03, 0.12);
      poseWalk(P, walkPhase, amp, lean, 0);
    } else {
      poseStand(P, timeSec, 0.3);
    }

    // Primary Attack: Heroic Right-Hook / Straight Punch overlay
    if (punchPhase > 0) {
      const swing = Math.sin(Math.min(1, punchPhase * 1.35) * Math.PI);
      P.ry[B.SPINE] -= 0.42 * swing;
      P.ry[B.CHEST] -= 0.35 * swing;
      P.rx[B.ARM_R] = 1.65 * swing;
      P.rz[B.ARM_R] = -0.10 * swing;
      P.rx[B.FORE_R] = 0.12;
      P.rx[B.ARM_L] = -0.55 * swing;
      P.rx[B.FORE_L] = 1.15 * swing;
    }

    fk(SKEL, P, bones);
    rig.write(row, bones);
    set.n = 0;
    const azDeg = 180 - facingYaw * M.RAD;
    set.push(pos.x, pos.y, pos.z, azDeg, scale, row, mask, A, Bcol, Ccol, Dcol, Ecol, hair, pitch);
    rig.commit();

    // Match rig.js exactly: R = Ry(facingYaw - PI) * Rx(pitch), plus spine lean for flush shoulder contact
    torsoPivot.position.copy(pos);
    torsoPivot.rotation.set(pitch, facingYaw - Math.PI, 0, 'YXZ');
    shoulderPivot.rotation.x = (P.rx[B.SPINE] || 0) + (P.rx[B.CHEST] || 0);
    animateCape(flying && !inWater, boost, speed, timeSec);

    // Secondary Attack: Twin Heat Vision laser beams from Superman's eyes
    if (laserTarget) {
      torsoPivot.updateMatrixWorld(true);
      const isFlyPose = flying && !inWater && speed > 1.5;
      const eyeY = (isFlyPose ? 1.58 : 1.61) * scale;
      const eyeZ = (isFlyPose ? -0.02 : -0.10) * scale;
      const eyeHalf = 0.036 * scale;
      _eyeL.set(-eyeHalf, eyeY, eyeZ).applyMatrix4(torsoPivot.matrixWorld);
      _eyeR.set(eyeHalf, eyeY, eyeZ).applyMatrix4(torsoPivot.matrixWorld);

      const dL = _eyeL.distanceTo(laserTarget);
      const dR = _eyeR.distanceTo(laserTarget);
      laserBeamL.position.copy(_eyeL); laserBeamL.lookAt(laserTarget); laserBeamL.scale.set(1, 1, dL);
      laserCoreL.position.copy(_eyeL); laserCoreL.lookAt(laserTarget); laserCoreL.scale.set(1, 1, dL);
      laserBeamR.position.copy(_eyeR); laserBeamR.lookAt(laserTarget); laserBeamR.scale.set(1, 1, dR);
      laserCoreR.position.copy(_eyeR); laserCoreR.lookAt(laserTarget); laserCoreR.scale.set(1, 1, dR);

      const pulse = 0.85 + 0.25 * Math.sin(timeSec * 42);
      impactMesh.position.copy(laserTarget);
      impactMesh.scale.setScalar(pulse);
      laserMat.opacity = 0.78 + 0.18 * Math.sin(timeSec * 36);
      laserGroup.visible = true;
    } else {
      laserGroup.visible = false;
    }
  }

  return { group, updatePose };
}

function buildLandmarks(ctx) {
  const gates = ctx.world.innerWalls.gates || [];
  const ishtar = gates.find((g) => /ishtar/i.test(g.name)) || { x: 345.8, z: -716.2 };
  const monCenter = (id, dx = 0, dz = 0) => {
    const m = ctx.world.monuments.find((q) => q.id === id);
    if (!m || !Array.isArray(m.footprint)) return null;
    const [cx, cz] = ringCenter(m.footprint);
    return [cx + dx, cz + dz];
  };

  const list = [
    { id: 'ishtar', name: 'Ishtar Gate', x: ishtar.x, z: ishtar.z - 55, yaw: 0 },
    { id: 'processional', name: 'Processional Way', x: ishtar.x, z: ishtar.z + 120, yaw: 0 },
  ];
  const etem = monCenter('etemenanki', 0, 95);
  if (etem) list.push({ id: 'etemenanki', name: 'Etemenanki', x: etem[0], z: etem[1], yaw: Math.PI });
  const spal = monCenter('southPalace', 110, 0);
  if (spal) list.push({ id: 'southpalace', name: 'South Palace', x: spal[0], z: spal[1], yaw: -Math.PI / 2 });
  const esag = monCenter('esagila', 70, 0);
  if (esag) list.push({ id: 'esagila', name: 'Esagila', x: esag[0], z: esag[1], yaw: -Math.PI / 2 });

  const br = ctx.world.bridge;
  if (br && br.from && br.to) {
    list.push({ id: 'bridge', name: 'Euphrates Bridge', x: (br.from[0] + br.to[0]) * 0.5, z: (br.from[1] + br.to[1]) * 0.5, yaw: Math.PI / 2 });
  } else {
    list.push({ id: 'bridge', name: 'Euphrates River', x: 75, z: 30, yaw: -Math.PI / 2 });
  }
  return list;
}

export function createPlayer(ctx) {
  const hero = createHeroCharacter(ctx);
  const landmarks = buildLandmarks(ctx);
  const spawn = landmarks[0];

  const state = {
    active: true,
    pos: new THREE.Vector3(spawn.x, ctx.ground.height(spawn.x, spawn.z), spawn.z),
    vel: new THREE.Vector3(),
    facingYaw: spawn.yaw,
    camYaw: spawn.yaw,
    camPitch: 0.24,
    camDist: 7.5,
    onGround: true,
    inWater: false,
    glide: false,
    flightPitch: 0,
    punchTimer: 0,
    laserActive: false,
    speed: 0,
    walkPhase: 0,
    timeSec: 0,
  };

  const keys = new Set();
  const touchInput = { moveX: 0, moveY: 0, boost: false, ascend: false, descend: false, laser: false };
  const _laserTarget = new THREE.Vector3();
  let dragging = false, lookPointerId = null, lastX = 0, lastY = 0;
  let wakeCooldown = 0;
  let lastSpaceMs = 0;
  let rightMouseDown = false;

  function triggerPunch() {
    if (state.punchTimer <= 0.05) {
      state.punchTimer = 0.34;
    }
  }
  function triggerJump() {
    if (!state.glide && state.onGround && !state.inWater) {
      state.vel.y = JUMP_VEL;
      state.onGround = false;
    }
  }

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  function toggleFlight() {
    state.glide = !state.glide;
    if (state.glide) {
      state.vel.y = 0;
      const gy = ctx.ground.height(state.pos.x, state.pos.z);
      if (state.pos.y <= gy + 0.5) state.pos.y = gy + 2.2;
      state.onGround = false;
    }
  }

  function onKeyDown(e) {
    if (!state.active || isTypingTarget(e.target)) return;
    const k = e.code;
    const firstPress = !keys.has(k);
    keys.add(k);
    if (k === 'Space' && firstPress) {
      e.preventDefault();
      const nowMs = performance.now();
      if (nowMs - lastSpaceMs < 280) {
        toggleFlight();
        lastSpaceMs = 0;
      } else {
        lastSpaceMs = nowMs;
        if (!state.glide && state.onGround && !state.inWater) {
          state.vel.y = JUMP_VEL;
          state.onGround = false;
        }
      }
    } else if (k === 'KeyF' && firstPress) {
      toggleFlight();
    } else if ((k === 'KeyJ' || k === 'Digit1') && firstPress) {
      triggerPunch();
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }

  const canvas = ctx.canvas;
  function requestLock() {
    if (!state.active || document.pointerLockElement === canvas || !canvas.requestPointerLock) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore if blocked */ }
  }
  function onPointerDown(e) {
    if (!state.active) return;
    if (e.pointerType === 'touch') {
      if (lookPointerId === null) {
        lookPointerId = e.pointerId;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      return;
    }
    if (e.button === 0) {
      if (document.pointerLockElement === canvas) {
        triggerPunch();
      } else {
        requestLock();
        dragging = true;
        lookPointerId = e.pointerId;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    } else if (e.button === 2) {
      rightMouseDown = true;
    }
  }
  function onPointerMove(e) {
    if (!state.active) return;
    const minPitch = state.glide ? -0.85 : -0.18;
    if (document.pointerLockElement === canvas) {
      state.camYaw -= e.movementX * 0.0032;
      state.camPitch = M.clamp(state.camPitch + e.movementY * 0.0028, minPitch, 1.15);
    } else if (dragging && (lookPointerId === null || e.pointerId === lookPointerId)) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      state.camYaw -= dx * 0.0055;
      state.camPitch = M.clamp(state.camPitch + dy * 0.0045, minPitch, 1.15);
    }
  }
  function onPointerUp(e) {
    if (e.pointerType === 'touch') {
      if (e.pointerId === lookPointerId) { dragging = false; lookPointerId = null; }
      return;
    }
    if (e.button === 0) { dragging = false; lookPointerId = null; }
    else if (e.button === 2) rightMouseDown = false;
  }
  function onContextMenu(e) {
    if (state.active) e.preventDefault();
  }
  function onWheel(e) {
    if (!state.active) return;
    e.preventDefault();
    state.camDist = M.clamp(state.camDist * Math.exp(e.deltaY * 0.0012), 3.2, 32);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function teleport(idOrLandmark) {
    const lm = typeof idOrLandmark === 'string'
      ? landmarks.find((l) => l.id === idOrLandmark)
      : idOrLandmark;
    if (!lm) return;
    const gy = ctx.ground.height(lm.x, lm.z);
    state.pos.set(lm.x, gy, lm.z);
    state.vel.set(0, 0, 0);
    state.facingYaw = lm.yaw ?? 0;
    state.camYaw = state.facingYaw;
    state.onGround = true;
  }

  function resolveCollisions(nx, nz, curGroundY) {
    const houses = ctx.layout.housesNear(nx, nz, 28);
    for (const h of houses) {
      if (!ctx.layout.isBuilt(h)) continue;
      const pushed = pushOutOfPolygon(nx, nz, h.footprint, PLAYER_RADIUS);
      if (pushed) {
        const inCourt = h.courts && h.courts.some((c) => M.pointInPolygon(nx, nz, c));
        if (!inCourt) {
          nx = pushed[0];
          nz = pushed[1];
        }
      }
    }
    const nextG = ctx.ground.height(nx, nz);
    if (!state.glide && state.onGround && nextG - curGroundY > STEP_UP_MAX) {
      return [state.pos.x, state.pos.z];
    }
    return [nx, nz];
  }

  function update(dt) {
    if (!state.active) {
      hero.group.visible = false;
      return null;
    }
    dt = Math.min(dt, 0.05);
    state.timeSec += dt;

    let fwdInput = touchInput.moveY, strafeInput = touchInput.moveX;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwdInput += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwdInput -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafeInput += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafeInput -= 1;

    if (keys.has('KeyQ')) state.camYaw += 1.9 * dt;
    if (keys.has('KeyE')) state.camYaw -= 1.9 * dt;

    const moving = Math.abs(fwdInput) > 0.05 || Math.abs(strafeInput) > 0.05;
    const sprint = touchInput.boost || keys.has('ShiftLeft') || keys.has('ShiftRight');
    const flying = state.glide;
    const targetSpeed = moving ? (flying ? (sprint ? BOOST_SPEED : FLIGHT_SPEED) : (sprint ? SPRINT_SPEED : WALK_SPEED)) : 0;

    let moveDirY = 0;
    if (moving) {
      const sinY = Math.sin(state.camYaw), cosY = Math.cos(state.camYaw);
      let mx = fwdInput * sinY + strafeInput * cosY;
      let mz = fwdInput * cosY - strafeInput * sinY;
      const mLen = Math.hypot(mx, mz) || 1;
      mx /= mLen; mz /= mLen;

      if (flying) {
        // Look pitch controls 3D climb/dive when flying forward/back
        moveDirY = -Math.sin(state.camPitch) * fwdInput;
      }

      state.speed = M.lerp(state.speed, targetSpeed, 1 - Math.exp(-(flying ? 7 : 12) * dt));
      const horizFactor = flying ? Math.max(0.25, Math.cos(state.camPitch * 0.7)) : 1;
      const nx = state.pos.x + mx * state.speed * horizFactor * dt;
      const nz = state.pos.z + mz * state.speed * horizFactor * dt;

      const curG = ctx.ground.height(state.pos.x, state.pos.z);
      const [rx, rz] = (flying && state.pos.y > curG + 4.5) ? [nx, nz] : resolveCollisions(nx, nz, curG);
      state.pos.x = M.clamp(rx, -4200, 4200);
      state.pos.z = M.clamp(rz, -4200, 4200);

      const targetYaw = Math.atan2(mx, mz);
      let diff = targetYaw - state.facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.facingYaw += diff * (1 - Math.exp(-14 * dt));
    } else {
      state.speed = M.lerp(state.speed, 0, 1 - Math.exp(-(flying ? 5 : 14) * dt));
    }

    const groundY = ctx.ground.height(state.pos.x, state.pos.z);
    const waterLevel = ctx.ground.waterLevel;
    const isWater = ctx.ground.isWater(state.pos.x, state.pos.z);
    const swimSurface = waterLevel - 0.85;
    state.inWater = !flying && isWater && groundY < waterLevel - 0.65;

    if (flying) {
      let vertThrust = 0;
      if (touchInput.ascend || keys.has('Space')) vertThrust += sprint ? 32 : 20;
      if (touchInput.descend || keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight')) vertThrust -= sprint ? 32 : 20;
      state.vel.y = M.lerp(state.vel.y, vertThrust + moveDirY * state.speed, 1 - Math.exp(-8 * dt));
      state.pos.y = M.clamp(state.pos.y + state.vel.y * dt, groundY + 0.35, 950);
      state.onGround = false;
      const horizSpeed = state.speed * Math.max(0.25, Math.cos(state.camPitch * 0.7));
      const climbAngle = Math.atan2(state.vel.y, Math.max(2.0, horizSpeed));
      const targetFlightPitch = state.speed > 1.5
        ? M.clamp(Math.PI * 0.5 - climbAngle, 0.35, 2.55)
        : M.clamp(0.06 - state.vel.y * 0.012, -0.22, 0.28);
      state.flightPitch = M.lerp(state.flightPitch, targetFlightPitch, 1 - Math.exp(-10 * dt));
    } else if (state.inWater) {
      state.vel.y = 0;
      state.pos.y = M.lerp(state.pos.y, swimSurface, 1 - Math.exp(-8 * dt));
      state.onGround = true;
      state.flightPitch = M.lerp(state.flightPitch, 0, 1 - Math.exp(-10 * dt));
      wakeCooldown -= dt;
      if (state.speed > 0.8 && wakeCooldown <= 0 && ctx.water && ctx.water.addWake) {
        wakeCooldown = 0.25;
        ctx.water.addWake({ x: state.pos.x, z: state.pos.z, dir: [Math.sin(state.facingYaw), Math.cos(state.facingYaw)], speed: state.speed });
      }
    } else {
      state.vel.y += GRAVITY * dt;
      state.pos.y += state.vel.y * dt;
      state.flightPitch = M.lerp(state.flightPitch, 0, 1 - Math.exp(-10 * dt));
      if (state.pos.y <= groundY) {
        state.pos.y = groundY;
        state.vel.y = 0;
        state.onGround = true;
      } else {
        state.onGround = false;
      }
    }

    if (state.speed > 0.25) {
      state.walkPhase += (state.speed * dt * Math.PI * 2) / 1.45;
    }

    if (state.punchTimer > 0) state.punchTimer = Math.max(0, state.punchTimer - dt);
    const punchPhase = state.punchTimer > 0 ? 1 - state.punchTimer / 0.34 : 0;

    state.laserActive = rightMouseDown || touchInput.laser || keys.has('KeyK') || keys.has('Digit2');
    let laserTarget = null;
    if (state.laserActive) {
      // Aim laser along camera look ray (yaw = state.camYaw, pitch = -state.camPitch)
      const aimCos = Math.cos(state.camPitch);
      const aimX = Math.sin(state.camYaw) * aimCos;
      const aimY = -Math.sin(state.camPitch);
      const aimZ = Math.cos(state.camYaw) * aimCos;
      // Face aim direction when firing laser while stationary/hovering
      if (!moving) {
        let diff = state.camYaw - state.facingYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        state.facingYaw += diff * (1 - Math.exp(-16 * dt));
      }
      const ox = state.pos.x, oy = state.pos.y + (flying && state.speed > 1.5 ? 0.65 : 1.65), oz = state.pos.z;
      let hitDist = 160;
      for (let d = 2; d <= 160; d += 2.5) {
        const px = ox + aimX * d, py = oy + aimY * d, pz = oz + aimZ * d;
        const surfY = Math.max(ctx.ground.height(px, pz), ctx.ground.isWater(px, pz) ? ctx.ground.waterLevel : -999);
        if (py <= surfY) { hitDist = d; break; }
      }
      _laserTarget.set(ox + aimX * hitDist, oy + aimY * hitDist, oz + aimZ * hitDist);
      laserTarget = _laserTarget;
    }

    hero.updatePose(state.pos, state.facingYaw, state.speed, state.walkPhase, state.timeSec, state.onGround, state.inWater, state.active, flying, sprint && flying, state.flightPitch, punchPhase, laserTarget);

    const targetY = state.pos.y + (flying && state.speed > 1.5 ? 0.65 : 1.45);
    const horiz = Math.cos(state.camPitch) * state.camDist;
    const vert = Math.sin(state.camPitch) * state.camDist;
    const camX = state.pos.x - Math.sin(state.camYaw) * horiz;
    const camZ = state.pos.z - Math.cos(state.camYaw) * horiz;
    const minCamY = ctx.ground.height(camX, camZ) + 0.75;
    const camY = Math.max(minCamY, targetY + vert);
    const dynFov = flying ? 54 + M.clamp((state.speed / BOOST_SPEED) * 12, 0, 12) : 54;

    return {
      pos: [camX, camY, camZ],
      look: [state.pos.x, targetY, state.pos.z],
      fov: dynFov,
    };
  }

  return {
    state,
    rig: hero,
    landmarks,
    teleport,
    update,
    toggleFlight,
    triggerPunch,
    triggerJump,
    setTouchInput(patch) { Object.assign(touchInput, patch); },
    setActive(v) {
      state.active = !!v;
      hero.group.visible = state.active;
      if (!state.active && document.pointerLockElement === canvas && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch { /* ignore */ }
      }
    },
  };
}
