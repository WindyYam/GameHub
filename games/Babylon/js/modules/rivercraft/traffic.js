// js/modules/rivercraft/traffic.js — where the boats are: the channel frame of the Euphrates, lanes that follow the
// current as closed forms of film time, the passage through the gaps of the bridge, ferries, towed barges and their
// tow paths, and the fallback moorings along the banks. Everything here is pure: pose = f(t), no state.
// OWNER: rivercraft.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

/** Chaikin corner cutting of an open polyline (ends kept) */
function chaikin(pl, it = 2) {
  let p = pl.map((q) => [q[0], q[1]]);
  for (let k = 0; k < it; k++) {
    const o = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    o.push(p[p.length - 1]); p = o;
  }
  return p;
}
/** resample a polyline at a fixed step; returns { x, z, n, step } typed arrays */
function resample(pl, step) {
  const len = M.polylineLength(pl), n = Math.max(2, Math.round(len / step) + 1), X = new Float64Array(n), Z = new Float64Array(n);
  for (let i = 0; i < n; i++) { const h = M.pointAlong(pl, (i / (n - 1)) * len); X[i] = h.x; Z[i] = h.z; }
  return { X, Z, n, step: len / (n - 1), length: len };
}
const smoothArr = (a, r) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, w = 0; for (let k = -r; k <= r; k++) { const j = Math.min(a.length - 1, Math.max(0, i + k)), q = 1 - Math.abs(k) / (r + 1); s += a[j] * q; w += q; } o[i] = s / w; } return o; };
const minArr = (a, r) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) { let m = Infinity; for (let k = -r; k <= r; k++) m = Math.min(m, a[Math.min(a.length - 1, Math.max(0, i + k))]); o[i] = m; } return o; };

/**
 * The channel frame: stations every 5 m along the smoothed centreline from 3.6 km north to 1.9 km south of the tower,
 * with the free width to either side measured against the ground model (banks, the palace bastion in the river).
 * at(s, lat) -> { x, z, dx, dz }: lat in metres, + = to the right of the current (west bank side).
 */
export function makeRiver(ctx) {
  const { world, ground } = ctx;
  const cl = world.river.centerline.filter((p) => p[1] > -3700 && p[1] < 2000);
  const R = resample(chaikin(cl, 3), 5), n = R.n;
  const TX = new Float64Array(n), TZ = new Float64Array(n), WR = new Float64Array(n), WL = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3), l = Math.hypot(R.X[b] - R.X[a], R.Z[b] - R.Z[a]) || 1;
    TX[i] = (R.X[b] - R.X[a]) / l; TZ[i] = (R.Z[b] - R.Z[a]) / l;
  }
  // nominal width from world.json (caps the march where a moat or a canal opens into the river)
  const nominal = (x, z) => { const h = M.nearestOnPolyline(x, z, cl); return M.valueAlong(cl.map((p) => p[2] || 120), h); };
  for (let i = 0; i < n; i++) {
    const rx = -TZ[i], rz = TX[i], cap = nominal(R.X[i], R.Z[i]) * 0.5 + 25;
    const march = (sgn) => { let d = 0; while (d < cap && ground.isWater(R.X[i] + rx * sgn * (d + 1), R.Z[i] + rz * sgn * (d + 1))) d += 1; return d; };
    WR[i] = march(1); WL[i] = march(-1);
  }
  const wr = smoothArr(minArr(WR, 4), 8), wl = smoothArr(minArr(WL, 4), 8);
  const idx = (s) => { const f = M.clamp(s / R.step, 0, n - 1.0001), i = Math.floor(f); return [i, f - i]; };
  const river = {
    n, step: R.step, length: R.length, X: R.X, Z: R.Z,
    halfRight: (s) => { const [i, k] = idx(s); return wr[i] + (wr[i + 1] - wr[i]) * k; },
    halfLeft: (s) => { const [i, k] = idx(s); return wl[i] + (wl[i + 1] - wl[i]) * k; },
    at(s, lat = 0) {
      const [i, k] = idx(s), over = s < 0 ? s : s > R.length ? s - R.length : 0;
      const tx = TX[i] + (TX[i + 1] - TX[i]) * k, tz = TZ[i] + (TZ[i + 1] - TZ[i]) * k, l = Math.hypot(tx, tz) || 1;
      const dx = tx / l, dz = tz / l;
      return { x: R.X[i] + (R.X[i + 1] - R.X[i]) * k + dx * over - dz * lat, z: R.Z[i] + (R.Z[i + 1] - R.Z[i]) * k + dz * over + dx * lat, dx, dz };
    },
    /** station and lateral offset of a plan point */
    locate(x, z) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = (R.X[i] - x) ** 2 + (R.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      const ex = x - R.X[best], ez = z - R.Z[best];
      return { s: best * R.step + ex * TX[best] + ez * TZ[best], lat: -ex * TZ[best] + ez * TX[best] };
    },
  };
  // ---- the bridge: its station on the channel, the gaps between the piers, the direction to pass them in ----------
  const br = world.bridge;
  const mid = river.locate(br.x, br.z);
  const a = M.azToDir(br.pierBowAzimuthDeg + 180);                   // downstream along the piers
  const abutE = br.eastAbutment, abutW = br.westAbutment, piers = br.piers.map((p) => [p.x, p.z]);
  const pts = [abutE, ...piers, abutW];                               // east to west
  const gaps = [];
  for (let i = 0; i < pts.length - 1; i++) {
    // clear water between the faces of neighbours (piers are `alongBridge` wide; the abutments are faces)
    const A = pts[i], B = pts[i + 1], d = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / d, uz = (B[1] - A[1]) / d;
    const ha = i === 0 ? 0 : br.pierSize.alongBridge / 2, hb = i === pts.length - 2 ? 0 : br.pierSize.alongBridge / 2;
    const c = (ha + (d - hb)) / 2;
    const lc = river.locate(A[0] + ux * c, A[1] + uz * c);
    gaps.push({ x: A[0] + ux * c, z: A[1] + uz * c, clear: d - ha - hb, lat: lc.lat, s: lc.s });
  }
  river.bridge = { s: mid.s, dir: a, gaps, piers, pierHalf: [br.pierSize.alongBridge / 2, br.pierSize.alongStream / 2], pierAz: br.pierBowAzimuthDeg };
  /** distance of a plan point from the nearest pier outline, negative inside (boat-shaped outline taken as its box) */
  river.pierClearance = (x, z) => {
    let best = Infinity;
    for (const p of piers) {
      const [lx, lz] = M.worldToLocal(p, br.pierBowAzimuthDeg, x, z);
      const ox = Math.abs(lx) - br.pierSize.alongBridge / 2, oz = Math.abs(lz) - br.pierSize.alongStream / 2;
      best = Math.min(best, ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz));
    }
    return best;
  };
  return river;
}

/** small motions every hull makes on the water: roll and pitch in degrees, heave in metres (pure in t) */
export function rock(kind, seed, t) {
  const p = seed * 6.283, A = kind === 'quffa' ? 1.7 : kind === 'canoe' ? 1.5 : kind === 'kelek' ? 0.25 : 0.6;
  return { roll: A * Math.sin(t * (1.1 + 0.5 * seed) + p) + 0.4 * A * Math.sin(t * 2.3 + p * 2), pitch: 0.4 * A * Math.sin(t * 0.9 + p * 3) };
}

/**
 * A boat that follows the channel. spec: { at: [x, z] (where it is at film time `t`), t, v (m/s along the channel,
 * + = downstream), kind, seed, gap (index of the bridge gap to use; default: the nearest to its lane), spin (deg) }
 * Returns poseAt(t) -> { x, y, z, headingDeg, roll, pitch }.
 */
export function lanePose(ctx, river, spec) {
  const { water } = ctx, B = river.bridge;
  const loc = river.locate(spec.at[0], spec.at[1]);
  const s0 = loc.s - spec.v * (spec.t || 0);
  const half0 = (loc.lat > 0 ? river.halfRight(loc.s) : river.halfLeft(loc.s)) || 1, f = M.clamp(loc.lat / half0, -0.92, 0.92);
  let gap = spec.gap;
  if (gap === undefined || gap === null) { let bd = Infinity; B.gaps.forEach((g, i) => { const d = Math.abs(g.lat - f * (f > 0 ? river.halfRight(B.s) : river.halfLeft(B.s))); if (d < bd && g.clear > 7) { bd = d; gap = i; } }); }
  const G = B.gaps[gap];
  const pos = (s) => {
    const lat = f * (f > 0 ? river.halfRight(s) : river.halfLeft(s)), p = river.at(s, lat);
    const w = 1 - M.smoothstep(34, 150, Math.abs(s - B.s));
    if (w <= 0) return p;
    const gx = G.x + B.dir[0] * (s - G.s), gz = G.z + B.dir[1] * (s - G.s);
    return { x: p.x + (gx - p.x) * w, z: p.z + (gz - p.z) * w };
  };
  const dirSign = spec.v >= 0 ? 1 : -1;
  const rLen = river.length || 5000;
  const sMin = 40, sSpan = Math.max(200, rLen - 80);
  return (t) => {
    const rawS = s0 + spec.v * t;
    const s = (rawS >= sMin && rawS <= rLen - 40) ? rawS : sMin + M.mod(rawS - sMin, sSpan);
    const p = pos(s), q = pos(s + 2.5 * dirSign);
    let hd = M.dirToAz(q.x - p.x, q.z - p.z);
    if (spec.spin) hd += spec.spin * Math.sin(t * 0.37 + spec.seed * 9);        // a quffa turns as it is paddled
    const r = rock(spec.kind, spec.seed, t), lv = water.level;
    return { x: p.x, y: lv + (water.heightAt(p.x, p.z, t) - lv) * (spec.kind === 'barge' || spec.kind === 'kelek' ? 0.5 : 1), z: p.z, headingDeg: M.mod(hd, 360), roll: r.roll, pitch: r.pitch, s };
  };
}

/** A ferry crossing from a to b ([x, z]) at v m/s, in mid-river at film time t; the bow points a little upstream of its track. */
export function ferryPose(ctx, spec) {
  const { water } = ctx, a = spec.from, b = spec.to, d = Math.hypot(b[0] - a[0], b[1] - a[1]), T = d / spec.v, t0 = spec.t - T * (spec.k ?? 0.5);
  const track = M.dirToAz(b[0] - a[0], b[1] - a[1]);
  return (t) => {
    const rawK = (t - t0) / T;
    let k = rawK, dir = 1;
    if (rawK < 0 || rawK > 1) {
      const m = M.mod(rawK, 2);
      if (m <= 1) { k = m; dir = 1; }
      else { k = 2 - m; dir = -1; }
    }
    const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
    const r = rock('quffa', spec.seed, t), lv = water.level;
    const hdBase = dir > 0 ? track : track + 180;
    return { x, y: lv + (water.heightAt(x, z, t) - lv), z, headingDeg: M.mod(hdBase + (spec.crab || 0) + 10 * Math.sin(t * 0.4 + spec.seed * 7), 360), roll: r.roll, pitch: r.pitch };
  };
}

/**
 * A tow: a barge hauled upstream along a bank line by a team on the path. line: [x, z] polyline of the bank or quay
 * face, listed downstream; `riverSide` = +1 if the water is to the right of travel along the list. The barge keeps
 * `off` metres out, the team walks `inland` metres behind the face, `lead` metres ahead of the bow.
 * Returns { boatPose(t), teamAt(t, k) (k-th hauler, 0 = leader), pathY(x, z) }.
 */
export function towPath(ctx, spec) {
  const { water, ground } = ctx;
  const face = resample(chaikin(spec.line, 2), 2), n = face.n;
  const P = (c, off) => {                                           // chainage (m) -> point offset `off` to the river side
    const f = M.clamp(c / face.step, 0, n - 1.0001), i = Math.floor(f), k = f - i;
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 5), l = Math.hypot(face.X[b] - face.X[a], face.Z[b] - face.Z[a]) || 1;
    const tx = (face.X[b] - face.X[a]) / l, tz = (face.Z[b] - face.Z[a]) / l;
    return { x: face.X[i] + (face.X[i + 1] - face.X[i]) * k + (-tz) * off * spec.riverSide, z: face.Z[i] + (face.Z[i + 1] - face.Z[i]) * k + tx * off * spec.riverSide, tx, tz };
  };
  const h0 = M.nearestOnPolyline(spec.at[0], spec.at[1], [...Array(n)].map((_, i) => [face.X[i], face.Z[i]]));
  const c0 = h0.s + spec.v * spec.t;                                 // the barge moves toward smaller chainage (upstream)
  const cBoat = (t) => c0 - spec.v * t;
  const pathY = spec.pathLevel !== undefined ? () => spec.pathLevel : (x, z) => ground.height(x, z);
  return {
    boatPose(t) {
      const c = cBoat(t), p = P(c, spec.off), q = P(c - 3, spec.off), r = rock('barge', spec.seed, t), lv = water.level;
      // the bow is held a few degrees off the bank against the pull of the line
      return { x: p.x, y: lv + (water.heightAt(p.x, p.z, t) - lv) * 0.5, z: p.z, headingDeg: M.mod(M.dirToAz(q.x - p.x, q.z - p.z) + 4 * spec.riverSide * -1, 360), roll: r.roll, pitch: r.pitch };
    },
    /** the k-th hauler (0 leads); spacing metres apart along the path */
    teamAt(t, k = 0, spacing = 1.6) {
      const c = cBoat(t) - spec.lead - (spec.haulers - 1 - k) * spacing;      // the last hauler walks `lead` ahead of the barge's station, the leader furthest upstream
      const p = P(c, -spec.inland), q = P(c - 2, -spec.inland);
      return { x: p.x, y: pathY(p.x, p.z), z: p.z, headingDeg: M.dirToAz(q.x - p.x, q.z - p.z) };
    },
    haulers: spec.haulers, spacing: 1.6,
  };
}

/**
 * Fallback moorings when riverworks publishes none: places along the banks of world.json where boats collect
 * (R5: the bridge landings, the embankment before Esagila, the reach below the precinct, the west bank with boats
 * drawn up, the landings north of the palaces). Returns [{ x, z, headingDeg (of the bank, downstream), nx, nz (unit, to the water), kind: 'quay' | 'bank', group }]
 */
export function fallbackMoorings(ctx, rng) {
  const { world, ground } = ctx, out = [];
  const reaches = [
    // [bank, zFrom, zTo, spacing m, group]
    ['east', -330, -262, 34, 'precinct'], ['east', -96, 128, 19, 'bridgeEast'], ['east', 196, 520, 21, 'esagila'], ['east', 560, 980, 60, 'south'],
    ['east', -575, -350, 75, 'basin'],
    ['west', -420, 100, 40, 'westBank'], ['west', 100, 132, 14, 'bridgeWest'], ['west', 170, 620, 38, 'westBank'], ['west', 640, 900, 70, 'south'],
    ['east', -1420, -1150, 30, 'north'], ['west', -980, -700, 90, 'north'],
  ];
  for (const [bank, zA, zB, spacing, group] of reaches) {
    const line = (bank === 'east' ? world.river.eastBank : world.river.westBank).filter((p) => p[1] > zA - 400 && p[1] < zB + 400);
    const ch = M.chainage(line), total = ch[ch.length - 1];
    let s = rng.range(0, spacing * 0.5);
    while (s < total) {
      const h = M.pointAlong(line, s);
      if (h.z >= zA && h.z <= zB) {
        // which side is the water: try both normals
        const r = M.rightOf(h.dir[0], h.dir[1]);
        const sgn = ground.isWater(h.x + r[0] * 6, h.z + r[1] * 6) ? 1 : ground.isWater(h.x - r[0] * 6, h.z - r[1] * 6) ? -1 : 0;
        if (sgn) {
          const b = typeof ground.bankAt === 'function' ? ground.bankAt(h.x + r[0] * sgn * 2, h.z + r[1] * sgn * 2) : null;
          out.push({ x: h.x, z: h.z, headingDeg: M.dirToAz(h.dir[0], h.dir[1]), nx: r[0] * sgn, nz: r[1] * sgn, kind: b && b.type === 'earth' ? 'bank' : 'quay', group });
        }
      }
      s += spacing * rng.range(0.7, 1.35);
    }
  }
  return out;
}

export { hash2, chaikin, resample };
