// js/modules/environs/util.js — shared tools of the environs module: colour helpers, a film-driven importance
// map ("how near does any film frame see this place"), and small mesh primitives written straight into
// geom.writer() buffers with per-vertex colours (one white material per family, tones in the vertex colours).
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

export { hash2, M };
export const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const len2 = (x, z) => Math.hypot(x, z);
export const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

// ---------------------------------------------------------------------------------------------------------
// mesh primitives. All take a MeshWriter `w`; colours are linear [r, g, b] multipliers of a white material.
// Winding never matters to the caller: every face is given an outward hint and flipped if it disagrees.
// ---------------------------------------------------------------------------------------------------------
/** Quad a, b, c, d (any winding) with a colour per vertex; (ox, oy, oz) points roughly out of the face. */
export function quadC(w, a, b, c, d, ca, cb, cc, cd, ox, oy, oz) {
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-10) return;
  nx /= l; ny /= l; nz /= l;
  if (nx * ox + ny * oy + nz * oz < 0) { const t = b; b = d; d = t; const tc = cb; cb = cd; cd = tc; nx = -nx; ny = -ny; nz = -nz; }
  w.color(ca[0], ca[1], ca[2]); const i = w.vert(a[0], a[1], a[2], nx, ny, nz);
  w.color(cb[0], cb[1], cb[2]); w.vert(b[0], b[1], b[2], nx, ny, nz);
  w.color(cc[0], cc[1], cc[2]); w.vert(c[0], c[1], c[2], nx, ny, nz);
  w.color(cd[0], cd[1], cd[2]); w.vert(d[0], d[1], d[2], nx, ny, nz);
  w.tri(i, i + 1, i + 2); w.tri(i, i + 2, i + 3);
}
/** Quad in one colour. */
export const quad1 = (w, a, b, c, d, col, ox, oy, oz) => quadC(w, a, b, c, d, col, col, col, col, ox, oy, oz);
/** Triangle with a colour per vertex and an outward hint. */
export function triC(w, a, b, c, ca, cb, cc, ox, oy, oz) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-10) return;
  nx /= l; ny /= l; nz /= l;
  if (nx * ox + ny * oy + nz * oz < 0) { const t = b; b = c; c = t; const tc = cb; cb = cc; cc = tc; nx = -nx; ny = -ny; nz = -nz; }
  w.color(ca[0], ca[1], ca[2]); const i = w.vert(a[0], a[1], a[2], nx, ny, nz);
  w.color(cb[0], cb[1], cb[2]); w.vert(b[0], b[1], b[2], nx, ny, nz);
  w.color(cc[0], cc[1], cc[2]); w.vert(c[0], c[1], c[2], nx, ny, nz);
  w.tri(i, i + 1, i + 2);
}

/**
 * Oriented box. Centre (cx, cz), levels y0..y1, half sizes hx (along the unit axis (ux, uz)) and hz (across it).
 * o: { side, top, foot (colour of the lower edge: a fake contact shade), batter (m per m of height), topFace: true,
 *      bottom: false, skip: [bool x4] (sides -v, +u, +v, -u), y1b (level of the top at the +u end, for sloping tops) }
 */
export function obox(w, cx, cz, y0, y1, hx, hz, ux, uz, o = {}) {
  const vx = -uz, vz = ux, bt = o.batter || 0, H = y1 - y0, tx = Math.max(0.01, hx - bt * H), tz = Math.max(0.01, hz - bt * H);
  const cs = o.side || [1, 1, 1], ct = o.top || cs, cf = o.foot || mul3(cs, 0.74), y1b = o.y1b === undefined ? y1 : o.y1b;
  const B = [], T = [], S = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of S) {
    B.push([cx + ux * sx * hx + vx * sz * hz, y0, cz + uz * sx * hx + vz * sz * hz]);
    T.push([cx + ux * sx * tx + vx * sz * tz, sx > 0 ? y1b : y1, cz + uz * sx * tx + vz * sz * tz]);
  }
  for (let i = 0; i < 4; i++) {
    if (o.skip && o.skip[i]) continue;
    const j = (i + 1) % 4;
    quadC(w, B[i], B[j], T[j], T[i], cf, cf, cs, cs, (B[i][0] + B[j][0]) / 2 - cx, 0.001, (B[i][2] + B[j][2]) / 2 - cz);
  }
  if (o.topFace !== false) quad1(w, T[0], T[1], T[2], T[3], ct, 0, 1, 0);
  if (o.bottom) quad1(w, B[0], B[1], B[2], B[3], cf, 0, -1, 0);
}

/** A beam of square section between two 3D points (posts, poles, ropes). ends: close both ends. */
export function beam(w, a, b, t, col, ends = false) {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const l = Math.hypot(dx, dy, dz); if (l < 1e-6) return;
  dx /= l; dy /= l; dz /= l;
  // two unit vectors square to the axis
  let px, py, pz;
  if (Math.abs(dy) > 0.9) { px = 1; py = 0; pz = 0; } else { px = 0; py = 1; pz = 0; }
  let qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px; const ql = Math.hypot(qx, qy, qz); qx /= ql; qy /= ql; qz /= ql;
  px = qy * dz - qz * dy; py = qz * dx - qx * dz; pz = qx * dy - qy * dx;
  const h = t / 2, A = [], Bq = [];
  for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const ox = (px * s1 + qx * s2) * h, oy = (py * s1 + qy * s2) * h, oz = (pz * s1 + qz * s2) * h;
    A.push([a[0] + ox, a[1] + oy, a[2] + oz]); Bq.push([b[0] + ox, b[1] + oy, b[2] + oz]);
  }
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad1(w, A[i], A[j], Bq[j], Bq[i], col, A[i][0] + A[j][0] - 2 * a[0], A[i][1] + A[j][1] - 2 * a[1], A[i][2] + A[j][2] - 2 * a[2]); }
  if (ends) { quad1(w, A[0], A[1], A[2], A[3], col, -dx, -dy, -dz); quad1(w, Bq[0], Bq[1], Bq[2], Bq[3], col, dx, dy, dz); }
}

/**
 * A wall along a polyline of 3D foot points [x, groundY, z]: thickness t, height h above each foot, sunk `sink`.
 * Colours: cs (face), ct (top), foot darkening built in. capA / capB close the ends. hAt(i) may vary the height.
 */
export function wallLine(w, pts, t, h, cs, ct, o = {}) {
  const n = pts.length; if (n < 2) return 0;
  const sink = o.sink === undefined ? 0.45 : o.sink, cf = o.foot || mul3(cs, 0.72), L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const [dx, dz] = norm2(b[0] - a[0], b[2] - a[2]), nx = -dz * t / 2, nz = dx * t / 2, hh = typeof h === 'function' ? h(i) : h;
    L.push([pts[i][0] - nx, pts[i][1], pts[i][2] - nz, hh]); R.push([pts[i][0] + nx, pts[i][1], pts[i][2] + nz, hh]);
  }
  let q = 0;
  for (let i = 0; i + 1 < n; i++) {
    const l0 = L[i], l1 = L[i + 1], r0 = R[i], r1 = R[i + 1];
    const lb0 = [l0[0], l0[1] - sink, l0[2]], lb1 = [l1[0], l1[1] - sink, l1[2]], lt0 = [l0[0], l0[1] + l0[3], l0[2]], lt1 = [l1[0], l1[1] + l1[3], l1[2]];
    const rb0 = [r0[0], r0[1] - sink, r0[2]], rb1 = [r1[0], r1[1] - sink, r1[2]], rt0 = [r0[0], r0[1] + r0[3], r0[2]], rt1 = [r1[0], r1[1] + r1[3], r1[2]];
    quadC(w, lb0, lb1, lt1, lt0, cf, cf, cs, cs, l0[0] - r0[0], 0.001, l0[2] - r0[2]);
    quadC(w, rb0, rb1, rt1, rt0, cf, cf, cs, cs, r0[0] - l0[0], 0.001, r0[2] - l0[2]);
    quad1(w, lt0, lt1, rt1, rt0, ct, 0, 1, 0);
    q += 3;
    if (i === 0 && o.capA !== false) { quadC(w, lb0, rb0, rt0, lt0, cf, cf, cs, cs, l0[0] - l1[0], 0.001, l0[2] - l1[2]); q++; }
    if (i === n - 2 && o.capB !== false) { quadC(w, lb1, rb1, rt1, lt1, cf, cf, cs, cs, l1[0] - l0[0], 0.001, l1[2] - l0[2]); q++; }
  }
  return q * 2;
}

/**
 * An earth ridge (bund, spoil bank) along 3D foot points: a tent of half-width `half` and height h, or with
 * `flat` > 0 a trapezoid with a flat crest of that half-width. The feet are sunk 0.1 m.
 */
export function ridgeLine(w, pts, half, h, cs, o = {}) {
  const n = pts.length; if (n < 2) return 0;
  const flat = o.flat || 0, ct = o.top || cs, cf = o.foot || mul3(cs, 0.86), P = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const [dx, dz] = norm2(b[0] - a[0], b[2] - a[2]), nx = -dz, nz = dx, hh = typeof h === 'function' ? h(i) : h, x = pts[i][0], y = pts[i][1], z = pts[i][2];
    P.push({ l: [x - nx * half, y - 0.1, z - nz * half], r: [x + nx * half, y - 0.1, z + nz * half], cl: [x - nx * flat, y + hh, z - nz * flat], cr: [x + nx * flat, y + hh, z + nz * flat], nx, nz });
  }
  let q = 0;
  for (let i = 0; i + 1 < n; i++) {
    const a = P[i], b = P[i + 1];
    quadC(w, a.l, b.l, b.cl, a.cl, cf, cf, cs, cs, -a.nx, 0.6, -a.nz);
    quadC(w, a.r, b.r, b.cr, a.cr, cf, cf, cs, cs, a.nx, 0.6, a.nz);
    q += 2;
    if (flat > 0) { quad1(w, a.cl, b.cl, b.cr, a.cr, ct, 0, 1, 0); q++; }
  }
  return q * 2;
}

/**
 * A lathe round (cx, cz): profile [[r, y], ...] from the foot upwards (y relative to y0), n sides, optional
 * ellipse (sx, sz scale the radius along the unit axis (ux, uz) and across it). colAt(k, kn) -> colour of ring k.
 * The last ring may have r = 0 (apex). cap: close the top ring with a fan.
 */
export function lathe(w, cx, cz, y0, prof, n, colAt, o = {}) {
  const ux = o.ux === undefined ? 1 : o.ux, uz = o.uz || 0, sx = o.sx || 1, sz = o.sz || 1, rings = [];
  const ph = o.phase || 0;
  for (let k = 0; k < prof.length; k++) {
    const ring = [], r = prof[k][0], y = y0 + prof[k][1];
    for (let i = 0; i < n; i++) { const a = (i / n) * M.TAU + ph, lx = Math.cos(a) * r * sx, lz = Math.sin(a) * r * sz; ring.push([cx + ux * lx - uz * lz, y, cz + uz * lx + ux * lz]); }
    rings.push(ring);
  }
  let t = 0;
  for (let k = 0; k + 1 < prof.length; k++) {
    const c0 = typeof colAt === 'function' ? colAt(k, prof.length) : colAt, c1 = typeof colAt === 'function' ? colAt(k + 1, prof.length) : colAt;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
      const ox = (a[0] + b[0]) / 2 - cx, oz = (a[2] + b[2]) / 2 - cz;
      if (prof[k + 1][0] < 1e-6) { triC(w, a, b, d, c0, c0, c1, ox, 0.3, oz); t++; }
      else if (prof[k][0] < 1e-6) { triC(w, a, c, d, c0, c1, c1, (c[0] + d[0]) / 2 - cx, -0.3, (c[2] + d[2]) / 2 - cz); t++; }
      else { quadC(w, a, b, c, d, c0, c0, c1, c1, ox, 0.3, oz); t += 2; }
    }
  }
  if (o.cap) { const k = prof.length - 1, c = typeof colAt === 'function' ? colAt(k, prof.length) : colAt, top = [cx, y0 + prof[k][1], cz]; for (let i = 0; i < n; i++) { triC(w, rings[k][i], rings[k][(i + 1) % n], top, c, c, c, 0, 1, 0); t++; } }
  return t;
}

/** A flat disc (fan) at level y: n sides, colour at the centre and at the rim; yAt(x, z) may bend it to the ground. */
export function disc(w, cx, cz, y, r, n, cc, cr, o = {}) {
  const sx = o.sx || 1, sz = o.sz || 1, ux = o.ux === undefined ? 1 : o.ux, uz = o.uz || 0, ph = o.phase || 0, r0 = o.inner || 0;
  const P = [], Q = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * M.TAU + ph, wob = o.wobble ? 1 + o.wobble * (hash2(i, o.seed || 0, 4411) - 0.5) : 1;
    const lx = Math.cos(a) * sx, lz = Math.sin(a) * sz;
    const x = cx + (ux * lx - uz * lz) * r * wob, z = cz + (uz * lx + ux * lz) * r * wob;
    P.push([x, typeof y === 'function' ? y(x, z) : y, z]);
    if (r0 > 0) { const xi = cx + (ux * lx - uz * lz) * r0, zi = cz + (uz * lx + ux * lz) * r0; Q.push([xi, typeof y === 'function' ? y(xi, zi) : y, zi]); }
  }
  const c = [cx, typeof y === 'function' ? y(cx, cz) : y, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (r0 > 0) quadC(w, Q[i], Q[j], P[j], P[i], cc, cc, cr, cr, 0, 1, 0);
    else triC(w, c, P[i], P[j], cc, cr, cr, 0, 1, 0);
  }
  return r0 > 0 ? n * 2 : n;
}

/** A flat rectangle on the ground (mat, floor, puddle): centre, half sizes, axis, level y (number or fn). */
export function flatRect(w, cx, cz, hx, hz, ux, uz, y, col, col2) {
  const vx = -uz, vz = ux, P = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = cx + ux * sx * hx + vx * sz * hz, z = cz + uz * sx * hx + vz * sz * hz; P.push([x, typeof y === 'function' ? y(x, z) : y, z]); }
  quadC(w, P[0], P[1], P[2], P[3], col, col, col2 || col, col2 || col, 0, 1, 0);
}

/** A prism of constant cross-section along an axis: section = [[across, up], ...] (closed loop, any winding), extruded from a to b (plan points), on level y0. */
export function extrude(w, ax, az, bx, bz, y0, section, colAt, o = {}) {
  const [dx, dz] = norm2(bx - ax, bz - az), nx = -dz, nz = dx, n = section.length, A = [], B = [];
  let mx = 0, my = 0; for (const s of section) { mx += s[0]; my += s[1]; } mx /= n; my /= n;
  for (const s of section) { A.push([ax + nx * s[0], y0 + s[1], az + nz * s[0]]); B.push([bx + nx * s[0], y0 + s[1], bz + nz * s[0]]); }
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (o.skip && o.skip(i)) continue;
    const j = (i + 1) % n, c0 = typeof colAt === 'function' ? colAt(i) : colAt, c1 = typeof colAt === 'function' ? colAt(j) : colAt;
    const ex = (section[i][0] + section[j][0]) / 2 - mx, ey = (section[i][1] + section[j][1]) / 2 - my;
    quadC(w, A[i], A[j], B[j], B[i], c0, c1, c1, c0, nx * ex, ey, nz * ex); t += 2;
  }
  if (o.ends !== false) {
    const ce = o.endCol || (typeof colAt === 'function' ? colAt(0) : colAt), ca = [ax + nx * mx, y0 + my, az + nz * mx], cb = [bx + nx * mx, y0 + my, bz + nz * mx];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; triC(w, ca, A[i], A[j], ce, ce, ce, -dx, 0, -dz); triC(w, cb, B[i], B[j], ce, ce, ce, dx, 0, dz); t += 2; }
  }
  return t;
}

/** Douglas-Peucker on a plan polyline. */
export function simplify(pl, tol) {
  if (pl.length < 3) return pl.slice();
  const keep = new Uint8Array(pl.length); keep[0] = keep[pl.length - 1] = 1;
  const stack = [[0, pl.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let worst = 0, wi = -1;
    for (let i = a + 1; i < b; i++) { const d = M.distToSegment(pl[i][0], pl[i][1], pl[a][0], pl[a][1], pl[b][0], pl[b][1])[0]; if (d > worst) { worst = d; wi = i; } }
    if (wi >= 0 && worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pl.filter((_, i) => keep[i]);
}

/** Intersection of segments a-b and c-d: [x, z, t (on a-b), u (on c-d)] or null. */
export function segX(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + rx * t, a[1] + rz * t, t, u] : null;
}

// ---------------------------------------------------------------------------------------------------------
// importance: for every 80 m cell of the plain, the smallest distance from which any frame of the film has it
// inside the picture (night frames count as 3.2 times as far: only fires read then), and the smallest distance to
// the camera path at all (for the add-on detail of the low flights).
// ---------------------------------------------------------------------------------------------------------
export function makeSeen(ctx) {
  const film = ctx.film, CELL = 80, R = 8000, N = (2 * R) / CELL, seen = new Float32Array(N * N).fill(1e9), pathD = new Float32Array(N * N).fill(1e9);
  const night0 = (() => { const s = film.shots.find((q) => q.n === 8); return s ? s.t1 - 1.6 : 50; })();
  const S = [];
  for (let t = 0; t <= film.duration + 1e-6; t += 0.2) {
    const p = film.pathPoseAt(t), P = p.pos, L = p.look;
    let fx = L[0] - P[0], fy = L[1] - P[1], fz = L[2] - P[2]; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy, th = Math.tan(((p.fov || 46) * Math.PI) / 360), tw = (th * 16) / 9;
    S.push({ px: P[0], py: P[1], pz: P[2], fx, fy, fz, rx, rz, ux, uy, uz, th, tw, k: t > night0 ? 3.2 : 1 });
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -R + (i + 0.5) * CELL, z = -R + (j + 0.5) * CELL; let best = 1e9, bp = 1e9;
    for (let s = 0; s < S.length; s++) {
      const c = S[s], vx = x - c.px, vy = 1 - c.py, vz = z - c.pz, d = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (d < bp) bp = d;
      if (d * c.k >= best) continue;
      const zz = vx * c.fx + vy * c.fy + vz * c.fz; if (zz < 1) continue;
      const xx = (vx * c.rx + vz * c.rz) / (zz * c.tw); if (xx < -1.15 || xx > 1.15) continue;
      const yy = (vx * c.ux + vy * c.uy + vz * c.uz) / (zz * c.th); if (yy < -1.2 || yy > 1.15) continue;
      best = d * c.k;
    }
    seen[j * N + i] = best; pathD[j * N + i] = bp;
  }
  const at = (a, x, z) => { const i = Math.floor((x + R) / CELL), j = Math.floor((z + R) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? 1e9 : a[j * N + i]; };
  return { seen: (x, z) => at(seen, x, z), path: (x, z) => at(pathD, x, z), samples: S.length };
}
