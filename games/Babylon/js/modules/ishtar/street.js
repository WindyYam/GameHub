// js/modules/ishtar/street.js — the Processional Way north of the gate (SPEC 3.6, R2 7, 8):
//   the two street walls (east wall of the North Palace, west wall of the East Fortification): 7 m thick, 12 m to the
//   merlon tops above the street beside them, towers 8 m wide every 14 m projecting 1.3 m, stepping down with the 3 %
//   slope; the lion friezes (all lions striding north, out of the city); the roadway (five rows of limestone slabs,
//   four rows of red breccia each side, asphalted brick to the walls) from the causeway to the south face of the gate;
//   the North Gate; the walled causeway across the north moat.
import * as M from '../../core/mathx.js';
import { BREAST } from './util.js';

export function buildStreet(ctx, K, gate, wings) {
  const { geom, glazed: G, W, ground } = ctx, C = K.C, put = K.put;
  const pw = W.street('processionalWay'), np = W.monument('northPalace'), ef = W.monument('eastFortification');
  const dims = W.monument('ishtarGate').dims, ng = dims.northGate, ew = np.dims.eastWall;
  const lvl = (x, z) => M.valueAlong(pw.levels, M.nearestOnPolyline(x, z, pw.polyline));
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const snap = (y) => Math.round(y / C) * C;
  const stats = { lions: { east: 0, west: 0 }, divisions: 0, towers: 0, lionFeet: [], lionSpacing: [] };
  let seed = 2000;

  // ------------------------------------------------------------------------------------------ North Gate frame ----
  const pl = pw.polyline, nS = K.unit(K.sub(pl[4], pl[2])), nE = [nS[1], -nS[0]], nC = [ng.x, ng.z];
  const atN = (u, s) => [nC[0] + nE[0] * u + nS[0] * s, nC[1] + nE[1] * u + nS[1] * s];
  const sN = (p) => (p[0] - nC[0]) * nS[0] + (p[1] - nC[1]) * nS[1];
  const rotN = M.dirToAz(-nS[0], -nS[1]), HL = ng.length / 2;                 // the gatehouse: s from -15 (north) to +15
  const TWN = -HL - 2, TWS = -4.5;                                            // its two towers stand between these stations

  // ------------------------------------------------------------------------------------------ street walls ----
  const T = ew.thickness, PROJ = ew.towerProjection, TW = ew.towerWidth, HC = ew.heightAboveStreet - 0.9 - BREAST, HT = ew.towerHeightAboveStreet - 0.9 - BREAST;
  const faces = { west: [5, 4, 3, 2].map((i) => np.footprint.polygon[i]), east: [0, 1, 2, 3].map((i) => ef.footprint.polygon[i]) };
  const chWhere = (face, s0) => { let a = 0, b = M.polylineLength(face); for (let i = 0; i < 40; i++) { const m = (a + b) / 2, p = M.pointAlong(face, m); if (sN([p.x, p.z]) > s0) a = m; else b = m; } return (a + b) / 2; };
  const lions = [];
  const NORTH_OF_GATE = { west: false, east: false };   // both stretches north of the North Gate are built by `palaces` (north.js, east.js)

  // the palace doorway in the west wall: an arched portal 3 m wide in two stepped reveals, its cedar leaves shut
  const PORTAL = { width: 3.0, crown: 5.2, depth: 1.6, open: 3.0 + 4 * 0.3 };
  function portal(pA, pB, bA, bB, ns, d, base, walk, L0) {
    const D = PORTAL.depth, mid = K.lerp2(pA, pB, 0.5), fl = L0 + 0.02, hw = PORTAL.width / 2, spring = PORTAL.crown - hw;
    put('brick', geom.prism([add(pA, ns, -D), add(pB, ns, -D), bB, bA], base, walk, { top: false }));
    // travelling south the street (the rebated front) is on the left
    put('brick', geom.archedWall({ a: add(pB, ns, -D / 2), b: add(pA, ns, -D / 2), thickness: D, base, floor: fl, top: walk, door: { width: PORTAL.width, height: PORTAL.crown, arch: true }, rebates: 2, rebateDepth: 0.3, rebateStep: 0.3, segments: 14, topFace: false }));
    const c = add(mid, ns, -1.05), rotD = Math.atan2(d[1], d[0]) * M.RAD;
    put('cedar', geom.box({ x: c[0], z: c[1], sx: PORTAL.width, sz: 0.12, y0: fl, y1: fl + spring, rotDeg: rotD }));
    for (let i = 0; i < 4; i++) put('bronze', geom.box({ x: c[0], z: c[1], sx: PORTAL.width + 0.02, sz: 0.17, y0: fl + 0.25 + i * 1.05, y1: fl + 0.45 + i * 1.05, rotDeg: rotD }));
    // the two leaves meet in the middle: a dark joint; the tympanum over them
    const jc = add(mid, ns, -0.985), r = [ns[1], -ns[0]];
    put('dark', geom.custom({ position: [jc[0] - r[0] * 0.02, fl, jc[1] - r[1] * 0.02, jc[0] + r[0] * 0.02, fl, jc[1] + r[1] * 0.02, jc[0] + r[0] * 0.02, fl + spring, jc[1] + r[1] * 0.02, jc[0] - r[0] * 0.02, fl + spring, jc[1] - r[1] * 0.02], index: [0, 1, 2, 0, 2, 3], normal: [ns[0], 0, ns[1], ns[0], 0, ns[1], ns[0], 0, ns[1], ns[0], 0, ns[1]] }));
    const tp = add(mid, ns, -0.99), pos = [], nor = [], idx = [];
    for (let i = 0; i <= 14; i++) { const a = (Math.PI * i) / 14; pos.push(tp[0] + r[0] * hw * Math.cos(a), fl + spring + hw * Math.sin(a), tp[1] + r[1] * hw * Math.cos(a)); nor.push(ns[0], 0, ns[1]); }
    for (let i = 1; i + 1 <= 14; i++) idx.push(0, i, i + 1);
    put('cedar', geom.custom({ position: pos, index: idx, normal: nor }));
    put('bronze', geom.box({ x: c[0], z: c[1], sx: PORTAL.width - 0.3, sz: 0.17, y0: fl + spring + 0.35, y1: fl + spring + 0.55, rotDeg: rotD }));
    put('stone', geom.box({ x: add(mid, ns, -0.5)[0], z: add(mid, ns, -0.5)[1], sx: PORTAL.open, sz: 1.3, y0: fl - 0.3, y1: fl + 0.06, rotDeg: rotD }));
    stats.palaceDoor = { x: +mid[0].toFixed(1), z: +mid[1].toFixed(1) };
  }
  function wallSide(side) {
    const face = faces[side], west = side === 'west', base = west ? -1.5 : -3.9, total = M.polylineLength(face);
    const bas = wings.bastions[side];
    const ch0 = west ? 0 : M.nearestOnPolyline(bas.A[0], bas.A[1], face).s;       // the wall begins at the bastion's north face
    const chG = chWhere(face, HL), chT = chWhere(face, TWS), chB = chWhere(face, TWN);
    // divisions: lion stretch = 11 intervals and 10 towers; a plain piece beside the gatehouse; north of the gate
    // interval, tower, interval and a tower at the end, on the moat
    const divs = [];
    const L = chG - ch0, nT = Math.max(1, Math.round((L - 4) / (ew.towersCC)));
    // the first tower stands against the bastion (it projects 1.75 m, like the tower on the bastion's face)
    let c = ch0;
    const iv2 = (L - nT * TW) / nT;
    for (let i = 0; i < nT; i++) { divs.push({ a: c, b: c + TW, tower: true, frieze: true, proj: i === 0 ? 1.75 : PROJ }); c += TW; divs.push({ a: c, b: i === nT - 1 ? chG : c + iv2, tower: false, frieze: true }); c += iv2; }
    divs.push({ a: chG, b: chT, tower: false, frieze: false, proud: 0.12 });
    // north of the North Gate the west wall is the east side of the North Fortification: `palaces` builds it (with the
    // corner tower on the moat). The east wall is built here: interval, tower, interval and a tower at the end.
    if (NORTH_OF_GATE[side]) {
      const LB = total - chB, ivB = (LB - 2 * TW) / 2;
      divs.push({ a: chB, b: chB + ivB, tower: false, proud: 0.12 }, { a: chB + ivB, b: chB + ivB + TW, tower: true }, { a: chB + ivB + TW, b: total - TW, tower: false, proud: 0.12 }, { a: total - TW, b: total, tower: true, end: true });
    }
    // the palace's entrance from the street (R2 8.2: "the palace's main entrance in it"): in the interval nearest the
    // gate lodge that `palaces` builds behind the wall (middle of the first leg of the west wall)
    if (west) {
      const want = M.polylineLength(face.slice(0, 2)) / 2;
      let best = null;
      for (const dv of divs) if (dv.frieze && !dv.tower && (!best || Math.abs((dv.a + dv.b) / 2 - want) < Math.abs((best.a + best.b) / 2 - want))) best = dv;
      if (best) best.portal = true;
    }

    let k = 0;
    for (const dv of divs) {
      const A = M.pointAlong(face, dv.a), B = M.pointAlong(face, dv.b), pA = [A.x, A.z], pB = [B.x, B.z], d = K.unit(K.sub(pB, pA));
      const ns = west ? [-d[1], d[0]] : [d[1], -d[0]];                            // from the wall face into the street
      const mid = K.lerp2(pA, pB, 0.5), L0 = lvl(mid[0], mid[1]);
      const proj = dv.tower ? (dv.proj || PROJ) : (dv.proud || 0), back = T + (dv.tower ? PROJ : (dv.proud || 0)), walk = snap(L0 + (dv.tower ? HT : HC));
      const fA = add(pA, ns, proj), fB = add(pB, ns, proj), bA = add(pA, ns, -back), bB = add(pB, ns, -back), ring = [fA, fB, bB, bA];
      if (dv.portal) portal(pA, pB, bA, bB, ns, d, base, walk, L0);
      else put('brick', geom.paint(geom.prism(ring, base, walk, { top: false }), dv.tower ? [0.95, 0.95, 0.96] : [1, 1, 1]));
      put('roof', geom.cap(ring, walk));
      K.putFar('brick', geom.prism(ring, base, walk + 1));
      if (dv.tower) {
        K.parapet(K.ccw(ring), walk, { closed: true });
        stats.towers++; if (dv.frieze) stats.lionTowers = (stats.lionTowers || 0) + 1;
        // two slits in the upper part of each face
        for (const [P, Q, n] of [[fA, fB, ns], [bA, bB, [-ns[0], -ns[1]]]]) for (const q of [0.3, 0.7]) {
          const cpt = add(K.lerp2(P, Q, q), n, 0.012), r = [n[1], -n[0]];
          put('dark', geom.custom({ position: [cpt[0] - r[0] * 0.11, walk - 2.5, cpt[1] - r[1] * 0.11, cpt[0] + r[0] * 0.11, walk - 2.5, cpt[1] + r[1] * 0.11, cpt[0] + r[0] * 0.11, walk - 1.15, cpt[1] + r[1] * 0.11, cpt[0] - r[0] * 0.11, walk - 1.15, cpt[1] - r[1] * 0.11], index: [0, 1, 2, 0, 2, 3], normal: [n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1]] }));
        }
        // a short stair from the wall-walk up to the tower's platform, on the side away from the street
        if (!dv.end) {
          const foot = add(add(pA, d, -2.3), ns, -(T - 1.1)), rise = walk - snap(L0 + HC), steps = Math.max(2, Math.round(rise / 0.25));
          put('brick', geom.stairs({ x: foot[0], z: foot[1], azDeg: M.dirToAz(d[0], d[1]), width: 1.2, steps, riser: rise / steps, tread: 2.3 / steps, base: walk - rise - 0.02, sink: 0.05 }));
        }
      } else {
        K.parapet(west ? [fA, fB] : [fB, fA], walk);
        K.parapet(west ? [bB, bA] : [bA, bB], walk);
        // a drain spout through the breastwork on both faces
        const sp = K.lerp2(fA, fB, 0.5), sb = K.lerp2(bA, bB, 0.5);
        put('brick', geom.spout({ x: sp[0], y: walk + 0.02, z: sp[1], azDeg: M.dirToAz(ns[0], ns[1]), length: 0.75, width: 0.24, height: 0.17 }));
        put('brick', geom.spout({ x: sb[0], y: walk + 0.02, z: sb[1], azDeg: M.dirToAz(-ns[0], -ns[1]), length: 0.75, width: 0.24, height: 0.17 }));
      }
      stats.divisions++;
      // the lion frieze: one level panel per division, stepping down northwards with the street
      if (dv.frieze) {
        const foot = Math.floor((L0 + 0.05) / C) * C;
        if (dv.portal) {
          // the frieze stops at the jambs of the doorway: two short pieces of band without lions
          const w = (K.len(K.sub(pB, pA)) - PORTAL.open) / 2;
          for (const [P, Q] of [[pA, add(pA, d, w)], [add(pB, d, -w), pB]]) {
            const [a, b] = K.faceEnds(P, Q, ns);
            K.skin(a, b, foot - 3 * C, [{ type: 'field', courses: 3, ground: 'glazeBlue' }, ...G.friezeBands({ width: w, count: 0, ground: k % 2 ? 'lapis' : 'turquoise' })], { seed: seed++ });
          }
        } else frieze(fA, fB, ns, foot, dv.tower ? 3 : (K.len(K.sub(fB, fA)) > 4.6 ? 2 : 1), side, k);
        if (dv.tower) {
          for (const [P, Q, n] of [[pA, fA, [-d[0], -d[1]]], [pB, fB, d]]) {
            const [a, b] = K.faceEnds(P, Q, n);
            K.skin(a, b, foot - 3 * C, [{ type: 'field', courses: 3, ground: 'glazeBlue' }, ...G.friezeBands({ width: proj, count: 0, ground: k % 2 ? 'lapis' : 'turquoise' })], { seed: seed++ });
          }
          edgeLines(fA, fB, ns, foot);
        }
        k++;
      }
    }
    // the bastion's street face carries the frieze too (six lions: two, three on its tower, one)
    {
      const L0 = lvl(...K.lerp2(bas.A, bas.B, 0.5)), foot = Math.floor((L0 + 0.05) / C) * C;
      let kk = k + 1;
      for (const f of bas.faces) {
        frieze(f.P, f.Q, f.n, foot, f.count, side, kk);
        if (f.tower) {
          for (const [P, Q, n] of f.flanks) { const [a, b] = K.faceEnds(P, Q, n); K.skin(a, b, foot - 3 * C, [{ type: 'field', courses: 3, ground: 'glazeBlue' }, ...G.friezeBands({ width: K.len(K.sub(Q, P)), count: 0, ground: kk % 2 ? 'lapis' : 'turquoise' })], { seed: seed++ }); }
          edgeLines(f.P, f.Q, f.n, foot);
        }
        kk++;
      }
    }
    return { divs, ch0, chG, chT, chB, total };
  }
  /** A stretch of the lion frieze on the wall face P -> Q (any order) that looks along n. */
  function frieze(P, Q, n, foot, count, side, k) {
    const [a, b] = K.faceEnds(P, Q, n), width = K.len(K.sub(b, a));
    // east wall: it looks west, the viewer's right is south, north is to his LEFT. West wall: north is to his RIGHT
    const facing = side === 'east' ? 'L' : 'R', ground2 = k % 2 ? 'lapis' : 'turquoise';
    const bands = [{ type: 'field', courses: 3, ground: 'glazeBlue' }, ...G.friezeBands({ width, count, facing, ground: ground2, variantStart: k % 2 })];
    const p = K.skin(a, b, foot - 3 * C, bands, { seed: seed++ });
    const its = p.items.filter((i) => i.figure === 'lion');
    stats.lions[side] += its.length;
    const r = K.unit(K.sub(b, a));
    for (const it of its) { stats.lionFeet.push(foot - 3 * C + it.y - lvl(a[0] + r[0] * it.x, a[1] + r[1] * it.x)); lions.push({ side, x: a[0] + r[0] * it.x, z: a[1] + r[1] * it.x, y: foot - 3 * C + it.y, facing: it.facing }); }
    for (let i = 1; i < its.length; i++) stats.lionSpacing.push(its[i].x - its[i - 1].x);
    return p;
  }
  /** Black and white lines in flat glaze at both ends of a tower face ("divide the frieze into panels", Koldewey). */
  function edgeLines(P, Q, n, foot) {
    const [a, b] = K.faceEnds(P, Q, n), r = K.unit(K.sub(b, a)), w = K.len(K.sub(b, a)), LN = 0.055;
    for (const [x, id] of [[0, 'course:glazeBlack'], [LN, 'course:glazeWhite'], [w - LN, 'course:glazeBlack'], [w - 2 * LN, 'course:glazeWhite']]) {
      K.addGlazed(G.quad(id, [a[0] + r[0] * x + n[0] * 0.045, foot, a[1] + r[1] * x + n[1] * 0.045], [r[0], 0, r[1]], [0, 1, 0], { width: LN, height: G.frieze.height }));
    }
  }
  const walls = { west: wallSide('west'), east: wallSide('east') };

  // ------------------------------------------------------------------------------------------ North Gate ----
  // baked brick, c. 30 m long, 4.6 m doorways; the superstructure is unknown: after Pedersen's model a low arched
  // gatehouse between two massive square towers, blue merlons
  {
    const L0 = lvl(nC[0], nC[1]), walk = snap(L0 + 10.3), tWalk = snap(L0 + 14.4), HWg = 10.75, mch = 4.0, DW = ng.door / 2, crown = 8.4;
    const rectN = (u0, u1, s0, s1) => [atN(u0, s0), atN(u1, s0), atN(u1, s1), atN(u0, s1)];
    const doorWall = (s0, s1, south) => {
      const c = atN(0, (s0 + s1) / 2), fl = lvl(c[0], c[1]) - 0.06;
      put('brick', geom.passageBlock({ x: c[0], z: c[1], rotDeg: rotN + (south ? 180 : 0), width: 2 * HWg, depth: s1 - s0, base: L0 - 2.5, floor: fl, top: walk, door: { width: ng.door, height: crown, arch: true }, rebates: 2, rebateDepth: 0.35, rebateStep: 0.3, segments: 16, topFace: false }));
      return fl;
    };
    const flN = doorWall(-HL, -HL + 6, false), flS = doorWall(HL - 6, HL, true);
    for (const sg of [-1, 1]) put('brick', geom.prism(rectN(Math.min(sg * mch, sg * HWg), Math.max(sg * mch, sg * HWg), -HL + 6, HL - 6), L0 - 2.5, walk, { top: false }));
    put('brick', K.occlude(geom.box({ x: nC[0], z: nC[1], sx: 2 * mch, sz: 2 * HL - 12, y0: L0 + 9.2, y1: walk - 0.08, rotDeg: rotN }), 0.5));
    // roof and parapets: between the towers at the north end, the full width behind them
    put('roof', geom.cap([atN(-8, -HL), atN(8, -HL), atN(8, TWS), atN(HWg, TWS), atN(HWg, HL), atN(-HWg, HL), atN(-HWg, TWS), atN(-8, TWS)], walk));
    K.parapet([atN(8, -HL), atN(-8, -HL)], walk);
    K.parapet([atN(-HWg, HL), atN(HWg, HL)], walk);
    for (const sg of [-1, 1]) {
      const ring = rectN(Math.min(sg * 8, sg * 20.5), Math.max(sg * 8, sg * 20.5), TWN, TWS), base = sg < 0 ? 2.4 : -3.9;
      put('brick', geom.prism(ring, base, tWalk - 4.2, { top: false }));
      // the upper storey stands half a brick proud (as on the towers of the Ishtar Gate)
      const up = M.rectRing((ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2, 12.5 + 0.36, TWS - TWN + 0.36, rotN).slice(0, 4);
      put('brick', geom.paint(geom.prism(up, tWalk - 4.2, tWalk, { top: false, bottom: true }), [0.95, 0.95, 0.96]));
      put('roof', geom.cap(up, tWalk));
      K.parapet(K.ccw(up), tWalk, { closed: true });
      K.putFar('brick', geom.prism(ring, base, tWalk + 1));
      // loopholes: slits on the north and the street faces
      for (const [P, Q, n] of [[up[0], up[1], [-nS[0], -nS[1]]], [up[2], up[3], nS], [up[1], up[2], nE], [up[3], up[0], [-nE[0], -nE[1]]]]) for (const q of [0.2, 0.4, 0.6, 0.8]) {
        const cpt = add(K.lerp2(P, Q, q), n, 0.012), r = [n[1], -n[0]];
        put('dark', geom.custom({ position: [cpt[0] - r[0] * 0.12, tWalk - 3.2, cpt[1] - r[1] * 0.12, cpt[0] + r[0] * 0.12, tWalk - 3.2, cpt[1] + r[1] * 0.12, cpt[0] + r[0] * 0.12, tWalk - 1.6, cpt[1] + r[1] * 0.12, cpt[0] - r[0] * 0.12, tWalk - 1.6, cpt[1] - r[1] * 0.12], index: [0, 1, 2, 0, 2, 3], normal: [n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1]] }));
      }
      // pilaster towers either side of both doorways (a tower-flanked portal, as on every Babylonian gate front)
      for (const [s0, dn] of [[-HL, -1], [HL, 1]]) {
        const c = atN(sg * 5.4, s0), n = [nS[0] * dn, nS[1] * dn], a = add(c, nE, -1.5), b = add(c, nE, 1.5), top = walk + BREAST + 0.55;
        put('brick', geom.paint(geom.prism([a, b, add(b, n, 0.6), add(a, n, 0.6)], L0 - 2.5, top), [0.95, 0.95, 0.96]));
        const cp = add(c, n, 0.612), r = [n[1], -n[0]];
        put('dark', geom.custom({ position: [cp[0] - r[0] * 0.11, top - 3.3, cp[1] - r[1] * 0.11, cp[0] + r[0] * 0.11, top - 3.3, cp[1] + r[1] * 0.11, cp[0] + r[0] * 0.11, top - 2.0, cp[1] + r[1] * 0.11, cp[0] - r[0] * 0.11, top - 2.0, cp[1] - r[1] * 0.11], index: [0, 1, 2, 0, 2, 3], normal: [n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1]] }));
      }
      ctx.emitters.add({ kind: 'torch', pos: [...atN(sg * 3.4, -HL - 0.5).slice(0, 1), L0 + 3.2, atN(sg * 3.4, -HL - 0.5)[1]], size: 0.9 });
    }
    K.putFar('brick', geom.prism(rectN(-HWg, HWg, -HL, HL), L0 - 2.5, walk + 1));
    const F = { at: atN, E: nE, S: nS, rot: rotN };
    K.doorSet(F, -HL + 1.6, 1, { half: DW, floor: flN + 0.06, spring: crown - DW, sill: 'stone' });
    K.doorSet(F, HL - 1.6, -1, { half: DW, floor: flS + 0.06, spring: crown - DW, sill: 'stone' });
    stats.northGate = { walk: +(walk - L0).toFixed(2), towerTop: +(tWalk + BREAST + 0.9 - L0).toFixed(2), length: 2 * HL };
  }

  // ------------------------------------------------------------------------------------------ causeway ----
  // the street crosses the north moat between two sheer brick walls that stand ON the hard edges of the ground
  // model (face on the line, body on the land side, foot under the bed); north of the moat the ramp runs on between
  // lower brick walls until the made ground ends
  for (const e of ground.hardEdges) {
    if (e.id !== 'quay:northPalaceMoat:0' && e.id !== 'quay:innerMoatEast:0') continue;
    const seg = e.id === 'quay:northPalaceMoat:0' ? [e.polyline[1], e.polyline[2]] : [e.polyline[0], e.polyline[1]];
    put('quay', geom.wall(M.resamplePolyline(seg, 6), { thickness: 1.8, offset: e.land * 0.9, base: e.foot - 0.6, top: (x, z) => lvl(x, z) + 1.05 }));
    put('stone', geom.wall(M.resamplePolyline(seg, 6), { thickness: 1.96, offset: e.land * 0.9, base: (x, z) => lvl(x, z) + 1.05, top: (x, z) => lvl(x, z) + 1.19, bottom: true }));
  }
  const rampN = pl.slice(0, 2), chRamp = M.nearestOnPolyline(368, -1070, rampN).s;
  for (const sg of [-1, 1]) {
    const line = []; for (let s = chRamp - 3; s >= chRamp - 36; s -= 3) { const p = M.pointAlong(rampN, s), r = [-p.dir[1], p.dir[0]]; line.push([p.x + r[0] * sg * 10.4, p.z + r[1] * sg * 10.4]); }
    const s0 = chRamp - 3;
    put('quay', geom.wall(line, { thickness: 2.2, base: -3.6, top: (x, z) => lvl(x, z) + 1.05 - 0.75 * M.clamp((s0 - M.nearestOnPolyline(x, z, rampN).s - 24) / 9) }));
  }

  // ------------------------------------------------------------------------------------------ paving ----
  const line = pl.slice(0, 10), chs = M.chainage(line), chGate = chs[8], chEnd = chs[9];
  const PG = gate.P0 - 0.039;                                     // level under the paving inside the gate (+15.325)
  const levelAt = (ch, x, z) => {
    const s = ch - chGate;
    // the pavement rises a little through the main gate (R2 7.3: 'levels are slightly higher at the main gate'); in the
    // south doorway it lies 13 cm above the ground model, clear of the earth strip that `streets` lays to the gate
    if (s > 36) return PG + 0.13 * M.clamp((s - 36) / 6.5);
    return Math.min(lvl(x, z), PG);
  };
  const chOfZ = (z) => { let a = 0, b = chEnd; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (M.pointAlong(line, m).z < z) a = m; else b = m; } return (a + b) / 2; };
  const fz = wings.forecourt, chFore = chOfZ(Math.max(wings.bastions.west.B[1], wings.bastions.east.B[1]) - 0.3), chDoor1 = chGate + gate.st.door1;
  const chWallEnd = chOfZ(-1102), chTaper = chOfZ(-1112);
  const cuts = new Set([0, chEnd, chGate, chFore, chDoor1, chWallEnd, chTaper, chGate + 36, chGate + 42.5, ...chs]);
  for (let c = 0; c < chEnd; c += 3) cuts.add(c);
  const stations = [...cuts].filter((c) => c >= 0 && c <= chEnd).sort((a, b) => a - b).filter((c, i, arr) => i === 0 || c - arr[i - 1] > 0.05);
  const pts = stations.map((ch) => { const p = M.pointAlong(line, ch); return { x: p.x, z: p.z, ch, d: p.dir }; });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = K.unit([b.x - a.x, b.z - a.z]);
    pts[i].n = [-d[1], d[0]]; pts[i].y = levelAt(pts[i].ch, pts[i].x, pts[i].z);
  }
  const zone = (c0, c1) => pts.filter((p) => p.ch >= c0 - 1e-6 && p.ch <= c1 + 1e-6);
  const LIME = 2.625, BREC = 5.265, LIFT = { asphalt: 0.05, brec: 0.075, lime: 0.085 };
  put('lime', K.strip(pts, -LIME, LIME, { lift: LIFT.lime, uFrom: -LIME, kerb: 0.03 }));
  for (const sg of [-1, 1]) {
    const band = (z, a, b, key, kerb) => { if (z.length < 2) return; put(key, K.strip(z, Math.min(sg * a, sg * b), Math.max(sg * a, sg * b), { lift: LIFT[key], uFrom: sg * a, flipU: sg < 0, kerb })); };
    band(zone(0, chFore), LIME, BREC, 'brec', 0.04);
    band(zone(chFore, chDoor1), LIME, 17.6, 'brec', 0);
    band(zone(chDoor1, chEnd), LIME, BREC, 'brec', 0.04);
    // asphalted brick from the stone roadway to the walls
    const zr = zone(0, chWallEnd);
    if (zr.length > 1) put('asphalt', K.strip(zr, sg < 0 ? (p) => -(8.4 + 1.6 * M.clamp((p.ch - chTaper) / Math.max(1, chWallEnd - chTaper))) : BREC, sg < 0 ? -BREC : (p) => 8.4 + 1.6 * M.clamp((p.ch - chTaper) / Math.max(1, chWallEnd - chTaper)), { lift: LIFT.asphalt }));
    const zc = zone(chWallEnd, chOfZ(-993));
    if (zc.length > 1) put('asphalt', K.strip(zc, sg < 0 ? -10.0 : BREC, sg < 0 ? -BREC : 10.0, { lift: LIFT.asphalt }));
    const zs = zone(chOfZ(-993), chFore);
    if (zs.length > 1) put('asphalt', K.strip(zs, sg < 0 ? -12.3 : BREC, sg < 0 ? -BREC : 12.3, { lift: LIFT.asphalt }));
    const zg = zone(chDoor1, chEnd);
    if (zg.length > 1) put('asphalt', K.strip(zg, sg < 0 ? -12.0 : BREC, sg < 0 ? -BREC : 12.0, { lift: LIFT.asphalt }));
  }
  void fz;
  // the threshold at the south exit: a limestone sill with a bevel towards the street beyond
  {
    const { at, st } = gate, y = PG + 0.13 + LIFT.lime, c = at(0, st.mainGateSouthFace + 0.2);
    put('stone', geom.box({ x: c[0], z: c[1], sx: 9.0, sz: 0.8, y0: y - 0.4, y1: y + 0.02, rotDeg: gate.rot, batter: 0.5 }));
  }

  stats.lionTotal = stats.lions.east + stats.lions.west;
  return { stats, lions, walls, lvl, levelAt, atN, paving: { lift: LIFT, limestoneHalf: LIME, brecciaHalf: BREC } };
}
