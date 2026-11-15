// layout/house.js — a plot becomes a house RECORD (data only): footprint, real court polygon(s), interior
// orientation, levels, class, archetype, door, and (on demand) the stepped saw-tooth line of every street
// front, the night lamps, the roof and court anchors. R5 2.1, 3.1, 5; SPEC 3.15.
import * as G from './poly.js';
import * as M from '../mathx.js';
import { hash2, Rng } from '../rng.js';

const TRUE_NORTH = [0.2723, -0.9622];           // model direction of true north (world.json meta)
const fold45 = (a) => M.mod(a + 45, 90) - 45;   // an axis direction modulo 90 degrees, in [-45, 45)

/** The twelve archetype families (house.archetype). */
export const ARCHETYPES = [
  'small single court',              // 0
  'small, court against a side',     // 1
  'row / shop house (narrow front)', // 2
  'medium single court',             // 3
  'medium with an upper room',       // 4
  'medium with a roof shelter',      // 5
  'corner house (two street fronts)',// 6
  'workshop with a yard',            // 7
  'large, raised main room',         // 8
  'large, two courts',               // 9
  'mansion, two or three courts',    // 10
  'compound of several small units', // 11
];

export function createHouses(env) {
  const { heightAt } = env;

  /**
   * Ground under a plot: { max, min } of the ground model at the vertices, the edge midpoints and the centre.
   * A floor is laid on the HIGHEST ground under the house (the low side gets the taller footing), so the
   * terrain never comes up through a court; a plot whose span is large straddles a scarp (a canal cut, a quay,
   * the terrace of the Processional Way) and is not built on (layout.js).
   */
  function groundSpan(P, c) {
    let max = heightAt(c[0], c[1]), min = max;
    for (let i = 0, n = P.length; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      for (const g of [heightAt(a[0], a[1]), heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)]) { if (g > max) max = g; if (g < min) min = g; }
    }
    return { max, min };
  }

  /**
   * make(lot, o) -> house record (id is assigned by the caller).
   * lot: working polygon (clockwise, tags). o: { prm, blockId, blockRank, blockAngle, slope, district, enclosure,
   * village, hero, fixed: { name, groundLevel, roofLevel, courts, rotationDeg, cls } }
   */
  function make(lot, o) {
    const P = lot.p, n = P.length, A = G.area(P), c = G.centroid(P), prm = o.prm, fx = o.fixed || null;
    const seed = (hash2(Math.round(c[0] * 10), Math.round(c[1] * 10), 7) * 4294967296) >>> 0;
    const r = new Rng(seed);
    const cls = (fx && fx.cls) || (A < 150 ? 'small' : A < 400 ? 'medium' : A < 950 ? 'large' : 'mansion');
    const ci = cls === 'small' ? 0 : cls === 'medium' ? 1 : cls === 'large' ? 2 : 3;

    // ---- sides and door ------------------------------------------------------------------------
    const span = o.span || groundSpan(P, c);
    const sides = [], front = [], weights = [];
    let streetFronts = 0;
    for (let i = 0; i < n; i++) {
      const t = lot.t[i], a = P[i], b = P[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const kind = !t ? 'e' : t.k === 'street' ? 's' : t.k === 'open' ? 'o' : t.k === 'party' ? 'p' : 'e';
      sides.push({ kind, street: t && t.st ? t.st.id : null });
      if ((kind === 's' || kind === 'o') && len >= 2.2) {
        const ox = (b[1] - a[1]) / len, oz = -(b[0] - a[0]) / len;           // outward normal
        const north = ox * TRUE_NORTH[0] + oz * TRUE_NORTH[1];
        const sc = t.st ? t.st.cls : null;
        // (a front whose street lies beyond a bank, like the terrace slope of the Processional Way, is the last choice for a door)
        const tw = (kind === 'o' ? 0.55 : sc === 'alley' ? 1.25 : sc === 'main' ? 0.75 : sc === 'processional' ? 0.5 : 1) * (kind === 's' && t.hw > 14 ? 0.04 : 1);
        // on sloping ground the door is on the high side if it can be: the floor stands on the highest ground under
        // the plot, and a door on the low side would have its sill a metre or more above the street
        const drop = span.max - heightAt((a[0] + b[0]) / 2 + ox * 0.6, (a[1] + b[1]) / 2 + oz * 0.6) - 0.6;
        front.push(i); weights.push(len * tw * (1 + 0.45 * north) * (drop > 0 ? Math.max(0.08, 1 - drop) : 1));
        if (kind === 's' && len >= 4) streetFronts++;
      }
    }
    let di = 0;
    if (fx && fx.doorSide !== undefined) di = fx.doorSide;
    else if (front.length) {
      let sum = 0; for (const w of weights) sum += w;
      let q = r.next() * sum; di = front[front.length - 1];
      for (let k = 0; k < front.length; k++) { q -= weights[k]; if (q <= 0) { di = front[k]; break; } }
    } else {
      let best = 0;
      for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; di = i; } }
    }
    const da = P[di], db = P[(di + 1) % n], dlen = Math.hypot(db[0] - da[0], db[1] - da[1]) || 1;
    const dt = dlen < 4.5 || fx ? 0.5 + (fx ? 0.12 : 0) : r.next() < 0.5 ? r.range(0.18, 0.38) : r.range(0.62, 0.82);
    const door = [da[0] + (db[0] - da[0]) * dt, da[1] + (db[1] - da[1]) * dt];
    const doorDir = [(db[1] - da[1]) / dlen, -(db[0] - da[0]) / dlen];

    // ---- interior orientation: toward true north where the walls are stepped --------------------
    const theta = fold45(Math.atan2(db[1] - da[1], db[0] - da[0]) * M.RAD);
    const toothShare = Math.min(0.95, prm.sawToothShare * [0.75, 1.1, 1.3, 1.4][ci]);
    let sawTooth = fx ? true : front.length > 0 && sides[di].kind === 's' && r.next() < toothShare;
    let rotationDeg;
    if (fx && fx.rotationDeg !== undefined) rotationDeg = fx.rotationDeg;
    else if (sawTooth) {
      // the interior leans toward true north (+15.8 in the model): 6 to 16 degrees off the plot (R5 2.1), less on a
      // narrow plot, where a strongly skewed interior would leave no room for a court
      let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
      const ct = Math.cos(theta * M.DEG), st = Math.sin(theta * M.DEG);
      for (const q of P) { const u = q[0] * ct + q[1] * st, v = -q[0] * st + q[1] * ct; lo = Math.min(lo, u); hi = Math.max(hi, u); lo2 = Math.min(lo2, v); hi2 = Math.max(hi2, v); }
      const maxSkew = Math.min(hi - lo, hi2 - lo2) < 13 ? 9 : 16;
      const base = (o.blockAngle ?? 13) + r.gauss() * 0.9;
      if (base - theta >= 6) rotationDeg = Math.min(base, theta + maxSkew - r.range(0, 2.5));
      else if (theta + 6 <= 21.5) rotationDeg = theta + 6 + r.range(0, 2);
      else rotationDeg = theta - 6 - r.range(0, 2);
    } else rotationDeg = theta;
    const cr = Math.cos(rotationDeg * M.DEG), sr = Math.sin(rotationDeg * M.DEG);
    const L = P.map((q) => [(q[0] - c[0]) * cr + (q[1] - c[1]) * sr, -(q[0] - c[0]) * sr + (q[1] - c[1]) * cr]);
    const toWorld = (lx, lz) => [c[0] + lx * cr - lz * sr, c[1] + lx * sr + lz * cr];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of L) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    const size = [x1 - x0, z1 - z0];

    // ---- archetype ------------------------------------------------------------------------------
    const aspect = Math.max(size[0], size[1]) / Math.max(1, Math.min(size[0], size[1]));
    let storeys = 1, archetype, nCourts = 1;
    const q1 = r.next(), q2 = r.next();
    if (ci === 0) archetype = aspect > 1.9 ? 2 : streetFronts >= 2 && q1 < 0.5 ? 6 : q1 < 0.72 ? 0 : 1;
    else if (ci === 1) {
      if (q1 < 0.12) { archetype = 4; storeys = 2; }
      else archetype = streetFronts >= 2 && q2 < 0.4 ? 6 : q1 < 0.3 ? 5 : q1 < 0.39 ? 7 : aspect > 2.1 ? 2 : 3;
    } else if (ci === 2) {
      if (A > 520 && q1 < 0.45) { archetype = 9; nCourts = 2; } else archetype = q1 > 0.9 ? 11 : 8;
      if (archetype === 11) nCourts = 2;
      if (q2 < 0.08) storeys = 2;
    } else { archetype = 10; nCourts = A > 1300 && q1 < 0.45 ? 3 : 2; }

    // ---- courts ---------------------------------------------------------------------------------
    const rb = [r.range(2.2, 2.8), r.range(2.9, 3.7), r.range(4.0, 5.0), r.range(5.0, 6.2)][ci];     // room depth
    const rs = rb * r.range(1.15, 1.45);                                                              // main room, south
    // The court is a rectangle in the HOUSE frame that keeps a range of rooms between itself and every plot line:
    // `rs` on the south (the main room), `rb` elsewhere. On a narrow plot a ring of rooms leaves no court worth the
    // name, so the court is then laid against one side (never the door side, never the south): only a wall
    // (WALL) stands between it and the neighbour, as in the smaller houses, and it gets its 10 to 20 % back.
    const WALL = 0.75, edges = [];
    for (let i = 0; i < n; i++) {
      const a = L[i], b = L[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;      // inward normal
      // side of the house this edge closes: 0 south (main room), 1 west, 2 east, 3 north
      edges.push({ ax: a[0], az: a[1], nx, nz, south: -nz > 0.5, side: -nz > 0.5 ? 0 : nx > 0.5 ? 1 : nx < -0.5 ? 2 : nz > 0.5 ? 3 : -1, door: i === di });
    }
    /** How far (0..1) a court of half sizes a, b at (cx, cz) must shrink to keep its rooms; mode = side left as a bare wall. */
    const fit = (cx, cz, a, b, scaleR, mode = 0) => {
      let k = 1;
      for (const e of edges) {
        const depth = mode && e.side === mode && !e.door ? WALL : Math.max(0.62, (e.south ? rs : rb) * scaleR);
        const d = (cx - e.ax) * e.nx + (cz - e.az) * e.nz - depth, s = Math.abs(e.nx) * a + Math.abs(e.nz) * b;
        if (d <= 0) return 0;
        if (s > 1e-9) k = Math.min(k, d / s);
      }
      return k;
    };
    /** Lay a court of the wanted quarter-area `want` (a * b) round (cx, cz): [cx, cz, a, b] or null. */
    const solve = (cx, cz, a, b, want, scaleR, mode, cap) => {
      const k = fit(cx, cz, a, b, scaleR, mode);
      if (k * a < 1.0 || k * b < 1.0) return null;
      a *= k; b *= k;
      const ok = (x, z, p, q) => fit(x, z, p, q, scaleR, mode) >= 0.999;
      const sx = mode === 1 ? -1 : mode === 2 ? 1 : 0, sz = mode === 3 ? -1 : 0;
      for (let pass = 0; pass < 2 && a * b < want * 0.97; pass++) {
        if (mode) {
          // slide it against the bare wall
          let lo = 0, hi = 8;
          if (ok(cx + sx * hi, cz + sz * hi, a, b)) lo = hi; else for (let it = 0; it < 5; it++) { const mid = (lo + hi) / 2; if (ok(cx + sx * mid, cz + sz * mid, a, b)) lo = mid; else hi = mid; }
          cx += sx * lo; cz += sz * lo;
        }
        // grow along the plot, then across it, until it has its share again (never longer than 2.3 : 1)
        for (const dim of size[0] >= size[1] ? [0, 1] : [1, 0]) {
          if (a * b >= want * 0.97) break;
          const p = dim === 0 ? a : b, q = dim === 0 ? b : a;
          let lo = 1, hi = Math.min(3, want / (a * b), cap ? cap / p : 3, 2.3 * q / p);
          if (hi <= 1.001) continue;
          const g = (m) => ok(cx, cz, dim === 0 ? a * m : a, dim === 0 ? b : b * m);
          if (g(hi)) lo = hi; else for (let it = 0; it < 6; it++) { const mid = (lo + hi) / 2; if (g(mid)) lo = mid; else hi = mid; }
          if (dim === 0) a *= lo; else b *= lo;
        }
      }
      return [cx, cz, a, b];
    };
    const share = fx && fx.courtShare ? fx.courtShare : archetype === 7 ? r.range(0.26, 0.36) : r.range(0.12, 0.2);
    const courtsL = [];
    if (fx && fx.courts) { /* given */ } else {
      const alongX = size[0] >= size[1], ext = alongX ? size[0] : size[1];
      const parts = nCourts === 1 ? [1] : nCourts === 2 ? [0.62, 0.38] : [0.5, 0.27, 0.23];
      if (nCourts > 1 && r.next() < 0.5) parts.reverse();
      const mainN = (rs - rb) / 2;
      // sides tried for a bare-wall court: a seeded order of west / east, then north ("court against a side" first for archetype 1)
      const hq = hash2(seed & 0xffff, seed >>> 16, 77), lateral = hq < 0.5 ? [1, 2, 3] : [2, 1, 3];
      for (let j = 0; j < nCourts; j++) {
        const off = nCourts === 1 ? 0 : ((j + 0.5) / nCourts - 0.5) * ext * 0.66;
        const cx0 = (x0 + x1) / 2 * 0.5 + (alongX ? off : 0), cz0 = (z0 + z1) / 2 * 0.5 + (alongX ? 0 : off) - mainN;
        const area = share * A * parts[j], asp = r.range(0.8, 1.25);
        let a = Math.sqrt(area * asp) / 2, b = area / (4 * a);
        const cap = nCourts > 1 ? Math.max(1.2, ext * 0.66 / nCourts / 2 - rb * 0.35) : 0;
        if (cap) { if (alongX) a = Math.min(a, cap); else b = Math.min(b, cap); }
        const want = area / 4;
        let best = null;
        const consider = (c) => { if (c && (!best || c[2] * c[3] > best[2] * best[3])) best = c; };
        // a ring of rooms first, with rooms up to a fifth shallower; then a court against a side; thinner rooms last
        const tries = nCourts > 1 ? [[0, 1], [0, 0.8], [0, 0.6], [0, 0.42]]
          : archetype === 1 ? [[lateral[0], 1], [0, 1], [lateral[1], 1], [3, 1], [lateral[0], 0.7], [0, 0.6], [0, 0.42]]
            : [[0, 1], [0, 0.8], [lateral[0], 1], [lateral[1], 1], [3, 1], [lateral[0], 0.7], [0, 0.6], [0, 0.42]];
        for (let q = 0; q < tries.length; q++) {
          const full = tries[q][1] >= 0.8;
          if (!full && best && best[2] * best[3] >= want * 0.68) break;          // thinner rooms only where nothing else gave a court
          consider(solve(cx0, cz0, a, b, want, tries[q][1], tries[q][0], cap));
          if (!full && !tries[q][0]) consider(solve(alongX ? off * 0.8 : 0, alongX ? 0 : off * 0.8, a, b, want, tries[q][1], 0, cap));
          if (best && best[2] * best[3] >= want * (q < 2 ? 0.8 : 0.7)) break;
        }
        if (!best) {
          if (j > 0) continue;
          const k = Math.max(0.6, Math.min(1, fit(alongX ? off * 0.8 : 0, alongX ? 0 : off * 0.8, 1, 1, 0.25)));
          best = [alongX ? off * 0.8 : 0, alongX ? 0 : off * 0.8, k, k];
        }
        courtsL.push(best);
      }
    }
    const courts = fx && fx.courts ? fx.courts : courtsL.map(([cx, cz, a, b]) => {
      const pts = [toWorld(cx - a, cz - b), toWorld(cx + a, cz - b), toWorld(cx + a, cz + b), toWorld(cx - a, cz + b)];
      return G.ring(pts);
    });
    let courtArea = 0; for (const ct of courts) courtArea += Math.abs(M.polygonArea(ct));
    const minCourt = courtsL.length ? Math.min(courtsL[0][2], courtsL[0][3]) * 2 : 8;

    // ---- levels ---------------------------------------------------------------------------------
    const floorRaise = [r.range(0.1, 0.4), r.range(0.15, 0.6), r.range(0.3, 0.9), r.range(0.6, 1.4)][ci];
    // the floor: on the highest ground under the plot (the fall of the ground already raises it above the street
    // on the low side, so the raise is smaller there), and never below a street that carries its own levels
    let groundLevel = fx && fx.groundLevel !== undefined ? fx.groundLevel : span.max + 0.12 + Math.max(0.1, floorRaise - 0.7 * (span.max - span.min));
    const dst = lot.t[di] && lot.t[di].st;
    if (!(fx && fx.groundLevel !== undefined) && dst && dst.levels && dst.polyline) { const hit = M.nearestOnPolyline(door[0], door[1], dst.polyline); if (hit.dist < (dst.width || 6) / 2 + 2.5) groundLevel = Math.max(groundLevel, Math.min(span.max + 2, M.valueAlong(dst.levels, hit) + 0.1)); }
    // one storey (SPEC 3.15, R5 2.1); `storeys: 2` means a light upper room on the roof: the raised range then
    // stands a full room height above the roof (never a second storey over the whole house)
    const upper = (storeys - 1) * r.range(2.4, 3.0);
    let wallH = [r.range(3.0, 3.6), r.range(3.4, 4.4), r.range(4.4, 5.8), r.range(6.0, 7.8)][ci];
    const parapet = r.range(0.6, 1.0);
    let mainRaise = Math.max(upper, ci === 0 ? (r.next() < 0.6 ? 0 : r.range(0.4, 0.8)) : [0, r.range(0.6, 1.4), r.range(1.0, 2.2), r.range(1.5, 3.0)][ci]);
    // a great house: 6 to 8 m is its MAIN block (R5 3.1 table); the ordinary ranges are that much lower. A large
    // house: main block at most 7 m
    if (ci === 3) { const main = wallH; wallH = Math.max(4.2, main - mainRaise); mainRaise = main - wallH; }
    else if (ci === 2 && !upper && wallH + mainRaise > 7) mainRaise = 7 - wallH;
    const roofLevel = fx && fx.roofLevel !== undefined ? fx.roofLevel : groundLevel + wallH;
    const plinth = [r.range(0, 0.4), r.range(0.2, 0.8), r.range(0.4, 1.0), r.range(0.8, 1.5)][ci];

    const whiteP = Math.min(0.9, prm.whitewashShare * [0.56, 1.5, 2.7, 3.2][ci]);
    const hr = hash2(seed & 0xffff, seed >>> 16, 91);
    const rank = o.hero ? hr * 0.14 : M.mod((o.blockRank ?? hr) + 0.12 * (hr - 0.5), 1);
    return {
      id: -1, footprint: G.ring(P), courts, center: [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000], size, rotationDeg,
      groundLevel, storeys, roofLevel, parapet, cls, archetype,
      whitewashed: fx ? fx.whitewashed !== false : r.next() < whiteP, sawTooth,
      door, doorDir, street: sides[di].street, district: o.district ?? null, enclosure: o.enclosure ?? null, village: o.village ?? null,
      blockId: o.blockId ?? null, rank: Math.min(rank, 0.999999), seed, landmark: fx ? fx.name : null,
      courtTree: !fx && minCourt >= 3.2 && r.next() < prm.tree,
      // ---- additions to the contract (docs/layout.md) ----
      area: A, courtArea, sides, doorSide: di, toothLength: fx && fx.toothLength ? fx.toothLength : 0, plinth, plinthLevel: fx ? groundLevel : span.max + 0.12 + plinth, mainRaise, tone: r.int(0, 7), wallHeight: roofLevel - groundLevel,
    };
  }

  /**
   * The street fronts of a house, with the stepped ("saw-tooth") wall line where the interior grid is skew to
   * the plot (R5 3.1): one entry per footprint edge
   *   { edge, a: [x, z], b: [x, z], kind: 's' street | 'o' open ground | 'p' party wall | 'e' edge, street: id | null,
   *     length, skewDeg, teeth, toothLength, toothDepth, line: [[x, z], ...] | null, door: { x, z, width, height, dir } | null }
   * `line` runs from a to b INSIDE the plot: tips on the plot line, long faces parallel to the house axis,
   * short returns square to it. The plot line itself is the smooth plinth (house.plinth metres high).
   */
  function facade(h) {
    const P = h.footprint, n = P.length - 1, out = [];
    const r = new Rng(h.seed ^ 0x5a17);
    const cr = Math.cos(h.rotationDeg * M.DEG), sr = Math.sin(h.rotationDeg * M.DEG);
    const axes = [[cr, sr], [-sr, cr], [-cr, -sr], [sr, -cr]];
    const big = h.cls === 'large' || h.cls === 'mansion';
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      const side = h.sides[i] || { kind: 'e', street: null };
      let f = axes[0], best = -2;
      for (const ax of axes) { const d = ax[0] * dx + ax[1] * dz; if (d > best) { best = d; f = ax; } }
      const phi = Math.atan2(dx * f[1] - dz * f[0], dx * f[0] + dz * f[1]);          // + = the face turns INTO the plot
      const e = { edge: i, a, b, kind: side.kind, street: side.street, length: len, skewDeg: phi * M.RAD, teeth: 0, toothLength: 0, toothDepth: 0, line: null, door: null };
      const isDoor = i === h.doorSide;
      // door: 2 m wide in the great houses (R5 2.1: House III and the largest house), 1.3 to 1.6 m in large ones, 0.9 to 1.2 m otherwise
      const dw = h.cls === 'mansion' ? 2.0 : big ? r.range(1.3, 1.6) : r.range(0.9, 1.2), dh = h.cls === 'mansion' ? r.range(3.0, 3.5) : big ? Math.min(3.4, dw * r.range(2.1, 2.4)) : dw * r.range(2.4, 2.8);
      const sDoor = isDoor ? (h.door[0] - a[0]) * dx + (h.door[1] - a[1]) * dz : -1;
      if (h.sawTooth && (side.kind === 's' || side.kind === 'o') && Math.abs(phi) > 2.5 * M.DEG && Math.abs(phi) <= 24 * M.DEG && len > 3) {
        const c = Math.cos(phi), s = Math.sin(Math.abs(phi)), sg = phi > 0 ? 1 : -1;
        // tooth length 1.02 to 2.04 m in whole bricks, shorter where the skew is strong (steps stay under 0.6 m deep)
        // ... and longer where it is weak, so that a step is at least 0.15 m deep wherever 2.04 m of face allow it (SPEC 3.15: 0.15 to 0.55 m)
        const tp = Math.tan(Math.abs(phi));
        const Lt = h.toothLength || Math.max(Math.min(2.04, 0.34 * Math.ceil(0.15 / tp / 0.34)), Math.min(0.34 * r.int(3, 6), Math.max(1.02, 0.34 * Math.floor(0.58 / tp / 0.34))));
        const pitch0 = Lt / c;
        // tooth boundaries along the plot line; the tooth that holds the door is a longer flat panel
        const cuts = [0];
        let panelAt = -1;
        const panel = (dw + 1.2) / c;
        if (isDoor && len > panel + 0.2) {
          let p0 = Math.max(0, Math.min(len - panel, sDoor - panel / 2));
          const nb = Math.round(p0 / pitch0);
          if (nb > 0) for (let k = 1; k <= nb; k++) cuts.push((p0 * k) / nb); else p0 = 0;
          const na = Math.round((len - p0 - panel) / pitch0), pe = na > 0 ? Math.max(p0 + panel, sDoor + panel / 2) : len;
          panelAt = cuts.length - 1;
          cuts.push(Math.min(len, pe));
          for (let k = 1; k <= na; k++) cuts.push(pe + ((len - pe) * k) / na);
          cuts[cuts.length - 1] = len;
        } else {
          const nt = Math.max(1, Math.round(len / pitch0));
          for (let k = 1; k <= nt; k++) cuts.push((len * k) / nt);
          if (isDoor) panelAt = Math.min(nt - 1, Math.floor((sDoor / len) * nt));
        }
        const nxI = -dz, nzI = dx, line = [[a[0], a[1]]];
        let doorPt = null;
        for (let k = 0; k + 1 < cuts.length; k++) {
          const s0 = cuts[k], s1 = cuts[k + 1], w = s1 - s0, depth = w * c * s;
          // the inner corner of the tooth: at the far end of the face (phi > 0) or at its near end (phi < 0)
          const sc = sg > 0 ? s0 + w * c * c : s1 - w * c * c;
          let inner = [a[0] + dx * sc + nxI * depth, a[1] + dz * sc + nzI * depth];
          if (!M.pointInPolygon(inner[0], inner[1], P)) inner = [a[0] + dx * sc, a[1] + dz * sc];          // a sharp corner of the plot: no step there
          line.push(inner);
          if (k + 2 < cuts.length) line.push([a[0] + dx * s1, a[1] + dz * s1]);
          if (k === panelAt) { const tip = sg > 0 ? s0 : s1; doorPt = [(a[0] + dx * tip + inner[0]) / 2, (a[1] + dz * tip + inner[1]) / 2]; }
        }
        line.push([b[0], b[1]]);
        e.line = line; e.teeth = cuts.length - 1; e.toothLength = Lt; e.toothDepth = Lt * Math.tan(Math.abs(phi));
        if (isDoor && doorPt) e.door = { x: doorPt[0], z: doorPt[1], width: Math.min(dw, Math.max(0.8, (cuts[panelAt + 1] - cuts[panelAt]) * c - 0.4)), height: dh, dir: [f[1], -f[0]], along: f };
      }
      if (isDoor && !e.door) e.door = { x: h.door[0], z: h.door[1], width: dw, height: dh, dir: h.doorDir, along: [dx, dz] };
      out.push(e);
    }
    return out;
  }

  return { make, facade, groundSpan };
}
