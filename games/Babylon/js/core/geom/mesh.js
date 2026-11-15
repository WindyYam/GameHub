// geom/mesh.js — the mesh writer every builder uses, and the geometry utilities (merge, transform, paint ...).
// OWNER: geometry engineer. Public through ctx.geom (see docs/geom.md): geom.writer(), geom.merge(), ...
//
// MeshWriter writes INDEXED, flat-shaded geometry into growable typed arrays: a quad is 4 vertices + 6 indices.
// Optional per-vertex attributes: color (tint multiplier, linear RGB), uv, ao (extra occlusion 0..1 that the
// batcher multiplies into the baked vertex colour).
// Winding: polygons are given COUNTER-CLOCKWISE as seen from outside (three.js front face).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../mathx.js';
import { Earcut } from '../../../node_modules/three/src/extras/Earcut.js';

export class MeshWriter {
  constructor({ verts = 256, indices = 0, color = false, uv = false, ao = false } = {}) {
    this.vcap = Math.max(16, verts); this.icap = Math.max(24, indices || Math.ceil(this.vcap * 1.5));
    this.pos = new Float32Array(this.vcap * 3); this.nor = new Float32Array(this.vcap * 3);
    this.idx = new Uint32Array(this.icap);
    this.col = null; this.uv = null; this.ao = null;
    this.nv = 0; this.ni = 0;
    this.cr = 1; this.cg = 1; this.cb = 1; this.ca = 1; this.cu = 0; this.cv = 0;
    if (color) this.useColor(); if (uv) this.useUV(); if (ao) this.useAO();
  }
  get vertexCount() { return this.nv; }
  get triangleCount() { return this.ni / 3; }
  _growV(n) {
    if (this.nv + n <= this.vcap) return;
    let c = this.vcap; while (c < this.nv + n) c *= 2;
    const grow = (a, size, fill) => { if (!a) return null; const b = new Float32Array(c * size); if (fill !== undefined) b.fill(fill, this.nv * size); b.set(a.subarray(0, this.nv * size)); return b; };
    this.pos = grow(this.pos, 3); this.nor = grow(this.nor, 3); this.col = grow(this.col, 3, 1); this.uv = grow(this.uv, 2); this.ao = grow(this.ao, 1, 1);
    this.vcap = c;
  }
  _growI(n) {
    if (this.ni + n <= this.icap) return;
    let c = this.icap; while (c < this.ni + n) c *= 2;
    const b = new Uint32Array(c); b.set(this.idx.subarray(0, this.ni)); this.idx = b; this.icap = c;
  }
  useColor() { if (!this.col) { this.col = new Float32Array(this.vcap * 3); this.col.fill(1); } return this; }
  useUV() { if (!this.uv) this.uv = new Float32Array(this.vcap * 2); return this; }
  useAO() { if (!this.ao) { this.ao = new Float32Array(this.vcap); this.ao.fill(1); } return this; }
  /** Current tint for the vertices that follow: linear r, g, b multipliers (or one array / THREE.Color / hex). */
  color(r, g, b) {
    if (g === undefined) { const k = toRGB(r); r = k[0]; g = k[1]; b = k[2]; }
    this.useColor(); this.cr = r; this.cg = g; this.cb = b; return this;
  }
  /** Current extra occlusion (0..1, 1 = none) for the vertices that follow. */
  occlusion(a) { if (a !== 1 || this.ao) this.useAO(); this.ca = a; return this; }
  /** One vertex; returns its index. */
  vert(x, y, z, nx, ny, nz, u, v) {
    this._growV(1);
    const i = this.nv++, p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z; this.nor[p] = nx; this.nor[p + 1] = ny; this.nor[p + 2] = nz;
    if (this.col) { this.col[p] = this.cr; this.col[p + 1] = this.cg; this.col[p + 2] = this.cb; }
    if (this.ao) this.ao[i] = this.ca;
    if (this.uv) { this.uv[i * 2] = u === undefined ? this.cu : u; this.uv[i * 2 + 1] = v === undefined ? this.cv : v; }
    return i;
  }
  tri(a, b, c) { this._growI(3); const i = this.ni; this.idx[i] = a; this.idx[i + 1] = b; this.idx[i + 2] = c; this.ni += 3; }
  /** Flat quad a, b, c, d (counter-clockwise seen from outside). Returns the index of its first vertex, or -1 if degenerate. */
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    let ux = cx - ax, uy = cy - ay, uz = cz - az, vx = dx - bx, vy = dy - by, vz = dz - bz;   // diagonals: robust for trapezoids
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) return -1;
    nx /= l; ny /= l; nz /= l;
    return this.quadN(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz);
  }
  /** Quad with a given normal. */
  quadN(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) {
    this._growV(4); this._growI(6);
    const i = this.nv;
    this.vert(ax, ay, az, nx, ny, nz); this.vert(bx, by, bz, nx, ny, nz); this.vert(cx, cy, cz, nx, ny, nz); this.vert(dx, dy, dz, nx, ny, nz);
    const k = this.ni, I = this.idx;
    I[k] = i; I[k + 1] = i + 1; I[k + 2] = i + 2; I[k + 3] = i; I[k + 4] = i + 2; I[k + 5] = i + 3; this.ni += 6;
    return i;
  }
  /** Quad with UVs (u0, v0) at a .. (u1, v1) at c: a = lower left, b = lower right, c = upper right, d = upper left. */
  quadUV(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0, v0, u1, v1) {
    this.useUV();
    const i = this.quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    if (i >= 0) { const U = this.uv, p = i * 2; U[p] = u0; U[p + 1] = v0; U[p + 2] = u1; U[p + 3] = v0; U[p + 4] = u1; U[p + 5] = v1; U[p + 6] = u0; U[p + 7] = v1; }
    return i;
  }
  /** Flat triangle. */
  tri3(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return -1;
    nx /= l; ny /= l; nz /= l;
    const i = this.vert(ax, ay, az, nx, ny, nz); this.vert(bx, by, bz, nx, ny, nz); this.vert(cx, cy, cz, nx, ny, nz);
    this.tri(i, i + 1, i + 2);
    return i;
  }
  /** Array-point conveniences: points are [x, y, z]. */
  quadP(a, b, c, d) { return this.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]); }
  triP(a, b, c) { return this.tri3(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  /** Set the extra occlusion of the 4 vertices of the quad that starts at vertex i (as returned by quad()). */
  quadAO(i, a, b, c, d) { if (i < 0) return; this.useAO(); const A = this.ao; A[i] = a; A[i + 1] = b; A[i + 2] = c; A[i + 3] = d; }
  /**
   * Horizontal polygon (cap). flat = [x0, z0, x1, z1, ...] of the outer ring followed by the holes; holeStarts =
   * vertex index where each hole begins (earcut convention). y: number or (x, z) => y. up: face up or down.
   */
  polygon(flat, holeStarts, y, up = true) {
    const n = flat.length / 2;
    if (n < 3) return;
    const tris = n === 3 && !(holeStarts && holeStarts.length) ? [0, 1, 2] : Earcut.triangulate(flat, holeStarts && holeStarts.length ? holeStarts : null, 2);
    if (!tris.length) return;
    this._growV(n);
    const base = this.nv, fn = typeof y === 'function', ny = up ? 1 : -1;
    for (let i = 0; i < n; i++) this.vert(flat[i * 2], fn ? y(flat[i * 2], flat[i * 2 + 1]) : y, flat[i * 2 + 1], 0, ny, 0);
    this._growI(tris.length);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      // orientation in plan: (b - a) x (c - a) has y = (bz - az)(cx - ax) - (bx - ax)(cz - az)
      const o = (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) - (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]);
      if (o > -1e-7 && o < 1e-7) continue;                 // three points in a line (a door jamb on a wall line, the tips of saw-teeth): no area, no triangle
      if ((o > 0) === up) this.tri(base + a, base + b, base + c); else this.tri(base + a, base + c, base + b);
    }
    if (fn) this._slopeNormals(base, n, up);
  }
  // normals of a non-flat cap: accumulate face normals of the triangles just written
  _slopeNormals(base, n, up) {
    const P = this.pos, N = this.nor, I = this.idx;
    for (let i = base; i < base + n; i++) { N[i * 3] = 0; N[i * 3 + 1] = 0; N[i * 3 + 2] = 0; }
    for (let k = this.ni - 1; k >= 0 && I[k] >= base; k -= 3) {
      const a = I[k - 2] * 3, b = I[k - 1] * 3, c = I[k] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
    }
    for (let i = base; i < base + n; i++) {
      const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      if (l > 1e-12) { N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; } else N[i * 3 + 1] = up ? 1 : -1;
    }
  }
  /** Append another writer (or the arrays of a geometry, see geometryArrays). */
  append(o) {
    const nv = o.nv, ni = o.ni, base = this.nv;
    if (!nv) return this;
    if (o.col) this.useColor(); if (o.uv) this.useUV(); if (o.ao) this.useAO();
    this._growV(nv);
    this.pos.set(o.pos.subarray(0, nv * 3), base * 3); this.nor.set(o.nor.subarray(0, nv * 3), base * 3);
    if (this.col) { if (o.col) this.col.set(o.col.subarray(0, nv * 3), base * 3); else this.col.fill(1, base * 3, (base + nv) * 3); }
    if (this.uv) { if (o.uv) this.uv.set(o.uv.subarray(0, nv * 2), base * 2); else this.uv.fill(0, base * 2, (base + nv) * 2); }
    if (this.ao) { if (o.ao) this.ao.set(o.ao.subarray(0, nv), base); else this.ao.fill(1, base, base + nv); }
    this.nv += nv;
    if (o.idx) { this._growI(ni); const I = this.idx, S = o.idx, k = this.ni; for (let i = 0; i < ni; i++) I[k + i] = S[i] + base; this.ni += ni; }
    else { this._growI(nv); const I = this.idx, k = this.ni; for (let i = 0; i < nv; i++) I[k + i] = base + i; this.ni += nv; }
    return this;
  }
  /** Views of the filled part: { pos, nor, col, uv, ao, idx, nv, ni }. */
  arrays() {
    return { pos: this.pos.subarray(0, this.nv * 3), nor: this.nor.subarray(0, this.nv * 3), col: this.col ? this.col.subarray(0, this.nv * 3) : null,
      uv: this.uv ? this.uv.subarray(0, this.nv * 2) : null, ao: this.ao ? this.ao.subarray(0, this.nv) : null, idx: this.idx.subarray(0, this.ni), nv: this.nv, ni: this.ni };
  }
  /** Indexed BufferGeometry (position, normal and, if used, color / uv / ao). */
  toGeometry() {
    const g = new THREE.BufferGeometry(), a = this.arrays();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos.slice(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.nor.slice(), 3));
    if (a.col) g.setAttribute('color', new THREE.BufferAttribute(a.col.slice(), 3));
    if (a.uv) g.setAttribute('uv', new THREE.BufferAttribute(a.uv.slice(), 2));
    if (a.ao) g.setAttribute('ao', new THREE.BufferAttribute(a.ao.slice(), 1));
    g.setIndex(new THREE.BufferAttribute(a.idx.slice(), 1));
    return g;
  }
}

/** hex | '#rrggbb' | THREE.Color | [r, g, b] (linear) -> linear [r, g, b]. */
export function toRGB(c) {
  if (Array.isArray(c)) return c;
  if (c && c.isColor) return [c.r, c.g, c.b];
  const k = new THREE.Color(c);
  return [k.r, k.g, k.b];
}

const f32 = (attr, size) => {
  if (!attr) return null;
  if (!attr.isInterleavedBufferAttribute && attr.array instanceof Float32Array && !attr.normalized && attr.itemSize === size) return attr.array.subarray(0, attr.count * size);
  const out = new Float32Array(attr.count * size), get = ['getX', 'getY', 'getZ'];
  for (let i = 0; i < attr.count; i++) for (let j = 0; j < size; j++) out[i * size + j] = j < attr.itemSize ? attr[get[j]](i) : 0;
  return out;
};
/** Typed-array views of a BufferGeometry or MeshWriter: { pos, nor, col, uv, ao, idx (or null), nv, ni }. Adds flat normals if missing. */
export function geometryArrays(g) {
  if (g instanceof MeshWriter) return g.arrays();
  const pa = g.attributes.position;
  if (!pa || pa.count === 0) return { pos: new Float32Array(0), nor: new Float32Array(0), col: null, uv: null, ao: null, idx: null, nv: 0, ni: 0 };
  if (!g.attributes.normal) g.computeVertexNormals();
  const nv = pa.count, idx = g.index ? (g.index.array instanceof Uint32Array ? g.index.array.subarray(0, g.index.count) : Uint32Array.from(g.index.array.subarray(0, g.index.count))) : null;
  return { pos: f32(pa, 3), nor: f32(g.attributes.normal, 3), col: f32(g.attributes.color, 3), uv: f32(g.attributes.uv, 2), ao: f32(g.attributes.ao, 1), idx, nv, ni: idx ? idx.length : nv };
}

/** Merge geometries / writers into one indexed geometry (position, normal and, where any input has them, color / uv / ao). Inputs are disposed. */
export function merge(list) {
  const w = new MeshWriter();
  let nv = 0, ni = 0;
  const parts = [];
  for (const g of list) {
    if (!g) continue;
    const a = geometryArrays(g);
    if (!a.nv) continue;
    parts.push(a); nv += a.nv; ni += a.ni;
  }
  w._growV(nv); w._growI(ni);
  for (const a of parts) w.append(a);
  for (const g of list) if (g && g.isBufferGeometry) g.dispose();
  return w.toGeometry();
}

/** Move / rotate / scale a geometry in place: { x, y, z, rotDeg (clockwise seen from above), scale }. */
export function transform(g, { x = 0, y = 0, z = 0, rotDeg = 0, scale = 1 } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rotDeg * M.DEG), new THREE.Vector3(scale, scale, scale));
  g.applyMatrix4(m);
  return g;
}

/** Give a geometry one tint (multiplier on the material colour): hex | THREE.Color | linear [r, g, b]. */
export function paint(g, color) {
  const k = toRGB(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = k[0]; a[i * 3 + 1] = k[1]; a[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Make sure a geometry can be drawn with registry materials: adds normals and a white `color` attribute if missing. */
export function ensureAttributes(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) { const a = new Float32Array(g.attributes.position.count * 3); a.fill(1); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
}

export const triCount = (g) => (g instanceof MeshWriter ? g.ni / 3 : (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3);

/** Flatten rings ([x, z] pairs, open or closed) for MeshWriter.polygon(): { flat, holeStarts }. */
export function flattenRings(ring, holes = []) {
  const flat = [], holeStarts = [];
  const push = (r) => { const o = M.openRing(r); for (const p of o) flat.push(p[0], p[1]); };
  push(ring);
  for (const h of holes) { if (!h || h.length < 3) continue; holeStarts.push(flat.length / 2); push(h); }
  return { flat, holeStarts };
}

/** Value helper: number | array per vertex | function (x, z, s, i). */
export const valAt = (v, x, z, s, i) => (typeof v === 'function' ? v(x, z, s, i) : Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v);

// ------------------------------------------------------------------------------------------ inspection ----
/**
 * Measure a geometry (BufferGeometry or MeshWriter) the way the acceptance rule reads: "closed, non-overlapping
 * shells with correct normals". For module self-checks and for the toolkit's own proof (geom/showcase.js).
 * Returns {
 *   tris, verts, degenerate          triangles, vertices, triangles without area
 *   open, openAbove                  metres of edge that no neighbouring face closes (T-junctions count as closed);
 *                                    openAbove = the part of it more than `baseTol` above the lowest vertex, i.e. NOT the
 *                                    open underside that every shell sunk into the ground has
 *   nonManifold                      edges shared by more than two faces
 *   flipped                          vertices whose stored normal points away from their face (dot < 0)
 *   inward                           true if the signed volume is negative (the shell is inside out; only meaningful when closed)
 *   volume                           signed volume, m3
 *   overlap                          m2 of coplanar faces lying on each other with the same facing (they z-fight)
 *   bbox: [minX, minY, minZ, maxX, maxY, maxZ]
 *   flippedAt, openAt                the first eight offending vertices / edges, to find them
 * }
 * opts: { tol: 1e-3 (weld distance, m), baseTol: 0.02, overlaps: true (skipped above 40,000 triangles) }
 */
export function inspect(g, { tol = 1e-3, baseTol = 0.02, overlaps = true } = {}) {
  const a = geometryArrays(g), P = a.pos, Nn = a.nor, nv = a.nv, I = a.idx, ni = a.ni, nt = ni / 3;
  const out = { tris: nt, verts: nv, degenerate: 0, open: 0, openAbove: 0, nonManifold: 0, flipped: 0, flippedAt: [], openAt: [], inward: false, volume: 0, overlap: 0, bbox: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] };
  if (!nv || !nt) return out;
  // weld by quantised position
  const weld = new Map(), id = new Uint32Array(nv), inv = 1 / tol;
  let nw = 0;
  for (let i = 0; i < nv; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], k = Math.round(x * inv) + ',' + Math.round(y * inv) + ',' + Math.round(z * inv);
    let w = weld.get(k); if (w === undefined) weld.set(k, (w = nw++));
    id[i] = w;
    const b = out.bbox; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
  }
  const first = new Uint32Array(nw).fill(0xffffffff);
  for (let i = 0; i < nv; i++) if (first[id[i]] === 0xffffffff) first[id[i]] = i;
  const edges = new Map(), planes = new Map(), faces = [];
  const ox = (out.bbox[0] + out.bbox[3]) / 2, oy = (out.bbox[1] + out.bbox[4]) / 2, oz = (out.bbox[2] + out.bbox[5]) / 2;
  for (let t = 0; t < nt; t++) {
    const i0 = I ? I[t * 3] : t * 3, i1 = I ? I[t * 3 + 1] : t * 3 + 1, i2 = I ? I[t * 3 + 2] : t * 3 + 2, w0 = id[i0], w1 = id[i1], w2 = id[i2];
    const ax = P[i0 * 3] - ox, ay = P[i0 * 3 + 1] - oy, az = P[i0 * 3 + 2] - oz, bx = P[i1 * 3] - ox, by = P[i1 * 3 + 1] - oy, bz = P[i1 * 3 + 2] - oz, cx = P[i2 * 3] - ox, cy = P[i2 * 3 + 1] - oy, cz = P[i2 * 3 + 2] - oz;
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.hypot(nx, ny, nz);
    const longest = Math.max((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2, (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2);
    if (w0 === w1 || w1 === w2 || w0 === w2 || l < 1e-9 || l < 2e-4 * longest) { out.degenerate++; continue; }
    nx /= l; ny /= l; nz /= l;
    out.volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    if (nt <= 40000) faces.push([ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, w0, w1, w2]);
    for (const i of [i0, i1, i2]) if (Nn[i * 3] * nx + Nn[i * 3 + 1] * ny + Nn[i * 3 + 2] * nz < 0) { out.flipped++; if (out.flippedAt.length < 8) out.flippedAt.push([+P[i * 3].toFixed(2), +P[i * 3 + 1].toFixed(2), +P[i * 3 + 2].toFixed(2)]); }
    for (const [u, v] of [[w0, w1], [w1, w2], [w2, w0]]) {
      const lo = u < v ? u : v, hi = u < v ? v : u, k = lo * nw + hi;
      let e = edges.get(k); if (!e) edges.set(k, (e = [0, 0, lo, hi]));
      if (u < v) e[0]++; else e[1]++;
    }
    if (overlaps && nt <= 40000) {
      const d = nx * ax + ny * ay + nz * az, k = Math.round(nx * 500) + ',' + Math.round(ny * 500) + ',' + Math.round(nz * 500) + ',' + Math.round(d * 200);
      let pl = planes.get(k); if (!pl) planes.set(k, (pl = { n: [nx, ny, nz], tris: [] }));
      pl.tris.push([ax, ay, az, bx, by, bz, cx, cy, cz]);
    }
  }
  out.inward = out.volume < 0;
  // unmatched directed edges; an edge that lies along opposite edges of other faces (a T-junction) is closed
  const loose = [];
  for (const e of edges.values()) {
    if (e[0] + e[1] > 2) out.nonManifold++;
    const n = e[0] - e[1];
    if (!n) continue;
    const p = first[n > 0 ? e[2] : e[3]] * 3, q = first[n > 0 ? e[3] : e[2]] * 3;
    for (let k = Math.abs(n); k > 0; k--) loose.push([P[p], P[p + 1], P[p + 2], P[q], P[q + 1], P[q + 2], e[2], e[3]]);
  }
  const minY = out.bbox[1], S = 6;
  for (let i = 0; i < loose.length; i++) {
    const e = loose[i], dx = e[3] - e[0], dy = e[4] - e[1], dz = e[5] - e[2], len = Math.hypot(dx, dy, dz);
    let uncovered = 0;
    for (let s = 0; s < S; s++) {
      const f = (s + 0.5) / S, x = e[0] + dx * f, y = e[1] + dy * f, z = e[2] + dz * f;
      let hit = false;
      for (let j = 0; j < loose.length && !hit; j++) {
        if (j === i) continue;
        const o = loose[j], ex = o[3] - o[0], ey = o[4] - o[1], ez = o[5] - o[2], el = ex * ex + ey * ey + ez * ez;
        if (ex * dx + ey * dy + ez * dz >= 0) continue;                       // must run the other way
        const u = ((x - o[0]) * ex + (y - o[1]) * ey + (z - o[2]) * ez) / el;
        if (u < -1e-6 || u > 1 + 1e-6) continue;
        const rx = x - (o[0] + ex * u), ry = y - (o[1] + ey * u), rz = z - (o[2] + ez * u);
        if (rx * rx + ry * ry + rz * rz < 4 * tol * tol) hit = true;
      }
      // ... and so is an edge that lies ON another face (a tread against a cheek wall, a floor against a wall)
      for (let t = 0; t < faces.length && !hit; t++) {
        const F = faces[t], d = (x - ox - F[0]) * F[9] + (y - oy - F[1]) * F[10] + (z - oz - F[2]) * F[11];
        if (d > 2 * tol || d < -2 * tol) continue;
        // not a face that owns this edge (both of its ends are corners of the face)
        if ((F[12] === e[6] || F[13] === e[6] || F[14] === e[6]) && (F[12] === e[7] || F[13] === e[7] || F[14] === e[7])) continue;
        let inside = true;
        for (let k = 0; k < 3 && inside; k++) {
          const a0 = k * 3, b0 = ((k + 1) % 3) * 3, ex = F[b0] - F[a0], ey = F[b0 + 1] - F[a0 + 1], ez = F[b0 + 2] - F[a0 + 2], px = x - ox - F[a0], py = y - oy - F[a0 + 1], pz = z - oz - F[a0 + 2];
          // (e x p) . n >= -margin: inside this edge of the face, or on it
          const cxp = (ey * pz - ez * py) * F[9] + (ez * px - ex * pz) * F[10] + (ex * py - ey * px) * F[11];
          if (cxp < -2 * tol * Math.hypot(ex, ey, ez)) inside = false;
        }
        if (inside) hit = true;
      }
      if (!hit) uncovered++;
    }
    const open = (len * uncovered) / S;
    out.open += open;
    if (Math.min(e[1], e[4]) > minY + baseTol) { out.openAbove += open; if (open > 0 && out.openAt.length < 8) out.openAt.push(e.map((q) => +q.toFixed(2))); }
  }
  // coplanar faces with the same facing that lie on each other
  const clip = (poly, ax, ay, bx, by) => {       // keep the part of poly on the left of a -> b
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], sp = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax), sq = (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax);
      if (sp >= 0) res.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const f = sp / (sp - sq); res.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]); }
    }
    return res;
  };
  for (const pl of planes.values()) {
    const m = pl.tris.length; if (m < 2) continue;
    const n = pl.n, ux0 = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0], ul = Math.hypot(ux0[0], ux0[1], ux0[2]) || 1, u = [ux0[0] / ul, ux0[1] / ul, ux0[2] / ul], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const T = pl.tris.map((t) => { const q = []; for (let k = 0; k < 3; k++) q.push([t[k * 3] * u[0] + t[k * 3 + 1] * u[1] + t[k * 3 + 2] * u[2], t[k * 3] * v[0] + t[k * 3 + 1] * v[1] + t[k * 3 + 2] * v[2]]);
      const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]); if (area < 0) q.reverse();
      return { q, bb: [Math.min(q[0][0], q[1][0], q[2][0]), Math.min(q[0][1], q[1][1], q[2][1]), Math.max(q[0][0], q[1][0], q[2][0]), Math.max(q[0][1], q[1][1], q[2][1])] }; });
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
      const A = T[i], B = T[j];
      if (A.bb[0] >= B.bb[2] || B.bb[0] >= A.bb[2] || A.bb[1] >= B.bb[3] || B.bb[1] >= A.bb[3]) continue;
      let poly = A.q;
      for (let k = 0; k < 3 && poly.length; k++) poly = clip(poly, B.q[k][0], B.q[k][1], B.q[(k + 1) % 3][0], B.q[(k + 1) % 3][1]);
      let area = 0;
      for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
      if (area > 2e-4) out.overlap += area / 2;
    }
  }
  for (const k of ['open', 'openAbove', 'volume', 'overlap']) out[k] = +out[k].toFixed(4);
  out.bbox = out.bbox.map((q) => +q.toFixed(3));
  return out;
}
