// js/modules/southpalace/index.js — the South Palace of Nebuchadnezzar II (SPEC 3.8, R4 section 3).
//   node render.mjs still --shots 3,4 --only terrain,southpalace --q final --sub 4 --label southpalace
// Parts: plan.js (the plan on the palace's own true-cardinal lines), lattice.js (plan -> one closed surface with
// parapets, light wells, door and gate openings), facade.js (the palm-column registers of the throne-room facade),
// enclosure.js (the oblique outer wall, its 60 towers, merlons), dressing.js (stairs, props, awnings, fires).
// Notes and what is conjectural: docs/mod-southpalace.md.
import { hash2 } from '../../core/rng.js';
import { makePlan, K } from './plan.js';
import { buildLattice } from './lattice.js';
import { makeFacadeTexture, FACADE } from './facade.js';
import { buildEnclosure } from './enclosure.js';
import { dress, planFlights } from './dressing.js';

const NEAR = 1500;      // full detail to here, the plain level beyond (no film camera that looks at the palace is between 1.1 and 1.8 km)

export default {
  name: 'southpalace',
  claims: ['monument:southPalace'],

  async build(ctx) {
    const { geom, ground, materials, glazed: G, mathx: M, THREE } = ctx, rng = ctx.module.rng;
    const m = ctx.W.monument('southPalace'), d = m.dims, rot = d.interiorRotationDeg, O = d.courts.main.center;
    const F = d.floorLevel, WT = d.wallTopLevel, TT = d.towerTopLevel, WW = WT - 1.0;         // floor, parapet top of the curtain, of the towers, wall-walk
    const cs = Math.cos(rot * M.DEG), sn = Math.sin(rot * M.DEG);
    const L2W = (x, z) => [O[0] + x * cs - z * sn, O[1] + x * sn + z * cs];
    const W2L = (x, z) => { const dx = x - O[0], dz = z - O[1]; return [dx * cs + dz * sn, -dx * sn + dz * cs]; };
    const P3 = (lx, y, lz) => { const p = L2W(lx, lz); return [p[0], y, p[1]]; };
    const dir3 = (lx, lz) => [lx * cs - lz * sn, 0, lx * sn + lz * cs];                       // a local plan direction as a world vector
    const azOf = (lx, lz) => M.dirToAz(lx * cs - lz * sn, lx * sn + lz * cs);                 // ... as a model azimuth
    let ring = M.openRing(m.footprint.polygon);
    if (M.polygonArea(ring) < 0) ring = ring.slice().reverse();
    { const k = ring.reduce((b, p, i) => (p[0] + p[1] < ring[b][0] + ring[b][1] ? i : b), 0); ring = [...ring.slice(k), ...ring.slice(0, k)]; }   // start at the north-west corner: N, E, S, W sides in turn
    const toLocal = (r) => M.openRing(r).map(([x, z]) => W2L(x, z));
    const env = { ctx, geom, ground, materials, M, THREE, rng, d, F, WT, TT, WW, L2W, W2L, P3, dir3, azOf, ring, NEAR, hash2, rot, O };

    // ---------------------------------------------------------------- plan and lattice
    const gl = W2L(d.mainGate.x, d.mainGate.z), gw = L2W(gl[0] + 1, gl[1]), sill = Math.round((ground.height(gw[0], gw[1]) + 0.05) * 100) / 100;
    const plan = makePlan({
      outline: toLocal(ring), courts: Object.fromEntries(Object.entries(d.courts).map(([k, v]) => [k, toLocal(v.polygon)])),
      throne: toLocal(d.throneRoom.polygon), vault: toLocal(d.vaultedBuilding.polygon),
      westHall: { center: W2L(d.westPrincipalRoom.center[0], d.westPrincipalRoom.center[1]), size: d.westPrincipalRoom.size },
      gate: gl, gateSill: sill, floor: F, wallWalk: WW, rng: rng.fork('plan'), inset: d.wall.thicknessEast + 0.25,
      throneHeight: d.throneRoom.heightAboveCourt, throneDoors: { widths: d.throneRoom.doors, heights: d.throneRoom.doorHeights },
    });
    env.plan = plan;
    const FP = plan.paving, B = plan.blocks;
    let lat = buildLattice(plan, { wallLevel: WW, outLevel: sill - 3 });

    // stair heads on some roofs (stairs were inside: R4 section 8), then the lattice again with them
    const isRoom = (b) => b && b.alive && b.kind === K.ROOF && !b.parent && (b.tag === 'room' || b.tag === 'main' || b.tag === 'guard' || b.tag === 'casemate');
    let stairHeads = 0;
    for (let i = 1, n = B.length; i < n; i++) {
      const b = B[i];
      if (!isRoom(b) || !b.whole || b.tag === 'casemate' || b.x1 - b.x0 < 5.5 || b.z1 - b.z0 < 5.5 || hash2(i, 11, 5) > (b.tag === 'main' ? 0.3 : 0.11)) continue;
      const west = hash2(i, 12, 5) < 0.5, north = hash2(i, 13, 5) < 0.5, x0 = west ? b.x0 + 0.5 : b.x1 - 2.75, z0 = north ? b.z0 + 0.5 : b.z1 - 3.5;
      const h = { id: B.length, kind: K.ROOF, x0, z0, x1: x0 + 2.25, z1: z0 + 3, level: b.level + 2.3, par: 0, tag: 'stairhead', house: b.house, parent: b.id, clipped: false, seed: hash2(i, 14, 5), pieces: [{ x0, z0, x1: x0 + 2.25, z1: z0 + 3 }] };
      B.push(h); b.head = h; stairHeads++;
      plan.open({ axis: 0, at: west ? h.x1 : h.x0, dir: west ? 1 : -1, a0: z0 + 1.05, a1: z0 + 1.95, sill: b.level, h: 1.9, arch: false, depth: 0.7, floor: 'brick' });
    }
    for (const fx of [0.14, 0.82]) {                                           // two on the great roof of the throne room, against its south parapet
      const t = plan.halls.throne, x0 = Math.round((t.x0 + (t.x1 - t.x0) * fx) * 4) / 4, z0 = t.z1 - 4;
      const h = { id: B.length, kind: K.ROOF, x0, z0, x1: x0 + 2.25, z1: z0 + 3, level: t.level + 2.3, par: 0, tag: 'stairhead', house: 0, parent: t.id, clipped: false, seed: fx, pieces: [{ x0, z0, x1: x0 + 2.25, z1: z0 + 3 }] };
      B.push(h); stairHeads++;
      plan.open({ axis: 1, at: z0, dir: -1, a0: x0 + 0.65, a1: x0 + 1.6, sill: t.level, h: 1.9, arch: false, depth: 0.7, floor: 'brick' });
    }
    lat = buildLattice(plan, { wallLevel: WW, outLevel: sill - 3 });
    env.lat = lat;

    // a door for every room that has paved floor before one of its walls: its own light well first, then a great court, then a lane
    const sides = [['N', 1, -1, 'z0'], ['S', 1, 1, 'z1'], ['W', 0, -1, 'x0'], ['E', 0, 1, 'x1']];
    const flights = (env.flights = planFlights(env));
    const underFlight = (axis, at, f) => flights.some((q) => q.wall.axis === axis && Math.abs(q.wall.at - at) < 0.01 && f.u0 < q.wall.u1 && f.u1 > q.wall.u0);
    let doors = 0;
    for (let i = 1; i < B.length; i++) {
      const b = B[i];
      if (!isRoom(b) || !b.whole) continue;
      let best = null;
      for (const [side, axis, dir, key] of sides) {
        const f = lat.floorAlong(b, side); if (!f || f.len < 2.25 || underFlight(axis, b[key], f)) continue;
        const fb = B[f.floorBlock], rank = fb.tag === 'yard' ? (fb.house === b.house ? 100 : 40) : fb.tag.startsWith('court') ? 60 : 20;
        const score = rank + Math.min(8, f.len) + (side === 'N' && b.tag === 'main' ? 30 : 0);
        if (!best || score > best.score) best = { score, side, axis, dir, at: b[key], f, fb };
      }
      if (!best) continue;
      const big = best.fb.tag.startsWith('court'), lane = best.fb.tag === 'lane', w = Math.min(big ? 1.7 : lane ? 1.1 : 1.3, best.f.len - 1), h = big ? 4.1 : lane ? 2.7 : 3.1;
      const c = (best.f.u0 + best.f.u1) / 2 + (hash2(i, 3, 9) - 0.5) * Math.max(0, best.f.len - w - 1.5) * 0.5;
      plan.open({ axis: best.axis, at: best.at, dir: best.dir, a0: c - w / 2, a1: c + w / 2, sill: FP, h, depth: big ? 1.2 : 0.9, back: 'dark', seg: 8 });
      b.door = { side: best.side, axis: best.axis, dir: best.dir, at: best.at, c, w, h, floor: best.fb }; doors++;
    }

    // ---------------------------------------------------------------- the surface
    // one brick material (the palette's bright yellow of new palace work, R4 section 11); the batches of the ordinary rooms are
    // tinted towards buff and light red per room (a tint can only darken)
    const BRICK = 'bakedBrickYellow', brickC = materials.color(BRICK), buffC = materials.color('bakedBrickBuff'), redC = materials.color('bakedBrickRed');
    const toward = (c, k) => [Math.min(1, 1 + (c.r / brickC.r - 1) * k), Math.min(1, 1 + (c.g / brickC.g - 1) * k), Math.min(1, 1 + (c.b / brickC.b - 1) * k)];
    env.BRICK = BRICK;
    const tint = (b) => {
      const s = b.seed, s2 = hash2(b.id, 7, 21), s3 = hash2(b.id, 9, 21), s4 = hash2(b.id, 10, 21), v = 0.88 + 0.12 * s, t = s2 < 0.7 ? toward(buffC, 0.4 + s2) : toward(redC, (s2 - 0.7) * 1.2);
      const monumental = b.tag === 'throne' || b.tag === 'gate' || b.tag === 'gatetower' || b.tag === 'maingate' || b.tag === 'maingatetower' || b.tag === 'divwall' || b.tag === 'hall';
      const brick = monumental ? [1, 1, 1] : [v * t[0], v * t[1], v * t[2]];
      let top;
      if (b.kind === K.FLOOR) { const f = b.tag.startsWith('court') ? 1.0 : b.tag === 'yard' ? 0.9 + 0.1 * s3 : 0.86; top = [f, f, f]; }
      else { const f = s4 < 0.1 ? 0.74 + 0.06 * s3 : 0.84 + 0.16 * s3, w = 0.96 + 0.04 * s2; top = [f, f * w, f * w * w]; }      // rolled mud: older roofs greyer and darker
      return { brick, top };
    };
    const writers = () => ({ brick: geom.writer({ color: true, verts: 4096 }), roof: geom.writer({ color: true, verts: 4096 }), pave: geom.writer({ color: true, verts: 4096 }), door: geom.writer({ color: true }), bronze: geom.writer({ color: true }) });
    const far = writers(), near = writers();
    lat.mesh(far, L2W, { parapets: false, patchRoof: 1 << 20, patchFloor: 1 << 20, patchWall: 1 << 20, vsplit: false, openings: false, tint });
    const st = lat.mesh(near, L2W, { openings: true, tint });
    if (st.missed.length) ctx.module.warn(`${st.missed.length} opening(s) found no wall: ` + st.missed.slice(0, 4).map((o) => `${o.axis}@${o.at} [${o.a0.toFixed(1)}, ${o.a1.toFixed(1)}]`).join('; '));
    const interior = lat.trace((k, i, j) => lat.ID[k] > 0 && plan.outlineDist(lat.X0 + (i + 0.5) * 0.25, lat.Z0 + (j + 0.5) * 0.25) > 0.8).map((loop) => loop.map(([x, z]) => L2W(x, z)));

    // ---------------------------------------------------------------- enclosure, glazed faces, dressing
    const extra = { brick: [], farBrick: [] };
    const enc = buildEnclosure(env, { near, far, extra, interior });
    const glz = glazedFaces();
    const dr = dress(env, { near, extra });

    // ---------------------------------------------------------------- submit
    const paving = materials.variant('courtBrickPaving', { name: 'southpalace-paving', rotDeg: rot, origin: [O[0], O[1]], module: 0.5, joint: 'lime' });
    const doorMat = materials.preset('planks', { name: 'southpalace-doors', vertical: true });
    const nearBrick = geom.merge([near.brick.toGeometry(), ...extra.brick]), farBrick = geom.merge([far.brick.toGeometry(), ...extra.farBrick]);
    const sample = geom.inspect(enc.sample);                                  // one tower as built (the lattice surface is a height field: closed by construction)
    const tris = { brick: geom.triCount(nearBrick), roof: near.roof.triangleCount, paving: near.pave.triangleCount, far: geom.triCount(farBrick) + far.roof.triangleCount + far.pave.triangleCount };
    geom.addLODs(BRICK, [{ geometry: nearBrick, max: NEAR }, { geometry: farBrick, tile: 1024 }]);
    geom.addLODs('roofEarth', [{ geometry: near.roof.toGeometry(), max: NEAR, castShadow: false }, { geometry: far.roof.toGeometry(), tile: 1024, castShadow: false }]);
    geom.addLODs(paving, [{ geometry: near.pave.toGeometry(), max: NEAR, castShadow: false }, { geometry: far.pave.toGeometry(), tile: 1024, castShadow: false }]);
    if (near.door.triangleCount) geom.addStatic(doorMat, near.door.toGeometry(), { castShadow: false, lod: [0, NEAR] });
    if (near.bronze.triangleCount) geom.addStatic('bronze', near.bronze.toGeometry(), { castShadow: false, lod: [0, NEAR] });

    // ---------------------------------------------------------------- the glazed faces (SPEC 4.2: throne-room court facade and inner gate towers only)
    function glazedFaces() {
      const out = { lions: 0, panels: 0, facade: 0 };
      if (!G || !G.panel) return out;
      const COURSE = G.COURSE, lower = [{ type: 'field', courses: 4, ground: 'glazeBlue' }, { type: 'checker' }, { type: 'rosette' }, { type: 'checker' }];
      const lionBands = (width, facing, n) => [...lower, { type: 'figures', figure: 'lionUp', courses: 13, items: Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) * width) / n, facing, variant: 0 })) }, { type: 'checker' }, { type: 'rosette' }, { type: 'checker' }];
      // the throne-room facade: the south wall of the Main Courtyard, looking (palace) north; a viewer facing it has west on his right
      const T = plan.throne, mc = plan.courts.main, zf = T.z0 - 0.03, right = dir3(-1, 0), up = [0, 1, 0], lowH = 39 * COURSE, decH = lowH + FACADE.height;
      const facadeMat = materials.variant('glazeBlue', { name: 'southpalace-throne-facade', map: makeFacadeTexture(THREE, { draft: ctx.quality.draft }), color: 0xffffff, roughness: 0.3, polygonOffset: 1 });
      const quads = [], cx = (mc.x0 + mc.x1) / 2, edges = [mc.x0, ...T.doors.flatMap((o) => [o.a0, o.a1]), mc.x1];
      for (let i = 0; i < edges.length; i += 2) {
        const xa = edges[i], xb = edges[i + 1], w = xb - xa, n = Math.max(1, Math.floor(w / 2.12)), facing = (xa + xb) / 2 < cx ? 'L' : 'R';
        const p = G.panel({ origin: P3(xb, FP, zf), right, width: w, bands: lionBands(w, facing, n), seed: 40 + i });
        G.addPanel(p, { switchAt: 150 }); out.lions += n; out.facadeLions = (out.facadeLions || 0) + n; out.panels++;
        const u0 = 0.5 - w / FACADE.width / 2;
        quads.push({ origin: P3(xb, FP + lowH, zf), right, up, width: w, height: FACADE.height, uv: [u0, 0, u0 + w / FACADE.width, 1] });
      }
      geom.addStatic(facadeMat, geom.quads(quads), { castShadow: false });
      out.facade = +(mc.x1 - mc.x0).toFixed(2); out.decorated = +decH.toFixed(2);
      // plain blue bricks round the arches up to the top of the decorated zone
      for (const o of T.doors) {
        const w = o.a1 - o.a0, r = w / 2, sp = o.h - r, origin = P3(o.a1, FP, zf);
        if (o.h < decH - 0.2) {
          const pts = [[0, sp], [0, decH], [w, decH], [w, sp]];
          for (let q = 0; q <= 20; q++) { const a = (Math.PI * q) / 20; pts.push([r + r * Math.cos(a), sp + r * Math.sin(a)]); }
          geom.addStatic(G.material, G.fieldShape({ origin, right, ring: pts, seed: 61 }), { castShadow: false });
        } else if (sp < decH) {
          const a1 = Math.asin((decH - sp) / r), xl = r - r * Math.cos(a1), left = [[0, sp], [0, decH], [xl, decH]], rightP = [[w - xl, decH], [w, decH], [w, sp]];
          for (let q = 7; q >= 1; q--) { const a = (a1 * q) / 8; left.push([r - r * Math.cos(a), sp + r * Math.sin(a)]); }
          for (let q = 1; q <= 7; q++) { const a = (a1 * q) / 8; rightP.push([r + r * Math.cos(a), sp + r * Math.sin(a)]); }
          for (const [k, pts] of [left, rightP].entries()) geom.addStatic(G.material, G.fieldShape({ origin, right, ring: pts, seed: 62 + k }), { castShadow: false });
        }
      }
      // the gate towers between the eastern courts: blue fronts with a lion, blue flanks; they look (palace) east
      for (const g of [plan.gate1, plan.gate2]) for (const t of g.towers) {
        if (!t) continue;
        const h = Math.floor((t.level + t.par - FP) / COURSE) * COURSE, w = t.z1 - t.z0, north = t.z1 < plan.axisZ, n = w > 5 ? 2 : 1;
        G.addPanel(G.panel({ origin: P3(t.x1 + 0.03, FP, t.z1), right: dir3(0, -1), width: w, height: h, bands: lionBands(w, north ? 'L' : 'R', n), seed: 80 + t.id }), { switchAt: 150 });
        out.lions += n; out.panels++;
        const side = [G.quad('course:glazeBlue', P3(t.x1, FP, t.z0 - 0.03), dir3(-1, 0), up, { width: t.x1 - t.x0, height: h }), G.quad('course:glazeBlue', P3(t.x0, FP, t.z1 + 0.03), dir3(1, 0), up, { width: t.x1 - t.x0, height: h })];
        geom.addStatic(G.material, geom.merge(side), { castShadow: false });
      }
      return out;
    }

    // ---------------------------------------------------------------- numbers
    const sideLen = ring.map((p, i) => Math.hypot(ring[(i + 1) % 4][0] - p[0], ring[(i + 1) % 4][1] - p[1]));
    const want = [d.sides.N, d.sides.E, d.sides.S, d.sides.W], area = Math.abs(M.polygonArea(ring));
    const rooms = B.filter((b) => b && b.alive && b.kind === K.ROOF && !b.parent && b.tag !== 'vcorr').length;
    const wells = B.filter((b) => b && b.alive && b.tag === 'yard' && b.cells * 0.0625 > 12).length;
    const courtIds = Object.keys(plan.courts);
    const worldRing = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([x, z]) => L2W(x, z));
    const T = plan.throne, facadeAz = azOf(0, -1);
    const stats = { triangles: tris, rooms, lightWells: wells, houses: plan.houses.length, doors, stairHeads, openings: st.openings, towers: enc.towers, merlons: enc.merlons, glazed: glz, dressing: dr.stats, emitters: dr.emitters + enc.torches, outworks: { gardenWall: enc.gardenWall, canalLining: enc.canalLining, terrainSpursCovered: 0 }, surface: { tops: st.tops, wallPieces: st.walls } };
    const near1 = (a, b, tol) => Math.abs(a - b) <= tol;
    const checks = [
      { name: 'South Palace sides N / E / S / W (m)', value: sideLen.map((v) => +v.toFixed(1)).join(' / '), expect: want.join(' / ') + ' (SPEC 9.2)', pass: sideLen.every((v, i) => near1(v, want[i], 1.5)) },
      { name: 'enclosure area (m2)', value: Math.round(area), expect: 'within 3 % of ' + m.footprint.areaM2, pass: Math.abs(area / m.footprint.areaM2 - 1) < 0.03 },
      { name: 'towers on the south, east and eastern half of the north side', value: enc.towers, expect: d.wall.towers + ' +/- 2, none on the west', pass: Math.abs(enc.towers - d.wall.towers) <= 2 && enc.bySide.W === 0 },
      { name: 'tower spacing S / E / N (m)', value: enc.spacing.map((v) => +v.toFixed(2)).join(' / '), expect: 'about ' + d.wall.towerSpacingCC, pass: enc.spacing.every((v) => near1(v, d.wall.towerSpacingCC, 0.5)) },
      { name: 'great courts', value: courtIds.length, expect: 5, pass: courtIds.length === 5 },
      { name: 'rooms / light wells', value: rooms + ' / ' + wells, expect: 'about ' + d.rooms + ' / ' + d.smallCourtyardHouses, pass: rooms > d.rooms * 0.75 && rooms < d.rooms * 1.3 && wells > d.smallCourtyardHouses * 0.7 && wells < d.smallCourtyardHouses * 1.5 },
      { name: 'throne room: south of the Main Courtyard, facade looks north (true azimuth, deg)', value: +ctx.W.modelToTrueAz(facadeAz).toFixed(1), expect: '0 (model ' + rot + ')', pass: T.z0 === plan.courts.main.z1 && near1(facadeAz, rot, 0.01) },
      { name: 'throne block height above the court (m)', value: +(plan.halls.throne.level + plan.halls.throne.par - F).toFixed(1), expect: d.throneRoom.heightAboveCourt, pass: near1(plan.halls.throne.level + plan.halls.throne.par - F, d.throneRoom.heightAboveCourt, 0.5) },
      { name: 'throne facade length / decorated height (m), lions', value: `${glz.facade} / ${glz.decorated} / ${glz.facadeLions}`, expect: `${d.throneRoom.facade.length}-55 / ${d.throneRoom.facade.decoratedHeight} / ${d.throneRoom.facade.lions} +/- 1`, pass: !glz.facade || (glz.facade >= 53 && glz.facade <= 55.5 && near1(glz.decorated, d.throneRoom.facade.decoratedHeight, 0.3) && near1(glz.facadeLions, d.throneRoom.facade.lions, 1)) },
      { name: 'wall top / tower top (datum)', value: WT + ' / ' + TT, expect: '23 / 25.5', pass: WT === d.wallTopLevel && TT === d.towerTopLevel },
      { name: 'merlon height (m)', value: enc.merlonHeight, expect: '< 1', pass: enc.merlonHeight < 1 },
      { name: 'openings cut', value: st.openings + ' of ' + plan.openings.length, expect: 'all', pass: st.missed.length === 0 },
      { name: 'tower shell: open edge above the foot (m) / flipped / overlap (m2)', value: `${+sample.openAbove.toFixed(2)} / ${sample.flipped} / ${+sample.overlap.toFixed(3)}`, expect: '0 / 0 / 0', pass: sample.openAbove < 0.01 && sample.flipped === 0 && sample.overlap < 0.001 },
    ];
    const group = ctx.module.group;
    let spurs = false;
    return {
      /** Nothing here moves. The first call (the warm-up frame, after every module has built) hides the terrain's spurs at the wall foot. */
      update() { if (spurs) return; spurs = true; const mesh = enc.coverSpurs(); if (mesh) { group.add(mesh); stats.outworks.terrainSpursCovered = mesh.userData.count; } },
      stats, checks,
      api: {
        floor: F, paving: FP, rotationDeg: rot, toWorld: L2W, toLocal: W2L,
        courts: courtIds.map((id) => ({ id, level: FP, ring: id === 'east' ? worldRing({ x0: plan.courts.east.x0, z0: plan.courts.east.z0, x1: plan.courts.east.steps[0].x1, z1: plan.courts.east.z1 }) : worldRing(plan.courts[id]) })),
        lightWells: B.filter((b) => b && b.alive && b.whole && b.tag === 'yard').map((b) => ({ level: FP, ring: worldRing(b) })),
        gate: { x: d.mainGate.x, z: d.mainGate.z, sill, facingDeg: azOf(1, 0) },
      },
    };
  },
};
