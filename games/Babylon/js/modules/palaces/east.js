// js/modules/palaces/east.js — the East Fortification (SPEC 3.9): a sunken enclosure (floor -2.3) in the angle of the
// inner moat, with towered walls to +14 on the north and east, the embankment of the city wall as its south side
// (top +15 near the gate, stepping down to +5 at the south-east corner) and an older wall across it.
// Its west wall along the lion street is the `ishtar` module's; the stretch north of the North Gate is built here.
import { hash2 } from '../../core/rng.js';

export function buildEast(ctx, K, B, env) {
  const { W, mathx: M, geom, ground } = ctx;
  const ef = W.monument('eastFortification'), d = ef.dims;
  const [SW, W1, W2, NW, NE, SE] = M.openRing(ef.footprint.polygon);       // clockwise: up the lion street, along the moat, back along the embankment
  const FL = d.floorLevel, TOP = d.wallTopLevel.north, BR = 'brickB', MK = 'merlonBrick', base = ground.waterLevel - 2.8;
  const checks = [], notes = {};
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  let tk = 0;
  const twr = (cc, more = {}) => ({ cc, w: 7, proj: 1.8, depth: 3.6, extra: 2.6, sides: 3, each: (p, y) => { if (tk++ % 3 === 0) env.emit('torch', [p[0], y + 1.5, p[1]], 1.0); }, ...more });
  const brazier = (p, y) => env.emit('brazier', [p[0], y + 1.2, p[1]], 1.3);

  // ---- 1. walls: west stretch north of the North Gate, north and east walls on the moat, the stepped embankment on the south ----
  const NS = 10, sLen = Math.hypot(SW[0] - SE[0], SW[1] - SE[1]);
  const sPts = Array.from({ length: NS + 1 }, (_, i) => lerp(SE, SW, i / NS));
  sPts[NS] = lerp(SE, SW, 1 + 1.5 / sLen);
  const pts = [lerp(W2, W1, 0.04), NW, NE, ...sPts];
  const edges = [
    { key: BR, top: TOP, thick: 7, base: FL - 0.8, merlon: MK, towers: twr(15, { w: 6, proj: 1.2, depth: 3 }) },
    { key: BR, top: TOP, thick: 7, base, baseIn: FL - 0.8, merlon: MK, kerb: 0.5, towers: twr(17.5) },
    { key: BR, top: TOP, thick: 7, base, baseIn: FL - 0.8, merlon: MK, kerb: 0.5, towers: twr(17.5) },
  ];
  // the south side retains the berm of the city wall (the embankment breastwork on the quay line is the `walls`
  // module's): its walk lies level with the berm, the parapet stands on the yard side, buttress bays look into the yard
  const sTops = [], su = [(SW[0] - SE[0]) / sLen, (SW[1] - SE[1]) / sLen], so = [su[1], -su[0]];
  for (let i = 0; i < NS; i++) {
    let hi = -Infinity;
    for (let k = 0; k <= 6; k++) { const q = lerp(sPts[i], sPts[i + 1], k / 6); hi = Math.max(hi, ground.height(q[0] + so[0] * 2.5, q[1] + so[1] * 2.5)); }
    const top = Math.round((hi + 0.3) * 4) / 4;
    sTops.push(top);
    edges.push({ key: BR, top, thick: 4.6, base: FL - 0.8, parapet: 0, merlon: null, kerb: 1.0, kt: 0.5, towers: { cc: 100, m0: 14, m1: 14, w: 5.5, proj: -0.6, depth: 6.6, extra: 0, sides: 0 } });
  }
  const st = K.enclosure(B, M.offsetPolyline(pts, -0.07, false), edges, { side: 1, corners: { size: 9.5, proj: 1.8, extra: 3.6, only: [1, 2, 3], each: brazier } });
  let towers = st.towers;
  notes.southTops = sTops;
  checks.push({ name: 'East Fortification: north and east wall top (level)', value: TOP, expect: 14, pass: TOP === 14 });
  checks.push({ name: 'East Fortification: south retaining wall follows the berm (levels west to east)', value: `${sTops[NS - 1]} .. ${sTops[0]}`, expect: 'about +11 behind the bastion, +3 at the south-east corner', pass: sTops[NS - 1] > 10 && sTops[0] < 4.5 });

  // ---- 2. the yard: packed earth at -2.3 (the terrain lies 0.15 m lower) ----
  { const wp = B.near.w('earthFlat'); wp.color(0.9, 0.9, 0.9); K.poly(wp, M.offsetPolyline([SW, W1, W2, NW, NE, SE], 3.2, true), FL); wp.color(1, 1, 1); }
  checks.push({ name: 'East Fortification: floor (level)', value: FL, expect: -2.3, pass: FL === -2.3 });

  // ---- 3. the older wall across the enclosure (world.json dims.innerOlderWall), with a gate gap ----
  const ow = d.innerOlderWall, owA = lerp(ow[0], ow[1], -0.008), owB = ow[1];
  {
    const line = M.offsetPolyline([owA, owB], -2.5, false);
    const g1 = lerp(line[0], line[1], 0.455), g2 = lerp(line[0], line[1], 0.495);
    const spec = { key: BR, top: 7, thick: 5, base: FL - 0.8, merlon: MK, kerb: 0.45, towers: { cc: 21, w: 5.5, proj: 1.3, depth: 2.6, extra: 2.0, sides: 3 } };
    for (const seg of [[line[0], g1], [g2, line[1]]]) { const s2 = K.enclosure(B, seg, [{ ...spec }], { side: 1 }); towers += s2.towers; }
    // gate towers either side of the gap
    for (const g of [g1, g2]) K.block(B.near.w(BR), B.near.w(BR), K.rectAt(g[0] + 0.4, g[1] + 2.4, 6.5, 7.5, M.dirToAz(owB[0] - owA[0], owB[1] - owA[1]) - 90), FL - 0.8, 9.6, { parapet: 0.9, pt: 0.45, far: B.far.w(BR) });
    const gm = lerp(g1, g2, 0.5); env.emit('torch', [gm[0], FL + 4, gm[1] + 3], 1);
  }
  checks.push({ name: 'East Fortification: towers', value: towers, expect: '>= 40', pass: towers >= 40 });

  // ---- 4. barracks and stores, ramp to the embankment, stacks (the fortification is a bare yard: SPEC 3.9) ----
  const dn = [NE[0] - NW[0], NE[1] - NW[1]], ln = Math.hypot(dn[0], dn[1]);
  const f = K.frame(NW, Math.atan2(dn[1], dn[0]) * M.RAD);            // local +x along the north wall eastwards, +z into the yard
  {
    const o = { floor: FL, base: FL - 0.5, hMin: 4.4, hMax: 6.2, unit: 20, lane: 0.6, laneW: 3, wall: BR, roof: 'roof', courts: 0.7 };
    const u1 = K.fabric(B, f, [34, 8.3, 112, 27], { ...o, seed: 71 });
    const u2 = K.fabric(B, f, [150, 8.3, 214, 27], { ...o, seed: 73 });
    const zOld = (x) => f.W(...lerp(owA, owB, (x + 12) / 255))[1];
    const u3 = K.fabric(B, f, [60, zOld(60) + 4.5, 104, zOld(60) + 22], { ...o, seed: 77, courts: 0.4 });
    const u4 = K.fabric(B, f, [150, zOld(150) + 5.5, 222, zOld(150) + 24], { ...o, seed: 79, courts: 0.4 });
    notes.units = u1.length + u2.length + u3.length + u4.length;
    const wb = B.near.w(BR);
    for (let i = 0; i < 26; i++) {
      const lx = 20 + 215 * hash2(i, 3, 101), lz = 34 + 26 * hash2(i, 5, 103) + (i % 2) * 70, sx = 2.2 + 2.6 * hash2(i, 7, 105), sz = 1.5 + 1.5 * hash2(i, 9, 107), hh = 0.7 + 1.2 * hash2(i, 11, 109);
      K.prismInto(wb, K.rectAt(...f.L(lx, lz), sx, sz, f.rot + 40 * hash2(i, 13, 111) - 20), FL - 0.3, FL + hh, {});
    }
    const wp = f.L(128, 40); K.well(B, wp, FL, f.az(0), { size: 1.3, key: 'brick' }); K.basin(B, f, 131, 38.4, 135, 41.6, FL, { key: 'brick' });
    env.emit('brazier', [f.L(120, 46)[0], FL + 1.1, f.L(120, 46)[1]], 1.4);
    env.emit('brazier', [f.L(175, 140)[0], FL + 1.1, f.L(175, 140)[1]], 1.4);
    env.jars(f, Array.from({ length: 16 }, (_, k) => [122 + 16 * hash2(k, 41, 5), 34 + 9 * hash2(k, 43, 9)]), FL);
  }
  // ramp from the yard up to the walk of the embankment where it is lowest (second step from the south-east corner)
  {
    const du = [SW[0] - SE[0], SW[1] - SE[1]], u = [du[0] / sLen, du[1] / sLen], inn = [-u[1], u[0]];       // travelling west the yard lies to the right
    const top = sTops[1], len = (top - FL) * 6.2, s1 = sLen * 0.15, s0 = s1 + len, off = 4.6 + 3.3;
    const a = [SE[0] + u[0] * s0 + inn[0] * off, SE[1] + u[1] * s0 + inn[1] * off], b = [SE[0] + u[0] * s1 + inn[0] * off, SE[1] + u[1] * s1 + inn[1] * off];
    K.rampBetween(B, BR, a, b, FL, top, 6.5, FL - 0.8, { sides: [-1], topKey: 'pave' });
    notes.ramp = { rise: +(top - FL).toFixed(1), length: +len.toFixed(1) };
  }
  return { checks, notes, stats: { towers } };
}
