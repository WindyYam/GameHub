// js/modules/dressing/props.js — the prop library, part 1: things of the house (roofs and courts) and the small
// parts every other prop is made of (jars, baskets, poles, mats).
// Every builder is (b: PB, q: (k) => 0..1 hash of the variant, lod: 0 | 1 | 2, P: palette) and draws one variant
// of one kind in its local frame (y up, origin on the floor, -z = back / wall side). lod 0 = hero (within about
// 75 m of the film path), 1 = reduced, 2 = crude (a few boxes: what is seen beyond 150 m and from the air).
// The random layout of a variant comes from q(k) with fixed keys, so the three levels of one variant agree.
// Period sources: research/R5-urban-life.md 2.1, 3.1 (roofs, courts), 3.2 (streets, trade), 3.4 (river).
import { SLOT } from './kit.js';

const { REED, CLAY, WOOD, CLOTH } = SLOT;
export const N = (lod, a, b, c) => (lod === 0 ? a : lod === 1 ? b : c);
export const rr = (q, k, a, b) => a + (b - a) * q(k);
export const pick = (q, k, arr) => arr[Math.min(arr.length - 1, Math.floor(q(k) * arr.length))];

// ------------------------------------------------------------------------------------------------ parts ----
const PROFILES = {
  // [r, y] for height 1: Neo-Babylonian plain wares, no handles (storage jar, ovoid jar, cooking pot, bowl, pointed water jar, tall beaker)
  pithos: [[0.11, 0], [0.2, 0.1], [0.3, 0.36], [0.3, 0.58], [0.23, 0.8], [0.17, 0.91], [0.2, 1]],
  ovoid: [[0.13, 0], [0.31, 0.3], [0.37, 0.58], [0.28, 0.82], [0.17, 0.92], [0.21, 1]],
  pot: [[0.2, 0], [0.48, 0.3], [0.55, 0.58], [0.4, 0.85], [0.42, 1]],
  bowl: [[0.5, 0], [1.3, 0.7], [1.5, 1]],
  pointed: [[0.03, 0], [0.15, 0.2], [0.24, 0.5], [0.21, 0.76], [0.1, 0.92], [0.13, 1]],
  beaker: [[0.12, 0], [0.16, 0.5], [0.2, 0.9], [0.22, 1]],
};
const thin = (p, lod) => (lod === 0 ? p : lod === 1 && p.length > 5 ? [p[0], p[Math.floor(p.length * 0.4)], p[Math.floor(p.length * 0.75)], p[p.length - 1]] : [p[0], p[Math.floor(p.length / 2)], p[p.length - 1]]);

/** One vessel standing at (x, 0, z) of height H. opt: { tilt (deg, lying over), ry, lid: colour | null, mouth: k of the dark mouth } */
export function vessel(b, kind, x, z, H, lod, col, opt = {}) {
  const prof = thin(PROFILES[kind], lod).map(([r, y]) => [r * H, y * H]), n = N(lod, kind === 'pithos' ? 8 : 7, 5, 4);
  b.slot(CLAY).col(col, 1, opt.role ?? 0);
  const tl = opt.tilt ?? 0, rmax = Math.max(...prof.map((p) => p[0]));
  b.push(x, (opt.y ?? 0) + (tl > 45 ? rmax : prof[0][0]) * Math.sin(tl * Math.PI / 180), z, opt.ry ?? 0, tl, 0);
  const sh = (j) => 1 - 0.22 * (1 - j / (prof.length - 1)) * (opt.soot ?? 0) - (opt.sootTop ? 0.5 * (j / (prof.length - 1)) : 0);
  b.lathe(prof, n, { capTop: opt.lid ? false : opt.mouth ?? 0.16, shade: sh });
  if (opt.lid) { const m = prof[prof.length - 1]; b.col(opt.lid).lathe(lod === 0 ? [[m[0] * 1.12, m[1] - 0.005], [m[0] * 1.12, m[1] + 0.025], [0, m[1] + 0.05]] : [[m[0] * 1.1, m[1]], [0, m[1] + 0.04]], Math.max(4, n - 2)); }
  b.pop();
}
/** A round basket of radius R and height H with contents (colour or null) heaped inside. */
export function basket(b, x, z, R, H, lod, col, content, P, seed = 1, y = 0) {
  const n = N(lod, 8, 5, 4);
  b.slot(REED).col(col);
  b.push(x, y, z);
  b.lathe(lod === 0 ? [[R * 0.72, 0], [R * 0.92, H * 0.5], [R * 1.03, H], [R * 0.93, H]] : [[R * 0.72, 0], [R, H]], n, { capTop: content ? false : 0.35, shade: (j) => 0.88 + 0.12 * (j % 2) });
  if (content && lod === 0) b.slot(CLOTH).col(content).heap(0, H * 0.86, 0, R * 0.92, R * 0.92, H * 0.3, n, 1, { seed, skirt: 0.02, amp: 0.18 });
  else if (content) b.slot(CLOTH).col(content).disc(0, H * 0.97, 0, R * 0.95, R * 0.95, n);
  b.pop();
}
/** A reed mat lying flat: w along x, d along z, optional darker bound ends; role 1 (tinted per instance). */
export function matFlat(b, x, z, w, d, lod, P, opt = {}) {
  const t = 0.022, ry = opt.ry ?? 0;
  b.slot(REED).col(opt.col ?? P.reed, opt.k ?? 1, opt.role ?? 1);
  b.push(x, opt.y ?? 0, z, ry);
  b.slab(0, 0, w, d, t, { skirt: 0.03 });
  if (lod === 0) {
    b.col(opt.col ?? P.reed, (opt.k ?? 1) * 0.72, opt.role ?? 1);
    for (const s of [-1, 1]) b.top(0, s * (d / 2 - 0.05), w, 0.07, t + 0.006);          // bound ends
    b.col(opt.col ?? P.reed, (opt.k ?? 1) * 0.86, opt.role ?? 1);
    for (let i = 1; i < 4; i++) b.top(0, -d / 2 + (d * i) / 4, w * 0.995, 0.03, t + 0.004);   // the twined rows that hold the reeds
  }
  b.pop();
}
/** A rolled mat / roll of cloth lying along local x at (x, z): length L, radius r. */
export function roll(b, slot, col, x, z, L, r, lod, opt = {}) {
  const n = N(lod, 8, 5, 4);
  b.slot(slot).col(col, opt.k ?? 1, opt.role ?? 0);
  b.push(x, opt.y ?? 0, z, opt.ry ?? 0);
  b.tube([-L / 2, r, 0], [L / 2, r, 0], r, r, n, [true, true]);
  if (lod === 0 && opt.bands) { b.col(opt.bandCol ?? col, (opt.k ?? 1) * 0.6, opt.bandRole ?? opt.role ?? 0); for (const s of opt.bands) b.tube([s * L / 2 - 0.03, r, 0], [s * L / 2 + 0.03, r, 0], r * 1.06, r * 1.06, n, [false, false]); }
  b.pop();
}
/** A straight pole from p to q (palm rib or poplar), slightly tapering. */
export function pole(b, p, q, r, lod, col, k = 1) { b.slot(WOOD).col(col, k).tube(p, q, r, r * 0.8, N(lod, 5, 3, 3), [false, lod === 0]); }

// ------------------------------------------------------------------------------------------------ roofs ----
function mat(b, q, lod, P, v) {
  const w = rr(q, 1, 1.5, 1.95), d = rr(q, 2, 2.1, 2.7);
  if (lod === 2) { b.slot(REED).col(P.reed, 1, 1).top(0, 0, w, d, 0.04); if (v === 1) b.slot(CLOTH).col(P.white, 1, 1).box(0.1, 0.03, -d * 0.2, 0.9, 0.14, 0.6); return; }
  matFlat(b, 0, 0, w, d, lod, P);
  if (v === 1) {            // a place to sit: bolster, folded blanket, a cup
    roll(b, CLOTH, P.white, 0, -d * 0.36, w * 0.7, 0.11, lod, { y: 0.02, role: 1, bands: [-0.55, 0.55], bandRole: 2 });
    b.slot(CLOTH).col(P.white, 0.92, 1).box(-w * 0.18, 0.02, d * 0.05, 0.62, 0.07, 0.46, { ry: rr(q, 3, -15, 15), top: 0.96 });
    b.col(P.white, 1, 2).box(-w * 0.18, 0.09, d * 0.05, 0.6, 0.035, 0.44, { ry: rr(q, 3, -15, 15), top: 0.96 });
    vessel(b, 'beaker', w * 0.28, d * 0.1, 0.16, lod, P.clayPale);
    vessel(b, 'bowl', w * 0.22, d * 0.26, 0.07, lod, P.clayRed, { mouth: 0.6 });
  } else if (v === 2) {     // baskets and a jug
    basket(b, -w * 0.2, -d * 0.25, 0.26, 0.24, lod, P.reedOld, P.dates, P, 3);
    basket(b, w * 0.18, -d * 0.3, 0.2, 0.3, lod, P.reedDark, null, P);
    vessel(b, 'ovoid', w * 0.05, d * 0.12, 0.38, lod, P.clayBuff);
    vessel(b, 'bowl', -w * 0.25, d * 0.2, 0.08, lod, P.clayPale, { mouth: 0.7 });
  } else if (v === 3) {     // a second, older mat half across the first
    matFlat(b, w * 0.35, d * 0.2, w * 0.8, d * 0.75, lod, P, { ry: rr(q, 4, 12, 40), y: 0.024, k: 0.8 });
  } else if (v === 4) {     // a mat rolled up beside the spread one, cushions
    roll(b, REED, P.reed, w * 0.62, 0, d * 0.82, 0.13, lod, { ry: 90, k: 0.85, role: 1, bands: [-0.6, 0.6] });
    b.slot(CLOTH).col(P.white, 1, 1).blob(-w * 0.15, 0.02, -d * 0.2, 0.3, 0.07, 0.22, N(lod, 7, 5, 4), N(lod, 4, 2, 2));
    b.col(P.white, 1, 2).blob(w * 0.12, 0.02, -d * 0.28, 0.26, 0.07, 0.2, N(lod, 7, 5, 4), N(lod, 4, 2, 2), { ry: 30 });
  } else if (v === 5) {     // spinning: a basket of wool, spindles
    basket(b, w * 0.1, -d * 0.2, 0.24, 0.2, lod, P.reedOld, P.woolCream, P, 5);
    b.slot(CLOTH).col(P.woolCream).blob(-w * 0.22, 0.02, d * 0.05, 0.16, 0.1, 0.14, N(lod, 6, 5, 4), 3);
    b.col(P.woolBrown).blob(-w * 0.05, 0.02, d * 0.18, 0.13, 0.08, 0.12, N(lod, 6, 5, 4), 3);
    if (lod === 0) { pole(b, [w * 0.25, 0.04, d * 0.1], [w * 0.05, 0.06, d * 0.3], 0.012, lod, P.palmWood); b.slot(CLAY).col(P.clayRed).disc(w * 0.23, 0.07, d * 0.12, 0.035, 0.035, 6); }
  }
}
function bedding(b, q, lod, P, v) {
  const w = 1.25, d = 1.9;                                      // lies along z
  if (lod === 2) { b.slot(REED).col(P.reed, 1, 1).top(0, 0, w, d, 0.04); b.slot(CLOTH).col(P.white, 1, 1).box(0, 0.03, 0.1, 0.8, 0.12, 1.5); return; }
  matFlat(b, 0, 0, w, d, lod, P, { k: 0.92 });
  // a stuffed pad, a blanket over the lower half, a rolled blanket or bolster at the head
  b.slot(CLOTH).col(P.white, 0.95, 1).box(0, 0.02, 0.06, 0.82, 0.08, 1.62, { top: 0.95 });
  if (v % 2 === 0) b.sheet(N(lod, 3, 2, 1), N(lod, 3, 2, 1), (u, t) => [(-0.45 + 0.9 * u) * (1 + 0.04 * Math.sin(t * 7)), 0.105 + 0.03 * Math.sin(u * 3.1) + 0.015 * Math.sin(t * 9 + u * 4), 0.05 + 0.85 * t], 0.03, { up: true, shade: (u) => (Math.abs(u - 0.5) > 0.38 ? 0.55 : 1) });
  else { b.col(P.white, 1, 2).box(0.02, 0.1, 0.5, 0.74, 0.05, 0.5, { ry: rr(q, 1, -8, 8), top: 0.97 }); b.col(P.white, 0.8, 1).box(0.02, 0.15, 0.5, 0.7, 0.04, 0.46, { ry: rr(q, 1, -8, 8), top: 0.97 }); }
  roll(b, CLOTH, P.white, 0, -0.72, 0.74, 0.1, lod, { y: 0.1, role: v === 3 ? 2 : 1, k: v === 3 ? 1 : 0.85, bands: [-0.7, 0.7], bandRole: 2 });
  if (v >= 2) vessel(b, 'beaker', 0.52, -0.6, 0.17, lod, P.clayPale);
}
function drying(b, q, lod, P, v) {
  const w = 2.3, d = 1.55;
  const crop = [P.dates, P.grain, P.woolCream, P.onion, P.white, P.sesame][v % 6], role = v === 4 ? 2 : 0;
  if (lod === 2) { b.slot(REED).col(P.reed, 1, 1).top(0, 0, w, d, 0.04); b.slot(CLOTH).col(crop, 1, role).top(0, 0, w * 0.78, d * 0.74, 0.08); return; }
  matFlat(b, 0, 0, w, d, lod, P);
  const n = N(lod, 9, 6, 5);
  b.slot(CLOTH);
  if (v === 0) {            // dates spread to dry, raked into a thin layer with a darker heap
    b.col(P.dates).heap(-0.15, 0.022, 0, w * 0.38, d * 0.36, 0.045, n, 1, { seed: 3, flat: 0.75, amp: 0.25, skirt: 0.01 });
    b.col(P.datesAmber).heap(0.62, 0.022, 0.25, 0.3, 0.26, 0.09, n, N(lod, 2, 1, 1), { seed: 4, amp: 0.2, skirt: 0.01 });
    basket(b, 0.75, -0.42, 0.22, 0.2, lod, P.reedOld, P.dates, P, 8);
  } else if (v === 1) {     // barley in a raked layer, a wooden rake
    b.col(P.grain).heap(0, 0.022, 0, w * 0.42, d * 0.38, 0.04, n, 1, { seed: 5, flat: 0.8, amp: 0.2, skirt: 0.01 });
    if (lod === 0) { pole(b, [-0.9, 0.06, 0.5], [0.3, 0.09, 0.62], 0.014, lod, P.palmWood); b.slot(WOOD).col(P.palmWood).box(-0.9, 0.04, 0.5, 0.06, 0.04, 0.36, { ry: 6 }); }
  } else if (v === 2) {     // washed fleeces
    for (let i = 0; i < 5; i++) b.col(i % 3 === 2 ? P.woolOatmeal : P.woolCream, 0.82 + 0.14 * q(10 + i)).heap(-0.8 + 0.4 * i + 0.1 * q(20 + i), 0.022, (i % 2 ? 0.27 : -0.24) + 0.1 * q(30 + i), 0.2 + 0.08 * q(50 + i), 0.3 + 0.08 * q(60 + i), 0.13 + 0.06 * q(70 + i), N(lod, 8, 5, 4), N(lod, 2, 1, 1), { seed: 20 + i, amp: 0.5, skirt: 0.01, shade: (a, j) => 0.78 + 0.3 * q(a * 5 + j * 3 + i) });
  } else if (v === 3) {     // onions and garlic in rows
    for (let i = 0; i < 4; i++) b.col(i % 2 ? P.garlic : P.onion).heap(-0.78 + 0.52 * i, 0.022, 0, 0.2, d * 0.36, 0.06, n - 2, 1, { seed: 11 + i, flat: 0.5, amp: 0.3, skirt: 0.01 });
  } else if (v === 4) {     // dyed wool laid out: the colour accent of the roof
    for (let i = 0; i < 6; i++) b.col(P.white, 0.9 + 0.2 * q(10 + i), i % 3 === 1 ? 1 : 2).blob(-0.8 + 0.32 * i, 0.02, (i % 2 ? 0.28 : -0.25), 0.13, 0.05, 0.3, n - 3, 2, { ry: 12 * (q(20 + i) - 0.5) });
  } else {                  // sesame / legumes in two heaps and a sieve
    b.col(P.sesame).heap(-0.45, 0.022, 0, 0.5, 0.48, 0.07, n, 1, { seed: 9, flat: 0.5, amp: 0.2, skirt: 0.01 });
    b.col(P.grain, 0.85).heap(0.55, 0.022, -0.1, 0.4, 0.42, 0.06, n, 1, { seed: 10, flat: 0.5, amp: 0.2, skirt: 0.01 });
    basket(b, 0.7, 0.5, 0.25, 0.08, lod, P.reedOld, null, P);
  }
}
/** Washing and dyed cloth on a line between two poles weighted with stones: the wind-side accent of a roof. */
function clothline(b, q, lod, P, v) {
  const L = rr(q, 1, 2.6, 3.4), H = rr(q, 2, 1.55, 1.8), n = 2 + Math.floor(q(3) * 3);
  if (lod === 2) {
    b.slot(WOOD).col(P.palmWood); for (const s of [-1, 1]) b.tube([s * L / 2, 0, 0], [s * L / 2, H, 0], 0.045, 0.045, 3, [false, false]);
    b.slot(CLOTH); for (let i = 0; i < 2; i++) { const x0 = -L / 2 + 0.25 + ((L - 0.5) * i) / 2, wd = (L - 0.5) / 2 - 0.12; b.col(P.white, 1, i === 1 ? 2 : 1); for (const sg of [-1, 1]) b.quad([x0, H, sg * 0.02], [x0 + wd, H, sg * 0.02], [x0 + wd, H - 1.0, sg * 0.05], [x0, H - 1.0, sg * 0.05], 0, 0, sg); }
    return;
  }
  for (const s of [-1, 1]) {
    pole(b, [s * L / 2, 0, 0], [s * (L / 2 + 0.06), H + 0.08, 0.02], 0.035, lod, P.palmWood, 0.9 + 0.2 * q(5 + s));
    if (lod === 0) b.slot(CLAY).col(P.mud, 0.9).heap(s * L / 2, 0, 0, 0.2, 0.2, 0.16, 6, 1, { seed: 3 + s, skirt: 0.02 });       // a lump of clay holds the pole on the roof
  }
  b.slot(REED).col(P.rope).rope([[-L / 2 - 0.06, H, 0.02], [0, H - 0.07, 0.02], [L / 2 + 0.06, H, 0.02]], 0.008, 3);
  b.slot(CLOTH);
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + 0.22 + ((L - 0.44) * i) / n, wd = (L - 0.44) / n - 0.1, len = rr(q, 10 + i, 0.75, 1.25), sag = (x) => H - 0.02 - 0.07 * (1 - Math.abs(x) / (L / 2));
    const role = i === (v % n) && v % 3 !== 2 ? 2 : 1, sw = 0.05 + 0.05 * q(20 + i);
    b.col(P.white, 0.92 + 0.12 * q(30 + i), role).sheet(N(lod, 3, 1, 1), N(lod, 3, 2, 1), (u, t) => { const x = x0 + wd * u; return [x, sag(x) - len * t, 0.02 + sw * t * Math.sin(u * 4 + i) + 0.04 * t * t]; }, 0.012, { shade: (u, t) => (role === 1 && t > 0.86 ? 0.6 : 1) });
  }
}
/** A trestle with hanks of dyed and undyed wool. */
function rack(b, q, lod, P, v) {
  const L = 1.7, H = 1.25;
  if (lod === 2) { b.slot(CLOTH).col(P.white, 1, 2).box(0, H - 0.62, 0, L * 0.85, 0.6, 0.16); b.slot(WOOD).col(P.palmWood).top(0, 0, L, 0.5, 0.03); return; }
  for (const s of [-1, 1]) for (const t of [-1, 1]) pole(b, [s * L / 2, 0, t * 0.32], [s * L / 2, H, 0], 0.028, lod, P.palmWood);
  pole(b, [-L / 2 - 0.12, H, 0], [L / 2 + 0.12, H, 0], 0.03, lod, P.palmWood, 1.1);
  b.slot(CLOTH);
  const m = 5;
  for (let i = 0; i < m; i++) {
    const x = -L / 2 + 0.2 + ((L - 0.4) * i) / (m - 1), role = (i + v) % 3 === 0 ? 1 : 2;
    b.col(P.white, 0.85 + 0.25 * q(i), role).blob(x, H - 0.62 - 0.1 * q(10 + i), 0, 0.085, 0.3 + 0.05 * q(20 + i), 0.075, N(lod, 6, 5, 4), N(lod, 4, 3, 2));
  }
}
function jars(b, q, lod, P, v) {
  if (lod === 2) { b.slot(CLAY).col(v % 3 === 0 ? P.clayRed : v % 3 === 1 ? P.clayBuff : P.clayPale).box(0, 0, 0, 0.9, 0.68, 0.6, { top: 0.6 }); return; }
  const cl = [P.clayBuff, P.clayPale, P.clayRed, P.clayPale, P.clayBuff, P.clayGreen];
  const c = (i) => cl[Math.floor(q(40 + i) * cl.length) % cl.length];
  if (v === 0) {            // two storage jars with lids, a dipper bowl
    vessel(b, 'pithos', -0.22, -0.1, 0.92, lod, c(0), { lid: P.clayRed });
    vessel(b, 'pithos', 0.34, 0.05, 0.8, lod, c(1), { lid: P.reedOld });
    vessel(b, 'bowl', 0.05, 0.42, 0.08, lod, c(2), { mouth: 0.6 });
  } else if (v === 1) {     // a row of ovoid jars
    for (let i = 0; i < 4; i++) vessel(b, 'ovoid', -0.5 + 0.34 * i, 0.08 * (i % 2), 0.5 + 0.1 * q(i), lod, c(i), { ry: 90 * q(10 + i) });
  } else if (v === 2) {     // big jar, one fallen on its side, small pots
    vessel(b, 'pithos', -0.25, -0.15, 1.0, lod, c(0));
    vessel(b, 'ovoid', 0.3, 0.2, 0.48, lod, c(1), { tilt: 82, ry: 30 });
    vessel(b, 'pot', -0.2, 0.42, 0.26, lod, P.clayDark, { soot: 1 });
  } else if (v === 3) {     // water jars: a pointed jar in a ring of clay, a second jar, a beaker
    b.slot(CLAY).col(P.mud).torus(-0.2, 0.06, 0, 0.16, 0.06, N(lod, 8, 6, 5), N(lod, 4, 3, 3));
    vessel(b, 'pointed', -0.2, 0, 0.78, lod, P.clayPale, { y: 0.03 });
    vessel(b, 'ovoid', 0.32, -0.12, 0.55, lod, c(1), { lid: P.clayBuff });
    vessel(b, 'beaker', 0.2, 0.36, 0.17, lod, c(2));
  } else if (v === 4) {     // stacked bowls and cooking pots
    for (let i = 0; i < N(lod, 4, 3, 2); i++) vessel(b, 'bowl', -0.3, 0, 0.085, lod, c(i), { y: 0.05 * i, mouth: 0.6 });
    vessel(b, 'pot', 0.18, -0.15, 0.3, lod, P.clayDark, { soot: 1 });
    vessel(b, 'pot', 0.1, 0.32, 0.24, lod, P.clayRed, { lid: P.clayRed });
    vessel(b, 'ovoid', 0.5, 0.12, 0.42, lod, c(3));
  } else if (v === 5) {     // three tall storage jars, bitumen-coated necks
    for (let i = 0; i < 3; i++) vessel(b, 'pithos', -0.42 + 0.42 * i, 0.1 * (i % 2), 0.84 + 0.14 * q(i), lod, c(i), { lid: i === 1 ? P.bitumen : null, mouth: 0.12 });
  } else if (v === 6) {     // a jar in a basket-work carrier and small jars
    basket(b, -0.18, 0, 0.3, 0.3, lod, P.reedOld, null, P);
    vessel(b, 'ovoid', -0.18, 0, 0.62, lod, c(0), { y: 0.03 });
    vessel(b, 'ovoid', 0.34, -0.2, 0.4, lod, c(1));
    vessel(b, 'beaker', 0.28, 0.25, 0.2, lod, c(2));
  } else {                  // oil jars with cloth covers tied on
    for (let i = 0; i < 3; i++) { const x = -0.36 + 0.36 * i, z = 0.14 * ((i + 1) % 2), H = 0.5 + 0.12 * q(i); vessel(b, 'ovoid', x, z, H, lod, c(i), { lid: P.woolOatmeal }); }
    vessel(b, 'bowl', 0.1, 0.45, 0.07, lod, P.clayRed, { mouth: 0.5 });
  }
}
/** The bread oven (tannur): a clay cylinder 0.8 m across narrowing to the mouth, blackened, on a clay foot, with fuel and a bread tray. */
function oven(b, q, lod, P, v) {
  const R = rr(q, 1, 0.36, 0.44), H = rr(q, 2, 0.82, 0.95), n = N(lod, 11, 6, 5);
  b.slot(CLAY).col(P.mud, 0.92);
  if (lod === 2) { b.lathe([[R * 1.1, -0.05], [R * 0.72, H]], 4, { capTop: 0.12, shade: (j) => 1 - 0.45 * j }); return; }
  // body: foot ring, belly, shoulder, rim; soot towards the mouth; the fire hole at the foot is a dark recess
  b.lathe(lod === 0 ? [[R * 1.22, -0.05], [R * 1.2, 0.07], [R * 1.04, 0.1], [R * 1.06, H * 0.45], [R * 0.95, H * 0.78], [R * 0.72, H], [R * 0.62, H], [R * 0.62, H * 0.7]] : [[R * 1.2, -0.05], [R * 1.04, H * 0.5], [R * 0.72, H], [R * 0.62, H]], n, { capTop: 0.1, shade: lod === 0 ? (j) => [1, 1, 0.97, 0.9, 0.72, 0.42, 0.25, 0.12][j] : (j) => [1, 0.92, 0.45, 0.25][j] });
  b.col(P.soot); b.push(0, 0, 0, v * 90 + 40); b.quad([-0.13, 0.1, R * 1.07], [0.13, 0.1, R * 1.07], [0.11, 0.3, R * 1.068], [-0.11, 0.3, R * 1.068], 0, 0, 1);
  if (lod === 0) b.slot(CLOTH).col(P.ash).heap(0, 0, R + 0.32, 0.3, 0.24, 0.07, 7, 1, { seed: 3, skirt: 0.02 });
  b.pop();
  // fuel: a bundle of brushwood and palm ribs, dung cakes
  const a = v * 90 + 200; b.push(0, 0, 0, a);
  if (v % 2 === 0) brush(b, 0, R + 0.5, 0.95, 0.2, lod, P, 5);
  else { b.slot(CLAY).col(P.dung, 1.25); b.push(0.05, 0, R + 0.45); for (let i = 0; i < N(lod, 4, 2, 1); i++) b.lathe([[0.15, 0.05 * i * (lod ? 2 : 1)], [0.14, 0.05 * (i + 1) * (lod ? 2 : 1) - 0.006]], N(lod, 7, 5, 4), { capTop: 0.85 + 0.2 * (i % 2) }); b.pop(); }
  b.pop();
  // the tray of flat breads and the poker
  if (v !== 3 && lod === 0) { b.push(0, 0, 0, v * 90 - 60); basket(b, 0, R + 0.42, 0.26, 0.05, 1, P.reedOld, null, P); b.slot(CLOTH).col(P.bread); for (let i = 0; i < 3; i++) b.disc(0.02 * i, 0.06 + 0.012 * i, R + 0.42 + 0.02 * i, 0.17, 0.17, 7); b.pop(); }
  if (lod === 0) pole(b, [R * 0.5, H + 0.02, 0.1], [R + 0.55, 0.02, -0.5], 0.012, lod, P.soot);
}
/** A bundle of brushwood / palm ribs lying along local x at (x, z): length L, radius r. */
export function brush(b, x, z, L, r, lod, P, seed = 1) {
  if (lod >= 1) { b.slot(WOOD).col(P.brush, 0.9); b.push(x, 0, z); b.tube([-L / 2, r * 0.8, 0], [L / 2, r * 0.8, 0], r, r * 0.8, lod === 1 ? 5 : 4, [true, true]); b.pop(); return; }
  b.slot(WOOD); b.push(x, 0, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, rad = r * (0.25 + 0.6 * ((i * 7) % 5) / 5), y = r * 0.9 + rad * Math.sin(a), zz = rad * Math.cos(a), k = 0.75 + 0.5 * (((i * 13 + seed) % 7) / 7), ext = 0.12 * (((i * 5 + seed) % 4) / 4);
    b.col(P.brush, k).tube([-L / 2 - ext, y, zz + 0.03 * (i % 3)], [L / 2 + ext * 0.6, y + 0.04 * (i % 2), zz - 0.03 * (i % 2)], 0.028, 0.014, 3, [false, false]);
  }
  b.slot(REED).col(P.rope); for (const s of [-0.28, 0.25]) b.tube([s * L - 0.02, r * 0.9, 0], [s * L + 0.02, r * 0.9, 0], r * 0.98, r * 0.98, 6, [false, false]);
  b.pop();
}
/** Reed awning on poles: 3.2 x 2.6 m, a mat on a light frame, the mat sagging between the beams; things in its shade. */
function awning(b, q, lod, P, v) {
  const w = rr(q, 1, 2.7, 3.2), d = rr(q, 2, 2.1, 2.6), H = rr(q, 3, 1.95, 2.2), slope = rr(q, 4, 0.05, 0.3), goat = v === 3;
  const top = (x, z) => H - slope * (z / d + 0.5);
  if (lod === 2) {
    b.slot(WOOD).col(P.palmWood); for (const sx of [-1, 1]) b.tube([sx * w * 0.46, 0, sx * d * 0.46], [sx * w * 0.46, top(0, sx * d * 0.46), sx * d * 0.46], 0.05, 0.05, 3, [false, false]);
    b.slot(goat ? CLOTH : REED).col(goat ? P.goat : P.reed, 1, goat ? 0 : 1).quad([-w / 2, top(0, -d / 2), -d / 2], [w / 2, top(0, -d / 2), -d / 2], [w / 2, top(0, d / 2), d / 2], [-w / 2, top(0, d / 2), d / 2], 0, 1, 0);
    b.col(goat ? P.goat : P.reed, 0.55, goat ? 0 : 1).quad([-w / 2, top(0, -d / 2) - 0.03, -d / 2], [w / 2, top(0, -d / 2) - 0.03, -d / 2], [w / 2, top(0, d / 2) - 0.03, d / 2], [-w / 2, top(0, d / 2) - 0.03, d / 2], 0, -1, 0);
    return;
  }
  const px = w * 0.46, pz = d * 0.46;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lean = 0.05 * (q(10 + sx + 2 * sz) - 0.5);
    pole(b, [sx * px + lean, -0.05, sz * pz], [sx * px - lean, top(0, sz * pz) + 0.1, sz * pz + lean], 0.04, lod, P.palmWood, 0.85 + 0.3 * q(20 + sx + 2 * sz));
    if (lod === 0) b.slot(CLAY).col(P.mud, 0.9).box(sx * px + lean, -0.03, sz * pz, 0.3, 0.16, 0.3, { top: 0.7, ry: 45 * q(30 + sx + 2 * sz) });
  }
  for (const sz of [-1, 1]) pole(b, [-w / 2 - 0.1, top(0, sz * pz) - 0.02, sz * pz], [w / 2 + 0.1, top(0, sz * pz) - 0.02, sz * pz], 0.035, lod, P.palmWood);
  if (lod === 0) for (const sx of [-1, 1]) b.slot(WOOD).col(P.palmWood, 0.9).tube([sx * px, top(0, -pz) - 0.03, -d / 2 - 0.08], [sx * px, top(0, pz) - 0.03, d / 2 + 0.08], 0.03, 0.03, 3, [false, false]);      // the side rails the mat is tied to
  const sagK = goat ? 0.14 : 0.06;
  b.slot(goat ? CLOTH : REED).col(goat ? P.goat : v === 4 ? P.reedOld : P.reed, 1, goat ? 0 : 1);
  b.sheet(N(lod, 3, 2, 1), N(lod, 3, 2, 1), (u, t) => { const x = -w / 2 + w * u, z = -d / 2 + d * t; return [x, top(x, z) + 0.05 - sagK * Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(Math.PI * u)), z]; }, 0.03, { up: true, shade: (u, t) => 0.86 + 0.14 * ((Math.floor(u * 6) + Math.floor(t * 5)) % 2) });
  if (v === 4 && lod === 0) { b.slot(REED).col(P.frond); for (let i = 0; i < 5; i++) b.quad([-w * 0.4 + i * 0.3, top(0, -d * 0.4) + 0.09, -d * 0.4], [-w * 0.4 + i * 0.3 + 0.5, top(0, -d * 0.4) + 0.1, -d * 0.35], [-w * 0.2 + i * 0.3 + 0.5, top(0, d * 0.4) + 0.06, d * 0.4], [-w * 0.2 + i * 0.3, top(0, d * 0.4) + 0.05, d * 0.42], 0, 1, 0); }
  // in the shade
  matFlat(b, 0, 0.1, w * 0.62, d * 0.62, lod, P, { k: 0.86 });
  if (lod === 1) { if (v % 2 === 0) vessel(b, 'pointed', -px + 0.35, -pz + 0.3, 0.7, lod, P.clayPale, { tilt: 14, ry: 45 }); return; }
  if (v % 2 === 0) { vessel(b, 'pointed', -px + 0.35, -pz + 0.3, 0.7, lod, P.clayPale, { tilt: 14, ry: 45 }); vessel(b, 'beaker', -0.2, 0.2, 0.16, lod, P.clayBuff); }
  else { b.slot(CLOTH).col(P.white, 1, 1).blob(0.2, 0.02, -0.1, 0.3, 0.07, 0.22, N(lod, 7, 5, 4), N(lod, 3, 2, 2)); basket(b, -0.5, 0.3, 0.22, 0.2, lod, P.reedOld, P.dates, P, 2); }
}
/** A light booth of poles and reed mats (R5 3.1: "a possible room on the flat roof"): three mat walls, a flat mat roof. */
function booth(b, q, lod, P, v) {
  const w = rr(q, 1, 2.2, 2.6), d = rr(q, 2, 1.8, 2.2), H = rr(q, 3, 1.85, 2.05);
  if (lod === 2) {
    b.slot(REED).col(P.reed, 0.95, 1).box(0, 0, 0, w, H, d); b.col(P.reed, 0.3, 1).quad([-w * 0.42, 0.05, d / 2 + 0.01], [w * 0.42, 0.05, d / 2 + 0.01], [w * 0.42, H * 0.9, d / 2 + 0.01], [-w * 0.42, H * 0.9, d / 2 + 0.01], 0, 0, 1);
    return;
  }
  const hx = w / 2, hz = d / 2;
  // the frame stands proud of the mats: four posts, a middle post at the back, plates, rails lashed outside the mats
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pole(b, [sx * (hx + 0.03) + 0.04 * (q(10 + sx + 2 * sz) - 0.5), -0.05, sz * (hz + 0.03)], [sx * (hx + 0.03), H + 0.16 + 0.1 * q(14 + sx + 2 * sz), sz * (hz + 0.03)], 0.05, lod, P.palmWood, 0.85 + 0.3 * q(10 + sx + 2 * sz));
  for (const sz of [-1, 1]) pole(b, [-hx - 0.22, H + 0.01, sz * (hz + 0.03)], [hx + 0.22, H - 0.01, sz * (hz + 0.03)], 0.04, lod, P.palmWood);
  if (lod === 0) {
    pole(b, [0.1, -0.05, -hz - 0.04], [0.1, H, -hz - 0.04], 0.04, lod, P.palmWood, 0.9);
    b.slot(WOOD).col(P.reedOld, 0.9);
    for (const y of [H * 0.33, H * 0.7]) { b.tube([-hx - 0.1, y, -hz - 0.045], [hx + 0.1, y + 0.02, -hz - 0.045], 0.022, 0.022, 3, [false, false]); for (const sx of [-1, 1]) b.tube([sx * (hx + 0.045), y, -hz - 0.1], [sx * (hx + 0.045), y - 0.02, hz + 0.1], 0.022, 0.022, 3, [false, false]); }
  }
  // mat walls, bulging between the posts, the top edge uneven; the front is open (v 1: half closed by a hanging mat)
  const wall = (p0, p1, k, top = 1) => { const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l; b.slot(REED).col(P.reed, k, 1).sheet(N(lod, 2, 1, 1), N(lod, 2, 1, 1), (u, t) => { const bl = 0.06 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t); return [p0[0] + dx * u + nx * bl, 0.02 + (H * top - 0.05 + 0.05 * Math.sin(u * 7 + k * 9)) * t, p0[1] + dz * u + nz * bl]; }, 0.035, { shade: (u, t) => 0.8 + 0.2 * t }); };
  wall([-hx, -hz], [hx, -hz], 0.95); wall([-hx, hz], [-hx, -hz], 0.88); wall([hx, -hz], [hx, hz], 1.0);
  if (v === 1) wall([hx, hz], [hx * 0.05, hz], 0.82, 0.8);
  b.slot(REED).col(v === 2 ? P.reedOld : P.reed, 1.02, 1).sheet(N(lod, 2, 1, 1), N(lod, 2, 1, 1), (u, t) => [-hx - 0.25 + (w + 0.5) * u, H + 0.07 - 0.06 * Math.sin(Math.PI * t) + 0.03 * Math.sin(u * 5), -hz - 0.25 + (d + 0.5) * t], 0.05, { up: true, shade: (u, t) => 0.9 + 0.1 * ((Math.floor(u * 3.99) + Math.floor(t * 3.99)) % 2) });
  if (lod === 0) { b.slot(CLAY).col(P.mud, 0.85); for (const [x, z] of [[-hx * 0.6, -hz * 0.5], [hx * 0.5, hz * 0.4]]) b.box(x, H + 0.07, z, 0.26, 0.1, 0.22, { top: 0.6, ry: 30 }); }   // lumps of clay hold the roof mat down
  // inside: a mat, bedding or jars in the dark
  matFlat(b, 0, 0, w * 0.8, d * 0.8, 1, P, { k: 0.7 });
  if (v % 2 === 0) b.slot(CLOTH).col(P.white, 0.8, 1).box(-hx * 0.3, 0.02, -hz * 0.3, 0.75, 0.1, 1.3, { top: 0.94 });
  else if (lod === 0) { vessel(b, 'pithos', -hx * 0.55, -hz * 0.5, 0.8, 1, P.clayBuff); vessel(b, 'ovoid', hx * 0.4, -hz * 0.55, 0.5, 1, P.clayPale); }
}
/** A ladder of two poles and lashed rungs leaning against a wall: foot at the origin, top at height H, leaning toward -z. */
export function ladder(b, H, lod, P, notched = false) {
  const run = Math.max(0.7, H * 0.26), L = Math.hypot(H, run) + 0.45, k = L / Math.hypot(H, run), ty = H * k, tz = -run * k, hw = 0.24;
  if (notched) {            // a palm trunk with steps cut into it
    b.slot(WOOD).col(P.palmTrunk).tube([0, -0.1, 0], [0, ty, tz], 0.13, 0.11, N(lod, 7, 5, 4), [false, true]);
    if (lod === 0) { b.col(P.woodCut); for (let y = 0.35; y < H; y += 0.33) { const t = y / ty; b.box(0, y - 0.03, tz * t + 0.1, 0.2, 0.05, 0.1); } }
    return;
  }
  if (lod === 2) { b.slot(WOOD).col(P.palmWood, 0.85); for (const sg of [-1, 1]) b.quad([-hw, -0.1, 0.03 * sg], [hw, -0.1, 0.03 * sg], [hw * 0.85, ty, tz + 0.03 * sg], [-hw * 0.85, ty, tz + 0.03 * sg], 0, 0.3 * sg, sg); return; }
  b.slot(WOOD);
  for (const s of [-1, 1]) b.col(P.palmWood, s > 0 ? 1 : 0.88).tube([s * hw, -0.1, 0], [s * hw * 0.85, ty, tz], 0.035, 0.03, N(lod, 5, 3, 3), [false, lod === 0]);
  const step = lod === 0 ? 0.32 : 0.6;
  for (let y = 0.3; y < H + 0.2; y += step) { const t = y / ty, x = hw * (1 - 0.15 * t) + 0.05; b.col(P.palmWood, 0.8 + 0.3 * ((y * 7) % 1)).tube([-x, y, tz * t], [x, y, tz * t], 0.022, 0.022, 3, [false, false]); }
}
/** Horizontal ground loom (the loom of Mesopotamia): two beams pegged to the roof, the warp between them, cloth begun. */
function loomH(b, q, lod, P, v) {
  const L = rr(q, 1, 2.0, 2.5), w = rr(q, 2, 0.75, 0.95);
  if (lod === 2) { b.slot(CLOTH).col(P.woolCream).top(0, 0, w, L, 0.15); b.col(P.white, 1, 2).top(0, -L * 0.3, w, L * 0.35, 0.17); b.slot(WOOD).col(P.palmWood); for (const s of [-1, 1]) b.top(0, s * L / 2, w + 0.4, 0.1, 0.16); return; }
  for (const sz of [-1, 1]) {
    pole(b, [-w / 2 - 0.22, 0.13, sz * L / 2], [w / 2 + 0.22, 0.13, sz * L / 2], 0.04, lod, P.palmWood, 1);
    if (lod === 0) for (const sx of [-1, 1]) pole(b, [sx * (w / 2 + 0.14), -0.05, sz * (L / 2 + 0.05)], [sx * (w / 2 + 0.14), 0.24, sz * (L / 2 + 0.05)], 0.03, lod, P.palmWood, 0.8);
  }
  // warp threads (a striped sheet), the woven part at the cloth beam with a dyed band
  const done = rr(q, 3, 0.2, 0.5);
  b.slot(CLOTH).col(P.woolCream).sheet(1, N(lod, 4, 2, 1), (u, t) => [(-0.5 + u) * w, 0.15 + 0.03 * Math.sin(Math.PI * t), -L / 2 + L * done + L * (1 - done) * t], 0.006, { up: true, shade: (u, t) => 0.8 + 0.2 * (Math.floor(t * 24) % 2) });
  b.col(P.white, 1, 1).sheet(1, N(lod, 3, 2, 1), (u, t) => [(-0.5 + u) * w, 0.152, -L / 2 + L * done * t], 0.012, { up: true, shade: (u, t) => (t > 0.3 && t < 0.5 ? 0.55 : t > 0.7 && t < 0.78 ? 0.55 : 1) });
  if (v % 2 === 0) b.col(P.white, 1, 2).quad([-w / 2, 0.16, -L / 2 + L * done * 0.55], [w / 2, 0.16, -L / 2 + L * done * 0.55], [w / 2, 0.16, -L / 2 + L * done * 0.9], [-w / 2, 0.16, -L / 2 + L * done * 0.9], 0, 1, 0);
  // heddle rod on two stones, shed stick, beater
  const hz = -L / 2 + L * done + 0.35;
  pole(b, [-w / 2 - 0.2, 0.3, hz], [w / 2 + 0.2, 0.3, hz], 0.02, lod, P.palmWood, 1.15);
  b.slot(CLAY).col(P.limestone, 0.8); for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.15), 0, hz, 0.14, 0.28, 0.12, { top: 0.7 });
  if (lod === 0) { pole(b, [-w / 2 - 0.1, 0.19, hz + 0.3], [w / 2 + 0.1, 0.19, hz + 0.3], 0.015, lod, P.woodCut); b.slot(WOOD).col(P.palmWood, 1.1).box(w * 0.1, 0.17, -L / 2 + L * done * 0.8, w * 0.7, 0.02, 0.06, { ry: 12 }); }
  // the weaver's place: a small mat, a basket of yarn balls
  matFlat(b, 0, -L / 2 - 0.55, w + 0.2, 0.7, lod, P, { k: 0.85 });
  basket(b, w / 2 + 0.45, -L / 2 + 0.2, 0.2, 0.18, lod, P.reedOld, null, P);
  b.slot(CLOTH); for (let i = 0; i < N(lod, 3, 2, 1); i++) b.col(P.white, 1, i === 1 ? 1 : 2).blob(w / 2 + 0.4 + 0.08 * i, 0.12, -L / 2 + 0.16 + 0.07 * (i % 2), 0.07, 0.06, 0.07, 5, 3);
}
/** Upright two-beam loom leaning against a court wall (back at -z). */
function loomV(b, q, lod, P, v) {
  const w = 1.3, H = 1.95, lean = 0.3;
  if (lod === 2) { b.slot(WOOD).col(P.palmWood); for (const s of [-1, 1]) b.tube([s * w / 2, 0, 0.3], [s * w / 2, H, 0.02], 0.05, 0.05, 3, [false, false]); b.slot(CLOTH).col(P.woolCream).quad([-w * 0.42, 0.35, 0.26], [w * 0.42, 0.35, 0.26], [w * 0.42, H - 0.2, 0.06], [-w * 0.42, H - 0.2, 0.06], 0, 0, 1); return; }
  const at = (y) => lean * (1 - y / H);
  for (const s of [-1, 1]) pole(b, [s * w / 2, -0.05, at(0)], [s * w / 2, H + 0.1, at(H) - 0.01], 0.045, lod, P.palmWood, 0.9 + 0.2 * q(s + 2));
  for (const y of [0.32, H - 0.15]) pole(b, [-w / 2 - 0.12, y, at(y) + 0.03], [w / 2 + 0.12, y, at(y) + 0.03], 0.04, lod, P.palmWood, 1.05);
  const done = rr(q, 1, 0.25, 0.6), y0 = 0.36, y1 = H - 0.19;
  b.slot(CLOTH).col(P.woolCream).sheet(1, N(lod, 3, 2, 1), (u, t) => { const y = y0 + (y1 - y0) * (done + (1 - done) * t); return [(-0.5 + u) * w * 0.86, y, at(y) + 0.075]; }, 0.006, { shade: (u, t) => 0.8 + 0.2 * (Math.floor(t * 20) % 2) });
  b.col(P.white, 1, 1).sheet(1, N(lod, 4, 2, 1), (u, t) => { const y = y0 + (y1 - y0) * done * t; return [(-0.5 + u) * w * 0.86, y, at(y) + 0.08]; }, 0.012, { shade: (u, t) => (t > 0.25 && t < 0.4 ? 0.5 : t > 0.6 && t < 0.66 ? 0.5 : 1) });
  if (v % 2 === 0) b.col(P.white, 1, 2).quad([-w * 0.43, y0 + (y1 - y0) * done * 0.72, at(y0) + 0.07], [w * 0.43, y0 + (y1 - y0) * done * 0.72, at(y0) + 0.07], [w * 0.43, y0 + (y1 - y0) * done * 0.95, at(y0) + 0.055], [-w * 0.43, y0 + (y1 - y0) * done * 0.95, at(y0) + 0.055], 0, 0, 1);
  pole(b, [-w / 2 - 0.05, y0 + (y1 - y0) * done + 0.2, at(1) + 0.12], [w / 2 + 0.05, y0 + (y1 - y0) * done + 0.2, at(1) + 0.12], 0.018, lod, P.woodCut);
  basket(b, w / 2 + 0.35, 0.45, 0.2, 0.2, lod, P.reedOld, P.woolCream, P, 4);
  b.slot(WOOD).col(P.palmWood).box(-0.1, 0, 0.75, 0.5, 0.22, 0.3);          // the weaver's stool
}
/** The stone roof roller with its wooden pull frame (R5 3.1). */
function roller(b, q, lod, P) {
  const L = 0.62, r = 0.17;
  b.slot(CLAY).col(P.limestone, 0.85); b.tube([-L / 2, r, 0], [L / 2, r, 0], r, r, N(lod, 10, 6, 4), [lod < 2, lod < 2]);
  if (lod === 2) return;
  for (const s of [-1, 1]) pole(b, [s * (L / 2 + 0.04), r, 0], [s * (L / 2 + 0.04), 0.55, 1.05], 0.02, lod, P.palmWood);
  pole(b, [-L / 2 - 0.1, 0.55, 1.05], [L / 2 + 0.1, 0.55, 1.05], 0.02, lod, P.palmWood, 1.1);
}
/** Tools leaning against a parapet or wall (the wall is at -z, about 0.15 m behind the origin). */
function tools(b, q, lod, P, v) {
  // a tool rests on the inner top edge of the parapet (0.72 m up, at z = -0.14) and stands out above it
  const PH = 0.72, lean = (x, len, ang, r, col, k = 1) => { const c = Math.cos(ang), s = Math.sin(ang), zf = -0.14 + PH * c / s; pole(b, [x, 0, zf], [x + 0.03, len * s, zf - len * c], r, lod, col, k); return [x, len * s, zf - len * c, zf]; };
  if (lod === 2) { b.slot(WOOD).col(P.palmWood).tube([0, 0, 0.1], [0, 1.3, -0.3], 0.035, 0.03, 3, [false, false]); return; }
  const A = 72 * Math.PI / 180;
  if (v === 0) {            // hoe and spade
    const t0 = lean(-0.15, 1.35, A, 0.02, P.palmWood); b.slot(CLAY).col(P.copper, 0.7).box(-0.15, 0.02, t0[3] + 0.06, 0.2, 0.03, 0.24, { ry: 4 });
    const t1 = lean(0.2, 1.25, A * 0.97, 0.022, P.woodCut, 0.8); b.slot(WOOD).col(P.palmWood, 0.9).box(0.2, 0, t1[3] + 0.02, 0.18, 0.3, 0.03);
  } else if (v === 1) {     // broom of palm fronds, winnowing fork
    const t0 = lean(-0.2, 1.2, A, 0.018, P.palmWood);
    b.slot(REED).col(P.frond); b.push(-0.2, 0, t0[3]); b.lathe([[0.16, 0], [0.1, 0.1], [0.03, 0.28]], N(lod, 6, 4, 3), { ez: 0.5 }); b.pop();
    const t = lean(0.22, 1.55, A * 1.03, 0.02, P.woodCut, 0.85);
    if (lod === 0) for (const dx of [-0.09, 0, 0.09]) pole(b, [0.25, t[1] - 0.25, t[2] + 0.08], [0.25 + dx, t[1] + 0.2, t[2] - 0.06], 0.01, lod, P.woodCut, 0.85);
  } else if (v === 2) {     // a bundle of poles and reeds
    for (let i = 0; i < N(lod, 5, 3, 2); i++) lean(-0.25 + 0.12 * i, 1.9 + 0.5 * q(i), A * (1 + 0.04 * (q(10 + i) - 0.5)), 0.018, i % 2 ? P.reedOld : P.palmWood, 0.8 + 0.3 * q(20 + i));
  } else if (v === 3) {     // sieve, basket and a pestle
    b.slot(REED).col(P.reedOld); b.push(-0.1, 0.3, 0.02, 0, -72); b.lathe([[0.3, 0], [0.31, 0.07]], N(lod, 9, 6, 5), { capBottom: true }); b.pop();
    lean(0.3, 1.05, A, 0.03, P.palmWood, 0.9);
    basket(b, 0.1, 0.42, 0.2, 0.22, lod, P.reedDark, null, P);
  } else {                  // shepherd's crook, water skin, a coil of rope
    lean(-0.2, 1.5, A, 0.018, P.palmWood);
    b.slot(CLOTH).col(P.goat, 1.6).blob(0.15, 0, 0.05, 0.2, 0.13, 0.3, N(lod, 7, 5, 4), N(lod, 4, 3, 2), { ry: 20 });
    b.slot(REED).col(P.rope).torus(0.2, 0.04, 0.5, 0.16, 0.04, N(lod, 9, 6, 5), 3); if (lod === 0) b.torus(0.2, 0.1, 0.5, 0.14, 0.035, 9, 3);
  }
}
function baskets(b, q, lod, P, v) {
  if (lod === 2) { b.slot(REED).col(P.reedOld).box(0, 0, 0, 0.5, 0.3, 0.5, { top: 1.2 }); return; }
  const cont = [P.dates, P.grain, P.onion, P.greens, P.woolCream, P.pomegranate];
  if (v === 0) { basket(b, 0, 0, 0.3, 0.3, lod, P.reed, cont[0], P, 1); basket(b, 0.5, 0.15, 0.22, 0.22, lod, P.reedOld, cont[2], P, 2); }
  else if (v === 1) { basket(b, 0, 0, 0.26, 0.4, lod, P.reedDark, null, P); basket(b, -0.42, 0.2, 0.24, 0.2, lod, P.reedOld, cont[1], P, 3); basket(b, 0.3, 0.38, 0.18, 0.16, lod, P.reed, cont[5], P, 4); }
  else if (v === 2) { for (let i = 0; i < 3; i++) basket(b, 0, 0, 0.3 - 0.01 * i, 0.14, lod, i % 2 ? P.reedOld : P.reed, null, P, 1, 0.07 * i); basket(b, 0.52, 0.1, 0.24, 0.26, lod, P.reedOld, cont[3], P, 5); }
  else if (v === 3) { basket(b, 0, 0, 0.34, 0.26, lod, P.reedOld, cont[4], P, 6); b.slot(CLOTH).col(P.woolBrown).blob(0.45, 0, 0.2, 0.16, 0.1, 0.14, N(lod, 6, 5, 4), 3); }
  else { basket(b, 0, 0, 0.28, 0.32, lod, P.reed, cont[1], P, 7); b.slot(WOOD).col(P.palmWood).box(0.4, 0, -0.05, 0.1, 0.5, 0.1, { top: 0.8 }); b.slot(CLAY).col(P.limestone, 0.8); b.push(0.42, 0, 0.42); b.lathe([[0.22, 0], [0.24, 0.1], [0.18, 0.13]], N(lod, 8, 6, 5), { capTop: 0.9 }); b.pop(); }
}
function firewood(b, q, lod, P, v) {
  if (lod === 2) { b.slot(WOOD).col(P.brush).box(0, 0, 0, 1.1, 0.45, 0.6, { top: 0.8 }); return; }
  if (v === 2) {            // dung cakes stacked to dry and a small stack of them
    b.slot(CLAY).col(P.dung, 1.25);
    for (let s = 0; s < 3; s++) for (let i = 0; i < N(lod, 5, 2, 2) - (lod ? 0 : s); i++) { const hh = lod ? 0.11 : 0.05; b.push(-0.35 + 0.34 * s + 0.02 * (q(s * 7 + i) - 0.5), hh * i, 0.08 * (s % 2), 40 * q(s * 7 + i)); b.lathe([[0.16, -0.02], [0.15, hh - 0.006]], N(lod, 7, 5, 4), { capTop: 0.85 + 0.25 * q(s * 3 + i) }); b.pop(); }
    return;
  }
  brush(b, 0, 0, 1.15, 0.2, lod, P, 2); brush(b, 0.05, 0.38, 1.0, 0.18, lod, P, 4);
  b.push(0, 0.3, 0.18, 6); brush(b, 0, 0, 1.05, 0.17, lod, P, 6); b.pop();
  if (v === 1) { b.slot(WOOD); for (let i = 0; i < N(lod, 4, 2, 1); i++) b.col(P.palmTrunk, 0.9 + 0.2 * q(i)).tube([-0.45, 0.07, -0.42 - 0.16 * i], [0.5, 0.07 + 0.02 * i, -0.4 - 0.16 * i], 0.07, 0.06, N(lod, 6, 4, 4), [true, true]); }
}

// ------------------------------------------------------------------------------------------------ courts ----
/** Large storage jars standing along a wall (back at -z), some sunk into a clay bench. */
function pithoi(b, q, lod, P, v) {
  const n = 2 + (v % 3), W = 0.72 * n;
  if (lod === 2) { b.slot(CLAY).col(P.clayBuff).box(0, 0, 0.1, W, 0.95, 0.55, { top: 0.7 }); return; }
  if (v >= 2) { b.slot(CLAY).col(P.mud, 0.95).box(0, -0.05, 0.08, W + 0.2, 0.33, 0.8, { top: 0.97 }); }
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.36 + 0.72 * i, c = [P.clayBuff, P.clayPale, P.clayRed, P.clayGreen][Math.floor(q(i) * 4) % 4];
    vessel(b, 'pithos', x, 0.08 + 0.05 * (q(10 + i) - 0.5), 1.0 + 0.2 * q(20 + i), lod, c, { y: v >= 2 ? 0.1 : 0, lid: i % 2 === v % 2 ? (i % 3 === 0 ? P.limestone : P.clayRed) : null, mouth: 0.1 });
  }
  vessel(b, 'bowl', W / 2 + 0.15, 0.4, 0.08, lod, P.clayRed, { mouth: 0.55 });
  if (v % 2) vessel(b, 'beaker', -W / 2 - 0.1, 0.45, 0.2, lod, P.clayPale);
}
/** Saddle quern on a clay base with its rubbing stone, flour, a grain basket. */
function quern(b, q, lod, P, v) {
  if (lod === 2) { b.slot(CLAY).col(P.basalt).box(0, 0, 0, 0.4, 0.2, 0.7); b.slot(REED).col(P.reed, 1, 1).top(0.1, 0.45, 1.2, 1.0, 0.04); return; }
  matFlat(b, 0.1, 0.45, 1.3, 1.1, lod, P, { k: 0.9 });
  b.slot(CLAY).col(P.mud).box(0, -0.03, 0, 0.5, 0.17, 0.78, { top: 0.9 });
  b.col(P.basalt).push(0, 0.13, 0, 0, 7); b.box(0, 0, 0, 0.34, 0.09, 0.66, { top: 0.92 }); b.col(P.basalt, 1.5).box(0, 0.09, 0.08, 0.3, 0.07, 0.13, { top: 0.8 }); b.pop();
  b.slot(CLOTH).col(P.flour).heap(0, 0.02, 0.5, 0.22, 0.16, 0.06, N(lod, 7, 5, 4), 1, { seed: 2, skirt: 0.01 });
  basket(b, 0.5, 0.15, 0.22, 0.24, lod, P.reedOld, P.grain, P, 3);
  vessel(b, 'bowl', -0.42, 0.5, 0.09, lod, P.clayPale, { mouth: 0.95 });
}
/** A porous water jar in a wooden stand with a drip bowl under it and a cup hung on a peg. */
function waterstand(b, q, lod, P, v) {
  const H = 0.62;
  if (lod === 2) { b.slot(CLAY).col(P.clayPale).box(0, 0, 0, 0.5, 1.05, 0.5, { top: 0.5 }); return; }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; pole(b, [0.34 * Math.cos(a), -0.05, 0.34 * Math.sin(a)], [0.13 * Math.cos(a), H, 0.13 * Math.sin(a)], 0.028, lod, P.palmWood, 0.9 + 0.2 * q(i)); }
  b.slot(WOOD).col(P.palmWood).torus(0, H * 0.72, 0, 0.19, 0.025, N(lod, 8, 6, 5), 3);
  vessel(b, 'pointed', 0, 0, 0.86, lod, v === 1 ? P.clayBuff : P.clayPale, { y: 0.24, lid: v === 2 ? P.clayRed : null });
  vessel(b, 'bowl', 0, 0, 0.09, lod, P.clayRed, { mouth: 0.4 });
  if (v !== 1) vessel(b, 'beaker', 0.45, 0.2, 0.18, lod, P.clayPale);
  if (v === 0) vessel(b, 'ovoid', -0.5, 0.1, 0.5, lod, P.clayBuff);
}
/** A clay trough with fodder for the tethered animal, a tether post, a heap of straw. */
function trough(b, q, lod, P, v) {
  const L = rr(q, 1, 1.1, 1.5), w = 0.46, h = 0.36;
  if (lod === 2) { b.slot(CLAY).col(P.mud).box(0, 0, 0, L, h, w); return; }
  b.slot(CLAY).col(P.mud, 0.95);
  // the trough: outer walls and a sunk inside
  b.box(0, -0.05, 0, L, h + 0.05, w, { top: 0.94, cap: false });
  const t = 0.07, hx = L * 0.47 - t, hz = w * 0.47 - t, y1 = h, y0 = h - 0.2;
  b.quad([-L * 0.47, y1, -w * 0.47], [L * 0.47, y1, -w * 0.47], [hx, y1, -hz], [-hx, y1, -hz], 0, 1, 0); b.quad([L * 0.47, y1, -w * 0.47], [L * 0.47, y1, w * 0.47], [hx, y1, hz], [hx, y1, -hz], 0, 1, 0);
  b.quad([L * 0.47, y1, w * 0.47], [-L * 0.47, y1, w * 0.47], [-hx, y1, hz], [hx, y1, hz], 0, 1, 0); b.quad([-L * 0.47, y1, w * 0.47], [-L * 0.47, y1, -w * 0.47], [-hx, y1, -hz], [-hx, y1, hz], 0, 1, 0);
  b.col(P.mud, 0.6); b.quad([-hx, y1, -hz], [hx, y1, -hz], [hx, y0, -hz], [-hx, y0, -hz], 0, 0, 1); b.quad([-hx, y1, hz], [hx, y1, hz], [hx, y0, hz], [-hx, y0, hz], 0, 0, -1);
  b.quad([-hx, y1, -hz], [-hx, y1, hz], [-hx, y0, hz], [-hx, y0, -hz], 1, 0, 0); b.quad([hx, y1, -hz], [hx, y1, hz], [hx, y0, hz], [hx, y0, -hz], -1, 0, 0);
  b.slot(CLOTH).col(v === 1 ? P.water : P.straw).heap(0, y0, 0, hx, hz, v === 1 ? 0.01 : 0.14, N(lod, 8, 6, 4), 1, { seed: 2, flat: 0.8, skirt: 0, amp: v === 1 ? 0 : 0.2 });
  // post with a rope, straw and dung
  pole(b, [L / 2 + 0.5, -0.05, -0.1], [L / 2 + 0.52, 0.85, -0.1], 0.045, lod, P.palmWood);
  b.slot(REED).col(P.rope).torus(L / 2 + 0.51, 0.6, -0.1, 0.06, 0.012, N(lod, 6, 5, 4), 3);
  b.slot(CLOTH).col(P.straw).heap(-L * 0.2, 0, w + 0.45, 0.55, 0.4, 0.3, N(lod, 8, 6, 5), N(lod, 2, 1, 1), { seed: 4, amp: 0.25 });
  if (v === 2) b.slot(CLAY).col(P.dung).heap(L * 0.4, 0, w + 0.3, 0.2, 0.17, 0.07, N(lod, 6, 5, 4), 1, { seed: 6 });
}
/** A hearth: a ring of baked bricks, ash and charcoal, a cooking pot on three stones, a pot stand. */
function hearth(b, q, lod, P, v) {
  if (lod === 2) { b.slot(CLAY).col(P.soot, 2).box(0, 0, 0, 0.8, 0.3, 0.8, { top: 0.45 }); return; }
  b.slot(CLAY);
  const n = N(lod, 8, 6, 4);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; b.col(i % 3 ? P.clayBuff : P.clayRed, 0.6 + 0.3 * q(i)).box(0.42 * Math.cos(a), -0.03, 0.42 * Math.sin(a), 0.3, 0.13, 0.15, { ry: -a * 180 / Math.PI + 90 }); }
  b.slot(CLOTH).col(P.ash).heap(0, 0, 0, 0.36, 0.36, 0.07, N(lod, 8, 6, 5), 1, { seed: 3, skirt: 0.01, shade: (i, j) => (j === 99 || (i + j) % 3 === 0 ? 0.25 : 1) });
  b.slot(CLAY).col(P.limestone, 0.45); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; b.box(0.19 * Math.cos(a), 0.04, 0.19 * Math.sin(a), 0.11, 0.13, 0.11, { top: 0.7 }); }
  vessel(b, 'pot', 0, 0, 0.3, lod, P.clayDark, { y: 0.16, soot: 1, lid: v ? P.clayDark : null });
  vessel(b, 'bowl', 0.62, 0.3, 0.08, lod, P.clayRed, { mouth: 0.5 });
  if (lod === 0) pole(b, [0.3, 0.12, -0.2], [0.75, 0.03, -0.55], 0.012, lod, P.soot, 2);
  brush(b, -0.75, 0.2, 0.8, 0.14, lod, P, 3);
}
/** A mud-brick bench along a wall (back at -z) with something left on it. */
function bench(b, q, lod, P, v) {
  const L = rr(q, 1, 1.4, 2.1), d = 0.46, h = 0.42;
  b.slot(CLAY).col(P.mud, 1, 1);
  if (lod === 2) { b.box(0, -0.1, d / 2, L, h + 0.1, d); return; }
  b.box(0, -0.12, d / 2, L, h + 0.09, d, { top: 0.985 }); b.col(P.mud, 0.93, 1).box(0, h - 0.03, d / 2, L + 0.04, 0.05, d + 0.03);
  if (v === 0) { b.slot(CLOTH).col(P.white, 1, 1).box(-L * 0.2, h + 0.02, d / 2, 0.5, 0.06, 0.34, { top: 0.95 }); vessel(b, 'beaker', L * 0.25, d / 2, 0.18, lod, P.clayPale, { y: h + 0.02 }); }
  else if (v === 1) { vessel(b, 'ovoid', L * 0.28, d / 2, 0.42, lod, P.clayBuff, { y: h + 0.02 }); vessel(b, 'bowl', -L * 0.1, d / 2, 0.08, lod, P.clayRed, { y: h + 0.02, mouth: 0.5 }); }
  else basket(b, -L * 0.25, d / 2, 0.19, 0.17, lod, P.reedOld, P.dates, P, 2, h + 0.02);
}
/** A wooden mortar cut from a palm trunk with its long pestle. */
function mortar(b, q, lod, P) {
  b.slot(WOOD).col(P.palmTrunk).lathe(lod === 2 ? [[0.2, -0.05], [0.22, 0.5]] : [[0.2, -0.05], [0.17, 0.2], [0.23, 0.5], [0.19, 0.5], [0.12, 0.3]], N(lod, 9, 6, 4), { capTop: 0.25 });
  if (lod === 2) return;
  pole(b, [0.05, 0.3, 0], [0.5, 1.25, 0.2], 0.03, lod, P.woodCut, 0.8);
  b.slot(CLOTH).col(P.grain).heap(0.55, 0, -0.3, 0.2, 0.18, 0.06, N(lod, 6, 5, 4), 1, { seed: 2 });
}

/** kinds of this file: name -> { n: variants, f: builder, flat: [w, d, h, colourKey, role] for the far level, proxy: [w, d, y0, y1] shadow box } */
export const HOUSE_KINDS = {
  mat: { n: 6, f: mat, flat: [1.75, 2.4, 0.05, 'reed', 1] },
  bedding: { n: 4, f: bedding, flat: [0.9, 1.7, 0.14, 'white', 1] },
  drying: { n: 6, f: drying, flat: [1.9, 1.25, 0.08, null, 0], flatCol: ['dates', 'grain', 'woolCream', 'onion', 'white', 'sesame'], flatRole: [0, 0, 0, 0, 2, 0] },
  clothline: { n: 6, f: clothline, flat: [2.6, 0.5, 1.2, 'white', 2], proxy: [2.8, 0.06, 0.6, 1.7] },
  rack: { n: 3, f: rack, flat: [1.5, 0.4, 0.9, 'white', 2] },
  jars: { n: 8, f: jars },
  oven: { n: 4, f: oven },
  awning: { n: 5, f: awning, flat: [3.0, 2.4, 2.1, 'reed', 1], proxy: [3.0, 2.4, 1.9, 2.0] },
  booth: { n: 4, f: booth, flat: [2.8, 2.4, 2.05, 'reed', 1], proxy: [2.5, 2.1, 0.1, 1.95] },
  loomH: { n: 3, f: loomH, flat: [0.9, 2.2, 0.16, 'woolCream', 0] },
  loomV: { n: 2, f: loomV },
  roller: { n: 1, f: roller },
  tools: { n: 5, f: tools },
  baskets: { n: 5, f: baskets },
  firewood: { n: 3, f: firewood },
  pithoi: { n: 6, f: pithoi },
  quern: { n: 2, f: quern },
  waterstand: { n: 3, f: waterstand },
  trough: { n: 3, f: trough },
  hearth: { n: 2, f: hearth },
  bench: { n: 3, f: bench },
  mortar: { n: 1, f: mortar },
};
