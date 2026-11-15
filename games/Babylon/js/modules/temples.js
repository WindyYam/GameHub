// js/modules/temples.js — every temple of Babylon except Esagila and its annex (SPEC 3.14), the altars before
// their doors and the tier-3 street shrines. Notes: docs/mod-temples.md.
//
// One parametric generator (buildTemple) makes a Babylonian courtyard temple on a footprint ring: niched and
// buttressed outer walls on a brick kisu, towered gateways in stepped reveals, courts with pilasters, the towered
// cella front, parapets, stepped merlons, roof and court furniture. The six excavated temples get plans read from
// the excavation reports (Koldewey 1911 / 1914, Reuther 1926, Pedersen 2021 ch. 4); the thirteen text-attested ones
// are plainer members of a small family drawn from a hash of their id.
//
// Frame of a plan: the FRONT is one edge of the (clockwise) footprint ring; s runs along it from its first corner
// (to the LEFT of somebody who looks at the front from outside), d runs into the building at right angles.
import { hash2, hashString } from '../core/rng.js';

const IDS = ['ninmahTemple', 'nabuShaHare', 'ashratumTemple', 'ishtarAgadeTemple', 'ishharaTemple', 'ninurtaTemple', 'akituTemple', 'gulaEsabad',
  'shamashTemple', 'adadEnamhe', 'enlilEnamtila', 'beletNinua', 'nabuTuba', 'beletEannaWest', 'beletEannaCanal', 'sinEgishnugal', 'teShrine',
  'eaEkarzaginna', 'ishtarBabylon'];
const BLACK = [0.075, 0.07, 0.065];          // bitumen wash on plaster (tint on the white material)
const FLOOR_DARK = [0.11, 0.105, 0.1];       // asphalted court floor seen from afar
const PARAPET_T = 0.5, MERLON = { pitch: 1.22, width: 0.78, height: 0.8, thickness: 0.5 };

// ------------------------------------------------------------------------------------------------------------
// Plans of the excavated temples. Edges: 0 = north, 1 = east, 2 = south, 3 = west (every ring starts at the NW corner).
// gates: { edge: 0 front | 1 the side beyond the front's far end | 2 back | 3 the side at s = 0, pos: m along that edge }
// courts: { s: [s0, s1], d: [d0, d1], cella: court side with the towered cella front (0 front, 1 s1, 2 back, 3 s0) }
// ------------------------------------------------------------------------------------------------------------
const PLANS = {
  // Koldewey 1911 pl. 3; Pedersen fig. 4.39, 4.47: entrance N, vestibule, court 14 x 20.4 with the well on the right,
  // cella front opposite with grooved towers, double kisu (the footprint of world.json is the outer kisu)
  ninmahTemple: {
    front: 0, proper: [35, 50], wall: 2.4,
    facade: { bay: 4.6, nw: 2.15, nd: 0.5, steps: 2, sw: 0.22, raise: 0.5 },
    gates: [{ edge: 0, pos: 17.5, w: 2.6, h: 5.6, tw: 3.7, proj: 1.25, rise: 2.4, grooves: { count: 2, width: 0.34, depth: 0.24, gap: 1.05 }, rebates: 3, main: true, altar: 'single' }],
    courts: [{ s: [10.5, 24.5], d: [8.4, 28.8], cella: 2, cellaTowers: true, pil: { bay: 3.4, w: 1.3, proud: 0.3 }, dado: false, well: [13.2, 11.6], vessels: true,
      doors: [[1, 0.3], [1, 0.72], [3, 0.3], [3, 0.72]], fire: [20.4, 21.5] }],
    stairHead: [29.5, 41], spouts: 3,
  },
  // Cavigneaux / Ishaq (Pedersen fig. 4.20): baked brick, two courts each with a cella on the south, towers at the
  // main entrance only, double altar before the door, floor +8.0 above a street at +7.2
  nabuShaHare: {
    front: 0, wall: 1.8, body: 'bakedBrickBuff',
    facade: { bay: 3.9, nw: 1.5, nd: 0.36, steps: 1, sw: 0.3, raise: 0 },
    gates: [{ edge: 0, pos: 12.4, w: 2.4, h: 5.2, tw: 3.2, proj: 1.1, rise: 2.2, grooves: { count: 2, width: 0.3, depth: 0.22, gap: 0.95 }, rebates: 2, main: true, altar: 'double' }],
    courts: [
      { s: [5, 19.8], d: [7.6, 16.3], cella: 2, cellaTowers: false, pil: { bay: 3.7, w: 1.2, proud: 0.22 }, dado: true, altars: 2, doors: [[1, 0.5], [3, 0.5]], fire: [8, 10] },
      { s: [23.6, 32.7], d: [9.2, 15.8], cella: 2, cellaTowers: false, blackWall: true, pil: { bay: 3.0, w: 1.0, proud: 0.2 }, dado: true, doors: [[3, 0.5]] },
    ],
    stairHead: [30.5, 24.5], spouts: 2,
  },
  // Cavigneaux 2013: the smallest temple, pilastered walls, no gate towers, court with the cella room to the south
  ashratumTemple: {
    front: 1, wall: 1.5, facade: { bay: 3.2, nw: 1.7, nd: 0.22, steps: 1, sw: 0.3, raise: 0 }, noKisu: true,
    gates: [{ edge: 0, pos: 9.5, w: 1.7, h: 3.6, towers: false, rebates: 2, main: true, altar: 'single' }],
    courts: [{ s: [6.4, 13.6], d: [3.0, 7.0], cella: 1, cellaTowers: false, pil: null, dado: true, doors: [], fire: [8, 5] }],
    spouts: 1,
  },
  // Reuther 1926 pl. 29-30 (Koldewey 1914 fig. 244): entrance facade S on the piazza with grooved towers, vestibule,
  // square court 12 x 12, side entrance E, the cella building a self-contained block on the W, flat pillars outside
  // and in the court, double frames at the main door and the cella door, black wash at the doors and on the cella front
  ishtarAgadeTemple: {
    front: 2, wall: 2.4, noKisu: true,                 // world.json: the baked-brick skirt belongs to Level 4 (Nabonidus)
    facade: { bay: 3.3, nw: 1.8, nd: 0.26, steps: 1, sw: 0.3, raise: 0 },
    gates: [
      { edge: 0, pos: 18.5, w: 2.4, h: 5.2, tw: 3.4, proj: 1.15, rise: 2.3, grooves: { count: 2, width: 0.32, depth: 0.22, gap: 1.0 }, rebates: 2, main: true, altar: null },
      { edge: 3, pos: 13.6, w: 1.6, h: 3.6, towers: false, rebates: 1 },
    ],
    courts: [
      { s: [8.8, 20.8], d: [11.4, 23.4], cella: 1, cellaTowers: true, blackWall: true, pil: { bay: 3.0, w: 1.15, proud: 0.24 }, dado: false, vessels: true,
        doors: [[3, 0.25], [3, 0.75], [2, 0.5]], fire: [12, 20.2] },
      { s: [26.4, 30.6], d: [3.6, 7.8], cella: null, pil: null, dado: false, bins: true, plain: true },
    ],
    raised: [{ s: [22.4, 33.4], d: [8.6, 26.4], rise: 0.9 }],
    stairHead: [5.4, 27], spouts: 3,
  },
  // Koldewey 1911 pl. 5 ("Temple Z"): cult part in the east with the cella on the S, two towered gates N (main, with
  // the altar) and E, each through a vestibule into the court 11.2 x 13.4; the west part like a house with two courts
  ishharaTemple: {
    front: 0, wall: 2.3,
    facade: { bay: 4.6, nw: 2.1, nd: 0.45, steps: 1, sw: 0.3, raise: 0.5 },
    gates: [
      { edge: 0, pos: 27.1, w: 2.4, h: 5.2, tw: 3.5, proj: 1.2, rise: 2.4, grooves: { count: 2, width: 0.32, depth: 0.22, gap: 1.0 }, rebates: 2, main: true, altar: 'single' },
      { edge: 1, pos: 16.2, w: 2.2, h: 4.8, tw: 3.1, proj: 1.0, rise: 2.0, grooves: { count: 1, width: 0.4, depth: 0.22, gap: 1.0 }, rebates: 2 },
      { edge: 0, pos: 37.6, w: 1.2, h: 2.6, towers: false, rebates: 1, minor: true },
    ],
    courts: [
      { s: [21.5, 32.7], d: [9.5, 22.9], cella: 2, cellaTowers: true, pil: { bay: 3.6, w: 1.3, proud: 0.28 }, dado: true, vessels: true, doors: [[3, 0.35], [3, 0.7]], fire: [24.5, 12.5] },
      { s: [5.2, 11.6], d: [8.2, 14.8], cella: null, pil: null, dado: false, plain: true },
      { s: [5.2, 12.2], d: [24.5, 31.5], cella: null, pil: null, dado: false, plain: true, bins: true },
    ],
    raised: [{ s: [18.4, 35.6], d: [24.6, 38.4], rise: 0.8 }],
    stairHead: [14.5, 36], spouts: 3,
  },
  // Koldewey 1911 pl. 7 (Epatutila): entrance E with the double altar, court 14 x 28.5, three cellas in a row on the
  // W behind a towered front, wide towered gateways N and S for the processions, a small court in the NW corner,
  // plain towers outside and in the court, a brick gutter in the east front
  ninurtaTemple: {
    front: 1, wall: 2.8,
    facade: { bay: 5.0, nw: 2.3, nd: 0.45, steps: 1, sw: 0.3, raise: 0.55 },
    gates: [
      { edge: 0, pos: 22, w: 2.6, h: 5.6, tw: 3.8, proj: 1.3, rise: 2.5, grooves: { count: 2, width: 0.34, depth: 0.24, gap: 1.05 }, rebates: 2, main: true, altar: 'double' },
      { edge: 1, pos: 16, w: 3.5, h: 5.4, tw: 3.3, proj: 1.2, rise: 2.0, grooves: { count: 2, width: 0.3, depth: 0.22, gap: 0.95 }, rebates: 1, ramp: true },
      { edge: 3, pos: 24.5, w: 3.5, h: 5.4, tw: 3.3, proj: 0.7, rise: 2.0, grooves: { count: 2, width: 0.3, depth: 0.22, gap: 0.95 }, rebates: 1, ramp: true },
    ],
    courts: [
      { s: [7.75, 36.25], d: [9, 23], cella: 2, cellaTowers: true, cellaSide: [0.2, 0.8], pil: { bay: 4.0, w: 1.6, proud: 0.32 }, dado: true, vessels: true, doors: [], fire: [12, 12], fire2: [32, 12] },
      { s: [3.4, 8.0], d: [31, 36.6], cella: null, pil: null, dado: false, plain: true },
    ],
    gutter: { edge: 0, pos: 34 }, cornerTower: true,
    stairHead: [39.5, 33], spouts: 3,
  },
};

export default {
  name: 'temples',
  claims: IDS.map((id) => 'monument:' + id),

  prepare(ctx) {
    const { layout, mathx: M, W } = ctx;
    // the akitu temple has no forecourt in the layout (it lies outside the inner walls): keep its west front free
    const ak = M.openRing(W.monument('akituTemple').footprint.polygon);
    layout.reserve([[ak[0][0] - 16, ak[0][1] + 6], [ak[0][0], ak[0][1] + 6], [ak[3][0], ak[3][1] - 6], [ak[3][0] - 16, ak[3][1] - 6]], { owner: 'temples', kind: 'forecourt', margin: 1 });
    // the altar place before the north door of the Ishhara temple (the layout's forecourt lies on its east side)
    const iz = M.openRing(W.monument('ishharaTemple').footprint.polygon);
    layout.reserve([[iz[0][0] + 21, iz[0][1] - 11], [iz[0][0] + 33.5, iz[0][1] - 11], [iz[0][0] + 33.5, iz[0][1]], [iz[0][0] + 21, iz[0][1]]], { owner: 'temples', kind: 'forecourt', margin: 0.5 });
    // the ramps of the two processional gateways of the Ninurta temple (north and south) need 9 m of open ground
    const nu = M.openRing(W.monument('ninurtaTemple').footprint.polygon), gx = nu[1][0] - 16;
    layout.reserve([[gx - 5.5, nu[0][1] - 9.5], [gx + 5.5, nu[0][1] - 9.5], [gx + 5.5, nu[0][1]], [gx - 5.5, nu[0][1]]], { owner: 'temples', kind: 'forecourt', margin: 0.5 });
    layout.reserve([[gx - 5.5, nu[2][1]], [gx + 5.5, nu[2][1]], [gx + 5.5, nu[2][1] + 9.5], [gx - 5.5, nu[2][1] + 9.5]], { owner: 'temples', kind: 'forecourt', margin: 0.5 });
    for (const s of shrineSites(ctx)) layout.reserve(s.ring, { owner: 'temples', kind: 'shrine', margin: 0.6 });
  },

  async build(ctx) {
    const tools = makeTools(ctx);
    const checks = [], stats = { temples: 0, altars: 0, shrines: 0, fires: 0, smoke: 0, merlons: 0 };
    const built = [];
    for (const id of IDS) {
      const T = templeSpec(ctx, id);
      const r = tools.buildTemple(T);
      built.push({ id, T, r });
      stats.temples++; stats.altars += r.altars; stats.fires += r.fires; stats.smoke += r.smoke; stats.merlons += r.merlons;
    }
    const sh = tools.buildShrines(shrineSites(ctx));
    stats.shrines = sh.shrines; stats.altars += sh.altars; stats.smoke += sh.smoke;

    // ---- checks (SPEC 3.14, 9) -------------------------------------------------------------------------
    const M = ctx.mathx, W = ctx.W;
    for (const id of ['ninmahTemple', 'ishtarAgadeTemple', 'nabuShaHare', 'ninurtaTemple', 'ishharaTemple']) {
      const b = built.find((q) => q.id === id), fp = W.monument(id).footprint, a = Math.abs(M.polygonArea(b.T.outer));
      checks.push({ name: id + ' footprint (m2)', value: Math.round(a), expect: 'within 3 % of ' + fp.areaM2, pass: Math.abs(a / fp.areaM2 - 1) < 0.03 });
    }
    const nm = built.find((q) => q.id === 'ninmahTemple');
    checks.push({ name: 'Ninmah floor level', value: nm.T.floor, expect: 12, pass: nm.T.floor === 12 });
    checks.push({ name: 'Ninmah temple proper (m)', value: nm.T.E[0].L.toFixed(1) + ' x ' + nm.T.E[1].L.toFixed(1), expect: '35 x 50', pass: Math.abs(nm.T.E[0].L - 35) < 0.5 && Math.abs(nm.T.E[1].L - 50) < 0.5 });
    const ia = built.find((q) => q.id === 'ishtarAgadeTemple');
    checks.push({ name: 'Ishtar of Agade floor level', value: ia.T.floor, expect: 5.3, pass: Math.abs(ia.T.floor - 5.3) < 1e-6 });
    checks.push({ name: 'merlon height (m)', value: MERLON.height, expect: '< 1', pass: MERLON.height < 1 });
    checks.push({ name: 'temples built', value: stats.temples, expect: 19, pass: stats.temples === 19 });
    checks.push({ name: 'tier-3 altars and shrines', value: stats.altars + stats.shrines, expect: '>= 30', pass: stats.altars + stats.shrines >= 30 });
    const bad = built.filter((q) => q.r.inspect.flipped !== 0 || q.r.inspect.overlap > 0.02);
    checks.push({ name: 'temple shells (19): flipped normals / coplanar overlap m2', value: bad.length ? bad.map((q) => q.id + ' ' + q.r.inspect.flipped + ' / ' + q.r.inspect.overlap.toFixed(3)).join(', ') : '0 / 0', expect: '0 / 0', pass: bad.length === 0 });
    // nothing of the temples stands in the way of the camera
    let clear = Infinity;
    for (const b of built) for (const p of b.r.tall) { const na = ctx.film.nearestApproach(p); if (na && na.dist < clear) clear = na.dist; }
    for (const p of sh.tall) { const na = ctx.film.nearestApproach(p); if (na && na.dist < clear) clear = na.dist; }
    checks.push({ name: 'nearest approach of the camera to a temple part (m)', value: +clear.toFixed(1), expect: '> 2', pass: clear > 2 });

    return {
      stats, checks,
      api: { temples: built.map((b) => ({ id: b.id, floor: b.T.floor, top: b.T.top, gates: b.r.gates, courts: b.r.courts, altars: b.r.altarList })), shrines: sh.list },
    };
  },
};

// ------------------------------------------------------------------------------------------------------------
// Spec of one temple: ring, levels, plan (excavated: PLANS; text-attested: a member of the family)
// ------------------------------------------------------------------------------------------------------------
function edgesOf(ring) {
  const n = ring.length, E = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), e = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    E.push({ a, b, L, e, n: [e[1], -e[0]] });                       // clockwise ring: outside is on the left of travel
  }
  return E;
}

function templeSpec(ctx, id) {
  const { W, mathx: M, ground } = ctx;
  const m = W.monument(id), fp = m.footprint, lv = W.monumentLevels(m);
  let outer = M.openRing(fp.polygon);
  if (M.polygonArea(outer) < 0) outer = outer.slice().reverse();
  const plat = ground.platformAt(fp.center[0], fp.center[1]);
  const floor = lv.floor !== null ? lv.floor : plat ? plat.level : ground.height(fp.center[0], fp.center[1]) + 0.3;
  const height = lv.height || 9;
  let plan = PLANS[id] || null;
  const conjectural = !plan;
  if (!plan) plan = familyPlan(ctx, id, m, outer);
  // the temple proper: the footprint itself, or a rectangle inside the kisu apron (Ninmah)
  let ring = outer;
  if (plan.proper) {
    const r = M.openRing(M.rectRing(fp.center[0], fp.center[1], plan.proper[0], plan.proper[1], fp.rotationDeg));
    if (r.every((p) => M.pointInPolygon(p[0], p[1], outer) && M.distToRing(p[0], p[1], outer) > 1.5)) ring = r; else ring = ctx.geom.insetRing(outer, 4.5);
  }
  const f = plan.front % ring.length;
  // rotate the ring so that edge 0 is the front
  const rot = ring.slice(f).concat(ring.slice(0, f)), E = edgesOf(rot);
  const F = E[0];
  const P = (s, d) => [F.a[0] + F.e[0] * s - F.n[0] * d, F.a[1] + F.e[1] * s - F.n[1] * d];
  let gmin = Infinity, gmax = -Infinity;
  for (const e of E) for (let k = 0; k <= 4; k++) { const x = e.a[0] + (e.b[0] - e.a[0]) * k / 4 + e.n[0] * 1.5, z = e.a[1] + (e.b[1] - e.a[1]) * k / 4 + e.n[1] * 1.5, h = ground.height(x, z); if (h < gmin) gmin = h; if (h > gmax) gmax = h; }
  for (const p of outer) { const h = ground.height(p[0] + (p[0] - fp.center[0]) * 0.05, p[1] + (p[1] - fp.center[1]) * 0.05); if (h < gmin) gmin = h; }
  return { id, m, name: m.name, conjectural, outer, ring: rot, E, P, floor, top: floor + height, height, base: Math.min(gmin, floor) - 1.6, gmin, gmax, plan, seed: hashString(id), hasApron: ring !== outer };
}

/** The plainer family of the text-attested temples: every parameter from a hash of the id (SPEC 3.14, section 8). */
function familyPlan(ctx, id, m, outer) {
  const { mathx: M, layout } = ctx, seed = hashString(id), h = (k) => hash2(seed & 0xffff, k, 91);
  const c = M.polygonCentroid(outer), E = edgesOf(outer);
  // the front looks at the forecourt the layout keeps open (akitu: at the processional road in the west)
  let want = id === 'akituTemple' ? [-1, 0] : null;
  const sq = (layout.squares || []).find((q) => q.monument === id);
  if (!want && sq) want = [sq.center[0] - c[0], sq.center[1] - c[1]];
  if (!want) want = [0, 1];
  let front = 0, best = -Infinity;
  E.forEach((e, i) => { const v = e.n[0] * want[0] + e.n[1] * want[1]; if (v > best) { best = v; front = i; } });
  const Lf = E[front].L, D = E[(front + 1) % 4].L, t = 2.3, big = Lf * D > 2000;
  const brick = /baked brick/i.test(m.dims.note || '');
  const style = Math.floor(h(1) * 3);                                          // 0 flat pillars, 1 stepped grooves, 2 towers
  const facade = [{ bay: 3.5 + h(2) * 0.5, nw: 1.9, nd: 0.25, steps: 1, sw: 0.3, raise: 0 }, { bay: 4.1 + h(2) * 0.6, nw: 1.5, nd: 0.45, steps: 2, sw: 0.26, raise: 0 },
    { bay: 4.6 + h(2) * 0.6, nw: 2.1, nd: 0.42, steps: 1, sw: 0.3, raise: 0.5 }][style];
  const axis = h(3) < 0.5 ? 'straight' : h(4) < 0.5 ? 'left' : 'right';
  const gw = 2.2 + Math.round(h(5) * 2) * 0.2, tw = 3.1 + h(6) * 0.8, grooves = { count: 1 + Math.floor(h(7) * 2.99) % 3 || 1, width: 0.32, depth: 0.22, gap: 0.95 };
  if (grooves.count === 3) grooves.gap = 0.85;
  const plan = { front, wall: t, facade, gates: [], courts: [], raised: [], spouts: 2 + Math.floor(h(8) * 2), family: { style, axis, brick } };
  if (brick) plan.kisu = 1.5;                                                   // a tall baked-brick kisu shows the brick rebuilding (R1 7)
  else if (h(25) < 0.5) plan.noKisu = true;                                     // no revetment: the walls were never raised
  const vest = 3.8, d0 = t + vest + 1.8;
  if (id === 'akituTemple') {
    // a festival house: one large court for the gathered gods and a second court before a wide cella (conjectural)
    plan.gates.push({ edge: 0, pos: Lf / 2, w: 3.2, h: 6.0, tw: 4.4, proj: 1.4, rise: 2.6, grooves: { count: 2, width: 0.36, depth: 0.25, gap: 1.1 }, rebates: 3, main: true, altar: 'double' });
    plan.gates.push({ edge: 1, pos: 20, w: 2.4, h: 5.0, tw: 3.2, proj: 1.0, rise: 2.0, grooves: { count: 1, width: 0.4, depth: 0.22, gap: 1 }, rebates: 1 });
    plan.courts.push({ s: [Lf / 2 - 15, Lf / 2 + 15], d: [d0 + 0.4, d0 + 26.4], cella: null, arches: [[2, 0.5]], pil: { bay: 4.2, w: 1.5, proud: 0.3 }, dado: true, doors: [[1, 0.3], [1, 0.7], [3, 0.3], [3, 0.7]], fire: [Lf / 2 - 9, d0 + 8], fire2: [Lf / 2 + 9, d0 + 8], well: [Lf / 2 + 11, d0 + 22] });
    plan.courts.push({ s: [Lf / 2 - 10, Lf / 2 + 10], d: [d0 + 33, d0 + 49], cella: 2, cellaTowers: true, arches: [[0, 0.5]], pil: { bay: 3.6, w: 1.3, proud: 0.28 }, dado: true, vessels: true, doors: [[1, 0.5], [3, 0.5]], fire: [Lf / 2 - 6, d0 + 37] });
    plan.courts.push({ s: [6, 14], d: [d0 + 36, d0 + 46], cella: null, pil: null, plain: true, bins: true });
    plan.raised.push({ s: [Lf / 2 - 13, Lf / 2 + 13], d: [d0 + 50.6, D - 3.4], rise: 1.0 });
    plan.stairHead = [Lf - 8, D - 9];
    return plan;
  }
  if (axis === 'straight') {
    const cellaRange = D > 36 ? 15.2 : 13.2, cd = Math.max(8, Math.min(D - d0 - cellaRange, D * 0.42));
    const cw = Math.max(10, Math.min(Lf * (0.34 + h(9) * 0.08), 17)), sg = Lf * (0.5 + (h(10) - 0.5) * 0.14);
    plan.gates.push({ edge: 0, pos: sg, w: gw, h: 5.0 + h(11) * 0.6, tw, proj: 1.0 + h(12) * 0.35, rise: 2.0 + h(13) * 0.7, grooves, rebates: 2, main: true, altar: h(14) < 0.3 ? 'double' : 'single' });
    plan.courts.push({ s: [sg - cw / 2, sg + cw / 2], d: [d0, d0 + cd], cella: 2, cellaTowers: h(15) < 0.75, blackWall: h(16) < 0.3, pil: { bay: 3.2 + h(17) * 0.8, w: 1.25, proud: 0.26 }, dado: h(18) < 0.6, vessels: h(19) < 0.5,
      doors: [[1, 0.5], [3, 0.5]], fire: [sg - cw / 2 + 2.6, d0 + 2.6] });
    if (h(20) < 0.6) plan.raised.push({ s: [sg - cw / 2 - 1.5, sg + cw / 2 + 1.5], d: [d0 + cd + 1.7, D - 3.2], rise: 0.7 + h(21) * 0.5 });
    // a second, small court in the wider flank of the larger temples
    const flankL = sg - cw / 2, flankR = Lf - (sg + cw / 2), wide = Math.max(flankL, flankR);
    if (wide > 13.5) { const s0 = flankL > flankR ? t + 2.6 : sg + cw / 2 + 4.6, sw = wide - 9.6; plan.courts.push({ s: [s0, s0 + Math.min(sw, 7.5)], d: [d0 + 1, d0 + 1 + Math.min(cd - 1, 7)], cella: null, pil: null, plain: true, bins: h(22) < 0.5 }); }
    if (h(23) < 0.45) plan.gates.push({ edge: h(24) < 0.5 ? 1 : 3, pos: (h(24) < 0.5 ? d0 + cd / 2 : D - d0 - cd / 2), w: 1.6, h: 3.6, towers: false, rebates: 1 });
    plan.stairHead = [flankL > flankR ? t + 3.5 : Lf - t - 3.5, D - 6.5];
  } else {
    // bent axis: the court behind the vestibule, the cella range on one flank (as in the Ishtar and Ishhara temples)
    const left = axis === 'left', cellaRange = 12.6;
    const cw = Math.max(9, Math.min(Lf - cellaRange - t - 5.2, 15)), cd = Math.max(9, Math.min(D - d0 - t - 4.6, 15));
    const s0 = left ? Lf - t - 4.6 - cw : t + 4.6, sg = s0 + cw * (left ? 0.3 : 0.7);
    plan.gates.push({ edge: 0, pos: sg, w: gw, h: 5.0 + h(11) * 0.6, tw, proj: 1.0 + h(12) * 0.35, rise: 2.0 + h(13) * 0.7, grooves, rebates: 2, main: true, altar: h(14) < 0.3 ? 'double' : 'single' });
    plan.courts.push({ s: [s0, s0 + cw], d: [d0, d0 + cd], cella: left ? 3 : 1, cellaTowers: h(15) < 0.75, blackWall: h(16) < 0.4, pil: { bay: 3.2 + h(17) * 0.8, w: 1.25, proud: 0.26 }, dado: h(18) < 0.6, vessels: h(19) < 0.5,
      doors: [[2, 0.5], [left ? 1 : 3, 0.5]], fire: [s0 + cw / 2, d0 + cd - 2.6] });
    if (h(20) < 0.6) plan.raised.push({ s: left ? [t + 1.2, s0 - 1.7] : [s0 + cw + 1.7, Lf - t - 1.2], d: [d0 - 1.5, d0 + cd + 1.5], rise: 0.7 + h(21) * 0.5 });
    if (h(23) < 0.5) plan.gates.push({ edge: left ? 1 : 3, pos: left ? d0 + cd / 2 : D - d0 - cd / 2, w: 1.6, h: 3.6, towers: false, rebates: 1 });
    plan.stairHead = [left ? Lf - t - 3.2 : t + 3.2, D - 5.5];
  }
  if (big && plan.gates.length < 2) plan.gates.push({ edge: 2, pos: Lf * 0.3, w: 1.5, h: 3.2, towers: false, rebates: 1, minor: true });
  return plan;
}

// ------------------------------------------------------------------------------------------------------------
// Tier-3 sites: street shrines, daises and pedestals (SPEC 3.14: "about 20 more street altars and small shrines").
// Chosen from the layout's own open ground (unbuilt lots at a street), so no house is removed. Pure and stateless.
// ------------------------------------------------------------------------------------------------------------
let SITES = null;
function shrineSites(ctx) {
  if (SITES) return SITES;
  const { layout, mathx: M, ground, W } = ctx, sites = [];
  const add = (kind, x, z, rotDeg, size, note, face) => {
    const ring = M.openRing(M.rectRing(x, z, size[0], size[1], rotDeg));
    sites.push({ kind, x, z, rotDeg, size, ring, note, face: face || null });
  };
  // excavated: the pedestal in "Ziggurat Street" 190 m east of the precinct gate (R5 4.1: 523, -6) and the pedestal a
  // few metres from the NE corner of the Nabu temple (Pedersen 4.5)
  add('pedestal', 523, -6, 0, [2.6, 2.6], 'pedestal in the Ziggurat Street (excavated)');
  { const nb = M.openRing(W.monument('nabuShaHare').footprint.polygon); add('pedestal', nb[1][0] + 4.6, nb[1][1] - 3.4, 15.5, [2.4, 2.4], 'pedestal at the NE corner of the Nabu temple (excavated)'); }
  // conjectural: open-air shrines (ibratu) and daises (parakku) of the kind Tintir counts by the hundred, on
  // unbuilt lots beside a street, spread over the quarters
  const cands = [];
  for (const o of layout.openSpaces) {
    if (o.kind !== 'lot' || !(o.use === 'empty' || o.use === 'sliver') || !(o.area > 28 && o.area < 260)) continue;
    const c = o.center, enc = W.enclosureAt(c[0], c[1]);
    if (enc !== 'innerEast' && enc !== 'innerWest') continue;
    if (!M.pointInPolygon(c[0], c[1], o.polygon) || M.distToRing(c[0], c[1], o.polygon) < 2.3) continue;
    const st = layout.nearestStreetPoint(c[0], c[1], { maxDist: 14 });
    if (!st || st.dist > 9 || st.street.cls === 'processional') continue;
    if (W.monumentAt(c[0], c[1]) || ground.isWater(c[0], c[1])) continue;
    if (Math.hypot(c[0] - 480, c[1] + 287) < 60 || Math.hypot(c[0] - 533, c[1] + 228) < 45) continue;      // not on the standpoints of shots 7 and 8
    cands.push({ o, c, st, key: hash2(Math.round(c[0] * 3), Math.round(c[1] * 3), 4711) });
  }
  cands.sort((a, b) => a.key - b.key);
  const want = 22, chosen = [];
  for (const q of cands) {
    if (chosen.length >= want) break;
    if (chosen.some((p) => Math.hypot(p.c[0] - q.c[0], p.c[1] - q.c[1]) < 190)) continue;
    chosen.push(q);
  }
  chosen.forEach((q, i) => {
    const toStreet = [q.st.x - q.c[0], q.st.z - q.c[1]], l = Math.hypot(toStreet[0], toStreet[1]) || 1, az = M.dirToAz(toStreet[0] / l, toStreet[1] / l);
    const kind = ['ibratu', 'dais', 'ibratu', 'altar'][i % 4];
    const size = kind === 'ibratu' ? [4.4, 3.6] : kind === 'dais' ? [3.2, 3.2] : [2.4, 2.4];
    add(kind, q.c[0], q.c[1], az, size, kind + ' (conjectural)', az);
  });
  SITES = sites;
  return sites;
}

// ------------------------------------------------------------------------------------------------------------
// Geometry
// ------------------------------------------------------------------------------------------------------------
function makeTools(ctx) {
  const { geom, ground, materials, mathx: M, THREE } = ctx, kit = geom.kit;
  const Q = (w, a, b, c, d, n) => kit.quadTo(w, a, b, c, d, n[0], n[1], n[2]);
  const UP = [0, 1, 0];
  const colWhite = geom.toRGB(materials.color('templePlasterWhite')), colRoof = geom.toRGB(materials.color('roofEarth')), colBrick = geom.toRGB(materials.color('bakedBrickBuff'));
  const farMat = materials.preset('houseLime');
  const doorMat = materials.preset('planks', { vertical: true });
  const potMat = materials.preset('pottery');
  const paveMat = 'courtBrickPaving';
  const LG = [geom.TILE, 1024];                                               // LOD grid shared with the far level

  /** Paint the faces of a geometry for which test(centroid, normal) is true. */
  function paintFaces(g, color, test) {
    const pos = g.attributes.position, idx = g.index, n = pos.count;
    let col = g.attributes.color;
    if (!col) { col = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3); g.setAttribute('color', col); }
    const P = pos.array, C = col.array, I = idx.array;
    for (let t = 0; t < idx.count; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      if (!test(cx, cy, cz, nx / l, ny / l, nz / l)) continue;
      for (const k of [a, b, c]) { C[k] = color[0]; C[k + 1] = color[1]; C[k + 2] = color[2]; }
    }
    return g;
  }
  const box = (x, z, sx, sz, y0, y1, rotDeg = 0, bottom = false) => geom.box({ x, z, y0, y1, sx, sz, rotDeg, bottom });
  /** The kit darkens the back of every recess by a quarter: right for a narrow groove, too much for a wide shallow curtain. */
  function softenAO(g, k) {
    const a = g.attributes.ao; if (!a || k >= 1) return g;
    for (let i = 0; i < a.count; i++) a.array[i] = 1 - (1 - a.array[i]) * k;
    return g;
  }

  // ---------------------------------------------------------------------------------------- small furniture
  /** A brick or mud-brick altar: stepped base, body with grooved faces, a table slab; ash on top. Returns the level of its top. */
  function altarInto(G, x, z, rotDeg, y, { size = 1.2, height = 0.95, brick = false, plinth = true } = {}) {
    const dst = brick ? G.brick : G.white, s = size;
    if (plinth) dst.push(box(x, z, s + 0.44, s + 0.44, y - 0.5, y + 0.14, rotDeg));
    const y0 = y + (plinth ? 0.14 : 0);
    dst.push(geom.nichedPrism(M.rectRing(x, z, s, s, rotDeg), y0 - 0.05, y0 + height, { bay: s, nicheWidth: 0, nicheDepth: 0, grooves: { count: 2, width: 0.15, depth: 0.07, gap: s * 0.36 }, socle: 0.12, frieze: 0.16, minEdge: 0.4, top: false }));
    dst.push(box(x, z, s + 0.12, s + 0.12, y0 + height, y0 + height + 0.1, rotDeg, true));
    G.dark.push(box(x, z, s * 0.62, s * 0.62, y0 + height + 0.1, y0 + height + 0.135, rotDeg));        // ash and charred offerings
    return y0 + height + 0.14;
  }
  /** A paved place: baked bricks on the flat, a border of bricks set on edge (Koldewey at the Ninmah altar). */
  function padInto(G, ring, y, base) {
    G.brick.push(geom.prism(ring, base, y, { top: false }));
    G.pave.push(geom.cap(ring, y));
    G.brick.push(geom.wall(M.openRing(ring), { closed: true, thickness: 0.12, offset: (M.polygonArea(ring) > 0 ? 1 : -1) * 0.06, base: y - 0.2, top: y + 0.05 }));
  }
  /** Bronze fire bowl on a brick foot. */
  function brazierInto(G, x, z, y, r = 0.42) {
    G.brick.push(box(x, z, 0.5, 0.5, y - 0.2, y + 0.55, 0));
    G.bronze.push(new THREE.CylinderGeometry(r, r * 0.55, 0.3, 10).translate(x, y + 0.7, z));
    G.dark.push(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.04, 10).translate(x, y + 0.85, z));
    return [x, y + 0.95, z];
  }
  const jarProfile = [[0.0, 0], [0.17, 0], [0.3, 0.3], [0.31, 0.62], [0.2, 0.86], [0.13, 0.93], [0.17, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const jarInto = (G, x, z, y, s = 1) => G.pot.push(new THREE.LatheGeometry(jarProfile, 9).scale(s, s, s).translate(x, y, z));
  const vaseProfile = [[0.0, 0], [0.13, 0], [0.1, 0.1], [0.2, 0.34], [0.14, 0.52], [0.18, 0.58]].map(([r, y]) => new THREE.Vector2(r, y));

  // ---------------------------------------------------------------------------------------- gateways
  /**
   * A doorway in a wall face: a tower-flanked gateway (towers: true) or a plain rebated portal, with its black-washed
   * reveals, door leaves and bronze bands. at = point on the wall face, n = the way it looks.
   */
  function gateInto(G, at, n, o) {
    const az = M.dirToAz(n[0], n[1]), towers = o.towers !== false;
    const dw = o.w, dh = o.h, rebates = o.rebates ?? 2, rebStep = 0.3, rebDepth = 0.36;
    const tw = towers ? o.tw : 0, margin = towers ? 0.55 + rebates * rebStep : 0.5 + rebates * rebStep;
    const width = dw + 2 * margin + 2 * tw, depth = o.depth ?? 3.6, proud = o.proud ?? (towers ? 0.32 : 0.1);
    const cx = at[0] + n[0] * (proud - depth / 2), cz = at[1] + n[1] * (proud - depth / 2);
    const top = o.top, zf = -depth / 2;
    let g, merlonLines = [], roofCaps = [];
    if (towers) {
      const td = Math.min(depth - 0.3, o.towerDepth ?? 2.5);
      const gw = geom.gateway({ x: cx, z: cz, facingDeg: az, width, depth, base: o.base, floor: o.floor, top, towerWidth: tw, towerDepth: td, towerProjection: o.proj, towerTop: o.towerTop,
        door: { width: dw, height: dh, arch: o.arch !== false }, rebates, parapet: 0.8, parapetThickness: 0.42, grooves: o.grooves });
      g = gw.geometry; merlonLines = gw.merlonLines;
      // rolled-mud tops: the two tower platforms and the roof of the gate block behind the front merlons
      for (const ml of merlonLines.slice(2)) roofCaps.push({ ring: geom.insetRing(M.openRing(ml.line), 0.2), y: o.towerTop + 0.12 });
      const L2 = (lx, lz) => M.localToWorld([cx, cz], az, lx, lz);
      roofCaps.push({ ring: [L2(-width / 2 + 0.06, zf + 0.62), L2(width / 2 - 0.06, zf + 0.62), L2(width / 2 - 0.06, depth / 2 - 0.62), L2(-width / 2 + 0.06, depth / 2 - 0.62)], y: top + 0.12 });
    } else {
      g = geom.passageBlock({ x: cx, z: cz, rotDeg: az, width, depth, base: o.base, floor: o.floor, top, door: { width: dw, height: dh, arch: o.arch !== false }, rebates, rebateDepth: rebDepth, rebateStep: rebStep });
      if (o.merlons !== false) merlonLines = [{ line: [M.localToWorld([cx, cz], az, -width / 2 + 0.2, zf + 0.3), M.localToWorld([cx, cz], az, width / 2 - 0.2, zf + 0.3)], y: top }];
      const L2 = (lx, lz) => M.localToWorld([cx, cz], az, lx, lz);
      if (o.roofCap !== false) roofCaps.push({ ring: [L2(-width / 2 + 0.06, zf + 0.62), L2(width / 2 - 0.06, zf + 0.62), L2(width / 2 - 0.06, depth / 2 - 0.3), L2(-width / 2 + 0.06, depth / 2 - 0.3)], y: top + 0.12 });
    }
    // black wash: everything inside the opening behind the outermost frame (Koldewey 1914 p. 299)
    const kRebD = towers ? 0.4 : rebDepth, kRebS = towers ? 0.35 : rebStep, half = dw / 2 + rebates * kRebS + 0.02, crown = o.floor + dh + rebates * kRebS + 0.02;
    if (o.black !== false) paintFaces(g, BLACK, (x, y, z) => {
      const l = M.worldToLocal([cx, cz], az, x, z);
      return Math.abs(l[0]) <= half && y <= crown && y >= o.floor - 0.08 && l[1] > zf + (rebates > 0 ? kRebD : 0.3) - 0.02 && l[1] < depth / 2 - 0.01;
    });
    // the wall before a cella is black with asphalt all over (Reuther 1926; Pedersen fig. 4.26, 4.35)
    if (o.blackFront) paintFaces(g, BLACK, (x, y, z, nx, ny, nz) => {
      const l = M.worldToLocal([cx, cz], az, x, z);
      return Math.abs(l[1] - zf) < 0.01 && nx * n[0] + nz * n[1] > 0.9 && Math.abs(l[0]) < width / 2 - tw + 0.01;
    });
    (o.into || G.white).push(g);
    // door leaves (closed): two valves of cedar planks with bronze bands, set behind the reveals
    const lz = zf + rebates * kRebD + 0.3, lp = M.localToWorld([cx, cz], az, 0, lz), r = M.rightOf(n[0], n[1]);
    if (o.leaf !== false) {
      for (const sgn of [-1, 1]) G.wood.push(box(lp[0] + r[0] * sgn * (dw / 4 + 0.012), lp[1] + r[1] * sgn * (dw / 4 + 0.012), dw / 2, 0.13, o.floor - 0.04, o.floor + dh, az));
      const bp = M.localToWorld([cx, cz], az, 0, lz - 0.085);
      for (const k of [0.1, 0.36, 0.62]) G.bronze.push(box(bp[0], bp[1], dw - 0.06, 0.035, o.floor + dh * k, o.floor + dh * k + 0.16, az, true));
      // the door posts turn in bronze ferrules (Koldewey 1914 fig. 39)
      for (const sgn of [-1, 1]) G.bronze.push(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 8).translate(lp[0] + r[0] * sgn * (dw / 2 - 0.1) + n[0] * 0.14, o.floor + 0.17, lp[1] + r[1] * sgn * (dw / 2 - 0.1) + n[1] * 0.14));
    } else {
      // an open door: darkness behind it
      (o.into || G.white).push(geom.paint(box(lp[0] - n[0] * 0.5, lp[1] - n[1] * 0.5, dw + 0.5, 0.2, o.floor - 0.05, o.floor + dh + 0.3, az), [0.02, 0.02, 0.02]));
    }
    return { cx, cz, az, width, depth, proud, merlonLines, roofCaps, front: [at[0] + n[0] * proud, at[1] + n[1] * proud] };
  }

  // ---------------------------------------------------------------------------------------- a temple
  function buildTemple(T) {
    const p = T.plan, F = p.facade, ring = T.ring, E = T.E, P = T.P, floor = T.floor, top = T.top, base = T.base;
    const roofY = top - 0.85, body = p.body || 'templePlasterWhite', bodyCol = body === 'templePlasterWhite' ? colWhite : colBrick;
    const PT = PARAPET_T + F.nd, aoK = Math.max(0.3, Math.min(1, (F.nd / F.nw) * 2.4));
    const G = { white: [], plaster: [], pmerlon: [], roof: [], bitumen: [], brick: [], pave: [], wood: [], bronze: [], pot: [], dark: [], merlon: [], strip: [] };
    const tall = [], out = { altars: 0, fires: 0, smoke: 0, merlons: 0, gates: [], courts: [], altarList: [], tall };
    const Rin = geom.insetRing(ring, PT);
    const edgeAt = (i, s, off = 0) => [E[i].a[0] + E[i].e[0] * s + E[i].n[0] * off, E[i].a[1] + E[i].e[1] * s + E[i].n[1] * off];

    // ---- the kisu: a baked-brick revetment at the foot; the recesses of the facade begin above it -----------------
    const kisuTop = Math.max(floor + 0.28, T.gmin + 0.5) + (p.kisu || 0);
    const nicheBase = p.noKisu ? Math.max(floor + 0.35, T.gmax + 0.45) : Math.max(floor + 0.2, kisuTop + 0.2, T.gmax + 0.3);

    // ---- gates: resolve their place on the wall ---------------------------------------------------------
    const gates = (p.gates || []).map((g) => {
      const towers = g.towers !== false, rebates = g.rebates ?? 2, margin = (towers ? 0.55 : 0.5) + rebates * 0.3;
      const width = g.w + 2 * margin + 2 * (towers ? g.tw : 0);
      const i = g.edge % 4, pos = Math.max(width / 2 + PT + 0.5, Math.min(E[i].L - width / 2 - PT - 0.5, g.pos));
      const at = edgeAt(i, pos), n = E[i].n, gOut = ground.height(at[0] + n[0] * 3.2, at[1] + n[1] * 3.2);
      // a sunken temple (floor below the street, as the Ashratum temple): the sill lies at the street, steps go down inside
      const sill = Math.max(floor, gOut + 0.06);
      const blockTop = towers ? top + 0.55 : g.minor ? Math.min(top - 1.6, sill + g.h + 1.3) : top + 0.35;
      return { ...g, i, pos, width, towers, rebates, sill, blockTop };
    });

    // ---- outer skin: towers (pilasters) and recessed curtains between the gates, open to the wall top -----------
    // The recesses run from just above the kisu to the top of the wall ("vertical grooves carried from top to
    // bottom of the walls", Koldewey 1914 p. 55); the parapet and its merlons step back with them.
    const w = geom.writer({ verts: 2048 });
    const merlonRuns = [];                                   // [{ i, sa, sb, y, off }] plan stretches for merlons
    const inner = (i, s) => (s < 0.01 ? Rin[i] : s > E[i].L - 0.01 ? Rin[(i + 1) % 4] : edgeAt(i, s, -PT));
    const topQuad = (i, sa, sb, y) => { const A = edgeAt(i, sa), B = edgeAt(i, sb), Bi = inner(i, sb), Ai = inner(i, sa); Q(w, [A[0], y, A[1]], [B[0], y, B[1]], [Bi[0], y, Bi[1]], [Ai[0], y, Ai[1]], UP); };
    for (let i = 0; i < 4; i++) {
      const e = E[i], zones = gates.filter((g) => g.i === i).map((g) => [g.pos - g.width / 2, g.pos + g.width / 2, g]).sort((a, b) => a[0] - b[0]);
      let cur = 0;
      const segs = [];
      for (const z of zones) { if (z[0] > cur + 0.01) segs.push([cur, z[0], false]); segs.push([z[0], z[1], true, z[2]]); cur = z[1]; }
      if (cur < e.L - 0.01) segs.push([cur, e.L, false]);
      for (const [sa, sb, isGate, gz] of segs) {
        const pa = edgeAt(i, sa), pb = edgeAt(i, sb), len = sb - sa;
        if (isGate) {
          // the gate block stands in the wall here: no skin behind it (a minor door is lower than the wall: skin above it)
          topQuad(i, sa, sb, top);
          if (gz.minor) { const y0 = gz.blockTop - 0.05; w.quad(pb[0], y0, pb[1], pa[0], y0, pa[1], pa[0], top, pa[1], pb[0], top, pb[1]); merlonRuns.push({ i, sa, sb, y: top, off: 0.25 }); }
          continue;
        }
        // towers and recesses of this stretch (the same layout as kit.facadeProfile); a tower at a corner of the
        // building is at least as wide as the parapet is deep, so that the two wall tops meet in a clean mitre
        const nb = Math.max(1, Math.round(len / F.bay)), bl = len / nb, atCorner = sa < 0.01 || sb > e.L - 0.01;
        const nw = Math.min(F.nw, bl * 0.92, atCorner ? bl - 2 * (PT + 0.12) : Infinity);
        if (len < 1.6 || nw < 0.8) {
          w.quad(pb[0], base, pb[1], pa[0], base, pa[1], pa[0], top, pa[1], pb[0], top, pb[1]);
          topQuad(i, sa, sb, top);
          merlonRuns.push({ i, sa, sb, y: top, off: 0.25, corner0: sa < 0.01, corner1: sb > e.L - 0.01 });
          continue;
        }
        G.white.push(softenAO(geom.nichedFacade({ a: pb, b: pa, side: 1, base, top, nicheBase, nicheTop: top, bay: F.bay, nicheWidth: nw, nicheDepth: F.nd, steps: F.steps, stepWidth: F.sw }), aoK));
        const st = Math.max(1, Math.min(F.steps, Math.floor(nw / (2 * F.sw) + 0.5) || 1));
        let u = sa;
        for (let k = 0; k <= nb; k++) {
          const r0 = sa + k * bl + (bl - nw) / 2, r1 = r0 + nw;            // recess k
          const p1 = k < nb ? r0 : sb;                                       // tower from u to p1
          if (p1 > u + 0.02) {
            const c0 = u < 0.01, c1 = p1 > e.L - 0.01;
            if (F.raise > 0) G.white.push(geom.prism([edgeAt(i, u), edgeAt(i, p1), inner(i, p1), inner(i, u)], top, top + F.raise));
            else topQuad(i, u, p1, top);
            merlonRuns.push({ i, sa: u, sb: p1, y: top + (F.raise || 0), off: 0.25, corner0: c0, corner1: c1, tower: true });
          }
          if (k < nb) {
            // the top of the curtain in the recess: between the stepped outline and the inner face of the parapet
            const flat = [];
            const add = (sx, dep) => { const q = edgeAt(i, sx, -dep); flat.push(q[0], q[1]); };
            for (let j = 0; j < st; j++) { if (j > 0) add(r0 + j * F.sw, (j * F.nd) / st); add(r0 + j * F.sw, ((j + 1) * F.nd) / st); }
            for (let j = st - 1; j >= 0; j--) { add(r1 - j * F.sw, ((j + 1) * F.nd) / st); if (j > 0) add(r1 - j * F.sw, (j * F.nd) / st); }
            add(r1, PT); add(r0, PT);
            w.polygon(flat, null, top, true);
            merlonRuns.push({ i, sa: r0 + (st - 1) * F.sw, sb: r1 - (st - 1) * F.sw, y: top, off: F.nd + 0.25, recess: true });
            u = r1;
          }
        }
      }
    }
    // ---- parapet: inner face ---------------------------------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const ai = Rin[i], bi = Rin[(i + 1) % 4], e = E[i];
      Q(w, [ai[0], roofY, ai[1]], [bi[0], roofY, bi[1]], [bi[0], top, bi[1]], [ai[0], top, ai[1]], [-e.n[0], 0, -e.n[1]]);
    }
    G.white.push(w);

    // ---- courts ------------------------------------------------------------------------------------------------
    const roofHoles = [], farHoles = [];
    const kerbTop = roofY + 0.45;
    (p.courts || []).forEach((c, ci) => {
      const [s0, s1] = c.s, [d0, d1] = c.d;
      const cr = [P(s0, d0), P(s1, d0), P(s1, d1), P(s0, d1)];
      const cE = edgesOf(cr);                                          // court sides; their n points OUT of the court (into the walls)
      let fy = floor + 0.02;
      for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) { const q = P(s0 + (s1 - s0) * a / 4, d0 + (d1 - d0) * b / 4), hh = Math.max(ground.height(q[0], q[1]), ground.meshHeight ? ground.meshHeight(q[0], q[1]) : -1e9) - 0.13; if (hh + 0.04 > fy) fy = hh + 0.04; }
      const outline = c.pil ? M.openRing(kit.nichedOutline(cr, { bay: c.pil.bay, nicheWidth: c.pil.w, nicheDepth: c.pil.proud, steps: 1 })) : cr;
      const kerbOuter = geom.insetRing(cr, -0.45);
      const proud = c.pil ? c.pil.proud : 0;
      const sidePoint = (k, t, off = 0) => { const e = cE[k]; return [e.a[0] + (e.b[0] - e.a[0]) * t - e.n[0] * off, e.a[1] + (e.b[1] - e.a[1]) * t - e.n[1] * off]; };
      const inward = (k) => [-cE[k].n[0], -cE[k].n[1]];
      const cuts = [[], [], [], []];                                   // per side: [u0, u1] stretches of wall replaced by a door block
      const blackTop = kerbTop - 0.001;
      let bandsWs = null;

      // an arched opening in a court wall: a framed block proud of the wall, black inside, darkness behind
      const archInto = (k, t, dw, dh, frames) => {
        const e = cE[k], q = sidePoint(k, t, proud + 0.06), n = inward(k), azq = M.dirToAz(n[0], n[1]), bc = [q[0] - n[0] * 0.6, q[1] - n[1] * 0.6];
        G.plaster.push(paintFaces(geom.passageBlock({ x: bc[0], z: bc[1], rotDeg: azq, width: dw + 1.5, depth: 1.2, base: fy - 0.4, floor: fy, top: fy + 5.6, door: { width: dw, height: dh, arch: true }, rebates: frames, rebateDepth: 0.3, rebateStep: 0.25 }), BLACK,
          (x, y, z) => { const l = M.worldToLocal(bc, azq, x, z); return Math.abs(l[0]) < dw / 2 + frames * 0.25 + 0.02 && y < fy + dh + frames * 0.25 + 0.02 && l[1] > -0.6 + 0.28 && l[1] < 0.59; }));
        G.plaster.push(geom.paint(box(q[0] - n[0] * 1.25, q[1] - n[1] * 1.25, dw + 0.4, 0.2, fy - 0.05, fy + dh + 0.3, azq), [0.02, 0.02, 0.02]));
        cuts[k].push([t * e.L - dw / 2 - 0.3, t * e.L + dw / 2 + 0.3, fy + 5.55]);
      };

      // the cella front: grooved towers either side of a double-framed door, all of it black inside
      if (c.cella !== null && c.cella !== undefined) {
        const k = c.cella, at = sidePoint(k, 0.5), n = inward(k), sideLen = cE[k].L;
        const dw = Math.min(2.0, sideLen * 0.2), tw = c.cellaTowers ? Math.min(2.3, (sideLen - dw - 3) / 2 * 0.6) : 0;
        const gt = gateInto(G, at, n, { w: dw, h: 4.3, towers: !!c.cellaTowers, tw, proj: 0.55, towerDepth: 1.5, depth: 2.4, proud: proud + 0.07, base: fy - 0.4, floor: fy, top: c.cellaTowers ? kerbTop + 0.12 : fy + 5.6,
          towerTop: roofY + 1.5, grooves: { count: tw > 1.9 ? 2 : 1, width: 0.26, depth: 0.2, gap: 0.8 }, rebates: 2, leaf: false, merlons: false, roofCap: false, into: G.plaster, blackFront: !!c.blackWall });
        cuts[k].push([sideLen / 2 - dw / 2 - 0.3, sideLen / 2 + dw / 2 + 0.3, c.cellaTowers ? Infinity : fy + 5.55]);
        if (c.cellaTowers) {
          for (const rc of gt.roofCaps.slice(0, 2)) G.roof.push(geom.cap(rc.ring, rc.y));
          for (const ml of gt.merlonLines.slice(2)) G.pmerlon.push(geom.merlons(ml.line, { y: ml.y, pitch: 1.05, width: 0.68, height: 0.7, thickness: 0.42 }));
        }
        // side cellae (Ninurta): plain black doors in the same wall
        for (const t of c.cellaSide || []) archInto(k, t, 1.5, 3.4, 1);
        const r = M.rightOf(n[0], n[1]);
        // a fire bowl beside the cella door (SPEC 3.19: torches and braziers in temple courts)
        { const q = [at[0] + n[0] * (proud + 2.0) + r[0] * (dw / 2 + 2.3), at[1] + n[1] * (proud + 2.0) + r[1] * (dw / 2 + 2.3)], fp = brazierInto(G, q[0], q[1], fy + 0.03, 0.5); ctx.emitters.add({ kind: 'fireBowl', pos: fp, size: 1.1 }); out.fires++; }
        if (c.vessels) for (const dx of [-0.9, 0, 0.9]) { const q = [at[0] + n[0] * (proud + 2.3) + r[0] * dx, at[1] + n[1] * (proud + 2.3) + r[1] * dx]; G.bronze.push(new THREE.LatheGeometry(vaseProfile, 8).translate(q[0], fy + 0.035, q[1])); }
        if (c.altars) for (const dx of [-1.3, 1.3]) { const q = [at[0] + n[0] * (proud + 3.2) + r[0] * dx, at[1] + n[1] * (proud + 3.2) + r[1] * dx]; altarInto(G, q[0], q[1], M.dirToAz(n[0], n[1]), fy + 0.03, { size: 0.9, height: 0.8, plinth: false }); }
      }
      // the doors from the vestibules: an arched opening in the court side that a gate faces
      for (const g of gates) {
        if (g.minor) continue;
        const gp = edgeAt(g.i, g.pos), gn = E[g.i].n;
        for (let k = 0; k < 4; k++) {
          const e = cE[k]; if (e.n[0] * gn[0] + e.n[1] * gn[1] < 0.9) continue;                        // the side whose wall looks back at the gate
          const rel = [gp[0] - e.a[0], gp[1] - e.a[1]], along = rel[0] * e.e[0] + rel[1] * e.e[1], dist = rel[0] * e.n[0] + rel[1] * e.n[1];
          if (along < 1.6 || along > e.L - 1.6 || dist < 2 || dist > 16 || k === c.cella) continue;
          archInto(k, along / e.L, Math.min(g.w, 2.2), Math.min(g.h, 4.6), 1);
        }
      }
      for (const [k, t] of c.arches || []) archInto(k, t, 2.2, 4.6, 2);

      // walls: pilasters, black dado bands, the black wall before the cella; cut where a door block stands
      const cw = geom.writer({ verts: 1024 });
      const bandsW = c.dado ? [{ y0: fy - 0.3, y1: fy + 0.95, c: BLACK }, { y0: fy + 0.95, y1: fy + 2.5, c: [1, 1, 1] }, { y0: fy + 2.5, y1: fy + 2.74, c: BLACK }, { y0: fy + 2.74, y1: kerbTop, c: [1, 1, 1] }]
        : [{ y0: fy - 0.3, y1: kerbTop, c: [1, 1, 1] }];
      // every wall is split at the level of the door blocks, so that the baked occlusion of the pieces above a door
      // matches the wall beside them
      const split = (bs) => bs.flatMap((b) => (b.y0 < fy + 5.55 && b.y1 > fy + 5.55 + 0.3 ? [{ ...b, y1: fy + 5.55 }, { ...b, y0: fy + 5.55 }] : [b]));
      const bandsB = split([{ y0: fy - 0.3, y1: blackTop, c: BLACK }, { y0: blackTop, y1: kerbTop, c: [1, 1, 1] }]);
      bandsWs = split(bandsW);
      for (let k = 0; k < 4; k++) {
        const e = cE[k], n = inward(k), bands = c.blackWall && k === c.cella ? bandsB : bandsWs;
        const pts = c.pil ? kit.facadeProfile(e.L, { bay: c.pil.bay, nicheWidth: c.pil.w, nicheDepth: c.pil.proud, steps: 1 }).points : [[0, 0], [e.L, 0]];
        const Wp = (s, dep, y) => [e.a[0] + e.e[0] * s + n[0] * dep, y, e.a[1] + e.e[1] * s + n[1] * dep];
        const emit = (sa, da, sb, db, nrm, ymin = -Infinity) => { for (const b of bands) { const y0 = Math.max(b.y0, ymin); if (y0 >= b.y1 - 1e-4) continue; cw.color(b.c); Q(cw, Wp(sa, da, y0), Wp(sb, db, y0), Wp(sb, db, b.y1), Wp(sa, da, b.y1), nrm); } };
        for (let j = 0; j < pts.length - 1; j++) {
          const a = pts[j], b = pts[j + 1];
          if (Math.abs(b[0] - a[0]) < 1e-6) {                             // the side of a pilaster
            const z = cuts[k].find((q) => a[0] > q[0] && a[0] < q[1]);
            const sg = b[1] > a[1] ? -1 : 1;
            emit(a[0], a[1], b[0], b[1], [e.e[0] * sg, 0, e.e[1] * sg], z ? z[2] : -Infinity);
            continue;
          }
          // a face along the wall: where a door block stands only the part above the block is built
          let segs = [[a[0], b[0], -Infinity]];
          for (const z of cuts[k]) segs = segs.flatMap(([u, v, ym]) => (ym > -Infinity || z[1] <= u || z[0] >= v ? [[u, v, ym]] : [[u, Math.min(v, z[0]), ym], [Math.max(u, z[0]), Math.min(v, z[1]), z[2]], [Math.max(u, z[1]), v, ym]].filter(([x, y]) => y - x > 1e-4)));
          for (const [u, v, ym] of segs) emit(u, a[1], v, a[1], [n[0], 0, n[1]], ym);
        }
      }
      cw.color(1, 1, 1);
      G.plaster.push(cw);
      G.plaster.push(geom.cap(kerbOuter, kerbTop, { holes: [outline] }));
      G.plaster.push(geom.prism(kerbOuter, roofY, kerbTop, { top: false }));
      roofHoles.push(kerbOuter); farHoles.push(cr);
      // floor: asphalt over brick (dark in the shell material for the distance, bitumen close by)
      G.plaster.push(geom.paint(geom.cap(cr, fy), FLOOR_DARK));
      G.bitumen.push(geom.cap(cr, fy + 0.035));
      const cc = P((s0 + s1) / 2, (d0 + d1) / 2);
      out.courts.push({ center: [cc[0], fy, cc[1]], size: [s1 - s0, d1 - d0] });

      // doors of the rooms round the court: dark leaves under timber lintels, in the recesses between the pilasters
      for (const [k, t0] of c.doors || []) {
        const len = cE[k].L, nb = c.pil ? Math.max(1, Math.round(len / c.pil.bay)) : 1, bl = len / nb;
        const t = c.pil && nb > 1 ? Math.max(1, Math.min(nb - 1, Math.round(t0 * nb))) * bl / len : t0;
        if (cuts[k].some((z) => t * len > z[0] - 1.2 && t * len < z[1] + 1.2)) continue;
        const q = sidePoint(k, t), n = inward(k);
        const dr = geom.doorway({ x: q[0], z: q[1], facingDeg: M.dirToAz(n[0], n[1]), base: fy, width: 1.15, height: 2.5, proud: 0.05, lintel: { height: 0.22, overhang: 0.25, proud: 0.1 } });
        G.wood.push(dr.leaf, dr.lintel);
      }
      // furniture
      const az0 = M.dirToAz(E[0].e[0], E[0].e[1]);
      if (c.well) { const q = P(c.well[0], c.well[1]); G.brick.push(geom.prism(M.rectRing(q[0], q[1], 1.9, 1.9, az0), fy - 0.3, fy + 0.62, { holes: [M.rectRing(q[0], q[1], 1.1, 1.1, az0)] })); G.dark.push(geom.cap(M.rectRing(q[0], q[1], 1.1, 1.1, az0), fy + 0.07)); }
      for (const fk of ['fire', 'fire2']) if (c[fk]) { const q = P(c[fk][0], c[fk][1]), fp = brazierInto(G, q[0], q[1], fy + 0.03, 0.46); ctx.emitters.add({ kind: 'brazier', pos: fp, size: 1.25 }); out.fires++; }
      if (c.bins) for (const [a, b] of [[0.3, 0.32], [0.68, 0.6]]) { const q = P(s0 + (s1 - s0) * a, d0 + (d1 - d0) * b); G.pot.push(new THREE.CylinderGeometry(0.62, 0.7, 0.9, 12).translate(q[0], fy + 0.45, q[1])); G.dark.push(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 12).translate(q[0], fy + 0.9, q[1])); }
      if (!c.plain) {
        // storage jars in a corner
        const h1 = hash2(T.seed & 0xffff, ci, 5), jc = P(s0 + 1.5 + proud, d1 - 1.5 - proud);
        for (let j = 0; j < 3 + Math.floor(h1 * 3); j++) jarInto(G, jc[0] + (hash2(j, ci, T.seed & 0xfff) - 0.5) * 1.5, jc[1] + (hash2(j, ci + 9, T.seed & 0xfff) - 0.5) * 1.5, fy + 0.035, 0.8 + hash2(j, 3, T.seed & 0xfff) * 0.5);
      }
    });

    // ---- roof -------------------------------------------------------------------------------------------------
    G.roof.push(geom.cap(Rin, roofY, { holes: roofHoles }));
    {
      // low ridges where the walls of the rooms come up through the rolled mud of the roof (mud-plastered wall tops)
      const tint = [0, 1, 2].map((k) => Math.min(1, (colRoof[k] / colWhite[k]) * 1.1)), Lf = E[0].L, D = Math.min(E[1].L, E[3].L);
      const obst = [];
      for (const c of p.courts || []) obst.push([c.s[0] - 0.6, c.s[1] + 0.6, c.d[0] - 0.6, c.d[1] + 0.6]);
      for (const rz of p.raised || []) obst.push([rz.s[0] - 0.1, rz.s[1] + 0.1, rz.d[0] - 0.1, rz.d[1] + 0.1]);
      if (p.stairHead) obst.push([p.stairHead[0] - 2.1, p.stairHead[0] + 2.1, p.stairHead[1] - 1.7, p.stairHead[1] + 1.7]);
      for (const g of gates) { const q = edgeAt(g.i, g.pos), rel = [q[0] - E[0].a[0], q[1] - E[0].a[1]], gs = rel[0] * E[0].e[0] + rel[1] * E[0].e[1], gd = -(rel[0] * E[0].n[0] + rel[1] * E[0].n[1]), hw = g.width / 2 + 0.3; obst.push([gs - Math.max(hw, 4), gs + Math.max(hw, 4), gd - Math.max(hw, 4), gd + Math.max(hw, 4)]); }
      const run = (alongS, fixed, lo, hi, h) => {
        let segs = [[lo, hi]];
        for (const o of obst) {
          const [a0, a1, b0, b1] = alongS ? o : [o[2], o[3], o[0], o[1]];
          if (fixed < b0 - 0.4 || fixed > b1 + 0.4) continue;
          segs = segs.flatMap(([u, v]) => (a1 <= u || a0 >= v ? [[u, v]] : [[u, Math.min(v, a0)], [Math.max(u, a1), v]].filter(([x, y]) => y - x > 0.05)));
        }
        for (const [u, v] of segs) {
          if (v - u < 3.6) continue;
          const a = alongS ? P(u, fixed) : P(fixed, u), b = alongS ? P(v, fixed) : P(fixed, v);
          G.plaster.push(geom.paint(box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]), 0.72, roofY - 0.1, roofY + h, Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI), tint));
        }
      };
      const c0 = (p.courts || [])[0];
      if (c0) {
        const m = PT + 0.02;
        for (const d of [c0.d[0] - 1.5, c0.d[1] + 1.5]) if (d > m + 2.5 && d < D - m - 2.5) run(true, d, m, Lf - m, 0.2);
        for (const sv of [c0.s[0] - 1.5, c0.s[1] + 1.5]) if (sv > m + 2.5 && sv < Lf - m - 2.5) run(false, sv, m, D - m, 0.16);
      }
    }
    for (const rz of p.raised || []) {
      // the cella building rises above the other roofs (a self-contained block: Koldewey 1914 p. 296)
      const rr = [P(rz.s[0], rz.d[0]), P(rz.s[1], rz.d[0]), P(rz.s[1], rz.d[1]), P(rz.s[0], rz.d[1])];
      if (!rr.every((q) => M.pointInPolygon(q[0], q[1], Rin))) continue;
      G.white.push(geom.parapetBlock(rr, { base: roofY - 0.2, top: roofY + rz.rise, parapet: 0.55, thickness: 0.4 }));
      G.roof.push(geom.cap(geom.insetRing(rr, 0.42), roofY + rz.rise + 0.12));
    }
    if (p.stairHead) {
      // the head of the roof stair (the long narrow passages beside the cella held the stairs: Koldewey 1914 p. 63)
      const q = P(p.stairHead[0], p.stairHead[1]), az = M.dirToAz(E[0].e[0], E[0].e[1]), rr = M.openRing(M.rectRing(q[0], q[1], 3.4, 2.6, az));
      if (rr.every((v) => M.pointInPolygon(v[0], v[1], Rin) && !roofHoles.some((hh) => M.pointInPolygon(v[0], v[1], hh) || M.distToRing(v[0], v[1], hh) < 0.6))) {
        G.white.push(geom.parapetBlock(rr, { base: roofY - 0.2, top: roofY + 2.0, parapet: 0.3, thickness: 0.3 }));
        G.roof.push(geom.cap(geom.insetRing(rr, 0.32), roofY + 2.12));
        const dn = [E[0].n[0], E[0].n[1]], dp = [q[0] + dn[0] * 1.3, q[1] + dn[1] * 1.3];
        const dr = geom.doorway({ x: dp[0], z: dp[1], facingDeg: M.dirToAz(dn[0], dn[1]), base: roofY, width: 0.85, height: 1.7, proud: 0.05, lintel: { height: 0.16, overhang: 0.18, proud: 0.09 } });
        G.wood.push(dr.leaf, dr.lintel);
      }
    }

    // ---- gates ----------------------------------------------------------------------------------------------
    for (const g of gates) {
      const e = E[g.i], at = edgeAt(g.i, g.pos), n = e.n;
      const sill = g.sill, topG = g.blockTop;
      const gt = gateInto(G, at, n, { ...g, base, floor: sill, top: topG, towerTop: top + (g.rise || 2.2), depth: g.towers ? 3.6 : g.minor ? 1.3 : 1.8, towerDepth: (g.proj || 1.2) + 0.32 + PT + 0.45, merlons: !g.minor, roofCap: !g.minor });
      for (const rc of gt.roofCaps) G.roof.push(geom.cap(rc.ring, rc.y));
      // merlons: the front between the towers and the towers themselves (not the back edge of the block on the roof)
      gt.merlonLines.forEach((ml, k) => { if (g.towers && k === 1) return; G.merlon.push(geom.merlons(ml.line, { y: ml.y, ...MERLON })); G.strip.push(geom.merlonStrip(ml.line, { y: ml.y, ...MERLON })); out.merlons += Math.floor(M.polylineLength(ml.line) / MERLON.pitch); });
      if (g.towers) tall.push([at[0], top + (g.rise || 2.2) + 1.7, at[1]]);
      // steps or a ramp up to the sill
      const f = gt.front, rise = sill - ground.height(f[0] + n[0] * 2.5, f[1] + n[1] * 2.5);
      let run = 0;
      const azIn = M.dirToAz(-n[0], -n[1]);
      if (rise > 0.1) {
        if (g.ramp) {
          run = Math.max(2.5, rise * 6.5);
          const gO = ground.height(f[0] + n[0] * run, f[1] + n[1] * run);
          G.brick.push(geom.ramp({ x: f[0] + n[0] * (run - 0.06), z: f[1] + n[1] * (run - 0.06), azDeg: azIn, width: g.w + 1.0, length: run, rise: sill - gO, base: gO, sink: 1.0 }));
          const r = M.rightOf(n[0], n[1]);
          for (const sg of [-1, 1]) G.brick.push(geom.wall([[f[0] + n[0] * (run - 0.06) + r[0] * sg * (g.w / 2 + 0.72), f[1] + n[1] * (run - 0.06) + r[1] * sg * (g.w / 2 + 0.72)], [f[0] + r[0] * sg * (g.w / 2 + 0.72), f[1] + r[1] * sg * (g.w / 2 + 0.72)]], { thickness: 0.44, base: gO - 1.0, top: (x, z, s) => gO + (sill - gO) * (s / run) + 0.5 }));
        } else {
          const steps = Math.max(1, Math.round(rise / 0.155)), tread = 0.36;
          run = steps * tread;
          const gO = ground.height(f[0] + n[0] * (run + 0.4), f[1] + n[1] * (run + 0.4)), riser = (sill - gO) / steps;
          G.brick.push(geom.stairs({ x: f[0] + n[0] * (run - 0.05), z: f[1] + n[1] * (run - 0.05), azDeg: azIn, width: g.w + (g.towers ? 2.2 : 1.0), steps, riser, tread, base: gO, sink: 1.0, parapet: steps > 3 ? { height: 0.45, thickness: 0.42 } : null }));
        }
      }
      // threshold slab
      G.brick.push(box(f[0] - n[0] * 0.3, f[1] - n[1] * 0.3, g.w - 0.04, 0.62, sill - 0.3, sill + 0.012, M.dirToAz(n[0], n[1])));
      out.gates.push({ x: f[0], z: f[1], y: sill, facingDeg: M.dirToAz(n[0], n[1]), width: g.w, main: !!g.main, run });
      // the altar before the main door, on its paved place
      if (g.main) {
        let pos = null;
        const d = T.m.dims || {};
        if (Array.isArray(d.altar)) pos = [d.altar];
        else if (Array.isArray(d.streetAltars)) pos = d.streetAltars;
        const az = M.dirToAz(n[0], n[1]), r = M.rightOf(n[0], n[1]);
        if (!pos && g.altar) {
          const dist = run + (g.towers ? g.proj : 0) + 3.4, c0 = [f[0] + n[0] * dist, f[1] + n[1] * dist];
          pos = g.altar === 'double' ? [[c0[0] - r[0] * 0.95, c0[1] - r[1] * 0.95], [c0[0] + r[0] * 0.95, c0[1] + r[1] * 0.95]] : [c0];
        }
        if (pos) {
          const brick = /brick altar/i.test(JSON.stringify(d.forecourt || '')) || T.id === 'ishtarAgadeTemple';
          const groups = Array.isArray(d.streetAltars) ? pos.map((q) => [q]) : [pos];
          for (const grp of groups) {
            const cx = grp.reduce((a, q) => a + q[0], 0) / grp.length, cz = grp.reduce((a, q) => a + q[1], 0) / grp.length;
            const atDoor = Math.abs((cx - f[0]) * r[0] + (cz - f[1]) * r[1]) < 3 && (cx - f[0]) * n[0] + (cz - f[1]) * n[1] < 12;
            // before the door the baked-brick paving reaches from the steps to beyond the altar (R5 3.2: patches of
            // brick paving in front of temple doors); a pedestal elsewhere has a small place of its own
            let pr;
            if (atDoor) {
              const da = (cx - f[0]) * n[0] + (cz - f[1]) * n[1], dA = run + (run > 0 ? 0.02 : 0.03), dB = da + 2.5, hw = Math.max(2.6, g.towers ? g.width / 2 - 0.4 : g.w / 2 + 1.6, grp.length > 1 ? 3.3 : 0);
              pr = [[f[0] + n[0] * dA - r[0] * hw, f[1] + n[1] * dA - r[1] * hw], [f[0] + n[0] * dA + r[0] * hw, f[1] + n[1] * dA + r[1] * hw], [f[0] + n[0] * dB + r[0] * hw, f[1] + n[1] * dB + r[1] * hw], [f[0] + n[0] * dB - r[0] * hw, f[1] + n[1] * dB - r[1] * hw]];
            } else pr = M.openRing(M.rectRing(cx, cz, 2.9, 2.9, az));
            let gy = -Infinity; for (const q of pr) gy = Math.max(gy, ground.height(q[0], q[1]));
            gy = Math.max(gy, ground.height(cx, cz));
            const py = gy + 0.14;
            padInto(G, pr, py, gy - 0.8);
            for (const q of grp) { const ty = altarInto(G, q[0], q[1], az, py, { brick, size: grp.length > 1 ? 1.1 : 1.25 }); out.altars++; out.altarList.push({ x: q[0], y: ty, z: q[1] }); tall.push([q[0], ty, q[1]]); }
            if (hash2(T.seed & 0xffff, Math.round(cx), 17) < 0.45) { ctx.emitters.add({ kind: 'smoke', pos: [grp[0][0], py + 1.3, grp[0][1]], size: 0.6 }); out.smoke++; }
          }
        }
      }
    }

    // ---- merlons along the walls ---------------------------------------------------------------------------
    for (const mr of merlonRuns) {
      const pad = mr.tower || mr.recess ? 0.1 : 0.2;
      const a0 = mr.corner0 ? mr.sa + 0.3 : mr.sa + pad, b0 = mr.corner1 ? mr.sb - 0.3 : mr.sb - pad;
      if (b0 - a0 < 0.8) continue;
      const line = [edgeAt(mr.i, a0, -mr.off), edgeAt(mr.i, b0, -mr.off)];
      const n = Math.max(1, Math.floor((b0 - a0) / 0.99 + 1e-9));
      G.merlon.push(geom.merlons(line, { y: mr.y, ...MERLON, pitch: (b0 - a0) / n }));
      out.merlons += n;
    }
    // the far stand-in: one strip per edge at the wall top
    for (let i = 0; i < 4; i++) G.strip.push(geom.merlonStrip([edgeAt(i, 0.3, -0.25), edgeAt(i, E[i].L - 0.3, -0.25)], { y: top, ...MERLON }));

    // ---- kisu: the baked-brick revetment at the foot (a plinth course), spouts, gutter --------------------------
    if (!T.hasApron && !p.noKisu) {
      const kr = geom.insetRing(ring, -0.3);
      G.brick.push(geom.prism(kr, base, kisuTop, { top: false }));
      G.brick.push(geom.cap(kr, kisuTop, { holes: [ring] }));
    } else if (T.hasApron) {
      // Ninmah: the double kisu shows as a brick-paved apron round the temple at the level of the floor (Pedersen fig. 4.47)
      const ay = floor + 0.05;
      G.brick.push(geom.prism(T.outer, base, ay, { top: false }));
      G.pave.push(geom.cap(T.outer, ay, { holes: [ring] }));
    }
    const nsp = p.spouts || 0;
    for (let i = 0; i < 4 && nsp; i++) {
      const e = E[i];
      for (let k = 0; k < nsp; k++) {
        // on a pilaster: between two recesses of the facade layout
        const nb = Math.max(1, Math.round(e.L / F.bay)), bl = e.L / nb, j = Math.max(1, Math.min(nb - 1, Math.round(((k + 0.5) / nsp) * nb)));
        const s = j * bl;
        if (gates.some((g) => g.i === i && Math.abs(g.pos - s) < g.width / 2 + 0.8)) continue;
        const q = edgeAt(i, s);
        G.pot.push(geom.spout({ x: q[0], y: roofY + 0.04, z: q[1], azDeg: M.dirToAz(e.n[0], e.n[1]), length: 0.62, width: 0.2, height: 0.14, drop: 0.07 }));
        // a brick-lined rill on the roof leads the rain to the outlet through the parapet
        const g0 = edgeAt(i, s, -PT + 0.02), g1 = edgeAt(i, s, -PT - 2.6), gm = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2];
        if (!roofHoles.some((hh) => M.pointInPolygon(g1[0], g1[1], hh) || M.distToRing(g1[0], g1[1], hh) < 0.5)) {
          G.pave.push(box(gm[0], gm[1], 0.42, 2.6, roofY - 0.1, roofY + 0.08, M.dirToAz(e.n[0], e.n[1])));
          G.dark.push(box(g0[0], g0[1], 0.26, 0.06, roofY + 0.02, roofY + 0.2, M.dirToAz(e.n[0], e.n[1])));
        }
      }
    }
    if (p.gutter) {
      // a vertical brick gutter in the front carries the rain off the roof (Koldewey 1914 p. 233)
      const e = E[p.gutter.edge], q = edgeAt(p.gutter.edge, p.gutter.pos, 0.2);
      G.brick.push(box(q[0], q[1], 0.75, 0.42, base, roofY + 0.3, M.dirToAz(e.n[0], e.n[1])));
    }
    if (p.cornerTower) {
      // Ninurta: an additional grooved tower at the corner where two gateways adjoin (Koldewey 1914 p. 233)
      const cnr = ring[1], e0 = E[0], e1 = E[1];
      const cxz = [cnr[0] - e0.e[0] * 1.7 + e1.e[0] * 1.7, cnr[1] - e0.e[1] * 1.7 + e1.e[1] * 1.7];
      const tr = M.openRing(M.rectRing(cxz[0] + (e0.n[0] + e1.n[0]) * 0.45, cxz[1] + (e0.n[1] + e1.n[1]) * 0.45, 4.3, 4.3, M.dirToAz(e0.n[0], e0.n[1])));
      G.white.push(geom.nichedPrism(tr, base, top + 1.6, { bay: 4.3, nicheWidth: 0, nicheDepth: 0, grooves: { count: 2, width: 0.32, depth: 0.22, gap: 1.0 }, socle: floor - base + 1.0, frieze: 1.0, top: false }));
      G.white.push(geom.parapetBlock(tr, { base: top + 1.6, top: top + 1.6, parapet: 0.8, thickness: 0.42 }));
      G.roof.push(geom.cap(geom.insetRing(tr, 0.44), top + 1.72));
      G.merlon.push(geom.merlons(M.closeRing(geom.insetRing(tr, 0.25)), { y: top + 2.4, ...MERLON }));
      tall.push([cxz[0], top + 3.3, cxz[1]]);
    }
    for (const q of ring) tall.push([q[0], top + 1.4, q[1]]);

    // ---- far level: one painted block ------------------------------------------------------------------------
    const far = [geom.paint(geom.prism(ring, base, top, { holes: farHoles, top: false }), bodyCol), geom.paint(geom.cap(ring, top - 0.4, { holes: farHoles }), colRoof)];
    for (const h of farHoles) far.push(geom.paint(geom.cap(h, floor + 0.05), FLOOR_DARK));
    for (const g of gates) if (g.towers) { const at = edgeAt(g.i, g.pos, 0.3); far.push(geom.paint(box(at[0], at[1], g.width, 3.2, base, top + (g.rise || 2.2), M.dirToAz(E[g.i].n[0], E[g.i].n[1])), bodyCol)); }
    if (T.hasApron) far.push(geom.paint(geom.prism(T.outer, base, floor + 0.05), colBrick));

    // ---- submit ------------------------------------------------------------------------------------------------
    if (body === 'templePlasterWhite') { G.white.push(...G.plaster); G.plaster = []; G.merlon.push(...G.pmerlon); G.pmerlon = []; }
    const white = geom.merge(G.white);
    out.inspect = (() => { try { const r = geom.inspect(white); return { flipped: r.flipped, overlap: r.overlap, openAbove: +r.openAbove.toFixed(2), tris: r.tris }; } catch (err) { return { flipped: -1, overlap: -1, openAbove: -1, tris: 0 }; } })();
    geom.addLODs(body, [{ geometry: white, max: 1500 }, { geometry: geom.merge(far), material: farMat, tile: 1024, ao: false }]);
    if (G.plaster.length) geom.addStatic('templePlasterWhite', geom.merge(G.plaster), { lod: [0, 1500], lodGrid: LG });
    if (G.pmerlon.length) geom.addStatic('templePlasterWhite', geom.merge(G.pmerlon), { lod: [0, 600] });
    geom.addStatic('roofEarth', geom.merge(G.roof), { castShadow: false, lod: [0, 1500], lodGrid: LG });
    if (G.bitumen.length) geom.addStatic('bitumen', geom.merge(G.bitumen), { castShadow: false, lod: [0, 400], occluder: false });
    if (G.dark.length) geom.addStatic('bitumen', geom.merge(G.dark), { castShadow: false, lod: [0, 400], occluder: false });
    if (G.brick.length) geom.addStatic('bakedBrickBuff', geom.merge(G.brick), { lod: [0, 800] });
    if (G.pave.length) geom.addStatic(paveMat, geom.merge(G.pave), { castShadow: false, lod: [0, 800] });
    if (G.wood.length) geom.addStatic(doorMat, geom.merge(G.wood), { castShadow: false, lod: [0, 400] });
    if (G.bronze.length) geom.addStatic('bronze', geom.merge(G.bronze), { castShadow: false, lod: [0, 300], shadowTexel: 0.15 });
    if (G.pot.length) geom.addStatic(potMat, geom.merge(G.pot), { lod: [0, 300], shadowTexel: 0.15 });
    if (G.merlon.length) geom.addStatic(body, geom.merge(G.merlon), { lod: [0, 600] });
    if (G.strip.length) geom.addStatic(geom.merlonStripMaterial(body, MERLON.width / MERLON.pitch, 3), geom.merge(G.strip), { lod: [600, 1500], lodGrid: LG, ao: false });
    return out;
  }

  // ---------------------------------------------------------------------------------------- tier 3
  function buildShrines(sites) {
    const G = { white: [], roof: [], bitumen: [], brick: [], pave: [], wood: [], bronze: [], pot: [], dark: [], merlon: [] };
    const res = { shrines: 0, altars: 0, smoke: 0, list: [], tall: [] };
    sites.forEach((s, i) => {
      let gy = -Infinity; for (const q of s.ring) gy = Math.max(gy, ground.height(q[0], q[1]));
      gy = Math.max(gy, ground.height(s.x, s.z));
      const az = s.rotDeg, n = M.azToDir(az), r = M.rightOf(n[0], n[1]), py = gy + 0.14;
      if (s.kind === 'pedestal' || s.kind === 'altar') {
        padInto(G, s.ring, py, gy - 0.8);
        const ty = altarInto(G, s.x, s.z, az, py, { brick: s.kind === 'pedestal', size: s.kind === 'pedestal' ? 1.5 : 1.15, height: s.kind === 'pedestal' ? 1.05 : 0.9 });
        res.altars++; res.tall.push([s.x, ty, s.z]);
        if (hash2(i, 3, 99) < 0.35) { ctx.emitters.add({ kind: 'smoke', pos: [s.x, ty + 0.2, s.z], size: 0.5 }); res.smoke++; }
      } else if (s.kind === 'dais') {
        // a throne-dais (parakku): two brick steps and a whitewashed socle with a niche for the symbol
        G.brick.push(box(s.x, s.z, s.size[0], s.size[1], gy - 0.8, gy + 0.22, az));
        G.brick.push(box(s.x - n[0] * 0.25, s.z - n[1] * 0.25, s.size[0] - 0.8, s.size[1] - 0.9, gy + 0.22, gy + 0.44, az));
        const bx = s.x - n[0] * 0.55, bz = s.z - n[1] * 0.55;
        G.white.push(geom.nichedPrism(M.rectRing(bx, bz, 1.7, 1.1, az), gy + 0.4, gy + 2.5, { bay: 1.7, nicheWidth: 0.8, nicheDepth: 0.32, steps: 2, stepWidth: 0.12, socle: 0.5, frieze: 0.35, edges: [0], minEdge: 0.5, top: true }));
        G.merlon.push(geom.merlons([[bx - r[0] * 0.75, bz - r[1] * 0.75], [bx + r[0] * 0.75, bz + r[1] * 0.75]], { y: gy + 2.5, pitch: 0.5, width: 0.34, height: 0.36, thickness: 0.5 }));
        G.bronze.push(box(bx + n[0] * 0.3, bz + n[1] * 0.3, 0.1, 0.06, gy + 0.9, gy + 1.75, az, true));       // the god's standard
        G.bronze.push(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 12).rotateX(Math.PI / 2).rotateY(-az * Math.PI / 180).translate(bx + n[0] * 0.3, gy + 1.88, bz + n[1] * 0.3));
        res.shrines++; res.tall.push([bx, gy + 2.9, bz]);
      } else {
        // an open-air shrine (ibratu): a whitewashed nook open to the street: a back wall with a stepped niche for
        // the symbol under small merlons, two low wing walls, a paved floor with the altar
        const wd = s.size[0], dp = s.size[1], hh = 2.7, th = 0.5;
        const L2 = (lx, lz) => M.localToWorld([s.x, s.z], az, lx, lz);                // local -z looks at the street
        const bc = L2(0, dp / 2 - th / 2);
        G.white.push(geom.nichedPrism(M.rectRing(bc[0], bc[1], wd, th, az), gy - 0.6, gy + hh, { bay: wd, nicheWidth: 1.15, nicheDepth: 0.3, steps: 2, stepWidth: 0.14, socle: 1.35, frieze: 0.5, edges: [0], minEdge: 0.3 }));
        for (const sg of [-1, 1]) { const a = L2(sg * (wd / 2 - th / 2), dp / 2 - th), b = L2(sg * (wd / 2 - th / 2), -dp / 2 + 0.3); G.white.push(geom.wall([a, b], { thickness: th, base: gy - 0.6, top: gy + 1.45 })); }
        G.merlon.push(geom.merlons([L2(-wd / 2 + 0.15, dp / 2 - th / 2), L2(wd / 2 - 0.15, dp / 2 - th / 2)], { y: gy + hh, pitch: 0.62, width: 0.42, height: 0.42, thickness: th }));
        G.pave.push(geom.prism([L2(-wd / 2 + th, -dp / 2 + 0.1), L2(wd / 2 - th, -dp / 2 + 0.1), L2(wd / 2 - th, dp / 2 - th), L2(-wd / 2 + th, dp / 2 - th)], gy - 0.6, gy + 0.12));
        const a = L2(0, -0.2); altarInto(G, a[0], a[1], az, gy + 0.12, { size: 0.85, height: 0.75, plinth: false });
        const j = L2(wd / 2 - th - 0.45, dp / 2 - th - 0.45); jarInto(G, j[0], j[1], gy + 0.12, 0.7);
        const sy = L2(0, dp / 2 - th - 0.12); G.bronze.push(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12).rotateX(Math.PI / 2).rotateY(-az * Math.PI / 180).translate(sy[0], gy + 1.5, sy[1]));
        res.shrines++; res.altars++; res.tall.push([s.x, gy + hh + 1.0, s.z]);
        if (hash2(i, 7, 99) < 0.3) { ctx.emitters.add({ kind: 'smoke', pos: [a[0], gy + 1.2, a[1]], size: 0.45 }); res.smoke++; }
      }
      res.list.push({ kind: s.kind, x: s.x, z: s.z, y: gy, facingDeg: az, note: s.note });
    });
    if (G.white.length) geom.addStatic('templePlasterWhite', geom.merge(G.white), { lod: [0, 900] });
    if (G.merlon.length) geom.addStatic('templePlasterWhite', geom.merge(G.merlon), { lod: [0, 300] });
    if (G.brick.length) geom.addStatic('bakedBrickBuff', geom.merge(G.brick), { lod: [0, 900] });
    if (G.pave.length) geom.addStatic(paveMat, geom.merge(G.pave), { castShadow: false, lod: [0, 900] });
    if (G.dark.length) geom.addStatic('bitumen', geom.merge(G.dark), { castShadow: false, lod: [0, 300], occluder: false });
    if (G.bronze.length) geom.addStatic('bronze', geom.merge(G.bronze), { castShadow: false, lod: [0, 300] });
    if (G.pot.length) geom.addStatic(potMat, geom.merge(G.pot), { lod: [0, 300], shadowTexel: 0.15 });
    return res;
  }

  return { buildTemple, buildShrines };
}
