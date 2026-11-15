// js/modules/environs/sites.js — the places of the countryside: brickfields with scove kilns, threshing floors,
// village yards (pens, reed huts, stacks), watchmen's huts and drying floors in the gardens, shadufs, stooks on
// the reaped strips, flocks on the stubble.
import { M, hash2, mix3, mul3, norm2, quadC, quad1, triC, obox, beam, wallLine, ridgeLine, lathe, disc, flatRect, extrude } from './util.js';

const CROP = { barleyRipe: 1, stubble: 1, fallow: 1, ploughed: 1 };

// =========================================================================================================
// site selection (runs in prepare(): the sites are reserved so that no tree is planted on them)
// =========================================================================================================
export function chooseSites(ctx, seen) {
  const { ground: g, layout: L } = ctx, floors = [];
  const tooNear = (x, z, d) => floors.some((f) => Math.hypot(f.x - x, f.z - z) < d) || g.kilnYards.some((k) => Math.hypot(k.x - x, k.z - z) < k.radius + 30);
  const free = (x, z, r) => {
    if (!L.isFree(x, z, r)) return false;
    for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r, u = g.landUse(px, pz).use; if (u === 'water' || u === 'street' || u === 'built' || u === 'bare' || g.isWater(px, pz)) return false; if (Math.abs(g.height(px, pz) - g.height(x, z)) > 0.35) return false; }
    return true;
  };
  // 1. one or two floors at the edge of every village the film sees
  for (const v of L.villages) {
    const c = v.center || [v.x, v.z];
    if (seen.seen(c[0], c[1]) > 9000) continue;
    const want = 1 + (hash2(v.id, 1, 6101) < 0.45 ? 1 : 0); let got = 0;
    for (let k = 0; k < 40 && got < want; k++) {
      const a = M.TAU * hash2(v.id, k, 6102), d = 60 + 110 * hash2(v.id, k, 6103), x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d, R = 8 + 5 * hash2(v.id, k, 6104);
      const u = g.landUse(x, z).use;
      if (!(CROP[u] || u === 'urban') || tooNear(x, z, 60) || !free(x, z, R + 3)) continue;
      floors.push({ x, z, R, village: v.id, seed: v.id * 131 + k }); got++;
    }
  }
  // 2. floors at the heads of reaped strips
  const strips = g.fields.strips;
  for (let k = 1; k < strips.length; k++) {
    const s = strips[k];
    if (s.use !== 'stubble' && s.use !== 'barleyRipe') continue;
    if (hash2(s.seed, 5, 6105) > 0.012) continue;
    const r = s.ring, R = Math.min(12.5, Math.max(7.5, s.width * 0.42 + 3 * hash2(s.seed, 6, 6106))), x = (r[0][0] + r[1][0]) / 2 + s.dir[0] * (R + 5), z = (r[0][1] + r[1][1]) / 2 + s.dir[1] * (R + 5);
    const lu = g.landUse(x, z);
    if (!lu.strip || lu.strip[0] !== k || seen.seen(x, z) > 4800 || tooNear(x, z, 330) || !free(x, z, R + 2)) continue;
    floors.push({ x, z, R, village: null, seed: s.seed, dir: s.dir });
  }
  return { floors };
}

const ring12 = (x, z, r, n = 12) => { const o = []; for (let i = 0; i < n; i++) o.push([x + Math.cos((i / n) * M.TAU) * r, z + Math.sin((i / n) * M.TAU) * r]); o.push(o[0].slice()); return o; };
export const floorRing = (f) => ring12(f.x, f.z, f.R + 1.5);

// =========================================================================================================
// BRICKFIELDS: clay pits, drying floors with rows of bricks, hacks, scove kilns (R5 3.6, SPEC 3.16: 8 yards)
// =========================================================================================================
export function buildKilns(E) {
  const { g, C, ctx } = E, W = E.W, out = { yards: 0, kilns: [], firing: 0, rows: 0, stacks: 0, sample: null };
  const brickRed = mix3(C.bakedBrickRed, C.bakedBrickBuff, 0.25), soot = [0.09, 0.08, 0.075];
  g.kilnYards.forEach((k, ki) => {
    const feats = [], gyAt = (x, z) => g.height(x, z);
    // the layout the terrain painted (js/modules/terrain.js, 3c): three clay pits and four drying floors
    for (let q = 0; q < 7; q++) {
      const a = M.TAU * hash2(ki, q, 610), d = k.radius * (0.15 + 0.62 * hash2(ki, q, 611)), x = k.x + Math.cos(a) * d, z = k.z + Math.sin(a) * d, rot = 180 * hash2(ki, q, 612);
      if (q < 3) feats.push({ pit: true, x, z, r: (9 + 13 * hash2(ki, q, 613)) * 1.0, q });
      else feats.push({ pit: false, x, z, sx: 16 + 22 * hash2(ki, q, 615), sz: 9 + 9 * hash2(ki, q, 616), rot, r: 0.5 * Math.hypot(16 + 22 * hash2(ki, q, 615), 9 + 9 * hash2(ki, q, 616)), q });
    }
    for (const f of feats) {
      if (g.isWater(f.x, f.z)) continue;
      const gy = gyAt(f.x, f.z);
      if (f.pit) {
        // a spoil rim round the pit, a sheet of water in it, a heap of dug clay beside it
        const pts = [];
        for (let t = 0; t <= 12; t++) { const an = ((t % 12) / 12) * M.TAU, rr = f.r * (0.7 + 0.5 * hash2(t % 12, ki * 8 + f.q, 614)) * 1.04, x = f.x + Math.cos(an) * rr, z = f.z + Math.sin(an) * rr * 0.75; pts.push([x, gyAt(x, z), z]); }
        ridgeLine(W.earth, pts, 1.3, (i) => 0.35 + 0.35 * hash2(i, ki * 8 + f.q, 6201), mix3(C.ploughedSoil, C.alluvialSoilDry, 0.5), { foot: mix3(C.ploughedSoil, C.wetBank, 0.5) });
        disc(W.water, f.x, f.z, gy + 0.08, f.r * 0.42, 13, [0.5, 0.46, 0.4], [0.62, 0.56, 0.48], { sz: 0.7, wobble: 0.55, seed: ki * 8 + f.q });
        let a = M.TAU * hash2(ki, f.q, 6202), hx = f.x + Math.cos(a) * (f.r * 0.95 + 3), hz = f.z + Math.sin(a) * (f.r * 0.95 + 3) * 0.75;
        for (let t = 0; t < 8 && feats.some((o) => !o.pit && Math.hypot(o.x - hx, o.z - hz) < o.r + 3); t++) { a += 0.8; hx = f.x + Math.cos(a) * (f.r * 0.95 + 3); hz = f.z + Math.sin(a) * (f.r * 0.95 + 3) * 0.75; }
        if (!feats.some((o) => !o.pit && Math.hypot(o.x - hx, o.z - hz) < o.r + 3)) lathe(W.earth, hx, hz, gyAt(hx, hz), [[2.6, -0.1], [1.9, 0.7], [0.8, 1.25], [0, 1.4]], 7, (kk) => mul3(mix3(C.ploughedSoil, C.wetBank, 0.4), 0.9 + 0.1 * kk), { sx: 1.3, phase: a });
      } else {
        // rows of moulded bricks drying on the floor, turned on edge as they dry (pale = dry)
        const ux = Math.cos(f.rot * M.DEG), uz = Math.sin(f.rot * M.DEG), vx = -uz, vz = ux, nrow = Math.floor((f.sz - 2) / 1.25), dry = hash2(ki, f.q, 6203);
        for (let r = 0; r < nrow; r++) {
          const o = -f.sz / 2 + 1.2 + r * 1.25, kk = Math.min(1, dry * 0.7 + 0.5 * hash2(r, ki * 8 + f.q, 6206)), col = mix3(mix3(C.ploughedSoil, C.mudPlasterDark, 0.5), mix3(C.mudPlaster, C.mudPlasterSunlit, 0.5), kk);
          // each row in two to four runs: bricks laid flat while wet (low), turned on edge as they dry (high, pale)
          let u = -f.sx / 2 + 1.0 + 1.5 * hash2(r, ki * 8 + f.q, 6204);
          for (let piece = 0; u < f.sx / 2 - 2 && piece < 4; piece++) {
            const L = 3 + 7 * hash2(r * 8 + piece, ki * 8 + f.q, 6205), u1 = Math.min(f.sx / 2 - 1, u + L), cx = f.x + vx * o + ux * (u + u1) / 2, cz = f.z + vz * o + uz * (u + u1) / 2;
            if (u1 - u > 1) obox(W.brick, cx, cz, gy - 0.1, gy + 0.09 + 0.26 * kk, (u1 - u) / 2, 0.17 + 0.17 * (1 - kk), ux, uz, { side: mul3(col, 0.82), top: col, foot: mul3(col, 0.6) });
            u = u1 + 0.5 + 1.2 * hash2(r * 8 + piece, ki * 8 + f.q, 6224);
          }
          out.rows++;
        }
        // a hack (long stack) of dried bricks at one end of the floor
        const e = hash2(ki, f.q, 6207) < 0.5 ? -1 : 1, sx = f.x + ux * e * (f.sx / 2 + 1.4), sz = f.z + uz * e * (f.sx / 2 + 1.4), col = mul3(mix3(C.mudPlaster, C.mudPlasterGrey, 0.5), 0.95);
        if (!g.isWater(sx, sz)) { obox(W.brick, sx, sz, gyAt(sx, sz) - 0.3, gyAt(sx, sz) + 1.0 + 0.5 * hash2(ki, f.q, 6208), 0.55, f.sz * 0.36, ux, uz, { side: col, top: mul3(col, 1.06), foot: mul3(col, 0.66), batter: 0.03 }); out.stacks++; }
        // a reed shelter for the moulders beside it
        const hx = f.x - ux * e * (f.sx / 2 + 2.6), hz = f.z - uz * e * (f.sx / 2 + 2.6);
        if (!g.isWater(hx, hz)) shelter(E, hx, hz, vx, vz, 1.7, 1.3, 2.0, ki * 8 + f.q);
      }
    }
    // kilns: where the yard is neither pit nor floor
    const nk = 4 + Math.floor(hash2(ki, 1, 6209) * 4.99), placed = [];
    for (let t = 0; t < 80 && placed.length < nk; t++) {
      const a = M.TAU * hash2(ki, t, 6210), d = k.radius * (0.12 + 0.8 * Math.sqrt(hash2(ki, t, 6211))), x = k.x + Math.cos(a) * d, z = k.z + Math.sin(a) * d;
      if (g.isWater(x, z) || g.landUse(x, z).use === 'water') continue;
      if (feats.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 6) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < 13)) continue;
      const rot = 180 * hash2(ki, t, 6212), ux = Math.cos(rot * M.DEG), uz = Math.sin(rot * M.DEG), hx = 2.6 + 1.5 * hash2(ki, t, 6213), hz = 1.8 + 0.8 * hash2(ki, t, 6214), H = 2.7 + 1.0 * hash2(ki, t, 6215);
      const state = placed.length === 0 ? 0 : Math.floor(hash2(ki, t, 6216) * 3.2);       // 0 firing, 1 cooling, 2 opened, 3 being stacked
      const rec = { x, z, ux, uz, hx, hz, H, state, yard: ki, y: g.height(x, z) };
      scoveKiln(E, rec, ki * 100 + t);
      placed.push(rec); out.kilns.push(rec);
      if (state === 0) {
        out.firing++;
        ctx.emitters.add({ kind: 'kilnSmoke', pos: [x, rec.y + H + 0.5, z], size: 2.2 + 1.2 * hash2(ki, t, 6217), data: { yard: ki } });
        ctx.emitters.add({ kind: 'hearth', pos: [x - uz * (hz + 0.5), rec.y + 0.5, z + ux * (hz + 0.5)], size: 1.3, data: { kiln: true } });
      }
      // stacks of fired bricks beside an opened kiln, fuel beside a kiln in fire
      const vx = -uz, vz = ux, side = hash2(ki, t, 6218) < 0.5 ? -1 : 1;
      if (state === 2) for (let s = 0; s < 3; s++) {
        const sx = x + vx * side * (hz + 3.2 + s * 1.9) + ux * (hash2(s, ki * 100 + t, 6219) - 0.5) * 2, sz = z + vz * side * (hz + 3.2 + s * 1.9) + uz * (hash2(s, ki * 100 + t, 6219) - 0.5) * 2, col = mul3(mix3(brickRed, C.bakedBrickYellow, hash2(s, ki * 100 + t, 6220) * 0.6), 0.95);
        if (g.isWater(sx, sz)) continue;
        obox(W.brick, sx, sz, g.height(sx, sz) - 0.3, g.height(sx, sz) + 0.9 + 0.5 * hash2(s, ki * 100 + t, 6221), 1.6 + hash2(s, ki * 100 + t, 6222), 0.55, ux, uz, { side: col, top: mul3(col, 1.05), foot: mul3(col, 0.65) }); out.stacks++;
      } else {
        // fuel: bundled reeds and brushwood stacked for the fires; an ash heap raked out of the tunnels
        const fx = x + vx * side * (hz + 3.4), fz = z + vz * side * (hz + 3.4);
        if (!g.isWater(fx, fz)) obox(W.reed, fx, fz, g.height(fx, fz) - 0.2, g.height(fx, fz) + 1.1 + 0.6 * hash2(ki, t, 6223), 2.2, 0.9, ux, uz, { side: mul3(C.reedMat, 0.8), top: mul3(C.reedMat, 0.95), foot: mul3(C.reedMat, 0.5), batter: 0.12 });
        const ax = x - vx * side * (hz + 2.6) + ux * 1.5, az = z - vz * side * (hz + 2.6) + uz * 1.5;
        if (!g.isWater(ax, az)) lathe(W.earth, ax, az, g.height(ax, az), [[1.7, -0.1], [1.1, 0.4], [0, 0.7]], 6, (kk) => mul3([0.4, 0.365, 0.31], 0.8 + 0.25 * kk), { sx: 1.3, phase: rot });
      }
    }
    out.yards++;
  });
  if (out.kilns.length) { const w = ctx.geom.writer({ color: true }); const k0 = out.kilns[0]; scoveBody(w, k0, E.C, 1); out.sample = w; }
  return out;
}

function scoveBody(w, k, C, seed) {
  const { x, z, ux, uz, hx, hz, H, y } = k, opened = k.state === 2, stacking = k.state === 3;
  const mud = mul3(mix3(C.mudPlasterWeathered, C.mudPlasterReddish, hash2(seed, 1, 6301)), 0.9 + 0.14 * hash2(seed, 2, 6302)), sootTop = mix3(mud, [0.1, 0.09, 0.08], k.state === 0 ? 0.62 : 0.35);
  const red = mul3(mix3(C.bakedBrickRed, C.bakedBrickBuff, 0.3), 0.92);
  if (stacking) {
    // green bricks being set: a stepped stack, no casing yet
    const c = mul3(mix3(C.mudPlaster, C.mudPlasterGrey, 0.4), 0.9);
    obox(w, x, z, y - 0.4, y + H * 0.45, hx, hz, ux, uz, { side: c, top: mul3(c, 1.06), foot: mul3(c, 0.65) });
    obox(w, x - ux * hx * 0.3, z - uz * hx * 0.3, y + H * 0.45 - 0.02, y + H * 0.8, hx * 0.62, hz * 0.94, ux, uz, { side: c, top: mul3(c, 1.06), foot: mul3(c, 0.8) });
    return;
  }
  if (opened) {
    // the casing is off: the fired stack, half taken down
    obox(w, x, z, y - 0.4, y + H * 0.5, hx * 0.96, hz * 0.94, ux, uz, { side: red, top: mul3(red, 0.9), foot: mul3(red, 0.6) });
    obox(w, x + ux * hx * 0.36, z + uz * hx * 0.36, y + H * 0.5 - 0.02, y + H * 0.92, hx * 0.56, hz * 0.9, ux, uz, { side: red, top: mul3(red, 0.85), foot: mul3(red, 0.8) });
    return;
  }
  obox(w, x, z, y - 0.5, y + H, hx, hz, ux, uz, { side: mud, top: sootTop, foot: mul3(mud, 0.6), batter: 0.11 });
  // a low kerb of loose bricks round the top, and the vents
  const tx = hx - 0.11 * (H + 0.5), tz = hz - 0.11 * (H + 0.5), vx = -uz, vz = ux;
  for (let i = 0; i < 4; i++) { const a = (i - 1.5) / 2, cx = x + ux * a * tx * 0.8, cz = z + uz * a * tx * 0.8, o = (hash2(i, seed, 6303) - 0.5) * tz; obox(w, cx + vx * o, cz + vz * o, y + H - 0.02, y + H + 0.22 + 0.2 * hash2(i, seed, 6304), 0.3, 0.3, ux, uz, { side: mul3(sootTop, 0.8), top: [0.05, 0.045, 0.04] }); }
  // fire tunnels along both long sides: dark mouths under a soot stain
  const n = hx > 3.3 ? 4 : 3, dark = [0.035, 0.03, 0.028];
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n * 2 - 1) * (hx - 0.7);
    const P = (du, yy, out) => { const o = hz - 0.11 * (yy + 0.5) + out; return [x + ux * (u + du) + vx * s * o, y + yy, z + uz * (u + du) + vz * s * o]; };
    quad1(w, P(-0.3, 0.02, 0.03), P(0.3, 0.02, 0.03), P(0.3, 0.62, 0.03), P(-0.3, 0.62, 0.03), dark, vx * s, 0.1, vz * s);
    triC(w, P(-0.3, 0.62, 0.03), P(0.3, 0.62, 0.03), P(0, 0.86, 0.03), dark, dark, dark, vx * s, 0.1, vz * s);
    const st = mix3(mud, [0.1, 0.09, 0.08], 0.55);
    quadC(w, P(-0.42, 0.86, 0.02), P(0.42, 0.86, 0.02), P(0.25, 1.9, 0.02), P(-0.25, 1.9, 0.02), st, st, mud, mud, vx * s, 0.1, vz * s);
  }
}

function scoveKiln(E, k, seed) {
  const { g, C } = E, W = E.W;
  scoveBody(k.state === 2 ? W.brick : W.wall, k, C, seed);
  if (k.state < 2) {
    // an earth ramp against one end for carrying the bricks up
    const { x, z, ux, uz, hx, hz, H, y } = k, e = hash2(seed, 5, 6305) < 0.5 ? 1 : -1, vx = -uz, vz = ux, col = mix3(C.alluvialSoilDry, C.ploughedSoil, 0.4);
    const ax = x + vx * hz * 0.5, az = z + vz * hz * 0.5, bx = x - vx * hz * 0.5, bz = z - vz * hz * 0.5;
    // extrude across the kiln's width; the section lies along the kiln's long axis (across = -u for this axis)
    extrude(W.earth, ax, az, bx, bz, y, [[e * (hx - 0.45), -0.3], [e * (hx + 5.2), -0.3], [e * (hx - 0.45), H * 0.72]], (i) => (i === 2 ? mul3(col, 1.05) : mul3(col, 0.8)), { skip: (i) => i === 0 });
  }
}

/** A flat reed-mat roof on four posts. */
function shelter(E, x, z, ux, uz, hx, hz, H, seed) {
  const { g, C } = E, W = E.W, vx = -uz, vz = ux, gy = g.height(x, z), tilt = 0.25;
  const col = mul3(C.reedMat, 0.78 + 0.2 * hash2(seed, 1, 6401));
  const P = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push([x + ux * sx * hx + vx * sz * hz, gy + H + (sz > 0 ? tilt : 0), z + uz * sx * hx + vz * sz * hz]);
  quad1(W.reed, P[0], P[1], P[2], P[3], col, 0, 1, 0);
  quad1(W.reed, P[0].map((v, i) => (i === 1 ? v - 0.07 : v)), P[1].map((v, i) => (i === 1 ? v - 0.07 : v)), P[2].map((v, i) => (i === 1 ? v - 0.07 : v)), P[3].map((v, i) => (i === 1 ? v - 0.07 : v)), mul3(col, 0.55), 0, -1, 0);
  for (const p of P) { const ix = x + (p[0] - x) * 0.9, iz = z + (p[2] - z) * 0.9; beam(W.wood, [ix, gy - 0.3, iz], [ix, p[1] - 0.03, iz], 0.11, mul3(C.palmTrunk, 0.85)); }
}

// =========================================================================================================
// THRESHING FLOORS (R5 3.6: circles of hard-beaten earth 15 to 30 m across with a heap of grain and a straw stack)
// =========================================================================================================
export function buildFloors(E, floors) {
  const { g, C, ctx } = E, W = E.W, out = { floors: 0, list: [], fires: 0 };
  const grain = mul3(mix3(C.barleyRipe, C.stubble, 0.2), 0.95), straw = mul3(mix3(C.stubble, C.barleyRipe, 0.2), 0.92), earth = mix3(C.streetEarth, C.saltCrust, 0.32);
  for (const f of floors) {
    if (g.isWater(f.x, f.z)) continue;
    const gy = g.height(f.x, f.z), R = f.R, sd = f.seed, a0 = M.TAU * hash2(sd, 1, 6501);
    const yAt = (x, z) => g.height(x, z) + 0.11;
    disc(W.flat, f.x, f.z, yAt, R, 20, earth, mul3(mix3(earth, C.streetEarthDamp, 0.5), 0.96), { wobble: 0.08, seed: sd });
    // a low kerb of swept chaff and earth round it
    const rim = []; for (let i = 0; i <= 20; i++) { const a = ((i % 20) / 20) * M.TAU, x = f.x + Math.cos(a) * (R + 0.4), z = f.z + Math.sin(a) * (R + 0.4); rim.push([x, g.height(x, z), z]); }
    ridgeLine(W.earth, rim, 0.6, (i) => 0.14 + 0.12 * hash2(i, sd, 6502), mix3(straw, C.alluvialSoilDry, 0.6));
    const busy = hash2(sd, 2, 6503) < 0.6;
    if (busy) {
      // sheaves spread in a ring for the sledge
      lathe(W.reed, f.x, f.z, gy + 0.1, [[R * 0.4, 0.0], [R * 0.47, 0.24], [R * 0.74, 0.26], [R * 0.82, 0.0]], 14, (k) => mul3(grain, k === 0 || k === 3 ? 0.82 : 1.0), { phase: a0 });
      // the threshing sledge on the ring, with its draught pole
      const sa = a0 + 1.3, sx = f.x + Math.cos(sa) * R * 0.6, sz = f.z + Math.sin(sa) * R * 0.6, tx = -Math.sin(sa), tz = Math.cos(sa);
      obox(W.wood, sx, sz, gy + 0.36, gy + 0.5, 0.95, 0.5, tx, tz, { side: mul3(C.palmWood, 0.8), top: C.palmWood, bottom: true });
      beam(W.wood, [sx + tx * 0.9, gy + 0.5, sz + tz * 0.9], [sx + tx * 3.2, gy + 0.95, sz + tz * 3.2], 0.09, mul3(C.palmTrunk, 0.9));
    }
    // the heap of threshed grain in the middle or at the edge, the chaff downwind of it
    const ga = a0 + 2.6, gd = busy ? 0 : R * 0.35, gx = f.x + Math.cos(ga) * gd, gz = f.z + Math.sin(ga) * gd, gs = 0.9 + 0.5 * hash2(sd, 3, 6504);
    lathe(W.reed, gx, gz, gy + 0.1, [[1.7 * gs, -0.02], [1.2 * gs, 0.5 * gs], [0.5 * gs, 0.95 * gs], [0, 1.08 * gs]], 9, (k) => mul3(grain, 1.02 + 0.03 * k), {});
    const wd = ctx.wind ? ctx.wind.dir : [0.5, 0.87], cx = gx + wd[0] * (2.6 * gs + 1.2), cz = gz + wd[1] * (2.6 * gs + 1.2);
    if (Math.hypot(cx - f.x, cz - f.z) < R - 1) lathe(W.reed, cx, cz, gy + 0.1, [[2.3, -0.02], [1.6, 0.3], [0, 0.48]], 8, (k) => mul3(mix3(straw, C.stubble, 0.5), 0.94 - 0.04 * k), { sx: 1.5, ux: wd[0], uz: wd[1] });
    // straw stacks outside the floor: loaves, the older ones plastered with mud against the rain
    const ns = 1 + Math.floor(hash2(sd, 4, 6505) * 2.6);
    for (let i = 0; i < ns; i++) {
      const a = a0 + 3.9 + i * 0.75, d = R + 3.6 + 1.5 * hash2(sd, 10 + i, 6506), x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      if (g.isWater(x, z) || !E.L.isFree(x, z, 1.5)) continue;
      const plastered = hash2(sd, 20 + i, 6507) < 0.35, s = 0.85 + 0.4 * hash2(sd, 30 + i, 6508), col = plastered ? mul3(C.mudPlaster, 0.92) : mul3(straw, 0.95 + 0.1 * hash2(sd, 40 + i, 6509));
      lathe(plastered ? W.wall : W.reed, x, z, g.height(x, z), [[1.9 * s, -0.2], [2.0 * s, 0.9 * s], [1.5 * s, 1.9 * s], [0.6 * s, 2.5 * s], [0, 2.65 * s]], 9, (k) => mul3(col, 0.84 + 0.05 * k), { sx: 1.45, ux: Math.cos(a + 1.57), uz: Math.sin(a + 1.57) });
    }
    // winnowing forks stood in the heap, reed mats with sacks at the edge
    for (let i = 0; i < 2; i++) { const a = a0 + i * 2.2, bx = gx + Math.cos(a) * 1.3 * gs, bz = gz + Math.sin(a) * 1.3 * gs; beam(W.wood, [bx, gy + 0.1, bz], [bx + Math.cos(a) * 0.5, gy + 2.0, bz + Math.sin(a) * 0.5], 0.07, mul3(C.palmWood, 1.05)); }
    for (let i = 0; i < 2; i++) { const a = a0 + 0.4 + i * 0.5, x = f.x + Math.cos(a) * (R - 1.6), z = f.z + Math.sin(a) * (R - 1.6); flatRect(W.reed, x, z, 1.3, 0.85, Math.cos(a + 1.57), Math.sin(a + 1.57), gy + 0.16, mul3(C.reedMat, 0.9)); }
    const rec = { x: f.x, z: f.z, y: gy + 0.11, radius: R, busy, village: f.village };
    out.list.push(rec); out.floors++;
    if (busy && hash2(sd, 5, 6510) < 0.55) ctx.emitters.add({ kind: 'dust', pos: [gx, gy + 1.6, gz], size: 2.2, data: { winnowing: true } });
    if (hash2(sd, 6, 6511) < 0.4) { const a = a0 + 5.3, x = f.x + Math.cos(a) * (R + 2.2), z = f.z + Math.sin(a) * (R + 2.2); if (!g.isWater(x, z)) { ctx.emitters.add({ kind: 'hearth', pos: [x, g.height(x, z) + 0.3, z], size: 1.0, data: { watchFire: true } }); out.fires++; rec.fire = [x, z]; lathe(W.earth, x, z, g.height(x, z), [[0.55, -0.05], [0.4, 0.12], [0, 0.16]], 6, () => [0.12, 0.11, 0.1], {}); } }
  }
  return out;
}

// =========================================================================================================
// reed huts, pens, stacks
// =========================================================================================================
/** An arched hut of reed bundles and mats (the marsh-dwellers' house in small; the watchman's hut of a garden). */
export function reedHut(E, x, z, ux, uz, len, wid, hgt, seed) {
  const { g, C } = E, W = E.W, gy = g.height(x, z), col = mul3(C.reedMat, 0.74 + 0.22 * hash2(seed, 1, 6601)), hw = wid / 2;
  const sec = [[-hw, -0.25], [-hw * 0.96, hgt * 0.5], [-hw * 0.62, hgt * 0.88], [0, hgt], [hw * 0.62, hgt * 0.88], [hw * 0.96, hgt * 0.5], [hw, -0.25]];
  const ax = x - ux * len / 2, az = z - uz * len / 2, bx = x + ux * len / 2, bz = z + uz * len / 2;
  extrude(W.reed, ax, az, bx, bz, gy, sec, (i) => mul3(col, i === 0 || i === 6 ? 0.7 : i === 3 ? 1.06 : 0.92), { skip: (i) => i === 6, endCol: mul3(col, 0.8) });
  // the door: a dark opening in the front end, a mat rolled up over it
  const nx = -uz, nz = ux, dk = [0.05, 0.045, 0.04];
  quad1(W.reed, [bx + ux * 0.03 - nx * 0.4, gy + 0.02, bz + uz * 0.03 - nz * 0.4], [bx + ux * 0.03 + nx * 0.4, gy + 0.02, bz + uz * 0.03 + nz * 0.4], [bx + ux * 0.03 + nx * 0.4, gy + hgt * 0.62, bz + uz * 0.03 + nz * 0.4], [bx + ux * 0.03 - nx * 0.4, gy + hgt * 0.62, bz + uz * 0.03 - nz * 0.4], dk, ux, 0, uz);
  if (E.path(x, z) < 460) {
    // near the low flights: the bundle ribs of the frame and the lashings
    const N = E.N, rib = mul3(col, 0.62);
    for (let k = 0; k <= 3; k++) { const t = (k / 3) * len - len / 2, cx = x + ux * t, cz = z + uz * t; for (let i = 0; i + 1 < sec.length; i++) { const a = sec[i], b = sec[i + 1]; beam(N.reed, [cx + nx * a[0] * 1.03, gy + Math.max(0, a[1]) * 1.03, cz + nz * a[0] * 1.03], [cx + nx * b[0] * 1.03, gy + Math.max(0, b[1]) * 1.03, cz + nz * b[0] * 1.03], 0.14, rib); } }
    for (const s of [-1, 1]) beam(N.reed, [ax + nx * s * hw * 0.8, gy + hgt * 0.72, az + nz * s * hw * 0.8], [bx + nx * s * hw * 0.8, gy + hgt * 0.72, bz + nz * s * hw * 0.8], 0.1, rib);
  }
  return 30;
}

/** A pen: mud wall or reed fence round a trodden yard, with a gap for the gate, a trough and a dung heap. */
export function pen(E, x, z, ux, uz, hx, hz, seed) {
  const { g, C } = E, W = E.W, vx = -uz, vz = ux, reed = hash2(seed, 1, 6701) < 0.4, gy = g.height(x, z);
  const col = reed ? mul3(C.reedMat, 0.7 + 0.2 * hash2(seed, 2, 6702)) : mul3(mix3(C.mudPlaster, C.mudPlasterWeathered, hash2(seed, 2, 6702)), 0.92), h = reed ? 1.35 : 1.15, t = reed ? 0.12 : 0.42, wr = reed ? W.reed : W.wall;
  const cor = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [x + ux * sx * hx + vx * sz * hz, z + uz * sx * hx + vz * sz * hz]);
  for (let i = 0; i < 4; i++) {
    const a = cor[i], b = cor[(i + 1) % 4], pts = [];
    if (i === 0) {       // the gate side: two pieces with a gap
      const gk = 0.3 + 0.4 * hash2(seed, 3, 6703), len = Math.hypot(b[0] - a[0], b[1] - a[1]), gg = 0.8 / len;
      const p1 = [[a[0], g.height(a[0], a[1]), a[1]], [a[0] + (b[0] - a[0]) * (gk - gg), 0, a[1] + (b[1] - a[1]) * (gk - gg)]], p2 = [[a[0] + (b[0] - a[0]) * (gk + gg), 0, a[1] + (b[1] - a[1]) * (gk + gg)], [b[0], g.height(b[0], b[1]), b[1]]];
      p1[1][1] = g.height(p1[1][0], p1[1][2]); p2[0][1] = g.height(p2[0][0], p2[0][2]);
      wallLine(wr, p1, t, h, col, mul3(col, 1.1), { sink: 0.4 }); wallLine(wr, p2, t, h, col, mul3(col, 1.1), { sink: 0.4 });
      continue;
    }
    pts.push([a[0], g.height(a[0], a[1]), a[1]], [b[0], g.height(b[0], b[1]), b[1]]);
    wallLine(wr, pts, t, h, col, mul3(col, 1.1), { sink: 0.4 });
  }
  // trodden, dunged floor; trough; dung heap
  flatRect(W.flat, x, z, hx - 0.3, hz - 0.3, ux, uz, (px, pz) => g.height(px, pz) + 0.07, mix3(C.streetEarthDamp, C.ploughedSoil, 0.5), mix3(C.streetEarthDamp, C.streetEarth, 0.4));
  obox(W.wall, x + ux * (hx - 1.2) + vx * (hz - 0.9), z + uz * (hx - 1.2) + vz * (hz - 0.9), gy - 0.2, gy + 0.45, 0.9, 0.32, ux, uz, { side: mul3(C.mudPlaster, 0.85), top: mul3(C.wetBank, 0.8) });
  lathe(W.earth, x - ux * (hx - 1.4) - vx * (hz - 1.3), z - uz * (hx - 1.4) - vz * (hz - 1.3), gy, [[1.1, -0.05], [0.7, 0.4], [0, 0.6]], 6, (k) => mul3(C.ploughedSoil, 0.6 + 0.1 * k), {});
  return { x, z, hx, hz, ux, uz, reed };
}

/** A straw or dung-cake stack. */
export function stack(E, x, z, seed) {
  const { g, C } = E, W = E.W, kind = hash2(seed, 1, 6801), a = M.TAU * hash2(seed, 2, 6802), s = 0.7 + 0.5 * hash2(seed, 3, 6803), gy = g.height(x, z);
  if (kind < 0.5) { const col = mul3(mix3(C.stubble, C.barleyRipe, 0.3), 0.86 + 0.14 * hash2(seed, 4, 6804)); lathe(W.reed, x, z, gy, [[1.85 * s, -0.2], [1.8 * s, 1.1 * s], [1.0 * s, 2.2 * s], [0, 2.5 * s]], 7, (k) => mul3(col, 0.8 + 0.07 * k), { sx: 1.4, ux: Math.cos(a), uz: Math.sin(a) }); }
  else if (kind < 0.75) { const col = mul3(C.mudPlaster, 0.9); lathe(W.wall, x, z, gy, [[1.5 * s, -0.2], [1.55 * s, 1.0 * s], [0.9 * s, 2.0 * s], [0, 2.4 * s]], 7, (k) => mul3(col, 0.85 + 0.05 * k), {}); }   // a mud-plastered grain pile
  else lathe(W.earth, x, z, gy, [[1.2 * s, -0.1], [0.9 * s, 0.8 * s], [0, 1.4 * s]], 6, (k) => mul3([0.2, 0.17, 0.13], 0.9 + 0.1 * k), {});   // dung cakes for fuel
}

export function buildVillageYards(E) {
  const { g, L, C } = E, out = { pens: [], huts: 0, stacks: 0, villages: 0 };
  const place = (h, i, seedBase, share) => {
    const hsh = hash2(h.id, i, seedBase);
    if (hsh > share) return;
    // behind the house (away from its door), a little to one side
    const dd = h.doorDir || [0, 1], sz = h.size ? Math.max(h.size[0], h.size[1]) : 10, back = sz / 2 + 4 + 6 * hash2(h.id, i, seedBase + 1), lat = (hash2(h.id, i, seedBase + 2) - 0.5) * sz * 1.4;
    const x = h.center[0] - dd[0] * back - dd[1] * lat, z = h.center[1] - dd[1] * back + dd[0] * lat;
    const rot = (h.rotationDeg || 0) * M.DEG, ux = Math.cos(rot), uz = Math.sin(rot), kind = hash2(h.id, i, seedBase + 3);
    if (kind < 0.36) {
      const hx = 3 + 3 * hash2(h.id, i, seedBase + 4), hz = 2.6 + 2 * hash2(h.id, i, seedBase + 5), r = Math.hypot(hx, hz) + 0.6;
      if (!L.isFree(x, z, r) || !flatEnough(g, x, z, r)) return;
      out.pens.push(pen(E, x, z, ux, uz, hx, hz, h.id * 7 + i));
    } else if (kind < 0.58) {
      if (!L.isFree(x, z, 3.2) || !flatEnough(g, x, z, 3)) return;
      reedHut(E, x, z, uz, -ux, 3.6 + 2.4 * hash2(h.id, i, seedBase + 6), 2.6 + 0.8 * hash2(h.id, i, seedBase + 7), 2.0 + 0.5 * hash2(h.id, i, seedBase + 8), h.id * 7 + i); out.huts++;
    } else {
      if (!L.isFree(x, z, 2.4) || !flatEnough(g, x, z, 2.4)) return;
      stack(E, x, z, h.id * 7 + i); out.stacks++;
    }
  };
  for (const v of L.villages) {
    const c = v.center || [v.x, v.z];
    if (E.seen(c[0], c[1]) > 7000) continue;
    out.villages++;
    for (const id of v.houses) { const h = L.houseById(id); if (!h || !L.isBuilt(h)) continue; for (let i = 0; i < 2; i++) place(h, i, 6901, 0.75); }
  }
  // farmsteads along the country roads and the suburb ribbons: a pen, a hut or a stack behind some of them
  for (const h of L.houses) {
    if (h.village !== null && h.village !== undefined) continue;
    if (h.enclosure === 'innerEast' || h.enclosure === 'innerWest') continue;
    if (!L.isBuilt(h) || E.seen(h.center[0], h.center[1]) > 3600) continue;
    place(h, 0, 6951, h.enclosure === 'outerCity' ? 0.2 : 0.4);
  }
  return out;
}
const flatEnough = (g, x, z, r) => { const y = g.height(x, z); for (let a = 0; a < 6; a++) { const px = x + Math.cos(a * 1.047) * r, pz = z + Math.sin(a * 1.047) * r; if (Math.abs(g.height(px, pz) - y) > 0.4 || g.isWater(px, pz)) return false; } return true; };

/** Watchmen's huts and drying floors in the walled gardens. */
export function buildGardenHuts(E, walled) {
  const { g, C } = E, W = E.W, out = { huts: 0, yards: 0 };
  for (const s of walled) {
    if (s.sd > 3000) continue;
    const h = hash2(s.seed, 1, 7001); if (h > 0.34) continue;
    const r = s.ring, across = norm2(r[1][0] - r[0][0], r[1][1] - r[0][1]), d = 7 + 14 * hash2(s.seed, 2, 7002), lat = (0.25 + 0.5 * hash2(s.seed, 3, 7003)) * s.width;
    const x = r[0][0] + across[0] * lat + s.dir[0] * d, z = r[0][1] + across[1] * lat + s.dir[1] * d;
    const lu = g.landUse(x, z);
    if (!lu.strip || lu.strip[0] !== s.id || !flatEnough(g, x, z, 3.5) || !E.L.isFree(x, z, 3)) continue;
    if (h < 0.2) { reedHut(E, x, z, s.dir[0], s.dir[1], 3.4 + 2 * hash2(s.seed, 4, 7004), 2.5 + 0.7 * hash2(s.seed, 5, 7005), 1.9 + 0.5 * hash2(s.seed, 6, 7006), s.seed); out.huts++; }
    else {
      // a drying floor: beaten earth with reed mats spread on it (in autumn for the dates; now for flax, reeds and dung cakes)
      const hx = 2.6 + 1.6 * hash2(s.seed, 7, 7007), hz = Math.min(s.width * 0.3, 3.2 + 2 * hash2(s.seed, 8, 7008)), y = (px, pz) => g.height(px, pz) + 0.1;
      flatRect(W.flat, x, z, hx, hz, s.dir[0], s.dir[1], y, mix3(C.streetEarth, C.saltCrust, 0.3));
      const n = Math.max(1, Math.floor(hx / 1.1));
      for (let i = 0; i < n; i++) { const o = ((i + 0.5) / n * 2 - 1) * (hx - 0.3), full = hash2(s.seed, 20 + i, 7009); flatRect(W.reed, x + s.dir[0] * o, z + s.dir[1] * o, 0.45, hz - 0.5, s.dir[0], s.dir[1], g.height(x, z) + 0.15, full < 0.4 ? mul3(C.reedMat, 0.95) : full < 0.7 ? mul3([0.25, 0.2, 0.14], 1) : mul3(mix3(C.reedMat, C.reedsGreen, 0.5), 0.8)); }
      out.yards++;
    }
  }
  return out;
}

// =========================================================================================================
// SHADUFS (R5 3.6: a pole with a counterweight and a bucket on a forked post)
// =========================================================================================================
export function shaduf(E, x, z, dx, dz, seed) {
  // (dx, dz): unit vector from the land towards the water
  const { g, C } = E, W = E.W, nx = -dz, nz = dx, gy = g.height(x, z), mud = mul3(mix3(C.mudPlaster, C.mudPlasterDark, hash2(seed, 1, 7101)), 0.9), wood = mul3(C.palmTrunk, 0.75 + 0.3 * hash2(seed, 2, 7102));
  const H = 2.0 + 0.5 * hash2(seed, 3, 7103);
  // a mud footing and two mud pillars carrying the axle
  obox(W.wall, x, z, gy - 0.7, gy + 0.3, 0.75, 1.0, dx, dz, { side: mud, top: mul3(mud, 1.05), foot: mul3(mud, 0.6), batter: 0.12 });
  for (const s of [-1, 1]) obox(W.wall, x + nx * s * 0.52, z + nz * s * 0.52, gy + 0.25, gy + H, 0.24, 0.22, dx, dz, { side: mud, top: mul3(mud, 1.08), foot: mul3(mud, 0.75), batter: 0.03 });
  beam(W.wood, [x - nx * 0.8, gy + H + 0.03, z - nz * 0.8], [x + nx * 0.8, gy + H + 0.03, z + nz * 0.8], 0.12, wood, true);
  // the pole: 35 % behind the axle with the clay counterweight, the rest over the water; dipped or raised
  const Lp = 5.2 + 1.4 * hash2(seed, 4, 7104), tilt = (-0.42 + 0.9 * hash2(seed, 5, 7105)), c = Math.cos(tilt), sn = Math.sin(tilt), py = gy + H + 0.12;
  const tip = [x + dx * c * Lp * 0.65, py + sn * Lp * 0.65, z + dz * c * Lp * 0.65], butt = [x - dx * c * Lp * 0.35, py - sn * Lp * 0.35, z - dz * c * Lp * 0.35];
  beam(W.wood, butt, tip, 0.13, wood, true);
  lathe(W.wall, butt[0], butt[2], butt[1] - 0.32, [[0.0, 0], [0.3, 0.14], [0.34, 0.36], [0.2, 0.58], [0, 0.64]], 5, () => mul3(mud, 0.8), {});
  // rope and bucket
  const over = g.isWater(tip[0], tip[2]), by = Math.max(over ? g.waterLevel + 0.05 : g.height(tip[0], tip[2]) + 0.2, tip[1] - 3.4);
  beam(W.wood, tip, [tip[0], by + 0.3, tip[2]], 0.05, mul3(C.reedMat, 0.6));
  lathe(W.wood, tip[0], tip[2], by, [[0.1, 0], [0.19, 0.12], [0.16, 0.34]], 5, () => [0.09, 0.08, 0.07], { cap: true });
  return { x, z, tip };
}

export function buildShadufs(E) {
  const { g, C } = E, out = { count: 0, list: [] };
  const tryAt = (x, z, dx, dz, seed) => {
    if (g.isWater(x, z) || E.seen(x, z) > 2700 || E.thin(hash2(seed, 9, 7201))) return;
    const u = g.landUse(x, z).use; if (u === 'street' || u === 'built') return;
    if (out.list.some((q) => Math.hypot(q.x - x, q.z - z) < 25)) return;
    out.list.push(shaduf(E, x, z, dx, dz, seed)); out.count++;
  };
  // main canals: on the berm at the edge of the water
  g.canals.forEach((c, ci) => {
    if (!c.levee) return;
    const len = M.polylineLength(c.polyline);
    for (let s = 60 + 80 * hash2(ci, 1, 7202), i = 0; s < len; s += 95 + 90 * hash2(ci, i, 7203), i++) {
      if (!c.cutAt(s)) continue;
      const p = M.pointAlong(c.polyline, s), side = hash2(ci, i, 7204) < 0.5 ? -1 : 1, nx = -p.dir[1] * side, nz = p.dir[0] * side, d = c.width / 2 + 2.2;
      tryAt(p.x + nx * d, p.z + nz * d, -nx, -nz, ci * 1000 + i);
    }
  });
  // earth banks of the river and the outer banks of the moats
  let acc = 0, n = 0;
  for (const e of g.banks) {
    if (e.type !== 'earth') continue;
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    acc += len;
    if (acc < 130) continue;
    acc = 0; n++;
    const k = hash2(n, 1, 7205), x = e.a[0] + (e.b[0] - e.a[0]) * k + e.normal[0] * 2.6, z = e.a[1] + (e.b[1] - e.a[1]) * k + e.normal[1] * 2.6;
    if (g.landUse(x, z).use === 'bare') continue;
    tryAt(x, z, -e.normal[0], -e.normal[1], 50000 + n);
  }
  // branch canals: lifting from the branch into the head ditches
  g.fields.branches.forEach((b, bi) => {
    if (b.order !== 2) return;
    const len = M.polylineLength(b.polyline);
    for (let s = 90 + 100 * hash2(bi, 1, 7206), i = 0; s < len; s += 170 + 150 * hash2(bi, i, 7207), i++) {
      const p = M.pointAlong(b.polyline, s), side = hash2(bi, i, 7208) < 0.5 ? -1 : 1, nx = -p.dir[1] * side, nz = p.dir[0] * side, d = b.width / 2 + 2.6;
      tryAt(p.x + nx * d, p.z + nz * d, -nx, -nz, 90000 + bi * 100 + i);
    }
  });
  return out;
}

// =========================================================================================================
// STOOKS on the reaped strips; FLOCKS on stubble and fallow
// =========================================================================================================
export function buildStooks(E, strips) {
  const { g, C, ctx } = E; let n = 0, fields = 0;
  const w = ctx.geom.writer({ color: true });
  lathe(w, 0, 0, 0, [[0.62, -0.08], [0.36, 1.2]], 4, (k) => (k === 1 ? [1, 1, 1] : [0.68, 0.68, 0.68]), { cap: true });
  const set = ctx.geom.instanced({ name: 'environs-stooks', geometry: w.toGeometry(), material: E.mats.reed, cell: 8192, shadowTexel: 0.75 });
  const tc = new ctx.THREE.Color();
  for (const s of strips) {
    const reaped = s.use === 'stubble';
    if ((!reaped && s.use !== 'barleyRipe') || s.sd > (reaped ? 2500 : 2200)) continue;
    if (hash2(s.seed, 1, 7301) > (reaped ? 0.85 : 0.4) || E.thin(hash2(s.seed, 2, 7302))) continue;
    const r = s.ring, across = norm2(r[1][0] - r[0][0], r[1][1] - r[0][1]), rows = Math.max(1, Math.floor(s.width / 8.5)), pitch = 9 + 5 * hash2(s.seed, 3, 7303);
    const share = reaped ? 0.3 + 0.7 * hash2(s.seed, 4, 7304) : 0.1 + 0.35 * hash2(s.seed, 4, 7304), tail = hash2(s.seed, 6, 7306) < 0.5;
    const col = mul3(mix3(C.barleyRipe, C.stubble, 0.3), 0.92 + 0.12 * hash2(s.seed, 5, 7305));
    let m = 0;
    for (let j = 0; j < rows; j++) for (let d = 6; d < s.length * share - 4; d += pitch) {
      const dd = tail ? s.length - d : d, lat = ((j + 0.5) / rows) * s.width + (hash2(j, Math.round(d), s.seed) - 0.5) * 1.6, x = r[0][0] + across[0] * lat + s.dir[0] * dd, z = r[0][1] + across[1] * lat + s.dir[1] * dd;
      const lu = g.landUse(x, z); if (!lu.strip || lu.strip[0] !== s.id || g.isWater(x, z)) continue;
      const k = 0.9 + 0.25 * hash2(j, Math.round(d), s.seed + 2), v = 0.9 + 0.2 * hash2(j, Math.round(d), s.seed + 3);
      tc.setRGB(Math.min(1, col[0] * v), Math.min(1, col[1] * v), Math.min(1, col[2] * v));
      set.add({ x, y: g.height(x, z), z, rotDeg: 360 * hash2(j, Math.round(d), s.seed + 1), sx: k, sy: k * (0.95 + 0.25 * v), sz: k }, tc);
      m++;
    }
    if (m) { n += m; fields++; }
  }
  return { stooks: n, fields, tris: n * 12 };
}

export function buildFlocks(E, strips) {
  const { g, C, ctx } = E, out = { flocks: [], sheep: 0, tris: 0 };
  const w = ctx.geom.writer({ color: true });
  // a fleece lump with a lowered head (20 triangles: they are seen from 900 m and more); local +x is forward
  obox(w, 0, 0, -0.05, 0.78, 0.55, 0.26, 1, 0, { side: [0.9, 0.9, 0.9], top: [1, 1, 1], foot: [0.42, 0.42, 0.42], batter: 0.08 });
  obox(w, 0.66, 0, 0.1, 0.52, 0.14, 0.1, 1, 0, { side: [0.66, 0.66, 0.66], top: [0.78, 0.78, 0.78] });
  const set = ctx.geom.instanced({ name: 'environs-sheep', geometry: w.toGeometry(), material: E.mats.reed, cell: 8192, shadowTexel: 0.75 });
  const tc = new ctx.THREE.Color();
  for (const s of strips) {
    if ((s.use !== 'stubble' && s.use !== 'fallow') || s.sd > 2800) continue;
    if (hash2(s.seed, 1, 7401) > 0.09) continue;
    { const lu = g.landUse(s.cx, s.cz); if (!lu.strip || lu.strip[0] !== s.id) continue; }      // only strips that show (most records lie under a nearer tier)
    const r = s.ring, across = norm2(r[1][0] - r[0][0], r[1][1] - r[0][1]), d0 = (0.15 + 0.7 * hash2(s.seed, 3, 7403)) * s.length, cx = r[0][0] + across[0] * s.width * 0.5 + s.dir[0] * d0, cz = r[0][1] + across[1] * s.width * 0.5 + s.dir[1] * d0;
    if (!FREE_USE[g.landUse(cx, cz).use] || out.flocks.some((f) => Math.hypot(f.x - cx, f.z - cz) < 280)) continue;
    const n = 14 + Math.floor(30 * hash2(s.seed, 4, 7404)), head = M.TAU * hash2(s.seed, 5, 7405), R = 4 + Math.sqrt(n) * 1.6;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const a = M.TAU * hash2(i, s.seed, 7406), d = R * Math.sqrt(hash2(i, s.seed, 7407)), x = cx + Math.cos(a) * d * 1.5, z = cz + Math.sin(a) * d;
      if (!FREE_USE[g.landUse(x, z).use] || g.isWater(x, z) || E.L.houseAt(x, z)) continue;
      const ha = head + (hash2(i, s.seed, 7408) - 0.5) * 1.8, kind = hash2(i, s.seed, 7409), sc = 0.85 + 0.3 * hash2(i, s.seed, 7410);
      const col = kind < 0.72 ? mul3(C.sheep, 0.8 + 0.2 * hash2(i, s.seed, 7411)) : kind < 0.88 ? mul3(C.woolBrown, 0.9) : [0.06, 0.055, 0.05];
      tc.setRGB(col[0], col[1], col[2]);
      set.add({ x, y: g.height(x, z), z, rotY: -ha, scale: sc }, tc);
      m++;
    }
    out.sheep += m;
    out.flocks.push({ x: cx, z: cz, n: m, heading: head });
  }
  out.tris = out.sheep * 20;
  return out;
}
/** Rubbish mounds on the lots the layout marks as tips outside the inner walls (ash, sweepings, sherds). */
export function buildRubbish(E) {
  const { g, L, C } = E, W = E.W; let n = 0, lots = 0;
  for (const o of L.openSpaces) {
    if (o.use !== 'rubbish') continue;
    const enc = g.enclosureAt(o.center[0], o.center[1]); if (enc === 'innerEast' || enc === 'innerWest') continue;       // inside the walls: the city's dressing
    if (E.seen(o.center[0], o.center[1]) > 4200) continue;
    const bb = M.bbox(o.polygon), k = 2 + Math.floor(3 * hash2(o.id, 1, 7601)); let m = 0;
    for (let i = 0; i < 14 && m < k; i++) {
      const x = bb[0] + (bb[2] - bb[0]) * hash2(o.id, i, 7602), z = bb[1] + (bb[3] - bb[1]) * hash2(o.id, i, 7603), r = 1.8 + 3.2 * hash2(o.id, i, 7604);
      if (!M.pointInPolygon(x, z, o.polygon) || M.distToRing(x, z, o.polygon) < r * 0.8 || g.isWater(x, z) || L.houseAt(x, z)) continue;
      const h = r * (0.16 + 0.14 * hash2(o.id, i, 7605)), a = M.TAU * hash2(o.id, i, 7606), ash = hash2(o.id, i, 7607);
      const col = mix3(mix3(C.ploughedSoil, C.streetEarthDamp, 0.5), ash < 0.4 ? [0.4, 0.37, 0.32] : C.bakedBrickOld || C.bakedBrickRed, ash < 0.4 ? 0.6 : 0.25);
      lathe(W.earth, x, z, g.height(x, z), [[r, -0.08], [r * 0.7, h * 0.6], [r * 0.3, h * 0.95], [0, h]], 7, (q) => mul3(col, 0.82 + 0.08 * q), { sx: 1.2 + 0.5 * hash2(o.id, i, 7608), ux: Math.cos(a), uz: Math.sin(a), phase: a });
      m++; n++;
    }
    if (m) lots++;
  }
  return { mounds: n, lots };
}

/** Reapers' shade shelters at the edge of the fields in harvest: a reed mat on four poles, a mat on the ground. */
export function buildFieldShelters(E, strips) {
  const { g, C } = E, W = E.W; let n = 0;
  for (const s of strips) {
    if ((s.use !== 'stubble' && s.use !== 'barleyRipe') || s.sd > 2300 || hash2(s.seed, 1, 7501) > 0.22) continue;
    const r = s.ring, across = norm2(r[1][0] - r[0][0], r[1][1] - r[0][1]), d = 5 + 20 * hash2(s.seed, 2, 7502), lat = (0.2 + 0.6 * hash2(s.seed, 3, 7503)) * s.width;
    const x = r[0][0] + across[0] * lat + s.dir[0] * d, z = r[0][1] + across[1] * lat + s.dir[1] * d, lu = g.landUse(x, z);
    if (!lu.strip || lu.strip[0] !== s.id || g.isWater(x, z) || !E.L.isFree(x, z, 2.5)) continue;
    shelter(E, x, z, s.dir[0], s.dir[1], 1.5 + 0.5 * hash2(s.seed, 4, 7504), 1.1 + 0.3 * hash2(s.seed, 5, 7505), 1.8 + 0.3 * hash2(s.seed, 6, 7506), s.seed);
    flatRect(W.reed, x + across[0] * 0.3, z + across[1] * 0.3, 1.0, 0.7, s.dir[0], s.dir[1], g.height(x, z) + 0.12, mul3(C.reedMat, 0.85));
    n++;
  }
  return { shelters: n };
}

const FREE_USE = { stubble: 1, fallow: 1, barleyRipe: 1, ploughed: 1, saltCrust: 1, steppe: 1 };
