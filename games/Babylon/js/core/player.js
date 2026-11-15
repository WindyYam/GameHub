// js/core/player.js — 3D Third-Person Player character, physics/collision, camera, and landmark teleports.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from './mathx.js';

const PLAYER_RADIUS = 0.45;
const WALK_SPEED = 5.8;
const SPRINT_SPEED = 13.5;
const GLIDE_SPEED = 36.0;
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

function createCharacterMesh(ctx) {
  const mat = (name, hex) => ctx.materials.register(
    new THREE.MeshLambertMaterial({ name: 'player:' + name, color: hex }),
    { owner: 'player' }
  );

  const skinM = mat('skin', 0xc98a5b);
  const hairM = mat('hair', 0x241913);
  const linenM = mat('linen', 0xe8dec9);
  const lapisM = mat('lapis', 0x26489a);
  const goldM = mat('gold', 0xd9aa45);
  const leatherM = mat('leather', 0x5c3c24);
  const woodM = mat('wood', 0x6e4a2b);

  const root = new THREE.Group();
  root.name = 'player-character';

  const body = new THREE.Group();
  root.add(body);

  // Legs (pivoted at hip y = 0.82)
  const makeLeg = (xOff) => {
    const piv = new THREE.Group();
    piv.position.set(xOff, 0.82, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.17), skinM);
    upper.position.y = -0.22;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.15), skinM);
    shin.position.y = -0.58;
    const sandal = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.24), leatherM);
    sandal.position.set(0, -0.79, 0.04);
    piv.add(upper, shin, sandal);
    return piv;
  };
  const legL = makeLeg(-0.11);
  const legR = makeLeg(0.11);
  body.add(legL, legR);

  // Tunic / Skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.48, 8), linenM);
  skirt.position.y = 0.72;
  body.add(skirt);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.22), linenM);
  torso.position.y = 1.12;
  body.add(torso);

  // Lapis & Gold Sash / Belt
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.24), lapisM);
  belt.position.y = 0.92;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.03, 0.25), goldM);
  trim.position.y = 0.96;
  const shoulderSash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.24), lapisM);
  shoulderSash.position.set(-0.08, 1.14, 0);
  shoulderSash.rotation.z = -0.32;
  body.add(belt, trim, shoulderSash);

  // Head + Beard + Headband
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.49;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinM);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.24), hairM);
  hair.position.set(0, 0.08, -0.02);
  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.12), hairM);
  beard.position.set(0, -0.09, 0.08);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.045, 0.245), goldM);
  band.position.y = 0.07;
  headGroup.add(head, hair, beard, band);
  body.add(headGroup);

  // Arms (pivoted at shoulder y = 1.32)
  const makeArm = (xOff, withStaff) => {
    const piv = new THREE.Group();
    piv.position.set(xOff, 1.32, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), skinM);
    arm.position.y = -0.24;
    piv.add(arm);
    if (withStaff) {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 1.55, 6), woodM);
      staff.position.set(0, -0.22, 0.18);
      staff.rotation.x = 0.18;
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), goldM);
      finial.position.set(0, 0.55, 0.04);
      staff.add(finial);
      piv.add(staff);
    }
    return piv;
  };
  const armL = makeArm(-0.26, false);
  const armR = makeArm(0.26, true);
  body.add(armL, armR);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  ctx.scene.add(root);
  return { root, body, headGroup, armL, armR, legL, legR };
}

function buildLandmarks(ctx) {
  const gates = ctx.world.innerWalls.gates || [];
  const ishtar = gates.find((g) => /ishtar/i.test(g.name)) || { x: 345.8, z: -716.2 };
  const monCenter = (id, dx = 0, dz = 0) => {
    const m = ctx.world.monuments.find((q) => q.id === id);
    if (!m) return null;
    if (m.footprint) {
      const [cx, cz] = ringCenter(m.footprint);
      return [cx + dx, cz + dz];
    }
    return null;
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

  // Euphrates bridge or river bank
  const br = ctx.world.bridge;
  if (br && br.from && br.to) {
    list.push({ id: 'bridge', name: 'Euphrates Bridge', x: (br.from[0] + br.to[0]) * 0.5, z: (br.from[1] + br.to[1]) * 0.5, yaw: Math.PI / 2 });
  } else {
    list.push({ id: 'bridge', name: 'Euphrates River', x: 75, z: 30, yaw: -Math.PI / 2 });
  }
  return list;
}

export function createPlayer(ctx) {
  const rig = createCharacterMesh(ctx);
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
    speed: 0,
    animPhase: 0,
  };

  // Input state
  const keys = new Set();
  let dragging = false, lastX = 0, lastY = 0;
  let wakeCooldown = 0;

  function isTypingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  function onKeyDown(e) {
    if (!state.active || isTypingTarget(e.target)) return;
    const k = e.code;
    keys.add(k);
    if (k === 'Space' && state.onGround && !state.inWater) {
      e.preventDefault();
      state.vel.y = JUMP_VEL;
      state.onGround = false;
    } else if (k === 'KeyF') {
      state.glide = !state.glide;
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }

  const canvas = ctx.canvas;
  function onPointerDown(e) {
    if (!state.active || e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerMove(e) {
    if (!state.active) return;
    if (document.pointerLockElement === canvas) {
      state.camYaw -= e.movementX * 0.0032;
      state.camPitch = M.clamp(state.camPitch + e.movementY * 0.0028, -0.18, 1.15);
    } else if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      state.camYaw -= dx * 0.0055;
      state.camPitch = M.clamp(state.camPitch + dy * 0.0045, -0.18, 1.15);
    }
  }
  function onPointerUp() {
    dragging = false;
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
    // 1. Check built houses nearby
    const houses = ctx.layout.housesNear(nx, nz, 28);
    for (const h of houses) {
      if (!ctx.layout.isBuilt(h)) continue;
      const pushed = pushOutOfPolygon(nx, nz, h.footprint, PLAYER_RADIUS);
      if (pushed) {
        // Allow stepping into open courtyards if somehow inside, otherwise slide along outer wall
        const inCourt = h.courts && h.courts.some((c) => M.pointInPolygon(nx, nz, c));
        if (!inCourt) {
          nx = pushed[0];
          nz = pushed[1];
        }
      }
    }

    // 2. Check terrain step height (avoid walking straight through sheer walls/cliffs)
    const nextG = ctx.ground.height(nx, nz);
    if (!state.glide && state.onGround && nextG - curGroundY > STEP_UP_MAX) {
      return [state.pos.x, state.pos.z];
    }
    return [nx, nz];
  }

  function update(dt) {
    if (!state.active) {
      rig.root.visible = false;
      return null;
    }
    rig.root.visible = true;
    dt = Math.min(dt, 0.05);

    // Camera-relative movement input (camYaw = 0 looks toward +Z)
    let fwdInput = 0, strafeInput = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwdInput += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwdInput -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafeInput += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafeInput -= 1;

    // Optional keyboard orbit Q/E
    if (keys.has('KeyQ')) state.camYaw += 1.9 * dt;
    if (keys.has('KeyE')) state.camYaw -= 1.9 * dt;

    const moving = fwdInput !== 0 || strafeInput !== 0;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const targetSpeed = moving ? (state.glide ? GLIDE_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED) : 0;

    if (moving) {
      const sinY = Math.sin(state.camYaw), cosY = Math.cos(state.camYaw);
      // forward = (sinY, cosY), right = (-cosY, sinY)
      let mx = fwdInput * sinY + strafeInput * cosY;
      let mz = fwdInput * cosY - strafeInput * sinY;
      const mLen = Math.hypot(mx, mz) || 1;
      mx /= mLen; mz /= mLen;

      state.speed = M.lerp(state.speed, targetSpeed, 1 - Math.exp(-12 * dt));
      const nx = state.pos.x + mx * state.speed * dt;
      const nz = state.pos.z + mz * state.speed * dt;

      const curG = ctx.ground.height(state.pos.x, state.pos.z);
      const [rx, rz] = resolveCollisions(nx, nz, curG);
      state.pos.x = M.clamp(rx, -4200, 4200);
      state.pos.z = M.clamp(rz, -4200, 4200);

      // Smoothly rotate character toward movement vector
      const targetYaw = Math.atan2(mx, mz);
      let diff = targetYaw - state.facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.facingYaw += diff * (1 - Math.exp(-14 * dt));
    } else {
      state.speed = M.lerp(state.speed, 0, 1 - Math.exp(-14 * dt));
    }

    // Vertical physics & water
    const groundY = ctx.ground.height(state.pos.x, state.pos.z);
    const waterLevel = ctx.ground.waterLevel;
    const isWater = ctx.ground.isWater(state.pos.x, state.pos.z);
    const swimSurface = waterLevel - 0.85;
    state.inWater = isWater && groundY < waterLevel - 0.65;

    if (state.inWater) {
      state.vel.y = 0;
      state.pos.y = M.lerp(state.pos.y, swimSurface, 1 - Math.exp(-8 * dt));
      state.onGround = true;
      wakeCooldown -= dt;
      if (state.speed > 0.8 && wakeCooldown <= 0 && ctx.water && ctx.water.addWake) {
        wakeCooldown = 0.25;
        ctx.water.addWake({ x: state.pos.x, z: state.pos.z, dir: [Math.sin(state.facingYaw), Math.cos(state.facingYaw)], speed: state.speed });
      }
    } else {
      state.vel.y += GRAVITY * dt;
      state.pos.y += state.vel.y * dt;
      if (state.pos.y <= groundY) {
        state.pos.y = groundY;
        state.vel.y = 0;
        state.onGround = true;
      } else {
        state.onGround = false;
      }
    }

    // Animate character rig
    rig.root.position.copy(state.pos);
    rig.root.rotation.y = state.facingYaw;
    const runRatio = M.clamp(state.speed / WALK_SPEED, 0, 1.8);
    if (state.speed > 0.25) {
      state.animPhase += dt * (4.5 + state.speed * 0.75);
      const s = Math.sin(state.animPhase);
      const amp = M.clamp(0.45 * runRatio, 0, 0.85);
      if (state.inWater) {
        rig.body.rotation.x = 0.55;
        rig.legL.rotation.x = s * 0.5;
        rig.legR.rotation.x = -s * 0.5;
        rig.armL.rotation.x = -0.8 + s * 0.7;
        rig.armR.rotation.x = -0.8 - s * 0.7;
      } else {
        rig.body.rotation.x = 0.06 * runRatio;
        rig.body.position.y = Math.abs(Math.cos(state.animPhase)) * 0.06 * Math.min(1, runRatio);
        rig.legL.rotation.x = s * amp;
        rig.legR.rotation.x = -s * amp;
        rig.armL.rotation.x = -s * amp * 0.85;
        rig.armR.rotation.x = s * amp * 0.65;
      }
    } else {
      state.animPhase += dt * 1.8;
      rig.body.rotation.x = M.lerp(rig.body.rotation.x, 0, 1 - Math.exp(-10 * dt));
      rig.body.position.y = Math.sin(state.animPhase) * 0.015;
      rig.legL.rotation.x = M.lerp(rig.legL.rotation.x, 0, 1 - Math.exp(-10 * dt));
      rig.legR.rotation.x = M.lerp(rig.legR.rotation.x, 0, 1 - Math.exp(-10 * dt));
      rig.armL.rotation.x = M.lerp(rig.armL.rotation.x, 0, 1 - Math.exp(-10 * dt));
      rig.armR.rotation.x = M.lerp(rig.armR.rotation.x, 0, 1 - Math.exp(-10 * dt));
    }

    // Compute third-person camera pose
    const targetY = state.pos.y + 1.45;
    const horiz = Math.cos(state.camPitch) * state.camDist;
    const vert = Math.sin(state.camPitch) * state.camDist;
    const camX = state.pos.x - Math.sin(state.camYaw) * horiz;
    const camZ = state.pos.z - Math.cos(state.camYaw) * horiz;
    const minCamY = ctx.ground.height(camX, camZ) + 0.75;
    const camY = Math.max(minCamY, targetY + vert);

    return {
      pos: [camX, camY, camZ],
      look: [state.pos.x, targetY, state.pos.z],
      fov: 54,
    };
  }

  return {
    state,
    rig,
    landmarks,
    teleport,
    update,
    setActive(v) {
      state.active = !!v;
      rig.root.visible = state.active;
    },
  };
}
