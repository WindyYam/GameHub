// js/modules/southpalace/plan.js — the plan of the South Palace in PALACE-LOCAL coordinates.
//
// Local frame: origin = centre of the Main Courtyard (world.json dims.courts.main.center), +x = palace east,
// +z = palace south, metres. These are the palace's own true-cardinal lines: rotated dims.interiorRotationDeg
// (15.5 degrees) clockwise against the model axes. The enclosure wall is NOT on these lines: it is the oblique
// quadrilateral of footprint.polygon, and every room that meets it is cut back to a rectangle that fits inside
// (the "saw-tooth inner faces" of Koldewey ch. XV, XVI).
//
// The plan is a painter's list of rectangles ("blocks") on a 0.25 m lattice: roofed rooms at their own roof
// levels, paved floors (five great courts, about fifty light wells, lanes), solid brick blocks (gate buildings,
// towers, the dividing wall). Later blocks paint over earlier ones. Nothing here touches three.js.
//
// Sources for the arrangement: SPEC 3.8, R4 section 3 (court sizes, principal rooms on the SOUTH side of every
// court, gate buildings between the eastern three courts, the 3.5 m dividing wall west of the Main Courtyard,
// the Vaulted Building as 2 x 7 cells either side of a corridor, small houses of one court each elsewhere) and
// Pedersen 2021 Fig. 6.2 (tmp/spec/palace_crop.png). Which room stands exactly where is generated (seeded).

export const CELL = 0.25;
export const K = { OUT: 0, WALL: 1, ROOF: 2, FLOOR: 3, BRICK: 4 };
export const snap = (v) => Math.round(v / CELL) * CELL;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * @param o.outline  local ring, open, clockwise seen from above: NW, NE, SE, SW
 * @param o.courts   { east, middle, main, west, annex }: local rings (open)
 * @param o.throne, o.vault  local rings; o.westHall { center: [x, z], size: [w, d] }; o.gate [x, z] (local)
 * @param o.floor    palace floor level (datum); o.rng seeded generator; o.gateSill level of the street at the gate
 */
export function makePlan(o) {
  const { outline, rng, floor: F } = o, FP = F + 0.05, INSET = o.inset ?? 4.25;
  const blocks = [null], openings = [], houses = [];
  let houseId = 0;

  // ------------------------------------------------------------------ the enclosure as half-planes ----
  const edges = outline.map((p, i) => { const q = outline[(i + 1) % outline.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); return { px: p[0], pz: p[1], nx: -dz / l, nz: dx / l }; });
  /** Distance to the outer face of the enclosure, positive inside. */
  const outlineDist = (x, z) => { let d = Infinity; for (const e of edges) d = Math.min(d, (x - e.px) * e.nx + (z - e.pz) * e.nz); return d; };
  const inside = (x, z) => outlineDist(x, z) >= INSET - 1e-6;
  /** z of the inner face of the south / north wall at x; x of the inner face of the east / west wall at z. */
  const lineZ = (e, x) => e.pz + (INSET - (x - e.px) * e.nx) / e.nz, lineX = (e, z) => e.px + (INSET - (z - e.pz) * e.nz) / e.nx;
  const south = edges[2], north = edges[0], east = edges[1], west = edges[3];
  const southZ = (x) => lineZ(south, x), northZ = (x) => lineZ(north, x), eastX = (z) => lineX(east, z), westX = (z) => lineX(west, z);

  // a rectangle -> the rectangles of it that fit inside the enclosure (cut into pieces of at most 5 m, each shrunk)
  function fit(r, out) {
    const c = inside(r.x0, r.z0) + inside(r.x1, r.z0) + inside(r.x1, r.z1) + inside(r.x0, r.z1);
    if (c === 4) { out.push(r); return; }
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (c === 0 && w <= 5 && d <= 5 && !inside((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)) return;
    if (w > 5 || d > 5) {
      if (w >= d) { const m = snap(r.x0 + w / 2); fit({ x0: r.x0, z0: r.z0, x1: m, z1: r.z1 }, out); fit({ x0: m, z0: r.z0, x1: r.x1, z1: r.z1 }, out); }
      else { const m = snap(r.z0 + d / 2); fit({ x0: r.x0, z0: r.z0, x1: r.x1, z1: m }, out); fit({ x0: r.x0, z0: m, x1: r.x1, z1: r.z1 }, out); }
      return;
    }
    let { x0, z0, x1, z1 } = r;
    for (const e of edges) {
      const f = (x, z) => (x - e.px) * e.nx + (z - e.pz) * e.nz - INSET;
      if (Math.min(f(x0, z0), f(x1, z0), f(x1, z1), f(x0, z1)) >= -1e-6) continue;
      if (Math.abs(e.nz) >= Math.abs(e.nx)) {
        if (e.nz > 0) z0 = Math.max(z0, Math.ceil(Math.max(lineZ(e, x0), lineZ(e, x1)) / CELL - 1e-6) * CELL);
        else z1 = Math.min(z1, Math.floor(Math.min(lineZ(e, x0), lineZ(e, x1)) / CELL + 1e-6) * CELL);
      } else if (e.nx > 0) x0 = Math.max(x0, Math.ceil(Math.max(lineX(e, z0), lineX(e, z1)) / CELL - 1e-6) * CELL);
      else x1 = Math.min(x1, Math.floor(Math.min(lineX(e, z0), lineX(e, z1)) / CELL + 1e-6) * CELL);
    }
    if (x1 - x0 >= 1 && z1 - z0 >= 1) out.push({ x0, z0, x1, z1 });
  }

  // ------------------------------------------------------------------ block constructors ----
  function block(kind, x0, z0, x1, z1, level, opt = {}) {
    x0 = snap(x0); z0 = snap(z0); x1 = snap(x1); z1 = snap(z1);
    if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return null;
    const b = { id: blocks.length, kind, x0, z0, x1, z1, level, par: 0, tag: '', house: 0, parent: 0, pieces: [], clipped: false, seed: rng.next(), ...opt };
    if (opt.noFit) b.pieces.push({ x0, z0, x1, z1 }); else fit({ x0, z0, x1, z1 }, b.pieces);
    if (!b.pieces.length) return null;
    b.clipped = b.pieces.length !== 1 || b.pieces[0].x0 !== x0 || b.pieces[0].z0 !== z0 || b.pieces[0].x1 !== x1 || b.pieces[0].z1 !== z1;
    blocks.push(b);
    return b;
  }
  const room = (x0, z0, x1, z1, h, opt = {}) => block(K.ROOF, x0, z0, x1, z1, F + h, { par: snap(rng.range(0.3, 0.85)) || 0.5, tag: 'room', ...opt });
  const paved = (x0, z0, x1, z1, tag, opt = {}) => block(K.FLOOR, x0, z0, x1, z1, FP, { tag, ...opt });
  const solid = (x0, z0, x1, z1, h, opt = {}) => block(K.BRICK, x0, z0, x1, z1, F + h, { par: 0.9, ...opt });

  function splitLen(L, a, b) {
    L = snap(L); const out = []; let rest = L;
    while (rest > b + a) { const l = snap(rng.range(a, b)); out.push(l); rest -= l; }
    if (rest > b) { const l = snap(rest / 2); out.push(l, rest - l); } else out.push(rest);
    return out;
  }
  /** A row of rooms along `axis` ('x' or 'z'). */
  function range(x0, z0, x1, z1, axis, h, house = 0, opt = {}) {
    const L = axis === 'x' ? x1 - x0 : z1 - z0;
    if (L < 1.5 || (axis === 'x' ? z1 - z0 : x1 - x0) < 1.5) return;
    let s = axis === 'x' ? x0 : z0;
    for (const l of splitLen(L, opt.min ?? 4.25, opt.max ?? 8.5)) {
      const hh = h + rng.range(-0.5, 0.5) + (rng.chance(opt.bump ?? 0.08) ? rng.range(1.4, 2.8) : 0);
      if (axis === 'x') room(s, z0, s + l, z1, hh, { house, ...opt.room }); else room(x0, s, x1, s + l, hh, { house, ...opt.room });
      s += l;
    }
  }
  /** One house: a light well with a range on each side, the principal room on the SOUTH side and taller (R4 3.4). */
  function house(x0, z0, x1, z1) {
    const w = x1 - x0, d = z1 - z0, hid = ++houseId, base = rng.range(5.2, 7.3);
    if (w >= 11 && d >= 11) {
      const cw = snap(clamp(w * rng.range(0.32, 0.44), 4.5, 10.5)), cd = snap(clamp(d * rng.range(0.30, 0.40), 4.5, 9.5));
      const cx0 = snap(x0 + (w - cw) * rng.range(0.36, 0.64)), cz0 = snap(z0 + (d - cd) * rng.range(0.30, 0.46)), cx1 = cx0 + cw, cz1 = cz0 + cd;
      const yard = paved(cx0, cz0, cx1, cz1, 'yard', { house: hid });
      range(x0, z0, x1, cz0, 'x', base, hid);
      const sw = snap(clamp(w * rng.range(0.5, 0.72), 5.5, 15)); let sx0 = snap(x0 + (w - sw) * rng.range(0.25, 0.75)), sx1 = sx0 + sw;
      if (sx0 - x0 < 2.5) sx0 = x0; if (x1 - sx1 < 2.5) sx1 = x1;
      if (sx0 > x0) room(x0, cz1, sx0, z1, base + rng.range(-0.4, 0.4), { house: hid });
      room(sx0, cz1, sx1, z1, base + rng.range(1.3, 2.5), { house: hid, tag: 'main' });
      if (sx1 < x1) room(sx1, cz1, x1, z1, base + rng.range(-0.4, 0.4), { house: hid });
      range(x0, cz0, cx0, cz1, 'z', base, hid);
      range(cx1, cz0, x1, cz1, 'z', base, hid);
      houses.push({ id: hid, x0, z0, x1, z1, yard: yard ? yard.id : 0 });
    } else range(x0, z0, x1, z1, w >= d ? 'x' : 'z', base, hid);
  }
  /** Fill a rectangle with houses; lanes of 2 m between some of the halves. */
  function fill(x0, z0, x1, z1, opt = {}) {
    x0 = snap(x0); z0 = snap(z0); x1 = snap(x1); z1 = snap(z1);
    const w = x1 - x0, d = z1 - z0, maxP = opt.max ?? 25;
    if (w < 1.5 || d < 1.5) return;
    if (w <= maxP && d <= maxP) { house(x0, z0, x1, z1); return; }
    const alongX = w >= d, L = alongX ? w : d, n = Math.max(2, Math.round(L / rng.range(17, 22)));
    const cut = snap((L * Math.max(1, Math.round(n / 2))) / n + rng.range(-1.5, 1.5)), lane = L > 44 && rng.chance(opt.lane ?? 0.4) ? 2 : 0;
    if (alongX) { fill(x0, z0, x0 + cut - lane / 2, z1, opt); if (lane) paved(x0 + cut - 1, z0, x0 + cut + 1, z1, 'lane'); fill(x0 + cut + lane / 2, z0, x1, z1, opt); }
    else { fill(x0, z0, x1, z0 + cut - lane / 2, opt); if (lane) paved(x0, z0 + cut - 1, x1, z0 + cut + 1, 'lane'); fill(x0, z0 + cut + lane / 2, x1, z1, opt); }
  }
  /** Register an opening in a wall face (cut by the mesher). axis 0: the face lies on x = at; axis 1: on z = at. dir: the way it looks. */
  const open = (spec) => { openings.push({ arch: true, depth: 1, back: 'dark', seg: 10, ...spec }); return spec; };
  /** A vaulted passage through a block from the face at `a` to the face at `b` (a < b along the axis). */
  const passage = (axis, a, b, u0, u1, sill, h, extra = {}) => {
    open({ axis, at: a, dir: -1, a0: u0, a1: u1, sill, h, depth: (b - a) / 2, back: null, seg: 14, ...extra });
    open({ axis, at: b, dir: 1, a0: u0, a1: u1, sill, h, depth: (b - a) / 2, back: null, seg: 14, ...extra });
  };

  // ------------------------------------------------------------------ the given elements ----
  const box = (ring) => ({ x0: snap(Math.min(...ring.map((p) => p[0]))), z0: snap(Math.min(...ring.map((p) => p[1]))), x1: snap(Math.max(...ring.map((p) => p[0]))), z1: snap(Math.max(...ring.map((p) => p[1]))) });
  const mc = box(o.courts.main), md = box(o.courts.middle), wc = box(o.courts.west), ac = box(o.courts.annex), ecb = box(o.courts.east);
  const th = box(o.throne), vb = box(o.vault);
  // the east court's east side is oblique (parallel to the enclosure): stepped in four
  const er = o.courts.east, ezc = (ecb.z0 + ecb.z1) / 2, eN = Math.max(...er.filter((p) => p[1] < ezc).map((p) => p[0])), eS = Math.max(...er.filter((p) => p[1] > ezc).map((p) => p[0]));
  const ec = { x0: ecb.x0, z0: ecb.z0, x1: ecb.x1, z1: ecb.z1, steps: [] };
  for (let k = 0; k < 4; k++) ec.steps.push({ z0: snap(ec.z0 + ((ec.z1 - ec.z0) * k) / 4), z1: snap(ec.z0 + ((ec.z1 - ec.z0) * (k + 1)) / 4), x1: snap(eN + ((eS - eN) * (k + 0.5)) / 4) });
  const N = -115, S = 108, Wx = Math.floor(westX(0)) - 1, Ex = 175;  // beyond the enclosure: fit() cuts back
  const dw0 = mc.x0 - 3.5;                                           // the 3.5 m dividing wall forms the west side of the Main Courtyard
  const xa = snap((ac.x1 + wc.x0) / 2);                              // party line between the ranges of the annex and west courts
  const acN = ac.z0 - 6.5, wcN = wc.z0 - 6.75, wcE = wc.x1 + 10.25;
  const axisZ = snap((md.z0 + md.z1) / 2);                            // the axis main gate -> east court -> gates -> main court
  const g2 = { x0: mc.x1, x1: md.x0, z0: axisZ - 9, z1: axisZ + 9 }, g1 = { x0: md.x1, x1: ec.x0, z0: axisZ - 7.25, z1: axisZ + 7.25 };
  const ecN = ec.z0 - 6.75;
  const wh = { x0: snap(o.westHall.center[0] - o.westHall.size[0] / 2 - 1.25), x1: snap(o.westHall.center[0] + o.westHall.size[0] / 2 + 1.25), z0: wc.z1, z1: snap(o.westHall.center[1] + o.westHall.size[1] / 2 + 2) };
  const ah = { x0: ac.x0, x1: ac.x1, z0: ac.z1, z1: ac.z1 + 10.5 }, ab = { x0: ac.x0, x1: ac.x1, z0: ah.z1, z1: ah.z1 + 10 };
  const mh = { x0: md.x0, x1: md.x1, z0: md.z1, z1: md.z1 + 11.25 };
  const thr = { x0: mc.x0, x1: Math.max(th.x1, mc.x1), z0: mc.z1, z1: th.z1 };
  // lane and casemates along the south wall (R4 3.5: "the lane running inside the Citadel wall")
  const CASE = 4.25, LANE = 2.25, laneN = (x) => Math.floor(southZ(x) / CELL) * CELL - CASE - LANE;
  const columns = (x0, x1, fn) => { for (let x = x0; x < x1 - 0.5;) { const xb = x1 - x <= 30 ? x1 : snap(x + (x1 - x) / Math.ceil((x1 - x) / 24)); fn(x, xb); x = xb; } };
  const southFill = (x0, z0, x1, opt) => columns(x0, x1, (xa, xb) => fill(xa, z0, xb, laneN(xb), opt));
  const northFill = (x0, x1, z1, opt) => columns(x0, x1, (xa, xb) => fill(xa, Math.floor(northZ(xb)), xb, z1, opt));
  const eX = (z) => Math.ceil(eastX(z));
  // the lane inside the south wall is painted first (houses stop short of it; the casemates are painted last)
  for (let x = Wx - 7; x < Ex; x += 7) { const zw = Math.floor(Math.min(southZ(x), southZ(x + 7)) / CELL) * CELL; paved(x, zw - CASE - LANE - 3, x + 7, zw, 'lane'); }

  // ------------------------------------------------------------------ 1. houses (the background) ----
  // west part: the residence (annex and west court)
  northFill(Wx, xa, acN);
  northFill(xa, dw0, wcN);
  southFill(Wx, ab.z1, ac.x1);
  southFill(ac.x1, wh.z1 + LANE, dw0);
  // main block
  northFill(mc.x0, mc.x1, mc.z0 - 7);
  southFill(thr.x0, thr.z1, thr.x1, { max: 21 });
  // east part: administration
  northFill(mc.x1, vb.x0, mc.z0);
  northFill(vb.x0, eX(vb.z0), vb.z0);
  fill(vb.x1, vb.z0, eX(vb.z1), vb.z1);
  fill(vb.x0, vb.z1, eX(mc.z0), mc.z0);
  fill(md.x0, mc.z0, eX(ecN), ecN);
  southFill(thr.x1, mc.z1, md.x0);
  southFill(md.x0, mh.z1, md.x1);
  southFill(md.x1, ec.z1, eX(ec.z1 + 30));

  // ------------------------------------------------------------------ 2. ranges round the great courts ----
  range(Wx, acN, xa, ac.z0, 'x', 6.2);                                // annex: north, west, east
  range(Wx, ac.z0, ac.x0, ab.z1, 'z', 6.0);
  range(ac.x1, ac.z0, xa, wc.z1, 'z', 6.1);
  range(xa, wcN, wcE, wc.z0, 'x', 6.4);                               // west court: north, west, east (two rows to the dividing wall)
  range(xa, wc.z0, wc.x0, wc.z1, 'z', 6.3);
  range(wc.x1, wc.z0, wcE, wc.z1, 'z', 6.5);
  range(wcE, wcN, dw0, wc.z1, 'z', 6.0, 0, { min: 5, max: 9 });
  range(ac.x1, wc.z1, wh.x0, wh.z1, 'z', 6.6);                        // beside the two halls
  fill(wh.x1, wc.z1, dw0, wh.z1);
  paved(ac.x1, wh.z1, dw0, wh.z1 + LANE, 'lane');                     // lane behind the west hall
  range(mc.x0, mc.z0 - 7, mc.x1, mc.z0, 'x', 6.8, 0, { min: 5, max: 9 });   // main court: north range
  const g2m = snap((g2.x0 + g2.x1) / 2), g1m = snap((g1.x0 + g1.x1) / 2);
  range(g2.x0, mc.z0, g2m, g2.z0, 'z', 7.0); range(g2m, mc.z0, g2.x1, g2.z0, 'z', 6.6);    // gate building 2: side rooms
  range(g2.x0, g2.z1, g2m, mc.z1, 'z', 7.0); range(g2m, g2.z1, g2.x1, mc.z1, 'z', 6.6);
  range(md.x0, ecN, md.x1, md.z0, 'x', 6.6, 0, { min: 5, max: 9 });         // middle court: north range
  range(g1.x0, ecN, g1m, g1.z0, 'z', 6.4); range(g1m, ecN, g1.x1, g1.z0, 'z', 6.8);        // gate building 1: side rooms
  range(g1.x0, g1.z1, g1m, ec.z1, 'z', 6.4); range(g1m, g1.z1, g1.x1, ec.z1, 'z', 6.8);
  range(ec.x0, ecN, eX(ec.z0), ec.z0, 'x', 7.4, 0, { bump: 0.5 });          // east court: north range ("perhaps two floors")
  for (const s of ec.steps) { range(s.x1, s.z0, s.x1 + 6.5, s.z1, 'z', 7.2, 0, { bump: 0.45 }); fill(s.x1 + 6.5, s.z0, eX(s.z1), s.z1); }

  // ------------------------------------------------------------------ 3. courts, halls, gates ----
  const court = {
    annex: paved(ac.x0, ac.z0, ac.x1, ac.z1, 'court:annex'), west: paved(wc.x0, wc.z0, wc.x1, wc.z1, 'court:west'),
    main: paved(mc.x0, mc.z0, mc.x1, mc.z1, 'court:main'), middle: paved(md.x0, md.z0, md.x1, md.z1, 'court:middle'),
    east: ec.steps.map((s) => paved(ec.x0, s.z0, s.x1, s.z1, 'court:east')),
  };
  const halls = {
    throne: room(thr.x0, thr.z0, thr.x1, thr.z1, o.throneHeight - 1.0, { par: 1.0, tag: 'throne' }),
    west: room(wh.x0, wh.z0, wh.x1, wh.z1, 11.2, { par: 0.8, tag: 'hall' }),
    annex: room(ah.x0, ah.z0, ah.x1, ah.z1, 9.4, { par: 0.7, tag: 'hall' }),
    annexBack: room(ab.x0, ab.z0, ab.x1, ab.z1, 7.8, { par: 0.6, tag: 'hall' }),
    middle: room(mh.x0, mh.z0, mh.x1, mh.z1, 10.3, { par: 0.8, tag: 'hall' }),
  };
  const divWall = solid(dw0, N, mc.x0, S, 8.6, { tag: 'divwall' });
  // gate buildings between the eastern three courts: a taller block with a vaulted passage, two towers on the side of arrival (east)
  const gate2 = { body: solid(g2.x0, g2.z0, g2.x1, g2.z1, 12.2, { par: 1.0, tag: 'gate' }), towers: [solid(g2.x1, g2.z0, g2.x1 + 1.5, axisZ - 3.5, 14.2, { tag: 'gatetower' }), solid(g2.x1, axisZ + 3.5, g2.x1 + 1.5, g2.z1, 14.2, { tag: 'gatetower' })], door: [axisZ - 2.25, axisZ + 2.25, 9.5] };
  const gate1 = { body: solid(g1.x0, g1.z0, g1.x1, g1.z1, 10.8, { par: 1.0, tag: 'gate' }), towers: [solid(g1.x1, g1.z0, g1.x1 + 1.25, axisZ - 2.75, 12.6, { tag: 'gatetower' }), solid(g1.x1, axisZ + 2.75, g1.x1 + 1.25, g1.z1, 12.6, { tag: 'gatetower' })], door: [axisZ - 2, axisZ + 2, 8.5] };
  passage(0, g2.x0, g2.x1, gate2.door[0], gate2.door[1], FP, gate2.door[2]);
  passage(0, g1.x0, g1.x1, gate1.door[0], gate1.door[1], FP, gate1.door[2]);

  // the Vaulted Building: 2 x 7 cells either side of a corridor inside a ring corridor, ranges of cells west and south (R4 3.7)
  const vcells = [];
  range(vb.x0, vb.z0, vb.x0 + 6, vb.z1 - 6, 'z', 6.3, 0, { min: 6, max: 8, bump: 0 });
  range(vb.x0, vb.z1 - 6, vb.x1, vb.z1, 'x', 6.3, 0, { min: 5, max: 7, bump: 0 });
  const core = { x0: vb.x0 + 6, z0: vb.z0, x1: vb.x1, z1: vb.z1 - 6 };
  room(core.x0, core.z0, core.x1, core.z1, 4.9, { par: 0.3, tag: 'vcorr' });
  { const x0 = core.x0 + 1.75, x1 = core.x1 - 1.75, z0 = core.z0 + 1.75, z1 = core.z1 - 1.75, xm = snap((x0 + x1) / 2);
    for (let k = 0; k < 7; k++) { const za = snap(z0 + ((z1 - z0) * k) / 7), zb = snap(z0 + ((z1 - z0) * (k + 1)) / 7), h = 6.9 + 0.25 * ((k * 3) % 4 - 1.5) * 0.4;
      vcells.push(room(x0, za, xm - 1, zb, h, { par: 0.5, tag: 'vault' }), room(xm + 1, za, x1, zb, h, { par: 0.5, tag: 'vault' })); } }

  // the south wall: casemates against it, the lane before them
  const casemate = (x) => { const zw = Math.floor(Math.min(southZ(x), southZ(x + 7)) / CELL) * CELL; room(x, zw - CASE, x + 7, zw, rng.range(5.6, 6.6), { tag: 'casemate' }); };
  for (let x = dw0 - 7; x > Wx - 7; x -= 7) casemate(x);
  for (let x = mc.x0; x < Ex; x += 7) casemate(x);

  // the main gate on the Processional Way: a gatehouse through the enclosure with two towers, a vestibule court, guard rooms
  const gz = snap(o.gate[1]), gfront = snap(o.gate[0]), gback = snap(eastX(gz) - 2), sill = o.gateSill;
  const crown = Math.min(8.6, o.wallWalk - 0.2 - sill);
  const gate = {
    body: solid(gback, gz - 9.5, gfront - 2.5, gz + 9.5, 12, { tag: 'maingate', noFit: true }),
    towers: [solid(gfront - 5.75, gz - 9.5, gfront, gz - 3.5, 14, { tag: 'maingatetower', noFit: true }), solid(gfront - 5.75, gz + 3.5, gfront, gz + 9.5, 14, { tag: 'maingatetower', noFit: true })],
    z: gz, front: gfront, back: gback, sill, door: [gz - 2, gz + 2, crown],
  };
  const vx0 = snap(gback - 5.5), link0 = vx0 - 4;
  room(link0, gz - 9.5, gback, gz - 4.5, 6.4, { tag: 'guard', noFit: true });
  room(link0, gz + 4.5, gback, gz + 9.5, 6.4, { tag: 'guard', noFit: true });
  gate.vestibule = paved(vx0, gz - 4.5, gback, gz + 4.5, 'vestibule', { noFit: true });
  gate.link = room(link0, gz - 4.5, vx0, gz + 4.5, 7.2, { tag: 'link', noFit: true, par: 0.7 });
  paved(snap(ec.steps[1].x1), gz - 4.5, link0, gz + 4.5, 'court:east', { noFit: true });      // the court reaches the link building on the axis
  passage(0, gback, gfront - 2.5, gate.door[0], gate.door[1], sill, crown);
  passage(0, link0, vx0, gz - 1.75, gz + 1.75, FP, 5.6);

  // ------------------------------------------------------------------ 4. the great doors ----
  const dThrone = o.throneDoors, cx = (mc.x0 + mc.x1) / 2, side = 17;
  const throneDoors = [[cx - side, dThrone.widths[0], dThrone.heights[0]], [cx, dThrone.widths[1], dThrone.heights[1]], [cx + side, dThrone.widths[2], dThrone.heights[2]]]
    .map(([c, w, h]) => open({ axis: 1, at: thr.z0, dir: -1, a0: c - w / 2, a1: c + w / 2, sill: FP, h, depth: 6, back: 'door', seg: 18, bands: true, tag: 'throne' }));
  open({ axis: 1, at: wh.z0, dir: -1, a0: (wh.x0 + wh.x1) / 2 - 2.35, a1: (wh.x0 + wh.x1) / 2 + 2.35, sill: FP, h: 9, depth: 2.5, back: 'door', seg: 14, bands: true });
  open({ axis: 1, at: ah.z0, dir: -1, a0: (ah.x0 + ah.x1) / 2 - 5.35, a1: (ah.x0 + ah.x1) / 2 + 5.35, sill: FP, h: 6.8, arch: false, depth: 2.25, back: 'porch' });
  open({ axis: 1, at: mh.z0, dir: -1, a0: (mh.x0 + mh.x1) / 2 - 2, a1: (mh.x0 + mh.x1) / 2 + 2, sill: FP, h: 8, depth: 2.5, back: 'door', seg: 14, bands: true });
  for (const z of [mc.z0 + 14, mc.z1 - 14]) open({ axis: 0, at: mc.x0, dir: 1, a0: z - 1.25, a1: z + 1.25, sill: FP, h: 5.6, depth: 1.5, back: 'door', bands: true });
  // small high slits under the roof line of the principal rooms (R4 section 8: "optional small high slits"; no windows were found)
  const slits = (x0, x1, z, top, skip) => { for (let x = x0 + 2.4; x < x1 - 2; x += 4.8) if (!skip.some(([a, b]) => x + 0.2 > a - 0.6 && x - 0.2 < b + 0.6)) open({ axis: 1, at: z, dir: -1, a0: x - 0.2, a1: x + 0.2, sill: top - 2.6, h: 1.1, arch: false, depth: 0.9, back: 'dark', floor: 'brick', tag: 'slit' }); };
  slits(mc.x0, mc.x1, thr.z0, F + o.throneHeight - 1, throneDoors.map((d) => [d.a0, d.a1]));
  slits(wc.x0, wc.x1, wh.z0, F + 11.2, [[(wh.x0 + wh.x1) / 2 - 2.35, (wh.x0 + wh.x1) / 2 + 2.35]]);
  slits(mh.x0, mh.x1, mh.z0, F + 10.3, [[(mh.x0 + mh.x1) / 2 - 2, (mh.x0 + mh.x1) / 2 + 2]]);

  // ------------------------------------------------------------------ grid ----
  const X0 = Math.floor(Math.min(...outline.map((p) => p[0])) - 6), Z0 = Math.floor(Math.min(...outline.map((p) => p[1])) - 6);
  const X1 = Math.ceil(Math.max(...outline.map((p) => p[0]), gfront) + 6), Z1 = Math.ceil(Math.max(...outline.map((p) => p[1])) + 6);
  return {
    blocks, openings, houses, outlineDist, edges, inset: INSET, floor: F, paving: FP,
    grid: { X0, Z0, NX: Math.round((X1 - X0) / CELL), NZ: Math.round((Z1 - Z0) / CELL) },
    courts: { main: mc, middle: md, west: wc, annex: ac, east: ec }, court, halls, divWall, gate1, gate2, gate, vault: { ...vb, cells: vcells },
    throne: { ...thr, doors: throneDoors }, axisZ, g1, g2, westHall: wh, annexHall: ah, middleHall: mh, southZ, northZ, eastX, westX, open,
  };
}
