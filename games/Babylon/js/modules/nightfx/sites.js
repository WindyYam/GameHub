// js/modules/nightfx/sites.js — WHERE things burn, smoke and drift when no other module has said so.
//
// Every module declares its own fires and smoke through ctx.emitters (ENGINE.md section 4, "Night"). The modules
// are written in parallel and any of them may be missing, so nightfx keeps a fallback for every place SPEC 3.19
// names (city gates, wall towers, precinct gates, bridge heads, palace gate and walls, temple courts, the fire
// bowls of the ziggurat) and uses it ONLY where no declared fire stands nearby. Positions come from world.json
// through ctx.W, ctx.ground and ctx.layout, never from remembered numbers.
import * as M from '../../core/mathx.js';
import { hash2, hashPos } from '../../core/rng.js';

const NIGHT_KINDS = new Set(['lamp', 'torch', 'brazier', 'fireBowl', 'hearth']);

/** Static fires other modules declared: [{ x, y, z, kind, owner }]. */
export function declaredFires(ctx) {
  const out = [];
  for (const e of ctx.emitters.list) if (NIGHT_KINDS.has(e.kind) && Array.isArray(e.pos)) out.push({ x: e.pos[0], y: e.pos[1], z: e.pos[2], kind: e.kind, owner: e.owner });
  return out;
}

function makeNear(list, cell = 32) {
  const grid = new Map(), key = (x, z) => Math.floor(x / cell) + ':' + Math.floor(z / cell);
  for (const p of list) { const k = key(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  /** Is any point within r metres (in plan) of (x, z)? */
  return (x, z, r) => {
    const n = Math.ceil(r / cell);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      const arr = grid.get((Math.floor(x / cell) + dx) + ':' + (Math.floor(z / cell) + dz)); if (!arr) continue;
      for (const p of arr) if (Math.hypot(p.x - x, p.z - z) <= r) return true;
    }
    return false;
  };
}

const safe = (fn, dflt) => { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; } };

/**
 * Fallback fires: [{ kind, pos: [x, y, z], size, group }] for the fixed places of SPEC 3.19 where no module has
 * declared a fire. `groups` reports how many each group gave and how many were left to the owner.
 */
export function fallbackFires(ctx) {
  const { W, ground, world } = ctx;
  const declared = declaredFires(ctx), near = makeNear(declared);
  const out = [], groups = {};
  const count = (g, used) => { const r = groups[g] || (groups[g] = { added: 0, left: 0 }); if (used) r.added++; else r.left++; };
  const put = (group, kind, x, y, z, size, guard) => {
    if (!Number.isFinite(x + y + z)) return;
    if (guard > 0 && near(x, z, guard)) { count(group, false); return; }
    out.push({ kind, pos: [x, y, z], size, group }); count(group, true);
  };
  const gh = (x, z) => safe(() => ground.height(x, z), 0);

  // ---- towers of the two inner main walls: a watch fire on every second tower; the outer wall: every fourth -------
  for (const [which, step, group] of [['east:main', 4, 'towers'], ['west:main', 4, 'towers'], ['outer', 6, 'outerTowers']]) {
    const towers = safe(() => W.wallTowers(which), []) || [];
    // if the owner lit a fair share of these towers itself, the rest is its decision. Not a string of lights: about
    // every third tower has a watch, and one watch in five is away
    const cand = towers.filter((t, i) => (i + Math.floor(2 * hashPos(t.x, t.z, 51))) % step === 0 && hashPos(t.x, t.z, 52) > 0.15), lit = cand.filter((t) => near(t.x, t.z, 14)).length;
    if (lit > 0.2 * cand.length) { for (let i = 0; i < cand.length; i++) count(group, false); continue; }
    for (const t of cand) put(group, 'torch', t.x, (t.top ?? t.wallTop ?? gh(t.x, t.z) + 12) + 0.9, t.z, 1, 14);
  }

  // ---- city gates: two braziers before the outer door, two inside ----------------------------------------------------
  const gateSet = [[safe(() => world.innerWalls.gates, []) || [], 'gates', true], [safe(() => world.outerWall.gates, []) || [], 'outerGates', false]];
  for (const [gates, group, both] of gateSet) for (const g of gates) {
    if (!Number.isFinite(g.x) || !Number.isFinite(g.z)) continue;
    if (near(g.x, g.z, 45)) { count(group, false); continue; }
    const o = M.azToDir(g.facingDeg ?? 0), r = M.rightOf(o[0], o[1]), half = (g.depth ?? 40) / 2 + 3.5, lat = (g.doorWidth ?? 4.5) / 2 + 2.8;
    for (const side of both ? [1, -1] : [1]) for (const s of [1, -1]) {
      const x = g.x + o[0] * half * side + r[0] * lat * s, z = g.z + o[1] * half * side + r[1] * lat * s;
      const y = Math.max(gh(x, z), g.roadwayLevel ?? -1e9);
      if (safe(() => ground.isWater(x, z), false)) continue;
      put(group, 'brazier', x, y + 1.05, z, 1.3, 0);
    }
  }

  // ---- bridge heads -------------------------------------------------------------------------------------------------
  const br = world.bridge;
  if (br && br.westAbutment && br.eastAbutment) {
    const ax = M.azToDir(br.axisAzimuthDeg ?? 100.8), pr = M.rightOf(ax[0], ax[1]), hw = (br.width ?? 9) / 2 - 0.4;
    for (const [p, sgn] of [[br.westAbutment, -1], [br.eastAbutment, 1]]) {
      if (near(p[0], p[1], 30)) { count('bridge', false); count('bridge', false); continue; }
      for (const s of [1, -1]) {
        const x = p[0] + ax[0] * 2.5 * sgn + pr[0] * hw * s, z = p[1] + ax[1] * 2.5 * sgn + pr[1] * hw * s;
        put('bridge', 'torch', x, Math.max(gh(x, z), (br.pierTop ?? 1.6) + 0.7) + 2.3, z, 1.2, 0);
      }
    }
  }

  // ---- precinct gates -----------------------------------------------------------------------------------------------
  const pre = safe(() => W.monument('etemenankiPrecinct'), null);
  if (pre && pre.dims && pre.dims.gates) {
    const ring = pre.footprint.polygon, c = M.polygonCentroid(ring);
    for (const g of Object.values(pre.dims.gates)) {
      if (!Number.isFinite(g.x)) continue;
      if (near(g.x, g.z, 26)) { count('precinctGates', false); continue; }
      const hit = M.nearestOnPolyline(g.x, g.z, ring), d = hit.dir, n0 = M.rightOf(d[0], d[1]);
      const sgn = (g.x - c[0]) * n0[0] + (g.z - c[1]) * n0[1] >= 0 ? 1 : -1, n = [n0[0] * sgn, n0[1] * sgn];
      const off = (pre.dims.wall && pre.dims.wall.depth ? pre.dims.wall.depth / 2 : 4) + 2.6;
      for (const s of [1, -1]) {
        const x = g.x + n[0] * off + d[0] * 3.4 * s, z = g.z + n[1] * off + d[1] * 3.4 * s;
        put('precinctGates', 'brazier', x, gh(x, z) + 1.05, z, 1.2, 0);
      }
    }
  }

  // ---- fire bowls on the terraces of the ziggurat (conjectural, SPEC 3.19) ---------------------------------------------
  const zig = safe(() => W.monument('etemenanki'), null);
  if (zig) {
    const fp = zig.footprint, bb = M.bbox(fp.polygon);
    const owned = declared.some((p) => M.inBBox(bb, p.x, p.z, 6) && p.y > (zig.dims.baseLevel ?? 2.5) + 8);
    const api = ctx.modules && ctx.modules.etemenanki, terr = api && Array.isArray(api.terraces) ? api.terraces : null;
    const rings = [];
    if (terr && terr.length) {
      for (const t of terr) if (t && Array.isArray(t.ring) && Number.isFinite(t.level)) rings.push({ level: t.level, ring: M.openRing(t.ring) });
    } else if (zig.dims && Array.isArray(zig.dims.stages)) {
      const base = zig.dims.baseLevel ?? 2.5; let top = 0;
      zig.dims.stages.forEach(([side, h]) => { top += h; const hs = side / 2; rings.push({ level: base + top, ring: [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]].map(([lx, lz]) => M.localToWorld(fp.center, fp.rotationDeg || 0, lx, lz)) }); });
    }
    rings.sort((a, b) => a.level - b.level);
    rings.forEach((t, i) => {
      const c = M.polygonCentroid(M.closeRing(t.ring));
      // corners only where the ring is a plain rectangle; pulled 2.2 m toward the centre so the bowl stands on the ledge
      if (t.ring.length !== 4) return;
      for (const v of t.ring) {
        const dx = c[0] - v[0], dz = c[1] - v[1], l = Math.hypot(dx, dz) || 1, x = v[0] + dx / l * 3.1, z = v[1] + dz / l * 3.1;
        if (owned) { count('ziggurat', false); continue; }
        put('ziggurat', 'fireBowl', x, t.level + 0.95, z, i === 0 ? 1.15 : i >= rings.length - 1 ? 0.8 : 0.9, 0);
      }
    });
    const st = zig.dims && zig.dims.stairs;
    if (st && st.landing && st.lateralBlock && !owned) {
      const base = zig.dims.baseLevel ?? 2.5, hs = (zig.dims.baseSide ?? 91.5) / 2;
      for (const lx of [st.landing.xFrom - 2.2, st.landing.xTo + 2.2]) {
        const [x, z] = M.localToWorld(fp.center, fp.rotationDeg || 0, lx, hs + st.lateralBlock.projection * 0.5);
        put('ziggurat', 'fireBowl', x, base + st.landing.level + 0.95, z, 1.0, 0);
      }
    }
  }

  // ---- palaces: gate, courts, a torch on the wall every 60 to 80 m ----------------------------------------------------
  for (const [id, spacing] of [['southPalace', 58], ['northPalace', 78], ['summerPalace', 85], ['westFortification', 70]]) {
    const m = safe(() => W.monument(id), null); if (!m) continue;
    const ring = m.footprint.polygon, bb = M.bbox(ring), group = 'palace:' + id;
    if (declared.some((p) => M.inBBox(bb, p.x, p.z, 12) && (M.pointInPolygon(p.x, p.z, ring) || M.distToRing(p.x, p.z, ring) < 12))) { count(group, false); continue; }
    const lv = safe(() => W.monumentLevels(m), null), d = m.dims || {};
    const top = d.towerTopLevel ?? d.wallTopLevel ?? d.outerWallTop ?? d.wallTop ?? d.top ?? (lv ? lv.top : gh(fpC(m)[0], fpC(m)[1]) + 12);
    if (Number.isFinite(top)) {
      const len = M.polylineLength(ring), n = Math.max(4, Math.round(len / spacing)), c = M.polygonCentroid(ring);
      for (let i = 0; i < n; i++) {
        const h = M.pointAlong(ring, (i + 0.5) * len / n), dx = c[0] - h.x, dz = c[1] - h.z, l = Math.hypot(dx, dz) || 1;
        put(group, 'torch', h.x + dx / l * 1.8, top + 0.9, h.z + dz / l * 1.8, 1, 0);
      }
    }
    const floor = d.floorLevel ?? (lv ? lv.floor : null);
    if (d.mainGate && Number.isFinite(d.mainGate.x)) {
      const g = d.mainGate, c = M.polygonCentroid(ring), hit = M.nearestOnPolyline(g.x, g.z, ring), t = hit.dir, n0 = M.rightOf(t[0], t[1]);
      const sgn = (g.x - c[0]) * n0[0] + (g.z - c[1]) * n0[1] >= 0 ? 1 : -1;
      for (const s of [1, -1]) {
        const x = g.x + n0[0] * sgn * 3.2 + t[0] * ((g.doorWidth ?? 4) / 2 + 2.6) * s, z = g.z + n0[1] * sgn * 3.2 + t[1] * ((g.doorWidth ?? 4) / 2 + 2.6) * s;
        put(group, 'brazier', x, gh(x, z) + 1.05, z, 1.3, 0);
      }
    }
    if (d.courts && typeof d.courts === 'object' && Number.isFinite(floor)) {
      for (const ct of Object.values(d.courts)) {
        const cc = ct && (ct.center || (ct.polygon ? M.polygonCentroid(ct.polygon) : null)); if (!cc) continue;
        put(group, 'brazier', cc[0] + 3, floor + 1.05, cc[1] + 2, 1.2, 0);
        if (ct.polygon && Math.abs(M.polygonArea(ct.polygon)) > 1800) put(group, 'brazier', cc[0] - 9, floor + 1.05, cc[1] - 7, 1.2, 0);
      }
    }
  }

  // ---- Esagila: braziers in the court and at the four gates ------------------------------------------------------------
  const esa = safe(() => W.monument('esagila'), null);
  if (esa && esa.dims) {
    const ring = esa.footprint.polygon, bb = M.bbox(ring), d = esa.dims;
    if (declared.some((p) => M.inBBox(bb, p.x, p.z, 14))) count('esagila', false);
    else {
      const floor = d.floorLevel ?? safe(() => W.monumentLevels(esa).floor, 4.4);
      if (d.court && d.court.center) {
        const [cx, cz] = d.court.center, [sx, sz] = d.court.size || [30, 36], rot = esa.footprint.rotationDeg || 0;
        for (const [fx, fz] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) {
          const [x, z] = M.localToWorld([cx, cz], rot, fx * sx, fz * sz);
          put('esagila', 'brazier', x, floor + 1.05, z, 1.3, 0);
        }
      }
      const c = M.polygonCentroid(ring);
      for (const g of Object.values(d.gates || {})) {
        if (!Array.isArray(g)) continue;
        const dx = g[0] - c[0], dz = g[1] - c[1], l = Math.hypot(dx, dz) || 1, n = [dx / l, dz / l], t = M.rightOf(n[0], n[1]);
        for (const s of [1, -1]) { const x = g[0] + n[0] * 5 + t[0] * 3.4 * s, z = g[1] + n[1] * 5 + t[1] * 3.4 * s; put('esagila', 'brazier', x, gh(x, z) + 1.05, z, 1.2, 0); }
      }
    }
  }

  // ---- the other temples: an altar fire each -------------------------------------------------------------------------
  for (const m of world.monuments || []) {
    if (!/temple/.test(m.kind || '') || m.id === 'esagila') continue;
    const fp = m.footprint; if (!fp || !fp.center) continue;
    const d = m.dims || {};
    let p = Array.isArray(d.altar) && Number.isFinite(d.altar[0]) ? [d.altar[0], d.altar[1]] : null, y;
    if (p) y = gh(p[0], p[1]) + 1.2;
    else {
      p = [fp.center[0], fp.center[1]];
      const lv = fp.polygon ? safe(() => W.monumentLevels(m), null) : null;
      y = (d.floorLevel ?? (lv ? lv.floor : gh(p[0], p[1]))) + 1.1;
      // the centre of a temple block is usually its court; if a cella court is given, take that
      if (d.court && Array.isArray(d.court.center)) p = [d.court.center[0], d.court.center[1]];
    }
    if (near(p[0], p[1], 30)) { count('temples', false); continue; }
    put('temples', 'brazier', p[0], y, p[1], 1.1, 0);
  }

  return { fires: out, groups, declared: declared.length };
}
const fpC = (m) => m.footprint.center || M.polygonCentroid(m.footprint.polygon);

/** Smoke columns nobody declared: [{ kind: 'smoke' | 'kilnSmoke', pos, size, why }]. */
export function fallbackSmoke(ctx) {
  const { layout, ground, world, W } = ctx, out = [];
  const list = ctx.emitters.list.filter((e) => Array.isArray(e.pos));
  const smokeNear = makeNear(list.filter((e) => e.kind === 'smoke').map((e) => ({ x: e.pos[0], z: e.pos[2] })), 16);
  const kilnNear = makeNear(list.filter((e) => e.kind === 'kilnSmoke').map((e) => ({ x: e.pos[0], z: e.pos[2] })), 128);
  const gh = (x, z) => safe(() => ground.height(x, z), 0);
  // ovens of the housing (the houses module declares them; this is for a run without it)
  for (const s of safe(() => layout.smokeSources(), []) || []) if (!smokeNear(s.x, s.z, 2.0)) out.push({ kind: 'smoke', pos: [s.x, s.y + 0.15, s.z], size: 0.8, why: 'oven' });
  // brick kilns: four to six smoking clamps in every yard of world.json environs.kilns
  const yards = safe(() => world.environs.kilns.items, []) || [];
  yards.forEach((k, i) => {
    if (kilnNear(k.x, k.z, 260)) return;
    const n = 4 + Math.floor(hash2(i, 5, 91) * 3);
    for (let j = 0; j < n; j++) {
      const a = hash2(i, j, 92) * M.TAU, r = 18 + 55 * hash2(i, j, 93), x = k.x + Math.cos(a) * r, z = k.z + Math.sin(a) * r;
      if (safe(() => ground.isWater(x, z), false)) continue;
      out.push({ kind: 'kilnSmoke', pos: [x, gh(x, z) + 3.2, z], size: 0.8 + 0.5 * hash2(i, j, 94), why: 'kiln' });
    }
  });
  // altars: incense and offering smoke before the temples that have an excavated altar
  for (const m of world.monuments || []) {
    const a = m.dims && m.dims.altar; if (!Array.isArray(a) || !Number.isFinite(a[0])) continue;
    if (!smokeNear(a[0], a[1], 5)) out.push({ kind: 'smoke', pos: [a[0], gh(a[0], a[1]) + 1.3, a[1]], size: 0.6, why: 'altar' });
  }
  return out;
}

/**
 * The evening haze of cooking smoke over the housing: big flat puffs a few metres above the roofs, more where the
 * houses stand close. [{ x, y, z, w, h, seed }]
 */
export function hazeSites(ctx, count) {
  const { layout } = ctx, out = [], hs = layout.houses, n = hs.length;
  if (!n) return out;
  let tries = 0;
  for (let i = 0; out.length < count && tries < count * 12; i++, tries++) {
    const h = hs[Math.floor(hash2(i, 17, 301) * n) % n];
    if (!h || h.village) continue;
    const inner = h.enclosure === 'innerEast' || h.enclosure === 'innerWest';
    if (!inner && hash2(i, 3, 302) > 0.3) continue;
    const u = hash2(i, 5, 303), v = hash2(i, 7, 304);
    out.push({ x: h.center[0] + (u - 0.5) * 40, y: h.roofLevel + 5 + 13 * v * v, z: h.center[1] + (hash2(i, 9, 305) - 0.5) * 40, w: 90 + 110 * hash2(i, 11, 306), h: 6 + 7 * v, seed: hash2(i, 13, 307) });
  }
  return out;
}

/** The morning mist on river, moats and canals: [{ x, y, z, w, h, seed }] at the water level. */
export function mistSites(ctx, count) {
  const { world, ground } = ctx, lines = [];
  const wl = safe(() => ground.waterLevel, -3) ?? -3;
  const isWater = (x, z) => safe(() => ground.isWater(x, z), false);
  // weighted lines: the river inside and near the city carries most of it
  const river = safe(() => world.river.centerline, null);
  if (Array.isArray(river)) lines.push({ pl: river.filter((p) => Math.abs(p[1]) < 3200).map((p) => [p[0], p[1]]), half: 55, weight: 5 });
  for (const m of safe(() => world.moats, []) || []) {
    const mid = Array.isArray(m.innerBank) && Array.isArray(m.outerBank) && m.innerBank.length === m.outerBank.length ? m.innerBank.map((p, i) => [(p[0] + m.outerBank[i][0]) / 2, (p[1] + m.outerBank[i][1]) / 2]) : m.polygon;
    if (Array.isArray(mid) && mid.length > 1) lines.push({ pl: mid, half: (m.width ?? 80) * 0.45, weight: m.id === 'outerMoat' ? 1.2 : 2.2 });
  }
  for (const c of safe(() => world.canals, []) || []) if (Array.isArray(c.polyline) && c.polyline.length > 1) lines.push({ pl: c.polyline.filter((p) => Math.hypot(p[0], p[1]) < 4500).map((p) => [p[0], p[1]]), half: Math.max(2, (c.width ?? 10) * 0.4), weight: 0.6 });
  const good = lines.filter((l) => l.pl.length > 1).map((l) => ({ ...l, len: M.polylineLength(l.pl) }));
  const total = good.reduce((a, l) => a + l.len * l.weight, 0);
  const out = [];
  if (!(total > 0)) return out;
  good.forEach((l, li) => {
    const n = Math.round(count * l.len * l.weight / total);
    for (let i = 0; i < n; i++) {
      const s = (i + hash2(i, li, 401)) / n * l.len, h = M.pointAlong(l.pl, s), r = M.rightOf(h.dir[0], h.dir[1]);
      const lat = (hash2(i, li, 402) * 2 - 1) * l.half, x = h.x + r[0] * lat, z = h.z + r[1] * lat;
      if (!isWater(x, z) && !isWater(h.x, h.z)) continue;
      const big = hash2(i, li, 403), th = 1.2 + 1.6 * hash2(i, li, 404);
      out.push({ x: isWater(x, z) ? x : h.x, y: wl + 0.5 + 3.2 * hash2(i, li, 406) * hash2(i, li, 407), z: isWater(x, z) ? z : h.z, w: Math.min(34 + 60 * big, Math.max(18, l.half * 3.2)), h: th, seed: hash2(i, li, 405) });
    }
  });
  return out;
}

/**
 * Dust nobody declared: herds and carts on the country roads (class 'road' of ctx.layout.streets), and the feet of
 * the procession on the lion street. [{ pos, size, low }]
 */
export function fallbackDust(ctx, count) {
  const { layout, ground, world } = ctx, out = [];
  const declared = ctx.emitters.list.filter((e) => e.kind === 'dust');
  // the procession on the lion street (shot 2): a little dust at its feet, unless its owner raises some there
  try {
    const shot = ctx.film.shots.find((s) => s.n === 2), pw = (world.streets || []).find((s) => s.id === 'processionalWay');
    if (shot && pw && Array.isArray(pw.polyline)) {
      const a = ctx.film.pathPoseAt(shot.tHold).pos, b = ctx.film.pathPoseAt(shot.t1).pos, dir = [b[0] - a[0], b[2] - a[2]], l = Math.hypot(dir[0], dir[1]) || 1;
      const mine = declared.some((e) => { const p = Array.isArray(e.pos) ? e.pos : (typeof e.at === 'function' ? e.at(shot.mid) : null); return p && Math.hypot(p[0] - b[0], p[2] - b[2]) < 90; });
      if (!mine) for (let i = 0; i < 6; i++) {
        // 14 to 60 m ahead of where the walk ends, on the axis of the street
        const d = 14 + i * 9.2, hit = M.nearestOnPolyline(b[0] + dir[0] / l * d, b[2] + dir[1] / l * d, pw.polyline);
        const x = hit.x + (hash2(i, 3, 511) - 0.5) * 6, z = hit.z + (hash2(i, 5, 512) - 0.5) * 3;
        out.push({ pos: [x, safe(() => ground.height(x, z), a[1] - 1.7) + 0.2, z], size: 1, low: true });
      }
    }
  } catch (e) { /* no film or no street: no dust */ }
  if (declared.length >= 6) return out;
  const roads = (layout.streets || []).filter((s) => s.cls === 'road' && s.polyline && s.polyline.length > 1);
  const total = roads.reduce((a, s) => a + (s.length || M.polylineLength(s.polyline)), 0);
  if (total > 0) {
    for (let i = 0; i < count; i++) {
      let r = hash2(i, 1, 501) * total, s = roads[0];
      for (const q of roads) { const l = q.length || M.polylineLength(q.polyline); if (r <= l) { s = q; break; } r -= l; }
      const h = M.pointAlong(s.polyline, Math.max(0, r));
      if (Math.hypot(h.x, h.z) > 4200 || safe(() => ground.isWater(h.x, h.z), true)) continue;
      out.push({ pos: [h.x, safe(() => ground.height(h.x, h.z), 0) + 0.3, h.z], size: 0.8 + 0.8 * hash2(i, 2, 502), low: false });
    }
  }
  return out;
}

export { hashPos };
