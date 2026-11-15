// js/modules/palaces/west.js — the West Fortification ("great fortification in the river", SPEC 3.9, R4 4), the
// narrow ditch between it and the old quay with its two pierced end walls, and the dry quay terrace east of it.
// Local frame: the block's own true-cardinal rectangle, x = east (the ditch side), z = south; the river lies west.
//   x -51..-37   embankment on the river side (14 m, top +4)
//   x -37..51    the block: outer walls 20 m thick, top +18; four divisions between three cross-walls
//   z  50..130.5 the open southern court (floor +4) with the great stair-ramp in its north-east corner
// The northern half is unexcavated: its divisions are reconstruction (plain store ranges).
import { hash2 } from '../../core/rng.js';

export function buildWest(ctx, K, B, env) {
  const { W, mathx: M, geom, ground } = ctx;
  const wf = W.monument('westFortification'), d = wf.dims;
  const f = K.frame(wf.footprint.center, wf.footprint.rotationDeg);
  const hx = d.size[0] / 2, hz = d.size[1] / 2, TH = d.wallThickness, TOP = d.top, EMB = d.embankmentRiverSide;
  const BR = 'brickQ', MK = 'merlonBrick', FL = 4.0, base = ground.waterLevel - 2.8;
  const checks = [], notes = {};
  const xW = -hx + EMB, xE = hx;                                  // the block proper
  const np = M.openRing(W.monument('northPalace').footprint.polygon), zNP = f.W(np[0][0], np[0][1])[1];     // local z of the North Palace's south-west corner
  let tk = 0;
  const twr = (cc, more = {}) => ({ cc, w: 9, proj: 2.2, depth: 5.5, extra: 3.2, sides: 3, each: (p, y) => { if (tk++ % 2 === 0) env.emit('torch', [p[0], y + 1.5, p[1]], 1.0); }, ...more });
  const gateZ = 92, gateW = 9;

  // ---- 1. the ring wall: north, east (against the North Palace, then on the ditch), south, west (on the embankment, with the quay gate) ----
  const ring = [[xW, -hz], [xE, -hz], [xE, zNP - 1.5], [xE, hz], [xW, hz], [xW, gateZ + gateW / 2], [xW, gateZ - gateW / 2]].map((p) => f.L(p[0], p[1]));
  const e = (more = {}) => ({ key: BR, topKey: 'pave', top: TOP, thick: TH, base, merlon: MK, kerb: 0.5, towers: twr(17.5), ...more });
  let towers = 0;
  {
    const brazier = (p, y) => env.emit('brazier', [p[0], y + 1.2, p[1]], 1.3);
    const st = K.enclosure(B, M.offsetPolyline(ring, -0.07, true), [
      e(), e({ parapet: 0, merlon: null, towers: null }), e({ towers: twr(17.5, { m0: 14 }) }), e(), e({ towers: twr(17.5, { m1: 10 }), base: FL - 0.8 }), e({ towers: null, base: FL + 7.4 }), e({ towers: twr(17.5, { m0: 10 }), base: FL - 0.8 }),
    ], { closed: true, side: 1, corners: { size: 13, proj: 2.2, extra: 4.2, only: [0, 1, 3, 4], each: brazier } });
    towers = st.towers;
    // the quay gate: a vaulted passage through the west wall from the embankment into the southern court
    const c = f.L(xW + TH / 2 - 0.03, gateZ);
    B.near.g(BR, geom.passageBlock({ x: c[0], z: c[1], rotDeg: f.az(270), width: gateW, depth: TH + 0.1, base: FL - 0.8, floor: FL, top: FL + 7.45, door: { width: 3.8, height: 6.2, arch: true }, rebates: 2, rebatesBack: 1, segments: 12, topFace: false }));
    K.prismInto(B.far.w(BR), f.rect(xW, gateZ - gateW / 2, xW + TH, gateZ + gateW / 2), FL - 0.8, FL + 7.4, {});
    K.poly(B.near.w('pave'), f.rect(xW - 0.5, gateZ - 1.9, xW + TH + 0.5, gateZ + 1.9), FL + 0.02);
    for (const sz of [-1, 1]) env.emit('torch', [f.L(xW - 0.6, gateZ + sz * 3.4)[0], FL + 3.2, f.L(xW - 0.6, gateZ + sz * 3.4)[1]], 1);
  }
  checks.push({ name: 'West Fortification: block (m)', value: `${d.size[0]} x ${d.size[1]}, walls ${TH}`, expect: '102 x 301, walls 20, top +18', pass: d.size[0] === 102 && d.size[1] === 301 && TH === 20 && TOP === 18 });
  checks.push({ name: 'West Fortification: towers', value: towers, expect: '>= 40', pass: towers >= 40 });

  // ---- 2. embankment on the river side: a quay at +4 with mooring posts and two flights of water stairs ----
  {
    const w = B.near.w(BR);
    K.prismInto(w, f.rect(-hx - 0.07, -hz - 0.07, xW + 0.3, hz + 0.07), base, FL - 0.02, { top: false });
    K.prismInto(B.far.w(BR), f.rect(-hx, -hz, xW, hz), base, FL, {});
    const wp = B.near.w('paveFlat'); wp.color(0.95, 0.95, 0.95); K.poly(wp, f.rect(-hx - 0.07, -hz - 0.07, xW + 0.3, hz + 0.07), FL); wp.color(1, 1, 1);
    K.prismInto(w, f.rect(-hx - 0.07, -hz - 0.07, -hx + 0.45, hz + 0.07), FL - 0.1, FL + 0.45, {});          // kerb on the river edge
    const wt = B.near.w('timber');
    for (let z = -hz + 9; z < hz - 5; z += 14.5) { const p = f.L(-hx + 1.3, z); K.beam(wt, [p[0], FL - 0.3, p[1]], [p[0], FL + 1.15, p[1]], 0.3); }
    // bales and jars landed on the quay beside the gate
    const wr = B.near.w('reed');
    for (let i = 0; i < 16; i++) { const lx = -hx + 4 + 6.5 * hash2(i, 3, 5), lz = gateZ - 26 + 52 * hash2(i, 7, 9), s = 0.9 + 0.8 * hash2(i, 11, 13); K.prismInto(wr, K.rectAt(...f.L(lx, lz), 1.5 * s, 0.9 * s, f.rot + 80 * hash2(i, 5, 17)), FL, FL + 0.55 + 0.5 * hash2(i, 1, 2), {}); }
    env.jars(f, Array.from({ length: 22 }, (_, i) => [-hx + 3.5 + 8 * hash2(i, 21, 5), gateZ - 14 + 30 * hash2(i, 23, 9)]), FL);
  }

  // ---- 3. cross-walls, the southern court with the great stair-ramp, the divisions ----
  const xi0 = xW + TH, xi1 = xE - TH, zi0 = -hz + TH, zi1 = hz - TH;       // the inner space: 48 x 261 m
  const cross = [[42, 50], [-22, -14], [-86, -78]];
  {
    const w = B.near.w(BR), wp = B.near.w('pave'), wf2 = B.far.w(BR);
    for (const [z0, z1] of cross) {
      K.prismInto(w, f.rect(xi0 - 0.05, z0, xi1 + 0.05, z1), FL - 0.8, TOP - 0.02, { top: false }); K.poly(wp, f.rect(xi0 - 0.05, z0 + 0.4, xi1 + 0.05, z1 - 0.4), TOP);
      for (const zz of [[z0, z0 + 0.4], [z1 - 0.4, z1]]) K.prismInto(w, f.rect(xi0 - 0.05, zz[0], xi1 + 0.05, zz[1]), TOP - 0.1, TOP + 0.5, {});
      K.prismInto(wf2, f.rect(xi0, z0, xi1, z1), FL - 0.8, TOP + 0.5, {});
    }
    // floors
    const wfl = B.near.w('paveFlat');
    wfl.color(0.86, 0.86, 0.86); K.poly(wfl, f.rect(xi0 - 1, 49, xi1 + 1, zi1 + 1), FL);
    wfl.color(0.6, 0.6, 0.6); for (const [za, zb] of [[-15, 43], [-79, -21], [zi0 - 1, -85]]) K.poly(wfl, f.rect(xi0 - 1, za, xi1 + 1, zb), FL);
    wfl.color(1, 1, 1);
    // the great stair along the north side of the southern court, rising east to the wall-walk in the north-east corner (R4 4)
    const rise = TOP - FL, steps = Math.round(rise / 0.175), tread = 0.44, run = steps * tread, zs = 50, wd = 8;
    const foot = f.L(xi1 - 6 - run, zs + wd / 2 + 0.03);
    B.near.g(BR, geom.stairs({ x: foot[0], z: foot[1], azDeg: f.az(90), width: wd, steps, riser: rise / steps, tread, base: FL, sink: 0.8, parapet: null }));
    B.far.g(BR, geom.ramp({ x: foot[0], z: foot[1], azDeg: f.az(90), width: wd, length: run, rise, base: FL, sink: 0.8 }));
    const zo = zs + wd + 0.03;                                   // open (south) edge of the stair
    K.prismInto(w, f.rect(xi1 - 6, zs, xi1 + 0.05, zo + 0.45), FL - 0.8, TOP - 0.02, { top: false }); K.poly(wp, f.rect(xi1 - 6, zs, xi1 + 0.05, zo + 0.45), TOP);
    // parapet on the open side of the stair: a wall that follows the slope, outside the width of the flight
    { const a = f.L(xi1 - 6 - run, zo), b = f.L(xi1 - 6, zo), a2 = f.L(xi1 - 6 - run, zo + 0.45), b2 = f.L(xi1 - 6, zo + 0.45), n = f.dir(0, 1), ux = f.dir(1, 0);
      K.V2(w, a2, b2, FL - 0.5, FL - 0.5, FL + 0.95, TOP + 0.95, n[0], n[1]); K.V2(w, a, b, FL, TOP, FL + 0.95, TOP + 0.95, -n[0], -n[1]);
      K.Q(w, [a[0], FL + 0.95, a[1]], [b[0], TOP + 0.95, b[1]], [b2[0], TOP + 0.95, b2[1]], [a2[0], FL + 0.95, a2[1]], 0, 1, 0);
      K.V(w, a, a2, FL - 0.5, FL + 0.95, -ux[0], -ux[1]);
      K.prismInto(w, f.rect(xi1 - 6, zo, xi1 + 0.05, zo + 0.45), TOP - 0.1, TOP + 0.95, {}); }
    notes.stair = { steps, riser: +(rise / steps).toFixed(3), run: +run.toFixed(1) };
    checks.push({ name: 'West Fortification: great stair in the NE corner of the southern court (risers)', value: steps, expect: '80 risers of 0.175 m to the wall-walk', pass: steps === 80 });
    // store rooms along the west and south sides of the court, a well
    const wB = B.near.w(BR), wR = B.near.w('roof'), fB = B.far.w(BR), fR = B.far.w('roof');
    let z = 60, i = 0;
    while (z < zi1 - 12) {
      const len = 9 + 6 * hash2(i, 3, 91), z1 = Math.min(zi1 - 10.5, z + len), dep = 6.5 + 2 * hash2(i, 5, 93), rh = 4.6 + 1.5 * hash2(i, 7, 95);
      if (Math.abs((z + z1) / 2 - gateZ) > gateW / 2 + (z1 - z) / 2 + 0.5) {
        K.block(wB, wR, f.rect(xi0 - 0.3, z, xi0 + dep, z1), FL - 0.5, FL + rh, { parapet: 0.5, pt: 0.4, far: fB, farRoof: fR });
        K.door(B, f.L(xi0 + dep, (z + z1) / 2), f.dir(1, 0), FL, 1.5, 2.6);
        K.beamEnds(B, f.L(xi0 + dep, z + 0.6), f.L(xi0 + dep, z1 - 0.6), FL + rh - 0.55, f.dir(1, 0), { spacing: 1.2, size: 0.2, proud: 0.2 });
      }
      z = z1 + (hash2(i, 9, 97) < 0.3 ? 2.2 : 0); i++;
    }
    let x = xi0 + 12; i = 0;
    while (x < xi1 - 9) {
      const len = 10 + 6 * hash2(i, 13, 91), x1 = Math.min(xi1 - 3, x + len), dep = 6.5 + 2 * hash2(i, 15, 93), rh = 4.6 + 1.5 * hash2(i, 17, 95);
      K.block(wB, wR, f.rect(x, zi1 - dep, x1, zi1 + 0.3), FL - 0.5, FL + rh, { parapet: 0.5, pt: 0.4, far: fB, farRoof: fR });
      K.door(B, f.L((x + x1) / 2, zi1 - dep), f.dir(0, -1), FL, 1.5, 2.6);
      x = x1 + (hash2(i, 19, 97) < 0.3 ? 2.2 : 0); i++;
    }
    const wp2 = f.L(xi0 + 22, 100); K.well(B, wp2, FL, f.az(0), { size: 1.2, key: 'brick' }); K.basin(B, f, xi0 + 25, 98.6, xi0 + 28.4, 101.4, FL, { key: 'brick' });
    env.emit('brazier', [f.L(8, 92)[0], FL + 1.1, f.L(8, 92)[1]], 1.5);
    env.jars(f, Array.from({ length: 18 }, (_, k) => [xi0 + 9.5 + 3 * hash2(k, 31, 5), 62 + 56 * hash2(k, 33, 9)]), FL);
    // the two middle divisions: two-storeyed ranges of rooms round small courts ("dwelling-like rooms"); the northern one plain stores
    const u1 = K.fabric(B, f, [xi0, -14, xi1, 42], { floor: FL, base: FL - 0.5, hMin: 8.5, hMax: 12.5, unit: 22, lane: 0.4, laneW: 2.4, seed: 51, wall: BR, roof: 'roof' });
    const u2 = K.fabric(B, f, [xi0, -78, xi1, -22], { floor: FL, base: FL - 0.5, hMin: 8.5, hMax: 12.5, unit: 22, lane: 0.4, laneW: 2.4, seed: 53, wall: BR, roof: 'roof' });
    const u3 = K.fabric(B, f, [xi0, zi0, xi1, -86], { floor: FL, base: FL - 0.5, hMin: 7, hMax: 10, unit: 24, lane: 0.6, laneW: 3.2, seed: 57, wall: BR, roof: 'roof', courts: 0.35 });
    notes.units = u1.length + u2.length + u3.length;
    checks.push({ name: 'West Fortification: room units in the three northern divisions', value: notes.units, expect: '>= 18', pass: notes.units >= 18 });
    // on the 20 m wide wall tops: guard shelters beside every second tower, stair heads over the divisions
    let sh = 0;
    for (const [lx, lz, sx, sz] of [[xE - 14, -120, 5, 7], [xE - 14, -52, 5, 7], [xE - 14, 20, 5, 7], [xE - 14, 96, 5, 7], [xW + 13, -100, 5, 7], [xW + 13, -34, 5, 7], [xW + 13, 30, 5, 7], [xW + 13, 124, 5, 7], [-4, -hz + 13, 8, 5], [10, hz - 13, 8, 5], [xi0 + 8, 46, 6, 4.5], [xi1 - 9, -18, 6, 4.5], [xi0 + 10, -82, 6, 4.5]]) {
      K.block(wB, wR, f.rect(lx - sx / 2, lz - sz / 2, lx + sx / 2, lz + sz / 2), TOP - 0.1, TOP + 2.7, { parapet: 0.35, pt: 0.35, far: fB, farRoof: fR });
      K.door(B, f.L(lx, lz + (sz / 2) * (lz > 0 ? -1 : 1)), f.dir(0, lz > 0 ? -1 : 1), TOP, 1.1, 2.0);
      sh++;
    }
    notes.shelters = sh;
  }

  // ---- 4. the ditch: the old quay wall on its east side, two pierced end walls ----
  {
    const eR = ground.hardEdges.find((h) => h.id === 'canal:westFortCanal:right:0');
    const w = B.near.w(BR), DS = 4.0;
    if (eR) {
      const a = f.W(...eR.polyline[0]), b = f.W(...eR.polyline[eR.polyline.length - 1]), zS = Math.max(a[1], b[1]), zN = Math.min(a[1], b[1]), xq = (a[0] + b[0]) / 2;
      K.prismInto(w, f.rect(xq, zN - 1.5, xq + 2.2, zS + 3), eR.foot - 0.6, DS + 0.45, {});                    // the old quay ("moat wall of Imgur-Bel")
      K.prismInto(B.far.w(BR), f.rect(xq, zN - 1.5, xq + 2.2, zS + 3), eR.foot - 0.6, DS + 0.45, {});
      notes.ditch = { width: +(xq - xE).toFixed(1), from: zN, to: zS };
      checks.push({ name: 'ditch beside the West Fortification (m of water)', value: +(xq - xE).toFixed(1), expect: '10 (world.json canals.westFortCanal)', pass: Math.abs(xq - xE - 10) < 1.3 });
      // end walls with three openings each: water passes, boats do not (Koldewey)
      // (the southern one stands on the river front and is the `riverworks` module's; the northern one is built here)
      for (const zc of [zN + 0.2]) {
        const n = 3, wdt = (xq - xE) / n;
        for (let k = 0; k < n; k++) {
          const c = f.L(xE + (k + 0.5) * wdt, zc);
          B.near.g(BR, geom.passageBlock({ x: c[0], z: c[1], rotDeg: f.az(180), width: wdt + 0.02, depth: 2.6, base: eR.foot - 0.6, floor: -4.3, top: DS + 0.45, door: { width: 1.9, height: 5.0, arch: true }, segments: 8, ends: false }));
        }
        K.prismInto(B.far.w(BR), f.rect(xE, zc - 1.3, xq, zc + 1.3), eR.foot - 0.6, DS + 0.45, {});
      }
    }
  }
  return { checks, notes, frame: f, stats: { towers } };
}
