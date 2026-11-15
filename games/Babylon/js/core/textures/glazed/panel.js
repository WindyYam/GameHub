// glazed/panel.js — lays out glazed wall panels on the brick grid: friezes, gate faces, any stack of bands.
// OWNER: relief artist. Pure layout (no THREE): a panel is a list of quads, each a rectangle of the wall
// (metres, x right, y up from the panel's lower-left corner) mapped to a rectangle of the atlas (pixels).
// glazed.js turns the list into geometry or bakes it into a panel texture.
//
// The wall grid: half-brick index H = x / HB, course index k = y / COURSE. The wall has its head joints where
// (H + k + phase) is even. Figure cells are stamped on that grid; in every course a cell's slice ends on the
// nearest head joint (the edges zig-zag by half a brick), so no brick is ever cut by the edge of a figure and
// the plain bond runs on undisturbed round the animals, as on the originals.
import { HB, COURSE, FIGURES, BANDS, CORNER, GATE_SOCLE, GATE_ROW, LION_FRIEZE, groundOf } from './module.js';

function hash(i, j, seed) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Evenly spread figure centres: n figures across `width` (metres), or one every `spacing`. */
export function spread(width, { count, spacing = 3.1, margin = 0 } = {}) {
  const n = count ?? Math.max(1, Math.round((width - 2 * margin) / spacing));
  const out = [];
  for (let i = 0; i < n; i++) out.push(margin + ((i + 0.5) * (width - 2 * margin)) / n);
  return out;
}

/**
 * Bands of a gate face, bottom to top: socle (2 blue courses, checker border, rosette band, checker border =
 * 13 courses), then rows of animals (13 courses) separated by 11 plain courses; rows alternate bull / dragon
 * (lowest row bulls); colours alternate along a row, and each species alternates from one of its rows to the next.
 * The rest up to `height` is plain blue.
 * opts: { width, height, rows (default: as many as fit, at most 6), perRow | spacing (3.1 m centres), facing:
 *         'L' | 'R' | 'center' (towards the middle of the panel) | 'out' | (i, n, row) => 'L' | 'R',
 *         first: 'bull' | 'dragon', variantStart: 0 | 1, socle: true, margin: 0 }
 */
export function gateBands({ width, height, rows, perRow, spacing = 3.1, facing = 'R', first = 'bull', variantStart = 0, socle = true, margin = 0 }) {
  const total = Math.ceil(height / COURSE - 1e-6), bands = [];
  let k = 0;
  if (socle) for (const [t, n] of GATE_SOCLE) { bands.push(t === 'field' ? { type: 'field', courses: n, ground: 'glazeBlue' } : { type: t }); k += n; }
  const fit = total - k >= GATE_ROW.animal ? Math.floor((total - k - GATE_ROW.animal) / (GATE_ROW.animal + GATE_ROW.plain)) + 1 : 0;
  const nRows = Math.max(0, Math.min(rows ?? 6, fit));
  const xs = spread(width, { count: perRow, spacing, margin });
  for (let r = 0; r < nRows; r++) {
    const figure = (r % 2 === 0) === (first === 'bull') ? 'bull' : 'dragon';
    const items = xs.map((x, i) => ({
      x, variant: (i + r + (r >> 1) + variantStart) % 2,     // alternates along the row, and from one row of a species to its next
      facing: typeof facing === 'function' ? facing(i, xs.length, r) : facing === 'center' ? (x < width / 2 ? 'R' : 'L') : facing === 'out' ? (x < width / 2 ? 'L' : 'R') : facing,
    }));
    bands.push({ type: 'figures', figure, courses: GATE_ROW.animal, ground: 'glazeBlue', items, row: r });
    k += GATE_ROW.animal;
    const plain = Math.min(GATE_ROW.plain, total - k);
    if (plain > 0) { bands.push({ type: 'field', courses: plain, ground: 'glazeBlue' }); k += plain; }
  }
  if (total > k) bands.push({ type: 'field', courses: total - k, ground: 'glazeBlue' });
  return bands;
}

/**
 * Bands of the lion frieze of the Processional Way (39 courses = 3.35 m; the lions' feet 13 courses = 1.116 m up):
 * 2 blue courses, checker, rosettes, checker, the lion field (lions of 11 courses + 2 plain), checker, rosettes,
 * checker, 2 blue courses.
 * opts: { width, count | spacing (3.0 m centres), facing: 'L' | 'R', ground: 'turquoise' | 'lapis',
 *         variantStart: 0 (white lion first) | 1 (yellow lion first), margin: 0 }
 */
export function friezeBands({ width, count, spacing = 3.0, facing = 'L', ground = 'turquoise', variantStart = 0, margin = 0 }) {
  const turq = ground === 'turquoise' || ground === 'glazeTurquoise';
  const lionVariant = (yellow) => (turq ? (yellow ? 3 : 0) : (yellow ? 1 : 2));
  const xs = spread(width, { count, spacing, margin });
  return LION_FRIEZE.map(([t, n]) => {
    if (t === 'field') return { type: 'field', courses: n, ground: 'glazeBlue' };
    if (t === 'lions') return { type: 'figures', figure: 'lion', courses: n, ground: turq ? 'glazeTurquoise' : 'glazeBlueDark', items: xs.map((x, i) => ({ x, facing, variant: lionVariant((i + variantStart) % 2 === 1) })) };
    return { type: t };
  });
}

/**
 * Lay a panel out.
 * A: the atlas ({ width, height, U, V, regions }).
 * spec: { width (m), height (m, optional: default = the bands' height), bands: [...], phase: 0 | 1, seed: 0,
 *         corners: 'left' | 'right' | 'both' (corner edging of the gate, 0.5 m wide), cornerFrom: 13 (courses) }
 * band: { type: 'field', courses, ground: paletteId }
 *     | { type: 'checker' } | { type: 'rosette' }           (fit: false keeps the strip on the brick grid instead of fitting whole periods)
 *     | { type: 'figures', figure, courses (>= the figure's), ground, items: [{ x (m, centre), facing, variant }] }
 * Returns { near: quads, far: quads, width, height, courses, items: [{ figure, facing, variant, x, y, row }] }.
 * quad: { x0, y0, x1, y1 (m), sx0, sx1 (atlas px, may run past the width: the strips repeat), syb, syt (atlas px
 *         rows of the bottom and top edge, measured from the top of the atlas) }
 */
export function layoutPanel(A, spec) {
  const { U, V, regions } = A, phase = spec.phase ? 1 : 0, seed = spec.seed | 0;
  const wHB = spec.width / HB;
  const near = [], far = [], items = [];
  const push = (list, a, b, k0, k1, sxa, sxb, syb, syt) => { if (b - a > 1e-9 && k1 > k0) list.push({ x0: a * HB, x1: b * HB, y0: k0 * COURSE, y1: k1 * COURSE, sx0: sxa, sx1: sxb, syb, syt }); };
  const strip = (ground) => { const s = regions['course:' + ground]; if (!s) throw new Error(`glazed.panel: no plain ground '${ground}'`); return s; };
  /** shift (half bricks) that puts a strip in bond with the wall when its lowest course lies on wall course kc */
  const NB = A.bricksAcross || 32;
  const shiftFor = (kc, salt) => ((kc + phase) & 1) + 2 * Math.floor(hash(kc, salt, seed + 17) * NB);

  function field(list, a, b, k0, k1, ground, salt) {
    const S = strip(ground);
    for (let kc = k0; kc < k1; kc += S.courses) {
      const len = Math.min(S.courses, k1 - kc), s = shiftFor(kc, salt);
      push(list, a, b, kc, kc + len, (a + s) * U, (b + s) * U, S.y + S.h, S.y + S.h - len * V);
    }
  }

  let k = 0, bandIndex = 0;
  for (const band of spec.bands) {
    bandIndex++;
    if (band.type === 'field') {
      for (const list of [near, far]) field(list, 0, wHB, k, k + band.courses, band.ground || 'glazeBlue', bandIndex);
      k += band.courses;
    } else if (band.type === 'checker' || band.type === 'rosette') {
      // A whole number of pattern periods is fitted to the panel (the strip is stretched by a few per cent at most),
      // so that no rosette and no black-white-black inset is ever cut by the end of a panel.
      const S = regions[band.type], n = BANDS[band.type].courses;
      const periodHB = band.type === 'rosette' ? 8 / 3 : 2, count = Math.max(1, Math.round(wHB / periodHB));
      const start = (band.type === 'rosette' ? 8 * Math.floor(hash(k, bandIndex, seed + 5) * (NB / 4)) : 0.5 + 2 * Math.floor(hash(k, bandIndex, seed + 5) * NB));
      const fit = band.fit !== false;
      const a0 = fit ? start : ((k + phase) & 1), a1 = fit ? start + count * periodHB : a0 + wHB;
      for (const list of [near, far]) push(list, 0, wHB, k, k + n, a0 * U, a1 * U, S.y + S.h, S.y);
      k += n;
    } else if (band.type === 'figures') {
      const F = FIGURES[band.figure];
      if (!F) throw new Error(`glazed.panel: unknown figure '${band.figure}'`);
      const fc = F.courses, nc = Math.max(fc, band.courses || fc), hb = F.hb;
      const ground = band.ground || groundOf(band.figure, band.items && band.items[0] ? band.items[0].variant : 0);
      const S = strip(ground);
      if (nc > S.courses) throw new Error(`glazed.panel: a '${band.figure}' band of ${nc} courses is taller than the ${ground} strip`);
      const s = shiftFor(k, bandIndex);
      // cells on the grid: left edge H0 with (H0 + k + phase) even; keep one whole brick between neighbours
      const cells = [];
      let minH = -1e9;
      for (const it of [...(band.items || [])].sort((p, q) => p.x - q.x)) {
        const exact = (it.x - F.cellW / 2) / HB;
        let H0 = Math.round(exact);
        if ((H0 + k + phase) & 1) H0 += exact >= H0 ? 1 : -1;
        while (H0 < minH) H0 += 2;
        minH = H0 + hb + 3;
        const variant = ((it.variant | 0) % F.variants + F.variants) % F.variants, facing = it.facing === 'R' ? 'R' : 'L';
        cells.push({ H0, R: regions[`${band.figure}:${facing}:${variant}`] });
        items.push({ figure: band.figure, facing, variant, x: (H0 + hb / 2) * HB, y: k * COURSE, row: band.row ?? null });
      }
      // near: course by course, every slice ending on a head joint
      const cuts = new Set([0, wHB]);
      for (const c of cells) for (const h of [c.H0 - 1, c.H0, c.H0 + hb, c.H0 + hb + 1]) if (h > 0 && h < wHB) cuts.add(h);
      const xs = [...cuts].sort((p, q) => p - q);
      for (let j = 0; j < fc; j++) {
        const syb = S.y + S.h - j * V;
        for (let i = 0; i + 1 < xs.length; i++) {
          const a = xs[i], b = xs[i + 1], mid = (a + b) / 2;
          let cell = null;
          for (const c of cells) { const hl = c.H0 - (j & 1 ? 1 : 0), hr = c.H0 + hb + ((hb + j) & 1 ? 1 : 0); if (mid > hl && mid < hr) { cell = c; break; } }
          if (cell) { const R = cell.R, cb = R.cy + R.ch - j * V; push(near, a, b, k + j, k + j + 1, R.cx + (a - cell.H0) * U, R.cx + (b - cell.H0) * U, cb, cb - V); }
          else push(near, a, b, k + j, k + j + 1, (a + s) * U, (b + s) * U, syb, syb - V);
        }
      }
      // far: straight cell edges
      let x = 0;
      for (const c of cells) {
        const a = Math.max(0, c.H0), b = Math.min(wHB, c.H0 + hb);
        if (b <= a) continue;
        push(far, x, a, k, k + fc, (x + s) * U, (a + s) * U, S.y + S.h, S.y + S.h - fc * V);
        push(far, a, b, k, k + fc, c.R.cx + (a - c.H0) * U, c.R.cx + (b - c.H0) * U, c.R.cy + c.R.ch, c.R.cy);
        x = b;
      }
      push(far, x, wHB, k, k + fc, (x + s) * U, (wHB + s) * U, S.y + S.h, S.y + S.h - fc * V);
      // plain courses above the figures, in the same strip
      if (nc > fc) for (const list of [near, far]) push(list, 0, wHB, k + fc, k + nc, s * U, (wHB + s) * U, S.y + S.h - fc * V, S.y + S.h - nc * V);
      k += nc;
    } else throw new Error(`glazed.panel: unknown band type '${band.type}'`);
  }
  const fullH = k * COURSE, height = spec.height ?? fullH;
  // fill up to the height with plain blue, or clip
  if (height > fullH + 1e-6) { const extra = Math.ceil((height - fullH) / COURSE - 1e-6); for (const list of [near, far]) field(list, 0, wHB, k, k + extra, 'glazeBlue', 991); k += extra; }
  // corner edging: a vertical stripe 3 half bricks wide up the left and / or right edge, from `cornerFrom` courses up
  const sides = spec.corners === 'both' ? ['L', 'R'] : spec.corners === 'left' ? ['L'] : spec.corners === 'right' ? ['R'] : [];
  const carve = (list, xa, xb, ya) => {
    const out = [];
    const cutX = (q, a, b) => { const w = q.x1 - q.x0, t0 = (a - q.x0) / w, t1 = (b - q.x0) / w; return { ...q, x0: a, x1: b, sx0: q.sx0 + (q.sx1 - q.sx0) * t0, sx1: q.sx0 + (q.sx1 - q.sx0) * t1 }; };
    const cutY = (q, a, b) => { const h = q.y1 - q.y0, t0 = (a - q.y0) / h, t1 = (b - q.y0) / h; return { ...q, y0: a, y1: b, syb: q.syb + (q.syt - q.syb) * t0, syt: q.syb + (q.syt - q.syb) * t1 }; };
    for (const q of list) {
      if (q.x1 <= xa + 1e-9 || q.x0 >= xb - 1e-9 || q.y1 <= ya + 1e-9) { out.push(q); continue; }
      if (q.x0 < xa - 1e-9) out.push(cutX(q, q.x0, xa));
      if (q.x1 > xb + 1e-9) out.push(cutX(q, xb, q.x1));
      if (q.y0 < ya - 1e-9) out.push(cutY(cutX(q, Math.max(q.x0, xa), Math.min(q.x1, xb)), q.y0, ya));
    }
    return out;
  };
  let nearQ = near, farQ = far;
  if (sides.length && spec.width > 2.2 * CORNER.hb * HB) {
    const kFrom = Math.min(k, spec.cornerFrom ?? 13), ya = kFrom * COURSE, r0 = (kFrom + phase) & 1;
    for (const side of sides) {
      const R = regions['corner:L'], left = side === 'L', xa = left ? 0 : spec.width - CORNER.hb * HB, xb = xa + CORNER.hb * HB;
      nearQ = carve(nearQ, xa, xb, ya); farQ = carve(farQ, xa, xb, ya);
      for (let kc = kFrom; kc < k; kc += CORNER.courses) {
        const len = Math.min(CORNER.courses, k - kc), syb = R.cy + R.ch - r0 * V;
        for (const list of [nearQ, farQ]) list.push({ x0: xa, x1: xb, y0: kc * COURSE, y1: (kc + len) * COURSE, sx0: left ? R.cx : R.cx + R.cw, sx1: left ? R.cx + R.cw : R.cx, syb, syt: syb - len * V });   // the right one is mirrored
      }
    }
  }
  const clip = (list) => {
    const out = [];
    for (const q of list) {
      if (q.y0 >= height - 1e-6) continue;
      if (q.y1 > height + 1e-6) { const t = (height - q.y0) / (q.y1 - q.y0); q.syt = q.syb + (q.syt - q.syb) * t; q.y1 = height; }
      out.push(q);
    }
    return out;
  };
  return { near: clip(nearQ), far: clip(farQ), width: spec.width, height, courses: k, items };
}

/** Quad list to flat arrays (non-indexed triangles): position, normal, uv, color. Faces right x up. */
export function quadsToArrays(A, quads, origin, right, up, proud = 0) {
  const n = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= nl; n[1] /= nl; n[2] /= nl;
  const o = [origin[0] + n[0] * proud, origin[1] + n[1] * proud, origin[2] + n[2] * proud];
  const N = quads.length * 6, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3).fill(1);
  const W = A.width, H = A.height;
  let v = 0;
  const put = (a, b, s, t) => {
    pos[v * 3] = o[0] + right[0] * a + up[0] * b; pos[v * 3 + 1] = o[1] + right[1] * a + up[1] * b; pos[v * 3 + 2] = o[2] + right[2] * a + up[2] * b;
    nor[v * 3] = n[0]; nor[v * 3 + 1] = n[1]; nor[v * 3 + 2] = n[2];
    uv[v * 2] = s / W; uv[v * 2 + 1] = 1 - t / H; v++;
  };
  for (const q of quads) {
    // keep u small: the strips repeat every atlas width
    const k = Math.floor(Math.min(q.sx0, q.sx1) / W) * W, s0 = q.sx0 - k, s1 = q.sx1 - k;
    put(q.x0, q.y0, s0, q.syb); put(q.x1, q.y0, s1, q.syb); put(q.x1, q.y1, s1, q.syt);
    put(q.x0, q.y0, s0, q.syb); put(q.x1, q.y1, s1, q.syt); put(q.x0, q.y1, s0, q.syt);
  }
  return { position: pos, normal: nor, uv, color: col, count: N };
}
