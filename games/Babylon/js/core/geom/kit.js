// geom/kit.js — the Mesopotamian architectural kit: parametric, true scale (1 unit = 1 m), closed shells.
//   stepped merlons (geometry and the far alpha strip), parapeted wall towers, niched and buttressed facades
//   and blocks (stepped vertical recesses, grooves), blocks with an arched passage (semicircular vault through a
//   thick wall, rebated reveals), tower-flanked temple gateways, saw-tooth frontages, small parts.
// OWNER: geometry engineer. Public as ctx.geom.<name> and ctx.geom.kit.<name>; documented in docs/geom.md.
import * as M from '../mathx.js';
import { MeshWriter, flattenRings, valAt } from './mesh.js';
import { sidesInto, insetRing } from './prims.js';

/** Default merlon height: SPEC 3.4 and 9 ask for stepped merlons about 0.8 m wide and UNDER 1 m high (it was 1.1). */
export const MERLON_HEIGHT = 0.9;

/** Quad given by four [x, y, z] points, wound so that it faces (nx, ny, nz). */
function quadTo(w, a, b, c, d, nx, ny, nz) {
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
  const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
  return dot >= 0 ? w.quadP(a, b, c, d) : w.quadP(a, d, c, b);
}

export function makeKit(ctx, prims) {
  // ============================================================================================
  // Merlons
  // ============================================================================================
  /** One stepped merlon into writer w: centre (cx, cz), base level y, along unit direction (ux, uz). */
  function merlonInto(w, cx, y, cz, ux, uz, width, height, thickness, steps) {
    const rx = -uz, rz = ux, ht = thickness / 2, sh = height / steps;
    for (let k = 0; k < steps; k++) {
      const a = (width / 2) * (1 - k / steps), y0 = y + k * sh, y1 = y0 + sh;
      const x0 = cx - ux * a, z0 = cz - uz * a, x1 = cx + ux * a, z1 = cz + uz * a, tx = rx * ht, tz = rz * ht;
      w.quadN(x0 + tx, y0, z0 + tz, x1 + tx, y0, z1 + tz, x1 + tx, y1, z1 + tz, x0 + tx, y1, z0 + tz, rx, 0, rz);        // front (right of travel)
      w.quadN(x1 - tx, y0, z1 - tz, x0 - tx, y0, z0 - tz, x0 - tx, y1, z0 - tz, x1 - tx, y1, z1 - tz, -rx, 0, -rz);     // back
      w.quadN(x1 + tx, y0, z1 + tz, x1 - tx, y0, z1 - tz, x1 - tx, y1, z1 - tz, x1 + tx, y1, z1 + tz, ux, 0, uz);       // end +u
      w.quadN(x0 - tx, y0, z0 - tz, x0 + tx, y0, z0 + tz, x0 + tx, y1, z0 + tz, x0 - tx, y1, z0 - tz, -ux, 0, -uz);     // end -u
      if (k === steps - 1) w.quadN(x0 - tx, y1, z0 - tz, x0 + tx, y1, z0 + tz, x1 + tx, y1, z1 + tz, x1 - tx, y1, z1 - tz, 0, 1, 0);
      else {
        const b = (width / 2) * (1 - (k + 1) / steps), xa = cx - ux * b, za = cz - uz * b, xb = cx + ux * b, zb = cz + uz * b;
        w.quadN(x0 - tx, y1, z0 - tz, x0 + tx, y1, z0 + tz, xa + tx, y1, za + tz, xa - tx, y1, za - tz, 0, 1, 0);       // shoulders
        w.quadN(xb - tx, y1, zb - tz, xb + tx, y1, zb + tz, x1 + tx, y1, z1 + tz, x1 - tx, y1, z1 - tz, 0, 1, 0);
      }
    }
  }
  /** Positions of the merlons of a row: [{ x, z, ux, uz, y }] (count = floor(length / pitch), evenly spread). */
  function merlonLayout(polyline, { y = 0, pitch = 1.3, offset = 0 } = {}) {
    const len = M.polylineLength(polyline), count = Math.max(1, Math.floor(len / pitch + 1e-9)), eff = len / count, out = [];
    let seg = 0, acc = 0, segLen = 0, ux = 1, uz = 0;
    const next = () => { const a = polyline[seg], b = polyline[seg + 1]; segLen = Math.hypot(b[0] - a[0], b[1] - a[1]); ux = segLen > 0 ? (b[0] - a[0]) / segLen : 1; uz = segLen > 0 ? (b[1] - a[1]) / segLen : 0; };
    next();
    for (let i = 0; i < count; i++) {
      const s = (i + 0.5) * eff;
      while (s > acc + segLen && seg < polyline.length - 2) { acc += segLen; seg++; next(); }
      const t = s - acc, x = polyline[seg][0] + ux * t - uz * offset, z = polyline[seg][1] + uz * t + ux * offset;
      out.push({ x, z, ux, uz, y: valAt(y, x, z, s, i) });
    }
    return out;
  }
  /**
   * Row of STEPPED merlons along a polyline at level y, as real geometry (17 quads per merlon at 3 steps).
   * opts: { y: number | (x, z) => y, pitch: 1.3, width: 0.8, height: 0.9 (SPEC: under 1 m), thickness: 0.5, offset: 0 (to the right),
   *         steps: 3 (1 = plain block, 5 quads) }
   */
  function merlons(polyline, { y = 0, pitch = 1.3, width = 0.8, height = MERLON_HEIGHT, thickness = 0.5, offset = 0, steps = 3 } = {}) {
    const lay = merlonLayout(polyline, { y, pitch, offset }), w = new MeshWriter({ verts: lay.length * (steps * 20 + 8) });
    for (const m of lay) merlonInto(w, m.x, m.y, m.z, m.ux, m.uz, width, height, thickness, steps);
    return w.toGeometry();
  }
  /** One merlon at the origin (base at y = 0, along local x): the geometry of an instanced row (geom.addMerlons({ instanced: true })). */
  function merlonUnit({ width = 0.8, height = MERLON_HEIGHT, thickness = 0.5, steps = 3 } = {}) {
    const w = new MeshWriter({ verts: 80 });
    merlonInto(w, 0, 0, 0, 1, 0, width, height, thickness, steps);
    return w.toGeometry();
  }
  /**
   * Far-LOD stand-in for the same row of merlons: ONE vertical strip along the polyline with UVs
   * (u = 1 per merlon pitch, laid out exactly like merlons(); v = 0 at the base, 1 at the top). Draw it with
   * geom.merlonStripMaterial(paletteId, width / pitch), or let geom.addMerlons() do both.
   */
  function merlonStrip(polyline, { y = 0, pitch = 1.3, width = 0.8, height = MERLON_HEIGHT, offset = 0 } = {}) {
    const len = M.polylineLength(polyline), count = Math.max(1, Math.floor(len / pitch + 1e-9)), eff = len / count;
    const pl = offset ? M.offsetPolyline(polyline, offset) : polyline, ch = M.chainage(polyline);
    const w = new MeshWriter({ verts: pl.length * 4, uv: true });
    for (let i = 0; i < pl.length - 1; i++) {
      const a = pl[i], b = pl[i + 1], ya = valAt(y, a[0], a[1], ch[i], i), yb = valAt(y, b[0], b[1], ch[i + 1], i + 1);
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, ua = ch[i] / eff, ub = ch[i + 1] / eff;
      const k = w.quadN(a[0], ya, a[1], b[0], yb, b[1], b[0], yb + height, b[1], a[0], ya + height, a[1], -dz / l, 0, dx / l), U = w.uv, p = k * 2;
      U[p] = ua; U[p + 1] = 0; U[p + 2] = ub; U[p + 3] = 0; U[p + 4] = ub; U[p + 5] = 1; U[p + 6] = ua; U[p + 7] = 1;
    }
    const g = w.toGeometry();
    g.userData.merlonFill = width / pitch;
    return g;
  }

  // ============================================================================================
  // Blocks with a parapet: wall towers, gate blocks, roof terraces
  // ============================================================================================
  /**
   * Closed block on a ring with a sunk roof behind a parapet: outer faces from `base` to `top + parapet`, a parapet
   * `thickness` wide, the platform (wall-walk, roof) at level `top`.
   * opts: { base, top (PLATFORM level), parapet: 1.0 (height above the platform), thickness: 0.45,
   *         batter: 0 (per metre of height; the foot is wider), holes: ring[] (courts through the block) }
   */
  function parapetBlock(ring, { base, top, parapet = 1.0, thickness = 0.45, batter = 0, holes = [] } = {}) {
    const w = new MeshWriter({ verts: 96 });
    parapetBlockInto(w, ring, base, top, parapet, thickness, batter, holes);
    return w.toGeometry();
  }
  function parapetBlockInto(w, ring, base, top, parapet, thickness, batter, holes = []) {
    const o = M.openRing(ring), n = o.length, cw = M.polygonArea(o) > 0, pt = top + parapet;
    const foot = batter ? insetRing(o, -batter * (pt - base)) : o, inner = insetRing(o, thickness);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = o[i], q = o[j], P = foot[i], Q = foot[j], a = inner[i], b = inner[j];
      if (cw) {
        w.quad(Q[0], base, Q[1], P[0], base, P[1], p[0], pt, p[1], q[0], pt, q[1]);          // outer face
        w.quad(q[0], pt, q[1], p[0], pt, p[1], a[0], pt, a[1], b[0], pt, b[1]);              // parapet top
        if (parapet > 0) w.quad(a[0], top, a[1], b[0], top, b[1], b[0], pt, b[1], a[0], pt, a[1]);   // inner face
      } else {
        w.quad(P[0], base, P[1], Q[0], base, Q[1], q[0], pt, q[1], p[0], pt, p[1]);
        w.quad(p[0], pt, p[1], q[0], pt, q[1], b[0], pt, b[1], a[0], pt, a[1]);
        if (parapet > 0) w.quad(b[0], top, b[1], a[0], top, a[1], a[0], pt, a[1], b[0], pt, b[1]);
      }
    }
    const hs = holes.map((h) => M.openRing(h));
    for (const h of hs) sidesInto(w, h, base, top, false);
    const f = flattenRings(inner, hs);
    w.polygon(f.flat, f.holeStarts, top, true);
  }
  /**
   * Rectangular wall tower projecting from a curtain wall, with its own parapet and platform.
   * spec: { x, z, w (frontage, local x), d (depth, local z), rotDeg, base, top (platform level), parapet: 1.0,
   *         parapetThickness: 0.45, batter: 0 }.  Merlons: geom.addMerlons(id, geom.kit.towerMerlonLine(spec), { y: top + parapet }).
   */
  function wallTower({ x, z, w, d, rotDeg = 0, base, top, parapet = 1.0, parapetThickness = 0.45, batter = 0 }) {
    return parapetBlock(M.rectRing(x, z, w, d, rotDeg), { base, top, parapet, thickness: parapetThickness, batter });
  }
  /** Closed polyline for the merlons of a parapet: the ring (or tower spec), inset by `inset` m. Level: top + parapet. */
  function towerMerlonLine(spec, inset = 0.25) {
    const ring = Array.isArray(spec) ? spec : M.rectRing(spec.x, spec.z, spec.w, spec.d, spec.rotDeg || 0);
    return M.closeRing(insetRing(ring, inset));
  }

  // ============================================================================================
  // Niched and buttressed facades
  // ============================================================================================
  const NICHE = { bay: 9.5, nicheWidth: 4.75, nicheDepth: 0.65, steps: 1, stepWidth: 0.3, grooves: null };
  /**
   * Plan profile of a niched facade of length len: { points: [[s, depth], ...] from [0, 0] to [len, 0], notches: [[[s, depth], ...]] }.
   * Bays of `bay` m (the count is rounded so that bays fill the length), each with one centred recess `nicheWidth`
   * wide and `nicheDepth` deep, rebated in `steps` steps of `stepWidth` (a stepped vertical recess), and optional
   * grooves on the pilasters: { count: 2, width: 0.3, depth: 0.2, gap: 0.9 } (narrow slots, centred on each pilaster).
   */
  function facadeProfile(len, opts = {}) {
    const o = { ...NICHE, ...opts };
    const n = Math.max(1, Math.round(len / o.bay)), bl = len / n, nw = Math.min(o.nicheWidth, bl * 0.92), notches = [];
    const steps = Math.max(1, Math.min(o.steps, Math.floor(nw / (2 * o.stepWidth) + 0.5) || 1));
    const add = (s0, s1, depth, st, sw) => {
      const pts = [];
      for (let j = 0; j < st; j++) { const a = s0 + j * sw; pts.push([a, (j * depth) / st], [a, ((j + 1) * depth) / st]); }
      for (let j = st - 1; j >= 0; j--) { const a = s1 - j * sw; pts.push([a, ((j + 1) * depth) / st], [a, (j * depth) / st]); }
      notches.push(pts);
    };
    const gr = o.grooves, pil = bl - nw;
    const groovesAt = (centre, room) => {
      if (!gr || !(gr.count > 0)) return;
      const gw = gr.width ?? 0.3, gap = gr.gap ?? 0.9, span = (gr.count - 1) * gap + gw;
      if (span > room - 0.3) return;
      for (let k = 0; k < gr.count; k++) { const c = centre + (k - (gr.count - 1) / 2) * gap; add(c - gw / 2, c + gw / 2, gr.depth ?? 0.2, 1, 0); }
    };
    for (let i = 0; i < n; i++) {
      const s0 = i * bl, n0 = s0 + (bl - nw) / 2;
      if (i > 0) groovesAt(s0, pil);
      if (nw > 0.05 && o.nicheDepth > 0) add(n0, n0 + nw, o.nicheDepth, steps, o.stepWidth);
    }
    if (nw <= 0.05 || !(o.nicheDepth > 0)) { notches.length = 0; for (let i = 0; i < n; i++) groovesAt((i + 0.5) * bl, bl); }   // grooves only
    notches.sort((a, b) => a[0][0] - b[0][0]);
    const points = [[0, 0]];
    for (const nt of notches) for (const p of nt) points.push(p);
    points.push([len, 0]);
    return { points, notches, bays: n, bayLength: bl };
  }

  /**
   * Niched (buttressed) facade SKIN between plan points a and b from `base` to `top` (no back, no top).
   * side = +1: the facade faces the right of travel a -> b. Recesses are real geometry.
   * opts beyond ENGINE.md: steps: 1 (2 or 3 = stepped vertical recess), stepWidth: 0.3, grooves (see facadeProfile),
   *   nicheBase / nicheTop: levels between which the recesses run (default: base and top; sills and soffits are
   *   closed), batter: 0 (the face leans back by batter per metre).
   */
  function nichedFacade({ a, b, base, top, bay = 9.5, nicheWidth = 4.75, nicheDepth = 0.65, side = 1, steps = 1, stepWidth = 0.3, grooves = null, nicheBase = base, nicheTop = top, batter = 0 }) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const rx = -dz * side, rz = dx * side, w = new MeshWriter({ verts: 256 });
    const prof = facadeProfile(len, { bay, nicheWidth, nicheDepth, steps, stepWidth, grooves });
    const P = (s, dep, y) => { const k = dep + batter * (y - base); return [a[0] + dx * s - rx * k, y, a[1] + dz * s - rz * k]; };
    skinInto(w, prof, P, base, top, Math.max(base, nicheBase), Math.min(top, nicheTop), side > 0, rx, rz, Math.max(nicheDepth, 0.2));
    return w.toGeometry();
  }
  // faces of one facade: plain bands below / above the niche zone, the profile in between, sills and soffits
  function skinInto(w, prof, P, base, top, nb, nt, rightFacing, rx, rz, dRef) {
    const pts = prof.points, len = pts[pts.length - 1][0];
    const face = (p0, p1, y0, y1) => {
      const A = P(p0[0], p0[1], y0), B = P(p1[0], p1[1], y0), C = P(p1[0], p1[1], y1), D = P(p0[0], p0[1], y1);
      const i = rightFacing ? w.quadP(A, B, C, D) : w.quadP(B, A, D, C);
      const o0 = 1 - 0.26 * Math.min(1, p0[1] / dRef), o1 = 1 - 0.26 * Math.min(1, p1[1] / dRef);
      if (i >= 0 && (o0 < 1 || o1 < 1)) { if (rightFacing) w.quadAO(i, o0, o1, o1, o0); else w.quadAO(i, o1, o0, o0, o1); }
    };
    if (nb > base + 1e-6) face([0, 0], [len, 0], base, nb);
    if (top > nt + 1e-6) face([0, 0], [len, 0], nt, top);
    if (nt > nb + 1e-6) {
      for (let i = 0; i < pts.length - 1; i++) face(pts[i], pts[i + 1], nb, nt);
      const flat = [];
      const lids = (lvl, up) => { for (const nch of prof.notches) { flat.length = 0; for (const p of nch) { const q = P(p[0], p[1], lvl); flat.push(q[0], q[2]); } w.occlusion(up ? 0.8 : 0.7); w.polygon(flat, null, lvl, up); w.occlusion(1); } };
      if (nb > base + 1e-6) lids(nb, true);      // sills
      if (nt < top - 1e-6) lids(nt, false);      // soffits
    }
  }

  /** The notched outline of a ring (closed [x, z] ring with the recesses of every edge), same winding as the input. */
  function nichedOutline(ring, opts = {}) { const o = M.openRing(ring); return M.closeRing(outlineOf(o, o, opts).ring.map((p) => [p[0], p[1]])); }
  // notched outline of `cur` (a ring with the same vertex count as `ref`), profiles laid out on the edge lengths of `ref`
  function outlineOf(ref, cur, opts) {
    const n = ref.length, cw = M.polygonArea(ref) > 0, ring = [], notches = [], edges = opts.edges || null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, len0 = Math.hypot(ref[j][0] - ref[i][0], ref[j][1] - ref[i][1]);
      const a = cur[i], b = cur[j], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      const ix = cw ? -dz : dz, iz = cw ? dx : -dx, k = len / (len0 || 1);       // inward normal; a clockwise ring has its interior on the right
      const P = (p) => [a[0] + dx * p[0] * k + ix * p[1], a[1] + dz * p[0] * k + iz * p[1]];
      if (len0 < (opts.minEdge ?? 1.5) || (edges && !edges.includes(i))) { ring.push([a[0], a[1], 0]); continue; }
      const prof = facadeProfile(len0, opts);
      for (let q = 0; q < prof.points.length - 1; q++) { const p = P(prof.points[q]); ring.push([p[0], p[1], prof.points[q][1]]); }
      for (const nch of prof.notches) notches.push(nch.map(P));
    }
    return { ring, notches };
  }
  /**
   * Closed block whose every side is a niched facade (temples, precinct walls, ziggurat stages, gate towers):
   * ring extruded from `base` to `top`; recesses run from base + socle to top - frieze, with sills and soffits.
   * opts: { bay, nicheWidth, nicheDepth, steps, stepWidth, grooves (see facadeProfile), socle: 0, frieze: 0,
   *         batter: 0 (per metre; the outline shrinks with height), holes: ring[] (courts), top: true (roof cap),
   *         edges: number[] | null (only these edges of the ring get recesses), minEdge: 1.5 (shorter edges stay plain) }
   */
  function nichedPrism(ring, base, top, opts = {}) {
    const w = new MeshWriter({ verts: 512 });
    nichedPrismInto(w, ring, base, top, opts);
    return w.toGeometry();
  }
  function nichedPrismInto(w, ring, base, top, opts = {}) {
    const ref = M.openRing(ring), cw = M.polygonArea(ref) > 0, batter = opts.batter || 0, dRef = Math.max(opts.nicheDepth ?? NICHE.nicheDepth, 0.2);
    const nb = base + (opts.socle || 0), nt = top - (opts.frieze || 0);
    const at = (y) => (batter ? insetRing(ref, batter * (y - base)) : ref);
    const band = (y0, y1) => {                                 // plain ruled faces between two levels
      const lo = at(y0), hi = at(y1), n = ref.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, p = lo[i], q = lo[j], P = hi[i], Q = hi[j];
        if (cw) w.quad(q[0], y0, q[1], p[0], y0, p[1], P[0], y1, P[1], Q[0], y1, Q[1]); else w.quad(p[0], y0, p[1], q[0], y0, q[1], Q[0], y1, Q[1], P[0], y1, P[1]);
      }
    };
    if (nb > base + 1e-6) band(base, nb);
    if (top > nt + 1e-6) band(nt, top);
    if (nt > nb + 1e-6) {
      const lo = outlineOf(ref, at(nb), opts), hi = batter ? outlineOf(ref, at(nt), opts) : lo, n = lo.ring.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, p = lo.ring[i], q = lo.ring[j], P = hi.ring[i], Q = hi.ring[j];
        const k = cw ? w.quad(q[0], nb, q[1], p[0], nb, p[1], P[0], nt, P[1], Q[0], nt, Q[1]) : w.quad(p[0], nb, p[1], q[0], nb, q[1], Q[0], nt, Q[1], P[0], nt, P[1]);
        const op = 1 - 0.26 * Math.min(1, p[2] / dRef), oq = 1 - 0.26 * Math.min(1, q[2] / dRef);
        if (k >= 0 && (op < 1 || oq < 1)) { if (cw) w.quadAO(k, oq, op, op, oq); else w.quadAO(k, op, oq, oq, op); }
      }
      const flat = [];
      const lids = (set, lvl, up) => { for (const nch of set) { flat.length = 0; for (const p of nch) flat.push(p[0], p[1]); w.occlusion(up ? 0.8 : 0.7); w.polygon(flat, null, lvl, up); w.occlusion(1); } };
      if (nb > base + 1e-6) lids(lo.notches, nb, true);
      lids(hi.notches, nt, false);
    }
    if (opts.top !== false) { const f = flattenRings(at(top), (opts.holes || [])); w.polygon(f.flat, f.holeStarts, top, true); }
    for (const h of opts.holes || []) sidesInto(w, h, base, top, false);
  }

  // ============================================================================================
  // Arched passages: a block (or a stretch of thick wall) with a vaulted gate passage through it
  // ============================================================================================
  // opening profile in the plane of the face: [[x, y], ...] from the left foot to the right foot
  function archProfile(hw, floor, crown, arch, seg) {
    if (!arch) return [[-hw, floor], [-hw, crown], [hw, crown], [hw, floor]];
    const r = Math.min(hw, crown - floor), sp = crown - r, pts = [[-hw, floor]];
    for (let k = 0; k <= seg; k++) { const f = (Math.PI * k) / seg; pts.push([-hw * Math.cos(f), sp + r * Math.sin(f)]); }
    pts.push([hw, floor]);
    return pts;
  }
  /**
   * Rectangular block with a gate passage through its depth: front and back faces with the opening, the passage
   * walls and a SEMICIRCULAR barrel vault (smooth normals), optional rebated (stepped) reveals, end faces, top.
   * spec: { x, z (centre), rotDeg (the FRONT is the local -z face: a block with rotDeg = facingDeg looks along facingDeg),
   *         width (along the facade), depth (through the wall), base (bottom of the shell, sunk in the ground),
   *         floor (level of the roadway in the passage), top,
   *         door: { width: 4.5, height: 11.9 (crown above the floor), arch: true (false = flat lintel), offset: 0 (along the facade) },
   *         rebates: 0 (number of stepped reveals at the front), rebatesBack: 0, rebateDepth: 0.4, rebateStep: 0.35,
   *         segments: 14 (of the arch), ends: true (the two end faces; false when the block continues as a wall),
   *         topFace: true, floorFace: true (the shell is closed by a floor of its own 5 cm UNDER `floor`: lay the
   *         roadway at `floor` or above) }
   */
  function passageBlock(spec) { const w = new MeshWriter({ verts: 512 }); passageBlockInto(w, spec); return w.toGeometry(); }
  function passageBlockInto(w, { x, z, rotDeg = 0, width, depth, base, floor = base, top, door = {}, rebates = 0, rebatesBack = 0, rebateDepth = 0.4, rebateStep = 0.35, segments = 14, ends = true, topFace = true, floorFace = true, endRange = null }) {
    const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG);
    const L = (lx, y, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c];
    const N = (lx, lz) => [lx * c - lz * s, lx * s + lz * c];
    const dw = (door.width ?? 4.5) / 2, dh = door.height ?? 11.9, arch = door.arch !== false, off = door.offset || 0, zf = -depth / 2, zb = depth / 2, hwid = width / 2;
    const secs = [];
    for (let j = rebates; j >= 1; j--) secs.push({ z0: zf + (rebates - j) * rebateDepth, z1: zf + (rebates - j + 1) * rebateDepth, hw: dw + j * rebateStep, crown: floor + dh + j * rebateStep });
    secs.push({ z0: zf + rebates * rebateDepth, z1: zb - rebatesBack * rebateDepth, hw: dw, crown: floor + dh });
    for (let j = 1; j <= rebatesBack; j++) secs.push({ z0: zb - (rebatesBack - j + 1) * rebateDepth, z1: zb - (rebatesBack - j) * rebateDepth, hw: dw + j * rebateStep, crown: floor + dh + j * rebateStep });
    // the shell's own floor lies 5 cm under the roadway level, so that paving laid AT `floor` does not fight with it
    const fl = floorFace && floor > base + 0.06 ? floor - 0.05 : floor;
    for (const q of secs) q.prof = archProfile(q.hw, fl, Math.min(q.crown, top - 0.3), arch, segments);
    // a face with the opening cut out: left and right panels, the sill below the roadway, strips above the arch
    const holedFace = (lz, prof, nz) => {
      const n2 = N(0, nz), x0 = prof[0][0] + off, x1 = prof[prof.length - 1][0] + off;
      const Q = (ax, ay, bx, by) => quadTo(w, L(ax, ay, lz), L(bx, ay, lz), L(bx, by, lz), L(ax, by, lz), n2[0], 0, n2[1]);
      if (x0 > -hwid + 1e-6) Q(-hwid, base, x0, top);
      if (x1 < hwid - 1e-6) Q(x1, base, hwid, top);
      if (fl > base + 1e-6) Q(x0, base, x1, fl);
      for (let k = 1; k < prof.length - 2; k++) {
        const p = prof[k], q = prof[k + 1];
        if (q[0] - p[0] < 1e-6) continue;
        quadTo(w, L(p[0] + off, p[1], lz), L(q[0] + off, q[1], lz), L(q[0] + off, top, lz), L(p[0] + off, top, lz), n2[0], 0, n2[1]);
      }
    };
    holedFace(zf, secs[0].prof, -1);
    holedFace(zb, secs[secs.length - 1].prof, 1);
    for (let q = 0; q < secs.length; q++) {
      const S = secs[q], prof = S.prof, cy = prof[1][1];             // springing level
      // passage walls and vault: smooth normals that point at the axis of the vault
      for (let k = 0; k < prof.length - 1; k++) {
        const p = prof[k], r = prof[k + 1];
        if (Math.hypot(r[0] - p[0], r[1] - p[1]) < 1e-6) continue;
        const lastK = prof.length - 2, rad = (pt) => { const l = Math.hypot(pt[0], pt[1] - cy) || 1; return [-pt[0] / l, -(pt[1] - cy) / l]; };
        const n0 = k === 0 ? [1, 0] : k === lastK ? [-1, 0] : arch ? rad(p) : [0, -1], n1 = k === 0 ? [1, 0] : k === lastK ? [-1, 0] : arch ? rad(r) : [0, -1];
        const A = L(p[0] + off, p[1], S.z0), B = L(p[0] + off, p[1], S.z1), C = L(r[0] + off, r[1], S.z1), D = L(r[0] + off, r[1], S.z0);
        const w0 = N(n0[0], 0), w1 = N(n1[0], 0);
        // winding: (A, B, C, D) has the normal (B - A) x (D - A) = z axis x profile tangent; flip if it looks away from the axis
        const tx = r[0] - p[0], ty = r[1] - p[1], gx = -ty, gy = tx;      // z x (tx, ty, 0) = (-ty, tx, 0)
        const flip = gx * (n0[0] + n1[0]) + gy * (n0[1] + n1[1]) < 0;
        const i0 = w.vert(A[0], A[1], A[2], w0[0], n0[1], w0[1]); w.vert(B[0], B[1], B[2], w0[0], n0[1], w0[1]); w.vert(C[0], C[1], C[2], w1[0], n1[1], w1[1]); w.vert(D[0], D[1], D[2], w1[0], n1[1], w1[1]);
        if (flip) { w.tri(i0, i0 + 3, i0 + 2); w.tri(i0, i0 + 2, i0 + 1); } else { w.tri(i0, i0 + 1, i0 + 2); w.tri(i0, i0 + 2, i0 + 3); }
      }
      // the step between this section and the next (a rebate): an annulus facing the bigger opening
      if (q < secs.length - 1) {
        const T = secs[q + 1], nz = S.hw > T.hw ? -1 : 1, n2 = N(0, nz);
        for (let k = 0; k < prof.length - 1; k++) {
          const a0 = prof[k], a1 = prof[k + 1], b0 = T.prof[k], b1 = T.prof[k + 1];
          quadTo(w, L(a0[0] + off, a0[1], S.z1), L(a1[0] + off, a1[1], S.z1), L(b1[0] + off, b1[1], S.z1), L(b0[0] + off, b0[1], S.z1), n2[0], 0, n2[1]);
        }
      }
    }
    // the threshold: the floor of the passage, section by section
    if (floorFace && fl > base + 1e-6) for (const S of secs) quadTo(w, L(-S.hw + off, fl, S.z0), L(S.hw + off, fl, S.z0), L(S.hw + off, fl, S.z1), L(-S.hw + off, fl, S.z1), 0, 1, 0);
    if (ends) for (const sx of [-1, 1]) {
      const n2 = N(sx, 0), z0 = endRange ? endRange[0] : zf, z1 = endRange ? endRange[1] : zb;
      if (z1 > z0 + 1e-6) quadTo(w, L(sx * hwid, base, z0), L(sx * hwid, base, z1), L(sx * hwid, top, z1), L(sx * hwid, top, z0), n2[0], 0, n2[1]);
    }
    if (topFace) quadTo(w, L(-hwid, top, zf), L(hwid, top, zf), L(hwid, top, zb), L(-hwid, top, zb), 0, 1, 0);
  }
  /**
   * A stretch of thick wall from plan point a to b with an arched gate passage through it.
   * spec: { a, b, thickness, base, floor, top, door: { width, height, arch, at: 0.5 (position along a -> b, 0..1) },
   *         rebates, rebatesBack, rebateDepth, rebateStep, segments, ends: true }. The front (rebates) is on the LEFT of travel a -> b.
   */
  function archedWall({ a, b, thickness, door = {}, ...rest }) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), rotDeg = Math.atan2(b[1] - a[1], b[0] - a[0]) * M.RAD;
    return passageBlock({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, rotDeg, width: len, depth: thickness, door: { ...door, offset: ((door.at ?? 0.5) - 0.5) * len }, ...rest });
  }

  /**
   * Tower-flanked gateway (temple and precinct gates, city gate fronts): a gate block with an arched or flat
   * doorway in stepped reveals between two projecting, taller towers with grooved fronts; parapets all round.
   * spec: { x, z, facingDeg (the way the gate looks), width (whole front incl. towers), depth, base, floor, top (roof of the gate block),
   *         towerWidth, towerDepth (default: depth x 0.6), towerProjection: 1.2, towerTop (default top + 3),
   *         door: { width, height, arch }, rebates: 2, parapet: 0.9, parapetThickness: 0.45,
   *         grooves: { count: 2, width: 0.35, depth: 0.25, gap: 1.0 } | null (on the tower fronts) }
   * Returns { geometry, merlonLines: [{ line, y }] } (closed polylines for geom.addMerlons).
   */
  function gateway({ x, z, facingDeg = 0, width, depth, base, floor = base, top, towerWidth, towerDepth, towerProjection = 1.2, towerTop, door = {}, rebates = 2, parapet = 0.9, parapetThickness = 0.45, grooves = { count: 2, width: 0.35, depth: 0.25, gap: 1.0 }, segments = 14 }) {
    const w = new MeshWriter({ verts: 1024 }), rot = facingDeg, tw = towerWidth ?? Math.max(2.5, (width - (door.width ?? 3)) / 2 - 1.2), td = towerDepth ?? depth * 0.6;
    const tTop = towerTop ?? top + 3, c = Math.cos(rot * M.DEG), s = Math.sin(rot * M.DEG);
    const L2 = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
    const inner = width / 2 - tw, zt = -depth / 2 - towerProjection + td;      // towers sit at the two ends of the front; zt = their back face
    // the gate block over the whole width; where a tower covers its end face that part is left out (no coplanar faces)
    passageBlockInto(w, { x, z, rotDeg: rot, width, depth, base, floor, top, door, rebates, segments, ends: zt < depth / 2 - 1e-3, endRange: [Math.max(zt, -depth / 2), depth / 2] });
    const merlonLines = [{ line: [L2(-inner, -depth / 2 + 0.3), L2(inner, -depth / 2 + 0.3)], y: top }, { line: [L2(width / 2, depth / 2 - 0.3), L2(-width / 2, depth / 2 - 0.3)], y: top }];
    // towers: closed blocks from the ground, grooved fronts, platform behind a parapet
    for (const sx of [-1, 1]) {
      const cx = sx * (inner + tw / 2), cz = -depth / 2 - towerProjection + td / 2;
      const ring = [L2(cx - tw / 2, cz - td / 2), L2(cx + tw / 2, cz - td / 2), L2(cx + tw / 2, cz + td / 2), L2(cx - tw / 2, cz + td / 2)];
      nichedPrismInto(w, ring, base, tTop, { bay: tw, nicheWidth: 0, nicheDepth: 0, grooves, edges: [0], socle: Math.max(0.8, floor - base + 0.8), frieze: 1.0, top: false });
      parapetBlockInto(w, ring, tTop, tTop, parapet, parapetThickness, 0);
      merlonLines.push({ line: towerMerlonLine(ring), y: tTop + parapet });
    }
    return { geometry: w.toGeometry(), merlonLines };
  }

  // ============================================================================================
  // Saw-tooth frontage (Merkes): a house grid turned against its street
  // ============================================================================================
  /**
   * The stepped line of a saw-tooth frontage between plan points a and b: runs parallel to the house grid
   * (rotated gridDeg clockwise from the model axes) and short risers back to the street line, all on the
   * `inward` side ([nx, nz], pointing into the plot). opts: { tooth: 1.5 (m along the street per tooth) }.
   * Returns [[x, z], ...] from a to b (just [a, b] when the edge is within 1.5 degrees of the grid).
   */
  function sawToothLine(a, b, gridDeg, inward, { tooth = 1.5 } = {}) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-6) return [a, b];
    const ex = (b[0] - a[0]) / len, ez = (b[1] - a[1]) / len, g = gridDeg * M.DEG, axes = [[Math.cos(g), Math.sin(g)], [-Math.sin(g), Math.cos(g)]];
    let p = axes[0], q = axes[1];
    if (Math.abs(axes[1][0] * ex + axes[1][1] * ez) > Math.abs(p[0] * ex + p[1] * ez)) { p = axes[1]; q = axes[0]; }
    if (p[0] * ex + p[1] * ez < 0) p = [-p[0], -p[1]];
    const sin = p[0] * inward[0] + p[1] * inward[1];              // > 0: the run drifts into the plot
    if (Math.abs(sin) < 0.026) return [a, b];
    if (q[0] * inward[0] + q[1] * inward[1] < 0) q = [-q[0], -q[1]];   // q points into the plot
    const cos = Math.sqrt(1 - sin * sin), n = Math.max(1, Math.round(len / tooth)), adv = len / n, run = adv * cos, rise = adv * Math.abs(sin), out = [[a[0], a[1]]];
    for (let i = 0; i < n; i++) {
      const sx = a[0] + ex * adv * i, sz = a[1] + ez * adv * i, tx = a[0] + ex * adv * (i + 1), tz = a[1] + ez * adv * (i + 1);
      if (sin > 0) out.push([sx + p[0] * run, sz + p[1] * run]);      // run inward, riser back out
      else out.push([sx + q[0] * rise, sz + q[1] * rise]);          // riser inward, run back out
      out.push([tx, tz]);
    }
    return out;
  }

  // ============================================================================================
  // Small parts
  // ============================================================================================
  /**
   * Applied doorway for a plain wall (no cut): a dark door leaf just proud of the wall under a timber lintel, with a threshold.
   * spec: { x, z (centre of the door on the wall face), facingDeg (the way the wall face looks), base (threshold level),
   *         width: 1.1, height: 2.0, proud: 0.06, lintel: { height: 0.2, overhang: 0.22, proud: 0.12 } }
   * Returns { leaf, lintel } geometries (give them a wood material, or paint them and merge with the wall material).
   */
  function doorway({ x, z, facingDeg = 0, base, width = 1.1, height = 2.0, proud = 0.06, lintel = {} }) {
    const o = M.azToDir(facingDeg), r = M.rightOf(o[0], o[1]), hw = width / 2, lh = lintel.height ?? 0.2, lo = lintel.overhang ?? 0.22, lp = lintel.proud ?? 0.12;
    const P = (side, y, out) => [x + r[0] * side + o[0] * out, y, z + r[1] * side + o[1] * out];
    const leaf = new MeshWriter({ verts: 20 }), lin = new MeshWriter({ verts: 24 });
    quadTo(leaf, P(-hw, base, proud), P(hw, base, proud), P(hw, base + height, proud), P(-hw, base + height, proud), o[0], 0, o[1]);
    quadTo(leaf, P(-hw, base, 0), P(-hw, base, proud), P(-hw, base + height, proud), P(-hw, base + height, 0), -r[0], 0, -r[1]);
    quadTo(leaf, P(hw, base, 0), P(hw, base, proud), P(hw, base + height, proud), P(hw, base + height, 0), r[0], 0, r[1]);
    const y0 = base + height, y1 = y0 + lh, a = hw + lo;
    quadTo(lin, P(-a, y0, lp), P(a, y0, lp), P(a, y1, lp), P(-a, y1, lp), o[0], 0, o[1]);
    quadTo(lin, P(-a, y1, 0), P(a, y1, 0), P(a, y1, lp), P(-a, y1, lp), 0, 1, 0);
    quadTo(lin, P(-a, y0, 0), P(a, y0, 0), P(a, y0, lp), P(-a, y0, lp), 0, -1, 0);
    quadTo(lin, P(-a, y0, 0), P(-a, y0, lp), P(-a, y1, lp), P(-a, y1, 0), -r[0], 0, -r[1]);
    quadTo(lin, P(a, y0, 0), P(a, y0, lp), P(a, y1, lp), P(a, y1, 0), r[0], 0, r[1]);
    return { leaf: leaf.toGeometry(), lintel: lin.toGeometry() };
  }
  /** Drain spout: a short trough projecting from a parapet. spec: { x, y, z (root, on the wall face), azDeg (direction out), length: 0.55, width: 0.16, height: 0.12, drop: 0.06 } */
  function spout({ x, y, z, azDeg = 0, length = 0.55, width = 0.16, height = 0.12, drop = 0.06 }) { const w = new MeshWriter({ verts: 20 }); spoutInto(w, x, y, z, azDeg, length, width, height, drop); return w.toGeometry(); }
  function spoutInto(w, x, y, z, azDeg, length, width, height, drop) {
    const o = M.azToDir(azDeg), r = M.rightOf(o[0], o[1]), hw = width / 2;
    const P = (side, yy, out) => [x + r[0] * side + o[0] * out, yy, z + r[1] * side + o[1] * out];
    const a = [P(-hw, y, 0), P(hw, y, 0), P(hw, y + height, 0), P(-hw, y + height, 0)], b = [P(-hw, y - drop, length), P(hw, y - drop, length), P(hw, y + height - drop, length), P(-hw, y + height - drop, length)];
    quadTo(w, b[0], b[1], b[2], b[3], o[0], 0, o[1]);
    quadTo(w, a[3], a[2], b[2], b[3], 0, 1, 0); quadTo(w, a[0], a[1], b[1], b[0], 0, -1, 0);
    quadTo(w, a[0], b[0], b[3], a[3], -r[0], 0, -r[1]); quadTo(w, a[1], b[1], b[2], a[2], r[0], 0, r[1]);
  }
  /** Low mud-brick bench along a wall: from a to b on the `side` (+1 right of travel), height 0.45, depth 0.5, on level `base`. */
  function bench({ a, b, base, height = 0.45, depth = 0.5, side = 1, sink = 0.3 }) {
    return prims.wall([a, b], { thickness: depth, offset: (side * depth) / 2, base: base - sink, top: base + height });
  }
  /** Coping: a thin course along a wall top (parapet capping). polyline at level y; width of the wall below, slight overhang. */
  function coping(polyline, { y, width, height = 0.12, overhang = 0.04, closed = false, step = 0 }) {
    return prims.wall(polyline, { thickness: width + 2 * overhang, base: y, top: typeof y === 'function' ? (x, z, s, i) => y(x, z, s, i) + height : y + height, closed, step, bottom: true });
  }

  return {
    merlons, merlonInto, merlonLayout, merlonUnit, merlonStrip, parapetBlock, parapetBlockInto, wallTower, towerMerlonLine,
    facadeProfile, nichedFacade, nichedOutline, nichedPrism, nichedPrismInto, passageBlock, passageBlockInto, archedWall, gateway,
    sawToothLine, doorway, spout, spoutInto, bench, coping, quadTo, archProfile,
  };
}
