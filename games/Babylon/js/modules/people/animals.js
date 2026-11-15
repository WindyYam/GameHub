// js/modules/people/animals.js — quadrupeds (pack donkey, ox, fat-tailed sheep, goat, dog, a sitting cat) and
// birds (pigeon, heron, duck, kite, swallow: one body in several sizes), on the same GPU skinning as the people.
// All quadrupeds live in ONE mesh: the species is a part bit, so a flock costs one draw call.
import { Buf, rotX, rotZ, mul3 } from './meshkit.js';
import { NB, clearPose } from './rig.js';

export const Q = { BODY: 0, NECK: 1, HEAD: 2, FLU: 3, FLL: 4, FRU: 5, FRL: 6, HLU: 7, HLL: 8, HRU: 9, HRL: 10, TAIL: 11 };
const QPARENT = [-1, 0, 1, 0, 3, 0, 5, 0, 7, 0, 9, 0];
export const QPART = { donkey: 0, ox: 1, sheep: 2, goat: 3, dog: 4, cat: 5, sacks: 6, jars: 7, bundle: 8, pad: 9 };
export const qbit = (...names) => names.reduce((m, n) => m + (1 << QPART[n]), 0);

// wither: height of the back; rh / rw: half height / width of the trunk; legs: upper + lower = height of the trunk's middle
export const SPECIES = {
  donkey: { len: 1.10, wither: 1.06, rh: 0.235, rw: 0.185, neckLen: 0.40, neckAng: 0.72, neckR: 0.10, headLen: 0.40, headR: 0.098, muzzle: 0.062, headDrop: 0.6, earLen: 0.22, earW: 0.038, earOut: 0.35, legL: 0.40, legR: 0.062, legR2: 0.036, tailLen: 0.50, tailR: 0.016, tuft: 2.2, amp: 0.30, belly: 1.14, muzzleTone: 1.35 },
  ox: { len: 1.55, wither: 1.34, rh: 0.33, rw: 0.27, neckLen: 0.42, neckAng: 0.22, neckR: 0.15, headLen: 0.46, headR: 0.12, muzzle: 0.085, headDrop: 0.75, earLen: 0.15, earW: 0.045, earOut: 1.25, legL: 0.50, legR: 0.088, legR2: 0.052, tailLen: 0.85, tailR: 0.018, tuft: 2.4, amp: 0.26, belly: 1.05, muzzleTone: 0.8, horns: 0.34, hump: 0.07 },
  sheep: { len: 0.80, wither: 0.68, rh: 0.25, rw: 0.21, neckLen: 0.20, neckAng: 0.55, neckR: 0.085, headLen: 0.24, headR: 0.065, muzzle: 0.038, headDrop: 0.6, earLen: 0.09, earW: 0.03, earOut: 1.5, legL: 0.25, legR: 0.045, legR2: 0.027, tailLen: 0.30, tailR: 0.05, tuft: 0.8, amp: 0.30, belly: 1.0, muzzleTone: 1.0, wool: true, fatTail: true, points: true },
  goat: { len: 0.78, wither: 0.66, rh: 0.19, rw: 0.15, neckLen: 0.27, neckAng: 0.85, neckR: 0.06, headLen: 0.23, headR: 0.058, muzzle: 0.034, headDrop: 0.6, earLen: 0.10, earW: 0.028, earOut: 1.5, legL: 0.27, legR: 0.040, legR2: 0.024, tailLen: 0.12, tailR: 0.02, tuft: 1.0, amp: 0.32, belly: 1.0, muzzleTone: 1.0, horns: 0.20, beard: true, tailUp: true },
  dog: { len: 0.66, wither: 0.52, rh: 0.135, rw: 0.11, neckLen: 0.17, neckAng: 0.6, neckR: 0.065, headLen: 0.23, headR: 0.068, muzzle: 0.036, headDrop: 0.3, earLen: 0.07, earW: 0.028, earOut: 0.5, legL: 0.25, legR: 0.042, legR2: 0.025, tailLen: 0.36, tailR: 0.022, tuft: 0.9, amp: 0.36, belly: 1.12, muzzleTone: 0.6, tailCurl: true },
};
for (const k in SPECIES) { const s = SPECIES[k]; s.name = k; s.yc = s.wither - s.rh; s.zf = -s.len / 2 + 0.14 * s.len; s.zh = s.len / 2 - 0.13 * s.len; s.lx = s.rw * 0.62; s.leg = s.yc; }

function skeletonOf(s) {
  const neck = [0, s.wither - 0.35 * s.rh, -s.len / 2 + 0.06];
  const poll = [0, neck[1] + Math.sin(s.neckAng) * s.neckLen, neck[2] - Math.cos(s.neckAng) * s.neckLen];
  return {
    n: 12, parent: QPARENT, roll0: null, poll, neck,
    pivot: [[0, s.yc, 0], neck, poll,
      [-s.lx, s.yc, s.zf], [-s.lx, s.legL, s.zf], [s.lx, s.yc, s.zf], [s.lx, s.legL, s.zf],
      [-s.lx, s.yc, s.zh], [-s.lx, s.legL, s.zh], [s.lx, s.yc, s.zh], [s.lx, s.legL, s.zh],
      [0, s.wither - 0.2 * s.rh, s.len / 2]],
  };
}
export const QSKEL = {};
for (const k in SPECIES) QSKEL[k] = skeletonOf(SPECIES[k]);
QSKEL.cat = { n: 12, parent: QPARENT, roll0: null, pivot: [[0, 0.12, 0], [0, 0.26, -0.035], [0, 0.29, -0.045], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0.02, 0.03, 0.09]] };

const w1 = (b) => [b, b, 1], w2 = (a, b, k) => [a, b, k];

function quadruped(m, s, lod, tones) {
  const part = QPART[s.name], seg = lod === 0 ? 8 : 4, sk = QSKEL[s.name];
  const A = 1, pts = s.points ? 2 : 1;                                 // slot of the coat; "points" (face, legs) in slot B for sheep
  // trunk, rump to chest (rings in x / y, advancing toward -z)
  const bump = s.wool && lod === 0 ? (th, k) => 1 + 0.05 * Math.sin(k * 2.4 + 1) : null;
  const tr = (z, kx, ky, dy = 0, extra = {}) => ({ c: [0, s.yc + dy, z], rx: s.rw * kx, rz: s.rh * ky, w: w1(Q.BODY), col: (th) => (Math.sin(th) < -0.35 ? [s.belly, s.belly, s.belly] : [1, 1, 1]), f: bump || undefined, ...extra });
  m.loft([
    tr(s.len / 2 + 0.03, 0.45, 0.5, 0.05), tr(s.len / 2 - 0.08, 0.92, 0.9, 0.02), tr(s.len * 0.22, 1.0, 0.98, 0, { l: 0 }), tr(0, 1.05, 1.02, -0.01),
    tr(-s.len * 0.25, 1.0, 1.0 + (s.hump ? 0.1 : 0), s.hump || 0, { l: 0 }), tr(-s.len / 2 + 0.05, 0.86, 0.92, 0.01), tr(-s.len / 2 - 0.05, 0.5, 0.55, 0.03),
  ], { lod, seg: lod === 0 ? 10 : 5, slot: A, part, u: [1, 0, 0], v: [0, 1, 0], capTop: { bulge: 0.03 }, capBottom: { bulge: 0.03 } });
  // neck: built upright, then laid forward
  const nk = sk.neck, nrot = rotX(-(Math.PI / 2 - s.neckAng));
  m.loft([
    { y: -0.08, rx: s.neckR * 1.3, rz: s.neckR * 1.7, w: w1(Q.BODY) },
    { y: s.neckLen * 0.3, rx: s.neckR * 1.08, rz: s.neckR * 1.4, w: w2(Q.NECK, Q.BODY, 0.5), l: 0 },
    { y: s.neckLen * 0.72, rx: s.neckR * 0.95, rz: s.neckR * 1.15, w: w1(Q.NECK) },
    { y: s.neckLen + 0.03, rx: s.neckR * 0.85, rz: s.neckR, w: w2(Q.HEAD, Q.NECK, 0.5) },
  ], { lod, seg, slot: A, part, capTop: true, capBottom: true, rot: nrot, pivot: [0, 0, 0], move: nk, f: bump || undefined });
  // head: skull to muzzle, dropping below the horizontal
  const pl = sk.poll, hrot = rotX(-(Math.PI / 2 + s.headDrop)), hs = pts;
  const tone = (k) => [k, k, k];
  m.loft([
    { y: -0.05, rx: s.headR * 0.85, rz: s.headR * 0.9, w: w1(Q.HEAD) },
    { y: s.headLen * 0.22, rx: s.headR, rz: s.headR * 1.05, w: w1(Q.HEAD) },
    { y: s.headLen * 0.62, rx: s.headR * 0.72, rz: s.headR * 0.8, cz: s.headR * 0.1, w: w1(Q.HEAD), l: 0 },
    { y: s.headLen * 0.92, rx: s.muzzle, rz: s.muzzle * 1.05, cz: s.headR * 0.15, w: w1(Q.HEAD), col: tone(s.muzzleTone) },
  ], { lod, seg, slot: hs, part, capTop: { bulge: 0.02, col: tone(s.muzzleTone * 0.8) }, capBottom: true, rot: hrot, pivot: [0, 0, 0], move: pl });
  // ears (and horns, beard)
  for (const sd of [-1, 1]) {
    if (lod === 0 || s.earLen > 0.14) m.loft([{ y: 0, rx: s.earW * 0.7, rz: s.earW * 0.3 }, { y: s.earLen * 0.5, rx: s.earW, rz: s.earW * 0.35, l: 0 }, { y: s.earLen, rx: s.earW * 0.3, rz: s.earW * 0.15 }],
      { lod, seg: lod === 0 ? 4 : 3, slot: hs, part, w: w1(Q.HEAD), col: tone(0.85), capTop: true, capBottom: true, rot: mul3(rotZ(-sd * s.earOut), rotX(0.25)), pivot: [0, 0, 0], move: [pl[0] + sd * s.headR * 0.62, pl[1] + s.headR * 0.45, pl[2] + 0.01] });
    if (s.horns) m.loft([{ y: 0, rx: s.headR * 0.22, rz: s.headR * 0.22 }, { y: s.horns * 0.55, rx: s.headR * 0.15, rz: s.headR * 0.15, cx: sd * s.horns * (s.name === 'ox' ? 0.12 : 0.0), cz: s.name === 'ox' ? -s.horns * 0.1 : s.horns * 0.2, l: 0 }, { y: s.horns, rx: 0.006, rz: 0.006, cx: sd * s.horns * (s.name === 'ox' ? -0.05 : 0.05), cz: s.name === 'ox' ? -s.horns * 0.3 : s.horns * 0.45 }],
      { lod, seg: lod === 0 ? 4 : 3, slot: 0, part, w: w1(Q.HEAD), col: tones.horn, capTop: true, capBottom: true, rot: rotZ(-sd * (s.name === 'ox' ? 0.95 : 0.3)), pivot: [0, 0, 0], move: [pl[0] + sd * s.headR * 0.45, pl[1] + s.headR * 0.7, pl[2] - 0.02] });
  }
  if (s.beard && lod === 0) m.loft([{ y: -0.11, rx: 0.006, rz: 0.008 }, { y: 0, rx: 0.016, rz: 0.022 }], { seg: 4, slot: hs, part, w: w1(Q.HEAD), capTop: true, capBottom: true, move: [0, pl[1] - Math.sin(s.headDrop) * s.headLen * 0.75 - s.muzzle, pl[2] - Math.cos(s.headDrop) * s.headLen * 0.7] });
  // legs
  const hoof = [0.22, 0.2, 0.19];
  for (const [bu, bl, x, z, hind] of [[Q.FLU, Q.FLL, -s.lx, s.zf, 0], [Q.FRU, Q.FRL, s.lx, s.zf, 0], [Q.HLU, Q.HLL, -s.lx, s.zh, 1], [Q.HRU, Q.HRL, s.lx, s.zh, 1]]) {
    const r1 = s.legR * (hind ? 1.25 : 1), r2 = s.legR2;
    m.loft([
      { y: 0, rx: r2 * 1.25, rz: r2 * 1.4, w: w1(bl), col: hoof },
      { y: 0.05, rx: r2 * 1.15, rz: r2 * 1.3, w: w1(bl), col: hoof, edge: lod === 0, colUp: [1, 1, 1], l: 0 },
      { y: s.legL * 0.45, rx: r2, rz: r2 * 1.05, w: w1(bl), l: 0 },
      { y: s.legL, rx: r2 * 1.3, rz: r2 * 1.4, cz: hind ? 0.02 : 0, w: w2(bu, bl, 0.5) },
      { y: s.legL + (s.yc - s.legL) * 0.55, rx: r1, rz: r1 * (hind ? 1.6 : 1.25), cz: hind ? -0.01 : 0, w: w1(bu), l: 0 },
      { y: s.yc + s.rh * 0.1, rx: r1 * 1.2, rz: r1 * (hind ? 1.9 : 1.5), w: w2(bu, Q.BODY, 0.5) },
    ], { lod, seg: lod === 0 ? 6 : 3, slot: pts, part, capTop: true, capBottom: true, move: [x, 0, z] });
  }
  // tail
  const tp = sk.pivot[Q.TAIL];
  if (s.fatTail) m.loft([{ y: -s.tailLen, rx: 0.05, rz: 0.03 }, { y: -s.tailLen * 0.55, rx: 0.095, rz: 0.045 }, { y: 0.02, rx: 0.07, rz: 0.04 }], { lod, seg: 5, slot: A, part, w: w1(Q.TAIL), capTop: true, capBottom: true, rot: rotX(-0.25), pivot: [0, 0, 0], move: tp });
  else m.loft([{ y: -s.tailLen, rx: s.tailR * s.tuft * 0.6, rz: s.tailR * s.tuft * 0.6, col: tone(s.tuft > 1.5 ? 0.45 : 1) }, { y: -s.tailLen * 0.8, rx: s.tailR * s.tuft, rz: s.tailR * s.tuft, col: tone(s.tuft > 1.5 ? 0.45 : 1), l: 0 }, { y: -s.tailLen * 0.55, rx: s.tailR, rz: s.tailR, l: 0 }, { y: 0.02, rx: s.tailR * 1.3, rz: s.tailR * 1.3 }],
    { lod, seg: lod === 0 ? 4 : 3, slot: A, part, w: w1(Q.TAIL), capTop: true, capBottom: true, rot: rotX(s.tailUp ? -2.3 : s.tailCurl ? -1.9 : -0.22), pivot: [0, 0, 0], move: tp });
}

function donkeyLoads(m, lod, tones) {
  const s = SPECIES.donkey, top = s.wither, seg = lod === 0 ? 8 : 4;
  // pad: a folded cloth over the back (slot B)
  m.loft([{ c: [0, s.yc + 0.02, 0.26], rx: s.rw * 1.09, rz: s.rh * 1.06 }, { c: [0, s.yc + 0.02, -0.22], rx: s.rw * 1.09, rz: s.rh * 1.06 }].map((r) => ({ ...r, edge: true })),
    { seg: lod === 0 ? 10 : 5, slot: 2, part: QPART.pad, w: w1(Q.BODY), u: [1, 0, 0], v: [0, 1, 0], capTop: true, capBottom: true });
  // two full sacks slung either side
  for (const sd of [-1, 1]) m.loft([
    { y: top - 0.50, rx: 0.09, rz: 0.16 }, { y: top - 0.40, rx: 0.14, rz: 0.24, l: 0 }, { y: top - 0.2, rx: 0.15, rz: 0.26 }, { y: top - 0.04, rx: 0.12, rz: 0.2, l: 0 }, { y: top + 0.05, rx: 0.05, rz: 0.08 },
  ], { lod, seg, slot: 0, part: QPART.sacks, w: w1(Q.BODY), col: tones.sack, capTop: { bulge: 0.02 }, capBottom: { bulge: 0.02 }, rot: rotZ(-sd * 0.22), pivot: [0, top, 0], move: [sd * (s.rw + 0.10), 0, 0.02] });
  if (lod === 0) m.box([0, top + 0.03, 0.02], [0.5, 0.03, 0.05], { slot: 0, part: QPART.sacks, w: w1(Q.BODY), col: tones.rope });
  // two water jars in rope slings
  for (const sd of [-1, 1]) m.loft([
    { y: top - 0.62, rx: 0.04, rz: 0.04 }, { y: top - 0.50, rx: 0.13, rz: 0.13, l: 0 }, { y: top - 0.32, rx: 0.17, rz: 0.17 }, { y: top - 0.14, rx: 0.13, rz: 0.13, l: 0 }, { y: top - 0.05, rx: 0.06, rz: 0.06 }, { y: top - 0.01, rx: 0.08, rz: 0.08, edge: lod === 0 }, { y: top - 0.03, rx: 0.05, rz: 0.05, col: [0.05, 0.04, 0.04] },
  ], { lod, seg, slot: 0, part: QPART.jars, w: w1(Q.BODY), col: tones.pottery, capTop: { col: [0.05, 0.04, 0.04] }, capBottom: true, rot: rotZ(-sd * 0.16), pivot: [0, top, 0], move: [sd * (s.rw + 0.13), 0, 0.02] });
  if (lod === 0) for (const z of [-0.06, 0.1]) m.box([0, top + 0.035, z], [0.56, 0.025, 0.03], { slot: 0, part: QPART.jars, w: w1(Q.BODY), col: tones.rope });
  // a long bundle of reeds across the back
  m.loft([{ c: [0, top + 0.16, 0.95], rx: 0.10, rz: 0.08 }, { c: [0, top + 0.17, 0.3], rx: 0.2, rz: 0.15 }, { c: [0, top + 0.17, -0.5], rx: 0.2, rz: 0.15 }, { c: [0, top + 0.16, -0.95], rx: 0.14, rz: 0.11 }],
    { lod, seg: lod === 0 ? 7 : 4, slot: 0, part: QPART.bundle, w: w1(Q.BODY), col: tones.reed, u: [1, 0, 0], v: [0, 1, 0], capTop: true, capBottom: true });
  if (lod === 0) for (const z of [-0.3, 0.25]) m.loft([{ c: [0, top + 0.17, z + 0.02], rx: 0.21, rz: 0.16, edge: true }, { c: [0, top + 0.17, z - 0.02], rx: 0.21, rz: 0.16, edge: true }], { seg: 7, slot: 0, part: QPART.bundle, w: w1(Q.BODY), col: tones.rope, u: [1, 0, 0], v: [0, 1, 0] });
}

function cat(m, lod) {
  const part = QPART.cat, seg = lod === 0 ? 10 : 4, b = w1(Q.BODY), pale = [1.22, 1.2, 1.15];
  const chest = (th) => (Math.sin(th) < -0.55 ? pale : [1, 1, 1]);                          // a pale chest and belly
  m.loft([{ y: 0, rx: 0.086, rz: 0.116, cz: 0.02 }, { y: 0.06, rx: 0.099, rz: 0.126, cz: 0.02, l: 0 }, { y: 0.14, rx: 0.089, rz: 0.106, cz: 0.005 }, { y: 0.21, rx: 0.066, rz: 0.074, cz: -0.02, l: 0 }, { y: 0.262, rx: 0.044, rz: 0.047, cz: -0.04 }],
    { lod, seg, slot: 1, part, w: b, capTop: true, capBottom: true, col: chest });
  m.loft([{ y: 0.252, rx: 0.038, rz: 0.04, cz: -0.046 }, { y: 0.285, rx: 0.058, rz: 0.06, cz: -0.052, l: 0 }, { y: 0.315, rx: 0.061, rz: 0.062, cz: -0.054, f: (th) => (Math.sin(th) < -0.85 ? 1.16 : 1), col: (th) => (Math.sin(th) < -0.85 ? pale : [1, 1, 1]) }, { y: 0.347, rx: 0.048, rz: 0.05, cz: -0.05 }],
    { lod, seg, slot: 1, part, w: w1(Q.HEAD), capTop: { bulge: 0.014 }, capBottom: true });
  for (const sd of [-1, 1]) {
    m.loft([{ y: 0.343, rx: 0.019, rz: 0.011 }, { y: 0.392, rx: 0.002, rz: 0.002 }], { seg: 4, slot: 1, part, w: w1(Q.HEAD), capTop: true, capBottom: true, col: [0.75, 0.72, 0.7], move: [sd * 0.034, 0, -0.046] });
    m.loft([{ y: 0, rx: 0.02, rz: 0.026, cz: -0.006 }, { y: 0.03, rx: 0.016, rz: 0.017 }, { y: 0.17, rx: 0.018, rz: 0.02 }], { lod, seg: lod === 0 ? 6 : 4, slot: 1, part, w: b, capTop: true, capBottom: true, col: pale, move: [sd * 0.032, 0, -0.092] });   // forelegs
    if (lod === 0) m.loft([{ c: [sd * 0.088, 0.024, 0.03], rx: 0.03, rz: 0.024 }, { c: [sd * 0.088, 0.02, -0.07], rx: 0.02, rz: 0.018 }], { seg: 5, slot: 1, part, w: b, capTop: true, capBottom: true, u: [1, 0, 0], v: [0, 1, 0] });   // hind paws
  }
  // tail laid round the right side
  const pts = [[0.02, 0.03, 0.11], [0.105, 0.026, 0.095], [0.15, 0.024, 0.0], [0.125, 0.022, -0.1]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1], d = [c[0] - a[0], 0, c[2] - a[2]], l = Math.hypot(d[0], d[2]), yaw = Math.atan2(d[0], d[2]);
    m.loft([{ y: -0.01, rx: 0.02, rz: 0.02 }, { y: l + 0.012, rx: 0.017 - i * 0.002, rz: 0.017 - i * 0.002 }], { seg: lod === 0 ? 5 : 3, slot: 1, part, w: w1(Q.TAIL), capTop: { bulge: 0.01 }, capBottom: true, rot: mul3([Math.cos(yaw), 0, Math.sin(yaw), 0, 1, 0, -Math.sin(yaw), 0, Math.cos(yaw)], rotX(Math.PI / 2)), pivot: [0, 0, 0], move: a });
  }
}

/** All quadrupeds in one buffer. tones: { sack, pottery, reed, rope, horn } (linear rgb). */
export function buildQuadrupeds(lod, tones) {
  const m = new Buf();
  for (const k in SPECIES) quadruped(m, SPECIES[k], lod, tones);
  donkeyLoads(m, lod, tones);
  cat(m, lod);
  return m;
}

// ---- poses ---------------------------------------------------------------------------------------------------
const TRI_N = Math.asin(0.92);
const tri = (phi) => Math.asin(0.92 * Math.sin(phi)) / TRI_N;
export const quadStride = (s, scale = 1) => 4 * s.leg * s.amp * 0.92 * scale;

/** A four-beat walk: left hind, left fore, right hind, right fore. */
export function poseQuadWalk(P, phi, s, time = 0, seed = 0) {
  clearPose(P);
  const legs = [[Q.HLU, Q.HLL, phi, 0.75], [Q.FLU, Q.FLL, phi - Math.PI / 2, 1], [Q.HRU, Q.HRL, phi + Math.PI, 0.75], [Q.FRU, Q.FRL, phi + Math.PI / 2, 1]];
  for (const [u, l, p, k] of legs) {
    const sw = Math.pow(Math.max(0, Math.cos(p)), 1.5);
    P.rx[u] = s.amp * tri(p) + 0.18 * sw * k; P.rx[l] = -0.85 * sw * k;
  }
  P.py = 0.008 * Math.sin(2 * phi); P.rx[Q.NECK] = 0.05 * Math.sin(2 * phi + 0.8); P.rx[Q.HEAD] = -0.04 * Math.sin(2 * phi + 0.8);
  P.rz[Q.TAIL] = 0.28 * Math.sin(time * 2.3 + seed * 6.28); P.ry[Q.BODY] = 0.02 * Math.sin(phi);
  return P;
}
/** Standing; graze 0..1 lowers the head to the ground. */
export function poseQuadStand(P, time, seed, s, graze = 0) {
  clearPose(P);
  const a = seed * 6.283, g = graze * (0.85 + 0.15 * Math.sin(time * 0.9 + a));
  P.rx[Q.NECK] = -1.25 * g + 0.04 * Math.sin(time * 0.6 + a); P.rx[Q.HEAD] = -0.35 * g; P.ry[Q.NECK] = (1 - graze) * 0.3 * Math.sin(time * 0.35 + a * 1.3);
  P.rz[Q.TAIL] = 0.3 * Math.sin(time * 2.1 + a); P.rx[Q.FLU] = 0.04; P.rx[Q.HRU] = -0.05;
  if (s && s.name === 'cat') { P.ry[Q.HEAD] = 0.5 * Math.sin(time * 0.5 + a); P.ry[Q.TAIL] = 0.25 * Math.sin(time * 1.6 + a); P.rx[Q.NECK] = 0; P.ry[Q.NECK] = 0; P.rz[Q.TAIL] = 0; }
  return P;
}

// =================================================================================================================
// Birds: one body at pigeon size (0.33 m long, 0.66 m span); herons, kites, ducks and swallows are sizes of it.
// =================================================================================================================
export const BD = { BODY: 0, WING_L: 1, WING_R: 2, TIP_L: 3, TIP_R: 4, NECK: 5, LEGS: 6 };
export const BPART = { spread: 0, folded: 1, heronNeck: 2, heronLegs: 3 };
export const bbit = (...names) => names.reduce((m, n) => m + (1 << BPART[n]), 0);
export const BSKEL = { n: 7, parent: [-1, 0, 0, 1, 2, 0, 0], roll0: null, pivot: [[0, 0, 0], [-0.03, 0.015, -0.02], [0.03, 0.015, -0.02], [-0.17, 0.015, -0.01], [0.17, 0.015, -0.01], [0, 0.01, -0.09], [0, -0.03, 0.03]] };

export function buildBird() {
  const m = new Buf(), b = w1(BD.BODY), dark = [0.45, 0.45, 0.45], bill = [0.75, 0.6, 0.3];
  // body: tail fan to bill (rings in x / y, advancing toward -z)
  m.loft([
    { c: [0, 0.004, 0.175], rx: 0.055, rz: 0.004, col: dark }, { c: [0, 0.006, 0.09], rx: 0.03, rz: 0.018 }, { c: [0, 0, 0.03], rx: 0.045, rz: 0.04 }, { c: [0, -0.002, -0.045], rx: 0.05, rz: 0.048 },
    { c: [0, 0.006, -0.105], rx: 0.034, rz: 0.035 }, { c: [0, 0.02, -0.145], rx: 0.026, rz: 0.028 }, { c: [0, 0.018, -0.168], rx: 0.011, rz: 0.012, slot: 0, col: bill }, { c: [0, 0.014, -0.195], rx: 0.003, rz: 0.003, slot: 0, col: bill },
  ], { seg: 6, slot: 1, w: b, u: [1, 0, 0], v: [0, 1, 0], capTop: true, capBottom: true });
  // spread wings: rings in z (chord) / y (thickness), advancing toward +x; built for the left wing (tip first), mirrored
  const v0 = m.count, i0 = m.idx.length, ax = { u: [0, 0, 1], v: [0, 1, 0] };
  m.loft([
    { c: [-0.335, 0.015, 0.05], rx: 0.012, rz: 0.003, w: w1(BD.TIP_L), col: dark },
    { c: [-0.26, 0.015, 0.025], rx: 0.05, rz: 0.005, w: w1(BD.TIP_L), col: [0.7, 0.7, 0.7] },
    { c: [-0.17, 0.015, 0.008], rx: 0.062, rz: 0.008, w: w2(BD.TIP_L, BD.WING_L, 0.5) },
    { c: [-0.03, 0.015, 0.0], rx: 0.06, rz: 0.012, w: w1(BD.WING_L) },
    { c: [0.0, 0.012, 0.0], rx: 0.04, rz: 0.01, w: b },
  ], { seg: 4, th0: 0, slot: 1, part: BPART.spread, capTop: true, capBottom: true, ...ax });
  // folded wing against the flank
  m.loft([{ c: [-0.048, 0.012, 0.12], rx: 0.008, rz: 0.01, col: dark }, { c: [-0.05, 0.012, 0.03], rx: 0.012, rz: 0.03, col: [0.8, 0.8, 0.8] }, { c: [-0.046, 0.014, -0.06], rx: 0.01, rz: 0.028 }],
    { seg: 4, slot: 1, part: BPART.folded, w: b, u: [1, 0, 0], v: [0, 1, 0], capTop: true, capBottom: true });
  // heron leg
  m.loft([{ y: -0.2, rx: 0.003, rz: 0.003 }, { y: 0, rx: 0.004, rz: 0.004 }], { seg: 3, slot: 0, part: BPART.heronLegs, w: w1(BD.LEGS), col: [0.35, 0.33, 0.25], capTop: true, capBottom: true, move: [-0.018, -0.03, 0.03] });
  m.mirror(v0, i0, { 1: 2, 2: 1, 3: 4, 4: 3 });
  // heron neck and head, raised
  m.loft([{ y: -0.02, rx: 0.022, rz: 0.024 }, { y: 0.07, rx: 0.011, rz: 0.012 }, { y: 0.15, rx: 0.009, rz: 0.01 }, { y: 0.17, rx: 0.014, rz: 0.016 }, { y: 0.19, rx: 0.009, rz: 0.01 }],
    { seg: 5, slot: 1, part: BPART.heronNeck, w: w1(BD.NECK), capTop: true, capBottom: true, rot: rotX(-0.45), pivot: [0, 0, 0], move: [0, 0.01, -0.09], col: [1.1, 1.1, 1.1] });
  m.loft([{ y: 0, rx: 0.006, rz: 0.007 }, { y: 0.075, rx: 0.0015, rz: 0.0015 }], { seg: 4, slot: 0, part: BPART.heronNeck, w: w1(BD.NECK), col: bill, capTop: true, capBottom: true, rot: rotX(-1.75), pivot: [0, 0, 0], move: [0, 0.01 + Math.cos(0.45) * 0.178, -0.09 - Math.sin(0.45) * 0.178 - 0.008] });
  return m;
}

/** Flapping flight: flap in radians (positive = wings up), bank about the body's long axis. */
export function poseBirdFly(P, flap, bank = 0, tuck = 0) {
  clearPose(P);
  P.rz[BD.WING_R] = flap; P.rz[BD.WING_L] = -flap; P.rz[BD.TIP_R] = flap * 0.55 - 0.1; P.rz[BD.TIP_L] = -(flap * 0.55 - 0.1);
  P.rz[BD.BODY] = bank;
  P.rx[BD.LEGS] = -1.45; P.rx[BD.NECK] = -0.75 * tuck;
  return P;
}
export function poseBirdStand(P, time, seed) {
  clearPose(P);
  P.rx[BD.NECK] = 0.25 + 0.12 * Math.sin(time * 0.4 + seed * 6.28); P.ry[BD.NECK] = 0.4 * Math.sin(time * 0.3 + seed * 9.1);
  return P;
}
