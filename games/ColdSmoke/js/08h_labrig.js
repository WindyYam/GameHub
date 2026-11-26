"use strict";
// (generated from code-only-game-kit research/human/lab/game_rig.js by tools/export_rider.js: do not edit here)
// ---------------------------------------------------------------- the lab's figure carried onto the game's skier (shared by the tuning page,
// lab/tune_game_view.js, and the game itself: cold-smoke src/08h_labrig.js is a copy made by tools/export_rider.js)
// LabRig(Human, Skier) gives fromLab(xf, gear): the game's solve() result (its 28 frames and joints) made from the lab's posed skeleton xf, and
// puts on the game's Skier what the board rider's body needs: K.openGlove (the relaxed glove), K.gloveAxes, K.bindRide (the arms' pose the
// rider's body is built in). The lab figure faces +z with its left at +x; the game's faces -z with its left at -x.
function LabRig(H, Skier) {
  const sk = H.Skeleton.build(H.measure(H.DEFAULTS)), I = sk.idx, st = { gear: 'ski', lift: null };
  const K = Skier, B = K.B, L = K.LEN;
  const g = p => [-p[0], p[1], -p[2]];
  const n = v => v3.norm(v), sub = v3.sub, add = v3.add, mad = v3.mad, dot = v3.dot, cross = v3.cross;
  const ortho = (y, x) => n(sub(x, v3.mul(y, dot(x, y))));
  const basisXY = (x, y) => { const Y = n(y), X = ortho(Y, x); return { X, Y, Z: cross(X, Y) }; };
  const local = (b, o, p) => { const d = sub(p, o); return [dot(d, b.X), dot(d, b.Y), dot(d, b.Z)]; };
  const at = (b, o, q) => add(o, add(add(v3.mul(b.X, q[0]), v3.mul(b.Y, q[1])), v3.mul(b.Z, q[2])));
  const fist = (gp, pd, wr, rt) => { const y = n(v3.mul(pd, -1)), w = sub(wr, gp), wz = sub(w, v3.mul(y, dot(w, y))); return K.frameXY(gp, y, add(cross(y, wz), v3.mul(rt, 0.025))); };
  let BO = null;      // the game's bind pose, as offsets in its own frames
  function bindOffsets() {
    const b = K.bind, J = b.J, pb = b.pb, t2 = { X: b.t2.X, Y: n(sub(J.neck, J.chest)) }; t2.X = ortho(t2.Y, t2.X); t2.Z = cross(t2.X, t2.Y);
    return { hipL: local(pb, J.pelvis, J.hipL), hipR: local(pb, J.pelvis, J.hipR), shL: local(t2, J.chest, J.shL), shR: local(t2, J.chest, J.shR),
      chest: v3.len(sub(J.chest, J.pelvis)), neck: v3.len(sub(J.neck, J.chest)), skull: v3.len(sub(J.skull, J.neck)) };
  }
  // ---- the arm's turn on a board (see fromLab)
  const rotAbout = (v, ax, a) => { const c = Math.cos(a), sn = Math.sin(a), k = cross(ax, v); return add(add(v3.mul(v, c), v3.mul(k, sn)), v3.mul(ax, dot(ax, v) * (1 - c))); };
  const angAbout = (a, b, ax) => Math.atan2(dot(cross(a, b), ax), dot(a, b));
  // which way the lab's hinge axis points against the game's (the cross of upper arm and forearm, the game's bind way): found once on a bent arm
  // (labTurn's "back" is the lab's thumb-and-knuckles cross, which comes out of the PALM: the back of the hand is its opposite. The owner,
  // 2026-11-17 18:10: the first build had the palms up. tools/tune_game_check.js now checks the palms face down when the arms are out in front)
  const BACK = -1;
  const HS = {};
  function hingeSign(s) {
    if (HS[s]) return HS[s];
    const p = H.restPose(); for (const k of ['arm_L', 'arm_R']) Object.assign(p[k], { elev: 40, plane: 30, elbow: 80 });
    const xf = H.Skeleton.pose(sk, p), P = nm => g(xf.P[I[nm]]), up = sub(P('forearm_' + s), P('upperarm_' + s)), fo = sub(P('hand_' + s), P('forearm_' + s));
    return (HS[s] = dot(cross(up, fo), g(H.q.rot(xf.R[I['forearm_' + s]], [0, 1, 0]))) >= 0 ? 1 : -1);
  }
  // how far the lab's hand is turned about the forearm from the hinge: the back of the hand, from the knuckles' line and the thumb's side
  function labTurn(xf, s, hg, Yf, P) {
    const wr = P('hand_' + s), Yh = n(sub(P('fingers_mcp_' + s), wr)), th = sub(P('thumb_cmc_' + s), wr);
    let back = s === 'R' ? cross(th, Yh) : cross(Yh, th); back = n(sub(back, v3.mul(Yf, dot(back, Yf))));
    return angAbout(hg, back, Yf);
  }
  // the bind pose's turn of the hand's frame against the forearm's (theta), and the lab's hand turn on a relaxed arm (phi0): the glove is built
  // with its back there, so the hand's frame at phi0 is the bind's own and the cuff is unwrung; phi0 from the lab's board riding stance
  let BA = null;
  function bindArm() {
    if (BA) return BA; BA = {};
    const b = K.bind, p = JSON.parse(JSON.stringify(H.Motion.sbOf(sk).P.ride));      // (the lab's board riding stance: its arms)
    const xf = H.Skeleton.pose(sk, p), P = nm => g(xf.P[I[nm]]);
    for (const s of ['L', 'R']) { const Ff = b.F[B['uarm' + s] + 1], Fh = b.F[B['hand' + s]], Yb = n([Fh[4], Fh[5], Fh[6]]);
      const theta = angAbout([Ff[0], Ff[1], Ff[2]], [Fh[0], Fh[1], Fh[2]], Yb);
      const Yf = n(sub(P('hand_' + s), P('forearm_' + s))), lh = g(H.q.rot(xf.R[I['forearm_' + s]], [0, 1, 0])), hg = v3.mul(n(sub(lh, v3.mul(Yf, dot(lh, Yf)))), hingeSign(s));
      BA[s] = { theta, phi0: labTurn(xf, s, hg, Yf, P) }; }
    return BA;
  }
  // the game's solve() result, made from the lab's skeleton (xf) and its skis (gear boxes) and poles
  function fromLab(xf) {
    if (!BO) BO = bindOffsets();
    const P0 = nm => g(xf.P[I[nm]]), J = {}, F = new Array(K.NB);
    // ---- the gear and the feet first (they hang on the lab's gear only): the game's foot frame has +z toward the tail, y up off the ski or board
    const feet = {}, board = st.gear === 'board';
    let bd0 = null;
    if (board) {
      // the board: the lab's (one box: long axis toward the nose, normal up off the base) as the game's board solver lays it out (src/08a_board.js):
      // its frame X toward the tail, Y up off the base, Z = X x Y; the middle of the base at O; the boots at half the game's stance either side,
      // turned by the game's binding angles, so the game's board mesh (hung on the left foot by K.boardPart) sits where the lab's board is
      const bx = H.Motion.gear(sk, xf, 'board')[0], X = n(v3.mul(g(bx.ax), -1)), nn = g(bx.n), Y = n(nn[1] > 0 ? nn : v3.mul(nn, -1)), Xo = ortho(Y, X);
      const bb = { X: Xo, Y, Z: cross(Xo, Y) }, O = sub(g(bx.c), v3.mul(Y, bx.T / 2)), BD = Board.BD;
      const yawIn = yaw => { const y = K.basis(yaw, 0, 0); return { X: K.fr(bb, ...y.X), Y: K.fr(bb, ...y.Y), Z: K.fr(bb, ...y.Z) }; };
      feet.L = yawIn(BD.yawF); feet.R = yawIn(BD.yawB); J.footL = mad(O, bb.X, -BD.half); J.footR = mad(O, bb.X, BD.half);
      bd0 = { O, M: m4.fromBasis(v3.mul(bb.Z, -1), bb.Y, bb.X, O) };
    } else {
      const sk2 = H.Motion.gear(sk, xf, 'ski');
      for (const s of ['L', 'R']) { const tal = P0('talus_' + s); let best = null, bd = 1e9;
        for (const bx of sk2) { const c = g(bx.c), d = v3.len(sub(c, tal)); if (d < bd) { bd = d; best = bx; } }
        const ax = g(best.ax), nn = g(best.n), fwd = dot(ax, sub(P0('toe_hallux_' + s), tal)) > 0 ? ax : v3.mul(ax, -1), up = nn[1] > 0 ? nn : v3.mul(nn, -1);
        const Y = n(up), Z = ortho(Y, v3.mul(fwd, -1)), X = cross(Y, Z), fb = { X, Y, Z };
        // the boot's sole on the ski, under the lab's ankle
        const top = add(g(best.c), v3.mul(Y, best.T / 2));
        feet[s] = fb; J['foot' + s] = add(top, v3.mul(fb.Z, dot(sub(tal, top), fb.Z))); }
      // a carve is two skis running parallel, on the same edge angle (photos and video of good skiers, Reilly McGlashan's deep carves: the
      // skis stay parallel however low the body goes). Each ski had hung on its own lab foot, and a big lean (the deep carve, Down + a turn)
      // turned the feet apart by up to 11 deg in yaw and edge (owner, 2026-11-17). Both skis now take one shared frame, the mean of the two,
      // each staying under its own boot; st.parallel (0..1, the caller's) lets it go in the air, where a trick may spread the skis.
      const pw = st.parallel == null ? 1 : st.parallel;
      // (the foot point, the sole under the boot, is kept: each ski turns about it)
      // (and the ski's length lies in the snow: tip and tail both on it. The game's snow under the skier is the plane y = 0, so the running
      // line is kept level and only the edge angle tips the base. Grounding by the lowest point alone had left a ski pitched off the lab's
      // floor resting on its tip with the tail in the air, owner's screenshot 2026-11-17 22:33)
      if (pw > 0.001) { const Zm = add(feet.L.Z, feet.R.Z), Z = n([Zm[0], 0, Zm[2]]), Y = ortho(Z, add(feet.L.Y, feet.R.Y));
        for (const s of ['L', 'R']) { const f = feet[s], Ys = n(add(v3.mul(f.Y, 1 - pw), v3.mul(Y, pw))), Zs = ortho(Ys, add(v3.mul(f.Z, 1 - pw), v3.mul(Z, pw)));
          feet[s] = { X: cross(Ys, Zs), Y: Ys, Z: Zs }; } }
    }
    for (const s of ['L', 'R']) J['ankle' + s] = mad(J['foot' + s], feet[s].Y, L.ankle);
    // ---- the skis on the snow. The game's snow is y = 0 under the skier (its own figure stands its ski bases there, 08_skier.js; the tracks read
    // the same). The lab's figure stood on the lab's floor, and carried over it left the bases off the game's snow: 2 cm in a turn, 6 cm in a
    // deep carve, and 3.5 cm into it in a long turn (owner's screenshot 2026-11-17: "板都飘到空中了"). So the lowest point of the two ski bases
    // (the flat running length under the boot, the ski's width) is put on the snow by moving the whole figure, and everything below that
    // follows from it. On a board, or in the air (st.parallel, the caller's on-snow weight), it stands back.
    let gnd = 0;
    if (!board) { let lo = 1e9; for (const s of ['L', 'R']) { const f = feet[s], p = J['foot' + s];
        for (const z of [-0.6, -0.3, 0, 0.3, 0.6]) for (const x of [-0.055, 0.055]) lo = Math.min(lo, p[1] + f.X[1] * x + f.Z[1] * z); }
      gnd = lo * (st.parallel == null ? 1 : st.parallel); }
    st.gnd = gnd;
    // the game's ankle stands higher off the gear than the lab's (its boot and binding are thicker): the whole body is lifted by that much, along
    // the gear's up, so the legs keep the lab's bend instead of folding deeper over the same hips
    const upG = n(add(feet.L.Y, feet.R.Y)), lift = v3.mul(upG, (dot(sub(J.ankleL, P0('talus_L')), upG) + dot(sub(J.ankleR, P0('talus_R')), upG)) / 2);
    const P = nm => add(P0(nm), lift), Pg = p => add(g(p), lift);
    st.lift = lift;
    // ---- the trunk and head
    const hipL0 = P('thigh_L'), hipR0 = P('thigh_R'), mid = v3.lerp(hipL0, hipR0, 0.5);
    const pb = basisXY(sub(hipR0, hipL0), sub(P('lumbar_hi'), P('pelvis')));
    const t2 = basisXY(sub(P('upperarm_R'), P('upperarm_L')), sub(P('neck_lo'), P('thorax_mid')));
    const hb = basisXY(sub(P('eye_R'), P('eye_L')), sub(P('head'), P('neck_hi')));
    const t1 = { X: n(add(pb.X, t2.X)) };
    // the pelvis where the lab's hips are
    const pel = sub(mid, sub(at(pb, [0, 0, 0], v3.lerp(BO.hipL, BO.hipR, 0.5)), [0, 0, 0]));
    J.pelvis = pel; J.hipL = at(pb, pel, BO.hipL); J.hipR = at(pb, pel, BO.hipR);
    J.chest = mad(pel, n(sub(P('thorax_mid'), P('pelvis'))), BO.chest);
    J.neck = mad(J.chest, t2.Y, BO.neck);
    const nY = n(add(t2.Y, hb.Y)); J.skull = mad(J.neck, nY, BO.skull); J.head = add(mad(J.skull, hb.Y, L.head), v3.mul(hb.Z, -0.015));
    J.shL = at(t2, J.chest, BO.shL); J.shR = at(t2, J.chest, BO.shR);
    // ---- the knees: the game's thigh and shin from its hip to its ankle, bent toward the lab's knee
    for (const s of ['L', 'R']) { const hip = J['hip' + s]; J['knee' + s] = K.ik2(hip, J['ankle' + s], L.thigh, L.shin, sub(P('shin_' + s), v3.lerp(hip, J['ankle' + s], 0.5))); }
    // arms: the fist where the lab's fist is, the elbow toward the lab's elbow; the pole along the lab's pole
    const poles = H.Motion.poles(sk, xf), pd = {};
    for (const s of ['L', 'R']) { const sh = J['sh' + s], gp = Pg(v3.lerp(xf.P[I['hand_' + s]], xf.P[I['fingers_mcp_' + s]], 0.7));
      // a fist never crosses over to the other half of the body (Mac shots 2026-11-17, front view of a crossover: the chest faces down the hill
      // while the skis still point across, and a fist held 55 cm in front swung over the other leg, its shaft lying across the front of both
      // knees). Photos of skiers: each fist stays out beside its own side. So, square to the skis (x), the fist is kept at least 12 cm outside
      // its own hip joint (a soft limit, so the arm never kinks when it reaches it)
      if (!board) { const o = s === 'L' ? -1 : 1, lo = o * J['hip' + s][0] + 0.12, a = o * gp[0], k = 0.06, m = (a + lo + Math.sqrt((a - lo) * (a - lo) + k * k)) / 2; gp[0] = o * m; }
      let d = [0, -1, 0.3]; if (poles && poles.length) { let best = null, bd = 1e9; for (const bx of poles) { const c = g(bx.c), dd = v3.len(sub(c, gp)); if (dd < bd) { bd = dd; best = bx; } }
        const ax = g(best.ax); d = ax[1] < 0 ? ax : v3.mul(ax, -1); }
      d = n(d); pd[s] = d;
      const el = K.ik2(sh, gp, L.uarm, L.farm + L.grip, sub(Pg(xf.P[I['forearm_' + s]]), v3.lerp(sh, gp, 0.5)));
      const grip = mad(el, n(sub(gp, el)), L.farm + L.grip);
      J['elbow' + s] = el; J['grip' + s] = grip; J['wrist' + s] = mad(el, n(sub(grip, el)), L.farm); J['poleD' + s] = d; J['tip' + s] = mad(grip, d, L.pole); J['planted' + s] = xf.anat && xf.anat.plant ? xf.anat.plant[s === 'L' ? 0 : 1] : 0; }
    // the same rule as Human.Motion.poles, once more on the game's own body (its arms are a little shorter, so its fists are not quite where
    // the lab's are): the tip 18 cm outside its own ankle and 4 cm further out than the fist, the shaft 10 cm outside the knee at the knee's
    // height (faded in as the fist rises over the knee), square to the skis (x here). From the front the shaft never crosses the legs
    // (not while the tips rest in the snow at a stop: the lab put them there, and moving them across here would lift them off it)
    if (!board && !(xf.anat && xf.anat.poleRest > 0.001)) for (const s of ['L', 'R']) { const o = s === 'L' ? -1 : 1, gp = J['grip' + s], kn = J['knee' + s], an = J['ankle' + s], d = J['poleD' + s];
      const t = mad(gp, d, L.pole), lg = o * gp[0]; let need = Math.max(o * an[0] + 0.12, lg + 0.04);
      const f = (gp[1] - kn[1]) / Math.max(1e-3, gp[1] - t[1]);
      if (f > 0 && f <= 1) need = Math.max(need, need + (lg + (o * kn[0] + 0.08 - lg) / Math.max(f, 0.25) - need) * H.smooth(0.05, 0.25, f));
      need = Math.min(need, o * an[0] + 0.6);
      const cap = Math.max(need, lg + 0.08), tt = Math.min(Math.max(o * t[0], need), cap);   // (never further out than it must be: no A from behind)
      if (tt !== o * t[0]) { const t2 = [o * tt, t[1], t[2]], nd = n(sub(t2, gp)); J['poleD' + s] = nd; J['tip' + s] = mad(gp, nd, L.pole); } }
    // standing still: the tips rest in the snow (the game's arm is a little shorter than the lab's, so the lab's tip, put on its snow, floated
    // here). The snow is under the skis' soles; the shaft keeps its way round and is let down onto it, its length kept
    { const pr = !board && xf.anat && xf.anat.poleRest > 0.001 ? Math.min(1, xf.anat.poleRest) : 0;
      if (pr) { const snow = gnd; for (const s of ['L', 'R']) { const gp = J['grip' + s], d = J['poleD' + s], dy = gp[1] - (snow - 0.01);
        const hz = Math.hypot(d[0], d[2]) || 1, hr = Math.sqrt(Math.max(0, L.pole * L.pole - dy * dy)), pd = n([d[0] / hz * hr, -dy, d[2] / hz * hr]);
        const nd = n(add(v3.mul(d, 1 - pr), v3.mul(pd, pr))); J['poleD' + s] = nd; J['tip' + s] = mad(gp, nd, L.pole); } } }
    // (on a board the hands hold nothing, so no pole can say which way a hand is turned: the arm's turn comes from the lab's own arm instead.
    // The elbow's hinge is carried by the lab's forearm bone (its local y), so it stays put when the arm straightens (the game's way, the cross
    // of upper arm and forearm, flips over there: the forearm's "turning for no reason"); the hand keeps the same turn against the forearm as in
    // the game's bind pose, plus only what the lab's hand turns against its forearm (pronation), so the cuff between them is never wrung)
    const arm = {};
    if (board) for (const s of ['L', 'R']) { const Yf = n(sub(J['grip' + s], J['elbow' + s])), lh = g(H.q.rot(xf.R[I['forearm_' + s]], [0, 1, 0]));
      let hg = n(sub(lh, v3.mul(Yf, dot(lh, Yf)))); const sg = hingeSign(s); hg = v3.mul(hg, sg);
      const phi = labTurn(xf, s, hg, Yf, P0), bo = bindArm()[s];
      arm[s] = { hinge: hg, hand: rotAbout(hg, Yf, bo.theta + phi - bo.phi0), back: v3.mul(rotAbout(hg, Yf, phi), BACK), fwd: Yf }; }
    // the frames, as the game's solve() makes them
    F[B.pelvis] = m4.fromBasis(pb.X, pb.Y, pb.Z, pel);
    F[B.spine] = K.frameXY(pel, sub(J.chest, pel), add(pb.X, t1.X));
    F[B.chest] = K.frameXY(J.chest, sub(J.neck, J.chest), t2.X);
    F[B.neck] = K.frameXY(J.neck, nY, add(t2.X, hb.X));
    F[B.head] = m4.fromBasis(hb.X, hb.Y, hb.Z, J.skull);
    const limb = (i0, a, b, c, xh) => { const ax = cross(sub(b, a), sub(c, b)); const hx = v3.len(ax) > 1e-4 ? n(ax) : xh; F[i0] = K.frameXY(a, sub(b, a), hx); F[i0 + 1] = K.frameXY(b, sub(c, b), hx); return hx; };
    // (the fist's turn comes from the lab's fist (its grip line, the hand bone's -z), not from the pole: a pole aimed at the snow for a pole touch,
    // or trailing in a low stance, can run along the forearm, and the cross of the two then spun the fist 45-145 deg in one frame)
    const hax = s => g(H.q.rot(xf.R[I['hand_' + s]], [0, 0, -1]));
    limb(B.uarmL, J.shL, J.elbowL, J.gripL, [1, 0, 0]); F[B.handL] = K.frameXY(J.wristL, sub(J.gripL, J.elbowL), cross(sub(J.gripL, J.elbowL), hax('L')));
    limb(B.uarmR, J.shR, J.elbowR, J.gripR, [1, 0, 0]); F[B.handR] = K.frameXY(J.wristR, sub(J.gripR, J.elbowR), cross(sub(J.gripR, J.elbowR), hax('R')));
    if (board) for (const sd of ['L', 'R']) { const A = arm[sd], u = B['uarm' + sd];
      F[u] = K.frameXY(J['sh' + sd], sub(J['elbow' + sd], J['sh' + sd]), A.hinge); F[u + 1] = K.frameXY(J['elbow' + sd], sub(J['grip' + sd], J['elbow' + sd]), A.hinge);
      F[B['hand' + sd]] = K.frameXY(J['wrist' + sd], sub(J['grip' + sd], J['elbow' + sd]), A.hand); }
    limb(B.thighL, J.hipL, J.kneeL, J.ankleL, [-1, 0, 0]); limb(B.thighR, J.hipR, J.kneeR, J.ankleR, [-1, 0, 0]);
    F[B.footL] = m4.fromBasis(feet.L.X, feet.L.Y, feet.L.Z, J.footL); F[B.footR] = m4.fromBasis(feet.R.X, feet.R.Y, feet.R.Z, J.footR);
    // ---- no pole over a ski or between the legs, checked last, on the game's own skis (owner 2026-11-17 22:42, screenshot "右枝干又不对了": the
    // inside pole lay across its ski). The rules above aim the tip outside the lab's skis; the skis are then laid parallel and level on the
    // game's snow, which can bring a ski under the shaft. Every point of the shaft lower than 60 cm over the snow and alongside a ski is kept
    // at least 8 cm outside its own ski (square to the skis), the shaft turned out about the fist to get there. On a board there are no poles.
    if (!board) for (const s of ['L', 'R']) { const o = s === 'L' ? -1 : 1, f = feet[s], ft = J['foot' + s], gp = J['grip' + s];
      for (let it = 0; it < 10; it++) { const d = J['poleD' + s]; let need = 0;
        for (let u = 0.1; u <= 1.0001; u += 0.1) { const q = mad(gp, d, L.pole * u); if (q[1] - gnd > 0.6) continue; const r = sub(q, ft), z = dot(r, f.Z); if (z < -0.96 || z > 0.8) continue;
          const out = o * dot(r, f.X); if (out < 0.08) need = Math.max(need, (0.08 - out) / u); }
        if (need < 1e-4) break;
        const t = mad(gp, d, L.pole), t2 = add(t, v3.mul(f.X, o * need)), nd = n(sub(t2, gp)); J['poleD' + s] = nd; J['tip' + s] = mad(gp, nd, L.pole); } }
    { const rt = [F[B.chest][0], F[B.chest][1], F[B.chest][2]]; F[B.poleL] = fist(J.gripL, J.poleDL, J.wristL, rt); F[B.poleR] = fist(J.gripR, J.poleDR, J.wristR, rt); }
    if (bd0) { J.boardC = bd0.O; J.boardM = bd0.M; for (const s of ['L', 'R']) J['planted' + s] = 0; }
    // (the whole figure moved down onto the snow by the ski bases' lowest point, joints and frames alike)
    if (gnd) { const seen = new Set(); for (const k in J) { const v = J[k]; if (Array.isArray(v) && v.length === 3 && typeof v[1] === 'number' && !/^poleD/.test(k) && !seen.has(v)) { seen.add(v); v[1] -= gnd; } }
      for (const M of F) if (M && !seen.has(M)) { seen.add(M); M[13] -= gnd; } }
    return { arm, J, F, hb, t1, t2, pb, fbL: feet.L, fbR: feet.R, caps: [], c: 0, hinge: 0, up2: [0, 1, 0], dp: null, hp: [null, null], br: 0, board: !!bd0 };
  }
  // ---- the rider's glove: a relaxed, half-open hand (the skier's glove is closed round the pole's grip). Built as a distance field in the hand
  // bone's own space (x out of the back of the right hand, y from the wrist toward the fingers, z toward the little finger; the left hand is its
  // mirror in x, as the game's hand frames are), meshed apart at a fine grid like the game's glove, and carried wholly by the hand bone.
  // The fingers bend a little at each joint toward the palm (about 20, 30 and 15 deg, as relaxed hands do) and fan out a few degrees; the thumb
  // lies along the side of the first finger, a little under it.
  function openGloveSD(x, y, z) {
    const sdF = sd, c = sdF.capsule;
    let d = sdF.rbox(x, y, z, 0.0, 0.050, 0.002, 0.0145, 0.044, 0.041, 0.012);                       // the palm and back of the hand
    d = sdF.smin(d, c(x, y, z, 0.0, -0.062, 0.0, 0.0, 0.016, 0.0, 0.041, 0.035), 0.012);          // the glove's cuff, reaching back inside the gauntlet (which ends 3 cm short of the wrist)
    // the four fingers, each three bones bent a little at each joint toward the palm (about 20, 30 and 15 deg, as a relaxed hand) and fanned a few degrees
    const FZ = [-0.027, -0.009, 0.009, 0.026], FL = [[0.042, 0.026, 0.021], [0.046, 0.029, 0.022], [0.043, 0.027, 0.021], [0.034, 0.021, 0.018]];
    const CURL = [20, 30, 15], FAN = [-6, -2, 2, 7], R = [0.0108, 0.0102, 0.0094];
    for (let i = 0; i < 4; i++) { let p = [0.0, 0.092, FZ[i]], a = 0; const fa = FAN[i] * Math.PI / 180;
      for (let j = 0; j < 3; j++) { a += CURL[j] * Math.PI / 180; const L = FL[i][j], dir = [-Math.sin(a), Math.cos(a) * Math.cos(fa), Math.cos(a) * Math.sin(fa)];
        const q = [p[0] + dir[0] * L, p[1] + dir[1] * L, p[2] + dir[2] * L];
        d = sdF.smin(d, c(x, y, z, p[0], p[1], p[2], q[0], q[1], q[2], R[j] * (i === 3 ? 0.9 : 1), R[Math.min(2, j + 1)] * (i === 3 ? 0.9 : 1)), j ? 0.003 : 0.006); p = q; } }
    const TP = [[-0.004, 0.018, -0.030], [-0.014, 0.050, -0.050], [-0.022, 0.078, -0.056], [-0.027, 0.098, -0.052]];
    for (let j = 0; j < 3; j++) d = sdF.smin(d, c(x, y, z, ...TP[j], ...TP[j + 1], [0.016, 0.0125, 0.0115][j], [0.0125, 0.0115, 0.0105][j]), 0.006);
    return sd.smax(d, -(y + 0.062), 0.004);      // (cut off well inside the gauntlet)
  }
  K.openGloveSD = openGloveSD;
  // where the glove's own axes lie in the bind pose. x out of the back of the hand (the bind's hinge turned by phi0, as the lab's relaxed hand
  // is), y along the forearm toward the fingers, z toward the little finger: the glove is drawn with its thumb at -z. On a right hand, palm
  // down and fingers forward, the thumb is on the left (toward the body), which is back x fingers; on the left hand it is fingers x back.
  // (the owner, 2026-11-17 18:13: the first open gloves had the two hands swapped, thumbs on the outside. tools/tune_game_check.js now checks
  // the glove's thumb against the lab's thumb, and that it is on the body's side with the palm down)
  function gloveAxes(bd, sdn) {
    const Fh = bd.F[B['hand' + sdn]], Ff = bd.F[B['uarm' + sdn] + 1];
    const Yb = n([Fh[4], Fh[5], Fh[6]]), hgB = n(sub([Ff[0], Ff[1], Ff[2]], v3.mul(Yb, dot([Ff[0], Ff[1], Ff[2]], Yb)))), bk = v3.mul(rotAbout(hgB, Yb, bindArm()[sdn].phi0), BACK);
    const thumb = sdn === 'R' ? cross(bk, Yb) : cross(Yb, bk);
    return { bk, Yb, Zs: v3.mul(thumb, -1), o: [Fh[12], Fh[13], Fh[14]] };
  }
  K.gloveAxes = gloveAxes;
  // the pose the board rider's body is built in: the game's bind pose with the arms as the lab's riding stance carries them (elbows bent 20-40 deg,
  // not the bind's 100 deg round a pole's grip). Built bent and straightened by the skin, a sleeve bunches into a lump at the point of the elbow
  // (the owner, 2026-11-17 18:18); see lab/game_patches.js for how the mesh is made in this pose and taken back to the bind's
  let BR = null;
  K.bindRide = (solve, P0) => {
    if (BR) return BR;
    const s = fromLab(H.Skeleton.pose(sk, JSON.parse(JSON.stringify(H.Motion.sbOf(sk).P.ride)))), b = K.bind, Ci = m4.invert(s.F[B.chest]), Cb = b.F[B.chest];
    const off = sd => sub(m4.tp(Cb, m4.tp(Ci, s.J['grip' + sd])), b.J['grip' + sd]);
    return (BR = solve(Object.assign({}, P0, { armL: off('L'), armR: off('R') })));
  };
  K.openGlove = bd => {
    const m = meshSDF(openGloveSD, [-0.06, -0.075, -0.075], [0.05, 0.18, 0.065], 0.0035, { stride: 4, repair: true });
    const nv = m.nv, V = new Float32Array(nv * 20), W = new Float32Array(nv * 8), I = new Uint32Array(m.ni * 2);
    for (let side = 0; side < 2; side++) {      // 0 right, 1 left (mirrored in x)
      const sdn = side ? 'L' : 'R', Fh = bd.F[B['hand' + sdn]], Ff = bd.F[B['uarm' + sdn] + 1], base = side * nv;
      // (the glove's own axes in the bind pose: y along the forearm, x out of the back of the hand: the bind's hinge turned by phi0, as the lab's
      // relaxed hand is; z toward the little finger: on the left hand the mirror of the right's)
      const { bk, Yb, Zs, o } = gloveAxes(bd, sdn), T = (x, y, z) => add(add(v3.mul(bk, x), v3.mul(Yb, y)), v3.mul(Zs, z));
      const flip = dot(cross(bk, Yb), Zs) < 0;      // (a mirrored placing turns the triangles inside out: wind them the other way)
      for (let i = 0; i < nv; i++) { const p = i * 10, x = m.verts[p], y = m.verts[p + 1], z = m.verts[p + 2];
        const P = add(o, T(x, y, z)), Nn = n(T(m.verts[p + 3], m.verts[p + 4], m.verts[p + 5])), q = (base + i) * 10;
        const h = 0.006, ao = Math.max(0.3, Math.min(1, 0.35 + 0.65 * openGloveSD(x + m.verts[p + 3] * h, y + m.verts[p + 4] * h, z + m.verts[p + 5] * h) / h));
        V[q] = P[0]; V[q + 1] = P[1]; V[q + 2] = P[2]; V[q + 3] = Nn[0]; V[q + 4] = Nn[1]; V[q + 5] = Nn[2]; V[q + 6] = 2; V[q + 7] = ao; V[q + 8] = 0.5; V[q + 9] = y;
        const wb = (base + i) * 4; W[wb] = side ? B.handL : B.handR; W[wb + 1] = side ? B.handL : B.handR; W[wb + 2] = 1; W[wb + 3] = 0; }
      for (let t = 0; t < m.ni; t += 3) { const b = side * m.ni + t; I[b] = m.idx[t] + base; I[b + 1] = m.idx[t + (flip ? 2 : 1)] + base; I[b + 2] = m.idx[t + (flip ? 1 : 2)] + base; }
    }
    return { V, W, I, nv: nv * 2, ni: m.ni * 2 };
  };   // (for checks: tools/tune_game_check.js)
  return { sk, I, st, fromLab: (xf, gear) => { st.gear = gear === 'board' ? 'board' : 'ski'; return fromLab(xf); } };
}
