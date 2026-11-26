"use strict";
// ---------------------------------------------------------------- 人物动作 b: the skier turns the way the human lab's real skiers do
// The lab (code-only-game-kit research/human) solves whole-body ski turns from real skiing (video of skiers and race footage, measured joint by joint)
// and exports them as postures by lean (08e_labmodata.js, made by its tools/export_game.js): for each turn, the way in (lean growing) and the way
// out (lean shrinking), on a grid of the lean as a share of the deepest. Here the game's own lean picks the posture:
//   - the lean as a share of how deep the recent turns went, so a gentle turn has the same rhythm as a deep one, only less laid over;
//   - going in or coming out by whether the lean grows or shrinks, faded, never switched;
//   - short turns at low speed, the carve in between, the giant-slalom turn when fast;
//   - then the whole figure is rolled about the skis by what is left between the lab's lean and the game's, so the body leans exactly as the
//     physics asks (the posture comes from the lab, the balance from the game).
// Feet and skis, the crouch of the suspension, fore/aft, pole plants, the double-pole stroke, tucks, air, grabs and standing at ease stay the
// game's own: there the lab's figure fades out (lab.w). Nothing is sprung or filtered on the pose itself.
const LabMo = (() => {
  const D = LABMO_DATA, G = D.G, CL = ['shortturn', 'carve', 'gsturn'];
  // Near the deepest point the lab body keeps sinking while its lean hardly grows, so on a lean grid the last step holds a 6-12 cm drop of the
  // hips: crossing it the legs would fold at once. Each turn is therefore smoothed along its own path (way in, through the deepest, way out:
  // one line of 2G-1 postures) with a small Gaussian, done once here; the crossings at either end stay where they are.
  const smoothTurn = (T, sg) => { if (!T || T.sm) return; const P = [...T.rise, ...T.fall.slice(0, G - 1).reverse()], n = P.length, R = Math.ceil(sg * 2.5), o = [];
    for (let i = 0; i < n; i++) { const acc = new Array(P[0].length).fill(0); let ws = 0;
      for (let j = -R; j <= R; j++) { const k = Math.min(n - 1, Math.max(0, i + j)), w = Math.exp(-j * j / (2 * sg * sg)); ws += w; for (let c = 0; c < acc.length; c++) acc[c] += w * P[k][c]; }
      o.push(acc.map(v => v / ws)); }
    o[0] = P[0]; o[n - 1] = P[n - 1];
    T.rise = o.slice(0, G); T.fall = o.slice(G - 1).reverse(); T.sm = 1; };
  for (const c of CL) smoothTurn(D.clips[c], 1.6);
  if (D.clips.sbturn) { smoothTurn(D.clips.sbturn.toe, 1.6); smoothTurn(D.clips.sbturn.heel, 1.6); }
  const on = () => typeof Variants === 'undefined' || Variants.val.labmo === 'b';
  if (typeof Variants !== 'undefined') Variants.def('labmo', '人物动作', [['a', '原来'], ['b', '实验室']], 'b');
  // the lab body's legs (hip to ankle 0.82 m) to the game skier's (0.86 m, in boots)
  const M = { LEG: 1.05 };
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dt3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // a frame from an X and a Y that are nearly square: Y kept, X squared to it, Z = X x Y (the game's frames are right-handed with Z backward)
  const ortho = (X, Y) => { Y = nrm(Y); const x = nrm([X[0] - Y[0] * dt3(X, Y), X[1] - Y[1] * dt3(X, Y), X[2] - Y[2] * dt3(X, Y)]); return { X: x, Y, Z: crs(x, Y) }; };
  M.mixB = (a, b, w) => w >= 1 ? b : ortho(v3.lerp(a.X, b.X, w), v3.lerp(a.Y, b.Y, w));
  // one grid row by the lean's share v (0..1), on a smooth curve through the grid points (Catmull-Rom), so the pose has no kinks at the grid lines
  const row = (tab, v) => { const x = Math.min(1, Math.max(0, v)) * (G - 1), i = Math.min(G - 2, Math.floor(x)), u = x - i;
    const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(G - 1, i + 2)], u2 = u * u, u3 = u2 * u;
    return p1.map((q, k) => 0.5 * (2 * q + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * q + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * q - 3 * p2[k] + p3[k]) * u3)); };
  // ---- where in the turn. The pose is a smooth function of two smooth numbers, so it can only move as smoothly as the game's own lean:
  //   v  how far over, |lean| as a share of how deep the recent turns went (eased, and soft at zero, so crossing over has no corner);
  //   u  going in or coming out: -1 while the lean grows, +1 while it shrinks, read off how fast the lean changes and eased (never switched).
  // The pose is the middle of the lab's way in and way out at that lean, plus u times half their difference. A right turn's start is a left turn's
  // end, so the same u carries straight on through the crossing and the two sides meet exactly at zero lean.
  // (2026-11-15: two earlier versions picked "going in" or "coming out" by the sign of the lean's change, then by a phase angle; both jumped
  // between postures that are far apart at the same lean, and every jump snapped the legs: the owner's "卡蹦".)
  const PH = () => ({ w: 0, cref: 0.21, dl: 0, u: 0, prev: null, ref: 0.6, sv: null, svv: 0, su: 0, suv: 0 });
  const st = PH(), sb = PH();
  function phase(S, p, dt, peak, wn) {
    const lean = p.lean || 0, cr = p.crouch == null ? 0.21 : p.crouch;
    if (dt > 0 && S.prev != null) {
      const r = (lean - S.prev) / dt; S.dl += (r - S.dl) * (1 - Math.exp(-dt / 0.08));
      // u: the lean's rate against a brisk turn's (about 1.5 rad/s), saturating softly, then eased over ~0.15 s
      const uT = Math.tanh(-S.dl / 1.5 * 1.6); S.u += (uT - S.u) * (1 - Math.exp(-dt / 0.06));
      // how deep the turns go: follows a deeper lean at once-ish, forgets slowly
      const a = Math.abs(lean); S.ref += (a - S.ref) * (1 - Math.exp(-dt / (a > S.ref ? 0.3 : 3)));
      S.cref += (cr - S.cref) * (1 - Math.exp(-dt / 1.5));
    } else { S.dl = 0; S.u = 0; S.ref = Math.max(0.6 * peak, Math.abs(lean)); S.cref = cr; }
    S.prev = lean;
    const ref = Math.max(S.ref, 0.45 * peak), sa = Math.abs(lean);
    // the signed share (which side and how far) and u are then eased critically (no overshoot, ~0.1 s), so even when the game's lean swings over
    // in a few frames the legs take a quarter of a second or more to change, as real skiers' do (edge change about 0.4 s, knees bent throughout)
    const sv = (lean >= 0 ? 1 : -1) * Math.min(1, sa / ref);
    if (dt > 0 && S.sv != null) { const h = Math.min(dt, 0.05);
      S.svv += (wn * wn * (sv - S.sv) - 2 * wn * S.svv) * h; S.sv += S.svv * h;
      S.suv += (wn * wn * (S.u - S.su) - 2 * wn * S.suv) * h; S.su += S.suv * h;
      S.lev = (S.lev || 0) + (wn * wn * (lean - S.le) - 2 * wn * (S.lev || 0)) * h; S.le += S.lev * h; }      // (le: the lean eased exactly as the posture's share is, so the two stay in step)
    else { S.sv = sv; S.svv = 0; S.su = S.u; S.suv = 0; S.le = lean; S.lev = 0; }
    const e2 = 0.25; return { v: Math.min(1, (Math.sqrt(S.sv * S.sv + e2 * e2) - e2) / (Math.sqrt(1 + e2 * e2) - e2)), side: S.sv >= 0 ? 1 : -1, u: S.su, lean, le: S.le == null ? lean : S.le, lev: S.lev || 0, wn };
  }
  // a turn table at share v, going in / coming out by u
  // (owner 2026-11-18, playing: a short turn left, one right, let go, and as the body came back upright the trunk twisted the other way and back,
  // "像弹簧": measured, the chest 16 deg toward the turn going in, 11 deg the other way coming out, the shoulder line from 22 deg banked in to 10 deg
  // the other way within 0.4 s. That is the lab skier's way out of a turn, which already winds up for the next one, played whether a next one comes
  // or not. Under the new solver the trunk, head and arms take the posture half way between the way in and the way out at that lean, and only a
  // little of the difference (UK): they go over and come back by the same road, facing down the run, and the legs keep the whole rhythm under them)
  const UK = (() => { const k = new Array(39).fill(1); for (let i = 3; i < 9; i++) k[i] = 0.5; for (let i = 9; i < 39; i++) k[i] = 0.15; return k; })();
  const quietU = () => typeof Variants !== 'undefined' && Variants.val.solver === 'b';
  const at = (T, v, u) => { const a = row(T.rise, v), b = row(T.fall, v), qu = quietU(); return a.map((q, k) => (q + b[k]) * 0.5 + (b[k] - q) * 0.5 * u * (qu ? UK[k] : 1)); };
  const mirRow = r => { const V = i => [r[i], r[i + 1], r[i + 2]], mx = q => [-q[0], q[1], q[2]], mX = q => [q[0], -q[1], -q[2]];
    return [...mx(V(0)), ...mX(V(3)), ...mx(V(6)), ...mX(V(9)), ...mx(V(12)), ...mX(V(15)), ...mx(V(18)), ...mX(V(21)), ...mx(V(24)), ...mx(V(30)), ...mx(V(27)), ...mx(V(36)), ...mx(V(33))]; };
  const mix = (a, b, t) => a.map((q, k) => q + (b[k] - q) * t);
  const weight = (S, p, dt, extra) => {
    const idle = p.idleRest || 0, grab = Math.max(p.grabL || 0, p.grabR || 0);
    const wT = on() ? (1 - Math.min(1, (p.air || 0) * 2.5)) * (1 - Math.min(1, (p.tuck || 0) * 1.6)) * (1 - Math.min(1, grab * 2)) * extra * (1 - idle) : 0;
    // (critically damped, about a quarter of a second: the figure is handed over without its speed ever jumping)
    if (dt > 0) { const w = 12, d = S.w - wT, e = Math.exp(-w * dt), b = ((S.wv || 0) + w * d) * dt; S.w = Math.min(1, Math.max(0, wT + (d + b) * e)); S.wv = ((S.wv || 0) - w * b) * e; }
    else { S.w = wT; S.wv = 0; } return S.w;
  };
  const out = { w: 0, cref: 0.21, pel: [0, 0, 0], pb: null, t1: null, t2: null, hb: null, ua: [null, null], fa: [null, null] };
  // (crT: the roll the trunk, head and arms take, when it is not the hips' own (新求解器, M.step))
  function fill(o, S, r, cr, axis, crT, crA) {
    const V = i => [r[i], r[i + 1], r[i + 2]], rot = c => { const cs = Math.cos(c), sn = Math.sin(c); return axis === 'z' ? q => [q[0] * cs + q[1] * sn, -q[0] * sn + q[1] * cs, q[2]] : q => [q[0], q[1] * cs + q[2] * sn, -q[1] * sn + q[2] * cs]; };
    const R = rot(cr), T = crT == null ? R : rot(crT), H = crT == null ? R : rot((cr + crT) / 2);
    const Ar = crA == null ? T : rot(crA);      // (the arms: see M.step)
    o.w = S.w; o.cref = S.cref; o.pel = R(V(0));
    o.pb = ortho(H(V(3)), H(V(6))); o.t1 = ortho(T(V(9)), T(V(12))); o.t2 = ortho(T(V(15)), T(V(18))); o.hb = ortho(T(V(21)), T(V(24)));
    o.ua[0] = nrm(Ar(V(27))); o.ua[1] = nrm(Ar(V(30))); o.fa[0] = nrm(Ar(V(33))); o.fa[1] = nrm(Ar(V(36)));
    return o;
  }
  M.step = function (p, sec, dt, speed, latA) {
    p.idleRest = sec.idle ? sec.idle.rest || 0 : 0;
    const ph = phase(st, p, dt, D.clips.carve.peak, 16); weight(st, p, dt, p.dp > 0 ? 0 : 1);
    if (st.w < 1e-3) return null;
    // which turns, by speed (m/s)
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const wS = 1 - sm(5, 9, speed), wG = sm(14, 20, speed), cw = [wS, Math.max(0, 1 - wS - wG), wG];
    const r = new Array(39).fill(0);
    for (let c = 0; c < 3; c++) { if (cw[c] <= 0) continue;
      const x = at(D.clips[CL[c]], ph.v, ph.u * ph.side), y = ph.side > 0 ? x : mirRow(x);
      for (let i = 0; i < 39; i++) r[i] += cw[c] * y[i]; }
    // the rest of the lean: the whole figure rolled about the skis (the game's pelvis stands out by H sin(lean) + 0.07 sin(lean): about 1.07 lean)
    out.clip = cw; out.v = ph.v; out.u = ph.u;
    // (新求解器: the hips go where the game's lean puts them this frame, but the posture is the one of the lean a tenth of a second ago (eased, above).
    // Rolled whole by the difference, the trunk was thrown over by however fast the lean was changing: 17 deg toward the new side at the moment the
    // lean crossed zero, 8 deg against the lean on the way back. The trunk is rolled by the eased lean the posture belongs to: it tips with the
    // lean and comes back with it)
    // (and owner, the same day: "高手…归位的时候，躯干和重心尽量在一条直线上". The lab's posture holds the trunk upright over hips that are far inside
    // (measured here: 5 deg the other way at 30 deg of lean); TRUNK_IN of the lean is given back to the trunk, so it lies most of the way along the
    // line from the skis through the hips, and stands up with it)
    // (the arms do not tip over with the trunk: hung from a trunk that leans in, the inside hand and forearm came down onto the inside thigh
    // (Mac round 16: hand x thigh 0 -> 136 frames). They keep the lab's own line, hands level, as a skier carries them)
    const ARM_IN = 0.0;
    // (owner 2026-11-18: "刻滑的过程中头眼睛需要面向哪里". A carving skier's eyes are on the exit of this turn and the start of the next, a second or so
    // ahead, held level. The head reads the lean HEAD_FAR s ahead at its present rate (soft-capped at 0.8 rad): through the apex that is this turn, and
    // as the lean comes off it already points into the next one, instead of being held back to nothing until the edges change)
    const HEAD_FAR = 0.8, HEAD_CAP = 0.5;
    const TRUNK_LEAD_T = 0.07, TRUNK_UNLAG = 0, LEAD_RATE_MAX = 3.0, TRUNK_IN_DEEP = 0.14, LOOK_H = 0.5, LOOK_C = 0.35, LOOK_END = 0.6, HEAD_AHEAD = 0.16, CHEST_AHEAD = 0.03, PEL_SQ = 0.3, HEAD_ROLL_KEEP = 0.45;
    const TRUNK_IN = 0.27, TRUNK_IN_SLOW = -0.06, SLOW_V0 = 5, SLOW_V1 = 13, BAL = 0.18, lab = Math.atan2(r[0], r[1]);
    if (!quietU()) return fill(out, st, r, ph.lean * 1.07 - lab, 'z');
    // (新求解器, owner 2026-11-18: "想左转，一定是身体跟肩膀先倾过来…头稍微往正回一点点". Measured (turnM): the shoulders tipped 6 frames AFTER the hips
    // (they took the eased lean), so at every edge change they still hung 20-28 deg over the old turn; at 47 deg of lean the shoulder line stood at
    // 47 deg too and the head at 30; the trunk was square to the skis all the way round (0-3 deg).
    //   lt        the lean the trunk's own share tips by. It is rebuilt from the eased lean and that follower's own rate (le + 2/wn * rate is the game's
    //             lean without the easing's lag, and without a step in the lean reaching the shoulders as a kick: at a takeoff the lean drops at
    //             7 rad/s) plus TRUNK_LEAD_T seconds of that rate ahead of it, so the shoulders go over first and the hips follow. The lead is less
    //             than the lean's own time to come back (1/wn = 0.105 s), so it does not tip past upright. The rate is held under LEAD_RATE_MAX
    //             (a brisk turn's is about 2.7 rad/s)
    //   arms      tip by that same lt (their amount is unchanged: ARM_IN), so the hands go over with the shoulders. Left on the eased lean under
    //             shoulders that now lead, the poles lay across the thighs (12 scenarios: clip frames 6746 -> 7365; on lt 1814)
    //   kin       deep in a turn the trunk gives back less of the lean (TRUNK_IN_DEEP): the hips go in, the shoulders stay nearer level
    //   yaw       see the heading order below)
    const lr = LEAD_RATE_MAX * Math.tanh(ph.lev / LEAD_RATE_MAX), lt = ph.le + (2 / ph.wn + TRUNK_LEAD_T) * lr, kin = TRUNK_IN_SLOW + (TRUNK_IN - TRUNK_IN_SLOW) * sm(SLOW_V0, SLOW_V1, speed) - TRUNK_IN_DEEP * sm(0.45, 0.85, Math.abs(lt));
    // (by speed, owner 2026-11-18 "要不要根据速度来区分拐弯的动作" + design doc: measured at each turn's deepest frame, the trunk (hips to shoulders) tipped
    // 0.95 of the leg line (feet to hips) under 22 km/h and 0.61-0.75 above; a real skier's stands at 0-0.2 of it at slow speed (the legs steer, the
    // trunk stays upright) and 0.4-0.6 carving (Ski Racing / LeMaster; frame-by-frame measurements of carving video, 2026-11-18). So the share of the
    // lean given back to the trunk is TRUNK_IN_SLOW below SLOW_V0 m/s and TRUNK_IN from SLOW_V1 up, and TRUNK_IN_DEEP less deep in a turn. The lab's own turn posture already stands the trunk at about 0.4 of the leg line, so the shares are small and the slow one is negative: the trunk is stood back up)
    // (the trunk's own roll rides on the lean without the easing's lag (l0), not on the eased lean: on the eased one its lead was eaten, and against
    // the leg line (feet to pelvis) the shoulders went over 0.01 s BEFORE to 0.01 s AFTER the legs: together, not first (scorer Rshlead / Rshlead0, 2026-11-18))
    const l0 = ph.le + TRUNK_UNLAG * (2 / ph.wn) * lr;      // (TRUNK_UNLAG 1, lead 0.115 s: at a linked edge change the trunk stood 16 deg off the leg line, Rshline0; 0.5 gave 0.09 s. Now 0: research 2026-11-18 (LeMaster / Ski Racing, Brown & Reid) says the body tips in as a unit and the shoulders then stay more level than the legs; shoulders tipping first is banking, a fault)
    // (balance: stood up over legs that stay where they were, the trunk carried the body's weight outward: the line from the centre of mass along
    // the lean came down 13% of the stance OUTSIDE the outside foot in deep carves (scorer R0 1.7 -> 4.1 cm, R0s 0.98 -> 1.13). A skier who angulates
    // puts the hips further IN by as much as the shoulders come out. The trunk is about 0.6 of the weight, 0.3 m above the hips, the whole about 1 m
    // up the leg line: BAL = 0.18 rad of extra roll for the whole figure per rad the trunk was stood up (against the 0.6 share it had before))
    const bal = BAL * (0.6 - kin) * l0;
    fill(out, st, r, ph.lean * 1.07 - lab + bal, 'z', l0 * 1.07 - lab + kin * lt + bal, lt * 1.07 - lab + ARM_IN * ph.le + bal);
    // (and the shoulders never tip to the OUTSIDE of the turn: at 2.5-4 m/s some turns still had them 5-8 deg outward (Mac round 27; the lab's slow
    // posture already stands the trunk up, and how far differs from turn to turn). Whatever the chest's right-left line (t2's X) rolls outward is
    // taken back out of the chest, and half of it out of the lower trunk. Nothing at zero, so it comes in without a step)
    // (only at slow speed, and eased in over the first 2 deg: taken out whole at every speed, it stopped the shoulders dead at each edge change,
    // where they rightly cross a moment before or after the eased lean: jolts 17 -> 129 in a deep carve run)
    { const c0 = Math.atan2(-out.t2.X[1], out.t2.X[0]), n = Math.max(0, -c0 * Math.sign(ph.le)), c = -Math.sign(ph.le) * (n * n / (n + 0.035)) * (1 - sm(4, 7, speed)) * sm(0, 0.08, Math.abs(ph.le));      /* (which side is outward flips as the lean crosses zero: faded in over the first 0.08 rad so it never steps) */ if (c !== 0) { const rz = (q, a) => { const cs = Math.cos(a), sn = Math.sin(a); return [q[0] * cs + q[1] * sn, -q[0] * sn + q[1] * cs, q[2]]; };
        out.t2 = ortho(rz(out.t2.X, -c), rz(out.t2.Y, -c)); out.t1 = ortho(rz(out.t1.X, -c / 2), rz(out.t1.Y, -c / 2)); } }
    // (heading order, owner 2026-11-18 (the research on sports games, adopted): the head looks where the skier will be going in LOOK_H s, the chest
    // LOOK_C, the skis last. The way the line is about to turn is read from the lean the trunk already leads with (lt): a
    // carving skier's heading turns at g tan(lean) / v. Each is held under its cap, so head over chest and chest over hips never twist far.
    // Before: the shoulders 0.15 of the lean, the head HALF of that: the head followed the shoulders, it did not lead them)
    // (how much of that the line really turns: LOOK_EFF, the path's own turning (its sideways acceleration over its speed) against the lean's promise,
    // followed slowly. In short turns the skis skid and the body's lean promises four times the turn the path makes: Mac round 23, the head
    // looked 13 deg into a turn whose line came round 3 deg in the half second)
    { const wl = 9.81 * Math.tan(Math.max(-1, Math.min(1, ph.le))) / Math.max(speed, 6), wa = (latA || 0) / Math.max(speed, 6);
      if (st.eff == null) st.eff = 0.6; if (dt > 0 && Math.abs(wl) > 0.12) st.eff += (Math.max(0.2, Math.min(1, wa / wl)) - st.eff) * (1 - Math.exp(-dt * 2.5)); }
    const psi = st.eff * 9.81 * Math.tan(Math.max(-1, Math.min(1, lt))) / Math.max(speed, 6), capY = (x, m) => m * Math.tanh(x / m), rotY = (q, a) => { const c = Math.cos(a), n = Math.sin(a); return [q[0] * c + q[2] * n, q[1], -q[0] * n + q[2] * c]; };
    // (and no further ahead than the turn lasts: while the lean is coming off, the look-ahead is held to LOOK_END of the time the lean has left
    // (lean over its rate). In short turns half a second ahead is already the NEXT turn: the head stayed looking into a turn that was ending)
    // (Mac round 24: measured on lt itself, the hold squeezed the look to nothing until lt crossed zero and then let it go at once, so head, chest and
    // hips all changed sides together and the head jolted. Each part's time left is now measured on the lean IT reads (lt plus its own ahead))
    const leftOf = x => x * lr < 0 ? LOOK_END * Math.abs(x) / Math.max(Math.abs(lr), 1e-3) : 9, sminT = (x, y) => -Math.log(Math.exp(-x / 0.05) + Math.exp(-y / 0.05)) * 0.05, kH = sminT(LOOK_H, leftOf(lt + HEAD_AHEAD * lr)) / LOOK_H, kC = sminT(LOOK_C, leftOf(lt + CHEST_AHEAD * lr)) / LOOK_C;
    // (the head and the chest read the lean a little further ahead still, HEAD_AHEAD and CHEST_AHEAD s of its rate: read from the lean the trunk
    // has, the head was held looking into the old turn until that lean crossed zero, and came into the new one 3-6 frames LATER than it had
    // (Mac round 23). So the head lets go of the old turn first, then the chest, then the hips, and the skis last)
    // (PEL_SQ: the lab's pelvis stands 13-16 deg into the turn at 25-35 deg of lean, 4-6 deg MORE than the chest, measured in the leaned body (Mac
    // round 23, seen from above too): hips rotated in ahead of the shoulders, a learner's turn. It is squared back by PEL_SQ rad per rad of lean)
    const wOf = l => st.eff * 9.81 * Math.tan(Math.max(-1, Math.min(1, l))) / Math.max(speed, 6);
    const a = -capY(LOOK_C * kC * wOf(lt + CHEST_AHEAD * lr), 0.30), aH = HEAD_FAR ? -capY(LOOK_H * wOf(0.8 * Math.tanh((lt + HEAD_FAR * lr) / 0.8)), HEAD_CAP) : -capY(LOOK_H * kH * wOf(lt + HEAD_AHEAD * lr), 0.45), aP = capY(PEL_SQ * lt, 0.12),      // (squared by the lean the trunk reads, lt: on the eased lean the squaring came late and the hips changed sides before the chest, Mac round 24)
      
       tb = B => ortho(rotY(B.X, a), rotY(B.Y, a)), t1b = B => ortho(rotY(B.X, (a + aP) / 2), rotY(B.Y, (a + aP) / 2));
    out.pb = ortho(rotY(out.pb.X, aP), rotY(out.pb.Y, aP));
    out.t1 = t1b(out.t1); out.t2 = tb(out.t2);
    { let X = rotY(out.hb.X, aH), Y = rotY(out.hb.Y, aH);
      // (Mac round 27: on a trunk that now stands up, the lab's own head, which was levelled against a leaning trunk, tipped 3-9 deg to the OUTSIDE of
      // the turn. A head keeps HEAD_ROLL_KEEP of a tilt into the turn and none of a tilt out of it: X is the head's right, so X[1] against the lean is outward)
      const hx = Math.atan2(X[1], Math.hypot(X[0], X[2])), bh = -hx * (1 - HEAD_ROLL_KEEP * sm(-0.01, 0.01, -hx * ph.le)),      /* (blended, Mac round 31: switched outright at each edge change the head stepped 3-4 deg in a frame) */ f = [-X[2], 0, X[0]], fl = Math.hypot(f[0], f[2]) || 1, ax = [f[0] / fl, 0, f[2] / fl];      // (the tilt is taken out about the level line the head faces along)
      const rod = q => { const c = Math.cos(bh), n = Math.sin(bh), d = dt3(ax, q), x = crs(ax, q); return [q[0] * c + x[0] * n + ax[0] * d * (1 - c), q[1] * c + x[1] * n + ax[1] * d * (1 - c), q[2] * c + x[2] * n + ax[2] * d * (1 - c)]; };
      out.hb = ortho(rod(X), rod(Y)); }
    return out;
  };
  // ---- on a snowboard (Variants 'ride' b, 08a_board.js): the lab's board turn. Toe and heel turns are not mirror images, so each has its own
  // table (the end of a toe turn is the start of a heel turn); everything is in the board solver's rider space (x toward the tail, y up, z toward
  // the heel edge: the rider faces -z), and the figure is rolled about the board's length to the game's lean (+ = over the toes)
  const outB = { w: 0, cref: 0.21, pel: [0, 0, 0], pb: null, t1: null, t2: null, hb: null, ua: [null, null], fa: [null, null] };
  M.stepB = function (p, sec, dt) {
    const T = D.clips.sbturn; if (!T) return null;
    p.idleRest = sec.idle ? sec.idle.rest || 0 : 0;
    const ph = phase(sb, p, dt, T.toe.peak, 11)      /* (a board's toe and heel postures lie further apart: a little slower over) */; weight(sb, p, dt, 1);
    if (sb.w < 1e-3) return null;
    // (toe side: the toe table; heel side: the heel table, whose way in is the toe turn's way out, so u's sign turns with the side)
    let r = at(ph.side > 0 ? T.toe : T.heel, ph.v, ph.u * ph.side);
    r = r.slice(); r[0] *= 0.5;      // (the lab's rider moves the hips 27 cm along the board through a turn, 12-16 cm toward the tail between turns: half of it here)
    return fill(outB, sb, r, ph.lean - Math.atan2(-r[2], r[1]), 'x');
  };
  return M;
})();
