// js/modules/people/human.js — the human figure: skeleton, mesh in three levels of detail, poses.
// Reference figure 1.70 m tall, facing local -z, right hand at +x. Dress after R5 2.5 / 3.3: belted tunic to the
// knee or the ankle, fringed wrap over one shoulder, long hair held by a band or a soft cap, full beard; women in
// a long garment with a head cloth; priests shaven in white linen; soldiers with a pointed cap, lance and wicker
// shield. Parts are switched per instance (PART bits), colours come from four instance colours (slots).
import { Buf, rotX, rotZ, mul3 } from './meshkit.js';
import { NB, clearPose } from './rig.js';

export const B = { PELVIS: 0, SPINE: 1, CHEST: 2, HEAD: 3, ARM_L: 4, FORE_L: 5, HAND_L: 6, ARM_R: 7, FORE_R: 8, HAND_R: 9, THIGH_L: 10, SHIN_L: 11, FOOT_L: 12, THIGH_R: 13, SHIN_R: 14, FOOT_R: 15 };
export const PART = { skirtShort: 0, skirtLong: 1, skirtSeat: 2, beard: 3, hairLong: 4, hairShort: 5, headband: 6, cap: 7, helmet: 8, veil: 9, mantle: 10, staff: 11, spear: 12, shield: 13, jarHead: 14, sack: 15, basketHead: 16, standard: 17, lyre: 18, drum: 19, pipes: 20, pole: 21, lamp: 22 };
export const bit = (...names) => names.reduce((m, n) => m + (1 << PART[n]), 0);
export const SLOT = { BAKED: 0, A: 1, B: 2, SKIN: 3, HAIR: 4, TOP: 5, WRAP: 6 };

const A_POSE = 12 * Math.PI / 180;
const SH = [0.172, 1.395, 0];                               // right shoulder
const armPoint = (d, side) => [side * (SH[0] + Math.sin(A_POSE) * d), SH[1] - Math.cos(A_POSE) * d, 0];
export const SKEL = {
  n: 16,
  parent: [-1, 0, 1, 2, 2, 4, 5, 2, 7, 8, 0, 10, 11, 0, 13, 14],
  pivot: [
    [0, 0.92, 0], [0, 1.04, 0], [0, 1.24, 0], [0, 1.46, 0.008],
    armPoint(0, -1), armPoint(0.30, -1), armPoint(0.56, -1),
    armPoint(0, 1), armPoint(0.30, 1), armPoint(0.56, 1),
    [-0.09, 0.90, 0], [-0.09, 0.49, 0], [-0.09, 0.075, 0],
    [0.09, 0.90, 0], [0.09, 0.49, 0], [0.09, 0.075, 0],
  ],
  roll0: (() => { const a = new Float32Array(NB); a[4] = A_POSE; a[7] = -A_POSE; return a; })(),   // pose roll 0 = the arm hangs straight down
};
/** Rest position of the grip of the right / left hand (0.65 m down the arm). */
export const GRIP_R = armPoint(0.655, 1), GRIP_L = armPoint(0.655, -1);
const MIRROR = { 4: 7, 5: 8, 6: 9, 7: 4, 8: 5, 9: 6, 10: 13, 11: 14, 12: 15, 13: 10, 14: 11, 15: 12 };

/**
 * Build the figure. lod 0: about 4,900 triangles with every part (a dressed figure uses about half); 1: about 1,300;
 * 2: about 420; 3: about 90.
 * tones: linear [r, g, b] for the baked parts { wood, pottery, potteryPale, bronze, reed, gold, leather, sack, dates, wick }.
 */
export function buildHuman(lod, tones) {
  const m = new Buf();
  if (lod === 2) return buildFar(tones);
  if (lod === 3) return buildSpeck(tones);
  const T = [14, 6, 5][lod], L = [8, 4, 3][lod], Hs = [14, 6, 4][lod];
  const w = (b0, b1 = b0, k = 1) => [b0, b1, k];
  const skin = [1, 1, 1];
  const o = (extra) => ({ lod, ...extra });

  // ---- torso (upper garment: slot TOP) ----------------------------------------------------------------------
  m.loft([
    { y: 0.84, rx: 0.160, rz: 0.110, w: w(B.PELVIS) },
    { y: 0.93, rx: 0.172, rz: 0.122, cz: 0.005, w: w(B.PELVIS), l: 0 },
    { y: 1.03, rx: 0.150, rz: 0.108, w: w(B.PELVIS, B.SPINE, 0.5) },
    { y: 1.13, rx: 0.156, rz: 0.112, cz: -0.005, w: w(B.SPINE), l: 0 },
    { y: 1.24, rx: 0.176, rz: 0.125, cz: -0.012, w: w(B.SPINE, B.CHEST, 0.5) },
    { y: 1.33, rx: 0.178, rz: 0.122, cz: -0.010, w: w(B.CHEST), l: 0 },
    { y: 1.385, rx: 0.176, rz: 0.108, cz: -0.002, w: w(B.CHEST) },
    { y: 1.415, rx: 0.150, rz: 0.098, cz: 0.002, w: w(B.CHEST), l: 0 },
    { y: 1.440, rx: 0.100, rz: 0.078, cz: 0.004, w: w(B.CHEST), l: 1 },
    { y: 1.458, rx: 0.060, rz: 0.058, cz: 0.006, w: w(B.CHEST), col: [0.8, 0.8, 0.8] },
  ], o({ seg: T, slot: SLOT.TOP, capTop: true, capBottom: true }));
  // belt / sash
  if (lod < 2) m.loft([
    { y: 1.005, rx: 0.160, rz: 0.118, w: w(B.PELVIS, B.SPINE, 0.6), edge: true },
    { y: 1.065, rx: 0.160, rz: 0.118, cz: -0.002, w: w(B.PELVIS, B.SPINE, 0.4), edge: true },
  ], o({ seg: T, slot: SLOT.B, capTop: true, capBottom: true }));

  // ---- skirts (slot A) --------------------------------------------------------------------------------------
  const legW = (shin) => (th, x, y) => {
    const side = Math.min(1, Math.max(0, (Math.abs(x) - 0.02) / 0.09)), s = side * side * (3 - 2 * side);
    if (y >= 0.5) { const d = Math.min(1, Math.max(0, (0.97 - y) / 0.45)); return [x < 0 ? B.THIGH_L : B.THIGH_R, B.PELVIS, 0.84 * d * s]; }
    return [x < 0 ? (shin ? B.SHIN_L : B.THIGH_L) : (shin ? B.SHIN_R : B.THIGH_R), B.PELVIS, 0.84 * s];
  };
  const dark = [0.32, 0.3, 0.3];
  m.loft([
    { y: 0.52, rx: 0.170, rz: 0.128, w: legW(false), col: dark },
    { y: 0.515, rx: 0.200, rz: 0.156, w: legW(false), slot: lod === 0 ? SLOT.B : SLOT.A, edge: true },
    { y: 0.555, rx: 0.199, rz: 0.155, w: legW(false), slot: SLOT.B, slotUp: SLOT.A, edge: true, l: 0 },
    { y: 0.65, rx: 0.197, rz: 0.151, w: legW(false), l: 0 },
    { y: 0.80, rx: 0.191, rz: 0.143, w: legW(false), l: 0 },
    { y: 0.93, rx: 0.181, rz: 0.131, cz: 0.005, w: legW(false) },
    { y: 1.02, rx: 0.159, rz: 0.117, w: w(B.PELVIS) },
  ], o({ seg: T, slot: SLOT.A, part: PART.skirtShort, capBottom: { col: dark }, capTop: true }));
  m.loft([
    { y: 0.115, rx: 0.185, rz: 0.150, w: legW(true), col: dark },
    { y: 0.105, rx: 0.212, rz: 0.172, w: legW(true), slot: lod === 0 ? SLOT.B : SLOT.A, edge: true },
    { y: 0.155, rx: 0.210, rz: 0.170, w: legW(true), slot: SLOT.B, slotUp: SLOT.A, edge: true, l: 0 },
    { y: 0.20, rx: 0.208, rz: 0.168, w: legW(true), col: [0.93, 0.93, 0.93], l: 0 },
    { y: 0.36, rx: 0.203, rz: 0.162, w: legW(true), l: 0 },
    { y: 0.55, rx: 0.198, rz: 0.155, w: legW(false), l: 0 },
    { y: 0.75, rx: 0.193, rz: 0.146, w: legW(false), l: 1 },
    { y: 0.93, rx: 0.183, rz: 0.133, cz: 0.005, w: legW(false) },
    { y: 1.02, rx: 0.160, rz: 0.118, w: w(B.PELVIS) },
  ], o({ seg: T, slot: SLOT.A, part: PART.skirtLong, capBottom: { col: dark }, capTop: true }));
  // the lap of a long garment over crossed legs (pelvis 0.185 above the floor: the floor is y 0.735 in the rest pose)
  m.loft([
    { y: 0.74, rx: 0.40, rz: 0.30, cz: -0.17, w: w(B.PELVIS), col: [0.8, 0.8, 0.8] },
    { y: 0.80, rx: 0.40, rz: 0.295, cz: -0.17, w: w(B.PELVIS), l: 0 },
    { y: 0.875, rx: 0.33, rz: 0.235, cz: -0.12, w: w(B.PELVIS) },
    { y: 0.95, rx: 0.205, rz: 0.15, cz: -0.03, w: w(B.PELVIS), l: 0 },
    { y: 1.02, rx: 0.160, rz: 0.118, w: w(B.PELVIS) },
  ], o({ seg: T, slot: SLOT.A, part: PART.skirtSeat, capBottom: true, capTop: true }));

  // ---- neck and head (skin) ---------------------------------------------------------------------------------
  m.loft([
    { y: 1.425, rx: 0.052, rz: 0.052, cz: 0.006, w: w(B.CHEST) },
    { y: 1.47, rx: 0.047, rz: 0.048, cz: 0.004, w: w(B.HEAD, B.CHEST, 0.5) },
    { y: 1.52, rx: 0.048, rz: 0.05, cz: 0.012, w: w(B.HEAD) },
  ], o({ seg: L, slot: SLOT.SKIN, capTop: true, capBottom: true }));
  const fromFront = (th) => Math.abs(Math.atan2(Math.sin(th - 1.5 * Math.PI), Math.cos(th - 1.5 * Math.PI)));
  /** radial factor k within `half` radians of the front, 1 elsewhere (a shell that dives inside the face) */
  const pull = (half, k) => (th) => { const a = fromFront(th); return a < half ? k : a < half + 0.3 ? k + (1 - k) * (a - half) / 0.3 : 1; };
  if (lod === 0) {
    // the face: ring angles crowd toward the front, so there is a nose 3 cm wide, eyes, a mouth
    const offs = [-157, -130, -102, -75, -52, -34, -20, -9, 0, 9, 20, 34, 52, 75, 102, 130, 157, 180];
    const angles = offs.map((d) => (270 + d) * Math.PI / 180);
    const at = (map, dflt = 1) => (th, k) => { const d = Math.abs(offs[k]); return map[d] !== undefined ? map[d] : dflt; };
    const lip = [0.78, 0.56, 0.52], lipLine = [0.5, 0.34, 0.32], eye = [0.16, 0.13, 0.12], brow = [0.42, 0.36, 0.33], lid = [0.82, 0.78, 0.76];
    const colAt = (map) => (th, k) => { const d = Math.abs(offs[k]); return map[d] || skin; };
    m.loft([
      { y: 1.474, rx: 0.024, rz: 0.028, cz: -0.050 },
      { y: 1.490, rx: 0.044, rz: 0.052, cz: -0.032 },
      { y: 1.508, rx: 0.054, rz: 0.066, cz: -0.022, f: at({ 0: 1.03, 9: 1.02 }), col: colAt({ 0: lip, 9: lip }) },
      { y: 1.521, rx: 0.060, rz: 0.074, cz: -0.016, f: at({ 0: 0.985, 9: 0.985 }), col: colAt({ 0: lipLine, 9: lipLine, 20: [0.9, 0.84, 0.82] }) },
      { y: 1.534, rx: 0.064, rz: 0.080, cz: -0.012, f: at({ 0: 1.035, 9: 1.02 }), col: colAt({ 0: lip, 9: lip }) },
      { y: 1.551, rx: 0.068, rz: 0.087, cz: -0.008, f: at({ 0: 1.09, 9: 1.035 }), col: colAt({ 0: [0.8, 0.74, 0.72], 9: [0.86, 0.8, 0.78] }) },
      { y: 1.566, rx: 0.071, rz: 0.091, cz: -0.005, f: at({ 0: 1.25, 9: 1.07 }) },
      { y: 1.590, rx: 0.0735, rz: 0.0935, cz: -0.002, f: at({ 0: 1.14, 9: 0.995 }) },
      { y: 1.612, rx: 0.0745, rz: 0.095, f: at({ 0: 1.07, 9: 0.975, 20: 0.95, 34: 0.975 }), col: colAt({ 20: eye, 9: lid, 34: lid }) },
      { y: 1.629, rx: 0.0745, rz: 0.095, cz: 0.001, f: at({ 0: 1.04, 9: 1.025, 20: 1.03, 34: 1.02 }), col: colAt({ 9: [0.7, 0.64, 0.62], 20: brow, 34: brow }) },
      { y: 1.646, rx: 0.073, rz: 0.093, cz: 0.002 },
      { y: 1.668, rx: 0.068, rz: 0.087, cz: 0.003 },
      { y: 1.688, rx: 0.050, rz: 0.066, cz: 0.005 },
      { y: 1.699, rx: 0.028, rz: 0.036, cz: 0.005 },
    ], { angles, slot: SLOT.SKIN, w: w(B.HEAD), capTop: { bulge: 0.004 }, capBottom: true });
    for (const s of [-1, 1]) m.loft([                                                    // ears
      { c: [s * 0.070, 1.585, 0.012], rx: 0.012, rz: 0.006 }, { c: [s * 0.078, 1.605, 0.016], rx: 0.016, rz: 0.007 }, { c: [s * 0.076, 1.628, 0.018], rx: 0.010, rz: 0.006 },
    ], { seg: 4, slot: SLOT.SKIN, w: w(B.HEAD), capTop: true, capBottom: true, u: [0, 0, 1], v: [-s, 0, 0], flip: s < 0, col: [0.9, 0.85, 0.85] });
  } else if (lod === 1) {
    const fk = 6;                                                                        // 8 segments from angle 0: vertex 6 is the centre front
    m.loft([
      { y: 1.474, rx: 0.022, rz: 0.026, cz: -0.050 },
      { y: 1.520, rx: 0.060, rz: 0.074, cz: -0.016 },
      { y: 1.570, rx: 0.072, rz: 0.092, cz: -0.004, f: (th, k) => (k === fk ? 1.16 : 1) },
      { y: 1.615, rx: 0.0745, rz: 0.095, col: (th, k) => (k === fk - 1 || k === fk + 1 ? [0.62, 0.56, 0.54] : skin) },
      { y: 1.660, rx: 0.070, rz: 0.090, cz: 0.003 },
      { y: 1.690, rx: 0.050, rz: 0.066, cz: 0.005 },
    ], { seg: Hs, th0: 0, slot: SLOT.SKIN, w: w(B.HEAD), capTop: { bulge: 0.008 }, capBottom: true });
  } else {
    m.loft([{ y: 1.48, rx: 0.062, rz: 0.075, cz: -0.012 }, { y: 1.60, rx: 0.078, rz: 0.095 }, { y: 1.69, rx: 0.058, rz: 0.072, cz: 0.004 }], o({ seg: Hs, slot: SLOT.SKIN, w: w(B.HEAD), capTop: true, capBottom: true }));
  }

  // ---- hair, beard, head gear -------------------------------------------------------------------------------
  m.loft([
    { y: 1.410, rx: 0.070, rz: 0.045, cz: 0.056, w: w(B.HEAD, B.CHEST, 0.5) },
    { y: 1.440, rx: 0.092, rz: 0.066, cz: 0.052, w: w(B.HEAD, B.CHEST, 0.6), l: 0 },
    { y: 1.490, rx: 0.096, rz: 0.076, cz: 0.046 },
    { y: 1.550, rx: 0.089, rz: 0.083, cz: 0.036, l: 0 },
    { y: 1.610, rx: 0.084, rz: 0.088, cz: 0.024 },
    { y: 1.650, rx: 0.0785, rz: 0.092, cz: 0.014, f: pull(1.0, 0.72), l: 0 },
    { y: 1.682, rx: 0.066, rz: 0.086, cz: 0.012 },
    { y: 1.702, rx: 0.042, rz: 0.054, cz: 0.008, l: 0 },
  ], o({ seg: Hs, slot: SLOT.HAIR, part: PART.hairLong, w: w(B.HEAD), capTop: { bulge: 0.008 }, capBottom: true }));
  if (lod < 2) m.loft([
    { y: 1.535, rx: 0.058, rz: 0.058, cz: 0.032 },
    { y: 1.565, rx: 0.075, rz: 0.081, cz: 0.026 },
    { y: 1.610, rx: 0.0795, rz: 0.090, cz: 0.018 },
    { y: 1.650, rx: 0.078, rz: 0.0935, cz: 0.012, f: pull(1.0, 0.72) },
    { y: 1.682, rx: 0.066, rz: 0.086, cz: 0.010 },
    { y: 1.702, rx: 0.042, rz: 0.054, cz: 0.006, l: 0 },
  ], o({ seg: Hs, slot: SLOT.HAIR, part: PART.hairShort, w: w(B.HEAD), capTop: { bulge: 0.007 }, capBottom: true }));
  m.loft([
    { y: 1.385, rx: 0.040, rz: 0.030, cz: -0.060, col: [0.8, 0.8, 0.8] },
    { y: 1.420, rx: 0.054, rz: 0.046, cz: -0.052, l: 0 },
    { y: 1.470, rx: 0.064, rz: 0.058, cz: -0.046 },
    { y: 1.515, rx: 0.070, rz: 0.064, cz: -0.042, l: 0 },
    { y: 1.555, rx: 0.072, rz: 0.062, cz: -0.040 },
    { y: 1.585, rx: 0.060, rz: 0.050, cz: -0.040, l: 0 },
  ], o({ seg: lod === 0 ? 10 : Hs, slot: SLOT.HAIR, part: PART.beard, w: w(B.HEAD), capTop: true, capBottom: true }));
  if (lod < 2) {
    m.loft([
      { y: 1.640, rx: 0.0835, rz: 0.0975, cz: 0.012, edge: true }, { y: 1.664, rx: 0.0825, rz: 0.097, cz: 0.012, edge: true },
    ], o({ seg: Hs, slot: SLOT.B, part: PART.headband, w: w(B.HEAD), capTop: true, capBottom: true }));
    m.loft([
      { y: 1.640, rx: 0.084, rz: 0.100, cz: 0.008, edge: true },
      { y: 1.668, rx: 0.087, rz: 0.102, cz: 0.008 },
      { y: 1.712, rx: 0.078, rz: 0.090, cz: 0.008, l: 0 },
      { y: 1.745, rx: 0.050, rz: 0.058, cz: 0.008 },
    ], o({ seg: Hs, slot: SLOT.B, part: PART.cap, w: w(B.HEAD), capTop: { bulge: 0.016 }, capBottom: true }));
  }
  m.loft([
    { y: 1.625, rx: 0.085, rz: 0.102, cz: 0.006, edge: lod === 0 },
    { y: 1.665, rx: 0.086, rz: 0.101, cz: 0.006, l: 0 },
    { y: 1.725, rx: 0.066, rz: 0.078, cz: 0.006, l: 1 },
    { y: 1.785, rx: 0.028, rz: 0.032, cz: 0.006 },
  ], o({ seg: Hs, slot: SLOT.B, part: PART.helmet, w: w(B.HEAD), capTop: { bulge: 0.035 }, capBottom: true }));
  m.loft([
    { y: 1.100, rx: 0.220, rz: 0.136, cz: 0.055, w: w(B.SPINE), col: [0.82, 0.82, 0.82], edge: lod === 0 },
    { y: 1.180, rx: 0.234, rz: 0.140, cz: 0.050, w: w(B.SPINE, B.CHEST, 0.5), l: 0 },
    { y: 1.300, rx: 0.238, rz: 0.135, cz: 0.045, w: w(B.CHEST) },
    { y: 1.400, rx: 0.228, rz: 0.118, cz: 0.040, w: w(B.CHEST), l: 0 },
    { y: 1.440, rx: 0.200, rz: 0.105, cz: 0.040, w: w(B.CHEST), l: 0 },
    { y: 1.475, rx: 0.115, rz: 0.086, cz: 0.040, w: w(B.HEAD, B.CHEST, 0.5) },
    { y: 1.530, rx: 0.096, rz: 0.088, cz: 0.036, w: w(B.HEAD), l: 0 },
    { y: 1.600, rx: 0.090, rz: 0.094, cz: 0.026, w: w(B.HEAD), f: pull(0.95, 0.7) },
    { y: 1.652, rx: 0.085, rz: 0.104, cz: 0.010, w: w(B.HEAD), l: 0 },
    { y: 1.684, rx: 0.070, rz: 0.088, cz: 0.008, w: w(B.HEAD) },
    { y: 1.706, rx: 0.046, rz: 0.058, cz: 0.006, w: w(B.HEAD), l: 0 },
  ], o({ seg: T, slot: SLOT.WRAP, part: PART.veil, capTop: { bulge: 0.008 }, capBottom: { col: dark } }));
  // the wrap: over the left shoulder, under the right arm, fringed hem above the knee
  if (lod < 2) {
    const mw = (th, x, y) => (y > 1.2 ? w(B.CHEST) : y > 1.0 ? w(B.SPINE, B.CHEST, 0.6) : y > 0.86 ? w(B.PELVIS, B.SPINE, 0.7) : legW(false)(th, x, y));
    m.loft([
      { y: 0.60, rx: 0.200, rz: 0.150, w: mw, slot: lod === 0 ? SLOT.B : SLOT.WRAP, col: dark },
      { y: 0.585, rx: 0.226, rz: 0.176, w: mw, slot: lod === 0 ? SLOT.B : SLOT.WRAP, col: [0.8, 0.8, 0.8], edge: true },
      { y: 0.635, rx: 0.224, rz: 0.174, w: mw, slot: SLOT.B, slotUp: SLOT.WRAP, l: 0, edge: true },
      { y: 0.655, rx: 0.223, rz: 0.173, w: mw, l: 0 },
      { y: 0.78, rx: 0.217, rz: 0.166, w: mw, l: 0 },
      { y: 0.92, rx: 0.208, rz: 0.154, cz: 0.004, w: mw },
      { y: 1.05, rx: 0.196, rz: 0.142, cx: -0.008, w: mw, tilt: -0.10, l: 0 },
      { y: 1.19, rx: 0.200, rz: 0.146, cx: -0.014, cz: -0.006, w: mw, tilt: -0.30 },
      { y: 1.325, rx: 0.203, rz: 0.140, cx: -0.018, cz: -0.004, w: mw, tilt: -0.56, col: [0.75, 0.75, 0.75] },
      { y: 1.350, rx: 0.160, rz: 0.104, cx: -0.018, w: mw, tilt: -0.56, col: [0.7, 0.7, 0.7] },
    ], o({ seg: T, slot: SLOT.WRAP, part: PART.mantle, capTop: true, capBottom: { col: dark } }));
  }

  // ---- left arm, mirrored for the right -----------------------------------------------------------------
  const v0 = m.count, i0 = m.idx.length;
  const armXf = { rot: rotZ(-A_POSE), pivot: [0, 0, 0], move: [-SH[0], SH[1], 0] };
  m.loft([
    { y: -0.742, rx: 0.008, rz: 0.020, w: w(B.HAND_L), l: 0 },
    { y: -0.725, rx: 0.011, rz: 0.028, w: w(B.HAND_L), l: 0 },
    { y: -0.675, rx: 0.014, rz: 0.041, w: w(B.HAND_L), l: 0 },
    { y: -0.615, rx: 0.016, rz: 0.040, w: w(B.HAND_L) },
    { y: -0.575, rx: 0.021, rz: 0.030, w: w(B.HAND_L), l: 0 },
    { y: -0.555, rx: 0.026, rz: 0.028, w: w(B.FORE_L, B.HAND_L, 0.5) },
    { y: -0.49, rx: 0.031, rz: 0.033, w: w(B.FORE_L), l: 0 },
    { y: -0.39, rx: 0.040, rz: 0.042, cz: -0.002, w: w(B.FORE_L), l: 0 },
    { y: -0.33, rx: 0.040, rz: 0.041, w: w(B.FORE_L), l: 0 },
    { y: -0.30, rx: 0.039, rz: 0.040, w: w(B.ARM_L, B.FORE_L, 0.5) },
    { y: -0.21, rx: 0.040, rz: 0.043, w: w(B.ARM_L), l: 0 },
    { y: -0.10, rx: 0.042, rz: 0.045, w: w(B.ARM_L) },
  ], o({ seg: L, slot: SLOT.SKIN, capTop: { bulge: 0.004 }, capBottom: true, ...armXf }));
  if (lod === 0) m.loft([                                                                // thumb
    { c: [0.004, -0.665, -0.052], rx: 0.008, rz: 0.008 }, { c: [0.002, -0.63, -0.046], rx: 0.011, rz: 0.011 }, { c: [0, -0.595, -0.03], rx: 0.012, rz: 0.012 },
  ], { seg: 4, slot: SLOT.SKIN, w: w(B.HAND_L), capTop: true, capBottom: true, ...armXf });
  if (lod < 2) m.loft([                                                                  // sleeve
    { y: -0.235, rx: 0.039, rz: 0.042, w: w(B.ARM_L), col: dark },
    { y: -0.242, rx: 0.0455, rz: 0.0485, w: w(B.ARM_L), col: [0.88, 0.88, 0.88], edge: lod === 0 },
    { y: -0.16, rx: 0.048, rz: 0.052, w: w(B.ARM_L), l: 0 },
    { y: -0.07, rx: 0.053, rz: 0.057, w: w(B.ARM_L, B.CHEST, 0.85) },
    { y: -0.005, rx: 0.056, rz: 0.059, w: w(B.ARM_L, B.CHEST, 0.6) },
    { y: 0.02, rx: 0.046, rz: 0.050, w: w(B.ARM_L, B.CHEST, 0.3), l: 0 },
    { y: 0.034, rx: 0.024, rz: 0.027, w: w(B.CHEST) },
  ], o({ seg: L, slot: SLOT.TOP, capTop: { bulge: 0.004 }, capBottom: { col: dark }, ...armXf }));
  // left leg and foot
  m.loft([
    { y: 0.075, rx: 0.033, rz: 0.035, w: w(B.SHIN_L, B.FOOT_L, 0.5) },
    { y: 0.12, rx: 0.034, rz: 0.036, w: w(B.SHIN_L), l: 0 },
    { y: 0.26, rx: 0.043, rz: 0.046, cz: 0.005, w: w(B.SHIN_L), l: 0 },
    { y: 0.41, rx: 0.054, rz: 0.058, cz: 0.010, w: w(B.SHIN_L), l: 0 },
    { y: 0.49, rx: 0.052, rz: 0.055, cz: -0.004, w: w(B.THIGH_L, B.SHIN_L, 0.5) },
    { y: 0.60, rx: 0.063, rz: 0.066, w: w(B.THIGH_L), l: 0 },
    { y: 0.74, rx: 0.077, rz: 0.080, w: w(B.THIGH_L), l: 0 },
    { y: 0.86, rx: 0.082, rz: 0.085, w: w(B.THIGH_L, B.PELVIS, 0.7) },
    { y: 0.93, rx: 0.068, rz: 0.072, w: w(B.PELVIS), l: 0 },
  ], o({ seg: L, slot: SLOT.SKIN, capTop: true, capBottom: true, move: [-0.09, 0, 0] }));
  if (lod < 2) m.loft([
    { c: [0, 0.040, 0.050], rx: 0.029, rz: 0.033 },
    { c: [0, 0.043, 0.0], rx: 0.038, rz: 0.041 },
    { c: [0, 0.033, -0.08], rx: 0.044, rz: 0.030, l: 0 },
    { c: [0, 0.023, -0.16], rx: 0.046, rz: 0.020 },
    { c: [0, 0.015, -0.205], rx: 0.036, rz: 0.012, l: 0 },
  ], o({ seg: lod === 0 ? 6 : 4, slot: SLOT.SKIN, w: w(B.FOOT_L), capTop: { bulge: 0.012 }, capBottom: { bulge: 0.012 }, u: [1, 0, 0], v: [0, 1, 0], col: [0.9, 0.86, 0.84], move: [-0.09, 0, 0] }));
  else m.box([-0.09, 0.03, -0.06], [0.08, 0.06, 0.22], { slot: SLOT.SKIN, w: w(B.FOOT_L) });
  m.mirror(v0, i0, MIRROR);

  // ---- things carried ---------------------------------------------------------------------------------------
  const gr = GRIP_R;
  // staff: gripped 1.0 m above its foot
  m.loft([{ y: gr[1] - 1.0, rx: 0.013, rz: 0.013 }, { y: gr[1] + 0.50, rx: 0.014, rz: 0.014, edge: true }, { y: gr[1] + 0.515, rx: 0.024, rz: 0.024 }, { y: gr[1] + 0.56, rx: 0.02, rz: 0.02 }],
    { lod, seg: lod === 0 ? 5 : 3, slot: SLOT.BAKED, part: PART.staff, w: w(B.HAND_R), col: tones.wood, capTop: { bulge: 0.012 }, capBottom: true, move: [gr[0] + 0.022, 0, -0.03] });
  // lance: gripped 1.05 m above its butt, 2.15 m long, bronze head
  m.loft([{ y: gr[1] - 1.05, rx: 0.0125, rz: 0.0125 }, { y: gr[1] + 0.86, rx: 0.012, rz: 0.012, edge: true }, { y: gr[1] + 0.87, rx: 0.014, rz: 0.03, col: tones.bronze }, { y: gr[1] + 0.95, rx: 0.011, rz: 0.036, col: tones.bronze }, { y: gr[1] + 1.10, rx: 0.003, rz: 0.004, col: tones.bronze }],
    { lod, seg: lod === 0 ? 5 : 3, slot: SLOT.BAKED, part: PART.spear, w: w(B.HAND_R), col: tones.wood, capTop: true, capBottom: true, move: [gr[0] + 0.022, 0, -0.03] });
  // wicker shield on the left forearm
  {
    const c = [-0.345, 1.02, -0.03], ax = { u: [0, 1, 0], v: [0, 0, 1] };                // rings advance along v x u = -x (outward)
    m.loft([
      { c: [c[0] + 0.03, c[1], c[2]], rx: 0.30, rz: 0.36, col: [tones.leather[0] * 0.6, tones.leather[1] * 0.6, tones.leather[2] * 0.6] },
      { c: [c[0] + 0.012, c[1], c[2]], rx: 0.33, rz: 0.39, col: tones.leather, edge: lod === 0 },
      { c: [c[0] - 0.012, c[1], c[2]], rx: 0.31, rz: 0.37, col: tones.reed, l: 1 },
      { c: [c[0] - 0.03, c[1], c[2]], rx: 0.10, rz: 0.11, col: tones.reed, l: 0 },
      { c: [c[0] - 0.034, c[1], c[2]], rx: 0.06, rz: 0.06, col: tones.bronze, l: 0 },
    ], { lod, seg: lod === 0 ? 12 : lod === 1 ? 8 : 5, slot: SLOT.BAKED, part: PART.shield, w: w(B.FORE_L), capTop: { bulge: 0.02, col: lod === 0 ? tones.bronze : tones.reed }, capBottom: true, ...ax });
  }
  // jar on the head, on a pad
  m.loft([
    { y: 1.700, rx: 0.060, rz: 0.060, cz: 0.005, col: tones.sack, edge: lod === 0, l: 0 },
    { y: 1.725, rx: 0.065, rz: 0.065, cz: 0.005, col: tones.pottery },
    { y: 1.790, rx: 0.135, rz: 0.135, cz: 0.005, col: tones.pottery, l: 0 },
    { y: 1.890, rx: 0.160, rz: 0.160, cz: 0.005, col: tones.pottery },
    { y: 1.990, rx: 0.130, rz: 0.130, cz: 0.005, col: tones.pottery, l: 0 },
    { y: 2.045, rx: 0.068, rz: 0.068, cz: 0.005, col: tones.pottery },
    { y: 2.075, rx: 0.086, rz: 0.086, cz: 0.005, col: tones.pottery, edge: lod === 0, l: 0 },
    { y: 2.060, rx: 0.060, rz: 0.060, cz: 0.005, col: [0.05, 0.04, 0.035], l: 0 },
  ], { lod, seg: lod === 0 ? 10 : lod === 1 ? 6 : 4, slot: SLOT.BAKED, part: PART.jarHead, w: w(B.HEAD), capTop: { col: [0.04, 0.035, 0.03] }, capBottom: true });
  if (lod < 2) {
    // a sack on the right shoulder
    m.loft([
      { c: [0.13, 1.40, 0.09], rx: 0.10, rz: 0.09 }, { c: [0.14, 1.46, 0.085], rx: 0.17, rz: 0.15 }, { c: [0.15, 1.56, 0.08], rx: 0.19, rz: 0.165, l: 0 }, { c: [0.15, 1.64, 0.08], rx: 0.15, rz: 0.13 }, { c: [0.15, 1.70, 0.08], rx: 0.06, rz: 0.05 },
    ], { lod, seg: lod === 0 ? 8 : 5, slot: SLOT.BAKED, part: PART.sack, w: w(B.CHEST), col: tones.sack, capTop: { bulge: 0.03 }, capBottom: true });
    // a flat basket on the head with a heap in it
    m.loft([
      { y: 1.703, rx: 0.10, rz: 0.10, col: tones.reed }, { y: 1.74, rx: 0.21, rz: 0.21, col: tones.reed, l: 0 }, { y: 1.80, rx: 0.26, rz: 0.26, col: tones.reed, edge: true },
      { y: 1.79, rx: 0.235, rz: 0.235, col: tones.dates }, { y: 1.85, rx: 0.15, rz: 0.15, col: tones.dates, l: 0 },
    ], { lod, seg: lod === 0 ? 10 : 6, slot: SLOT.BAKED, part: PART.basketHead, w: w(B.HEAD), capTop: { bulge: 0.03, col: tones.dates }, capBottom: true, move: [0, 0, 0.005] });
    // a standard: pole held before the chest, a gilded disc with a crescent bar and two cloth tails
    m.loft([{ y: 0.80, rx: 0.016, rz: 0.016 }, { y: 2.95, rx: 0.015, rz: 0.015 }], { seg: lod === 0 ? 5 : 3, slot: SLOT.BAKED, part: PART.standard, w: w(B.CHEST), col: tones.wood, capTop: true, capBottom: true, move: [0.02, 0, -0.27] });
    m.loft([{ c: [0.02, 3.13, -0.255], rx: 0.19, rz: 0.19, edge: true }, { c: [0.02, 3.13, -0.285], rx: 0.19, rz: 0.19, edge: true }],
      { seg: lod === 0 ? 12 : 6, slot: SLOT.BAKED, part: PART.standard, w: w(B.CHEST), col: tones.gold, capTop: { sharp: true }, capBottom: { sharp: true }, u: [1, 0, 0], v: [0, 1, 0] });
    if (lod === 0) m.box([0.02, 2.91, -0.27], [0.46, 0.035, 0.035], { slot: SLOT.BAKED, part: PART.standard, w: w(B.CHEST), col: tones.gold });
    for (const s of [-1, 1]) m.box([0.02 + s * 0.2, 2.68, -0.27], [0.05, 0.44, 0.012], { slot: SLOT.B, part: PART.standard, w: w(B.CHEST) });
    // lyre: sound box on the left forearm, two arms, a yoke
    {
      const c = [-0.13, 1.13, -0.215], R = rotZ(0.25), opt = { slot: SLOT.BAKED, part: PART.lyre, w: w(B.CHEST), col: tones.wood, rot: R, pivot: c };
      m.box(c, [0.25, 0.20, 0.07], opt);
      if (lod === 0) { m.box([c[0] - 0.10, c[1] + 0.27, c[2]], [0.025, 0.36, 0.025], opt); m.box([c[0] + 0.10, c[1] + 0.24, c[2]], [0.025, 0.30, 0.025], opt); }
      m.box([c[0], c[1] + 0.42, c[2]], [0.29, 0.025, 0.025], { ...opt, rot: mul3(R, rotZ(-0.2)), pivot: c });
      if (lod === 0) for (let i = -2; i <= 2; i++) m.box([c[0] + i * 0.035, c[1] + 0.25, c[2] - 0.012], [0.004, 0.33, 0.004], { ...opt, col: [0.8, 0.75, 0.6] });
    }
    // frame drum held up at the left
    m.loft([{ c: [-0.16, 1.27, -0.20], rx: 0.16, rz: 0.16, col: tones.wood, edge: true }, { c: [-0.16, 1.27, -0.25], rx: 0.16, rz: 0.16, col: tones.wood, edge: true }],
      { seg: lod === 0 ? 12 : 6, slot: SLOT.BAKED, part: PART.drum, w: w(B.CHEST), capTop: { sharp: true, col: tones.hide }, capBottom: { sharp: true, col: tones.hide }, u: [1, 0, 0], v: [0, 1, 0], rot: rotX(0.2), pivot: [-0.16, 1.27, -0.22] });
    // double pipe from the mouth
    if (lod === 0) for (const s of [-1, 1]) m.loft([{ y: 0, rx: 0.007, rz: 0.007 }, { y: 0.33, rx: 0.009, rz: 0.009 }],
      { seg: 4, slot: SLOT.BAKED, part: PART.pipes, w: w(B.HEAD), col: tones.reed, capTop: true, capBottom: true, rot: mul3(rotZ(s * 0.09), rotX(-2.2)), pivot: [0, 0, 0], move: [s * 0.004, 1.527, -0.098] });
    // an oil lamp in the right hand (a saucer; nightfx draws the flame of the emitter declared with it)
    if (lod === 0) m.loft([{ y: gr[1] - 0.085, rx: 0.025, rz: 0.03 }, { y: gr[1] - 0.06, rx: 0.05, rz: 0.06, edge: true }, { y: gr[1] - 0.068, rx: 0.03, rz: 0.04, col: [0.06, 0.05, 0.04] }],
      { seg: 6, slot: SLOT.BAKED, part: PART.lamp, w: w(B.HAND_R), col: tones.pottery, capTop: { col: [0.06, 0.05, 0.04] }, capBottom: true, move: [gr[0] - 0.02, 0, -0.035] });
  }
  // punt pole held at the right side, running down and back into the water
  {
    const a = [0.25, 1.12, -0.10], d = [0.05, -0.86, 0.51], up = 1.15, dn = 3.3;
    const tilt = mul3(rotZ(Math.atan2(d[0], -d[1])), rotX(-Math.atan2(d[2], -d[1])));    // maps +y to -d (the pole's upward direction)
    m.loft([{ y: -dn, rx: 0.018, rz: 0.018 }, { y: up, rx: 0.02, rz: 0.02 }], { seg: lod === 0 ? 5 : 3, slot: SLOT.BAKED, part: PART.pole, w: w(B.CHEST), col: tones.wood, capTop: true, capBottom: true, rot: tilt, pivot: [0, 0, 0], move: a });
  }
  return m;
}

/** The far level: about 330 triangles, silhouettes only (trunk, skirt, head with hair or head cloth, limbs, what is carried high). */
function buildFar(tones) {
  const m = new Buf(), w = (b0, b1 = b0, k = 1) => [b0, b1, k], dark = [0.32, 0.3, 0.3];
  const lw = (shin) => (th, x) => [x < 0 ? (shin ? B.SHIN_L : B.THIGH_L) : (shin ? B.SHIN_R : B.THIGH_R), B.PELVIS, 0.6 * Math.min(1, Math.abs(x) / 0.1)];
  m.loft([{ y: 0.86, rx: 0.165, rz: 0.115, w: w(B.PELVIS) }, { y: 1.23, rx: 0.185, rz: 0.125, w: w(B.SPINE, B.CHEST, 0.5) }, { y: 1.45, rx: 0.10, rz: 0.08, w: w(B.CHEST) }], { seg: 4, slot: SLOT.TOP, capTop: true, capBottom: true });
  m.loft([{ y: 0.52, rx: 0.205, rz: 0.158, w: lw(false) }, { y: 1.0, rx: 0.17, rz: 0.122, w: w(B.PELVIS) }], { seg: 4, slot: SLOT.A, part: PART.skirtShort, capTop: true, capBottom: { col: dark } });
  m.loft([{ y: 0.10, rx: 0.214, rz: 0.174, w: lw(true) }, { y: 0.55, rx: 0.202, rz: 0.158, w: lw(false) }, { y: 1.0, rx: 0.17, rz: 0.122, w: w(B.PELVIS) }], { seg: 4, slot: SLOT.A, part: PART.skirtLong, capTop: true, capBottom: { col: dark } });
  m.loft([{ y: 0.74, rx: 0.41, rz: 0.31, cz: -0.17 }, { y: 1.0, rx: 0.17, rz: 0.122 }], { seg: 4, slot: SLOT.A, part: PART.skirtSeat, w: w(B.PELVIS), capTop: true, capBottom: true });
  m.loft([{ y: 1.43, rx: 0.05, rz: 0.05, w: w(B.CHEST) }, { y: 1.52, rx: 0.07, rz: 0.082, cz: -0.012, w: w(B.HEAD) }, { y: 1.63, rx: 0.08, rz: 0.097, w: w(B.HEAD) }, { y: 1.70, rx: 0.045, rz: 0.055, w: w(B.HEAD) }], { seg: 4, slot: SLOT.SKIN, capTop: true, capBottom: true });
  m.loft([{ y: 1.42, rx: 0.09, rz: 0.062, cz: 0.05, w: w(B.HEAD, B.CHEST, 0.5) }, { y: 1.60, rx: 0.09, rz: 0.09, cz: 0.03, w: w(B.HEAD) }, { y: 1.712, rx: 0.052, rz: 0.062, cz: 0.012, w: w(B.HEAD) }], { seg: 4, slot: SLOT.HAIR, part: PART.hairLong, capTop: true, capBottom: true });
  m.loft([{ y: 1.57, rx: 0.082, rz: 0.086, cz: 0.03 }, { y: 1.712, rx: 0.052, rz: 0.062, cz: 0.012 }], { seg: 4, slot: SLOT.HAIR, part: PART.hairShort, w: w(B.HEAD), capTop: true, capBottom: true });
  m.loft([{ y: 1.40, rx: 0.045, rz: 0.035, cz: -0.06 }, { y: 1.56, rx: 0.07, rz: 0.06, cz: -0.045 }], { seg: 4, slot: SLOT.HAIR, part: PART.beard, w: w(B.HEAD), capTop: true, capBottom: true });
  m.loft([{ y: 1.10, rx: 0.225, rz: 0.138, cz: 0.055, w: w(B.SPINE) }, { y: 1.42, rx: 0.23, rz: 0.116, cz: 0.04, w: w(B.CHEST) }, { y: 1.60, rx: 0.094, rz: 0.096, cz: 0.028, w: w(B.HEAD) }, { y: 1.716, rx: 0.052, rz: 0.062, cz: 0.01, w: w(B.HEAD) }], { seg: 4, slot: SLOT.WRAP, part: PART.veil, capTop: true, capBottom: { col: dark } });
  m.loft([{ y: 1.625, rx: 0.09, rz: 0.105, cz: 0.006 }, { y: 1.81, rx: 0.012, rz: 0.012, cz: 0.006 }], { seg: 4, slot: SLOT.B, part: PART.helmet, w: w(B.HEAD), capTop: true, capBottom: true });
  const v0 = m.count, i0 = m.idx.length;
  m.loft([{ y: -0.70, rx: 0.03, rz: 0.035, w: w(B.FORE_L), slot: SLOT.SKIN }, { y: -0.30, rx: 0.042, rz: 0.044, w: w(B.ARM_L, B.FORE_L, 0.5), slot: SLOT.SKIN }, { y: 0.01, rx: 0.058, rz: 0.06, w: w(B.ARM_L, B.CHEST, 0.7) }],
    { seg: 3, slot: SLOT.TOP, capTop: true, capBottom: true, rot: rotZ(-A_POSE), pivot: [0, 0, 0], move: [-SH[0], SH[1], 0] });
  m.loft([{ y: 0.0, rx: 0.045, rz: 0.075, cz: -0.03, w: w(B.SHIN_L) }, { y: 0.49, rx: 0.056, rz: 0.058, w: w(B.THIGH_L, B.SHIN_L, 0.5) }, { y: 0.9, rx: 0.082, rz: 0.085, w: w(B.THIGH_L, B.PELVIS, 0.7) }], { seg: 3, slot: SLOT.SKIN, capTop: true, capBottom: true, move: [-0.09, 0, 0] });
  m.mirror(v0, i0, MIRROR);
  const gr = GRIP_R;
  m.loft([{ y: gr[1] - 1.05, rx: 0.02, rz: 0.02 }, { y: gr[1] + 1.10, rx: 0.02, rz: 0.02 }], { seg: 3, slot: SLOT.BAKED, part: PART.spear, w: w(B.HAND_R), col: tones.wood, capTop: true, capBottom: true, move: [gr[0] + 0.022, 0, -0.03] });
  m.loft([{ c: [-0.33, 1.02, -0.03], rx: 0.33, rz: 0.39 }, { c: [-0.37, 1.02, -0.03], rx: 0.31, rz: 0.37 }], { seg: 5, slot: SLOT.BAKED, part: PART.shield, w: w(B.FORE_L), col: tones.reed, capTop: true, capBottom: { col: tones.leather }, u: [0, 1, 0], v: [0, 0, 1] });
  m.loft([{ y: 1.71, rx: 0.065, rz: 0.065 }, { y: 1.89, rx: 0.16, rz: 0.16 }, { y: 2.06, rx: 0.075, rz: 0.075 }], { seg: 4, slot: SLOT.BAKED, part: PART.jarHead, w: w(B.HEAD), col: tones.pottery, capTop: { col: [0.05, 0.04, 0.04] }, capBottom: true });
  m.loft([{ y: 1.705, rx: 0.12, rz: 0.12 }, { y: 1.80, rx: 0.26, rz: 0.26 }], { seg: 4, slot: SLOT.BAKED, part: PART.basketHead, w: w(B.HEAD), col: tones.reed, capTop: { col: tones.dates }, capBottom: true });
  m.loft([{ c: [0.14, 1.40, 0.085], rx: 0.15, rz: 0.13 }, { c: [0.15, 1.66, 0.08], rx: 0.15, rz: 0.13 }], { seg: 4, slot: SLOT.BAKED, part: PART.sack, w: w(B.CHEST), col: tones.sack, capTop: true, capBottom: true });
  m.loft([{ y: 0.80, rx: 0.025, rz: 0.025 }, { y: 2.95, rx: 0.025, rz: 0.025 }], { seg: 3, slot: SLOT.BAKED, part: PART.standard, w: w(B.CHEST), col: tones.wood, capTop: true, capBottom: true, move: [0.02, 0, -0.27] });
  m.loft([{ c: [0.02, 3.13, -0.255], rx: 0.2, rz: 0.2 }, { c: [0.02, 3.13, -0.285], rx: 0.2, rz: 0.2 }], { seg: 5, slot: SLOT.BAKED, part: PART.standard, w: w(B.CHEST), col: tones.gold, capTop: true, capBottom: true, u: [1, 0, 0], v: [0, 1, 0] });
  {
    const a = [0.25, 1.12, -0.10], d = [0.05, -0.86, 0.51];
    m.loft([{ y: -3.3, rx: 0.028, rz: 0.028 }, { y: 1.15, rx: 0.028, rz: 0.028 }], { seg: 3, slot: SLOT.BAKED, part: PART.pole, w: w(B.CHEST), col: tones.wood, capTop: true, capBottom: true, rot: mul3(rotZ(Math.atan2(d[0], -d[1])), rotX(-Math.atan2(d[2], -d[1]))), pivot: [0, 0, 0], move: a });
  }
  return m;
}

/** Beyond 300 m a figure is a dozen pixels: a trunk, the lower garment or bare legs, a head with hair or a head cloth (about 90 triangles). */
function buildSpeck(tones) {
  const m = new Buf(), w = (b0, b1 = b0, k = 1) => [b0, b1, k];
  m.loft([{ y: 0.52, rx: 0.21, rz: 0.165, w: w(B.PELVIS), slot: SLOT.A }, { y: 1.02, rx: 0.19, rz: 0.14, w: w(B.PELVIS), slot: SLOT.A, slotUp: SLOT.TOP, edge: true }, { y: 1.44, rx: 0.21, rz: 0.13, w: w(B.CHEST) }],
    { seg: 3, slot: SLOT.TOP, capTop: true, capBottom: true });
  m.loft([{ y: 0.08, rx: 0.225, rz: 0.185, w: w(B.PELVIS) }, { y: 0.54, rx: 0.21, rz: 0.165, w: w(B.PELVIS) }], { seg: 3, slot: SLOT.A, part: PART.skirtLong, capBottom: true });
  m.loft([{ y: 0.0, rx: 0.15, rz: 0.11, w: w(B.SHIN_L, B.SHIN_R, 0.5) }, { y: 0.54, rx: 0.17, rz: 0.12, w: w(B.THIGH_L, B.THIGH_R, 0.5) }], { seg: 3, slot: SLOT.SKIN, part: PART.skirtShort, capBottom: true });
  m.loft([{ y: 1.42, rx: 0.07, rz: 0.07, w: w(B.CHEST) }, { y: 1.60, rx: 0.10, rz: 0.11, w: w(B.HEAD), slotUp: SLOT.HAIR, edge: true }, { y: 1.71, rx: 0.07, rz: 0.08, w: w(B.HEAD) }], { seg: 3, slot: SLOT.SKIN, capTop: true, capBottom: true });
  m.loft([{ y: 1.12, rx: 0.26, rz: 0.16, cz: 0.05, w: w(B.CHEST) }, { y: 1.46, rx: 0.2, rz: 0.13, cz: 0.04, w: w(B.CHEST) }, { y: 1.72, rx: 0.08, rz: 0.09, cz: 0.02, w: w(B.HEAD) }], { seg: 3, slot: SLOT.WRAP, part: PART.veil, capTop: true, capBottom: true });
  m.loft([{ y: 1.71, rx: 0.09, rz: 0.09 }, { y: 1.9, rx: 0.19, rz: 0.19 }, { y: 2.06, rx: 0.09, rz: 0.09 }], { seg: 3, slot: SLOT.BAKED, part: PART.jarHead, w: w(B.HEAD), col: tones.pottery, capTop: true, capBottom: true });
  m.loft([{ y: GRIP_R[1] - 1.05, rx: 0.03, rz: 0.03 }, { y: GRIP_R[1] + 1.10, rx: 0.03, rz: 0.03 }], { seg: 3, slot: SLOT.BAKED, part: PART.spear, w: w(B.HAND_R), col: tones.wood, capTop: true, capBottom: true, move: [GRIP_R[0] + 0.022, 0, -0.03] });
  m.loft([{ y: 0.80, rx: 0.03, rz: 0.03 }, { y: 3.2, rx: 0.12, rz: 0.12, col: tones.gold }], { seg: 3, slot: SLOT.BAKED, part: PART.standard, w: w(B.CHEST), col: tones.wood, capTop: true, capBottom: true, move: [0.02, 0, -0.27] });
  return m;
}

// =================================================================================================================
// Poses. Everything is a closed form of a phase or of the film time.
// =================================================================================================================
const TRI_N = Math.asin(0.92);
const tri = (phi) => Math.asin(0.92 * Math.sin(phi)) / TRI_N;                     // a rounded triangle wave
const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

/** Stride of one full cycle (two steps) for a thigh swing of `amp` radians and a figure of scale s. */
export const strideOf = (amp, scale = 1) => 4 * 0.84 * amp * scale;

/** Walking. phi: cycle phase; amp: thigh swing (0.42 a man at 1.4 m/s, 0.3 in a long garment); lean: forward lean. */
export function poseWalk(P, phi, amp = 0.42, lean = 0.04, lift = 1) {
  clearPose(P);
  const s = Math.sin(phi), c = Math.cos(phi), t = tri(phi), k = amp / 0.42;
  const fl = Math.pow(Math.max(0, c), 1.6), fr = Math.pow(Math.max(0, -c), 1.6);   // swing of the left / right leg
  P.rx[B.THIGH_L] = amp * t + 0.30 * fl * k * lift; P.rx[B.THIGH_R] = -amp * t + 0.30 * fr * k * lift;
  P.rx[B.SHIN_L] = -(0.10 + 1.0 * fl * k * lift); P.rx[B.SHIN_R] = -(0.10 + 1.0 * fr * k * lift);
  P.rx[B.FOOT_L] = -(P.rx[B.THIGH_L] + P.rx[B.SHIN_L]) * (0.55 + 0.45 * sstep(0.25, -0.25, c));
  P.rx[B.FOOT_R] = -(P.rx[B.THIGH_R] + P.rx[B.SHIN_R]) * (0.55 + 0.45 * sstep(0.25, -0.25, -c));
  P.py = -0.012 - 0.042 * k * k * s * s;
  P.ry[B.PELVIS] = -0.10 * k * t; P.ry[B.SPINE] = 0.06 * k * t; P.ry[B.CHEST] = 0.10 * k * t; P.ry[B.HEAD] = -0.06 * k * t;
  P.rz[B.PELVIS] = 0.035 * k * c; P.rz[B.SPINE] = -0.035 * k * c;
  P.rx[B.SPINE] = -lean; P.rx[B.HEAD] = lean * 0.6;
  P.rx[B.ARM_L] = -0.85 * amp * t; P.rx[B.ARM_R] = 0.85 * amp * t;
  P.rz[B.ARM_L] = -0.09; P.rz[B.ARM_R] = 0.09;
  P.rx[B.FORE_L] = 0.22 + 0.30 * k * Math.max(0, -t); P.rx[B.FORE_R] = 0.22 + 0.30 * k * Math.max(0, t);
  return P;
}

/** Standing: weight on one leg, a slow sway, the head turning. seed: 0..1. */
export function poseStand(P, time, seed = 0) {
  clearPose(P);
  const a = seed * 6.283, sw = Math.sin(time * 0.7 + a), side = seed > 0.5 ? 1 : -1;
  P.rz[B.PELVIS] = side * 0.045 + 0.012 * sw; P.rz[B.SPINE] = -side * 0.05; P.rz[B.CHEST] = -0.01 * sw;
  P.rz[B.THIGH_L] = -0.05 - side * 0.045; P.rz[B.THIGH_R] = 0.05 - side * 0.045;
  P.rx[side > 0 ? B.THIGH_L : B.THIGH_R] = 0.10; P.rx[side > 0 ? B.SHIN_L : B.SHIN_R] = -0.18; P.rx[side > 0 ? B.FOOT_L : B.FOOT_R] = 0.08;
  P.py = -0.006;
  P.ry[B.HEAD] = 0.28 * Math.sin(time * 0.45 + a * 1.7); P.rx[B.HEAD] = 0.04 * Math.sin(time * 0.6 + a);
  P.rx[B.SPINE] = -0.03 + 0.012 * Math.sin(time * 0.9 + a);
  P.rz[B.ARM_L] = -0.10; P.rz[B.ARM_R] = 0.10; P.rx[B.ARM_L] = 0.04; P.rx[B.ARM_R] = 0.04; P.rx[B.FORE_L] = 0.22; P.rx[B.FORE_R] = 0.22;
  return P;
}

/** Sitting cross-legged on the ground (the lap part covers the legs of a clothed figure). */
export function poseSit(P, time, seed = 0) {
  clearPose(P);
  const a = seed * 6.283;
  P.py = -0.735; P.rx[B.PELVIS] = 0.05;
  P.rx[B.SPINE] = -0.22 + 0.015 * Math.sin(time * 0.8 + a); P.rx[B.CHEST] = -0.10; P.rx[B.HEAD] = 0.20 + 0.05 * Math.sin(time * 0.5 + a); P.ry[B.HEAD] = 0.3 * Math.sin(time * 0.4 + a * 2.1);
  // thighs out and forward, turned out so that the shins fold in level before the body (the tailor's seat)
  for (const [th, sh, ft, s] of [[B.THIGH_L, B.SHIN_L, B.FOOT_L, -1], [B.THIGH_R, B.SHIN_R, B.FOOT_R, 1]]) {
    P.rx[th] = 1.36; P.rz[th] = s * 0.66; P.tw[th] = -s * 1.5; P.rx[sh] = -(s > 0 ? 2.2 : 2.05); P.rx[ft] = 0.45;
  }
  P.rx[B.ARM_L] = 0.50; P.rx[B.ARM_R] = 0.50; P.rz[B.ARM_L] = -0.22; P.rz[B.ARM_R] = 0.22; P.rx[B.FORE_L] = 0.75; P.rx[B.FORE_R] = 0.75;
  return P;
}

/** Sitting on an edge (bench, parapet, gunwale, cargo) `seat` metres above the feet. */
export function poseSitEdge(P, time, seed = 0, seat = 0.45) {
  clearPose(P);
  const a = seed * 6.283, drop = Math.max(0, 0.45 - seat);
  P.py = -(0.92 - seat) + 0.0; P.rx[B.SPINE] = -0.12 + 0.015 * Math.sin(time * 0.8 + a); P.rx[B.HEAD] = 0.08; P.ry[B.HEAD] = 0.3 * Math.sin(time * 0.4 + a * 2.1);
  for (const [th, sh, ft, s] of [[B.THIGH_L, B.SHIN_L, B.FOOT_L, -1], [B.THIGH_R, B.SHIN_R, B.FOOT_R, 1]]) {
    P.rx[th] = 1.42 + drop * 1.2; P.rz[th] = s * 0.16; P.rx[sh] = -1.42 - drop * 2.6; P.rx[ft] = 0.0 + drop * 1.4;
  }
  P.rx[B.ARM_L] = 0.55; P.rx[B.ARM_R] = 0.55; P.rz[B.ARM_L] = -0.12; P.rz[B.ARM_R] = 0.12; P.rx[B.FORE_L] = 0.8; P.rx[B.FORE_R] = 0.8;
  return P;
}

/** Squatting on the heels, bent forward over something on the ground (a lamp, a quern, a net). */
export function poseSquat(P, time, seed = 0) {
  clearPose(P);
  const a = seed * 6.283;
  P.py = -0.56; P.rx[B.PELVIS] = -0.25; P.rx[B.SPINE] = -0.32; P.rx[B.CHEST] = -0.18; P.rx[B.HEAD] = 0.25;
  for (const [th, sh, ft, s] of [[B.THIGH_L, B.SHIN_L, B.FOOT_L, -1], [B.THIGH_R, B.SHIN_R, B.FOOT_R, 1]]) {
    P.rx[th] = 2.15; P.rz[th] = s * 0.30; P.rx[sh] = -2.5; P.rx[ft] = 0.6;
  }
  const r = 0.12 * Math.sin(time * 2.2 + a);
  P.rx[B.ARM_L] = 1.05 + r; P.rx[B.ARM_R] = 1.05 - r; P.rz[B.ARM_L] = 0.05; P.rz[B.ARM_R] = -0.05; P.rx[B.FORE_L] = 0.45 - r; P.rx[B.FORE_R] = 0.45 + r;
  return P;
}

/** Hauling a tow rope: the body thrown forward into the rope over the right shoulder, short heavy steps. */
export function poseTow(P, phi) {
  poseWalk(P, phi, 0.30, 0, 0.8);
  const lean = 0.52;
  P.rx[B.PELVIS] = -lean; P.rx[B.SPINE] = -0.10; P.rx[B.HEAD] = 0.42;
  P.rx[B.THIGH_L] += lean; P.rx[B.THIGH_R] += lean;
  P.py -= 0.06; P.pz = 0.12;
  return P;
}

/** Poling a boat: feet apart, the body going down on the pole and coming up again. */
export function posePole(P, time, seed = 0) {
  clearPose(P);
  const u = 0.5 - 0.5 * Math.cos(time * 1.9 + seed * 6.283);
  P.rz[B.THIGH_L] = -0.16; P.rz[B.THIGH_R] = 0.16; P.rx[B.THIGH_L] = 0.30; P.rx[B.THIGH_R] = -0.22; P.rx[B.SHIN_L] = -0.25 - 0.2 * u; P.rx[B.SHIN_R] = -0.1;
  P.rx[B.FOOT_L] = -0.05 + 0.2 * u; P.rx[B.FOOT_R] = 0.3;
  P.py = -0.03 - 0.03 * u; P.rx[B.PELVIS] = -0.10 - 0.16 * u; P.rx[B.SPINE] = -0.10 - 0.14 * u; P.ry[B.CHEST] = -0.25; P.rx[B.HEAD] = 0.2 * u;
  return P;
}

/**
 * Arms for what a figure does or carries, written over the arms of the base pose. sw: -1..1 (the arm swing of a
 * walk, 0 when standing); time for small movements.
 */
export function poseArms(P, mode, time = 0, seed = 0) {
  const a = seed * 6.283, sR = P.rx[B.ARM_R], sL = P.rx[B.ARM_L];
  const setR = (rx, rz, fore, tw = 0) => { P.rx[B.ARM_R] = rx; P.rz[B.ARM_R] = rz; P.rx[B.FORE_R] = fore; P.tw[B.ARM_R] = tw; };
  const setL = (rx, rz, fore, tw = 0) => { P.rx[B.ARM_L] = rx; P.rz[B.ARM_L] = rz; P.rx[B.FORE_L] = fore; P.tw[B.ARM_L] = tw; };
  // keep whatever the hand holds upright: undo the pitch of the arm chain (and of the trunk)
  const uprightR = (tilt = 0, side = 0) => { P.abs[B.HAND_R] = 1; P.rx[B.HAND_R] = tilt; P.rz[B.HAND_R] = side; P.ry[B.HAND_R] = 0; };
  switch (mode) {
    case 'jar': setR(2.39, -0.27, 1.47, -0.04); P.rx[B.ARM_L] = sL * 0.6; break;           // one hand up to the jar on the head
    case 'jarBoth': setR(2.39, -0.27, 1.47, -0.04); setL(2.39, 0.27, 1.47, 0.04); break;
    case 'basket': setL(2.24, 0.21, 1.84, 0.11); P.rx[B.ARM_R] = sR * 0.6; break;
    case 'sack': setR(1.71, 0.07, 2.42, 0.53); P.rx[B.ARM_L] = sL * 0.5; P.rx[B.SPINE] -= 0.12; P.rx[B.HEAD] += 0.1; break;
    case 'yokeR': setR(1.71, 0.07, 2.42, 0.53); P.rx[B.ARM_L] = sL * 0.5; break;                 // a hand up on a carrying pole on the right shoulder
    case 'yokeL': setL(1.71, -0.07, 2.42, -0.53); P.rx[B.ARM_R] = sR * 0.5; break;
    case 'staff': setR(-0.23 + sR * 0.35, -0.07, 1.63, -0.07); uprightR(-0.05 - sR * 0.45); break;
    case 'spear': setR(-0.25 + sR * 0.10, -0.28, 1.88, -0.12); uprightR(0.10); setL(-0.40, 0.04, 2.02, -0.16); break;   // lance sloped a little back, shield up
    case 'guard': setR(-0.13, -0.36, 2.02, -0.55); uprightR(0); setL(-0.40, 0.04, 2.02, -0.16); break;                  // lance grounded, shield before the body
    case 'guardEasy': setR(-0.13, -0.36, 2.02, -0.55); uprightR(0); break;
    case 'lead': setL(-0.45 + sL * 0.2, -0.18, 0.25); break;                                  // a hand back on the halter rope
    case 'standard': setR(-0.13, 0.01, 2.20, 0.91); setL(-0.30, 0.12, 1.55, -0.65); break;
    case 'lyre': setL(-0.46, -0.49, 1.80, -0.65); setR(0.30, 0.25, 2.12 + 0.10 * Math.sin(time * 7 + a), 1.29); break;
    case 'drum': setL(-0.46, -0.05, 2.00, -0.37); setR(0.38 + 0.10 * Math.sin(time * 8.4 + a), 0.35, 1.88 + 0.22 * Math.sin(time * 8.4 + a + 0.6), 1.21); break;
    case 'pipes': setR(0.29, 0.20, 2.06, 0.84); setL(0.29, -0.20, 2.06, -0.84); P.rx[B.HEAD] += 0.08; break;
    case 'clasp': setR(-0.23, 0.57, 1.73, 1.10); setL(-0.23, -0.57, 1.73, -1.10); break;       // hands clasped before the body
    case 'tow': setR(0.38, 0.89, 2.38, 0.99); setL(-0.21, 0.29, 1.96, -0.78); break;
    case 'pole': { const u = 0.5 - 0.5 * Math.cos(time * 1.9 + a); setR(0.66 + 0.35 * u, 0.09, 2.14 - 0.5 * u, 0.25); setL(-0.25 + 0.3 * u, 0.08, 1.34 - 0.2 * u, -1.50); break; }
    case 'steer': { const u = 0.06 * Math.sin(time * 1.1 + a); setR(-0.02, 0.32, 1.48 + u, 0.66); setL(-0.02, -0.32, 1.48 + u, -0.66); break; }
    case 'talk': setR(0.38 + 0.12 * Math.sin(time * 1.3 + a), 0.10, 1.05 + 0.32 * Math.sin(time * 2.3 + a), 0.2); break;
    case 'point': setR(1.35 + 0.05 * Math.sin(time * 0.9 + a), 0.10, 0.60, -0.03); break;
    case 'door': setL(1.64, -0.68, 1.76, 0.61); break;                                         // a hand up on the door post
    case 'hips': setR(-0.24, 1.44, 2.00, 1.78); setL(-0.24, -1.44, 2.00, -1.78); break;
    case 'work': { const r = 0.14 * Math.sin(time * 2.6 + a); setL(0.82 + r, 0.08, 0.62 - r); setR(0.82 - r, -0.08, 0.62 + r); break; }
    case 'lamp': setR(-0.13, 0.22, 1.93, 0.44); uprightR(0); break;
    case 'knees': setR(-0.15, -0.02, 1.53, 0.04); setL(-0.15, 0.02, 1.53, -0.04); break;
    case 'wave': setR(0.2, 2.3 + 0.25 * Math.sin(time * 6 + a), 0.5); break;
    case 'child': P.rx[B.ARM_L] = sL * 1.5; P.rx[B.ARM_R] = sR * 1.5; P.rx[B.FORE_L] = 1.0; P.rx[B.FORE_R] = 1.0; break;   // a running child
    default: break;
  }
  return P;
}
