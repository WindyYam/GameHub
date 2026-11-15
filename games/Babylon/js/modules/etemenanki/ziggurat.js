// js/modules/etemenanki/ziggurat.js — Etemenanki itself (SPEC 3.10, world.json monuments[etemenanki], R3 3.1).
// Six battered stages of baked brick with the buttress-and-recess relief of the stele, a parapet per terrace,
// the stair block on the south face with two lateral flights and the free-standing central flight (true risers:
// 131 x 0.207 and 156 x 0.174 m), the landing, the blue-glazed summit temple with its south and north doors.
// Everything is built in the tower's own axes (origin at its centre, +x east, +z south) and turned by
// footprint.rotationDeg. Nothing external above the first terrace: the upper stairs are inside the brickwork
// (world.json dims.stairs.aboveStage1), shown only by a door per terrace.
import * as M from '../../core/mathx.js';

export function buildZiggurat(ctx, T, parts) {
  const { geom, W } = ctx;
  const m = W.monument('etemenanki'), d = m.dims, C = m.footprint.center, rot = m.footprint.rotationDeg;
  const B = d.baseLevel;                                         // +2.5: the paved court
  const BAT = 1 / 18;                                            // batter 1:16 to 1:20 (dims.batter)
  const PAR = d.parapetPerTerrace.height, PT = d.parapetPerTerrace.thickness;
  const L2 = (lx, lz) => M.localToWorld(C, rot, lx, lz);
  const L3 = (lx, y, lz) => { const p = L2(lx, lz); return [p[0], y, p[1]]; };
  /** rectangle in the tower's axes, clockwise from the north-west corner: edges 0 north, 1 east, 2 south, 3 west */
  const sq = (hx, hz = hx) => [L2(-hx, -hz), L2(hx, -hz), L2(hx, hz), L2(-hx, hz)];
  const flat = (ring) => { const f = []; for (const p of ring) f.push(p[0], p[1]); return f; };
  const tops = d.stageTops.map((h) => B + h);
  const FACES = [{ az: 0, n: [0, -1] }, { az: 90, n: [1, 0] }, { az: 180, n: [0, 1] }, { az: 270, n: [-1, 0] }];   // outward normals in the tower's axes
  const st = d.stairs, fl = st.flights;
  const zFace = d.baseSide / 2, zOut = st.central.zFrom, zFoot = st.central.zTo, landHalf = (st.landing.xTo - st.landing.xFrom) / 2;
  const fires = [], doors = [], terraces = [], stageGeoms = [];

  // ---------------------------------------------------------------------------------------------- stages ----
  const brick = geom.writer({ verts: 8192 }), deco = geom.writer({ verts: 32768 });
  const COURSE = ctx.materials.module ? ctx.materials.module.course : 0.0858, BAND = 12 * COURSE;
  const tanStair = fl.lateralWest.tread / fl.lateralWest.riser;
  /** what the stele's plain faces carry in the brick: a string course at the terrace, the reed-layer bands and the weep holes of the mantle (R3 4.1) */
  function dressFaces(i, side, yb, y1, n, sink) {
    const nb = yb + (i === 0 ? 0.9 : 0.45), nt = y1 - 0.9, ref = side / 2 + BAT * sink;
    FACES.forEach((F, fi) => {
      const tx = fi === 0 ? [1, 0] : fi === 1 ? [0, 1] : fi === 2 ? [-1, 0] : [0, -1];
      const o = L2(0, 0), nw = L2(F.n[0], F.n[1]), nxw = nw[0] - o[0], nzw = nw[1] - o[1];
      const h = (y) => side / 2 - BAT * (y - yb);
      const at = (y, t, out = 0) => L3(tx[0] * t + F.n[0] * (h(y) + out), y, tx[1] * t + F.n[1] * (h(y) + out));
      // a string course at the level of the terrace floor
      if (!(i === 0 && fi === 2)) {
        const e = fi % 2 ? 0 : 0.07, ya = y1 - 0.13, yc = y1 + 0.09, t0 = -h(y1) - e, t1 = h(y1) + e, pr = 0.07;
        T.quadF(brick, at(ya, t0, pr), at(ya, t1, pr), at(yc, t1, pr), at(yc, t0, pr), nxw, 0, nzw);
        T.quadF(brick, at(yc, t0, 0), at(yc, t1, 0), at(yc, t1, pr), at(yc, t0, pr), 0, 1, 0);
        T.quadF(brick, at(ya, t0, 0), at(ya, t1, 0), at(ya, t1, pr), at(ya, t0, pr), 0, -1, 0);
      }
      // the plain stretches of the face at level y: between the recesses in the niche zone, the whole face elsewhere
      const spans = (y, y2) => {
        const hy = h(y), k = hy / ref, hwN = (d.recess.width / 2) * k + 0.07, list = [];
        if (y2 > nb - 0.02 && y < nt + 0.02) for (let q = 0; q <= n; q++) list.push([q === 0 ? -hy + 0.03 : ((q - 0.5) / n - 0.5) * 2 * hy + hwN, q === n ? hy - 0.03 : ((q + 0.5) / n - 0.5) * 2 * hy - hwN]);
        else list.push([-hy + 0.03, hy - 0.03]);
        if (i !== 0 || fi !== 2) return list;
        // the first stage's south face shows only above the lateral flights and their parapets
        const xv = st.lateralBlock.xTo - (y - B - 1.6) * tanStair, out = [];
        for (const [a, b] of list) { if (xv <= landHalf) out.push([a, b]); else { if (a < -xv) out.push([a, Math.min(b, -xv)]); if (b > xv) out.push([Math.max(a, xv), b]); } }
        return out;
      };
      for (let j = Math.ceil((yb + 0.3) / BAND); j * BAND < y1 + PAR - 0.4; j++) {
        const y = j * BAND, y2 = y + COURSE;
        deco.color(0.83, 0.81, 0.78);
        for (const [a, b] of spans(y, y2)) if (b - a > 0.3) T.quadF(deco, at(y, a, 0.012), at(y, b, 0.012), at(y2, b, 0.012), at(y2, a, 0.012), nxw, 0, nzw);
        if (j % 2) continue;
        const yh = y + 6 * COURSE, yh2 = yh + 2 * COURSE;
        if (yh2 > y1 - 0.3) continue;
        deco.color(0.2, 0.185, 0.17);
        for (const [a, b] of spans(yh, yh2)) { const len = b - a, m = Math.floor((len - 0.9) / 1.36); if (m < 0) continue; for (let q = 0; q <= m; q++) { const c = (a + b) / 2 + (q - m / 2) * 1.36; T.quadF(deco, at(yh, c - 0.085, 0.012), at(yh, c + 0.085, 0.012), at(yh2, c + 0.085, 0.012), at(yh2, c - 0.085, 0.012), nxw, 0, nzw); } }
      }
    });
    deco.color(1, 1, 1);
  }
  // the plinth of the first stage (north, east and west: the stair block stands against the south face)
  {
    const a = d.baseSide / 2 + 0.45, b = d.baseSide / 2 - 0.5, y0 = B - 0.6, y1 = B + 0.9;
    T.boxInto(brick, [L2(-a, -a), L2(a, -a), L2(a, -b), L2(-a, -b)], y0, y1);
    T.boxInto(brick, [L2(-a, -b), L2(-b, -b), L2(-b, d.baseSide / 2), L2(-a, d.baseSide / 2)], y0, y1);
    T.boxInto(brick, [L2(b, -b), L2(a, -b), L2(a, d.baseSide / 2), L2(b, d.baseSide / 2)], y0, y1);
  }
  for (let i = 0; i < 6; i++) {
    const side = d.stages[i][0], yb = i === 0 ? B : tops[i - 1], y1 = tops[i], sink = i === 0 ? 1.5 : 0.4, n = d.recessesPerFace[i];
    const g = geom.nichedPrism(sq(side / 2 + BAT * sink), yb - sink, y1, {
      bay: side / n, nicheWidth: d.recess.width, nicheDepth: d.recess.depth, steps: 2, stepWidth: 0.33,
      socle: sink + (i === 0 ? 0.9 : 0.45), frieze: 0.9, batter: BAT, top: false,
    });
    stageGeoms.push({ g, yb, y1, side, sink, n });
    // the parapet (the plain band of the stele) and the terrace floor
    const halfTop = side / 2 - BAT * (y1 - yb), R0 = sq(halfTop);
    const gaps = i === 0 ? { 2: [halfTop - landHalf, halfTop + landHalf] } : {};
    const { inner } = T.parapetRing(brick, R0, y1, PAR, PT, BAT, { gaps, coping: { h: 2 * COURSE, out: 0.05 } });
    brick.polygon(flat(inner), null, y1, true);
    dressFaces(i, side, yb, y1, n, sink);
    // the walk between the parapet and the next stage
    const nx = i < 5 ? d.stages[i + 1][0] / 2 : d.temple.size[0] / 2, nz = i < 5 ? d.stages[i + 1][0] / 2 : d.temple.size[1] / 2, hin = halfTop - PT;
    terraces.push({ level: y1, ring: M.closeRing(sq((hin + nx) / 2, (hin + nz) / 2)), outer: M.closeRing(sq(hin)), inner: M.closeRing(sq(nx, nz)), width: hin - Math.max(nx, nz), stage: i + 1 });
    // fire bowls in the four corners of the terrace (conjectural: SPEC 3.19, 8)
    const fc = hin - 1.25;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) fires.push({ p: L3(sx * fc, y1, sz * fc), kind: 'terrace', stage: i + 1 });
    if (i % 2 === 0) for (const [mx, mz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) { if (i === 0 && mz === 1) continue; fires.push({ p: L3(mx * fc + (mz === 1 ? -3.2 : 0), y1, mz * fc), kind: 'terrace', stage: i + 1 }); }
    // drain spouts through the parapet and the brick gutters under them (not on the stair face of the first stage)
    const pil = [Math.round(n / 4), n - Math.round(n / 4)];
    FACES.forEach((F, fi) => {
      if (i === 0 && fi === 2) return;
      const tx = fi === 0 ? [1, 0] : fi === 1 ? [0, 1] : fi === 2 ? [-1, 0] : [0, -1];
      const o = L2(0, 0), nw = L2(F.n[0], F.n[1]), tw = L2(tx[0], tx[1]), nxw = nw[0] - o[0], nzw = nw[1] - o[1], ux = tw[0] - o[0], uz = tw[1] - o[1];
      for (const k of pil) {
        const frac = k / n - 0.5;                                   // a pilaster axis: the outline shrinks with the batter, the axis with it
        /** point on the face at level y: `off` m along it from the pilaster axis, `out` m proud of it */
        const at = (y, off = 0, out = 0) => { const h = side / 2 - BAT * (y - yb), t = frac * 2 * h + off, q = [tx[0] * t + F.n[0] * (h + out), tx[1] * t + F.n[1] * (h + out)]; return L3(q[0], y, q[1]); };
        const p = at(y1 + 0.02);
        geom.kit.spoutInto(brick.color(0.6, 0.58, 0.56), p[0], p[1], p[2], rot + F.az, 0.75, 0.42, 0.22, 0.08);
        brick.color(1, 1, 1);
        // gutter: two brick fins down the pilaster to the terrace below (or the court)
        const yLo = i === 0 ? B - 0.3 : yb - 0.2, yHi = y1 - 0.35;
        for (const s of [-1, 1]) {
          const c = s * 0.3, hw = 0.085, pr = 0.13;
          const a0 = at(yLo, c - hw), b0 = at(yLo, c + hw), b1 = at(yLo, c + hw, pr), a1 = at(yLo, c - hw, pr);
          const A0 = at(yHi, c - hw), B0 = at(yHi, c + hw), B1 = at(yHi, c + hw, pr), A1 = at(yHi, c - hw, pr);
          T.quadF(brick, a1, b1, B1, A1, nxw, 0, nzw);
          T.quadF(brick, a0, a1, A1, A0, -ux, 0, -uz);
          T.quadF(brick, b0, b1, B1, B0, ux, 0, uz);
          T.quadF(brick, A0, B0, B1, A1, 0, 1, 0);
        }
      }
    });
    // the door to the stair inside the brickwork: in the recess nearest the axis of the south face (stages 2 to 6)
    if (i > 0) {
      const frac = n % 2 ? 0 : 0.5 / n, y0 = yb + 0.45, y2 = y0 + 2.7;
      const at = (y, off) => { const h = side / 2 - BAT * (y - yb); return L3(frac * 2 * h + off, y, h - d.recess.depth + 0.04); };
      doors.push([at(y0, 0.72), at(y0, -0.72), at(y2, -0.72), at(y2, 0.72), [0, 1]]);
    }
  }

  // ---------------------------------------------------------------------------------------------- stairs ----
  const stairs = geom.writer({ verts: 8192 });
  const yL = tops[0], lo = B - 1.2, zIn = zFace - 2.35, zPar = zOut - st.parapet;
  const built = {};
  for (const [name, f, O] of [
    ['lateralWest', fl.lateralWest, (a, v, y) => L3(st.lateralBlock.xFrom + a, y, v)],
    ['lateralEast', fl.lateralEast, (a, v, y) => L3(st.lateralBlock.xTo - a, y, v)],
  ]) {
    const beside = (i) => (i + 1) * f.tread <= 2.0;              // the first steps stand clear of the tower's corner
    T.flightInto(stairs, O, {
      steps: f.risers, riser: f.riser, tread: f.tread, base: B, lo,
      vA: (i) => (beside(i) ? zFace : zIn), vB: zPar, closeA: beside,
      cheeks: [{ vIn: zPar, vOut: zOut, group: 3, hp: 0.95, extend: st.parapet, endLow: yL }],
    });
    built[name] = { risers: f.risers, top: B + f.risers * f.riser, run: f.risers * f.tread };
  }
  {
    const f = fl.central, hw = st.central.width / 2, vi = hw - st.parapet;
    T.flightInto(stairs, (a, v, y) => L3(v, y, zFoot - a), {
      steps: f.risers, riser: f.riser, tread: f.tread, base: B, lo, vA: -vi, vB: vi,
      cheeks: [{ vIn: -vi, vOut: -hw, group: 4, hp: 0.95 }, { vIn: vi, vOut: hw, group: 4, hp: 0.95 }],
    });
    built.central = { risers: f.risers, top: B + f.risers * f.riser, run: f.risers * f.tread };
  }
  // the reed-layer bands run on over the stair block: the sides of the central flight and the south face of the lateral block
  {
    const tanC = fl.central.tread / fl.central.riser, o = L2(0, 0), e = L2(1, 0), sth = L2(0, 1);
    deco.color(0.83, 0.81, 0.78);
    for (let j = Math.ceil((B + 0.3) / BAND); j * BAND < yL + 0.5; j++) {
      const y = j * BAND, y2 = y + COURSE, zc = zFoot - Math.max(0, (y - B - 0.6) * tanC) - 1.5, xl = st.lateralBlock.xTo - Math.max(0, (y - B - 0.6) * tanStair) - 1.2;
      const hw = st.central.width / 2 + 0.012;
      if (zc > zOut + 0.5) for (const sx of [-1, 1]) T.quadF(deco, L3(sx * hw, y, zOut + 0.03), L3(sx * hw, y, zc), L3(sx * hw, y2, zc), L3(sx * hw, y2, zOut + 0.03), sx * (e[0] - o[0]), 0, sx * (e[1] - o[1]));
      if (xl > st.central.width / 2 + 0.5) for (const sx of [-1, 1]) T.quadF(deco, L3(sx * (st.central.width / 2 + 0.03), y, zOut + 0.012), L3(sx * xl, y, zOut + 0.012), L3(sx * xl, y2, zOut + 0.012), L3(sx * (st.central.width / 2 + 0.03), y2, zOut + 0.012), sth[0] - o[0], 0, sth[1] - o[1]);
    }
    deco.color(1, 1, 1);
  }
  // the landing: level with the first terrace, between the three flights
  const halfTop0 = d.stages[0][0] / 2 - BAT * (yL - B);
  T.quadF(stairs, L3(-landHalf, yL, halfTop0 - PT), L3(landHalf, yL, halfTop0 - PT), L3(landHalf, yL, zOut), L3(-landHalf, yL, zOut), 0, 1, 0);
  // fire bowls: on the parapet ends at the landing and beside the foot of the central flight
  for (const s of [-1, 1]) {
    fires.push({ p: L3(s * (landHalf - 0.5), yL + 0.95, zOut - 0.5), kind: 'landing', plinth: 0.2 });
    T.boxInto(stairs, [L2(s * 6.1 - 0.75, zFoot + 0.2), L2(s * 6.1 + 0.75, zFoot + 0.2), L2(s * 6.1 + 0.75, zFoot + 1.7), L2(s * 6.1 - 0.75, zFoot + 1.7)], B - 0.5, B + 0.75);
    fires.push({ p: L3(s * 6.1, B + 0.75, zFoot + 0.95), kind: 'foot', plinth: 0.2 });
  }

  // ---------------------------------------------------------------------------------------------- temple ----
  const yT = tops[5], tx = d.temple.size[0] / 2, tz = d.temple.size[1] / 2, yTop = yT + d.temple.height;      // +94: the summit
  const MER = 0.9, TPAR = 0.6, roofY = yTop - MER - TPAR, ringT = sq(tx, tz);
  const glaze = geom.writer({ verts: 4096 }), roof = geom.writer();
  const templeBody = geom.nichedPrism(ringT, yT - 0.4, yTop - MER, { bay: 7, nicheWidth: 2.3, nicheDepth: 0.8, steps: 3, stepWidth: 0.33, socle: 0.4 + 1.3, frieze: TPAR + 1.5, top: false });
  T.parapetRing(glaze, ringT, roofY, TPAR, 0.6, 0, { outer: false });
  T.bandInto(glaze, sq(tx + 0.3, tz + 0.3), ringT, yT - 0.2, yT + 1.1, { bottom: false });                       // plinth
  T.bandInto(glaze, sq(tx + 0.17, tz + 0.17), ringT, roofY - 0.2, roofY + TPAR - 0.17);                          // a cornice of four courses under the merlons
  roof.polygon(flat(geom.insetRing(ringT, 0.6)), null, roofY, true);
  const templeMerlons = geom.merlons(M.closeRing(geom.insetRing(ringT, 0.3)), { y: yTop - MER, pitch: 1.25, width: 0.8, height: MER, thickness: 0.5 });
  // doors south (on the stair axis) and north (stele plan): a door tower with stepped reveals before the middle buttress
  const portals = [];
  for (const [sgn, az] of [[1, 180], [-1, 0]]) {
    const proud = 0.8, depth = 1.7, c = L2(0, sgn * (tz + proud - depth / 2)), floor = yT + 0.16, dh = 8.2;
    portals.push(geom.passageBlock({ x: c[0], z: c[1], rotDeg: rot + az, width: 4.6, depth, base: yT - 0.3, floor, top: yT + 14.2, door: { width: 2.2, height: dh, arch: false }, rebates: 2, rebateDepth: 0.26, rebateStep: 0.3 }));
    doors.push([L3(sgn * 1.12, floor, sgn * (tz + 0.05)), L3(-sgn * 1.12, floor, sgn * (tz + 0.05)), L3(-sgn * 1.12, floor + dh, sgn * (tz + 0.05)), L3(sgn * 1.12, floor + dh, sgn * (tz + 0.05)), [0, sgn]]);
    if (sgn > 0) for (const s of [-1, 1]) fires.push({ p: L3(s * 4.4, yT, tz + 2.2), kind: 'temple' });
  }
  const cedar = geom.writer();
  for (const [a, b, c2, d2, n] of doors) { const q = L2(n[0], n[1]), o = L2(0, 0); T.quadF(cedar, a, b, c2, d2, q[0] - o[0], 0, q[1] - o[1]); }

  parts.brick.push(...stageGeoms.map((s) => s.g), brick, stairs);
  parts.brickDeco.push(deco);
  parts.glaze.push(templeBody, glaze, templeMerlons, ...portals);
  parts.roof.push(roof);
  parts.cedar.push(cedar);

  // ---------------------------------------------------------------------------------------------- checks ----
  // measured on what was built: extents of the first stage in the tower's own axes, interpolated to the court level
  const extentAt = (g, y) => { const p = g.attributes.position; let mn = Infinity, mx = -Infinity; for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - y) < 1e-3) { const l = M.worldToLocal(C, rot, p.getX(i), p.getZ(i)); mn = Math.min(mn, l[0]); mx = Math.max(mx, l[0]); } return mx - mn; };
  const s0 = stageGeoms[0], wA = extentAt(s0.g, B - s0.sink), wB = extentAt(s0.g, B + 0.9), baseSide = wA + ((wB - wA) * s0.sink) / (s0.sink + 0.9);
  let summit = -Infinity; { const p = templeMerlons.attributes.position; for (let i = 0; i < p.count; i++) summit = Math.max(summit, p.getY(i)); }
  const heights = d.stages.map((s, i) => +(tops[i] - (i ? tops[i - 1] : B)).toFixed(2));
  const checks = [
    { name: 'Etemenanki base side at court level (m)', value: +baseSide.toFixed(2), expect: d.baseSide, pass: Math.abs(baseSide - d.baseSide) < 0.05 },
    { name: 'Etemenanki stages below the temple', value: stageGeoms.length, expect: 6, pass: stageGeoms.length === 6 },
    { name: 'stage heights (m)', value: heights.join(' / '), expect: d.stages.map((s) => s[1]).join(' / '), pass: heights.every((h, i) => Math.abs(h - d.stages[i][1]) < 0.01) },
    { name: 'first stage : mean of the others', value: +(heights[0] / (heights.slice(1).reduce((a, b) => a + b, 0) / 5)).toFixed(2), expect: 'about 3', pass: heights[0] / (heights.slice(1).reduce((a, b) => a + b, 0) / 5) > 2.8 },
    { name: 'summit level (datum)', value: +summit.toFixed(2), expect: d.summitLevel, pass: Math.abs(summit - d.summitLevel) < 0.02 },
    { name: 'central flight risers', value: built.central.risers, expect: 156, pass: built.central.risers === 156 },
    { name: 'lateral flight risers (west / east)', value: built.lateralWest.risers + ' / ' + built.lateralEast.risers, expect: '131 / 131', pass: built.lateralWest.risers === 131 && built.lateralEast.risers === 131 },
    { name: 'flights reach above the court (m: central / west / east)', value: [built.central, built.lateralWest, built.lateralEast].map((b) => (b.top - B).toFixed(2)).join(' / '), expect: '27.1 each', pass: [built.central, built.lateralWest, built.lateralEast].every((b) => Math.abs(b.top - B - st.landing.level) < 0.03) },
    { name: 'flight runs (m: central / lateral)', value: built.central.run.toFixed(2) + ' / ' + built.lateralWest.run.toFixed(2), expect: '51.6 / 43.15', pass: Math.abs(built.central.run - fl.central.run) < 0.05 && Math.abs(built.lateralWest.run - fl.lateralWest.run) < 0.05 },
    { name: 'foot of the central flight from world.json footModel (m)', value: +Math.hypot(L2(0, zFoot)[0] - st.footModel[0], L2(0, zFoot)[1] - st.footModel[1]).toFixed(2), expect: 'under 0.3', pass: Math.hypot(L2(0, zFoot)[0] - st.footModel[0], L2(0, zFoot)[1] - st.footModel[1]) < 0.3 },
    { name: 'recesses per face, stages 1 to 6 (laid out by the kit)', value: stageGeoms.map((s) => geom.kit.facadeProfile(s.side + 2 * BAT * s.sink, { bay: s.side / s.n, nicheWidth: d.recess.width, nicheDepth: d.recess.depth }).bays).join(' / '), expect: d.recessesPerFace.join(' / '), pass: stageGeoms.every((s) => geom.kit.facadeProfile(s.side + 2 * BAT * s.sink, { bay: s.side / s.n, nicheWidth: d.recess.width, nicheDepth: d.recess.depth }).bays === s.n) },
  ];
  const insp = geom.inspect(s0.g), inspStairs = T.flipped(stairs);
  checks.push({ name: 'first stage: flipped normals, coplanar overlap (m2)', value: insp.flipped + ', ' + insp.overlap, expect: '0, 0', pass: insp.flipped === 0 && insp.overlap < 0.01 });
  checks.push({ name: 'stairs: flipped normals', value: inspStairs.flipped, expect: 0, pass: inspStairs.flipped === 0 });

  const api = {
    stairs: [
      { from: L3(0, B, zFoot), to: L3(0, yL, zOut), width: st.central.width - 2 * st.parapet, name: 'central', risers: fl.central.risers, riser: fl.central.riser, tread: fl.central.tread },
      { from: L3(st.lateralBlock.xFrom, B, (zFace + zPar) / 2), to: L3(-landHalf, yL, (zFace + zPar) / 2), width: zPar - zFace, name: 'lateralWest', risers: fl.lateralWest.risers, riser: fl.lateralWest.riser, tread: fl.lateralWest.tread },
      { from: L3(st.lateralBlock.xTo, B, (zFace + zPar) / 2), to: L3(landHalf, yL, (zFace + zPar) / 2), width: zPar - zFace, name: 'lateralEast', risers: fl.lateralEast.risers, riser: fl.lateralEast.riser, tread: fl.lateralEast.tread },
    ],
    terraces,
    landing: { center: L3(0, yL, (halfTop0 + zOut) / 2), level: yL, size: [2 * landHalf, zOut - halfTop0] },
    summit: yTop, base: B, rotationDeg: rot,
  };
  return { fires, checks, api, stats: { stageTris: stageGeoms.reduce((a, s) => a + geom.triCount(s.g), 0), stairTris: stairs.triangleCount } };
}
