// js/modules/streets/net.js — the street net as this module needs it: which records are ours, how each one is
// cut where a more important street runs over it (so two ribbons never lie coplanar in a junction), how near
// the film comes to every point (three levels of surface detail), and how far the drawn terrain may lie from
// the ground model there (the lift of every ribbon). Pure data: no meshes.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

const CLS_RANK = { processional: 4, main: 3, lane: 2, alley: 1 };
const CELL = 32;

export function analyse(ctx) {
  const { layout, ground, film } = ctx;
  const draft = !!ctx.quality.draft;
  const WL = ground.waterLevel;

  // ------------------------------------------------------------------------------------------------------
  // 1. how near the film comes: 3D distance from a point on the ground to the camera path
  // ------------------------------------------------------------------------------------------------------
  const path = [];
  for (let t = 0; t <= film.duration + 1e-6; t += 0.1) { const p = film.pathPoseAt(t).pos; path.push(p[0], p[1], p[2]); }
  const coarse = new Map();
  const distRaw = (x, y, z) => { let m = Infinity; for (let i = 0; i < path.length; i += 3) { const dx = path[i] - x, dy = path[i + 1] - y, dz = path[i + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < m) m = d; } return Math.sqrt(m); };
  /** 3D distance (m) from the ground at (x, z) to the nearest point of the film path. Exact within 900 m, coarse beyond. */
  function filmDist(x, z) {
    const cx = Math.floor(x / 96), cz = Math.floor(z / 96), k = cx * 100003 + cz;
    let c = coarse.get(k);
    if (c === undefined) { const px = (cx + 0.5) * 96, pz = (cz + 0.5) * 96; c = distRaw(px, ground.height(px, pz), pz); coarse.set(k, c); }
    if (c > 900) return c;
    return distRaw(x, ground.height(x, z), z);
  }
  // the four levels of surface detail: 0 eye (the street an eye-level camera stands in, and the mouths of its side
  // lanes), 1 hero (a roof-skimming camera), 2 near, 3 far
  const HERO = 62, NEAR = draft ? 150 : 240, EYE_REACH = 140, EYE_SIDE = 26;
  const eyes = [];                                          // filled below, once the records exist
  const fine = new Map();
  /** Detail zone of a point, on a 4 m lattice (so that both edges of a street and its neighbours agree). */
  function zoneAt(x, z) {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4), k = cx * 1000003 + cz;
    let v = fine.get(k);
    if (v === undefined) {
      const px = (cx + 0.5) * 4, pz = (cz + 0.5) * 4, d = filmDist(px, pz);
      v = d < HERO ? 1 : d < NEAR ? 2 : 3;
      for (const e of eyes) if (M.distToSegment(px, pz, e.a[0], e.a[1], e.b[0], e.b[1])[0] < EYE_REACH && M.distToPolyline(px, pz, e.rec.pl) < EYE_SIDE) v = 0;
      fine.set(k, v);
    }
    return v;
  }

  // ------------------------------------------------------------------------------------------------------
  // 2. where the drawn terrain lies. Everybody stands things on ctx.ground.height, so a street must lie as little
  //    above it as it can; but the terrain MESH only approximates that function (to 4 .. 12 cm, twice that in the
  //    draft tier). So the mesh is evaluated here exactly as js/modules/terrain.js builds it (a restricted quadtree:
  //    leaf corners at ground.meshHeight, two triangles along the flatter diagonal, or a fan round the centre where
  //    a neighbour is finer), and every ribbon stands on max(ground.height, mesh) + a few centimetres.
  // ------------------------------------------------------------------------------------------------------
  const T = ctx.modules.terrain, exact = !!(T && T.leafSizeAt && ground.meshHeight);
  const mh = exact ? (x, z) => ground.meshHeight(x, z, T.insetAt ? T.insetAt(x, z) : undefined) : null;
  const leaves = new Map();
  let leafMiss = 0;
  function leafOf(x, z) {
    const s = T.leafSizeAt(x, z); if (!s) return null;
    const x0 = Math.floor(x / s) * s, z0 = Math.floor(z / s) * s, key = ((x0 + 40000) * 131072 + (z0 + 40000)) * 32 + Math.round(Math.log2(s) + 4);
    let L = leaves.get(key);
    if (L) return L;
    leafMiss++;
    const x1 = x0 + s, z1 = z0 + s, cx = x0 + s / 2, cz = z0 + s / 2;
    const finer = (px, pz) => { const o = T.leafSizeAt(px, pz); return o > 0 && o < s; };
    const fw = finer(x0 - 0.25, cz - s / 4), fs = finer(cx - s / 4, z1 + 0.25), fe = finer(x1 + 0.25, cz - s / 4), fn = finer(cx - s / 4, z0 - 0.25);
    const h00 = mh(x0, z0), h01 = mh(x0, z1), h11 = mh(x1, z1), h10 = mh(x1, z0);
    L = { x0, z0, s, h00, h01, h11, h10, fan: null, diagA: true };
    if (!fw && !fs && !fe && !fn) L.diagA = Math.abs(h00 - h11) <= Math.abs(h01 - h10);
    else {
      // ring of the fan in unit coordinates (u east, v south): west side going south, south going east, east going north, north going west
      const ring = [[0, 0, h00]];
      if (fw) ring.push([0, 0.5, mh(x0, cz)]); ring.push([0, 1, h01]);
      if (fs) ring.push([0.5, 1, mh(cx, z1)]); ring.push([1, 1, h11]);
      if (fe) ring.push([1, 0.5, mh(x1, cz)]); ring.push([1, 0, h10]);
      if (fn) ring.push([0.5, 0, mh(cx, z0)]);
      L.fan = { c: mh(cx, cz), ring };
    }
    leaves.set(key, L);
    return L;
  }
  /** Height of the drawn terrain mesh at (x, z) (its closed quadtree surface), or null where it cannot be told. */
  function meshY(x, z) {
    if (!exact) return null;
    const L = leafOf(x, z); if (!L) return null;
    const u = (x - L.x0) / L.s, v = (z - L.z0) / L.s;
    if (!L.fan) {
      if (L.diagA) return v >= u ? L.h00 + (L.h11 - L.h01) * u + (L.h01 - L.h00) * v : L.h00 + (L.h10 - L.h00) * u + (L.h11 - L.h10) * v;
      return u + v <= 1 ? L.h00 + (L.h10 - L.h00) * u + (L.h01 - L.h00) * v : L.h11 + (L.h01 - L.h11) * (1 - u) + (L.h10 - L.h11) * (1 - v);
    }
    // the wedge of the fan that holds the point (barycentric in the triangle centre, a, b)
    const R = L.fan.ring, n = R.length, pu = u - 0.5, pv = v - 0.5;
    let best = L.fan.c, bestErr = Infinity;
    for (let q = 0; q < n; q++) {
      const a = R[q], b = R[(q + 1) % n], au = a[0] - 0.5, av = a[1] - 0.5, bu = b[0] - 0.5, bv = b[1] - 0.5, det = au * bv - av * bu;
      if (Math.abs(det) < 1e-12) continue;
      const wa = (pu * bv - pv * bu) / det, wb = (au * pv - av * pu) / det, err = Math.max(0, -wa) + Math.max(0, -wb) + Math.max(0, wa + wb - 1);
      if (err < bestErr) { bestErr = err; best = L.fan.c + wa * (a[2] - L.fan.c) + wb * (b[2] - L.fan.c); if (err === 0) break; }
    }
    return best;
  }
  const K = draft ? 2 : 1;
  /** The level a street surface is measured from: the ground model, or the terrain mesh where that lies higher. */
  const baseY = exact ? (x, z) => { const g = ground.height(x, z), m = meshY(x, z); return m !== null && m > g && m - g < 0.6 ? m : g; } : (x, z) => ground.height(x, z);
  // without the terrain module's leaf query the lift falls back to the terrain's tolerances by detail class
  const low = [], mid = [], cb = ground.coreBounds || [-2000, -3500, 3500, 2000];
  for (const s of film.shots) {
    const k = s.keyframes, a = k[0].pos, b = k[k.length - 1].pos;
    const h = Math.min(a[1] - Math.max(ground.height(a[0], a[2]), WL), b[1] - Math.max(ground.height(b[0], b[2]), WL));
    if (h < 8) low.push([a[0], a[2], b[0], b[2]]);
    if (h < 140) { mid.push([a[0], a[2], 650], [b[0], b[2], 650]); for (const q of k) mid.push([q.look[0], q.look[2], 400]); }
  }
  const TOL = [0.04 * K, 0.07 * K, 0.12 * K, 0.25 * K, 0.3 * K];
  function terrainClass(x, z) {
    for (const q of low) if (M.distToSegment(x, z, q[0], q[1], q[2], q[3])[0] < 150) return 0;
    for (const q of mid) if (Math.hypot(x - q[0], z - q[1]) < q[2] - 24) return 1;
    if (x > cb[0] - 120 && x < cb[2] + 120 && z > cb[1] - 120 && z < cb[3] + 120) return 2;
    if (!ground.detailFade || ground.detailFade(x, z) > 0.05) return 3;
    return 4;
  }
  const liftNodes = new Map();
  // 6 cm where the close cameras are (a figure standing on ground.height is in the dust to the sole of its sandal),
  // 8.5 cm beyond 250 m, where the rows of a ribbon are up to 24 m apart
  const liftNode = (ix, iz) => { const k = ix * 1000003 + iz; let v = liftNodes.get(k); if (v === undefined) { v = exact ? M.lerp(0.06, 0.085, M.smoothstep(70, 250, filmDist(ix * 16, iz * 16))) : TOL[terrainClass(ix * 16, iz * 16)] * 1.25 + 0.04; liftNodes.set(k, v); } return v; };
  /** Lift of a ribbon above baseY at (x, z), continuous. */
  function liftAt(x, z) {
    const fx = x / 16, fz = z / 16, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    return (liftNode(ix, iz) * (1 - u) + liftNode(ix + 1, iz) * u) * (1 - v) + (liftNode(ix, iz + 1) * (1 - u) + liftNode(ix + 1, iz + 1) * u) * v;
  }

  // ------------------------------------------------------------------------------------------------------
  // 3. our records
  // ------------------------------------------------------------------------------------------------------
  const recs = [];
  let order = 0;
  for (const src of layout.streets) {
    if (src.cls === 'road') continue;                                  // environs
    const pl = src.polyline, ch = src.ch || M.chainage(pl), len = ch[ch.length - 1];
    if (!(len > 0.5)) continue;
    const r = {
      src, id: src.id, cls: src.cls, pl, ch, len, index: order++, s0: 0, s1: len, blind: !!src.blind,
      width: src.width || 3, widths: src.widths || null, seed: Math.floor(hash2(order, 77, 5) * 65536),
      rank: CLS_RANK[src.cls] || 1, pieces: [],
    };
    r.widthAt = r.widths ? (s) => { const h = hitAt(r, s); return M.lerp(r.widths[h.i], r.widths[Math.min(h.i + 1, r.widths.length - 1)], h.t); } : () => r.width;
    r.lat = (s) => { const h = r.widthAt(s) / 2; return [-h, h]; };
    r.prio = r.rank * 1000 + Math.min(99, r.width) * 10 - r.index * 1e-4;
    recs.push(r);
  }
  /** segment index and parameter of chainage s on a record */
  function hitAt(r, s) {
    const ch = r.ch; let i = 0;
    // (streets have few vertices: a linear scan is the fastest thing here)
    while (i < ch.length - 2 && ch[i + 1] < s) i++;
    const l = ch[i + 1] - ch[i];
    return { i, t: l > 0 ? M.clamp((s - ch[i]) / l) : 0 };
  }
  /** point, direction and right-hand normal at chainage s */
  function at(r, s) {
    const h = hitAt(r, s), a = r.pl[h.i], b = r.pl[h.i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
    return { x: a[0] + (b[0] - a[0]) * h.t, z: a[1] + (b[1] - a[1]) * h.t, dx, dz, rx: -dz, rz: dx, i: h.i, t: h.t };
  }

  // the Processional Way: ours from the south face of the Ishtar Gate to the east abutment of the bridge. Its earth
  // strip is the level ground the ground model makes beside the roadway (the "open strip" of SPEC 3.7): 10 m either
  // side on the north-south stretch, from the precinct wall to 12 m south of the centre line on the west-east one.
  const pw = recs.find((r) => r.id === 'processionalWay');
  if (pw) {
    const gate = ctx.W.hasMonument && ctx.W.hasMonument('ishtarGate') ? ctx.W.monument('ishtarGate') : null;
    const south = gate && gate.dims && gate.dims.axis ? gate.dims.axis.south : [346.1, -694.6];
    pw.s0 = M.nearestOnPolyline(south[0], south[1], pw.pl).s;
    const turn = ctx.world.streets.find((s) => s.id === 'processionalWay')?.turnToBridge || [346.2, 200.1];
    pw.turn = M.nearestOnPolyline(turn[0], turn[1], pw.pl).s;
    // where the Libil-hegalla passes under the street (a culvert between retaining walls: SPEC 3.3) the made ground ends
    // in a sheer face inside the 10 m strip: the earth strip stops half a metre short of it (furniture.js builds the walls)
    const cross = pw.ch[16], cliffs = new Map();
    const cliff = (s) => {
      const k = Math.round(s * 2); let v = cliffs.get(k);
      if (!v) {
        const p = at(pw, k / 2), y0 = ground.height(p.x, p.z); v = [-10, 10];
        for (const sg of [-1, 1]) for (let l = 4; l <= 10.01; l += 0.25) if (ground.height(p.x + p.rx * sg * l, p.z + p.rz * sg * l) < y0 - 2.5) { v[sg < 0 ? 0 : 1] = sg * (l - 0.75); break; }
        cliffs.set(k, v);
      }
      return v;
    };
    pw.lat = (s) => {
      if (s > pw.turn + 12) return [-12, 5.75];
      if (s > pw.turn - 12) { const k = M.smoothstep(pw.turn - 12, pw.turn + 12, s); return [M.lerp(-10, -12, k), M.lerp(10, 5.75, k)]; }
      if (Math.abs(s - cross) < 40) return cliff(s);
      return [-10, 10];
    };
    pw.corridor = true;
    // the paved roadway lies on this strip: the earth under it is drawn a little lower (paving.js lays the slabs)
    pw.roadHalf = (s) => (s < pw.ch[16] + 8 ? 5.265 : 3.2);
    pw.under = (s, l) => Math.abs(l) < pw.roadHalf(s) - 0.25;
    // its bends are rounded (R2 7.1: "slight wobble past the South Palace"), except at the gate and at the turn to the bridge
    pw.smooth = (s) => M.smoothstep(pw.s0 + 4, pw.s0 + 24, s) * (1 - M.smoothstep(pw.turn - 30, pw.turn - 12, s)) + M.smoothstep(pw.turn + 12, pw.turn + 30, s) * (1 - M.smoothstep(pw.s1 - 24, pw.s1 - 6, s));
    // out of the gate the roadway runs on along the axis of the gate and swings into the line of the street over 68 m
    // (world.json bends the centre line by 9 degrees at the south face itself and back by 4 degrees 8 m on)
    if (gate && gate.dims && gate.dims.axis) {
      const ax = gate.dims.axis, gl = Math.hypot(ax.south[0] - ax.north[0], ax.south[1] - ax.north[1]) || 1, t0 = [(ax.south[0] - ax.north[0]) / gl, (ax.south[1] - ax.north[1]) / gl];
      const L = 68, pEnd = at(pw, pw.s0 + L), p0 = at(pw, pw.s0);
      pw.lead = { s0: pw.s0, L, p0: [p0.x, p0.z], t0, p1: [pEnd.x, pEnd.z], t1: [pEnd.dx, pEnd.dz] };
    }
  }

  // ------------------------------------------------------------------------------------------------------
  // 4. spatial index of segments, and the coverage test
  // ------------------------------------------------------------------------------------------------------
  const index = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  for (const r of recs) {
    r.e0 = r.s0; r.e1 = r.s1;                                             // effective ends (pass 1 pulls them back)
    for (let i = 0; i + 1 < r.pl.length; i++) {
      if (r.ch[i + 1] < r.s0 || r.ch[i] > r.s1) continue;
      const a = r.pl[i], b = r.pl[i + 1], lt = r.lat((r.ch[i] + r.ch[i + 1]) / 2), pad = Math.max(-lt[0], lt[1], r.widths ? Math.max(...r.widths) / 2 : 0, r.corridor ? 12 : 0) + 0.5;
      const c0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL), c1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL), d0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL), d1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
      for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) { const k = key(cx, cz); let arr = index.get(k); if (!arr) index.set(k, (arr = [])); arr.push(r, i); }
    }
  }
  /**
   * Is (x, z) on the strip of record r between chainages lo and hi? Strips have SQUARE ends (a point beyond the end
   * of a street is not on it) and round joints at inner vertices. Returns { s, lat, dx, dz } or null.
   */
  function onStrip(r, i, x, z, lo, hi, margin) {
    const a = r.pl[i], b = r.pl[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; if (l2 < 1e-9) return null;
    const l = Math.sqrt(l2);
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
    if (t < 0) { if (i === 0 || r.ch[i] <= lo + 1e-6) return null; t = 0; } else if (t > 1) { if (i === r.pl.length - 2 || r.ch[i + 1] >= hi - 1e-6) return null; t = 1; }
    const s = r.ch[i] + t * l; if (s < lo - 1e-6 || s > hi + 1e-6) return null;
    const px = a[0] + dx * t, pz = a[1] + dz * t, side = (x - px) * -dz + (z - pz) * dx >= 0 ? 1 : -1, lat = side * Math.hypot(x - px, z - pz), lt = r.lat(s);
    if (lat < lt[0] + margin || lat > lt[1] - margin) return null;
    return { rec: r, s, lat, dx: dx / l, dz: dz / l };
  }
  /** The most important street other than `self` whose strip contains (x, z) and that passes `accept`; null if none. */
  function coveredBy(self, x, z, accept, margin = 0.04, effective = true) {
    const arr = index.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return null;
    let best = null;
    for (let k = 0; k < arr.length; k += 2) {
      const r = arr[k]; if (r === self || (best && r.prio <= best.rec.prio)) continue;
      const hit = onStrip(r, arr[k + 1], x, z, effective ? r.e0 : r.s0, effective ? r.e1 : r.s1, margin);
      if (hit && (!accept || accept(r, hit))) best = hit;
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------------------
  // 5. pieces: the stretches of every record that no more important street covers and that are dry land
  // ------------------------------------------------------------------------------------------------------
  // pass 1: a street that ENDS on another street (its end point lies on the other's strip, and the other does not end
  // there too) yields to it whatever their classes: its effective end is where it leaves the other's strip
  let hosted = 0;
  for (const r of recs) {
    for (const end of [0, 1]) {
      const sE = end ? r.s1 : r.s0, p = at(r, sE);
      const host = coveredBy(r, p.x, p.z, (o, hit) => hit.s - o.s0 > 0.35 && o.s1 - hit.s > 0.35, 0, false);
      if (!host) continue;
      const o = host.rec, inside = (s) => { const q = at(r, s); for (let i = 0; i + 1 < o.pl.length; i++) if (onStrip(o, i, q.x, q.z, o.s0, o.s1, 0.04)) return true; return false; };
      let d = 0; while (d < 60 && d < r.len - 0.5 && inside(end ? sE - d : sE + d)) d += 0.25;
      if (d === 0) continue;
      let lo = d - 0.25, hi = d; for (let q = 0; q < 6; q++) { const m = (lo + hi) / 2; if (inside(end ? sE - m : sE + m)) lo = m; else hi = m; }
      if (end) { r.hostEnd = host; r.e1c = sE - hi; } else { r.hostStart = host; r.e0c = sE + hi; }
      hosted++;
    }
  }
  for (const r of recs) { if (r.e0c !== undefined) r.e0 = r.e0c; if (r.e1c !== undefined) r.e1 = r.e1c; if (r.e1 < r.e0) r.e1 = r.e0; }

  // pass 2: between its effective ends a street yields to every more important street that runs over it, and to water
  const STEP = 0.75;
  let cuts = 0, wetCuts = 0;
  for (const r of recs) {
    if (r.e1 - r.e0 < 0.6) continue;
    const higher = (o) => o.prio > r.prio;
    const state = (s) => {
      const p = at(r, s);
      if (ground.isWater(p.x, p.z) || ground.height(p.x, p.z) < WL + 0.3) return { wet: true };
      return coveredBy(r, p.x, p.z, higher);
    };
    const n = Math.max(1, Math.ceil((r.e1 - r.e0) / STEP));
    let open = null, prev = null, prevS = r.e0;
    for (let k = 0; k <= n; k++) {
      const s = r.e0 + ((r.e1 - r.e0) * k) / n, st = state(s);
      if (!st && open === null) {
        let a = s, by = k === 0 ? r.hostStart || null : null;
        if (k > 0 && prev) { let lo = prevS, hi = s; for (let q = 0; q < 9; q++) { const m = (lo + hi) / 2; if (state(m)) lo = m; else hi = m; } a = hi; by = prev; }
        open = { a, startBy: by };
      } else if (st && open !== null) {
        let lo = prevS, hi = s; for (let q = 0; q < 9; q++) { const m = (lo + hi) / 2; if (state(m)) hi = m; else lo = m; }
        if (lo - open.a > 0.6) r.pieces.push({ a: open.a, b: lo, startBy: open.startBy, endBy: st });
        if (st.wet) wetCuts++; else cuts++;
        open = null;
      }
      prev = st; prevS = s;
    }
    if (open !== null && r.e1 - open.a > 0.6) r.pieces.push({ a: open.a, b: r.e1, startBy: open.startBy, endBy: r.hostEnd || null });
  }

  /** The street surface under a point (the most important one): { rec, s, lat, dx, dz } or null. */
  const streetAt = (x, z) => coveredBy(null, x, z, null, 0);

  // eye-level cameras: a hold whose camera stands less than 3 m above one of our streets
  for (const sh of film.shots) {
    const k = sh.keyframes, a = k[0].pos, b = k[k.length - 1].pos;
    if (a[1] - ground.height(a[0], a[2]) > 3 || b[1] - ground.height(b[0], b[2]) > 3) continue;
    const hit = streetAt(a[0], a[2]) || streetAt(b[0], b[2]);
    if (hit) eyes.push({ shot: sh.n, rec: hit.rec, a: [a[0], a[2]], b: [b[0], b[2]], look: k[0].look });
  }

  return { recs, pw, eyes, at, hitAt, onStrip, filmDist, zoneAt, liftAt, baseY, meshY, exact, terrainClass, coveredBy, streetAt, path, stats: { records: recs.length, cuts, wetCuts, hosted, pieces: recs.reduce((n, r) => n + r.pieces.length, 0), get terrainLeaves() { return leaves.size; } }, HERO, NEAR, TOL };
}
