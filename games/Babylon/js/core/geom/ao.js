// geom/ao.js — baked ambient occlusion per vertex for all static geometry.
//
// A height field of the static scene (0.5 m cells, stored per 256 m tile, Int16 at 1/64 m) is rasterised
// conservatively from every up-facing triangle of the nearest level of detail, on top of the analytic ground.
// Each vertex then looks for its horizon in the field:
//   side-facing vertices (walls): 16 azimuths, those in front of the wall, 8 steps out to 16 m, weighted by the
//     cosine to the normal; plus a contact term that darkens the foot of every wall and the inside of every
//     concave corner (lanes, courts, niches, the foot of a parapet). A wall vertex buried below the ground is
//     extrapolated from its partner above, so that the wall shows the contact value AT ground level;
//   up-facing vertices (roofs, floors, paving): 8 azimuths from 1.5 m out to 13 m (so that a low parapet does
//     not grey a whole roof, but a court floor or a lane between houses does go dark).
// Result 0..1 (1 = open). Millions of vertices per second: the field lookups of vertices that share a plan
// position and a normal (foot and top of a wall, the corners of neighbouring quads) are cached.
// OWNER: geometry engineer.
import * as M from '../mathx.js';

const CELL = 0.5, INV = 1 / CELL, TILE = 256, N = TILE / CELL, SHIFT = 9, MASK = N - 1, Q = 64, IQ = 1 / Q;   // N = 512 = 1 << 9
const GC = 8, GN = TILE / GC + 1;                                  // ground cache: 8 m posts
const DIRS = 16, SIDE_STEPS = [0.6, 1.2, 2.0, 3.2, 5.0, 7.5, 11, 16], UP_STEPS = [1.5, 2.5, 4, 6, 9, 13];
const DX = new Float64Array(DIRS), DZ = new Float64Array(DIRS);
for (let i = 0; i < DIRS; i++) { DX[i] = Math.cos((i / DIRS) * M.TAU); DZ[i] = Math.sin((i / DIRS) * M.TAU); }
const key = (tx, tz) => (tx + 32768) * 65536 + (tz + 32768);

export function makeAO(ctx) {
  const fields = new Map(), grounds = new Map();
  const params = { strength: 0.62, contact: 0.3, contactHeight: 1.6, underside: 0.6 };
  let ltx = 1e9, ltz = 1e9, lt = null;                                // last field tile
  let gtx = 1e9, gtz = 1e9, gt = null;                                // last ground tile

  function groundTile(tx, tz) {
    const k = key(tx, tz);
    let g = grounds.get(k);
    if (!g) {
      g = new Float32Array(GN * GN);
      for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) g[j * GN + i] = ctx.ground.height(tx * TILE + i * GC, tz * TILE + j * GC);
      grounds.set(k, g);
    }
    return g;
  }
  function ground(x, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    if (tx !== gtx || tz !== gtz) { gt = groundTile(tx, tz); gtx = tx; gtz = tz; }
    const fx = (x - tx * TILE) / GC, fz = (z - tz * TILE) / GC, i = Math.min(GN - 2, fx | 0), j = Math.min(GN - 2, fz | 0), u = fx - i, v = fz - j, o = j * GN + i;
    const a = gt[o], b = gt[o + 1], c = gt[o + GN], d = gt[o + GN + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /** The height field of one tile, created from the ground on first use. */
  function field(tx, tz) {
    const k = key(tx, tz);
    let f = fields.get(k);
    if (!f) {
      f = new Int16Array(N * N);
      const g = groundTile(tx, tz), s = CELL / GC;
      for (let j = 0; j < N; j++) {
        const fz = (j + 0.5) * s, gj = Math.min(GN - 2, fz | 0), v = fz - gj, row = j * N, o0 = gj * GN;
        for (let i = 0; i < N; i++) {
          const fx = (i + 0.5) * s, gi = Math.min(GN - 2, fx | 0), u = fx - gi, o = o0 + gi;
          const a = g[o], b = g[o + 1], c = g[o + GN], d = g[o + GN + 1];
          f[row + i] = Math.max(-32767, Math.min(32767, Math.round((a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * Q)));
        }
      }
      fields.set(k, f);
    }
    return f;
  }
  /** Height of the static scene at a plan point (the ground where no field exists). */
  function heightAt(x, z) {
    const i = Math.floor(x * INV), j = Math.floor(z * INV), tx = i >> SHIFT, tz = j >> SHIFT;
    if (tx !== ltx || tz !== ltz) { lt = fields.get(key(tx, tz)) || null; ltx = tx; ltz = tz; }
    return lt ? lt[((j & MASK) << SHIFT) | (i & MASK)] * IQ : ground(x, z);
  }

  /** Rasterise the up-facing triangles of an indexed (or plain) triangle list into the field: max height per cell, conservative. */
  function rasterize(pos, idx, ni) {
    let ftx = 1e9, ftz = 1e9, f = null;
    const h = 0.5 * CELL;
    for (let t = 0; t < ni; t += 3) {
      const a = (idx ? idx[t] : t) * 3, b = (idx ? idx[t + 1] : t + 1) * 3, c = (idx ? idx[t + 2] : t + 2) * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      const e1x = bx - ax, e1z = bz - az, e2x = cx - ax, e2z = cz - az, det = e1x * e2z - e2x * e1z;      // 3D normal y = -det
      if (det > -1e-4) continue;                                                                         // not facing up (or a sliver)
      const e1y = by - ay, e2y = cy - ay, gx = (e1y * e2z - e2y * e1z) / det, gz = (e2y * e1x - e1y * e2x) / det;
      const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
      const i0 = Math.floor(Math.min(ax, bx, cx) * INV), i1 = Math.floor(Math.max(ax, bx, cx) * INV), j0 = Math.floor(Math.min(az, bz, cz) * INV), j1 = Math.floor(Math.max(az, bz, cz) * INV);
      // edge functions E(p) = (q - p0) x (p - p0); det < 0 means the inside is where every E <= 0. Conservative by half a cell.
      const A0 = bx - ax, B0 = bz - az, A1 = cx - bx, B1 = cz - bz, A2 = ax - cx, B2 = az - cz;
      const k0 = h * (Math.abs(A0) + Math.abs(B0)), k1 = h * (Math.abs(A1) + Math.abs(B1)), k2 = h * (Math.abs(A2) + Math.abs(B2));
      for (let j = j0; j <= j1; j++) {
        const pz = (j + 0.5) * CELL, tz = j >> SHIFT, rowBase = (j & MASK) << SHIFT;
        for (let i = i0; i <= i1; i++) {
          const px = (i + 0.5) * CELL;
          if (A0 * (pz - az) - B0 * (px - ax) > k0 || A1 * (pz - bz) - B1 * (px - bx) > k1 || A2 * (pz - cz) - B2 * (px - cx) > k2) continue;
          let y = ay + gx * (px - ax) + gz * (pz - az);
          if (y < minY) y = minY; else if (y > maxY) y = maxY;
          const tx = i >> SHIFT;
          if (tx !== ftx || tz !== ftz) { f = field(tx, tz); ftx = tx; ftz = tz; }
          const o = rowBase | (i & MASK), v = Math.round(y * Q);
          if (v > f[o]) f[o] = v > 32767 ? 32767 : v;
        }
      }
    }
    ltx = 1e9; ltz = 1e9;      // fields may have been created: reset the lookup cache
  }

  // sample cache: heights along the rays of the last vertices, by plan position and normal class
  const CSIZE = 1 << 13, SLOT = DIRS * SIDE_STEPS.length;
  const cKeyX = new Int32Array(CSIZE), cKeyZ = new Int32Array(CSIZE), cKeyN = new Int32Array(CSIZE).fill(-1), cBase = new Float32Array(CSIZE), cData = new Float32Array(CSIZE * SLOT);

  /** Occlusion of an up-facing point (roof, floor): 0..1. */
  function upAt(x, y, z) {
    let sum = 0;
    for (let d = 0; d < DIRS; d += 2) {
      let mt = 0;
      for (let s = 0; s < UP_STEPS.length; s++) { const st = UP_STEPS[s], tn = (heightAt(x + DX[d] * st, z + DZ[d] * st) - y - 0.35) / st; if (tn > mt) mt = tn; }
      sum += 1 / (1 + mt * mt);
    }
    return sum / (DIRS / 2);
  }

  /**
   * The baker: fills out[i] with 0..1 (1 = unoccluded) for n vertices (pos / nor: Float32Array xyz).
   * Signature of geom.setAOBaker: fn(positions, normals, out, vertexCount, info).
   */
  function bake(pos, nor, out, n, idx = null, ni = 0) {
    const S = params.strength, nS = SIDE_STEPS.length, nU = UP_STEPS.length;
    // Walls are founded below the ground (0.5 to 3 m: ENGINE.md 1), so the lower vertex of a wall face is buried and
    // the face has no vertex AT the ground. For every buried wall vertex find the vertex above it on the same face
    // (its partner on a steep edge of a triangle): after the bake the buried one is extrapolated so that the value
    // interpolated at ground level is the contact-darkened one. Without this a deep footing washes the contact out.
    let partner = null, occs = null, bases = null;
    if (idx && ni >= 3) {
      partner = new Int32Array(n).fill(-1); occs = new Float32Array(n); bases = new Float32Array(n).fill(-1e9);
      for (let t = 0; t + 2 < ni; t += 3) for (let e = 0; e < 3; e++) {
        const u = idx[t + e], w = idx[t + ((e + 1) % 3)], dy = pos[w * 3 + 1] - pos[u * 3 + 1];
        if (dy < 0.3 && dy > -0.3) continue;
        const lo = dy > 0 ? u : w, hi = dy > 0 ? w : u, ady = dy > 0 ? dy : -dy;
        if (nor[lo * 3 + 1] > 0.5 || nor[lo * 3 + 1] < -0.5) continue;
        const hx = pos[hi * 3] - pos[lo * 3], hz = pos[hi * 3 + 2] - pos[lo * 3 + 2];
        if (hx * hx + hz * hz > 0.16 * ady * ady) continue;
        if (partner[lo] < 0 || pos[hi * 3 + 1] < pos[partner[lo] * 3 + 1]) partner[lo] = hi;
      }
    }
    for (let v = 0; v < n; v++) {
      const p = v * 3, x = pos[p], y = pos[p + 1], z = pos[p + 2], nx = nor[p], ny = nor[p + 1], nz = nor[p + 2];
      let occ;
      if (ny < -0.5) occ = params.underside;
      else if (ny > 0.5) {
        const kx = Math.round(x * 16), kz = Math.round(z * 16), slot = (Math.imul(kx, 73856093) ^ Math.imul(kz, 19349663) ^ 0x5bd1e995) & (CSIZE - 1), o = slot * SLOT;
        if (cKeyN[slot] !== 9999 || cKeyX[slot] !== kx || cKeyZ[slot] !== kz) {
          cKeyN[slot] = 9999; cKeyX[slot] = kx; cKeyZ[slot] = kz;
          for (let d = 0, q = 0; d < DIRS; d += 2) for (let s = 0; s < nU; s++, q++) cData[o + q] = heightAt(x + DX[d] * UP_STEPS[s], z + DZ[d] * UP_STEPS[s]);
        }
        let sum = 0;
        for (let d = 0, q = 0; d < DIRS / 2; d++) {
          let mt = 0;
          for (let s = 0; s < nU; s++, q++) { const tn = (cData[o + q] - y - 0.35) / UP_STEPS[s]; if (tn > mt) mt = tn; }
          sum += 1 / (1 + mt * mt);
        }
        occ = sum / (DIRS / 2);
      } else {
        const hl = Math.hypot(nx, nz) || 1, hx = nx / hl, hz = nz / hl;
        const kn = Math.round((Math.atan2(hz, hx) / M.TAU) * 256) & 255;
        const kx = Math.round(x * 16), kz = Math.round(z * 16), slot = (Math.imul(kx, 73856093) ^ Math.imul(kz, 19349663) ^ Math.imul(kn + 1, 83492791)) & (CSIZE - 1), o = slot * SLOT;
        const x0 = x + hx * 0.55, z0 = z + hz * 0.55;
        if (cKeyN[slot] !== kn || cKeyX[slot] !== kx || cKeyZ[slot] !== kz) {
          cKeyN[slot] = kn; cKeyX[slot] = kx; cKeyZ[slot] = kz;
          // the floor in front of the wall: the lowest of three samples, so that a concave corner still finds its floor
          cBase[slot] = Math.min(heightAt(x0, z0), heightAt(x0 - hz * 0.6, z0 + hx * 0.6), heightAt(x0 + hz * 0.6, z0 - hx * 0.6));
          for (let d = 0; d < DIRS; d++) {
            if (DX[d] * hx + DZ[d] * hz <= 0.15) continue;
            for (let s = 0; s < nS; s++) cData[o + d * nS + s] = heightAt(x0 + DX[d] * SIDE_STEPS[s], z0 + DZ[d] * SIDE_STEPS[s]);
          }
        }
        const base = cBase[slot], ye = y > base ? y : base;
        let sum = 0, wsum = 0;
        for (let d = 0; d < DIRS; d++) {
          const wgt = DX[d] * hx + DZ[d] * hz;
          if (wgt <= 0.15) continue;
          let mt = 0;
          for (let s = 0, q = o + d * nS; s < nS; s++, q++) { const tn = (cData[q] - ye) / (SIDE_STEPS[s] + 0.3); if (tn > mt) mt = tn; }
          sum += wgt * (1 - mt / Math.sqrt(1 + mt * mt)); wsum += wgt;
        }
        const k = Math.min(1, Math.max(0, (y - base) / params.contactHeight)), g = k * k * (3 - 2 * k);
        occ = (sum / wsum) * (1 - params.contact * (1 - g));
        if (ny > 0.15) occ = occ + (1 - occ) * ny;          // leaning faces see more sky
        if (occs) { occs[v] = occ; bases[v] = base; }
      }
      out[v] = 1 - S * (1 - occ);
    }
    if (partner) for (let v = 0; v < n; v++) {
      const q = partner[v], b = bases[v];
      if (q < 0 || b < -1e8) continue;
      const y = pos[v * 3 + 1], yt = pos[q * 3 + 1];
      if (y > b - 0.15 || yt < b + 0.3 || bases[q] < -1e8) continue;
      let occ = occs[q] + (occs[v] - occs[q]) * Math.min(6, (yt - y) / (yt - b));
      if (occ < 0) occ = 0;
      const o = 1 - S * (1 - occ);
      out[v] = o < 0.06 ? 0.06 : o;
    }
  }

  function clear() { fields.clear(); ltx = 1e9; ltz = 1e9; lt = null; cKeyN.fill(-1); }
  /** Coarse image of the field for debugging: heights of a tile as Float32Array (N x N) or null. */
  const debugField = (tx, tz) => { const f = fields.get(key(tx, tz)); return f ? Float32Array.from(f, (v) => v * IQ) : null; };

  return { params, rasterize, bake, heightAt, upAt, clear, field, debugField, hasField: (tx, tz) => fields.has(key(tx, tz)), fieldCount: () => fields.size, CELL, TILE };
}
