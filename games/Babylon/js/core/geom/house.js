// geom/house.js — the courtyard house shell (SPEC 3.15, GAPS G02) in three levels of detail, and the fast path
// that emits every house of ctx.layout into tile-binned writers (21,000 unique houses in about a second).
//   full   every roof part at its own level (layout.roofParts: main roof, raised main-room range, wings), a real
//          parapet with thickness round every part, sunk roof slabs, court voids with kerbs, inward court walls,
//          court floors, a recessed doorway with lintel and door leaf, the stepped (saw-tooth) street fronts of
//          layout.facade above a smooth plinth, optional upper blocks, a court stair with true risers, drain spouts
//   shell  the same parts and levels with parapets, roofs, court voids and floors; plain plot outline, no door
//   box    walls and flat tops per roof part with the courts baked in as dark patches
// OWNER: geometry engineer. Public as ctx.geom.house / houseInto / houseSpec / addHouses; see docs/geom.md.
import * as M from '../mathx.js';
import { MeshWriter, toRGB } from './mesh.js';

const DEF = {
  skirt: 1.0, parapetThickness: 0.35, kerb: 0.3, kerbThickness: 0.3, floorLift: 0,
  doorWidth: 1.1, doorHeight: 2.0, doorRecess: 0.35, lintel: 0.22,
};
const WHITE = [1, 1, 1];

export function makeHouse(ctx, kit) {
  const scratch = [];

  // vertical quad on the plan segment (ax, az) -> (bx, bz) from y0 to y1, facing the left (out = true for a
  // clockwise ring) or the right of travel
  function vq(w, ax, az, bx, bz, y0, y1, left) {
    if (y1 - y0 < 1e-6) return -1;
    return left ? w.quad(bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz) : w.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
  }
  function capInto(w, ring, holes, y, up) {
    scratch.length = 0; const starts = [];
    for (const p of ring) scratch.push(p[0], p[1]);
    for (const h of holes) { starts.push(scratch.length / 2); for (const p of h) scratch.push(p[0], p[1]); }
    w.polygon(scratch, starts, y, up);
  }
  const outset = (ring, cw, k) => M.offsetPolyline(ring, cw ? -k : k, true);     // k > 0 grows the ring

  /**
   * Inset an open ring by a distance PER EDGE (d[k] for the edge ring[k] -> ring[k + 1]). Returns { A, B, ring }:
   * A[k] / B[k] = the inset points at the start / end of edge k, ring = the inset outline. Corners are mitred;
   * where two edges run straight on with different distances (a parapet ending against a higher part) the
   * outline steps: B[k - 1] and A[k] differ.
   */
  function insetVar(ring, cw, d) {
    const n = ring.length, A = new Array(n), B = new Array(n);
    for (let k = 0; k < n; k++) {
      const P = ring[k], Q = ring[(k + n - 1) % n], N = ring[(k + 1) % n];
      let ux = P[0] - Q[0], uz = P[1] - Q[1], vx = N[0] - P[0], vz = N[1] - P[1];
      const ul = Math.hypot(ux, uz) || 1, vl = Math.hypot(vx, vz) || 1; ux /= ul; uz /= ul; vx /= vl; vz /= vl;
      // inward normals (a clockwise ring has its interior on the right of travel)
      const n1x = cw ? -uz : uz, n1z = cw ? ux : -ux, n2x = cw ? -vz : vz, n2z = cw ? vx : -vx, d1 = d[(k + n - 1) % n], d2 = d[k];
      const det = n1x * n2z - n1z * n2x, straight = Math.abs(det) < 0.35 && n1x * n2x + n1z * n2z > 0;
      if (straight) {
        let nx = n1x + n2x, nz = n1z + n2z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const c = Math.max(0.5, nx * n1x + nz * n1z), e1 = Math.abs(d1 - d2) < 0.02 ? Math.max(d1, d2) : d1, e2 = Math.abs(d1 - d2) < 0.02 ? e1 : d2;
        B[(k + n - 1) % n] = [P[0] + (nx * e1) / c, P[1] + (nz * e1) / c]; A[k] = [P[0] + (nx * e2) / c, P[1] + (nz * e2) / c];
      } else {
        let x, z;
        if (Math.abs(det) < 0.05) { const dd = Math.max(d1, d2); x = n2x * dd; z = n2z * dd; }
        else { x = (d1 * n2z - d2 * n1z) / det; z = (n1x * d2 - n2x * d1) / det; const l = Math.hypot(x, z), lim = 3 * Math.max(d1, d2) + 0.01; if (l > lim) { x *= lim / l; z *= lim / l; } }
        B[(k + n - 1) % n] = A[k] = [P[0] + x, P[1] + z];
      }
    }
    // an edge of the inset ring that came out reversed (a short edge between two insets) collapses to a point
    for (let k = 0; k < n; k++) {
      const a = A[k], c = B[k], p = ring[k], q = ring[(k + 1) % n];
      if ((c[0] - a[0]) * (q[0] - p[0]) + (c[1] - a[1]) * (q[1] - p[1]) < 0) { const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; if (B[(k + n - 1) % n] === a) B[(k + n - 1) % n] = m; if (A[(k + 1) % n] === c) A[(k + 1) % n] = m; A[k] = m; B[k] = m; }
    }
    const out = [];
    const push = (t) => { const w = out[out.length - 1]; if (!w || Math.hypot(t[0] - w[0], t[1] - w[1]) > 1e-4) out.push(t); };
    for (let k = 0; k < n; k++) { push(A[k]); push(B[k]); }
    if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
    return { A, B, ring: out };
  }
  const crosses = (r) => {                               // does a closed outline cut itself?
    const n = r.length, side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = r[i], b = r[(i + 1) % n], c = r[j], d = r[(j + 1) % n];
      if (side(a, b, c) * side(a, b, d) < -1e-9 && side(c, d, a) * side(c, d, b) < -1e-9) return true;
    }
    return false;
  };
  const insetOK = (ring, inn) => {
    if (inn.ring.length < 3 || crosses(inn.ring)) return false;
    const a0 = M.polygonArea(ring), a1 = M.polygonArea(inn.ring);
    if (a0 * a1 <= 0 || Math.abs(a1) < 0.12 * Math.abs(a0)) return false;
    for (const p of inn.ring) if (M.signedDistToPolygon(p[0], p[1], ring) > 0.02) return false;
    return true;
  };

  // ------------------------------------------------------------------------------------------ plan ----
  // Everything about one house that the three levels of detail share: its roof parts with classified edges
  // (street / party wall of the plot, wall above a lower part, edge under a higher part), the stepped street
  // fronts, the parapet insets and where the door is.
  const plans = new WeakMap();
  function planOf(spec) {
    let plan = plans.get(spec);
    if (plan) return plan;
    const o = M.openRing(spec.footprint), n0 = o.length, cw = M.polygonArea(o) > 0;
    const g = spec.groundLevel, tp = spec.parapetThickness ?? DEF.parapetThickness;
    plan = { o, n0, cw, g, tp, parts: [], loose: [], door: null, PL: null, ok: n0 >= 3 };
    if (!plan.ok) { plans.set(spec, plan); return plan; }
    // footprint edges and their stepped lines
    const E = [];
    for (let e = 0; e < n0; e++) {
      const a = o[e], b = o[(e + 1) % n0], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      E.push({ a, b, len, dx, dz, inx: cw ? -dz : dz, inz: cw ? dx : -dx, line: null, depth: 0 });
    }
    const dpt = spec.doorSpec ? [spec.doorSpec.x, spec.doorSpec.z] : spec.door || null;
    let dW = ((spec.doorSpec && spec.doorSpec.width) || spec.doorWidth || DEF.doorWidth) / 2;
    const dH = (spec.doorSpec && spec.doorSpec.height) || spec.doorHeight || DEF.doorHeight;
    if (spec.facade) {
      for (const f of spec.facade) if (f && f.line && f.line.length > 2 && E[f.edge]) E[f.edge].line = f.line;
    } else if (spec.teeth) {
      // generate the teeth here, with a flat panel round the door
      const t = spec.teeth;
      let de = -1, dd = Infinity, dt = 0;
      if (dpt) for (let e = 0; e < n0; e++) { const r = M.distToSegment(dpt[0], dpt[1], E[e].a[0], E[e].a[1], E[e].b[0], E[e].b[1]); if (r[0] < dd) { dd = r[0]; de = e; dt = r[1]; } }
      for (let e = 0; e < n0; e++) {
        const ed = E[e], want = t.edges === 'all' || (t.edges === 'street' || t.edges === undefined ? e === de : Array.isArray(t.edges) && t.edges.includes(e));
        if (!want) continue;
        const at = (s) => [ed.a[0] + ed.dx * s, ed.a[1] + ed.dz * s], teeth = (s0, s1) => (s1 - s0 > 1.2 ? kit.sawToothLine(at(s0), at(s1), t.gridDeg ?? spec.rotationDeg ?? 0, [ed.inx, ed.inz], { tooth: t.tooth ?? 1.5 }) : [at(s0), at(s1)]);
        let line;
        if (e === de && dd < 1.5 && ed.len > 2 * dW + 1.6) {
          const sd = M.clamp(dt * ed.len, dW + 0.8, ed.len - dW - 0.8), l0 = teeth(0, sd - dW - 0.35), l1 = teeth(sd + dW + 0.35, ed.len);
          line = [...l0, ...l1];
        } else line = teeth(0, ed.len);
        if (line.length > 2) ed.line = line;
      }
    }
    for (const ed of E) if (ed.line) for (const p of ed.line) ed.depth = Math.max(ed.depth, (p[0] - ed.a[0]) * ed.inx + (p[1] - ed.a[1]) * ed.inz);
    const anyTeeth = E.some((ed) => ed.line);
    if (anyTeeth) plan.PL = spec.plinthLevel ?? g + ((spec.teeth && spec.teeth.plinth) ?? 0.6);

    // roof parts: rings snapped to the corners of the plot and refined so that parts share whole edges
    const src = spec.parts && spec.parts.length ? spec.parts : [{ polygon: spec.footprint, holes: spec.courts || [], level: spec.roofLevel, parapet: spec.parapet ?? 0.8 }];
    const SNAP = 0.3;
    for (const q of src) {
      let ring = M.openRing(q.polygon).map((v) => { for (const c of o) if (Math.hypot(v[0] - c[0], v[1] - c[1]) < SNAP) return c; return v; });
      ring = ring.filter((v, i) => { const w = ring[(i + ring.length - 1) % ring.length]; return Math.hypot(v[0] - w[0], v[1] - w[1]) > 1e-4; });
      if (ring.length < 3 || Math.abs(M.polygonArea(ring)) < 1) continue;
      const L = q.level, par = q.parapet ?? spec.parapet ?? 0.8;
      plan.parts.push({ ring, cw: M.polygonArea(ring) > 0, L, T: L + par, par, holes: (q.holes || []).filter((c) => c && c.length >= 3).map((c) => M.openRing(c)), edges: [], inner: null, innerShell: null, tk: 0 });
    }
    const np = plan.parts.length;
    if (np > 1) for (let pi = 0; pi < np; pi++) {
      // a corner of another part (or of the plot) that lies on an edge of this part becomes a vertex of it
      const P = plan.parts[pi], cand = [...o];
      for (let j = 0; j < np; j++) if (j !== pi) for (const v of plan.parts[j].ring) cand.push(v);
      const out = [];
      for (let k = 0; k < P.ring.length; k++) {
        const a = P.ring[k], b = P.ring[(k + 1) % P.ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ins = [];
        out.push(a);
        if (len < 0.2) continue;
        for (const v of cand) { const r = M.distToSegment(v[0], v[1], a[0], a[1], b[0], b[1]); if (r[0] < 0.03 && r[1] * len > 0.05 && (1 - r[1]) * len > 0.05 && !ins.some((w) => Math.abs(w[0] - r[1]) * len < 0.05)) ins.push([r[1], v]); }
        ins.sort((x, y) => x[0] - y[0]);
        for (const w of ins) out.push(w[1]);
      }
      P.ring = out;
    }
    for (let pi = 0; pi < np; pi++) {
      const P = plan.parts[pi], R = P.ring, m = R.length, dFull = new Array(m), dShell = new Array(m);
      for (let k = 0; k < m; k++) {
        const p = R[k], q = R[(k + 1) % m], ed = { p, q, kind: 0, e: -1, line: null, dep: null, depth: 0, Lnb: 0, Tnb: 0, nb: null, cut: null, cutShell: null };
        // on which edge of the plot does it lie?
        if (np === 1 && P.cw === cw && m === n0) ed.e = k;
        else for (let e = 0; e < n0 && ed.e < 0; e++) {
          const f = E[e];
          if (M.distToSegment(p[0], p[1], f.a[0], f.a[1], f.b[0], f.b[1])[0] < 0.03 && M.distToSegment(q[0], q[1], f.a[0], f.a[1], f.b[0], f.b[1])[0] < 0.03) ed.e = e;
        }
        // how close does a court come to this edge? (a court may lie 0.7 m behind the street wall)
        let clear = Infinity;
        for (const c of P.holes) for (const v of c) clear = Math.min(clear, M.distToSegment(v[0], v[1], p[0], p[1], q[0], q[1])[0]);
        ed.clear = clear;
        if (ed.e >= 0) {
          const f = E[ed.e];
          if (f.line) {
            const sp = (p[0] - f.a[0]) * f.dx + (p[1] - f.a[1]) * f.dz, sq = (q[0] - f.a[0]) * f.dx + (q[1] - f.a[1]) * f.dz, lo = Math.min(sp, sq), hi = Math.max(sp, sq);
            if (hi - lo > 0.6) {
              const mid = [];
              for (let j = 1; j < f.line.length - 1; j++) { const t = f.line[j], sj = (t[0] - f.a[0]) * f.dx + (t[1] - f.a[1]) * f.dz; if (sj > lo + 0.04 && sj < hi - 0.04) mid.push(t); }
              if (sq < sp) mid.reverse();
              if (mid.length) {
                ed.line = [p, ...mid, q];
                ed.dep = ed.line.map((t) => (t[0] - f.a[0]) * f.inx + (t[1] - f.a[1]) * f.inz);
                for (const dj of ed.dep) ed.depth = Math.max(ed.depth, dj);
                if (tp + ed.depth > clear - 0.2) { ed.line = null; ed.dep = null; ed.depth = 0; }      // no room for teeth in front of the court
              }
            }
          }
          dFull[k] = tp + ed.depth; dShell[k] = tp;
        } else {
          // an edge inside the plot: which part lies across it?
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ox = (P.cw ? q[1] - p[1] : p[1] - q[1]) / len, oz = (P.cw ? p[0] - q[0] : q[0] - p[0]) / len;
          const sx = (p[0] + q[0]) / 2 + ox * 0.25, sz = (p[1] + q[1]) / 2 + oz * 0.25;
          let nb = null;
          for (let j = 0; j < np && !nb; j++) if (j !== pi && M.pointInPolygon(sx, sz, plan.parts[j].ring)) nb = plan.parts[j];
          if (!nb) { ed.kind = 0; dFull[k] = dShell[k] = tp; }                    // nothing there: an outside wall
          else if (nb.L < P.L - 0.05) { ed.kind = 1; ed.nb = nb; ed.Lnb = nb.L; ed.Tnb = nb.T; dFull[k] = dShell[k] = tp; }
          else { ed.kind = 2; ed.nb = nb; ed.level = Math.abs(nb.L - P.L) <= 0.05; dFull[k] = dShell[k] = 0; }
        }
        if (ed.kind !== 2) { const lim = Math.max(0.1, clear - 0.2); if (dFull[k] > lim) dFull[k] = lim; if (dShell[k] > lim) dShell[k] = lim; }
        P.edges.push(ed);
      }
      // a tooth that would cut into the parapet of the neighbouring wall at a corner of the plot is left out (flat there)
      for (let k = 0; k < m; k++) {
        const ed = P.edges[k];
        if (!ed.line) continue;
        const len = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]) || 1, dx = (ed.q[0] - ed.p[0]) / len, dz = (ed.q[1] - ed.p[1]) / len;
        for (const kn of [(k + m - 1) % m, (k + 1) % m]) {
          const nb = P.edges[kn], nl = Math.hypot(nb.q[0] - nb.p[0], nb.q[1] - nb.p[1]) || 1, nx = (P.cw ? -(nb.q[1] - nb.p[1]) : nb.q[1] - nb.p[1]) / nl, nz = (P.cw ? nb.q[0] - nb.p[0] : -(nb.q[0] - nb.p[0])) / nl;
          for (let j = 1; j < ed.line.length - 1; j++) {
            const t = ed.line[j];
            if (ed.dep[j] > 0.01 && (t[0] - nb.p[0]) * nx + (t[1] - nb.p[1]) * nz < dFull[kn] + 0.03) { const sj = (t[0] - ed.p[0]) * dx + (t[1] - ed.p[1]) * dz; ed.line[j] = [ed.p[0] + dx * sj, ed.p[1] + dz * sj]; ed.dep[j] = 0; }
          }
        }
        ed.depth = Math.max(0, ...ed.dep); dFull[k] = Math.min(tp + ed.depth, Math.max(0.1, ed.clear - 0.2));
      }
      const inset = (dd) => { const inn = insetVar(R, P.cw, dd); return insetOK(R, inn) ? inn : null; };
      P.inner = inset(dFull);
      if (!P.inner && P.edges.some((ed) => ed.line)) {
        // no room for the deep parapet of a stepped front: plain walls on the plot line instead
        for (let k = 0; k < m; k++) { const ed = P.edges[k]; if (ed.line) { ed.line = null; ed.dep = null; ed.depth = 0; dFull[k] = Math.min(tp, Math.max(0.1, ed.clear - 0.2)); } }
        P.inner = inset(dFull);
      }
      P.innerShell = inset(dShell);
      P.dFull = dFull; P.dShell = dShell;
      // the court kerb: as thick as the room between the court and the parapets (and the other courts) allows
      let room = Infinity;
      for (let k = 0; k < m; k++) room = Math.min(room, P.edges[k].clear - dFull[k] - 0.06);
      for (let a = 0; a < P.holes.length; a++) for (let b = a + 1; b < P.holes.length; b++) for (const v of P.holes[a]) room = Math.min(room, 0.45 * Math.abs(M.signedDistToPolygon(v[0], v[1], P.holes[b])));
      P.tk = room / 1.45;                 // the mitred corner of the kerb reaches 1.4 x its thickness
    }
    plan.loose = (spec.courts || []).filter((c) => c && c.length >= 3).map((c) => M.openRing(c)).filter((c) => { const cc = M.polygonCentroid(c); return !plan.parts.some((P) => P.holes.some((hh) => M.pointInPolygon(cc[0], cc[1], hh))); });
    // where a part stands above a lower one: the lower part's parapet runs into this wall. The wall starts on the
    // lower ROOF between the two points where that parapet's inner line meets it, and on the parapet TOP beside them
    for (const P of plan.parts) for (const ed of P.edges) {
      if (ed.kind !== 1) continue;
      const nb = ed.nb, len = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]) || 1, dx = (ed.q[0] - ed.p[0]) / len, dz = (ed.q[1] - ed.p[1]) / len;
      const kk = nb.edges.findIndex((e2) => Math.hypot(e2.q[0] - ed.p[0], e2.q[1] - ed.p[1]) < 0.03 && Math.hypot(e2.p[0] - ed.q[0], e2.p[1] - ed.q[1]) < 0.03);
      const cutOf = (inner) => {
        if (kk < 0) return null;
        if (!inner) return 'top';                                                  // the lower part has a flat top
        const a = inner.B[kk], c = inner.A[kk], sa = (a[0] - ed.p[0]) * dx + (a[1] - ed.p[1]) * dz, sc = (c[0] - ed.p[0]) * dx + (c[1] - ed.p[1]) * dz;
        return sa >= -0.01 && sc <= len + 0.01 && sc > sa ? [Math.max(0, sa), Math.min(len, sc)] : null;
      };
      ed.cut = cutOf(nb.inner); ed.cutShell = cutOf(nb.innerShell);
    }
    // the door: the outline segment nearest to the door point (on a stepped front: the flat panel that holds it)
    if (dpt) {
      const along = spec.doorSpec && spec.doorSpec.along;
      let best = null, bd = 1.6;
      for (let pi = 0; pi < plan.parts.length; pi++) for (let k = 0; k < plan.parts[pi].edges.length; k++) {
        const ed = plan.parts[pi].edges[k];
        if (ed.kind !== 0) continue;
        const pts = ed.line || [ed.p, ed.q];
        for (let j = 0; j + 1 < pts.length; j++) {
          const a = pts[j], b = pts[j + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 1.0) continue;
          if (along && Math.abs(((b[0] - a[0]) * along[0] + (b[1] - a[1]) * along[1]) / len) < 0.85) continue;
          const r = M.distToSegment(dpt[0], dpt[1], a[0], a[1], b[0], b[1]);
          if (r[0] < bd) { bd = r[0]; best = { part: pi, edge: k, seg: j, s: r[1] * len, len }; }
        }
      }
      if (best) {
        dW = Math.min(dW, (best.len - 0.3) / 2);
        if (dW >= 0.3) { best.dW = dW; best.dH = dH; best.s = M.clamp(best.s, dW + 0.15, best.len - dW - 0.15); plan.door = best; }
      }
    }
    plans.set(spec, plan);
    return plan;
  }

  /**
   * Write one house into writers. target = { walls, roof?, floor?, trim? } (MeshWriters). Without `roof` the roof is
   * written into `walls` in the absolute colour style.roofAbs; without `floor` the court floor goes to the roof
   * writer (tinted style.floorColor); without `trim` the door leaf, lintel and spouts go to `walls` in style.trimColor.
   * spec: a ctx.layout house record ({ footprint, courts, groundLevel, roofLevel, parapet, door, rotationDeg, seed })
   *   plus optional members, all in metres (geom.houseSpec(record) fills the first five from ctx.layout):
   *   parts: layout.roofParts(house)          [{ polygon, holes, level, parapet }] roof parts at their own levels (default: one)
   *   facade: layout.facade(house)            stepped street fronts (the `line` of every edge) above the plinth
   *   doorSpec: { x, z, width, height, along } the door of layout.facade(house)[house.doorSide] (default: spec.door, 1.1 x 2.0 m)
   *   plinthLevel                             datum level of the top of the smooth plinth under stepped fronts
   *   base                                    datum level of the foot of the outer walls (default groundLevel - skirt)
   *   upper: [{ ring, height, parapet: 0 }]   blocks standing on the roof (keep them 0.4 m inside the parapet)
   *   courtStair: true                        a flight with true risers along the longest wall of the first court
   *   teeth: { gridDeg, edges: 'street' | 'all' | number[], tooth: 1.5, plinth: 0.6 }   saw-teeth generated here (when there is no `facade`)
   *   spouts: n                               drain spouts through the parapet
   *   doorWidth, doorHeight, skirt, parapetThickness, kerb (height of the court kerb), ...
   * style: { wallColor, parapetColor, roofColor, floorColor, trimColor, roofAbs } linear [r, g, b] multipliers.
   * lod: 'full' | 'shell' | 'box'.
   */
  function houseInto(target, spec, style = {}, lod = 'full') {
    const plan = planOf(spec);
    if (!plan.ok || !plan.parts.length) return;
    const W = target.walls, R = target.roof || W, F = target.floor || R, T = target.trim || W;
    const g = plan.g;
    const wallC = style.wallColor || WHITE, parC = style.parapetColor || wallC, roofC = target.roof ? style.roofColor || WHITE : style.roofAbs || style.roofColor || WHITE;
    const floorC = style.floorColor || (target.floor ? WHITE : [roofC[0] * 0.6, roofC[1] * 0.58, roofC[2] * 0.55]);
    const wcol = () => W.color(wallC[0], wallC[1], wallC[2]), pcol = () => W.color(parC[0], parC[1], parC[2]);
    const base = spec.base ?? g - (spec.skirt ?? DEF.skirt), lift = spec.floorLift ?? DEF.floorLift;

    if (lod === 'box') {
      const dk = style.courtAbs || [roofC[0] * 0.3, roofC[1] * 0.29, roofC[2] * 0.3];
      for (const P of plan.parts) {
        wcol();
        for (const ed of P.edges) { if (ed.kind === 0) vq(W, ed.p[0], ed.p[1], ed.q[0], ed.q[1], base, P.T, P.cw); else if (ed.kind === 1) vq(W, ed.p[0], ed.p[1], ed.q[0], ed.q[1], ed.Tnb, P.T, P.cw); }
        R.color(roofC[0], roofC[1], roofC[2]); capInto(R, P.ring, P.holes, P.T, true);
        R.color(dk[0], dk[1], dk[2]);
        for (const c of P.holes) capInto(R, c, [], P.T, true);
      }
      return;
    }
    const full = lod === 'full', PL = full && plan.PL !== null ? plan.PL : null;
    const trimC = style.trimColor || [0.16, 0.1, 0.06], door = full ? plan.door : null;
    const kerb = full ? spec.kerb ?? DEF.kerb : 0, tk = spec.kerbThickness ?? DEF.kerbThickness;

    for (let pi = 0; pi < plan.parts.length; pi++) {
      const P = plan.parts[pi], left = P.cw, L = P.L, Tp = P.T, m = P.edges.length;
      const inner = full ? P.inner : P.innerShell, d = full ? P.dFull : P.dShell;
      for (let k = 0; k < m; k++) {
        const ed = P.edges[k], p = ed.p, q = ed.q;
        if (ed.kind === 2) {
          // under a higher part (or beside one of the same level): no wall. The parapets of the two neighbouring edges end
          // here: against the higher wall, or with an end face where the roof goes on at the same level
          if (inner) {
            const a = inner.A[k], c = inner.B[k], a2 = inner.A[(k + 1) % m];
            pcol();
            if (ed.level) { vq(W, p[0], p[1], a[0], a[1], L, Tp, left); vq(W, c[0], c[1], q[0], q[1], L, Tp, left); }
            if (a2 !== c) vq(W, c[0], c[1], a2[0], a2[1], L, Tp, !left);
          }
          continue;
        }
        wcol();
        if (ed.kind === 1) {
          const cut = full ? ed.cut : ed.cutShell;
          if (cut === 'top') vq(W, p[0], p[1], q[0], q[1], ed.Tnb, Tp, left);
          else if (cut) {
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len, a = [p[0] + dx * cut[0], p[1] + dz * cut[0]], c = [p[0] + dx * cut[1], p[1] + dz * cut[1]];
            if (cut[0] > 1e-3) vq(W, p[0], p[1], a[0], a[1], ed.Tnb, Tp, left);
            vq(W, a[0], a[1], c[0], c[1], ed.Lnb, Tp, left);
            if (len - cut[1] > 1e-3) vq(W, c[0], c[1], q[0], q[1], ed.Tnb, Tp, left);
          } else vq(W, p[0], p[1], q[0], q[1], ed.Lnb, Tp, left);
        }
        else {
          const line = full ? ed.line : null, pl = line && PL !== null ? Math.min(Math.max(PL, base), Tp - 0.4) : base;
          if (line) {
            // smooth plinth on the plot line, its ledge (one triangle per tooth), the stepped wall above it
            vq(W, p[0], p[1], q[0], q[1], base, pl, left);
            const dep = ed.dep;
            for (let j = 0; j + 2 < line.length; j++) if (dep[j + 1] > 0.01 && dep[j] < 0.01 && dep[j + 2] < 0.01) triUp(W, line[j], line[j + 1], line[j + 2], pl);
          }
          const pts = line || [p, q];
          for (let j = 0; j + 1 < pts.length; j++) {
            const a = pts[j], b = pts[j + 1];
            if (door && door.part === pi && door.edge === k && door.seg === j) doorBay(W, T, a, b, pl, Tp, left, door, g, wallC, trimC);
            else vq(W, a[0], a[1], b[0], b[1], pl, Tp, left);
          }
        }
        // parapet: its top between the outline and the inner line, and its inner face
        if (inner) {
          const a = inner.A[k], c = inner.B[k], a2 = inner.A[(k + 1) % m];
          pcol();
          if (full && ed.kind === 0 && ed.line) bandStrip(W, ed.line, p, q, a, c, Tp);
          else kit.quadTo(W, [p[0], Tp, p[1]], [q[0], Tp, q[1]], [c[0], Tp, c[1]], [a[0], Tp, a[1]], 0, 1, 0);
          if (d[k] > 0) vq(W, a[0], a[1], c[0], c[1], L, Tp, !left);
          if (a2 !== c) vq(W, c[0], c[1], a2[0], a2[1], L, Tp, !left);              // the end of a parapet against a higher part
        }
      }
      // roof slab (or a flat top where the part is too small for a parapet), court voids
      const tkP = Math.min(tk, P.tk), kerbP = tkP >= 0.08 ? kerb : 0;
      const kerbs = P.holes.map((c) => (kerbP > 0 ? outset(c, M.polygonArea(c) > 0, tkP) : c));
      R.color(roofC[0], roofC[1], roofC[2]);
      if (inner) capInto(R, inner.ring, kerbs, L, true); else capInto(R, P.ring, kerbs, Tp, true);
      const rimTop = inner ? L + kerbP : Tp;
      for (let ci = 0; ci < P.holes.length; ci++) {
        const c = P.holes[ci], kb = kerbs[ci], ccw = M.polygonArea(c) > 0, mc = c.length;
        for (let i = 0; i < mc; i++) {
          const j = (i + 1) % mc, p = c[i], q = c[j], a = kb[i], e = kb[j];
          wcol(); vq(W, p[0], p[1], q[0], q[1], g + lift, rimTop, !ccw);                 // court wall, facing the court
          if (kerbP > 0) {
            pcol();
            kit.quadTo(W, [p[0], rimTop, p[1]], [q[0], rimTop, q[1]], [e[0], rimTop, e[1]], [a[0], rimTop, a[1]], 0, 1, 0);
            if (inner) vq(W, a[0], a[1], e[0], e[1], L, rimTop, ccw);                     // kerb face towards the roof
          }
        }
        F.color(floorC[0], floorC[1], floorC[2]); capInto(F, c, [], g + lift, true);
      }
    }
    // a court that is not a hole of any part (the main court of a great house, between its ranges): its floor
    for (const c of plan.loose) { F.color(floorC[0], floorC[1], floorC[2]); capInto(F, c, [], g + lift, true); }
    const main = plan.parts[0];
    upperInto(W, R, spec, main.L, wallC, roofC, full);
    if (!full) return;
    if (spec.courtStair && main.holes.length) stairInto(W, main.holes[0], g + lift, main.L, wallC);
    if (spec.spouts > 0) {
      T.color(trimC[0] * 2.2, trimC[1] * 2.0, trimC[2] * 1.8);
      const ext = main.edges.filter((ed) => ed.kind === 0 && !ed.line && Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]) > 2.5);
      for (let k = 0; k < spec.spouts && ext.length; k++) {
        const ed = ext[((spec.seed >>> (k * 3)) + k * 2 + 1) % ext.length], a = ed.p, c = ed.q, len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const f = 0.2 + 0.6 * (((spec.seed >>> (8 + k * 5)) & 255) / 255), dx = (c[0] - a[0]) / len, dz = (c[1] - a[1]) / len, ox = main.cw ? dz : -dz, oz = main.cw ? -dx : dx;
        const x = a[0] + (c[0] - a[0]) * f, z = a[1] + (c[1] - a[1]) * f;
        if (door && door.part === 0 && main.edges[door.edge] === ed && Math.abs(f * len - door.s) < door.dW + 0.6) continue;     // never over the door
        kit.spoutInto(T, x, main.L + 0.04, z, M.dirToAz(ox, oz), 0.5, 0.16, 0.12, 0.06);
      }
    }
    if (T === W) wcol();
  }

  // horizontal triangle at level y, wound to face up
  function triUp(W, a, b, c, y) {
    const o = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (o > -1e-6 && o < 1e-6) return;
    if (o > 0) W.tri3(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]); else W.tri3(a[0], y, a[1], c[0], y, c[1], b[0], y, b[1]);
  }
  // the top of the parapet of a stepped front: the strip between the stepped line (p ... q) and the straight inner
  // line a -> c, as trapezoids whose sides are square to the front (both chains run monotonously along it)
  function bandStrip(W, line, p, q, a, c, y) {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len;
    const sa = (a[0] - p[0]) * dx + (a[1] - p[1]) * dz, sc = (c[0] - p[0]) * dx + (c[1] - p[1]) * dz, span = sc - sa;
    let kPrev = 0;
    const on = (t) => { const s = (t[0] - p[0]) * dx + (t[1] - p[1]) * dz, k = span > 1e-6 ? Math.min(1, Math.max(kPrev, (s - sa) / span)) : 0; kPrev = k; return [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k]; };
    let b0 = a;                                          // the strip ends on the mitre lines p -> a and q -> c
    for (let j = 0; j + 1 < line.length; j++) {
      const o0 = line[j], o1 = line[j + 1], b1 = j + 2 === line.length ? c : on(o1);
      triUp(W, o0, o1, b1, y);
      triUp(W, o0, b1, b0, y);
      b0 = b1;
    }
  }

  // the door bay of one flat wall stretch a -> b (from level y0 to y1): wall beside, below and above the opening,
  // a recess with jambs, soffit and threshold, a timber lintel in the wall plane, the leaf at the back of the recess
  function doorBay(W, T, a, b, y0, y1, left, door, g, wallC, trimC) {
    const len = door.len, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, inx = left ? -dz : dz, inz = left ? dx : -dx;
    const dR = DEF.doorRecess, lin = DEF.lintel, yS = Math.max(g, y0), yD = Math.min(yS + door.dH, y1 - lin - 0.25), yL = yD + lin;
    const at = (s) => [a[0] + dx * s, a[1] + dz * s], A = at(door.s - door.dW), B = at(door.s + door.dW);
    const Ai = [A[0] + inx * dR, A[1] + inz * dR], Bi = [B[0] + inx * dR, B[1] + inz * dR];
    W.color(wallC[0], wallC[1], wallC[2]);
    vq(W, a[0], a[1], A[0], A[1], y0, y1, left); vq(W, B[0], B[1], b[0], b[1], y0, y1, left);
    vq(W, A[0], A[1], B[0], B[1], y0, yS, left); vq(W, A[0], A[1], B[0], B[1], yL, y1, left);
    W.occlusion(0.72);
    // jambs face each other across the opening; soffit faces down; threshold faces up
    kit.quadTo(W, [A[0], yS, A[1]], [Ai[0], yS, Ai[1]], [Ai[0], yD, Ai[1]], [A[0], yD, A[1]], dx, 0, dz);
    kit.quadTo(W, [B[0], yS, B[1]], [Bi[0], yS, Bi[1]], [Bi[0], yD, Bi[1]], [B[0], yD, B[1]], -dx, 0, -dz);
    kit.quadTo(W, [A[0], yD, A[1]], [B[0], yD, B[1]], [Bi[0], yD, Bi[1]], [Ai[0], yD, Ai[1]], 0, -1, 0);
    kit.quadTo(W, [A[0], yS, A[1]], [B[0], yS, B[1]], [Bi[0], yS, Bi[1]], [Ai[0], yS, Ai[1]], 0, 1, 0);
    W.occlusion(1);
    T.color(trimC[0], trimC[1], trimC[2]);
    vq(T, A[0], A[1], B[0], B[1], yD, yL, left);                                // lintel beam, in the wall plane
    T.occlusion(0.8); vq(T, Ai[0], Ai[1], Bi[0], Bi[1], yS, yD, left); T.occlusion(1);   // door leaf at the back of the recess
    W.color(wallC[0], wallC[1], wallC[2]);
  }

  // blocks standing on the roof slab (no bottom), flat mud roof, low parapet in the full LOD
  function upperInto(W, R, spec, r, wallC, roofC, full) {
    if (!spec.upper) return;
    for (const u of spec.upper) {
      const ring = M.openRing(u.ring), cwu = M.polygonArea(ring) > 0, top = r + u.height, par = full ? u.parapet ?? 0.3 : 0, m = ring.length;
      W.color(wallC[0], wallC[1], wallC[2]);
      if (par > 0) {
        const inn = M.offsetPolyline(ring, cwu ? 0.3 : -0.3, true), ptop = top + par;
        for (let i = 0; i < m; i++) {
          const j = (i + 1) % m, p = ring[i], q = ring[j], a = inn[i], c = inn[j];
          vq(W, p[0], p[1], q[0], q[1], r, ptop, cwu);
          if (cwu) W.quad(q[0], ptop, q[1], p[0], ptop, p[1], a[0], ptop, a[1], c[0], ptop, c[1]); else W.quad(p[0], ptop, p[1], q[0], ptop, q[1], c[0], ptop, c[1], a[0], ptop, a[1]);
          vq(W, a[0], a[1], c[0], c[1], top, ptop, !cwu);
        }
        R.color(roofC[0], roofC[1], roofC[2]); capInto(R, inn, [], top, true);
      } else {
        for (let i = 0; i < m; i++) { const p = ring[i], q = ring[(i + 1) % m]; vq(W, p[0], p[1], q[0], q[1], r, top, cwu); }
        R.color(roofC[0], roofC[1], roofC[2]); capInto(R, ring, [], top, true);
      }
    }
  }

  // a straight flight with true risers along the longest wall of a court, from the court floor to the roof
  function stairInto(W, court, y0, y1, wallC) {
    const m = court.length, ccw = M.polygonArea(court) > 0;
    let best = 0, bl = 0;
    for (let i = 0; i < m; i++) { const p = court[i], q = court[(i + 1) % m], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; best = i; } }
    const rise = y1 - y0, nst = Math.max(3, Math.round(rise / 0.23)), riser = rise / nst, tread = Math.min(0.28, (bl - 0.3) / nst);
    if (tread < 0.16) return;
    const a = court[best], c = court[(best + 1) % m], dx = (c[0] - a[0]) / bl, dz = (c[1] - a[1]) / bl, inx = ccw ? -dz : dz, inz = ccw ? dx : -dx, wd = 0.75;
    const P = (al, lat, y) => [a[0] + dx * al + inx * lat, y, a[1] + dz * al + inz * lat];
    const s0 = 0.15;
    W.color(wallC[0] * 0.92, wallC[1] * 0.9, wallC[2] * 0.88);
    for (let i = 0; i < nst; i++) {
      const a0 = s0 + i * tread, a1 = a0 + tread, ya = y0 + i * riser, yb = ya + riser;
      kit.quadTo(W, P(a0, 0, ya), P(a0, wd, ya), P(a0, wd, yb), P(a0, 0, yb), -dx, 0, -dz);
      kit.quadTo(W, P(a0, 0, yb), P(a0, wd, yb), P(a1, wd, yb), P(a1, 0, yb), 0, 1, 0);
      kit.quadTo(W, P(a0, wd, y0), P(a1, wd, y0), P(a1, wd, yb), P(a0, wd, yb), inx, 0, inz);
    }
    const e = s0 + nst * tread;
    if (e < bl - 0.05) kit.quadTo(W, P(e, 0, y0), P(e, wd, y0), P(e, wd, y1), P(e, 0, y1), dx, 0, dz);
    W.color(wallC[0], wallC[1], wallC[2]);
  }

  /**
   * One house as geometries: { walls, roof, floor, trim } (BufferGeometry each; empty parts are null).
   * spec / style / lod as for houseInto. For one-off houses (landmarks); for thousands use geom.addHouses().
   */
  function house(spec, style = {}, lod = 'full') {
    const t = { walls: new MeshWriter({ verts: 512, color: true }), roof: new MeshWriter({ verts: 64, color: true }), floor: new MeshWriter({ verts: 16, color: true }), trim: new MeshWriter({ verts: 64, color: true }) };
    houseInto(t, spec, style, lod);
    const out = {};
    for (const k of Object.keys(t)) out[k] = t[k].nv ? t[k].toGeometry() : null;
    return out;
  }

  /**
   * What geom.addHouses() adds to a ctx.layout house record before it builds it: the roof parts, the stepped
   * street fronts, the door of the facade, the plinth, and a foot deep enough for the ground under the plot.
   * Use it yourself when you build one house with geom.house(): geom.house(geom.houseSpec(h), style, 'full').
   * Anything that is not a layout record is returned as it is (merged with `extra`).
   */
  function houseSpec(h, extra = null) {
    const lay = ctx.layout, rec = !!(lay && h && h.sides && typeof lay.roofParts === 'function' && typeof lay.facade === 'function');
    if (!rec) return extra ? { ...h, ...extra } : h;
    const fac = lay.facade(h), ds = fac[h.doorSide] && fac[h.doorSide].door;
    // the floor stands up to 2 m above the lowest ground at the edge of the plot: found the walls below that
    let lo = h.groundLevel;
    const P = h.footprint;
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; lo = Math.min(lo, ctx.ground.height(a[0], a[1]), ctx.ground.height((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)); }
    const big = h.cls === 'large' || h.cls === 'mansion', r = ((h.seed >>> 5) & 1023) / 1023;
    return {
      ...h, parts: lay.roofParts(h), facade: h.sawTooth ? fac : null, doorSpec: ds || null, plinthLevel: h.plinthLevel, base: lo - 0.8,
      courtStair: big || r < 0.3, spouts: r < 0.55 ? 1 + (h.seed & 1) : 0, ...extra,
    };
  }

  /**
   * THE FAST PATH: every house of a list, three levels of detail, binned by tile, submitted to the batcher.
   * houses: ctx.layout.houses (or any list of house records / specs). Layout records are completed with
   * geom.houseSpec(): roof parts at their own levels, stepped fronts, the door of the facade, a deep enough foot.
   * opts: {
   *   filter: (h) => boolean                      default ctx.layout.isBuilt
   *   style: (h) => { wallColor, parapetColor, roofColor, floorColor, trimColor } | null   linear [r, g, b] multipliers
   *                                               (default: eight mud tones by house.tone, lime wash when h.whitewashed)
   *   spec: (h) => extra spec members | null      (upper, courtStair, spouts, parts, facade ...: merged over the record)
   *   wallMaterial, roofMaterial                  id | Material (defaults: a white 'mudPlaster' variant tinted per vertex; 'roofEarth')
   *   farMaterial                                 material of the box level (default: wallMaterial)
   *   full: 400, shell: 2000                      upper bounds of the LOD bands in metres (SPEC section 6)
   *   fullWhere: (h) => boolean                   build the FULL level only for these houses (default: all). The others are
   *                                               drawn as their shell from 0 m on: nothing is ever missing. The full level is
   *                                               two thirds of the triangles: give it only to houses a film camera comes near
   *   farTile: 1024                               tile size of the box level
   *   castShadow: true, reflect: false, shadowFar: Infinity
   * }
   * Returns { houses, withoutFullLevel, tris: { full, shell, box }, ms }.
   */
  function addHouses(houses, opts = {}) {
    const geom = ctx.geom, mats = ctx.materials, T = geom.TILE;
    const o = { full: 400, shell: 2000, farTile: 1024, castShadow: true, reflect: false, ...opts };
    const filter = o.filter || ((h) => ctx.layout.isBuilt(h));
    const wallMat = o.wallMaterial ? (typeof o.wallMaterial === 'string' ? mats.get(o.wallMaterial) : o.wallMaterial) : mats.variant('mudPlaster', { color: 0xffffff, name: 'house-walls' });
    const roofMat = o.roofMaterial ? (typeof o.roofMaterial === 'string' ? mats.get(o.roofMaterial) : o.roofMaterial) : mats.get('roofEarth');
    const farMat = o.farMaterial ? (typeof o.farMaterial === 'string' ? mats.get(o.farMaterial) : o.farMaterial) : wallMat;
    const tones = ['mudPlaster', 'mudPlasterSunlit', 'mudPlasterWeathered', 'mudPlasterFresh', 'mudPlasterGrey', 'mudPlasterReddish', 'mudPlasterDark', 'mudPlasterSunlit'].map((id) => toRGB(mats.color(id)));
    const lime = toRGB(mats.color('limewash')), roofBase = toRGB(mats.color('roofEarth'));
    const defStyle = (h) => {
      const j = 0.88 + 0.24 * (((h.seed >>> 9) & 1023) / 1023), c = h.whitewashed ? lime : tones[(h.tone ?? h.seed) % tones.length], rj = 0.9 + 0.2 * (((h.seed >>> 19) & 1023) / 1023);
      return { wallColor: [c[0] * j, c[1] * j, c[2] * j], roofColor: [rj, rj, rj] };
    };
    const bins = new Map();
    const bin = (lod, size, x, z) => {
      const tx = Math.floor(x / size), tz = Math.floor(z / size), k = lod + ':' + tx + ',' + tz;
      let b = bins.get(k);
      if (!b) bins.set(k, (b = { lod, size, tx, tz, walls: new MeshWriter({ verts: 4096, color: true }), roof: lod === 'box' ? null : new MeshWriter({ verts: 1024, color: true }) }));
      return b;
    };
    const t0 = performance.now();      // timing only: never influences a pixel
    let count = 0, noFull = 0;
    for (const h of houses) {
      if (!filter(h)) continue;
      const st = (o.style && o.style(h)) || defStyle(h), c = h.center || M.polygonCentroid(h.footprint);
      const rc = st.roofColor || WHITE;
      st.roofAbs = st.roofAbs || [roofBase[0] * rc[0], roofBase[1] * rc[1], roofBase[2] * rc[2]];
      const s = houseSpec(h, o.spec ? o.spec(h) : null);
      // a house without a full level (opts.fullWhere) is drawn as its shell from 0 m on
      const hasFull = !o.fullWhere || o.fullWhere(h);
      if (hasFull) houseInto(bin('full', T, c[0], c[1]), s, st, 'full'); else noFull++;
      houseInto(bin(hasFull ? 'shell' : 'shell0', T, c[0], c[1]), s, st, 'shell');
      houseInto(bin('box', o.farTile, c[0], c[1]), s, st, 'box');
      count++;
    }
    const tris = { full: 0, shell: 0, box: 0 };
    const band = { full: [0, o.full], shell: [o.full, o.shell], shell0: [0, o.shell], box: [o.shell, Infinity] };
    for (const b of bins.values()) {
      tris[b.lod === 'shell0' ? 'shell' : b.lod] += b.walls.triangleCount + (b.roof ? b.roof.triangleCount : 0);
      // every band is measured on a consistent grid: full | shell switch per 256 m tile, shell | box per far tile
      const common = { lod: band[b.lod], castShadow: o.castShadow, reflect: o.reflect, tile: b.size, tileKey: [b.tx, b.tz], shadowFar: o.shadowFar,
        lodGrid: b.lod === 'full' ? T : b.lod === 'box' ? o.farTile : [T, o.farTile] };
      if (b.walls.nv) geom.addStatic(b.lod === 'box' ? farMat : wallMat, b.walls, common);
      if (b.roof && b.roof.nv) geom.addStatic(roofMat, b.roof, common);
    }
    return { houses: count, withoutFullLevel: noFull, tris, ms: Math.round(performance.now() - t0) };
  }

  return { house, houseInto, houseSpec, addHouses, planOf, insetVar };
}
