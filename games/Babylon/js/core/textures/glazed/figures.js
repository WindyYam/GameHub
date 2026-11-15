// glazed/figures.js — the relief animals of the Ishtar Gate and the Processional Way as layered vector drawings.
// OWNER: relief artist. Drawn by hand on the brick grid of the originals, from measurements taken off
// Koldewey 1918 Tafeln 11-15 (Andrae's facsimiles of the white / yellow bull and dragon) and museum panels of
// the striding lion; nothing is traced or pasted. See docs/glazed.md.
//
// Each draw*(P, K) records the figure on a Painter (paths.js) in figure metres: x right, y up, feet on y = 0,
// the animal walking to the RIGHT, inside its cell (module.js FIGURES): bull 1.5 x 1.116, dragon 1.667 x 1.116,
// lion 2.0 x 0.944. K is the colour key of the variant:
//   { body, hair, hairDeep, horn, hoof, crest, mane, maneDeep, line, eye, pupil, mouth, tooth }
import { sp, ln, poly, ell, arc, tube, sample, lengths, along, inside, h2 } from './paths.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ shared bits
/** A row (or several) of hair curls along a centreline: the blue hair bands of the bull. */
function curlBand(P, K, pts, width, rows = 2, seed = 1) {
  const t = tube(pts.map((p) => [p[0], p[1], width]), { start: 'round', end: 'round' });
  P.paint(t.path, K.hairDeep);
  const pl = t.centre, s = t.s, L = s[s.length - 1];
  const r = width / (2 * rows), step = r * 1.9, n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j < rows; j++) {
      // rows are staggered by half a curl, as rows of locks are
      const a = along(pl, s, Math.min(L, (L * (i + (j & 1 ? 0.5 : 0))) / n));
      const off = ((j + 0.5) / rows - 0.5) * width;
      curl(P, K, a.x + a.nx * off, a.y + a.ny * off, r * 0.97, Math.atan2(a.ty, a.tx), h2(i, j, seed));
    }
  }
}
/** One curl: a small rounded knob with a spiral scratch. */
function curl(P, K, x, y, r, ang = 0, rnd = 0.5) {
  P.boss(ell(x, y, r, r * 0.9, ang), K.hair, r < 0.0095 ? 0.0019 : 0.003);
  const a0 = ang + rnd * TAU;
  if (r < 0.0095) P.ink(arc(x + r * 0.08, y, r * 0.36, a0, a0 + 3.4), 0.0022, 0.5, 0.5);   // a tight curl: a comma
  else P.ink(arc(x, y, r * 0.42, a0, a0 + 4.2), 0.003, 0.55, 0.6);
}
/** Curls on a staggered lattice inside a ring. */
function curlPatch(P, K, ring, r, seed = 3) {
  P.paint(poly(ring), K.hairDeep);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const dx = r * 1.95, dy = r * 1.75;
  let j = 0;
  for (let y = y1 - r * 0.9; y > y0; y -= dy, j++) {
    for (let x = x0 + r * (j % 2 ? 1.9 : 0.9), i = 0; x < x1; x += dx, i++) {
      if (inside(ring, x, y)) curl(P, K, x, y, r * 0.97, 0, h2(i, j, seed));
    }
  }
}
/** Eye: almond or round, with a pupil. */
function eye(P, K, x, y, r, ry = r, rot = 0, pupil = 0.7) {
  P.boss(ell(x, y, r, ry, rot), K.eye, 0.0045);
  P.paint(ell(x + r * 0.05, y, r * pupil, ry * pupil, rot), K.pupil);
}

// ------------------------------------------------------------------------------------------------------- bull
/**
 * Aurochs (rimu) of Adad. Profile, striding: one horn sweeping forward and up, ear upright behind it, head
 * carried low on an arched neck; curled hair in bands along the neck crest, down the throat, on the withers,
 * along the back and belly, on the rump and the thigh; tail hanging down behind the hind legs to a long tuft.
 */
export function drawBull(P, K) {
  const B = K.body;
  // far-side legs first (lower relief), then tail, torso, near legs, head
  const legA = sp([[0.34, 0.46], [0.315, 0.39], [0.275, 0.335], [0.235, 0.305], [0.21, 0.284], [0.20, 0.25], [0.186, 0.18], [0.173, 0.11], [0.159, 0.076], [0.158, 0.05, 1], [0.205, 0.045, 1], [0.217, 0.076], [0.213, 0.11], [0.226, 0.17], [0.244, 0.225], [0.264, 0.262], [0.30, 0.285], [0.35, 0.31], [0.41, 0.345], [0.455, 0.40], [0.44, 0.50]]);
  const legC = sp([[0.94, 0.42], [0.905, 0.335], [0.875, 0.265], [0.85, 0.215], [0.842, 0.17], [0.829, 0.11], [0.813, 0.078], [0.815, 0.05, 1], [0.862, 0.045, 1], [0.874, 0.078], [0.869, 0.11], [0.883, 0.16], [0.90, 0.20], [0.918, 0.226], [0.936, 0.26], [0.968, 0.325], [1.01, 0.395], [1.03, 0.45]]);
  const legB = sp([[0.47, 0.42], [0.482, 0.34], [0.497, 0.285], [0.512, 0.245], [0.535, 0.215], [0.556, 0.165], [0.579, 0.11], [0.59, 0.078], [0.607, 0.045, 1], [0.655, 0.045, 1], [0.658, 0.078], [0.637, 0.11], [0.619, 0.17], [0.60, 0.225], [0.588, 0.265], [0.579, 0.31], [0.585, 0.37], [0.61, 0.43], [0.54, 0.48]]);
  const legD = sp([[1.02, 0.42], [1.06, 0.35], [1.095, 0.29], [1.123, 0.243], [1.143, 0.213], [1.165, 0.165], [1.186, 0.11], [1.193, 0.078], [1.203, 0.05, 1], [1.25, 0.045, 1], [1.254, 0.078], [1.237, 0.11], [1.223, 0.16], [1.21, 0.205], [1.205, 0.237], [1.19, 0.29], [1.175, 0.36], [1.172, 0.44], [1.10, 0.48]]);
  // the aurochs is a heavy animal: legs, trunk and neck are fattened (Painter.solid `grow`) beyond the drawn outlines
  const GF = 0.007, GN = 0.009, GT = 0.006;
  const hoof = (xa, xb) => { const x0 = xa - 0.009, x1 = xb + 0.008; return sp([[x0 - 0.002, 0.056, 1], [x0 - 0.009, 0.024], [x0 - 0.001, 0.0, 1], [x1 + 0.022, 0.0, 1], [x1 + 0.032, 0.008], [x1 + 0.013, 0.034], [x1 - 0.002, 0.058, 1]]); };
  const dew = (x, y) => ell(x, y, 0.009, 0.012, 0.5);

  P.solid(legA, B, 0.74, GF); P.solid(legC, B, 0.74, GF);
  P.solid(dew(0.145, 0.06), B, 0.74); P.solid(dew(0.804, 0.058), B, 0.74);
  P.solid(hoof(0.158, 0.205), K.hoof, 0.74); P.solid(hoof(0.815, 0.862), K.hoof, 0.74);

  // tail and tuft
  const tail = tube([[0.325, 0.752, 0.05], [0.26, 0.74, 0.044], [0.205, 0.675, 0.04], [0.178, 0.585, 0.037], [0.172, 0.48, 0.035], [0.178, 0.39, 0.034], [0.162, 0.32, 0.033], [0.125, 0.283, 0.034]], { start: 'flat', end: 'round' });
  P.solid(tail.path, B, 0.9, 0.003);
  const tuftRing = sample([[0.137, 0.292], [0.10, 0.308], [0.058, 0.262], [0.026, 0.172], [0.02, 0.105], [0.05, 0.086], [0.092, 0.122], [0.126, 0.20], [0.142, 0.262]], true, 6);
  P.solid(poly(tuftRing), K.hairDeep, 0.9);

  // torso with neck
  const torso = sp([[0.338, 0.763], [0.40, 0.777], [0.55, 0.776], [0.70, 0.762], [0.84, 0.748], [0.93, 0.757], [1.00, 0.80], [1.045, 0.875], [1.09, 0.945], [1.135, 1.0], [1.18, 1.03], [1.225, 1.035], [1.25, 0.95], [1.246, 0.78], [1.24, 0.68], [1.234, 0.58], [1.224, 0.49], [1.207, 0.425], [1.176, 0.388, 1], [1.05, 0.395], [0.95, 0.405], [0.80, 0.42], [0.66, 0.435], [0.57, 0.42], [0.50, 0.395], [0.43, 0.39], [0.36, 0.42], [0.325, 0.47], [0.305, 0.55], [0.294, 0.64], [0.298, 0.705], [0.314, 0.742]]);
  P.solid(torso, B, 1, GT);
  // sheath
  P.solid(sp([[0.607, 0.44], [0.622, 0.385], [0.632, 0.325, 1], [0.642, 0.385], [0.655, 0.44]]), B, 0.8);

  // near legs
  P.solid(legB, B, 1, GN); P.solid(legD, B, 1, GN);
  P.solid(dew(0.593, 0.06), B); P.solid(dew(1.189, 0.06), B);
  P.solid(hoof(0.607, 0.655), K.hoof); P.solid(hoof(1.203, 1.25), K.hoof);

  // head: ear, horn, skull
  const ear = sp([[1.192, 1.02], [1.186, 1.062], [1.202, 1.097, 1], [1.236, 1.076], [1.262, 1.036], [1.25, 1.015]]);
  P.solid(ear, B, 0.92, 0.004);
  const horn = sp([[1.292, 1.0], [1.325, 1.04], [1.372, 1.055], [1.42, 1.057], [1.456, 1.067], [1.478, 1.083], [1.491, 1.098, 1], [1.494, 1.074], [1.482, 1.046], [1.452, 1.027], [1.415, 1.012], [1.39, 0.992], [1.372, 0.972]]);
  P.solid(horn, K.horn, 0.95, 0.0045);
  const head = sp([[1.20, 1.03], [1.25, 1.037], [1.31, 1.012], [1.346, 0.985], [1.366, 0.94], [1.374, 0.88], [1.368, 0.82], [1.366, 0.765], [1.38, 0.732], [1.397, 0.71], [1.396, 0.686], [1.376, 0.668], [1.34, 0.662], [1.303, 0.668], [1.27, 0.688], [1.24, 0.72], [1.216, 0.758], [1.196, 0.804], [1.186, 0.862], [1.184, 0.93], [1.192, 0.99]]);
  P.solid(head, B, 1, 0.003);

  // ---- modelling
  P.bulge(ell(1.06, 0.585, 0.085, 0.14, 0.25), 0.85, 0.045);     // shoulder
  P.bulge(ell(0.455, 0.585, 0.10, 0.14, -0.2), 0.9, 0.045);      // haunch
  P.bulge(ell(0.78, 0.59, 0.20, 0.11), 0.55, 0.06);              // barrel
  P.bulge(ell(0.615, 0.60, 0.035, 0.11, 0.1), -0.35, 0.03);      // flank hollow
  P.bulge(ell(0.945, 0.60, 0.03, 0.11, -0.1), -0.25, 0.03);      // behind the shoulder
  P.bulge(ell(1.12, 0.86, 0.06, 0.15, -0.55), 0.4, 0.045);       // neck
  P.bulge(ell(1.262, 0.855, 0.058, 0.066), 0.7, 0.025);          // jowl
  P.bulge(ell(1.345, 0.78, 0.02, 0.07, 0.05), 0.35, 0.02);       // nose bridge
  P.bulge(ell(1.31, 0.955, 0.05, 0.035, -0.5), 0.3, 0.02);       // brow
  for (const [x, y, rx, ry, rot] of [[0.52, 0.31, 0.03, 0.07, -0.35], [1.075, 0.33, 0.03, 0.08, -0.55], [0.305, 0.37, 0.035, 0.06, 0.6], [0.905, 0.34, 0.028, 0.07, 0.45]]) P.bulge(ell(x, y, rx, ry, rot), 0.4, 0.02);

  // ---- hair (blue, curled)
  curlBand(P, K, [[1.187, 1.012], [1.14, 0.985], [1.096, 0.93], [1.053, 0.862], [1.012, 0.795], [0.972, 0.752]], 0.046, 3, 11);        // neck crest
  curlBand(P, K, [[0.945, 0.742], [0.84, 0.731], [0.70, 0.745], [0.55, 0.759], [0.44, 0.761]], 0.04, 3, 12);                          // back
  curlPatch(P, K, sample([[0.888, 0.752, 1], [0.955, 0.748], [1.0, 0.765, 1], [1.028, 0.735], [1.0, 0.693], [0.945, 0.682], [0.9, 0.703]], true, 5), 0.0085, 13); // withers
  curlPatch(P, K, [[0.553, 0.748], [0.612, 0.746], [0.612, 0.664], [0.553, 0.664]], 0.0085, 14);                                       // rump
  curlBand(P, K, [[0.395, 0.70], [0.386, 0.62], [0.40, 0.535], [0.437, 0.462], [0.488, 0.408]], 0.052, 3, 15);                          // thigh
  curlBand(P, K, [[0.652, 0.598], [0.70, 0.532], [0.775, 0.487], [0.885, 0.466], [0.997, 0.458]], 0.05, 3, 16);                       // belly
  curlBand(P, K, [[1.196, 0.985], [1.18, 0.93], [1.173, 0.87], [1.176, 0.815], [1.196, 0.778]], 0.032, 2, 17);                          // behind the jaw
  curlBand(P, K, [[1.232, 0.745], [1.228, 0.68], [1.222, 0.58], [1.212, 0.49], [1.195, 0.43], [1.166, 0.402]], 0.03, 2, 18);         // throat and chest
  curlPatch(P, K, tuftRing, 0.0095, 19);                                                                                              // tail tuft

  // ---- incised lines
  // wavy hair of the neck: roughly parallel locks running from the crest down and forward to the throat
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const a = [1.15 - 0.165 * k, 0.955 - 0.205 * k];                 // on the inner edge of the crest band
    const len = 0.07 + 0.2 * Math.sin(Math.min(1, k * 1.3) * Math.PI / 2), dx = 0.36, dy = -0.933;
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8, w = Math.sin(t * TAU * 1.5 + i * 0.7) * 0.006 * Math.sin(t * Math.PI);
      const x = a[0] + dx * len * t - dy * w, y = a[1] + dy * len * t + dx * w;
      if (x < 1.195 - (0.80 - Math.min(0.80, y)) * 0.06) pts.push([x, y]);
    }
    if (pts.length > 2) P.ink(ln(pts), 0.0038, 0.55, 0.8);
  }
  for (let i = 0; i < 7; i++) { const y = 0.47 + i * 0.04, x = 1.168 + (y - 0.47) * 0.1; P.ink(ln([[x, y], [x - 0.022, y - 0.014], [x - 0.036, y - 0.03]]), 0.0035, 0.6, 0.7); }   // chest hatching
  // face
  eye(P, K, 1.312, 0.906, 0.02, 0.014, 0.35, 0.66);
  P.ink(arc(1.312, 0.906, 0.024, 0.1, 2.6), 0.005, 0.8, 1);                                                              // upper lid
  for (let i = 1; i <= 3; i++) P.ink(arc(1.312, 0.906, 0.028 + i * 0.009, -0.25, 2.3), 0.0035, 0.6, 0.8);              // brow wrinkles
  P.ink(ln([[1.336, 0.892], [1.352, 0.85], [1.36, 0.79]]), 0.0035, 0.45, 0.7);                                          // tear line
  P.ink(arc(1.262, 0.855, 0.063, 2.2, 5.0), 0.004, 0.5, 0.9);                                                          // jowl
  P.paint(ell(1.374, 0.71, 0.012, 0.008, 0.4), K.pupil);                                                                // nostril
  P.ink(ln([[1.397, 0.692], [1.372, 0.688], [1.345, 0.696], [1.325, 0.712]]), 0.004, 0.8);                              // mouth
  P.ink(ln([[1.352, 0.73], [1.34, 0.75], [1.338, 0.775]]), 0.0035, 0.45, 0.7);
  P.ink(ln([[1.20, 1.035], [1.207, 1.066], [1.207, 1.086]]), 0.0035, 0.6, 0.7);                                          // ear fold
  P.ink(ln([[1.335, 1.008], [1.38, 1.03], [1.43, 1.039], [1.47, 1.06]]), 0.003, 0.4, 0.6);                              // horn ridge
  P.ink(ln([[1.30, 1.003], [1.33, 0.99], [1.36, 0.983]]), 0.004, 0.7);                                                  // horn base
  // body and legs
  P.ink(ln([[1.035, 0.73], [1.005, 0.64], [1.0, 0.55], [1.02, 0.47]]), 0.004, 0.45, 0.8);                               // shoulder blade
  P.ink(ln([[0.535, 0.735], [0.57, 0.64], [0.575, 0.55], [0.555, 0.47]]), 0.004, 0.45, 0.8);                            // haunch
  P.ink(ln([[0.47, 0.41], [0.52, 0.36], [0.56, 0.37]]), 0.0035, 0.5, 0.7);
  for (const [a, b] of [[[0.24, 0.25], [0.19, 0.07]], [[0.905, 0.20], [0.845, 0.065]], [[0.575, 0.21], [0.63, 0.065]], [[1.165, 0.20], [1.225, 0.07]]]) P.ink(ln([a, [(a[0] + b[0]) / 2 + 0.004, (a[1] + b[1]) / 2], b]), 0.0035, 0.45, 0.7); // tendons
  for (const x of [0.212, 0.826, 0.657, 1.246]) P.ink(ln([[x, 0.05], [x + 0.013, 0.004]]), 0.0035, 0.7, 0.8);           // cloven hooves
  for (const x of [0.181, 0.838, 0.631, 1.226]) P.ink(ln([[x - 0.034, 0.055], [x + 0.036, 0.053]]), 0.0035, 0.7, 0.6);  // coronet
}

// ----------------------------------------------------------------------------------------------------- dragon
/**
 * Mushhushshu, the snake-dragon of Marduk. Scaled body, long neck, horned serpent head with a forked tongue,
 * a spiral curl behind the head and a crest down the neck; lion forelegs, eagle hind legs with talons; the
 * tail raised and ending in a scorpion sting.
 */
export function drawDragon(P, K) {
  const B = K.body;
  // far legs
  const legA = sp([[0.385, 0.38], [0.376, 0.30], [0.352, 0.232], [0.336, 0.16], [0.318, 0.09], [0.303, 0.045, 1], [0.337, 0.04, 1], [0.351, 0.09], [0.367, 0.155], [0.384, 0.205], [0.42, 0.255], [0.46, 0.305], [0.475, 0.38]]);
  const legC = sp([[0.955, 0.37], [0.94, 0.25], [0.922, 0.17], [0.91, 0.10], [0.905, 0.05, 1], [0.965, 0.05, 1], [0.972, 0.11], [0.99, 0.18], [1.015, 0.26], [1.045, 0.345], [1.0, 0.42]]);
  P.solid(legA, B, 0.74, 0.006); P.solid(legC, B, 0.74, 0.007);
  const talonFoot = (ax, lvl) => {   // eagle foot: ankle at (ax, 0.045); hallux back, two toes forward, big hooked talons
    const claw = (x, y, dir, len) => sp([[x, y + 0.013, 1], [x + dir * len * 0.6, y + 0.014], [x + dir * len * 0.95, y - 0.006], [x + dir * len, y - 0.032, 1], [x + dir * len * 0.62, y - 0.012], [x + dir * 0.004, y - 0.012, 1]]);
    P.solid(tube([[ax + 0.03, 0.052, 0.024], [ax + 0.075, 0.05, 0.022], [ax + 0.112, 0.052, 0.019]], { end: 'round' }).path, B, lvl * 0.9);
    P.solid(claw(ax + 0.11, 0.052, 1, 0.062), K.horn, lvl * 0.9);
    P.solid(tube([[ax + 0.004, 0.04, 0.03], [ax - 0.045, 0.03, 0.026], [ax - 0.092, 0.032, 0.021]], { end: 'round' }).path, B, lvl);
    P.solid(tube([[ax + 0.012, 0.04, 0.034], [ax + 0.07, 0.028, 0.028], [ax + 0.128, 0.032, 0.023]], { end: 'round' }).path, B, lvl);
    P.solid(claw(ax - 0.09, 0.032, -1, 0.058), K.horn, lvl);
    P.solid(claw(ax + 0.126, 0.032, 1, 0.064), K.horn, lvl);
    for (const d of [-0.03, -0.055, -0.078, 0.035, 0.06, 0.085, 0.11]) P.ink(ln([[ax + d, 0.044], [ax + d + 0.004, 0.018]]), 0.003, 0.55, 0.6);
  };
  talonFoot(0.318, 0.74);
  const paw = (x0, lvl) => {        // lion paw, heel at x0
    P.solid(sp([[x0 + 0.004, 0.056, 1], [x0 - 0.006, 0.03], [x0, 0.006], [x0 + 0.012, 0.0, 1], [x0 + 0.082, 0.0, 1], [x0 + 0.098, 0.012], [x0 + 0.095, 0.036], [x0 + 0.07, 0.056], [x0 + 0.035, 0.064]]), B, lvl);
    for (const d of [0.05, 0.068, 0.084]) P.ink(arc(x0 + d, 0.012, 0.014, 0.5, 2.3), 0.003, 0.55, 0.7);
    for (const d of [0.062, 0.08, 0.096]) P.paint(ell(x0 + d, 0.008, 0.006, 0.0045), K.horn);
  };
  paw(0.898, 0.74);

  // tail with the scorpion sting
  const tailPts = [[0.44, 0.545, 0.15], [0.385, 0.605, 0.105], [0.345, 0.665, 0.07], [0.303, 0.75, 0.054], [0.264, 0.85, 0.046], [0.24, 0.94, 0.041], [0.225, 1.01, 0.037], [0.206, 1.052, 0.034], [0.172, 1.07, 0.032], [0.138, 1.06, 0.03], [0.112, 1.043, 0.03]];
  const tail = tube(tailPts, { start: 'flat', end: 'round' });
  P.solid(tail.path, B, 0.95, 0.005);
  // the scorpion's sting: a bulb and a thin hooked barb, in the colour of the body (audit: the yellow wedge read as a beak)
  P.solid(ell(0.1, 1.036, 0.027, 0.023, 0.5), B, 0.95);
  P.solid(tube([[0.088, 1.05, 0.02], [0.064, 1.058, 0.014], [0.044, 1.046, 0.009], [0.037, 1.02, 0.004]], { start: 'flat', end: 'point' }).path, B, 0.9, 0.002);

  // torso + neck
  const torsoPts = [[0.40, 0.60], [0.52, 0.605], [0.70, 0.603], [0.85, 0.597], [0.93, 0.595], [0.985, 0.63], [1.04, 0.68], [1.09, 0.735], [1.13, 0.79], [1.165, 0.85], [1.20, 0.90], [1.24, 0.938], [1.285, 0.96], [1.33, 0.968], [1.35, 0.93], [1.345, 0.885], [1.30, 0.868], [1.255, 0.82], [1.218, 0.745], [1.192, 0.65], [1.177, 0.55], [1.168, 0.45], [1.162, 0.36], [1.10, 0.335], [1.0, 0.335], [0.90, 0.345], [0.75, 0.353], [0.65, 0.357], [0.55, 0.33], [0.47, 0.305], [0.40, 0.335], [0.378, 0.42], [0.368, 0.50], [0.365, 0.56]];
  P.solid(sp(torsoPts), B, 1, 0.003);

  // near legs
  const legB = sp([[0.555, 0.33], [0.583, 0.255], [0.603, 0.21], [0.622, 0.155], [0.648, 0.095], [0.673, 0.048, 1], [0.71, 0.048, 1], [0.69, 0.10], [0.673, 0.155], [0.663, 0.20], [0.662, 0.25], [0.66, 0.31], [0.665, 0.37], [0.60, 0.41]]);
  const legD = sp([[1.03, 0.36], [1.075, 0.28], [1.125, 0.205], [1.175, 0.125], [1.215, 0.065], [1.235, 0.045, 1], [1.287, 0.05, 1], [1.265, 0.085], [1.24, 0.15], [1.205, 0.24], [1.175, 0.32], [1.167, 0.39], [1.10, 0.43]]);
  P.solid(legB, B, 1, 0.006); P.solid(legD, B, 1, 0.008);
  talonFoot(0.69, 1);
  paw(1.232, 1);

  // head
  const head = sp([[1.31, 0.968], [1.37, 0.958], [1.44, 0.956], [1.482, 0.94], [1.515, 0.918], [1.545, 0.906], [1.558, 0.896], [1.547, 0.884], [1.50, 0.875], [1.45, 0.864], [1.40, 0.86], [1.36, 0.868], [1.335, 0.89], [1.315, 0.93]]);
  P.solid(head, B, 1, 0.005);
  P.solid(ell(1.527, 0.931, 0.021, 0.019), B, 1, 0.003);                                                 // nose curl
  P.solid(sp([[1.427, 0.955, 1], [1.438, 1.025], [1.445, 1.098, 1], [1.453, 1.025], [1.463, 0.955, 1]]), K.horn);   // horn
  const curlT = tube([[1.398, 0.958, 0.028], [1.35, 0.969, 0.026], [1.303, 0.98, 0.024], [1.28, 1.006, 0.022], [1.288, 1.04, 0.02], [1.32, 1.052, 0.018], [1.346, 1.032, 0.015], [1.338, 1.008, 0.012], [1.32, 1.008, 0.01]], { end: 'round', per: 10 });
  P.solid(curlT.path, K.crest, 0.95);                                                                  // spiral curl behind the head
  P.solid(sp([[1.322, 0.966, 1], [1.362, 0.958, 1], [1.374, 0.872], [1.366, 0.85], [1.345, 0.853], [1.334, 0.872]]), K.crest, 0.9);   // lappet
  // forked tongue
  P.solid(tube([[1.545, 0.893, 0.011], [1.575, 0.888, 0.01], [1.596, 0.90, 0.008], [1.603, 0.924, 0.004]], { end: 'point' }).path, K.horn, 0.8);
  P.solid(tube([[1.556, 0.889, 0.011], [1.60, 0.882, 0.01], [1.626, 0.90, 0.008], [1.633, 0.937, 0.004]], { end: 'point' }).path, K.horn, 0.8);
  // crest down the neck
  const crestPts = [[1.305, 0.973], [1.262, 0.958], [1.222, 0.93], [1.188, 0.892], [1.153, 0.842], [1.12, 0.787], [1.082, 0.735], [1.033, 0.685], [0.98, 0.638], [0.932, 0.603]];
  P.solid(tube(crestPts.map((p) => [p[0], p[1], 0.017]), { start: 'round', end: 'round' }).path, K.crest, 0.95);
  for (const [x, y] of [[1.19, 0.898], [1.084, 0.74]]) P.solid(ell(x - 0.006, y + 0.008, 0.012, 0.012), K.crest, 0.95);
  P.solid(ell(0.925, 0.60, 0.021, 0.019), K.crest, 0.95);

  // ---- modelling
  P.bulge(ell(0.47, 0.47, 0.08, 0.12, 0.1), 0.6, 0.05);      // haunch
  P.bulge(ell(1.09, 0.47, 0.075, 0.12, -0.1), 0.55, 0.05);   // shoulder
  P.bulge(ell(0.78, 0.48, 0.24, 0.09), 0.4, 0.06);           // body
  P.bulge(ell(1.44, 0.915, 0.06, 0.03), 0.4, 0.02);          // skull
  P.bulge(ell(0.615, 0.25, 0.03, 0.08, -0.4), 0.35, 0.02);
  P.bulge(ell(1.12, 0.25, 0.03, 0.09, -0.55), 0.35, 0.02);

  // ---- scales
  const scaleArc = (x, y, r, ang) => P.ink(arc(x, y, r, ang - 1.3, ang + 1.3), 0.0042, 0.8, 0.9);
  // body and thighs: lattice in x, y; free edge of every scale towards the tail
  const bodyRing = sample(torsoPts, true, 5);
  const thighA = [[0.385, 0.38], [0.375, 0.29], [0.352, 0.225], [0.39, 0.205], [0.425, 0.255], [0.46, 0.305], [0.475, 0.38]];
  const thighB = [[0.555, 0.33], [0.585, 0.25], [0.607, 0.205], [0.678, 0.195], [0.665, 0.25], [0.66, 0.31], [0.665, 0.37]];
  const sz = 0.038;
  let j = 0;
  for (let y = 0.615; y > 0.19; y -= sz * 0.62, j++) {
    for (let x = 0.36 + (j % 2 ? sz * 0.5 : 0), i = 0; x < 1.19; x += sz, i++) {
      const inBody = inside(bodyRing, x, y) && y <= 0.6;
      if (inBody || inside(thighA, x, y) || inside(thighB, x, y)) scaleArc(x, y, sz * 0.52, Math.PI + 0.25);
    }
  }
  // neck: lattice along the neck axis, free edges down the neck
  const neckAxis = sample([[1.075, 0.47], [1.11, 0.60], [1.165, 0.72], [1.235, 0.84], [1.31, 0.918]], false, 10), ns = lengths(neckAxis), NL = ns[ns.length - 1];
  for (let d = 0.01, i = 0; d < NL; d += sz * 0.6, i++) {
    const a = along(neckAxis, ns, d), half = 0.105 - 0.062 * (d / NL);
    for (let o = -half + (i % 2 ? sz * 0.5 : 0); o < half; o += sz) {
      const x = a.x + a.nx * o, y = a.y + a.ny * o;
      if (inside(bodyRing, x, y) && y > 0.6) scaleArc(x, y, sz * 0.5, Math.atan2(-a.ty, -a.tx));
    }
  }
  // tail: lattice along the tail, free edges towards the root
  const ts = tail.s, TL = ts[ts.length - 1];
  const cs = lengths(tailPts.map((p) => [p[0], p[1]])), CL = cs[cs.length - 1];
  const tw = (d) => { const q = (d / TL) * CL; let k = 1; while (k < cs.length - 1 && cs[k] < q) k++; const t = Math.max(0, Math.min(1, (q - cs[k - 1]) / (cs[k] - cs[k - 1]))); return tailPts[k - 1][2] + (tailPts[k][2] - tailPts[k - 1][2]) * t; };
  for (let d = 0.03, i = 0; d < TL - 0.01; d += 0.02, i++) {
    const a = along(tail.centre, ts, d), w = tw(d), n = w > 0.05 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const o = ((k + (i % 2 ? 0.5 : 0)) / n - 0.5 + 0.25 / n) * w;
      if (Math.abs(o) < w / 2 - 0.004) scaleArc(a.x + a.nx * o, a.y + a.ny * o, Math.min(0.015, w * 0.3), Math.atan2(-a.ty, -a.tx));
    }
  }
  for (const d of [0.012, 0.045]) { const a = along(tail.centre, ts, TL - d), w = tw(TL - d) / 2 + 0.004; P.ink(ln([[a.x - a.nx * w, a.y - a.ny * w], [a.x + a.nx * w, a.y + a.ny * w]]), 0.004, 0.7, 0.9); }   // joints of the sting
  // head plates, eye, mouth
  for (let i = 0; i < 5; i++) for (let k = 0; k < 2; k++) scaleArc(1.365 + i * 0.03 + (k ? 0.015 : 0), 0.935 - k * 0.028 - i * 0.002, 0.014, Math.PI);
  eye(P, K, 1.452, 0.921, 0.018);
  P.ink(ln([[1.552, 0.894], [1.50, 0.89], [1.44, 0.882], [1.398, 0.878]]), 0.0045, 0.85);
  P.ink(arc(1.527, 0.931, 0.011, 0.3, 4.6), 0.0035, 0.7, 0.8);
  for (const d of [0.012, 0.026]) P.ink(ln([[1.334 + d, 0.955], [1.342 + d, 0.86]]), 0.003, 0.6, 0.7);                  // lappet flutes
  for (let i = 1; i < 14; i++) { const a = along(sample(crestPts, false, 6), lengths(sample(crestPts, false, 6)), i * 0.04); P.ink(ln([[a.x - a.nx * 0.007, a.y - a.ny * 0.007], [a.x + a.nx * 0.007, a.y + a.ny * 0.007]]), 0.003, 0.5, 0.6); }
  // eagle shanks: scutes down the front
  for (const [top, bot] of [[[0.374, 0.19], [0.326, 0.055]], [[0.662, 0.19], [0.698, 0.06]]]) {
    for (let i = 0; i <= 9; i++) { const t = i / 9, x = top[0] + (bot[0] - top[0]) * t, y = top[1] + (bot[1] - top[1]) * t; P.ink(ln([[x - 0.006, y + 0.004], [x + 0.014, y - 0.002]]), 0.003, 0.6, 0.7); }
  }
  // lion forelegs: tendon lines
  P.ink(ln([[1.105, 0.34], [1.16, 0.21], [1.235, 0.085]]), 0.0035, 0.4, 0.7);
  P.ink(ln([[0.985, 0.33], [0.955, 0.2], [0.94, 0.08]]), 0.0035, 0.4, 0.7);
  P.ink(ln([[0.56, 0.47], [0.60, 0.40], [0.655, 0.37]]), 0.0035, 0.4, 0.7);
}

// ------------------------------------------------------------------------------------------------------- lion
/**
 * Striding lion of the Processional Way: mouth open in a snarl, mane of pointed locks over head, neck, shoulder
 * and along the belly, tail hanging low in a long curve with a tuft. opts.tail = 'up' draws the raised tail of the
 * lions of the South Palace throne-room facade instead (figure 'lionUp'); never use that one on the street.
 */
export function drawLion(P, K, opts = {}) {
  const B = K.body, up = opts.tail === 'up';   // 'up': the raised tail of the throne-room lions
  const X = (x) => (x - 0.03) * 0.965 + 0.012;
  const T = (pts) => pts.map((p) => (p.length > 2 ? [X(p[0]), p[1], p[2]] : [X(p[0]), p[1]]));
  const TT = (pts) => pts.map((p) => [X(p[0]), p[1], p[2]]);   // tube points keep their width

  const paw = (x0, lvl) => {
    const x = X(x0) - 0.012, k = 1.2;          // big paws: 18 cm long, 10 cm high
    P.solid(sp([[x + 0.0, 0.082 * k, 1], [x - 0.009, 0.046 * k], [x - 0.006, 0.014], [x + 0.012, 0.0, 1], [x + 0.133 * k, 0.0, 1], [x + 0.151 * k, 0.02 * k], [x + 0.147 * k, 0.052 * k], [x + 0.12 * k, 0.078 * k], [x + 0.064 * k, 0.093 * k]]), B, lvl);
    for (const d of [0.072, 0.1, 0.126]) P.ink(arc(x + d * k, 0.02, 0.024, 0.45, 2.5), 0.004, 0.6, 0.8);
    for (const d of [0.093, 0.12, 0.144]) P.paint(ell(x + d * k, 0.013, 0.01, 0.007), K.claw);
  };
  const GH = 0.008, GFo = 0.012, GT = 0.006;   // grow: hind legs, forelegs, trunk
  // far legs
  const legA = sp(T([[0.80, 0.38], [0.72, 0.285], [0.65, 0.24], [0.612, 0.215], [0.60, 0.15], [0.595, 0.085], [0.585, 0.06, 1], [0.685, 0.065, 1], [0.682, 0.105], [0.72, 0.15], [0.80, 0.20], [0.90, 0.275], [0.95, 0.33], [0.90, 0.42]]));
  const legC = sp(T([[1.47, 0.38], [1.42, 0.26], [1.385, 0.18], [1.365, 0.11], [1.36, 0.06, 1], [1.495, 0.065, 1], [1.47, 0.10], [1.48, 0.17], [1.52, 0.25], [1.57, 0.335], [1.55, 0.41]]));
  P.solid(legA, B, 0.74, GH); P.solid(legC, B, 0.74, GFo);
  paw(0.54, 0.74); paw(1.358, 0.74);

  // tail
  const tail = tube(TT(up
    ? [[0.78, 0.655, 0.056], [0.70, 0.662, 0.045], [0.625, 0.69, 0.04], [0.565, 0.74, 0.038], [0.525, 0.805, 0.037], [0.485, 0.86, 0.036], [0.44, 0.885, 0.036]]
    : [[0.78, 0.655, 0.056], [0.70, 0.652, 0.044], [0.63, 0.618, 0.04], [0.565, 0.562, 0.038], [0.505, 0.487, 0.037], [0.44, 0.405, 0.036], [0.37, 0.347, 0.036], [0.30, 0.318, 0.036], [0.23, 0.312, 0.036], [0.165, 0.327, 0.036], [0.125, 0.355, 0.036]]), { start: 'flat', end: 'round' });
  P.solid(tail.path, B, 0.9, 0.004);
  const tuft = sp(T(up ? [[0.452, 0.868], [0.457, 0.912], [0.422, 0.934], [0.382, 0.922], [0.366, 0.888], [0.386, 0.86], [0.42, 0.853]] : [[0.14, 0.342], [0.132, 0.405], [0.092, 0.438], [0.048, 0.42], [0.032, 0.375], [0.052, 0.336], [0.098, 0.326]]));
  P.solid(tuft, K.mane, 0.95, 0.004);

  // torso
  const torso = sp(T([[0.762, 0.64], [0.775, 0.672], [0.85, 0.672], [1.0, 0.662], [1.2, 0.65], [1.38, 0.652], [1.45, 0.688], [1.52, 0.752], [1.60, 0.822], [1.68, 0.877], [1.76, 0.907], [1.83, 0.907], [1.885, 0.885], [1.90, 0.80], [1.88, 0.66], [1.87, 0.56], [1.857, 0.48], [1.86, 0.40], [1.80, 0.365], [1.60, 0.352], [1.40, 0.35], [1.2, 0.345], [1.06, 0.33], [0.95, 0.31], [0.85, 0.30], [0.795, 0.36], [0.77, 0.46], [0.763, 0.56]]));
  P.solid(torso, B, 1, GT);

  // near legs
  const legB = sp(T([[0.925, 0.34], [0.905, 0.23], [0.912, 0.15], [0.955, 0.095], [1.02, 0.058], [1.06, 0.048, 1], [1.13, 0.078, 1], [1.075, 0.092], [1.025, 0.125], [0.995, 0.18], [1.02, 0.25], [1.065, 0.33], [1.0, 0.40]]));
  const legD = sp(T([[1.70, 0.38], [1.755, 0.27], [1.81, 0.18], [1.865, 0.105], [1.90, 0.068, 1], [2.03, 0.062, 1], [1.985, 0.088], [1.945, 0.125], [1.905, 0.20], [1.875, 0.30], [1.867, 0.40], [1.80, 0.46]]));
  P.solid(legB, B, 1, GH); P.solid(legD, B, 1, GFo);
  paw(1.058, 1); paw(1.902, 1);

  // head with open mouth: blocky skull, wrinkled snout, the short lower jaw dropped
  // (audit: the first head had a long sloping dog's profile and a mouth barely ajar; the panels in Chicago, New York
  //  and Berlin show a short, deep head with a high brow, a blunt wrinkled nose and the jaws wide open in a roar)
  P.solid(sp(T([[1.905, 0.652, 1], [1.95, 0.664], [2.0, 0.67], [2.05, 0.674], [2.072, 0.678, 1], [2.05, 0.61], [2.026, 0.566, 1], [2.0, 0.584], [1.95, 0.618]])), K.mouth, 0.3);   // inside of the mouth, recessed
  const head = sp(T([[1.80, 0.90], [1.87, 0.902], [1.925, 0.876], [1.96, 0.842], [1.984, 0.802], [2.018, 0.776], [2.052, 0.754], [2.074, 0.732], [2.081, 0.706], [2.074, 0.682], [2.05, 0.673], [2.0, 0.669], [1.95, 0.663], [1.905, 0.652, 1], [1.95, 0.618], [2.0, 0.585], [2.028, 0.566, 1], [2.034, 0.543], [2.012, 0.517], [1.962, 0.506], [1.912, 0.515], [1.876, 0.55], [1.852, 0.62], [1.83, 0.72]]));
  P.solid(head, B, 1, 0.004);

  // ---- modelling
  P.bulge(ell(X(0.90), 0.50, 0.10, 0.13, -0.15), 0.7, 0.05);     // haunch
  P.bulge(ell(X(1.69), 0.48, 0.07, 0.10, 0.2), 0.6, 0.04);       // shoulder
  P.bulge(ell(X(1.22), 0.52, 0.24, 0.10), 0.45, 0.06);           // ribcage
  P.bulge(ell(X(1.05), 0.50, 0.03, 0.10, 0.1), -0.3, 0.03);      // flank
  P.bulge(ell(X(1.97), 0.70, 0.07, 0.05, -0.5), 0.5, 0.025);     // muzzle
  P.bulge(ell(X(1.94), 0.835, 0.035, 0.03), 0.45, 0.02);         // brow
  P.bulge(ell(X(1.95), 0.555, 0.05, 0.03, 0.4), 0.35, 0.02);     // lower jaw
  for (const [x, y, rx, ry, rot] of [[0.97, 0.20, 0.035, 0.07, 0.3], [1.86, 0.22, 0.03, 0.09, -0.5], [0.72, 0.22, 0.05, 0.035, 0.55], [1.44, 0.2, 0.035, 0.08, 0.35]]) P.bulge(ell(X(x), y, rx, ry, rot), 0.4, 0.02);

  // ---- mane: head, neck, shoulder, chest and the fringe under the belly
  const maneRing = sample(T([[1.40, 0.652], [1.45, 0.686], [1.52, 0.75], [1.60, 0.82], [1.68, 0.874], [1.76, 0.904], [1.83, 0.904], [1.88, 0.888], [1.908, 0.86], [1.885, 0.80], [1.878, 0.70], [1.876, 0.62], [1.866, 0.575], [1.858, 0.50], [1.856, 0.43], [1.80, 0.385, 1], [1.62, 0.362], [1.45, 0.354], [1.25, 0.348], [1.09, 0.336], [1.03, 0.35, 1], [1.045, 0.43], [1.11, 0.495], [1.24, 0.522], [1.36, 0.535], [1.425, 0.565], [1.415, 0.61]]), true, 5);
  P.paint(poly(maneRing), K.maneDeep);
  // locks: pointed leaves on a staggered lattice, flowing away from the face and back along the belly
  const src = [X(1.94), 0.77];
  const locks = [];
  let j = 0;
  for (let y = 0.895; y > 0.335; y -= 0.031, j++) {
    for (let x = X(1.0) + (j % 2 ? 0.027 : 0), i = 0; x < X(1.92); x += 0.054, i++) {
      if (!inside(maneRing, x, y)) continue;
      const dx = x - src[0], dy = y - src[1], d = Math.hypot(dx, dy) || 1;
      const w = Math.max(0, Math.min(1, 1.15 - d / 0.42));
      let fx = (dx / d) * w + -0.97 * (1 - w), fy = (dy / d) * w + -0.24 * (1 - w);
      const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
      const len = 0.09 + 0.02 * h2(i, j, 5), wid = 0.0225;
      const tx = x + fx * len, ty = y + fy * len;
      if (!inside(maneRing, tx, ty) && !inside(maneRing, x + fx * len * 0.6, y + fy * len * 0.6)) continue;
      locks.push({ x, y, tx, ty, fx, fy, wid, d, bend: (h2(i, j, 6) - 0.5) * 0.012 });
    }
  }
  locks.sort((a, b) => b.d - a.d);
  for (const l of locks) {
    const mx = (l.x + l.tx) / 2, my = (l.y + l.ty) / 2, nx = -l.fy, ny = l.fx;
    const p = new Path2D();
    p.moveTo(l.x, l.y);
    p.quadraticCurveTo(mx + nx * (l.wid + l.bend), my + ny * (l.wid + l.bend), l.tx, l.ty);
    p.quadraticCurveTo(mx - nx * (l.wid - l.bend), my - ny * (l.wid - l.bend), l.x, l.y);
    p.closePath();
    P.boss(p, K.mane, 0.004);
  }
  // tail tuft locks
  { const ox = up ? 0.322 : 0, oy = up ? 0.512 : 0; for (let i = 0; i < 5; i++) P.ink(ln(T([[ox + 0.128 - i * 0.004, oy + 0.352 + i * 0.012], [ox + 0.09 - i * 0.004, oy + 0.36 + i * 0.014], [ox + 0.05 + i * 0.004, oy + 0.372 + i * 0.01]])), 0.0035, 0.6, 0.8); }

  // ---- face
  P.boss(ell(X(1.828), 0.826, 0.05, 0.037, 0.25), K.mane, 0.005);                              // ear: a rounded lump in the mane
  P.ink(arc(X(1.832), 0.822, 0.024, 0.3, 3.4), 0.004, 0.55, 0.8);
  P.boss(ell(X(1.838), 0.748, 0.036, 0.034), K.mane, 0.005);                                   // cheek ruff
  P.boss(sp(T([[1.80, 0.70], [1.845, 0.665], [1.872, 0.60], [1.862, 0.56], [1.846, 0.532, 1], [1.812, 0.58], [1.792, 0.65]])), K.mane, 0.005);   // beard
  for (let i = 0; i < 3; i++) P.ink(ln(T([[1.812 + i * 0.016, 0.69 - i * 0.01], [1.826 + i * 0.012, 0.62 - i * 0.008], [1.842 + i * 0.004, 0.55 + i * 0.012]])), 0.0035, 0.5, 0.7);
  eye(P, K, X(1.952), 0.795, 0.021, 0.014, -0.4, 0.6);
  P.ink(ln(T([[1.912, 0.818], [1.942, 0.826], [1.972, 0.816], [1.99, 0.8]])), 0.0055, 0.8, 1);     // brow ridge
  P.ink(ln(T([[1.9, 0.84], [1.935, 0.848], [1.965, 0.838]])), 0.0035, 0.5, 0.7);
  for (let i = 0; i < 4; i++) P.ink(ln(T([[1.996 + i * 0.018, 0.772 - i * 0.012], [2.008 + i * 0.018, 0.748 - i * 0.011], [2.006 + i * 0.018, 0.722 - i * 0.008]])), 0.0035, 0.6, 0.9);   // wrinkled snout
  P.paint(ell(X(2.071), 0.712, 0.013, 0.012, 0.3), K.pupil);                                   // nose leather
  P.paint(ell(X(1.985), 0.612, 0.034, 0.013, -0.62), '#A0483A');                               // tongue
  P.paint(sp(T([[2.058, 0.675, 1], [2.05, 0.632, 1], [2.036, 0.672, 1]])), K.tooth);           // fangs: upper
  P.paint(sp(T([[2.02, 0.572, 1], [2.026, 0.612, 1], [2.006, 0.582, 1]])), K.tooth);           //        lower
  for (let i = 0; i < 3; i++) P.paint(sp(T([[1.99 - i * 0.022, 0.669 - i * 0.002, 1], [1.983 - i * 0.022, 0.652 - i * 0.002, 1], [1.976 - i * 0.022, 0.668 - i * 0.002, 1]])), K.tooth);   // cheek teeth
  P.ink(ln(T([[2.076, 0.692], [2.04, 0.688], [1.99, 0.684], [1.94, 0.678], [1.908, 0.665]])), 0.004, 0.6, 0.8);  // curled upper lip
  P.ink(ln(T([[1.90, 0.85], [1.888, 0.78], [1.886, 0.70], [1.868, 0.61]])), 0.004, 0.5, 0.8);  // where the mane frames the face
  P.ink(ln(T([[1.9, 0.632], [1.893, 0.585], [1.908, 0.542]])), 0.004, 0.5, 0.8);               // jaw
  for (let i = 0; i < 3; i++) P.paint(ell(X(2.03 + i * 0.012), 0.702 - i * 0.004, 0.0035, 0.0035), K.pupil);   // whisker roots

  // ---- body lines
  P.ink(ln(T([[0.99, 0.63], [1.03, 0.54], [1.03, 0.44], [1.0, 0.36]])), 0.004, 0.45, 0.8);  // haunch
  P.ink(ln(T([[0.83, 0.60], [0.86, 0.50], [0.90, 0.42]])), 0.0035, 0.35, 0.7);
  for (const [a, b] of [[[0.94, 0.17], [1.04, 0.07]], [[1.83, 0.19], [1.93, 0.085]], [[0.63, 0.20], [0.625, 0.08]], [[1.40, 0.18], [1.39, 0.08]]]) P.ink(ln(T([a, b])), 0.0035, 0.4, 0.7);
}

// ---------------------------------------------------------------------------------------------------- rosette
/** White daisy rosette with a yellow centre, flat glaze: `petals` petals, outer radius r. Centre at (0, 0). */
export function drawRosette(g, r, petals, K) {
  const r0 = r * 0.36, wOut = (TAU * r) / petals * 0.46;
  g.lineJoin = 'round';
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU + TAU / petals / 2, c = Math.cos(a), s = Math.sin(a);
    const px = (u, v) => [u * c - v * s, u * s + v * c];
    const p = new Path2D();
    const A = px(r0 * 0.9, -wOut * 0.3), Bq = px(r * 0.8, -wOut), C = px(r, 0), D = px(r * 0.8, wOut), E = px(r0 * 0.9, wOut * 0.3);
    p.moveTo(A[0], A[1]); p.quadraticCurveTo(Bq[0], Bq[1], C[0], C[1]); p.quadraticCurveTo(D[0], D[1], E[0], E[1]); p.closePath();
    g.fillStyle = K.white; g.fill(p);
    g.strokeStyle = K.line; g.lineWidth = r * 0.045; g.globalAlpha = 0.85; g.stroke(p); g.globalAlpha = 1;
  }
  g.beginPath(); g.arc(0, 0, r0, 0, TAU); g.fillStyle = K.yellow; g.fill();
  g.strokeStyle = K.line; g.lineWidth = r * 0.05; g.globalAlpha = 0.85; g.stroke(); g.globalAlpha = 1;
}

export const DRAW = { bull: drawBull, dragon: drawDragon, lion: drawLion, lionUp: (P, K) => drawLion(P, K, { tail: 'up' }) };
