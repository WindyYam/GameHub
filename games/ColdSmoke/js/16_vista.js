"use strict";
// ---------------------------------------------------------------- vista: what lies beyond the mountain — ranges along the horizon and a city standing in the cloud sea.
// Both are too far away ever to come nearer, so each is worked out once, on the CPU, as a panorama seen from the mountain. The panoramas hold
// surfaces (normal, material, distance, height), not colours: the sky shader lights them every frame with the same sun, sky and air as everything else.
const Vista = (() => {
  const V = {
    AZ: 1.25, EL0: -0.034, EL1: 0.090, farW: 2048, farH: 256,                 // far ranges: azimuth +-AZ about -z, elevation EL0..EL1 (rad)
    cityAz: 0.14, cityHalf: 0.22, cEL0: -0.105, cEL1: 0.098, cityW: 1024, cityH: 496,
    deck: 950,                                                                // the cloud deck lies this far below the eye (m), as in cloudSea()
    cityDist: 11500, cityNear: 8600, citySpan: 6400, cityTop: 2060, cityRise: 1.35,   // m; cityRise: how much taller the towers stand than they were first drawn
    shU0: -3000, shU1: 4600, shW0: -7200, shW1: 2600, shRes: 512,             // the deck area that can hold the towers' shadows (city-local metres)
    glN: 256, glU0: -6000, glU1: 6000, glW0: -6000, glW1: 6000,               // the deck area the city's own light falls on (city-local metres), and the size of its map
    ready: false, stats: {},
    // the city's lights (see buildLights). Strengths are those of the sources after dark; `day*`: how many times brighter each kind runs in
    // daylight (screens, signs and warning lamps are turned up by day and down at night, as the real ones are)
    lit: { on: 1, win: 0.72, screen: 0.95, strip: 2.2, flood: 1.0, sign: 1.7, spot: 1, glint: 16, beam: 1, deck: 1.25, dome: 1, town: 0.26, core: 0.20, road: 1, dayWin: 4.5, dayLed: 4.2, dayFlood: 3.6, dayGlow: 5 },
    lampH: 780,                                                               // towers whose tip stands higher than this (m above the deck) carry a red warning lamp
  };
  let gfx;
  // the quarters of the city: [u, w, radius, height of its tallest] in city-local metres
  const CORES = [[250, 150, 950, 1060], [-1650, 650, 760, 770], [1750, -350, 680, 660], [-350, 1750, 820, 540], [900, -1300, 520, 430]];

  // ---- fast lattice noise (0..1)
  const tab = new Float32Array(65536); for (let i = 0; i < 65536; i++) tab[i] = hashU(i * 7 + 99991) * U2F;
  function vn(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = ix & 255, x1 = (ix + 1) & 255, y0 = (iy & 255) << 8, y1 = ((iy + 1) & 255) << 8;
    const a = tab[y0 + x0], b = tab[y0 + x1], c = tab[y1 + x0], d = tab[y1 + x1];
    return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
  }

  // ================================================================= far ranges
  // one great massif to the left of the sun, a second out to the right, lower country behind the city so its skyline stands against the sky
  function envAz(az) { const a = (az + 0.37) / 0.20, b = (az - 0.62) / 0.26, c = (az - 0.14) / 0.30; return 0.62 + 0.52 * Math.exp(-a * a) + 0.36 * Math.exp(-b * b) - 0.20 * Math.exp(-c * c); }
  // height of the far country (m, relative to the eye) at x, z (km): ridged multifractal, folded so the ridges are not straight, gathered into
  // ranges with cloud-filled gaps between them, and dropping away with the curve of the earth
  function farH(x, z, oct) {
    const r = Math.hypot(x, z);
    const wx = x + 9 * (vn(x * 0.045 + 3.1, z * 0.045 + 7.7) - 0.5), wz = z + 9 * (vn(x * 0.045 + 11.4, z * 0.045 + 1.9) - 0.5);
    let f = 1 / 15, amp = 1, sum = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let n = 1 - Math.abs(vn(wx * f + o * 17.3, wz * f + o * 9.1) * 2 - 1); n *= n * w; w = Math.min(1, n * 1.9 + 0.15); sum += n * amp; f *= 2.1; amp *= 0.52;
    }
    const rg = 0.30 + 0.70 * smooth(0.36, 0.62, vn(x * 0.021 + 40.3, z * 0.021 + 13.7));
    return V.farBase + smooth(20, 32, r) * envAz(Math.atan2(x, -z)) * rg * Math.pow(sum, 1.3) * V.farAmp - r * r * 0.0786;
  }
  V.farBase = -1400; V.farAmp = 2700;
  const HS = [0.25, 0.8, 2.4, 6.0];

  function buildFar(W, H) {
    const A = new Uint8ClampedArray(W * H * 4), B = new Uint8ClampedArray(W * H * 4);
    const NR = 320, R0 = 20, R1 = 190, dr = Math.log(R1 / R0) / (NR - 1), del = (V.EL1 - V.EL0) / H;
    const rad = new Float32Array(NR); for (let i = 0; i < NR; i++) rad[i] = R0 * Math.exp(i * dr);
    const tanRow = new Float32Array(H); for (let k = 0; k < H; k++) tanRow[k] = Math.tan(V.EL1 - (k + 0.5) * del);
    const dist = new Float32Array(H), sdx = Math.sin(Sky.az), sdz = -Math.cos(Sky.az);
    const rowOf = t => (V.EL1 - Math.atan(t)) / del - 0.5;
    let vis = 0;
    for (let c = 0; c < W; c++) {
      const az = -V.AZ + (c + 0.5) / W * 2 * V.AZ, dx = Math.sin(az), dz = -Math.cos(az);
      dist.fill(0);
      // walk outward; whatever rises above everything nearer is seen, and fills the rows between the old skyline and the new
      let maxT = Math.tan(V.EL0), tPrev = maxT, rPrev = R0, kBot = H;
      for (let i = 0; i < NR; i++) {
        const r = rad[i], t = farH(dx * r, dz * r, 6) / (r * 1000);
        if (t > maxT) {
          const kTop = Math.max(0, Math.ceil(rowOf(t)));
          for (let k = Math.min(kBot, H) - 1; k >= kTop; k--) { const f = (tanRow[k] - tPrev) / (t - tPrev); dist[k] = rPrev + (r - rPrev) * (f < 0 ? 0 : f > 1 ? 1 : f); }
          if (kTop < kBot) kBot = kTop;
          maxT = t;
        }
        tPrev = t; rPrev = r;
      }
      // the row that holds the skyline is only partly covered
      const fr = rowOf(maxT) + 0.5, ks = Math.floor(fr), cov = ks + 1 - fr;
      if (ks >= 0 && ks < H - 1 && dist[ks] === 0 && dist[ks + 1] > 0 && cov > 0.02) dist[ks] = dist[ks + 1];
      let top = -1;
      for (let k = 0; k < H; k++) {
        const rr = dist[k]; if (rr <= 0) continue;
        if (top < 0) top = k;
        const x = dx * rr, z = dz * rr, e = Math.max(0.02, rr * 0.0007);
        const h0 = farH(x, z, 8), gx = -(farH(x + e, z, 8) - h0) / (e * 1000), gz = -(farH(x, z + e, 8) - h0) / (e * 1000), il = 1 / Math.hypot(gx, 1, gz);
        let hzn = -0.1; for (let s = 0; s < 4; s++) { const q = (farH(x + sdx * HS[s], z + sdz * HS[s], 5) - h0) / (HS[s] * 1000); if (q > hzn) hzn = q; }
        const rock = smooth(0.90, 0.72, il + (vn(x * 2.7 + 5, z * 2.7) - 0.5) * 0.26);
        const o = (k * W + c) * 4;
        A[o] = 127.5 + 127.5 * gx * il; A[o + 1] = 127.5 + 127.5 * il; A[o + 2] = 127.5 + 127.5 * gz * il; A[o + 3] = 255 * (k === ks ? cov : 1);
        B[o] = 255 * Math.log(rr / 20) / Math.LN10; B[o + 1] = 255 * (hzn + 0.1) / 1.1; B[o + 2] = 255 * rock; B[o + 3] = 255;
        vis++;
      }
      // carry the skyline's surface up into the empty sky above it (coverage 0) so filtering never mixes in black
      if (top > 0) { const s = (top * W + c) * 4; for (let k = top - 1; k >= 0; k--) { const o = (k * W + c) * 4; A[o] = A[s]; A[o + 1] = A[s + 1]; A[o + 2] = A[s + 2]; B[o] = B[s]; B[o + 1] = B[s + 1]; B[o + 2] = B[s + 2]; B[o + 3] = 255; } }
    }
    V.stats.farPx = vis;
    return { A: new Uint8Array(A.buffer), B: new Uint8Array(B.buffer) };
  }

  // ================================================================= the city
  // City-local frame: u to the right as seen from the mountain, w away from it; heights are measured from the top of the cloud deck.
  function cityFrame() {
    const a = V.cityAz, D = V.cityDist;
    return { C: [D * Math.sin(a), -D * Math.cos(a)], U: [Math.cos(a), Math.sin(a)], W: [Math.sin(a), -Math.cos(a)] };
  }
  function buildCityList() {
    const rnd = RNG(90417), T = [], cores = CORES;
    const env = (u, w) => { let e = 250 * Math.max(0, 1 - (u / 2800) ** 2 - (w / 2200) ** 2); for (const c of cores) { const d2 = ((u - c[0]) ** 2 + (w - c[1]) ** 2) / (c[2] * c[2]); e = Math.max(e, c[3] * Math.exp(-1.15 * d2)); } return e; };
    const marks = [[250, 100], [-1762, 620], [-1638, 620], [1050, 350], [-640, -520]];
    const ga = 0.38, gc = Math.cos(ga), gs = Math.sin(ga), P = 108;
    const mk = (u, w, h, o) => Object.assign({ u, w, h, rot: ga, hu: 26, hw: 26, round: false, tiers: [[-260, h, 1]], style: 0, seed: (rnd() * 1e9) | 0, tint: rnd(), mechP: 96 + rnd() * 70, crownH: 0, crownTone: 0.5, crownLit: 0, spire: 0, spireR: 2.2 }, o);
    for (let j = -30; j <= 30; j++) for (let i = -34; i <= 34; i++) {
      const r0 = rnd(), r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd(), r7 = rnd();
      if (((i % 7) + 7) % 7 === 3 || ((j % 9) + 9) % 9 === 5) continue;      // avenues: long slots of light through the skyline
      const gu = (i + (r0 - 0.5) * 0.24) * P, gw = (j + (r7 - 0.5) * 0.24) * P, u = gu * gc - gw * gs, w = gu * gs + gw * gc;
      const e = env(u, w);
      if (e < 40 || r1 > 0.36 + 0.44 * Math.min(1, e / 600)) continue;
      const h = e * (0.42 + 0.80 * r2 * r2 + 0.12 * r3);
      if (h < 70) continue;
      let near = false; for (const m of marks) if (Math.hypot(u - m[0], w - m[1]) < 105) near = true;
      if (near) continue;
      const hu = 19 + 15 * r5, t = mk(u, w, h, { hu, hw: hu * (0.72 + 0.56 * r6) });
      if (r6 > 0.66) t.rot = r5 > 0.3 ? 0.035 + (r2 - 0.5) * 0.05 : ga + 0.62;                 // some blocks ignore the grid; many of those stand square to the mountain, and their flanks catch the sun
      const tall = smooth(380, 800, h);
      if (r4 < 0.24) { t.style = 0; t.tiers = [[-260, h * 0.56, 1], [h * 0.56, h * 0.83, 0.76], [h * 0.83, h, 0.52]]; if (r3 > 0.45) { t.spire = h * 0.10; } }
      else if (r4 < 0.40) { t.style = r3 > 0.5 ? 0 : 2; }
      else if (r4 < 0.55) { t.style = 1; t.tiers = [[-260, h * 0.48, 1], [h * 0.48, h * 0.72, 0.80], [h * 0.72, h * 0.90, 0.60], [h * 0.90, h, 0.38]]; t.spire = h * (0.08 + 0.10 * r3); t.crownH = h * 0.10; t.crownTone = 0.72; t.crownLit = 0.9; }
      else if (r4 < 0.66) { t.style = r3 > 0.6 ? 2 : 0; t.round = true; t.hw = t.hu; }
      else if (r4 < 0.66 + 0.12 + 0.14 * tall) { t.style = r3 > 0.55 ? 3 : 0; const n = 10; t.tiers = []; for (let k = 0; k < n; k++) t.tiers.push([k ? h * k / n : -260, h * (k + 1) / n, 1 - 0.58 * Math.pow(k / n, 1.35)]); if (r3 < 0.5) t.spire = h * 0.07; }
      else { t.style = 4; t.hw = t.hu * 2.1; t.hu *= 0.78; t.crownH = 14; t.crownTone = 0.3; }
      if (t.style === 0 && !t.crownH && r3 > 0.3) { t.crownH = 10 + 26 * r5; t.crownTone = 0.42 + 0.3 * r2; t.crownLit = r1 > 0.3 ? 0.7 : 0; }
      T.push(t);
    }
    // ---- the towers people would know the skyline by
    { // the needle: a round shaft drawn out to a point, far taller than anything else
      const h = 1290, n = 18, t = mk(250, 100, h, { mark: 'needle', hu: 47, hw: 47, round: true, style: 2, spire: 190, spireR: 3.2, mechP: 172, crownH: 30, crownTone: 0.8, crownLit: 1 }); t.tiers = [];
      for (let k = 0; k < n; k++) t.tiers.push([k ? h * k / n : -260, h * (k + 1) / n, 1 - 0.80 * Math.pow(k / n, 1.5)]);
      T.push(t); }
    for (const s of [-1, 1]) { // twins, corner-on, joined high up by a bridge
      const h = 800; T.push(mk(-1700 + s * 62, 620, h, { mark: 'twin', hu: 29, hw: 29, rot: ga + 0.785, style: 0, spire: 64, crownH: 22, crownTone: 0.7, crownLit: 0.8, tiers: [[-260, h * 0.62, 1], [h * 0.62, h * 0.86, 0.80], [h * 0.86, h, 0.55]] })); }
    T.push(mk(-1700, 620, 452, { mark: 'bridge', hu: 40, hw: 7, rot: 0, style: 2, tiers: [[432, 452, 1]], crownH: 0 }));
    { // the stepped stone tower with a lantern on top
      const h = 940; T.push(mk(1050, 350, h, { mark: 'stone', hu: 44, hw: 44, style: 1, spire: 130, spireR: 2.6, crownH: 70, crownTone: 0.78, crownLit: 1, tiers: [[-260, h * 0.40, 1], [h * 0.40, h * 0.62, 0.82], [h * 0.62, h * 0.80, 0.64], [h * 0.80, h * 0.92, 0.46], [h * 0.92, h, 0.28]] })); }
    { // the blade: a thin slab, tapered
      const h = 880, n = 8, t = mk(-640, -520, h, { mark: 'blade', hu: 17, hw: 52, rot: ga + 0.25, style: 3, crownH: 0 }); t.tiers = [];
      for (let k = 0; k < n; k++) t.tiers.push([k ? h * k / n : -260, h * (k + 1) / n, 1 - 0.42 * (k / n)]);
      T.push(t); }
    // from the mountain the skyline has to stand well clear of the billows it rises from: every tower is drawn up by the same factor
    for (const t of T) { const k = V.cityRise; t.h *= k; t.spire *= k; t.crownH *= k; for (const tr of t.tiers) { if (tr[0] > 0) tr[0] *= k; tr[1] *= k; } }
    return T;
  }

  const fo = { tone: 0, glass: 0, light: 0 };
  // what the wall is made of at a point: p metres round the building, y metres up
  function facade(t, p, y) {
    const st = t.style; let tone, glass;
    if (st === 0) { const fin = (p % 9) < 1.0; tone = fin ? 0.52 : 0.15 + 0.10 * t.tint; glass = fin ? 0.25 : 1; }                         // glass curtain wall, slender fins
    else if (st === 1) { const pier = (p % 7.2) < 3.1; tone = pier ? 0.60 + 0.12 * t.tint : 0.19; glass = pier ? 0 : 0.6; }                // stone piers, windows set back between them
    else if (st === 2) { const band = (y % 12) < 4.2; tone = band ? 0.56 : 0.13; glass = band ? 0.05 : 1; }                               // ribbons of glass between pale bands, three floors to a band
    else if (st === 3) { const a = ((p + y * 0.55) % 42 + 42) % 42, b = ((p - y * 0.55) % 42 + 4200) % 42, dg = Math.min(Math.abs(a - 21), Math.abs(b - 21)) > 19.0; tone = dg ? 0.62 : 0.12; glass = dg ? 0.1 : 1; }   // the structure worn on the outside
    else if (st === 5) { tone = 0.42; glass = 0; }                                                                                         // masts
    else { const win = (p % 5.4) > 1.6 && ((y % 4) + 4) % 4 > 1.3; tone = win ? 0.15 : 0.72; glass = win ? 0.8 : 0.05; }                   // white metal panels, punched windows
    const mech = ((y % t.mechP) + t.mechP) % t.mechP < 7, crown = t.crownH > 0 && y > t.h - t.crownH;
    if (mech) { tone = 0.22; glass = 0.05; }
    let light = 0;
    if (crown) { tone = t.crownTone; glass = 0.1; light = t.crownLit; }
    else if (glass > 0.4) {
      const fl = Math.floor(y / 4), hsh = hash3U(Math.floor(p / 3.6), fl, t.seed), floorOn = (hashU(fl * 31 + t.seed) & 0xff) > 184;
      if ((hsh & 0xffff) < 65536 * (floorOn ? 0.66 : 0.27)) light = 0.3 + 0.7 * ((hsh >>> 16) & 0xff) / 255;
    }
    fo.tone = tone; fo.glass = glass; fo.light = light;
  }

  // column renderer: every wall is a strip of vertical lines, one per column of the panorama
  function renderCity(towers, CW, CH) {
    const SS = 2, BW = CW * SS, BH = CH * SS, n = BW * BH, F = cityFrame();
    const zb = new Float32Array(n).fill(1e9), NX = new Uint8Array(n), NZ = new Uint8Array(n), TO = new Uint8Array(n), GL = new Uint8Array(n), LI = new Uint8Array(n), HG = new Uint8Array(n);
    const az0 = V.cityAz - V.cityHalf, daz = 2 * V.cityHalf / BW, del = (V.cEL1 - V.cEL0) / BH, deck = V.deck;
    const tanRow = new Float32Array(BH); for (let k = 0; k < BH; k++) tanRow[k] = Math.tan(V.cEL1 - (k + 0.5) * del);
    const poly = new Float64Array(34);
    function prism(t, cu, cw, hu, hw, rot, round, y0, y1) {
      const nv = round ? 16 : 4, cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i < nv; i++) {
        let a, b; if (round) { const q = i / nv * TAU; a = hu * Math.cos(q); b = hu * Math.sin(q); } else { a = (i === 0 || i === 3) ? -hu : hu; b = i < 2 ? -hw : hw; }
        const lu = cu + a * cr - b * sr, lw = cw + a * sr + b * cr;
        poly[i * 2] = F.C[0] + lu * F.U[0] + lw * F.W[0]; poly[i * 2 + 1] = F.C[1] + lu * F.U[1] + lw * F.W[1];
      }
      const ccx = F.C[0] + cu * F.U[0] + cw * F.W[0], ccz = F.C[1] + cu * F.U[1] + cw * F.W[1];
      let per = 0;
      for (let i = 0; i < nv; i++) {
        const j = (i + 1) % nv, ax = poly[i * 2], azz = poly[i * 2 + 1], bx = poly[j * 2], bz = poly[j * 2 + 1], ex = bx - ax, ez = bz - azz, len = Math.hypot(ex, ez);
        let nx = ez / len, nz = -ex / len; const mx = (ax + bx) / 2, mz = (azz + bz) / 2;
        if (nx * (mx - ccx) + nz * (mz - ccz) < 0) { nx = -nx; nz = -nz; }
        const p0 = per; per += len;
        if (nx * mx + nz * mz >= 0) continue;                                // faces away from the mountain
        const xa = (Math.atan2(ax, -azz) - az0) / daz, xb = (Math.atan2(bx, -bz) - az0) / daz;
        const c0 = Math.max(0, Math.ceil(Math.min(xa, xb) - 0.5)), c1 = Math.min(BW - 1, Math.floor(Math.max(xa, xb) - 0.5));
        for (let c = c0; c <= c1; c++) {
          const a = az0 + (c + 0.5) * daz, dx = Math.sin(a), dz = -Math.cos(a), det = -ex * dz + dx * ez; if (Math.abs(det) < 1e-9) continue;
          const s = (ax * dz - dx * azz) / det, r = (-ex * azz + ez * ax) / det; if (s < -0.002 || s > 1.002 || r <= 0) continue;
          const kT = Math.max(0, Math.ceil((V.cEL1 - Math.atan((y1 - deck) / r)) / del - 0.5)), kB = Math.min(BH - 1, Math.ceil((V.cEL1 - Math.atan((y0 - deck) / r)) / del - 0.5) - 1);
          let px = nx, pz = nz;
          if (round) { px = dx * r - ccx; pz = dz * r - ccz; const l = Math.hypot(px, pz) || 1; px /= l; pz /= l; }
          const bnx = 127.5 + 127.5 * px, bnz = 127.5 + 127.5 * pz, pp = p0 + s * len;
          for (let k = kT; k <= kB; k++) {
            const q = k * BW + c; if (r >= zb[q]) continue;
            const y = deck + r * tanRow[k]; facade(t, pp, y);
            zb[q] = r; NX[q] = bnx; NZ[q] = bnz; TO[q] = 255 * fo.tone; GL[q] = 255 * fo.glass; LI[q] = 255 * fo.light; HG[q] = Math.max(0, Math.min(255, 255 * (y + 300) / (V.cityTop + 300)));
          }
        }
      }
    }
    for (const t of towers) {
      for (const tr of t.tiers) prism(t, t.u, t.w, t.hu * tr[2], t.hw * tr[2], t.rot, t.round, tr[0], tr[1]);
      if (t.spire) { const sv = t.style, cH = t.crownH; t.style = 5; t.crownH = 0; prism(t, t.u, t.w, t.spireR, t.spireR, 0, true, t.h, t.h + t.spire); t.style = sv; t.crownH = cH; }
    }
    // resolve the supersampled surface to the final panorama; then spread it a little way into the empty texels round it
    const A = new Uint8ClampedArray(CW * CH * 4), B = new Uint8ClampedArray(CW * CH * 4); let cov = 0;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      let m = 0, sx = 0, sz = 0, st = 0, sg = 0, sl = 0, sh = 0, sd = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const q = (y * SS + j) * BW + x * SS + i; if (zb[q] < 1e8) { m++; sx += NX[q]; sz += NZ[q]; st += TO[q]; sg += GL[q]; sl += LI[q]; sh += HG[q]; sd += zb[q]; } }
      if (!m) continue; cov++;
      const o = (y * CW + x) * 4;
      A[o] = sx / m; A[o + 1] = sz / m; A[o + 2] = st / m; A[o + 3] = 255 * m / (SS * SS);
      B[o] = sl / m; B[o + 1] = sg / m; B[o + 2] = 255 * (sd / m - V.cityNear) / V.citySpan; B[o + 3] = sh / m;
    }
    const done = new Uint8Array(CW * CH); for (let i = 0; i < CW * CH; i++) done[i] = A[i * 4 + 3] > 0 ? 1 : 0;
    for (let it = 0; it < 4; it++) {
      const add = [];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const i = y * CW + x; if (done[i]) continue;
        const nb = (x > 0 && done[i - 1]) ? i - 1 : (x < CW - 1 && done[i + 1]) ? i + 1 : (y < CH - 1 && done[i + CW]) ? i + CW : (y > 0 && done[i - CW]) ? i - CW : -1;
        if (nb >= 0) add.push(i, nb);
      }
      for (let k = 0; k < add.length; k += 2) { const i = add[k] * 4, s = add[k + 1] * 4; A[i] = A[s]; A[i + 1] = A[s + 1]; A[i + 2] = A[s + 2]; B[i] = B[s]; B[i + 1] = B[s + 1]; B[i + 2] = B[s + 2]; B[i + 3] = B[s + 3]; }
      for (let k = 0; k < add.length; k += 2) done[add[k]] = 1;
    }
    V.stats.cityPx = cov;
    // the same view as distances alone, unfiltered (16 bits in two channels; open sky = as far as it goes): each light asks it whether a
    // nearer tower stands in front of it
    const Z = new Uint8Array(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      let zn = 1e9; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const z = zb[(y * SS + j) * BW + x * SS + i]; if (z < zn) zn = z; }
      const q = zn > 1e8 ? 65535 : Math.max(0, Math.min(65534, Math.round((zn - V.cityNear) / V.citySpan * 65535))), o = (y * CW + x) * 4;
      Z[o] = q >> 8; Z[o + 1] = q & 255; Z[o + 3] = 255;
    }
    return { A: new Uint8Array(A.buffer), B: new Uint8Array(B.buffer), Z, zb, BW, BH };
  }

  // the towers' shadows on the deck, seen from above: with the sun this low a tower's shadow runs several times its height toward the mountain.
  // Done a few towers at a time (job.i says how far it has got), so that a setting sun can redraw them without a hitch
  function cityShadowJob(tanE, sunAz) {
    const F = cityFrame(), gx = -Math.sin(sunAz), gz = Math.cos(sunAz);
    // the way the shadows run on the ground, in city-local axes
    return { S: new Uint8Array(V.shRes * V.shRes), i: 0, su: gx * F.U[0] + gz * F.U[1], sw: gx * F.W[0] + gz * F.W[1], k: 1 / Math.max(tanE, 0.04) };
  }
  function cityShadowStep(job, towers, budgetMs) {
    const N = V.shRes, S = job.S, su = job.su, sw = job.sw, k = job.k, du = (V.shU1 - V.shU0) / N, dw = (V.shW1 - V.shW0) / N, t0 = performance.now();
    for (; job.i < towers.length; job.i++) {
      if ((job.i & 7) === 7 && performance.now() - t0 > budgetMs) return false;
      const t = towers[job.i], cr = Math.cos(t.rot), sr = Math.sin(t.rot);
      for (const tr of t.tiers) {
        const y0 = Math.max(0, tr[0]), y1 = tr[1]; if (y1 <= y0) continue;
        const hu = t.hu * tr[2], hw = (t.round ? t.hu : t.hw) * tr[2];
        // half-width of the tier across the shadow, and its half-depth along it
        const ax = Math.abs(hu * (cr * -sw + sr * su)) + Math.abs(hw * (-sr * -sw + cr * su)), al = Math.abs(hu * (cr * su + sr * sw)) + Math.abs(hw * (-sr * su + cr * sw));
        const a0 = y0 * k - al, a1 = y1 * k + al;
        const pen1 = 10 + 0.0093 * a1, ext = ax + pen1;
        // bounding box of the strip
        const u0 = t.u + su * a0, w0 = t.w + sw * a0, u1 = t.u + su * a1, w1 = t.w + sw * a1;
        const i0 = Math.max(1, Math.floor((Math.min(u0, u1) - ext - V.shU0) / du)), i1 = Math.min(N - 2, Math.ceil((Math.max(u0, u1) + ext - V.shU0) / du));
        const j0 = Math.max(1, Math.floor((Math.min(w0, w1) - ext - V.shW0) / dw)), j1 = Math.min(N - 2, Math.ceil((Math.max(w0, w1) + ext - V.shW0) / dw));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const ru = V.shU0 + (i + 0.5) * du - t.u, rw = V.shW0 + (j + 0.5) * dw - t.w, along = ru * su + rw * sw, across = Math.abs(-ru * sw + rw * su);
          if (along < a0 || along > a1) continue;
          const pen = 10 + 0.0093 * Math.max(along, 0), v = (ax - across) / pen + 0.5; if (v <= 0) continue;
          const e = Math.min(1, (along - a0) / 30) * Math.min(1, (a1 - along) / (30 + pen)), val = 255 * Math.min(1, v) * e, q = j * N + i;
          if (val > S[q]) S[q] = val;
        }
      }
    }
    return true;
  }

  // ================================================================= the city's lights
  // Everything that shines is a piece of geometry standing where its source stands: a wall of windows, a screen, a strip of LEDs up a
  // corner, a floodlit crown, a sign, a lamp on a mast, the beam of a searchlight. They are listed once, from the same towers the panorama
  // was drawn from, and drawn every frame over the sky (which has already painted the towers' bodies), each with its own colour, its own
  // clock and its own hour: `thr` is the height of the sun (rad) under which a light is lit; 0.3 = it is never off.
  const PAL = { cyan: [0.05, 0.78, 1.0], aqua: [0.04, 0.86, 0.78], blue: [0.10, 0.33, 1.0], violet: [0.48, 0.20, 1.0], magenta: [1.0, 0.10, 0.68], pink: [1.0, 0.24, 0.42], amber: [1.0, 0.50, 0.12], gold: [1.0, 0.72, 0.28], warm: [1.0, 0.82, 0.60], ice: [0.86, 0.95, 1.0], red: [1.0, 0.05, 0.02], green: [0.08, 0.90, 0.36], white: [1.0, 0.93, 0.82] };
  // A real city seen from a mountain is points of warm white and amber; colour is rare and small (a logo under a roof, a lit crown, a
  // screen high on a wall), and it is the colours signs are made in, the plain ones several times as likely as the fancy. Nothing here
  // takes its colour from the sky: the first version borrowed the nebula's cyan, violet and magenta for whole towers and for the glow in
  // the cloud, and the city read as the nebula's reflection
  const NEON = [PAL.red, PAL.blue, PAL.green, PAL.amber, PAL.red, PAL.blue, PAL.gold, PAL.cyan, PAL.magenta, PAL.green];
  const SOD = [1.0, 0.52, 0.17];                                              // the sodium light of the streets
  // what each quarter's streets throw up into the cloud: sodium everywhere, paler where the lamps have been changed for white ones
  const FAMC = [[1.0, 0.60, 0.26], [1.0, 0.50, 0.16], [1.0, 0.64, 0.32], [1.0, 0.54, 0.20], [1.0, 0.47, 0.14]];
  const DOME = FAMC.map(c => [c, [1.0, c[1] + 0.07, c[2] + 0.07]]);
  function buildLights(towers, zb, BW, BH) {
    const F = cityFrame(), deck = V.deck, az0 = V.cityAz - V.cityHalf, daz = 2 * V.cityHalf / BW, del = (V.cEL1 - V.cEL0) / BH;
    const WX = (u, w) => F.C[0] + u * F.U[0] + w * F.W[0], WZ = (u, w) => F.C[1] + u * F.U[1] + w * F.W[1];
    // is this point the nearest thing in its direction? (x, z from the eye; y above the deck's floor)
    const seen = (x, z, y, tol) => { const r = Math.hypot(x, z), c = Math.floor((Math.atan2(x, -z) - az0) / daz), k = Math.floor((V.cEL1 - Math.atan((y - deck) / r)) / del); return c >= 0 && c < BW && k >= 0 && k < BH && zb[k * BW + c] >= r - tol; };
    const FA = [], SP = [], BE = [], N = V.glN, GL = new Float32Array(N * N * 3), cnt = { wall: 0, screen: 0, strip: 0, flood: 0, sign: 0, lamp: 0, strobe: 0, glint: 0, beam: 0 };
    const Y0 = -30;                                                            // nothing lower ever shows above the billows
    // a rectangle of light on a wall, from a to b (x, z) and y0 to y1; a point of light
    const rect = (kind, a, b, y0, y1, seed, pA, pB, thr, spr, cA, gain, cB, pat, m0, m1, R) => { FA.push(a[0], a[1], b[0], b[1], y0, y1, kind, seed, pA, pB, thr, spr, cA[0], cA[1], cA[2], gain, cB[0], cB[1], cB[2], pat, m0, m1, R || 0, 0); };
    const spot = (x, y, z, col, gain, kind, per, ph, thr, m0, m1, m2) => { SP.push(x, y, z, 0, col[0], col[1], col[2], gain, kind, per, ph, thr, m0 || 1, m1 || 0, m2 || 1, 0); };
    // the light a tower sheds on the cloud round its foot
    const du = (V.glU1 - V.glU0) / N, dw = (V.glW1 - V.glW0) / N;
    const pool = (u, w, sig, col, amp) => {
      const i0 = Math.max(0, Math.floor((u - 3 * sig - V.glU0) / du)), i1 = Math.min(N - 1, Math.ceil((u + 3 * sig - V.glU0) / du)), j0 = Math.max(0, Math.floor((w - 3 * sig - V.glW0) / dw)), j1 = Math.min(N - 1, Math.ceil((w + 3 * sig - V.glW0) / dw));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = V.glU0 + (i + 0.5) * du - u, y = V.glW0 + (j + 0.5) * dw - w, g = amp * Math.exp(-(x * x + y * y) / (sig * sig)), o = (j * N + i) * 3; GL[o] += col[0] * g; GL[o + 1] += col[1] * g; GL[o + 2] += col[2] * g; }
    };
    // the walls of one tier that look toward the mountain, each from its left end to its right as seen from there (a round tier: its outline)
    function walls(t, tr) {
      const k = tr[2], hu = t.hu * k, hw = t.hw * k, cx = WX(t.u, t.w), cz = WZ(t.u, t.w), out = [];
      if (t.round) { const l = Math.hypot(cx, cz), tx = -cz / l * hu, tz = cx / l * hu; out.push({ a: [cx - tx, cz - tz], b: [cx + tx, cz + tz], pA: 0, pB: 2 * hu, len: 2 * hu, face: 1, R: hu }); return out; }
      const cr = Math.cos(t.rot), sr = Math.sin(t.rot), P = []; let per = 0;
      for (let i = 0; i < 4; i++) { const a = (i === 0 || i === 3) ? -hu : hu, b = i < 2 ? -hw : hw, lu = t.u + a * cr - b * sr, lw = t.w + a * sr + b * cr; P.push([WX(lu, lw), WZ(lu, lw)]); }
      for (let i = 0; i < 4; i++) {
        const A = P[i], B = P[(i + 1) % 4], ex = B[0] - A[0], ez = B[1] - A[1], len = Math.hypot(ex, ez), mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, p0 = per; per += len;
        let nx = ez / len, nz = -ex / len; if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
        const face = -(nx * mx + nz * mz) / Math.hypot(mx, mz); if (face < 0.03) continue;              // looks away, or is seen edge on
        out.push(Math.atan2(A[0], -A[1]) < Math.atan2(B[0], -B[1]) ? { a: A, b: B, pA: p0, pB: p0 + len, len, face, R: 0 } : { a: B, b: A, pA: p0 + len, pB: p0, len, face, R: 0 });
      }
      return out;
    }
    const at = (f, s) => { let x = f.a[0] + (f.b[0] - f.a[0]) * s, z = f.a[1] + (f.b[1] - f.a[1]) * s; if (f.R) { const r = Math.hypot(x, z), k = (r - f.R * Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2))) / r; x *= k; z *= k; } return [x, z]; };
    // how much of a wall is in view (walls wholly behind nearer towers are not listed at all)
    const shown = (f, y0, y1) => { let n = 0; for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) { const q = at(f, (i + 0.5) / 4); if (seen(q[0], q[1], y0 + (y1 - y0) * (j + 0.5) / 6, 16)) n++; } return n / 24; };
    const famOf = (u, w) => { let best = -1, bd = 1.5; for (let i = 0; i < CORES.length; i++) { const c = CORES[i], d = Math.hypot(u - c[0], w - c[1]) / c[2]; if (d < bd) { bd = d; best = i; } } return best; };
    const corners = new Set();
    for (const t of towers) {
      const rnd = RNG((t.seed ^ 0x2545f491) >>> 0), seed = rnd(), fam = famOf(t.u, t.w), tallK = smooth(250, 900, t.h), mkd = t.mark || '';
      const neon = () => NEON[(rnd() * NEON.length) | 0];
      // how near the middle of a quarter it stands: the light of a city is thickest at its centres and thins toward its edges
      const ck = 0.62 + 0.5 * Math.max(...CORES.map(c => (0.55 + 0.45 * c[3] / 1060) * Math.exp(-((t.u - c[0]) ** 2 + (t.w - c[1]) ** 2) / (c[2] * c[2] * 1.2))));
      // what the building is after dark: offices (most of them), a hotel with its sign, one asleep, a few with lines of light round their
      // tops, a very few with a screen high on a wall
      const x = rnd(), sch = mkd || (x < 0.012 + 0.045 * tallK && t.h > 330 ? 'media' : x < 0.05 + 0.10 * tallK && t.h > 380 ? 'outline' : x > 0.80 ? 'hotel' : x > 0.70 ? 'dark' : 'office');
      const c1 = neon(); let c2 = neon(); if (c2 === c1) c2 = neon();
      // its windows: [share of the blocks lit at night, colour of the lamps (0 warm .. 1 cold), strength]
      const r1 = rnd(), r2 = rnd();
      const W = sch === 'office' ? [0.22 + 0.36 * r1, 0.16 + 0.56 * r2, 1] : sch === 'hotel' ? [0.26 + 0.18 * r1, 0.04 + 0.26 * r2, 0.95] : sch === 'outline' ? [0.26 + 0.22 * r1, 0.25 + 0.45 * r2, 0.9] : sch === 'dark' ? [0.06, 0.4, 0.7] : sch === 'twin' ? [0.34, 0.55, 0.9] : sch === 'stone' ? [0.30, 0.10, 0.9] : [0.32, 0.50, 0.9];
      W[0] *= 0.75 + 0.25 * ck; W[2] *= ck;
      const wthr = 0.03 + (rnd() - 0.5) * 0.06, top = t.h - t.crownH, cx = WX(t.u, t.w), cz = WZ(t.u, t.w), cl = Math.hypot(cx, cz);
      const scrThr = (mkd || (tallK > 0.55 && rnd() < 0.5)) ? 0.3 : 0.12 * rnd(), lineThr = -0.02 + 0.10 * rnd(), lineChase = rnd() < 0.35 ? 1 : 0, lineRate = 0.10 + 0.14 * rnd();
      const crownC = rnd() < 0.72 ? (rnd() < 0.5 ? PAL.warm : rnd() < 0.5 ? PAL.gold : PAL.ice) : c1, crownThr = (mkd || (t.h > 600 && rnd() < 0.3)) ? 0.3 : -0.03 + 0.10 * rnd();
      const pat = (rnd() * 4) | 0, lam = 110 + 110 * rnd(), spd = 14 + 18 * rnd();
      // a screen takes the top of a wall or a band across it, never its whole height (a wall lit from foot to roof in one colour reads
      // from here as a stick of neon, which no real tower is); the rest of the wall is windows like any other
      const sv = rnd(), sa = rnd(), sb = rnd(), lineC = rnd() < 0.78 ? (rnd() < 0.5 ? PAL.white : rnd() < 0.5 ? PAL.gold : PAL.ice) : c1;
      const scr = sch === 'needle' ? [t.h * 0.80, 1e9] : sch === 'blade' ? [t.h * 0.86, 1e9] : sch !== 'media' ? null : sv < 0.55 ? [t.h * (0.76 + 0.12 * sa), 1e9] : [t.h * (0.42 + 0.30 * sa), t.h * (0.42 + 0.30 * sa) + 50 + 70 * sb];
      const winRect = (f, a0, a1) => { if (a1 > a0 + 3) { rect(0, f.a, f.b, a0, a1, seed, f.pA, f.pB, wthr, 0.13, [1, 1, 1], W[2], c1, 0, W[0], W[1], f.R); cnt.wall++; } };
      let best = null; const glassy = !mkd && t.style !== 1 && t.style !== 4 && t.h > 160, gw = [];
      for (let ti = 0; ti < t.tiers.length; ti++) {
        const tr = t.tiers[ti], y0 = Math.max(tr[0], Y0), y1 = tr[1], last = ti === t.tiers.length - 1; if (y1 < y0 + 3) continue;
        for (const f of walls(t, tr)) {
          if (!shown(f, Math.max(y0, 60), y1)) continue;
          const yw = Math.min(y1, top), dir = [(f.b[0] - f.a[0]) / f.len, (f.b[1] - f.a[1]) / f.len];
          const s0 = scr ? Math.max(y0, scr[0]) : 0, s1 = scr ? Math.min(yw, scr[1]) : 0;
          if (sch === 'bridge') { rect(4, f.a, f.b, y0, y1, seed, 0, f.len, 0.07, 0.004, PAL.warm, 0.5, PAL.warm, 0, 0, 0, 0); cnt.sign++; }
          else if (scr && s1 > s0 + 3 && (f.R || (f.face > 0.55 && f.len > 14))) {
            if (sch === 'needle') rect(1, f.a, f.b, s0, s1, seed, f.pA, f.pB, 0.3, 0.004, PAL.gold, 1, PAL.white, 0, 95, 30, f.R);
            else if (sch === 'blade') rect(1, f.a, f.b, s0, s1, seed, f.pA, f.pB, 0.3, 0.004, PAL.blue, 1, PAL.ice, 1, lam, spd, f.R);
            else rect(1, f.a, f.b, s0, s1, seed, f.pA, f.pB, scrThr, 0.004, c1, 1, c2, pat, lam, spd, f.R);
            cnt.screen++; winRect(f, y0, s0); winRect(f, s1, yw);
          }
          else winRect(f, y0, yw);
          if (glassy && !f.R && yw > y0 + 40) gw.push({ f, y0, y1: yw });
          // lines of light up the corners of its top third, and round the roof (most of them white or gold)
          if (sch === 'outline' || sch === 'twin') {
            const lc = sch === 'twin' ? PAL.white : lineC, yl = Math.max(y0, t.h * 0.68);
            if (!f.R && y1 > yl + 8) for (let end = 0; end < 2; end++) {
              const q = end ? f.b : f.a, key = Math.round(q[0]) + ',' + Math.round(q[1]) + ',' + ti; if (corners.has(key)) continue; corners.add(key);
              rect(2, end ? [q[0] - dir[0] * 2.2, q[1] - dir[1] * 2.2] : q, end ? q : [q[0] + dir[0] * 2.2, q[1] + dir[1] * 2.2], yl, y1, seed, 0, 2.2, lineThr, 0.004, lc, 1, lc, lineChase, 0, lineRate, 0); cnt.strip++;
            }
            if (last) { rect(2, f.a, f.b, y1 - 3, y1, seed, 0, f.len, lineThr, 0.004, lc, 0.8, lc, 0, 0, 0, f.R); cnt.strip++; }
          }
          // the stone tower: lamps on every setback wash the wall above it
          if (sch === 'stone' && ti > 0) { rect(3, f.a, f.b, tr[0], tr[0] + 0.6 * (y1 - tr[0]), seed, 0, f.len, 0.06, 0.004, PAL.gold, 1, PAL.gold, 0, 2.4, 0, f.R); cnt.flood++; }
          // a floodlit crown
          if (last && t.crownH > 0 && t.crownLit > 0) { const cc = sch === 'needle' ? PAL.ice : sch === 'twin' ? PAL.gold : sch === 'stone' ? PAL.amber : crownC; rect(3, f.a, f.b, top, t.h, seed, 0, f.len, crownThr, 0.004, cc, t.crownLit, sch === 'stone' ? PAL.gold : cc, 0, 1.1, sch === 'stone' ? 0.25 : 0, f.R); cnt.flood++; }
          if (last && !f.R && f.len * f.face > (best ? best.w : 9)) best = { f, w: f.len * f.face, y1: yw, y0 };
        }
      }
      // a sign under the roof, on the widest wall that looks this way (the tallest towers carry the biggest, and most of those are lit all day)
      if (best && !mkd && sch !== 'media' && (sch === 'hotel' || (t.h > 190 && rnd() < 0.34))) {
        const big = t.h > 600, f = best.f, wd = Math.max(12, f.len * (big ? 0.86 : 0.5 + 0.4 * rnd())), ht = big ? 20 + 14 * rnd() : 9 + 8 * rnd(), s0 = (f.len - wd) / 2, dx = (f.b[0] - f.a[0]) / f.len, dz = (f.b[1] - f.a[1]) / f.len, yT = best.y1 - 3;
        const a = [f.a[0] + dx * s0, f.a[1] + dz * s0], b = [a[0] + dx * wd, a[1] + dz * wd], q = rnd(), sc = q < 0.5 ? c1 : q < 0.68 ? PAL.red : q < 0.84 ? PAL.ice : PAL.gold, sp = rnd(), sthr = rnd() < (big ? 0.7 : 0.3) ? 0.3 : 0.02 + 0.17 * rnd(), rate = 0.5 + 0.7 * rnd();
        if (yT - ht > Math.max(best.y0, 80) && seen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, yT - ht / 2, 16)) { rect(4, a, b, yT - ht, yT, seed, 0, wd, sthr, 0.004, sc, 1, c2, sp < 0.6 ? 0 : sp < 0.85 ? 1 : 2, 0, rate, 0); cnt.sign++; }
      }
      // the mast: a line of light, a red lamp at its tip, on the tallest a white strobe as well
      if (t.spire && seen(cx, cz, t.h + t.spire * 0.5, 30)) {
        const tx = -cz / cl * t.spireR, tz = cx / cl * t.spireR, sc = (mkd || rnd() < 0.85) ? PAL.ice : c1;
        rect(2, [cx - tx, cz - tz], [cx + tx, cz + tz], t.h, t.h + t.spire, seed, 0, 2 * t.spireR, (mkd || t.h > 800) ? 0.3 : 0.10 * rnd(), 0.004, sc, 1.3, sc, rnd() < 0.45 ? 1 : 0, 0, 0.16 + 0.2 * rnd(), 0); cnt.strip++;
      }
      const tip = t.h + t.spire;
      // red warning lamps: on the tallest they burn all day, on the rest they come on toward evening
      if ((mkd || tip > V.lampH) && seen(cx, cz, tip - 1, 40)) {
        spot(cx, tip + 2, cz, PAL.red, 2.2 + 1.0 * tallK, 0, 2.2 + 1.2 * rnd(), rnd(), (mkd || tip > 1050) ? 0.3 : 0.02 + 0.09 * rnd(), 3.6); cnt.lamp++;
        if (t.spire && t.h > 760) { spot(cx, tip - 6, cz, PAL.ice, 5, 1, 1.5, rnd(), 0.3, 4.5); cnt.strobe++; }
      }
      if (t.h > 1200) for (const fy of [0.36, 0.68]) { const tr = t.tiers.find(q => q[1] >= t.h * fy), k = (cl - t.hu * tr[2] - 3) / cl; if (seen(cx * k, cz * k, t.h * fy, 12)) { spot(cx * k, t.h * fy, cz * k, PAL.red, 1.6, 2, 1, rnd(), 0.3, 3.6); cnt.lamp++; } }
      // by day the sun finds a pane of glass here and there, on a roof or high on a wall, and loses it again as the light shifts: each
      // has the height of the sun at which it flashes (m1) and how exactly the sun must stand there (m2)
      if (glassy && !t.spire && rnd() < 0.35 && seen(cx, cz, t.h - 1, 60)) { spot(cx, t.h + 1, cz, [1, 1, 1], 1, 3, 1, rnd(), 0.3, 1, 0.27 * rnd(), 0.010 + 0.010 * rnd()); cnt.glint++; }
      for (let k = 0; k < 2; k++) if (gw.length && rnd() < 0.5) {
        const g = gw[(rnd() * gw.length) | 0], q = at(g.f, 0.15 + 0.7 * rnd()), y = g.y0 + (g.y1 - g.y0) * rnd(), kk = 1 - 2 / Math.hypot(q[0], q[1]);
        if (y > 150 && seen(q[0], q[1], y, 16)) { spot(q[0] * kk, y, q[1] * kk, [1, 1, 1], 1, 3, 1, rnd(), 0.3, 1, 0.27 * rnd(), 0.010 + 0.010 * rnd()); cnt.glint++; }
      }
      // what it sheds on the cloud round its foot: the light of its lobby, its forecourt and the streets about it, in its quarter's lamps
      pool(t.u, t.w, 60 + 0.35 * t.h, fam >= 0 ? FAMC[fam] : SOD, (0.006 + 0.028 * tallK) * (sch === 'dark' ? 0.2 : 0.9) * ck);
    }
    // searchlights on a few of the highest flat roofs: xenon white, as they are (the night's colour setting leaves every other one out)
    { const brnd = RNG(7717);
      const beam = (t, col, side) => { const x = WX(t.u, t.w), z = WZ(t.u, t.w); BE.push(x, t.h + 4, z, 3000, col[0], col[1], col[2], 0.6, V.cityAz + side * (1.15 + 0.5 * brnd()), 0.40 + 0.2 * brnd(), 0.45 + 0.4 * brnd(), 0.13 + 0.1 * brnd(), 8 + 7 * brnd(), brnd() * TAU, -0.025 - 0.05 * brnd(), 20); spot(x, t.h + 5, z, col, 4, 2, 1, brnd(), -0.03, 1); cnt.beam++; };
      const roofsOf = ci => { const c = CORES[ci]; return towers.filter(t => !t.mark && !t.spire && Math.hypot(t.u - c[0], t.w - c[1]) < c[2] * 0.8 && seen(WX(t.u, t.w), WZ(t.u, t.w), t.h - 1, 60)).sort((a, b) => b.h - a.h); };
      const r0 = roofsOf(0), r1 = roofsOf(1), r2 = roofsOf(2);
      if (r0.length > 2) { beam(r0[0], PAL.ice, -1); beam(r0[2], PAL.white, 1); }
      if (r1.length) { beam(r1[0], PAL.ice, 1); beam(r1[0], PAL.white, -1); }
      if (r2.length > 1) { beam(r2[0], PAL.white, -1); beam(r2[1], PAL.ice, 1); }
    }
    // the town itself, down under the cloud, far wider than its towers: sodium streets in clumps, paler where the lamps are white ones,
    // brightest under the quarters and along the avenues (the long slots the towers leave: buildCityList), which show through the cloud
    // as veins of light. (GL holds light as the eye has it at night; `enc` scales it into the map's eight bits)
    const ga = 0.38, gc = Math.cos(ga), gs = Math.sin(ga), P = 108, slot = (g, n, k) => { const q = ((g / P - k + n / 2) % n + n) % n - n / 2; return Math.exp(-((q * P / 95) ** 2)); };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = V.glU0 + (i + 0.5) * du, w = V.glW0 + (j + 0.5) * dw, o = (j * N + i) * 3;
      const b = V.lit.town * Math.exp(-(((u + 200) / 3600) ** 2 + (w / 3000) ** 2)) * (0.6 + 0.8 * vn(u / 800 + 31.7, w / 800 + 5.3)), pk = vn(u / 1700 + 3.1, w / 1700 + 77.7);
      const gu = u * gc + w * gs, gw = -u * gs + w * gc, road = Math.max(slot(gu, 7, 3), slot(gw, 9, 5)), bb = b * (0.8 + 1.1 * road * V.lit.road);
      let r = bb, g = bb * lerp(0.50, 0.63, pk), bl = bb * lerp(0.15, 0.31, pk);
      for (let c = 0; c < CORES.length; c++) { const q = CORES[c], e = V.lit.core * (0.3 + q[3] / 1000) * Math.exp(-((u - q[0]) ** 2 + (w - q[1]) ** 2) / (q[2] * q[2] * 1.5)), fc = FAMC[c]; r += e * fc[0]; g += e * fc[1]; bl += e * fc[2]; }
      GL[o] += r; GL[o + 1] += g; GL[o + 2] += bl;
    }
    let enc = 1e-6; for (let i = 0; i < GL.length; i++) if (GL[i] > enc) enc = GL[i];
    const glow = new Uint8Array(N * N * 4); for (let i = 0; i < N * N; i++) { glow[i * 4] = 255 * GL[i * 3] / enc; glow[i * 4 + 1] = 255 * GL[i * 3 + 1] / enc; glow[i * 4 + 2] = 255 * GL[i * 3 + 2] / enc; glow[i * 4 + 3] = 255; }
    V.glowEnc = enc;
    V.stats.lights = cnt;
    return { faces: new Float32Array(FA), spots: new Float32Array(SP), beams: new Float32Array(BE), glow };
  }

  let pipeFace, pipeSpot, pipeBeam, pipeGlow, litReady = false;
  function initLights(L) {
    const S = cityLightSSL(), i4 = n => [{ instanced: true, attrs: Array.from({ length: n }, (_, i) => ['i' + i, 'vec4f']) }];
    const base = { topology: 'strip', cull: 'none', depthFunc: 'lequal', depthWrite: false, blend: 'add' };
    V.cityZ = gfx.texture({ w: V.cityW, h: V.cityH, format: 'rgba8', filter: 'nearest', wrap: 'clamp', data: L.Z });
    V.glowTex = gfx.texture({ w: V.glN, h: V.glN, format: 'rgba8', filter: 'linear', wrap: 'clamp', mips: true, data: L.glow }); gfx.genMips(V.glowTex);
    V.faceBuf = gfx.buffer(L.faces, 'vertex'); V.nFace = L.faces.length / 24;
    V.spotBuf = gfx.buffer(L.spots, 'vertex'); V.nSpot = L.spots.length / 16;
    V.beamBuf = gfx.buffer(L.beams, 'vertex'); V.nBeam = L.beams.length / 16;
    pipeFace = gfx.pipeline(Object.assign({ name: 'cityFace', lib: [SL.common, S.air, S.lit], buffers: i4(6), varyings: { st: 'vec4f', ab: 'vec4f', py: 'vec4f', ca: 'vec4f', cb: 'vec4f', mi: 'vec4f', ex: 'vec4f' }, uniforms: { p: 'vec4f', q: 'vec4f', r: 'vec4f', s: 'vec4f' }, textures: { tDetail: '2d', tCityZ: '2d' }, vs: S.faceVS, fs: S.faceFS }, base));
    pipeSpot = gfx.pipeline(Object.assign({ name: 'citySpot', lib: [SL.common, S.air, S.lit], buffers: i4(4), varyings: { uv: 'vec2f', col: 'vec4f' }, uniforms: { p: 'vec4f', q: 'vec4f' }, textures: { tDetail: '2d', tCityZ: '2d' }, vs: S.spotVS, fs: S.spotFS }, base));
    pipeBeam = gfx.pipeline(Object.assign({ name: 'cityBeam', lib: [SL.common, S.air, S.lit], buffers: i4(4), varyings: { ab: 'vec4f', pos: 'vec4f', col: 'vec4f' }, uniforms: { p: 'vec4f', q: 'vec4f' }, textures: { tDetail: '2d', tCityZ: '2d' }, vs: S.beamVS, fs: S.beamFS }, base));
    pipeGlow = gfx.pipeline(Object.assign({ name: 'cityGlow', lib: [SL.common, SEA_MAP_SSL, S.air, S.lit], buffers: [], varyings: { dir: 'vec3f' }, uniforms: { p: 'vec4f', q: 'vec4f', c0: 'vec4f', c1: 'vec4f', c2: 'vec4f', c3: 'vec4f', c4: 'vec4f' }, textures: { tDetail: '2d', tCityZ: '2d', tCityA: '2d', tCityB: '2d', tGlow: '2d', tSeaB: '2d' }, vs: S.glowVS, fs: S.glowFS }, base));
    V.pipes = [pipeGlow, pipeBeam, pipeFace, pipeSpot];
    // these pipelines are made ready here and not in the boot list (99_main.js): until they are, the city is simply drawn without its lights
    V.pipesReady = (async () => { for (const P of V.pipes) { if (gfx.finishPipelineAsync) await gfx.finishPipelineAsync(P); else gfx.finishPipeline(P); } litReady = true; })()
      .catch(e => { V.litErr = e; console.error('city lights: ' + (e && e.message ? e.message : e)); if (e && e.vs) console.log(e.vs.slice(0, 30000)); if (e && e.fs) console.log(e.fs.slice(0, 30000)); });
    if (!V.hooked) { V.hooked = true; Render.passes.transparent.push(R => V.drawLights(R)); }       // first in the list: straight after the sky, before the clouds that drift in front
  }
  // every frame, over the sky: the lit haze and the under-lit deck, the searchlights, the walls, the lamps. All additive, all behind
  // whatever the mountain puts in front (they are drawn at the far plane and tested against the scene's depth)
  V.drawLights = function (R) {
    const L = V.lit; if (!litReady || !L.on) return;
    // nothing to do while the camera looks somewhere else
    const c = R.cam, th = Math.tan(c.fovY / 2), half = Math.atan(th * Math.hypot(1, R.W / R.H));
    if (c.fwd[0] * Math.sin(V.cityAz) - c.fwd[2] * Math.cos(V.cityAz) < Math.cos(Math.min(PI, half + 0.6))) return;
    // how much it is day: lamps that hold against daylight are turned up as the eye (the exposure) is turned down, so nothing jumps between
    // (and in the last of the twilight the exposure opens wider than it does at night: `ek` keeps the lamps from flaring up with it)
    const e = Sky.sunElev, dk = sat((1 / Sky.exposure - 1 / 1.2) / (1 / Sky.expDay - 1 / 1.2)), ek = Math.min(1, 1.2 / Sky.exposure), t = R.time, p = [e, dk, ek, Sky.isMoon ? 1 : 0], tex = { tDetail: Tex.detail, tCityZ: V.cityZ };
    // the glow of the streets is there before the windows are: it gathers through the last of the afternoon and is at its full by dusk
    const gl = (0.25 * smooth(0.14, 0.03, e) + 0.75 * smooth(0.04, -0.085, e)) * (1 + (L.dayGlow - 1) * dk) * ek;
    // (the night's colour, 12_nebula.js NSKY: the lights calmer by night, half the searchlights out)
    const nk = NSKY.step(R.time), cs = lerp(1, nk[2], Sky.lights);
    const dome = i => { const k = 0.5 + 0.5 * Math.sin(t * (0.09 + 0.017 * i) + i * 2.1), a = DOME[i][0], b = DOME[i][1], s = 0.3 * CORES[i][3] / 1000; return [lerp(a[0], b[0], k) * s, lerp(a[1], b[1], k) * s, lerp(a[2], b[2], k) * s, 0]; };
    if (gl > 0.001) gfx.draw(pipeGlow, { u: { p: [e, dk, gl, t], q: [0, V.glowEnc / 1.2 * L.deck, L.dome, 0], c0: dome(0), c1: dome(1), c2: dome(2), c3: dome(3), c4: dome(4) }, tex: { tDetail: Tex.detail, tCityZ: V.cityZ, tCityA: V.cityA, tCityB: V.cityB, tGlow: V.glowTex, tSeaB: Clouds.sea.B }, count: 4 });
    if (V.nBeam && e < 0 && L.beam > 0) gfx.draw(pipeBeam, { u: { p, q: [L.beam * nk[4], cs, nk[3], 0] }, tex, vb: [V.beamBuf], count: 4, instances: V.nBeam });
    gfx.draw(pipeFace, { u: { p, q: [L.win, L.screen, L.strip, L.flood], r: [L.sign, L.dayWin, L.dayLed, L.dayFlood], s: [cs, 0, 0, 0] }, tex, vb: [V.faceBuf], count: 4, instances: V.nFace });
    gfx.draw(pipeSpot, { u: { p, q: [L.spot, L.glint, 0, 0] }, tex, vb: [V.spotBuf], count: 4, instances: V.nSpot });
  };

  // the sizes of the panoramas, which the sky's shader is written with: set before Sky.init when the panoramas themselves come later
  V.setRes = function (farW, cityW) { if (farW) V.farW = farW; if (cityW) { V.cityW = cityW; V.cityH = Math.round(cityW * 0.484); } };
  V.init = function (g, opt = {}) {
    gfx = g; const t0 = performance.now();
    V.setRes(opt.farW, opt.cityW);
    const far = opt.far || buildFar(V.farW, V.farH), t1 = performance.now();          // (opt.far: made in a background thread, see Par.jobs.vistaFar)
    V.towers = buildCityList();
    // (opt.city: the city's panorama and its lights as the last start made them, 00e_cache.js)
    const oc = opt.city && opt.city.w === V.cityW ? opt.city : null;
    const city = oc ? { A: oc.A, B: oc.B, Z: oc.Z } : renderCity(V.towers, V.cityW, V.cityH), t2 = performance.now();
    const lights = oc ? { faces: oc.faces, spots: oc.spots, beams: oc.beams, glow: oc.glow } : buildLights(V.towers, city.zb, city.BW, city.BH), t3 = performance.now(); lights.Z = city.Z; city.zb = null;
    if (oc) V.glowEnc = oc.glowEnc;
    if (opt.grab) V.cityData = { w: V.cityW, A: city.A, B: city.B, Z: city.Z, faces: lights.faces, spots: lights.spots, beams: lights.beams, glow: lights.glow, glowEnc: V.glowEnc };
    const mkT = (w, h, data) => { const t = gfx.texture({ w, h, format: 'rgba8', filter: 'linear', wrap: 'clamp', mips: true, data }); gfx.genMips(t); return t; };
    V.farA = mkT(V.farW, V.farH, far.A); V.farB = mkT(V.farW, V.farH, far.B);
    V.cityA = mkT(V.cityW, V.cityH, city.A); V.cityB = mkT(V.cityW, V.cityH, city.B);
    V.shTex = gfx.texture({ w: V.shRes, h: V.shRes, format: 'r8', filter: 'linear', wrap: 'clamp' });
    V.shadowElev = -9; V.updateShadow(true);
    initLights(lights);
    if (opt.keep) V.dbg = { far, city };
    if (opt.grab) V.farData = far;          // (for the next start to read back: 00e_cache.js)
    V.stats.ms = [Math.round(t1 - t0), Math.round(t2 - t1), Math.round(performance.now() - t2)]; V.stats.lightMs = Math.round(t3 - t2); V.stats.nLight = [V.nFace, V.nSpot, V.nBeam];
    V.ready = true;
  };
  // the shadows lengthen as the sun sinks: redo them when it has moved (in the background, a millisecond or so a frame; `now`: all at once)
  let job = null;
  V.updateShadow = function (now) {
    if (!job) {
      // nothing to draw them with while the sun is behind the range or below the horizon
      if (Math.abs(V.shadowElev - Sky.elev) < 0.006 || (!now && Sky.elev < 0.015)) return;
      V.shadowElev = Sky.elev; job = cityShadowJob(Math.tan(Math.max(Sky.elev, 0.02)), Sky.az);
    }
    if (cityShadowStep(job, V.towers, now ? 1e9 : 1.2)) { gfx.updateTexture(V.shTex, 0, 0, V.shRes, V.shRes, job.S); job = null; }
  };
  V.farH_ = farH;
  Par.jobs.vistaFar = a => buildFar(a.w, V.farH); V.farBuild = w => buildFar(w, V.farH);
  // (dev, ?cachecheck: the city and its lights made again and compared number for number with what the cache gave)
  V.cityCheck = function (c) {
    const same = (a, b) => { let bad = 0; if (!a || !b || a.length !== b.length) return -1; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) bad++; return bad; };
    const keep = V.glowEnc, city = renderCity(buildCityList(), V.cityW, V.cityH), L = buildLights(V.towers, city.zb, city.BW, city.BH), r = { A: same(city.A, c.A), B: same(city.B, c.B), Z: same(city.Z, c.Z), faces: same(L.faces, c.faces), spots: same(L.spots, c.spots), beams: same(L.beams, c.beams), glow: same(L.glow, c.glow), enc: V.glowEnc === c.glowEnc };
    V.glowEnc = keep; return r;
  };
  V.cores = CORES; V.famc = FAMC;
  return V;
})();

// ---- lighting the vista (runs in the sky shader)
function vistaSSL() {
  const V = Vista, f = x => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(7)));
  const a = V.cityAz, D = V.cityDist, C = [D * Math.sin(a), -D * Math.cos(a)], Uu = [Math.cos(a), Math.sin(a)], Ww = [Math.sin(a), -Math.cos(a)];
  return cityAirSSL() + `
fn vistaHaze(d: vec3f) -> vec3f { let h: vec3f = skyLut(normalize(vec3f(d.x, 0.022, d.z))); return mix(mix(h, vec3f(luma(h)) * vec3f(1.03, 1.0, 1.0), 0.55 * U.sunDir.w), M.wa.rgb * 1.3, M.wa.w); }   // (under heavy snow's overcast the air is its grey: 05b_weather.js)
// mip level for a panorama whose texels subtend 'texel' radians
fn vistaLod(texel: f32) -> f32 { return max(log2(2.0 * U.camRight.w * U.res.w / texel), 0.0); }
fn farRanges(d: vec3f, colIn: vec3f) -> vec3f {
  let az: f32 = atan2(d.x, -d.z); let el: f32 = atan2(d.y, length(d.xz));
  let uv: vec2f = vec2f(az / ${f(2 * V.AZ)} + 0.5, (${f(V.EL1)} - el) / ${f(V.EL1 - V.EL0)});
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) { return colIn; }
  let lod: f32 = vistaLod(${f(2 * V.AZ / V.farW)});
  let A: vec4f = texLod(tFarA, uv, lod);
  if (A.a < 0.004) { return colIn; }
  let B: vec4f = texLod(tFarB, uv, lod);
  let N: vec3f = normalize(A.xyz * 2.0 - 1.0);
  let dist: f32 = 20000.0 * exp(B.x * 2.302585);
  let L: vec3f = U.sunDir.xyz; let tanE: f32 = L.y / max(length(L.xz), 1e-3);
  let sh: f32 = smoothstep(-0.03, 0.05, tanE - (B.y * 1.1 - 0.1));
  let ndl: f32 = dot(N, L);
  let amb: vec3f = U.ambSky.rgb * (1.2 + 0.8 * N.y) + U.ambGnd.rgb * (0.45 - 0.35 * N.y);
  // (the summits stand higher than the eye, and keep the sun after it has left the mountain: M.fr)
  let snow: vec3f = vec3f(0.92, 0.95, 0.98) * (M.fr.rgb * saturate((ndl + 0.18) / 1.18) * sh + amb);
  let rock: vec3f = vec3f(0.17, 0.155, 0.15) * (M.fr.rgb * saturate(ndl) * sh + amb);
  var c: vec3f = mix(snow, rock, B.z);
  // air: the further range is the paler one
  c = mix(vistaHaze(d), c, exp(-dist / 65000.0));
  // feet in the cloud deck
  let hc: f32 = dist * tan(el) + ${f(V.deck)};
  let a: f32 = A.a * smoothstep(-120.0, 260.0, hc) * smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x);
  return mix(colIn, c, a);
}
// the light the town throws up at a point pp of the deck (m from the eye, horizontal), in its colours: sodium streets far and wide, and
// every quarter's own cast (scene units at night; without the single towers' pools). It lights the towers' walls from below (cityLayer);
// it is also there for a cloud shader that would rather light the deck itself where its own surface lies. The delivered cloud sea does
// not call it: there the coloured light is laid over the deck by Vista.drawLights (Vista.lit.deck = 0 turns that off)
fn cityGlow3(pp: vec2f) -> vec3f {
  let rel: vec2f = pp - vec2f(${f(C[0])}, ${f(C[1])});
  let u: f32 = dot(rel, vec2f(${f(Uu[0])}, ${f(Uu[1])})); let w: f32 = dot(rel, vec2f(${f(Ww[0])}, ${f(Ww[1])}));
  var c: vec3f = vec3f(1.0, 0.54, 0.19) * (${f(V.lit.town / 1.2)} * exp(-sq((u + 200.0) / 3600.0) - sq(w / 3000.0)));
${V.cores.map((q, i) => `  c += vec3f(${V.famc[i].map(f).join(', ')}) * (${f(V.lit.core / 1.2 * (0.3 + q[3] / 1000))} * exp(-(sq(u - ${f(q[0])}) + sq(w - ${f(q[1])})) / ${f(q[2] * q[2] * 1.5)}));`).join('\n')}
  return c;
}
fn cityLayer(d: vec3f, colIn: vec3f) -> vec3f {
  let az: f32 = atan2(d.x, -d.z) - ${f(V.cityAz)}; let el: f32 = atan2(d.y, length(d.xz));
  let uv: vec2f = vec2f(az / ${f(2 * V.cityHalf)} + 0.5, (${f(V.cEL1)} - el) / ${f(V.cEL1 - V.cEL0)});
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) { return colIn; }
  let lod: f32 = vistaLod(${f(2 * V.cityHalf / V.cityW)});
  let A: vec4f = texLod(tCityA, uv, lod);
  if (A.a < 0.004) { return colIn; }
  let B: vec4f = texLod(tCityB, uv, lod);
  let n2: vec2f = A.xy * 2.0 - 1.0;
  let N: vec3f = normalize(vec3f(n2.x, 1e-3, n2.y));
  let tone: f32 = A.z; let glass: f32 = B.y; let dist: f32 = ${f(V.cityNear)} + B.z * ${f(V.citySpan)}; let h: f32 = B.w * ${f(V.cityTop + 300)} - 300.0;
  let L: vec3f = U.sunDir.xyz;
  let ndl: f32 = saturate(dot(N, L));
  // the bright deck below throws a great deal of light back up the walls
  let amb: vec3f = U.ambSky.rgb * 0.85 + U.ambGnd.rgb * 0.5;
  let alb: vec3f = mix(vec3f(0.030, 0.040, 0.055), vec3f(0.60, 0.57, 0.52), tone);
  var c: vec3f = alb * (U.sunCol.rgb * ndl + amb);
  // glass: a mirror for the sky; where a wall lines up between the sun and the eye its panes flash
  let R: vec3f = reflect(d, N);
  let F: f32 = (0.045 + 0.955 * pow(1.0 - saturate(dot(-d, N)), 5.0)) * glass;
  var env: vec3f = skyLut(vec3f(R.x, abs(R.y) + 0.04, R.z));
  let rsh: f32 = saturate(dot(normalize(R.xz), normalize(L.xz)));
  // (no two panes of a curtain wall lie quite in one plane: the flash is a scatter of them, and it climbs the wall as the light shifts)
  let pane: f32 = smoothstep(0.50, 0.82, texLod(tDetail, uv * vec2f(${f(V.cityW / 1792)}, ${f(V.cityH / 1792)}) + vec2f(0.37, -U.camPos.w * 0.0011), max(lod - 1.8, 0.0)).a);
  env += U.sunCol.rgb * (pow(rsh, 160.0) * 9.0 * exp(-sq((L.y - R.y) / 0.36)) * mix(1.0, 0.25 + 2.3 * pane, saturate(2.8 - lod)));
  c = c * (1.0 - F) + env * F;
  // after dark: the light of the streets and of the lit cloud coming up the walls, in the colour of the quarter the tower stands in
  // (the lights themselves are drawn over this by Vista.drawLights)
  c += alb * (vec3f(0.30, 0.17, 0.12) + cityGlow3(normalize(d.xz) * dist) * 2.0) * (U.skyP.z * exp(-max(h, 0.0) / 300.0));
  // a great deal of air lies between here and there: the towers stand in it as blue shapes, the farther ones paler
  c = mix(vistaHaze(d) * vec3f(0.80, 0.93, 1.10), c, exp(-dist / 15000.0));
  // the deck swallows the lower floors: its billows stand at different heights, and wisps hang round the floors just above them
  let feet: vec2f = cityFeet(d, dist, h);
  c = mix(c, colIn * 1.04, feet.y);
  let a: f32 = A.a * feet.x * smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x);
  return mix(colIn, c, a);
}
// the sodium light of the streets coming up through the deck at pp (the cloud sea adds it in one fixed orange; the coloured light of the
// towers is laid over it by Vista.drawLights)
fn cityGlow(pp: vec2f) -> f32 { let r: f32 = length(pp - vec2f(${f(C[0])}, ${f(C[1])})); return 0.26 * exp(-r / 1300.0) + 0.07 * exp(-r / 4200.0); }
// shade of the towers on the deck at a point pp (m from the eye, horizontal)
fn cityShadow(pp: vec2f) -> f32 {
  let rel: vec2f = pp - vec2f(${f(C[0])}, ${f(C[1])});
  let uv: vec2f = vec2f((dot(rel, vec2f(${f(Uu[0])}, ${f(Uu[1])})) - ${f(V.shU0)}) / ${f(V.shU1 - V.shU0)}, (dot(rel, vec2f(${f(Ww[0])}, ${f(Ww[1])})) - ${f(V.shW0)}) / ${f(V.shW1 - V.shW0)});
  return texLod(tCitySh, uv, 0.0).x;
}
`;
}

// ---- the cloud deck as the city stands in it (shared by the sky shader and by the city's lights; needs tDetail)
function cityAirSSL() {
  return `
// the cloud deck's billows: rounded tops with creases between them (0 in a crease, about 1 on a top)
fn deckA(p: vec2f, lod: f32) -> f32 { let q: f32 = texLod(tDetail, p / 17000.0, lod).z * 2.0 - 1.0; return sqrt(q * q + 0.003) * 1.9; }
// the deck swallows the lower floors: its billows stand at different heights, and wisps hang round the floors just above them. For a point
// h metres above the deck's floor and dist metres off along d: x = how much of it shows, y = how much of what shows the wisps veil
fn cityFeet(d: vec3f, dist: f32, h: f32) -> vec2f {
  let pp: vec2f = normalize(d.xz) * dist + vec2f(U.skyP.y * 9000.0, U.skyP.y * 2500.0);
  let wl: f32 = texLod(tDetail, pp / 900.0 + vec2f(0.11, 0.83) + h * 0.0011, 0.0).z;
  let top: f32 = min(deckA(pp, log2(max(dist * 2.0 * U.camRight.w * U.res.w / sqrt(max(-d.y, 0.02)) / 33.0, 1.0))), 1.0) * 260.0 + 40.0 * (wl - 0.42);
  return vec2f(smoothstep(-10.0, 110.0, h - top), (1.0 - smoothstep(0.0, 130.0, h - top)) * smoothstep(0.40, 0.70, wl) * 0.65);
}
`;
}

// ---- the city's lights: four small programs drawn over the sky by Vista.drawLights. M.p = (height of the sun, how much it is day 0..1,
// a trim for the twilight exposure (in the glow program: its level), moon up (in the glow program: the time)). Every one of them dims
// its light by the air between (exp(-dist / 15000), as the towers' bodies are hazed), hides it behind nearer towers (tCityZ) and sinks
// it in the deck (cityFeet).
function cityLightSSL() {
  const V = Vista, f = x => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(7)));
  const a = V.cityAz, D = V.cityDist, C = [D * Math.sin(a), -D * Math.cos(a)], Uu = [Math.cos(a), Math.sin(a)], Ww = [Math.sin(a), -Math.cos(a)];
  const HP = V.deck - 190, GAZ = 0.60, GEL0 = -0.20, GEL1 = 0.13;       // HP: how far below the eye the billows' tops lie, on the whole; the patch of sky the glow is drawn in
  const core = i => { const c = Vista.cores[i]; return `vec2f(${f(C[0] + c[0] * Uu[0] + c[1] * Ww[0])}, ${f(C[1] + c[0] * Uu[1] + c[1] * Ww[1])}), ${f(c[2] * 0.95)}`; };
  const lit = `
const C_DECK: f32 = ${f(V.deck)};
fn cproj(p: vec3f) -> vec4f { return U.viewProj * vec4f(U.camPos.xyz + p, 1.0); }
// the direction a pixel looks in
fn pixDir(px: vec2f) -> vec3f { let n: vec2f = vec2f(px.x * U.res.z * 2.0 - 1.0, 1.0 - px.y * U.res.w * 2.0); return normalize(screenRay(n)); }
// where a direction falls in the city's panorama
fn cityUV(d: vec3f) -> vec2f { return vec2f((atan2(d.x, -d.z) - ${f(V.cityAz)}) / ${f(2 * V.cityHalf)} + 0.5, (${f(V.cEL1)} - atan2(d.y, length(d.xz))) / ${f(V.cEL1 - V.cEL0)}); }
// how far off the nearest tower stands there (open sky counts as beyond them all)
fn cityZ(uv: vec2f) -> f32 { let z: vec4f = texLod(tCityZ, uv, 0.0); return ${f(V.cityNear)} + (floor(z.x * 255.0 + 0.5) * 256.0 + floor(z.y * 255.0 + 0.5)) * ${f(V.citySpan / 65535)}; }
// how much of the pixel round uv is clear of towers nearer than r
fn cityOpen(uv: vec2f, du: vec2f, dv: vec2f, r: f32) -> f32 {
  return 0.25 * (step(r, cityZ(uv + du * 0.125 + dv * 0.375)) + step(r, cityZ(uv - du * 0.375 + dv * 0.125)) + step(r, cityZ(uv + du * 0.375 - dv * 0.125)) + step(r, cityZ(uv - du * 0.125 - dv * 0.375)));
}
// the colour of a room's lamps: sodium and tungsten at one end, daylight tubes at the other
fn winTint(k: f32) -> vec3f { return mix(mix(vec3f(1.0, 0.48, 0.14), vec3f(1.0, 0.64, 0.28), saturate(k * 3.0)), mix(vec3f(1.0, 0.80, 0.50), vec3f(0.88, 0.93, 1.0), saturate(k * 3.0 - 2.0)), saturate(k * 3.0 - 1.0)); }
// the lit windows of a wall, from so far that only blocks of them can be told apart: one number a block (c metres of floors, 2c of bays),
// blended to its neighbours; a block is lit when its number stands above th
fn winCells(q: vec2f, c: f32, sd: f32, th: f32, rw: f32, tm: f32, warm: f32, acc: vec3f) -> vec3f {
  let g: vec2f = q / vec2f(c * 2.0, c) + vec2f(sd * 311.7, sd * 173.3);
  let n: f32 = texLod(tDetail, (g + 0.5) / 512.0, 0.0).a;
  let m: f32 = texLod(tDetail, (g + vec2f(189.5, 97.5)) / 512.0, 0.0).a;
  // whole floors are lit, or dark, from end to end
  let fl: f32 = texLod(tDetail, vec2f(sd * 97.0 + 331.5, g.y + 61.5) / 512.0, 0.0).a;
  // every block has a slow clock of its own that carries it toward the line and back; one in ten goes right over it, on and off, and
  // now and then a whole floor does (lights going on and off somewhere at any moment, never many at once)
  let fr: f32 = fract(fl * 57.31);
  let k: f32 = mix(n, fl, 0.6) + (0.045 + 0.40 * smoothstep(0.86, 0.92, m)) * clamp(2.5 * sin(tm * (0.14 + 0.5 * n) + m * 41.0 + n * 9.0), -1.0, 1.0)
    + 0.16 * smoothstep(0.80, 0.90, fr) * clamp(2.5 * sin(tm * (0.10 + 0.25 * fract(fl * 13.7)) + fl * 50.0), -1.0, 1.0);
  let lt: f32 = smoothstep(th - rw, th + rw, k);
  var c3: vec3f = winTint(saturate(warm + (fl - 0.5) * 0.7 + (m - 0.5) * 0.35));
  c3 = mix(c3, acc * 1.4, smoothstep(0.975, 0.99, m) * 0.6);       // (a coloured room is a rare thing)
  // (and the eleven kilometres of air between make every one of them tremble a little)
  return c3 * (lt * (0.45 + 1.1 * m * m) * (1.0 + 1.3 * smoothstep(0.86, 1.0, n)) * (0.91 + 0.09 * sin(tm * (4.0 + 6.0 * m) + n * 61.0)));
}
`;
  const faceVS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let cx: f32 = f32(a.vid & 1u); let cy: f32 = f32((a.vid >> 1u) & 1u);
  let A: vec2f = a.i0.xy; let B: vec2f = a.i0.zw; let y0: f32 = a.i1.x - C_DECK; let y1: f32 = a.i1.y - C_DECK;
  let P: vec3f = vec3f(mix(A.x, B.x, cx), mix(y0, y1, cy), mix(A.y, B.y, cx));
  var c: vec4f = cproj(P); var s: f32 = cx; var t: f32 = cy;
  // every edge is pushed out by three quarters of a pixel: the fragment stage then weighs each pixel by how much of it the wall really
  // covers, so a wall a pixel and a half wide neither crawls nor drops out as the camera turns
  let ca: vec4f = cproj(vec3f(A.x, P.y, A.y)); let cb: vec4f = cproj(vec3f(B.x, P.y, B.y));
  let cl: vec4f = cproj(vec3f(P.x, y0, P.z)); let ch: vec4f = cproj(vec3f(P.x, y1, P.z));
  if (min(min(ca.w, cb.w), min(cl.w, ch.w)) > 1.0) {
    let hr: vec2f = U.res.xy * 0.5;
    let ex: vec2f = (cb.xy / cb.w - ca.xy / ca.w) * hr; let ey: vec2f = (ch.xy / ch.w - cl.xy / cl.w) * hr;
    let lx: f32 = max(length(ex), 1e-3); let ly: f32 = max(length(ey), 1e-3);
    let ox: f32 = (cx * 2.0 - 1.0) * 0.75; let oy: f32 = (cy * 2.0 - 1.0) * 0.75;
    c = vec4f(c.xy + (ex * (ox / lx) + ey * (oy / ly)) / hr * c.w, c.zw);
    s = cx + ox / lx; t = cy + oy / ly;
  }
  v.clip = vec4f(c.xy, c.w * 0.999999, c.w);
  v.st = vec4f(s, t, a.i1.z, a.i1.w); v.ab = a.i0; v.py = vec4f(a.i2.x, a.i2.y, a.i1.x, a.i1.y);
  v.ca = a.i3; v.cb = a.i4; v.mi = vec4f(a.i2.z, a.i2.w, a.i5.x, a.i5.y); v.ex = vec4f(a.i5.z, 0.0, 0.0, 0.0);
  return v;
}`;
  const faceFS = `
fn frag(v: VOut) -> FOut { var o: FOut; o.color = vec4f(0.0);
  let s: f32 = v.st.x; let t: f32 = v.st.y; let kind: f32 = v.st.z; let seed: f32 = v.st.w;
  let fs: f32 = abs(dpdx(s)) + abs(dpdy(s)); let ft: f32 = abs(dpdx(t)) + abs(dpdy(t));
  let d: vec3f = pixDir(v.clip.xy); let uv: vec2f = cityUV(d); let du: vec2f = dpdx(uv); let dv: vec2f = dpdy(uv);
  // how much of this pixel the wall covers
  let cov: f32 = saturate((min(s + 0.5 * fs, 1.0) - max(s - 0.5 * fs, 0.0)) / max(fs, 1e-6)) * saturate((min(t + 0.5 * ft, 1.0) - max(t - 0.5 * ft, 0.0)) / max(ft, 1e-6));
  // its own hour: 0 until the sun is low enough for it, then up to 1
  let lvl: f32 = smoothstep(v.mi.x + v.mi.y, v.mi.x - v.mi.y, M.p.x);
  if (cov * lvl < 0.002) { return o; }
  let sc: f32 = saturate(s); let tc: f32 = saturate(t);
  let R: f32 = v.ex.x; let sr: f32 = clamp(sc * 2.0 - 1.0, -0.999, 0.999); let cr: f32 = sqrt(1.0 - sr * sr);
  let ra: f32 = length(v.ab.xy); let rb: f32 = length(v.ab.zw);
  let dist: f32 = length(mix(v.ab.xy, v.ab.zw, sc)) - R * cr;
  let y: f32 = mix(v.py.z, v.py.w, tc);
  let feet: vec2f = cityFeet(d, dist, y);
  // (a wall seen nearly edge on runs away from the eye quickly: allow for that when asking whether something nearer hides it)
  let lw: f32 = length(v.ab.zw - v.ab.xy); let slant: f32 = abs(rb - ra) / max(sqrt(max(lw * lw - sq(rb - ra), 0.0)), 1.0);
  let air: f32 = cov * feet.x * (1.0 - feet.y) * exp(-dist / 15000.0) * cityOpen(uv, du, dv, dist - min(22.0 + 6.0 * slant, 70.0) - R);
  if (air < 0.0015) { return o; }
  // where on the wall: metres round the tower and metres up, and what one pixel spans there
  var p: f32 = mix(v.py.x, v.py.y, sc); var fp: f32 = fs * abs(v.py.y - v.py.x);
  if (R > 0.0) { p = R * asin(sr); fp = fs * 2.0 * R / max(cr, 0.25); }
  let fy: f32 = ft * (v.py.w - v.py.z);
  let tm: f32 = U.camPos.w; let dk: f32 = M.p.y;
  var col: vec3f = vec3f(0.0);
  // a lit wall too narrow to fill its pixels still dazzles: it is shown a little brighter than its share of them
  let nb: f32 = pow(clamp(0.25 / max(fs, 1e-4), 0.25, 1.0), -0.35);
  if (kind < 0.5) {
    // windows. Blocks of them, at the size a pixel can show (two sizes blended, so nothing jumps as the lens zooms); the share that is lit
    // grows as the sun sinks, each block with its own moment
    let f: f32 = max(max(fp, fy), 0.5);
    let L: f32 = max(log2(f * 0.4), 0.0); let l0: f32 = floor(L); let c0: f32 = 4.0 * exp2(l0);
    let sh: f32 = v.mi.z * pow(lvl, 1.3); let th: f32 = 1.0 - sqrt(0.5 * sh);
    let q: vec2f = vec2f(p, y);
    // (the bigger the block, the more windows in it, and the less it is simply lit or dark)
    let rw: f32 = 0.09 + 0.05 * L;
    // (and under the blocks that can be told apart, the even glow of all the windows that cannot)
    col = (mix(winCells(q, c0, seed, th, rw, tm, v.mi.w, v.cb.rgb), winCells(q, c0 * 2.0, seed + 0.37, th, rw, tm, v.mi.w, v.cb.rgb), L - l0) + winTint(v.mi.w) * (0.24 * sh))
      * v.ca.rgb * (v.ca.w * M.q.x * nb * (1.0 + (M.r.y - 1.0) * dk) * smoothstep(0.0, 0.06, lvl));
  } else if (kind < 1.5) {
    // a wall that is a screen: bands of colour climbing it, two colours chasing each other up it, or a bar of light sweeping it
    let lam: f32 = v.mi.z; let spd: f32 = v.mi.w; let pat: f32 = v.cb.w;
    let aa: f32 = saturate(lam / max(fy, 0.01) * 0.5 - 0.7);                 // bands finer than a pixel or two run together
    var b: f32 = 0.5 + 0.5 * sin(6.2832 * ((y - tm * spd) / lam + seed * 7.0)); b = mix(0.5, b * b * (3.0 - 2.0 * b), aa);
    let drift: f32 = 0.5 + 0.5 * sin(tm * 0.19 + seed * 31.0 + y * 0.0035);
    if (pat < 0.5) { col = mix(v.ca.rgb, v.cb.rgb, smoothstep(0.2, 0.8, drift)) * (0.22 + 1.0 * b); }
    else if (pat < 1.5) { col = mix(v.ca.rgb, v.cb.rgb, b) * (0.8 + 0.2 * sin(tm * 0.45 + seed * 11.0)); }
    else if (pat < 2.5) { let sw: f32 = fract(tm * spd / 420.0 + seed * 3.0) * 1.5 - 0.25; col = v.ca.rgb * 0.45 + v.cb.rgb * (1.5 * exp(-sq((tc - sw) / max(0.09, 1.5 * ft)))); }
    else {
      // a picture, too far off to make out: patches of its two colours that drift up the wall and change
      let nz: f32 = texLod(tDetail, vec2f(p * 0.0021 + seed * 3.7, y * 0.0021 - tm * 0.012), 0.0).z;
      col = mix(v.ca.rgb, v.cb.rgb, smoothstep(0.44, 0.56, nz + 0.10 * sin(tm * 0.6 + seed * 9.0))) * (0.55 + 0.75 * smoothstep(0.30, 0.70, fract(nz * 3.0 + tm * 0.05)));
    }
    col *= v.ca.w * M.q.y * nb * (1.0 + (M.r.z - 1.0) * dk) * lvl;
  } else if (kind < 2.5) {
    // a strip of LEDs up a corner, round the top of a tier or up a mast: far thinner than a pixel, so it is shown as bright as its
    // glare makes it (a little more than its share of the pixel). It breathes, or a pulse runs along it
    let upr: bool = (v.py.w - v.py.z) > abs(v.py.y - v.py.x);
    let al: f32 = select(sc, tc, upr); let fa: f32 = select(fs, ft, upr);
    let wpx: f32 = 1.0 / max(select(ft, fs, upr), 1e-4);
    var b: f32 = 0.8 + 0.2 * sin(tm * (0.5 + seed) + seed * 50.0);
    if (v.cb.w > 0.5) { let ph: f32 = fract(tm * v.mi.w + seed * 5.0) * 1.5 - 0.25; b = 0.5 + 2.4 * exp(-sq((al - ph) / max(0.08, 1.5 * fa))); }
    col = v.ca.rgb * (b * pow(min(wpx, 1.0), -0.45) * v.ca.w * M.q.z * (1.0 + (M.r.z - 1.0) * dk) * lvl);
  } else if (kind < 3.5) {
    // a floodlit crown or setback: brightest at its foot, where the lamps stand
    col = mix(v.ca.rgb, v.cb.rgb, 0.5 + 0.5 * sin(tm * v.mi.w + seed * 20.0)) * (exp(-tc * v.mi.z) * v.ca.w * M.q.w * (1.0 + (M.r.w - 1.0) * dk) * lvl);
  } else {
    // a sign: steady, changing between two colours, or blinking
    let wpx: f32 = min(1.0 / max(fs, 1e-4), 1.0) * min(1.0 / max(ft, 1e-4), 1.0);
    var c3: vec3f = v.ca.rgb; let w2: f32 = sin(tm * v.mi.w + seed * 40.0);
    if (v.cb.w > 1.5) { c3 *= 0.2 + 0.8 * smoothstep(-0.3, 0.1, w2); } else if (v.cb.w > 0.5) { c3 = mix(v.ca.rgb, v.cb.rgb, smoothstep(-0.2, 0.2, w2)); }
    col = c3 * (pow(wpx, -0.42) * v.ca.w * M.r.x * (1.0 + (M.r.z - 1.0) * dk) * lvl);
  }
  // (the night's colour setting calms the coloured light: screens, lines and signs. Windows and floodlit stone keep their warmth)
  let sx: f32 = select(M.s.x, mix(1.0, M.s.x, 0.25), kind < 0.5 || (kind > 2.5 && kind < 3.5));
  o.color = vec4f(mix(vec3f(luma(col)), col, sx) * (air * M.p.z), 0.0); return o; }`;
  const spotVS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let P: vec3f = vec3f(a.i0.x, a.i0.y - C_DECK, a.i0.z);
  let c: vec4f = cproj(P); let d: vec3f = normalize(P); let dist: f32 = length(P.xz);
  let tm: f32 = U.camPos.w; let e: f32 = M.p.x; let kind: f32 = a.i2.x; let cyc: f32 = fract(tm / a.i2.y + a.i2.z);
  var b: f32 = 1.0; var tint: vec3f = a.i1.rgb; var gain: f32 = a.i1.w * (1.0 + (a.i3.x - 1.0) * M.p.y);
  if (kind < 0.5) { b = smoothstep(0.0, 0.12, cyc) * smoothstep(0.62, 0.42, cyc); }                    // an obstruction lamp: it swells and dies like a filament
  else if (kind < 1.5) { b = exp(-sq((cyc - 0.04) / 0.02)) + exp(-sq((cyc - 0.16) / 0.02)); }           // a strobe: two flashes, then nothing
  else if (kind < 2.5) { b = 0.85 + 0.15 * sin(tm * 2.3 + a.i2.z * 40.0); }                            // a lamp that stays on
  else {                                                                                               // the sun in a pane of glass
    b = exp(-sq((e + 0.012 * sin(tm * 0.4 + a.i2.z * 6.2832) - a.i3.y) / a.i3.z)) * (0.55 + 0.45 * sin(tm * (3.0 + 4.0 * a.i2.z) + a.i2.z * 60.0) * sin(tm * 1.7 + a.i2.z * 23.0));
    tint = U.sunCol.rgb * (1.0 - M.p.w); gain = a.i1.w * M.q.y;
  }
  // the air between trembles
  b *= 1.0 + 0.10 * sin(tm * (5.0 + 3.0 * a.i2.z) + a.i2.z * 90.0) * sin(tm * 3.1 + a.i2.z * 33.0);
  let feet: vec2f = cityFeet(d, dist, a.i0.y);
  let amt: f32 = b * gain * smoothstep(a.i2.w + 0.004, a.i2.w - 0.004, e) * feet.x * (1.0 - feet.y) * exp(-dist / 15000.0) * step(dist - 45.0, cityZ(cityUV(d))) * M.q.x * M.p.z;
  // a point of light is as wide as the air and the lens make it: a core a little over a pixel across (never under 0.6 mrad), and a faint halo
  let sg: f32 = max(0.62, 0.0006 / (2.0 * U.camRight.w * U.res.w));
  if (amt < 0.0005 || c.w < 1.0) { v.clip = vec4f(2.0, 2.0, 2.0, 1.0); }
  else { v.clip = vec4f(c.xy + corner * (sg * 6.0 * 2.0) * U.res.zw * c.w, c.w * 0.999999, c.w); }
  v.uv = corner * 6.0; v.col = vec4f(tint * (amt * pow(0.62 / sg, 1.2)), 0.0);
  return v;
}`;
  const spotFS = `
fn frag(v: VOut) -> FOut { var o: FOut; let r2: f32 = dot(v.uv, v.uv); o.color = vec4f(mix(v.col.rgb, vec3f(luma(v.col.rgb)), M.q.z) * (exp(-r2) + 0.06 * exp(-r2 / 9.0)), 0.0); return o; }`;
  const beamVS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let cx: f32 = f32(a.vid & 1u); let side: f32 = f32((a.vid >> 1u) & 1u) * 2.0 - 1.0;
  // it swings from side to side and nods, slowly
  let tm: f32 = U.camPos.w; let w: f32 = 6.2832 / a.i3.x;
  let az: f32 = a.i2.x + a.i2.z * sin(tm * w + a.i3.y); let tl: f32 = a.i2.y + a.i2.w * sin(tm * w * 0.73 + a.i3.y * 1.7 + 1.0);
  let D: vec3f = vec3f(sin(tl) * sin(az), cos(tl), -sin(tl) * cos(az));
  let O: vec3f = vec3f(a.i0.x, a.i0.y - C_DECK, a.i0.z); let Lb: f32 = a.i0.w;
  let P: vec3f = O + D * (Lb * cx);
  let c: vec4f = cproj(P); let co: vec4f = cproj(O); let ce: vec4f = cproj(O + D * Lb);
  let hr: vec2f = U.res.xy * 0.5;
  var n: vec2f = vec2f(1.0, 0.0);
  if (min(co.w, ce.w) > 1.0) { let dir: vec2f = (ce.xy / ce.w - co.xy / co.w) * hr; n = vec2f(-dir.y, dir.x) / max(length(dir), 1e-3); }
  // it widens as it goes; where it is thinner than a pixel it is drawn a pixel wide and fainter
  let rpx: f32 = (a.i3.w + Lb * cx * 0.016) / (length(P) * 2.0 * U.camRight.w * U.res.w); let sg: f32 = max(rpx, 0.9);
  let hw: f32 = sg * 2.2 + 0.75;
  v.clip = vec4f(c.xy + n * (side * hw) / hr * c.w, c.w * 0.999999, c.w);
  // seen from near its own line a beam is a far longer path of lit air, and the air throws most of its light forward
  let cs: f32 = dot(D, -normalize(O)); let sn: f32 = sqrt(max(1.0 - cs * cs, 0.0));
  let ph: f32 = (0.7 + 1.6 * pow(saturate(cs), 3.0)) / max(sn, 0.35);
  v.ab = vec4f(cx, side * hw / sg, pow(min(rpx / 0.9, 1.0), 0.7), a.i3.w);
  v.pos = vec4f(P, Lb);
  // (the night's colour: the lights less saturated; every other searchlight fades out with M.q.z)
  let keep: f32 = select(M.q.z, 1.0, (a.iid & 1u) == 0u);
  v.col = vec4f(mix(vec3f(luma(a.i1.rgb)), a.i1.rgb, M.q.y) * (keep * a.i1.w * ph * smoothstep(a.i3.z + 0.012, a.i3.z - 0.012, M.p.x) * M.q.x * M.p.z), 0.0);
  return v;
}`;
  const beamFS = `
fn frag(v: VOut) -> FOut { var o: FOut; o.color = vec4f(0.0);
  let s: f32 = v.ab.x; let x: f32 = v.ab.y; let P: vec3f = v.pos.xyz; let dist: f32 = length(P.xz); let along: f32 = s * v.pos.w; let h: f32 = P.y + C_DECK;
  // the beam thins as it spreads, and is used up by the air it lights (of which there is less the higher it climbs)
  var g: f32 = exp(-x * x) * v.ab.z * (v.ab.w / (v.ab.w + along * 0.016)) * exp(-along / 1500.0) * exp(-max(h, 0.0) / 2400.0) * smoothstep(0.0, 0.02, s) * smoothstep(1.0, 0.7, s);
  if (g * max(v.col.r, max(v.col.g, v.col.b)) < 0.0005) { return o; }
  let d: vec3f = pixDir(v.clip.xy); let uv: vec2f = cityUV(d);
  g *= cityFeet(d, dist, h).x * exp(-dist / 15000.0) * 0.5 * (step(dist - 30.0, cityZ(uv)) + step(dist - 30.0, cityZ(uv + vec2f(0.0007, 0.0005))));
  o.color = vec4f(v.col.rgb * g, 0.0); return o; }`;
  const glowVS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let az: f32 = ${f(V.cityAz)} + mix(${f(-GAZ)}, ${f(GAZ)}, f32(a.vid & 1u)); let el: f32 = mix(${f(GEL0)}, ${f(GEL1)}, f32((a.vid >> 1u) & 1u));
  let c: vec4f = cproj(vec3f(sin(az) * cos(el), sin(el), -cos(az) * cos(el)) * 9000.0);
  v.clip = vec4f(c.xy, c.w * 0.999999, c.w); v.dir = vec3f(az, el, 0.0);
  return v;
}`;
  const glowFS = `
fn erfa(x: f32) -> f32 { return sign(x) * sqrt(1.0 - exp(-1.2732 * x * x)); }
// the lit haze over one quarter of the city: its glow gathered along the line of sight, as far as the deck or the tower that ends it
fn domeBlob(dh: vec2f, sl: f32, c: vec2f, sg: f32, tb: f32, tw: f32, a: f32) -> f32 {
  let t0: f32 = dot(c, dh); let b2: f32 = max(dot(c, c) - t0 * t0, 0.0);
  let h0: f32 = max(t0 * sl + ${f(HP)}, 0.0);
  let k: f32 = exp(-b2 / (sg * sg)) * (exp(-h0 / 260.0) + 0.10 * exp(-h0 / 900.0));
  if (k < 0.003 || t0 < 0.0) { return 0.0; }
  return k * 0.5 * (sg / 1000.0) * mix(erfa((tb - t0) / sg) + 1.0, erfa((min(tb, tw) - t0) / sg) + 1.0, a);
}
fn frag(v: VOut) -> FOut { var o: FOut; o.color = vec4f(0.0);
  let d: vec3f = pixDir(v.clip.xy);
  let az: f32 = atan2(d.x, -d.z) - ${f(V.cityAz)}; let el: f32 = atan2(d.y, length(d.xz));
  let edge: f32 = smoothstep(${f(GAZ)}, ${f(GAZ - 0.06)}, abs(az)) * smoothstep(${f(GEL1)}, ${f(GEL1 - 0.05)}, el) * smoothstep(${f(GEL0)}, ${f(GEL0 + 0.02)}, el);
  if (edge <= 0.0) { return o; }
  let pxa: f32 = 2.0 * U.camRight.w * U.res.w;
  // the towers that stand in this direction, and how far off: they hide whatever glows behind them
  let uv: vec2f = cityUV(d); var twA: f32 = 0.0; var twD: f32 = 1e9;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    let lod: f32 = max(log2(pxa / ${f(2 * V.cityHalf / V.cityW)}), 0.0);
    let A: vec4f = texLod(tCityA, uv, lod);
    if (A.a > 0.004) {
      let B: vec4f = texLod(tCityB, uv, lod);
      twD = ${f(V.cityNear)} + B.z * ${f(V.citySpan)};
      twA = A.a * smoothstep(0.0, 0.02, uv.x) * smoothstep(1.0, 0.98, uv.x) * cityFeet(d, twD, B.w * ${f(V.cityTop + 300)} - 300.0).x;
    }
  }
  let hl: f32 = max(length(d.xz), 1e-4); let dh: vec2f = d.xz / hl; let sl: f32 = d.y / hl;
  // tb: how far off the line of sight ends in the deck (roughly, to begin with)
  var col: vec3f = vec3f(0.0); var tb: f32 = 1e9; if (sl < -0.003) { tb = ${f(HP)} / -sl; }
  if (d.y < -0.034 && d.y > -0.185) {
    // ---- the deck, lit from below and by the walls that stand in it: the light lies where the line of sight meets the cloud that is
    // drawn there (the cloud sea's own panorama of distances, seaRange in 05_sky.js)
    let dy: f32 = -d.y;
    let tt: f32 = seaRange(d); tb = tt * hl;
    let fh: f32 = 1.0 - saturate((C_DECK - dy * tt) / ${f(SEA.top)});
    let rel: vec2f = d.xz * tt - vec2f(${f(C[0])}, ${f(C[1])});
    let guv: vec2f = vec2f((dot(rel, vec2f(${f(Uu[0])}, ${f(Uu[1])})) - ${f(V.glU0)}) / ${f(V.glU1 - V.glU0)}, (dot(rel, vec2f(${f(Ww[0])}, ${f(Ww[1])})) - ${f(V.glW0)}) / ${f(V.glW1 - V.glW0)});
    if (guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0) {
      // (the line of sight lies nearly flat along the deck: one pixel spans hundreds of metres of it, so three samples along that span)
      let fw: f32 = tb * pxa / max(dy, 0.01) * 0.33;
      let gs: vec2f = vec2f(dot(dh, vec2f(${f(Uu[0])}, ${f(Uu[1])})) / ${f(V.glU1 - V.glU0)}, dot(dh, vec2f(${f(Ww[0])}, ${f(Ww[1])})) / ${f(V.glW1 - V.glW0)}) * fw;
      let lg: f32 = log2(max(fw / ${f((V.glU1 - V.glU0) / V.glN)}, 1.0));
      var g3: vec3f = (texLod(tGlow, guv - gs, lg).rgb + texLod(tGlow, guv, lg).rgb + texLod(tGlow, guv + gs, lg).rgb) * (1.0 / 3.0);
      g3 *= smoothstep(0.0, 0.06, guv.x) * smoothstep(1.0, 0.94, guv.x) * smoothstep(0.0, 0.06, guv.y) * smoothstep(1.0, 0.94, guv.y);
      // the light under the cloud is never quite still (traffic, the cloud itself thinning and thickening): it swells and sinks a
      // little from place to place, in brightness only
      let br: f32 = 1.0 + 0.12 * sin(M.p.w * 0.23 + dot(rel, vec2f(0.0011, 0.0007))) * sin(M.p.w * 0.11 + dot(rel, vec2f(-0.0006, 0.0013)));
      // (what comes on first, while it is still day, is the street lamps: sodium)
      g3 = mix(g3, vec3f(1.0, 0.52, 0.17) * (1.3 * max(g3.r, max(g3.g, g3.b))), 0.8 * M.p.y);
      // the billows' tops catch the most of it (1 - fh: how high on the billow the eye's line ends)
      col = g3 * br * ((0.50 + 0.50 * (1.0 - fh)) * exp(-tt / 26000.0) * (1.0 - twA * smoothstep(tb + 250.0, tb - 150.0, twD)) * M.q.y);
    }
  }
  // ---- the air over each quarter, lit by it
  let dm: vec3f = M.c0.rgb * domeBlob(dh, sl, ${core(0)}, tb, twD, twA) + M.c1.rgb * domeBlob(dh, sl, ${core(1)}, tb, twD, twA) + M.c2.rgb * domeBlob(dh, sl, ${core(2)}, tb, twD, twA)
    + M.c3.rgb * domeBlob(dh, sl, ${core(3)}, tb, twD, twA) + M.c4.rgb * domeBlob(dh, sl, ${core(4)}, tb, twD, twA);
  o.color = vec4f((col + dm * M.q.z) * (edge * M.p.z), 0.0); return o; }`;
  return { air: cityAirSSL(), lit, faceVS, faceFS, spotVS, spotFS, beamVS, beamFS, glowVS, glowFS };
}
