import * as THREE from 'three';
import { clamp } from './noise.js';
import { getCityGroundY } from './city.js';

/**
 * Creates the BotW x GTA combat & crime systems:
 * - 3-hit melee sword combo with animated 3D energy crescent
 * - 360-degree stamina spin attack with expanding golden-cyan shockwave ring
 * - Sheikah Energy Bolt projectile shots (on-foot & GTA car drive-by!)
 * - Pooled spark bursts, player health/wanted stars/cash tracking
 */
export function createCombatSystem(scene, adventurer, city, vehicles) {
  const root = new THREE.Group();
  scene.add(root);

  const state = {
    health: 100,
    maxHealth: 100,
    cash: 0,
    wantedStars: 0,
    wantedDecay: 0,
    cameraShake: 0,
    invulnTimer: 0,
    attackTimer: 0,
    attackDuration: 0,
    attackMode: 'none', // 'combo1' | 'combo2' | 'combo3' | 'spin'
    comboIndex: 0,
    comboResetTimer: 0,
    hitApplied: false,
    shotCooldown: 0
  };

  // Expanding 360 Spin Shockwave Ring
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0x62f2ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.0, 32), waveMat);
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.visible = false;
  root.add(shockRing);
  let shockAge = 0;

  // Pooled Energy Bolt Projectiles
  const bolts = [];
  const boltGeo = new THREE.SphereGeometry(0.18, 10, 8);
  boltGeo.scale(0.85, 0.85, 2.2);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0x6ef4ff });
  const boltHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffd268,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Group();
    const core = new THREE.Mesh(boltGeo, boltMat);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), boltHaloMat);
    m.add(core, halo);
    m.visible = false;
    root.add(m);
    bolts.push({ mesh: m, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, active: false });
  }

  // Pooled Hit Spark Particles
  const SPARK_MAX = 96;
  const sparkPos = new Float32Array(SPARK_MAX * 3);
  const sparkVel = new Float32Array(SPARK_MAX * 3);
  const sparkLife = new Float32Array(SPARK_MAX).fill(1.0);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('aLife', new THREE.BufferAttribute(sparkLife, 1));
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */`
      attribute float aLife;
      varying float vLife;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aLife < 0.98 ? clamp((18.0 * (1.0 - aLife)) / max(-mv.z, 1.0), 2.0, 14.0) : 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vLife;
      void main() {
        if (vLife >= 0.98) discard;
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        vec3 col = mix(vec3(0.45, 0.96, 1.25), vec3(1.2, 0.85, 0.25), vLife);
        gl_FragColor = vec4(col, (1.0 - d) * (1.0 - vLife));
      }
    `
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  root.add(sparkPoints);
  let sparkCursor = 0;

  function emitSparks(pos, count = 12) {
    for (let i = 0; i < count; i++) {
      const idx = sparkCursor;
      sparkPos[idx * 3] = pos.x;
      sparkPos[idx * 3 + 1] = pos.y + 0.9;
      sparkPos[idx * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const sp = 3.5 + Math.random() * 6.5;
      sparkVel[idx * 3] = Math.cos(a) * sp;
      sparkVel[idx * 3 + 1] = 2.0 + Math.random() * 5.0;
      sparkVel[idx * 3 + 2] = Math.sin(a) * sp;
      sparkLife[idx] = 0.02;
      sparkCursor = (sparkCursor + 1) % SPARK_MAX;
    }
  }

  function addWanted(amount = 1) {
    state.wantedStars = clamp(state.wantedStars + amount, 0, 5);
    state.wantedDecay = 22.0;
  }

  function rewardNpcKo(npc) {
    state.cash += npc.cashReward || 25;
    if (npc.role === 'police') addWanted(2);
    else if (npc.role === 'civilian') addWanted(1);
    else state.wantedDecay = Math.max(state.wantedDecay, 8.0);
  }

  function triggerLightAttack(player, callbacks = {}) {
    if (player.inVehicle) {
      return triggerEnergyShot(player, player.yaw, callbacks);
    }
    if (state.attackTimer > 0.14) return false;
    state.comboIndex = state.comboResetTimer > 0 ? (state.comboIndex % 3) + 1 : 1;
    state.comboResetTimer = 0.85;
    state.attackMode = `combo${state.comboIndex}`;
    state.attackDuration = state.comboIndex === 3 ? 0.38 : 0.30;
    state.attackTimer = state.attackDuration;
    state.hitApplied = false;
    if (callbacks.onSlash) callbacks.onSlash(state.comboIndex);
    return true;
  }

  function triggerSpinAttack(player, callbacks = {}) {
    if (player.inVehicle || player.stamina < 0.25 || player.exhausted) return false;
    if (state.attackTimer > 0.12) return false;
    player.stamina = Math.max(0, player.stamina - 0.28);
    if (player.stamina <= 0.02) player.exhausted = true;

    state.attackMode = 'spin';
    state.attackDuration = 0.48;
    state.attackTimer = 0.48;
    state.hitApplied = false;
    shockRing.position.set(player.pos.x, player.pos.y + 0.15, player.pos.z);
    shockRing.scale.set(0.4, 0.4, 0.4);
    shockRing.visible = true;
    shockAge = 0.01;
    if (callbacks.onSpin) callbacks.onSpin();
    return true;
  }

  function triggerEnergyShot(player, aimYaw, callbacks = {}) {
    if (state.shotCooldown > 0) return false;
    state.shotCooldown = 0.26;
    const b = bolts.find((x) => !x.active) || bolts[0];
    b.active = true;
    b.life = 1.35;
    const sinY = Math.sin(aimYaw);
    const cosY = Math.cos(aimYaw);
    const originY = player.pos.y + (player.inVehicle ? 1.15 : 1.35);
    b.pos.set(player.pos.x - sinY * 1.4, originY, player.pos.z - cosY * 1.4);
    b.vel.set(-sinY * 68.0, -2.5, -cosY * 68.0);
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y = aimYaw;
    b.mesh.visible = true;
    city.panicNear(player.pos.x, player.pos.z, 15.0);
    if (callbacks.onBolt) callbacks.onBolt();
    return true;
  }

  function applyMeleeStrike(player, range, dmg, is360, callbacks = {}) {
    const fwdX = -Math.sin(player.yaw);
    const fwdZ = -Math.cos(player.yaw);
    let landed = false;

    for (let i = 0; i < city.npcs.length; i++) {
      const npc = city.npcs[i];
      if (npc.state === 'down' || npc.state === 'standby') continue;
      const dx = npc.pos.x - player.pos.x;
      const dz = npc.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      if (!is360 && dist > 0.35) {
        const dot = (dx * fwdX + dz * fwdZ) / dist;
        if (dot < -0.15) continue;
      }
      const knock = new THREE.Vector3(dx, 0, dz).normalize();
      const ko = city.damageNpc(npc, dmg, knock, {
        onNpcKo: (koNpc) => {
          rewardNpcKo(koNpc);
          if (callbacks.onKill) callbacks.onKill(koNpc);
        }
      });
      if (!ko && npc.role === 'police') addWanted(1);
      emitSparks(npc.pos, 14);
      landed = true;
    }

    for (let i = 0; i < vehicles.cars.length; i++) {
      const car = vehicles.cars[i];
      if (car.isPlayerDriven) continue;
      const dx = car.pos.x - player.pos.x;
      const dz = car.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < range + 0.9) {
        vehicles.damageCar(car, dmg, new THREE.Vector3(dx, 0, dz).normalize());
        addWanted(1);
        emitSparks(car.pos, 10);
        landed = true;
      }
    }

    if (landed) {
      state.cameraShake = is360 ? 0.32 : 0.18;
      if (callbacks.onImpact) callbacks.onImpact();
    }
    city.panicNear(player.pos.x, player.pos.z, 12.0);
  }

  function update(dt, player, callbacks = {}) {
    state.shotCooldown = Math.max(0, state.shotCooldown - dt);
    state.comboResetTimer = Math.max(0, state.comboResetTimer - dt);
    state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    state.cameraShake = Math.max(0, state.cameraShake - dt * 1.4);

    if (state.wantedStars > 0) {
      state.wantedDecay -= dt;
      if (state.wantedDecay <= 0) {
        state.wantedStars = Math.max(0, state.wantedStars - 1);
        state.wantedDecay = state.wantedStars > 0 ? 16.0 : 0.0;
      }
    } else {
      state.health = Math.min(state.maxHealth, state.health + dt * 3.0);
    }

    // Update Hit Sparks
    for (let i = 0; i < SPARK_MAX; i++) {
      if (sparkLife[i] < 1.0) {
        sparkLife[i] = Math.min(1.0, sparkLife[i] + dt * 2.2);
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 14.0 * dt;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.aLife.needsUpdate = true;

    // Update Spin Shockwave Ring
    if (shockRing.visible) {
      shockAge += dt * 2.2;
      const sc = 0.6 + shockAge * 5.2;
      shockRing.scale.set(sc, sc, sc);
      waveMat.opacity = Math.max(0, (1.0 - shockAge) * 0.85);
      if (shockAge >= 1.0) shockRing.visible = false;
    }

    // Update Energy Bolt Projectiles
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      if (!b.active) continue;
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);

      let hit = b.life <= 0 || b.pos.y <= getCityGroundY(b.pos.x, b.pos.z) + 0.15;
      if (!hit) {
        for (let c = 0; c < city.colliders.length; c++) {
          const box = city.colliders[c];
          if (b.pos.x > box.minX && b.pos.x < box.maxX && b.pos.z > box.minZ && b.pos.z < box.maxZ && b.pos.y < box.maxY) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (let n = 0; n < city.npcs.length; n++) {
          const npc = city.npcs[n];
          if (npc.state === 'down' || npc.state === 'standby') continue;
          if (Math.hypot(npc.pos.x - b.pos.x, npc.pos.z - b.pos.z) < 1.15 && Math.abs(b.pos.y - (npc.pos.y + 1.0)) < 1.3) {
            const ko = city.damageNpc(npc, 45, b.vel.clone().normalize(), {
              onNpcKo: (koNpc) => {
                rewardNpcKo(koNpc);
                if (callbacks.onKill) callbacks.onKill(koNpc);
              }
            });
            if (!ko && npc.role === 'police') addWanted(1);
            if (callbacks.onImpact) callbacks.onImpact();
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (let k = 0; k < vehicles.cars.length; k++) {
          const car = vehicles.cars[k];
          if (car.isPlayerDriven) continue;
          if (Math.hypot(car.pos.x - b.pos.x, car.pos.z - b.pos.z) < 1.9 && Math.abs(b.pos.y - (car.pos.y + 0.9)) < 1.3) {
            vehicles.damageCar(car, 35, b.vel.clone().normalize());
            addWanted(1);
            if (callbacks.onImpact) callbacks.onImpact();
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        emitSparks(b.pos, 10);
        b.active = false;
        b.mesh.visible = false;
      }
    }

    // Animate Sword Swings & Crescent Arc
    if (state.attackTimer > 0 && !player.inVehicle) {
      state.attackTimer = Math.max(0, state.attackTimer - dt);
      const p = 1.0 - state.attackTimer / Math.max(0.01, state.attackDuration);
      adventurer.handSword.visible = true;
      adventurer.backHilt.visible = false;
      adventurer.backCrossguard.visible = false;
      adventurer.slashArc.visible = true;

      if (state.attackMode === 'spin') {
        adventurer.bodyPivot.rotation.y = p * Math.PI * 2.0;
        adventurer.rightArm.rotation.set(-1.35, 0, -1.2);
        adventurer.slashArc.rotation.set(0, p * Math.PI * 2.0, 0);
        adventurer.slashMat.uniforms.uSpinMode.value = 1.0;
        adventurer.slashMat.uniforms.uOpacity.value = Math.sin(p * Math.PI) * 0.95;
        if (!state.hitApplied && p > 0.30) {
          state.hitApplied = true;
          applyMeleeStrike(player, 4.9, 65, true, callbacks);
        }
      } else {
        const swingDir = state.comboIndex === 2 ? -1 : 1;
        const arcAngle = (-1.15 + p * 2.3) * swingDir;
        adventurer.bodyPivot.rotation.y = arcAngle * 0.28;
        adventurer.rightArm.rotation.set(-1.35 + Math.sin(p * Math.PI) * 0.4, arcAngle * 0.85, -0.35 * swingDir);
        adventurer.slashArc.rotation.set(0.18 * swingDir, -arcAngle + Math.PI * 0.5, state.comboIndex === 3 ? 0.35 : -0.20 * swingDir);
        adventurer.slashMat.uniforms.uSpinMode.value = 0.0;
        adventurer.slashMat.uniforms.uOpacity.value = Math.sin(p * Math.PI) * 0.88;
        if (!state.hitApplied && p > 0.35) {
          state.hitApplied = true;
          applyMeleeStrike(player, 3.6, state.comboIndex === 3 ? 52 : 34, false, callbacks);
        }
      }
    } else {
      adventurer.handSword.visible = false;
      adventurer.backHilt.visible = true;
      adventurer.backCrossguard.visible = true;
      adventurer.slashArc.visible = false;
      adventurer.bodyPivot.rotation.y = THREE.MathUtils.lerp(adventurer.bodyPivot.rotation.y, 0, Math.min(1, 14 * dt));
    }
  }

  function hurtPlayer(dmg, attacker, callbacks = {}) {
    if (state.invulnTimer > 0) return;
    state.invulnTimer = 0.65;
    state.health = Math.max(0, state.health - dmg);
    state.cameraShake = 0.25;
    if (state.health <= 0) {
      // Respawn safely without hard-locking gameplay
      state.health = state.maxHealth;
      state.wantedStars = 0;
      state.wantedDecay = 0;
      if (callbacks.onKnockout) callbacks.onKnockout();
    }
  }

  return {
    state,
    triggerLightAttack,
    triggerSpinAttack,
    triggerEnergyShot,
    addWanted,
    hurtPlayer,
    update
  };
}
