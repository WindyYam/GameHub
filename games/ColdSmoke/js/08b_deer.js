"use strict";
// ---------------------------------------------------------------- deer: now and then one or two come out of the trees and run with you a while
// Made the way the skier is: a distance field meshed once (the body) and tubes swept along curves (the antlers), skinned to a skeleton
// that a gait function poses. Model space: origin on the snow under the middle of the trunk, +y up, -z ahead, +x the animal's right.
const Deer = (() => {
  const D = { ready: false, NB: 25, herd: [], next: 36, count: 0, enabled: true, gap: [75, 125] };
  const B = { hips: 0, spine: 1, chest: 2, neck1: 3, neck2: 4, head: 5, earL: 6, earR: 7, tail: 8,
    fUpL: 9, fMidL: 10, fCanL: 11, fHoofL: 12, fUpR: 13, fMidR: 14, fCanR: 15, fHoofR: 16,
    hUpL: 17, hMidL: 18, hCanL: 19, hHoofL: 20, hUpR: 21, hMidR: 22, hCanR: 23, hHoofR: 24 };
  let gfx, vb, vb2, ib, count = 0, pipe, pipeShadow, boneTex;
  const ROWS = 64, boneData = new Float32Array(4 * ROWS * 4);
  let bind = null, invBind = [];

  // ---- the standing animal: where its joints are (right side; the left mirrors in x)
  const MID = [0, 1.05, 0.02], HALF = 0.42;                     // middle of the back, and how far the shoulders and the hips lie from it
  const SH = [0.125, 1.00, -0.42], EL = [0.125, 0.78, -0.32], CA = [0.115, 0.42, -0.38], FF = [0.115, 0.105, -0.37];   // shoulder, elbow, knee (carpus), fetlock
  const HP = [0.115, 1.04, 0.46], ST = [0.125, 0.76, 0.34], HK = [0.115, 0.47, 0.56], HF = [0.115, 0.105, 0.50];       // hip, stifle, hock, fetlock
  const TOE = [0, -0.105, -0.055];                              // from fetlock to the tip of the hoof
  // a leg of three bones folds like a Z. The top bone and the cannon keep a fixed angle to each other (tendons see to that), which
  // leaves a plain two-bone problem: one 'bone' that is their sum, and the middle one
  function legSpec(a, b, c, d) {
    const ang = (p, q) => Math.atan2(q[1] - p[1], q[2] - p[2]), len = (p, q) => Math.hypot(q[1] - p[1], q[2] - p[2]);
    const l1 = len(a, b), l2 = len(b, c), l3 = len(c, d), a1 = ang(a, b), a3 = ang(c, d);
    let del = a3 - a1; del = Math.atan2(Math.sin(del), Math.cos(del));
    const A = Math.sqrt(l1 * l1 + l3 * l3 + 2 * l1 * l3 * Math.cos(del)), al = Math.atan2(l3 * Math.sin(del), l1 + l3 * Math.cos(del));
    let bd = (a1 + al) - ang(a, d); bd = Math.atan2(Math.sin(bd), Math.cos(bd));
    return { l1, l2, l3, del, A, al, bend: bd >= 0 ? 1 : -1 };
  }
  const LF = legSpec(SH, EL, CA, FF), LH = legSpec(HP, ST, HK, HF);
  function leg(H, T, L, o) {
    const dz = T[2] - H[2], dy = T[1] - H[1], Dd = Math.hypot(dz, dy), Dc = clamp(Dd, Math.abs(L.A - L.l2) + 0.03, L.A + L.l2 - 0.004), base = Math.atan2(dy, dz);
    const g = Math.acos(clamp((L.A * L.A + Dc * Dc - L.l2 * L.l2) / (2 * L.A * Dc), -1, 1));
    const eA = base + L.bend * g, aA = eA - L.al, cA = aA + L.del;
    const k1 = [lerp(H[0], T[0], 0.3), H[1] + L.l1 * Math.sin(aA), H[2] + L.l1 * Math.cos(aA)];
    const k2 = [lerp(H[0], T[0], 0.7), k1[1] + Dc * Math.sin(base) - L.A * Math.sin(eA), k1[2] + Dc * Math.cos(base) - L.A * Math.cos(eA)];
    const k3 = [T[0], k2[1] + L.l3 * Math.sin(cA), k2[2] + L.l3 * Math.cos(cA)];
    o.k1 = k1; o.k2 = k2; o.k3 = k3; return o;
  }
  const frame = (o, ydir, xh) => { const y = v3.norm(ydir); let x = v3.sub(xh, v3.mul(y, v3.dot(xh, y))); if (v3.len(x) < 1e-5) x = v3.cross(y, [0, 0, 1]); x = v3.norm(x); return m4.fromBasis(x, y, v3.cross(x, y), o); };
  // unit vectors of a body pitched nose-up by `a`: ahead, and up
  const ahead = a => [0, Math.sin(a), -Math.cos(a)], above = a => [0, Math.cos(a), Math.sin(a)];
  const S01 = (a, b, x) => smooth(a, b, x), bump = x => Math.sin(PI * sat(x));

  // ---- the stride. Each foot's own clock starts when it meets the snow: [how far ahead of where it stands at rest, how high, how far the hoof trails]
  const OFF = { hL: 0.0, hR: 0.05, fL: 0.52, fR: 0.57 };
  function footPath(p, beta, Ls, fore, o) {
    if (p < beta) { o.f = Ls * (0.5 - p / beta) + (fore ? 0.06 : 0.20); o.u = 0; o.c = 0; return o; }
    const s = (p - beta) / (1 - beta), lo = -Ls * 0.5 + (fore ? 0.06 : 0.20), hi = Ls * 0.5 + (fore ? 0.06 : 0.20);
    if (fore) {
      // folds up under the chest, hangs there through the gathered half of the stride, then reaches out and comes back a little to meet the snow
      o.f = lerp(lo, hi + 0.14, S01(0.40, 0.90, s)) - 0.14 * S01(0.90, 1.0, s) - 0.16 * bump(s / 0.36);
      o.u = 0.50 * S01(0.0, 0.24, s) * (1 - S01(0.58, 1.0, s)) + 0.05 * bump(s);
      o.c = S01(0.0, 0.14, s) * (1 - S01(0.72, 0.98, s));
    } else {
      // trails out behind through the long leap, then is thrown forward under the belly
      o.f = lerp(lo - 0.22 * bump(s / 0.42), hi, S01(0.36, 0.97, s));
      o.u = 0.36 * Math.pow(bump(s * 0.92 + 0.04), 1.15) + 0.10 * bump(s / 0.4);
      o.c = S01(0.0, 0.18, s) * (1 - S01(0.74, 0.99, s));
    }
    return o;
  }
  const _fp = { f: 0, u: 0, c: 0 }, _lg = {};
  // g: { ph: where in the stride (0..1), run: 0 standing .. 1 full gallop, speed (m/s), freq (strides/s), yaw: head turned (rad), lean, ear }
  const G0 = { ph: 0, run: 0, speed: 0, freq: 2, yaw: 0, lean: 0, ear: 0 };
  function solve(g) {
    const J = {}, F = new Array(D.NB), run = g.run, w = TAU * g.ph;
    const Ls = run * Math.min(0.92, g.speed / Math.max(g.freq, 0.5) * 0.2), beta = run > 0.01 ? clamp(Ls / Math.max(g.speed / Math.max(g.freq, 0.5), 1e-3), 0.06, 0.3) : 1;
    // the trunk: the long leap after the hind legs drive (it tops out a third of the way through), the short one after the fore legs
    const bob = run * (0.040 * Math.sin(w - 0.72) + 0.060 * Math.cos(2 * (w - 2.29)) - 0.05);
    const pit = run * (0.135 * Math.sin(w + 0.19) + 0.02), flex = run * 0.21 * Math.cos(w - 5.84);
    const aC = pit - 0.42 * flex, aH = pit + 0.70 * flex;
    const M = [0, MID[1] + bob + 0.05 * Math.abs(flex) * run, MID[2]];
    const fc = ahead(aC), uc = above(aC), fh = ahead(aH), uh = above(aH);
    const Oc = v3.mad(M, fc, HALF), Oh = v3.mad(M, fh, -HALF);
    J.M = M; J.Oc = Oc; J.Oh = Oh;
    const inC = (x, y, z) => [Oc[0] + x, Oc[1] + uc[1] * y - fc[1] * z, Oc[2] + uc[2] * y - fc[2] * z];     // chest-local (x right, y up, z back) -> model
    const inH = (x, y, z) => [Oh[0] + x, Oh[1] + uh[1] * y - fh[1] * z, Oh[2] + uh[2] * y - fh[2] * z];
    F[B.chest] = m4.fromBasis([1, 0, 0], uc, v3.mul(fc, -1), Oc); F[B.hips] = m4.fromBasis([1, 0, 0], uh, v3.mul(fh, -1), Oh);
    { const am = (aC + aH) / 2; F[B.spine] = m4.fromBasis([1, 0, 0], above(am), v3.mul(ahead(am), -1), M); }
    // legs
    const legs = [['f', -1, OFF.fL, B.fUpL], ['f', 1, OFF.fR, B.fUpR], ['h', -1, OFF.hL, B.hUpL], ['h', 1, OFF.hR, B.hUpR]];
    J.feet = [];
    for (const [kind, sx, off, b0] of legs) {
      const fore = kind === 'f', p = ((g.ph - off) % 1 + 1) % 1, fp = run > 0.01 ? footPath(p, beta, Ls, fore, _fp) : (_fp.f = 0, _fp.u = 0, _fp.c = 0, _fp);
      const rest = fore ? FF : HF, top = fore ? SH : HP;
      // the joint the leg hangs from rides on the chest (the shoulder blade slides with the reach of the leg) or on the pelvis
      const Hj = fore ? inC(sx * top[0], top[1] - MID[1] + 0.0, top[2] - (MID[2] - HALF) - 0.07 * fp.f * run) : inH(sx * top[0], top[1] - MID[1], top[2] - (MID[2] + HALF));
      const T = [sx * rest[0] * (1 - 0.25 * fp.u), rest[1] + fp.u * run, rest[2] - fp.f * run];
      const k = leg(Hj, T, fore ? LF : LH, _lg), xh = [1, 0, 0];
      F[b0] = frame(Hj, v3.sub(k.k1, Hj), xh); F[b0 + 1] = frame(k.k1, v3.sub(k.k2, k.k1), xh); F[b0 + 2] = frame(k.k2, v3.sub(k.k3, k.k2), xh);
      // the hoof: flat to the snow while it bears weight, trailing when the leg is carried
      const ha = Math.atan2(TOE[1], TOE[2]) + fp.c * run * 1.05, tip = [k.k3[0], k.k3[1] + 0.119 * Math.sin(ha), k.k3[2] + 0.119 * Math.cos(ha)];
      F[b0 + 3] = frame(k.k3, v3.sub(tip, k.k3), xh);
      J[kind + (sx < 0 ? 'L' : 'R')] = [Hj, k.k1.slice(), k.k2.slice(), k.k3.slice(), tip];
      J.feet.push({ tip, down: run > 0.01 ? p < beta : true, p, fore, sx });
    }
    // neck and head: the head is carried level, the neck takes up what the chest does (reaching as the fore feet come down, rising as the hind legs drive)
    const nA = 0.91 - 0.11 * run + run * 0.08 * Math.sin(w - 1.9) - aC * 0.35, nB = nA + 0.14 - 0.02 * run;
    const NB0 = inC(0, 0.10, -0.14), NM = v3.mad(NB0, ahead(nA), 0.30), HB = v3.mad(NM, ahead(nB), 0.28);
    J.NB = NB0; J.NM = NM; J.HB = HB;
    F[B.neck1] = frame(NB0, v3.sub(NM, NB0), [1, 0, 0]); F[B.neck2] = frame(NM, v3.sub(HB, NM), [1, 0, 0]);
    const hA = -0.31 + 0.07 * run + run * 0.04 * Math.sin(w - 0.6), cy = Math.cos(g.yaw), sy = Math.sin(g.yaw), hf0 = ahead(hA), hu0 = above(hA);
    // turned about its own up axis: yaw > 0 looks to the animal's right
    const hf = [sy, hf0[1] * cy, hf0[2] * cy], hb = { X: [cy, -hf0[1] * sy, -hf0[2] * sy], Y: hu0, Z: v3.mul(hf, -1) };
    J.hb = hb; F[B.head] = m4.fromBasis(hb.X, hb.Y, hb.Z, HB);
    const inHd = (x, y, z) => [HB[0] + hb.X[0] * x + hb.Y[0] * y + hb.Z[0] * z, HB[1] + hb.X[1] * x + hb.Y[1] * y + hb.Z[1] * z, HB[2] + hb.X[2] * x + hb.Y[2] * y + hb.Z[2] * z];
    J.inHd = inHd;
    // ears: pricked when it stands, laid back along the neck when it runs
    for (const sx of [-1, 1]) {
      const eb = inHd(sx * 0.055, 0.062, -0.045), back = 0.95 * run + g.ear, out = 0.62 - 0.2 * run;
      const dl = [sx * Math.sin(out), Math.cos(out) * Math.cos(back), Math.cos(out) * Math.sin(back)];
      const dir = [hb.X[0] * dl[0] + hb.Y[0] * dl[1] + hb.Z[0] * dl[2], hb.X[1] * dl[0] + hb.Y[1] * dl[1] + hb.Z[1] * dl[2], hb.X[2] * dl[0] + hb.Y[2] * dl[1] + hb.Z[2] * dl[2]];
      J[sx < 0 ? 'earL' : 'earR'] = [eb, dir]; F[sx < 0 ? B.earL : B.earR] = frame(eb, dir, hb.X);
    }
    // tail
    { const tb = inH(0, 0.115, 0.215), ta = -0.75 + 0.55 * run + run * 0.2 * Math.sin(2 * w), td = [0, uh[1] * Math.sin(ta) - fh[1] * Math.cos(ta), uh[2] * Math.sin(ta) - fh[2] * Math.cos(ta)];
      J.tail = [tb, v3.mad(tb, td, 0.15)]; F[B.tail] = frame(tb, td, [1, 0, 0]); }
    J.aC = aC; J.aH = aH;
    return { J, F, inC, inH };
  }
  D.solve = solve; D.B = B;

  // ---- the body as a distance field, built on the standing pose
  function buildBody(bd) {
    // (the same shapes as the mesher's own, on a plain square root: Math.hypot is several times slower, and this field is asked half a million times at load)
    const sd = { smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; },
      sphere(x, y, z, cx, cy, cz, r) { x -= cx; y -= cy; z -= cz; return Math.sqrt(x * x + y * y + z * z) - r; },
      ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) { const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / rx, qy = py / ry, qz = pz / rz, k1 = Math.sqrt(qx * qx + qy * qy + qz * qz); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); },
      capsule(x, y, z, ax, ay, az, bx, by, bz, ra, rb) { const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az, h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz))), dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h; return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h); } };
    const J = bd.J, c = sd.capsule, cap = (x, y, z, a, b, ra, rb) => c(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb);
    const hb = J.hb, HB = J.HB;
    const loc = (x, y, z, o, X, Y, Z) => { const dx = x - o[0], dy = y - o[1], dz = z - o[2]; return [dx * X[0] + dy * X[1] + dz * X[2], dx * Y[0] + dy * Y[1] + dz * Y[2], dx * Z[0] + dy * Z[1] + dz * Z[2]]; };
    const earF = [J.earL, J.earR].map(([o, d]) => { const m = frame(o, d, hb.X); return { o, X: [m[0], m[1], m[2]], Y: [m[4], m[5], m[6]], Z: [m[8], m[9], m[10]] }; });
    const fore = [J.fL, J.fR], hind = [J.hL, J.hR];
    function f(x, y, z) {
      const ax = Math.abs(x);
      // trunk: a deep chest, the flank drawn up behind it, a round rump; the line of the back with the withers standing out of it
      let d = sd.ellipsoid(x, y, z, 0, 0.985, -0.33, 0.170, 0.262, 0.35);
      d = sd.smin(d, c(x, y, z, 0, 1.035, -0.18, 0, 1.075, 0.34, 0.200, 0.168), 0.10);
      d = sd.smin(d, sd.ellipsoid(x, y, z, 0, 1.075, 0.46, 0.168, 0.205, 0.235), 0.10);
      d = sd.smin(d, c(x, y, z, 0, 1.205, -0.40, 0, 1.215, 0.42, 0.070, 0.062), 0.10);
      d = sd.smin(d, sd.ellipsoid(ax, y, z, 0.112, 0.975, -0.41, 0.078, 0.205, 0.135), 0.07);      // shoulder
      d = sd.smin(d, sd.ellipsoid(ax, y, z, 0.104, 0.945, 0.44, 0.098, 0.225, 0.178), 0.07);       // haunch
      // neck, with the winter mane hanging under it
      d = sd.smin(d, cap(x, y, z, J.NB, J.NM, 0.150, 0.100), 0.10);
      d = sd.smin(d, cap(x, y, z, J.NM, J.HB, 0.100, 0.080), 0.05);
      d = sd.smin(d, c(x, y, z, 0, 0.99, -0.60, 0, 1.30, -0.795, 0.105, 0.062), 0.09);
      // head
      const q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z), aq = Math.abs(q[0]);
      let h = sd.ellipsoid(q[0], q[1], q[2], 0, 0.022, -0.105, 0.078, 0.088, 0.120);
      h = sd.smin(h, c(q[0], q[1], q[2], 0, 0.010, -0.17, 0, -0.030, -0.375, 0.063, 0.041), 0.045);
      h = sd.smin(h, sd.ellipsoid(q[0], q[1], q[2], 0, -0.058, -0.17, 0.048, 0.044, 0.125), 0.03);
      h = sd.smin(h, sd.ellipsoid(aq, q[1], q[2], 0.060, 0.048, -0.140, 0.024, 0.026, 0.030), 0.014);
      d = sd.smin(d, h, 0.04);
      for (const e of earF) { const p = loc(x, y, z, e.o, e.X, e.Y, e.Z); d = sd.smin(d, sd.ellipsoid(p[0], p[1], p[2], 0, 0.088, 0, 0.044, 0.100, 0.021), 0.014); }
      d = sd.smin(d, cap(x, y, z, J.tail[0], J.tail[1], 0.046, 0.028), 0.035);
      // legs
      let lg = 1e9;
      for (const L of fore) {
        let a = cap(x, y, z, L[0], L[1], 0.080, 0.060); a = sd.smin(a, cap(x, y, z, L[1], L[2], 0.053, 0.0305), 0.03);
        a = sd.smin(a, sd.sphere(x, y, z, L[2][0], L[2][1], L[2][2], 0.036), 0.02); a = sd.smin(a, cap(x, y, z, L[2], L[3], 0.0275, 0.0250), 0.015);
        a = sd.smin(a, sd.sphere(x, y, z, L[3][0], L[3][1], L[3][2], 0.031), 0.015); a = sd.smin(a, cap(x, y, z, L[3], v3.lerp(L[3], L[4], 0.72), 0.028, 0.034), 0.012);
        lg = Math.min(lg, a);
      }
      for (const L of hind) {
        let a = cap(x, y, z, L[0], L[1], 0.108, 0.080); a = sd.smin(a, cap(x, y, z, L[1], L[2], 0.072, 0.0335), 0.035);
        a = sd.smin(a, sd.sphere(x, y, z, L[2][0], L[2][1] + 0.01, L[2][2] + 0.008, 0.038), 0.02); a = sd.smin(a, cap(x, y, z, L[2], L[3], 0.0295, 0.0250), 0.015);
        a = sd.smin(a, sd.sphere(x, y, z, L[3][0], L[3][1], L[3][2], 0.031), 0.015); a = sd.smin(a, cap(x, y, z, L[3], v3.lerp(L[3], L[4], 0.72), 0.028, 0.034), 0.012);
        lg = Math.min(lg, a);
      }
      lg = Math.max(lg, -(y - 0.004));                                  // hooves cut off flat
      return sd.smin(d, lg, 0.05);
    }
    function attr(x, y, z, nx, ny, nz, out) {
      const ao = sat(0.3 + 0.7 * (0.55 * sat(f(x + nx * 0.06, y + ny * 0.06, z + nz * 0.06) / 0.06) + 0.45 * sat(f(x + nx * 0.2, y + ny * 0.2, z + nz * 0.2) / 0.2)));
      out[0] = 0; out[1] = ao; out[2] = 0; out[3] = 0;
    }
    return { f, attr };
  }
  // skinning: soft blend between the two nearest bones (a leg only ever listens to its own side)
  function boneWeights(mesh, bd) {
    const J = bd.J, n = mesh.nv, out = new Float32Array(n * 4), c = sd.capsule, segs = [];
    const seg = (i, a, b, r, side = 0) => segs.push({ i, a, b, r, side });
    seg(B.hips, [0, 1.07, 0.30], [0, 1.08, 0.60], 0.20); seg(B.spine, [0, 1.05, -0.14], [0, 1.06, 0.20], 0.21); seg(B.chest, [0, 1.0, -0.50], [0, 1.02, -0.24], 0.23);
    seg(B.chest, [0, 0.99, -0.60], [0, 1.12, -0.66], 0.10);
    seg(B.neck1, J.NB, J.NM, 0.125); seg(B.neck2, J.NM, J.HB, 0.09); seg(B.head, J.HB, J.inHd(0, -0.02, -0.38), 0.075);
    seg(B.tail, J.tail[0], J.tail[1], 0.04);
    for (const [L, b0, sx, fore] of [[J.fL, B.fUpL, -1, 1], [J.fR, B.fUpR, 1, 1], [J.hL, B.hUpL, -1, 0], [J.hR, B.hUpR, 1, 0]]) {
      seg(b0, L[0], L[1], fore ? 0.075 : 0.10, sx); seg(b0 + 1, L[1], L[2], 0.045, sx); seg(b0 + 2, L[2], L[3], 0.028, sx); seg(b0 + 3, L[3], L[4], 0.03, sx);
    }
    const eL = J.earL, eR = J.earR;
    for (let v = 0; v < n; v++) {
      const x = mesh.verts[v * 10], y = mesh.verts[v * 10 + 1], z = mesh.verts[v * 10 + 2];
      let b0 = -1, b1 = -1, d0 = 1e9, d1 = 1e9, w = 1;
      // ears first: anything out along an ear belongs to it
      const ear = (e) => { const dx = x - e[0][0], dy = y - e[0][1], dz = z - e[0][2], t = dx * e[1][0] + dy * e[1][1] + dz * e[1][2]; return t > 0.012 && Math.hypot(dx - e[1][0] * t, dy - e[1][1] * t, dz - e[1][2] * t) < 0.06 && t < 0.24 ? t : -1; };
      const tL = x < 0 ? ear(eL) : -1, tR = x > 0 ? ear(eR) : -1;
      if (tL > 0 || tR > 0) { b0 = tL > 0 ? B.earL : B.earR; b1 = B.head; w = smooth(0.012, 0.05, Math.max(tL, tR)); }
      else {
        for (const s of segs) {
          if (s.side && s.side * x < -0.004) continue;
          const d = c(x, y, z, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.r, s.r);
          if (s.i === b0) { if (d < d0) d0 = d; continue; } if (s.i === b1) { if (d < d1) { d1 = d; if (d1 < d0) { const t = d0; d0 = d1; d1 = t; const tb = b0; b0 = b1; b1 = tb; } } continue; }
          if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = s.i; } else if (d < d1) { d1 = d; b1 = s.i; }
        }
        if (b1 < 0) { b1 = b0; d1 = d0; }
        w = 1 / (1 + Math.exp(-(d1 - d0) / 0.034));
      }
      out[v * 4] = b0; out[v * 4 + 1] = b1; out[v * 4 + 2] = w;
    }
    return out;
  }
  // ---- antlers: tubes swept along curves (too thin for the grid), drawn in the head's own frame (x right, y up, z back)
  function antlers() {
    const mb = meshBuilder(), K = 0.84;
    const cr = (P, n) => { const o = []; for (let i = 0; i < P.length - 1; i++) { const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, P.length - 1)];
      for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; o.push([0, 1, 2].map(j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3))); } } o.push(P[P.length - 1]); return o; };
    const tube = (P, r0, r1, n = 5, sides = 6) => {
      const pts = cr(P, n), rings = []; let pn = null;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], t = v3.norm(v3.sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
        let nn = pn ? v3.sub(pn, v3.mul(t, v3.dot(pn, t))) : v3.cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]); nn = v3.norm(nn); pn = nn;
        const bb = v3.cross(t, nn), r = lerp(r0, r1, Math.pow(i / (pts.length - 1), 1.25)), ring = [];
        for (let k = 0; k < sides; k++) { const a = k / sides * TAU, ca = Math.cos(a), sa = Math.sin(a), d = [nn[0] * ca + bb[0] * sa, nn[1] * ca + bb[1] * sa, nn[2] * ca + bb[2] * sa]; ring.push([[p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r], d]); }
        rings.push(ring);
      }
      const t0 = v3.norm(v3.sub(pts[1], pts[0])), t1 = v3.norm(v3.sub(pts[pts.length - 1], pts[pts.length - 2]));
      mb.sweep(rings, [2, 1, 0, 0], v3.mul(t0, -1), t1);
    };
    for (const sx of [-1, 1]) {
      const P = a => a.map(p => [sx * p[0] * K, p[1] * K + 0.02, p[2] * K]);
      tube(P([[0.050, 0.09, -0.075], [0.105, 0.24, 0.02], [0.205, 0.44, 0.12], [0.295, 0.66, 0.145], [0.315, 0.86, 0.07], [0.265, 1.01, -0.06]]), 0.029, 0.011, 6);     // beam
      tube(P([[0.060, 0.135, -0.05], [0.082, 0.20, -0.20], [0.105, 0.32, -0.285]]), 0.020, 0.008, 5);        // brow tine
      tube(P([[0.205, 0.44, 0.12], [0.255, 0.50, -0.04], [0.290, 0.62, -0.145]]), 0.019, 0.008, 5);          // tray
      tube(P([[0.295, 0.66, 0.145], [0.365, 0.75, 0.225], [0.385, 0.86, 0.25]]), 0.017, 0.008, 4);            // a back tine
      tube(P([[0.315, 0.86, 0.07], [0.385, 0.965, 0.14], [0.405, 1.09, 0.155]]), 0.017, 0.008, 4);            // crown
    }
    return Skier.fixMesh(mb.done());
  }

  D.build = function () {
    bind = solve(G0); invBind = bind.F.map(m => m4.invert(m)); D.bind = bind;
    const body = buildBody(bind), t0 = performance.now();
    const m = meshSDF(body.f, [-0.36, -0.01, -1.42], [0.36, 1.98, 0.82], 0.0135, { stride: 2, attr: body.attr });        // (a finer first pass finds the same surface with fewer questions)
    D.meshMs = performance.now() - t0;
    const bw = boneWeights(m, bind), an = antlers(), Fh = bind.F[B.head];
    const nv = m.nv + an.nv, ni = m.ni + an.ni, V = new Float32Array(nv * 10), W = new Float32Array(nv * 4), I = new Uint32Array(ni);
    V.set(m.verts.subarray(0, m.nv * 10)); W.set(bw); I.set(m.idx.subarray(0, m.ni));
    for (let i = 0; i < an.nv; i++) {
      const p = m4.tp(Fh, [an.verts[i * 10], an.verts[i * 10 + 1], an.verts[i * 10 + 2]]), n = m4.td(Fh, [an.verts[i * 10 + 3], an.verts[i * 10 + 4], an.verts[i * 10 + 5]]), o = (m.nv + i) * 10;
      V[o] = p[0]; V[o + 1] = p[1]; V[o + 2] = p[2]; V[o + 3] = n[0]; V[o + 4] = n[1]; V[o + 5] = n[2]; V[o + 6] = 2; V[o + 7] = 1; V[o + 8] = an.verts[i * 10 + 1];
      W[(m.nv + i) * 4] = B.head; W[(m.nv + i) * 4 + 1] = B.head; W[(m.nv + i) * 4 + 2] = 1;
    }
    for (let i = 0; i < an.ni; i++) I[m.ni + i] = an.idx[i] + m.nv;
    D.mesh = { V, W, I, nv, ni };
    return D.mesh;
  };

  D.init = function (g) {
    gfx = g;
    const m = D.mesh || D.build();
    vb = gfx.buffer(m.V, 'vertex'); vb2 = gfx.buffer(m.W, 'vertex'); ib = gfx.buffer(m.I, 'index'); count = m.ni;
    boneTex = gfx.texture({ w: 4, h: ROWS, format: 'rgba32f', filter: 'nearest' });
    const buffers = [{ attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['mat', 'vec4f']] }, { attrs: [['bw', 'vec4f']] }];
    const J = bind.J, v3s = a => 'vec3f(' + a.map(v => v.toFixed(5)).join(', ') + ')';
    const HEAD = `let hq: vec3f = vec3f(dot(bp - ${v3s(J.HB)}, ${v3s(J.hb.X)}), dot(bp - ${v3s(J.HB)}, ${v3s(J.hb.Y)}), dot(bp - ${v3s(J.HB)}, ${v3s(J.hb.Z)}));`;
    // p = (first row of this animal's bones, antlers 0/1, snow on its back, -)
    const VS = shadow => `fn vert(a: VIn) -> VOut { var v: VOut;
      var pos: vec3f = a.pos;
      if (a.mat.x > 1.5 && M.p.y < 0.5) { pos = ${v3s(J.inHd(0, 0.06, -0.06))}; }             // a hind carries no antlers: they are folded away into the skull
      let s: SkinV = skinVertex(pos, a.nrm, vec4f(a.bw.x + M.p.x, a.bw.y + M.p.x, a.bw.z, 0.0));
      ${shadow ? 'v.clip = U.shadowVP * vec4f(s.wp, 1.0);' : 'v.wp = s.wp; v.nrm = s.n; v.bp = a.pos; v.bn = a.nrm; v.mat = a.mat; v.clip = U.viewProj * vec4f(s.wp, 1.0);'}
      return v; }`;
    pipe = gfx.pipeline({
      name: 'deer', lib: [SL.common, SL.hash, SL.fog, SL.shadow, SKIN_SSL], buffers,
      varyings: { wp: 'vec3f', nrm: 'vec3f', bp: 'vec3f', bn: 'vec3f', mat: 'vec4f' }, uniforms: { p: 'vec4f' },
      textures: { tBones: 'fetch', tDetail: '2d', tShadow: 'shadow', tSky: '2d' },
      vs: VS(false), fs: DEER_FS.replace('/*HEAD*/', HEAD),
    });
    pipeShadow = gfx.pipeline({
      name: 'deerShadow', lib: [SL.common, SKIN_SSL], buffers, varyings: {}, uniforms: { p: 'vec4f' }, textures: { tBones: 'fetch' }, colorFormat: null, cull: 'none', depthBias: 2, depthBiasSlope: 2.0,
      vs: VS(true), fs: null,
    });
    D.pipes = [pipe, pipeShadow]; D.ready = true;
    // the other animals of the mountain (08c) are made here too and come and go through the deer's own doors: nothing else needs to know of them
    D.fauna = typeof Fauna !== 'undefined' ? Fauna : null; if (D.fauna) { Fauna.init(g); D.pipes = D.pipes.concat(Fauna.pipes); }
  };

  // ---- the animals themselves. They come out of the trees ahead and run down the mountain a few metres off to one side, a little slower
  // than the skier; when the skier draws level they run flat out beside for a few seconds, looking across, then break away into the forest
  const pc = {}, tn = {}, rnd = RNG(90210);
  const open = s => { const c = Course.at(s, pc); return c.hw > 13 && (c.glade || 0) < 0.25 && (c.gul || 0) < 0.3 && (c.ridge || 0) < 0.5; };
  D.vMax = 17;   // (a deer bounds at 13-17 m/s at most, never as fast as a racing skier)
  D.spawn = function (opt = {}) {
    const S = Game.s, s0 = -S.p[2], c = Course.at(s0, pc), u = S.p[0] - c.cx, vs = Math.max(-S.v[2], 4);
    const side = opt.side || (Math.abs(u) > 2 ? -sign(u) : (rnd() < 0.5 ? -1 : 1));          // the side with more room
    const v = clamp(vs - 4.2, 9.5, D.vMax), rel = v - vs, ds = opt.ds != null ? opt.ds : clamp(-rel * 8.5, 30, 72), n = opt.n || (rnd() < 0.55 ? 2 : 1);
    D.herd.length = 0; D.side = side; D.pk = u * side; D.stage = 0; D.tSide = 0; D.sideFor = 4.4 + 2.0 * rnd(); D.crowd = 0;
    // the stag, and sometimes a hind running a few strides ahead of him and further out
    for (let i = 0; i < n; i++) {
      D.herd.push({ i, row: i * 32, antlers: i ? 0 : 1, scale: i ? 1.0 : 1.2, side, s: s0 + ds + i * D.lead, v, vf: v, ph: rnd(), t: 0, gapT: 6.4 + i * 0.9,
        off: side * (Course.at(s0 + ds, pc).hw + 4), yaw: 0, look: 0, lean: 0, pos: [0, 0, 0], fwd: [0, 0, -1], nrm: [0, 1, 0], init: false, gone: false, freq: 2, dodge: 0, snow: 0.5 + 0.5 * rnd() });
    }
    D.count++; D.t0 = App.t;
    return D.herd;
  };
  D.lead = 6.0;
  function place(a, origin) {
    const g = { ph: a.ph, run: a.run != null ? a.run : 1, speed: a.v, freq: a.freq, yaw: a.look, lean: a.lean, ear: 0 }, s = solve(g);
    const Y = v3.norm(a.nrm), Z0 = v3.mul(a.fwd, -1), X = v3.norm(v3.cross(Y, Z0)), Z = v3.cross(X, Y), k = a.scale;
    // leaning into its turns, about the line of travel
    const cl = Math.cos(a.lean), sl = Math.sin(a.lean), Xr = [X[0] * cl + Y[0] * sl, X[1] * cl + Y[1] * sl, X[2] * cl + Y[2] * sl], Yr = [Y[0] * cl - X[0] * sl, Y[1] * cl - X[1] * sl, Y[2] * cl - X[2] * sl];
    const R = m4.fromBasis(v3.mul(Xr, k), v3.mul(Yr, k), v3.mul(Z, k), [a.pos[0] - origin[0], a.pos[1] - origin[1] - 0.045 * k, a.pos[2] - origin[2]]);
    for (let i = 0; i < D.NB; i++) boneData.set(m4.mul(R, m4.mul(s.F[i], invBind[i])), (a.row + i) * 16);
    a.R = R; a.J = s.J; return s;
  }
  D.room = s => open(s) && open(s + 60) && open(s + 140);
  D.leave = function () { if (D.herd.length && D.stage < 2) { D.stage = 2; D.tGo = 0; } };
  D.update = function (dt, t) {
    Post.riders[0][3] = 0; Post.riders[1][3] = 0; D.pull = 0;
    if (!D.ready) return;
    herd(dt, t);
    if (D.fauna) Fauna.update(dt, t);          // the other kinds, and who decides which kind comes past next (the deer take their turn with the rest)
  };
  function herd(dt, t) {
    const S = Game.s, sS = -S.p[2];
    if (!D.herd.length) {
      if (!D.fauna && D.enabled && Game.mode === 'run' && Game.runT > D.next && S.speed > 6 && D.room(sS)) { D.spawn(); D.next = Game.runT + lerp(D.gap[0], D.gap[1], rnd()); }
      return;
    }
    if (!D.enabled) D.leave();                 // switched off while they are here: they go
    const cS = Course.at(sS, pc), uS = S.p[0] - cS.cx, vs = Math.max(-S.v[2], 4), lead = D.herd[0]; let alive = false;
    // how far toward their side the skier has lately come: taken up at once when the skier swings in, let go as the skier swings away
    // (an animal keeps its distance from what comes at it, and is slower to follow what goes away)
    D.pk = Math.max(uS * D.side, D.pk - (D.stage === 1 ? 6.0 : 3.0) * dt);
    // the three parts of the meeting, told by where the stag is: coming up on them, level, and their going
    { const ds = lead.s - sS;
      if (D.stage === 0 && (ds < 11 || lead.t > 14)) D.stage = 1;
      if (D.stage === 1) { D.tSide += dt; if (D.tSide > D.sideFor || ds < -7 || ds > 30 || D.crowd > 0.5) { D.stage = 2; D.tGo = 0; } }
      else if (D.stage === 2) D.tGo += dt;
      // the lens leans a little their way while they are close
      D.pull = D.side * 0.15 * (D.stage === 0 ? smooth(24, 11, ds) : D.stage === 1 ? 1 : smooth(4.5, 2.5, D.tGo)) * smooth(-8, -3, ds); }
    for (const a of D.herd) {
      if (a.frozen) { place(a, Render.origin); alive = true; continue; }
      a.t += dt;
      const c = Course.at(a.s, pc), ds = a.s - sS, leaving = D.stage === 2;
      // pace: the skier gains on them; level, they match the skier as long as a deer can, drifting back from a little ahead to alongside; then they bolt
      // (pace here is progress down the hill: a skier who is carving covers less of it than the speed says)
      let vT = D.stage === 0 ? vs - 4.2 : D.stage === 1 ? vs + clamp((lerp(9.0, 2.5, sat(D.tSide / D.sideFor)) - ds) * 0.6, -2.5, 1.5) : vs + 5;
      if (a.i) vT = lead.vf + 0.9 * (lead.s + D.lead - a.s);
      const cap = D.vMax + (leaving ? 4 : 0);
      a.vf = damp(a.vf, clamp(vT, 9, cap), leaving ? 2.4 : 1.6, dt);
      // where across the slope: a few strides outside the skier's reach, as far as the edge of the trees allows. Crowded against them, they go
      const want = D.pk + a.gapT, room = c.hw + 1.5 + a.i * 0.8;
      if (!a.i && !leaving) D.crowd = want > room + 0.5 ? D.crowd + dt : Math.max(0, D.crowd - dt);
      const offT = a.side * Math.min(want, room);
      const tv = a.init && !leaving && a.offT != null && dt > 0 ? (offT - a.offT) / dt : 0; a.offT = offT; a.tV = damp(a.tV || 0, clamp(tv, -12, 12), 8, dt);
      // (it cannot cross the slope faster than it can run: what goes sideways comes off its progress down the hill.)
      // Going, they sprint ahead a moment and then swing away into the trees
      const lat = !a.init ? 0 : leaving ? a.side * 0.5 * a.v * smooth(0.6, 1.7, D.tGo + 0.25 * a.i)
        : clamp((offT - a.off) * lerp(0.7, 1.4, sat(a.t / 4)) + a.tV, -0.56 * a.vf, 0.56 * a.vf);
      a.latV = damp(a.latV || 0, lat, leaving ? 3.5 : 6, dt); if (a.init) a.off += a.latV * dt; else a.off = a.side * (c.hw + 4);
      const vfe = Math.min(a.vf, Math.sqrt(Math.max(cap * cap - a.latV * a.latV, 1))); a.v = Math.hypot(vfe, a.latV);
      // and whatever else happens, never within a few strides
      { const gap = (a.off - uS) * a.side; if (Math.abs(ds) < 14 && gap < 5.2) a.off += a.side * Math.min(5.2 - gap, 7 * dt); a.gap = (a.off - uS) * a.side; }
      // round the trunks, not through them
      let x = c.cx + a.off + a.dodge; const z = -a.s;
      Course.nearTree(x, z, tn);
      const push = tn.ok && tn.d < 2.6 ? (x >= tn.x ? 1 : -1) * (2.6 - tn.d) * 1.3 : 0; a.dodge = damp(a.dodge, push, push ? 7 : 1.5, dt); x = c.cx + a.off + a.dodge;
      const y = Course.height(x, z, 0.5), px = a.pos[0], pz = a.pos[2];
      a.pos[0] = x; a.pos[1] = a.init ? damp(a.pos[1], y, 30, dt) : y; a.pos[2] = z;
      if (!a.init) { a.yaw = 0; a.init = true; }
      else if (dt > 0) {
        const vx = (x - px) / dt, vz = (z - pz) / dt, sp = Math.hypot(vx, vz) || 1, tx = vx / sp, tz = vz / sp;
        const yawT = Math.atan2(tx, -tz), dy = Math.atan2(Math.sin(yawT - a.yaw), Math.cos(yawT - a.yaw));
        a.lean = damp(a.lean, clamp(-dy * 2.2, -0.3, 0.3), 5, dt); a.yaw += dy * (1 - Math.exp(-9 * dt));
      }
      const n = Course.normal(x, z, 1.1), fx = Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      // the body follows the fall of the ground along its path, and half of the tilt across it
      a.nrm = v3.norm([n[0] * 0.5, n[1], n[2] * 0.85]);
      const f0 = [fx, 0, fz], fl = v3.norm(v3.sub(f0, v3.mul(a.nrm, v3.dot(f0, a.nrm)))); a.fwd = fl;
      a.freq = lerp(1.75, 2.6, sat((a.v - 9) / 19));
      const ph0 = a.ph; a.ph = (a.ph + a.freq * dt) % 1; a.s += vfe * dt;
      // a look across at whoever is coming down beside it
      const lookT = !leaving && Math.abs(ds) < 24 ? clamp(Math.atan2((S.p[0] - x) * Math.cos(a.yaw) + (S.p[2] - z) * Math.sin(a.yaw), 5 + Math.abs(ds)) * 1.6, -0.85, 0.85) * smooth(24, 9, Math.abs(ds)) : 0;
      a.look = damp(a.look, lookT, 2.5, dt);
      place(a, Render.origin);
      // hooves: a kick of snow where each pair lands and drives, and the sound of it if it is close enough to hear
      const cross = p => (ph0 < p && a.ph >= p) || (ph0 > a.ph && (p > ph0 || p <= a.ph));
      for (const [p, fore] of [[0.03, 0], [0.55, 1]]) if (cross(p)) {
        const wp = m4.tp(a.R, [0, 0.02, fore ? -0.40 : 0.36]), w0 = [wp[0] + Render.origin[0], wp[1] + Render.origin[1], wp[2] + Render.origin[2]], vel = [fl[0] * a.v * (fore ? 0.5 : -0.25), 0.6, fl[2] * a.v * (fore ? 0.5 : -0.25)];
        const dist = Math.hypot(w0[0] - S.p[0], w0[2] - S.p[2]);
        if (dist < 90) Spray.kick(t, w0, vel, (fore ? 0.8 : 1.1) * a.scale * (0.7 + 0.8 * (c.powder || 0.3)));
        if (dist < 34) Sound.event({ type: 'hoof', d: dist, side: sign((w0[0] - S.p[0]) * S.r[0] + (w0[2] - S.p[2]) * S.r[2]) || 1, k: fore ? 0.75 : 1 });
      }
      // gone when it is far behind, or deep among the trees and far enough off not to be missed
      const e = Math.abs(a.off) - c.hw; a.gone = ds < -36 || ds > 170 || (leaving && e > 16 && (ds < -5 || e > 26));
      if (!a.gone) { alive = true; const r = Post.riders[a.i]; r[0] = a.pos[0] - Render.origin[0]; r[1] = a.pos[1] - Render.origin[1] + 1.0 * a.scale; r[2] = a.pos[2] - Render.origin[2]; r[3] = a.scale; }
    }
    if (!alive) D.herd.length = 0; else gfx.updateTexture(boneTex, 0, 0, 4, ROWS, boneData);
  }
  D.draw = function (shadowTex, skyTex) {
    if (!D.ready) return;
    if (D.fauna) Fauna.draw(shadowTex, skyTex);
    for (const a of D.herd) if (!a.gone && a.R) gfx.draw(pipe, { u: { p: [a.row, a.antlers, a.snow, 0] }, tex: { tBones: boneTex, tDetail: Tex.detail, tShadow: shadowTex, tSky: skyTex }, vb: [vb, vb2], ib, count });
  };
  D.drawShadow = function () {
    if (!D.ready) return;
    if (D.fauna) Fauna.drawShadow();
    for (const a of D.herd) if (!a.gone && a.R) gfx.draw(pipeShadow, { u: { p: [a.row, a.antlers, 0, 0] }, tex: { tBones: boneTex }, vb: [vb, vb2], ib, count });
  };
  // tests: stand one somewhere, in a given moment of its stride
  D.pose = function (i, o) {
    while (D.herd.length <= i) D.herd.push({ i: D.herd.length, row: D.herd.length * 32, antlers: D.herd.length ? 0 : 1, scale: D.herd.length ? 0.87 : 1, side: 1, s: 0, v: 14, vf: 14, ph: 0, t: 0, off: 0, yaw: 0, look: 0, lean: 0, pos: [0, 0, 0], fwd: [0, 0, -1], nrm: [0, 1, 0], init: true, freq: 2, dodge: 0, snow: 0.7, frozen: true });
    const a = D.herd[i]; Object.assign(a, o); a.frozen = true;
    const yaw = o.yaw || 0, n = Course.normal(a.pos[0], a.pos[2], 1.1); a.nrm = o.flat ? [0, 1, 0] : v3.norm([n[0] * 0.5, n[1], n[2] * 0.85]);
    const f0 = [Math.sin(yaw), 0, -Math.cos(yaw)]; a.fwd = v3.norm(v3.sub(f0, v3.mul(a.nrm, v3.dot(f0, a.nrm))));
    if (o.ground !== false) a.pos[1] = Course.height(a.pos[0], a.pos[2], 0.5);
    place(a, Render.origin); gfx.updateTexture(boneTex, 0, 0, 4, ROWS, boneData);
    return a;
  };
  return D;
})();

const DEER_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  var N: vec3f = normalize(v.nrm);
  let V: vec3f = normalize(U.camPos.xyz - v.wp);
  let L: vec3f = U.sunDir.xyz;
  let bp: vec3f = v.bp; let bn: vec3f = normalize(v.bn); let ax: f32 = abs(bp.x);
  /*HEAD*/
  // hair lies along the body: streaks drawn out from nose to tail
  let hair: vec4f = tex(tDetail, vec2f(bp.z * 1.2 + bp.y * 0.4, bp.y * 6.5 + bp.x * 5.0));
  let fine: vec4f = tex(tDetail, bp.zy * 12.0 + bp.xx * vec2f(7.0, 5.0));
  var alb: vec3f = vec3f(0.5); var sheen: f32 = 0.9; var specS: f32 = 0.025; var specP: f32 = 16.0; var gloss: f32 = 0.0; var fur: f32 = 1.0;
  if (v.mat.x > 1.5) {
    // antler: dark and grooved at the burr, worn pale toward the points
    let tip: f32 = smoothstep(0.10, 0.80, v.mat.z);
    alb = mix(vec3f(0.085, 0.056, 0.034), vec3f(0.50, 0.44, 0.34), tip * tip) * (0.75 + 0.5 * hair.z);
    sheen = 0.12; specS = 0.16; specP = 34.0; fur = 0.0;
  } else {
    // winter coat: grey-brown, darker along the spine and on the neck, pale underneath, a cream patch round the tail
    var coat: vec3f = vec3f(0.118, 0.080, 0.052);
    coat = mix(coat, vec3f(0.058, 0.040, 0.028), 0.65 * smoothstep(0.13, 0.02, ax) * smoothstep(0.55, 0.95, bn.y) * step(-0.75, bp.z));
    let neck: f32 = smoothstep(-0.50, -0.64, bp.z) * smoothstep(-0.06, 0.02, hq.z + 0.02);
    coat = mix(coat, vec3f(0.070, 0.048, 0.033), 0.75 * neck);
    let under: f32 = smoothstep(-0.15, -0.70, bn.y) * smoothstep(0.50, 0.74, bp.y) * smoothstep(-0.62, -0.50, bp.z);
    coat = mix(coat, vec3f(0.30, 0.255, 0.20), 0.8 * under);
    let rump: f32 = smoothstep(0.585, 0.665, bp.z - 0.55 * abs(bp.y - 1.02) - 0.25 * ax) * smoothstep(0.80, 0.90, bp.y);
    coat = mix(coat, vec3f(0.44, 0.375, 0.27), rump);
    coat = mix(coat, vec3f(0.050, 0.035, 0.025), smoothstep(0.045, 0.02, ax) * smoothstep(0.66, 0.70, bp.z) * smoothstep(1.02, 1.08, bp.y));      // the tail, dark down its back
    // legs: dark shanks, paler down the inside
    let legK: f32 = smoothstep(0.66, 0.50, bp.y);
    coat = mix(coat, vec3f(0.055, 0.039, 0.028), 0.7 * legK);
    coat = mix(coat, vec3f(0.24, 0.205, 0.16), 0.5 * legK * smoothstep(0.02, -0.5, bn.x * sign(bp.x)));
    // face: darker bridge, pale ring behind a black nose, pale chin and throat, the insides of the ears
    let face: f32 = smoothstep(0.02, -0.03, hq.z + 0.02) * smoothstep(1.45, 1.52, bp.y);
    coat = mix(coat, vec3f(0.095, 0.066, 0.045), face * 0.6);
    coat = mix(coat, vec3f(0.34, 0.295, 0.23), face * smoothstep(0.035, 0.0, abs(hq.z + 0.325)) * 0.85);
    coat = mix(coat, vec3f(0.36, 0.31, 0.245), face * smoothstep(-0.02, -0.07, hq.y) * smoothstep(-0.03, -0.12, hq.z) * 0.8);
    let earIn: f32 = smoothstep(0.10, 0.13, hq.y) * smoothstep(0.03, -0.01, dot(bn, vec3f(0.0, 0.3, 1.0)));
    alb = coat * (0.84 + 0.32 * hair.z) * (0.92 + 0.16 * fine.x);
    alb = mix(alb, vec3f(0.28, 0.23, 0.19), 0.5 * earIn * step(1.6, bp.y));
    // nose, eyes, hooves
    let nose: f32 = face * smoothstep(-0.365, -0.385, hq.z) * smoothstep(-0.075, -0.045, hq.y);
    alb = mix(alb, vec3f(0.012, 0.011, 0.012), nose); gloss = 0.5 * nose; fur = 1.0 - nose;
    let eye: f32 = smoothstep(0.021, 0.015, length(vec3f(abs(hq.x), hq.y, hq.z) - vec3f(0.071, 0.050, -0.142)));
    alb = mix(alb, vec3f(0.010, 0.008, 0.007), eye); gloss = max(gloss, 0.9 * eye); fur *= 1.0 - eye;
    let hoof: f32 = smoothstep(0.082, 0.070, bp.y);
    alb = mix(alb, vec3f(0.022, 0.019, 0.018), hoof); specS = mix(specS, 0.35, hoof); specP = mix(specP, 50.0, hoof); fur *= 1.0 - hoof;
    sheen = mix(0.25, 0.95, fur);
    // snow: sifted along the back and into the mane, caked on the shanks
    let dust: f32 = smoothstep(0.50, 0.92, bn.y) * smoothstep(0.50, 0.80, fine.w * 0.55 + hair.x * 0.5 + 0.12 * M.p.z) * fur * M.p.z;
    let cake: f32 = smoothstep(0.38, 0.13, bp.y) * smoothstep(0.38, 0.66, fine.z) * (1.0 - hoof);
    alb = mix(alb, vec3f(0.80, 0.84, 0.90), max(dust * 0.42, cake * 0.7));
  }
  // the lie of the hair roughens the surface
  N = normalize(N + (vec3f(hair.x, hair.y, hair.z) - 0.5) * 0.30 * fur);
  let ndl: f32 = dot(N, L); let ndv: f32 = saturate(dot(N, V));
  let sh: f32 = shadowAt(v.wp + N * 0.04, 0.0016);
  let ao: f32 = v.mat.y;
  let wrapD: f32 = saturate((ndl + 0.3 * fur) / (1.0 + 0.3 * fur));
  let amb: vec3f = U.ambSky.rgb * (0.5 + 0.5 * N.y) + U.ambGnd.rgb * (0.5 - 0.5 * N.y) * 1.25 + twiLight(N);
  var col: vec3f = alb * (U.sunCol.rgb * wrapD * sh + amb * ao);
  // against the light the coat is edged with fire: every hair that stands clear of the body carries the sun through it
  let fr: f32 = pow(1.0 - ndv, 3.0);
  let back: f32 = saturate(dot(-V, L) * 0.5 + 0.5);
  col += (alb * 0.8 + 0.035) * U.sunCol.rgb * sheen * fr * (0.2 + 1.5 * back * back) * sh * saturate(ndl * 2.0 + 0.9);
  let rim: f32 = pow(1.0 - ndv, 2.6) * back * back * saturate(ndl * 1.2 + 1.0) * sh;
  col += (alb * 0.8 + 0.085) * U.sunCol.rgb * (rim * (0.5 + 1.6 * sheen));
  col += alb * U.ambSky.rgb * sheen * fr * 0.6 * ao;
  let Hh: vec3f = normalize(V + L);
  col += U.sunCol.rgb * sh * specS * pow(max(dot(N, Hh), 0.0), specP) * saturate(ndl * 4.0);
  if (gloss > 0.0) {
    let R: vec3f = reflect(-V, normalize(v.nrm));
    var env: vec3f = skyLut(normalize(vec3f(R.x, abs(R.y) * 0.9 + 0.02, R.z)));
    env = mix(env, vec3f(0.75, 0.80, 0.90) * (U.ambSky.rgb + U.sunCol.rgb * 0.35), smoothstep(0.05, -0.25, R.y));
    col += env * gloss * (0.06 + 0.94 * pow(1.0 - ndv, 5.0)) + U.sunCol.rgb * sh * gloss * 1.5 * pow(max(dot(normalize(v.nrm), Hh), 0.0), 300.0);
  }
  // after dark an animal that crosses the beam of the headlamp is lit by it (and its eye throws the light straight back)
  if (U.lamp.w > 0.0) {
    let ll: vec3f = lampLight(v.wp);
    if (ll.x > 0.00002) {
      let Ld: vec3f = normalize(U.lamp.xyz - v.wp);
      col += ll * (alb * saturate((dot(N, Ld) + 0.35) / 1.35) * (0.6 + 0.4 * ao) + gloss * 6.0 * pow(max(dot(normalize(v.nrm), normalize(V + Ld)), 0.0), 40.0));
    }
  }
  col = applyFog(col, v.wp);
  o.color = vec4f(col, 1.0);
  return o;
}
`;
