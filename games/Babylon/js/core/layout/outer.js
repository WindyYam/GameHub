// layout/outer.js — everything outside the inner walls (SPEC 3.16, R5 3.2, 3.6; all of it conjectural):
//   - the outer city (between the inner moat and Nebuchadnezzar's outer wall): suburbs as patches of blocks
//     along the gate roads, with garden plots between the houses; the rest of the district stays garden and field
//     (ground.landUse);
//   - ribbons of houses along the country roads beyond the walls and on the west bank, thinning with distance;
//   - the 28 villages of world.json as short lanes with plots on both sides.
// The same machinery as inside the walls (net.gridSplit, parcels, house records), with looser parameters.

export function buildOuter(env) {
  const { world, W, M, G, root, net, paramsAt, addStreet, streets, streetById, buildBlock, addOpen, addHouse, inReserved, villages, houses, RURAL, EDGE, OPEN, PARTY, housesNearRaw, overlapsHouse, onReserved } = env;
  const rng = root.fork('outer');

  // ---- conjectural roads that world.json does not have: suburbs need something to stand along ----------
  const road = (id, name, pl, width = 7) => addStreet({ id, name, cls: 'road', polyline: pl, width, src: 'generated', conjectural: true, level: 3 });
  const gate = (n) => W.gate(n), og = (n) => world.outerWall.gates.find((g) => g.name === n);
  const mg = gate('Marduk Gate').causeway.to, md = og('Gate of the Madanu Canal');
  road('road:Marduk Gate suburb road', 'road from the Marduk Gate to the Gate of the Madanu Canal', [mg, [1640, -306], [1790, -520], [1915, -850], [2010, -1180], [md.x - 14, md.z + 26]]);
  const eg = gate('Enlil Gate').causeway.to;
  road('road:Enlil Gate road', 'road north from the Enlil Gate along the west bank', [eg, [-382, -800], [-432, -1100], [-455, -1470]], 6);
  const ag = gate('Adad Gate').causeway.to;
  road('road:Adad Gate road', 'road from the Adad Gate', [ag, [-1500, 905], [-1800, 1160], [-2110, 1470]], 6);
  const zg = gate('Zababa Gate').causeway.to;
  road('road:east moat road', 'road along the outer bank of the east moat', [[mg[0] + 34, mg[1] + 40], [1548, 100], [zg[0] + 36, zg[1] - 40]], 6);
  const sh = og('Gate of the Shuhi Canal');
  road('road:Shuhi Gate road', 'road from the north road to the Gate of the Shuhi Canal', [[1012, -2484], [1200, -2500], [sh.x - 24, sh.z + 4]], 6);
  road('road:north suburb road', 'cross road of the northern suburb', [[535, -1545], [800, -1500], [1100, -1450], [1400, -1420], [1700, -1440]], 6);
  const ug = gate('Urash Gate').causeway.to, sg = og('Gate of the Sun of the Gods');
  road('road:south moat road', 'road from the Urash Gate landing to the Gate of the Sun of the Gods', [[ug[0] + 24, ug[1] + 18], [600, 985], [1100, 900], [1500, 850], [sg.x - 8, sg.z - 26]], 6);

  // ---- where nothing may stand --------------------------------------------------------------------
  const waters = [world.river.polygon, ...world.moats.map((m) => m.polygon)].map((r) => ({ ring: M.openRing(r), bb: M.bbox(r) }));
  const lines = [];
  const addLine = (pl, half) => lines.push({ pl, half, bb: M.bbox(pl) });
  for (const c of world.canals) addLine(c.polyline, (c.width || 10) / 2 + 8);
  addLine(world.outerWall.line, 30);
  if (world.outerWall.crossWall) addLine(world.outerWall.crossWall.polyline, 9);
  for (const side of ['east', 'west']) addLine(world.innerWalls[side].quayLine, 12);
  const roadLines = () => streets.filter((s) => s.cls === 'road').map((s) => ({ pl: s.polyline, half: s.width / 2 + 0.2, bb: s.bb, id: s.id }));
  let roads = roadLines();
  const innerRings = [world.enclosures.innerEast, world.enclosures.innerWest].map((r) => ({ ring: r, bb: M.bbox(r) }));
  const outerRing = world.enclosures.outerCity, outerBB = M.bbox(outerRing);
  function blocked(x, z, ownRoad) {
    for (const w of waters) if (M.inBBox(w.bb, x, z, 16) && (M.pointInPolygon(x, z, w.ring) || M.distToRing(x, z, w.ring) < 16)) return true;
    for (const l of lines) if (M.inBBox(l.bb, x, z, l.half) && M.distToPolyline(x, z, l.pl) < l.half) return true;
    for (const l of roads) if (l.id !== ownRoad && M.inBBox(l.bb, x, z, l.half) && M.distToPolyline(x, z, l.pl) < l.half) return true;
    if (inReserved(x, z, 6)) return true;
    for (const r of innerRings) if (M.inBBox(r.bb, x, z, 45) && (M.pointInPolygon(x, z, r.ring) || M.distToRing(x, z, r.ring) < 45)) return true;
    return false;
  }
  const inOuter = (x, z) => M.inBBox(outerBB, x, z) && M.pointInPolygon(x, z, outerRing);
  const allowFor = (zone, ownRoad) => (lot) => {
    const c = G.centroid(lot.p);
    if (zone === 'outerCity') { const d = W.districtAt(c[0], c[1]); if (!d || d.kind !== 'outerCity') return false; }
    for (const q of [c, ...lot.p]) {
      if (blocked(q[0], q[1], ownRoad)) return false;
      if (zone === 'outerCity' ? !inOuter(q[0], q[1]) : inOuter(q[0], q[1])) return false;
    }
    // (pulled in a little: plots of one block share their party lines)
    return !onLane(lot.p) && !overlapsHouse(lot.p.map((q) => [c[0] + (q[0] - c[0]) * 0.97, c[1] + (q[1] - c[1]) * 0.97]));
  };

  // lanes and alleys of the patches already built: later patches keep clear of them
  const lanes = streets.filter((s) => s.cls === 'road').map((s) => ({ pl: s.polyline, half: s.width / 2, bb: s.bb }));
  const noteLanes = (from) => { for (let i = from; i < streets.length; i++) { const s = streets[i]; if (s.cls === 'road') continue; lanes.push({ pl: s.polyline, half: s.width / 2, bb: s.bb }); } };
  const nRoads = lanes.length;
  const onLane = (pts, lanesOnly = false) => {
    const bb = G.bbox(pts);
    for (let q = lanesOnly ? nRoads : 0; q < lanes.length; q++) {
      const l = lanes[q];
      if (!G.bbOverlap(l.bb, bb, l.half)) continue;
      for (let i = 0; i + 1 < l.pl.length; i++) {
        const a = l.pl[i], b = l.pl[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.5) continue;
        const nx = -(b[1] - a[1]) / len * (l.half - 0.2), nz = (b[0] - a[0]) / len * (l.half - 0.2);
        if (G.overlaps(pts, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]])) return true;
      }
    }
    return false;
  };

  // ---- a patch of blocks beside a road ---------------------------------------------------------------
  function patch(spine, side, sa, sb, depth, o, level = 0) {
    const sub = [];
    const pa = M.pointAlong(spine.polyline, sa), pb = M.pointAlong(spine.polyline, sb);
    sub.push([pa.x, pa.z]);
    for (let k = 1; k + 1 < spine.polyline.length; k++) if (spine.ch[k] > sa + 4 && spine.ch[k] < sb - 4) sub.push(spine.polyline[k]);
    sub.push([pb.x, pb.z]);
    const hw = spine.width / 2 + 0.3;
    const inner = M.offsetPolyline(sub, side * hw), outerR = M.offsetPolyline(sub, side * (hw + depth));
    const poly = G.make([...inner, ...outerR.reverse()], null);
    if (poly.p.length < 4 || G.area(poly.p) < 300) return;
    // ground that an earlier patch has built on: try the two halves, then give up
    if (overlapsHouse(poly.p) || onLane(poly.p, true) || onReserved(poly.p)) {
      if (level < 3 && sb - sa > 70) { const m = (sa + sb) / 2; patch(spine, side, sa, m - 4, depth, o, level + 1); patch(spine, side, m + 4, sb, depth, o, level + 1); }
      else if (level < 5 && depth > 34) patch(spine, side, sa, sb, depth * 0.55, o, level + 1);
      return;
    }
    const n0 = streets.length;
    const roadTag = { k: 'street', st: spine, hw: 0, line: { junctions: [], rec: spine } };
    poly.t = poly.p.map((a, i) => { const b = poly.p[(i + 1) % poly.p.length]; return M.distToPolyline(a[0], a[1], inner) < 0.5 && M.distToPolyline(b[0], b[1], inner) < 0.5 ? roadTag : EDGE; });
    const cells = [];
    net.gridSplit(net.region(poly, [], 1), 0, cells, { prm: o.prm, minor: true });
    for (const cell of cells) {
      const b = G.inset(cell, (t) => (t ? t.hw : 0));
      if (!b || G.area(b.p) < 60) continue;
      buildBlock(G.simplify(b), { prm: o.prm, enclosure: o.enclosure ?? null, district: o.district ?? null, village: o.village ?? null, allow: o.allow, limit: o.limit, openBlock: o.openBlock });
    }
    noteLanes(n0);
  }
  function ribbon(spine, o) {
    if (!spine.ch) spine.ch = M.chainage(spine.polyline);
    const end = Math.min(o.s1, spine.length);
    for (const side of [1, -1]) {
      let s = o.s0 + rng.range(0, 20);
      while (s < end - 30) {
        const len = Math.min(rng.range(o.seg[0], o.seg[1]), end - s);
        const cov = typeof o.cover === 'function' ? o.cover(s + len / 2) : o.cover;
        if (len > 28 && rng.next() < cov) patch(spine, side, s, s + len, rng.range(o.depth[0], o.depth[1]), o);
        s += len + rng.range(o.gap[0], o.gap[1]);
      }
    }
  }
  /** Chainage ranges of a road that lie inside (or outside) the outer city. */
  function ranges(spine, inside) {
    if (!spine.ch) spine.ch = M.chainage(spine.polyline);
    const out = []; let start = null;
    for (let s = 0; s <= spine.length; s += 20) {
      const p = M.pointAlong(spine.polyline, s), enc = W.enclosureAt(p.x, p.z);
      const ok = inside ? enc === 'outerCity' : enc === null;
      if (ok && start === null) start = s;
      if (!ok && start !== null) { out.push([start, s]); start = null; }
    }
    if (start !== null) out.push([start, spine.length]);
    return out;
  }

  // ---- outer city: suburbs along the gate roads ---------------------------------------------------------
  const outerPrm = (name) => { const d = W.district(name), c = M.polygonCentroid(d.polygon); return paramsAt(c[0], c[1]); };
  const suburb = (id, depth, cover, extra = {}) => {
    const sp = streetById.get(id); if (!sp) return;
    for (const [a, b] of ranges(sp, true)) {
      // the parameters of the district the stretch lies in
      const p = M.pointAlong(sp.polyline, (a + b) / 2), d = W.districtAt(p.x, p.z);
      const prm = d && d.kind === 'outerCity' ? outerPrm(d.name) : outerPrm('Outer city east');
      ribbon(sp, { s0: a + (extra.skip || 0), s1: b - 30, depth, seg: [150, 380], gap: [18, 70], cover, prm, enclosure: 'outerCity', district: prm.name, allow: allowFor('outerCity', id), ...extra });
      roads = roadLines();
    }
  };
  suburb('northRoad', [120, 185], 0.95, { gap: [14, 50] });
  suburb('road:north suburb road', [70, 120], 0.75);
  suburb('road:Shuhi Gate road', [60, 100], 0.8);
  suburb('road:Marduk Gate suburb road', [110, 175], 0.95, { gap: [14, 50] });
  suburb('road:Kish road', [110, 175], 0.95, { gap: [14, 50] });
  suburb('road:east moat road', [70, 120], 0.8);
  suburb('road:Dilbat road', [80, 130], 0.9);
  suburb('road:south moat road', [60, 110], 0.7, { seg: [90, 220], gap: [30, 120] });

  // ---- estates: a walled garden with a house in one corner, scattered between the ribbons --------------------
  for (const d of world.districts) {
    if (d.kind !== 'outerCity') continue;
    const bb = M.bbox(d.polygon), prm = outerPrm(d.name), pitch = 86, er = rng.fork('estates:' + d.name);
    for (let z = bb[1]; z < bb[3]; z += pitch) for (let x = bb[0]; x < bb[2]; x += pitch) {
      const cx = x + er.range(0.1, 0.9) * pitch, cz = z + er.range(0.1, 0.9) * pitch, pick = er.next(), w = er.range(34, 70), dp = er.range(30, 60), rot = (er.next() < 0.5 ? 0 : 90) + er.gauss() * 7;
      const hw = er.range(11, 22), hd = er.range(11, 20), corner = er.int(0, 3), white = er.next() < 0.25;
      if (pick > 0.55 || !M.pointInPolygon(cx, cz, d.polygon)) continue;
      const plot = M.openRing(M.rectRing(cx, cz, w, dp, rot));
      if (plot.some((q) => blocked(q[0], q[1], null) || !inOuter(q[0], q[1])) || blocked(cx, cz, null) || onLane(plot) || housesNearRaw(cx, cz, 0.75 * Math.hypot(w, dp) + 26)) continue;
      // the house: a rectangle in one corner of the plot, its two inner sides open to the garden
      const sx = corner & 1 ? 1 : -1, sz = corner & 2 ? 1 : -1;
      const hc = M.localToWorld([cx, cz], rot, sx * (w - hw) / 2, sz * (dp - hd) / 2);
      const hr = G.make(M.rectRing(hc[0], hc[1], hw, hd, rot), null);
      hr.t = hr.p.map((a, i) => { const b = hr.p[(i + 1) % hr.p.length], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; return M.distToRing(mx, mz, plot) < 0.3 ? EDGE : OPEN; });
      const h = addHouse(hr, { prm: { ...prm, sawToothShare: 0.3, whitewashShare: white ? 1 : 0 }, blockId: null, district: d.name, enclosure: 'outerCity' });
      h.estate = true;
      for (const piece of G.difference(G.make(plot, null), G.hull(hr.p), null, null)) if (G.area(piece.p) > 20) addOpen(piece, 'garden', 'estate', { district: d.name });
    }
  }
  const nOuter = houses.length;

  // ---- ribbons along the roads beyond the walls ------------------------------------------------------------
  roads = roadLines();
  for (const sp of streets.filter((s) => s.cls === 'road')) {
    for (const [a, b] of ranges(sp, false)) {
      if (b - a < 80) continue;
      ribbon(sp, { s0: a + 12, s1: Math.min(b, a + 4200), depth: [18, 62], seg: [60, 230], gap: [24, 200], cover: (s) => 0.74 * Math.exp(-(s - a) / 2100), prm: RURAL, enclosure: null, district: null, allow: allowFor('country', sp.id), openBlock: 0 });
    }
  }

  // ---- villages ------------------------------------------------------------------------------------------------
  world.environs.villages.items.forEach((v, vi) => {
    let dir = null, cx = v.x, cz = v.z, best = Infinity;
    for (const s of streets) {
      if (s.cls !== 'road' || !M.inBBox(s.bb, cx, cz, 1500)) continue;
      const hit = M.nearestOnPolyline(cx, cz, s.polyline);
      if (hit.dist < best) { best = hit.dist; dir = hit.dir; if (hit.dist < 30) { const k = (30 - hit.dist) * hit.side; cx += -hit.dir[1] * k; cz += hit.dir[0] * k; } }
    }
    for (const c of world.canals) {
      if (!M.inBBox(M.bbox(c.polyline), cx, cz, 1500)) continue;
      const hit = M.nearestOnPolyline(cx, cz, c.polyline);
      if (hit.dist < best) { best = hit.dist; dir = hit.dir; }
      const clear = (c.width || 10) / 2 + 34;
      if (hit.dist < clear) { const k = (clear - hit.dist) * hit.side; cx += -hit.dir[1] * k; cz += hit.dir[0] * k; }
    }
    if (!dir || best > 1500) { const a = hash2deg(vi) * M.DEG; dir = [Math.cos(a), Math.sin(a)]; }
    const half = Math.max(26, Math.min(120, v.houses * 3.3)), bend = (rng.next() - 0.5) * 0.12 * half;
    const lanePl = () => [[cx - dir[0] * half, cz - dir[1] * half], [cx - dir[1] * bend, cz + dir[0] * bend], [cx + dir[0] * half, cz + dir[1] * half]];
    const laneBox = () => { const q = lanePl(), nx = -dir[1] * 27, nz = dir[0] * 27; return [[q[0][0] + nx, q[0][1] + nz], [q[2][0] + nx, q[2][1] + nz], [q[2][0] - nx, q[2][1] - nz], [q[0][0] - nx, q[0][1] - nz]]; };
    const c0 = [cx, cz];
    for (const [da, dn] of [[0, 0], [0, 70], [0, -70], [0, 130], [0, -130], [170, 60], [-170, 60], [170, -60], [-170, -60], [0, 200], [0, -200]]) {
      cx = c0[0] + dir[0] * da - dir[1] * dn; cz = c0[1] + dir[1] * da + dir[0] * dn;
      if (!overlapsHouse(laneBox()) && !onLane(laneBox(), true) && !blocked(cx, cz, null)) break;
    }
    const pl = lanePl();
    const lane = addStreet({ id: 'village:' + vi, name: 'village lane', cls: 'lane', polyline: pl, width: 3.4, src: 'generated', conjectural: true, level: 1 });
    lane.ch = M.chainage(pl);
    const village = { id: vi, x: v.x, z: v.z, houses: [], dir, lane: lane.id, center: [cx, cz] };
    const limit = { n: v.houses }, before = houses.length;
    const o = { prm: RURAL, enclosure: null, district: null, village: vi, allow: allowFor('country', lane.id), limit, openBlock: 0 };
    for (const side of rng.next() < 0.5 ? [1, -1] : [-1, 1]) patch(lane, side, 0, lane.length, rng.range(15, 25), o);
    for (let i = before; i < houses.length; i++) village.houses.push(houses[i].id);
    villages.push(village);
    noteLanes(streets.indexOf(lane));
  });
  function hash2deg(i) { return ((i * 2654435761) >>> 0) / 4294967296 * 180; }

  return { outerHouses: nOuter };
}
