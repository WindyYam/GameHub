// js/core/geom.js — subsystem "geom": builders, the Mesopotamian kit, the courtyard-house shell, the tile
// batcher with far-field merging, baked vertex AO, instancing, LOD. OWNER: geometry engineer.
// Contract: ENGINE.md 5.4. Everything beyond it is documented in docs/geom.md. Sub-files: js/core/geom/.
//   mesh.js        MeshWriter (indexed, flat-shaded, growable), merge / transform / paint, inspect (closed? flipped? overlapping?)
//   prims.js       box, prism, cap, wall (batter, stepped tops, ground-following foot), ribbon, quad(s), decal, stairs, ramp, custom
//   kit.js         stepped merlons + alpha strip, parapeted towers, niched facades and blocks, arched passages, gateways, saw-teeth, small parts
//   house.js       courtyard house in three levels of detail from ctx.layout (roof parts, stepped fronts, doors); addHouses() fast path
//   batcher.js     tiles, LOD bands, far-field merging (plain and banded), shadow proxies, statistics
//   ao.js          height-field ambient occlusion per vertex
//   instancing.js  instanced sets by cell, instancedLOD
//   showcase.js    debug scene: every builder + stress test (URL flag geomshow=showcase|stress, or --with geom-showcase / geom-stress)
//   kitcheck.js    the proof that every builder is a closed shell (node render.mjs eval --file js/core/geom/kitcheck.js)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from './mathx.js';
import { MeshWriter, merge, transform, paint, ensureAttributes, triCount, toRGB, inspect } from './geom/mesh.js';
import { makePrims, insetRing } from './geom/prims.js';
import { makeKit, MERLON_HEIGHT } from './geom/kit.js';
import { makeHouse } from './geom/house.js';
import { makeAO } from './geom/ao.js';
import { makeBatcher, TILE, MERGE } from './geom/batcher.js';
import { makeInstancing } from './geom/instancing.js';

export { TILE };

export async function create(ctx) {
  const root = new THREE.Group(); root.name = 'geom'; ctx.scene.add(root);
  const ao = makeAO(ctx);
  const batcher = makeBatcher(ctx, root, ao);
  const inst = makeInstancing(ctx, root, batcher, ao);
  const prims = makePrims(ctx);
  const kit = makeKit(ctx, prims);
  const houses = makeHouse(ctx, kit);

  // ------------------------------------------------------------------------------------------ merlons ----
  // crenellation alpha: the stepped silhouette of one merlon per pitch (u repeats), transparent between merlons
  const stripTextures = new Map(), stripMaterials = new Map();
  function merlonAlpha(fill, steps = 3) {
    const k = Math.round(fill * 32) + ':' + steps;
    if (stripTextures.has(k)) return stripTextures.get(k);
    const W = 64, H = 32, data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = Math.abs((i + 0.5) / W - 0.5), st = Math.min(steps - 1, Math.floor(((j + 0.5) / H) * steps)), on = u < (fill / 2) * (1 - st / steps), o = (j * W + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = on ? 255 : 0; data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, W, H);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; t.name = 'merlon-alpha';
    stripTextures.set(k, t);
    return t;
  }
  /** Alpha-tested, double-sided variant of a palette material for geom.merlonStrip() geometry. fill = merlon width / pitch. */
  function merlonStripMaterial(id, fill = 0.8 / 1.3, steps = 3) {
    const k = id + '|' + Math.round(fill * 32) + '|' + steps;
    if (!stripMaterials.has(k)) stripMaterials.set(k, ctx.materials.variant(id, { name: id + ':merlonStrip', alphaMap: merlonAlpha(fill, steps), alphaTest: 0.5, side: THREE.DoubleSide }));
    return stripMaterials.get(k);
  }
  const merlonSets = new Map();
  /**
   * A row of merlons in every level of detail in one call: stepped geometry while the tile is nearer than
   * `switchAt` (default 600 m, SPEC section 6), the alpha strip from there to `far`.
   * material: palette id. opts: the merlons() options ({ y, pitch, width, height, thickness, offset, steps }) and
   *   switchAt: 600, far: Infinity, reflect: false, castShadow: true,
   *   midAt: 0          > 0: plain block merlons between midAt and switchAt (a third level; saves triangles in view)
   *   shadowFar: 0      > 0: the geometry merlons stop casting shadows beyond this distance
   *   instanced: false  true: the near level is an instanced set (one merlon mesh, a transform per merlon) instead of
   *                     baked tile geometry: far less memory for tens of thousands of merlons, no vertex AO
   */
  function addMerlons(material, polyline, opts = {}) {
    const { switchAt = 600, far = Infinity, reflect = false, castShadow = true, midAt = 0, shadowFar = 0, instanced = false, ...m } = opts;
    const steps = m.steps ?? 3, near = midAt > 0 ? midAt : switchAt, sh = shadowFar || undefined;
    if (instanced) {
      const dims = { width: m.width ?? 0.8, height: m.height ?? MERLON_HEIGHT, thickness: m.thickness ?? 0.5, steps };
      const k = `${material}|${dims.width}|${dims.height}|${dims.thickness}|${steps}|${near}|${reflect}|${castShadow}|${sh}`;
      let set = merlonSets.get(k);
      if (!set) merlonSets.set(k, (set = inst.instanced({ name: `merlons ${material}`, geometry: kit.merlonUnit(dims), material, lod: [0, near], reflect, castShadow, shadowFar: sh })));
      for (const p of kit.merlonLayout(polyline, m)) set.add({ x: p.x, y: p.y, z: p.z, rotDeg: Math.atan2(p.uz, p.ux) * M.RAD });
    } else batcher.addStatic(material, kit.merlons(polyline, { ...m, steps }), { lod: [0, near], reflect, castShadow, shadowFar: sh });
    if (midAt > 0 && midAt < switchAt) batcher.addStatic(material, kit.merlons(polyline, { ...m, steps: 1 }), { lod: [midAt, switchAt], reflect, castShadow, shadowFar: sh, ao: false });
    batcher.addStatic(merlonStripMaterial(material, (m.width ?? 0.8) / (m.pitch ?? 1.3), steps), kit.merlonStrip(polyline, m), { lod: [switchAt, far], reflect, castShadow, ao: false });
  }

  // ------------------------------------------------------------------------------------------ helpers ----
  /** Variant of a palette material for decals and paving patterns: polygon offset n (default 1), no shadow casting needed. */
  const decalMaterial = (id, n = 1) => ctx.materials.variant(id, { polygonOffset: n, name: id + ':decal' + n });
  /** Submit a decal (geom.decal(), a cap or a ribbon lying on a surface): polygon-offset material, no shadow, no AO occlusion. */
  function addDecal(material, geometry, opts = {}) {
    batcher.addStatic(typeof material === 'string' ? decalMaterial(material, opts.offset ?? 1) : material, geometry, { castShadow: false, occluder: false, ...opts });
  }
  /**
   * Up to three levels of detail of the same thing in one call, on consistent grids (never both, never neither):
   * levels: [{ geometry, max: metres (the last level may omit it), material?, tile?, castShadow?, ao? }, ...] nearest first.
   */
  function addLODs(material, levels, opts = {}) {
    let min = 0;
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i], tile = l.tile || opts.tile || TILE, max = l.max ?? Infinity;
      const gPrev = i > 0 ? Math.max(tile, levels[i - 1].tile || opts.tile || TILE) : tile, gNext = i < levels.length - 1 ? Math.max(tile, levels[i + 1].tile || opts.tile || TILE) : tile;
      const { geometry, max: _mx, material: lm, ...rest } = l;
      if (geometry) batcher.addStatic(lm || material, geometry, { ...opts, ...rest, tile, lod: [min, max], lodGrid: [gPrev, gNext] });
      min = max;
    }
  }
  /** Parapeted wall tower submitted with its merlons: spec of geom.kit.wallTower; opts: { merlons: paletteId | null, merlon: { pitch, width, height, ... }, reflect, lod ... } */
  function addWallTower(material, spec, opts = {}) {
    const { merlons: mer = null, merlon = {}, ...rest } = opts;
    batcher.addStatic(material, kit.wallTower(spec), rest);
    if (mer) addMerlons(mer, kit.towerMerlonLine(spec, (merlon.thickness ?? 0.5) / 2), { y: spec.top + (spec.parapet ?? 1.0), reflect: rest.reflect, ...merlon });
  }

  // ------------------------------------------------------------------------------------------ finalize ----
  const flagNames = [...(ctx.flags.with || []), ...(new URLSearchParams(location.search).get('geomshow') || '').split(',').map((s) => 'geom-' + s.trim())];
  const show = { showcase: flagNames.includes('geom-showcase') || flagNames.includes('geom-all'), stress: flagNames.includes('geom-stress') || flagNames.includes('geom-all'), built: false, report: null };
  // the showcase module is loaded here (finalize() is synchronous) and built on the first finalize()
  const showcaseModule = show.showcase || show.stress ? await import('./geom/showcase.js') : null;

  /** Build / rebuild meshes for everything submitted (the engine calls it after all builds; safe to call again). */
  function finalize() {
    if ((show.showcase || show.stress) && !show.built && showcaseModule) {
      show.built = true;
      const prev = batcher.state.owner; batcher.state.owner = 'geom-showcase';
      try { show.report = showcaseModule.buildShowcase(ctx, show); ctx.stats.geomShowcase = show.report; console.info('[geom] showcase ' + JSON.stringify(show.report)); }
      catch (e) { console.error('[geom] showcase failed: ' + (e && e.stack ? e.stack : e)); ctx.stats.errors.push('geom showcase: ' + (e && e.message)); }
      batcher.state.owner = prev;
    }
    const t0 = performance.now();                      // timing only: never influences a pixel
    const built = batcher.finalize();
    const setsBuilt = inst.finalize();
    ao.clear();
    if (built || setsBuilt) { geom.lastFinalize = { buckets: built, sets: setsBuilt, ms: Math.round(performance.now() - t0) }; if (show.report) show.report.finalize = geom.lastFinalize; }
    return built;
  }
  function hasPendingFinalize() { return batcher.hasPending() || inst.hasPending(); }
  function finalizeStep(budgetMs = 4.5) {
    const t0 = performance.now();
    const b = batcher.finalizeStep(budgetMs);
    let s = { built: 0, remaining: inst.hasPending() ? 1 : 0 };
    if (b.remaining === 0) {
      const remMs = Math.max(1, budgetMs - (performance.now() - t0));
      s = inst.finalizeStep(remMs);
    }
    const remaining = b.remaining + s.remaining;
    if (remaining === 0) ao.clear();
    return { built: b.built + s.built, remaining };
  }
  function discard(owner) { batcher.discard(owner); inst.discard(owner); }

  const geom = {
    impl: 'real',
    TILE, MERGE, root,
    /** Name of the module whose build() is running (set by the engine; used for per-module statistics). */
    get owner() { return batcher.state.owner; }, set owner(v) { batcher.state.owner = v; },
    // builders (ENGINE.md 5.4)
    box: prims.box, prism: prims.prism, cap: prims.cap, wall: prims.wall, ribbon: prims.ribbon, tower: prims.tower, stairs: prims.stairs,
    merlons: kit.merlons, merlonStrip: kit.merlonStrip, merlonStripMaterial, nichedFacade: kit.nichedFacade,
    merge, transform, paint, ensureAttributes,
    // builders beyond the contract (docs/geom.md)
    quad: prims.quad, quads: prims.quads, decal: prims.decal, ramp: prims.ramp, custom: prims.custom, insetRing,
    writer: (opts) => new MeshWriter(opts), MeshWriter, triCount, toRGB, inspect,
    kit,
    wallTower: kit.wallTower, parapetBlock: kit.parapetBlock, nichedPrism: kit.nichedPrism, passageBlock: kit.passageBlock, archedWall: kit.archedWall,
    gateway: kit.gateway, sawToothLine: kit.sawToothLine, doorway: kit.doorway, spout: kit.spout, bench: kit.bench, coping: kit.coping,
    house: houses.house, houseInto: houses.houseInto, houseSpec: houses.houseSpec, housePlan: houses.planOf, addHouses: houses.addHouses,
    // batching
    addStatic: batcher.addStatic, addMerlons, addDecal, addLODs, addWallTower, addShadowProxy: batcher.addShadowProxy, decalMaterial,
    instanced: inst.instanced, instancedLOD: inst.instancedLOD,
    finalize, discard,
    /** Replace the vertex-AO baker: fn(positions, normals, out, vertexCount, { tx, tz, material, tile }); null restores the height-field baker. */
    setAOBaker(fn) { batcher.state.aoBaker = fn || null; },
    /** The height-field baker's knobs: { strength: 0.62, contact: 0.3, contactHeight: 1.6, underside: 0.6 } (set before finalize). */
    ao: ao.params,
    registerLOD: (object, range) => batcher.registerLOD(object, range),
    lodDistance: batcher.lodDistance, tileDistance: batcher.tileDistance,
    /**
     * LOD settings: { mergeAt: 800 (m; 1024 m cells of PLAIN tiles and sets farther than this are drawn as one merged mesh),
     * lodMergeAt: 0 (m; a cell of BANDED tiles is drawn merged from this distance on while all its tiles are in the band),
     * lodMergeMin: 1500 (m; only bands that reach this far get the merged copy; read when geometry is submitted),
     * dither: 0.06 (cross-dissolve width of LOD switches over the sub-frames) }
     */
    lod: batcher.state,
    update(frame) { batcher.update(frame); inst.update(frame); },
    /** Tile index [tx, tz] of a plan point. */
    tileOf: (x, z) => [Math.floor(x / TILE), Math.floor(z / TILE)],
    /** Per-module statistics: { tris, draws, instances, instancedTris, sets }. */
    statsFor: batcher.statsFor,
    /** Totals: { tiles, tris, vertices, geometryMB, mergedCells, mergedTris, mergedMB, instancedSets, lodObjects }. */
    stats() { return { ...batcher.stats(), instancedSets: inst.sets.length }; },
    /** What the current frame draws from geom.root: { main: { calls, tris }, shadow: { casters, tris }, reflect: { calls, tris } }. */
    drawStats: batcher.drawStats,
    finalizeStep,
    hasPendingFinalize,
    lastFinalize: null,
  };
  return geom;
}
