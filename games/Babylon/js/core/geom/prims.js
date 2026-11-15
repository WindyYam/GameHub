// geom/prims.js — primitive builders. All return world-space, INDEXED BufferGeometry (position + normal, and
// uv / color / ao where stated): closed, non-overlapping shells with outward normals.
// OWNER: geometry engineer. Signatures of ENGINE.md 5.4 are kept; additions are documented in docs/geom.md.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../mathx.js';
import { MeshWriter, flattenRings, valAt } from './mesh.js';

/** Vertical faces of a ring from y0 to y1 (numbers or (x, z) => y) into writer w. outward: faces look away from the interior. */
export function sidesInto(w, ring, y0, y1, outward = true) {
  const r = M.openRing(ring), cw = M.polygonArea(r) > 0, n = r.length;
  const f0 = typeof y0 === 'function', f1 = typeof y1 === 'function';
  for (let i = 0; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    const py0 = f0 ? y0(p[0], p[1]) : y0, qy0 = f0 ? y0(q[0], q[1]) : y0, py1 = f1 ? y1(p[0], p[1]) : y1, qy1 = f1 ? y1(q[0], q[1]) : y1;
    // quad (p0, q0, q1, p1) faces the right of travel; a clockwise ring has its interior on the right
    if (cw === outward) w.quad(q[0], qy0, q[1], p[0], py0, p[1], p[0], py1, p[1], q[0], qy1, q[1]);
    else w.quad(p[0], py0, p[1], q[0], qy0, q[1], q[0], qy1, q[1], p[0], py1, p[1]);
  }
}

/** Inset (k > 0) or outset (k < 0) a ring by k metres with mitred corners. Returns an OPEN ring with the same vertex count and order. */
export function insetRing(ring, k) {
  const r = M.openRing(ring);
  if (!k) return r.map((p) => [p[0], p[1]]);
  return M.offsetPolyline(r, M.polygonArea(r) > 0 ? k : -k, true);   // clockwise ring: interior on the right
}

export function makePrims(ctx) {
  const groundLevel = (sink) => (x, z) => ctx.ground.height(x, z) - sink;

  /** Flat polygon at level y (number or (x, z) => y). up = false flips it to face down. */
  function cap(ring, y, { holes = [], up = true } = {}) {
    const w = new MeshWriter(), f = flattenRings(ring, holes);
    w.polygon(f.flat, f.holeStarts, y, up);
    return w.toGeometry();
  }

  /**
   * Extrude a closed [x, z] ring from level y0 to y1 (numbers or (x, z) => y). Either winding.
   * opts: { holes: ring[] (courts: get inward-facing walls), top: true, bottom: false, sides: true,
   *         batter: 0 (the top outline is inset by batter x height: sloping faces; no holes then) }
   */
  function prism(ring, y0, y1, { holes = [], top = true, bottom = false, sides = true, batter = 0 } = {}) {
    const w = new MeshWriter();
    if (batter && typeof y0 === 'number' && typeof y1 === 'number') {
      const lo = M.openRing(ring), hi = insetRing(ring, batter * (y1 - y0)), cw = M.polygonArea(lo) > 0, n = lo.length;
      if (sides) for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, p = lo[i], q = lo[j], P = hi[i], Q = hi[j];
        if (cw) w.quad(q[0], y0, q[1], p[0], y0, p[1], P[0], y1, P[1], Q[0], y1, Q[1]); else w.quad(p[0], y0, p[1], q[0], y0, q[1], Q[0], y1, Q[1], P[0], y1, P[1]);
      }
      if (top) { const f = flattenRings(hi); w.polygon(f.flat, f.holeStarts, y1, true); }
      if (bottom) { const f = flattenRings(lo); w.polygon(f.flat, f.holeStarts, y0, false); }
      return w.toGeometry();
    }
    if (sides) { sidesInto(w, ring, y0, y1, true); for (const h of holes) sidesInto(w, h, y0, y1, false); }
    if (top || bottom) {
      const f = flattenRings(ring, holes);
      if (top) w.polygon(f.flat, f.holeStarts, y1, true);
      if (bottom) w.polygon(f.flat, f.holeStarts, y0, false);
    }
    return w.toGeometry();
  }

  /** Box: centre (x, z), size sx (along local x) by sz, levels y0..y1, rotDeg clockwise seen from above. opts: bottom (true), batter. */
  function box({ x, z, y0, y1, sx, sz, rotDeg = 0, bottom = true, batter = 0 }) {
    return prism(M.rectRing(x, z, sx, sz, rotDeg), y0, y1, { bottom, batter });
  }
  /** Plain wall tower (a box): w = frontage, d = depth. The parapeted tower of the kit is geom.kit.wallTower(). */
  const tower = ({ x, z, w, d, rotDeg = 0, base, top, batter = 0 }) => box({ x, z, y0: base, y1: top, sx: w, sz: d, rotDeg, batter, bottom: false });

  /**
   * Thick wall along a polyline CENTRELINE with mitred joints: a closed shell (two faces, top, end caps).
   * opts: { thickness (at the top), base, top: number | (x, z, s, i) => level (s = chainage), base may also be the string
   *         'ground' (the wall foot follows ctx.ground.height, sunk by `sink`, default 0.6 m),
   *         offset: m (shift the whole wall to the RIGHT of travel if > 0), closed: false, caps: true (end faces),
   *         step: m (resample so that base / top functions are followed; default: vertices only),
   *         batter: horizontal run per metre of height, each face (the foot is wider than the top),
   *         stepped: false (true: the top is level on every segment, taken at its midpoint, with risers between
   *                  segments: walls that step down tower by tower),
   *         topFace: true, bottom: false }
   */
  function wall(polyline, { thickness, base = 0, top, offset = 0, closed = false, caps = true, step = 0, batter = 0, stepped = false, topFace = true, bottom = false, sink = 0.6 } = {}) {
    let pl = closed ? M.openRing(polyline) : polyline;
    if (step > 0) { pl = M.resamplePolyline(closed ? [...pl, pl[0]] : pl, step); if (closed) pl = pl.slice(0, -1); }
    if (base === 'ground') base = groundLevel(sink);
    const n = pl.length, last = closed ? n : n - 1, ch = M.chainage(pl), U = M.offsetPolyline(pl, 1, closed);
    const b = new Float64Array(n), t = new Float64Array(n);
    for (let i = 0; i < n; i++) { b[i] = valAt(base, pl[i][0], pl[i][1], ch[i], i); t[i] = valAt(top, pl[i][0], pl[i][1], ch[i], i); }
    const oR = offset + thickness / 2, oL = offset - thickness / 2;
    // points: side +1 right / -1 left, at the top (no batter) or the foot (batter widens it by batter x height)
    const px = (i, o) => pl[i][0] + (U[i][0] - pl[i][0]) * o, pz = (i, o) => pl[i][1] + (U[i][1] - pl[i][1]) * o;
    const w = new MeshWriter({ verts: last * 16 + 16 });
    let prevTop = null;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      let ti = t[i], tj = t[j];
      if (stepped) { const mx = (pl[i][0] + pl[j][0]) / 2, mz = (pl[i][1] + pl[j][1]) / 2; ti = tj = valAt(top, mx, mz, (ch[i] + (j ? ch[j] : ch[i] + Math.hypot(pl[j][0] - pl[i][0], pl[j][1] - pl[i][1]))) / 2, i); }
      const hi = batter * Math.max(0, ti - b[i]), hj = batter * Math.max(0, tj - b[j]);
      const rx0 = px(i, oR), rz0 = pz(i, oR), rx1 = px(j, oR), rz1 = pz(j, oR), lx0 = px(i, oL), lz0 = pz(i, oL), lx1 = px(j, oL), lz1 = pz(j, oL);
      const Rx0 = px(i, oR + hi), Rz0 = pz(i, oR + hi), Rx1 = px(j, oR + hj), Rz1 = pz(j, oR + hj), Lx0 = px(i, oL - hi), Lz0 = pz(i, oL - hi), Lx1 = px(j, oL - hj), Lz1 = pz(j, oL - hj);
      w.quad(Rx0, b[i], Rz0, Rx1, b[j], Rz1, rx1, tj, rz1, rx0, ti, rz0);        // right face
      w.quad(Lx1, b[j], Lz1, Lx0, b[i], Lz0, lx0, ti, lz0, lx1, tj, lz1);        // left face
      if (topFace) w.quad(lx0, ti, lz0, rx0, ti, rz0, rx1, tj, rz1, lx1, tj, lz1);
      if (bottom) w.quad(Rx0, b[i], Rz0, Lx0, b[i], Lz0, Lx1, b[j], Lz1, Rx1, b[j], Rz1);
      if (stepped && prevTop !== null && Math.abs(prevTop - ti) > 1e-6) {
        // riser across the wall at vertex i: faces forward if the wall steps down, backward if it steps up
        const lo = Math.min(prevTop, ti), hgt = Math.max(prevTop, ti);
        if (prevTop > ti) w.quad(rx0, lo, rz0, lx0, lo, lz0, lx0, hgt, lz0, rx0, hgt, rz0); else w.quad(lx0, lo, lz0, rx0, lo, rz0, rx0, hgt, rz0, lx0, hgt, lz0);
      }
      prevTop = ti;
      if (caps && !closed) {
        if (i === 0) w.quad(Lx0, b[0], Lz0, Rx0, b[0], Rz0, rx0, ti, rz0, lx0, ti, lz0);
        if (i === last - 1) w.quad(Rx1, b[j], Rz1, Lx1, b[j], Lz1, lx1, tj, lz1, rx1, tj, rz1);
      }
    }
    return w.toGeometry();
  }

  /**
   * Flat strip along a polyline (streets, water ribbons, paths), smooth normals.
   * opts: { width: m | widths: m[] per vertex, y: number | number[] per vertex | (x, z, s, i) => level,
   *         offset: m to the right, lift: m added to y, step: m resample (so a y function follows the ground),
   *         uv: false (true: u = 0 left .. 1 right, v = chainage in metres) }
   */
  function ribbon(polyline, { width = 4, widths = null, y = 0, offset = 0, lift = 0, step = 0, uv = false } = {}) {
    let pl = polyline, ws = widths, ys = Array.isArray(y) ? y : null;
    if (step > 0) {
      const src = polyline;
      pl = M.resamplePolyline(src, step);
      const at = (arr, p) => M.valueAlong(arr, M.nearestOnPolyline(p[0], p[1], src));
      if (ws) ws = pl.map((p) => at(widths, p));
      if (ys) ys = pl.map((p) => at(y, p));
    }
    const ch = M.chainage(pl), n = pl.length, fn = typeof y === 'function';
    const w = new MeshWriter({ verts: n * 2, uv });
    for (let i = 0; i < n; i++) {
      const a = pl[Math.max(0, i - 1)], b = pl[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const rx = -(b[1] - a[1]) / l, rz = (b[0] - a[0]) / l, wd = ws ? ws[i] : width;
      for (const side of [-1, 1]) {
        const k = offset + (side * wd) / 2, x = pl[i][0] + rx * k, z = pl[i][1] + rz * k;
        const yy = (ys ? ys[i] : fn ? y(x, z, ch[i], i) : y) + lift;
        w.vert(x, yy, z, 0, 1, 0, side < 0 ? 0 : 1, ch[i]);
      }
    }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; w.tri(a, a + 1, a + 3); w.tri(a, a + 3, a + 2); }
    w._slopeNormals(0, n * 2, true);
    return w.toGeometry();
  }

  /**
   * One rectangle with a UV rectangle (relief panels, signs, decals on walls).
   * origin = lower-left corner [x, y, z] as seen by the viewer, right and up = unit-ish vectors [x, y, z];
   * opts: { width, height (m), uv: [u0, v0, u1, v1] (default 0, 0, 1, 1), lift: m along the normal (default 0) }
   * The quad faces right x up.
   */
  function quad(origin, right, up, { width = 1, height = 1, uv = [0, 0, 1, 1], lift = 0 } = {}) {
    const w = new MeshWriter({ verts: 4, uv: true });
    quadInto(w, origin, right, up, width, height, uv, lift);
    return w.toGeometry();
  }
  function quadInto(w, origin, right, up, width, height, uv = [0, 0, 1, 1], lift = 0) {
    const rl = Math.hypot(right[0], right[1], right[2]) || 1, ul = Math.hypot(up[0], up[1], up[2]) || 1;
    const rx = (right[0] / rl) * width, ry = (right[1] / rl) * width, rz = (right[2] / rl) * width, ux = (up[0] / ul) * height, uy = (up[1] / ul) * height, uz = (up[2] / ul) * height;
    let nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const ox = origin[0] + nx * lift, oy = origin[1] + ny * lift, oz = origin[2] + nz * lift;
    return w.quadUV(ox, oy, oz, ox + rx, oy + ry, oz + rz, ox + rx + ux, oy + ry + uy, oz + rz + uz, ox + ux, oy + uy, oz + uz, uv[0], uv[1], uv[2], uv[3]);
  }
  /** Many UV quads in one geometry: list of { origin, right, up, width, height, uv, lift, color }. */
  function quads(list) {
    const w = new MeshWriter({ verts: list.length * 4, uv: true });
    for (const q of list) { if (q.color !== undefined) w.color(q.color); quadInto(w, q.origin, q.right, q.up, q.width ?? 1, q.height ?? 1, q.uv, q.lift ?? 0); }
    return w.toGeometry();
  }

  /**
   * Decal: a flat polygon lying `lift` m above a surface (paving patterns, stains, glow patches). Draw it with
   * geom.decalMaterial(id) (polygon offset) or submit it with geom.addDecal(). y: number or (x, z) => y.
   */
  function decal(ring, y, { holes = [], lift = 0.03 } = {}) {
    return cap(ring, typeof y === 'function' ? (x, z) => y(x, z) + lift : y + lift, { holes });
  }

  /**
   * Straight flight of stairs with true risers and treads. Foot at (x, z) on level `base`, climbing along model
   * azimuth `azDeg`, `steps` risers of `riser` m and treads of `tread` m, `width` m wide. Closed underneath.
   * opts: sink: 0 (the cheeks and the back continue this far below `base`), back: true (rear face),
   *       parapet: { height: 1, thickness: 0.5 } | null (side walls following the slope, outside the width)
   */
  function stairs({ x, z, azDeg = 0, width, steps, riser, tread, base = 0, sink = 0, back = true, parapet = null }) {
    const d = M.azToDir(azDeg), r = M.rightOf(d[0], d[1]), hw = width / 2, w = new MeshWriter({ verts: steps * 16 + 32 });
    const lo = base - sink;
    const P = (along, side, y) => [x + d[0] * along + r[0] * side, y, z + d[1] * along + r[1] * side];
    for (let i = 0; i < steps; i++) {
      const a0 = i * tread, a1 = (i + 1) * tread, y0 = base + i * riser, y1 = base + (i + 1) * riser;
      w.quadP(P(a0, -hw, y0), P(a0, hw, y0), P(a0, hw, y1), P(a0, -hw, y1));       // riser
      w.quadP(P(a0, -hw, y1), P(a0, hw, y1), P(a1, hw, y1), P(a1, -hw, y1));       // tread
      if (!parapet) {
        w.quadP(P(a0, hw, lo), P(a1, hw, lo), P(a1, hw, y1), P(a0, hw, y1));       // right cheek
        w.quadP(P(a1, -hw, lo), P(a0, -hw, lo), P(a0, -hw, y1), P(a1, -hw, y1));   // left cheek
      }
    }
    const run = steps * tread, topY = base + steps * riser;
    if (sink > 0) w.quadP(P(0, -hw, lo), P(0, hw, lo), P(0, hw, base), P(0, -hw, base));                  // the front below the first riser
    if (back) w.quadP(P(run, hw, lo), P(run, -hw, lo), P(run, -hw, topY), P(run, hw, topY));
    if (parapet) {
      const ph = parapet.height ?? 1, pt = parapet.thickness ?? 0.5;
      for (const side of [-1, 1]) {
        const o = side * (hw + pt / 2), a = P(0, o, 0), b = P(run, o, 0);
        w.append(new MeshWriter().append(geomArrays(wall([[a[0], a[2]], [b[0], b[2]]], { thickness: pt, base: lo, top: (px, pz, s) => base + (s / tread) * riser + ph }))));
      }
    }
    return w.toGeometry();
  }
  const geomArrays = (g) => ({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col: null, uv: null, ao: null, idx: g.index.array, nv: g.attributes.position.count, ni: g.index.count });

  /**
   * Ramp (wedge): foot at (x, z) on level `base`, rising `rise` m over `length` m along model azimuth azDeg.
   * opts: sink (sides continue below base), back: true, parapet as for stairs.
   * A ramp along a polyline is geom.wall(polyline, { thickness: width, base, top: (x, z, s) => level }).
   */
  function ramp({ x, z, azDeg = 0, width, length, rise, base = 0, sink = 0, back = true }) {
    const d = M.azToDir(azDeg), r = M.rightOf(d[0], d[1]), hw = width / 2, w = new MeshWriter({ verts: 24 }), lo = base - sink, top = base + rise;
    const P = (along, side, y) => [x + d[0] * along + r[0] * side, y, z + d[1] * along + r[1] * side];
    w.quadP(P(0, -hw, base), P(0, hw, base), P(length, hw, top), P(length, -hw, top));                 // slope
    w.quadP(P(0, hw, lo), P(length, hw, lo), P(length, hw, top), P(0, hw, base));                      // right side
    w.quadP(P(length, -hw, lo), P(0, -hw, lo), P(0, -hw, base), P(length, -hw, top));                  // left side
    if (back) w.quadP(P(length, hw, lo), P(length, -hw, lo), P(length, -hw, top), P(length, hw, top));
    if (sink > 0) w.quadP(P(0, -hw, lo), P(0, hw, lo), P(0, hw, base), P(0, -hw, base));
    return w.toGeometry();
  }

  /**
   * Custom buffers -> BufferGeometry that the batcher accepts.
   * spec: { position: number[] | Float32Array (xyz), index?: number[], normal?: (xyz; flat normals are computed
   *         if absent), color?: (rgb linear multipliers), uv?: (uv), ao?: (extra occlusion 0..1) }
   */
  function custom({ position, index = null, normal = null, color = null, uv = null, ao = null }) {
    const g = new THREE.BufferGeometry(), f = (a) => (a instanceof Float32Array ? a : new Float32Array(a));
    g.setAttribute('position', new THREE.BufferAttribute(f(position), 3));
    if (index) g.setIndex(new THREE.BufferAttribute(index instanceof Uint32Array ? index : new Uint32Array(index), 1));
    decorate(g, color, uv, ao);
    if (normal) g.setAttribute('normal', new THREE.BufferAttribute(f(normal), 3));
    else if (index) { const ni = g.toNonIndexed(); ni.computeVertexNormals(); g.dispose(); return ni; }      // flat normals; colour, uv and ao travel with the vertices
    else g.computeVertexNormals();
    return g;
  }
  function decorate(g, color, uv, ao) {
    const f = (a) => (a instanceof Float32Array ? a : new Float32Array(a));
    if (color) g.setAttribute('color', new THREE.BufferAttribute(f(color), 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(f(uv), 2));
    if (ao) g.setAttribute('ao', new THREE.BufferAttribute(f(ao), 1));
    return g;
  }

  return { cap, prism, box, tower, wall, ribbon, quad, quads, quadInto, decal, stairs, ramp, custom };
}
