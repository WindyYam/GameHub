// js/modules/palaces/kit.js — builders shared by the four monuments of the `palaces` module.
// Everything writes into "bags": one MeshWriter (and a list of ready geometries) per material key, so that a whole
// monument costs one submission per material and level of detail. No module state: pure functions of their input.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

export function makeKit(ctx) {
  const { geom, ground } = ctx;
  const GK = geom.kit;

  // ------------------------------------------------------------------------------------------ bags ----
  /**
   * alias: { key: [realKey, [r, g, b]] } lets small things share a material: the writer of the real key is returned
   * with its tint set (white for a key that is not an alias). Set your own tint right before your own quads.
   */
  function makeBag(alias = {}) {
    const ws = new Map(), gs = new Map();
    const real = (key) => (alias[key] ? alias[key] : [key, null]);
    return {
      w(key) {
        const [k, tint] = real(key);
        let w = ws.get(k); if (!w) ws.set(k, (w = geom.writer({ verts: 1024 })));
        if (tint) w.color(tint[0], tint[1], tint[2]); else if (w.col) w.color(1, 1, 1);
        return w;
      },
      g(key, geometry, tint) { if (!geometry) return; const [k, t] = real(key); if (tint || t) geom.paint(geometry, tint || t); let l = gs.get(k); if (!l) gs.set(k, (l = [])); l.push(geometry); },
      keys() { return [...new Set([...ws.keys(), ...gs.keys()])]; },
      take(key) {
        const list = [], w = ws.get(key);
        if (w && w.ni) list.push(w);
        for (const g of gs.get(key) || []) list.push(g);
        ws.delete(key); gs.delete(key);
        return list.length ? geom.merge(list) : null;
      },
    };
  }

  // ---------------------------------------------------------------------------------------- frames ----
  /** Local frame of a rotated building: lx to local east, lz to local south (rot clockwise seen from above). */
  function frame(c, rot) {
    const cs = Math.cos(rot * M.DEG), sn = Math.sin(rot * M.DEG);
    const f = {
      c, rot,
      L: (lx, lz) => [c[0] + lx * cs - lz * sn, c[1] + lx * sn + lz * cs],
      W: (x, z) => { const dx = x - c[0], dz = z - c[1]; return [dx * cs + dz * sn, -dx * sn + dz * cs]; },
      rect: (x0, z0, x1, z1) => [f.L(x0, z0), f.L(x1, z0), f.L(x1, z1), f.L(x0, z1)],
      ring: (pts) => pts.map((p) => f.L(p[0], p[1])),
      dir: (lx, lz) => [lx * cs - lz * sn, lx * sn + lz * cs],
      az: (a) => M.mod(a + rot, 360),
    };
    return f;
  }

  // ------------------------------------------------------------------------------------ primitives ----
  /** Quad a, b, c, d ([x, y, z], in order round the quad) facing along (nx, ny, nz): the winding is chosen for you. */
  function Q(w, a, b, c, d, nx, ny, nz) {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * nx + gy * ny + gz * nz >= 0) return w.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    return w.quad(a[0], a[1], a[2], d[0], d[1], d[2], c[0], c[1], c[2], b[0], b[1], b[2]);
  }
  /** Vertical face between plan points p and q from y0 to y1, looking along plan direction (nx, nz). */
  const V = (w, p, q, y0, y1, nx, nz) => Q(w, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], nx, 0, nz);
  /** Vertical face with a sloping foot and top. */
  const V2 = (w, p, q, yp0, yq0, yp1, yq1, nx, nz) => Q(w, [p[0], yp0, p[1]], [q[0], yq0, q[1]], [q[0], yq1, q[1]], [p[0], yp1, p[1]], nx, 0, nz);
  /** Horizontal quad through four plan points at level y. */
  const H = (w, a, b, c, d, y, up = true) => Q(w, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], 0, up ? 1 : -1, 0);
  /** Vertical faces of a ring (as geom's sidesInto). */
  function sides(w, ring, y0, y1, outward = true, skip = null) {
    const r = M.openRing(ring), cw = M.polygonArea(r) > 0, n = r.length;
    for (let i = 0; i < n; i++) {
      if (skip && skip.includes(i)) continue;
      const p = r[i], q = r[(i + 1) % n];
      if (cw === outward) w.quad(q[0], y0, q[1], p[0], y0, p[1], p[0], y1, p[1], q[0], y1, q[1]);
      else w.quad(p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1]);
    }
  }
  function poly(w, ring, y, holes = [], up = true) {
    const flat = [], hs = [];
    for (const p of M.openRing(ring)) flat.push(p[0], p[1]);
    for (const h of holes) { hs.push(flat.length / 2); for (const p of M.openRing(h)) flat.push(p[0], p[1]); }
    w.polygon(flat, hs, y, up);
  }
  /** Closed box on a plan ring from y0 to y1 (sides + top, optional bottom). */
  function prismInto(w, ring, y0, y1, { top = true, bottom = false, skip = null } = {}) {
    sides(w, ring, y0, y1, true, skip);
    if (top) poly(w, ring, y1, [], true);
    if (bottom) poly(w, ring, y0, [], false);
  }
  const rectAt = (x, z, sx, sz, rot) => M.openRing(M.rectRing(x, z, sx, sz, rot));

  /**
   * A building block with a flat roof behind a parapet. Walls into wWall, the roof into wRoof.
   * o: { parapet: 0.6, pt: 0.4, holes: ring[] (court voids: walls down to o.floor, a kerb round the void), floor, kerb: 0.3, skip: edge indices
   *      whose outer face is left out (a portal goes there), far: writer for the far level (a plain prism) }
   */
  function block(wWall, wRoof, ring, base, roof, o = {}) {
    const { parapet = 0.6, pt = 0.4, holes = [], kerb = 0.3, skip = null } = o;
    const r = M.openRing(ring), cw = M.polygonArea(r) > 0, n = r.length, top = roof + parapet;
    sides(wWall, r, base, top, true, skip);
    const inner = geom.insetRing(r, pt);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = r[i], q = r[j], a = inner[i], b = inner[j];
      if (cw) { wWall.quad(q[0], top, q[1], p[0], top, p[1], a[0], top, a[1], b[0], top, b[1]); wWall.quad(a[0], roof, a[1], b[0], roof, b[1], b[0], top, b[1], a[0], top, a[1]); }
      else { wWall.quad(p[0], top, p[1], q[0], top, q[1], b[0], top, b[1], a[0], top, a[1]); wWall.quad(b[0], roof, b[1], a[0], roof, a[1], a[0], top, a[1], b[0], top, b[1]); }
    }
    const outs = [];
    for (const h of holes) {
      const hr = M.openRing(h), ho = geom.insetRing(hr, -0.3), hcw = M.polygonArea(hr) > 0, m = hr.length, kt = roof + kerb;
      outs.push(ho);
      sides(wWall, hr, o.floor ?? base, kt, false);
      sides(wWall, ho, roof, kt, true);
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m, p = hr[i], q = hr[j], a = ho[i], b = ho[j];
        if (hcw) wWall.quad(p[0], kt, p[1], q[0], kt, q[1], b[0], kt, b[1], a[0], kt, a[1]); else wWall.quad(q[0], kt, q[1], p[0], kt, p[1], a[0], kt, a[1], b[0], kt, b[1]);
      }
    }
    poly(wRoof, inner, roof, outs, true);
    if (o.far) { sides(o.far, r, base, top, true); poly(o.farRoof || o.far, r, top, holes, true); for (const h of holes) sides(o.far, h, o.floor ?? base, top, false); }
  }

  /** Square timber or stone bar between two points in space. */
  function beam(w, p0, p1, t, t1 = t) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], l = Math.hypot(dx, dy, dz) || 1, ax = dx / l, ay = dy / l, az = dz / l;
    let bx, by, bz;
    if (Math.abs(ay) > 0.95) { bx = 1; by = 0; bz = 0; } else { bx = 0; by = 1; bz = 0; }
    let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; const cl = Math.hypot(cx, cy, cz); cx /= cl; cy /= cl; cz /= cl;
    bx = cy * az - cz * ay; by = cz * ax - cx * az; bz = cx * ay - cy * ax;
    const c = (p, sb, sc, h) => [p[0] + (bx * sb + cx * sc) * h, p[1] + (by * sb + cy * sc) * h, p[2] + (bz * sb + cz * sc) * h];
    const h0 = t / 2, h1 = t1 / 2, A = [c(p0, -1, -1, h0), c(p0, 1, -1, h0), c(p0, 1, 1, h0), c(p0, -1, 1, h0)], B = [c(p1, -1, -1, h1), c(p1, 1, -1, h1), c(p1, 1, 1, h1), c(p1, -1, 1, h1)];
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, m = [(A[i][0] + A[j][0] + B[i][0] + B[j][0]) / 4 - mid[0], (A[i][1] + A[j][1] + B[i][1] + B[j][1]) / 4 - mid[1], (A[i][2] + A[j][2] + B[i][2] + B[j][2]) / 4 - mid[2]];
      Q(w, A[i], A[j], B[j], B[i], m[0], m[1], m[2]);
    }
    Q(w, A[0], A[1], A[2], A[3], -ax, -ay, -az); Q(w, B[0], B[1], B[2], B[3], ax, ay, az);
  }
  /** Axis-aligned box in a local frame: f.L applied to [x0..x1] x [z0..z1], levels y0..y1. */
  function boxL(w, f, x0, z0, x1, z1, y0, y1, o) { prismInto(w, f.rect(x0, z0, x1, z1), y0, y1, o); }

  // ------------------------------------------------------------------------------------- merlons ----
  /**
   * A row of stepped merlons: geometry into the near bag (key), the alpha strip into strips[] for the far level.
   * line: polyline of the CENTRE line of the row.
   */
  const MER = { pitch: 1.25, width: 0.75, height: 0.9, thickness: 0.5, steps: 3 };
  function merlonRow(B, key, line, y, opt = {}) {
    const m = { ...MER, ...opt };
    const len = M.polylineLength(line);
    if (len < m.width + 0.2) return 0;
    const lay = GK.merlonLayout(line, { y, pitch: m.pitch, offset: 0 }), w = B.near.w(key);
    for (const p of lay) GK.merlonInto(w, p.x, p.y, p.z, p.ux, p.uz, m.width, m.height, m.thickness, m.steps);
    B.strips.push({ key, g: geom.merlonStrip(line, { y, pitch: m.pitch, width: m.width, height: m.height }), fill: m.width / m.pitch });
    B.merlons = (B.merlons || 0) + lay.length;
    return lay.length;
  }

  // ----------------------------------------------------------------------------------- enclosures ----
  const cross = (ax, az, bx, bz) => ax * bz - az * bx;
  /** Intersection of the lines p + t u and q + s v (plan); null when parallel. */
  function meet(p, u, q, v) {
    const d = cross(u[0], u[1], v[0], v[1]);
    if (Math.abs(d) < 1e-6) return null;
    const t = cross(q[0] - p[0], q[1] - p[1], v[0], v[1]) / d;
    return [p[0] + u[0] * t, p[1] + u[1] * t];
  }

  /**
   * Thick walls along a line of OUTER-FACE points, mitred at the corners, with parapet, wall-walk, inner kerb,
   * pilaster towers and merlons, in two levels of detail.
   * B: { near: bag, far: bag, strips: [] }.  pts: [[x, z], ...]; closed: ring.  side: +1 = the wall body lies to the
   * right of travel, -1 = to the left.
   * edges[i] (edge pts[i] -> pts[i + 1]) = null (not built) or
   *   { thick, top (wall-walk level), base, key: wall material key, topKey: walk material key (default key),
   *     parapet: 1.0, pt: 0.5, kerb: 0.45 (inner kerb height, 0 = none), kt: 0.4, merlon: key | null, merlonOpt,
   *     towers: { cc, w, proj, depth, extra, m0, m1 (margins at the two ends), sides: 4 | 3 | 1 (merlons), base },
   *     footing: { top, proj, key }, capA / capB: true (end face when the neighbour is not built) }
   * corners: { size, proj, extra } | null: square towers on every corner between two built edges.
   */
  function enclosure(B, pts, edges, { closed = false, side = 1, corners = null } = {}) {
    const P = closed ? M.openRing(pts) : pts, n = P.length, ne = closed ? n : n - 1, E = [];
    for (let i = 0; i < ne; i++) {
      const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const nrm = side > 0 ? [-u[1], u[0]] : [u[1], -u[0]];           // into the body
      E.push({ a, b, L, u, n: nrm, s: edges[i] || null, i });
    }
    const at = (e, s, d) => [e.a[0] + e.u[0] * s + e.n[0] * d, e.a[1] + e.u[1] * s + e.n[1] * d];
    // corner of edge e at its start (end = false) or end (true) for an offset d measured into the body (dPrev on the neighbour)
    const corner = (e, end, d, dOther) => {
      const j = end ? (e.i + 1) % ne : (e.i - 1 + ne) % ne, o = (closed || (end ? e.i < ne - 1 : e.i > 0)) ? E[j] : null;
      const here = end ? at(e, e.L, d) : at(e, 0, d);
      if (!o || !o.s) return here;
      const od = dOther === undefined ? d : dOther;
      const q = meet(at(e, 0, d), e.u, at(o, 0, od), o.u);
      return q || here;
    };
    const stats = { towers: 0, length: 0 };
    for (const e of E) {
      const s = e.s; if (!s) continue;
      const key = s.key, topKey = s.topKey || key, ph = s.parapet ?? 1.0, pt = s.pt ?? 0.5, kh = s.kerb ?? 0.45, kt = s.kt ?? 0.4, th = s.thick, top = s.top, base = s.base;
      const prev = closed || e.i > 0 ? E[(e.i - 1 + ne) % ne] : null, next = closed || e.i < ne - 1 ? E[(e.i + 1) % ne] : null;
      const ps = prev && prev.s, nx = next && next.s;
      const od = (o) => (o ? o.thick : th);
      const O0 = corner(e, false, 0, 0), O1 = corner(e, true, 0, 0);
      const P0 = corner(e, false, pt, ps ? (ps.pt ?? 0.5) : pt), P1 = corner(e, true, pt, nx ? (nx.pt ?? 0.5) : pt);
      const K0 = corner(e, false, th - kt, ps ? od(ps) - (ps.kt ?? 0.4) : 0), K1 = corner(e, true, th - kt, nx ? od(nx) - (nx.kt ?? 0.4) : 0);
      const I0 = corner(e, false, th, ps ? od(ps) : 0), I1 = corner(e, true, th, nx ? od(nx) : 0);
      const w = B.near.w(key), wt = B.near.w(topKey), N = e.n, wf = B.far.w(key);
      stats.length += e.L;
      V(w, O0, O1, base, top + ph, -N[0], -N[1]);                       // outer face up to the parapet top
      H(w, O0, O1, P1, P0, top + ph);                                   // parapet top
      V(w, P0, P1, top, top + ph, N[0], N[1]);                          // parapet, inner face
      if (kh > 0) {
        H(wt, P0, P1, K1, K0, top);
        V(w, K0, K1, top, top + kh, -N[0], -N[1]);
        H(w, K0, K1, I1, I0, top + kh);
        V(w, I0, I1, s.baseIn ?? base, top + kh, N[0], N[1]);
      } else {
        H(wt, P0, P1, I1, I0, top);
        V(w, I0, I1, s.baseIn ?? base, top, N[0], N[1]);
      }
      // far level: a plain prism
      V(wf, O0, O1, base, top + ph, -N[0], -N[1]); V(wf, I0, I1, s.baseIn ?? base, top + ph, N[0], N[1]); H(wf, O0, O1, I1, I0, top + ph);
      // ends: a cap where the neighbour is not built, a step face where it is lower or higher
      const endFace = (O, Pp, Kk, I, o, dirSign) => {
        const dir = [e.u[0] * dirSign, e.u[1] * dirSign];
        // the end of the wall body, of the parapet and of the kerb: closed where no wall follows, or above a lower neighbour
        const from = !o ? base : o.top + (o.parapet ?? 1.0) < top + ph - 0.01 || o.top < top - 0.01 ? Math.min(o.top, top) - 0.2 : null;
        if (from === null) return;
        V(w, O, I, from, top, dir[0], dir[1]);
        if (ph > 0) V(w, O, Pp, top, top + ph, dir[0], dir[1]);
        if (kh > 0) V(w, Kk, I, top, top + kh, dir[0], dir[1]);
        V(wf, O, I, !o ? base : o.top, top + ph, dir[0], dir[1]);
      };
      endFace(O0, P0, K0, I0, ps, -1); endFace(O1, P1, K1, I1, nx, 1);
      // footing: a band of stone (or brick) standing proud of the foot of the outer face
      if (s.footing) {
        const f = s.footing, wk = B.near.w(f.key || key), F0 = corner(e, false, -f.proj, ps && ps.footing ? -ps.footing.proj : -f.proj), F1 = corner(e, true, -f.proj, nx && nx.footing ? -nx.footing.proj : -f.proj);
        V(wk, F0, F1, base, f.top, -N[0], -N[1]); H(wk, F0, F1, O1, O0, f.top);
        if (!ps || !ps.footing) V(wk, F0, O0, base, f.top, -e.u[0], -e.u[1]);
        if (!nx || !nx.footing) V(wk, F1, O1, base, f.top, e.u[0], e.u[1]);
        const wff = B.far.w(f.key || key); V(wff, F0, F1, base, f.top, -N[0], -N[1]); H(wff, F0, F1, O1, O0, f.top);
      }
      // towers and the merlons between them
      const T = s.towers, spans = [];
      let cuts = [];
      const cs = corners ? corners.size : 0;
      const sStart = ps && corners ? cs : 0, sEnd = e.L - (nx && corners ? cs : 0);
      if (T) {
        const m0 = T.m0 ?? T.cc * 0.5, m1 = T.m1 ?? T.cc * 0.5, room = e.L - m0 - m1, cnt = room > 0 ? Math.max(1, Math.round(room / T.cc) + 1) : 0;
        for (let k = 0; k < cnt; k++) {
          const sc = cnt === 1 ? e.L / 2 : m0 + (room * k) / (cnt - 1), hw = T.w / 2;
          if (T.skip && T.skip(sc, e.L)) continue;
          const ring = [at(e, sc - hw, -T.proj), at(e, sc + hw, -T.proj), at(e, sc + hw, T.depth), at(e, sc - hw, T.depth)];
          const tt = top + (T.extra ?? 2);
          block(w, wt, ring, T.base ?? base, tt, { parapet: 0.9, pt: 0.45, far: wf });
          if (s.merlon) {
            const q = 0.25, a0 = at(e, sc - hw + q, T.depth - q), a1 = at(e, sc - hw + q, -T.proj + q), a2 = at(e, sc + hw - q, -T.proj + q), a3 = at(e, sc + hw - q, T.depth - q);
            const ms = T.sides ?? 3;
            if (ms >= 4) merlonRow(B, s.merlon, [a0, a1, a2, a3, a0], tt + 0.9, s.merlonOpt);
            else if (ms === 3) merlonRow(B, s.merlon, [a0, a1, a2, a3], tt + 0.9, s.merlonOpt);
            else merlonRow(B, s.merlon, [a1, a2], tt + 0.9, s.merlonOpt);
          }
          cuts.push([sc - hw, sc + hw]); stats.towers++;
          if (T.each) T.each(at(e, sc, T.depth / 2), tt, e, sc);
        }
      }
      if (s.merlon) {
        let s0 = sStart;
        cuts = cuts.sort((a, b) => a[0] - b[0]);
        for (const c of cuts) { if (c[0] - s0 > 0.9) spans.push([s0, c[0]]); s0 = Math.max(s0, c[1]); }
        if (sEnd - s0 > 0.9) spans.push([s0, sEnd]);
        for (const sp of spans) merlonRow(B, s.merlon, [at(e, sp[0] + 0.05, pt / 2), at(e, sp[1] - 0.05, pt / 2)], top + ph, s.merlonOpt);
      }
      if (s.each) s.each(e, at);
    }
    // corner towers
    if (corners) for (let i = 0; i < n; i++) {
      const e1 = E[i % ne], e0 = closed || i > 0 ? E[(i - 1 + ne) % ne] : null;
      if (!e0 || !e1 || !e0.s || !e1.s || (!closed && (i === 0 || i === n - 1)) || (corners.only && !corners.only.includes(i))) continue;
      const pr = corners.proj ?? 1.0, sz = corners.size, tt = Math.max(e0.s.top, e1.s.top) + (corners.extra ?? 3), key = e1.s.key;
      const ring = [at(e1, -pr, -pr), at(e1, sz, -pr), at(e1, sz, sz), at(e1, -pr, sz)];
      const w = B.near.w(key);
      block(w, B.near.w(e1.s.topKey || key), ring, Math.min(e0.s.base, e1.s.base), tt, { parapet: 0.9, pt: 0.45, far: B.far.w(key) });
      const mk = e1.s.merlon || e0.s.merlon;
      if (mk) { const q = 0.25, r2 = [at(e1, -pr + q, -pr + q), at(e1, sz - q, -pr + q), at(e1, sz - q, sz - q), at(e1, -pr + q, sz - q)]; merlonRow(B, mk, [...r2, r2[0]], tt + 0.9, e1.s.merlonOpt); }
      stats.towers++;
      if (corners.each) corners.each(at(e1, sz / 2 - pr / 2, sz / 2 - pr / 2), tt);
    }
    return stats;
  }

  // ---------------------------------------------------------------------------- palace fabric ----
  /** Free rectangles of rect minus the reserved rectangles (all [x0, z0, x1, z1] in one local frame). */
  function freeRects(rect, reserved) {
    const xs = new Set([rect[0], rect[2]]), zs = new Set([rect[1], rect[3]]);
    for (const r of reserved) { for (const x of [r[0], r[2]]) if (x > rect[0] && x < rect[2]) xs.add(x); for (const z of [r[1], r[3]]) if (z > rect[1] && z < rect[3]) zs.add(z); }
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), nx = X.length - 1, nz = Z.length - 1;
    const free = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      free.push(!reserved.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3]));
    }
    const out = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!free[j * nx + i]) continue;
      let i1 = i; while (i1 + 1 < nx && free[j * nx + i1 + 1]) i1++;
      let j1 = j;
      for (;;) { if (j1 + 1 >= nz) break; let ok = true; for (let k = i; k <= i1; k++) if (!free[(j1 + 1) * nx + k]) { ok = false; break; } if (!ok) break; j1++; }
      for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) free[jj * nx + k] = false;
      out.push([X[i], Z[j], X[i1 + 1], Z[j1 + 1]]);
    }
    return out;
  }
  /** Clip a convex-or-not ring against the half-plane left of... : keep the part where nx * x + nz * z <= c. */
  function clipHalf(ring, nx, nz, c) {
    const out = [], n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  const ringArea = (r) => Math.abs(M.polygonArea(r));

  /**
   * Fill a rectangle of a palace with courtyard units (the "about fifty small courtyard houses"): rooms round a
   * small court, the main room on the south side a little higher, narrow lanes between some of them.
   * f: frame; rect, o.reserved: local rectangles; o: { floor, hMin, hMax, unit: 22 (largest unit side), lane: 0.3 (share of
   *   splits that leave a lane), laneW: 2.2, seed, clip: [[nx, nz, c], ...] local half-planes kept (nx x + nz z <= c),
   *   wall, roof: material keys, south: +1 (the taller range on the local south side) }
   * Returns the list of units [{ rect, roof, court }] (for dressing).
   */
  function fabric(B, f, rect, o) {
    const seed = o.seed || 1, units = [], maxU = o.unit || 22, minU = o.minUnit || 8.5, laneW = o.laneW ?? 2.2;
    let id = 0;
    const rnd = (k) => hash2(id * 7 + k, seed, 977 + k);
    const split = (r, depth) => {
      const w = r[2] - r[0], h = r[3] - r[1], long = Math.max(w, h);
      id++;
      if (long <= maxU || long < 2 * minU + laneW) { units.push(r); return; }
      const k = 0.38 + 0.24 * rnd(1), lane = depth < 3 && rnd(2) < (o.lane ?? 0.3) ? laneW : 0;
      if (w >= h) { const x = r[0] + (w - lane) * k; split([r[0], r[1], x, r[3]], depth + 1); split([x + lane, r[1], r[2], r[3]], depth + 1); }
      else { const z = r[1] + (h - lane) * k; split([r[0], r[1], r[2], z], depth + 1); split([r[0], z + lane, r[2], r[3]], depth + 1); }
    };
    for (const r of freeRects(rect, o.reserved || [])) if (r[2] - r[0] > 2.5 && r[3] - r[1] > 2.5) split(r, 0);
    const wW = B.near.w(o.wall), wR = B.near.w(o.roof), fW = B.far.w(o.wall), fR = B.far.w(o.roof), out = [];
    let ui = 0;
    for (const r of units) {
      ui++;
      const k1 = hash2(ui, seed, 31), k2 = hash2(ui, seed, 57), k3 = hash2(ui, seed, 91);
      const w = r[2] - r[0], h = r[3] - r[1], roof = o.floor + o.hMin + (o.hMax - o.hMin) * k1;
      let ring = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], clipped = false;
      for (const c of o.clip || []) { const before = ring.length ? ringArea(ring) : 0; ring = clipHalf(ring, c[0], c[1], c[2]); if (ring.length < 3) break; if (ringArea(ring) < before - 0.01) clipped = true; }
      if (ring.length < 3 || ringArea(ring) < 9) continue;
      const parapet = 0.45 + 0.35 * k3;
      if (!clipped && Math.min(w, h) >= 12.5 && k2 < (o.courts ?? 0.85)) {
        // rooms round a court: a U of three ranges and a higher range on the south side
        const rd = Math.min(5.4, Math.max(4.2, Math.min(w, h) * 0.3)), rs = rd + 0.6, zS = r[3] - rs, hi = roof + 0.7 + 1.1 * hash2(ui, seed, 13);
        const U = [[r[0], r[1]], [r[2], r[1]], [r[2], zS], [r[2] - rd, zS], [r[2] - rd, r[1] + rd], [r[0] + rd, r[1] + rd], [r[0] + rd, zS], [r[0], zS]];
        block(wW, wR, f.ring(U), o.base, roof, { parapet, pt: 0.4, far: fW, farRoof: fR });
        block(wW, wR, f.rect(r[0], zS, r[2], r[3]), o.base, hi, { parapet, pt: 0.4, far: fW, farRoof: fR });
        out.push({ rect: r, roof, hi, court: [r[0] + rd, r[1] + rd, r[2] - rd, zS], south: [r[0], zS, r[2], r[3]] });
      } else {
        block(wW, wR, f.ring(ring), o.base, roof, { parapet, pt: 0.4, far: fW, farRoof: fR });
        out.push({ rect: r, roof, hi: roof, court: null, clipped });
      }
    }
    return out;
  }

  // --------------------------------------------------------------------------------- portals ----
  /**
   * A wall face from plan point a to b (base..top) with a recessed, flat-lintelled portal: stepped reveals, a dark
   * door leaf at the back. The face looks to the LEFT of travel a -> b when side = -1, to the right when +1.
   * p: { at: 0..1 | metres from a (centre), width, height, sill (level), depth: 1.6, rebates: 2, step: 0.35, rd: 0.4, doorKey, lintelKey }
   */
  function portalFace(B, key, a, b, base, top, side, p) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], out = side > 0 ? [-u[1], u[0]] : [u[1], -u[0]];
    const w = B.near.w(key), sc = p.at <= 1 ? p.at * L : p.at, n = p.rebates ?? 2, st = p.step ?? 0.35, rd = p.rd ?? 0.4, hw = p.width / 2, y0 = p.sill, y1 = p.sill + p.height, D = p.depth ?? 1.6;
    const at = (s, d, y) => [a[0] + u[0] * s - out[0] * d, y, a[1] + u[1] * s - out[1] * d];       // d = depth behind the face
    const face = (s0, s1, ya, yb, d) => Q(w, at(s0, d, ya), at(s1, d, ya), at(s1, d, yb), at(s0, d, yb), out[0], 0, out[1]);
    const W0 = hw + n * st, T0 = y1 + n * st;
    face(0, sc - W0, base, top, 0); face(sc + W0, L, base, top, 0); face(sc - W0, sc + W0, T0, top, 0);
    if (y0 > base + 1e-3) face(sc - W0, sc + W0, base, y0, 0);
    for (let k = 0; k < n; k++) {
      const wa = hw + (n - k) * st, wb = wa - st, ta = y1 + (n - k) * st, tb = ta - st, d0 = k * rd, d1 = (k + 1) * rd;
      w.occlusion(0.92 - 0.1 * k);
      // reveals of this step (jambs and soffit), then the return to the next, narrower opening
      Q(w, at(sc - wa, d0, y0), at(sc - wa, d1, y0), at(sc - wa, d1, ta), at(sc - wa, d0, ta), u[0], 0, u[1]);
      Q(w, at(sc + wa, d0, y0), at(sc + wa, d1, y0), at(sc + wa, d1, ta), at(sc + wa, d0, ta), -u[0], 0, -u[1]);
      Q(w, at(sc - wa, d0, ta), at(sc + wa, d0, ta), at(sc + wa, d1, ta), at(sc - wa, d1, ta), 0, -1, 0);
      w.occlusion(0.85 - 0.1 * k);
      face(sc - wa, sc - wb, y0, ta, d1); face(sc + wb, sc + wa, y0, ta, d1); face(sc - wb, sc + wb, tb, ta, d1);
    }
    const d0 = n * rd;
    w.occlusion(0.62);
    Q(w, at(sc - hw, d0, y0), at(sc - hw, D, y0), at(sc - hw, D, y1), at(sc - hw, d0, y1), u[0], 0, u[1]);
    Q(w, at(sc + hw, d0, y0), at(sc + hw, D, y0), at(sc + hw, D, y1), at(sc + hw, d0, y1), -u[0], 0, -u[1]);
    Q(w, at(sc - hw, d0, y1), at(sc + hw, d0, y1), at(sc + hw, D, y1), at(sc - hw, D, y1), 0, -1, 0);
    for (let k = 0; k < n; k++) { const wa = hw + (n - k) * st; Q(w, at(sc - wa, k * rd, y0), at(sc + wa, k * rd, y0), at(sc + wa, (k + 1) * rd, y0), at(sc - wa, (k + 1) * rd, y0), 0, 1, 0); }       // threshold, step by step
    Q(w, at(sc - hw, d0, y0), at(sc + hw, d0, y0), at(sc + hw, D, y0), at(sc - hw, D, y0), 0, 1, 0);
    w.occlusion(1);
    // the door: two leaves of cedar boards behind a lintel beam, bronze bands
    const wd = B.near.w(p.doorKey || 'door');
    wd.occlusion(0.7);
    Q(wd, at(sc - hw, D, y0), at(sc + hw, D, y0), at(sc + hw, D, y1), at(sc - hw, D, y1), out[0], 0, out[1]);
    wd.occlusion(1);
    if (p.bands !== false) {
      const wb = B.near.w('bronze'), nb = Math.max(2, Math.round(p.height / 1.6));
      for (let k = 0; k < nb; k++) { const y = y0 + (p.height * (k + 0.5)) / nb; Q(wb, at(sc - hw, D - 0.03, y - 0.09), at(sc + hw, D - 0.03, y - 0.09), at(sc + hw, D - 0.03, y + 0.09), at(sc - hw, D - 0.03, y + 0.09), out[0], 0, out[1]); }
    }
    // far level: the plain face with a dark panel
    const wf = B.far.w(key); Q(wf, at(0, 0, base), at(L, 0, base), at(L, 0, top), at(0, 0, top), out[0], 0, out[1]);
    return { centre: [a[0] + u[0] * sc, a[1] + u[1] * sc], out };
  }

  /** A door leaf applied to a wall: dark timber slightly proud, a lintel beam above. at: [x, z] on the face, out: unit normal. */
  function door(B, at, out, base, width, height, o = {}) {
    const r = [-out[1], out[0]], hw = width / 2, pr = o.proud ?? 0.07, wd = B.near.w(o.key || 'door');
    const P = (s, y, d) => [at[0] + r[0] * s + out[0] * d, y, at[1] + r[1] * s + out[1] * d];
    Q(wd, P(-hw, base, pr), P(hw, base, pr), P(hw, base + height, pr), P(-hw, base + height, pr), out[0], 0, out[1]);
    Q(wd, P(-hw, base, 0), P(-hw, base, pr), P(-hw, base + height, pr), P(-hw, base + height, 0), -r[0], 0, -r[1]);
    Q(wd, P(hw, base, 0), P(hw, base, pr), P(hw, base + height, pr), P(hw, base + height, 0), r[0], 0, r[1]);
    const lh = o.lintel ?? 0.28, a = hw + 0.3, lp = pr + 0.1, y0 = base + height, y1 = y0 + lh;
    Q(wd, P(-a, y0, lp), P(a, y0, lp), P(a, y1, lp), P(-a, y1, lp), out[0], 0, out[1]);
    Q(wd, P(-a, y1, 0), P(a, y1, 0), P(a, y1, lp), P(-a, y1, lp), 0, 1, 0);
    Q(wd, P(-a, y0, 0), P(a, y0, 0), P(a, y0, lp), P(-a, y0, lp), 0, -1, 0);
    Q(wd, P(-a, y0, 0), P(-a, y0, lp), P(-a, y1, lp), P(-a, y1, 0), -r[0], 0, -r[1]);
    Q(wd, P(a, y0, 0), P(a, y0, lp), P(a, y1, lp), P(a, y1, 0), r[0], 0, r[1]);
  }

  /** A row of projecting beam ends under a parapet (cedar roof beams showing on a facade). */
  function beamEnds(B, a, b, y, out, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], sp = o.spacing ?? 0.9, sz = o.size ?? 0.26, pr = o.proud ?? 0.28, n = Math.floor((L - 1) / sp), w = B.near.w(o.key || 'door');
    for (let k = 0; k <= n; k++) {
      const s = (L - n * sp) / 2 + k * sp, c = [a[0] + u[0] * s, a[1] + u[1] * s];
      const P = (ds, dy, d) => [c[0] + u[0] * ds + out[0] * d, y + dy, c[1] + u[1] * ds + out[1] * d];
      Q(w, P(-sz / 2, 0, pr), P(sz / 2, 0, pr), P(sz / 2, sz, pr), P(-sz / 2, sz, pr), out[0], 0, out[1]);
      Q(w, P(-sz / 2, sz, 0), P(sz / 2, sz, 0), P(sz / 2, sz, pr), P(-sz / 2, sz, pr), 0, 1, 0);
      Q(w, P(-sz / 2, 0, 0), P(sz / 2, 0, 0), P(sz / 2, 0, pr), P(-sz / 2, 0, pr), 0, -1, 0);
      Q(w, P(-sz / 2, 0, 0), P(-sz / 2, 0, pr), P(-sz / 2, sz, pr), P(-sz / 2, sz, 0), -u[0], 0, -u[1]);
      Q(w, P(sz / 2, 0, 0), P(sz / 2, 0, pr), P(sz / 2, sz, pr), P(sz / 2, sz, 0), u[0], 0, u[1]);
    }
  }
  /** Drain spouts along a parapet line. */
  function spouts(B, a, b, y, out, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], sp = o.spacing ?? 9, n = Math.max(1, Math.round(L / sp)), w = B.near.w(o.key || 'spout');
    for (let k = 0; k < n; k++) { const s = (L * (k + 0.5)) / n; GK.spoutInto(w, a[0] + u[0] * s, y, a[1] + u[1] * s, M.dirToAz(out[0], out[1]), o.length ?? 0.7, 0.22, 0.16, 0.08); }
  }

  // -------------------------------------------------------------------------- stairs and ramps ----
  /** Straight flight with true risers: foot at plan point `foot` on `base`, climbing along model azimuth az by `rise`. */
  function flight(B, key, foot, az, rise, width, o = {}) {
    const steps = Math.max(1, Math.round(rise / (o.riser ?? 0.172))), riser = rise / steps, tread = o.tread ?? 0.33;
    B.near.g(key, geom.stairs({ x: foot[0], z: foot[1], azDeg: az, width, steps, riser, tread, base: o.base, sink: o.sink ?? 0.6, parapet: o.parapet === undefined ? null : o.parapet }));
    // far level: a wedge
    B.far.g(key, geom.ramp({ x: foot[0], z: foot[1], azDeg: az, width, length: steps * tread, rise, base: o.base, sink: o.sink ?? 0.6 }));
    return { run: steps * tread, steps, riser };
  }
  /** Ramp between two plan points (a at ya, b at yb), `width` wide, solid down to `base`, with parapet walls on chosen sides. */
  function rampBetween(B, key, a, b, ya, yb, width, base, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], r = [-u[1], u[0]], hw = width / 2, w = B.near.w(key);
    const P = (s, d) => [a[0] + u[0] * s + r[0] * d, a[1] + u[1] * s + r[1] * d];
    const A0 = P(0, -hw), A1 = P(0, hw), B0 = P(L, -hw), B1 = P(L, hw);
    Q(B.near.w(o.topKey || key), [A0[0], ya, A0[1]], [A1[0], ya, A1[1]], [B1[0], yb, B1[1]], [B0[0], yb, B0[1]], 0, 1, 0);
    V2(w, A1, B1, base, base, ya, yb, r[0], r[1]); V2(w, A0, B0, base, base, ya, yb, -r[0], -r[1]);
    V(w, A0, A1, base, ya, -u[0], -u[1]); V(w, B0, B1, base, yb, u[0], u[1]);
    const ph = o.parapet ?? 0.9, pt = 0.45;
    for (const sd of o.sides || [1, -1]) {
      const o0 = P(0, sd * hw), o1 = P(L, sd * hw), i0 = P(0, sd * (hw - pt)), i1 = P(L, sd * (hw - pt));
      V2(w, o0, o1, ya, yb, ya + ph, yb + ph, r[0] * sd, r[1] * sd); V2(w, i0, i1, ya, yb, ya + ph, yb + ph, -r[0] * sd, -r[1] * sd);
      Q(w, [o0[0], ya + ph, o0[1]], [o1[0], yb + ph, o1[1]], [i1[0], yb + ph, i1[1]], [i0[0], ya + ph, i0[1]], 0, 1, 0);
      V(w, o0, i0, ya, ya + ph, -u[0], -u[1]); V(w, o1, i1, yb, yb + ph, u[0], u[1]);
    }
    const wf = B.far.w(key);
    Q(wf, [A0[0], ya, A0[1]], [A1[0], ya, A1[1]], [B1[0], yb, B1[1]], [B0[0], yb, B0[1]], 0, 1, 0);
    V2(wf, A1, B1, base, base, ya, yb, r[0], r[1]); V2(wf, A0, B0, base, base, ya, yb, -r[0], -r[1]); V(wf, B0, B1, base, yb, u[0], u[1]);
  }

  // ------------------------------------------------------------------------- retaining walls ----
  /**
   * Retaining walls of a made terrace: for every stretch of the outline where the ground outside lies lower, a
   * wall with its outer face on the outline, `thick` m into the terrace, from 0.7 m below the lower ground to
   * level + kerb. For a stretch where the ground outside is HIGHER (and no other terrace of `others` owns it), a
   * thick wall inside this terrace (o.sunk m) that rises to the higher ground + kerb.
   * o: { thick: 0.9, kerb: 0.3, key, capKey, niche: { minH, bay, width, depth } | null, sunk: 2.8, skipEdges, others: ring[], probe: 1.0 }
   * Returns the stretches [{ a, b, out, lo, hi }] (for stairs, channels and the notes).
   */
  function retain(B, ring, level, o = {}) {
    const r = M.openRing(ring), n = r.length, cw = M.polygonArea(r) > 0, th = o.thick ?? 0.9, kerb = o.kerb ?? 0.3, key = o.key, w = B.near.w(key), wf = B.far.w(key), runs = [];
    const step = 1.5, probe = o.probe ?? 1.0, hAt = o.height || ground.height;
    for (let i = 0; i < n; i++) {
      if (o.skipEdges && o.skipEdges.includes(i)) continue;
      const a = r[i], b = r[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], out = cw ? [u[1], -u[0]] : [-u[1], u[0]];
      const m = Math.max(1, Math.round(L / step));
      let cur = null;
      const flush = (s1) => { if (cur) { cur.s1 = s1; if (cur.s1 - cur.s0 > 0.4) runs.push(cur); cur = null; } };
      for (let k = 0; k < m; k++) {
        const s0 = (L * k) / m, s1 = (L * (k + 1)) / m, sm = (s0 + s1) / 2, px = a[0] + u[0] * sm + out[0] * probe, pz = a[1] + u[1] * sm + out[1] * probe;
        let lo = hAt(px, pz);
        if (ground.isWater(px, pz)) lo = Math.min(lo, ground.waterLevel - 2.2);
        const kind = lo < level - 0.25 ? 'drop' : lo > level + 0.25 && !(o.others || []).some((q) => M.pointInPolygon(px, pz, q)) && o.sunk !== 0 ? 'rise' : null;
        const q = Math.round(lo * 4) / 4;
        if (!kind) { flush(s0); continue; }
        if (cur && (cur.kind !== kind || Math.abs(cur.q - q) > 0.3)) flush(s0);
        if (!cur) cur = { kind, q, lo, a, u, out, s0, edge: i, L };
        cur.lo = kind === 'drop' ? Math.min(cur.lo, lo) : Math.max(cur.lo, lo);
      }
      flush(L);
    }
    const res = [];
    for (const c of runs) {
      const P = (s, d) => [c.a[0] + c.u[0] * s - c.out[0] * d, c.a[1] + c.u[1] * s - c.out[1] * d];     // d into the terrace
      const drop = c.kind === 'drop', t = drop ? th : (o.sunk ?? 2.8), top = (drop ? level : c.lo) + kerb, base = (drop ? c.lo : level) - 0.7;
      // ends: pulled in a little at a corner so that neighbouring walls do not double up
      const s0 = c.s0, s1 = c.s1, O0 = P(s0, 0), O1 = P(s1, 0), I0 = P(s0, t), I1 = P(s1, t);
      const h = top - (c.lo);
      if (drop && o.niche && h >= (o.niche.minH ?? 2.6) && s1 - s0 > (o.niche.bay ?? 3.2) * 1.5) {
        // the face as a niched skin (stepped vertical recesses), closed above by its frieze
        const nb = o.niche;
        B.near.g(key, geom.nichedFacade({ a: O0, b: O1, base, top, bay: nb.bay ?? 3.2, nicheWidth: nb.width ?? 1.3, nicheDepth: nb.depth ?? 0.24, steps: 1, stepWidth: 0.2, nicheBase: c.lo + (nb.socle ?? 0.6), nicheTop: top - (nb.frieze ?? 0.55),
          side: cross(c.u[0], c.u[1], c.out[0], c.out[1]) > 0 ? 1 : -1 }));
      } else V(w, O0, O1, base, top, c.out[0], c.out[1]);
      H(w, O0, O1, I1, I0, top);
      V(w, I0, I1, drop ? level - 0.4 : base, top, -c.out[0], -c.out[1]);
      V(w, O0, I0, base, top, -c.u[0], -c.u[1]); V(w, O1, I1, base, top, c.u[0], c.u[1]);
      V(wf, O0, O1, base, top, c.out[0], c.out[1]); H(wf, O0, O1, I1, I0, top);
      res.push({ a: O0, b: O1, out: c.out, u: c.u, lo: c.lo, hi: drop ? level : c.lo, kind: c.kind, len: s1 - s0, edge: c.edge, top });
    }
    return res;
  }

  // --------------------------------------------------------------------------------- sculpture ----
  /** A striding lion of dark stone on a plinth: body length about 2.6 m, 1.95 m to the top of the mane (o.scale). */
  function lion(B, key, x, y, z, az, o = {}) {
    const s = o.scale ?? 1, f = frame([x, z], az), w = B.near.w(key);      // local -z is the way the lion looks
    const bx = (x0, z0, x1, z1, y0, y1) => prismInto(w, f.rect(x0 * s, z0 * s, x1 * s, z1 * s), y + y0 * s, y + y1 * s, { bottom: true });
    const ph = o.plinth ?? 0.7;
    prismInto(B.near.w(o.plinthKey || key), f.rect(-0.75 * s, -1.75 * s, 0.75 * s, 1.75 * s), y - 0.5, y + ph, {});
    const Y = ph / s;
    bx(-0.36, -1.0, 0.36, 1.15, Y + 0.72, Y + 1.42);           // body
    bx(-0.45, -1.3, 0.45, -0.55, Y + 0.78, Y + 1.72);          // chest and mane
    bx(-0.3, -1.72, 0.3, -1.22, Y + 1.2, Y + 1.95);            // head
    bx(-0.2, -1.95, 0.2, -1.7, Y + 1.25, Y + 1.6);             // muzzle
    for (const sx of [-1, 1]) {
      bx(sx * 0.4 - 0.14, -1.12, sx * 0.4 + 0.14, -0.78, Y, Y + 0.8);          // fore legs
      bx(sx * 0.36 - 0.15, 0.62, sx * 0.36 + 0.15, 1.02, Y, Y + 0.8);          // hind legs
      bx(sx * 0.4 - 0.16, -1.32, sx * 0.4 + 0.16, -0.78, Y, Y + 0.16);         // paws
    }
    beam(w, [...f.L(0, 1.1 * s).slice(0, 1), y + (Y + 1.3) * s, f.L(0, 1.1 * s)[1]], [f.L(0.1 * s, 1.45 * s)[0], y + (Y + 0.5) * s, f.L(0.1 * s, 1.45 * s)[1]], 0.14 * s);   // tail, hanging
    const wf = B.far.w(key); prismInto(wf, f.rect(-0.75 * s, -1.75 * s, 0.75 * s, 1.75 * s), y - 0.5, y + ph + 1.6 * s, {});
  }
  /** A stele (slab with a rounded head) or a standing statue on a pedestal: trophies of the palace. */
  function stele(B, key, x, y, z, az, o = {}) {
    const f = frame([x, z], az), w = B.near.w(key), h = o.height ?? 1.3, wd = o.width ?? 0.7, th = o.thick ?? 0.28, ph = o.plinth ?? 0.5;
    prismInto(B.near.w(o.plinthKey || B.brick || 'brick'), f.rect(-wd / 2 - 0.25, -th / 2 - 0.25, wd / 2 + 0.25, th / 2 + 0.25), y - 0.4, y + ph, {});
    if (o.statue) {
      prismInto(w, f.rect(-0.3, -0.24, 0.3, 0.24), y + ph, y + ph + h * 0.55, {});
      prismInto(w, f.rect(-0.26, -0.2, 0.26, 0.2), y + ph + h * 0.55, y + ph + h * 0.84, {});
      prismInto(w, f.rect(-0.14, -0.15, 0.14, 0.15), y + ph + h * 0.84, y + ph + h, {});
    } else {
      prismInto(w, f.rect(-wd / 2, -th / 2, wd / 2, th / 2), y + ph, y + ph + h * 0.82, {});
      prismInto(w, f.rect(-wd * 0.36, -th / 2, wd * 0.36, th / 2), y + ph + h * 0.82, y + ph + h * 0.94, {});
      prismInto(w, f.rect(-wd * 0.2, -th / 2, wd * 0.2, th / 2), y + ph + h * 0.94, y + ph + h, {});
    }
  }

  // --------------------------------------------------------------------------- water lifting ----
  /**
   * A shaduf on a brick pier: a pole on a pivot with a clay counterweight and a hanging bucket (SPEC 3.9: tiered shadufs).
   * at: [x, z] of the pier, y: its floor, az: the way the long arm points (towards the water), tilt: -1..1.
   */
  function shaduf(B, at, y, az, o = {}) {
    const f = frame(at, az), wb = B.near.w(o.pierKey || B.brick || 'brick'), wt = B.near.w('timber'), ht = o.pier ?? 2.3, tilt = o.tilt ?? 0.3;
    for (const sx of [-0.45, 0.45]) prismInto(wb, f.rect(sx - 0.2, -0.25, sx + 0.2, 0.25), y - 0.4, y + ht, {});
    const pA = f.L(-0.7, 0), pB = f.L(0.7, 0);
    beam(wt, [pA[0], y + ht - 0.15, pA[1]], [pB[0], y + ht - 0.15, pB[1]], 0.14);
    const la = o.arm ?? 3.8, sa = 1.5, dy = Math.sin(tilt * 0.55), dx = Math.cos(tilt * 0.55);
    const tip = f.L(0, -la * dx), tail = f.L(0, sa * dx), yt = y + ht - 0.05 - la * dy, yb = y + ht - 0.05 + sa * dy;
    beam(wt, [tail[0], yb, tail[1]], [tip[0], yt, tip[1]], 0.13, 0.09);
    const wc = B.near.w('clay');
    prismInto(wc, rectAt(tail[0], tail[1], 0.5, 0.5, az + 20), yb - 0.3, yb + 0.25, { bottom: true });
    const drop = o.rope ?? 2.4;
    beam(wt, [tip[0], yt, tip[1]], [tip[0], yt - drop, tip[1]], 0.035);
    prismInto(wc, rectAt(tip[0], tip[1], 0.34, 0.34, az), yt - drop - 0.36, yt - drop, { bottom: true });
    B.far.w(o.pierKey || 'brick');
  }
  /** A rope-and-pulley well over a square brick shaft: kerb, two posts, a cross beam with a wheel, a trough. */
  function well(B, at, y, az, o = {}) {
    const f = frame(at, az), wb = B.near.w(o.key || B.brick || 'brick'), wt = B.near.w('timber'), s = o.size ?? 1.2;
    const outer = f.rect(-s, -s, s, s), inner = f.rect(-s + 0.38, -s + 0.38, s - 0.38, s - 0.38);
    sides(wb, outer, y - 0.4, y + 0.75, true); sides(wb, inner, y - 3.5, y + 0.75, false);
    { const flat = [], hs = [4]; for (const p of outer) flat.push(p[0], p[1]); for (const p of inner) flat.push(p[0], p[1]); wb.polygon(flat, hs, y + 0.75, true); }
    const wd = B.near.w('dark'); poly(wd, inner, y - 3.4, [], true);
    for (const sx of [-1, 1]) { const p = f.L(sx * (s + 0.12), 0); beam(wt, [p[0], y - 0.2, p[1]], [p[0], y + 2.9, p[1]], 0.2); }
    const a = f.L(-s - 0.3, 0), b = f.L(s + 0.3, 0);
    beam(wt, [a[0], y + 2.8, a[1]], [b[0], y + 2.8, b[1]], 0.18);
    const c = f.L(0, 0); prismInto(wt, rectAt(c[0], c[1], 0.12, 0.5, az), y + 2.36, y + 2.74, { bottom: true });
    beam(wt, [c[0], y + 2.4, c[1]], [c[0], y + 0.9, c[1]], 0.035);
  }
  /** A brick basin with water: local rectangle in frame f. */
  function basin(B, f, x0, z0, x1, z1, y, o = {}) {
    const wb = B.near.w(o.key || B.brick || 'brick'), hgt = o.height ?? 0.55, t = 0.3;
    const outer = f.rect(x0, z0, x1, z1), inner = f.rect(x0 + t, z0 + t, x1 - t, z1 - t);
    sides(wb, outer, y - 0.4, y + hgt, true); sides(wb, inner, y + 0.05, y + hgt, false);
    { const flat = [], hs = [4]; for (const p of outer) flat.push(p[0], p[1]); for (const p of inner) flat.push(p[0], p[1]); wb.polygon(flat, hs, y + hgt, true); }
    poly(B.near.w('water'), inner, y + hgt - 0.14, [], true);
  }
  /** A narrow brick water channel between plan points a and b at level y (two kerbs, water between). */
  function channel(B, a, b, y, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], r = [-u[1], u[0]], wb = B.near.w(o.key || B.brick || 'brick'), ww = o.width ?? 0.42, kw = 0.16, kh = o.height ?? 0.2;
    const P = (s, d) => [a[0] + u[0] * s + r[0] * d, a[1] + u[1] * s + r[1] * d];
    for (const sd of [-1, 1]) prismInto(wb, [P(0, sd * ww / 2), P(L, sd * ww / 2), P(L, sd * (ww / 2 + kw)), P(0, sd * (ww / 2 + kw))], y - 0.3, y + kh, {});
    H(B.near.w('water'), P(0, -ww / 2), P(L, -ww / 2), P(L, ww / 2), P(0, ww / 2), y + kh - 0.07);
  }

  return { makeBag, frame, Q, V, V2, H, sides, poly, prismInto, rectAt, block, beam, boxL, merlonRow, enclosure, freeRects, clipHalf, fabric, portalFace, door, beamEnds, spouts, flight, rampBetween, retain, lion, stele, shaduf, well, basin, channel, meet };
}
