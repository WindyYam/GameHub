// js/core/camera.js — part of subsystem "film". OWNER: film engineer.
// The camera path as a pure function of film time. No three.js, no DOM, no ground model: everything here is
// derived from the shot table alone, so the path is the same in the browser, in node (filmcheck.mjs) and with
// any ground implementation.
//
// Geometry (world.json shots.pathSpline, checked by tools/validate_world.py):
//   hold        the STRAIGHT segment between the keyframes of a shot, flown at constant velocity
//   transition  ONE centripetal Catmull-Rom curve (alpha 0.5) through
//               [last keyframe of the previous shot, transitionWaypoints..., first keyframe of the shot],
//               outer tangent neighbours = the previous shot's second-to-last keyframe and the shot's second keyframe
// Timing (what this file adds to the stub):
//   - holds run at constant speed, so the eye-level and boat shots move at exactly the designed 3.8 / 3.4 / 3.8 m/s;
//   - a transition leaves with the velocity of the hold it comes from and arrives with the velocity of the hold it
//     enters (speed AND direction), so position is C1 through every boundary and nothing ever stands still;
//   - along the curve the speed follows the height of the camera ("fast when high, slow near the ground"): the
//     arc length s(t) solves  ds/dt = v0 + (v1 - v0) E(u) + A w(u) (height above the floor + h0)^p  with the one
//     constant A chosen so that the curve is flown in exactly the transition time. Waypoints are passed by arc
//     length, not at evenly spaced times, so there is no speed step at a waypoint;
//   - the view direction is interpolated as azimuth / elevation (never as a target point, which whips round when
//     the camera passes its target): both holds are extrapolated at their own angular rate and cross-faded with
//     a C2 blend, so angular velocity is continuous too; the horizon stays level (up = +y, no roll);
//   - field of view and look distance are blended the same way.
import * as M from './mathx.js';

// ---- small vector helpers (arrays of 3) ------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** A hold whose look target travels more than this share of the look distance is a pan (constant turn rate), else an orbit (target lock). */
export const PAN_SHARE = 0.1;

/** smootherstep: C2 ease, zero first and second derivative at both ends. */
export const ease5 = (u) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * u * (u * (u * 6 - 15) + 10); };
/**
 * C2 "soft trapezoid" blend 0..1 on u in [0, 1]: the rate ramps up over the first `r` of the interval, stays
 * constant, ramps down over the last `r`. Peak rate = 1 / (1 - r) times the mean (a smootherstep has 1.875).
 */
export function trapezoid(u, r = 0.3) {
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const I = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; const x2 = x * x; return x2 * x2 * (x2 - 3 * x + 2.5); };   // integral of smootherstep
  let a;
  if (u < r) a = r * I(u / r);
  else if (u <= 1 - r) a = r * 0.5 + (u - r);
  else a = r * 0.5 + (1 - 2 * r) + r * (0.5 - I((1 - u) / r));
  return a / (1 - r);
}
/** View direction -> [azimuth (model, degrees, 0 = -z, clockwise), elevation (degrees)]. */
export function azEl(dir) { return [Math.atan2(dir[0], -dir[2]) * M.RAD, Math.atan2(dir[1], Math.hypot(dir[0], dir[2])) * M.RAD]; }
/** [azimuth, elevation] in degrees -> unit view direction. */
export function dirOf(az, el) { const a = az * M.DEG, e = el * M.DEG, c = Math.cos(e); return [Math.sin(a) * c, Math.sin(e), -Math.cos(a) * c]; }

/** One span of a centripetal Catmull-Rom curve (the Barry-Goldman form the validator uses): p1 at t = 0, p2 at t = 1. */
export function crSpan(p0, p1, p2, p3, t, alpha = 0.5) {
  const d = (a, b) => Math.pow(Math.max(len(sub(a, b)), 1e-6), alpha);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), tt = t1 + (t2 - t1) * t;
  const mx = (a, b, ta, tb) => { const ka = (tb - tt) / (tb - ta), kb = (tt - ta) / (tb - ta); return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]; };
  const a1 = mx(p0, p1, t0, t1), a2 = mx(p1, p2, t1, t2), a3 = mx(p2, p3, t2, t3);
  return mx(mx(a1, a2, t0, t2), mx(a2, a3, t1, t3), t1, t2);
}

/**
 * The transition curve of a chain [before, from, ...waypoints, to, after], parametrised by arc length.
 * Returns { length, at(s) -> [x, y, z], tangent(s) -> unit vector, waypointS: arc length at each chain point from..to }.
 */
export function chainCurve(chain, samplesPerSpan = 256) {
  const spans = chain.length - 3, n = samplesPerSpan;
  const point = (k, t) => crSpan(chain[k], chain[k + 1], chain[k + 2], chain[k + 3], t);
  // cumulative length S and parametric speed D = |dC/dt| at sample j (span = floor(j / n), t = (j % n) / n);
  // each cell is integrated with Simpson's rule on the speed, so S is accurate to well under a millimetre
  const last = spans * n, S = new Float64Array(last + 1), D = new Float64Array(last + 1);
  const speed = (k, t) => { const h = 1e-5, a = point(k, Math.max(0, t - h)), b = point(k, Math.min(1, t + h)); return len(sub(b, a)) / (Math.min(1, t + h) - Math.max(0, t - h)); };
  const waypointS = [0];
  let acc = 0;
  for (let k = 0; k < spans; k++) {
    let d0 = speed(k, 0); D[k * n] = d0;
    for (let j = 1; j <= n; j++) {
      const dm = speed(k, (j - 0.5) / n), d1 = speed(k, j / n);
      acc += (d0 + 4 * dm + d1) / (6 * n); d0 = d1;
      S[k * n + j] = acc; D[k * n + j] = d1;
    }
    waypointS.push(acc);
  }
  const length = acc;
  /** curve parameter [span index, t] for an arc length: the cubic Hermite of S(t) in the cell, inverted by Newton steps */
  function param(s) {
    if (s <= 0) return [0, 0];
    if (s >= length) return [spans - 1, 1];
    let lo = 0, hi = last;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
    const s0 = S[lo], s1 = S[hi], m0 = D[lo] / n, m1 = D[hi] / n;
    let x = (s - s0) / Math.max(1e-12, s1 - s0);
    for (let it = 0; it < 4; it++) {
      const x2 = x * x, x3 = x2 * x;
      const f = (2 * x3 - 3 * x2 + 1) * s0 + (x3 - 2 * x2 + x) * m0 + (-2 * x3 + 3 * x2) * s1 + (x3 - x2) * m1 - s;
      const df = (6 * x2 - 6 * x) * s0 + (3 * x2 - 4 * x + 1) * m0 + (-6 * x2 + 6 * x) * s1 + (3 * x2 - 2 * x) * m1;
      if (!(df > 1e-12)) break;
      x = Math.min(1, Math.max(0, x - f / df));
    }
    const j = lo + x, k = Math.min(spans - 1, Math.floor(lo / n));
    return [k, j / n - k];
  }
  function at(s) { const [k, t] = param(s); return point(k, t); }
  function tangent(s) {
    const [k, t] = param(s), h = 1e-5;
    const a = point(k, Math.max(0, t - h)), b = point(k, Math.min(1, t + h));
    return unit(sub(b, a));
  }
  return { length, at, tangent, waypointS, spans };
}

/**
 * Build the camera path.
 *   shots: [{ index, id, tIn, tHold, t1, keyframes: [{ time (absolute film time), pos, look, fov }], waypoints, floor,
 *             tune: { p, h0, rampIn, rampOut, turn, lookFrom, lookTo, lookRamp, blendIn, blendOut } }]
 *          tIn = start of the transition into the shot (= t1 of the previous shot), tHold = start of the hold,
 *          t1 = end of the hold. `floor` = datum level of what the camera stands on or flies over at that shot.
 * Returns { stateAt(t) -> { pos, look, fov, az, el, inTransition, progress }, transitions: [...], holds: [...] }.
 */
export function buildPath(shots) {
  // ---- holds: straight segments at constant velocity, extrapolated linearly beyond both ends --------------
  const holds = shots.map((s) => {
    const ks = s.keyframes;
    const seg = (t) => { let i = 0; while (i < ks.length - 2 && t >= ks[i + 1].time) i++; return i; };
    // The view between two keyframes. Where both look at (nearly) the same point the camera stays locked on the
    // target that drifts between them (an orbit). Where the look target travels far (a pan: more than PAN_SHARE of
    // the look distance) the view turns at a CONSTANT rate from one keyframe view to the other: a target point
    // moving at constant speed turns the camera fast while it is near and slowly once it is far (shot 4: 20.7
    // degrees per second at the start of the hold, 3.0 at its end, which read as a flight that never arrives).
    const kv = ks.map((k) => { const d = sub(k.look, k.pos), [az, el] = azEl(d); return { az, el, logDist: Math.log(Math.max(1e-6, len(d))) }; });
    const pan = ks.slice(0, -1).map((a, i) => len(sub(ks[i + 1].look, a.look)) > PAN_SHARE * 0.5 * (Math.exp(kv[i].logDist) + Math.exp(kv[i + 1].logDist)));
    function at(t) {
      const i = seg(t), a = ks[i], b = ks[i + 1], k = (t - a.time) / Math.max(1e-9, b.time - a.time);
      const pos = mix3(a.pos, b.pos, k), fov = M.lerp(a.fov, b.fov, M.clamp(k));
      if (!pan[i]) return { pos, look: mix3(a.look, b.look, k), fov };
      const va = kv[i], vb = kv[i + 1];
      const az = va.az + M.angleDiffDeg(va.az, vb.az) * k, el = va.el + (vb.el - va.el) * k;
      return { pos, look: add(pos, mul(dirOf(az, el), Math.exp(va.logDist + (vb.logDist - va.logDist) * k))), fov };
    }
    const vel = (i) => { const a = ks[i], b = ks[i + 1]; return mul(sub(b.pos, a.pos), 1 / Math.max(1e-9, b.time - a.time)); };
    /** view angles and their rates at time t (rates by central difference of the analytic motion) */
    function view(t) {
      const h = 1e-3, p = at(t), p0 = at(t - h), p1 = at(t + h);
      const [az, el] = azEl(sub(p.look, p.pos)), [az0, el0] = azEl(sub(p0.look, p0.pos)), [az1, el1] = azEl(sub(p1.look, p1.pos));
      const d0 = len(sub(p0.look, p0.pos)), d1 = len(sub(p1.look, p1.pos));
      return { az, el, azRate: M.angleDiffDeg(az0, az1) / (2 * h), elRate: (el1 - el0) / (2 * h), dist: len(sub(p.look, p.pos)), logDistRate: (Math.log(d1) - Math.log(d0)) / (2 * h), fov: p.fov };
    }
    return { shot: s, at, view, velIn: vel(0), velOut: vel(ks.length - 2), speedIn: len(vel(0)), speedOut: len(vel(ks.length - 2)) };
  });

  // ---- transitions ------------------------------------------------------------------------------------------
  const transitions = shots.map((s, i) => {
    if (i === 0) return null;
    const A = holds[i - 1], B = holds[i], pk = shots[i - 1].keyframes, ks = s.keyframes, tune = s.tune || {};
    const T = s.tHold - s.tIn;
    const chain = [pk[pk.length - 2].pos, pk[pk.length - 1].pos, ...s.waypoints, ks[0].pos, ks[1].pos];
    const curve = chainCurve(chain), L = curve.length;
    const v0 = A.speedOut, v1 = B.speedIn;

    // speed along the curve: ds/dt = v0 + (v1 - v0) E(u) + amp * w(u) * comfort(s)
    const p = tune.p ?? 0.5, h0 = tune.h0 ?? 10, rIn = tune.rampIn ?? 0.5, rOut = tune.rampOut ?? 0.5;
    const floorA = shots[i - 1].floor ?? 0, floorB = s.floor ?? 0;
    const comfort = (sArc) => { const q = curve.at(sArc), fl = M.lerp(floorA, floorB, M.clamp(sArc / L)); return Math.pow(Math.max(0, q[1] - fl) + h0, p); };
    const N = 1536;                                              // comfort() tabulated along the curve
    const ctab = new Float64Array(N + 1); for (let j = 0; j <= N; j++) ctab[j] = comfort((j / N) * L);
    const cAt = (sArc) => { const f = M.clamp(sArc / L) * N, j = Math.min(N - 1, Math.floor(f)); return ctab[j] + (ctab[j + 1] - ctab[j]) * (f - j); };
    const win = (u) => ease5(u / rIn) * ease5((1 - u) / rOut);
    const rate = (u, sArc, amp) => v0 + (v1 - v0) * ease5(u) + amp * win(u) * cAt(sArc);
    const STEPS = 1200, dt = T / STEPS;
    const integrate = (amp, table) => {
      let sArc = 0; if (table) table[0] = 0;
      for (let j = 0; j < STEPS; j++) {
        const u = j / STEPS, um = (j + 0.5) / STEPS, u1 = (j + 1) / STEPS;
        const k1 = rate(u, sArc, amp), k2 = rate(um, sArc + 0.5 * dt * k1, amp), k3 = rate(um, sArc + 0.5 * dt * k2, amp), k4 = rate(u1, sArc + dt * k3, amp);
        sArc += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        if (table) table[j + 1] = sArc;
      }
      return sArc;
    };
    let lo = 0, hi = 1;
    while (integrate(hi) < L && hi < 1e9) hi *= 2;
    for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (integrate(mid) < L) lo = mid; else hi = mid; }
    const amp = (lo + hi) / 2, sTab = new Float64Array(STEPS + 1);
    integrate(amp, sTab);
    const fix = L / sTab[STEPS]; for (let j = 0; j <= STEPS; j++) sTab[j] *= fix;      // remove the last 1e-12 of bisection error
    /** arc length flown at transition-local time tau (cubic Hermite between the RK4 nodes: C1) */
    function sAt(tau) {
      if (tau <= 0) return v0 * tau;
      if (tau >= T) return L + v1 * (tau - T);
      const f = tau / dt, j = Math.min(STEPS - 1, Math.floor(f)), x = f - j;
      const s0 = sTab[j], s1 = sTab[j + 1], m0 = rate(j / STEPS, s0, amp) * dt, m1 = rate((j + 1) / STEPS, s1, amp) * dt;
      const x2 = x * x, x3 = x2 * x;
      return (2 * x3 - 3 * x2 + 1) * s0 + (x3 - 2 * x2 + x) * m0 + (-2 * x3 + 3 * x2) * s1 + (x3 - x2) * m1;
    }

    // velocity match at both ends: the curve tangent there is the bisector of the hold direction and the chord to
    // the next chain point, so a short, fading correction takes the direction of the hold velocity over
    const tanA = curve.tangent(0), tanB = curve.tangent(L);
    const dvA = sub(A.velOut, mul(tanA, v0)), dvB = sub(B.velIn, mul(tanB, v1));
    const bA = Math.min(tune.blendIn ?? 0.6, T * 0.4), bB = Math.min(tune.blendOut ?? 0.6, T * 0.4);
    const g = (tau, b) => { if (tau <= 0 || tau >= b) return 0; const x = tau / b, y = 1 - x; return tau * y * y * y * (1 + 3 * x); };   // g(0) = 0, g'(0) = 1, g''(0) = 0, C2 zero at b

    // view: azimuth / elevation of both holds, extrapolated at their own rates, cross-faded ("angles"); or, with
    // tune.look = 'target', the direction to a look target that travels from the last target of the previous hold
    // to the first target of the shot (the hero stays in frame while the camera flies round it), handed over
    // from and to the extrapolated holds over the first `lookIn` and the last `lookOut` of the flight
    const va = A.view(shots[i - 1].t1), vb = B.view(s.tHold);
    let dAz = M.angleDiffDeg(va.az, vb.az);
    if (tune.turn === 1 && dAz < 0) dAz += 360;                     // force a clockwise (right-hand) turn
    if (tune.turn === -1 && dAz > 0) dAz -= 360;                    // force a counter-clockwise turn
    const azB = va.az + dAz, uL0 = tune.lookFrom ?? 0, uL1 = tune.lookTo ?? 1, rL = tune.lookRamp ?? 0.3;
    const dip = tune.pitchDip ?? 0;
    const carry = tune.carry ?? 0.5;
    const targetMode = tune.look === 'target', tgtA = pk[pk.length - 1].look, tgtB = ks[0].look;
    const wIn = tune.lookIn ?? 0.3, wOut = tune.lookOut ?? 0.3;

    function at(t) {
      const tau = t - s.tIn, u = M.clamp(tau / T);
      const sArc = sAt(tau);
      let pos = sArc <= 0 ? add(chain[1], mul(tanA, sArc)) : sArc >= L ? add(chain[chain.length - 2], mul(tanB, sArc - L)) : curve.at(sArc);
      const ga = g(tau, bA), gb = g(T - tau, bB);
      if (ga) pos = add(pos, mul(dvA, ga));
      if (gb) pos = add(pos, mul(dvB, -gb));
      const beta = trapezoid((u - uL0) / Math.max(1e-6, uL1 - uL0), rL);
      // each hold's own turn carries on for about `carry` seconds beyond its end and then levels off (tanh: C2 at the boundary)
      const eA = carry * Math.tanh(tau / carry), eB = carry * Math.tanh((tau - T) / carry);
      const azA = va.az + va.azRate * eA, azBx = azB + vb.azRate * eB;
      const elA = va.el + va.elRate * eA, elBx = vb.el + vb.elRate * eB;
      let az = azA + (azBx - azA) * beta, el = elA + (elBx - elA) * beta;
      if (targetMode) {
        const tg = tune.track || mix3(tgtA, tgtB, trapezoid(u, 0.3)), [azT, elT] = azEl(sub(tg, pos));
        const azTu = az + M.angleDiffDeg(az, azT);                  // the representative next to the reference blend
        const wA = 1 - ease5(u / wIn), wB = ease5((u - (1 - wOut)) / wOut), wT = Math.max(0, 1 - wA - wB);
        az = wA * azA + wB * azBx + wT * azTu; el = wA * elA + wB * elBx + wT * elT;
      }
      el = M.clamp(el + dip * Math.sin(Math.PI * u) ** 2, -85, 85);
      const ldA = Math.log(va.dist) + va.logDistRate * tau, ldB = Math.log(vb.dist) + vb.logDistRate * (tau - T);
      const dist = Math.exp(ldA + (ldB - ldA) * ease5(u));
      const fov = va.fov + (vb.fov - va.fov) * ease5(u);
      return { pos, look: add(pos, mul(dirOf(az, el), dist)), fov, az: M.mod(az, 360), el, progress: M.clamp(sArc / L) };
    }
    return { shot: s, from: shots[i - 1], T, chain, curve, length: L, amp, v0, v1, sAt, at, turnDeg: dAz, dvA: len(dvA), dvB: len(dvB) };
  });

  /** Camera state on the path at film time t (pure). */
  function stateAt(t) {
    let i = shots.length - 1;
    for (let j = 0; j < shots.length; j++) if (t < shots[j].t1) { i = j; break; }
    const s = shots[i];
    if (i > 0 && t < s.tHold) return { ...transitions[i].at(t), index: i, inTransition: true };
    const h = holds[i].at(t), [az, el] = azEl(sub(h.look, h.pos));
    return { pos: h.pos, look: h.look, fov: h.fov, az: M.mod(az, 360), el, index: i, inTransition: false, progress: M.clamp((t - s.tHold) / Math.max(1e-9, s.t1 - s.tHold)) };
  }
  return { stateAt, transitions, holds };
}
