// js/modules/riverworks/quays.js — the baked-brick river quays (SPEC 3.2) on the hard edges of the ground model.
//
// Section of Nebuchadnezzar's quay (world.json river.quays[2].type): 5.25 m thick below with a 1.65 m walkway at
// -0.4, upper wall 3.6 m thick to +4.0, square corners, no towers. Where the ground behind stands higher than
// +3.1 the top steps up in quarter metres so that the upper wall always stands at least 0.9 m above the lane.
// The terrain keeps bed level for 1 m behind the hard-edge line and stands at ground level from there on
// (docs/ground.md 3), so nothing can be cut below the ground further inland than that: the river face of the
// UPPER wall stands 0.5 m behind the line and walkway and lower wall lie in front of it, 1.3 m out in the river
// polygon (registered with the water as obstacles so that the foam line follows the masonry).
//   d = metres from the hard-edge line toward the land, y = datum level.
import * as M from '../../core/mathx.js';
import { hash1 } from '../../core/rng.js';
import { makeLine, sweep, lineBox } from './sweep.js';

export const Q = {
  BL: 0.06,          // batter of the lower wall (horizontal run per metre of height)
  BU: 0.03,          // batter of the upper wall
  D_UP: 0.5,         // river face of the upper wall at walkway level
  WALK_W: 1.65,      // walkway (SPEC 3.2)
  UP_T: 3.6,         // thickness of the upper wall (SPEC 3.2)
  BULGE: 1.5,        // how far the walkway is widened at a stair
  LAND: 1.3,         // projection of the stair head in front of an opening
  OPEN_W: 2.4,       // opening in the upper wall at a street end
};
// vertex tints are LINEAR multipliers: 0.3 is what reads as wet, bitumen-stained brick
// (and a sunlit wall sits on the shoulder of the tone curve, where a factor of 4 in albedo is a fifth in display value)
export const WET = [0.13, 0.14, 0.115], DAMP = [0.33, 0.33, 0.29], FLOOD = [0.66, 0.65, 0.59];
/** Tone of the quay brick against the plain palette brick: a little deeper and redder than the lime-washed walls behind it. */
export const BRICK = [0.86, 0.775, 0.67];
const tb = (k) => [BRICK[0] * k, BRICK[1] * k, BRICK[2] * k];

export function buildQuays(ctx, R) {
  const { geom, ground, world, layout, water } = ctx;
  const WALK = world.levels.quayWalkwayRiver, TOP = world.levels.riverQuayTop;
  const D_LOW = Q.D_UP - Q.WALK_W, D_BACK = Q.D_UP + Q.UP_T;
  const quayEdges = (ground.hardEdges || []).filter((e) => e.kind === 'quay' && e.body === 'river');     // none with the stub ground: then only the bridge is built
  const stats = { metres: 0, ghats: 0, drains: 0, posts: 0, topMin: Infinity, topMax: -Infinity, gaps: 0 };
  const posts = [], pipes = [], rings = [], samples = {};

  // ---------------------------------------------------------------------------------------- profiles ----
  const lowFace = (dLow, foot, extra = 1) => {
    const c = (k) => k.map((v) => Math.max(0.06, 1 - (1 - v) * extra));
    return [
      { d: dLow - Q.BL * (WALK - foot), y: foot, c: c(WET) },
      { d: dLow - Q.BL * (WALK + 3.0), y: -3.0, c: c(WET) },
      { d: dLow - Q.BL * (WALK + 2.4), y: -2.4, c: c(DAMP) },
      { d: dLow - Q.BL * (WALK + 1.5), y: -1.5, c: c(FLOOD) },
      { d: dLow, y: WALK, c: 0.9 * (extra > 1 ? 0.7 : 1) },
    ];
  };
  /** Nebuchadnezzar section. o: { T, foot, shift (walkway widened riverward), stain (a drain streak) } */
  const profPlain = (o) => {
    const T = o.T, up = Q.D_UP, cop = up + Q.BU * (T - 0.26 - WALK);
    return [
      ...lowFace(D_LOW - (o.shift || 0), o.foot, o.stain ? 1.3 : 1),
      { d: up, y: WALK, c: 0.4 },
      { d: up + Q.BU * 0.7, y: WALK + 0.7, c: 0.86 },
      { d: cop, y: T - 0.26, c: 1 }, { d: cop - 0.12, y: T - 0.26, c: 0.8 }, { d: cop - 0.12, y: T, c: 1.04 },
      { d: D_BACK, y: T, c: 0.96 }, { d: D_BACK, y: o.foot, c: 0.9 },
    ];
  };
  /** The same with an opening: the upper wall is cut down to the floor F and the stair head projects LAND m. */
  const profOpen = (o) => [
    ...lowFace(D_LOW - (o.shift || 0), o.foot),
    { d: Q.D_UP - Q.LAND, y: WALK, c: 0.6 }, { d: Q.D_UP - Q.LAND, y: o.F, c: 1 },
    { d: D_BACK, y: o.F, c: 0.96 }, { d: D_BACK, y: o.foot, c: 1 },
  ];
  /** Older (Nabopolassar) quay at the bridge heads: face on the line, a narrow ledge at -1.4, top at street level. */
  const LEDGE = -1.4;
  const profLow = (o) => {
    const b = 0.04, f = (y) => b * (y + 3), up = f(LEDGE) + 0.6, cop = up + 0.03 * (o.T - 0.2 - LEDGE);
    return [
      { d: f(o.foot), y: o.foot, c: WET }, { d: 0, y: -3.0, c: WET }, { d: f(-2.4), y: -2.4, c: DAMP }, { d: f(LEDGE), y: LEDGE, c: FLOOD },
      { d: up, y: LEDGE, c: 0.86 }, { d: cop, y: o.T - 0.2, c: 1 }, { d: cop - 0.1, y: o.T - 0.2, c: 0.93 }, { d: cop - 0.1, y: o.T, c: 1 },
      { d: 1.8, y: o.T, c: 1 }, { d: 1.8, y: o.foot, c: 1 },
    ];
  };
  /** Bridge abutment: sheer face on the line up to the bearing shelf of the deck beams, a back wall to street level. */
  const profShelf = (o) => {
    const b = 0.04, f = (y) => b * (y + 3);
    return [
      { d: f(o.foot), y: o.foot, c: WET }, { d: 0, y: -3.0, c: WET }, { d: f(-2.4), y: -2.4, c: DAMP }, { d: f(-1.5), y: -1.5, c: FLOOD },
      { d: f(o.shelf), y: o.shelf, c: 1 }, { d: 0.75, y: o.shelf, c: 0.8 }, { d: 0.75, y: o.T, c: 0.95 }, { d: 1.8, y: o.T, c: 1 }, { d: 1.8, y: o.foot, c: 1 },
    ];
  };
  /** Projecting footing course at the foot of the palace river walls (the walls themselves belong to `palaces`). */
  const profFoot = (o) => [
    { d: -0.55, y: o.foot, c: WET }, { d: -0.55, y: -3.0, c: WET }, { d: -0.55, y: -2.45, c: DAMP }, { d: -0.4, y: -2.2, c: FLOOD },
    { d: 1.6, y: -2.2, c: 1 }, { d: 1.6, y: o.foot, c: 1 },
  ];
  const DAM_BACK = 1.73;
  /** A wall standing in water on both sides (the connecting piece that closes the ditch of the West Fortification). */
  const profDam = (o) => [
    { d: -0.9, y: o.foot, c: WET }, { d: -0.9, y: -3.0, c: WET }, { d: -0.9, y: -2.4, c: DAMP }, { d: -0.9, y: -1.5, c: FLOOD }, { d: -0.9, y: o.T, c: 1 },
    { d: DAM_BACK, y: o.T, c: 1 }, { d: DAM_BACK, y: -1.5, c: FLOOD }, { d: DAM_BACK, y: -2.4, c: DAMP }, { d: DAM_BACK, y: -3.0, c: WET }, { d: DAM_BACK, y: o.foot, c: WET },
  ];
  const profLintel = (o) => [{ d: -0.9, y: o.soffit, c: 0.8 }, { d: -0.9, y: o.T, c: 1 }, { d: DAM_BACK, y: o.T, c: 1 }, { d: DAM_BACK, y: o.soffit, c: 0.8 }];
  const KINDS = {
    plain: { prof: profPlain, skipLast: true, face: (o) => D_LOW - (o.shift || 0) - Q.BL * (WALK + 3) },
    open: { prof: profOpen, skipLast: true, face: (o) => D_LOW - (o.shift || 0) - Q.BL * (WALK + 3) },
    low: { prof: profLow, skipLast: true, face: () => 0 },
    shelf: { prof: profShelf, skipLast: true, face: () => 0 },
    foot: { prof: profFoot, skipLast: true, face: () => -0.55 },
    dam: { prof: profDam, skipLast: true, face: () => -0.9 },
    lintel: { prof: profLintel, skipLast: false, face: () => -0.9 },
  };

  // ------------------------------------------------------------------------------------- one bank line ----
  /**
   * zones: [{ s0, s1, kind, ...params }] in order, the last one that contains a point wins; kind 'gap' = nothing.
   * extra: chainages that must be stations; drains: chainages of drain outlets (plain cells only).
   */
  function run(line, foot, zones, extra = [], drains = [], tintSeed = 101) {
    const bp = new Set([0, line.length]);
    for (const z of zones) { bp.add(M.clamp(z.s0, 0, line.length)); bp.add(M.clamp(z.s1, 0, line.length)); }
    for (const v of line.vertices) bp.add(v);
    for (const e of extra) bp.add(e);
    for (const d of drains) { bp.add(d - 0.5); bp.add(d); bp.add(d + 0.5); }
    let cuts = [...bp].filter((s) => s >= 0 && s <= line.length).sort((a, b) => a - b).filter((s, i, a) => i === 0 || s - a[i - 1] > 1e-3);
    // no cell longer than 16 m (vertex AO, tiles)
    const fine = [];
    for (let i = 0; i < cuts.length - 1; i++) { const a = cuts[i], b = cuts[i + 1], n = Math.max(1, Math.ceil((b - a) / 8)); for (let k = 0; k < n; k++) fine.push(a + ((b - a) * k) / n); }
    fine.push(cuts[cuts.length - 1]); cuts = fine;
    const zoneAt = (s) => { let hit = null; for (const z of zones) if (s >= z.s0 && s <= z.s1) hit = z; return hit; };
    const drainSet = drains.map((d) => Math.round(d * 1000));
    const w = geom.writer({ verts: 4096, color: true });
    let cur = null;                                               // { zone, stations }
    const flush = () => {
      if (cur && cur.stations.length > 1) {
        const K = KINDS[cur.zone.kind], np = cur.stations[0].prof.length;
        sweep(w, cur.stations, { skip: K.skipLast ? new Set([np - 1]) : null });
      }
      cur = null;
    };
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1], z = zoneAt((a + b) / 2);
      if (!z || z.kind === 'gap') { flush(); continue; }
      const K = KINDS[z.kind], o = { foot, ...z };
      const station = (s) => {
        const prof = K.prof({ ...o, stain: z.kind === 'plain' && !z.shift && drainSet.includes(Math.round(s * 1000)) });
        // every station has its own tone (brick batches, repairs, weathering): +-7 %, a little warmer or greyer
        const q = Math.round(s * 4), k = 0.8 + 0.4 * hash1(q, tintSeed) * hash1(q, tintSeed + 2) + 0.12 * hash1(Math.floor(s / 60), tintSeed + 3), warm = 0.1 * (hash1(q, tintSeed + 1) - 0.5);
        for (const pt of prof) { const c = typeof pt.c === 'number' ? [pt.c, pt.c, pt.c] : pt.c; pt.c = [c[0] * (k + warm) * BRICK[0], c[1] * k * BRICK[1], c[2] * (k - warm) * BRICK[2]]; }
        return { f: line.at(s), prof };
      };
      if (!cur || cur.zone !== z) { flush(); cur = { zone: z, stations: [station(a)] }; }
      cur.stations.push(station(b));
      stats.metres += b - a;
    }
    flush();
    return w;
  }

  /** Level of the top of the upper wall along [s0, s1]: piecewise constant, in quarter metres. */
  function topZones(line, s0, s1, base = {}) {
    const step = 4, n = Math.max(1, Math.ceil((s1 - s0) / step)), raw = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n; let g = -Infinity;
      // the ground under the wall and in the lane right behind it (a made terrace further back has its own retaining wall)
      const f = line.at(s), mitre = Math.hypot(f.nx, f.nz);
      for (const d of [0.6, 2, 3.5, 4.6, 6.5]) { const k = d / mitre, x = f.x + f.nx * k, z = f.z + f.nz * k, h = ground.height(x, z); if (h < TOP + 2.2) g = Math.max(g, h); }
      raw.push(M.clamp(Math.ceil((g + 0.9) * 4 - 1e-6) / 4, TOP, TOP + 2));
    }
    const top = raw.map((_, i) => Math.max(...raw.slice(Math.max(0, i - 3), i + 4)));       // a step is at least 24 m long
    const out = [];
    let i0 = 0;
    for (let i = 1; i <= n + 1; i++) if (i === n + 1 || top[i] !== top[i0]) {
      const a = s0 + ((s1 - s0) * Math.max(0, i0 - 0.5)) / n, b = s0 + ((s1 - s0) * Math.min(n, i - 0.5)) / n;
      out.push({ ...base, s0: i0 === 0 ? s0 : a, s1: i === n + 1 ? s1 : b, kind: 'plain', T: top[i0] });
      stats.topMin = Math.min(stats.topMin, top[i0]); stats.topMax = Math.max(stats.topMax, top[i0]);
      i0 = i;
    }
    return out;
  }
  const topAt = (zs, s) => { let T = TOP; for (const z of zs) if (z.kind === 'plain' && s >= z.s0 && s <= z.s1) T = z.T; return T; };
  /** Ground behind the wall at s (highest of the strip the opening crosses). */
  const groundBehind = (line, s, d0 = 0.6, d1 = 7) => { let g = -Infinity; for (let d = d0; d <= d1; d += 0.8) { const p = line.point(s, d); g = Math.max(g, ground.height(p[0], p[1])); } return g; };
  /** Stretches where water lies behind the line (canal and ditch mouths): [[s0, s1], ...] */
  function mouths(line, s0, s1) {
    const out = []; let a = null;
    for (let s = s0; s <= s1 + 1e-6; s += 0.25) {
      const p = line.point(s, 1.6), q = line.point(s, 3.2), wet = ground.height(p[0], p[1]) < -2.6 && ground.height(q[0], q[1]) < -2.6;
      if (wet && a === null) a = s;
      if (!wet && a !== null) { out.push([a, s - 0.25]); a = null; }
    }
    if (a !== null) out.push([a, s1]);
    return out;
  }

  // --------------------------------------------------------------------------------------------- ghats ----
  /**
   * A street end on the quay: an opening in the upper wall, a stair head, a flight along the wall down to the
   * walkway (widened here), a second flight from the walkway into the water. dir = +1: the flights run toward +s.
   * Returns the zones it needs and adds stairs, kerbs, posts, mooring data.
   */
  function ghat(line, foot, sc, dir, T, bank, parts, zones) {
    const F = groundBehind(line, sc) + 0.06, rise1 = F - WALK, n1 = Math.max(6, Math.round(rise1 / 0.185)), r1 = rise1 / n1, tread1 = 0.29, run1 = n1 * tread1;
    const n2 = 18, r2 = 0.186, tread2 = 0.3, run2 = n2 * tread2;
    const sOpen0 = sc - Q.OPEN_W / 2, sOpen1 = sc + Q.OPEN_W / 2, sHead = sc + dir * Q.OPEN_W / 2, sFoot = sHead + dir * run1, sEnd = sFoot + dir * 3.0, sStart = sc - dir * (Q.OPEN_W / 2 + 1.4);
    const a = Math.min(sStart, sEnd), b = Math.max(sStart, sEnd);
    zones.push({ s0: a, s1: b, kind: 'plain', T, shift: Q.BULGE });
    zones.push({ s0: sOpen0, s1: sOpen1, kind: 'open', F, shift: Q.BULGE });
    const f = line.at(sc), climb = [-dir * f.tx, -dir * f.tz];                       // the upper flight climbs back toward the opening
    const az = M.dirToAz(climb[0], climb[1]);
    // upper flight: on the walkway against the wall, 1.3 m wide (0.15 m of it bedded in the wall)
    const dc1 = Q.D_UP - Q.LAND / 2 + 0.075, p1 = line.point(sFoot, dc1);
    parts.brick.push(geom.paint(geom.stairs({ x: p1[0], z: p1[1], azDeg: az, width: Q.LAND + 0.15, steps: n1, riser: r1, tread: tread1, base: WALK, sink: 0.25, back: false }), tb(0.97)));
    // kerbs of the stair head: on the river edge and on the side away from the flight
    const kb = 0.55, kc = tb(0.9);
    parts.brick.push(lineBox(geom, line, sOpen0, sOpen1, Q.D_UP - Q.LAND, Q.D_UP - Q.LAND + 0.3, F, F + kb, kc));
    parts.brick.push(lineBox(geom, line, Math.min(sc - dir * Q.OPEN_W / 2, sc - dir * (Q.OPEN_W / 2 - 0.3)), Math.max(sc - dir * Q.OPEN_W / 2, sc - dir * (Q.OPEN_W / 2 - 0.3)), Q.D_UP - Q.LAND + 0.3, Q.D_UP + Q.BU * (F - WALK) + 0.02, F, F + kb, kc));
    // lower flight: continues beyond the widened walkway down into the water (its foot 0.75 m under the surface)
    const dLow = D_LOW - Q.BULGE, dc2 = dLow + (Q.BULGE + 0.1) / 2, base2 = WALK - n2 * r2, sFoot2 = sEnd + dir * run2, p2 = line.point(sFoot2, dc2);
    parts.brick.push(geom.paint(geom.stairs({ x: p2[0], z: p2[1], azDeg: az, width: Q.BULGE + 0.1, steps: n2, riser: r2, tread: tread2, base: base2, sink: base2 - foot, back: false }), tb(0.88)));
    // the water sees the widened quay and the stair as an obstacle (foam line, calm lee)
    const o0 = Math.min(a, sFoot2), o1 = Math.max(b, sFoot2), dOut = dLow - Q.BL * (WALK + 3);
    rings.push([line.point(o0, dOut), line.point(o1, dOut), line.point(o1, 0.2), line.point(o0, 0.2)]);
    // mooring posts on the widened walkway
    for (const s of [sFoot + dir * 0.6, sFoot + dir * 2.4, sHead + dir * run1 * 0.4, sc - dir * 0.8]) { const p = line.point(s, dLow + 0.32); posts.push({ x: p[0], y: WALK, z: p[1], seed: Math.round(s * 7) }); }
    R.stairs.push({ from: [...line.point(sHead, dc1).slice(0, 1), F, line.point(sHead, dc1)[1]], to: [p1[0], WALK, p1[1]], width: Q.LAND, bank });
    R.stairs.push({ from: [...line.point(sEnd, dc2).slice(0, 1), WALK, line.point(sEnd, dc2)[1]], to: [p2[0], base2, p2[1]], width: Q.BULGE, bank });
    const gate = line.point(sc, D_BACK + 1.5);
    R.ghats.push({ bank, s: sc, dir, T, x: f.x, z: f.z, floor: F, gate: [gate[0], F, gate[1]], foot: [p2[0], -3, p2[1]], extent: [Math.min(o0, o1), Math.max(o0, o1)], waterStair: [sEnd, sFoot2], face: dOut });
    stats.ghats++;
    return { a: Math.min(o0, o1), b: Math.max(o0, o1) };
  }

  /** Choose ghat positions on [s0, s1] from the street ends of the layout (squares of use 'quay') and extra points. */
  function ghatSites(line, s0, s1, wanted, keepOut) {
    const out = [];
    for (const wnt of wanted.sort((p, q) => p.s - q.s)) {
      let s = wnt.s, dir = wnt.dir || (hash1(Math.round(s), 71) < 0.5 ? 1 : -1);
      const fits = (ss, dd) => {
        const g = groundBehind(line, ss), run1 = Math.round((g + 0.06 - WALK) / 0.185) * 0.29;
        const a = Math.min(ss - dd * 2.7, ss + dd * (1.2 + run1 + 3.0 + 5.6)), b = Math.max(ss - dd * 2.7, ss + dd * (1.2 + run1 + 3.0 + 5.6));
        if (a < s0 + 2 || b > s1 - 2) return false;
        for (const v of line.vertices) if (v > a - 1.5 && v < b + 1.5) return false;
        for (const k of keepOut) if (k[0] < b + 3 && k[1] > a - 3) return false;
        for (const o of out) if (o.a < b + 14 && o.b > a - 14) return false;
        return [a, b];
      };
      let ok = null;
      search: for (const shift of [0, 3, -3, 6, -6, 10, -10, 15, -15, 22, -22]) for (const dd of [dir, -dir]) { const r = fits(wnt.s + shift, dd); if (r) { ok = r; s = wnt.s + shift; dir = dd; break search; } }
      if (ok) out.push({ s, dir, a: ok[0], b: ok[1] });
    }
    return out;
  }
  const squaresOn = (line, maxDist = 26) => (layout.squares || []).filter((q) => q.use === 'quay').map((q) => ({ q, h: line.locate(q.center[0], q.center[1]) })).filter(({ h }) => h.dist < maxDist && h.d > 0).map(({ h }) => ({ s: h.s }));
  /** Drain outlets: one every 30 to 45 m on the plain stretches, clear of ghats. */
  function drainSites(line, s0, s1, keepOut, seed) {
    const out = [];
    for (let s = s0 + 12 + 10 * hash1(seed, 3); s < s1 - 8; s += 30 + 15 * hash1(Math.round(s), seed)) {
      if (keepOut.some((k) => s > k[0] - 2.5 && s < k[1] + 2.5) || line.vertices.some((v) => Math.abs(v - s) < 1.5)) continue;
      out.push(s);
    }
    return out;
  }
  const addDrains = (line, list, dFace, y) => { for (const s of list) { const f = line.at(s), nl = Math.hypot(f.nx, f.nz); pipes.push({ x: f.x + f.nx * dFace(y), y, z: f.z + f.nz * dFace(y), ox: -f.nx / nl, oz: -f.nz / nl }); stats.drains++; } };
  /** Mooring posts along a plain walkway: every `pitch` m, clear of the ghats (which bring their own). */
  const addPosts = (line, s0, s1, keepOut, pitch, d, y) => { for (let s = s0 + pitch * 0.5; s < s1; s += pitch) { if (keepOut.some((k) => s > k[0] - 1 && s < k[1] + 1)) continue; const p = line.point(s, d); posts.push({ x: p[0], y, z: p[1], seed: Math.round(s * 3) }); } };

  /** The upper wall stops at the bridge head in a terminal pier, a little taller and proud of the wall (SPEC 3.2: "ends in a return"). */
  const endPier = (line, s0, s1, T) => brick.push(lineBox(geom, line, Math.min(s0, s1), Math.max(s0, s1), Q.D_UP - 0.14, D_BACK + 0.5, WALK - 0.3, T + 0.34, tb(0.97)));
  /**
   * The landing stair of the older quay at a bridge head: a stair head one step below the quay top, then a flight along
   * the sheer face down into the water. Runs from s0 toward dir. Returns [sMin, sMax].
   */
  function lowStair(line, foot, s0, dir, T, bank) {
    const top = T - 0.18, n = Math.round((top + 3.75) / 0.185), r = (top + 3.75) / n, tread = 0.3, runL = n * tread, sHead = s0 + dir * 2.0, sFoot = sHead + dir * runL;
    brick.push(lineBox(geom, line, Math.min(s0, sHead), Math.max(s0, sHead), -1.5, 0.8, foot, top, tb(0.95)));
    const f = line.at((s0 + sFoot) / 2), p = line.point(sFoot, -0.35), az = M.dirToAz(-dir * f.tx, -dir * f.tz);
    brick.push(geom.paint(geom.stairs({ x: p[0], z: p[1], azDeg: az, width: 2.3, steps: n, riser: r, tread, base: top - n * r, sink: top - n * r - foot, back: false }), tb(0.9)));
    rings.push([line.point(Math.min(s0, sFoot), -1.55), line.point(Math.max(s0, sFoot), -1.55), line.point(Math.max(s0, sFoot), 0.2), line.point(Math.min(s0, sFoot), 0.2)]);
    const h = line.point(sHead, -0.75);
    R.stairs.push({ from: [h[0], top, h[1]], to: [line.point(sFoot, -0.75)[0], -3.0, line.point(sFoot, -0.75)[1]], width: 1.5, bank });
    for (const s of [s0 + dir * 0.4, s0 - dir * 2.2]) { const q = line.point(s, 0.35); posts.push({ x: q[0], y: T, z: q[1], seed: Math.round(s * 11) }); }
    return [Math.min(s0, sFoot), Math.max(s0, sFoot)];
  }

  // ------------------------------------------------------------------------------------- the east bank ----
  const brick = [];
  const parts = { brick };
  const bridge = world.bridge;
  const lines = {};
  {
    const e = quayEdges.find((h) => h.id === 'quay:river:2');
    if (e) {
      const line = makeLine(e.polyline, e.land), foot = e.foot - 0.6, zones = [];
      lines.east = line;
      const fortEnd = world.river.quays[1].polyline; const sFort = line.locate(...fortEnd[fortEnd.length - 1]).s;       // south-east corner of the West Fortification
      const neb = world.river.quays[2], sCorner = line.locate(1.0, -581.9).s;
      const sBrN = line.locate(...neb.bridgeReach.from).s, sBrS = line.locate(...neb.bridgeReach.to).s, sAb = line.locate(...bridge.eastAbutment).s;
      // 1. palace fronts (North Palace river wall, West Fortification): a footing course only, open at the canal mouth
      zones.push({ s0: 0, s1: sFort, kind: 'foot' });
      for (const m of mouths(line, 0, sFort)) { zones.push({ s0: m[0] - 0.4, s1: m[1] + 0.4, kind: 'gap' }); stats.gaps++; }
      // 2. the connecting piece across the ditch of the West Fortification, pierced by openings; then the end of the dry quay terrace
      const dm = mouths(line, sFort, sCorner), sDitch = dm.length ? dm[dm.length - 1][1] + 0.4 : sFort + 11.6;
      const Tdam = groundBehind(line, sDitch + 3, 0.6, 5) + 0.15;
      zones.push({ s0: sFort, s1: sDitch, kind: 'dam', T: Tdam });
      const nHoles = 3, span = sDitch - sFort;
      for (let k = 0; k < nHoles; k++) { const c = sFort + (span * (k + 0.5)) / nHoles; zones.push({ s0: c - 0.55, s1: c + 0.55, kind: 'lintel', T: Tdam, soffit: -1.7 }); }
      zones.push({ s0: sDitch, s1: sCorner, kind: 'plain', T: Tdam });
      R.ditchWall = { from: line.point(sFort, 0.3), to: line.point(sDitch, 0.3), top: Tdam, holes: nHoles };
      // 3. Nebuchadnezzar's quay from the palace corner to the bridge, and from the bridge to the south wall
      zones.push(...topZones(line, sCorner, sBrN), ...topZones(line, sBrS, line.length));
      // 4. the older quay at the bridge head (SPEC 3.2 "bridge head", conjectural) with the abutment
      let gl = -Infinity; for (let s = sBrN; s <= sBrS; s += 2) gl = Math.max(gl, groundBehind(line, s, 0.6, 3));
      const Tlow = () => gl + 0.12;
      zones.push({ s0: sBrN, s1: sAb, kind: 'low', T: Tlow() }, { s0: sAb, s1: sBrS, kind: 'low', T: Tlow() });
      zones.push({ s0: sAb - 5.4, s1: sAb + 5.4, kind: 'shelf', T: bridge.deckLevel + 0.05, shelf: bridge.pierTop });
      // 5. the Libil-hegalla comes out through the quay in an open slot, 0.1 m proud of the canal lining on either side
      const keep = [[sBrN - 6, sBrS + 6]];
      for (const m of mouths(line, sCorner + 1, sBrN)) {
        zones.push({ s0: m[0] + 0.1, s1: m[1] - 0.1, kind: 'gap' }); keep.push([m[0] - 6, m[1] + 6]); R.slots.push({ line, s0: m[0] + 0.1, s1: m[1] - 0.1, T: topAt(zones, m[0]) }); stats.gaps++;
        // a pier either side of the mouth, proud of the upper wall (the terrain's canal bank reaches the quay line here)
        // (measured on the terrain mesh: within 5 m of the mouth the ground stands up to 0.3 m behind the line instead of 1 m)
        for (const [a, b] of [[m[0] - 5.6, m[0] + 0.16], [m[1] - 0.16, m[1] + 5.9]]) brick.push(lineBox(geom, line, a, b, -0.22, Q.D_UP + 0.6, WALK - 0.3, topAt(zones, (a + b) / 2) + 0.34, tb(0.95)));
      }
      // 6. street ends: squares of the layout, and the two western precinct gates that open on the quay
      const wanted = squaresOn(line).filter((q) => (q.s > sCorner + 8 && q.s < sBrN - 8) || q.s > sBrS + 8);
      const prec = world.monuments.find((m) => m.id === 'etemenankiPrecinct');
      if (prec && prec.dims.gates) for (const k of ['XI', 'XII']) { const g = prec.dims.gates[k]; if (g) wanted.push({ s: line.locate(g.x, g.z).s }); }
      const sites = [...ghatSites(line, sCorner + 6, sBrN - 4, wanted.filter((q) => q.s < sBrN), keep), ...ghatSites(line, sBrS + 4, line.length - 30, wanted.filter((q) => q.s > sBrS), keep)];
      const gh = sites.map((g) => ghat(line, foot, g.s, g.dir, Math.max(topAt(zones, g.a), topAt(zones, g.b), topAt(zones, g.s)), 'east', parts, zones));
      const occupied = [...keep, ...gh.map((g) => [g.a, g.b])];
      const drains = [...drainSites(line, sCorner + 4, sBrN - 4, occupied, 11), ...drainSites(line, sBrS + 4, line.length - 10, occupied, 12)];
      const eastRun = run(line, foot, zones, [], drains);
      brick.push(eastRun); samples.eastQuay = eastRun;
      addDrains(line, drains, (y) => D_LOW - Q.BL * (WALK - y) - 0.02, -1.0);
      addPosts(line, sCorner + 5, sBrN - 3, occupied, 13.5, D_LOW + 0.32, WALK);
      addPosts(line, sBrS + 3, line.length - 12, occupied, 13.5, D_LOW + 0.32, WALK);
      addPosts(line, sBrN + 2, sAb - 6, [], 6, 0.35, Tlow(sBrN + 2));
      addPosts(line, sAb + 6, sBrS - 1, [[sAb + 9, sAb + 27]], 6.5, 0.35, Tlow(sAb + 10));
      R.walkways.push({ bank: 'east', polyline: walkLine(line, sCorner + 1, sBrN - 0.5, 'east'), level: WALK, width: Q.WALK_W });
      R.walkways.push({ bank: 'east', polyline: walkLine(line, sBrS + 0.5, line.length - 1, 'east'), level: WALK, width: Q.WALK_W });
      endPier(line, sBrN - 1.7, sBrN + 0.06, topAt(zones, sBrN - 1)); endPier(line, sBrS - 0.06, sBrS + 1.7, topAt(zones, sBrS + 1));
      // where the inner moat joins the river the ground stands closer behind the line: the quay ends in a pier
      brick.push(lineBox(geom, line, line.length - 7, line.length + 0.06, -0.3, D_BACK + 0.5, WALK - 0.3, topAt(zones, line.length - 2) + 0.34, tb(0.97)));
      const ls = lowStair(line, foot, sAb + 12.5, 1, Tlow(), 'east');
      R.east = { line, foot, sCorner, sBrN, sBrS, sAb, sFort, sDitch, occupied, Tlow, lowStair: ls, topAt: (s) => topAt(zones, s) };
      // the foam line of the water follows the masonry that stands in front of the polygon edge
      obstacleStrip(line, sCorner, sBrN, D_LOW - Q.BL * (WALK + 3), 'quay:east:n');
      obstacleStrip(line, sBrS, line.length, D_LOW - Q.BL * (WALK + 3), 'quay:east:s');
    }
  }
  /** Centre line of the walkway from s0 to s1; at a ghat it runs on the widened part, clear of the flight. */
  function walkLine(line, s0, s1, bank) {
    const mid = (D_LOW + Q.D_UP) / 2, out = D_LOW - Q.BULGE + 0.75, gh = R.ghats.filter((g) => g.bank === bank).map((g) => [Math.min(g.s - g.dir * 2.6, g.waterStair[0]), Math.max(g.s - g.dir * 2.6, g.waterStair[0])]);
    const cuts = new Set([s0, s1]);
    for (let s = s0; s < s1; s += 12) cuts.add(s);
    for (const v of line.vertices) if (v > s0 && v < s1) cuts.add(v);
    for (const [a, b] of gh) for (const s of [a - 1.4, a + 0.4, b - 0.4, b + 1.4]) if (s > s0 && s < s1) cuts.add(s);
    return [...cuts].sort((p, q) => p - q).map((s) => line.point(s, gh.some(([a, b]) => s > a && s < b) ? out : mid));
  }
  function obstacleStrip(line, s0, s1, dOut, id) {
    if (!water.addObstacle) return;
    const n = Math.max(1, Math.ceil((s1 - s0) / 20)), outer = [], inner = [];
    for (let i = 0; i <= n; i++) { const s = s0 + ((s1 - s0) * i) / n; outer.push(line.point(s, dOut)); inner.push(line.point(s, 0.3)); }
    rings.push(Object.assign([...outer, ...inner.reverse()], { id }));
  }

  // ------------------------------------------------------------------------------------- the west bank ----
  {
    const e = quayEdges.find((h) => h.id === 'quay:river:4');
    if (e) {
      const line = makeLine(e.polyline, e.land), foot = e.foot - 0.6, zones = [];
      lines.west = line;
      const sAb = line.locate(...bridge.westAbutment).s, sL0 = sAb - 23, sL1 = sAb + 23;
      zones.push(...topZones(line, 0, sL0), ...topZones(line, sL1, line.length));
      let gl = -Infinity; for (let s = sL0; s <= sL1; s += 2) gl = Math.max(gl, groundBehind(line, s, 0.6, 3));
      const Tlow = () => gl + 0.12;
      zones.push({ s0: sL0, s1: sAb, kind: 'low', T: Tlow() }, { s0: sAb, s1: sL1, kind: 'low', T: Tlow() });
      zones.push({ s0: sAb - 5.4, s1: sAb + 5.4, kind: 'shelf', T: bridge.deckLevel + 0.05, shelf: bridge.pierTop });
      const keep = [[sL0 - 6, sL1 + 6]];
      for (const m of mouths(line, 6, line.length - 6)) { zones.push({ s0: m[0] + 0.1, s1: m[1] - 0.1, kind: 'gap' }); keep.push([m[0] - 4, m[1] + 4]); stats.gaps++; }
      const wanted = squaresOn(line).filter((q) => q.s < sL0 - 8 || q.s > sL1 + 8);
      const sites = [...ghatSites(line, 30, sL0 - 4, wanted.filter((q) => q.s < sL0), keep), ...ghatSites(line, sL1 + 4, line.length - 20, wanted.filter((q) => q.s > sL1), keep)];
      const gh = sites.map((g) => ghat(line, foot, g.s, g.dir, Math.max(topAt(zones, g.a), topAt(zones, g.b), topAt(zones, g.s)), 'west', parts, zones));
      const occupied = [...keep, ...gh.map((g) => [g.a, g.b])];
      const drains = [...drainSites(line, 20, sL0 - 4, occupied, 21), ...drainSites(line, sL1 + 4, line.length - 10, occupied, 22)];
      brick.push(run(line, foot, zones, [], drains));
      addDrains(line, drains, (y) => D_LOW - Q.BL * (WALK - y) - 0.02, -1.0);
      addPosts(line, 12, sL0 - 3, occupied, 16, D_LOW + 0.32, WALK);
      addPosts(line, sL1 + 3, line.length - 8, occupied, 16, D_LOW + 0.32, WALK);
      addPosts(line, sL0 + 2, sAb - 6, [], 6, 0.35, Tlow(sL0 + 2));
      addPosts(line, sAb + 6, sL1 - 1, [[sAb + 6, sAb + 23]], 6, 0.35, Tlow(sAb + 10));
      R.walkways.push({ bank: 'west', polyline: walkLine(line, 1, sL0 - 0.5, 'west'), level: WALK, width: Q.WALK_W });
      R.walkways.push({ bank: 'west', polyline: walkLine(line, sL1 + 0.5, line.length - 1, 'west'), level: WALK, width: Q.WALK_W });
      endPier(line, sL0 - 1.7, sL0 + 0.06, topAt(zones, sL0 - 1)); endPier(line, sL1 - 0.06, sL1 + 1.7, topAt(zones, sL1 + 1));
      const ls = lowStair(line, foot, sAb + 9.5, 1, Tlow(), 'west');
      R.west = { line, foot, sAb, sBrN: sL0, sBrS: sL1, occupied, Tlow, lowStair: ls, topAt: (s) => topAt(zones, s) };
      obstacleStrip(line, 0, sL0, D_LOW - Q.BL * (WALK + 3), 'quay:west:s');
      obstacleStrip(line, sL1, line.length, D_LOW - Q.BL * (WALK + 3), 'quay:west:n');
    }
  }

  // ---------------------------------------------------- the other river quays of the ground model (far) ----
  for (const e of quayEdges) {
    if (e.id === 'quay:river:2' || e.id === 'quay:river:4') continue;
    const line = makeLine(e.polyline, e.land), foot = e.foot - 0.6;
    lines[e.id] = line;
    if (line.length < 40) {
      // the 10 m stubs where a city wall ends at the river: a plain block of quay masonry, its face 0.35 m in front of the line
      let g = -Infinity; for (let s2 = 0; s2 <= line.length; s2 += 2) g = Math.max(g, groundBehind(line, s2, 0.6, 3.5));
      brick.push(lineBox(geom, line, 0, line.length, -0.35, D_BACK, foot, Math.max(TOP, g + 0.9), tb(0.95)));
      stats.metres += line.length;
      continue;
    }
    const zones = topZones(line, 0, line.length);
    const keep = [];
    for (const m of mouths(line, 2, line.length - 2)) { zones.push({ s0: m[0], s1: m[1], kind: 'gap' }); keep.push([m[0] - 4, m[1] + 4]); }
    const sites = ghatSites(line, 20, line.length - 20, [{ s: line.length * 0.35 }, { s: line.length * 0.75 }], keep);
    for (const g of sites) { const r = ghat(line, foot, g.s, g.dir, Math.max(topAt(zones, g.a), topAt(zones, g.b), topAt(zones, g.s)), e.id, parts, zones); keep.push([r.a, r.b]); }
    addPosts(line, 10, line.length - 10, keep, 18, D_LOW + 0.32, WALK);
    obstacleStrip(line, 0, line.length, D_LOW - Q.BL * (WALK + 3), e.id);
    brick.push(run(line, foot, zones));
  }

  if (water.addObstacle) { let k = 0; for (const r of rings) water.addObstacle(r, { id: 'riverworks:' + (r.id || 'ghat' + k++) }); }
  stats.posts = posts.length;
  stats.metres = Math.round(stats.metres);
  return { brick, posts, pipes, stats, lines, samples };
}
