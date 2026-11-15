// js/modules/walls/kit.js — the parts kit of the `walls` module: bins (one list of geometry per material and level
// of detail), tints, polyline helpers, a face builder with real rectangular recesses (doors, loopholes, grooves),
// parapeted towers with corbelled tops, merlon rows in three levels (instanced geometry, alpha strip, nothing).
// Everything is world-space and deterministic; randomness comes from hash2 only.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

/** Near level of detail ends here (m, measured on the 1024 m grid of the far tiles). */
export const NEAR = 720;
/** Merlons: stepped geometry (instanced) to MERLON_NEAR, the alpha strip to MERLON_FAR, nothing beyond (under one pixel). */
export const MERLON_NEAR = 420, MERLON_FAR = 1900;
export const MERLON = { pitch: 1.3, width: 0.8, height: 0.9, thickness: 0.5, steps: 3 };
export const PARAPET = 1.1;
/** Within this distance (m) of the film path a stretch of wall gets stepped merlons as geometry and the richer faces. */
export const FILM_NEAR = 520;          // breastwork under the merlons: 1.1 + 0.9 = the "almost 2 m" crenellated parapet

export function makeKit(ctx) {
  const { geom, materials, ground, THREE } = ctx;
  const draft = !!ctx.quality.draft;

  // ---------------------------------------------------------------------------------------------- materials ----
  // City scale: ONE mud material (white variant, tone per vertex) and ONE brick material; the far level puts brick
  // parts into the mud material too (a brick tone per vertex), so that the aerial costs one call per 1024 m cell.
  const mats = {
    mud: materials.preset('houseWalls', { name: 'walls-mud', wear: 0.38 }),
    brick: materials.preset('quayBrick', { name: 'walls-brick', color: 0xffffff }),
    timber: materials.preset('planks', { name: 'walls-planks', vertical: true }),
    poles: materials.preset('palmPlanks', { name: 'walls-poles', vertical: true }),
    earth: materials.variant('streetEarth', { name: 'walls-earth' }),
    bronze: materials.variant('bronze', { name: 'walls-bronze' }),
  };
  const col = (id, k = 1) => { const c = materials.color(id); return [c.r * k, c.g * k, c.b * k]; };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const TONE = {
    mud: col('mudPlaster'), sunlit: col('mudPlasterSunlit'), weathered: col('mudPlasterWeathered'), fresh: col('mudPlasterFresh'),
    grey: col('mudPlasterGrey'), damp: col('mudPlasterDampBase'), dark: col('mudPlasterDark'), reddish: col('mudPlasterReddish'),
    walk: mul(col('roofEarth'), 0.86), brick: col('bakedBrickBuff'), brickYellow: col('bakedBrickYellow'), brickRed: col('bakedBrickRed'),
    timber: mul(col('palmWood'), 0.8), earth: col('streetEarth'), white: [1, 1, 1], bitumen: col('bitumen'),
  };
  /** A mud tone for element number i of a family: mixes of the palette tones with a value jitter of +/-9 %. */
  function mudTone(i, seed, bias = 0) {
    const a = hash2(i, 11, seed), b = hash2(i, 12, seed), c = hash2(i, 13, seed);
    let t = mix(TONE.mud, TONE.grey, a * 0.7);
    t = mix(t, b < 0.5 ? TONE.weathered : TONE.sunlit, 0.35 * Math.abs(b - 0.5) * 2 + bias);
    if (c > 0.86) t = mix(t, TONE.fresh, 0.5);
    return mul(t, 0.93 + 0.14 * hash2(i, 14, seed));
  }
  function brickTone(i, seed) {
    const a = hash2(i, 21, seed);
    return mul(mix(TONE.brick, a < 0.5 ? TONE.brickYellow : TONE.brickRed, 0.22 * Math.abs(a - 0.5) * 2), 0.94 + 0.12 * hash2(i, 22, seed));
  }
  /** linear [r, g, b] -> sRGB 0xRRGGBB (instance tints are sRGB) */
  const toHex = (c) => new THREE.Color().setRGB(Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2])).getHex();

  // ---------------------------------------------------------------------------------------------- film path ----
  const path = []; for (let t = 0; t <= ctx.film.duration + 1e-6; t += 0.1) path.push(ctx.film.pathPoseAt(t).pos);
  /** Shortest distance (m) from the camera path of the film to a point. */
  function filmDist(x, y, z) {
    let m = Infinity;
    for (const p of path) { const dx = p[0] - x, dy = p[1] - y, dz = p[2] - z, d = dx * dx + dy * dy + dz * dz; if (d < m) m = d; }
    return Math.sqrt(m);
  }
  const state = { force: false };      // force: stepped merlons whatever the distance to the film path (gates)

  // ---------------------------------------------------------------------------------------------- bins ----
  const bins = { near: new Map(), far: [], strips: new Map(), strips0: new Map() };
  const stats = { merlons: 0, stripMetres: 0, stripOnlyMetres: 0, towers: 0, bays: 0 };
  /** near-level geometry of material `key` ('mud' | 'brick' | 'timber' | 'earth' | 'bronze'); a tint paints the whole piece */
  function put(key, g, tint) {
    if (!g) return;
    if (g.isBufferGeometry && !(g.attributes.position && g.attributes.position.count)) return;
    if (tint) geom.paint(g, tint);
    if (state.capture && g.isBufferGeometry) state.capture.push(g.clone());
    let a = bins.near.get(key); if (!a) bins.near.set(key, (a = []));
    a.push(g);
  }
  /** Measure what `fn` puts into the near level: geom.inspect of all of it as one mesh. */
  function inspectOf(fn) {
    const prev = state.capture; state.capture = [];
    const out = fn(), list = state.capture; state.capture = prev;
    const r = list.length ? geom.inspect(geom.merge(list)) : null;
    return { out, inspect: r && { tris: r.tris, openAbove: +r.openAbove.toFixed(2), flipped: r.flipped, overlap: +r.overlap.toFixed(3) } };
  }
  /** A square timber between two points [x, y, z] (ladder rails, braces, poles at any angle). */
  function beamInto(w, a, b, half) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]); if (l < 1e-4) return;
    d[0] /= l; d[1] /= l; d[2] /= l;
    let u = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]], nm = (p) => { const k = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / k, p[1] / k, p[2] / k]; };
    const v = nm(cr(d, u)); u = nm(cr(v, d));
    const c = (p, i, j) => [p[0] + (u[0] * i + v[0] * j) * half, p[1] + (u[1] * i + v[1] * j) * half, p[2] + (u[2] * i + v[2] * j) * half];
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % 4], p0 = c(a, i0, j0), p1 = c(a, i1, j1), p2 = c(b, i1, j1), p3 = c(b, i0, j0);
      // outward normal of this side: the mean of the two corner directions
      const nx = u[0] * (i0 + i1) + v[0] * (j0 + j1), ny = u[1] * (i0 + i1) + v[1] * (j0 + j1), nz = u[2] * (i0 + i1) + v[2] * (j0 + j1);
      geom.kit.quadTo(w, p0, p1, p2, p3, nx, ny, nz);
    }
    geom.kit.quadTo(w, c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), -d[0], -d[1], -d[2]);
    geom.kit.quadTo(w, c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1), d[0], d[1], d[2]);
  }
  /** far-level geometry (always the mud material: pass the tone, a brick tone for brick parts) */
  function putFar(g, tint) { if (!g) return; if (tint) geom.paint(g, tint); bins.far.push(g); }
  const writer = () => new geom.MeshWriter({ verts: 512, color: true, ao: true });

  /** Paint a geometry by the direction of its faces: `side` for walls, `top` for faces that look up. */
  function paintBy(g, side, top) {
    const n = g.attributes.position.count, nor = g.attributes.normal.array, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = nor[i * 3 + 1] > 0.7 ? top : side; a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }

  // ---------------------------------------------------------------------------------------------- polylines ----
  /** The part of a polyline between chainages s0 and s1 (with the vertices in between). */
  function subLine(line, s0, s1, ch = M.chainage(line)) {
    const total = ch[ch.length - 1]; s0 = M.clamp(s0, 0, total); s1 = M.clamp(s1, 0, total);
    const at = (s) => { const p = M.pointAlong(line, s); return [p.x, p.z]; };
    const out = [at(s0)];
    for (let i = 1; i < line.length - 1; i++) if (ch[i] > s0 + 0.05 && ch[i] < s1 - 0.05) out.push([line[i][0], line[i][1]]);
    out.push(at(s1));
    return out;
  }
  /** Lowest ground level under a strip across a line at (x, z): offsets in metres to the right of travel direction d. */
  function groundMin(x, z, d, offsets) {
    let m = Infinity;
    for (const o of offsets) m = Math.min(m, ground.height(x - d[1] * o, z + d[0] * o));
    return m;
  }

  // ---------------------------------------------------------------------------------------------- faces ----
  /**
   * A vertical rectangular face from plan point a to b that looks to the RIGHT of travel a -> b, from `base` to
   * `top`, with rectangular recesses as real geometry (back face, jambs, sill, soffit).
   * rec: [{ s0, s1, y0, y1, depth, ao }] (s along a -> b in metres, y = datum levels). Written into writer w.
   */
  function panel(w, a, b, base, top, rec = [], { breaks = null, ys = null } = {}) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4 || top - base < 1e-4) return;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = -dz, nz = dx;
    const list = [];
    for (const r of rec) {
      const s0 = Math.max(0.02, r.s0), s1 = Math.min(len - 0.02, r.s1), y0 = Math.max(base, r.y0), y1 = Math.min(top, r.y1);
      if (s1 - s0 > 0.03 && y1 - y0 > 0.03 && r.depth > 0.01) list.push({ s0, s1, y0, y1, depth: r.depth, ao: r.ao ?? 0.6 });
    }
    if (!list.length && !breaks && !ys) { w.occlusion(1); w.quad(a[0], base, a[1], b[0], base, b[1], b[0], top, b[1], a[0], top, a[1]); return; }
    const uniq = (v) => { v.sort((p, q) => p - q); const o = [v[0]]; for (let i = 1; i < v.length; i++) if (v[i] - o[o.length - 1] > 1e-4) o.push(v[i]); return o; };
    const hardS = (breaks || []).filter((v) => v > 0.05 && v < len - 0.05), hardY = (ys || []).filter((v) => v > base + 0.05 && v < top - 0.05);
    const S = uniq([0, len, ...hardS, ...list.flatMap((r) => [r.s0, r.s1])]), Y = uniq([base, top, ...hardY, ...list.flatMap((r) => [r.y0, r.y1])]);
    const isHard = (v) => hardS.some((h) => Math.abs(h - v) < 1e-4);
    const ns = S.length - 1, ny = Y.length - 1, dep = new Float32Array(ns * ny), occ = new Float32Array(ns * ny).fill(1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
      const sc = (S[i] + S[i + 1]) / 2, yc = (Y[j] + Y[j + 1]) / 2;
      for (const r of list) if (sc > r.s0 && sc < r.s1 && yc > r.y0 && yc < r.y1) { dep[j * ns + i] = r.depth; occ[j * ns + i] = r.ao; break; }
    }
    const P = (s, y, d) => [a[0] + dx * s - nx * d, y, a[1] + dz * s - nz * d];
    for (let j = 0; j < ny; j++) {
      // faces: runs of equal depth along the row
      for (let i = 0; i < ns;) {
        let k = i; const d = dep[j * ns + i];
        while (k + 1 < ns && dep[j * ns + k + 1] === d && !isHard(S[k + 1])) k++;
        w.occlusion(d > 0 ? occ[j * ns + i] : 1);
        w.quadP(P(S[i], Y[j], d), P(S[k + 1], Y[j], d), P(S[k + 1], Y[j + 1], d), P(S[i], Y[j + 1], d));
        i = k + 1;
      }
      // jambs between horizontally adjacent cells of different depth
      for (let i = 0; i + 1 < ns; i++) {
        const d0 = dep[j * ns + i], d1 = dep[j * ns + i + 1]; if (d0 === d1) continue;
        const s = S[i + 1], lo = Math.min(d0, d1), hi = Math.max(d0, d1);
        w.occlusion(0.72);
        if (d1 > d0) w.quadP(P(s, Y[j], lo), P(s, Y[j], hi), P(s, Y[j + 1], hi), P(s, Y[j + 1], lo));     // the recess is on the +s side: the jamb looks along +s
        else w.quadP(P(s, Y[j], hi), P(s, Y[j], lo), P(s, Y[j + 1], lo), P(s, Y[j + 1], hi));             // looks back along -s
      }
    }
    // sills and soffits between vertically adjacent cells of different depth
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i < ns; i++) {
      const d0 = dep[j * ns + i], d1 = dep[(j + 1) * ns + i]; if (d0 === d1) continue;
      const y = Y[j + 1], lo = Math.min(d0, d1), hi = Math.max(d0, d1);
      if (d1 > d0) { w.occlusion(0.8); w.quadP(P(S[i], y, lo), P(S[i + 1], y, lo), P(S[i + 1], y, hi), P(S[i], y, hi)); }      // sill, looks up
      else { w.occlusion(0.62); w.quadP(P(S[i + 1], y, lo), P(S[i], y, lo), P(S[i], y, hi), P(S[i + 1], y, hi)); }            // soffit, looks down
    }
    w.occlusion(1);
  }

  /** Box into a writer: centre (cx, cz), half sizes hx (along unit e) and hz (across), levels y0..y1; faces: 'bottom' and 'top' optional. */
  function boxInto(w, cx, cz, e, hx, hz, y0, y1, { top = true, bottom = false } = {}) {
    const fx = -e[1], fz = e[0];
    const p = (i, j) => [cx + e[0] * hx * i + fx * hz * j, cz + e[1] * hx * i + fz * hz * j];
    const c = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      // ring order (-1,-1) (1,-1) (1,1) (-1,1): its interior is on the right of travel in plan (x east, z south), so the outward face needs b -> a
      w.quad(b[0], y0, b[1], a[0], y0, a[1], a[0], y1, a[1], b[0], y1, b[1]);
    }
    if (top) w.quad(c[0][0], y1, c[0][1], c[3][0], y1, c[3][1], c[2][0], y1, c[2][1], c[1][0], y1, c[1][1]);
    if (bottom) w.quad(c[0][0], y0, c[0][1], c[1][0], y0, c[1][1], c[2][0], y0, c[2][1], c[3][0], y0, c[3][1]);
  }

  // ---------------------------------------------------------------------------------------------- merlons ----
  // One instanced set for all stepped merlons of the mud walls and one for the brick ones; strips per palette id.
  const merlonSets = new Map();
  function merlonSet(key) {
    let s = merlonSets.get(key);
    if (!s) merlonSets.set(key, (s = geom.instanced({ name: 'walls-merlons-' + key, geometry: geom.kit.merlonUnit(MERLON), material: mats[key], lod: [0, MERLON_NEAR], shadowFar: 260, castShadow: true })));
    return s;
  }
  /**
   * A row of merlons standing on level y along a polyline (already at its place: no offset).
   * key: 'mud' | 'brick'; tint: linear [r, g, b]. Stepped instances near, an alpha strip to MERLON_FAR.
   */
  function merlonRow(key, pl, y, tint) {
    const len = M.polylineLength(pl); if (len < MERLON.pitch) return;
    const mid = pl[pl.length >> 1], a = pl[0], near = state.force || Math.min(filmDist(mid[0], y, mid[1]), filmDist(a[0], y, a[1])) < FILM_NEAR;
    const id = 'all', bin = near ? bins.strips : bins.strips0;
    if (near) {
      const hex = toHex(tint), set = merlonSet(key);
      for (const p of geom.kit.merlonLayout(pl, { y, pitch: MERLON.pitch })) { set.add({ x: p.x, y: p.y, z: p.z, rotDeg: Math.atan2(p.uz, p.ux) * M.RAD }, hex); stats.merlons++; }
      stats.stripMetres += len;
    } else stats.stripOnlyMetres += len;
    let arr = bin.get(id); if (!arr) bin.set(id, (arr = []));
    arr.push(geom.paint(geom.merlonStrip(pl, { y, pitch: MERLON.pitch, width: MERLON.width, height: MERLON.height }), tint));
  }
  // the far stand-in of the merlons: the alpha silhouette of the geometry kit on the module's own white plaster, so
  // that a strip carries the tone of its wall (one material for mud and brick rows)
  let stripMat = null;
  const stripMaterial = () => stripMat || (stripMat = materials.preset('houseWalls', { name: 'walls-crenel', alphaMap: geom.merlonStripMaterial('mudPlaster', MERLON.width / MERLON.pitch, MERLON.steps).alphaMap, alphaTest: 0.5, side: THREE.DoubleSide }));

  // ---------------------------------------------------------------------------------------------- towers ----
  /**
   * A parapeted tower with real openings. spec:
   *   x, z, rotDeg (local +x along the wall), w (along the wall), d (across), out: [dx, dz] unit, away from the city
   *   base, top (platform level), key: 'mud' | 'brick', tint
   *   walkA / walkB: wall-walk levels of the curtain on the -x / +x side (null: no curtain there), axis: local z of the wall axis
   *   rows: [{ y0, y1, n, width, depth }] loophole rows on front and rear; grooves: number of vertical grooves on the front
   *   corbel: 0.22 (overhang of the parapet), beams: true (beam ends under the corbel), hatch: true, door: { width, height }
   * Adds the near geometry, the merlons and the far block.
   */
  function tower(spec) {
    const { x, z, rotDeg, w: tw, d: td, out, base, top, key = 'mud', tint, walkA = null, walkB = null, axis = 0, rows = [], grooves = 0, corbel = 0.22, beams = true, hatch = false, farOnly = false, nearOnly = false, groovesFrom = null } = spec;
    const e = M.rotateXZ(1, 0, rotDeg), f = [-e[1], e[0]];                       // local x (along the wall), local z (right of travel)
    const sgn = out[0] * f[0] + out[1] * f[1] >= 0 ? 1 : -1;                     // the outward side in local z
    const C = (lx, lz) => [x + e[0] * lx + f[0] * lz, z + e[1] * lx + f[1] * lz];
    // corners in an order whose interior lies on the LEFT of travel, so every panel a -> b looks outward
    const hw = tw / 2, hd = td / 2;
    const faces = [
      { a: C(-hw, sgn * hd), b: C(hw, sgn * hd), kind: 'front' }, { a: C(hw, sgn * hd), b: C(hw, -sgn * hd), kind: 'flankB' },
      { a: C(hw, -sgn * hd), b: C(-hw, -sgn * hd), kind: 'rear' }, { a: C(-hw, -sgn * hd), b: C(-hw, sgn * hd), kind: 'flankA' },
    ];
    // which way round? panel() faces the right of travel: test the first face against `out`
    { const fa = faces[0], dx = fa.b[0] - fa.a[0], dz = fa.b[1] - fa.a[1]; if (-dz * out[0] + dx * out[1] < 0) for (const q of faces) { const t = q.a; q.a = q.b; q.b = t; } }
    const ring = [C(-hw, -hd), C(hw, -hd), C(hw, hd), C(-hw, hd)];
    const shaftTop = top - (corbel > 0 ? 0.3 : 0);
    stats.towers++;
    if (!nearOnly) {
      // far level: a block with a sunk platform
      putFar(geom.parapetBlock(ring, { base, top, parapet: PARAPET, thickness: 0.6 }), tint);
    }
    if (farOnly) return;
    const wr = writer(); wr.color(tint);
    for (const q of faces) {
      const len = q.kind === 'front' || q.kind === 'rear' ? tw : td, rec = [];
      if (q.kind === 'front' || q.kind === 'rear') {
        for (const r of rows) {
          const n = q.kind === 'rear' ? Math.max(1, r.n - 1) : r.n;
          for (let i = 0; i < n; i++) { const c = (len * (i + 1)) / (n + 1); rec.push({ s0: c - r.width / 2, s1: c + r.width / 2, y0: r.y0, y1: r.y1, depth: r.depth, ao: 0.5 }); }
        }
        if (q.kind === 'front' && grooves > 0) {
          const y0 = groovesFrom ?? base + 4, y1 = (rows.length ? Math.min(...rows.map((r) => r.y0)) : shaftTop) - 1.2;
          for (let i = 0; i < grooves; i++) { const c = (len * (i + 1)) / (grooves + 1); if (y1 - y0 > 2) rec.push({ s0: c - 0.3, s1: c + 0.3, y0, y1, depth: 0.28, ao: 0.72 }); }
        }
      } else {
        // flanks: the door from the wall-walk into the tower room, and one loophole per row on the projecting part
        const walk = q.kind === 'flankA' ? walkA : walkB;
        // position of the wall axis along this face: local z = axis; the face runs from one local z end to the other
        const za = (q.a[0] - x) * f[0] + (q.a[1] - z) * f[1], zb = (q.b[0] - x) * f[0] + (q.b[1] - z) * f[1];
        const sAxis = ((axis - za) / (zb - za)) * len;
        if (walk !== null && spec.door !== false) {
          const dh = Math.min(1.95, shaftTop - walk - 0.45), dw = 1.05;
          if (dh > 1.2) rec.push({ s0: sAxis - dw / 2, s1: sAxis + dw / 2, y0: walk + 0.02, y1: walk + dh, depth: 0.9, ao: 0.42 });
        }
        for (const r of rows) {
          // on the part that projects outward beyond the curtain
          const sOut = ((sgn * (hd - 1.6) - za) / (zb - za)) * len;
          if (Math.abs(sOut - sAxis) > 2.2) rec.push({ s0: sOut - r.width / 2, s1: sOut + r.width / 2, y0: r.y0, y1: r.y1, depth: r.depth, ao: 0.5 });
        }
      }
      panel(wr, q.a, q.b, base, shaftTop, rec);
    }
    put(key, wr.toGeometry());
    // the crenellated top: a parapet that oversails the shaft on beam ends (Assyrian reliefs of city walls)
    const or = corbel > 0 ? geom.insetRing(ring, -corbel) : ring;
    if (corbel > 0) {
      put(key, geom.parapetBlock(or, { base: top - 0.3, top, parapet: PARAPET, thickness: 0.55 }), mul(tint, 1.03));
      put(key, geom.cap(or, top - 0.3, { holes: [ring], up: false }), mul(tint, 0.8));
      if (beams && !draft && (state.force || filmDist(x, top, z) < FILM_NEAR + 80)) {
        const bw = writer(); bw.color(TONE.timber);
        for (const q of faces) {
          const len = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]), n = Math.max(2, Math.round(len / 0.95)), dx = (q.b[0] - q.a[0]) / len, dz = (q.b[1] - q.a[1]) / len, nx = -dz, nz = dx;
          for (let i = 0; i < n; i++) { const s = (len * (i + 0.5)) / n; boxInto(bw, q.a[0] + dx * s + nx * 0.105, q.a[1] + dz * s + nz * 0.105, [dx, dz], 0.075, 0.105, top - 0.47, top - 0.3, { top: true, bottom: true }); }
        }
        put(key, bw.toGeometry());
      }
    } else put(key, geom.parapetBlock(ring, { base: top, top, parapet: PARAPET, thickness: 0.55 }), tint);
    if (hatch && !draft) {
      // the stair head of the tower room: a low kerbed opening with a lid of planks, in a rear corner of the platform
      const c = C(-hw + 1.6, -sgn * (hd - 1.7)), hwr = writer(); hwr.color(mul(tint, 0.96));
      boxInto(hwr, c[0], c[1], e, 0.75, 0.95, top, top + 0.42);
      put(key, hwr.toGeometry());
    }
    merlonRow(key, M.closeRing(geom.insetRing(or, 0.28)), top + PARAPET, mul(tint, 1.03));
    return { ring, outer: or };
  }

  // ---------------------------------------------------------------------------------------------- submission ----
  function flush({ reflect = true } = {}) {
    const merged = (list) => (list && list.length ? geom.merge(list) : null);
    const far = merged(bins.far), mud = merged(bins.near.get('mud'));
    const tris = { near: {}, far: far ? geom.triCount(far) : 0, strips: 0 };
    if (mud) tris.near.mud = geom.triCount(mud);
    // the mud walls in two levels on consistent grids: 512 m tiles near, 1024 m tiles far
    geom.addLODs(mats.mud, [{ geometry: mud, max: NEAR, tile: 512 }, { geometry: far, tile: 1024 }], { reflect });
    for (const [key, list] of bins.near) {
      if (key === 'mud') continue;
      const g = merged(list); if (!g) continue;
      tris.near[key] = geom.triCount(g);
      const small = key === 'timber' || key === 'bronze' || key === 'poles';
      geom.addStatic(mats[key], g, { tile: 512, lod: [0, NEAR], lodGrid: [512, 1024], reflect: reflect && !small, castShadow: key !== 'earth', shadowTexel: small ? 0.3 : undefined });
    }
    for (const [bin, lod] of [[bins.strips, [MERLON_NEAR, MERLON_FAR]], [bins.strips0, [0, MERLON_FAR]]]) for (const [id, list] of bin) {
      const g = merged(list); if (!g) continue;
      tris.strips += geom.triCount(g);
      geom.addStatic(stripMaterial(), g, { lod, ao: false, castShadow: false }); void id;
    }
    bins.near.clear(); bins.far.length = 0; bins.strips.clear(); bins.strips0.clear();
    return tris;
  }

  /** horizontal quad that looks up, whatever the winding of the ring of four [x, z] points */
  const topQuad = (w, ring, y) => { const q = M.polygonArea(ring) > 0 ? [...ring].reverse() : ring; w.quad(q[0][0], y, q[0][1], q[1][0], y, q[1][1], q[2][0], y, q[2][1], q[3][0], y, q[3][1]); };
  return { mats, TONE, col, mix, mul, mudTone, brickTone, toHex, put, putFar, writer, paintBy, subLine, groundMin, panel, boxInto, topQuad, merlonRow, tower, flush, stats, draft, bins, filmDist, state, inspectOf, beamInto };
}
