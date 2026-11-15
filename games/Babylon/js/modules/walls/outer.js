// js/modules/walls/outer.js — Nebuchadnezzar's outer wall on the east bank (SPEC 3.5), section outward from the
// mud-wall centreline: mud wall 7 m (wall-walk +13, cavalier towers 8.4 m wide every 52.5 m, alternately 14.8 and
// 10.4 m deep), 12 m of rubble fill used as a road (+7.6), baked-brick wall 7.8 m (+8) with bastions, quay 3.3 m
// (+2), the 80 m moat. Five double gates with causeways, the water gates of the Shuhi and Madanu canals, the
// culvert of the Libil-hegalla under the east inner wall, and the cross-wall in the outer city.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { PARAPET } from './kit.js';

export function makeOuter(ctx, K, L, G, I) {
  const { geom, ground, world, W, layout } = ctx;
  const { put, putFar, mul, mix, TONE, brickTone, mudTone, writer, boxInto, panel, paintBy } = K;
  const ow = world.outerWall, p = ow.profile;

  function build() {
    const line = ow.line, towers = W.wallTowers('outer'), checks = [], stats = {};
    const outSign = I.sideOf(line, towers[0]), ch = M.chainage(line), total = ch[ch.length - 1];
    const off = p.offsetsFromMudWallCentreline, T = p.mudWall.thickness, walk = p.mudWall.top, roadTop = p.bakedWall.top - 0.4;
    // the wall begins and ends on dry ground
    let sMin = 0; while (sMin < 60) { const q = M.pointAlong(line, sMin); if (!ground.isWater(q.x, q.z) && ground.height(q.x, q.z) > 0.2) break; sMin += 1; }
    const gateS = ow.gates.map((g) => ({ g, s: M.nearestOnPolyline(g.x, g.z, line).s }));
    const cutsOf = (half) => gateS.map((q) => [q.s - half, q.s + half]);

    // ---- the mud wall with its cavalier towers
    const mud = L.wallLine({
      line, towers, cuts: cutsOf(10.5), sMin, T, walkAt: () => walk, outSign, key: 'mud', seed: 501, inner: 'merlons', bias: 0.05,
      towerOpts: (t) => {
        const rows = [{ y0: walk + 1.25, y1: walk + 2.15, n: 3, width: 0.32, depth: 0.5 }];
        if (t.top - walk > 5.5) rows.push({ y0: walk + 4.2, y1: walk + 5.1, n: 3, width: 0.32, depth: 0.5 });
        return { shift: Math.max(0, t.d / 2 - T / 2 - 0.7), rows, hatch: t.big, corbel: 0.24 };
      },
      stairs: { every: 7, phase: 3, width: 1.5 },
    });

    // ---- the rubble fill between the two walls, its top a road
    const stretch = (half, fn) => { let a = sMin; for (const [c0, c1] of cutsOf(half).sort((u, v) => u[0] - v[0])) { if (c0 - a > 1) fn(a, c0); a = c1; } if (total - a > 1) fn(a, total); };
    const fillOff = outSign * (off.mudWall[1] + p.gap.width / 2), fillT = p.gap.width + 0.6;
    stretch(14, (a, b) => {
      const pl = M.resamplePolyline(K.subLine(line, a, b, ch), 105);
      const g = geom.wall(pl, { thickness: fillT, offset: fillOff, base: (x, z) => ground.height(x, z) - 0.8, top: roadTop, caps: true });
      put('earth', paintBy(g, mul(TONE.white, 0.92), TONE.white));
      putFar(paintBy(geom.wall(K.subLine(line, a, b, ch), { thickness: fillT, offset: fillOff, base: 0, top: roadTop, caps: true }), mul(TONE.earth, 0.9), TONE.earth));
    });

    // ---- the baked-brick wall with its bastions: a crenellated breastwork on the outer edge, open to the road behind
    const bLine = M.offsetPolyline(line, outSign * (off.bakedWall[0] + off.bakedWall[1]) / 2), bT = p.bakedWall.thickness, bch = M.chainage(bLine);
    const bast = [];
    for (let i = 1; i < towers.length; i++) {
      if (towers[i].run !== towers[i - 1].run) continue;
      const mx = (towers[i].x + towers[i - 1].x) / 2, mz = (towers[i].z + towers[i - 1].z) / 2, h = M.nearestOnPolyline(mx + towers[i].out[0] * 19.4, mz + towers[i].out[1] * 19.4, bLine);
      bast.push({ x: h.x, z: h.z, rotDeg: towers[i].rotDeg, out: towers[i].out, big: false, w: 12.5, d: bT + 3.0, top: p.bakedWall.top + 2.4, s: h.s, wallTop: p.bakedWall.top });
    }
    const bCuts = gateS.map((q) => { const pt = M.pointAlong(line, q.s), r = [-pt.dir[1], pt.dir[0]], h = M.nearestOnPolyline(pt.x + r[0] * outSign * 19.4, pt.z + r[1] * outSign * 19.4, bLine); return [h.s - 13.5, h.s + 13.5]; });
    const bStart = M.nearestOnPolyline(M.pointAlong(line, sMin).x, M.pointAlong(line, sMin).z, bLine).s + 2;
    const baked = L.wallLine({
      line: bLine, towers: bast, cuts: bCuts, sMin: bStart, T: bT, walkAt: () => p.bakedWall.top, outSign, key: 'brick', seed: 551, inner: 'none', detail: 0,
      baseAt: () => -0.8,
      towerOpts: (t) => ({ shift: 1.3, rows: [{ y0: p.bakedWall.top + 0.9, y1: p.bakedWall.top + 1.6, n: 3, width: 0.3, depth: 0.45 }], corbel: 0, hatch: false, door: false, beams: false }),
    });

    // ---- the quay at the water edge
    const edge = ground.hardEdges.find((h) => h.id === 'quay:outerMoat:0');
    let quay = null;
    if (edge) quay = I.quay({ pl: edge.polyline, land: edge.land, foot: edge.foot, topAt: () => p.bakedWall.walkway, walkAt: () => p.bakedWall.walkway - 0.06, older: false, seed: 571 });

    // ---- the five gates
    let nGates = 0, emitters = 0;
    for (const { g } of gateS) {
      const o = M.azToDir(g.facingDeg), P = (v, u = 0) => [g.x + o[0] * v - o[1] * u, g.z + o[1] * v + o[0] * u];
      let gmax = -Infinity; for (let v = -12; v <= 27; v += 1.5) for (const u of [-3, 0, 3]) { const q = P(v, u); gmax = Math.max(gmax, ground.height(q[0], q[1])); }
      const F = Math.max(2.0, gmax + 0.12), pin = P(-24), c = ground.causeways.find((q) => q.gate === g.name) || null;
      const res = G.doubleGate({
        name: g.name, x: g.x, z: g.z, az: g.facingDeg, F, seed: 600 + nGates * 7, door: { width: g.doorWidth, height: 8.2 }, force: false,
        main: { v0: -11, v1: 7, halfW: 11, top: walk + 5, towerTop: walk + 10, wallA: 5.5, wallB: 5.5, chamberHalf: 4, tower: { w: 9, uIn: 5, v0: 1.5, v1: 11 }, sideDoors: [{ v: 0, y: walk }] },
        fore: { v0: 14.5, v1: off.quay[1] - 2, halfW: 14, top: p.bakedWall.top + 3, towerTop: p.bakedWall.top + 6.5, wallA: 0, wallB: 0, chamberHalf: 0, tower: { w: 6.2, uIn: 4.85, v0: off.quay[1] - 6.2, v1: off.quay[1] }, key: 'brick' },
        causeway: c, cityGround: ground.height(pin[0], pin[1]), courtHalf: 14, props: { pedU: 3.3, brazU: 3.5, brazV: 5.5 },
      });
      nGates++; emitters += res.emitters;
    }

    // ---- water gates: the Shuhi and Madanu canals under the outer wall, the Libil-hegalla under the east inner wall
    let waterGates = 0;
    for (const cn of ground.canals) for (const cv of cn.culverts) {
      if (!/water gate|city wall/.test(cv[2])) continue;
      waterGates += waterGate(cn, cv[0], cv[1]) ? 1 : 0;
    }

    // ---- the cross-wall in the outer city
    const cross = crossWall();

    // ---- torches on the big towers (every second big one), declared for nightfx
    let torches = 0;
    let nb = 0; for (const t of mud.towers) { if (!t.big || nb++ % 2) continue; I.fireBasket(t.x, t.top, t.z); torches++; }

    const length = M.polylineLength(line);
    stats.length = Math.round(length); stats.towers = mud.towers.length; stats.bastions = baked.towers.length; stats.gates = nGates; stats.waterGates = waterGates; stats.crossWall = cross; stats.torches = torches; stats.emitters = emitters;
    stats.quay = quay && Math.round(quay.length);
    checks.push({ name: 'outer wall length on the mud-wall centreline (km)', value: +(length / 1000).toFixed(2), expect: '7.2 .. 8.1', pass: length > 7200 && length < 8100 });
    checks.push({ name: 'outer wall: gates / towers on the mud wall / bastions on the baked wall', value: `${nGates} / ${mud.towers.length} / ${baked.towers.length}`, expect: '5 / 147 +/- 8 % / > 100', pass: nGates === 5 && Math.abs(mud.towers.length / 147 - 1) < 0.08 && baked.towers.length > 100 });
    checks.push({ name: 'outer wall section: mud wall / gap / baked wall / quay (m)', value: `${T} / ${p.gap.width} / ${bT} / ${p.quay.thickness}`, expect: '7 / 12 / 7.8 / 3.3', pass: T === 7 && p.gap.width === 12 && bT === 7.8 && p.quay.thickness === 3.3 });
    checks.push({ name: 'cross-wall: length (m), thickness, towers, gate for the north road', value: `${cross.length}, ${ow.crossWall.thickness}, ${cross.towers}, ${cross.gate ? 'yes' : 'no'}`, expect: 'about 450, 5.8', pass: cross.length > 400 && cross.length < 470 });
    return { checks, stats };
  }

  /**
   * The mouths of a culvert under a wall: brick headwalls with two vaulted openings where the cut canal meets the
   * wall on the city side and where it meets the moat. The canal runs underneath (no water surface in the culvert).
   */
  function waterGate(cn, s0, s1) {
    const pl = cn.polyline, a = M.pointAlong(pl, s0 - 0.5), wl = ground.waterLevel, bed = cn.bed ?? wl - 1.8;
    // the outer mouth: the first point beyond the culvert start that lies in a moat
    let sm = null; for (let s = s0 + 4; s <= s1 + 12; s += 0.25) { const q = M.pointAlong(pl, s), zn = ground.zone(q.x, q.z); if (zn.zone === 'moat' || zn.zone === 'river') { sm = s; break; } }
    const width = typeof cn.widthAt === 'function' ? cn.widthAt(s0 - 2) : cn.width, two = width > 7, ow2 = two ? Math.min(4.2, width / 2 - 1.2) : Math.min(3.4, width);
    const mouth = (pt, facing, top, depth, proud, seed) => {
      const d = pt.dir, f = facing > 0 ? d : [-d[0], -d[1]], az = M.dirToAz(f[0], f[1]), r = [-f[1], f[0]];
      const c = [pt.x + f[0] * (proud - depth / 2), pt.z + f[1] * (proud - depth / 2)], tint = brickTone(seed, 700);
      const blockW = two ? ow2 + 2.6 : ow2 + 5;
      for (const k of two ? [-1, 1] : [0]) {
        const bc = [c[0] + r[0] * k * blockW / 2, c[1] + r[1] * k * blockW / 2];
        put('brick', geom.passageBlock({ x: bc[0], z: bc[1], rotDeg: az, width: blockW, depth, base: bed - 1.2, floor: bed + 0.3, top, door: { width: ow2, height: wl + 2.3 - (bed + 0.3), arch: true }, rebates: 1, segments: 10, ends: true }), tint);
        // the dark of the culvert behind the opening and the water standing in it
        const w = writer(); w.color(mul(TONE.bitumen, 0.8));
        const back = [bc[0] - f[0] * (depth / 2 - 0.05), bc[1] - f[1] * (depth / 2 - 0.05)];
        boxInto(w, back[0], back[1], r, ow2 / 2 + 0.3, 0.04, bed, wl + 2.6, { top: false });
        w.color(mul(TONE.bitumen, 1.6));
        boxInto(w, bc[0], bc[1], r, ow2 / 2 - 0.02, depth / 2 - 0.1, wl - 0.6, wl - 0.02, { top: true });
        put('brick', w.toGeometry());
      }
      // wing walls that hold the banks of the cut
      for (const k of [-1, 1]) {
        const e0 = [c[0] + r[0] * k * (two ? blockW : blockW / 2), c[1] + r[1] * k * (two ? blockW : blockW / 2)], e1 = [e0[0] + r[0] * k * 4 + f[0] * 1.5, e0[1] + r[1] * k * 4 + f[1] * 1.5];
        put('brick', geom.wall([e0, e1], { thickness: 1.2, base: bed - 1.2, top: top - 0.5 }), mul(tint, 0.96));
      }
      putFar(geom.box({ x: c[0], z: c[1], y0: bed - 1, y1: top, sx: two ? blockW * 2 : blockW, sz: depth, rotDeg: az, bottom: false }), tint);
    };
    const gi = ground.height(a.x - a.dir[0] * 6 - a.dir[1] * (width / 2 + 4), a.z - a.dir[1] * 6 + a.dir[0] * (width / 2 + 4));
    mouth(M.pointAlong(pl, s0), -1, Math.max(gi, 0.8) + 1.1, 3.6, 0, 1);
    if (sm !== null) mouth(M.pointAlong(pl, sm), 1, 2.45, 4.0, 0.3, 2);
    return true;
  }

  /** The cross-wall: 5.8 m thick, 6 m high, 450 m, towers 9.4 x 7.4 and 7.4 x 7.4 alternately, a gate for the north road. */
  function crossWall() {
    const cw = ow.crossWall, line = cw.polyline, len = M.polylineLength(line), T = cw.thickness;
    let sMin = 0; while (sMin < 80) { const q = M.pointAlong(line, sMin); if (!ground.isWater(q.x, q.z) && ground.height(q.x, q.z) > 0.4) break; sMin += 1; }
    const walkAt = (x, z) => Math.round((ground.height(x, z) + cw.height - PARAPET) * 2) / 2;
    // the gate: where the north road crosses the line
    let gate = null;
    const road = (layout.streets || []).find((s) => s.id === 'northRoad' || s.name === 'northRoad');
    if (road) for (let i = 0; i < road.polyline.length - 1 && !gate; i++) {
      const a = road.polyline[i], b = road.polyline[i + 1];
      for (let j = 0; j < line.length - 1; j++) {
        const c = line[j], d = line[j + 1], rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { const l = Math.hypot(rx, rz); gate = { x: a[0] + rx * t, z: a[1] + rz * t, dir: [rx / l, rz / l], width: road.width || 8 }; break; }
      }
    }
    const cuts = [];
    let gs = null;
    if (gate) { gs = M.nearestOnPolyline(gate.x, gate.z, line).s; cuts.push([gs - 5.5, gs + 5.5]); }
    const n = Math.round((len - sMin) / 45), towers = [];
    for (let k = 0; k < n; k++) {
      const s = sMin + ((k + 0.5) * (len - sMin)) / n; if (gs !== null && Math.abs(s - gs) < 14) continue;
      const q = M.pointAlong(line, s), r = [-q.dir[1], q.dir[0]], big = k % 2 === 0, wl = walkAt(q.x, q.z);
      towers.push({ x: q.x, z: q.z, rotDeg: M.mod(M.dirToAz(q.dir[0], q.dir[1]) - 90, 360), out: [-r[0], -r[1]], big, w: big ? 9.4 : 7.4, d: 7.4, wallTop: wl, top: wl + 2.6, s });
    }
    const res = L.wallLine({
      line, towers, cuts, sMin, T, walkAt, outSign: -1, key: 'mud', seed: 801, inner: 'merlons', bias: 0.2,
      towerOpts: (t) => ({ shift: 0, rows: [{ y0: t.wallTop + 0.9, y1: t.wallTop + 1.6, n: 2, width: 0.3, depth: 0.45 }], corbel: 0.18, hatch: false }),
      stairs: { every: 4, phase: 1, width: 1.2 },
    });
    if (gate) {
      // a plain gate block with a vaulted passage on the line of the road
      const q = M.pointAlong(line, gs), wl = walkAt(q.x, q.z), F = ground.height(q.x, q.z) + 0.1, az = M.dirToAz(q.dir[1], -q.dir[0]), tint = mudTone(3, 811, 0.2);
      put('mud', geom.passageBlock({ x: q.x, z: q.z, rotDeg: az, width: 12, depth: T + 1.6, base: F - 1.5, floor: F, top: wl + 2.2, door: { width: 4, height: 4.6, arch: true }, rebates: 1, rebatesBack: 1 }), tint);
      putFar(geom.passageBlock({ x: q.x, z: q.z, rotDeg: az, width: 12, depth: T + 1.6, base: F - 1.5, floor: F, top: wl + 2.2 + PARAPET * 0.6, door: { width: 4, height: 4.6, arch: true }, segments: 6 }), tint);
      const ring = M.rectRing(q.x, q.z, 12, T + 1.6, az), sg = M.polygonArea(ring) > 0 ? 1 : -1;
      put('mud', geom.wall(ring, { closed: true, thickness: 0.55, offset: sg * 0.275, base: wl + 2.2, top: wl + 2.2 + PARAPET }), mul(tint, 1.03));
      K.merlonRow('mud', M.closeRing(geom.insetRing(ring, 0.28)), wl + 2.2 + PARAPET, mul(tint, 1.03));
      ctx.emitters.add({ kind: 'torch', pos: [q.x, wl + 4.6, q.z], size: 1.1 });
    }
    return { length: Math.round(res.length + (gate ? 11 : 0)), towers: res.towers.length, gate: !!gate };
  }

  return { build };
}
