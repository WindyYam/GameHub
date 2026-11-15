// layout/net.js — the street net. A district is a set of REGIONS (working polygons, see poly.js) that is cut
// again and again by streets until every region is one block:
//
//   1. resolveFixed: the streets that are GIVEN (world.json: Processional Way, gate streets, the canal, the ten
//      excavated Merkes streets) are laid in first, exactly on their lines. A given street that ends in the
//      middle of nowhere (the edge of the excavation) is continued to the next street; if there is none within
//      reach, a new cross street is laid just beyond its end. So the excavated skeleton stays what it is and the
//      generated net grows out of it.
//   2. gridSplit: what is left is cut by generated streets, level by level: a few long through streets first,
//      then streets one block long. Every cut takes its direction from the two ends of the region it crosses
//      (so streets fan between boundaries that are not parallel), gets an angle jitter and sometimes a kink, and
//      either continues a street that ends on the other side of the street it meets (a crossing with a small
//      offset) or deliberately misses it (a T-junction, a dog-leg). Spacing is log-normal. Nothing is a lattice.
//
// Every edge of a region carries a tag: { k: 'street', st: street record, hw: half width of the corridor on
// this side, line: { junctions } }. Blocks are the final regions pulled back by hw (layout.js).
import * as G from './poly.js';

export const PARTY = Object.freeze({ k: 'party', st: null, hw: 0 });

export function createNet(env) {
  const { rng, paramsAt, addStreet } = env, obstacles = env.obstacles || [];
  /** Does the straight chord A -> B run through a small monument or a landmark house? Returns the obstacle. */
  function blockedBy(A, B) {
    const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), z0 = Math.min(A.z, B.z), z1 = Math.max(A.z, B.z);
    for (const ob of obstacles) {
      if (ob.bb[0] > x1 || ob.bb[2] < x0 || ob.bb[1] > z1 || ob.bb[3] < z0) continue;
      const r = ob.ring;
      if (G.pointIn(r, A.x, A.z) || G.pointIn(r, B.x, B.z)) return ob;
      for (let i = 0, n = r.length; i < n; i++) {
        const c = r[i], d = r[(i + 1) % n], den = (B.x - A.x) * (d[1] - c[1]) - (B.z - A.z) * (d[0] - c[0]);
        if (Math.abs(den) < 1e-12) continue;
        const u = ((c[0] - A.x) * (d[1] - c[1]) - (c[1] - A.z) * (d[0] - c[0])) / den, v = ((c[0] - A.x) * (B.z - A.z) - (c[1] - A.z) * (B.x - A.x)) / den;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return ob;
      }
    }
    return null;
  }
  const RAD = Math.PI / 180, log = [];

  function region(poly, used, scale) { poly.bb = G.bbox(poly.p); poly.used = used || []; poly.scale = scale || 1; return poly; }
  function junction(P, hit) { const tg = P.t[hit.e]; if (tg && tg.line) tg.line.junctions.push([hit.x, hit.z]); }

  /**
   * Cut P along a chord with a new generated street (or a party line). Returns [right, left] regions or null.
   * opt: { cls, width, name, party }
   */
  function cutStreet(P, A, B, interior, opt) {
    const tag = opt.party ? PARTY : { k: 'street', st: null, hw: opt.width / 2, line: { junctions: [] } };
    const parts = G.splitAt(P, A, B, interior, tag, tag);
    if (!parts) return null;
    if (!opt.party) {
      tag.st = addStreet({ name: opt.name || (opt.cls === 'main' ? 'street' : opt.cls === 'alley' ? 'alley' : 'lane'), cls: opt.cls, polyline: [[A.x, A.z], ...interior, [B.x, B.z]], width: opt.width, src: 'generated', conjectural: true, level: opt.level || 0 });
      tag.line.rec = tag.st;
    }
    junction(P, A); junction(P, B);
    return parts.map((r) => region(r, P.used, P.scale));
  }

  // ---------------------------------------------------------------------------------------------
  // 1. given streets
  // ---------------------------------------------------------------------------------------------
  /**
   * A given line. o: { id, pl, rec (street record or null), hw: number | number[] per segment | [right[], left[]],
   * kind: 'street' | 'open', ext: how far a free end may be continued (m), prio, extCls, extWidth }
   */
  function makeSpec(o) {
    const pl = o.pl.map((q) => [q[0], q[1]]), n = pl.length - 1, ch = [0];
    for (let i = 0; i < n; i++) ch.push(ch[i] + Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]));
    const line = { junctions: [], rec: o.rec || null };
    const hwOf = (side, i) => (typeof o.hw === 'number' ? o.hw : Array.isArray(o.hw[0]) ? o.hw[side][Math.min(i, o.hw[side].length - 1)] : o.hw[Math.min(i, o.hw.length - 1)]);
    const mk = (side) => { const a = []; for (let i = 0; i < n; i++) a.push({ k: o.kind || 'street', st: o.rec || null, hw: hwOf(side, i), line }); return a; };
    return { id: o.id, pl, ch, L: ch[n], laid: [], bb: G.bbox(pl), tagsR: mk(0), tagsL: mk(1), rec: o.rec || null, kind: o.kind || 'street', ext: o.ext ?? 90, prio: o.prio || 0, extCls: o.extCls || 'lane', extWidth: o.extWidth || 3.5, line, name: o.name || o.id };
  }
  /**
   * Ends that stop a few metres short of (or beyond) another given line are put exactly on it. The end moves
   * ALONG its own last segment (extended or trimmed), so the line itself does not turn.
   */
  function snapSpecEnds(specs, reach = 9) {
    for (const sp of specs) {
      for (const w of [0, 1]) {
        const idx = w ? sp.pl.length - 1 : 0, q = sp.pl[idx], nb = sp.pl[w ? idx - 1 : 1];
        let dx = q[0] - nb[0], dz = q[1] - nb[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        let best = null;
        for (const o of specs) {
          if (o === sp) continue;
          for (let i = 0; i + 1 < o.pl.length; i++) {
            const a = o.pl[i], b = o.pl[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
            if (Math.abs(den) < 1e-9) continue;
            const s = ((a[0] - q[0]) * ez - (a[1] - q[1]) * ex) / den, t = ((a[0] - q[0]) * dz - (a[1] - q[1]) * dx) / den;
            if (t < -1e-6 || t > 1 + 1e-6 || Math.abs(s) > reach || s < -(l - 1)) continue;
            if (!best || Math.abs(s) < Math.abs(best)) best = s;
          }
        }
        if (best !== null && Math.abs(best) > 1e-6) sp.pl[idx] = [q[0] + dx * best, q[1] + dz * best];
      }
      const n = sp.pl.length - 1; sp.ch = [0];
      for (let i = 0; i < n; i++) sp.ch.push(sp.ch[i] + Math.hypot(sp.pl[i + 1][0] - sp.pl[i][0], sp.pl[i + 1][1] - sp.pl[i][1]));
      sp.L = sp.ch[n]; sp.bb = G.bbox(sp.pl);
    }
  }
  function rayPolyline(o, dx, dz, pl) {
    let best = Infinity;
    for (let i = 0; i + 1 < pl.length; i++) {
      const a = pl[i], b = pl[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const s = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den, t = ((a[0] - o[0]) * dz - (a[1] - o[1]) * dx) / den;
      if (s > 0.5 && t >= 0 && t <= 1 && s < best) best = s;
    }
    return best;
  }
  function distToPolyline(q, pl) {
    let best = Infinity;
    for (let i = 0; i + 1 < pl.length; i++) {
      const a = pl[i], b = pl[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t);
      if (d < best) best = d;
    }
    return best;
  }
  function specPieces(P, specs) {
    const out = [];
    for (const sp of specs) {
      if (!G.bbOverlap(sp.bb, P.bb, 2)) continue;
      for (const pc of G.polylinePieces(P, sp.pl)) {
        let used = false;
        for (const u of P.used) if (u[0] === sp && Math.min(pc.s1, u[2]) - Math.max(pc.s0, u[1]) > 0.5) { used = true; break; }
        if (used) continue;
        const len = pc.s1 - pc.s0;
        if (len < (pc.A && pc.B ? 2 : 25)) continue;
        out.push({ sp, s0: pc.s0, s1: pc.s1, A: pc.A, B: pc.B, pts: pc.pts, ss: pc.ss, p0: pc.p0, p1: pc.p1, len });
      }
    }
    return out;
  }

  function resolveFixed(P, specs, out, depth = 0) {
    const pieces = depth > 120 ? [] : specPieces(P, specs);
    if (!pieces.length) { out.push(P); return; }
    pieces.sort((a, b) => b.sp.prio - a.sp.prio || b.len - a.len);
    const c = G.centroid(P.p), B = paramsAt(c[0], c[1]).B;
    const lineOf = (q) => [q.p0, ...q.pts, q.p1];
    for (const pc of pieces) {
      pc.ends = [0, 1].map((w) => {
        const hit = w ? pc.B : pc.A;
        if (hit) return { st: 'on', hit };
        const o = w ? pc.p1 : pc.p0, nb = w ? (pc.pts.length ? pc.pts[pc.pts.length - 1] : pc.p0) : (pc.pts.length ? pc.pts[0] : pc.p1);
        let dx = o[0] - nb[0], dz = o[1] - nb[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const bh = G.rayHit(P, o[0], o[1], dx, dz, 0.05), dB = bh ? bh.s : Infinity;
        let dP = Infinity, touching = false;
        for (const q of pieces) {
          if (q === pc) continue;
          const ql = lineOf(q);
          if (distToPolyline(o, ql) < 1.0) touching = true;
          dP = Math.min(dP, rayPolyline(o, dx, dz, ql));
        }
        const E = pc.sp.ext;
        if (touching || (dP < dB && dP <= E)) return { st: 'pending', o, dx, dz, bh };
        if (dB <= E) return { st: 'reach', hit: bh, o, dx, dz, bh };
        return { st: 'far', o, dx, dz, bh };
      });
    }
    const skip = (pc, why) => { log.push({ spec: pc.sp.id, s0: Math.round(pc.s0), s1: Math.round(pc.s1), why, at: [Math.round(pc.p0[0]), Math.round(pc.p0[1])] }); P.used = P.used.concat([[pc.sp, pc.s0, pc.s1]]); resolveFixed(P, specs, out, depth + 1); };
    let pick = pieces.find((pc) => pc.ends.every((e) => e.st === 'on' || e.st === 'reach'));
    if (!pick) {
      const far = pieces.find((pc) => pc.ends.some((e) => e.st === 'far'));
      if (far) {
        // a new cross street just beyond the free end
        const e = far.ends.find((q) => q.st === 'far');
        let dist = B * rng.range(0.5, 0.9);
        for (let tries = 0; tries < 3; tries++, dist += 0.5 * B) {
          const bx = e.o[0] + e.dx * dist, bz = e.o[1] + e.dz * dist;
          if (!G.pointIn(P.p, bx, bz) || G.nearestOnBoundary(P.p, bx, bz).d < 0.35 * B) break;
          // across the given street; where the boundary ahead runs nearly that way (the canal, a wall lane), parallel to it
          let qx = -e.dz, qz = e.dx;
          if (e.bh) {
            const a = P.p[e.bh.e], b = P.p[(e.bh.e + 1) % P.p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            let bx2 = (b[0] - a[0]) / l, bz2 = (b[1] - a[1]) / l; const dot = bx2 * qx + bz2 * qz;
            if (Math.abs(dot) > 0.82) { if (dot < 0) { bx2 = -bx2; bz2 = -bz2; } qx = bx2; qz = bz2; }
          }
          const ang = rng.gauss() * 2.5 * RAD, px = qx * Math.cos(ang) - qz * Math.sin(ang), pz = qx * Math.sin(ang) + qz * Math.cos(ang);
          const ch = G.chordOfLine(P, bx, bz, px, pz);
          if (!ch) break;
          if (blockedBy(ch.a, ch.b)) continue;
          let close = false;
          for (const q of pieces) {
            if (q === far) continue;
            const ql = lineOf(q), qx = q.p1[0] - q.p0[0], qz = q.p1[1] - q.p0[1], qn = Math.hypot(qx, qz) || 1;
            if (Math.abs((qx * px + qz * pz) / qn) < 0.8) continue;
            for (const m of ql) if (Math.abs((m[0] - bx) * e.dx + (m[1] - bz) * e.dz) < 0.42 * B) { close = true; break; }
            if (close) break;
          }
          if (close) continue;
          const len = ch.b.s - ch.a.s, main = len > 260;
          const parts = cutStreet(P, ch.a, ch.b, [], { cls: main ? 'main' : 'lane', width: main ? rng.range(5, 7.5) : rng.range(3, 4.8), level: 1 });
          if (!parts) break;
          for (const r of parts) resolveFixed(r, specs, out, depth + 1);
          return;
        }
      }
      // nothing else works: carry the first piece through to the boundary, whatever the distance
      pick = pieces.find((pc) => pc.ends.every((e) => e.st === 'on' || e.bh));
      if (!pick) return skip(pieces[0], 'no way out');
      for (const e of pick.ends) if (e.st !== 'on') { e.st = 'reach'; e.hit = e.bh; }
    }
    // lay the piece in as a chord
    const sp = pick.sp, e0 = pick.ends[0], e1 = pick.ends[1];
    const A = e0.hit, Bh = e1.hit;
    const interior = [], segS = [];           // chainage on the spec at each chord vertex (null on continuations)
    const vs = [null];
    if (e0.st === 'reach') { interior.push(pick.p0); vs.push(pick.s0); } else vs[0] = pick.s0;
    for (let i = 0; i < pick.pts.length; i++) { interior.push(pick.pts[i]); vs.push(pick.ss[i]); }
    if (e1.st === 'reach') { interior.push(pick.p1); vs.push(pick.s1); vs.push(null); } else vs.push(pick.s1);
    const tagsR = [], tagsL = [];
    const contTag = (from, to) => {
      // continuation of a given street beyond its excavated / attested end: its own record
      const line = { junctions: [] };
      const tag = { k: sp.kind, st: null, hw: sp.kind === 'street' ? Math.max(1.2, sp.extWidth / 2) : sp.tagsR[0].hw, line };
      if (sp.kind === 'street') { tag.st = addStreet({ name: (sp.name || 'street') + ' (continuation)', cls: sp.extCls, polyline: [from, to], width: sp.extWidth, src: 'derived', conjectural: true, level: 2 }); line.rec = tag.st; }
      return tag;
    };
    for (let k = 0; k + 1 < vs.length; k++) {
      if (vs[k] === null || vs[k + 1] === null) {
        const from = k === 0 ? [A.x, A.z] : interior[k - 1], to = k + 1 === vs.length - 1 ? [Bh.x, Bh.z] : interior[k];
        const t = contTag(from, to); tagsR.push(t); tagsL.push(t); segS.push(null);
      } else {
        const m = (vs[k] + vs[k + 1]) / 2; let i = 0; while (i + 2 < sp.ch.length && sp.ch[i + 1] < m) i++;
        tagsR.push(sp.tagsR[i]); tagsL.push(sp.tagsL[i]); segS.push(i);
      }
    }
    const parts = G.splitAt(P, A, Bh, interior, tagsR, tagsL);
    if (!parts) return skip(pick, 'split failed');
    junction(P, A); junction(P, Bh);
    sp.laid.push([pick.s0, pick.s1]);
    const used = P.used.concat([[sp, pick.s0, pick.s1]]);
    for (const r of parts) resolveFixed(region(r, used, P.scale), specs, out, depth + 1);
  }

  // ---------------------------------------------------------------------------------------------
  // 2. generated streets
  // ---------------------------------------------------------------------------------------------
  /** Move a chord end onto a junction that already exists on the street it meets, or clear of it. */
  function snapEnd(P, hit, B, pc) {
    const tg = P.t[hit.e];
    if (!tg || !tg.line || !tg.line.junctions.length) return hit;
    const n = P.p.length, a = P.p[hit.e], b = P.p[(hit.e + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], le = Math.hypot(ex, ez);
    if (le < 14) return hit;
    const sh = hit.t * le; let best = null, bd = Infinity;
    for (const j of tg.line.junctions) {
      const t = ((j[0] - a[0]) * ex + (j[1] - a[1]) * ez) / (le * le);
      if (t < 0.02 || t > 0.98) continue;
      if (Math.hypot(j[0] - a[0] - ex * t, j[1] - a[1] - ez * t) > 0.8) continue;
      const d = Math.abs(t * le - sh);
      if (d < bd) { bd = d; best = t * le; }
    }
    if (best === null) return hit;
    let s;
    if (bd <= 0.42 * B && rng.next() < pc) s = best + Math.max(-2.5, Math.min(2.5, rng.gauss()));
    else if (bd < 9) s = best + (sh >= best ? 1 : -1) * rng.range(10, 16);
    else return hit;
    s = Math.max(4, Math.min(le - 4, s));
    const t = s / le;
    return { e: hit.e, t, x: a[0] + ex * t, z: a[1] + ez * t, s: hit.s };
  }
  /** A street does not come out within a few metres of a corner: it would leave a splinter and crowd the crossing. */
  function offCorner(P, hit, min = 9) {
    const n = P.p.length, a = P.p[hit.e], b = P.p[(hit.e + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], le = Math.hypot(ex, ez);
    if (le < 3 * min) return hit;
    const s = hit.t * le, s2 = Math.max(min, Math.min(le - min, s));
    if (s2 === s) return hit;
    const t = s2 / le;
    return { e: hit.e, t, x: a[0] + ex * t, z: a[1] + ez * t, s: hit.s };
  }
  const insideSeg = (P, A, B) => {
    for (const f of [0.2, 0.5, 0.8]) if (!G.pointIn(P.p, A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f)) return false;
    return true;
  };

  /**
   * Cut a region into blocks. opt: { minor: true } = only short streets (suburb patches, villages).
   * Final cells are pushed to `cells`.
   */
  function gridSplit(P, depth, cells, opt = {}) {
    const pts = P.p, A = G.area(pts), c = G.centroid(pts), prm = opt.prm || paramsAt(c[0], c[1]);
    const B = prm.B * (P.scale || 1);
    let [ux, uz] = G.longestEdgeDir(pts);
    let ex = G.extents(pts, ux, uz);
    if (ex.v1 - ex.v0 > ex.u1 - ex.u0) { [ux, uz] = [-uz, ux]; ex = G.extents(pts, ux, uz); }
    const Ll = ex.u1 - ex.u0, Ls = ex.v1 - ex.v0;
    if (depth > 18 || A < 0.45 * B * B || (Ll <= 1.42 * B && A <= 1.9 * B * B)) { cells.push(P); return; }
    const coarse = !opt.minor && Ls > 2.4 * B && Ll > 3.3 * B;
    const unit = coarse ? B * rng.range(2.0, 3.5) : B;
    const n = Math.max(2, Math.round(Ll / unit));
    const w = []; let sum = 0;
    for (let i = 0; i < n; i++) { const v = Math.exp(rng.gauss() * (coarse ? prm.sd + 0.12 : prm.sd)); w.push(v); sum += v; }
    const vx = -uz, vz = ux;                     // the cross axis: streets of this cut run along it
    const capTilt = (sign) => {
      const h = G.rayHit(P, c[0], c[1], ux * sign, uz * sign);
      if (!h) return 0;
      const a = pts[h.e], b = pts[(h.e + 1) % pts.length];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (dx * vx + dz * vz < 0) { dx = -dx; dz = -dz; }
      const ang = Math.atan2(vx * dz - vz * dx, vx * dx + vz * dz) / RAD;
      return Math.abs(ang) > 38 ? 0 : Math.max(-24, Math.min(24, ang));
    };
    const t0 = capTilt(-1), t1 = capTilt(1), vm = (ex.v0 + ex.v1) / 2;
    let rest = P, acc = 0, cuts = 0, uPrev = ex.u0;
    for (let k = 0; k < n - 1; k++) {
      acc += w[k]; const f = acc / sum, u = ex.u0 + f * Ll;
      let uCut = u;
      const tau = (t0 + (t1 - t0) * f + rng.gauss() * prm.tilt + (coarse ? prm.skew || 0 : 0)) * RAD;
      const dx = vx * Math.cos(tau) - vz * Math.sin(tau), dz = vx * Math.sin(tau) + vz * Math.cos(tau);
      const ch = G.chordOfLine(rest, ux * u + vx * vm, uz * u + vz * vm, dx, dz);
      if (!ch || ch.b.s - ch.a.s < 6) continue;
      let Ah = offCorner(rest, snapEnd(rest, ch.a, B, prm.pc)), Bh = offCorner(rest, snapEnd(rest, ch.b, B, prm.pc));
      if ((Ah !== ch.a || Bh !== ch.b) && (Ah.e === Bh.e || !insideSeg(rest, Ah, Bh))) { Ah = ch.a; Bh = ch.b; }
      const ob = blockedBy(Ah, Bh);
      if (ob) {
        // pass beside it: a straight street along one side of the obstacle, if that leaves room for a block
        const oe = G.extents(ob.ring, ux, uz), lo = uPrev + 0.42 * B, hi = ex.u1 - 0.42 * B;
        const cand = (Math.abs(u - oe.u0) < Math.abs(u - oe.u1) ? [oe.u0 - 2.2, oe.u1 + 2.2] : [oe.u1 + 2.2, oe.u0 - 2.2]).filter((q) => q > lo && q < hi);
        let c2 = null;
        for (const side of cand) {
          const c = G.chordOfLine(rest, ux * side + vx * vm, uz * side + vz * vm, vx, vz);
          if (c && c.b.s - c.a.s >= 6 && !blockedBy(c.a, c.b)) { c2 = c; uCut = side; break; }
        }
        if (!c2) continue;
        Ah = c2.a; Bh = c2.b;
      }
      const len = Math.hypot(Bh.x - Ah.x, Bh.z - Ah.z);
      const interior = [];
      if (len > 100 && rng.next() < prm.bend + (len > 260 ? 0.3 : 0)) {
        const kinks = len > 420 ? 3 : len > 230 ? 2 : 1, nx = -(Bh.z - Ah.z) / len, nz = (Bh.x - Ah.x) / len, cap = len > 260 ? 9 : 5;
        for (let q = 0; q < kinks; q++) {
          const g = (q + rng.range(0.35, 0.65)) / kinks, off = Math.max(-cap, Math.min(cap, rng.gauss() * 0.016 * len));
          const m = [Ah.x + (Bh.x - Ah.x) * g + nx * off, Ah.z + (Bh.z - Ah.z) * g + nz * off];
          if (G.pointIn(rest.p, m[0], m[1]) && G.nearestOnBoundary(rest.p, m[0], m[1]).d > 12) interior.push(m);
        }
      }
      let cls = 'lane', width, level = 0;
      if (coarse) { level = 2; if (len > 240) { cls = 'main'; width = rng.range(5.5, 8); } else width = rng.range(4, 5.5); }
      else if (len > 140) { level = 1; width = rng.range(Math.max(prm.lane[0], 2.8), prm.lane[1] + 0.4); }
      else width = rng.range(prm.lane[0], prm.lane[1]);
      const parts = cutStreet(rest, Ah, Bh, interior, { cls, width, level });
      if (!parts) continue;
      // parts[0] lies before the cut (lower u), parts[1] is what remains
      if (G.area(parts[0].p) < 0.2 * B * Math.min(B, Ls)) { /* a sliver: accept it as it is */ }
      cuts++; uPrev = uCut;
      gridSplit(parts[0], depth + 1, cells, opt);
      rest = parts[1];
    }
    if (!cuts) { cells.push(P); return; }
    gridSplit(rest, depth + 1, cells, opt);
  }

  return { region, makeSpec, snapSpecEnds, resolveFixed, gridSplit, cutStreet, log };
}
