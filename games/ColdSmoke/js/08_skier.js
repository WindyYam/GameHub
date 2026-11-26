"use strict";
// ---------------------------------------------------------------- the skier: SDF-modelled body, joint-driven skinning, procedural pose
// Model space: origin on the snow between the skis, +y = snow normal, -z = where the skis point, +x = the skier's right.

// ================================================================ COLOURS AND MATERIALS OF JACKET, GLOVES AND POLES: all of them here, in one place
// (anything that shows the same clothes from close up, as the first-person view does, is matched to these: Skier.LOOK. The fragment shader below is
// written from them.) alb: the colour of the stuff itself, linear RGB; sheen: fuzz that lights up at grazing angles; cloth: 1 = woven (the light wraps
// round it softly and the weave shows); specS, specP: strength and tightness of the sun's highlight; gloss: how much of the sky it mirrors
const SKIER_LOOK = {
  jacket:     { alb: [0.95, 0.255, 0.026], sheen: 0.5, cloth: 1, specS: 0.05, specP: 28, gloss: 0 },      // orange shell
  sleeveFore: { alb: [0.018, 0.030, 0.055] },       // navy forearms: from 3.5-6.5 cm below the elbow down to the cuff (otherwise as the jacket)
  sleeveBand: { alb: [0.86, 0.87, 0.85] },          // pale band round the upper sleeve: 15 cm below the shoulder joint, about 2.5 cm wide
  glove:      { alb: [0.018, 0.018, 0.020], sheen: 0.2, cloth: 0, specS: 0.08, specP: 30, gloss: 0 },     // black gauntlet glove (the new glove's leather: fingers and palm)
  gloveLeather: { alb: [0.021, 0.019, 0.018], sheen: 0.12, specS: 0.26, specP: 46 },   // the new glove's leather (Variants 'hand' b): fingers, palm, thumb
  gloveBack:  { alb: [0.022, 0.023, 0.027], sheen: 0.45, specS: 0.04, specP: 24 },     // the new glove's nylon: the back of the hand and the gauntlet
  gloveBand:  { alb: [0.075, 0.078, 0.085] },       // its wrist elastic and the gauntlet's drawcord hem: charcoal
  gloveTab:   { alb: [0.62, 0.63, 0.62] },          // pull tab at the wrist, cord lock on the gauntlet: pale grey
  pole:       { alb: [0.015, 0.015, 0.015], sheen: 0, cloth: 0, specS: 0.6, specP: 80, gloss: 0.08 },     // shaft: black, glossy
  poleGrip:   { alb: [0.95, 0.255, 0.026] },        // grip: the jacket's orange, the top 18 cm of the pole (otherwise as the shaft)
  poleBasket: { alb: [0.05, 0.055, 0.065] },        // basket: dark grey, 8 to 11.5 cm above the tip (otherwise as the shaft)
  ski:        { alb: [0.93, 0.78, 0.035] },         // skis: lemon topsheet (the first-person view's skis read the same three: one pair in every view)
  skiTip:     { alb: [0.42, 0.80, 0.04] },          // ... going lime toward the tip
  skiMark:    { alb: [0.018, 0.020, 0.026] },       // ... black band behind the binding (the tail stays the jacket's orange)
};

const Skier = (() => {
  const K = { ready: false, NB: 28, LOOK: SKIER_LOOK };
  // (18..27 are helpers: half-way frames at knee, elbow, hip and shoulder so a deep bend folds like a limb and not like a pinched hose; the neck; and the
  // tail of the jacket, which rides up round the seat when the trunk folds forward)
  const B = { pelvis: 0, spine: 1, chest: 2, head: 3, uarmL: 4, farmL: 5, handL: 6, uarmR: 7, farmR: 8, handR: 9, thighL: 10, shinL: 11, footL: 12, thighR: 13, shinR: 14, footR: 15, poleL: 16, poleR: 17, kneeL: 18, kneeR: 19, elbowL: 20, elbowR: 21, seatL: 22, seatR: 23, shL: 24, shR: 25, neck: 26, tail: 27 };
  // a 1.76 m adult in ski boots on bindings (ankle joint 16 cm above the snow); grip = the middle of the fist, where the pole is held
  const LEN = { thigh: 0.43, shin: 0.43, uarm: 0.30, farm: 0.26, grip: 0.075, hipW: 0.09, hipD: 0.05, shW: 0.185, shD: 0.05, ankle: 0.16, spine: 0.25, chest: 0.25, neck: 0.085, head: 0.065, pole: 1.14, basket: 1.05 };
  let gfx, vb, vb2, ib, count = 0, pipe, pipeShadow, boneTex;
  const boneData = new Float32Array(4 * 32 * 4);
  let bind = null, invBind = [];

  // yaw (turning the facing direction toward +x), pitch (tipping forward, toward -z), roll (tipping toward +x)
  // (a basis turned about the upright by a: the game's own twist put onto a trunk the lab's posture supplied)
  const yawB = (B, a) => { if (!a) return B; const c = Math.cos(a), n = Math.sin(a), r = q => [q[0] * c - q[2] * n, q[1], q[0] * n + q[2] * c]; const o = { X: r(B.X), Y: r(B.Y) }; if (B.Z) o.Z = r(B.Z); return o; };
  function basis(yaw, pitch, roll) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const f = v => { // pitch, then roll, then yaw
      let x = v[0], y = v[1] * cp + v[2] * sp, z = -v[1] * sp + v[2] * cp;
      const x2 = x * cr + y * sr, y2 = -x * sr + y * cr;
      return [x2 * cy - z * sy, y2, x2 * sy + z * cy];
    };
    return { X: f([1, 0, 0]), Y: f([0, 1, 0]), Z: f([0, 0, 1]) };
  }
  // a weight that hands one way of moving over to another, eased on a critically damped path (no overshoot) over about 2/w seconds, so the
  // limbs it moves never change speed in a frame. Kept in sec per frame (sec.pfN): a second solve of the same frame starts from the same place
  function ez(sec, key, x, w) {
    const E = sec.ez || (sec.ez = {}), dt = sec.pfDt || 0; let q = E[key];
    if (!q || !(dt > 0) || !(x === x)) { E[key] = { n: sec.pfN, b: [x, 0], o: [x, 0] }; return x; }
    if (q.n !== sec.pfN) { q.b = q.o; q.n = sec.pfN; }
    const d = q.b[0] - x, e = Math.exp(-w * dt), bb = (q.b[1] + w * d) * dt; q.o = [x + (d + bb) * e, (q.b[1] - w * bb) * e]; return q.o[0];
  }
  function ik2(a, c, l1, l2, pole) {
    const d = v3.sub(c, a), L = v3.len(d) || 1e-6, Lc = clamp(L, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4), dn = v3.mul(d, 1 / L);
    const x = (l1 * l1 - l2 * l2 + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const p = v3.norm(v3.sub(pole, v3.mul(dn, v3.dot(pole, dn))));
    return v3.add(v3.mad(a, dn, x), v3.mul(p, h));
  }
  // frame with Y along ydir and X as close as possible to xhint
  function frameXY(o, ydir, xhint) {
    const y = v3.norm(ydir); let x = v3.sub(xhint, v3.mul(y, v3.dot(xhint, y))); if (v3.len(x) < 1e-5) x = v3.cross(y, [0, 0, 1]); x = v3.norm(x);
    return m4.fromBasis(x, y, v3.cross(x, y), o);
  }
  // a fist's frame at the grip: y up the pole, z toward the wrist (square to the pole), x = y cross z (out of the back of a right hand; the left
  // hand's glove is mirrored, so for both x is the body's right when the arms hang easy). With the forearm laid along the pole (a tuck: the shafts
  // under the arms) "toward the wrist" is lost: there the body's right (rt) takes over, so the backs of the hands stay turned out and never flip
  // (k, 新求解器: in a tuck the shaft lies nearly along the forearm and the fist is rolled round it as a skier holds it, palms toward each other: the backs
  // of the hands out, whatever side of the shaft the wrist is on. Measured 2026-11-18: by the wrist alone both palms faced out through every tuck)
  function fistFrame(g, pd, wr, rt, k) {
    const y = v3.norm(v3.mul(pd, -1)), w = v3.sub(wr, g), wz = v3.sub(w, v3.mul(y, v3.dot(w, y))), c = v3.cross(y, wz);
    return frameXY(g, y, k > 0 ? v3.add(v3.mul(c, 1 - k), v3.mul(rt, 0.025 + k * Math.max(v3.len(c), 0.05))) : v3.add(c, v3.mul(rt, 0.025)));
  }
  const fr = (b, x, y, z) => [b.X[0] * x + b.Y[0] * y + b.Z[0] * z, b.X[1] * x + b.Y[1] * y + b.Z[1] * z, b.X[2] * x + b.Y[2] * y + b.Z[2] * z];   // a vector given in a basis
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const nlerp = (a, b, t) => v3.norm(v3.lerp(a, b, t));
  // (turning one direction into another along the arc between them, at an even pace. Between two that point nearly opposite ways, a pole trailing
  // behind and the same pole reaching forward for its plant, a straight blend passes close to nothing and the direction that comes out of it swung
  // round in a frame or two: a twitch of the pole at every turn. So the swing goes by way of `via`, down and out beside the leg, as a pole swung
  // forward from the wrist does)
  const slerp = (a, b, t) => { const c = clamp(v3.dot(a, b), -1, 1), th = Math.acos(c), sn = Math.sin(th); if (sn < 1e-4) return v3.norm(v3.lerp(a, b, t));
    return v3.norm(v3.add(v3.mul(a, Math.sin((1 - t) * th) / sn), v3.mul(b, Math.sin(t * th) / sn))); };
  const swingTo = (a, b, t, via) => { const m = v3.norm(v3.add(v3.add(a, b), v3.mul(via, 1.2))); return t < 0.5 ? slerp(a, m, t * 2) : slerp(m, b, t * 2 - 1); };
  // a curve through keys [t, value] (value: number or vector); it passes each key without stopping there. `loop`: first and last key are the same moment of a cycle
  function spl(ks, t, loop) {
    const n = ks.length - 1; let i = 0; while (i < n - 1 && t > ks[i + 1][0]) i++;
    const a = ks[i], b = ks[i + 1], h = b[0] - a[0], u = sat((t - a[0]) / h), u2 = u * u, u3 = u2 * u;
    const tan = (j, c) => { const q = k => (c == null ? ks[k][1] : ks[k][1][c]);
      if (j > 0 && j < n) return (q(j + 1) - q(j - 1)) / (ks[j + 1][0] - ks[j - 1][0]);
      return loop ? (q(1) - q(n - 1)) / (ks[1][0] - ks[0][0] + ks[n][0] - ks[n - 1][0]) : 0; };
    const one = c => { const va = c == null ? a[1] : a[1][c], vb = c == null ? b[1] : b[1][c]; return (2 * u3 - 3 * u2 + 1) * va + (u3 - 2 * u2 + u) * h * tan(i, c) + (-2 * u3 + 3 * u2) * vb + (u3 - u2) * h * tan(i + 1, c); };
    return typeof a[1] === 'number' ? one(null) : [one(0), one(1), one(2)];
  }
  // closest approach of two segments: returns [point on p0p1, point on q0q1, where along p, where along q]
  function segSeg(p0, p1, q0, q1) {
    const u = v3.sub(p1, p0), v = v3.sub(q1, q0), w = v3.sub(p0, q0), a = v3.dot(u, u), b = v3.dot(u, v), c = v3.dot(v, v), d = v3.dot(u, w), e = v3.dot(v, w), D = a * c - b * b;
    let s = D > 1e-9 ? clamp((b * e - c * d) / D, 0, 1) : 0, t = c > 1e-9 ? clamp((b * s + e) / c, 0, 1) : 0; s = a > 1e-9 ? clamp((b * t - d) / a, 0, 1) : 0;
    return [v3.mad(p0, u, s), v3.mad(q0, v, t), s, t];
  }

  // ---- pose: a handful of physical quantities in, joint positions and bone frames out
  // lean/edge: body and ski roll (+ = to the skier's right); crouch 0..1: how far the legs are folded (0.38 m of travel); tuck, air 0..1; sep, headYaw: twist of
  // trunk and head; lead, stance, lift*, pitch*: where the skis are; arm*: offsets of the hands; plant*: the pole touch at a turn; dp: phase of a double-pole
  // stroke (0 = none); grab*: that hand takes hold of the same-side ski beside the binding
  const CHG_H = 0.20, LND_H = 0.12;
  const P0 = { lean: 0, edge: 0, crouch: 0.21, tuck: 0, air: 0, sep: 0, headYaw: 0, lead: 0, stance: 0.31, fore: 0, fa: 0, armL: [0, 0, 0], armR: [0, 0, 0], swing: 0, liftL: 0, liftR: 0, pitchL: 0, pitchR: 0, plantL: 0, plantR: 0, dp: 0, dpn: 0, chg: 0, sepQ: 0, hdQ: 0, grabL: 0, grabR: 0 };
  const SEC0 = { ct: 0, cf: 0, roll: 0, yaw: 0, hand: [0, 0, 0], head: 0, drop: 0, dp: null, pl: null, idle: null };

  // ---- the double-pole stroke (pose.dp = phase): reach 0..PLANT, tips in the snow PLANT..REL while the body goes past them, release, recover
  const DP = { PLANT: 0.22, REL: 0.62, T: 0.95, V: 3.5, TIPY: -0.04 };
  const DPK = [0, 0.10, 0.22, 0.42, 0.62, 0.72, 0.86, 1];
  const dpKeys = v => DPK.map((t, i) => [t, v[i]]);
  const DP_C = dpKeys([0, -0.10, -0.03, 0.14, 0.25, 0.20, 0.07, 0]);          // legs: taller in the reach, knees give in the drive
  const DP_H = dpKeys([0, -0.07, 0.10, 0.42, 0.60, 0.54, 0.18, 0]);           // trunk hinges forward at the hips
  const DP_A = dpKeys([0, -0.02, 0.03, 0.18, 0.24, 0.18, 0.05, 0]);           // and the abdomen crunches
  const DP_Z = dpKeys([0, -0.02, -0.03, 0.02, 0.06, 0.05, 0.015, 0]);         // hips: forward over the poles, then back under the folded trunk
  // where the hand rides while the tip is held by the snow, u = 0 at the plant .. 1 with the arm long beside the hip (right hand; y above the snow)
  const DP_LOCUS = [[0, [0.255, 1.055, -0.56]], [0.30, [0.280, 0.905, -0.40]], [0.58, [0.300, 0.735, -0.18]], [0.82, [0.295, 0.645, 0.02]], [1, [0.285, 0.615, 0.16]]];
  // (given for the upright figure; `rl` tips it over sideways with the body, about the line between the skis)
  const tip = (x, y, z, rl) => { const cs = Math.cos(rl), sn = Math.sin(rl); return [x * cs + y * sn, -x * sn + y * cs, z]; };
  // (新求解器: the same path, entered and left at the speed it is travelled at. As given, a path through its points starts and ends at rest: the hand
  // stood still at the plant for a frame and at the arm's full length for another. One more point beyond each end, the mirror of the one inside it)
  const DP_LOCUS2 = (() => { const L = DP_LOCUS.map((k, i) => [k[0], [k[1][0] + [0, 0, 0.008, 0.015, 0.01][i], k[1][1], k[1][2]]]), n = L.length - 1, mir = (a, b, t) => [t, a[1].map((x, i) => 2 * x - b[1][i])]; return [mir(L[0], L[1], -L[1][0])].concat(L, [mir(L[n], L[n - 1], 2 * L[n][0] - L[n - 1][0])]); })();
  // (...and a centimetre and a half wider where it passes the thigh and the hip: there the hand was inside the room it is owed from the leg, was pushed
  // out by that much as it came by, and came back in in the frame it let go)
  let dpNat = false;
  const dpLocus = (u, side, rl, yo) => { const c = dpNat ? spl(DP_LOCUS2, u) : spl(DP_LOCUS, u); return tip(c[0] * side, c[1] + yo, c[2], rl); };
  // the point of the locus from which the planted tip is exactly a pole length away
  function dpSolveU(T, side, rl, yo, PL) {
    const g = u => v3.len(v3.sub(dpLocus(u, side, rl, yo), T)) - PL;
    if (g(0) <= 0) return 0; if (g(1) >= 0) return 1 + Math.min(1, g(1) / 0.3);     // (> 1: the tip is out of reach behind: time to let go)
    let a = 0, b = 1; for (let i = 0; i < 18; i++) { const m = (a + b) / 2; if (g(m) > 0) a = m; else b = m; } return (a + b) / 2;
  }
  // (新求解器: where, and how fast per unit of phase, the hand passes from one stroke's recovery into the next stroke's reach: a fifth of the way from its
  // resting place n to the top of the reach, still going forward and up)
  const dpWrap = (n, side, rl, yo) => { const d = v3.sub(v3.add(dpLocus(0, side, rl, yo), [0, 0.16, -0.09]), n); return { W: v3.mad(n, d, 0.2), V: v3.mul(d, 5.5) }; };      // (the top of a usual reach: see hand)
  K.DP = DP;

  function solve(p, sec) {
    sec = sec || SEC0;
    const lean = p.lean || 0, sl = Math.sin(lean), al = Math.abs(sl), edge = p.edge || 0, tuck = sat(p.tuck || 0), air = sat(p.air || 0);
    const stance = p.stance == null ? 0.31 : p.stance, lead = p.lead || 0, liftL = p.liftL || 0, liftR = p.liftR || 0, armL = p.armL || P0.armL, armR = p.armR || P0.armR;
    const gL = smooth(0, 1, p.grabL || 0), gR = smooth(0, 1, p.grabR || 0), gM = Math.max(gL, gR), gS = gR - gL;
    const f = clamp(p.dp || 0, 0, 1), dpw = ez(sec, 'dpw', f > 0 ? (1 - smooth(0, 0.7, tuck)) * (1 - air) * (1 - gM) * (1 - smooth(0.14, 0.5, Math.abs(lean))) : 0, 16);   // (nobody double-poles on one edge. Eased: a stroke begun or given up hands the arms over in a moment, never in a frame)
    const PL = LEN.pole, J = {}, F = new Array(K.NB);
    // standing at ease (see update): rest 0..1 with the pole tips set down at T (u: one lifted, to be set down afresh), up: the trunk more upright, br: a
    // breath drawn 0..1, sh: the weight on the left (-1) or right (+1) ski, hy, hp, ty: where head and shoulders are turned, sx: the body's slow sway
    const id = sec.idle || null, ish = id ? id.sh : 0, ibr = id ? id.br : 0;
    // feet (ski frames): rolled onto their edges; the inside ski leads
    const fb = basis(0, 0, edge), lift = 0.05 * Math.abs(Math.sin(edge));
    // (sec.gnd, 08j_solver.js, 新求解器: where the real snow is under each ski, given in the figure's own frame: [height, pitch] for the left and the right
    // ski. The skis are laid on it; the body's height stays the physics' own, so the legs take up the difference)
    const gd = sec.gnd || null, gyL = gd ? gd[0] : 0, gpL = gd ? gd[1] : 0, gyR = gd ? gd[2] : 0, gpR = gd ? gd[3] : 0;
    const fbL = p.pitchL || p.rollL || gpL ? basis(0, -(p.pitchL || 0) - gpL, edge + (p.rollL || 0)) : fb, fbR = p.pitchR || p.rollR || gpR ? basis(0, -(p.pitchR || 0) - gpR, edge + (p.rollR || 0)) : fb;      // (rollL/R: one ski rolled on its own, as legs spread apart in the air)
    // (snow that stands higher under a ski folds that leg; snow that lies lower is reached for only as far as the leg is long, below: the body is not
    // pulled down after a ski)
    J.footL = [-stance / 2, lift + liftL + Math.max(gyL, 0), lead]; J.footR = [stance / 2, lift + liftR + Math.max(gyR, 0), -lead];
    J.ankleL = v3.mad(J.footL, fbL.Y, LEN.ankle); J.ankleR = v3.mad(J.footR, fbR.Y, LEN.ankle);
    // how far the legs are folded: the suspension travel of the physics, 0.38 m from long to deep (the body's height over the snow is the physics' own),
    // plus what the stroke and a grab ask for
    // (poling is done standing fairly tall: a stroke does not start from a deep squat)
    // (a tuck is ridden low: asked for on long legs, as over a crest where the snow falls away, the knees still keep most of their bend)
    const c0 = sat(p.crouch == null ? P0.crouch : p.crouch), cs = dpw > 0 ? spl(DP_C, f) : 0;
    const ce0 = q => { let c = sat(q); if (tuck > 0) c = -smin(-c, -0.36 * tuck, 0.3 * tuck + 1e-6); return dpw > 0 ? sat(lerp(c, Math.min(c, 0.45), dpw) + dpw * cs) : c; }, ce = q => lerp(ce0(q), 1, gM * 0.9);
    // (the legs take the game's own value, at once: they are the suspension. The trunk is carried on them and has weight: it takes its fold from the same
    // value a moment later, cT, so legs that are driven up or let out in a frame or two work under a quiet upper body; cF: the same, only just behind)
    const c = ce(c0), dpy = dpw > 0 ? 0.8 * 0.38 * (sat(P0.crouch + cs) - ce0(c0)) : 0, cT = sec.ct ? ce(c0 + sec.ct) : c, cF = sec.cf ? ce(c0 + sec.cf) : c;
    // (fore/aft, pose.fa: forward the hips go over the toes and the chest folds a little over them; back the hips sit behind the heels, lower)
    const faF = Math.max(p.fa || 0, 0), faA = Math.max(-(p.fa || 0), 0);
    let H = 1.085 - 0.38 * c - 0.06 * smooth(0.7, 1, c) - 0.11 * tuck - 0.05 * gM - 0.06 * faF - 0.085 * faA;
    // (新求解器, owner 2026-11-18: wound up for a jump with the ring full the skier sat no lower than at the bottom of any compression, hips 0.63 m over
    // the feet: "至少应该再…往下蹲". The wind-up (p.chg, the game's S.charge) takes the hips down CHG_H further, thighs to about level, the deepest a
    // skier loads a jump from; it is the figure's own, the physics' leg travel is as it was)
    const chgH = gd ? Math.min(CHG_H * sat(ez(sec, 'chg', sat(p.chg || 0), 14)) + LND_H * sat(p.lnd || 0), CHG_H) : 0; H -= chgH;      // (p.lnd: and a hard landing LND_H, see land b in 07_game.js)      // (eased: let go, the charge is gone in four frames, and the legs take the whole take-off to straighten)
    if (gd && gd[4]) H += gd[4];      // (新求解器: the body carried higher over bumps the legs could not take, begun ahead of them: see lift in 08j_solver.js)
    // (p.reach, mo4 b: the legs reached out long for a landing. On legs that long the trunk's own rule stands it nearly upright, and the hips open to
    // 50 degrees where a skier touches down at 55 to 65: the chest is kept forward by a hand, as a skier meeting a landing has it)
    const hinge0 = 0.36 + 0.46 * cT + 0.70 * tuck - 0.14 * air * (1 - gM) + 0.42 * gM * (1 - tuck) + (dpw > 0 ? dpw * spl(DP_H, f) : 0) + (id ? id.up : 0) + 0.24 * faF + 0.08 * faA + 0.17 * (p.reach || 0) * (1 - tuck);
    // (the trunk folds no lower than the thighs it comes to lie on: pressed deeper while it is folded right over, the hips sink and the back comes up, as
    // when a compression is soaked up in a tuck; reaching for a ski in the air, the knees part and let the chest down between them)
    const hmax = PI / 2 + Math.asin(clamp((1.085 - 0.38 * cF - 0.06 * smooth(0.7, 1, cF) - 0.11 * tuck - 0.05 * gM - chgH - 0.58) / LEN.thigh, -1, 1)) - 0.66 + 0.45 * gM;
    const hinge = smin(Math.min(hinge0, 1.42), hmax, 0.12), crunch = (dpw > 0 ? dpw * spl(DP_A, f) : 0) + 0.22 * gM;
    // pelvis: the body line from the snow contact tilts by the lean; hips move inside the turn (angulation). A ski boot lets the shin tip forward only so
    // far, so a deep crouch does not push the knees on: it sits back, hips behind the heels, and the trunk folds forward over the thighs to balance
    // (at ease with the weight on one ski: the hips are over it and that hip stands the higher, the other leg let go a little, the shoulders tipped back level)
    let pb = basis((p.sep || 0) * 0.35, hinge * 0.5, lean * 0.62 + gS * 0.10 - 0.075 * ish);
    let pel, hipL, hipR, zP = 0;
    for (let it = 0; it < 6; it++) {
      const D0 = smin(H - LEN.hipD - LEN.ankle, 0.8385, 0.10), flex = smin(Math.acos(clamp(D0 / (LEN.thigh + LEN.shin), -1, 1)), 0.54, 0.15), dy = D0 - LEN.shin * Math.cos(flex);
      zP = -LEN.shin * Math.sin(flex) + Math.sqrt(Math.max(0, LEN.thigh * LEN.thigh - dy * dy)) - 0.012 - (p.fore || 0) * 0.06 - 0.16 * faF + 0.13 * faA + (dpw > 0 ? dpw * spl(DP_Z, f) : 0);
      pel = [H * Math.sin(lean) + 0.07 * sl + 0.045 * ish, H * Math.cos(lean) + (liftL + liftR) * 0.5, zP];
      hipL = v3.add(v3.mad(pel, pb.X, -LEN.hipW), v3.mul(pb.Y, -LEN.hipD)); hipR = v3.add(v3.mad(pel, pb.X, LEN.hipW), v3.mul(pb.Y, -LEN.hipD));
      // (a leg is never locked straight: the last few centimetres are given up softly)
      const over = Math.max(v3.len(v3.sub(hipL, J.ankleL)), v3.len(v3.sub(hipR, J.ankleR))) - (LEN.thigh + LEN.shin) * 0.975;
      if (over <= -0.03) break; H -= (over >= 0.03 ? over : (over + 0.03) * (over + 0.03) / 0.12) * 1.1;
    }
    // (the lab's turns, 08f_labmo.js: the pelvis from a real skier's posture at this lean, faded in by lab.w; the game's crouch, fore/aft and lifted
    // skis still move it, so bumps, landings and the shovels/tails control keep working)
    const L = sec.lab;
    if (L && L.w > 0) {
      // (新求解器: the body's place is counted from where the feet stand by the physics, not from feet lifted by a bump: lifted with them, the whole body
      // rode up every bump the legs were there to take, half a metre in a mogul field)
      const am = v3.lerp(J.ankleL, J.ankleR, 0.5); if (gd) am[1] -= (Math.max(gyL, 0) + Math.max(gyR, 0)) / 2 - (gd[4] || 0);
      const lp = v3.add(am, v3.mul(L.pel, LabMo.LEG));
      lp[1] += -0.38 * (c - L.cref) - chgH - 0.06 * faF - 0.085 * faA + (liftL + liftR) * 0.5; lp[2] += -(p.fore || 0) * 0.06 - 0.16 * faF + 0.13 * faA;
      lp[1] += (pel[1] - lp[1]) * sat(p.drive || 0);      // (through a jump's drive the hips stand up with the game's legs, see the game's pose.drive)
      pel = v3.lerp(pel, lp, L.w); pb = LabMo.mixB(pb, L.pb, L.w); if (sec.gnd && p.sepQ) pb = yawB(pb, 0.35 * p.sepQ * L.w);
      for (let it = 0; it < 3; it++) {
        hipL = v3.add(v3.mad(pel, pb.X, -LEN.hipW), v3.mul(pb.Y, -LEN.hipD)); hipR = v3.add(v3.mad(pel, pb.X, LEN.hipW), v3.mul(pb.Y, -LEN.hipD));
        const over = Math.max(v3.len(v3.sub(hipL, J.ankleL)), v3.len(v3.sub(hipR, J.ankleR))) - (LEN.thigh + LEN.shin) * 0.975;
        if (over <= -0.03) break; pel = v3.mad(pel, v3.norm(v3.sub(am, pel)), over >= 0.03 ? over : (over + 0.03) * (over + 0.03) / 0.12);      // (given up softly, as the game's own legs are)
      }
    }
    J.pelvis = pel; J.hipL = hipL; J.hipR = hipR;
    // (and less and less as the leg straightens, nothing from 0.93 of its length on: a leg nearly straight, as in the last of a pop, does not chase a
    // centimetre of snow; there a centimetre of foot is degrees of knee. Measured 2026-11-18: 17 more jolts at the take-offs of three jump runs)
    if (gyL < 0 || gyR < 0) { const Lm = (LEN.thigh + LEN.shin) * 0.975, reach = (hip, an, g) => { if (!(g < 0)) return 0; const dx = hip[0] - an[0], dz = hip[2] - an[2], h2 = Lm * Lm - dx * dx - dz * dz, u = sat((v3.len(v3.sub(hip, an)) / (LEN.thigh + LEN.shin) - 0.84) / 0.09), w = 1 - u * u * (3 - 2 * u); return h2 > 0 ? Math.min(0, Math.max(g * w, hip[1] - Math.sqrt(h2) - an[1])) : 0; };
      const dl = reach(hipL, J.ankleL, gyL), dr = reach(hipR, J.ankleR, gyR); J.footL[1] += dl; J.ankleL[1] += dl; J.footR[1] += dr; J.ankleR[1] += dr; }
    // legs from the boot up: the boot holds the shin square to the ski sideways, so the knee folds forward over the toe and goes into the turn with the
    // edge; of all the places the knee could be it takes the one that keeps the shin in the boot
    const knee = (hip, ank, b, side) => {
      const d = v3.sub(hip, ank), L = v3.len(d) || 1e-6, Ls = LEN.shin, Lt = LEN.thigh, Lc = clamp(L, 0.02, Ls + Lt - 1e-4), dn = v3.mul(d, 1 / L);
      const x = (Ls * Ls - Lt * Lt + Lc * Lc) / (2 * Lc), hc = Math.sqrt(Math.max(0, Ls * Ls - x * x)), fw = v3.mul(b.Z, -1);
      let e1 = v3.sub(fw, v3.mul(dn, v3.dot(fw, dn))); if (v3.len(e1) < 1e-4) e1 = v3.sub(b.Y, v3.mul(dn, v3.dot(b.Y, dn))); e1 = v3.norm(e1); const e2 = v3.cross(dn, e1);
      const A = x * v3.dot(dn, b.X) - Ls * Math.sin(clamp(lean * 0.10, -0.09, 0.09)), Bc = v3.dot(e1, b.X), Cc = v3.dot(e2, b.X), R = Math.hypot(Bc, Cc);
      let th = 0, th0 = 0;
      if (hc > 1e-5 && R > 1e-5) { const t0 = Math.atan2(Cc, Bc), w = Math.acos(clamp(-A / (hc * R), -1, 1)), wrap = q => Math.atan2(Math.sin(q), Math.cos(q)), ta = wrap(t0 + w), tb = wrap(t0 - w);
        // (of the two places, the one nearer straight ahead; but where the two are nearly as near, as the edges change over, that choice could
        // flip back and forth and the knee jumped a few centimetres in a frame: the one it took last frame keeps it until the other is the nearer by a good margin (sec.pf, kept by update))
        const kq = sec.pf ? sec.pf[side < 0 ? 0 : 1] : null; if (kq && kq.kn !== sec.pfN) { kq.kp = kq.ko; kq.kvp = kq.kvo; kq.kn = sec.pfN; }
        let ca = Math.abs(ta), cb = Math.abs(tb); if (kq && kq.kp != null) { if (Math.abs(wrap(ta - kq.kp)) < Math.abs(wrap(tb - kq.kp))) ca -= 0.3; else cb -= 0.3; }
        th = ca < cb ? ta : tb;
        // (and the knee's swing about the line from hip to ankle (it keeps both bones their length) follows over a thirtieth of a second: where the
        // ski's edge and the leg's lean cross through flat together the answer moved unevenly from one frame to the next)
        if (kq) { if (kq.kp != null && sec.pfDt > 0) { const w = 30, h = sec.pfDt, d = -wrap(th - kq.kp), e = Math.exp(-w * h), vv = kq.kvp || 0, b = (vv + w * d) * h; th = th + (d + b) * e; kq.kvo = (vv - w * b) * e; } else kq.kvo = 0; kq.ko = th; }      // (2026-11-15: critically damped, so its speed never jumps either)
        // (but a leg flung out to the side (the spread eagle, the X) cannot keep its shin square in the boot: the nearest it can come put the knee out
        // sideways or right round behind, the thigh screwed round on itself by up to half a turn, and the cloth at the hip, hung between the pelvis and that
        // thigh, was wrung thin. Past what the boot can hold the knee goes back to bending over the ski's tip, the way a straight leg is carried in the air)
        th0 = th; th *= ez(sec, 'kf' + side, 1 - smooth(0.5, 1.5, Math.abs(A) / (hc * R)), 20); }      // (eased: on a leg near straight this changes fast)
      // (and the swing as drawn, whichever way it was found, eased once more the same way: a leg thrown wide in the air, or one that comes straight,
      // can change which rule finds it, and the knee must not jump for that)
      { const kq = sec.pf ? sec.pf[side < 0 ? 0 : 1] : null;
        if (kq) { if (kq.fn !== sec.pfN) { kq.fp = kq.fo; kq.fvp = kq.fvo; kq.fn = sec.pfN; }
          if (kq.fp != null && sec.pfDt > 0) { const wrap = q => Math.atan2(Math.sin(q), Math.cos(q)), w = 30, h = sec.pfDt, d = wrap(kq.fp - th), e = Math.exp(-w * h), vv = kq.fvp || 0, b = (vv + w * d) * h; th = th + (d + b) * e; kq.fvo = (vv - w * b) * e; }
          else kq.fvo = 0; kq.fo = th; } }
      const kp = q => v3.add(v3.mad(ank, dn, x), v3.add(v3.mul(e1, hc * Math.cos(q)), v3.mul(e2, hc * Math.sin(q)))); J['kneeRaw' + (side < 0 ? 'L' : 'R')] = kp(th0 + (th - th0) * 0.15); return kp(th);
    };
    J.kneeL = knee(hipL, J.ankleL, fbL, -1); J.kneeR = knee(hipR, J.ankleR, fbR, 1);
    // (a boot only flexes so far: a ski that is off the snow gives way and pitches with the shin instead)
    // (the boot is flexed by the knee as the boot would have it (kneeRaw, near enough), so a leg flung out keeps the skis where the trick put them)
    const boot = (b, kn, an, w) => {
      if (w <= 0) return b; const sh = v3.norm(v3.sub(kn, an)), fl = Math.atan2(-v3.dot(sh, b.Z), v3.dot(sh, b.Y)), e = (fl - clamp(fl, 0.10, 0.58)) * w; if (Math.abs(e) < 1e-5) return b;
      const ce = Math.cos(e), se = Math.sin(e); return { X: b.X, Y: v3.sub(v3.mul(b.Y, ce), v3.mul(b.Z, se)), Z: v3.add(v3.mul(b.Z, ce), v3.mul(b.Y, se)) };
    };
    let fbl = boot(fbL, J.kneeRawL, J.ankleL, Math.max(sat(liftL / 0.06), air, sat(Math.abs(p.pitchL || 0) / 0.08)));
    let fbr = boot(fbR, J.kneeRawR, J.ankleR, Math.max(sat(liftR / 0.06), air, sat(Math.abs(p.pitchR || 0) / 0.08)));
    // (tipL/R: the ski pitched up at the boot over and above all that, so that its shovel rides up out of the snow: powder, a hollow, a
    // mogul's face. Not the boot's to undo: in real snow the ski bends there, and the shin a few degrees more against the tongue reads the same)
    const tipUp = (b, a) => { if (!a) return b; const ce = Math.cos(-a), se = Math.sin(-a); return { X: b.X, Y: v3.sub(v3.mul(b.Y, ce), v3.mul(b.Z, se)), Z: v3.add(v3.mul(b.Z, ce), v3.mul(b.Y, se)) }; };
    // (新求解器: the ski already lies on the snow it has under it, so the shovel is not tipped up as well: tipped by this rule after a landing, 26 degrees
    // about the boot, the tail went 43 cm under the snow, measured 2026-11-18)
    if (!gd) { fbl = tipUp(fbl, p.tipL || 0); fbr = tipUp(fbr, p.tipR || 0); }
    J.footL = v3.mad(J.ankleL, fbl.Y, -LEN.ankle); J.footR = v3.mad(J.ankleR, fbr.Y, -LEN.ankle);
    // torso: hinged forward at the hips, more upright sideways than the legs, rotated toward the fall line (separation)
    // (a turn begins with the whole body tipping in; only as it tightens do the hips drop inside while the shoulders stay nearer level)
    // (feel b, Variants in 07_game.js: the chest goes over with the legs, always less (the knees and hips take the rest, angulation) but never less
    // the deeper the turn: two thirds of the lean in a gentle turn, half of it laid right over. Its own extra angulation (p.tilt) is then not given)
    const fbT = typeof Variants !== 'undefined' && Variants.val.feel === 'b';
    // (p.quiet, a mogul field: the chest stays nearer upright still, the legs angulate under it, the judges' quiet upper body)
    const leanT = lean * (fbT ? lerp(0.66, 0.48, smooth(0.2, 0.9, Math.abs(lean))) : lerp(0.74, 0.40, smooth(0.25, 0.72, Math.abs(lean)))) * (1 - 0.4 * (p.quiet || 0)) + sec.roll + gS * 0.26 + (id ? 0.03 * ish + id.sx : 0) + (fbT ? 0 : p.tilt || 0), sep = (p.sep || 0) + sec.yaw + (id ? id.ty : 0);
    const up2 = Math.min(hinge * 1.15 + 0.06 + crunch - 0.035 * ibr, 1.74);      // (a breath drawn straightens the upper back...)
    let t1 = basis(sep * 0.7, hinge, leanT), t2 = basis(sep, up2, leanT * 0.82);
    // (mo3 b, 07_game.js: in a mogul field (p.quiet) the lab's trunk is a fifth of the mix and the quiet trunk above keeps the rest; and the head
    // below stays the game's own. The lab's trunk and head had replaced both rules outright: the head rolled with the shoulders, 20 degrees
    // either way, and the trunk swung from side to side over the bumps)
    const MO3 = typeof Variants !== 'undefined' && Variants.val.mo3 === 'b';
    if (L && L.w > 0) { const wq = MO3 ? L.w * (1 - 0.8 * (p.quiet || 0)) : L.w; t1 = LabMo.mixB(t1, L.t1, wq); t2 = LabMo.mixB(t2, L.t2, wq);
      // (新求解器: the lab's trunk took the game's whole twist away with it, and with that the throw of a spin: Mac round 21, the shoulders stood
      // square while a 360 was wound up, and the hips went first. What the game adds for a trick (p.sepQ, p.hdQ: the wind-up, the throw, the
      // head looking round) is put back on top, shoulders more than hips, head most)
      if (sec.gnd && p.sepQ) { t1 = yawB(t1, 0.7 * p.sepQ * wq); t2 = yawB(t2, p.sepQ * wq); } }
    J.chest = v3.mad(pel, t1.Y, LEN.spine + 0.004 * ibr); J.neck = v3.mad(J.chest, t2.Y, LEN.chest);
    // (shoulders come forward and together when the arms are in front of the face)
    const prot = 0.035 * tuck + 0.02 * gM;
    J.shL = v3.add(v3.add(v3.mad(J.neck, t2.X, -LEN.shW + prot * 0.5), v3.mul(t2.Y, -LEN.shD)), v3.mul(t2.Z, -prot)); J.shR = v3.add(v3.add(v3.mad(J.neck, t2.X, LEN.shW - prot * 0.5), v3.mul(t2.Y, -LEN.shD)), v3.mul(t2.Z, -prot));
    if (ibr) { J.shL = v3.add(J.shL, fr(t2, -0.003 * ibr, 0.012 * ibr, 0.004 * ibr)); J.shR = v3.add(J.shR, fr(t2, 0.003 * ibr, 0.012 * ibr, 0.004 * ibr)); }      // (...and lifts the shoulders)
    // head: eyes stay near level and look where the skier is going; folded right over, the neck cranes back as far as a neck goes
    const hp = Math.max(0.05 + 0.10 * cT + 0.02 * tuck + sec.head + (id ? id.hp : 0), up2 - 1.0);
    let hb = basis((p.sep || 0) + (p.headYaw || 0) + (id ? id.hy : 0), hp, lean * 0.10);
    if (L && L.w > 0 && !MO3) hb = LabMo.mixB(hb, L.hb, L.w); if (L && L.w > 0 && !MO3 && sec.gnd && (p.sepQ || p.hdQ)) hb = yawB(hb, ((p.sepQ || 0) + (p.hdQ || 0)) * L.w);
    const nY = v3.norm(v3.add(t2.Y, hb.Y));
    J.skull = v3.mad(J.neck, nY, LEN.neck); J.head = v3.add(v3.mad(J.skull, hb.Y, LEN.head), v3.mul(hb.Z, -0.015));
    // body shapes the hands and the poles have to stay out of
    const caps = [[hipL, J.kneeL, 0.115, 0.095], [hipR, J.kneeR, 0.115, 0.095], [J.kneeL, J.ankleL, 0.09, 0.085], [J.kneeR, J.ankleR, 0.09, 0.085], [v3.add(v3.mad(hipL, pb.Z, 0.03), v3.mul(pb.X, 0.035)), v3.add(v3.mad(hipR, pb.Z, 0.03), v3.mul(pb.X, -0.035)), 0.15, 0.15],
      [pel, J.chest, 0.155, 0.165], [J.chest, v3.mad(J.neck, t2.Y, -0.07), 0.165, 0.15], [v3.add(v3.mad(J.chest, t2.Z, 0.19), v3.mul(t2.Y, -0.16)), v3.add(v3.mad(J.chest, t2.Z, 0.18), v3.mul(t2.Y, 0.12)), 0.115, 0.10], [J.head, J.head, 0.135, 0.135]];
    // (新求解器: the same shapes as one smooth surface: where two of them meet the corner is round, so how far a point is from the body is one number
    // that changes evenly, and so does the way out. An elbow sliding along a thigh onto the shin is turned evenly, not thrown from one to the other)
    const bodyD = (q, n) => { let m = 1e9; for (let i = 0; i < (n || caps.length); i++) { const cp = caps[i], a = cp[0], b = cp[1], ab = v3.sub(b, a), l2 = v3.dot(ab, ab), t = l2 > 1e-9 ? sat(v3.dot(v3.sub(q, a), ab) / l2) : 0;
      m = smin(m, v3.len(v3.sub(q, v3.mad(a, ab, t))) - lerp(cp[2], cp[3], t), 0.03); } return m; };
    // (and the way out of it for a point that is free to go anywhere, a fist: straight away from the surface, to the same evenly growing clearance)
    const clearOf = (q, r) => { for (let it = 0; it < 3; it++) { const g0 = bodyD(q) - r, M = 0.005, Bd = 0.02, T = g0 >= M + Bd ? g0 : g0 <= M - Bd ? M : g0 + (M + Bd - g0) * (M + Bd - g0) / (4 * Bd); if (T <= g0 + 1e-5) break;
      const h = 0.01, n = [bodyD([q[0] + h, q[1], q[2]]) - bodyD([q[0] - h, q[1], q[2]]), bodyD([q[0], q[1] + h, q[2]]) - bodyD([q[0], q[1] - h, q[2]]), bodyD([q[0], q[1], q[2] + h]) - bodyD([q[0], q[1], q[2] - h])], l = v3.len(n); if (l < 1e-6) break; q = v3.mad(q, n, (T - g0) / l); }
      return q; };
    const pushOut = (q, r, side, n) => {
      for (let i = 0; i < (n || caps.length); i++) { const cp = caps[i], a = cp[0], b = cp[1], ab = v3.sub(b, a), l2 = v3.dot(ab, ab), t = l2 > 1e-9 ? sat(v3.dot(v3.sub(q, a), ab) / l2) : 0, cpt = v3.mad(a, ab, t), R = lerp(cp[2], cp[3], t) + r;
        let dv = v3.sub(q, cpt), dl = v3.len(dv); if (dl >= R) continue; if (dl < 1e-4) { dv = [side, 0, 0]; dl = 1; } q = v3.mad(cpt, dv, R / dl); }
      return q;
    };
    // hands: forward and wide in the stance, elbows soft; inside hand reaches for the snow in a turn; in front of the chin in a tuck; wide in the air
    // (they are carried in front of the body at the height of the navel: they do not sink toward the knees as the chest tips forward)
    const hf = basis(sep, hinge * 0.4, leanT * 0.85), hl = basis(sep, 0, leanT * 0.6), reach = (LEN.uarm + LEN.farm + LEN.grip) * 0.975;
    dpNat = !!sec.gnd; sec.dpmv = sec.gnd ? ez(sec, 'dpm', p.dpn ? 1 : 0, 12) : 0;      // (whether another stroke follows this one, eased: see dpWrap)
    const dpd = sec.dp || null, wide = Math.max(0, stance - 0.36) * 0.35, pl = basis((p.sep || 0) * 0.35, 0, lean * 0.62 + gS * 0.10);
    // (when the stroke lets go of the snow: at its time, or, with a tip that either hand can no longer reach, at the step before this one)
    let dpRel = dpd ? dpd.rel : DP.REL, dpOut = false;
    if (dpw > 0 && dpd && dpd.T && dpd.g && f >= DP.PLANT && f < dpRel) for (let k = 0; k < 2; k++) if (dpSolveU([dpd.T[k * 2], DP.TIPY, dpd.T[k * 2 + 1]], k ? 1 : -1, lean, dpy, PL) > 1) { dpRel = dpd.gf; dpOut = true; }
    // (新求解器: ...and before the arm is at its full length, if the hand is still going away from the shoulder: two frames of that speed short of it,
    // which is the room it takes to lose that speed over four frames and not in one. Measured 2026-11-18, second stroke of a start at 5 m/s: the hand
    // met the end of its arm going out at 7 cm a frame)
    if (sec.gnd && dpw > 0 && dpd && dpd.T && dpd.g && dpd.v && f >= DP.PLANT && f < dpRel && sec.pfDt > 0) for (let k = 0; k < 2; k++) { const sd = k ? 1 : -1, shk = k ? J.shR : J.shL;
      const gu = dpLocus(Math.min(dpSolveU([dpd.T[k * 2], DP.TIPY, dpd.T[k * 2 + 1]], sd, lean, dpy, PL), 1), sd, lean, dpy), r = v3.sub(gu, shk), l = v3.len(r) || 1;
      const vr = (dpd.v[k * 3] * r[0] + dpd.v[k * 3 + 1] * r[1] + dpd.v[k * 3 + 2] * r[2]) / l * sec.pfDt / DP.T;
      if (l + 2 * Math.max(vr, 0) > (LEN.uarm + LEN.farm + LEN.grip) * 0.975) { dpRel = dpd.gf; dpOut = true; } }
    // how far the shaft of a pole held at g and pointing along d is from the body (negative: it cuts through)
    const shaftGap = (g, d) => { let m = 1e9; const p0 = v3.mad(g, d, 0.15), p1 = v3.mad(g, d, PL);
      for (let i = 0; i < caps.length; i++) { const cp = caps[i], r = segSeg(p0, p1, cp[0], cp[1]); m = Math.min(m, v3.len(v3.sub(r[0], r[1])) - lerp(cp[2], cp[3], r[3]) - 0.028); } return m; };
    const hand = (side) => {  // side: -1 left, +1 right. Returns the grip (middle of the fist), the elbow and the pole direction
      const inside = sat(side * sl * 1.6), outside = sat(-side * sl * 1.6), sh = side < 0 ? J.shL : J.shR, g = side < 0 ? gL : gR;
      // (the plane of its own leg, seen from behind: hand and pole are carried on the outer side of it, so with the legs laid over in a turn the outside
      // hand rides above the outside knee and its pole trails level and high, clear of thigh and hip)
      const hipS = side < 0 ? hipL : hipR, ankS = side < 0 ? J.ankleL : J.ankleR, lg = v3.sub(hipS, ankS), nl = v3.norm([side * lg[1], -side * lg[0], 0]), off = q => v3.dot(v3.sub(q, ankS), nl);
      let t = v3.add(J.chest, fr(hf, side * (0.275 + 0.03 * c + wide), -0.075 - 0.02 * c, -0.375));
      t = v3.add(t, [side * 0.05 * inside - side * 0.02 * outside, -0.06 * inside * al + 0.06 * outside, -0.05 * outside - 0.04 * inside]);
      t = v3.add(t, [sec.hand[0], sec.hand[1] + side * sec.drop, sec.hand[2]]);
      { const o = off(t); t = v3.mad(t, nl, -smin(-o, -0.20, 0.06) - o); }
      // tuck: fists a little apart just under the line of the chin, forearms up in front of the knees
      if (tuck > 0) { const tk = v3.add(J.head, fr(hl, side * 0.095, -0.23, -0.17)); t = v3.lerp(t, tk, sec.gnd ? smooth(0, 0.45, tuck) : smooth(0, 1, tuck)); }
      if (air > 0) { const ta = v3.add(J.chest, fr(t2, side * 0.54, 0.06, -0.22)); t = v3.lerp(t, ta, air * 0.8 * (1 - g)); }
      t = v3.add(t, side < 0 ? armL : armR);
      // pole: trails behind with the basket just off the snow
      const tipH = 0.10 + 0.05 * c + 0.22 * air, sy0 = clamp((t[1] - tipH) / PL, -0.2, 0.97);
      let d = v3.norm([side * 0.07, -sy0, Math.sqrt(Math.max(0.02, 1 - sy0 * sy0 - 0.0049))]);
      { const tp = v3.mad(t, d, PL), o = off(tp); d = v3.norm(v3.sub(v3.mad(tp, nl, -smin(-o, -0.20, 0.06) - o), t)); }
      if (air > 0) d = nlerp(d, v3.norm([side * 0.34, -0.22, 0.92]), air * 0.8);
      // tuck: clamped under the arm, the shaft runs back past the outside of the hip and rises to end behind and above the seat
      // (wide enough of the hip to clear the jacket, whose hem stands out past the hip's own shape: 0.30 put the shaft through it)
      // (新求解器: the owner, 2026-11-17: "握是收到两个腋窝之间，胳膊夹住杖出去". The shaft runs from the fist back through the armpit (7 cm under the shoulder
      // joint, 3 cm in from it), held there by the upper arm, and ends behind and above the hips)
      const pit = v3.add(sh, fr(t2, side * 0.01, -0.07, 0)), tkw0 = smooth(0.15, 0.6, tuck);
      // (...and only as the fist itself comes in between the shoulders: tkIn, how far in it is. A point just outside the ribs is aimed at, so the shaft lies
      // against the jacket and not in it)
      const tkIn = q => 1 - smooth(0.18, 0.40, side * v3.dot(v3.sub(q, J.chest), t2.X)); let tkw = tkw0 * tkIn(t);      // (a designed order: the fists come in first, by 0.45 of the way down; then the shafts swing in under the arms, by 0.6; the body is all the way down last. Aimed at the armpit from a fist still out wide, a shaft pointed through the chest)
      if (tuck > 0 && sec.gnd) d = nlerp(d, v3.norm(v3.sub(pit, t)), tkw); else
      if (tuck > 0) { const tt = v3.add(pel, fr(pl, side * 0.54, 0.16, 0.36)), tw = smooth(0, 1, tuck); d = nlerp(d, v3.norm(v3.sub(tt, t)), tw); }
      d[1] += 0.10 * Math.sin((p.swing || 0) * side) * (1 - tuck) * (1 - dpw); d = v3.norm(d);
      // the plant: the basket swings forward and goes in beside its own ski, about level with the ski tip. The body may still be laid over the other
      // way, in the turn that is ending: it is the ski the pole belongs beside, so the hand reaches out over it and down, having risen a little to
      // let the pole swing through under it. (Too long to hang straight down, the pole swings round the outside, wider the lower the hand)
      // (Once the tip is in, the snow has it: it stays where it went in, its place kept in the world by update, while the body goes past and the hand
      // rides up over it if it must; then it is left behind and comes round to trail again, without swinging out a second time)
      const plant = sat((side < 0 ? p.plantL : p.plantR) || 0), ps = plant * plant * (3 - 2 * plant), pin = smooth(0.6, 1, ps), pp = sec.pl && dpw <= 0 ? sec.pl[side < 0 ? 0 : 1] : null;
      let planted = 0, tipT = null, low = 0, deep = 0, uo = 0, ur = 0, Tm = null, hp = null, relH = null, hk = null;
      // at ease: the pole stands in the snow where it was set down and the hand rests on its grip, so a breath or a shift of weight turns the pole about
      // its tip and does not drag it. (The first stroke of the run has taken the pole over before it is half way to its own plant)
      const rs = id && id.T ? id.rest * (1 - tuck) * (1 - air) * (1 - g) * (1 - sat(plant * 4)) * (1 - smooth(0, 0.16, f)) : 0;
      if (rs > 0) { const k = side < 0 ? 0 : 1, T = id.T[k], tp = [T[0], lerp(DP.TIPY, 0.05, id.u[k]), T[1]], dv = v3.sub(t, tp), l = v3.len(dv) || 1;
        t = v3.mad(t, dv, clamp(PL - l, -0.06, 0.06) / l * rs); tipT = tp; planted = rs; low = rs; d = nlerp(d, v3.norm(v3.sub(tp, t)), rs); }
      if (plant > 0) {
        const ft = side < 0 ? J.footL : J.footR, sw = Math.sin(PI * Math.pow(ps, 1.45)), out = smin(-smin(-side * (ft[0] + side * 0.10 - t[0]), 0, 0.04), 0.12, 0.06);
        const rb = Math.sqrt(Math.max(PL * PL - Math.pow(t[1] + 0.015, 2), 0) + 0.02);     // (how far out the tip has to pass, with the hand at its highest)
        t = v3.add(t, [side * out * ps, 0.06 * sw, 0]);
        const x1 = side * Math.max(side * t[0] + 0.08, side * ft[0] + 0.17), dx = x1 - t[0], ty = lerp(0.02, DP.TIPY, pin);
        t[1] -= smooth(0.62, 1, ps) * clamp(t[1] - ty - Math.sqrt(Math.max(PL * PL - dx * dx - 0.09, 0.25)), 0, 0.10);
        const dy = Math.max(t[1] - ty, 0.2), dz = Math.sqrt(Math.max(PL * PL - dy * dy - dx * dx, 0.04));
        const dq = v3.norm(v3.add(swingTo(d, v3.norm([dx, -dy, -dz]), ps, v3.norm([side * 0.45, -0.89, 0])), [side * 0.85 * rb / PL * sw, 0, 0]));      // (the swing)
        if (pp && !pp.d) { tipT = [pp.T[0], DP.TIPY, pp.T[1]]; const dv = v3.sub(t, tipT), l = v3.len(dv); hp = v3.mul(dv, Math.max(PL - 0.04 - l, 0) / l); t = v3.add(t, hp); d = v3.norm(v3.sub(tipT, t)); planted = 1; low = 1; deep = 1; }
        else if (pp) { if (pp.h) t = v3.mad(t, pp.h, 1 - pp.w); d = nlerp(pp.d, nlerp(d, dq, pp.g), pp.w); low = lerp(1 - pp.w, pin, pp.g); deep = 1 - pp.w; }
        else { d = dq; low = pin; }
      }
      // double-pole stroke
      if (dpw > 0) {
        const nT = t, nD = d, k = side < 0 ? 0 : 1, C0 = dpLocus(0, side, lean, dpy), tx = side * Math.max(side * C0[0] + 0.05, stance / 2 + 0.24);   // (where the snow is thrown up for it: Spray.poles)
        const T0 = [tx, DP.TIPY, C0[2] + Math.sqrt(Math.max(0.01, PL * PL - Math.pow(C0[1] - DP.TIPY, 2) - Math.pow(tx - C0[0], 2)))];
        let g2, d2;
        if (f < DP.PLANT) {
          // reach: hands swing forward and up, the tips swing forward low over the snow to where they will go in
          g2 = spl([[0, nT], [0.11, tip(side * 0.25, 1.33 + dpy, -0.49, lean)], [DP.PLANT, C0], [0.34, dpLocus(0.3, side, lean, dpy)]], f);
          // (新求解器: one path through the whole stroke, meeting what comes before and after it at the same place and the same speed.
          // - a stroke that follows another does not start from the resting hand: the recovery before it never went there, it came on
          //   forward and up through dpW at dpV, and the reach goes on from there (measured 2026-11-18: the hand came back to rest for one
          //   frame between strokes and left again at 6 cm a frame);
          // - it comes to the plant already going as the hand will go once the snow has the tip, which is as fast as the body is passing
          //   the pole: pressed onto it, not stopped by it. From a standing start, when that is hardly at all, the hands do not go up so high)
          // (...and the top of the reach is where a hand that is to arrive like that comes from: ahead of the plant and above it by what it will be
          // doing after, so the hands are thrown forward and are already coming back and down as the tips go in; and 4 cm above that, to press down
          // into the snow. Never more than 14 cm so: the rest of the difference is taken up over the way down. From a standing start, when the hand
          // will hardly move once the tip is in, that is hardly any lift at all. Before: one place, 28 cm up, whatever the speed)
          if (sec.gnd) { const A = 0.11, hh = DP.PLANT - A, vb = Math.max(sec.vb || 0, 0), c = sec.dpc || 0, wp = dpWrap(nT, side, lean, dpy), S0 = v3.lerp(nT, wp.W, c), dq = 0.02, e = 1e-3;
            const uA = Math.min(1, dpSolveU([T0[0], T0[1], T0[2] + vb * DP.T * dq], side, lean, dpy, PL)), vA = v3.mul(v3.sub(dpLocus(uA, side, lean, dpy), C0), 1 / dq);
            const of = v3.mul(vA, 2 * hh / 3), ol = v3.len(of), H = v3.add(v3.sub(v3.mad(C0, v3.sub(C0, S0), -hh / 3 / DP.PLANT), v3.mul(of, ol > 0.14 ? 0.14 / ol : 1)), [0, 0.04, 0]);
            const KR = [[0, S0], [A, H], [DP.PLANT, C0], [0.34, dpLocus(0.3, side, lean, dpy)]];
            g2 = spl(KR, f);
            const v1 = v3.mul(v3.sub(C0, spl(KR, DP.PLANT - e)), 1 / e);
            if (f < A) { const q = f / A; g2 = v3.mad(g2, wp.V, c * A * q * (1 - q) * (1 - q)); }
            else { const q = (f - A) / hh; g2 = v3.mad(g2, v3.sub(vA, v1), hh * q * q * (q - 1)); } }
          const s = smooth(0, DP.PLANT, f), n0 = v3.mad(nT, nD, PL), tp = v3.lerp(n0, T0, s); tp[1] += 0.10 * Math.sin(PI * s) * (1 - s * 0.3);
          // (新求解器: and the tip comes to the snow standing still over it, which, seen from a body going forward, is going backward as fast as the body
          // goes: swung a little further ahead on the way and brought back. Come to rest beside the skier and then held by the snow, the pole
          // turned 2.5 degrees more in that frame than in the one before)
          if (sec.gnd) { const q = f / DP.PLANT; tp[2] += Math.max(sec.vb || 0, 0) * DP.T * DP.PLANT * q * q * (q - 1); }
          d2 = v3.norm(v3.sub(tp, g2)); if (f > DP.PLANT - 0.03) { planted = smooth(DP.PLANT - 0.03, DP.PLANT, f); tipT = T0; }
          if (sec.gnd) low = smooth(DP.PLANT - 0.10, DP.PLANT, f);      // (新求解器: the tip is let down to the snow over the last six frames of its way there. Kept 3.5 cm above it until the last two, as any pole not being planted is, it dropped in at 2.5 degrees of pole a frame)
        } else {
          // the tip stays where it went in (the snow holds it: its place is tracked in the world, or assumed from a usual gliding speed when
          // there is no history) and the hand rides the shaft down and back as the body goes past; then the pole is let go to trail
          const rel = dpRel, held = f < rel;
          const T = dpd && dpd.T ? [dpd.T[k * 2], DP.TIPY, dpd.T[k * 2 + 1]] : [T0[0], T0[1], T0[2] + (sec.gnd ? Math.max(sec.vb || 0, 0) : DP.V) * DP.T * (Math.min(f, rel) - DP.PLANT)];      // (新求解器: at the speed the body is really going, not a usual one: the frame the tip went in, the hand was a centimetre off where the next frame found it)
          const raw = dpSolveU(T, side, lean, dpy, PL), u = dpd && !held ? dpd.u[k] : Math.min(raw, 1), gu = dpLocus(u, side, lean, dpy), du = v3.norm(v3.sub(T, gu));
          Tm = T; uo = u; ur = raw;
          if (held) { g2 = gu; d2 = du; planted = 1; tipT = T; }
          else {
            // let go: the hands carry on back as fast as they were going and swing out behind the hips, the poles flick up to trail, then
            // everything comes forward again. A stroke that never got far (hardly any glide under it) has no such follow-through: it just recovers
            // (from where the hand really was when it let go: body and reach may have kept it off its path)
            const q = (f - rel) / (1 - rel), w = smooth(0.35, 0.85, u), g0 = dpd && dpd.g ? [dpd.g[k * 3], dpd.g[k * 3 + 1], dpd.g[k * 3 + 2]] : gu; low = 1 - smooth(0, 0.16, q);
            const fin = v3.lerp(g0, tip(side * 0.27, 0.77 + dpy, 0.21, lean), (0.3 + 0.7 * u) * w), mid = v3.lerp(v3.lerp(g0, nT, 0.45), tip(side * 0.295, 0.80 + dpy, -0.06, lean), (0.4 + 0.6 * u) * w);
            let vel;      // (how fast the hand was going when it let go, per unit of phase)
            if (dpd && dpd.v) vel = [dpd.v[k * 3], dpd.v[k * 3 + 1], dpd.v[k * 3 + 2]];
            else { const e = 0.02, Tb = [T[0], T[1], T[2] - DP.V * DP.T * e]; vel = v3.mul(v3.sub(gu, dpLocus(Math.min(dpSolveU(Tb, side, lean, dpy, PL), 1), side, lean, dpy)), 1 / e); }
            // (新求解器: let go, the hand goes on the way it was going, on the end of its arm: round the shoulder, back and up behind the hip, slowing
            // evenly to its turn, so the faster the stroke the further behind it swings; then it comes forward, and on into the next reach if there
            // is one (dpW), or to rest. Before, the hand was sent to one place behind the hip however fast it was going: at 5 m/s it went from
            // 4 cm a frame down to 2 cm a frame up in two frames)
            // (all of it reckoned from the shoulder as it was at the moment of letting go, and carried with the shoulder since: the arm swings, in its
            // own plane fore and aft, and the trunk coming up carries it. Reckoned from where the shoulder is now, the swing was a different one each frame)
            if (sec.gnd) { const s0 = dpd && dpd.s ? [dpd.s[k * 3], dpd.s[k * 3 + 1], dpd.s[k * 3 + 2]] : sh, vS = dpd && dpd.vs ? [dpd.vs[k * 3], dpd.vs[k * 3 + 1], dpd.vs[k * 3 + 2]] : [0, 0, 0];
              const G0 = v3.add(g0, v3.sub(sh, s0)), vR = v3.sub(vel, vS), dx = g0[0] - s0[0], rS = [0, g0[1] - s0[1], g0[2] - s0[2]], rl = v3.len(rS) || 1, rn = v3.mul(rS, 1 / rl), vr = v3.dot(vR, rn);
              const vt = [0, vR[1] - vr * rn[1], vR[2] - vr * rn[2]], sp = v3.len(vt), th = Math.min(sp * 0.14 / 1.5 / rl, 0.8), qc = clamp(sp > 1e-6 ? th * rl * 1.5 / sp / (1 - rel) : 0.24, 0.15, 0.5);      // (as far round as it takes to lose its speed with the slowing coming on from nothing: two thirds of the way it would have gone at full speed, in about a seventh of a stroke; never past 45 degrees, sooner there if it is going faster)
              const rF = Math.min(Math.max(Math.sqrt(Math.max(reach * reach - dx * dx, 0.01)) - 0.005, rl), rl + Math.max(vr, 0) * (1 - rel) * qc / 3);      // (and out as far as the speed it still has away from the shoulder takes it, within the arm's length)
              const fc = sp > 1e-6 ? v3.add([G0[0], sh[1], sh[2]], v3.add(v3.mul(rn, rF * Math.cos(th)), v3.mul(vt, rF / sp * Math.sin(th)))) : G0, m = sec.dpmv || 0, wp = dpWrap(nT, side, lean, dpy);
              // (forward again as it went back, on a long arm: it passes under its shoulder four fifths of an arm below it, and only then comes up. Brought
              // straight up to the next reach from behind, or past a place by the hip that the shoulder of a folded trunk was 25 cm ahead of, the hand came
              // close under its shoulder while still behind it, and the elbow stood up above the shoulder. A little over half way through what is left)
              const md = v3.lerp(v3.lerp(fc, nT, 0.45), [sh[0] + side * 0.11, sh[1] - 0.82 * reach, sh[2] + 0.03], (0.4 + 0.6 * u) * w), qm = qc + (1 - qc) * 0.52;
              g2 = spl([[-0.3, v3.mad(fc, vR, -(1 - rel) * (qc + 0.3))], [0, G0], [qc, fc], [qm, md], [1, v3.lerp(nT, wp.W, m)]], q);
              if (dpd && dpd.h) relH = v3.mul([dpd.h[k * 3], dpd.h[k * 3 + 1], dpd.h[k * 3 + 2]], (1 - smooth(0, 0.4, q)) * dpw);
              if (q > qm) { const r = (q - qm) / (1 - qm); g2 = v3.mad(g2, wp.V, m * (1 - rel) * (1 - qm) * r * r * (r - 1)); } }
            else
            g2 = spl([[-0.3, v3.mad(fin, vel, -(1 - rel) * 0.54)], [0, g0], [0.24, fin], [0.62, mid], [1, nT]], q);
            const dR = dpd && dpd.d ? [dpd.d[k * 3], dpd.d[k * 3 + 1], dpd.d[k * 3 + 2]] : du, trail = nlerp(nlerp(dR, nD, 0.3), v3.norm(tip(side * 0.06, -0.26, 0.96, lean)), w);
            d2 = q < 0.3 ? nlerp(dR, trail, smooth(0, 0.3, q)) : nlerp(trail, nD, smooth(0.3, 1, q));
          }
        }
        t = v3.lerp(nT, g2, dpw); d = nlerp(nD, d2, dpw); planted *= dpw; low = Math.max(low * dpw, planted);
      }
      // grab: the hand goes down the outside of the shin and takes the ski by its edge just ahead of the toe piece
      if (g > 0) { const ft = side < 0 ? J.footL : J.footR, b = side < 0 ? fbl : fbr, tg = v3.add(ft, fr(b, side * 0.092, 0.036, -0.335)); t = v3.lerp(t, tg, g); d = nlerp(d, v3.norm(fr(b, side * 0.30, 0.20, 0.93)), g); }
      // nothing goes through the body: the fist is kept outside legs, hips and trunk, then within reach of the shoulder
      // (...nor so close to it that the arm has nowhere to fold: it gives way forward and down, the more the closer it is pressed)
      const inReach = q => { const dv = v3.sub(q, sh), l = v3.len(dv); return l > reach ? v3.mad(sh, dv, reach / l) : l < 0.21 ? v3.mad(sh, v3.norm(v3.add(dv, v3.mul(fr(hl, side * 0.02, -0.02, -0.03), sat((0.21 - l) / 0.05)))), 0.21) : q; };
      if (t[1] < 0.09) t[1] = 0.09 + (t[1] - 0.09) * 0.2;
      t = inReach(t); if (g < 1) { const q = sec.gnd ? clearOf(t, 0.062) : pushOut(pushOut(t, 0.062, side), 0.062, side); t = inReach(g > 0 ? v3.lerp(q, t, g) : q); }
      // (kept off its path like that, a hand on a planted pole would drag the tip through the snow. A little of it the wrist takes up, the hand keeping
      // to the pole; more, and the pole has already been let go: see below)
      // (the fist the same, where it sits against its shoulder: a rule handing over to another moved it a few centimetres in a frame. Not on a
      // planted pole, nor in a stroke, where the hand is the pole's)
      { const hq = sec.pf ? sec.pf[side < 0 ? 0 : 1] : null;
        if (hq) { if (hq.hn !== sec.pfN) { hq.hp = hq.ho; hq.hn = sec.pfN; } const r = v3.sub(t, sh), wv = (1 - planted) * (1 - dpw);
          if (hq.hp && sec.pfDt > 0 && wv > 0) t = v3.add(sh, v3.lerp(r, v3.lerp(hq.hp, r, 1 - Math.exp(-sec.pfDt / 0.04)), wv)); hq.ho = v3.sub(t, sh); } }
      let slip = 0; const tb = t;
      // (新求解器: held on a planted pole the hand is kept a pole's length from the tip, whatever body and reach had done to it: hk, how far that moved it.
      // Let go, it is not dropped in a frame: the recovery starts with it and lets it go over its first part. Measured 2026-11-18: 4 cm in the frame of release)
      if (relH) t = v3.add(t, relH);
      // (新求解器: 0.999. Eased in, the stroke's weight ends at 0.99999998 and never at 1: none of this was ever done in a stroke)
      if (planted >= (sec.gnd ? 0.999 : 1) && tipT) { const dv = v3.sub(t, tipT), l = v3.len(dv), k = 1 - smooth(0.02, 0.03, Math.abs(l - PL)); t = v3.lerp(t, v3.mad(tipT, dv, PL / l), k);
        const ds = v3.sub(t, sh), ls = v3.len(ds); if (ls > reach) t = v3.mad(sh, ds, reach / ls); slip = Math.abs(v3.len(v3.sub(t, tipT)) - PL); if (dpw > 0) hk = v3.sub(t, tb); }
      // elbows hang: down and a little out and back, never winged out sideways
      // (down when the arm reaches forward, back when it hangs, out when it is stretched behind: each counts for as much as it is square to the arm)
      const ax = v3.norm(v3.sub(t, sh)), sq = (v, w) => { const q = v3.sub(v, v3.mul(ax, v3.dot(v, ax))); return v3.mul(q, w * v3.dot(q, q)); };
      // (in a double-pole stroke the hand goes back past the hip and comes forward again under the shoulder. "Down" is square to an arm that points
      // back, so the elbow swung round under it within three frames, and round again on the way forward: there the elbow stays above and behind the arm,
      // where the drive left it. kb: how far the hand of a stroke is behind its shoulder)
      // (新求解器: ...and it goes there over more of the way: begun a little before the hand is under the shoulder and done further behind it. Over
      // the 0.45 alone, a hand going back fast took the elbow round in two frames, 4 cm a frame)
      const kb = dpw > 0 ? dpw * (sec.gnd ? smooth(-0.3, 0.8, v3.dot(ax, hl.Z)) : smooth(0, 0.45, v3.dot(ax, hl.Z))) : 0;
      const ep = v3.add(v3.add(sq(kb > 0 ? fr(hl, side * lerp(0.25, 0.08, kb), lerp(-1, 1, kb), 0.25) : fr(hl, side * 0.25, -1, 0.25), 1), sq(fr(hl, 0, 0, 1), 0.35)), sq(fr(hl, side, 0, 0.2), lerp(0.15, 0.10, tuck)));
      let e = ik2(sh, t, LEN.uarm, LEN.farm + LEN.grip, ep);
      if (sec.gnd) {
        // (新求解器: shoulder and fist given, the elbow lies on a circle. It starts where it hangs by itself and is turned along the circle, once, to the
        // clearance it is owed: nothing if it is clear by 4 cm, 2 cm kept if it is touching, evenly between)
        const cc = v3.mad(sh, ax, v3.dot(v3.sub(e, sh), ax)), u0 = v3.sub(e, cc), rho = v3.len(u0);
        if (rho > 1e-4) { const u = v3.mul(u0, 1 / rho), w = v3.cross(ax, u), at = th => v3.add(cc, v3.add(v3.mul(u, rho * Math.cos(th)), v3.mul(w, rho * Math.sin(th)))), G = th => { const q = at(th); return smin(bodyD(q, 7) - 0.055, bodyD(v3.lerp(q, t, 0.45), 7) - 0.05, 0.02); };      // (the elbow, and the forearm a little below it)
          const g0 = G(0), M = 0.005, Bd = 0.02, T = g0 >= M + Bd ? g0 : g0 <= M - Bd ? M : g0 + (M + Bd - g0) * (M + Bd - g0) / (4 * Bd);
          // (never turned further than the clearance asked for would take it straight out: where turning hardly clears it, it is left nearly where it
          // hangs. Turned as far as it took, an elbow lying along a thigh went 5 cm out and came back in one frame)
          // (and the less, the less turning helps: where turning either way clears it equally the elbow stays where it hangs, so it never has two ways
          // to go and one frame to choose in. Measured 2026-11-18: choosing by the sign alone, 39 more arm jolts in one run of deep turns)
          if (T > g0 + 1e-5) { let th = 0, g = g0; const lam = rho * 0.4, d0 = (G(0.02) - G(-0.02)) / 0.04, lim = Math.min(T - g0, 0.03) / (rho * 0.8) * Math.abs(d0) / Math.sqrt(d0 * d0 + lam * lam);
            for (let it = 0; it < 3; it++) { const dg = (G(th + 0.02) - G(th - 0.02)) / 0.04; th = clamp(th + (T - g) * dg / (dg * dg + lam * lam), -lim, lim); g = G(th); if (g >= T - 1e-4) break; }
            e = at(th); } }
      } else
      { const q = pushOut(e, 0.055, side, 7); if (q !== e) e = ik2(sh, t, LEN.uarm, LEN.farm + LEN.grip, v3.sub(q, v3.lerp(sh, t, 0.5))); }
      if (planted > 0 && tipT) d = nlerp(d, v3.norm(v3.sub(tipT, t)), planted);
      // (a pole on its way to the plant brushes past its own leg: it gives way round it, the nearest way out, and does not wait behind it)
      if (plant > 0 && planted < 1) { const w = smooth(0, 0.15, plant); for (let it = 0; it < 3; it++) for (let i = side < 0 ? 0 : 1; i < 4; i += 2) { const cp = caps[i], r = segSeg(v3.mad(t, d, 0.15), v3.mad(t, d, PL), cp[0], cp[1]), dv = v3.sub(r[0], r[1]), dl = v3.len(dv), R = lerp(cp[2], cp[3], r[3]) + 0.031;
        if (dl < R && dl > 1e-3) d = v3.norm(v3.sub(v3.mad(r[0], dv, (R - dl) / dl * w), t)); } }
      // ...and neither does the shaft: where it would cut a leg, the hips or the trunk it is swung outward and up, toward a direction that is
      // always free (out past the hip, behind and above), and only as far as it takes to come clear
      if (planted < 1 && shaftGap(t, d) < 0) {
        // (folded up small and laid right over, the inside knee stands out past the hand and bars that way too: then up and out over it, or straight up behind)
        let safe = v3.norm(v3.sub(v3.add(pel, fr(pb, side * 0.75, 0.25, 0.55)), t)), sg = shaftGap(t, safe); const N = 8; let b0 = 1, b1 = 1;
        if (sg < 0) for (const q of [fr(hl, side * 0.40, 0.25, 0.88), fr(hl, side * 0.30, 0.60, 0.74), [0, 0.86, 0.5]]) { const qn = v3.norm(q), qg = shaftGap(t, qn); if (qg > sg) { safe = qn; sg = qg; } if (sg >= 0) break; }
        for (let i = 1; i <= N; i++) if (shaftGap(t, nlerp(d, safe, i / N)) >= 0) { b1 = i / N; b0 = (i - 1) / N; break; }
        for (let i = 0; i < 7 && b1 > b0; i++) { const m = (b0 + b1) / 2; if (shaftGap(t, nlerp(d, safe, m)) >= 0) b1 = m; else b0 = m; }
        d = nlerp(d, safe, b1 * (1 - planted) * (sec.gnd ? 1 - tkw : 1));      // (新求解器: not in a tuck, where the shaft lies against the ribs under the arm by design)
      }
      // (what the pole does is worked out afresh each frame from many rules (the swing to the plant, clear of the legs, clear of the body, trailing),
      // and where one of them takes over from another the shaft could swing round in a single frame: a twitch of the pole the eye catches at once.
      // So, while the snow does not have it, the pole's direction follows what is worked out over a twentieth of a second (sec.pf, kept by update; a
      // second solve of the same frame starts from the same place). Never past it: there is nothing here to swing back)
      if (tuck > 0 && sec.gnd) { tkw = tkw0 * tkIn(t); d = nlerp(d, v3.norm(v3.sub(pit, t)), tkw * (1 - planted) * (1 - g)); }      // (from where the fist ended up)
      const pf = sec.pf ? sec.pf[side < 0 ? 0 : 1] : null;
      if (pf) { if (pf.n !== sec.pfN) { pf.p = pf.o; pf.n = sec.pfN; } if (pf.p && sec.pfDt > 0 && planted < 1) d = slerp(pf.p, d, lerp(1 - Math.exp(-sec.pfDt / 0.05), 1, planted)); pf.o = d; }
      // (新求解器: and outside its own ski: the basket trails at least 15 cm clear of the ski's edge, measured across the ski as it lies on the snow. With the
      // legs laid over in a turn the outside ski runs far out from under the body, and a pole that only kept clear of the leg trailed across its tail)
      if (sec.gnd && planted < 1 && g < 1 && tuck < 1) { const ft = side < 0 ? J.footL : J.footR, bX = (side < 0 ? fbL : fbR).X, xl = Math.hypot(bX[0], bX[2]) || 1, xh = [bX[0] / xl, 0, bX[2] / xl], tp = v3.mad(t, d, PL), o = side * v3.dot(v3.sub(tp, ft), xh);
        d = nlerp(d, v3.norm(v3.sub(v3.mad(tp, xh, side * (-smin(-o, -0.21, 0.06) - o)), t)), (1 - planted) * (1 - g) * (1 - tuck) * (1 - air)); }
      // (and the tip never goes under the snow, except to be planted)
      { const sy = clamp((lerp(0.035, DP.TIPY, low) - 0.045 * deep - t[1]) / PL, -1, 1); if (d[1] < sy) { const hz = Math.hypot(d[0], d[2]), k = Math.sqrt(1 - sy * sy) / (hz || 1); d = hz > 1e-6 ? [d[0] * k, sy, d[2] * k] : [0, sy, Math.sqrt(1 - sy * sy)]; } }
      return { w: t, e, d, planted, T: Tm, u: uo, ur, slip, hp, hk };
    };
    let hL = hand(-1), hR = hand(1);
    if (dpd && dpd.g && f < dpRel && Math.max(hL.slip, hR.slip) > 1e-4) { dpRel = dpd.gf; dpOut = true; hL = hand(-1); hR = hand(1); }
    J.dpHL = hL.hk; J.dpHR = hR.hk; J.gripL = hL.w; J.elbowL = hL.e; J.gripR = hR.w; J.elbowR = hR.e; J.poleDL = hL.d; J.poleDR = hR.d;
    J.wristL = v3.mad(J.elbowL, v3.norm(v3.sub(J.gripL, J.elbowL)), LEN.farm); J.wristR = v3.mad(J.elbowR, v3.norm(v3.sub(J.gripR, J.elbowR)), LEN.farm);
    // (the lab's arms, except while a pole is being planted or held in the snow, or in a double-pole stroke: those are the game's own)
    if (!(L && L.w > 0)) { ez(sec, 'wa0', 0, 18); ez(sec, 'wa1', 0, 18); }
    // (mo2 b, 07_game.js: whoever moves the hand last keeps the rules that hang on it. The lab's hand is carried on the outer side of its own
    // leg's plane, 0.17 m clear of it, the rule hand() keeps above; and the pole is aimed again from the hand where it ended up, at the tip
    // hand() had found for it, which is outside the body and above the snow already. Before, the hand moved and the pole kept its old
    // direction: the shaft went through the thigh in four on-snow frames of ten)
    const MO2 = typeof Variants !== 'undefined' && Variants.val.mo2 === 'b';
    if (L && L.w > 0) for (let k = 0; k < 2; k++) { const sd = k ? 'R' : 'L', h = k ? hR : hL, side = k ? 1 : -1;
      const wa = ez(sec, 'wa' + k, L.w * (1 - Math.max(sat((k ? p.plantR : p.plantL) * 1.5 || 0), sat(h.planted * 2))) * (1 - dpw) * (sec.gnd ? 1 - smooth(0, 0.3, tuck) : 1), 18); if (!(wa > 1e-4)) continue;      // (新求解器: nor in a tuck: there the fists and the shafts have their one place, hand()'s, and a second pair of arms mixed in held them out of it through the whole way down)      // (handed over eased, never in a frame)
      const sh = J['sh' + sd], le = v3.mad(sh, L.ua[k], LEN.uarm); let lg = pushOut(v3.mad(le, L.fa[k], LEN.farm + LEN.grip), 0.045, side);
      if (MO2) { const hpS = k ? hipR : hipL, anS = k ? J.ankleR : J.ankleL, lgV = v3.sub(hpS, anS), nlq = v3.norm([side * lgV[1], -side * lgV[0], 0]), oq = v3.dot(v3.sub(lg, anS), nlq); lg = v3.mad(lg, nlq, -smin(-oq, -0.17, 0.06) - oq); }
      const e = v3.mad(sh, v3.norm(v3.sub(v3.lerp(J['elbow' + sd], le, wa), sh)), LEN.uarm), g = v3.mad(e, v3.norm(v3.sub(v3.lerp(J['grip' + sd], lg, wa), e)), LEN.farm + LEN.grip);
      const g0 = J['grip' + sd]; J['elbow' + sd] = e; J['grip' + sd] = g; h.e = e; h.w = g;
      // (the pole trails from the hand where it is now; its tip kept a little off the snow)
      // (tried 2026-11-18: the shaft carried with the hand on hand()'s own line (d = h.d) took the corner at edge changes away (4.6 -> under 4
      // deg/frame^2), and put the shaft through the legs and the basket onto its own ski's tail: Mac round 21, pole x leg 106 -> 824 frames,
      // pole x ski 0 -> 61. Not kept: the tip aimed at stays the one hand() cleared of leg and ski)
      let d = (MO2 || sec.gnd) && h.planted < 1 ? v3.norm(v3.sub(v3.mad(g0, h.d, PL), g)) : h.d; if (sec.gnd) { const ty = g[1] + d[1] * PL, ty2 = -smin(-ty, -0.03, 0.06);      // (新求解器: the tip is eased onto its 3 cm over the snow, not stopped there: where it came down onto the limit and left it again the shaft turned a corner, a jolt at every edge change)
        if (ty2 > ty + 1e-5) { const hz = Math.hypot(d[0], d[2]) || 1, dy = clamp((ty2 - g[1]) / PL, -1, 1), k2 = Math.sqrt(1 - dy * dy) / hz; d = [d[0] * k2, dy, d[2] * k2]; } }
      else if (g[1] + d[1] * PL < 0.03) { const hz = Math.hypot(d[0], d[2]) || 1, dy = clamp((0.03 - g[1]) / PL, -1, 1), k2 = Math.sqrt(1 - dy * dy) / hz; d = [d[0] * k2, dy, d[2] * k2]; }
      h.d = d; J['poleD' + sd] = d; }
    J.wristL = v3.mad(J.elbowL, v3.norm(v3.sub(J.gripL, J.elbowL)), LEN.farm); J.wristR = v3.mad(J.elbowR, v3.norm(v3.sub(J.gripR, J.elbowR)), LEN.farm);
    J.tipL = v3.mad(J.gripL, hL.d, PL); J.tipR = v3.mad(J.gripR, hR.d, PL); J.plantedL = hL.planted; J.plantedR = hR.planted;
    // ---- frames
    F[B.pelvis] = m4.fromBasis(pb.X, pb.Y, pb.Z, pel);
    F[B.spine] = frameXY(pel, v3.sub(J.chest, pel), v3.add(pb.X, t1.X));
    F[B.chest] = frameXY(J.chest, v3.sub(J.neck, J.chest), t2.X);
    F[B.neck] = frameXY(J.neck, nY, v3.add(t2.X, hb.X));
    F[B.head] = m4.fromBasis(hb.X, hb.Y, hb.Z, J.skull);
    const limb = (i0, a, b, c, xh) => { const ax = v3.cross(v3.sub(b, a), v3.sub(c, b)); const hx = v3.len(ax) > 1e-4 ? v3.norm(ax) : xh; F[i0] = frameXY(a, v3.sub(b, a), hx); F[i0 + 1] = frameXY(b, v3.sub(c, b), hx); return hx; };
    const axL = limb(B.uarmL, J.shL, J.elbowL, J.gripL, [1, 0, 0]); F[B.handL] = frameXY(J.wristL, v3.sub(J.gripL, J.elbowL), v3.cross(v3.sub(J.gripL, J.elbowL), hL.d));
    const axR = limb(B.uarmR, J.shR, J.elbowR, J.gripR, [1, 0, 0]); F[B.handR] = frameXY(J.wristR, v3.sub(J.gripR, J.elbowR), v3.cross(v3.sub(J.gripR, J.elbowR), hR.d));
    limb(B.thighL, hipL, J.kneeL, J.ankleL, [-1, 0, 0]); limb(B.thighR, hipR, J.kneeR, J.ankleR, [-1, 0, 0]);
    F[B.footL] = m4.fromBasis(fbl.X, fbl.Y, fbl.Z, J.footL); F[B.footR] = m4.fromBasis(fbr.X, fbr.Y, fbr.Z, J.footR);
    // (the pole's frame is also the fist's: y up the grip, x out of the back of the hand, z back toward the wrist, the same axes as the first-person
    // glove's hand space (07d_fpv.js), so the glove closed round the grip (Variants 'hand' b) rides on it and opens toward the forearm whichever way
    // the pole swings. The pole itself is round: turning its frame about the shaft changes nothing on it)
    { const rt = [F[B.chest][0], F[B.chest][1], F[B.chest][2]]; const fk = sec.gnd ? smooth(0.15, 0.6, tuck) : 0; F[B.poleL] = fistFrame(J.gripL, J.poleDL, J.wristL, rt, fk); F[B.poleR] = fistFrame(J.gripR, J.poleDR, J.wristR, rt, fk); }
    // (what the stroke did this time: where the tips are held, how far along the hands are, whether a tip has gone out of reach)
    const dp = dpw > 0 && hL.T ? { T: [hL.T, hR.T], u: [hL.u, hR.u], out: dpOut || Math.max(hL.ur, hR.ur) > 1 } : null;
    return { J, F, hb, t1, t2, pb, fbL: fbl, fbR: fbr, caps, c, hinge, up2, dp, hp: [hL.hp, hR.hp], br: ibr };
  }
  // collision shapes of a pose, for looking at (tests)
  K.debugCaps = function (pose) {
    const s = solve(Object.assign({}, P0, pose)), J = s.J, o = [], add = (a, b, ra, rb, col) => o.push({ a, b, ra, rb: rb == null ? ra : rb, col });
    for (const c of s.caps) add(c[0], c[1], c[2], c[3], [0.85, 0.45, 0.2]);
    for (const sd of ['L', 'R']) { add(J['sh' + sd], J['elbow' + sd], 0.06, 0.052, [0.9, 0.5, 0.25]); add(J['elbow' + sd], J['wrist' + sd], 0.052, 0.045, [0.9, 0.55, 0.3]); add(J['grip' + sd], J['grip' + sd], 0.055, 0.055, [0.1, 0.1, 0.1]);
      add(J['grip' + sd], J['tip' + sd], 0.012, 0.008, [0.2, 0.2, 0.25]); const ft = J['foot' + sd], b = sd === 'L' ? s.fbL : s.fbR; add(v3.add(ft, fr(b, 0, 0.01, 0.78)), v3.add(ft, fr(b, 0, 0.01, -0.9)), 0.03, 0.03, [0.1, 0.5, 0.5]); add(v3.add(ft, fr(b, 0, 0.09, 0.08)), v3.add(ft, fr(b, 0, 0.09, -0.15)), 0.055, 0.055, [0.7, 0.7, 0.72]); }
    add(J.shL, J.shR, 0.075, 0.075, [0.85, 0.45, 0.2]); add(J.neck, J.skull, 0.06, 0.06, [0.2, 0.2, 0.3]);
    return o;
  };
  K.solve = solve; K.P0 = P0; K.B = B; K.LEN = LEN; K.fixMesh = m => fixMesh(m);
  // (for the snowboard, 08a_board.js: the same bones, posed by a solver of its own)
  K.basis = basis; K.ik2 = ik2; K.frameXY = frameXY; K.fr = fr; K.SEC0 = SEC0; K.meshBuilder = () => meshBuilder();
  K.boardOn = () => !!(K.solveBoard && Board.on());

  // ---- skin: the bind -> pose matrix of every bone (model space)
  function quat(m) {
    const m00 = m[0], m10 = m[1], m20 = m[2], m01 = m[4], m11 = m[5], m21 = m[6], m02 = m[8], m12 = m[9], m22 = m[10], tr = m00 + m11 + m22;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
    if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  // a helper bone: turned half-way between the two bones that meet at a joint, about that joint (pb: where the joint is in the bind pose, pp: now).
  // Skin near a knee, elbow, hip or shoulder hangs on it, so a deep bend folds round the joint instead of pinching flat
  // (t: not half-way but this far from a's turn to b's; more than 1 = further than b)
  function half(M, i, a, b, pb, pp, t) {
    const qa = quat(M[a]), qb = quat(M[b]), sg = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1, ka = t == null ? 1 : 1 - t, kb = sg * (t == null ? 1 : t);
    let x = ka * qa[0] + kb * qb[0], y = ka * qa[1] + kb * qb[1], z = ka * qa[2] + kb * qb[2], w = ka * qa[3] + kb * qb[3]; const l = Math.hypot(x, y, z, w) || 1; x /= l; y /= l; z /= l; w /= l;
    const m = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0, 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0, 2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
    m[12] = pp[0] - (m[0] * pb[0] + m[4] * pb[1] + m[8] * pb[2]); m[13] = pp[1] - (m[1] * pb[0] + m[5] * pb[1] + m[9] * pb[2]); m[14] = pp[2] - (m[2] * pb[0] + m[6] * pb[1] + m[10] * pb[2]);
    M[i] = m;
  }
  function skinMats(s) {
    const M = new Array(K.NB), F = s.F, bj = bind.J, j = s.J;
    for (let i = 0; i < 18; i++) M[i] = m4.mul(F[i], invBind[i]);
    M[B.neck] = m4.mul(F[B.neck], invBind[B.neck]);
    half(M, B.kneeL, B.thighL, B.shinL, bj.kneeL, j.kneeL); half(M, B.kneeR, B.thighR, B.shinR, bj.kneeR, j.kneeR);
    half(M, B.elbowL, B.uarmL, B.farmL, bj.elbowL, j.elbowL); half(M, B.elbowR, B.uarmR, B.farmR, bj.elbowR, j.elbowR);
    half(M, B.seatL, B.pelvis, B.thighL, bj.hipL, j.hipL); half(M, B.seatR, B.pelvis, B.thighR, bj.hipR, j.hipR);
    half(M, B.shL, B.chest, B.uarmL, bj.shL, j.shL); half(M, B.shR, B.chest, B.uarmR, bj.shR, j.shR);
    // (the back of the jacket hangs from the shoulders: as the trunk folds forward over the hips the back grows longer and takes the hem up with it, round
    // the seat and no further from it than it stood: turned about the middle of the seat, by as much more than the trunk as the seat is rounder than the back)
    half(M, B.tail, B.pelvis, B.spine, bind.seatC, m4.tp(F[B.pelvis], SEATC), 1.4);
    // (and it is cloth: the back hem swings out from the seat and to the sides about the small of the back, in the pelvis's own frame: see hem in update)
    if (s.hem && (s.hem[0] || s.hem[1])) { const a = -s.hem[0], b = s.hem[1], ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), pv = HEMP;
      const R = m4.mul([1, 0, 0, 0, 0, ca, sa, 0, 0, -sa, ca, 0, 0, 0, 0, 1], [cb, sb, 0, 0, -sb, cb, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      R[12] = pv[0] - (R[0] * pv[0] + R[4] * pv[1] + R[8] * pv[2]); R[13] = pv[1] - (R[1] * pv[0] + R[5] * pv[1] + R[9] * pv[2]); R[14] = pv[2] - (R[2] * pv[0] + R[6] * pv[1] + R[10] * pv[2]);
      M[B.tail] = m4.mul(M[B.tail], m4.mul(bind.F[B.pelvis], m4.mul(R, invBind[B.pelvis]))); }
    // (a breath drawn: the ribs open, more from front to back than across)
    if (s.br) M[B.chest] = m4.mul(m4.mul(F[B.chest], [1 + 0.018 * s.br, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 + 0.035 * s.br, 0, 0, 0, 0, 1]), invBind[B.chest]);
    return M;
  }
  K.skin = function (pose, sec) { const q = Object.assign({}, P0, pose), s = K.boardOn() ? K.solveBoard(q, sec) : solve(q, sec); return { M: skinMats(s), J: s.J, s }; };

  // ---- body: a distance field built on the bind-pose joints, in the bones' own frames (+z of trunk, head, leg and foot frames is the back of the body).
  // What makes it read as a skier from behind: shoulders a quarter wider than the hips; a jacket that hangs from chest and seat and ends in a hem that
  // stands off the trousers; a seat that is two rounded masses with the thighs leaving below them; thighs that taper to the knee; shell trousers that
  // widen again to go over the boot cuff and end in a hem; a boot that is a long shell on a plate between a toe piece and a heel piece
  // (the pack, in the chest's frame: a rounded box, a lid, a front pocket: centre, half-sizes or radii, rounding; k: how softly they run into each other.
  // The distance field is built from these and the fragment shader draws the pack's outline from the same numbers)
  const SEATC = [0, -0.085, 0.052];
  // (the new body's head, in the helmet's own frame (x right, y up, -z forward, from about the middle of the helmet): shell longer front to back, a
  // brim over the forehead, a vent ridge along the top, ear covers, the face opening cut out of it; the goggles a curved band round the front, wider than
  // the face (axis of the curve gz, radius gr, half-thickness gt, half-height gh, reaching ga radians round each side, at height gy); the strap a raised
  // band round the shell at the goggles' height; the face under it all in a gaiter. Written twice: here for the mesh and in init for the shader)
  const HEAD = K.HEAD = { shell: [0, 0.004, 0.014, 0.106, 0.105, 0.133], ear: [0.088, -0.050, 0.020, 0.028, 0.050, 0.054], brim: [0, 0.032, -0.100, 0.080, 0.009, 0.030],
    cut: [0, -0.078, -0.125, 0.074, 0.080, 0.085, 0.024], gy: -0.020, gz: -0.015, gr: 0.114, gt: 0.006, gh: 0.042, ga: 1.2, sh: 0.0145, rim: -0.072, face: [0, -0.028, -0.004, 0.078, 0.088, 0.096], chin: [0, -0.075, -0.040], chinR: 0.064 };
  const Ee = (x, y, z, e) => { const px = (x - e[0]) / e[3], py = (y - e[1]) / e[4], pz = (z - e[2]) / e[5], k0 = Math.sqrt(px * px + py * py + pz * pz), ax = px / e[3], ay = py / e[4], az = pz / e[5], k1 = Math.sqrt(ax * ax + ay * ay + az * az); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(e[3], e[4], e[5]); };
  const sminS = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }, smaxS = (a, b, k) => -sminS(-a, -b, k);
  function headHelmet(a, b, d) {
    const H = HEAD; let h = Ee(a, b, d, H.shell); h = sminS(h, Ee(Math.abs(a), b, d, H.ear), 0.02); h = sminS(h, Ee(a, b, d, H.brim), 0.012); h = sminS(h, smaxS(smaxS(Ee(a, b, d, [H.shell[0], H.shell[1], H.shell[2], H.shell[3] + 0.005, H.shell[4] + 0.005, H.shell[5] + 0.005]), Math.abs(a) - 0.013, 0.006), 0.045 - b, 0.01), 0.006);    // (vent ridge along the top)
    const c = H.cut, qx = Math.abs(a - c[0]) - c[3] + c[6], qy = Math.abs(b - c[1]) - c[4] + c[6], qz = Math.abs(d - c[2]) - c[5] + c[6];
    h = smaxS(h, -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - c[6]), 0.008);       // (the face opening)
    h = smaxS(h, H.rim + 0.25 * Math.max(d, 0) - b, 0.014);      // (the lower edge: a rounded lip clear of the neck and the collar, so the shell does not run into them in a sawtooth crease)
    const sx = H.shell; return Math.min(h, smaxS(Ee(a, b, d, [sx[0], sx[1], sx[2], sx[3] + 0.003, sx[4] + 0.003, sx[5] + 0.003]), Math.abs(b - H.gy) - H.sh, 0.003));    // + the strap, 3 mm proud
  }
  function headGog(a, b, d) {
    const H = HEAD, qz = d - H.gz, r = Math.hypot(a, qz), an = Math.atan2(Math.abs(a), -qz), dx = Math.abs(r - H.gr) - H.gt, dy = Math.abs(b - H.gy) - H.gh, dz = (an - H.ga) * r;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - 0.004;
  }      // (the middle of the seat, in the pelvis's frame: where the two masses of rPelvis are centred)
  const PACK = K.PACK = { box: [0, -0.055, 0.180, 0.122, 0.195, 0.062, 0.055], lid: [0, 0.125, 0.170, 0.112, 0.07, 0.068], pocket: [0, -0.12, 0.250, 0.08, 0.085, 0.018, 0.018], k: [0.035, 0.02] };
  // the gauntlet of the new glove (Variants 'hand' b): how far up the forearm from the wrist its edge stands, its radius there and toward the wrist.
  // (Real ski gloves: a cuff 6-8 cm long over the sleeve, flared a little, cinched by a cord at its edge. The shader draws its edge from the same len)
  const GAUNT = K.GAUNT = { len: 0.072, r0: 0.054, r1: 0.049 };
  function buildBody(bd, nb, sb, hb) {
    const J = bd.J, F = bd.F, sq = Math.sqrt, smin = sd.smin, smax = sd.smax;
    // (the same shapes as in sd, written out with plain square roots: this field is asked for half a million times while the page loads)
    const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; return [a[0], a[1], a[2], dx, dy, dz, 1 / (dx * dx + dy * dy + dz * dz)]; };
    const cap = (x, y, z, s, ra, rb) => { const px = x - s[0], py = y - s[1], pz = z - s[2]; let h = (px * s[3] + py * s[4] + pz * s[5]) * s[6]; h = h < 0 ? 0 : h > 1 ? 1 : h; const ex = px - s[3] * h, ey = py - s[4] * h, ez = pz - s[5] * h; return sq(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h); };
    const ball = (x, y, z, a, r) => { const dx = x - a[0], dy = y - a[1], dz = z - a[2]; return sq(dx * dx + dy * dy + dz * dz) - r; };
    const E = (x, y, z, cx, cy, cz, rx, ry, rz) => { const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = sq(px * px + py * py + pz * pz), ax = px / rx, ay = py / ry, az = pz / rz, k1 = sq(ax * ax + ay * ay + az * az); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); };
    const rbx = (x, y, z, cx, cy, cz, hx, hy, hz, r) => { const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r, ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0, az = qz > 0 ? qz : 0, m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz); return sq(ax * ax + ay * ay + az * az) + (m < 0 ? m : 0) - r; };
    const at = (i, x, y, z) => m4.tp(F[i], [x, y, z]);                                    // a point given in a bone's frame
    const q = [0, 0, 0], loc = (m, x, y, z) => { const dx = x - m[12], dy = y - m[13], dz = z - m[14]; q[0] = dx * m[0] + dy * m[1] + dz * m[2]; q[1] = dx * m[4] + dy * m[5] + dz * m[6]; q[2] = dx * m[8] + dy * m[9] + dz * m[10]; };
    // a tube of elliptical section along a frame's y axis (half-widths ax sideways, az front to back, changing along it), rounded at both ends
    const tube = (x, y, z, y0, y1, ax0, az0, ax1, az1) => {
      let t = (y - y0) / (y1 - y0); t = t < 0 ? 0 : t > 1 ? 1 : t; const rx = ax0 + (ax1 - ax0) * t, rz = az0 + (az1 - az0) * t, dy = y - (y0 + (y1 - y0) * t), px = x / rx, py = dy / rz, pz = z / rz, k0 = sq(px * px + py * py + pz * pz), bx = px / rx, by = py / rz, bz = pz / rz, k1 = sq(bx * bx + by * by + bz * bz);
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, rz);
    };
    // (the same, squarer in section: the skirt of the jacket has to go round both buttocks, not between them)
    const tubeQ = (x, y, z, y0, y1, ax0, az0, ax1, az1) => {
      let t = (y - y0) / (y1 - y0); t = t < 0 ? 0 : t > 1 ? 1 : t; const rx = ax0 + (ax1 - ax0) * t, rz = az0 + (az1 - az0) * t, px = Math.abs(x) / rx, py = (y - (y0 + (y1 - y0) * t)) / rz, pz = Math.abs(z) / rz, r = Math.cbrt(px * px * px + pz * pz * pz);
      return (sq(r * r + py * py) - 1) * (rx < rz ? rx : rz);
    };
    const Fp = F[B.pelvis], Fs = F[B.spine], Fc = F[B.chest], Fh = F[B.head];
    const shlL = seg(at(B.chest, 0, 0.20, 0.004), at(B.chest, -0.155, 0.188, 0.004)), shlR = seg(at(B.chest, 0, 0.20, 0.004), at(B.chest, 0.155, 0.188, 0.004)), colB = seg(at(B.chest, 0, 0.21, 0.006), at(B.chest, 0, 0.235, 0.006));
    const shl = seg(at(B.chest, -0.165, 0.20, 0), at(B.chest, 0.165, 0.20, 0)), col = seg(at(B.chest, 0, 0.21, 0.004), at(B.chest, 0, 0.262, -0.002)), nck = seg(J.neck, v3.mad(J.head, bd.hb.Y, -0.05));
    const arm = [0, 1].map(k => { const s = k ? 'R' : 'L', sh = J['sh' + s], el = J['elbow' + s], wr = J['wrist' + s], gr = J['grip' + s], fd = v3.norm(v3.sub(gr, el));
      return { up: seg(sh, el), upB: seg(v3.lerp(sh, el, 0.10), el), fo: seg(el, v3.mad(wr, fd, -0.03)), gaB: seg(v3.mad(wr, fd, -0.085), v3.mad(wr, fd, 0.005)), ga: seg(v3.mad(wr, fd, -0.05), wr), hu: seg(el, gr), mH: F[k ? B.handR : B.handL],
        gaC: seg(v3.mad(wr, fd, -GAUNT.len), v3.mad(wr, fd, -0.03)), gs: v3.mad(wr, fd, -GAUNT.len), fd, el, cr: v3.norm(v3.sub(fd, v3.norm(v3.sub(el, sh)))) }; });
    const leg = [0, 1].map(k => { const iT = k ? B.thighR : B.thighL, iS = iT + 1, iF = iT + 2, s = k ? 'R' : 'L';
      return { ta: seg(at(iT, 0, 0.03, 0), at(iT, 0, 0.21, -0.016)), tb: seg(at(iT, 0, 0.21, -0.016), at(iT, 0, 0.425, -0.004)), kc: at(iS, 0, 0, -0.03), sa: seg(at(iS, 0, 0.02, 0), at(iS, 0, 0.15, 0.012)), sb: seg(at(iS, 0, 0.15, 0.012), at(iS, 0, 0.365, 0.004)),
        cu: seg(at(iS, 0, 0.25, 0.010), at(iS, 0, 0.425, 0.006)), mS: F[iS], mF: F[iF], h0: seg(J['hip' + s], J['knee' + s]), h1: seg(J['knee' + s], J['ankle' + s]), h2: seg(at(iF, 0, 0.09, 0.25), at(iF, 0, 0.09, -0.27)) }; });
    const g = { jacket: 0, armSide: 0, pants: 0, glove: 0, boot: 0, bind: 0, helmet: 0, gog: 0, buff: 0, pack: 0, q: [0, 0, 0] };
    // -- the body in ten regions; each returns its distance and leaves the distances of its garments behind
    let torsoJ = 0, armJ = 0, armG = 0, legP = 0, legB = 0, ftB = 0, ftN = 0, hdH = 0, hdG = 0, hdB = 0;
    function rTorso(x, y, z) {
      loc(Fp, x, y, z); const hy = q[1], hz = q[2];
      let a = tubeQ(q[0], q[1], q[2] - 0.012, -0.14, 0.02, 0.192, 0.150, 0.186, 0.142);                       // the skirt of the jacket, hanging over hips and seat
      loc(Fs, x, y, z); a = smin(a, tube(q[0], q[1], q[2] - 0.008, 0.02, 0.25, 0.184, 0.138, 0.180, 0.130), 0.05);    // waist
      loc(Fc, x, y, z); const cx = q[0], cy = q[1], cz = q[2];
      a = smin(a, tube(cx, cy, cz - 0.005, 0, 0.17, 0.182, 0.132, 0.170, 0.115), 0.06);                       // chest
      if (nb) {      // (new body: the shoulder line thins toward the arm and a broad trapezius slopes from the collar down to it: no round knob at the shoulder)
        a = smin(a, Math.min(cap(x, y, z, shlL, 0.084, 0.058), cap(x, y, z, shlR, 0.084, 0.058)), 0.06);
        a = smin(a, E(cx, cy, cz, 0, 0.222, 0.016, 0.145, 0.062, 0.085), 0.05);
        a = smin(a, E(cx, cy, cz, 0, 0.09, -0.035, 0.150, 0.10, 0.11), 0.06);                              // chest: a little fuller in front than the waist
      } else {
      a = smin(a, cap(x, y, z, shl, 0.082, 0.082), 0.05);                                                     // shoulder line
      a = smin(a, E(cx, cy, cz, 0, 0.235, 0.012, 0.10, 0.055, 0.075), 0.04);                                  // the slope from neck to shoulders
      }
      a = smax(a, -(hy + 0.082 + 0.026 * sat((hz + 0.02) / 0.14)), 0.014);                                    // hem: just below the hip joints, longer at the back (half the seat shows under it)
      torsoJ = a;
      a = smin(a, nb ? cap(x, y, z, colB, 0.088, 0.080) : cap(x, y, z, col, 0.076, 0.070), nb ? 0.045 : 0.03);   // collar (new body: a high collar up under the helmet, so the head is not a ball on a stick)
      return nb ? smin(a, E(cx, cy, cz, 0, 0.190, 0.078, 0.100, 0.045, 0.040), 0.05) : smin(a, E(cx, cy, cz, 0, 0.20, 0.095, 0.115, 0.07, 0.055), 0.03);    // folded hood (new body: flat, rolled into the collar, not a ball on the nape)
    }
    // the pack lies on the back from the shoulder blades to the small of the back
    const pA = PACK.box, pB = PACK.lid, pC = PACK.pocket;
    function rPack(x, y, z) {
      loc(Fc, x, y, z); const pk = smin(rbx(q[0], q[1], q[2], pA[0], pA[1], pA[2], pA[3], pA[4], pA[5], pA[6]), E(q[0], q[1], q[2], pB[0], pB[1], pB[2], pB[3], pB[4], pB[5]), PACK.k[0]);
      return smin(pk, rbx(q[0], q[1], q[2], pC[0], pC[1], pC[2], pC[3], pC[4], pC[5], pC[6]), PACK.k[1]);    // front pocket
    }
    function rArm(k, x, y, z) {
      const A = arm[k];
      if (nb) {      // (new body: the sleeve tapers from the armpit to the elbow and on to a looser cuff; the glove is a squarish fist with a thumb over the grip)
        // (the two halves of the sleeve run into each other softly in the crook of the arm, where the cloth gathers, but hardly at all round the point of
        // the elbow: a soft blend all round put a ball there 12 mm proud of the forearm, the owner's "a big lump at the elbow", 2026-11-17)
        const ce = (x - A.el[0]) * A.cr[0] + (y - A.el[1]) * A.cr[1] + (z - A.el[2]) * A.cr[2], ke = 0.006 + 0.034 * smooth(-0.02, 0.025, ce);
        const a = smin(cap(x, y, z, A.upB, 0.057, 0.049), cap(x, y, z, A.fo, 0.047, 0.044), ke);
        if (hb) {      // (Variants 'hand' b: only the gauntlet's cuff is the body's, an open tube standing proud of the sleeve with a lip at its edge;
          // the hand itself is the fine glove closed round the grip (gloveMesh), built apart at a finer grid and carried on the pole's frame)
          const ga = smax(cap(x, y, z, A.gaC, GAUNT.r0, GAUNT.r1), -((x - A.gs[0]) * A.fd[0] + (y - A.gs[1]) * A.fd[1] + (z - A.gs[2]) * A.fd[2]), 0.004);
          armJ = a; armG = ga; return smin(a, ga, 0.006);
        }
        loc(A.mH, x, y, z); const qx = q[0], qy = q[1], qz = q[2];
        let gl = smin(cap(x, y, z, A.gaB, 0.057, 0.049),     // (a long gauntlet, its cuff standing over the end of the sleeve)
           rbx(qx, qy, qz, 0, 0.066, 0.004, 0.040, 0.050, 0.045, 0.030), 0.018);
        gl = smin(gl, E(qx, qy, qz, 0, 0.052, -0.040, 0.022, 0.034, 0.019), 0.012);                           // thumb, laid over the top of the grip
        armJ = a; armG = gl; return smin(a, gl, 0.012);
      }
      const a = smin(cap(x, y, z, A.up, 0.068, 0.058), cap(x, y, z, A.fo, 0.058, 0.047), 0.02);
      loc(A.mH, x, y, z); const gl = smin(cap(x, y, z, A.ga, 0.056, 0.052), E(q[0], q[1], q[2], 0, 0.068, 0, 0.044, 0.054, 0.050), 0.02);    // gauntlet over the cuff, fist round the grip
      armJ = a; armG = gl; return smin(a, gl, 0.012);
    }
    function rPelvis(x, y, z) { loc(Fp, x, y, z);
      if (nb) return smin(smin(E(q[0], q[1], q[2], 0, -0.035, 0.005, 0.176, 0.13, 0.12), E(Math.abs(q[0]), q[1], q[2], 0.070, -0.085, 0.036, 0.094, 0.10, 0.074), 0.08), E(q[0], q[1], q[2], 0, -0.088, 0.046, 0.155, 0.092, 0.074), 0.06);    // (baggy shell trousers: the seat is one soft mass, not two balls)
      return smin(E(q[0], q[1], q[2], 0, -0.035, 0.005, 0.172, 0.13, 0.118), E(Math.abs(q[0]), q[1], q[2], 0.082, -0.085, 0.052, 0.092, 0.098, 0.092), 0.045); }
    function rLeg(k, x, y, z) {
      const L = leg[k];
      if (nb) {      // (new body: loose shell trousers: a thigh that tapers to the knee, a soft knee, a leg that falls straight and flares over the boot)
        let d = smin(cap(x, y, z, L.ta, 0.112, 0.100), cap(x, y, z, L.tb, 0.100, 0.086), 0.04);
        d = smin(d, ball(x, y, z, L.kc, 0.054), 0.05);
        let l = smin(cap(x, y, z, L.sa, 0.084, 0.086), cap(x, y, z, L.sb, 0.086, 0.104), 0.04);
        loc(L.mS, x, y, z); l = smax(l, q[1] - 0.368, 0.010);
        d = smin(d, l, 0.04);
        const cu = cap(x, y, z, L.cu, 0.072, 0.068);
        legP = d; legB = cu; return smin(d, cu, 0.012);
      }
      let d = smin(cap(x, y, z, L.ta, 0.108, 0.096), cap(x, y, z, L.tb, 0.096, 0.077), 0.03);                 // thigh: fullest in front a hand below the hip, tapering to the knee
      d = smin(d, ball(x, y, z, L.kc, 0.064), 0.04);                                                          // kneecap
      let l = smin(cap(x, y, z, L.sa, 0.077, 0.082), cap(x, y, z, L.sb, 0.082, 0.096), 0.03);                 // calf, then the trouser leg widening over the boot
      loc(L.mS, x, y, z); l = smax(l, q[1] - 0.355, 0.010);                                                   // trouser hem
      d = smin(d, l, 0.03);
      const cu = cap(x, y, z, L.cu, 0.072, 0.068);                                                            // boot cuff (it leans with the shin)
      legP = d; legB = cu; return smin(d, cu, 0.012);
    }
    function rFoot(k, x, y, z) {
      loc(leg[k].mF, x, y, z); const a = q[0], b = q[1], d = q[2];
      let s = rbx(a, b, d, 0, 0.088, -0.02, 0.052, 0.040, 0.152, 0.032); s = smax(s, (b - 0.150 - 0.33 * (d + 0.02)) * 0.95, 0.02);    // shell, lower over the toes
      s = smin(s, E(a, b, d, 0, 0.135, 0.02, 0.05, 0.06, 0.085), 0.025);                                                               // instep
      // (on a snowboard, sb: no ski binding. A snowboard binding instead: a short baseplate under the sole and two straps, over the toes and
      // across the instep. No highback: modelled apart from the boot it stood up behind the heel as a black slab, the owner's "two boards standing up". The boot keeps its shell: its 30 cm sit on a 26 cm board as a real boot does)
      if (sb) {
        // (a real binding, as on the reference photos: baseplate, a heel cup that runs on up the back of the boot as the highback, leaned
        // forward about 18 deg and curved round the boot like a half shell, so it hugs the boot instead of standing behind it; side rails;
        // a wide ankle strap arched over the instep and a toe strap over the toe cap)
        let n = rbx(a, b, d, 0, 0.012, -0.01, 0.074, 0.012, 0.162, 0.006);                                                             // baseplate
        { const hb = b < 0.06 ? 0.06 : b > 0.30 ? 0.30 : b, cz = 0.032 - 0.32 * (hb - 0.10), R = 0.092 + 0.012 * smooth(0.15, 0.30, b);
          const hk = Math.max(Math.abs(Math.sqrt(a * a + (d - cz) * (d - cz)) - R) - 0.0065, cz - 0.006 - d, b - 0.30, 0.004 - b);   // heel cup + highback
          const rail = Math.max(Math.abs(Math.abs(a) - 0.080) - 0.0055, b - 0.075, 0.004 - b, d - 0.04, -0.075 - d);                   // side rails
          const ek = (cb, ra, rb) => Math.sqrt(a * a / (ra * ra) + (b - cb) * (b - cb) / (rb * rb)) - 1;
          const an = Math.max(Math.abs(ek(0.088, 0.076, 0.106)) * 0.074 - 0.009, Math.abs(d + 0.035) - 0.030, 0.05 - b);            // ankle strap
          const to = Math.max(Math.abs(ek(0.058, 0.068, 0.062)) * 0.064 - 0.0055, Math.abs(d + 0.135) - 0.019, 0.04 - b);            // toe strap
          n = Math.min(n, hk, rail, an, to); }
        ftB = s; ftN = n; return smin(s, n, 0.004);
      }
      let n = rbx(a, b, d, 0, 0.034, -0.03, 0.034, 0.014, 0.25, 0.006);                                                                // binding: plate,
      n = smin(n, rbx(a, b, d, 0, 0.066, -0.218, 0.036, 0.030, 0.042, 0.014), 0.008);                                                  // toe piece,
      n = smin(n, rbx(a, b, d, 0, 0.075, 0.185, 0.037, 0.040, 0.052, 0.014), 0.008); n = smin(n, E(a, b, d, 0, 0.105, 0.235, 0.026, 0.022, 0.04), 0.008);    // heel piece and its lever
      ftB = s; ftN = n; return smin(s, n, 0.006);
    }
    const hc = [0, 0.006, 0.008], bfc = [0, -0.070, -0.045];
    function rHead(x, y, z) {
      loc(Fh, x, y, z); const a = q[0], b = q[1] - LEN.head, d = q[2] + 0.015; g.q[0] = a; g.q[1] = b; g.q[2] = d;     // (about the middle of the helmet)
      if (nb) {      // (new body: a real ski helmet, goggles strapped on, the face in a gaiter: see HEAD; the fragment shader draws its edges from the same shapes)
        const H = HEAD, h = headHelmet(a, b, d), gg = headGog(a, b, d), bf = smin(smin(E(a, b, d, H.face[0], H.face[1], H.face[2], H.face[3], H.face[4], H.face[5]), ball(a, b, d, H.chin, H.chinR), 0.03), cap(x, y, z, nck, 0.060, 0.058), 0.03);
        hdH = h; hdG = gg; hdB = bf; return smin(smin(h, gg, 0.005), bf, 0.012);
      }
      let h = E(a, b, d, 0, 0.006, 0.008, 0.114, 0.119, 0.130); h = smin(h, E(Math.abs(a), b, d, 0.096, -0.048, 0.014, 0.030, 0.052, 0.056), 0.02);    // shell, ear covers
      const gg = rbx(a, b, d, 0, 0, -0.104, 0.082, 0.038, 0.030, 0.026), bf = smin(ball(a, b, d, bfc, 0.072), cap(x, y, z, nck, 0.062, 0.060), 0.03);
      hdH = h; hdG = gg; hdB = bf; return smin(smin(h, gg, 0.012), bf, 0.02);
    }
    const R = (i, x, y, z) => i === 0 ? rTorso(x, y, z) : i === 1 ? rArm(0, x, y, z) : i === 2 ? rArm(1, x, y, z) : i === 3 ? rPelvis(x, y, z) : i === 4 ? rLeg(0, x, y, z) : i === 5 ? rLeg(1, x, y, z) : i === 6 ? rHead(x, y, z) : i === 9 ? rPack(x, y, z) : rFoot(i - 7, x, y, z);
    const kA = nb ? 0.055 : 0.035, mix = v => { let d = smin(smin(smin(v[0], v[9], 0.014), v[1], kA), v[2], kA); d = smin(d, smin(smin(v[3], v[4], 0.05), v[5], 0.05), 0.014); d = smin(d, v[6], 0.02); return smin(smin(d, v[7], 0.02), v[8], 0.02); };
    // a hull round each region: a point further from a hull than the nearest surface plus the widest blend cannot feel that region, so it is not worked out
    const hT = seg(at(B.pelvis, 0, -0.10, 0.02), v3.mad(J.neck, bd.t2.Y, 0.02)), hS = seg(at(B.chest, -0.17, 0.20, 0.01), at(B.chest, 0.17, 0.20, 0.01)), hH = seg(J.neck, v3.mad(J.head, bd.hb.Y, 0.02)), hP = at(B.pelvis, 0, -0.06, 0.02), hK = seg(at(B.chest, 0, -0.17, 0.185), at(B.chest, 0, 0.10, 0.18));
    const bnd = new Float64Array(10), val = new Float64Array(10);
    function f(x, y, z) {
      bnd[0] = Math.min(cap(x, y, z, hT, 0.205, 0.205), cap(x, y, z, hS, 0.095, 0.095)); bnd[3] = ball(x, y, z, hP, 0.20); bnd[6] = cap(x, y, z, hH, 0.165, 0.165); bnd[9] = cap(x, y, z, hK, 0.165, 0.165);
      for (let k = 0; k < 2; k++) { const A = arm[k], L = leg[k]; bnd[1 + k] = Math.min(cap(x, y, z, A.up, 0.085, 0.085), cap(x, y, z, A.hu, 0.075, 0.075)); bnd[4 + k] = Math.min(cap(x, y, z, L.h0, 0.13, 0.13), cap(x, y, z, L.h1, 0.12, 0.12)); bnd[7 + k] = cap(x, y, z, L.h2, 0.115, 0.115); }
      let m = bnd[0], mi = 0; for (let i = 1; i < 10; i++) if (bnd[i] < m) { m = bnd[i]; mi = i; }
      if (m > 0.16) return m;
      const v1 = R(mi, x, y, z), lim = v1 + 0.055;
      for (let i = 0; i < 10; i++) val[i] = i === mi ? v1 : bnd[i] < lim ? R(i, x, y, z) : 1e9;
      return mix(val);
    }
    function parts(x, y, z) {
      const jt = rTorso(x, y, z), tj = torsoJ; g.pack = rPack(x, y, z); rArm(0, x, y, z); const jL = armJ, gL = armG; rArm(1, x, y, z); const arms = Math.min(jL, armJ);
      g.jacket = smin(jt, arms, kA); g.armSide = arms - tj; g.glove = Math.min(gL, armG);
      const pv = rPelvis(x, y, z); rLeg(0, x, y, z); const pL = legP, cL = legB; rLeg(1, x, y, z); g.pants = smin(smin(pv, pL, 0.05), legP, 0.05);
      rFoot(0, x, y, z); const s0 = ftB, n0 = ftN; rFoot(1, x, y, z); g.boot = Math.min(cL, legB, s0, ftB); g.bind = Math.min(n0, ftN);
      rHead(x, y, z); g.helmet = hdH; g.gog = hdG; g.buff = hdB;
      return g;
    }
    function attr(x, y, z, nx, ny, nz, out) {
      const p = parts(x, y, z); let id = 0, best = p.jacket;
      if (p.pants < best) { best = p.pants; id = 1; } if (p.glove < best) { best = p.glove; id = 2; } if (p.boot < best) { best = p.boot; id = 3; } if (p.bind < best) { best = p.bind; id = 11; }
      if (p.buff < best) { best = p.buff; id = 7; } if (p.pack < best) { best = p.pack; id = 8; }
      if (p.helmet < best) { best = p.helmet; id = 4; }
      if (p.gog - 0.002 < best) { best = p.gog; id = 5; }
      out[2] = 0; out[3] = 0;
      if (id <= 1) { out[2] = clamp(p.pants - p.jacket, -0.05, 0.05); out[3] = clamp(p.armSide, -0.05, 0.05); }   // > 0: jacket side / torso side (decided per pixel)
      else if (id >= 4 && id <= 7) { out[2] = p.q[1]; out[3] = p.q[2]; }                  // head-local y, z for the strap / lens / stripe
      else if (id === 8) out[3] = 0.05;                                                   // (where the pack's outline leaves a little of it to the jacket: torso, not sleeve)
      // ambient occlusion from the field itself
      const ao = sat(0.25 + 0.75 * (0.6 * sat(f(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05) / 0.05) + 0.4 * sat(f(x + nx * 0.14, y + ny * 0.14, z + nz * 0.14) / 0.14)));
      out[0] = id; out[1] = ao;
    }
    return { f, attr, parts };
  }

  // skinning weights: every vertex hangs on up to three bones, each counting for less the further its shape is from the vertex. Garments keep to their
  // own bones (a sleeve does not hang on the ribs it lies against, a thigh not on the other leg) and what straddles the middle of the body is the pelvis's
  // (new body: the weights fall off over a wider zone, so a bent joint is a soft curve and not a crease between two rigid parts)
  function boneWeights(mesh, bd, body, nb) {
    const J = bd.J, F = bd.F, n = mesh.nv, out = new Float32Array(n * 4), c = sd.capsule, SG = nb ? 0.044 : 0.030;
    const dS = (x, y, z, s, r) => c(x, y, z, s[0][0], s[0][1], s[0][2], s[1][0], s[1][1], s[1][2], r, r), dP = (x, y, z, a, r) => Math.hypot(x - a[0], y - a[1], z - a[2]) - r;
    const up = bd.t2.Y, sp = v3.norm(v3.sub(J.chest, J.pelvis)), hips = [J.hipL, J.hipR], spine = [v3.mad(J.pelvis, sp, 0.07), v3.mad(J.chest, sp, -0.04)], chest = [v3.mad(J.chest, up, 0.04), v3.mad(J.neck, up, -0.10)];
    const shl = [v3.lerp(J.shL, J.shR, 0.1), v3.lerp(J.shL, J.shR, 0.9)], nk = v3.mad(J.neck, up, 0.04), nk2 = v3.mad(J.neck, up, -0.05), Fp = F[B.pelvis], spineB = [v3.mad(J.pelvis, sp, -0.12), spine[1]];
    const T = [0, 1].map(k => { const s = k ? 'R' : 'L', hip = J['hip' + s], kn = J['knee' + s], an = J['ankle' + s], sh = J['sh' + s], el = J['elbow' + s], wr = J['wrist' + s], td = v3.norm(v3.sub(kn, hip)), sn = v3.norm(v3.sub(an, kn)), ud = v3.norm(v3.sub(el, sh)), fd = v3.norm(v3.sub(wr, el));
      return { hip, kn, sh, el, td, ud, th: [v3.mad(hip, td, 0.12), v3.mad(kn, td, -0.11)], sn: [v3.mad(kn, sn, 0.11), an], ua: [v3.mad(sh, ud, 0.10), v3.mad(el, ud, -0.09)], fa: [v3.mad(el, fd, 0.09), wr],
        seat: k ? B.seatR : B.seatL, thigh: k ? B.thighR : B.thighL, knee: k ? B.kneeR : B.kneeL, shin: k ? B.shinR : B.shinL, foot: k ? B.footR : B.footL, shd: k ? B.shR : B.shL, uarm: k ? B.uarmR : B.uarmL, elbow: k ? B.elbowR : B.elbowL, farm: k ? B.farmR : B.farmL, hand: k ? B.handR : B.handL, mS: F[k ? B.shinR : B.shinL], mH: F[k ? B.handR : B.handL] }; });
    const cb = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], cw = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; let nc = 0;
    let sg = SG; const add = (i, d, m) => { const w = m * Math.exp(-Math.max(d, 0) / sg); if (w < 1e-4) return; for (let k = 0; k < nc; k++) if (cb[k] === i) { if (w > cw[k]) cw[k] = w; return; } cb[nc] = i; cw[nc] = w; nc++; };
    const ly = (m, x, y, z) => (x - m[12]) * m[4] + (y - m[13]) * m[5] + (z - m[14]) * m[6];
    for (let v = 0; v < n; v++) {
      const x = mesh.verts[v * 10], y = mesh.verts[v * 10 + 1], z = mesh.verts[v * 10 + 2], id = Math.round(mesh.verts[v * 10 + 6]), t = T[x < 0 ? 0 : 1], o = v * 4; nc = 0;
      // (what hangs on a leg lets go of it toward the middle of the body, where the two legs would pull it apart)
      const px = (x - Fp[12]) * Fp[0] + (y - Fp[13]) * Fp[1] + (z - Fp[14]) * Fp[2], a = (x - t.hip[0]) * t.td[0] + (y - t.hip[1]) * t.td[1] + (z - t.hip[2]) * t.td[2], fade = lerp(smooth(0, 0.05, Math.abs(px)), 1, smooth(0.06, 0.15, a));
      // (new body: across the middle (the cleft of the seat, the crotch, the fly) the cloth hangs on BOTH hips' seat bones, half and half at the middle,
      // going over to its own side's across 11 cm; the thigh takes hold only clear of the middle or down the leg. With pelvis-only at the middle and the
      // legs' bones from 5 cm out, legs flung apart (the spread eagle) sheared that strip until it turned over: the seat opened down both sides of the cleft)
      const to = T[x < 0 ? 1 : 0], cx = smooth(0, 0.11, Math.abs(px)), dn = smooth(0.04, 0.22, a);
      const pzv = (x - Fp[12]) * Fp[8] + (y - Fp[13]) * Fp[9] + (z - Fp[14]) * Fp[10], bkv = smooth(-0.03, 0.05, pzv); const mOwn = lerp(lerp(smooth(0, 0.11, Math.abs(px)), 0.5 + 0.5 * cx, lerp(0.5, 1, bkv)), 1, dn), mOth = 0.5 * (1 - cx) * (1 - dn) * lerp(0.5, 1, bkv), mTh = lerp(lerp(smooth(0, 0.15, Math.abs(px)), smooth(0.06, 0.15, Math.abs(px)), bkv), 1, dn);
      if (id === 0 || id === 8) {     // (the pack is soft and strapped on: it goes with the cloth it lies against, so the two never tear apart, and bends with the back)
        const pt = body.parts(x, y, z), as = pt.armSide, aa = (x - t.sh[0]) * t.ud[0] + (y - t.sh[1]) * t.ud[1] + (z - t.sh[2]) * t.ud[2], pk = id === 8;
        const mT = as < 0 && !pk ? (1 - smooth(0.004, 0.05, -as)) * (1 - smooth(0.05, 0.15, aa)) : 1, mA = (as >= 0 ? 1 - smooth(0.004, 0.045, as) : 1) * (pk ? 1 - smooth(0, 0.03, pt.jacket) : 1);
        // (the back of the jacket hangs from the shoulders, and the pack is strapped to them: when the trunk folds forward over the hips, as in a tuck, they
        // go with the back, the hem rides up round the seat (the tail bone) and the seat is left to the trousers. Held by the pelvis and the seat, the skirt
        // stayed wrapped round the seat and stood up under the pack as a round lump. bk: how far round to the back a point is, tw: how near the hem there)
        const py = (x - Fp[12]) * Fp[4] + (y - Fp[13]) * Fp[5] + (z - Fp[14]) * Fp[6], pz = (x - Fp[12]) * Fp[8] + (y - Fp[13]) * Fp[9] + (z - Fp[14]) * Fp[10], bk = pk ? 1 : smooth(-0.02, 0.07, pz);
        const tw = pk ? 0 : bk * (1 - smooth(0.02, 0.13, py + 0.082 + 0.026 * sat((pz + 0.02) / 0.14)));
        add(B.pelvis, dS(x, y, z, hips, 0.14), mT * (1 - 0.8 * bk)); add(B.spine, dS(x, y, z, spine, 0.15), mT); if (bk > 0) add(B.spine, dS(x, y, z, spineB, 0.15), mT * bk * (1 - 0.8 * tw)); if (tw > 0) add(B.tail, 0, mT * tw);
        add(B.chest, Math.min(dS(x, y, z, chest, 0.15), dS(x, y, z, shl, 0.085)), mT); add(B.neck, dP(x, y, z, nk, 0.07), mT);
        if (nb) sg = 0.032; add(t.shd, dP(x, y, z, t.sh, 0.078), mA); add(t.uarm, dS(x, y, z, t.ua, 0.062), mA); add(t.elbow, dP(x, y, z, t.el, 0.06), mA); add(t.farm, dS(x, y, z, t.fa, 0.052), mA); sg = SG;
        // in front and at the sides the skirt of the jacket lies on the tops of the thighs and goes with them (held by the pelvis alone, a deep bend at the hip pushes the thighs out through it)
        if (nb) { add(t.seat, dP(x, y, z, t.hip, 0.120), mOwn * mT * (1 - bk)); if (mOth > 0) add(to.seat, dP(x, y, z, to.hip, 0.120), mOth * mT * (1 - bk)); add(t.thigh, dS(x, y, z, t.th, 0.100), mTh * mT * (1 - bk)); }
        else { add(t.seat, dP(x, y, z, t.hip, 0.120), fade * mT * (1 - bk)); add(t.thigh, dS(x, y, z, t.th, 0.100), fade * mT * (1 - bk)); }
      } else if (id === 1) {
        add(B.pelvis, dS(x, y, z, hips, 0.125), 1);
        if (nb) { add(t.seat, dP(x, y, z, t.hip, 0.140), mOwn); if (mOth > 0) add(to.seat, dP(x, y, z, to.hip, 0.140), mOth); add(t.thigh, dS(x, y, z, t.th, 0.085), mTh); }
        else { add(t.seat, dP(x, y, z, t.hip, 0.105), fade); add(t.thigh, dS(x, y, z, t.th, 0.085), fade); }
        add(t.knee, dP(x, y, z, t.kn, 0.072), fade); add(t.shin, dS(x, y, z, t.sn, 0.08), fade);
      } else if (id === 2) { add(t.hand, 0, smooth(-0.075, -0.015, ly(t.mH, x, y, z))); add(t.farm, 0, 1 - smooth(-0.075, -0.015, ly(t.mH, x, y, z))); }
      else if (id === 3) { const w = smooth(0.33, 0.41, ly(t.mS, x, y, z)); add(t.foot, 0, w); add(t.shin, 0, 1 - w); }
      else if (id === 11) add(t.foot, 0, 1);
      else if (id === 7) { add(B.head, dP(x, y, z, J.head, 0.11), 1); add(B.neck, dP(x, y, z, nk, 0.06), 1); add(B.chest, dP(x, y, z, nk2, 0.09), 1); }
      else add(B.head, 0, 1);
      if (!nc) { cb[0] = B.pelvis; cw[0] = 1; nc = 1; }
      // the three strongest
      let i0 = 0; for (let k = 1; k < nc; k++) if (cw[k] > cw[i0]) i0 = k;
      let i1 = -1; for (let k = 0; k < nc; k++) if (k !== i0 && (i1 < 0 || cw[k] > cw[i1])) i1 = k;
      let i2 = -1; for (let k = 0; k < nc; k++) if (k !== i0 && k !== i1 && (i2 < 0 || cw[k] > cw[i2])) i2 = k;
      const w0 = cw[i0], w1 = i1 < 0 ? 0 : cw[i1], w2 = i2 < 0 ? 0 : cw[i2];
      out[o] = cb[i0]; out[o + 1] = i1 < 0 ? cb[i0] : cb[i1]; out[o + 2] = w0 / (w0 + w1); out[o + 3] = w2 > 0 ? cb[i2] + Math.min(w2 / (w0 + w1 + w2), 0.99) : 0;    // (third bone and its share travel in one number)
    }
    return out;
  }

  // garment boundaries: every triangle gets one material (vertices on a boundary are duplicated), so ids never interpolate
  function splitMaterials(m, bw) {
    const V = Array.from(m.verts), W = Array.from(bw), I = m.idx, dup = new Map();
    for (let t = 0; t < I.length; t += 3) {
      const a = Math.round(V[I[t] * 10 + 6]), b = Math.round(V[I[t + 1] * 10 + 6]), c = Math.round(V[I[t + 2] * 10 + 6]);
      if (a === b && b === c) continue;
      const id = (b === c) ? b : a;
      for (let k = 0; k < 3; k++) {
        const vi = I[t + k]; if (Math.round(V[vi * 10 + 6]) === id) continue;
        const key = vi * 16 + id; let nvI = dup.get(key);
        if (nvI === undefined) { nvI = V.length / 10; for (let q = 0; q < 10; q++) V.push(V[vi * 10 + q]); V[nvI * 10 + 6] = id; for (let q = 0; q < 4; q++) W.push(W[vi * 4 + q]); dup.set(key, nvI); }
        I[t + k] = nvI;
      }
    }
    return { verts: new Float32Array(V), bw: new Float32Array(W), nv: V.length / 10 };
  }

  // ---- hard parts: skis and poles (parametric; too thin for the distance grid)
  function fixMesh(m) {   // outward winding + smooth normals
    let vol = 0; const V = m.verts, I = m.idx;
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 10, b = I[t + 1] * 10, c = I[t + 2] * 10; vol += V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c]); }
    if (vol < 0) for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
    for (let i = 0; i < m.nv; i++) V[i * 10 + 3] = V[i * 10 + 4] = V[i * 10 + 5] = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 10, b = I[t + 1] * 10, c = I[t + 2] * 10, ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { V[k + 3] += nx; V[k + 4] += ny; V[k + 5] += nz; }
    }
    for (let i = 0; i < m.nv; i++) { const l = Math.hypot(V[i * 10 + 3], V[i * 10 + 4], V[i * 10 + 5]) || 1; V[i * 10 + 3] /= l; V[i * 10 + 4] /= l; V[i * 10 + 5] /= l; }
    return m;
  }
  function skiMesh(x0) {
    const mb = meshBuilder(), rings = [], N = 44, zT = 0.80, zF = -0.96;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = lerp(zT, zF, t);
      let w = lerp(0.049, 0.058, smooth(0.15, 0.78, z)); w = lerp(w, 0.064, smooth(-0.15, -0.78, z));
      if (z < -0.80) w *= Math.sqrt(Math.max(0.02, 1 - ((-z - 0.80) / 0.165) ** 2)); if (z > 0.76) w *= Math.sqrt(Math.max(0.05, 1 - ((z - 0.76) / 0.045) ** 2));
      const yb = 0.125 * Math.pow(smooth(-0.62, -0.96, z), 1.7) + 0.015 * Math.pow(smooth(0.66, 0.80, z), 2), th = lerp(0.008, 0.020, smooth(0.80, 0.25, Math.abs(z + 0.05)));
      const r = [[-w, yb], [w, yb], [w, yb + th * 0.55], [w * 0.82, yb + th], [-w * 0.82, yb + th], [-w, yb + th * 0.55]];
      // duplicate the corners so the base, sidewalls and topsheet keep separate normals
      const ring = []; for (let k = 0; k < r.length; k++) { ring.push([[x0 + r[k][0], r[k][1], z], [0, 1, 0]]); }
      rings.push(ring);
    }
    mb.sweep(rings, [9, 1, 0, 0], [0, 0, 1], [0, 0, -1]);
    return fixMesh(mb.done());
  }
  function poleMesh() {   // (local y = 0 is the middle of the fist that holds it)
    const mb = meshBuilder(), rings = [], prof = [[0.075, 0.004], [0.07, 0.015], [0.0, 0.017], [-0.10, 0.015], [-0.105, 0.0085], [-0.60, 0.0075], [-1.03, 0.006], [-1.04, 0.034], [-1.048, 0.034], [-1.056, 0.006], [-1.14, 0.003]];
    for (const [y, r] of prof) { const ring = []; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; ring.push([[Math.cos(a) * r, y, Math.sin(a) * r], [0, 1, 0]]); } rings.push(ring); }
    mb.sweep(rings, [10, 1, 0, 0], [0, 1, 0], [0, -1, 0]);
    return fixMesh(mb.done());
  }

  // ---- the glove (Variants 'hand' b): the first-person view's glove (07d_fpv.js gloveSD: four fingers wound round the grip, the thumb over the
  // first finger, knuckle guards, a padded back) seen from five metres. The body's own grid (13.5 mm) cannot hold a finger (2.5 cm across), so the
  // hand is meshed apart, in the hand's own space, at a grid of GL.cell, once, and the left hand is its mirror image. Each vertex rides on the pole's
  // frame (the fist's, see fistFrame) and, back past the wrist, goes over to the hand bone (the forearm's line), so the wrist bends between them.
  // GL.s: a ski glove is bulkier than the hand in it. Out: [verts (10 floats), weights (4), indices] for the right hand then the left.
  const GL = K.GL = { cell: 0.006, s: 1.10, cut: 0.032 };
  function gloveMesh(bd) {
    if (typeof Fpv === 'undefined' || !Fpv.gloveSD) return null;
    const t0 = performance.now(), G = Fpv.gloveSD, HW = Fpv.HW, s = GL.s, N1 = 0.342, N2 = -0.940;      // (N: from the wrist toward the knuckles, as in the first-person hand space)
    const hu = (y, z) => (y - HW[1]) * N1 + (z - HW[2]) * N2;      // how far past the wrist, toward the knuckles
    const gs = (x, y, z) => G(x / s, y / s, z / s) * s;
    // (cut off a little behind the wrist: from there on the gauntlet is the body's. The grip runs through the fist: the hole the fingers close round)
    const f = (x, y, z) => smaxS(gs(x, y, z), -(hu(y / s, z / s) * s + GL.cut), 0.006);
    const grip = (x, y, z) => Math.max(Math.hypot(x, z) - 0.0175, y - 0.075);
    const m = meshSDF(f, [-0.075 * s, -0.115 * s, -0.065 * s], [0.08 * s, 0.10 * s, 0.13 * s], GL.cell, { stride: 4, repair: true });
    const o = [0, 0, 0], nv = m.nv, V = new Float32Array(nv * 20), W = new Float32Array(nv * 8), I = new Uint32Array(m.ni * 2);
    for (let side = 0; side < 2; side++) {      // 0 right, 1 left (mirrored in x)
      const Fm = bd.F[side ? B.poleL : B.poleR], sx = side ? -1 : 1, base = side * nv;
      for (let i = 0; i < nv; i++) {
        const p = i * 10, x = m.verts[p], y = m.verts[p + 1], z = m.verts[p + 2], nx = m.verts[p + 3], ny = m.verts[p + 4], nz = m.verts[p + 5];
        const P = m4.tp(Fm, [sx * x, y, z]), Nn = v3.norm(m4.td(Fm, [sx * nx, ny, nz])), q = (base + i) * 10;
        // (how open each spot is: between the fingers, under the thumb, against the grip it is dark)
        const h = 0.008, oc = Math.min(f(x + nx * h, y + ny * h, z + nz * h), grip(x + nx * h, y + ny * h, z + nz * h)) / h, ao = clamp(0.18 + 0.82 * oc, 0.15, 1);
        G(x / s, y / s, z / s, o); const fin = o[0] < o[2] ? 1 + o[1] : 0, u = hu(y / s, z / s) * s;
        V[q] = P[0]; V[q + 1] = P[1]; V[q + 2] = P[2]; V[q + 3] = Nn[0]; V[q + 4] = Nn[1]; V[q + 5] = Nn[2]; V[q + 6] = 2; V[q + 7] = ao;
        // (for the shader: which finger (0 = none) and how far out of the back of the hand, packed in one number; how far past the wrist)
        V[q + 8] = fin + 0.5 + clamp(x, -0.09, 0.09) * 5; V[q + 9] = u;
        const w = smooth(-GL.cut, 0.012, u), wb = (base + i) * 4;
        W[wb] = side ? B.poleL : B.poleR; W[wb + 1] = side ? B.handL : B.handR; W[wb + 2] = w; W[wb + 3] = 0;
      }
      for (let t = 0; t < m.ni; t += 3) { const b = side * m.ni + t; I[b] = m.idx[t] + base; I[b + 1] = m.idx[t + (side ? 2 : 1)] + base; I[b + 2] = m.idx[t + (side ? 1 : 2)] + base; }
    }
    K.gloveMs = performance.now() - t0; K.gloveV = nv * 2;
    return { V, W, I, nv: nv * 2, ni: m.ni * 2 };
  }

  // (two bodies for the owner to pick from (Variants 'body'): a = the one before, b = the new one, smoother at the joints and shaped like a person in
  // loose ski clothes. Each is built when first asked for and kept: K.meshes[id]; K.mesh is the one drawn now)
  K.meshes = {};
  // (and a snowboard instead of skis and poles, Variants 'ride' b: 08a_board.js hands over the board, K.boardPart, built in the left foot's frame)
  const rideV = () => K.boardPart && K.boardOn() ? 'S' : '';
  // (and the glove: 'H' = the fine glove closed round the grip, Variants 'hand' b; on the new body and on skis only: a rider's hands hold no pole)
  const handV = (v, rd) => (v || bodyV()) === 'b' && Variants.val.hand === 'b' && typeof Fpv !== 'undefined' && Fpv.gloveSD ? 'H' : '';
  const lrV = rd => rd && K.bindRide && K.labOn && K.labOn() ? 'L' : '';
  K.build = function (v) {
    v = v === 'a' || v === 'b' ? v : (Variants.val.body === 'a' ? 'a' : 'b');
    const rd = rideV(), hv = handV(v, rd), lr = lrV(rd), key = v + rd + hv + lr;      // (lr: the lab's rider, 08i_labride.js: its board body is built in the lab's arms)
    if (K.meshes[key]) return (K.mesh = K.meshes[key]);
    if (!bind) { bind = solve(P0); invBind = bind.F.map(m => m ? m4.invert(m) : null); K.bind = bind; bind.seatC = m4.tp(bind.F[B.pelvis], SEATC); }
    const bb = lr ? K.bindRide(solve, P0) : bind, nb = v === 'b', hb = hv === 'H', body = buildBody(bb, nb, !!rd, hb);
    const t0 = performance.now();
    const m = meshSDF(body.f, [-0.44, 0.0, -0.66], [0.44, 1.80, 0.38], 0.0135, { stride: 4, attr: body.attr });
    K.meshMs = performance.now() - t0;
    const bw0 = boneWeights(m, bb, body, nb);
    const sp = splitMaterials(m, bw0), bw = sp.bw; m.verts = sp.verts; m.nv = sp.nv;
    // skis and poles, rigid on their bones (built in bone-local space, then moved to the bind pose)
    const parts = rd ? [[K.boardPart(), B.footL]] : [[skiMesh(0), B.footL], [skiMesh(0), B.footR], [poleMesh(), B.poleL], [poleMesh(), B.poleR]];
    const gm = hb ? (rd && K.openGlove ? K.openGlove(bind) : gloveMesh(bind)) : null;
    let nv = m.nv + (gm ? gm.nv : 0), ni = m.ni + (gm ? gm.ni : 0); for (const [pm] of parts) { nv += pm.nv; ni += pm.ni; }
    const V = new Float32Array(nv * 10), W = new Float32Array(nv * 4), I = new Uint32Array(ni); V.set(m.verts); W.set(bw); I.set(m.idx);
    if (bb !== bind) { const MB = skinMats(bb);
      for (let i = 0; i < m.nv; i++) { const o = i * 4, b2 = Math.floor(bw[o + 3]), w2 = bw[o + 3] - b2, w0 = bw[o + 2] * (1 - w2), w1 = (1 - bw[o + 2]) * (1 - w2), A = new Array(16).fill(0);
        for (const [b, w] of [[bw[o], w0], [bw[o + 1], w1], [b2, w2]]) if (w > 0) for (let k = 0; k < 16; k++) A[k] += MB[b][k] * w;
        const Ai = m4.invert(A), q = i * 10, P = m4.tp(Ai, [V[q], V[q + 1], V[q + 2]]), Nn = v3.norm(v3.sub(m4.tp(Ai, [V[q + 3], V[q + 4], V[q + 5]]), m4.tp(Ai, [0, 0, 0])));
        V[q] = P[0]; V[q + 1] = P[1]; V[q + 2] = P[2]; V[q + 3] = Nn[0]; V[q + 4] = Nn[1]; V[q + 5] = Nn[2]; } }
    let vo = m.nv, io = m.ni;
    for (const [pm, bone] of parts) {
      const Fm = bind.F[bone];
      for (let i = 0; i < pm.nv; i++) {
        // (pm.at: a part made in a space of its own (the board's), placed in the bone's by that matrix; its own coordinates still go to the shader)
        const Fq = pm.at ? m4.mul(Fm, pm.at) : Fm, p = m4.tp(Fq, [pm.verts[i * 10], pm.verts[i * 10 + 1], pm.verts[i * 10 + 2]]), n = m4.td(Fq, [pm.verts[i * 10 + 3], pm.verts[i * 10 + 4], pm.verts[i * 10 + 5]]), o = (vo + i) * 10;
        V[o] = p[0]; V[o + 1] = p[1]; V[o + 2] = p[2]; V[o + 3] = n[0]; V[o + 4] = n[1]; V[o + 5] = n[2]; V[o + 6] = pm.verts[i * 10 + 6]; V[o + 7] = 1;
        // local coordinates of hard parts ride along for the shader's graphics
        V[o + 8] = bone >= B.poleL ? pm.verts[i * 10 + 1] : pm.verts[i * 10 + 2]; V[o + 9] = pm.verts[i * 10 + 4];
        W[(vo + i) * 4] = bone; W[(vo + i) * 4 + 1] = bone; W[(vo + i) * 4 + 2] = 1;
      }
      for (let i = 0; i < pm.ni; i++) I[io + i] = pm.idx[i] + vo;
      vo += pm.nv; io += pm.ni;
    }
    if (gm) { V.set(gm.V, vo * 10); W.set(gm.W, vo * 4); for (let i = 0; i < gm.ni; i++) I[io + i] = gm.I[i] + vo; vo += gm.nv; io += gm.ni; }
    K.mesh = K.meshes[key] = { V, W, I, nv, ni, v, ride: rd, hand: hv, lr };
    return K.mesh;
  };
  // (the body carved in a background thread at start-up, 00d_par.js: the same mesh, taken in here as if built here)
  Par.jobs.skierMesh = () => { const m = K.build(); return { V: m.V, W: m.W, I: m.I, nv: m.nv, ni: m.ni, v: m.v, ride: m.ride, hand: m.hand, lr: m.lr }; };
  K.freshMesh = function () { const keep = K.meshes, cur = K.mesh; K.meshes = {}; const m = K.build(); K.meshes = keep; K.mesh = cur; return m; };      // (dev: ?parcheck)
  K.adopt = function (m) {
    if (!m) return;
    const rd = rideV(), hv = handV(m.v, rd), lr = lrV(rd), key = m.v + rd + hv + lr;
    if (m.v !== (Variants.val.body === 'a' ? 'a' : 'b') || m.ride !== rd || m.hand !== hv || m.lr !== lr || K.meshes[key]) return;
    if (!bind) { bind = solve(P0); invBind = bind.F.map(q => q ? m4.invert(q) : null); K.bind = bind; bind.seatC = m4.tp(bind.F[B.pelvis], SEATC); }
    K.mesh = K.meshes[key] = m;
  };

  K.init = function (g) {
    gfx = g;
    useBody(K.mesh && K.mesh.v === Variants.val.body && K.mesh.ride === rideV() && K.mesh.hand === handV() ? K.mesh : K.build());
    boneTex = gfx.texture({ w: 4, h: 32, format: 'rgba32f', filter: 'nearest' });
    const buffers = [{ attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['mat', 'vec4f']] }, { attrs: [['bw', 'vec4f']] }];
    // places on the bind-pose body the fragment shader paints by: the chest's own frame (straps, pack), the pelvis's (the height above the jacket's hem:
    // the same line the distance field cuts the jacket at), the right arm and the right leg (the left ones are their mirror images), the pack's outline,
    // and what the folds of the cloth are laid round: elbow, knee and hip (eq, kq, hq: from the joint), the line of the arm and of the leg through them
    const f3 = a => 'vec3f(' + a.map(v => v.toFixed(5)).join(', ') + ')', bj = bind.J, cc = bj.chest, t2 = bind.t2, Fp = bind.F[B.pelvis], pb = { O: [Fp[12], Fp[13], Fp[14]], X: [Fp[0], Fp[1], Fp[2]], Y: [Fp[4], Fp[5], Fp[6]], Z: [Fp[8], Fp[9], Fp[10]] };
    const Fh = bind.F[B.head], hO = [Fh[12], Fh[13], Fh[14]], hX = [Fh[0], Fh[1], Fh[2]], hY = [Fh[4], Fh[5], Fh[6]], hZ = [Fh[8], Fh[9], Fh[10]];
    const dir = (a, b) => f3(v3.norm(v3.sub(b, a))), pk = (a, i, n) => f3(a.slice(i, i + n)), f1 = x => x.toFixed(4);
    const marks = `let tl: vec3f = vec3f(dot(bp - ${f3(cc)}, ${f3(t2.X)}), dot(bp - ${f3(cc)}, ${f3(t2.Y)}), dot(bp - ${f3(cc)}, ${f3(t2.Z)}));
  let pl: vec3f = vec3f(dot(bp - ${f3(pb.O)}, ${f3(pb.X)}), dot(bp - ${f3(pb.O)}, ${f3(pb.Y)}), dot(bp - ${f3(pb.O)}, ${f3(pb.Z)}));
  let bm: vec3f = vec3f(abs(bp.x), bp.y, bp.z); let armU: f32 = dot(bm - ${f3(bj.shR)}, ${dir(bj.shR, bj.elbowR)}); let armF: f32 = dot(bm - ${f3(bj.elbowR)}, ${dir(bj.elbowR, bj.gripR)});
  let hemV: f32 = pl.y + 0.082 + 0.026 * saturate((pl.z + 0.02) / 0.14);
  let foreD: vec3f = ${dir(bj.elbowR, bj.gripR)}; let gEdge: f32 = ${f1(LEN.farm - GAUNT.len)};
  let thU: f32 = dot(bm - ${f3(bj.hipR)}, ${dir(bj.hipR, bj.kneeR)}); let legS: f32 = dot(bm - ${f3(bj.kneeR)}, ${dir(bj.kneeR, bj.ankleR)});
  let pkD: f32 = skMin(skMin(skBox(tl, ${pk(PACK.box, 0, 3)}, ${pk(PACK.box, 3, 3)}, ${f1(PACK.box[6])}), skEll(tl, ${pk(PACK.lid, 0, 3)}, ${pk(PACK.lid, 3, 3)}), ${f1(PACK.k[0])}), skBox(tl, ${pk(PACK.pocket, 0, 3)}, ${pk(PACK.pocket, 3, 3)}, ${f1(PACK.pocket[6])}), ${f1(PACK.k[1])});
  let eq: vec3f = bm - ${f3(bj.elbowR)}; let kq: vec3f = bm - ${f3(bj.kneeR)}; let hq: vec3f = bm - ${f3(bj.hipR)};
  let armAx: vec3f = ${f3(v3.norm(v3.add(v3.norm(v3.sub(bj.elbowR, bj.shR)), v3.norm(v3.sub(bj.gripR, bj.elbowR)))))}; let thD: vec3f = ${dir(bj.hipR, bj.kneeR)}; let shD: vec3f = ${dir(bj.kneeR, bj.ankleR)};
  let legAx: vec3f = normalize(thD + shD); let legB: vec3f = normalize(cross(legAx, vec3f(1.0, 0.0, 0.0)));
  let hd3: vec3f = vec3f(dot(bp - ${f3(hO)}, ${f3(hX)}), dot(bp - ${f3(hO)}, ${f3(hY)}) - ${f1(LEN.head)}, dot(bp - ${f3(hO)}, ${f3(hZ)}) + 0.015);
  let colD: f32 = skMin(skMin(skCap(tl, vec3f(0.0, 0.21, 0.006), vec3f(0.0, 0.235, 0.006), 0.088, 0.080), skEll(tl, vec3f(0.0, 0.190, 0.078), vec3f(0.100, 0.045, 0.040)), 0.05), skEll(tl, vec3f(0.0, 0.222, 0.016), vec3f(0.145, 0.062, 0.085)), 0.05);      // (collar, hood and the slope of the shoulders: the jacket round the head)`;
    // (the new body's head as the shader sees it: the same shapes as headHelmet / headGog / the gaiter in buildBody, from HEAD)
    const H = HEAD, Fi = m4.invert(Fh), nk0 = m4.tp(Fi, bj.neck), nk1 = m4.tp(Fi, v3.mad(bj.head, bind.hb.Y, -0.05)), hl = v => [v[0], v[1] - LEN.head, v[2] + 0.015], E3 = (e, i) => f3(e.slice(i, i + 3));
    const headSSL = `
fn skCap(p: vec3f, a: vec3f, b: vec3f, ra: f32, rb: f32) -> f32 { let pa: vec3f = p - a; let ba: vec3f = b - a; let h: f32 = saturate(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h); }
fn skMax(a: f32, b: f32, k: f32) -> f32 { return -skMin(-a, -b, k); }
fn hdHelm(p: vec3f) -> f32 {
  var h: f32 = skEll(p, ${E3(H.shell, 0)}, ${E3(H.shell, 3)});
  h = skMin(h, skEll(vec3f(abs(p.x), p.y, p.z), ${E3(H.ear, 0)}, ${E3(H.ear, 3)}), 0.02);
  h = skMin(h, skEll(p, ${E3(H.brim, 0)}, ${E3(H.brim, 3)}), 0.012);
  let big: f32 = skEll(p, ${E3(H.shell, 0)}, ${E3(H.shell, 3)} + vec3f(0.005));
  h = skMin(h, skMax(skMax(big, abs(p.x) - 0.013, 0.006), 0.045 - p.y, 0.01), 0.006);
  h = skMax(h, -skBox(p, ${E3(H.cut, 0)}, ${E3(H.cut, 3)}, ${f1(H.cut[6])}), 0.008);
  h = skMax(h, ${f1(H.rim)} + 0.25 * max(p.z, 0.0) - p.y, 0.014);
  return min(h, skMax(skEll(p, ${E3(H.shell, 0)}, ${E3(H.shell, 3)} + vec3f(0.003)), abs(p.y - ${f1(H.gy)}) - ${f1(H.sh)}, 0.003));
}
fn hdGogA(p: vec3f) -> vec3f { let qz: f32 = p.z - ${f1(H.gz)}; let r: f32 = length(vec2f(p.x, qz)); return vec3f(r, atan2(abs(p.x), -qz), p.y - ${f1(H.gy)}); }
fn hdGog(p: vec3f) -> f32 {
  let c: vec3f = hdGogA(p); let dx: f32 = abs(c.x - ${f1(H.gr)}) - ${f1(H.gt)}; let dy: f32 = abs(c.z) - ${f1(H.gh)}; let dz: f32 = (c.y - ${f1(H.ga)}) * c.x;
  return length(max(vec3f(dx, dy, dz), vec3f(0.0))) + min(max(dx, max(dy, dz)), 0.0) - 0.004;
}
fn hdBuff(p: vec3f) -> f32 { return skMin(skMin(skEll(p, ${E3(H.face, 0)}, ${E3(H.face, 3)}), length(p - ${f3(H.chin)}) - ${f1(H.chinR)}, 0.03), skCap(p, ${f3(hl(nk0))}, ${f3(hl(nk1))}, 0.060, 0.058), 0.03); }
`;
    pipe = gfx.pipeline({
      name: 'skier', lib: [SL.common, SL.hash, SL.fog, SL.shadow, SKIN_SSL, SKIER_SSL, headSSL], buffers,
      varyings: { wp: 'vec3f', nrm: 'vec3f', bp: 'vec3f', bn: 'vec3f', mat: 'vec4f' }, uniforms: { p: 'vec4f', q: 'vec4f', r: 'vec4f', s: 'vec4f', c: 'vec4f' },
      textures: { tBones: 'fetch', tDetail: '2d', tShadow: 'shadow', tSky: '2d' },
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; let s: SkinV = skinVertex(a.pos, a.nrm, a.bw); v.wp = s.wp; v.nrm = s.n; v.bp = a.pos; v.bn = a.nrm; v.mat = a.mat; v.clip = U.viewProj * vec4f(s.wp, 1.0); return v; }`,
      fs: SKIER_FS.replace('/*MARKS*/', marks),
    });
    pipeShadow = gfx.pipeline({
      name: 'skierShadow', lib: [SL.common, SKIN_SSL], buffers, varyings: {}, uniforms: { p: 'vec4f' }, textures: { tBones: 'fetch' }, colorFormat: null, cull: 'none', depthBias: 0, depthBiasSlope: 0,
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; let s: SkinV = skinVertex(a.pos, a.nrm, a.bw); v.clip = U.shadowVP * vec4f(s.wp + s.n * 0.03, 1.0); return v; }`, fs: null,   // (poles and limbs are thinner than a texel of the map: fattened 3 cm so they still cast
    });
    // (残影, 92_rings.js 穿圈拖影: the body again as it was a moment ago, from a copy of the bones taken then: see-through, brighter at the
    // rim where the body turns away from the lens, the way a figure left on a long exposure is thin in the middle and holds its outline)
    for (let i = 0; i < GN; i++) gTex.push(gfx.texture({ w: 4, h: 32, format: 'rgba32f', filter: 'nearest' }));
    gPipe = gfx.pipeline({
      name: 'skierGhost', lib: [SL.common, SKIN_SSL], buffers, varyings: { wp: 'vec3f', nrm: 'vec3f' }, uniforms: { p: 'vec4f', q: 'vec4f' }, textures: { tBones: 'fetch' },
      cull: 'none', blend: 'premul', depthWrite: false, depthFunc: 'lequal',
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; let s: SkinV = skinVertex(a.pos, a.nrm, a.bw); v.wp = s.wp + M.p.xyz; v.nrm = s.n; v.clip = U.viewProj * vec4f(v.wp, 1.0); return v; }`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
  let vd: vec3f = normalize(U.camPos.xyz - v.wp); let nd: f32 = abs(dot(normalize(v.nrm), vd));
  let rim: f32 = pow(1.0 - nd, 2.0);
  let a: f32 = M.p.w * (0.08 + 0.92 * rim);
  let e: f32 = 1.0 / max(U.ambSky.w, 1e-4);
  o.color = vec4f(M.q.rgb * e * M.q.w * a, a); return o; }`,
    });
    K.pipes = [pipe, pipeShadow, gPipe]; K.ready = true;
  };
  const GN = 16; const gTex = []; let gPipe = null, gHead = 0;
  // take a copy of the bones as they stand now (origin: the render origin they are relative to); returns the copy, or null
  K.ghostSnap = function (origin, t) {
    if (!gfx || !gPipe) return null;
    const tex = gTex[gHead++ % GN]; gfx.updateTexture(tex, 0, 0, 4, 32, boneData);
    return { tex, o: [origin[0], origin[1], origin[2]], t };
  };
  // draw copies: each {tex, p: [offset xyz (render space), alpha], q: [r, g, b, brightness]}
  K.drawGhosts = function (list) { if (!gPipe || !count) return; for (const g of list) gfx.draw(gPipe, { u: { p: g.p, q: g.q }, tex: { tBones: g.tex }, vb: [vb, vb2], ib, count }); };

  // ---- between the poses it is asked for the body has a little life of its own: the trunk trails the legs into a turn and folds after them when they
  // are driven up under it, hands and pack ride on, and all of it settles again within a few tenths of a second (game time: App.t)
  const spr = (s, to, w, z, dt) => { s[1] = (s[1] + w * w * (to - s[0]) * dt) / (1 + 2 * z * w * dt + w * w * dt * dt); s[0] += s[1] * dt; return s[0]; };
  const st = { t: 0, pose: null, root: null, pos: [0, 0, 0], lean: [0, 0], cf: [0, 0], crouch: [0, 0], f0: 0, dp: null, pp: [null, null], pq: [0, 0], hm: { p: [0, 0], r: [0, 0], v: null, o: [0, 0] }, sec: { ct: 0, cf: 0, roll: 0, yaw: 0, hand: [0, 0, 0], head: 0, drop: 0, dp: null, pl: [null, null], idle: null, pf: [{ o: null, p: null, n: 0 }, { o: null, p: null, n: 0 }], pfN: 0, pfDt: 0 } };
  // root: {pos (world, on the snow), fwd (unit, along the skis), nrm (snow normal)}; pose: see P0 (anything left out is as in P0)
  const cur = Object.assign({}, P0);
  K.pose = cur; K.world = { J: null, root: null };
  // ---- waiting at the top of the run (the title page) the figure stands at ease, and it is alive: it breathes, and in the cold the breath shows; now
  // and then it moves its weight to the other ski, looks out at the city or across the valley, lifts a pole and sets it down again. None of it is meant
  // to be noticed. w: how much of it is on. It comes and goes by a spring, so the run begins out of it without a seam: the poles stay in the snow where
  // they stood (W: the places of their tips in the world), the hands leave them behind, and the pose has everything back within half a second.
  // breath, vapour: how deep it breathes and how thick the breath shows (1.2 and 1 as it stands)
  const idle = K.idle = { w: [0, 0], t: 0, W: null, base: [[0, 0], [0, 0]], breath: 1.2, vapour: 1, ph: 0.30, per: 3.7, fl: 0, puff: 0, sh: [0, 0], shT: 0, shN: 6, hy: [0, 0], hp: [0, 0], ty: [0, 0], gy: 0, gp: 0, gN: 2.4, gH: 0, gS: 1, n: 0,
    u: [0, 0], rk: -1, rq: 0, rN: 10, rS: 0, rA: null, rB: null, rnd: RNG(4127), sec: { rest: 0, T: [[0, 0], [0, 0]], u: [0, 0], up: 0, br: 0, sh: 0, hy: 0, hp: 0, ty: 0, sx: 0 } };
  function ease(root, pose, cut, dt, X, Z, toW) {
    // (only ever the game's own figure: one that is posed to be looked at, as the test pages do, stands as it is told)
    const I = idle, e = I.sec, r = I.rnd, on = typeof Game !== 'undefined' && root === Game.root && pose === Game.pose && Game.mode === 'title';
    // (the poles taken up: they are set down afresh where the figure stands when it next stands at ease, and not lifted again straight away)
    const up = () => { I.W = null; I.rk = -1; I.u[0] = I.u[1] = 0; if (I.rN < 8) I.rN = 8; };
    if (cut) { I.w[0] = on ? 1 : 0; I.w[1] = 0; up(); I.sh[1] = I.hy[1] = I.hp[1] = I.ty[1] = 0; } else if (dt > 0) spr(I.w, on ? 1 : 0, 7, 1, dt);
    const w = I.w[0] > 0.9995 ? 1 : I.w[0] < 5e-4 ? 0 : I.w[0];
    if (!(w > 0)) { up(); I.fl = 0; return null; }
    if (dt > 0) {
      if (on) {
        I.t += dt;
        // a breath: in over a second and a half, out over nearly two, a pause; no two quite the same length
        I.ph += dt / I.per; if (I.ph >= 1) { I.ph -= 1; I.per = 3.4 + 0.7 * r(); }
        // the weight: on both skis or more on one, moved every seven to fifteen seconds
        if ((I.shN -= dt) <= 0) { I.shN = 7 + 8 * r(); I.shT = I.shT ? (r() < 0.4 ? 0 : -sign(I.shT) * (0.7 + 0.3 * r())) : (r() < 0.5 ? -1 : 1) * (0.7 + 0.3 * r()); }
        // a look away: out at the city, across the valley to one side and the next time to the other, now and then down at the skis; held for two or
        // three seconds, then back to the run below (gy, gp: where to, as a turn and a nod of the head)
        if (I.gH > 0) { if ((I.gH -= dt) <= 0) { I.gy = I.gp = 0; I.gN = 5 + 6 * r(); } }
        else if ((I.gN -= dt) <= 0) {
          const q = I.n++ ? r() : 0, az = (typeof Vista !== 'undefined' && Vista.cityAz != null ? Vista.cityAz : 0.14) - Math.atan2(root.fwd[0], -root.fwd[2]);
          if (q < 0.45) { I.gy = clamp(Math.atan2(Math.sin(az), Math.cos(az)) + 0.22 * (r() - 0.2), -0.9, 0.9); I.gp = -0.16; }
          else if (q < 0.86) { I.gS = -I.gS; I.gy = I.gS * (0.45 + 0.3 * r()); I.gp = -0.13; }
          else { I.gy = 0.12 * (r() - 0.5); I.gp = 0.22; }
          I.gH = (q < 0.86 ? 1.8 : 1.2) + 1.6 * r();
        }
        // a pole lifted and set down again, a hand's breadth from where it stood: the one the weight is not on, or else each in its turn (u: how far
        // it is off the snow)
        if (I.rk < 0) { if ((I.rN -= dt) <= 0 && I.W) { const k = I.rk = I.sh[0] > 0.2 ? 0 : I.sh[0] < -0.2 ? 1 : (I.rS = 1 - I.rS), b = I.base[k]; I.rq = 0; I.rA = I.W[k]; I.rB = toW([b[0] + 0.06 * (r() - 0.5), DP.TIPY, b[1] + 0.08 * (r() - 0.5)]); } }
        else { const k = I.rk, q = Math.min(I.rq += dt / 1.15, 1), sn = Math.sin(PI * q); I.u[k] = sn * sn; I.W[k] = v3.lerp(I.rA, I.rB, smooth(0.12, 0.88, q)); if (q >= 1) { I.rk = -1; I.rN = 13 + 12 * r(); } }
      } else I.shT = I.gy = I.gp = 0;
      spr(I.sh, I.shT, 2.3, 1, dt); spr(I.hy, I.gy, 5.2, 1, dt); spr(I.hp, I.gp, 4.6, 1, dt); spr(I.ty, I.gy * 0.17, 3.1, 1, dt);
    }
    // (fl: the air going out, strongest as the breath is let go)
    const p = I.ph, br = p < 0.42 ? smoother(0, 0.40, p) : 1 - smoother(0.44, 0.92, p), c0 = cur.crouch, s0 = cur.swing, aL = cur.armL, aR = cur.armR;
    I.fl = on ? smooth(0.44, 0.49, p) * (1 - smooth(0.52, 0.72, p)) : 0;
    // at ease (k: how far, a: with the life in it or without): taller on the legs and more upright, the head down toward the run, the hands lower and
    // nearer the hips, on the grips of poles that stand in the snow; never quite still
    const put = (k, a) => {
      cur.crouch = lerp(c0, 0.13, k); cur.swing = s0 * (1 - k);
      cur.armL = [aL[0] - 0.02 * k, aL[1] + (0.03 * a * I.u[0] - 0.05) * k, aL[2] + 0.16 * k]; cur.armR = [aR[0] + 0.02 * k, aR[1] + (0.03 * a * I.u[1] - 0.05) * k, aR[2] + 0.16 * k];
      e.up = (-0.12 + a * 0.006 * vnoise1(I.t * 0.19, 12)) * k; e.sx = a * 0.006 * vnoise1(I.t * 0.23, 11) * k; e.br = a * I.breath * br * k; e.sh = a * I.sh[0] * k;
      e.hy = a * I.hy[0] * k; e.hp = (0.13 + a * I.hp[0]) * k; e.ty = a * I.ty[0] * k; e.u[0] = a * I.u[0]; e.u[1] = a * I.u[1];
    };
    // (set down in another place without a cut, as when another mountain is laid under the same start: the poles are not left standing where the old
    // snow was. Standing still, a tip is never further from its place than a re-plant moves it)
    if (I.W && on) for (let k = 0; k < 2; k++) { const d = v3.sub(I.W[k], root.pos); if (Math.hypot(v3.dot(d, X) - I.base[k][0], v3.dot(d, Z) - I.base[k][1]) > 0.08) { up(); break; } }
    // where the poles are set down: beside the boots, out from under the hands and a little behind them (found from where the hands are when at ease)
    if (!I.W) { put(1, 0); e.rest = 0; const s = solve(cur, Object.assign({}, SEC0, { idle: e })); I.W = [0, 1].map(k => { const g = k ? s.J.gripR : s.J.gripL, d = Math.sqrt(Math.max(LEN.pole * LEN.pole - Math.pow(g[1] - DP.TIPY, 2), 0.02)), b = I.base[k] = [g[0] + (k ? 0.55 : -0.55) * d, g[2] + 0.835 * d]; return toW([b[0], DP.TIPY, b[1]]); }); }
    // (and only as far as the pose is one to stand in: none of it shows on a body that is laid over, folded up, in the air or holding a ski)
    const k = w * (1 - sat(cur.tuck * 3)) * (1 - sat(cur.air * 3)) * (1 - smooth(0.04, 0.2, Math.abs(cur.lean))) * (1 - sat((cur.grabL || 0) + (cur.grabR || 0)));
    put(k, 1); e.rest = k; I.fl *= k;
    for (let k = 0; k < 2; k++) { const d = v3.sub(I.W[k], root.pos); e.T[k][0] = v3.dot(d, X); e.T[k][1] = v3.dot(d, Z); }
    return e;
  }
  // the cloth: how far the elbows, the knees and the hips are folded (it creases there by as much), and how much of it shows: three versions for the owner
  // to pick from (Variants): a = flat, as it was; b = folds, seams and a sheen; c = the same, deeper. A change of version eases in over half a second
  // of the clock on the wall, not the game's (the choice is made in a panel, also with the game stopped); after a pause in the drawing it is simply there.
  // (the third number: how freely the hem moves: the heavy cloth of c moves less)
  const CLOTH = { a: [0, 0, 0], b: [1, 1, 1], c: [1.7, 1, 0.7] }, clo = { p: [0, 0, 0, 0], q: [0, 0, 1, 1], h: 1, t: -1 }, HEMP = [0, 0.08, 0.05];
  Variants.def('body', '人物模型', [['a', '原来'], ['b', '新的']], 'b');
  Variants.def('cloth', '衣服', [['a', '平整'], ['b', '自然'], ['c', '厚实']], 'b');
  // (the glove: a = the squarish fist of the body's own mesh; b = a glove with fingers closed round the grip, see gloveMesh)
  Variants.def('hand', '手套', [['a', '原来'], ['b', '手指握杖']], 'b');
  // (and the clothes' finer details, as real ski clothes are made: stitching beside the seams, a cargo pocket on the thigh, scuff guards inside the
  // ankles, zip pulls and hem toggles, a dusting of snow on what faces up, boots with buckles and a power strap: see SKIER_FS, kit)
  Variants.def('kit', '衣服细节', [['a', '原来'], ['b', '更细']], 'b');
  function cloth(J) {
    const bd = (a, b, c) => sat(0.8 * (1 - v3.dot(v3.norm(v3.sub(b, a)), v3.norm(v3.sub(c, b))))), up = v3.norm(v3.sub(J.chest, J.pelvis)), hf = (h, k) => sat(0.5 + 0.5 * v3.dot(up, v3.norm(v3.sub(k, h))));
    clo.p = [bd(J.shL, J.elbowL, J.gripL), bd(J.shR, J.elbowR, J.gripR), bd(J.hipL, J.kneeL, J.ankleL), bd(J.hipR, J.kneeR, J.ankleR)];
    clo.q[0] = hf(J.hipL, J.kneeL); clo.q[1] = hf(J.hipR, J.kneeR);
  }
  const FLOW = ['crouch', 'tuck', 'air', 'grabL', 'grabR', 'fa', 'fore', 'sep', 'swing', 'liftL', 'liftR', 'pitchL', 'pitchR', 'rollL', 'rollR', 'lead', 'stance', 'headYaw', 'bal'], FA = ['armL', 'armR'], fl = {};
  function flow(p, dt) {
    const go = (key, x, w = 26) => { const q = fl[key]; if (!(dt > 0) || !q || !(x === x)) { fl[key] = [x, 0]; return x; }
      const e = Math.exp(-w * dt), d = q[0] - x, b = (q[1] + w * d) * dt; q[0] = x + (d + b) * e; q[1] = (q[1] - w * b) * e; return q[0]; };
    // (the knee bend in the first moments of a landing a little more closely: p.cfast, see the game's updatePose)
    for (const k of FLOW) if (typeof p[k] === 'number') p[k] = go(k, p[k], k === 'crouch' ? 26 + 30 * sat(p.cfast || 0) : 26);
    // (the stroke's phase too, where it turns back (a stroke given up before the tips went in): the hands slow and come back, they do not bounce.
    // Not across the start of the next stroke, where the phase starts again from 0 by design, nor at the end of the last)
    { const d = typeof p.dp === 'number' ? p.dp : 0, q = fl.dp;
      if (!(dt > 0) || !q) fl.dp = [d, 0, d];
      else if (d > q[2] || (d === q[2] && Math.abs(q[0] - d) < 1e-4) || d < q[2] - 0.5 || (d <= 0 && q[2] > 0.5) || (d <= 0 && q[0] <= 1e-3)) { q[1] = d >= q[2] && d - q[2] < 0.5 ? (d - q[2]) / dt : 0; q[0] = d; q[2] = d; }      // (going forward, starting over, ending: as it is)
      else { q[2] = d; p.dp = Math.max(0, go('dp', d)); } }      // (turning back: eased from the speed it had)
    for (const k of FA) if (p[k] && p[k].length === 3) p[k] = [go(k + 0, p[k][0]), go(k + 1, p[k][1]), go(k + 2, p[k][2])];
  }
  K.update = function (root, pose, origin) {
    for (const k in P0) cur[k] = P0[k]; Object.assign(cur, pose);
    const now = typeof App !== 'undefined' && App.t === App.t ? App.t : 0, sec = st.sec; let f = clamp(cur.dp || 0, 0, 1);
    let dt = now - st.t;
    // a new pose object, a new place or a gap in time: nothing to carry over
    const cut = st.pose !== pose || st.root !== root || !(dt >= 0) || dt > 0.25 || v3.len(v3.sub(root.pos, st.pos)) > 6;
    const Y = v3.norm(root.nrm), Z0 = v3.mul(root.fwd, -1), X = v3.norm(v3.cross(Y, Z0)), Z = v3.cross(X, Y);
    const toW = q => [root.pos[0] + X[0] * q[0] + Y[0] * q[1] + Z[0] * q[2], root.pos[1] + X[1] * q[0] + Y[1] * q[1] + Z[1] * q[2], root.pos[2] + X[2] * q[0] + Y[2] * q[1] + Z[2] * q[2]];
    // (standing at ease changes what the pose asks for: before anything is made of it)
    sec.idle = ease(root, pose, cut, cut ? 0 : dt, X, Z, toW);
    sec.pfN++; sec.pfDt = cut ? 0 : Math.max(dt, 0); if (cut) for (const q of sec.pf) { q.o = q.p = q.ho = q.hp = q.ko = q.kp = q.fo = q.fp = null; }
    if (cut) { st.lean = [cur.lean, 0]; st.cf = [cur.crouch, 0]; st.crouch = [cur.crouch, 0]; st.dp = null; st.dpc = 0; st.pp[0] = st.pp[1] = null; st.f0 = f; dt = 0; }
    // (2026-11-15, the owner: every change of move must flow, nothing may snap. What the game asks of the body can change in a frame: the legs
    // thrown long for a take-off, a tuck dropped into, a grab, the air begun or ended, the arms told somewhere new. The body is carried there
    // over a few hundredths of a second on a critically damped path (no overshoot, nothing springs back): its speed never jumps, so a joint
    // never snaps. Lean and edge are left alone (the skis are on the snow with them), and so are the stroke's phase, the plants and the trick angles)
    flow(cur, cut ? 0 : dt); f = clamp(cur.dp || 0, 0, 1);
    // the hem of the jacket is cloth on a moving body: it lags behind what the body does (speeding up, turning) and the wind of the run lifts it off the
    // seat and shakes it, on the game's time (slow motion slows it too). p: how far the back hem stands out (radians about the small of the back, never
    // in through the seat), r: how far it swings to a side; v: the figure's velocity in the world, smoothed (its change, read in the figure's frame, is what the hem lags behind)
    { const H = st.hm, g = clo.h, u = !cut && dt > 0 ? v3.mul(v3.sub(root.pos, st.pos), 1 / dt) : [0, 0, 0];
      if (cut || !H.v) { H.v = u; H.p[0] = H.p[1] = H.r[0] = H.r[1] = 0; }
      else if (dt > 0) { const n = v3.add(H.v, v3.mul(v3.sub(u, H.v), 1 - Math.exp(-dt * 18))), a = v3.mul(v3.sub(n, H.v), 1 / dt), ax = clamp(v3.dot(a, X), -14, 14), af = clamp(-v3.dot(a, Z), -14, 14), w = sat((-v3.dot(n, Z) - 4) / 22); sec.latA = ax;
        H.v = n; spr(H.p, g * (0.11 * w * w * (3 - 2 * w) + clamp(af * 0.008, -0.02, 0.06)), 14, 0.32, dt); spr(H.r, g * clamp(-ax * 0.007, -0.09, 0.09), 12, 0.3, dt); }
      const w = sat((-v3.dot(H.v, Z) - 6) / 20), fl = g * w * (0.022 * Math.sin(now * 47) + 0.014 * Math.sin(now * 29 + 1.3) + 0.01 * Math.sin(now * 71 + 0.4));
      H.o[0] = clamp(H.p[0] + fl, -0.02, 0.2); H.o[1] = clamp(H.r[0] + 0.6 * fl * Math.sin(now * 13), -0.12, 0.12); }
    st.t = now; st.pose = pose; st.root = root; st.pos[0] = root.pos[0]; st.pos[1] = root.pos[1]; st.pos[2] = root.pos[2];
    if (dt > 0) { spr(st.lean, cur.lean, 11, 0.8, dt); spr(st.crouch, cur.crouch, 7, 1, dt); spr(st.cf, cur.crouch, 40, 1, dt); }
    const dl = st.lean[0] - cur.lean, dc = cur.crouch - st.crouch[0], quiet = 1 - sat(cur.tuck * 1.5);
    // (ct, cf: how far the trunk's two readings of the crouch are behind the legs' at this moment: see solve)
    sec.roll = clamp(dl * 0.45, -0.14, 0.14); sec.ct = clamp(-dc, -0.6, 0.6); sec.cf = clamp(st.cf[0] - cur.crouch, -0.6, 0.6); sec.drop = clamp(dl * 0.10, -0.04, 0.04) * quiet;
    sec.hand[1] = clamp(dc * 0.16, -0.05, 0.07) * quiet; sec.hand[2] = clamp(-dc * 0.06, -0.03, 0.03) * quiet;
    // double-pole stroke: once the tips are in they belong to the snow, not to the skier: their place is kept in the world and handed back in the
    // skier's frame, until the stroke lets go (or a hand cannot reach its pole any more) and a new stroke begins
    if (f < st.f0 - 1e-6) st.dpc = sec.dpmv || 0;      // (a stroke begins where the one before it was led to end: see dpWrap)
    if (!(f > 0) || f < st.f0 - 1e-6) st.dp = null;
    if (st.dp) for (let k = 0; k < 2; k++) { const w = st.dp.W[k], d = [w[0] - root.pos[0], w[1] - root.pos[1], w[2] - root.pos[2]]; st.dp.T[k * 2] = v3.dot(d, X); st.dp.T[k * 2 + 1] = v3.dot(d, Z); }
    if (st.dp && f >= st.dp.rel && !st.dp.gone) { st.dp.gone = true; if (st.dp.g) st.dp.rel = st.dp.gf; }      // let go: the recovery starts from the last moment the pole was held
    sec.dp = st.dp; sec.dpc = st.dpc || 0;
    // the pole plant of a turn: the same. From the moment the tip goes in it is the snow's (W: where, in the world; T: the same in the skier's frame)
    // until the plant is taken back or the hand has left it behind; then the pole comes round to trail again (d: how it pointed when let go, w: how far
    // along; g: the pose taking it over again)
    const pq = [sat(cur.plantL || 0), sat(cur.plantR || 0)];
    for (let k = 0; k < 2; k++) { const P = st.pp[k]; sec.pl[k] = P; if (!P) continue;
      if (P.d) { P.w = smooth(0, 0.3, now - P.rel); P.g = smooth(0.3, 0.6, now - P.rel); } else { const w = P.W, d = [w[0] - root.pos[0], w[1] - root.pos[1], w[2] - root.pos[2]]; P.T = [v3.dot(d, X), v3.dot(d, Z)]; } }
    // (the lab's turns: which posture, how much of it; null = the game's own figure)
    sec.lab = typeof LabMo !== 'undefined' && !K.boardOn() ? LabMo.step(cur, sec, cut ? 0 : dt, st.hm.v ? v3.len(st.hm.v) : 0, cut ? 0 : sec.latA || 0) : null;
    sec.labB = typeof LabMo !== 'undefined' && K.boardOn() ? LabMo.stepB(cur, sec, cut ? 0 : dt) : null;
    // (实验室人物, developer mode: the lab's skeleton and motion set every bone, 08i_labride.js; until its frames are solved the game's own stand in)
    sec.gnd = K.ground ? K.ground(cur, root, Y, toW, sec, cut ? 0 : dt) : null;
    sec.vb = st.hm.v ? -v3.dot(st.hm.v, Z) : 0;      // (how fast the body is going forward, for the stroke: see hand)
    const s = (K.labSolve && K.labSolve(cur, sec, cut ? 0 : dt)) || (K.boardOn() ? K.solveBoard(cur, sec) : solve(cur, sec));
    for (let k = 0; k < 2; k++) { const P = st.pp[k], sd = k ? 'R' : 'L', tp = s.J['tip' + sd], gp = s.J['grip' + sd];
      if (!P) { if (!cut && dt > 0 && !(f > 0) && pq[k] > st.pq[k] && pq[k] > 0.5 && tp[1] <= 0) st.pp[k] = { W: toW(tp), T: [tp[0], tp[2]], d: null, h: null, w: 0, g: 0, rel: 0 }; }
      // (h: how far the pole has pushed the hand up, riding over it: more than a hand's breadth and it is pulled out)
      else if (!P.d) { P.h = s.hp[k]; if (pq[k] < 0.3 || (P.h && v3.len(P.h) > 0.06) || v3.len(v3.sub([P.T[0], DP.TIPY, P.T[1]], gp)) > LEN.pole + 0.03 || cur.air > 0.3 || cur.tuck > 0.6 || f > 0) { P.d = s.J['poleD' + sd].slice(); P.rel = now; P.w = 0; } }
      else if (P.g >= 1) st.pp[k] = null; }      // (by now the plant has long been taken back: the pole is the pose's own again)
    st.pq = pq;
    if (s.dp && !cut) {
      if (!st.dp) { if (st.f0 < DP.PLANT && f >= DP.PLANT) st.dp = { W: [toW(s.dp.T[0]), toW(s.dp.T[1])], T: [0, 0, 0, 0], rel: DP.REL, u: s.dp.u, d: null, v: null, g: null, gf: f }; }
      else if (f < st.dp.rel) { const D = st.dp, gn = [s.J.gripL[0], s.J.gripL[1], s.J.gripL[2], s.J.gripR[0], s.J.gripR[1], s.J.gripR[2]];
        if (s.dp.out && D.g) { D.rel = D.gf; D.gone = true; }      // (out of reach: let go at the step before, and the solver has drawn it so)
        else { const sn = [s.J.shL[0], s.J.shL[1], s.J.shL[2], s.J.shR[0], s.J.shR[1], s.J.shR[2]]; if (D.g && f > D.gf + 1e-5) { D.v = gn.map((x, i) => (x - D.g[i]) / (f - D.gf)); if (D.s) D.vs = sn.map((x, i) => (x - D.s[i]) / (f - D.gf)); } D.g = gn; D.s = sn; D.gf = f; D.h = s.J.dpHL && s.J.dpHR ? [s.J.dpHL[0], s.J.dpHL[1], s.J.dpHL[2], s.J.dpHR[0], s.J.dpHR[1], s.J.dpHR[2]] : null;
          D.u = s.dp.u; D.d = [s.J.poleDL[0], s.J.poleDL[1], s.J.poleDL[2], s.J.poleDR[0], s.J.poleDR[1], s.J.poleDR[2]]; if (s.dp.out) D.rel = f; } }
    }
    st.f0 = f;
    // the breath shows: as the air is let go, a few small puffs of vapour from the mouth, one after the other, pushed forward and a little down
    if (sec.idle && idle.fl > 0.02 && dt > 0 && typeof Spray !== 'undefined' && Spray.breath && (idle.puff -= dt) <= 0) {
      const hb = s.hb, r = idle.rnd, m = v3.add(s.J.head, fr(hb, 0, -0.07, -0.13)), a = toW(m), b = toW(v3.add(m, fr(hb, 0.3 * (r() - 0.5), -0.15 + 0.2 * (r() - 0.5), -1))), sp = 0.5 + 0.3 * r();
      idle.puff = 0.07 + 0.03 * r(); Spray.breath(now, a, [(b[0] - a[0]) * sp, (b[1] - a[1]) * sp, (b[2] - a[2]) * sp], 2.4 * idle.fl * idle.vapour);
    }
    cloth(s.J); s.hem = st.hm.o;
    const R = m4.fromBasis(X, Y, Z, [root.pos[0] - origin[0], root.pos[1] - origin[1], root.pos[2] - origin[2]]), M = skinMats(s);
    for (let i = 0; i < K.NB; i++) boneData.set(m4.mul(R, M[i]), i * 16);
    K.world.M = M;          // (the bones in the figure's own frame: 一起滑 (99b_net.js) sends them to the others on the mountain)
    if (gfx) gfx.updateTexture(boneTex, 0, 0, 4, 32, boneData);
    const W = K.world; W.root = R; W.J = s.J; W.X = X; W.Y = Y; W.Z = Z; W.hb = s.hb;
    // the skis (tail to tip) and the poles (fist to tip) in render space, each [a, b]: the motion blur leaves them sharp, as it does the body (09_post.js)
    { const sg = (b, a, c) => { const F = m4.mul(R, s.F[b]); return [m4.tp(F, a), m4.tp(F, c)]; };
      W.seg = [sg(B.footL, [0, 0.02, 0.78], [0, 0.09, -0.94]), sg(B.footR, [0, 0.02, 0.78], [0, 0.09, -0.94]), sg(B.poleL, [0, 0.06, 0], [0, -1.12, 0]), sg(B.poleR, [0, 0.06, 0], [0, -1.12, 0])]; }
    W.tipL = toW(s.J.tipL); W.tipR = toW(s.J.tipR); W.planted = Math.min(s.J.plantedL, s.J.plantedR);   // pole tips in the world, and whether the snow has them (1) or not (0)
    return s;
  };
  // model-space point -> render space (for effects that attach to the body)
  K.toWorld = function (p) { return m4.tp(K.world.root, p); };
  K.sec = st.sec;      // (what update last handed to solve besides the pose: tests draw a figure from it)
  const nite = [0, 0, 0, 0];      // (x: how far into the night it is: Sky.night)
  // (K.lensCut, set by the first-person view (07d_fpv.js): [from, to] m from the lens, the figure fades out inside it; 0: nothing is cut)
  const CUT0 = [0, 0, 0, 0]; K.lensCut = null;
  // (the body asked for in the panel: built at the first draw that wants it, then swapped in at once)
  const bodyV = () => Variants.val.body === 'a' ? 'a' : 'b';
  function useBody(m) {
    if (!m.gpu) m.gpu = { vb: gfx.buffer(m.V, 'vertex'), vb2: gfx.buffer(m.W, 'vertex'), ib: gfx.buffer(m.I, 'index') };
    K.mesh = m; vb = m.gpu.vb; vb2 = m.gpu.vb2; ib = m.gpu.ib; count = m.ni; nite[1] = m.v === 'b' ? 1 : 0; nite[2] = m.hand === 'H' ? 1 : 0;
  }
  const wantBody = () => { if (K.mesh.v !== bodyV() || K.mesh.ride !== rideV() || K.mesh.hand !== handV() || (K.mesh.lr || '') !== lrV(rideV())) useBody(K.build(bodyV())); }; K.want = wantBody;
  K.draw = function (shadowTex, skyTex) {
    wantBody();
    const want = CLOTH[Variants.val.cloth] || CLOTH.b, now = performance.now() / 1000, de = now - clo.t, e = clo.t < 0 || de > 0.1 ? 1 : 1 - Math.exp(-Math.max(de, 0) * 6); clo.t = now;
    clo.q[2] += (want[1] - clo.q[2]) * e; clo.q[3] += (want[0] - clo.q[3]) * e; clo.h += (want[2] - clo.h) * e;
    nite[0] = typeof Sky !== 'undefined' && Sky.night === Sky.night ? smooth(0.35, 1, Sky.night) : 0;
    nite[3] = Variants.val.kit === 'b' && nite[1] > 0 ? 1 : 0;      // (the finer details of the clothes, Variants 'kit' b: new body only)      // (from deep dusk on: dusk itself stays as it was)
    gfx.draw(pipe, { u: { p: clo.p, q: clo.q, r: nite, s: K.lensCut || CUT0, c: COL0 }, tex: { tBones: boneTex, tDetail: Tex.detail, tShadow: shadowTex, tSky: skyTex }, vb: [vb, vb2], ib, count });
  };
  K.drawShadow = function () { wantBody(); gfx.draw(pipeShadow, { u: { p: [0, 0, 0, 0] }, tex: { tBones: boneTex }, vb: [vb, vb2], ib, count }); };
  // ---- 一起滑 (99b_net.js): the other skiers on the mountain are this same figure, drawn again from bones that came over the network.
  // K.otherTex(): a bone texture of their own; K.otherBones(tex, R, M): R the figure's place (render space), M its bones in its own frame;
  // K.drawOthers(list, shadowTex, skyTex) / K.drawOthersShadow(list): each {tex, col: [r, g, b, 1] the jacket's colour}
  const COL0 = [0, 0, 0, 0], oData = new Float32Array(4 * 32 * 4), OCLO = { p: [0.25, 0.25, 0.35, 0.35], q: [0.5, 0.5, 1, 1] };
  K.otherTex = () => gfx ? gfx.texture({ w: 4, h: 32, format: 'rgba32f', filter: 'nearest' }) : null;
  K.otherBones = function (tex, R, M) { if (!gfx || !tex) return; for (let i = 0; i < K.NB; i++) oData.set(m4.mul(R, M[i]), i * 16); gfx.updateTexture(tex, 0, 0, 4, 32, oData); };
  K.drawOthers = function (list, shadowTex, skyTex) { if (!pipe || !count || !list.length) return; wantBody(); OCLO.q[2] = clo.q[2]; OCLO.q[3] = clo.q[3];
    for (const o of list) gfx.draw(pipe, { u: { p: OCLO.p, q: OCLO.q, r: nite, s: CUT0, c: o.col }, tex: { tBones: o.tex, tDetail: Tex.detail, tShadow: shadowTex, tSky: skyTex }, vb: [vb, vb2], ib, count }); };
  K.drawOthersShadow = function (list) { if (!pipeShadow || !count) return; for (const o of list) gfx.draw(pipeShadow, { u: { p: [0, 0, 0, 0] }, tex: { tBones: o.tex }, vb: [vb, vb2], ib, count }); };
  return K;
})();

// (bw: two bones and the share of the first; w carries a third bone and its share as whole number + fraction, 0 = none)
const SKIN_SSL = `
fn boneM(i: f32) -> mat4x4f { let r: i32 = i32(i + 0.5); return mat4x4f(texFetch(tBones, vec2i(0, r), 0), texFetch(tBones, vec2i(1, r), 0), texFetch(tBones, vec2i(2, r), 0), texFetch(tBones, vec2i(3, r), 0)); }
struct SkinV { wp: vec3f, n: vec3f, }
fn skinVertex(pos: vec3f, nrm: vec3f, bw: vec4f) -> SkinV {
  var s: SkinV;
  let b2: f32 = floor(bw.w); let w2: f32 = bw.w - b2;
  let m0: mat4x4f = boneM(bw.x); let m1: mat4x4f = boneM(bw.y); let m2: mat4x4f = boneM(b2);
  let p0: vec4f = m0 * vec4f(pos, 1.0); let p1: vec4f = m1 * vec4f(pos, 1.0); let p2: vec4f = m2 * vec4f(pos, 1.0);
  s.wp = mix(mix(p1.xyz, p0.xyz, bw.z), p2.xyz, w2);
  let n0: vec4f = m0 * vec4f(nrm, 0.0); let n1: vec4f = m1 * vec4f(nrm, 0.0); let n2: vec4f = m2 * vec4f(nrm, 0.0);
  s.n = normalize(mix(mix(n1.xyz, n0.xyz, bw.z), n2.xyz, w2));
  return s;
}
`;

// (the shapes the pack is drawn from, as the distance field has them: a rounded box, an ellipsoid, a soft union; skN: a smooth noise, -0.5..0.5, one
// cell to the unit; skFold: the folds of cloth round a limb: that noise laid in rings (q: from a point on the limb's line, ax: the line, sv: cells to the
// metre along it, px: what a pixel covers: cells smaller than a few pixels fade out); skLine: a seam, d away: a pixel wide at least, fainter the thinner
// it is than a pixel)
const SKIER_SSL = `
fn skBox(p: vec3f, c: vec3f, h: vec3f, r: f32) -> f32 { let q: vec3f = abs(p - c) - h + vec3f(r); return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
fn skEll(p: vec3f, c: vec3f, r: vec3f) -> f32 { let q: vec3f = (p - c) / r; let k0: f32 = length(q); return k0 * (k0 - 1.0) / max(length(q / r), 1e-6); }
fn skMin(a: f32, b: f32, k: f32) -> f32 { let h: f32 = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
fn skN(p: vec2f) -> f32 {
  let i: vec2f = floor(p); let f: vec2f = p - i; let u: vec2f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y) - 0.5;
}
fn skFold(q: vec3f, ax: vec3f, sv: f32, px: f32) -> f32 {
  let t: f32 = dot(q, ax); let r: vec3f = q - ax * t; let rn: vec3f = r / max(length(r), 1e-4); let w: f32 = px * sv;
  let uv: vec2f = vec2f(0.66 * rn.x + 0.42 * rn.y + 0.30 * rn.z, t * sv + 0.90 * rn.z - 0.60 * rn.x + 0.48 * rn.y);
  return skN(uv) * saturate(1.6 - w * 4.0) + 0.5 * skN(uv * 2.03 + vec2f(17.1, 9.2)) * saturate(1.6 - w * 8.0);
}
fn skLine(d: f32, px: f32) -> f32 { let w: f32 = 0.0011 + px * 0.5; return smoothstep(w, w * 0.4, d) * saturate(0.004 / (px + 0.0008)); }
`;

// (jacket, gloves and poles take their colours and materials from SKIER_LOOK, at the top of this file)
const SKIER_FS = (L => { const V = a => 'vec3f(' + a.map(x => x.toFixed(3)).join(', ') + ')', F = x => x.toFixed(3); return `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  // (seen from inside its own head, first person: what of the figure is near the lens (head, neck, collar, pack, shoulders) is left out, fading
  // through a fixed screen-door pattern between M.s.x and M.s.y metres; what is further (legs, skis) stays)
  if (M.s.y > 0.0) { let dc: f32 = distance(v.wp, U.camPos.xyz); if (dc < M.s.y) { let dz: f32 = fract(52.9829189 * fract(dot(v.clip.xy, vec2f(0.06711056, 0.00583715)))); if (dc < mix(M.s.x, M.s.y, dz)) { discard; } } }
  var id: f32 = floor(v.mat.x + 0.5);
  let qy: f32 = v.mat.z; let qz: f32 = v.mat.w;
  if (id > 3.5 && id < 4.5 && abs(qy - 0.004) < 0.020 && qz > -0.09) { id = 6.0; }
  if (id > 4.5 && id < 5.5 && (qz > -0.1265 || abs(qy) > 0.031 || abs(v.bp.x) > 0.074)) { id = 6.0; }
  var N: vec3f = normalize(v.nrm);
  let V: vec3f = normalize(U.camPos.xyz - v.wp);
  let L: vec3f = U.sunDir.xyz;
  let bp: vec3f = v.bp; let bn: vec3f = normalize(v.bn);
  let weave: vec4f = tex(tDetail, bp.xy * 3.1 + bp.zz * vec2f(2.3, 1.7));
  // (px: how much of the body one pixel covers, m; fold: the height of the cloth's folds over the body, m; sd: how far the nearest seam is, m; shell: how
  // much of a shell cloth's sheen; dark: what lies close over it takes the light away; kz: how much of all that shows, in the version the owner picked)
  let px: f32 = length(dpdx(bp)) + length(dpdy(bp)); let sideR: f32 = step(0.0, bp.x); let kz: f32 = M.q.z;
  let big: f32 = skN(bp.xy * 5.0 + bp.zz * vec2f(3.7, 2.8)) * saturate(1.6 - px * 20.0);      // (the padding is not even)
  let lay: f32 = saturate(0.55 + skN(bp.yz * 2.7 + bp.xx * vec2f(1.9, 1.4)) * 4.0);            // (the long folds lie in patches)
  var fold: f32 = 0.0; var sd: f32 = 1.0; var shell: f32 = 0.0; var dark: f32 = 0.0;
  var alb: vec3f = vec3f(0.5); var specP: f32 = 20.0; var specS: f32 = 0.03; var sheen: f32 = 0.0; var gloss: f32 = 0.0; var glossTint: vec3f = vec3f(1.0); var cloth: f32 = 0.0; var lensK: f32 = 0.0; var lensV: f32 = 0.0;
  let orange: vec3f = mix(${V(L.jacket.alb)}, M.c.rgb, step(0.5, M.c.w)); let navy: vec3f = ${V(L.sleeveFore.alb)};
  /*MARKS*/
  // where one garment ends on another the edge is drawn here, pixel by pixel, from the garment's own line, a few millimetres inside the lip the mesh
  // makes of it: a mesh cannot keep such an edge straight (it came out as a ragged fringe that read as fur), a line can.
  // jacket or trousers: by the line of the hem (well above it: by which of the two is nearer)
  if (id < 1.5) { id = 1.0; if (hemV > 0.006 && (hemV < 0.05 || v.mat.z > -0.012)) { id = 0.0; } }
  // sleeve or gauntlet (Variants 'hand' b): by the gauntlet's edge, a line round the forearm GAUNT.len short of the wrist. Decided per triangle the
  // edge was a sawtooth (the body's grid is 13.5 mm). The fine glove's own pixels (mat.z > 0) keep what they are
  let hb: f32 = M.r.z; let kit: f32 = M.r.w;
  if (hb > 0.5 && armF > 0.10 && ((id > 1.5 && id < 2.5 && v.mat.z < 0.05) || (id < 0.5 && v.mat.w < 0.0))) { id = select(0.0, 2.0, armF > gEdge); }
  // trousers or boot: by the line of the trouser hem, down the shin
  // (nb: the new body (Variants 'body' b), whose trousers hang lower over the boot and whose sleeve runs into the shoulder without an armhole seam)
  let nb: f32 = M.r.y; let hemS: f32 = mix(0.349, 0.362, nb);
  // (new body: where the helmet meets the collar and the gaiter its rim is drawn from the helmet's own shape, not from the mesh's triangles, which left a
  // ragged white fringe; the strap round it is found the same way)
  // ...and the goggles, their strap and the gaiter: every pixel of the head and of the collar under it takes the material whose shape it lies on
  var strapK: f32 = 0.0; var colK: f32 = 0.0;
  if (nb > 0.5 && (id < 1.5 || (id > 3.5 && id < 7.5)) && length(hd3) < 0.34) {      // (id 1 too: the jacket-or-trousers rule above takes a few collar triangles for trousers)
    let dH: f32 = hdHelm(hd3); let dG: f32 = hdGog(hd3); let dB: f32 = hdBuff(hd3);
    let dm: f32 = min(dH, min(dG - 0.002, dB));
    if (min(dm, colD) < 0.016) {
      var best: f32 = colD; var nid: f32 = 0.0;
      if (dB + 0.003 * nb < best) { best = dB; nid = 7.0; } if (dH < best) { best = dH; nid = 4.0; } if (dG - 0.002 < best) { best = dG; nid = 6.0; }
      id = nid; colK = select(0.0, 1.0, nid < 0.5);     // (a pixel given to the collar is torso, whatever the triangle under it was skinned as: the sleeve's navy cuff left dark teeth along the gaiter)
      let gc: vec3f = hdGogA(hd3);
      if (id > 5.5 && id < 6.5 && gc.x > ${(Skier.HEAD.gr).toFixed(4)} && abs(gc.z) < ${(Skier.HEAD.gh - 0.007).toFixed(4)} && gc.y < ${(Skier.HEAD.ga - 0.11).toFixed(4)}) { id = 5.0; }     // the lens: the outer face inside the frame
      if (id > 3.5 && id < 4.5 && abs(hd3.y - ${(Skier.HEAD.gy).toFixed(4)}) < ${(Skier.HEAD.sh).toFixed(4)}) { id = 6.0; strapK = 1.0; }                                  // the strap round the shell
    }
  }
  if (legS > 0.25 && ((id > 0.5 && id < 1.5) || (id > 2.5 && id < 3.5))) { id = select(3.0, 1.0, legS < hemS); }
  // jacket or pack: by the pack's own outline
  if (id < 0.5 || (id > 7.5 && id < 8.5)) { id = select(0.0, 8.0, pkD < 0.006); }
  if (id < 0.5) {            // jacket: orange shell, dark forearms, a pale band round the upper sleeves, pack straps over the shoulders
    let onTorso: f32 = max(smoothstep(-0.004, 0.004, v.mat.w), colK);
    let fore: f32 = mix(smoothstep(0.035, 0.065, armF), smoothstep(0.140, 0.152, armF), nb) * (1.0 - onTorso) * (1.0 - hb);     // (new glove: the shell's own colour right down to the gauntlet, as on real jackets)     // (new body: only a navy storm cuff, under the gauntlet's edge)
    alb = mix(orange, navy, fore);
    let chev: f32 = smoothstep(0.016, 0.011, abs(armU - 0.150)) * (1.0 - onTorso) * (1.0 - fore);
    alb = mix(alb, ${V(L.sleeveBand.alb)}, chev);
    sheen = ${F(L.jacket.sheen)}; cloth = ${F(L.jacket.cloth)}; specS = ${F(L.jacket.specS)}; specP = ${F(L.jacket.specP)};
    let sx: f32 = abs(abs(tl.x) - 0.096);
    var bkK: f32 = 0.0;
    var strap: f32 = max(smoothstep(0.021, 0.017, sx) * smoothstep(-0.17, -0.15, tl.y), smoothstep(0.022, 0.018, abs(tl.y + 0.19))) * onTorso;
    var strapEdge: f32 = max(smoothstep(0.030, 0.021, sx) * smoothstep(-0.18, -0.15, tl.y), smoothstep(0.031, 0.022, abs(tl.y + 0.19))) * onTorso;
    if (nb > 0.5) {
      // (new body: a pack harness, not a safety vest: on the front the shoulder straps are narrow and curve out over the chest to pass under the arms,
      // joined by a small sternum strap; at the waist a slim hip belt with a buckle; behind, they run straight down into the pack as before)
      let frK: f32 = smoothstep(0.03, -0.05, tl.z);
      let xc: f32 = mix(0.096, 0.080 + 0.090 * smoothstep(0.20, -0.14, tl.y), frK);
      let sxN: f32 = abs(abs(tl.x) - xc); let hw: f32 = mix(0.016, 0.0105, frK);
      let topK: f32 = smoothstep(-0.17, -0.15, tl.y) * mix(1.0, smoothstep(-0.13, -0.09, tl.y), frK);
      let stern: f32 = smoothstep(0.0065, 0.0045, abs(tl.y - 0.085)) * step(abs(tl.x), xc) * frK;
      let belt: f32 = smoothstep(0.0115, 0.0085, abs(tl.y + 0.19));
      strap = max(max(smoothstep(hw + 0.0015, hw - 0.0015, sxN) * topK, stern), belt) * onTorso;
      strapEdge = max(max(smoothstep(hw + 0.008, hw + 0.002, sxN) * topK, smoothstep(0.012, 0.007, abs(tl.y - 0.085)) * step(abs(tl.x), xc) * frK), smoothstep(0.018, 0.012, abs(tl.y + 0.19))) * onTorso;
      // buckles: the sternum strap's and the hip belt's, in the middle
      bkK = (smoothstep(0.012, 0.009, abs(tl.x)) * stern + smoothstep(0.020, 0.016, abs(tl.x)) * belt * frK) * onTorso;
      // the front: a storm flap over the zip, a chest pocket zip on the left, a small pale patch on the right
      let zipC: f32 = smoothstep(0.0028, 0.0012, abs(tl.x - 0.016)) * frK * step(-0.17, tl.y) * onTorso;
      let pkZ: f32 = smoothstep(0.0024, 0.0010, abs(tl.x + 0.052 + 0.25 * (tl.y - 0.13))) * smoothstep(0.004, 0.0, abs(tl.y - 0.115) - 0.040) * frK * onTorso;
      let pch: f32 = smoothstep(0.002, 0.0, max(abs(tl.x - 0.050) - 0.016, abs(tl.y - 0.140) - 0.007)) * frK * onTorso * (1.0 - strap);
      alb = mix(alb, vec3f(0.035, 0.040, 0.050), max(zipC, pkZ) * 0.85);
      alb = mix(alb, vec3f(0.75, 0.76, 0.74), pch);
    }
    alb *= 1.0 - 0.45 * (strapEdge - strap);
    alb = mix(alb, vec3f(0.040, 0.048, 0.062), strap); sheen = mix(sheen, 0.2, strap); cloth = mix(cloth, 0.5, strap);
    alb = mix(alb, vec3f(0.30, 0.31, 0.33), bkK);
    // its cloth: gathered in rings where the elbow bends (the more it is bent the deeper), in long soft folds down the sleeve and round the body, bunched
    // above the hem; it is padded, so it swells between its seams, and the straps and the pack press into it
    let slv: f32 = 1.0 - onTorso; let de: f32 = length(eq); let elb: f32 = mix(M.p.x, M.p.y, sideR); let tf: f32 = 0.5 * (M.q.x + M.q.y);
    let fe: f32 = skFold(eq, armAx, 28.0, px); let fs: f32 = skFold(eq, normalize(armAx + vec3f(0.35, 0.0, 0.45)), 14.0, px);
    let fw: f32 = skFold(pl, vec3f(0.0, 1.0, 0.0), 15.5, px); let ft: f32 = skFold(tl, vec3f(0.45, 0.88, 0.13), 9.0, px);
    // (above the hem: with the trunk folded forward the back is drawn taut and the front is crowded)
    let waist: f32 = smoothstep(0.010, 0.05, hemV) * smoothstep(0.34, 0.14, hemV) * mix(1.0 + 0.6 * tf, 1.0 - 0.55 * tf, smoothstep(-0.03, 0.05, pl.z));
    // (new glove: the sleeve is pushed up by the gauntlet and stands in small rings above its edge)
    let bun: f32 = hb * slv * smoothstep(gEdge - 0.055, gEdge - 0.004, armF) * step(armF, gEdge);
    fold = bun * 0.005 * (abs(skFold(eq, foreD, 36.0, px)) * 2.0 - 0.3) + slv * (exp(-de * de / mix(0.014, 0.022, nb)) * (0.004 + 0.013 * elb) * mix(1.0, 0.45, nb) * (abs(fe) * 2.0 - 0.2) + (0.030 + 0.012 * nb) * lay * fs) + onTorso * (waist * 0.030 * fw + (0.024 + 0.012 * nb) * lay * ft) + 0.010 * big;
    // seams: round the armhole, down the flank, the band of the hem, the flap over the front zip; the two pocket zips
    let flank: f32 = mix(pl.z - 0.005, tl.z - 0.012, smoothstep(0.10, 0.25, hemV));
    sd = min(abs(v.mat.w) * 0.6 + nb, abs(hemV - 0.034) + slv);
    sd = min(sd, abs(flank) + slv + step(abs(bp.x), 0.10));
    sd = min(sd, abs(tl.x - 0.016) + slv + step(-0.03, tl.z));
    let pz: vec2f = vec2f(abs(tl.x) - 0.078, tl.y + 0.075); let pd: vec2f = vec2f(0.050, -0.090);
    let zipD: f32 = length(pz - pd * saturate(dot(pz, pd) / dot(pd, pd))) + slv + step(-0.03, tl.z);
    fold -= 0.0035 * exp(-min(sd, zipD) * 80.0);
    fold = mix(fold, -0.003, strap) + 0.001 * (strapEdge - strap);
    alb *= 1.0 - kz * (0.10 * smoothstep(0.036, 0.032, hemV) * onTorso + 0.85 * smoothstep(0.0034, 0.0020, zipD));
    dark = 0.42 * smoothstep(0.040, 0.008, pkD); shell = 1.0 - 0.6 * strap;
    if (kit > 0.5) {
      // (kit b) stitching: a pale thread a few millimetres either side of every seam, the way a shell is top-stitched; gone once a pixel is wider than it
      let stF: f32 = saturate(1.6 - px * 500.0) * (1.0 - strap);
      let st: f32 = smoothstep(0.0010, 0.0003, abs(min(sd, zipD) - 0.0042)) * stF;
      alb = mix(alb, alb * 1.35 + 0.02, st * 0.6); fold += st * 0.0002;
      // the zip's pull at the top of the front, under the chin, and the chest pocket's at the top of its zip
      let pull: f32 = smoothstep(0.0012, 0.0, max(abs(tl.x - 0.016) - 0.0035, abs(tl.y - 0.150) - 0.013)) * smoothstep(0.03, -0.05, tl.z) * onTorso;
      let pull2: f32 = smoothstep(0.0012, 0.0, max(abs(tl.x + 0.058) - 0.0030, abs(tl.y - 0.150) - 0.010)) * smoothstep(0.03, -0.05, tl.z) * onTorso;
      alb = mix(alb, vec3f(0.05, 0.055, 0.06), max(pull, pull2)); specS = mix(specS, 0.4, max(pull, pull2)); fold += 0.0015 * max(pull, pull2);
      // the hem's drawcord toggles, at the front either side
      let tg: f32 = smoothstep(0.0065, 0.0045, length(vec2f(abs(pl.x) - 0.125, hemV - 0.022))) * smoothstep(0.0, -0.06, pl.z) * onTorso;
      alb = mix(alb, vec3f(0.04, 0.045, 0.05), tg); fold += 0.003 * tg; specS = mix(specS, 0.3, tg);
      // a dusting of snow on what faces up (shoulders, the tops of the arms), patchy, never a coat of it
      let fineJ: vec4f = texLod(tDetail, bp.xy * 11.0 + bp.zz * vec2f(7.0, 5.0), log2(max(px * 5600.0, 1.0)));
      let snJ: f32 = smoothstep(0.55, 0.92, bn.y) * smoothstep(0.62, 0.90, fineJ.w * 0.65 + weave.z * 0.45) * (1.0 - strap);
      alb = mix(alb, vec3f(0.80, 0.85, 0.92), snJ * 0.55); cloth = mix(cloth, 0.3, snJ);
    }
  } else if (id < 1.5) {     // trousers: slate shell (not black: the seat and the legs have to show their form), a dusting of snow at the hems
    alb = vec3f(0.066, 0.082, 0.108);
    // their cloth: creased behind the knee and across the lap (the more the leg is folded the deeper), stacked in rings above the boot, long soft folds between
    let kne: f32 = mix(M.p.z, M.p.w, sideR); let hpf: f32 = mix(M.q.x, M.q.y, sideR); let inL: f32 = smoothstep(0.0, 0.03, bm.x);
    let dk: f32 = length(kq - legB * 0.04); let dh: f32 = length(hq + legB * 0.05 - thD * 0.03);
    let fk: f32 = skFold(kq, legAx, 29.0, px); let fh: f32 = skFold(hq, thD, 26.0, px); let fl: f32 = skFold(hq, normalize(legAx + legB * 0.55 + vec3f(0.25, 0.0, 0.0)), 12.0, px); let fc: f32 = skFold(kq, shD, 27.0, px);
    let stack: f32 = smoothstep(0.10, 0.26, legS) * smoothstep(hemS, hemS - 0.024, legS);
    fold = inL * (exp(-dk * dk / 0.016) * (0.004 + 0.013 * kne) * (abs(fk) * 2.0 - 0.2) + exp(-dh * dh / 0.018) * (0.003 + 0.012 * hpf) * (abs(fh) * 2.0 - 0.2) + stack * (0.022 + 0.014 * nb * (0.5 + kne)) * fc + (0.022 + 0.014 * nb) * lay * fl) + (0.008 + 0.006 * nb) * big;
    // (new body: the bent knee gathers the cloth behind it into a fan of compression folds, and the leg crumples onto the boot cuff)
    let fkb: f32 = skFold(kq, normalize(legAx + legB * 0.45), 21.0, px); let bkK: f32 = exp(-dot(kq - legB * 0.06, kq - legB * 0.06) / 0.006);
    let cufK: f32 = smoothstep(hemS - 0.075, hemS - 0.030, legS) * smoothstep(hemS + 0.004, hemS - 0.012, legS);
    fold += nb * inL * (bkK * (0.006 + 0.026 * kne) * (abs(fkb) * 2.0 - 0.3) + cufK * (0.010 + 0.016 * kne) * (abs(fc) * 2.0 - 0.3));
    // seams: down the outside of the leg, up the seat, a panel over the knee, the band of the cuff
    let rl: vec3f = mix(hq - thD * thU, kq - shD * legS, smoothstep(-0.03, 0.03, legS));
    sd = min(abs(rl.z) + step(rl.x, 0.0), abs(bp.x) + step(pl.z, 0.03));
    sd = min(sd, abs(length(kq + legB * 0.03) - 0.105) + step(0.0, dot(kq, legB)));
    sd = min(sd, abs(legS - hemS + 0.040));
    fold -= 0.003 * exp(-sd * 80.0);
    alb *= 1.0 - kz * mix(0.12, 0.0, nb) * smoothstep(hemS - 0.042, hemS - 0.038, legS);     // (new body: no dark band at the cuff, only its panel line)
    // (new body: the cloth is shaded into the bends: the hollow behind the knee and the crease across the lap darken as far as they are folded)
    dark = nb * (0.38 * kne * exp(-dot(kq - legB * 0.05, kq - legB * 0.05) / 0.005) + 0.30 * hpf * exp(-dh * dh / 0.006) + 0.22 * cufK * saturate(-fold * 90.0)) * inL;
    // (the jacket's hem lies close over them, except at the back, where it rides up and down the seat)
    dark = max(dark, 0.5 * smoothstep(-0.030, -0.002, hemV) * (1.0 - smoothstep(-0.02, 0.07, pl.z)));
    let fine: vec4f = texLod(tDetail, bp.xy * 11.0 + bp.zz * vec2f(7.0, 5.0), log2(max(px * 5600.0, 1.0)));
    let snowy: f32 = mix(smoothstep(0.31, 0.235, bp.y), smoothstep(0.30, 0.17, bp.y), nb) * smoothstep(0.55, 0.85, fine.w * 0.6 + weave.z * 0.5 + smoothstep(0.28, 0.235, bp.y) * 0.2 + kz * 0.25 * saturate(-fold * 120.0));
    alb = mix(alb, vec3f(0.78, 0.83, 0.90), snowy * mix(0.5, 0.22, nb));     // (new body: a fainter, patchier dusting with no edge to it)
    sheen = mix(0.35, 0.28, nb); cloth = 1.0; specS = mix(0.04, 0.035, nb); shell = mix(0.45, 0.42, nb);     // (new body: a soft sheen on the waterproof face)
    if (kit > 0.5) {
      // (kit b) a cargo pocket on the outside of the thigh, just in front of the side seam, a flap over its top and a snap; ...
      let pq: vec2f = vec2f(thU - 0.230, rl.z + 0.030); let pkB: vec2f = abs(pq) - vec2f(0.070, 0.036);
      let pkd: f32 = length(max(pkB, vec2f(0.0))) + min(max(pkB.x, pkB.y), 0.0);
      let onP: f32 = smoothstep(0.03, 0.05, rl.x) * step(legS, -0.04);
      let flap: f32 = step(pkd, 0.0) * step(thU, 0.192) * onP;
      fold += onP * (0.0018 * smoothstep(0.004, 0.0, -pkd) * step(pkd, 0.0) - 0.0016 * exp(-abs(pkd) * 600.0) - 0.0014 * exp(-abs(thU - 0.192) * 700.0) * step(pkd, 0.0));
      alb *= 1.0 - onP * 0.35 * smoothstep(0.012, 0.0, thU - 0.192) * step(0.192, thU) * step(pkd, 0.0);      // (the shade under the flap)
      let snap: f32 = smoothstep(0.0045, 0.0030, length(vec2f(thU - 0.177, rl.z + 0.030))) * onP;
      alb = mix(alb, vec3f(0.11, 0.115, 0.12), snap); specS = mix(specS, 0.5, snap);
      // ... stitching beside the seams and round the pocket ...
      let stF: f32 = saturate(1.6 - px * 500.0);
      let st: f32 = smoothstep(0.0010, 0.0003, abs(min(sd, abs(pkd) + 1.0 - onP) - 0.0040)) * stF * inL;
      alb = mix(alb, alb * 1.45 + 0.015, st * 0.6);
      // ... and the scuff guards: a tougher, darker, glossier patch inside each ankle, where the other ski's edge catches
      let scuff: f32 = smoothstep(0.022, 0.012, bm.x - 0.115) * smoothstep(hemS - 0.105, hemS - 0.090, legS) * smoothstep(hemS + 0.004, hemS - 0.004, legS);
      alb = mix(alb, vec3f(0.030, 0.033, 0.038), scuff); specS = mix(specS, 0.12, scuff); specP = mix(specP, 40.0, scuff); cloth = mix(cloth, 0.6, scuff);
      fold -= 0.0015 * exp(-abs(bm.x - 0.115 - 0.017) * 500.0) * smoothstep(hemS - 0.105, hemS - 0.090, legS) * step(legS, hemS);
    }
  } else if (id < 2.5) {     // gloves
    alb = ${V(L.glove.alb)}; sheen = ${F(L.glove.sheen)}; specS = ${F(L.glove.specS)}; specP = ${F(L.glove.specP)};
    if (hb > 0.5 && v.mat.z > 0.05) {
      // the new glove (Variants 'hand' b), as real ski gloves are made: leather where the hand holds (fingers, palm, the thumb), so the knuckles and
      // the curled fingers catch a small hard highlight; a nylon back with a padded panel; a ribbed elastic band round the wrist with a pale tab.
      // fin: which finger (0 = none); hx: how far out of the back of the hand; gu: how far past the wrist toward the knuckles
      let fin: f32 = floor(v.mat.z); let hx: f32 = (fract(v.mat.z) - 0.5) * 0.2; let gu: f32 = v.mat.w;
      let lea: f32 = max(step(0.5, fin), smoothstep(0.022, 0.006, hx));
      alb = mix(${V(L.gloveBack.alb)}, ${V(L.gloveLeather.alb)}, lea);
      sheen = mix(${F(L.gloveBack.sheen)}, ${F(L.gloveLeather.sheen)}, lea); cloth = 1.0 - lea; specS = mix(${F(L.gloveBack.specS)}, ${F(L.gloveLeather.specS)}, lea); specP = mix(${F(L.gloveBack.specP)}, ${F(L.gloveLeather.specP)}, lea); gloss = 0.03 * lea;
      // (the seam where the leather of the palm meets the nylon back, round the side of the hand)
      sd = abs(hx - 0.014) + step(0.5, fin);
      fold -= 0.0012 * exp(-sd * 260.0);
      let rib: f32 = smoothstep(0.009, 0.006, abs(gu + 0.014)) * (1.0 - step(0.5, fin));
      fold += rib * 0.0006 * sin(gu * 2400.0);
      alb = mix(alb, ${V(L.gloveBand.alb)}, rib);
      let tab: f32 = smoothstep(0.0012, 0.0, max(abs(hx - 0.050) - 0.010, abs(gu + 0.006) - 0.010)) * (1.0 - step(0.5, fin));
      alb = mix(alb, ${V(L.gloveTab.alb)}, tab); specS = mix(specS, 0.05, tab);
    } else if (hb > 0.5) {
      // its gauntlet: nylon, a drawcord in a grey hem round its edge and a pale cord lock on the outside of the arm
      let e: f32 = armF - gEdge; let aq: vec3f = eq - foreD * dot(eq, foreD); let outK: f32 = dot(aq, vec3f(1.0, 0.0, 0.0)) / max(length(aq), 1e-4);
      alb = ${V(L.gloveBack.alb)}; sheen = ${F(L.gloveBack.sheen)}; cloth = 1.0; specS = ${F(L.gloveBack.specS)}; specP = ${F(L.gloveBack.specP)};
      let hem: f32 = smoothstep(0.010, 0.0075, e);
      alb = mix(alb, ${V(L.gloveBand.alb)}, hem); fold = hem * 0.0015 * (abs(skFold(eq, foreD, 70.0, px)) * 2.0 - 0.4) - 0.0015 * exp(-abs(e - 0.010) * 500.0);
      let lockK: f32 = smoothstep(0.80, 0.90, outK) * smoothstep(0.004, 0.0, abs(e - 0.012) - 0.009);
      alb = mix(alb, ${V(L.gloveTab.alb)}, lockK); specS = mix(specS, 0.25, lockK); fold += lockK * 0.002;
      // (and its folds: the stuffed cuff wrinkles across where the wrist bends)
      fold += 0.0025 * (1.0 - hem) * (abs(skFold(eq, foreD, 22.0, px)) * 2.0 - 0.4);
    }
  } else if (id < 3.5) {     // boots: graphite shell (pale ones are lost against the snow and the legs seem to end at the hem), orange buckles
    alb = vec3f(0.055, 0.058, 0.066);
    let bk: f32 = smoothstep(0.012, 0.006, abs(fract(bp.y * 14.0) - 0.5) * 0.07) * step(0.14, bp.y) * step(bp.z, 0.02);
    alb = mix(alb, orange, bk * 0.9 * (1.0 - kit));
    if (kit > 0.5) {
      // (kit b) as alpine boots are: two buckles over the forefoot and two round the cuff, levers on the outside, orange; a black power strap round the top
      let bx: f32 = bm.x - 0.155; let outB: f32 = smoothstep(0.012, 0.030, bx);
      var lev: f32 = 0.0;
      lev = max(lev, smoothstep(0.0015, 0.0, max(abs(bp.y - 0.115) - 0.007, abs(bp.z + 0.105) - 0.017)));
      lev = max(lev, smoothstep(0.0015, 0.0, max(abs(bp.y - 0.150) - 0.007, abs(bp.z + 0.040) - 0.017)));
      lev = max(lev, smoothstep(0.0015, 0.0, max(abs(bp.y - 0.225) - 0.007, abs(bp.z + 0.005) - 0.018)));
      lev = max(lev, smoothstep(0.0015, 0.0, max(abs(bp.y - 0.285) - 0.007, abs(bp.z + 0.000) - 0.018)));
      lev *= outB;
      // (each lever bites on a ladder: a row of small ribs just ahead of it; and the cuff turns on a riveted pivot over the ankle bone, both sides)
      let lad: f32 = (smoothstep(0.0012, 0.0, max(abs(bp.y - 0.115) - 0.004, abs(bp.z + 0.135) - 0.012)) + smoothstep(0.0012, 0.0, max(abs(bp.y - 0.225) - 0.004, abs(bp.z + 0.030) - 0.012))) * step(0.5, fract(bp.z * 330.0)) * outB;
      let piv: vec2f = vec2f(bp.y - 0.180, bp.z - 0.012);
      let riv: f32 = smoothstep(0.0075, 0.0055, length(piv)) * smoothstep(0.012, 0.026, abs(bx));
      alb = mix(alb, vec3f(0.30, 0.31, 0.33), max(lad * 0.8, riv)); fold += 0.0012 * lad + 0.0018 * riv - 0.0012 * smoothstep(0.0015, 0.0, abs(length(piv) - 0.0075));
      alb = mix(alb, orange, lev * 0.95); specS = mix(0.35, 0.5, lev); fold += 0.0025 * lev;
      // (the shell's own seam: the overlap of the cuff over the lower shell, a line from the instep down to behind the ankle)
      let ov: f32 = smoothstep(0.0025, 0.0, abs(bp.y - 0.165 - 0.35 * (bp.z + 0.02))) * step(0.06, bp.y);
      fold -= 0.0015 * ov; alb *= 1.0 - 0.35 * ov;
      let ps: f32 = smoothstep(0.336, 0.340, bp.y) * smoothstep(0.372, 0.368, bp.y);
      alb = mix(alb, vec3f(0.018, 0.018, 0.020), ps); specS = mix(specS, 0.06, ps); fold += 0.0015 * ps;
    }
    let sole: f32 = step(bp.y, 0.060); alb = mix(alb, vec3f(0.02), sole);
    specS = 0.35; specP = 60.0; gloss = 0.06;
  } else if (id < 4.5) {     // helmet: matte white with an orange centre stripe
    alb = vec3f(0.80, 0.80, 0.77);
    alb = mix(alb, orange, smoothstep(0.016, 0.011, abs(bp.x)) * 0.95);
    specS = 0.18; specP = 40.0; gloss = 0.03;
    if (nb > 0.5) {      // (new body: vent slots either side of the ridge, the brim's underside in shade, a satin clear coat)
      let vs: f32 = smoothstep(0.0075, 0.0045, abs(abs(hd3.x) - 0.036)) * max(smoothstep(0.024, 0.018, abs(hd3.z + 0.035)), smoothstep(0.024, 0.018, abs(hd3.z - 0.050))) * step(0.055, hd3.y);
      alb = mix(alb, vec3f(0.03, 0.03, 0.035), vs); fold = -0.002 * vs;
      alb *= 1.0 - 0.35 * smoothstep(0.02, 0.0, hd3.y - 0.012) * smoothstep(-0.07, -0.10, hd3.z) * step(0.02, hd3.y);
      specS = 0.30; specP = 60.0; gloss = 0.05;
      if (kit > 0.5) {
        // (kit b) as freeride helmets are made (the reference sheet): a hard shell over a foam liner whose black edge band shows all round the
        // rim; a second row of vents beside the first and a pair over the brow; ear pads of black fabric; a fit dial at the back under the strap;
        // the shell a little glossier than the band. ye: the rim's own line (the distance field cuts the shell there, see HEAD.rim)
        let ye: f32 = ${Skier.HEAD.rim.toFixed(4)} + 0.25 * max(hd3.z, 0.0);
        let band: f32 = smoothstep(0.016, 0.012, hd3.y - ye);
        let vs2: f32 = smoothstep(0.0055, 0.0032, abs(abs(hd3.x) - 0.066)) * smoothstep(0.020, 0.014, abs(hd3.z - 0.010)) * step(0.040, hd3.y);
        let vb: f32 = smoothstep(0.0050, 0.0030, abs(hd3.y - 0.058)) * smoothstep(0.016, 0.011, abs(abs(hd3.x) - 0.030)) * step(hd3.z, -0.07);
        let vv: f32 = max(vs2, vb);
        alb = mix(alb, vec3f(0.03, 0.03, 0.035), vv); fold -= 0.0018 * vv;
        let el: vec3f = (vec3f(abs(hd3.x), hd3.y, hd3.z) - ${'vec3f(' + Skier.HEAD.ear.slice(0, 3).map(v => v.toFixed(4)).join(', ') + ')'}) / ${'vec3f(' + Skier.HEAD.ear.slice(3).map(v => v.toFixed(4)).join(', ') + ')'};
        let ear: f32 = smoothstep(1.0, 0.85, length(el.yz)) * step(0.075, abs(hd3.x));
        let dial: f32 = smoothstep(0.016, 0.013, length(vec2f(hd3.x, hd3.y - ye - 0.026))) * step(0.06, hd3.z);
        let dialR: f32 = smoothstep(0.0015, 0.0, abs(length(vec2f(hd3.x, hd3.y - ye - 0.026)) - 0.009)) * dial;
        alb = mix(alb, vec3f(0.028, 0.029, 0.033), max(band, max(ear, dial)));
        alb = mix(alb, vec3f(0.12, 0.12, 0.13), dialR);
        fold += 0.0012 * (band - smoothstep(0.004, 0.0, abs(hd3.y - ye - 0.016))) + 0.0015 * dial;
        sheen = mix(sheen, 0.5, max(band, ear)); cloth = max(cloth, ear);
        specS = mix(0.42, 0.06, max(band, max(ear, vv))); specP = mix(90.0, 24.0, max(band, ear)); gloss = mix(0.08, 0.0, max(band, ear));
      }
    }
  } else if (id < 5.5) {     // goggle lens: mirrored, iridescent
    alb = vec3f(0.01, 0.01, 0.015); gloss = 0.85; specS = 2.0; specP = 600.0;
    let fr: f32 = 1.0 - saturate(dot(N, V));
    glossTint = mix(vec3f(1.0, 0.62, 0.20), vec3f(0.95, 0.25, 0.55), fr);
    // (new body: a mirrored lens that runs from gold at the top to violet-blue at the bottom)
    // (new body: a tall mirrored lens that reflects the sky above and the bright snow below it, as a curved mirror does, in a gold-to-blue coating; the sun a hard glint)
    lensV = (hd3.y - ${Skier.HEAD.gy.toFixed(4)}) / ${Skier.HEAD.gh.toFixed(4)}; lensK = nb;
    glossTint = mix(glossTint, mix(vec3f(1.0, 0.78, 0.42), vec3f(0.55, 0.62, 1.0), smoothstep(0.5, -0.6, lensV)) * (1.05 + 0.3 * fr), nb);
  } else if (id < 6.5) {     // goggle frame + strap
    alb = mix(vec3f(0.02), orange, step(-0.095, qz));
    sheen = 0.2; specS = 0.06;
    if (nb > 0.5) {      // (new body: a thick satin black frame; the strap black webbing with an orange stripe woven along it)
      alb = mix(vec3f(0.025, 0.026, 0.03), mix(vec3f(0.02), orange, smoothstep(0.0040, 0.0025, abs(abs(hd3.y - ${Skier.HEAD.gy.toFixed(4)}) - 0.0075))), strapK);
      specS = mix(0.25, 0.04, strapK); specP = 40.0; cloth = 0.6 * strapK; sheen = 0.25;
    }
  } else if (id < 7.5) {     // neck gaiter
    alb = vec3f(0.022, 0.030, 0.045); sheen = 0.4; cloth = 1.0;
    if (nb > 0.5) {      // (new body: a charcoal knit, not a black hole: fine ribs round the neck, fading out when they are too small to see, and a soft fuzz)
      let rb: f32 = 0.5 + 0.5 * sin(hd3.y * 1047.0 + 0.35 * sin(hd3.x * 160.0));
      alb = vec3f(0.115, 0.118, 0.126) * (1.0 - 0.12 * rb * smoothstep(0.0040, 0.0016, px)); sheen = 0.7; fold = 0.0012 * (rb - 0.5) * smoothstep(0.0040, 0.0016, px);
    }
  } else if (id < 8.5) {     // backpack: slate body, orange lid, reflective tab
    alb = vec3f(0.045, 0.055, 0.070);
    let lid: f32 = smoothstep(0.082, 0.092, tl.y - (tl.z - 0.18) * 0.35);
    // (new body: the lid is the pack's own slate with an orange piping along its seam: an orange lid read as a hump of the jacket on the shoulders)
    let lidC: vec3f = mix(orange * 0.9, mix(vec3f(0.055, 0.065, 0.082), orange * 0.9, smoothstep(0.010, 0.004, abs(tl.y - (tl.z - 0.18) * 0.35 - 0.090))), nb);
    alb = mix(alb, lidC, lid);
    let zip: f32 = smoothstep(0.005, 0.002, abs(tl.x)) * (1.0 - lid);
    alb = mix(alb, vec3f(0.01), zip);
    let tab: f32 = smoothstep(0.03, 0.026, abs(tl.x)) * smoothstep(0.012, 0.009, abs(tl.y + 0.205));
    alb = mix(alb, vec3f(0.9), tab);
    sheen = 0.25; specS = 0.08; specP = 26.0; cloth = 0.6;
    // (its cloth: soft dents, a seam where the lid closes over the body, its sides turning away into the shade)
    fold = 0.012 * big; sd = abs(tl.y - (tl.z - 0.18) * 0.35 - 0.087); dark = 0.25 * smoothstep(-0.012, 0.006, pkD); shell = 0.5;
    if (kit > 0.5) {
      // (kit b) as ski packs are made (the reference sheet): two black compression straps across the back with pale buckles at the sides, the front
      // pocket's zip running round its top in a piping line, piping round the back panel's edge, a pale zip pull on the lid, a grab loop at the top
      let pz: f32 = step(0.20, tl.z);
      var strap: f32 = 0.0;
      strap = max(strap, smoothstep(0.0105, 0.0085, abs(tl.y - 0.040)));
      strap = max(strap, smoothstep(0.0105, 0.0085, abs(tl.y + 0.170)));
      strap *= pz * step(abs(tl.x), 0.118);
      let bk: f32 = strap * smoothstep(0.012, 0.009, abs(abs(tl.x) - 0.088));
      alb = mix(alb, vec3f(0.018, 0.018, 0.020), strap); alb = mix(alb, vec3f(0.55, 0.56, 0.57), bk);
      fold += 0.002 * strap + 0.0015 * bk - 0.0012 * smoothstep(0.0025, 0.0, abs(abs(tl.y - 0.040) - 0.0105)) * pz - 0.0012 * smoothstep(0.0025, 0.0, abs(abs(tl.y + 0.170) - 0.0105)) * pz;
      specS = mix(specS, 0.3, bk);
      let pq: vec3f = abs(tl - ${'vec3f(' + Skier.PACK.pocket.slice(0, 3).map(v => v.toFixed(4)).join(', ') + ')'}) - ${'vec3f(' + Skier.PACK.pocket.slice(3, 6).map(v => v.toFixed(4)).join(', ') + ')'};
      let pe: f32 = max(pq.x, pq.y);
      let pip: f32 = smoothstep(0.0028, 0.0010, abs(pe + 0.004)) * step(0.235, tl.z) * (1.0 - strap);
      alb = mix(alb, vec3f(0.012, 0.012, 0.014), pip); fold -= 0.0010 * pip;
      let rim: f32 = smoothstep(0.0040, 0.0015, abs(pkD + 0.006)) * (1.0 - strap) * (1.0 - lid);
      alb = mix(alb, orange * 0.8, rim * 0.85); fold += 0.0008 * rim;
      let pull: f32 = smoothstep(0.0015, 0.0, max(abs(tl.x - 0.050) - 0.006, abs(tl.y - (tl.z - 0.18) * 0.35 - 0.080) - 0.014)) * step(0.17, tl.z);
      alb = mix(alb, vec3f(0.70, 0.71, 0.70), pull); fold += 0.0012 * pull;
    }
  } else if (id < 9.5) {     // skis: graphic topsheet, bright base, steel edges
    let top: f32 = smoothstep(0.55, 0.8, v.mat.w); let base: f32 = smoothstep(-0.55, -0.8, v.mat.w); let z: f32 = v.mat.z;
    // (the same pair as the first-person view's: lemon going lime toward the tip, a black band with a pale pinstripe further back, an orange tail)
    let fz: f32 = fract(z * 3.2 + 0.87); let rear: f32 = smoothstep(-0.20, -0.25, z) * smoothstep(-0.46, -0.44, z);
    var topc: vec3f = mix(${V(L.ski.alb)}, ${V(L.skiTip.alb)}, smoothstep(-0.64, -0.93, z));
    topc = mix(topc, ${V(L.skiMark.alb)}, step(0.5, fz) * rear);
    topc = mix(topc, vec3f(0.85, 0.87, 0.86), smoothstep(0.03, 0.02, abs(fz - 0.5)) * rear);
    topc = mix(topc, orange, smoothstep(0.55, 0.60, z));
    // the sides: a black sidewall, with the steel edge a thin bright line along its foot and a narrower one where it turns into the topsheet;
    // the base: black sintered (a saturated base turned the pair teal whenever it was edged toward the lens), with the topsheet's lemon in two
    // thin bars by the tip and the maker's block by the tail, so the pair reads as one in every view
    let wv: f32 = v.mat.w;
    let steel: f32 = smoothstep(-0.70, -0.60, wv) * smoothstep(-0.38, -0.50, wv); let bev: f32 = smoothstep(0.38, 0.46, wv) * smoothstep(0.62, 0.52, wv);
    var sideC: vec3f = mix(vec3f(0.035, 0.037, 0.042), vec3f(0.62, 0.63, 0.65), steel); sideC = mix(sideC, vec3f(0.42, 0.43, 0.45), bev);
    let bz: f32 = min(min(abs(z + 0.700), abs(z + 0.672)), abs(z - 0.400) * 0.35);
    let baseC: vec3f = mix(vec3f(0.030, 0.032, 0.036), ${V(L.ski.alb)} * 0.75, smoothstep(0.0075, 0.0055, bz));
    alb = mix(sideC, topc, top); alb = mix(alb, baseC, base);
    specS = mix(mix(1.0, 2.4, max(steel, bev)), 0.5, top); specS = mix(specS, 0.7, base); specP = mix(90.0, 140.0, steel);
    gloss = mix(mix(0.18, 0.55, max(steel, bev)), 0.10, top); gloss = mix(gloss, 0.14, base);
  } else if (id < 10.5) {    // poles
    alb = mix(${V(L.pole.alb)}, ${V(L.poleGrip.alb)}, step(-0.105, v.mat.z));
    alb = mix(alb, ${V(L.poleBasket.alb)}, step(v.mat.z, -1.025) * step(-1.06, v.mat.z));   // baskets: dark (in a tuck they point straight back at the lens, and pale ones read as a pair of eyes)
    specS = ${F(L.pole.specS)}; specP = ${F(L.pole.specP)}; gloss = ${F(L.pole.gloss)};
  } else {                   // bindings: black housings on a grey plate, the heel lever in the jacket's orange
    alb = mix(vec3f(0.035, 0.037, 0.042), vec3f(0.30, 0.32, 0.34), step(bp.y, 0.047));
    alb = mix(alb, orange, step(0.212, bp.z) * step(0.086, bp.y));
    specS = 0.45; specP = 70.0; gloss = 0.05;
  }
  // the cloth, for the light: the folds are a height over the body: their slopes turn the surface, their hollows are darker; a seam is a thin dark line;
  // M.q.w and kz are how much of this shows in the version of the cloth the owner has picked (none of it: the flat cloth of before)
  fold *= M.q.w;
  let edge: f32 = step(0.5, abs(dpdx(id)) + abs(dpdy(id)));
  alb *= (1.0 - 0.30 * saturate(-fold * 95.0)) * (1.0 - kz * 0.34 * skLine(sd, px)) * (1.0 - kz * dark);
  let dpx: vec3f = dpdx(v.wp); let dpy: vec3f = dpdy(v.wp); let r1: vec3f = cross(dpy, N); let r2: vec3f = cross(N, dpx); let det: f32 = dot(dpx, r1);
  var grd: vec3f = (dpdx(fold) * r1 + dpdy(fold) * r2) * (sign(det) / max(abs(det), 1e-10));
  grd *= min(1.0, 1.1 / max(length(grd), 1e-5)) * saturate(dot(N, V) * 5.0) * (1.0 - edge);
  N = normalize(N - grd);
  // fabric micro-relief
  N = normalize(N + (vec3f(weave.x, weave.y, weave.z) - 0.5) * 0.22 * cloth);
  let ndl: f32 = dot(N, L); let ndv: f32 = saturate(dot(N, V));
  let sh: f32 = shadowAt(v.wp + N * 0.035, 0.0016);
  let ao: f32 = select(v.mat.y, max(v.mat.y, 0.7), nb > 0.5 && id > 6.5 && id < 7.5);     // (new body: the gaiter is soft and grey: the crease where it meets the collar keeps no dark triangles)
  let wrapD: f32 = saturate((ndl + 0.25 * cloth) / (1.0 + 0.25 * cloth));
  // at night the moon is the key, and by moonlight the eye sees little colour: what the moon and the sky light is seen half grey (the snow, white,
  // loses nothing by it), and the lifts that make the figure stand out by day (rim, fuzz, the glow through the shell, the pale floor of the rim)
  // fall away with the key: they made a bright orange cut-out against blue snow. The lamp's own spill (below) keeps the colour where it falls
  let nk: f32 = M.r.x; let albL: vec3f = alb;
  alb = mix(alb, vec3f(dot(alb, vec3f(0.30, 0.55, 0.15))), 0.4 * nk); let lift: f32 = 1.0 - 0.7 * nk;
  let amb: vec3f = U.ambSky.rgb * (0.5 + 0.5 * N.y) + U.ambGnd.rgb * (0.5 - 0.5 * N.y) * 1.25 + twiLight(N);
  var col: vec3f = alb * (U.sunCol.rgb * wrapD * sh + amb * ao);
  // sun through the fuzz at grazing angles, strongest when backlit
  let fr: f32 = pow(1.0 - ndv, 3.0);
  let back: f32 = saturate(dot(-V, L) * 0.5 + 0.5);
  col += (alb * 0.6 + 0.08) * U.sunCol.rgb * sheen * fr * (0.25 + 1.6 * back * back) * sh * saturate(ndl * 2.0 + 0.9) * lift;
  // against the light every edge that still sees the sun burns: the outline that lifts the figure off the snow
  let rim: f32 = pow(1.0 - ndv, 1.45) * back * back * saturate(ndl * 1.6 + 0.8) * sh;
  col += (alb * 0.5 + 0.24 * lift) * U.sunCol.rgb * (rim * (0.75 + 1.1 * sheen) * lift);
  col += alb * U.ambSky.rgb * sheen * fr * 0.6 * ao;
  // a thin shell with the sun behind it is lit from inside: the shaded side of the jacket glows in its own colour instead of going brown
  col += alb * U.sunCol.rgb * (0.24 * cloth * back * back * saturate(0.6 - ndl) * (0.35 + 0.65 * sh)) * lift;
  let Hh: vec3f = normalize(V + L);
  col += U.sunCol.rgb * sh * specS * pow(max(dot(N, Hh), 0.0), specP) * saturate(ndl * 4.0);
  // a shell cloth has a soft sheen of its own: a broad, weak mirror of the sun on the slopes turned to it, and of the sky where it is seen at a slant
  let Rv: vec3f = reflect(-V, N);
  col += shell * kz * (U.sunCol.rgb * sh * (0.07 * pow(max(dot(N, Hh), 0.0), 9.0) * saturate(ndl * 3.0)) + U.ambSky.rgb * ((0.4 + 0.6 * saturate(Rv.y * 1.5 + 0.4)) * (0.025 + 0.20 * pow(1.0 - ndv, 2.5)) * ao));
  if (gloss > 0.0) {
    var R: vec3f = reflect(-V, N);
    R = normalize(vec3f(R.x, mix(R.y, 0.12 + 0.55 * lensV, lensK), R.z));      // (the lens: its curve folds the sky into its top half and the snow into its bottom)
    var env: vec3f = skyLut(normalize(vec3f(R.x, abs(R.y) * 0.9 + 0.02, R.z)));
    env = mix(env, vec3f(0.75, 0.80, 0.90) * (U.ambSky.rgb + U.sunCol.rgb * 0.35), smoothstep(0.05, -0.25, R.y));    // snow below the horizon
    let f0: f32 = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col += env * glossTint * gloss * mix(f0, 1.0, step(0.5, gloss));
    col += U.sunCol.rgb * sh * lensK * (0.25 * smoothstep(0.55, 0.0, abs(lensV - 0.15)) * pow(saturate(dot(R, L)), 6.0) + 1.5 * pow(saturate(dot(R, L)), 300.0));
  }
  // the headlamp's spill: the hands, the poles' grips and the fronts of the skis are just in front of and below it, at the edge of its flood (the
  // head and the back are behind it and take none); it lights them in their own colours
  if (U.lamp.w > 0.0 && nk > 0.0) {
    let dl: vec3f = U.lamp.xyz - v.wp;
    col += albL * lampLight(v.wp) * (saturate(dot(N, normalize(dl)) + 0.1) * smoothstep(0.18, 0.40, length(dl)) * 2.2 * nk);
  }
  // (new body: the headlamp itself, a small hot lens on the front of the helmet: its glow belongs round it, not over the whole figure)
  if (U.lamp.w > 0.0 && nb > 0.5 && id > 3.5 && id < 6.5) {
    let lq: f32 = length(v.wp - U.lamp.xyz);
    col += vec3f(1.0, 0.90, 0.74) * (min(U.lamp.w * 0.12, 8.0) * smoothstep(0.030, 0.012, lq) * saturate(dot(N, U.lampDir.xyz) * 1.5 + 0.2));
  }
  col = applyFog(col, v.wp);
  o.color = vec4f(col, 1.0);
  return o;
}
`; })(SKIER_LOOK);
