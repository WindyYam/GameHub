"use strict";
// ---------------------------------------------------------------- 新求解器 (developer switch 'solver', design: 动作清单合同和求解器设计稿, 2026-11-17)
// The body's motion is to be the RESULT of the physics, the snow and the body's own limits, solved in one fixed order, instead of poses written by
// hand and patched afterwards. It replaces the old figure step by step behind this switch; the game's own dressed figure is what it moves.
//   step 1 (this file, so far): the skis lie on the real snow. The figure used to know one point of the snow and one plane through it, so where the
//   snow rolls (rollers, moguls, a gully's wall) a ski 1.5 m long cut into it (measured on the game's own figure: more than 1 cm in 14% of all
//   frames on snow, up to 37 cm). Here the snow is read under each ski along its length and the ski lies on it as a stiff bar (see lay).
const Solver = (() => {
  const K = Skier, sat = x => Math.max(0, Math.min(1, x));
  Variants.def('solver', '新求解器', [['a', '关'], ['b', '雪板贴真实雪面']], 'b');      // (default on, owner 2026-11-18: "有v8就merge v8")
  const ZS = [-0.75, -0.5625, -0.375, -0.1875, 0, 0.1875, 0.375, 0.5625, 0.75], EL = new Array(ZS.length), ER = new Array(ZS.length), EC = new Array(ZS.length), HALF = 0.6, DROP = 60, PUSH = 120, UPK = 40, PK = 20, GIVE = 0.004;
  // One ski, standing at (x0, z0) in the figure's frame, as what it is: a stiff bar that the snow can push up anywhere along its length but cannot pull
  // down. Each frame its two ends first fall as a thing falls that a leg pushes down (at most DROP), then the bar is lifted where the snow stands
  // over it, turning about the place it is hit as a bar does. So it lies on the high points of the snow under it; where the snow falls away faster
  // than it can fall (the back of a bump at speed) it is light for a moment; and over a lip its tail stays on the table while its tip comes down
  // at the pace a ski can turn, instead of the whole ski tipping in a frame. This is all the smoothing there is here: the contact itself.
  // (DROP was 30 until the second contact sheets, 2026-11-18: at 24 m/s through the mogul field a ski thrown up by one bump was still 0.5 m in the
  // air over the next. A leg pushes a boot and a ski down harder than that; at 60 the frames with both skis more than 10 cm off the snow fell from
  // 46 to 18 of 91 and the count of jolts stayed the same.)
  // q[k..k+3]: front end's height and speed, rear end's height and speed. Returns the height under the boot in q[k], q[k + 2] (as ends).
  function read(E, x0, z0, toW, ref, iy) { for (let i = 0; i < ZS.length; i++) { const q3 = toW([x0, 0, z0 + ZS[i]]); E[i] = (Course.height(q3[0], q3[2], 0.5) - q3[1] - ref) * iy; } }
  // One state for each ski through the whole of a run: on the snow, over a lip, in the air and back (design note "起跳、空中、落地的一次过渡",
  // 2026-11-18). What changes is only what the leg does with the ski while the snow is not pushing it:
  //   on the snow (on): the boot is pressed down (DROP), speed upward is absorbed (UPK), and the ski's pitch goes to the lie of the snow that is
  //     near under it (PK). Snow that has fallen away more than NEAR under a part of the ski is not counted: over a lip the shovel hangs in
  //     the air in the plane of the table, it does not dive after the drop (it did, 13 degrees in three frames, before the physics let go);
  //   in the air: the ski goes back to where the pose has it (0), on a path that starts with the speed it left with (OUT).
  // And the snow pushes the ski up wherever it meets it, in the air as well: the tail does not cut through the lip behind a take-off, and before
  // a landing the snow comes up to the ski and takes it, a frame or more before the physics says the legs are loaded. Nothing is blended.
  function lay(q, k, E, dt, on, near, hold) {
    const n = ZS.length, zf = -HALF, zr = HALF;
    const fresh = !(dt > 0) || q[k] == null; let f0 = q[k], r0 = q[k + 2], f, r;
    if (fresh) { if (on) { let sz = 0, se = 0, szz = 0, sze = 0; for (let i = 0; i < n; i++) { const z = ZS[i]; sz += z; se += E[i]; szz += z * z; sze += z * E[i]; }
        const b = (n * sze - sz * se) / (n * szz - sz * sz), a = (se - b * sz) / n; f = a + b * zf; r = a + b * zr; } else f = r = 0; }
    else if (on) { let vm = (q[k + 1] + q[k + 3]) / 2, vd = (q[k + 3] - q[k + 1]) / 2 * Math.exp(-PK * dt); if (vm > 0) vm *= Math.exp(-UPK * dt);
      if (hold > 0) vm *= 1 - hold; const mid = (f0 + r0) / 2 + (vm - DROP * (1 - hold) * dt) * dt; let d = (r0 - f0) / 2 + vd * dt;
      // (hold: just landed and still deep in the snow, the legs are taking the landing, they are not reaching down)
      let m = 0, sz = 0, se = 0, szz = 0, sze = 0, z0 = 9, z1 = -9;
      // (counted less and less from half of NEAR under the ski to one and a half times it, not in or out at a line: a sample crossing that line
      // turned the ski 6 degrees in three frames at the foot of a kicker, 2026-11-18)
      for (let i = 0; i < n; i++) { const z = ZS[i], wr = (z - zf) / (zr - zf), u = sat((f0 * (1 - wr) + r0 * wr - E[i] - NEAR * 0.5) / NEAR), w = 1 - u * u * (3 - 2 * u); if (!(w > 0)) continue; m += w; sz += w * z; se += w * E[i]; szz += w * z * z; sze += w * z * E[i]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const det = m * szz - sz * sz; if (m >= 2.5 && z1 - z0 >= 0.5 && det > 1e-6) { const b = (m * sze - sz * se) / det; d += (b * HALF - d) * (1 - Math.exp(-PK * dt) * 1) * sat((m - 2.5) / 2); }
      f = mid - d; r = mid + d; }
    // (in the air, with the snow coming up (near: 0 far off, 1 as it arrives): the ski turns to lie along the snow it is about to meet, so that
    // it lands flat on it. Without this it met the snow at the pose's angle and was turned by it, 3 degrees in three frames, after touching)
    else { let tg = 0; if (near > 0) { let sz = 0, se = 0, szz = 0, sze = 0; for (let i = 0; i < n; i++) { const z = ZS[i]; sz += z; se += E[i]; szz += z * z; sze += z * E[i]; } tg = Math.max(-0.35, Math.min(0.35, (n * sze - sz * se) / (n * szz - sz * sz))) * HALF * near; }
      const e = Math.exp(-OUT * dt), xf = f0 + tg, xr = r0 - tg, bf = (q[k + 1] + OUT * xf) * dt, br = (q[k + 3] + OUT * xr) * dt; f = (xf + bf) * e - tg; r = (xr + br) * e + tg; }
    for (let it = 0; it < 4; it++) for (let i = 0; i < n; i++) { const wr = (ZS[i] - zf) / (zr - zf), wf = 1 - wr, d = E[i] - (f * wf + r * wr); if (d > 0) { const g = d / (wf * wf + wr * wr); f += g * wf; r += g * wr; } }
    // (and the snow cannot throw a ski up at any pace either: a boot, a ski and the leg above them weigh some kilograms, and snow gives way when it
    // is hit: an end's speed upward grows by at most PUSH. Measured without it, in a mogul field at 18 m/s: the foot's speed turned from 1.8 m/s down
    // to 3 m/s up in one frame, 30 g, and the knee's angle with it. For the frame or two that this takes, the ski cuts into the face of the bump)
    if (!fresh) { const vf = Math.min((f - f0) / dt, q[k + 1] + PUSH * dt), vr = Math.min((r - r0) / dt, q[k + 3] + PUSH * dt); f = f0 + vf * dt; r = r0 + vr * dt; }
    q[k + 1] = fresh ? 0 : Math.max(-6, Math.min(6, (f - f0) / dt)); q[k + 3] = fresh ? 0 : Math.max(-6, Math.min(6, (r - r0) / dt)); q[k] = f; q[k + 2] = r;
  }
  // The physics carries the body over a mogul field as legs that absorb would: it rides only a part of each bump's height (pose.mogK; the game's
  // MOG_K is 0.45) and leaves the rest to the legs. The legs have 0.38 m of travel, and the bumps left to them stand up to 0.65 m over the physics'
  // snow (measured, 2026-11-18): where a bump is more than the legs have left, the body has to go up over it. It does so as a skier does who sees the
  // bump coming: the snow is read along the line of travel for the next AHEAD seconds, and the body starts up before the bump is under the feet,
  // on a path with no step in it. q[13..15]: where the figure was (its velocity is read off that), q[16], q[17]: the lift and its speed.
  const AHEAD = 0.4, TRAVEL = 0.38, SPARE = 0.04, LW = 9;
  function bump(x, z, mk) { const real = Course.height(x, z, 0.5); if (!(mk < 1)) return 0; const k0 = Course.mogK; Course.mogK = mk; const ph = Course.height(x, z, 0.5); Course.mogK = k0; return real - ph; }
  function lift(q, cur, root, dt, on, over) {
    const p = root.pos; let vx = 0, vz = 0;
    if (dt > 0 && q[13] != null) { vx = (p[0] - q[13]) / dt; vz = (p[2] - q[15]) / dt; } q[13] = p[0]; q[15] = p[2];
    if (!(dt > 0) || q[16] == null) { q[16] = 0; q[17] = 0; }
    let need = 0;
    if (on && (cur.mogK == null ? 1 : cur.mogK) < 1) { const room = TRAVEL * (1 - sat(cur.crouch == null ? 0.21 : cur.crouch)) - SPARE;
      for (let k = 0; k <= 4; k++) { const t = AHEAD * k / 4; need = Math.max(need, (bump(p[0] + vx * t, p[2] + vz * t, cur.mogK) - room) * (1 - 0.5 * k / 4)); } }
    need = Math.max(need, over || 0);
    if (dt > 0) { const d = q[16] - need, e = Math.exp(-LW * dt), b = (q[17] + LW * d) * dt; q[16] = need + (d + b) * e; q[17] = (q[17] - LW * b) * e; }
    return q[16];
  }
  // Whether there is snow to lie on is the physics' own word (pose.onSnow, 07_game.js), taken at once: the eased pose.air is a tenth of a second late,
  // and in that time the figure's frame has already turned to lie along the flight and the snow read in it is far off (measured: the skis were thrown
  // 0.7 m at a lip). Off the snow the correction dies away; back on it, it comes in over a tenth of a second (until the one transition of the design
  // note is built, step 8).
  const STEP = 1 / 60, NMAX = 6, OUT = 12, APART = 0.08, NEAR = 0.05, SOFT = 0.12, RISE = 24, AHEADL = 0.3;
  K.ground = (cur, root, Y, toW, sec, dt) => {
    if (Variants.val.solver !== 'b' || typeof Course === 'undefined' || (K.boardOn && K.boardOn())) { sec.gs = null; return null; }
    const q = sec.gs || (sec.gs = new Array(32).fill(null)), on = cur.onSnow == null ? (cur.air || 0) < 0.5 : cur.onSnow > 0, out = [0, 0, 0, 0, 0];
    if (!(dt > 0)) { q[30] = q[31] = null; for (let k = 0; k < 8; k++) q[k] = null; for (let k = 18; k < 22; k++) q[k] = null; }
    // (the physics has the skis at root.pos, sunk into soft snow as far as it says: the snow is read relative to that, so the sinking stays)
    // (2026-11-18: by the game's own count, pose.sink, not by reading the snow under the one point root.pos: past a lip that point is over the drop a
    // frame before the physics lets go, and everything read against it jumped)
    // (in the air the snow takes hold of a ski only where it stands more than SOFT over it: the game lets the skis punch that far into the snow in the
    // frame they land, at 10 m/s they are 18 cm on in a frame, and counts it as its own sink from then on. Pushed up before that, they were dropped
    // again a frame later: 134 jolts at the landings of three runs)
    const ref = !on ? SOFT : cur.sink == null ? Course.height(root.pos[0], root.pos[2], 0.5) - root.pos[1] : cur.sink, iy = 1 / Math.max(Y[1], 0.3);
    const st = cur.stance == null ? 0.31 : cur.stance, ld = cur.lead || 0;
    read(EL, -st / 2, ld, toW, ref, iy); read(ER, st / 2, -ld, toW, ref, iy); for (let i = 0; i < ZS.length; i++) EC[i] = Math.max(EL[i], ER[i]);
    // A landing: the skis come down at up to 10 m/s and are in the snow by more than the game's count of it in the frame they arrive (measured:
    // 7 to 10 cm more, for four frames). Snow hit that hard gives way; it does not throw the skis back up in a frame. How far they are in when they
    // land is taken as it is (q[9]), and from there they come up out of it on a path that starts at rest (RISE). q[11]: was on the snow last frame.
    if (on && q[11] === 0 && dt > 0 && q[18] != null) { let pen = 0; for (let i = 0; i < ZS.length; i++) { const wr = (ZS[i] + HALF) / (2 * HALF); pen = Math.max(pen, EC[i] - (q[18] * (1 - wr) + q[20] * wr)); } q[9] = Math.min(pen, 0.3); q[10] = 0; }
    q[11] = on ? 1 : 0;
    if (on && q[9] > 1e-4 && dt > 0) { const e = Math.exp(-RISE * dt), b = (q[10] + RISE * q[9]) * dt; q[9] = (q[9] + b) * e; q[10] = (q[10] - RISE * b) * e; { let top = 0; for (let i = 0; i < ZS.length; i++) top = Math.max(top, EC[i]); if (q[9] > top) { q[9] = top; q[10] = Math.min(q[10], 0); } }      // (no deeper than the skis are: the game brings them up as well)
      for (let i = 0; i < ZS.length; i++) { EL[i] -= q[9]; ER[i] -= q[9]; EC[i] -= q[9]; } }
    else if (!on || !(dt > 0)) { q[9] = 0; q[10] = 0; }
    // (how soon the snow arrives, in the air: from how far under the skis it is and how fast that closes. q[12]: how far it was a frame ago)
    let near = 0; if (!on) { let top = -9; for (let i = 0; i < ZS.length; i++) top = Math.max(top, EC[i]); if (dt > 0 && q[12] != null && top > q[12] && top < 0) { const ttc = -top / ((top - q[12]) / dt); near = sat(1 - ttc / AHEADL); near *= near * (3 - 2 * near); } else if (top >= 0) near = 1; q[12] = top; } else q[12] = null;
    const hold = on ? sat((q[9] || 0) / 0.02) : 0;
    // The bars are stepped on a clock of their own, STEP seconds a step, not once a frame (owner 2026-11-18, screen recording of the title page:
    // "为什么开始的时候板在抖动"). Each step lets a bar fall and the snow push it back, and where it comes to rest depends on the length of the
    // step (measured standing still: tip pitch 0.013 rad at 60 frames a second, 0.005 at 120, the height 2 to 6 mm apart). A browser's frames are
    // never all the same length, so the skis of a figure standing still nodded from frame to frame, and on the move they shook by as much
    // (pitch acceleration p50 46 rad/s² on uneven frames, 1.3 on even ones). STEP is the 1/60 s all of this was tuned and measured at, so a
    // steady 60 is exactly as before; a step is taken when the frames have added up to within half a step of it (so a 60 Hz screen that runs
    // a little early or late still takes one a frame, never none and then two), and q[28] keeps the time ahead or behind. (1/240 was tried:
    // in the moguls the skis held the snow more tightly than the legs were tuned for, jolts 28 -> 53 a minute.)
    // The two skis hang from one pelvis, a hand's width apart, and a skier holds them together: they do not each go their own way over the snow.
    // (seen on the first contact sheets, 2026-11-18, in the mogul field: solved each alone, one ski stood 30 degrees tip up on the face of a bump
    // while the other lay flat in the trough beside it, the skis crossed in an X and one knee came up to the chest.) So a third bar lies on the
    // higher of the two skis' snow, as one wide ski would, and each ski of its own may hang below that one by at most APART at either end:
    // the ski over the lower snow is carried, light or just off the snow, as the inside ski is over a trough in a real mogul line.
    // (measured against the higher of that bar and the other ski: a ski the snow is already throwing up can be ahead of the bar for some frames)
    // (the snow is read once a frame: where a frame takes more than one step, each lays the bars on the snow as far between this reading and the
    // last as the step is in time, not all of them on the newest)
    const P = sec.gsE || (sec.gsE = [EL.slice(), ER.slice(), EC.slice()]), SL = sec.gsS || (sec.gsS = [EL.slice(), ER.slice(), EC.slice()]), CUR = [EL, ER, EC];
    const at = w => { for (let b = 0; b < 3; b++) for (let i = 0; i < ZS.length; i++) SL[b][i] = P[b][i] + (CUR[b][i] - P[b][i]) * w; };
    const step = h => { lay(q, 0, SL[0], h, on, near, hold); lay(q, 4, SL[1], h, on, near, hold); lay(q, 18, SL[2], h, on, near, hold);
      for (let e = 0; e < 4; e += 2) { const top = Math.max(q[18 + e], q[e], q[4 + e]), vt = top === q[18 + e] ? q[19 + e] : top === q[e] ? q[1 + e] : q[5 + e];
        for (let k = e; k < 8; k += 4) if (q[k] < top - APART) { q[k] = top - APART; q[k + 1] = Math.max(q[k + 1], vt); } } };
    if (!(dt > 0) || q[0] == null || q[4] == null || q[18] == null) { q[28] = 0; sec.gsQ = null; at(1); step(0); }
    else { const a0 = q[28] || 0; let n = Math.floor((q[28] = a0 + dt) / STEP + 0.5); if (n > NMAX) { n = NMAX; q[28] = n * STEP; } q[28] -= n * STEP;
      for (let i = 0; i < n; i++) { const Q = sec.gsQ || (sec.gsQ = [0, 0, 0, 0]); Q[0] = q[0]; Q[1] = q[2]; Q[2] = q[4]; Q[3] = q[6]; at(sat(((i + 1) * STEP - a0) / dt)); step(STEP); } }
    for (let b = 0; b < 3; b++) for (let i = 0; i < ZS.length; i++) P[b][i] = CUR[b][i];
    // (and shown where they are at the frame's own time, q[28] after the last step (before it, when the steps have run ahead): along the line
    // from the step before to the last one. On a 120 Hz screen, which steps every other frame, they were otherwise held still for one frame and
    // moved two frames' worth in the next; at a steady 60 this is the step itself)
    const Q0 = sec.gsQ, al = dt > 0 && Q0 ? Math.max(-1, Math.min(1, (q[28] || 0) / STEP)) : 0;
    for (let k = 0; k < 2; k++) { const f = al ? q[k * 4] + (q[k * 4] - Q0[k * 2]) * al : q[k * 4], r = al ? q[k * 4 + 2] + (q[k * 4 + 2] - Q0[k * 2 + 1]) * al : q[k * 4 + 2];
      // (the body the physics carries rides its own spring a few millimetres up and down against the snow, every few frames; a boot's sole, a
      // binding and the snow under a ski give by as much. Within GIVE the foot stays where it is in the figure: with the legs nearly straight
      // before a take-off, 5 mm of foot was more than a degree of knee, frame to frame)
      let h = (f + r) / 2; const h0 = q[30 + k]; h = h0 == null ? h : h > h0 + GIVE ? h - GIVE : h < h0 - GIVE ? h + GIVE : h0; q[30 + k] = h;
      out[k * 2] = h; out[k * 2 + 1] = -Math.atan((r - f) / (2 * HALF)); }
    // A leg has only so far to fold (TRAVEL, less what the pose has already folded and a little to spare). Where the snow lifts a foot by more
    // than that, the rest is the body's to go up by (lift takes it, on the same smooth path as the bumps it saw coming), and until the body is
    // there the foot waits: for those frames the ski is in the face of the bump, as the old figure's was all the time, and the knee is not at the chest
    // (second contact sheets, 2026-11-18: at 24 m/s through the mogul field the feet came up 0.8 m under a body that stayed where it was).
    const room = TRAVEL * (1 - sat(cur.crouch == null ? 0.21 : cur.crouch)) - SPARE;
    out[4] = lift(q, cur, root, dt, on, Math.max(out[0], out[2]) - room);
    out[0] = Math.min(out[0], room + out[4]); out[2] = Math.min(out[2], room + out[4]);
    return out;
  };
  return {};
})();
