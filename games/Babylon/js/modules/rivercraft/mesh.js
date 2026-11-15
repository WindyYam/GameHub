// js/modules/rivercraft/mesh.js — a small mesh writer for boat parts (pure JS, no THREE until toGeometry()).
// Everything is written in BOAT-LOCAL coordinates: origin amidships on the waterline, +x starboard, +y up,
// -z the bow (the way the boat travels), +z the stern. Colours are LINEAR rgb triplets (vertex colours of a
// white registry variant). A transform stack places sub-parts; `shade` multiplies a hand-made occlusion term in.
// OWNER: rivercraft.

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { cross, sub, add, mul, dot, len, norm };

/** Affine transforms as { r: [9] row-major, t: [3] }. */
export const X = {
  id: () => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }),
  t: (x, y, z) => ({ r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [x, y, z] }),
  s: (sx, sy = sx, sz = sx) => ({ r: [sx, 0, 0, 0, sy, 0, 0, 0, sz], t: [0, 0, 0] }),
  /** rotation about +y by `deg`, counter-clockwise seen from above looking down -y (three.js rotation.y) */
  ry: (deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { r: [c, 0, s, 0, 1, 0, -s, 0, c], t: [0, 0, 0] }; },
  rx: (deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { r: [1, 0, 0, 0, c, -s, 0, s, c], t: [0, 0, 0] }; },
  rz: (deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { r: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] }; },
  mul(a, b) {                                   // a after b: p -> a(b(p))
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a.r[i * 3] * b.r[j] + a.r[i * 3 + 1] * b.r[3 + j] + a.r[i * 3 + 2] * b.r[6 + j];
    return { r, t: X.pt(a, b.t) };
  },
  /** compose left to right: X.of(X.t(..), X.ry(..), X.s(..)) = translate * rotate * scale */
  of(...list) { let m = list[0]; for (let i = 1; i < list.length; i++) m = X.mul(m, list[i]); return m; },
  pt: (m, p) => [m.r[0] * p[0] + m.r[1] * p[1] + m.r[2] * p[2] + m.t[0], m.r[3] * p[0] + m.r[4] * p[1] + m.r[5] * p[2] + m.t[1], m.r[6] * p[0] + m.r[7] * p[1] + m.r[8] * p[2] + m.t[2]],
  /** direction (no translation); fine for rotations and uniform scales, renormalised by the caller */
  dir: (m, d) => [m.r[0] * d[0] + m.r[1] * d[1] + m.r[2] * d[2], m.r[3] * d[0] + m.r[4] * d[1] + m.r[5] * d[2], m.r[6] * d[0] + m.r[7] * d[1] + m.r[8] * d[2]],
};

export class MB {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.stack = []; this.m = null; this.shade = null; this.det = 1; }
  get verts() { return this.p.length / 3; }
  get tris() { return this.i.length / 3; }
  push(m) { this.stack.push([this.m, this.det]); this.m = this.m ? X.mul(this.m, m) : m; const r = this.m.r; this.det = r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]); return this; }
  pop() { const s = this.stack.pop(); this.m = s[0]; this.det = s[1]; return this; }
  /** one vertex: position, normal, colour ([r, g, b] or (p) => [r, g, b]); returns its index */
  v(p, n, c) {
    let q = p, nn = n;
    if (this.m) {
      q = X.pt(this.m, p);
      // normals: inverse-transpose for non-uniform scale (diagonal scales only are used, so scale each axis by 1/s^2 through the forward matrix)
      nn = this._nrm(n);
    }
    const col = typeof c === 'function' ? c(q) : c, k = this.shade ? this.shade(q[0], q[1], q[2], nn) : 1;
    this.p.push(q[0], q[1], q[2]); this.n.push(nn[0], nn[1], nn[2]); this.c.push(col[0] * k, col[1] * k, col[2] * k);
    return this.p.length / 3 - 1;
  }
  _nrm(n) {
    // cofactor matrix of r applied to n (correct for any affine map), normalised
    const r = this.m.r;
    const c = [r[4] * r[8] - r[5] * r[7], r[5] * r[6] - r[3] * r[8], r[3] * r[7] - r[4] * r[6],
      r[2] * r[7] - r[1] * r[8], r[0] * r[8] - r[2] * r[6], r[1] * r[6] - r[0] * r[7],
      r[1] * r[5] - r[2] * r[4], r[2] * r[3] - r[0] * r[5], r[0] * r[4] - r[1] * r[3]];
    const o = norm([c[0] * n[0] + c[1] * n[1] + c[2] * n[2], c[3] * n[0] + c[4] * n[1] + c[5] * n[2], c[6] * n[0] + c[7] * n[1] + c[8] * n[2]]);
    return this.det < 0 ? [-o[0], -o[1], -o[2]] : o;
  }
  _tri(a, b, c) { if (this.det < 0) this.i.push(a, c, b); else this.i.push(a, b, c); }
  /** flat triangle, counter-clockwise seen from outside */
  tri(a, b, c, col) { const n = norm(cross(sub(b, a), sub(c, a))); const i = this.v(a, n, col), j = this.v(b, n, col), k = this.v(c, n, col); this._tri(i, j, k); return this; }
  /** flat quad a-b-c-d, counter-clockwise seen from outside */
  quad(a, b, c, d, col) {
    let n = cross(sub(b, a), sub(d, a)); if (len(n) < 1e-9) n = cross(sub(c, b), sub(d, b)); n = norm(n);
    const i = this.v(a, n, col), j = this.v(b, n, col), k = this.v(c, n, col), l = this.v(d, n, col);
    this._tri(i, j, k); this._tri(i, k, l); return this;
  }
  /** convex polygon (points counter-clockwise seen from outside) as a fan */
  poly(pts, col) { const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))); const id = pts.map((p) => this.v(p, n, col)); for (let k = 1; k < id.length - 1; k++) this._tri(id[0], id[k], id[k + 1]); return this; }
  /** axis-aligned box centred at (cx, cy, cz); `skip` = string of faces to leave out: any of 'x X y Y z Z' (lower = negative side) */
  box(cx, cy, cz, sx, sy, sz, col, skip = '') {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    if (!skip.includes('Y')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], col);
    if (!skip.includes('y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
    if (!skip.includes('X')) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], col);
    if (!skip.includes('x')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
    if (!skip.includes('Z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);
    if (!skip.includes('z')) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], col);
    return this;
  }
  /** rectangular bar from a to b, w across (sideways), h in the `up` sense; caps optional */
  bar(a, b, w, h, col, up = [0, 1, 0], caps = true) {
    const d = norm(sub(b, a));
    let s = cross(d, up); if (len(s) < 1e-6) s = cross(d, [1, 0, 0]); s = norm(s);
    const u = norm(cross(s, d));
    const c = (p, i, j) => add(add(p, mul(s, i * w / 2)), mul(u, j * h / 2));
    const A = [c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1)], B = [c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)];
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; this.quad(A[k], B[k], B[k2], A[k2], col); }
    if (caps) { this.quad(A[0], A[1], A[2], A[3], col); this.quad(B[3], B[2], B[1], B[0], col); }
    return this;
  }
  /**
   * Rectangular section swept along a path. `side` = the direction the width lies in (a vector or (i) => vector); the
   * height is perpendicular to path and side. Normals are smooth along the path, hard across the four edges.
   * opts: { caps: true, w1, h1 (taper to these at the far end) }
   */
  sweep(pts, w, h, col, side = [1, 0, 0], opts = {}) {
    const n = pts.length, rings = [], S = [], U = [];
    for (let i = 0; i < n; i++) {
      const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      let s = typeof side === 'function' ? side(i) : side; s = norm(sub(s, mul(t, dot(s, t))));
      const u = norm(cross(s, t)), k = n > 1 ? i / (n - 1) : 0, ww = (opts.w1 !== undefined ? w + (opts.w1 - w) * k : w) / 2, hh = (opts.h1 !== undefined ? h + (opts.h1 - h) * k : h) / 2;
      const c = (a, b) => add(add(pts[i], mul(s, a * ww)), mul(u, b * hh));
      rings.push([c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)]); S.push(s); U.push(u);
    }
    const faceN = (i, k) => (k === 0 ? mul(U[i], -1) : k === 1 ? S[i] : k === 2 ? U[i] : mul(S[i], -1));
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4; let prev = null;
      for (let i = 0; i < n; i++) {
        const nn = faceN(i, k), a = this.v(rings[i][k], nn, col), b = this.v(rings[i][k2], nn, col);
        // faces wind so that (path) x (around) points out: checked against u = s x t
        if (prev) { this._tri(prev[0], b, prev[1]); this._tri(prev[0], a, b); }
        prev = [a, b];
      }
    }
    if (opts.caps !== false && n > 1) { const A = rings[0], B = rings[n - 1]; this.quad(A[0], A[1], A[2], A[3], col); this.quad(B[3], B[2], B[1], B[0], col); }
    return this;
  }
  /** round tube along a path; r = number or (i, k 0..1) => radius; smooth normals; opts: { caps: true, capCol } */
  tube(pts, r, sides, col, opts = {}) {
    const n = pts.length; let up = opts.up || [0, 1, 0]; let prevRing = null;
    const first = norm(sub(pts[1], pts[0]));
    if (Math.abs(dot(first, up)) > 0.9) up = [1, 0, 0];
    let s = norm(cross(first, up));
    const rings = [];
    for (let i = 0; i < n; i++) {
      const t = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
      s = norm(sub(s, mul(t, dot(s, t))));                           // parallel transport
      const u = cross(t, s), rad = typeof r === 'function' ? r(i, n > 1 ? i / (n - 1) : 0) : r, ring = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2, nn = add(mul(s, Math.cos(a)), mul(u, Math.sin(a)));
        ring.push(this.v(add(pts[i], mul(nn, rad)), nn, col));
      }
      if (prevRing) for (let k = 0; k < sides; k++) { this._tri(prevRing[k], ring[k + 1], ring[k]); this._tri(prevRing[k], prevRing[k + 1], ring[k + 1]); }
      prevRing = ring; rings.push({ t, s, u, rad });
    }
    if (opts.caps !== false) {
      for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
        const g = rings[i]; if (g.rad < 1e-4) continue;
        const nn = mul(g.t, sgn), cc = opts.capCol || col, c0 = this.v(pts[i], nn, cc), ids = [];
        for (let k = 0; k <= sides; k++) { const a = (k / sides) * Math.PI * 2; ids.push(this.v(add(pts[i], mul(add(mul(g.s, Math.cos(a)), mul(g.u, Math.sin(a))), g.rad)), nn, cc)); }
        for (let k = 0; k < sides; k++) { if (sgn > 0) this._tri(c0, ids[k], ids[k + 1]); else this._tri(c0, ids[k + 1], ids[k]); }
      }
    }
    return this;
  }
  /**
   * Parametric surface f(u, v) -> [x, y, z] on an (nu + 1) x (nv + 1) grid, smooth normals from the grid.
   * The front face is du x dv; `flip` turns it over. col: [r, g, b] or (u, v, p) => [r, g, b].
   */
  surf(nu, nv, f, col, opts = {}) {
    const P = [], flip = !!opts.flip;
    for (let i = 0; i <= nu; i++) { const row = []; for (let j = 0; j <= nv; j++) row.push(f(i / nu, j / nv, i, j)); P.push(row); }
    const id = [];
    for (let i = 0; i <= nu; i++) {
      const row = [];
      for (let j = 0; j <= nv; j++) {
        const du = sub(P[Math.min(nu, i + 1)][j], P[Math.max(0, i - 1)][j]), dv = sub(P[i][Math.min(nv, j + 1)], P[i][Math.max(0, j - 1)]);
        let nn = cross(du, dv);
        if (len(nn) < 1e-10) {                                       // a pole or a pinched edge: borrow the neighbour's
          const i2 = i === 0 ? 1 : i === nu ? nu - 1 : i, j2 = j === 0 ? 1 : j === nv ? nv - 1 : j;
          nn = cross(sub(P[Math.min(nu, i2 + 1)][j2], P[Math.max(0, i2 - 1)][j2]), sub(P[i2][Math.min(nv, j2 + 1)], P[i2][Math.max(0, j2 - 1)]));
        }
        nn = norm(nn); if (flip) nn = mul(nn, -1);
        const c = typeof col === 'function' ? col(i / nu, j / nv, P[i][j]) : col;
        row.push(this.v(P[i][j], nn, c));
      }
      id.push(row);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = id[i][j], b = id[i + 1][j], c = id[i + 1][j + 1], d = id[i][j + 1];
      if (flip) { this._tri(a, c, b); this._tri(a, d, c); } else { this._tri(a, b, c); this._tri(a, c, d); }
    }
    return this;
  }
  /**
   * Solid of revolution about the local y axis. profile: [[r, y], ...] listed from the BOTTOM up. Normals point
   * away from the axis; { inside: true } turns the surface over (the inner wall of a bowl; capBottom is then its floor).
   * opts: { capBottom, capTop (close with a disc), inside, capCol }
   */
  lathe(profile, sides, col, opts = {}) {
    const inside = !!opts.inside, m = profile.length - 1;
    const wob = opts.wob || null;                    // (angle, y) => factor on the radius: hand-made things are never round
    this.surf(sides, m, (u, v, i, j) => { const a = -(i % sides) / sides * Math.PI * 2, r = profile[j][0] * (wob ? wob(a, profile[j][1]) : 1); return [Math.cos(a) * r, profile[j][1], Math.sin(a) * r]; }, typeof col === 'function' ? (u, v, p) => col(p) : col, { flip: inside });
    const disc = (r, y, up, cc) => {
      const nn = [0, up ? 1 : -1, 0], c0 = this.v([0, y, 0], nn, cc), ids = [];
      for (let k = 0; k <= sides; k++) { const a = -(k / sides) * Math.PI * 2; ids.push(this.v([Math.cos(a) * r, y, Math.sin(a) * r], nn, cc)); }
      for (let k = 0; k < sides; k++) { if (up) this._tri(c0, ids[k], ids[k + 1]); else this._tri(c0, ids[k + 1], ids[k]); }
    };
    const cc = opts.capCol || (typeof col === 'function' ? col([0, 0, 0]) : col);
    if (opts.capBottom) { const q = profile[0]; disc(q[0], q[1], inside, cc); }
    if (opts.capTop) { const q = profile[m]; disc(q[0], q[1], !inside, cc); }
    return this;
  }
  /** an ellipsoid-like lump (sacks, skins, heaps): radii rx, ry, rz; `flat` 0..1 squares it off; only the part above yCut (relative, -1..1) */
  blob(c, rx, ry, rz, col, opts = {}) {
    const nu = opts.nu || 8, nv = opts.nv || 5, e = opts.square || 1, v0 = opts.from ?? 0;     // v0: start latitude 0 (bottom pole) .. 1
    const sp = (x) => Math.sign(x) * Math.pow(Math.abs(x), e);
    this.surf(nu, nv, (u, v) => { const a = -u * Math.PI * 2, b = (v0 + (1 - v0) * v) * Math.PI - Math.PI / 2, cb = Math.cos(b); return [c[0] + rx * sp(Math.cos(a)) * sp(cb), c[1] + ry * sp(Math.sin(b)), c[2] + rz * sp(Math.sin(a)) * sp(cb)]; }, col);
    return this;
  }
  /** append another writer (already in the same space), optionally through a transform */
  append(o, m = null) {
    const base = this.verts;
    if (!m && !this.m) { for (const x of o.p) this.p.push(x); for (const x of o.n) this.n.push(x); for (const x of o.c) this.c.push(x); for (const x of o.i) this.i.push(x + base); return this; }
    if (m) this.push(m);
    const sh = this.shade; this.shade = null;
    for (let k = 0; k < o.verts; k++) this.v([o.p[k * 3], o.p[k * 3 + 1], o.p[k * 3 + 2]], [o.n[k * 3], o.n[k * 3 + 1], o.n[k * 3 + 2]], [o.c[k * 3], o.c[k * 3 + 1], o.c[k * 3 + 2]]);
    for (let k = 0; k < o.i.length; k += 3) this._tri(o.i[k] + base, o.i[k + 1] + base, o.i[k + 2] + base);
    this.shade = sh;
    if (m) this.pop();
    return this;
  }
  /** multiply every colour by k(x, y, z) (a baked occlusion term applied after the fact) */
  occlude(fn) { for (let k = 0; k < this.verts; k++) { const f = fn(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2], this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2]); this.c[k * 3] *= f; this.c[k * 3 + 1] *= f; this.c[k * 3 + 2] *= f; } return this; }
  toGeometry(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setIndex(new THREE.BufferAttribute(this.verts > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** A set of writers, one per material slot. */
export function makeParts(slots = ['hull', 'wood', 'mat', 'clay', 'cloth']) {
  const parts = {}; for (const s of slots) parts[s] = new MB();
  parts.slots = slots;
  parts.push = (m) => { for (const s of slots) parts[s].push(m); };
  parts.pop = () => { for (const s of slots) parts[s].pop(); };
  parts.tris = () => slots.reduce((n, s) => n + parts[s].tris, 0);
  return parts;
}
