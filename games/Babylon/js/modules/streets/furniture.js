// js/modules/streets/furniture.js — what stands on the roadway (R5 3.2 "street furniture", SPEC 3.7, 3.14):
//   street altars and pedestals: baked-brick or mud-brick blocks 1 to 2 m square, about 1 m high, with vertical
//     grooves on three sides, on a patch of baked-brick paving; mud-brick daises
//   the public ring-well beside the Processional Way
//   the one street drain (south of the Great House, Koldewey ch. 42)
//   brick steps where a lane climbs a bank
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

export function buildFurniture(ctx, net, surf) {
  const { geom, ground, layout, materials, world, W } = ctx;
  const stats = { altars: 0, daises: 0, pedestals: 0, wells: 0, drainM: 0, stairs: 0, patches: 0 }, checks = [], list = [];
  // ONE material for everything here (baked brick, bonded at true size on every face): mud brick, soot-black hollows
  // and paving are tints of it, so the furniture of the whole city costs one draw call per square kilometre
  const brick = [];
  const ratio = (id, k = 1) => { const a = materials.color(id), b = materials.color('bakedBrickBuff'); return [Math.min(1, (a.r / b.r) * k), Math.min(1, (a.g / b.g) * k), Math.min(1, (a.b / b.b) * k)]; };
  const MUD = ratio('mudPlaster', 0.95), SOOT = [0.1, 0.095, 0.09], PAVE = ratio('courtBrickPaving'), WATER = [0.07, 0.08, 0.08];
  const mud = { push: (g) => brick.push(geom.paint(g, MUD)) }, dark = { push: (g) => brick.push(geom.paint(g, SOOT)) }, pave = { push: (g) => brick.push(geom.paint(g, PAVE)) };
  const yAt = (x, z) => net.baseY(x, z) + net.liftAt(x, z);

  /** a patch of baked-brick paving following the ground, edged with a kerb course */
  function patch(cx, cz, rotDeg, sx, sz) {
    const n = Math.max(2, Math.ceil(sx / 1.5)), m = Math.max(2, Math.ceil(sz / 1.5)), pos = [], idx = [], nor = [];
    const P = (i, j) => M.localToWorld([cx, cz], rotDeg, -sx / 2 + (sx * i) / n, -sz / 2 + (sz * j) / m);
    for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++) { const [x, z] = P(i, j); pos.push(x, yAt(x, z) + 0.04, z); nor.push(0, 1, 0); }
    // local +x is the model azimuth rotDeg + 90 and local +z is rotDeg + 180: (x_i+1 - x_i) x (z_j+1 - z_j) points down, so wind i, j+1, i+1
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    // the edge: bricks set on edge, a hand higher, and a skirt into the ground
    const ring = []; for (let i = 0; i <= n; i++) ring.push(P(i, 0)); for (let j = 1; j <= m; j++) ring.push(P(n, j)); for (let i = n - 1; i >= 0; i--) ring.push(P(i, m)); for (let j = m - 1; j >= 1; j--) ring.push(P(0, j));
    pave.push(geom.custom({ position: pos, normal: nor, index: idx }));
    brick.push(geom.wall(ring, { closed: true, thickness: 0.17, base: (x, z) => yAt(x, z) - 0.3, top: (x, z) => yAt(x, z) + 0.075, step: 1.5 }));
    stats.patches++;
  }

  /**
   * An altar: plinth course, grooved block, cap slab with a low rim; `kind` 'brick' (baked brick) or 'mud'.
   * The grooved faces are the front and the two sides; the back is plain (R5: "vertical grooves on three sides").
   */
  function altar(x, z, rotDeg, size, height, kind, smoke) {
    const y = yAt(x, z) + 0.04, into = kind === 'mud' ? mud : brick, s = size, base = y - 0.45;
    into.push(geom.box({ x, z, y0: base, y1: y + 0.17, sx: s + 0.3, sz: s + 0.3, rotDeg, bottom: false }));                    // plinth course
    const ring = M.rectRing(x, z, s, s, rotDeg);
    const bay = s / Math.max(2, Math.round(s / 0.42));
    into.push(geom.nichedPrism(ring, y + 0.17, y + height - 0.17, { bay, nicheWidth: bay * 0.42, nicheDepth: 0.07, steps: 1, stepWidth: 0.04, socle: 0.09, frieze: 0.09, edges: [0, 1, 3], minEdge: 0.3 }));
    into.push(geom.box({ x, z, y0: y + height - 0.17, y1: y + height, sx: s + 0.16, sz: s + 0.16, rotDeg }));                  // cap slab
    // a rim round the top and the burnt hollow inside it
    const rim = M.rectRing(x, z, s - 0.1, s - 0.1, rotDeg);
    into.push(geom.wall(M.openRing(rim), { closed: true, thickness: 0.13, base: y + height, top: y + height + 0.09 }));
    dark.push(geom.cap(M.rectRing(x, z, s - 0.36, s - 0.36, rotDeg), y + height + 0.025));
    if (smoke) ctx.emitters.add({ kind: 'smoke', pos: [x, y + height + 0.15, z], size: 0.5 });
    list.push({ kind: 'altar', x, z, y, size, height });
    stats.altars++;
  }
  /** a mud-brick dais: a low two-stepped platform */
  function dais(x, z, rotDeg, size) {
    const y = yAt(x, z);
    mud.push(geom.box({ x, z, y0: y - 0.45, y1: y + 0.24, sx: size + 0.7, sz: size + 0.7, rotDeg, bottom: false }));
    mud.push(geom.box({ x, z, y0: y + 0.24, y1: y + 0.5, sx: size, sz: size, rotDeg }));
    list.push({ kind: 'dais', x, z, y, size, height: 0.5 });
    stats.daises++;
  }

  // The temples module builds the altars that belong to a temple door and the excavated pedestals (the two street
  // altars of the Ishtar-of-Agade forecourt, the pedestal in the Ziggurat Street), and reserves the sites of its
  // shrines in prepare(). When it is part of this build they are left to it; alone, this module builds them.
  const templeSites = (layout.reserved || []).filter((r) => r.owner === 'temples');
  const temples = templeSites.length > 0;
  const nearTempleSite = (x, z, d) => templeSites.some((r) => M.distToRing(x, z, M.openRing(r.polygon)) < d || M.pointInPolygon(x, z, r.polygon));
  stats.templesPresent = temples;

  // ---- 1. the altars the plan gives ---------------------------------------------------------------------------
  const facing = (x, z) => { const h = net.streetAt(x, z) || layout.nearestStreetPoint(x, z, { maxDist: 40 }); if (!h) return 0; const d = h.rec ? [h.dx, h.dz] : h.dir; return M.dirToAz(d[0], d[1]) + 90; };
  const mg = world.streets.find((s) => s.id === 'mardukGateStreet');
  if (mg && mg.altar && !temples) {
    // "baked-brick pedestal/altar with Esarhaddon and Assurbanipal bricks, in the street": 3.6 m north of the paved lane
    // world.json puts it 13 m off the centre line of a street the layout makes 20 m wide (R5: 17 to 27 m): where
    // that spot is not on the street it is pulled toward the centre line until its paved patch clears the house fronts
    const mr = net.recs.find((r) => r.id === 'mardukGateStreet');
    let ax = mg.altar.x, az = mg.altar.z;
    if (mr) {
      const h = M.nearestOnPolyline(ax, az, mr.pl), lt = mr.lat(h.s), lim = Math.min(-lt[0], lt[1]) - 2.6;
      if (h.dist > lim) { const k = lim / h.dist; ax = h.x + (ax - h.x) * k; az = h.z + (az - h.z) * k; stats.mardukAltarMoved = +(h.dist - lim).toFixed(1); }
    }
    const rot = facing(ax, az);
    patch(ax, az, rot, 4.2, 4.2); altar(ax, az, rot, 1.9, 1.15, 'brick', true);
  }
  const ia = W.hasMonument && W.hasMonument('ishtarAgadeTemple') ? W.monument('ishtarAgadeTemple') : null;
  let iaAltars = 0;
  if (ia && ia.dims && ia.dims.streetAltars && !temples) {
    // two brick street altars in the forecourt of the Ishtar-of-Agade temple (one before the door, one at its SW corner)
    const rot = facing(435, -296);
    ia.dims.streetAltars.forEach(([x, z], k) => { patch(x, z, rot, k ? 3.0 : 3.8, k ? 3.0 : 3.8); altar(x, z, rot + 180, k ? 1.1 : 1.4, k ? 0.95 : 1.1, 'brick', k === 0); iaAltars++; });
  }

  // ---- 2. crossings ("Four Streets" of Tintir V): two mud-brick daises and two baked-brick pedestals -------------
  let q = 0;
  for (const sq of layout.squares || []) {
    if (sq.use !== 'crossing') continue;
    const c = sq.center, R = M.openRing(sq.polygon);
    // toward the corner of the square that lies farthest from every street axis
    let best = null, bd = -1;
    for (const p of R) { const x = c[0] + (p[0] - c[0]) * 0.62, z = c[1] + (p[1] - c[1]) * 0.62, h = layout.nearestStreetPoint(x, z, { maxDist: 60 }), d = h ? h.dist - h.width / 2 : 5; if (d > bd && !layout.houseAt(x, z)) { bd = d; best = [x, z]; } }
    if (!best || nearTempleSite(best[0], best[1], 12)) continue;
    const rot = facing(c[0], c[1]);
    if (q % 2 === 0) dais(best[0], best[1], rot, 2.2); else { patch(best[0], best[1], rot, 3.4, 3.4); altar(best[0], best[1], rot, 1.5, 1.05, 'brick', false); stats.pedestals++; }
    q++;
  }

  // ---- 3. street-corner altars where a lane comes out on a main street -------------------------------------------
  let corner = 0;
  for (const r of net.recs) {
    for (const end of [0, 1]) {
      const host = end ? r.hostEnd : r.hostStart; if (!host) continue;
      const o = host.rec; if (o.cls !== 'main' || o.corridor) continue;
      if (hash2(r.index, end, 4711) > 0.085) continue;
      const lt = o.lat(host.s), hw = (lt[1] - lt[0]) / 2; if (hw < 3.4) continue;
      // which side of the main street the lane comes from, and a spot on that side just past the mouth
      const pE = net.at(r, end ? r.e1 : r.e0), pO = net.at(o, host.s), side = (pE.x - pO.x) * pO.rx + (pE.z - pO.z) * pO.rz >= 0 ? 1 : -1;
      const along = (r.widthAt(end ? r.s1 : r.s0) / 2 + 1.3) * (hash2(r.index, end, 4712) < 0.5 ? 1 : -1), s2 = host.s + along;
      if (s2 < o.e0 + 2 || s2 > o.e1 - 2) continue;
      const p2 = net.at(o, s2), x = p2.x + p2.rx * side * (hw - 0.8), z = p2.z + p2.rz * side * (hw - 0.8);
      if (layout.houseAt(x, z) || net.zoneAt(x, z) === 0) continue;
      // not in front of a door, and nothing of ours within 40 m already
      let clear = true; for (const h of layout.housesNear(x, z, 6)) if (h.door && Math.hypot(h.door[0] - x, h.door[1] - z) < 2.6) clear = false;
      for (const f of list) if (Math.hypot(f.x - x, f.z - z) < 40) clear = false;
      if (!clear || nearTempleSite(x, z, 45)) continue;
      const rot = M.dirToAz(p2.rx * -side, p2.rz * -side);                     // the grooved front looks across the street
      altar(x, z, rot, 0.9, 0.9, hash2(r.index, end, 4713) < 0.6 ? 'mud' : 'brick', hash2(r.index, end, 4714) < 0.3);
      corner++;
    }
  }
  stats.cornerAltars = corner;

  // ---- 4. the public ring-well beside the Processional Way (R5 2.2: "1 public well by the Processional Way") -----
  if (net.pw) {
    const pw = net.pw, s = M.nearestOnPolyline(344, -352, pw.pl).s, p = net.at(pw, s), x = p.x - p.rx * 6.3, z = p.z - p.rz * 6.3, y = yAt(x, z) + 0.04;
    const N = 14, ringAt = (rad) => { const o = []; for (let k = 0; k < N; k++) { const a = (k / N) * M.TAU; o.push([x + Math.cos(a) * rad, z + Math.sin(a) * rad]); } o.push(o[0].slice()); return o; };
    // a paved apron, the brick well head (ring of 14 faces, 0.62 m high, shaft 0.9 m across), black water far down
    patch(x + p.rx * 0.2, z + p.rz * 0.2, M.dirToAz(p.dx, p.dz), 3.8, 4.4);
    brick.push(geom.prism(ringAt(0.85), y - 0.5, y + 0.62, { holes: [ringAt(0.45)] }));
    dark.push(geom.cap(ringAt(0.46), y - 0.45));
    // the trough beside it: a hollowed block
    const t = M.localToWorld([x, z], M.dirToAz(p.dx, p.dz), 0.1, 1.55);
    brick.push(geom.prism(M.rectRing(t[0], t[1], 1.9, 0.75, M.dirToAz(p.dx, p.dz)), y - 0.4, y + 0.42, { holes: [M.rectRing(t[0], t[1], 1.6, 0.45, M.dirToAz(p.dx, p.dz))] }));
    dark.push(geom.cap(M.rectRing(t[0], t[1], 1.61, 0.46, M.dirToAz(p.dx, p.dz)), y + 0.2));
    list.push({ kind: 'well', x, z, y, size: 1.7, height: 0.62 });
    stats.wells++;
  }

  // ---- 4b. baked-brick paving before the doors of some rich houses (R5 2.2: "in front of some rich private houses") ---
  let doorPatches = 0;
  for (const h of layout.houses || []) {
    if (!(h.cls === 'mansion' || h.cls === 'large') || !h.door || !layout.isBuilt(h)) continue;
    if (hash2(h.seed & 0xffff, h.seed >>> 16, 4721) > (h.cls === 'mansion' ? 0.6 : 0.22)) continue;
    const x = h.door[0] + h.doorDir[0] * 1.45, z = h.door[1] + h.doorDir[1] * 1.45;
    if (net.zoneAt(x, z) > 2) continue;
    const hit = net.streetAt(x, z); if (!hit || hit.rec.corridor) continue;                  // only where the door opens on a street of ours
    const lt = hit.rec.lat(hit.s); if (lt[1] - lt[0] < 3.2) continue;
    if (Math.abs(ground.height(x, z) - ground.height(h.door[0], h.door[1])) > 0.25) continue;
    patch(x, z, M.dirToAz(h.doorDir[0], h.doorDir[1]), 3.4, 2.5);
    list.push({ kind: 'doorPaving', x, z, y: yAt(x, z), size: 3.4, height: 0.04 });
    doorPatches++;
  }
  stats.doorPatches = doorPatches;

  // ---- 5. the street drain south of the Great House: a brick-lined gutter down the middle of the lane -------------
  const gh = (layout.houses || []).find((h) => /Great House/.test(h.landmark || ''));
  const dr = gh && net.recs.find((r) => r.id === 'merkes6');
  if (dr && dr.pieces.length) {
    const bb = M.bbox(gh.footprint), s0 = M.nearestOnPolyline(bb[0] + 2, bb[3], dr.pl).s, s1 = M.nearestOnPolyline(bb[2] - 1, bb[3], dr.pl).s;
    // the piece of the lane that runs along most of the house's south front
    let pc = dr.pieces[0], bo = -1; for (const q of dr.pieces) { const o = Math.min(q.b, s1) - Math.max(q.a, s0); if (o > bo) { bo = o; pc = q; } }
    const sA = Math.max(pc.a + 1.5, s0), sB = Math.min(pc.b - 1.5, s1);
    if (sB - sA > 8) {
      const line = [], floorPos = [], floorNor = [], floorIdx = [];
      for (let s = sA; s <= sB + 1e-6; s += 1.0) { const p = net.at(dr, s); line.push([p.x, p.z, p.rx, p.rz]); }
      // two kerbs of bricks set on edge, a hand above the trodden earth, and the wet channel between them
      for (const side of [-1, 1]) brick.push(geom.wall(line.map((p) => [p[0] + p[2] * side * 0.27, p[1] + p[3] * side * 0.27]), { thickness: 0.15, base: (x, z) => yAt(x, z) - 0.4, top: (x, z) => yAt(x, z) + 0.085, step: 0 }));
      line.forEach((p, i) => { for (const side of [-1, 1]) { const x = p[0] + p[2] * side * 0.2, z = p[1] + p[3] * side * 0.2; floorPos.push(x, yAt(x, z) + 0.03, z); floorNor.push(0, 1, 0); } if (i) { const a = (i - 1) * 2; floorIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
      brick.push(geom.paint(geom.custom({ position: floorPos, normal: floorNor, index: floorIdx }), WATER));
      stats.drainM = Math.round(sB - sA);
    }
  }

  // ---- 6. steps where a street climbs a bank (the terrace of the Processional Way, canal levees) -----------------
  const steps = [];
  for (const r of net.recs) {
    if (r.corridor) continue;
    for (const pc of r.pieces) {
      let run = null;
      const close = () => { if (run && Math.abs(run.y1 - run.y0) > 0.7 && run.b - run.a >= 1.5) steps.push(run); run = null; };
      for (let s = pc.a + 0.5; s + 1 <= pc.b - 0.5; s += 1) {
        const p0 = net.at(r, s), p1 = net.at(r, s + 1), y0 = ground.height(p0.x, p0.z), y1 = ground.height(p1.x, p1.z), g = y1 - y0;
        if (Math.abs(g) > 0.27 && Math.abs(g) < 1.2) { if (run && Math.sign(g) === run.sign) { run.b = s + 1; run.y1 = y1; } else { close(); run = { rec: r, a: s, b: s + 1, y0, y1, sign: Math.sign(g) }; } } else close();
      }
      close();
    }
  }
  for (const st of steps) {
    const r = st.rec, mid = net.at(r, (st.a + st.b) / 2);
    if (net.filmDist(mid.x, mid.z) > 700) continue;
    // foot at the low end, climbing along the street
    const up = st.sign > 0, sLow = up ? st.a : st.b, low = net.at(r, sLow), dir = up ? [low.dx, low.dz] : [-low.dx, -low.dz];
    const rise = Math.abs(st.y1 - st.y0), run = st.b - st.a, n = Math.max(3, Math.round(rise / 0.17)), w = Math.max(1.0, r.widthAt(sLow) - 0.3);
    const base = Math.min(st.y0, st.y1) + net.liftAt(low.x, low.z) + 0.02;
    brick.push(geom.stairs({ x: low.x - dir[0] * 0.15, z: low.z - dir[1] * 0.15, azDeg: M.dirToAz(dir[0], dir[1]), width: w, steps: n, riser: (rise + 0.06) / n, tread: (run + 0.3) / n, base, sink: 0.6, back: true }));
    list.push({ kind: 'stairs', x: mid.x, z: mid.z, y: base, size: w, height: rise, steps: n, street: r.id });
    stats.stairs++;
  }

  // ---- 7. the culvert of the Libil-hegalla under the Processional Way (SPEC 3.3, conjectural): "a baked-brick culvert
  //         or arched opening about 3 m wide ... between retaining walls". Two brick head walls square to the canal, where
  //         the ground model ends the cut: the lined channel on the west, the wide earth cut on the east.
  const canal = (ground.canals || []).find((c) => c.id === 'libilHegalla');
  const cul = canal && (canal.culverts || []).find((c) => /Processional/i.test(c[2] || ''));
  if (canal && cul && net.pw) {
    for (const end of [0, 1]) {
      const sC = cul[end], h = M.pointAlong(canal.polyline, sC), d = h.dir, u = [-d[1], d[0]], out = end ? 1 : -1;      // `out`: toward the open channel
      // street level above the mouth, and how wide the sheer face is (the lined slot west, the 28 m cut east)
      const hit = M.nearestOnPolyline(h.x, h.z, net.pw.pl), lvl = ground.height(hit.x, hit.z);
      const open = [h.x + d[0] * out * 1.2, h.z + d[1] * out * 1.2];
      let half = 2.5; while (half < 18 && (ground.height(open[0] + u[0] * (half + 0.5), open[1] + u[1] * (half + 0.5)) < lvl - 6 || ground.height(open[0] - u[0] * (half + 0.5), open[1] - u[1] * (half + 0.5)) < lvl - 6)) half += 0.5;
      half += end ? 3.6 : 2.2;                                                                                        // bonded into the banks
      // the ground model ends the cut in a raw step that the terrain draws ragged within a leaf or two (docs/ground.md 3):
      // the wall is 4.4 m thick (2 m at the narrow lined slot) with the step in its middle
      const th = end ? 4.4 : 2.4, off = 0, cx = h.x + d[0] * off, cz = h.z + d[1] * off;
      const a = [cx - u[0] * half * out, cz - u[1] * half * out], b = [cx + u[0] * half * out, cz + u[1] * half * out];  // front (rebates) on the left of travel = the open channel
      const top = lvl + 0.95, bed = canal.bed ?? -4.5, wl = canal.waterLevel ?? ground.waterLevel;
      brick.push(geom.archedWall({ a, b, thickness: th, base: bed - 0.7, floor: bed, top, door: { width: 3.0, height: wl - bed + 2.4, arch: true, at: 0.5 }, rebates: 2 }));
      // black water standing in the mouth, and a coping course
      dark.push(geom.cap(M.rectRing(cx, cz, 2.96, th + 0.3, M.dirToAz(u[0], u[1]) + 90), wl - 0.02));
      brick.push(geom.box({ x: cx, z: cz, y0: top, y1: top + 0.12, sx: 2 * half + 0.2, sz: th + 0.24, rotDeg: M.dirToAz(d[0], d[1]) }));
      list.push({ kind: 'culvertWall', x: cx, z: cz, y: top, size: 2 * half, height: top - bed });
      stats.culvertWalls = (stats.culvertWalls || 0) + 1;
    }
  }

  // a sample for the self-test: one altar as it is built above (without its ash)
  const sample = (() => { const keep = brick.length; const n0 = list.length, a0 = stats.altars; altar(-9000, 9000, 0, 1.2, 1.0, 'brick', false); const parts = brick.splice(keep); list.length = n0; stats.altars = a0; return geom.merge(parts.slice(0, 4)); })();

  // ---- submit ----------------------------------------------------------------------------------------------------
  if (brick.length) geom.addStatic('bakedBrickBuff', geom.merge(brick), { lod: [0, 900], tile: 1024, shadowTexel: 0.3 });

  checks.push({ name: 'street altars, pedestals and daises', value: stats.altars + stats.daises, expect: '>= 12', pass: stats.altars + stats.daises >= 12 });
  checks.push({ name: 'street altars of the Ishtar-of-Agade forecourt (built here unless the temples module builds them)', value: temples ? 'temples' : iaAltars, expect: '2 or temples', pass: temples || iaAltars === 2 });
  return { stats, checks, list, sample };
}
