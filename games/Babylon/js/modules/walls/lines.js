// js/modules/walls/lines.js — a towered wall swept along a line: curtain bays between the canonical towers of
// W.wallTowers, wall-walk with parapets on both sides, merlons, towers with openings, stairs, spouts, plaster
// patches; the same bays again as the far level. Used for Imgur-Enlil, Nemetti-Enlil (both banks), the outer mud
// wall and the cross-wall.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { PARAPET, FILM_NEAR } from './kit.js';

export function makeLines(ctx, K) {
  const { geom, ground } = ctx;
  const { put, putFar, paintBy, subLine, mudTone, mul, mix, TONE, writer, panel, boxInto, merlonRow, tower } = K;

  /**
   * opts:
   *   line           centreline polyline
   *   towers         [{ x, z, rotDeg, out, big, w, d, top, s }] on the line (W.wallTowers), any order
   *   cuts           [[s0, s1], ...] chainage intervals without wall (gates)
   *   sMin, sMax     the wall exists between these chainages (default: the whole line)
   *   T              thickness; walkAt(x, z) -> wall-walk level
   *   outSign        +1: outward is the RIGHT of travel, -1: the left
   *   key            'mud' | 'brick'; seed; bias (tone bias)
   *   towerOpts(t)   -> extra members for K.tower (shift, rows, grooves, hatch, corbel, beams) or null to leave the tower out
   *   inner          'merlons' | 'kerb' (the parapet on the city side); outer is always crenellated
   *   baseAt(x, z, d) -> foot level of the body (default: lowest ground across the wall - 1.2)
   *   footIn / footOut (x, z) -> visible ground level on the city / outer side (for stairs, spouts, patches)
   *   stairs         { every: n bays, width, side: 'in' } | null
   *   detail         0..1: 1 = spouts, patches, stains; 0 = bare
   * Returns { bays: [{ s0, s1, walk, mid: [x, z] }], towers: [...built], length }
   */
  function wallLine(o) {
    const { line, T, key = 'mud', seed = 1, outSign = 1, inner = 'merlons', detail = 1 } = o;
    const ch = M.chainage(line), total = ch[ch.length - 1], sMin = o.sMin ?? 0, sMax = o.sMax ?? total;
    const cuts = (o.cuts || []).map((c) => [Math.max(c[0], sMin), Math.min(c[1], sMax)]).filter((c) => c[1] > c[0]).sort((a, b) => a[0] - b[0]);
    const stretches = []; let a = sMin;
    for (const c of cuts) { if (c[0] - a > 1) stretches.push([a, c[0]]); a = Math.max(a, c[1]); }
    if (sMax - a > 1) stretches.push([a, sMax]);
    const at = (s) => { const p = M.pointAlong(line, M.clamp(s, 0, total)); return p; };
    const base = o.baseAt || ((x, z, d) => K.groundMin(x, z, d, [-T / 2 - 0.7, 0, T / 2 + 0.7]) - 1.2);
    const result = { bays: [], towers: [], length: 0 };
    const pIn = -outSign * (T / 2 - 0.275), pOut = outSign * (T / 2 - 0.275);          // parapet centre lines (offset to the right)

    for (const [sa, sb] of stretches) {
      result.length += sb - sa;
      const tw = (o.towers || []).filter((t) => t.s > sa + 0.5 && t.s < sb - 0.5).map((t) => ({ t, opt: o.towerOpts ? o.towerOpts(t) : {} })).filter((q) => q.opt).sort((p, q) => p.t.s - q.t.s);
      // bays: stretch start -> tower -> tower -> ... -> stretch end
      const nodes = [{ s: sa, half: 0, end: true }, ...tw.map((q) => ({ s: q.t.s, half: q.t.w / 2, q })), { s: sb, half: 0, end: true }];
      const bayLevel = [];
      for (let k = 0; k < nodes.length - 1; k++) { const m = at((nodes[k].s + nodes[k + 1].s) / 2); bayLevel.push(o.walkAt(m.x, m.z)); }
      for (let k = 0; k < nodes.length - 1; k++) {
        const A = nodes[k], B = nodes[k + 1], walk = bayLevel[k], bi = result.bays.length;
        const tone = mudTone(bi, seed, o.bias || 0), tint = key === 'brick' ? K.brickTone(bi, seed) : tone;
        const f0 = A.s + A.half, f1 = B.s - B.half;                                   // tower flank to tower flank
        if (f1 - f0 < 0.3) { result.bays.push({ s0: A.s, s1: B.s, walk, skip: true }); continue; }
        // ---- body: vertices at the flanks, 1.6 m beside them (the dark corner) and in the middle
        const ss = [A.s, f0 + 0.03, f0 + 1.6, (f0 + f1) / 2, f1 - 1.6, f1 - 0.03, B.s].filter((s, i, arr) => i === 0 || s > arr[i - 1] + 0.2);
        for (let i = 1; i < ch.length - 1; i++) if (ch[i] > A.s + 0.3 && ch[i] < B.s - 0.3) ss.push(ch[i]);
        ss.sort((p, q) => p - q);
        const pl = ss.map((s) => { const i = ch.findIndex((c) => Math.abs(c - s) < 1e-6); if (i > 0 && i < ch.length - 1) return [line[i][0], line[i][1]]; const p = at(s); return [p.x, p.z]; });
        const dirAt = (x, z) => M.nearestOnPolyline(x, z, line).dir;
        const baseFn = (x, z) => base(x, z, dirAt(x, z));
        const walkTint = key === 'brick' ? mul(tint, 0.92) : mix(TONE.walk, tone, 0.4);
        const mp = at((f0 + f1) / 2), straight = !ch.some((c, i) => i > 0 && i < ch.length - 1 && c > A.s + 0.3 && c < B.s - 0.3);
        const rich = detail > 0 && !K.draft && key === 'mud' && straight && f1 - f0 > 7 && K.filmDist(mp.x, walk, mp.z) < FILM_NEAR;
        if (rich) richBody(o, { A, B, f0, f1, walk, tint, walkTint, bi, at, seed, T });
        else put(key, paintBy(geom.wall(pl, { thickness: T, base: baseFn, top: walk, caps: false }), tint, walkTint));
        // end faces where the stretch ends (a gate, the river, a junction): closed by hand
        for (const [N, s, sign] of [[A, A.s, -1], [B, B.s, 1]]) {
          if (!N.end) continue;
          const p = at(s), r = [-p.dir[1], p.dir[0]], l = [p.x - r[0] * T / 2, p.z - r[1] * T / 2], rr = [p.x + r[0] * T / 2, p.z + r[1] * T / 2];
          const w = writer(); w.color(tint);
          const y0 = baseFn(p.x, p.z);
          if (sign > 0) panel(w, rr, l, y0, walk); else panel(w, l, rr, y0, walk);
          put(key, w.toGeometry());
        }
        // ---- the far level of the same bay
        const fpl = subLine(line, A.s, B.s, ch), fbase = Math.min(baseFn(fpl[0][0], fpl[0][1]), baseFn(fpl[fpl.length - 1][0], fpl[fpl.length - 1][1]));
        putFar(paintBy(geom.wall(fpl, { thickness: T, base: fbase, top: walk, caps: A.end || B.end }), tint, walkTint));
        // ---- parapets and merlons
        const pa = f0 - (A.end ? 0 : 0.12), pb = f1 + (B.end ? 0 : 0.12);
        const ptint = mul(tint, 1.02);
        const stair = detail > 0 && !K.draft ? stairPlan(o, { f0, f1, walk, bi, at, T }) : null;
        for (const [off, kind, isInner] of [[pOut, 'merlons', false], [pIn, inner, true]]) {
          if (kind === 'none') continue;
          const kerb = kind === 'kerb', th = kerb ? 0.4 : 0.55, hgt = kerb ? 0.55 : PARAPET, oo = kerb ? Math.sign(off) * (T / 2 - 0.2) : off;
          // the city-side parapet opens where a stair lands
          const pieces = isInner && stair ? [[pa, stair.sGap - 0.7], [stair.sGap + 0.7, pb]] : [[pa, pb]];
          for (const [u0, u1] of pieces) {
            if (u1 - u0 < 0.4) continue;
            const ppl = subLine(line, u0, u1, ch);
            put(key, geom.wall(ppl, { thickness: th, offset: oo, base: walk, top: walk + hgt }), ptint);
            if (!kerb) merlonRow(key, M.offsetPolyline(ppl, oo), walk + PARAPET, ptint);
          }
          putFar(geom.wall(fpl, { thickness: th, offset: oo, base: walk, top: walk + hgt, caps: false }), ptint);
        }
        const mid = at((f0 + f1) / 2);
        result.bays.push({ s0: f0, s1: f1, walk, mid: [mid.x, mid.z], dir: mid.dir, tint, index: bi, stair: !!stair });
        K.stats.bays++;
        // ---- small things of the bay
        if (detail > 0 && !K.draft) bayDetail(o, { f0, f1, walk, mid, tint, bi, at, seed, T, key, stair, rich });
      }
      // ---- towers of the stretch
      for (let k = 1; k < nodes.length - 1; k++) {
        const { t, opt } = nodes[k].q, bi = result.towers.length, shift = opt.shift || 0;
        const cx = t.x + t.out[0] * shift, cz = t.z + t.out[1] * shift;
        // foot: 1.2 m below the lowest ground at its corners
        let g = Infinity; for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const p = M.localToWorld([cx, cz], t.rotDeg, (lx * t.w) / 2, (lz * t.d) / 2); g = Math.min(g, ground.height(p[0], p[1])); }
        const e = M.rotateXZ(1, 0, t.rotDeg), f = [-e[1], e[0]], sg = t.out[0] * f[0] + t.out[1] * f[1] >= 0 ? 1 : -1;
        const tint = mul(mudTone(bi, seed + 77, o.bias || 0), 1.0);
        const spec = { x: cx, z: cz, rotDeg: t.rotDeg, w: t.w, d: t.d, out: t.out, base: g - 1.2, top: opt.top ?? t.top, key, tint: key === 'brick' ? K.brickTone(bi, seed + 77) : tint,
          walkA: bayLevel[k - 1], walkB: bayLevel[k], axis: -sg * shift, ...opt };
        if (o.inspect && !result.inspect && t.big) result.inspect = K.inspectOf(() => tower(spec)).inspect; else tower(spec);
        result.towers.push({ x: cx, z: cz, top: opt.top ?? t.top, big: t.big, s: t.s });
      }
    }
    return result;
  }

  const rightOfP = (p) => [-p.dir[1], p.dir[0]];

  /**
   * The body of a bay near the film path: both faces as panels with real openings (a row of square drain holes
   * under the wall-walk, a second row half-way up high walls, rain runnels worn into the plaster below the parapet),
   * vertices beside the towers and 2 m above the foot for the baked occlusion, a talus of washed-down mud at the foot.
   */
  function richBody(o, { A, B, f0, f1, walk, tint, walkTint, bi, at, seed, T }) {
    const pA = at(A.s), pB = at(B.s), r = rightOfP(pA), h = T / 2, span = B.s - A.s, u0 = f0 - A.s, u1 = f1 - A.s;
    const R0 = [pA.x + r[0] * h, pA.z + r[1] * h], R1 = [pB.x + r[0] * h, pB.z + r[1] * h], L0 = [pA.x - r[0] * h, pA.z - r[1] * h], L1 = [pB.x - r[0] * h, pB.z - r[1] * h];
    const w = writer(); w.color(tint);
    for (const sd of [1, -1]) {
      let foot = Infinity, hi = -Infinity;
      for (const u of [u0 + 0.5, (u0 + u1) / 2, u1 - 0.5]) { const p = at(A.s + u), g = ground.height(p.x + r[0] * sd * (h + 0.7), p.z + r[1] * sd * (h + 0.7)); foot = Math.min(foot, g); hi = Math.max(hi, g); }
      const rec = [], n = Math.max(2, Math.round((u1 - u0 - 3) / 3.4)), gap = (u1 - u0 - 3) / n, rows = [walk - 1.35];
      if (walk - hi > 9) rows.push(hi + (walk - hi) * 0.46);
      const S = (c) => (sd > 0 ? c : span - c);
      rows.forEach((y, ri) => { for (let i = 0; i < n; i++) { const c = S(u0 + 1.5 + gap * (i + 0.5)); rec.push({ s0: c - 0.11, s1: c + 0.11, y0: y, y1: y + 0.22, depth: 0.4, ao: 0.32 }); } void ri; });
      // rain runnels: shallow channels below the parapet, between the holes
      for (let i = 0; i < n - 1; i++) {
        if (hash2(bi * 7 + i, sd > 0 ? 51 : 52, seed) > 0.55) continue;
        const c = S(u0 + 1.5 + gap * (i + 1) + (hash2(bi * 7 + i, 53, seed) - 0.5) * 0.8), len = 1.6 + 4.5 * hash2(bi * 7 + i, 54, seed), wd = 0.1 + 0.08 * hash2(bi * 7 + i, 55, seed);
        const y0 = Math.max(hi + 1.5, walk - 1.05 - len);
        // a runnel may not cross a hole row: it ends just above the first one it would meet
        let top = walk - 0.02, bot = y0; if (rows[0] + 0.3 > bot && rows[0] < top) bot = rows[0] + 0.32;
        if (top - bot > 0.5) rec.push({ s0: c - wd / 2, s1: c + wd / 2, y0: bot, y1: top, depth: 0.07, ao: 0.78 });
      }
      const brk = [u0 + 0.03, u0 + 1.6, u1 - 1.6, u1 - 0.03].map(S);
      if (sd > 0) panel(w, R0, R1, foot - 1.2, walk, rec, { breaks: brk, ys: [hi + 2.0] });
      else panel(w, L1, L0, foot - 1.2, walk, rec, { breaks: brk, ys: [hi + 2.0] });
      // the talus at the foot
      if (u1 - u0 > 3) {
        const th = 0.45 + 0.5 * hash2(bi, sd > 0 ? 56 : 57, seed), a = at(A.s + u0 + 0.05), b = at(A.s + u1 - 0.05), k = sd * (h + 0.03);
        // its height wanders along the wall: washed-down mud lies where the runnels end
        const hgt = (x, z) => th * (0.35 + 1.1 * hash2(Math.round(x * 0.45), Math.round(z * 0.45), seed + 3));
        put('mud', geom.wall([[a.x + r[0] * k, a.z + r[1] * k], [b.x + r[0] * k, b.z + r[1] * k]], { thickness: 0.06, base: (x, z) => ground.height(x + r[0] * sd * 0.6, z + r[1] * sd * 0.6) - 0.4, top: (x, z) => ground.height(x + r[0] * sd * 0.6, z + r[1] * sd * 0.6) + hgt(x, z), batter: 0.55, step: 2.2 }), mix(tint, TONE.damp, 0.5));
      }
    }
    w.color(walkTint); K.topQuad(w, [L0, R0, R1, L1], walk);
    put('mud', w.toGeometry());
  }
  /** Where a stair to the wall-walk goes in this bay (city side), or null. */
  function stairPlan(o, { f0, f1, walk, bi, at, T }) {
    const st = o.stairs, len = f1 - f0;
    if (!st || bi % st.every !== (st.phase || 0) || len < 14) return null;
    const side = -o.outSign, p0 = at(f0 + 0.8), r = rightOfP(p0), k0 = side * (T / 2 + 0.6);
    const foot = ground.height(p0.x + r[0] * k0, p0.z + r[1] * k0), rise = walk - foot, steps = Math.max(1, Math.round(rise / 0.215)), tread = Math.min(0.3, (len - 3.4) / steps);
    if (tread < 0.2 || rise < 2) return null;
    if (st.ok) for (const u of [0, 0.5, 1]) { const p = at(f0 + 0.8 + u * steps * tread), q = rightOfP(p), k = side * (T / 2 + 2.5); if (!st.ok(p.x + q[0] * k, p.z + q[1] * k)) return null; }
    return { side, p0, r, foot, rise, steps, tread, run: steps * tread, width: st.width || 1.4, sGap: f0 + 0.8 + steps * tread + 0.9 };
  }

  /** Spouts with their stains, patches of newer plaster, a stair now and then. */
  function bayDetail(o, { f0, f1, walk, mid, tint, bi, at, seed, T, key, stair, rich }) {
    const len = f1 - f0, outSign = o.outSign, w = writer();
    const right = rightOfP;
    const footOf = (p, side) => { const r = right(p), k = side * (T / 2 + 0.6); return ground.height(p.x + r[0] * k, p.z + r[1] * k); };
    // a drain spout through the foot of the city-side parapet, and the streak of its water down the face
    if (len > 6) {
      const s = f0 + len * (0.3 + 0.4 * hash2(bi, 31, seed)), p = at(s), r = right(p), side = -outSign;
      const x = p.x + r[0] * side * (T / 2), z = p.z + r[1] * side * (T / 2), az = M.dirToAz(r[0] * side, r[1] * side);
      put(key, geom.spout({ x, y: walk + 0.04, z, azDeg: az, length: 0.7, width: 0.3, height: 0.2, drop: 0.08 }), mul(tint, 0.9));
      const foot = footOf(p, side), drop = Math.min(walk - foot - 0.5, 3.5 + 4 * hash2(bi, 32, seed));
      w.color(mul(tint, 0.86));
      boxInto(w, x + r[0] * side * 0.02, z + r[1] * side * 0.02, p.dir, 0.22 + 0.12 * hash2(bi, 33, seed), 0.02, walk - drop, walk - 0.25, { top: false, bottom: true });
    }
    // patches of newer or older plaster standing 3 cm proud of the face: two overlapping pieces, so no patch is a rectangle
    const hp = hash2(bi, 34, seed), np = rich ? (hp < 0.35 ? 3 : 2) : hp < 0.55 ? 1 : hp < 0.8 ? 2 : 0;
    for (let q = 0; q < np; q++) {
      const side = hash2(bi, 35 + q, seed) < 0.6 ? outSign : -outSign, pw = 1.4 + 2.8 * hash2(bi, 37 + q, seed), ph = 1.0 + 2.2 * hash2(bi, 39 + q, seed);
      if (len < pw + 5) continue;
      const s = f0 + 2.2 + (len - 4.4 - pw) * hash2(bi, 41 + q, seed) + pw / 2, p = at(s), r = right(p), foot = footOf(p, side);
      const y0 = foot + 1.4 + (walk - foot - ph - 3.4) * hash2(bi, 43 + q, seed);
      if (y0 + ph > walk - 1.7 || y0 < foot + 1.0) continue;
      const fresh = hash2(bi, 45 + q, seed) < 0.5, c = fresh ? mix(tint, TONE.fresh, 0.34) : mix(tint, TONE.damp, 0.22);
      w.color(c);
      boxInto(w, p.x + r[0] * side * (T / 2 + 0.02), p.z + r[1] * side * (T / 2 + 0.02), p.dir, pw / 2, 0.02, y0, y0 + ph, { top: true, bottom: true });
      const dx = (hash2(bi, 47 + q, seed) - 0.5) * pw * 0.7, dy = (hash2(bi, 49 + q, seed) - 0.3) * ph * 0.6;
      boxInto(w, p.x + p.dir[0] * dx + r[0] * side * (T / 2 + 0.03), p.z + p.dir[1] * dx + r[1] * side * (T / 2 + 0.03), p.dir, pw * 0.36, 0.03, y0 + dy + ph * 0.2, Math.min(walk - 1.6, y0 + dy + ph * 0.95), { top: true, bottom: true });
    }
    if (w.nv) put(key, w.toGeometry());
    // stairs on the city side: a solid flight against the wall, a landing at the wall-walk, a low wall on the open side
    if (stair) {
      const { side, p0, r, foot, rise, steps, tread, run, width: wdt } = stair, k = side * (T / 2 + wdt / 2);
      const fx = p0.x + r[0] * k, fz = p0.z + r[1] * k, az = M.dirToAz(p0.dir[0], p0.dir[1]);
      put(key, geom.stairs({ x: fx, z: fz, azDeg: az, width: wdt, steps, riser: rise / steps, tread, base: foot, sink: 1.0 }), mul(tint, 0.97));
      const lw = writer(); lw.color(mul(tint, 0.97));
      boxInto(lw, fx + p0.dir[0] * (run + 0.9), fz + p0.dir[1] * (run + 0.9), p0.dir, 0.9, wdt / 2, foot - 1, walk);
      put(key, lw.toGeometry());
      const gx = fx + r[0] * side * (wdt / 2 + 0.15), gz = fz + r[1] * side * (wdt / 2 + 0.15);
      put(key, geom.wall([[gx, gz], [gx + p0.dir[0] * (run + 1.8), gz + p0.dir[1] * (run + 1.8)]], { thickness: 0.3, base: foot - 0.8, top: (x, z, s) => Math.min(walk, foot + (s / tread) * (rise / steps)) + 0.85, step: 3 }), tint);
    }
  }

  return { wallLine };
}
