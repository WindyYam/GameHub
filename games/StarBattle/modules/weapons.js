'use strict';

/* =====================================================================
   STEP 5 — ENGINES & BIG GUNS: animated ion plumes, nozzle glows,
            tracking turrets, salvo fire, impact + hull-blast events
   ===================================================================== */

// ---------- engine plumes ----------
const PLUME_GEO = (() => { const g = new THREE.CylinderGeometry(.22, 1, 1, 24, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -.5); return g; })();   // unit: radius 1 at the nozzle, length 1 along -z
function plumeMaterial(core, edge, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCore: { value: new THREE.Color(...core) }, uEdge: { value: new THREE.Color(...edge) }, uSeed: { value: seed } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vP; uniform vec3 uCore,uEdge; uniform float uTime,uSeed;' + GLSL_NOISE + `
      void main(){
        float face=abs(dot(normalize(vN),normalize(-vP)));
        float along=clamp(1.-vUv.y,0.,1.);
        float n=f2(vec2(vUv.x*7.+uSeed,vUv.y*2.2-uTime*7.));
        float I=pow(along,1.2)*pow(face,1.4)*(.55+.9*n)*(.85+.15*sin(uTime*47.+uSeed));
        vec3 c=mix(uEdge,uCore,pow(along,.8)*face);
        gl_FragColor=vec4(c*I*1.25,1.);
      }`
  });
}
const ENGINE_FX = [];
for (const ship of SHIPS) {
  const A = ship.key === 'A', core = A ? [.9, 1.6, 3.6] : [3.2, 1.3, .55], edge = A ? [.1, .3, 1.5] : [1.4, .22, .05];
  ship.engines.forEach((e, i) => {
    const m = new THREE.Mesh(PLUME_GEO, plumeMaterial(core, edge, i * 3.7 + (A ? 0 : 11)));
    m.position.copy(e.pos).z += .6; m.scale.set(e.r * .95, e.r * .95, e.r * (A ? 12 : 10)); ship.root.add(m);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.halo, color: new THREE.Color(...core).multiplyScalar(.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.position.copy(e.pos).z += .3; s.scale.setScalar(e.r * 7.5); ship.root.add(s);
    ENGINE_FX.push({ m, s, base: e.r * 7.5, ph: rr(0, 9) });
  });
}
const ENGINE_LIGHTS = [];
for (const ship of SHIPS) {                       // the ion exhaust physically lights the stern of its own ship
  const A = ship.key === 'A', c = ship.engines.reduce((v, e) => v.add(e.pos), V3()).multiplyScalar(1 / ship.engines.length);
  const l = new THREE.PointLight(A ? 0x6fa4ff : 0xff7a38, 0, 150, 2); l.position.set(c.x, c.y, c.z - 8); ship.root.add(l);
  ENGINE_LIGHTS.push({ l, base: A ? 900 : 1100, ph: rr(0, 9) });
}
onFrame((dt, t) => { for (const f of ENGINE_FX) { f.m.material.uniforms.uTime.value = t; f.s.scale.setScalar(f.base * (.92 + .08 * Math.sin(t * 31 + f.ph) + .05 * Math.sin(t * 13 + f.ph * 2))); } for (const e of ENGINE_LIGHTS) e.l.intensity = e.base * (.92 + .08 * Math.sin(t * 31 + e.ph) + .05 * Math.sin(t * 13 + e.ph * 2)); });

// ---------- weapons ----------
const BOLT_SPEED = 130;
const FBOLT_SPEED = 110;
const BOLT_COL = { A: [3.4, .2, .12], B: [.3, 3.2, .42] };
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _inv = new THREE.Matrix4();
const dampAng = (cur, tgt, k, dt) => { let d = (tgt - cur) % 6.2832; if (d > 3.1416) d -= 6.2832; if (d < -3.1416) d += 6.2832; return cur + d * (1 - Math.exp(-k * dt)); };
const angDiff = (a, b) => { let d = (a - b) % 6.2832; if (d > 3.1416) d -= 6.2832; if (d < -3.1416) d += 6.2832; return d; };
function hullLocal(ship, out) {
  const z = rr2(-ship.len * .4, ship.len * .42), s = ship.sec(z);
  return out.set(rr2(-1, 1) * s.w * (ship.key === 'A' ? .62 : .78) * .85, s.yt + rr2(0, 1.2), z);
}
const FIGHT = { shots: 0, hits: 0, blasts: 0, intensity: 1 };
function turretFire(ship, foe, t, target, miss) {
  const col = BOLT_COL[ship.key], up = _e.set(0, 1, 0).transformDirection(foe.root.matrixWorld).clone();
  for (let i = 0; i < t.muzzles.length; i++) {
    t.obj.localToWorld(_a.copy(t.muzzles[i]));
    _b.copy(target).sub(_a); const dist = _b.length(); _b.multiplyScalar(1 / dist);
    _b.x += rr2(-.004, .004); _b.y += rr2(-.004, .004); _b.z += rr2(-.004, .004); _b.normalize();
    const life = dist / BOLT_SPEED + (miss ? 2.2 : 0), delay = i * .07;
    const sx = _a.x, sy = _a.y, sz = _a.z, vx = _b.x * BOLT_SPEED, vy = _b.y * BOLT_SPEED, vz = _b.z * BOLT_SPEED, big = t.size === 's2';
    schedule(delay, () => {
      fireBolt(sx, sy, sz, vx, vy, vz, life, big ? 15 : 10, big ? .7 : .5, col[0], col[1], col[2]);
      flashGlow(sx, sy, sz, big ? 9 : 6, [col[0] * .9, col[1] * .9, col[2] * .9], .13, 1.5);
    });
    FIGHT.shots++;
    if (!miss) {
      const hx = target.x, hy = target.y, hz = target.z, B = foe.key === 'B';
      schedule(delay + life, () => {
        _c.set(hx, hy, hz); impact(_c, up, big ? 1.35 : 1); FIGHT.hits++;
        if (rnd() < (B ? .05 : .025) * FIGHT.intensity) { explode(_c, rr2(.45, .95), up, { chunks: .5 }); FIGHT.blasts++; }
      });
    }
  }
}
// main cannons: a charging glow gathers at the muzzle, then one heavy slow bolt per barrel
const MAIN_SPEED = 100;
function mainCharge(ship, t, k, dt) {
  t.vfx = (t.vfx || 0) - dt; if (t.vfx > 0) return; t.vfx = .06;
  const col = BOLT_COL[ship.key], h = .4 + k;
  t.obj.localToWorld(_a.copy(t.muzzles[t.muzzles.length >> 1]));
  flashGlow(_a.x, _a.y, _a.z, 3 + 17 * k * k, [col[0] * h, col[1] * h, col[2] * h], .14, 1);
  for (let i = 0; i < 2; i++) {
    randDir(_v); const r = rr2(5, 9) * (1 - k * .4);
    fireBolt(_a.x + _v.x * r, _a.y + _v.y * r, _a.z + _v.z * r, -_v.x * r / .22, -_v.y * r / .22, -_v.z * r / .22, .22, 1.6, .12, col[0], col[1], col[2]);
  }
}
function mainShot(ship, foe, t) {
  const col = BOLT_COL[ship.key], up = _e.set(0, 1, 0).transformDirection(foe.root.matrixWorld).clone();
  foe.root.localToWorld(_c.copy(t.local)); const tx = _c.x, ty = _c.y, tz = _c.z, miss = rnd() < .12; let life = 0;
  for (let i = 0; i < t.muzzles.length; i++) {
    t.obj.localToWorld(_a.copy(t.muzzles[i]));
    _b.set(tx - _a.x, ty - _a.y, tz - _a.z); const dist = _b.length(); _b.multiplyScalar(1 / dist);
    life = dist / MAIN_SPEED + (miss ? 3 : 0);
    fireBolt(_a.x, _a.y, _a.z, _b.x * MAIN_SPEED, _b.y * MAIN_SPEED, _b.z * MAIN_SPEED, life, 34, 1.5, col[0] * 1.2, col[1] * 1.2, col[2] * 1.2);
    flashGlow(_a.x, _a.y, _a.z, 22, col, .4, 1.6);
    flashStar(_a.x, _a.y, _a.z, 32, [col[0] * 1.2, col[1] * 1.2, col[2] * 1.2], .3, 1, 1);
    FIGHT.shots++;
  }
  if (!miss) schedule(life, () => { _c.set(tx, ty, tz); impact(_c, up, 2.6); explode(_c, rr2(1.1, 1.7), up, { chunks: 1 }); FIGHT.hits++; FIGHT.blasts++; });
}
// each ship alternates lulls and barrages; in a barrage every ready turret looses a short burst of salvos
function updateTurrets(dt) {
  for (const ship of SHIPS) {
    const foe = ship === SHIP_A ? SHIP_B : SHIP_A;
    const fr = ship.fire || (ship.fire = { barrage: ship.key === 'A', left: rr2(1.5, 3) });
    fr.left -= dt;
    if (fr.left <= 0) { fr.barrage = !fr.barrage; fr.left = fr.barrage ? rr2(1.6, 3.2) : rr2(4, 8.5) / FIGHT.intensity; }
    for (const t of ship.turrets) {
      const charging = t.charge >= 0;
      if (!charging) t.retarget = (t.retarget ?? 0) - dt;
      if (t.retarget <= 0 && !charging) { t.local = hullLocal(foe, V3()); t.retarget = rr2(1.5, 5); t.miss = rnd() < .2; }
      foe.root.localToWorld(_c.copy(t.local));
      ship.root.worldToLocal(_d.copy(_c)); _d.sub(t.obj.position);
      const yaw = Math.atan2(_d.x, _d.z), pitch = clamp(-Math.atan2(_d.y, Math.hypot(_d.x, _d.z)), -1.45, .02);
      t.yaw = dampAng(t.yaw, yaw, 3.2, dt); t.pitch = damp(t.pitch, pitch, 3.2, dt);
      t.obj.rotation.set(t.pitch, t.yaw, 0);
      const aligned = Math.abs(angDiff(yaw, t.yaw)) < .08 && Math.abs(pitch - t.pitch) < .1;
      if (t.main) {
        if (charging) {
          t.charge += dt; mainCharge(ship, t, Math.min(1, t.charge / t.chargeLen), dt);
          if (t.charge >= t.chargeLen) { t.obj.updateMatrixWorld(true); mainShot(ship, foe, t); t.charge = -1; t.mcd = rr2(8, 15) / FIGHT.intensity; ship.mainBusy = false; t.retarget = 0; }
        } else {
          t.mcd = (t.mcd ?? rr2(2, 8)) - dt;
          if (t.mcd <= 0 && aligned && !ship.mainBusy) { t.charge = 0; t.chargeLen = rr2(2.2, 3.2); ship.mainBusy = true; }
        }
        continue;
      }
      t.cd -= dt;
      if (t.cd <= 0 && aligned && (fr.barrage ? rnd() < dt * 2.2 : rnd() < dt * .04)) {
        t.obj.updateMatrixWorld(true);
        const target = _c.clone(), miss = t.miss, n = fr.barrage ? 2 + (rnd() * 3 | 0) : 1;
        for (let k = 0; k < n; k++) schedule(k * .3, () => turretFire(ship, foe, t, target, miss));
        t.cd = fr.barrage ? rr2(3, 5) : rr2(1.5, 3);
      }
    }
  }
}
onFrame((dt) => updateTurrets(dt));
