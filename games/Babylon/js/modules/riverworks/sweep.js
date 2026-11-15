// js/modules/riverworks/sweep.js — frames along a bank line and the profile sweep every quay is made of.
//
// A bank line is a polyline of ctx.ground.hardEdges with a land side. Along it:
//   s = chainage (m), d = distance from the line toward the LAND (negative = out in the water), y = datum level.
// A profile is a closed polygon in the (d, y) plane; sweeping it through a list of stations gives a closed solid
// with mitred joints at the vertices of the line. Profile points carry a tint (vertex colour multiplier), so
// tide marks, splash zones and drain stains are painted by the geometry itself.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../../core/mathx.js';

/** Frames along a polyline. land = +1: land on the right of travel, -1: on the left. */
export function makeLine(polyline, land) {
  const pl = polyline.map((p) => [p[0], p[1]]), n = pl.length, ch = M.chainage(pl), length = ch[n - 1];
  const off = M.offsetPolyline(pl, land, false);                       // p + (unit normal to land) / cos(half turn)
  const seg = (i) => { const a = pl[i], b = pl[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  /** Frame at chainage s: { s, x, z, nx, nz (toward land; longer than 1 on a mitre), tx, tz (unit, along travel), vertex } */
  function at(s) {
    s = Math.min(length, Math.max(0, s));
    for (let i = 0; i < n; i++) if (Math.abs(ch[i] - s) < 1e-3) {
      const a = seg(Math.max(0, i - 1)), b = seg(Math.min(n - 2, i));
      let tx = a[0] + b[0], tz = a[1] + b[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      return { s, x: pl[i][0], z: pl[i][1], nx: off[i][0] - pl[i][0], nz: off[i][1] - pl[i][1], tx, tz, vertex: i };
    }
    let i = 0; while (i < n - 2 && ch[i + 1] < s) i++;
    const t = seg(i), k = s - ch[i], r = M.rightOf(t[0], t[1]);
    return { s, x: pl[i][0] + t[0] * k, z: pl[i][1] + t[1] * k, nx: r[0] * land, nz: r[1] * land, tx: t[0], tz: t[1], vertex: -1 };
  }
  /** Plan point at (s, d). */
  const point = (s, d) => { const f = at(s); return [f.x + f.nx * d, f.z + f.nz * d]; };
  /** Chainage of the point of the line nearest to (x, z), and its distance toward land. */
  function locate(x, z) { const h = M.nearestOnPolyline(x, z, pl); return { s: h.s, d: h.dist * (h.side === land ? 1 : -1), dist: h.dist }; }
  /** Chainages of the interior vertices. */
  const vertices = ch.slice(1, -1);
  return { polyline: pl, land, length, at, point, locate, vertices, chainage: ch };
}

const colOf = (c) => (c === undefined ? [1, 1, 1] : typeof c === 'number' ? [c, c, c] : c);

/**
 * Sweep a profile through stations into MeshWriter w (which must use colours).
 * stations: [{ f: frame, prof: [{ d, y, c }] }] (every profile the same length and order);
 * opts: { capStart: true, capEnd: true, skip: Set of edge indices that are not drawn (edge k runs from point k to k + 1) }
 */
export function sweep(w, stations, { capStart = true, capEnd = true, skip = null } = {}) {
  if (stations.length < 2) return;
  const np = stations[0].prof.length;
  const P = (st, k) => { const q = st.prof[k], f = st.f; return [f.x + f.nx * q.d, q.y, f.z + f.nz * q.d]; };
  // winding of the profile in the (d, y) plane: > 0 counter-clockwise
  let area = 0; { const pr = stations[0].prof; for (let k = 0; k < np; k++) { const a = pr[k], b = pr[(k + 1) % np]; area += a.d * b.y - b.d * a.y; } }
  const ccw = area > 0;
  const emitTri = (a, b, c, ca, cb, cc, ex, ey, ez) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const flip = nx * ex + ny * ey + nz * ez < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    w.color(ca[0], ca[1], ca[2]); const i0 = w.vert(a[0], a[1], a[2], nx, ny, nz);
    const q1 = flip ? c : b, c1 = flip ? cc : cb, q2 = flip ? b : c, c2 = flip ? cb : cc;
    w.color(c1[0], c1[1], c1[2]); w.vert(q1[0], q1[1], q1[2], nx, ny, nz);
    w.color(c2[0], c2[1], c2[2]); w.vert(q2[0], q2[1], q2[2], nx, ny, nz);
    w.tri(i0, i0 + 1, i0 + 2);
  };
  const emitQuad = (a, b, c, d, ca, cb, cc, cd, ex, ey, ez) => {
    // a, b, c, d in order round the quad; one normal from the diagonals
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const flip = nx * ex + ny * ey + nz * ez < 0;
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const V = flip ? [a, d, c, b] : [a, b, c, d], C = flip ? [ca, cd, cc, cb] : [ca, cb, cc, cd];
    let i0 = -1;
    for (let k = 0; k < 4; k++) { w.color(C[k][0], C[k][1], C[k][2]); const i = w.vert(V[k][0], V[k][1], V[k][2], nx, ny, nz); if (k === 0) i0 = i; }
    w.tri(i0, i0 + 1, i0 + 2); w.tri(i0, i0 + 2, i0 + 3);
  };
  for (let i = 0; i < stations.length - 1; i++) {
    const A = stations[i], B = stations[i + 1];
    for (let k = 0; k < np; k++) {
      if (skip && skip.has(k)) continue;
      const k1 = (k + 1) % np, pa = A.prof[k], pb = A.prof[k1];
      let ed = pb.d - pa.d, ey = pb.y - pa.y;
      if (Math.abs(ed) < 1e-6 && Math.abs(ey) < 1e-6) { const qa = B.prof[k], qb = B.prof[k1]; ed = qb.d - qa.d; ey = qb.y - qa.y; if (Math.abs(ed) < 1e-6 && Math.abs(ey) < 1e-6) continue; }
      // outward normal of the edge in (d, y): for a counter-clockwise polygon it is (ey, -ed)
      let od = ccw ? ey : -ey, oy = ccw ? -ed : ed; const ol = Math.hypot(od, oy) || 1; od /= ol; oy /= ol;
      const f = A.f, nl = Math.hypot(f.nx, f.nz) || 1;
      emitQuad(P(A, k), P(B, k), P(B, k1), P(A, k1), colOf(A.prof[k].c), colOf(B.prof[k].c), colOf(B.prof[k1].c), colOf(A.prof[k1].c), (f.nx / nl) * od, oy, (f.nz / nl) * od);
    }
  }
  const cap = (st, sign) => {
    // drop repeated points, triangulate in (d, y)
    const pts = [], idx = [];
    for (let k = 0; k < np; k++) { const q = st.prof[k], prev = pts[pts.length - 1]; if (prev && Math.abs(prev.x - q.d) < 1e-6 && Math.abs(prev.y - q.y) < 1e-6) continue; pts.push(new THREE.Vector2(q.d, q.y)); idx.push(k); }
    if (pts.length > 2 && Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-6 && Math.abs(pts[0].y - pts[pts.length - 1].y) < 1e-6) { pts.pop(); idx.pop(); }
    if (pts.length < 3) return;
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    const f = st.f;
    for (const t of tris) emitTri(P(st, idx[t[0]]), P(st, idx[t[1]]), P(st, idx[t[2]]), colOf(st.prof[idx[t[0]]].c), colOf(st.prof[idx[t[1]]].c), colOf(st.prof[idx[t[2]]].c), f.tx * sign, 0, f.tz * sign);
  };
  if (capStart) cap(stations[0], -1);
  if (capEnd) cap(stations[stations.length - 1], 1);
}

/** A box given in line coordinates: s0..s1 along, d0..d1 across, y0..y1 (frames taken at both ends: follows a mitre). */
export function lineBox(geom, line, s0, s1, d0, d1, y0, y1, color) {
  const w = geom.writer({ verts: 24, color: true });
  const prof = [{ d: d0, y: y0, c: color }, { d: d0, y: y1, c: color }, { d: d1, y: y1, c: color }, { d: d1, y: y0, c: color }];
  sweep(w, [{ f: line.at(s0), prof }, { f: line.at(s1), prof }]);
  return w;
}
