// js/modules/waterbodies.js — the water SURFACES of world.json (SPEC 3.2, 3.3): the Euphrates, the four moats,
// the three inner canals and the five conjectural main canals of the countryside. OWNER: water engineer.
// Surfaces only: beds, banks, quays, levees and culverts belong to terrain / walls / riverworks.
// Everything goes through ctx.water.addSurface (docs/water.md); the look is the water subsystem's.
import * as M from '../core/mathx.js';

export default {
  name: 'waterbodies',
  claims: ['water'],
  async build(ctx) {
    const { world, water, ground } = ctx;
    const WL = water.level;
    const river = world.river, checks = [], stats = {};

    // ---- Euphrates: the polygon inside the city is authoritative; ripples drift down the centreline ----------
    const riverLevel = river.waterLevel ?? WL;
    water.addSurface({ id: 'river', kind: 'river', polygon: river.polygon, centerline: river.centerline, level: riverLevel, flowSpeed: 0.75 });
    // beyond the ends of the polygon the river goes on to the fog (hidden under the ground wherever no bed is cut)
    const cl = river.centerline, ext = 6000;
    for (const [name, a, b] of [['north', cl[1], cl[0]], ['south', cl[cl.length - 2], cl[cl.length - 1]]]) {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const p0 = [b[0] - (dx / l) * 30, b[1] - (dz / l) * 30], p1 = [b[0] + (dx / l) * ext, b[1] + (dz / l) * ext];
      water.addSurface({
        id: 'river-' + name, kind: 'river', ribbon: { polyline: name === 'north' ? [p1, p0] : [p0, p1], width: b[2] + 6 },
        level: riverLevel - 0.02, flowSpeed: 0.75, shore: false,
      });
    }

    // ---- moats: 80 m sheets of nearly still water, 3 cm under the river so the mouths never z-fight -----------
    for (const m of world.moats) water.addSurface({ id: m.id, kind: 'moat', polygon: m.polygon, level: (m.waterLevel ?? WL) - 0.03 });

    // ---- canals ---------------------------------------------------------------------------------------------
    // Every canal stands on the single water plane (5 cm under it, so mouths never z-fight) in the channel that the
    // ground model cuts: the bank crosses the water plane at the canal's nominal width. Where the ground leaves
    // the canal uncut (culverts under the Processional Way and the walls, the far ends where the channel fades
    // out) there is no surface. Only if the ground model cuts no channel at all for a canal (the stub ground) is it
    // painted 0.25 m above the land like the massing, so that it can be seen.
    let canalLength = 0, canalSurfaces = 0;
    const painted = [], canalIds = new Set();
    const cut = ground.canals ? new Map(ground.canals.map((q) => [q.id, q])) : new Map();     // optional: what the real ground model cut
    for (const c of world.canals) {
      const gc = cut.get(c.id);
      const src = gc && Array.isArray(gc.polyline) && gc.polyline.length >= 2 ? gc.polyline : c.polyline;       // (the ground starts outer canals ON the water they take off from)
      const lined = c.waterLevel !== undefined;
      const target = (c.waterLevel ?? WL) - 0.05;
      const line = M.resamplePolyline(src, lined ? Math.max(4, c.width * 1.5) : 20);
      const xPW = c.widthEastOfPW && c.crossingAtPW ? c.crossingAtPW.point[0] : null;
      const widthAt = (p) => (xPW !== null && p[0] > xPW + 1 ? c.widthEastOfPW : c.width);
      // cut = the ground lies under the water here AND it is the canal's own channel (inside the river or a moat
      // their surface is the water: a canal has none there)
      const isCut = line.map((p) => { if (!(ground.height(p[0], p[1]) < target - 0.25)) return false; const zn = ground.zone(p[0], p[1]).zone; return zn !== 'river' && zn !== 'moat'; });
      const flowSpeed = lined ? 0.12 : 0.3;
      canalLength += M.polylineLength(c.polyline);
      if (!isCut.some(Boolean)) {
        const lv = line.map((p) => Math.max(ground.height(p[0], p[1]), WL) + 0.25);
        water.addSurface({ id: c.id, kind: 'canal', ribbon: { polyline: line, widths: line.map(widthAt) }, level: lv, flowSpeed });
        painted.push(c.id); canalSurfaces++; canalIds.add(c.id);
        continue;
      }
      // one flat surface per cut stretch; it runs one sample into the uncut ground at both ends (hidden there)
      let run = 0;
      for (let i = 0; i < line.length; i++) {
        if (!isCut[i]) continue;
        let j = i; while (j + 1 < line.length && isCut[j + 1]) j++;
        const a = Math.max(0, i - 1), b = Math.min(line.length - 1, j + 1), part = line.slice(a, b + 1);
        if (part.length >= 2) {
          water.addSurface({
            id: run ? `${c.id}#${run + 1}` : c.id, kind: 'canal', level: target, flowSpeed,
            ribbon: { polyline: part, widths: part.map(widthAt), margin: 1.5 },     // the mesh tucks 1.5 m under both banks
            foam: c.width >= 8,                                                      // no foam line in the narrow brick channel
          });
          run++; canalSurfaces++; canalIds.add(c.id);
        }
        i = j;
      }
    }

    // ---- bridge piers: an outline for the foam line and a wake in the current behind each one ---------------
    // (riverworks owns the pier geometry and may replace an outline with water.addObstacle(ring, { id: 'bridge:pier<n>' }))
    const br = world.bridge;
    if (br && br.piers) {
      const along = br.pierSize.alongStream, across = br.pierSize.alongBridge, bow = br.pierBowAzimuthDeg ?? 10.8;
      const [bx, bz] = M.azToDir(bow), rx = -bz, rz = bx;                     // bow points upstream
      // boat-shaped: pointed bow, slightly rounded stern (local: l along the bow axis, w across)
      const shape = [[0.5, 0], [0.16, 0.5], [-0.36, 0.5], [-0.47, 0.34], [-0.5, 0], [-0.47, -0.34], [-0.36, -0.5], [0.16, -0.5]];
      for (const p of br.piers) {
        if (water.addObstacle) water.addObstacle(shape.map(([l, w]) => [p.x + bx * l * along + rx * w * across, p.z + bz * l * along + rz * w * across]), { id: 'bridge:pier' + p.n });
        water.addWake({ id: 'bridge:pier' + p.n, kind: 'pier', at: () => ({ x: p.x, z: p.z, headingDeg: bow, speed: 0 }), width: across * 0.9, hull: along, length: 70, strength: 0.55 });
      }
      stats.piers = br.piers.length;
    }

    // ---- checks (SPEC section 9: river and moat widths, level, direction of flow) -----------------------------
    // (the frozen stub of the water subsystem has no stats / flowAt / addObstacle: the module still builds with it)
    const kinds = {}; let tris = 0;
    for (const q of water.surfaces) { kinds[q.kind] = (kinds[q.kind] || 0) + 1; const g = q.mesh.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
    const s = { surfaces: water.surfaces.length, kinds, triangles: tris };
    stats.surfaces = s.surfaces; stats.triangles = s.triangles; stats.canalKm = +(canalLength / 1000).toFixed(1); stats.waterImpl = water.impl; stats.canalSurfaces = canalSurfaces; stats.canalsPaintedOnUncutGround = painted.length;
    const near = (v, e, tol) => Math.abs(v - e) <= tol;
    // width of the river polygon along the bridge axis
    const axis = M.azToDir(br.axisAzimuthDeg);
    let w0 = 0, w1 = 0;
    for (let d = 0; d < 200; d += 0.5) { if (ground.isWater(br.x + axis[0] * d, br.z + axis[1] * d) || M.pointInPolygon(br.x + axis[0] * d, br.z + axis[1] * d, river.polygon)) w0 = d; else break; }
    for (let d = 0; d < 200; d += 0.5) { if (M.pointInPolygon(br.x - axis[0] * d, br.z - axis[1] * d, river.polygon)) w1 = d; else break; }
    checks.push({ name: 'river width at the bridge (m)', value: +(w0 + w1).toFixed(1), expect: `${br.length} +/- 3`, pass: near(w0 + w1, br.length, 3) });
    if (water.flowAt) {
      const fl = water.flowAt(br.x, br.z - 60);
      checks.push({ name: 'river flows north -> south (vz at the bridge, m/s)', value: +fl.vz.toFixed(2), expect: '0.4 .. 1.0', pass: fl.vz > 0.4 && fl.vz <= 1.0 });
    }
    checks.push({ name: 'water plane level', value: water.heightAt(br.x, br.z - 60, 0), expect: '-3 +/- 0.1', pass: near(water.heightAt(br.x, br.z - 60, 0), -3, 0.1) });
    checks.push({ name: 'moat surfaces', value: s.kinds.moat || 0, expect: world.moats.length, pass: (s.kinds.moat || 0) === world.moats.length });
    checks.push({ name: 'canals with a water surface', value: canalIds.size, expect: world.canals.length, pass: canalIds.size === world.canals.length });
    // canals in a cut channel stand on the water plane (never above their banks, never as a plank across a moat)
    const high = water.surfaces.filter((q) => q.kind === 'canal' && !painted.includes(q.id.split('#')[0]) && Math.abs(q.levelRef - (WL - 0.05)) > 0.011).length;
    checks.push({ name: 'canal surfaces in a cut channel off the water plane', value: high, expect: 0, pass: high === 0 });
    // the water reaches every corner of the moat and river polygons (sampled 0.3 m inside every vertex)
    let missed = 0, tested = 0;
    for (const ring of [river.polygon, ...world.moats.map((m) => m.polygon)]) {
      const o = M.openRing(ring), n = o.length;
      for (let i = 0; i < n; i++) {
        const p = o[i], a = o[(i + n - 1) % n], b = o[(i + 1) % n];
        const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1, lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
        let dx = (a[0] - p[0]) / la + (b[0] - p[0]) / lb, dz = (a[1] - p[1]) / la + (b[1] - p[1]) / lb; const l = Math.hypot(dx, dz);
        if (l < 1e-6) continue;                                                           // a straight run: no corner
        dx /= l; dz /= l;
        let x = p[0] + dx * 0.3, z = p[1] + dz * 0.3;                                     // along the bisector, on the inner side
        if (!M.pointInPolygon(x, z, ring)) { x = p[0] - dx * 0.3; z = p[1] - dz * 0.3; if (!M.pointInPolygon(x, z, ring)) continue; }
        tested++; if (!covered(ctx, x, z)) missed++;
      }
    }
    checks.push({ name: 'polygon corners covered by a water mesh', value: tested - missed, expect: tested, pass: missed === 0 });

    return { stats, checks, api: { riverLevel, surfaces: water.surfaces.map((q) => q.id) } };
  },
};

/** Is plan point (x, z) under a triangle of some water mesh? (cheap: only used by the self-test) */
function covered(ctx, x, z) {
  for (const s of ctx.water.surfaces) {
    const g = s.mesh.geometry, P = g.attributes.position.array, I = g.index ? g.index.array : null, n = I ? I.length : P.length / 3;
    const bb = g.boundingBox || (g.computeBoundingBox(), g.boundingBox);
    if (x < bb.min.x || x > bb.max.x || z < bb.min.z || z > bb.max.z) continue;
    for (let i = 0; i < n; i += 3) {
      const a = I ? I[i] : i, b = I ? I[i + 1] : i + 1, c = I ? I[i + 2] : i + 2;
      const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
      if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || z < Math.min(az, bz, cz) || z > Math.max(az, bz, cz)) continue;
      const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz), d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz), d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
  }
  return false;
}
