// layout/poly.js — polygon kernel of the urban-layout generator. Pure functions, no state, no THREE.
//
// A working polygon is { p: [[x, z], ...], t: [tag, ...] }: an OPEN ring (no repeated closing vertex) that is
// CLOCKWISE seen from above (interior on the RIGHT of travel, mathx.polygonArea > 0), with one tag per edge:
// t[i] belongs to the edge p[i] -> p[i + 1]. Tags are opaque objects (street frontage, party line, wall strip ...).
// Every operation carries the tags along: a cut edge gets the tag it is given, a shortened edge keeps its own.

const DUP = 1e-4;

export function area(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[i + 1 === n ? 0 : i + 1]; a += q[0] * r[1] - r[0] * q[1]; }
  return a / 2;
}
export function centroid(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i], r = p[i + 1 === n ? 0 : i + 1], f = q[0] * r[1] - r[0] * q[1];
    a += f; cx += (q[0] + r[0]) * f; cz += (q[1] + r[1]) * f;
  }
  if (Math.abs(a) < 1e-9) { let sx = 0, sz = 0; for (const q of p) { sx += q[0]; sz += q[1]; } return [sx / p.length, sz / p.length]; }
  return [cx / (3 * a), cz / (3 * a)];
}
export function bbox(p) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const q of p) { if (q[0] < a) a = q[0]; if (q[1] < b) b = q[1]; if (q[0] > c) c = q[0]; if (q[1] > d) d = q[1]; }
  return [a, b, c, d];
}
export const bbOverlap = (a, b, pad = 0) => a[0] <= b[2] + pad && a[2] >= b[0] - pad && a[1] <= b[3] + pad && a[3] >= b[1] - pad;
export function pointIn(p, x, z) {
  let inside = false;
  for (let i = 0, n = p.length, j = n - 1; i < n; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function perimeter(p) {
  let l = 0;
  for (let i = 0, n = p.length; i < n; i++) { const q = p[i], r = p[i + 1 === n ? 0 : i + 1]; l += Math.hypot(r[0] - q[0], r[1] - q[1]); }
  return l;
}
/** Distance from a point to the boundary: { d, e (edge), t (0..1 on it), x, z }. */
export function nearestOnBoundary(p, x, z) {
  let best = { d: Infinity, e: 0, t: 0, x: p[0][0], z: p[0][1] };
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[i + 1 === n ? 0 : i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, e: i, t, x: px, z: pz };
  }
  return best;
}

/** Make a working polygon from points (open or closed ring, any winding) and a tag (or one tag per edge). */
export function make(points, tags) {
  let p = points.map((q) => [q[0], q[1]]);
  if (p.length > 2 && Math.abs(p[0][0] - p[p.length - 1][0]) < 1e-9 && Math.abs(p[0][1] - p[p.length - 1][1]) < 1e-9) p.pop();
  let t = Array.isArray(tags) ? tags.slice(0, p.length) : p.map(() => tags);
  if (area(p) < 0) {
    p.reverse();
    // edge i of the reversed ring is old edge (n - 2 - i) mod n
    const n = p.length, old = t; t = new Array(n);
    for (let i = 0; i < n; i++) t[i] = old[(((n - 2 - i) % n) + n) % n];
  }
  return clean({ p, t });
}
/** Remove zero-length edges (and their tags). */
export function clean(poly) {
  const P = poly.p, T = poly.t;
  for (let i = P.length - 1; i >= 0 && P.length > 2; i--) {
    const j = i + 1 === P.length ? 0 : i + 1;
    if (Math.abs(P[i][0] - P[j][0]) < DUP && Math.abs(P[i][1] - P[j][1]) < DUP) { P.splice(i, 1); T.splice(i, 1); }
  }
  return poly;
}
/** Merge consecutive edges that are collinear (within `tol` metres of deviation) AND carry the same tag. */
export function simplify(poly, tol = 0.02) {
  const P = poly.p, T = poly.t;
  for (let i = P.length - 1; i >= 0 && P.length > 3; i--) {
    const n = P.length, a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    if (T[(i - 1 + n) % n] !== T[i]) continue;
    const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
    if (Math.abs((b[0] - a[0]) * dz - (b[1] - a[1]) * dx) / l < tol) { P.splice(i, 1); T.splice(i, 1); }
  }
  return poly;
}

/**
 * Sutherland-Hodgman clip: keep the part where (q - [px, pz]) . [nx, nz] >= off. The edge created along the
 * cut gets `cutTag`. Returns the clipped polygon or null. `out.crossings` (if an object is passed) receives the
 * number of boundary crossings: more than 2 means the polygon is concave across this line and the result is
 * joined by zero-width bridges along the cut.
 */
export function clip(poly, px, pz, nx, nz, off, cutTag, out) {
  const P = poly.p, T = poly.t, n = P.length, V = [], G = [];
  let crossings = 0, allIn = true;
  let cur = P[0], fc = (cur[0] - px) * nx + (cur[1] - pz) * nz - off;
  for (let i = 0; i < n; i++) {
    const nxt = P[i + 1 === n ? 0 : i + 1], fn = (nxt[0] - px) * nx + (nxt[1] - pz) * nz - off;
    if (fc >= 0) {
      V.push(cur); G.push(T[i]);
      if (fn < 0) { const k = fc / (fc - fn); V.push([cur[0] + (nxt[0] - cur[0]) * k, cur[1] + (nxt[1] - cur[1]) * k]); G.push(cutTag); crossings++; allIn = false; }
    } else {
      allIn = false;
      if (fn >= 0) { const k = fc / (fc - fn); V.push([cur[0] + (nxt[0] - cur[0]) * k, cur[1] + (nxt[1] - cur[1]) * k]); G.push(T[i]); crossings++; }
    }
    cur = nxt; fc = fn;
  }
  if (out) out.crossings = crossings;
  if (allIn) return poly;
  if (V.length < 3) return null;
  const r = clean({ p: V, t: G });
  return r.p.length >= 3 && area(r.p) > 1e-3 ? r : null;
}

/**
 * Split by the infinite line through (px, pz) with direction (dx, dz). Returns [right, left] (either may be
 * null): `right` lies to the right of travel and is pulled back from the line by gapR, `left` by gapL
 * (a street of width gapR + gapL between them). The new edges get tagR / tagL.
 */
export function splitLine(poly, px, pz, dx, dz, tagR, tagL, gapR = 0, gapL = 0, out) {
  const l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
  const o1 = out ? {} : null, o2 = out ? {} : null;
  const right = clip(poly, px, pz, rx, rz, gapR, tagR, o1), left = clip(poly, px, pz, -rx, -rz, gapL, tagL, o2);
  if (out) out.crossings = Math.max(o1.crossings || 0, o2.crossings || 0);
  return [right, left];
}

/** All intersections of the infinite line (point + unit direction) with the boundary, sorted by s: [{ s, e, t, x, z }]. */
export function lineHits(poly, px, pz, dx, dz) {
  const P = poly.p, n = P.length, hits = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[i + 1 === n ? 0 : i + 1], ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (dx * (a[1] - pz) - dz * (a[0] - px)) / -den;          // parameter on the edge
    if (t < 0 || t >= 1) continue;
    const x = a[0] + ex * t, z = a[1] + ez * t;
    hits.push({ s: (x - px) * dx + (z - pz) * dz, e: i, t, x, z });
  }
  hits.sort((u, v) => u.s - v.s);
  return hits;
}
/**
 * The chord cut by the line through (px, pz): the inside interval that contains s = 0, or (if the point is
 * outside) the longest inside interval. Returns { a, b } (hits, a.s < b.s) or null.
 */
export function chordOfLine(poly, px, pz, dx, dz) {
  const h = lineHits(poly, px, pz, dx, dz);
  let best = null, bestLen = 0;
  for (let i = 0; i + 1 < h.length; i++) {
    const s0 = h[i].s, s1 = h[i + 1].s, len = s1 - s0;
    if (len < 1e-6) continue;
    const m = (s0 + s1) / 2;
    if (!pointIn(poly.p, px + dx * m, pz + dz * m)) continue;
    if (s0 <= 0 && s1 >= 0) return { a: h[i], b: h[i + 1] };
    if (len > bestLen) { bestLen = len; best = { a: h[i], b: h[i + 1] }; }
  }
  return best;
}
/** First boundary hit of the ray from (ox, oz) along the unit direction, beyond `minS`: { s, e, t, x, z } or null. */
export function rayHit(poly, ox, oz, dx, dz, minS = 1e-6) {
  for (const h of lineHits(poly, ox, oz, dx, dz)) if (h.s > minS) return h;
  return null;
}

/**
 * Split along a chord from boundary point A (on edge ea at parameter ta) to boundary point B (edge eb, tb),
 * passing through the `interior` points. tagsR / tagsL: one tag, or one tag per chord segment (A -> B order).
 * Returns [right, left] of the travel A -> B, or null if the chord is degenerate.
 */
export function splitAt(poly, A, B, interior, tagsR, tagsL) {
  const P = poly.p, T = poly.t, n = P.length;
  if (A.e === B.e && Math.abs(A.t - B.t) < 1e-9) return null;
  const chord = [[A.x, A.z], ...interior, [B.x, B.z]], m = chord.length - 1;
  const tagOf = (tags, k) => (Array.isArray(tags) ? tags[Math.min(k, tags.length - 1)] : tags);
  // right piece: A -> ... -> B, then the boundary from B forward (clockwise) back to A
  const pr = [], tr = [];
  for (let k = 0; k < m; k++) { pr.push(chord[k]); tr.push(tagOf(tagsR, k)); }
  pr.push(chord[m]); tr.push(T[B.e]);
  if (!(A.e === B.e && A.t > B.t)) {
    for (let i = (B.e + 1) % n, guard = 0; guard <= n; i = (i + 1) % n, guard++) {
      pr.push(P[i]); tr.push(T[i]);
      if (i === A.e) break;
    }
  }
  // left piece: B -> ... -> A (chord reversed), then the boundary from A forward back to B
  const pl = [], tl = [];
  for (let k = m; k > 0; k--) { pl.push(chord[k]); tl.push(tagOf(tagsL, k - 1)); }
  pl.push(chord[0]); tl.push(T[A.e]);
  if (!(A.e === B.e && B.t > A.t)) {
    for (let i = (A.e + 1) % n, guard = 0; guard <= n; i = (i + 1) % n, guard++) {
      pl.push(P[i]); tl.push(T[i]);
      if (i === B.e) break;
    }
  }
  const R = clean({ p: pr, t: tr }), L = clean({ p: pl, t: tl });
  if (R.p.length < 3 || L.p.length < 3) return null;
  const ar = area(R.p), al = area(L.p);
  if (ar < 0.5 || al < 0.5) return null;
  return [R, L];
}

/**
 * Where a polyline runs inside the polygon. Returns pieces [{ s0, s1, A, B, pts }]: s0/s1 chainage on the
 * polyline, A / B = boundary hits ({ e, t, x, z }) or null where the polyline itself ends inside (a free end),
 * pts = the polyline vertices strictly between. Ends within `snap` metres of the boundary count as on it.
 */
export function polylinePieces(poly, pl, snap = 0.6) {
  const P = poly.p, n = P.length, hits = [];
  let acc = 0; const ch = [0];
  for (let k = 0; k + 1 < pl.length; k++) {
    const ax = pl[k][0], az = pl[k][1], bx = pl[k + 1][0], bz = pl[k + 1][1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    for (let i = 0; i < n; i++) {
      const c = P[i], d = P[i + 1 === n ? 0 : i + 1], ex = d[0] - c[0], ez = d[1] - c[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const u = ((c[0] - ax) * ez - (c[1] - az) * ex) / den, t = ((c[0] - ax) * dz - (c[1] - az) * dx) / den;
      if (u < 0 || u > 1 || t < 0 || t >= 1) continue;
      hits.push({ s: acc + len * u, e: i, t, x: ax + dx * u, z: az + dz * u });
    }
    acc += len; ch.push(acc);
  }
  const L = acc;
  hits.sort((a, b) => a.s - b.s);
  // ends that lie on (or within snap of) the boundary count as hits
  const endHit = (q, s) => { const b = nearestOnBoundary(P, q[0], q[1]); return b.d <= snap ? { s, e: b.e, t: Math.min(b.t, 1 - 1e-9), x: b.x, z: b.z, end: true } : null; };
  const h0 = endHit(pl[0], 0), h1 = endHit(pl[pl.length - 1], L);
  let list = hits.filter((h) => h.s > snap && h.s < L - snap);
  if (h0) list.unshift(h0); else if (hits.length && hits[0].s <= snap) list.unshift(hits[0]);
  if (h1) list.push(h1); else if (hits.length && hits[hits.length - 1].s >= L - snap) list.push(hits[hits.length - 1]);
  // merge hits closer than 0.3 m along the polyline
  const merged = [];
  for (const h of list) if (!merged.length || h.s - merged[merged.length - 1].s > 0.3) merged.push(h);
  const marks = [];
  if (!merged.length || merged[0].s > 1e-9) marks.push({ s: 0, hit: null });
  for (const h of merged) marks.push({ s: h.s, hit: h });
  if (marks[marks.length - 1].s < L - 1e-9) marks.push({ s: L, hit: null });
  const at = (s) => {
    let k = 0; while (k + 2 < ch.length && ch[k + 1] < s) k++;
    const f = ch[k + 1] > ch[k] ? (s - ch[k]) / (ch[k + 1] - ch[k]) : 0;
    return [pl[k][0] + (pl[k + 1][0] - pl[k][0]) * f, pl[k][1] + (pl[k + 1][1] - pl[k][1]) * f];
  };
  const out = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const s0 = marks[i].s, s1 = marks[i + 1].s;
    if (s1 - s0 < 1.0) continue;
    const mid = at((s0 + s1) / 2);
    if (!pointIn(P, mid[0], mid[1])) continue;
    const pts = [], ss = [];
    for (let k = 1; k + 1 < pl.length; k++) if (ch[k] > s0 + 0.5 && ch[k] < s1 - 0.5) { pts.push([pl[k][0], pl[k][1]]); ss.push(ch[k]); }
    out.push({ s0, s1, A: marks[i].hit, B: marks[i + 1].hit, pts, ss, p0: at(s0), p1: at(s1) });
  }
  return out;
}

/**
 * Inset with one distance per edge (>= 0; negative grows). Mitred vertex offset; an edge that the offset
 * swallows (it would run backwards) is dropped and its neighbours are joined, so short links and shallow
 * notches disappear instead of turning the outline inside out. Falls back to half-plane clipping (exact for
 * convex polygons) if that does not converge. Tags are kept. Returns a polygon or null when nothing is left.
 */
export function inset(poly, dist) {
  const P = poly.p, T = poly.t, n = P.length;
  const d = typeof dist === 'function' ? T.map((t, i) => dist(t, i)) : Array.isArray(dist) ? dist : T.map(() => dist);
  if (d.every((v) => v === 0)) return poly;
  let E = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[i + 1 === n ? 0 : i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    const ex = (b[0] - a[0]) / l, ez = (b[1] - a[1]) / l;
    // offset line: through (ox, oz) along (ex, ez); inward normal = (-ez, ex)
    E.push({ a, b, l, ex, ez, d: d[i], ox: a[0] - ez * d[i], oz: a[1] + ex * d[i], tag: T[i] });
  }
  for (let iter = 0; iter <= n && E.length >= 3; iter++) {
    const m = E.length, V = [], G = [], first = new Array(m), last = new Array(m);
    for (let i = 0; i < m; i++) {
      const j = i === 0 ? m - 1 : i - 1, ej = E[j], ei = E[i];
      const cr = ej.ex * ei.ez - ej.ez * ei.ex;
      if (Math.abs(cr) < 0.035) {
        // (nearly) parallel neighbours: a small step where the two offsets differ
        const gx = (ej.b[0] + ei.a[0]) / 2, gz = (ej.b[1] + ei.a[1]) / 2;
        const sj = (gx - ej.ox) * ej.ex + (gz - ej.oz) * ej.ez, si = (gx - ei.ox) * ei.ex + (gz - ei.oz) * ei.ez;
        const vj = [ej.ox + ej.ex * sj, ej.oz + ej.ez * sj], vi = [ei.ox + ei.ex * si, ei.oz + ei.ez * si];
        if (Math.hypot(vj[0] - vi[0], vj[1] - vi[1]) < 0.05) { last[j] = first[i] = V.length; V.push([(vj[0] + vi[0]) / 2, (vj[1] + vi[1]) / 2]); G.push(ei.tag); }
        else { last[j] = V.length; V.push(vj); G.push(ei.tag); first[i] = V.length; V.push(vi); G.push(ei.tag); }
      } else {
        const s = ((ei.ox - ej.ox) * ei.ez - (ei.oz - ej.oz) * ei.ex) / cr;
        last[j] = first[i] = V.length; V.push([ej.ox + ej.ex * s, ej.oz + ej.ez * s]); G.push(ei.tag);
      }
    }
    let worst = -1, worstLen = Infinity;
    for (let i = 0; i < m; i++) {
      const a = V[first[i]], b = V[last[i]];
      if ((b[0] - a[0]) * E[i].ex + (b[1] - a[1]) * E[i].ez < 1e-6 && E[i].l < worstLen) { worst = i; worstLen = E[i].l; }
    }
    if (worst < 0) { const out = clean({ p: V, t: G }); return out.p.length >= 3 && area(out.p) > 0.5 ? out : null; }
    E.splice(worst, 1);
  }
  let cur = poly;
  for (let i = 0; i < n && cur; i++) if (d[i] > 0) { const a = P[i], b = P[i + 1 === n ? 0 : i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; cur = clip(cur, a[0], a[1], -(b[1] - a[1]) / l, (b[0] - a[0]) / l, d[i], T[i]); }
  return cur && cur.p.length >= 3 && area(cur.p) > 0.5 ? cur : null;
}

/** Convex hull (clockwise seen from above, open ring) of a point list. */
export function hull(points) {
  const pts = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  const h = lower.concat(upper);
  if (area(h) < 0) h.reverse();
  return h;
}
/** Grow a clockwise convex ring outward by m metres (mitred). */
export function grow(ring, m) {
  const g = inset({ p: ring, t: ring.map(() => null) }, ring.map(() => -m));
  return g ? g.p : ring;
}

/**
 * poly minus a clockwise CONVEX cutter: the pieces of poly outside the cutter. Edges along the cutter get
 * `cutTag`, the seams between pieces get `seamTag`. Exact for convex poly (pieces are convex).
 */
export function difference(poly, cutter, cutTag, seamTag) {
  const pieces = [];
  let rest = poly;
  for (let k = 0, n = cutter.length; k < n && rest; k++) {
    const a = cutter[k], b = cutter[k + 1 === n ? 0 : k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const rx = -dz / l, rz = dx / l;                      // right of travel = inside the cutter
    const outside = clip(rest, a[0], a[1], -rx, -rz, 0, cutTag);
    const inside = clip(rest, a[0], a[1], rx, rz, 0, seamTag);
    if (outside === rest) { pieces.push(rest); return pieces; }      // rest lies wholly outside this edge
    if (outside) {
      // the cut edge runs along the whole line: only the stretch between a and b touches the cutter, the
      // rest of it is a seam with the pieces cut off later
      const Q = outside.p, G = outside.t;
      for (let i = Q.length - 1; i >= 0; i--) {
        if (G[i] !== cutTag) continue;
        const q0 = Q[i], q1 = Q[i + 1 === Q.length ? 0 : i + 1];
        if (Math.abs((q0[0] - a[0]) * rx + (q0[1] - a[1]) * rz) > 1e-6 || Math.abs((q1[0] - a[0]) * rx + (q1[1] - a[1]) * rz) > 1e-6) continue;
        const s0 = ((q0[0] - a[0]) * dx + (q0[1] - a[1]) * dz) / l, s1 = ((q1[0] - a[0]) * dx + (q1[1] - a[1]) * dz) / l;
        const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
        if (hi <= 0.05 || lo >= l - 0.05) { G[i] = seamTag; continue; }
        // cut points in travel order q0 -> q1
        const cuts = [];
        for (const c of s0 < s1 ? [0, l] : [l, 0]) if (c > lo + 0.05 && c < hi - 0.05) cuts.push(c);
        const ptsNew = cuts.map((c) => [a[0] + (dx / l) * c, a[1] + (dz / l) * c]);
        const tagsNew = [];
        const bounds = [s0, ...cuts, s1];
        for (let k = 0; k + 1 < bounds.length; k++) { const m = (bounds[k] + bounds[k + 1]) / 2; tagsNew.push(m > 0 && m < l ? cutTag : seamTag); }
        Q.splice(i + 1, 0, ...ptsNew); G.splice(i, 1, ...tagsNew);
      }
      pieces.push(outside);
    }
    rest = inside;
  }
  // what is left lies inside the cutter: dropped
  return pieces;
}

/** Extents of a point list along the unit axis u and its right-hand normal v: { u0, u1, v0, v1 }. */
export function extents(p, ux, uz) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  return { u0, u1, v0, v1 };
}
/** Unit direction of the longest edge. */
export function longestEdgeDir(p) {
  let best = 0, d = [1, 0];
  for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[i + 1 === n ? 0 : i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; } }
  return d;
}
/** Closed ring ([x, z] with the first vertex repeated), rounded to millimetres, for records. */
export const ring = (p) => { const r = p.map((q) => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]); r.push([r[0][0], r[0][1]]); return r; };
/** Do two convex-ish polygons overlap? (vertex-in-polygon either way, or any edge pair crossing) */
export function overlaps(a, b) {
  for (const q of a) if (pointIn(b, q[0], q[1])) return true;
  for (const q of b) if (pointIn(a, q[0], q[1])) return true;
  for (let i = 0, n = a.length; i < n; i++) {
    const p1 = a[i], p2 = a[i + 1 === n ? 0 : i + 1];
    for (let j = 0, m = b.length; j < m; j++) {
      const q1 = b[j], q2 = b[j + 1 === m ? 0 : j + 1];
      const d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d, v = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / d;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return true;
    }
  }
  return false;
}
