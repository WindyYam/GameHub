// js/modules/walls/inner.js — the inner double wall on both banks (SPEC 3.4): Imgur-Enlil (6.5 m, wall-walk +14,
// cavalier towers every 27.6 m), the 7.2 m lane, Nemetti-Enlil (3.7 m, +10, towers every 20.5 m), the berm, the
// baked-brick moat quay with its breastwork to +4 and bastions every 48 m; the raised stretch at the palaces and
// the Ishtar Gate (+29.4 / +25.4) stepping down tower by tower to x = 650; the wall ends at the river.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

export function makeInner(ctx, K, L) {
  const { geom, ground, world, W } = ctx;
  const { put, putFar, mul, mix, TONE, brickTone, writer, boxInto, panel } = K;
  const iw = world.innerWalls, prof = iw.profile;
  const T_MAIN = prof.imgurEnlil.thickness, T_FRONT = prof.nemettiEnlil.thickness;

  /** +1 if `out` points to the right of travel at chainage s of a line. */
  const sideOf = (line, t) => { const p = M.pointAlong(line, t.s); return -p.dir[1] * t.out[0] + p.dir[0] * t.out[1] >= 0 ? 1 : -1; };

  function build(side, gateCuts) {
    const S = iw[side], east = side === 'east';
    const lv = (x, z) => W.innerWallLevels(side, x, z);
    const mainT = W.wallTowers(side + ':main'), frontT = W.wallTowers(side + ':front');
    const outMain = sideOf(S.innerLine, mainT[0]), outFront = sideOf(S.outerLine, frontT[0]);
    const cutsFor = (line, half) => gateCuts.map((g) => { const h = M.nearestOnPolyline(g.x, g.z, line), e = half(g); return h.dist < 45 ? [h.s - e[0], h.s + e[1]] : null; }).filter(Boolean);
    const noMonument = (x, z) => !W.monumentAt(x, z);

    // ---- Imgur-Enlil
    const main = L.wallLine({
      line: S.innerLine, towers: mainT, cuts: cutsFor(S.innerLine, (g) => g.main), T: T_MAIN, walkAt: (x, z) => lv(x, z).walk, outSign: outMain,
      key: 'mud', seed: east ? 101 : 151, inner: 'merlons', inspect: east,
      towerOpts: (t) => {
        const y = t.wallTop, rows = [{ y0: y + 1.25, y1: y + 2.15, n: 3, width: 0.32, depth: 0.5 }];
        if (t.big) rows.push({ y0: y + 4.1, y1: y + 5.0, n: 3, width: 0.32, depth: 0.5 });
        return { shift: Math.max(0, t.d / 2 - T_MAIN / 2 - prof.imgurEnlil.towers.projectsInwards), rows, hatch: t.big, corbel: 0.24 };
      },
      stairs: { every: 9, phase: 4, width: 1.5, ok: noMonument },
    });
    // ---- Nemetti-Enlil
    const front = L.wallLine({
      line: S.outerLine, towers: frontT, cuts: cutsFor(S.outerLine, (g) => g.front), T: T_FRONT, walkAt: (x, z) => lv(x, z).frontTop, outSign: outFront,
      key: 'mud', seed: east ? 201 : 251, inner: 'kerb', bias: 0.12,
      towerOpts: (t) => ({ shift: 0, rows: [{ y0: t.wallTop + 0.95, y1: t.wallTop + 1.7, n: 2, width: 0.28, depth: 0.45 }], hatch: false, corbel: 0.18 }),
      stairs: { every: 14, phase: 6, width: 1.2 },
    });
    // fire baskets on every second large tower of the main wall: declared for nightfx
    let nb = 0, torches = 0;
    for (const t of main.towers) { if (!t.big || nb++ % 2) continue; fireBasket(t.x, t.top, t.z); torches++; }
    return { main, front, outMain, outFront, torches };
  }

  /** An iron fire basket on a short brick stand, with its emitter. */
  function fireBasket(x, y, z, kind = 'torch') {
    const w = writer(); w.color(mul(TONE.mud, 0.9));
    boxInto(w, x, z, [1, 0], 0.22, 0.22, y, y + 0.8);
    w.color([0.2, 0.13, 0.08]);
    boxInto(w, x, z, [1, 0], 0.3, 0.3, y + 0.8, y + 1.05, { top: true, bottom: true });
    put('mud', w.toGeometry());
    ctx.emitters.add({ kind, pos: [x, y + 1.3, z], size: 1.2 });
  }

  /**
   * Where the double wall reaches the river: a return wall along the bank from the main wall to the front wall
   * (the lane is closed toward the water), crenellated on the river side.
   */
  function riverEnd(side, atStart) {
    const S = iw[side], Lm = S.innerLine, Lf = S.outerLine, lv = (x, z) => W.innerWallLevels(side, x, z);
    const end = (line) => { const n = line.length, p = atStart ? line[0] : line[n - 1], q = atStart ? line[1] : line[n - 2], l = Math.hypot(p[0] - q[0], p[1] - q[1]); return { p, d: [(p[0] - q[0]) / l, (p[1] - q[1]) / l] }; };
    const m = end(Lm), f = end(Lf), ol = Math.hypot(f.p[0] - m.p[0], f.p[1] - m.p[1]), out = [(f.p[0] - m.p[0]) / ol, (f.p[1] - m.p[1]) / ol];
    const a = [m.p[0] - m.d[0] * T_FRONT / 2 + out[0] * T_MAIN / 2, m.p[1] - m.d[1] * T_FRONT / 2 + out[1] * T_MAIN / 2];
    const b = [f.p[0] - f.d[0] * T_FRONT / 2 - out[0] * T_FRONT / 2, f.p[1] - f.d[1] * T_FRONT / 2 - out[1] * T_FRONT / 2];
    // the river lies on the side the wall ends point to
    const dx = b[0] - a[0], dz = b[1] - a[1], riverRight = -dz * m.d[0] + dx * m.d[1] > 0 ? 1 : -1, top = lv(m.p[0], m.p[1]).frontTop;
    let g = Infinity; for (const k of [0, 0.5, 1]) for (const o of [-3, 0, 3]) g = Math.min(g, ground.height(a[0] + dx * k + m.d[0] * o, a[1] + dz * k + m.d[1] * o));
    return L.wallLine({ line: [a, b], towers: [], T: T_FRONT, walkAt: () => top, outSign: riverRight, key: 'mud', seed: 901 + (atStart ? 0 : 5) + (side === 'east' ? 0 : 20), inner: 'kerb', detail: 0, baseAt: () => Math.min(g - 1.5, -4.5) });
  }

  /**
   * The west end of the east wall at the palace quay: the lane closed by a return wall at the level of the front
   * wall, and brick retaining walls where the made terraces of the wall zone (owner: walls) stand above the dry quay
   * strip (+4) and the garden strip of the South Palace (+10).
   */
  function palaceEnd() {
    const S = iw.east, lv = W.innerWallLevels('east', S.innerLine[0][0], S.innerLine[0][1]);
    const ret = riverEnd('east', true);
    const m0 = S.innerLine[0], f0 = S.outerLine[0], q0 = S.quayLine[0];
    const plat = (id) => ground.platforms.find((p) => p.id === id);
    const strip = plat('palaceQuarter:northStrip'), lane = plat('palaceQuarter:northLane');
    const tint = brickTone(1, 911);
    // west edge of the berm and of the north strip, above the dry quay strip
    const west = [[f0[0] + 0.1, f0[1] - T_FRONT / 2 + 0.2], [q0[0], q0[1]]];
    if (strip) { const r = strip.polygon, i = r.findIndex((p) => Math.hypot(p[0] - q0[0], p[1] - q0[1]) < 1.5); if (i >= 0) { const o = M.openRing(r), n = o.length; west.push(o[(i - 1 + n) % n], o[(i - 2 + n) % n]); } }
    const lvlW = strip ? strip.level : 10.5;
    let lo = Infinity; for (const p of west) for (const d of [3, 6]) lo = Math.min(lo, ground.height(p[0] - d, p[1]));
    // the terrace lies to the east: right of travel when going north
    const sideW = M.nearestOnPolyline(west[0][0] + 6, west[0][1] - 4, west).side;
    for (let i = 0; i < west.length - 1; i++) {
      const seg = [west[i], west[i + 1]], l = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]); if (l < 1) continue;
      // each leg on its own (the corners are sharp), 1 m longer at its far end so that the legs meet
      const e = [(seg[1][0] - seg[0][0]) / l, (seg[1][1] - seg[0][1]) / l], ext = [seg[0], [seg[1][0] + e[0] * 1.0, seg[1][1] + e[1] * 1.0]];
      put('brick', K.paintBy(geom.wall(ext, { thickness: 2.0, offset: sideW * 1.0, base: lo - 1.2, top: lvlW + 1.0 - i * 0.02 }), brickTone(3 + i, 911), mul(tint, 0.9)));
      putFar(geom.wall(ext, { thickness: 2.0, offset: sideW * 1.0, base: lo - 1.2, top: lvlW + 1.0 - i * 0.02 }), tint);
    }
    // the lane inside the main wall (+12.5) above the garden strip
    if (lane) {
      const o = M.openRing(lane.polygon), i = o.findIndex((p) => Math.hypot(p[0] - m0[0], p[1] - m0[1]) < 1.5);
      if (i >= 0) {
        const n = o.length, cand = [o[(i + 1) % n], o[(i - 1 + n) % n]].sort((u, v) => Math.abs(u[1] - m0[1]) - Math.abs(v[1] - m0[1]))[0];
        const c = [o[i][0], o[i][1]], e = cand, sd = M.nearestOnPolyline((c[0] + e[0]) / 2 + 2, (c[1] + e[1]) / 2 - 5, [c, e]).side;
        const lo2 = Math.min(ground.height(c[0] - 3, c[1] + 6), ground.height(e[0] - 3, e[1] + 6));
        put('brick', K.paintBy(geom.wall([c, e], { thickness: 1.5, offset: sd * 0.75, base: lo2 - 1.2, top: lane.level + 1.0 }), brickTone(2, 911), mul(tint, 0.9)));
        putFar(geom.wall([c, e], { thickness: 1.5, offset: sd * 0.75, base: lo2 - 1.2, top: lane.level + 1.0 }), tint);
      }
    }
    void lv;
    return ret;
  }

  /**
   * The moat quay: Nebuchadnezzar's wall on the water edge (3.3 m, base under the bed, breastwork to quayTop),
   * Nabopolassar's quay behind it as a brick walk at +2, bastions 8 x 5 m, steps up the breastwork.
   * pl: the water edge (a ground.hardEdges polyline or a part of it); land: +1 if land lies to the right of travel;
   * openings: [[x, z, half]] gaps of the breastwork (causeway heads); topAt(x, z) -> breastwork top; walkAt -> level behind it.
   */
  function quay({ pl, land, foot, topAt, walkAt, openings = [], seed = 1, bastions = [], embank = false, older = true }) {
    const ch = M.chainage(pl), total = ch[ch.length - 1], th = prof.quay.nebuchadnezzar.thickness, thN = prof.quay.nabopolassar.thickness;
    const base = embank ? null : foot - 0.6;
    const cuts = openings.map(([x, z, half]) => { const h = M.nearestOnPolyline(x, z, pl); return h.dist < 12 ? [h.s - half, h.s + half] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    const inCut = (s) => cuts.some((c) => s > c[0] && s < c[1]);
    // break points: vertices, cut edges, every 48 m (tone and level steps)
    const br = new Set([0, total]); for (const c of ch) br.add(c); for (const c of cuts) { br.add(M.clamp(c[0], 0, total)); br.add(M.clamp(c[1], 0, total)); }
    for (const b of bastions) br.add(M.clamp(b.s, 0, total));
    const bs = [...br].sort((a, b) => a - b).filter((s, i, arr) => i === 0 || s - arr[i - 1] > 0.5);
    let n = 0;
    for (let i = 0; i < bs.length - 1; i++) {
      const s0 = bs[i], s1 = bs[i + 1], seg = K.subLine(pl, s0, s1, ch), m = M.pointAlong(pl, (s0 + s1) / 2), open = inCut((s0 + s1) / 2);
      const walk = walkAt(m.x, m.z), top = open ? walk + 0.06 : topAt(m.x, m.z), tint = brickTone(n++, seed);
      const b0 = base ?? (K.groundMin(m.x, m.z, m.dir, [-land * 4, land * 1, land * 5]) - 1.5);
      const g = geom.wall(seg, { thickness: th, offset: land * th / 2, base: b0, top, caps: true });
      put('brick', K.paintBy(g, tint, mul(tint, 0.9)));
      putFar(K.paintBy(geom.wall(seg, { thickness: th, offset: land * th / 2, base: b0, top, caps: true }), tint, mul(tint, 0.9)));
      if (!embank && older) {
        // Nabopolassar's older quay behind: its top is the brick walk at the berm level
        put('brick', geom.wall(seg, { thickness: thN, offset: land * (th + thN / 2), base: walk - 1.2, top: walk + 0.06, caps: false }), mul(tint, 0.86));
      }
    }
    // bastions and the steps beside them
    for (const b of bastions) {
      const p = M.pointAlong(pl, b.s), r = [-p.dir[1], p.dir[0]], o = [-r[0] * land, -r[1] * land];       // o: toward the water
      const top = topAt(p.x, p.z), tint = brickTone(n++, seed + 5), d = b.d, hw = b.w / 2;
      const b0 = base ?? (K.groundMin(p.x, p.z, p.dir, [-land * (d + 1), 0, land * 3]) - 1.5);
      const c = [p.x + o[0] * d / 2, p.z + o[1] * d / 2];
      const w = writer(); w.color(tint);
      // three faces and a top; the back lies against the quay wall
      const q = (lx, lz) => [c[0] + p.dir[0] * lx + o[0] * lz, c[1] + p.dir[1] * lx + o[1] * lz];
      const A = q(-hw, -d / 2), B = q(-hw, d / 2), C = q(hw, d / 2), D = q(hw, -d / 2);
      const faceOut = (u, v) => { const dx = v[0] - u[0], dz = v[1] - u[1], mx = (u[0] + v[0]) / 2 - c[0], mz = (u[1] + v[1]) / 2 - c[1]; if (-dz * mx + dx * mz >= 0) panel(w, u, v, b0, top); else panel(w, v, u, b0, top); };
      faceOut(A, B); faceOut(B, C); faceOut(C, D);
      w.color(mul(tint, 0.9));
      const tp = [A, B, C, D]; if (M.polygonArea(tp) > 0) tp.reverse();
      w.quad(tp[0][0], top, tp[0][1], tp[1][0], top, tp[1][1], tp[2][0], top, tp[2][1], tp[3][0], top, tp[3][1]);
      // a low kerb round the three water sides
      const g = w.toGeometry(); put('brick', g);
      put('brick', geom.wall([q(-hw + 0.2, -d / 2), q(-hw + 0.2, d / 2 - 0.2), q(hw - 0.2, d / 2 - 0.2), q(hw - 0.2, -d / 2)], { thickness: 0.4, base: top, top: top + 0.45, caps: true }), mul(tint, 1.03));
      putFar(geom.box({ x: c[0], z: c[1], y0: b0, y1: top, sx: b.w, sz: d, rotDeg: M.dirToAz(p.dir[0], p.dir[1]) - 90, bottom: false }), tint);
      // steps from the berm walk up onto the breastwork, along its land face
      if (!embank && !K.draft) {
        const walk = walkAt(p.x, p.z), rise = top - walk - 0.06, steps = Math.max(1, Math.round(rise / 0.2));
        if (rise > 0.5) {
          const k = land * (th + 0.65), fx = p.x + r[0] * k - p.dir[0] * (hw + 0.5), fz = p.z + r[1] * k - p.dir[1] * (hw + 0.5);
          put('brick', geom.stairs({ x: fx, z: fz, azDeg: M.dirToAz(p.dir[0], p.dir[1]), width: 1.3, steps, riser: rise / steps, tread: 0.3, base: walk + 0.06, sink: 0.8 }), mul(tint, 0.95));
        }
      }
    }
    return { length: total, bastions: bastions.length };
  }

  /**
   * Plasterers at work on a bay of the front wall (the walls are kept in repair: SPEC "maintained plaster"): a pole
   * scaffold with plank decks and ladders against the outer face, stacks of mud bricks, a heap of earth and a
   * mixing pit at its foot. bay: a record of wallLine().bays; outSign as for the wall.
   */
  function workSite(bay, outSign, T = T_FRONT) {
    if (!bay || K.draft) return false;
    const d = bay.dir, r = [-d[1], d[0]], n = [r[0] * outSign, r[1] * outSign], len = bay.s1 - bay.s0, wdt = Math.min(9.2, len - 4.4), nb = Math.round(wdt / 2.3);
    const o = [bay.mid[0] + n[0] * T / 2, bay.mid[1] + n[1] * T / 2];                 // on the face, middle of the bay
    const P = (a, off) => [o[0] + d[0] * a + n[0] * off, o[1] + d[1] * a + n[1] * off];
    const g0 = ground.height(...P(0, 1.6)), lift = 2.05, lifts = Math.max(2, Math.floor((bay.walk - 0.3 - g0) / lift));
    const w = writer(); w.color(TONE.white);
    const B3 = (a, b, half) => K.beamInto(w, a, b, half);
    const at = (a, off, y) => { const p = P(a, off); return [p[0], y, p[1]]; };
    const top = g0 + lifts * lift;
    // standards (two rows), ledgers, putlogs
    for (let i = 0; i <= nb; i++) { const a = -wdt / 2 + (i * wdt) / nb; for (const off of [0.3, 1.55]) B3(at(a, off, g0 - 0.3), at(a, off, top + (off > 1 ? 1.0 : 0.1)), 0.05); }
    for (let k = 1; k <= lifts; k++) {
      const y = g0 + k * lift;
      for (const off of [0.3, 1.55]) B3(at(-wdt / 2 - 0.3, off, y - 0.07), at(wdt / 2 + 0.3, off, y - 0.07), 0.04);
      for (let i = 0; i <= nb; i++) { const a = -wdt / 2 + (i * wdt) / nb; B3(at(a + 0.08, 0.02, y - 0.15), at(a + 0.08, 1.75, y - 0.15), 0.035); }
      // decks: the upper lifts are planked right across, the lower ones over the part in use
      if (k < lifts - 1 && k % 2 === 0) continue;                                     // every other lower lift is left open
      const a0 = k >= lifts - 1 ? -wdt / 2 : -wdt / 2 + ((k * 3) % nb) * (wdt / nb) * 0.5, a1 = k >= lifts - 1 ? wdt / 2 : Math.min(wdt / 2, a0 + wdt * 0.5), c = P((a0 + a1) / 2, 0.93);
      w.color(mul(TONE.white, 0.9 + 0.1 * hash2(k, 3, 951)));
      boxInto(w, c[0], c[1], d, (a1 - a0) / 2, 0.62, y - 0.02, y + 0.035, { top: true, bottom: true });
      w.color(TONE.white);
      if (k >= lifts - 1) B3(at(-wdt / 2, 1.55, y + 0.95), at(wdt / 2, 1.55, y + 0.95), 0.04);          // a guard rail on the top lifts
    }
    // braces across two bays, ladders from lift to lift
    for (const sg of [-1, 1]) B3(at(sg * wdt / 2, 1.62, g0), at(sg * (wdt / 2 - 2.2 * 2), 1.62, g0 + 2 * lift), 0.04);
    for (let k = 0; k < lifts; k++) {
      const a = -wdt / 2 + 1.0 + ((k * 2.9) % (wdt - 2.4)), y0 = g0 + k * lift, y1 = y0 + lift + 0.7, run = 0.75;
      for (const sd of [-0.22, 0.22]) B3(at(a + sd, 1.2, y0 + (k ? 0.03 : 0)), at(a + sd, 1.2 - run, y1), 0.03);
      for (let q = 1; q <= 8; q++) { const f = q / 9.5; B3(at(a - 0.22, 1.2 - run * f, y0 + (y1 - y0) * f), at(a + 0.22, 1.2 - run * f, y0 + (y1 - y0) * f), 0.02); }
    }
    put('poles', w.toGeometry());
    // at the foot: stacks of new mud bricks, a heap of earth, the pit where the plaster is trodden
    const m = writer();
    for (let i = 0; i < 5; i++) {
      const a = -wdt / 2 - 3.5 + i * 2.1 + hash2(i, 5, 951), off = 4.2 + 2.4 * hash2(i, 6, 951), c = P(a, off), rot = M.rotateXZ(d[0], d[1], 25 * (hash2(i, 7, 951) - 0.5));
      m.color(mul(mix(TONE.fresh, TONE.sunlit, hash2(i, 8, 951)), 0.95));
      boxInto(m, c[0], c[1], rot, 0.75, 0.48, ground.height(c[0], c[1]) - 0.2, ground.height(c[0], c[1]) + 0.45 + 0.4 * hash2(i, 9, 951));
    }
    put('mud', m.toGeometry());
    const hp = P(wdt / 2 + 1.5, 4.5), hg = ground.height(hp[0], hp[1]), pit = P(wdt / 2 - 3, 5.2), pg = ground.height(pit[0], pit[1]);
    const ring = (c, rad, k) => { const out = []; for (let i = 0; i < k; i++) { const an = (i / k) * M.TAU; out.push([c[0] + Math.cos(an) * rad * (0.85 + 0.3 * hash2(i, k, 953)), c[1] + Math.sin(an) * rad * (0.85 + 0.3 * hash2(i, k + 1, 953))]); } return M.closeRing(out); };
    put('mud', geom.prism(ring(hp, 1.7, 9), hg - 0.2, hg + 1.0, { batter: 0.95 }), mul(TONE.damp, 1.05));
    put('mud', geom.prism(ring(pit, 1.5, 10), pg - 0.2, pg + 0.22, { batter: -0.3 }), mul(TONE.mud, 0.95));
    put('mud', geom.cap(ring(pit, 1.25, 10), pg + 0.24), mul(TONE.damp, 0.62));
    return true;
  }

  return { build, quay, riverEnd, palaceEnd, fireBasket, workSite, T_MAIN, T_FRONT, sideOf };
}
