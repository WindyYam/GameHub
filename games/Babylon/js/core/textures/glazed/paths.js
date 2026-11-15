// glazed/paths.js — vector-path helpers and the layered painter used to draw the relief figures.
// OWNER: relief artist. DOM canvas only (Path2D, CanvasRenderingContext2D); no THREE.
//
// A figure is drawn ONCE as a list of operations in figure metres (x right, y up, feet on y = 0, the animal
// walking to the RIGHT). The painter plays that list into up to five canvases that share one transform:
//   col    colour (albedo before bricks)        sil    silhouette + relief level (grey)
//   form   soft modelling (128 = level)         raise  crisp raised details (curls, locks, eye rims)
//   cut    incised lines
// atlas.js turns sil / form / raise / cut into a height field and from that into the normal map.

/** Points are [x, y] or [x, y, 1] (1 = corner: no smoothing through this point). */
function ctrl(pts, closed) {
  const n = pts.length;
  const get = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const tan = (i) => {
    const q = get(i);
    if (q[2]) return null;
    const a = get(i - 1), b = get(i + 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const segs = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = get(i), b = get(i + 1), d = Math.hypot(b[0] - a[0], b[1] - a[1]) / 3;
    const ta = tan(i), tb = tan(i + 1);
    const c1 = ta ? [a[0] + ta[0] * d, a[1] + ta[1] * d] : [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
    const c2 = tb ? [b[0] - tb[0] * d, b[1] - tb[1] * d] : [b[0] - (b[0] - a[0]) / 3, b[1] - (b[1] - a[1]) / 3];
    segs.push([a, c1, c2, b]);
  }
  return segs;
}

/** Smooth spline through points as a Path2D (closed by default). */
export function sp(pts, closed = true) {
  const p = new Path2D(), segs = ctrl(pts, closed);
  p.moveTo(pts[0][0], pts[0][1]);
  for (const [, c1, c2, b] of segs) p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]);
  if (closed) p.closePath();
  return p;
}
/** Open smooth line. */
export const ln = (pts) => sp(pts, false);

/** The same spline sampled to a polyline [[x, y], ...] (`per` samples per segment). */
export function sample(pts, closed = false, per = 8) {
  const out = [], segs = ctrl(pts, closed);
  for (const [a, c1, c2, b] of segs) {
    for (let k = 0; k < per; k++) {
      const t = k / per, u = 1 - t;
      out.push([
        u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
        u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
      ]);
    }
  }
  if (!closed) { const l = pts[pts.length - 1]; out.push([l[0], l[1]]); }
  return out;
}

/** Straight polygon. */
export function poly(pts, closed = true) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
}

export function ell(cx, cy, rx, ry = rx, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

/** Arc (open) as a Path2D: centre, radius, start and end angle in radians (counter-clockwise in y-up space). */
export function arc(cx, cy, r, a0, a1) {
  const p = new Path2D(), n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.25));
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  return p;
}

/** Cumulative length table of a polyline. */
export function lengths(pl) {
  const s = [0];
  for (let i = 1; i < pl.length; i++) s.push(s[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
  return s;
}
/** Point, unit tangent and normal (left of travel) at arc length `d` along a polyline. */
export function along(pl, s, d) {
  let i = 1;
  while (i < pl.length - 1 && s[i] < d) i++;
  const a = pl[i - 1], b = pl[i], seg = s[i] - s[i - 1] || 1, t = Math.max(0, Math.min(1, (d - s[i - 1]) / seg));
  const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty, nx: -ty, ny: tx };
}

/**
 * Variable-width stroke as a closed outline. pts: [x, y, width]. caps: 'round' | 'point' | 'flat' at start / end.
 * Returns { path: Path2D, ring: [[x, y], ...] }.
 */
export function tube(pts, { start = 'flat', end = 'round', per = 8 } = {}) {
  const pl = sample(pts.map((p) => [p[0], p[1]]), false, per), s = lengths(pl), L = s[s.length - 1];
  const ws = pts.map((p) => p[2]);
  // width along arc length: interpolate over the control points' own arc positions
  const cs = lengths(pts.map((p) => [p[0], p[1]])), CL = cs[cs.length - 1] || 1;
  const widthAt = (d) => {
    const q = (d / L) * CL; let i = 1;
    while (i < cs.length - 1 && cs[i] < q) i++;
    const t = Math.max(0, Math.min(1, (q - cs[i - 1]) / (cs[i] - cs[i - 1] || 1)));
    return ws[i - 1] + (ws[i] - ws[i - 1]) * t;
  };
  const left = [], right = [];
  for (let i = 0; i < pl.length; i++) {
    const a = along(pl, s, s[i]), h = widthAt(s[i]) / 2;
    left.push([a.x + a.nx * h, a.y + a.ny * h]); right.push([a.x - a.nx * h, a.y - a.ny * h]);
  }
  const ring = [...left];
  const e = along(pl, s, L), he = widthAt(L) / 2;
  if (end === 'round') for (let k = 1; k < 6; k++) { const a = Math.PI / 2 - (Math.PI * k) / 6; ring.push([e.x + (e.tx * Math.cos(a) + e.nx * Math.sin(a)) * he, e.y + (e.ty * Math.cos(a) + e.ny * Math.sin(a)) * he]); }
  else if (end === 'point') ring.push([e.x + e.tx * he * 1.6, e.y + e.ty * he * 1.6]);
  for (let i = right.length - 1; i >= 0; i--) ring.push(right[i]);
  const b = along(pl, s, 0), hb = widthAt(0) / 2;
  if (start === 'round') for (let k = 1; k < 6; k++) { const a = -Math.PI / 2 - (Math.PI * k) / 6; ring.push([b.x + (b.tx * Math.cos(a) + b.nx * Math.sin(a)) * hb, b.y + (b.ty * Math.cos(a) + b.ny * Math.sin(a)) * hb]); }
  else if (start === 'point') ring.push([b.x - b.tx * hb * 1.6, b.y - b.ty * hb * 1.6]);
  return { path: poly(ring), ring, centre: pl, s };
}

/** Point in polygon (ring of [x, y]). */
export function inside(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Deterministic hash in [0, 1) for decorative jitter inside a figure. */
export function h2(i, j, seed = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * The painter. `layers`: { col, sil, form, raise, cut } 2D contexts (any may be null). `xf`: { sx, sy, ox, oy, mirror, cellW }
 * maps figure metres to pixels: px = ox + (mirror ? cellW - x : x) * sx, py = oy - y * sy.
 * Operations are recorded and played by flush(): the dark outline of every solid goes down first, so that
 * it shows only round the union of the solids, as the black glass line round the colour fields of the originals.
 */
export class Painter {
  constructor(layers, xf, K) {
    this.L = layers; this.xf = xf; this.K = K; this.ops = [];
    this.outlineW = 0.0075;
  }
  /**
   * Part of the silhouette, filled with a colour. `level` 0..1 scales the relief (far-side legs lie lower).
   * `grow` (metres) fattens the part: its outline is moved outwards by that much all round (a leg drawn 6 cm wide
   * with grow 0.01 is 8 cm wide), in colour and in relief alike.
   */
  solid(path, color, level = 1, grow = 0) { this.ops.push({ t: 'solid', path, color, level, grow }); return this; }
  /** Colour only, inside the silhouette. */
  paint(path, color) { this.ops.push({ t: 'paint', path, color }); return this; }
  /** Dark incised line: colour + groove. width in metres. */
  ink(path, width = 0.005, alpha = 0.85, depth = 1) { this.ops.push({ t: 'ink', path, width, alpha, depth }); return this; }
  /** Coloured stroke, colour layer only. */
  pen(path, width, color, alpha = 1) { this.ops.push({ t: 'pen', path, width, color, alpha }); return this; }
  /** Groove only. */
  groove(path, width = 0.005, depth = 1) { this.ops.push({ t: 'groove', path, width, depth }); return this; }
  /** Soft modelling: k in -1..1 (fraction of the form amplitude), blur radius in metres. */
  bulge(path, k, blur = 0.03) { this.ops.push({ t: 'bulge', path, k, blur }); return this; }
  /** Crisp raised detail, optionally coloured, with a thin dark rim. */
  boss(path, color = null, rim = 0.0035) { this.ops.push({ t: 'boss', path, color, rim }); return this; }

  flush() {
    const { L, xf, K } = this;
    const a = xf.mirror ? -xf.sx : xf.sx, e = xf.mirror ? xf.ox + xf.cellW * xf.sx : xf.ox;
    for (const g of Object.values(L)) if (g) { g.save(); g.transform(a, 0, 0, -xf.sy, e, xf.oy); g.lineJoin = 'round'; g.lineCap = 'round'; }
    const { col, sil, form, raise, cut } = L;
    if (col) {
      col.strokeStyle = K.line;
      for (const o of this.ops) if (o.t === 'solid') { col.lineWidth = (this.outlineW + (o.grow || 0)) * 2; col.stroke(o.path); }
    }
    for (const o of this.ops) {
      switch (o.t) {
        case 'solid':
          if (col) { col.fillStyle = o.color; col.fill(o.path); if (o.grow) { col.strokeStyle = o.color; col.lineWidth = o.grow * 2; col.stroke(o.path); } }
          if (sil) { const v = Math.round(255 * o.level); sil.fillStyle = `rgb(${v},${v},${v})`; sil.fill(o.path); if (o.grow) { sil.strokeStyle = sil.fillStyle; sil.lineWidth = o.grow * 2; sil.stroke(o.path); } }
          break;
        case 'paint':
          if (col) { col.fillStyle = o.color; col.fill(o.path); }
          break;
        case 'ink':
          if (col) { col.globalAlpha = o.alpha; col.strokeStyle = K.line; col.lineWidth = o.width; col.stroke(o.path); col.globalAlpha = 1; }
          if (cut) { const v = Math.round(255 * Math.min(1, o.depth)); cut.strokeStyle = `rgb(${v},${v},${v})`; cut.lineWidth = o.width * 1.15; cut.stroke(o.path); }
          break;
        case 'pen':
          if (col) { col.globalAlpha = o.alpha; col.strokeStyle = o.color; col.lineWidth = o.width; col.stroke(o.path); col.globalAlpha = 1; }
          break;
        case 'groove':
          if (cut) { const v = Math.round(255 * Math.min(1, o.depth)); cut.strokeStyle = `rgb(${v},${v},${v})`; cut.lineWidth = o.width; cut.stroke(o.path); }
          break;
        case 'bulge':
          if (form) {
            form.filter = `blur(${Math.max(0.5, o.blur * xf.sx).toFixed(2)}px)`;
            form.fillStyle = o.k >= 0 ? `rgba(255,255,255,${Math.min(1, o.k)})` : `rgba(0,0,0,${Math.min(1, -o.k)})`;
            form.fill(o.path); form.filter = 'none';
          }
          break;
        case 'boss':
          if (col) {
            if (o.color) { col.fillStyle = o.color; col.fill(o.path); }
            if (o.rim) { col.globalAlpha = 0.8; col.strokeStyle = K.line; col.lineWidth = o.rim; col.stroke(o.path); col.globalAlpha = 1; }
          }
          if (raise) { raise.fillStyle = '#fff'; raise.fill(o.path); }
          break;
        default: break;
      }
    }
    for (const g of Object.values(L)) if (g) g.restore();
    this.ops.length = 0;
  }
}
