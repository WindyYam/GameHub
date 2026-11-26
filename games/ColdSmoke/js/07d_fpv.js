"use strict";
// ---------------------------------------------------------------- first person: the skier's own arms, hands, poles and skis, made to be seen from the eyes
// From inside the helmet the figure's arms are a hand's breadth from the lens, and a body modelled to be seen from five metres away is two
// sticks there. So while the lens is in the helmet they are swapped for these: gloves with fingers closed round the grips, sleeves that fold
// at the elbow, poles with their straps and baskets, skis with a topsheet and edges. They are drawn where the figure's own arms are (the
// figure is posed first, with the hands carried a little higher for the helmet camera: see 07b_views.js), so the shadow on the snow is
// still the figure's and still agrees; what is added here is a wrist (the figure has none), weight (the hands lag and settle on springs,
// the poles swing from the grips) and everything that only shows from this close.
// Everything is built once from formulas (the gloves as a distance field through the mesher, the rest as swept sheets).
const Fpv = (() => {
  const F = { on: false, ready: false, dead: false, stats: {}, swap: 0.55, arms: true, tk: 0 };
  const VSZ = 18, NB = 10;      // floats per vertex: position 3, normal 3, material 4, bones 4 (a, b, share of a, how much of the forearm's twist a takes), surface coordinates 4. Bones: right 0..4, left 5..9
  const BN = { uarm: 0, farm: 1, hand: 2, pole: 3, ski: 4 };
  const L1 = 0.30, L2 = 0.26, LA = L1 + L2;      // upper arm and forearm: the figure's (the sleeve is cut for these; the arm is solved afresh here, so it would stand other lengths)
  // The hand's own space: x out of the back of the hand, y up the grip (the thumb's side), z back toward the wrist; the middle of the fist is 0.
  // HW: the wrist joint. With the wrist straight the grip stands at 70 degrees to the forearm, its top tipped away from the elbow (HC, HS),
  // and the forearm's line runs on through the middle of the fist.
  // The arm's own space ('bind'): shoulder at 0, the arm straight along -z, the elbow's hinge along x, the inside of the elbow toward +y;
  // the hand sits at the end of it with its back toward +x.
  const HW = [0.020, -0.030, 0.082], HC = 0.940, HS = 0.342, TH0 = Math.acos(HS), N0 = [0, HS, -HC], R0 = [0, HC, HS];
  const AH = [1, 0, 0, 0, 0, HC, HS, 0, 0, -HS, HC, 0, HW[0], HW[1] - HS * LA, HW[2] + HC * LA, 1];      // from the arm's space to the hand's
  const toHand = (x, y, z, o) => { const dz = z + LA; o[0] = x + HW[0]; o[1] = HW[1] + HC * y - HS * dz; o[2] = HW[2] + HS * y + HC * dz; return o; };
  const fromHand = (q) => { const y = q[1] - HW[1], z = q[2] - HW[2]; return [q[0] - HW[0], HC * y + HS * z, -HS * y + HC * z - LA]; };
  const hu = (x, y, z) => (y - HW[1]) * N0[1] + (z - HW[2]) * N0[2], hv = (x, y, z) => (y - HW[1]) * R0[1] + (z - HW[2]) * R0[2];      // how far past the wrist toward the knuckles; how far to the thumb's side
  // the pole: piv = where in the fist it turns when the lower fingers let it swing (between thumb and first finger)
  const POLE = { len: 1.14, basket: 1.045, r: 0.0165, piv: 0.030 };
  // the knuckles' line (in the hand's space): what the lower three fingers open about
  const KN = [0.0334, -0.0134], FOPEN = [0, 0.28, 0.63, 1.0];

  // ---- a mesh being put together
  function acc() {
    const v = [], ix = [];
    return { v, ix, n: () => v.length / VSZ, vert(p, n, m, b, u) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], m[0], m[1], m[2], m[3], b[0], b[1], b[2], b[3], u[0], u[1], u[2], u[3]); return v.length / VSZ - 1; } };
  }
  // a grid of nu x nv points P(i, j) made into one smooth sheet: each normal comes from the point's own neighbours (wrap: the last column
  // joins the first). at(i, j, p, n) -> [material, bones, coordinates]. The sheet faces the way dP/di x dP/dj points, or the other way if flipped
  function sheet(A, nu, nv, P, at, wrap, flip) {
    const pts = new Array(nu * nv); for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) pts[i * nv + j] = P(i, j);
    const g = (i, j) => pts[clamp(i, 0, nu - 1) * nv + (wrap ? (j + nv) % nv : clamp(j, 0, nv - 1))], base = A.n();
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      let n = v3.norm(v3.cross(v3.sub(g(i + 1, j), g(i - 1, j)), v3.sub(g(i, j + 1), g(i, j - 1)))); if (flip) n = v3.mul(n, -1);
      const p = pts[i * nv + j], t = at(i, j, p, n); A.vert(p, t[3] || n, t[0], t[1], t[2]);
    }
    const nj = wrap ? nv : nv - 1;
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nj; j++) {
      const a = base + i * nv + j, b = base + i * nv + (j + 1) % nv, c = base + (i + 1) * nv + (j + 1) % nv, d = base + (i + 1) * nv + j;
      if (flip) A.ix.push(a, b, c, a, c, d); else A.ix.push(a, c, b, a, d, c);
    }
  }

  // ---- the glove: a fist closed round the grip. Four fingers wound round the front of it, each a chain of three tubes on circles about the
  // grip's axis; the thumb round the back and over the first finger; the bones of the hand running back from the knuckles to the wrist, the
  // heel and the ball of the thumb under them; guards over the knuckles and a padded panel on the back; the soft cuff running back up the
  // arm (under the sleeve's gaiter).
  const FY = [0.0315, 0.0100, -0.0115, -0.0320], FSZ = [1.0, 1.04, 0.98, 0.87], FC = [-0.12, 0.0, 0.04, 0.16], FK = [-0.003, 0, 0.002, 0.006];
  const FJ = [[0.0360, 0.38], [0.0335, 1.88], [0.0325, 2.79], [0.0315, 3.54]], FR = [0.0140, 0.0130, 0.0121, 0.0113], FP = [], MC = [];
  for (let i = 0; i < 4; i++) { FP.push([]); for (let j = 0; j < 4; j++) { const a = FJ[j][1] + FC[i] * j / 1.5, R = FJ[j][0] * (0.86 + 0.14 * FSZ[i]); FP[i].push([R * Math.cos(a), FY[i] * (j ? 1 : 1.03), -R * Math.sin(a) + (j ? 0 : FK[i]), FR[j] * FSZ[i]]); } }
  for (let i = 0; i < 4; i++) { const c = [0.0215, 0.0075, -0.0065, -0.0195][i]; MC.push([HW[0] + 0.005, HW[1] + N0[1] * 0.016 + R0[1] * c, HW[2] + N0[2] * 0.016 + R0[2] * c, 0.0180]); }
  const TH = [[0.013, 0.004, 0.066, 0.0185], [0.008, 0.031, 0.045, 0.0172], [-0.0185, 0.049, 0.0270, 0.0148], [-0.0330, 0.054, -0.0030, 0.0132], [-0.0205, 0.0555, -0.0240, 0.0120]];
  const CA = [HW[0], HW[1] + N0[1] * 0.022, HW[2] + N0[2] * 0.022], CB = [HW[0], HW[1] - N0[1] * 0.075, HW[2] - N0[2] * 0.075];       // the cuff's axis: from just past the wrist back along the forearm
  // (o, when given, is told what the point belongs to: o[0] the nearest finger's distance, o[1] which finger, o[2] the distance of everything that is not a finger)
  function gloveSD(x, y, z, o) {
    const c = sd.capsule;
    let b = 1e9;
    for (let i = 0; i < 4; i++) { const m = MC[i], k = FP[i][0]; b = sd.smin(b, c(x, y, z, m[0], m[1], m[2], k[0], k[1], k[2], m[3], k[3] * 1.10), 0.007); }
    b = sd.smin(b, sd.ellipsoid(x, y, z, 0.014, -0.034, 0.044, 0.019, 0.021, 0.029), 0.010);
    // the ball of the thumb and the heel of the hand close the fist behind the grip: the fingertips come round to meet them
    b = sd.smin(b, sd.ellipsoid(x, y, z, -0.0075, 0.010, 0.0385, 0.0190, 0.0300, 0.0190), 0.008);
    b = sd.smin(b, sd.ellipsoid(x, y, z, -0.0060, -0.0300, 0.0370, 0.0180, 0.0200, 0.0180), 0.008);
    let fg = 1e9, fi = 0, fm = 1e9;
    if (z < 0.055) for (let i = 0; i < 4; i++) {       // (further back than this the fingers are too far off to count)
      const P = FP[i]; let f = c(x, y, z, P[0][0], P[0][1], P[0][2], P[1][0], P[1][1], P[1][2], P[0][3], P[1][3]);
      f = sd.smin(f, c(x, y, z, P[1][0], P[1][1], P[1][2], P[2][0], P[2][1], P[2][2], P[1][3], P[2][3]), 0.004);
      f = sd.smin(f, c(x, y, z, P[2][0], P[2][1], P[2][2], P[3][0], P[3][1], P[3][2], P[2][3], P[3][3]), 0.004);
      if (f < fm) { fm = f; fi = i; } fg = sd.smin(fg, f, 0.0032);
    }
    let t = 1e9; for (let i = 0; i < 4; i++) t = sd.smin(t, c(x, y, z, TH[i][0], TH[i][1], TH[i][2], TH[i + 1][0], TH[i + 1][1], TH[i + 1][2], TH[i][3], TH[i + 1][3]), 0.005);
    b = sd.smin(b, t, 0.007);
    if (z < 0.04) for (let i = 0; i < 4; i++) b = sd.smin(b, sd.ellipsoid(x, y, z, 0.0450, FP[i][0][1], FP[i][0][2] + 0.005, 0.0068, 0.0092, 0.0120), 0.004);
    // the padded panel on the back of the hand, square to the forearm
    { const u = hu(x, y, z), v = hv(x, y, z); b = sd.smin(b, sd.rbox(x, v, u, 0.0440, 0.002, 0.056, 0.0040, 0.027, 0.0150, 0.0035), 0.004); }
    b = sd.smin(b, c(x, y, z, CA[0], CA[1], CA[2], CB[0], CB[1], CB[2], 0.0335, 0.0350), 0.014);
    if (o) { o[0] = fm; o[1] = fi; o[2] = b; }
    return sd.smin(b, fg, 0.009);
  }
  // the grip it is closed round (for the shading in the creases only)
  const gripSD = (x, y, z) => Math.max(Math.hypot(x, z) - (y > 0.058 ? 0.0222 : POLE.r), y - 0.09);
  function glove(A) {
    const t0 = Date.now(), q = [0, 0, 0], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], o = [0, 0, 0];
    for (let c = 0; c < 8; c++) { const p = fromHand([c & 1 ? 0.066 : -0.054, c & 2 ? 0.078 : -0.100, c & 4 ? 0.170 : -0.056]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
    const f = (x, y, z) => { toHand(x, y, z, q); return gloveSD(q[0], q[1], q[2]); };
    const occ = (x, y, z, nx, ny, nz, h) => Math.min(gloveSD(x + nx * h, y + ny * h, z + nz * h), gripSD(x + nx * h, y + ny * h, z + nz * h)) / h;
    const m = meshSDF(f, lo, hi, F.cell || 0.003, { stride: 4, repair: true });
    const base = A.n(), n = [0, 0, 0], Rn = (x, y, z) => { n[0] = x; n[1] = HC * y - HS * z; n[2] = HS * y + HC * z; };
    for (let i = 0; i < m.nv; i++) {
      const p = i * 10, x = m.verts[p], y = m.verts[p + 1], z = m.verts[p + 2]; toHand(x, y, z, q); Rn(m.verts[p + 3], m.verts[p + 4], m.verts[p + 5]);
      // how open each spot is: between the fingers, under the thumb, against the grip it is dark
      const ao = clamp(0.15 + 0.85 * occ(q[0], q[1], q[2], n[0], n[1], n[2], 0.009), 0.12, 1);
      // toward the wrist the glove goes over from the hand to the forearm (the same way the sleeve's gaiter over it does)
      const wa = smooth(-0.015, 0.040, z + LA);
      // the lower three fingers can let the pole swing: how much of that each spot goes along with (nothing at the knuckle, all of it a finger's width along)
      gloveSD(q[0], q[1], q[2], o);
      let ang = Math.atan2(-q[2], q[0]); if (ang < -1.2) ang += TAU;       // (round the grip, from the back of the hand toward the front and on to the fingertips)
      const fo = o[0] < o[2] + 0.0015 ? FOPEN[o[1]] * smooth(0.55, 1.25, ang) * smooth(0.0015, -0.003, o[0] - o[2]) : 0;
      A.vert([x, y, z], [m.verts[p + 3], m.verts[p + 4], m.verts[p + 5]], [2, ao, fo, n[0]], [BN.farm, BN.hand, wa, 1], [q[0], q[1], q[2], o[0] < o[2] ? 1 + o[1] : 0]);
    }
    for (let i = 0; i < m.ni; i++) A.ix.push(base + m.idx[i]);
    F.stats.gloveMs = Date.now() - t0; F.stats.gloveV = m.nv;
  }
  // the pole's leash: a band of webbing from the top of the grip down over the web of the thumb and once round the hand above the wrist.
  // Its path is laid on the glove itself (each point is let down onto the surface), so it lies on the hand and not through it
  function leash(A) {
    const K = [[0.002, 0.079, 0.012], [0.006, 0.070, 0.024], [0.013, 0.058, 0.038]], N = 64, pts = [], nrm = [], e = 0.0015;
    for (let a = 75; a >= -292; a -= 26) { const ph = a * PI / 180, u = 0.036 + 0.012 * Math.cos(ph - 1.25), r = 0.05; K.push([HW[0] + r * Math.cos(ph), HW[1] + N0[1] * u + R0[1] * r * Math.sin(ph), HW[2] + N0[2] * u + R0[2] * r * Math.sin(ph)]); }
    const grad = p => v3.norm([gloveSD(p[0] + e, p[1], p[2]) - gloveSD(p[0] - e, p[1], p[2]), gloveSD(p[0], p[1] + e, p[2]) - gloveSD(p[0], p[1] - e, p[2]), gloveSD(p[0], p[1], p[2] + e) - gloveSD(p[0], p[1], p[2] - e)]);
    for (let i = 0; i <= N; i++) {
      const u = i / N * (K.length - 1), k = Math.min(Math.floor(u), K.length - 2), t = u - k, a = K[Math.max(k - 1, 0)], b = K[k], c = K[k + 1], d = K[Math.min(k + 2, K.length - 1)];
      let p = [0, 1, 2].map(m => 0.5 * (2 * b[m] + (c[m] - a[m]) * t + (2 * a[m] - 5 * b[m] + 4 * c[m] - d[m]) * t * t + (3 * b[m] - 3 * c[m] + d[m] - a[m]) * t * t * t));
      // (off the grip it hangs free for a thumb's width before it meets the glove)
      const w = smooth(0.8, 2.6, u); let g = grad(p);
      for (let it = 0; it < 4; it++) { const dd = gloveSD(p[0], p[1], p[2]) - 0.0024; p = v3.mad(p, g, -dd * w); g = grad(p); }
      pts.push(p); nrm.push(g);
    }
    const ring = [[-1, 0.5], [-0.6, 1], [0.6, 1], [1, 0.5], [1, -0.5], [0.6, -1], [-0.6, -1], [-1, -0.5]], hw = 0.0090, ht = 0.0014;
    sheet(A, N + 1, 8, (i, j) => {
      const p = pts[i], T = v3.norm(v3.sub(pts[Math.min(i + 1, N)], pts[Math.max(i - 1, 0)])), nn = nrm[i], B = v3.norm(v3.cross(T, nn)), Nn = v3.cross(B, T);
      return fromHand(v3.add(v3.mad(p, B, ring[j][0] * hw), v3.mul(Nn, ring[j][1] * ht)));
    }, (i, j, p) => [[4, i < 4 ? 0.6 : 0.9, 0, 0], [BN.pole, BN.hand, 1 - smooth(0, 9, i), 0], [i / N * 0.62, ring[j][0], ring[j][1], 0]], true, true);
  }

  // ---- the sleeve: the shell from the shoulder to its cuff, the hem turned in, and the stretch gaiter that runs on from under it over the
  // glove's cuff. s: metres from the shoulder along the straight arm
  const SL_R = 0.072, SL_HEM = LA - 0.022, SL_END = LA + 0.007, TAB = [LA - 0.048, 1.95];       // the cuff tab: where along the arm, and at what angle round it
  function sleeveR(s) {
    if (s <= 0) return SL_R * Math.sqrt(Math.max(1 - (s / SL_R) * (s / SL_R), 0));
    const r = s < L1 ? lerp(SL_R, 0.0645, s / L1) : lerp(0.0645, 0.0525, smooth(L1, LA - 0.06, s) * 0.55 + 0.45 * sat((s - L1) / (LA - 0.06 - L1)));
    return lerp(r, 0.0462, 0.85 * smooth(LA - 0.085, LA - 0.032, s)) + 0.0025 * Math.exp(-Math.pow((s - L1) / 0.045, 2));      // (the cuff is drawn in by its tab)
  }
  function sleeve(A) {
    const NJ = 44, st = [];
    for (let i = 0; i <= 7; i++) st.push(-SL_R * Math.cos(i / 7 * PI / 2) + 1e-5 * (i === 0 ? 1 : 0));
    for (let s = 0.0055; s < SL_HEM - 0.006; s += (s > L1 - 0.10 && s < L1 + 0.11) || s > LA - 0.16 ? 0.0048 : 0.0075) st.push(s);
    st.push(SL_HEM - 0.0057, SL_HEM - 0.0033, SL_HEM - 0.0013, SL_HEM);
    const bones = s => s < L1 - 0.05 ? [BN.uarm, BN.uarm, 1, 0] : s < LA - 0.045 ? [BN.farm, BN.uarm, smooth(L1 - 0.05, L1 + 0.05, s), smooth(L1 - 0.02, LA - 0.03, s)] : [BN.farm, BN.hand, smooth(-0.015, 0.040, LA - s), 1];
    const tab = (s, th) => { let a = th - TAB[1]; a -= TAU * Math.round(a / TAU); return smooth(0.50, 0.42, Math.abs(a)) * smooth(0.0135, 0.0105, Math.abs(s - TAB[0])); };
    const lip = s => s > SL_HEM - 0.0065 ? [0.0002, 0.0011, 0.0009, -0.0008][Math.min(3, Math.round((s - SL_HEM + 0.0057) / 0.0019))] : 0;
    // the shell
    sheet(A, st.length, NJ, (i, j) => { const s = st[i], th = j / NJ * TAU, r = Math.max(sleeveR(s) + 0.0021 * tab(s, th) + lip(s), 1e-4); return [r * Math.cos(th), r * Math.sin(th), -s]; },
      (i, j) => { const s = st[i], th = j / NJ * TAU; return [[1, lerp(1, 0.8, smooth(SL_HEM - 0.0105, SL_HEM, s)), 0, tab(s, th)], bones(Math.max(s, 0)), [s, th, sleeveR(s), 0]]; }, true, false);
    // the hem's end, turned in toward the hand
    { const rr = [sleeveR(SL_HEM) - 0.0008, 0.0452, 0.0428, 0.0406], zz = [0, 0.0011, 0.0013, 0.0004];
      sheet(A, 4, NJ, (i, j) => { const th = j / NJ * TAU; return [rr[i] * Math.cos(th), rr[i] * Math.sin(th), -SL_HEM - zz[i]]; }, (i, j) => [[1, lerp(0.75, 0.35, i / 3), 1, 0], bones(SL_HEM), [SL_HEM, j / NJ * TAU, rr[i], 1]], true, false); }
    // the gaiter: thin stretch cloth, close on the glove
    { const gs = []; for (let s = SL_HEM + 0.0008; s < SL_END - 0.003; s += 0.0045) gs.push(s); gs.push(SL_END - 0.0026, SL_END - 0.0008, SL_END);
      const gr = s => lerp(0.0404, 0.0380, sat((s - SL_HEM) / (SL_END - SL_HEM))) + (s > SL_END - 0.003 ? (s > SL_END - 0.0004 ? -0.0006 : 0.0007) : 0);
      sheet(A, gs.length, NJ, (i, j) => { const th = j / NJ * TAU, r = gr(gs[i]); return [r * Math.cos(th), r * Math.sin(th), -gs[i]]; }, (i, j) => [[1, lerp(0.55, 1, smooth(SL_HEM, SL_HEM + 0.012, gs[i])), 2, 0], bones(gs[i]), [gs[i], j / NJ * TAU, gr(gs[i]), 2]], true, false);
      const rr = [gr(SL_END), 0.0362, 0.0340];
      sheet(A, 3, NJ, (i, j) => { const th = j / NJ * TAU; return [rr[i] * Math.cos(th), rr[i] * Math.sin(th), -SL_END - 0.0003 * i]; }, (i, j) => [[1, lerp(0.7, 0.3, i / 2), 2, 0], bones(SL_END), [SL_END, j / NJ * TAU, rr[i], 3]], true, false); }
  }

  // ---- the pole, shaped in its own space: the middle of the grip (inside the fist) at 0, the top of the grip toward +y, the fingers' side toward -z
  // (with the hand at rest that is the hand's own space: it is stored, like everything else, where it sits on the straight arm)
  function pole(A) {
    const NJ = 20, P = [], bk = POLE.basket;        // the outline it is turned from: [y, radius, which part: 0 grip, 1 shaft, 3 ferrule and tip]
    const add = (y, r, k) => P.push([y, r, k]);
    add(0.0868, 0.0006, 0); add(0.0864, 0.0090, 0); add(0.0850, 0.0152, 0); add(0.0822, 0.0190, 0); add(0.0780, 0.0206, 0); add(0.0725, 0.0204, 0); add(0.0670, 0.0190, 0); add(0.0615, 0.0176, 0); add(0.0570, 0.0168, 0);
    for (let y = 0.0525; y > -0.0520; y -= 0.0035) add(y, POLE.r, 0);
    add(-0.0560, 0.0172, 0); add(-0.0620, 0.0192, 0); add(-0.0680, 0.0196, 0); add(-0.0730, 0.0170, 0); add(-0.0790, 0.0120, 0); add(-0.0850, 0.0092, 1);
    for (let y = -0.11; y > -bk + 0.04; y -= 0.045) add(y, lerp(0.0090, 0.0062, sat((-y - 0.085) / 0.93)), 1);
    add(-bk + 0.022, 0.0062, 1); add(-bk + 0.016, 0.0100, 3); add(-bk + 0.006, 0.0118, 3); add(-bk - 0.006, 0.0118, 3); add(-bk - 0.012, 0.0080, 3); add(-bk - 0.035, 0.0056, 3); add(-POLE.len + 0.03, 0.0040, 3); add(-POLE.len, 0.0012, 3);
    // (the grip is deeper than it is wide, and moulded to the fingers down its front)
    const rad = (i, th) => { const y = P[i][0], r = P[i][1]; if (P[i][2] !== 0) return [r, r]; if (y > 0.056) return [r, r * lerp(1.14, 1.22, smooth(0.058, 0.075, y))]; const fr = smooth(0.1, -0.7, Math.sin(th)), ridge = y < 0.05 && y > -0.05 ? 0.0019 * (0.5 - 0.5 * Math.cos((y + 0.0535) / 0.0215 * TAU)) * fr : 0; return [r, r * 1.14 + ridge]; };
    sheet(A, P.length, NJ, (i, j) => { const th = j / NJ * TAU, r = rad(i, th); return fromHand([r[0] * Math.cos(th), P[i][0], r[1] * Math.sin(th)]); },
      (i, j) => [[5, 1, P[i][2], 0], [BN.pole, BN.pole, 1, 0], [P[i][0], j / NJ * TAU, P[i][1], P[i][2]]], true, true);
    // the basket: a shallow dish with a rolled rim (its holes are cut by the shader)
    const B = [[0.0118, 0.0030], [0.020, 0.0018], [0.032, 0.0002], [0.042, -0.0016], [0.0462, -0.0012], [0.0475, 0.0006], [0.0462, 0.0026], [0.042, 0.0030], [0.032, 0.0040], [0.020, 0.0052], [0.0118, 0.0060]], NB2 = 36;
    sheet(A, B.length, NB2, (i, j) => { const th = j / NB2 * TAU; return fromHand([B[i][0] * Math.cos(th), -bk - B[i][1], B[i][0] * Math.sin(th)]); },
      (i, j) => [[5, i > 5 ? 0.7 : 1, 2, 0], [BN.pole, BN.pole, 1, 0], [-bk, j / NB2 * TAU, B[i][0], 2]], true, true);
  }

  // ---- a ski, in its own space (the figure's foot: the middle of the ski on the snow at 0, the tip toward -z). The same outline, rise and
  // thickness as the figure's ski, so that its shadow fits; the section is a real one: base, steel edges, sidewalls, a bevel, a crowned topsheet
  const SKI = { tail: 0.80, tip: -0.965 };
  function skiShape(z) {
    let w = lerp(0.049, 0.058, smooth(0.15, 0.78, z)); w = lerp(w, 0.064, smooth(-0.15, -0.78, z));
    if (z < -0.80) w *= Math.sqrt(Math.max(1e-4, 1 - Math.pow((-z - 0.80) / 0.1655, 2))); if (z > 0.76) w *= Math.sqrt(Math.max(0.05, 1 - Math.pow((z - 0.76) / 0.045, 2)));
    const yb = 0.125 * Math.pow(smooth(-0.62, -0.96, z), 1.7) + 0.03 * Math.pow(smooth(0.66, 0.80, z), 2);
    const th = lerp(0.008, 0.020, smooth(0.80, 0.25, Math.abs(z + 0.05))) * lerp(0.6, 1, smooth(-0.965, -0.90, z));
    return [w, yb, th];
  }
  function ski(A) {
    const zs = []; for (let z = SKI.tail; z > SKI.tip + 0.0005; z -= z > 0.74 ? 0.006 : z > 0.55 ? 0.02 : z > -0.50 ? 0.04 : z > -0.90 ? 0.012 : z > -0.955 ? 0.005 : 0.0018) zs.push(z); zs.push(SKI.tip + 0.0004);
    const sh = zs.map(skiShape), n = zs.length, bone = [BN.ski, BN.ski, 1, 0];
    const bev = i => Math.min(0.0045, sh[i][0] * 0.5, sh[i][2] * 0.4);
    const face = (cols, zone, ao) => sheet(A, n, cols.length, (i, j) => { const c = cols[j](i); return [c[0], c[1], zs[i]]; }, (i, j, p) => [[8, ao, zone, 0], bone, [p[0], zs[i], p[1] - sh[i][1], sh[i][0]]], false, false);
    // topsheet (five across, a little crowned), then round the right side, the base, and back up the left
    const top = k => i => { const w = sh[i][0] - bev(i); return [-w * k, sh[i][1] + sh[i][2] + 0.0011 * (1 - k * k) * sat(sh[i][0] / 0.03)]; };
    face([top(-1), top(-0.5), top(0), top(0.5), top(1)], 3, 1);
    for (const sd2 of [1, -1]) {
      const c0 = i => [sd2 * (sh[i][0] - bev(i)), sh[i][1] + sh[i][2]], c1 = i => [sd2 * sh[i][0], sh[i][1] + sh[i][2] - bev(i)], c2 = i => [sd2 * sh[i][0], sh[i][1]];
      if (sd2 > 0) { face([c1, c0], 2, 1); face([c2, c1], 1, 0.9); } else { face([c0, c1], 2, 1); face([c1, c2], 1, 0.9); }
    }
    face([i => [-sh[i][0], sh[i][1]], i => [sh[i][0], sh[i][1]]], 0, 0.6);
  }

  // ---- all of it, once. The right side is built; the left is its mirror image (bones 5..9)
  F.build = function () {
    const t0 = Date.now(), A = acc();
    const cnt = {}; let last = 0; const mark = k => { cnt[k] = A.n() - last; last = A.n(); };
    sleeve(A); mark('sleeve'); glove(A); mark('glove'); leash(A); mark('leash'); pole(A); mark('pole'); ski(A); mark('ski');
    const nv = A.n(), V = new Float32Array(nv * 2 * VSZ), I = new Uint32Array(A.ix.length * 2);
    V.set(A.v); I.set(A.ix);
    for (let i = 0; i < nv; i++) { const o = i * VSZ, m = (nv + i) * VSZ; for (let k = 0; k < VSZ; k++) V[m + k] = A.v[o + k]; V[m] = -V[m]; V[m + 3] = -V[m + 3]; V[m + 10] += 5; V[m + 11] += 5; }
    for (let i = 0; i < A.ix.length; i += 3) { const o = A.ix.length + i; I[o] = A.ix[i] + nv; I[o + 1] = A.ix[i + 2] + nv; I[o + 2] = A.ix[i + 1] + nv; }
    F.mesh = { V, I, nv: nv * 2, ni: I.length }; F.stats.verts = nv * 2; F.stats.tris = I.length / 3; F.stats.parts = cnt; F.stats.buildMs = Date.now() - t0;
    return F.mesh;
  };

  // ---- the arm that carries it. Worked out for a right arm in the figure's own space (origin on the snow between the skis, +y up from the
  // snow, -z the way the skis point); the left arm is the same thing in a mirror.
  // The figure hands over where each fist is, which way its pole points and where its elbow hangs. Here the hand gets what the figure has not:
  // a wrist. A fist holds a pole square to the back of the hand, so the pole says how the forearm is turned (as far as a forearm turns); how
  // far the pole leans from the forearm is shared between the wrist bending and the pole turning in the fist, the lower fingers opening to
  // let it swing forward for a plant.
  const LIM = { tw0: 0.20, twLo: -1.20, twHi: 1.45, wU: 0.63, wR: 0.40, pBack: 0.20, pFwd: 0.80, skew: 0.14 };
  const wrapPi = a => a - TAU * Math.round(a / TAU);
  function solveArm(A, S, G, d, Eh, hold, T, dt) {
    let a = v3.mul(d, -1), E = Eh, f = v3.norm(v3.sub(G, E)), W = v3.mad(G, f, -0.087), hx, hy, hz, ap, Xf, Yf, tau = A.tau, dW = 0, dP = 0, bS = 0, PV = G;
    for (let it = 0; it < 4; it++) {
      // the elbow, on the side the figure's elbow is on
      const mid = v3.lerp(S, W, 0.5), dn = v3.norm(v3.sub(W, S)); let p = v3.sub(Eh, mid); p = v3.sub(p, v3.mul(dn, v3.dot(p, dn))); if (v3.len(p) < 1e-4) p = [0, -1, 0.3]; p = v3.norm(p);
      const L = v3.len(v3.sub(W, S)), Lc = clamp(L, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 2e-4), x = (L1 * L1 - L2 * L2 + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
      if (it === 3) { const sh = v3.sub(v3.mad(S, dn, Lc), W); W = v3.add(W, sh); G = v3.add(G, sh); PV = v3.add(PV, sh); }      // (a hand out of reach is brought back within it, the last time round)
      E = v3.add(v3.mad(S, dn, x), v3.mul(p, h));
      f = v3.norm(v3.sub(W, E)); Xf = v3.norm(v3.cross(p, dn)); Xf = v3.norm(v3.sub(Xf, v3.mul(f, v3.dot(Xf, f)))); Yf = v3.cross(Xf, f);
      if (it === 3) break;
      if (hold > 0 && T) a = v3.norm(v3.lerp(a, v3.norm(v3.sub(PV, T)), hold));
      // how the forearm is turned: the pole asks, the forearm goes as far as it can (and a pole laid along the forearm does not ask)
      if (it === 0) {
        const ax = v3.dot(a, Xf), ay = v3.dot(a, Yf), D = wrapPi(Math.atan2(-ax, ay) - LIM.tw0), hi = LIM.twHi - LIM.tw0, lo = LIM.twLo - LIM.tw0;
        const g = (D > 0 ? hi * Math.tanh(D / hi) : lo * Math.tanh(D / lo)) * smooth(PI, 2.2, Math.abs(D));
        const want = LIM.tw0 + smooth(0.10, 0.40, Math.hypot(ax, ay)) * g;
        tau = A.init || !(dt > 0) ? (A.init ? want : A.tau) : damp(A.tau, want, 16, dt);
      }
      const ct = Math.cos(tau), sn = Math.sin(tau), r = v3.add(v3.mul(Yf, ct), v3.mul(Xf, -sn)); hx = v3.add(v3.mul(Xf, ct), v3.mul(Yf, sn));
      // how far the pole leans from the forearm (0 = along it, positive toward the thumb's side), and how far it stands out of the hand's own plane
      let th = Math.atan2(v3.dot(a, r), v3.dot(a, f)); if (th < -PI / 2) th += TAU;
      const be = Math.asin(clamp(v3.dot(a, hx), -1, 1)), del = th - TH0;
      dW = del < 0 ? Math.max(del * 0.72, -LIM.wU) : Math.min(del * 0.35, LIM.wR); dP = clamp(del - dW, -LIM.pBack, LIM.pFwd);
      const rest = del - dW - dP; dW = clamp(dW + rest * lerp(0.15, 1, hold), -0.78 - 1.2 * hold, 0.60 + 1.15 * hold);      // (what is left over a planted pole takes from the wrist all the same: its tip is held; a free pole just does not go all the way)
      bS = clamp(be, -LIM.skew, LIM.skew); bS += (be - bS) * hold;
      const cw = Math.cos(TH0 + dW), sw = Math.sin(TH0 + dW); hy = v3.add(v3.mul(f, cw), v3.mul(r, sw)); hz = v3.cross(hx, hy);
      const tp = TH0 + dW + dP, cb = Math.cos(bS); ap = v3.norm(v3.add(v3.add(v3.mul(f, Math.cos(tp) * cb), v3.mul(r, Math.sin(tp) * cb)), v3.mul(hx, Math.sin(bS))));
      PV = v3.mad(G, hy, POLE.piv);
      W = v3.add(G, v3.add(v3.add(v3.mul(hx, HW[0]), v3.mul(hy, HW[1])), v3.mul(hz, HW[2])));
    }
    A.tau = tau; A.twist = Math.atan2(v3.dot(hx, Yf), v3.dot(hx, Xf)); A.dW = dW; A.dP = dP; A.bS = bS; A.open = smooth(0.10, 0.75, dP) * 1.5; A.bend = Math.acos(clamp(v3.dot(v3.norm(v3.sub(E, S)), f), -1, 1));
    A.S = S; A.E = E; A.W = W; A.G = G; A.hx = hx; A.hy = hy; A.hz = hz; A.ap = ap; A.f = f; A.Xf = Xf; A.Yf = Yf;
    // ---- what each part is carried by
    const Zu = v3.norm(v3.sub(S, E)), Xu = v3.norm(v3.sub(Xf, v3.mul(Zu, v3.dot(Xf, Zu)))), Zf = v3.mul(f, -1);
    A.m[0] = m4.fromBasis(Xu, v3.cross(Zu, Xu), Zu, S);
    A.m[1] = m4.fromBasis(Xf, Yf, Zf, v3.mad(E, Zf, L1));
    const c1 = v3.add(v3.mul(hy, HC), v3.mul(hz, HS)), c2 = v3.add(v3.mul(hy, -HS), v3.mul(hz, HC));
    A.m[2] = m4.fromBasis(hx, c1, c2, v3.mad(W, c2, LA));
    const Zp = v3.norm(v3.sub(hz, v3.mul(ap, v3.dot(hz, ap)))), O = v3.mad(PV, ap, -POLE.piv);
    A.m[3] = m4.mul(m4.fromBasis(v3.cross(ap, Zp), ap, Zp, O), AH); A.tip = v3.mad(O, ap, -POLE.len); A.O = O;
    return A;
  }
  F.solveArm = solveArm; F.LIM = LIM;

  // ---- where the hands are held, seen from the eyes (Variants 'fphand' b)
  // A skier holds the hands out in front, a little wider than the shoulders, elbows bent: "where you can see them" is how it is taught, and it is
  // how they show in a helmet camera's picture (ski/fpv/参考图: a fist in each lower corner, the shafts running down and back out of the
  // picture). The figure is posed to be seen from five metres: its head is well forward over its hands, its arms all but straight, and from
  // the lens over that head its fists were straight down, under the foot of the picture (measured 2026-11-18, 40 s of linked turns: both
  // hands out of the picture 97% of the time on the snow, 0.1-0.3 m ahead of the lens and 0.6 m under it). What was done about it only ever
  // pushed a hand further down and out (07b_views.js, fpArms). So here each hand is carried to where a skier holds it, measured from the lens
  // in the body's own frame (across the shoulders, up the trunk, ahead): CARRY. What the figure does with it besides (the reach for a plant, a
  // double-pole stroke, a hand thrown up by a bump) is kept: the hand's place off the shoulder, less its own slow average (mean, about a second).
  // out: m to the side of the lens; dn: m below it; fw: m ahead; keep: how much of the figure's own motion is kept; reach: the most from shoulder to fist (m).
  const CARRY = F.CARRY = { out: 0.30, dn: 0.50, fw: 0.26, keep: 0.85, mean: 1.1, reach: 0.52 };
  if (typeof Variants !== 'undefined') Variants.def('fphand', '第一视角手位', [['a', '原来'], ['b', '手在面前']], 'b');
  const LENSCUT = F.LENSCUT = [0.80, 1.00, 0, 0], YAWMAX = 0.6;
  const carryOn = () => typeof Variants === 'undefined' || Variants.val.fphand !== 'a';
  F.carryOn = carryOn;
  // the lens and the body's frame, in the figure's space (the camera is placed before the figure is posed: this frame's)
  function carryFrame() {
    const c = typeof Render !== 'undefined' && Render.cam, R = Skier.world && Skier.world.root; if (!c || !R) return null;
    const o = Render.origin || [0, 0, 0], q = [c.pos[0] - o[0] - R[12], c.pos[1] - o[1] - R[13], c.pos[2] - o[2] - R[14]];
    const C = [q[0] * R[0] + q[1] * R[1] + q[2] * R[2], q[0] * R[4] + q[1] * R[5] + q[2] * R[6], q[0] * R[8] + q[1] * R[9] + q[2] * R[10]];
    // The frame is the eyes' own, as they are carried by the body (07b_views.js, Game.fpBody: where the head faces and how far the lens is tipped
    // with the lean, without the player's looking about): the hands go with the upper body, which faces down the hill with the head while the skis
    // swing under it, so they stay put in the picture through linked turns (in the skis' frame they swung across it by most of its width each
    // turn, and both were in it together 4% of the time); and they are held out level, under the eyes, not down along a trunk bowed forward.
    // ahead, across, up: in the world, then in the figure's space
    const B = Game.fpBody; let fw, X, U;
    if (B) { fw = [Math.sin(B.yaw), 0, -Math.cos(B.yaw)]; const xh = [Math.cos(B.yaw), 0, Math.sin(B.yaw)], cr = Math.cos(B.roll), sr = Math.sin(B.roll); X = [xh[0] * cr, sr, xh[2] * cr]; U = [-xh[0] * sr, cr, -xh[2] * sr]; }
    else { fw = [-R[8], -R[9], -R[10]]; X = [R[0], R[1], R[2]]; U = [R[4], R[5], R[6]]; }
    const m = v => [v[0] * R[0] + v[1] * R[1] + v[2] * R[2], v[0] * R[4] + v[1] * R[5] + v[2] * R[6], v[0] * R[8] + v[1] * R[9] + v[2] * R[10]];
    const Zm = m(fw); let Xm = m(X), Um = m(U), Z = [-Zm[0], -Zm[1], -Zm[2]];
    // (but the hands are held out in front of the chest, not the eyes: turned hard, a hockey stop, the skis and the body swing across under
    // eyes that keep looking down the hill, and held off the eyes the hands were reached round across the body, an arm twisted through its
    // sleeve. So the frame is turned back toward where the shoulders face, to within YAWMAX of it: the hands go round with the body)
    const J = Skier.world.J;
    if (J && J.shL && J.shR) {
      const sx = J.shR[0] - J.shL[0], sz = J.shR[2] - J.shL[2], fa = Math.atan2(sz, sx) /* where the shoulders face, about +y: 0 = ahead (-z), + toward +x */, fe = Math.atan2(Zm[0], -Zm[2]);
      let d = Math.atan2(Math.sin(fe - fa), Math.cos(fe - fa)); const ex = d - clamp(d, -YAWMAX, YAWMAX);
      if (ex !== 0) { const c = Math.cos(-ex), sn = Math.sin(-ex), ry = v => [v[0] * c - v[2] * sn, v[1], v[0] * sn + v[2] * c]; Xm = ry(Xm); Um = ry(Um); Z = ry(Z); }
      F.yawOff = ex;
    }
    return { C, X: Xm, U: Um, Z };
  }
  function carry(A, k, sg, G1, Sh, w, cf, dt) {
    if (!cf) return G1;
    // (in the mirrored space the left hand is worked in, the right's numbers do for it)
    const C = mir(cf.C, sg), X = mir(cf.X, sg), U = mir(cf.U, sg), Z = mir(cf.Z, sg);
    // (across runs from the left shoulder to the right; mirrored it points to the left, and the left hand's outside is the other way)
    const ox = sg > 0 ? X : v3.mul(X, -1);
    const H = v3.add(v3.add(v3.mad(C, ox, CARRY.out), v3.mul(U, -CARRY.dn)), v3.mul(Z, -CARRY.fw));
    // the figure's own motion of this hand, about its slow average, off its shoulder
    const r = v3.sub(G1, Sh);
    if (!A.cm || A.init || !(dt > 0)) A.cm = r.slice();
    else { const e = 1 - Math.exp(-dt / CARRY.mean); for (let i = 0; i < 3; i++) A.cm[i] += (r[i] - A.cm[i]) * e; }
    let T = v3.mad(H, v3.sub(r, A.cm), CARRY.keep);
    // (and never further from the shoulder than a bent arm holds it: the shoulders turn with the trunk, the lens with the head, and with the
    // trunk turned away a hand held off the lens was out at the end of a straight arm, its glove and pole twisted round the wrist)
    { const v = v3.sub(T, Sh), l = v3.len(v), lm = CARRY.reach; if (l > lm) T = v3.mad(Sh, v, lm / l); }
    // the elbow is let hang down and a little out, as a held arm's does, not wherever the figure's was (that one came up beside the lens
    // and the sleeve was cut open by the near plane: black shards across the picture). solveArm only takes the side the elbow bends to from it
    A.eh = v3.lerp(A.eh0, v3.add(v3.add(Sh, v3.mul(ox, 0.14)), v3.add(v3.mul(U, -0.32), v3.mul(Z, 0.04))), w);
    return v3.lerp(G1, T, w);
  }
  F.carryFrame = carryFrame;

  // ---- each frame: the figure's pose (as it will be drawn this frame) is taken over, with a little weight of its own added
  const mkSide = sg => ({ sg, init: true, init0: true, tau: LIM.tw0, dW: 0, dP: 0, bS: 0, open: 0, bend: 0, o: [0, 0, 0], ov: [0, 0, 0], pd: [0, 0], pdv: [0, 0], m: [null, null, null, null, null], ski: null });
  const SD = [mkSide(1), mkSide(-1)], mir = (p, sg) => sg > 0 ? p : [-p[0], p[1], p[2]];
  const flipM = m => { const o = m.slice(); o[1] = -o[1]; o[2] = -o[2]; o[4] = -o[4]; o[8] = -o[8]; o[12] = -o[12]; return o; };
  const PH = { v: null, a: [0, 0, 0], dt: 0, own: 1, snow: 0.22, slide: 0 };       // the skier's change of speed as the body feels it (figure's space), the step to take, how much of the hands' own motion shows
  F.sides = SD; F.phys = PH;
  // s: the figure's solve (model space); root: {pos, fwd, nrm}; dt: seconds since the last pose (0: no time has passed)
  F.pose = function (s, root, dt) {
    const J = s.J, Sk = typeof Skier !== 'undefined' ? Skier : null, G = typeof Game !== 'undefined' ? Game : null, S = G && G.s, ps = G && G.pose || {};
    // what the body is being pushed by: the change of the skier's velocity, turned into the figure's axes, eased over a couple of frames
    if (S && dt > 0) {
      const Y = v3.norm(root.nrm), X = v3.norm(v3.cross(Y, v3.mul(root.fwd, -1))), Z = v3.cross(X, Y), v = S.v;
      if (PH.v) { const k = 1 / dt, ax = clamp((v[0] - PH.v[0]) * k, -60, 60), ay = clamp((v[1] - PH.v[1]) * k, -60, 60), az = clamp((v[2] - PH.v[2]) * k, -60, 60), e = 1 - Math.exp(-dt * 30);
        const m = [X[0] * ax + X[1] * ay + X[2] * az, Y[0] * ax + Y[1] * ay + Y[2] * az, Z[0] * ax + Z[1] * ay + Z[2] * az]; for (let i = 0; i < 3; i++) PH.a[i] += (m[i] - PH.a[i]) * e; }
      PH.v = [v[0], v[1], v[2]];
    } else if (!S) PH.a[0] = PH.a[1] = PH.a[2] = 0;
    const tuck = sat(ps.tuck || 0), own = PH.own, fq = ps.dp || 0, dropK = smooth(0, 0.7, F.tk || 0);
    // (a double-pole stroke seen from the helmet: the figure plants its hands at hip height half an arm ahead, which from the eyes is below the
    // picture, and in the drive the head goes forward over them faster than they go back. So for this view the hands are carried higher and
    // further forward through the reach, still so as the tips go in (the pole goes on through where its tip was planted: below the picture), and
    // let down and out over the first part of the drive, out of the picture's lower corners. rch: how much, by the stroke's phase; dr: the drive)
    const dpOK = fq > 0 ? (1 - tuck) * (1 - sat(ps.air || 0)) * (1 - smooth(0.14, 0.5, Math.abs(ps.lean || 0))) : 0;
    const rch = dpOK > 0 ? smooth(0, 0.12, fq) * smooth(0.50, 0.24, fq) * dpOK : 0, dr = dpOK > 0 ? smooth(0.22, 0.46, fq) * smooth(0.62, 0.50, fq) * dpOK : 0;
    const cw = carryOn() ? own * (1 - tuck) * (1 - dropK) * (1 - sat(Math.max((ps.air || 0) / 0.5, G && G.flight ? G.flight.w || 0 : 0))) : 0, cf = cw > 0 ? carryFrame() : null;
    for (let k = 0; k < 2; k++) {
      const A = SD[k], sg = A.sg, n = sg > 0 ? 'R' : 'L', hold = sat(J['planted' + n] || 0);
      const Sh = mir(J['sh' + n], sg), Eh = mir(J['elbow' + n], sg), G0 = mir(J['grip' + n], sg), d0 = mir(J['poleD' + n], sg), T = mir(J['tip' + n], sg), acc = mir(PH.a, sg);
      // the hand: carried where the figure has it, hanging back a little from every shove (a landing drops it, a turn swings it wide), and settling
      if (A.init || !(dt > 0)) { A.o[0] = A.o[1] = A.o[2] = 0; A.ov[0] = A.ov[1] = A.ov[2] = 0; A.pd[0] = A.pd[1] = 0; A.pdv[0] = A.pdv[1] = 0; }
      else {
        const w = 15, z = 0.5, free = (1 - 0.7 * hold) * (1 - 0.6 * tuck), km = [0.0030, 0.0042, 0.0026];
        for (let i = 0; i < 3; i++) { const to = clamp(-acc[i] * km[i], -0.07, 0.07) * free; A.ov[i] = (A.ov[i] + w * w * (to - A.o[i]) * dt) / (1 + 2 * z * w * dt + w * w * dt * dt); A.o[i] = clamp(A.o[i] + A.ov[i] * dt, -0.09, 0.09); }
        // the pole: hung from the fist, it swings a little behind every move of the hand (not once its tip is in the snow, nor clamped under an arm)
        const wp = 11, zp = 0.32, fr = (1 - hold) * (1 - tuck);
        for (let i = 0; i < 2; i++) { const to = clamp(-(i ? acc[2] : acc[0]) * 0.011 - A.ov[i ? 2 : 0] * 0.35, -0.16, 0.16) * fr; A.pdv[i] = (A.pdv[i] + wp * wp * (to - A.pd[i]) * dt) / (1 + 2 * zp * wp * dt + wp * wp * dt * dt); A.pd[i] = clamp(A.pd[i] + A.pdv[i] * dt, -0.22, 0.22) * (hold >= 1 ? 0 : 1); }
      }
      let G1 = v3.mad(G0, A.o, own), d = v3.norm([d0[0] + A.pd[0] * own, d0[1], d0[2] + A.pd[1] * own]);
      // (where a skier's hands are, as the eyes see them: Variants 'fphand' b, carry())
      A.eh0 = Eh; A.eh = Eh; if (cw > 0) G1 = carry(A, k, sg, G1, Sh, cw, cf, dt);
      // (on the way down to the view of the ski tips the hands are let down and back, out of the picture behind the lens, before they are left out)
      if (dropK > 0) { G1[0] += 0.10 * dropK; G1[1] -= 0.45 * dropK; G1[2] += 0.32 * dropK; }
      // (a hand on a planted pole stays the pole's length from where the tip went in)
      if (hold > 0) { const dv = v3.sub(G1, T), l = v3.len(dv) || 1, l0 = v3.len(v3.sub(G0, T)); G1 = v3.lerp(G1, v3.mad(T, dv, l0 / l), hold); }
      if (rch > 0 || dr > 0) { G1[0] += (0.15 * rch + 0.16 * dr) * own; G1[1] += 0.21 * rch * own; G1[2] -= (0.16 * rch + 0.22 * dr) * own; }
      // (and a fist never comes in past a hand's breadth of the body's middle: from the helmet two fists that meet there are seen to cross, the
      // forearms in an X. A soft floor, nothing kept from frame to frame: well out to its own side a hand is not touched at all)
      { const mid = sg * (J.shR[0] + J.shL[0]) * 0.5, h = Math.max(0.08 - Math.abs(G1[0] - mid - 0.15), 0) / 0.08; G1[0] = Math.max(G1[0], mid + 0.15) + h * h * 0.02; }
      solveArm(A, Sh, G1, d, A.eh, hold, T, dt);
      A.init = false; A.hold = hold;
      A.M = A.M || []; for (let i = 0; i < 4; i++) A.M[i] = sg > 0 ? A.m[i] : flipM(A.m[i]);
      A.foot = s.F[Sk ? Sk.B['foot' + n] : (sg > 0 ? 15 : 12)];
      A.tipW = mir(A.tip, sg);
    }
    // (in soft snow, seen from down among them, the skis run a finger's breadth under the snow: it lies over them, and only the shovels ride up out of it)
    { const snk = S ? (tv().sink || 0) * smooth(0.3, 0.6, sat(S.powder || 0)) * (F.tk || 0) * (S.air ? 0 : 1) : 0; PH.sink = dt > 0 && !SD[0].init0 ? damp(PH.sink || 0, snk, 9, dt) : snk; }
    slide(dt);
    // (and in the view of the ski tips they are two tips side by side at the foot of the picture: drawn a little closer together than the feet
    // stand, and in a turn not as far apart, as far one ahead of the other or as far over on their edges as the legs have them. Seen from down
    // between them a ski set fifty degrees on its edge is a blade, and the inside one is gone under the lens)
    const T = tv(), tq = F.tk || 0;
    for (let k = 0; k < 2; k++) {
      const m = SD[k].foot.slice(), d = PH.slide, sg = SD[k].sg;
      if (tq > 0) {
        const g = (T.gather || 0) * tq, e = Math.atan2(m[4], m[5]), dl = e * (T.flat || 0) * tq, c = Math.cos(dl), sn = Math.sin(dl);
        for (let i = 0; i < 3; i++) { const x = m[i], y = m[4 + i]; m[i] = x * c + y * sn; m[4 + i] = y * c - x * sn; }
        // (a ski on its edge stands that much higher at its middle: it comes back down as it is laid flatter)
        m[12] -= sg * T.close * tq + g * (m[12] - sg * 0.16); m[13] -= 0.049 * (Math.sin(Math.abs(e)) - Math.sin(Math.abs(e - dl))); m[14] *= 1 - 0.6 * g;
      }
      m[12] -= m[8] * d; m[13] -= m[9] * d + PH.sink; m[14] -= m[10] * d; SD[k].M[4] = m;
    }
    F.posed = true;
  };
  // ---- the skis' tips. From a helmet the tips lie along the very foot of the picture or under it (a lens wide enough to hold them and the
  // horizon both would bend the world). So, as a first-person game draws what its player holds where the player can see it, the skis are drawn
  // slid forward along their own line, on the snow as they are, just far enough to keep their tips in the picture, and never further than
  // SLIDE.max; as the eyes drop toward them they go back under the boots, and are there before the boots can be seen. Slowly on the way
  // out: what the tips do from moment to moment over the snow stays theirs.
  const SLIDE = { y: -0.70, max: 0.46, out: 2.2, back: 7 };
  // (the view of the ski tips has numbers of its own for this and for the snow, in 07b_views.js, where its versions are kept: what they are now)
  const TV0 = { slideY: -0.50, slideMax: 0.30, close: 0.04, lens: 0.06, blur: 0.04, sink: 0.020, gather: 1, flat: 0.55 }, tv = () => (typeof Game !== 'undefined' && Game.viewDefs && Game.viewDefs.tips && Game.viewDefs.tips.lens != null ? Game.viewDefs.tips : TV0);
  function slide(dt) {
    let want = 0; const tk = F.tk || 0, mx = lerp(SLIDE.max, tv().slideMax, tk);
    try {
      const c = Render.cam, R = Skier.world.root, o = Render.origin || [0, 0, 0], a = SD[0].foot, b = SD[1].foot;
      if (c && c.up && R && a && b) {
        // (the middle of the two tips' upper ends, and the way the skis point)
        const P = m4.tp(R, [(a[12] + b[12]) * 0.5 + (a[4] + b[4]) * 0.0685 - (a[8] + b[8]) * 0.4775, (a[13] + b[13]) * 0.5 + (a[5] + b[5]) * 0.0685 - (a[9] + b[9]) * 0.4775, (a[14] + b[14]) * 0.5 + (a[6] + b[6]) * 0.0685 - (a[10] + b[10]) * 0.4775]);
        const dm = [-(a[8] + b[8]) * 0.5, -(a[9] + b[9]) * 0.5, -(a[10] + b[10]) * 0.5], D = [R[0] * dm[0] + R[4] * dm[1] + R[8] * dm[2], R[1] * dm[0] + R[5] * dm[1] + R[9] * dm[2], R[2] * dm[0] + R[6] * dm[1] + R[10] * dm[2]];
        const v = [P[0] - c.pos[0] + o[0], P[1] - c.pos[1] + o[1], P[2] - c.pos[2] + o[2]], k = lerp(SLIDE.y, tv().slideY, tk) * Math.tan(c.fovY / 2), a0 = v3.dot(v, c.up), a1 = v3.dot(D, c.up), b0 = v3.dot(v, c.fwd), b1 = v3.dot(D, c.fwd), den = a1 - k * b1;
        // (how far along D the tip has to go to stand at SLIDE.y of the picture's half height)
        const raw = b0 > 0.15 && den > 0.05 ? (k * b0 - a0) / den : (a0 < 0 ? mx : 0);
        want = sd.smin(-sd.smin(-raw, 0, 0.06), mx, 0.10);
      }
    } catch (_) { want = 0; }
    PH.slide = SD[0].init0 || !(dt > 0) ? (SD[0].init0 ? want : PH.slide) : damp(PH.slide, want, want < PH.slide ? SLIDE.back : SLIDE.out, dt);
    SD[0].init0 = false; PH.slideWant = want;
  }
  F.SLIDE = SLIDE;

  // ---- the same sums the vertex shader does, for one vertex (tests and the headless preview use it; the page never does)
  // U: what the shader is told each frame: tw [right, left] the forearms' twist, open [r, l] how far the lower fingers have let go, bend [r, l] the elbows' bend, fl flutter, t time
  const KA = fromHand([KN[0], 0, KN[1]]), KD = [0, HC, -HS];
  function fold(s, th, bend, tw, fl, t) {
    const el = Math.exp(-Math.pow((s - L1) / 0.062, 2)), ins = Math.max(Math.sin(th), 0), b = sat(bend / 1.9);
    let h = 0.0065 * b * el * Math.pow(ins, 1.5) * Math.cos((s - L1) * TAU / 0.031 + 1.3 * Math.sin(th * 2)) - 0.0035 * b * el * Math.max(-Math.sin(th), 0);
    const fa = smooth(L1 - 0.02, L1 + 0.06, s) * smooth(LA - 0.035, LA - 0.075, s), ua = smooth(0.03, 0.10, s) * smooth(L1 + 0.01, L1 - 0.07, s);
    h += 0.0030 * fa * clamp(tw, -1.2, 1.2) * Math.sin(th * 2 + (s - L1) * 26 * (tw < 0 ? -1 : 1));
    h += 0.0032 * (fa + ua) * (Math.sin(th * 3 + s * 31) * Math.sin(s * 47 + 1.7) + 0.6 * Math.sin(th * 2 - s * 23 + 0.8));
    h += 0.0040 * smooth(LA - 0.13, LA - 0.07, s) * smooth(SL_HEM, SL_HEM - 0.012, s) * Math.sin(th * 5 + 9 * s + 2 * Math.sin(s * 140));
    h += 0.0030 * fl * (fa + ua) * Math.sin(th * 3 + s * 38 - t * 31) * Math.sin(th - t * 13 + s * 9);
    return h * smooth(-0.02, 0.05, s);
  }
  F.fold = fold;
  F.cpuVertex = function (i, U, M, out) {
    const V = F.mesh.V, o = i * VSZ; let x = V[o], y = V[o + 1], z = V[o + 2], nx = V[o + 3], ny = V[o + 4], nz = V[o + 5];
    const id = V[o + 6], ba = V[o + 10], bb = V[o + 11], wa = V[o + 12], twk = V[o + 13], k = ba >= 5 ? 1 : 0, sg = k ? -1 : 1;
    if (id === 2 && V[o + 8] > 0) {        // the lower fingers opening: a turn about the knuckles' line
      const a = -U.open[k] * V[o + 8] * sg, c = Math.cos(a), s = Math.sin(a), ax = 0, ay = KD[1], az = KD[2], px = x - KA[0] * sg, py = y - KA[1], pz = z - KA[2];
      const rot = (vx, vy, vz) => { const d = (ay * vy + az * vz) * (1 - c); return [vx * c + (ay * vz - az * vy) * s + ax * d, vy * c + (az * vx) * s + ay * d, vz * c + (-ay * vx) * s + az * d]; };
      const p = rot(px, py, pz), n = rot(nx, ny, nz); x = p[0] + KA[0] * sg; y = p[1] + KA[1]; z = p[2] + KA[2]; nx = n[0]; ny = n[1]; nz = n[2];
    }
    if (id === 1 && V[o + 8] < 0.5) {      // the shell's folds: pushed out along the normal, the normal leaned to match
      const s = V[o + 14], th = V[o + 15], r = Math.max(V[o + 16], 0.01), e = 0.004, h0 = fold(s, th, U.bend[k], U.tw[k] * sg, U.fl, U.t), hs = (fold(s + e, th, U.bend[k], U.tw[k] * sg, U.fl, U.t) - h0) / e, ht = (fold(s, th + 0.06, U.bend[k], U.tw[k] * sg, U.fl, U.t) - h0) / (0.06 * r);
      x += nx * h0; y += ny * h0; z += nz * h0;
      const tx = -Math.sin(th) * sg, ty = Math.cos(th); let mx = nx - ht * tx, my = ny - ht * ty, mz = nz + hs; const l = Math.hypot(mx, my, mz) || 1; nx = mx / l; ny = my / l; nz = mz / l;
    }
    // branch a takes the forearm's twist (a turn about the arm's own line)
    let ax = x, ay = y, anx = nx, any = ny;
    if (twk > 0) { const a = U.tw[k] * twk, c = Math.cos(a), s = Math.sin(a); ax = x * c - y * s; ay = x * s + y * c; anx = nx * c - ny * s; any = nx * s + ny * c; }
    const A = M[ba], B = M[bb], wb = 1 - wa;
    out[0] = (A[0] * ax + A[4] * ay + A[8] * z + A[12]) * wa + (B[0] * x + B[4] * y + B[8] * z + B[12]) * wb;
    out[1] = (A[1] * ax + A[5] * ay + A[9] * z + A[13]) * wa + (B[1] * x + B[5] * y + B[9] * z + B[13]) * wb;
    out[2] = (A[2] * ax + A[6] * ay + A[10] * z + A[14]) * wa + (B[2] * x + B[6] * y + B[10] * z + B[14]) * wb;
    out[3] = (A[0] * anx + A[4] * any + A[8] * nz) * wa + (B[0] * nx + B[4] * ny + B[8] * nz) * wb;
    out[4] = (A[1] * anx + A[5] * any + A[9] * nz) * wa + (B[1] * nx + B[5] * ny + B[9] * nz) * wb;
    out[5] = (A[2] * anx + A[6] * any + A[10] * nz) * wa + (B[2] * nx + B[6] * ny + B[10] * nz) * wb;
    return out;
  };
  // what the shader is told, from where the arms are now
  F.uniforms = function (t) { return { tw: [SD[0].twist, -SD[1].twist], open: [SD[0].open, SD[1].open], bend: [SD[0].bend, SD[1].bend], fl: PH.fl || 0, t: t || 0 }; };
  F.bones = function () { const M = []; for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) M[k * 5 + i] = SD[k].M[i]; return M; };


  // ---- on the page: buffers, the bones as a texture (like the figure's), one pipeline, and the figure asked to leave its own arms out
  let gfx = null, vb = null, ib = null, boneTex = null, pipe = null, figTex = null, figData = null, hideTex = null, hideIb = null, hideCount = 0, hideFor = null, skiIb = null, skiCount = 0;
  const RID = [[0, 0, 0, 0], [0, 0, 0, 0]], boneData = new Float32Array(4 * 16 * 4), hideData = new Float32Array(4 * 32 * 4), UNI = { tw: [0, 0, 0, 0], bend: [0, 0, 0, 0], ski: [0, 0, 0, 0], fx: [0, 0, 0, 0] };
  const fail = e => { if (!F.dead) { F.dead = true; F.vis = false; F.err = e; try { console.error('fpv: first person falls back to the figure\'s own arms', e); } catch (_) { } } };
  // (the figure's triangles without skis, poles and gloves: the list it is drawn from while these stand in for them)
  // (on a snowboard, Variants 'ride' b: none of these is drawn. The figure's own board is; its head and arms are left out (GONE_B): looking down
  // the run the board is under the lens, and the front arm hung right across it)
  const board = () => typeof Board !== 'undefined' && Board.on();
  F.figIdx = function () { const m = Skier.mesh, keep = []; if (m.ride) { for (let i = 0; i < m.ni; i++) keep.push(m.I[i]); return new Uint32Array(keep); } for (let i = 0; i < m.ni; i += 3) { const id = m.V[m.I[i] * 10 + 6]; if (id !== 9 && id !== 10 && id !== 2) keep.push(m.I[i], m.I[i + 1], m.I[i + 2]); } return new Uint32Array(keep); };
  function shaders() {
    const LK = (typeof Skier !== 'undefined' && Skier.LOOK) || {}, c = (k, d) => { const a = LK[k] && LK[k].alb || d; return 'vec3f(' + a.map(x => (+x).toFixed(4)).join(', ') + ')'; }, n = x => (+x).toFixed(5);
    const lib = `
const ORANGE: vec3f = ${c('jacket', [0.95, 0.255, 0.026])}; const NAVY: vec3f = ${c('sleeveFore', [0.018, 0.030, 0.055])}; const PALE: vec3f = ${c('sleeveBand', [0.86, 0.87, 0.85])};
const SKI_Y: vec3f = ${c('ski', [0.93, 0.78, 0.035])}; const SKI_L: vec3f = ${c('skiTip', [0.42, 0.80, 0.04])}; const SKI_K: vec3f = ${c('skiMark', [0.018, 0.020, 0.026])};
const GLOVE: vec3f = ${c('glove', [0.018, 0.018, 0.020])}; const SHAFT: vec3f = ${c('pole', [0.015, 0.015, 0.015])}; const GRIP: vec3f = ${c('poleGrip', [0.95, 0.255, 0.026])}; const BASKET: vec3f = ${c('poleBasket', [0.05, 0.055, 0.065])};
fn fpvBone(i: f32) -> mat4x4f { let r: i32 = i32(i + 0.5); return mat4x4f(texFetch(tBones, vec2i(0, r), 0), texFetch(tBones, vec2i(1, r), 0), texFetch(tBones, vec2i(2, r), 0), texFetch(tBones, vec2i(3, r), 0)); }
// the shell's folds, metres out along the normal. s: metres from the shoulder; th: angle round the arm (the inside of the elbow at a quarter turn)
fn fpvFold(s: f32, th: f32, bend: f32, tw: f32, fl: f32, t: f32) -> f32 {
  let q: f32 = (s - ${n(L1)}) / 0.062; let el: f32 = exp(-q * q); let ins: f32 = max(sin(th), 0.0); let b: f32 = saturate(bend / 1.9);
  var h: f32 = 0.0065 * b * el * pow(ins, 1.5) * cos((s - ${n(L1)}) * 202.683 + 1.3 * sin(th * 2.0)) - 0.0035 * b * el * max(-sin(th), 0.0);
  let fa: f32 = smoothstep(${n(L1 - 0.02)}, ${n(L1 + 0.06)}, s) * smoothstep(${n(LA - 0.035)}, ${n(LA - 0.075)}, s); let ua: f32 = smoothstep(0.03, 0.10, s) * smoothstep(${n(L1 + 0.01)}, ${n(L1 - 0.07)}, s);
  h += 0.0030 * fa * clamp(tw, -1.2, 1.2) * sin(th * 2.0 + (s - ${n(L1)}) * 26.0 * sign(tw));
  h += 0.0032 * (fa + ua) * (sin(th * 3.0 + s * 31.0) * sin(s * 47.0 + 1.7) + 0.6 * sin(th * 2.0 - s * 23.0 + 0.8));
  h += 0.0040 * smoothstep(${n(LA - 0.13)}, ${n(LA - 0.07)}, s) * smoothstep(${n(SL_HEM)}, ${n(SL_HEM - 0.012)}, s) * sin(th * 5.0 + 9.0 * s + 2.0 * sin(s * 140.0));
  h += 0.0030 * fl * (fa + ua) * sin(th * 3.0 + s * 38.0 - t * 31.0) * sin(th - t * 13.0 + s * 9.0);
  return h * smoothstep(-0.02, 0.05, s);
}`;
    const vs = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  var p: vec3f = a.pos; var nn: vec3f = a.nrm;
  let id: f32 = floor(a.mat.x + 0.5); let left: f32 = step(4.5, a.bw.x); let sg: f32 = 1.0 - 2.0 * left;
  let tw: f32 = mix(M.tw.x, M.tw.y, left); let opn: f32 = mix(M.tw.z, M.tw.w, left); let bend: f32 = mix(M.bend.x, M.bend.y, left);
  if (id > 1.5 && id < 2.5 && a.mat.z > 0.0) {
    // the lower fingers letting the pole swing: a turn about the knuckles' line
    let ang: f32 = -opn * a.mat.z * sg; let c: f32 = cos(ang); let s: f32 = sin(ang);
    let k: vec3f = vec3f(0.0, ${n(KD[1])}, ${n(KD[2])}); let o: vec3f = vec3f(${n(KA[0])} * sg, ${n(KA[1])}, ${n(KA[2])}); let q: vec3f = p - o;
    p = o + q * c + cross(k, q) * s + k * (dot(k, q) * (1.0 - c)); nn = nn * c + cross(k, nn) * s + k * (dot(k, nn) * (1.0 - c));
  }
  if (id > 0.5 && id < 1.5 && a.mat.z < 0.5) {
    // the shell's folds: pushed out along the normal, the normal leaned to match
    let s: f32 = a.uv.x; let th: f32 = a.uv.y; let r: f32 = max(a.uv.z, 0.01); let twr: f32 = tw * sg;
    let h0: f32 = fpvFold(s, th, bend, twr, M.bend.z, M.bend.w);
    let hs: f32 = (fpvFold(s + 0.004, th, bend, twr, M.bend.z, M.bend.w) - h0) / 0.004; let ht: f32 = (fpvFold(s, th + 0.06, bend, twr, M.bend.z, M.bend.w) - h0) / (0.06 * r);
    p += nn * h0; nn = normalize(vec3f(nn.x + ht * sin(th) * sg, nn.y - ht * cos(th), nn.z + hs));
  }
  if (id > 7.5) {
    // a ski's tip is never still: it flutters with the snow going under it
    let g: f32 = smoothstep(-0.30, -0.96, p.z); let amp: f32 = mix(M.ski.x, M.ski.y, left);
    p.y += amp * g * g; nn = normalize(vec3f(nn.x, nn.y, nn.z + nn.y * amp * 5.5 * g * (1.0 - g)));
  }
  // (branch a takes the forearm's twist: a turn about the arm's own line)
  var pa: vec3f = p; var na: vec3f = nn;
  if (a.bw.w > 0.0) { let ang: f32 = tw * a.bw.w; let c: f32 = cos(ang); let s: f32 = sin(ang); pa = vec3f(p.x * c - p.y * s, p.x * s + p.y * c, p.z); na = vec3f(nn.x * c - nn.y * s, nn.x * s + nn.y * c, nn.z); }
  let m0: mat4x4f = fpvBone(a.bw.x); let m1: mat4x4f = fpvBone(a.bw.y);
  let w0: vec4f = m0 * vec4f(pa, 1.0); let w1: vec4f = m1 * vec4f(p, 1.0); let n0: vec4f = m0 * vec4f(na, 0.0); let n1: vec4f = m1 * vec4f(nn, 0.0);
  v.wp = mix(w1.xyz, w0.xyz, a.bw.z); v.nrm = normalize(mix(n1.xyz, n0.xyz, a.bw.z));
  // (the left arm is the right one in a mirror: what is scattered over it is looked up somewhere else, or the two would wear the same snow)
  v.bp = a.pos + vec3f(0.0, 0.41, 0.23) * left; v.bn = a.nrm; v.mat = a.mat; v.uv = a.uv; v.clip = U.viewProj * vec4f(v.wp, 1.0);
  return v;
}`;
    const fs = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let id: f32 = floor(v.mat.x + 0.5);
  var N: vec3f = normalize(v.nrm);
  let V: vec3f = normalize(U.camPos.xyz - v.wp);
  let L: vec3f = U.sunDir.xyz;
  let px: f32 = (length(dpdx(v.wp)) + length(dpdy(v.wp))) * 0.5 + 0.00002;      // metres to a pixel here: what the fine drawing below is softened by
  let fine: f32 = saturate(1.7 - px / 0.0012);
  let bp: vec3f = v.bp; let uv: vec4f = v.uv;
  let weave: vec4f = tex(tDetail, bp.xy * 3.1 + bp.zz * vec2f(2.3, 1.7));
  let grain: vec4f = tex(tDetail, bp.xy * 19.0 + bp.zz * vec2f(13.0, 11.0));
  // (the same lumpy field seen from three sides and joined by which way the surface faces: what lies on it must not be drawn out along it)
  let b3: vec3f = pow(abs(normalize(v.bn)), vec3f(3.0));
  let lump: f32 = (tex(tDetail, bp.yz * 8.5 + vec2f(0.37, 0.11)).z * b3.x + tex(tDetail, bp.zx * 8.5 + vec2f(0.71, 0.43)).z * b3.y + tex(tDetail, bp.xy * 8.5).z * b3.z) / (b3.x + b3.y + b3.z + 1e-4);
  let lumpF: f32 = (tex(tDetail, bp.yz * 23.0 + vec2f(0.13, 0.57)).z * b3.x + tex(tDetail, bp.zx * 23.0 + vec2f(0.29, 0.83)).z * b3.y + tex(tDetail, bp.xy * 23.0 + vec2f(0.61, 0.19)).z * b3.z) / (b3.x + b3.y + b3.z + 1e-4);
  let flw: f32 = tex(tDetail, vec2f(uv.x * 6.0 + 0.3, (uv.y - M.fx.w) * 2.6)).z;       // (the skis': the snow that streams back over them)
  var bury: f32 = 0.0;       // how deep under that snow this bit of a ski is
  var flu: f32 = 0.0;        // fluorescent ink: how much of it
  var alb: vec3f = vec3f(0.5); var specP: f32 = 20.0; var specS: f32 = 0.03; var sheen: f32 = 0.0; var gloss: f32 = 0.0; var cloth: f32 = 0.0;
  var envS: f32 = 0.0;       // how much of the sky and of the bright snow all round it throws back, blurred (leather, rubber, a coated shell)
  let dmw: f32 = length(vec2f(dpdx(v.mat.w), dpdy(v.mat.w))) + 1e-5;
  var hgt: f32 = 0.0;        // small relief, metres: seams, stitches, ribs (turned into a lean of the normal further down)
  var gr: f32 = 0.0;         // how much the fine grain leans the normal
  var snowy: f32 = 0.0;      // how readily snow stays on it
  var dk: f32 = 0.5;         // how white the dusting of it gets (cloth holds it; a waxed ski hardly does)
  var ao: f32 = v.mat.y;
  if (id < 1.5) {
    let s: f32 = uv.x; let th: f32 = uv.y; let r: f32 = max(uv.z, 0.02); let zone: f32 = v.mat.z;
    if (zone < 0.5) {
      // the shell: the figure's jacket (orange, navy forearms, the pale band round the upper arm)
      let fore: f32 = smoothstep(${n(L1 + 0.035)}, ${n(L1 + 0.065)}, s) * (1.0 - M.ski.w);      // (the new body, Variants 'body' b: orange to the cuff, the navy storm cuff over the glove is all that is left of it)
      alb = mix(ORANGE * (1.0 - 0.2 * M.ski.w), NAVY, fore); alb = mix(alb, PALE, smoothstep(0.016, 0.011, abs(s - 0.150)) * (1.0 - fore));
      // ripstop: a heavier thread every few millimetres, both ways
      let g: vec2f = abs(fract(vec2f(s, th * r) / 0.0042) - 0.5); let rip: f32 = smoothstep(0.38, 0.47, max(g.x, g.y)) * fine * mix(1.0, smoothstep(0.0014, 0.0007, px), M.ski.w);
      alb *= 1.0 - mix(0.14, 0.04, M.ski.w) * rip; hgt += mix(0.00012, 0.00005, M.ski.w) * rip;     // (new body: a faint grid, gone before it is under three pixels)
      // the seam along the top of the arm, piped in the band's pale cloth so that it catches the light, a row of stitches either side
      let sa: f32 = abs(fract((th - 1.25) / 6.28319 + 0.5) - 0.5) * 6.28319 * r; let along: f32 = smoothstep(0.02, 0.05, s) * smoothstep(${n(SL_HEM - 0.004)}, ${n(SL_HEM - 0.012)}, s);
      let pipg: f32 = smoothstep(0.0020 + px, 0.0020 - px, sa) * along;
      alb = mix(alb, PALE * 0.92, pipg); hgt += 0.0008 * pipg * saturate(1.0 - sa * sa / 0.000004);
      let stt: f32 = smoothstep(0.0008 + px, 0.0008 - px, abs(sa - 0.0054)) * step(0.42, fract(s / 0.0034)) * along * fine;
      alb = mix(alb, alb * 0.45 + 0.02, stt); hgt -= 0.00010 * stt;
      // the cuff: a row of stitches round the hem, and the tab that draws it in (rubber, a pale pull at its end)
      let hst: f32 = smoothstep(0.0008 + px, 0.0008 - px, abs(s - ${n(SL_HEM - 0.0075)})) * step(0.42, fract(th * r / 0.0034)) * fine;
      alb = mix(alb, alb * 0.45 + 0.02, hst);
      let tab: f32 = smoothstep(0.25, 0.60, v.mat.w); let ta: f32 = fract((th - ${n(TAB[1])}) / 6.28319 + 0.5) - 0.5;
      alb = mix(alb, mix(ORANGE * 0.80, PALE * 0.9, smoothstep(0.045, 0.052, ta)), tab);
      hgt *= 1.0 - tab; sheen = mix(0.5, 0.12, tab); cloth = 1.0 - tab; specS = mix(0.05, 0.30, tab); specP = mix(28.0, 45.0, tab); gr = 0.0; snowy = 0.55; envS = mix(0.22, 0.35, tab);
    } else if (zone < 1.5) { alb = NAVY * 0.5; cloth = 1.0; }
    else {
      // the storm cuff that runs on from under the hem over the glove's own cuff: stretch knit, ribbed along the arm, its end bound in the pale cloth
      // (the ribs are dropped before they are finer than the picture can hold)
      let ribw: f32 = 6.28319 * r / 46.0; let rib: f32 = 0.5 + 0.5 * cos(th * 46.0); let rk: f32 = saturate(2.2 - px / (ribw * 0.25));
      alb = (NAVY * 1.7 + vec3f(0.008, 0.009, 0.011)) * (1.0 - 0.40 * (1.0 - rib) * rk); hgt += 0.00030 * rib * rk;
      alb = mix(alb, PALE * 0.8, smoothstep(${n(SL_END - 0.0052)}, ${n(SL_END - 0.0038)}, s));
      sheen = 0.35; cloth = 1.0; specS = 0.03; snowy = 0.8; envS = 0.06;
    }
  } else if (id < 2.5) {
    let q: vec3f = uv.xyz; let back: f32 = smoothstep(-0.10, 0.45, v.mat.w); let fing: f32 = smoothstep(0.3, 0.8, uv.w);
    let hu: f32 = (q.y - ${n(HW[1])}) * ${n(N0[1])} + (q.z - ${n(HW[2])}) * ${n(N0[2])}; let hv: f32 = (q.y - ${n(HW[1])}) * ${n(R0[1])} + (q.z - ${n(HW[2])}) * ${n(R0[2])};
    // (round the grip: 0 at the knuckles, on round the front of it to the fingertips; and how far out from it)
    let a0: f32 = atan2(-q.z, q.x); let ang: f32 = a0 + step(a0, -1.2) * 6.28319; let rad: f32 = length(q.xz);
    // black leather round the palm, the thumb, the fingers' fronts and their tips; a woven charcoal shell over the back of the hand and of the fingers
    let tipk: f32 = fing * smoothstep(2.30, 2.62, ang);
    let shell: f32 = mix(back, smoothstep(0.0362, 0.0398, rad), fing) * (1.0 - tipk);
    alb = mix(vec3f(0.020, 0.020, 0.022), vec3f(0.046, 0.049, 0.057), shell) * (0.80 + 0.40 * grain.z);
    specS = mix(0.38, 0.06, shell); specP = mix(38.0, 24.0, shell); sheen = mix(0.10, 0.45, shell); cloth = shell * 0.8; gr = mix(0.55, 0.25, shell); snowy = mix(0.30, 0.75, shell); envS = mix(0.60, 0.12, shell);
    // the seam where the two meet, piped in the pale cloth: round the hand, and down both sides of every finger
    let sd0: f32 = mix(abs(v.mat.w - 0.17) * px / dmw, abs(rad - 0.0380), fing);
    let pipe: f32 = smoothstep(0.0009 + px, 0.0009 - px, sd0) * (1.0 - tipk) * mix(smoothstep(-0.014, 0.002, hu), 1.0, fing);
    // the backs of the fingers are quilted across: padded rolls between rows of stitching
    let qk: f32 = fing * shell; let roll: f32 = 0.5 + 0.5 * cos(ang * 14.0 - 0.6);
    hgt += 0.0008 * qk * roll; alb *= 1.0 - 0.30 * qk * smoothstep(0.30, 0.0, roll);
    // the leather creases across each finger where its joints fold
    let crs: f32 = fing * (1.0 - shell) * (smoothstep(0.075, 0.0, abs(ang - 1.90)) + smoothstep(0.075, 0.0, abs(ang - 2.80)));
    hgt -= 0.0006 * crs; alb *= 1.0 - 0.35 * crs;
    // a patch of tougher hide where the strap and the grip wear: over the ball of the thumb, stitched all round
    let rp: f32 = length(vec3f(q.x + 0.010, (q.y - 0.014) * 0.72, q.z - 0.034)); let lth: f32 = (1.0 - shell) * (1.0 - fing);
    let tough: f32 = smoothstep(0.0272, 0.0252, rp) * lth;
    alb = mix(alb, vec3f(0.056, 0.053, 0.050) * (0.72 + 0.56 * grain.z), tough); specS = mix(specS, 0.20, tough); envS = mix(envS, 0.30, tough); hgt += 0.00035 * tough;
    let pst: f32 = smoothstep(0.0008 + px, 0.0008 - px, abs(rp - 0.0234)) * step(0.42, fract(atan2(q.y - 0.014, q.z - 0.034) * 7.0)) * lth * fine;
    alb = mix(alb, vec3f(0.21, 0.21, 0.22), pst * 0.9); hgt -= 0.00010 * pst;
    // the soft patch along the top of the thumb (to wipe the goggles with)
    let wipe: f32 = smoothstep(0.0580, 0.0608, q.y) * smoothstep(0.056, 0.048, q.z) * (1.0 - fing);
    alb = mix(alb, vec3f(0.088, 0.089, 0.094) * (0.85 + 0.3 * weave.z), wipe); specS = mix(specS, 0.02, wipe); envS *= 1.0 - wipe; sheen = mix(sheen, 0.65, wipe); cloth = max(cloth, wipe); gr *= 1.0 - wipe;
    // the moulded guard across the knuckles
    let kg: f32 = smoothstep(0.0405, 0.0425, q.x) * smoothstep(0.0165, 0.0135, abs(q.z + 0.0085)) * smoothstep(0.050, 0.046, abs(q.y - 0.0005));
    alb = mix(alb, vec3f(0.066, 0.068, 0.074), kg); specS = mix(specS, 0.55, kg); specP = mix(specP, 60.0, kg); sheen *= 1.0 - kg; cloth *= 1.0 - kg; gr *= 1.0 - 0.7 * kg; envS = mix(envS, 0.85, kg);
    // the padded panel on the back of the hand: piped round its edge in the pale cloth, the maker's two peaks printed on it in white
    let pd: vec2f = abs(vec2f(hv - 0.002, hu - 0.056)) - vec2f(0.027, 0.015); let pe: f32 = length(max(pd, vec2f(0.0))) + min(max(pd.x, pd.y), 0.0);
    let onb: f32 = smoothstep(0.036, 0.040, q.x);
    let pipg: f32 = smoothstep(0.0012 + px, 0.0012 - px, abs(pe - 0.0028)) * onb;
    hgt += 0.0005 * pipg;
    let lu: f32 = hu - 0.056; let lv: f32 = hv - 0.002;
    let m1: f32 = max(abs(lu - 0.0062 + 1.3 * abs(lv + 0.0040)) * 0.61, abs(lv + 0.0040) - 0.0088); let m2: f32 = max(abs(lu - 0.0022 + 1.3 * abs(lv - 0.0062)) * 0.61, abs(lv - 0.0062) - 0.0060);
    let logo: f32 = smoothstep(0.0011 + px, 0.0011 - px, min(m1, m2)) * step(-0.0056, lu) * onb;
    alb = mix(alb, PALE * 0.85, max(pipg * 0.9, pipe * 0.85)); alb = mix(alb, vec3f(0.80, 0.81, 0.80), logo); specS = mix(specS, 0.25, logo); cloth *= 1.0 - logo;
    hgt += 0.0004 * pipe;
    // the fingers' panels: a row of pale stitches either side of each groove between them
    let d0: f32 = min(min(abs(q.y - 0.0208), abs(q.y + 0.0008)), abs(q.y + 0.0218));
    let stt: f32 = smoothstep(0.0007 + px, 0.0007 - px, abs(d0 - 0.0044)) * fing * (1.0 - shell) * step(0.42, fract(ang * 9.0)) * fine;
    alb = mix(alb, vec3f(0.17, 0.17, 0.18), stt * 0.85); hgt += 0.00012 * stt;
  } else if (id < 4.5) {
    // the leash: webbing, a herringbone weave with a stripe of the jacket's colour down its middle
    let hb: f32 = 0.5 + 0.5 * sin((uv.x * 520.0 + abs(uv.y) * 2.4) * 6.28319);
    alb = vec3f(0.050, 0.051, 0.056) * (0.70 + 0.55 * hb * fine); hgt += 0.00010 * hb * fine;
    alb = mix(alb, ORANGE * 0.85, smoothstep(0.20, 0.14, abs(uv.y)) * step(0.0, uv.z));
    specS = 0.10; specP = 22.0; sheen = 0.25; cloth = 1.0; snowy = 0.8; envS = 0.10;
  } else if (id < 5.5) {
    let part: f32 = v.mat.z; let y: f32 = uv.x; let th: f32 = uv.y; let yy: f32 = -y;
    if (part < 0.5) {
      // the grip: moulded rubber in the jacket's colour under a dark cap
      alb = GRIP * (0.78 + 0.30 * grain.z); specS = 0.14; specP = 18.0; gr = 0.4; envS = 0.30;
      let cap: f32 = smoothstep(0.0735, 0.0755, y); alb = mix(alb, vec3f(0.028, 0.029, 0.033), cap); specS = mix(specS, 0.55, cap); specP = mix(specP, 55.0, cap); gr *= 1.0 - cap;
      let low: f32 = smoothstep(-0.0535, -0.0555, y); alb = mix(alb, vec3f(0.028, 0.029, 0.033), low); specS = mix(specS, 0.45, low);
    } else if (part < 1.5) {
      // the shaft: black and glossy, with a printed band below the grip (pale, the jacket's colour through it, hatched) and a few fine rings
      alb = SHAFT; specS = 0.6; specP = 80.0; gloss = 0.08;
      let bd: f32 = smoothstep(0.150 - px, 0.150 + px, yy) * smoothstep(0.340 + px, 0.340 - px, yy);
      var bc: vec3f = mix(PALE, ORANGE, smoothstep(0.214 - px, 0.214 + px, yy) * smoothstep(0.268 + px, 0.268 - px, yy));
      bc = mix(bc, SHAFT, step(0.62, fract(yy * 85.0 + th * 0.31831)) * smoothstep(0.285, 0.300, yy) * fine);
      alb = mix(alb, bc, bd);
      let rg: f32 = smoothstep(0.0012 + px, 0.0012 - px, abs(fract(yy / 0.012) - 0.5) * 0.012) * smoothstep(0.352, 0.356, yy) * smoothstep(0.392, 0.388, yy);
      alb = mix(alb, PALE, rg * 0.9);
      let rg2: f32 = smoothstep(0.004 + px, 0.004 - px, abs(yy - 0.93));
      alb = mix(alb, ORANGE, rg2);
    } else if (part < 2.5) {
      // the basket: dark plastic, six holes (snow goes through it)
      alb = BASKET; specS = 0.25; specP = 40.0;
      if (uv.z > 0.0185 && uv.z < 0.0395 && cos(th * 6.0) > 0.28) { discard; }
    } else { alb = vec3f(0.55, 0.56, 0.58); specS = 1.2; specP = 90.0; gloss = 0.25; }
    snowy = 0.3;
  } else {
    let zone: f32 = v.mat.z; let x: f32 = uv.x; let z: f32 = uv.y; let hw: f32 = max(uv.w, 0.004);
    if (zone > 2.5) {
      // the topsheet: bright, to be read at a glance against snow. Fluorescent lemon running to lime over the shovel, and nothing dark ahead of the
      // binding but the maker's two peaks, a thin double chevron behind them and a pinstripe inside each edge; one black band with a carbon weave in
      // it further back; all of it printed under a clear coat
      let fz: f32 = fract(z * 3.2 + 0.87); let e: f32 = px * 3.2; let rear: f32 = smoothstep(-0.20, -0.25, z) * smoothstep(-0.46, -0.44, z);
      let bd: f32 = saturate(smoothstep(0.5 - e, 0.5 + e, fz) * (1.0 - smoothstep(1.0 - e, 1.0, fz)) + (1.0 - smoothstep(0.0, e, fz))) * rear;
      var topc: vec3f = mix(SKI_Y, SKI_L, smoothstep(-0.64, -0.93, z)) * (0.92 + 0.10 * (1.0 - abs(x) / hw));
      let cw: vec2f = step(vec2f(0.5), fract(vec2f(x + z, x - z) / 0.0056)); let wv: f32 = abs(cw.x - cw.y);
      topc = mix(topc, SKI_K * (0.75 + 0.5 * wv * fine), bd);
      topc = mix(topc, vec3f(0.85, 0.87, 0.86), smoothstep(0.03 + e, 0.02 - e, abs(fz - 0.5)) * rear);
      topc = mix(topc, ORANGE, smoothstep(0.55, 0.60, z));
      // (the two peaks, pointing the way the ski goes, and the chevron behind them)
      let lu: f32 = (-0.800 - z) / 3.0; let lv: f32 = x / 3.0; let lp: f32 = px / 3.0;
      let m1: f32 = max(abs(lu - 0.0062 + 1.3 * abs(lv + 0.0040)) * 0.61, abs(lv + 0.0040) - 0.0088); let m2: f32 = max(abs(lu - 0.0022 + 1.3 * abs(lv - 0.0062)) * 0.61, abs(lv - 0.0062) - 0.0060);
      let cz: f32 = z + 0.600 + 0.42 * (hw - abs(x));
      let logo: f32 = max(smoothstep(0.0009 + lp, 0.0009 - lp, min(m1, m2)) * step(-0.0056, lu), max(smoothstep(0.0042 + px, 0.0042 - px, abs(cz)), smoothstep(0.0020 + px, 0.0020 - px, abs(cz - 0.0150))));
      topc = mix(topc, SKI_K, logo);
      topc = mix(topc, SKI_K, smoothstep(0.0011 + px, 0.0011 - px, abs(hw - abs(x) - 0.0080)) * smoothstep(0.020, 0.030, hw) * smoothstep(0.50, 0.40, z) * (1.0 - bd));
      // (snow slides off a waxed topsheet: the shovel comes up out of the snow clean, a little lies further back and along the edges)
      flu = (1.0 - bd) * (1.0 - logo) * (1.0 - smoothstep(0.50, 0.60, z));
      alb = topc; specS = 0.5; specP = 90.0; gloss = 0.10; envS = 0.30; dk = 0.12; snowy = 0.08 + 0.30 * smoothstep(-0.50, -0.15, z) + 0.45 * smoothstep(0.72, 0.98, abs(x) / hw);
    } else if (zone > 1.5) { alb = vec3f(0.42, 0.43, 0.45); specS = 1.6; specP = 110.0; gloss = 0.35; snowy = 0.45; dk = 0.12; }       // the bevel round the top: bright metal, the line that catches the sun
    else if (zone > 0.5) {
      // the sidewall, and along its foot the steel edge
      let steel: f32 = smoothstep(0.0026 + px, 0.0026 - px, uv.z);
      alb = mix(vec3f(0.035, 0.037, 0.042), vec3f(0.62, 0.63, 0.65), steel); specS = mix(1.2, 2.4, steel); specP = mix(90.0, 140.0, steel); gloss = mix(0.25, 0.55, steel);
    } else {
      // the base: black sintered, the topsheet's lemon in two thin bars by the tip and a block by the tail (as on the figure seen from outside)
      let bz: f32 = min(min(abs(z + 0.700), abs(z + 0.672)), abs(z - 0.400) * 0.35);
      alb = mix(vec3f(0.030, 0.032, 0.036), SKI_Y * 0.75, smoothstep(0.0075 + px, 0.0055 - px, bz)); specS = 0.7; specP = 90.0; gloss = 0.14;
    }
    // (in deep snow, and seen from down among them, the skis run under what their shovels push up: only the tips ride clear of it. Where
    // it ends is ragged, and streams back along the ski)
    let zb: f32 = mix(-0.20, -0.70, M.fx.z) + (flw - 0.5) * 0.14 - 0.04 * (x / hw) * (x / hw);
    bury = smoothstep(zb - 0.015, zb + 0.05, z) * saturate(M.fx.z * 3.0); hgt += 0.006 * bury * flw;
  }
  // ---- snow that has stuck: clumps on what faces up, single crystals that flash as they turn through the sun
  // (how much of a surface it covers: little on what stands upright, most of what lies flat; the lumpy field is cut where that much of it is above the cut)
  let upf: f32 = smoothstep(0.10, 0.75, N.y); let sn: f32 = saturate(M.fx.x * snowy * (0.30 + 0.70 * upf)); let thr: f32 = 0.750 - 0.30 * sn;
  // (two things: a dusting worked into the cloth, soft-edged and never quite white, and here and there a small lump that has stuck, with an
  // edge and a thickness of its own. Snow lying deep on a ski is all of it)
  let facing: f32 = smoothstep(-0.05, 0.25, N.y) * step(0.001, sn);
  // (powder, not paint: the dusting is soft-edged and thin, the lumps few and small, and both fade at their edges)
  let dust: f32 = 0.50 * smoothstep(thr - 0.08, thr + 0.22, lump * 0.52 + lumpF * 0.48) * facing;
  let lumps: f32 = 0.60 * smoothstep(thr + 0.085, thr + 0.150, lumpF * 0.80 + lump * 0.20) * facing;
  let clump: f32 = max(max(dust * dk, lumps), bury);
  alb = mix(alb, vec3f(0.90, 0.93, 0.98), clump); specS = mix(specS, 0.10, clump); specP = mix(specP, 24.0, clump); gloss *= 1.0 - clump; sheen = mix(sheen, 0.25, clump); cloth = mix(cloth, 1.0, clump); hgt += 0.0016 * lumps; ao = mix(ao, 1.0, clump * 0.7);
  // (the relief leans the normal: seams stand up, stitches sink, snow lies proud)
  let dpx: vec3f = dpdx(v.wp); let dpy: vec3f = dpdy(v.wp); let dhx: f32 = clamp(dpdx(hgt), -0.0006, 0.0006); let dhy: f32 = clamp(dpdy(hgt), -0.0006, 0.0006);
  let r1: vec3f = cross(dpy, N); let r2: vec3f = cross(N, dpx); let det: f32 = dot(dpx, r1);
  N = normalize(N * abs(det) - (r1 * dhx + r2 * dhy) * sign(det) + N * 1e-9);
  N = normalize(N + (vec3f(weave.x, weave.y, weave.z) - 0.5) * 0.22 * cloth + (vec3f(grain.x, grain.y, 0.5) - 0.5) * 0.5 * gr);
  let cs: vec3f = bp * 620.0; let ch: vec3f = hash33(cs + vec3f(31.0, 57.0, 11.0));
  let cry: f32 = step(1.0 - 0.05 * M.fx.x * snowy - 0.5 * clump, ch.x) * smoothstep(-0.2, 0.4, N.y);
  let Ng: vec3f = normalize(N + (hash33(cs + vec3f(5.0, 9.0, 73.0)) - 0.5) * 1.6);
  // ---- light: the figure's own (sun through the shadow map, sky and snow light, sheen and rim of cloth, a gloss that sees the sky), then the lamp
  let ndl: f32 = dot(N, L); let ndv: f32 = saturate(dot(N, V));
  let sh: f32 = shadowAt(v.wp + N * 0.035, 0.0016);
  // (new body: by moonlight the eye sees little colour and the sleeves are no lamp of their own: what the moon and the sky light is seen greyer and
  // darker, as on the figure seen from outside; the headlamp, below, keeps the colour where its cone falls)
  let nkF: f32 = (1.0 - M.ski.z) * M.ski.w; let albL: vec3f = alb;
  alb = mix(alb, vec3f(dot(alb, vec3f(0.30, 0.55, 0.15))), 0.45 * nkF) * (1.0 - 0.35 * nkF);
  let wrapD: f32 = saturate((ndl + 0.25 * cloth) / (1.0 + 0.25 * cloth));
  let amb: vec3f = U.ambSky.rgb * (0.5 + 0.5 * N.y) + U.ambGnd.rgb * (0.5 - 0.5 * N.y) * 1.25 + twiLight(N);
  var col: vec3f = alb * (U.sunCol.rgb * wrapD * sh + amb * ao);
  // (snow is lit all through: it has no dark side to speak of, and under an open sky it is as bright as the slope it came from)
  // (...by day. Under the moon the slope itself is dark toward the light, and what lies on a sleeve is no brighter than the slope)
  let day: f32 = M.ski.z;
  col = mix(col, vec3f(0.90, 0.93, 0.98) * (U.sunCol.rgb * ((0.25 + 0.75 * saturate((ndl + 0.55) / 1.55)) * (0.35 + 0.65 * sh) * mix(0.30, 1.0, day)) + amb * mix(1.0, 1.25, day)), clump);
  // (fluorescent ink gives the sky's blue and what the eye cannot see back as its own colour: it is as bright as the snow it lies on, in the
  // shade brighter than any paint, which is why it is worn there. So it is lit the way the snow is, from all round: as long as there is
  // daylight to do it with. By night it is paint like any other)
  col = mix(col, alb * (U.sunCol.rgb * ((0.25 + 0.75 * saturate((ndl + 0.55) / 1.55)) * (0.35 + 0.65 * sh) * 1.05) + amb * 1.35), flu * (1.0 - clump) * day * mix(1.0, 0.35, M.ski.w));     // (new body: only a little of it: the sleeves keep a lit side and a shaded side like everything else)
  // (a crust of snow is thin: with the sun behind it, the sun comes through)
  col += vec3f(0.90, 0.93, 0.98) * U.sunCol.rgb * (clump * 0.25 * saturate(0.55 - 0.45 * ndl) * (0.3 + 0.7 * sh));
  let fr: f32 = pow(1.0 - ndv, 3.0); let back: f32 = saturate(dot(-V, L) * 0.5 + 0.5);
  col += (alb * 0.6 + 0.08) * U.sunCol.rgb * sheen * fr * (0.25 + 1.6 * back * back) * sh * saturate(ndl * 2.0 + 0.9);
  let rim: f32 = pow(1.0 - ndv, 1.45) * back * back * saturate(ndl * 1.6 + 0.8) * sh;
  col += (alb * 0.5 + 0.24) * U.sunCol.rgb * (rim * (0.75 + 1.1 * sheen));
  col += alb * U.ambSky.rgb * sheen * fr * 0.6 * ao;
  col += alb * U.sunCol.rgb * (0.24 * cloth * back * back * saturate(0.6 - ndl) * (0.35 + 0.65 * sh));
  let Hh: vec3f = normalize(V + L);
  col += U.sunCol.rgb * sh * specS * pow(max(dot(N, Hh), 0.0), specP) * saturate(ndl * 4.0);
  col += U.sunCol.rgb * sh * cry * 26.0 * pow(saturate(dot(reflect(-V, Ng), L)), 70.0);
  if (gloss > 0.0) {
    let R: vec3f = reflect(-V, N);
    var env: vec3f = skyLut(normalize(vec3f(R.x, abs(R.y) * 0.9 + 0.02, R.z)));
    env = mix(env, vec3f(0.75, 0.80, 0.90) * (U.ambSky.rgb + U.sunCol.rgb * 0.35), smoothstep(0.05, -0.25, R.y));
    let f0: f32 = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col += env * gloss * f0 * (0.4 + 0.6 * ao);
  }
  {
    // leather, rubber and a coated shell throw back a soft picture of what is round them: sky from above, the lit snow from below
    let R2: vec3f = reflect(-V, N); let er: vec3f = U.ambSky.rgb * (0.5 + 0.5 * R2.y) + U.ambGnd.rgb * (0.5 - 0.5 * R2.y) * 1.25;
    col += er * (envS * (1.0 - clump) * (0.045 + 0.7 * fr) * (0.35 + 0.65 * ao));
  }
  if (U.lamp.w > 0.0) {
    // the headlamp: its spot (aimed far ahead) and the wide spill under it that hands held up in front of the chest stand in (it does not reach the skis:
    // they have what the snow round them has)
    let dl: vec3f = v.wp - U.lamp.xyz; let r2l: f32 = dot(dl, dl); let Ld: vec3f = -dl / sqrt(max(r2l, 1e-4));
    let ll: vec3f = lampLight(v.wp) + vec3f(1.0, 0.85, 0.64) * (U.lamp.w * M.fx.y * smoothstep(-0.35, 0.45, dot(-Ld, U.lampDir.xyz)) * smoothstep(1.7, 0.6, r2l) / (r2l + 30.0));
    let nl2: f32 = saturate((dot(N, Ld) + 0.35) / 1.35);
    // (new body: the lamp is a cone: the hands and forearms out in front are in its edge, the arm falls off into the dark toward the elbow, and the
    // upper arm beside the head is outside it altogether)
    let coneA: f32 = mix(1.0, 0.5 * smoothstep(0.35, 0.85, dot(-Ld, U.lampDir.xyz)), M.ski.w);
    col += ll * coneA * (albL * nl2 * (0.6 + 0.4 * ao) + (specS * 1.5 + 0.2 * sheen * fr) * pow(max(dot(N, normalize(V + Ld)), 0.0), specP) + cry * 8.0 * pow(saturate(dot(reflect(-V, Ng), Ld)), 50.0));
  }
  // (the upper arm close under the lens is in its own shade and half lost to the eye: darker and greyer, so it does not read as a flat orange card)
  let nearL: f32 = smoothstep(0.36, 0.14, length(U.camPos.xyz - v.wp));
  col = mix(col, vec3f(dot(col, vec3f(0.30, 0.55, 0.15))) * 0.5 + col * 0.12, nearL * 0.8);
  col = applyFog(col, v.wp);
  o.color = vec4f(col, 1.0);
  return o;
}`;
    return { lib, vs, fs };
  }
  F.init = function () {
    if (F.ready || F.dead || F.starting) return; F.starting = true;
    try {
      gfx = App.gfx; const t0 = performance.now(); if (!F.mesh) F.build();
      vb = gfx.buffer(F.mesh.V, 'vertex'); ib = gfx.buffer(F.mesh.I, 'index');
      boneTex = gfx.texture({ w: 4, h: 16, format: 'rgba32f', filter: 'nearest' }); hideTex = gfx.texture({ w: 4, h: 32, format: 'rgba32f', filter: 'nearest' });
      const fi = F.figIdx(); hideIb = gfx.buffer(fi, 'index'); hideCount = fi.length; hideFor = Skier.mesh;
      // (and these skis by themselves, for the view that shows nothing else)
      { const m = F.mesh, keep = []; for (let i = 0; i < m.ni; i += 3) if (m.V[m.I[i] * VSZ + 6] === 8) keep.push(m.I[i], m.I[i + 1], m.I[i + 2]); skiIb = gfx.buffer(new Uint32Array(keep), 'index'); skiCount = keep.length; }
      const sh = shaders();
      pipe = gfx.pipeline({
        name: 'fpv', lib: [SL.common, SL.hash, SL.fog, SL.shadow, sh.lib], buffers: [{ attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['mat', 'vec4f'], ['bw', 'vec4f'], ['uv', 'vec4f']] }],
        varyings: { wp: 'vec3f', nrm: 'vec3f', bp: 'vec3f', bn: 'vec3f', mat: 'vec4f', uv: 'vec4f' }, uniforms: { tw: 'vec4f', bend: 'vec4f', ski: 'vec4f', fx: 'vec4f' },
        textures: { tBones: 'fetch', tDetail: '2d', tShadow: 'shadow', tSky: '2d' }, vs: sh.vs, fs: sh.fs,
      });
      F.pipes = [pipe]; F.stats.initMs = performance.now() - t0;
      F.pipesReady = (async () => { if (gfx.finishPipelineAsync) await gfx.finishPipelineAsync(pipe); else gfx.finishPipeline(pipe); F.ready = true; })().catch(fail);
      // the figure is posed and drawn by its own code: its pose is taken as it is made, and while these arms stand in for its own it is drawn
      // from its own matrices with the arms gathered into the shoulders, and from its own triangles without skis, poles and gloves
      const up0 = Skier.update, dr0 = Skier.draw;
      Skier.update = function (root) {
        const ut0 = gfx.updateTexture; let s;
        gfx.updateTexture = function (t, x, y, w, h, d) { if (w === 4 && h === 32 && d && d.length === 512) { figTex = t; figData = d; } return ut0.apply(this, arguments); };
        try { s = up0.apply(this, arguments); } finally { gfx.updateTexture = ut0; }
        if (!F.dead && F.k > 0) { try { if (s && s.J && s.F) { const dt = PH.dt; F.pose(s, root, dt); PH.dt = 0; upload(dt); } } catch (e) { fail(e); } }
        return s;
      };
      Skier.draw = function () {
        if (!(F.vis && F.posed && figTex)) return dr0.apply(this, arguments);
        if (F.hideFig) return;        // (the view of the ski tips: the lens is down among the knees, and nothing of the skier is to show; the shadow is still cast)
        const d0 = gfx.draw; let n = 0;
        if (Skier.want) Skier.want(); if (hideFor !== Skier.mesh) { const fi = F.figIdx(); hideIb = gfx.buffer(fi, 'index'); hideCount = fi.length; hideFor = Skier.mesh; }     // (the figure's body was swapped: Variants 'body')
        gfx.draw = function (P, d) { if (d && d.tex && d.tex.tBones === figTex && d.count === Skier.mesh.ni) { n++; const e = Object.assign({}, d); e.tex = Object.assign({}, d.tex, { tBones: hideTex }); e.ib = hideIb; e.count = hideCount; return d0.call(this, P, e); } return d0.apply(this, arguments); };
        try { return dr0.apply(this, arguments); } finally { gfx.draw = d0; if (!n) fail(new Error('the figure is no longer drawn the way this expects')); }
      };
      Render.passes.opaque.push(R => F.draw(R)); F.hooked = true;
    } catch (e) { fail(e); }
  };
  // the bones of these arms, and the figure's own with its arms gathered in, as textures
  const GONE = ['uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'poleL', 'poleR', 'elbowL', 'elbowR', 'head'];      // (the head too: the lens is inside it, and the goggles' frame crossed the view)
  // (on a board the arms go too: the front one hung right across the lens, the board under it)
  const GONE_B = GONE.filter(n => n.indexOf('pole') < 0).concat(['chest', 'shL', 'shR', 'neck']);      // (and the chest: standing sideways, the front shoulder is right before the lens)
  // (Variants 'fphand' b: the lens is in the drawn head now, not beside it, and the neck and collar round it were cut open by the near plane:
  // black shards across the middle of the picture. They go too; with ?fphide=2 the chest and shoulders as well, as on a board, to compare)
  const GONE_C = GONE.concat(/[?&]fphide=2/.test(typeof location !== 'undefined' ? location.search : '') ? ['neck', 'chest', 'shL', 'shR'] : /[?&]fphide=0/.test(typeof location !== 'undefined' ? location.search : '') ? [] : ['neck']);
  const DBG = (() => { try { const m = /[?&]fpdbg=([a-z]+)/.exec(location.search); return m ? m[1] : ''; } catch (e) { return ''; } })();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // the snow off the shovels in the view of the ski tips: crumbs thrown up and aside from where each ski meets the snow, and a thin mist of the
  // finest of it. rate: lumps a second flat out in deep snow (a third of them mist); dens: how thick a crumb is; life, brake: how soon it
  // is gone and how far it carries (it is pushed along by the ski: it keeps up for a moment, then is left behind and goes by the lens);
  // z: from where along the ski; base: how much of it there is on a packed run
  const BOW = F.BOW = { rate: 300, dens: 11, mist: 6, life: 0.40, brake: 5.0, z: [-0.46, -0.76], base: 0.30 };
  function upload(dt) {
    const R = Skier.world.root;
    for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) boneData.set(m4.mul(R, SD[k].M[i]), (k * 5 + i) * 16);
    gfx.updateTexture(boneTex, 0, 0, 4, 16, boneData);
    if (figData) {
      hideData.set(figData);
      for (const nm of (board() ? GONE_B : carryOn() ? GONE_C : GONE)) { const b = Skier.B[nm]; if (b == null) continue; const p = m4.tp(R, Skier.world.J[nm === 'head' ? 'skull' : nm.slice(-1) === 'L' ? 'shL' : nm.slice(-1) === 'R' ? 'shR' : 'neck']), o = b * 16, e = 0.002; hideData.fill(0, o, o + 16); hideData[o] = e; hideData[o + 5] = e; hideData[o + 10] = e; hideData[o + 12] = p[0]; hideData[o + 13] = p[1]; hideData[o + 14] = p[2]; hideData[o + 15] = 1; }
      gfx.updateTexture(hideTex, 0, 0, 4, 32, hideData);
    }
    const S = Game.s, ps = Game.pose || {}, t = (typeof App !== 'undefined' ? App.t : 0) % 512, ch = Game.feel && Game.feel.chatter || 0, sp = S.speed || 0, on = S.air ? 0 : 1;
    UNI.tw[0] = SD[0].twist; UNI.tw[1] = -SD[1].twist; UNI.tw[2] = SD[0].open; UNI.tw[3] = SD[1].open;
    UNI.bend[0] = SD[0].bend; UNI.bend[1] = SD[1].bend; UNI.bend[2] = smooth(7, 28, sp) * (1 - 0.5 * sat(ps.tuck || 0)); UNI.bend[3] = t;
    const amp = (0.0025 * smooth(4, 20, sp) + 0.011 * ch) * on;
    UNI.ski[0] = amp * Math.sin(t * 61 + 0.7) * (0.6 + 0.4 * Math.sin(t * 13.7)); UNI.ski[1] = amp * Math.sin(t * 57 + 2.9) * (0.6 + 0.4 * Math.sin(t * 11.3 + 1));
    UNI.ski[2] = 1 - sat(typeof Sky !== 'undefined' && Sky.night || 0); UNI.ski[3] = Skier.mesh && Skier.mesh.v === 'a' ? 0 : 1;       // (how much daylight there is: for fluorescent ink, and for how bright snow on a sleeve may be)
    const pwd = sat(S.powder || 0); PH.flow = ((PH.flow || 0) + dt * sp * 0.35) % 96;
    UNI.fx[0] = PH.snow; UNI.fx[1] = 0.45; UNI.fx[2] = on * smooth(3, 12, sp) * lerp(0.6 * pwd, smooth(0.2, 0.6, pwd), F.tk); UNI.fx[3] = PH.flow;
    // what rides with the lens must not be smeared by its speed. The motion blur leaves alone what is near the skier's middle, and has two
    // more places for things that keep pace with the lens (09_post.js, Post.riders): asked for at drawing time, if nobody else has them, for
    // the skis' tips out ahead and for whichever hand is furthest out (the inside hand of a hard turn)
    const a = boneData, tip = (o, z) => [a[o + 12] + a[o + 4] * 0.09 + a[o + 8] * z, a[o + 13] + a[o + 5] * 0.09 + a[o + 9] * z, a[o + 14] + a[o + 6] * 0.09 + a[o + 10] * z], t0 = tip(64, -0.66), t1 = tip(144, -0.66);
    // a little of the snow the tips push through rides up over them and is thrown off: more of it, and finer, the deeper the snow
    if (dt > 0 && F.vis && on && typeof Spray !== 'undefined' && Spray.grain) {
      const pw = sat(S.powder || 0), o = Render.origin, v = S.v, f = Game.root.fwd, n = Game.root.nrm, rx = f[1] * n[2] - f[2] * n[1], ry = f[2] * n[0] - f[0] * n[2], rz = f[0] * n[1] - f[1] * n[0];
      PH.tipN = Math.min((PH.tipN || 0) + dt * smooth(5, 18, sp) * (5 + 55 * pw * pw), 6);
      while (PH.tipN >= 1) {
        PH.tipN -= 1; const k = rnd() < 0.5 ? 64 : 144, p = tip(k, -0.955 + 0.16 * rnd()), sx = (rnd() - 0.5) * 2, w = sx * 0.05, c = 0.45 + 0.35 * rnd(), up = 0.5 + 1.3 * rnd() + 1.2 * pw * rnd(), side = sx * (0.5 + 0.9 * rnd());
        Spray.grain(App.t, p[0] + o[0] + rx * w, p[1] + o[1] + ry * w + 0.012, p[2] + o[2] + rz * w, v[0] * c + rx * side + n[0] * up, v[1] * c + ry * side + n[1] * up, v[2] * c + rz * side + n[2] * up, 0.45 + 0.55 * rnd(), 0.35 + 0.8 * rnd() * (0.6 + pw), 0.55, 0.6);
        if (pw > 0.45 && rnd() < 0.22 * pw) Spray.puff(App.t, p[0] + o[0], p[1] + o[1] + 0.02, p[2] + o[2], v[0] * 0.6 + rx * side * 0.6, v[1] * 0.6 + 0.5 + rnd(), v[2] * 0.6 + rz * side * 0.6, 0.8 + 0.2 * rnd(), lerp(0.03, 0.06, rnd()), 1.4 * pw, 1, 0.35, 0.5);
      }
      // the view of the ski tips: the snow the shovels push up and aside, close under the lens. It is what hides the skis behind their tips
      // (thrown nearly as fast as the skis go, so that it hangs about them for a moment before it is left behind)
      PH.bowN = Math.min((PH.bowN || 0) + dt * BOW.rate * F.tk * smooth(3, 14, sp) * (BOW.base + (1 - BOW.base) * pw), 10);
      while (PH.bowN >= 1) {
        PH.bowN -= 1; const k = rnd() < 0.5 ? 64 : 144, sx = rnd() < 0.5 ? -1 : 1, fine = rnd() < 0.35, p = tip(k, lerp(fine ? -0.58 : BOW.z[0], BOW.z[1], rnd())), w = sx * (0.050 + 0.035 * rnd()), c = (fine ? 0.80 : 0.86) + 0.14 * rnd(), up = (fine ? 0.3 : 0.7) + 1.9 * rnd() * rnd() + 0.6 * pw * rnd(), side = sx * (0.3 + 1.7 * rnd());
        Spray.puff(App.t - dt * rnd(), p[0] + o[0] + rx * w, p[1] + o[1] + ry * w - 0.07 + PH.sink, p[2] + o[2] + rz * w, v[0] * c + rx * side + n[0] * up, v[1] * c + ry * side + n[1] * up, v[2] * c + rz * side + n[2] * up,
          fine ? 0.82 + 0.14 * rnd() : 0.25 + 0.30 * rnd(), fine ? lerp(0.030, 0.050, rnd()) : lerp(0.012, 0.030, rnd()), (fine ? BOW.mist : BOW.dens) * (0.6 + 0.8 * rnd()) * (0.55 + 0.45 * pw), 1, BOW.life, BOW.brake);
      }
      // ...and now and then some of it reaches the glass (07c_feel.js: beads that have dried in a second or so): often down among the skis in
      // deep snow, seldom from the helmet, hardly ever on a packed run
      if (typeof Feel !== 'undefined' && Feel.splash) {
        PH.wetT = (PH.wetT == null ? 2 : PH.wetT) - dt * smooth(7, 20, sp) * (0.15 + 0.85 * pw) * (0.4 + 0.6 * F.tk);
        if (PH.wetT <= 0) { PH.wetT = 2.2 + 3.2 * rnd(); Feel.splash(0.20 + 0.25 * pw + 0.10 * F.tk, (rnd() - 0.5) * 1.2, 1); }
      }
    }
    RID[0][0] = (t0[0] + t1[0]) * 0.5; RID[0][1] = (t0[1] + t1[1]) * 0.5; RID[0][2] = (t0[2] + t1[2]) * 0.5; RID[0][3] = 0.29;
    let far = 0.90; RID[1][3] = 0;
    for (let k = 0; k < 2; k++) { const A = SD[k], g = m4.tp(R, [A.G[0] * A.sg, A.G[1], A.G[2]]), d = Math.hypot(g[0] - R[12], g[1] - R[13] - 0.85, g[2] - R[14]); if (d > far) { far = d; RID[1][0] = g[0]; RID[1][1] = g[1]; RID[1][2] = g[2]; RID[1][3] = 0.15 * smooth(0.90, 1.0, d); } }
  }
  // called once a frame by the views (07b_views.js): dt seconds of game time, fpc how far the lens is into the helmet (0..1)
  F.tick = function (dt, fpc, tk) {
    F.k = fpc; F.tk = tk || 0; PH.dt += dt;
    // (built once the start-up's held-back work has its turn, App.fpvOK, 99_main.js; or at once if the lens is going into the helmet sooner)
    if (!F.starting && !F.dead && typeof App !== 'undefined' && App.gfx && typeof Skier !== 'undefined' && Skier.ready && (App.fpvOK || fpc > 0 || Variants.val.bootlz === 'a' || QS.has('manual'))) F.init();
    if (fpc <= 0) { if (F.posed) { SD[0].init = SD[1].init = SD[0].init0 = true; PH.v = null; F.posed = false; } PH.dt = 0; }
    F.vis = F.ready && !F.dead && fpc >= F.swap; PH.own = smooth(F.swap, 1, fpc);
    // the view of the ski tips: the arms are drawn until they are down behind the lens, the figure is left out once the lens has left the helmet
    F.arms = F.tk < 0.7 && !Game.fpIn; F.hideFig = F.vis && !board() && (F.tk > 0.25 || !!Game.fpIn);
    // (from the lens in the head the figure's own head, neck, collar, pack and shoulders are a hand's breadth away: turned hard, the body swings
    // round under the eyes and they came into the picture, coarse that close (they are modelled to be seen from five metres). The owner,
    // 2026-11-18: never let the head and neck into the picture, only the hands and what is below. So all of the figure within LENSCUT of
    // the lens is left out (08_skier.js); the hands and poles here, and the boots and skis further down, stay. Its shadow is still whole.
    // First 0.52-0.72 m: in a hard turn the knee then came up to 0.73 m, the thigh filled the foot of the picture (tools/fpv/figview.js). Now
    // 0.80-1.00 m: everything above the shins goes; the ankles are 1.07 m and more away, so the boots on the skis stay)
    Skier.lensCut = F.vis && !board() && carryOn() && !F.hideFig ? LENSCUT : null;
    if (DBG) { if (DBG === 'noarms') F.arms = false; if (DBG === 'nofig') F.hideFig = F.vis; }      // (?fpdbg=noarms | nofig: to find what is drawn where, in tests)      // (or the figure turned away under the lens: Game.fpIn, 07b_views.js; then only the skis: these arms hang from its shoulders, which are then in front of the lens)
    // (the thrown snow is made to thin out before it reaches a lens: 10_spray.js, Spray.lens. Down among the skis the snow they push up is the
    // picture, so there it is let much nearer; the number is given back as it was found on the way out)
    // (and what does come near is spread into a wide faint veil, Spray.nearBlur: there it is left the lumps it is)
    if (typeof Spray !== 'undefined' && Spray.lens != null && Spray.nearBlur != null) {
      const on = F.vis ? F.tk : 0;
      if (on > 0) { if (!PH.sp0) PH.sp0 = [Spray.lens, Spray.nearBlur]; Spray.lens = lerp(PH.sp0[0], tv().lens, on); Spray.nearBlur = lerp(PH.sp0[1], tv().blur, on); }
      else if (PH.sp0) { Spray.lens = PH.sp0[0]; Spray.nearBlur = PH.sp0[1]; PH.sp0 = null; }
    }
    // snow on gloves, cuffs and skis: a little always in the cold, more the deeper the snow is ridden, a lot after a fall; it wears off
    const S = Game.s, want = 0.22 + 0.36 * sat(S.powder || 0);
    for (const e of Game.events || []) if (e.type === 'crash') PH.snow = 1.25; else if (e.type === 'land') PH.snow = Math.max(PH.snow, 0.3 + 0.5 * sat(S.powder || 0) + 0.02 * (e.v || 0));
    PH.snow = PH.snow > want ? Math.max(want, PH.snow - dt * 0.07) : Math.min(want, PH.snow + dt * 0.12);
    return F.vis;
  };
  F.draw = function (R) {
    if (!(F.vis && F.posed) || board()) return;
    if (typeof Post !== 'undefined' && Post.riders) for (const r of RID) { if (!(r[3] > 0)) continue; for (const q of Post.riders) if (q[3] === 0) { q[0] = r[0]; q[1] = r[1]; q[2] = r[2]; q[3] = r[3]; break; } }
    gfx.draw(pipe, { u: UNI, tex: { tBones: boneTex, tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, vb: [vb], ib: F.arms ? ib : skiIb, count: F.arms ? F.mesh.ni : skiCount });
  };

  F.VSZ = VSZ; F.HW = HW; F.gloveSD = gloveSD; F.POLE = POLE; F.toHand = toHand; F.fromHand = fromHand; F.L = [L1, L2];
  return F;
})();
Game.fpv = Fpv;      // (the page keeps its modules to itself: this is how a test reaches it)
