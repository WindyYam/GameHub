// mathx.js — pure math helpers shared by every subsystem and module. No THREE dependency, no state.
// Conventions (ENGINE.md section 1): plan coordinates are [x, z] with +x grid east, +z grid south.
// "Clockwise" always means clockwise seen from above with grid north (-z) up.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => c + (d - c) * clamp(invLerp(a, b, v));
/** smoothstep that also works with a > b (falling edge). */
export function smoothstep(a, b, v) {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
}
export const smootherstep = (k) => { k = clamp(k); return k * k * k * (k * (k * 6 - 15) + 10); };
export const easeInOut = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
export const mod = (a, n) => ((a % n) + n) % n;
/** shortest signed angular difference b - a in degrees, in (-180, 180]. */
export const angleDiffDeg = (a, b) => { const d = mod(b - a + 180, 360) - 180; return d === -180 ? 180 : d; };
export const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ---------------------------------------------------------------------------------------------
// Azimuth / rotation conventions
// ---------------------------------------------------------------------------------------------

/** Unit plan direction [dx, dz] of a model azimuth (0 = -z = grid north, 90 = +x = grid east, clockwise). */
export const azToDir = (azDeg) => [Math.sin(azDeg * DEG), -Math.cos(azDeg * DEG)];
/** Model azimuth in degrees [0, 360) of a plan direction. */
export const dirToAz = (dx, dz) => mod(Math.atan2(dx, -dz) * RAD, 360);
/** Direction TO a body at model azimuth az and elevation el: [x, y, z] (SPEC section 1). */
export function dirFromAzEl(azDeg, elDeg) {
  const a = azDeg * DEG, e = elDeg * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
/** Rotate a local plan offset (lx, lz) by rotationDeg CLOCKWISE seen from above. three.js: rotation.y = -rotationDeg*DEG. */
export function rotateXZ(lx, lz, rotationDeg) {
  const c = Math.cos(rotationDeg * DEG), s = Math.sin(rotationDeg * DEG);
  return [lx * c - lz * s, lx * s + lz * c];
}
/** Local frame (centre [cx, cz], rotationDeg clockwise) to world plan coordinates. */
export function localToWorld(center, rotationDeg, lx, lz) {
  const r = rotateXZ(lx, lz, rotationDeg);
  return [center[0] + r[0], center[1] + r[1]];
}
export function worldToLocal(center, rotationDeg, x, z) {
  return rotateXZ(x - center[0], z - center[1], -rotationDeg);
}
/** Right-hand normal of a plan direction seen from above (travelling north, right is east). */
export const rightOf = (dx, dz) => [-dz, dx];

// ---------------------------------------------------------------------------------------------
// Polylines and polygons ([x, z] pairs; rings may be closed by a repeated first vertex)
// ---------------------------------------------------------------------------------------------

export const isClosedRing = (r) => r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
/** Ring without the repeated closing vertex. */
export const openRing = (r) => (isClosedRing(r) ? r.slice(0, -1) : r.slice());
/** Ring with the repeated closing vertex (world.json convention). */
export const closeRing = (r) => (isClosedRing(r) ? r.slice() : [...r, [r[0][0], r[0][1]]]);

/** Signed area. POSITIVE = clockwise seen from above (north up); negative = counter-clockwise. */
export function polygonArea(ring) {
  const r = openRing(ring); let a = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export const isClockwise = (ring) => polygonArea(ring) > 0;
export function polygonCentroid(ring) {
  const r = openRing(ring); let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) { let sx = 0, sz = 0; for (const p of r) { sx += p[0]; sz += p[1]; } return [sx / r.length, sz / r.length]; }
  return [cx / (3 * a), cz / (3 * a)];
}
/** [minX, minZ, maxX, maxZ] */
export function bbox(points) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of points) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}
export const inBBox = (bb, x, z, pad = 0) => x >= bb[0] - pad && x <= bb[2] + pad && z >= bb[1] - pad && z <= bb[3] + pad;

/** Even-odd point-in-polygon test (ring open or closed). */
export function pointInPolygon(x, z, ring) {
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Distance from (x, z) to segment a-b; returns [dist, t (0..1 along a-b)]. */
export function distToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / l2) : 0;
  const px = ax + dx * t, pz = az + dz * t;
  return [Math.hypot(x - px, z - pz), t];
}
/**
 * Nearest point on a polyline.
 * @returns {{dist:number, i:number, t:number, s:number, x:number, z:number, dir:[number,number], side:number}}
 *   i = segment index, t = 0..1 on that segment, s = chainage in metres from the first vertex,
 *   dir = unit direction of the segment, side = +1 if the query point lies to the RIGHT of travel, -1 left.
 */
export function nearestOnPolyline(x, z, pl) {
  let best = { dist: Infinity, i: 0, t: 0, s: 0, x: pl[0][0], z: pl[0][1], dir: [1, 0], side: 1 };
  let acc = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1];
    const len = Math.hypot(bx - ax, bz - az);
    const [d, t] = distToSegment(x, z, ax, az, bx, bz);
    if (d < best.dist) {
      const dx = len > 0 ? (bx - ax) / len : 1, dz = len > 0 ? (bz - az) / len : 0;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const cross = dx * (z - pz) - dz * (x - px); // > 0: point to the right of travel (seen from above)
      best = { dist: d, i, t, s: acc + len * t, x: px, z: pz, dir: [dx, dz], side: cross >= 0 ? 1 : -1 };
    }
    acc += len;
  }
  return best;
}
export const distToPolyline = (x, z, pl) => nearestOnPolyline(x, z, pl).dist;
/** Distance to the boundary of a ring (always >= 0). */
export function distToRing(x, z, ring) {
  let best = Infinity;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const d = distToSegment(x, z, ring[j][0], ring[j][1], ring[i][0], ring[i][1])[0];
    if (d < best) best = d;
  }
  return best;
}
/** Signed distance to a polygon boundary: NEGATIVE inside, positive outside. */
export function signedDistToPolygon(x, z, ring) {
  const d = distToRing(x, z, ring);
  return pointInPolygon(x, z, ring) ? -d : d;
}
export function polylineLength(pl) {
  let l = 0; for (let i = 0; i < pl.length - 1; i++) l += Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]);
  return l;
}
/** Cumulative chainage of each vertex. */
export function chainage(pl) {
  const s = [0]; for (let i = 1; i < pl.length; i++) s.push(s[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
  return s;
}
/**
 * Point at chainage s (metres) along a polyline.
 * @returns {{x:number, z:number, dir:[number,number], i:number, t:number}}
 */
export function pointAlong(pl, s) {
  let acc = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1];
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= acc + len || i === pl.length - 2) {
      const t = len > 0 ? clamp((s - acc) / len) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dir: len > 0 ? [(bx - ax) / len, (bz - az) / len] : [1, 0], i, t };
    }
    acc += len;
  }
  return { x: pl[0][0], z: pl[0][1], dir: [1, 0], i: 0, t: 0 };
}
/** Interpolate a per-vertex value array at a nearestOnPolyline()/pointAlong() result. */
export const valueAlong = (values, hit) => lerp(values[hit.i], values[Math.min(hit.i + 1, values.length - 1)], hit.t);
/** Points every `step` metres along a polyline (always includes both ends and every original vertex). */
export function resamplePolyline(pl, step) {
  const out = [];
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pl[pl.length - 1].slice(0, 2));
  return out;
}
/**
 * Offset a polyline sideways with mitred joints. offset > 0 = to the RIGHT of the direction of travel
 * (seen from above), < 0 = left. `closed` treats the polyline as a ring (give it WITHOUT the repeated vertex).
 */
export function offsetPolyline(pl, offset, closed = false) {
  const n = pl.length, out = [];
  const segDir = (i) => {
    const a = pl[mod(i, n)], b = pl[mod(i + 1, n)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  for (let i = 0; i < n; i++) {
    let d0, d1;
    if (closed) { d0 = segDir(i - 1); d1 = segDir(i); }
    else { d0 = i > 0 ? segDir(i - 1) : segDir(0); d1 = i < n - 1 ? segDir(i) : segDir(n - 2); }
    const n0 = rightOf(d0[0], d0[1]), n1 = rightOf(d1[0], d1[1]);
    let mx = n0[0] + n1[0], mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n0[0]; mz = n0[1]; } else { mx /= ml; mz /= ml; }
    const cos = Math.max(0.25, mx * n0[0] + mz * n0[1]); // mitre limit 4x
    out.push([pl[i][0] + (mx * offset) / cos, pl[i][1] + (mz * offset) / cos]);
  }
  return out;
}
/** Rectangle ring (closed) from centre, size [sx, sz] and clockwise rotation. */
export function rectRing(cx, cz, sx, sz, rotationDeg = 0) {
  const h = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]];
  const r = h.map(([lx, lz]) => localToWorld([cx, cz], rotationDeg, lx, lz));
  r.push(r[0].slice());
  return r;
}

// ---------------------------------------------------------------------------------------------
// Splines
// ---------------------------------------------------------------------------------------------

/**
 * Centripetal Catmull-Rom (alpha 0.5) through an array of n-dimensional points.
 * `before` / `after` are the outer tangent neighbours (optional; mirrored if absent).
 * u in [0, 1] maps EVENLY over the segments (segment k covers [k/m, (k+1)/m]).
 */
export function catmullRom(points, u, before = null, after = null, alpha = 0.5) {
  const m = points.length - 1;
  if (m <= 0) return points[0].slice();
  const f = clamp(u) * m, k = Math.min(Math.floor(f), m - 1), t = f - k;
  const p1 = points[k], p2 = points[k + 1];
  const mirror = (a, b) => a.map((v, i) => 2 * v - b[i]);
  const p0 = k > 0 ? points[k - 1] : (before || mirror(p1, p2));
  const p3 = k < m - 1 ? points[k + 2] : (after || mirror(p2, p1));
  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.pow(Math.max(s, 1e-12), alpha / 2); };
  const t0 = 0, t1 = t0 + dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out = new Array(p1.length);
  for (let i = 0; i < p1.length; i++) {
    const A1 = ((t1 - tt) / (t1 - t0)) * p0[i] + ((tt - t0) / (t1 - t0)) * p1[i];
    const A2 = ((t2 - tt) / (t2 - t1)) * p1[i] + ((tt - t1) / (t2 - t1)) * p2[i];
    const A3 = ((t3 - tt) / (t3 - t2)) * p2[i] + ((tt - t2) / (t3 - t2)) * p3[i];
    const B1 = ((t2 - tt) / (t2 - t0)) * A1 + ((tt - t0) / (t2 - t0)) * A2;
    const B2 = ((t3 - tt) / (t3 - t1)) * A2 + ((tt - t1) / (t3 - t1)) * A3;
    out[i] = ((t2 - tt) / (t2 - t1)) * B1 + ((tt - t1) / (t2 - t1)) * B2;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Low-discrepancy sequences (sub-frame jitter)
// ---------------------------------------------------------------------------------------------
export function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
