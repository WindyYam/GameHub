// js/modules/ishtar/util.js — shared helpers of the `ishtar` module: material buckets, the gate frame, glazed
// skins on wall faces, parapets with merlons, paving strips with UVs. No state outside the object returned by
// makeKit(ctx). Imports: only ../../core/mathx.js (ENGINE.md section 4).
import * as M from '../../core/mathx.js';

export const FAR = 1500;            // m: full detail to here, plain blocks in 1024 m tiles beyond
export const MERLON = { pitch: 0.83, width: 0.66, height: 0.9, thickness: 0.5 };   // SPEC 3.6: 0.66 m wide, under 1 m
export const BREAST = 0.3433;       // m: breastwork under the merlons (4 courses)

export function makeKit(ctx) {
  const { geom, glazed: G, materials, THREE, W } = ctx;
  const C = G.COURSE, SK = 0.03;    // course height; the glazed skin stands 3 cm before the masonry

  // ---------------------------------------------------------------------------------------- materials ----
  const mats = {
    brick: 'bakedBrickBuff',
    blue: 'glazeBlue',
    roof: 'roofEarth',
    // asphalted brick under the dust of a street in use (a third of the way to the street earth, as `streets` lays it south of the gate)
    asphalt: materials.variant('asphaltedBrickRoad', { name: 'ishtar-asphalt', rotDeg: 4, color: materials.color('asphaltedBrickRoad').lerp(materials.color('streetEarth'), 0.3) }),
    // paving in UV space: u = metres across the band, v = chainage along the street, so slab rows follow every bend
    lime: materials.variant('limestone', { name: 'ishtar-limestone', space: 'uv', uvMetres: [1, 1], uvFace: 'top', module: 1.05, joint: 'bitumen', color: materials.color('limestone').clone().lerp(materials.color('streetEarth'), 0.2) }),   // trodden: a fifth of the way to the street dust (integration: the clean slabs read as blue plastic in the shade)
    brec: materials.variant('breccia', { name: 'ishtar-breccia', space: 'uv', uvMetres: [1, 1], uvFace: 'top', module: 0.66, joint: 'bitumen' }),
    cedar: materials.preset('planks', { name: 'ishtar-doors', vertical: true }),
    bronze: 'bronze',
    quay: materials.preset('quayBrick'),
  };
  const shadowless = new Set(['roof', 'asphalt', 'lime', 'brec']);
  const buckets = new Map(), far = { brick: [], blue: [] };
  /** Collect a piece of geometry for one of the module's materials (merged and submitted by flush()). */
  const put = (key, g) => {
    if (!g) return g;
    // two buckets ride on another material to save draw calls: voids (loopholes, door mouths) are the door timber
    // tinted black; monolithic stone (lintels, sills, thresholds) is the paving limestone at the middle of one slab
    if (key === 'dark') { geom.paint(g, [0.03, 0.028, 0.026]); key = 'cedar'; }
    else if (key === 'stone') { g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2).fill(0.52), 2)); key = 'lime'; }
    if (!mats[key]) throw new Error('ishtar: no bucket ' + key);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
    return g;
  };
  /** Far stand-in (beyond FAR): plain blocks, 'brick' or 'blue'. */
  const putFar = (key, g) => { far[key].push(g); return g; };
  let tris = 0, merlonCount = 0;
  const bucketTris = {};
  function flush() {
    for (const [key, list] of buckets) {
      if (!list.length) continue;
      const g = geom.merge(list);
      tris += geom.triCount(g); bucketTris[key] = geom.triCount(g);
      geom.addStatic(mats[key], g, { lod: [0, FAR], lodGrid: [256, 1024], castShadow: !shadowless.has(key), ...(key === 'quay' ? { reflect: true } : {}) });
    }
    buckets.clear();
    for (const key of ['brick', 'blue']) {
      if (!far[key].length) continue;
      geom.addStatic(mats[key], geom.merge(far[key]), { lod: [FAR, Infinity], lodGrid: [1024, 1024], tile: 1024, ao: false });
      far[key] = [];
    }
    return tris;
  }

  // ---------------------------------------------------------------------------------------- geometry ----
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]);
  const unit = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
  const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  /** Paint an extra occlusion (0..1) into a geometry: interiors that the sky does not reach. */
  const occlude = (g, v) => { const n = g.attributes.position.count, a = new Float32Array(n).fill(v); g.setAttribute('ao', new THREE.BufferAttribute(a, 1)); return g; };

  /** Glazed geometry that has one level of detail (arch bands, fields, rosettes, lines): submitted into the two LOD buckets of the panels, so it costs no draw call. */
  const GL = { castShadow: false, receiveShadow: true, reflect: false };
  const addGlazed = (g) => { geom.addStatic(G.material, g.clone(), { ...GL, lod: [0, 150] }); geom.addStatic(G.material, g, { ...GL, lod: [150, FAR] }); };
  /** Order the two ends of a wall face for skin(): [left, right] as seen by a viewer who faces it. n = outward plan normal [nx, nz]. */
  const faceEnds = (P, Q, n) => ((Q[0] - P[0]) * n[1] - (Q[1] - P[1]) * n[0] > 0 ? [P, Q] : [Q, P]);

  /**
   * A glazed panel on a vertical wall face. A, B: plan points [x, z] of the face's foot, A on the LEFT and B on the
   * RIGHT of a viewer who faces the wall. y0: foot level. bands: band list of glazed.panel; opts: corners, seed, phase.
   */
  function skin(A, B, y0, bands, opts = {}) {
    const r = unit(sub(B, A)), width = len(sub(B, A));
    if (width < 0.2) return null;
    // the panel faces right x up = (-rz, 0, rx)
    const n = [-r[1], r[0]];
    const p = G.panel({ origin: [A[0] + n[0] * SK, y0, A[1] + n[1] * SK], right: [r[0], 0, r[1]], width, bands, height: opts.height, corners: opts.corners, cornerFrom: opts.cornerFrom, seed: opts.seed | 0, phase: opts.phase ? 1 : 0 });
    G.addPanel(p, { switchAt: 150, far: FAR });
    return p;
  }
  /** Bands of a gate face `courses` high: socle, `rows` of animals, plain blue, and a checker line 4 courses under the top. */
  function gateBands({ width, courses, rows = 6, perRow, spacing, facing = 'R', socle = true, top = 'checker', above = 4, first = 'bull', variantStart = 0, margin = 0 }) {
    const topC = top === 'checker' ? 3 + above : top === 'rosette' ? 11 + above : 0, body = courses - topC;
    const b = G.gateBands({ width, height: body * C, rows, perRow, spacing, facing, socle, first, variantStart, margin });
    if (top === 'checker') b.push({ type: 'checker' }, { type: 'field', courses: above, ground: 'glazeBlue' });
    if (top === 'rosette') b.push({ type: 'checker' }, { type: 'rosette' }, { type: 'checker' }, { type: 'field', courses: above, ground: 'glazeBlue' });
    return b;
  }
  /** skin() with gateBands(): the usual face of the gate. Returns the panel (items = the animals). */
  const gateSkin = (A, B, y0, courses, o = {}) => skin(A, B, y0, gateBands({ width: len(sub(B, A)), courses, ...o }), { corners: o.corners, cornerFrom: o.socle === false ? 0 : 13, seed: o.seed, height: courses * C });
  /** Plain glazed bricks on a face (no socle, no animals): blue faces that are not open to view. */
  const plainSkin = (A, B, y0, courses, o = {}) => skin(A, B, y0, [{ type: 'field', courses, ground: o.ground || 'glazeBlue' }], { seed: o.seed, corners: o.corners, cornerFrom: 0, height: courses * C });
  /** A plain glazed field on any outline of a face: ring = [[x along the face from A, y above y0], ...]. */
  function fieldSkin(A, B, y0, ring, seed = 0) {
    const r = unit(sub(B, A)), n = [-r[1], r[0]];
    addGlazed(G.fieldShape({ origin: [A[0] + n[0] * SK, y0, A[1] + n[1] * SK], right: [r[0], 0, r[1]], ring, seed }));
  }
  /**
   * Single white rosettes on a plain blue face (R2 6.3: "occasional single white rosettes break up large blue areas"):
   * a staggered grid, `stepX` m apart in rows `stepC` courses apart, between the courses `from` and `to` above y0.
   */
  function rosettes(A, B, y0, { from = 37, to, stepX = 4.0, stepC = 36, seed = 0, margin = 1.3 } = {}) {
    const r = unit(sub(B, A)), n = [-r[1], r[0]], w = len(sub(B, A)), R = G.rect('rosette'), du = (R.u1 - R.u0) / 24, list = [], lift = SK + 0.025;
    if (w < 2 * margin + 0.6 || !(to > from + 5)) return 0;
    const cols = Math.max(1, Math.round((w - 2 * margin) / stepX));
    let row = 0;
    for (let c = from; c + 5 <= to; c += stepC, row++) {
      const odd = cols > 1 && row % 2 === 1, nc = odd ? cols - 1 : cols;
      for (let i = 0; i < nc; i++) {
        const x = margin + ((i + (odd ? 1 : 0.5)) * (w - 2 * margin)) / cols, k = (i * 7 + row * 5 + seed) % 24;
        list.push({ origin: [A[0] + r[0] * (x - 0.2222) + n[0] * lift, y0 + c * C, A[1] + r[1] * (x - 0.2222) + n[1] * lift], right: [r[0], 0, r[1]], up: [0, 1, 0], width: 0.4444, height: 5 * C, uv: [R.u0 + k * du, R.v0, R.u0 + (k + 1) * du, R.v1] });
      }
    }
    if (list.length) addGlazed(geom.quads(list));
    return list.length;
  }
  /**
   * A band of the atlas bent round an arch (the archivolt): the strip `name` ('rosette' | 'checker') between radii
   * r0 < r1 about the centre (cx, cy) on the face A -> B at level y0, from angle a0 to a1 (radians, 0 = viewer's right).
   */
  function arcBand(A, B, y0, name, cx, cy, r0, r1, a0 = 0, a1 = Math.PI, seg = 40) {
    const r = unit(sub(B, A)), n = [-r[1], r[0]], R = G.rect(name), per = R.widthM, pos = [], uv = [], nor = [], idx = [];
    const P = (x, y) => [A[0] + r[0] * x + n[0] * SK, y0 + y, A[1] + r[1] * x + n[1] * SK];
    const rm = (r0 + r1) / 2, total = Math.abs(a1 - a0) * rm, periods = name === 'rosette' ? Math.max(1, Math.round(total / (per / 24))) * (per / 24) : Math.max(1, Math.round(total / (per / 32))) * (per / 32);
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg, c = Math.cos(a), s = Math.sin(a), u = R.u0 + ((R.u1 - R.u0) * (periods * i)) / seg / per;
      // seen by the viewer the arc runs from his right (a = 0) over the crown to his left: x = cx + r cos a
      const p0 = P(cx + r0 * c, cy + r0 * s), p1 = P(cx + r1 * c, cy + r1 * s);
      pos.push(...p0, ...p1); uv.push(u, R.v0, u, R.v1); nor.push(n[0], 0, n[1], n[0], 0, n[1]);
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    const g = geom.custom({ position: pos, index: idx, normal: nor, uv, color: new Float32Array(pos.length).fill(1) });
    addGlazed(g);
  }

  /**
   * Breastwork and merlons along the outer edge of a wall-walk. line: plan points of the OUTER edge, travelling with
   * the walk on the LEFT (so the parapet body lies to the left of travel). y: walk level. key: bucket of the breastwork.
   */
  function parapet(line, y, { key = 'blue', closed = false, merlons = true, height = BREAST, thickness = 0.5, inset = 0 } = {}) {
    const pl = closed ? M.openRing(line) : line;
    put(key, geom.wall(pl, { thickness, offset: -(thickness / 2 + inset), base: y - 0.02, top: y + height, closed, bottom: false }));
    if (!merlons) return;
    const n = pl.length, last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pl[i], b = pl[(i + 1) % n], l = len(sub(b, a));
      if (l < 1.0) continue;
      const d = unit(sub(b, a)), e = Math.min(0.12, l * 0.1);
      const p = [a[0] + d[0] * e, a[1] + d[1] * e], q = [b[0] - d[0] * e, b[1] - d[1] * e];
      put('blue', geom.merlons([p, q], { y: y + height, ...MERLON, thickness, offset: -(thickness / 2 + inset) }));      // in the masonry's own mesh: no draw call of their own
      merlonCount += Math.max(1, Math.floor(len(sub(q, p)) / MERLON.pitch + 1e-9));
    }
  }

  /**
   * Paving strip along a centreline with UVs in metres (u across from the band's own origin, v = chainage).
   * pts: [{ x, z, y, n: [nx, nz] (unit, to the right of travel), ch }], a, b: offsets of the two edges (number or
   * (pt) => number, a < b), lift: metres above pt.y, uFrom: offset at which u = 0 (default a), flipU: u grows to the left,
   * kerb: metres of vertical edge face drawn down both edges.
   */
  function strip(pts, a, b, { lift = 0, uFrom, flipU = false, kerb = 0 } = {}) {
    const fa = typeof a === 'function' ? a : () => a, fb = typeof b === 'function' ? b : () => b;
    const pos = [], nor = [], uv = [], idx = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], oa = fa(p), ob = fb(p), u0 = uFrom === undefined ? oa : (typeof uFrom === 'function' ? uFrom(p) : uFrom);
      for (const o of [oa, ob]) {
        pos.push(p.x + p.n[0] * o, p.y + lift, p.z + p.n[1] * o);
        nor.push(0, 1, 0); uv.push(flipU ? u0 - o : o - u0, p.ch);
      }
    }
    for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    if (kerb > 0) {
      for (const side of [0, 1]) {
        const base = pos.length / 3;
        for (let i = 0; i < n; i++) {
          const p = pts[i], o = side ? fb(p) : fa(p), sg = side ? 1 : -1, x = p.x + p.n[0] * o, z = p.z + p.n[1] * o;
          pos.push(x, p.y + lift, z, x, p.y + lift - kerb, z);
          nor.push(p.n[0] * sg, 0, p.n[1] * sg, p.n[0] * sg, 0, p.n[1] * sg);
          uv.push(0.02, p.ch, 0.02 + kerb, p.ch);
        }
        for (let i = 0; i < n - 1; i++) { const k = base + i * 2; if (side) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
    }
    return geom.custom({ position: pos, index: idx, normal: nor, uv });
  }

  /**
   * Two door leaves standing open in a doorway (cedar boards, bronze bands and shoes), the lintel at the springing
   * with the boarded tympanum over it, and the sill. F = { at(u, s), E, S, rot }: the frame of the gate (u across, s
   * along the passage); sp = station of the pivots; dir = +1 / -1: the way the leaves swing; opts: { half (half width of
   * the doorway), floor (level), spring (springing above the floor), sill: bucket of the sill, open: degrees off the reveal }.
   */
  function doorSet(F, sp, dir, { half, floor, spring, sill = 'bronze', open = 12 }) {
    const { at, E, S, rot } = F, LEAF = half - 0.05, LH = spring - 0.1, OPEN = open * M.DEG;
    for (const sg of [-1, 1]) {
      const pu = sg * (half - 0.12), vu = -sg * Math.sin(OPEN), vs = dir * Math.cos(OPEN);
      const c = at(pu + (vu * LEAF) / 2, sp + (vs * LEAF) / 2), wv = [E[0] * vu + S[0] * vs, E[1] * vu + S[1] * vs], r = Math.atan2(wv[1], wv[0]) * M.RAD;
      put('cedar', geom.box({ x: c[0], z: c[1], sx: LEAF, sz: 0.14, y0: floor + 0.06, y1: floor + LH, rotDeg: r }));
      const nb = Math.max(3, Math.round(LH / 1.2));
      for (let k = 0; k < nb; k++) { const y = floor + 0.3 + (k * (LH - 0.75)) / (nb - 1); put('bronze', geom.box({ x: c[0], z: c[1], sx: LEAF + 0.02, sz: 0.19, y0: y, y1: y + 0.22, rotDeg: r })); }
      const pp = at(pu, sp);
      put('bronze', geom.box({ x: pp[0], z: pp[1], sx: 0.26, sz: 0.26, y0: floor - 0.02, y1: floor + 0.3, rotDeg: rot }));
      put('cedar', geom.box({ x: pp[0], z: pp[1], sx: 0.2, sz: 0.2, y0: floor + 0.3, y1: floor + LH + 0.1, rotDeg: rot }));
    }
    const c = at(0, sp), yl = LH + 0.62;
    put('stone', geom.box({ x: c[0], z: c[1], sx: 2 * half, sz: 0.56, y0: floor + LH + 0.1, y1: floor + yl, rotDeg: rot }));
    // tympanum: the part of the semicircle above the lintel, boarded, both faces
    const a0 = Math.asin(Math.min(0.95, (yl - spring) / half)), pts = [];
    for (let i = 0; i <= 16; i++) { const a = a0 + ((Math.PI - 2 * a0) * i) / 16; pts.push([half * Math.cos(a), spring + half * Math.sin(a)]); }
    for (const side of [-1, 1]) {
      const pos = [], idx = [], nor = [];
      for (const [x, y] of pts) { const p = at(x, sp + side * 0.07); pos.push(p[0], floor + y, p[1]); nor.push(S[0] * side, 0, S[1] * side); }
      for (let i = 1; i + 1 < pts.length; i++) { if (side > 0) idx.push(0, i, i + 1); else idx.push(0, i + 1, i); }
      put('cedar', geom.custom({ position: pos, index: idx, normal: nor }));
    }
    for (const y of [yl + 0.3, yl + 0.95]) { const hw = Math.sqrt(Math.max(0.01, half * half - (y + 0.11 - spring) ** 2)); if (hw > 0.4) put('bronze', geom.box({ x: c[0], z: c[1], sx: 2 * hw, sz: 0.19, y0: floor + y, y1: floor + y + 0.2, rotDeg: rot })); }
    put(sill, geom.box({ x: c[0], z: c[1], sx: 2 * half, sz: 0.6, y0: floor - 0.04, y1: floor + 0.085, rotDeg: rot }));
  }

  /** A flat disc (n-gon) on a wall face: centre c [x, y, z], outward plan normal nrm [nx, nz], radius r. */
  function disc(c, nrm, r, seg = 14) {
    const t = [nrm[1], -nrm[0]], pos = [c[0], c[1], c[2]], idx = [], nor = [nrm[0], 0, nrm[1]];   // t = the viewer's right
    for (let i = 0; i < seg; i++) {
      const a = (2 * Math.PI * i) / seg; pos.push(c[0] + t[0] * r * Math.cos(a), c[1] + r * Math.sin(a), c[2] + t[1] * r * Math.cos(a)); nor.push(nrm[0], 0, nrm[1]);
      idx.push(0, 1 + i, 1 + ((i + 1) % seg));
    }
    return geom.custom({ position: pos, index: idx, normal: nor });
  }
  /** Ring with the interior on the LEFT of travel (counter-clockwise seen from above): the order parapet() wants. */
  const ccw = (ring) => { const o = M.openRing(ring); return M.polygonArea(o) > 0 ? o.reverse() : o; };

  return { C, SK, mats, put, putFar, flush, bucketTris, merlons: () => merlonCount, addGlazed, doorSet, faceEnds, rosettes, skin, gateBands, gateSkin, plainSkin, fieldSkin, arcBand, parapet, strip, disc, ccw, occlude, sub, len, unit, lerp2, W };
}
