// js/modules/dressing/props2.js — the prop library, part 2: streets and doors, markets, quays and landings,
// the lion street. Same conventions as props.js. Sources: R5 3.2 (no bazaar architecture: goods on mats and in
// baskets at gates, landings, temple fronts and beside the Processional Way), 3.3 (ox carts with solid wheels,
// pack donkeys), 3.4 (cargo: barley under reed mats, date baskets, jars, bricks, reed bundles, bitumen, stone;
// quffas; fishermen), 2.3 (goods arriving by boat).
import { SLOT } from './kit.js';
import { N, rr, vessel, basket, matFlat, roll, pole, brush } from './props.js';

const { REED, CLAY, WOOD, CLOTH } = SLOT;

/** A tied sack standing at (x, z): half-height hy; col; open: grain shows at the top. */
function sack(b, x, z, hy, lod, col, opt = {}) {
  const n = N(lod, 7, 5, 4), m = N(lod, 4, 3, 2), rx = hy * 0.62, rz = hy * 0.5;
  b.slot(CLOTH).col(col, opt.k ?? 1);
  if (opt.lying) { b.blob(x, opt.y ?? 0, z, hy * 1.05, rz * 0.9, rx, n, m, { ry: opt.ry ?? 0 }); return; }
  b.blob(x, (opt.y ?? 0) - hy * 0.12, z, rx, hy, rz, n, m, { ry: opt.ry ?? 0, rx: 5, shade: (j) => 0.8 + 0.2 * (j / m) });
  if (opt.open) b.col(opt.open).heap(x, (opt.y ?? 0) + hy * 1.72, z, rx * 0.6, rz * 0.6, 0.06, n - 1, 1, { seed: 2, skirt: 0.03 });
  else if (lod < 2) b.col(col, (opt.k ?? 1) * 0.75).blob(x, (opt.y ?? 0) + hy * 1.86, z, rx * 0.28, hy * 0.14, rz * 0.3, 5, 2);
}

// ------------------------------------------------------------------------------------------- streets ----
function sacks(b, q, lod, P, v) {
  const cols = [[P.woolDark, 1.0], [P.woolOatmeal, 0.85], [P.woolBrown, 0.9], [P.woolBrown, 0.6]];
  if (lod === 2) { b.slot(CLOTH).col(P.woolBrown, 0.8).box(0, 0, 0.1, 1.1, 0.6, 0.6, { top: 0.75 }); return; }
  const n = 3 + (v % 3);
  for (let i = 0; i < n; i++) {
    const c = cols[(i + v) % cols.length], x = -0.55 + 0.42 * (i % 3) + 0.06 * q(i), z = 0.1 + (i >= 3 ? 0.42 : 0) + 0.05 * q(10 + i);
    sack(b, x, z, 0.3 + 0.07 * q(20 + i), lod, c[0], { k: c[1], ry: 60 * q(30 + i), open: i === 1 && v % 2 === 0 ? P.grain : null });
  }
  if (v >= 2) sack(b, 0.75, 0.25, 0.3, lod, cols[v % 4][0], { k: cols[v % 4][1], lying: true, ry: 20 + 40 * q(5) });
  if (v === 3) vessel(b, 'ovoid', -0.9, 0.15, 0.5, lod, P.clayBuff, { lid: P.woolOatmeal });
}
/** A stack of bricks (33 cm square): sun-dried for house repairs, baked for the royal works. Back at -z. */
function bricks(b, q, lod, P, v) {
  const baked = v > 0, c0 = baked ? (v === 2 ? P.clayRed : P.clayBuff) : P.mud, B = 0.34, hC = baked ? 0.085 : 0.11, nx = 4, nz = 2, courses = 5 + (v % 3);
  b.slot(CLAY);
  if (lod === 2) { b.col(c0, 0.92).box(0, -0.05, 0.4, nx * B, courses * hC + 0.05, nz * B); return; }
  for (let k = 0; k < courses; k++) {
    if (lod === 0 && k >= courses - 2) { for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (k === courses - 1 && q(i * 7 + j) < 0.4) continue; b.col(c0, 0.82 + 0.3 * q(k * 31 + i * 5 + j)).box((i - (nx - 1) / 2) * B + 0.01 * (q(i + k) - 0.5), k * hC, 0.4 + (j - 0.5) * B, B - 0.015, hC - 0.008, B - 0.015, { ry: 4 * (q(i * 3 + j + k) - 0.5) }); } }
    else b.col(c0, 0.84 + 0.2 * q(k)).box(0.02 * (q(k + 40) - 0.5), k === 0 ? -0.05 : k * hC, 0.4 + 0.02 * (q(k + 50) - 0.5), nx * B, hC - 0.006 + (k === 0 ? 0.05 : 0), nz * B, { ry: 1.5 * (q(k + 60) - 0.5) });
  }
  // bricks left about: two leaning on the stack, one flat on the ground
  b.col(c0, 0.95).push(nx * B / 2 + 0.07, 0, 0.35, 0, 0, 16); b.box(0, 0, 0, hC, B, B); b.pop();
  b.col(c0, 0.8).box(nx * B / 2 + 0.4, -0.03, 0.75, B, hC + 0.03, B, { ry: 25 });
  if (lod === 0) b.col(c0, 1.05).box(-nx * B / 2 - 0.3, -0.03, 0.6, B, hC + 0.03, B, { ry: -12 });
}
/** Sheaves of reeds standing against a wall (the wall plane is at z = -0.1): tied twice, the tops loose and plumed. */
function reedLean(b, q, lod, P, v) {
  const n = 3 + (v % 3);
  if (lod === 2) { b.slot(REED).col(P.reed, 0.95); for (let i = 0; i < 2; i++) b.tube([-0.25 + 0.5 * i, -0.05, 0.6], [-0.25 + 0.5 * i, 2.8, -0.1], 0.16, 0.1, 3, [false, false]); return; }
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.32 + 0.05 * (q(i) - 0.5), L = 2.3 + 0.8 * q(10 + i), foot = 0.5 + 0.35 * q(20 + i), r = 0.11 + 0.03 * q(30 + i);
    const top = [x + 0.08 * (q(40 + i) - 0.5), Math.sqrt(Math.max(0.1, L * L - (foot + 0.1) * (foot + 0.1))), -0.1 + r * 0.6], d = [top[0] - x, top[1], top[2] - foot], l = Math.hypot(...d), u = d.map((c) => c / l);
    const at = (t) => [x + d[0] * t, d[1] * t, foot + d[2] * t], col = i % 2 ? P.reed : P.reedOld, k = 0.9 + 0.2 * q(50 + i);
    // the sheaf: thick at the butt, pinched at the two ties, loose above the upper one
    b.slot(REED).col(col, k);
    if (lod === 0) {
      const pr = [[0, 1], [0.24, 0.92], [0.27, 0.78], [0.3, 0.9], [0.6, 0.8], [0.63, 0.66], [0.66, 0.78], [1, 0.62]];
      for (let j = 0; j + 1 < pr.length; j++) b.tube(at(pr[j][0]), at(pr[j + 1][0]), r * pr[j][1], r * pr[j + 1][1], 7, [j === 0, false]);
      b.col(P.rope, 0.85); for (const t of [0.27, 0.63]) b.tube(at(t - 0.012), at(t + 0.012), r * 0.74, r * 0.74, 7, [false, false]);
      // loose stalks and plumes at the top
      for (let s2 = 0; s2 < 6; s2++) {
        const a = (s2 / 6) * 6.283 + i, sp = 0.1 + 0.1 * q(60 + i * 7 + s2), len = 0.35 + 0.45 * q(70 + i * 7 + s2), p0 = at(0.97), p1 = [p0[0] + u[0] * len + Math.cos(a) * sp, p0[1] + u[1] * len + 0.02, p0[2] + u[2] * len + Math.sin(a) * sp * 0.6];
        b.col(col, k * 1.05).tube(p0, p1, 0.016, 0.007, 3, [false, false]);
        if (s2 % 2 === 0) b.col(P.garlic, 0.8).blob(p1[0], p1[1] - 0.03, p1[2], 0.03, 0.09, 0.03, 4, 2);
      }
    } else b.tube(at(0), at(1), r, r * 0.6, 5, [false, true]);
  }
  if (v >= 3) roll(b, REED, P.reed, 0.2, 1.0, 2.2, 0.12, lod, { ry: 8, k: 0.9, bands: [-0.5, 0.5], bandCol: P.rope });
}
/** Dry palm fronds and ribs bundled for fuel, fencing and roofing. */
function fronds(b, q, lod, P, v) {
  if (lod === 2) { b.slot(REED).col(P.frond).box(0, 0, 0, 2.6, 0.25, 0.8); return; }
  const n = N(lod, 6, 3, 2);
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * 0.13, y = 0.05 + 0.05 * (i % 3), a = 6 * (q(i) - 0.5);
    b.push(0, y, z, a);
    b.slot(WOOD).col(P.brush, 0.9 + 0.3 * q(10 + i)).tube([-1.4, 0, 0], [1.4, 0.03, 0], 0.025, 0.008, 3, [true, false]);
    b.slot(REED).col(P.frond, 0.8 + 0.4 * q(20 + i)).quad([-0.4, 0.02, -0.02], [1.4, 0.05, -0.05], [1.5, 0.12, -0.3 - 0.1 * q(30 + i)], [-0.2, 0.06, -0.26], 0, 1, 0.2);
    b.quad([-0.4, 0.02, 0.02], [1.4, 0.05, 0.05], [1.5, 0.1, 0.3 + 0.1 * q(40 + i)], [-0.2, 0.06, 0.26], 0, 1, -0.2);
    b.pop();
  }
  b.slot(REED).col(P.rope).tube([-0.75, 0.1, 0], [-0.7, 0.1, 0], 0.2, 0.2, N(lod, 6, 5, 4), [false, false]);
}
/** A wooden sledge for heavy loads, loaded (stone, bricks or jars), with its tow rope. Travels along -z. */
function sledge(b, q, lod, P, v) {
  const w = 1.0, L = 2.1;
  if (lod === 2) { b.slot(WOOD).col(P.palmWood).box(0, 0, 0, w, 0.2, L); b.slot(CLAY).col(v === 0 ? P.limestone : P.clayBuff).box(0, 0.2, 0.1, 0.8, 0.5, 1.2); return; }
  b.slot(WOOD);
  for (const s of [-1, 1]) b.col(P.palmWood, 0.9).rope([[s * 0.42, 0.06, L / 2], [s * 0.42, 0.06, -L / 2 + 0.3], [s * 0.42, 0.3, -L / 2 - 0.15]], 0.065, N(lod, 5, 4, 3));
  for (let i = 0; i < 4; i++) b.col(P.palmWood, 0.8 + 0.2 * q(i)).box(0, 0.11, -L / 2 + 0.45 + i * 0.45, w, 0.07, 0.12);
  b.col(P.woodCut, 0.75).box(0, 0.18, 0.1, w * 0.92, 0.04, L * 0.78);
  if (v === 0) {            // a block of limestone, lashed
    b.slot(CLAY).col(P.limestone).box(0, 0.22, 0.12, 0.78, 0.52, 1.15, { top: 0.97 });
    b.slot(REED).col(P.rope); for (const z of [-0.2, 0.45]) { b.box(0, 0.22, z, 0.8, 0.535, 0.035); }
  } else if (v === 1) {     // baked bricks
    b.slot(CLAY); for (let k = 0; k < 4; k++) b.col(P.clayBuff, 0.85 + 0.2 * q(10 + k)).box(0, 0.22 + k * 0.087, 0.1, 0.68, 0.08, 1.36 - 0.34 * (k === 3 ? 1 : 0), { ry: 1.5 * (q(k) - 0.5) });
  } else {                  // jars bedded in straw
    b.slot(CLOTH).col(P.straw).heap(0, 0.22, 0.1, 0.42, 0.72, 0.16, N(lod, 8, 6, 5), 1, { seed: 3, flat: 0.6, skirt: 0.0 });
    for (let i = 0; i < 4; i++) vessel(b, 'ovoid', (i % 2 ? 0.2 : -0.2), -0.25 + 0.38 * Math.floor(i / 2) + 0.1, 0.55, lod, i % 2 ? P.clayPale : P.clayBuff, { y: 0.26, lid: P.clayRed });
  }
  b.slot(REED).col(P.rope).rope([[0.42, 0.3, -L / 2 - 0.15], [0.3, 0.04, -L / 2 - 0.7], [0, 0.04, -L / 2 - 1.2], [-0.3, 0.04, -L / 2 - 0.7], [-0.42, 0.3, -L / 2 - 0.15]], 0.018, 3);
}
/** A two-wheeled ox cart with solid plank wheels (R5 3.3), unhitched, the pole resting on the ground. Travels along -z. */
function cart(b, q, lod, P, v) {
  const tr = 0.72, R = 0.55, bedY = 0.72, w = 1.1, L = 1.8;
  const wheel = (s) => {
    b.push(s * tr, R, 0, 0, 0, 90);
    b.slot(WOOD).col(P.palmWood, 0.85).lathe(lod === 2 ? [[0, -0.045], [R, -0.045], [R, 0.045], [0, 0.045]] : [[0, -0.05], [R * 0.96, -0.05], [R, -0.03], [R, 0.03], [R * 0.96, 0.05], [0, 0.05]], N(lod, 14, 9, 6));
    if (lod < 2) {
      b.col(P.palmWood, 1.15).tube([0, -0.06 * s, 0], [0, 0.14 * s, 0], 0.09, 0.09, N(lod, 7, 5, 4), [true, true]);          // hub (the wheel turns with the axle)
      b.col(P.palmWood, 0.7); for (const o of [-0.22, 0.22]) b.box(o, s > 0 ? 0.05 : -0.07, 0, 0.07, 0.02, R * 1.7);          // the battens that hold the three planks
    }
    b.pop();
  };
  wheel(-1); wheel(1);
  b.slot(WOOD).col(P.palmWood, 0.9).tube([-tr - 0.1, R, 0], [tr + 0.1, R, 0], 0.05, 0.05, N(lod, 5, 4, 3), [true, true]);
  b.col(P.woodCut, 0.75).box(0, bedY - 0.08, 0, w, 0.08, L);
  if (lod === 2) { b.slot(REED).col(P.reedOld).box(0, bedY, 0, w, 0.4, L); b.slot(WOOD).col(P.palmWood).tube([0, bedY - 0.1, -L / 2], [0, 0.06, -L / 2 - 2.2], 0.05, 0.05, 3); return; }
  for (const s of [-1, 1]) b.col(P.palmWood, 0.8).box(s * 0.3, R + 0.02, 0, 0.09, bedY - 0.1 - R, L * 0.9);
  // wicker sides and tail board
  b.slot(REED).col(P.reedOld, 0.9);
  for (const s of [-1, 1]) b.box(s * (w / 2 - 0.03), bedY, 0, 0.05, 0.42, L, { top: 1 });
  b.box(0, bedY, -L / 2 + 0.03, w, 0.42, 0.05);
  // draught pole with the yoke
  b.slot(WOOD).col(P.palmWood, 1.0).tube([0, bedY - 0.1, -L / 2], [0, 0.07, -L / 2 - 2.3], 0.055, 0.045, N(lod, 5, 4, 3), [false, true]);
  b.col(P.palmWood, 0.85).tube([-0.6, 0.1, -L / 2 - 2.2], [0.6, 0.1, -L / 2 - 2.2], 0.04, 0.04, N(lod, 5, 4, 3), [true, true]);
  b.col(P.palmWood, 0.8).tube([0.25, 0, L / 2 - 0.1], [0.25, bedY - 0.08, L / 2 - 0.15], 0.035, 0.035, 4, [false, false]);   // a prop under the tail
  // load
  if (v === 0) { for (let i = 0; i < 4; i++) sack(b, (i % 2 ? 0.24 : -0.24), -0.4 + 0.5 * Math.floor(i / 2), 0.3, lod, i % 2 ? P.woolOatmeal : P.woolDark, { y: bedY, k: i % 2 ? 0.85 : 1.0, ry: 40 * q(i) }); }
  else if (v === 1) { b.push(0, bedY + 0.02, 0, 90); roll(b, REED, P.reed, 0, -0.2, 1.9, 0.16, lod, { role: 1, bands: [-0.6, 0.6] }); roll(b, REED, P.reedOld, 0, 0.15, 2.1, 0.16, lod, { role: 1, bands: [-0.6, 0.6] }); roll(b, REED, P.reed, 0, 0, 1.8, 0.15, lod, { y: 0.27, role: 1, k: 0.9, bands: [-0.6, 0.6] }); b.pop(); }
  else { for (let i = 0; i < 6; i++) vessel(b, 'ovoid', -0.3 + 0.3 * (i % 3), -0.3 + 0.55 * Math.floor(i / 3), 0.55, lod, [P.clayBuff, P.clayPale, P.clayRed][i % 3], { y: bedY, lid: i % 2 ? P.clayRed : null }); }
}
/** Donkey panniers set down: two deep baskets joined over a pack pad, loaded. */
function panniers(b, q, lod, P, v) {
  if (lod === 2) { b.slot(REED).col(P.reedOld).box(0, 0, 0, 1.2, 0.5, 0.55, { top: 0.9 }); return; }
  const cont = v === 0 ? P.clayBuff : v === 1 ? P.dates : P.greens;
  for (const s of [-1, 1]) {
    basket(b, s * 0.4, 0, 0.27, 0.52, lod, s > 0 ? P.reedOld : P.reedDark, v === 0 ? null : cont, P, 3 + s);
    if (v === 0) { b.slot(CLAY); for (let i = 0; i < N(lod, 3, 2, 1); i++) b.col(P.clayBuff, 0.85 + 0.2 * q(i + s)).box(s * 0.4 + 0.04 * (i - 1), 0.4 + 0.02 * i, 0.03 * (i - 1), 0.3, 0.085, 0.3, { ry: 20 * i + 10 }); }
  }
  b.slot(CLOTH).col(P.woolBrown, 0.8).blob(0, 0.22, 0, 0.32, 0.12, 0.3, N(lod, 7, 5, 4), N(lod, 3, 2, 2));
  b.slot(REED).col(P.rope).rope([[-0.4, 0.5, 0.2], [0, 0.46, 0.22], [0.4, 0.5, 0.2]], 0.015, 3).rope([[-0.4, 0.5, -0.2], [0, 0.46, -0.22], [0.4, 0.5, -0.2]], 0.015, 3);
  if (v === 2) vessel(b, 'pointed', 0.85, 0.15, 0.7, lod, P.clayPale, { tilt: 78, ry: 30 });
}
/** A refuse heap: ash, straw and potsherds (R5 2.2: street levels rose with dumped household rubbish). */
function refuse(b, q, lod, P, v) {
  const rx = rr(q, 1, 0.9, 1.5), rz = rr(q, 2, 0.7, 1.1), h = rr(q, 3, 0.4, 0.7);
  // earth and sweepings, then a tip of ash and one of straw and chaff on its flanks
  b.slot(CLOTH).col(P.dirt, 1).heap(0, 0, 0, rx, rz, h, N(lod, 13, 8, 5), N(lod, 4, 2, 1), { seed: 5 + v, amp: 0.2, skirt: 0.1, shade: (i, j) => 0.8 + 0.3 * q(i * 7 + j * 3) });
  if (lod === 2) return;
  b.col(v === 1 ? P.ash : P.dirt, v === 1 ? 0.75 : 1.2).heap(rx * 0.35, h * 0.25, -rz * 0.2, rx * 0.5, rz * 0.5, h * 0.6, N(lod, 9, 6, 4), N(lod, 2, 1, 1), { seed: 9, amp: 0.22, skirt: 0.08 });
  b.col(P.straw, 0.72).heap(-rx * 0.45, h * 0.12, rz * 0.3, rx * 0.42, rz * 0.36, h * 0.45, N(lod, 8, 6, 4), 1, { seed: 11, amp: 0.25, skirt: 0.05 });
  b.col(P.ash, 0.8).heap(rx * 0.1, 0, rz * 0.75, rx * 0.3, rz * 0.25, h * 0.2, N(lod, 7, 5, 4), 1, { seed: 13, amp: 0.25, skirt: 0.03 });
  // sherds, bones, a broken jar
  b.slot(CLAY);
  for (let i = 0; i < N(lod, 16, 6, 0); i++) {
    const a = q(20 + i) * 6.283, d = Math.sqrt(q(40 + i)) * 0.95, x = rx * d * Math.cos(a), z = rz * d * Math.sin(a), y = h * Math.max(0.05, 1 - d * d) * 0.85 + 0.04, s = 0.07 + 0.09 * q(60 + i);
    b.col(i % 5 === 4 ? P.garlic : [P.clayBuff, P.clayRed, P.clayPale, P.clayDark][i % 4], 0.85 + 0.3 * q(80 + i)).push(x, y, z, 360 * q(100 + i), 50 * (q(120 + i) - 0.5), 40 * (q(140 + i) - 0.5));
    b.tri3([-s, 0, -s * 0.6], [s, 0, -s * 0.3], [0, 0.03, s], 0, 1, 0); b.tri3([-s, 0, -s * 0.6], [0, 0.03, s], [-s * 0.4, -0.02, s * 0.5], 0, 1, 0); b.pop();
  }
  vessel(b, 'ovoid', rx * 0.55, rz * 0.45, 0.4, lod, P.clayBuff, { tilt: 72, ry: 200 + 60 * v, mouth: 0.1, y: h * 0.1 });
  if (v === 2) brush(b, -rx * 0.2, -rz * 0.7, 0.9, 0.12, lod, P, 5);
}
/** A public well head of pottery rings with a trough beside it (R5 2.2: a public ring-well beside the Processional Way). */
function well(b, q, lod, P, v) {
  const R = 0.52, n = N(lod, 14, 9, 6);
  b.slot(CLAY).col(P.clayBuff, 0.9).lathe(lod === 2 ? [[R + 0.3, -0.1], [R + 0.12, 0.5], [R, 0.5]] : [[R + 0.4, -0.1], [R + 0.36, 0.12], [R + 0.14, 0.16], [R + 0.12, 0.5], [R + 0.16, 0.56], [R, 0.56], [R, 0.1]], n, { capTop: 0.12 });
  if (lod === 2) return;
  b.col(P.mud, 0.9).box(1.7, -0.05, 0.1, 1.3, 0.4, 0.5, { top: 0.93 });
  b.slot(CLOTH).col(P.water).quad([1.15, 0.33, -0.08], [2.25, 0.33, -0.08], [2.25, 0.33, 0.28], [1.15, 0.33, 0.28], 0, 1, 0);
  for (const s of [-1, 1]) pole(b, [s * (R + 0.25), -0.05, 0], [s * (R + 0.2), 1.75, 0], 0.05, lod, P.palmWood);
  pole(b, [-R - 0.35, 1.7, 0], [R + 0.35, 1.7, 0], 0.045, lod, P.palmWood, 1.1);
  b.slot(REED).col(P.rope).rope([[0, 1.7, 0], [0.02, 0.9, 0.02], [0.3, 0.62, 0.2]], 0.014, 3).torus(-R - 0.6, 0.04, 0.5, 0.17, 0.04, N(lod, 8, 6, 5), 3);
  vessel(b, 'pot', 0.34, 0.24, 0.26, lod, P.clayDark, { y: 0.56, ry: 30 });
  vessel(b, 'pithos', -R - 0.75, -0.4, 0.75, lod, P.clayPale);
}

// ------------------------------------------------------------------------------------------- markets ----
/** A light shade over a pitch: two taller poles in front, two at the back, a reed mat (or dark goat-hair cloth) tied on. */
function shade(b, q, lod, P, w, d, Hf, Hb, goat) {
  const top = (z) => Hb + (Hf - Hb) * (z / d + 0.5);
  if (lod === 2) {
    b.slot(WOOD).col(P.palmWood); for (const sx of [-1, 1]) b.tube([sx * w * 0.47, 0, sx * d * 0.47], [sx * w * 0.47, top(sx * d * 0.47), sx * d * 0.47], 0.05, 0.05, 3, [false, false]);
    b.slot(goat ? CLOTH : REED).col(goat ? P.goat : P.reed, goat ? 1.4 : 1, goat ? 0 : 1).quad([-w / 2, top(-d / 2), -d / 2], [w / 2, top(-d / 2), -d / 2], [w / 2, top(d / 2), d / 2], [-w / 2, top(d / 2), d / 2], 0, 1, 0);
    b.col(goat ? P.goat : P.reed, 0.5, goat ? 0 : 1).quad([-w / 2, top(-d / 2) - 0.03, -d / 2], [w / 2, top(-d / 2) - 0.03, -d / 2], [w / 2, top(d / 2) - 0.03, d / 2], [-w / 2, top(d / 2) - 0.03, d / 2], 0, -1, 0);
    return;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pole(b, [sx * w * 0.47 + 0.04 * (q(sx + 2 * sz + 9) - 0.5), -0.08, sz * d * 0.47], [sx * w * 0.47, top(sz * d * 0.47) + 0.1, sz * d * 0.47], 0.04, lod, P.palmWood, 0.85 + 0.3 * q(sx + 2 * sz + 5));
  for (const sz of [-1, 1]) pole(b, [-w / 2 - 0.12, top(sz * d * 0.47) - 0.02, sz * d * 0.47], [w / 2 + 0.12, top(sz * d * 0.47) - 0.02, sz * d * 0.47], 0.032, lod, P.palmWood);
  b.slot(goat ? CLOTH : REED).col(goat ? P.goat : P.reed, goat ? 1.4 : 1, goat ? 0 : 1);
  b.sheet(N(lod, 4, 2, 1), N(lod, 3, 2, 1), (u, t) => { const z = -d / 2 - 0.1 + (d + 0.2) * t; return [-w / 2 - 0.05 + (w + 0.1) * u, top(z) + 0.04 - (goat ? 0.12 : 0.05) * Math.sin(Math.PI * t) * (0.5 + 0.5 * Math.sin(Math.PI * u)), z]; }, 0.03, { up: true, shade: (u, t) => 0.86 + 0.14 * ((Math.floor(u * 6) + Math.floor(t * 4)) % 2) });
}
/** Goods of a pitch, laid out on mats: kind 0..9 (see the list in stall). Occupies about w x d centred on the origin. */
function goods(b, q, lod, P, kind, w, d) {
  const cont = [P.dates, P.onion, P.grain, P.greens, P.pomegranate, P.garlic, P.datesAmber, P.sesame];
  if (lod === 2) b.slot(REED).col(P.reed, 0.9, 1).top(0, 0, w, d, 0.04); else matFlat(b, 0, 0, w, d, lod, P, { k: 0.9 });
  if (lod === 2) {
    const c = [P.dates, P.greens, P.clayBuff, P.white, P.fish, P.reed, P.clayPale, P.mud, P.woolCream, P.woolBrown][kind];
    b.slot(CLOTH).col(c, 1, kind === 3 ? 2 : 0).box(0, 0.03, 0, w * 0.75, 0.28, d * 0.6, { top: 0.8 });
    return;
  }
  if (kind === 0) {         // produce in baskets, an open sack
    for (let i = 0; i < 6; i++) basket(b, -w * 0.36 + (w * 0.72 * (i % 3)) / 2, (i < 3 ? -1 : 1) * d * 0.2, 0.22 + 0.04 * q(i), 0.2 + 0.08 * q(10 + i), lod, i % 2 ? P.reedOld : P.reed, cont[(i + Math.floor(q(3) * 5)) % cont.length], P, i + 1);
  } else if (kind === 1) {  // heaps on the mat: cucumbers and gourds, onions, strings of garlic
    b.slot(CLOTH).col(P.greens).heap(-w * 0.25, 0.02, -d * 0.1, w * 0.2, d * 0.25, 0.2, N(lod, 8, 6, 5), N(lod, 2, 1, 1), { seed: 2, amp: 0.3, skirt: 0.01 });
    b.col(P.onion).heap(w * 0.08, 0.02, d * 0.12, w * 0.17, d * 0.22, 0.16, N(lod, 8, 6, 5), N(lod, 2, 1, 1), { seed: 3, amp: 0.3, skirt: 0.01 });
    b.col(P.pomegranate).heap(w * 0.34, 0.02, -d * 0.15, w * 0.12, d * 0.16, 0.13, N(lod, 7, 5, 4), 1, { seed: 4, amp: 0.3, skirt: 0.01 });
    basket(b, -w * 0.05, -d * 0.3, 0.2, 0.18, lod, P.reedOld, P.dates, P, 5);
    basket(b, w * 0.3, d * 0.28, 0.2, 0.2, lod, P.reed, P.garlic, P, 6);
  } else if (kind === 2) {  // the potter: jars in rows, stacked bowls, big jars behind
    for (let i = 0; i < 3; i++) vessel(b, 'pithos', -w * 0.33 + w * 0.33 * i, -d * 0.3, 0.7 + 0.2 * q(i), lod, [P.clayBuff, P.clayPale, P.clayRed][i]);
    for (let i = 0; i < 5; i++) vessel(b, i % 2 ? 'ovoid' : 'pot', -w * 0.4 + w * 0.2 * i, d * 0.02 + 0.06 * (i % 2), 0.3 + 0.14 * q(10 + i), lod, [P.clayPale, P.clayBuff, P.clayGreen, P.clayRed][i % 4]);
    for (let s = 0; s < 3; s++) for (let i = 0; i < N(lod, 4, 3, 2); i++) vessel(b, s === 1 ? 'beaker' : 'bowl', -w * 0.3 + w * 0.3 * s, d * 0.32, s === 1 ? 0.16 : 0.08, lod, [P.clayPale, P.clayBuff, P.clayRed][(i + s) % 3], { y: 0.02 + (s === 1 ? 0.06 : 0.045) * i, mouth: 0.5 });
  } else if (kind === 3) {  // cloth: folded piles, dyed lengths
    b.slot(CLOTH);
    for (let s = 0; s < 4; s++) for (let i = 0; i < 2 + Math.floor(q(s) * N(lod, 4, 3, 2)); i++) b.col(P.white, 0.85 + 0.2 * q(s * 9 + i), (s + i) % 3 === 0 ? 2 : 1).box(-w * 0.36 + w * 0.24 * s, 0.025 + 0.06 * i, (s % 2 ? 0.12 : -0.12) * d, 0.42, 0.055, 0.34, { ry: 8 * (q(s * 5 + i) - 0.5), top: 0.97 });
    roll(b, CLOTH, P.white, w * 0.1, d * 0.34, w * 0.6, 0.07, lod, { y: 0.02, role: 2, bands: [-0.8, 0.8], bandRole: 1 });
    roll(b, CLOTH, P.white, -w * 0.2, d * 0.36, w * 0.4, 0.06, lod, { y: 0.02, role: 1, ry: 6 });
  } else if (kind === 4) {  // fish on a mat, a basket, fowl in a reed cage
    b.slot(CLOTH);
    for (let i = 0; i < N(lod, 9, 5, 2); i++) b.col(P.fish, 0.8 + 0.4 * q(i)).blob(-w * 0.32 + 0.14 * (i % 5), 0.025, -d * 0.1 + 0.2 * Math.floor(i / 5) + 0.04 * q(10 + i), 0.16, 0.025, 0.045, 5, 2, { ry: 20 * (q(20 + i) - 0.5) });
    basket(b, -w * 0.3, d * 0.28, 0.24, 0.2, lod, P.reedOld, P.fish, P, 3);
    b.push(w * 0.28, 0.02, 0);
    b.slot(REED).col(P.reedOld, 0.9); b.box(0, 0, 0, 0.7, 0.03, 0.5); b.box(0, 0.42, 0, 0.7, 0.03, 0.5);
    for (let i = 0; i < N(lod, 7, 4, 0); i++) for (const sz of [-1, 1]) b.box(-0.33 + (0.66 * i) / N(lod, 6, 3, 1), 0.03, sz * 0.24, 0.02, 0.39, 0.02);
    for (const sx of [-1, 1]) for (let i = 0; i < N(lod, 4, 3, 0); i++) b.box(sx * 0.34, 0.03, -0.22 + (0.44 * i) / N(lod, 3, 2, 1), 0.02, 0.39, 0.02);
    b.slot(CLOTH).col(P.woolCream, 0.9).blob(-0.12, 0.03, 0, 0.13, 0.1, 0.1, 6, 3).col(P.woolBrown).blob(0.14, 0.03, 0.05, 0.12, 0.09, 0.1, 6, 3);
    b.pop();
  } else if (kind === 5) {  // reed work: rolled mats standing, nested baskets, rope
    for (let i = 0; i < 4; i++) { b.push(-w * 0.34 + 0.24 * i, 0.02, -d * 0.28, 0, 4 * (q(i) - 0.5) * 3, 3); b.slot(REED).col(i % 2 ? P.reed : P.reedOld, 0.9, 1).tube([0, 0, 0], [0, 1.25 + 0.3 * q(10 + i), 0], 0.12, 0.12, N(lod, 8, 6, 4), [false, true]); b.pop(); }
    for (let i = 0; i < 3; i++) basket(b, w * 0.22, d * 0.1, 0.28 - 0.015 * i, 0.14, lod, i % 2 ? P.reedOld : P.reed, null, P, 1, 0.02 + 0.07 * i);
    basket(b, -w * 0.15, d * 0.2, 0.2, 0.26, lod, P.reedDark, null, P);
    b.slot(REED).col(P.rope).torus(w * 0.36, 0.06, -d * 0.2, 0.17, 0.04, N(lod, 9, 6, 5), 3).torus(w * 0.36, 0.13, -d * 0.2, 0.15, 0.04, N(lod, 9, 6, 5), 3);
  } else if (kind === 6) {  // water and beer: big jars in stands, a skin, cups
    for (const s of [-1, 1]) { b.slot(CLAY).col(P.mud).torus(s * w * 0.25, 0.08, -d * 0.2, 0.18, 0.07, N(lod, 8, 6, 5), 3); vessel(b, 'pointed', s * w * 0.25, -d * 0.2, 0.95, lod, s > 0 ? P.clayPale : P.clayBuff, { y: 0.04 }); }
    b.slot(CLOTH).col(P.goat, 1.7).blob(0, 0.02, -d * 0.05, 0.24, 0.13, 0.36, N(lod, 7, 5, 4), N(lod, 4, 3, 2), { ry: 70 });
    for (let i = 0; i < 4; i++) vessel(b, 'beaker', -w * 0.25 + 0.16 * i, d * 0.28, 0.15, lod, [P.clayPale, P.clayBuff][i % 2]);
    vessel(b, 'bowl', w * 0.3, d * 0.2, 0.1, lod, P.clayRed, { mouth: 0.4 });
  } else if (kind === 7) {  // bread: a small oven, the tray, a pot
    b.slot(CLAY).col(P.mud, 0.9); b.push(-w * 0.25, 0, -d * 0.15); b.lathe([[0.36, -0.05], [0.33, 0.35], [0.24, 0.62], [0.2, 0.62]], N(lod, 10, 7, 5), { capTop: 0.1, shade: (j) => [1, 0.9, 0.5, 0.25][j] }); b.pop();
    basket(b, w * 0.2, d * 0.1, 0.3, 0.05, lod, P.reedOld, null, P);
    b.slot(CLOTH).col(P.bread); for (let i = 0; i < N(lod, 5, 3, 1); i++) b.disc(w * 0.2 + 0.03 * i, 0.06 + 0.012 * i, d * 0.1 + 0.02 * i, 0.17, 0.17, N(lod, 8, 6, 5));
    vessel(b, 'pot', w * 0.1, -d * 0.3, 0.28, lod, P.clayDark, { soot: 1 });
    brush(b, -w * 0.25, d * 0.32, 0.7, 0.13, lod, P, 3);
  } else if (kind === 8) {  // wool and oil: fleeces, covered oil jars
    b.slot(CLOTH); for (let i = 0; i < 5; i++) b.col(i % 2 ? P.woolOatmeal : P.woolCream, 0.9 + 0.15 * q(i)).blob(-w * 0.3 + 0.28 * (i % 3), 0.02 + (i > 2 ? 0.13 : 0), -d * 0.12 + 0.1 * (i % 2), 0.26, 0.09, 0.2, N(lod, 7, 5, 4), N(lod, 3, 2, 2), { ry: 30 * q(10 + i) });
    for (let i = 0; i < 3; i++) vessel(b, 'ovoid', w * 0.12 + 0.24 * i - 0.1, d * 0.25, 0.45, lod, [P.clayBuff, P.clayPale, P.clayRed][i], { lid: P.woolOatmeal });
  } else {                  // grain: sacks, an open sack, the measure
    for (let i = 0; i < 4; i++) sack(b, -w * 0.32 + 0.36 * (i % 3), (i > 2 ? 0.25 : -0.2) * d, 0.32, lod, i % 2 ? P.woolOatmeal : P.woolDark, { k: i % 2 ? 0.85 : 1.0, ry: 50 * q(i), open: i === 1 ? P.grain : null });
    b.slot(CLOTH).col(P.grain).heap(w * 0.26, 0.02, d * 0.15, 0.3, 0.26, 0.16, N(lod, 8, 6, 5), N(lod, 2, 1, 1), { seed: 4, skirt: 0.01 });
    b.slot(WOOD).col(P.palmWood).lathe([[0.13, 0], [0.14, 0.24], [0.12, 0.24]], N(lod, 8, 6, 5), { capTop: 0.4 });
  }
}
/** A market pitch under a shade (variants 0..9 by goods). The seller sits at the back (-z); the front (+z) faces the buyers. */
function stall(b, q, lod, P, v) {
  const w = rr(q, 1, 2.3, 2.9), d = rr(q, 2, 1.8, 2.3), kind = v % 10, goat = v % 4 === 3;
  shade(b, q, lod, P, w, d, rr(q, 3, 1.85, 2.05), rr(q, 4, 2.1, 2.35), goat);
  goods(b, q, lod, P, kind, w * 0.86, d * 0.8);
  if (lod < 2 && kind === 1) { b.slot(CLOTH); for (let i = 0; i < N(lod, 4, 2, 0); i++) { const x = -w * 0.3 + 0.2 * i; b.col(P.garlic, 0.95).blob(x, 1.35, d * 0.47, 0.05, 0.22, 0.05, 5, 3); } }
  if (lod < 2 && kind === 3) { b.slot(CLOTH); for (let i = 0; i < 2; i++) b.col(P.white, 1, i ? 1 : 2).sheet(1, N(lod, 3, 2, 1), (u, t) => [-w * 0.35 + i * w * 0.4 + 0.5 * u, 1.9 - 1.2 * t, -d * 0.47 + 0.05 + 0.04 * Math.sin(t * 5 + i)], 0.012, {}); }
  if (lod < 2) b.slot(WOOD).col(P.palmWood, 0.9).box(-w * 0.2, 0, -d * 0.52, 0.42, 0.24, 0.3);       // the seller's stool
}
/** A seller's pitch without a shade: a mat with goods (temple fronts, the strip beside the Processional Way). */
function vendor(b, q, lod, P, v) {
  const kinds = [0, 2, 3, 4, 1, 5, 6, 9];
  goods(b, q, lod, P, kinds[v % kinds.length], rr(q, 1, 1.7, 2.2), rr(q, 2, 1.2, 1.5));
}

// ---------------------------------------------------------------------------------------------- quays ----
/** Wool bales roped up and stacked: stuffed sacks of coarse cloth, bulging between their ropes. */
function bales(b, q, lod, P, v) {
  const bw = 0.95, bd = 0.6, bh = 0.5, nx = 2 + (v % 2), layers = 2 + (v % 3 === 2 ? 1 : 0);
  if (lod === 2) { b.slot(CLOTH).col(P.woolOatmeal, 0.95).box(0, -0.05, 0, nx * bw, layers * bh, bd * 2, { top: 0.8 }); return; }
  for (let k = 0; k < layers; k++) for (let i = 0; i < Math.max(1, nx - k); i++) for (let j = 0; j < (k === layers - 1 && layers > 1 ? 1 : 2); j++) {
    const x = (i - (Math.max(1, nx - k) - 1) / 2) * (bw + 0.02) + 0.05 * (q(k * 9 + i * 3 + j) - 0.5), z = (j - (k === layers - 1 && layers > 1 ? 0 : 0.5)) * (bd + 0.02), y = k * bh * 0.86 - (k === 0 ? 0.05 : 0), ry = 7 * (q(k * 7 + i + j * 2) - 0.5);
    b.slot(CLOTH).col(k % 2 ? P.woolCream : P.woolOatmeal, 0.8 + 0.24 * q(k * 5 + i * 2 + j)).push(x, y, z, ry);
    b.blob(0, 0, 0, bw * 0.56, bh * 0.56, bd * 0.56, N(lod, 9, 6, 4), N(lod, 5, 3, 2), { shade: (jj) => 0.82 + 0.18 * Math.sin((jj / N(lod, 5, 3, 2)) * Math.PI) });
    if (lod === 0) { b.slot(REED).col(P.rope, 0.9); for (const o of [-0.22, 0.22]) { b.push(o, bh * 0.56, 0, 0, 0, 90); b.torus(0, 0, 0, bh * 0.52, 0.018, 8, 3); b.pop(); } }
    b.pop();
  }
  if (v === 1) sack(b, nx * bw / 2 + 0.4, 0.1, 0.32, lod, P.woolDark, { k: 1.0 });
}

/** Transport jars set out in rows on straw, some lying, some sealed. */
function jarRow(b, q, lod, P, v) {
  const n = 8 + 3 * (v % 3);
  if (lod === 2) { b.slot(CLAY).col(P.clayBuff).box(0, 0, 0, 2.2, 0.55, 0.9, { top: 0.8 }); return; }
  b.slot(CLOTH).col(P.straw, 0.9).heap(0, 0, 0, 1.3, 0.6, 0.08, N(lod, 9, 6, 5), 1, { seed: 3, flat: 0.7, amp: 0.25, skirt: 0.03 });
  for (let i = 0; i < n; i++) {
    const row = i % 2, col = Math.floor(i / 2), x = -1.0 + col * (2.0 / Math.max(1, Math.ceil(n / 2) - 1)) + 0.04 * (q(i) - 0.5), z = (row ? 0.22 : -0.22) + 0.05 * (q(10 + i) - 0.5), fallen = q(20 + i) < 0.12;
    vessel(b, 'ovoid', x, z, 0.58 + 0.12 * q(30 + i), lod, [P.clayBuff, P.clayPale, P.clayBuff, P.clayRed][Math.floor(q(40 + i) * 4)], { tilt: fallen ? 80 : 6 * (q(50 + i) - 0.5), ry: 360 * q(60 + i), lid: q(70 + i) < 0.5 ? P.mud : null, y: 0.03 });
  }
}
/** Timber: palm and poplar trunks stacked, squared cedar beams on sleepers, a sheaf of poles. Lies along x. */
function timber(b, q, lod, P, v) {
  const L = rr(q, 1, 4.6, 6.2);
  if (lod === 2) { b.slot(WOOD).col(v === 1 ? P.cedar : P.palmTrunk).box(0, -0.05, 0, L, v === 1 ? 0.7 : 0.85, 1.3, { top: 0.6 }); return; }
  b.slot(WOOD);
  if (v === 1) {            // cedar beams, two layers crossed on sleepers
    for (const x of [-L * 0.3, L * 0.3]) b.col(P.palmWood, 0.8).box(x, -0.04, 0, 0.18, 0.16, 1.5);
    for (let k = 0; k < 2; k++) for (let i = 0; i < 4 - k; i++) b.col(P.cedar, 0.85 + 0.3 * q(k * 5 + i)).box(0.15 * (q(k * 3 + i) - 0.5), 0.12 + k * 0.27, (i - (3 - k) / 2) * 0.32, L - 0.6 * q(10 + k * 4 + i), 0.25, 0.27);
    if (lod === 0) { b.col(P.woodCut); for (let i = 0; i < 4; i++) b.box(L / 2 - 0.3 * q(10 + i) + 0.002, 0.14, (i - 1.5) * 0.32, 0.01, 0.21, 0.23); }
    return;
  }
  const rows = v === 2 ? [6, 5, 4] : [4, 3, 2], r = v === 2 ? 0.075 : 0.17, n = N(lod, 7, 5, 4);
  let y = r * 0.9;
  for (let k = 0; k < rows.length; k++) {
    for (let i = 0; i < rows[k]; i++) {
      const z = (i - (rows[k] - 1) / 2) * r * 2.05, rr0 = r * (0.9 + 0.2 * q(k * 7 + i)), off = 0.4 * (q(k * 11 + i) - 0.5), len = L * (0.85 + 0.15 * q(k * 13 + i));
      b.col(v === 2 ? P.woodCut : k % 2 ? P.palmTrunk : P.poplar, 0.8 + 0.3 * q(k * 3 + i)).tube([-len / 2 + off, y, z], [len / 2 + off, y + 0.02, z + 0.03 * (q(i) - 0.5)], rr0, rr0 * 0.82, n, [false, false]);
      if (lod === 0) { b.col(P.woodCut, 1.0); b.tube([-len / 2 + off - 0.004, y, z], [-len / 2 + off, y, z], rr0, rr0, n, [true, false]); b.tube([len / 2 + off, y + 0.02, z], [len / 2 + off + 0.004, y + 0.02, z], rr0 * 0.82, rr0 * 0.82, n, [false, true]); }
      else { b.col(P.woodCut, 0.9); b.tube([-len / 2 + off - 0.004, y, z], [-len / 2 + off, y, z], rr0, rr0, n, [true, false]); }
    }
    y += r * 1.75;
  }
  b.col(P.palmWood, 0.8); for (const x of [-L * 0.33, L * 0.33]) for (const s of [-1, 1]) b.box(x, -0.05, s * (rows[0] * r * 1.03 + 0.06), 0.14, 0.3, 0.12, { top: 0.6 });
}
/** Reeds in sheaves: stacked lying, or standing in stooks. */
function reedStack(b, q, lod, P, v) {
  if (lod === 2) { b.slot(REED).col(P.reed, 0.9, 1); if (v === 1) b.lathe([[1.0, -0.05], [0.25, 2.3]], 5, { capTop: 0.8 }); else b.box(0, -0.05, 0, 2.8, 1.0, 1.7, { top: 0.6 }); return; }
  if (v === 1) {            // a stook: sheaves leaning together
    const n = N(lod, 9, 6, 5);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, R = 0.85 + 0.15 * q(i); b.slot(REED).col(i % 2 ? P.reed : P.reedOld, 0.85 + 0.25 * q(10 + i), 1).tube([R * Math.cos(a), -0.06, R * Math.sin(a)], [0.12 * Math.cos(a), 2.25 + 0.3 * q(20 + i), 0.12 * Math.sin(a)], 0.17, 0.07, N(lod, 6, 4, 3), [false, true]); }
    b.slot(REED).col(P.rope).torus(0, 1.6, 0, 0.36, 0.03, N(lod, 9, 6, 5), 3);
    return;
  }
  const rows = [4, 3, 2], r = 0.2; let y = r * 0.9;
  for (let k = 0; k < rows.length; k++) {
    for (let i = 0; i < rows[k]; i++) {
      const z = (i - (rows[k] - 1) / 2) * r * 2.05, len = 2.5 + 0.5 * q(k * 5 + i), flip = (k + i) % 2 ? 1 : -1;
      b.slot(REED).col(i % 2 ? P.reed : P.reedOld, 0.82 + 0.28 * q(k * 3 + i), 1).tube([-flip * len / 2, y, z], [flip * len / 2, y, z + 0.05 * (q(i) - 0.5)], r, r * 0.55, N(lod, 6, 4, 3), [true, true]);
      if (lod === 0) { b.col(P.rope); for (const t of [-0.25, 0.2]) b.tube([flip * (t * len - 0.02), y, z], [flip * (t * len + 0.02), y, z], r * (0.8 - 0.25 * (t + 0.25)) * 1.05, r * (0.8 - 0.25 * (t + 0.25)) * 1.05, 6, [false, false]); }
    }
    y += r * 1.72;
  }
}
/** Coils of palm-fibre rope by a mooring post, a stone anchor. */
function ropes(b, q, lod, P, v) {
  if (lod === 2) { b.slot(REED).col(P.rope).box(0, 0, 0, 0.6, 0.2, 0.6); b.slot(WOOD).col(P.palmTrunk).box(0.7, -0.1, 0, 0.22, 0.95, 0.22); return; }
  const n = N(lod, 10, 7, 5);
  b.slot(REED).col(P.rope);
  for (let i = 0; i < N(lod, 4, 3, 2); i++) b.torus(0, 0.045 + 0.075 * i, 0, 0.3 - 0.03 * i, 0.045, n, N(lod, 4, 3, 3));
  b.col(P.rope, 0.8).torus(-0.75, 0.04, 0.3, 0.22, 0.04, n, 3).torus(-0.75, 0.11, 0.3, 0.2, 0.04, n, 3);
  b.slot(WOOD).col(P.palmTrunk).tube([0.75, -0.1, 0], [0.76, 0.9, 0], 0.12, 0.1, N(lod, 7, 5, 4), [false, true]);
  b.slot(REED).col(P.rope); for (let i = 0; i < 3; i++) b.torus(0.755, 0.45 + 0.06 * i, 0, 0.125, 0.025, N(lod, 7, 5, 4), 3);
  b.rope([[0.3, 0.05, 0], [0.55, 0.03, 0.1], [0.7, 0.45, 0.1]], 0.02, 3);
  if (v === 1) { b.slot(CLAY).col(P.limestone, 0.75).blob(0.2, 0, 0.75, 0.25, 0.14, 0.2, N(lod, 7, 5, 4), 3); }
}
/** Bitumen from Hit: lumps, pots, a melting cauldron over a hearth, spills (caulking boats and lining baskets). */
function bitumen(b, q, lod, P, v) {
  if (lod === 2) { b.slot(CLAY).col(P.bitumen).box(0, 0, 0, 1.2, 0.3, 0.9, { top: 0.6 }); return; }
  b.slot(CLAY).col(P.bitumen, 1.2).disc(0.2, 0.015, 0.1, 1.2, 0.9, N(lod, 10, 7, 5));
  b.col(P.bitumen).heap(-0.7, 0, -0.2, 0.55, 0.45, 0.32, N(lod, 8, 6, 5), N(lod, 2, 1, 1), { seed: 3, amp: 0.4, shade: (i, j) => 0.7 + 1.2 * q(i * 5 + j) });
  for (let i = 0; i < 3; i++) vessel(b, i ? 'pot' : 'ovoid', -0.1 + 0.36 * i, -0.55 + 0.1 * (i % 2), i ? 0.26 : 0.45, lod, P.bitumen, { mouth: 0.6 });
  // the cauldron on three stones, ash under it
  b.slot(CLOTH).col(P.ash, 0.7).heap(0.5, 0, 0.35, 0.34, 0.34, 0.06, N(lod, 7, 5, 4), 1, { seed: 5, skirt: 0.01 });
  b.slot(CLAY).col(P.limestone, 0.4); for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; b.box(0.5 + 0.2 * Math.cos(a), 0, 0.35 + 0.2 * Math.sin(a), 0.13, 0.16, 0.13, { top: 0.7 }); }
  vessel(b, 'pot', 0.5, 0.35, 0.4, lod, P.soot, { y: 0.16, mouth: 0.5, role: 0 });
  if (lod === 0) pole(b, [0.5, 0.4, 0.35], [0.95, 0.75, 0.6], 0.015, lod, P.soot, 2);
  if (v === 1) { for (let i = 0; i < 3; i++) basket(b, 1.15, -0.4 + 0.42 * i, 0.2, 0.22, lod, P.bitumen, null, P); }
}
/** Fishing nets on a drying rack, floats, fish traps, a basket. */
function netRack(b, q, lod, P, v) {
  const L = rr(q, 1, 3.2, 4.2), H = rr(q, 2, 1.9, 2.2);
  if (lod === 2) { b.slot(WOOD).col(P.palmWood); for (const s of [-1, 1]) b.tube([s * L / 2, 0, 0], [s * L / 2, H, 0], 0.05, 0.05, 3, [false, false]); b.slot(CLOTH).col(P.net); for (let i = 0; i < 3; i++) b.tri3([(-0.44 + 0.3 * i) * L, H, 0], [(-0.16 + 0.3 * i) * L, H, 0], [(-0.3 + 0.3 * i) * L, 0.5 + 0.3 * (i % 2), 0.12], 0, 0.2, 1).tri3([(-0.44 + 0.3 * i) * L, H, 0], [(-0.16 + 0.3 * i) * L, H, 0], [(-0.3 + 0.3 * i) * L, 0.5 + 0.3 * (i % 2), 0.12], 0, -0.2, -1); return; }
  if (v !== 1) {
    for (const s of [-1, 0, 1]) { if (s === 0 && L < 3.7) continue; pole(b, [s * L / 2, -0.1, 0.03 * s], [s * L / 2 + 0.03 * s, H + 0.12, 0], 0.045, lod, P.palmWood, 0.85 + 0.2 * q(s + 3)); }
    pole(b, [-L / 2 - 0.15, H, 0], [L / 2 + 0.15, H - 0.03, 0], 0.035, lod, P.palmWood, 1.05);
    // the net hangs in bights over the rail, both sides
    b.slot(CLOTH);
    const nb = N(lod, 6, 4, 3);
    for (let i = 0; i < nb; i++) {
      const xc = (-0.5 + (i + 0.5) / nb) * L * 0.88, wT = (L * 0.88) / nb * 0.92, drop = (H - 0.3) * (0.62 + 0.38 * q(40 + i)), side = i % 2 ? 1 : -1;
      b.col(P.net, 0.85 + 0.4 * q(50 + i)).sheet(N(lod, 2, 1, 1), N(lod, 3, 2, 1), (u, t) => { const wd = wT * (1 - 0.72 * t * t); return [xc + (u - 0.5) * wd + 0.05 * Math.sin(t * 5 + i), H + 0.03 - drop * t, side * (0.03 + 0.2 * t) + 0.04 * Math.sin(u * 6 + i)]; }, 0.02, { shade: (u, t) => 0.75 + 0.5 * (Math.floor(t * 9) % 2) });
    }
    if (lod === 0) { b.slot(WOOD).col(P.woodCut, 0.9); for (let i = 0; i < 7; i++) b.blob((-0.45 + 0.15 * i) * L, 0.3 + 0.1 * (i % 2), 0.38, 0.05, 0.035, 0.05, 5, 2); }
  } else {                  // a net spread on the ground to mend
    b.slot(CLOTH).col(P.net).sheet(N(lod, 5, 3, 1), N(lod, 4, 2, 1), (u, t) => [(-0.5 + u) * L * 0.9, 0.03 + 0.03 * Math.sin(u * 11) * Math.sin(t * 7), (-0.5 + t) * 2.2 * (0.8 + 0.2 * Math.sin(u * 5))], 0.012, { up: true, one: true, shade: (u, t) => 0.7 + 0.6 * ((Math.floor(u * 14) + Math.floor(t * 9)) % 2) });
  }
  // fish traps of reeds, a basket of fish
  for (let i = 0; i < 2; i++) { b.push(L * 0.3 - 0.7 * i, 0.16, 0.9 + 0.2 * i, 30 + 60 * i, 0, 90); b.slot(REED).col(P.reedOld, 0.9).lathe([[0.16, 0], [0.15, 0.4], [0.03, 0.8]], N(lod, 7, 5, 4), { shade: (j) => 0.8 + 0.2 * (j % 2) }); b.pop(); }
  basket(b, -L * 0.3, 0.8, 0.25, 0.2, lod, P.reedOld, P.fish, P, 3);
  if (v === 2) for (let i = 0; i < 2; i++) { pole(b, [-L / 2 - 0.3 - 0.15 * i, 0, 0.5], [-L / 2 - 0.05, H - 0.1 + 0.2 * i, 0.03], 0.025, lod, P.woodCut, 0.8); }
}
/** A quffa (round basket boat coated with bitumen) hauled out: upturned for re-coating, upright, or on its side. */
function quffa(b, q, lod, P, v) {
  const D = rr(q, 1, 1.9, 2.6), R = D / 2, H = R * 0.78, n = N(lod, 14, 9, 6);
  const hull = () => {
    const out = [[R * 0.5, 0], [R * 0.86, H * 0.14], [R * 1.0, H * 0.45], [R * 0.99, H * 0.72], [R * 0.9, H * 0.95], [R * 0.92, H]];
    b.slot(CLAY).col(P.bitumen, 1.5).lathe(lod === 0 ? out : [out[0], out[2], out[5]], n, { capBottom: true, shade: (j) => 0.8 + 0.5 * ((j * 3) % 2) + (j >= (lod === 0 ? 4 : 2) ? 0.6 : 0) });
    b.slot(REED).col(P.reedOld, 0.75).lathe(lod === 0 ? [[R * 0.92, H], [R * 0.84, H * 0.98], [R * 0.9, H * 0.6], [R * 0.82, H * 0.2], [R * 0.4, H * 0.1], [0, H * 0.09]] : [[R * 0.92, H], [R * 0.84, H * 0.6], [0, H * 0.1]], n, { shade: (j) => 0.75 + 0.25 * (j % 2) });
    if (lod === 0) b.slot(REED).col(P.rope, 0.8).torus(0, H, 0, R * 0.9, 0.05, n, 4);
  };
  if (lod === 2) { b.slot(CLAY).col(P.bitumen, 1.5); if (v === 0) b.lathe([[R, -0.05], [R * 0.9, H * 0.6], [R * 0.4, H]], 6, { capTop: 1 }); else b.lathe([[R * 0.5, -0.05], [R, H * 0.5], [R * 0.92, H]], 6, { capTop: 0.5 }); return; }
  if (v === 0) {            // upturned on blocks, a fresh patch, pot and brush
    b.push(0, H + 0.12, 0, 0, 180 - 6, 0); hull(); b.pop();
    b.slot(CLAY).col(P.limestone, 0.6).box(R * 0.8, -0.05, 0, 0.3, 0.3, 0.3); b.box(-R * 0.75, -0.05, 0.2, 0.3, 0.2, 0.3);
    vessel(b, 'pot', R + 0.5, 0.3, 0.3, lod, P.soot, { mouth: 0.4 });
    brush(b, R + 0.6, -0.5, 0.9, 0.12, lod, P, 4);
  } else if (v === 1) {     // upright on the bank, paddles and a coil inside
    hull();
    for (let i = 0; i < 2; i++) { pole(b, [-R * 0.5 + 0.2 * i, H * 0.15, -R * 0.4], [R * 0.9 + 0.2 * i, H + 0.35, R * 0.5], 0.025, lod, P.woodCut, 0.8); }
    b.slot(WOOD).col(P.woodCut, 0.75).box(R * 0.95, H + 0.3, R * 0.52, 0.2, 0.03, 0.4, { ry: -40 });
    b.slot(REED).col(P.rope).torus(-R * 0.2, H * 0.15, R * 0.1, 0.2, 0.04, N(lod, 8, 6, 5), 3);
  } else {                  // on its side against a post, the inside to the sun
    pole(b, [0, -0.1, -0.46 - 0.339 * H], [0, 1.5, -0.46 - 0.339 * H], 0.07, lod, P.palmTrunk);
    b.push(0, R * 0.98, -0.3 + H * 0.15, 0, 78, 0); b.push(0, -H * 0.5, 0); hull(); b.pop(); b.pop();
    basket(b, R + 0.3, 0.4, 0.22, 0.22, lod, P.bitumen, null, P);
  }
}
/** Stone for the royal works: limestone and breccia paving slabs stacked on sleepers (R5 2.3: limestone, breccia by boat). */
function stone(b, q, lod, P, v) {
  const s = v === 1 ? 0.66 : 1.05, c = v === 1 ? P.breccia : P.limestone, stacks = v === 1 ? 3 : 2;
  b.slot(CLAY);
  if (lod === 2) { b.col(c, 0.95).box(0, -0.05, 0, stacks * (s + 0.15), 0.8, s); return; }
  for (let k = 0; k < stacks; k++) {
    const x = (k - (stacks - 1) / 2) * (s + 0.18), m = 3 + Math.floor(q(k) * 3);
    b.slot(WOOD).col(P.palmWood, 0.8); for (const z of [-s * 0.3, s * 0.3]) b.box(x, -0.04, z, s * 0.95, 0.12, 0.12);
    b.slot(CLAY); for (let i = 0; i < m; i++) b.col(c, 0.85 + 0.2 * q(k * 7 + i)).box(x + 0.03 * (q(k * 5 + i) - 0.5), 0.08 + i * 0.2, 0.03 * (q(k * 3 + i) - 0.5), s, 0.19, s, { ry: 3 * (q(k + i) - 0.5), top: 0.99 });
  }
  b.col(c, 0.9).push(stacks * (s + 0.18) / 2 + 0.2, 0, 0.1, 0, 0, -22); b.box(0, 0, 0, 0.19, s, s); b.pop();
}
/** Barley unloaded in a heap under reed mats (R5 3.4), baskets, a wooden shovel, sacks being filled. */
function grainHeap(b, q, lod, P, v) {
  const rx = 1.5, rz = 1.1, h = 0.75;
  b.slot(CLOTH).col(P.grain).heap(0, 0, 0, rx, rz, h, N(lod, 12, 8, 6), N(lod, 3, 2, 1), { seed: 4, amp: 0.12, skirt: 0.08, shade: (i, j) => 0.9 + 0.2 * q(i + j * 3) });
  if (lod === 2) { b.slot(REED).col(P.reed, 1, 1).quad([-rx * 0.7, h * 0.75, -rz * 0.5], [rx * 0.2, h * 0.9, -rz * 0.5], [rx * 0.2, h * 0.9, rz * 0.5], [-rx * 0.7, h * 0.75, rz * 0.5], 0, 1, 0); return; }
  b.slot(REED).col(P.reed, 0.95, 1).sheet(N(lod, 4, 2, 1), N(lod, 4, 2, 1), (u, t) => { const x = -rx * 0.95 + rx * 1.25 * u, z = (-0.5 + t) * rz * 1.5, e = Math.max(0, 1 - (x * x) / (rx * rx) - (z * z) / (rz * rz)); return [x, h * 1.02 * Math.sqrt(e) + 0.05, z]; }, 0.03, { up: true, shade: (u, t) => 0.86 + 0.14 * ((Math.floor(u * 5) + Math.floor(t * 5)) % 2) });
  basket(b, rx + 0.3, 0.5, 0.26, 0.24, lod, P.reedOld, P.grain, P, 2);
  basket(b, rx + 0.5, -0.2, 0.24, 0.22, lod, P.reed, null, P);
  for (let i = 0; i < 2 + v; i++) sack(b, rx * 0.3 + 0.4 * i, rz + 0.35, 0.33, lod, i % 2 ? P.woolDark : P.woolOatmeal, { k: i % 2 ? 1.0 : 0.85, open: i === 0 ? P.grain : null, ry: 30 * i });
  if (lod === 0) { pole(b, [rx * 0.5, h * 0.5, rz * 0.3], [rx + 0.5, 0.05, rz * 0.8], 0.02, lod, P.woodCut, 0.8); }
}

// ------------------------------------------------------------------------------------------- lion street ----
/** An incense stand of the processional street (R5 2.5, after Curtius 5.1: altars with frankincense along both sides; conjectural for 575). */
function incense(b, q, lod, P, v) {
  const c = v === 0 ? P.copper : P.clayRed, H = 0.95, n = N(lod, 10, 7, 5);
  b.slot(CLAY).col(c, v === 0 ? 0.85 : 1).lathe(lod === 2 ? [[0.2, -0.05], [0.06, 0.4], [0.2, H]] : [[0.22, -0.05], [0.2, 0.03], [0.08, 0.1], [0.055, 0.45], [0.09, 0.62], [0.07, 0.68], [0.2, 0.88], [0.21, H], [0.17, H]], n, { capTop: 0.18 });
  if (lod === 0) b.slot(CLOTH).col(P.ash, 0.5).heap(0, H - 0.02, 0, 0.15, 0.15, 0.04, 6, 1, { seed: 2, skirt: 0.0 });
}

export const TOWN_KINDS = {
  sacks: { n: 4, f: sacks },
  bricks: { n: 3, f: bricks },
  reedLean: { n: 5, f: reedLean },
  fronds: { n: 2, f: fronds },
  sledge: { n: 3, f: sledge },
  cart: { n: 3, f: cart, flat: [1.3, 2.0, 0.9, 'palmWood', 0] },
  panniers: { n: 3, f: panniers },
  refuse: { n: 3, f: refuse, flat: [2.2, 1.6, 0.25, 'earth', 0] },
  well: { n: 1, f: well },
  stall: { n: 10, f: stall, flat: [2.7, 2.1, 2.1, 'reed', 1], proxy: [2.6, 2.0, 1.95, 2.05] },
  vendor: { n: 8, f: vendor, flat: [1.9, 1.3, 0.1, 'reed', 1] },
  bales: { n: 3, f: bales, flat: [2.4, 1.2, 0.9, 'woolOatmeal', 0] },
  jarRow: { n: 3, f: jarRow, flat: [2.2, 0.9, 0.5, 'clayBuff', 0] },
  timber: { n: 3, f: timber, flat: [5.0, 1.2, 0.7, 'palmTrunk', 0] },
  reedStack: { n: 2, f: reedStack, flat: [2.6, 1.6, 0.9, 'reed', 1] },
  ropes: { n: 2, f: ropes },
  bitumen: { n: 2, f: bitumen, flat: [2.0, 1.6, 0.05, 'bitumen', 0] },
  netRack: { n: 3, f: netRack, flat: [3.4, 0.7, 1.9, 'net', 0] },
  quffa: { n: 3, f: quffa, flat: [2.0, 2.0, 0.8, 'bitumen', 0] },
  stone: { n: 2, f: stone, flat: [2.2, 1.05, 0.7, 'limestone', 0] },
  grainHeap: { n: 2, f: grainHeap, flat: [2.6, 2.0, 0.6, 'grain', 0] },
  incense: { n: 2, f: incense },
};
