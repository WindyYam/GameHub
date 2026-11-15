// geom/showcase.js — DEBUG scene of the geometry toolkit (not part of the film). Switched on by a URL flag:
//   ?geomshow=showcase | stress | all            (browser)
//   node render.mjs still --with geom-showcase ... / --with geom-stress ...   (harness; the loader prints one
//   harmless warning that no module of that name exists: the scene is built by the geom subsystem itself)
// showcase: every builder of the kit on a paved platform in the open plain at SHOW (x -9000, z 4000), fronts
//           facing west (three-quarter golden light). Cameras: docs/geom.md.
// stress:   20,000 unique courtyard houses in three levels of detail and 1,000 parapeted wall towers with
//           stepped merlons around them, centred on STRESS (x -9000, z 7500). The report (build time, triangles,
//           draw calls) is written to window.STATS.geomShowcase.
// OWNER: geometry engineer.
import * as M from '../mathx.js';
import { hash2 } from '../rng.js';

export const SHOW = [-9000, 4000], STRESS = [-9000, 7500];

export function buildShowcase(ctx, show) {
  const report = {};
  if (show.showcase) report.showcase = buildKit(ctx);
  if (show.stress) report.stress = buildStress(ctx);
  return report;
}

// ================================================================================================
function buildKit(ctx) {
  const { geom, materials, ground, THREE } = ctx, kit = geom.kit, t0 = performance.now();
  const [OX, OZ] = SHOW;
  let Y = -Infinity;
  for (let i = -3; i <= 3; i++) for (let j = -4; j <= 4; j++) Y = Math.max(Y, ground.height(OX + i * 60, OZ + j * 80));
  Y = Math.ceil(Y * 2) / 2 + 0.5;                                          // platform level
  const P = (lx, lz) => [OX + lx, OZ + lz];                                // local -> world (no rotation: fronts face west, -x)
  const rect = (lx, lz, sx, sz, rot = 0) => M.rectRing(OX + lx, OZ + lz, sx, sz, rot);
  const WEST = 270;
  const pending = new Map();
  const put = (mat, g, opts) => { if (opts) { geom.addStatic(mat, g, opts); return; } let a = pending.get(mat); if (!a) pending.set(mat, (a = [])); a.push(g); };
  const flush = () => { for (const [mat, list] of pending) geom.addStatic(mat, geom.merge(list)); pending.clear(); };

  // platform: a paved slab with a slab pattern laid on it as decals (polygon offset)
  put('courtBrickPaving', geom.prism(rect(40, 0, 400, 720), Y - 3, Y));
  const lime = [], brec = [];
  for (let k = 0; k < 9; k++) { const lz = -340 + k * 85; lime.push(geom.decal(rect(-52, lz, 10.5, 60), Y, { lift: 0.02 })); for (const s of [-1, 1]) brec.push(geom.decal(rect(-52 + s * 6.6, lz, 2.64, 60), Y, { lift: 0.02 })); }
  geom.addDecal('limestone', geom.merge(lime)); geom.addDecal('breccia', geom.merge(brec));

  // ---- A. primitives -----------------------------------------------------------------------------
  let z = -300;
  put('bakedBrickBuff', geom.box({ x: OX + 4, z: OZ + z, y0: Y - 0.5, y1: Y + 6, sx: 8, sz: 8 }));
  put('bakedBrickBuff', geom.box({ x: OX + 4, z: OZ + z + 13, y0: Y - 0.5, y1: Y + 8, sx: 8, sz: 8, batter: 0.12, bottom: false }));
  const hex = []; for (let i = 0; i < 6; i++) hex.push([OX + 5 + 6 * Math.cos(i * M.TAU / 6), OZ + z + 30 + 6 * Math.sin(i * M.TAU / 6)]);
  put('mudPlaster', geom.prism(hex, Y - 0.5, Y + 5, { holes: [rect(5, z + 30, 4, 4, 20)] }));
  put('streetEarth', geom.cap(rect(5, z + 30, 4, 4, 20), Y + 0.06));
  // glazed relief panels: quads with a UV rectangle from the relief atlas
  put('bakedBrickYellow', geom.wall([P(0, z + 42), P(0, z + 60)], { thickness: 1.2, base: Y - 0.5, top: Y + 4.2, offset: 0.6 }));
  try {
    const panels = [];
    ['bull', 'dragon', 'lion'].forEach((name, i) => { const r = ctx.glazed.rect(name, 'L', i % 2); panels.push({ origin: [OX - 0.03, Y + 1.3, OZ + z + 43.5 + i * 5.2], right: [0, 0, 1], up: [0, 1, 0], width: r.widthM, height: r.heightM, uv: [r.u0, r.v0, r.u1, r.v1] }); });
    geom.addStatic(ctx.glazed.materialFor('bull'), geom.quads(panels), { castShadow: false, ao: false });
  } catch (e) { console.warn('[geom showcase] no glazed panels: ' + e.message); }
  // custom buffers: a small stepped altar from raw positions
  const alt = [];
  const blockTris = (x0, x1, y0, y1, z0, z1) => { const q = (a, b, c, d) => alt.push(...a, ...b, ...c, ...a, ...c, ...d); const p = (x, y, zz) => [OX + x, y, OZ + zz];
    q(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)); q(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0)); q(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)); q(p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1)); q(p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0)); };
  blockTris(-14, -10, Y - 0.3, Y + 0.6, z + 8, z + 12); blockTris(-13.3, -10.7, Y + 0.6, Y + 1.1, z + 8.7, z + 11.3); blockTris(-12.7, -11.3, Y + 1.1, Y + 1.5, z + 9.3, z + 10.7);
  put('bakedBrickRed', geom.custom({ position: alt }));

  // ---- B. curtain wall: foot follows the ground, battered, stepped top, parapeted towers, merlons ----
  z = -215;
  const line = [0, 1, 2, 3, 4].map((k) => P(8, z + k * 27.6)), levelOf = (zz) => Y + 14 - Math.max(0, Math.min(3, Math.floor((zz - OZ - z) / 27.6)) - 1) * 2.2;
  const topAt = (x, zz) => levelOf(zz);                      // level per 27.6 m bay: the wall steps down tower by tower
  put('mudPlaster', geom.wall(line, { thickness: 6.5, base: Y - 1, top: topAt, stepped: true, batter: 0.03 }));
  for (let k = 0; k < 4; k++) {
    const a = P(8, z + k * 27.6), b = P(8, z + (k + 1) * 27.6), lv = levelOf((a[1] + b[1]) / 2);
    put('mudPlaster', geom.wall([a, b], { thickness: 0.9, offset: 2.8, base: lv, top: lv + 1.0 }));       // parapet of the wall-walk
    geom.addMerlons('mudPlaster', [a, b], { y: lv + 1.0, offset: 2.8, pitch: 1.3, width: 0.8, thickness: 0.6 });      // default height 0.9 m (SPEC: under 1 m)
  }
  for (let k = 0; k < 4; k++) {
    const tz = z + 13.8 + k * 27.6, big = k % 2 === 0, wt = topAt(OX + 8, OZ + tz) + (big ? 6 : 3);
    geom.addWallTower('mudPlaster', { x: OX + 8, z: OZ + tz, w: big ? 11.4 : 8.06, d: 9.5, rotDeg: 0, base: Y - 1, top: wt, parapet: 1.0, batter: 0.03 }, { merlons: 'mudPlaster', merlon: { thickness: 0.5 } });
  }

  // ---- C. temple: niched block (stepped recesses), frieze, merlons, tower-flanked gateway ------------
  z = -85;
  const temple = rect(26, z + 22, 40, 44), court = rect(27, z + 22, 16, 18);
  put('templePlasterWhite', geom.nichedPrism(temple, Y - 1, Y + 10, { bay: 4.4, nicheWidth: 1.5, nicheDepth: 0.55, steps: 2, stepWidth: 0.28, socle: 1.9, frieze: 1.3, holes: [court], top: false }));
  put('templePlasterWhite', geom.wall(M.openRing(temple), { closed: true, thickness: 0.6, offset: (M.polygonArea(temple) > 0 ? 1 : -1) * 0.3, base: Y + 10, top: Y + 10.9 }));
  put('roofEarth', geom.cap(geom.insetRing(temple, 0.6), Y + 10, { holes: [court] }), { castShadow: false });
  put('courtBrickPaving', geom.cap(court, Y + 0.05), { castShadow: false });
  geom.addMerlons('templePlasterWhite', M.closeRing(geom.insetRing(temple, 0.3)), { y: Y + 10.9, pitch: 1.2, width: 0.75, height: 0.95, thickness: 0.5 });
  const gw = geom.gateway({ x: OX + 6 - 1.2, z: OZ + z + 22, facingDeg: WEST, width: 15, depth: 4.4, base: Y - 1, floor: Y, top: Y + 11.4, towerWidth: 4.4, towerDepth: 4.6, towerProjection: 1.4, towerTop: Y + 13.6, door: { width: 3.0, height: 6.2, arch: true }, rebates: 3 });
  put('templePlasterWhite', gw.geometry);
  for (const ml of gw.merlonLines) geom.addMerlons('templePlasterWhite', ml.line, { y: ml.y, pitch: 1.2, width: 0.75, height: 0.95, thickness: 0.5 });
  put('cedar', geom.box({ x: OX + 6 - 1.2 + 1.4, z: OZ + z + 22, y0: Y, y1: Y + 6.2, sx: 0.3, sz: 3.0 }));      // door leaves, deep in the passage

  // ---- D. stage tower: battered, niched stages, a stair with true risers and parapets, a ramp ----------
  z = 0;
  const cx = 34, cz = z + 24;
  let y0 = Y;
  for (const [side, h, n] of [[46, 12, 7], [36, 5.5, 5], [27, 5, 4]]) {
    put('bakedBrickBuff', geom.nichedPrism(rect(cx, cz, side, side), y0 - (y0 === Y ? 1 : 0), y0 + h, { bay: side / n, nicheWidth: 2.3, nicheDepth: 0.65, socle: y0 === Y ? 1.6 : 0.4, frieze: 1.2, batter: 1 / 18 }));
    y0 += h;
  }
  put('glazeBlue', geom.nichedPrism(rect(cx, cz, 14, 13), y0, y0 + 8, { bay: 3.5, nicheWidth: 1.1, nicheDepth: 0.4, socle: 0.5, frieze: 0.9 }));
  const steps = Math.round(12 / 0.174), run = steps * 0.331;
  put('bakedBrickYellow', geom.stairs({ x: OX + cx - 23 + 0.7 - run, z: OZ + cz, azDeg: 90, width: 9, steps, riser: 12 / steps, tread: 0.331, base: Y, sink: 0.8, parapet: { height: 1.0, thickness: 0.6 } }));
  put('bakedBrickYellow', geom.ramp({ x: OX - 14, z: OZ + z + 58, azDeg: 90, width: 5, length: 24, rise: 4.4, base: Y, sink: 0.5 }));
  put('bakedBrickYellow', geom.box({ x: OX + 15, z: OZ + z + 58, y0: Y - 0.5, y1: Y + 4.4, sx: 10, sz: 5 }));

  // ---- E. gate: arched passage (semicircular vault) through a thick wall, rebated reveals ------------
  z = 82;
  put('glazeBlue', geom.passageBlock({ x: OX + 9, z: OZ + z + 20, rotDeg: WEST, width: 22, depth: 13, base: Y - 1, floor: Y, top: Y + 14.5, door: { width: 4.5, height: 11.9 }, rebates: 2, rebatesBack: 1 }));
  for (const s of [-1, 1]) {
    put('glazeBlueDark', geom.nichedPrism(rect(5.5, z + 20 + s * 8.4, 9, 6.2), Y - 1, Y + 18.5, { bay: 6.2, nicheWidth: 0, nicheDepth: 0, grooves: { count: 2, width: 0.4, depth: 0.3, gap: 1.6 }, socle: 1.1 + 1, frieze: 1.2, edges: [3] }));
    put('mudPlaster', geom.archedWall({ a: P(11, z + 20 + s * 10.5), b: P(11, z + 20 + s * 34), thickness: 3.7, base: Y - 1, floor: Y, top: Y + 10, door: { width: 1.6, height: 2.6, at: 0.55 } }));
    geom.addMerlons('glazeBlue', M.closeRing(geom.insetRing(rect(5.5, z + 20 + s * 8.4, 9, 6.2), 0.3)), { y: Y + 18.5, pitch: 1.1, width: 0.66, height: 0.9, thickness: 0.45 });
  }
  geom.addMerlons('glazeBlue', [P(2.8, z + 20 - 5.2), P(2.8, z + 20 + 5.2)], { y: Y + 14.5, pitch: 1.1, width: 0.66, height: 0.9, thickness: 0.45 });

  // ---- F. courtyard houses: six variants in the three levels of detail --------------------------------
  z = 150;
  const tones = ['mudPlaster', 'mudPlasterSunlit', 'mudPlasterWeathered', 'mudPlasterReddish', 'limewash', 'mudPlasterGrey'].map((id) => geom.toRGB(materials.color(id)));
  const roofAbs = geom.toRGB(materials.color('roofEarth')), wallMat = materials.variant('mudPlaster', { color: 0xffffff, name: 'house-walls' });
  const variants = [];
  const mk = (lz, w, d, o = {}) => {
    const rot = o.rot || 0, c = P(o.lx ?? 8, lz), fp = o.footprint || M.rectRing(c[0], c[1], d, w, rot);
    const courts = o.courts || [M.rectRing(c[0] + (o.cdx || 0), c[1] + (o.cdz || 0), d * 0.36, w * 0.36, rot)];
    variants.push({ footprint: fp, courts, center: c, groundLevel: Y, roofLevel: Y + (o.h || 3.9), parapet: o.parapet ?? 0.85, door: o.door || [c[0] - d / 2, c[1] + (o.doorOff || 0)], rotationDeg: rot, seed: 1234567 + variants.length * 7919, ...o.extra });
  };
  mk(z, 11, 12, { extra: { spouts: 2 } });
  mk(z + 16, 14, 13, { h: 4.3, extra: { courtStair: true, spouts: 1, upper: [{ ring: M.rectRing(OX + 12.5, OZ + z + 16 - 3.6, 3.2, 5.6), height: 2.7 }] } });
  // saw-tooth frontage: the house grid is turned 12 degrees against its street
  { const c = P(9, z + 36), fp = M.closeRing([[c[0] - 7, c[1] - 9], [c[0] + 7, c[1] - 7.2], [c[0] + 6, c[1] + 8.5], [c[0] - 7, c[1] + 9]]);
    variants.push({ footprint: fp, courts: [M.rectRing(c[0] + 0.5, c[1], 5, 6, 12)], center: c, groundLevel: Y, roofLevel: Y + 4.1, parapet: 0.9, door: [c[0] - 7, c[1] + 1], rotationDeg: 12, seed: 99, teeth: { gridDeg: 12, edges: 'street', tooth: 1.6, plinth: 0.7 }, spouts: 1 }); }
  // L-shaped plot with two courts
  { const c = P(11, z + 58), L = (ax, az) => [c[0] + ax, c[1] + az], fp = M.closeRing([L(-9, -9), L(9, -9), L(9, 0), L(1, 0), L(1, 9), L(-9, 9)]);
    variants.push({ footprint: fp, courts: [M.rectRing(c[0] + 3, c[1] - 4.6, 5, 4.2), M.rectRing(c[0] - 4.2, c[1] + 3.5, 4, 5)], center: c, groundLevel: Y, roofLevel: Y + 3.8, parapet: 0.8, door: L(-9, -3), seed: 4242, courtStair: true }); }
  // a great house with three roof levels (spec.parts as ctx.layout.roofParts gives them): a low wing, the main roof
  // round the court, the raised main-room range; saw-teeth on the street front
  { const c = P(13, z + 80), L = (ax, az) => [c[0] + ax, c[1] + az], fp = M.closeRing([L(-11, -10), L(11, -10), L(11, 10), L(-11, 10)]), court = M.rectRing(c[0] - 1, c[1] - 1.5, 8, 7);
    const parts = [
      { polygon: M.closeRing([L(-11, -10), L(11, -10), L(11, 4), L(-11, 4)]), holes: [court], level: Y + 5.2, parapet: 0.9, kind: 'main' },
      { polygon: M.closeRing([L(-11, 4), L(4, 4), L(4, 10), L(-11, 10)]), holes: [], level: Y + 7.4, parapet: 0.9, kind: 'raised' },
      { polygon: M.closeRing([L(4, 4), L(11, 4), L(11, 10), L(4, 10)]), holes: [], level: Y + 3.9, parapet: 0.7, kind: 'wing' },
    ];
    variants.push({ footprint: fp, courts: [court], parts, center: c, groundLevel: Y + 0.4, roofLevel: Y + 5.2, parapet: 0.9, door: L(-11, -4), rotationDeg: 9, seed: 777, cls: 'mansion', doorWidth: 2.0, doorHeight: 3.2, base: Y - 1, teeth: { gridDeg: 9, edges: 'street', tooth: 1.7, plinth: 0.9 }, spouts: 2, courtStair: true }); }
  mk(z + 104, 9, 9, { h: 3.4, lx: 6.5, extra: {} });
  variants.forEach((v, i) => {
    const style = { wallColor: tones[i % tones.length], roofAbs };
    for (const [lod, dx] of [['full', 0], ['shell', 40], ['box', 80]]) {
      const mv = (r) => r.map((p) => [p[0] + dx, p[1]]);
      const s = lod === 'full' ? v : { ...v, footprint: mv(v.footprint), courts: v.courts.map(mv), door: v.door && [v.door[0] + dx, v.door[1]], upper: v.upper && v.upper.map((u) => ({ ...u, ring: mv(u.ring) })), parts: v.parts && v.parts.map((q) => ({ ...q, polygon: mv(q.polygon), holes: q.holes.map(mv) })) };
      const g = geom.house(s, style, lod);
      if (g.walls) put(wallMat, g.walls); if (g.trim) put(wallMat, g.trim);
      if (g.roof) put('roofEarth', g.roof); if (g.floor) put('streetEarthDamp', g.floor);
    }
  });

  // ---- G. small parts: applied doorway with lintel, bench, coping, spouts ---------------------------
  z = 275;
  const wl = [P(6, z), P(6, z + 26)];
  put('mudPlasterFresh', geom.wall(wl, { thickness: 0.9, base: Y - 0.6, top: Y + 3.2 }));
  put('bakedBrickRed', geom.coping(wl, { y: Y + 3.2, width: 0.9, height: 0.14, overhang: 0.06 }));
  put('mudPlaster', geom.bench({ a: P(5.55, z + 12), b: P(5.55, z + 3), base: Y, height: 0.45, depth: 0.5, side: -1 }));
  for (const dz of [16, 22]) { const d = geom.doorway({ x: OX + 5.55, z: OZ + z + dz, facingDeg: WEST, base: Y + 0.02, width: 1.1, height: 2.0 }); put('cedar', d.leaf); put('palmWood', d.lintel); }
  for (const dz of [3, 13, 23]) put('bakedBrickRed', geom.spout({ x: OX + 5.55, y: Y + 2.9, z: OZ + z + dz, azDeg: WEST }));
  flush();

  // ---- H. instancing: a grove in two levels of detail, per-instance colour and scale ---------------
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 6, 7); trunk.translate(0, 3, 0);
  const crownN = new THREE.ConeGeometry(2.6, 2.4, 9); crownN.translate(0, 6.6, 0);
  const crownF = new THREE.ConeGeometry(2.6, 2.4, 5); crownF.translate(0, 6.6, 0);
  const trunks = geom.instanced({ name: 'show-trunks', geometry: trunk, material: 'palmTrunk', lod: [0, 500] });
  const crowns = geom.instancedLOD({ name: 'show-crowns', levels: [{ geometry: crownN, material: 'palmFrond', max: 300 }, { geometry: crownF, material: 'palmFrond', cell: 1024 }] });
  let palms = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 5; j++) {
    const x = OX - 30 + i * 7 + (hash2(i, j, 5) - 0.5) * 4, zz = OZ + 314 + j * 7 + (hash2(i, j, 6) - 0.5) * 4, sc = 0.7 + hash2(i, j, 7) * 0.9;
    trunks.add({ x, y: Y, z: zz, rotDeg: hash2(i, j, 8) * 360, scale: sc });
    crowns.add({ x, y: Y, z: zz, rotDeg: hash2(i, j, 8) * 360, scale: sc }, new THREE.Color().setHSL(0.24 + hash2(i, j, 9) * 0.08, 0.5, 0.42 + hash2(i, j, 10) * 0.2));
    palms++;
  }
  const jar = new THREE.CylinderGeometry(0.22, 0.16, 0.6, 10); jar.translate(0, 0.3, 0);
  const jars = geom.instanced({ name: 'show-jars', geometry: jar, material: 'bakedBrickRed', ao: true, shadowFar: 150 });
  variants.forEach((v, i) => { const c = M.polygonCentroid(v.courts[0]); for (let k = 0; k < 4; k++) jars.add({ x: c[0] - 1 + (k % 2) * 0.6 + hash2(i, k, 3), y: Y + 0.07, z: c[1] - 1.2 + (k >> 1) * 0.6, scale: 0.8 + hash2(i, k, 4) * 0.6 }); jars.add({ x: v.door[0] - 0.6, y: Y, z: v.door[1] + 1.3, scale: 1.2 }); });

  return { at: [OX, Y, OZ], ms: Math.round(performance.now() - t0), palms, houses: variants.length, tris: Math.round(geom.statsFor('geom-showcase').tris) };
}

// ================================================================================================
// Stress test: a made-up quarter of 20,000 houses (about 38 per hectare, blocks of 80 x 66 m turned a few
// degrees against each other, lanes between them) inside two wall circuits with 1,000 towers.
function buildStress(ctx) {
  const { geom, ground, materials } = ctx, [CX, CZ] = STRESS, rep = {};
  const BW = 80, BD = 66, NX = 30, NZ = 29, target = 20000;      // always full size, also in the draft tier
  const t0 = performance.now();
  const houses = [], lanes = [];
  const X0 = CX - (NX * BW) / 2, Z0 = CZ - (NZ * BD) / 2;
  let id = 0;
  outer: for (let bj = 0; bj < NZ; bj++) for (let bi = 0; bi < NX; bi++) {
    const rot = (hash2(bi, bj, 11) - 0.5) * 14, bx = X0 + (bi + 0.5) * BW + (hash2(bi, bj, 12) - 0.5) * 6, bz = Z0 + (bj + 0.5) * BD + (hash2(bi, bj, 13) - 0.5) * 6;
    const w = BW - 3 - hash2(bi, bj, 14) * 3, d = BD - 3 - hash2(bi, bj, 15) * 2.5, rows = 4, rd = d / rows, g = ground.height(bx, bz);
    lanes.push(M.rectRing(bx, bz, w + 7, d + 7, rot));
    for (let r = 0; r < rows; r++) {
      let x = -w / 2, k = 0;
      while (x < w / 2 - 5) {
        let pw = 9 + hash2(id, r, 21) * 8; if (x + pw > w / 2 - 5) pw = w / 2 - x;
        const lz = -d / 2 + (r + 0.5) * rd, lx = x + pw / 2, open = hash2(id, 3, 22) < 0.1;
        x += pw; k++;
        if (open) { id++; continue; }
        const j = (q) => (hash2(id, q, 23) - 0.5) * 0.6;
        const corner = (ax, az, q) => M.localToWorld([bx, bz], rot, lx + ax + j(q), lz + az + j(q + 4));
        const fp = M.closeRing([corner(-pw / 2, -rd / 2, 0), corner(pw / 2, -rd / 2, 1), corner(pw / 2, rd / 2, 2), corner(-pw / 2, rd / 2, 3)]);
        const c = M.localToWorld([bx, bz], rot, lx, lz), big = pw > 14.5, st = hash2(id, 5, 24) < 0.22 ? 2 : 1;
        const cw = pw * (0.26 + hash2(id, 6, 25) * 0.12), cd = rd * (0.26 + hash2(id, 7, 26) * 0.12), co = M.localToWorld(c, rot, (hash2(id, 8, 27) - 0.5) * pw * 0.1, (hash2(id, 9, 28) - 0.5) * rd * 0.1);
        const edge = r === 0 ? -1 : r === rows - 1 ? 1 : hash2(id, 10, 29) < 0.5 ? -1 : 1, door = M.localToWorld([bx, bz], rot, lx + j(11), lz + edge * rd / 2);
        const roof = g + 0.3 + st * 3.3 + hash2(id, 12, 30) * 0.9, seed = (hash2(id, 13, 31) * 4294967296) >>> 0;
        const h = { id, footprint: fp, courts: [M.rectRing(co[0], co[1], cw, cd, rot + (hash2(id, 14, 32) - 0.5) * 6)], center: c, groundLevel: g, roofLevel: roof, parapet: 0.6 + hash2(id, 15, 33) * 0.4,
          door, rotationDeg: rot, seed, whitewashed: hash2(id, 16, 34) < (big ? 0.45 : 0.15), cls: big ? 'large' : 'medium' };
        if (hash2(id, 17, 35) < 0.45) {
          // a raised main-room range on the side away from the door (as ctx.layout.roofParts gives it): two roof levels
          const cut = -edge * rd * 0.28, far = -edge * rd / 2, k = (ax, az) => M.localToWorld([bx, bz], rot, lx + ax, lz + az), split = [k(-pw / 2, cut), k(pw / 2, cut)];
          // the split points lie on the (jittered) side edges of the plot: project them
          const onEdge = (pt, a, b) => { const r = M.distToSegment(pt[0], pt[1], a[0], a[1], b[0], b[1]); return [a[0] + (b[0] - a[0]) * r[1], a[1] + (b[1] - a[1]) * r[1]]; };
          const A = fp[0], B = fp[1], C = fp[2], D = fp[3], sL = onEdge(split[0], D, A), sR = onEdge(split[1], B, C);
          void far;
          h.parts = edge < 0
            ? [{ polygon: M.closeRing([A, B, sR, sL]), holes: h.courts, level: roof, parapet: h.parapet }, { polygon: M.closeRing([sL, sR, C, D]), holes: [], level: roof + 1.0 + hash2(id, 18, 36) * 1.6, parapet: h.parapet }]
            : [{ polygon: M.closeRing([sL, sR, C, D]), holes: h.courts, level: roof, parapet: h.parapet }, { polygon: M.closeRing([A, B, sR, sL]), holes: [], level: roof + 1.0 + hash2(id, 18, 36) * 1.6, parapet: h.parapet }];
        }
        h.courtStair = hash2(id, 19, 37) < 0.3; h.spouts = hash2(id, 20, 38) < 0.5 ? 1 + (seed & 1) : 0;
        houses.push(h); id++;
        if (houses.length >= target) break outer;
      }
    }
  }
  rep.layoutMs = Math.round(performance.now() - t0);
  const t1 = performance.now();
  const res = geom.addHouses(houses, { filter: () => true });
  rep.twoLevelHouses = houses.filter((h) => h.parts).length;
  rep.houses = res.houses; rep.houseTris = res.tris; rep.housesMs = Math.round(performance.now() - t1);
  // lanes: earth strips between the blocks (their vertices get baked AO: this is what `streets` will lay down)
  const lg = [];
  for (const ring of lanes) lg.push(geom.ribbon(ring, { width: 3.4, y: (x, z) => ground.height(x, z) + 0.12, step: 6 }));
  geom.addStatic('streetEarthDamp', geom.merge(lg), { castShadow: false });
  geom.addStatic('streetEarth', geom.cap(M.rectRing(CX, CZ, NX * BW + 260, NZ * BD + 260), (x, z) => ground.height(x, z) + 0.04), { castShadow: false, ao: false, tile: 4096 });

  // two wall circuits with 1,000 parapeted towers and stepped merlons (instanced near level)
  const t2 = performance.now();
  let towers = 0, merlonCount = 0;
  const tStat0 = geom.statsFor('geom-showcase');
  for (const [k, n] of [[0, 520], [1, 480]]) {
    const hw = (NX * BW) / 2 + 40 + k * 46, hd = (NZ * BD) / 2 + 40 + k * 46, ring = [[CX - hw, CZ - hd], [CX + hw, CZ - hd], [CX + hw, CZ + hd], [CX - hw, CZ + hd], [CX - hw, CZ - hd]];
    const top = 14 - k * 4, th = k ? 3.7 : 6.5, per = M.polylineLength(ring), sp = per / n;
    const lv = (x, z) => ground.height(x, z);
    geom.addStatic('mudPlaster', geom.wall(ring.slice(0, 4), { closed: true, thickness: th, base: (x, z) => lv(x, z) - 1, top: (x, z) => lv(x, z) + top, step: 60 }));
    geom.addMerlons('mudPlaster', M.resamplePolyline(ring, 60), { y: (x, z) => lv(x, z) + top, offset: -(th / 2 - 0.3), instanced: true, shadowFar: 300 });
    merlonCount += Math.floor(per / 1.3);
    for (let i = 0; i < n; i++) {
      const p = M.pointAlong(ring, (i + 0.5) * sp), big = i % 2 === 0, g = lv(p.x, p.z);
      const spec = { x: p.x, z: p.z, w: k ? 5.1 : 9.5, d: k ? 5.8 : big ? 11.4 : 8.06, rotDeg: Math.atan2(p.dir[1], p.dir[0]) * M.RAD, base: g - 1, top: g + top + (k ? 2.5 : big ? 6 : 3), parapet: 1.0 };
      geom.addWallTower('mudPlaster', spec, { merlons: 'mudPlaster', merlon: { instanced: true, shadowFar: 300 } });
      merlonCount += Math.floor((2 * (spec.w + spec.d) - 2) / 1.3); towers++;
    }
  }
  const tStat1 = geom.statsFor('geom-showcase');
  rep.towers = towers; rep.merlons = merlonCount; rep.towersMs = Math.round(performance.now() - t2);
  rep.wallTris = Math.round(tStat1.tris - tStat0.tris); rep.merlonInstances = tStat1.instances - tStat0.instances; rep.merlonTris = Math.round(tStat1.instancedTris - tStat0.instancedTris);
  rep.at = [CX, CZ]; rep.extent = [NX * BW, NZ * BD]; rep.housesPerHa = +(houses.length / ((NX * BW * NZ * BD) / 1e4)).toFixed(1);
  void materials;
  return rep;
}
