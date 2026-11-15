// js/modules/palaces/summer.js — the Summer Palace on the Babil mound (SPEC 3.5, R4 6): a sheer brick terrace
// 153 x 173 m with a tower every 10 m, floor at +21, a low two-court palace on top, enclosure walls to +30.
// Local frame: true-cardinal rectangle, x = east, z = south; the river lies west, the outer wall and moat east.
// The approach (a ramp up the east face to a towered gate) is reconstruction: no entrance was found.
import { hash2 } from '../../core/rng.js';

export function buildSummer(ctx, K, B, env) {
  const { W, mathx: M, geom, ground } = ctx;
  const sp = W.monument('summerPalace'), d = sp.dims;
  const f = K.frame(sp.footprint.center, sp.footprint.rotationDeg);
  const hx = d.size[0] / 2, hz = d.size[1] / 2, FL = d.floorLevel, WT = d.wallTop;
  const BR = 'brickB', MK = 'merlonBrick';
  const checks = [], notes = {};
  const ring = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map((p) => f.L(p[0], p[1]));
  const gOut = Math.min(...ring.map((p) => ground.height(p[0] + (p[0] - sp.footprint.center[0]) * 0.08, p[1] + (p[1] - sp.footprint.center[1]) * 0.08)));
  const base = gOut - 1.2, TH = 6, walk = WT - 2.4, gateZ = 4;

  // ---- 1. the terrace wall: 64 towers at 10 m, wall-walk, merlons; the gate in the east face ----
  const per = 2 * (d.size[0] + d.size[1]), cc = per / d.towers;
  let tk = 0;
  const tw = (more = {}) => ({ cc, w: 5.2, proj: 1.3, depth: 3.2, extra: 1.7, sides: 3, m0: cc * 0.9, m1: cc * 0.9, each: (p, y) => { if (tk++ % 3 === 0) env.emit('torch', [p[0], y + 1.5, p[1]], 1.0); }, ...more });
  const e = (more = {}) => ({ key: BR, topKey: 'pave', top: walk, thick: TH, base, baseIn: FL - 0.6, merlon: MK, kerb: 0.45, towers: tw(), ...more });
  const st = K.enclosure(B, M.offsetPolyline(ring, -0.07, true), [e(), e({ towers: tw({ skip: (s) => Math.abs(s - (gateZ + hz)) < 9 }) }), e(), e()],
    { closed: true, side: 1, corners: { size: 7.5, proj: 1.3, extra: 2.6, each: (p, y) => env.emit('brazier', [p[0], y + 1.2, p[1]], 1.3) } });
  const towers = st.towers;
  checks.push({ name: 'Summer Palace: terrace (m)', value: `${d.size[0]} x ${d.size[1]}, floor +${FL}`, expect: '153 x 173, floor +21', pass: d.size[0] === 153 && d.size[1] === 173 && FL === 21 });
  checks.push({ name: 'Summer Palace: towers on the terrace wall', value: towers, expect: '64 +/- 6 (one every 10 m)', pass: Math.abs(towers - 64) <= 6 });
  checks.push({ name: 'Summer Palace: top of the merlons (level)', value: +(walk + 1 + 0.9).toFixed(1), expect: 'about +30 (world.json wallTop)', pass: Math.abs(walk + 1.9 - WT) < 0.8 });

  // gate: tower-flanked gateway through the east wall, a ramp up the east face from the south
  {
    const c = f.L(hx - TH / 2 + 0.6, gateZ);
    const gate = geom.gateway({ x: c[0], z: c[1], facingDeg: f.az(90), width: 17, depth: TH + 1.4, base, floor: FL, top: walk + 3.2, towerWidth: 5, towerProjection: 1.8, towerTop: walk + 5.6, door: { width: 4.0, height: 6.6, arch: true }, rebates: 3 });
    B.near.g(BR, gate.geometry);
    for (const ml of gate.merlonLines) K.merlonRow(B, MK, ml.line, ml.y);
    K.prismInto(B.far.w(BR), f.rect(hx - TH - 0.2, gateZ - 8.5, hx + 3.2, gateZ + 8.5), base, walk + 5.6, {});
    const at = f.L(hx - 1.6, gateZ), o = f.dir(1, 0), r = f.dir(0, 1), wd = B.near.w('door');
    const P = (s, y) => [at[0] + r[0] * s, y, at[1] + r[1] * s];
    K.Q(wd, P(-2, FL), P(2, FL), P(2, FL + 6.6), P(-2, FL + 6.6), o[0], 0, o[1]);
    for (const sz of [-1, 1]) env.emit('torch', [f.L(hx + 2.6, gateZ + sz * 3.6)[0], FL + 4, f.L(hx + 2.6, gateZ + sz * 3.6)[1]], 1.1);
    // landing before the gate and the ramp: 1 in 6 along the foot of the east wall
    const g0 = ground.height(...f.L(hx + 6, hz + 20)), rise = FL - g0, len = rise * 6, x0 = hx + 0.1, wdt = 8;
    K.prismInto(B.near.w(BR), f.rect(x0 - 0.2, gateZ - 6, x0 + wdt, gateZ + 6), base, FL - 0.02, { top: false }); K.poly(B.near.w('pave'), f.rect(x0 - 0.2, gateZ - 6, x0 + wdt, gateZ + 6), FL);
    K.prismInto(B.far.w(BR), f.rect(x0 - 0.2, gateZ - 6, x0 + wdt, gateZ + 6), base, FL, {});
    K.prismInto(B.near.w(BR), f.rect(x0 + wdt - 0.45, gateZ - 6, x0 + wdt, gateZ + 6), FL - 0.1, FL + 0.95, {});
    K.prismInto(B.near.w(BR), f.rect(x0 - 0.2, gateZ - 6, x0 + wdt, gateZ - 5.55), FL - 0.1, FL + 0.95, {});
    K.rampBetween(B, BR, f.L(x0 + wdt / 2, gateZ + 6), f.L(x0 + wdt / 2, gateZ + 6 + len), FL, g0, wdt, base, { sides: [-1], topKey: 'pave' });
    notes.ramp = { rise: +rise.toFixed(1), length: +len.toFixed(1) };
  }

  // ---- 2. the palace on the terrace: two courts with principal rooms to the south (R4 6), ranges, room units ----
  {
    const wB = B.near.w(BR), wR = B.near.w('roof'), fB = B.far.w(BR), fR = B.far.w('roof');
    const wp = B.near.w('paveFlat'); wp.color(0.7, 0.7, 0.7); K.poly(wp, f.rect(-hx + TH - 1, -hz + TH - 1, hx - TH + 1, hz - TH + 1), FL); wp.color(1, 1, 1);
    const ce = d.courts.east, cw = d.courts.west, h1 = d.halls[0], h2 = d.halls[1];
    const EC = [22 - ce[0] / 2, -10 - ce[1] / 2, 22 + ce[0] / 2, -10 + ce[1] / 2], WC = [-30 - cw[0] / 2, -8 - cw[1] / 2, -30 + cw[0] / 2, -8 + cw[1] / 2];
    const blk = (r, h, o = {}) => K.block(wB, wR, f.rect(r[0], r[1], r[2], r[3]), FL - 0.5, FL + h, { parapet: o.parapet ?? 0.7, pt: 0.45, far: fB, farRoof: fR, skip: o.skip });
    const hallE = [22 - h1[0] / 2 - 2.5, EC[3], 22 + h1[0] / 2 + 2.5, EC[3] + h1[1] + 5], hallW = [-30 - h2[0] / 2 - 2.5, WC[3], -30 + h2[0] / 2 + 2.5, WC[3] + h2[1] + 4.6];
    const behindW = [hallW[0] + 1, hallW[3], hallW[2] - 1, hallW[3] + 9 + 3];
    for (const [hall, h, pw, ph] of [[hallE, 10.5, d.portals[1], 7.6], [hallW, 9.6, d.portals[0], 7.0]]) {
      blk(hall, h, { skip: [0], parapet: 0.9 });
      K.portalFace(B, BR, f.L(hall[0], hall[1]), f.L(hall[2], hall[1]), FL - 0.5, FL + h + 0.9, -1, { at: 0.5, width: pw, height: ph, sill: FL, depth: 2.0, rebates: 2, step: 0.4, rd: 0.45 });
      K.beamEnds(B, f.L(hall[0] + 1, hall[1]), f.L(hall[2] - 1, hall[1]), FL + h - 0.45, f.dir(0, -1));
      env.emit('brazier', [f.L((hall[0] + hall[2]) / 2 - 8, hall[1] - 8)[0], FL + 1.1, f.L((hall[0] + hall[2]) / 2 - 8, hall[1] - 8)[1]], 1.4);
    }
    blk(behindW, 8.2);
    const rg = [
      [[EC[0] - 3, EC[1] - 8, EC[2] + 3, EC[1]], 6.8], [[EC[2], EC[1], EC[2] + 8, EC[3]], 7.2], [[EC[0] - 8, EC[1], EC[0], EC[3]], 6.6],
      [[WC[0] - 3, WC[1] - 8, WC[2] + 3, WC[1]], 6.4], [[WC[0] - 8, WC[1], WC[0], WC[3]], 7.0], [[WC[2], WC[1], WC[2] + 8, WC[3]], 6.8],
      [[EC[2] + 8, gateZ - 6.5, hx - TH - 0.3, gateZ + 6.5], 8.4],
    ];
    for (const [r, h] of rg) blk(r, h);
    const dr = (lx, lz, ox, oz, w = 1.7, h = 3.2) => K.door(B, f.L(lx, lz), f.dir(ox, oz), FL + 0.02, w, h);
    for (const C of [EC, WC]) for (const k of [0.3, 0.7]) { dr(C[0] + (C[2] - C[0]) * k, C[1], 0, 1); dr(C[0], C[1] + (C[3] - C[1]) * k, 1, 0); dr(C[2], C[1] + (C[3] - C[1]) * k, -1, 0); }
    // courts paved with limestone slabs of 66 cm (R4 6: about 100 fragments found)
    const ww = B.near.w('way'); for (const C of [EC, WC]) K.poly(ww, f.rect(C[0], C[1], C[2], C[3]), FL + 0.05);
    const wff = B.far.w('way'); for (const C of [EC, WC]) K.poly(wff, f.rect(C[0], C[1], C[2], C[3]), FL + 0.05);
    const reserved = [EC, WC, hallE, hallW, behindW, ...rg.map((q) => q[0])];
    const units = K.fabric(B, f, [-hx + TH + 0.4, -hz + TH + 0.4, hx - TH - 0.4, hz - TH - 0.4], { reserved, floor: FL, base: FL - 0.5, hMin: 4.6, hMax: 6.6, unit: 22, lane: 0.4, seed: 91, wall: BR, roof: 'roof' });
    notes.units = units.length; notes.courts = { east: EC, west: WC };
    checks.push({ name: 'Summer Palace: courts (m)', value: `${ce[0]} x ${ce[1]}, ${cw[0]} x ${cw[1]}`, expect: '36 x 45 and 30 x 41', pass: ce[0] === 36 && ce[1] === 45 && cw[0] === 30 && cw[1] === 41 });
    checks.push({ name: 'Summer Palace: room units', value: units.length, expect: '>= 20', pass: units.length >= 20 });
    let k = 0;
    for (const un of units) { k++; if (un.court && hash2(k, 5, 23) < 0.5) { const s = un.south; K.block(wB, wR, f.rect(s[0] + 0.6, s[1] + 0.6, s[0] + 3.0, s[1] + 2.6), un.hi - 0.1, un.hi + 2.1, { parapet: 0.25, pt: 0.3 }); } }
  }
  return { checks, notes, frame: f, stats: { towers } };
}
