// js/modules/southpalace/lattice.js — the plan rasterised on its 0.25 m lattice, and the mesher that turns the
// lattice into ONE closed surface: roof slabs behind parapets, the walls between neighbours of different height
// (only the part that shows), floors, door and gate openings cut into wall faces with real reveals and vaults.
// A height field has no hidden faces and no coplanar overlaps by construction; vertices sit where roofs meet
// walls, so the batcher's per-vertex ambient occlusion lands where the contact is.
import { CELL, K } from './plan.js';

const TOP = { NONE: 0, ROOF: 1, PAVE: 2, BRICK: 3 };

export function buildLattice(plan, { wallLevel, outLevel }) {
  const { X0, Z0, NX, NZ } = plan.grid, N = NX * NZ, blocks = plan.blocks;
  const ID = new Int32Array(N), KC = new Uint8Array(N), BASE = new Float32Array(N), T = new Float32Array(N), CLS = new Uint8Array(N);
  const iOf = (x) => Math.round((x - X0) / CELL), jOf = (z) => Math.round((z - Z0) / CELL);

  // 1. the enclosure: solid brick inside the outline, nothing outside
  for (let j = 0; j < NZ; j++) {
    const z = Z0 + (j + 0.5) * CELL;
    for (let i = 0; i < NX; i++) { const k = j * NX + i, inside = plan.outlineDist(X0 + (i + 0.5) * CELL, z) > 0.3; KC[k] = inside ? K.WALL : K.OUT; BASE[k] = inside ? wallLevel : outLevel; }
  }
  // 2. the blocks, painter's order
  for (let b = 1; b < blocks.length; b++) {
    const B = blocks[b];
    for (const p of B.pieces) {
      const i0 = Math.max(0, iOf(p.x0)), i1 = Math.min(NX, iOf(p.x1)), j0 = Math.max(0, jOf(p.z0)), j1 = Math.min(NZ, jOf(p.z1));
      for (let j = j0; j < j1; j++) { const row = j * NX; for (let i = i0; i < i1; i++) { ID[row + i] = b; KC[row + i] = B.kind; BASE[row + i] = B.level; } }
    }
  }
  // 3. what is left of each block after the later ones painted over it; slivers become plain wall tops
  const count = new Int32Array(blocks.length), bb = blocks.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const b = ID[j * NX + i]; if (!b) continue; count[b]++; const q = bb[b]; if (i < q[0]) q[0] = i; if (j < q[1]) q[1] = j; if (i > q[2]) q[2] = i; if (j > q[3]) q[3] = j; }
  for (let b = 1; b < blocks.length; b++) {
    const B = blocks[b], q = bb[b];
    B.cells = count[b]; B.alive = count[b] > 0;
    if (!B.alive) continue;
    const w = (q[2] - q[0] + 1) * CELL, d = (q[3] - q[1] + 1) * CELL;
    B.whole = !B.clipped && count[b] === Math.round(((B.x1 - B.x0) * (B.z1 - B.z0)) / (CELL * CELL));
    if (B.kind === K.ROOF && !B.parent && (Math.min(w, d) < 2 || count[b] * CELL * CELL < 6)) { B.kind = K.BRICK; B.par = 0; B.tag = 'sliver'; B.sliver = true; }
  }
  // a sliver that touches the enclosure brick is part of the wall (no pits beside the wall-walk); the others are thick party walls
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i, b = ID[k]; if (b && blocks[b].sliver && (KC[k - 1] === K.WALL || KC[k + 1] === K.WALL || KC[k - NX] === K.WALL || KC[k + NX] === K.WALL)) blocks[b].toWall = true; }
  for (let k = 0; k < N; k++) { const b = ID[k]; if (!b || !blocks[b].sliver) continue; if (blocks[b].toWall) { ID[k] = 0; KC[k] = K.WALL; BASE[k] = wallLevel; blocks[b].alive = false; } else KC[k] = K.BRICK; }
  // 4. pockets of enclosure brick cut off from the wall proper get a top of their own
  {
    const seen = new Uint8Array(N), stack = [];
    const push = (k) => { if (!seen[k] && !ID[k]) { seen[k] = 1; stack.push(k); } };
    for (let i = 0; i < NX; i++) { push(i); push((NZ - 1) * NX + i); }
    for (let j = 0; j < NZ; j++) { push(j * NX); push(j * NX + NX - 1); }
    while (stack.length) { const k = stack.pop(), i = k % NX, j = (k - i) / NX; if (i > 0) push(k - 1); if (i < NX - 1) push(k + 1); if (j > 0) push(k - NX); if (j < NZ - 1) push(k + NX); }
    let pocket = null;
    for (let k = 0; k < N; k++) if (!ID[k] && !seen[k]) {
      if (!pocket) { pocket = { id: blocks.length, kind: K.BRICK, level: wallLevel - 2.4, par: 0, tag: 'pocket', seed: 0.5, pieces: [], alive: true, cells: 0, house: 0, parent: 0 }; blocks.push(pocket); }
      ID[k] = pocket.id; KC[k] = K.BRICK; BASE[k] = pocket.level; pocket.cells++;
    }
  }
  // 5. parapets: the outer half metre of every roof stands `par` above the slab
  const parentOf = blocks.map((b) => (b ? b.parent || 0 : 0));
  function tops(withParapets) {
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, b = ID[k], kind = KC[k];
      if (!b) { T[k] = BASE[k]; CLS[k] = TOP.NONE; continue; }
      const B = blocks[b];
      let rim = false;
      if (withParapets && B.par > 0 && (kind === K.ROOF || kind === K.BRICK)) {
        for (let dj = -2; dj <= 2 && !rim; dj++) { const jj = j + dj; if (jj < 0 || jj >= NZ) { rim = true; break; }
          for (let di = -2; di <= 2; di++) { const ii = i + di; if (ii < 0 || ii >= NX) { rim = true; break; } const nb = ID[jj * NX + ii]; if (nb !== b && parentOf[nb] !== b) { rim = true; break; } } }
      }
      T[k] = B.level + (rim ? B.par : 0);
      CLS[k] = kind === K.FLOOR ? TOP.PAVE : kind === K.BRICK || rim ? TOP.BRICK : TOP.ROOF;
    }
  }

  /**
   * Emit the surface. W = { brick, roof, pave, door, bronze }: MeshWriters with colour. toWorld(lx, lz) -> [x, z].
   * opts: { parapets, patchRoof, patchFloor, patchWall (cells), vsplit, openings, tint(block) -> { brick, top } }
   */
  function mesh(W, toWorld, opts) {
    tops(opts.parapets !== false);
    const PR = opts.patchRoof ?? 24, PF = opts.patchFloor ?? 12, PW = opts.patchWall ?? 12, vsplit = opts.vsplit !== false;
    const tints = blocks.map((b) => (b ? opts.tint(b) : null)), wallTint = opts.wallTint || [1, 1, 1];
    const P3 = (lx, y, lz) => { const p = toWorld(lx, lz); return [p[0], y, p[1]]; };
    // quad a, b, c, d (local [x, y, z]) wound so that it faces n (local)
    const qf = (w, a, b, c, d, n) => {
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
      const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
      const A = P3(a[0], a[1], a[2]), B = P3(b[0], b[1], b[2]), C = P3(c[0], c[1], c[2]), D = P3(d[0], d[1], d[2]);
      return dot >= 0 ? w.quadP(A, B, C, D) : w.quadP(A, D, C, B);
    };
    const stats = { tops: 0, walls: 0, openings: 0, missed: [] };

    // ---- tops: greedy rectangles per block, level and class, cut at the patch grid so that floors carry AO
    const done = new Uint8Array(N);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (done[k]) continue;
      const cls = CLS[k];
      if (cls === TOP.NONE) { done[k] = 1; continue; }
      const b = ID[k], t = T[k], P = cls === TOP.PAVE ? PF : PR;
      const iMax = Math.min(NX, (Math.floor(i / P) + 1) * P), jMax = Math.min(NZ, (Math.floor(j / P) + 1) * P);
      let i1 = i + 1;
      while (i1 < iMax) { const q = j * NX + i1; if (done[q] || ID[q] !== b || CLS[q] !== cls || T[q] !== t) break; i1++; }
      let j1 = j + 1;
      grow: while (j1 < jMax) { for (let q = j1 * NX + i, e = q + (i1 - i); q < e; q++) if (done[q] || ID[q] !== b || CLS[q] !== cls || T[q] !== t) break grow; j1++; }
      for (let jj = j; jj < j1; jj++) done.fill(1, jj * NX + i, jj * NX + i1);
      const w = cls === TOP.ROOF ? W.roof : cls === TOP.PAVE ? W.pave : W.brick, tn = tints[b];
      w.color(cls === TOP.BRICK ? tn.brick : tn.top);
      const xa = X0 + i * CELL, xb = X0 + i1 * CELL, za = Z0 + j * CELL, zb = Z0 + j1 * CELL;
      w.quadP(P3(xa, t, za), P3(xa, t, zb), P3(xb, t, zb), P3(xb, t, za));
      stats.tops++;
    }

    // ---- walls
    const opens = new Map();
    if (opts.openings) for (const op of plan.openings) {
      const line = op.axis === 0 ? iOf(op.at) : jOf(op.at), key = op.axis + ':' + line + ':' + op.dir;
      if (!opens.has(key)) opens.set(key, []);
      opens.get(key).push(op); op.used = false;
    }
    // a plain piece of wall face on the lattice line `at` (metres), from u0 to u1 along it, between levels lo and hi
    const face = (axis, at, dir, u0, u1, lo, hi) => {
      const n = axis === 0 ? [dir, 0, 0] : [0, 0, dir], Pt = axis === 0 ? (u, y) => [at, y, u] : (u, y) => [u, y, at];
      const cuts = vsplit && hi - lo > 4.4 ? [lo, lo + 2.3, hi] : [lo, hi];
      for (let s = u0; s < u1 - 1e-6;) {
        const e = Math.min(u1, (Math.floor(s / (PW * CELL) + 1e-6) + 1) * PW * CELL);
        for (let c = 0; c < cuts.length - 1; c++) qf(W.brick, Pt(s, cuts[c]), Pt(e, cuts[c]), Pt(e, cuts[c + 1]), Pt(s, cuts[c + 1]), n);
        stats.walls++; s = e;
      }
    };
    // an opening: the face round it, jambs, vault or soffit, threshold, back
    const cut = (op, axis, at, dir, lo, hi, tint) => {
      const n = axis === 0 ? [dir, 0, 0] : [0, 0, dir], up = axis === 0 ? [0, 0, 1] : [1, 0, 0];
      const Pt = axis === 0 ? (u, y, e = 0) => [at - dir * e, y, u] : (u, y, e = 0) => [u, y, at - dir * e];
      const { a0, a1, sill, depth } = op, top = sill + op.h, r = (a1 - a0) / 2, arch = op.arch && op.h > r + 0.2, ys = arch ? top - r : top, prof = [];
      if (arch) for (let q = 0; q <= op.seg; q++) { const f = (Math.PI * q) / op.seg; prof.push([a0 + r - r * Math.cos(f), ys + r * Math.sin(f)]); } else prof.push([a0, top], [a1, top]);
      const w = W.brick; w.color(tint);
      if (sill > lo + 1e-3) qf(w, Pt(a0, lo), Pt(a1, lo), Pt(a1, sill), Pt(a0, sill), n);
      for (let q = 0; q < prof.length - 1; q++) qf(w, Pt(prof[q][0], prof[q][1]), Pt(prof[q + 1][0], prof[q + 1][1]), Pt(prof[q + 1][0], hi), Pt(prof[q][0], hi), n);
      const dk = [tint[0] * 0.82, tint[1] * 0.82, tint[2] * 0.82];
      w.color(dk); w.occlusion(0.62);
      const mid = depth > 3 ? [0, Math.min(1.2, depth / 2), depth] : [0, depth];     // a first ring of vertices near the mouth: the dark starts inside
      for (let d = 0; d < mid.length - 1; d++) {
        const e0 = mid[d], e1 = mid[d + 1];
        if (d > 0) w.occlusion(0.42);
        qf(w, Pt(a0, sill, e0), Pt(a0, sill, e1), Pt(a0, ys, e1), Pt(a0, ys, e0), up);
        qf(w, Pt(a1, sill, e0), Pt(a1, sill, e1), Pt(a1, ys, e1), Pt(a1, ys, e0), [-up[0], 0, -up[2]]);
        for (let q = 0; q < prof.length - 1; q++) {
          const p = prof[q], s = prof[q + 1], mu = (p[0] + s[0]) / 2, my = (p[1] + s[1]) / 2, nu = arch ? a0 + r - mu : 0, ny = arch ? ys - my : -1;
          qf(w, Pt(p[0], p[1], e0), Pt(s[0], s[1], e0), Pt(s[0], s[1], e1), Pt(p[0], p[1], e1), [up[0] * nu, ny, up[2] * nu]);
        }
        const fw = op.floor === 'brick' ? W.brick : W.pave;
        fw.color(d > 0 ? [0.62, 0.62, 0.62] : [0.85, 0.85, 0.85]);
        qf(fw, Pt(a0, sill, e0), Pt(a1, sill, e0), Pt(a1, sill, e1), Pt(a0, sill, e1), [0, 1, 0]);
      }
      if (op.back) {
        const e = depth;
        if (op.back === 'door') {
          W.door.color([0.8, 0.8, 0.8]);
          qf(W.door, Pt(a0, sill, e), Pt(a1, sill, e), Pt(a1, top, e), Pt(a0, top, e), n);
          if (op.bands) { W.bronze.color([1, 1, 1]); const nb = Math.max(3, Math.round(op.h / 1.5)); for (let q = 0; q < nb; q++) { const y = sill + ((q + 0.5) * (ys - sill)) / nb; qf(W.bronze, Pt(a0, y - 0.11, e - 0.04), Pt(a1, y - 0.11, e - 0.04), Pt(a1, y + 0.11, e - 0.04), Pt(a0, y + 0.11, e - 0.04), n); }
            qf(W.bronze, Pt((a0 + a1) / 2 - 0.05, sill, e - 0.05), Pt((a0 + a1) / 2 + 0.05, sill, e - 0.05), Pt((a0 + a1) / 2 + 0.05, ys, e - 0.05), Pt((a0 + a1) / 2 - 0.05, ys, e - 0.05), n); }
        } else if (op.back === 'porch') {
          w.color(tint); w.occlusion(0.7);
          qf(w, Pt(a0, sill, e), Pt(a1, sill, e), Pt(a1, top, e), Pt(a0, top, e), n);
          const c = (a0 + a1) / 2; W.door.color([0.35, 0.35, 0.35]);
          qf(W.door, Pt(c - 1.6, sill, e - 0.04), Pt(c + 1.6, sill, e - 0.04), Pt(c + 1.6, sill + 5.2, e - 0.04), Pt(c - 1.6, sill + 5.2, e - 0.04), n);
        } else { w.color([0.16, 0.14, 0.12]); w.occlusion(0.5); qf(w, Pt(a0, sill, e), Pt(a1, sill, e), Pt(a1, top, e), Pt(a0, top, e), n); }
      }
      w.occlusion(1);
      stats.openings++;
    };
    // one run of wall on a lattice line: plain face, with the openings registered on it cut out
    const run = (axis, line, dir, c0, c1, lo, hi, tint) => {
      const at = (axis === 0 ? X0 : Z0) + line * CELL, o0 = axis === 0 ? Z0 : X0, u0 = o0 + c0 * CELL, u1 = o0 + c1 * CELL;
      W.brick.color(tint);
      const list = opens.get(axis + ':' + line + ':' + dir);
      if (!list) { face(axis, at, dir, u0, u1, lo, hi); return; }
      const here = list.filter((op) => !op.used && op.a0 >= u0 + 0.05 && op.a1 <= u1 - 0.05 && op.sill >= lo - 0.02 && op.sill + op.h <= hi - 0.15).sort((a, b) => a.a0 - b.a0);
      let s = u0;
      for (const op of here) {
        if (op.a0 < s) continue;
        if (op.a0 > s) { W.brick.color(tint); face(axis, at, dir, s, op.a0, lo, hi); }
        cut(op, axis, at, dir, lo, hi, tint); op.used = true; s = op.a1;
      }
      if (s < u1) { W.brick.color(tint); face(axis, at, dir, s, u1, lo, hi); }
    };
    const wallOf = (a, b) => {           // cells a (lower coordinate) and b: [lo, hi, dir, block of the higher side] or null
      const ta = T[a], tb = T[b];
      if (ta === tb) return null;
      const hiC = ta > tb ? a : b, loC = ta > tb ? b : a;
      if (KC[hiC] === K.OUT || (KC[hiC] === K.WALL && KC[loC] === K.OUT)) return null;
      return [Math.min(ta, tb), Math.max(ta, tb), ta > tb ? 1 : -1, ID[hiC]];
    };
    for (let axis = 0; axis < 2; axis++) {
      const L = axis === 0 ? NX : NZ, U = axis === 0 ? NZ : NX;
      for (let line = 1; line < L; line++) {
        let c = 0;
        while (c < U) {
          const a = axis === 0 ? c * NX + line - 1 : (line - 1) * NX + c, b = axis === 0 ? c * NX + line : line * NX + c, q = wallOf(a, b);
          if (!q) { c++; continue; }
          let c1 = c + 1;
          while (c1 < U) { const a1 = axis === 0 ? c1 * NX + line - 1 : (line - 1) * NX + c1, b1 = axis === 0 ? c1 * NX + line : line * NX + c1, r = wallOf(a1, b1); if (!r || r[0] !== q[0] || r[1] !== q[1] || r[2] !== q[2] || r[3] !== q[3]) break; c1++; }
          run(axis, line, q[2], c, c1, q[0], q[1], q[3] ? tints[q[3]].brick : wallTint);
          c = c1;
        }
      }
    }
    if (opts.openings) for (const op of plan.openings) if (!op.used) stats.missed.push(op);
    return stats;
  }

  /** Outlines (local rings, clockwise or not, simplified) of the regions where mask(k, i, j) holds. */
  function trace(mask) {
    const m = new Uint8Array(N);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (mask(j * NX + i, i, j)) m[j * NX + i] = 1;
    const at = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : m[j * NX + i]);
    // directed edges with the region on the right of travel; next[vertex * 4 + dir]
    const V = (i, j) => j * (NX + 1) + i, out = new Map();
    const add = (i0, j0, i1, j1, d) => { const k = V(i0, j0); let l = out.get(k); if (!l) out.set(k, (l = [])); l.push({ to: V(i1, j1), d, used: false }); };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      if (!m[j * NX + i]) continue;
      if (!at(i, j - 1)) add(i, j, i + 1, j, 0);            // east along the north side
      if (!at(i + 1, j)) add(i + 1, j, i + 1, j + 1, 1);    // south along the east side
      if (!at(i, j + 1)) add(i + 1, j + 1, i, j + 1, 2);    // west along the south side
      if (!at(i - 1, j)) add(i, j + 1, i, j, 3);            // north along the west side
    }
    const loops = [];
    for (const [start, list] of out) for (const first of list) {
      if (first.used) continue;
      const ring = []; let v = start, e = first;
      for (let guard = 0; guard < 4 * N; guard++) {
        e.used = true;
        const i = v % (NX + 1), j = (v - i) / (NX + 1);
        if (!ring.length || ring[ring.length - 1].d !== e.d) ring.push({ x: X0 + i * CELL, z: Z0 + j * CELL, d: e.d });
        v = e.to;
        const cand = (out.get(v) || []).filter((q) => !q.used);
        if (!cand.length) break;
        const pref = [(e.d + 1) % 4, e.d, (e.d + 3) % 4];
        e = cand.sort((a, b) => pref.indexOf(a.d) - pref.indexOf(b.d))[0];
        if (v === start && e === first) break;
      }
      if (ring.length >= 4) { if (ring[0].d === ring[ring.length - 1].d) ring.shift(); loops.push(ring.map((p) => [p.x, p.z])); }
    }
    return loops;
  }

  /** The longest stretch of a block's side that has paved floor outside it: { u0, u1, floorBlock } or null. side: 'N' | 'S' | 'W' | 'E'. */
  function floorAlong(B, side) {
    const horiz = side === 'N' || side === 'S', c0 = horiz ? iOf(B.x0) : jOf(B.z0), c1 = horiz ? iOf(B.x1) : jOf(B.z1);
    const lineIn = side === 'N' ? jOf(B.z0) : side === 'S' ? jOf(B.z1) - 1 : side === 'W' ? iOf(B.x0) : iOf(B.x1) - 1, lineOut = lineIn + (side === 'N' || side === 'W' ? -1 : 1);
    if (lineOut < 0 || lineOut >= (horiz ? NZ : NX)) return null;
    let best = null, s = -1, fb = 0;
    for (let c = c0; c <= c1; c++) {
      const kin = horiz ? lineIn * NX + c : c * NX + lineIn, kout = horiz ? lineOut * NX + c : c * NX + lineOut;
      const ok = c < c1 && ID[kin] === B.id && KC[kout] === K.FLOOR;
      if (ok) { if (s < 0) { s = c; fb = ID[kout]; } }
      else if (s >= 0) { if (!best || c - s > best.n) best = { n: c - s, c0: s, c1: c, floorBlock: fb }; s = -1; }
    }
    if (!best) return null;
    const o = horiz ? X0 : Z0;
    return { u0: o + best.c0 * CELL, u1: o + best.c1 * CELL, floorBlock: best.floorBlock, len: best.n * CELL };
  }
  const cellAt = (x, z) => { const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL); return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i; };
  /** Level of the surface at a local point (roof slab, parapet top, floor) after tops(). */
  const levelAt = (x, z) => { const k = cellAt(x, z); return k < 0 ? outLevel : T[k]; };
  const blockAt = (x, z) => { const k = cellAt(x, z); return k < 0 ? 0 : ID[k]; };
  const kindAt = (x, z) => { const k = cellAt(x, z); return k < 0 ? K.OUT : KC[k]; };

  tops(true);
  return { ID, KC, T, CLS, NX, NZ, X0, Z0, mesh, trace, tops, floorAlong, levelAt, blockAt, kindAt, iOf, jOf };
}
