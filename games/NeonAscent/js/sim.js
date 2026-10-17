/* SIM — deterministic fixed-step physics.
   1) ASCENT : 1-D vehicle dynamics along the track (engine power & traction limits, drag, rolling resistance, gravity on the gradient,
               load from path curvature). Banking is derived from the speed this model actually reaches.
   2) FLIGHT : full 6-DOF rigid body — gravity, quadratic drag, four wheel-mounted compressed-air nozzles (thrust differential gives
               roll/pitch torque, a small cant gives yaw), finite air tank (mass & inertia fall as air is spent), PD attitude +
               descent-rate guidance.
   3) GROUND : four spring/damper suspensions, slip-based tyre forces, spinning wheels with inertia, brake / drive torque. */
(function () {
'use strict';
const NA = window.NA, T = NA.track, { clamp, lerp, smooth } = NA.M, V3 = NA.V3;
const G = 9.81, RHO = 1.2;
const P = NA.P = {
  dry: 1400, air0: 260, ve: 1300, Tmax: 7600, tau: .07,
  R: .34, Iw: 1.6, wbHalf: 1.375, trackHalf: .825, nozzleZ: .70, nozzleY: -.27,
  comH: .52, CdA: .62, Crr: .012, power: 520e3, mu: 1.0, vCruise: 24, aLat: 14,
  k: 67000, c: 4300, Lmax: .12, kStop: 420000,
  Ixx: 640, Iyy: 3100, Izz: 2800, m0: 1660,
  tireMu: 1.15, driveTq: 1150, brakeTq: 2300, vDrive: 17, vCap: 12.5,
  kHold: .7, tiltMax: .45, vLand: 7, kvz: 2.5, kpz: .6,
  runDist: 30, stackAt: 38, stackAtManual: 32, jBurst: 1.3, jBurstK: .85, jRoll: 1.9, jRollK: .45,
  manRise: 4.5, manFall: 9, manBoost: 1.4, trackBoost: 2, crashUp: .5, softVy: 9, stackClear: 11
};
const x0 = P.m0 * G / 4 / P.k;                                 // static suspension compression at launch mass
P.yA = -(P.comH - P.R) + (P.Lmax - x0);                         // suspension top mount, body frame
const SX = [1, 1, -1, -1], SZ = [-1, 1, -1, 1];                 // FL FR RL RR  (x forward, y up, z right)

const _f0 = T.newFrame(), _fF = T.newFrame(), _fR = T.newFrame();
const _m4 = new THREE.Matrix4();

// ---------- pure 1-D track dynamics ----------
function trackAccel(s, v, mass, lift = 0) {
  const th = T.theta(s), cth = Math.cos(th), sth = Math.sin(th), kv = T.kv(s), kh = T.kh(s);
  const nLoad0 = Math.max(mass * (G * cth + v * v * kv), mass * G * .15), nLoad = Math.max(nLoad0 - lift, 0);
  const vt = Math.min(P.vCruise, Math.sqrt(P.aLat / Math.max(Math.abs(kh), 1e-4)));
  const drag = .5 * RHO * P.CdA * v * v, roll = P.Crr * nLoad;
  const ff = drag + roll + mass * G * sth;
  const fCmd = ff + mass * 2.2 * (vt - v);
  const fMax = Math.min(P.power / Math.max(v, 4), P.mu * nLoad);
  const F = clamp(fCmd, -P.mu * nLoad * .8, fMax);
  return { a: (F - drag - roll - mass * G * sth) / mass, nLoad, nLoad0, F };
}

// ---------- manual-mode collision model ----------
// body points relative to the centre of mass (x forward, y up, z right)
const BODY_UP = [], BODY_ALL = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  BODY_UP.push([sx * 2.2, .2, sz * .9], [sx * .9, .58, sz * .7], [sx * .5, .3, sz * .95]);
  BODY_ALL.push([sx * 2.25, -.35, sz * .9], [sx * 1.375, -.45, sz * .95], [sx * 2.3, .1, sz * .3]);
}
BODY_ALL.push(...BODY_UP);
// solid blocks of the encore stack in its own frame (x = driving direction); mirrors the props placed in world.js
const STACK_BOXES = [
  { x0: -4.1, x1: 4.5, z0: -3, z1: 3, y0: 0, y1: 3.1 },            // two trucks
  { x0: -2.5, x1: 2.1, z0: -2.8, z1: -.8, y0: 3.1, y1: 5.2 },      // sedan on top
  { x0: -1.5, x1: 2.9, z0: .8, z1: 2.8, y0: 3.1, y1: 5.1 },        // coupe on top
  { x0: 5.4, x1: 10.2, z0: -1.2, z1: 2.4, y0: 0, y1: 1.8 },        // parked SUV
  { x0: -9.9, x1: -5.3, z0: -1.8, z1: .8, y0: 0, y1: 1.5 }         // parked sedan
];
let deckPts = null;
function deckSamples() {
  if (deckPts) return deckPts;
  deckPts = []; const f = T.newFrame();
  for (let s = T.S_RUN + 10; s <= T.S_END; s += .5) { T.frame(s, f); deckPts.push([f.p.x, f.p.y, f.u.x, f.u.y]); }
  return deckPts;
}
const _w = V3();

class Sim {
  constructor(opts = {}) {
    this.manual = !!opts.manual; this.input = [0, 0, 0, 0]; this.man = [0, 0, 0, 0];
    this.crashed = false; this.tCrash = -1; this.banner = null; this.stepN = 0;
    this.t = 0; this.phase = 'GRID'; this.mode = 'STANDBY';
    this.s = 6; this.v = 0; this.air = P.air0;
    this.pos = V3(); this.vel = V3(); this.q = new THREE.Quaternion(); this.w = V3();   // w: body-frame angular velocity
    this.wheelW = [0, 0, 0, 0]; this.wheelA = [0, 0, 0, 0]; this.L = [P.Lmax - x0, P.Lmax - x0, P.Lmax - x0, P.Lmax - x0];
    this.thr = [0, 0, 0, 0]; this.gim = [[0, 0], [0, 0], [0, 0], [0, 0]]; this.cmd = [0, 0, 0, 0];
    this.tLaunch = -1; this.tTouch = -1; this.touched = false; this.armed = false;
    this.nLoad = P.m0 * G; this.gload = 1; this.alt = 0; this.hAGL = 0;
    this.purge = 0; this.brake = 0; this.drive = 0; this.contacts = 0; this.impact = 0; this.slip = 0;
    this.events = {};
    this.ex = V3(); this.ey = V3(); this.ez = V3(); this.dirH = V3(-1, 0, 0); this.posRef = V3();
    this.act = 1; this.state = ''; this.flying = false; this.jump = null; this.cheered = false; this.runStart = V3();
    this.poseTrack();
    this.acc = 0;
  }
  mass() { return P.dry + this.air; }
  go() { if (this.phase === 'GRID') { this.phase = 'ASCENT'; this.mode = 'ASCENT'; this.tGo = this.t; } }

  // ----- pose of the car riding on the track at arc length s -----
  poseTrack(s = this.s, outQ = this.q, outP = this.pos) {
    T.frame(s, _f0); T.frame(s + P.wbHalf, _fF); T.frame(s - P.wbHalf, _fR);
    const fwd = V3().subVectors(_fF.p, _fR.p).normalize();
    const r = V3().crossVectors(fwd, _f0.u).normalize(), up = V3().crossVectors(r, fwd);
    _m4.makeBasis(fwd, up, r); outQ.setFromRotationMatrix(_m4);
    const sq = this.nLoad / 4 / P.k;
    outP.copy(_f0.p).addScaledVector(up, P.comH - (sq - x0));
    return { t: _f0.t.clone() };
  }

  step(dt) {
    this.t += dt;
    this.impact *= Math.exp(-dt * 5);
    if (this.phase === 'ASCENT') this.stepTrack(dt);
    else if (this.phase === 'GRID') { if (this.manual) this.stepGrid(dt); }
    else if (this.phase === 'FLIGHT' || this.phase === 'LANDED') this.stepFree(dt);
    else if (this.phase === 'CRASHED') {
      this.stepWreck(dt);
      if (this.t - this.tCrash > 8 && !this.events.doneSent) { this.events.doneSent = true; this.events.done = true; }
    }
  }

  stepTrack(dt) {
    const m = this.mass(), thrust = this.manual ? this.trackJets(dt) : 0, r = trackAccel(this.s, this.v, m, thrust * P.trackBoost);
    this.v = Math.max(0, this.v + r.a * dt); this.s += this.v * dt; this.nLoad = r.nLoad;
    for (let i = 0; i < 4; i++) { this.wheelW[i] = this.v / P.R; this.wheelA[i] += this.v / P.R * dt; this.L[i] = P.Lmax - r.nLoad / 4 / P.k; }
    const tg = this.poseTrack();
    this.vel.copy(tg.t).multiplyScalar(this.v);
    this.gload = r.nLoad / (m * G);
    this.alt = this.pos.y - P.comH;
    // the jets peel the car off the track once they carry most of its weight (or 40 % of the extra load on the curve)
    const peel = thrust > 0 && thrust >= Math.max(.9 * m * G, .4 * r.nLoad0) && this.t - this.tGo > .3;
    if (this.s >= T.S_END - P.wbHalf || peel) this.launch(m);
  }

  // manual jets while still driving on the track: they unload the tyres (see trackBoost) and may peel the car off
  trackJets(dt) {
    this.manualControl(dt);
    const a1 = 1 - Math.exp(-dt / P.tau);
    let sum = 0, mdot = 0;
    for (let i = 0; i < 4; i++) { this.thr[i] += (this.cmd[i] - this.thr[i]) * a1; sum += this.thr[i]; mdot += this.thr[i] / P.ve; }
    this.air = Math.max(0, this.air - mdot * dt);
    return sum;
  }

  // on the grid the jets can already hop the car off the line
  stepGrid(dt) {
    const m = this.mass(), thrust = this.trackJets(dt);
    if (thrust >= .9 * m * G) this.launch(m);
  }

  launch(m) {
    const d = Math.max(this.v * .02, .05);
    const q1 = new THREE.Quaternion(), p1 = V3();
    this.poseTrack(this.s - d, q1, p1);
    const tg = this.poseTrack();
    const dq = this.q.clone().multiply(q1.clone().invert());
    if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
    const ang = 2 * Math.acos(clamp(dq.w, -1, 1)), sn = Math.sqrt(Math.max(1 - dq.w * dq.w, 1e-12));
    const wW = V3(dq.x / sn, dq.y / sn, dq.z / sn).multiplyScalar(ang / (d / this.v));
    this.w.copy(wW).applyQuaternion(this.q.clone().invert());
    if (!isFinite(this.w.x + this.w.y + this.w.z)) this.w.set(0, 0, 0);
    this.vel.copy(tg.t).multiplyScalar(this.v);
    this.dirH = V3(this.vel.x, 0, this.vel.z).normalize();
    this.phase = 'FLIGHT'; this.mode = 'LAUNCH'; this.tLaunch = this.t; this.flying = true; this.events.launched = true;
  }

  // ----- encore: after the first landing the car drives off again and air-jumps a stack of vehicles with a full roll -----
  startAct2() {
    this.act = 2; this.state = 'RUN'; this.touched = false; this.flying = false; this.purge = 0; this.brake = 0; this.drive = 1;
    this.dirH.set(this.ex.x, 0, this.ex.z).normalize();
    this.posRef.copy(this.pos).setY(0); this.runStart.copy(this.pos);
    this.mode = 'ENCORE · RUN-UP';
    if (this.manual) { this.air = P.air0; this.banner = null; }
    const at = this.manual ? P.stackAtManual : P.stackAt;           // closer stack in manual mode: the car cannot slow its run-up in the air
    this.stackC = V3(this.pos.x + this.dirH.x * (P.runDist + at), 0, this.pos.z + this.dirH.z * (P.runDist + at));
    this.events.stack = { x: this.stackC.x, z: this.stackC.z, dir: this.dirH.clone() };
  }
  beginJump() {
    this.state = 'JUMP'; this.drive = 0; this.flying = true; this.touched = false; this.tLaunch = this.t; this.phase = 'FLIGHT';
    this.jump = this.manual ? null : { t0: this.t, tBurst: P.jBurst, tRoll0: P.jBurst + .12, tRoll: P.jRoll };
    this.mode = this.manual ? 'MANUAL · AIR JUMP' : 'ENCORE · AIR JUMP'; this.events.jump = true;
  }

  // ----- manual flight: the four keys drive the four nozzles directly (throttle slews up/down) -----
  manualControl(dt) {
    const live = this.air > 0;
    const up = P.manRise * dt, dn = P.manFall * dt;
    for (let i = 0; i < 4; i++) {
      const tgt = live ? this.input[i] : 0, d = tgt - this.man[i];
      this.man[i] += d > 0 ? Math.min(d, up) : Math.max(d, -dn);
      this.cmd[i] = this.man[i] * P.Tmax * P.manBoost;
    }
    if (this.phase === 'FLIGHT' && this.state !== 'RUN') this.mode = this.air > 0 ? (this.act === 2 ? 'MANUAL · AIR JUMP' : 'MANUAL FLIGHT') : 'TANK EMPTY';
  }

  crash(why) {
    if (this.crashed) return;
    this.crashed = true; this.phase = 'CRASHED'; this.mode = 'CRASHED'; this.tCrash = this.t; this.flying = false;
    this.banner = ['CRASH', why]; this.events.crash = { pos: this.pos.clone(), vel: this.vel.clone() };
    this.impact = 1; this.purge = 0; this.brake = 0; this.drive = 0;
    for (let i = 0; i < 4; i++) { this.thr[i] = this.cmd[i] = this.man[i] = 0; }
    this.vel.multiplyScalar(.5); this.ww = this.w.clone().applyQuaternion(this.q).multiplyScalar(.6); this.w.set(0, 0, 0);
  }

  // the wreck tumbles and settles under gravity (no engines, no obstacles — it just lies where it falls)
  stepWreck(dt) {
    const q = this.q, ww = this.ww, n = V3(0, 1, 0), rel = V3(), vp = V3(), r = V3();
    this.vel.y -= G * dt;
    this.pos.addScaledVector(this.vel, dt);
    const wl = ww.length();
    if (wl > 1e-6) { const half = wl * dt / 2, s = Math.sin(half) / wl; q.premultiply(new THREE.Quaternion(ww.x * s, ww.y * s, ww.z * s, Math.cos(half))).normalize(); }
    const I = 2600, m = this.mass();
    for (const b of BODY_ALL) {
      rel.set(b[0], b[1], b[2]).applyQuaternion(q);
      if (this.pos.y + rel.y > 0) continue;
      this.pos.y -= this.pos.y + rel.y;
      vp.crossVectors(ww, rel).add(this.vel);
      if (vp.y >= 0) continue;
      r.crossVectors(rel, n);
      const j = -(1.25) * vp.y / (1 / m + r.lengthSq() / I);
      this.vel.y += j / m;
      ww.addScaledVector(r, j / I);
      const f = Math.exp(-9 * dt); this.vel.x *= f; this.vel.z *= f;      // scraping friction
    }
    this.ww.multiplyScalar(Math.exp(-1.2 * dt));
    this.alt = Math.max(this.pos.y, 0);
  }

  // local frame of the encore stack: x along the driving direction
  stackLocal(p, out) {
    const dx = p.x - this.stackC.x, dz = p.z - this.stackC.z;
    return out.set(dx * this.dirH.x + dz * this.dirH.z, p.y, -dx * this.dirH.z + dz * this.dirH.x);
  }

  // first solid thing the car's body touches, as a human-readable reason
  bodyHit() {
    const ex = this.ex, ey = this.ey, ez = this.ez, p = this.pos, tw = T.tower, gt = T.gantry;
    const checkDeck = this.t - this.tLaunch > 1;
    const stackOn = this.act === 2 && this.stackC && this.state !== 'RUN';
    const deck = checkDeck ? deckSamples() : null, loc = V3();
    for (let k = 0; k < BODY_ALL.length; k++) {
      const b = BODY_ALL[k];
      _w.set(p.x + ex.x * b[0] + ey.x * b[1] + ez.x * b[2], p.y + ex.y * b[0] + ey.y * b[1] + ez.y * b[2], p.z + ex.z * b[0] + ey.z * b[1] + ez.z * b[2]);
      if (k >= BODY_ALL.length - BODY_UP.length && _w.y < .06) return 'Body hit the ground';
      if (_w.x > tw.x0 && _w.x < tw.x1 && Math.abs(_w.z) < tw.z && _w.y < tw.h) return 'Hit the steel tower';
      if (Math.abs(_w.x - gt.x) < .7) {
        if (_w.y > gt.beamY0 && _w.y < gt.beamY1 && Math.abs(_w.z) < gt.z + .8) return 'Hit the start gantry';
        if (_w.y < gt.beamY0 && Math.abs(Math.abs(_w.z) - gt.z) < .7) return 'Hit the start gantry';
      }
      if (deck && Math.abs(_w.z) < T.WIDTH + .3) {
        let bd = 1e9, bn = 0;
        for (let j = 0; j < deck.length; j++) {
          const d = deck[j], dx = _w.x - d[0], dy = _w.y - d[1], d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; bn = dx * d[2] + dy * d[3]; }
        }
        if (bd < 2.5 && bn > -.45 && bn < .03) return 'Hit the ramp deck';
      }
      if (stackOn) {
        this.stackLocal(_w, loc);
        for (const s of STACK_BOXES) if (loc.x > s.x0 && loc.x < s.x1 && loc.z > s.z0 && loc.z < s.z1 && loc.y > s.y0 && loc.y < s.y1) return 'Crashed into the vehicle stack';
      }
    }
    return null;
  }

  // judged at the first tyre contact after a flight: only landing on the side or the roof is fatal; hard impacts are forgiven
  landingFault() {
    const vy = -Math.min(this.vel.y, 0), tilt = Math.acos(clamp(this.ey.y, -1, 1)) * 57.3;
    if (this.ey.y < P.crashUp) return 'Landed on its ' + (this.ey.y < -.5 ? 'roof' : 'side') + ' · ' + tilt.toFixed(0) + '° tilt';
    if (vy > P.softVy) this.vel.y = -P.softVy;                // crumple zone soaks up the rest
    const rough = vy > P.softVy ? 'rough touchdown · ' : 'touchdown ', info = rough + vy.toFixed(1) + ' m/s · ' + tilt.toFixed(0) + '° tilt';
    if (this.act === 2) this.banner = this.stackLocal(this.pos, V3()).x < P.stackClear ? ['LANDED SHORT', 'the stack is still standing · ' + info] : ['ENCORE CLEARED', info];
    else this.banner = ['SAFE LANDING', info];
    return null;
  }

  // ----- attitude + descent controller → per-nozzle thrust -----
  control(dt, m, I) {
    const q = this.q, up = this.ey, T4 = this.cmd;
    const tf = this.t - this.tLaunch;
    const armedNow = tf > .12;
    if (armedNow && !this.armed) { this.armed = true; this.events.ignite = true; this.mode = 'AIR-JET STABILIZING'; }
    for (let i = 0; i < 4; i++) { T4[i] = 0; this.gim[i][0] = 0; this.gim[i][1] = 0; }
    if (this.manual) { this.manualControl(dt); return; }
    if (!this.armed) return;
    const J = this.jump, jt = J ? this.t - J.t0 : 0;
    if (J && jt > J.tRoll0 + J.tRoll + .35) { this.jump = null; this.mode = 'AIR-JET STABILIZING'; }
    const jumping = !!this.jump;
    // target: level (tilted a little to bleed horizontal speed / cancel sideways drift), heading along the horizontal velocity
    let fx = jumping ? this.dirH.x : this.vel.x, fz = jumping ? this.dirH.z : this.vel.z, hs = Math.hypot(fx, fz);
    if (hs < 3) { fx = this.ex.x; fz = this.ex.z; hs = Math.hypot(fx, fz) || 1; }
    fx /= hs; fz /= hs;
    const hAbove = Math.max(this.hAGL, 0), tiltOn = smooth(.55, .9, up.y) * (this.touched || jumping ? 0 : 1);
    const gX = smooth(3, 7, hAbove), gV = smooth(.6, 2.2, hAbove), gP = smooth(4, 9, hAbove);
    const side = V3(-this.dirH.z, 0, this.dirH.x);
    const along = this.vel.x * this.dirH.x + this.vel.z * this.dirH.z, lat = this.vel.x * side.x + this.vel.z * side.z;
    const latPos = (this.pos.x - this.posRef.x) * side.x + (this.pos.z - this.posRef.z) * side.z;
    const ah = V3().addScaledVector(this.dirH, -P.kHold * (along - P.vLand) * gX).addScaledVector(side, -P.kvz * lat * gV - P.kpz * latPos * gP);
    const al = ah.length(); if (al > P.tiltMax * G) ah.multiplyScalar(P.tiltMax * G / al);
    const ut = V3(ah.x * tiltOn / G, 1, ah.z * tiltOn / G).normalize();
    const xt = V3(fx, 0, fz); xt.addScaledVector(ut, -xt.dot(ut)).normalize();
    let rollRate = 0;
    if (jumping) {                                                // full 360° roll about the heading axis, eased in and out
      const s = clamp((jt - J.tRoll0) / J.tRoll, 0, 1), phi = 2 * Math.PI * s * s * (3 - 2 * s);
      rollRate = 12 * Math.PI * s * (1 - s) / J.tRoll;
      ut.set(0, 1, 0).multiplyScalar(Math.cos(phi)).addScaledVector(V3().crossVectors(xt, V3(0, 1, 0)), Math.sin(phi));
    }
    const qt = new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(xt, ut, V3().crossVectors(xt, ut)));
    const qe = qt.multiply(q.clone().invert());
    if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
    const sn = Math.hypot(qe.x, qe.y, qe.z), ang = 2 * Math.atan2(sn, qe.w);
    if (!this.touched && this.mode === 'AIR-JET STABILIZING' && ang < .12 && this.vel.y < -2) this.mode = 'CONTROLLED DESCENT';
    const ew = sn > 1e-6 ? V3(qe.x / sn * ang, qe.y / sn * ang, qe.z / sn * ang) : V3();
    const eb = ew.applyQuaternion(q.clone().invert());
    const wd = V3(eb.x * 1.35, eb.y * 1.0, eb.z * 1.35);
    const flipK = 1 - smooth(.2, .8, up.y);                       // 1 while inverted / on its side: roll over quickly
    const wlim = jumping ? 8 : lerp(1.7, 3.4, flipK);
    if (rollRate) wd.add(V3().copy(xt).multiplyScalar(rollRate).applyQuaternion(q.clone().invert()));
    const wl = wd.length(); if (wl > wlim) wd.multiplyScalar(wlim / wl);
    const kw = 5.5;
    const tx = I.x * kw * (wd.x - this.w.x), ty = I.y * kw * (wd.y - this.w.y), tz = I.z * kw * (wd.z - this.w.z);
    // collective: descent-rate guidance  v_des(h) = -(0.9 + 1.55 sqrt(h)), capped; only once the thrust axis points upwards
    const h = Math.max(this.hAGL, 0), vDes = -Math.min(P.vCap, .9 + 1.55 * Math.sqrt(Math.max(h - .3, 0)));
    let Tc = m * G * (1 + 1.6 * (vDes - this.vel.y) / G) / Math.max(up.y, .55) * smooth(.1, .7, up.y);
    if (!isFinite(Tc) || Tc < 0) Tc = 0;
    const minB = P.Tmax * (.05 + .25 * smooth(.05, .55, ang));
    let base = clamp(Tc / 4, minB, P.Tmax);
    if (jumping) base = jt < J.tBurst ? P.Tmax * P.jBurstK * smooth(0, .12, jt) : P.Tmax * P.jRollK;   // lift-off burst, then just enough air to spin
    if (this.touched) base *= 1 - smooth(0, .45, this.t - this.tTouch);
    // differential allocation (pitch lever = wheelbase/2, roll lever = nozzle offset) with saturation-aware scaling
    const lx = P.wbHalf, lz = P.nozzleZ;
    const d = [0, 0, 0, 0]; let sc = 1;
    for (let i = 0; i < 4; i++) {
      d[i] = SX[i] * tz / (4 * lx) - SZ[i] * tx / (4 * lz);
      if (d[i] > 1e-6) sc = Math.min(sc, (P.Tmax - base) / d[i]); else if (d[i] < -1e-6) sc = Math.min(sc, base / -d[i]);
    }
    sc = Math.max(sc, 0);
    const alive = this.air > 0 ? 1 : 0;
    for (let i = 0; i < 4; i++) T4[i] = clamp(base + d[i] * sc, 0, P.Tmax) * alive;
    // yaw: small nozzle cant, front/rear opposite so no net sideways force
    const gy = ty / (4 * lx);
    for (let i = 0; i < 4; i++) { const g = clamp(-SX[i] * gy, -.2 * T4[i], .2 * T4[i]); this.gim[i][1] = g; }
  }

  stepFree(dt) {
    const q = this.q, m = this.mass(), sc = m / P.m0;
    const I = { x: P.Ixx * sc, y: P.Iyy * sc, z: P.Izz * sc };
    this.ex.set(1, 0, 0).applyQuaternion(q); this.ey.set(0, 1, 0).applyQuaternion(q); this.ez.set(0, 0, 1).applyQuaternion(q);
    const ex = this.ex, ey = this.ey, ez = this.ez;
    // lowest wheel clearance for the guidance
    let hmin = 1e9;
    for (let i = 0; i < 4; i++) {
      const ay = this.pos.y + ex.y * SX[i] * P.wbHalf + ey.y * P.yA + ez.y * SZ[i] * P.trackHalf;
      hmin = Math.min(hmin, ay - P.Lmax * ey.y - P.R);
    }
    this.hAGL = hmin; this.alt = Math.max(hmin, 0);
    if (this.state === 'RUN' && !this.manual) { for (let i = 0; i < 4; i++) { this.cmd[i] = 0; this.gim[i][0] = this.gim[i][1] = 0; } }
    else this.control(dt, m, I);
    // thruster lag + air consumption
    let mdot = 0, Fw = V3(0, -m * G, 0);
    const tauB = V3(), fb = V3(), rb = V3();
    const a1 = 1 - Math.exp(-dt / P.tau);
    for (let i = 0; i < 4; i++) {
      this.thr[i] += (this.cmd[i] - this.thr[i]) * a1;
      const Ti = this.thr[i];
      mdot += Ti / P.ve;
      fb.set(this.gim[i][0], Ti, this.gim[i][1]);
      Fw.addScaledVector(ex, fb.x).addScaledVector(ey, fb.y).addScaledVector(ez, fb.z);
      rb.set(SX[i] * P.wbHalf, P.nozzleY, SZ[i] * P.nozzleZ);
      tauB.add(rb.cross(fb));
    }
    this.air = Math.max(0, this.air - mdot * dt);
    // aerodynamic drag
    const sp = this.vel.length();
    Fw.addScaledVector(this.vel, -.5 * RHO * P.CdA * sp);
    // wheel contacts
    const tauW = V3(), Ac = V3(), vA = V3(), rel = V3(), Pp = V3(), vp = V3(), fw = V3(), rw = V3(), Ff = V3();
    const wW = this.w.clone().applyQuaternion(q);
    let contacts = 0, avgS = 0;
    for (let i = 0; i < 4; i++) {
      const lx = SX[i] * P.wbHalf, lz = SZ[i] * P.trackHalf;
      rel.set(0, 0, 0).addScaledVector(ex, lx).addScaledVector(ey, P.yA).addScaledVector(ez, lz);   // mount point relative to COM
      Ac.copy(this.pos).add(rel);
      const upY = Math.max(ey.y, .05);
      const Lc = (Ac.y - P.R) / upY;
      if (Lc < P.Lmax) {
        contacts++;
        const x = P.Lmax - Lc, Lc0 = Math.max(Lc, 0);
        vA.crossVectors(wW, rel).add(this.vel);
        const xd = -vA.y / upY;
        let Fn = P.k * x + P.c * xd * (xd > 0 ? 1 : .6);
        if (x > P.Lmax) Fn += P.kStop * (x - P.Lmax);
        Fn = Math.max(Fn, 0);
        Ff.copy(ey).multiplyScalar(Fn); Fw.add(Ff);
        tauW.add(V3().crossVectors(rel, Ff));
        this.L[i] = Lc0;
        // tyre patch
        Pp.set(Ac.x - ey.x * Lc0, 0, Ac.z - ey.z * Lc0);
        const rp = V3().subVectors(Pp, this.pos);
        vp.crossVectors(wW, rp).add(this.vel);
        let hx = ex.x, hz = ex.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
        const vlong = vp.x * hx + vp.z * hz, vlat = -vp.x * hz + vp.z * hx;
        const N = Fn * upY, fmax = P.tireMu * N;
        const Flat = -fmax * Math.tanh(vlat / .35);
        let slip = this.wheelW[i] * P.R - vlong;
        let Fl = fmax * Math.tanh(slip / .8);
        const sync = Math.abs(slip) * P.Iw / (P.R * P.R * dt);
        if (Math.abs(Fl) > sync) Fl = Math.sign(Fl) * sync;
        avgS += Math.abs(slip);
        // wheel torque: drive/brake and tyre reaction
        let tq = -Fl * P.R + this.drive * P.driveTq * (this.wheelW[i] * P.R < P.vDrive ? 1 : 0);
        let w1 = this.wheelW[i] + tq / P.Iw * dt;
        if (this.brake > 0) { const dw = this.brake * P.brakeTq / P.Iw * dt; w1 = Math.abs(w1) <= dw ? 0 : w1 - Math.sign(w1) * dw; }
        this.wheelW[i] = w1;
        // lateral & longitudinal tyre force (patch) + rolling resistance
        const Fx = Fl * hx - Flat * hz + 0, Fz = Fl * hz + Flat * hx;
        const rr = P.Crr * N * Math.tanh(vlong / .5);
        Ff.set(Fx - rr * hx, 0, Fz - rr * hz);
        Fw.add(Ff);
        tauW.add(V3().crossVectors(rp, Ff));
        if (this.flying && !this.touched && this.t - this.tLaunch > 1 && Fn > 50) {
          if (this.manual) { const why = this.landingFault(); if (why) { this.crash(why); return; } }
          this.touched = true; this.flying = false; this.tTouch = this.t; this.phase = 'LANDED'; this.mode = 'TOUCHDOWN'; this.events.touchdown = true;
          this.impact = Math.min(1, Math.abs(Math.min(this.vel.y, 0)) / 4);
        }
      } else {
        this.L[i] = P.Lmax;
        this.wheelW[i] *= Math.exp(-.02 * dt);            // spinning wheels coast in the air
      }
      this.wheelA[i] += this.wheelW[i] * dt;
    }
    this.contacts = contacts; this.slip = contacts ? avgS / contacts : 0;
    // manual: firing the jets after touchdown (or during the run-up) can lift the car off again — that starts a fresh flight
    if (this.manual && !this.crashed && contacts === 0 && (this.touched || this.state === 'RUN') && this.thr[0] + this.thr[1] + this.thr[2] + this.thr[3] > .2 * P.Tmax) {
      this.airT = (this.airT || 0) + dt;
      if (this.airT > .15) {
        this.airT = 0;
        if (this.state === 'RUN') this.beginJump();
        else { this.touched = false; this.flying = true; this.tLaunch = this.t; this.phase = 'FLIGHT'; this.purge = 0; this.brake = 0; this.banner = null; }
      }
    } else this.airT = 0;
    // post-touchdown sequencing
    if (this.touched) {
      const tt = this.t - this.tTouch, hs = Math.hypot(this.vel.x, this.vel.z);
      this.purge = tt < .15 ? tt / .15 : (tt < 3.6 ? 1 : Math.max(0, 1 - (tt - 3.6) / 1.2));
      this.brake = tt > .25 ? (hs > 9 && !this.manual ? .55 : 1) : 0;     // brake to a standstill and stay put
      this.drive = 0;
      if (tt > 1.4 && this.mode === 'TOUCHDOWN') this.mode = 'AIR PURGE';
      if (tt > 3.0) this.mode = this.act === 1 ? 'LANDED' : 'ENCORE COMPLETE';
      if (this.act === 1) { if (tt > 4.9) this.startAct2(); }
      else {
        if (tt > .9 && !this.cheered) { this.cheered = true; this.events.cheer = true; }
        if (tt > 12 && this.phase !== 'DONE') { this.phase = 'DONE'; this.events.done = true; }
      }
    } else if (this.state === 'RUN') {
      this.drive = 1; this.brake = 0;
      const dist = (this.pos.x - this.runStart.x) * this.dirH.x + (this.pos.z - this.runStart.z) * this.dirH.z;
      if (dist >= P.runDist) this.beginJump();
    }
    // integrate
    const accel = V3().copy(Fw).multiplyScalar(1 / m);
    this.gload = Math.hypot(accel.x, accel.y + G, accel.z) / G;
    this.vel.addScaledVector(accel, dt); this.pos.addScaledVector(this.vel, dt);
    const tb = tauW.applyQuaternion(q.clone().invert()).add(tauB);
    const w = this.w;
    const gx = (tb.x - (I.z - I.y) * w.y * w.z) / I.x, gy = (tb.y - (I.x - I.z) * w.z * w.x) / I.y, gz = (tb.z - (I.y - I.x) * w.x * w.y) / I.z;
    w.x += gx * dt; w.y += gy * dt; w.z += gz * dt;
    const wl = w.length();
    if (wl > 1e-9) { const half = wl * dt / 2, s = Math.sin(half) / wl; q.multiply(new THREE.Quaternion(w.x * s, w.y * s, w.z * s, Math.cos(half))).normalize(); }
    if (this.manual && !this.crashed && (++this.stepN & 3) === 0) {
      this.ex.set(1, 0, 0).applyQuaternion(q); this.ey.set(0, 1, 0).applyQuaternion(q); this.ez.set(0, 0, 1).applyQuaternion(q);
      const why = this.bodyHit(); if (why) this.crash(why);
    }
  }

  advance(dt) {                                               // fixed-step accumulator
    const H = 1 / 480;
    this.acc += dt;
    let n = 0;
    while (this.acc >= H && n < 400) { this.step(H); this.acc -= H; n++; }
    if (n >= 400) this.acc = 0;
  }
}
NA.Sim = Sim;

// ---------- headless rehearsal: landing point, flight time, tank margin (same code as the live run) ----------
NA.rehearse = function () {
  const sim = new Sim(); sim.go();
  const trace = []; let tNext = 0, maxAlt = 0, vLaunch = 0, tl = 0;
  while (sim.t < 90 && sim.phase !== 'DONE') {
    sim.step(1 / 480);
    if (sim.t >= tNext) { trace.push({ t: sim.t, p: sim.pos.clone(), phase: sim.phase, v: sim.vel.clone() }); tNext += .1; }
    if (NA.rehearsal) break;
    maxAlt = Math.max(maxAlt, sim.pos.y);
    if (sim.events.launched && !vLaunch) { vLaunch = sim.vel.length(); tl = sim.t; }
    if (sim.touched && sim.t - sim.tTouch > 2.5 && !NA.rehearsal) {
      NA.rehearsal = {
        land: sim.pos.clone(), landVel: sim.vel.clone(), tTouch: sim.tTouch, tLaunch: sim.tLaunch, tFlight: sim.tTouch - sim.tLaunch, airLeft: sim.air / P.air0,
        heading: Math.atan2(sim.vel.z, sim.vel.x), vLaunch, maxAlt, launchPos: null
      };
    }
  }
  const lp = trace.find(r => r.phase === 'FLIGHT'); if (NA.rehearsal) NA.rehearsal.launchPos = lp ? lp.p.clone() : null;
  NA.rehearsal = NA.rehearsal || { land: sim.pos.clone(), heading: 0, airLeft: sim.air / P.air0, tFlight: 0 };
  NA.rehearsal.trace = trace; NA.rehearsal.tEnd = sim.t;
  return NA.rehearsal;
};
})();
