// js/modules/southpalace/enclosure.js — the enclosure wall of the South Palace: the oblique quadrilateral of
// world.json (259 / 190 / 308 / 127 m), bare baked brick, wall-walk behind a parapet with stepped merlons, 60 slim
// towers at 10.4 m centres on the south, the east and the eastern half of the north side (SPEC 3.8, R4 3.3), with
// the vertical rain shafts in their fronts (Koldewey ch. XVII) drawn as two grooves. The inner faces are made by
// the lattice (saw-toothed against the cardinal rooms); the wall-walk is the polygon between the two.

export function buildEnclosure(env, { near, far, extra, interior }) {
  const { ctx, geom, ground, materials, M, d, F, WT, TT, WW, ring, plan, W2L, L2W, hash2, NEAR } = env;
  const PT = 0.6, MER = { pitch: 1.25, width: 0.75, height: 0.9, thickness: 0.5 }, id = env.BRICK;
  const inner = geom.insetRing(ring, PT), w = near.brick, wf = far.brick, tintW = [0.98, 0.975, 0.96];
  const qw = (wr, a, b, c, e, n) => {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = e[0] - b[0], vy = e[1] - b[1], vz = e[2] - b[2];
    return ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2]) >= 0 ? wr.quadP(a, b, c, e) : wr.quadP(a, e, c, b);
  };
  const names = ['N', 'E', 'S', 'W'], bySide = { N: 0, E: 0, S: 0, W: 0 }, spacing = [];
  let towers = 0, merlons = 0, sample = null, torches = 0;
  const merlonRow = (line, y, opt = MER) => { geom.addMerlons(id, line, { y, ...opt, far: NEAR, instanced: true }); merlons += Math.floor(M.polylineLength(line) / opt.pitch); };

  // the main gate interrupts the east curtain: where the wall line crosses the two flanks of the gatehouse
  const G = plan.gate, e1 = ring[1], e2 = ring[2], z0 = W2L(e1[0], e1[1])[1], z1 = W2L(e2[0], e2[1])[1], lenE = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);
  const gap = [(lenE * (G.z - 9.5 - z0)) / (z1 - z0), (lenE * (G.z + 9.5 - z0)) / (z1 - z0)];

  for (let e = 0; e < 4; e++) {
    const p = ring[e], q = ring[(e + 1) % 4], pi = inner[e], qi = inner[(e + 1) % 4];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len, ox = dz, oz = -dx;      // (ox, oz): outward
    const at = (s, off = 0) => [p[0] + dx * s + ox * off, p[1] + dz * s + oz * off], ati = (s) => [pi[0] + ((qi[0] - pi[0]) * s) / len, pi[1] + ((qi[1] - pi[1]) * s) / len];
    const groundAt = (s) => { const c = at(s, 1.5); return ground.height(c[0], c[1]); };
    const pieces = (fn) => { const n = Math.round(len / 5.2); for (let k = 0; k < n; k++) { let a = (k * len) / n, b = ((k + 1) * len) / n; if (e === 1) { if (a >= gap[0] && b <= gap[1]) continue; if (a < gap[0] && b > gap[0]) b = gap[0]; if (a < gap[1] && b > gap[1]) a = gap[1]; } fn(a, b); } };
    // curtain: outer face from below the ground to the parapet top, parapet, in pieces of 5 m
    w.color(tintW);
    pieces((sa, sb) => {
      const A = at(sa), Bq = at(sb), Ai = ati(sa), Bi = ati(sb), yg = groundAt((sa + sb) / 2), base = Math.min(yg, F) - 1.5, rows = yg + 2.6 < WT - 1.5 ? [base, yg + 2.6, WT] : [base, WT];
      for (let r = 0; r < rows.length - 1; r++) qw(w, [A[0], rows[r], A[1]], [Bq[0], rows[r], Bq[1]], [Bq[0], rows[r + 1], Bq[1]], [A[0], rows[r + 1], A[1]], [ox, 0, oz]);
      qw(w, [Ai[0], WW, Ai[1]], [Bi[0], WW, Bi[1]], [Bi[0], WT, Bi[1]], [Ai[0], WT, Ai[1]], [-ox, 0, -oz]);
      qw(w, [A[0], WT, A[1]], [Bq[0], WT, Bq[1]], [Bi[0], WT, Bi[1]], [Ai[0], WT, Ai[1]], [0, 1, 0]);
    });
    wf.color(tintW);
    { const base = Math.min(groundAt(len / 2), F) - 3; qw(wf, [p[0], base, p[1]], [q[0], base, q[1]], [q[0], WT, q[1]], [p[0], WT, p[1]], [ox, 0, oz]); }
    // merlons on the curtain
    if (e === 1) { merlonRow([at(0, -0.3), at(gap[0], -0.3)], WT); merlonRow([at(gap[1], -0.3), at(len, -0.3)], WT); } else merlonRow([at(0, -0.3), at(len, -0.3)], WT);

    // towers
    const tower = (s, corner, k) => {
      const wT = corner ? 7.5 : d.wall.towerWidth, h = hash2(e, k, 61), proj = corner ? 2.0 : h < 0.4 ? 0.35 : h < 0.75 ? 0.7 : 1.3, back = corner ? 5.5 : 3.2;
      const c = at(corner ? s + corner * (wT / 2 - 2.0) : s), P = (along, off) => [c[0] + dx * along + ox * off, c[1] + dz * along + oz * off];
      const tr = [P(-wT / 2, proj), P(wT / 2, proj), P(wT / 2, -back), P(-wT / 2, -back)], f = P(0, proj + 1), yg = ground.height(f[0], f[1]), base = Math.min(yg, F) - 1.5, plat = TT - 0.9;
      const body = geom.nichedPrism(tr, base, plat, { bay: wT, nicheWidth: 0, nicheDepth: 0, grooves: { count: 2, width: 0.28, depth: 0.22, gap: wT * 0.36 }, edges: [0], socle: yg - base + 3.2, frieze: 1.3, top: false });
      const t = 0.95 + 0.08 * hash2(e, k, 62);
      if (!sample) sample = geom.merge([geom.nichedPrism(tr, base, plat, { bay: wT, nicheWidth: 0, nicheDepth: 0, grooves: { count: 2, width: 0.28, depth: 0.22, gap: wT * 0.36 }, edges: [0], socle: yg - base + 3.2, frieze: 1.3, top: false }), geom.parapetBlock(tr, { base: plat, top: plat, parapet: 0.9, thickness: 0.45 })]);
      extra.brick.push(geom.paint(geom.merge([body, geom.parapetBlock(tr, { base: plat, top: plat, parapet: 0.9, thickness: 0.45 })]), [t, t, t * 0.985]));
      extra.farBrick.push(geom.prism(tr, base, TT));
      merlonRow(geom.kit.towerMerlonLine(tr, 0.25), TT, { ...MER, pitch: 1.2, width: 0.72 });
      if (towers % 6 === 2) { const c0 = P(0, -back / 2 + proj / 2); ctx.emitters.add({ kind: 'torch', pos: [c0[0], plat + 1.7, c0[1]], size: 1 }); torches++; }      // a watch fire on every sixth tower
      towers++; bySide[names[e]]++;
    };
    if (e === 2) { const n = 29; spacing[0] = len / n; for (let k = 0; k <= n; k++) tower((k * len) / n, k === 0 ? 1 : k === n ? -1 : 0, k); }
    if (e === 1) { const n = 18; spacing[1] = len / n; for (let k = 1; k < n; k++) { const s = (k * len) / n; if (s > gap[0] - 3.4 && s < gap[1] + 3.4) continue; tower(s, 0, k); } }
    if (e === 0) { const sp = d.wall.towerSpacingCC; spacing[2] = sp; for (let k = 0; k <= 12; k++) tower(len - k * sp, k === 0 ? -1 : 0, k); }
    // the sides without towers keep the rhythm as flat pilasters, 0.4 m proud, below the parapet (R4 12.7)
    const pil = (s) => { const c = at(s, 0.2), base = Math.min(groundAt(s), F) - 1.5; extra.brick.push(geom.box({ x: c[0], z: c[1], y0: base, y1: WT - 0.5, sx: d.wall.towerWidth, sz: 0.4, rotDeg: Math.atan2(dz, dx) * M.RAD })); };
    if (e === 3) for (let s = 10.4; s < len - 5; s += 10.4) pil(s);
    if (e === 0) for (let s = len - 13 * d.wall.towerSpacingCC; s > 6; s -= 10.4) pil(s);
    // footings: the south wall stands 20 m above the canal bank on a projecting footing; a low kerb along the street
    if (e === 2) { const low = groundAt(len / 2); extra.brick.push(geom.wall([at(2), at(len)], { thickness: 1.3, offset: -0.65, step: 5.3, stepped: true, base: low - 1.5, top: (x, z) => Math.max(low + 3.6, ground.height(x + ox * 1.6, z + oz * 1.6) + 1.1, ground.height(x + ox * 3.2, z + oz * 3.2) + 0.6) })); }
    if (e === 1) for (const [a, b] of [[4, gap[0] - 6], [gap[1] + 6, len - 4]]) extra.brick.push(geom.wall([at(a), at(b)], { thickness: 0.5, offset: -0.25, step: 5.2, base: (x, z) => ground.height(x + ox * 1.2, z + oz * 1.2) - 1.5, top: (x, z) => ground.height(x + ox * 1.2, z + oz * 1.2) + 0.9 }));
  }
  // the gatehouse towers count as two of the sixty
  towers += 2; bySide.E += 2;

  // the wall-walk: between the parapet and the stepped inner faces
  const flat = [], holes = [];
  for (const p of inner) flat.push(p[0], p[1]);
  for (const loop of interior) { holes.push(flat.length / 2); for (const p of loop) flat.push(p[0], p[1]); }
  w.color([0.93, 0.92, 0.9]); w.polygon(flat, holes, WW, true);
  wf.color([0.93, 0.92, 0.9]); wf.polygon(flat, holes, WT - 0.5, true);

  // merlons of the monumental blocks inside: throne room, gate buildings, gatehouse (bare buff brick like the wall)
  const crown = (b, inset = 0.25) => { if (!b || !b.alive) return; const r = [[b.x0 + inset, b.z0 + inset], [b.x1 - inset, b.z0 + inset], [b.x1 - inset, b.z1 - inset], [b.x0 + inset, b.z1 - inset]].map(([x, z]) => L2W(x, z)); merlonRow([...r, r[0]], b.level + b.par); };
  crown(plan.halls.throne);
  for (const g of [plan.gate1, plan.gate2, plan.gate]) { crown(g.body); for (const t of g.towers) crown(t); }
  // ---- outside the wall: the retaining wall of the garden strip on the west (SPEC 3.8), the brick lining of the Libil-hegalla (SPEC 3.3)
  const out = outworks();
  return { towers, bySide, spacing, merlons, merlonHeight: MER.height, sample, torches, ...out, coverSpurs };

  /**
   * The drawn terrain has spurs that stand up to 2 m out of the platform edge and up to 7 m above the ground
   * (measured on the south side near both corners; reported). They are hidden behind brick buttresses. The spurs are
   * found on the terrain's own tile meshes, which exist only after every module has built: index.js calls this once,
   * from its first update(), and gets one mesh for the module's group (or null).
   */
  function coverSpurs() {
    const THREE = ctx.THREE, bb = M.bbox(ring), hits = [[], [], [], []], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    const E = ring.map((p, e) => { const q = ring[(e + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]), dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len; return { p, len, dx, dz, ox: dz, oz: -dx }; });
    const far = (v) => v.x < bb[0] - 6 || v.x > bb[2] + 6 || v.z < bb[1] - 6 || v.z > bb[3] + 6;
    const test = (v) => { for (let e = 0; e < 4; e++) { const q = E[e], off = (v.x - q.p[0]) * q.ox + (v.z - q.p[1]) * q.oz, along = (v.x - q.p[0]) * q.dx + (v.z - q.p[1]) * q.dz; if (off > 0.2 && off < 5 && along > 0.5 && along < q.len - 0.5 && v.y > ground.height(v.x, v.z) + 0.9) hits[e].push([along, off, v.y]); } };
    ctx.geom.root.traverse((o) => {
      if (!o.isMesh || !/terrain/.test(o.name || '') || !o.geometry || !o.geometry.index) return;
      o.updateWorldMatrix(true, false);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const gb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (gb.max.x < bb[0] - 6 || gb.min.x > bb[2] + 6 || gb.max.z < bb[1] - 6 || gb.min.z > bb[3] + 6) return;
      const P = o.geometry.attributes.position, I = o.geometry.index;
      for (let t = 0; t < I.count; t += 3) {
        a.fromBufferAttribute(P, I.getX(t)).applyMatrix4(o.matrixWorld);
        if (far(a)) continue;
        b.fromBufferAttribute(P, I.getX(t + 1)).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(P, I.getX(t + 2)).applyMatrix4(o.matrixWorld);
        if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) < 0.9) continue;                // only steep triangles can stand out of a wall
        for (const [u, v, w] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.34, 0.33, 0.33], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]) { m.set(a.x * u + b.x * v + c.x * w, a.y * u + b.y * v + c.y * w, a.z * u + b.z * v + c.z * w); test(m); }
      }
    });
    const boxes = [];
    for (let e = 0; e < 4; e++) {
      const q = E[e], list = hits[e].sort((x, y) => x[0] - y[0]);
      for (let i = 0; i < list.length;) {
        let j = i, s1 = list[i][0], off = 0, top = -Infinity;
        while (j < list.length && list[j][0] - s1 < 4.5) { s1 = list[j][0]; off = Math.max(off, list[j][1]); top = Math.max(top, list[j][2]); j++; }
        const s0 = list[i][0], proud = Math.min(4.2, off + 0.8), mid = (s0 + s1) / 2, cx = q.p[0] + q.dx * mid + (q.ox * proud) / 2, cz = q.p[1] + q.dz * mid + (q.oz * proud) / 2;
        const low = ground.height(q.p[0] + q.dx * mid + q.ox * (proud + 1), q.p[1] + q.dz * mid + q.oz * (proud + 1));
        if (e !== 1 || mid < gap[0] - 8 || mid > gap[1] + 8) boxes.push(geom.box({ x: cx, z: cz, y0: Math.min(low, F) - 1.5, y1: Math.min(WT - 2, top + 0.7), sx: s1 - s0 + 3, sz: proud, rotDeg: Math.atan2(q.dz, q.dx) * M.RAD }));
        i = j;
      }
    }
    if (!boxes.length) return null;
    const mesh = new THREE.Mesh(geom.ensureAttributes(geom.merge(boxes)), materials.get(id));
    mesh.name = 'southpalace:terrain-spur-buttresses'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.count = boxes.length;
    return mesh;
  }

  function outworks() {
    const res = { gardenWall: 0, canalLining: 0 };
    const gp = ground.platforms.find((p) => p.id === 'southPalace:gardenStripWest');
    if (gp) {
      // its east side is the palace wall, its north side the lane of the city wall (higher): the west and south sides retain 6 to 8 m
      const g = M.openRing(gp.polygon), cw = M.polygonArea(g) > 0, n = g.length;
      const shared = (a, b) => ring.some((p, i) => { const q = ring[(i + 1) % 4]; return M.distToSegment(a[0], a[1], p[0], p[1], q[0], q[1]) < 0.5 && M.distToSegment(b[0], b[1], p[0], p[1], q[0], q[1]) < 0.5; });
      const low = (a, b) => { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), ox = (cw ? dz : -dz) / l, oz = (cw ? -dx : dx) / l; return ground.height(mx + ox * 3, mz + oz * 3); };
      for (let i = 0; i < n; i++) {
        const a = g[i], b = g[(i + 1) % n], outside = low(a, b);
        if (shared(a, b) || outside > gp.level - 0.5) continue;
        extra.brick.push(geom.paint(geom.wall([a, b], { thickness: 1.3, offset: (cw ? 1 : -1) * 0.65, base: Math.min(outside, ground.height(a[0], a[1])) - 1.2, top: gp.level + 1.0 }), [0.95, 0.94, 0.92]));
        extra.farBrick.push(geom.wall([a, b], { thickness: 1.3, offset: (cw ? 1 : -1) * 0.65, base: outside - 2, top: gp.level + 1.0 }));
        res.gardenWall += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      // a bastion on each free corner of the terrace (it also hides the corner of the terrain's terrace step)
      for (let i = 0; i < n; i++) {
        const p = g[i], a = g[(i + n - 1) % n], b = g[(i + 1) % n];
        if (ring.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1) || shared(a, p) || shared(p, b) || low(a, p) > gp.level - 0.5 || low(p, b) > gp.level - 0.5) continue;
        const rotDeg = Math.atan2(b[1] - p[1], b[0] - p[0]) * M.RAD, base = Math.min(low(a, p), low(p, b)) - 1.5;
        extra.brick.push(geom.paint(geom.parapetBlock(M.rectRing(p[0], p[1], 10, 10, rotDeg), { base, top: gp.level + 0.6, parapet: 0.9, thickness: 0.5 }), [0.95, 0.94, 0.92]));
        extra.farBrick.push(geom.box({ x: p[0], z: p[1], y0: base, y1: gp.level + 1.5, sx: 10, sz: 10, rotDeg }));
      }
    }
    const quay = materials.preset('quayBrick');
    for (const e of ground.hardEdges) {
      if (!/^canal:libilHegalla/.test(e.id)) continue;
      const pl = M.resamplePolyline(e.polyline, 6), tops = pl.map((p, i) => { const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / l) * e.land, nz = ((b[0] - a[0]) / l) * e.land; return ground.height(p[0] + nx * 2.6, p[1] + nz * 2.6) + 0.3; });
      geom.addStatic(quay, geom.wall(pl, { thickness: 1.5, offset: e.land * 0.75, base: e.foot - 0.6, top: tops }), { reflect: true, lod: [0, NEAR] });
      res.canalLining += M.polylineLength(e.polyline);
    }
    // (the head walls of the culvert under the Processional Way at the east end of the lined stretch are built by `streets`)
    res.gardenWall = Math.round(res.gardenWall); res.canalLining = Math.round(res.canalLining);
    return res;
  }
}
