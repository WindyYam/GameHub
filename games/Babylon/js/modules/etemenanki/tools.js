// js/modules/etemenanki/tools.js — small geometry tools of the etemenanki module (all world space, true scale).
//   quadF          a quad wound to face a given normal, with per-vertex extra occlusion
//   facadeInto     a wall face with recesses of any plan outline, each between its own two levels (niches,
//                  grooves, doors, slots), with jambs, sills and soffits: one closed skin
//   blockInto      a flat-roofed building block on a ring: a facade per edge, courts, parapets, roof slab
//   flightInto     a straight flight of true steps with stepped cheek walls (brick parapets step, they do not slope)
//   parapetRing    a battered parapet round a terrace, with gaps
// Everything is written into MeshWriters (ctx.geom.writer()); the module merges one writer per material.
import * as M from '../../core/mathx.js';

export function makeTools(ctx) {
  const { geom } = ctx;

  /** Clockwise (interior on the right) open copy of a ring. */
  const cw = (ring) => { const o = M.openRing(ring).map((p) => [p[0], p[1]]); return M.polygonArea(o) > 0 ? o : o.reverse(); };
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  /** Quad A, B, C, D ([x, y, z], any winding) wound so that it faces (nx, ny, nz); oA..oD = extra occlusion per vertex. */
  function quadF(w, A, B, C, D, nx, ny, nz, oA = 1, oB = 1, oC = 1, oD = 1) {
    const ux = C[0] - A[0], uy = C[1] - A[1], uz = C[2] - A[2], vx = D[0] - B[0], vy = D[1] - B[1], vz = D[2] - B[2];
    const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    const occ = oA < 1 || oB < 1 || oC < 1 || oD < 1;
    if (dot >= 0) { const i = w.quadP(A, B, C, D); if (i >= 0 && occ) w.quadAO(i, oA, oB, oC, oD); return i; }
    const i = w.quadP(A, D, C, B); if (i >= 0 && occ) w.quadAO(i, oA, oD, oC, oB); return i;
  }

  /** Frame of a wall face from a to b that looks to the right (side +1) or left (side -1) of travel. */
  function frame(a, b, side = -1) {
    const len = dist(a, b) || 1e-9, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = -dz * side, nz = dx * side;
    return {
      a, b, len, dx, dz, nx, nz, side,
      /** point s metres along the face, d metres INTO the wall, at level y */
      P: (s, d, y) => [a[0] + dx * s - nx * d, y, a[1] + dz * s - nz * d],
      p2: (s, d) => [a[0] + dx * s - nx * d, a[1] + dz * s - nz * d],
    };
  }

  /**
   * Plan outline of a recess from (s0, 0) to (s1, 0): [[s, depth], ...].
   * opts: steps (stepped reveals), stepWidth, grooves: [{ at, width, depth }] slots in the back face (at = centre s).
   */
  function notchOutline(s0, s1, depth, { steps = 1, stepWidth = 0.3, grooves = null } = {}) {
    const pts = [];
    for (let j = 0; j < steps; j++) { const a = s0 + j * stepWidth; pts.push([a, (j * depth) / steps], [a, ((j + 1) * depth) / steps]); }
    if (grooves) for (const g of grooves) { const a = g.at - g.width / 2, b = g.at + g.width / 2; pts.push([a, depth], [a, depth + g.depth], [b, depth + g.depth], [b, depth]); }
    for (let j = steps - 1; j >= 0; j--) { const a = s1 - j * stepWidth; pts.push([a, ((j + 1) * depth) / steps], [a, (j * depth) / steps]); }
    return pts;
  }

  /**
   * A wall face from plan point a to b between the levels base and top, with recesses.
   * notches: [{ s0, s1, depth, y0, y1, steps?, stepWidth?, grooves?, pts? }] (must not overlap along s where their
   * level ranges overlap). opts: side (-1: the face looks to the LEFT of travel a -> b), dRef (depth of full
   * occlusion). Returns the frame.
   */
  function facadeInto(w, a, b, base, top, notches, { side = -1, dRef = 0.5, maxSeg = 4.6, maxBand = 4.2, ground = null } = {}) {
    const f = frame(a, b, side), eps = 1e-4;
    const ns = (notches || []).filter((n) => n.s1 > n.s0 + 1e-3 && Math.min(top, n.y1) > Math.max(base, n.y0) + 1e-3 && n.s0 > -1e-6 && n.s1 < f.len + 1e-6)
      .map((n) => ({ s0: n.s0, y0: Math.max(base, n.y0), y1: Math.min(top, n.y1), pts: n.pts || notchOutline(n.s0, n.s1, n.depth, n) })).sort((p, q) => p.s0 - q.s0);
    // levels: the foot and top, the levels of the recesses, the ground and the height to which the baked contact
    // shadow reaches above it; no band taller than maxBand (the baked occlusion is per vertex: a face needs
    // vertices where the light changes, or one dark corner greys a whole wall)
    const lv = [base, top, ...ns.flatMap((n) => [n.y0, n.y1])];
    if (ground !== null) for (const g of [ground, ground + 1.7]) if (g > base + 0.3 && g < top - 0.3) lv.push(g);
    const y0s = [...new Set(lv.map((v) => +v.toFixed(4)))].sort((p, q) => p - q), ys = [];
    for (let k = 0; k < y0s.length - 1; k++) { const n = Math.max(1, Math.ceil((y0s[k + 1] - y0s[k]) / maxBand - 1e-6)); for (let q = 0; q < n; q++) ys.push(y0s[k] + ((y0s[k + 1] - y0s[k]) * q) / n); }
    ys.push(y0s[y0s.length - 1]);
    const occ = (d) => 1 - 0.26 * Math.min(1, d / dRef);
    for (let k = 0; k < ys.length - 1; k++) {
      const ya = ys[k], yb = ys[k + 1];
      if (yb - ya < eps) continue;
      const pts = [[0, 0]];
      for (const n of ns) if (n.y0 <= ya + eps && n.y1 >= yb - eps) for (const p of n.pts) pts.push(p);
      pts.push([f.len, 0]);
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], ds = q[0] - p[0], dd = q[1] - p[1], l = Math.hypot(ds, dd);
        if (l < 1e-6) continue;
        const nx = (f.nx * ds + f.dx * dd) / l, nz = (f.nz * ds + f.dz * dd) / l, m = Math.abs(dd) < 1e-6 ? Math.max(1, Math.ceil(l / maxSeg - 1e-6)) : 1;
        for (let j = 0; j < m; j++) {
          const s0 = p[0] + (ds * j) / m, s1 = p[0] + (ds * (j + 1)) / m, d0 = p[1] + (dd * j) / m, d1 = p[1] + (dd * (j + 1)) / m;
          quadF(w, f.P(s0, d0, ya), f.P(s1, d1, ya), f.P(s1, d1, yb), f.P(s0, d0, yb), nx, 0, nz, occ(d0), occ(d1), occ(d1), occ(d0));
        }
      }
    }
    for (const n of ns) {
      const flat = [];
      for (const p of n.pts) { const q = f.p2(p[0], p[1]); flat.push(q[0], q[1]); }
      if (n.y0 > base + eps) { w.occlusion(0.8); w.polygon(flat, null, n.y0, true); w.occlusion(1); }
      if (n.y1 < top - eps) { w.occlusion(0.7); w.polygon(flat, null, n.y1, false); w.occlusion(1); }
    }
    return f;
  }

  /** Parapet and roof of a block: top strip and inner face of the parapet into wWall, the roof slab into wRoof. */
  function roofInto(wWall, wRoof, ring, roofLevel, top, pt, courts = []) {
    const o = cw(ring), inn = geom.insetRing(o, pt), n = o.length, par = top > roofLevel + 1e-4;
    if (par) for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = o[i], q = o[j], a = inn[i], b = inn[j], l = dist(p, q) || 1, ix = -(q[1] - p[1]) / l, iz = (q[0] - p[0]) / l;
      quadF(wWall, [p[0], top, p[1]], [q[0], top, q[1]], [b[0], top, b[1]], [a[0], top, a[1]], 0, 1, 0);
      quadF(wWall, [a[0], roofLevel, a[1]], [b[0], roofLevel, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], ix, 0, iz);
    }
    const holes = [];
    for (const c of courts) {
      const co = cw(c), out = geom.insetRing(co, -pt), m = co.length;
      holes.push(out);
      if (par) for (let i = 0; i < m; i++) {
        const j = (i + 1) % m, p = co[i], q = co[j], a = out[i], b = out[j], l = dist(p, q) || 1, ox = (q[1] - p[1]) / l, oz = -(q[0] - p[0]) / l;
        quadF(wWall, [p[0], top, p[1]], [q[0], top, q[1]], [b[0], top, b[1]], [a[0], top, a[1]], 0, 1, 0);
        quadF(wWall, [a[0], roofLevel, a[1]], [b[0], roofLevel, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], ox, 0, oz);
      }
    }
    const flat = [], hs = [];
    for (const p of par ? inn : o) flat.push(p[0], p[1]);
    for (const h of holes) { hs.push(flat.length / 2); for (const p of par ? h : cw(courts[holes.indexOf(h)])) flat.push(p[0], p[1]); }
    wRoof.polygon(flat, hs.length ? hs : null, roofLevel, true);
  }

  /**
   * A flat-roofed block on a CLOCKWISE ring: one facade per edge (notches[i] = recesses of edge i -> i + 1, s from
   * vertex i), courts (clockwise rings; courtNotches[c][i]), a parapet, the roof slab.
   * spec: { base, roof, parapet: 0.6, pt: 0.45, notches: [], courts: [], courtNotches: [], courtBase }
   * Returns { frames: [...], courtFrames: [[...]] }.
   */
  function blockInto(wWall, wRoof, ring, { base, roof, parapet = 0.6, pt = 0.45, notches = [], courts = [], courtNotches = [], courtBase = base, noRoof = false, ground = null, courtGround = null }) {
    const o = M.openRing(ring), top = roof + parapet, frames = [], courtFrames = [];
    if (M.polygonArea(o) <= 0) throw new Error('etemenanki blockInto: ring must be clockwise');
    for (let i = 0; i < o.length; i++) frames.push(facadeInto(wWall, o[i], o[(i + 1) % o.length], base, top, notches[i], { side: -1, ground: Array.isArray(ground) ? ground[i] : ground }));
    courts.forEach((c, ci) => {
      const co = M.openRing(c), fr = [];
      if (M.polygonArea(co) <= 0) throw new Error('etemenanki blockInto: court ring must be clockwise');
      for (let i = 0; i < co.length; i++) fr.push(facadeInto(wWall, co[i], co[(i + 1) % co.length], courtBase, top, (courtNotches[ci] || [])[i], { side: 1, ground: courtGround }));
      courtFrames.push(fr);
    });
    if (!noRoof) roofInto(wWall, wRoof, o, roof, top, pt, courts);
    return { frames, courtFrames, top };
  }

  /**
   * Straight flight of true steps in a frame O(along, lat, y) -> [x, y, z] (along = up the flight from the foot).
   * spec: { steps, riser, tread, base, lo (level the sides go down to), vA, vB (lateral limits of the treads: numbers
   *   or (i) => number), closeA(i) / closeB(i) (true: a side face under step i at vA / vB),
   *   cheeks: [{ vIn, vOut, group (treads per level piece), hp (height above the tread at the upper end of a piece), extend }] }
   */
  function flightInto(w, O, { steps, riser, tread, base, lo, vA, vB, closeA = null, closeB = null, cheeks = [] }) {
    const o0 = O(0, 0, 0), ou = O(1, 0, 0), ov = O(0, 1, 0);
    const u = [ou[0] - o0[0], 0, ou[2] - o0[2]], v = [ov[0] - o0[0], 0, ov[2] - o0[2]];
    const fn = (q) => (typeof q === 'function' ? q : () => q), A = fn(vA), B = fn(vB), sgn = Math.sign(B(0) - A(0)) || 1;
    for (let i = 0; i < steps; i++) {
      const a0 = i * tread, a1 = (i + 1) * tread, y0 = base + i * riser, y1 = y0 + riser, va = A(i), vb = B(i);
      quadF(w, O(a0, va, y0), O(a0, vb, y0), O(a0, vb, y1), O(a0, va, y1), -u[0], 0, -u[2]);
      quadF(w, O(a0, va, y1), O(a0, vb, y1), O(a1, vb, y1), O(a1, va, y1), 0, 1, 0);
      if (closeA && closeA(i)) quadF(w, O(a0, va, lo), O(a1, va, lo), O(a1, va, y1), O(a0, va, y1), -sgn * v[0], 0, -sgn * v[2]);
      if (closeB && closeB(i)) quadF(w, O(a0, vb, lo), O(a1, vb, lo), O(a1, vb, y1), O(a0, vb, y1), sgn * v[0], 0, sgn * v[2]);
    }
    for (const c of cheeks) {
      const g = c.group, n = Math.ceil(steps / g), out = Math.sign(c.vOut - c.vIn) || 1;
      let prevTop = lo;
      for (let k = 0; k < n; k++) {
        const i0 = k * g, i1 = Math.min(steps, i0 + g), a0 = i0 * tread, a1 = i1 * tread + (k === n - 1 ? c.extend || 0 : 0);
        const topK = base + i1 * riser + c.hp, yLow = base + i0 * riser;
        quadF(w, O(a0, c.vOut, lo), O(a1, c.vOut, lo), O(a1, c.vOut, topK), O(a0, c.vOut, topK), out * v[0], 0, out * v[2]);          // outer face
        quadF(w, O(a0, c.vIn, yLow), O(a1, c.vIn, yLow), O(a1, c.vIn, topK), O(a0, c.vIn, topK), -out * v[0], 0, -out * v[2]);      // face to the steps
        quadF(w, O(a0, c.vIn, topK), O(a1, c.vIn, topK), O(a1, c.vOut, topK), O(a0, c.vOut, topK), 0, 1, 0);                          // top
        quadF(w, O(a0, c.vIn, prevTop), O(a0, c.vOut, prevTop), O(a0, c.vOut, topK), O(a0, c.vIn, topK), -u[0], 0, -u[2]);            // end looking down the flight
        if (k === n - 1) quadF(w, O(a1, c.vIn, c.endLow ?? lo), O(a1, c.vOut, c.endLow ?? lo), O(a1, c.vOut, topK), O(a1, c.vIn, topK), u[0], 0, u[2]);
        prevTop = topK;
      }
    }
  }

  /**
   * Parapet round a terrace. R0: clockwise open ring = the outer edge at floor level y0; h high, th thick at the
   * foot, the outer face leaning in by batter per metre (it continues the face below). gaps: { edge: [u0, u1] } in
   * metres from the first vertex of that edge. outer: false leaves the outer face out (when a wall face below
   * already runs up to the top).
   */
  function parapetRing(w, R0, y0, h, th, batter = 0, { gaps = {}, outer = true, coping = null } = {}) {
    const hb = coping ? h - coping.h : h, y1 = y0 + hb, y2 = y0 + h;
    const Rt = batter ? geom.insetRing(R0, batter * hb) : R0, Ri = geom.insetRing(R0, th), n = R0.length;
    const Co = coping ? geom.insetRing(Rt, -coping.out) : null, Ci = coping ? geom.insetRing(Ri, coping.out) : null;
    const V = (p, y) => [p[0], y, p[1]];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, len = dist(R0[i], R0[j]), dx = (R0[j][0] - R0[i][0]) / len, dz = (R0[j][1] - R0[i][1]) / len, ox = dz, oz = -dx;
      const runs = gaps[i] ? [[0, gaps[i][0] / len, false, true], [gaps[i][1] / len, 1, true, false]] : [[0, 1, false, false]];
      const at = (R, t) => [R[i][0] + (R[j][0] - R[i][0]) * t, R[i][1] + (R[j][1] - R[i][1]) * t];
      for (const [t0, t1, cap0, cap1] of runs) {
        const a0 = at(R0, t0), b0 = at(R0, t1), a1 = at(Rt, t0), b1 = at(Rt, t1), ai = at(Ri, t0), bi = at(Ri, t1);
        if (outer) quadF(w, V(a0, y0), V(b0, y0), V(b1, y1), V(a1, y1), ox, 0, oz);
        quadF(w, V(ai, y0), V(bi, y0), V(bi, y1), V(ai, y1), -ox, 0, -oz);
        if (cap0) quadF(w, V(a0, y0), V(ai, y0), V(ai, y1), V(a1, y1), -dx, 0, -dz);
        if (cap1) quadF(w, V(b0, y0), V(bi, y0), V(bi, y1), V(b1, y1), dx, 0, dz);
        if (!coping) { quadF(w, V(a1, y1), V(b1, y1), V(bi, y1), V(ai, y1), 0, 1, 0); continue; }
        const ao = at(Co, t0), bo = at(Co, t1), ac = at(Ci, t0), bc = at(Ci, t1);
        quadF(w, V(a1, y1), V(b1, y1), V(bo, y1), V(ao, y1), 0, -1, 0);
        quadF(w, V(ao, y1), V(bo, y1), V(bo, y2), V(ao, y2), ox, 0, oz);
        quadF(w, V(ao, y2), V(bo, y2), V(bc, y2), V(ac, y2), 0, 1, 0);
        quadF(w, V(ac, y1), V(bc, y1), V(bc, y2), V(ac, y2), -ox, 0, -oz);
        quadF(w, V(ai, y1), V(bi, y1), V(bc, y1), V(ac, y1), 0, -1, 0);
        if (cap0) quadF(w, V(ao, y1), V(ac, y1), V(ac, y2), V(ao, y2), -dx, 0, -dz);
        if (cap1) quadF(w, V(bo, y1), V(bc, y1), V(bc, y2), V(bo, y2), dx, 0, dz);
      }
    }
    return { inner: Ri, top: Rt };
  }

  /** A band between two rings with the same vertex count (Ro outside Ri, both clockwise), from y0 to y1: outer faces, top and underside. */
  function bandInto(w, Ro, Ri, y0, y1, { bottom = true } = {}) {
    const n = Ro.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = Ro[i], q = Ro[j], a = Ri[i], b = Ri[j], l = dist(p, q) || 1;
      quadF(w, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], (q[1] - p[1]) / l, 0, -(q[0] - p[0]) / l);
      quadF(w, [p[0], y1, p[1]], [q[0], y1, q[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], 0, 1, 0);
      if (bottom) quadF(w, [p[0], y0, p[1]], [q[0], y0, q[1]], [b[0], y0, b[1]], [a[0], y0, a[1]], 0, -1, 0);
    }
  }

  /** A box given by its plan ring (any winding) between two levels, into a writer, with an optional tint. */
  function boxInto(w, ring, y0, y1, { top = true, bottom = false } = {}) {
    const o = cw(ring), n = o.length;
    for (let i = 0; i < n; i++) {
      const p = o[i], q = o[(i + 1) % n], l = dist(p, q) || 1;
      quadF(w, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], (q[1] - p[1]) / l, 0, -(q[0] - p[0]) / l);
    }
    const flat = []; for (const p of o) flat.push(p[0], p[1]);
    if (top) w.polygon(flat, null, y1, true);
    if (bottom) w.polygon(flat, null, y0, false);
  }

  /** Convex clip of a polygon (list of [x, z]) by the half plane left of a -> b ... used for paving panels. Keeps the INSIDE of a clockwise convex ring. */
  function clipConvex(poly, ring) {
    let out = poly;
    const o = cw(ring);
    for (let i = 0; i < o.length && out.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length], res = [];
      const sd = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);      // > 0: right of travel = inside for a clockwise ring
      for (let k = 0; k < out.length; k++) {
        const p = out[k], q = out[(k + 1) % out.length], sp = sd(p), sq = sd(q);
        if (sp >= 0) res.push(p);
        if ((sp >= 0) !== (sq >= 0)) { const f = sp / (sp - sq); res.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]); }
      }
      out = res;
    }
    return out;
  }

  /** Intersection of the lines p + t d and q + s e (plan). */
  function lineX(p, d, q, e) {
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return [p[0], p[1]];
    const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  }

  /** Vertices of a writer whose stored normal points away from their triangle, and triangles without area (a cheap part of geom.inspect). */
  function flipped(w) {
    const P = w.pos, N = w.nor, I = w.idx; let bad = 0, flat = 0;
    for (let t = 0; t < w.ni; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz < 1e-14) { flat++; continue; }
      for (const q of [a, b, c]) if (N[q] * nx + N[q + 1] * ny + N[q + 2] * nz < 0) bad++;
    }
    return { flipped: bad, degenerate: flat, tris: w.ni / 3 };
  }

  return { flipped, cw, dist, quadF, frame, notchOutline, facadeInto, roofInto, blockInto, flightInto, parapetRing, bandInto, boxInto, clipConvex, lineX };
}
