// js/modules/vegetation/geo.js — the plant meshes, all in LOCAL space with their foot at the origin, y up.
//
// PALMS are built in a unit space that one instance matrix turns into any palm: x and z are in CROWN RADII, y of
// the trunk is in TRUNK HEIGHTS (0 at the foot, 1 where the crown sits). An instance is scaled (R, H, R). Crown
// vertices sit at y = 1 and carry their own height above the crown base in the attribute aVeg.z (10 + height in
// crown radii); the vertex shader of the leaf material puts them at 1 + height * R / H, so the crown keeps its
// shape whatever the trunk height is. One mesh per level of detail serves palms from 2 to 19 m.
//
// Every vertex carries: position, normal (authored: foliage normals lean outward from the crown so that a crown
// has a lit and a shaded side), uv into the painted atlas (atlas.js; v grows down the image), colour (tint and a
// baked darkening toward the heart of the crown) and aVeg = (sway in metres at wind strength 1, phase, code: 0 foliage,
// -1 palm bark (v scaled by the trunk height), -2 wood (not tinted by the instance), 10 + h crown height).
import { Rng } from '../../core/rng.js';

const TAU = Math.PI * 2;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export class MB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.v = []; this.i = []; }
  vert(x, y, z, nx, ny, nz, u, v, col, sway = 0, phase = 0, code = 0) {
    const k = this.p.length / 3, l = Math.hypot(nx, ny, nz) || 1;
    this.p.push(x, y, z); this.n.push(nx / l, ny / l, nz / l); this.uv.push(u, v); this.c.push(col[0], col[1], col[2]); this.v.push(sway, phase, code);
    return k;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  get tris() { return this.i.length / 3; }
  build(THREE, name, sphere = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aVeg', new THREE.Float32BufferAttribute(this.v, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.name = name;
    if (sphere) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(sphere[0], sphere[1], sphere[2]), sphere[3]); else g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------------------------ palms --------
export const PALM = {
  curve: 0.16,                 // sideways bend of the trunk at its top, in crown radii
  frondLength: 1.2,            // a frond in crown radii
  trunkRadius: 0.062,
};
const trunkX = (y) => PALM.curve * (1 - (1 - y) * (1 - y));
const trunkR = (y) => PALM.trunkRadius + 0.036 * Math.pow(1 - Math.min(1, y / 0.09), 2) + 0.026 * smooth(0.72, 1, y);
const W = [1, 1, 1];

/** The trunk: rings of `sides` vertices, bark mapped mirror-wise round it, v in metres / 4 (the shader multiplies by the height). */
function palmTrunk(mb, R, sides, ys, fat = 1) {
  const b = R('bark', 0.05), rows = [];
  for (const y of ys) {
    const row = [], r = trunkR(y) * fat, cx = trunkX(y);
    const shade = 0.8 + 0.2 * smooth(0, 0.12, y) - 0.25 * smooth(0.86, 1, y);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, t = k / sides, u = b.u0 + (b.u1 - b.u0) * (t < 0.5 ? t * 2 : 2 - t * 2);
      row.push(mb.vert(cx + r * Math.cos(a), y, r * Math.sin(a), Math.cos(a), 0.05, Math.sin(a), u, y / 4, [shade, shade, shade], 0.05 * y * y, 0, -1));
    }
    rows.push(row);
  }
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < sides; k++) mb.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
}

/**
 * One frond as a strip along its arching path: folded into a V along the rachis (three vertices per row) or flat
 * (two). o: { az, el, droop, len, half (half width), fold, roll, base: [x, h, z] (crown radii; h above the crown
 * base), rect, tint, seg, phase, flat }
 */
function palmFrond(mb, o) {
  const seg = o.seg, ca = Math.cos(o.az), sa = Math.sin(o.az), r = o.rect;
  let x = o.base[0], h = o.base[1], z = o.base[2];
  const cx = PALM.curve, prevRow = [], cols = o.flat ? [[-1, r.v0], [1, r.v1]] : [[-1, r.v0], [0, (r.v0 + r.v1) / 2], [1, r.v1]];
  for (let i = 0; i <= seg; i++) {
    const s = i / seg, th = o.el - o.droop * Math.pow(s, 1.4);
    if (i > 0) { const tm = o.el - o.droop * Math.pow((i - 0.5) / seg, 1.4), d = o.len / seg; x += Math.cos(tm) * ca * d; h += Math.sin(tm) * d; z += Math.cos(tm) * sa * d; }
    let side = [-sa, 0, ca], up = [-Math.sin(th) * ca, Math.cos(th), -Math.sin(th) * sa];
    if (o.roll) { const cr = Math.cos(o.roll), sr = Math.sin(o.roll); const s2 = [side[0] * cr + up[0] * sr, side[1] * cr + up[1] * sr, side[2] * cr + up[2] * sr]; up = [up[0] * cr - side[0] * sr, up[1] * cr - side[1] * sr, up[2] * cr - side[2] * sr]; side = s2; }
    const fold = o.flat ? 0 : o.fold * (0.6 + 0.4 * s), cf = Math.cos(fold), sf = Math.sin(fold), w = o.half;
    // outward direction from the heart of the crown: what the foliage normals lean to
    let ox = x - cx, oy = h + 0.25, oz = z; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    const shade = (0.3 + 0.7 * smooth(0.0, 0.45, s)) * (0.88 + 0.12 * smooth(-0.4, 0.5, h));
    const col = [o.tint[0] * shade, o.tint[1] * shade, o.tint[2] * shade], sway = 0.05 + 0.13 * s * s, u = r.u0 + (r.u1 - r.u0) * s;
    const row = [];
    for (const [k, v] of cols) {
      const px = x + k * w * cf * side[0] + Math.abs(k) * w * sf * up[0], ph = h + k * w * cf * side[1] + Math.abs(k) * w * sf * up[1], pz = z + k * w * cf * side[2] + Math.abs(k) * w * sf * up[2];
      const nx = up[0] * cf - k * side[0] * sf, ny = up[1] * cf - k * side[1] * sf, nz = up[2] * cf - k * side[2] * sf;
      row.push(mb.vert(px, 1, pz, nx * 0.45 + ox * 0.55, ny * 0.45 + oy * 0.55 + 0.12, nz * 0.45 + oz * 0.55, u, v, col, sway * (k === 0 ? 1 : 1.15), o.phase + s * 0.35, 10 + ph));
    }
    if (i > 0) for (let c = 0; c < row.length - 1; c++) mb.quad(prevRow[c], prevRow[c + 1], row[c + 1], row[c]);
    for (let c = 0; c < row.length; c++) prevRow[c] = row[c];
  }
}

/**
 * The near palm: curved trunk with the stubs of old frond bases under the crown, 64 arching fronds with leaflets
 * on alpha cards (the lowest ones dry), fruit stalks, and (variant 'old') a skirt of dead fronds against the trunk.
 */
export function palmNear(THREE, R, variant = 'full') {
  const mb = new MB(), rng = new Rng('vegetation:palm:' + variant);
  palmTrunk(mb, R, 9, [0, 0.03, 0.09, 0.2, 0.34, 0.48, 0.62, 0.76, 0.88, 0.96, 1.0]);
  // old frond bases: short stubs standing off the upper trunk in a spiral (R5 3.5: "diamond leaf-base pattern")
  const bark = R('bark', 0.2), nStub = variant === 'old' ? 46 : 34, span = variant === 'old' ? 0.5 : 0.34;
  for (let i = 0; i < nStub; i++) {
    const y = 1 - span * (i + 0.5) / nStub, a = i * 2.39996, r0 = trunkR(y) * 0.9, cx = trunkX(y);
    const ca = Math.cos(a), sa = Math.sin(a), len = 0.03 + 0.022 * rng.next(), wd = 0.024, lift = 0.012 + 0.008 * rng.next();
    const c0 = 0.85 + 0.3 * rng.next(), col = [c0 * 1.1, c0 * 1.0, c0 * 0.9], dk = [0.5, 0.48, 0.45], v0 = rng.next() * 0.9, dv = 0.012, sw = 0.05 * y * y;
    const p = (rr, yy, t) => [cx + rr * ca - t * sa, yy, rr * sa + t * ca];
    const a0 = p(r0, y - 0.006, -wd), a1 = p(r0, y - 0.006, wd), b0 = p(r0 + len, y + lift, -wd * 0.75), b1 = p(r0 + len, y + lift, wd * 0.75), c1 = p(r0, y + lift * 1.6, 0);
    const i0 = mb.vert(a0[0], a0[1], a0[2], ca, -0.4, sa, bark.u0, v0, dk, sw, 0, -1), i1 = mb.vert(a1[0], a1[1], a1[2], ca, -0.4, sa, bark.u1, v0, dk, sw, 0, -1);
    const i2 = mb.vert(b1[0], b1[1], b1[2], ca, 0.7, sa, bark.u1, v0 + dv, col, sw, 0, -1), i3 = mb.vert(b0[0], b0[1], b0[2], ca, 0.7, sa, bark.u0, v0 + dv, col, sw, 0, -1);
    const i4 = mb.vert(c1[0], c1[1], c1[2], ca, 0.9, sa, (bark.u0 + bark.u1) / 2, v0 + dv, col, sw, 0, -1);
    mb.quad(i0, i1, i2, i3); mb.tri(i3, i2, i4);
  }
  const cx = PALM.curve, fa = R('frondA', 0.03), fb = R('frondB', 0.03);
  const N = variant === 'old' ? 56 : 64;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);                                                 // 0 = the youngest spear, 1 = the lowest frond
    const el = (86 - 128 * Math.pow(k, 0.88)) * Math.PI / 180 + rng.range(-0.09, 0.09);
    const az = i * 2.39996 + rng.range(-0.25, 0.25);
    const droop = (0.28 + 1.05 * Math.min(1, k * 1.2)) * rng.range(0.85, 1.2);
    const len = PALM.frondLength * (0.6 + 0.46 * Math.sin(Math.PI * Math.min(1, 0.1 + k * 1.05))) * rng.range(0.9, 1.06);
    const young = 1 - k, g = 0.8 + 0.3 * young;
    const dry = variant === 'old' ? k > 0.8 && rng.chance(0.75) : k > 0.92 && rng.chance(0.6);
    const tint = dry ? [1, 0.97, 0.92] : [g * (0.97 + 0.08 * young), g, g * (0.92 - 0.1 * young)];
    const br = 0.04 + 0.03 * k;
    palmFrond(mb, { az, el, droop, len, half: len * 0.105, fold: (0.6 - 0.7 * k) * (dry ? 0.3 : 1), roll: rng.range(-0.25, 0.25), base: [cx + br * Math.cos(az), 0.0 + 0.14 * young, br * Math.sin(az)], rect: dry ? fb : fa, tint, seg: k < 0.1 ? 3 : 5, phase: rng.next() });
  }
  if (variant === 'old') {                                               // the skirt: last years' fronds hanging against the trunk
    for (let i = 0; i < 12; i++) {
      const az = i * 2.39996 * 1.7 + rng.range(-0.3, 0.3);
      palmFrond(mb, { az, el: -1.0 + rng.range(-0.2, 0.15), droop: 0.45, len: PALM.frondLength * rng.range(0.55, 0.85), half: 0.085, fold: -0.2, roll: rng.range(-0.5, 0.5), base: [cx + 0.06 * Math.cos(az), -0.05, 0.06 * Math.sin(az)], rect: fb, tint: [0.9, 0.86, 0.8], seg: 3, phase: rng.next() });
    }
  }
  // fruit stalks under the crown
  const d = R('dates', 0.04), third = (d.u1 - d.u0) / 3;
  for (let i = 0; i < 7; i++) {
    const az = i * TAU / 7 + rng.range(-0.3, 0.3), ca = Math.cos(az), sa = Math.sin(az), u0 = d.u0 + third * (i % 3), u1 = u0 + third;
    const r0 = 0.07, r1 = 0.2 + 0.1 * rng.next(), h0 = 0.03, h1 = -0.3 - 0.12 * rng.next(), hw = 0.09, col = [0.95, 0.95, 0.9];
    const q = [[r0, h0, -hw], [r0, h0, hw], [r1, h1, hw], [r1, h1, -hw]].map(([rr, hh, t], n) => mb.vert(cx + rr * ca - t * sa, 1, rr * sa + t * ca, ca, 0.5, sa, n === 0 || n === 3 ? u0 : u1, n < 2 ? d.v0 : d.v1, col, 0.06 + (n >= 2 ? 0.05 : 0), 0.3 * i, 10 + hh));
    mb.quad(q[0], q[1], q[2], q[3]);
  }
  return mb.build(THREE, 'palm-near-' + variant, [0.08, 0.62, 0, 1.8]);
}

/** Crossed vertical cards of a whole crown (side view) round the crown centre; `split` adds a middle column (rounder shading). */
function crownCards(mb, R, n, cx, radius, turn = 0, baseH = 1, tint = W, split = true) {
  const r = R('crownSide', 0.03), um = (r.u0 + r.u1) / 2;
  // the painted crown spans 2.16 x 1.7 radii, its centre 0.75 radii above the lower edge
  const hw = 1.08 * radius, top = 0.95 * radius, bot = -0.75 * radius;
  for (let k = 0; k < n; k++) {
    const a = turn + (k / n) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const col = [tint[0], tint[1], tint[2]], dk = [tint[0] * 0.78, tint[1] * 0.78, tint[2] * 0.78];
    const v = (t, hh, u, vv, c, nx, ny, nz, sw) => mb.vert(cx + t * ca, baseH, t * sa, nx, ny, nz, u, vv, c, sw, 0.13 * k, 10 + hh);
    const l0 = v(-hw, bot, r.u0, r.v1, dk, -ca * 0.7, 0.2, -sa * 0.7, 0.12), l1 = v(-hw, top, r.u0, r.v0, col, -ca * 0.6, 0.85, -sa * 0.6, 0.16);
    const r0 = v(hw, bot, r.u1, r.v1, dk, ca * 0.7, 0.2, sa * 0.7, 0.12), r1 = v(hw, top, r.u1, r.v0, col, ca * 0.6, 0.85, sa * 0.6, 0.16);
    if (split) { const m0 = v(0, bot, um, r.v1, dk, 0, 0.5, 0, 0.05), m1 = v(0, top, um, r.v0, col, 0, 1, 0, 0.1); mb.quad(l0, m0, m1, l1); mb.quad(m0, r0, r1, m1); } else mb.quad(l0, r0, r1, l1);
  }
}
/** A fan of the top view of the crown: apex over the centre, rim lower: what an aerial camera sees of a far palm. */
function crownFan(mb, R, sides, cx, radius, apexH, rimH, rimR, tint = W, baseH = 1, turn = 0) {
  const r = R('crownTop', 0.03), uc = (r.u0 + r.u1) / 2, vc = (r.v0 + r.v1) / 2, ur = (r.u1 - r.u0) / 2, vr = (r.v1 - r.v0) / 2;
  const k = rimR / 1.08, corner = 1 / Math.cos(Math.PI / sides);            // the rim polygon contains the painted circle
  const c = mb.vert(cx, baseH, 0, 0, 1, 0, uc, vc, tint, 0.08, 0, 10 + apexH * radius);
  const rim = [];
  for (let i = 0; i <= sides; i++) {
    const a = turn + (i / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a), dk = [tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9];
    rim.push(mb.vert(cx + ca * rimR * radius * corner, baseH, sa * rimR * radius * corner, ca * 0.35, 0.9, sa * 0.35, uc + ca * ur * k * corner, vc + sa * vr * k * corner, dk, 0.15, 0.1 * i, 10 + rimH * radius));
  }
  for (let i = 0; i < sides; i++) mb.tri(c, rim[i], rim[i + 1]);
}

/**
 * The middle palm (camera 200 to 600 m away, and every flight): a four-sided trunk and 16 broad fronds as flat
 * strips in three tiers, so that the crown is a starburst from every side and from above. About 110 triangles.
 */
export function palmMid(THREE, R) {
  const mb = new MB(), rng = new Rng('vegetation:palm:mid'), fa = R('frondA', 0.03), fb = R('frondB', 0.03), cx = PALM.curve;
  palmTrunk(mb, R, 4, [0, 0.12, 1.0], 1.1);
  const tiers = [[6, 1.08, 0.45, 0.7], [9, 0.5, 0.95, 1.0], [9, -0.05, 0.95, 0.96]];            // count, elevation, droop, length
  let n = 0;
  for (const [cnt, el0, droop, ln] of tiers) for (let i = 0; i < cnt; i++, n++) {
    const az = (i / cnt) * TAU + n * 0.7 + rng.range(-0.15, 0.15), k = n / 23, g = 1.0 - 0.25 * k, dry = k > 0.92;
    palmFrond(mb, { az, el: el0 + rng.range(-0.16, 0.16), droop: droop * rng.range(0.9, 1.2), len: PALM.frondLength * ln * rng.range(0.92, 1.05), half: PALM.frondLength * ln * 0.135, roll: rng.range(-0.6, 0.6), base: [cx + 0.03 * Math.cos(az), 0.1 * (1 - k), 0.03 * Math.sin(az)], rect: dry ? fb : fa, tint: dry ? [0.95, 0.92, 0.88] : [g, g, g * 0.95], seg: 2, phase: rng.next(), flat: true });
  }
  return mb.build(THREE, 'palm-mid', [0.08, 0.62, 0, 1.8]);
}

/** One far palm into a builder: 3-sided trunk (thickened so that it still draws), crossed crown cards, a top fan. */
function farPalmInto(mb, R, ox, oz, hk, rk, turn, cards, sides, trunk = true, apex = 0.42, rimH = -0.12) {
  const b = R('bark', 0.3), um = (b.u0 + b.u1) / 2, cx = ox + PALM.curve * rk * 0.6;
  if (trunk) {
    const rows = [];
    for (const y of [0, hk]) { const row = []; for (let k = 0; k <= 3; k++) { const a = turn + (k / 3) * TAU, rr = 0.08 * (y === 0 ? 1.3 : 1); row.push(mb.vert((y === 0 ? ox : cx) + rr * Math.cos(a), y, oz + rr * Math.sin(a), Math.cos(a), 0.1, Math.sin(a), um, y * 2, [0.9, 0.9, 0.9], 0, 0, -1)); } rows.push(row); }
    for (let k = 0; k < 3; k++) mb.quad(rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]);
  }
  const sub = new MB();
  if (cards) crownCards(sub, R, cards, 0, rk, turn, 0, W, false);
  crownFan(sub, R, sides, 0, rk, apex, rimH, 1.0, W, 0, turn);
  // move the crown: positions (x, 0, z) -> (cx + x, hk, oz + z); the height code is already in crown radii
  const base = mb.p.length / 3;
  for (let k = 0; k < sub.p.length / 3; k++) {
    mb.p.push(cx + sub.p[k * 3], hk, oz + sub.p[k * 3 + 2]); mb.n.push(sub.n[k * 3], sub.n[k * 3 + 1], sub.n[k * 3 + 2]);
    mb.uv.push(sub.uv[k * 2], sub.uv[k * 2 + 1]); mb.c.push(sub.c[k * 3], sub.c[k * 3 + 1], sub.c[k * 3 + 2]); mb.v.push(0, 0, sub.v[k * 3 + 2]);
  }
  for (const i of sub.i) mb.i.push(base + i);
}
/** The far palm (never nearer than 350 m to the camera): 15 triangles. */
export function palmFar(THREE, R) {
  const mb = new MB();
  farPalmInto(mb, R, 0, 0, 1, 1, 0.2, 2, 5);
  return mb.build(THREE, 'palm-far', [0.05, 0.62, 0, 1.8]);
}
/** Three crowns of one garden as ONE instance of 9 triangles (beyond 1.2 km from the camera path: no trunks). */
export function palmClump(THREE, R) {
  const mb = new MB();
  // crowns a third larger than life: these instances cast no shadow, and from 1.2 km and more a garden must still read dark
  farPalmInto(mb, R, 0, 0, 1, 1.3, 0.2, 0, 3, false, 0.55, -0.5);
  farPalmInto(mb, R, 2.2, 0.9, 0.8, 1.2, 1.3, 0, 3, false, 0.55, -0.5);
  farPalmInto(mb, R, -0.7, 2.3, 1.14, 1.25, 2.4, 0, 3, false, 0.55, -0.5);
  return mb.build(THREE, 'palm-clump', [0.6, 0.7, 0.9, 4.2]);
}

// ------------------------------------------------------------------------------------------- other trees -------
// Unit space: height 1 = the tree's height; widths in the same unit. Instances scale (width, height, width).
function stem(mb, R, pts, r0, r1, sides, col, sway0 = 0, sway1 = 0) {
  const s = R('solid', 0.25), um = (s.u0 + s.u1) / 2, vm = (s.v0 + s.v1) / 2, rows = [];
  for (let j = 0; j < pts.length; j++) {
    const t = j / (pts.length - 1), r = r0 + (r1 - r0) * t, row = [];
    for (let k = 0; k <= sides; k++) { const a = (k / sides) * TAU, sh = 0.82 + 0.18 * Math.cos(a * 3 + j); row.push(mb.vert(pts[j][0] + r * Math.cos(a), pts[j][1], pts[j][2] + r * Math.sin(a), Math.cos(a), 0.1, Math.sin(a), um, vm, [col[0] * sh, col[1] * sh, col[2] * sh], sway0 + (sway1 - sway0) * t * t, 0, -2)); }
    rows.push(row);
  }
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < sides; k++) mb.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
}
/** A card of the atlas: centre c, half extents along the unit vectors a (u) and b (v up), normals leaning outward from `centre`. */
function card(mb, r, c, a, b, ha, hb, centre, col, sway, phase, flip = false, dark = 0.8) {
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [c[0] + a[0] * ha * s + b[0] * hb * t, c[1] + a[1] * ha * s + b[1] * hb * t, c[2] + a[2] * ha * s + b[2] * hb * t]);
  const id = pts.map((p, n) => {
    let nx = p[0] - centre[0], ny = p[1] - centre[1] + 0.12, nz = p[2] - centre[2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const u = (n === 0 || n === 3) !== flip ? r.u0 : r.u1, v = n < 2 ? r.v1 : r.v0, k = n < 2 ? dark : 1;
    return mb.vert(p[0], p[1], p[2], nx, ny * 0.8 + 0.3, nz, u, v, [col[0] * k, col[1] * k, col[2] * k], sway * (n < 2 ? 0.6 : 1), phase, 0);
  });
  mb.quad(id[0], id[1], id[2], id[3]);
}
/** A lumpy closed blob (icosahedron pushed in and out): the body that keeps a canopy from being seen through, and the far level. */
function blob(mb, R, c, rx, ry, rz, col, rng, lumps = 0.22, sway = 0.03, detail = 0) {
  const s = R('solid', 0.25), u = (s.u0 + s.u1) / 2, v = (s.v0 + s.v1) / 2, t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  if (detail > 0) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => { const k = a < b ? a * 1000 + b : b * 1000 + a; if (mid.has(k)) return mid.get(k); const p = [V[a][0] + V[b][0], V[a][1] + V[b][1], V[a][2] + V[b][2]], l = Math.hypot(...p); V.push([p[0] / l, p[1] / l, p[2] / l]); mid.set(k, V.length - 1); return V.length - 1; };
    for (const f of F) { const a = m(f[0], f[1]), b = m(f[1], f[2]), cc = m(f[2], f[0]); F2.push([f[0], a, cc], [f[1], b, a], [f[2], cc, b], [a, b, cc]); }
    F = F2;
  }
  const ids = V.map((p) => {
    const k = 1 + lumps * (rng.next() * 2 - 1), sh = 0.62 + 0.38 * smooth(-0.9, 0.7, p[1]);
    return mb.vert(c[0] + p[0] * rx * k, c[1] + p[1] * ry * k, c[2] + p[2] * rz * k, p[0], p[1] * 0.8 + 0.25, p[2], u, v, [col[0] * sh, col[1] * sh, col[2] * sh], sway * (0.5 + 0.5 * (p[1] + 1) / 2), 0.3, 0);
  });
  for (const f of F) mb.tri(ids[f[0]], ids[f[1]], ids[f[2]]);
}
const BARKCOL = [0.33, 0.28, 0.23];     // wood: code -2 in aVeg.z, so the leaf tint of the instance does not colour it

/** Spreading broadleaf (fig, poplar, apple, almond): forked trunk, a dark core, many small boughs of leaves on cards. */
export function treeBroadleaf(THREE, R, seed = 'a') {
  const mb = new MB(), rng = new Rng('vegetation:broadleaf:' + seed), leaf = R('leaf', 0.04);
  stem(mb, R, [[0, 0, 0], [0.01, 0.16, 0.0], [-0.02, 0.36, 0.01]], 0.045, 0.03, 6, BARKCOL, 0, 0.01);
  const forks = [[0.22, 0.62, 0.05], [-0.2, 0.66, 0.12], [0.02, 0.7, -0.22]];
  for (const f of forks) stem(mb, R, [[-0.02, 0.34, 0.01], [f[0] * 0.55, 0.5, f[2] * 0.55], f], 0.024, 0.008, 4, BARKCOL, 0.01, 0.04);
  const c = [0, 0.66, 0];
  blob(mb, R, c, 0.22, 0.18, 0.22, [0.13, 0.15, 0.12], rng, 0.25, 0.04);
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996 + rng.range(-0.3, 0.3), el = Math.asin(rng.range(-0.5, 0.98)), rr = rng.range(0.2, 0.36);
    const dir = [Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)], p = [c[0] + dir[0] * rr * 1.15, c[1] + dir[1] * rr * 0.92, c[2] + dir[2] * rr * 1.15];
    // boughs stand every way: a tangent of the crown and a second axis tilted freely, so that no two cards are parallel
    const ta = a + Math.PI / 2 + rng.range(-1.2, 1.2), tu = [Math.cos(ta), rng.range(-0.6, 0.6), Math.sin(ta)], ul = Math.hypot(...tu);
    const A = tu.map((v) => v / ul), B0 = [dir[1] * A[2] - dir[2] * A[1], dir[2] * A[0] - dir[0] * A[2], dir[0] * A[1] - dir[1] * A[0]];
    const up = B0[1] < 0 ? B0.map((v) => -v) : B0, lean = rng.range(0.1, 0.8), Bn = [up[0] * (1 - lean) + dir[0] * lean, up[1] * (1 - lean) + dir[1] * lean, up[2] * (1 - lean) + dir[2] * lean];
    const s = rng.range(0.14, 0.21), g = rng.range(0.86, 1.12) * (0.74 + 0.3 * smooth(-0.6, 0.9, dir[1]));
    card(mb, leaf, p, A, Bn, s, s, c, [g, g, g], 0.06 + 0.05 * rng.next(), rng.next(), rng.chance(0.5), 0.9);
  }
  return mb.build(THREE, 'tree-broadleaf-' + seed);
}

/** Tamarisk / pomegranate / shrub: several thin stems, sprays in a low dome. `tex`: 'feather' or 'leaf'. */
export function treeBush(THREE, R, tex = 'feather', seed = 'a') {
  const mb = new MB(), rng = new Rng('vegetation:bush:' + tex + seed), r = R(tex, 0.04);
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4, l = rng.range(0.28, 0.42); stem(mb, R, [[0.03 * Math.cos(a), 0, 0.03 * Math.sin(a)], [0.12 * Math.cos(a), 0.3, 0.12 * Math.sin(a)], [l * Math.cos(a), 0.62, l * Math.sin(a)]], 0.022, 0.007, 4, BARKCOL, 0, 0.05); }
  const c = [0, 0.5, 0];
  blob(mb, R, [0, 0.52, 0], 0.22, 0.2, 0.22, [0.14, 0.16, 0.13], rng, 0.3, 0.05);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rng.range(-0.3, 0.3), tilt = rng.range(0.15, 1.0), rr = rng.range(0.12, 0.3);
    const out = [Math.cos(a), 0, Math.sin(a)], A = [-Math.sin(a), 0, Math.cos(a)], B = [out[0] * Math.sin(tilt), Math.cos(tilt), out[2] * Math.sin(tilt)];
    const s = rng.range(0.3, 0.4), base = [out[0] * rr, 0.24 + 0.2 * rng.next(), out[2] * rr], p = [base[0] + B[0] * s, base[1] + B[1] * s, base[2] + B[2] * s], g = rng.range(0.86, 1.12);
    card(mb, r, p, A, B, s * 0.92, s, c, [g, g, g], 0.07 + 0.06 * rng.next(), rng.next(), rng.chance(0.5), 0.72);
  }
  return mb.build(THREE, 'tree-bush-' + tex + seed);
}

/** Willow: short trunk, a rounded head, curtains of strands hanging to the water. */
export function treeWillow(THREE, R) {
  const mb = new MB(), rng = new Rng('vegetation:willow'), leaf = R('leaf', 0.04), wl = R('willow', 0.04);
  stem(mb, R, [[0, 0, 0], [0.03, 0.2, 0.01], [0.0, 0.46, -0.02]], 0.05, 0.03, 6, BARKCOL, 0, 0.012);
  const c = [0, 0.7, 0];
  blob(mb, R, c, 0.26, 0.16, 0.26, [0.14, 0.17, 0.12], rng, 0.2, 0.05);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, el = rng.range(0.2, 1.2), dir = [Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)], p = [dir[0] * 0.36, c[1] + dir[1] * 0.2, dir[2] * 0.36];
    const A = [-Math.sin(a), 0, Math.cos(a)], B = [dir[0] * 0.5, 0.86, dir[2] * 0.5], s = rng.range(0.2, 0.26), g = rng.range(0.9, 1.1);
    card(mb, leaf, p, A, B, s, s, c, [g, g, g], 0.08, rng.next(), rng.chance(0.5), 0.8);
  }
  for (let i = 0; i < 12; i++) {                                           // the curtains
    const a = (i / 12) * TAU + rng.range(-0.15, 0.15), rr = rng.range(0.3, 0.46), out = [Math.cos(a), 0, Math.sin(a)], A = [-Math.sin(a), 0, Math.cos(a)];
    const top = 0.66 + 0.1 * rng.next(), hb = rng.range(0.24, 0.33), g = rng.range(0.9, 1.1);
    const p = [out[0] * rr, top - hb, out[2] * rr], B = [out[0] * -0.12, 1, out[2] * -0.12];
    // v runs down the strands: top of the card = top of the painted curtain
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [p[0] + A[0] * 0.2 * s + B[0] * hb * t, p[1] + B[1] * hb * t, p[2] + A[2] * 0.2 * s + B[2] * hb * t]);
    const id = pts.map((q, n) => mb.vert(q[0], q[1], q[2], out[0], 0.5, out[2], (n === 0 || n === 3) ? wl.u0 : wl.u1, n < 2 ? wl.v1 : wl.v0, [g * (n < 2 ? 0.82 : 1), g * (n < 2 ? 0.82 : 1), g * (n < 2 ? 0.82 : 1)], n < 2 ? 0.16 : 0.07, rng.next(), 0));
    mb.quad(id[0], id[1], id[2], id[3]);
  }
  return mb.build(THREE, 'tree-willow');
}

/** Cypress / juniper / young cedar: a dark spindle with sprays standing up its flanks. */
export function treeConifer(THREE, R) {
  const mb = new MB(), rng = new Rng('vegetation:conifer'), fe = R('feather', 0.04), s = R('solid', 0.25), u = (s.u0 + s.u1) / 2, v = (s.v0 + s.v1) / 2;
  stem(mb, R, [[0, 0, 0], [0, 0.14, 0]], 0.03, 0.026, 5, BARKCOL);
  // core: a spindle of 7 sides
  const prof = [[0.1, 0.1], [0.2, 0.3], [0.17, 0.62], [0.08, 0.88], [0.0, 1.0]], rows = [];
  for (const [r, y] of prof) { const row = []; for (let k = 0; k <= 7; k++) { const a = (k / 7) * TAU, sh = 0.3 + 0.22 * y; row.push(mb.vert(r * Math.cos(a) * 0.82, y, r * Math.sin(a) * 0.82, Math.cos(a), 0.35, Math.sin(a), u, v, [sh, sh, sh], 0.05 * y * y, 0, 0)); } rows.push(row); }
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < 7; k++) mb.quad(rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996, y = 0.18 + 0.66 * (i / 13), r = 0.2 * Math.sin(Math.PI * Math.min(1, 0.15 + y * 0.9)) * 0.9, out = [Math.cos(a), 0, Math.sin(a)], A = [-Math.sin(a), 0, Math.cos(a)], B = [out[0] * 0.22, 0.975, out[2] * 0.22];
    const hb = rng.range(0.14, 0.2), g = rng.range(0.85, 1.1);
    card(mb, fe, [out[0] * r, y + hb * 0.6, out[2] * r], A, B, hb * 0.75, hb, [0, y, 0], [g, g, g], 0.03 + 0.06 * y, rng.next(), rng.chance(0.5), 0.7);
  }
  return mb.build(THREE, 'tree-conifer');
}

/**
 * The far level of every tree that is not a palm: three crossed cards of the bough texture, one lying flat for the
 * aerial cameras, on a stub of trunk. 14 triangles. Scaled (width, height, width) per instance.
 */
export function treeFar(THREE, R) {
  const mb = new MB(), leaf = R('leaf', 0.04), c = [0, 0.62, 0];
  stem(mb, R, [[0, 0, 0], [0, 0.45, 0]], 0.035, 0.028, 3, BARKCOL);
  for (let k = 0; k < 3; k++) { const a = 0.3 + k * Math.PI / 3; card(mb, leaf, c, [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], 0.52, 0.42, [0, 0.45, 0], [1, 1, 1], 0.05, 0.2 * k, k === 1, 0.74); }
  card(mb, leaf, [0, 0.7, 0], [1, 0, 0], [0, 0, 1], 0.5, 0.5, [0, -0.5, 0], [0.95, 0.95, 0.95], 0.03, 0.5, false, 1);
  return mb.build(THREE, 'tree-far');
}

// ------------------------------------------------------------------------------------------------ reeds --------
/** A clump of reeds: cards 2 m wide and 3.3 m high (unit: metres), leaning apart, in two height steps so that the tops sway. */
export function reedClump(THREE, R, cards = 3, segs = 2) {
  const mb = new MB(), r = R('reed', 0.03);
  for (let k = 0; k < cards; k++) {
    const a = 0.35 + (k / cards) * Math.PI, ca = Math.cos(a), sa = Math.sin(a), lean = 0.3 * (k - (cards - 1) / 2) / Math.max(1, cards - 1) * 2, off = 0.22 * (k - (cards - 1) / 2);
    const rows = [];
    for (let j = 0; j <= segs; j++) {
      const t = j / segs, y = 3.3 * t, w = 1.0 + 0.12 * t, ox = -sa * (off + lean * t), oz = ca * (off + lean * t), sh = 0.5 + 0.5 * t, vv = r.v1 + (r.v0 - r.v1) * t, sw = 0.34 * t * t;
      rows.push([mb.vert(ox - ca * w, y, oz - sa * w, -sa * 0.3 - ca * 0.4, 0.8, ca * 0.3 - sa * 0.4, r.u0, vv, [sh, sh, sh], sw, 0.2 * k, 0), mb.vert(ox + ca * w, y, oz + sa * w, -sa * 0.3 + ca * 0.4, 0.8, ca * 0.3 + sa * 0.4, r.u1, vv, [sh, sh, sh], sw, 0.2 * k + 0.1, 0)]);
    }
    for (let j = 0; j < segs; j++) mb.quad(rows[j][0], rows[j][1], rows[j + 1][1], rows[j + 1][0]);
  }
  return mb.build(THREE, 'reeds-' + cards);
}

/** A row of a standing crop: one card 6 m long and 1 m high (scaled per instance), the ears of the atlas along its top. */
export function cropRow(THREE, R) {
  const mb = new MB(), r = R('barley', 0.03);
  const id = [[-3, 0], [3, 0], [3, 1], [-3, 1]].map(([x, y]) => mb.vert(x, y, 0, 0, 1, 0.2, x < 0 ? r.u0 : r.u1, y ? r.v0 : r.v1, y ? [1, 1, 1] : [0.72, 0.72, 0.72], y ? 0.07 : 0, 0.15 * (x < 0 ? 0 : 1), 0));
  mb.quad(id[0], id[1], id[2], id[3]);
  return mb.build(THREE, 'crop-row');
}
