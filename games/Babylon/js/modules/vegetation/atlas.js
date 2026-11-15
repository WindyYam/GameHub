// js/modules/vegetation/atlas.js — ONE painted texture for everything that grows: palm bark, fronds, whole crowns
// (side and top views for the middle and far levels), date strands, reeds, leaf clumps, feathery sprays, willow
// strands, a barley fringe, herb tufts. Colour and coverage are painted on two canvases and joined into one RGBA
// DataTexture, so that a texel outside a leaf still carries leaf colour: mip levels and linear filtering never
// pull a dark fringe into the cut edge. Deterministic: seeded generator, no Math.random().
import { Rng } from '../../core/rng.js';

/**
 * Regions in atlas units (the atlas is 16 x 16 units): [x0, y0, x1, y1], y down. Half a unit lies between any two
 * regions and at the top and bottom edge (the texture repeats along y for the bark), so that the mip levels that
 * exist (down to 32 texels) never mix two regions.
 */
export const REGIONS = {
  bark: [0, 0, 1.5, 16],                // tiles along y: 4 m of trunk
  frondA: [2.2, 0.5, 16, 2.6],          // one living frond, base at the left
  frondB: [2.2, 3.1, 16, 5.2],          // one dry frond
  crownSide: [2.2, 5.8, 7.4, 9.9],      // a whole crown seen from the side (2.16 x 1.7 crown radii)
  crownTop: [7.9, 5.8, 12.4, 10.3],     // a whole crown seen from above (2.16 radii square)
  dates: [12.9, 5.8, 15.9, 8.4],        // fruit stalks hanging from the crown
  reed: [12.9, 9.4, 15.9, 13.6],        // a clump of reeds
  leaf: [2.2, 10.9, 6.2, 14.9],         // a broadleaf bough
  feather: [6.7, 10.9, 10.3, 14.9],     // tamarisk / cypress spray
  willow: [10.8, 10.9, 12.4, 14.9],     // hanging strands
  herb: [12.9, 14.2, 14.0, 15.5],       // a tuft of garden plants
  solid: [14.8, 14.5, 15.6, 15.3],      // opaque white
  barley: [2.2, 15.4, 12.4, 16],        // the ears along the edge of a standing crop
};
export const ALPHA_TEST = 0.4;

const hex = (c) => '#' + [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

export function makeAtlas(ctx) {
  const THREE = ctx.THREE, S = ctx.quality.draft ? 1024 : 2048, U = S / 16;
  const pal = ctx.world.palette.materials;
  const P = (id, fallback) => rgbOf(pal[id] || fallback);
  const FROND = P('palmFrond', '#5E7A38'), FRONDHI = P('palmFrondHighlight', '#8FA060'), TRUNK = P('palmTrunk', '#75624C'), DRY = [181, 154, 90], BASE = [138, 116, 88];
  const REED = P('reedsGreen', '#8A9A4B'), REEDDRY = [201, 179, 106], PLUME = [217, 210, 192], BARLEY = P('barleyRipe', '#D4B75A');
  const cc = document.createElement('canvas'), ca = document.createElement('canvas');
  cc.width = cc.height = ca.width = ca.height = S;
  const gc = cc.getContext('2d', { willReadFrequently: true }), ga = ca.getContext('2d', { willReadFrequently: true });
  ga.fillStyle = '#000'; ga.fillRect(0, 0, S, S);
  gc.fillStyle = hex(mul(FROND, 0.9)); gc.fillRect(0, 0, S, S);
  const rng = new Rng('vegetation:atlas');
  const px = (r) => [r[0] * U, r[1] * U, (r[2] - r[0]) * U, (r[3] - r[1]) * U];

  /** Fill the background of a region (colour only: what bleeds into the cut edges). */
  const ground = (r, col, pad = 0.14) => { const [x, y, w, h] = px(r); gc.fillStyle = hex(col); gc.fillRect(x - pad * U, y - pad * U, w + 2 * pad * U, h + 2 * pad * U); };
  /** A filled path on both canvases. */
  const fill = (col, path, alpha = 1) => {
    gc.fillStyle = hex(col); gc.beginPath(); path(gc); gc.fill();
    ga.fillStyle = alpha >= 1 ? '#fff' : hex([255 * alpha, 255 * alpha, 255 * alpha]); ga.beginPath(); path(ga); ga.fill();
  };
  const stroke = (col, width, path, both = true) => {
    gc.strokeStyle = hex(col); gc.lineWidth = width; gc.lineCap = 'round'; gc.beginPath(); path(gc); gc.stroke();
    if (both) { ga.strokeStyle = '#fff'; ga.lineWidth = width; ga.lineCap = 'round'; ga.beginPath(); path(ga); ga.stroke(); }
  };
  const clip = (r, fn) => { const [x, y, w, h] = px(r); gc.save(); ga.save(); for (const g of [gc, ga]) { g.beginPath(); g.rect(x, y, w, h); g.clip(); } fn(x, y, w, h); gc.restore(); ga.restore(); };

  // ---- bark: diamond leaf-base scars in staggered rows, tiling along y every 4 m ------------------------------
  {
    const [x0, , w] = px(REGIONS.bark);
    gc.fillStyle = hex(mul(TRUNK, 0.82)); gc.fillRect(0, 0, w + 0.4 * U, S);
    ga.fillStyle = '#fff'; ga.fillRect(0, 0, w + 0.4 * U, S);
    const rows = 56, pitch = S / rows, cols = 4, cw = w / cols;
    for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
      const cx = x0 + (i + 0.5 + (j & 1 ? 0.5 : 0)) * cw, cy = (j + 0.5) * pitch, k = rng.next();
      const col = mul(mix(TRUNK, BASE, 0.35 + 0.5 * k), 0.9 + 0.25 * rng.next());
      // the scar: a shield, lighter stub on top, a dark slot below it
      gc.fillStyle = hex(mul(TRUNK, 0.5)); gc.beginPath(); gc.moveTo(cx - cw * 0.52, cy + pitch * 0.1); gc.lineTo(cx, cy + pitch * 0.75); gc.lineTo(cx + cw * 0.52, cy + pitch * 0.1); gc.lineTo(cx, cy - pitch * 0.5); gc.fill();
      gc.fillStyle = hex(col); gc.beginPath(); gc.moveTo(cx - cw * 0.46, cy - pitch * 0.02); gc.lineTo(cx, cy + pitch * 0.5); gc.lineTo(cx + cw * 0.46, cy - pitch * 0.02); gc.lineTo(cx, cy - pitch * 0.55); gc.fill();
      gc.fillStyle = hex(mul(col, 1.18)); gc.beginPath(); gc.moveTo(cx - cw * 0.3, cy - pitch * 0.18); gc.lineTo(cx, cy - pitch * 0.5); gc.lineTo(cx + cw * 0.3, cy - pitch * 0.18); gc.lineTo(cx, cy - pitch * 0.05); gc.fill();
    }
    // fibre: fine vertical streaks
    for (let n = 0; n < 900; n++) { const x = x0 + rng.next() * w, y = rng.next() * S, l = (0.02 + 0.05 * rng.next()) * S; gc.strokeStyle = hex(mul(TRUNK, rng.chance(0.5) ? 0.62 : 1.2)); gc.globalAlpha = 0.35; gc.lineWidth = 1; gc.beginPath(); gc.moveTo(x, y); gc.lineTo(x + rng.range(-2, 2), y + l); gc.stroke(); }
    gc.globalAlpha = 1;
  }

  // ---- one frond: rachis and leaflets -------------------------------------------------------------------------
  const frond = (r, dry) => {
    ground(r, dry ? mul(DRY, 0.9) : mix(FROND, FRONDHI, 0.2));
    clip(r, (x, y, w, h) => {
      const my = y + h / 2, n = 92, half = h * 0.45;
      // leaflet length along the frond: spines at the foot, longest in the middle third, short at the tip
      const prof = (s) => (s < 0.08 ? 0.1 + 1.5 * s : s < 0.24 ? 0.22 + (s - 0.08) * 4.9 : s < 0.66 ? 1 : 1 - (s - 0.66) * 1.9) * half;
      for (let pass = 0; pass < 2; pass++) for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
        const s = 0.05 + 0.95 * (i + rng.range(0.1, 0.9)) / n;
        if (dry && rng.chance(0.2)) continue;
        if (pass === 1 && rng.chance(0.5)) continue;                      // a second, looser rank: date leaflets stand in several planes
        const len = prof(s) * rng.range(0.8, 1.0) * (pass ? 0.8 : 1), ang = (66 - 34 * s) * Math.PI / 180 + rng.range(-0.08, 0.08) + (pass ? 0.16 : 0);
        const bx = x + s * w, by = my, tx = bx + Math.cos(ang) * len * 0.8, ty = by + side * Math.sin(ang) * len;
        const wb = (w / n) * (s < 0.1 ? 0.3 : 0.72);
        let col = dry ? mul(mix(DRY, TRUNK, rng.next() * 0.5), rng.range(0.85, 1.12)) : mul(mix(FROND, FRONDHI, rng.next() * 0.45), rng.range(0.8, 1.1) * (pass ? 0.86 : 1));
        if (!dry && rng.chance(0.03)) col = mix(col, DRY, 0.6);
        fill(col, (g) => { g.moveTo(bx - wb, by); g.quadraticCurveTo(bx + (tx - bx) * 0.5 - wb * 0.5, by + (ty - by) * 0.55, tx, ty); g.quadraticCurveTo(bx + (tx - bx) * 0.5 + wb * 1.4, by + (ty - by) * 0.5, bx + wb, by); });
        gc.strokeStyle = hex(mul(col, 0.7)); gc.lineWidth = Math.max(1, S / 2048); gc.beginPath(); gc.moveTo(bx, by); gc.lineTo(tx, ty); gc.stroke();
      }
      const rc = dry ? mul(DRY, 0.95) : [128, 132, 74];
      fill(rc, (g) => { g.moveTo(x, my - h * 0.04); g.lineTo(x + w * 0.995, my - 1); g.lineTo(x + w * 0.995, my + 1); g.lineTo(x, my + h * 0.04); });
    });
  };
  frond(REGIONS.frondA, false);
  frond(REGIONS.frondB, true);

  // ---- a feather drawn along a projected path: used by the two whole-crown views ------------------------------
  /** pts: [[x, y], ...] in pixels along the frond; wAt(s) half width in pixels; serrated edge = leaflet tips. */
  const feather = (pts, wAt, col, dark) => {
    const L = [], Rr = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const s = i / (n - 1), w = wAt(s) * (i & 1 ? 1 : 0.62);
      L.push([pts[i][0] - dy * w + dx * w * 0.5, pts[i][1] + dx * w + dy * w * 0.5]); Rr.push([pts[i][0] + dy * w + dx * w * 0.5, pts[i][1] - dx * w + dy * w * 0.5]);
    }
    fill(col, (g) => { g.moveTo(pts[0][0], pts[0][1]); for (const p of L) g.lineTo(p[0], p[1]); g.lineTo(pts[n - 1][0], pts[n - 1][1]); for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]); });
    gc.strokeStyle = hex(dark); gc.lineWidth = Math.max(1, S / 1400); gc.beginPath(); gc.moveTo(pts[0][0], pts[0][1]); for (const p of pts) gc.lineTo(p[0], p[1]); gc.stroke();
  };
  /** The fronds of a crown: base elevation, droop and length per frond; the same family in both views. */
  const crownFronds = [];
  {
    const cr = new Rng('vegetation:crown');
    for (let i = 0; i < 52; i++) {
      const k = i / 51, el = (82 - 118 * Math.pow(k, 0.85)) * Math.PI / 180 + cr.range(-0.08, 0.08);     // spears first, hanging last
      crownFronds.push({ az: i * 2.39996 + cr.range(-0.25, 0.25), el, droop: (0.35 + 1.05 * Math.min(1, k * 1.3)) * cr.range(0.85, 1.15), len: (0.78 + 0.4 * Math.sin(Math.PI * Math.min(1, k * 1.15))) * cr.range(0.9, 1.08), k, dry: k > 0.86 && cr.chance(0.6) });
    }
  }
  const frondPath = (f, steps = 14) => {
    const out = []; let x = 0, y = 0, z = 0;
    out.push([0, 0, 0]);
    for (let i = 1; i <= steps; i++) {
      const s = i / steps, th = f.el - f.droop * Math.pow(s, 1.4), d = f.len / steps;
      x += Math.cos(th) * Math.cos(f.az) * d; z += Math.cos(th) * Math.sin(f.az) * d; y += Math.sin(th) * d;
      out.push([x, y, z]);
    }
    return out;
  };
  // side view: x right, y up; the region spans 2.16 x 1.7 crown radii, the crown centre 0.75 radii above its lower edge
  {
    const r = REGIONS.crownSide; ground(r, mul(FROND, 0.82));
    clip(r, (x, y, w, h) => {
      const sc = w / 2.16, cx = x + w / 2, cy = y + h - 0.75 * sc;
      const order = crownFronds.map((f, i) => ({ f, i, depth: Math.sin(f.az) * Math.cos(f.el - f.droop * 0.5) })).sort((a, b) => a.depth - b.depth);
      for (const { f, depth } of order) {
        const pts = frondPath(f).map((p) => [cx + p[0] * sc, cy - p[1] * sc]);
        const shade = (0.62 + 0.3 * (1 - f.k)) * (0.82 + 0.18 * (depth + 1) / 2) * rng.range(0.92, 1.08);
        const col = f.dry ? mul(mix(DRY, FROND, 0.25), shade * 1.05) : mul(mix(FROND, FRONDHI, 0.42 * (1 - f.k) + 0.1 * rng.next()), shade * 1.12);
        const fore = 0.35 + 0.65 * Math.abs(Math.cos(f.az));                    // a frond that points at the viewer is short and broad
        feather(pts, (s) => sc * (0.022 + 0.058 * Math.sin(Math.PI * Math.min(1, s * 1.08 + 0.06))) / Math.max(fore, 0.6), col, mul(col, 0.62));
      }
      // heart of the crown and the leaf bases under it
      fill(mul(BASE, 0.85), (g) => { g.ellipse(cx, cy + sc * 0.06, sc * 0.085, sc * 0.16, 0, 0, 6.2832); });
    });
  }
  // top view
  {
    const r = REGIONS.crownTop; ground(r, mul(FROND, 0.85));
    clip(r, (x, y, w, h) => {
      const sc = w / 2.16, cx = x + w / 2, cy = y + h / 2;
      const order = crownFronds.slice().sort((a, b) => b.k - a.k);               // lowest fronds first, the spears on top
      for (const f of order) {
        const pts = frondPath(f).map((p) => [cx + p[0] * sc, cy + p[2] * sc]);
        const shade = (0.58 + 0.42 * (1 - f.k)) * rng.range(0.92, 1.08);
        const col = f.dry ? mul(mix(DRY, FROND, 0.3), shade) : mul(mix(FROND, FRONDHI, 0.5 * (1 - f.k) + 0.1 * rng.next()), shade * 1.12);
        feather(pts, (s) => sc * (0.026 + 0.064 * Math.sin(Math.PI * Math.min(1, s * 1.05 + 0.05))), col, mul(col, 0.62));
      }
      fill([150, 150, 90], (g) => { g.arc(cx, cy, sc * 0.06, 0, 6.2832); });
    });
  }

  // ---- fruit stalks (late April: flowering is over, the strands carry small green fruit) -----------------------
  {
    const r = REGIONS.dates; ground(r, [150, 146, 78]);
    clip(r, (x, y, w, h) => {
      for (let b = 0; b < 3; b++) {
        const bx = x + w * (0.2 + 0.3 * b), top = y + h * 0.02;
        stroke([196, 150, 62], Math.max(2, S / 520), (g) => { g.moveTo(bx, top); g.quadraticCurveTo(bx + w * 0.02, top + h * 0.2, bx, top + h * 0.34); });
        for (let s = 0; s < 26; s++) {
          const a = rng.range(-0.55, 0.55), l = h * rng.range(0.35, 0.62), ex = bx + Math.sin(a) * l * 0.5, ey = top + h * 0.34 + Math.cos(a) * l;
          stroke(mix([196, 150, 62], [160, 160, 80], rng.next()), Math.max(1.2, S / 1000), (g) => { g.moveTo(bx, top + h * 0.32); g.quadraticCurveTo(bx + Math.sin(a) * l * 0.5, top + h * 0.45, ex, ey); });
          for (let d = 0; d < 7; d++) { const k = 0.35 + 0.65 * rng.next(), dx = bx + (ex - bx) * k + rng.range(-3, 3) * S / 2048, dy = top + h * 0.34 + (ey - top - h * 0.34) * k; fill(mul([142, 158, 74], rng.range(0.8, 1.15)), (g) => { g.arc(dx, dy, Math.max(1.5, S / 600), 0, 6.2832); }); }
        }
      }
    });
  }

  // ---- reeds: stems, long leaves, plumes ----------------------------------------------------------------------
  {
    const r = REGIONS.reed, RG = mix(REED, FROND, 0.45); ground(r, mul(RG, 0.8));
    clip(r, (x, y, w, h) => {
      // the dense foot of the bed first: short dark blades
      for (let i = 0; i < 120; i++) { const bx = x + w * rng.range(0.05, 0.95), ht = h * rng.range(0.1, 0.38), lean = rng.range(-0.3, 0.3); stroke(mul(mix(RG, REEDDRY, rng.next() * 0.3), rng.range(0.5, 0.78)), Math.max(1.6, S / 640), (g) => { g.moveTo(bx, y + h); g.quadraticCurveTo(bx + lean * ht * 0.3, y + h - ht * 0.6, bx + lean * ht, y + h - ht); }); }
      const stems = 46;
      for (let i = 0; i < stems; i++) {
        const bx = x + w * (0.08 + 0.84 * (i + rng.next()) / stems), ht = h * rng.range(0.5, 0.97), lean = rng.range(-0.1, 0.1) + ((i / stems) - 0.5) * 0.3;
        const dry = rng.chance(0.16), col = mul(dry ? mix(REEDDRY, RG, 0.25) : mix(RG, REED, rng.next() * 0.6), rng.range(0.72, 1.0));
        const tx = bx + lean * ht, ty = y + h - ht, sw = Math.max(1.6, S / 700);
        stroke(col, sw, (g) => { g.moveTo(bx, y + h); g.quadraticCurveTo(bx + lean * ht * 0.3, y + h - ht * 0.55, tx, ty); });
        const leaves = 6 + Math.floor(rng.next() * 4);
        for (let l = 0; l < leaves; l++) {
          const k = 0.2 + 0.75 * (l + rng.next()) / leaves, px0 = bx + lean * ht * k * k, py0 = y + h - ht * k, side = (l & 1 ? 1 : -1), ll = h * rng.range(0.1, 0.2), a = rng.range(0.3, 0.8);
          const ex = px0 + side * Math.sin(a) * ll, ey = py0 - Math.cos(a) * ll * rng.range(0.2, 1), lw = Math.max(2, S / 440);
          const lc = mul(col, rng.range(0.85, 1.15) * (0.7 + 0.3 * k));
          fill(lc, (g) => { g.moveTo(px0, py0 + lw); g.quadraticCurveTo(px0 + side * ll * 0.35, py0 - ll * 0.5, ex, ey); g.quadraticCurveTo(px0 + side * ll * 0.2, py0 - ll * 0.32, px0, py0 - lw); });
        }
        if (rng.chance(0.3)) {            // the plume: a loose tan panicle, leaning with the stem
          const pc = mul(mix(PLUME, [170, 146, 100], rng.range(0.4, 0.9)), rng.range(0.8, 0.98)), pl = h * rng.range(0.05, 0.085);
          for (let s2 = 0; s2 < 12; s2++) { const a = rng.range(-0.45, 0.45) + lean, k = rng.next(); stroke(pc, Math.max(1.3, S / 1000), (g) => { g.moveTo(tx, ty + pl * 0.2 - pl * k * 0.2); g.lineTo(tx + Math.sin(a) * pl * (0.4 + 0.6 * k) + lean * pl, ty - Math.cos(a) * pl * (0.5 + 0.7 * k)); }); }
        }
      }
    });
  }

  // ---- broadleaf bough: neutral light leaves (the species colour is a vertex colour) ---------------------------
  const leafBlob = (r, opts) => {
    ground(r, [150, 156, 138]);
    clip(r, (x, y, w, h) => {
      const cx = x + w / 2, cy = y + h / 2;
      // twigs, then leaves in loose clusters with sky between them: a bough is lace, not a plate
      const clusters = [];
      for (let i = 0; i < opts.clusters; i++) { const a = rng.range(0, 6.283), rr = Math.sqrt(rng.next()) * 0.36 * w; clusters.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, rng.range(0.05, 0.1) * w]); }
      for (const c of clusters) stroke([96, 84, 66], Math.max(1.5, S / 800), (g) => { g.moveTo(cx, cy + h * 0.12); g.quadraticCurveTo((cx + c[0]) / 2 + rng.range(-0.04, 0.04) * w, (cy + h * 0.12 + c[1]) / 2, c[0], c[1]); });
      for (let i = 0; i < opts.leaves; i++) {
        const c = clusters[Math.floor(rng.next() * clusters.length)], a = rng.range(0, 6.283), rr = Math.abs(rng.gauss()) * c[2] * 0.75;
        const lx = c[0] + Math.cos(a) * rr, ly = c[1] + Math.sin(a) * rr;
        if (Math.hypot(lx - cx, ly - cy) > 0.455 * w) continue;
        const s2 = opts.size * w * rng.range(0.7, 1.3), rot = rng.range(0, 6.283);
        const v = rng.range(0.6, 1.0) * (0.84 + 0.16 * (1 - (ly - y) / h));
        const col = mix([205 * v, 215 * v, 190 * v], [235 * v, 232 * v, 175 * v], rng.next() * 0.5);
        fill(col, (g) => { g.ellipse(lx, ly, s2, s2 * opts.aspect, rot, 0, 6.2832); });
      }
    });
  };
  leafBlob(REGIONS.leaf, { leaves: 620, size: 0.024, aspect: 0.6, clusters: 26 });

  // ---- feathery spray (tamarisk, cypress, juniper): short fine strokes along drooping branchlets ----------------
  {
    const r = REGIONS.feather; ground(r, [150, 156, 140]);
    clip(r, (x, y, w, h) => {
      const cx = x + w / 2, by = y + h * 0.98;
      for (let b = 0; b < 46; b++) {
        const a = rng.range(-1.25, 1.25), l = h * rng.range(0.45, 0.95) * (1 - 0.35 * Math.abs(a) / 1.25), bend = rng.range(-0.3, 0.3);
        const ex = cx + Math.sin(a) * l * 0.62, ey = by - Math.cos(a) * l, mx = cx + Math.sin(a + bend) * l * 0.4, myy = by - Math.cos(a + bend) * l * 0.5;
        stroke([120, 110, 92], Math.max(1.2, S / 1100), (g) => { g.moveTo(cx, by); g.quadraticCurveTo(mx, myy, ex, ey); });
        for (let t = 0; t < 46; t++) {
          const k = 0.15 + 0.85 * rng.next(), qx = (1 - k) * (1 - k) * cx + 2 * k * (1 - k) * mx + k * k * ex, qy = (1 - k) * (1 - k) * by + 2 * k * (1 - k) * myy + k * k * ey;
          const sa = a + rng.range(-1.1, 1.1), sl = w * rng.range(0.025, 0.06), v = rng.range(0.66, 1.0);
          stroke([200 * v, 212 * v, 196 * v], Math.max(2, S / 520), (g) => { g.moveTo(qx, qy); g.lineTo(qx + Math.sin(sa) * sl, qy - Math.cos(sa) * sl * 0.8 + sl * 0.25); });
        }
      }
    });
  }

  // ---- willow: curtains of small leaves on hanging strands ------------------------------------------------------
  {
    const r = REGIONS.willow; ground(r, [150, 160, 132]);
    clip(r, (x, y, w, h) => {
      for (let s = 0; s < 15; s++) {
        const sx = x + w * (0.06 + 0.88 * (s + rng.next()) / 15), l = h * rng.range(0.5, 0.98), sway = rng.range(-0.06, 0.06) * w;
        stroke([128, 122, 92], Math.max(1, S / 1400), (g) => { g.moveTo(sx, y); g.quadraticCurveTo(sx + sway, y + l * 0.5, sx + sway * 1.6, y + l); });
        for (let t = 0; t < 30; t++) {
          const k = rng.next(), lx = sx + sway * 1.6 * k * k, ly = y + l * k, v = rng.range(0.66, 1.0), side = rng.sign();
          fill([205 * v, 220 * v, 170 * v], (g) => { g.ellipse(lx + side * w * 0.014, ly, Math.max(1.2, w * 0.009), Math.max(4, w * 0.045), side * 0.45, 0, 6.2832); });
        }
      }
    });
  }

  // ---- opaque white ---------------------------------------------------------------------------------------------
  { const [x, y, w, h] = px(REGIONS.solid); for (const g of [gc, ga]) { g.fillStyle = '#fff'; g.fillRect(x - 0.1 * U, y - 0.1 * U, w + 0.2 * U, h + 0.2 * U); } }

  // ---- herb tuft: broad soft leaves fanning from the ground -----------------------------------------------------
  {
    const r = REGIONS.herb; ground(r, [150, 165, 120]);
    clip(r, (x, y, w, h) => {
      for (let i = 0; i < 26; i++) {
        const a = rng.range(-1.0, 1.0), l = h * rng.range(0.35, 0.92), bx = x + w * rng.range(0.3, 0.7), v = rng.range(0.66, 1.0);
        const ex = bx + Math.sin(a) * l * 0.55, ey = y + h - Math.cos(a) * l, lw = w * rng.range(0.07, 0.13);
        fill([190 * v, 215 * v, 150 * v], (g) => { g.moveTo(bx - lw * 0.3, y + h); g.quadraticCurveTo(bx + Math.sin(a) * l * 0.2 - lw, y + h - l * 0.6, ex, ey); g.quadraticCurveTo(bx + Math.sin(a) * l * 0.2 + lw, y + h - l * 0.5, bx + lw * 0.3, y + h); });
      }
    });
  }

  // ---- barley: the ears and awns along the edge of a standing crop ----------------------------------------------
  {
    const r = REGIONS.barley; ground(r, BARLEY);
    clip(r, (x, y, w, h) => {
      fill(mul(BARLEY, 0.92), (g) => { g.rect(x, y + h * 0.55, w, h * 0.45); });
      const n = Math.round(w / (S / 380));
      for (let i = 0; i < n; i++) {
        const bx = x + w * (i + rng.next()) / n, top = y + h * rng.range(0.04, 0.42), lean = rng.range(-0.12, 0.12) * h, col = mul(mix(BARLEY, [226, 205, 130], rng.next()), rng.range(0.8, 1.1));
        stroke(col, Math.max(1.5, S / 900), (g) => { g.moveTo(bx, y + h); g.lineTo(bx + lean, top + h * 0.2); });
        fill(mul(col, 1.05), (g) => { g.ellipse(bx + lean, top + h * 0.2, Math.max(1.6, S / 760), h * 0.16, lean / h, 0, 6.2832); });
        for (let a = 0; a < 3; a++) stroke(mul(col, 1.1), Math.max(1, S / 1600), (g) => { g.moveTo(bx + lean, top + h * 0.1); g.lineTo(bx + lean + rng.range(-0.1, 0.1) * h, top - h * 0.03); });
      }
    });
  }

  // ---- join colour and coverage ---------------------------------------------------------------------------------
  const col = gc.getImageData(0, 0, S, S).data, cov = ga.getImageData(0, 0, S, S).data;
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = col[i * 4]; data[i * 4 + 1] = col[i * 4 + 1]; data[i * 4 + 2] = col[i * 4 + 2]; data[i * 4 + 3] = cov[i * 4]; }
  // ---- our own mip chain: box filter, stopped at 32 texels, and in every region the alpha is rescaled so that the
  //      share of texels that pass the alpha test stays what it is at full size (fronds neither thin out nor clot)
  const thr = ALPHA_TEST * 255, regs = Object.values(REGIONS);
  const coverage = (d, w, r, k) => {
    const x0 = Math.floor(r[0] / 16 * w), x1 = Math.max(x0 + 1, Math.ceil(r[2] / 16 * w)), y0 = Math.floor(r[1] / 16 * w), y1 = Math.max(y0 + 1, Math.ceil(r[3] / 16 * w));
    let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] * k >= thr) n++;
    return n / ((x1 - x0) * (y1 - y0));
  };
  const base = regs.map((r) => coverage(data, S, r, 1));
  const mipmaps = [{ data, width: S, height: S }];
  for (let w = S, src = data; w > 32;) {
    const nw = w >> 1, dst = new Uint8Array(nw * nw * 4);
    for (let y = 0; y < nw; y++) for (let x = 0; x < nw; x++) {
      const i0 = ((y * 2) * w + x * 2) * 4, i1 = i0 + 4, i2 = i0 + w * 4, i3 = i2 + 4, o = (y * nw + x) * 4;
      for (let c = 0; c < 3; c++) dst[o + c] = Math.round(Math.sqrt((src[i0 + c] * src[i0 + c] + src[i1 + c] * src[i1 + c] + src[i2 + c] * src[i2 + c] + src[i3 + c] * src[i3 + c]) / 4));
      dst[o + 3] = (src[i0 + 3] + src[i1 + 3] + src[i2 + 3] + src[i3 + 3] + 2) >> 2;
    }
    regs.forEach((r, ri) => {
      if (base[ri] > 0.985) return;
      let lo = 0.4, hi = 8;
      for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (coverage(dst, nw, r, mid) < base[ri]) lo = mid; else hi = mid; }
      const k = (lo + hi) / 2, x0 = Math.floor(r[0] / 16 * nw), x1 = Math.ceil(r[2] / 16 * nw), y0 = Math.floor(r[1] / 16 * nw), y1 = Math.ceil(r[3] / 16 * nw);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * nw + x) * 4 + 3; dst[o] = Math.min(255, Math.round(dst[o] * k)); }
    });
    mipmaps.push({ data: dst, width: nw, height: nw });
    src = dst; w = nw;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'vegetation.atlas'; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.mipmaps = mipmaps; tex.generateMipmaps = false;
  tex.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;

  /** uv rectangle of a region with a small inset: { u0, v0, u1, v1 } (v grows DOWN the painted image). */
  const rect = (name, inset = 0.02) => { const r = REGIONS[name]; return { u0: (r[0] + inset) / 16, v0: (r[1] + inset) / 16, u1: (r[2] - inset) / 16, v1: (r[3] - inset) / 16 }; };
  return { texture: tex, size: S, rect, canvases: [cc, ca], mipmaps, crownFronds, frondPath };
}
