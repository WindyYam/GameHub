// world.js — access helpers for world.json (the single source of geometry). Read-only: never mutate `world`.
// Available as ctx.W (helpers) and ctx.world (the raw parsed JSON).
import * as M from './mathx.js';

export async function loadWorld(url = './world.json') {
  if (window.__BABYLON_WORLD__) return window.__BABYLON_WORLD__;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`world.json: HTTP ${res.status}`);
  return res.json();
}

/**
 * Plausible floor and top LEVELS (datum y) of a monument from its data.
 * floor = the level people stand on inside it (null if the data has none);
 * top   = wall / roof top level used for massing and clearance tests (null if unknown).
 */
export function monumentLevels(m) {
  const d = m.dims || {};
  const num = (v) => (typeof v === 'number' ? v : null);
  const first = (...vs) => { for (const v of vs) if (num(v) !== null) return v; return null; };
  let floor = first(d.floorLevel, d.courtLevel, d.pavementLevel, d.lowerTerraceLevel, d.terraceLevel, m.baseLevel, d.baseLevel);
  let top = first(d.wallTopLevel, d.wallTop, d.summitLevel, d.top, d.outerWallTop);
  if (top === null && d.wallTopLevel && typeof d.wallTopLevel === 'object') top = first(d.wallTopLevel.north, d.wallTopLevel.east);
  const h = first(d.wallHeight, d.height, d.wall && d.wall.height);
  if (top === null && floor !== null && h !== null) top = floor + h;
  return { floor, top, height: h };
}

/**
 * The one wind of the film (SPEC 3.17 / 3.18: "one wind"): the north-westerly shamal, light. Not in world.json,
 * so it is fixed here for everybody: smoke, dust, flags, reeds, palm fronds, cloth, water ripples.
 * toAzDeg = MODEL azimuth the air moves TOWARD; dir = unit [dx, dz]; speed in m/s at 10 m;
 * gust(t, x, z) = pure multiplier 0.55 .. 1.45 (slow, spatially coherent).
 */
export const WIND = (() => {
  const toAzDeg = 150.8, a = toAzDeg * M.DEG, dir = [Math.sin(a), -Math.cos(a)];
  return Object.freeze({
    toAzDeg, dir: Object.freeze(dir), speed: 2.6,
    gust: (t, x = 0, z = 0) => 1 + 0.3 * Math.sin(0.61 * t - 0.011 * (x * dir[0] + z * dir[1])) + 0.15 * Math.sin(1.73 * t - 0.037 * (x * dir[0] + z * dir[1]) + 1.3),
  });
})();

export function makeWorldHelpers(world) {
  const byId = new Map(world.monuments.map((m) => [m.id, m]));
  const streetById = new Map(world.streets.map((s) => [s.id, s]));
  const gates = world.innerWalls.gates;
  const meta = world.meta;
  const [E0, N0] = meta.originUTM38N;
  const ROT = meta.gridRotationFromTrueNorthDeg; // 15.8
  const enclosures = Object.entries(world.enclosures)
    .filter(([, v]) => Array.isArray(v))
    .map(([name, ring]) => ({ name, ring, bb: M.bbox(ring) }));
  const districts = world.districts.map((d) => ({ d, bb: M.bbox(d.polygon) }));

  const W = {
    world,
    // ---- lookups ---------------------------------------------------------------------------
    /** Monument record by id (throws on unknown id: a typo must not pass silently). */
    monument(id) { const m = byId.get(id); if (!m) throw new Error(`world: no monument '${id}'`); return m; },
    hasMonument: (id) => byId.has(id),
    monuments: world.monuments,
    /** Closed [x, z] ring of a monument footprint. */
    footprint(id) { return W.monument(id).footprint.polygon; },
    monumentLevels,
    /** Inner-wall gate by name ('Ishtar Gate', 'Marduk Gate', ...). */
    gate(name) { const g = gates.find((q) => q.name === name); if (!g) throw new Error(`world: no gate '${name}'`); return g; },
    gates,
    outerGates: world.outerWall.gates,
    street(id) { const s = streetById.get(id); if (!s) throw new Error(`world: no street '${id}'`); return s; },
    moat(id) { const m = world.moats.find((q) => q.id === id); if (!m) throw new Error(`world: no moat '${id}'`); return m; },
    canal(id) { const c = world.canals.find((q) => q.id === id); if (!c) throw new Error(`world: no canal '${id}'`); return c; },
    district(name) { const d = world.districts.find((q) => q.name === name); if (!d) throw new Error(`world: no district '${name}'`); return d; },
    /** A named level from world.levels (datum y). */
    level(name) { const v = world.levels[name]; if (typeof v !== 'number') throw new Error(`world: no level '${name}'`); return v; },
    waterLevel: world.levels.water,
    /** Palette colour as 0xRRGGBB (sRGB). */
    color(id) { const c = world.palette.materials[id]; if (!c) throw new Error(`world: no palette colour '${id}'`); return parseInt(c.slice(1), 16); },
    paletteIds: Object.keys(world.palette.materials),
    shot(idOrN) { return world.shots.list.find((s) => s.id === idOrN || s.n === idOrN); },

    // ---- coordinate helpers ----------------------------------------------------------------
    /** UTM 38N easting/northing -> model [x, z]. */
    utmToModel(E, N) { const dE = E - E0, dN = N - N0; return [0.96363 * dE + 0.26724 * dN, 0.26724 * dE - 0.96363 * dN]; },
    /** model [x, z] -> UTM 38N [E, N] (inverse of the rotation above). */
    modelToUtm(x, z) { return [E0 + 0.96363 * x + 0.26724 * z, N0 + 0.26724 * x - 0.96363 * z]; },
    gridRotationDeg: ROT,
    trueToModelAz: (az) => M.mod(az + ROT, 360),
    modelToTrueAz: (az) => M.mod(az - ROT, 360),
    /** Direction TO the sun/moon [x, y, z] from MODEL azimuth and elevation (degrees). */
    dirFromAzEl: M.dirFromAzEl,
    azToDir: M.azToDir,
    dirToAz: M.dirToAz,
    /** Local point of a footprint {center, rotationDeg} to world [x, z]. rotationDeg is clockwise seen from above. */
    localToWorld: (fp, lx, lz) => M.localToWorld(fp.center, fp.rotationDeg || 0, lx, lz),
    worldToLocal: (fp, x, z) => M.worldToLocal(fp.center, fp.rotationDeg || 0, x, z),
    /** three.js Y rotation (radians) for a clockwise-from-above rotationDeg. */
    rotY: (rotationDeg) => -rotationDeg * M.DEG,

    // ---- containment -----------------------------------------------------------------------
    /** 'innerEast' | 'innerWest' | 'outerCity' | null (inner enclosures win over the outer one). */
    enclosureAt(x, z) {
      let hit = null;
      for (const e of enclosures) {
        if (!M.inBBox(e.bb, x, z) || !M.pointInPolygon(x, z, e.ring)) continue;
        if (e.name !== 'outerCity') return e.name;
        hit = e.name;
      }
      return hit;
    },
    /** District record containing the point, or null. */
    districtAt(x, z) {
      for (const { d, bb } of districts) if (M.inBBox(bb, x, z) && M.pointInPolygon(x, z, d.polygon)) return d;
      return null;
    },
    // ---- inner walls and outer wall: canonical levels and tower layout ------------------------------
    // Shared by _massing, walls (which MUST use them), nightfx (torches) and people (sentries), so that
    // nobody re-derives the raised stretch or the tower positions differently.
    /**
     * Levels (datum y) of the inner double wall beside plan point (x, z) on bank `side` ('east' | 'west'):
     * { walk (Imgur-Enlil wall-walk), parapetTop, frontTop (Nemetti-Enlil top), quayTop (moat quay breastwork),
     *   berm, raised: 0..1 (1 on the raised stretch at the palaces and the Ishtar Gate), s (chainage on innerLine) }.
     * East side, north wall: +29.4 / +25.4 from the palace quay to x = 450, falling linearly to the standard
     * +14 / +10 at x = 650 (SPEC 3.4; walls steps this down tower by tower). Everywhere else the standard profile.
     */
    innerWallLevels(side, x, z) {
      const prof = world.innerWalls.profile, main = prof.imgurEnlil, front = prof.nemettiEnlil, quay = prof.quay;
      const hit = M.nearestOnPolyline(x, z, world.innerWalls[side].innerLine);
      let k = 0;
      if (side === 'east') {
        const rs = world.innerWalls.east.raisedSection, st = rs.heightStations;
        if (hit.s <= raisedNorthLen + 20) k = 1 - M.clamp((x - st[2].x) / (st[3].x - st[2].x));
        const walk = M.lerp(main.walkLevel, rs.mainWalkLevel, k);
        return { walk, parapetTop: walk + main.parapet, frontTop: M.lerp(front.top, rs.frontWallTopLevel, k), quayTop: M.lerp(quay.nebuchadnezzar.top, rs.outside.embankmentTopLevelAtGate, k), berm: M.lerp(prof.berm.level, rs.outside.bermLevelAtGate, k), raised: k, s: hit.s };
      }
      return { walk: main.walkLevel, parapetTop: main.walkLevel + main.parapet, frontTop: front.top, quayTop: quay.nebuchadnezzar.top, berm: prof.berm.level, raised: 0, s: hit.s };
    },
    /**
     * Canonical tower centres of a wall line. which: 'east:main' | 'east:front' | 'east:quay' | 'west:main' |
     * 'west:front' | 'west:quay' | 'outer'. Rule (SPEC 3.4): the spacing is authoritative (27.6 / 20.5 / 48 / 52.5 m);
     * towers are laid out per straight run between corners and gates (a run stops half a gate width short of a
     * gate), n = round(run / spacing) towers at (k + 0.5) / n, alternately large and small starting large.
     * Returns [{ x, z, rotDeg (local +x along the line, +z to the right of travel), out: [dx, dz] (unit, away
     * from the city), big, w (frontage), d (depth), wallTop (walk / wall top level there), top (tower top level),
     * s (chainage on the line), run }].
     */
    wallTowers(which) {
      if (towerCache.has(which)) return towerCache.get(which);
      const [side, kind] = which === 'outer' ? ['outer', 'outer'] : which.split(':');
      const prof = world.innerWalls.profile, ow = world.outerWall;
      let line, spacing, gates, half, dims;
      if (side === 'outer') {
        const t = ow.profile.mudWall.towers;
        line = ow.line; spacing = t.spacingCC; gates = ow.gates; half = (g) => g.width / 2;
        dims = (big) => ({ w: t.width, d: big ? t.depthLarge : t.depthSmall, extra: big ? 5 : 3, wallTop: () => ow.profile.mudWall.top + ow.profile.mudWall.crenellation });
      } else {
        const S = world.innerWalls[side]; if (!S) throw new Error(`world: no wall '${which}'`);
        gates = world.innerWalls.gates;
        if (kind === 'main') { const t = prof.imgurEnlil.towers; line = S.innerLine; spacing = t.moduleCC; half = (g) => g.mainGate.width / 2; dims = (big) => ({ w: t.frontage, d: big ? t.largeDepth : t.smallDepth, extra: big ? t.largeExtraHeight : t.smallExtraHeight, wallTop: (x, z) => W.innerWallLevels(side, x, z).walk }); }
        else if (kind === 'front') { const t = prof.nemettiEnlil.towers; line = S.outerLine; spacing = t.spacingCC; half = (g) => g.foreGate.width / 2; dims = () => ({ w: t.frontage, d: t.depth, extra: t.extraHeight, wallTop: (x, z) => W.innerWallLevels(side, x, z).frontTop }); }
        else if (kind === 'quay') { const t = prof.quay.towers; line = side === 'east' ? S.quayLine.slice(1) : S.quayLine; spacing = t.spacingCC; half = (g) => ((g.causeway && g.causeway.width) || 10) / 2 + 4; dims = () => ({ w: t.width, d: t.projection, extra: 0, wallTop: (x, z) => W.innerWallLevels(side, x, z).quayTop }); }
        else throw new Error(`world: no wall '${which}'`);
      }
      // cut the line into straight runs: at every vertex, and around every gate that sits on this line
      const cuts = [], ch = M.chainage(line), total = ch[ch.length - 1];
      for (const g of gates) {
        const hit = M.nearestOnPolyline(g.x, g.z, line);
        if (hit.dist < 45) cuts.push([hit.s - half(g), hit.s + half(g)]);
      }
      const runs = [];
      for (let i = 0; i < line.length - 1; i++) {
        let spans = [[ch[i], ch[i + 1]]];
        for (const [a, b] of cuts) spans = spans.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, b), q]].filter(([u, v]) => v - u > 1e-6)));
        for (const sp of spans) if (sp[1] - sp[0] >= spacing * 0.5) runs.push(sp);
      }
      const out = [];
      const insideCity = (x, z) => { const e = W.enclosureAt(x, z); return side === 'outer' ? e !== null : e === (side === 'east' ? 'innerEast' : 'innerWest'); };
      runs.forEach(([a, b], run) => {
        const n = Math.max(1, Math.round((b - a) / spacing));
        for (let k = 0; k < n; k++) {
          const s = a + ((k + 0.5) * (b - a)) / n, p = M.pointAlong(line, s), r = M.rightOf(p.dir[0], p.dir[1]), big = k % 2 === 0, dm = dims(big);
          const sign = insideCity(p.x + r[0] * 30, p.z + r[1] * 30) ? -1 : 1, wallTop = dm.wallTop(p.x, p.z);
          out.push({ x: p.x, z: p.z, rotDeg: M.mod(M.dirToAz(p.dir[0], p.dir[1]) - 90, 360), out: [r[0] * sign, r[1] * sign], big, w: dm.w, d: dm.d, wallTop, top: wallTop + dm.extra, s, run });
        }
      });
      void total;
      towerCache.set(which, out);
      return out;
    },

    /** Monument whose footprint polygon contains the point (smallest footprint wins, so a temple inside the precinct wins), or null. */
    monumentAt(x, z) {
      let best = null, bestArea = Infinity;
      for (const m of monIndex) {
        if (!M.inBBox(m.bb, x, z) || !M.pointInPolygon(x, z, m.ring)) continue;
        if (m.area < bestArea) { best = m.m; bestArea = m.area; }
      }
      return best;
    },
  };
  const towerCache = new Map();
  const raisedNorthLen = M.polylineLength(world.innerWalls.east.innerLine.slice(0, 3)); // W end -> Ishtar Gate -> NE corner
  const monIndex = world.monuments.map((m) => ({ m, ring: m.footprint.polygon, bb: M.bbox(m.footprint.polygon), area: Math.abs(M.polygonArea(m.footprint.polygon)) }));
  return W;
}
