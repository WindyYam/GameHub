// js/modules/dressing/kit.js — a small prototype builder for props: four material slots, a transform stack,
// per-vertex colour with a "role" (fixed / tinted per instance / accent per instance), and a handful of
// primitives that are closed where they stand on something and auto-oriented (every triangle is wound to agree
// with its vertex normals, so no builder has to think about handedness).
// Local frame of a prop: y up, origin on the surface it stands on, -z is its BACK (the wall side), +z its front.
// Rotation `ry` is CLOCKWISE seen from above in degrees, like rotDeg everywhere in the engine.

export const SLOT = { REED: 0, CLAY: 1, WOOD: 2, CLOTH: 3 };
const DEG = Math.PI / 180;

/** Stateless hash -> [0, 1) for vertex noise (a copy of rng.hash2's mixing, kept local so the kit has no imports). */
export function hsh(i, j, seed = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export class PB {
  constructor() {
    this.s = [0, 1, 2, 3].map(() => ({ pos: [], nor: [], col: [], role: [], idx: [] }));
    this.cur = this.s[0];
    this.c = [1, 1, 1]; this.r = 0;
    this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.t = [0, 0, 0]; this.k = 1;
    this.stack = [];
  }
  slot(i) { this.cur = this.s[i]; return this; }
  /** Current colour: linear [r, g, b] x k; role 0 fixed, 1 multiplied by the instance tint, 2 = shade of the instance accent. */
  col(c, k = 1, role = 0) { this.c = [c[0] * k, c[1] * k, c[2] * k]; this.r = role; return this; }
  /** Enter a child frame: translate, then rotate (ry clockwise from above, rx tips the top toward +z, rz toward +x), then scale. */
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    this.stack.push([this.m, this.t, this.k]);
    const m = this.m, t = this.t;
    const cy = Math.cos(ry * DEG), sy = Math.sin(ry * DEG), cx = Math.cos(rx * DEG), sx = Math.sin(rx * DEG), cz = Math.cos(rz * DEG), sz = Math.sin(rz * DEG);
    // R = Ry * Rx * Rz, with  Ry: x' = c x - s z, z' = s x + c z;  Rx: y' = c y - s z, z' = s y + c z;  Rz: x' = c x + s y, y' = -s x + c y
    const Rz = [cz, sz, 0, -sz, cz, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, -sy, 0, 1, 0, sy, 0, cy];
    const R = mul3(Ry, mul3(Rx, Rz));
    this.t = [t[0] + m[0] * x + m[1] * y + m[2] * z, t[1] + m[3] * x + m[4] * y + m[5] * z, t[2] + m[6] * x + m[7] * y + m[8] * z];
    this.m = mul3(m, R).map((v) => v * s);
    this.k = this.k * s;
    return this;
  }
  pop() { const q = this.stack.pop(); this.m = q[0]; this.t = q[1]; this.k = q[2]; return this; }
  /** Add a vertex (local position and unit normal); returns its index in the current slot. */
  v(x, y, z, nx, ny, nz) {
    const m = this.m, t = this.t, b = this.cur, k = 1 / this.k;
    b.pos.push(t[0] + m[0] * x + m[1] * y + m[2] * z, t[1] + m[3] * x + m[4] * y + m[5] * z, t[2] + m[6] * x + m[7] * y + m[8] * z);
    b.nor.push((m[0] * nx + m[1] * ny + m[2] * nz) * k, (m[3] * nx + m[4] * ny + m[5] * nz) * k, (m[6] * nx + m[7] * ny + m[8] * nz) * k);
    b.col.push(this.c[0], this.c[1], this.c[2]); b.role.push(this.r);
    return b.pos.length / 3 - 1;
  }
  /** Triangle wound to agree with its vertex normals. */
  tri(a, b, c) {
    const P = this.cur.pos, N = this.cur.nor, A = a * 3, B = b * 3, C = c * 3;
    const ux = P[B] - P[A], uy = P[B + 1] - P[A + 1], uz = P[B + 2] - P[A + 2], vx = P[C] - P[A], vy = P[C + 1] - P[A + 1], vz = P[C + 2] - P[A + 2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const d = gx * (N[A] + N[B] + N[C]) + gy * (N[A + 1] + N[B + 1] + N[C + 1]) + gz * (N[A + 2] + N[B + 2] + N[C + 2]);
    if (d >= 0) this.cur.idx.push(a, b, c); else this.cur.idx.push(a, c, b);
  }
  quadI(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  /** Flat quad through four local points (in order round the quad), facing the side of the hint vector (ox, oy, oz). */
  quad(p0, p1, p2, p3, ox, oy, oz) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz), b = this.v(p1[0], p1[1], p1[2], nx, ny, nz), c = this.v(p2[0], p2[1], p2[2], nx, ny, nz), d = this.v(p3[0], p3[1], p3[2], nx, ny, nz);
    this.quadI(a, b, c, d);
  }
  /** Flat triangle facing the hint. */
  tri3(p0, p1, p2, ox, oy, oz) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    this.tri(this.v(p0[0], p0[1], p0[2], nx, ny, nz), this.v(p1[0], p1[1], p1[2], nx, ny, nz), this.v(p2[0], p2[1], p2[2], nx, ny, nz));
    return this;
  }

  /** Box: centre (x, z), base y, size sx / sy / sz; opt: { top: scale of the top face (taper), bottom: false, ry } */
  box(x, y, z, sx, sy, sz, opt = {}) {
    const tp = opt.top ?? 1, hx = sx / 2, hz = sz / 2, y1 = y + sy;
    if (opt.ry) this.push(x, 0, z, opt.ry); else this.push(x, 0, z);
    const b = [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]], t = b.map((p) => [p[0] * tp, y1, p[2] * tp]);
    if (opt.cap !== false) this.quad(t[0], t[1], t[2], t[3], 0, 1, 0);
    if (opt.bottom) this.quad(b[0], b[1], b[2], b[3], 0, -1, 0);
    this.quad(b[0], b[1], t[1], t[0], 0, 0, -1); this.quad(b[1], b[2], t[2], t[1], 1, 0, 0);
    this.quad(b[2], b[3], t[3], t[2], 0, 0, 1); this.quad(b[3], b[0], t[0], t[3], -1, 0, 0);
    this.pop();
    return this;
  }
  /** One quad facing up at height y: centre (x, z), size w x d, turned ry (the crude level of everything flat). */
  top(x, z, w, d, y, ry = 0) { this.push(x, 0, z, ry); this.quad([-w / 2, y, -d / 2], [w / 2, y, -d / 2], [w / 2, y, d / 2], [-w / 2, y, d / 2], 0, 1, 0); this.pop(); return this; }
  /** Flat slab lying on the surface (a mat): top and four sides, from -skirt to t. */
  slab(x, z, w, d, t, opt = {}) { return this.box(x, -(opt.skirt ?? 0), z, w, t + (opt.skirt ?? 0), d, opt); }

  /** n-sided tube (frustum) from a to b with radii r0, r1; smooth for n >= 5, faceted below. caps: [atA, atB] */
  tube(a, b, r0, r1 = r0, n = 6, caps = [false, true]) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    // a basis across the axis
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 1; uy = 0; uz = 0; }
    const dot = ux * dx + uy * dy + uz * dz; ux -= dot * dx; uy -= dot * dy; uz -= dot * dz;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const ring = (p, r, i) => { const th = (i / n) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); return [p[0] + r * (c * ux + s * vx), p[1] + r * (c * uy + s * vy), p[2] + r * (c * uz + s * vz), c * ux + s * vx, c * uy + s * vy, c * uz + s * vz]; };
    if (n >= 5) {
      const A = [], B = [];
      for (let i = 0; i < n; i++) { const p = ring(a, r0, i), q = ring(b, r1, i); A.push(this.v(p[0], p[1], p[2], p[3], p[4], p[5])); B.push(this.v(q[0], q[1], q[2], q[3], q[4], q[5])); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.quadI(A[i], A[j], B[j], B[i]); }
    } else {
      for (let i = 0; i < n; i++) {
        const p0 = ring(a, r0, i), p1 = ring(a, r0, i + 1), q0 = ring(b, r1, i), q1 = ring(b, r1, i + 1);
        this.quad(p0, p1, q1, q0, p0[3] + p1[3], p0[4] + p1[4], p0[5] + p1[5]);
      }
    }
    for (const [on, p, r, sg] of [[caps[0], a, r0, -1], [caps[1], b, r1, 1]]) {
      if (!on || r <= 0) continue;
      const c = this.v(p[0], p[1], p[2], sg * dx, sg * dy, sg * dz), R = [];
      for (let i = 0; i < n; i++) { const q = ring(p, r, i); R.push(this.v(q[0], q[1], q[2], sg * dx, sg * dy, sg * dz)); }
      for (let i = 0; i < n; i++) this.tri(c, R[i], R[(i + 1) % n]);
    }
    return this;
  }
  /** Tube along a polyline of points with one radius (ropes, bent poles). */
  rope(pts, r, n = 4) { for (let i = 0; i + 1 < pts.length; i++) this.tube(pts[i], pts[i + 1], r, r, n, [i === 0, i + 2 === pts.length]); return this; }

  /**
   * Surface of revolution about the local y axis: profile = [[r, y], ...] from the foot up, n sides, smooth.
   * opt: { ex, ez: elliptical scale; capTop: colour k (number) of a disc closing the last ring, or false; capBottom; shade: (j) => k per ring }
   */
  lathe(profile, n, opt = {}) {
    const ex = opt.ex ?? 1, ez = opt.ez ?? 1, m = profile.length, rings = [], base = this.c;
    for (let j = 0; j < m; j++) {
      const p = profile[j], a = profile[Math.max(0, j - 1)], b = profile[Math.min(m - 1, j + 1)];
      let tr = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tr, ty) || 1; tr /= tl; ty /= tl;
      const nr = ty, ny = -tr, ring = [];
      if (opt.shade) this.c = [base[0] * opt.shade(j), base[1] * opt.shade(j), base[2] * opt.shade(j)];
      if (p[0] < 1e-6) { ring.push(this.v(0, p[1], 0, 0, ny >= 0 ? 1 : -1, 0)); rings.push(ring); continue; }
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        let nx = nr * c / ex, nz = nr * s / ez, nn = ny; const l = Math.hypot(nx, nn, nz) || 1;
        ring.push(this.v(p[0] * c * ex, p[1], p[0] * s * ez, nx / l, nn / l, nz / l));
      }
      rings.push(ring);
    }
    this.c = base;
    for (let j = 0; j + 1 < m; j++) {
      const A = rings[j], B = rings[j + 1];
      for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n;
        if (A.length === 1 && B.length === 1) continue;
        if (A.length === 1) this.tri(A[0], B[i], B[i1]);
        else if (B.length === 1) this.tri(A[i], A[i1], B[0]);
        else this.quadI(A[i], A[i1], B[i1], B[i]);
      }
    }
    const cap = (j, sg, k) => {
      const p = profile[j]; if (p[0] < 1e-6) return;
      const keep = this.c; this.c = [keep[0] * k, keep[1] * k, keep[2] * k];
      const c = this.v(0, p[1], 0, 0, sg, 0), R = [];
      for (let i = 0; i < n; i++) { const th = (i / n) * Math.PI * 2; R.push(this.v(p[0] * Math.cos(th) * ex, p[1], p[0] * Math.sin(th) * ez, 0, sg, 0)); }
      for (let i = 0; i < n; i++) this.tri(c, R[i], R[(i + 1) % n]);
      this.c = keep;
    };
    if (opt.capTop !== undefined && opt.capTop !== false) cap(m - 1, 1, opt.capTop === true ? 1 : opt.capTop);
    if (opt.capBottom) cap(0, -1, 1);
    return this;
  }

  /**
   * Cloth / mat surface: f(u, v) -> [x, y, z] for u, v in 0..1, nu x nv cells, thickness t, both faces.
   * opt.shade(u, v) -> k multiplies the colour per vertex (stripes, wear); opt.one: only the front face.
   */
  sheet(nu, nv, f, t = 0.012, opt = {}) {
    const e = 1e-3, P = [], base = this.c;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = f(u, v), pu = f(Math.min(1, u + e), v), qu = f(Math.max(0, u - e), v), pv = f(u, Math.min(1, v + e)), qv = f(u, Math.max(0, v - e));
      const ax = pu[0] - qu[0], ay = pu[1] - qu[1], az = pu[2] - qu[2], bx = pv[0] - qv[0], by = pv[1] - qv[1], bz = pv[2] - qv[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (opt.up && ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      P.push([p[0], p[1], p[2], nx, ny, nz, opt.shade ? opt.shade(u, v) : 1]);
    }
    for (const sg of opt.one ? [1] : [1, -1]) {
      const I = P.map((p) => { this.c = [base[0] * p[6], base[1] * p[6], base[2] * p[6]]; return this.v(p[0] + sg * p[3] * t / 2, p[1] + sg * p[4] * t / 2, p[2] + sg * p[5] * t / 2, sg * p[3], sg * p[4], sg * p[5]); });
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; this.quadI(I[a], I[a + 1], I[a + nu + 2], I[a + nu + 1]); }
    }
    this.c = base;
    return this;
  }

  /**
   * A mound: ellipsoidal dome rx x rz, height h, n sides, `rings` rings, noisy (amp), with a skirt below the surface.
   * opt: { amp: 0.12, seed, skirt: 0.06, flat: 0 (0 = dome, towards 1 = flat-topped), shade: (i, j) => k }
   */
  heap(x, y, z, rx, rz, h, n = 8, rings = 2, opt = {}) {
    const amp = opt.amp ?? 0.12, seed = opt.seed ?? 1, sk = opt.skirt ?? 0.06, fl = opt.flat ?? 0, base = this.c, R = [];
    const shade = (i, j) => { const k = opt.shade ? opt.shade(i, j) : 0.9 + 0.2 * hsh(i, j, seed + 7); this.c = [base[0] * k, base[1] * k, base[2] * k]; };
    const rim = [];
    for (let i = 0; i < n; i++) { const th = (i / n) * Math.PI * 2, q = 1 + amp * 1.5 * (hsh(i, 0, seed) - 0.5); shade(i, 0); rim.push(this.v(x + rx * q * Math.cos(th), y - sk, z + rz * q * Math.sin(th), Math.cos(th), 0.2, Math.sin(th))); }
    R.push(rim);
    for (let j = 0; j < rings; j++) {
      const ph = (j / rings) * Math.PI / 2, cr = Math.cos(ph) * (1 - fl) + fl * (1 - 0.35 * j / rings), sy = j === 0 ? 0.02 : Math.sin(ph), ring = [];
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2, q = 1 + amp * 1.5 * (hsh(i, j, seed) - 0.5), q2 = 1 + amp * 2 * (hsh(i, j + 31, seed) - 0.5);
        const px = rx * cr * q * Math.cos(th), pz = rz * cr * q * Math.sin(th), py = h * sy * q2;
        let nx = px / (rx * rx), ny = (py + 0.3 * h) / (h * h), nz = pz / (rz * rz); const l = Math.hypot(nx, ny, nz) || 1;
        shade(i, j + 1); ring.push(this.v(x + px, y + py, z + pz, nx / l, ny / l, nz / l));
      }
      R.push(ring);
    }
    shade(0, 99); const apex = this.v(x, y + h * (1 + amp * (hsh(3, 5, seed) - 0.5)), z, 0, 1, 0);
    for (let j = 0; j + 1 < R.length; j++) for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; this.quadI(R[j][i], R[j][i1], R[j + 1][i1], R[j + 1][i]); }
    const top = R[R.length - 1];
    for (let i = 0; i < n; i++) this.tri(top[i], top[(i + 1) % n], apex);
    this.c = base;
    return this;
  }
  /** Torus about the local y axis: ring radius R, tube radius r, n segments, m sides. */
  torus(x, y, z, R, r, n = 10, m = 4) {
    const I = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), row = [];
      for (let j = 0; j < m; j++) { const ph = (j / m) * Math.PI * 2 + Math.PI / 4, cp = Math.cos(ph), sp = Math.sin(ph); row.push(this.v(x + (R + r * cp) * c, y + r * sp, z + (R + r * cp) * s, cp * c, sp, cp * s)); }
      I.push(row);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const i1 = (i + 1) % n, j1 = (j + 1) % m; this.quadI(I[i][j], I[i1][j], I[i1][j1], I[i][j1]); }
    return this;
  }
  /** Flat disc facing up at height y (n sides), radii rx / rz. */
  disc(x, y, z, rx, rz = rx, n = 8) {
    const c = this.v(x, y, z, 0, 1, 0), R = [];
    for (let i = 0; i < n; i++) { const th = (i / n) * Math.PI * 2; R.push(this.v(x + rx * Math.cos(th), y, z + rz * Math.sin(th), 0, 1, 0)); }
    for (let i = 0; i < n; i++) this.tri(c, R[i], R[(i + 1) % n]);
    return this;
  }
  /** Ellipsoid blob centred at (x, y + ry, z): n sides, m rings (sacks, bales, fleeces, loaves). */
  blob(x, y, z, rx, ry, rz, n = 7, m = 4, opt = {}) {
    const prof = [];
    for (let j = 0; j <= m; j++) { const ph = (j / m) * Math.PI; prof.push([Math.max(0, Math.sin(ph)) * (j === 0 || j === m ? 0 : 1), ry - ry * Math.cos(ph)]); }
    this.push(x, y, z, opt.ry ?? 0, opt.rx ?? 0, opt.rz ?? 0);
    this.lathe(prof.map(([r, yy]) => [r * rx, yy]), n, { ez: rz / rx, shade: opt.shade });
    this.pop();
    return this;
  }

  /** Freeze to typed arrays: { slots: [{ pos, nor, col, role, idx, nv, ni } | null x 4], tris, h, r } */
  done() {
    let tris = 0, h = 0, r = 0;
    const slots = this.s.map((b) => {
      if (!b.idx.length) return null;
      const P = b.pos;
      for (let i = 0; i < P.length; i += 3) { if (P[i + 1] > h) h = P[i + 1]; const d = Math.hypot(P[i], P[i + 2]); if (d > r) r = d; }
      tris += b.idx.length / 3;
      return { pos: Float32Array.from(P), nor: Float32Array.from(b.nor), col: Float32Array.from(b.col), role: Uint8Array.from(b.role), idx: Uint32Array.from(b.idx), nv: P.length / 3, ni: b.idx.length };
    });
    return { slots, tris, h, r };
  }
}

function mul3(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/** Growable typed buffers of one (level, tile, material) bin. */
export class Bin {
  constructor() { this.pos = new Float32Array(3 * 2048); this.nor = new Float32Array(3 * 2048); this.col = new Float32Array(3 * 2048); this.idx = new Uint32Array(4096); this.nv = 0; this.ni = 0; }
  need(nv, ni) {
    if ((this.nv + nv) * 3 > this.pos.length) {
      let c = this.pos.length; while (c < (this.nv + nv) * 3) c *= 2;
      for (const k of ['pos', 'nor', 'col']) { const a = new Float32Array(c); a.set(this[k].subarray(0, this.nv * 3)); this[k] = a; }
    }
    if (this.ni + ni > this.idx.length) { let c = this.idx.length; while (c < this.ni + ni) c *= 2; const a = new Uint32Array(c); a.set(this.idx.subarray(0, this.ni)); this.idx = a; }
  }
  /**
   * Append one slot of a prototype: position (x, y, z), rotation given as cos / sin of rotDeg (clockwise from above),
   * uniform scale k, tint [r, g, b] for role-1 vertices, accent [r, g, b] for role-2 vertices, overall shade.
   */
  add(src, x, y, z, c, s, k, tint, accent, shade) {
    this.need(src.nv, src.ni);
    const P = this.pos, N = this.nor, C = this.col, sp = src.pos, sn = src.nor, sc = src.col, sr = src.role, v0 = this.nv;
    let o = v0 * 3;
    for (let i = 0, p = 0; i < src.nv; i++, p += 3, o += 3) {
      const px = sp[p] * k, py = sp[p + 1] * k, pz = sp[p + 2] * k;
      P[o] = x + px * c - pz * s; P[o + 1] = y + py; P[o + 2] = z + px * s + pz * c;
      const nx = sn[p], nz = sn[p + 2];
      N[o] = nx * c - nz * s; N[o + 1] = sn[p + 1]; N[o + 2] = nx * s + nz * c;
      const r = sr[i];
      if (r === 0) { C[o] = sc[p] * shade; C[o + 1] = sc[p + 1] * shade; C[o + 2] = sc[p + 2] * shade; }
      else if (r === 1) { C[o] = sc[p] * tint[0] * shade; C[o + 1] = sc[p + 1] * tint[1] * shade; C[o + 2] = sc[p + 2] * tint[2] * shade; }
      else { C[o] = sc[p] * accent[0] * shade; C[o + 1] = sc[p + 1] * accent[1] * shade; C[o + 2] = sc[p + 2] * accent[2] * shade; }
    }
    const I = this.idx, si = src.idx; let q = this.ni;
    for (let i = 0; i < src.ni; i++) I[q++] = si[i] + v0;
    this.nv += src.nv; this.ni += src.ni;
  }
  /** A horizontal quad (far flats): centre, half sizes, rotation, colour. */
  flat(x, y, z, hw, hd, c, s, col) {
    this.need(4, 6);
    const P = this.pos, N = this.nor, C = this.col, v0 = this.nv; let o = v0 * 3;
    for (const [lx, lz] of [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]]) {
      P[o] = x + lx * c - lz * s; P[o + 1] = y; P[o + 2] = z + lx * s + lz * c; N[o] = 0; N[o + 1] = 1; N[o + 2] = 0; C[o] = col[0]; C[o + 1] = col[1]; C[o + 2] = col[2]; o += 3;
    }
    const I = this.idx, q = this.ni;
    I[q] = v0; I[q + 1] = v0 + 1; I[q + 2] = v0 + 2; I[q + 3] = v0; I[q + 4] = v0 + 2; I[q + 5] = v0 + 3;
    this.nv += 4; this.ni += 6;
  }
  /** A closed box (shadow proxies): centre (x, z), y0..y1, half sizes, rotation. */
  boxAt(x, y0, y1, z, hw, hd, c, s) {
    this.need(8, 36);
    const P = this.pos, N = this.nor, v0 = this.nv; let o = v0 * 3;
    for (const y of [y0, y1]) for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) { P[o] = x + lx * c - lz * s; P[o + 1] = y; P[o + 2] = z + lx * s + lz * c; N[o] = 0; N[o + 1] = 1; N[o + 2] = 0; o += 3; }
    const I = this.idx; let q = this.ni;
    // wound outwards for a right-handed y-up frame with (x, z) corners in the order above
    for (const f of [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) { I[q++] = v0 + f[0]; I[q++] = v0 + f[1]; I[q++] = v0 + f[2]; I[q++] = v0 + f[0]; I[q++] = v0 + f[2]; I[q++] = v0 + f[3]; }
    this.nv += 8; this.ni += 36;
  }
}
