// js/modules/people/crowd.js — the city's people and animals away from the staged vignettes: walkers and knots
// of talkers on the street net (denser on main streets and near the film's cameras), gate squares, temple
// forecourts and quay landings, the bridge, the precinct court and the ziggurat stairs, the palace courts,
// sentries on walls and towers, people on roofs and in courts, travellers and flocks outside the walls, birds.
import { bit } from './human.js';
import { qbit, bbit } from './animals.js';

export function buildCrowd(ctx, sys, cast, st) {
  const { layout, ground, film, mathx: M, W, quality, world } = ctx;
  const rng0 = ctx.module.rng.fork('crowd');
  const K = quality.draft ? 0.3 : 1, C = sys.C, pal = sys.palette, mul = cast.mul;
  const counts = {};
  const note = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const put = (k, f, min) => { f.tag = k; const g = st.place(f, min); if (g) note(k); return g; };
  const seated = (f) => { if (f.mask & bit('skirtLong')) f.mask = (f.mask & ~bit('skirtLong')) | bit('skirtSeat'); f.mask &= ~bit('staff'); f.base = 'sit'; if (f.arms === 'staff' || f.arms === 'spear') f.arms = 'knees'; return f; };
  const furniture = (ctx.modules.streets && Array.isArray(ctx.modules.streets.furniture)) ? ctx.modules.streets.furniture : [];
  const nearFurniture = (x, z) => furniture.some((q) => Math.hypot(q.x - x, q.z - z) < (q.size || 1.5) * 0.75 + 0.9);
  const onLand = (x, z) => !ground.isWater(x, z);
  const openGround = (x, z) => { const zn = ground.zone(x, z).zone; return zn !== 'monument' && zn !== 'wall' && !ground.isWater(x, z); };
  const Sx = { x: 0, y: 0, z: 0, az: 0, s: 0, moving: true };
  /** A walker's whole way through the film stays out of houses and water. */
  const clearWay = (f) => { for (let t = 0; t <= film.duration; t += 2.5) { f.move(t, Sx, f); if (layout.houseAt(Sx.x, Sx.z) || ground.isWater(Sx.x, Sx.z)) return false; } return true; };

  // where the film looks from close by: the crowd is denser there
  const hot = [];
  for (const s of film.shots) { const p = film.pathPoseAt(s.tHold), q = film.pathPoseAt(s.t1 - 0.01); if (p.pos[1] < 110) { hot.push([p.pos[0], p.pos[2]], [q.pos[0], q.pos[2]], [p.look[0], p.look[2]]); } }
  const heat = (x, z) => { let d = 1e9; for (const h of hot) d = Math.min(d, Math.hypot(h[0] - x, h[1] - z)); return 1 + 3.2 * Math.exp(-d / 230); };

  const donkeyFor = (rng) => ({ kind: 'quad', species: 'donkey', mask: qbit('donkey') + (rng.chance(0.75) ? qbit(rng.pick(['sacks', 'jars', 'bundle', 'sacks'])) : 0) + (rng.chance(0.6) ? qbit('pad') : 0), A: C('donkey', rng.range(0.8, 1.15)), B: rng.chance(0.4) ? mul(pal.red, 0.8) : mul(pal.oat, 0.9), seed: rng.next(), base: 'walk' });
  const citizen = (rng) => rng.pick(['man', 'man', 'man', 'woman', 'woman', 'worker', 'worker', 'porter', 'elder', 'child', 'man', 'woman', 'girl']);
  const walkerOpts = (role, rng) => {
    if (role === 'porter') return rng.chance(0.7) ? { add: bit('sack'), arms: 'sack' } : { add: bit('basketHead'), arms: 'basket' };
    if (role === 'woman' && rng.chance(0.32)) return rng.chance(0.6) ? { add: bit('jarHead'), arms: 'jar' } : { add: bit('basketHead'), arms: 'basket' };
    if (role === 'man' && rng.chance(0.3)) return { add: bit('staff'), arms: 'staff' };
    if (role === 'child') return { arms: 'child' };
    return {};
  };

  // ---- A. the street net -------------------------------------------------------------------------------------
  (function streets() {
    const rng = rng0.fork('streets');
    const recs = [], cum = [];
    let total = 0;
    for (const s of layout.streets) {
      if (s.cls === 'road' || s.length < 14) continue;
      const bb = s.bb || M.bbox(s.polyline), cx = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2;
      const w = (s.cls === 'processional' ? 5 : s.cls === 'main' ? 2.6 : s.cls === 'lane' ? 1 : 0.3) * s.length * heat(cx, cz) * (W.enclosureAt(cx, cz) && W.enclosureAt(cx, cz) !== 'outerCity' ? 1 : 0.35);
      total += w; recs.push(s); cum.push(total);
    }
    if (!recs.length) return;
    const pick = () => { const r = rng.next() * total; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } return recs[lo]; };
    const paths = new Map();
    const pathOf = (s, off) => { const k = s.id + '|' + off.toFixed(2); let p = paths.get(k); if (!p) paths.set(k, (p = st.makePath(s.polyline, off))); return p; };
    const widthOf = (s) => Math.min(s.width || 3, 22);
    const lionStreet = (x, z) => z < -742 && Math.abs(x - 350) < 40;                        // the procession's stage
    const nWalk = Math.round(640 * K), nGroup = Math.round(115 * K), nSit = Math.round(95 * K);
    for (let i = 0; i < nWalk; i++) {
      const s = pick(), w = widthOf(s), dir = rng.sign(), lat = Math.max(0.25, Math.min(w / 2 - 0.5, w * rng.range(0.14, 0.36))), off = Math.round(dir * lat * 4) / 4;
      const path = pathOf(s, off), s0 = rng.range(1, Math.max(1.5, path.len - 1)), h = M.pointAlong(s.polyline, Math.min(s.length, s0));
      if (lionStreet(h.x, h.z) || !onLand(h.x, h.z)) continue;
      const role = citizen(rng), f = cast.dress(role, rng, walkerOpts(role, rng)), v = dir * (role === 'child' ? rng.range(1.7, 2.6) : role === 'elder' ? rng.range(0.75, 0.95) : rng.range(1.0, 1.45));
      if (role === 'child') f.amp = 0.5;
      st.walkOn(f, path, s0, v, 0);
      if (!clearWay(f) || !put('street:walkers', f)) continue;
      if (w > 2.4 && rng.chance(0.075)) {                                                  // a pack donkey behind its driver
        const d = donkeyFor(rng); st.walkOn(d, path, s0 - dir * 1.9, v, 0); f.arms = 'lead'; f.mask &= ~bit('sack', 'jarHead', 'basketHead', 'staff'); put('animals:donkeys', d);
      }
    }
    for (let i = 0; i < nGroup; i++) {
      const s = pick(), w = widthOf(s), h = M.pointAlong(s.polyline, rng.range(2, Math.max(2.5, s.length - 2))), side = rng.sign(), lat = side * Math.max(0, w / 2 - rng.range(0.9, 1.4));
      const x = h.x - h.dir[1] * lat, z = h.z + h.dir[0] * lat;
      if (w < 2.6 || lionStreet(x, z) || !openGround(x, z) || layout.houseAt(x, z) || nearFurniture(x, z)) continue;
      const g = st.group(x, z, null, rng.int(2, w > 5 ? 4 : 3), rng, ['man', 'man', 'woman', 'elder', 'worker', 'man', 'woman']); note('street:groups', g.length);
    }
    for (let i = 0; i < nSit; i++) {
      const s = pick(), w = widthOf(s), h = M.pointAlong(s.polyline, rng.range(2, Math.max(2.5, s.length - 2))), side = rng.sign(), lat = side * Math.max(0, w / 2 - 0.42);
      const x = h.x - h.dir[1] * lat, z = h.z + h.dir[0] * lat;
      if (w < 2.2 || lionStreet(x, z) || !openGround(x, z) || layout.houseAt(x, z) || nearFurniture(x, z)) continue;
      const f = seated(cast.dress(rng.pick(['man', 'elder', 'woman', 'worker', 'child']), rng, { arms: rng.pick(['knees', 'work', 'knees']) }));
      st.fixed(f, x, st.standY(x, z), z, M.dirToAz(h.dir[1] * side, -h.dir[0] * side) + rng.range(-25, 25));   // back to the wall
      put('street:seated', f);
    }
    // dogs on the streets
    for (let i = 0, n = Math.round(42 * K); i < n; i++) {
      const s = pick(), w = widthOf(s), dir = rng.sign(), path = pathOf(s, Math.round(dir * Math.min(w / 2 - 0.4, rng.range(0.2, 1.2)) * 4) / 4), s0 = rng.range(1, Math.max(1.5, path.len - 1)), h = M.pointAlong(s.polyline, Math.min(s.length, s0));
      if (lionStreet(h.x, h.z) || !onLand(h.x, h.z)) continue;
      const d = { kind: 'quad', species: 'dog', mask: qbit('dog'), A: C(rng.pick(['woolOatmeal', 'woolBrown', 'woolCream']), rng.range(0.6, 0.9)), seed: rng.next(), base: rng.chance(0.6) ? 'walk' : 'stand' };
      if (d.base === 'walk') st.walkOn(d, path, s0, dir * rng.range(1.2, 2.0), 0); else { st.pathAt(path, s0, dir, d); st.fixed(d, d.x, d.y, d.z, d.az + rng.range(-60, 60)); }
      put('animals:dogs', d);
    }
  })();

  // ---- B. gate squares, crossings, bridge heads, temple forecourts, quay landings -------------------------------
  (function squares() {
    const rng = rng0.fork('squares'), per = { gate: 16, crossing: 8, bridgehead: 12, forecourt: 5, quay: 3 };
    for (const sq of layout.squares) {
      const n = Math.round((per[sq.use] || 3) * (quality.draft ? 0.5 : 1)), bb = M.bbox(sq.polygon);
      const point = () => { for (let i = 0; i < 30; i++) { const x = rng.range(bb[0], bb[2]), z = rng.range(bb[1], bb[3]); if (M.pointInPolygon(x, z, sq.polygon) && M.distToRing(x, z, sq.polygon) > 1.0 && openGround(x, z) && openGround(x + 1.2, z) && openGround(x - 1.2, z) && openGround(x, z + 1.2) && openGround(x, z - 1.2) && !layout.houseAt(x, z) && !nearFurniture(x, z)) return [x, z]; } return null; };
      let left = n;
      while (left > 0) {
        const p = point(); if (!p) break;
        const k = rng.next();
        if (k < 0.55) { const g = st.group(p[0], p[1], null, Math.min(left, rng.int(2, 4)), rng, sq.use === 'forecourt' ? ['man', 'woman', 'priest', 'elder'] : ['man', 'man', 'woman', 'worker', 'elder', 'porter']); note('squares', g.length); left -= Math.max(1, g.length); } else if (k < 0.8) {
          const f = seated(cast.dress(rng.pick(['man', 'woman', 'worker', 'elder']), rng, { arms: 'knees' })); st.fixed(f, p[0], st.standY(p[0], p[1]), p[1], rng.range(0, 360)); if (put('squares', f)) left--; else left--;
        } else {
          const f = cast.dress(rng.pick(['porter', 'woman', 'worker']), rng, { base: 'stand' }); st.fixed(f, p[0], st.standY(p[0], p[1]), p[1], rng.range(0, 360)); put('squares', f); left--;
          if ((sq.use === 'gate' || sq.use === 'crossing' || sq.use === 'quay') && rng.chance(0.7)) { const d = donkeyFor(rng); d.base = 'stand'; const a = (f.az + 90) * M.DEG; st.fixed(d, p[0] + Math.sin(a) * 1.1, f.y, p[1] - Math.cos(a) * 1.1, f.az + rng.range(-20, 20)); put('animals:donkeys', d); }
        }
      }
    }
    // gate guards, just inside every gate on both sides of the street
    for (const ga of layout.gateApproaches || []) {
      const [dx, dz] = ga.dir, x0 = ga.inside[0] - dx * 9, z0 = ga.inside[1] - dz * 9;
      for (const s of [-1, 1]) { const x = x0 - dz * s * 4.2, z = z0 + dx * s * 4.2; if (!onLand(x, z) || layout.houseAt(x, z)) continue; const f = cast.dress('soldier', rng, { base: 'stand', arms: 'guard' }); st.fixed(f, x, st.standY(x, z), z, M.dirToAz(dz * s, -dx * s)); put('guards', f); }
    }
  })();

  // ---- C. the bridge ---------------------------------------------------------------------------------------------
  (function bridge() {
    const rng = rng0.fork('bridge'), b = world.bridge; if (!b) return;
    const rb = ctx.modules.riverworks && ctx.modules.riverworks.bridge, y = (rb && rb.level !== undefined ? rb.level : b.deckLevel) + 0.02;
    const A = b.eastAbutment, Bw = b.westAbutment, dx = Bw[0] - A[0], dz = Bw[1] - A[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    for (let i = 0, n = Math.round(38 * (quality.draft ? 0.6 : 1)); i < n; i++) {
      const dir = rng.sign(), lat = dir * rng.range(0.6, 2.4), a = [A[0] + nx * lat, y, A[1] + nz * lat], c = [Bw[0] + nx * lat, y, Bw[1] + nz * lat];
      const role = citizen(rng), f = cast.dress(role, rng, walkerOpts(role, rng));
      st.walkLine(f, dir > 0 ? a : c, dir > 0 ? c : a, rng.range(1.0, 1.4), rng.range(0.03, 0.9), 0);
      if (put('bridge', f) && rng.chance(0.08)) { const d = donkeyFor(rng), k0 = 0; d.move = (t, S) => { f.move(t, S, f); const az = S.az * M.DEG; S.x -= Math.sin(az) * 1.9; S.z += Math.cos(az) * 1.9; }; d.x = a[0]; d.y = y; d.z = a[1]; f.arms = 'lead'; f.mask &= ~bit('sack', 'jarHead', 'basketHead', 'staff'); put('animals:donkeys', d); }
    }
  })();

  // ---- D. the precinct: climbers on the three flights of the ziggurat, priests crossing the court ---------------
  (function precinct() {
    const rng = rng0.fork('precinct');
    let stairs = ctx.modules.etemenanki && ctx.modules.etemenanki.stairs;
    if (!Array.isArray(stairs) || !stairs.length) {
      const m = W.monument('etemenanki'), d = m.dims, s = d.stairs, base = d.baseLevel, top = base + s.landing.level, L = (lx, lz) => W.localToWorld(m.footprint, lx, lz);
      const zc = d.baseSide / 2 + s.lateralBlock.projection / 2;
      stairs = [
        { from: [...L(0, s.central.zTo), base], to: [...L(0, s.central.zFrom), top], width: s.central.width - 2, name: 'central' },
        { from: [...L(s.lateralBlock.xFrom, zc), base], to: [...L(s.landing.xFrom, zc), top], width: 6, name: 'lateralWest' },
        { from: [...L(s.lateralBlock.xTo, zc), base], to: [...L(s.landing.xTo, zc), top], width: 6, name: 'lateralEast' },
      ].map((q) => ({ from: [q.from[0], q.from[2], q.from[1]], to: [q.to[0], q.to[2], q.to[1]], width: q.width, name: q.name }));
    }
    for (const fl of stairs) {
      const a = fl.from, b = fl.to, dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L, half = Math.max(0.4, (fl.width || 4) / 2 - 0.7);
      const n = fl.name === 'central' || L > 48 ? 24 : 11;
      for (let i = 0; i < n; i++) {
        const up = rng.chance(0.62), lat = (up ? 1 : -1) * rng.range(0.25, half), p = [a[0] + nx * lat, a[1] + 0.02, a[2] + nz * lat], q = [b[0] + nx * lat, b[1] + 0.02, b[2] + nz * lat];
        const role = rng.pick(['priest', 'priest', 'priest', 'man', 'porter', 'woman']);
        const f = cast.dress(role, rng, role === 'priest' ? { arms: rng.chance(0.5) ? 'clasp' : null } : role === 'porter' ? { add: bit('basketHead'), arms: 'basket' } : {});
        f.amp = 0.26; f.lift = 1.7; f.lean = 0.10; f.strideOverride = 0.66; f.cannedKey = 'climb';
        st.walkLine(f, up ? p : q, up ? q : p, rng.range(0.42, 0.58), rng.range(0.02, 0.93), 0);
        put('ziggurat:stairs', f);
      }
    }
    // the court: vast and nearly empty, a few priests crossing it in twos, a knot at the foot of the stair
    const pm = W.monument('etemenankiPrecinct'), bb = M.bbox(pm.footprint.polygon);
    const court = (x, z) => ground.zone(x, z).zone === 'precinctCourt';
    let done = 0;
    for (let i = 0; i < 400 && done < Math.round(13 * (quality.draft ? 0.6 : 1)); i++) {
      const x0 = rng.range(bb[0], bb[2]), z0 = rng.range(bb[1], bb[3]), az = rng.range(0, 360), len = rng.range(60, 130), [dx, dz] = M.azToDir(az), x1 = x0 + dx * len, z1 = z0 + dz * len;
      let ok = true; for (let k = 0; k <= 10 && ok; k++) ok = court(x0 + (x1 - x0) * k / 10, z0 + (z1 - z0) * k / 10) && court(x0 + (x1 - x0) * k / 10 + 2.5, z0 + (z1 - z0) * k / 10 + 2.5);
      if (!ok) continue;
      const y = ground.height(x0, z0) + 0.06, v = rng.range(0.95, 1.2), k0 = rng.range(0.05, 0.5);
      for (const s of [-0.45, 0.45]) {
        const f = cast.dress(rng.chance(0.75) ? 'priest' : 'man', rng, { arms: rng.chance(0.4) ? 'clasp' : null });
        st.walkLine(f, [x0 - dz * s, y, z0 + dx * s], [x1 - dz * s, y, z1 + dx * s], v, k0, 0); put('precinct:court', f);
      }
      done++;
    }
    // offerings on the hoof: a small flock of fat-tailed sheep and goats driven across the court toward the stair
    {
      const ft = stairs[0].from, a = [ft[0] + 92, ft[2] + 26], b = [ft[0] + 14, ft[2] + 12], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      let ok = true; for (let k = 0; k <= 10; k++) ok = ok && court(a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10);
      if (ok) {
        const y = ground.height(a[0], a[1]) + 0.05, v = 0.8;
        for (let i = 0; i < 12; i++) {
          const goat = i % 4 === 3, along = rng.range(0, 9), lat = rng.range(-2.2, 2.2), sd = rng.next();
          const f = { kind: 'quad', species: goat ? 'goat' : 'sheep', mask: qbit(goat ? 'goat' : 'sheep'), A: goat ? C(rng.pick(['woolDark', 'woolBrown']), 0.9) : C('sheep', rng.range(0.85, 1.05)), seed: sd, base: 'walk' };
          if (!goat) f.B = rng.chance(0.4) ? C('woolDark', 0.9) : C('sheep', 0.9);
          st.walkLine(f, [a[0] + ux * along - uz * lat, y, a[1] + uz * along + ux * lat], [b[0] + ux * along - uz * lat, y, b[1] + uz * along + ux * lat], v * rng.range(0.94, 1.06), 0.22, 0); put('animals:flocks', f);
        }
        for (const lat of [-2.9, 2.6]) { const f = cast.dress('man', rng, { add: bit('staff'), arms: 'staff', amp: 0.3 }); st.walkLine(f, [a[0] - ux * 2.2 - uz * lat, y, a[1] - uz * 2.2 + ux * lat], [b[0] - ux * 2.2 - uz * lat, y, b[1] - uz * 2.2 + ux * lat], v, 0.22, 0); put('herders', f); }
      }
    }
    const foot = stairs[0].from; if (court(foot[0], foot[2] + 6)) { const g = st.group(foot[0] + 4, foot[2] + 7, ground.height(foot[0], foot[2] + 7) + 0.06, 4, rng, ['priest', 'priest', 'man', 'elder']); note('precinct:court', g.length); }
  })();

  // ---- E. the courts of the South Palace --------------------------------------------------------------------------
  (function palace() {
    const rng = rng0.fork('palace');
    let m; try { m = W.monument('southPalace'); } catch (e) { return; }
    const courts = m.dims && m.dims.courts; if (!courts) return;
    const y = W.monumentLevels(m).floor + 0.06;
    for (const name of Object.keys(courts)) {
      const ring = courts[name].polygon; if (!ring) continue;
      const bb = M.bbox(ring), area = Math.abs(M.polygonArea(ring)), n = Math.round(Math.min(34, area / 95) * (quality.draft ? 0.6 : 1));
      const inside = (x, z, m2 = 3) => M.pointInPolygon(x, z, ring) && M.distToRing(x, z, ring) > m2;
      const pt = (m2) => { for (let i = 0; i < 40; i++) { const x = rng.range(bb[0], bb[2]), z = rng.range(bb[1], bb[3]); if (inside(x, z, m2)) return [x, z]; } return null; };
      let left = n;
      while (left > 0) {
        const k = rng.next(), p = pt(3); if (!p) break;
        if (k < 0.45) { const g = st.group(p[0], p[1], y, Math.min(left, rng.int(2, 4)), rng, ['man', 'man', 'elder', 'priest', 'worker', 'soldier']); note('palace', g.length); left -= Math.max(1, g.length); } else {
          const q = pt(3); if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) < 12) { left--; continue; }
          const role = rng.pick(['man', 'worker', 'porter', 'man', 'woman']), f = cast.dress(role, rng, walkerOpts(role, rng));
          st.walkLine(f, [p[0], y, p[1]], [q[0], y, q[1]], rng.range(1.0, 1.35), rng.range(0, 0.5), 0); put('palace', f); left--;
        }
      }
      // guards along the court walls
      const o = M.openRing(ring);
      for (let e = 0; e < o.length; e++) {
        const a = o[e], b = o[(e + 1) % o.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), c = M.polygonCentroid(ring);
        for (let s = len * 0.25; s < len; s += len * 0.5) {
          const x = a[0] + (b[0] - a[0]) * s / len, z = a[1] + (b[1] - a[1]) * s / len, ix = x + (c[0] - x) * 1.6 / Math.hypot(c[0] - x, c[1] - z), iz = z + (c[1] - z) * 1.6 / Math.hypot(c[0] - x, c[1] - z);
          if (!rng.chance(0.55)) continue;
          const f = cast.dress('soldier', rng, { base: 'stand', arms: 'guard' }); st.fixed(f, ix, y, iz, st.azTo(ix, iz, c[0], c[1])); put('guards', f);
        }
      }
    }
  })();

  // ---- E2. a building gang on the terrace between the walls west of the Ishtar Gate (the open ground of shot 3) ---
  (function gang() {
    const rng = rng0.fork('gang'), y = (x, z) => ground.height(x, z) + 0.03;
    const ok = (x, z) => { const zn = ground.zone(x, z); return zn.zone === 'berm' && Math.abs(ground.height(x, z) - 10.5) < 0.2 && Math.abs(ground.height(x + 2, z) - 10.5) < 0.2 && Math.abs(ground.height(x - 2, z) - 10.5) < 0.2 && Math.abs(ground.height(x, z + 2) - 10.5) < 0.2 && Math.abs(ground.height(x, z - 2) - 10.5) < 0.2; };
    if (!ok(290, -752) || !ok(270, -752)) return;
    const A = [264, -753], B2 = [287, -743.5];
    for (let i = 0; i < 9; i++) {                                                            // carriers to the work and back
      const to = i < 6, lat = (to ? 1 : -1) * rng.range(0.5, 1.4), dx = B2[0] - A[0], dz = B2[1] - A[1], L = Math.hypot(dx, dz), nx = -dz / L * lat, nz = dx / L * lat;
      const p = [A[0] + nx, y(A[0], A[1]), A[1] + nz], q = [B2[0] + nx, y(B2[0], B2[1]), B2[1] + nz];
      const f = cast.dress('porter', rng, to ? (rng.chance(0.5) ? { add: bit('basketHead'), arms: 'basket' } : { add: bit('sack'), arms: 'sack' }) : {});
      st.walkLine(f, to ? p : q, to ? q : p, rng.range(0.9, 1.25), rng.range(0.0, 0.85), 0); put('gang', f);
    }
    for (const [x, z, n, roles] of [[290.5, -745.5, 4, ['worker', 'worker', 'porter']], [279, -748.5, 2, ['elder', 'man']], [300, -751, 3, ['worker', 'soldier', 'worker']], [270, -746.5, 2, ['worker', 'worker']]]) {
      if (!ok(x, z)) continue; const g = st.group(x, z, y(x, z), n, rng, roles); note('gang', g.length);
    }
    for (const [x, z] of [[293.5, -747.2], [295.2, -745.6], [283.5, -741.8]]) { if (!ok(x, z)) continue; const f = cast.dress('worker', rng, { base: 'squat' }); f.mask &= ~bit('staff'); st.fixed(f, x, y(x, z), z, rng.range(0, 360)); put('gang', f); }
    for (const [x, z, az] of [[276, -752.5, 80], [278.2, -754.3, 95]]) { if (!ok(x, z)) continue; const d = donkeyFor(rng); d.base = 'stand'; d.mask = qbit('donkey', rng.chance(0.5) ? 'bundle' : 'sacks', 'pad'); st.fixed(d, x, y(x, z), z, az); put('animals:donkeys', d); }
    for (const lat of [-0.5, 0.5]) { const f = cast.dress('soldier', rng, {}); st.walkLine(f, [318, y(318, -759), -759 + lat], [262, y(262, -759), -759 + lat], 0.95, 0.1, 0); put('gang', f); }
  })();

  // ---- F. sentries on the walls -------------------------------------------------------------------------------------
  (function walls() {
    const rng = rng0.fork('walls');
    const sentry = (x, y, z, az, k) => { const f = cast.dress('soldier', rng, { base: 'stand', arms: rng.chance(0.5) ? 'guard' : 'guardEasy' }); if (f.arms === 'guardEasy') f.mask &= ~bit('shield'); st.fixed(f, x, y, z, az); return put(k, f); };
    for (const which of ['east:main', 'east:front', 'west:main', 'outer']) {
      let towers; try { towers = W.wallTowers(which); } catch (e) { continue; }
      towers.forEach((t, i) => {
        const near = Math.hypot(t.x - 346, t.z + 722) < 950 || heat(t.x, t.z) > 2.2;
        if (!(near ? (which === 'east:front' ? i % 2 === 0 : true) : i % (which === 'outer' ? 5 : 4) === 0)) return;
        if (!near && quality.draft && i % 8) return;
        const az = M.dirToAz(t.out[0], t.out[1]), d = Math.max(0.6, (t.d || 6) / 2 - 1.5);
        sentry(t.x + t.out[0] * d * 0.6 + t.out[1] * 1.2, t.top + 0.02, t.z + t.out[1] * d * 0.6 - t.out[0] * 1.2, az + rng.range(-25, 25), 'sentries');
        if (near && t.big && which !== 'east:front') sentry(t.x - t.out[0] * d * 0.4 - t.out[1] * 1.6, t.top + 0.02, t.z - t.out[1] * d * 0.4 + t.out[0] * 1.6, az + 180 + rng.range(-40, 40), 'sentries');
      });
    }
    // patrols on the wall-walk of the raised stretch east of the Ishtar Gate
    let towers; try { towers = W.wallTowers('east:main'); } catch (e) { towers = []; }
    let n = 0;
    for (let i = 0; i + 1 < towers.length && n < 12; i++) {
      const a = towers[i], b = towers[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L > 45 || L < 14 || Math.hypot(a.x - 346, a.z + 722) > 700 || !rng.chance(0.7)) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, g0 = (a.w || 9.5) / 2 + 1.2, g1 = (b.w || 9.5) / 2 + 1.2, lv = W.innerWallLevels('east', (a.x + b.x) / 2, (a.z + b.z) / 2);
      const f = cast.dress('soldier', rng, {}), dir = rng.chance(0.5);
      const p = [a.x + ux * g0, lv.walk + 0.02, a.z + uz * g0], q = [b.x - ux * g1, lv.walk + 0.02, b.z - uz * g1];
      st.walkLine(f, dir ? p : q, dir ? q : p, rng.range(0.8, 1.0), rng.range(0, 0.6), 0); if (put('sentries', f)) n++;
    }
  })();

  // ---- G / H. roofs and courts of the houses ----------------------------------------------------------------------
  (function houses() {
    const rng = rng0.fork('houses'), hero = layout.houses.find((h) => /Great House/.test(h.landmark || '')), sh8 = film.shots.find((s) => s.raw && s.raw.onRoofOf), TE = sh8 ? sh8.tIn : 44;
    const pRoofDay = quality.draft ? 0.04 : 0.014, pRoofEve = quality.draft ? 0.035 : 0.012, pCourt = quality.draft ? 0.035 : 0.012;
    for (const h of layout.houses) {
      if (h === hero || !layout.isBuilt(h) || h.village) continue;
      const inner = h.enclosure === 'innerEast' || h.enclosure === 'innerWest', k = (inner ? 1 : 0.35) * Math.min(2.5, heat(h.center[0], h.center[1]));
      const r = rng.next(), r2 = rng.next(), r3 = rng.next();
      const roofFolk = (key, t0, n) => {
        const p = layout.roofPoint(h, rng, 1.2); if (!p) return;
        const pr = layout.roofParts(h).find((q) => Math.abs(q.level - p.y) < 0.01 && M.pointInPolygon(p.x, p.z, q.polygon));
        if (pr && pr.kind === 'raised' && h.storeys === 2) return;
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, 6.283), x = p.x + (i ? Math.sin(a) * 0.85 : 0), z = p.z - (i ? Math.cos(a) * 0.85 : 0);
          if (i && (M.distToRing(x, z, h.footprint) < 0.9 || h.courts.some((q) => M.pointInPolygon(x, z, q) || M.distToRing(x, z, q) < 0.7))) continue;
          const role = rng.pick(['woman', 'man', 'woman', 'child', 'elder', 'girl']), f = cast.dress(role, rng, {});
          if (rng.chance(0.6) && role !== 'child') { seated(f); f.arms = rng.pick(['work', 'knees', 'work']); } else { f.base = 'stand'; f.mask &= ~bit('staff'); f.arms = rng.pick([null, 'hips', 'talk']); }
          st.fixed(f, x, p.y, z, rng.range(0, 360)); if (t0 !== undefined) f.t0 = t0; put(key, f);
        }
      };
      if (r < pRoofDay * k) roofFolk('roofs:day', undefined, rng.int(1, 2));
      if (r2 < pRoofEve * k) roofFolk('roofs:evening', TE, rng.int(1, 3));
      if (r3 < pCourt * k && h.courts.length) {
        const c = layout.courtCenter(h, 0), ring = h.courts[0];
        for (let i = 0, n = rng.int(1, 2); i < n; i++) {
          const x = c[0] + rng.range(-1.2, 1.2), z = c[1] + rng.range(-1.2, 1.2); if (!M.pointInPolygon(x, z, ring) || M.distToRing(x, z, ring) < 0.6) continue;
          const role = rng.pick(['woman', 'worker', 'woman', 'child', 'man']), f = cast.dress(role, rng, {});
          if (rng.chance(0.5) && role !== 'child') { rng.chance(0.5) ? seated(f) : (f.base = 'squat'); f.arms = f.base === 'sit' ? 'work' : null; } else f.base = 'stand';
          f.mask &= ~bit('staff'); if (f.arms === 'staff') f.arms = null;
          st.fixed(f, x, h.groundLevel + 0.01, z, rng.range(0, 360)); put('courts', f);
        }
      }
    }
    // the great court of the Great House: its people at their work
    if (hero && hero.courts.length) {
      const c = layout.courtCenter(hero, 0), ring = hero.courts[0], y = hero.groundLevel + 0.03;
      for (const [dx, dz, role, base, arms] of [[-3, -2, 'woman', 'squat', null], [-2.2, -2.6, 'woman', 'sit', 'work'], [2.5, 1.5, 'worker', 'stand', 'hips'], [3.2, 2.3, 'man', 'stand', 'talk'], [0.5, 4, 'child', 'stand', null], [-4.5, 3.5, 'porter', 'stand', null]]) {
        const x = c[0] + dx, z = c[1] + dz; if (!M.pointInPolygon(x, z, ring) || M.distToRing(x, z, ring) < 0.8) continue;
        const f = cast.dress(role, rng, { arms }); if (base === 'sit') seated(f); else f.base = base; f.mask &= ~bit('staff'); st.fixed(f, x, y, z, rng.range(0, 360)); put('courts', f);
      }
    }
    // a few cats on parapets and roofs near the cameras
    let cats = 0;
    for (const h of layout.housesNear(480, -270, 160)) {
      if (cats >= 6 || h === hero || !layout.isBuilt(h) || !rng.chance(0.06)) continue;
      const p = layout.roofPoint(h, rng, 0.9); if (!p) continue;
      const f = { kind: 'quad', species: 'cat', mask: qbit('cat'), A: C(rng.pick(['woolOatmeal', 'woolBrown', 'woolDark', 'woolCream']), rng.range(0.55, 0.85)), seed: rng.next(), base: 'stand' };
      st.fixed(f, p.x, p.y, p.z, rng.range(0, 360)); if (put('animals:cats', f, 0.6)) cats++;
    }
  })();

  // ---- I. outside the walls: travellers on the roads, ox pairs, flocks with their herders, field hands ------------
  (function country() {
    const rng = rng0.fork('country');
    const roads = layout.streets.filter((s) => s.cls === 'road');
    const paths = new Map(), pathOf = (s, off) => { const k = s.id + '|' + off; let p = paths.get(k); if (!p) paths.set(k, (p = st.makePath(s.polyline.length > 400 ? s.polyline.slice(0, 400) : s.polyline, off, st.standY, 2))); return p; };
    for (let i = 0, n = Math.round(110 * K); i < n && roads.length; i++) {
      const s = rng.pick(roads), dir = rng.sign(), path = pathOf(s, dir * 1.2), s0 = rng.range(2, Math.min(path.len - 2, 2200));
      const h = { x: 0, y: 0, z: 0, az: 0 }; st.pathAt(path, s0, dir, h);
      if (!onLand(h.x, h.z) || Math.hypot(h.x, h.z) > 4200) continue;
      const k = rng.next(), v = dir * rng.range(1.0, 1.3);
      if (k < 0.62) {
        const role = rng.pick(['man', 'worker', 'woman', 'porter', 'man']), f = cast.dress(role, rng, walkerOpts(role, rng)); st.walkOn(f, path, s0, v, 0);
        if (put('roads', f) && rng.chance(0.4)) { const d = donkeyFor(rng); st.walkOn(d, path, s0 - dir * 1.9, v, 0); f.arms = 'lead'; f.mask &= ~bit('sack', 'jarHead', 'basketHead', 'staff'); put('animals:donkeys', d); }
      } else if (k < 0.78) {                                                                // a yoke of oxen with their driver
        const vo = dir * 0.85, f = cast.dress('worker', rng, { add: bit('staff'), arms: 'staff' }); st.walkOn(f, path, s0 - dir * 2.6, vo, 0); put('roads', f);
        for (const off of [-0.55, 0.55]) { const o = { kind: 'quad', species: 'ox', mask: qbit('ox'), A: rng.chance(0.5) ? C('ox', rng.range(0.85, 1.1)) : C('woolCream', rng.range(0.75, 0.95)), seed: rng.next(), base: 'walk' }; st.walkOn(o, pathOf(s, dir * 1.2 + off), s0, vo, 0); put('animals:oxen', o); }
      } else {
        const g = st.group(h.x - 2.2 * Math.cos(h.az * M.DEG), h.z - 2.2 * Math.sin(h.az * M.DEG), null, rng.int(2, 3), rng, ['man', 'worker', 'woman']); note('roads', g.length);
      }
    }
    // flocks of fat-tailed sheep and goats on stubble and fallow, each with a herder and a dog
    let flocks = 0;
    for (let i = 0; i < 600 && flocks < Math.round(8 * (quality.draft ? 0.5 : 1)); i++) {
      const a = rng.range(0, 6.283), r = rng.range(1500, 3300), x = Math.cos(a) * r + 300, z = Math.sin(a) * r - 200;
      const lu = ground.landUse(x, z); if (!lu || !(lu.use === 'stubble' || lu.use === 'fallow') || !layout.isFree(x, z, 6)) continue;
      const az0 = rng.range(0, 360);
      for (let k = 0, n = rng.int(12, 17); k < n; k++) {
        const px = x + rng.gauss() * 5, pz = z + rng.gauss() * 5; if (!layout.isFree(px, pz, 0.8)) continue;
        const goat = rng.chance(0.3), sd = rng.next();
        const f = { kind: 'quad', species: goat ? 'goat' : 'sheep', mask: qbit(goat ? 'goat' : 'sheep'), A: goat ? C(rng.pick(['woolDark', 'woolBrown', 'woolCream']), 0.9) : C('sheep', rng.range(0.85, 1.05)), B: goat ? null : rng.chance(0.4) ? C('woolDark', 0.9) : C('sheep', 0.9), seed: sd, base: rng.chance(0.6) ? 'graze' : 'stand' };
        if (!f.B) delete f.B;
        st.fixed(f, px, ground.height(px, pz) + 0.02, pz, az0 + rng.range(-70, 70)); put('animals:flocks', f);
      }
      const hf = cast.dress('man', rng, { base: 'stand', add: bit('staff'), arms: 'staff' }); st.fixed(hf, x + 7, ground.height(x + 7, z + 2) + 0.02, z + 2, st.azTo(x + 7, z + 2, x, z)); put('herders', hf);
      const dg = { kind: 'quad', species: 'dog', mask: qbit('dog'), A: C('woolOatmeal', 0.7), seed: rng.next(), base: 'stand' }; st.fixed(dg, x + 6, ground.height(x + 6, z + 3.2) + 0.02, z + 3.2, st.azTo(x + 6, z + 3.2, x, z)); put('animals:dogs', dg);
      flocks++;
    }
    // field hands: reapers bent over in the ripe barley near the gate roads
    let hands = 0;
    for (let i = 0; i < 900 && hands < Math.round(70 * K); i++) {
      const a = rng.range(0, 6.283), r = rng.range(1500, 2900), x = Math.cos(a) * r + 300, z = Math.sin(a) * r - 200;
      const lu = ground.landUse(x, z); if (!lu || lu.use !== 'barleyRipe' || !layout.isFree(x, z, 2)) continue;
      for (let k = 0, n = rng.int(2, 5); k < n; k++) {
        const px = x + rng.range(-6, 6), pz = z + rng.range(-6, 6); if (!layout.isFree(px, pz, 0.8)) continue;
        const f = cast.dress(rng.pick(['worker', 'worker', 'woman']), rng, { base: rng.chance(0.65) ? 'squat' : 'stand', arms: null }); f.mask &= ~bit('staff');
        st.fixed(f, px, ground.height(px, pz) + 0.02, pz, rng.range(0, 360)); if (put('fields', f)) hands++;
      }
    }
  })();

  // ---- K. birds over the city --------------------------------------------------------------------------------------
  (function birds() {
    const rng = rng0.fork('birds');
    const flock = (cx, cy, cz, R, n, scale, key, tint) => {
      const w0 = rng.sign() * rng.range(0.42, 0.55);
      for (let i = 0; i < n; i++) {
        const ph = rng.range(0, 0.9) + (i / n) * 0.8, r = R * rng.range(0.8, 1.25), dy = rng.range(-3, 3), sd = rng.next(), wob = rng.range(0.6, 1.4);
        const f = { kind: 'bird', scale, mask: bbit('spread'), base: 'fly', flapHz: rng.range(4.6, 5.6), flapAmp: 0.85, glide: 0.9, A: tint(rng), seed: sd };
        f.move = (t, S) => {
          const a = ph + w0 * t, k = 1 + 0.22 * Math.sin(2 * a + sd * 6.28), ccx = cx + 14 * Math.sin(0.11 * t + 1), ccz = cz + 10 * Math.cos(0.09 * t);
          S.x = ccx + r * k * Math.cos(a); S.z = ccz + r * Math.sin(a); S.y = cy + dy + 3.2 * Math.sin(wob * a + sd * 9);
          S.az = Math.atan2(-Math.sin(a) * w0, -Math.cos(a) * w0) * 57.2958; S.bank = -0.5 * Math.sign(w0);
        };
        f.x = cx; f.y = cy; f.z = cz; put(key, f, 1.5);
      }
    };
    const grey = (r) => { const k = r.range(0.5, 0.95); return r.chance(0.25) ? [0.75 * k, 0.74 * k, 0.72 * k] : [0.34 * k, 0.36 * k, 0.4 * k]; };
    flock(78, 38, 84, 30, 18, 1.5, 'birds', grey);                  // pigeons wheeling between the tower and the camera of shot 6
    flock(40, 62, 20, 44, 12, 1.5, 'birds', grey);                  // and round the upper stages
    flock(496, 24, -252, 26, 10, 1.4, 'birds', grey);                // over the roofs of Merkes (shots 7 and 8)
    // kites soaring high over the river and the gate
    for (const [cx, cy, cz, R] of [[-120, 70, -120, 85], [300, 95, -760, 110], [60, 120, 250, 120], [520, 80, -300, 95]]) {
      const w0 = rng.sign() * rng.range(0.10, 0.14), ph = rng.range(0, 6.28), sd = rng.next();
      const f = { kind: 'bird', scale: 2.4, mask: bbit('spread'), base: 'fly', flapHz: 0.25, flapAmp: 0.08, A: [0.16, 0.11, 0.07], seed: sd };
      f.move = (t, S) => { const a = ph + w0 * t; S.x = cx + R * Math.cos(a); S.z = cz + R * Math.sin(a); S.y = cy + 4 * Math.sin(0.6 * a + sd * 7); S.az = Math.atan2(-Math.sin(a) * w0, -Math.cos(a) * w0) * 57.2958; S.bank = -0.32 * Math.sign(w0); };
      f.x = cx; f.y = cy; f.z = cz; put('birds', f, 2);
    }
  })();

  return { counts };
}
