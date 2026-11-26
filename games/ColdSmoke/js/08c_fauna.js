"use strict";
// ---------------------------------------------------------------- the other animals of the mountain, and who decides which one comes past
// A snow hare that breaks from the tree line and bounds away ahead of the skis, a fox at its wandering near the trees, an ibex watching from a
// rock or the lip of the ridge, a golden eagle that comes over the shoulder and glides down the valley ahead. Made the way the deer are:
// a distance field meshed once (the body), swept shapes for what is too thin for the grid (horns, feathers), a skeleton posed by a gait
// function. What differs: each vertex carries its own colour (the coat is painted once, in JS, when the mesh is made), so one shader
// serves every kind; and each animal fades in and out through a dither, so none of them pops.
// For the rest of the game: Fauna.kinds [{ id, name }] (the deer among them), Fauna.spawn(id?) (send that kind, or any, past now: safe at any
// time, on the title page too), Fauna.reset() (a new mountain or a new run: everyone gone, the wait begins again), Fauna.enabled (as
// Deer.enabled, which still switches every kind off), Fauna.gap and Fauna.first (seconds between meetings, and before the first),
// Fauna.stats (what each kind cost at load). For tests: Fauna.pose, Fauna.clear, Fauna.seed. All of it is made, moved and drawn through
// the deer's own doors (Deer.init, update, draw, drawShadow, pipes), so nothing else in the game needs to know these animals exist.
const Fauna = (() => {
  const F = { ready: false, enabled: true, kinds: [{ id: 'deer', name: '鹿' }, { id: 'hare', name: '雪兔' }, { id: 'fox', name: '狐狸' }, { id: 'ibex', name: '北山羊' }, { id: 'eagle', name: '金雕' }], sp: {}, live: [], stats: {} };
  const SLOT = 32, NSLOT = 8, ROWS = SLOT * NSLOT, boneData = new Float32Array(4 * ROWS * 4);
  let gfx, pipe, pipeShadow, boneTex;

  // ---- distance functions (the mesher's own use Math.hypot, several times slower than a plain square root; these are called a million times at load)
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
  const sph = (x, y, z, c, r) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; };
  const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => { const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz, k0 = Math.sqrt(px * px + py * py + pz * pz), qx = px / rx, qy = py / ry, qz = pz / rz, k1 = Math.sqrt(qx * qx + qy * qy + qz * qz); return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); };
  const cap = (x, y, z, a, b, ra, rb) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz))), dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  };
  const mixc = (a, b, t) => { t = sat(t); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const loc = (x, y, z, o, X, Y, Z) => { const dx = x - o[0], dy = y - o[1], dz = z - o[2]; return [dx * X[0] + dy * X[1] + dz * X[2], dx * Y[0] + dy * Y[1] + dz * Y[2], dx * Z[0] + dy * Z[1] + dz * Z[2]]; };
  const frame = (o, ydir, xh) => { const y = v3.norm(ydir); let x = v3.sub(xh, v3.mul(y, v3.dot(xh, y))); if (v3.len(x) < 1e-5) x = v3.cross(y, [0, 0, 1]); x = v3.norm(x); return m4.fromBasis(x, y, v3.cross(x, y), o); };
  const ahead = a => [0, Math.sin(a), -Math.cos(a)], above = a => [0, Math.cos(a), Math.sin(a)];
  const turn = (d, a) => { const c = Math.cos(a), s = Math.sin(a); return [d[0] * c - d[2] * s, d[1], d[2] * c + d[0] * s]; };        // about the vertical: a > 0 swings 'ahead' toward the animal's right
  const bump = x => Math.sin(PI * sat(x)), S01 = (a, b, x) => smooth(a, b, x);
  const basis = m => ({ o: [m[12], m[13], m[14]], X: [m[0], m[1], m[2]], Y: [m[4], m[5], m[6]], Z: [m[8], m[9], m[10]] });

  // ================================================================ anything on four legs
  // Model space as the deer's: origin on the snow under the middle of the trunk, +y up, -z ahead, +x the animal's right.
  // Bones: the trunk in three (hips, spine, chest), two of neck, head, ears, three of tail, and four legs of four (upper, middle, cannon, foot).
  const QB = { hips: 0, spine: 1, chest: 2, neck1: 3, neck2: 4, head: 5, earL: 6, earR: 7, tail: 8, leg: 11 }, QNB = 27;
  // a leg of three bones folds like a Z: the top bone and the cannon keep a set angle to each other (tendons see to that), which leaves a
  // two-bone problem. `dd` opens or closes that angle for the poses that need it (a hare sitting on its hocks)
  function legSpec(a, b, c, d) {
    const ang = (p, q) => Math.atan2(q[1] - p[1], q[2] - p[2]), len = (p, q) => Math.hypot(q[1] - p[1], q[2] - p[2]);
    const l1 = len(a, b), l2 = len(b, c), l3 = len(c, d), a1 = ang(a, b), a3 = ang(c, d);
    let del = a3 - a1; del = Math.atan2(Math.sin(del), Math.cos(del));
    const A = Math.sqrt(l1 * l1 + l3 * l3 + 2 * l1 * l3 * Math.cos(del)), al = Math.atan2(l3 * Math.sin(del), l1 + l3 * Math.cos(del));
    let bd = (a1 + al) - ang(a, d); bd = Math.atan2(Math.sin(bd), Math.cos(bd));
    return { l1, l2, l3, del, bend: bd >= 0 ? 1 : -1, L: l1 + l2 + l3 };
  }
  function legIK(H, T, L, dd, o) {
    const del = L.del + dd, A = Math.sqrt(L.l1 * L.l1 + L.l3 * L.l3 + 2 * L.l1 * L.l3 * Math.cos(del)), al = Math.atan2(L.l3 * Math.sin(del), L.l1 + L.l3 * Math.cos(del));
    const dz = T[2] - H[2], dy = T[1] - H[1], Dd = Math.hypot(dz, dy), Dc = clamp(Dd, Math.abs(A - L.l2) + 0.03 * L.L, A + L.l2 - 0.004 * L.L), base = Math.atan2(dy, dz);
    const g = Math.acos(clamp((A * A + Dc * Dc - L.l2 * L.l2) / (2 * A * Dc), -1, 1)), eA = base + L.bend * g, aA = eA - al, cA = aA + del;
    const k1 = [lerp(H[0], T[0], 0.3), H[1] + L.l1 * Math.sin(aA), H[2] + L.l1 * Math.cos(aA)];
    const k2 = [lerp(H[0], T[0], 0.7), k1[1] + Dc * Math.sin(base) - A * Math.sin(eA), k1[2] + Dc * Math.cos(base) - A * Math.cos(eA)];
    o.k1 = k1; o.k2 = k2; o.k3 = [T[0], k2[1] + L.l3 * Math.sin(cA), k2[2] + L.l3 * Math.cos(cA)]; return o;
  }
  // a pose is plain numbers, so two of them can be mixed before the skeleton is solved (nothing ever snaps from one behaviour to the next).
  // my, mz: the middle of the back, up and back from where it rests; aC, aH: the chest and the hips pitched nose-up;
  // nA, nB, hA: neck (two parts) and head, raised above the rest carriage; hY, hR: the head turned (to its right) and cocked;
  // eB, eO: ears laid back and spread, eL, eR each ear's own; t0..t2, y0..y2: the tail raised and swung;
  // lg: for each foot (fore left, fore right, hind left, hind right) how far ahead of where it stands, how high, how far out, toes curled, Z opened
  const PK = ['my', 'mz', 'aC', 'aH', 'nA', 'nB', 'hA', 'hY', 'hR', 'eB', 'eO', 'eL', 'eR', 't0', 't1', 't2', 'y0', 'y1', 'y2', 'nY'];
  const newPose = () => { const p = { lg: new Float64Array(20) }; for (const k of PK) p[k] = 0; return p; };
  const zeroPose = p => { for (const k of PK) p[k] = 0; p.lg.fill(0); return p; };
  const mixPose = (o, a, b, t) => { for (const k of PK) o[k] = a[k] + (b[k] - a[k]) * t; for (let i = 0; i < 20; i++) o.lg[i] = a.lg[i] + (b.lg[i] - a.lg[i]) * t; return o; };
  const _lg = {};
  function quad(S) {
    const Q = { S, NB: QNB, LF: legSpec(S.SH, S.EL, S.CA, S.FF), LH: legSpec(S.HP, S.ST, S.HK, S.HF) };
    const toeF = Math.hypot(S.TOEF[1], S.TOEF[2]), toeH = Math.hypot(S.TOEH[1], S.TOEH[2]), taF = Math.atan2(S.TOEF[1], S.TOEF[2]), taH = Math.atan2(S.TOEH[1], S.TOEH[2]);
    const trunk = p => {
      const M = [0, S.MID[1] + p.my, S.MID[2] + p.mz], fc = ahead(p.aC), uc = above(p.aC), fh = ahead(p.aH), uh = above(p.aH), Oc = v3.mad(M, fc, S.HALF), Oh = v3.mad(M, fh, -S.HALF);
      return { M, fc, uc, fh, uh, Oc, Oh,
        inC: (x, y, z) => [Oc[0] + x, Oc[1] + uc[1] * y - fc[1] * z, Oc[2] + uc[2] * y - fc[2] * z],      // chest-local (x right, y up, z back) -> model
        inH: (x, y, z) => [Oh[0] + x, Oh[1] + uh[1] * y - fh[1] * z, Oh[2] + uh[2] * y - fh[2] * z] };
    };
    // the joint a leg hangs from rides on the chest (the shoulder blade slides with the reach of the leg) or on the pelvis; and where its foot is asked to be
    const legEnds = (t, p, i) => {
      const fore = i < 2, sx = i & 1 ? 1 : -1, f = p.lg[i * 5], rest = fore ? S.FF : S.HF, top = fore ? S.SH : S.HP;
      return [fore ? t.inC(sx * top[0], top[1] - S.MID[1], top[2] - (S.MID[2] - S.HALF) - S.blade * f) : t.inH(sx * top[0], top[1] - S.MID[1], top[2] - (S.MID[2] + S.HALF)), [sx * (rest[0] + p.lg[i * 5 + 2]), rest[1] + p.lg[i * 5 + 1], rest[2] - f]];
    };
    // how far the Z of a leg must open for its hock to rest at a given height (an animal sitting back on its heels)
    Q.plant = function (p, i, y0) {
      const e = legEnds(trunk(p), p, i), L = i < 2 ? Q.LF : Q.LH, err = dd => legIK(e[0], e[1], L, dd, _lg).k2[1] - y0; let lo = -0.9, hi = 1.5, elo = err(lo), ehi = err(hi);
      if (elo * ehi > 0) return Math.abs(elo) < Math.abs(ehi) ? lo : hi;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2, em = err(m); if (em * elo > 0) { lo = m; elo = em; } else hi = m; }
      return (lo + hi) / 2;
    };
    // a foot put where the body would carry it (so far along the chest or the pelvis from the joint it hangs from, so far below), for the
    // moments when an animal is off the ground and its legs go with it and not with the snow
    Q.foot = function (p, i, alongK, down, w) {
      const t = trunk(p), e = legEnds(t, p, i), fore = i < 2, f = fore ? t.fc : t.fh, u = fore ? t.uc : t.uh, rest = fore ? S.FF : S.HF, k = i * 5;
      const y = e[0][1] + f[1] * alongK - u[1] * down, z = e[0][2] + f[2] * alongK - u[2] * down;
      p.lg[k] += (rest[2] - z - p.lg[k]) * w; p.lg[k + 1] += (y - rest[1] - p.lg[k + 1]) * w;
    };
    Q.solve = function (p) {
      const J = {}, Fm = new Array(QNB), t = trunk(p), M = t.M, fc = t.fc, uc = t.uc, fh = t.fh, uh = t.uh, Oc = t.Oc, Oh = t.Oh, inC = t.inC, inH = t.inH;
      J.M = M; J.Oc = Oc; J.Oh = Oh;
      Fm[QB.chest] = m4.fromBasis([1, 0, 0], uc, v3.mul(fc, -1), Oc); Fm[QB.hips] = m4.fromBasis([1, 0, 0], uh, v3.mul(fh, -1), Oh);
      { const am = (p.aC + p.aH) / 2; Fm[QB.spine] = m4.fromBasis([1, 0, 0], above(am), v3.mul(ahead(am), -1), M); }
      J.legs = [];
      for (let i = 0; i < 4; i++) {
        const fore = i < 2, c = p.lg[i * 5 + 3], dd = p.lg[i * 5 + 4], b0 = QB.leg + i * 4, e = legEnds(t, p, i), Hj = e[0], T = e[1], k = legIK(Hj, T, fore ? Q.LF : Q.LH, dd, _lg), xh = [1, 0, 0];
        Fm[b0] = frame(Hj, v3.sub(k.k1, Hj), xh); Fm[b0 + 1] = frame(k.k1, v3.sub(k.k2, k.k1), xh); Fm[b0 + 2] = frame(k.k2, v3.sub(k.k3, k.k2), xh);
        // the foot: flat to the snow while it bears weight, trailing when the leg is carried
        const ha = (fore ? taF : taH) + c * 1.05, tl = fore ? toeF : toeH, tip = [k.k3[0], k.k3[1] + tl * Math.sin(ha), k.k3[2] + tl * Math.cos(ha)];
        Fm[b0 + 3] = frame(k.k3, v3.sub(tip, k.k3), xh);
        J.legs.push([Hj, k.k1.slice(), k.k2.slice(), k.k3.slice(), tip]);
      }
      // neck and head. The head turns on the neck as well as on itself: a quarter of a long look is taken by the lower neck, half by the upper
      const N = S.neck, nA = N.a1 + p.nA - p.aC * N.steady, nB = N.a2 + p.nB - p.aC * N.steady, yw = p.hY + p.nY;
      const NB0 = inC(N.base[0], N.base[1], N.base[2]), NM = v3.mad(NB0, turn(ahead(nA + p.aC), yw * 0.2), N.l1), HB = v3.mad(NM, turn(ahead(nB + p.aC), yw * 0.5), N.l2);
      J.NB = NB0; J.NM = NM; J.HB = HB;
      Fm[QB.neck1] = frame(NB0, v3.sub(NM, NB0), [1, 0, 0]); Fm[QB.neck2] = frame(NM, v3.sub(HB, NM), [1, 0, 0]);
      const hA = S.headA + p.hA, hf0 = ahead(hA), hu0 = above(hA), cy = Math.cos(yw), sy = Math.sin(yw), cr = Math.cos(p.hR), sr = Math.sin(p.hR);
      const hf = [sy, hf0[1] * cy, hf0[2] * cy], hx = [cy, -hf0[1] * sy, -hf0[2] * sy];
      const hb = { X: [hx[0] * cr + hu0[0] * sr, hx[1] * cr + hu0[1] * sr, hx[2] * cr + hu0[2] * sr], Y: [hu0[0] * cr - hx[0] * sr, hu0[1] * cr - hx[1] * sr, hu0[2] * cr - hx[2] * sr], Z: v3.mul(hf, -1) };
      J.hb = hb; Fm[QB.head] = m4.fromBasis(hb.X, hb.Y, hb.Z, HB);
      const inHd = (x, y, z) => [HB[0] + hb.X[0] * x + hb.Y[0] * y + hb.Z[0] * z, HB[1] + hb.X[1] * x + hb.Y[1] * y + hb.Z[1] * z, HB[2] + hb.X[2] * x + hb.Y[2] * y + hb.Z[2] * z];
      J.inHd = inHd;
      for (const sx of [-1, 1]) {
        const E = S.ear, eb = inHd(sx * E.base[0], E.base[1], E.base[2]), back = E.back + p.eB + (sx < 0 ? p.eL : p.eR), out = E.out + p.eO;
        const dl = [sx * Math.sin(out), Math.cos(out) * Math.cos(back), Math.cos(out) * Math.sin(back)];
        const dir = [hb.X[0] * dl[0] + hb.Y[0] * dl[1] + hb.Z[0] * dl[2], hb.X[1] * dl[0] + hb.Y[1] * dl[1] + hb.Z[1] * dl[2], hb.X[2] * dl[0] + hb.Y[2] * dl[1] + hb.Z[2] * dl[2]];
        const tw = E.twist || 0, ct = Math.cos(tw), st = sx * Math.sin(tw);                  // the hollow of the ear is turned outward
        J[sx < 0 ? 'earL' : 'earR'] = [eb, dir]; Fm[sx < 0 ? QB.earL : QB.earR] = frame(eb, dir, [hb.X[0] * ct + hb.Z[0] * st, hb.X[1] * ct + hb.Z[1] * st, hb.X[2] * ct + hb.Z[2] * st]);
      }
      // the tail: three lengths, each with its own lift and swing (a hare's is one lump and uses the first only)
      { const Tl = S.tail; let o = inH(Tl.base[0], Tl.base[1], Tl.base[2]); J.tail = [o];
        for (let k = 0; k < 3; k++) {
          const a = Tl.a[k] + p['t' + k] - p.aH * Tl.follow, yw2 = p['y' + k], d = [Math.sin(yw2) * Math.cos(a), Math.sin(a), Math.cos(a) * Math.cos(yw2)];
          Fm[QB.tail + k] = frame(o, d, [1, 0, 0]); o = v3.mad(o, d, Tl.l[k]); J.tail.push(o);
        } }
      return { J, F: Fm, inC, inH };
    };
    return Q;
  }

  // ---- one stride of anything that leaps: a hare's bound, a fox's gallop, the stiff jumps of an ibex are the same motion with other numbers.
  // Phase 0 is the moment the fore feet come down. They carry the body over themselves while the back arches and the hind feet swing through
  // (a hare's pass outside the fore legs and land ahead of where those stood); then the hind legs drive, the back straightens, and the
  // animal is in the air stretched out until the fore feet come down again. A foot that is down stays where it is on the snow: in the
  // body's own frame it travels back at the speed the body goes forward, so the faster the animal the shorter each touch.
  // G: { fOn, hOn: when in the stride each pair lands; fDur, hDur: the longest it may stay down (fraction of a stride); sF, sH: how far apart in
  //      time the two feet of a pair land; fLand, hLand: where (ahead of rest); fSweep, hSweep: how far back a foot may be carried;
  //      fLift, hLift, hTrail: how high the feet are carried and how high the hind feet trail; splay; flex, pit, bob: trunk; ... }
  // v: speed over the snow in the model's own metres per second; T: the time one stride takes
  function leapFoot(p, on, durMax, land, sweep, v, T, o) {
    const q = ((p - on) % 1 + 1) % 1, dur = Math.min(durMax, sweep / Math.max(v * T, 1e-3));
    if (q < dur) { o.f = land - v * T * q; o.u = 0; o.s = -1; return o; }                // down
    o.s = (q - dur) / (1 - dur); o.f0 = land - v * T * dur; return o;                   // carried: s runs 0..1 from the lift to the next touch
  }
  const _lf = { f: 0, u: 0, s: 0, f0: 0 };
  function leap(G, ph, v, T, run, o) {
    zeroPose(o);
    const w = TAU * ph, th = TAU * (ph - G.gather), fl = Math.cos(th + 0.4 * Math.sin(th));        // +1 gathered and arched, -1 stretched (and it stays stretched longer than it stays gathered)
    const flex = run * G.flex * (fl * 0.5 + 0.5 * G.flexBias + 0.5 * fl * (1 - G.flexBias));
    const pit = run * (G.pit * Math.sin(TAU * (ph - G.pitAt)) + G.pit0);
    o.aC = pit - G.flexC * flex; o.aH = pit + G.flexH * flex;
    o.my = run * (-G.bob * Math.sin(w + G.bobAt) + G.arch * Math.max(fl, 0) + G.my0); o.mz = run * G.surge * Math.sin(w + 1.0);
    for (let i = 0; i < 4; i++) {
      const fore = i < 2, lead = i & 1 ? 0.5 : -0.5, k = i * 5;
      if (fore) {
        const fp = leapFoot(ph, G.fOn + lead * G.sF, G.fDur, G.fLand, G.fSweep, v, T, _lf);
        if (fp.s < 0) { o.lg[k] = fp.f * run; continue; }
        // let go behind the shoulder, folded up under the chest through the drive of the hind legs, then thrown out ahead and brought back a little to meet the snow
        const s = fp.s, reach = G.fLand + G.fOver;
        o.lg[k] = run * (lerp(fp.f0, reach, S01(0.38, 0.90, s)) - G.fOver * S01(0.88, 1.0, s) - G.fBack * bump(s / 0.34));
        o.lg[k + 1] = run * (G.fLift * S01(0.0, 0.22, s) * (1 - S01(0.62, 1.0, s)) + 0.12 * G.fLift * bump(s));
        o.lg[k + 3] = run * S01(0.0, 0.14, s) * (1 - S01(0.74, 0.98, s));
      } else {
        const fp = leapFoot(ph, G.hOn + lead * G.sH, G.hDur, G.hLand, G.hSweep, v, T, _lf);
        if (fp.s < 0) { o.lg[k] = fp.f * run; o.lg[k + 2] = run * G.splay; continue; }
        // trails out behind and up through the long leap, then is thrown forward under the belly, wide of the fore legs
        const s = fp.s;
        o.lg[k] = run * lerp(fp.f0 - G.hBack * bump(s / 0.45), G.hLand, S01(0.42, 0.97, s));
        o.lg[k + 1] = run * (G.hTrail * Math.pow(bump(s * 0.9 + 0.02), 1.2) * (1 - 0.45 * S01(0.5, 0.95, s)) + G.hLift * bump((s - 0.45) / 0.55));
        o.lg[k + 2] = run * G.splay * S01(0.35, 0.9, s);
        o.lg[k + 3] = run * S01(0.0, 0.16, s) * (1 - S01(0.72, 0.98, s));
      }
    }
    // the head is carried level whatever the chest does; ears and tail answer the stride a beat late
    o.nA = run * (G.neck + G.neckSw * Math.sin(w - 1.9)); o.nB = o.nA * 0.6; o.hA = run * (G.head + 0.04 * Math.sin(w - 0.6)) - o.aC * G.headLevel;
    o.eB = run * (G.ear + G.earSw * Math.sin(w - 2.4)); o.eO = run * G.earOut;
    o.t0 = run * (G.tail + G.tailSw * Math.sin(w - 2.0)); o.t1 = run * (G.tail1 + G.tailSw * 1.3 * Math.sin(w - 2.7)); o.t2 = run * (G.tail1 + G.tailSw * 1.6 * Math.sin(w - 3.4));
    return o;
  }

  // ---- a walk or a trot: the feet go in diagonal pairs (`lag` lets the hind foot of a pair come down a little after its fore foot, which
  // makes a walk of it), each down for `duty` of the stride and carried forward the rest
  function trot(G, ph, v, T, run, o) {
    zeroPose(o);
    const w = TAU * ph;
    for (let i = 0; i < 4; i++) {
      const fore = i < 2, q = ((ph - (fore ? 0 : 0.5 + G.lag) - (i & 1 ? 0.5 : 0)) % 1 + 1) % 1, k = i * 5, A = Math.min(v * T * G.duty, fore ? G.fMax : G.hMax), c = fore ? G.fMid : G.hMid;
      if (q < G.duty) o.lg[k] = run * (c + A * (0.5 - q / G.duty));
      else { const s = (q - G.duty) / (1 - G.duty), e = s * s * (3 - 2 * s), up = Math.sin(PI * s); o.lg[k] = run * (c + A * (e - 0.5)); o.lg[k + 1] = run * (fore ? G.fLift : G.hLift) * up * (0.55 + 0.45 * up); o.lg[k + 3] = run * 0.8 * Math.sin(PI * Math.min(1, s * 1.35)); }
    }
    o.my = run * (G.my0 - G.bob * Math.cos(2 * w + G.bobAt)); o.aC = run * (G.pit0 + G.pit * Math.sin(2 * w)); o.aH = run * (G.pit0 - G.pit * Math.sin(2 * w));
    o.nA = run * (G.neck + G.nod * Math.sin(2 * w - 0.8)); o.nB = o.nA * 0.7; o.hA = run * G.head - o.nA * 0.5;
    o.t0 = run * (G.tail + 0.04 * Math.sin(2 * w - 1.0)); o.t1 = run * (G.tail1 + 0.06 * Math.sin(2 * w - 1.8)); o.t2 = run * (G.tail2 + 0.08 * Math.sin(2 * w - 2.6));
    o.y0 = run * G.wag * Math.sin(w - 0.5); o.y1 = run * G.wag * 1.7 * Math.sin(w - 1.2); o.y2 = run * G.wag * 2.4 * Math.sin(w - 1.9);
    o.eB = run * G.ear;
    return o;
  }

  // ---- skinning: a soft blend between the two nearest bones (a leg only ever listens to its own side). `own` may claim a vertex outright
  function boneWeights(mesh, segs, soft, own) {
    const n = mesh.nv, out = new Float32Array(n * 4), res = [0, 0, 1];
    for (let v = 0; v < n; v++) {
      const x = mesh.verts[v * 10], y = mesh.verts[v * 10 + 1], z = mesh.verts[v * 10 + 2];
      let b0 = -1, b1 = -1, d0 = 1e9, d1 = 1e9, w = 1, k0 = 1, k1 = 1;
      if (own && own(x, y, z, res)) { b0 = res[0]; b1 = res[1]; w = res[2]; }
      else {
        for (const s of segs) {
          if (s.side && s.side * x < -s.r * 0.15) continue;
          const d = cap(x, y, z, s.a, s.b, s.r, s.r2 == null ? s.r : s.r2);
          if (s.i === b0) { if (d < d0) d0 = d; continue; } if (s.i === b1) { if (d < d1) { d1 = d; if (d1 < d0) { let t = d0; d0 = d1; d1 = t; t = b0; b0 = b1; b1 = t; t = k0; k0 = k1; k1 = t; } } continue; }
          if (d < d0) { d1 = d0; b1 = b0; k1 = k0; d0 = d; b0 = s.i; k0 = s.k || 1; } else if (d < d1) { d1 = d; b1 = s.i; k1 = s.k || 1; }
        }
        if (b1 < 0) { b1 = b0; d1 = d0; }
        w = 1 / (1 + Math.exp(-(d1 - d0) / (soft * Math.max(k0, k1))));          // (a joint that turns far is given a wider blend: k)
      }
      out[v * 4] = b0; out[v * 4 + 1] = b1; out[v * 4 + 2] = w;
    }
    return out;
  }
  // anything out along an ear belongs to it, eased in over its root
  const earOwn = (earF, len, wx, wz, root) => (x, y, z, res) => {
    const e = x < 0 ? earF[0] : earF[1], p = loc(x, y, z, e.o, e.X, e.Y, e.Z);
    if (p[1] < root * 0.25 || p[1] > len * 1.25 || Math.abs(p[0]) > wx || Math.abs(p[2]) > wz) return false;
    res[0] = x < 0 ? QB.earL : QB.earR; res[1] = QB.head; res[2] = smooth(root * 0.25, root * 1.4, p[1]); return true;
  };
  // how much sky a point of the surface sees, from the field itself
  const skyAO = (f, r1, r2) => (x, y, z, nx, ny, nz, out) => { out[0] = 0; out[1] = sat(0.3 + 0.7 * (0.55 * sat(f(x + nx * r1, y + ny * r1, z + nz * r1) / r1) + 0.45 * sat(f(x + nx * r2, y + ny * r2, z + nz * r2) / r2))); out[2] = 0; out[3] = 0; };
  // the mesh as the GPU wants it: positions, normals and (class, sky seen, -, -) | (bone, bone, weight) | (colour, how furry)
  function pack(parts) {
    let nv = 0, ni = 0; for (const p of parts) { nv += p.nv; ni += p.ni; }
    const V = new Float32Array(nv * 10), W = new Float32Array(nv * 4), C = new Float32Array(nv * 4), I = new Uint32Array(ni); let vo = 0, io = 0;
    for (const p of parts) { V.set(p.verts.subarray(0, p.nv * 10), vo * 10); W.set(p.bw, vo * 4); C.set(p.col, vo * 4); for (let i = 0; i < p.ni; i++) I[io + i] = p.idx[i] + vo; vo += p.nv; io += p.ni; }
    return { V, W, C, I, nv, ni };
  }
  // a surface given by a function of two parameters (a horn, a feather): nu x nv points, the normals from its own shape. wrap: closed round in v.
  // cls: what it is made of (the shader's class); the two parameters are kept with each point (for barbs, ridges)
  function surf(nu, nv, fn, wrap, flip, cls) {
    const P = new Float32Array(nu * nv * 3), o = [0, 0, 0], verts = new Float32Array(nu * nv * 10), idx = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { fn(i / (nu - 1), wrap ? j / nv : j / (nv - 1), o); P.set(o, (i * nv + j) * 3); }
    const at = (i, j) => (clamp(i, 0, nu - 1) * nv + (wrap ? (j + nv) % nv : clamp(j, 0, nv - 1))) * 3;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1), k = (i * nv + j) * 10, p = (i * nv + j) * 3;
      let n = v3.cross([P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]], [P[c] - P[d], P[c + 1] - P[d + 1], P[c + 2] - P[d + 2]]); n = v3.len(n) > 1e-12 ? v3.norm(n) : [0, 1, 0]; if (flip) n = v3.mul(n, -1);      // (a sheet drawn to a point has no slope there to take a normal from)
      verts[k] = P[p]; verts[k + 1] = P[p + 1]; verts[k + 2] = P[p + 2]; verts[k + 3] = n[0]; verts[k + 4] = n[1]; verts[k + 5] = n[2]; verts[k + 6] = cls; verts[k + 7] = 1; verts[k + 8] = i / (nu - 1); verts[k + 9] = wrap ? j / nv : j / (nv - 1);
    }
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < (wrap ? nv : nv - 1); j++) { const a = i * nv + j, b = i * nv + (j + 1) % nv, c = (i + 1) * nv + (j + 1) % nv, d = (i + 1) * nv + j; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, d, c, a, c, b); }
    return { verts, idx: new Uint32Array(idx), nv: nu * nv, ni: idx.length };
  }
  const rigid = (m, bone) => { const w = new Float32Array(m.nv * 4); for (let i = 0; i < m.nv; i++) { w[i * 4] = bone; w[i * 4 + 1] = bone; w[i * 4 + 2] = 1; } return w; };
  const paint = (m, fn) => { const C = new Float32Array(m.nv * 4), o = [0, 0, 0, 1]; for (let v = 0; v < m.nv; v++) { const k = v * 10; o[3] = 1; fn(m.verts[k], m.verts[k + 1], m.verts[k + 2], m.verts[k + 3], m.verts[k + 4], m.verts[k + 5], o, m.verts, k); C[v * 4] = o[0]; C[v * 4 + 1] = o[1]; C[v * 4 + 2] = o[2]; C[v * 4 + 3] = o[3]; } return C; };

  // ================================================================ the snow hare (Lepus timidus in its winter coat: white, with black tips to the ears)
  // Life-size here (nose to tail a little under 60 cm); drawn a third larger, as a big northern hare is, so that it reads from the skis.
  const HARE = (() => {
    const S = {
      MID: [0, 0.222, 0.012], HALF: 0.128, blade: 0.10,
      SH: [0.040, 0.196, -0.128], EL: [0.043, 0.128, -0.088], CA: [0.039, 0.042, -0.118], FF: [0.039, 0.013, -0.128], TOEF: [0, -0.006, -0.034],
      HP: [0.050, 0.212, 0.142], ST: [0.064, 0.132, 0.078], HK: [0.058, 0.060, 0.186], HF: [0.058, 0.013, 0.128], TOEH: [0, -0.005, -0.060],
      neck: { base: [0, 0.020, -0.028], l1: 0.036, l2: 0.036, a1: 0.50, a2: 0.36, steady: 0.5 }, headA: -0.24,
      ear: { base: [0.0165, 0.041, -0.010], back: 0.50, out: 0.22, len: 0.106, twist: 0.85 },
      tail: { base: [0, -0.012, 0.078], a: [-0.30, -0.30, -0.30], l: [0.036, 0.01, 0.01], follow: 1 },
    };
    const Q = quad(S), K = { id: 'hare', Q, NB: QNB, scale: 1.45, tex: [5.0, 0.5, 0.22, -9], eyeL: [0.0258, 0.0170, -0.0500, 0.0112], eyeCol: [0.07, 0.035, 0.02], pupil: [0.72, 0.72], nose: [0, -0.008, -0.1165, 0.0085], soft: 0.013 };
    K.build = function () {
      const P0 = newPose(), bd = Q.solve(P0), J = bd.J, hb = J.hb, HB = J.HB;
      K.bind = bd; K.inv = bd.F.map(m => m4.invert(m)); { const e = J.inHd(K.eyeL[0], K.eyeL[1], K.eyeL[2]); K.eye = [e[0], e[1], e[2], K.eyeL[3]]; }
      const earF = [QB.earL, QB.earR].map(i => basis(bd.F[i]));
      const hc = v3.mad(HB, hb.Z, -0.05), L = J.legs, toe = L.map((l, i) => v3.lerp(l[3], l[4], i < 2 ? 0.8 : 0.85)), nk = v3.mad(HB, hb.Z, -0.012), ln0 = [0, 0.203, -0.06], ln1 = [0, 0.218, 0.10];
      function f(x, y, z) {
        const ax = Math.abs(x);
        // trunk: a narrow deep chest, a long loin, and the high round haunches that make a hare
        let d = ell(x, y, z, 0, 0.190, -0.090, 0.047, 0.060, 0.098);
        d = smin(d, cap(x, y, z, ln0, ln1, 0.058, 0.066), 0.05);
        d = smin(d, ell(x, y, z, 0, 0.216, 0.130, 0.062, 0.078, 0.094), 0.05);
        d = smin(d, ell(ax, y, z, 0.042, 0.180, 0.118, 0.036, 0.066, 0.072), 0.035);                 // thigh, lying against the flank
        d = smin(d, ell(ax, y, z, 0.032, 0.172, -0.118, 0.026, 0.048, 0.042), 0.03);                 // shoulder
        d = smin(d, cap(x, y, z, J.NB, nk, 0.046, 0.036), 0.04);                                       // neck: short, lost in the ruff
        d = smin(d, cap(x, y, z, J.tail[0], J.tail[1], 0.022, 0.026), 0.022);                         // scut
        // head: deep through the jaw, the nose blunt and arched, the eyes set high and wide
        if (sph(x, y, z, hc, 0.16) < d + 0.03) {
          const q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z), aq = Math.abs(q[0]);
          let h = ell(q[0], q[1], q[2], 0, 0.010, -0.043, 0.0315, 0.0335, 0.045);
          h = smin(h, cap(q[0], q[1], q[2], [0, 0.000, -0.060], [0, -0.010, -0.090], 0.0275, 0.0225), 0.03);
          h = smin(h, ell(aq, q[1], q[2], 0.016, -0.010, -0.052, 0.019, 0.022, 0.032), 0.018);         // cheek
          h = smin(h, ell(aq, q[1], q[2], 0.0235, 0.0170, -0.050, 0.0095, 0.0110, 0.0120), 0.004);     // eye
          h = smin(h, ell(aq, q[1], q[2], 0.008, -0.015, -0.101, 0.011, 0.011, 0.012), 0.008);         // the split lip
          d = smin(d, h, 0.022);
          for (const e of earF) { const p = loc(x, y, z, e.o, e.X, e.Y, e.Z); let ed = ell(p[0], p[1], p[2], 0, 0.052, 0, 0.0185, 0.056, 0.0090); ed = smax(ed, -ell(p[0], p[1], p[2], 0, 0.058, -0.0130, 0.0130, 0.044, 0.0095), 0.006); d = smin(d, ed, 0.010); }
        }
        // legs: the fore ones slight, the hind ones long levers with a foot as long as the shin
        let lg = 1e9;
        for (let i = 0; i < 4; i++) {
          const l = L[i]; if (i < 2) {
            if (cap(x, y, z, l[0], l[4], 0.075, 0.075) > d + 0.03) continue;
            let a = cap(x, y, z, l[0], l[1], 0.028, 0.022); a = smin(a, cap(x, y, z, l[1], l[2], 0.021, 0.0140), 0.012);
            a = smin(a, cap(x, y, z, l[2], l[3], 0.0140, 0.0140), 0.006); a = smin(a, cap(x, y, z, l[3], toe[i], 0.0145, 0.0130), 0.006);
            lg = Math.min(lg, a);
          } else {
            if (cap(x, y, z, l[0], l[4], 0.135, 0.135) > d + 0.03) continue;
            let a = cap(x, y, z, l[0], l[1], 0.040, 0.031); a = smin(a, cap(x, y, z, l[1], l[2], 0.030, 0.0145), 0.016);
            a = smin(a, cap(x, y, z, l[2], l[3], 0.0160, 0.0170), 0.008); a = smin(a, cap(x, y, z, l[3], toe[i], 0.0180, 0.0150), 0.008);
            lg = Math.min(lg, a);
          }
        }
        lg = Math.max(lg, -(y - 0.0015));
        return smin(d, lg, 0.022);
      }
      const t0 = performance.now(), m = meshSDF(f, [-0.125, -0.006, -0.40], [0.125, 0.46, 0.30], 0.0074, { stride: 2, attr: skyAO(f, 0.014, 0.05) });
      K.meshMs = performance.now() - t0;
      const segs = [], seg = (i, a, b, r, side = 0, k = 1) => segs.push({ i, a, b, r, side, k });
      seg(QB.hips, [0, 0.21, 0.07], [0, 0.215, 0.18], 0.075); seg(QB.spine, [0, 0.20, -0.04], [0, 0.205, 0.05], 0.068); seg(QB.chest, [0, 0.19, -0.15], [0, 0.195, -0.07], 0.065);
      seg(QB.neck1, J.NB, J.NM, 0.045); seg(QB.neck2, J.NM, J.HB, 0.040); seg(QB.head, J.HB, J.inHd(0, -0.01, -0.12), 0.034); seg(QB.tail, J.tail[0], J.tail[1], 0.022);
      // (shoulder and upper arm lie inside the outline of the chest: only what hangs free of it listens to the leg)
      for (let i = 0; i < 4; i++) { const l = L[i], b0 = QB.leg + i * 4, sx = i & 1 ? 1 : -1; if (i < 2) seg(b0, v3.lerp(l[0], l[1], 0.55), l[1], 0.012, sx, 1.8); else seg(b0, l[0], l[1], 0.036, sx, 1.5); seg(b0 + 1, l[1], l[2], i < 2 ? 0.016 : 0.022, sx); seg(b0 + 2, l[2], l[3], 0.013, sx); seg(b0 + 3, l[3], l[4], 0.013, sx); }
      m.bw = boneWeights(m, segs, K.soft, earOwn(earF, S.ear.len, 0.024, 0.016, 0.016));
      // a coat still turning, as it is into the first weeks of winter: white below and on the flanks, the brown-grey of summer left along the
      // back, on the crown and the backs of the ears, flecked where the white is coming through (all white, it could not be seen on the snow at
      // all); buff on the bridge of the nose and on the feet; the tips of the ears black
      const WH = [0.80, 0.79, 0.765], UF = [0.55, 0.57, 0.60], BUFF = [0.66, 0.57, 0.44], BLK = [0.022, 0.020, 0.019], BRN = [0.150, 0.110, 0.075], GRY = [0.26, 0.23, 0.20];
      m.col = paint(m, (x, y, z, nx, ny, nz, o) => {
        const ax = Math.abs(x), q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z);
        let c = mixc(WH, UF, 0.38 * S01(0.5, 0.95, ny) * S01(0.05, 0.0, ax - 0.03) * S01(-0.16, -0.06, z) * (0.6 + 0.4 * vnoise3(x * 60, y * 60, z * 30, 7)));
        c = mixc(c, UF, 0.14 * (0.5 + 0.5 * vnoise3(x * 38, y * 38, z * 22, 3)));
        c = mixc(c, BUFF, 0.30 * S01(0.045, 0.0, y) + 0.34 * S01(-0.055, -0.10, q[2]) * S01(-0.004, 0.02, q[1]) * S01(0.022, 0.008, Math.abs(q[0])));
        { const mo = vnoise3(x * 60, y * 60, z * 36, 13), n1 = vnoise3(x * 24, y * 24, z * 15, 5); c = mixc(c, mixc(BRN, GRY, n1), 0.94 * S01(-0.18, 0.34, ny + 0.5 * (mo - 0.5)) * S01(0.112, 0.172, y + 0.035 * mo)); }
        const e = x < 0 ? earF[0] : earF[1], p = loc(x, y, z, e.o, e.X, e.Y, e.Z);
        if (p[1] > 0.012 && Math.hypot(p[0], p[2]) < 0.03) {
          c = mixc(c, [0.50, 0.40, 0.36], 0.55 * S01(0.002, -0.004, p[2]) * S01(0.012, 0.004, Math.abs(p[0])) * S01(0.01, 0.03, p[1]));   // the hollow of the ear
          c = mixc(c, mixc(BRN, GRY, 0.4), 0.85 * S01(-0.001, 0.004, p[2]) * S01(0.004, 0.02, p[1]));
          c = mixc(c, BLK, S01(0.080, 0.092, p[1] + 0.006 * vnoise3(x * 90, y * 90, z * 90, 5)));
        }
        const nose = S01(0.0105, 0.0075, Math.hypot(q[0], q[1] + 0.006, q[2] + 0.1090));
        c = mixc(c, [0.16, 0.085, 0.075], nose);
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = 1 - 0.7 * nose;
      });
      K.mesh = pack([m]); return K.mesh;
    };
    // sitting: back on its hocks, the hind feet flat, the chest raised. `up` 0: crouched in its form, ears laid along the back; 1: bolt upright, ears raised, looking
    K.sit = function (up, o) {
      zeroPose(o);
      o.aH = lerp(0.30, 0.52, up); o.aC = lerp(0.04, 1.00, up); o.my = lerp(-0.080, -0.050, up); o.mz = lerp(0.020, 0.050, up);
      for (let i = 0; i < 2; i++) { o.lg[i * 5] = lerp(0.020, -0.075, up); o.lg[i * 5 + 1] = lerp(0, 0.118, up); o.lg[i * 5 + 3] = lerp(0, 0.75, up); o.lg[i * 5 + 2] = -0.006 * up; }
      for (let i = 2; i < 4; i++) { o.lg[i * 5] = lerp(0.085, 0.100, up); o.lg[i * 5 + 2] = 0.016; }
      o.lg[14] = o.lg[19] = Q.plant(o, 2, 0.017);
      o.nA = lerp(-0.42, 0.20, up); o.nB = lerp(-0.30, 0.25, up); o.hA = lerp(0.10, 0.06, up); o.eB = lerp(1.00, -0.30, up); o.eO = lerp(-0.12, 0.10, up); o.t0 = 0.3;
      return o;
    };
    K.gait = { gather: 0.22, flex: 0.52, flexBias: 0.90, flexC: 0.30, flexH: 1.0, pit: 0.11, pitAt: 0.30, pit0: 0.02, bob: 0.030, bobAt: 0, arch: 0.030, my0: -0.004, surge: 0.0,
      fOn: 0.0, fDur: 0.17, sF: 0.05, fLand: 0.105, fSweep: 0.150, fOver: 0.03, fBack: 0.035, fLift: 0.075,
      hOn: 0.27, hDur: 0.22, sH: 0.016, hLand: 0.205, hSweep: 0.345, hBack: 0.05, hTrail: 0.150, hLift: 0.045, splay: 0.024,
      neck: -0.30, neckSw: 0.05, head: 0.18, headLevel: 0.75, ear: 1.05, earSw: 0.10, earOut: -0.10, tail: 0.35, tail1: 0, tailSw: 0.12 };
    return K;
  })();
  F.sp.hare = HARE;

  // ================================================================ the red fox, in the long pale coat it wears in winter
  // Life-size about 70 cm of fox and 43 of brush; drawn a quarter larger (the coat doubles the look of the animal under it).
  const FOX = (() => {
    const S = {
      MID: [0, 0.375, 0.0], HALF: 0.17, blade: 0.10,
      SH: [0.045, 0.335, -0.175], EL: [0.050, 0.225, -0.130], CA: [0.046, 0.085, -0.160], FF: [0.046, 0.022, -0.172], TOEF: [0, -0.008, -0.042],
      HP: [0.050, 0.345, 0.175], ST: [0.058, 0.235, 0.120], HK: [0.052, 0.120, 0.215], HF: [0.052, 0.022, 0.185], TOEH: [0, -0.008, -0.045],
      neck: { base: [0, 0.020, -0.045], l1: 0.075, l2: 0.075, a1: 0.75, a2: 0.60, steady: 0.5 }, headA: -0.12,
      ear: { base: [0.033, 0.042, -0.014], back: 0.10, out: 0.30, len: 0.100, twist: 0.65 },
      tail: { base: [0, -0.015, 0.060], a: [-0.62, -0.40, -0.14], l: [0.14, 0.15, 0.14], follow: 0.6 },
    };
    const Q = quad(S), K = { id: 'fox', Q, NB: QNB, scale: 1.25, tex: [3.4, 0.85, 0.34, -0.37], eyeL: [0.0318, 0.0230, -0.0790, 0.0096], eyeCol: [0.50, 0.24, 0.035], pupil: [0.34, 1.25], soft: 0.016 };
    K.build = function () {
      const P0 = newPose(), bd = Q.solve(P0), J = bd.J, hb = J.hb, HB = J.HB, L = J.legs, T = J.tail;
      K.bind = bd; K.inv = bd.F.map(m => m4.invert(m)); { const e = J.inHd(K.eyeL[0], K.eyeL[1], K.eyeL[2]); K.eye = [e[0], e[1], e[2], K.eyeL[3]]; }
      const earF = [QB.earL, QB.earR].map(i => basis(bd.F[i])), hc = v3.mad(HB, hb.Z, -0.07), tc = v3.lerp(T[0], T[3], 0.5), nk = v3.mad(HB, hb.Z, -0.015);
      const tailD = (x, y, z) => Math.min(cap(x, y, z, T[0], T[1], 0.036, 0.072), cap(x, y, z, T[1], T[2], 0.072, 0.080), cap(x, y, z, T[2], T[3], 0.080, 0.026));
      const toe = L.map(l => v3.lerp(l[3], l[4], 0.8)), ln0 = [0, 0.348, -0.08], ln1 = [0, 0.352, 0.12], mz0 = [0, -0.002, -0.078], mz1 = [0, -0.016, -0.156], ns = [0, -0.0125, -0.1640];
      function f(x, y, z) {
        const ax = Math.abs(x);
        // trunk: deep narrow chest, a waist, light quarters; the neck thick with its ruff
        let d = ell(x, y, z, 0, 0.328, -0.140, 0.060, 0.086, 0.130);
        d = smin(d, cap(x, y, z, ln0, ln1, 0.066, 0.058), 0.06);
        d = smin(d, ell(x, y, z, 0, 0.338, 0.165, 0.064, 0.078, 0.098), 0.05);
        d = smin(d, ell(ax, y, z, 0.050, 0.285, 0.150, 0.034, 0.085, 0.074), 0.035);
        d = smin(d, ell(ax, y, z, 0.044, 0.300, -0.165, 0.030, 0.072, 0.056), 0.03);
        d = smin(d, cap(x, y, z, J.NB, nk, 0.074, 0.058), 0.05);
        if (sph(x, y, z, tc, 0.33) < d + 0.03) { let t = tailD(x, y, z); if (t < 0.03) t -= 0.006 * vnoise3(x * 42, y * 42, z * 26, 11); d = smin(d, t, 0.035); }     // the brush, tufted
        if (sph(x, y, z, hc, 0.21) < d + 0.03) {
          const q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z), aq = Math.abs(q[0]);
          let h = ell(q[0], q[1], q[2], 0, 0.014, -0.048, 0.049, 0.044, 0.058);
          h = smin(h, cap(q[0], q[1], q[2], mz0, mz1, 0.0290, 0.0140), 0.030);                                        // the long fine muzzle
          h = smin(h, ell(aq, q[1], q[2], 0.040, -0.014, -0.030, 0.030, 0.030, 0.038), 0.022);                         // cheek ruff
          h = smin(h, ell(aq, q[1], q[2], 0.0296, 0.0230, -0.0780, 0.0090, 0.0090, 0.0108), 0.004);                   // eye
          h = smin(h, sph(q[0], q[1], q[2], ns, 0.0115), 0.006);                                                       // nose
          d = smin(d, h, 0.03);
          // ears: tall, wide at the root, pointed
          for (const e of earF) { const p = loc(x, y, z, e.o, e.X, e.Y, e.Z), w = 0.033 * (1 - 0.84 * sat(p[1] / 0.102)); d = smin(d, Math.max(Math.abs(p[2] + 0.006 * (1 - Math.abs(p[0]) / 0.033)) - 0.0042, Math.abs(p[0]) - w, -p[1] - 0.012, p[1] - 0.102) - 0.0036, 0.012); }
        }
        let lg = 1e9;
        for (let i = 0; i < 4; i++) {
          const l = L[i]; if (cap(x, y, z, l[0], l[4], i < 2 ? 0.10 : 0.16, i < 2 ? 0.10 : 0.16) > d + 0.04) continue;
          let a;
          if (i < 2) { a = cap(x, y, z, l[0], l[1], 0.038, 0.029); a = smin(a, cap(x, y, z, l[1], l[2], 0.027, 0.0175), 0.014); a = smin(a, cap(x, y, z, l[2], l[3], 0.0175, 0.0165), 0.008); a = smin(a, cap(x, y, z, l[3], toe[i], 0.019, 0.016), 0.008); }
          else { a = cap(x, y, z, l[0], l[1], 0.052, 0.037); a = smin(a, cap(x, y, z, l[1], l[2], 0.035, 0.0185), 0.018); a = smin(a, cap(x, y, z, l[2], l[3], 0.0185, 0.0165), 0.008); a = smin(a, cap(x, y, z, l[3], toe[i], 0.019, 0.016), 0.008); }
          lg = Math.min(lg, a);
        }
        lg = Math.max(lg, -(y - 0.002));
        return smin(d, lg, 0.028);
      }
      const t0 = performance.now(), m = meshSDF(f, [-0.15, -0.006, -0.52], [0.15, 0.66, 0.74], 0.0096, { stride: 2, attr: skyAO(f, 0.02, 0.07) });
      K.meshMs = performance.now() - t0;
      const segs = [], seg = (i, a, b, r, side = 0, k = 1) => segs.push({ i, a, b, r, side, k });
      seg(QB.hips, [0, 0.34, 0.10], [0, 0.34, 0.22], 0.072); seg(QB.spine, [0, 0.345, -0.05], [0, 0.348, 0.06], 0.066); seg(QB.chest, [0, 0.33, -0.21], [0, 0.335, -0.09], 0.070);
      seg(QB.neck1, J.NB, J.NM, 0.058); seg(QB.neck2, J.NM, J.HB, 0.050); seg(QB.head, J.HB, J.inHd(0, -0.012, -0.16), 0.046);
      for (let k = 0; k < 3; k++) seg(QB.tail + k, T[k], T[k + 1], [0.05, 0.068, 0.05][k], 0, 1.6);
      for (let i = 0; i < 4; i++) { const l = L[i], b0 = QB.leg + i * 4, sx = i & 1 ? 1 : -1; if (i < 2) seg(b0, v3.lerp(l[0], l[1], 0.45), l[1], 0.018, sx, 1.8); else seg(b0, v3.lerp(l[0], l[1], 0.25), l[1], 0.036, sx, 1.6); seg(b0 + 1, l[1], l[2], i < 2 ? 0.022 : 0.026, sx); seg(b0 + 2, l[2], l[3], 0.017, sx); seg(b0 + 3, l[3], l[4], 0.017, sx); }
      m.bw = boneWeights(m, segs, K.soft, earOwn(earF, S.ear.len, 0.037, 0.016, 0.018));
      // the coat: orange on the flanks, redder and darker down the spine, grey-white underneath; white from chin to chest; black stockings,
      // black backs to the ears; the brush darker for its black-tipped hairs, and its tip white
      const OR = [0.56, 0.205, 0.045], RED = [0.30, 0.075, 0.018], PALE = [0.62, 0.33, 0.12], WH = [0.80, 0.78, 0.74], BEL = [0.60, 0.57, 0.52], BLK = [0.028, 0.022, 0.020];
      const tl = v3.len(v3.sub(T[3], T[0]));
      m.col = paint(m, (x, y, z, nx, ny, nz, o) => {
        const ax = Math.abs(x), q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z), aq = Math.abs(q[0]), n1 = vnoise3(x * 36, y * 36, z * 22, 3), n2 = vnoise3(x * 80, y * 80, z * 50, 9);
        let c = mixc(OR, PALE, S01(0.34, 0.24, y) * 0.7 + 0.25 * n1), fur = 1;
        c = mixc(c, RED, sat(S01(0.25, 0.9, ny) * S01(0.062, 0.018, ax) * S01(-0.36, -0.22, z) * 0.85 + 0.10 * n2));
        c = mixc(c, BEL, S01(-0.1, -0.65, ny) * S01(0.20, 0.25, y) * S01(0.31, 0.27, y));                                   // under the trunk
        c = mixc(c, WH, S01(-0.105, -0.165, z + 0.02 * n1) * S01(0.50, 0.44, y) * S01(0.05, 0.55, -nz * 0.55 - ny * 0.85) * S01(0.19, 0.23, y));   // chin to chest
        // legs: black stockings, ragged at the top
        c = mixc(c, BLK, S01(0.215, 0.150, y + 0.025 * n1 + (z > 0 ? 0.025 : 0)) * S01(0.245, 0.235, y));
        // the brush
        const td = tailD(x, y, z);
        if (td < 0.02 && z > T[0][2] - 0.02) {
          const t = sat(v3.dot(v3.sub([x, y, z], T[0]), v3.norm(v3.sub(T[3], T[0]))) / tl);
          c = mixc(mixc(OR, RED, 0.35 + 0.3 * n1), BLK, 0.42 * S01(0.25, 0.8, t) * (0.5 + 0.5 * n2) + 0.25 * S01(0.2, 0.9, ny)); c = mixc(c, WH, S01(0.80, 0.87, t + 0.035 * n1));
        }
        // the head: white along the lips and under the jaw, a dark line from eye to nose, the nose black
        if (sph(x, y, z, hc, 0.16) < 0) {
          c = mixc(c, WH, S01(0.000, -0.012, q[1] + 0.006 * n2) * S01(-0.012, -0.045, q[2]) * (1 - S01(0.05, 0.075, y - HB[1] + 0.2)));
          c = mixc(c, WH, 0.9 * S01(-0.004, -0.014, q[1]) * S01(-0.055, -0.085, q[2]));
          c = mixc(c, RED, 0.6 * S01(0.012, 0.005, Math.hypot(aq - 0.021, q[1] - 0.008)) * S01(-0.082, -0.098, q[2]) * S01(-0.150, -0.125, q[2]));
          const nose = S01(0.0135, 0.0105, Math.hypot(q[0], q[1] + 0.0125, q[2] + 0.1640)); c = mixc(c, [0.012, 0.010, 0.010], nose); fur = 1 - 0.85 * nose;
          const e = x < 0 ? earF[0] : earF[1], p = loc(x, y, z, e.o, e.X, e.Y, e.Z);
          if (p[1] > 0.004 && Math.abs(p[0]) < 0.039 && Math.abs(p[2]) < 0.018) {
            c = mixc(c, BLK, S01(0.018, 0.040, p[1] + 0.008 * n1) * S01(-0.002, 0.003, p[2]));                           // the back of the ear
            c = mixc(c, [0.70, 0.62, 0.52], S01(0.001, -0.003, p[2]) * S01(0.006, 0.02, p[1]) * 0.9);                    // the pale fur inside it
          }
        }
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = fur;
      });
      K.mesh = pack([m]); return K.mesh;
    };
    // three ways of going. walk: easy, each foot in its turn (a hind foot, then the fore foot of that side), the head carried low and the brush
    // hanging; jog: the trot it leaves at when nothing presses (v, f: the pace and the strides a second each is drawn for); gait: the gallop it
    // runs for the trees at
    K.walk = { duty: 0.63, lag: 0.25, fMax: 0.32, hMax: 0.32, fMid: 0.008, hMid: 0.0, fLift: 0.040, hLift: 0.034, my0: -0.004, bob: 0.004, bobAt: 0.6, pit0: 0, pit: 0.008, neck: -0.24, nod: 0.035, head: -0.10, tail: -0.22, tail1: -0.08, tail2: 0.08, wag: 0.05, ear: 0, v: 1.1, f: 1.8 };
    K.jog = { duty: 0.48, lag: 0.0, fMax: 0.33, hMax: 0.33, fMid: 0.005, hMid: 0.0, fLift: 0.055, hLift: 0.045, my0: -0.006, bob: 0.007, bobAt: 0.6, pit0: 0, pit: 0.012, neck: -0.20, nod: 0.03, head: -0.12, tail: 0.18, tail1: 0.10, tail2: 0.04, wag: 0.035, ear: 0, v: 2.8, f: 3.2 };
    K.gait = { gather: 0.20, flex: 0.40, flexBias: 0.75, flexC: 0.35, flexH: 0.9, pit: 0.07, pitAt: 0.28, pit0: 0.0, bob: 0.035, bobAt: 0, arch: 0.030, my0: -0.015, surge: 0.0,
      fOn: 0.0, fDur: 0.24, sF: 0.11, fLand: 0.21, fSweep: 0.34, fOver: 0.04, fBack: 0.05, fLift: 0.11,
      hOn: 0.36, hDur: 0.26, sH: 0.09, hLand: 0.20, hSweep: 0.38, hBack: 0.06, hTrail: 0.13, hLift: 0.05, splay: 0.012,
      neck: -0.26, neckSw: 0.05, head: 0.05, headLevel: 0.6, ear: 0.55, earSw: 0.06, earOut: 0.0, tail: 0.62, tail1: 0.40, tailSw: 0.10 };
    // stood where it stopped. yaw: where its head is turned (in its own frame); up: 0 looking idly about .. 1 head high, ears set, watching
    // what is coming; paw: a fore foot held off the snow as it was caught in mid-step (> 0 the right one, < 0 the left)
    K.look = function (yaw, up, paw, o) {
      zeroPose(o); o.nA = lerp(-0.10, 0.22, up); o.nB = lerp(-0.06, 0.20, up); o.hA = lerp(-0.05, 0.10, up); o.hY = yaw; o.eB = -0.08 - 0.10 * up; o.eO = -0.06 * up;
      o.my = 0.004 * up; o.aC = 0.03 * up; o.t0 = lerp(-0.16, 0.08, up); o.t1 = -0.06 * (1 - up); o.t2 = 0.06 * (1 - up); o.lg[0] = 0.02; o.lg[5] = -0.03; o.lg[10] = -0.02; o.lg[15] = 0.03;
      if (paw) { const k = paw > 0 ? 5 : 0, q = Math.abs(paw); o.lg[k] += 0.04 * q; o.lg[k + 1] = 0.10 * q; o.lg[k + 3] = 0.8 * q; }
      return o;
    };
    K.anim = function (p, o) {
      if (o.anim === 'stand') return zeroPose(p);
      if (o.anim === 'walk') return trot(K.walk, o.ph || 0, K.walk.v / K.scale, 1 / K.walk.f, 1, p);
      if (o.anim === 'trot') return trot(K.jog, o.ph || 0, K.jog.v / K.scale, 1 / K.jog.f, 1, p);
      if (o.anim === 'look') return K.look(o.look == null ? 0.7 : o.look, o.up || 0, o.paw || 0, p);
      if (o.anim === 'alert') return K.look(o.look == null ? 0.9 : o.look, 1, o.paw || 0, p);
      return leap(K.gait, o.ph || 0, o.v == null ? 9 : o.v, 1 / (o.freq || 2.9), 1, p);
    };
    return K;
  })();
  F.sp.fox = FOX;

  // ================================================================ the Siberian ibex: a big male, the mountain goat of the Altai, in his pale winter coat
  // Life-size (95 cm at the shoulder), with a metre of ridged horn swept back over the neck, and a beard.
  const IBEX = (() => {
    const S = {
      MID: [0, 0.86, 0.02], HALF: 0.34, blade: 0.12,
      SH: [0.105, 0.74, -0.36], EL: [0.110, 0.52, -0.29], CA: [0.105, 0.25, -0.32], FF: [0.105, 0.045, -0.335], TOEF: [0, -0.02, -0.06],
      HP: [0.105, 0.78, 0.36], ST: [0.120, 0.55, 0.25], HK: [0.110, 0.31, 0.43], HF: [0.110, 0.045, 0.37], TOEH: [0, -0.02, -0.06],
      neck: { base: [0, 0.06, -0.07], l1: 0.17, l2: 0.16, a1: 0.95, a2: 0.80, steady: 0.5 }, headA: -0.38,
      ear: { base: [0.072, 0.058, 0.030], back: 1.05, out: 1.0, len: 0.145, twist: 0.2 },
      tail: { base: [0, 0.03, 0.10], a: [0.25, 0.05, 0.0], l: [0.07, 0.04, 0.03], follow: 0.5 },
    };
    const Q = quad(S), K = { id: 'ibex', Q, NB: QNB, scale: 1.0, tex: [1.5, 1.0, 0.36, -9], eyeL: [0.0590, 0.0240, -0.1050, 0.0135], eyeCol: [0.55, 0.40, 0.12], pupil: [1.7, 0.42], soft: 0.035, hs: 1.2 };
    K.build = function () {
      const P0 = newPose(), bd = Q.solve(P0), J = bd.J, hb = J.hb, HB = J.HB, L = J.legs, T = J.tail;
      const hs = K.hs; K.bind = bd; K.inv = bd.F.map(m => m4.invert(m)); { const e = J.inHd(K.eyeL[0] * hs, K.eyeL[1] * hs, K.eyeL[2] * hs); K.eye = [e[0], e[1], e[2], K.eyeL[3] * hs]; }
      const earF = [QB.earL, QB.earR].map(i => basis(bd.F[i])), hc = J.inHd(0, -0.07, -0.14), nk = v3.mad(HB, hb.Z, -0.03), toe = L.map(l => v3.lerp(l[3], l[4], 0.7));
      const ln0 = [0, 0.772, -0.10], ln1 = [0, 0.772, 0.22], mn0 = [0, 0.66, -0.50], mn1 = v3.mad(HB, [0, -1, 0.3], 0.10), fc0 = [0, -0.022, -0.130], fc1 = [0, -0.060, -0.245], bd0 = [0, -0.098, -0.196], bd1 = [0, -0.205, -0.174];
      function f(x, y, z) {
        const ax = Math.abs(x);
        // trunk: a barrel on short strong legs; high withers, a thick neck with a mane under it
        let d = ell(x, y, z, 0, 0.722, -0.220, 0.186, 0.252, 0.300);
        d = smin(d, cap(x, y, z, ln0, ln1, 0.208, 0.188), 0.10);
        d = smin(d, ell(x, y, z, 0, 0.752, 0.330, 0.176, 0.218, 0.215), 0.08);
        d = smin(d, ell(x, y, z, 0, 0.935, -0.250, 0.060, 0.065, 0.170), 0.08);
        d = smin(d, ell(ax, y, z, 0.108, 0.630, 0.325, 0.076, 0.200, 0.150), 0.06);
        d = smin(d, ell(ax, y, z, 0.108, 0.680, -0.335, 0.070, 0.180, 0.120), 0.05);
        d = smin(d, cap(x, y, z, J.NB, nk, 0.160, 0.112), 0.09);
        d = smin(d, cap(x, y, z, mn0, mn1, 0.088, 0.060), 0.06);                                                       // the mane of the throat
        d = smin(d, cap(x, y, z, T[0], T[2], 0.036, 0.022), 0.03);
        if (sph(x, y, z, hc, 0.37) < d + 0.05) {
          const q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z); q[0] /= hs; q[1] /= hs; q[2] /= hs; const aq = Math.abs(q[0]);
          let h = ell(q[0], q[1], q[2], 0, 0.000, -0.070, 0.066, 0.078, 0.100);
          h = smin(h, cap(q[0], q[1], q[2], fc0, fc1, 0.054, 0.037), 0.05);                                             // the long straight face
          h = smin(h, ell(q[0], q[1], q[2], 0, 0.058, -0.060, 0.050, 0.035, 0.060), 0.03);                             // the boss the horns grow from
          h = smin(h, ell(aq, q[1], q[2], 0.0550, 0.0240, -0.1040, 0.0125, 0.0125, 0.0150), 0.006);                    // eye
          h = smin(h, cap(q[0], q[1], q[2], bd0, bd1, 0.033, 0.019), 0.025);                                            // beard: a short thick tuft under the chin
          d = smin(d, h * hs, 0.05);
          for (const e of earF) { const p = loc(x, y, z, e.o, e.X, e.Y, e.Z); d = smin(d, ell(p[0], p[1], p[2], 0, 0.070, 0, 0.034, 0.078, 0.018), 0.02); }
        }
        let lg = 1e9;
        for (let i = 0; i < 4; i++) {
          const l = L[i]; if (cap(x, y, z, l[0], l[4], i < 2 ? 0.17 : 0.24, i < 2 ? 0.17 : 0.24) > d + 0.06) continue;
          let a;
          if (i < 2) { a = cap(x, y, z, l[0], l[1], 0.090, 0.064); a = smin(a, cap(x, y, z, l[1], l[2], 0.058, 0.038), 0.03); a = smin(a, sph(x, y, z, l[2], 0.043), 0.02); a = smin(a, cap(x, y, z, l[2], l[3], 0.035, 0.033), 0.015); }
          else { a = cap(x, y, z, l[0], l[1], 0.115, 0.078); a = smin(a, cap(x, y, z, l[1], l[2], 0.072, 0.040), 0.04); a = smin(a, sph(x, y, z, l[2], 0.045), 0.02); a = smin(a, cap(x, y, z, l[2], l[3], 0.036, 0.033), 0.015); }
          a = smin(a, cap(x, y, z, l[3], toe[i], 0.043, 0.038), 0.015);                                                  // hoof
          lg = Math.min(lg, a);
        }
        lg = Math.max(lg, -(y - 0.004));
        return smin(d, lg, 0.05);
      }
      const t0 = performance.now(), m = meshSDF(f, [-0.33, -0.012, -0.98], [0.33, 1.34, 0.72], 0.0205, { stride: 2, attr: skyAO(f, 0.04, 0.14) });
      K.meshMs = performance.now() - t0;
      const segs = [], seg = (i, a, b, r, side = 0, k = 1) => segs.push({ i, a, b, r, side, k });
      seg(QB.hips, [0, 0.78, 0.22], [0, 0.78, 0.46], 0.19); seg(QB.spine, [0, 0.79, -0.10], [0, 0.79, 0.12], 0.19); seg(QB.chest, [0, 0.75, -0.44], [0, 0.76, -0.20], 0.20);
      seg(QB.neck1, J.NB, J.NM, 0.13); seg(QB.neck2, J.NM, J.HB, 0.10); seg(QB.head, J.HB, J.inHd(0, -0.07, -0.31), 0.085); seg(QB.tail, T[0], T[2], 0.03);
      for (let i = 0; i < 4; i++) { const l = L[i], b0 = QB.leg + i * 4, sx = i & 1 ? 1 : -1; if (i < 2) seg(b0, v3.lerp(l[0], l[1], 0.5), l[1], 0.04, sx, 1.6); else seg(b0, v3.lerp(l[0], l[1], 0.3), l[1], 0.075, sx, 1.4); seg(b0 + 1, l[1], l[2], 0.05, sx); seg(b0 + 2, l[2], l[3], 0.035, sx); seg(b0 + 3, l[3], l[4], 0.04, sx); }
      // (the beard hangs from the chin and from nothing else: left to the nearest bones its tip would stay behind with the throat when the head turns)
      const earO = earOwn(earF, S.ear.len, 0.042, 0.026, 0.03), own = (x, y, z, res) => {
        const q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z); q[0] /= hs; q[1] /= hs; q[2] /= hs;
        if (q[1] < -0.082 && cap(q[0], q[1], q[2], bd0, bd1, 0.033, 0.019) < 0.014) { res[0] = QB.head; res[1] = QB.head; res[2] = 1; return true; }
        return earO(x, y, z, res);
      };
      m.bw = boneWeights(m, segs, K.soft, own);
      // winter coat: straw to grey-brown, a dark line down the spine and dark on chest, shoulder and the fronts of the legs; old males carry
      // a pale saddle; belly and the backs of the legs off-white; face dark down the front; beard and tail nearly black
      const TAN = [0.128, 0.090, 0.060], PALE = [0.36, 0.31, 0.235], DARK = [0.034, 0.025, 0.019], BEL = [0.33, 0.29, 0.23], BLK = [0.020, 0.017, 0.015], HOOF = [0.030, 0.026, 0.024];
      m.col = paint(m, (x, y, z, nx, ny, nz, o) => {
        const ax = Math.abs(x), q = loc(x, y, z, HB, hb.X, hb.Y, hb.Z), n1 = vnoise3(x * 14, y * 14, z * 9, 3), n2 = vnoise3(x * 40, y * 40, z * 26, 9); q[0] /= hs; q[1] /= hs; q[2] /= hs;
        let c = mixc(TAN, PALE, 0.04 + 0.16 * n1), fur = 1;
        c = mixc(c, PALE, 0.85 * S01(0.76, 0.93, y + 0.04 * n1) * S01(-0.18, -0.03, z) * S01(0.32, 0.12, z) * S01(0.015, 0.06, ax));                 // saddle
        c = mixc(c, DARK, 0.85 * S01(0.4, 0.95, ny) * S01(0.060, 0.012, ax + 0.012 * n2) * S01(-0.72, -0.5, z));                                      // the line of the spine
        c = mixc(c, DARK, 0.8 * S01(0.80, 0.58, y + 0.05 * n1) * S01(-0.14, -0.30, z) * S01(0.50, 0.58, y));                                           // chest and shoulder
        c = mixc(c, DARK, 0.7 * S01(0.07, 0.02, cap(x, y, z, mn0, mn1, 0.088, 0.060)) * S01(-0.40, -0.50, z));                         // the mane of the throat
        c = mixc(c, DARK, 0.7 * S01(0.66, 0.56, y + 0.04 * n1) * S01(-0.10, 0.02, z) * S01(0.24, 0.10, z) * S01(0.10, 0.16, ax) * S01(0.50, 0.56, y)); // a dark band along the flank above the belly
        c = mixc(c, BEL, S01(-0.2, -0.7, ny) * S01(0.50, 0.58, y) * S01(0.66, 0.60, y) * S01(-0.32, -0.20, z));
        // legs: dark in front, pale behind; hooves
        if (y < 0.52) { const front = z < 0 ? S01(0.1, -0.5, nz) : S01(0.3, -0.4, nz); c = mixc(mixc(BEL, TAN, 0.5), DARK, 0.4 + 0.6 * front); c = mixc(c, HOOF, S01(0.085, 0.065, y)); if (y < 0.075) fur = 0.35; }
        c = mixc(c, BEL, 0.8 * S01(0.30, 0.44, z) * S01(0.66, 0.74, y) * S01(0.92, 0.84, y) * S01(0.3, 0.8, nz));               // the pale patch of the rump
        if (sph(x, y, z, hc, 0.36) < 0) {
          c = mixc(c, PALE, 0.5 * S01(0.02, 0.05, Math.abs(q[0])) * S01(-0.04, -0.10, q[2]) * S01(-0.10, -0.05, q[1]));                                                          // cheeks
          c = mixc(c, DARK, 0.75 * S01(0.035, 0.012, Math.abs(q[0]) + 0.01 * n2) * S01(-0.07, -0.11, q[2]) * S01(-0.2, 0.4, -q[1] * 6 + ny));          // down the front of the face
          c = mixc(c, BEL, 0.55 * S01(-0.20, -0.235, q[2]) * S01(-0.02, -0.05, q[1]));                                                                // pale round the mouth
          c = mixc(c, BLK, S01(-0.088, -0.112, q[1]) * S01(-0.11, -0.15, q[2]) * S01(-0.25, -0.215, q[2]) * S01(0.05, 0.03, Math.abs(q[0])));         // beard
          const nose = S01(0.036, 0.026, Math.hypot(q[0] * 0.8, q[1] + 0.045, q[2] + 0.275)); c = mixc(c, [0.03, 0.025, 0.025], nose); fur *= 1 - 0.8 * nose;
        }
        c = mixc(c, BLK, S01(0.05, 0.02, Math.min(cap(x, y, z, T[0], T[2], 0.036, 0.022), 1)) * S01(0.38, 0.44, z));
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = fur;
      });
      // horns: scimitars, each an arc of more than a right angle rising from the brow and sweeping back over the neck, knotted down the front
      const horns = [-1, 1].map(sx => {
        const R = 0.42, th0 = -0.12, TH = 2.25, base = [sx * 0.034 * hs, 0.066 * hs, -0.052 * hs];
        const h = surf(72, 10, (u, v, o) => {
          const th = th0 + TH * u, c = Math.cos(th), sn = Math.sin(th), ph = TAU * v, r = lerp(0.041, 0.006, Math.pow(u, 0.85)) * (u < 0.03 ? 0.6 + u * 13.3 : 1);
          const ridge = Math.pow(0.5 + 0.5 * Math.cos(TAU * 20 * u), 3) * S01(0.02, 0.08, u) * S01(0.98, 0.8, u);
          // ring: `a` across the arc (out from its centre: the front of the horn), `b` sideways
          const ca = Math.cos(ph), sb = Math.sin(ph), ra = r * 1.28 * (1 + 0.22 * ridge * Math.max(0, ca)), rb = r * 0.86 * (1 + 0.10 * ridge * Math.max(0, ca));
          const lx = base[0] + sx * 0.19 * Math.pow(u, 1.4) + sb * rb, ly = base[1] + R * (sn - Math.sin(th0)) + ra * ca * sn, lz = base[2] + R * (Math.cos(th0) - c) - ra * ca * c;
          const w = J.inHd(lx, ly, lz); o[0] = w[0]; o[1] = w[1]; o[2] = w[2];
        }, true, sx < 0, 1);
        h.bw = rigid(h, QB.head);
        h.col = new Float32Array(h.nv * 4); for (let i = 0; i < h.nv; i++) { const u = h.verts[i * 10 + 8], rd = Math.pow(0.5 + 0.5 * Math.cos(TAU * 20 * u), 3), k = 0.6 + 0.4 * vnoise3(u * 30, h.verts[i * 10 + 9] * 5, sx, 5); h.col.set([lerp(0.075, 0.17, rd) * k, lerp(0.060, 0.14, rd) * k, lerp(0.045, 0.105, rd) * k, 0], i * 4); }
        return h;
      });
      K.mesh = pack([m, horns[0], horns[1]]); return K.mesh;
    };
    K.walk = { duty: 0.62, lag: 0.22, fMax: 0.50, hMax: 0.50, fMid: 0.0, hMid: 0.0, fLift: 0.09, hLift: 0.07, my0: -0.004, bob: 0.008, bobAt: 0.6, pit0: 0, pit: 0.010, neck: -0.10, nod: 0.05, head: 0.0, tail: 0.0, tail1: 0, tail2: 0, wag: 0.0, ear: 0 };
    // the bound of a goat going up a mountain: all four legs almost straight, the fore pair and the hind pair landing close together, the
    // whole animal thrown up off the snow and coming down stiff
    K.gait = { gather: 0.16, flex: 0.20, flexBias: 0.6, flexC: 0.45, flexH: 0.8, pit: 0.10, pitAt: 0.30, pit0: 0.03, bob: 0.085, bobAt: -0.5, arch: 0.02, my0: 0.01, surge: 0.0,
      fOn: 0.0, fDur: 0.26, sF: 0.05, fLand: 0.30, fSweep: 0.52, fOver: 0.06, fBack: 0.06, fLift: 0.16,
      hOn: 0.20, hDur: 0.30, sH: 0.04, hLand: 0.24, hSweep: 0.56, hBack: 0.05, hTrail: 0.14, hLift: 0.05, splay: 0.01,
      neck: -0.12, neckSw: 0.06, head: 0.10, headLevel: 0.5, ear: 0.2, earSw: 0.08, earOut: 0, tail: 0.9, tail1: 0.3, tailSw: 0.1 };
    // standing, watching: head carried high and turned to look (yaw), weight shifting a little as it breathes (t), alert 0..1
    K.stand = function (yaw, alert, t, o) {
      zeroPose(o); const br = Math.sin(t * 1.7);
      o.my = 0.004 * br; o.aC = 0.012 * br + 0.03 * alert; o.nA = 0.10 + 0.16 * alert; o.nB = 0.08 + 0.14 * alert; o.hA = 0.10 + 0.10 * alert; o.hY = yaw * 0.85; o.nY = yaw * 0.15;
      o.eB = -0.35 * alert + 0.25 * Math.max(0, Math.sin(t * 0.9 + 1)) ** 8; o.eL = 0.5 * Math.max(0, Math.sin(t * 1.3)) ** 12; o.t0 = 0.5 * Math.max(0, Math.sin(t * 2.1 + 2)) ** 6;
      o.lg[0] = 0.03; o.lg[5] = -0.04; o.lg[10] = -0.05; o.lg[15] = 0.04; return o;
    };
    K.anim = function (p, o) {
      if (o.anim === 'stand') return zeroPose(p);
      if (o.anim === 'watch') return K.stand(o.look == null ? 1.1 : o.look, o.alert == null ? 1 : o.alert, o.t || 0, p);
      if (o.anim === 'walk') return trot(K.walk, o.ph || 0, o.v == null ? 1.3 : o.v, 1 / (o.freq || 1.1), 1, p);
      return leap(K.gait, o.ph || 0, o.v == null ? 8 : o.v, 1 / (o.freq || 2.2), 1, p);
    };
    return K;
  })();
  F.sp.ibex = IBEX;
  for (const id in F.sp) { const K = F.sp[id]; K.solve = K.Q.solve; K.mid = K.Q.S.MID; }

  // ================================================================ the golden eagle: a young bird, chocolate brown, with the white windows in its
  // wings and the white, black-ended tail of its first winters (the plumage that reads farthest over snow). Life-size: 2.15 m across the wings.
  // The body is a distance field like the others. No grid could hold a feather, so wings and tail are sheets with an upper and an under side:
  // the inner wing one sheet with its feathers drawn on it, the ten long feathers of each hand and the fan of the tail cut to their own outlines.
  const EAGLE = (() => {
    const EB = { body: 0, head: 1, tail: 2, wing: 3 }, ENB = 11;                           // wings: left 3..6, right 7..10 (arm, forearm, hand, the ends of the long feathers)
    const SH = [0.085, 0.035, -0.105], EL = [0.285, 0.040, -0.085], WR = [0.555, 0.040, -0.150], HE = [0.735, 0.036, -0.112], NK = [0, 0.028, -0.165], TL = [0, 0.004, 0.205];
    const K = { id: 'eagle', NB: ENB, scale: 1.0, mid: [0, 0, 0], tex: [3.0, 0.7, 0.2, -9], eye: [0.0300, 0.0500, -0.2640, 0.0088], eyeCol: [0.34, 0.20, 0.05], pupil: [0.62, 0.62], soft: 0.022 };
    // a wing bone turned from where it lies spread: raised (a), swept back (s), its leading edge twisted up (w). sx: which wing
    const rot = (sx, a, s, w) => {
      const cw = Math.cos(w), sw = Math.sin(w), th = -sx * s, cs = Math.cos(th), ss = Math.sin(th), ph = sx * a, ca = Math.cos(ph), sa = Math.sin(ph);
      const col = (x, y, z) => { const x1 = x * cs + z * ss, z1 = -x * ss + z * cs; return [x1 * ca - y * sa, x1 * sa + y * ca, z1]; };
      return [col(1, 0, 0), col(0, cw, sw), col(0, -sw, cw)];
    };
    const app = (R, v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
    // pose: by the body lifted; hY, hA the head turned (to its right) and raised; tP, tR the tail lifted and twisted; a1..a3 arm, forearm and hand
    // raised, a4 the long feathers bent up beyond the hand; s1..s3 swept back; w1..w3 twisted
    K.solve = function (p) {
      const g = k => p[k] || 0, Fm = new Array(ENB), J = { w: [] }, B = [0, g('by'), 0];
      Fm[EB.body] = m4.fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1], B);
      { const f = turn(ahead(g('hA')), g('hY')), X = turn([1, 0, 0], g('hY')), Z = v3.mul(f, -1); Fm[EB.head] = m4.fromBasis(X, v3.cross(Z, X), Z, v3.add(NK, B)); }
      { const a = g('tP'), r = g('tR'), Y0 = [0, Math.cos(a), -Math.sin(a)], c = Math.cos(r), s = Math.sin(r); Fm[EB.tail] = m4.fromBasis([c, s * Y0[1], s * Y0[2]], [-s, c * Y0[1], c * Y0[2]], [0, Math.sin(a), Math.cos(a)], v3.add(TL, B)); }
      for (const sx of [-1, 1]) {
        const b0 = EB.wing + (sx > 0 ? 4 : 0), mr = v => [sx * v[0], v[1], v[2]];
        const R1 = rot(sx, g('a1'), g('s1'), g('w1')), R2 = rot(sx, g('a2'), g('s2'), g('w2')), R3 = rot(sx, g('a3'), g('s3'), g('w3')), R4 = rot(sx, g('a3') + g('a4'), g('s3'), g('w3'));
        const j0 = v3.add(mr(SH), B), j1 = v3.add(j0, app(R1, mr(v3.sub(EL, SH)))), j2 = v3.add(j1, app(R2, mr(v3.sub(WR, EL)))), j3 = v3.add(j2, app(R3, mr(v3.sub(HE, WR))));
        Fm[b0] = m4.fromBasis(R1[0], R1[1], R1[2], j0); Fm[b0 + 1] = m4.fromBasis(R2[0], R2[1], R2[2], j1); Fm[b0 + 2] = m4.fromBasis(R3[0], R3[1], R3[2], j2); Fm[b0 + 3] = m4.fromBasis(R4[0], R4[1], R4[2], j3);
        J.w.push([j0, j1, j2, j3]);
      }
      return { J, F: Fm };
    };
    // the wings. ph: where in the beat (0 the top of the stroke, 0.5 the bottom); amp: how much of a beat there is (0: held out, gliding); tuck:
    // drawn half in, for speed. A beat runs out along the wing as a wave: the arm leads, the hand follows it, the long feathers bend to the air;
    // coming up, the wrist folds and the hand trails
    K.fly = function (p, ph, amp, tuck, o) {
      o = o || {};
      const w = TAU * ph, ps = w + 0.25 * Math.sin(w), up = Math.pow(Math.max(0, -Math.sin(ps - 0.35)), 1.2) * amp, g = 1 - amp, tk = tuck || 0;
      p.a1 = 0.07 + 0.05 * amp + amp * 0.50 * Math.cos(ps) + 0.12 * tk; p.a2 = 0.10 + 0.05 * amp + amp * 0.66 * Math.cos(ps - 0.45) - 0.14 * tk; p.a3 = 0.15 * g + 0.05 * amp + amp * 0.84 * Math.cos(ps - 0.95) - 0.34 * tk;
      p.a4 = 0.20 * g + amp * (0.10 + 0.42 * Math.sin(ps - 0.75)) - 0.12 * tk;
      p.s1 = 0.34 * up + 0.42 * tk; p.s2 = -0.30 * up - 0.38 * tk; p.s3 = 0.80 * up + 0.85 * tk;
      p.w1 = -0.06 * amp * Math.sin(ps); p.w2 = -0.14 * amp * Math.sin(ps) + 0.10 * up; p.w3 = -0.30 * amp * Math.sin(ps - 0.3) + 0.22 * up;
      p.by = -0.035 * amp * Math.cos(ps - 0.5); p.tP = 0.05 * amp * Math.cos(ps - 0.3) + (o.tP || 0); p.tR = o.tR || 0; p.hY = o.hY || 0; p.hA = o.hA || 0;
      return p;
    };
    K.anim = (p, o) => o.anim === 'glide' || o.anim === 'stand' ? K.fly(p, 0, 0, 0, o) : o.anim === 'tuck' ? K.fly(p, 0, 0, o.k == null ? 1 : o.k, o) : K.fly(p, o.ph || 0, o.amp == null ? 1 : o.amp, 0, o);
    K.build = function () {
      const bd = K.solve({}); K.bind = bd; K.inv = bd.F.map(m => m4.invert(m));
      const nk0 = [0, 0.018, -0.145], nk1 = [0, 0.040, -0.225], bk0 = [0, 0.041, -0.284], bk1 = [0, 0.032, -0.322], bk2 = [0, 0.012, -0.332], lb0 = [0, 0.022, -0.285], lb1 = [0, 0.019, -0.316];
      function f(x, y, z) {
        const ax = Math.abs(x);
        let d = ell(x, y, z, 0, 0.0, 0.0, 0.092, 0.084, 0.215);
        d = smin(d, ell(x, y, z, 0, -0.006, -0.085, 0.084, 0.086, 0.120), 0.05);                        // the deep chest
        d = smin(d, ell(x, y, z, 0, 0.002, 0.185, 0.062, 0.042, 0.105), 0.05);                          // rump, and the coverts over the root of the tail
        d = smin(d, cap(x, y, z, nk0, nk1, 0.060, 0.046), 0.05);
        // head: flat-crowned, with the heavy brow that gives the look, and the hooked bill
        if (z < -0.15) {
          let h = ell(x, y, z, 0, 0.046, -0.248, 0.039, 0.036, 0.050);
          h = smin(h, ell(ax, y, z, 0.023, 0.0620, -0.262, 0.018, 0.0065, 0.023), 0.008);
          h = smin(h, ell(ax, y, z, 0.0285, 0.0500, -0.264, 0.0090, 0.0090, 0.0105), 0.004);
          h = smin(h, cap(x, y, z, bk0, bk1, 0.0185, 0.0115), 0.012); h = smin(h, cap(x, y, z, bk1, bk2, 0.0105, 0.0060), 0.006); h = smin(h, cap(x, y, z, lb0, lb1, 0.012, 0.007), 0.006);
          d = smin(d, h, 0.03);
        }
        // the feathered legs drawn up under the tail, the feet closed
        if (y < 0.03 && z > -0.08) { let l = ell(ax, y, z, 0.045, -0.060, 0.085, 0.036, 0.040, 0.085); l = smin(l, ell(ax, y, z, 0.040, -0.066, 0.200, 0.019, 0.015, 0.040), 0.02); d = smin(d, l, 0.035); }
        // the arm of the wing under its coverts
        if (ax > 0.03 && z < 0.03) { let a = cap(ax, y, z, SH, EL, 0.040, 0.031); a = smin(a, cap(ax, y, z, EL, WR, 0.031, 0.022), 0.03); a = smin(a, cap(ax, y, z, WR, HE, 0.022, 0.012), 0.02); d = smin(d, a, 0.04); }
        return d;
      }
      const t0 = performance.now(), m = meshSDF(f, [-0.78, -0.125, -0.36], [0.78, 0.125, 0.32], 0.0095, { stride: 2, attr: skyAO(f, 0.02, 0.06) });
      K.meshMs = performance.now() - t0;
      const segs = [], seg = (i, a, b, r, side = 0, k = 1) => segs.push({ i, a, b, r, side, k });
      seg(EB.body, [0, 0, -0.12], [0, 0, 0.22], 0.085); seg(EB.head, [0, 0.036, -0.20], [0, 0.03, -0.33], 0.040);
      for (const sx of [-1, 1]) { const b0 = EB.wing + (sx > 0 ? 4 : 0), mr = v => [sx * v[0], v[1], v[2]]; seg(b0, mr(v3.lerp(SH, EL, 0.35)), mr(EL), 0.03, sx, 1.3); seg(b0 + 1, mr(EL), mr(WR), 0.026, sx, 1.3); seg(b0 + 2, mr(WR), mr(HE), 0.017, sx); }
      m.bw = boneWeights(m, segs, K.soft);
      const BRN = [0.058, 0.038, 0.026], DRK = [0.028, 0.021, 0.018], TAW = [0.210, 0.135, 0.068], GOLD = [0.33, 0.21, 0.085], WHT = [0.78, 0.76, 0.72], YEL = [0.68, 0.48, 0.05];
      m.col = paint(m, (x, y, z, nx, ny, nz, o) => {
        const ax = Math.abs(x), n1 = vnoise3(x * 34, y * 34, z * 22, 3), n2 = vnoise3(x * 90, y * 90, z * 60, 9);
        let c = mixc(BRN, DRK, 0.2 + 0.5 * n1), fur = 1;
        c = mixc(c, TAW, 0.5 * S01(0.0, -0.9, ny) * S01(-0.02, 0.10, z) * (0.5 + 0.5 * n2));                                           // paler under the tail and on the legs
        c = mixc(c, TAW, (0.25 + 0.55 * n2) * S01(0.11, 0.16, ax) * S01(-0.3, 0.5, ny));                                               // the pale bar across the coverts
        c = mixc(c, mixc(TAW, BRN, 0.5), 0.6 * S01(0.11, 0.16, ax) * S01(0.2, -0.5, ny));
        c = mixc(c, WHT, 0.85 * S01(0.215, 0.26, z + 0.02 * n1) * S01(-0.02, 0.01, y));                                                 // the white of the tail begins under its coverts
        c = mixc(c, GOLD, sat(S01(0.028, 0.060, y + 0.012 * n2) * S01(-0.288, -0.262, z) * S01(-0.10, -0.165, z) * (0.75 + 0.5 * n1)));   // crown and nape
        c = mixc(c, DRK, 0.6 * S01(-0.262, -0.280, z) * S01(0.06, 0.03, y) * S01(-0.3, -0.283, z));
        if (z < -0.287 && y < 0.068 && ax < 0.024) { c = mixc(mixc(YEL, [0.5, 0.36, 0.06], 0.3), mixc([0.13, 0.13, 0.15], [0.012, 0.012, 0.015], S01(-0.304, -0.326, z)), S01(-0.296, -0.306, z)); fur = 0.3; }      // the bill: yellow at its root, horn, black at the hook
        if (z > 0.165 && y < -0.045) { c = mixc(c, YEL, S01(0.17, 0.185, z)); fur = 0.35; }
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = fur;
      });
      const parts = [m], NF = 13, tipK = t => 1 - Math.pow(Math.abs(2 * (t % 1) - 1), 2.6), edgeK = t => Math.pow(Math.abs(2 * (t % 1) - 1), 7), cols = (h, fn) => { h.col = new Float32Array(h.nv * 4); const o = [0, 0, 0, 0.5]; for (let i = 0; i < h.nv; i++) { o[3] = 0.5; fn(h.verts[i * 10 + 8], h.verts[i * 10 + 9], o, h.verts, i * 10); h.col.set(o, i * 4); } };
      const put = (o, c, k) => { o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; };
      for (const sx of [-1, 1]) for (const low of [0, 1]) {
        const b0 = EB.wing + (sx > 0 ? 4 : 0), flip = (sx > 0) !== !!low;
        // the inner wing: thirteen secondaries and the coverts over them
        // (in section it is a wing: thick where the bones run, a sixth of the way back from the leading edge, and thinning to the feathers' edge)
        const inner = surf(NF * 4 + 1, 12, (u, v0, o) => {
          const v = Math.pow(v0, 1.5), zl = lerp(-0.118, -0.170, u) - 0.014 * Math.sin(PI * u), zt = 0.112 + 0.066 * Math.sin(PI * sat(0.10 + 0.84 * u)) + 0.025 * u - 0.017 * (1 - tipK(u * NF + 0.5)) * (u < 0.999 ? 1 : 0);
          const r = lerp(0.044, 0.024, u) + 0.004, th = v < 0.16 ? Math.sqrt(v / 0.16) : low ? Math.pow(Math.max(0, 1 - (v - 0.16) / 0.5), 1.5) : Math.pow(1 - (v - 0.16) / 0.84, 1.6);
          o[0] = sx * lerp(0.050, 0.590, u); o[2] = lerp(zl, zt, v); o[1] = 0.040 - 0.036 * v * v + (low ? -r * th - 0.0015 : r * th);
        }, false, flip, 2);
        inner.bw = new Float32Array(inner.nv * 4);
        for (let i = 0; i < inner.nv; i++) { const u = inner.verts[i * 10 + 8], k = i * 4; if (u < 0.72) { inner.bw[k] = b0; inner.bw[k + 1] = b0 + 1; inner.bw[k + 2] = 1 - S01(0.30, 0.56, u); } else { inner.bw[k] = b0 + 1; inner.bw[k + 1] = b0 + 2; inner.bw[k + 2] = 1 - S01(0.84, 1.10, u); } }
        cols(inner, (u, v0, o) => {
          const v = Math.pow(v0, 1.5), n = vnoise3(u * 40, v * 9, sx + low * 3, 5), fl = S01(0.40, 0.46, v), e = edgeK(u * NF + 0.5) * fl;
          let c = low ? mixc(mixc(BRN, TAW, 0.35 + 0.4 * n), [0.060, 0.050, 0.045], fl) : mixc(mixc(BRN, TAW, (0.25 + 0.6 * n) * S01(0.10, 0.18, v) * S01(0.42, 0.34, v) * S01(0.04, 0.16, u)), DRK, fl);
          c = mixc(c, WHT, (low ? 0.92 : 0.8) * S01(low ? 0.50 : 0.70, low ? 0.66 : 0.86, u + 0.05 * n) * fl * S01(low ? 0.86 : 0.76, low ? 0.74 : 0.66, v));
          put(o, c, (1 - 0.45 * e) * (0.85 + 0.3 * n));
        });
        parts.push(inner);
        // the hand: ten primaries, the outer six cut away toward their tips so that they stand apart like fingers
        for (let q = 0; q < 10; q++) {
          const t = q / 9, an = lerp(1.50, 0.10, Math.pow(t, 0.85)), dx = Math.cos(an), dz = Math.sin(an), L = lerp(0.300, 0.440, S01(0, 0.62, t)) - 0.060 * S01(0.72, 1.0, t), fing = S01(3, 5, q), B = v3.lerp(WR, HE, t);
          const fe = surf(9, 3, (u, v, o) => {
            const c = 2 * v - 1, hw = 0.036 * lerp(1, 0.50, S01(0.36, 0.56, u) * fing) * Math.sqrt(sat((1.025 - u) / 0.10)) * (0.5 + 0.5 * S01(0, 0.12, u)), along = u * L - 0.025, across = c * hw + 0.040 * u * u * fing;
            o[0] = sx * (B[0] + dx * along - dz * across); o[2] = B[2] + 0.014 + dz * along + dx * across; o[1] = 0.034 - 0.0012 * q - 0.004 * c * c - (low ? 0.0012 : 0);
          }, false, flip, 2);
          fe.bw = new Float32Array(fe.nv * 4);
          for (let i = 0; i < fe.nv; i++) { fe.bw[i * 4] = b0 + 2; fe.bw[i * 4 + 1] = b0 + 3; fe.bw[i * 4 + 2] = 1 - 0.92 * S01(0.12, 1.0, fe.verts[i * 10 + 8]) * S01(0.2, 0.6, t); }
          cols(fe, (u, v, o) => { const mid = 1 - Math.abs(2 * v - 1), c = mixc(low ? [0.055, 0.047, 0.043] : DRK, WHT, (low ? 0.92 : 0.8) * S01(low ? 0.52 : 0.44, low ? 0.36 : 0.28, u) * S01(low ? 7 : 6, low ? 5 : 4, q)); put(o, c, 0.78 + 0.5 * mid); });
          parts.push(fe);
        }
      }
      // the tail: twelve feathers in a fan, white with a broad black end
      for (const low of [0, 1]) {
        const tl = surf(10, 37, (u, v, o) => {
          const a = 2 * v - 1, an = a * 0.46, L = 0.335 - 0.030 * a * a - 0.013 * (1 - tipK(v * 12)) * Math.pow(u, 4), r = 0.07 + u * L;
          o[0] = Math.sin(an) * r; o[2] = 0.150 + Math.cos(an) * r; o[1] = 0.006 - 0.014 * a * a - (low ? 0.004 * Math.sin(PI * Math.min(1, u * 1.3)) + 0.001 : 0);
        }, false, !!low, 2);
        tl.bw = new Float32Array(tl.nv * 4); for (let i = 0; i < tl.nv; i++) { tl.bw[i * 4] = EB.tail; tl.bw[i * 4 + 1] = EB.body; tl.bw[i * 4 + 2] = S01(0.0, 0.30, tl.verts[i * 10 + 8]); }
        cols(tl, (u, v, o) => { const n = vnoise3(v * 30, u * 6, low, 7); let c = mixc(mixc(BRN, TAW, 0.4), WHT, S01(0.06, 0.20, u)); c = mixc(c, DRK, S01(0.56, 0.68, u + 0.03 * n)); c = mixc(c, [0.30, 0.27, 0.22], S01(0.955, 1.0, u)); put(o, c, (1 - 0.35 * edgeK(v * 12) * S01(0.15, 0.4, u))); });
        parts.push(tl);
      }
      K.mesh = pack(parts); return K.mesh;
    };
    return K;
  })();
  F.sp.eagle = EAGLE;

  // ================================================================ on the GPU
  F.init = function (g) {
    gfx = g; const t0 = performance.now();
    for (const id in F.sp) { const K = F.sp[id], m = K.mesh || K.build(); K.vb = gfx.buffer(m.V, 'vertex'); K.vb2 = gfx.buffer(m.W, 'vertex'); K.vb3 = gfx.buffer(m.C, 'vertex'); K.ib = gfx.buffer(m.I, 'index'); K.count = m.ni; F.stats[id] = { ms: Math.round(K.meshMs), verts: m.nv, tris: m.ni / 3 }; }
    F.stats.ms = Math.round(performance.now() - t0);
    boneTex = gfx.texture({ w: 4, h: ROWS, format: 'rgba32f', filter: 'nearest' });
    const buffers = [{ attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['mat', 'vec4f']] }, { attrs: [['bw', 'vec4f']] }, { attrs: [['col', 'vec4f']] }];
    // (into the sun's map each animal goes where it stands: the snow takes a shadow from its feet up. Its own coat keeps 37 cm of clear air
    // toward the sun (the bias of its shadowAt below), as it had when it was drawn a metre and a half nearer the sun here)
    // p = (first row of this animal's bones, how much of it is there 0..1, snow on its back, snow on its face);
    // q = (how fine its hair, how strongly it streaks the coat, how rough it makes it, where in the model its face begins)
    const VS = shadow => `fn vert(a: VIn) -> VOut { var v: VOut;
      let s: SkinV = skinVertex(a.pos, a.nrm, vec4f(a.bw.x + M.p.x, a.bw.y + M.p.x, a.bw.z, 0.0));
      ${shadow ? 'v.clip = U.shadowVP * vec4f(s.wp + s.n * 0.03, 1.0);' :'v.wp = s.wp; v.nrm = s.n; v.bp = a.pos; v.bn = a.nrm; v.mat = a.mat; v.col = a.col; v.clip = U.viewProj * vec4f(s.wp, 1.0);'}
      return v; }`;
    pipe = gfx.pipeline({
      name: 'fauna', lib: [SL.common, SL.hash, SL.fog, SL.shadow, SKIN_SSL], buffers,
      varyings: { wp: 'vec3f', nrm: 'vec3f', bp: 'vec3f', bn: 'vec3f', mat: 'vec4f', col: 'vec4f' }, uniforms: { p: 'vec4f', q: 'vec4f', e0: 'vec4f', e1: 'vec4f', e2: 'vec4f' },
      textures: { tBones: 'fetch', tDetail: '2d', tShadow: 'shadow', tSky: '2d' }, vs: VS(false), fs: FAUNA_FS,
    });
    pipeShadow = gfx.pipeline({
      name: 'faunaShadow', lib: [SL.common, SKIN_SSL], buffers, varyings: {}, uniforms: { p: 'vec4f' }, textures: { tBones: 'fetch' }, colorFormat: null, cull: 'none', depthBias: 2, depthBiasSlope: 2.0,
      vs: VS(true), fs: null,
    });
    F.pipes = [pipe, pipeShadow]; F.ready = true;
  };

  // ---- an animal in the world. a: { K (its kind), slot, pos (on the snow), yaw, lean, pitch, lift, scale, tilt (how far the body follows the lie
  // of the ground, 0 upright .. 1), pose, fade }
  const slots = new Array(NSLOT).fill(null);
  function actor(K, o) {
    let s = slots.indexOf(null); if (s < 0) return null;
    const a = Object.assign({ K, slot: s, pos: [0, 0, 0], yaw: 0, lean: 0, pitch: 0, lift: 0, scale: K.scale, tilt: 0.85, pose: newPose(), fade: 0, fadeT: 1, snow: 0.6, nrm: [0, 1, 0], init: false, gone: false, t: 0, ph: 0, v: 0, off: 0, s: 0, dodge: 0, shadow: true }, o);
    slots[s] = a; F.live.push(a); return a;
  }
  function drop(a) { const i = F.live.indexOf(a); if (i >= 0) F.live.splice(i, 1); if (slots[a.slot] === a) slots[a.slot] = null; a.gone = true; }
  F.clear = function () { for (const a of F.live.slice()) drop(a); F.ev = null; };
  // where its bones are this frame
  function place(a, origin) {
    const s = a.K.solve(a.pose), k = a.scale, n = a.nrm, f0 = [Math.sin(a.yaw), 0, -Math.cos(a.yaw)];
    const Y = v3.norm(n), fl = v3.norm(v3.sub(f0, v3.mul(Y, v3.dot(f0, Y)))), Z0 = v3.mul(fl, -1), X = v3.norm(v3.cross(Y, Z0)), Z = v3.cross(X, Y);
    // leaning into its turns about the line of travel, and tipped nose-up or down about its own middle (an eagle climbing away)
    const cl = Math.cos(a.lean), sl = Math.sin(a.lean), Xr = [X[0] * cl + Y[0] * sl, X[1] * cl + Y[1] * sl, X[2] * cl + Y[2] * sl], Yr = [Y[0] * cl - X[0] * sl, Y[1] * cl - X[1] * sl, Y[2] * cl - X[2] * sl];
    const cp = Math.cos(a.pitch), sp = Math.sin(a.pitch), Yp = [Yr[0] * cp + Z[0] * sp, Yr[1] * cp + Z[1] * sp, Yr[2] * cp + Z[2] * sp], Zp = [Z[0] * cp - Yr[0] * sp, Z[1] * cp - Yr[1] * sp, Z[2] * cp - Yr[2] * sp];
    const py = a.K.mid[1] * k, off = [py * (Yr[0] - Yp[0]), py * (Yr[1] - Yp[1]), py * (Yr[2] - Yp[2])];      // (the tip is about the middle of the back, not the feet)
    const R = m4.fromBasis(v3.mul(Xr, k), v3.mul(Yp, k), v3.mul(Zp, k), [a.pos[0] - origin[0] + off[0], a.pos[1] + a.lift - origin[1] - (a.K.sink || 0) * k + off[1], a.pos[2] - origin[2] + off[2]]);
    const inv = a.K.inv, nb = a.K.NB, row = a.slot * SLOT;
    for (let i = 0; i < nb; i++) boneData.set(m4.mul(R, m4.mul(s.F[i], inv[i])), (row + i) * 16);
    a.R = R; a.J = s.J; a.fwd = fl; return s;
  }
  F.place = place;
  let dirty = false;
  F.upload = function () { if (boneTex) gfx.updateTexture(boneTex, 0, 0, 4, ROWS, boneData); dirty = false; };
  F.draw = function (shadowTex, skyTex) {
    if (!F.ready || !F.live.length) return;
    for (const a of F.live) if (a.R && a.fade > 0.004) { const K = a.K; gfx.draw(pipe, { u: { p: [a.slot * SLOT, a.fade, a.snow, a.powder || 0], q: K.tex, e0: K.eye, e1: [K.eyeCol[0], K.eyeCol[1], K.eyeCol[2], 0], e2: [K.pupil[0], K.pupil[1], 0, 0] }, tex: { tBones: boneTex, tDetail: Tex.detail, tShadow: shadowTex, tSky: skyTex }, vb: [K.vb, K.vb2, K.vb3], ib: K.ib, count: K.count }); }
  };
  F.drawShadow = function () {
    if (!F.ready || !F.live.length) return;
    for (const a of F.live) if (a.R && a.shadow && a.fade > 0.5) { const K = a.K; gfx.draw(pipeShadow, { u: { p: [a.slot * SLOT, 1, 0, 0] }, tex: { tBones: boneTex }, vb: [K.vb, K.vb2, K.vb3], ib: K.ib, count: K.count }); }
  };

  // ================================================================ who comes past, and when
  // One meeting at a time, a minute or two apart, each kind once before any comes again, and each only where its kind would be: the eagle
  // over open slopes, hare and fox where there are trees to come out of and go back into, the ibex where the ground gives it a place to stand.
  let rnd = RNG(4177); const pc = {}, pc2 = {}, tn = {}, EV = {}, P1 = newPose(), P2 = newPose(), P3 = newPose();
  F.seed = n => { rnd = RNG(n); };                // (tests: the same chances again)
  F.gap = [60, 105]; F.first = [26, 38]; F.count = {};
  const along = (s, f) => f(Course.at(s + 40, pc2)) && f(Course.at(s + 90, pc2)) && f(Course.at(s + 150, pc2));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  // start over: a new mountain, or a new run down this one (`keep`: animals stood somewhere by a test stay)
  F.reset = function (keep) {
    for (const a of F.live.slice()) if (!(keep && a.frozen)) drop(a);
    if (typeof Deer !== 'undefined' && Deer.herd) Deer.herd = Deer.herd.filter(a => keep && a.frozen);
    F.ev = null; F.want = null; F.deck = []; F.tryT = 0; F.next = Game.runT + lerp(F.first[0], F.first[1], rnd()); F._segs = Course.segs; F._runT = Game.runT;
  };
  function begin(id) {
    const e = EV[id]; if (!e) return false;
    const ev = { id, t: 0, leave: false, actors: [] };
    if (e.begin(ev) === false) return false;
    F.ev = ev; F.last = id; F.count[id] = (F.count[id] || 0) + 1; return true;
  }
  // send one past now (a kind by its id, or any). Whoever is here is hurried on its way first
  F.spawn = function (id) {
    if (!F.ready || !F.enabled || (typeof Deer !== 'undefined' && !Deer.enabled)) return false;
    if (!id || !EV[id]) { const ks = Object.keys(EV); id = ks[Math.min(ks.length - 1, Math.floor(rnd() * ks.length))]; }
    F.want = id; if (F.ev) F.ev.leave = true; return true;
  };
  F.update = function (dt, t) {
    if (!F.ready) return;
    if (Course.segs !== F._segs) F.reset(); else if (Game.runT < F._runT - 1e-6) F.reset(true);
    F._runT = Game.runT;
    const S = Game.s, sS = -S.p[2], on = F.enabled && Deer.enabled, ev = F.ev;
    if (ev) {
      ev.t += dt; if (!on) ev.leave = true;
      if (ev.leave && F.want && (ev.goT = (ev.goT || 0) + dt) > 1.2) for (const a of ev.actors) a.fadeT = 0;      // (sent on its way because another has been asked for: it does not keep the other waiting)
      if (ev.id === 'deer') { if (ev.leave) Deer.leave(); if (!Deer.herd.some(a => !a.frozen)) F.ev = null; }
      else if (!ev.actors.some(a => !a.gone)) F.ev = null;
    }
    // (deer sent straight through their own old door, Deer.spawn(): a meeting like any other, and the next is counted from it)
    if (!F.ev && Deer.herd && Deer.herd.some(a => !a.frozen)) { F.ev = { id: 'deer', t: 0, leave: false, actors: [] }; F.last = 'deer'; F.count.deer = (F.count.deer || 0) + 1; F.next = Math.max(F.next, Game.runT + F.gap[0]); }
    for (const a of F.live.slice()) {
      if (a.frozen) { place(a, Render.origin); continue; }
      a.t += dt; a.step(a, dt, t, a.ev);
      a.fade = a.fadeT > a.fade ? Math.min(a.fadeT, a.fade + dt / 0.55) : Math.max(a.fadeT, a.fade - dt / 0.55);
      if (a.fadeT <= 0 && a.fade <= 0) { a.gone = true; drop(a); } else place(a, Render.origin);
    }
    if (!F.ev) {
      if (F.want) { const id = F.want; F.want = null; begin(id); }
      else if (on && Game.mode === 'run' && Game.runT > F.next && S.speed > 6 && (F.tryT -= dt) <= 0) {
        F.tryT = 0.4; if (!F.deck.length) F.deck = shuffle(Object.keys(EV));
        for (let i = 0; i < F.deck.length; i++) { const id = F.deck[i]; if (EV[id].ok(sS)) { F.deck.splice(i, 1); if (begin(id)) F.next = Game.runT + lerp(F.gap[0], F.gap[1], rnd()); break; } }
        // none of those still to come belongs on this part of the mountain: after a while the others are dealt in behind them
        if (!F.ev && Game.runT > F.next + 25) { const rest = shuffle(Object.keys(EV).filter(k => F.deck.indexOf(k) < 0 && k !== F.last)); if (rest.length) F.deck = F.deck.concat(rest); F.next = Game.runT - 24; }
      }
    }
    if (F.live.length) F.upload();
  };
  EV.deer = { ok: s => Deer.room(s), begin: () => { Deer.spawn(); return Deer.herd.length > 0; } };

  // what every animal on the ground does each step: where it is on the hill from how far along and across the run it has got, the snow
  // under it, and which way it faces: the way it is going, turned to at the rate a body can turn, leaning into it
  function onGround(a, dt, c, turnRate, leanK, leanMax) {
    let x = c.cx + a.off + a.dodge; const z = -a.s;
    if (a.trees) { Course.nearTree(x, z, tn); const push = tn.ok && tn.d < a.trees ? (x >= tn.x ? 1 : -1) * (a.trees - tn.d) * 1.3 : 0; a.dodge = damp(a.dodge, push, push ? 8 : 1.5, dt); x = c.cx + a.off + a.dodge; }
    const y = Course.height(x, z, 0.5), px = a.pos[0], pz = a.pos[2];
    a.pos[0] = x; a.pos[1] = y; a.pos[2] = z;
    if (a.init && dt > 0) {
      const vx = (x - px) / dt, vz = (z - pz) / dt, sp = Math.hypot(vx, vz);
      if (sp > 0.6) { const yawT = Math.atan2(vx, -vz), dy = Math.atan2(Math.sin(yawT - a.yaw), Math.cos(yawT - a.yaw)); a.lean = damp(a.lean, clamp(-dy * leanK, -leanMax, leanMax), 5, dt); a.yaw += dy * (1 - Math.exp(-turnRate * dt)); }
      else a.lean = damp(a.lean, 0, 5, dt);
    }
    a.init = true;
    // the body follows the fall of the ground along its own length, and only a little of the tilt across it (legs are for that)
    const n = Course.normal(x, z, 0.8), fx = Math.sin(a.yaw), fz = -Math.cos(a.yaw), nf = (n[0] * fx + n[2] * fz) * a.tilt, nr = (-n[0] * fz + n[2] * fx) * a.tilt * 0.35;
    a.nrm = v3.norm([fx * nf - fz * nr, n[1], fz * nf + fx * nr]);
  }
  // a pose is never switched: what the animal is doing now is chased by what it was doing, fast once it has caught up
  const chase = (a, P, dt, rate) => mixPose(a.pose, a.pose, P, 1 - Math.exp(-(rate || lerp(11, 80, smooth(0, 0.4, a.ts))) * dt));
  const toWorld = (a, p) => { const w = m4.tp(a.R, p); w[0] += Render.origin[0]; w[1] += Render.origin[1]; w[2] += Render.origin[2]; return w; };
  const crossed = (p0, p1, p) => (p0 < p && p1 >= p) || (p0 > p1 && (p > p0 || p <= p1));
  // (how far to the animal's right the skier is, as an angle from where it faces)
  const bearing = (a, S) => { const dx = S.p[0] - a.pos[0], dz = S.p[2] - a.pos[2], c = Math.cos(a.yaw), s = Math.sin(a.yaw); return Math.atan2(dx * c + dz * s, dx * s - dz * c); };
  const rider = (a, h, r) => { for (const q of Post.riders) if (q[3] === 0) { q[0] = a.pos[0] - Render.origin[0]; q[1] = a.pos[1] - Render.origin[1] + h; q[2] = a.pos[2] - Render.origin[2]; q[3] = r; return; } };

  // ---- the snow hare's few seconds. It sits in its form where the trees begin; sits up when it hears the skis; and when they are nearly on
  // it, goes: down the hill ahead of the skier in great bounds, jinking, until it has had enough of being followed and cuts back into the trees
  EV.hare = {
    ok: s => along(s, c => c.forest >= 0.6 && c.hw <= 34 && (c.glade || 0) < 0.25 && (c.ridge || 0) < 0.3),
    begin(ev) {
      const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), still = vs < 4, s = sS + (still ? 17 : clamp(vs * 5, 80, 125)), c = Course.at(s, pc), uS = S.p[0] - Course.at(sS, pc2).cx;
      const side = Math.abs(uS) > 2 ? -sign(uS) : (rnd() < 0.5 ? -1 : 1), room = c.hw - 0.5;
      // (its form is where the trees begin if that is near the skier's line, and out on the open snow if the run is wide)
      const a = actor(HARE, { ev, step: hareStep, s, off: clamp(uS + side * (still ? 6 : 7 + 3 * rnd()), -room, room), side, st: 0, ts: 0, up: 0, look: 0, runK: 0, vf: 0, latV: 0, dodge: 0, trees: 1.5, tilt: 0.7,
        yaw: Math.atan2(-side * 0.8, 0.6), d1: 2.7 + 0.3 * rnd(), d2: 1.55 + 0.2 * rnd(), w1: still ? 0.9 : 9, w2: still ? 1.3 : 2.0, lead: 3 + 1.0 * rnd(), gap: 2.4 + 0.5 * rnd(), runFor: 5.5 + 1.5 * rnd(), vMax: 22.5, jk: side, jt: 0.6, ph: 0.3, fadeT: 1 });
      if (!a) return false; ev.actors.push(a);
    },
  };
  function hareStep(a, dt, t, ev) {
    const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), still = vs < 4, c = Course.at(a.s, pc), ds = a.s - sS, uS = S.p[0] - Course.at(sS, pc2).cx, K = a.K;
    a.ts += dt;
    const tau = still ? 9 : ds / Math.max(vs, 4);                                       // seconds until the skier is here
    if (a.st === 0 && (tau < a.d1 || a.ts > a.w1 || ev.leave)) { a.st = 1; a.ts = 0; }
    else if (a.st === 1 && (tau < a.d2 || a.ts > a.w2 || (ev.leave && a.ts > 0.3))) { a.st = 2; a.ts = 0; if (Math.abs(a.off - uS) > 0.8) a.side = sign(a.off - uS); }      // (it goes on the side of the skis it is on)
    else if (a.st === 2 && (a.ts > a.runFor || (ds < 4.6 && a.ts > 0.8) || (still && a.ts > 2.4) || (ev.leave && a.ts > 1.2) || (c.forest < 0.3 && a.ts > 1.5))) { a.st = 3; a.ts = 0; }
    if (a.st < 2) {
      a.up = damp(a.up, a.st, a.st ? 9 : 4, dt); a.look = damp(a.look, a.st ? clamp(bearing(a, S), -1.25, 1.25) : 0, 7, dt);
      onGround(a, dt, c, 9, 0, 0);
    } else {
      if ((a.off - uS) * a.side < 0) a.side = -a.side;                      // (the skier's line has swung across it: that is its side now; it never comes back across the skis)
      // pace: it keeps a few lengths ahead of the skis for as long as a hare can; then it is done with being followed
      const vT = a.st === 3 ? Math.max(Math.min(vs + 1, a.vMax), 12) : still ? 11 : clamp(vs + clamp((a.lead - ds) * 0.9, -7, 3), 8, a.vMax);
      a.vf += clamp((vT - a.vf) * 4, -22, 15) * dt;
      a.jt -= dt; if (a.jt <= 0) { a.jt = 0.5 + 0.7 * rnd(); a.jk = (a.jk > 0 ? -1 : 1) * (0.7 + 1.5 * rnd()); }
      const room = c.hw - 1.5, offT = a.st === 3 ? a.side * (c.hw + 18) : clamp(uS + a.side * a.gap + a.jk, -room, room);
      const lat = clamp((offT - a.off) * (a.st === 3 ? 1.1 : 2.8), -0.62 * a.vf, 0.62 * a.vf);
      a.latV = damp(a.latV, lat, a.st === 3 ? 3 : 6.5, dt); a.off += a.latV * dt;
      { const gap = (a.off - uS) * a.side; if (Math.abs(ds) < 12 && gap < 2.2) a.off += a.side * Math.min(2.2 - gap, 9 * dt); }      // never under the skis
      const vfe = Math.min(a.vf, Math.sqrt(Math.max(a.vMax * a.vMax - a.latV * a.latV, 1))); a.v = Math.hypot(vfe, a.latV); a.s += vfe * dt;
      onGround(a, dt, c, 11, 2.4, 0.4);
      a.runK = Math.min(1, a.runK + dt / 0.3); a.up = damp(a.up, 0.55, 6, dt); a.look = damp(a.look, 0, 8, dt);
      if (Math.abs(ds) < 45) rider(a, 0.22, 0.55);
      const e = Math.abs(a.off) - c.hw; if ((a.st === 3 && (e > 6 || a.ts > 5)) || ds < -14 || ds > 150) a.fadeT = 0;
    }
    K.sit(a.up, P1); P1.hY = a.look;
    if (a.runK > 0) {
      a.freq = lerp(3.0, 4.3, sat((a.v - 5) / 12)); const ph0 = a.ph; a.ph = (a.ph + a.freq * dt) % 1;
      leap(K.gait, a.ph, a.v / a.scale, 1 / a.freq, 1, P2); mixPose(a.pose, P1, P2, smooth(0, 1, a.runK));
      // each landing throws a little snow, and can just be heard
      if (a.R) for (const [p, fore] of [[K.gait.fOn, 1], [K.gait.hOn + 0.04, 0]]) if (crossed(ph0, a.ph, p)) {
        const w0 = toWorld(a, [0, 0.01, fore ? -0.12 : 0.10]), d = Math.hypot(w0[0] - S.p[0], w0[2] - S.p[2]), f = a.fwd;
        if (d < 70) Spray.kick(t, w0, [f[0] * a.v * (fore ? 0.35 : -0.2), 0.5, f[2] * a.v * (fore ? 0.35 : -0.2)], (fore ? 0.4 : 0.7) * (0.7 + 0.8 * (c.powder || 0.3)));
        if (d < 22) Sound.event({ type: 'hoof', d: d * 1.5, side: sign((w0[0] - S.p[0]) * S.r[0] + (w0[2] - S.p[2]) * S.r[2]) || 1, k: fore ? 0.2 : 0.3 });
      }
    } else mixPose(a.pose, P1, P1, 0);
  }

  // ---- the fox: about its own business out where the trees give way to the run. A few lengths at a walk, a stop to look about it, on again.
  // It sees the skier while they are still far up the hill: stands, head up, and watches them come; and when they are nearly on it, turns
  // and runs for the trees, and is gone among them. (Nobody coming, it goes back to its wandering, and after a while trots off.)
  // st: 0 walking, 1 stopped and looking about, 2 watching the skier, 3 trotting off, 4 running
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  EV.fox = {
    ok: s => along(s, c => c.forest >= 0.4 && c.hw >= 20 && (c.glade || 0) < 0.2 && (c.gul || 0) < 0.3 && (c.ridge || 0) < 0.3 && (c.mog || 0) < 0.4),
    begin(ev) {
      const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), still = vs < 4, s = sS + (still ? 16 : clamp(vs * 5.4, 80, 135)), c = Course.at(s, pc), uS = S.p[0] - Course.at(sS, pc2).cx;
      // (the patch it wanders lies between the line the skier is on and the trees on the nearer side of the run: as close under those trees as it can be
      // and still be met; out on the other side where the skier has left it no room. It comes in from the trees at a walk, broadside to whoever comes down)
      let side = Math.abs(uS) > 2 ? sign(uS) : (rnd() < 0.5 ? -1 : 1), room = c.hw - 3 - side * uS;
      if (room < 6.5) { side = -side; room = c.hw - 3 - side * uS; }
      const h0 = uS + side * (still ? 6.5 : clamp(room - 1.5 * rnd(), 6.5, 8.5 + 3 * rnd())), dir = -side * (1.5 + 0.35 * rnd());
      const a = actor(FOX, { ev, step: foxStep, s: s - 2.6 * Math.cos(dir), off: h0 - 2.6 * Math.sin(dir), h0, s0: s, tx: h0, tz: s, legT: 5, side, st: 0, ts: 0, v: FOX.walk.v, dir, yaw: dir, trees: 0.9, tilt: 0.85,
        look: 0, lookT: 0, lookN: 0, up: 0, paw: 0, pawS: 1, ph: rnd(), d1: 2.3 + 0.4 * rnd(), stay: 9 + 4 * rnd(), fadeT: 1 });
      if (!a) return false; ev.actors.push(a);
    },
  };
  // where it goes next: somewhere within a few lengths of its patch, a walk away and clear of the trunks
  function foxLeg(a) {
    for (let i = 0; i < 5; i++) {
      a.tx = a.h0 + (rnd() * 2 - 1) * 2.5; a.tz = a.s0 + (rnd() * 2 - 1) * 2.4;
      if (Math.hypot(a.tx - a.off, a.tz - a.s) < 1.6) continue;
      Course.nearTree(Course.at(a.tz, pc2).cx + a.tx, -a.tz, tn); if (!(tn.ok && tn.d < 1.7)) break;
    }
    a.legT = 2.4 + 2.2 * rnd();
  }
  function foxStep(a, dt, t, ev) {
    const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), still = vs < 4, c = Course.at(a.s, pc), ds = a.s - sS, uS = S.p[0] - Course.at(sS, pc2).cx, K = a.K, W = K.walk, T = K.jog;
    const tau = still ? 9 : ds / Math.max(vs - 1, 4), lat = a.off - uS, dist = Math.hypot(ds, lat);       // seconds until the skier is level with it; how far across the hill it is from their line
    a.ts += dt; a.ud = damp(a.ud || 0, dt > 0 && a.uP != null ? (uS - a.uP) / dt : 0, 5, dt); a.uP = uS;
    // (how near the skier's line will pass, if they go on turning as now: where the skis are heading is what it judges them by)
    const latP = lat - a.ud * clamp(tau, 0, 1.5), near = lat * latP <= 0 ? 0 : Math.min(Math.abs(lat), Math.abs(latP));
    if (a.st === 4) { if (lat * a.side < 0) a.side = -a.side; }                       // (the skier's line has swung across it as it ran: that is its side now; it never comes back across the skis)
    else if (Math.abs(lat) > 0.8) a.side = sign(lat);
    // it runs when the skier is not a second away (or, from a slow one, a dozen metres), sooner if they are coming nearly straight at it; from a
    // skier who will pass well wide, or one who has stopped, it only trots off
    const coming = !still && tau > -0.3 && ds > -2, close = smooth(3, 6.5, near);
    if (a.st < 4 && ((coming && near < 16 && (tau < lerp(1.7, 0.9, close) || ds < lerp(22, 12, close))) || (dist < 8.5 && ds > -3))) { a.st = 4; a.ts = 0; a.ph = 0.3; a.trees = 2.0; }
    else if (a.st < 3 && ((coming && near >= 16 && tau < 1.4) || (ev.leave && a.t > 0.5) || (still && a.t > a.stay))) { a.st = 3; a.ts = 0; }
    else if (a.st < 2 && coming && (tau < a.d1 || dist < 26)) { a.st = 2; a.ts = 0; a.pawS = sign(bearing(a, S)) || 1; }
    else if (a.st === 2 && (still || !coming) && a.ts > 2.2) { a.st = 0; a.ts = 0; foxLeg(a); }                   // (nothing came of it)
    else if (a.st === 0 && (a.ts > a.legT || Math.hypot(a.tx - a.off, a.tz - a.s) < 0.45)) { a.st = 1; a.ts = 0; a.legT = 1.2 + 1.6 * rnd(); a.lookN = 0; }
    else if (a.st === 1 && a.ts > a.legT) { a.st = 0; a.ts = 0; foxLeg(a); }
    // pace, and where it is headed. Walking, it turns as it goes (an arc, never a pivot); running, it swings round and away from the skier's
    // line, across and down the hill to the trees on its own side
    const vT = a.st === 0 ? W.v : a.st === 3 ? T.v : a.st === 4 ? (still ? 8 : clamp(vs * 0.42, 7.5, 10.5)) : 0;
    a.v += clamp((vT - a.v) * (a.st === 4 ? 4 : 5), a.st === 4 ? -14 : -3.5, a.st === 4 ? 13 : 2.5) * dt;
    let turn = 0;
    if (a.st === 0) turn = clamp(wrap(Math.atan2(a.tx - a.off, a.tz - a.s) - a.dir) * 2.4, -1.9, 1.9) * sat(a.v / 0.5);
    else if (a.st === 3) turn = clamp(wrap(a.side * 1.3 - a.dir) * 2.4, -1.9, 1.9) * sat(a.v / 0.5);
    else if (a.st === 4) turn = clamp(wrap(a.side * lerp(0.95, 1.3, smooth(0.8, 2.0, a.ts)) - a.dir) * 5, -8.5, 8.5);          // (away down the hill at first, then straight for the trees)
    else if (a.st === 2 && a.v < 0.3) { const b = bearing(a, S); turn = sign(b) * clamp((Math.abs(b) - 0.95) * 2.2, 0, 1.5) * smooth(0.3, 0.1, a.v); }        // (what it watches has gone round behind its shoulder: it shuffles round after it)
    a.dir += turn * dt; a.off += a.v * Math.sin(a.dir) * dt; a.s += a.v * Math.cos(a.dir) * dt;
    if (a.st === 4) { const g2 = (a.off - uS) * a.side; if (ds > -4 && ds < 14 && g2 < 3.2) a.off += a.side * Math.min(3.2 - g2, 8 * dt); }       // never under the skis (once they are past, it is left in peace)
    if (a.st === 4) onGround(a, dt, c, 8, 1.3, 0.22);
    else { a.yaw = Math.atan2(Math.sin(a.dir) + (Course.at(a.s + 1, pc2).cx - c.cx) * Math.cos(a.dir), Math.cos(a.dir)); onGround(a, dt, c, 0, 0, 0); }      // (at a walk it faces the way it steps)
    // how it carries itself: the head comes up and round to the skier when it has seen them; looking idly about, it turns from one side to the other
    // (a skier standing near by is one of the things it looks at, turn and turn about with the rest of the hill)
    if (a.st === 1) { a.lookN -= dt; if (a.lookN <= 0) { a.atS = !a.atS && still && dist < 40; a.lookN = (a.atS ? 1.0 : 0.7) + 0.8 * rnd(); a.lookT = (a.lookT > 0 ? -1 : 1) * (0.35 + 0.65 * rnd()); } }
    const seen = a.st === 2 || (a.st === 1 && a.atS);
    a.look = damp(a.look, seen ? clamp(bearing(a, S), -1.35, 1.35) : a.st === 1 ? a.lookT : 0, seen ? 4.5 : 3, dt);
    a.up = damp(a.up, a.st === 2 ? 1 : seen ? 0.7 : a.st === 1 ? 0.3 : 0, 6, dt); a.paw = damp(a.paw, a.st === 2 && a.v < 0.25 && Math.abs(turn) < 0.05 ? a.pawS : 0, 5, dt);
    if (a.st === 4) {
      a.freq = lerp(2.3, 3.2, sat((a.v - 4) / 9)); const ph0 = a.ph; a.ph = (a.ph + a.freq * dt) % 1; leap(K.gait, a.ph, Math.max(a.v, 3) / a.scale, 1 / a.freq, 1, P1); P1.hY = a.look;      // (its eye stays on the skier a moment longer as it swings away)
      // each landing throws a little snow
      if (a.R) for (const [p, fore] of [[K.gait.fOn, 1], [K.gait.hOn + 0.05, 0]]) if (crossed(ph0, a.ph, p)) {
        const w0 = toWorld(a, [0, 0.01, fore ? -0.2 : 0.18]), d = Math.hypot(w0[0] - S.p[0], w0[2] - S.p[2]), f = a.fwd;
        if (d < 80) Spray.kick(t, w0, [f[0] * a.v * (fore ? 0.35 : -0.2), 0.5, f[2] * a.v * (fore ? 0.35 : -0.2)], (fore ? 0.3 : 0.45) * (0.7 + 0.8 * (c.powder || 0.3)));
        if (d < 22) Sound.event({ type: 'hoof', d: d * 1.4, side: sign((w0[0] - S.p[0]) * S.r[0] + (w0[2] - S.p[2]) * S.r[2]) || 1, k: fore ? 0.18 : 0.28 });
      }
      if (Math.abs(a.off) - c.hw > 4.5 || ds < -14 || a.ts > 7) a.fadeT = 0;                 // (gone: in among the trees, or left behind)
    } else {
      // walk and trot are one cycle whose feet change their order as it quickens; stopping, its steps shorten into the stand
      const k = smooth(1.4, 2.3, a.v), step = a.st === 2 ? sat(Math.abs(turn) / 0.9) : 0;
      a.ph = (a.ph + (lerp(W.f / W.v, T.f / T.v, k) * a.v + 1.5 * step) * dt) % 1;
      K.look(a.look, a.up, a.paw, P1);
      if (a.v > 0.02) { trot(W, a.ph, W.v / a.scale, 1 / W.f, 1, P2); if (k > 0) { trot(T, a.ph, T.v / a.scale, 1 / T.f, 1, P3); mixPose(P2, P2, P3, k); } P2.hY = a.look * 0.6; mixPose(P1, P1, P2, smooth(0.03, 0.55, a.v)); }
      if (step > 0) { trot(W, a.ph, 0.3 / a.scale, 1 / W.f, 1, P2); for (let i = 0; i < 20; i++) P1.lg[i] += (P2.lg[i] - P1.lg[i]) * 0.6 * step; }       // (shuffling round where it stands: its feet step, its head stays up)
      if (a.st === 3 && (Math.abs(a.off) - c.hw > 3 || ds < -16 || a.ts > 12)) a.fadeT = 0;
      else if (ds < -22) a.fadeT = 0;                                                    // (left behind, still at its wandering)
    }
    chase(a, P1, dt);
    if (ds < 60 && ds > -12) rider(a, 0.4, 0.95);                 // (so that the moment it is close is not smeared away by the speed of the lens)
    // the lens leans its way a little as it is passed
    if (tau < 3.0 && tau > -0.4) Deer.pull += sign(lat) * 0.13 * smooth(3.0, 1.6, tau) * smooth(-0.4, 0.2, tau);
  }

  // ---- the ibex is there before the skier is: on the lip of the ridge, the rim of the gully or the foot of the bank above the run, broadside,
  // its head turned up the hill toward what is coming down. Two or three seconds short of it, it wheels and goes down along the edge in the
  // stiff high bounds of its kind; the skier gains on it all the way, and as the skis draw level it is over the edge and gone
  const _w4 = [0, 0, 0, 0];
  // a standing animal has each foot on the snow that is under that foot, and its body let down as far as the lowest of them asks
  function plantFeet(a, P) {
    if (!a.R) return;
    const S = a.K.Q.S; let lo = 0;
    for (let i = 0; i < 4; i++) { const r = i < 2 ? S.FF : S.HF, w = toWorld(a, [(i & 1 ? 1 : -1) * r[0], 0, r[2] - P.lg[i * 5]]); _w4[i] = clamp((Course.height(w[0], w[2], 0.5) - w[1]) / a.scale, -0.16, 0.24); lo = Math.min(lo, _w4[i]); }
    P.my += lo; for (let i = 0; i < 4; i++) P.lg[i * 5 + 1] += _w4[i];
  }
  EV.ibex = {
    // (its ground is the ridge, the walls of the steeps and the rim of the gully: not a piste of bumps, however narrow)
    ok: s => along(s, c => (c.glade || 0) < 0.3 && (c.hw <= 27 || (c.ridge || 0) >= 0.5 || (c.gul || 0) >= 2)) && [40, 150].every(d => { const k = Course.segAt(s + d).type; return k === 'ridge' || k === 'steeps' || k === 'gully'; }),
    // the line it keeps to, across the run: the wind lip of a ridge, the rim of a gully where that is nearer than the bank, or the foot of the bank
    edge(c, side) { const e = side * (c.hw + 1.5 + 1.2 * (1 - (c.ridge || 0))); if ((c.gul || 0) >= 2) { const g = (c.goff || 0) + side * c.gw * 1.5; if (Math.abs(g) < Math.abs(e)) return g; } return e; },
    begin(ev) {
      const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), still = vs < 4, uS = S.p[0] - Course.at(sS, pc2).cx, side = Math.abs(uS) > 3 ? sign(uS) : (rnd() < 0.5 ? -1 : 1);
      let s = sS + (still ? 21 : clamp(vs * 8, 130, 190)), off = 0;
      for (let k = 0; k < 6; k++) { const c = Course.at(s, pc); off = still ? uS + side * 8 : clamp(EV.ibex.edge(c, side), uS - 14, uS + 14); Course.nearTree(c.cx + off, -s, tn); if (!tn.ok || tn.d > 2.6) break; s += 7; }      // (not with a tree at its shoulder)
      const a = actor(IBEX, { ev, step: ibexStep, s, off, side, st: 0, ts: 0, v: 0, yaw: -side * (1.15 + 0.5 * rnd()), tilt: 0.5, look: 0.4 * side, alert: 0, runK: 0, latV: 0, ph: 0.9, d1: 3.0 + 0.5 * rnd(), w1: still ? 3.2 : 30, snow: 0.7, fadeT: 1 });
      if (!a) return false; ev.actors.push(a);
    },
  };
  function ibexStep(a, dt, t, ev) {
    const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), still = vs < 4, c = Course.at(a.s, pc), ds = a.s - sS, uS = S.p[0] - Course.at(sS, pc2).cx, K = a.K;
    const tau = still ? 9 : ds / Math.max(vs, 4);
    a.ts += dt;
    if (a.st === 0 && (tau < a.d1 || a.ts > a.w1 || (ev.leave && a.ts > 0.4))) { a.st = 1; a.ts = 0; a.trees = 2.4; if (Math.abs(a.off - uS) > 3) a.side = sign(a.off - uS); }
    else if (a.st === 1 && a.ts > 0.34) { a.st = 2; a.ts = 0; }
    else if (a.st === 2 && (ds < 8 || a.ts > 8 || (still && a.ts > 2.2) || (ev.leave && a.ts > 1))) { a.st = 3; a.ts = 0; }
    if (a.st === 0) {
      a.alert = damp(a.alert, smooth(8, 4.5, tau), 3, dt); a.look = damp(a.look, a.alert > 0.3 ? clamp(bearing(a, S), -1.7, 1.7) : 0.35 * a.side, 3.5, dt);
      onGround(a, dt, c, 6, 0, 0);
    } else {
      if ((a.off - uS) * a.side < 0) a.side = -a.side;
      // pace: fast for a goat and not fast enough
      const vT = a.st === 1 ? 2.5 : still ? 9 : clamp(vs * 0.66, 9.5, 15);
      a.v += clamp((vT - a.v) * 5, -12, 22) * dt;
      // (down off its edge and along the run, some lengths off the skier's line; out over the edge again when the skis draw level)
      const ed = EV.ibex.edge(c, a.side), offT = a.st === 3 ? a.side * (c.hw + 40) : a.side > 0 ? Math.min(ed + 1, uS + 8) : Math.max(ed - 1, uS - 8), lat = clamp((offT - a.off) * (a.st === 3 ? 1.2 : 1.6), -0.75 * a.v, 0.75 * a.v);
      a.latV = damp(a.latV, a.st === 1 ? -a.side * 0.6 : lat, 4, dt); a.off += a.latV * dt; a.s += Math.sqrt(Math.max(a.v * a.v - a.latV * a.latV, 0.01)) * dt;
      { const gap = (a.off - uS) * a.side; if (Math.abs(ds) < 16 && gap < 5) a.off += a.side * Math.min(5 - gap, 7 * dt); }                    // never under the skis
      onGround(a, dt, c, a.st === 1 ? 7 : 6, 1.2, 0.2);
      a.runK = Math.min(1, a.runK + dt / 0.32); a.alert = damp(a.alert, 0.3, 4, dt); a.look = damp(a.look, 0, 6, dt); a.tilt = damp(a.tilt, 0.8, 3, dt);
      const e = Math.abs(a.off) - c.hw; if ((a.st === 3 && (e > 9 || a.ts > 4)) || ds < -14 || ds > 220) a.fadeT = 0;
      if (ds < 60) rider(a, 0.8, 1.9);
      if (ds > 4 && ds < 70) Deer.pull += sign(a.off - uS) * 0.10 * smooth(70, 45, ds) * smooth(4, 14, ds);
    }
    K.stand(a.look, a.alert, a.t, P1); plantFeet(a, P1);
    if (a.st === 1) { const g = bump(a.ts / 0.34); P1.my -= 0.07 * g; P1.aH += 0.10 * g; P1.aC += 0.16 * g; }          // (it sits back on its hocks to throw itself round)
    if (a.runK > 0) {
      a.freq = lerp(1.9, 2.5, sat((a.v - 4) / 9)); const ph0 = a.ph; a.ph = (a.ph + a.freq * dt) % 1;
      leap(K.gait, a.ph, Math.max(a.v, 3) / a.scale, 1 / a.freq, 1, P2); mixPose(P1, P1, P2, smooth(0, 1, a.runK));
      if (a.R) for (const [p, fore] of [[K.gait.fOn, 1], [K.gait.hOn + 0.03, 0]]) if (crossed(ph0, a.ph, p)) {
        const w0 = toWorld(a, [0, 0.02, fore ? -0.33 : 0.37]), d = Math.hypot(w0[0] - S.p[0], w0[2] - S.p[2]), f = a.fwd;
        if (d < 110) Spray.kick(t, w0, [f[0] * a.v * (fore ? 0.3 : -0.15), 0.7, f[2] * a.v * (fore ? 0.3 : -0.15)], (fore ? 0.5 : 0.65) * (0.7 + 0.8 * (c.powder || 0.3)));
        if (d < 34) Sound.event({ type: 'hoof', d, side: sign((w0[0] - S.p[0]) * S.r[0] + (w0[2] - S.p[2]) * S.r[2]) || 1, k: fore ? 0.6 : 0.8 });
      }
    }
    chase(a, P1, dt, a.runK > 0 ? 40 : 12);
  }

  // ---- the eagle comes from behind, fast, its wings half drawn in; opens them as it comes level and slides forward over the skier's shoulder,
  // a few metres off and little faster than the skis; floats down the hill just ahead, low, its shadow on the snow beside it, a look back at
  // what follows; then a few deep beats, and it banks away and up. (At the speed of the skis only what keeps pace with them is seen at all)
  EV.eagle = {
    // (not where the skier takes to the air as well; and an eagle does not fly by night)
    ok: s => along(s, c => (c.glade || 0) < 0.3 && (c.hw >= 20 || (c.ridge || 0) >= 0.5)) && Course.segAt(s + 30).type !== 'kickers' && Course.segAt(s + 330).type !== 'kickers' && !(typeof Sky !== 'undefined' && Sky.sunElev < -0.03),
    begin(ev) {
      const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), uS = S.p[0] - Course.at(sS, pc2).cx, side = Math.abs(uS) > 3 ? -sign(uS) : (rnd() < 0.5 ? -1 : 1);
      const a = actor(EAGLE, { ev, step: eagleStep, s: sS - 26, off: uS + side * 3, alt: 5.6, uS, side, st: 0, ts: 0, vf: Math.max(vs, 9) + 11, latV: 0, vy: 0, amp: 0.3, tuck: 0.6, look: 0, lead: 5 + 1.5 * rnd(), glideFor: 4.4 + 1.2 * rnd(), ph: 0, tilt: 0, snow: 0, fadeT: 1 });
      if (!a) return false; ev.actors.push(a);
    },
  };
  function eagleStep(a, dt, t, ev) {
    const S = Game.s, sS = -S.p[2], vs = Math.max(-S.v[2], 0), ds = a.s - sS, c = Course.at(a.s, pc), uS = S.p[0] - Course.at(sS, pc2).cx, K = a.K, v0 = Math.max(vs, 9);
    a.ts += dt;
    if (a.st === 0 && (ds > a.lead - 2 || (ev.leave && a.ts > 1.5))) { a.st = ev.leave ? 2 : 1; a.ts = 0; }
    else if (a.st === 1 && (a.ts > a.glideFor || (ev.leave && a.ts > 0.5) || (c.glade || 0) > 0.5)) { a.st = 2; a.ts = 0; }
    let vT, altT, offT, ampT, tuckT, latMax = 9, lookT = 0; const room = Math.max(c.hw - 6, 4);
    a.uS = damp(a.uS, uS, 1.3, dt);                // (it keeps to the skier's line, not to every turn of the skis)
    if (a.st === 0) { vT = v0 + lerp(11, 3.4, smooth(-18, -9, ds)); altT = lerp(5.6, 4.8, smooth(-26, -6, ds)) - 1.3 * smooth(-1, 6, ds); offT = clamp(a.uS + a.side * lerp(3.0, 2.2, smooth(-20, 2, ds)), -room, room); ampT = 0.2; tuckT = 0.6 * smooth(-5, -14, ds); }
    else if (a.st === 1) {
      vT = v0 + clamp((a.lead + 0.6 * a.ts - ds) * 0.8, -4, 5); altT = 3.4 + 0.3 * Math.sin(a.t * 0.8); offT = clamp(a.uS + a.side * (2.2 + 0.5 * Math.sin(a.t * 0.55)), -room, room); tuckT = 0;
      ampT = a.ts > 2.4 && a.ts < 3.6 ? 0.9 : 0; if (a.ts > 0.7 && a.ts < 2.1) lookT = clamp(bearing(a, S), -2.3, 2.3);
    } else { vT = v0 + 9; altT = 4 + 26 * smooth(0, 4.5, a.ts); latMax = 2 + 11 * smooth(6, 16, a.alt); offT = a.off + a.side * 30; ampT = 1; tuckT = 0; }
    a.vf += clamp((vT - a.vf) * 1.6, -8, 9) * dt; a.s += a.vf * dt;
    const lv0 = a.latV; a.latV = damp(a.latV, clamp((offT - a.off) * 0.9, -latMax, latMax), 2.2, dt); a.off += a.latV * dt;
    if (Math.abs(ds) < 10 && a.alt < 3.3) a.alt = Math.min(3.3, a.alt + 4 * dt);                                                             // (well clear of the skier's head)
    a.vy = damp(a.vy, clamp((altT - a.alt) * 1.2, -5, 6), 2.5, dt); a.alt += a.vy * dt;
    // (its height is over the lie of the hill, not over each roll of it)
    const x = c.cx + a.off, z = -a.s, h = Course.height(x, z, 0.5), p = a.pos, px = p[0], py = p[1], pz = p[2];
    p[0] = x; p[1] = Math.max(0.5 * h + 0.25 * (Course.height(x, z + 9, 0.5) + Course.height(x, z - 9, 0.5)) + a.alt, h + 1.8); p[2] = z;
    if (a.init && dt > 0) {
      const vx = (x - px) / dt, vz = (z - pz) / dt, sp = Math.hypot(vx, vz), yawT = Math.atan2(vx, -vz), dy = Math.atan2(Math.sin(yawT - a.yaw), Math.cos(yawT - a.yaw));
      // nose along its path; banked into the turn it is making (what pulls it across its path, against what holds it up)
      a.yaw += dy * (1 - Math.exp(-6 * dt)); a.v = sp; a.pitch = damp(a.pitch, clamp(Math.atan2((p[1] - py) / dt, sp), -0.5, 0.6) * 0.8, 4, dt);
      a.lean = damp(a.lean, clamp(-Math.atan2((a.latV - lv0) / dt, 9.81) * 1.5, -0.95, 0.95) + 0.04 * Math.sin(a.t * 1.3), 3.5, dt);
    } else a.yaw = 0;
    a.init = true;
    a.amp = damp(a.amp, ampT, 5, dt); a.tuck = damp(a.tuck, tuckT, 2.5, dt); a.look = damp(a.look, lookT, 5, dt); a.ph = (a.ph + 2.7 * dt) % 1;
    K.fly(a.pose, a.ph, a.amp, a.tuck, { hY: a.look, hA: -a.pitch * 0.8, tR: -a.lean * 0.6 + 0.05 * Math.sin(a.t * 2.1), tP: 0.10 * sat((a.vf - vT) / 4) - a.pitch * 0.3 });
    if (Math.abs(ds) < 70) rider(a, 0, 1.6);
    if (a.st === 1) Deer.pull += sign(a.off - uS) * 0.04 * smooth(0, 0.8, a.ts) * smooth(a.glideFor, a.glideFor - 0.8, a.ts);
    if ((a.st === 2 && (a.ts > 5.5 || a.alt > 27 || Math.abs(a.off) > c.hw + 25)) || ds < -45 || ds > 200) a.fadeT = 0;
  }

  // tests: stand one somewhere in a given pose. o: { pos, yaw, anim: 'sit' | 'run', up, ph, v, run, flat, scale }
  F.pose = function (i, id, o = {}) {
    const K = F.sp[id]; let a = F.live.find(q => q.test === i);
    if (a && a.K !== K) { drop(a); a = null; }
    if (!a) a = actor(K, { test: i, frozen: true, fade: 1 });
    Object.assign(a, o); a.frozen = true;
    if (o.pos && o.ground !== false && typeof Course !== 'undefined') a.pos[1] = Course.height(a.pos[0], a.pos[2], 0.5);
    if (!o.flat && typeof Course !== 'undefined') { const n = Course.normal(a.pos[0], a.pos[2], 0.6); a.nrm = v3.norm([n[0] * a.tilt, n[1], n[2] * a.tilt]); } else a.nrm = [0, 1, 0];
    K.anim(a.pose, o);
    place(a, Render.origin); if (gfx) F.upload();
    return a;
  };
  HARE.anim = function (p, o) {
    if (o.anim === 'stand') return zeroPose(p);
    if (o.anim === 'sit') { HARE.sit(o.up == null ? 1 : o.up, p); p.hY = o.look || 0; return p; }
    const v = o.v == null ? 9 : o.v, T = 1 / (o.freq || 3.4); return leap(HARE.gait, o.ph || 0, v, T, o.run == null ? 1 : o.run, p);
  };
  F.leap = leap; F.newPose = newPose; F.mixPose = mixPose; F.QB = QB;
  return F;
})();

const FAUNA_FS = `
fn fDith(p: vec2f) -> f32 { let f: f32 = U.origin.w - 64.0 * floor(U.origin.w / 64.0); return fract(52.9829189 * fract(dot(p + 5.588238 * f, vec2f(0.06711056, 0.00583715)))); }
fn frag(v: VOut) -> FOut {
  var o: FOut;
  // coming and going: thinned out through a dither that moves every frame, never switched
  if (M.p.y < 0.999) { if (fDith(v.clip.xy) >= M.p.y) { discard; } }
  var N: vec3f = normalize(v.nrm);
  let V: vec3f = normalize(U.camPos.xyz - v.wp);
  let L: vec3f = U.sunDir.xyz;
  let bp: vec3f = v.bp; let bn: vec3f = normalize(v.bn);
  // hair lies along the body: streaks drawn out from nose to tail (finer on a small animal)
  let hair: vec4f = tex(tDetail, vec2f(bp.z * 1.2 + bp.y * 0.4, bp.y * 6.5 + bp.x * 5.0) * M.q.x);
  let fine: vec4f = tex(tDetail, (bp.zy * 12.0 + bp.xx * vec2f(7.0, 5.0)) * M.q.x);
  var alb: vec3f = v.col.rgb; var fur: f32 = saturate(v.col.a);
  // what it is made of: a coat (how furry is painted in with the colour: bare skin shines, and the wet of a nose), horn, or the vane of a feather
  let horn: f32 = step(0.5, v.mat.x) * step(v.mat.x, 1.5); let vane: f32 = step(1.5, v.mat.x);
  var sheen: f32 = 0.9; var specS: f32 = 0.025 + 0.10 * horn + 0.05 * vane; var specP: f32 = 16.0 + 14.0 * horn; var gloss: f32 = (1.0 - smoothstep(0.0, 0.5, fur)) * (1.0 - horn) * (1.0 - vane);
  // (and in locks, which is what is seen of a coat from farther than its hairs can be)
  let lock: vec4f = tex(tDetail, vec2f(bp.z * 0.42 + bp.y * 0.15, bp.y * 1.9 + bp.x * 1.5) * M.q.x);
  alb *= mix(1.0, (0.84 + 0.32 * hair.z) * (0.92 + 0.16 * fine.x) * (0.80 + 0.40 * lock.z), fur * M.q.y);
  // the eye: a dark wet ball with its own colour round the pupil
  let eq: vec3f = vec3f(abs(bp.x), bp.y, bp.z) - M.e0.xyz; let ed: f32 = length(eq) / M.e0.w;
  let eye: f32 = smoothstep(1.0, 0.86, ed);
  if (eye > 0.0) {
    let iris: f32 = smoothstep(0.80, 0.70, ed) * smoothstep(0.30, 0.42, length(vec2f(eq.z / M.e2.x, eq.y / M.e2.y)) / M.e0.w);
    alb = mix(alb, mix(vec3f(0.006, 0.005, 0.005), M.e1.rgb, iris), eye); gloss = max(gloss, 0.95 * eye); fur *= 1.0 - eye;
  }
  sheen = mix(0.25, 0.95, fur);
  // snow sifted along the back
  let dust: f32 = smoothstep(0.50, 0.92, bn.y) * smoothstep(0.50, 0.80, fine.w * 0.55 + hair.x * 0.5 + 0.12 * M.p.z) * fur * M.p.z;
  alb = mix(alb, vec3f(0.80, 0.84, 0.90), dust * 0.42);
  // and a face that has just been pushed into it comes out white
  let face: f32 = M.p.w * smoothstep(M.q.w + 0.02, M.q.w - 0.07, bp.z) * smoothstep(0.75, 0.30, fine.w * 0.6 + hair.x * 0.5 + 0.55 * (1.0 - M.p.w));
  alb = mix(alb, vec3f(0.82, 0.85, 0.90), face * 0.9);
  // the lie of the hair roughens the surface
  N = normalize(N + ((vec3f(hair.x, hair.y, hair.z) - 0.5) + (vec3f(lock.x, lock.y, lock.z) - 0.5) * 0.7) * M.q.z * fur);
  let ndl: f32 = dot(N, L); let ndv: f32 = saturate(dot(N, V));
  let sh: f32 = shadowAt(v.wp + N * 0.04, 0.00031);
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
  // a feather lets the sun through it
  col += alb * U.sunCol.rgb * (vane * 0.55 * saturate(-ndl) * sh);
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
