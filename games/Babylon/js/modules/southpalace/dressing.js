// js/modules/southpalace/dressing.js — what stands in and on the palace: open flights of stairs to the roofs,
// benches, ladders, awnings and stores in the service courts, jars, mats and bedding on the roofs, drain spouts,
// bronze braziers at the gates and before the throne room, the fires and lamps (declared as emitters).
// Everything is placed in palace-local coordinates from the plan and the lattice (never on a door, a stair or a
// neighbour's roof). No figures: people belong to the `people` module (ctx.modules.southpalace gives it the courts).
import { K } from './plan.js';

/** Open flights of stairs along court walls: decided before the doors, so that no door opens under a flight. */
export function planFlights(env) {
  const { plan, lat } = env, FP = plan.paving, md = plan.courts.middle, ec = plan.courts.east, wc = plan.courts.west, ac = plan.courts.annex, out = [];
  // { foot: [x, z] centre of the first riser, dir, width, wall: the stretch of court wall it runs along, roof: a point on the roof it reaches }
  const flight = (axis, at, side, uFoot, uDir, roofPoint, maxRun) => {
    const level = lat.levelAt(roofPoint[0], roofPoint[1]), rise = level - FP;
    if (!(rise > 3 && rise < 10)) return;
    const steps = Math.round(rise / 0.2), tread = Math.min(0.29, maxRun / steps), run = steps * tread, width = 1.5, c = at + side * width / 2;
    out.push({ foot: axis === 0 ? [c, uFoot] : [uFoot, c], dir: axis === 0 ? [0, uDir] : [uDir, 0], width, steps, riser: rise / steps, tread, wall: { axis, at, u0: Math.min(uFoot, uFoot + uDir * run) - 0.5, u1: Math.max(uFoot, uFoot + uDir * run) + 0.5 } });
  };
  flight(0, md.x0, 1, md.z1 - 0.4, -1, [md.x0 - 1.6, plan.g2.z1 + 1.5], plan.axisZ + 9 < md.z1 ? md.z1 - plan.g2.z1 - 0.6 : 8);     // middle court, west wall, south of the gate tower
  flight(1, ec.z0, 1, ec.x0 + 12.5, -1, [ec.x0 + 2.5, ec.z0 - 1.6], 11.5);                                                             // east court, north wall
  flight(0, wc.x0, 1, wc.z1 - 0.4, -1, [wc.x0 - 1.6, wc.z1 - 9.5], 10);                                                                // west court, west wall
  flight(1, ac.z0, 1, ac.x1 - 0.6, -1, [ac.x1 - 9.5, ac.z0 - 1.6], 10);                                                                // annex court, north wall
  return out;
}

export function dress(env, { near, extra }) {
  const { ctx, geom, materials, M, THREE, plan, lat, L2W, P3, azOf, hash2, flights } = env, FP = plan.paving, B = plan.blocks;
  const stats = { jars: 0, mats: 0, cloths: 0, awnings: 0, ladders: 0, benches: 0, spouts: 0, braziers: 0, ovens: 0, stairs: 0 };
  let emitters = 0;
  const emit = (kind, lx, y, lz, size) => { const p = L2W(lx, lz); ctx.emitters.add({ kind, pos: [p[0], y, p[1]], size }); emitters++; };
  const rotOf = (deg) => env.rot + deg;                                   // a local rotation as a world rotDeg
  const timber = [], cloth = [], mat = [], bronze = [], clay = [], bench = [];
  const box = (lx, lz, y0, y1, sx, sz, deg = 0) => { const p = L2W(lx, lz); return geom.box({ x: p[0], z: p[1], y0, y1, sx, sz, rotDeg: rotOf(deg) }); };
  const dyes = ['linenWhite', 'woolCream', 'woolOatmeal', 'woolCream', 'linenWhite', 'dyeMadderRed', 'dyeIndigo', 'dyeSaffron', 'woolBrown'].map((id) => materials.color(id));
  const dye = (h) => dyes[Math.min(dyes.length - 1, Math.floor(h * dyes.length))];

  // ---- jars: one instanced set in two levels
  const jarNear = new THREE.LatheGeometry([[0.001, 0], [0.15, 0], [0.25, 0.2], [0.27, 0.42], [0.18, 0.6], [0.1, 0.67], [0.13, 0.73]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const jarFar = new THREE.CylinderGeometry(0.19, 0.17, 0.7, 5).translate(0, 0.35, 0), pot = materials.preset('pottery');
  const jars = geom.instancedLOD({ name: 'southpalace-jars', levels: [{ geometry: jarNear, material: pot, max: 240 }, { geometry: jarFar, material: pot, max: 1000, cell: 1024, castShadow: false }], ao: true, shadowTexel: 0.15 });
  const pale = materials.tintHex('bakedBrickBuff');
  const jar = (lx, lz, y, s, h) => { const p = L2W(lx, lz); jars.add({ x: p[0], y, z: p[1], rotDeg: 360 * h, scale: s }, h < 0.4 ? pale : 0xffffff); stats.jars++; };
  const cluster = (lx, lz, y, n, seed, big = 1) => { for (let i = 0; i < n; i++) { const a = hash2(seed, i, 31) * 6.283, r = 0.25 + 0.45 * hash2(seed, i, 32) * Math.sqrt(n); jar(lx + Math.cos(a) * r, lz + Math.sin(a) * r, y, big * (0.75 + 0.7 * hash2(seed, i, 33)), hash2(seed, i, 34)); } };

  // ---- a timber between two points (ladders, awning frames)
  const beam = (a, b, t = 0.07) => {
    const w = geom.writer({ verts: 24 }), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1, ux = dx / l, uy = dy / l, uz = dz / l;
    let sx = uz, sy = 0, sz = -ux; const sl = Math.hypot(sx, sz); if (sl < 1e-4) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    const vx = sy * uz - sz * uy, vy = sz * ux - sx * uz, vz = sx * uy - sy * ux, h = t / 2;
    const c = (p, i, j) => [p[0] + sx * h * i + vx * h * j, p[1] + sy * h * i + vy * h * j, p[2] + sz * h * i + vz * h * j];
    const q = (p0, p1, p2, p3, n) => { const e1 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], e2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]; const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2]; if (dot >= 0) w.quadP(p0, p1, p2, p3); else w.quadP(p0, p3, p2, p1); };
    for (const [i, j, n] of [[1, 0, [sx, sy, sz]], [-1, 0, [-sx, -sy, -sz]], [0, 1, [vx, vy, vz]], [0, -1, [-vx, -vy, -vz]]]) {
      const p = i ? [c(a, i, -1), c(a, i, 1), c(b, i, 1), c(b, i, -1)] : [c(a, -1, j), c(a, 1, j), c(b, 1, j), c(b, -1, j)];
      q(p[0], p[1], p[2], p[3], n);
    }
    q(c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), [-ux, -uy, -uz]); q(c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1), [ux, uy, uz]);
    return w.toGeometry();
  };
  /** An awning on four posts: local rectangle, eave heights (it slopes), a cloth tinted by `h`. */
  const awning = (x0, z0, x1, z1, y, h0, h1, h, reed = false) => {
    const A = P3(x0, y + h0, z0), Bq = P3(x1, y + h0, z0), C = P3(x1, y + h1, z1), D = P3(x0, y + h1, z1);
    for (const [p, hh] of [[A, h0], [Bq, h0], [C, h1], [D, h1]]) timber.push(beam([p[0], y - 0.2, p[2]], [p[0], y + hh, p[2]], 0.09));
    timber.push(beam(A, Bq, 0.06), beam(D, C, 0.06), beam(A, D, 0.06), beam(Bq, C, 0.06));
    const w = geom.writer({ verts: 8 }), up = (p) => [p[0], p[1] + 0.05, p[2]];
    w.quadP(up(A), up(D), up(C), up(Bq)); w.quadP(A, Bq, C, D);                         // top (faces up) and underside
    (reed ? mat : cloth).push(reed ? w.toGeometry() : geom.paint(w.toGeometry(), dye(h)));
    stats.awnings++;
  };
  const ladder = (foot, top) => {                                              // world points [x, y, z]: two rails and rungs
    const dx = top[0] - foot[0], dz = top[2] - foot[2], l = Math.hypot(dx, dz) || 1, sx = (-dz / l) * 0.24, sz = (dx / l) * 0.24, n = Math.max(4, Math.round((top[1] - foot[1]) / 0.33));
    for (const s of [-1, 1]) timber.push(beam([foot[0] + sx * s, foot[1] - 0.1, foot[2] + sz * s], [top[0] + sx * s, top[1] + 0.6, top[2] + sz * s], 0.07));
    for (let i = 1; i < n; i++) { const f = i / n, x = foot[0] + dx * f, y = foot[1] + (top[1] - foot[1]) * f, z = foot[2] + dz * f; timber.push(beam([x - sx, y, z - sz], [x + sx, y, z + sz], 0.045)); }
    stats.ladders++;
  };
  /** A bronze fire bowl on a stand, with its fire. */
  const brazier = (lx, lz, y, size = 1.3, kind = 'brazier') => {
    const p = L2W(lx, lz), g = new THREE.LatheGeometry([[0.001, 0], [0.26, 0], [0.2, 0.06], [0.07, 0.14], [0.06, 0.72], [0.12, 0.8], [0.36, 0.98], [0.4, 1.06], [0.3, 1.02], [0.001, 0.96]].map(([r, yy]) => new THREE.Vector2(r, yy)), 12);
    bronze.push(geom.transform(g, { x: p[0], y, z: p[1] }));
    emit(kind, lx, y + 1.25, lz, size); stats.braziers++;
  };

  /** A brick bench along a wall line (axis 0: x = at, axis 1: z = at) from u0 to u1, on the +side, left open before every door. */
  function benchAlong(axis, at, u0, u1, side) {
    const gaps = B.filter((r) => r && r.door && r.door.axis === axis && Math.abs(r.door.at - at) < 0.01).map((r) => [r.door.c - r.door.w / 2 - 0.6, r.door.c + r.door.w / 2 + 0.6]).sort((a, b) => a[0] - b[0]);
    let s = u0;
    const seg = (a, b) => { if (b - a < 1.6) return; const A = axis === 0 ? L2W(at, a) : L2W(a, at), Bq = axis === 0 ? L2W(at, b) : L2W(b, at); bench.push(geom.bench({ a: A, b: Bq, base: FP, height: 0.45, depth: 0.5, side: axis === 0 ? -side : side })); stats.benches++; };
    for (const g of gaps) { if (g[1] < s || g[0] > u1) continue; seg(s, Math.min(g[0], u1)); s = Math.max(s, g[1]); }
    seg(s, u1);
  }

  // ---- 1. stairs: the steps down from the gate sill into the vestibule, open flights in four courts
  const G = plan.gate;
  { const rise = G.sill - FP, steps = Math.max(1, Math.ceil(rise / 0.18)), tread = 0.32, foot = L2W(G.back - steps * tread, G.z);
    if (rise > 0.05) { extra.brick.push(geom.stairs({ x: foot[0], z: foot[1], azDeg: azOf(1, 0), width: 4.5, steps, riser: rise / steps, tread, base: FP, sink: 0.3 })); stats.stairs++; } }
  for (const f of flights) {
    const p = L2W(f.foot[0], f.foot[1]);
    extra.brick.push(geom.paint(geom.stairs({ x: p[0], z: p[1], azDeg: azOf(f.dir[0], f.dir[1]), width: f.width, steps: f.steps, riser: f.riser, tread: f.tread, base: FP, sink: 0.3 }), [0.97, 0.96, 0.94]));
    stats.stairs++;
  }
  const onFlight = (lx, lz, r = 1.2) => flights.some((f) => { const a = f.wall, u = a.axis === 0 ? lz : lx, v = a.axis === 0 ? lx : lz; return u > a.u0 - r && u < a.u1 + r && Math.abs(v - a.at) < f.width + r; });

  // ---- 2. rooms: a drain spout beside the door, things on the roof
  const spouts = [];
  for (let i = 1; i < B.length; i++) {
    const b = B[i];
    if (!b || !b.alive || b.kind !== K.ROOF || b.parent || !b.whole || b.tag === 'vcorr') continue;
    const w = b.x1 - b.x0, dp = b.z1 - b.z0, h1 = hash2(i, 1, 41), h2 = hash2(i, 2, 41), h3 = hash2(i, 3, 41), h4 = hash2(i, 4, 41);
    if (b.door) {                                          // the roof drains into the court the room opens on
      const dr = b.door, u = dr.c + (h1 < 0.5 ? -1 : 1) * (dr.w / 2 + 0.8 + h2), lo = dr.axis === 0 ? b.z0 + 0.6 : b.x0 + 0.6, hi = dr.axis === 0 ? b.z1 - 0.6 : b.x1 - 0.6;
      if (u > lo && u < hi) { const p = dr.axis === 0 ? L2W(dr.at, u) : L2W(u, dr.at); spouts.push(geom.spout({ x: p[0], y: b.level + 0.06, z: p[1], azDeg: dr.axis === 0 ? azOf(dr.dir, 0) : azOf(0, dr.dir), length: 0.65, width: 0.22, height: 0.16, drop: 0.1 })); stats.spouts++; }
    }
    if (w < 4 || dp < 4 || b.tag === 'throne') continue;
    const free = (lx, lz) => !b.head || lx < b.head.x0 - 0.6 || lx > b.head.x1 + 0.6 || lz < b.head.z0 - 0.6 || lz > b.head.z1 + 0.6;
    const cx = b.x0 + 1.2 + (w - 2.4) * h2, cz = b.z0 + 1.2 + (dp - 2.4) * h3, y = b.level;
    if (h1 < 0.3 && free(cx, cz)) {                        // sleeping place: a reed mat, bedding on it, for some a lamp
      const deg = h4 < 0.5 ? 0 : 90; mat.push(box(cx, cz, y, y + 0.035, 2.1, 1.4, deg)); stats.mats++;
      if (h3 < 0.3) emit('lamp', cx + 1.3, y + 0.35, cz, 1);
      if (h4 > 0.25) { cloth.push(geom.paint(box(cx + (deg ? 0 : 0.15), cz + (deg ? 0.15 : 0), y + 0.035, y + 0.09, 1.5, 0.85, deg), dye(hash2(i, 5, 41)))); stats.cloths++; }
    } else if (h1 < 0.46 && free(cx, cz)) cluster(cx, cz, y, 2 + Math.floor(h4 * 3), i);
    else if (h1 < 0.58 && w > 5.5 && dp > 5.5 && !b.head) {   // a shelter of reed or cloth on four posts
      const ax = b.x0 + 1 + (w - 4.8) * h2, az = b.z0 + 1 + (dp - 4.2) * h3;
      awning(ax, az, ax + 2.8, az + 2.2, y, 2.0, 1.75, hash2(i, 6, 41), h4 < 0.55);
      if (h4 > 0.4) { mat.push(box(ax + 1.4, az + 1.1, y, y + 0.035, 2.0, 1.4)); stats.mats++; }
    } else if (h1 > 0.86 && free(cx, cz)) {                // washing laid out to dry
      cloth.push(geom.paint(box(cx, cz, y, y + 0.03, 1.8 + h4, 1.1, 90 * Math.floor(h2 * 2)), dye(0.5 + 0.5 * hash2(i, 7, 41)))); stats.cloths++;
    }
  }

  // ---- 3. light wells: jars, a bench, a ladder to a roof, an awning, a lamp; four kitchens with bread ovens
  const wells = B.filter((b) => b && b.alive && b.whole && b.tag === 'yard');
  const kitchens = new Set(wells.filter((b) => b.x0 > plan.courts.main.x1 && b.x1 - b.x0 > 6).sort((a, b) => hash2(a.id, 0, 51) - hash2(b.id, 0, 51)).slice(0, 4).map((b) => b.id));
  const doorOn = (y, side) => B.some((r) => r && r.door && r.door.floor === y && r.door.side === side);     // side of the ROOM that carries the door
  for (const yb of wells) {
    const i = yb.id, w = yb.x1 - yb.x0, dp = yb.z1 - yb.z0, h1 = hash2(i, 1, 43), h2 = hash2(i, 2, 43), h3 = hash2(i, 3, 43);
    // corners: 0 NW, 1 NE, 2 SE, 3 SW
    const corner = (k, r = 0.7) => [k === 0 || k === 3 ? yb.x0 + r : yb.x1 - r, k < 2 ? yb.z0 + r : yb.z1 - r];
    const k0 = Math.floor(h1 * 4), c0 = corner(k0);
    cluster(c0[0], c0[1], FP, 2 + Math.floor(h2 * 4), i, h3 < 0.3 ? 1.6 : 1);
    if (h2 < 0.45) { const c = corner((k0 + 2) % 4, 0.8); cluster(c[0], c[1], FP, 1 + Math.floor(h3 * 3), i + 7000, 1.5); }
    if (h3 < 0.5 && w > 5) benchAlong(1, yb.z0, yb.x0 + 0.6, yb.x1 - 0.6, 1);       // a bench along the north wall, between the doors
    if (h1 < 0.6) {                                        // a ladder against a wall without a door, up to the roof behind it
      const walls = [['W', yb.x1, 0, 1], ['E', yb.x0, 0, -1], ['N', yb.z1, 1, 1], ['S', yb.z0, 1, -1]];       // [side of the ROOM that would carry a door, wall line, axis, way out of the well]
      const freeWalls = walls.filter(([side]) => !doorOn(yb, side)), pick = freeWalls[Math.floor(h2 * freeWalls.length)];
      if (pick) {
        const [, at, axis, s] = pick, u = axis === 0 ? yb.z0 + 1.2 + (dp - 2.4) * h3 : yb.x0 + 1.2 + (w - 2.4) * h3;
        const top = axis === 0 ? lat.levelAt(at + s * 0.2, u) : lat.levelAt(u, at + s * 0.2);
        if (top - FP > 3 && top - FP < 9.5) { if (axis === 0) ladder(P3(at - s * 1.5, FP, u), P3(at - s * 0.06, top, u)); else ladder(P3(u, FP, at - s * 1.5), P3(u, top, at - s * 0.06)); }
      }
    }
    if (h2 > 0.55 && w > 6 && dp > 5.5) awning(yb.x0 + 0.5, yb.z1 - 2.6, yb.x0 + 3.4, yb.z1 - 0.4, FP, 2.3, 2.6, hash2(i, 5, 43), h3 > 0.7);
    if (kitchens.has(i)) {                                 // tannur ovens: clay cylinders, their smoke by day
      for (const s of [0, 1]) { const ox = yb.x1 - 1.1 - s * 1.5, oz = yb.z0 + 1.0, p = L2W(ox, oz); clay.push(geom.transform(new THREE.CylinderGeometry(0.42, 0.55, 0.85, 10, 1, false).translate(0, 0.425, 0), { x: p[0], y: FP, z: p[1] })); stats.ovens++; }
      emit('smoke', yb.x1 - 1.1, FP + 1.0, yb.z0 + 1.0, 1);
    }
    if (h3 > 0.2) emit('lamp', c0[0] + (k0 === 0 || k0 === 3 ? 0.9 : -0.9), FP + 0.9, c0[1], 1);
  }

  // ---- 4. the great courts
  const mc = plan.courts.main, md = plan.courts.middle, ec = plan.courts.east, wc = plan.courts.west, ac = plan.courts.annex, T = plan.throne;
  // before the throne room: four bronze braziers between the doors; two at each gate building; two in the gate recess on the street
  for (const x of [(mc.x0 + T.doors[0].a0) / 2, (T.doors[0].a1 + T.doors[1].a0) / 2, (T.doors[1].a1 + T.doors[2].a0) / 2, (T.doors[2].a1 + mc.x1) / 2]) brazier(x, T.z0 - 2.4, FP, 1.5);
  for (const g of [plan.gate1, plan.gate2]) for (const s of [-1, 1]) brazier(g.towers[0].x1 + 1.6, plan.axisZ + s * (g.door[1] - plan.axisZ + 1.4), FP, 1.2);
  for (const s of [-1, 1]) brazier(G.front - 1.1, G.z + s * 2.9, G.sill, 1.5);
  for (const s of [-1, 1]) emit('torch', G.back - 0.5, FP + 2.6, G.z + s * 3.6, 1);
  // torches on the court walls (iron cressets are not attested: plain declared flames at head height beside doors)
  for (const c of [mc, md, wc, ac]) { emit('torch', c.x0 + 0.5, FP + 2.6, (c.z0 + c.z1) / 2, 1); emit('torch', c.x1 - 0.5, FP + 2.6, (c.z0 + c.z1) / 2 + 6, 1); emit('torch', (c.x0 + c.x1) / 2 + 5, FP + 2.6, c.z0 + 0.5, 1); }
  emit('torch', ec.x0 + 0.5, FP + 2.6, ec.z0 + 12, 1); emit('torch', ec.x0 + 8, FP + 2.6, ec.z1 - 0.5, 1); emit('torch', ec.x0 + 20, FP + 2.6, ec.z0 + 0.5, 1);
  // east court: the working court (alabastron workshop, R4 3.4): awnings along the south wall, stores of jars, benches
  for (let k = 0; k < 5; k++) { const x = ec.x0 + 3 + k * 5.6; if (!onFlight(x + 1.5, ec.z1 - 1.5)) awning(x, ec.z1 - 3.2, x + 3.6, ec.z1 - 0.5, FP, 2.4, 2.9, hash2(k, 1, 47), k % 3 === 1); cluster(x + 1.8, ec.z1 - 1.6, FP, 3 + (k % 3), 900 + k, 1.5); }
  for (let k = 0; k < 4; k++) cluster(ec.x0 + 1.4, plan.g1.z1 + 3 + k * 6.5, FP, 4, 950 + k, 1.9);
  benchAlong(1, ec.z0, ec.x0 + 14, ec.x0 + 28, 1);
  // middle court (officials, "courts of justice"): benches along the north wall, pairs of big jars by the hall door
  benchAlong(1, md.z0, md.x0 + 2, md.x1 - 2, 1); benchAlong(0, md.x1, md.z0 + 1, plan.g1.z0 - 1, -1);
  for (const [c, hall] of [[md, plan.middleHall], [wc, plan.westHall], [ac, plan.annexHall]]) for (const s of [-1, 1]) { cluster((hall.x0 + hall.x1) / 2 + s * 5.2, c.z1 - 0.9, FP, 2, 970 + c.x0 + s, 2.2); emit('torch', (hall.x0 + hall.x1) / 2 + s * 3.6, FP + 2.8, c.z1 - 0.5, 1); }
  // residence courts: an awning in a corner, jars
  awning(wc.x1 - 4.6, wc.z0 + 0.6, wc.x1 - 0.6, wc.z0 + 3.6, FP, 2.9, 2.5, 0.62); awning(ac.x0 + 0.6, ac.z0 + 0.6, ac.x0 + 4.4, ac.z0 + 3.4, FP, 2.9, 2.5, 0.1);
  cluster(wc.x1 - 1.2, wc.z0 + 5.5, FP, 4, 991, 1.7); cluster(ac.x0 + 1.2, ac.z0 + 5.2, FP, 3, 992, 1.7);

  // ---- submit
  const near1 = env.NEAR, lodP = [0, 900];
  if (spouts.length) geom.addStatic(materials.preset('potteryPale'), geom.merge(spouts), { lod: lodP, shadowTexel: 0.15 });
  if (clay.length) geom.addStatic(pot, geom.merge(clay), { lod: lodP, shadowTexel: 0.15 });
  if (timber.length) geom.addStatic('palmWood', geom.merge(timber), { lod: lodP, shadowTexel: 0.15 });
  if (mat.length) geom.addStatic(materials.variant('reedMat', { name: 'southpalace-reed', side: THREE.DoubleSide }), geom.merge(mat), { lod: lodP, shadowTexel: 0.3, ao: false });
  if (cloth.length) geom.addStatic(materials.variant('linenWhite', { name: 'southpalace-cloth', color: 0xffffff, side: THREE.DoubleSide }), geom.merge(cloth), { lod: lodP, shadowTexel: 0.3, ao: false });
  if (bronze.length) geom.addStatic('bronze', geom.merge(bronze), { lod: [0, near1], shadowTexel: 0.15 });
  if (bench.length) extra.brick.push(geom.paint(geom.merge(bench), [0.93, 0.92, 0.9]));
  return { stats, emitters };
}
