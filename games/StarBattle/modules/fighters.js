'use strict';

/* =====================================================================
   STEP 6 — THE INTERCEPTORS: four instanced fighter classes (engine glow + ion trails),
            hangar launch streams, dogfights / strafing runs / kills, and the hero kamikaze
   ===================================================================== */

function arrowFighter() {            // A1: delta-wing interceptor, pale with red livery
  const K = makeKit();
  K.loft([{ z: -2.3, pts: ring(.95, .5, -.4, .8, .8, .5) }, { z: .3, pts: ring(.8, .55, -.4, .7, .7, .5) }, { z: 2.8, pts: ring(.12, .14, -.1, .8, .8, .5) }], COL.W);
  K.sph(.5, 0, .5, -.3, COL.BLK, .8, .65, 1.6);
  for (const sx of [-1, 1]) {
    K.box(2.5, .09, 1.5, sx * 1.65, 0, -1, COL.W, 0, sx * .5, 0); K.box(.22, .13, 1.3, sx * 2.75, 0, -1.75, COL.RED, 0, sx * .5, 0);
    K.box(.08, .75, .9, sx * .4, .5, -1.9, COL.RED, 0, 0, sx * .12); K.box(.25, .5, 1.3, sx * .45, -.1, -1.6, COL.DARK);
    K.gsph(.3, sx * .45, -.1, -2.3, [1.2, 2.4, 5]);
  }
  K.box(.3, .07, 2.4, 0, .43, .6, COL.RED);
  return { g: K.geometry(), gg: K.glowGeometry(), trail: [-2.3, 11, 1.1], col: [.5, 1.1, 3.2] };
}
function xFighter() {                // A2: four-wing gunship
  const K = makeKit();
  K.loft([{ z: -2.3, pts: ring(.55, .45, -.4, .8, .8, .5) }, { z: 1.2, pts: ring(.5, .45, -.38, .7, .7, .5) }, { z: 3.2, pts: ring(.08, .1, -.08, .8, .8, .5) }], COL.W);
  K.sph(.38, 0, .45, .2, COL.BLK, .9, .7, 1.5);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    K.box(2.3, .08, 1.05, sx * 1.35, sy * .5, -.8, COL.W, 0, 0, sx * sy * .3);
    K.box(.2, .12, .9, sx * 2.45, sy * 1.0, -.9, COL.RED, 0, 0, sx * sy * .3);
    K.cyl(.27, 1.8, sx * .7, sy * .38, -1.5, COL.DARK, Math.PI / 2);
    K.cyl(.04, 2.6, sx * 2.45, sy * 1.0, .4, COL.DARK, Math.PI / 2);
    K.gsph(.26, sx * .7, sy * .38, -2.42, [1.2, 2.4, 5]);
  }
  K.box(.25, .06, 2.2, 0, .45, .4, COL.RED);
  return { g: K.geometry(), gg: K.glowGeometry(), trail: [-2.4, 9, 1.9], col: [.5, 1.1, 3.2] };
}
function hexFighter() {              // B1: hexagonal-wing drone, green eye
  const K = makeKit(), hexG = new THREE.CylinderGeometry(1.8, 1.8, .12, 6);
  K.sph(.85, 0, 0, 0, COL.DARK, 1, 1, 1.1); K.cyl(.45, 1.9, 0, 0, 0, COL.DARK, 0, 0, Math.PI / 2);
  K.box(2.6, .12, .12, 0, 0, 0, COL.DARK);
  for (const sx of [-1, 1]) { K.cyl(1.8, .12, sx * 2.3, 0, 0, COL.W, 0, 0, Math.PI / 2); K.box(.14, .14, .14, sx * 1.4, 0, 0, COL.BLK); K.box(.12, 2.8, .12, sx * 2.3, 0, 0, COL.DARK); }
  void hexG;
  K.gsph(.3, 0, 0, .88, [.5, 3.4, .8]); K.gsph(.22, 0, 0, -.95, [3, 1.6, .4]);
  return { g: K.geometry(), gg: K.glowGeometry(), trail: [-1, 7, .9], col: [2.4, 1.2, .35] };
}
function dartFighter() {             // B2: needle with splayed claws, green eyes
  const K = makeKit();
  K.loft([{ z: -2.5, pts: ring(.7, .5, -.45, .7, .7, .5) }, { z: .6, pts: ring(.6, .5, -.4, .6, .6, .5) }, { z: 3.4, pts: ring(.07, .1, -.08, .8, .8, .5) }], COL.DARK);
  K.sph(.32, 0, .42, .5, COL.BLK, .9, .6, 1.3);
  for (const a of [0, 2.094, 4.188]) {
    const x = Math.sin(a), y = Math.cos(a);
    K.box(.16, 1.9, 1.3, x * 1.05, y * 1.05, -1.25, COL.W, 0, 0, -a); K.box(.12, .12, 2.8, x * 1.9, y * 1.9, .1, COL.DARK);
    K.gsph(.16, x * 1.9, y * 1.9, 1.55, [.5, 3.2, .7]);
  }
  K.gsph(.26, 0, -.05, -2.6, [3, 1.4, .4]);
  return { g: K.geometry(), gg: K.glowGeometry(), trail: [-2.6, 8, .8], col: [2.4, 1.2, .35] };
}

const FIGHTER_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .48, metalness: .45 });
const TRAIL_VERT = 'varying vec2 vUv; void main(){ vUv=uv; vec4 p=vec4(position,1.); p=instanceMatrix*p; gl_Position=projectionMatrix*viewMatrix*modelMatrix*p; }';
const TRAIL_FRAG = 'varying vec2 vUv; uniform vec3 uCol; void main(){ float a=pow(clamp(vUv.y,0.,1.),1.7)*pow(clamp(1.-abs(vUv.x-.5)*2.,0.,1.),1.3); gl_FragColor=vec4(uCol*a,1.); }';
function trailGeometry(z0, len, w) {
  const a = new THREE.PlaneGeometry(w, len); a.rotateX(Math.PI / 2);
  const b = new THREE.PlaneGeometry(w, len); b.rotateX(Math.PI / 2); b.rotateZ(Math.PI / 2);
  const g = THREE.BufferGeometryUtils.mergeBufferGeometries([a, b]); g.translate(0, 0, z0 - len / 2); return g;
}
const FTYPES = [];
function makeFighterType(def, side, count, scale) {
  const body = new THREE.InstancedMesh(def.g, FIGHTER_MAT, count); body.frustumCulled = false; body.castShadow = false;
  const glow = new THREE.InstancedMesh(def.gg, GLOW_MAT, count); glow.instanceMatrix = body.instanceMatrix; glow.frustumCulled = false;
  const tm = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(...def.col).multiplyScalar(.55) } }, vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const trail = new THREE.InstancedMesh(trailGeometry(...def.trail), tm, count); trail.instanceMatrix = body.instanceMatrix; trail.frustumCulled = false; trail.renderOrder = 3;
  scene.add(body, glow, trail);
  const t = { body, glow, trail, count, side, scale, arr: body.instanceMatrix.array };
  FTYPES.push(t); return t;
}
const FT = [
  makeFighterType(arrowFighter(), 0, 64, .42), makeFighterType(xFighter(), 0, 44, .42),
  makeFighterType(hexFighter(), 1, 64, .42), makeFighterType(dartFighter(), 1, 44, .42)
];

// ---------- fighter simulation ----------
const BATTLE = { min: V3(-560, -90, -520), max: V3(620, 170, 520) };
const F = [], BY_SIDE = [[], []];
const HERO_LOCAL = V3(6, 11.5, -6);                            // the breach point on the dark flagship's dorsal hull
for (const ft of FT) for (let i = 0; i < ft.count; i++) {
  const f = { ft, i, side: ft.side, scale: ft.scale * rr(.9, 1.15), pos: V3(), dir: V3(0, 0, 1), right: V3(1, 0, 0), goal: V3(), speed: 40, base: rr(60, 95), bank: 0, state: 2, t0: 0, mode: 0, modeT: 0, tgt: null, fireCd: rr(0, 2), respawnAt: 0, sc: 0, turn: rr(1.5, 2.4), burst: 0, flight: null, slotIdx: 0, want: V3(0, 0, 1), fspd: 40 };
  F.push(f); BY_SIDE[f.side].push(f);
}
const _u = V3(0, 1, 0), _r = V3(), _y = V3(), _f = V3(), _g1 = V3(), _g2 = V3();

// ---------- flights: 4–6 interceptors share a leader and hold a formation slot behind it ----------
const FLIGHTS = [], SHAPES = ['vee', 'echelon', 'line', 'diamond', 'column'];
for (const ft of FT) {
  const mem = F.filter(f => f.ft === ft);
  for (let i = 0; i < mem.length;) {
    let n = pick([4, 5, 5, 6]); if (mem.length - i - n < 3) n = mem.length - i;
    const fl = { m: mem.slice(i, i + n), lead: null, shape: pick(SHAPES), s: rr(4.5, 6.5), side: rand() < .5 ? -1 : 1 };
    fl.m.forEach(g => { g.flight = fl; }); FLIGHTS.push(fl); i += n;
  }
}
const canLead = g => !!g && g.state === 1 && g.mode !== 3 && g.mode !== 4;
function assignSlots(fl) { let k = 0; for (const g of fl.m) if (g.state === 1 && g.mode === 5) g.slotIdx = k++; }
// slot k as (right, up, forward) offsets from the leader
function slotOffset(fl, k, out) {
  const s = fl.s, sd = k % 2 ? 1 : -1, rank = (k >> 1) + 1;
  switch (fl.shape) {
    case 'echelon': return out.set(fl.side * (k + 1) * s, 0, -(k + 1) * s * .8);
    case 'line': return out.set(sd * rank * s * 1.1, 0, -rank * s * .12);
    case 'diamond': return k === 2 ? out.set(0, 0, -s * 1.8) : k < 2 ? out.set(sd * s, 0, -s * .8) : out.set(sd * rank * s, 0, -rank * s * .9);
    case 'column': return out.set(0, (k % 2 ? 1 : -1) * .12 * s, -(k + 1) * s * 1.2);
    default: return out.set(sd * rank * s, 0, -rank * s * .9);
  }
}
// steer toward the slot while pointing mostly along the leader's heading, and match its speed
function followFlight(f, ld) {
  slotOffset(f.flight, f.slotIdx, _g1);
  _g2.crossVectors(_u, ld.dir); if (_g2.lengthSq() < 1e-4) _g2.set(1, 0, 0); _g2.normalize();
  f.goal.copy(ld.pos).addScaledVector(_g2, _g1.x).addScaledVector(_u, _g1.y).addScaledVector(ld.dir, _g1.z);
  _g1.copy(f.goal).sub(f.pos); const d = _g1.length(), ahead = _g1.dot(ld.dir);
  f.want.copy(ld.dir).addScaledVector(_g1, clamp(d / 4, 0, 4) / Math.max(d, 1e-3)).normalize();
  f.fspd = clamp(ld.speed + ahead * 1.6, ld.speed * .4, ld.speed * 1.8);
}
const aimDot = (f, p) => { _g1.copy(p).sub(f.pos).normalize(); return f.dir.dot(_g1); };
function foeOf(side) { return side === 0 ? SHIP_B : SHIP_A; }
function ownOf(side) { return side === 0 ? SHIP_A : SHIP_B; }
function randomGoal(out) { return out.set(rr2(BATTLE.min.x, BATTLE.max.x), rr2(BATTLE.min.y, BATTLE.max.y), rr2(BATTLE.min.z, BATTLE.max.z)); }
function pickMode(f) {
  const fl = f.flight;
  if (!canLead(fl.lead)) fl.lead = f;
  if (fl.lead !== f) { f.mode = 5; f.modeT = 1e9; f.tgt = null; return; }
  const r = rnd(); f.modeT = T + rr2(3.5, 7);
  if (r < .5) { f.mode = 0; const foes = BY_SIDE[1 - f.side].filter(g => g.state === 1); f.tgt = null; let bd = 1e9; for (let i = 0; i < 5 && foes.length; i++) { const g = foes[(rnd() * foes.length) | 0], d = g.pos.distanceToSquared(f.pos); if (d < bd) { bd = d; f.tgt = g; } } if (!f.tgt) f.mode = 2; }
  else if (r < .82) { f.mode = 1; f.tgtLocal = hullLocal(foeOf(f.side), V3()); f.tgtLocal.y += 10; f.burst = 0; }
  else f.mode = 2;
  if (f.mode === 2) { randomGoal(f.goal); f.modeT = T + rr2(2.5, 5); }
}
function spawnFighter(f, mid) {
  const own = ownOf(f.side); f.state = mid ? 1 : 0; f.t0 = T; f.sc = mid ? 1 : 0; f.bank = 0; f.speed = mid ? f.base : 14; f.tgt = null;
  if (mid) {
    const o = own.root.position; f.pos.set(o.x + rr2(-150, 150), rr2(-30, 70), o.z + rr2(-140, 120)); randDir(f.dir); f.dir.y *= .3; f.dir.normalize();
    pickMode(f);
    if (f.mode === 5) { assignSlots(f.flight); const ld = f.flight.lead; followFlight(f, ld); f.pos.copy(f.goal); f.dir.copy(ld.dir); f.speed = ld.speed; }
  } else {
    _a.copy(own.hangar.pos); _a.x += rr2(-3.6, 3.6); _a.z += rr2(-9, 1); own.root.localToWorld(_a); f.pos.copy(_a);
    f.dir.copy(own.hangar.dir).transformDirection(own.root.matrixWorld); f.dir.x += rr2(-.06, .06); f.dir.normalize();
    f.goal.copy(f.pos).addScaledVector(f.dir, 110); f.goal.y += rr2(8, 24); f.mode = 4; f.modeT = T + rr2(2.2, 3.2);
    flashGlow(f.pos.x, f.pos.y, f.pos.z, 4, A_GLOW[f.side], .35, 1.2);
  }
}
const A_GLOW = [[1, 1.6, 3], [.9, 2.6, 1]];
function writeMatrix(f, hide) {
  const a = f.ft.arr, o = f.i * 16;
  if (hide) { a.fill(0, o, o + 16); return; }
  _f.copy(f.dir);
  if (f.mode === PILOT_MODE) _r.copy(f.right).addScaledVector(_f, -f.right.dot(_f)).normalize();
  else { _r.crossVectors(_u, _f); if (_r.lengthSq() < 1e-4) _r.set(1, 0, 0); _r.normalize(); }
  _y.crossVectors(_f, _r);
  const cb = Math.cos(f.bank), sb = Math.sin(f.bank), s = f.scale * f.sc;
  const xx = _r.x * cb + _y.x * sb, xy = _r.y * cb + _y.y * sb, xz = _r.z * cb + _y.z * sb, yx = -_r.x * sb + _y.x * cb, yy = -_r.y * sb + _y.y * cb, yz = -_r.z * sb + _y.z * cb;
  a[o] = xx * s; a[o + 1] = xy * s; a[o + 2] = xz * s; a[o + 3] = 0; a[o + 4] = yx * s; a[o + 5] = yy * s; a[o + 6] = yz * s; a[o + 7] = 0;
  a[o + 8] = _f.x * s; a[o + 9] = _f.y * s; a[o + 10] = _f.z * s; a[o + 11] = 0; a[o + 12] = f.pos.x; a[o + 13] = f.pos.y; a[o + 14] = f.pos.z; a[o + 15] = 1;
}
function killFighter(f, size = .4) {
  if (f.state === 2) return;
  _c.copy(f.pos); explode(_c, size * .7, null, { chunks: .5, light: false, smoke: .5 });
  f.state = 2; f.respawnAt = T + rr2(3, 8); writeMatrix(f, true); FIGHT.kills = (FIGHT.kills || 0) + 1;
}
function fighterShoot(f, tx, ty, tz, killTarget, speed = FBOLT_SPEED) {
  const col = BOLT_COL[f.side ? 'B' : 'A'];
  if (f.mode === PILOT_MODE) _r.copy(f.right);
  else _r.crossVectors(_u, f.dir).normalize();
  for (const g of [-1, 1]) {
    _a.copy(f.pos).addScaledVector(f.dir, f.scale * 2.7).addScaledVector(_r, g * f.scale);
    _b.set(tx - _a.x, ty - _a.y, tz - _a.z); const dist = _b.length(); _b.multiplyScalar(1 / dist);
    _b.x += rr2(-.012, .012); _b.y += rr2(-.012, .012); _b.z += rr2(-.012, .012); _b.normalize();
    fireBolt(_a.x, _a.y, _a.z, _b.x * speed, _b.y * speed, _b.z * speed, Math.min(3, dist / speed + .4), 3, .14, col[0], col[1], col[2]);
  }
  if (killTarget && killTarget.state === 1 && rnd() < .07) { const d = Math.hypot(tx - f.pos.x, ty - f.pos.y, tz - f.pos.z); schedule(d / speed, () => killFighter(killTarget, rr2(.32, .55))); }
}
function strafeFire(f, d, goal) {
  const hx = goal.x, hy = goal.y - 10, hz = goal.z;
  fighterShoot(f, hx, hy, hz, null); f.fireCd = .12; f.burst += .2;
  schedule(d / FBOLT_SPEED, () => { if (rnd() < .6) impact(V3(hx, hy, hz), V3(0, 1, 0), .5); });
}
function updateFighters(dt, t, rdt) {
  for (const s of SHIPS) { s.inv = s.inv || new THREE.Matrix4(); s.inv.copy(s.root.matrixWorld).invert(); }
  for (const fl of FLIGHTS) {
    if (!canLead(fl.lead)) { fl.lead = fl.m.find(g => canLead(g)) || null; if (fl.lead) pickMode(fl.lead); }
    assignSlots(fl);
  }
  for (const f of F) {
    if (f.state === 2) { if (t >= f.respawnAt) spawnFighter(f, false); else continue; }
    const foe = foeOf(f.side), own = ownOf(f.side);
    // ---- goals
    if (f.mode === 4) {
      if (t > f.modeT) {
        f.state = 1;
        if (f === PILOT.fighter) { resetPilotOrientation(f); f.mode = PILOT_MODE; }
        else pickMode(f);
      }
    }
    else if (f.mode === 3) {                                       // kamikaze
      foe.root.localToWorld(f.goal.copy(HERO_LOCAL));
      if (f.pos.distanceTo(f.goal) < 3) {
        const up = _e.set(0, 1, 0).transformDirection(foe.root.matrixWorld).clone(); const hit = f.goal.clone();
        killFighter(f, .3); explode(hit, 2.1, up, { chunks: 1.6 }); FIGHT.hero = (FIGHT.hero || 0) + 1; finalUniforms.uFlash.value = .14; BREACHES.push({ ship: foe, local: HERO_LOCAL.clone(), until: t + 16, k: 1 });
        continue;
      }
    } else if (f.mode === PILOT_MODE) {
      pilotFlightControl(f, dt);
    } else if (f.mode === 5) {                                     // flying in formation
      const fl = f.flight, ld = fl.lead;
      if (!canLead(ld) || ld === f) { fl.lead = f; pickMode(f); }
      else {
        followFlight(f, ld); f.fireCd -= dt;
        if (ld.mode !== 1) f.burst = 0;
        if (f.fireCd <= 0) {
          if (ld.mode === 0 && ld.tgt && ld.tgt.state === 1) {
            const e = ld.tgt, d = f.pos.distanceTo(e.pos);
            if (d < 130 && aimDot(f, e.pos) > .95) { const lead = d / FBOLT_SPEED; fighterShoot(f, e.pos.x + e.dir.x * e.speed * lead, e.pos.y + e.dir.y * e.speed * lead, e.pos.z + e.dir.z * e.speed * lead, e); f.fireCd = rr2(.3, .8); }
          } else if (ld.mode === 1) {
            const d = f.pos.distanceTo(ld.goal);
            if (d < 70 && f.burst < 3 && aimDot(f, ld.goal) > .93) strafeFire(f, d, ld.goal);
          }
        }
      }
    } else {
      if (t > f.modeT) pickMode(f);
      if (f.mode === 0) {
        const e = f.tgt; if (!e || e.state !== 1) pickMode(f);
        else { f.goal.copy(e.pos).addScaledVector(e.dir, e.speed * .5); const d = f.pos.distanceTo(e.pos); if (d < 6) { f.mode = 2; randomGoal(f.goal); f.modeT = t + rr2(1.5, 3); } }
      } else if (f.mode === 1) {
        foe.root.localToWorld(f.goal.copy(f.tgtLocal)); const d = f.pos.distanceTo(f.goal);
        if (d < 70 && f.burst < 3) { f.fireCd -= dt; if (f.fireCd <= 0 && Math.abs(angToGoal(f)) < .35) strafeFire(f, d, f.goal); }
        if (d < 22) { f.mode = 2; f.goal.copy(f.pos).addScaledVector(f.dir, 140); f.goal.y += rr2(10, 50); f.goal.x += rr2(-60, 60); f.modeT = t + rr2(2, 3.5); }
      }
      if (f.mode === 0 && f.tgt) {                                     // dogfight fire
        f.fireCd -= dt; const e = f.tgt, d = f.pos.distanceTo(e.pos);
        if (f.fireCd <= 0 && d < 130 && Math.abs(angToGoal(f)) < .3) { const lead = d / FBOLT_SPEED; fighterShoot(f, e.pos.x + e.dir.x * e.speed * lead, e.pos.y + e.dir.y * e.speed * lead, e.pos.z + e.dir.z * e.speed * lead, e); f.fireCd = rr2(.25, .6); if (rnd() < .15) f.fireCd = rr2(1, 2); }
      }
    }
    // ---- steering
    let yawRate;
    if (f.mode === PILOT_MODE) {
      yawRate = steerPilotFighter(f, dt);
    } else {
      if (f.mode === 5) _a.copy(f.want); else { _a.copy(f.goal).sub(f.pos); const dist = _a.length() || 1; _a.multiplyScalar(1 / dist); }
      const px = f.dir.x, pz = f.dir.z;
      f.dir.lerp(_a, clamp(f.turn * dt * (f.mode === 3 ? 2.4 : f.mode === 5 ? 3.2 : 1), 0, 1)); if (f.dir.lengthSq() < .05) f.dir.set(-pz, 0, px); f.dir.normalize();
      yawRate = (f.dir.x * pz - f.dir.z * px) / Math.max(dt, 1e-4);
    }
    f.bank = f.mode === PILOT_MODE ? 0 : damp(f.bank, clamp(yawRate * .8, -1.2, 1.2), 5, dt);
    const spd = f.mode === 3 ? 150 : f.mode === 4 ? lerp(14, f.base, smooth(0, 2.2, t - f.t0)) : f.mode === 5 ? f.fspd : f.mode === PILOT_MODE ? f.base * (PILOT.boost ? 1.65 : 1) : f.base * (f.mode === 1 ? 1.15 : 1);
    f.speed = damp(f.speed, spd, f.mode === 5 ? 5 : 2, dt); f.pos.addScaledVector(f.dir, f.speed * dt);
    f.sc = Math.min(1, f.sc + dt * 2.2);
    // ---- stay out of the hulls
    for (const s of SHIPS) {
      _d.copy(f.pos).applyMatrix4(s.inv); const k = s.sec(clamp(_d.z, -s.len / 2, s.len / 2));
      if (Math.abs(_d.x) < k.w + 4 && _d.z > -s.len / 2 - 6 && _d.z < s.len / 2 + 6 && _d.y < k.yt + 5 && _d.y > k.yb - 7 && !(f.mode === 3 && s === foe)) { f.pos.y += 38 * dt; if (f.dir.y < .3) { f.dir.y += dt * 2; f.dir.normalize(); } }
    }
    if (f.mode !== PILOT_MODE) f.pos.y = Math.max(f.pos.y, BATTLE.min.y - 30);
    if (f.mode !== 5 && f.mode !== PILOT_MODE && (f.pos.x < BATTLE.min.x - 60 || f.pos.x > BATTLE.max.x + 60 || f.pos.z < BATTLE.min.z - 80 || f.pos.z > BATTLE.max.z + 60 || f.pos.y > BATTLE.max.y + 80)) { f.mode = 2; randomGoal(f.goal); f.modeT = t + 4; }
    writeMatrix(f, false);
  }
  for (const ft of FT) { ft.body.instanceMatrix.needsUpdate = true; }
  if (PILOT.fighter) updatePilotCamera(PILOT.fighter, rdt);
}
const angToGoal = f => { _b.copy(f.goal).sub(f.pos).normalize(); return Math.acos(clamp(f.dir.dot(_b), -1, 1)) * (_b.x * f.dir.z - _b.z * f.dir.x > 0 ? 1 : -1); };
// stagger: every other flight is already mid-fight, the rest launch together from the hangars over the first seconds
FLIGHTS.forEach((fl, i) => {
  const t0 = rr(.2, 10);
  fl.m.forEach((f, j) => { if (i % 2) spawnFighter(f, true); else { f.state = 2; f.respawnAt = t0 + j * .35; writeMatrix(f, true); } });
});
onFrame((dt, t, rdt) => updateFighters(dt, t, rdt));

// ---------- long ion trails: world-space ribbons that keep the last few seconds of every fighter's path ----------
(() => {
  const K = 6, P = K + 1, DT = .08, n = F.length, VPF = P * 2;          // K samples every DT seconds, plus the live head point
  const pos = new Float32Array(n * VPF * 3), dir = new Float32Array(n * VPF * 3), info = new Float32Array(n * VPF * 3), col = new Float32Array(n * VPF * 3);
  const hist = new Float32Array(n * K * 3), idx = [];                      // hist: sample 0 is the newest
  for (let i = 0; i < n; i++) {
    const c = F[i].side ? [1.7, .85, .25] : [.35, .8, 2.2];
    for (let j = 0; j < P; j++) for (let s = 0; s < 2; s++) { const v = (i * P + j) * 2 + s; info[v * 3] = s ? 1 : -1; info[v * 3 + 1] = j / K; col.set(c, v * 3); }
    for (let j = 0; j < K; j++) { const a = i * VPF + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aDir = new THREE.BufferAttribute(dir, 3);
  aPos.setUsage(THREE.DynamicDrawUsage); aDir.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('aDir', aDir); geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 aDir,aInfo,aCol; varying vec2 vV; varying vec3 vC;
      void main(){
        vec3 p=position, toC=cameraPosition-p; float dist=length(toC);
        vec3 side=cross(aDir,toC); float sl=length(side); side=sl>1e-5?side/sl:vec3(0.,1.,0.);
        p+=side*aInfo.x*max(.35,dist*.0013)*(1.-.75*aInfo.y)*step(1e-10,dot(aDir,aDir));
        vV=aInfo.xy; vC=aCol; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `varying vec2 vV; varying vec3 vC;
      void main(){ float e=clamp(1.-vV.x*vV.x,0.,1.); gl_FragColor=vec4(vC*e*e*pow(clamp(1.-vV.y,0.,1.),1.6),1.); }`
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
  const put = (i, j, x, y, z, dx, dy, dz) => {
    for (let s = 0; s < 2; s++) { const o = ((i * P + j) * 2 + s) * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; dir[o] = dx; dir[o + 1] = dy; dir[o + 2] = dz; }
  };
  function tick() {
    for (let i = 0; i < n; i++) {
      const p = F[i].pos, b = i * K * 3, dx = p.x - hist[b], dy = p.y - hist[b + 1], dz = p.z - hist[b + 2];
      if (dx * dx + dy * dy + dz * dz > 3600) { for (let j = 0; j < K; j++) { hist[b + j * 3] = p.x; hist[b + j * 3 + 1] = p.y; hist[b + j * 3 + 2] = p.z; } }   // teleport (respawn): restart the trail
      else { hist.copyWithin(b + 3, b, b + (K - 1) * 3); hist[b] = p.x; hist[b + 1] = p.y; hist[b + 2] = p.z; }
      for (let j = 1; j <= K; j++) {
        const s = b + (j - 1) * 3, nw = j > 1 ? s - 3 : -1, od = j < K ? s + 3 : s;
        const nx = nw < 0 ? p.x : hist[nw], ny = nw < 0 ? p.y : hist[nw + 1], nz = nw < 0 ? p.z : hist[nw + 2];
        put(i, j, hist[s], hist[s + 1], hist[s + 2], nx - hist[od], ny - hist[od + 1], nz - hist[od + 2]);
      }
    }
  }
  tick();
  let acc = 0;
  onFrame(dt => {
    acc += dt; if (acc >= DT) { acc = 0; tick(); }
    for (let i = 0; i < n; i++) {
      const p = F[i].pos, b = i * K * 3, dx = p.x - hist[b], dy = p.y - hist[b + 1], dz = p.z - hist[b + 2];
      if (dx * dx + dy * dy + dz * dz > 3600) {                            // respawn teleport: drop the old path now, not at the next sample, or a ribbon spans the jump
        for (let j = 0; j < K; j++) { hist[b + j * 3] = p.x; hist[b + j * 3 + 1] = p.y; hist[b + j * 3 + 2] = p.z; }
        for (let j = 1; j <= K; j++) put(i, j, p.x, p.y, p.z, 0, 0, 0);
        put(i, 0, p.x, p.y, p.z, 0, 0, 0);
      } else put(i, 0, p.x, p.y, p.z, dx, dy, dz);
    }
    aPos.needsUpdate = true; aDir.needsUpdate = true;
  });
})();

// ---------- burning breaches: lingering fire + smoke vents pinned to a hull ----------
const BREACHES = [];
for (const [ship, loc] of [[SHIP_B, V3(-9, 9, 26)], [SHIP_B, V3(14, 8.5, -38)], [SHIP_B, V3(-17, 8.5, -62)], [SHIP_A, V3(8, 6, 38)], [SHIP_A, V3(-10, 7, -12)]]) BREACHES.push({ ship, local: loc, until: 1e9, k: .55 });
(() => {
  let acc = 0;
  onFrame((dt, t) => {
    acc += dt; if (acc < .07) return; const step = acc; acc = 0;
    for (let i = BREACHES.length - 1; i >= 0; i--) {
      const b = BREACHES[i]; if (t > b.until) { BREACHES.splice(i, 1); continue; }
      const fade = b.until > 1e8 ? 1 : smooth(0, 4, b.until - t), k = b.k * fade;
      b.ship.root.localToWorld(_c.copy(b.local)); _e.set(0, 1, 0).transformDirection(b.ship.root.matrixWorld);
      if (rnd() < 1.2 * k) FIRE.emit(_c.x + rr2(-1, 1), _c.y, _c.z + rr2(-1, 1), _e.x * rr2(3, 8) + rr2(-1, 1), _e.y * rr2(3, 8), _e.z * rr2(3, 8) + rr2(-1, 1), rr2(.5, 1.1), 2 * k + .8, 5 * k + 2, 1, 1, 1);
      if (rnd() < .6 * k) SMOKE.emit(_c.x, _c.y + 1, _c.z, _e.x * rr2(2, 5), _e.y * rr2(2, 5), _e.z * rr2(2, 5), rr2(4, 8), 2.5 * k + 1, 9 * k + 3, .07, .065, .07);
      if (rnd() < .5 * k) spark(_c, rr2(-12, 12) + _e.x * 18, _e.y * rr2(12, 30), rr2(-12, 12) + _e.z * 18, rr2(.5, 1.2));
    }
  });
})();

// the hero strike — a loyal interceptor rams the dark flagship's hull and detonates
(() => {
  let next = 5;
  FIGHT.hero = 0;
  FIGHT.strike = () => {
    SHIP_B.root.localToWorld(_c.copy(HERO_LOCAL));
    let best = null, bd = 1e9;
    for (const f of BY_SIDE[0]) if (f.state === 1 && f.mode !== 3 && f !== PILOT.fighter) { const d = f.pos.distanceTo(_c); if (d < bd && d > 40) { bd = d; best = f; } }
    if (best) { best.mode = 3; best.speed = Math.max(best.speed, 60); best.modeT = 1e9; }
  };
  onFrame((dt, t) => { if (t > next) { FIGHT.strike(); next = t + rr2(11, 16); } });
})();
