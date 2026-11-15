// js/modules/palaces/north.js — the North Palace (Hauptburg) with the North Fortification and the structure of the
// royal terraced garden (SPEC 3.9, R4 5 and 7.3). Everything is laid out in the palace's own true-cardinal frame
// (world.json dims.mainBuilding: centre and rotationDeg 15.5): local x = east, local z = south.
//
// From south to north (local z): main building -65..65 | garden slope -64.6..-82.6 (six treads of 3 m) | canal
// -82.1..-95.1 | north quay ..-101.6 | terrace north wall -100.6..-112.6 | North Fortification yard | final north
// wall -167.9..-185.1 | moat. From east to west (local x): lion-street wall (ishtar) | east wing +8 | main building
// -67..67 | terrace walk | west garden flank -71.3..-131.3 (five treads of 12 m) | river wall | river / West Fortification.
import { hash2 } from '../../core/rng.js';

export function buildNorth(ctx, K, B, env) {
  const { W, mathx: M, geom, ground } = ctx;
  const np = W.monument('northPalace'), d = np.dims, mb = d.mainBuilding;
  const f = K.frame(mb.center, mb.rotationDeg);
  const FP = M.openRing(np.footprint.polygon);                 // SW, NW, NE, north gate, mid east, SE: clockwise
  const T15 = d.terraceLevel, T8 = d.lowerTerraceLevel, WT = d.outerWallTop, F8 = T8 + 0.05;
  const BR = 'brickY', MB = 'merlonBlue';
  const checks = [], notes = { beds: [] };
  const lp = FP.map((p) => f.W(p[0], p[1]));                  // footprint in local coordinates
  const [SW, NW, NE, P3, P4, SE] = FP;
  const mbL = M.openRing(mb.polygon).map((p) => f.W(p[0], p[1]));     // (-67,-65) (67,-65) (67,51.8) (22.2,64.9) (-67,65)
  const X0 = -67, X1 = 67, Z0 = -65, Z1 = 65, cutA = mbL[2], cutB = mbL[3];
  const out = (pl, k = 0.07) => M.offsetPolyline(pl, -k, false);       // side = +1 walls: outward is the left of travel

  // ==================================================================================================
  // 1. the outer walls (karu): south-west, west (river), final north wall, north-east stretch; south-east
  // ==================================================================================================
  const westAt = (lz) => { const t = (lz - lp[0][1]) / (lp[1][1] - lp[0][1]); return [SW[0] + (NW[0] - SW[0]) * t, SW[1] + (NW[1] - SW[1]) * t]; };
  const wfTop = f.W(...W.monument('westFortification').footprint.polygon[1])[1];      // local z of the West Fortification's north face (4.4)
  const c1 = f.L(cutB[0], cutB[1]), c2 = f.L(cutA[0], cutA[1]);
  const torch = (p, y) => env.emit('torch', [p[0], y + 1.5, p[1]], 1.0);
  let tk = 0;
  const twr = (cc, w, proj, depth, extra, more = {}) => ({ cc, w, proj, depth, extra, sides: 3, each: (p, y) => { if (tk++ % 3 === 1) torch(p, y); }, ...more });
  const westPts = [c1, SW, westAt(wfTop), westAt(-82.0), westAt(-95.2), NW, NE, [P3[0] + (P4[0] - P3[0]) * 0.04, P3[1] + (P4[1] - P3[1]) * 0.04]];
  const wallBase = ground.waterLevel - 2.8;
  let nTowers = 0, wallLen = 0;
  {
    const common = { key: BR, top: WT, merlon: MB };
    const st = K.enclosure(B, out(westPts), [
      { ...common, thick: 4.5, base: T8 - 0.7, towers: twr(10.4, 5.0, 0.6, 2.4, 2.2) },                                     // south wall, west part
      { ...common, thick: 10, base: wallBase, parapet: 0, merlon: null, kerb: 0 },                                           // against the West Fortification
      { ...common, thick: 10, base: wallBase, towers: twr(13, 6.5, 1.6, 3.5, 2.5), footing: { top: 0.5, proj: 0.4, key: 'ashlar' } },   // river wall
      { ...common, thick: 10, base: 1.55 },                                                                                  // over the mouth of the palace canal
      { ...common, thick: 10, base: wallBase, towers: twr(13, 6.5, 1.6, 3.5, 2.5), footing: { top: 0.5, proj: 0.4, key: 'ashlar' } },
      { ...common, thick: d.finalNorthWall.thickness, base: wallBase, towers: twr(14, 8, 2.4, 4.5, 3, { sides: 3 }), footing: { top: 0.5, proj: 0.45, key: 'ashlar' }, kerb: 0.6 },
      { ...common, thick: d.eastWall.thickness, base: 3.2, towers: twr(14, 6, 1.2, 3, 2.5) },                                // east side north of the North Gate
    ], { side: 1, corners: { size: 9, proj: 1.6, extra: 3.5, only: [1, 5, 6], each: torch } });
    nTowers += st.towers; wallLen += st.length;
    const st2 = K.enclosure(B, out([[SE[0] + 1.5, SE[1]], [c2[0] - 2.2, c2[1] + 0.03]]), [{ ...common, thick: 4.5, base: T8 - 0.7, towers: twr(10.4, 5.0, 0.6, 2.4, 2.2, { m0: 14, m1: 9 }) }], { side: 1 });
    nTowers += st2.towers; wallLen += st2.length;
    // the mouth of the palace canal: three vaulted water gates under the river wall
    const a = westAt(-82.0), b = westAt(-95.2), L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], inn = [-u[1], u[0]], az = M.dirToAz(-inn[0], -inn[1]);
    for (let k = 0; k < 3; k++) {
      const s = (L * (k + 0.5)) / 3, cx = a[0] + u[0] * s + inn[0] * 4.96, cz = a[1] + u[1] * s + inn[1] * 4.96;
      B.near.g(BR, geom.passageBlock({ x: cx, z: cz, rotDeg: az, width: L / 3, depth: 10.08, base: wallBase, floor: -4.4, top: 1.6, door: { width: 2.6, height: 5.3, arch: true }, rebates: 1, segments: 10, ends: k === 0 || k === 2, topFace: false }));
    }
    // either side of the mouth the canal quay (level 0) runs 4 m out beyond the wall: two landing stages of brick in bitumen
    for (const [z0, z1] of [[-82.75, -79.25], [-101.9, -94.45]]) { K.prismInto(B.near.w('brickQ'), f.rect(-143.75, z0, -138.2, z1), wallBase, 0.16, {}); K.prismInto(B.far.w(BR), f.rect(-143.75, z0, -138.2, z1), wallBase, 0.16, {}); }
    // where the palace wall meets the West Fortification the two masses are one: fill the wedge between them
    const wf = M.openRing(W.monument('westFortification').footprint.polygon), wfNE = wf[1], wfSE = wf[2];
    const tw = (SW[1] - wfNE[1]) / (wfSE[1] - wfNE[1]), wfAtSW = [wfNE[0] + (wfSE[0] - wfNE[0]) * tw, SW[1]];
    const wedge = [[wfNE[0] - 0.5, wfNE[1]], westAt(wfTop), [SW[0] + 0.3, SW[1]], [wfAtSW[0] - 0.5, wfAtSW[1] + 2.0]];
    K.prismInto(B.near.w(BR), wedge, 3, WT + 0.02, {}); K.prismInto(B.far.w(BR), wedge, 3, WT, {});
  }

  // the wall of the main terrace (12 m thick, towers on its north face) with a bench along its foot on the canal quay
  {
    const zc = f.W(...d.mainTerraceNorthWall.line[0])[1], th = d.mainTerraceNorthWall.thickness, zN = zc - th / 2, zS = zc + th / 2;
    const st = K.enclosure(B, [f.L(-133, zN), f.L(131.5, zN)], [{ key: BR, top: T15, thick: th, base: -0.7, merlon: MB, kerb: 0.6, towers: twr(14, 7, 1.5, 3.2, 2.5, { m0: 12, m1: 12, base: 3.2 }) }], { side: 1 });
    nTowers += st.towers; wallLen += st.length;
    K.prismInto(B.near.w(BR), f.rect(-133, zS - 0.05, 131.5, zS + 2.2), -0.7, 1.0, {});
    notes.terraceWall = { zN, zS };
  }

  // ==================================================================================================
  // 2. the palace canal: quay walls on the hard edges, quays, the closed east end
  // ==================================================================================================
  const CQ = { zS: -82.1, zN: -95.1, x1: 120.7, qN: -101.6, qS: -79.1, xE: 132.7 };
  {
    const w = B.near.w('brickQ'), wp = B.near.w('pave');
    const foot = -4.5 - 0.7;
    K.prismInto(w, f.rect(-101.2, CQ.zS, 98.7, CQ.zS + 1.5), foot, 0.07, {});                 // south quay wall below the garden
    for (const [x0, x1] of [[-133, -101.2], [98.7, CQ.xE]]) K.prismInto(B.near.w(BR), f.rect(x0, CQ.zS, x1, CQ.qS + 0.02), foot, T8 + 0.4, {});   // high walls where the lower terrace meets the canal
    K.prismInto(w, f.rect(-133, CQ.zN - 1.5, CQ.x1 + 1.5, CQ.zN), foot, 0.07, {});            // north quay wall
    K.prismInto(w, f.rect(CQ.x1, CQ.zN, CQ.x1 + 1.5, CQ.zS), foot, 0.07, {});                 // east end
    K.prismInto(B.near.w(BR), f.rect(CQ.xE - 2.8, CQ.qN - 0.5, CQ.xE + 0.02, CQ.zS), -0.7, T8 + 0.4, {});   // the quay's east end against the lower terrace
    wp.color(0.82, 0.82, 0.82);
    K.poly(wp, f.rect(-133, -98.5, CQ.x1 + 1.5, CQ.zN - 1.45), 0.06); K.poly(wp, f.rect(CQ.x1 + 1.45, -98.5, CQ.xE - 2.75, CQ.zS), 0.06);
    wp.color(1, 1, 1);
    const wf = B.far.w(BR); K.prismInto(wf, f.rect(-133, CQ.zS, -101.2, CQ.qS), 0, T8 + 0.4, {}); K.prismInto(wf, f.rect(98.7, CQ.zS, CQ.xE, CQ.qS), 0, T8 + 0.4, {});
  }

  // ==================================================================================================
  // 3. the main building: enclosure with pilaster towers and blue merlons, courts, halls, fabric of rooms
  // ==================================================================================================
  const mbRing = mbL.map((p) => f.L(p[0], p[1]));
  const PORTAL_Z = -14.6;
  {
    const wallTop = T15 + 10, base = T8 - 0.7;
    const e = (more = {}) => ({ key: BR, top: wallTop, thick: 3.0, base, merlon: MB, kerb: 0.4, towers: twr(10.4, 5.0, 0.7, 2.0, 2.0), ...more });
    const st = K.enclosure(B, M.offsetPolyline(mbRing, -0.02, true), [e(), e({ towers: twr(10.4, 5.0, 0.7, 2.0, 2.0, { skip: (s) => Math.abs(s - (PORTAL_Z - Z0)) < 12 }) }), e({ towers: twr(11, 5.0, 0.7, 2.0, 2.0, { m0: 12, m1: 12 }) }), e(), e()],
      { closed: true, side: 1, corners: { size: 5.6, proj: 0.7, extra: 3.2 } });
    nTowers += st.towers; wallLen += st.length;
    checks.push({ name: 'North Palace main building: towers on its enclosure', value: st.towers, expect: '>= 40 (one every 10.4 m)', pass: st.towers >= 40 });

    // floor of the whole building (the terrain lies 0.15 m lower); courts get their stone slabs on top
    const wp = B.near.w('paveFlat'); wp.color(0.62, 0.62, 0.62); K.poly(wp, M.offsetPolyline(mbRing, 2.4, true), T15); wp.color(1, 1, 1);

    const ce = f.W(...mb.courts.east.center), cw = f.W(...mb.courts.west.center), se = mb.courts.east.size, sw = mb.courts.west.size;
    const EC = [ce[0] - se[0] / 2, ce[1] - se[1] / 2, ce[0] + se[0] / 2, ce[1] + se[1] / 2], WC = [cw[0] - sw[0] / 2, cw[1] - sw[1] / 2, cw[0] + sw[0] / 2, cw[1] + sw[1] / 2];
    notes.courts = { east: EC, west: WC };
    const wB = B.near.w(BR), wR = B.near.w('roof'), fB = B.far.w(BR), fR = B.far.w('roof');
    const blocks = [];
    const blk = (r, h, o = {}) => { K.block(wB, wR, f.rect(r[0], r[1], r[2], r[3]), T15 - 0.5, T15 + h, { parapet: o.parapet ?? 0.7, pt: 0.45, far: fB, farRoof: fR, skip: o.skip }); blocks.push(r); return r; };
    // principal rooms on the south side of each court (31 x 11 and 21 x 9 m inside), a second room behind each
    const p1 = d.mainBuilding.principalRooms[0], p2 = d.mainBuilding.principalRooms[1], pw = mb.portalWidth;
    const hallE = [ce[0] - p1[0] / 2 - 2.6, EC[3], ce[0] + p1[0] / 2 + 2.6, EC[3] + p1[1] + 5.2], hallW = [cw[0] - p2[0] / 2 - 2.6, WC[3], cw[0] + p2[0] / 2 + 2.6, WC[3] + p2[1] + 4.6];
    for (const [hall, h, ph, name] of [[hallE, 13.5, 9.6, 'east'], [hallW, 12.2, 9.0, 'west']]) {
      blk(hall, h, { skip: [0], parapet: 0.9 });
      const a = f.L(hall[0], hall[1]), b = f.L(hall[2], hall[1]);
      K.portalFace(B, BR, a, b, T15 - 0.5, T15 + h + 0.9, -1, { at: 0.5, width: pw, height: ph, sill: T15, depth: 2.2, rebates: 2, step: 0.4, rd: 0.45 });
      K.beamEnds(B, f.L(hall[0] + 1, hall[1]), f.L(hall[2] - 1, hall[1]), T15 + h - 0.45, f.dir(0, -1));
      blk([hall[0] + 1.5, hall[3], hall[2] - 1.5, hall[3] + 12.5], h - 2.2);
      // colossal basalt lions at the entrance of the principal room (R4 5.2), looking into the court
      for (const sx of [-1, 1]) { const p = f.L((hall[0] + hall[2]) / 2 + sx * (pw / 2 + 2.3), hall[1] - 2.4); K.lion(B, 'basalt', p[0], T15, p[1], f.az(0), { scale: 1.05, plinth: 0.6 }); }
      env.emit('brazier', [...f.L((hall[0] + hall[2]) / 2 - 9, hall[1] - 9).slice(0, 1), T15 + 1.1, f.L((hall[0] + hall[2]) / 2 - 9, hall[1] - 9)[1]], 1.4);
      checks.push({ name: `North Palace ${name} court: portal of the principal room (m)`, value: pw, expect: '7.5 wide, recessed', pass: Math.abs(pw - 7.5) < 0.01 });
    }
    // ranges round the two courts, the gate block behind the east portal
    const rg = [
      [[EC[0] - 3.5, EC[1] - 8, EC[2] + 3.5, EC[1]], 8.6], [[EC[2], EC[1], EC[2] + 8, EC[3]], 8.2], [[EC[0] - 8, EC[1], EC[0], EC[3]], 9.0],
      [[WC[0] - 3, WC[1] - 8, WC[2] + 3, WC[1]], 8.0], [[WC[0] - 8, WC[1], WC[0], WC[3]], 8.4], [[WC[2], WC[1], WC[2] + 8, WC[3]], 8.8],
      [[EC[2] + 8, PORTAL_Z - 7, X1 - 3, PORTAL_Z + 7], 10.6],
    ];
    for (const [r, h] of rg) blk(r, h);
    // doors from the courts into the ranges
    const dr = (lx, lz, ox, oz, w = 1.7, h = 3.4) => K.door(B, f.L(lx, lz), f.dir(ox, oz), T15 + 0.02, w, h);
    for (const C of [EC, WC]) {
      for (const k of [0.25, 0.75]) { dr(C[0] + (C[2] - C[0]) * k, C[1], 0, 1); dr(C[0], C[1] + (C[3] - C[1]) * k, 1, 0); dr(C[2], C[1] + (C[3] - C[1]) * k, -1, 0); }
    }
    dr(EC[2], PORTAL_Z, -1, 0, 3.2, 6.2);
    // court paving: slabs of 66 cm in white limestone, mottled sandstone and black basalt (R4 5.2), laid as a chequer
    const cl = ctx.materials.color('limestone'), cs2 = ctx.materials.color('sandstoneMottled'), cb = ctx.materials.color('basalt');
    const tones = [[cl.r, cl.g, cl.b], [cs2.r * 0.92, cs2.g * 0.9, cs2.b * 0.86], [cb.r * 1.5, cb.g * 1.5, cb.b * 1.55]];
    const ws = B.near.w('slabs');
    let slabs = 0;
    for (const C of [EC, WC]) {
      const m = 0.66, nx = Math.round((C[2] - C[0]) / m), nz = Math.round((C[3] - C[1]) / m), sx = (C[2] - C[0]) / nx, sz = (C[3] - C[1]) / nz;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const border = i === 2 || j === 2 || i === nx - 3 || j === nz - 3;
        const t = border || (i % 8 === 6 && j % 8 === 6) ? 2 : (i + j) % 2 === 0 ? 0 : 1, k = 0.9 + 0.1 * hash2(i, j, 71), c = tones[t];
        ws.color(c[0] * k, c[1] * k, c[2] * k);
        const a = f.L(C[0] + i * sx, C[1] + j * sz), b = f.L(C[0] + (i + 1) * sx, C[1] + j * sz), cc = f.L(C[0] + (i + 1) * sx, C[1] + (j + 1) * sz), dd = f.L(C[0] + i * sx, C[1] + (j + 1) * sz);
        ws.quad(a[0], T15 + 0.05, a[1], dd[0], T15 + 0.05, dd[1], cc[0], T15 + 0.05, cc[1], b[0], T15 + 0.05, b[1]);
        slabs++;
      }
      const wf = B.far.w('slabs'); wf.color(0.62, 0.58, 0.52); K.poly(wf, f.rect(C[0], C[1], C[2], C[3]), T15 + 0.05);
    }
    ws.color(1, 1, 1);
    checks.push({ name: 'North Palace: stone slabs in the two courts', value: slabs, expect: 'about 5,600 (R4 5.2)', pass: slabs > 4800 && slabs < 6400 });

    // everything else: courtyard units (rooms round small courts, lanes), cut by the oblique south-east wall
    const dx = cutB[0] - cutA[0], dz = cutB[1] - cutA[1], l = Math.hypot(dx, dz), nxx = -dz / l, nzz = dx / l, sgn = nxx * 0 + nzz * 0 - (nxx * cutA[0] + nzz * cutA[1]) < 0 ? 1 : -1;
    const clip = [[nxx * sgn, nzz * sgn, (nxx * cutA[0] + nzz * cutA[1]) * sgn - 3.2]];
    const reserved = [EC, WC, hallE, hallW, [hallE[0] + 1.5, hallE[3], hallE[2] - 1.5, hallE[3] + 12.5], [hallW[0] + 1.5, hallW[3], hallW[2] - 1.5, hallW[3] + 12.5], ...rg.map((q) => q[0])];
    const units = K.fabric(B, f, [X0 + 3.2, Z0 + 3.2, X1 - 3.2, Z1 - 3.2], { reserved, floor: T15, base: T15 - 0.5, hMin: 6.4, hMax: 8.8, unit: 23, lane: 0.35, seed: 11, clip, wall: BR, roof: 'roof' });
    notes.units = units.length;
    checks.push({ name: 'North Palace: courtyard units in the main building', value: units.length, expect: '>= 25', pass: units.length >= 25 });
    // roof life: stair heads on the larger units, drain spouts into the courts
    let k = 0;
    for (const un of units) {
      k++;
      if (!un.court) continue;
      const c = un.court, s = un.south;
      if (hash2(k, 3, 19) < 0.6) { const q = f.rect(s[0] + 0.6, s[1] + 0.6, s[0] + 3.0, s[1] + 2.6); K.block(wB, wR, q, un.hi - 0.1, un.hi + 2.1, { parapet: 0.25, pt: 0.3 }); }
      K.spouts(B, f.L(c[0], c[1]), f.L(c[2], c[1]), un.roof - 0.15, f.dir(0, 1), { spacing: 6 });
      K.door(B, f.L((c[0] + c[2]) / 2, c[3]), f.dir(0, -1), T15 + 0.02, 1.3, 2.5);
    }

    // the east portal: a tower-flanked gateway on a landing, reached by a ramp along the facade
    const gz = PORTAL_Z, gate = geom.gateway({ x: f.L(X1 - 1.0, gz)[0], z: f.L(X1 - 1.0, gz)[1], facingDeg: f.az(90), width: 16, depth: 5.2, base, floor: T15, top: wallTop + 2.3, towerWidth: 4.6, towerProjection: 1.5, towerTop: wallTop + 5.2,
      door: { width: 4.2, height: 8.6, arch: true }, rebates: 3 });
    B.near.g(BR, gate.geometry);
    for (const ml of gate.merlonLines) K.merlonRow(B, MB, ml.line, ml.y);
    K.prismInto(fB, f.rect(X1 - 3.6, gz - 8, X1 + 3.1, gz + 8), base, wallTop + 5.2, {});
    { // closed door leaves in the passage
      const at = f.L(X1 + 0.6, gz), o = f.dir(1, 0), wd = B.near.w('door'), r = f.dir(0, 1);
      const P = (s, y) => [at[0] + r[0] * s, y, at[1] + r[1] * s];
      K.Q(wd, P(-2.1, T15), P(2.1, T15), P(2.1, T15 + 8.6), P(-2.1, T15 + 8.6), o[0], 0, o[1]);
      const wb = B.near.w('bronze');
      for (let i = 0; i < 6; i++) { const y = T15 + 0.7 + i * 1.15, at2 = f.L(X1 + 0.64, gz), P2 = (s, yy) => [at2[0] + r[0] * s, yy, at2[1] + r[1] * s]; K.Q(wb, P2(-2.1, y), P2(2.1, y), P2(2.1, y + 0.2), P2(-2.1, y + 0.2), o[0], 0, o[1]); }
    }
    for (const sz of [-1, 1]) { const p = f.L(X1 + 5.2, gz + sz * 5.6); K.lion(B, 'basalt', p[0], T15, p[1], f.az(90), { scale: 1.1, plinth: 0.7 }); torch(f.L(X1 + 2.2, gz + sz * 3.4), T15 + 6); }
    // landing (+15) and ramp down to the east wing (+8): 1 in 6, with a parapet on the open side
    const LX = X1 + 8.5, lz0 = gz - 9, lz1 = gz + 9;
    K.prismInto(B.near.w(BR), f.rect(X1 + 0.05, lz0, LX, lz1), T8 - 0.7, T15 - 0.03, { top: false }); K.poly(B.near.w('pave'), f.rect(X1 + 0.05, lz0, LX, lz1), T15 + 0.0);
    K.prismInto(fB, f.rect(X1 + 0.05, lz0, LX, lz1), T8 - 0.7, T15, {});
    for (const [a, b] of [[[LX - 0.5, lz0], [LX, lz1]], [[X1 + 0.05, lz0], [LX, lz0 + 0.5]]]) K.prismInto(B.near.w(BR), f.rect(a[0], a[1], b[0], b[1]), T15 - 0.1, T15 + 0.95, {});
    const RX = X1 + 0.05 + 3.6, RL = 42;
    K.rampBetween(B, BR, f.L(RX, lz1), f.L(RX, lz1 + RL), T15, F8, 7.2, T8 - 0.7, { sides: [-1], topKey: 'pave' });      // going south the open side (east) is on the left
    notes.ramp = { from: [RX, lz1], to: [RX, lz1 + RL] };
    { const p = f.L(RX + 6.2, lz1 + RL - 1.5); K.lion(B, 'basalt', p[0], F8, p[1], f.az(90), { scale: 0.95, plinth: 0.6 }); }
  }

  // ==================================================================================================
  // 4. the terrace walk west of the main building (fills the gap the ground model leaves) and the garden terraces
  // ==================================================================================================
  const terr = ground.gardenTerraces.map((t) => ({ id: t.id, level: t.level, ring: M.openRing(t.ring), l: M.openRing(t.ring).map((p) => f.W(p[0], p[1])) }));
  const WX = -71.3;                                              // east edge of the west flank
  {
    const z0 = Z0 + 0.4, z1 = 61.4;
    K.prismInto(B.near.w(BR), f.rect(WX - 0.6, z0, X0 + 0.3, z1), T8 - 0.7, T15 - 0.02, { top: false });
    const wp = B.near.w('pave'); K.poly(wp, f.rect(WX - 0.6, z0, X0 + 0.3, z1), T15 + 0.02);
    K.prismInto(B.far.w(BR), f.rect(WX - 0.6, z0, X0 + 0.3, z1), T8 - 0.7, T15, {});
    K.prismInto(B.near.w(BR), f.rect(WX - 0.6, z1 - 0.5, X0 + 0.3, z1), T15, T15 + 0.9, {});
  }
  const others = [...terr.map((t) => t.ring), mbRing, ...ground.platforms.filter((p) => /northPalace:(canalQuay|northFortification)/.test(p.id)).map((p) => M.openRing(p.polygon))];
  const gh = ground.height;
  const runs = [];
  {
    // the 1 m gap between the north slope and the heads of the west treads is filled to the level of the west tread
    const wl = [15, 13, 11];
    for (let i = 0; i < 3; i++) { const xa = WX - 12 * (i + 1), xb = WX - 12 * i; K.prismInto(B.near.w(BR), f.rect(Math.max(xa, -101.2), -64.75, xb, -63.4), T8 - 0.7, wl[i] + 0.01, {}); }
    const probe = (x, z) => {
      const q = f.W(x, z);
      if (q[0] > WX - 0.7 && q[0] < X0 + 0.5 && q[1] > Z0 - 0.2 && q[1] < 61.5) return T15;                       // the terrace walk
      if (q[1] > -64.8 && q[1] < -63.3 && q[0] < WX + 0.1 && q[0] > -101.3) return wl[Math.min(2, Math.max(0, Math.floor((WX - q[0]) / 12)))];
      return gh(x, z);
    };
    for (const t of terr) {
      const isN = t.id.startsWith('north'), idx = +t.id.split(':')[1];
      const skip = [];
      t.l.forEach((p, i) => { const q = t.l[(i + 1) % t.l.length], mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        if (isN && idx === 5 && mz < -82) skip.push(i);                            // on the canal: the quay wall stands there
        if (!isN && idx === 4 && mx < -131) skip.push(i);                           // against the river wall
        if (!isN && Math.abs(mx - WX) < 0.2 && idx === 0) skip.push(i);             // against the terrace walk
      });
      const rr = K.retain(B, t.ring, t.level, { key: BR, thick: isN ? 0.8 : 1.0, kerb: 0.32, skipEdges: skip, others, sunk: 2.8, height: probe, niche: { minH: 2.4, bay: 3.3, width: 1.25, depth: 0.24, socle: 0.5, frieze: 0.5 } });
      for (const r of rr) runs.push({ ...r, id: t.id, level: t.level });
      notes.beds.push({ id: t.id, level: t.level, ring: t.ring.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), widthM: isN ? 3 : 12 });
    }
  }
  checks.push({ name: 'garden: terraces with retaining walls', value: terr.length, expect: '11 (north slope 15, 13, 11, 8, 4, 0; west flank 15, 13, 11, 8, 4)', pass: terr.length === 11 });
  checks.push({ name: 'garden: highest tread (level)', value: Math.max(...terr.map((t) => t.level)), expect: '15 = the palace floor, below its parapets (+26)', pass: Math.max(...terr.map((t) => t.level)) <= T15 });

  // ---- north slope: flights along the walls, channels, tiered shadufs lifting from the canal ----
  {
    const lv = [15, 13, 11, 8, 4, 0], zOf = (i) => -64.6 - 3 * i;       // tread i spans zOf(i) .. zOf(i) - 3 (north)
    // switchback stairs at three places: each flight climbs along the foot of the wall it overcomes
    for (const [xs, dir] of [[-78, 1], [16, -1], [84, 1]]) {
      for (let i = 4; i >= 0; i--) {
        const rise = lv[i] - lv[i + 1], run = Math.round(rise / 0.172) * 0.33, sgn = (i % 2 === 0 ? 1 : -1) * dir;
        const foot = f.L(xs - (sgn * run) / 2, zOf(i + 1) - 0.72);
        K.flight(B, BR, foot, f.az(sgn > 0 ? 90 : 270), rise, 1.25, { base: lv[i + 1] });
      }
    }
    // a channel along the foot of every wall
    for (let i = 1; i <= 4; i++) for (const [xa, xb] of [[-99, -84], [-72, -46], [-33, 10], [22, 45], [59, 78], [90, 96]]) K.channel(B, f.L(xa, zOf(i) - 0.45), f.L(xb, zOf(i) - 0.45), lv[i], {});
    // two lifting stations: on every tread a shaduf at the outer edge lifts from the basin of the tread below
    // (the lowest from the canal) into the basin of its own tread
    let n = 0;
    for (const xs of [-40, 52]) {
      for (let j = 5; j >= 0; j--) {
        const xk = xs + (j % 2) * 2.6, zP = j === 5 ? -81.25 : zOf(j + 1) + 0.95, lower = j === 5 ? ground.waterLevel : lv[j + 1] + 0.4;
        K.shaduf(B, f.L(xk, zP), lv[j], f.az(0), { tilt: 0.75 - 0.45 * ((j * 7 + (xs > 0 ? 1 : 0)) % 3), arm: j === 5 ? 3.0 : 3.5, rope: Math.max(0.6, lv[j] + 1.2 - lower - 0.9), pier: 2.2 });
        K.basin(B, f, xk + 0.9, zOf(j) - 2.5, xk + 3.3, zOf(j) - 1.1, lv[j], {});
        n++;
      }
    }
    notes.shadufs = n;
    checks.push({ name: 'garden: tiered shadufs on the north slope', value: n, expect: '12 (two stations of six lifts; no bucket chain)', pass: n === 12 });
  }
  // ---- west flank: axial stairs, vault mouths of the substructure on the lowest wall, wells, channels ----
  {
    const lv = [15, 13, 11, 8, 4], xOf = (i) => WX - 12 * i;             // tread i spans xOf(i) .. xOf(i) - 12 (west)
    for (const zc of [-38, 26]) for (let i = 3; i >= 0; i--) {
      const rise = lv[i] - lv[i + 1], foot = f.L(xOf(i + 1) - Math.round(rise / 0.172) * 0.33, zc);
      K.flight(B, BR, foot, f.az(90), rise, 3.0, { base: lv[i + 1], parapet: { height: 0.6, thickness: 0.4 } });
    }
    // brick barrel vaults of the substructure open onto the lowest tread (+4), under an extension of the +8 tread
    const xw = xOf(4), bay = 3.7;
    let vaults = 0;
    for (const [za, zb] of [[-60, -42], [-34, 22], [30, 58]]) {
      const nb = Math.floor((zb - za) / bay), z0 = (za + zb) / 2 - (nb * bay) / 2;
      for (let k = 0; k < nb; k++) {
        const c = f.L(xw - 1.45, z0 + (k + 0.5) * bay);
        B.near.g(BR, geom.passageBlock({ x: c[0], z: c[1], rotDeg: f.az(270), width: bay, depth: 2.9, base: 3.3, floor: 4.0, top: 8.32, door: { width: 2.5, height: 3.3, arch: true }, segments: 8, ends: k === 0 || k === nb - 1 }));
        vaults++;
      }
      K.prismInto(B.far.w(BR), f.rect(xw - 2.9, z0, xw, z0 + nb * bay), 3.3, 8.3, {});
    }
    checks.push({ name: 'garden: vault mouths of the substructure (west flank)', value: vaults, expect: '>= 20', pass: vaults >= 20 });
    for (let i = 1; i <= 4; i++) for (const [za, zb] of [[-61, -41], [-35, 23], [29, 59]]) K.channel(B, f.L(xOf(i) - 0.5 - (i === 4 ? 3.0 : 0), za), f.L(xOf(i) - 0.5 - (i === 4 ? 3.0 : 0), zb), lv[i], {});
    // rope-and-pulley wells over brick shafts on the top tread (fed by the 1.2 m conduits from the canal), with basins
    let wells = 0;
    for (const zc of [-52, -6, 44]) { const p = f.L(WX - 3.2, zc); K.well(B, p, 15, f.az(0), {}); K.basin(B, f, WX - 8.2, zc - 1.5, WX - 5.4, zc + 1.5, 15, {}); wells++; }
    for (const xc of [-58, 8, 70]) { const p = f.L(xc, -66.2); K.well(B, p, 15, f.az(90), { size: 0.95 }); wells++; }
    checks.push({ name: 'garden: rope-and-pulley wells', value: wells, expect: 6, pass: wells === 6 });
    notes.wells = wells;
  }

  // ==================================================================================================
  // 5. paving of the lower terrace (+8): east wing, south-west yard, north-west corner
  // ==================================================================================================
  const eastIn = (k) => M.offsetPolyline([P3, P4, SE], k, false).map((p) => f.W(p[0], p[1]));      // k m inside the east edge (the street wall is ishtar's)
  const southAt = (lx, k = 0) => lp[5][1] + ((lp[0][1] - lp[5][1]) * (lp[5][0] - lx)) / (lp[5][0] - lp[0][0]) - k;   // local z of the south outline at local x, k m inside
  {
    const e = eastIn(6.0), wp = B.near.w('paveFlat'), xe = (z) => e[0][0] + ((e[1][0] - e[0][0]) * (z - e[0][1])) / (e[1][1] - e[0][1]);
    const wing = [[X1 - 1, southAt(X1 - 1, 2)], [X1 - 1, -63.9], [98.1, -63.9], [98.1, CQ.qS], [CQ.xE, CQ.qS], [CQ.xE, -100.9], [xe(-100.9), -100.9], e[1], [e[2][0], southAt(e[2][0], 2)]];
    wp.color(0.9, 0.9, 0.9);
    K.poly(wp, wing.map((p) => f.L(p[0], p[1])), F8);
    K.poly(wp, [f.L(-127, 60.8), f.L(24, 60.8), f.L(24, southAt(24, 2)), f.L(-127, southAt(-127, 2))], F8);
    K.poly(wp, f.rect(-127.5, -79.2, -100.6, -63.0), F8);
    wp.color(1, 1, 1);
    notes.eastWing = wing;
  }

  // ==================================================================================================
  // 6. the east wing: entrance from the lion street, trophies, service ranges (seen from above in shot 3)
  // ==================================================================================================
  {
    const wB = B.near.w(BR), wR = B.near.w('roof'), fB = B.far.w(BR), fR = B.far.w('roof');
    // (a) inner gate lodge on the street wall with a landing at street level and two flights down into the wing
    const dir = [SE[0] - P4[0], SE[1] - P4[1]], dl = Math.hypot(dir[0], dir[1]), u = [dir[0] / dl, dir[1] / dl], inn = [-u[1], u[0]];   // travelling south, the palace lies to the right
    // the doorway that the `ishtar` module cuts into the street wall: the interval between two towers nearest the
    // middle of this leg (the same rule as js/modules/ishtar/street.js, so that lodge and doorway face each other)
    const doorCh = (() => {
      const pub = ctx.modules && ctx.modules.ishtar && ctx.modules.ishtar.palaceDoor;        // if ishtar ever publishes it, that wins
      if (pub && Number.isFinite(pub.x)) return Math.hypot(pub.x - SE[0], pub.z - SE[1]);
      const pw = W.street('processionalWay'), ng = W.monument('ishtarGate').dims.northGate, ew = d.eastWall, pl = pw.polyline;
      const v = [pl[4][0] - pl[2][0], pl[4][1] - pl[2][1]], vl = Math.hypot(v[0], v[1]), sN = (x, z) => ((x - ng.x) * v[0] + (z - ng.z) * v[1]) / vl;
      const face = [SE, P4, P3, NE];
      let a = 0, b = M.polylineLength(face);
      for (let i = 0; i < 40; i++) { const m = (a + b) / 2, q = M.pointAlong(face, m); if (sN(q.x, q.z) > ng.length / 2) a = m; else b = m; }
      // towers of 8 m alternate with intervals, the first tower against the bastion; the doorway is in the interval nearest the middle of the leg
      const L = (a + b) / 2, TW = ew.towerWidth, nT = Math.max(1, Math.round((L - 4) / ew.towersCC)), iv = (L - nT * TW) / nT, want = dl / 2;
      let best = TW + iv / 2;
      for (let i = 0; i < nT; i++) { const c = i * (TW + iv) + TW + iv / 2; if (c < dl - 6 && Math.abs(c - want) < Math.abs(best - want)) best = c; }
      return best;                                                   // metres north of the south-east corner
    })();
    const t0 = 1 - doorCh / dl, o = [P4[0] + dir[0] * t0 + inn[0] * 7.0, P4[1] + dir[1] * t0 + inn[1] * 7.0];
    notes.streetDoor = { chainageFromSE: +doorCh.toFixed(1), x: +(P4[0] + dir[0] * t0).toFixed(1), z: +(P4[1] + dir[1] * t0).toFixed(1) };
    const g = K.frame(o, M.dirToAz(u[0], u[1]) - 180);                 // local +z along the wall southwards, local -x into the palace
    const Ls = Math.round((gh(o[0] - inn[0] * 12, o[1] - inn[1] * 12)) * 10) / 10;       // street level beside the lodge
    K.prismInto(wB, g.rect(-7.4, -8, 0.4, 8), T8 - 0.6, Ls - 0.02, { top: false }); K.poly(B.near.w('pave'), g.rect(-7.4, -8, 0.4, 8), Ls);
    K.prismInto(fB, g.rect(-7.4, -8, 0.4, 8), T8 - 0.6, Ls, {});
    // the lodge stands 4 m proud of the street wall, so that its door is in front of whatever tower or interval lies behind it
    K.block(wB, wR, g.rect(-4.0, -4.6, 0.7, 4.6), T8 - 0.6, Ls + 7.2, { parapet: 0.9, pt: 0.45, far: fB, farRoof: fR, skip: [3] });
    K.merlonRow(B, MB, [g.L(0.45, -4.35), g.L(-3.75, -4.35), g.L(-3.75, 4.35), g.L(0.45, 4.35)], Ls + 8.1);
    K.portalFace(B, BR, g.L(-4.0, 4.6), g.L(-4.0, -4.6), T8 - 0.6, Ls + 8.1, -1, { at: 0.5, width: 3.0, height: 5.2, sill: Ls, depth: 1.2, rebates: 2, step: 0.3, rd: 0.3 });
    K.beamEnds(B, g.L(-4.0, 3.8), g.L(-4.0, -3.8), Ls + 6.5, g.dir(-1, 0), { spacing: 0.95 });
    K.prismInto(wB, g.rect(-7.4, -8, -6.9, 8), Ls - 0.05, Ls + 0.9, {});
    const rise = Ls - F8;
    for (const sg of [-1, 1]) { const run = Math.round(rise / 0.172) * 0.33, foot = g.L(-1.65, sg * (8 + run)); K.flight(B, BR, foot, g.az(sg > 0 ? 0 : 180), rise, 3.4, { base: F8 - 0.03, parapet: { height: 0.8, thickness: 0.4 } }); }
    torch(g.L(-4.6, 2.6), Ls + 1.6); torch(g.L(-4.6, -2.6), Ls + 1.6);
    notes.lodge = { at: g.L(-4.0, 0), level: Ls };
    // (b) a way of limestone slabs from the lodge stairs to the foot of the ramp, trophies on pedestals along it
    const footS = g.L(-1.65, 8 + Math.round(rise / 0.172) * 0.33 + 3), rampFoot = f.L(notes.ramp.to[0], notes.ramp.to[1] + 3.5);
    const wl = B.near.w('slabs'); const cl = ctx.materials.color('limestone'); wl.color(cl.r * 0.96, cl.g * 0.95, cl.b * 0.93);
    { const a = footS, b = rampFoot, L = Math.hypot(b[0] - a[0], b[1] - a[1]), uu = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], r = [-uu[1], uu[0]], hw = 2.3;
      K.H(wl, [a[0] - r[0] * hw, a[1] - r[1] * hw], [b[0] - r[0] * hw, b[1] - r[1] * hw], [b[0] + r[0] * hw, b[1] + r[1] * hw], [a[0] + r[0] * hw, a[1] + r[1] * hw], F8 + 0.04);
      const nT = 9;
      for (let i = 0; i < nT; i++) {
        const s = L * (0.1 + (0.8 * i) / (nT - 1)), sd = i % 2 ? 1 : -1, p = [a[0] + uu[0] * s + r[0] * sd * 5.0, a[1] + uu[1] * s + r[1] * sd * 5.0], az = M.dirToAz(-r[0] * sd, -r[1] * sd);
        const kind = i % 3;
        K.stele(B, kind === 1 ? 'limestoneObj' : 'basalt', p[0], F8, p[1], az, kind === 0 ? { statue: true, height: 1.7, plinth: 0.7 } : kind === 1 ? { height: 1.25, width: 0.75, plinth: 0.55 } : { height: 1.6, width: 0.9, thick: 0.34, plinth: 0.5 });
      }
      notes.trophies = nT;
    }
    wl.color(1, 1, 1);
    // (c) service range along the inside of the south wall: store rooms with doors and spouts, each roof at its own level
    const sdir = [SE[0] - SW[0], SE[1] - SW[1]], sl = Math.hypot(sdir[0], sdir[1]), su = [sdir[0] / sl, sdir[1] / sl], sin = [su[1], -su[0]];     // travelling east, the palace lies to the left (north)
    const h = K.frame([SE[0] + sin[0] * 4.4, SE[1] + sin[1] * 4.4], M.dirToAz(su[0], su[1]) - 90);     // local +x east along the wall, local -z into the wing
    /** A row of store rooms against a wall. fr: frame; along: 'x' | 'z'; wall: coordinate of the wall face on the other axis; s: +1 / -1 = the way into the court. */
    const rooms = [];
    const row = (fr, along, a0, a1, wall, sg, seed) => {
      let x = a0, i = 0;
      while (x < a1 - 5) {
        const wd = 9 + 6 * hash2(i, seed, 41), x1 = Math.min(a1, x + wd), dep = 6.2 + 2.2 * hash2(i, seed, 43), rh = 4.3 + 1.6 * hash2(i, seed, 47);
        if (x1 - x > 5) {
          const p0 = wall - 0.35 * sg, p1 = wall + dep * sg, lo = Math.min(p0, p1), hi = Math.max(p0, p1);
          const R = (u0, v0, u1, v1) => (along === 'x' ? fr.rect(u0, v0, u1, v1) : fr.rect(v0, u0, v1, u1)), Lp = (u, v) => (along === 'x' ? fr.L(u, v) : fr.L(v, u)), dn = along === 'x' ? fr.dir(0, sg) : fr.dir(sg, 0);
          K.block(wB, wR, R(x, lo, x1, hi), T8 - 0.5, T8 + rh, { parapet: 0.5 + 0.3 * hash2(i, seed, 5), pt: 0.4, far: fB, farRoof: fR });
          K.door(B, Lp((x + x1) / 2, p1), dn, F8, 1.5, 2.7);
          if (x1 - x > 11) K.door(B, Lp(x + 2.6, p1), dn, F8, 1.2, 2.3);
          K.spouts(B, Lp(x, p1), Lp(x1, p1), T8 + rh - 0.1, dn, { spacing: 7 });
          K.beamEnds(B, Lp(x + 0.6, p1), Lp(x1 - 0.6, p1), T8 + rh - 0.55, dn, { spacing: 1.1, size: 0.2, proud: 0.2 });
          rooms.push([x, x1, dep, rh]);
        }
        x = x1 + (hash2(i, seed, 53) < 0.25 ? 2.4 : 0); i++;
      }
    };
    row(h, 'x', -84, -11.5, 0, -1, 5);
    // along the inside of the street wall north of the lodge, and along its next leg up to the canal
    row(g, 'z', -31, -17.5, 0, -1, 15);
    { const d2 = [P4[0] - P3[0], P4[1] - P3[1]], l2 = Math.hypot(d2[0], d2[1]), u2 = [d2[0] / l2, d2[1] / l2], in2 = [-u2[1], u2[0]];
      const g2 = K.frame([P4[0] + in2[0] * 7.0, P4[1] + in2[1] * 7.0], M.dirToAz(u2[0], u2[1]) - 180);
      row(g2, 'z', -41, -3, 0, -1, 25); }
    notes.serviceRooms = rooms.length;
    // (d) guard houses in the middle of the wing (courtyard units), north of the way
    const units = K.fabric(B, f, [96, -58, 126, 6], { floor: T8, base: T8 - 0.5, hMin: 4.4, hMax: 5.8, unit: 17, lane: 0.6, laneW: 2.6, seed: 23, wall: BR, roof: 'roof', courts: 1 });
    notes.guardUnits = units.length;
    // (e) a well, a trough, benches along the range
    const wpt = h.L(-52, -16); K.well(B, wpt, F8, h.az(0), { size: 1.1 }); K.basin(B, h, -58, -17.2, -54.6, -14.8, F8, {});
    for (const [a, b] of [[-88, -70], [-48, -30]]) K.prismInto(wB, h.rect(a, -9.4, b, -8.8), F8 - 0.3, F8 + 0.45, {});
    env.emit('brazier', [h.L(-40, -22)[0], F8 + 1.1, h.L(-40, -22)[1]], 1.3);
    notes.serviceFrame = h; notes.gateFrame = g;
    env.jars(h, [[-80, -10.5], [-78.6, -10.2], [-66, -10.4], [-44, -10.6], [-42.8, -10.1], [-26, -10.3], [-24.9, -10.8], [-60, -13.5], [-20.5, -12], [-33, -10.4], [-34.2, -10.9], [-33.6, -11.6], [-15, -11], [-14.2, -11.8], [-71, -10.6], [-51, -17.5], [-50.2, -18.4]], F8);
    env.jars(g, [[-4.2, -19], [-4.8, -20.2], [-4.1, -26], [-6.5, 9.5], [-7.2, 10.4], [-6.3, -9.4]], F8);
    // reed-mat bales and a stack of timber by the range
    { const wr = B.near.w('reed'), wt = B.near.w('timber');
      for (let i = 0; i < 9; i++) { const lx = -70 + 50 * hash2(i, 61, 3), lz = -11 - 3 * hash2(i, 63, 5), sc = 0.9 + 0.6 * hash2(i, 65, 7); K.prismInto(wr, K.rectAt(...h.L(lx, lz), 1.5 * sc, 0.9 * sc, h.rot + 70 * hash2(i, 67, 9)), F8, F8 + 0.5 + 0.5 * hash2(i, 69, 11), {}); }
      for (let i = 0; i < 6; i++) { const a = h.L(-38 + 0.34 * i, -12.5), b2 = h.L(-37.6 + 0.34 * i, -17.8); K.beam(wt, [a[0], F8 + 0.17 + (i % 2) * 0.3, a[1]], [b2[0], F8 + 0.17 + (i % 2) * 0.3, b2[1]], 0.3); } }
  }

  // ==================================================================================================
  // 7. the North Fortification: a bare yard with store buildings against the terrace wall, brick stacks
  // ==================================================================================================
  {
    const zY0 = -167.6, zY1 = notes.terraceWall.zN, wp = B.near.w('earthFlat');
    wp.color(0.92, 0.92, 0.92);
    K.poly(wp, [f.L(-131, zY0), f.L(122, zY0), f.L(128, -140), f.L(131, zY1 + 0.5), f.L(-131, zY1 + 0.5)], 4.0);
    wp.color(1, 1, 1);
    const units = K.fabric(B, f, [-96, zY1 - 21, 74, zY1 - 1.7], { floor: 4, base: 3.5, hMin: 4.6, hMax: 6.4, unit: 21, lane: 0.55, laneW: 3, seed: 37, wall: BR, roof: 'roof', courts: 0.6, reserved: [[-22, zY1 - 21, -8, zY1 - 1.7], [30, zY1 - 21, 40, zY1 - 1.7]] });
    notes.fortUnits = units.length;
    // stacks of new bricks and a mortar pit: the fortification was the last work of the reign
    const wb = B.near.w(BR);
    for (let i = 0; i < 14; i++) {
      const lx = -118 + 232 * hash2(i, 3, 61), lz = -160 + 22 * hash2(i, 5, 67), sx = 2.4 + 2.5 * hash2(i, 7, 71), sz = 1.6 + 1.4 * hash2(i, 9, 73), hh = 0.8 + 1.1 * hash2(i, 11, 79);
      K.prismInto(wb, K.rectAt(...f.L(lx, lz), sx, sz, f.rot + 30 * hash2(i, 13, 83) - 15), 3.7, 4 + hh, {});
    }
    env.emit('brazier', [f.L(-15, -130)[0], 5.1, f.L(-15, -130)[1]], 1.3);
    // the Lion of Babylon on the north quay of the canal, at its place in world.json
    const bl = d.basaltLion, blq = f.W(bl.x, bl.z), blp = f.L(blq[0], blq[1] + 1.4); K.lion(B, 'basalt', blp[0], 0.06, blp[1], f.az(90), { scale: bl.height / 1.95, plinth: 0.9 });
    checks.push({ name: 'basalt lion (m to the top of the mane)', value: bl.height, expect: 1.95, pass: Math.abs(bl.height - 1.95) < 0.01 });
  }

  // far level: the main building as blocks with its two courts (the near bags carry everything else in far form already)
  checks.push({ name: 'North Palace: outer wall top (level)', value: WT, expect: '+18 (world.json outerWallTop)', pass: WT === 18 });
  checks.push({ name: 'North Palace: towers on walls and enclosure', value: nTowers, expect: '>= 110', pass: nTowers >= 110 });
  return { checks, notes, frame: f, stats: { towers: nTowers, wallLength: Math.round(wallLen), streetDoor: notes.streetDoor, lodge: notes.lodge } };
}
