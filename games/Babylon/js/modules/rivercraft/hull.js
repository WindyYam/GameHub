// js/modules/rivercraft/hull.js — the plank hull of a Babylonian river barge and the things that go into boats.
// Sources: SPEC 3.18, R5 2.3 / "Working boats" (flat-bottomed, widest amidships, sides flaring outward, hull depth
// 0.5-1.25 m, bitumen inside and out with the gunwales worn to grey wood, upturned ends, steering sweep, poles,
// cargo under reed mats). Shapes of the ends follow the Assyrian reliefs and the reed-boat tradition (curved,
// upswept stem and stern posts): conjectural, as SPEC 8 says of all boats.
// Boat-local space: origin amidships on the waterline, +x starboard, +y up, -z bow, +z stern. Metres.
// OWNER: rivercraft.
import { MB, X, V } from './mesh.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/** cheap deterministic noise 0..1 of a position (colour jitter only) */
export const h3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
export const jitter = (c, amt) => (p) => mulc(c, 1 - amt + 2 * amt * h3(Math.round(p[0] * 7) / 7, Math.round(p[1] * 9) / 9, Math.round(p[2] * 5) / 5));
export { clamp, lerp, mix, mulc };

/**
 * The form of a hull. P: { L, B, fb (freeboard amidships), draft, bowRise, sternRise (sheer above fb at the ends),
 * endDepth (hull depth at the posts), flare (bottom width / beam), t (plank thickness), floor (level of the visible
 * hold floor: kept above the water plane, which is drawn through everything below it), pw, qw (plan fullness),
 * es (sheer exponent), ek (rocker exponent) }
 */
export function hullForm(P) {
  const L = P.L, hb = P.B / 2, pw = P.pw ?? 2.3, qw = P.qw ?? 0.62, es = P.es ?? 2.6, ek = P.ek ?? 3.2, flare = P.flare ?? 0.7, t = P.t ?? 0.07;
  const uEnd = 0.997, floor = P.floor ?? 0.08;
  const half = (u) => hb * Math.pow(Math.max(1e-6, 1 - Math.pow(Math.abs(u), pw)), qw);
  const sheer = (u) => P.fb + (u < 0 ? P.bowRise : P.sternRise) * Math.pow(Math.abs(u), es);
  const keel = (u) => { const e = sheer(u < 0 ? -1 : 1) - P.endDepth; return -P.draft + (e + P.draft) * Math.pow(Math.abs(u), ek); };
  const zOf = (u) => u * L / 2, uOf = (z) => clamp(z / (L / 2), -uEnd, uEnd);
  /** outer skin: a 0..1 from the keel line outward, b 0..1 from the bottom to the sheer; side = -1 port, +1 starboard */
  const outer = (u, a, b, side = 1, off = 0) => { const B = half(u), bw = B * flare, yk = keel(u), ys = sheer(u); return [side * (a * (bw + (B - bw) * b) + off), yk + (ys - yk) * b, zOf(u)]; };
  /** half-width of the INSIDE of the hull at height y (station u); beyond the sheer: the sheer value */
  const insideHalf = (u, y) => { const B = half(u), bw = B * flare, yk = keel(u), ys = sheer(u); const b = clamp((y - yk) / Math.max(1e-6, ys - yk)); return Math.max(0, bw + (B - bw) * b - t); };
  const floorAt = (u) => Math.max(floor, keel(u) + t + 0.02);
  return { P, L, hb, t, uEnd, floor, half, sheer, keel, zOf, uOf, outer, insideHalf, floorAt, flare };
}

/** stations clustered toward the ends */
const stations = (n, u0, u1) => { const out = []; for (let i = 0; i <= n; i++) { const w = -1 + (2 * i) / n; out.push(lerp(u0, u1, (Math.sin(w * Math.PI / 2) + 1) / 2)); } return out; };

/** the curved post that continues the keel line above the sheer: points from inside the hull to the tip */
export function postPath(F, end, topY, o = {}) {
  const sgn = end < 0 ? -1 : 1, pts = [];
  for (let k = 0; k <= 5; k++) { const u = sgn * lerp(0.9, F.uEnd, k / 5); pts.push([0, F.keel(u) + 0.02, F.zOf(u)]); }
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const th0 = Math.atan2(b[1] - a[1], Math.abs(b[2] - a[2])), th1 = (o.curl ?? 105) * Math.PI / 180, pe = o.pe ?? 1.15, N = o.n ?? 10;
  const run = (Lc) => { const out = []; let y = b[1], z = b[2]; for (let k = 1; k <= N; k++) { const s = (k - 0.5) / N, th = th0 + (th1 - th0) * Math.pow(s, pe); y += Math.sin(th) * Lc / N; z += sgn * Math.cos(th) * Lc / N; out.push([0, y, z]); } return out; };
  let lo = 0.1, hi = 6;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2, r = run(mid); let top = -9; for (const q of r) top = Math.max(top, q[1]); if (top < topY) lo = mid; else hi = mid; }
  return pts.concat(run((lo + hi) / 2));
}

/**
 * Build the hull into parts { hull, wood, ... }. o: { C (colours), detail 0|1|2, nu (stations), hold: [u0, u1] (open hold),
 * foreDeck: true, aftDeck: true | { y, u0, u1 } (a level platform), ribs: spacing m | 0, thwarts: [z, ...], bowTop, sternTop (post tops),
 * strake: 0.7 (b where the bare top strake begins), rail: true }
 * Returns helpers for fitting out: { F, holdU, floorY, halfAt(z, y), sheerAt(z), deckY(z) }.
 */
export function buildHull(parts, P, o) {
  const F = hullForm(P), C = o.C, detail = o.detail ?? 1, t = F.t;
  const nu = o.nu ?? (detail >= 2 ? 44 : detail === 1 ? 24 : 12), U = stations(nu, -F.uEnd, F.uEnd);
  const bT = o.strake ?? 0.72, hull = parts.hull, wood = parts.wood;
  const hold = o.hold || [-0.66, 0.6];
  const sheerMid = F.sheer(0);

  // ---- outer skin: bitumen from the keel to the top strake -------------------------------------------------
  const prof = [[1, bT], [1, 0.46], [1, 0.2], [0.985, 0.07], [0.86, 0.015], [0.5, 0]];
  const ring = detail === 0 ? [[1, bT], [1, 0.2], [0.9, 0.02]] : prof;
  const sect = [...ring.map((q) => [q[0], q[1], -1]), [0, 0, 1], ...ring.slice().reverse().map((q) => [q[0], q[1], 1])];
  // bitumen: sun-bleached and dusty toward the sheer, a darker soaked band at the waterline, scuffs
  const bit = (p) => { const k = clamp((p[1] + 0.2) / (sheerMid + 0.4)), wetk = 0.72 + 0.28 * clamp((p[1] - 0.06) / 0.22); return mulc(mix(C.bitumen, C.bitumenWorn, 0.08 + 0.4 * k * k), wetk * (0.84 + 0.32 * h3(Math.round(p[0] * 3), Math.round(p[1] * 6), Math.round(p[2] * 2.2)))); };
  hull.surf(nu, sect.length - 1, (u, v, i, j) => F.outer(U[i], sect[j][0], sect[j][1], sect[j][2]), (u, v, p) => bit(p), { flip: true });
  // ---- top strake: bare timber, standing a finger proud of the bitumen ----------------------------------
  const strakeCol = (p) => mulc(mix(C.woodGrey, C.wood, 0.35 + 0.3 * h3(Math.round(p[2] * 1.3), 1, 2)), 0.85 + 0.3 * h3(Math.round(p[2] * 2.1), Math.round(p[1] * 8), 5));
  for (const side of [-1, 1]) {
    wood.surf(nu, 1, (u, v, i, j) => F.outer(U[i], 1, j === 0 ? bT : 1, side, 0.014), (u, v, p) => strakeCol(p), { flip: side > 0 });
    if (detail >= 1) wood.surf(nu, 1, (u, v, i, j) => F.outer(U[i], 1, bT, side, j === 0 ? 0 : 0.014), C.woodDark, { flip: side > 0 });   // the lap under it
  }
  // ---- gunwale: a worn timber rail on the sheer --------------------------------------------------------------
  const railW = t + 0.075, railH = detail >= 2 ? 0.085 : 0.075;
  for (const side of [-1, 1]) {
    const pts = U.map((u) => [side * Math.max(0.03, F.half(u) - t / 2 + 0.012), F.sheer(u) + railH / 2 - 0.01, F.zOf(u)]);
    wood.sweep(pts, railW, railH, (p) => mulc(mix(C.woodGrey, C.woodPale, 0.5 * h3(Math.round(p[2] * 0.9), 3, 7)), 0.95 + 0.25 * h3(Math.round(p[2] * 3), 2, 9)), [1, 0, 0], { caps: false });
  }
  // ---- rubbing wale under the top strake (hero and near) ------------------------------------------------------
  if (detail >= 1) for (const side of [-1, 1]) {
    const Uw = U.filter((u) => Math.abs(u) < 0.94);
    wood.sweep(Uw.map((u) => { const q = F.outer(u, 1, bT, side, 0.03); return q; }), 0.06, 0.075, mulc(C.woodDark, 0.9), [1, 0, 0]);
  }
  // ---- inner skin and floor over the open hold (bitumen, darker toward the bottom) -----------------------------
  const iu0 = hold[0] - 0.02, iu1 = hold[1] + 0.02;
  const nI = detail >= 2 ? 30 : detail === 1 ? 14 : 6, UI = []; for (let i = 0; i <= nI; i++) UI.push(lerp(iu0, iu1, i / nI));
  const inner = (u, k, side) => {            // k: 0 sheer .. 3 floor edge, 4 centre
    const ys = F.sheer(u) - 0.01, yf = F.floorAt(u);
    if (k >= 4) return [0, yf, F.zOf(u)];
    const y = lerp(ys, yf, k / 3);
    return [side * F.insideHalf(u, y), y, F.zOf(u)];
  };
  const occ = (y, u) => { const k = clamp((y - F.floorAt(u)) / Math.max(0.2, F.sheer(u) - F.floorAt(u))); return 0.42 + 0.58 * Math.pow(k, 0.8); };
  const innerCol = (u, v, p) => mulc(mix(C.bitumen, C.bitumenWorn, 0.5), (0.9 + 0.2 * h3(Math.round(p[0] * 4), Math.round(p[1] * 5), Math.round(p[2] * 3))) * occ(p[1], F.uOf(p[2])));
  const sectI = [[0, -1], [1, -1], [2, -1], [3, -1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1]];
  hull.surf(nI, sectI.length - 1, (u, v, i, j) => inner(UI[i], sectI[j][0], sectI[j][1]), innerCol);
  // bottom boards on the floor (timber, laid athwartships)
  if (detail >= 1) {
    const fb = (u, side) => { const q = inner(u, 3, side); return [q[0] * 0.97, q[1] + 0.025, q[2]]; };
    wood.surf(nI, 1, (u, v, i, j) => fb(UI[i], j === 0 ? -1 : 1), (u, v, p) => mulc(mix(C.woodDark, C.woodGrey, h3(Math.round(p[2] * 4.5), 1, 1)), 0.62 + 0.2 * h3(Math.round(p[2] * 4.5), 4, 2)));
  }
  // ---- frames (ribs) and the beam shelf ---------------------------------------------------------------------
  const ribs = [];
  if (o.ribs && detail >= 1) {
    const z0 = F.zOf(hold[0]) + 0.25, z1 = F.zOf(hold[1]) - 0.25, n = Math.max(2, Math.round((z1 - z0) / o.ribs));
    for (let i = 0; i <= n; i++) {
      const z = lerp(z0, z1, i / n), u = F.uOf(z); ribs.push(z);
      for (const side of [-1, 1]) {
        const pts = []; const nk = detail >= 2 ? 4 : 2;
        for (let k = 0; k <= nk; k++) { const y = lerp(F.sheer(u) - 0.09, F.floorAt(u) + 0.03, k / nk); pts.push([side * (F.insideHalf(u, y) - 0.035), y, z]); }
        wood.sweep(pts, 0.075, 0.07, (p) => mulc(C.woodDark, (0.8 + 0.3 * h3(i, side, 3)) * occ(p[1], u)), [0, 0, 1], { caps: false });
      }
    }
    if (detail >= 2) for (const side of [-1, 1]) {
      const pts = UI.map((u) => { const y = F.sheer(u) - 0.2; return [side * (F.insideHalf(u, y) - 0.09), y, F.zOf(u)]; });
      wood.sweep(pts, 0.05, 0.09, mulc(C.woodDark, 0.85), [1, 0, 0]);
    }
  }
  // ---- thwarts (cross beams) -----------------------------------------------------------------------------
  for (const z of o.thwarts || []) {
    const u = F.uOf(z), y = F.sheer(u) - 0.13, w = F.insideHalf(u, y) + 0.03;
    wood.bar([-w, y, z], [w, y, z], 0.17, 0.1, (p) => mulc(mix(C.woodGrey, C.wood, 0.4), 0.85 + 0.25 * h3(Math.round(p[0] * 2), 1, z)), [0, 1, 0], false);
    if (detail >= 2) for (const side of [-1, 1]) wood.bar([side * (w - 0.02), y - 0.05, z], [side * (w - 0.32), y - 0.05, z], 0.07, 0.13, mulc(C.woodDark, 0.8), [0, 1, 0], false);   // hanging knees
  }
  // ---- decks -------------------------------------------------------------------------------------------------
  const plank = (p) => mulc(mix(C.woodGrey, C.woodPale, 0.25 + 0.5 * h3(Math.round(p[2] * 4.6), 0, 1)), 0.82 + 0.3 * h3(Math.round(p[2] * 4.6), Math.round(p[0] * 0.8), 2));
  const deck = (ua, ub, yOf, front) => {       // a deck from station ua to ub; `front` = the end that faces the hold (-1: ua, +1: ub)
    const n = detail >= 2 ? 10 : detail === 1 ? 5 : 3, us = []; for (let i = 0; i <= n; i++) us.push(lerp(ua, ub, i / n));
    const edge = (u, side) => { const y = yOf(u); const above = y > F.sheer(u) - 0.03; return [side * (above ? F.half(u) + 0.02 : F.insideHalf(u, y) + 0.02), y, F.zOf(u)]; };
    wood.surf(n, 1, (u, v, i, j) => edge(us[i], j === 0 ? -1 : 1), (u, v, p) => plank(p));
    // the bulkhead under the edge that faces the hold: it follows the inside of the hull (half a plank into the skin: no gaps)
    const uf = front < 0 ? ua : ub, zf = F.zOf(uf), yTop = yOf(uf) - 0.001, ysh = F.sheer(uf), yf = F.floorAt(uf);
    const sideX = (y) => (y > ysh - 0.03 ? F.half(uf) + 0.02 : F.insideHalf(uf, y) + t * 0.5);
    const ys = [yTop]; if (yTop > ysh - 0.03) ys.push(ysh - 0.031); const yq = ys[ys.length - 1]; ys.push(lerp(yq, yf, 0.33), lerp(yq, yf, 0.66), yf);
    const dark = (p) => mulc(C.woodDark, 0.5 + 0.55 * clamp((p[1] - yf) / Math.max(0.2, yTop - yf)));
    const left = ys.slice().reverse().map((y) => [-sideX(y), y, zf]), right = ys.map((y) => [sideX(y), y, zf]);
    const pl = left.concat(right);                      // bottom-left, up the port side, across, down the starboard side: faces -z
    wood.poly(front < 0 ? pl : pl.slice().reverse(), dark);
    // underside lip and side faces when the deck stands above the sheer (a raised platform)
    for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
      const p0 = edge(us[i], side), p1 = edge(us[i + 1], side);
      if (p0[1] > F.sheer(us[i]) - 0.03 || p1[1] > F.sheer(us[i + 1]) - 0.03) {
        const q0 = [p0[0], Math.min(p0[1] - 0.09, Math.max(F.sheer(us[i]), p0[1] - 0.6)), p0[2]], q1 = [p1[0], Math.min(p1[1] - 0.09, Math.max(F.sheer(us[i + 1]), p1[1] - 0.6)), p1[2]];
        if (side > 0) wood.quad(p0, p1, q1, q0, (p) => mulc(plank(p), 0.8)); else wood.quad(p1, p0, q0, q1, (p) => mulc(plank(p), 0.8));
      }
    }
    return { edge };
  };
  let foreDeck = null, aftDeck = null;
  if (o.foreDeck !== false) foreDeck = deck(-0.995, hold[0], (u) => F.sheer(u) - 0.075, 1);
  const aft = o.aftDeck === undefined ? true : o.aftDeck;
  let aftY = null;
  if (aft) {
    // a level platform (the steering deck of the big barges) rises as stern sheets to the post from u = ramp on
    const lvl = typeof aft === 'object' && aft.y !== undefined ? aft.y : null, ramp = (typeof aft === 'object' && aft.ramp) || 0.88;
    aftY = lvl === null ? (u) => F.sheer(u) - 0.075 : (u) => Math.max(lvl, lerp(lvl, F.sheer(0.995) - 0.075, clamp((u - ramp) / (0.995 - ramp))));
    aftDeck = deck(hold[1], 0.995, aftY, -1);
  }
  // ---- stem and stern posts -------------------------------------------------------------------------------------
  const postCol = (p) => mulc(mix(C.bitumenWorn, C.woodGrey, clamp((p[1] - sheerMid) / 0.9)), 0.85 + 0.3 * h3(Math.round(p[1] * 5), 1, Math.round(p[2])));
  const posts = {};
  for (const end of [-1, 1]) {
    const top = end < 0 ? (o.bowTop ?? F.sheer(-1) + 0.55) : (o.sternTop ?? F.sheer(1) + 0.6);
    const path = postPath(F, end, top, { curl: end < 0 ? (o.bowCurl ?? 100) : (o.sternCurl ?? 112), n: detail >= 2 ? 14 : detail === 1 ? 8 : 5 });
    wood.sweep(path, 0.2, 0.25, postCol, [1, 0, 0], { w1: 0.085, h1: 0.09 });
    posts[end < 0 ? 'bow' : 'stern'] = path;
    // lashing where the planking meets the post (rope turns), hero only
    if (detail >= 2) { const q = path[7]; parts.mat.tube([[0, q[1] - 0.07, q[2] - 0.02 * end], [0, q[1] + 0.09, q[2] + 0.03 * end]], 0.15, 6, C.rope, { caps: true }); }
  }
  // ---- the planks are sewn: rope seizings round the gunwale (hero: every 0.85 m; near: every 1.7 m) --------------------
  if (detail >= 1) {
    const step = detail >= 2 ? 0.85 : 1.7, zA = -F.L / 2 * 0.86, zB = F.L / 2 * 0.86, n = Math.round((zB - zA) / step);
    for (let i = 0; i <= n; i++) for (const side of [-1, 1]) {
      const z = lerp(zA, zB, i / n) + 0.2 * (h3(i, side, 4) - 0.5), u = F.uOf(z), x = side * (F.half(u) - t / 2 + 0.012), y = F.sheer(u) + railH / 2 - 0.01;
      parts.mat.tube([[x, y, z - 0.04], [x, y, z + 0.04]], railW * 0.62, detail >= 2 ? 6 : 4, mulc(C.rope, 0.8 + 0.3 * h3(i, side, 2)), { caps: false });
    }
  }
  return {
    F, hold, floorY: F.floor, posts, ribs, occ: (y, z) => occ(y, F.uOf(z)), plank,
    /** inside half-width at (z, y) */
    halfAt: (z, y) => F.insideHalf(F.uOf(z), y), sheerAt: (z) => F.sheer(F.uOf(z)), floorAt: (z) => F.floorAt(F.uOf(z)),
    foreDeckY: (z) => F.sheer(F.uOf(z)) - 0.075, aftDeckY: aftY ? (z) => aftY(F.uOf(z)) : null, holdZ: [F.zOf(hold[0]), F.zOf(hold[1])],
  };
}

// =================================================================================================================
// Fittings and cargo
// =================================================================================================================
const JAR = [[0.06, 0], [0.15, 0.04], [0.24, 0.22], [0.27, 0.4], [0.24, 0.55], [0.14, 0.66], [0.105, 0.7], [0.12, 0.745], [0.145, 0.76]];
const JAR_LO = [[0.1, 0], [0.26, 0.3], [0.24, 0.55], [0.11, 0.7], [0.14, 0.76]];
/** a storage jar standing at (x, y, z); s = size (1 = 0.76 m tall); stopper of clay and cloth */
export function jar(parts, C, x, y, z, s = 1, o = {}) {
  const clay = parts.clay, n = o.sides ?? 9, tone = o.tone ?? 0, k = o.shade ?? 1;
  const col = mulc(mix(C.clay, C.clayPale, tone), k);
  clay.push(X.of(X.t(x, y, z), X.rz(o.tilt || 0), X.ry(o.rot || 0), X.s(s)));
  clay.lathe(o.lo ? JAR_LO : JAR, n, (p) => mulc(col, 0.9 + 0.2 * h3(Math.round(p[1] * 9), x, z)), { capTop: true, capCol: mulc(o.stopper || C.linenDirty, k) });
  clay.pop();
}
/** an open basket with its load (dates, grain, fish ...) */
export function basket(parts, C, x, y, z, r = 0.26, h = 0.32, load = null, o = {}) {
  const m = parts.mat, n = o.sides ?? 8, k = o.shade ?? 1;
  m.push(X.of(X.t(x, y, z), X.ry(o.rot || 0)));
  m.lathe([[r * 0.72, 0], [r * 0.9, h * 0.5], [r, h], [r * 1.04, h + 0.02], [r * 0.93, h + 0.02]], n, (p) => mulc(mix(C.basket, C.mat, h3(x, 2, z)), k * (0.75 + 0.35 * clamp(p[1] / h))), { capBottom: false });
  const lc = mulc(load || C.date, k);
  m.surf(n, 2, (u, v) => { const a = -u * Math.PI * 2, rr = r * 0.93 * (1 - v); return [Math.cos(a) * rr, h + 0.02 + 0.09 * Math.sin(v * Math.PI / 2) , Math.sin(a) * rr]; }, (u, v, p) => mulc(lc, 0.8 + 0.4 * h3(Math.round(p[0] * 20), 3, Math.round(p[2] * 20))));
  m.pop();
}
/** a sack or bale lying at (x, y, z) (y = what it lies on) */
export function sack(parts, C, x, y, z, o = {}) {
  const c = parts.cloth, l = o.l ?? 0.8, w = o.w ?? 0.45, h = o.h ?? 0.3, col = mulc(o.col || C.sack, (o.shade ?? 1));
  c.push(X.of(X.t(x, y + h / 2, z), X.ry(o.rot || 0), X.rz(o.tilt || 0)));
  c.blob([0, 0, 0], w / 2, h / 2, l / 2, (u, v, p) => mulc(col, 0.8 + 0.3 * h3(Math.round(p[0] * 9), Math.round(p[1] * 9), Math.round(p[2] * 6)) + 0.1 * p[1] / h), { nu: o.nu ?? 8, nv: o.nv ?? 5, square: 0.62 });
  if (o.tie !== false) c.tube([[0, h * 0.2, l * 0.47], [0, h * 0.34, l * 0.6]], (i) => (i ? 0.02 : 0.07), 5, mulc(col, 0.8));
  c.pop();
}
/** a bundle of reeds (or brushwood) from a to b */
export function reedBundle(parts, C, a, b, r = 0.14, o = {}) {
  const m = parts.mat, col = o.col || C.reed, d = V.sub(b, a), n = o.sides ?? 6;
  m.tube([a, V.add(a, V.mul(d, 0.5)), b], (i, k) => r * (0.82 + 0.18 * Math.sin(k * Math.PI)), n, (p) => mulc(col, 0.75 + 0.4 * h3(Math.round(p[0] * 11), Math.round(p[1] * 11), Math.round(p[2] * 2))), { capCol: mulc(col, 0.55) });
  if (o.ties !== false) for (const k of [0.2, 0.5, 0.8]) { const q = V.add(a, V.mul(d, k)), e = V.mul(V.norm(d), 0.03); m.tube([V.sub(q, e), V.add(q, e)], r * 1.04, n, C.rope, { caps: false }); }
}
/** a log or pole from a to b; r0 at a, r1 at b */
export function log(parts, C, a, b, r0, r1 = r0, o = {}) {
  const col = o.col || C.woodPale;
  parts.wood.tube([a, b], (i) => (i ? r1 : r0), o.sides ?? 7, (p) => mulc(col, 0.85 + 0.3 * h3(Math.round(p[0] * 5), Math.round(p[1] * 5), Math.round(p[2] * 3))), { capCol: mulc(o.endCol || C.woodEnd, 1) });
}
/** a rope along points (sagging polyline given by the caller) */
export function rope(parts, C, pts, r = 0.02, o = {}) { parts.mat.tube(pts, r, o.sides ?? 5, o.col || C.rope, { caps: o.caps !== false }); }
/** a coil of rope lying at (x, y, z) */
export function coil(parts, C, x, y, z, R = 0.3, r = 0.045, turns = 2, o = {}) {
  const m = parts.mat, nu = o.nu ?? 12, nv = o.nv ?? 5;
  for (let k = 0; k < turns; k++) {
    const Rk = R - k * r * 0.5, yk = y + r + k * r * 1.6;
    m.surf(nu, nv, (u, v) => { const a = -u * Math.PI * 2, b = v * Math.PI * 2; return [x + (Rk + r * Math.cos(b)) * Math.cos(a), yk + r * Math.sin(b), z + (Rk + r * Math.cos(b)) * Math.sin(a)]; }, (u, v, p) => mulc(o.col || C.rope, 0.8 + 0.35 * h3(Math.round(u * 40), k, 1)));
  }
}
/** a heap of loose cargo under reed mats: z0..z1, half-width w(z), from the floor to `top` */
export function matHeap(parts, C, z0, z1, wOf, y0, top, o = {}) {
  const m = parts.mat, nu = o.nu ?? 10, nv = o.nv ?? 8, k = o.shade ?? 1;
  const f = (u, v) => {
    const z = lerp(z0, z1, u), w = wOf(z), s = -1 + 2 * v;
    const e = Math.pow(Math.sin(u * Math.PI), 0.45) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.6)), 0.6);
    const lump = 1 + 0.07 * Math.sin(u * 11 + 1.3) * Math.sin(v * 7 + 0.4) + 0.05 * Math.sin(u * 23 + v * 5);
    return [s * w, y0 + (top - y0) * e * lump, z];
  };
  // every mat is a sheet of its own tone; the seams run across the heap
  const sheets = o.sheets ?? 4;
  m.surf(nu, nv, f, (u, v, p) => { const sh = Math.floor(u * sheets + 0.35 * Math.sin(v * 9)); return mulc(mix(C.mat, C.matOld, h3(sh, 7, o.seed || 1)), k * (0.82 + 0.25 * h3(sh, 2, 3)) * (0.7 + 0.3 * clamp((p[1] - y0) / (top - y0) * 1.6))); });
  // lashings over the heap
  if (o.ropes !== false) for (let i = 0; i < (o.ropes ?? 3); i++) {
    const u = (i + 0.6) / ((o.ropes ?? 3) + 0.2), pts = []; for (let j = 0; j <= 8; j++) { const q = f(u, 0.04 + 0.92 * j / 8); pts.push([q[0], q[1] + 0.022, q[2]]); }
    rope(parts, C, pts, 0.018, { sides: 4, col: mulc(C.rope, 0.9 * k) });
  }
  return f;
}
/** a barrel-vaulted shelter of reed mats on bent hoops, open at both ends: z0..z1, half-width w, springing y0, crown y1 */
export function matCabin(parts, C, z0, z1, w, y0, y1, o = {}) {
  const m = parts.mat, nu = o.nu ?? 4, nv = o.nv ?? 10, th = 0.035;
  const arc = (v, d) => { const a = Math.PI * (1 - v); return [Math.cos(a) * (w - d), y0 + Math.sin(a) * (y1 - y0 - d)]; };
  const sag = (u) => 1 - 0.035 * Math.sin(u * Math.PI);
  m.surf(nu, nv, (u, v) => { const q = arc(v, 0); return [q[0], y0 + (q[1] - y0) * sag(u), lerp(z0, z1, u)]; }, (u, v, p) => { const sh = Math.floor(v * 5 + 0.3 * Math.sin(u * 7)); return mulc(mix(C.mat, C.matOld, h3(sh, 5, 2)), 0.85 + 0.22 * h3(sh, 1, 8)); });
  m.surf(nu, nv, (u, v) => { const q = arc(v, th); return [q[0], y0 + (q[1] - y0) * sag(u), lerp(z0, z1, u)]; }, (u, v, p) => mulc(C.matOld, 0.28 + 0.25 * Math.abs(u - 0.5) * 2), { flip: true });
  // edge strips closing the thickness at both ends, hoops showing at the open ends, a ridge pole
  for (const [z, s] of [[z0, -1], [z1, 1]]) {
    const hoop = []; for (let j = 0; j <= nv; j++) { const q = arc(j / nv, th / 2); hoop.push([q[0], q[1], z + s * 0.01]); }
    parts.wood.tube(hoop, 0.032, 5, mulc(C.woodPale, 0.9), { caps: false });
  }
  if (o.hoops !== false) for (let i = 1; i < nu; i++) { const z = lerp(z0, z1, i / nu), hoop = []; for (let j = 0; j <= nv; j++) { const q = arc(j / nv, -0.012); hoop.push([q[0], y0 + (q[1] - y0) * sag(i / nu), z]); } rope(parts, C, hoop, 0.014, { sides: 4, caps: false }); }
  // the feet of the hoops stand on a sill
  for (const s of [-1, 1]) parts.wood.bar([s * w, y0 - 0.02, z0], [s * w, y0 - 0.02, z1], 0.07, 0.07, mulc(C.woodDark, 0.9));
}
/** a long steering sweep (or raft sweep): loom from `hand` through `pivot` to the blade at `tip` */
export function sweepOar(parts, C, hand, pivot, tip, o = {}) {
  const d = V.norm(V.sub(tip, hand)), Lb = o.blade ?? 1.3, bw = o.bladeW ?? 0.3;
  const root = V.sub(tip, V.mul(d, Lb));
  parts.wood.tube([hand, pivot, root], (i) => (i === 0 ? 0.035 : 0.05), 6, (p) => mulc(C.woodPale, 0.8 + 0.3 * h3(Math.round(p[2] * 4), 1, 2)));
  // the blade: a board, edge-on to the water flow, wider toward the tip
  const s = V.norm(V.cross(d, [0, 1, 0])), up = V.norm(V.cross(s, d));
  parts.wood.sweep([root, V.add(root, V.mul(d, Lb * 0.5)), tip], 0.04, bw * 0.5, mulc(C.woodGrey, 0.9), s, { h1: bw });
  void up;
}
/** a forked crutch (post with two prongs) standing at p, height h, opening along `axis` ('x' | 'z') */
export function crutch(parts, C, p, h, axis = 'x', o = {}) {
  const w = parts.wood, col = mulc(C.woodPale, 0.85), sp = o.spread ?? 0.16;
  w.tube([p, [p[0], p[1] + h * 0.7, p[2]]], 0.05, 6, col);
  for (const s of [-1, 1]) w.tube([[p[0], p[1] + h * 0.66, p[2]], axis === 'x' ? [p[0] + s * sp, p[1] + h, p[2]] : [p[0], p[1] + h, p[2] + s * sp]], (i) => (i ? 0.03 : 0.045), 5, col);
  if (o.lash !== false) parts.mat.tube([[p[0], p[1] + h * 0.6, p[2]], [p[0], p[1] + h * 0.72, p[2]]], 0.062, 6, C.rope, { caps: false });
}
/** a saucer lamp of clay (the flame is nightfx's: we only declare the emitter) */
export function lampDish(parts, C, x, y, z) {
  parts.clay.push(X.t(x, y, z));
  parts.clay.lathe([[0.03, 0], [0.075, 0.02], [0.085, 0.045], [0.07, 0.045]], 7, mulc(C.clay, 0.8), { capBottom: true });
  parts.clay.pop();
}
/** a pack donkey standing at (x, y, z), nose toward -z rotated by rot; with or without panniers */
export function donkey(parts, C, x, y, z, rot = 0, o = {}) {
  const c = parts.cloth, D = mulc(C.donkey, 0.8), dk = mulc(D, 0.45), k = o.shade ?? 1, col = (q) => mulc(q, k), lo = !!o.lo;
  c.push(X.of(X.t(x, y, z), X.ry(rot)));
  // barrel: deep chest, pale belly, the dark stripe down the back
  c.blob([0, 0.9, 0.08], 0.25, 0.28, 0.62, (u, v, p) => mulc(col(D), p[1] < 0.78 ? 1.45 : p[1] > 1.13 && Math.abs(p[0]) < 0.07 ? 0.5 : 0.92 + 0.14 * h3(Math.round(p[2] * 8), 1, 2)), { nu: lo ? 6 : 10, nv: lo ? 4 : 6 });
  c.blob([0, 0.93, -0.36], 0.21, 0.25, 0.26, col(D), { nu: lo ? 5 : 8, nv: lo ? 3 : 5 });                                                            // shoulders
  c.tube([[0, 0.96, -0.42], [0, 1.2, -0.66], [0, 1.4, -0.8]], (i) => [0.2, 0.15, 0.115][i], lo ? 5 : 8, col(D), { caps: false });                    // a thick neck
  // head: long and heavy, carried low, pale muzzle
  c.push(X.of(X.t(0, 1.43, -0.84), X.rx(-32)));
  c.blob([0, 0, -0.07], 0.11, 0.125, 0.19, col(D), { nu: lo ? 5 : 8, nv: lo ? 3 : 5 });                                                              // skull and jaw
  c.blob([0, -0.015, -0.3], 0.075, 0.085, 0.19, (u, v, p) => mulc(col(D), p[2] < -0.34 ? 1.6 : 1.1), { nu: lo ? 5 : 8, nv: lo ? 3 : 4 });           // muzzle
  for (const s of [-1, 1]) c.sweep([[s * 0.07, 0.09, 0.05], [s * 0.115, 0.22, 0.1], [s * 0.125, 0.32, 0.12]], 0.075, 0.03, col(dk), [0.4 * s, 0, 1], { w1: 0.02, h1: 0.015 });   // long ears
  c.pop();
  for (const [lx, lz, kn] of [[-0.125, -0.36, -0.03], [0.125, -0.33, -0.03], [-0.13, 0.48, 0.06], [0.13, 0.51, 0.06]]) {
    c.tube([[lx, 0.86, lz], [lx, 0.5, lz + kn], [lx, 0.26, lz + kn * 0.3], [lx, 0.07, lz]], (i) => [0.1, 0.06, 0.042, 0.04][i], lo ? 4 : 6, col(mulc(D, 0.9)), { caps: false });
    c.tube([[lx, 0.075, lz], [lx, 0.0, lz - 0.012]], (i) => (i ? 0.052 : 0.044), lo ? 4 : 6, col(dk));                                               // hoof
  }
  c.tube([[0, 1.04, 0.66], [0, 0.74, 0.76], [0, 0.5, 0.74]], (i) => [0.03, 0.02, 0.04][i], 4, col(dk));                                              // tail with its tuft
  if (!lo) c.sweep([[0, 1.12, -0.36], [0, 1.31, -0.58], [0, 1.47, -0.74]], 0.04, 0.08, col(dk), [1, 0, 0]);                                          // short upright mane
  if (o.load !== false) {
    c.blob([0, 1.18, 0.1], 0.28, 0.07, 0.34, col(C.sackPale), { nu: 6, nv: 3, square: 0.6 });                                                        // saddle pad
    c.pop();
    const P = X.of(X.t(x, y, z), X.ry(rot)); parts.push(P);
    for (const s of [-1, 1]) basket(parts, C, s * 0.4, 0.72, 0.1, 0.2, 0.36, C.barley, { sides: lo ? 5 : 7, shade: k });
    if (!lo) rope(parts, C, [[-0.4, 1.08, 0.1], [0, 1.27, 0.1], [0.4, 1.08, 0.1]], 0.016, { sides: 4 });
    parts.pop();
    return;
  }
  c.pop();
}
/** an inflated goat skin (kelek float) lying along x at (x, y, z) */
export function skinFloat(parts, C, x, y, z, rot = 0, o = {}) {
  const c = parts.cloth;
  c.push(X.of(X.t(x, y, z), X.ry(rot)));
  c.blob([0, 0, 0], 0.42, 0.24, 0.27, (u, v, p) => mulc(C.hide, (p[1] < 0.02 ? 0.6 : 1.25) * (0.8 + 0.35 * h3(Math.round(p[0] * 6), Math.round(p[1] * 6), z))), { nu: o.nu ?? 8, nv: o.nv ?? 4, square: 0.85 });
  // the tied-off neck and legs of the skin
  c.tube([[0.4, 0.02, 0], [0.5, 0.06, 0]], (i) => (i ? 0.025 : 0.06), 4, mulc(C.hide, 0.8));
  c.pop();
}
/** a stone block (limestone or breccia) */
export function stone(parts, C, x, y, z, sx, sy, sz, rot = 0, col = null) {
  const c = parts.clay;
  c.push(X.of(X.t(x, y + sy / 2, z), X.ry(rot)));
  const k = col || C.limestone;
  c.box(0, 0, 0, sx, sy, sz, (p) => mulc(k, 0.86 + 0.22 * h3(Math.round(p[0] * 3), Math.round(p[1] * 3), Math.round(p[2] * 3))), 'y');
  c.pop();
}
/** a heap of fishing net with floats */
export function netHeap(parts, C, x, y, z, r = 0.45, o = {}) {
  const c = parts.cloth;
  c.blob([x, y + 0.05, z], r, 0.2, r * 0.8, (u, v, p) => mulc(C.net, 0.7 + 0.5 * h3(Math.round(p[0] * 14), Math.round(p[1] * 14), Math.round(p[2] * 14))), { nu: 8, nv: 4, from: 0.45 });
  if (o.floats !== false) for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; parts.wood.blob([x + Math.cos(a) * r * 0.6, y + 0.2, z + Math.sin(a) * r * 0.5], 0.05, 0.035, 0.05, C.woodPale, { nu: 5, nv: 3 }); }
}
export { MB, X, V };
