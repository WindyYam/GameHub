// js/core/ground.js — subsystem "ground": the analytic ground of the whole model (ENGINE.md 5.1, docs/ground.md).
// OWNER: ground engineer (also js/modules/terrain.js, which draws what this file defines).
//
// No meshes, no DOM, no three.js: derived from world.json alone, so it also runs under node.
//   height(x, z)      ground level in the excavation datum (river / moat / canal beds below the water plane)
//   landHeight(x, z)  the same ignoring water (what the ground would be if the water were filled in)
//   meshHeight(x, z, inset, platformInset)  what the terrain MESH samples: identical, except that every sharp step
//                     (quay face, platform edge, causeway side) is moved into the masonry that retains it
//   zone / zoneCode / landUse / isWater / waterDepth / normal / profile / shoreDistance  (contract)
//   bankAt, banks, hardEdges, platforms, causeways, canals, fields, palaceQuarter ...    (additions, docs/ground.md)
//
// How it is put together (everything smooth lives in two bilinear grids, everything sharp in a sparse 40 m
// feature grid, so a query costs about 0.1 microseconds):
//   base     flat alluvium +0.8, the river levee, the city mound from spot levels, village mounds, the Babil mound
//   platforms  monument floors and made terraces: flat, sharp-edged (retaining walls belong to the modules)
//   wall zones lane, berm (+1 at the wall foot to +2 at the quay), raised stretch at the palaces (W.innerWallLevels)
//   corridors  Processional Way profile (level between the lion-street walls, sharp-edged forecourt at the gate),
//              Untere Tempelstrasse at the levels of the layout's street record, road embankments
//   water    river, four moats (vertical at brick quays and walls, sloped mud elsewhere), canal cuts with
//            levees, causeways across the moats with the gap of the timber span
//   fields   feeders (river banks, moat banks, main canals, generated branch canals and field ditches) -> palm
//            belts and strip fields 13 to 40 m wide perpendicular to their feeder, rasterised at 6 m: ONE answer
//            for landUse(); head and side ditches of every block (fields.ditches)
import * as M from './mathx.js';
import { hash2 } from './rng.js';
import { monumentLevels } from './world.js';

export const ZONE = Object.freeze({
  RIVER: 1, MOAT: 2, CANAL: 3, STREET: 4, PRECINCT_COURT: 5, MONUMENT: 6, WALL: 7, BERM: 8,
  INNER_CITY: 9, OUTER_CITY: 10, FIELDS: 11, STEPPE: 12, PALM_BELT: 13, VILLAGE: 14,
});
export const ZONE_NAMES = Object.freeze({
  1: 'river', 2: 'moat', 3: 'canal', 4: 'street', 5: 'precinctCourt', 6: 'monument', 7: 'wall', 8: 'berm',
  9: 'innerCity', 10: 'outerCity', 11: 'fields', 12: 'steppe', 13: 'palmBelt', 14: 'village',
});

// ---- small allocation-free helpers -------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { let t = (v - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
/** flat open ring [x0, z0, x1, z1, ...] from [[x, z], ...] (closed or open) */
function flatRing(ring) { const r = M.openRing(ring), f = new Float64Array(r.length * 2); for (let i = 0; i < r.length; i++) { f[i * 2] = r[i][0]; f[i * 2 + 1] = r[i][1]; } return f; }
function pipFlat(x, z, f) {
  let inside = false;
  for (let i = 0, n = f.length, j = n - 2; i < n; j = i, i += 2) {
    const zi = f[i + 1], zj = f[j + 1];
    if ((zi > z) !== (zj > z) && x < ((f[j] - f[i]) * (z - zi)) / (zj - zi) + f[i]) inside = !inside;
  }
  return inside;
}
function segD2(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t - x, pz = az + dz * t - z;
  return px * px + pz * pz;
}
function ringD2(x, z, f) { let b = Infinity; for (let i = 0, n = f.length, j = n - 2; i < n; j = i, i += 2) { const d = segD2(x, z, f[j], f[j + 1], f[i], f[i + 1]); if (d < b) b = d; } return b; }
function bbFlat(f) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i < f.length; i += 2) { if (f[i] < a) a = f[i]; if (f[i] > c) c = f[i]; if (f[i + 1] < b) b = f[i + 1]; if (f[i + 1] > d) d = f[i + 1]; } return [a, b, c, d]; }
/** segments of a polyline: { ax, az, bx, bz, ux, uz (unit), len, s0 (chainage of a), i, pl } */
function segsOf(pl, tag) {
  const out = []; let s = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1], len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    out.push({ ax, az, bx, bz, ux: (bx - ax) / len, uz: (bz - az) / len, len, s0: s, i, tag });
    s += len;
  }
  return out;
}
// nearest segment of a list: results in module-level scratch (no allocation in the hot path)
let N_d = 0, N_seg = null, N_t = 0, N_side = 1;
function nearestSeg(x, z, list) {
  let best = Infinity, bs = null, bt = 0;
  for (let k = 0; k < list.length; k++) {
    const g = list[k];
    let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, d = px * px + pz * pz;
    if (d < best) { best = d; bs = g; bt = t; }
  }
  N_seg = bs; N_t = bt; N_d = Math.sqrt(best);
  if (bs) { const px = bs.ax + (bs.bx - bs.ax) * bt, pz = bs.az + (bs.bz - bs.az) * bt; N_side = bs.ux * (z - pz) - bs.uz * (x - px) >= 0 ? 1 : -1; }
  return bs;
}

// ---- scanline rasteriser (shared with terrain.js through ground.raster) -------------------------------
/** Fill the cells whose CENTRE lies inside the polygon (flat ring, even-odd). grid = { data, w, h, x0, z0, cell }. */
function fillPoly(grid, f, value) {
  const { data, w, h, x0, z0, cell } = grid, n = f.length;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 1; i < n; i += 2) { if (f[i] < minZ) minZ = f[i]; if (f[i] > maxZ) maxZ = f[i]; }
  const j0 = Math.max(0, Math.ceil((minZ - z0) / cell - 0.5)), j1 = Math.min(h - 1, Math.floor((maxZ - z0) / cell - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = z0 + (j + 0.5) * cell; xs.length = 0;
    for (let i = 0, k = n - 2; i < n; k = i, i += 2) {
      const zi = f[i + 1], zk = f[k + 1];
      if ((zi > z) !== (zk > z)) xs.push(f[i] + ((z - zi) / (zk - zi)) * (f[k] - f[i]));
    }
    if (xs.length < 2) continue;
    if (xs.length === 2) { if (xs[0] > xs[1]) { const t = xs[0]; xs[0] = xs[1]; xs[1] = t; } } else xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / cell - 0.5)), i1 = Math.min(w - 1, Math.floor((xs[q + 1] - x0) / cell - 0.5));
      if (i1 >= i0) data.fill(value, j * w + i0, j * w + i1 + 1);
    }
  }
}
/** Fill a thick polyline (round joints and caps). */
function fillLine(grid, pl, half, value) {
  const { data, w, h, x0, z0, cell } = grid, q = new Float64Array(8);
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1], l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    const nx = (-(bz - az) / l) * half, nz = ((bx - ax) / l) * half;
    q[0] = ax + nx; q[1] = az + nz; q[2] = bx + nx; q[3] = bz + nz; q[4] = bx - nx; q[5] = bz - nz; q[6] = ax - nx; q[7] = az - nz;
    fillPoly(grid, q, value);
  }
  for (const p of pl) {
    const j0 = Math.max(0, Math.ceil((p[1] - half - z0) / cell - 0.5)), j1 = Math.min(h - 1, Math.floor((p[1] + half - z0) / cell - 0.5));
    for (let j = j0; j <= j1; j++) {
      const dz = z0 + (j + 0.5) * cell - p[1], r = Math.sqrt(Math.max(0, half * half - dz * dz));
      const i0 = Math.max(0, Math.ceil((p[0] - r - x0) / cell - 0.5)), i1 = Math.min(w - 1, Math.floor((p[0] + r - x0) / cell - 0.5));
      if (i1 >= i0) data.fill(value, j * w + i0, j * w + i1 + 1);
    }
  }
}

export async function create(ctx) {
  const world = ctx.world, W = ctx.W;
  const WL = world.levels.water;                 // -3.0
  const RIVER_BED = world.river.bedLevel;        // -7.5
  const MOAT_BED = WL - 3.0;                     // -6.0
  const PLAIN = 0.8;                             // dead-flat alluvium
  const NEAR = 45;                               // m: cap of shoreDistance()
  const STEP_INSET = 1.2;                        // m: meshHeight() moves sharp steps this far into the masonry
  const CW_INSET = 2.0;                          // m: the same for the sides of the causeways (their body is 10 m of masonry)
  const CW_SINK = 0.15;                          // m: the mesh lies this far under the causeway roadway, as under monument floors
  const QUAY_FOOT = 2.2;                         // m of water at the foot of a quay or sheer wall
  const DETAIL_C = [900, -900], DETAIL_R0 = 5600, DETAIL_R1 = 7200;   // canal cuts and road embankments fade out here
  const detailFade = (x, z) => 1 - sstep(DETAIL_R0, DETAIL_R1, Math.hypot(x - DETAIL_C[0], z - DETAIL_C[1]));

  // ====================================================================================================
  // sparse feature grid
  // ====================================================================================================
  const CELL = 40, HD = CELL * 0.70711 + 0.01;
  const cells = new Map();
  const keyOf = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);
  const cellAt = (ix, iz) => { const k = keyOf(ix, iz); let c = cells.get(k); if (!c) cells.set(k, (c = { bodies: null, inBody: null, shore: null, plats: null, mons: null, wall: null, owall: null, wbody: null, corr: null, roads: null, canal: null, cway: null, lines: null, bumps: null, vil: null })); return c; };
  const lookup = (x, z) => cells.get((Math.floor(x / CELL) + 2048) * 4096 + Math.floor(z / CELL) + 2048);
  const push = (c, field, item) => { const a = c[field] || (c[field] = []); if (a[a.length - 1] !== item && !a.includes(item)) a.push(item); };
  function eachCellNearSeg(ax, az, bx, bz, r, fn) {
    const i0 = Math.floor((Math.min(ax, bx) - r) / CELL), i1 = Math.floor((Math.max(ax, bx) + r) / CELL);
    const j0 = Math.floor((Math.min(az, bz) - r) / CELL), j1 = Math.floor((Math.max(az, bz) + r) / CELL), lim = (r + HD) * (r + HD);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segD2((i + 0.5) * CELL, (j + 0.5) * CELL, ax, az, bx, bz) <= lim) fn(cellAt(i, j));
  }
  /** fn(cell, full) for every cell the polygon (grown by r) touches; full = the whole cell is inside it */
  function eachCellOfRing(f, r, fn) {
    const bb = bbFlat(f), lim = (r + HD) * (r + HD), limFull = HD * HD;
    for (let j = Math.floor((bb[1] - r) / CELL); j <= Math.floor((bb[3] + r) / CELL); j++) for (let i = Math.floor((bb[0] - r) / CELL); i <= Math.floor((bb[2] + r) / CELL); i++) {
      const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL, d2 = ringD2(cx, cz, f), inside = pipFlat(cx, cz, f);
      if (inside || d2 <= lim) fn(cellAt(i, j), inside && d2 > limFull);
    }
  }
  const regSegs = (segs, r, field) => { for (const g of segs) eachCellNearSeg(g.ax, g.az, g.bx, g.bz, r, (c) => push(c, field, g)); };

  // ====================================================================================================
  // water bodies and their banks
  // ====================================================================================================
  const bodies = [
    { id: 'river', code: ZONE.RIVER, bed: RIVER_BED, ring: flatRing(world.river.polygon) },
    ...world.moats.map((m) => ({ id: m.id, code: ZONE.MOAT, bed: MOAT_BED, ring: flatRing(m.polygon) })),
  ];
  for (const b of bodies) { b.bb = bbFlat(b.ring); b.cw = M.polygonArea(M.openRing(b.id === 'river' ? world.river.polygon : W.moat(b.id).polygon)) > 0; }
  const bodyAtSlow = (x, z, not) => { for (const b of bodies) if (b !== not && x >= b.bb[0] && x <= b.bb[2] && z >= b.bb[1] && z <= b.bb[3] && pipFlat(x, z, b.ring)) return b; return null; };

  // lines along which the bank is a vertical brick face (quay, palace or fortification wall, causeway side)
  const q = world.river.quays;
  const hardLines = [
    ...world.moats.filter((m) => m.innerBank).map((m) => m.innerBank),
    q[0].polyline, q[1].polyline, q[2].polyline, q[4].polyline,
    [[99.1, -1062.7], [351.3, -992.7], [357, -1067.4]],          // North Palace: final north wall, then the causeway side
    [[378.8, -1074.1], [374.1, -992.1]],                         // east moat, west end: the other side of the causeway
    [[-32, -590], [1, -581.9]],                                  // connecting wall at the south end of the West Fortification ditch
    [[1170, -3225], [1073.6, -2900]],                            // quay below the Summer Palace
  ].map((pl) => segsOf(pl));
  const nearHard = (x, z) => { for (const segs of hardLines) for (const g of segs) if (segD2(x, z, g.ax, g.az, g.bx, g.bz) < 6.25) return true; return false; };

  /** bank records: { body, type: 'quay' | 'earth', ax, az, bx, bz, nx, nz (unit, pointing to land) } */
  const banks = [];
  for (const b of bodies) {
    const f = b.ring, n = f.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = f[j], az = f[j + 1], bx = f[i], bz = f[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, s = b.cw ? -1 : 1, nx = -uz * s, nz = ux * s;   // outward normal
      const m = Math.max(1, Math.ceil(len / 10));
      let runStart = 0, runType = null;
      const typeAt = (k) => {
        const t = (k + 0.5) / m, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (bodyAtSlow(px + nx * 1.5, pz + nz * 1.5, b)) return 'open';
        return nearHard(px, pz) ? 'quay' : 'earth';
      };
      for (let k = 0; k <= m; k++) {
        const ty = k < m ? typeAt(k) : null;
        if (ty !== runType) {
          if (runType && runType !== 'open') { const t0 = runStart / m, t1 = k / m; banks.push({ body: b, type: runType, hard: runType === 'quay', ax: ax + (bx - ax) * t0, az: az + (bz - az) * t0, bx: ax + (bx - ax) * t1, bz: az + (bz - az) * t1, nx, nz }); }
          runStart = k; runType = ty;
        }
      }
    }
  }
  for (const b of bodies) eachCellOfRing(b.ring, 0, (c, full) => { if (full) c.inBody = b; else push(c, 'bodies', b); });
  for (const e of banks) eachCellNearSeg(e.ax, e.az, e.bx, e.bz, NEAR + 1, (c) => push(c, 'shore', e));

  let S_d = NEAR, S_edge = null;
  function nearestShore(x, z, list) {
    let best = NEAR * NEAR, be = null;
    for (let k = 0; k < list.length; k++) { const e = list[k], d = segD2(x, z, e.ax, e.az, e.bx, e.bz); if (d < best) { best = d; be = e; } }
    S_d = Math.sqrt(best); S_edge = be;
  }
  const bodyIn = (x, z, c) => {
    if (c.inBody) return c.inBody;
    const l = c.bodies; if (l) for (let k = 0; k < l.length; k++) { const b = l[k]; if (x >= b.bb[0] && x <= b.bb[2] && z >= b.bb[1] && z <= b.bb[3] && pipFlat(x, z, b.ring)) return b; }
    return null;
  };
  // bank profiles: d = distance to the bank line
  const earthLand = (d) => (d <= 6 ? WL + d * 0.2 : WL + 1.2 + (d - 6) / 3);          // wet foreshore 1:5, then a 1:3 scarp
  const earthBed = (d, bed) => Math.max(bed, d <= 6 ? WL - d * 0.2 : WL - 1.2 - (d - 6) * 0.35);
  const quayBed = (d, bed) => Math.max(bed, WL - QUAY_FOOT - d * 0.45);

  // ====================================================================================================
  // causeways across the moats (inner gates from world.json, outer gates derived): brick-walled, flat top,
  // one gap for the timber span
  // ====================================================================================================
  const CW_TOP = world.innerWalls.profile.quay.nabopolassar.top;   // +2.0
  const SPAN = [10, 18];                                           // the timber span: metres from the quay face
  const causeways = [];
  const addCauseway = (name, from, to, width, kind) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]), ux = (to[0] - from[0]) / len, uz = (to[1] - from[1]) / len;
    const at = (s) => [from[0] + ux * s, from[1] + uz * s];
    causeways.push({ id: 'causeway:' + name, gate: name, kind, from: from.slice(), to: to.slice(), width, half: width / 2, length: len, top: CW_TOP, ux, uz, span: { s0: SPAN[0], s1: SPAN[1], from: at(SPAN[0]), to: at(SPAN[1]) }, approach: 16 });
  };
  for (const g of world.innerWalls.gates) if (g.causeway && g.causeway.from) addCauseway(g.name, g.causeway.from, g.causeway.to, g.causeway.width || 10, 'inner');
  {
    const off = world.outerWall.profile.offsetsFromMudWallCentreline;
    for (const g of world.outerWall.gates) { const d = M.azToDir(g.facingDeg); addCauseway(g.name, [g.x + d[0] * off.quay[1], g.z + d[1] * off.quay[1]], [g.x + d[0] * off.waterTo, g.z + d[1] * off.waterTo], 10, 'outer'); }
  }
  for (const cw of causeways) eachCellNearSeg(cw.from[0] - cw.ux * 3, cw.from[1] - cw.uz * 3, cw.to[0] + cw.ux * cw.approach, cw.to[1] + cw.uz * cw.approach, cw.half + 1, (c) => push(c, 'cway', cw));
  let CW_hit = null;
  /** top level if (x, z) is on a causeway (or on its abutment beyond the outer bank), else NaN */
  function causewayTop(x, z, list, mesh) {
    for (let k = 0; k < list.length; k++) {
      const cw = list[k], rx = x - cw.from[0], rz = z - cw.from[1], s = rx * cw.ux + rz * cw.uz, o = Math.abs(rx * cw.uz - rz * cw.ux);
      const half = cw.half - (mesh ? CW_INSET : 0), g = mesh ? STEP_INSET : 0;
      if (o > half || s < -2 || s > cw.length + cw.approach) continue;
      if (s > cw.span.s0 - g && s < cw.span.s1 + g) continue;       // the gap under the timber span
      CW_hit = cw;
      return s <= cw.length ? cw.top - (mesh ? CW_SINK : 0) : -(s - cw.length);   // negative: on the abutment (distance beyond the bank)
    }
    return NaN;
  }

  // ====================================================================================================
  // base field: plain + river levee + city mound + village mounds
  // ====================================================================================================
  const pw = W.street('processionalWay');
  // natural / street levels of the city mound (datum). Platform floors are NOT here: they are platforms below.
  const spots = [
    [0, 60, 2.5], [-55, 310, 3.5], [480, -200, 6.5], [520, -231, 6.0], [440, -300, 5], [403, -690, 12], [560, -740, 7], [700, -775, 3],
    [150, -380, 5], [140, 669, 4.5], [309, 739, 3.5], [900, -600, 2], [1045, 15, 2], [1055, 535, -1], [1300, 600, -1.5],
    [-700, 200, 2], [-1000, 700, 1], [-300, 200, 3], [2000, -500, 0.5], [800, -1800, 1], [146, 913, 1.4],
    // the Processional Way where it runs at grade (south of z = -410) and the west-east street
    ...pw.polyline.map((p, i) => [p[0], p[1], pw.levels[i]]).filter((p, i) => i >= 18),
    // low ground along the Libil-hegalla (R4: canal bank about +2 below the South Palace; lower further east)
    [40, -556, 2.0], [110, -542, 2.0], [180, -528, 2.0], [255, -512, 2.2], [300, -500, 2.6], [420, -478, 3.2], [480, -464, 2.4], [640, -448, 1.5], [820, -436, 1.0], [1000, -411, 0.8], [1180, -391, 0.6],
    // Untere Tempelstrasse (+5.0 before the Ishtar-of-Agade temple, R5) and the lanes around it
    [421.6, -297.5, 5.1], [485.6, -286.3, 5.0], [548.5, -274.1, 5.25], [599.6, -282.9, 5.45], [380, -200, 6.3], [420, -120, 5.6], [560, -120, 5.5], [600, -30, 4.2], [470, 60, 3.4],
    // the ridge between the palace canal and the precinct (Ka-dingirra +4 to +8)
    [250, -400, 6.0], [60, -330, 4.2], [200, -290, 5.2], [280, -330, 6.6],
    // district ground levels (districts[].groundLevelRange) where world.json has no spot
    [300, 600, 3.0], [500, 620, 2.2], [600, 350, 0.9], [800, 500, -0.5], [1100, 350, -0.9], [900, -100, 2.5], [1200, -100, 1.5], [750, 120, 2.2],
    [1000, -700, 1.0], [1200, -600, 0.6], [700, -500, 2.0], [100, 380, 3.2], [250, 330, 3.0], [-500, -300, 1.6], [-900, -200, 1.1], [-600, 700, 1.5], [-1000, 300, 1.2], [-450, 450, 2.0],
    // outer city (0 to +2 north, -1 to +2 east, low and wet in the southern angle)
    [-300, 137, 2.4], [-420, 130, 2.2],        // west bridge head: the street runs flush onto the deck (+2.35)
    [1200, -1600, 1.0], [2200, -300, 0.3], [1900, 100, 0.2], [1500, 950, -0.5], [700, 1150, -0.3], [2400, 800, -0.6], [1900, 900, -0.7],
  ];
  // river levee: the river runs on slightly raised ground (+1.0 at the bank, gone 450 m away)
  const riverCL = world.river.centerline, riverSegs = segsOf(riverCL.map((p) => [p[0], p[1]]));
  const LG = { x0: -1000, z0: -10200, cell: 80, w: 0, h: 0, data: null };
  LG.w = Math.round((3500 - LG.x0) / LG.cell) + 1; LG.h = Math.round((8800 - LG.z0) / LG.cell) + 1; LG.data = new Float32Array(LG.w * LG.h);
  for (let j = 0; j < LG.h; j++) for (let i = 0; i < LG.w; i++) {
    const x = LG.x0 + i * LG.cell, z = LG.z0 + j * LG.cell;
    nearestSeg(x, z, riverSegs);
    const hw = lerp(riverCL[N_seg.i][2], riverCL[N_seg.i + 1][2], N_t) / 2;
    const ends = sstep(-9500, -8700, z) * (1 - sstep(7400, 8100, z));
    LG.data[j * LG.w + i] = 1.0 * (1 - sstep(40, 450, N_d - hw)) * ends;
  }
  const bilin = (G, x, z) => {
    const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell;
    if (fx < 0 || fz < 0 || fx >= G.w - 1 || fz >= G.h - 1) return 0;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = j * G.w + i, d = G.data;
    return d[o] + (d[o + 1] - d[o]) * u + (d[o + G.w] - d[o]) * v + (d[o] - d[o + 1] - d[o + G.w] + d[o + G.w + 1]) * u * v;
  };
  const MG = { x0: -2100, z0: -2600, cell: 20, w: 0, h: 0, data: null };      // mound grid (offset above PLAIN)
  MG.w = Math.round((3300 - MG.x0) / MG.cell) + 1; MG.h = Math.round((1900 - MG.z0) / MG.cell) + 1; MG.data = new Float32Array(MG.w * MG.h);
  {
    // Shepard interpolation with a soft core (70 m) and compact support (700 m); the spot values are relaxed
    // until the field reproduces every spot level, so `spots` reads as "the ground IS at this level here".
    const target = spots.map((p) => p[2] - PLAIN - bilin(LG, p[0], p[1])), val = target.slice();
    const R2 = 70 * 70, RM2 = 700 * 700, w0 = 1 / Math.pow(330 * 330 + R2, 1.5);
    const weight = (d2) => { if (d2 >= RM2) return 0; const q2 = d2 + R2, t = 1 - d2 / RM2; return (t * t) / (q2 * Math.sqrt(q2)); };
    const field = (x, z) => { let sw = w0, sh = 0; for (let k = 0; k < spots.length; k++) { const dx = x - spots[k][0], dz = z - spots[k][1], w = weight(dx * dx + dz * dz); if (w > 0) { sw += w; sh += w * val[k]; } } return sh / sw; };
    for (let it = 0; it < 40; it++) { const f = spots.map((p) => field(p[0], p[1])); for (let k = 0; k < spots.length; k++) val[k] += 0.7 * (target[k] - f[k]); }
    const x1 = MG.x0 + (MG.w - 1) * MG.cell, z1 = MG.z0 + (MG.h - 1) * MG.cell;
    for (let j = 0; j < MG.h; j++) for (let i = 0; i < MG.w; i++) {
      const x = MG.x0 + i * MG.cell, z = MG.z0 + j * MG.cell;
      MG.data[j * MG.w + i] = field(x, z) * sstep(0, 300, Math.min(x - MG.x0, x1 - x, z - MG.z0, z1 - z));
    }
  }
  const cr = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  /** C1 lookup (Catmull-Rom), so that the city mound has no creases along grid lines */
  const bicubic = (G, x, z) => {
    const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell;
    if (fx < 1 || fz < 1 || fx >= G.w - 2 || fz >= G.h - 2) return bilin(G, x, z);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, d = G.data, w = G.w; let o = (j - 1) * w + i - 1;
    const r0 = cr(d[o], d[o + 1], d[o + 2], d[o + 3], u); o += w;
    const r1 = cr(d[o], d[o + 1], d[o + 2], d[o + 3], u); o += w;
    const r2 = cr(d[o], d[o + 1], d[o + 2], d[o + 3], u); o += w;
    return cr(r0, r1, r2, cr(d[o], d[o + 1], d[o + 2], d[o + 3], u), v);
  };
  const villages = world.environs.villages.items.map((v, i) => ({ id: i, x: v.x, z: v.z, houses: v.houses, r: 55 + 2.6 * v.houses }));
  const kilns = world.environs.kilns.items.map((k, i) => ({ id: i, x: k.x, z: k.z, r: 75 }));
  for (const v of villages) { const r = v.r, f = flatRing(M.rectRing(v.x, v.z, 2 * r, 2 * r)); eachCellOfRing(f, 0, (c) => { push(c, 'bumps', v); push(c, 'vil', v); }); }
  const summer = W.monument('summerPalace'), summerRing = flatRing(summer.footprint.polygon), SKIRT = 110;
  const SKIRT_REC = { skirt: true };
  eachCellOfRing(summerRing, SKIRT, (c) => push(c, 'bumps', SKIRT_REC));
  /** smooth base level: no platforms, no walls, no water */
  function base(x, z, c) {
    let h = PLAIN + bicubic(MG, x, z) + bilin(LG, x, z);
    if (c && c.bumps) for (let k = 0; k < c.bumps.length; k++) {
      const b = c.bumps[k];
      if (b.skirt) { if (!pipFlat(x, z, summerRing)) h += 2.2 * (1 - sstep(0, SKIRT, Math.sqrt(ringD2(x, z, summerRing)))); }
      else h += 0.6 * (1 - sstep(0.45 * b.r, b.r, Math.hypot(x - b.x, z - b.z)));
    }
    return h;
  }

  // ====================================================================================================
  // platforms: flat, sharp-edged floors and made terraces. First match wins.
  //   wall: 'own'  the platform's own wall stands INSIDE its outline (monument footprints)
  //         'high' a retaining wall holds the HIGHER side of each edge (terraces inside a monument, strips)
  // ====================================================================================================
  const platforms = [];
  const addPlatform = (id, ring, level, opts = {}) => {
    const f = flatRing(ring), cw = M.polygonArea(M.openRing(ring)) > 0;
    const p = { id, ring: f, polygon: M.closeRing(ring), bb: bbFlat(f), level, wall: opts.wall || 'own', sink: opts.sink ?? 0.15, owner: opts.owner || null, note: opts.note || '', cw, terrace: !!opts.terrace };
    platforms.push(p);
    return p;
  };
  const quadStrip = (a0, a1, b0, b1, k0, k1) => { const L = (p, r, k) => [lerp(p[0], r[0], k), lerp(p[1], r[1], k)]; return [L(a0, b0, k0), L(a1, b1, k0), L(a1, b1, k1), L(a0, b0, k1)]; };
  const gardenTerraces = [];
  {
    const np = W.monument('northPalace'), d = np.dims, gt = d.gardenTerraces_CONJECTURAL, lv = gt.levels;   // [15, 13, 11, 8, 4, 0]
    // royal garden, north slope: six treads from the main building (+15) down to the canal quay (0)
    const ns = gt.northSlope, nsL = lv;
    for (let k = 0; k < nsL.length; k++) { const ring = quadStrip(ns[3], ns[2], ns[0], ns[1], k / nsL.length, (k + 1) / nsL.length); addPlatform('northPalace:garden:north:' + k, ring, nsL[k], { wall: 'high', sink: 0, owner: 'palaces' }); gardenTerraces.push({ id: 'north:' + k, level: nsL[k], ring: M.closeRing(ring) }); }
    // west flank: five treads from the main building (+15) westward down to +4
    const wf = gt.westFlank, wfL = lv.slice(0, 5);
    for (let k = 0; k < wfL.length; k++) { const ring = quadStrip(wf[1], wf[2], wf[0], wf[3], k / wfL.length, (k + 1) / wfL.length); addPlatform('northPalace:garden:west:' + k, ring, wfL[k], { wall: 'high', sink: 0, owner: 'palaces' }); gardenTerraces.push({ id: 'west:' + k, level: wfL[k], ring: M.closeRing(ring) }); }
    addPlatform('northPalace:main', d.mainBuilding.polygon, d.terraceLevel, { wall: 'high', owner: 'palaces' });
    // canal corridor: quay at 0 on both sides of the 13 m canal (3 m south, 6.5 m north up to the terrace north wall)
    const cn = W.canal(d.canalId), A = cn.polyline[0], B = cn.polyline[1], l = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / l, (B[1] - A[1]) / l], r = M.rightOf(u[0], u[1]);
    const A2 = [A[0] - u[0] * 20, A[1] - u[1] * 20], B2 = [B[0] + u[0] * 12, B[1] + u[1] * 12], hs = cn.width / 2 + 3, hn = cn.width / 2 + 6.5;
    addPlatform('northPalace:canalQuay', [[A2[0] + r[0] * hs, A2[1] + r[1] * hs], [B2[0] + r[0] * hs, B2[1] + r[1] * hs], [B2[0] - r[0] * hn, B2[1] - r[1] * hn], [A2[0] - r[0] * hn, A2[1] - r[1] * hn]], cn.embankmentTop ?? 0, { wall: 'high', sink: 0, owner: 'palaces' });
    // North Fortification: the strip between the terrace north wall and the final (limestone-footed) north wall
    const tw = d.mainTerraceNorthWall.line, fp = np.footprint.polygon;
    addPlatform('northPalace:northFortification', [tw[0], tw[1], [345.5, -921], fp[2], fp[1]], 4.0, { wall: 'high', owner: 'palaces', note: 'model value' });
    addPlatform('northPalace', fp, d.lowerTerraceLevel, { owner: 'palaces' });
  }
  {
    const sp = W.monument('southPalace'), d = sp.dims, fp = sp.footprint.polygon;
    const gs = d.gardenStripWest.polygon;      // its east side is drawn 2 m short of the palace wall: close the gap
    addPlatform('southPalace:gardenStripWest', [gs[0], gs[1], fp[0], fp[3]], d.gardenStripWest.level, { wall: 'high', sink: 0, owner: 'palaces', terrace: true });
    addPlatform('southPalace', fp, d.floorLevel, { owner: 'palaces' });
    // the lane between the palace north wall and the city wall (palace floor level, SPEC 3.4)
    const il = world.innerWalls.east.innerLine;
    addPlatform('palaceQuarter:northLane', [fp[0], fp[1], [335, -703.5], [335, il[1][1] + 0.3], il[0]], d.floorLevel, { wall: 'high', sink: 0, owner: 'walls', terrace: true });
    // the strip between the city wall's quay line and the North Palace (berm level of the raised stretch)
    const ql = world.innerWalls.east.quayLine, nfp = W.monument('northPalace').footprint.polygon;
    // (its east end stops at the forecourt of the Ishtar Gate, which is flat across its 32 m at street level: SPEC 3.6)
    const ig = W.monument('ishtarGate').dims, fcHalf = ig.forecourt.size[0] / 2 + 0.3, fcN = ig.axis.north[1] - ig.forecourt.size[1] - 0.3, fcX = ig.axis.north[0] - fcHalf;
    addPlatform('palaceQuarter:northStrip', [ql[0], [fcX, ql[1][1] + 0.2], [fcX, fcN], [336, fcN], nfp[5], nfp[0], [30.5, -775.6]], world.innerWalls.east.raisedSection.outside.bermLevelAtGate + 0.5, { wall: 'high', sink: 0, owner: 'walls', terrace: true });
    // dry quay terrace between the West Fortification ditch and the 575 quay line (world.json canals[westFortCanal].dryStripEast)
    const wc = W.canal('westFortCanal'), a = wc.polyline[0], b = wc.polyline[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), r = M.rightOf((b[0] - a[0]) / l, (b[1] - a[1]) / l), hw = wc.width / 2;
    addPlatform('palaceQuarter:dryStrip', [[a[0] + r[0] * hw - 0.4, a[1] + r[1] * hw + 1.6], [b[0] + r[0] * hw, b[1] + r[1] * hw], ql[0], q[2].polyline[0], q[2].polyline[1]], wc.dryStripEast.level, { wall: 'high', sink: 0, owner: 'palaces', terrace: true });
  }
  addPlatform('ishtarGate', W.footprint('ishtarGate'), W.monument('ishtarGate').dims.pavementLevel, { owner: 'ishtar' });
  addPlatform('eastFortification', W.footprint('eastFortification'), W.monument('eastFortification').dims.floorLevel, { owner: 'palaces' });
  addPlatform('westFortification', W.footprint('westFortification'), 4.0, { owner: 'palaces', note: 'fill level under the block; model value' });
  {
    const ia = W.monument('ishtarAgadeTemple');
    for (const m of world.monuments) {
      if (['northPalace', 'southPalace', 'ishtarGate', 'eastFortification', 'westFortification', 'etemenanki', 'etemenankiPrecinct'].includes(m.id)) continue;
      const lv = monumentLevels(m), c = m.footprint.center;
      const level = lv.floor !== null ? lv.floor : Math.round((base(c[0], c[1], lookup(c[0], c[1])) + 0.3) * 10) / 10;
      addPlatform(m.id, m.footprint.polygon, level, { owner: m.id === 'summerPalace' ? 'palaces' : 'temples', note: lv.floor === null ? 'no floor level in world.json: local ground + 0.3' : '' });
    }
    addPlatform('ishtarAgadeTemple:forecourt', ia.dims.forecourt.polygon, ia.dims.forecourt.level, { wall: 'high', sink: 0, owner: 'temples' });
  }
  const precinct = W.monument('etemenankiPrecinct');
  addPlatform('etemenankiPrecinct', precinct.footprint.polygon, precinct.dims.courtLevel, { owner: 'etemenanki' });
  for (const p of platforms) eachCellOfRing(p.ring, 0, (c) => push(c, 'plats', p));
  let P_hit = null;
  const platformIn = (x, z, list) => {
    for (let k = 0; k < list.length; k++) { const p = list[k]; if (x >= p.bb[0] && x <= p.bb[2] && z >= p.bb[1] && z <= p.bb[3] && pipFlat(x, z, p.ring)) return p; }
    return null;
  };
  // nearest point of a platform outline, with the outward normal: scratch E_d, E_x, E_z, E_nx, E_nz
  let E_d = 0, E_x = 0, E_z = 0, E_nx = 0, E_nz = 0;
  function nearestEdge(x, z, p) {
    const f = p.ring, n = f.length; let best = Infinity;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = f[j], az = f[j + 1], dx = f[i] - ax, dz = f[i + 1] - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, pz = az + dz * t, d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < best) { best = d; E_x = px; E_z = pz; const l = Math.sqrt(l2) || 1, s = p.cw ? -1 : 1; E_nx = (-dz / l) * s; E_nz = (dx / l) * s; }
    }
    E_d = Math.sqrt(best);
  }

  // ====================================================================================================
  // wall zones
  // ====================================================================================================
  const iw = world.innerWalls, prof = iw.profile, ow = world.outerWall, OFF = prof.offsetsFromImgurEnlilCentreline;
  const wallSegs = [];
  for (const side of ['east', 'west']) {
    const enc = side === 'east' ? 'innerEast' : 'innerWest';
    for (const g of segsOf(iw[side].innerLine)) {
      const mx = (g.ax + g.bx) / 2, mz = (g.az + g.bz) / 2;
      g.side = side; g.out = W.enclosureAt(mx - g.uz * 20, mz + g.ux * 20) === enc ? -1 : 1;   // +1: outside is to the right of travel
      wallSegs.push(g);
    }
  }
  regSegs(wallSegs, 62, 'wall');
  const owSegs = segsOf(ow.line), OW = ow.profile.offsetsFromMudWallCentreline;
  for (const g of owSegs) { const mx = (g.ax + g.bx) / 2, mz = (g.az + g.bz) / 2; g.out = M.pointInPolygon(mx - g.uz * 60, mz + g.ux * 60, world.enclosures.outerCity) ? -1 : 1; }
  regSegs(owSegs, 30, 'owall');
  const STD = { berm: prof.berm.level };
  /** offset from the Imgur-Enlil centreline (+ outward) of the nearest inner wall; sets WZ_berm. Returns NaN if none is near */
  let WZ_berm = 1.5, WZ_side = 'east';
  function wallOffset(x, z, list) {
    const g = nearestSeg(x, z, list); if (!g) return NaN;
    WZ_side = g.side;
    WZ_berm = g.side === 'east' && g.i <= 1 ? W.innerWallLevels('east', x, z).berm : STD.berm;
    return N_d * N_side * g.out;
  }
  function wallZone(x, z, list, h) {
    const o = wallOffset(x, z, list);
    if (!(o > -OFF.mainWall[1])) return h;
    const b = WZ_berm;
    let zl = o < OFF.frontWall[1] ? b - 0.5 : o < OFF.bermTo ? b - 0.5 + (o - OFF.frontWall[1]) / (OFF.bermTo - OFF.frontWall[1]) : b + 0.5;
    if (o > OFF.quay[1]) zl = lerp(zl, h, sstep(OFF.quay[1], 60, o));
    return lerp(h, zl, sstep(-OFF.mainWall[1], OFF.mainWall[1], o));
  }

  // ====================================================================================================
  // corridors: streets with a level profile, and road embankments
  // ====================================================================================================
  const corridors = [];
  {
    // Processional Way: flat across the roadway and its shoulders, 1:2.5 beyond. West of the street the made
    // terrace runs flat to the South Palace wall between the gate and the palace's south-east corner.
    // In front of the gate the forecourt is flat across its 32 m (SPEC 3.6).
    const segs = segsOf(pw.polyline), ch = M.chainage(pw.polyline), sA = ch[9], sB = ch[15], sF = ch[7], sG = ch[8], sN = ch[2];
    const c = { id: 'processionalWay', segs, levels: pw.levels, slope: 0.4,
      // Between the bastions and the south face of the gate the made ground is held by masonry (bastions, the
      // forecourt's flanks, wing walls, the gate): its edge is a sharp step down to the berm, not an earth slope.
      slopeAt: (s) => 0.4 + 40 * sstep(sF - 18, sF - 12, s) * (1 - sstep(sA, sA + 6, s)),
      flat: (s, side, i) => {
        const w = lerp(pw.widths[i], pw.widths[i + 1], N_t); let hw = Math.max(w / 2 + 4.75, 10);
        // the walled lion street: level from wall to wall (21.5 m) and on under the two street walls, whose
        // footprints (North Palace, East Fortification) take over 11 to 12 m from the axis
        hw += 3 * sstep(sN - 6, sN + 2, s) * (1 - sstep(sF, sF + 8, s));
        hw += 6 * sstep(sF - 4, sF + 6, s) * (1 - sstep(sG + 2, sG + 14, s));
        if (side > 0) hw += 18 * sstep(sA - 14, sA - 8, s) * (1 - sstep(sB - 6, sB + 18, s));
        return hw;
      } };
    corridors.push(c); regSegs(segs, 60, 'corr'); for (const g of segs) g.tag = c;
  }
  {
    const ut = world.merkesStreets.streets.find((s) => /Untere Tempelstrasse/.test(s.name));
    // the levels of the layout's street record 'merkes0' (js/core/layout.js: 7.2, 5.0, 5.0, 5.2, 5.3, 5.4 at these six
    // vertices): the two must agree, or the terrain shows through the street paving in the flight into shot 7
    const lv = [M.valueAlong(pw.levels, M.nearestOnPolyline(ut.polyline[0][0], ut.polyline[0][1], pw.polyline)), 5.0, 5.0, 5.2, 5.3, 5.4];
    const segs = segsOf(ut.polyline), c = { id: 'merkes:' + ut.name, segs, levels: lv, slope: 0.22, flat: () => ut.width / 2 + 1.5 };
    corridors.push(c); regSegs(segs, 24, 'corr'); for (const g of segs) g.tag = c;
  }
  function applyCorridors(x, z, list, h) {
    // the nearest segment of EACH corridor that is registered in this cell
    for (let ci = 0; ci < corridors.length; ci++) {
      const c = corridors[ci]; let best = Infinity, bs = null, bt = 0;
      for (let k = 0; k < list.length; k++) {
        const g = list[k]; if (g.tag !== c) continue;
        let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, d = px * px + pz * pz;
        if (d < best) { best = d; bs = g; bt = t; }
      }
      if (!bs) continue;
      const d = Math.sqrt(best), px = bs.ax + (bs.bx - bs.ax) * bt, pz = bs.az + (bs.bz - bs.az) * bt, side = bs.ux * (z - pz) - bs.uz * (x - px) >= 0 ? 1 : -1;
      N_t = bt;
      const sc = bs.s0 + bs.len * bt, L = lerp(c.levels[bs.i], c.levels[bs.i + 1], bt), k = Math.max(0, d - c.flat(sc, side, bs.i)) * (c.slopeAt ? c.slopeAt(sc) : c.slope);
      if (h > L + k) h = L + k; else if (h < L - k) h = L - k;
    }
    return h;
  }
  // roads on low embankments (+0.7): the six country roads and the north road
  const roads = [...world.streets.filter((s) => s.class === 'road').map((s) => ({ id: s.id, name: s.name, polyline: s.polyline, width: s.width })),
    ...(world.environs.roads || []).map((r) => ({ id: 'road:' + r.name, name: r.name, polyline: r.polyline, width: r.width }))];
  const ROAD_H = 0.7;
  for (const r of roads) { r.segs = segsOf(r.polyline, r); r.half = r.width / 2 + 1; regSegs(r.segs.filter((g) => Math.hypot((g.ax + g.bx) / 2 - DETAIL_C[0], (g.az + g.bz) / 2 - DETAIL_C[1]) < DETAIL_R1 + g.len), r.half + 4, 'roads'); }
  function roadBump(x, z, list) {
    nearestSeg(x, z, list);
    return ROAD_H * (1 - sstep(N_seg.tag.half, N_seg.tag.half + 3, N_d)) * detailFade(x, z);
  }

  // ====================================================================================================
  // canals: cut below the water plane (channel) with banks; levees outside the walls
  // ====================================================================================================
  const canals = [];
  {
    const toWater = (pl) => {       // start a canal ON the water it takes off from
      const p = pl[0]; if (bodyAtSlow(p[0], p[1])) return pl;
      let best = 150 * 150, bp = null;
      for (const e of banks) { const dx = e.bx - e.ax, dz = e.bz - e.az, l2 = dx * dx + dz * dz, t = clamp01(((p[0] - e.ax) * dx + (p[1] - e.az) * dz) / l2), px = e.ax + dx * t, pz = e.az + dz * t, d = (px - p[0]) ** 2 + (pz - p[1]) ** 2; if (d < best) { best = d; bp = [px - e.nx * 4, pz - e.nz * 4]; } }
      return bp ? [bp, ...pl] : pl;
    };
    for (const cn of world.canals) {
      const outer = cn.levee !== undefined;
      const pl = outer ? toWater(cn.polyline) : cn.id === 'northPalaceCanal' ? [[cn.polyline[0][0] - 19, cn.polyline[0][1] - 5.3], cn.polyline[1]] : cn.polyline;
      const segs = segsOf(pl), ch = M.chainage(pl), total = ch[ch.length - 1];
      const c = { id: cn.id, name: cn.name, polyline: pl, width: cn.width, waterLevel: WL, bed: WL - (outer ? 1.8 : 1.5), lined: !outer, levee: cn.levee || 0, slope: outer ? 0.5 : 0.67, segs, total, culverts: [], half: () => cn.width / 2, order: 1 };
      if (cn.id === 'libilHegalla') {
        const sPW = M.nearestOnPolyline(cn.crossingAtPW.point[0], cn.crossingAtPW.point[1], pl).s, sWall = M.nearestOnPolyline(1372, -381, pl).s;
        c.half = (s) => (s < sPW ? cn.width / 2 : cn.widthEastOfPW / 2);
        c.linedAt = (s) => s < sPW;
        c.culverts.push([sPW - 12, sPW + 12, 'under the Processional Way'], [sWall, total + 1, 'under the city wall and berm']);
        c.sPW = sPW;
      }
      if (cn.waterGate) { const s = M.nearestOnPolyline(cn.waterGate[0], cn.waterGate[1], pl).s; c.culverts.push([s - 6, s + OW.quay[1] + 1, 'water gate in the outer wall']); }
      c.extra = cn.id === 'westFortCanal' ? 1.6 : 0;         // the sliver between the ditch and the fortification face
      for (const g of segs) g.tag = c;
      canals.push(c);
      regSegs(outer ? segs.filter((g) => Math.hypot((g.ax + g.bx) / 2 - DETAIL_C[0], (g.az + g.bz) / 2 - DETAIL_C[1]) < DETAIL_R1 + g.len) : segs, outer ? 40 : cn.width / 2 + 18, 'canal');
    }
  }
  const inCulvert = (c, s) => { for (const r of c.culverts) if (s >= r[0] && s <= r[1]) return true; return false; };
  let CN_hit = null, CN_s = 0;
  /** bed level if (x, z) is in a canal channel, else NaN */
  function canalBed(x, z, list, mesh, inset) {
    for (let k = 0; k < list.length; k++) {
      const g = list[k], c = g.tag;
      let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len;
      if (t < 0 || t > 1) { if (g.i > 0 && t < 0 && t > -0.5 / g.len * c.width) t = 0; else if (t > 1 && g.s0 + g.len < c.total - 0.01 && t < 1 + 0.5 / g.len * c.width) t = 1; else continue; }
      const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, d = Math.sqrt(px * px + pz * pz), s = g.s0 + g.len * t;
      const lined = c.linedAt ? c.linedAt(s) : c.lined;
      let half = c.half(s) + (lined && mesh ? inset : 0);
      if (c.extra && g.ux * -pz - g.uz * -px < 0) half += c.extra;
      if (d > half || inCulvert(c, s)) continue;
      CN_hit = c; CN_s = s;
      if (lined) return c.bed;
      const f = detailFade(x, z);
      const full = Math.max(c.bed, WL - (half - d) * 0.6);
      return f >= 1 ? full : lerp(landOnly(x, z), full, f);     // a far canal fades out: its bed rises to the plain
    }
    return NaN;
  }
  /** banks and levees of earth canals: modifies a land level */
  function canalBanks(x, z, list, h) {
    let best = Infinity, bg = null, bt = 0;
    for (let k = 0; k < list.length; k++) {
      const g = list[k]; if (g.tag.lined && !g.tag.linedAt) continue;
      let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, d = px * px + pz * pz;
      if (d < best) { best = d; bg = g; bt = t; }
    }
    if (!bg) return h;
    const c = bg.tag, s = bg.s0 + bg.len * bt, d = Math.sqrt(best);
    if ((c.linedAt && c.linedAt(s)) || inCulvert(c, s)) return h;
    const half = c.half(s), f = detailFade(x, z); if (f <= 0) return h;
    let t = h;
    if (c.levee > 0) {
      const d1 = half + (h - WL) / c.slope + 2.5, e = d - d1, up = 2.5 * c.levee, crest = 3, down = 3 * c.levee;
      const k = e <= 0 ? 0 : e < up ? e / up : e < up + crest ? 1 : e < up + crest + down ? 1 - (e - up - crest) / down : 0;
      t = h + c.levee * k;
    }
    const bank = WL + (d - half) * c.slope;
    return lerp(h, Math.min(t, bank), f);
  }

  // ====================================================================================================
  // height
  // ====================================================================================================
  /** land level: platforms, base, wall zones, corridors, roads (no water, no canal cuts, no causeways) */
  function land(x, z, c, mesh, pInset) {
    if (!c) return base(x, z, null);
    if (c.plats) {
      const p = platformIn(x, z, c.plats);
      if (p) {
        P_hit = p;
        if (mesh) {
          nearestEdge(x, z, p);
          if (E_d < pInset) {
            // the level just outside the outline: a monument's own wall hides the step whichever side is
            // higher; a terrace retaining wall stands on the higher side only. A RAISED platform keeps the
            // outside level for pInset metres (terrain.js: 0.3 m + 1.5 leaf sizes, so that the ragged rise of the
            // mesh begins inside the outline); a sunken one for stepInset only (its own wall is all that hides it).
            const o = H(E_x + E_nx * 0.06, E_z + E_nz * 0.06, false, 0, 0);
            if (Math.abs(o - p.level) > 0.01 && (p.wall === 'own' || o < p.level) && (o < p.level || E_d < STEP_INSET)) return o;
          }
          return p.level - p.sink;
        }
        return p.level;
      }
    }
    let h = base(x, z, c);
    if (c.owall) { nearestSeg(x, z, c.owall); const o = N_d * N_side * N_seg.out; if (o > -5 && o < OW.quay[1] + 0.5 && h < 1.2) h = lerp(h, 1.2, sstep(-5, -3, o)); }
    if (c.wall) h = wallZone(x, z, c.wall, h);
    if (c.roads) h += roadBump(x, z, c.roads);
    if (c.corr) h = applyCorridors(x, z, c.corr, h);
    return h;
  }
  const landOnly = (x, z) => land(x, z, lookup(x, z), false, 0);
  function H(x, z, mesh, inset, pInset) {
    const c = lookup(x, z);
    if (!c) return base(x, z, null);
    if (c.cway) { const t = causewayTop(x, z, c.cway, mesh); if (t === t) { if (t >= 0) return t; const l = land(x, z, c, mesh, pInset); return lerp(CW_hit.top, l, sstep(0, CW_hit.approach, -t)); } }
    let sd = NEAR, edge = null;
    if (c.shore) { nearestShore(x, z, c.shore); sd = S_d; edge = S_edge; }
    const body = bodyIn(x, z, c);
    if (body) return edge && edge.hard ? quayBed(sd, body.bed) : earthBed(sd, body.bed);
    if (mesh && edge && edge.hard && sd < inset) return WL - QUAY_FOOT;
    if (c.canal) { const b = canalBed(x, z, c.canal, mesh, inset); if (b === b) return b; }
    let h = land(x, z, c, mesh, pInset);
    if (c.canal) h = canalBanks(x, z, c.canal, h);
    if (edge && !edge.hard) { const e = earthLand(sd); if (e < h) h = e; }
    return h;
  }
  const height = (x, z) => H(x, z, false, 0, 0);
  /**
   * What the terrain mesh samples. `inset` (default stepInset = 1.2 m) is how far behind a brick quay or the
   * side of a brick-lined canal the ground is still at bed level: terrain.js passes 1.5 x the size of the
   * largest leaf at the vertex, so that no triangle can carry earth in front of a quay line, and covers the
   * trench with an exact apron (hardEdges).
   */
  const meshHeight = (x, z, inset, platformInset) => H(x, z, true, inset > 0 ? inset : STEP_INSET, platformInset > STEP_INSET ? platformInset : STEP_INSET);
  /** true within `r` metres of the edge of a platform whose floor lies `minDrop` metres or more above or below the ground outside it */
  function nearStep(x, z, r, minDrop = 2.5) {
    const c = lookup(x, z); if (!c || !c.plats) return false;
    for (let k = 0; k < c.plats.length; k++) {
      const p = c.plats[k];
      if (x < p.bb[0] - r || x > p.bb[2] + r || z < p.bb[1] - r || z > p.bb[3] + r) continue;
      nearestEdge(x, z, p); if (E_d >= r) continue;
      const ex = E_x, ez = E_z, nx = E_nx, nz = E_nz;
      if (Math.abs(H(ex + nx * 0.06, ez + nz * 0.06, false, 0, 0) - H(ex - nx * 0.06, ez - nz * 0.06, false, 0, 0)) >= minDrop) return true;
    }
    return false;
  }
  /** true within `r` metres (at most 45) of a brick quay or of a brick-lined canal: where meshHeight depends on `inset` */
  function nearHardEdge(x, z, r) {
    const c = lookup(x, z); if (!c) return false;
    if (c.shore) { nearestShore(x, z, c.shore); if (S_edge && S_edge.hard && S_d < r) return true; }
    if (c.canal) for (let k = 0; k < c.canal.length; k++) {
      const g = c.canal[k], cn = g.tag; if (!cn.lined) continue;
      let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, s2 = g.s0 + g.len * t;
      if (cn.linedAt && !cn.linedAt(s2)) continue;
      if (Math.sqrt(px * px + pz * pz) < cn.half(s2) + cn.extra + r) return true;
    }
    return false;
  }
  function landHeight(x, z) {
    const c = lookup(x, z);
    if (c && c.cway) { const t = causewayTop(x, z, c.cway, false); if (t >= 0) return t; }
    let h = land(x, z, c, false, 0);
    if (c && c.canal) { const hb = canalBanks(x, z, c.canal, h); if (hb > h) h = hb; }   // levees are land
    return h;
  }
  function isWater(x, z) {
    const c = lookup(x, z); if (!c) return false;
    if (c.cway && causewayTop(x, z, c.cway, false) >= 0) return false;
    if (bodyIn(x, z, c)) return true;
    if (c.canal) { const b = canalBed(x, z, c.canal, false, 0); return b === b && b < WL; }
    return false;
  }
  function shoreDistance(x, z) { const c = lookup(x, z); if (!c || !c.shore) return NEAR; nearestShore(x, z, c.shore); return S_d; }
  /** The bank nearest to a point: { type: 'quay' | 'earth', dist, body, normal: [nx, nz] (to land), point: [x, z] } or null beyond 45 m. */
  function bankAt(x, z) {
    const c = lookup(x, z); if (!c || !c.shore) return null;
    nearestShore(x, z, c.shore); if (!S_edge) return null;
    const e = S_edge, dx = e.bx - e.ax, dz = e.bz - e.az, t = clamp01(((x - e.ax) * dx + (z - e.az) * dz) / (dx * dx + dz * dz));
    return { type: e.type, dist: S_d, body: e.body.id, normal: [e.nx, e.nz], point: [e.ax + dx * t, e.az + dz * t] };
  }

  // ====================================================================================================
  // hard edges: the lines along which the ground steps straight down into water behind brickwork (quay banks
  // of river and moats, both sides of the brick-lined canals). terrain.js draws an exact curtain and apron there.
  // ====================================================================================================
  const hardEdges = [];
  for (const b of bodies) {
    const chains = []; let cur = null;
    for (const e of banks) {
      if (e.body !== b) continue;
      if (!e.hard) { cur = null; continue; }
      if (cur && Math.hypot(cur.last[0] - e.ax, cur.last[1] - e.az) < 0.05) cur.pts.push([e.bx, e.bz]);
      else { cur = { pts: [[e.ax, e.az], [e.bx, e.bz]], land: e.nx * -(e.bz - e.az) + e.nz * (e.bx - e.ax) >= 0 ? 1 : -1 }; chains.push(cur); }
      cur.last = [e.bx, e.bz];
    }
    if (chains.length > 1) { const a = chains[0], l = chains[chains.length - 1]; if (Math.hypot(l.last[0] - a.pts[0][0], l.last[1] - a.pts[0][1]) < 0.05) { l.pts.push(...a.pts.slice(1)); chains.shift(); } }
    chains.forEach((ch, i) => hardEdges.push({ id: 'quay:' + b.id + ':' + i, kind: 'quay', body: b.id, polyline: ch.pts, land: ch.land, foot: WL - QUAY_FOOT }));
  }
  for (const c of canals) {
    if (!c.lined) continue;
    const ch = M.chainage(c.polyline), ranges = [];
    // the stretches that are an open, brick-lined channel: between culverts, and only where lined
    const cuts = [0, c.total]; for (const r of c.culverts) cuts.push(Math.max(0, r[0]), Math.min(c.total, r[1])); if (c.sPW !== undefined) cuts.push(c.sPW);
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) { const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2; if (b - a > 1 && !inCulvert(c, m) && (!c.linedAt || c.linedAt(m))) ranges.push([a, b]); }
    for (const [a, b] of ranges) for (const side of [1, -1]) {
      const stations = [a + 0.05, ...ch.filter((v) => v > a + 0.5 && v < b - 0.5), b - 0.05], pts = [];
      for (const st of stations) {
        const q2 = M.pointAlong(c.polyline, st), r = M.rightOf(q2.dir[0], q2.dir[1]);
        let lo = 0, hi = c.half(st) + 4;      // the channel edge on this side (the West Fortification ditch is wider on one side)
        for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2, x = q2.x + r[0] * side * m, z = q2.z + r[1] * side * m, cc = lookup(x, z), v = cc && cc.canal ? canalBed(x, z, cc.canal, false, 0) : NaN; if (v === v) lo = m; else hi = m; }
        pts.push([q2.x + r[0] * side * lo, q2.z + r[1] * side * lo]);
      }
      hardEdges.push({ id: 'canal:' + c.id + ':' + (side > 0 ? 'right' : 'left') + ':' + Math.round(a), kind: 'canal', body: c.id, polyline: pts, land: side, foot: c.bed });
    }
  }

  // ====================================================================================================
  // zones
  // ====================================================================================================
  const monuments = world.monuments.map((m) => ({ id: m.id, ring: flatRing(m.footprint.polygon), area: Math.abs(M.polygonArea(m.footprint.polygon)) })).sort((a, b) => a.area - b.area);
  for (const m of monuments) { m.bb = bbFlat(m.ring); eachCellOfRing(m.ring, 0, (c) => push(c, 'mons', m)); }
  for (const c of cells.values()) if (c.mons) c.mons.sort((a, b) => a.area - b.area);
  // wall bodies and street lines: { segs, half, code, id }
  const lineFeatures = [];
  const addLine = (pl, half, code, id, halfs) => { const f = { code, id, half, halfs: halfs || null }; f.segs = segsOf(pl, f); lineFeatures.push(f); regSegs(f.segs, halfs ? Math.max(...halfs) : half, code === ZONE.WALL ? 'wbody' : 'lines'); return f; };
  addLine(iw.east.innerLine, prof.imgurEnlil.thickness / 2 + 0.5, ZONE.WALL, 'imgurEnlil:east');
  addLine(iw.east.outerLine, prof.nemettiEnlil.thickness / 2 + 0.5, ZONE.WALL, 'nemettiEnlil:east');
  addLine(iw.west.innerLine, prof.imgurEnlil.thickness / 2 + 0.5, ZONE.WALL, 'imgurEnlil:west');
  addLine(iw.west.outerLine, prof.nemettiEnlil.thickness / 2 + 0.5, ZONE.WALL, 'nemettiEnlil:west');
  addLine(ow.line, ow.profile.mudWall.thickness / 2 + 0.5, ZONE.WALL, 'outerWall');
  for (const s of world.streets) addLine(s.polyline, (s.width || 8) / 2, ZONE.STREET, s.id, s.widths ? s.widths.map((w) => w / 2) : null);
  for (const s of world.merkesStreets.streets) addLine(s.polyline, (s.width || 4) / 2, ZONE.STREET, 'merkes:' + s.name);
  for (const r of world.environs.roads || []) addLine(r.polyline, (r.width || 8) / 2, ZONE.STREET, 'road:' + r.name);
  function lineAt(x, z, list) {
    for (let k = 0; k < list.length; k++) {
      const g = list[k], f = g.tag;
      let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, half = f.halfs ? lerp(f.halfs[g.i], f.halfs[g.i + 1], t) : f.half;
      if (px * px + pz * pz <= half * half) return f;
    }
    return null;
  }
  const encl = Object.entries(world.enclosures).filter(([, v]) => Array.isArray(v)).map(([name, ring]) => ({ name, ring: flatRing(ring), inner: name !== 'outerCity' }));
  for (const e of encl) e.bb = bbFlat(e.ring);
  const enclosureAt = (x, z) => { let hit = null; for (const e of encl) { if (x < e.bb[0] || x > e.bb[2] || z < e.bb[1] || z > e.bb[3] || !pipFlat(x, z, e.ring)) continue; if (e.inner) return e.name; hit = e.name; } return hit; };
  const districts = world.districts.map((d, i) => ({ name: d.name, index: i, kind: d.kind, ring: flatRing(d.polygon) }));
  for (const d of districts) d.bb = bbFlat(d.ring);
  const districtAt = (x, z) => { for (const d of districts) if (x >= d.bb[0] && x <= d.bb[2] && z >= d.bb[1] && z <= d.bb[3] && pipFlat(x, z, d.ring)) return d; return null; };
  const fieldZones = world.environs.fieldZones.map((f) => ({ name: f.name, ring: flatRing(f.polygon), mix: f.mix }));
  const STEPPE_R = 7500;
  /** the edge of the irrigated land is not a circle: the steppe begins 6.6 to 8.4 km out, by a smooth noise */
  const steppeAt = (x, z) => Math.hypot(x - DETAIL_C[0], z - DETAIL_C[1]) + 1800 * (noise2(x, z, 2600, 21) - 0.5) + 500 * (noise2(x, z, 700, 22) - 0.5) > STEPPE_R;
  // The palace quarter: the convex hull of the two palaces, the two fortifications and the gate. Whatever is
  // inside it and is neither water, monument, wall nor street is made ground between walls (lane, berm, quay
  // terrace): defence zone, never a field or a garden of the outer city.
  const PQ = (() => {
    const pts = [];
    for (const id of ['westFortification', 'northPalace', 'eastFortification', 'southPalace', 'ishtarGate']) for (const q2 of M.openRing(W.footprint(id))) pts.push(q2);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q2 of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q2) <= 0) lo.pop(); lo.push(q2); }
    for (let i = pts.length - 1; i >= 0; i--) { const q2 = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q2) <= 0) up.pop(); up.push(q2); }
    const ring = lo.slice(0, -1).concat(up.slice(0, -1)), f = flatRing(ring);
    return { ring: M.closeRing(ring), f, bb: bbFlat(f) };
  })();
  const inPalaceQuarter = (x, z) => x >= PQ.bb[0] && x <= PQ.bb[2] && z >= PQ.bb[1] && z <= PQ.bb[3] && pipFlat(x, z, PQ.f);
  /** on the made corridor of the Processional Way north of the Ishtar Gate (the lion street and the causeway beyond the North Gate) */
  function onLionStreet(x, z, list) {
    const c = corridors[0]; let best = Infinity, bs = null, bt = 0;
    for (let k = 0; k < list.length; k++) {
      const g = list[k]; if (g.tag !== c || g.i > 7) continue;
      let t = ((x - g.ax) * g.ux + (z - g.az) * g.uz) / g.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = g.ax + (g.bx - g.ax) * t - x, pz = g.az + (g.bz - g.az) * t - z, d = px * px + pz * pz;
      if (d < best) { best = d; bs = g; bt = t; }
    }
    if (!bs || (bs.i === 0 && bt <= 0) || (bs.i === 7 && bt >= 1)) return false;
    const px = bs.ax + (bs.bx - bs.ax) * bt, pz = bs.az + (bs.bz - bs.az) * bt, side = bs.ux * (z - pz) - bs.uz * (x - px) >= 0 ? 1 : -1;
    N_t = bt;
    return Math.sqrt(best) <= c.flat(bs.s0 + bs.len * bt, side, bs.i) + 0.75;
  }

  // scratch of the last classification
  let Z_code = 0, Z_id = null, Z_enc = null, Z_sub = null;
  function classify(x, z) {
    Z_id = null; Z_sub = null; Z_enc = undefined;
    const c = lookup(x, z);
    if (c) {
      if (c.cway && causewayTop(x, z, c.cway, false) >= 0) { Z_id = CW_hit.id; return (Z_code = ZONE.STREET); }
      const b = bodyIn(x, z, c);
      if (b) { Z_id = b.id; return (Z_code = b.code); }
      if (c.canal) { const cb = canalBed(x, z, c.canal, false, 0); if (cb === cb) { Z_id = CN_hit.id; return (Z_code = ZONE.CANAL); } }
      let pre = false;
      if (c.mons) for (let k = 0; k < c.mons.length; k++) { const m = c.mons[k]; if (x >= m.bb[0] && x <= m.bb[2] && z >= m.bb[1] && z <= m.bb[3] && pipFlat(x, z, m.ring)) { if (m.id === 'etemenankiPrecinct') { pre = true; continue; } Z_id = m.id; return (Z_code = ZONE.MONUMENT); } }
      if (c.wbody) { const f = lineAt(x, z, c.wbody); if (f) { Z_id = f.id; return (Z_code = ZONE.WALL); } }
      if (c.lines) { const f = lineAt(x, z, c.lines); if (f) { Z_id = f.id; return (Z_code = ZONE.STREET); } }
      if (pre) { Z_id = 'etemenankiPrecinct'; return (Z_code = ZONE.PRECINCT_COURT); }
      // the lion street between its two walls, and its causeway north of the North Gate: all of it is street
      if (c.corr && onLionStreet(x, z, c.corr)) { Z_id = 'processionalWay'; Z_sub = 'shoulder'; return (Z_code = ZONE.STREET); }
      // made terraces that are no monument footprint (lane and strip between the palaces, the dry quay terrace,
      // the garden strip west of the South Palace): ground between walls
      if (c.plats) { const p = platformIn(x, z, c.plats); if (p && p.terrace) { Z_id = 'east'; Z_sub = 'terrace'; return (Z_code = ZONE.BERM); } }
      if (c.wall) {
        const o = wallOffset(x, z, c.wall);
        if (o >= -OFF.mainWall[1] - 12 && o <= OFF.quay[1] && !(c.plats && platformIn(x, z, c.plats))) {
          Z_id = WZ_side; Z_sub = o < -OFF.mainWall[1] ? 'intramural' : o < OFF.gapTo ? 'lane' : o < OFF.bermTo ? 'berm' : 'quay';
          return (Z_code = ZONE.BERM);
        }
      }
      if (c.owall) { nearestSeg(x, z, c.owall); const o = N_d * N_side * N_seg.out; if (o >= -4 && o <= OW.quay[1] + 0.4) { Z_id = 'outer'; Z_sub = o < OW.gapTo ? 'rubbleGap' : 'quay'; return (Z_code = ZONE.BERM); } }
    }
    const e = (Z_enc = enclosureAt(x, z));
    if (e === 'innerEast' || e === 'innerWest') return (Z_code = ZONE.INNER_CITY);
    if (inPalaceQuarter(x, z)) { Z_id = 'east'; Z_sub = 'palaceQuarter'; return (Z_code = ZONE.BERM); }
    if (e === 'outerCity') return (Z_code = ZONE.OUTER_CITY);
    if (c && c.vil) for (let k = 0; k < c.vil.length; k++) { const v = c.vil[k]; if ((x - v.x) * (x - v.x) + (z - v.z) * (z - v.z) <= v.r * v.r) { Z_id = 'village:' + v.id; return (Z_code = ZONE.VILLAGE); } }
    const st = stripAt(x, z);
    if (st) return (Z_code = st.belt && st.use === 'palmGarden' ? ZONE.PALM_BELT : ZONE.FIELDS);
    return (Z_code = steppeAt(x, z) ? ZONE.STEPPE : ZONE.FIELDS);
  }
  const zoneCode = (x, z) => classify(x, z);
  /**
   * Classification of a plan point (docs/ground.md lists every value).
   * @returns {{zone:string, code:number, id:(string|null), enclosure:(string|null), district:(string|null), water:boolean,
   *            sub:(string|null), fieldZone:(string|null), belt:(string|null), village:(number|null)}}
   */
  function zone(x, z) {
    const code = classify(x, z), id = Z_id, sub = Z_sub;
    const enclosure = Z_enc === undefined ? enclosureAt(x, z) : Z_enc;
    const d = code === ZONE.STEPPE ? null : districtAt(x, z);
    const water = code === ZONE.RIVER || code === ZONE.MOAT || code === ZONE.CANAL;
    let fieldZone = null, belt = null, village = null;
    if (code >= ZONE.OUTER_CITY) {
      if (code !== ZONE.OUTER_CITY) for (const f of fieldZones) if (pipFlat(x, z, f.ring)) { fieldZone = f.name; break; }
      const st = stripAt(x, z); if (st && st.belt) belt = st.feederKind;
      if (code === ZONE.VILLAGE) village = Number(id.slice(8));
    }
    let platform = null;
    if (code !== ZONE.RIVER && code !== ZONE.MOAT) { const c = lookup(x, z), p = c && c.plats ? platformIn(x, z, c.plats) : null; if (p) platform = p.id; }
    return { zone: ZONE_NAMES[code], code, id, enclosure, district: d ? d.name : null, water, sub, fieldZone, belt, village, platform };
  }

  // ====================================================================================================
  // fields: feeders -> palm belts and strip fields, rasterised
  // ====================================================================================================
  const FR = { x0: -7200, z0: -7200, cell: 6, w: 2400, h: 2400, data: null };
  FR.data = new Uint32Array(FR.w * FR.h);          // strip index per 6 m cell (0 = none)
  const WIN = 8800;                               // feeders and strips are generated inside [-WIN, WIN]^2
  const feeders = [], branches = [], ditches = [], strips = [null];   // strips[0] = none
  const noise2 = (x, z, period, seed) => {        // smooth value noise 0..1
    const fx = x / period, fz = z / period, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    return lerp(lerp(hash2(i, j, seed), hash2(i + 1, j, seed), a), lerp(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), a), b);
  };
  // Strip fields are 13 to 40 m wide and 150 to 380 m long near the city (R5 3.6: long narrow strips, the short
  // end on a ditch). Beyond 3.4 km from the city, where no camera comes nearer than 2.5 km, they are generalised:
  // up to three times as wide at 6.4 km, so that the far field costs a third of the records.
  const farK = (x, z) => 1 + 2 * sstep(3400, 6400, Math.hypot(x - 300, z + 300));
  function buildFields() {
    const clip = (pl) => { const out = []; for (const p of pl) if (Math.abs(p[0]) <= WIN && Math.abs(p[1]) <= WIN) out.push(p); else if (out.length) break; return out; };
    const blocked = (x, z) => { const code = classify(x, z); return code <= ZONE.INNER_CITY || code === ZONE.VILLAGE; };
    // --- order 1 feeders -------------------------------------------------------------------------
    const addFeeder = (f) => {
      const pl = M.resamplePolyline(clip(f.polyline), 50); if (pl.length < 4) return null;
      const n = pl.length, win = Math.max(2, Math.round((f.smooth || 500) / 100)), nor = new Array(n);
      for (let i = 0; i < n; i++) { const a = pl[Math.max(0, i - win)], b = pl[Math.min(n - 1, i + win)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; nor[i] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; }   // right of travel
      const rec = { index: feeders.length, pl, nor, n, step: 50, ...f, polyline: f.polyline };
      feeders.push(rec);
      return rec;
    };
    const eb = world.river.eastBank, wb = world.river.westBank;
    const part = (pl, pred) => pl.filter(pred);
    const landSide = (pl) => { const i = pl.length >> 1, a = pl[i - 1], b = pl[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), r = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; return bodyAtSlow((a[0] + b[0]) / 2 + r[0] * 25, (a[1] + b[1]) / 2 + r[1] * 25) ? [-1] : [1]; };
    const river = (id, pl) => pl.length > 2 && addFeeder({ id, kind: 'river', order: 1, polyline: pl, sides: landSide(pl), belt: world.environs.palmBelts[0].width, palms: 150, reach: 2500, offset: 14, smooth: 700 });
    river('river:east:north', part(eb, (p) => p[1] <= -1128));
    river('river:east:south', part(eb, (p) => p[1] >= 1066));
    river('river:west:north', part(wb, (p) => p[1] <= -640));
    river('river:west:south', part(wb, (p) => p[1] >= 1270));
    for (const m of world.moats) {
      const pl = m.outerBank || (m.id === 'northPalaceMoat' ? [m.polygon[2], m.polygon[3]] : null); if (!pl) continue;
      const outer = m.id === 'outerMoat';
      addFeeder({ id: 'moat:' + m.id, kind: 'moat', order: 1, polyline: pl, sides: landSide(pl), belt: world.environs.palmBelts[outer ? 2 : 1].width, palms: 140, reach: outer ? 1900 : 1300, offset: 12, smooth: 300 });
    }
    for (const c of canals) if (c.levee) addFeeder({ id: 'canal:' + c.id, kind: 'canal', order: 1, polyline: c.polyline, sides: [1, -1], belt: world.environs.palmBelts[3].width, palms: 150, reach: 2300, offset: c.width / 2 + 24, smooth: 600, canal: c });
    // suburb ribbons along the roads inside the outer wall
    const inOuter = (p) => M.pointInPolygon(p[0], p[1], world.enclosures.outerCity);
    for (const r of roads) { const pl = M.resamplePolyline(r.polyline, 40).filter(inOuter); if (pl.length > 4) addFeeder({ id: 'ribbon:' + r.id, kind: 'road', order: 1, polyline: pl, sides: [1, -1], belt: [45, 75], palms: 0, reach: 520, offset: r.width / 2 + 2, smooth: 200 }); }

    // --- order 2 and 3: branch canals taking off from rivers, moats and main canals, and field ditches taking
    //     off from the branch canals (the dendritic net of GAPS G09: river -> canal -> branch -> ditch) -------
    const pts = new Map();     // 200 m hash of feeder sample points: [x, z, feederIndex]
    const addPts = (f) => { for (const p of f.pl) { const k = (Math.floor(p[0] / 200) + 512) * 1024 + Math.floor(p[1] / 200) + 512; let a = pts.get(k); if (!a) pts.set(k, (a = [])); a.push([p[0], p[1], f.index]); } };
    const tooClose = (x, z, r, self, parent) => {
      const i0 = Math.floor((x - r) / 200), i1 = Math.floor((x + r) / 200), j0 = Math.floor((z - r) / 200), j1 = Math.floor((z + r) / 200);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = pts.get((i + 512) * 1024 + j + 512); if (a) for (const p of a) if (p[2] !== self && p[2] !== parent && (p[0] - x) ** 2 + (p[1] - z) ** 2 < r * r) return true; }
      return false;
    };
    for (const f of feeders) addPts(f);
    const grow = (parents, o) => {
      for (const f of parents) {
        const seedF = 1000 * (o.order - 1) + f.index * 37;
        let s = o.first[0] + o.first[1] * hash2(f.index, 1, 89 + o.order), n = 0;
        while (s < (f.n - 1) * f.step - o.endGap) {
          const i = Math.round(s / f.step), p = f.pl[i], nr = f.nor[i];
          const side = f.sides.length === 2 ? (hash2(n, f.index, 90 + o.order) < 0.5 ? 1 : -1) * (n % 2 ? 1 : -1) : f.sides[0];
          let hx = nr[0] * side, hz = nr[1] * side;
          const a0 = (hash2(n, seedF, 93) - 0.5) * o.spread, ca = Math.cos(a0), sa = Math.sin(a0);
          [hx, hz] = [hx * ca - hz * sa, hx * sa + hz * ca];
          let x = p[0] + nr[0] * side * (f.offset - o.tuck), z = p[1] + nr[1] * side * (f.offset - o.tuck);
          const line = [[x, z]], segN = o.segN[0] + Math.floor(hash2(n, seedF, 94) * o.segN[1]), id = feeders.length, q4 = o.seg / 4;
          for (let k = 0; k < segN; k++) {
            const a = (hash2(n * 16 + k, seedF, 95) - 0.5) * 0.3, c2 = Math.cos(a), s2 = Math.sin(a);
            [hx, hz] = [hx * c2 - hz * s2, hx * s2 + hz * c2];
            let ok = true;
            for (let q2 = 1; q2 <= 4 && ok; q2++) { const tx = x + hx * q4 * q2, tz = z + hz * q4 * q2; if (Math.abs(tx) > WIN || Math.abs(tz) > WIN || blocked(tx, tz) || (k > 0 && tooClose(tx, tz, o.clear[0], id, f.index)) || (k === 0 && q2 > 2 && tooClose(tx, tz, o.clear[1], id, f.index))) ok = false; }
            if (!ok) break;
            x += hx * o.seg; z += hz * o.seg; line.push([x, z]);
          }
          if (line.length >= 3) {
            const width = o.width[0] + o.width[1] * hash2(n, seedF, 96);
            const b = addFeeder({ id: (o.order === 2 ? 'branch:' : 'ditch:') + f.id + ':' + n, kind: o.order === 2 ? 'branch' : 'ditch', order: o.order, polyline: line, sides: [1, -1], belt: o.belt, palms: o.palms, reach: o.reach[0] + o.reach[1] * hash2(n, seedF, 97), offset: width / 2 + (o.order === 2 ? 4 : 2), smooth: 250, width, parent: f.index });
            if (b) { addPts(b); branches.push({ id: b.id, order: o.order, polyline: line, width, parent: f.id }); }
          }
          s += o.gap[0] + o.gap[1] * hash2(n, seedF, 98); n++;
        }
      }
    };
    grow(feeders.filter((f) => f.kind !== 'road'), { order: 2, first: [220, 420], endGap: 200, spread: 0.7, tuck: 6, seg: 280, segN: [4, 6], clear: [140, 105], width: [4, 2], belt: [16, 60], palms: 130, reach: [420, 520], gap: [470, 430] });
    grow(feeders.filter((f) => f.kind === 'branch'), { order: 3, first: [150, 260], endGap: 120, spread: 0.5, tuck: 2, seg: 150, segN: [2, 4], clear: [85, 60], width: [2.2, 1.2], belt: [10, 24], palms: 0, reach: [170, 230], gap: [300, 330] });

    // --- strips ----------------------------------------------------------------------------------
    const P = (f, s, d, side) => { const fi = Math.min(f.n - 1.0001, Math.max(0, s / f.step)), i = fi | 0, u = fi - i, a = f.pl[i], b = f.pl[i + 1], na = f.nor[i], nb = f.nor[i + 1]; return [lerp(a[0], b[0], u) + lerp(na[0], nb[0], u) * side * d, lerp(a[1], b[1], u) + lerp(na[1], nb[1], u) * side * d]; };
    const raw = [], blocks = [];
    for (const f of feeders) {
      const total = (f.n - 1) * f.step;
      for (const side of f.sides) {
        const sd = side > 0 ? 1 : 2;
        let s0 = 0, blk = 0;
        while (s0 < total - 15) {
          const hb = (k) => hash2(blk * 8 + k, f.index * 4 + sd, 71);
          let bl = (f.order === 3 ? 160 + 200 * hb(0) : 380 + 420 * hb(0)); if (total - s0 - bl < (f.order === 3 ? 90 : 220)) bl = total - s0;
          const s1 = Math.min(total, s0 + bl);
          const mid = P(f, (s0 + s1) / 2, f.offset + 200, side), fk = farK(mid[0], mid[1]);
          // tier distances for this block
          const tiers = [f.offset, f.offset + lerp(f.belt[0], f.belt[1], Math.pow(hb(1), 1.6))];
          while (tiers[tiers.length - 1] < f.offset + f.reach) tiers.push(tiers[tiers.length - 1] + (f.kind === 'road' ? 120 + 160 * hb(tiers.length + 2) : (150 + 230 * hb(tiers.length + 2)) * (1 + 0.6 * (fk - 1))));
          tiers[tiers.length - 1] = Math.min(tiers[tiers.length - 1], f.offset + f.reach + 200);
          blocks.push({ f, side, s0, s1, tiers, blk });
          for (let t = 0; t + 1 < tiers.length; t++) {
            const d0 = tiers[t], d1 = tiers[t + 1], dm = (d0 + d1) / 2;
            let a = s0, i = 0, run = 0, runEnd = 0;
            while (a < s1 - 1) {
              const hw = hash2(i, (blk * 16 + t) * 4 + sd, 300 + f.index);
              const w = t === 0 ? (f.kind === 'road' ? 30 + 50 * hw : (16 + 22 * hw) * Math.sqrt(fk)) : (13 + 27 * hw * hw) * fk;
              // The width is meant at the middle of the tier: on the outside of a bend the strips fan out, so
              // they take less of the feeder; on the inside they pinch and take more (walk along the offset
              // curve in short steps). Beyond the focus of an inside bend the offset curve runs backwards: no
              // strips there (another feeder's tiers show).
              const st = Math.max(3, Math.min(10, w / 4));
              let b = a, acc = 0, prev = P(f, a, dm, side), last = 0;
              while (b < s1 - 0.01 && acc < w && b - a < 220) { const nb = Math.min(s1, b + st), pn = P(f, nb, dm, side); last = Math.max(0.3 * (nb - b), Math.hypot(pn[0] - prev[0], pn[1] - prev[1])); acc += last; prev = pn; b = nb; }
              if (acc > w && last > 1e-6 && b - a > st) b -= st * Math.min(1, (acc - w) / last);
              if (s1 - b < (t === 0 ? 8 : 9)) b = s1;
              const p0 = P(f, a, d0, side), p1 = P(f, b, d0, side), p2 = P(f, b, d1, side), p3 = P(f, a, d1, side), q0 = P(f, a, 0, side), q1 = P(f, b, 0, side), pm0 = P(f, a, dm, side), pm1 = P(f, b, dm, side);
              const tx = q1[0] - q0[0], tz = q1[1] - q0[1], dot = (u, v) => (u[0] - v[0]) * tx + (u[1] - v[1]) * tz, lim = 0.1 * (tx * tx + tz * tz);
              // neighbouring strips are worked in runs of one to four (a holding): the run decides crop or fallow
              if (i >= runEnd) { run++; runEnd = i + 1 + Math.floor(hash2(run, (blk * 16 + t) * 4 + sd, 640 + f.index) * 2.6); }
              if (dot(p1, p0) > lim && dot(p2, p3) > lim && dot(pm1, pm0) > lim) raw.push({ f, side, tier: t, blk, i, run, ring: [p0, p1, p2, p3], s: (a + b) / 2, width: Math.hypot(pm1[0] - pm0[0], pm1[1] - pm0[1]), length: d1 - d0, seq: raw.length });
              a = b; i++;
            }
          }
          s0 = s1; blk++;
        }
      }
    }
    // far tiers first, branches over main feeders, ditches over branches: a nearer tier always wins
    raw.sort((a, b) => b.tier - a.tier || a.f.order - b.f.order || a.seq - b.seq);
    for (const r of raw) {
      const f = r.f, ring = r.ring, cx = (ring[0][0] + ring[1][0] + ring[2][0] + ring[3][0]) / 4, cz = (ring[0][1] + ring[1][1] + ring[2][1] + ring[3][1]) / 4;
      const key = r.blk * 4 + (r.side > 0 ? 1 : 2);
      const hs = hash2(r.i + r.tier * 977, key, 500 + f.index);                                                       // this strip
      const h = hash2(r.run + r.tier * 977, key, 520 + f.index), h2 = hash2(r.run + r.tier * 977, key, 900 + f.index);   // its run
      const outer = M.pointInPolygon(cx, cz, world.enclosures.outerCity);
      const dry = noise2(cx, cz, 900, 11), wet = noise2(cx, cz, 700, 12), lowSouth = outer && cz > 620 && cx > 600;
      let use, palms = 0;
      if (r.tier === 0) {
        if (f.kind === 'road') use = hs < 0.78 ? 'urban' : hs < 0.9 ? 'garden' : 'fallow';
        else if (f.order === 3) use = hs < 0.36 ? 'garden' : hs < 0.6 ? 'barleyRipe' : hs < 0.72 ? 'stubble' : 'fallow';     // vegetable plots at the ditch
        else if (outer) { use = hs < 0.54 ? 'palmGarden' : hs < 0.72 ? 'garden' : hs < 0.88 ? 'fallow' : 'urban'; palms = 120; }
        else if (f.order === 2) { use = hs < 0.6 ? 'palmGarden' : hs < 0.76 ? 'garden' : 'fallow'; palms = f.palms; }
        else { use = hs < 0.8 ? 'palmGarden' : hs < 0.9 ? 'garden' : 'fallow'; palms = f.palms; }
        if (use !== 'palmGarden') palms = 0;
      } else if (outer) {
        const ho = h2 < 0.45 ? hs : h;        // smallholdings: about half the strips go their own way
        use = lowSouth && wet > 0.52 ? 'reedMarsh' : ho < 0.13 ? 'palmGarden' : ho < 0.24 ? 'garden' : ho < 0.5 ? 'barleyRipe' : ho < 0.62 ? 'stubble' : ho < 0.86 ? 'fallow' : ho < 0.95 ? 'ploughed' : 'urban';
        if (use === 'palmGarden') palms = 120;
      } else {
        // alternate-year fallow: neighbouring runs alternate crop and bare soil
        const crop = (((r.run + (hash2(r.blk, f.index, 77) < 0.5 ? 1 : 0)) & 1) === 0) !== (h2 < 0.2);
        const far = clamp01((r.tier - 1) / 6) * 0.5 + (dry - 0.5) * 0.9;
        if (wet > 0.8 && r.tier >= 3 && h < 0.75) use = 'reedMarsh';
        else if (far > 0.42 && h < 0.5 + far) use = h2 < 0.45 ? 'saltCrust' : 'fallow';
        else if (crop) use = h < 0.69 ? 'barleyRipe' : h < 0.93 ? 'stubble' : 'garden';
        else use = h < 0.72 ? 'fallow' : h < 0.92 ? 'ploughed' : 'saltCrust';
        if (use === 'garden' && !(r.tier === 1 && f.order >= 2)) use = 'ploughed';     // green plots only directly at canals and ditches
      }
      const d = [ring[3][0] - ring[0][0], ring[3][1] - ring[0][1]], dl = Math.hypot(d[0], d[1]) || 1;
      strips.push({ id: strips.length, ring: M.closeRing(ring), use, tone: TONE[use], palmsPerHa: palms, tier: r.tier, belt: r.tier === 0 && f.order < 3 && f.kind !== 'road', outer, feeder: f.index, feederKind: f.kind, order: f.order, run: r.run, dir: [d[0] / dl, d[1] / dl], width: r.width, length: r.length, seed: Math.floor(hs * 65536) });
    }
    // --- raster ------------------------------------------------------------------------------------
    const fr = new Float64Array(8);
    for (let k = 1; k < strips.length; k++) { const r = strips[k].ring; for (let i = 0; i < 4; i++) { fr[i * 2] = r[i][0]; fr[i * 2 + 1] = r[i][1]; } fillPoly(FR, fr, k); }
    // what is never a field: water, wall zones, the walled city, the palace quarter, monuments, canals with their
    // levees, roads, villages, kiln yards (terrain.js paints the same list in the same order: fields.exclusions)
    for (const e of encl) if (e.inner) fillPoly(FR, e.ring, 0);
    fillPoly(FR, PQ.f, 0);
    for (const b of bodies) fillPoly(FR, b.ring, 0);
    for (const side of ['east', 'west']) fillLine(FR, iw[side].innerLine, OFF.quay[1] + 1, 0);
    fillLine(FR, ow.line, OW.quay[1] + 1, 0);
    for (const m of monuments) fillPoly(FR, m.ring, 0);
    for (const c of canals) if (c.levee) fillLine(FR, c.polyline, c.width / 2 + 22, 0);
    for (const b of branches) fillLine(FR, b.polyline, b.width / 2 + (b.order === 2 ? 2 : 1), 0);
    for (const r of roads) fillLine(FR, r.polyline, r.half + 1, 0);
    for (const v of villages) fillLine(FR, [[v.x, v.z], [v.x + 0.01, v.z]], v.r, 0);
    for (const k of kilns) fillLine(FR, [[k.x, k.z], [k.x + 0.01, k.z]], k.r, 0);
    for (const cw of causeways) fillLine(FR, [cw.to, [cw.to[0] + cw.ux * 30, cw.to[1] + cw.uz * 30]], 8, 0);

    // --- field ditches and tracks: the head of every tier and the side of every block, kept only where the
    //     strips beside them are the ones that show (another feeder's nearer tier may lie on top) -------------
    const own = (q2, f, t) => { const st = stripAt(q2[0], q2[1]); return !!st && st.feeder === f.index && (t < 0 || st.tier === t); };
    const emit = (line, rec) => { if (line.length >= 3) ditches.push({ ...rec, polyline: line }); };
    for (const b of blocks) {
      const f = b.f; if (f.kind === 'road') continue;
      const hk = hash2(b.blk, f.index * 4 + (b.side > 0 ? 1 : 2), 730);
      for (let t = 1; t + 1 < b.tiers.length; t++) {            // the head ditch of tier t runs along the feeder at tiers[t]
        let line = [];
        for (let s = b.s0; s <= b.s1 + 0.01; s += 20) {
          const ss = Math.min(s, b.s1);
          if (own(P(f, ss, b.tiers[t] + 7, b.side), f, t)) line.push(P(f, ss, b.tiers[t], b.side)); else { emit(line, { kind: 'head', tier: t, feeder: f.index, width: 1.4 + 1.2 * hash2(t, b.blk, 731 + f.index) }); line = []; }
        }
        emit(line, { kind: 'head', tier: t, feeder: f.index, width: 1.4 + 1.2 * hash2(t, b.blk, 731 + f.index) });
      }
      // the side ditch of the block: from the feeder outward along the block's first edge
      let line = [], tier = 0; const dEnd = b.tiers[b.tiers.length - 1];
      for (let d = b.tiers[0]; d <= dEnd + 0.01; d += 20) {
        while (tier + 1 < b.tiers.length - 1 && d > b.tiers[tier + 1]) tier++;
        if (own(P(f, b.s0 + 7, d + 3, b.side), f, -1) || own(P(f, b.s0 - 7, d + 3, b.side), f, -1)) line.push(P(f, b.s0, d, b.side)); else { emit(line, { kind: 'side', tier: 0, feeder: f.index, width: 2 + 1.4 * hk }); line = []; }
      }
      emit(line, { kind: 'side', tier: 0, feeder: f.index, width: 2 + 1.4 * hk });
    }
  }
  const TONE = { palmGarden: 'gardenGreen', garden: 'gardenGreen', barleyRipe: 'barleyRipe', stubble: 'stubble', fallow: 'fallow', ploughed: 'ploughedSoil', saltCrust: 'saltCrust', reedMarsh: 'reedsGreen', urban: 'alluvialSoilDry', steppe: 'fallow', bare: 'alluvialSoilDry' };
  /** the field strip at a point, or null */
  function stripAt(x, z) {
    const i = Math.floor((x - FR.x0) / FR.cell), j = Math.floor((z - FR.z0) / FR.cell);
    if (i < 0 || j < 0 || i >= FR.w || j >= FR.h) return null;
    const k = FR.data[j * FR.w + i];
    return k ? strips[k] : null;
  }
  buildFields();

  // ---- land use -----------------------------------------------------------------------------------------
  const LU = (use, tone, palmsPerHa = 0, strip = null, dir = null) => ({ use, tone, palmsPerHa, strip, dir });
  /**
   * Land use at a plan point: { use, tone (palette id of the ground), palmsPerHa, strip: [id, tier] | null, dir: [dx, dz] | null }.
   * use: 'water' 'street' 'built' 'bare' 'urban' 'palmGarden' 'garden' 'barleyRipe' 'stubble' 'fallow' 'ploughed'
   * 'saltCrust' 'reedMarsh' 'steppe'. strip identifies the field (same id = same field); dir is its long axis.
   */
  function landUse(x, z) {
    const code = classify(x, z);
    if (code === ZONE.RIVER || code === ZONE.MOAT || code === ZONE.CANAL) return LU('water', 'wetBank');
    if (code === ZONE.STREET) return LU('street', 'streetEarth');
    if (code === ZONE.MONUMENT || code === ZONE.PRECINCT_COURT) return LU('built', 'courtBrickPaving');
    if (code === ZONE.WALL || code === ZONE.BERM) return LU('bare', 'alluvialSoilDry');
    if (code === ZONE.INNER_CITY || code === ZONE.VILLAGE) return LU('urban', 'streetEarth');
    if (code === ZONE.STEPPE) return LU('steppe', 'fallow');
    const st = stripAt(x, z);
    if (st) return LU(st.use, st.tone, st.palmsPerHa, [st.id, st.tier], st.dir);
    for (const k of kilns) if ((x - k.x) * (x - k.x) + (z - k.z) * (z - k.z) <= k.r * k.r) return LU('bare', 'ploughedSoil');
    if (code === ZONE.OUTER_CITY) return LU('urban', 'alluvialSoilDry');
    // unirrigated margin between the canal systems: dry fallow with salt, or steppe further out
    const i = Math.floor(x / 140), j = Math.floor(z / 420), salt = noise2(x, z, 600, 13) > 0.62;
    return LU(salt ? 'saltCrust' : 'fallow', salt ? 'saltCrust' : 'fallow', 0, [-1 - (((i & 0x3ff) << 10) | (j & 0x3ff)), 9], [0, 1]);
  }

  const ground = {
    impl: 'real',
    ZONE, ZONE_NAMES,
    waterLevel: WL,
    /** Region where the ground has real relief (everything else is flat alluvium): [minX, minZ, maxX, maxZ]. */
    coreBounds: [-2000, -3500, 3500, 2000],
    terrainRadius: world.meta.worldExtent.terrainRadius,
    height, landHeight, zone, zoneCode, landUse, isWater,
    /** Water depth in metres (0 on land). */
    waterDepth: (x, z) => (isWater(x, z) ? Math.max(0, WL - height(x, z)) : 0),
    /** Unit surface normal [nx, ny, nz] by central differences over `eps` metres. */
    normal(x, z, eps = 2) {
      const dx = (height(x + eps, z) - height(x - eps, z)) / (2 * eps), dz = (height(x, z + eps) - height(x, z - eps)) / (2 * eps);
      const l = Math.hypot(dx, 1, dz);
      return [-dx / l, 1 / l, -dz / l];
    },
    /** Heights at every vertex of a polyline resampled at `step` metres: [[x, z, y], ...]. */
    profile(polyline, step = 5) { return M.resamplePolyline(polyline, step).map(([x, z]) => [x, z, height(x, z)]); },
    shoreDistance,

    // ---- additions (docs/ground.md) --------------------------------------------------------------------
    /** What the terrain mesh samples: height() with every sharp step moved `stepInset` m into its masonry and monument floors sunk by 0.15 m. */
    meshHeight,
    nearHardEdge,
    nearStep,
    /**
     * The lines where the ground steps straight down into water behind brickwork: [{ id, kind: 'quay' | 'canal',
     * body, polyline (the true edge = the water polygon edge / the channel side), land: +1 | -1 (land lies to
     * the right / left of travel), foot (bed level at the foot) }]. Quay and lining masonry stands ON these lines,
     * at least 1.5 m thick; the terrain draws a curtain 1 m behind them and an exact apron at height() behind that.
     */
    hardEdges,
    stepInset: STEP_INSET,
    causewayInset: CW_INSET,
    /** The palace quarter (hull of the palaces, fortifications and the gate): zone 'berm' / sub 'palaceQuarter' wherever it is not water, monument, wall or street. */
    palaceQuarter: PQ.ring,
    plainLevel: PLAIN,
    bankAt,
    /** Smooth base level (no platforms, walls, corridors or water). */
    baseHeight: (x, z) => base(x, z, lookup(x, z)),
    /** Bank segments: [{ body, type: 'quay' | 'earth', a: [x, z], b: [x, z], normal: [nx, nz] (to land) }]. */
    banks: banks.map((e) => ({ body: e.body.id, type: e.type, a: [e.ax, e.az], b: [e.bx, e.bz], normal: [e.nx, e.nz] })),
    /** Sharp-edged platforms: [{ id, level, polygon, wall: 'own' | 'high', owner, note, sink (m the mesh lies under the floor) }], first match wins. */
    platforms: platforms.map((p) => ({ id: p.id, level: p.level, polygon: p.polygon, wall: p.wall, owner: p.owner, note: p.note, sink: p.sink })),
    platformAt: (x, z) => { const c = lookup(x, z), p = c && c.plats ? platformIn(x, z, c.plats) : null; return p ? { id: p.id, level: p.level, wall: p.wall, owner: p.owner, sink: p.sink } : null; },
    gardenTerraces,
    /** Causeways across the moats: [{ id, gate, kind: 'inner' | 'outer', from, to, width, length, top, span: { s0, s1, from, to } }]. */
    causeways: causeways.map((c) => ({ id: c.id, gate: c.gate, kind: c.kind, from: c.from, to: c.to, width: c.width, length: c.length, top: c.top, span: c.span, approach: c.approach })),
    /** Canal cuts: [{ id, polyline, width, waterLevel, bed, lined, levee, culverts: [[s0, s1, why]], widthAt(s), cutAt(s) }]. */
    canals: canals.map((c) => ({ id: c.id, name: c.name, polyline: c.polyline, width: c.width, waterLevel: c.waterLevel, bed: c.bed, lined: c.lined, levee: c.levee, culverts: c.culverts, widthAt: (s) => c.half(s) * 2, linedAt: (s) => (c.linedAt ? c.linedAt(s) : c.lined), cutAt: (s) => !inCulvert(c, s) })),
    roads: roads.map((r) => ({ id: r.id, name: r.name, polyline: r.polyline, width: r.width, embankment: ROAD_H })),
    villages: villages.map((v) => ({ id: v.id, x: v.x, z: v.z, houses: v.houses, radius: v.r })),
    kilnYards: kilns.map((k) => ({ id: k.id, x: k.x, z: k.z, radius: k.r })),
    /** 1 where canals are cut and roads are embanked, falling to 0 between 5.6 and 7.2 km from (900, -900). */
    detailFade,
    /** The irrigated landscape: feeders, generated branch canals, strips (index 0 is null) and the 6 m raster. */
    fields: {
      feeders: feeders.map((f) => ({ index: f.index, id: f.id, kind: f.kind, order: f.order, polyline: f.pl, sides: f.sides, width: f.width || (f.canal ? f.canal.width : 0), palms: f.palms })),
      branches, ditches, strips, raster: FR, stripAt, extent: WIN,
    },
    districtAt: (x, z) => { const d = districtAt(x, z); return d ? { name: d.name, index: d.index, kind: d.kind } : null; },
    enclosureAt,
    /**
     * True if any 40 m cell of the sparse feature grid that touches the box holds something sharp or cut (water
     * bank, platform, wall zone, corridor, road, canal, causeway, village). The terrain refines where this is true.
     */
    hasFeatures(x0, z0, x1, z1) {
      const i0 = Math.floor(x0 / CELL), i1 = Math.floor((x1 - 1e-6) / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor((z1 - 1e-6) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (cells.has(keyOf(i, j))) return true;
      return false;
    },
    featureCell: CELL,
    /** Scanline fills on a { data, w, h, x0, z0, cell } grid (used by terrain for its masks). */
    raster: { fillPoly, fillLine, flatRing },
    stats: () => ({ cells: cells.size, platforms: platforms.length, banks: banks.length, quayBanks: banks.filter((e) => e.hard).length, causeways: causeways.length, canals: canals.length, feeders: feeders.length, branches: branches.filter((b) => b.order === 2).length, fieldDitches: branches.filter((b) => b.order === 3).length, ditchLines: ditches.length, strips: strips.length - 1 }),
  };
  return ground;
}
