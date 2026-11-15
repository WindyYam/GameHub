// js/modules/environs/index.js — world module "environs" (SPEC 3.16, ENGINE.md section 4): the OBJECTS of the
// outer city and the countryside. The terrain module has coloured the ground (strips, ditches, roads, kiln yards);
// this module stands the worked land on it:
//   roads (claim 'roads')   raised earth roads with wheel tracks, timber bridges on brick abutments and boat-shaped
//                           piers where a road crosses a cut canal
//   water works             branch canals and field ditches with spoil banks and standing water, a brick sluice with
//                           a timber gate at every take-off, culvert heads at the roads, palm-trunk footbridges,
//                           shadufs on canal, river and moat banks
//   fields                  bunds between the strips, stooks on reaped strips, reapers' shade shelters, threshing
//                           floors with sheaves, sledge, grain heap, chaff and straw stacks, flocks on the stubble
//   gardens                 mud walls round palm-garden and vegetable strips with gates, watchmen's reed huts,
//                           drying floors, the walled enclosures of the estates of the outer city, rubbish mounds
//   brickfields             the eight kiln yards: clay pits with spoil rims, rows of drying bricks, hacks, moulders'
//                           shelters, scove kilns in four states, fuel and ash; smoke and night glow as emitters
//   villages                pens, reed huts, straw / grain / dung stacks behind the houses (houses: `houses`)
//   far landmarks           the temple towers of Borsippa and Kish as faint silhouettes on the horizon (SPEC 3.16)
//   traffic                 ox carts and donkey strings on the roads, each with a dust emitter
// Where things go is decided by what the film sees (util.makeSeen): detail is spent where a frame shows it.
// Files: util.js (primitives, importance), land.js (linear works), sites.js (places). Notes: docs/mod-environs.md.
import { M, hash2, mix3, mul3, quad1, triC, obox, beam, lathe, wallLine, makeSeen } from './util.js';
import { buildRoads, buildBranches, buildDitches, buildBunds, buildGardenWalls, buildEstates } from './land.js';
import { chooseSites, floorRing, buildKilns, buildFloors, buildVillageYards, buildGardenHuts, buildShadufs, buildStooks, buildFlocks, buildFieldShelters, buildRubbish } from './sites.js';

export default {
  name: 'environs',
  claims: ['roads'],

  /** Reservations: threshing floors (so that no palm, tree or reed is planted on the beaten earth). */
  prepare(ctx) {
    const seen = makeSeen(ctx), sites = chooseSites(ctx, seen);
    for (const f of sites.floors) ctx.layout.reserve(floorRing(f), { owner: 'environs', kind: 'threshingFloor', margin: 0 });
    ctx.module.state = { seen, sites };
  },

  async build(ctx) {
    const { geom, ground: g, materials, layout: L, THREE } = ctx;
    const st = ctx.module.state || { seen: makeSeen(ctx), sites: { floors: [] } };
    const draft = !!ctx.quality.draft;

    // ---- colours: albedo of every palette id as linear [r, g, b] (vertex colours of white variants) ----------
    const C = {};
    for (const id of materials.ids) { const k = materials.color(id); C[id] = [k.r, k.g, k.b]; }

    // ---- one white material per family; tones go into the vertex colours ---------------------------------------
    const mats = {
      earth: materials.variant('streetEarth', { name: 'environs-earth', color: 0xffffff }),
      flat: materials.variant('streetEarth', { name: 'environs-earth-flat', color: 0xffffff, polygonOffset: 1 }),
      wall: materials.preset('houseWalls'),
      reed: materials.variant('reedMat', { name: 'environs-reed', color: 0xffffff }),
      brick: materials.variant('bakedBrickBuff', { name: 'environs-brick', color: 0xffffff }),
      wood: materials.variant('palmWood', { name: 'environs-wood', color: 0xffffff }),
      water: materials.variant('canal', { name: 'environs-ditchwater', roughness: 0.06, polygonOffset: 1 }),
    };
    const mk = () => geom.writer({ color: true, verts: 4096 });
    const W = { earth: mk(), flat: mk(), wall: mk(), reed: mk(), brick: mk(), wood: mk(), water: mk() };   // always drawn, 4096 m tiles
    const N = { wall: mk(), reed: mk(), brick: mk(), wood: mk() };                                       // add-on detail near the low flights

    const E = {
      ctx, g, L, C, W, N, mats, seen: st.seen.seen, path: st.seen.path,
      /** draft tier: keep about a third of the mass items */
      thin: (h) => draft && h > 0.3,
    };

    // ---- strips the film sees: one pass over the 64,000 records ---------------------------------------------
    const strips = [];
    for (let k = 1; k < g.fields.strips.length; k++) {
      const s = g.fields.strips[k], r = s.ring, cx = (r[0][0] + r[1][0] + r[2][0] + r[3][0]) / 4, cz = (r[0][1] + r[1][1] + r[2][1] + r[3][1]) / 4, sd = E.seen(cx, cz);
      if (sd > 3400) continue;
      strips.push({ id: s.id, ring: r, use: s.use, tone: s.tone, dir: s.dir, width: s.width, length: s.length, seed: s.seed, tier: s.tier, sd, cx, cz });
    }

    const roads = buildRoads(E);
    const branches = buildBranches(E);
    const ditches = buildDitches(E);
    const bunds = buildBunds(E, strips);
    const walls = buildGardenWalls(E, strips);
    const estates = buildEstates(E);
    const kilns = buildKilns(E);
    const floors = buildFloors(E, st.sites.floors);
    const yards = buildVillageYards(E);
    const huts = buildGardenHuts(E, walls.walled);
    const shadufs = buildShadufs(E);
    const stooks = buildStooks(E, strips);
    const flocks = buildFlocks(E, strips);
    const shelters = buildFieldShelters(E, strips);
    const rubbish = buildRubbish(E);
    const far = farLandmarks(E);
    const traffic = makeTraffic(E, roads, mats);

    // ---- submit ---------------------------------------------------------------------------------------------
    const base = { ao: false, occluder: false, tile: 4096 };
    const tri = {};
    const put = (key, w, opts) => { tri[key] = Math.round(w.triangleCount); if (w.triangleCount > 0) geom.addStatic(mats[key.split(':')[0]], w, opts); };
    put('earth', W.earth, { ...base });
    put('flat', W.flat, { ...base, castShadow: false });
    put('wall', W.wall, { ...base });
    put('reed', W.reed, { ...base });
    put('brick', W.brick, { ...base });
    put('wood', W.wood, { ...base });
    put('water', W.water, { ...base, castShadow: false });
    const near = { ao: false, occluder: false, lod: [0, 520], shadowTexel: 0.3 };
    put('wall:near', N.wall, near); put('reed:near', N.reed, near); put('brick:near', N.brick, near); put('wood:near', N.wood, near);

    // ---- checks ---------------------------------------------------------------------------------------------
    const checks = [];
    const total = Object.values(tri).reduce((a, b) => a + b, 0) + far.tris + traffic.tris + stooks.tris + flocks.tris;
    checks.push({ name: 'roads of class road drawn (of ' + roads.roads + ')', value: roads.roads, expect: '14 (7 of world.json, 7 suburb roads of the layout)', pass: roads.roads >= 13 });
    checks.push({ name: 'road surface built (km)', value: +(roads.metres / 1000).toFixed(1), expect: '>= 12 in final (where a frame sees it)', pass: roads.metres > (draft ? 6000 : 12000) });
    checks.push({ name: 'bridges where a road crosses a cut canal', value: roads.bridges.length, expect: '>= 4', pass: roads.bridges.length >= 4 });
    checks.push({ name: 'kiln yards / kilns / in fire', value: `${kilns.yards} / ${kilns.kilns.length} / ${kilns.firing}`, expect: '8 yards, 4 to 8 kilns each (SPEC 3.16)', pass: kilns.yards === 8 && kilns.kilns.length >= 32 && kilns.kilns.length <= 64 && kilns.firing >= 8 });
    const fl = floors.list.map((f) => 2 * f.radius);
    checks.push({ name: 'threshing floors: count, diameter range (m)', value: `${floors.floors}, ${fl.length ? Math.min(...fl).toFixed(0) : 0} to ${fl.length ? Math.max(...fl).toFixed(0) : 0}`, expect: '>= 20 floors, 15 to 30 m (R5 3.6)', pass: floors.floors >= 20 && Math.min(...fl) >= 14.9 && Math.max(...fl) <= 30 });
    let wet = 0; for (const f of floors.list) if (g.isWater(f.x, f.z)) wet++; for (const k of kilns.kilns) if (g.isWater(k.x, k.z)) wet++; for (const s of shadufs.list) if (g.isWater(s.x, s.z)) wet++;
    checks.push({ name: 'floors, kilns and shaduf footings standing in water', value: wet, expect: '0', pass: wet === 0 });
    const instancedTris = stooks.tris + flocks.tris + traffic.tris;
    checks.push({ name: 'triangles: static / instanced (stooks, sheep, traffic)', value: `${total - instancedTris} / ${instancedTris}`, expect: 'static <= 350,000 (share 0.3 M), instanced <= 120,000', pass: total - instancedTris <= (draft ? 400000 : 350000) && instancedTris <= 120000 });
    {
      // the primitives are closed shells facing outwards
      const w = geom.writer({ color: true }); obox(w, 0, 0, 0, 2, 1, 1.5, 0.8, 0.6, { bottom: true, batter: 0.1 });
      const r1 = geom.inspect(w.toGeometry());
      const w2 = geom.writer({ color: true }); wallLine(w2, [[0, 0, 0], [6, 0, 1], [11, 0, 5]], 0.5, 1.8, [1, 1, 1], [1, 1, 1]);
      const r2 = geom.inspect(w2.toGeometry());
      const w3 = geom.writer({ color: true }); lathe(w3, 0, 0, 0, [[2, -0.1], [1.4, 1], [0, 1.6]], 8, () => [1, 1, 1], {});
      const r3 = geom.inspect(w3.toGeometry());
      checks.push({ name: 'box / wall / heap primitives: open edge above the foot (m), flipped, inside out', value: `${r1.openAbove.toFixed(2)} ${r1.flipped} ${r1.inward} / ${r2.openAbove.toFixed(2)} ${r2.flipped} ${r2.inward} / ${r3.openAbove.toFixed(2)} ${r3.flipped} ${r3.inward}`, expect: '0 0 false each', pass: r1.openAbove < 0.01 && r2.openAbove < 0.01 && r3.openAbove < 0.01 && !r1.flipped && !r2.flipped && !r3.flipped && !r1.inward && !r2.inward && !r3.inward });
    }

    return {
      update: traffic.update,
      stats: {
        triangles: tri, total, stripsSeen: strips.length,
        roads: { count: roads.roads, km: +(roads.metres / 1000).toFixed(1), bridges: roads.bridges.length },
        branchCanals: { count: branches.branches, km: +(branches.metres / 1000).toFixed(1), sluices: branches.sluices.length, culverts: branches.culverts, footbridges: branches.footbridges || 0 },
        ditches: { lines: ditches.lines, km: +(ditches.metres / 1000).toFixed(1), wetKm: +(ditches.wet / 1000).toFixed(1) },
        bunds: bunds.bunds, gardenWalls: { gardens: walls.walls, km: +(walls.metres / 1000).toFixed(1), gates: walls.gates.length },
        estates: { polygons: estates.estates, km: +(estates.metres / 1000).toFixed(1), gates: estates.gates },
        kilns: { yards: kilns.yards, kilns: kilns.kilns.length, firing: kilns.firing, brickRows: kilns.rows, stacks: kilns.stacks },
        threshingFloors: floors.floors, watchFires: floors.fires, villages: yards.villages, pens: yards.pens.length, reedHuts: yards.huts + huts.huts, stacks: yards.stacks, dryingFloors: huts.yards,
        shadufs: shadufs.count, fieldShelters: shelters.shelters, rubbishMounds: rubbish.mounds, farLandmarks: far.list.map((q) => q.name), stooks: stooks.stooks, flocks: flocks.flocks.length, sheep: flocks.sheep, travellers: traffic.count,
        emitters: ctx.emitters.list.filter((e) => e.owner === 'environs').length,
      },
      checks,
      /** Optional conveniences for people / nightfx (they must work without it). */
      api: {
        threshingFloors: floors.list, kilns: kilns.kilns.map((k) => ({ x: k.x, y: k.y, z: k.z, height: k.H, state: ['firing', 'cooling', 'opened', 'stacking'][k.state], yard: k.yard })),
        pens: yards.pens, shadufs: shadufs.list.map((s) => ({ x: s.x, z: s.z })), bridges: roads.bridges, flocks: flocks.flocks, sluices: branches.sluices,
        travellers: traffic.list,
      },
    };
  },
};

// =========================================================================================================
// far landmarks (SPEC 3.16): Borsippa at model azimuth 220.8, 17.7 km: a tiny stepped bump; Kish: a speck
// =========================================================================================================
function farLandmarks(E) {
  const { ctx, g } = E, THREE = ctx.THREE, out = { list: [], tris: 0 };
  // At 17 km the air of the film (40 to 50 % at 2 km) leaves nothing of a tower, yet the SPEC wants Borsippa as a
  // tiny pale bump on the horizon. So the two towers are drawn in the colour of the haze in their own direction
  // (the lighting's bblHazeColor), a few per cent lighter on the faces turned to the sun and darker on the others:
  // a ghost of a silhouette in every light, never a lit building.
  for (const f of ctx.world.environs.farLandmarks || []) {
    if (/omit|not visible/i.test(f.look || '')) continue;
    const w = ctx.geom.writer({ color: true }), y = g.height(f.x, f.z), H = f.height, big = /Borsippa/.test(f.name), ux = Math.cos(15.5 * M.DEG), uz = Math.sin(15.5 * M.DEG), one = [1, 1, 1];
    const stages = big ? [[41, 0.26], [34, 0.5], [27, 0.66], [21, 0.8], [15, 0.92], [9, 1.0]] : [[26, 0.45], [18, 0.8], [10, 1.0]];
    let y0 = y;
    for (const [half, k] of stages) { obox(w, f.x, f.z, y0 - 0.5, y + H * k, half, half, ux, uz, { side: one, top: one, foot: one, batter: 0.02 }); y0 = y + H * k; }
    const mat = ctx.materials.register(new THREE.ShaderMaterial({
      name: 'environs-far-' + (big ? 'borsippa' : 'kish'),
      uniforms: { uTint: { value: big ? new THREE.Vector3(0.93, 0.945, 0.985) : new THREE.Vector3(0.95, 0.9, 0.87) } },
      vertexShader: `
        #include <bbl_world_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4( position, 1.0 );
          vBWorldPos = wp.xyz; vBWorldNormal = normalize( mat3( modelMatrix ) * normal );
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        #include <common>
        #include <bbl_world_pars_fragment>
        #include <bbl_aerial_pars_fragment>
        uniform vec3 uTint;
        void main() {
          vec3 haze = bblHazeColor( normalize( vBWorldPos - cameraPosition ) );
          float lit = 0.5 + 0.5 * dot( normalize( vBWorldNormal ), uBSunDir );
          gl_FragColor = vec4( haze * mix( uTint * 0.95, uTint * 1.06, lit ), 1.0 );
        }`,
    }), { owner: 'environs', aerial: true });
    const mesh = new THREE.Mesh(w.toGeometry(), mat);
    mesh.name = 'environs:far:' + f.name; mesh.castShadow = false; mesh.receiveShadow = false;
    ctx.module.group.add(mesh);
    out.tris += Math.round(w.triangleCount);
    out.list.push({ name: f.name, x: f.x, z: f.z, height: H });
  }
  return out;
}

/** A solid wheel standing in the local x-y plane at (cx, cy, cz): radius r, thickness t. */
function wheel(w, cx, cy, cz, r, t, col) {
  const n = 9, P = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * M.TAU; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    for (const s of [-1, 1]) triCw(w, [cx, cy, cz + s * t / 2], [a[0], a[1], cz + s * t / 2], [b[0], b[1], cz + s * t / 2], col, 0, 0, s);
    quad1(w, [a[0], a[1], cz - t / 2], [b[0], b[1], cz - t / 2], [b[0], b[1], cz + t / 2], [a[0], a[1], cz + t / 2], mul3(col, 0.8), (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy, 0);
  }
}
const triCw = (w, a, b, c, col, ox, oy, oz) => triC(w, a, b, c, col, col, col, ox, oy, oz);

// =========================================================================================================
// traffic: ox carts and donkey strings on the roads the day shots see, each with a dust emitter behind it
// =========================================================================================================
function makeTraffic(E, roads, mats) {
  const { ctx, g, C } = E, geom = ctx.geom, list = [];
  // candidates: stretches of built road that a daylight frame sees from less than 2.6 km
  const cand = [];
  for (const ln of roads.lines) {
    const len = M.polylineLength(ln.pts); if (len < 160) continue;
    for (let s = 60; s < len - 100; s += 55) { const p = M.pointAlong(ln.pts, s); if (E.seen(p.x, p.z) < 2700) cand.push({ ln, s, len }); }
  }
  const want = ctx.quality.draft ? 10 : 26;
  for (let i = 0; i < cand.length && list.length < want; i++) {
    const k = Math.floor(hash2(i, 7, 7501) * cand.length), c = cand[k];
    if (list.some((q) => q.ln === c.ln && Math.abs(q.s0 - c.s) < 120)) continue;
    const kind = hash2(i, 8, 7502) < 0.45 ? 'cart' : 'donkeys', dir = hash2(i, 9, 7503) < 0.5 ? 1 : -1, v = (kind === 'cart' ? 0.95 : 1.25) * (0.9 + 0.2 * hash2(i, 10, 7504));
    const s0 = Math.min(Math.max(c.s, 40 + (dir < 0 ? 64 * v : 0)), c.len - 40 - (dir > 0 ? 64 * v : 0));
    list.push({ ln: c.ln, s0, v: v * dir, kind, lane: (hash2(i, 11, 7505) - 0.5) * Math.max(0.6, c.ln.width - 4.4), seed: i });
  }
  const poseAt = (q, t) => {
    const p = M.pointAlong(q.ln.pts, q.s0 + q.v * t), sg = q.v > 0 ? 1 : -1, dx = p.dir[0] * sg, dz = p.dir[1] * sg, x = p.x - dz * q.lane, z = p.z + dx * q.lane;
    return { x, y: g.height(p.x, p.z) + 0.15, z, dx, dz };
  };
  // geometry (local: +x forward, y up), tones in vertex colours of the white timber material
  const cartW = geom.writer({ color: true }), donkW = geom.writer({ color: true });
  const ox = (w, x, z, col) => {
    obox(w, x, z, 0.62, 1.32, 0.95, 0.3, 1, 0, { side: col, top: mul3(col, 1.1), foot: mul3(col, 0.65), bottom: true });
    obox(w, x + 1.08, z, 0.75, 1.25, 0.24, 0.17, 1, 0, { side: mul3(col, 0.9), top: col, bottom: true });
    for (const [lx, lz] of [[-0.7, -0.2], [-0.7, 0.2], [0.65, -0.2], [0.65, 0.2]]) beam(w, [x + lx, 0, z + lz], [x + lx, 0.66, z + lz], 0.13, mul3(col, 0.6));
  };
  {
    const wood = mul3(C.palmWood, 0.9), load = mix3(C.stubble, C.barleyRipe, 0.5);
    obox(cartW, -1.6, 0, 0.72, 0.95, 1.35, 0.72, 1, 0, { side: wood, top: mul3(wood, 1.1), bottom: true });
    lathe(cartW, -1.6, 0, 0.93, [[1.0, 0], [0.9, 0.5], [0.45, 0.95], [0, 1.05]], 7, (k) => mul3(load, 0.85 + 0.06 * k), { sx: 1.3 });     // a load of sheaves
    for (const s of [-1, 1]) wheel(cartW, -1.6, 0.62, s * 0.84, 0.62, 0.1, mul3(wood, 0.7));                                             // solid plank wheels
    beam(cartW, [-0.3, 0.86, 0], [2.3, 1.2, 0], 0.11, wood);
    beam(cartW, [2.25, 1.24, -0.62], [2.25, 1.24, 0.62], 0.1, wood, true);
    ox(cartW, 1.5, -0.48, mul3(C.ox, 1.0)); ox(cartW, 1.5, 0.48, mul3(C.ox, 1.25));
  }
  {
    for (let i = 0; i < 3; i++) {
      const x = -i * 2.6, col = mul3(C.donkey, 0.8 + 0.25 * hash2(i, 1, 7506));
      obox(donkW, x, 0, 0.55, 1.08, 0.62, 0.2, 1, 0, { side: col, top: mul3(col, 1.1), foot: mul3(col, 0.65), bottom: true });
      obox(donkW, x + 0.78, 0, 0.8, 1.3, 0.2, 0.12, 1, 0, { side: mul3(col, 0.9), top: col, bottom: true });
      for (const [lx, lz] of [[-0.45, -0.13], [-0.45, 0.13], [0.45, -0.13], [0.45, 0.13]]) beam(donkW, [x + lx, 0, lz], [x + lx, 0.58, lz], 0.09, mul3(col, 0.6));
      const pan = i === 1 ? mul3(C.reedMat, 0.85) : mul3(C.woolOatmeal, 0.9);
      for (const s of [-1, 1]) obox(donkW, x - 0.05, s * 0.36, 0.62, 1.2, 0.36, 0.17, 1, 0, { side: pan, top: mul3(pan, 1.1), foot: mul3(pan, 0.7), bottom: true });
    }
  }
  const sets = {
    cart: geom.instanced({ name: 'environs-carts', geometry: cartW.toGeometry(), material: mats.wood, dynamic: true, capacity: Math.max(1, list.filter((q) => q.kind === 'cart').length), shadowTexel: 0.6 }),
    donkeys: geom.instanced({ name: 'environs-donkeys', geometry: donkW.toGeometry(), material: mats.wood, dynamic: true, capacity: Math.max(1, list.filter((q) => q.kind === 'donkeys').length), shadowTexel: 0.6 }),
  };
  const tris = Math.round(cartW.triangleCount) * list.filter((q) => q.kind === 'cart').length + Math.round(donkW.triangleCount) * list.filter((q) => q.kind === 'donkeys').length;
  for (const q of list) {
    ctx.emitters.add({ kind: 'dust', at: (t) => { const p = poseAt(q, t); return [p.x - p.dx * (q.kind === 'cart' ? 3.2 : 6.5), p.y + 0.5, p.z - p.dz * (q.kind === 'cart' ? 3.2 : 6.5)]; }, size: q.kind === 'cart' ? 1.8 : 1.3, data: { road: q.ln.road } });
  }
  const m4 = new ctx.THREE.Matrix4();
  const update = (frame) => {
    const n = { cart: 0, donkeys: 0 }, t = frame.t;
    for (const q of list) {
      const p = poseAt(q, t), bob = 0.012 * Math.sin(t * 6.1 + q.seed);
      // local +x is forward: columns (dx, 0, dz), (0, 1, 0), (-dz, 0, dx)
      m4.set(p.dx, 0, -p.dz, p.x, 0, 1, 0, p.y + bob, p.dz, 0, p.dx, p.z, 0, 0, 0, 1);
      sets[q.kind].setAt(n[q.kind]++, m4);
    }
    sets.cart.count = n.cart; sets.cart.commit(); sets.donkeys.count = n.donkeys; sets.donkeys.commit();
  };
  return { update, count: list.length, tris, list: list.map((q) => ({ kind: q.kind, road: q.ln.road, poseAt: (t) => poseAt(q, t) })) };
}
