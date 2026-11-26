"use strict";
// ---------------------------------------------------------------- the snowboard: the same figure, stood sideways on one board (Variants 'ride' b)
// One board under both boots, no poles. The rider stands across the board, regular (left foot forward): the board runs along the skis' line
// (-z in the figure's own space, the nose ahead), the body faces +x, the toes. So a turn to the right is a toeside turn and a turn to the left a
// heelside one: the game's lean and edge go straight onto the board's edge, and the body leans with them toward the toes or back over the heels.
// The pose is made from four key poses, blended by what the game asks for and never sprung (the owner's rule: no springs layered on a pose):
//   toeside: the whole body leaned out over the toe edge, knees bent up off that line, chest following the lean, hands low and ahead;
// The pelvis is placed so the body's centre of mass sits on the line from the board's edge leaned over by the lean (see below).
//   heelside: seat down and back behind the heels, chest leaning back with it (less than the legs), hands reaching ahead toward the toes;
//   crouch: both knees folded, the seat sinks between the boots, the chest comes down over the front knee;
//   air: knees drawn up, board level under the body, arms out for balance; a grab takes the toe edge (back hand between the boots, front
//   hand by the front binding).
// The game's ↑ / ↓ (fore/aft, pose.fa) moves the weight along the board: hips and shoulders over the nose or over the tail, the front or
// back knee folding the more.
// Everything is worked in the rider's own space first (x along the board toward the tail, -z toward the toes, as if the rider faced -z the way
// the skier does) and turned a quarter turn into the figure's space at the end.
const Board = (() => {
  const VS = typeof Variants !== 'undefined' ? Variants : null;
  if (VS) VS.def('ride', '滑具', [['a', '双板'], ['b', '单板']], 'a');
  // (the owner, 2026-11-16: the board is for developer mode only for now. Without ?dev (or a path ending in /dev; never in the 小红书 build) it is
  // skis, whatever an address or an earlier pick in this browser asks for)
  { let dev = false; try { dev = !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && (/[?&]dev(=|&|$)/.test(location.search) || /\/dev\/?$/.test(location.pathname) || !!(self.COLD_SMOKE && self.COLD_SMOKE.dev)); } catch (e) { }
    if (VS && !dev ) VS.val.ride = 'a'; }
  const BD = { len: 1.56, hw: 0.13, waist: 0.128, half: 0.25, kickN: 0.085, kickT: 0.065, run: 0.58, th: 0.013, yawF: -0.26, yawB: 0.15 };   // board (m), half the stance, binding angles (rad, + toward the tail)
  const K = Skier, L = K.LEN, basis = K.basis, ik2 = K.ik2, frameXY = K.frameXY, fr = K.fr, B = K.B;
  // the quarter turn: rider space (x, y, z) -> figure space (-z, y, x)
  const Qp = q => [-q[2], q[1], q[0]], QM = m4.fromBasis([0, 0, 1], [0, 1, 0], [-1, 0, 0], [0, 0, 0]);
  const Qb = b => ({ X: Qp(b.X), Y: Qp(b.Y), Z: Qp(b.Z) });
  const yawIn = (bb, yaw) => { const y = basis(yaw, 0, 0); return { X: fr(bb, ...y.X), Y: fr(bb, ...y.Y), Z: fr(bb, ...y.Z) }; };

  function solve(p, sec) {
    sec = sec || K.SEC0;
    const lean = p.lean || 0, edge = p.edge || 0, tuck = sat(p.tuck || 0), air = sat(p.air || 0), fa = clamp(p.fa || 0, -1, 1), sep = p.sep || 0;
    const gL = smooth(0, 1, p.grabL || 0), gR = smooth(0, 1, p.grabR || 0), gM = Math.max(gL, gR), id = sec.idle || null;
    const ts = smooth(0.04, 0.75, lean), hs = smooth(0.04, 0.75, -lean);      // how far into a toeside / heelside turn
    const J = {}, F = new Array(K.NB);
    // ---- the board: rolled onto its edge (toes down = forward in rider space), the nose lifted in deep snow; the edge stays on the snow
    const nu = clamp(((p.tipL || 0) + (p.tipR || 0)) * 0.5, -0.05, 0.3);
    const bb = basis(0, edge, nu), O = [0, BD.hw * Math.abs(Math.sin(edge)), 0];
    const fbL = yawIn(bb, BD.yawF), fbR = yawIn(bb, BD.yawB);
    J.footL = v3.mad(O, bb.X, -BD.half); J.footR = v3.mad(O, bb.X, BD.half);
    J.ankleL = v3.mad(J.footL, fbL.Y, L.ankle); J.ankleR = v3.mad(J.footR, fbR.Y, L.ankle);
    // ---- legs folded: the game's crouch, deeper for a tuck, drawn up in the air, all the way for a grab
    let c = sat(p.crouch == null ? 0.21 : p.crouch);
    c = Math.max(c, 0.42 * tuck); c = lerp(c, Math.max(c, 0.5), air * 0.7); c = lerp(c, 0.9, gM);
    // ---- trunk first (its tilt does not hang on where the hips are): an athletic stance, chest a little forward over the knees; on the toes it
    // goes over with the lean, on the heels it leans back with it but less than the legs (the chest stays over the seat, it does not fold down)
    const hinge = 0.16 + 0.24 * c + (lean > 0 ? 0.50 * lean : 0.42 * lean) + 0.55 * tuck + 0.25 * gM + (id ? id.up : 0);
    const up2 = Math.min(hinge * 1.08 + 0.05 - 0.035 * (id ? id.br : 0), 1.6), rollT = -0.10 * fa + (id ? id.sx : 0);
    const yawP = -0.28 + 0.25 * sep, yawC = -0.40 + 0.35 * sep + (id ? id.ty : 0);
    let pb = basis(yawP, clamp(hinge * 0.55, -0.3, 0.9), -0.08 * fa);
    let t1 = basis((yawP + yawC) * 0.5, hinge, rollT), t2 = basis(yawC, up2, rollT * 0.8);
    // (人物动作 b, 08f_labmo.js: the lab's board turn sets the pelvis, the trunk, the head and the arms, faded in by lab.w; the board, the
    // feet and the knees over the toes stay this solver's)
    const LB = sec.labB; if (LB && LB.w > 0) { pb = LabMo.mixB(pb, LB.pb, LB.w); t1 = LabMo.mixB(t1, LB.t1, LB.w); t2 = LabMo.mixB(t2, LB.t2, LB.w); }
    const oC = v3.mul(t1.Y, L.spine), oN = v3.add(oC, v3.mul(t2.Y, L.chest));      // chest and neck from the pelvis
    // ---- pelvis: placed so that the body's centre of mass sits on the line from the board's edge leaned over by the lean (toward the toes is
    // -z), and over the nose or the tail by fore/aft. Masses, roughly: legs 0.30 (half of it at the hips), pelvis 0.15, trunk 0.35 at the chest,
    // head and arms 0.20 at the neck. Height: legs well bent, knees soft (a board is ridden lower than skis)
    const aM = v3.lerp(J.ankleL, J.ankleR, 0.5), up = v3.add(v3.mul(oC, 0.35), v3.mul(oN, 0.20));
    let H = 0.875 - 0.30 * c - 0.04 * Math.abs(lean) - 0.05 * tuck, pel, hipL, hipR;
    for (let it = 0; it < 10; it++) {
      const cy = 0.85 * H + up[1] + 0.15 * aM[1];                         // height of the centre of mass
      const tz = -Math.tan(clamp(lean, -1.25, 1.25)) * (cy - O[1]), tx = -0.07 * fa;
      pel = [(tx - up[0] - 0.15 * aM[0]) / 0.85, H, (tz - up[2] - 0.15 * aM[2]) / 0.85];
      hipL = v3.add(v3.mad(pel, pb.X, -L.hipW), v3.mul(pb.Y, -L.hipD)); hipR = v3.add(v3.mad(pel, pb.X, L.hipW), v3.mul(pb.Y, -L.hipD));
      const over = Math.max(v3.len(v3.sub(hipL, J.ankleL)), v3.len(v3.sub(hipR, J.ankleR))) - (L.thigh + L.shin) * 0.96;
      if (over <= -0.02) break; H -= (over >= 0.02 ? over : (over + 0.02) * (over + 0.02) / 0.08) * 1.1;
    }
    if (LB && LB.w > 0) {
      const lp = v3.add(aM, v3.mul(LB.pel, LabMo.LEG)); lp[1] += -0.30 * (c - LB.cref); lp[0] += -0.07 * fa; lp[1] += (pel[1] - lp[1]) * Math.min(1, Math.max(0, p.drive || 0));
      pel = v3.lerp(pel, lp, LB.w);
      for (let it = 0; it < 3; it++) {
        hipL = v3.add(v3.mad(pel, pb.X, -L.hipW), v3.mul(pb.Y, -L.hipD)); hipR = v3.add(v3.mad(pel, pb.X, L.hipW), v3.mul(pb.Y, -L.hipD));
        const over = Math.max(v3.len(v3.sub(hipL, J.ankleL)), v3.len(v3.sub(hipR, J.ankleR))) - (L.thigh + L.shin) * 0.97;
        if (over <= -0.02) break; pel = v3.mad(pel, v3.norm(v3.sub(aM, pel)), over >= 0.02 ? over : (over + 0.02) * (over + 0.02) / 0.08);      // (given up softly)
      }
    }
    J.pelvis = pel; J.hipL = hipL; J.hipR = hipR;
    // knees: over the toes of their own boot (the bindings are turned out, so the knees part a little)
    // (on the toes the whole leg leans out over the toe edge: the knee bends up off that line, not down toward the snow, or it reads as kneeling)
    const kA = 0.9 * Math.max(lean, 0), kneeDir = (fb, sx) => v3.norm(v3.add(v3.mul(fb.Z, -Math.cos(kA)), [sx, 0.1 + Math.sin(kA), 0]));
    J.kneeL = ik2(hipL, J.ankleL, L.thigh, L.shin, kneeDir(fbL, -0.10)); J.kneeR = ik2(hipR, J.ankleR, L.thigh, L.shin, kneeDir(fbR, 0.10));
    J.kneeRawL = J.kneeL; J.kneeRawR = J.kneeR;
    J.chest = v3.add(pel, oC); J.neck = v3.add(pel, oN);
    J.shL = v3.add(v3.mad(J.neck, t2.X, -L.shW), v3.mul(t2.Y, -L.shD)); J.shR = v3.add(v3.mad(J.neck, t2.X, L.shW), v3.mul(t2.Y, -L.shD));
    // head: eyes level, looking down the run over the front shoulder (more round toward the nose on the heels, more toward the toes on the toes)
    const yawH = -1.12 + 0.18 * ts - 0.15 * hs + (p.headYaw || 0) * 0.5 + (id ? id.hy : 0), hp = Math.max(0.10 + 0.08 * c + (id ? id.hp : 0), up2 - 1.0);
    let hb = basis(yawH, hp, 0.04 * fa); if (LB && LB.w > 0) hb = LabMo.mixB(hb, LB.hb, LB.w);
    const nY = v3.norm(v3.add(t2.Y, hb.Y));
    J.skull = v3.mad(J.neck, nY, L.neck); J.head = v3.add(v3.mad(J.skull, hb.Y, L.head), v3.mul(hb.Z, -0.015));
    // ---- hands: relaxed, the front one out toward the nose, the back one by the back hip; low and ahead on the toes, reaching forward on the
    // heels, wide in the air, in front of the knees in a tuck; a grab takes the toe edge
    const hl = basis(yawC, 0, 0), reach = (L.uarm + L.farm + L.grip) * 0.97;
    const hand = (side, g) => {
      const sh = side < 0 ? J.shL : J.shR;
      // (as riders in Steep and on real slopes carry them: arms long and loose, elbows only soft, hands down at hip height and a little out from
      // the body; the front hand leads, over the front knee toward the nose, the back one hangs by the back hip. On the toes both go low and
      // ahead over the toe edge; on the heels they reach forward over the toes to hold the seat's weight; in the air they open out for balance)
      let o = side < 0 ? [-0.24, -0.50, -0.13] : [0.12, -0.55, -0.03];
      o = v3.add(o, v3.mul(side < 0 ? [-0.06, -0.06, -0.12] : [0.02, -0.04, -0.10], ts));
      o = v3.add(o, v3.mul(side < 0 ? [0.06, 0.10, -0.24] : [-0.06, 0.12, -0.24], hs));
      o = v3.add(o, v3.mul(side < 0 ? [-0.20, 0.24, -0.02] : [0.22, 0.22, 0.06], air * (1 - gM)));
      o = v3.add(o, v3.mul([side < 0 ? 0.12 : -0.05, 0.05, -0.18], tuck));
      let t = v3.add(sh, fr(hl, o[0], o[1], o[2]));
      if (g > 0) t = v3.lerp(t, v3.add(O, fr(bb, side < 0 ? -0.36 : 0.0, 0.035, -BD.hw - 0.02)), g);
      const d0 = v3.sub(t, sh), dl = v3.len(d0); if (dl > reach) t = v3.mad(sh, d0, reach / dl);
      const e = ik2(sh, t, L.uarm, L.farm + L.grip, fr(hl, side * 0.7, -0.2, 0.7));      // (the elbow out and back, never forward)
      return { w: t, e, d: v3.norm(fr(hl, side * 0.1, -1, -0.35)) };
    };
    const hL = hand(-1, gL), hR = hand(1, gR);
    if (LB && LB.w > 0) for (let k = 0; k < 2; k++) { const h = k ? hR : hL, sh = k ? J.shR : J.shL, wa = LB.w * (1 - gM);
      const le = v3.mad(sh, LB.ua[k], L.uarm), lg = v3.mad(le, LB.fa[k], L.farm + L.grip);
      const e = v3.mad(sh, v3.norm(v3.sub(v3.lerp(h.e, le, wa), sh)), L.uarm); h.w = v3.mad(e, v3.norm(v3.sub(v3.lerp(h.w, lg, wa), e)), L.farm + L.grip); h.e = e; }
    J.gripL = hL.w; J.elbowL = hL.e; J.gripR = hR.w; J.elbowR = hR.e; J.poleDL = hL.d; J.poleDR = hR.d;
    J.wristL = v3.mad(J.elbowL, v3.norm(v3.sub(J.gripL, J.elbowL)), L.farm); J.wristR = v3.mad(J.elbowR, v3.norm(v3.sub(J.gripR, J.elbowR)), L.farm);
    J.tipL = J.gripL.slice(); J.tipR = J.gripR.slice(); J.plantedL = 0; J.plantedR = 0;      // (no poles: nothing is ever planted)
    // ---- frames, as the skier's (08_skier.js)
    F[B.pelvis] = m4.fromBasis(pb.X, pb.Y, pb.Z, pel);
    F[B.spine] = frameXY(pel, v3.sub(J.chest, pel), v3.add(pb.X, t1.X));
    F[B.chest] = frameXY(J.chest, v3.sub(J.neck, J.chest), t2.X);
    F[B.neck] = frameXY(J.neck, nY, v3.add(t2.X, hb.X));
    F[B.head] = m4.fromBasis(hb.X, hb.Y, hb.Z, J.skull);
    const limb = (i0, a, b2, c2, xh) => { const ax = v3.cross(v3.sub(b2, a), v3.sub(c2, b2)); const hx = v3.len(ax) > 1e-4 ? v3.norm(ax) : xh; F[i0] = frameXY(a, v3.sub(b2, a), hx); F[i0 + 1] = frameXY(b2, v3.sub(c2, b2), hx); };
    limb(B.uarmL, J.shL, J.elbowL, J.gripL, [1, 0, 0]); F[B.handL] = frameXY(J.wristL, v3.sub(J.gripL, J.elbowL), v3.cross(v3.sub(J.gripL, J.elbowL), hL.d));
    limb(B.uarmR, J.shR, J.elbowR, J.gripR, [1, 0, 0]); F[B.handR] = frameXY(J.wristR, v3.sub(J.gripR, J.elbowR), v3.cross(v3.sub(J.gripR, J.elbowR), hR.d));
    limb(B.thighL, hipL, J.kneeL, J.ankleL, [-1, 0, 0]); limb(B.thighR, hipR, J.kneeR, J.ankleR, [-1, 0, 0]);
    F[B.footL] = m4.fromBasis(fbL.X, fbL.Y, fbL.Z, J.footL); F[B.footR] = m4.fromBasis(fbR.X, fbR.Y, fbR.Z, J.footR);
    F[B.poleL] = frameXY(J.gripL, v3.mul(J.poleDL, -1), [1, 0, 0]); F[B.poleR] = frameXY(J.gripR, v3.mul(J.poleDR, -1), [1, 0, 0]);
    // the board itself (its own space: x toward the toe edge, y up, -z the nose)
    const Mb = m4.fromBasis(v3.mul(bb.Z, -1), bb.Y, bb.X, O);
    // ---- a quarter turn into the figure's space
    for (const k in J) if (Array.isArray(J[k]) && J[k].length === 3) J[k] = Qp(J[k]);
    for (let i = 0; i < F.length; i++) if (F[i]) F[i] = m4.mul(QM, F[i]);
    J.boardC = Qp(O); J.boardM = m4.mul(QM, Mb);
    return { J, F, hb: Qb(hb), t1: Qb(t1), t2: Qb(t2), pb: Qb(pb), fbL: Qb(fbL), fbR: Qb(fbR), caps: [], c, hinge, up2, dp: null, hp: [null, null], br: id ? id.br : 0, board: true };
  }

  // ---- the board's mesh, in its own space (x toward the toe edge, y up, -z the nose; the middle of the base at 0): a twin with a waist, round
  // nose and tail kicked well up past the contact points (it rides on its running length only), a little thicker under the bindings. Made for the left foot's bone (K.build places it there by .at)
  function mesh() {
    const mb = meshBuilder(), rings = [], N = 72, hl = BD.len / 2, flat = BD.run;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = lerp(hl, -hl, t), az = Math.abs(z);
      // sidecut: widest at the contact points, waist between; rounded ends
      let w = lerp(BD.waist, BD.hw + 0.020, smooth(0.0, flat, az) ** 2);
      if (az > flat) w *= Math.sqrt(Math.max(0.04, 1 - ((az - flat) / (hl - flat + 0.004)) ** 2));
      // (only the running length between the contact points lies on the snow; past them nose and tail curve up, the nose higher: 8.5 cm, 6.5)
      const yb = (z < 0 ? BD.kickN : BD.kickT) * Math.pow(smooth(flat - 0.02, hl, az), 1.5), th = lerp(0.006, BD.th, smooth(hl, 0.3, az));
      const r = [[-w, yb], [w, yb], [w, yb + th * 0.55], [w * 0.97, yb + th], [-w * 0.97, yb + th], [-w, yb + th * 0.55]];
      rings.push(r.map(q => [[q[0], q[1], z], [0, 1, 0]]));
    }
    mb.sweep(rings, [9, 1, 0, 0], [0, 0, 1], [0, 0, -1]);
    const mm = mb.done();
    return mm;
  }
  // the part handed to Skier.build: the board mesh, and where it sits in the left foot's frame (that frame is the board's turned by the binding)
  K.boardPart = function () {
    const s = solve(K.P0), m = K.fixMesh(mesh());
    m.at = m4.mul(m4.invert(s.F[B.footL]), s.J.boardM);
    return m;
  };
  K.solveBoard = solve;
  return { BD, solve, on: () => VS && VS.val.ride === 'b'  };
})();
