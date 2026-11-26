"use strict";
// ---------------------------------------------------------------- trees: spruce bent under a winter of snow
// A tree is put together, not carved: a stem, some ninety boughs in tiers, on every bough a pillow of snow, and under every pillow the
// twigs that carry it, so that every outline ends in a fringe of needles and not in the edge of a plate. Seven kinds, two finenesses.
//  - the nearest few trees are drawn fine, the next seventy coarse (still real geometry: real parallax, real shadows between the tiers);
//    the rest of the forest, all the way down the valley, as cards;
//  - a card carries its tree photographed from twelve sides (normal, depth, materials). The two nearest photographs are blended; the depth
//    puts every pixel back where it stood, so it takes its true place in the shadow map; beyond the shadow map the far side of the crown
//    lies in its own shade and the forest toward the sun shades all but the tops;
//  - no two alike: kind, height, girth, lean, how much snow each carries, a bough here and there that has shed;
//  - they live: tops nod in the gusts that cross the forest, boughs ride up and down; now and then one lets its snow go and springs back
//    while the snow comes down in a glittering veil; a tree the skier brushes shudders and dusts the air.
// Placement comes from Course, so physics and pictures agree.
// ---- the shape of a tree, worked out once at boot on the CPU (no GPU here):
//  - a few PILLOWS of snow, each a distance field (a smooth union of lumps lying on a bough) turned into a mesh at two finenesses;
//  - a tree is a stem and some ninety boughs in tiers; every bough carries one of the pillows, stretched to its length, sagging with it,
//    and under the pillow a SPRAY of twigs (a sheet whose needles are cut out of it in the fragment stage) with CURTAINS of hanging
//    branchlets: the dark fringe round every lump of snow and along every outline;
//  - ten kinds of tree (three grown ones, an old giant, a young one, one that lost its top, a dead snag, a wind-flagged one on the ridge,
//    and for the mixed wood a larch bare for the winter and a stone pine), each at two levels of detail.
// Vertex: pos3 nrm3 | kind (0 snow, 1 spray, 2 curtain, 3 bark; a larch's bare twigs: 4 spray, 5 curtain), light kept by the tree itself (ao), open sky overhead, which bough |
//         a b c (snow: height above its bough, -, 1 on the coarse level; sheets: metres along, metres across or down, 0..1 toward the ragged
//         edge) | lever (metres out from the stem)
const TreeModel = (() => {
  const M = { NV: 10, FL: 14, names: ['spruce', 'broad spruce', 'fir', 'giant', 'young', 'broken top', 'snag', 'flagged', 'larch', 'stone pine'], protoMs: 0, buildMs: 0 };
  const CL = [2.0, 1.25, 0.6], CW = [0.52, 0.36, 0.20], CT = [0.17, 0.155, 0.13];      // the three sizes of pillow: length, half-width, depth of snow
  const env = t => Math.sqrt(Math.max(0, 5.07 * t * (1 - t) * (1 - 0.45 * t)));        // outline of a bough seen from above (0 at the trunk and the tip, 1 at its widest)

  // ---- a pillow: lumps of snow along the spine of a bough and out along its side branches, flat underneath where they lie on the needles
  function pillowField(cls, seed, thin) {
    const rnd = RNG(seed), L = CL[cls], W = CW[cls], TH = CT[cls], E = [];
    const n = [5, 4, 2][cls];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.62 + (rnd() - 0.5) * 0.25) / (n + 0.25);
      E.push([t * L, 0.03, (rnd() - 0.5) * 0.08, 0.64 * L / n * (0.9 + 0.3 * rnd()), TH * (0.75 + 0.45 * rnd()) * (0.65 + 0.35 * Math.sin(PI * t)), 0.60 * W * env(t) * (0.85 + 0.3 * rnd()) + 0.05, 1, 0]);
    }
    const ns = [3, 2, 1][cls];
    for (let sg = -1; sg <= 1; sg += 2) for (let i = 0; i < ns; i++) {
      const t = 0.28 + 0.56 * (i + 0.5 + (rnd() - 0.5) * 0.4) / ns, w = W * env(t), a = sg * (0.6 + 0.3 * rnd()), keep = rnd() >= thin * 0.6;
      const e = [t * L + 0.04 * L, 0.02, sg * w * (0.62 + 0.2 * rnd()), (0.5 + 0.2 * rnd()) * w + 0.05, TH * (0.6 + 0.35 * rnd()), (0.36 + 0.1 * rnd()) * w + 0.04, Math.cos(a), Math.sin(a)];
      if (keep) E.push(e);
    }
    E.push([0.965 * L, 0.015, 0, 0.07 * L + 0.03, TH * 0.55, 0.05 * L + 0.035, 1, 0]);
    // (a bough that has shed part of its load: lumps missing from the middle, what is left is smaller)
    if (thin > 0) { for (let i = E.length - 2; i >= 1; i--) if (rnd() < thin * 0.45) E.splice(i, 1); for (const e of E) { e[4] *= 1 - 0.25 * thin; e[5] *= 1 - 0.18 * thin; } }
    const rb = E.map(e => Math.max(e[3], e[5]) + 0.16), sn = seed % 97;
    const f = (x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < E.length; i++) {
        const e = E[i], dx = x - e[0], dz = z - e[2]; if (dx > rb[i] || dx < -rb[i] || dz > rb[i] || dz < -rb[i]) continue;
        const lx = (dx * e[6] + dz * e[7]) / e[3], ly = (y - e[1]) / e[4], lz = (dz * e[6] - dx * e[7]) / e[5];
        const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz), ax = lx / e[3], ay = ly / e[4], az = lz / e[5], k1 = Math.sqrt(ax * ax + ay * ay + az * az);
        d = sd.smin(d, k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -e[4], 0.09);
      }
      // snow never lies smooth: lumps and sags
      if (d < 0.2) d -= 0.034 * vnoise3(x * 2.3, y * 2.3, z * 2.3, 5 + sn) + 0.022 * vnoise3(x * 4.9, y * 4.9, z * 4.9, 6 + sn) + 0.010 * vnoise3(x * 10.3, y * 10.3, z * 10.3, 7);
      return sd.smax(d, -(y + 0.02), 0.045);
    };
    return { f, L, W, TH, bmin: [-0.2, -0.16, -(W + 0.26)], bmax: [L + 0.22, TH * 1.55 + 0.17, W + 0.26] };
  }
  const occl = (f, x, y, z, nx, ny, nz, out) => {
    out[0] = sat(0.15 + 0.85 * (0.5 * sat(f(x + nx * 0.07, y + ny * 0.07, z + nz * 0.07) / 0.07) + 0.5 * sat(f(x + nx * 0.22, y + ny * 0.22, z + nz * 0.22) / 0.22)));
    out[1] = sat(0.55 * sat(f(x, y + 0.14, z) / 0.14) + 0.45 * sat(f(x, y + 0.4, z) / 0.4));
  };
  // -> { n, V: (x y z nx ny nz ao open) per vertex, I } with the flat underside taken off (the spray of twigs closes it)
  function pillowMesh(P, cell) {
    const f = P.f, m = meshSDF(f, P.bmin, P.bmax, cell, { attr: (x, y, z, nx, ny, nz, out) => occl(f, x, y, z, nx, ny, nz, out), stride: 2, repair: true }), v = m.verts, used = new Int32Array(m.nv).fill(-1), I = [];
    for (let i = 0; i < m.ni; i += 3) {
      const a = m.idx[i], b = m.idx[i + 1], c = m.idx[i + 2];
      if ((v[a * 10 + 4] + v[b * 10 + 4] + v[c * 10 + 4]) < -1.65 && Math.max(v[a * 10 + 1], v[b * 10 + 1], v[c * 10 + 1]) < 0.012) continue;
      I.push(a, b, c);
    }
    let n = 0; for (const i of I) if (used[i] < 0) used[i] = n++;
    const V = new Float32Array(n * 8);
    for (let i = 0; i < m.nv; i++) { const o = used[i]; if (o < 0) continue; for (let k = 0; k < 8; k++) V[o * 8 + k] = v[i * 10 + k]; }
    return { n, V, I: Uint32Array.from(I, i => used[i]) };
  }
  // the same pillow for the middle distance: its top read off the distance field on a coarse grid (a pillow is a height field but for the
  // roll of its rim). Where a grid point finds no snow it lies down on the bough; the fragment stage draws the edge of the snow from the
  // height each vertex carries, so the outline stays ragged however few triangles there are.
  function pillowLow(P, nx, nz) {
    const f = P.f, x0 = -0.04, x1 = P.L + 0.1, z1 = P.W + 0.14, n = (nx + 1) * (nz + 1), V = new Float32Array(n * 8), has = new Uint8Array(n), I = [], o2 = [0, 0], top = P.bmax[1] - 0.02;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = -z1 + 2 * z1 * j / nz, k = j * (nx + 1) + i, o = k * 8;
      let y = top, hit = false; for (; y > -0.02; y -= 0.022) if (f(x, y, z) < 0) { hit = true; break; }
      let nxn = 0, nyn = 1, nzn = 0, ao = 0.7, op = 0.8;
      if (hit) { let lo = y, hi = y + 0.022; for (let q = 0; q < 6; q++) { const md = 0.5 * (lo + hi); if (f(x, md, z) < 0) lo = md; else hi = md; } y = 0.5 * (lo + hi);
        const e = 0.03, gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e), l = Math.hypot(gx, gy, gz) || 1; nxn = gx / l; nyn = gy / l; nzn = gz / l;
        if (nyn < 0.15) { nyn = 0.15; const l2 = Math.hypot(nxn, nyn, nzn); nxn /= l2; nyn /= l2; nzn /= l2; }
        occl(f, x, y, z, nxn, nyn, nzn, o2); ao = o2[0]; op = o2[1]; has[k] = 1; } else y = -0.02;
      V[o] = x; V[o + 1] = y; V[o + 2] = z; V[o + 3] = nxn; V[o + 4] = nyn; V[o + 5] = nzn; V[o + 6] = ao; V[o + 7] = op;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; if (!(has[a] | has[b] | has[c] | has[d])) continue; I.push(a, c, b, b, c, d); }
    // (grid points nothing uses are dropped)
    const used = new Int32Array(n).fill(-1); let m = 0; for (const i of I) if (used[i] < 0) used[i] = m++;
    const V2 = new Float32Array(m * 8); for (let i = 0; i < n; i++) { const o = used[i]; if (o >= 0) for (let k = 0; k < 8; k++) V2[o * 8 + k] = V[i * 8 + k]; }
    return { n: m, V: V2, I: Uint32Array.from(I, i => used[i]) };
  }
  // pillows[cls][which][lod]; `which`: 0..2 full, 3 thinned, 4 nearly bare
  const NP = 5, CELL = [0.095, 0.08, 0.068], GRID = [[10, 6], [7, 5], [4, 4]];
  let pillows = null;
  function makePillows() {
    const t0 = performance.now(); pillows = [];
    for (let cls = 0; cls < 3; cls++) { pillows.push([]); for (let w = 0; w < NP; w++) { const P = pillowField(cls, 211 + cls * 31 + w * 7, w < 3 ? 0 : w === 3 ? 0.55 : 1); pillows[cls].push([pillowMesh(P, CELL[cls]), pillowLow(P, GRID[cls][0], GRID[cls][1])]); } }
    M.protoMs = performance.now() - t0;
  }

  // ---- what each kind of tree is: tiers, how wide, how the boughs hang, how much snow
  //  K tiers from y0 to y1 (model metres; the canonical tree is 10 m), radius of the crown R0 at the foot and its taper pw, boughs per tier m0 -> m1,
  //  droop of the lowest and highest boughs d0 -> d1, load = how much snow (1 = all it can carry), bare = chance a bough is missing
  const KIND = [
    { K: 17, y0: 0.75, y1: 9.35, R0: 2.15, pw: 0.84, m0: 6.4, m1: 3.4, d0: 0.60, d1: 0.24, load: 1.00, bare: 0.03, lean: 0.25 },
    { K: 15, y0: 0.85, y1: 9.30, R0: 2.50, pw: 0.90, m0: 6.0, m1: 3.2, d0: 0.50, d1: 0.20, load: 0.72, bare: 0.10, lean: 0.35 },
    { K: 19, y0: 0.65, y1: 9.45, R0: 1.75, pw: 0.74, m0: 5.6, m1: 3.3, d0: 0.72, d1: 0.34, load: 1.08, bare: 0.02, lean: 0.20 },
    { K: 20, y0: 1.75, y1: 9.40, R0: 2.70, pw: 0.80, m0: 6.6, m1: 3.5, d0: 0.66, d1: 0.24, load: 0.90, bare: 0.08, lean: 0.30 },
    { K: 9, y0: 0.70, y1: 9.00, R0: 2.55, pw: 0.92, m0: 5.4, m1: 3.2, d0: 0.42, d1: 0.20, load: 1.00, bare: 0.00, lean: 0.50 },
    { K: 14, y0: 0.85, y1: 7.35, R0: 2.35, pw: 0.80, m0: 6.2, m1: 4.2, d0: 0.58, d1: 0.30, load: 0.85, bare: 0.12, lean: 0.30, broken: 7.75 },
    { K: 9, y0: 2.4, y1: 7.6, R0: 1.0, pw: 0.5, m0: 2.2, m1: 1.6, d0: 0.25, d1: 0.10, load: 0.8, bare: 0.25, lean: 0.6, snag: true, broken: 8.3 },
    // a spruce up on the ridge, shaped by the wind: a dense skirt where the snowpack sheltered it, above that bare stem and boughs on the lee
    // side only (+x, turned downwind where it stands), tiers of any length, and a leader the wind has bent over and broken
    { K: 14, y0: 0.45, y1: 8.7, R0: 2.4, pw: 0.66, m0: 9.0, m1: 5.6, d0: 0.40, d1: 0.16, load: 0.95, bare: 0.05, lean: 0.12, flag: true, broken: 9.1 },
    // (the owner's choice 'tvar' c, the mixed wood) a larch in winter: it has dropped its needles, what is left is a cone of fine twigs, warm
    // grey-ochre from afar, the boughs sagging and turning up at their tips; it holds hardly any snow
    { K: 21, y0: 0.9, y1: 9.5, R0: 2.35, pw: 0.95, m0: 6.6, m1: 4.0, d0: 0.80, d1: 0.36, load: 0.35, bare: 0.04, lean: 0.35, larch: true },
    // a stone pine (arolla): a broad, rounded crown kept full almost to the ground, several leaders where the top was lost long ago, the
    // boughs held out level or turned up, and dense tufts of needles carrying heavy cushions of snow
    { K: 13, y0: 0.55, y1: 8.2, R0: 2.75, pw: 0.36, m0: 6.8, m1: 5.6, d0: 0.20, d1: 0.04, load: 1.05, bare: 0.05, lean: 0.45, broken: 8.6 },
  ];
  M.KIND = KIND;
  // the boughs of one tree (the same list serves both levels of detail, the cards, and the snow that slides off)
  function boughs(v) {
    const Q = KIND[v], rnd = RNG(9000 + v * 131), B = [];
    // the stem leans a little and bends back toward the light: x(y), z(y)
    const la = rnd() * TAU, lk = Q.lean * (0.5 + 0.5 * rnd()), lx = Math.cos(la) * lk, lz = Math.sin(la) * lk, ka = la + 2 + rnd() * 2, kx = Math.cos(ka) * lk * 0.6, kz = Math.sin(ka) * lk * 0.6;
    const top = Q.broken || 9.95;
    const axis = Q.flag ? y => { const q = clamp(y, 0, 10) / 10, b = smooth(6.2, 9.4, y); return [lx * q * q + 1.2 * b * b + 0.08 * Math.sin(y * 1.7), lz * q * q + 0.10 * Math.sin(y * 1.3 + 1)]; }
      : y => { const q = clamp(y, 0, 10) / 10, s = Math.sin(q * PI); return [lx * q * q + kx * s * q, lz * q * q + kz * s * q]; };
    const crown = y => Q.R0 * Math.pow(Math.max(0.02, 1 - y / (Q.broken ? 9.6 : 10.15)), Q.pw) + 0.14;
    for (let k = 0; k < Q.K; k++) {
      const u = k / (Q.K - 1), y = Q.y0 + (Q.y1 - Q.y0) * Math.pow(u, 0.92) + (k > 0 && k < Q.K - 1 ? (rnd() - 0.5) * 0.16 : 0);
      const R = crown(y) * (0.92 + 0.16 * rnd()), Mn = Math.max(2, Math.round(lerp(Q.m0, Q.m1, u) + (rnd() - 0.5) * 0.9)), ph = k * 2.4 + rnd() * 0.8;
      // (flagged: the skirt below 1.6 m, then the stretch the blown snow has sand-blasted bare, then the flag; each tier its own length)
      const sk = Q.flag ? 1 - smooth(0.9, 1.6, y) : 0, blast = Q.flag ? smooth(1.2, 1.9, y) * (1 - smooth(3.2, 4.4, y)) : 0, tl = Q.flag ? 0.55 + 0.75 * rnd() : 1;
      for (let j = 0; j < Mn; j++) {
        const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd(), r7 = rnd(), r8 = rnd();
        if (r7 < Q.bare) continue;
        let a = ph + (j + (r1 - 0.5) * 0.6) * TAU / Mn;
        let L = R * (0.60 + 0.50 * r2); if (r8 < 0.08) L = Math.min(L * 1.22, Q.R0 * 1.2); else if (r8 > 0.93) L *= 0.6;
        if (Q.snag) L = 0.35 + 0.75 * r2;
        if (Q.flag) {
          // on the lee side boughs grow full length and swing round toward it; to windward the buds are killed, the side ones are stubs
          const lee = Math.cos(a), keep = lerp(smooth(-0.35, 0.5, lee), 1, sk);
          if (r7 > 0.05 + 0.95 * keep * (1 - 0.65 * blast)) continue;
          a = Math.atan2(Math.sin(a), lee + (1 - sk) * 1.8 * (1 + lee));
          L *= tl * lerp(0.2 + 0.95 * smooth(0.0, 0.9, Math.cos(a)), 0.55 + 0.25 * r2, sk);
        }
        const y0 = y + (r3 - 0.5) * 0.24, rise = 0.12 + 0.16 * r4;
        let droop = lerp(Q.d0, Q.d1, u) * (0.8 + 0.45 * r5); droop = Math.min(droop, (y0 + 0.28) / L);      // (the lowest boughs rest in the snow, they do not dive under it)
        const W = Math.max(0.15, L * (0.26 + 0.08 * r6)), cls = L >= 1.5 ? 0 : L >= 0.82 ? 1 : 2;
        // which pillow: mostly full ones; a tree that carries less has boughs that have shed, and the sheltered lowest tier of an old tree is bare
        const lr = rnd(), ld = Q.load - 0.35 * (Q.y0 > 1.5 && k < 2 ? 1 : 0), pw = lr < ld - 0.28 ? Math.floor(rnd() * 3) : lr < ld + 0.05 ? 3 : 4;
        B.push({ id: B.length, a, ca: Math.cos(a), sa: Math.sin(a), L, W, y0, rise, k2: (rise + droop) / L, cls, pw, flip: rnd() < 0.5 ? -1 : 1, th: (0.85 + 0.4 * rnd()) * Math.min(Q.load, 1.1) * (Q.snag ? 0.7 : 1), u, tier: k, cur: 0.5 + 0.5 * rnd() });
      }
    }
    // the leader: a tuft of short boughs standing round the tip (a tree that lost its top has a ring of them turned up round the break)
    if (!Q.snag) for (let j = 0; j < (Q.broken ? 4 : 3); j++) {
      const a = Q.flag ? (rnd() - 0.5) * 1.6 : rnd() * TAU, L = Q.flag ? 0.4 + 0.5 * rnd() : Q.broken ? 0.75 + 0.4 * rnd() : 0.26 + 0.16 * rnd(), y0 = Q.broken ? Q.broken - 0.5 - 0.3 * rnd() : 9.42 + 0.14 * j;
      B.push({ id: B.length, a, ca: Math.cos(a), sa: Math.sin(a), L, W: Math.max(0.15, L * 0.34), y0, rise: Q.broken ? 0.55 : 0.2, k2: Q.broken ? 0.25 / L : 0.5 / L, cls: Q.broken ? 2 : 2, pw: Math.floor(rnd() * 3), flip: 1, th: 0.9, u: 1, tier: Q.K, cur: 0.3 });
    }
    return { B, axis, crown, top, Q };
  }

  // ---- put a tree together at one level of detail (a larch's boughs carry no pillow: what snow it holds lies in flecks along its twigs)
  const NOSNOW = { n: 0, V: new Float32Array(0), I: new Uint32Array(0) };
  function build(v, lod) {
    const S = boughs(v), B = S.B, Q = S.Q, FL = M.FL;
    let nv = 0, ni = 0;
    // count first, then fill (typed arrays, no growing)
    const NS = [[7, 5, 3], [4, 3, 2]][lod], rings = lod ? 7 : 15, sides = lod ? 5 : 8, nTr = Math.ceil(rings * (S.top / 10)) + 1;
    for (const b of B) { const p = Q.larch ? NOSNOW : pillows[b.cls][b.pw][lod]; nv += p.n; ni += p.I.length; if (!Q.snag) { const n = NS[b.cls]; nv += (n + 1) * 3; ni += n * 12; if (b.cls < 2 || lod === 0) { nv += (n + 1) * 2; ni += n * 6; } if (lod === 0 && b.cls < 2) { nv += 6 * (b.cls === 0 ? 2 : 1); ni += 12 * (b.cls === 0 ? 2 : 1); } } }
    nv += nTr * (sides + 1) + 1; ni += (nTr - 1) * sides * 6 + sides * 3;
    const V = new Float32Array(nv * FL), I = new Uint32Array(ni); let vo = 0, io = 0;
    const put = (x, y, z, nx, ny, nz, kind, ao, open, id, a, b, c, lev) => { const o = vo * FL; V[o] = x; V[o + 1] = y; V[o + 2] = z; V[o + 3] = nx; V[o + 4] = ny; V[o + 5] = nz; V[o + 6] = kind; V[o + 7] = ao; V[o + 8] = open; V[o + 9] = id; V[o + 10] = a; V[o + 11] = b; V[o + 12] = c; V[o + 13] = lev; return vo++; };
    // how much of the sky and of the light a point keeps, from where it is in the crown: deep in near the stem, under the tiers above, little
    const inCrown = (r, y) => smooth(0.25, 0.9, r / S.crown(y));
    for (const b of B) {
      const p = Q.larch ? NOSNOW : pillows[b.cls][b.pw][lod], sx = b.L / CL[b.cls], sz = b.W / CW[b.cls] * b.flip, sy = b.th, ax = S.axis(b.y0), base = vo;
      const sagK = 0.38 / b.W;
      // the pillow, stretched along the bough; the bough's spine rises a little and then sags, its edges hang lower than its spine
      for (let i = 0; i < p.n; i++) {
        const o = i * 8, r = p.V[o] * sx, zz = p.V[o + 2] * sz, hh = p.V[o + 1] * sy;
        const gy = b.rise - 2 * b.k2 * r, hz = -2 * sagK * zz, y = b.y0 + b.rise * r - b.k2 * r * r - sagK * zz * zz + hh;
        let nx = p.V[o + 3] / sx, ny = p.V[o + 4] / sy, nz = p.V[o + 5] / sz; nx -= gy * ny; nz -= hz * ny;
        const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1), q = inCrown(r, y);
        put(ax[0] + r * b.ca - zz * b.sa, y, ax[1] + r * b.sa + zz * b.ca, (nx * b.ca - nz * b.sa) * l, ny * l, (nx * b.sa + nz * b.ca) * l, 0, p.V[o + 6] * lerp(0.5, 1, q), p.V[o + 7] * lerp(0.3, 1, q), b.id, Math.max(hh, 0), 0, lod, r);
      }
      if (b.flip > 0) for (let i = 0; i < p.I.length; i++) I[io++] = base + p.I[i]; else for (let i = 0; i < p.I.length; i += 3) { I[io++] = base + p.I[i]; I[io++] = base + p.I[i + 2]; I[io++] = base + p.I[i + 1]; }
      if (Q.snag) continue;
      // the spray of twigs the pillow lies on: wider and longer than the snow, so its needles show all round
      const n = NS[b.cls], Ws = 1.22 * b.W, t0 = 0.02, t1 = 1.09, s0 = vo;
      const spine = (t) => { const r = t * b.L; return [r, b.y0 + b.rise * r - b.k2 * r * r - 0.03, b.rise - 2 * b.k2 * r]; };
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n, sp = spine(t), r = sp[0], w = Ws * env(Math.min(t / 1.06, 1)) * (t > 1 ? 0.5 : 1) + 0.07, q = inCrown(r, sp[1]);
        for (let e = -1; e <= 1; e++) {
          const zz = e * w, y = sp[1] - sagK * zz * zz * (e ? 1.15 : 1);
          let nx = -sp[2], nz = 2 * sagK * zz * 1.15, l = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
          put(ax[0] + r * b.ca - zz * b.sa, y, ax[1] + r * b.sa + zz * b.ca, (nx * b.ca - nz * b.sa) * l, l, (nx * b.sa + nz * b.ca) * l, Q.larch ? 4 : 1, lerp(0.35, 0.8, q), lerp(0.15, 0.9, q), b.id, r, zz, Math.abs(e), r);
        }
      }
      for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) { const a = s0 + i * 3 + e, c = a + 3; I[io++] = a; I[io++] = a + 1; I[io++] = c; I[io++] = a + 1; I[io++] = c + 1; I[io++] = c; }
      // a curtain of branchlets hanging under the spine (it is what shows where a bough is seen from the side: along the outline of the tree)
      if (b.cls < 2 || lod === 0) {
        const c0 = vo, D = (0.16 + 0.20 * b.cur) * Math.sqrt(b.L) * (b.cls === 2 ? 0.8 : 1);
        for (let i = 0; i <= n; i++) {
          const t = 0.1 + 0.92 * i / n, sp = spine(t), r = sp[0], d = D * (0.35 + 0.65 * Math.sin(PI * Math.min(1, t * 0.9 + 0.08))), q = inCrown(r, sp[1]);
          for (let e = 0; e < 2; e++) put(ax[0] + r * b.ca, sp[1] - e * d, ax[1] + r * b.sa, -b.sa, 0, b.ca, Q.larch ? 5 : 2, lerp(0.3, 0.7, q), lerp(0.1, 0.5, q), b.id, r, e * d, e, r);
        }
        for (let i = 0; i < n; i++) { const a = c0 + i * 2, c = a + 2; I[io++] = a; I[io++] = a + 1; I[io++] = c; I[io++] = a + 1; I[io++] = c + 1; I[io++] = c; }
      }
      // ...and one or two hanging ACROSS a big bough (what shows when the bough points at the lens)
      if (lod === 0 && b.cls < 2) for (let m = 0; m < (b.cls === 0 ? 2 : 1); m++) {
        const t = b.cls === 0 ? (m ? 0.86 : 0.52) : 0.72, sp = spine(t), r = sp[0], w = Ws * env(t) * 0.95, D = (0.14 + 0.16 * b.cur) * Math.sqrt(b.L), q = inCrown(r, sp[1]), c0 = vo;
        for (let e = -1; e <= 1; e++) for (let k = 0; k < 2; k++) { const zz = e * w, y = sp[1] - sagK * zz * zz - k * D * (e ? 0.7 : 1); put(ax[0] + r * b.ca - zz * b.sa, y, ax[1] + r * b.sa + zz * b.ca, b.ca, 0.3, b.sa, Q.larch ? 5 : 2, lerp(0.3, 0.7, q), lerp(0.1, 0.5, q), b.id, zz + 7 * m + b.id, k * D, k, r); }
        for (let e = 0; e < 2; e++) { const a = c0 + e * 2, c = a + 2; I[io++] = a; I[io++] = a + 1; I[io++] = c; I[io++] = a + 1; I[io++] = c + 1; I[io++] = c; }
      }
    }
    // the stem: bark, a little snow plastered on its weather side (the fragment stage decides), tapering to the leader
    { const t0 = vo, r0 = Q.snag ? 0.19 : 0.17;
      for (let i = 0; i < nTr; i++) {
        const y = -1.4 + (S.top + 1.4) * i / (nTr - 1), ax = S.axis(y), rad = lerp(r0, Q.broken ? 0.07 : 0.022, sat(y / S.top)) * (y < 0.6 ? 1 + 0.5 * (0.6 - Math.max(y, -0.4)) : 1), q = sat(y / 10);
        for (let k = 0; k <= sides; k++) { const a = k * TAU / sides, c = Math.cos(a), s = Math.sin(a); put(ax[0] + c * rad, y, ax[1] + s * rad, c, 0.1, s, 3, Q.snag ? 0.9 : lerp(0.35, 0.8, q * q), Q.snag ? 0.8 : lerp(0.1, 0.7, q * q), -1, a * rad, y, 0, 0); }
      }
      for (let i = 0; i < nTr - 1; i++) for (let k = 0; k < sides; k++) { const a = t0 + i * (sides + 1) + k, c = a + sides + 1; I[io++] = a; I[io++] = c; I[io++] = a + 1; I[io++] = a + 1; I[io++] = c; I[io++] = c + 1; }
      const ax = S.axis(S.top), tip = put(ax[0], S.top + (Q.broken ? 0.12 : 0.02), ax[1], 0, 1, 0, 3, 0.9, 1, -1, 0, S.top, 0, 0), a0 = t0 + (nTr - 1) * (sides + 1);
      for (let k = 0; k < sides; k++) { I[io++] = a0 + k; I[io++] = tip; I[io++] = a0 + k + 1; }
    }
    if (vo !== nv || io !== ni) throw new Error('tree mesh count ' + vo + '/' + nv + ' ' + io + '/' + ni);
    return { V, I, nv, ni, S };
  }
  // all kinds, both levels: [v][lod] = { V, I, nv, ni }, and the list of boughs of each kind
  // (pre: the meshes as the last start built them, 00e_cache.js; each kind's boughs, which the forest reads, are laid out again, cheaply)
  M.buildAll = function (pre) {
    const t0 = performance.now(), out = [];
    if (pre && pre.length === M.NV && pre.every(p => p && p.length === 2)) {
      for (let v = 0; v < M.NV; v++) { const S = boughs(v); out.push(pre[v].map(m => ({ V: m.V, I: m.I, nv: m.nv, ni: m.ni, S }))); M.kinds[v] = S; }
      M.buildMs = performance.now() - t0; M.fromCache = true;
      return out;
    }
    if (!pillows) makePillows();
    for (let v = 0; v < M.NV; v++) { out.push([build(v, 0), build(v, 1)]); M.kinds[v] = out[v][0].S; }
    M.buildMs = performance.now() - t0;
    return out;
  };
  M.kinds = [];
  // (dev, ?cachecheck: the meshes built again and compared number for number with what the cache gave)
  M.check = function (pre) {
    if (!pillows) makePillows();
    let bad = 0, n = 0;
    for (let v = 0; v < M.NV; v++) for (let l = 0; l < 2; l++) { const m = build(v, l), c = pre[v][l]; if (m.V.length !== c.V.length || m.I.length !== c.I.length) { bad = -1; continue; }
      for (let i = 0; i < m.V.length; i++) { n++; if (m.V[i] !== c.V[i]) bad++; } for (let i = 0; i < m.I.length; i++) { n++; if (m.I[i] !== c.I[i]) bad++; } }
    return { n, bad };
  };
  M.env = env;
  return M;
})();

// ---- the forest: which trees stand round the camera, each at the level of detail its distance asks for; their light, their life
const Trees = (() => {
  const TM = TreeModel;
  // r0/w0/max0: the fine meshes reach r0 metres (handing over across the last w0), at most max0 of them; r1/w1/max1: the same for the coarse
  // meshes; beyond stand the cards (NK photographs of each kind, one tile each). life: the trees move and shed (0 = still).
  const T = { NV: TM.NV, NK: 12, r0: 14, w0: 3.5, max0: 8, r1: 48, w1: 8, max1: 72, far: 460, maxFar: 6144, tileW: 128, tileH: 256, ss: 2, pitch: 0.12, enabled: true, life: 1,
    stats: { near: 0, far: 0, tris: 0, fading: 0, out: 0, l0: 0, l1: 0, drawn: 0, shadow: 0, parts: 0 } };
  // (going through the woods, the owner's choice 'tpass'. a: as it was: a tree between the lens and the skier, or right against the lens,
  // fades out whole until it is clear. b: every tree stays. Its boughs give way round the body and are swept along with it as the skier
  // pushes through, then swing back; only the patch of boughs that stands right between the lens and the figure is thinned, so the skier is
  // always seen through it (the dithered see-through cut-out third-person games use for foliage); and the boughs keep rustling and shedding
  // snow for as long as the skier is in them (07_game.js 'rustle', 18_sound.js). A trunk met head on is still a knock, as it was)
  if (typeof Variants !== 'undefined') Variants.def('tpass', '穿林', [['a', '树会淡出'], ['b', '树留着']], 'b');
  const stay = () => typeof Variants !== 'undefined' && Variants.val.tpass === 'b';
  // (how alike the trees are, the owner's choice 'tvar'. a: as it was: every tree of a kind the same shape and colour, the snow on all much
  // the same. b: no two alike: the needles' colour by stand and by tree, girth, how much snow each carries (see describe). c: as b, and a
  // mixed wood: larches bare for the winter and stone pines stand among the spruce in stands of their own. A change re-places the trees)
  if (typeof Variants !== 'undefined') Variants.def('tvar', '树的多样', [['a', '现在的'], ['b', '每棵不同'], ['c', '混交林']], 'c');
  const vary = () => typeof Variants !== 'undefined' && Variants.val.tvar !== 'a';
  // (the owner's choice 'tgrain', 树林闪烁. The hand-overs between a tree's levels of detail, the soft outline of a far tree's card and the
  // see-through window round the skier are all cut with a grain of pixels. a: as it was, a new grain every frame: meant to read as a blend at
  // 60 fps, but with nothing to average it over time the treeline sizzled, a fast flicker along every far crown (worst in grey heavy-snow light,
  // and the slower the frame rate the worse). b: the grain is held still, and a far card's outline is cut clean: the woods stand still;
  // and so is the pattern the light shafts' march is offset by (15_shafts.js), whose beams between the trees shimmered the same way.
  // Read by the shaders as U.lampDir.w, set in 90_render.js)
  if (typeof Variants !== 'undefined') Variants.def('tgrain', '树林闪烁', [['a', '原来（逐帧颗粒）'], ['b', '稳定']], 'b');
  const V0 = -0.9, V1 = 10.45, DR = 3.6, NSEG = 4;        // a card: model metres from its foot to its top, the depth it stores (+-DR toward the viewer), how many pieces it bends in
  const HWV = [];                                         // half-width of each kind's card (model metres)
  let gfx, pipe, pipeShadow, pipeBake, pipeDown, pipeDil, pipeCard, pipeCardShadow, pipeGhostZ, pipeGhost, pipeDust, atlasA, atlasB, baked = false;
  const meshes = [], grp = [];
  let veil = new Map(), veil2 = new Map();      // trees being taken out of the picture: [how solid (0..1), hidden?] by tree
  let farCPU, farBuf, nFar = 0, cardsOnly = false;
  const CAP0 = () => T.max0 + 6, CAP1 = () => T.max1 + 24, GCAP = 8;

  T.init = function (g, pre, grab) {
    gfx = g;
    // (the atlas of cards holds a row per kind: where the GPU cannot hold that many rows of full height, the photographs are taken smaller)
    { const mt = (gfx.caps && gfx.caps.maxTex) || 4096; if (T.NV * T.tileH > mt) { T.tileH = Math.floor(mt / T.NV / 8) * 8; T.tileW = T.tileH / 2; } }
    const all = TM.buildAll(pre);
    if (grab) T.meshData = all.map(p => p.map(m => ({ V: m.V, I: m.I, nv: m.nv, ni: m.ni })));          // (for the next start: 00e_cache.js)
    for (let v = 0; v < T.NV; v++) {
      meshes.push([]); grp.push([]);
      for (let l = 0; l < 2; l++) {
        const m = all[v][l];
        meshes[v].push({ vb: gfx.buffer(m.V, 'vertex'), ib: gfx.buffer(m.I, 'index'), count: m.ni });
        const cap = l ? CAP1() : CAP0(), cpu = new Float32Array(cap * 16), gcpu = new Float32Array(GCAP * 16);
        grp[v].push({ cap, cpu, buf: gfx.buffer(cpu, 'vertex', true), n: 0, solid: 0, gcpu, gbuf: gfx.buffer(gcpu, 'vertex', true), gn: 0 });
        T.stats.tris += m.ni / 3;
      }
      // how wide the card of this kind must be: the reach of its longest bough
      { const m = all[v][1], V = m.V; let r = 0; for (let i = 0; i < m.nv; i++) { const o = i * TM.FL; if (V[o + 1] > V0) r = Math.max(r, Math.hypot(V[o], V[o + 2])); } HWV.push(r + 0.22); }
    }
    farCPU = new Float32Array(T.maxFar * 12); farBuf = gfx.buffer(farCPU, 'vertex', true);
    dustGPU = new Float32Array(NP * 8); dustBuf = gfx.buffer(dustGPU, 'vertex', true);
    const mesh = { attrs: [['pos', 'vec3f'], ['nrm', 'vec3f'], ['mat', 'vec4f'], ['tx', 'vec4f']] }, per = { instanced: true, attrs: [['i0', 'vec4f'], ['i1', 'vec4f'], ['i2', 'vec4f'], ['i3', 'vec4f']] };
    const TV = 'let t: TreeV = treeVertex(a.pos, a.nrm, a.mat, a.tx, a.i0, a.i1, a.i2, a.i3, M.p.x, M.k);';
    const treeVS = (nudge) => `fn vert(a: VIn) -> VOut { var v: VOut; ${TV} v.wp = t.wp; v.nrm = t.n; v.bp = a.pos; v.mat = a.mat; v.tx = vec4f(t.hh, a.tx.yzw);
        let gq: f32 = floor(a.i3.x * 0.5); v.ex = vec4f(a.i1.z, a.i1.w, a.i3.x - 2.0 * gq, gq / 255.0);
        // (load, size; and for the tree's own shade beyond the sun's map: how far the point stands from the stem toward the sun, how wide the crown is)
        v.iv = vec4f(a.i2.w, a.i0.w, dot(t.wp.xz - a.i0.xz, normalize(U.sunDir.xz + vec2f(1e-5, 0.0))), M.p.y * a.i2.z * a.i0.w);
        v.clip = U.viewProj * vec4f(t.wp, 1.0);${nudge ? ' v.clip.z = v.clip.z - 0.00003 * v.clip.w;' : ''} return v; }`;
    const treeDesc = { lib: [SL.common, SL.hash, SL.fog, SL.shadow, SL.tonemap, TREE_SSL, TREE_SURF_SSL, TREE_MAT_SSL], buffers: [mesh, per], cull: 'none',
      varyings: { wp: 'vec3f', nrm: 'vec3f', bp: 'vec3f', mat: 'vec4f', tx: 'vec4f', ex: 'vec4f', iv: 'vec4f' }, uniforms: { p: 'vec4f', k: 'vec4f' }, textures: { tDetail: '2d', tShadow: 'shadow', tSky: '2d' } };
    const treeFS = out => TREE_FS.replace('GHOST_OUT', out).replace('V0F', V0.toFixed(2)).replace('DVF', (V1 - V0).toFixed(2));
    pipe = gfx.pipeline(Object.assign({ name: 'tree', vs: treeVS(false), fs: treeFS('o.color = vec4f(col, 1.0);') }, treeDesc));
    // a tree being taken out of the picture (see update): its nearest surface is laid into the depth buffer first, then that one surface is
    // drawn over the finished view at the tree's strength, so the fade is even, with no layer showing through another
    pipeGhostZ = gfx.pipeline({ name: 'treeGhostZ', lib: [SL.common, SL.hash, TREE_SSL, TREE_SURF_SSL, TREE_MAT_SSL], buffers: [mesh, per], cull: 'none', varyings: { wp: 'vec3f', nrm: 'vec3f', mat: 'vec4f', tx: 'vec4f', iv: 'vec4f' },
      uniforms: { p: 'vec4f', k: 'vec4f' }, textures: {}, colorMask: false,
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; ${TV} v.wp = t.wp; v.nrm = t.n; v.mat = a.mat; v.tx = vec4f(t.hh, a.tx.yzw); v.iv = vec4f(a.i2.w, a.i0.w, 0.0, 0.0); v.clip = U.viewProj * vec4f(t.wp, 1.0); return v; }`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut; o.color = vec4f(0.0); let V: vec3f = normalize(U.camPos.xyz - v.wp);${TREE_FACE('v.wp', 'V')}
        if (treeCut(v.mat, v.tx, fw, snowLine(v.iv.x)) < 0.5) { discard; } return o; }` });
    pipeGhost = gfx.pipeline(Object.assign({ name: 'treeGhost', depthFunc: 'lequal', depthWrite: false, blend: 'premul', vs: treeVS(true), fs: treeFS('o.color = vec4f(col * v.ex.w, v.ex.w);') }, treeDesc));
    // into the sun's depth map: the twigs throw the shadow of what is left of them, a far pillow of its true outline
    pipeShadow = gfx.pipeline({
      name: 'treeShadow', lib: [SL.common, SL.hash, TREE_SSL, TREE_SURF_SSL, TREE_MAT_SSL], buffers: [mesh, per], varyings: { mat: 'vec4f', tx: 'vec4f', iv: 'vec4f' }, uniforms: { p: 'vec4f', k: 'vec4f' }, textures: {}, colorFormat: null, cull: 'none', depthBias: 2, depthBiasSlope: 2.5,
      vs: `fn vert(a: VIn) -> VOut { var v: VOut; ${TV} v.mat = a.mat; v.tx = vec4f(t.hh, a.tx.yzw); v.iv = vec4f(a.i2.w, a.i0.w, 0.0, 0.0); v.clip = U.shadowVP * vec4f(t.wp, 1.0); return v; }`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut; o.color = vec4f(0.0); if (treeCut(v.mat, v.tx, 0.07, snowLine(v.iv.x)) < 0.5) { discard; } return o; }`,
    });
    // --- the photographs: each kind from NK sides, looking slightly down. Taken at twice the size and brought down, so that the fringe of
    // needles round every outline arrives in the atlas as the share of each texel it fills.
    const aw = T.tileW * T.NK, ah = T.tileH * T.NV, SS = T.ss;
    atlasA = gfx.texture({ w: aw, h: ah, format: 'rgba8', filter: 'linear', wrap: 'clamp', mips: true }); atlasB = gfx.texture({ w: aw, h: ah, format: 'rgba8', filter: 'linear', wrap: 'clamp', mips: true });
    T.atlasA = atlasA; T.atlasB = atlasB;
    pipeBake = gfx.pipeline({
      name: 'treeBake', lib: [SL.common, SL.hash, TREE_SURF_SSL, TREE_MAT_SSL], buffers: [mesh], varyings: { nrm: 'vec3f', bp: 'vec3f', mat: 'vec4f', tx: 'vec4f', cl: 'vec4f' }, uniforms: { a: 'vec4f', r: 'vec4f', m: 'vec4f' },
      textures: { tDetail: '2d' }, colorFormat: 'rgba8', cull: 'none',
      vs: `fn vert(a: VIn) -> VOut { var v: VOut;
        let rt: vec3f = vec3f(M.a.x, 0.0, -M.a.y); let c: vec3f = vec3f(M.a.y, 0.0, M.a.x);
        let d: f32 = dot(a.pos, c);
        let u: f32 = dot(a.pos, rt) / M.m.y; let w: f32 = (a.pos.y - d * M.a.w / M.a.z - ${((V0 + V1) / 2).toFixed(3)}) / ${((V1 - V0) / 2).toFixed(3)};
        v.clip = vec4f(M.r.x + u * M.r.z, M.r.y + w * M.r.w, 0.5 - (d * M.a.z + a.pos.y * M.a.w) * 0.03, 1.0);
        v.nrm = a.nrm; v.bp = a.pos; v.mat = a.mat; v.tx = a.tx; v.cl = vec4f(u, w, d, 0.0); return v; }`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
        if (max(abs(v.cl.x), abs(v.cl.y)) > 1.0) { discard; }
        let x: vec3f = vec3f(M.a.x, 0.0, -M.a.y); let z: vec3f = vec3f(M.a.y * M.a.z, M.a.w, M.a.x * M.a.z); let y: vec3f = cross(z, x);${TREE_FACE('v.bp', 'z')}
        var N: vec3f = N0; if (fc < 0.0) { N = -N0; }
        let n1: vec4f = tex(tDetail, v.bp.xz * 0.23 + v.bp.yy * vec2f(0.17, 0.11) + 0.5);
        let n2: vec4f = tex(tDetail, v.bp.xy * 1.9 + v.bp.zz * vec2f(1.3, 1.7));
        let ln: f32 = snowLine(1.0);
        if (treeCut(v.mat, v.tx, fw, ln + (n1.z - 0.5) * 0.03) < 0.5) { discard; }
        let s: TreeS = treeSurface(v.mat, v.tx, N, n1, n2, ln, 1.0, 0.0, fw);
        if (M.m.x < 0.5) { o.color = vec4f(dot(s.N, x) * 0.5 + 0.5, dot(s.N, y) * 0.5 + 0.5, saturate(0.5 + v.cl.z / ${(2 * DR).toFixed(2)}), 1.0); }
        else { o.color = vec4f(s.snow, s.ao * (0.3 + 0.7 * s.open), select(1.0, saturate(v.tx.x / 0.16), v.mat.x < 0.5), s.bark); }
        return o; }`,
    });
    pipeDown = gfx.pipeline({
      name: 'treeDown', lib: [SL.common], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { p: 'vec4f' }, textures: { tSrc: 'fetch', tCov: 'fetch' }, colorFormat: 'rgba8', depth: false, depthTest: false, cull: 'none',
      vs: VS_FULLSCREEN,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
        let p: vec2i = vec2i(v.clip.xy); let y0: i32 = i32(M.p.x) * ${T.tileH};
        if (p.y < y0 || p.y >= y0 + ${T.tileH}) { discard; }
        let q: vec2i = vec2i(p.x, p.y - y0) * ${SS};
        var s: vec4f = vec4f(0.0); var n: f32 = 0.0;
        for (var j: i32 = 0; j < ${SS}; j++) { for (var i: i32 = 0; i < ${SS}; i++) {
          let c: vec4f = texFetch(tSrc, q + vec2i(i, j), 0); let w: f32 = texFetch(tCov, q + vec2i(i, j), 0).a;
          s += c * w; n += w;
        } }
        o.color = vec4f(0.0);
        if (n < 0.5) { return o; }
        s = s / n;
        // (first atlas: alpha = the share of the texel the tree fills, lifted into the upper half. Below a half is outside: see treeDilate)
        o.color = select(vec4f(s.rgb, 0.5 + 0.5 * n / ${(SS * SS).toFixed(1)}), s, M.p.y > 0.5);
        return o; }`,
    });
    const cardVS = (shadow) => `fn vert(a: VIn) -> VOut { var v: VOut;
        let cx: f32 = f32(a.vid & 1u); let cy: f32 = f32(a.vid >> 1u) * ${(1 / NSEG).toFixed(4)};
        let sc: f32 = a.i0.w; let vr: f32 = floor(a.i1.w); let fade: f32 = (a.i1.w - vr) / 0.98;
        ${shadow ? 'let dh: vec2f = normalize(U.sunDir.xz + vec2f(1e-5, 0.0));' : 'let dh: vec2f = normalize(U.camPos.xz - a.i0.xz);'}
        // which photographs: the direction of the viewer (or the sun) in the tree's own frame
        let dl: vec2f = vec2f(dh.x * a.i1.x - dh.y * a.i1.y, dh.x * a.i1.y + dh.y * a.i1.x);
        let ang: f32 = atan2(dl.x, dl.y) / ${(TAU / T.NK).toFixed(6)} + ${T.NK}.0;
        let k0: f32 = floor(ang); let fr: f32 = ang - k0;
        let rt: vec3f = vec3f(dh.y, 0.0, -dh.x);
        let uu: f32 = cx * 2.0 - 1.0; let vv: f32 = mix(${V0.toFixed(2)}, ${V1.toFixed(2)}, cy); let q: f32 = saturate(vv * 0.1);
        // (the card leans as the tree does: it is a strip, bent in ${NSEG} pieces)
        let ln: vec2f = a.i2.xy * (q * q * 10.0 * sc);
        let wp: vec3f = a.i0.xyz + rt * (uu * a.i2.z * sc) + vec3f(ln.x, vv * sc, ln.y);
        v.clip = ${shadow ? 'U.shadowVP' : 'U.viewProj'} * vec4f(wp, 1.0);
        v.uv = vec2f(cx, 1.0 - cy);
        v.vw = vec4f(k0 - ${T.NK}.0 * floor(k0 / ${T.NK}.0), (k0 + 1.0) - ${T.NK}.0 * floor((k0 + 1.0) / ${T.NK}.0), smoothstep(0.15, 0.85, fr), vr);
        ${shadow ? '' : `v.wp = wp;
        let dist: f32 = length(U.camPos.xyz - a.i0.xyz);
        v.ex = vec4f(a.i1.x, a.i1.y, fade, clamp(log2(${(T.tileH / (V1 - V0)).toFixed(3)} / sc * dist * 2.0 * U.camRight.w / U.res.y), 0.0, 5.0));
        // how much forest stands between this tree and the sun (the terrain keeps the density of the trees on its coarse map)
        let Lh: vec2f = normalize(U.sunDir.xz + vec2f(1e-5, 0.0));
        let den: f32 = (texLod(tDen, (a.i0.xz + Lh * 9.0) * M.t.x + M.t.yz, 0.0).w + texLod(tDen, (a.i0.xz + Lh * 24.0) * M.t.x + M.t.yz, 0.0).w) * 0.5 * M.t.w;
        v.fx = vec4f(sc, a.i2.z * sc, a.i2.w, 8.5 * den);
        // the lie of the ground round the foot (the same map keeps its slope): height = dot(gp.xy, xz) + gp.z
        let gs: vec2f = texLod(tDen, a.i0.xz * M.t.x + M.t.yz, 0.0).xy * M.t.w;
        v.gp = vec4f(gs, a.i0.y + 0.10 * sc - dot(gs, a.i0.xz), a.i1.z);`}
        return v; }`;
    const perC = { instanced: true, attrs: [['i0', 'vec4f'], ['i1', 'vec4f'], ['i2', 'vec4f']] };
    const cardC = s => s.replace(/NKF/g, T.NK + '.0').replace(/NVF/g, T.NV + '.0').replace(/PITCH_C/g, Math.cos(T.pitch).toFixed(5)).replace(/PITCH_S/g, Math.sin(T.pitch).toFixed(5)).replace(/PITCH_T/g, Math.tan(T.pitch).toFixed(5)).replace(/KSTEP/g, (TAU / T.NK).toFixed(6)).replace(/DR2/g, (2 * DR).toFixed(2));
    pipeCard = gfx.pipeline({
      name: 'treeCard', lib: [SL.common, SL.hash, SL.fog, SL.shadow, SL.tonemap, TREE_SURF_SSL], buffers: [perC], topology: 'strip', cull: 'none',
      varyings: { wp: 'vec3f', uv: 'vec2f', vw: 'vec4f', ex: 'vec4f', fx: 'vec4f', gp: 'vec4f' }, uniforms: { t: 'vec4f', q: 'vec4f' },
      textures: { tA: '2d', tB: '2d', tShadow: 'shadow', tSky: '2d', tDen: '2d' },
      vs: cardVS(false), fs: cardC(TREE_CARD_FS),
    });
    pipeCardShadow = gfx.pipeline({
      name: 'treeCardShadow', lib: [SL.common], buffers: [perC], topology: 'strip', cull: 'none', varyings: { uv: 'vec2f', vw: 'vec4f' }, uniforms: { p: 'vec4f' }, textures: { tA: '2d' },
      colorFormat: null, depthBias: 2, depthBiasSlope: 2.0,
      vs: cardVS(true),
      fs: `fn frag(v: VOut) -> FOut { var o: FOut; o.color = vec4f(0.0);
        let k: f32 = select(v.vw.x, v.vw.y, v.vw.z > 0.5);
        if (texLod(tA, vec2f((k + v.uv.x) / ${T.NK}.0, (v.vw.w + v.uv.y) / ${T.NV}.0), 1.0).a < 0.62) { discard; }
        return o; }`,
    });
    // the photographs are cut-outs: grow each one's colours a few texels into the empty surround, so filtering at the outline never reads a
    // void. And in the first atlas let the alpha fall away from the outline step by step, like a distance: between two photographs of a
    // tree the outline then moves over from the one to the other instead of jumping.
    pipeDil = gfx.pipeline({
      name: 'treeDilate', lib: [SL.common], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { p: 'vec4f' }, textures: { tSrc: 'fetch', tCov: 'fetch' }, colorFormat: 'rgba8', depth: false, depthTest: false, cull: 'none',
      vs: VS_FULLSCREEN,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
        let p: vec2i = vec2i(v.clip.xy); let tl: vec2i = vec2i(${T.tileW}, ${T.tileH}); let t0: vec2i = (p / tl) * tl; let t1: vec2i = t0 + tl - vec2i(1, 1);
        let c: vec4f = texFetch(tSrc, p, 0);
        o.color = c;
        if (texFetch(tCov, p, 0).a > 0.0) { return o; }
        var s: vec4f = vec4f(0.0); var n: f32 = 0.0; var am: f32 = 0.0;
        for (var j: i32 = -1; j <= 1; j++) { for (var i: i32 = -1; i <= 1; i++) {
          let q: vec2i = clamp(p + vec2i(i, j), t0, t1);
          let ca: f32 = texFetch(tCov, q, 0).a; let w: f32 = step(0.001, ca);
          s += texFetch(tSrc, q, 0) * w; n += w; am = max(am, ca);
        } }
        if (n < 0.5) { return o; }
        s = s / n;
        o.color = mix(vec4f(s.rgb, max(min(am, 0.5) - 0.07, 0.004)), s, M.p.x);
        return o; }`,
    });
    // snow in the air: what slides off a bough, what a brushed tree lets go. The load itself coming down, the grains that fly from it, and
    // the fine dust that hangs after them. One instance = place, size | how solid, its own number, how it glints, how far its fall smears it.
    pipeDust = gfx.pipeline({
      name: 'treeDust', lib: [SL.common, SL.hash, SL.fog, SL.shadow], buffers: [{ instanced: true, attrs: [['i0', 'vec4f'], ['i1', 'vec4f']] }], topology: 'strip', cull: 'none', blend: 'premul', depthWrite: false,
      varyings: { uv: 'vec4f', c: 'vec4f', wp: 'vec3f' }, uniforms: { p: 'vec4f' }, textures: { tDetail: '2d', tShadow: 'shadow', tSky: '2d' },
      vs: `fn vert(a: VIn) -> VOut { var v: VOut;
        let c: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
        // (never smaller than a pixel: a grain too far off to be seen as a grain is a little of the pixel it is in)
        let px: f32 = length(U.camPos.xyz - a.i0.xyz) * U.camRight.w * 2.0 * U.res.w;
        let r: f32 = max(a.i0.w, px * 0.8); let k: f32 = sq(a.i0.w / r);
        let wp: vec3f = a.i0.xyz + U.camRight.xyz * (c.x * r) + U.camUp.xyz * (c.y * r) + vec3f(0.0, c.y * a.i1.w, 0.0);
        let sort: f32 = floor(a.i1.y);
        v.clip = U.viewProj * vec4f(wp, 1.0); v.uv = vec4f(c, sort, 0.0); v.wp = a.i0.xyz;
        // (under a tree a little of the sun still finds it: a crown is full of holes)
        v.c = vec4f(a.i1.x * k, a.i1.y - sort, a.i1.z * mix(k, 1.0, 0.4), 0.12 + 0.88 * shadowFast(a.i0.xyz, 0.0004));
        return v; }`,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut;
        let r2: f32 = dot(v.uv.xy, v.uv.xy); if (r2 > 1.0) { discard; }
        let toC: vec3f = U.camPos.xyz - v.wp; let dist: f32 = length(toC); let V: vec3f = toC / dist;
        let mu: f32 = dot(-V, U.sunDir.xyz);
        // a grain is a speck with an edge; a clump is solid and ragged; a puff of dust or of the curtain has no edge at all, and is never round
        let nz: f32 = tex(tDetail, v.uv.xy * 0.19 + vec2f(v.c.y * 7.3, v.c.y * 3.1)).z;
        var fo: f32 = smoothstep(1.0, 0.35, r2);
        if (v.uv.z < 0.5 || v.uv.z > 3.5) { fo = sq(1.0 - r2) * saturate(0.25 + 1.5 * nz - 0.5 * r2); }
        if (abs(v.uv.z - 2.0) < 0.5) { fo = smoothstep(1.0, 0.3, r2 + (0.5 - nz) * 0.8); }
        let near: f32 = smoothstep(0.5, 1.8, dist);
        let a: f32 = v.c.x * fo * near;
        // snow in the air is as white as snow on the ground, brighter still where the sun comes through it toward the lens, and the blue
        // of the sky in shade
        let sun: vec3f = U.sunCol.rgb * (v.c.w * cloudShade(v.wp));
        var col: vec3f = vec3f(0.93, 0.955, 0.985) * (sun * (0.80 + 1.3 * hg(mu, 0.6)) + U.ambSky.rgb + U.ambGnd.rgb * 0.4 + lampLight(v.wp) * 2.5);
        col = applyFog(col, v.wp);
        // a crystal here and there turns a face to the sun for an instant
        let tw: f32 = hash11(v.c.y * 4096.0 + floor(U.camPos.w * 13.0 + v.c.y * 37.0) * 7.0);
        let glint: vec3f = (sun + lampLight(v.wp) * 6.0) * (v.c.z * pow(tw, 24.0) * 9.0 * exp(-r2 * 7.0) * near);
        o.color = vec4f(col * a + glint, a);
        return o; }`,
    });
    T.pipes = [pipe, pipeShadow, pipeBake, pipeDown, pipeDil, pipeCard, pipeCardShadow, pipeGhostZ, pipeGhost, pipeDust];
  };

  T.bake = function () {
    const t0 = performance.now(), SS = T.ss, rw = T.tileW * T.NK * SS, rh = T.tileH * SS;
    // one kind at a time, at twice the size, both sets of values; then down into its row of the two atlases
    const hiA = gfx.texture({ w: rw, h: rh, format: 'rgba8', filter: 'nearest', wrap: 'clamp' }), hiB = gfx.texture({ w: rw, h: rh, format: 'rgba8', filter: 'nearest', wrap: 'clamp' }), dep = gfx.texture({ w: rw, h: rh, format: 'depth', filter: 'nearest' });
    const tgA = gfx.target({ color: hiA, depth: dep }), tgB = gfx.target({ color: hiB, depth: dep }), outA = gfx.target({ color: atlasA }), outB = gfx.target({ color: atlasB });
    const ce = Math.cos(T.pitch), se = Math.sin(T.pitch);
    for (let v = 0; v < T.NV; v++) {
      const m = meshes[v][1];
      for (let pass = 0; pass < 2; pass++) {
        gfx.beginPass(pass ? tgB : tgA, { color: [0, 0, 0, 0], depth: 1 });
        for (let k = 0; k < T.NK; k++) {
          const ph = k * TAU / T.NK;
          gfx.draw(pipeBake, { u: { a: [Math.cos(ph), Math.sin(ph), ce, se], r: [(k + 0.5) / T.NK * 2 - 1, 0, 1 / T.NK, 1], m: [pass, HWV[v], 0, 0] }, tex: { tDetail: Tex.detail }, vb: [m.vb], ib: m.ib, count: m.count });
        }
        gfx.endPass();
      }
      gfx.beginPass(outA, v ? {} : { color: [0, 0, 0, 0] }); gfx.draw(pipeDown, { u: { p: [v, 0, 0, 0] }, tex: { tSrc: hiA, tCov: hiA }, count: 3 }); gfx.endPass();
      gfx.beginPass(outB, v ? {} : { color: [0, 0, 0, 0] }); gfx.draw(pipeDown, { u: { p: [v, 1, 0, 0] }, tex: { tSrc: hiB, tCov: hiA }, count: 3 }); gfx.endPass();
    }
    gfx.destroyTarget(tgA); gfx.destroyTarget(tgB); gfx.destroyTarget(outA); gfx.destroyTarget(outB); gfx.destroyTexture(hiA); gfx.destroyTexture(hiB); gfx.destroyTexture(dep);
    { const tA = gfx.texture({ w: atlasA.w, h: atlasA.h, format: 'rgba8', filter: 'nearest', wrap: 'clamp' }), tB = gfx.texture({ w: atlasA.w, h: atlasA.h, format: 'rgba8', filter: 'nearest', wrap: 'clamp' });
      let a = atlasA, b = atlasB, a2 = tA, b2 = tB;
      for (let it = 0; it < 6; it++) {
        const ta = gfx.target({ color: a2 }), tb = gfx.target({ color: b2 });
        gfx.beginPass(ta, { color: [0, 0, 0, 0] }); gfx.draw(pipeDil, { u: { p: [0, 0, 0, 0] }, tex: { tSrc: a, tCov: a }, count: 3 }); gfx.endPass();
        gfx.beginPass(tb, { color: [0, 0, 0, 0] }); gfx.draw(pipeDil, { u: { p: [1, 0, 0, 0] }, tex: { tSrc: b, tCov: a }, count: 3 }); gfx.endPass();
        gfx.destroyTarget(ta); gfx.destroyTarget(tb);
        let t = a; a = a2; a2 = t; t = b; b = b2; b2 = t;
      }
      gfx.destroyTexture(tA); gfx.destroyTexture(tB); }
    gfx.genMips(atlasA); gfx.genMips(atlasB);
    baked = true; T.bakeMs = performance.now() - t0;
  };

  // ---- placement: chunks of the course's tree grid, cached. One tree = x y z height cos sin kind seed leanX leanZ girth load.
  // Where a tree stands, how tall it is and which way it is turned are the course's; what kind it is and how it grew follow from those.
  const CH = 8, CS = CH * TREE_CELL, NF = 12, chunks = new Map(), _at = {};
  // the stunted spruce up on a ridge: a as they were (young trees in even tiers), b flagged by the wind. (A change re-places the trees.)
  Variants.def('rtree', '山脊树', [['a', '现在的'], ['b', '风旗云杉']], 'b'); Variants.on(n => { if (n === 'rtree' || n === 'tvar') chunks.clear(); });
  function describe(out, o, x, z, h, rot, hint, seed, kind) {
    const q = hash2U(Math.floor(x * 8), Math.floor(z * 8)) & 0xffff, r1 = hash2(q, 71), r2 = hash2(q, 72), r3 = hash2(q, 73), r4 = hash2(q, 74), mode = Variants.val.tvar;
    const ca = Course.at(-z, _at), ridge = ca.ridge || 0, off = Math.abs(x - ca.cx) - ca.hw;
    let v = kind;
    if (v < 0) {
      v = hint < 2 ? 0 : hint < 3 ? 1 : 2;
      // the short ones are young trees, the tallest old giants; here and there one that lost its top, or a dead one still standing (those
      // only back in the forest, off the run: to the skier every tree of the course has boughs to brush, and so it must have them)
      if (h < 7.6) v = 4; else if (h > 15.2 && r1 < 0.8) v = 3; else if (r2 < 0.04 && off > 9) v = 6; else if (r2 < 0.10) v = 5;
      // up on the ridge: wind-flagged. The wind comes over the crest, across the run (toward +x, the way the cumulus and the deck drift), so
      // the flags stand out sideways as the skier sees them
      if (ridge > 0.45 && r4 < smooth(0.45, 0.8, ridge) * 0.92 && Variants.val.rtree !== 'a') {
        const cx0 = ca.cx, g = (Course.at(-z + 6, _at).cx - cx0) / 6, l = Math.hypot(1, g); v = 7; rot = Math.atan2(-g / l, 1 / l) + 0.25 * (r3 - 0.5);
      }
      // (the owner's choice 'tvar' c, the mixed wood: larches and stone pines among the spruce, each in stands of its own, never on the ridge)
      if (mode === 'c' && v !== 7 && v !== 6) {
        const r5 = hash2(q, 75), nl = vnoise2(x / 85, z / 85, 61), np = vnoise2(x / 120, z / 120, 67);
        if (r5 < smooth(-0.15, 0.35, nl) * 0.75) v = 8;
        else if (v !== 3 && hash2(q, 76) < smooth(-0.05, 0.4, np) * 0.7 * (1 - ridge)) v = 9;
      }
    }
    // none grew quite straight (and all lean a little down the hill, as the creeping snow has pushed them); on the ridge the wind has had its way
    const la = v === 7 ? 0.32 : r3 * TAU, lk = 0.012 + 0.05 * r4 * r4 + 0.03 * ridge;
    out[o] = x; out[o + 1] = Course.height(x, z, 0.5); out[o + 2] = z; out[o + 3] = h; out[o + 4] = Math.cos(rot); out[o + 5] = Math.sin(rot); out[o + 6] = v; out[o + 7] = seed;
    out[o + 8] = Math.cos(la) * lk; out[o + 9] = Math.sin(la) * lk - 0.012; out[o + 10] = 0.9 + 0.22 * r1;
    // how much snow it carries: by the lie of the land in patches (shelter, wind), a little by the tree; up on the ridge everything is plastered
    out[o + 11] = clamp(0.84 + 0.17 * vnoise2(x / 70, z / 70, 31) + 0.2 * (r2 - 0.5) + 0.3 * ridge, 0.62, 1.15);
    // (the owner's choice 'tvar' b and c: no two alike. The colour of the needles follows the stand (the tree's number now carries it, see
    // needleTint), girth from slender spires to broad old cones, and the snow ranges from a tree the wind has swept nearly green to one
    // plastered white; a larch holds hardly any)
    if (mode !== 'a') {
      const r6 = hash2(q, 77), r7 = hash2(q, 78);
      out[o + 7] = clamp(0.5 + 0.48 * vnoise2(x / 110, z / 110, 53) + 0.3 * (r7 - 0.5), 0.002, 0.998);
      out[o + 10] = 0.64 + 0.78 * r1;
      out[o + 11] = clamp(0.62 + 0.60 * vnoise2(x / 55, z / 55, 31) + 0.65 * (r6 - 0.5) + 0.3 * ridge, 0.05, 1.15);
      if (v === 8) out[o + 11] = 0.3 + 0.2 * r6;
    }
  }
  function chunk(cx, cz) {
    const key = (cx + 4096) * 2097152 + (cz + 1048576);
    let c = chunks.get(key); if (c) return c;
    const list = []; let n = 0;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const t = Course.treeInCell(cx * CH + i, cz * CH + j); if (!t.ok) continue;
      const x = t.x, z = t.z, h = t.h, rot = t.rot, hint = t.variant, seed = (t.seed & 0xffff) / 65536;
      describe(list, n, x, z, h, rot, hint, seed, -1); n += NF;
    }
    c = new Float64Array(list); chunks.set(key, c);
    if (chunks.size > 2400) { let k = 0; for (const q of chunks.keys()) { chunks.delete(q); if (++k >= 600) break; } }
    return c;
  }
  T.reset = () => { chunks.clear(); veil.clear(); shake.clear(); shed.clear(); dumped.clear(); nDust = 0; shedT = 2.5; rnd = RNG(7717); r0c = r1c = 0; grKey = NaN; };
  T.extra = [];        // test hook: [x, z, h, rot, kind] trees drawn in addition to the course's own
  T.lod = n => { cardsOnly = !n; };        // test hook: 0 = every tree a card, 1 = as it should be
  T.shedSoon = (x, z) => { shedT = 0; shedAt = x === undefined ? null : [x, z]; };       // test hook: a bough somewhere in view (or of the tree at x, z) lets go at the next step

  // ---- life: a tree that has been brushed shudders; a bough that lets its snow go; the snow in the air
  const NP = 1280, DF = 12, dust = new Float32Array(NP * DF), shake = new Map(), shed = new Map();
  let dustGPU, dustBuf, nDust = 0, shedT = 2.5, shedAt = null, rnd = RNG(7717), xtra = new Float64Array(64 * NF), nx = 0, tick = 0;
  // The snow in the air is of five sorts. Of each: how the air holds it back (1/s), how hard it falls (m/s2), how fast it spreads (m/s),
  // how solid it looks, how it glints.
  const SORT = [[3.0, 1.4, 0.13, 0.40, 0],        // 0 dust: a puff of the finest, it hangs and goes off with the wind
                [1.5, 9.8, 0, 1.0, 1],            // 1 grains: they fall, and flash as they turn
                [0.75, 9.8, 0, 1.0, 0.25],        // 2 clumps: bits of the load itself
                [3.0, 1.0, 0, 0.3, 2.2],          // 3 glitter: single crystals left hanging in the dust
                [1.2, 9.8, 0.10, 0.35, 0]];       // 4 veil: the load coming apart as it comes down, a white curtain
  // (of which sorts: running shares of dust, grains, clumps, glitter; the rest is veil)
  const SHED = [0.14, 0.44, 0.66, 0.76], BRUSH = [0.40, 0.74, 0.78, 0.92], NEAR = [0.55, 0.70, 0.70, 1.0];
  // a point on a bough of a standing tree, in the world: r metres out along it, w across
  const _bp = [0, 0, 0, 0, 0];
  function boughPoint(c, o, b, r, w) {
    const K = TM.kinds[c[o + 6]], ax = K.axis(b.y0), g = c[o + 10], s = c[o + 3] / 10;
    const mx = (ax[0] + r * b.ca - w * b.sa) * g, mz = (ax[1] + r * b.sa + w * b.ca) * g, my = b.y0 + b.rise * r - b.k2 * r * r + 0.06, q = sat(my / 10), cs = c[o + 4], sn = c[o + 5];
    _bp[0] = c[o] + (mx * cs + mz * sn + c[o + 8] * q * q * 10) * s; _bp[1] = c[o + 1] + (my - 0.10) * s; _bp[2] = c[o + 2] + (mz * cs - mx * sn + c[o + 9] * q * q * 10) * s;
    // (and the way out along the bough, on the map)
    _bp[3] = b.ca * cs + b.sa * sn; _bp[4] = b.sa * cs - b.ca * sn;
    return _bp;
  }
  // the lie of the snow round a tree's foot (what falls from it comes to rest there): slope x, slope z
  const _gr = [0, 0]; let grKey = NaN;
  function ground(c, o) {
    const x = c[o], z = c[o + 2], key = x * 8191 + z;
    if (key !== grKey) { grKey = key; _gr[0] = (Course.height(x + 1.5, z, 0.5) - Course.height(x - 1.5, z, 0.5)) / 3; _gr[1] = (Course.height(x, z + 1.5, 0.5) - Course.height(x, z - 1.5, 0.5)) / 3; }
    return _gr;
  }
  // n specks of snow let go along a bough. W: of which sorts; late: over how long they let go (s).
  function puff(c, o, b, n, W, late) {
    const s = Math.sqrt(c[o + 3] / 10), G = ground(c, o);
    for (let i = 0; i < n; i++) {
      if (nDust >= NP) return;
      const f = 0.25 + 0.75 * rnd(), p = boughPoint(c, o, b, b.L * f, (rnd() - 0.5) * b.W * 1.1), q = nDust++ * DF, e = rnd(), k = e < W[0] ? 0 : e < W[1] ? 1 : e < W[2] ? 2 : e < W[3] ? 3 : 4, out = 0.15 + 0.6 * rnd(), hang = k === 0 || k === 3;
      dust[q] = p[0]; dust[q + 1] = p[1]; dust[q + 2] = p[2];
      dust[q + 3] = p[3] * out + (rnd() - 0.5) * 0.6; dust[q + 4] = hang ? 0.3 - 1.2 * rnd() : -0.3 - 0.9 * rnd(); dust[q + 5] = p[4] * out + (rnd() - 0.5) * 0.6;
      dust[q + 6] = -late * ((1 - f) * 0.55 + 0.45 * rnd()) - 1e-4;       // (not yet: a load slides off from the tip of the bough inward, over a moment)
      dust[q + 7] = k === 0 ? 2.2 + 2.0 * rnd() : k === 3 ? 1.6 + 2.4 * rnd() : 1.2 + 1.0 * rnd();        // how long it lasts
      dust[q + 8] = (k === 0 ? 0.14 + 0.12 * rnd() : k === 1 ? 0.012 + 0.016 * rnd() : k === 2 ? 0.025 + 0.035 * rnd() : k === 3 ? 0.011 : 0.09 + 0.09 * rnd()) * s;
      dust[q + 9] = rnd(); dust[q + 10] = k;
      dust[q + 11] = c[o + 1] + G[0] * (p[0] + dust[q + 3] * 0.5 - c[o]) + G[1] * (p[2] + dust[q + 5] * 0.5 - c[o + 2]);      // the snow it will come down on
    }
  }
  // a bough of this tree on the skier's side, between heights u0 and u1 of the crown, that still carries a pillow worth the name
  const dumped = new Map();
  function facing(c, o, B, u0, u1) {
    const P = typeof Game !== 'undefined' && Game.s ? Game.s.p : null; if (!P) return null;
    let ux = P[0] - c[o], uz = P[2] - c[o + 2]; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    const cs = c[o + 4], sn = c[o + 5];
    let best = null, bs = -1e9;
    for (let k = 0; k < 24; k++) {
      const b = B[Math.floor(rnd() * B.length)]; if (b.cls > 1 || b.pw > 2 || b.u < u0 || b.u > u1) continue;
      const sc = (b.ca * cs + b.sa * sn) * ux + (b.sa * cs - b.ca * sn) * uz + 0.3 * rnd(); if (sc > bs) { bs = sc; best = b; }
    }
    return bs > 0.2 ? best : null;
  }
  function letGo(c, o, key, low) {
    const B = TM.kinds[c[o + 6]].B; let b = null;
    if (shed.size >= 96) return;
    for (let k = 0; k < 14 && !b; k++) { const e = B[Math.floor(rnd() * B.length)]; if (e.cls < 2 && e.pw < 3 && (low ? e.u < 0.45 : e.u > 0.12 && e.u < 0.85)) b = e; }
    if (!b) return;
    shed.set(key, { id: b.id, t: 0, seen: tick });
    puff(c, o, b, b.cls ? 100 : 150, SHED, 1);
    bomb(c, o, b, low ? 0.8 : 1);
  }
  // ---- the load itself, handed to the thrown snow (10_spray.js), which lights it as a cloud and casts its shadow. What a bough lets go is
  // not a veil: it is a lump the size of the pillow that slides off the tip, drops, and bursts on every tier below it that it hits (each
  // time a little of it goes out sideways as powder and the rest goes on down, looser), lands, and leaves a cloud of the finest dust two to
  // five metres across hanging round the tree for three to six seconds, going off with the wind (S5 tree bomb, branch dump). The thrown snow
  // keeps nothing but launch records, so each of those bursts is written now with the moment it will happen. power: 1 a load, less for a
  // bough the skier only touched.
  const _bh = [], _sp = [0, 0, 0];
  // how long something with the fall speed vs (and the time constant ts with which the air reaches it) takes to drop d metres (snowFly)
  const dropT = (d, vs) => { const ts = Math.max(vs / 9.81, 0.03); let t = Math.sqrt(2 * d / 9.81); for (let i = 0; i < 6; i++) { const e = Math.exp(-t / ts), y = vs * (t - ts * (1 - e)) - d, dy = vs * (1 - e); t = Math.max(0.01, t - y / Math.max(dy, 0.2)); } return t; };
  const vsOf = f => 0.28 + 6.9 * Math.pow(1 - f, 2.6);
  T.bombs = 0;
  function bomb(c, o, b, power) {
    if (typeof Spray === 'undefined' || !Spray.puff || typeof App === 'undefined') return;
    const cp = Render.cam.pos, dc = Math.hypot(c[o] - cp[0], c[o + 2] - cp[2]);
    if (dc > 110) return;                         // (beyond that it is a speck: the tree's own glitter says it)
    T.bombs++;
    const t = App.t, s = c[o + 3] / 10, rr = b.L * (0.62 + 0.25 * rnd());
    const P0 = boughPoint(c, o, b, rr, 0), px = P0[0], py = P0[1] + 0.08 * s, pz = P0[2], ox = P0[3], oz = P0[4];
    const gy = c[o + 1] + 0.02, G = ground(c, o), gnd = gy + G[0] * (px - c[o]) + G[1] * (pz - c[o + 2]);
    // fewer and bigger far off (the same cover for less of the shared ring), all of it at full count close by
    const k = power * (dc < 30 ? 1 : lerp(1, 0.45, sat((dc - 30) / 80))), big = 1 / Math.sqrt(Math.max(k / power, 0.3)), load = (b.cls === 0 ? 1 : b.cls === 1 ? 0.7 : 0.45) * c[o + 11];
    // the tiers below that the load comes down on: boughs lower down, turned the same way and long enough to reach out to where it falls
    _bh.length = 0;
    for (const e of TM.kinds[c[o + 6]].B) {
      if (e.y0 > b.y0 - 0.5 || e.L < rr * 0.7) continue;
      let da = e.a - b.a; da -= TAU * Math.round(da / TAU);
      if (Math.abs(da) > Math.max(0.3, Math.atan2(e.W, rr))) continue;
      _bh.push(boughPoint(c, o, e, Math.min(rr, e.L * 0.95), 0)[1] + 0.12 * s);
    }
    _bh.sort((a, b) => b - a);
    const tiers = []; for (const y of _bh) if (y < py - 0.8 && y > gnd + 0.5 && (!tiers.length || tiers[tiers.length - 1] - y > 0.9) && tiers.length < 3) tiers.push(y);
    const emit = (kind, tt, p, v, rate) => { if (Spray.onEmit && Spray.onEmit.length) { const e = { kind, t: tt, p, v, spread: 1.2, rate, powder: 1, r: [-oz, ox], f: [ox, oz] }; for (const f of Spray.onEmit) f(e); } };
    // 1. the lump: it leaves the tip of the bough over a third of a second (the bough's own snow sinks away in the same time), the solid
    // core first and the loose rim after it, falling at once and drawn out into a column by the ones that the air holds back more
    const fc = 0.12, vc = vsOf(fc), tG = dropT(py - gnd, vc), nB = Math.round(34 * k * load + 6);
    for (let i = 0; i < nB; i++) {
      const f = i < nB * 0.45 ? 0.04 + 0.16 * rnd() : 0.2 + 0.32 * rnd(), lag = 0.04 + 0.32 * Math.pow(rnd(), 1.4), a = rnd() * TAU, w = Math.sqrt(rnd()) * 0.35 * s * load;
      const life = (dropT(py - gnd, vsOf(f)) + 0.2) * 1.5, out = 0.25 + 0.5 * rnd();
      Spray.puff(t + lag, px + Math.cos(a) * w, py - 0.1 * rnd(), pz + Math.sin(a) * w, ox * out + (rnd() - 0.5) * 0.3, -0.3 - 0.6 * rnd(), oz * out + (rnd() - 0.5) * 0.3,
        f, lerp(0.10, 0.20, rnd()) * s * big * (0.6 + 0.5 * load), lerp(8.5, 4.5, f / 0.52), 1.3, life / lerp(0.8, 3.3, f), 0.5);
    }
    if (typeof Grains !== 'undefined' && Grains.clumps) Grains.clumps(t + 0.08, [px, py, pz], [ox * 0.5, -0.5, oz * 0.5], Math.round(10 * k * load + 2), 0.07 * s, { from: 'tree' });
    emit('sift', t, [px, py, pz], [ox * 0.5, -1, oz * 0.5], 1.2 * k);
    // 2. every tier it comes down on: a burst out sideways and up a little (what the bough catches and flicks off), grains, and clumps that go on
    const burst = (y, tb, n, spd, dens, f0) => {
      const bx = px + ox * 0.1, bz = pz + oz * 0.1;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = spd * (0.4 + 0.8 * rnd()), up = 0.2 + 0.9 * rnd(), f = f0 + (1 - f0) * rnd(), w = 0.25 * s * rnd(), dl = 0.06 * rnd();
        Spray.puff(t + tb + dl, bx + Math.cos(a) * w, y + 0.1 * rnd(), bz + Math.sin(a) * w, Math.cos(a) * sp + ox * 0.6, up, Math.sin(a) * sp + oz * 0.6,
          f, lerp(0.10, 0.22, rnd()) * s * big, dens * (1.1 - 0.5 * f), 1.6, f > 0.8 ? 1.25 : 1, 0.6 + 0.6 * f);
      }
      for (let i = 0; i < Math.round(n * 3); i++) { const a = rnd() * TAU, sp = spd * (0.3 + 1.1 * rnd()); Spray.grain(t + tb + 0.05 * rnd(), bx, y, bz, Math.cos(a) * sp, 0.3 + 1.4 * rnd(), Math.sin(a) * sp, rnd(), 0.5 + 1.5 * rnd() * rnd(), 1.4, 0.8); }
      emit('sift', t + tb, [bx, y, bz], [0, 0.4, 0], 0.8 * k);
    };
    for (let j = 0; j < tiers.length; j++) {
      const y = tiers[j], tt = dropT(py - y, vc) + 0.12;
      burst(y, tt, Math.round(14 * k * load + 3), 1.4 + 0.5 * j, 3.6, 0.45);
      // (what goes on down from here is looser: a second, smaller column, a little out from the first)
      for (let i = 0, n = Math.round(8 * k * load + 2); i < n; i++) {
        const f = 0.12 + 0.35 * rnd(), a = rnd() * TAU, w = 0.3 * s * Math.sqrt(rnd());
        Spray.puff(t + tt + 0.05 * rnd(), px + Math.cos(a) * w, y - 0.05, pz + Math.sin(a) * w, ox * 0.4, -0.8 - rnd(), oz * 0.4, f, lerp(0.09, 0.16, rnd()) * s * big, lerp(6.5, 4.0, f / 0.47), 1.3, (dropT(y - gnd, vsOf(f)) + 0.2) * 1.5 / lerp(0.8, 3.3, f), 0.5);
      }
    }
    // 3. it lands: a low ring of powder thrown out along the snow
    const tl = dropT(py - gnd, vc) + 0.1;
    { const n = Math.round(18 * k * load + 4), bx = px, bz = pz;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = 1.0 + 2.2 * rnd(), f = 0.5 + 0.5 * rnd();
        Spray.puff(t + tl + 0.08 * rnd(), bx + Math.cos(a) * 0.3 * s, gnd + 0.08, bz + Math.sin(a) * 0.3 * s, Math.cos(a) * sp, 0.3 + 0.9 * rnd(), Math.sin(a) * sp, f, lerp(0.12, 0.24, rnd()) * s * big, 3.4 * (1.1 - 0.5 * f), 1.4, 1.2, 0.9);
      }
      emit('land', t + tl, [bx, gnd, bz], [0, 0.6, 0], 0.7 * k);
    }
    // 4. what is left in the air: the finest of it, through the whole height it fell, thickest low down where the bursts and the landing
    // threw it; it hangs three to six seconds and goes off with the wind (fineness 1: it rides the wind as the air does)
    // (born small in the wake of what went past, a moment after it: grown at once to its full size it was a row of round white balls)
    { const n = Math.round(34 * k * load + 6);
      for (let i = 0; i < n; i++) {
        const q = Math.pow(rnd(), 1.6), y = gnd + 0.3 + (py - gnd) * q, tb = dropT(Math.max(py - y, 0.01), vc) + 0.12 + 0.4 * rnd(), a = rnd() * TAU, w = (0.15 + 0.8 * rnd()) * s;
        Spray.puff(t + tb, px + Math.cos(a) * w, y, pz + Math.sin(a) * w, Math.cos(a) * 0.4, 0.15 * rnd(), Math.sin(a) * 0.4, 0.9 + 0.1 * rnd(), lerp(0.10, 0.22, rnd()) * s * big, lerp(0.8, 1.4, rnd()), 1, lerp(1.15, 1.75, rnd()), 0.5);
        if (i % 2 === 0) Spray.grain(t + tb + 0.3 * rnd(), px + Math.cos(a) * w, y, pz + Math.sin(a) * w, Math.cos(a) * 0.3, 0.2 * rnd(), Math.sin(a) * 0.3, 1, 0.4 + 1.6 * rnd() * rnd(), 1.6, 0.6);
      }
    }
  }
  // snow shaken off a bough onto the skier who brushes it (99_main.js, on a brush or a crash): not one soft round veil but six to twelve
  // small loose clumps coming apart as they fall, each eroded at its edges by the noise of the thrown snow, a little of the finest left
  // hanging between them, and the glittering grains. p: about head height, beside the tree; v: the skier's velocity; power: 0.8 brush .. 1.6 crash
  T.sift = function (t, p, v, power) {
    if (typeof Spray === 'undefined') return;
    const nc = Math.round(clamp(7.5 * power, 6, 12)), ng = Math.round(220 * power);
    for (let i = 0; i < nc; i++) {
      const a = rnd() * TAU, rr = 0.25 + 0.75 * Math.sqrt(rnd()), px = p[0] + Math.cos(a) * rr, pz = p[2] + Math.sin(a) * rr, py = p[1] + (rnd() - 0.2) * 1.2;
      const vx = v[0] * (0.15 + 0.25 * rnd()) + (rnd() - 0.5) * 1.0, vz = v[2] * (0.15 + 0.25 * rnd()) + (rnd() - 0.5) * 1.0, vy = -0.4 - rnd() * 1.0, f = 0.25 + 0.4 * rnd();
      Spray.puff(t + 0.06 * rnd(), px, py, pz, vx, vy, vz, f, lerp(0.05, 0.10, rnd()), lerp(4.5, 2.8, f), 1.8, 1.1, 0.6);
    }
    for (let i = 0; i < 3; i++) { const a = rnd() * TAU, rr = 0.4 * rnd(); Spray.puff(t + 0.1 + 0.15 * rnd(), p[0] + Math.cos(a) * rr, p[1] - 0.3 * rnd(), p[2] + Math.sin(a) * rr, v[0] * 0.2, -0.2, v[2] * 0.2, 0.92, lerp(0.10, 0.16, rnd()), 0.35, 1, 0.7, 1.0); }
    for (let i = 0; i < ng; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.9, px = p[0] + Math.cos(a) * rr, pz = p[2] + Math.sin(a) * rr, py = p[1] + (rnd() - 0.3) * 1.4;
      const vx = v[0] * (0.15 + 0.25 * rnd()) + (rnd() - 0.5) * 1.2, vz = v[2] * (0.15 + 0.25 * rnd()) + (rnd() - 0.5) * 1.2, vy = -0.3 - rnd() * 1.2;
      Spray.grain(t, px, py, pz, vx * 1.4, vy * 1.6 + 0.6, vz * 1.4, 0.35 + 0.65 * rnd(), 0.5 + 1.6 * rnd() * rnd(), 1.2);
    }
    if (typeof Grains !== 'undefined' && Grains.clumps) Grains.clumps(t, p, [v[0] * 0.2, -0.8, v[2] * 0.2], Math.round(4 * power), 0.05, { from: 'tree' });
    if (Spray.onEmit && Spray.onEmit.length) { const e = { kind: 'sift', t, p: p.slice(), v: [v[0] * 0.2, -0.8, v[2] * 0.2], spread: 1.5, rate: Math.min(2, power), powder: 1, r: [1, 0], f: [0, -1] }; for (const f of Spray.onEmit) f(e); }
  };
  function live(dt) {
    tick++;
    for (const [k, a] of shake) { const b = a * Math.exp(-dt * 3.0); if (b < 0.02) shake.delete(k); else shake.set(k, b); }
    for (const e of shed.values()) e.t += dt;
    // (a bough stays bare for as long as its tree is in the picture as a mesh: its snow never comes back while anyone could be looking)
    if (shed.size > 40) for (const [k, e] of shed) if (e.seen < tick - 90) { shed.delete(k); if (shed.size <= 24) break; }
    if (!T.life || !dt) return;
    // the skier brushes a tree (or hits one): it shudders, fine snow comes away all over its lower half, and a low bough lets go.
    // The skier goes close by one at speed and does not touch it (`near`, said a tenth of a second before the skier is level: ux, uz point
    // from the trunk at the skier's line, vx, vz are the skier's speed): the tree only stirs; the boughs that face the skier lose a breath
    // of their finest snow, which the wind of the pass takes along; and one of them, above head height, lets its load go at once, so that
    // it is coming down as the lens goes by. All of it is on the skier's side and early: a lens riding four metres behind is past the
    // tree a quarter of a second after the skier, and a speck takes a tenth of its life to show.
    if (dumped.size > 400) dumped.clear();
    if (typeof Game !== 'undefined' && Game.events) for (const ev of Game.events) {
      if (ev.type !== 'brush' && ev.type !== 'crash' && ev.type !== 'near' && ev.type !== 'rustle') continue;
      for (let i = 0; i < candN; i++) {
        const c = candA[i], o = candO[i]; if (Math.abs(c[o] - ev.x) > 0.05 || Math.abs(c[o + 2] - ev.z) > 0.05) continue;
        const key = c[o] * 8191 + c[o + 2], B = TM.kinds[c[o + 6]].B, hard = ev.type === 'crash';
        // (still in among its boughs: it goes on shaking, and what the body pushes past loses a little more of its snow)
        if (ev.type === 'rustle') {
          shake.set(key, Math.max(shake.get(key) || 0, 0.7));
          for (let k = 0, n = 0; k < 30 && n < 4; k++) { const b = B[Math.floor(rnd() * B.length)]; if (b.u > 0.55) continue; puff(c, o, b, 14, BRUSH, 0.15); n++; }
          // (and the bough the body is pushing through, or the one just above it, drops what it carries: a lump that bursts on the tiers
          // below and on the skier, the most of it from a tree the snow has plastered. A few to a tree, so a long push through one crown
          // keeps shaking snow down without emptying the whole tree into the air)
          const nb = dumped.get(key) || 0;
          if (nb < 5) { const b = facing(c, o, B, 0.08, 0.5); if (b) { dumped.set(key, nb + 1); puff(c, o, b, b.cls ? 40 : 60, SHED, 0.25); bomb(c, o, b, 0.55 + 0.25 * rnd()); } }
          break;
        }
        if (ev.type === 'near') {
          const cs = c[o + 4], sn = c[o + 5], to = b => (b.ca * cs + b.sa * sn) * ev.ux + (b.sa * cs - b.ca * sn) * ev.uz, q0 = nDust * DF; let top = null, n = 0;
          shake.set(key, Math.max(shake.get(key) || 0, 0.25 + 0.25 * ev.k));
          for (let k = 0; k < 120 && n < 6; k++) { const b = B[Math.floor(rnd() * B.length)]; if (b.u > 0.1 && b.u < 0.6 && to(b) > 0.5) { puff(c, o, b, 10, NEAR, 0.1); n++; } }
          for (let q = q0; q < nDust * DF; q += DF) { dust[q + 3] += 0.3 * ev.vx; dust[q + 5] += 0.3 * ev.vz; }
          for (const b of B) if (b.cls < 2 && b.pw < 3 && b.u > 0.15 && b.u < 0.5 && to(b) > (top ? to(top) : 0.5)) top = b;
          if (top && !shed.has(key) && shed.size < 96) { shed.set(key, { id: top.id, t: 0, seen: tick }); puff(c, o, top, top.cls ? 100 : 150, SHED, 0.2); bomb(c, o, top, 0.9); }
          break;
        }
        shake.set(key, hard ? 1.6 : 1.0);
        for (let k = 0, n = 0; k < 40 && n < (hard ? 16 : 10); k++) { const b = B[Math.floor(rnd() * B.length)]; if (b.u > (hard ? 0.9 : 0.6)) continue; puff(c, o, b, 18, BRUSH, 0.2); n++; }
        if (!shed.has(key)) letGo(c, o, key, true);       // (one bare bough to a tree: a second would hand the first its snow back)
        // (a knock shakes the boughs above too: two or three more loads come down from over the skier's side, one after another)
        { const nb = dumped.get(key) || 0, m = hard ? 3 : 2;
          for (let j = 0; j < m && nb + j < 5; j++) { const b = facing(c, o, B, 0.15 + 0.12 * j, 0.75); if (!b) break; dumped.set(key, nb + j + 1); puff(c, o, b, b.cls ? 50 : 80, SHED, 0.35 + 0.3 * j); bomb(c, o, b, (hard ? 0.9 : 0.7) - 0.1 * j); } }
        break;
      }
    }
    // now and then, somewhere in view, a bough lets its load go by itself (the more trees in view, the sooner one of them does)
    shedT -= dt;
    if (shedT <= 0 && candN) {
      shedT = (2.0 + 4.0 * rnd()) * clamp(24 / candN, 1, 6);
      for (let k = 0; k < 8 && !shedAt; k++) { const i = Math.floor(rnd() * candN), c = candA[i], o = candO[i], key = c[o] * 8191 + c[o + 2]; if (candD[i] < 5 || c[o + 6] === 6 || c[o + 6] === 8 || shed.has(key)) continue; letGo(c, o, key, false); break; }
      if (shedAt) { for (let i = 0; i < candN; i++) { const c = candA[i], o = candO[i]; if (Math.abs(c[o] - shedAt[0]) < 0.05 && Math.abs(c[o + 2] - shedAt[1]) < 0.05) letGo(c, o, c[o] * 8191 + c[o + 2], false); } shedAt = null; }
    }
  }
  function dustStep(dt, ox, oy, oz) {
    const G = Render.G, wx = G[GOFF.wind], wz = G[GOFF.wind + 2]; let n = 0, m = 0;
    for (let i = 0; i < nDust; i++) {
      const q = i * DF; let age = dust[q + 6] + dt, k = dust[q + 10]; const life = dust[q + 7];
      if (age > life) continue;
      if (dust[q + 1] < dust[q + 11]) {
        // down. (Where the curtain lands, some of it goes up again as dust.)
        if (k !== 4 || dust[q + 9] > 0.7) continue;
        k = dust[q + 10] = 0; age = 1e-4; dust[q + 7] = 1.0 + 1.6 * dust[q + 9]; dust[q + 1] = dust[q + 11] + 0.10; dust[q + 11] = -1e9;
        dust[q + 3] *= 0.4; dust[q + 5] *= 0.4; dust[q + 4] = 0.4 + 1.2 * dust[q + 9]; dust[q + 8] *= 1.3;
      }
      const S = SORT[k];
      if (age > 0) {
        // held back by the air, and taken along by the wind, each sort as much as it is
        const e = Math.exp(-dt * S[0]);
        dust[q + 3] = wx + (dust[q + 3] - wx) * e; dust[q + 5] = wz + (dust[q + 5] - wz) * e; dust[q + 4] = dust[q + 4] * e - S[1] * dt * (0.5 + 0.5 * e);
        dust[q] += dust[q + 3] * dt; dust[q + 1] += dust[q + 4] * dt; dust[q + 2] += dust[q + 5] * dt;
        dust[q + 8] += S[2] * dt;
      }
      dust[q + 6] = age;
      const d = n * DF; if (d !== q) for (let j = 0; j < DF; j++) dust[d + j] = dust[q + j];
      n++;
      if (age > 0) {
        const u = age / life, f = smooth(0, 0.1, u) * (1 - smooth(k === 0 ? 0.3 : 0.6, 1, u)), e = m++ * 8;
        dustGPU[e] = dust[d] - ox; dustGPU[e + 1] = dust[d + 1] - oy; dustGPU[e + 2] = dust[d + 2] - oz; dustGPU[e + 3] = dust[d + 8];
        dustGPU[e + 4] = S[3] * f; dustGPU[e + 5] = k + Math.min(dust[d + 9], 0.999); dustGPU[e + 6] = S[4] * f; dustGPU[e + 7] = k === 1 || k === 2 ? Math.min(Math.abs(dust[d + 4]), 12) * 0.008 : 0;
      }
    }
    nDust = n; T.stats.parts = m;
    if (m) gfx.updateBuffer(dustBuf, 0, dustGPU.subarray(0, m * 8));
  }

  // ---- which trees, at which level (render space = world - origin).
  // Chunks are visited nearest first, so the cards are roughly front to back and a full buffer only ever drops the farthest trees.
  const candA = [], candO = new Int32Array(640), candD = new Float32Array(640), order = new Uint16Array(640), selI = new Uint16Array(640), selF = new Float32Array(640 * 3);
  let candN = 0, ring = null, r0c = 0, r1c = 0; const lensP = [0, 0], lensV = [0, 0], manP = [0, 0], manV = [0, 0];
  function ringTable() {
    const n = Math.ceil(T.far / CS) + 1, a = [];
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) a.push([dx, dz, Math.hypot(dx, dz)]);
    a.sort((p, q) => p[2] - q[2]); ring = new Int16Array(a.length * 2); a.forEach((e, i) => { ring[i * 2] = e[0]; ring[i * 2 + 1] = e[1]; }); ring.far = T.far;
  }
  T.update = function (cam, origin, aspect, player, dt) {
    for (let v = 0; v < T.NV; v++) for (let l = 0; l < 2; l++) { const g = grp[v][l]; g.n = 0; g.solid = 0; g.gn = 0; }
    const st = T.stats; nFar = 0; candN = 0; st.near = st.far = st.fading = st.out = st.l0 = st.l1 = st.drawn = st.shadow = 0;
    if (!T.enabled) return;
    if (!ring || ring.far !== T.far) ringTable();
    dt = dt > 0 && dt < 0.1 ? dt : 0;
    const px = cam.pos[0], pz = cam.pos[2], fl = Math.hypot(cam.fwd[0], cam.fwd[2]) || 1, fx = cam.fwd[0] / fl, fz = cam.fwd[2] / fl, R = T.far, R2 = R * R;
    // (the lens's own speed over the map and the skier's, for the fade of what stands against the lens or between the two, below. Put
    // somewhere else at a stroke, they have none; and none where the lens rides on the skier, first person: what it is about to meet the
    // skier is about to meet, and that is seen until it is met. None either in version a of the owner's choice, 07_game.js: the rule as it was)
    if (dt) { const lx = px - lensP[0], lz = pz - lensP[1], mx = player ? player[0] - manP[0] : 0, mz = player ? player[2] - manP[1] : 0, old = typeof Variants !== 'undefined' && Variants.val.wood === 'a';
      const ok = !old && Math.hypot(lx, lz) < 70 * dt && Math.hypot(mx, mz) < 70 * dt ? (player ? smooth(0.8, 2.2, Math.hypot(player[0] - px, player[2] - pz)) : 1) / dt : 0; lensV[0] = lx * ok; lensV[1] = lz * ok; manV[0] = mx * ok; manV[1] = mz * ok; }
    lensP[0] = px; lensP[1] = pz; if (player) { manP[0] = player[0]; manP[1] = player[2]; }
    // the view as a wedge on the map, widened by a tree's width and by the reach of its shadow across the view. (A tree that only throws
    // its shadow into the picture from outside does it as a card: meshes are for what the lens can see.)
    const thx = Math.tan(cam.fovY / 2) * Math.max(aspect || 0.5, 0.3) * 1.15 + 0.06, mrg = 13, mrgM = 7;
    // (a long lens brings far trees near: the ranges are those of the lens the game is played through, and grow with any longer one)
    const zoom = clamp(0.5463 / Math.tan(cam.fovY / 2), 1, 6), zr0 = T.r0 * zoom, zr1 = T.r1 * zoom;
    const RM = cardsOnly ? 0 : zr1, RM2 = RM * RM, ox = origin[0], oy = origin[1], oz = origin[2];
    const far = (c, o, fade, d) => {
      if (nFar >= T.maxFar) return; const q = nFar++ * 12, s = c[o + 3] / 10 * smooth(R, R - 60, d), v = c[o + 6];
      farCPU[q] = c[o] - ox; farCPU[q + 1] = c[o + 1] - oy - 0.10 * s; farCPU[q + 2] = c[o + 2] - oz; farCPU[q + 3] = s;
      farCPU[q + 4] = c[o + 4]; farCPU[q + 5] = c[o + 5]; farCPU[q + 6] = c[o + 7]; farCPU[q + 7] = v + 0.98 * fade;
      farCPU[q + 8] = c[o + 8]; farCPU[q + 9] = c[o + 9]; farCPU[q + 10] = c[o + 10] * HWV[v]; farCPU[q + 11] = c[o + 11];
    };
    let pass = 0;
    const one = (c, o) => {
      const dx = c[o] - px, dz = c[o + 2] - pz, d2 = dx * dx + dz * dz; if (d2 > R2) return;
      const al = dx * fx + dz * fz, sd = Math.abs(dx * fz - dz * fx);
      if (d2 < RM2 && al > -mrgM && sd < Math.max(al, 0) * thx + mrgM) { if (pass === 0 && candN < 640) { candA[candN] = c; candO[candN] = o; candD[candN++] = Math.sqrt(d2); } return; }
      if (pass === 0 || al < -mrg || sd > al * thx + mrg) return;
      far(c, o, 1, Math.sqrt(d2));
    };
    // (trees that are not the course's own: the test hook's, and the saplings that mark a jump)
    nx = 0;
    const also = (x, z, h, rot, kind, seed) => { if (nx + NF > xtra.length) return; describe(xtra, nx, x, z, h, rot, 0, seed, kind); nx += NF; };
    for (const e of T.extra) also(e[0], e[1], e[2], e[3] || 0, (e[4] || 0) % T.NV, 0.5);
    // (where a jump has its flags, the two saplings that used to mark it are not drawn)
    if (typeof Gates === 'undefined' || !Gates.enabled) Course.markers(-pz - 40, -pz + R, (x, z, h, rot) => also(x, z, h, rot, 4, 0.37));
    const ccx = Math.floor(px / CS), ccz = Math.floor(pz / CS), crad = CS * 0.71;
    for (pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ring.length; i += 2) {
        const cx = ccx + ring[i], cz = ccz + ring[i + 1], mx = (cx + 0.5) * CS - px, mz = (cz + 0.5) * CS - pz, md = Math.hypot(mx, mz);
        if (pass === 0) { if (md > RM + crad) { if (Math.hypot(ring[i], ring[i + 1]) * CS > RM + 3 * CS) break; continue; } }
        else {
          if (md > R + crad) continue;
          const al = mx * fx + mz * fz; if (al < -mrg - crad || Math.abs(mx * fz - mz * fx) > Math.max(al, 0) * thx + mrg + crad) continue;
        }
        const c = chunk(cx, cz);
        for (let k = 0; k < c.length; k += NF) one(c, k);
      }
      for (let k = 0; k < nx; k += NF) one(xtra, k);
      if (pass === 0) {
        live(dt);
        for (let i = 0; i < candN; i++) order[i] = i;
        const ord = order.subarray(0, candN); ord.sort((a, b) => candD[a] - candD[b]);
        // The two ranges of the meshes. Where more trees stand inside one than its budget, the range draws in to the first tree over the
        // budget, and moves there smoothly: so a hand-over is always a matter of distance, across a band, and never a snap.
        const t0 = candN > T.max0 ? Math.min(zr0, candD[ord[T.max0]]) : zr0, t1 = candN > T.max1 ? Math.min(zr1, candD[ord[T.max1]]) : zr1;
        r0c = dt && r0c ? damp(r0c, t0, 5, dt) : t0; r1c = dt && r1c ? damp(r1c, t1, 5, dt) : t1;
        let ns = 0; const keepAll = stay();
        for (let n = 0; n < candN; n++) {
          const i = ord[n], c = candA[i], o = candO[i], d = candD[i], x = c[o], z = c[o + 2], h = c[o + 3];
          const f0 = smooth(r0c, r0c - T.w0 * zoom, d), f1 = smooth(r1c, r1c - T.w1 * zoom, d);       // 1 = all fine mesh; 1 = all mesh
          if (f1 > 0) {
            // A tree whose boughs stand between the lens and the skier, or right against the lens (where they would only be a wall across
            // the picture), is taken out: it fades quickly and evenly, stays out while it is in the way, and comes back once it is clear.
            // (Its shadow stays on the snow.) It is a decision per tree, held with some slack, so no tree hangs half-seen.
            // (At speed it would still be half there when it filled the frame: it is judged by where the lens will be at any moment
            // of the 0.16 s its going takes. tq: the moment of that stretch at which the lens is nearest it; standing still, now: and
            // the rule is then, to the last digit, the one it was)
            const rx = x - px, rz = z - pz, tq = clamp((rx * lensV[0] + rz * lensV[1]) / (lensV[0] * lensV[0] + lensV[1] * lensV[1] || 1), 0, 0.16), qx = rx - lensV[0] * tq, qz = rz - lensV[1] * tq;
            const de = (tq ? Math.hypot(qx, qz) : d) + 0.5 * Math.max(qx * fx + qz * fz - 2, 0) - 0.08 * h;
            let dl = 1e9;
            // (the skier's end of that line is where the skier will be by then: a tree about to be brushed past is out before it hides the figure)
            if (player) { const ax = player[0] + manV[0] * 0.16 - px, az = player[2] + manV[1] * 0.16 - pz, tt = clamp((rx * ax + rz * az) / (ax * ax + az * az || 1), 0.02, 1); dl = Math.hypot(rx - ax * tt, rz - az * tt) / h; }
            const key = x * 8191 + z; let e = veil.get(key);
            if (!e) { e = [1, false]; e[1] = dl < 0.17 || de < 4.5; e[0] = e[1] ? 0 : 1; }
            else { e[1] = e[1] ? !(dl > 0.24 && de > 5.3) : (dl < 0.17 || de < 4.5); e[0] = dt ? clamp(e[0] + (e[1] ? -dt / 0.16 : dt / 0.35), 0, 1) : (e[1] ? 0 : 1); }
            if (keepAll) { e[0] = 1; e[1] = false; }
            veil2.set(key, e);
            selI[ns] = i; selF[ns * 3] = f0; selF[ns * 3 + 1] = f1; selF[ns * 3 + 2] = e[0]; ns++;
            if (e[0] <= 0.004) st.out++; else if (e[0] < 0.999) st.fading++;
          }
          if (f1 < 1) far(c, o, 1 - f1, d);
        }
        { const t = veil; veil = veil2; veil2 = t; veil2.clear(); }
        // the solid ones first in each buffer (the picture draws those, the shadow map draws all), the fading ones again in a buffer of their own
        const put = (a, n, c, o, lo, hi, al) => {
          const q = n * 16, s = c[o + 3] / 10, key = c[o] * 8191 + c[o + 2], sh = shed.get(key); if (sh) sh.seen = tick;
          a[q] = c[o] - ox; a[q + 1] = c[o + 1] - oy - 0.10 * s; a[q + 2] = c[o + 2] - oz; a[q + 3] = s;
          a[q + 4] = c[o + 4]; a[q + 5] = c[o + 5]; a[q + 6] = lo; a[q + 7] = hi;
          a[q + 8] = c[o + 8]; a[q + 9] = c[o + 9]; a[q + 10] = c[o + 10]; a[q + 11] = c[o + 11];
          a[q + 12] = Math.min(c[o + 7], 0.999) + 2 * Math.round(al * 255); a[q + 13] = (shake.get(key) || 0) * T.life; a[q + 14] = sh ? sh.id : 0; a[q + 15] = sh ? Math.min(sh.t / 1.5, 1) : 0;
        };
        for (let solid = 1; solid >= 0; solid--) for (let n = 0; n < ns; n++) {
          const vis = selF[n * 3 + 2]; if ((vis >= 0.999) !== !!solid) continue;
          const i = selI[n], c = candA[i], o = candO[i], v = c[o + 6], f0 = selF[n * 3], f1 = selF[n * 3 + 1];
          for (let l = 0; l < 2; l++) {
            if (l ? f0 >= 1 : f0 <= 0) continue;
            const g = grp[v][l]; if (g.n >= g.cap) continue;
            const lo = l ? f0 : 0, hi = l ? f1 : f0;
            put(g.cpu, g.n++, c, o, lo, hi, 1); if (solid) g.solid++;
            if (!solid && vis > 0.004 && g.gn < GCAP) put(g.gcpu, g.gn++, c, o, lo, hi, vis);
            if (l) st.l1++; else st.l0++;
          }
          st.near++;
        }
      }
    }
    for (let v = 0; v < T.NV; v++) for (let l = 0; l < 2; l++) {
      const g = grp[v][l]; st.drawn += g.solid * meshes[v][l].count / 3; st.shadow += g.n * meshes[v][1].count / 3;
      if (g.n) gfx.updateBuffer(g.buf, 0, g.cpu.subarray(0, g.n * 16));
      if (g.gn) gfx.updateBuffer(g.gbuf, 0, g.gcpu.subarray(0, g.gn * 16));
    }
    if (nFar) gfx.updateBuffer(farBuf, 0, farCPU.subarray(0, nFar * 12));
    st.far = nFar; st.drawn += nFar * NSEG * 2; st.shadow += nFar * NSEG * 2;
    if (nDust) dustStep(dt, ox, oy, oz); else st.parts = 0;
  };
  // phase of the gusts at the origin of render space (the shader adds each tree's own place), kept in step across the floating origin
  // the skier's body among the boughs (version b of 'tpass'): its speed over the map (x, z), on (z), and whether the boughs right between
  // the lens and the figure are thinned (w; not where the lens rides on the skier, first person: there is nothing between the two)
  const _kU = [0, 0, 0, 0];
  const bodyU = () => {
    const on = stay() && typeof Game !== 'undefined' && Game.s ? 1 : 0, v = on ? Game.s.v : null;
    _kU[0] = v ? v[0] : 0; _kU[1] = v ? v[2] : 0; _kU[2] = on; _kU[3] = on && !(typeof Fpv !== 'undefined' && Fpv.on) ? 1 : 0;
    return _kU;
  };
  const gust = () => { const G = Render.G, o = Render.origin, wx = G[GOFF.wind], wz = G[GOFF.wind + 2], wl = Math.max(Math.hypot(wx, wz), 0.05); return [((o[0] * wx + o[2] * wz) / wl * 0.045) % TAU, 0, 0, 0]; };
  T.draw = function (R) {
    if (!T.enabled || !baked) return;
    const tex = { tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, gp = gust()[0], kU = bodyU();
    for (let l = 0; l < 2; l++) for (let v = 0; v < T.NV; v++) { const g = grp[v][l], m = meshes[v][l]; if (g.solid) gfx.draw(pipe, { u: { p: [gp, HWV[v], v, vary() ? 1 : 0], k: kU }, tex, vb: [m.vb, g.buf], ib: m.ib, count: m.count, instances: g.solid }); }
    if (nFar) {
      const L3 = Terrain.levels && Terrain.levels[3], xf = L3 ? Terrain.sunBinding(R.origin, 3).xf : [0, 0, 0, 0];
      gfx.draw(pipeCard, { u: { t: [xf[0], xf[1], xf[2], L3 ? 1 : 0], q: [vary() ? 1 : 0, 0, 0, 0] }, tex: { tA: atlasA, tB: atlasB, tShadow: R.shadowTex, tSky: Sky.lut, tDen: L3 ? L3.nTex : Tex.black }, vb: [farBuf], count: 2 * NSEG + 2, instances: nFar });
    }
  };
  // over the finished view (after the sky and the clouds): the trees that are fading, and the snow in the air
  T.drawGhost = function (R) {
    if (!T.enabled || !baked) return;
    const tex = { tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, u = { p: gust(), k: bodyU() };
    for (let l = 0; l < 2; l++) for (let v = 0; v < T.NV; v++) { const g = grp[v][l], m = meshes[v][l]; if (g.gn) gfx.draw(pipeGhostZ, { u, vb: [m.vb, g.gbuf], ib: m.ib, count: m.count, instances: g.gn }); }
    for (let l = 0; l < 2; l++) for (let v = 0; v < T.NV; v++) { const g = grp[v][l], m = meshes[v][l]; if (g.gn) gfx.draw(pipeGhost, { u: { p: [u.p[0], HWV[v], v, vary() ? 1 : 0], k: u.k }, tex, vb: [m.vb, g.gbuf], ib: m.ib, count: m.count, instances: g.gn }); }
    if (T.stats.parts) gfx.draw(pipeDust, { u: { p: [0, 0, 0, 0] }, tex: { tDetail: Tex.detail, tShadow: R.shadowTex, tSky: Sky.lut }, vb: [dustBuf], count: 4, instances: T.stats.parts });
  };
  T.drawShadow = function () {
    if (!T.enabled || !baked) return;
    const u = { p: gust(), k: bodyU() };
    // (every tree throws the shadow of its coarse mesh, the nearest ones too: the sun's map cannot tell the two apart, and a tree's shadow
    // then stays as it is while the tree itself changes level)
    for (let l = 0; l < 2; l++) for (let v = 0; v < T.NV; v++) { const g = grp[v][l], m = meshes[v][1]; if (g.n) gfx.draw(pipeShadow, { u, vb: [m.vb, g.buf], ib: m.ib, count: m.count, instances: g.n }); }
    if (nFar) gfx.draw(pipeCardShadow, { u: { p: [0, 0, 0, 0] }, tex: { tA: atlasA }, vb: [farBuf], count: 2 * NSEG + 2, instances: nFar });
  };
  T.isBaked = () => baked;
  return T;
})();

const TREE_SSL = `
struct TreeV { wp: vec3f, n: vec3f, hh: f32, }
// where a vertex of a tree stands: this tree's size, girth, turn and lean; the wind in its top and under its boughs; the bough that has just
// shed its snow. ph0: the phase of the gusts at the origin of render space. (All of it runs on game time.)
fn treeVertex(pos: vec3f, nrm: vec3f, mat: vec4f, tx: vec4f, i0: vec4f, i1: vec4f, i2: vec4f, i3: vec4f, ph0: f32, kb: vec4f) -> TreeV {
  var t: TreeV;
  let sc: f32 = i0.w; let gi: f32 = i2.z; let lev: f32 = tx.w; let tm: f32 = U.camPos.w;
  let isSnow: f32 = step(mat.x, 0.5); let curt: f32 = step(1.5, mat.x) * step(mat.x, 2.5) + step(4.5, mat.x);
  var p: vec3f = vec3f(pos.x * gi, pos.y, pos.z * gi);
  var hh: f32 = tx.x;
  // a bough that sheds: its snow sinks and is gone, the bough springs up, swings and settles
  if (i3.w > 0.0005 && abs(mat.w - i3.z) < 0.5) {
    let gone: f32 = smoothstep(0.0, 0.4, i3.w);
    p.y = p.y - isSnow * tx.x * gone * 0.9 + lev * lev * 0.05 * (1.0 - exp(-4.0 * i3.w) * cos(i3.w * 15.0));
    hh = mix(tx.x, mix(tx.x, -0.3, gone), isSnow);
  }
  let ph: f32 = fract(i3.x) * 6.2832;
  let wv: vec2f = U.wind.xz; let wl: f32 = max(length(wv), 0.05); let wd: vec2f = wv / wl;
  // gusts cross the forest as slow waves; between them the trees all but stand still
  let gu: f32 = 0.5 + 0.5 * sin(dot(i0.xz, wd) * 0.045 + ph0 - tm * 0.8);
  let amp: f32 = (0.25 + 0.75 * gu * gu) * clamp(wl / 1.3, 0.3, 2.5);
  let shk: f32 = i3.y;
  let q: f32 = saturate(pos.y * 0.1);
  // boughs ride up and down on their own time, the long ones most; one that has been brushed shudders; hanging branchlets swing
  p.y = p.y + lev * lev * (0.010 * amp * sin(tm * 2.3 + mat.w * 1.7 + ph) + 0.020 * shk * sin(tm * 21.0 + mat.w * 2.3));
  p = p + nrm * (curt * tx.z * (0.03 * amp * sin(tm * 3.1 + tx.x * 5.0 + ph) + 0.03 * shk * sin(tm * 23.0 + tx.x * 9.0)));
  let lp: vec3f = p * sc;
  // the stem bends from the foot, nodding with the gusts and circling a little; and it never grew quite straight
  let bend: vec2f = (wd * (0.55 + 0.45 * sin(tm * 1.13 + ph)) + vec2f(-wd.y, wd.x) * (0.5 * sin(tm * 1.71 + ph * 1.3))) * (0.075 * amp)
                  + vec2f(sin(tm * 17.0 + ph), cos(tm * 15.0 + ph)) * (0.03 * shk) + i2.xy * 10.0;
  let off: vec2f = bend * (q * q * sc);
  t.wp = i0.xyz + vec3f(lp.x * i1.x + lp.z * i1.y + off.x, lp.y, lp.z * i1.x - lp.x * i1.y + off.y);
  // the skier pushing through (version b of 'tpass'): the boughs give way round the body, from the skis to above the head, and are dragged
  // along the way it goes (a jacket drags needles with it). The body is taken as a short capsule laid back along the way it came over the
  // last fifth of a second, so a bough just gone past is still held over and swings back after it, not at once. The stem never moves;
  // a bough gives the more the further out along it the point is.
  if (kb.z > 0.5) {
    let rel: vec3f = t.wp - U.player.xyz;
    let dyv: f32 = rel.y - clamp(rel.y, 0.0, 1.85);
    let back: vec2f = -kb.xy * 0.2; let bl2: f32 = max(dot(back, back), 1e-4);
    let tb: f32 = clamp(dot(rel.xz, back) / bl2, 0.0, 1.0);
    let dxz: vec2f = rel.xz - back * tb; let dh: f32 = length(dxz);
    let RB: f32 = 0.9;
    let wgt: f32 = (1.0 - smoothstep(0.0, RB, sqrt(dh * dh + dyv * dyv * 2.0))) * (1.0 - 0.55 * tb) * saturate(lev * 1.2);
    if (wgt > 0.0) {
      let spd: f32 = length(kb.xy);
      var along: vec2f = vec2f(0.0); if (spd > 0.5) { along = kb.xy / spd; }
      let disp: vec2f = (dxz / max(dh, 0.05) * (RB - min(dh, RB)) * 0.85 + along * (0.3 * saturate(spd / 12.0))) * wgt;
      t.wp = t.wp + vec3f(disp.x, 0.10 * wgt, disp.y);
    }
  }
  let n: vec3f = normalize(vec3f(nrm.x, nrm.y * gi, nrm.z));
  t.n = vec3f(n.x * i1.x + n.z * i1.y, n.y, n.z * i1.x - n.x * i1.y);
  t.hh = hh;
  return t;
}
`;

// how the sun and the sky light a point of a tree, whatever it was drawn from (mesh or card): the two always agree
const TREE_SURF_SSL = `
struct TreeS { snow: f32, bark: f32, ao: f32, open: f32, thin: f32, tone: f32, N: vec3f, tn: vec3f, tb: vec3f, }
// how deep the snow must lie on a bough to show as snow (m): a tree that carries less shows more of its needles
// the pattern the hand-overs between levels of detail are made with: a fine grain that changes every frame (at 60 fps it reads as a true
// blend, and in a still as grain, not as hatching)
// (version b of 'tgrain', U.lampDir.w = 1: the grain is held still, frame after frame)
fn treeGrain(p: vec2f) -> f32 { return hash21(p + vec2f(37.0, 17.0) * ((U.origin.w - 64.0 * floor(U.origin.w / 64.0)) * (1.0 - U.lampDir.w) + 1.0)); }
fn snowLine(load: f32) -> f32 { return max(0.010, 0.022 + (1.0 - load) * 0.14); }
fn treeLight(s: TreeS, V: vec3f, sh: f32) -> vec3f {
  let L: vec3f = U.sunDir.xyz; let N: vec3f = s.N;
  let ndl: f32 = dot(N, L);
  let back: f32 = saturate(dot(-V, L)); let rim: f32 = pow(1.0 - saturate(dot(N, V)), 2.5);
  let sky: vec3f = U.ambSky.rgb * (0.30 + 0.70 * s.open);
  // snow on the boughs: sunlit where it faces the light, sky-blue in its own shade, glowing along its edges when the sun is behind it
  let ambS: vec3f = sky * (1.0 + 0.9 * N.y) + U.ambGnd.rgb * (0.34 - 0.28 * N.y) + twiLight(N) * (0.4 + 0.6 * s.open);
  var cs: vec3f = vec3f(0.93, 0.955, 0.985) * (U.sunCol.rgb * saturate((ndl + 0.30) / 1.30) * sh + ambS * s.ao);
  cs += U.sunCol.rgb * vec3f(1.0, 0.93, 0.85) * (back * back * rim * (0.25 + 0.75 * sh) * 0.9 + 0.10 * sh * saturate(-ndl + 0.2) * s.open);
  // needles: nearly black green, bark browner
  var albN: vec3f = mix(vec3f(0.015, 0.030, 0.022), vec3f(0.036, 0.054, 0.027), s.tone) * s.tn;
  albN = mix(albN, vec3f(0.060, 0.047, 0.040) * s.tb, s.bark);
  let ambN: vec3f = sky * (0.9 + 0.7 * N.y) + U.ambGnd.rgb * (0.42 - 0.34 * N.y) + twiLight(N) * (0.4 + 0.6 * s.open);
  var cn: vec3f = albN * (U.sunCol.rgb * saturate((ndl + 0.45) / 1.45) * sh + ambN * s.ao);
  cn += albN * U.sunCol.rgb * back * back * rim * 2.5 * sh * (1.0 - s.bark);
  // a spray of needles lets the sun through: seen against the light, its fringe is a warm green
  cn += vec3f(0.045, 0.060, 0.016) * s.tn * U.sunCol.rgb * (s.thin * sh * saturate(-ndl) * (0.35 + 0.65 * back));
  return mix(cn, cs, s.snow);
}
// (the owner's choice 'tvar' b and c) no two trees the same colour. seed: the tree's own number, which in b and c follows the stand it grows
// in (trees of a stand are kin, and the soil and the light are the same for them): toward 0 the stand runs blue-grey, toward 1 yellow-olive.
// Each tree is then darker or lighter on its own. kind: the species (fir bluer, stone pine bluer and lighter; a larch's twigs ochre, a dead
// snag weathered silver). Returns the needles' colour in xyz; barkTint, the stem's (and a larch's twigs').
fn needleTint(seed: f32, kind: f32) -> vec3f {
  let h: f32 = seed * 2.0 - 1.0; let k: f32 = mix(0.62, 1.6, fract(seed * 37.13 + 0.21));
  var t: vec3f = mix(vec3f(1.0), select(vec3f(1.40, 1.22, 0.50), vec3f(0.72, 0.98, 1.45), h < 0.0), min(abs(h) * 1.3, 1.0)) * k;
  if (abs(kind - 2.0) < 0.5) { t = t * vec3f(0.88, 1.0, 1.16); }
  if (abs(kind - 9.0) < 0.5) { t = t * vec3f(0.95, 1.12, 1.22) * 1.15; }
  return t;
}
fn barkTint(seed: f32, kind: f32) -> vec3f {
  let k: f32 = mix(0.85, 1.2, fract(seed * 53.7 + 0.4));
  if (abs(kind - 8.0) < 0.5) { return vec3f(3.6, 3.0, 2.4) * k; }
  if (abs(kind - 6.0) < 0.5) { return vec3f(1.55, 1.55, 1.62) * k; }
  return vec3f(k);
}
// what the skier's headlamp adds when a tree stands in its beam
fn treeLamp(s: TreeS, wp: vec3f) -> vec3f {
  let ll: vec3f = lampLight(wp);
  if (ll.x <= 0.00002) { return vec3f(0.0); }
  let Ld: vec3f = normalize(U.lamp.xyz - wp);
  let albN: vec3f = mix(vec3f(0.020, 0.034, 0.022), vec3f(0.060, 0.047, 0.040), s.bark);
  return ll * mix(albN, vec3f(0.93, 0.955, 0.985), s.snow) * (saturate(dot(s.N, Ld) * 0.6 + 0.4) * s.ao);
}
`;

// what the surface is at a point of a tree's mesh: is there anything here at all (the needles are cut out of their sheets), and is it
// snow, needles or bark. Shared by the picture, the shadow, and the bake of the cards.
const TREE_MAT_SSL = `
// where along a spray a point lies, counted in its branchlets: they leave the spine forward and outward, and none is quite straight
fn sprayAt(tx: vec4f, mat: vec4f) -> f32 {
  return (tx.x + 0.030 * sin(tx.y * 21.0 + mat.w * 5.0) + 0.018 * sin(tx.x * 33.0 + mat.w * 3.0) - abs(tx.y) * 0.9) / 0.115 + mat.w * 0.37;
}
// (declared before treeCut, which calls it: GLSL, the WebGL2 fallback, wants a function defined before its first use)
// a larch's bare twigs: thin, wiry and few, so the sky shows through the crown. Close to, each twig is a line; from afar, where a pixel holds
// many of them, the sheet keeps a fixed scatter of its texels (so that the crown reads as a haze of twigs, not as a solid cone)
fn twigCut(mat: vec4f, tx: vec4f, fw: f32) -> f32 {
  let cur: f32 = step(4.5, mat.x);
  let pitch: f32 = mix(0.10, 0.07, cur); let ap: f32 = fw / pitch;
  let s: f32 = select(sprayAt(tx, mat), (tx.x + 0.012 * sin(tx.y * 19.0 + mat.w * 7.0)) / pitch + mat.w * 0.61, cur > 0.5);
  let k: f32 = floor(s); let f: f32 = abs(s - k - 0.5); let h: f32 = hash11(k + mat.w * 19.0);
  let e: f32 = tx.z / (mix(0.65, 0.30, cur) + mix(0.35, 0.65, cur) * h);
  let fine: f32 = saturate((0.20 * (1.0 - 0.4 * e) - f) / max(ap, 0.001) + 0.5) * step(e, 1.0);
  let far: f32 = step(tx.z, mix(0.85, 0.62, cur)) * step(hash21(floor(tx.xy * vec2f(9.0, 11.0)) + vec2f(mat.w * 3.1, mat.w * 1.7)), 0.36);
  return mix(fine, far, smoothstep(0.35, 1.0, ap));
}
// how much of a pixel a sheet of twigs fills. fw: the width of a pixel on the sheet (m). line: see snowLine.
// (And where a pillow of the coarse level ends: its outline is not in its triangles.)
fn treeCut(mat: vec4f, tx: vec4f, fw: f32, line: f32) -> f32 {
  if (mat.x < 0.5) { return select(1.0, step(line, tx.x), tx.z > 0.5); }
  if (mat.x > 3.5) { return twigCut(mat, tx, fw); }
  if (mat.x > 2.5) { return 1.0; }
  if (mat.x < 1.5) {
    // a spray: each branchlet as long and as full as it likes, needles standing along both sides of it; and a second, finer set of them
    // lies across the first, so that the spray is dense toward the stem and ragged at its edge (never a comb with even teeth)
    let ap: f32 = fw / 0.115;
    // from far the gaps close: what is left is the outline, a little inside the longest branchlets
    if (ap > 1.2) { return step(tx.z, 0.80); }
    let s: f32 = sprayAt(tx, mat); let k: f32 = floor(s); let f: f32 = abs(s - k - 0.5);
    let h: f32 = hash11(k + mat.w * 17.0);
    let e: f32 = tx.z / (0.78 + 0.22 * h);
    let comb: f32 = abs(fract(abs(tx.y) * 62.0 + h * 7.0) - 0.5) * 2.0;
    let wid: f32 = mix(0.60, 0.13, smoothstep(0.30, 1.0, e)) * (0.75 + 0.5 * fract(h * 7.3)) * mix(0.70 + 0.60 * comb, 1.0, saturate(fw * 60.0));
    var fine: f32 = saturate((wid - f) / max(ap, 0.001) + 0.5) * step(e, 1.0);
    let s2: f32 = (tx.x - abs(tx.y) * 0.5 + 0.022 * sin(tx.y * 27.0 + mat.w * 9.0)) / 0.083 + mat.w * 0.71; let k2: f32 = floor(s2); let f2: f32 = abs(s2 - k2 - 0.5);
    let e2: f32 = tx.z / (0.50 + 0.38 * hash11(k2 + mat.w * 23.0));
    fine = max(fine, saturate((mix(0.52, 0.10, smoothstep(0.25, 1.0, e2)) - f2) / max(fw / 0.083, 0.001) + 0.5) * step(e2, 1.0));
    return mix(fine, step(tx.z, 0.80), smoothstep(0.45, 1.2, ap));
  }
  // a curtain: strands hang a hand apart and to different lengths, thinning toward their ends, shorter ones between the long
  let ap3: f32 = fw / 0.06;
  if (ap3 > 1.2) { return step(tx.z, 0.62); }
  let c3: f32 = (tx.x + 0.012 * sin(tx.y * 19.0 + mat.w * 7.0)) / 0.06 + mat.w * 0.61; let k3: f32 = floor(c3); let f3: f32 = abs(c3 - k3 - 0.5);
  let e3: f32 = tx.z / (0.35 + 0.65 * hash11(k3 + mat.w * 13.0));
  var fine3: f32 = saturate((0.46 * (1.0 - 0.6 * e3) - f3) / max(ap3, 0.001) + 0.5) * step(e3, 1.0);
  let c4: f32 = (tx.x - 0.010 * sin(tx.y * 23.0 + mat.w * 4.0)) / 0.043 + mat.w * 0.29; let k4: f32 = floor(c4); let f4: f32 = abs(c4 - k4 - 0.5);
  let e4: f32 = tx.z / (0.20 + 0.50 * hash11(k4 + mat.w * 31.0));
  fine3 = max(fine3, saturate((0.42 * (1.0 - 0.6 * e4) - f4) / max(fw / 0.043, 0.001) + 0.5) * step(e4, 1.0));
  return mix(fine3, step(tx.z, 0.62), smoothstep(0.45, 1.2, ap3));
}
// n1: lumps, n2: needles and grain (two reads of the detail texture). plast: how squarely the point faces the wind that plasters the stems.
// fw: as in treeCut.
fn treeSurface(mat: vec4f, tx: vec4f, N: vec3f, n1: vec4f, n2: vec4f, line: f32, load: f32, plast: f32, fw: f32) -> TreeS {
  var s: TreeS;
  s.ao = mat.y; s.open = mat.z;
  let isSnow: f32 = step(mat.x, 0.5); let isBark: f32 = step(2.5, mat.x); let isTwig: f32 = step(3.5, mat.x);
  let nd: f32 = n1.z * 0.6 + n2.z * 0.4;
  // a pillow is snow down to where it thins out over the needles: there the bough shows, a dark ragged line under every lump
  var snow: f32 = isSnow * smoothstep(-0.010, 0.010, tx.x - line + (nd - 0.5) * 0.07);
  // the stem carries what settled on it wherever it looks up at open sky (and its weather side is plastered); twigs keep only flecks of
  // it, along the branchlets of a spray, the needles at their sides stay dark: a bough that has lost its pillow is green
  var dust: f32 = smoothstep(0.30, 0.80, N.y) * smoothstep(0.45, 0.62, nd * 0.75 + 0.25 * s.open + 0.25 * (load - 0.8));
  if (mat.x > 0.5 && mat.x < 2.5) {
    dust = smoothstep(0.30, 0.80, N.y) * smoothstep(0.60, 0.76, n2.z * 0.55 + n1.z * 0.25 + 0.20 * s.open + 0.25 * (load - 0.8));
    if (mat.x < 1.5) { dust = dust * mix(smoothstep(0.40, 0.16, abs(fract(sprayAt(tx, mat)) - 0.5)), 0.6, smoothstep(0.3, 1.0, fw / 0.115)); }
  }
  // (a larch's twigs: a line of snow along the top of a twig here and there)
  if (isTwig > 0.5) { dust = smoothstep(0.45, 0.85, N.y) * smoothstep(0.64, 0.82, n2.z * 0.55 + n1.z * 0.25 + 0.20 * s.open + 0.25 * (load - 0.8)); }
  snow = max(snow, (1.0 - isSnow) * dust * 0.88);
  snow = max(snow, isBark * (1.0 - isTwig) * smoothstep(0.35, 0.75, plast + (nd - 0.5) * 0.6) * 0.9);
  s.snow = snow;
  s.bark = isBark * (1.0 - snow);
  s.thin = (1.0 - isSnow) * (1.0 - isBark);
  s.tone = n1.w * 0.6 + 0.2 * s.open; s.tn = vec3f(1.0); s.tb = vec3f(1.0);
  // needles are a thousand small facets, snow a soft crust
  let Nn: vec3f = normalize(N + (vec3f(n2.x, n2.y, n2.w) - 0.5) * 1.1);
  let Ns: vec3f = normalize(N + vec3f(n1.x - 0.5, 0.0, n1.y - 0.5) * 0.5 + (vec3f(n2.x, n2.y, n2.w) - 0.5) * 0.12);
  s.N = normalize(mix(Nn, Ns, snow));
  return s;
}
`;
// the part of the fragment stage every view of a mesh shares: which face of what is this (pos: the position whose derivatives give the
// triangle's own normal, view: a direction toward the viewer), and how wide a pixel is on a sheet of twigs
const TREE_FACE = (pos, view) => `
  let N0: vec3f = normalize(v.nrm);
  var Ng: vec3f = normalize(cross(dpdx(${pos}), dpdy(${pos}))); if (dot(Ng, ${view}) < 0.0) { Ng = -Ng; }
  let fc: f32 = dot(N0, Ng);
  // pillows and the stem are solid, their inner faces are never seen; twigs are seen from both sides
  if (fc < -0.2 && (v.mat.x < 0.5 || (v.mat.x > 2.5 && v.mat.x < 3.5))) { discard; }
  let d1: vec2f = dpdx(v.tx.xy); let d2: vec2f = dpdy(v.tx.xy); let fw: f32 = sqrt(0.5 * (dot(d1, d1) + dot(d2, d2)));`;

const TREE_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let toC: vec3f = U.camPos.xyz - v.wp; let dist: f32 = length(toC); let V: vec3f = toC / dist;
  // the hand-over between levels of detail: each level keeps its share of a pattern that moves every frame, the shares never overlap.
  // And a bough about to brush the lens thins out and is gone. (It is never left as a sprinkle of dark specks over the picture: below a
  // third of its pixels it is dropped altogether.)
  let g: f32 = treeGrain(v.clip.xy);
  var kd: f32 = smoothstep(0.8, 1.7, dist);
  // (version b of 'tpass': the trees stay, and a crown the lens is passing through is not a wall: within three metres of the lens its boughs
  // thin to a veil of needles going by, two in five of them still there right against the glass)
  if (M.k.w > 0.5) { kd = select(0.0, mix(0.4, 1.0, smoothstep(0.9, 3.2, dist)), dist > 0.7); }
  let keep: f32 = min(v.ex.y, kd);
  if (kd < 0.34 || g < v.ex.x || (keep < 0.999 && g >= keep)) { discard; }
  // (version b of 'tpass': the trees all stay, and only the boughs standing right between the lens and the skier are thinned, in a window
  // the shape of the figure that narrows toward it, so the skier is always seen through them. Boughs at the skier's side and round the body
  // are left, and sweep across it)
  if (M.k.w > 0.5) {
    let pc: vec3f = U.player.xyz + vec3f(0.0, 0.9, 0.0); let ab: vec3f = pc - U.camPos.xyz; let L2: f32 = dot(ab, ab);
    if (L2 > 1.0) {
      let tt: f32 = clamp(dot(v.wp - U.camPos.xyz, ab) / L2, 0.0, 1.0);
      let dq: vec3f = v.wp - U.camPos.xyz - ab * tt;
      let rd: f32 = length(vec3f(dq.x, dq.y * 0.55, dq.z));
      let rad: f32 = mix(2.0, 0.85, tt);
      let hole: f32 = (1.0 - smoothstep(rad * 0.5, rad, rd)) * (1.0 - smoothstep(0.82, 0.93, tt));
      if (hole > 0.0 && g < hole) { discard; }
    }
  }${TREE_FACE('v.wp', 'V')}
  var N: vec3f = N0; if (fc < 0.0) { N = -N0; }
  let n1: vec4f = tex(tDetail, v.bp.xz * 0.23 + v.bp.yy * vec2f(0.17, 0.11) + v.ex.z);                   // lumps
  let ln: f32 = snowLine(v.iv.x);
  if (treeCut(v.mat, v.tx, fw, ln + (n1.z - 0.5) * 0.03) < 0.5) { discard; }
  let n2: vec4f = tex(tDetail, v.bp.xy * 1.9 + v.bp.zz * vec2f(1.3, 1.7));                               // needles, grain
  var s: TreeS = treeSurface(v.mat, v.tx, N, n1, n2, ln, v.iv.x, dot(N, normalize(vec3f(-U.wind.x, 0.3, -U.wind.z) + vec3f(1e-4, 0.0, 0.0))), fw);
  if (M.p.w > 0.5) { s.tn = needleTint(v.ex.z, M.p.z); s.tb = barkTint(v.ex.z, M.p.z); }
  // a sheet of twigs asks for the light on the side of it that faces the sun, whichever side is looked at: the sun comes through
  var Nq: vec3f = N; if (s.thin > 0.5 && dot(N, U.sunDir.xyz) < 0.0) { Nq = -N; }
  // (the depth of the sun's map spans 1200 m: 0.0001 of it is 12 cm. A tree must see the shadow of its own next tier.)
  var sh: f32 = shadowAt(v.wp + Nq * (0.10 + 0.004 * dist), 0.00012);
  // (beyond the sun's map, where only a long lens shows a mesh, the tree still stands in its own shade: worked out as on a card, so the two agree)
  let cover: f32 = shadowCover(v.wp);
  if (cover < 0.999) {
    let hq: f32 = saturate((v.bp.y - V0F) / DVF);
    var ownS: f32 = smoothstep(mix(-0.45, -0.8, hq * hq), 0.25, v.iv.z / (v.iv.w * (1.0 - 0.8 * hq) + 0.3));
    ownS = max(ownS, smoothstep(0.55, 0.95, s.N.y) * (0.25 + 0.45 * hq) * saturate(U.sunDir.y * 4.0 + 0.1));
    ownS = ownS * mix(1.0, smoothstep(0.12, 0.55, s.ao * (0.3 + 0.7 * s.open)), 0.6);
    sh = sh * mix(ownS, 1.0, cover);
  }
  var col: vec3f = treeLight(s, V, sh);
  col += treeLamp(s, v.wp);
  col = applyFog(col, v.wp);
  GHOST_OUT
  return o;
}
`;

const TREE_CARD_FS = `
// a normal out of a photograph's frame into the tree's
fn cardN(e: vec2f, ph: f32) -> vec3f {
  let cp: f32 = cos(ph); let sp: f32 = sin(ph);
  let x: vec3f = vec3f(cp, 0.0, -sp); let z: vec3f = vec3f(sp * PITCH_C, PITCH_S, cp * PITCH_C); let y: vec3f = cross(z, x);
  let n: vec2f = e * 2.0 - 1.0;
  return x * n.x + y * n.y + z * sqrt(max(1.0 - dot(n, n), 0.0));
}
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let g: f32 = treeGrain(v.clip.xy);
  // the two photographs nearest the viewer's bearing, blended as the viewer walks round the tree
  let w: f32 = v.vw.z;
  let uv0: vec2f = vec2f((v.vw.x + v.uv.x) / NKF, (v.vw.w + v.uv.y) / NVF); let uv1: vec2f = vec2f((v.vw.y + v.uv.x) / NKF, uv0.y);
  let a0: vec4f = texLod(tA, uv0, v.ex.w); let a1: vec4f = texLod(tA, uv1, v.ex.w);
  let toC: vec3f = U.camPos.xyz - v.wp; let dist: f32 = length(toC); let V: vec3f = toC / dist;
  let kd: f32 = smoothstep(1.5, 5.0, dist);
  // the outline: the alpha falls away from each photograph's edge like a distance, so between two photographs the outline moves over;
  // and it is taken a little soft (a band of the moving pattern), not as a hard cut
  let al: f32 = mix(a0.a, a1.a, w);
  // (version b of 'tgrain': the outline cut clean, at the middle of that band: a still grain along every far crown would crawl as the view moves)
  if (al < 0.63 + 0.08 * mix(g, 0.5, U.lampDir.w) || (v.ex.z < 0.999 && g < 1.0 - v.ex.z) || g > kd || kd < 0.34) { discard; }
  let b: vec4f = mix(texLod(tB, uv0, v.ex.w), texLod(tB, uv1, v.ex.w), w);
  let nl: vec3f = normalize(mix(cardN(a0.xy, v.vw.x * KSTEP), cardN(a1.xy, v.vw.y * KSTEP), w));
  let N: vec3f = vec3f(nl.x * v.ex.x + nl.z * v.ex.y, nl.y, nl.z * v.ex.x - nl.x * v.ex.y);
  // every pixel back where it stood on the tree: so far in front of the card, or behind it
  let dz: f32 = (mix(a0.z, a1.z, w) - 0.5) * DR2 * v.fx.x;
  let Vh: vec3f = normalize(vec3f(V.x, 0.0, V.z) + vec3f(1e-5, 0.0, 0.0));
  let wt: vec3f = v.wp + Vh * dz + vec3f(0.0, dz * PITCH_T, 0.0);
  // (a bough the slope has buried stays buried: the card stands on the stem's line, the ground under the bough may be higher)
  if (wt.y < dot(v.gp.xy, wt.xz) + v.gp.z - 0.12 * v.fx.x) { discard; }
  var s: TreeS;
  // (a tree that carries less snow: its pillows end higher up, where they are thicker)
  let ln: f32 = snowLine(v.fx.z) / 0.16;
  s.snow = b.x * smoothstep(ln - 0.08, ln + 0.08, b.z + 0.08); s.ao = b.y; s.open = 1.0; s.bark = b.w; s.thin = (1.0 - b.x) * (1.0 - b.w); s.tone = 0.4; s.N = N; s.tn = vec3f(1.0); s.tb = vec3f(1.0);
  if (M.q.x > 0.5) { s.tn = needleTint(v.gp.w, v.vw.w); s.tb = barkTint(v.gp.w, v.vw.w); }
  // The tree's own shade is worked out, not looked up (in the sun's map the tree is the flat it is drawn as): the far side of the crown
  // lies in shade, less so toward the top where the crown is thin.
  let hq: f32 = saturate(1.0 - v.uv.y);
  let Lh: vec2f = normalize(U.sunDir.xz + vec2f(1e-5, 0.0));
  let pr: vec2f = vec2f(Vh.z, -Vh.x) * ((v.uv.x * 2.0 - 1.0) * v.fx.y) + Vh.xz * dz;       // where the pixel stands from the stem, on the map
  let rs: f32 = dot(pr, Lh);
  var ownS: f32 = smoothstep(mix(-0.45, -0.8, hq * hq), 0.25, rs / (v.fx.y * (1.0 - 0.8 * hq) + 0.3));
  // (and even there the tops of the pillows catch the low sun between the tiers, the more the higher up the tree)
  ownS = max(ownS, smoothstep(0.55, 0.95, N.y) * (0.25 + 0.45 * hq) * saturate(U.sunDir.y * 4.0 + 0.1));
  // (what lies deep under the tiers sees little of the sky and as little of the sun)
  ownS = ownS * mix(1.0, smoothstep(0.12, 0.55, b.y), 0.6);
  // What else stands toward the sun is asked of the sun's map from where the ray to the sun leaves the crown: the same ray, so the same
  // answer, but clear of the tree's own flat (and of its mesh, while the two hand over). Beyond the map the forest toward the sun shades
  // all but the tops.
  let wq: vec3f = wt + U.sunDir.xyz * (max(0.0, v.fx.y * (1.0 - 0.6 * hq) + 0.4 * v.fx.x - rs) / max(length(U.sunDir.xz), 0.2));
  var sh: f32 = shadowAt(wq + N * 0.25, 0.0003) * ownS;
  let cover: f32 = shadowCover(wq);
  if (cover < 0.999) { sh = sh * mix(exp(-v.fx.w * pow(1.0 - hq, 1.5)), 1.0, cover); }
  var col: vec3f = treeLight(s, V, sh);
  col += treeLamp(s, wt);
  col = applyFog(col, v.wp);
  o.color = vec4f(col, 1.0);
  return o;
}
`;
