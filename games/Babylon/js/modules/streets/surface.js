// js/modules/streets/surface.js — the trodden-earth surface of streets, lanes, alleys and squares.
// One grid strip per piece of street (net.js cuts the pieces), in four levels of detail chosen by how near the
// film comes: 0 eye, 1 hero, 2 near, 3 far. Every vertex stands on ctx.ground.height + the lift of net.liftAt;
// relief (worn middle, earth banked against the walls, ruts, lumps) and tone (pale trodden middle, damp at the
// wall feet, damp patches, ash and rubbish, waste water at doors) are functions of the position, so that two
// strips meeting in a junction agree.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

/** Value noise 0..1 on the integer lattice. */
export function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
/** Three octaves, 0..1, mean 0.5. */
export const fbm = (x, z, scale, seed) => 0.55 * vnoise(x / scale, z / scale, seed) + 0.3 * vnoise(x / (scale * 0.41), z / (scale * 0.41), seed + 1) + 0.15 * vnoise(x / (scale * 0.17), z / (scale * 0.17), seed + 2);
const sstep = (a, b, v) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

/** Growable indexed mesh with normals and colours. */
export class Buf {
  constructor(n = 4096) { this.cap = n; this.icap = n * 3; this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.idx = new Uint32Array(this.icap); this.nv = 0; this.ni = 0; }
  vert(x, y, z, r, g, b) {
    if (this.nv === this.cap) { this.cap *= 2; for (const k of ['pos', 'nor', 'col']) { const a = new Float32Array(this.cap * 3); a.set(this[k]); this[k] = a; } }
    const p = this.nv * 3; this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z; this.nor[p] = 0; this.nor[p + 1] = 1; this.nor[p + 2] = 0; this.col[p] = r; this.col[p + 1] = g; this.col[p + 2] = b;
    return this.nv++;
  }
  tri(a, b, c) { if (this.ni + 3 > this.icap) { this.icap *= 2; const n = new Uint32Array(this.icap); n.set(this.idx); this.idx = n; } this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
  /** Smooth normals of the vertices [v0, v1) from the triangles [i0, i1). */
  normals(v0, v1, i0, i1) {
    const P = this.pos, N = this.nor;
    for (let v = v0; v < v1; v++) { N[v * 3] = 0; N[v * 3 + 1] = 0; N[v * 3 + 2] = 0; }
    for (let i = i0; i < i1; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
    }
    for (let v = v0; v < v1; v++) { const p = v * 3, l = Math.hypot(N[p], N[p + 1], N[p + 2]) || 1; N[p] /= l; N[p + 1] /= l; N[p + 2] /= l; }
  }
  geometry(geom) {
    if (!this.ni) return null;
    return geom.custom({ position: this.pos.slice(0, this.nv * 3), normal: this.nor.slice(0, this.nv * 3), color: this.col.slice(0, this.nv * 3), index: this.idx.slice(0, this.ni) });
  }
}

// tones as multipliers on the dry street earth
const DAMP = [0.62, 0.58, 0.51], ASH = [0.74, 0.76, 0.80], PALE = [1.2, 1.17, 1.06], DUNG = [0.62, 0.60, 0.50];
export const BASE = 0.8;                      // the material colour is the street albedo / BASE (vertex tints average about 0.84)

export function makeSurface(ctx, net) {
  const { ground, layout } = ctx;
  // two meshes: the walled city and its suburbs in 2048 m tiles, the villages and road ribbons beyond in 8192 m tiles
  const bufCore = new Buf(1 << 16), bufOuter = new Buf(1 << 12);
  let buf = bufCore;
  const cb = ground.coreBounds || [-2000, -3500, 3500, 2000];
  const inCore = (x, z) => x > cb[0] && x < cb[2] && z > cb[1] && z < cb[3];
  const stats = { tris: [0, 0, 0, 0], metres: [0, 0, 0, 0], squares: 0, squareTris: 0, pieces: 0 };
  const draft = !!ctx.quality.draft;
  const MAXSTEP = draft ? [0.75, 2.0, 8, 32] : [0.5, 1.4, 6, 24];
  const DEV = [0.015, 0.02, 0.03, 0.04];

  // ---- squares and forecourts: where a street crosses one, its surface runs into the square's without an edge ----
  const SQ_DROP = 0.022;
  const squares = (layout.squares || []).map((q) => ({ ring: M.openRing(q.polygon), bb: M.bbox(q.polygon) }));
  function inSquare(x, z) {
    for (const q of squares) if (x >= q.bb[0] && x <= q.bb[2] && z >= q.bb[1] && z <= q.bb[3] && M.pointInPolygon(x, z, q.ring)) return true;
    return false;
  }

  // ---- doors near the detailed streets (the street is worn low and wet before a door, never banked over a sill) ----
  const doorCells = new Map();
  function doorsNear(x, z) {
    const cx = Math.floor(x / 24), cz = Math.floor(z / 24), k = cx * 100003 + cz;
    let arr = doorCells.get(k);
    if (!arr) {
      arr = [];
      for (const h of layout.housesNear((cx + 0.5) * 24, (cz + 0.5) * 24, 24)) if (h.door) arr.push([h.door[0], h.door[1], h.groundLevel, (hash2(h.seed & 0xffff, h.seed >>> 16, 9) < 0.55) ? 1 : 0.35]);
      doorCells.set(k, arr);
    }
    return arr;
  }
  /** closeness 0..1 to the nearest door, its sill level and how wet its doorstep is */
  function doorAt(x, z) {
    let best = 9, sill = 1e9, wet = 0;
    for (const d of doorsNear(x, z)) { const q = Math.hypot(x - d[0], z - d[1]); if (q < best) { best = q; sill = d[2]; wet = d[3]; } }
    return best < 2.2 ? { k: 1 - sstep(0.7, 2.2, best), sill, wet } : null;
  }

  // ---- look: relief (m) and tone (rgb multiplier) at a vertex ------------------------------------------------
  // info: { zone, e: metres to the nearer edge, l: lateral, s: chainage, hw, wall: 0..1 a wall stands at the nearer edge,
  //         door: doorAt() | null, rec, plain: boolean, tone: per-street factor }
  let rutRidge = 0;
  /** wheel ruts: the groove mask 0..1 (and, in rutRidge, the low ridges thrown up beside the grooves) */
  function rutMask(info) {
    rutRidge = 0;
    const r = info.rec; if (!r || info.hw < 1.9 || info.zone > 1 || r.cls === 'alley') return 0;
    const A = Math.min(0.45, info.hw - 1.7), ph = (r.seed % 628) / 100;
    const m = A * (Math.sin(info.s / 19 + ph) + 0.35 * Math.sin(info.s / 7.3 + 2 * ph));
    const on = 0.3 + 0.7 * sstep(0.25, 0.6, vnoise(info.s / 11, r.seed * 0.01, 71));
    const g = (c, w) => Math.exp(-(((info.l - c) / w) ** 2));
    rutRidge = (g(m - 0.72 - 0.3, 0.14) + g(m - 0.72 + 0.3, 0.14) + g(m + 0.72 - 0.3, 0.14) + g(m + 0.72 + 0.3, 0.14)) * on;
    return (g(m - 0.72, 0.15) + g(m + 0.72, 0.15)) * on;
  }
  function relief(x, z, info) {
    if (info.plain || info.zone > 1 || (info.rec && info.rec.corridor)) return 0;         // the strip beside the Processional Way is kept level
    const e = info.e;
    let h = -0.015 * sstep(0.8, 2.0, e);                                                  // the worn middle
    const bankH = info.wall * (0.02 + 0.06 * vnoise(info.s / 5.3, info.l > 0 ? 3.7 : 9.1, 61 + (info.rec ? info.rec.seed & 255 : 0))) * (info.door ? 1 - 0.85 * info.door.k : 1);
    h += bankH * (1 - sstep(0.05, 0.8, e));                                                 // earth and sweepings banked against the wall
    h += (fbm(x, z, 1.9, 51) - 0.5) * (0.016 + 0.024 * (1 - sstep(0, 1.2, e)));            // lumps, more of them at the edges
    const rut = rutMask(info); h += -0.03 * rut + 0.014 * rutRidge;                          // wheel ruts and the ridges beside them
    if (info.zone === 0) h += (vnoise(x / 0.45, z / 0.45, 57) - 0.5) * 0.012;               // hoof-pocked: only where the mesh can carry it
    return h < -0.04 ? -0.04 : h;                                                           // never under the terrain (the lift is 6 cm here)
  }
  const out = [0, 0, 0];
  function tone(x, z, info) {
    const e = info.e, zone = info.zone;
    let v = BASE * (0.95 + 0.2 * fbm(x, z, 23, 21)) * (info.tone || 1);
    let r = v * 1.02, g = v, b = v * 0.955;
    if (zone <= 2) {
      const n = vnoise(x / 3.1, z / 3.1, 23), mid = sstep(0.4, 1.8, e);
      const k = (0.94 + 0.12 * n) * (0.86 + 0.24 * mid);                                    // the trodden middle is paler, the wall feet darker
      r *= k; g *= k; b *= k * (1 - 0.03 * mid);
      // damp: along the wall feet and in patches
      const wallish = info.wall * (1 - sstep(0.1, 1.1, e));
      let d = fbm(x, z, 4.6, 11) + 0.2 * wallish + (info.narrow ? 0.05 : 0) - 0.03 * mid;
      if (info.door) d += 0.3 * info.door.k * info.door.wet;                                // waste water thrown out at the door
      let kd = 0.7 * sstep(0.55, 0.78, d + 0.1 * (vnoise(x / 0.8, z / 0.8, 13) - 0.5)) + 0.12 * wallish;
      if (zone <= 1) {
        // churned by hooves and feet: mottled at the scale of a stride
        const mot = 0.9 + 0.2 * vnoise(x / 0.62, z / 0.62, 17); r *= mot; g *= mot; b *= mot;
        // a wet runnel wandering down the street, here and there
        const rec = info.rec;
        if (rec && info.hw > 0.9) { const c = info.hw * 0.42 * Math.sin(info.s / 13 + (rec.seed % 100)), on = sstep(0.45, 0.62, vnoise(info.s / 21, rec.seed * 0.013, 77)); kd += 0.75 * on * Math.exp(-(((info.l - c) / 0.3) ** 2)); }
        const rut = rutMask(info);
        kd += 0.45 * rut;
        const kr = 1 + 0.1 * rutRidge * (1 - rut); r *= kr; g *= kr; b *= kr;              // dry crumbs on the ridges
      }
      if (kd > 1) kd = 1;
      r *= 1 + (DAMP[0] - 1) * kd; g *= 1 + (DAMP[1] - 1) * kd; b *= 1 + (DAMP[2] - 1) * kd;
      // ash and household rubbish dumped at the wall feet; chaff and dung trodden in further out
      const edge = 1 - sstep(0.2, 1.5, e);
      const ka = sstep(0.74, 0.84, vnoise(x / 2.3, z / 2.3, 31)) * edge * (0.5 + 0.5 * info.wall);
      r *= 1 + (ASH[0] - 1) * ka; g *= 1 + (ASH[1] - 1) * ka; b *= 1 + (ASH[2] - 1) * ka;
      if (zone <= 1) {
        const kp = sstep(0.74, 0.88, vnoise(x / 1.3, z / 1.3, 41)) * (1 - kd);
        r *= 1 + (PALE[0] - 1) * kp; g *= 1 + (PALE[1] - 1) * kp; b *= 1 + (PALE[2] - 1) * kp;
        const kg = sstep(0.86, 0.93, vnoise(x / 0.9, z / 0.9, 43)) * mid;
        r *= 1 + (DUNG[0] - 1) * kg; g *= 1 + (DUNG[1] - 1) * kg; b *= 1 + (DUNG[2] - 1) * kg;
      }
    }
    out[0] = r > 1 ? 1 : r; out[1] = g > 1 ? 1 : g; out[2] = b > 1 ? 1 : b;
    return out;
  }

  // ---- stations -----------------------------------------------------------------------------------------------
  const TUCK = [0.65, 0.65, 0.6, 0.12];
  /** lateral template of a zone for a strip of the given width: offsets from the left edge / from the right edge */
  function template(zone, width) {
    if (zone === 3) return { edge: [], inner: width >= 9 ? Math.min(3, Math.round(width / 8)) : 0, skirt: false };
    if (zone === 2) {
      if (width < 2.6) return { edge: [0], inner: 1, skirt: true };
      const span = width - 1.4; return { edge: [0, 0.7], inner: Math.max(0, Math.ceil(span / 3.4) - 1), skirt: true };
    }
    const cell = zone === 0 ? 0.36 : 0.9;
    if (width < 1.6) return { edge: [0, 0.3], inner: Math.max(1, Math.ceil((width - 0.6) / cell) - 1), skirt: true };
    const span = width - 1.3; return { edge: [0, 0.3, 0.65], inner: Math.max(1, Math.ceil(span / cell) - 1), skirt: true };
  }
  function laterals(tp, lo, hi, tuck) {
    const L = [lo - tuck];
    for (const d of tp.edge) L.push(lo + d);
    const eo = tp.edge.length ? tp.edge[tp.edge.length - 1] : 0, a = lo + eo, b = hi - eo;
    for (let k = 1; k <= tp.inner; k++) L.push(a + ((b - a) * k) / (tp.inner + 1));
    for (let k = tp.edge.length - 1; k >= 0; k--) L.push(hi - tp.edge[k]);
    L.push(hi + tuck);
    return L;
  }
  /** a station: centre point, right-hand vector (mitred at vertices of the polyline), lateral bounds */
  function station(rec, s) {
    const lt = rec.lat(s);
    if (rec.lead && s < rec.lead.s0 + rec.lead.L) {
      // a cubic from the gate (its axis as the tangent) to the street's own line
      const q = rec.lead, u = M.clamp((s - q.s0) / q.L, -0.05, 1), u2 = u * u, u3 = u2 * u, k = q.L;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const x = h00 * q.p0[0] + h10 * k * q.t0[0] + h01 * q.p1[0] + h11 * k * q.t1[0], z = h00 * q.p0[1] + h10 * k * q.t0[1] + h01 * q.p1[1] + h11 * k * q.t1[1];
      let dx = (6 * u2 - 6 * u) * q.p0[0] + (3 * u2 - 4 * u + 1) * k * q.t0[0] + (-6 * u2 + 6 * u) * q.p1[0] + (3 * u2 - 2 * u) * k * q.t1[0], dz = (6 * u2 - 6 * u) * q.p0[1] + (3 * u2 - 4 * u + 1) * k * q.t0[1] + (-6 * u2 + 6 * u) * q.p1[1] + (3 * u2 - 2 * u) * k * q.t1[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return { s, x, z, dx, dz, rx: -dz, rz: dx, lo: lt[0], hi: lt[1], zone: net.zoneAt(x, z), plain: false, drop: 0, sink: false };
    }
    if (rec.smooth && rec.smooth(s) > 0) {
      // rounded bends: the mean of the line 7 m behind, here and 7 m ahead; the direction from the same curve
      const w = rec.smooth(s), d = 7 * w, P = (q) => { const a = net.at(rec, q - d), b = net.at(rec, q), c = net.at(rec, q + d); return [0.25 * a.x + 0.5 * b.x + 0.25 * c.x, 0.25 * a.z + 0.5 * b.z + 0.25 * c.z]; };
      const c = P(s), f = P(s + 0.5), g = P(s - 0.5); let dx = f[0] - g[0], dz = f[1] - g[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return { s, x: c[0], z: c[1], dx, dz, rx: -dz, rz: dx, lo: lt[0], hi: lt[1], zone: net.zoneAt(c[0], c[1]), plain: false, drop: 0, sink: false };
    }
    const p = net.at(rec, s);
    let rx = p.rx, rz = p.rz;
    // mitre at an inner vertex
    const ch = rec.ch;
    for (let i = 1; i < ch.length - 1; i++) if (Math.abs(ch[i] - s) < 0.02) {
      const a = rec.pl[i - 1], b = rec.pl[i], c = rec.pl[i + 1];
      let ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1]; const ul = Math.hypot(ux, uz) || 1, vl = Math.hypot(vx, vz) || 1; ux /= ul; uz /= ul; vx /= vl; vz /= vl;
      let mx = -uz - vz, mz = ux + vx; const ml = Math.hypot(mx, mz);
      if (ml > 1e-6) { mx /= ml; mz /= ml; const cos = Math.max(0.5, mx * -uz + mz * ux); rx = mx / cos; rz = mz / cos; }
      break;
    }
    return { s, x: p.x, z: p.z, dx: p.dx, dz: p.dz, rx, rz, lo: lt[0], hi: lt[1], zone: net.zoneAt(p.x, p.z), plain: false, drop: 0, sink: false };
  }
  /** stations of a piece: every vertex of the polyline, and steps by zone, halved where the ground bends */
  function stationsOf(rec, a, b) {
    const must = [a]; for (const c of rec.ch) if (c > a + 0.4 && c < b - 0.4) must.push(c); must.push(b);
    const list = [];
    const gy = (s, k) => { const p = net.at(rec, s), lt = rec.lat(s), l = k === 0 ? 0 : k < 0 ? lt[0] : lt[1]; return net.baseY(p.x + p.rx * l, p.z + p.rz * l); };
    for (let m = 0; m + 1 < must.length; m++) {
      let s = must[m]; const end = must[m + 1];
      for (;;) {
        const st = station(rec, s); list.push(st);
        let step = MAXSTEP[st.zone];
        // halve the step while the ground between departs from the straight line (centre and both edges)
        for (let it = 0; it < 6 && step > 0.5; it++) {
          const s2 = Math.min(end, s + step); let bad = false;
          const n = Math.min(8, Math.max(1, Math.round((s2 - s) / 1.5)));
          for (let k = -1; k <= 1 && !bad; k++) { const y0 = gy(s, k), y1 = gy(s2, k); for (let q = 1; q < n; q++) { const u = q / n; if (Math.abs(gy(s + (s2 - s) * u, k) - (y0 + (y1 - y0) * u)) > DEV[st.zone]) { bad = true; break; } } }
          if (!bad) break; step /= 2;
        }
        if (end - s <= step * 1.4) break;
        s += step;
      }
    }
    list.push(station(rec, b));
    return list;
  }

  // ---- one grid strip -------------------------------------------------------------------------------------------
  /** wall at an edge: 1 if a house stands just beyond the edge of the street there */
  function wallAt(st, side) {
    const l = (side < 0 ? st.lo : st.hi) + side * 0.75, x = st.x + st.rx * l, z = st.z + st.rz * l;
    return layout.houseAt(x, z) ? 1 : 0;
  }
  function emitRun(rec, sts, zone, toneK) {
    if (sts.length < 2) return;
    let wmax = 0; for (const st of sts) wmax = Math.max(wmax, st.hi - st.lo);
    const tp = template(zone, wmax), tuck = TUCK[zone], n = tp.edge.length * 2 + tp.inner + 2;
    const v0 = buf.nv, i0 = buf.ni, narrow = wmax < 2.4;
    const info = { zone, e: 0, l: 0, s: 0, hw: 0, wall: 0, door: null, rec, plain: false, tone: toneK, narrow };
    const stGy = (st) => (st.gyMid === undefined ? (st.gyMid = net.baseY(st.x + st.rx * (st.lo + st.hi) / 2, st.z + st.rz * (st.lo + st.hi) / 2)) : st.gyMid);
    // stations whose centre lies in water (the tail of a ribbon cut at a quay): they take the level of the nearest
    // station on land instead of the river bed
    { const wl = (ground.waterLevel ?? -3) + 1.0, g = sts.map((st) => stGy(st)); let last = null;
      for (let i = 0; i < sts.length; i++) { if (g[i] < wl) { if (last !== null) sts[i].gyMid = last; } else last = g[i]; }
      last = null; for (let i = sts.length - 1; i >= 0; i--) { if (g[i] < wl) { if (last !== null && sts[i].gyMid < wl) sts[i].gyMid = last; } else last = g[i]; } }
    for (const st of sts) {
      const L = laterals(tp, st.lo, st.hi, tuck);
      const detailed = zone <= 1 && !st.plain;
      const wl = detailed ? wallAt(st, -1) : zone <= 2 ? 0.7 : 0, wr = detailed ? wallAt(st, 1) : zone <= 2 ? 0.7 : 0;
      info.s = st.s; info.hw = (st.hi - st.lo) / 2; info.plain = st.plain;
      const sqEdge = zone <= 2 && squares.length ? [inSquare(st.x + st.rx * (st.lo - 0.5), st.z + st.rz * (st.lo - 0.5)), inSquare(st.x + st.rx * (st.hi + 0.5), st.z + st.rz * (st.hi + 0.5))] : [false, false];
      for (let j = 0; j < n; j++) {
        let l = L[j], x = st.x + st.rx * l, z = st.z + st.rz * l, gy = net.baseY(x, z);
        // (integration round) an edge that reaches over a quay line is pulled back onto the land: the ribbon no longer
        // dives to the river bed there
        if (gy < stGy(st) - 1.5) { const mid0 = (st.lo + st.hi) / 2; for (let q = 0; q < 48 && gy < stGy(st) - 1.5 && Math.abs(l - mid0) > 0.2; q++) { l += Math.sign(mid0 - l) * 0.2; x = st.x + st.rx * l; z = st.z + st.rz * l; gy = net.baseY(x, z); } if (gy < stGy(st) - 1.5) gy = stGy(st); }
        const lift = net.liftAt(x, z);
        const outer = j === 0 || j === n - 1, left = l < (st.lo + st.hi) / 2;
        let wall = left ? wl : wr;
        info.l = l - (st.lo + st.hi) / 2; info.e = Math.max(0, Math.min(l - st.lo, st.hi - l)); info.wall = wall;
        const open = zone <= 2 && sqEdge[left ? 0 : 1];                                             // this edge lies in a square
        if (open) { wall = 0; info.wall = 0; info.e = Math.max(info.e, 2); }
        info.door = detailed && info.e < 2.2 ? doorAt(x, z) : null;
        let y;
        if (st.sink) y = gy - lift - 0.1;
        else if (outer && open) y = gy + lift - SQ_DROP - 0.014;                                    // just under the surface of the square
        else if (outer && tp.skirt && !(detailed && wall)) y = gy - lift - 0.08;                 // soft shoulder into the ground
        else {
          y = gy + lift - st.drop + relief(x, z, info) + (outer && detailed && wall ? 0.03 : 0);
          if (rec.under && rec.under(st.s, l)) y -= 0.035;                                          // under the paving of the roadway
          if (info.door && info.door.k > 0.2) y = Math.max(gy + lift * 0.6, Math.min(y, info.door.sill - 0.07));
        }
        const c = tone(x, z, info);
        buf.vert(x, y, z, c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i + 1 < sts.length; i++) for (let j = 0; j + 1 < n; j++) {
      const a = v0 + i * n + j, b = a + 1, c = a + n, d = c + 1;
      buf.tri(a, b, c); buf.tri(b, d, c);
    }
    buf.normals(v0, buf.nv, i0, buf.ni);
    stats.tris[zone] += (buf.ni - i0) / 3; stats.metres[zone] += sts[sts.length - 1].s - sts[0].s;
  }

  /** extension of a piece beyond one of its ends: a straight continuation, optionally lowered or sunk */
  function extend(st, dir, ext, drop, sink) {
    return { ...st, s: st.s + dir * ext, x: st.x + st.dx * dir * ext, z: st.z + st.dz * dir * ext, rx: -st.dz, rz: st.dx, drop, sink, plain: true };
  }
  function endRows(rec, st, dir, by, isEnd) {
    const hw = Math.max(-st.lo, st.hi), jit = 0.008 * hash2(rec.index, isEnd ? 1 : 0, 3);
    const o = { ...st, rx: -st.dz, rz: st.dx };
    if (by && by.wet) return [extend(o, dir, 0.5, 0, true)];
    if (by) {
      // under the street that covers us: far enough for a skew junction, lowered so that the other ribbon lies on top
      const cos = Math.abs(st.dx * by.dx + st.dz * by.dz), sin = Math.sqrt(Math.max(0.04, 1 - cos * cos)), olt = by.rec.lat(by.s);
      const ext = Math.min((hw * cos) / sin + 0.6, (olt[1] - olt[0]) * 0.9);
      st.drop = 0.012; st.plain = true;
      return [extend(o, dir, ext, 0.045 + jit, false)];
    }
    if (rec.blind && isEnd) return [extend(o, dir, 0.6, 0, false)];                           // into the wall that closes the alley
    st.plain = true;
    return [extend(o, dir, hw + 0.3, 0.03 + jit, false), extend(o, dir, hw + 0.8, 0, true)];  // a free end or a corner
  }

  /** The surface of one piece [a, b] of a record. */
  function piece(rec, pc) {
    const sts = stationsOf(rec, pc.a, pc.b);
    buf = inCore(sts[0].x, sts[0].z) ? bufCore : bufOuter;
    const toneK = (rec.cls === 'alley' ? 0.97 : rec.cls === 'main' ? 1.015 : rec.cls === 'processional' ? 1.02 : 1) * (0.985 + 0.03 * hash2(rec.index, 5, 9));
    const head = endRows(rec, sts[0], -1, pc.startBy, false).reverse(), tail = endRows(rec, sts[sts.length - 1], 1, pc.endBy, true);
    const all = [...head, ...sts, ...tail];
    // runs of one zone; the stations where the zone changes are plain (no relief, soft shoulders) on both sides
    let i = 0;
    while (i < all.length - 1) {
      let j = i + 1; const zone = Math.min(all[i].zone, all[j].zone);
      while (j < all.length - 1 && Math.min(all[j].zone, all[j + 1].zone) === zone) j++;
      if (i > 0) all[i].plain = true; if (j < all.length - 1) all[j].plain = true;
      emitRun(rec, all.slice(i, j + 1), zone, toneK);
      i = j;
    }
    stats.pieces++;
  }

  /**
   * A square or forecourt: a polygon of trodden earth on the ground, drawn as rings shrinking to its centre.
   * opts: { drop: m below the street lift (so that the streets crossing it lie on top), zone }
   */
  function polygon(ring, opts = {}) {
    const R = M.openRing(ring), c = M.polygonCentroid(M.closeRing(R));
    buf = inCore(c[0], c[1]) ? bufCore : bufOuter;
    // star-shaped from the centroid? otherwise leave it to the terrain
    for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; if (((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * (M.polygonArea(M.closeRing(R)) > 0 ? 1 : -1) < 0) return false; }
    const zone = opts.zone ?? net.zoneAt(c[0], c[1]), cell = zone === 0 ? 0.75 : zone === 1 ? 1.5 : zone === 2 ? 4 : 12;
    const peri = M.polylineLength(M.closeRing(R)); let rad = 0; for (const p of R) rad = Math.max(rad, Math.hypot(p[0] - c[0], p[1] - c[1]));
    const N = Math.max(R.length * 2, Math.min(zone <= 1 ? 200 : zone === 2 ? 40 : 16, Math.ceil(peri / cell))), Kr = Math.max(2, Math.min(zone <= 1 ? 32 : zone === 2 ? 6 : 3, Math.ceil(rad / (cell * 1.2))));
    // N points along the outline by arc length (corners kept)
    const pts = [];
    { const cl = M.closeRing(R), chs = M.chainage(cl); for (let k = 0; k < N; k++) { const h = M.pointAlong(cl, (peri * k) / N); pts.push([h.x, h.z]); }
      for (let q = 0; q < R.length; q++) { let bi = 0, bd = 1e9; for (let k = 0; k < N; k++) { const d = Math.abs((peri * k) / N - chs[q]); if (d < bd) { bd = d; bi = k; } } pts[bi] = [R[q][0], R[q][1]]; } }
    // (integration round) a square whose outline reaches over a quay line: pull those outline points back onto the
    // land, or the surface dives to the river bed and hangs down the quay face (the east bridge head did)
    const cy = net.baseY(c[0], c[1]);
    const pulled = pts.map(() => false);
    pts.forEach((p, k) => { let n = 0; while (n++ < 80 && net.baseY(p[0], p[1]) < cy - 1.5) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1; if (d < 0.5) break; p[0] += ((c[0] - p[0]) / d) * 0.25; p[1] += ((c[1] - p[1]) / d) * 0.25; pulled[k] = true; }
      if (pulled[k]) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1; p[0] += ((c[0] - p[0]) / d) * 0.35; p[1] += ((c[1] - p[1]) / d) * 0.35; } });   // and a hand's breadth behind the quay coping
    const cw = M.polygonArea(M.closeRing(R)) > 0, drop = opts.drop ?? SQ_DROP;
    const v0 = buf.nv, i0 = buf.ni, info = { zone: Math.max(zone, 1), e: 0, l: 0, s: 0, hw: 99, wall: 0, door: null, rec: null, plain: false, tone: opts.tone || 1.0, narrow: false };
    const put = (x, z, e, sink) => {
      const gy = net.baseY(x, z), lift = net.liftAt(x, z); info.e = 2; info.plain = e < 0.01;
      const y = sink ? Math.max(gy, cy - 1.5) - lift - 0.08 : gy + lift - drop + (zone <= 1 ? (fbm(x, z, 1.9, 51) - 0.5) * 0.03 * sstep(0, 1.5, e) : 0);
      const col = tone(x, z, info); buf.vert(x, y, z, col[0], col[1], col[2]);
    };
    // ring -1: the soft shoulder outside the outline; rings 0..Kr-1 inward; then the centre
    for (let k = 0; k < N; k++) { const p = pts[k], d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1, o = pulled[k] ? 0 : 0.6; put(p[0] + ((p[0] - c[0]) / d) * o, p[1] + ((p[1] - c[1]) / d) * o, 0, true); }
    for (let r = 0; r < Kr; r++) { const f = 1 - r / Kr; for (let k = 0; k < N; k++) { const p = pts[k], x = c[0] + (p[0] - c[0]) * f, z = c[1] + (p[1] - c[1]) * f; put(x, z, M.distToRing(x, z, R), false); } }
    put(c[0], c[1], rad, false);
    const cen = buf.nv - 1;
    for (let r = 0; r < Kr; r++) for (let k = 0; k < N; k++) {
      const a = v0 + r * N + k, b = v0 + r * N + ((k + 1) % N), cc = a + N, d = b + N;
      if (cw) { buf.tri(a, cc, b); buf.tri(b, cc, d); } else { buf.tri(a, b, cc); buf.tri(b, d, cc); }
    }
    for (let k = 0; k < N; k++) { const a = v0 + Kr * N + k, b = v0 + Kr * N + ((k + 1) % N); if (cw) buf.tri(a, cen, b); else buf.tri(a, b, cen); }
    buf.normals(v0, buf.nv, i0, buf.ni);
    stats.squares++; stats.squareTris += (buf.ni - i0) / 3;
    return true;
  }

  /** The surface at chainage s and lateral l (m from the centre line, + = right) of a record: { x, y, z, zone, wall, e }. */
  function sample(rec, s, l) {
    const st = station(rec, s), x = st.x + st.rx * l, z = st.z + st.rz * l, gy = net.baseY(x, z), lift = net.liftAt(x, z), mid = (st.lo + st.hi) / 2;
    const e = Math.max(0, Math.min(l - st.lo, st.hi - l));
    if (st.zone > 1) return { x, y: gy + lift, z, zone: st.zone, wall: 0, e, st };
    const wall = wallAt(st, l < mid ? -1 : 1);
    const info = { zone: st.zone, e, l: l - mid, s, hw: (st.hi - st.lo) / 2, wall, door: e < 2.2 ? doorAt(x, z) : null, rec, plain: false, tone: 1, narrow: false };
    let y = gy + lift + relief(x, z, info);
    if (info.door && info.door.k > 0.2) y = Math.max(gy + lift * 0.6, Math.min(y, info.door.sill - 0.07));
    return { x, y, z, zone: st.zone, wall, e, door: info.door, st };
  }

  return { piece, polygon, buf: bufCore, bufCore, bufOuter, stats, tone, relief, doorAt, wallAt, stationsOf, station, sample };
}
