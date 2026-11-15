// js/modules/rivercraft/models.js — the craft of the Euphrates c. 575 BCE (SPEC 3.18, R5 2.3):
//   plank cargo barges 5-14 m (bitumen-black, steering sweep, cargo under reed mats, poles; a tow mast on the
//   ones hauled upstream; no sails), round quffas 2-3.6 m (one with a pack donkey: Herodotus 1.194), a kelek
//   (timber raft on inflated skins, with stone and cedar from the north), reed canoes with nets.
// Every model is built in boat-local metres (origin amidships on the waterline, +x starboard, -z the bow) at
// three levels: 2 = the hero barge the camera rides, 1 = near, 0 = far (one material, a quarter of the triangles).
// Each returns { parts, meta }: meta = { kind, length, beam, crew: [{ x, y, z, pose, faceDeg }], lamp, tow }.
// OWNER: rivercraft.
import { makeParts, X, V } from './mesh.js';
import * as K from './hull.js';

const { mulc, mix, lerp, clamp, h3 } = K;

/** linear-rgb colours for the vertex colours of the white variants */
export function colours(ctx) {
  const m = ctx.materials, T = ctx.THREE;
  const a = (id) => { const c = m.color(id); return [c.r, c.g, c.b]; };
  const hex = (h) => { const c = new T.Color(h); return [c.r, c.g, c.b]; };
  const C = {
    bitumen: hex(0x211c18), bitumenWorn: hex(0x3d352e),
    wood: a('cedar'), woodPale: a('palmWood'), woodGrey: hex(0x8d7f6c), woodEnd: hex(0xc4a273),
    mat: a('reedMat'), reed: mix(a('reedMat'), a('reedsGreen'), 0.22), basket: hex(0xb39660), rope: hex(0xa48c62),
    clay: a('bakedBrickRed'), clayPale: a('bakedBrickBuff'), brick: a('bakedBrickYellow'),
    sack: a('woolBrown'), sackPale: a('woolOatmeal'), cream: a('woolCream'), linenDirty: mulc(a('linenWhite'), 0.72),
    donkey: a('donkey'), hide: hex(0x7d5d3f), limestone: a('limestone'), breccia: a('breccia'),
    date: hex(0x4b2c17), barley: hex(0xc4a45c), net: hex(0x5c4c3b), straw: hex(0xc9b27a),
  };
  C.woodDark = mulc(C.wood, 0.5);
  C.matOld = [C.mat[0] * 0.74, C.mat[1] * 0.7, C.mat[2] * 0.62];
  C.reedBoat = mix(C.mat, hex(0x9a8448), 0.5);
  return C;
}

const stand = (x, y, z, pose = 'stand', faceDeg = 0) => ({ x, y, z, pose, faceDeg });

// =================================================================================================================
// THE HERO: the 14 m grain barge the camera rides in shot 5. The eye stands on the steering platform.
// =================================================================================================================
export const HERO = {
  L: 14, B: 4.6,
  /** the camera's eye in boat-local metres: on the port side of the raised steering platform (deck 1.65, eye 1.55 above it) */
  eye: [-0.45, 3.2, 3.9], deck: 1.65,
};
export function buildHero(C) {
  const parts = makeParts();
  const P = { L: HERO.L, B: HERO.B, fb: 0.95, draft: 0.5, bowRise: 0.82, sternRise: 1.25, endDepth: 0.4, flare: 0.72, t: 0.075, floor: 0.09 };
  const H = K.buildHull(parts, P, { C, detail: 2, hold: [-0.66, 0.371], aftDeck: { y: HERO.deck, ramp: 0.88 }, ribs: 0.55, thwarts: [-2.85, 0.8], bowTop: 2.5, sternTop: 3.3, bowCurl: 104, sternCurl: 126 });
  const F = H.F, fy = F.floor + 0.03;
  const occ = (y, z) => H.occ(y, z);
  const inHold = (k) => { for (const s of ['wood', 'mat', 'clay', 'cloth']) parts[s].shade = k ? (x, y, z) => 0.55 + 0.45 * occ(y, z) : null; };

  // ---- fore-deck: tow / mooring bitt, coil, anchor stone, mooring line ------------------------------------------
  const fd = (z) => H.foreDeckY(z);
  parts.wood.tube([[0, fd(-5.35) - 0.25, -5.35], [0, fd(-5.35) + 0.56, -5.35]], 0.085, 8, (p) => mulc(mix(C.woodGrey, C.woodPale, 0.4), 0.85 + 0.3 * h3(Math.round(p[1] * 8), 1, 1)), { capCol: C.woodEnd });
  parts.wood.tube([[-0.3, fd(-5.35) + 0.4, -5.35], [0.3, fd(-5.35) + 0.4, -5.35]], 0.035, 6, C.woodPale);
  K.rope(parts, C, [[0, fd(-5.35) + 0.3, -5.35], [-0.06, fd(-5.35) + 0.33, -5.3], [0.06, fd(-5.35) + 0.36, -5.4]].concat([[0.2, fd(-5.3) + 0.18, -5.2], [-0.25, fd(-5.1) + 0.03, -5.05], [-0.7, fd(-5.05) + 0.06, -5.0]]), 0.022);
  for (let k = 0; k < 3; k++) parts.mat.tube([[0, fd(-5.35) + 0.2 + k * 0.05, -5.35], [0, fd(-5.35) + 0.245 + k * 0.05, -5.35]], 0.105, 8, mulc(C.rope, 0.9 + 0.1 * k), { caps: false });
  K.coil(parts, C, -0.75, fd(-5.0), -5.0, 0.33, 0.045, 3, { nu: 16 });
  // the anchor stone: a rough slab of limestone, pierced for its line
  parts.clay.push(X.of(X.t(0.7, fd(-5.3) + 0.15, -5.3), X.ry(20)));
  parts.clay.blob([0, 0, 0], 0.27, 0.16, 0.2, (u, v, p) => mulc(C.limestone, 0.8 + 0.25 * h3(Math.round(p[0] * 8), Math.round(p[1] * 8), Math.round(p[2] * 8))), { nu: 10, nv: 6, square: 0.45 });
  parts.clay.pop();
  K.rope(parts, C, [[0.7, fd(-5.3) + 0.3, -5.3], [0.5, fd(-5.3) + 0.34, -5.15], [0.3, fd(-5.2) + 0.03, -5.0], [0.55, fd(-4.9) + 0.03, -4.85], [0.9, fd(-4.9) + 0.03, -4.95]], 0.02);

  // more on the fore-deck: the gangplank, a bailing bowl, a worn mat for the bowman, a mooring stake, a water jar
  parts.wood.bar([-1.28, fd(-4.8) + 0.035, -4.78], [-0.62, fd(-6.25) + 0.035, -6.3], 0.26, 0.045, (p) => mulc(mix(C.woodPale, C.woodGrey, 0.5), 0.8 + 0.3 * h3(Math.round(p[2] * 3), 1, 4)));
  for (const k of [0.25, 0.6, 0.92]) parts.wood.bar([-1.28 + 0.66 * k - 0.12, fd(-4.8 - 1.5 * k) + 0.065, -4.78 - 1.52 * k + 0.05], [-1.28 + 0.66 * k + 0.12, fd(-4.8 - 1.5 * k) + 0.065, -4.78 - 1.52 * k - 0.05], 0.05, 0.022, mulc(C.woodDark, 1.2));   // its cleats
  parts.mat.box(0.12, fd(-4.95) + 0.013, -4.93, 0.9, 0.022, 0.5, (p) => mulc(mix(C.mat, C.matOld, 0.6), 0.8 + 0.25 * h3(Math.round(p[0] * 4), 1, Math.round(p[2] * 4))), 'y');
  parts.clay.push(X.t(0.2, fd(-5.85) + 0.005, -5.85)); parts.clay.lathe([[0.05, 0], [0.13, 0.03], [0.17, 0.09], [0.16, 0.1]], 10, mulc(C.clayPale, 0.85), { capBottom: true }); parts.clay.pop();
  K.jar(parts, C, 1.02, fd(-4.9), -4.92, 0.62, { sides: 10, tone: 0.5 });
  K.log(parts, C, [0.42, fd(-6.2) + 0.05, -6.3], [0.95, fd(-4.8) + 0.06, -4.72], 0.035, 0.03, { sides: 6, col: mulc(C.woodPale, 0.9) });
  // the stem: a lashing below the head of the post and the tail of the mooring line thrown over it
  { const bp = H.posts.bow, q = bp[bp.length - 4]; parts.mat.tube([[0, q[1] - 0.06, q[2]], [0, q[1] + 0.06, q[2] + 0.01]], 0.085, 7, mulc(C.rope, 0.95), { caps: false }); K.rope(parts, C, [[0, q[1], q[2] + 0.08], [0.1, q[1] - 0.45, q[2] + 0.3], [0.05, fd(-5.9) + 0.04, -6.0], [0, fd(-5.35) + 0.34, -5.4]], 0.02); }

  // ---- the hold, from the bow aft: baskets, two rows of jars, the grain under mats, sacks, the mat shelter --------
  inHold(true);
  for (const [x, r, load] of [[-0.72, 0.26, C.date], [-0.12, 0.25, C.date], [0.48, 0.27, C.barley], [1.0, 0.21, C.date]]) K.basket(parts, C, x, fy, -4.3 + 0.05 * Math.sin(x * 9), r, 0.34, load, { sides: 10, rot: x * 40 });
  const rows = [[-3.72, [-0.45, 0.1, 0.65, 1.17]], [-3.14, [-0.5, 0.1, 0.7, 1.3]]];
  rows.forEach(([z, xs], ri) => xs.forEach((x, i) => K.jar(parts, C, x, fy, z + 0.04 * Math.sin(i * 7 + ri), 0.92 + 0.16 * h3(i, ri, 3), { sides: 12, tone: 0.55 * h3(i, ri, 9), rot: i * 50, tilt: (h3(i, 4, ri) - 0.5) * 5, stopper: h3(i, ri, 5) > 0.5 ? C.linenDirty : mulc(C.clayPale, 0.9) })));
  // straw packing between the jars
  parts.mat.blob([0.45, fy + 0.02, -3.43], 1.15, 0.2, 0.62, (u, v, p) => mulc(C.straw, 0.5 + 0.35 * h3(Math.round(p[0] * 12), Math.round(p[1] * 12), Math.round(p[2] * 12))), { nu: 12, nv: 4, from: 0.5, square: 0.7 });
  // grain under reed mats
  K.matHeap(parts, C, -2.62, 0.62, (z) => H.halfAt(z, 0.5) - 0.1, fy, 1.5, { nu: 16, nv: 12, sheets: 5, ropes: 4, seed: 3 });
  // on the heap: a punt pole thrown across, a water skin, a folded mat, a small coil
  K.log(parts, C, [-1.7, 1.02, -1.75], [1.55, 1.16, -0.35], 0.03, 0.026, { sides: 6, col: C.woodPale });
  parts.cloth.push(X.of(X.t(-0.55, 1.5, -1.25), X.ry(25)));
  parts.cloth.blob([0, 0, 0], 0.33, 0.13, 0.19, (u, v, p) => mulc(C.hide, 0.85 + 0.25 * h3(Math.round(p[0] * 7), Math.round(p[1] * 9), 3)), { nu: 14, nv: 8, square: 0.9 });
  parts.cloth.tube([[0.3, 0.02, 0], [0.42, 0.06, 0.02], [0.5, 0.05, 0.03]], (i) => [0.06, 0.03, 0.035][i], 6, mulc(C.hide, 0.8));      // the tied neck
  for (const s of [-1, 1]) parts.cloth.tube([[-0.22, 0, s * 0.15], [-0.32, -0.03, s * 0.24]], (i) => (i ? 0.02 : 0.04), 5, mulc(C.hide, 0.8));
  parts.cloth.pop();
  parts.mat.box(0.75, 1.42, 0.0, 0.7, 0.07, 0.5, (p) => mulc(mix(C.mat, C.matOld, 0.2), 0.85 + 0.2 * h3(Math.round(p[1] * 60), 2, 2)), 'y');
  // sacks piled against the after end of the heap
  for (const [x, y, z, rot] of [[-1.25, fy, 1.05, 80], [-0.4, fy, 1.0, 95], [0.5, fy, 1.05, 85], [-0.85, fy + 0.28, 1.02, 100]]) K.sack(parts, C, x, y, z, { rot, col: h3(x, 1, z) > 0.5 ? C.sack : C.sackPale, l: 0.85, w: 0.5, h: 0.3 });
  // the mat shelter in front of the steering platform
  K.matCabin(parts, C, 1.35, 2.52, 1.45, fy + 0.12, 1.6, { nu: 5, nv: 12 });
  inHold(false);

  // ---- along the sides: punt poles on the port gunwale, the lowered mast and yard on crutches to starboard -------
  for (const [dx, len] of [[0, 5.6], [0.09, 5.1]]) { const k = len / 5.6; K.log(parts, C, [-1.92 + dx, 0.925 + dx * 0.25, 1.2], [-1.92 + dx + 0.4 * k, 0.925 + dx * 0.25 + 0.092 * k, 1.2 - 5.6 * k], 0.032, 0.026, { col: mulc(C.woodPale, 0.95), sides: 6 }); }
  K.crutch(parts, C, [1.281, 0.875, 0.8], 0.62, 'x');
  K.crutch(parts, C, [1.233, 0.96, -2.85], 0.6, 'x');
  K.log(parts, C, [1.3, 1.385, 2.2], [1.2, 1.52, -5.3], 0.095, 0.065, { col: mulc(C.wood, 0.95), sides: 8 });
  K.log(parts, C, [1.17, 1.545, 1.6], [1.1, 1.622, -4.4], 0.045, 0.04, { col: C.woodPale, sides: 6 });
  for (const z of [1.2, -1.0, -3.6]) { const y = 1.385 + ((2.2 - z) / 7.5) * 0.135 + 0.045; parts.mat.tube([[1.3 - (2.2 - z) / 75, y, z - 0.05], [1.3 - (2.2 - z) / 75, y, z + 0.05]], 0.125, 7, C.rope, { caps: false }); }
  // halyard coiled at the mast heel
  K.coil(parts, C, 0.95, 0.95, 1.9, 0.2, 0.03, 2, { nu: 10 });

  // ---- the steering platform: sweep on its crutch, a mat, a water jar, a lamp ---------------------------------------
  const py = HERO.deck;
  K.crutch(parts, C, [1.1, 1.8, 5.9], 0.36, 'x', { spread: 0.11 });
  K.sweepOar(parts, C, [0.95, 2.9, 4.55], [1.1, 2.12, 5.9], [1.65, -0.55, 10.4], { blade: 1.5, bladeW: 0.34 });
  parts.mat.tube([[1.1, 2.06, 5.86], [1.1, 2.18, 5.94]], 0.075, 6, C.rope, { caps: false });                       // the lashing that holds the sweep in its crutch
  parts.mat.box(-0.35, py + 0.012, 4.35, 1.5, 0.024, 1.9, (p) => mulc(mix(C.mat, C.matOld, 0.3), 0.85 + 0.2 * h3(Math.round(p[0] * 3), 1, Math.round(p[2] * 3))), 'y');
  K.jar(parts, C, -1.1, py, 5.2, 0.7, { sides: 10, tone: 0.2 });
  K.lampDish(parts, C, -0.2, py + 0.001, 5.95);
  K.coil(parts, C, 0.35, py, 5.8, 0.24, 0.035, 2, { nu: 10 });
  // rail posts at the after end of the platform (low: the camera comes down over the port quarter)
  for (const s of [-1, 1]) parts.wood.tube([[s * 0.55, py, 6.38], [s * 0.55, py + 0.42, 6.42]], 0.035, 6, C.woodPale);
  parts.wood.tube([[-0.6, py + 0.4, 6.42], [0.6, py + 0.4, 6.42]], 0.03, 6, C.woodPale);

  const meta = {
    kind: 'barge', name: 'hero', length: HERO.L, beam: HERO.B, eye: HERO.eye, deck: py,
    crew: [
      stand(0.85, py, 4.7, 'steer', 0),                     // the steersman at the sweep, beside the camera (behind its right shoulder)
      stand(-1.12, fy, -3.5, 'pole', -20),                  // a man with a punt pole in the hold, port side by the jars (head 1.9 m above the water: under the corridor)
      stand(0.55, 1.42, -0.9, 'sit', 0),                    // sitting on the grain mats
      stand(-1.75, 0.92, 0.8, 'sit', 90),                   // on the thwart at the port gunwale
      stand(-0.35, fd(-5.0), -4.95, 'crouch', 0),           // the bowman squatting on the fore-deck by the coil
      stand(0.5, fd(-4.74), -4.74, 'sit', 180),             // on the after edge of the fore-deck, feet in the hold, facing aft (toward the camera)
      stand(-0.6, 1.2, -1.9, 'sit', -30),                   // a second man on the forward slope of the grain heap
    ],
    lamp: [-0.2, py + 0.12, 5.95], tow: [0, fd(-5.35) + 0.5, -5.35],
  };
  return { parts, meta, H };
}

// =================================================================================================================
// Fleet barges
// =================================================================================================================
/**
 * spec: { L, B, fb, draft, bowRise, sternRise, cargo: 'grain' | 'jars' | 'reeds' | 'timber' | 'bricks' | 'empty' | 'fish',
 *         cabin, mast: 'tow' | 'lowered' | null, name }
 */
export function buildBarge(C, detail, spec) {
  const parts = makeParts();
  const L = spec.L, B = spec.B, k = L / 10;
  const P = { L, B, fb: spec.fb ?? 0.75, draft: spec.draft ?? 0.4, bowRise: spec.bowRise ?? 0.8, sternRise: spec.sternRise ?? 0.95, endDepth: 0.34, flare: spec.flare ?? 0.72, t: 0.065, floor: 0.085 };
  const hold = spec.hold || [-0.64, 0.6];
  const z0 = hold[0] * L / 2, z1 = hold[1] * L / 2;
  const thw = spec.thwarts || [z0 + (z1 - z0) * 0.33, z0 + (z1 - z0) * 0.68];
  const H = K.buildHull(parts, P, { C, detail, hold, ribs: detail >= 1 ? 0.62 : 0, thwarts: thw, bowTop: P.fb + P.bowRise + (spec.bowPost ?? 0.5), sternTop: P.fb + P.sternRise + (spec.sternPost ?? 0.65) });
  const F = H.F, fy = F.floor + 0.03, lo = detail === 0;
  const sides = lo ? 5 : 8;
  const inHold = (on) => { for (const s of ['wood', 'mat', 'clay', 'cloth']) parts[s].shade = on ? (x, y, z) => 0.55 + 0.45 * H.occ(y, z) : null; };
  const wAt = (z, y = 0.3) => H.halfAt(z, y) - 0.08;
  const crew = [];

  // bitt on the fore-deck, a coil
  const zb = -L / 2 * 0.78, fdy = H.foreDeckY(zb);
  parts.wood.tube([[0, fdy - 0.15, zb], [0, fdy + 0.45, zb]], 0.07, lo ? 5 : 7, mulc(C.woodPale, 0.9), { capCol: C.woodEnd });
  if (!lo) K.coil(parts, C, -0.3 * B / 3, H.foreDeckY(zb + 0.5), zb + 0.55, 0.24, 0.04, 2, { nu: 10, nv: 4 });

  inHold(true);
  const seg = (a, b) => [lerp(z0, z1, a) , lerp(z0, z1, b)];
  const cargo = spec.cargo || 'empty';
  if (cargo === 'grain') {
    const [a0, a1] = seg(0.06, 0.5), [b0, b1] = seg(0.54, spec.cabin ? 0.78 : 0.95);
    K.matHeap(parts, C, a0, a1, (z) => wAt(z, 0.45), fy, P.fb + 0.42, { nu: lo ? 5 : 10, nv: lo ? 4 : 8, sheets: 3, ropes: lo ? 0 : 3, seed: 5 });
    K.matHeap(parts, C, b0, b1, (z) => wAt(z, 0.45), fy, P.fb + 0.3, { nu: lo ? 4 : 8, nv: lo ? 4 : 8, sheets: 3, ropes: lo ? 0 : 2, seed: 9 });
    crew.push(stand(0.3, P.fb + 0.36, (a0 + a1) / 2, 'sit', 0));
  } else if (cargo === 'jars') {
    const [a0, a1] = seg(0.08, 0.62), nrow = Math.max(2, Math.round((a1 - a0) / 0.6));
    for (let r = 0; r < nrow; r++) {
      const z = lerp(a0, a1, (r + 0.5) / nrow), w = wAt(z, 0.2) - 0.25, n = Math.max(2, Math.floor((2 * w) / 0.58) + 1);
      for (let i = 0; i < n; i++) { if (lo && (i + r) % 2) continue; const x = n > 1 ? lerp(-w, w, i / (n - 1)) : 0; K.jar(parts, C, x, fy, z + 0.05 * Math.sin(i * 5 + r), (lo ? 1.15 : 0.9) + 0.18 * h3(i, r, 2), { sides: lo ? 5 : 7, lo, tone: 0.6 * h3(i, r, 7), rot: i * 40 }); }
    }
    const [b0, b1] = seg(0.68, 0.94);
    for (let i = 0; i < (lo ? 2 : 5); i++) K.sack(parts, C, lerp(-0.7, 0.7, h3(i, 1, 1)) * wAt(b0), fy + (i > 2 ? 0.27 : 0), lerp(b0, b1, (i % 3 + 0.5) / 3), { rot: 70 + 40 * h3(i, 2, 2), col: i % 2 ? C.sack : C.sackPale, nu: lo ? 5 : 8, nv: lo ? 3 : 5, tie: !lo });
    if (!lo) for (let i = 0; i < 3; i++) K.basket(parts, C, lerp(-0.6, 0.6, i / 2) * wAt(a0), fy, a0 - 0.02 + 0.2 * (i % 2), 0.24, 0.3, i === 1 ? C.barley : C.date, { sides: 7 });
    crew.push(stand(-wAt((b0 + b1) / 2) * 0.55, fy, b1 - 0.1, 'stand', 0));
  } else if (cargo === 'reeds') {
    const [a0, a1] = seg(0.03, 0.97), len = a1 - a0, n = lo ? 5 : 9;
    for (let layer = 0; layer < 3; layer++) {
      const cnt = n - layer * 2, y = fy + 0.16 + layer * 0.27, w = wAt((a0 + a1) / 2, y) * (0.92 - layer * 0.12);
      for (let i = 0; i < cnt; i++) {
        const x = cnt > 1 ? lerp(-w, w, i / (cnt - 1)) : 0, sh = (h3(i, layer, 1) - 0.5) * 0.5, r = lo ? 0.2 : 0.155;
        const za = a0 + 0.25 + sh, zb = a0 + len * (0.84 + 0.1 * h3(i, layer, 3)) + sh, fit = (xx, z) => { const m = Math.max(0, wAt(z, Math.min(y, P.fb - 0.1)) - r - 0.05); return clamp(xx, -m, m); };
        K.reedBundle(parts, C, [fit(x, za), y, za], [fit(x * 0.96, zb), y + 0.03, zb], r, { sides: lo ? 4 : 6, ties: !lo, col: mix(C.reed, C.mat, h3(i, layer, 4)) });
      }
    }
    crew.push(stand(0, fy + 0.9, (a0 + a1) / 2, 'sit', 0));
  } else if (cargo === 'timber') {
    const [a0, a1] = seg(0.05, 0.95), n = lo ? 4 : 6;
    for (let layer = 0; layer < 2; layer++) {
      const cnt = n - layer, y = fy + 0.2 + layer * 0.36, w = wAt((a0 + a1) / 2, 0.3) * 0.8 - layer * 0.2;
      for (let i = 0; i < cnt; i++) {
        const x = cnt > 1 ? lerp(-w, w, i / (cnt - 1)) : 0, r = 0.16 + 0.05 * h3(i, layer, 6), za = a0 + 0.2 + 0.3 * h3(i, 1, layer), zb = a1 - 0.2 - 0.3 * h3(i, 2, layer);
        const fit = (xx, z) => { const m = Math.max(0, wAt(z, 0.3) - r - 0.04); return clamp(xx, -m, m); };
        K.log(parts, C, [fit(x, za), y, za], [fit(x, zb), y, zb], r, r * 0.85, { sides: lo ? 5 : 8, col: mulc(mix(C.wood, C.woodPale, h3(i, layer, 8)), 1.05) });
      }
    }
    if (!lo) for (const a of [0.25, 0.75]) K.rope(parts, C, [[-wAt(0), fy + 0.5, lerp(a0, a1, a)], [0, fy + 0.82, lerp(a0, a1, a)], [wAt(0), fy + 0.5, lerp(a0, a1, a)]], 0.022, { sides: 4 });
  } else if (cargo === 'bricks') {
    // baked bricks from the kilns, stacked in blocks on the floor with gaps to step in, a mat over some
    const [a0, a1] = seg(0.06, 0.94), n = Math.max(3, Math.round((a1 - a0) / 1.15));
    const brickCol = (i, s) => (p) => mulc(mix(C.brick, C.clayPale, h3(Math.round(p[1] * 11.6), i, s)), (0.72 + 0.34 * h3(Math.round(p[0] * 3), Math.round(p[1] * 11.6), Math.round(p[2] * 3))) * (Math.round(p[1] * 11.6) % 2 ? 1 : 0.9));
    for (let i = 0; i < n; i++) {
      const z = lerp(a0, a1, (i + 0.5) / n), w = wAt(z, 0.3) * 0.84;
      for (const s of [-1, 1]) {
        const hgt = 0.43 + 0.26 * h3(i, s, 4), sx = w * 0.86, sz = 0.86;
        parts.clay.push(X.t(s * w * 0.52, fy, z));
        parts.clay.box(0, hgt / 2, 0, sx, hgt, sz, brickCol(i, s), 'y');
        if (!lo) {
          // the top course is broken into: a part-layer and a few loose bricks
          parts.clay.box(-s * sx * 0.12, hgt + 0.043, 0.06, sx * 0.62, 0.086, sz * 0.8, brickCol(i + 7, s), 'y');
          for (let k = 0; k < 3; k++) parts.clay.box(s * sx * (0.3 + 0.07 * k), hgt + 0.043 + 0.0 * k, -sz * 0.3 + k * 0.3, 0.33, 0.086, 0.33, brickCol(i + k, 3), 'y');
        }
        parts.clay.pop();
      }
      if (!lo && i % 3 === 0) parts.mat.box(0, fy + 0.78, z, w * 1.5, 0.03, 0.7, mulc(C.matOld, 0.95), 'y');
    }
  } else if (cargo === 'fish' || cargo === 'empty') {
    // a working boat riding high: baskets, a net or a coil, poles, a water jar
    const [a0, a1] = seg(0.1, 0.9);
    if (cargo === 'fish') { K.netHeap(parts, C, 0, fy, lerp(a0, a1, 0.3), Math.min(0.5, wAt(a0) * 0.7), { floats: !lo }); if (!lo) K.basket(parts, C, 0.25, fy, lerp(a0, a1, 0.7), 0.22, 0.26, mulc(C.linenDirty, 0.9), { sides: 7 }); }
    else { if (!lo) { K.basket(parts, C, -0.3, fy, lerp(a0, a1, 0.2), 0.23, 0.28, C.straw, { sides: 7 }); K.coil(parts, C, 0.3, fy, lerp(a0, a1, 0.75), 0.26, 0.04, 2, { nu: 10, nv: 4 }); } K.jar(parts, C, wAt(a1) * 0.5, fy, a1 - 0.1, 0.8, { sides: lo ? 5 : 8, lo }); K.sack(parts, C, -0.2, fy, lerp(a0, a1, 0.5), { rot: 30, nu: lo ? 5 : 8, nv: lo ? 3 : 5, tie: !lo }); }
    crew.push(stand(0.1, fy, lerp(a0, a1, 0.55), 'stand', 0));
  }
  if (spec.cabin) { const [c0, c1] = seg(0.8, 0.985); K.matCabin(parts, C, c0, c1, wAt(c0, 0.5) * 0.86, fy + 0.1, P.fb + 0.55, { nu: lo ? 1 : 3, nv: lo ? 5 : 8, hoops: !lo }); }
  inHold(false);

  // poles along the gunwale
  if (!lo) K.log(parts, C, [-(H.halfAt(z1 - 0.3, P.fb) - 0.12), P.fb - 0.05, z1 - 0.3], [-(H.halfAt(z0 + 0.4, P.fb) - 0.1), P.fb + 0.02, z1 - 0.3 - Math.min(4.6, (z1 - z0) * 0.9)], 0.03, 0.025, { sides: 5 });

  // the steering sweep on its crutch at the stern quarter
  const zs = L / 2 * 0.86, ys = H.sheerAt(zs) + 0.05, xs = Math.max(0.2, F.half(F.uOf(zs)) - 0.12);
  if (!lo) K.crutch(parts, C, [xs, ys - 0.1, zs], 0.4, 'x', { spread: 0.1, lash: false });
  const piv = [xs, ys + 0.3, zs], tip = [xs + 0.5, -0.5, L / 2 + 2.6 * Math.sqrt(k)], dv = V.sub(tip, piv), hand = V.sub(piv, V.mul(dv, 0.34));
  K.sweepOar(parts, C, hand, piv, tip, { blade: 1.2, bladeW: 0.3 });
  const zst = L / 2 * 0.73;
  crew.unshift(stand(hand[0] - 0.25, H.aftDeckY(Math.max(z1 + 0.25, hand[2] + 0.1)), Math.max(z1 + 0.25, hand[2] + 0.1), 'steer', 0));

  // masts
  let tow = [0, fdy + 0.4, zb];
  if (spec.mast === 'tow') {
    // a short stout tow mast stepped a third of the way aft: the line leads from its head clear of the bank
    const zm = z0 + (z1 - z0) * 0.12, top = P.fb + 3.1;
    parts.wood.tube([[0, fy, zm], [0, top, zm]], (i) => (i ? 0.06 : 0.1), lo ? 5 : 8, mulc(C.wood, 1.0), { capCol: C.woodEnd });
    parts.wood.bar([-wAt(zm, P.fb - 0.13) - 0.1, P.fb - 0.12, zm + 0.14], [wAt(zm, P.fb - 0.13) + 0.1, P.fb - 0.12, zm + 0.14], 0.16, 0.1, mulc(C.woodGrey, 0.9));   // the mast partner (a thwart)
    if (!lo) {
      parts.mat.tube([[0, top - 0.25, zm], [0, top - 0.1, zm]], 0.08, 6, C.rope, { caps: false });
      // stays to the stern quarters and the bitt
      for (const q of [[0, fdy + 0.3, zb], [-xs * 1.6, H.sheerAt(z1) + 0.02, z1], [xs * 1.6, H.sheerAt(z1) + 0.02, z1]]) K.rope(parts, C, [[0, top - 0.15, zm], [q[0], q[1], q[2]]], 0.016, { sides: 3 });
    }
    tow = [0, top - 0.2, zm];
  } else if (spec.mast === 'lowered' && !lo) {
    const y = P.fb + 0.42;
    K.crutch(parts, C, [B * 0.2, P.fb - 0.1, thw[0]], 0.52, 'x', { lash: false }); K.crutch(parts, C, [B * 0.2, P.fb - 0.1, thw[1]], 0.52, 'x', { lash: false });
    K.log(parts, C, [B * 0.2, y, z1 - 0.2], [B * 0.2, y + 0.03, z0 - 0.9], 0.075, 0.055, { col: C.wood, sides: 6 });
  }
  if (!lo) K.lampDish(parts, C, -0.3, H.aftDeckY(zst) + 0.001, zst + 0.3);
  { const zc = Math.min(zb + 0.85, z0 - 0.35); crew.push(stand(0.15, H.foreDeckY(zc), zc, 'crouch', 0)); }
  const meta = { kind: 'barge', name: spec.name, length: L, beam: B, crew, lamp: [-0.3, H.aftDeckY(zst) + 0.12, zst + 0.3], tow, freeboard: P.fb };
  return { parts, meta };
}

// =================================================================================================================
// Quffa: the round coracle of basketry coated with bitumen (R5: 1.4-3 m typical, up to 5.5; 2 men; a donkey aboard)
// =================================================================================================================
export function buildQuffa(C, detail, spec) {
  const parts = makeParts();
  const R = spec.d / 2, lo = detail === 0, n = lo ? 10 : 20, d = spec.draft ?? 0.3, rimY = 0.4 + 0.2 * R, fl = 0.085;
  const hull = parts.hull, th = 0.07;
  const out = [[R * 0.5, -d], [R * 0.82, -d * 0.72], [R * 0.97, -0.06], [R, 0.2], [R * 0.985, rimY * 0.62], [R * 0.93, rimY - 0.05], [R * 0.9, rimY]];
  // the coiled basketry shows through the bitumen as hoops: tone by height
  const body = (p) => mulc(mix(C.bitumen, C.bitumenWorn, 0.2 + 0.6 * clamp(p[1] / rimY)), (0.72 + 0.28 * clamp((p[1] - 0.05) / 0.2)) * (0.8 + 0.3 * h3(Math.round(p[1] * 16), 1, 2) + 0.14 * h3(Math.round(p[0] * 5), Math.round(p[1] * 5), Math.round(p[2] * 5))));
  const wob = (a, y) => 1 + 0.022 * Math.sin(a * 3 + 0.7) + 0.014 * Math.sin(a * 7 + y * 6 + 2.1) + 0.012 * Math.sin(a * 13 + 1.3) * clamp(y * 2 + 0.5);
  hull.lathe(lo ? [out[0], out[2], out[3], out[5], out[6]] : out, n, body, { capBottom: true, wob });
  // rim: a thick roll bound with rope
  parts.mat.surf(n, lo ? 3 : 6, (u, v, i) => { const a = -(i % n) / n * Math.PI * 2, b = v * Math.PI * 2, rr = (R * 0.9 - 0.02) * wob(a, rimY) + 0.07 * Math.cos(b); return [rr * Math.cos(a), rimY + 0.02 + 0.07 * Math.sin(b), rr * Math.sin(a)]; }, (u, v, p) => mulc(mix(C.rope, C.bitumenWorn, 0.35), 0.8 + 0.35 * h3(Math.round(u * n * 3), 1, 4)));
  // inside: the wall down to the floor (kept above the water plane)
  const inn = [[R * 0.82 - th, fl], [R * 0.95 - th, fl + 0.12], [R - th, 0.3], [R * 0.975 - th, rimY * 0.65], [R * 0.9 - th + 0.02, rimY]];
  const occ = (y) => 0.45 + 0.55 * clamp((y - fl) / (rimY - fl));
  hull.lathe(lo ? [inn[0], inn[2], inn[4]] : inn, n, (p) => mulc(mix(C.bitumen, C.bitumenWorn, 0.55), occ(p[1]) * (0.85 + 0.3 * h3(Math.round(p[1] * 16), 3, 2))), { inside: true, capBottom: true, capCol: mulc(mix(C.bitumen, C.bitumenWorn, 0.6), 0.5), wob });
  // willow ribs inside
  if (!lo) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13, pts = inn.map(([r, y]) => [Math.cos(a) * (r - 0.02), y, Math.sin(a) * (r - 0.02)]);
    parts.wood.sweep(pts, 0.045, 0.035, (p) => mulc(C.woodPale, 0.75 * occ(p[1])), [-Math.sin(a), 0, Math.cos(a)], { caps: false });
  }
  for (const s of ['wood', 'mat', 'clay', 'cloth']) parts[s].shade = (x, y) => 0.6 + 0.4 * occ(y);
  const crew = [];
  const fy = fl + 0.005;
  if (spec.cargo === 'donkey') {
    K.donkey(parts, C, 0.12 * R, fy, 0.05 * R, 12, { lo });
    for (const [x, z, rot] of [[-0.48 * R, 0.3 * R, 30], [-0.5 * R, -0.25 * R, 80]]) K.sack(parts, C, x, fy, z, { rot, col: C.sackPale, l: 0.7, w: 0.42, h: 0.3, nu: lo ? 5 : 8, nv: lo ? 3 : 5, tie: !lo });
    if (!lo) K.basket(parts, C, 0.5 * R, fy, 0.45 * R, 0.2, 0.26, C.date, { sides: 7 });
    crew.push(stand(0.02 * R, fy, -0.62 * R, 'paddle', 0), stand(-0.35 * R, fy, 0.55 * R, 'paddle', 0));
  } else if (spec.cargo === 'casks') {
    // palm-wood casks of wine packed in straw (Herodotus 1.194)
    parts.mat.blob([0, fy, 0.1 * R], R * 0.62, 0.22, R * 0.55, (u, v, p) => mulc(C.straw, 0.5 + 0.35 * h3(Math.round(p[0] * 12), Math.round(p[1] * 12), Math.round(p[2] * 12))), { nu: lo ? 6 : 10, nv: 3, from: 0.5 });
    for (const [x, z, rot] of [[-0.22 * R, 0.22 * R, 20], [0.28 * R, 0.25 * R, -30], [0.02 * R, -0.1 * R, 75]]) {
      parts.wood.push(X.of(X.t(x, fy + 0.3, z), X.ry(rot), X.rx(90), X.t(0, -0.36, 0)));
      parts.wood.lathe([[0.2, 0], [0.265, 0.18], [0.275, 0.36], [0.265, 0.54], [0.2, 0.72]], lo ? 6 : 9, (p) => mulc(mix(C.woodPale, C.wood, 0.4), 0.8 + 0.3 * h3(Math.round(p[1] * 9), 2, x)), { capBottom: true, capTop: true, capCol: C.woodEnd });
      parts.wood.pop();
    }
    crew.push(stand(0, fy, -0.6 * R, 'paddle', 0), stand(0.1 * R, fy, 0.62 * R, 'paddle', 0));
  } else if (spec.cargo === 'baskets') {
    const pos = [[-0.3, 0.2], [0.25, 0.3], [0, -0.05], [0.42, -0.12], [-0.4, -0.2]];
    pos.forEach(([x, z], i) => { if (lo && i > 2) return; K.basket(parts, C, x * R, fy, z * R, 0.21 + 0.04 * h3(i, 1, 1), 0.3, [C.date, C.barley, C.date, C.straw, C.barley][i], { sides: lo ? 5 : 7 }); });
    K.jar(parts, C, -0.1 * R, fy, 0.5 * R, 0.75, { sides: lo ? 5 : 8, lo, tone: 0.3 });
    crew.push(stand(0.05 * R, fy, -0.6 * R, 'paddle', 0));
  } else {
    // a ferry: passengers stand; a mat on the floor and a bundle
    parts.mat.lathe([[R * 0.7, fy + 0.01], [0, fy + 0.012]], n, mulc(C.matOld, 0.8), {});
    K.sack(parts, C, 0.35 * R, fy, 0.3 * R, { rot: 40, col: C.cream, l: 0.6, w: 0.4, h: 0.28, nu: lo ? 5 : 8, nv: lo ? 3 : 5, tie: !lo });
    crew.push(stand(0, fy, -0.6 * R, 'paddle', 0), stand(-0.3 * R, fy, 0.1 * R, 'stand', 0), stand(0.3 * R, fy, -0.1 * R, 'stand', 20), stand(0, fy, 0.5 * R, 'sit', 180));
  }
  for (const s of ['wood', 'mat', 'clay', 'cloth']) parts[s].shade = null;
  // a paddle lying across the rim
  if (!lo) { const a = [-R * 0.86, rimY + 0.1, R * 0.3], b = [R * 0.55, rimY + 0.1, R * 0.72]; K.sweepOar(parts, C, a, V.add(a, V.mul(V.sub(b, a), 0.5)), b, { blade: 0.45, bladeW: 0.22 }); }
  const meta = { kind: 'quffa', name: spec.name, length: spec.d, beam: spec.d, crew, lamp: [R * 0.6, rimY + 0.2, 0], tow: [0, rimY, -R * 0.9], freeboard: rimY };
  return { parts, meta };
}

// =================================================================================================================
// Kelek: a raft of poles on inflated goat skins, come down from the north with cut stone and cedar (R5: 4-10 x 3-6 m)
// =================================================================================================================
export function buildKelek(C, detail, spec) {
  const parts = makeParts();
  const L = spec.L ?? 8.6, B = spec.B ?? 5.2, lo = detail === 0, top = 0.44;
  // floats: the outer rows show; the middle is one dark mass
  if (!lo) {
    for (let i = 0; i < 11; i++) for (const s of [-1, 1]) K.skinFloat(parts, C, s * (B / 2 - 0.3), 0.04, lerp(-L / 2 + 0.4, L / 2 - 0.4, i / 10), 0, { nu: 8, nv: 4 });
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) K.skinFloat(parts, C, lerp(-B / 2 + 1.1, B / 2 - 1.1, i / 6), 0.04, s * (L / 2 - 0.26), 90, { nu: 8, nv: 4 });
  }
  parts.cloth.box(0, 0.06, 0, B - (lo ? 0.2 : 1.2), 0.3, L - (lo ? 0.2 : 1.0), mulc(C.hide, lo ? 0.75 : 0.5), 'yY');
  // the frame: cross poles below, long poles above
  const nx = lo ? 5 : 10, nz = lo ? 9 : 19;
  for (let i = 0; i < nx; i++) { const z = lerp(-L / 2 + 0.25, L / 2 - 0.25, i / (nx - 1)); K.log(parts, C, [-B / 2 - 0.1, 0.3, z], [B / 2 + 0.12, 0.3, z], 0.06, 0.05, { sides: lo ? 4 : 5, col: mulc(C.woodPale, 0.8) }); }
  for (let i = 0; i < nz; i++) { const x = lerp(-B / 2 + 0.12, B / 2 - 0.12, i / (nz - 1)), o1 = 0.25 * h3(i, 1, 1), o2 = 0.25 * h3(i, 2, 1); K.log(parts, C, [x, 0.395, -L / 2 - o1], [x, 0.395, L / 2 + o2], lo ? 0.09 : 0.055, lo ? 0.08 : 0.045, { sides: lo ? 4 : 5, col: mulc(mix(C.woodPale, C.woodGrey, h3(i, 3, 1)), 0.95) }); }
  // cargo: dressed limestone blocks on bearers, cedar logs, jars, a low mat shelter
  const stones = [[-0.9, -1.6, 1.15, 0.55, 0.7, 4], [0.5, -1.7, 1.0, 0.5, 0.75, -3], [-0.2, -0.75, 1.3, 0.6, 0.65, 2], [1.35, -0.7, 0.9, 0.45, 0.6, 8]];
  for (const [x, z, sx, sy, sz, rot] of stones) K.stone(parts, C, x, top + 0.08, z, sx, sy, sz, rot, h3(x, 1, z) > 0.7 ? mix(C.limestone, C.breccia, 0.6) : C.limestone);
  for (const z of [-1.9, -0.55]) parts.wood.bar([-1.7, top + 0.04, z], [2.0, top + 0.04, z], 0.1, 0.08, mulc(C.woodDark, 1.1));
  const logs = lo ? 3 : 5;
  for (let i = 0; i < logs; i++) { const lay = i >= 3 ? 1 : 0, x = -1.9 + (lay ? 0.22 + (i - 3) * 0.44 : i * 0.44), r = 0.2; K.log(parts, C, [x, top + r + lay * 0.36, 0.3 + 0.2 * h3(i, 1, 2)], [x, top + r + lay * 0.36, L / 2 - 0.5 - 0.3 * h3(i, 2, 2)], r, r * 0.86, { sides: lo ? 5 : 8, col: mulc(C.wood, 1.1) }); }
  for (const [x, z] of [[1.2, 1.2], [1.75, 1.3], [1.45, 1.75]]) K.jar(parts, C, x, top, z, 0.85, { sides: lo ? 5 : 8, lo, tone: h3(x, 1, z) * 0.5 });
  if (!lo) { K.sack(parts, C, 1.5, top, 2.5, { rot: 20, col: C.sack }); K.coil(parts, C, 0.6, top, 3.2, 0.25, 0.04, 2, { nu: 10, nv: 4 }); }
  // mat shelter: two mats leaning on a ridge pole
  const sy0 = top, sy1 = top + 1.05, sz0 = -3.5, sz1 = -2.25, sx = 1.55;
  parts.mat.quad([sx - 0.85, sy0, sz0], [sx - 0.85, sy0, sz1], [sx, sy1, sz1], [sx, sy1, sz0], (p) => mulc(mix(C.mat, C.matOld, 0.3), 0.85 + 0.2 * h3(Math.round(p[2] * 2), 1, 1)));
  parts.mat.quad([sx, sy1, sz0], [sx, sy1, sz1], [sx + 0.85, sy0, sz1], [sx + 0.85, sy0, sz0], (p) => mulc(C.mat, 0.85 + 0.2 * h3(Math.round(p[2] * 2), 2, 1)));
  parts.mat.quad([sx - 0.83, sy0, sz1], [sx - 0.83, sy0, sz0], [sx, sy1 - 0.03, sz0], [sx, sy1 - 0.03, sz1], mulc(C.matOld, 0.4));
  parts.mat.quad([sx, sy1 - 0.03, sz1], [sx, sy1 - 0.03, sz0], [sx + 0.83, sy0, sz0], [sx + 0.83, sy0, sz1], mulc(C.matOld, 0.4));
  K.log(parts, C, [sx, sy1 + 0.02, sz0 - 0.2], [sx, sy1 + 0.02, sz1 + 0.2], 0.035, 0.03, { sides: 5 });
  // the two sweeps on their forked posts
  for (const s of [-1, 1]) {
    const z = s * (L / 2 - 0.45);
    if (!lo) K.crutch(parts, C, [0, top, z], 0.95, 'x', { spread: 0.13 });
    else parts.wood.tube([[0, top, z], [0, top + 0.95, z]], 0.05, 4, C.woodPale);
    K.sweepOar(parts, C, [0.3 * s, top + 1.25, z - s * 1.5], [0, top + 0.96, z], [-0.35 * s, -0.35, z + s * 3.9], { blade: 1.3, bladeW: 0.3 });
  }
  const meta = { kind: 'kelek', name: spec.name, length: L, beam: B, crew: [stand(0.45, top, L / 2 - 2.0, 'steer', 0), stand(-0.45, top, -L / 2 + 2.0, 'steer', 180), stand(-0.2, top + 0.68, -0.75, 'sit', 90)], lamp: [0.9, top + 0.15, 3.3], tow: [0, top + 0.3, -L / 2], freeboard: top };
  return { parts, meta };
}

// =================================================================================================================
// Reed canoe: a slender boat of bundled reeds with lashed, upturned ends; one man with a pole, a net, a basket of fish
// =================================================================================================================
export function buildCanoe(C, detail, spec) {
  const parts = makeParts();
  const lo = detail === 0, L = spec.L ?? 5.2, B = spec.B ?? 1.0, m = parts.mat;
  const F = K.hullForm({ L, B, fb: 0.3, draft: 0.12, bowRise: 0.42, sternRise: 0.3, endDepth: 0.16, flare: 0.55, t: 0.1, floor: 0.085, pw: 2.0, qw: 0.8 });
  const R0 = C.reedBoat, n = lo ? 7 : 14, sides = lo ? 4 : 6;
  const tone = (k) => (p) => mulc(R0, (0.78 + 0.1 * k) * (0.72 + 0.28 * clamp((p[1] + 0.02) / 0.2)) * (0.85 + 0.3 * h3(Math.round(p[2] * 3), k, Math.round(p[1] * 9))));
  // three bundles a side and one along the keel, tapering into the lashed, upturned ends
  const us = []; for (let i = 0; i <= n; i++) us.push(-0.985 + 1.97 * (0.5 - 0.5 * Math.cos(Math.PI * i / n)));
  const rad = (u) => 0.035 + 0.085 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 0.7);
  const bundle = (side, b, k) => m.tube(us.map((u) => { const q = F.outer(u, 1, b, side, -rad(u) * 0.55); return [side ? q[0] : 0, q[1], q[2]]; }), (i) => rad(us[i]) * (side ? 1 : 1.1), sides, tone(k), { capCol: mulc(R0, 0.5) });
  bundle(0, 0.02, 0);
  for (const side of [-1, 1]) { bundle(side, 0.3, 1); bundle(side, 0.66, 2); bundle(side, 1.0, 3); }
  // the ends: the bundles are drawn together into one tapering horn, bound with cord
  for (const end of [-1, 1]) {
    const path = K.postPath(F, end, end < 0 ? 1.15 : 0.9, { curl: end < 0 ? 104 : 112, n: lo ? 5 : 9 }).slice(4);
    m.tube(path, (i, k) => 0.105 * (1 - k) + 0.028, sides, tone(2), { capCol: mulc(R0, 0.6) });
    if (!lo) for (const k of [0.25, 0.5, 0.72]) { const q = path[Math.round(k * (path.length - 1))], q2 = path[Math.round(k * (path.length - 1)) + 1]; m.tube([q, [q[0], q[1] + (q2[1] - q[1]) * 0.25, q[2] + (q2[2] - q[2]) * 0.25]], 0.105 * (1 - k) + 0.04, 6, mulc(C.rope, 0.75), { caps: false }); }
  }
  // lashings round the hull, and a floor of reed matting between the bundles (kept above the water plane)
  if (!lo) for (let i = 0; i < 9; i++) { const u = lerp(-0.84, 0.84, i / 8), z = F.zOf(u), w = F.half(u) + 0.035, y1 = F.sheer(u) + 0.075, y0 = Math.max(0.0, F.keel(u)); m.tube([[-w, y0 + 0.08, z], [-w, y1, z], [0, y1 - 0.02, z], [w, y1, z], [w, y0 + 0.08, z]], 0.014, 4, mulc(C.rope, 0.7), { caps: false }); }
  const fy = F.floor + 0.02, nf = lo ? 4 : 8;
  m.surf(nf, 1, (u, v, i, j) => { const uu = lerp(-0.8, 0.8, i / nf); return [(j ? 1 : -1) * Math.max(0.02, F.half(uu) - 0.13), Math.max(fy, F.keel(uu) + 0.14), F.zOf(uu)]; }, (u, v, p) => mulc(mix(C.mat, C.matOld, 0.5), 0.5 + 0.2 * h3(Math.round(p[2] * 3), 1, 1)));
  if (spec.cargo !== 'none') {
    K.netHeap(parts, C, 0, fy, -0.5, 0.28, { floats: !lo });
    K.basket(parts, C, 0, fy, 0.45, 0.18, 0.22, mulc(C.linenDirty, 0.95), { sides: lo ? 5 : 7 });
  }
  // the punt pole lies along the boat when it is not in use (moored craft); under way the poler holds his own
  if (!lo) K.log(parts, C, [0.24, 0.44, 1.9], [0.18, 0.5, -2.3], 0.024, 0.02, { sides: 5 });
  const meta = { kind: 'canoe', name: spec.name, length: L, beam: B, crew: [stand(0, fy, 1.35, 'pole', 0), stand(0, fy, -1.2, 'sit', 0)], lamp: [0, 0.5, -1.7], tow: [0, 0.6, -L / 2 + 0.3], freeboard: 0.3 };
  return { parts, meta };
}

/** the fleet: name -> (C, detail) => { parts, meta } */
export const FLEET = {
  bargeGrain: (C, d) => buildBarge(C, d, { name: 'bargeGrain', L: 11.5, B: 3.6, fb: 0.72, draft: 0.5, cargo: 'grain', cabin: true }),
  bargeJars: (C, d) => buildBarge(C, d, { name: 'bargeJars', L: 10.25, B: 3.25, fb: 0.74, draft: 0.45, cargo: 'jars' }),
  bargeReed: (C, d) => buildBarge(C, d, { name: 'bargeReed', L: 8.2, B: 2.6, fb: 0.7, draft: 0.35, cargo: 'reeds', bowRise: 0.7, sternRise: 0.8 }),
  bargeTow: (C, d) => buildBarge(C, d, { name: 'bargeTow', L: 12.6, B: 3.9, fb: 0.78, draft: 0.5, cargo: 'bricks', mast: 'tow' }),
  bargeTimber: (C, d) => buildBarge(C, d, { name: 'bargeTimber', L: 13.2, B: 4.2, fb: 0.8, draft: 0.5, cargo: 'timber', mast: 'tow' }),
  bargeEmpty: (C, d) => buildBarge(C, d, { name: 'bargeEmpty', L: 9.4, B: 3.0, fb: 0.98, draft: 0.16, cargo: 'empty', mast: 'lowered' }),
  skiff: (C, d) => buildBarge(C, d, { name: 'skiff', L: 5.6, B: 1.75, fb: 0.5, draft: 0.2, bowRise: 0.5, sternRise: 0.55, cargo: 'fish', bowPost: 0.35, sternPost: 0.4 }),
  quffaCasks: (C, d) => buildQuffa(C, d, { name: 'quffaCasks', d: 2.7, cargo: 'casks' }),
  quffaDonkey: (C, d) => buildQuffa(C, d, { name: 'quffaDonkey', d: 3.6, cargo: 'donkey', draft: 0.34 }),
  quffaSmall: (C, d) => buildQuffa(C, d, { name: 'quffaSmall', d: 2.0, cargo: 'baskets', draft: 0.24 }),
  quffaFerry: (C, d) => buildQuffa(C, d, { name: 'quffaFerry', d: 3.0, cargo: 'ferry' }),
  kelek: (C, d) => buildKelek(C, d, { name: 'kelek' }),
  canoe: (C, d) => buildCanoe(C, d, { name: 'canoe', cargo: 'net' }),
};
