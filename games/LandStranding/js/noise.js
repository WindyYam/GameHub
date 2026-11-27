/**
 * Deterministic seeded PRNG, hashing, 2D/3D gradient/value noise,
 * FBM, domain-warped FBM, ridged multifractal, and Worley cellular noise.
 */

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function mix(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || 'ICELAND-01');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2i(ix, iz, seed = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function hash3i(ix, iy, iz, seed = 0) {
  let h =
    Math.imul(ix | 0, 374761393) ^
    Math.imul(iy | 0, 668265263) ^
    Math.imul(iz | 0, 2147483647) ^
    Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function hash2(x, z, seed = 0) {
  return hash2i(Math.floor(x * 1000.37), Math.floor(z * 1000.73), seed);
}

export function valueNoise2(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2i(ix, iz, seed);
  const b = hash2i(ix + 1, iz, seed);
  const c = hash2i(ix, iz + 1, seed);
  const d = hash2i(ix + 1, iz + 1, seed);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2(x, z, octaves = 5, seed = 0, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let pz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(px, pz, seed + i * 101);
    norm += amp;
    // Domain rotation reduces axial grid artifacts
    const nx = px * 0.8 - pz * 0.6;
    const nz = px * 0.6 + pz * 0.8;
    px = nx * lacunarity + 17.3;
    pz = nz * lacunarity - 11.7;
    amp *= gain;
  }
  return sum / norm;
}

export function ridged2(x, z, octaves = 5, seed = 0, lacunarity = 2.08, gain = 0.52) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let pz = z;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(valueNoise2(px, pz, seed + i * 137) * 2.0 - 1.0);
    const sig = n * n * weight;
    weight = clamp(sig * 1.65, 0.2, 1.0);
    sum += amp * sig;
    norm += amp;
    const nx = px * 0.8 - pz * 0.6;
    const nz = px * 0.6 + pz * 0.8;
    px = nx * lacunarity - 9.1;
    pz = nz * lacunarity + 21.4;
    amp *= gain;
  }
  return sum / norm;
}

export function warpedFbm2(x, z, warpScale = 0.85, octaves = 4, seed = 0) {
  const wx = (fbm2(x, z, 3, seed + 19) - 0.5) * warpScale;
  const wz = (fbm2(x + 5.2, z - 1.3, 3, seed + 53) - 0.5) * warpScale;
  return fbm2(x + wx, z + wz, octaves, seed + 97);
}

/**
 * 2D Worley cellular noise returning { f1, f2, edge } without allocations if out is provided.
 */
export function worley2(x, z, seed = 0, out = null) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  let f1 = 8.0;
  let f2 = 8.0;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cz = iz + dz;
      const ox = hash2i(cx, cz, seed + 31);
      const oz = hash2i(cx, cz, seed + 997);
      const vx = dx + ox - fx;
      const vz = dz + oz - fz;
      const d = Math.hypot(vx, vz);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }

  const res = out || { f1: 0, f2: 0, edge: 0 };
  res.f1 = f1;
  res.f2 = f2;
  res.edge = f2 - f1;
  return res;
}

/** Minimum distance from point (px, pz) to segment (ax, az)-(bx, bz), plus segment t in [0,1]. */
export function distToSegment2D(px, pz, ax, az, bx, bz, out = null) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq > 1e-6 ? clamp((apx * abx + apz * abz) / lenSq, 0, 1) : 0;
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  const dist = Math.hypot(dx, dz);
  if (out) {
    out.dist = dist;
    out.t = t;
    out.cx = cx;
    out.cz = cz;
    out.dx = dx;
    out.dz = dz;
    return out;
  }
  return { dist, t, cx, cz, dx, dz };
}

/** Distance & tangent along a polyline of { x, z } points. */
export function distToPolyline2D(px, pz, pts, out = null) {
  let bestDist = 1e9;
  let bestTx = 0;
  let bestTz = 1;
  let bestT = 0;
  const seg = _tmpSeg;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    distToSegment2D(px, pz, a.x, a.z, b.x, b.z, seg);
    if (seg.dist < bestDist) {
      bestDist = seg.dist;
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const sl = Math.hypot(sx, sz) || 1;
      bestTx = sx / sl;
      bestTz = sz / sl;
      bestT = (i + seg.t) / (pts.length - 1);
    }
  }

  const res = out || { dist: 0, tx: 0, tz: 1, t: 0 };
  res.dist = bestDist;
  res.tx = bestTx;
  res.tz = bestTz;
  res.t = bestT;
  return res;
}

const _tmpSeg = { dist: 0, t: 0, cx: 0, cz: 0, dx: 0, dz: 0 };
