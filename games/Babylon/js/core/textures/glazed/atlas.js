// glazed/atlas.js — builds the glazed-brick atlas: albedo, height field, normal map, roughness.
// OWNER: relief artist. DOM canvas + typed arrays; no THREE (so it also runs in the stand-alone preview,
// js/core/textures/glazed/dev/). Deterministic: every random value is a hash of (region, brick, course).
//
// Layout (32 bricks = 10.67 m wide; `U` px per half brick, `V` px per course; final U = 64, V = 32: 384 x 373 px/m,
// a 4096 x 4096 atlas; draft U = 32, V = 16: 2048 x 2048):
//   rows of figure cells, each stored with a margin of ground bricks (1 half brick, 1 course) on every side, and the
//   corner stripe; then full-width strips that tile along u: blue field (16 courses + guards), checker border (3),
//   rosette band (5), lapis and turquoise fields (14 each), plain colours (2 each).
// U and V are powers of two, so that every mip level averages whole joints (no beat lines at distance).
// Every region lies on the brick grid; joints, per-brick tone, tilt and arris rounding run through the figures.
import { BRICK, HB, COURSE, BRICKS_ACROSS, FIGURES, BANDS, COURSES, COURSE_STRIP, CELL_MARGIN, CORNER, groundOf } from './module.js';
import { Painter } from './paths.js';
import { DRAW, drawRosette } from './figures.js';


// relief constants (metres)
const R = {
  sil: 0.024, silR: 0.024,     // height and bevel radius of the silhouette
  form: 0.018,                 // amplitude of the soft modelling
  raise: 0.005, raiseR: 0.006, // curls, mane locks, eye rims
  cut: 0.0034,                 // incised lines
  joint: 0.0026,               // joint recess
  arris: 0.0007,               // rounding of the brick edges (hand-made bricks: a soft arris, not a pillow)
  tilt: 0.007,                 // per-brick tilt (slope, +-)
  step: 0.0005,                // per-brick offset (+-)
  wave: 0.0006,                // unevenness of the glazed face (+-)
};
// Brick-to-brick colour of the blue glazes (R2 13, SPEC 3.6: "hand-made variation from turquoise to deep lapis"):
// every brick takes a shade between the palette's dark and light blue round the ground colour, and LEAN of the
// bricks lean towards turquoise. Audit: the first version varied the value by +-6.5 % only and no brick read turquoise.
const LEAN = 0.14, LEAN_TO = [42, 127, 166];   // #2A7FA6 (R2 13)

function hash(i, j, seed) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Colour key of a figure variant (palette: world.json palette.materials). */
export function colourKey(kind, variant, pal) {
  const white = pal.glazeWhite, yellow = pal.glazeYellow, red = pal.glazeRed, line = pal.glazeBlack;
  const ochre = variant % 2 === 1;
  const K = { line, body: ochre ? yellow : white, eye: '#F3EEDD', pupil: '#151515', tooth: '#F3EEDD', mouth: '#2A1512' };
  if (kind === 'bull') Object.assign(K, { hair: pal.glazeBlueLight, hairDeep: pal.glazeBlueDark, horn: ochre ? red : yellow, hoof: ochre ? red : yellow });
  else if (kind === 'dragon') Object.assign(K, { horn: ochre ? red : yellow, crest: ochre ? red : css(mix(hexRGB(yellow), hexRGB(red), 0.18)) });
  else Object.assign(K, { mane: ochre ? red : yellow, maneDeep: css(mix(hexRGB(ochre ? red : yellow), [58, 26, 10], ochre ? 0.45 : 0.3)), claw: ochre ? red : yellow, eye: ochre ? '#F3EEDD' : css(mix(hexRGB(yellow), [255, 255, 255], 0.35)) });
  return K;
}

// ---------------------------------------------------------------------------------------------- distance field
/** Squared Euclidean distance to the nearest zero of `f` (Felzenszwalb & Huttenlocher), in place on a w x h grid. */
function edt(f, w, h) {
  const n = Math.max(w, h), d = new Float32Array(n), z = new Float32Array(n + 1), v = new Int32Array(n), g = new Float32Array(n);
  const INF = 1e20;
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + g[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) g[y] = f[y * w + x]; pass(h); for (let y = 0; y < h; y++) f[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) g[x] = f[o + x]; pass(w); for (let x = 0; x < w; x++) f[o + x] = d[x]; }
  return f;
}
/** Box blur of a float field, radius r px, `times` passes (in place, returns the field). */
function boxBlur(a, w, h, r, times = 1) {
  if (r < 1) return a;
  const tmp = new Float32Array(a.length), k = 1 / (2 * r + 1);
  for (let t = 0; t < times; t++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { tmp[o + x] = s * k; s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s * k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
  }
  return a;
}
const bevel = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : Math.sqrt(1 - (1 - t) * (1 - t)));

/**
 * Relief of one figure (walking right), stored cell with margins, as a height field in metres at 1x.
 * Built at `ss` x supersampling from the painter's sil / form / raise / cut layers.
 */
function buildRelief(kind, U, V, ss) {
  const F = FIGURES[kind], M = CELL_MARGIN;
  const w = (F.hb + 2 * M.hb) * U, h = (F.courses + 2 * M.courses) * V, W = w * ss, H = h * ss;
  const mk = (bg) => { const g = makeCanvas(W, H).getContext('2d', { willReadFrequently: true }); g.fillStyle = bg; g.fillRect(0, 0, W, H); return g; };
  const L = { col: null, sil: mk('#000'), form: mk('rgb(128,128,128)'), raise: mk('#000'), cut: mk('#000') };
  const sx = (U / HB) * ss, sy = (V / COURSE) * ss;
  const kx = F.stretch || 1;   // a figure may be stretched along the wall about the centre of its cell
  const P = new Painter(L, { sx: sx * kx, sy, ox: M.hb * U * ss + (F.cellW / 2) * sx * (1 - kx), oy: (F.courses + M.courses) * V * ss, mirror: false, cellW: F.cellW }, { line: '#000' });
  DRAW[kind](P, {});
  P.flush();
  const red = (g) => { const d = g.getImageData(0, 0, W, H).data, a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255; return a; };
  const sil = red(L.sil), form = red(L.form), raise = red(L.raise), cut = red(L.cut);
  const N = W * H, INF = 1e20;
  // silhouette: distance inside, level, bevel
  const dS = new Float32Array(N); for (let i = 0; i < N; i++) dS[i] = sil[i] > 0.3 ? INF : 0;
  edt(dS, W, H);
  const level = boxBlur(sil.slice(), W, H, Math.round(1.5 * ss), 2);
  const dR = new Float32Array(N); for (let i = 0; i < N; i++) dR[i] = raise[i] > 0.5 ? INF : 0;
  edt(dR, W, H);
  boxBlur(cut, W, H, Math.max(1, Math.round(0.5 * ss)), 1);
  boxBlur(form, W, H, ss, 2);
  const big = new Float32Array(N);
  const rs = R.silR * sx, rr = R.raiseR * sx;
  for (let i = 0; i < N; i++) {
    const ds = Math.sqrt(dS[i]);
    let v = 0;
    if (ds > 0) {
      const p = bevel((ds - 0.5) / rs);
      v = R.sil * p * Math.min(1, level[i]) + R.form * (form[i] - 0.5) * 2 * p;
      const dr = Math.sqrt(dR[i]);
      if (dr > 0) v += R.raise * bevel((dr - 0.5) / rr);
      v -= R.cut * cut[i] * Math.min(1, p * 3);
    }
    big[i] = v;
  }
  // downsample
  const out = new Float32Array(w * h), k = 1 / (ss * ss);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let b = 0; b < ss; b++) { const o = (y * ss + b) * W + x * ss; for (let a = 0; a < ss; a++) s += big[o + a]; }
    out[y * w + x] = s * k;
  }
  return { w, h, data: out };
}

// ------------------------------------------------------------------------------------------------------ atlas
/**
 * Build the atlas.
 * opts: { palette (world.json palette.materials), U = 64 (px per half brick), V = 32 (px per course), ss = 2,
 *         seed = 575, gutter, clock (dev preview only: () => milliseconds, fills `ms`) }
 * Returns { width, height, U, V, albedo, normal, orm (Uint8ClampedArray RGBA, row 0 = TOP), height (Float32Array, metres),
 *           canvas (flat colours before bricks), regions: { key: region }, ms: { ... } }.
 * region: { key, type: 'cell' | 'strip', x, y, w, h (px of the stored region), cx, cy, cw, ch (px of the cell proper),
 *           hb, courses, kind, facing, variant, ground }
 * orm: R = cavity occlusion, G = roughness, B = relief height (0..255 over -4..+46 mm).
 */
export function buildAtlas(opts) {
  const pal = opts.palette, U = opts.U ?? 64, V = opts.V ?? 32, ss = opts.ss ?? 2, seed = opts.seed ?? 575;
  const G = opts.gutter ?? Math.max(4, V >> 2);
  const M = CELL_MARGIN, W = BRICKS_ACROSS * 2 * U;
  const now = opts.clock || (() => 0);   // the engine passes no clock (no wall-clock time in scene code); the dev preview does, for `ms`
  const t0 = now(), ms = {};

  // ---- layout
  const regions = {}, list = [];
  let y = 0;
  const cellSize = (kind) => { const F = FIGURES[kind]; return [(F.hb + 2 * M.hb) * U, (F.courses + 2 * M.courses) * V]; };
  const addCell = (kind, facing, variant, x, yy) => {
    const F = FIGURES[kind], [w, h] = cellSize(kind);
    const r = { key: `${kind}:${facing}:${variant}`, type: 'cell', kind, facing, variant, ground: groundOf(kind, variant), x, y: yy, w, h, cx: x + M.hb * U, cy: yy + M.courses * V, cw: F.hb * U, ch: F.courses * V, hb: F.hb, courses: F.courses };
    regions[r.key] = r; list.push(r); return r;
  };
  for (const facing of ['L', 'R']) { let x = 0; for (const v of [0, 3, 1, 2]) { addCell('lion', facing, v, x, y); x += cellSize('lion')[0]; } y += cellSize('lion')[1]; }   // same grounds side by side
  for (const [kind, extra] of [['bull', 'L'], ['dragon', 'R']]) {      // the raised-tail lion fills the end of each row
    let x = 0;
    for (const facing of ['L', 'R']) for (let v = 0; v < 2; v++) { addCell(kind, facing, v, x, y); x += cellSize(kind)[0]; }
    addCell('lionUp', extra, 0, W - cellSize('lionUp')[0], y);
    y += cellSize(kind)[1];
  }
  // the corner stripe, in the free space beside the lions (two lion rows = 26 courses = 24 + margins). Stored once,
  // with the corner on its LEFT; the right-hand one is the same texels mirrored.
  {
    const x = (4 * (FIGURES.lion.hb + 2 * M.hb) + 1) * U, w = (CORNER.hb + 2 * M.hb) * U, h = (CORNER.courses + 2 * M.courses) * V;
    const r = { key: 'corner:L', type: 'cell', kind: 'corner', facing: 'L', variant: 0, ground: 'glazeBlue', x, y: 0, w, h, cx: x + M.hb * U, cy: M.courses * V, cw: CORNER.hb * U, ch: CORNER.courses * V, hb: CORNER.hb, courses: CORNER.courses };
    regions[r.key] = r; list.push(r);
  }
  // A strip may carry `guard` courses of the same plain bricks above and below it. They are never mapped: they keep
  // the coarse mip levels of a stacked field from picking up the neighbouring strip (a line every 2 m at distance).
  const addStrip = (key, courses, extra, guard = 0) => {
    y += G + guard * V;
    const r = { key, type: 'strip', x: 0, y, w: W, h: courses * V, cx: 0, cy: y, cw: W, ch: courses * V, hb: BRICKS_ACROSS * 2, courses, guard, ...extra };
    regions[key] = r; list.push(r); y += r.h + guard * V + G; return r;
  };
  addStrip('course:glazeBlue', COURSE_STRIP.glazeBlue, { ground: 'glazeBlue' }, 2);
  addStrip('checker', BANDS.checker.courses, { ground: 'glazeYellow', band: 'checker' });
  addStrip('rosette', BANDS.rosette.courses, { ground: 'glazeBlue', band: 'rosette' });
  addStrip('course:glazeBlueDark', COURSE_STRIP.glazeBlueDark, { ground: 'glazeBlueDark' });
  addStrip('course:glazeTurquoise', COURSE_STRIP.glazeTurquoise, { ground: 'glazeTurquoise' });
  for (const id of COURSES) if (!regions['course:' + id]) addStrip('course:' + id, COURSE_STRIP[id], { ground: id });
  const Ht = Math.max(y, 1 << Math.ceil(Math.log2(y) - 0.05));   // a power of two when the content comes close to one

  // ---- flat colours on a canvas
  const canvas = makeCanvas(W, Ht), g = canvas.getContext('2d', { willReadFrequently: true });
  g.fillStyle = pal.glazeBlue; g.fillRect(0, 0, W, Ht);
  const sx = U / HB, sy = V / COURSE;
  for (const r of list) {
    { const pad = r.type === 'strip' ? G + r.guard * V : 0; g.fillStyle = pal[r.ground]; g.fillRect(r.x, r.y - pad, r.w, r.h + 2 * pad); }
    if (r.kind === 'corner') {
      // quarter-brick columns from the corner inwards: blue, red, yellow, insets, yellow, blue
      const q = U / 2, left = r.facing === 'L';
      const col = (i) => (left ? r.cx + i * q : r.cx + r.cw - (i + 1) * q);
      g.fillStyle = pal.glazeRed; g.fillRect(col(1), r.y, q, r.h);
      g.fillStyle = pal.glazeYellow; g.fillRect(Math.min(col(2), col(4)), r.y, 3 * q, r.h);
      for (let j = -M.courses; j < r.courses + M.courses; j++) {
        if (((j % CORNER.period) + CORNER.period) % CORNER.period >= 2) continue;
        if ((((j % CORNER.period) + CORNER.period) % CORNER.period) !== 0) continue;
        const yb = r.cy + r.ch - j * V, hh = 2 * V;                       // two courses, bottom at yb
        g.fillStyle = pal.glazeBlack; g.fillRect(col(3), yb - hh, q, hh);
        g.fillStyle = pal.glazeWhite; g.fillRect(col(3), yb - hh + hh / 3, q, hh / 3);
      }
    } else if (r.type === 'cell') {
      g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
      const Fg = FIGURES[r.kind], kx = Fg.stretch || 1;
      const P = new Painter({ col: g }, { sx: sx * kx, sy, ox: r.cx + (Fg.cellW / 2) * sx * (1 - kx), oy: r.cy + r.ch, mirror: r.facing === 'L', cellW: Fg.cellW }, colourKey(r.kind, r.kind === 'lionUp' ? 1 : r.variant, pal));
      DRAW[r.kind](P, P.K); P.flush();
      g.restore();
    } else if (r.band === 'rosette') {
      const pitch = BANDS.rosette.period * sx, n = Math.round(W / pitch), K = { white: pal.glazeWhite, yellow: pal.glazeYellow, line: pal.glazeBlack };
      for (let i = 0; i < n; i++) {
        g.save(); g.translate((i + 0.5) * pitch, r.y + r.h / 2); g.scale(sx, -sy);
        drawRosette(g, BANDS.rosette.diameter / 2, BANDS.rosette.petals, K);
        g.restore();
      }
    } else if (r.band === 'checker') {
      // middle course: half bricks, alternately yellow and black-white-black
      const yy = r.y + V, third = U / 3;
      for (let hbi = 1; hbi < r.hb; hbi += 2) {
        const x = hbi * U;
        g.fillStyle = pal.glazeBlack; g.fillRect(x, yy, U, V);
        g.fillStyle = pal.glazeWhite; g.fillRect(x + third, yy, U - 2 * third, V);
      }
    }
  }
  ms.flat = now() - t0;

  // ---- relief of the figures into the height field
  const t1 = now();
  const Hm = new Float32Array(W * Ht);
  const reliefs = {};
  for (const kind of Object.keys(FIGURES)) reliefs[kind] = buildRelief(kind, U, V, ss);
  for (const r of list) {
    if (r.type !== 'cell' || !reliefs[r.kind]) continue;
    const rel = reliefs[r.kind], mirror = r.facing === 'L';
    for (let yy = 0; yy < rel.h; yy++) {
      const o = (r.y + yy) * W + r.x, so = yy * rel.w;
      if (mirror) for (let xx = 0; xx < rel.w; xx++) Hm[o + xx] = rel.data[so + rel.w - 1 - xx];
      else for (let xx = 0; xx < rel.w; xx++) Hm[o + xx] = rel.data[so + xx];
    }
  }
  ms.relief = now() - t1;

  // ---- bricks: per-brick tone, mottling, arris, joints; into albedo, height, roughness
  const t2 = now();
  const img = g.getImageData(0, 0, W, Ht), A = img.data;
  const orm = new Uint8ClampedArray(W * Ht * 4);
  for (let i = 0; i < W * Ht; i++) { orm[i * 4] = 255; orm[i * 4 + 1] = 66; orm[i * 4 + 3] = 255; }
  // tileable value noise for the mottling of the glaze
  const NS = 256, noise = new Float32Array(NS * NS);
  {
    const oct = (cells, amp) => {
      for (let yy = 0; yy < NS; yy++) for (let xx = 0; xx < NS; xx++) {
        const fx = (xx / NS) * cells, fy = (yy / NS) * cells, ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = hash(ix % cells, iy % cells, 71 + cells), b = hash((ix + 1) % cells, iy % cells, 71 + cells), c = hash(ix % cells, (iy + 1) % cells, 71 + cells), d = hash((ix + 1) % cells, (iy + 1) % cells, 71 + cells);
        noise[yy * NS + xx] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty - 0.5);
      }
    };
    oct(8, 1); oct(20, 0.6); oct(64, 0.35);
  }
  const jw = Math.max(0.5, V * 0.034);                // joint half width in px (the joint is about 6 mm wide)
  const ns = 22 / V;                                  // the mottling keeps its size in metres
  const mortar = [104, 92, 78];
  const cBase = hexRGB(pal.glazeBlue), cDark = hexRGB(pal.glazeBlueDark), cLight = hexRGB(pal.glazeBlueLight);
  const kDark = [cDark[0] / cBase[0], cDark[1] / cBase[1], cDark[2] / cBase[2]];       // the palette's deep lapis as a factor on the ground
  const kLight = [cLight[0] / cBase[0], cLight[1] / cBase[1], cLight[2] / cBase[2]];   // and its light blue
  const mx = BRICK / (2 * U), my = COURSE / V;        // metres per px
  const ew = V * 0.12;                                // width of the rounded arris in px
  let regionIndex = 0;
  for (const r of list) {
    regionIndex++;
    const strip = r.type === 'strip';
    const j0 = strip ? -r.guard : -M.courses, j1 = strip ? r.courses + r.guard : r.courses + M.courses;   // courses, bottom to top
    const h0 = strip ? 0 : -M.hb, h1 = strip ? r.hb : r.hb + M.hb;                           // half bricks
    const g0 = hexRGB(pal[r.ground] || pal.glazeBlue);   // the ground glaze of this region: only IT takes the lapis-to-turquoise swing (not the bull's blue hair)
    const rsd = strip ? seed + regionIndex * 131 : seed + 7919 * (r.kind === 'bull' ? 1 : r.kind === 'dragon' ? 2 : r.kind === 'lion' ? 3 : 4) + (r.facing === 'L' ? 0 : 53) + r.variant * 211;
    for (let j = j0; j < j1; j++) {
      const yTop = r.cy + r.ch - (j + 1) * V;                               // canvas y of the top row of course j
      const halfUnits = r.band === 'checker' && j === 1;                    // checker middle course: half bricks
      const unit = halfUnits ? 1 : 2;
      // first unit boundary at or left of h0: joints where (h + j) is even (whole bricks), every h (half bricks)
      let hs = h0;
      if (!halfUnits && ((hs + j) & 1)) hs -= 1;
      for (let hbi = hs; hbi < h1; hbi += unit) {
        const xa = r.cx + hbi * U, xb = xa + unit * U;                      // nominal brick, px (may stick out of the region)
        const bi = strip ? ((hbi % r.hb) + r.hb) % r.hb : hbi;              // identity (wraps on strips)
        const k1 = hash(bi, j, rsd), k2 = hash(bi, j, rsd + 1), k3 = hash(bi, j, rsd + 2), k4 = hash(bi, j, rsd + 3), k5 = hash(bi, j, rsd + 4);
        const val = 1 + (k1 - 0.5) * 0.15, warm = (k2 - 0.5) * 0.06;
        const fr = val + warm, fg = val, fb = val - warm;
        // blue glazes: shade -1 (deep lapis) .. +1 (light blue), most bricks near the ground colour; some lean to turquoise
        const sh = (hash(bi, j, rsd + 9) + hash(bi, j, rsd + 10) + hash(bi, j, rsd + 11)) * (2 / 3) - 1;
        const kd = sh < 0 ? -sh * 0.95 : 0, kl = sh > 0 ? sh * 0.8 : 0;
        const br = 1 + (kDark[0] - 1) * kd + (kLight[0] - 1) * kl, bg = 1 + (kDark[1] - 1) * kd + (kLight[1] - 1) * kl, bb = 1 + (kDark[2] - 1) * kd + (kLight[2] - 1) * kl;
        const lean = k3 < LEAN ? 0.22 + 0.5 * hash(bi, j, rsd + 12) : 0;
        const turqGround = r.ground === 'glazeTurquoise', dim = r.ground === 'glazeBlueDark' ? 0.82 : 1;
        const rough = 0.26 + (k4 - 0.5) * 0.10;
        const ax = (k5 - 0.5) * 2 * R.tilt, ay = (hash(bi, j, rsd + 5) - 0.5) * 2 * R.tilt, off = (hash(bi, j, rsd + 6) - 0.5) * 2 * R.step;
        const nox = Math.floor(hash(bi, j, rsd + 7) * NS), noy = Math.floor(hash(bi, j, rsd + 8) * NS);
        const xc = (xa + xb) / 2, yc = yTop + V / 2;
        const px0 = Math.max(r.x, xa), px1 = Math.min(r.x + r.w, xb);
        for (let yy = yTop; yy < yTop + V; yy++) {
          const dy = Math.min(yy - yTop + 0.5, yTop + V - yy - 0.5);
          const row = yy * W;
          for (let xx = px0; xx < px1; xx++) {
            const d = Math.min(dy, xx - xa + 0.5, xb - xx - 0.5);
            const i = row + xx, p = i * 4;
            const cj = d >= jw + 0.5 ? 0 : d <= jw - 0.5 ? 1 : jw + 0.5 - d;        // joint coverage
            const e = d >= jw + ew ? 1 : d <= jw ? 0 : (d - jw) / ew;               // 0 at the arris, 1 in the face
            const n = noise[(((yy * ns) + noy) & 255) * NS + (((xx * ns) + nox) & 255)];
            let cr = A[p], cg = A[p + 1], cb = A[p + 2];
            const blue = cb > cr + 25 && cb > cg && Math.abs(cr - g0[0]) + Math.abs(cg - g0[1]) + Math.abs(cb - g0[2]) < 48;
            if (blue) {
              if (turqGround) {                       // the turquoise ground: half the swing, and its outliers lean to blue
                cr *= 1 + (br - 1) * 0.5; cg *= 1 + (bg - 1) * 0.5; cb *= 1 + (bb - 1) * 0.5;
                if (lean) { const q = lean * 0.45; cr += (cLight[0] - cr) * q; cg += (cLight[1] - cg) * q; cb += (cLight[2] - cb) * q; }
              } else if (lean) { cr += (LEAN_TO[0] * dim - cr) * lean; cg += (LEAN_TO[1] * dim - cg) * lean; cb += (LEAN_TO[2] * dim - cb) * lean; }
              else { cr *= br; cg *= bg; cb *= bb; }
            }
            const tone = (1 + n * 0.12) * (1.05 - 0.05 * e * e);
            cr *= fr * tone; cg *= fg * tone; cb *= fb * tone;
            if (cj > 0) { cr += (mortar[0] - cr) * cj; cg += (mortar[1] - cg) * cj; cb += (mortar[2] - cb) * cj; }
            A[p] = cr; A[p + 1] = cg; A[p + 2] = cb;
            const ee = 1 - e;
            Hm[i] += off + ax * (xx - xc) * mx + ay * (yy - yc) * my - R.arris * ee * ee - R.joint * cj + n * R.wave;
            orm[p + 1] = 255 * (rough + n * 0.05 + (0.93 - rough) * cj + 0.06 * ee);
          }
        }
      }
    }
  }
  ms.bricks = now() - t2;

  // ---- cavity occlusion round the reliefs (figure cells only): darkens the ground beside the relief and the grooves
  const t3 = now();
  for (const r of list) {
    if (r.type !== 'cell' || !reliefs[r.kind]) continue;
    const w = r.w, h = r.h, loc = new Float32Array(w * h);
    for (let yy = 0; yy < h; yy++) { const o = (r.y + yy) * W + r.x; for (let xx = 0; xx < w; xx++) loc[yy * w + xx] = Hm[o + xx]; }
    const bl = boxBlur(loc.slice(), w, h, Math.max(2, Math.round(V * 0.27)), 2);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (r.y + yy) * W + r.x + xx, p = i * 4;
      // the glaze pools in the hollows (darker, deeper) and runs thin over the ridges (paler)
      const c = bl[yy * w + xx] - loc[yy * w + xx];
      const ao = c > 0 ? 1 - Math.min(0.42, c * 62) : 1 + Math.min(0.08, -c * 14);
      A[p] *= ao; A[p + 1] *= ao; A[p + 2] *= ao;
      orm[p] = 255 * Math.min(1, ao);
    }
  }
  ms.ao = now() - t3;

  // ---- normal map (tangent space, +Y up the wall), relief height into orm.b
  const t4 = now();
  const normal = new Uint8ClampedArray(W * Ht * 4);
  for (let i = 0; i < W * Ht; i++) { normal[i * 4] = 128; normal[i * 4 + 1] = 128; normal[i * 4 + 2] = 255; normal[i * 4 + 3] = 255; }
  const kx = 1 / (2 * mx), ky = 1 / (2 * my);
  for (const r of list) {
    const strip = r.type === 'strip', ry0 = strip ? r.y - r.guard * V : r.y, ry1 = strip ? r.y + r.h + r.guard * V : r.y + r.h;
    for (let yy = ry0; yy < ry1; yy++) {
      const yu = Math.max(ry0, yy - 1), yd = Math.min(ry1 - 1, yy + 1);
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        const xl = xx > r.x ? xx - 1 : strip ? r.x + r.w - 1 : xx, xr = xx < r.x + r.w - 1 ? xx + 1 : strip ? r.x : xx;
        const i = yy * W + xx, p = i * 4;
        const dx = (Hm[yy * W + xr] - Hm[yy * W + xl]) * kx * (xl === xx || xr === xx ? 2 : 1);
        const dyv = (Hm[yu * W + xx] - Hm[yd * W + xx]) * ky * (yu === yy || yd === yy ? 2 : 1);   // derivative up the wall
        const l = 1 / Math.sqrt(dx * dx + dyv * dyv + 1);
        normal[p] = 127.5 - 127.5 * dx * l; normal[p + 1] = 127.5 - 127.5 * dyv * l; normal[p + 2] = 127.5 + 127.5 * l;
        orm[p + 2] = (Hm[i] + 0.004) * 5100;
      }
    }
  }
  ms.normal = now() - t4;

  // ---- gutters of the strips: repeat the edge rows
  for (const r of list) {
    if (r.type !== 'strip') continue;
    const ry0 = r.y - r.guard * V, ry1 = r.y + r.h + r.guard * V;
    for (const arr of [A, normal, orm]) {
      // (the rows repeated are brick faces from the middle of the edge courses: the very edge rows are a mortar joint,
      //  and a band of mortar there would bleed into the coarse mip levels as a dark line)
      const half = V >> 1;
      for (let k = 1; k <= G; k++) {
        const st = ry0 + ((k - 1) % half), sb = ry1 - 1 - ((k - 1) % half);
        arr.copyWithin((ry0 - k) * W * 4, st * W * 4, (st + 1) * W * 4);
        if (ry1 - 1 + k < Ht) arr.copyWithin((ry1 - 1 + k) * W * 4, sb * W * 4, (sb + 1) * W * 4);
      }
    }
  }
  ms.total = now() - t0;
  return { width: W, height: Ht, U, V, gutter: G, albedo: A, normal, orm, heightField: Hm, canvas, regions, list, ms, bricksAcross: BRICKS_ACROSS };
}
