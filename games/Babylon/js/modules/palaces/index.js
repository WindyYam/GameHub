// js/modules/palaces/index.js — North Palace with the structure of the royal terraced garden, West Fortification,
// East Fortification, Summer Palace (SPEC 3.5, 3.9; R4). Notes: docs/mod-palaces.md.
//   kit.js     shared builders (walls with pilaster towers and merlons, palace fabric, portals, retaining walls ...)
//   north.js   North Palace, North Fortification, garden terraces, palace canal
//   west.js    West Fortification, the ditch beside it and its quay terrace
//   east.js    East Fortification
//   summer.js  Summer Palace on the Babil mound
// The two walls of the lion street (east side of the North Palace, west side of the East Fortification) belong to
// the `ishtar` module and are left out here. Planting belongs to `vegetation`: the garden treads stay open soil.
import { makeKit } from './kit.js';
import { buildNorth } from './north.js';
import { buildWest } from './west.js';
import { buildEast } from './east.js';
import { buildSummer } from './summer.js';

export default {
  name: 'palaces',
  claims: ['monument:northPalace', 'monument:westFortification', 'monument:eastFortification', 'monument:summerPalace'],

  async build(ctx) {
    const { geom, materials, THREE } = ctx;
    const K = makeKit(ctx);
    const rot = ctx.W.monument('northPalace').dims.mainBuilding.rotationDeg;

    // ---- materials: key -> { m: material, cast, ao, reflect } ------------------------------------------
    const lazy = new Map();
    const DEF = {
      brickY: () => ({ m: materials.variant('bakedBrickYellow', { name: 'palaces-brick-yellow', joint: 'lime' }), reflect: true }),
      brickB: () => ({ m: materials.get('bakedBrickBuff'), reflect: true }),
      brickQ: () => ({ m: materials.preset('quayBrick'), reflect: true }),
      roof: () => ({ m: materials.get('roofEarth'), cast: false }),
      pave: () => ({ m: materials.variant('courtBrickPaving', { name: 'palaces-paving', rotDeg: rot }), cast: false }),
      slabs: () => ({ m: materials.variant('limestone', { name: 'palaces-slabs', color: 0xffffff, pattern: false }), cast: false, ao: false }),
      ashlar: () => ({ m: materials.variant('limestone', { name: 'palaces-ashlar', moduleSide: [2.0, 0.75, 0.5, 0.016], joint: 'mud' }), reflect: true }),
      basalt: () => ({ m: materials.get('basalt') }),
      wood: () => ({ m: materials.preset('planks', { vertical: true }), cast: false }),
      clay: () => ({ m: materials.preset('pottery'), cast: false }),
      earthFlat: () => ({ m: materials.get('streetEarth'), cast: false, ao: false }),
      reed: () => ({ m: materials.get('reedMat'), cast: false }),
      merlonBlue: () => ({ m: materials.get('glazeBlue'), id: 'glazeBlue', reflect: true }),
      merlonBrick: () => ({ m: materials.get('bakedBrickBuff'), id: 'bakedBrickBuff', reflect: true }),
    };
    // small things share a material and are told apart by a tint (one draw call per tile and material: ENGINE.md 10)
    const lime = materials.color('limestone'), LIME = [lime.r, lime.g, lime.b];
    const ALIAS = {
      paveFlat: ['pave', null], door: ['wood', [1, 1, 1]], timber: ['wood', [0.96, 0.93, 0.86]], dark: ['basalt', [0.45, 0.45, 0.45]], water: ['basalt', [0.75, 0.95, 0.9]],
      bronze: ['clay', [1, 0.86, 0.62]], spout: ['clay', [1, 0.93, 0.8]], limestoneObj: ['slabs', LIME], way: ['slabs', LIME],
    };
    const mat = (key) => { let v = lazy.get(key); if (!v) { if (!DEF[key]) throw new Error(`palaces: no material for key '${key}'`); v = { cast: true, ao: true, reflect: false, ...DEF[key]() }; lazy.set(key, v); } return v; };

    const totals = { tris: 0, merlons: 0, emitters: 0 };
    const newBags = (brick) => ({ near: K.makeBag({ ...ALIAS, brick: [brick, null] }), far: K.makeBag({ ...ALIAS, brick: [brick, null] }), strips: [], merlons: 0, brick });
    /** Submit the bags of one monument: full detail to `far` metres, the plain level beyond, merlons as geometry to 600 m. */
    function flush(B, { far = 1500, reflect = true, merlonSwitch = 600, stripFar = 3000 } = {}) {
      const T = 512;
      for (const key of B.near.keys()) {
        const g = B.near.take(key); if (!g) continue;
        const d = mat(key), isM = key.startsWith('merlon');
        totals.tris += geom.triCount(g);
        geom.addStatic(d.m, g, isM ? { tile: T, lod: [0, merlonSwitch], reflect: reflect && d.reflect, castShadow: true, shadowFar: 400 } : { tile: T, lod: [0, far], lodGrid: [T, 1024], castShadow: d.cast, ao: d.ao, reflect: reflect && d.reflect });
      }
      for (const key of B.far.keys()) {
        const g = B.far.take(key); if (!g) continue;
        const d = mat(key);
        totals.tris += geom.triCount(g);
        geom.addStatic(d.m, g, { lod: [far, Infinity], tile: 1024, lodGrid: [1024, 1024], castShadow: d.cast, ao: false, reflect: false });
      }
      const byKey = new Map();
      for (const s of B.strips) { if (!byKey.has(s.key)) byKey.set(s.key, { list: [], fill: s.fill }); byKey.get(s.key).list.push(s.g); }
      for (const [key, v] of byKey) {
        const d = mat(key), g = geom.merge(v.list);
        totals.tris += geom.triCount(g);
        geom.addStatic(geom.merlonStripMaterial(d.id, v.fill, 3), g, { tile: T, lod: [merlonSwitch, stripFar], castShadow: false, ao: false });
      }
      totals.merlons += B.merlons || 0;
    }

    // ---- shared props: jars; fires are declared for nightfx ---------------------------------------------
    const jarGeo = new THREE.LatheGeometry([[0.0, 0], [0.17, 0], [0.27, 0.25], [0.25, 0.52], [0.12, 0.66], [0.15, 0.74]].map(([r, y]) => new THREE.Vector2(r, y)), 9);
    const jars = geom.instanced({ name: 'palaces-jars', geometry: jarGeo, material: materials.preset('pottery'), lod: [0, 260], shadowTexel: 0.15, ao: true });
    let jarCount = 0;
    const env = {
      emit(kind, pos, size = 1) { ctx.emitters.add({ kind, pos, size }); totals.emitters++; },
      jars(f, list, y, tint) { for (const [lx, lz] of list) { const p = f.L(lx, lz), k = jarCount++; jars.add({ x: p[0], y, z: p[1], rotDeg: (k * 67) % 360, scale: 1.1 + 0.5 * ((k * 37) % 10) / 10 }, tint ?? (k % 3 === 0 ? materials.tintHex('bakedBrickBuff') : 0xffffff)); } },
    };

    const checks = [], stats = {}, notes = {};
    const run = (name, fn, brick, opts) => {
      const B = newBags(brick), t0 = totals.tris;
      const r = fn(ctx, K, B, env);
      flush(B, opts);
      checks.push(...(r.checks || [])); stats[name] = { ...(r.stats || {}), tris: totals.tris - t0, merlons: B.merlons || 0 }; notes[name] = r.notes;
      return r;
    };
    run('northPalace', buildNorth, 'brickY', { far: 1500 });
    run('westFortification', buildWest, 'brickQ', { far: 1500 });
    run('eastFortification', buildEast, 'brickB', { far: 1500 });
    run('summerPalace', buildSummer, 'brickB', { far: 2600, merlonSwitch: 500, stripFar: 3200 });

    // ---- shells: measure a sample of what the kit builds (docs/geom.md section 9) --------------------------
    {
      const f0 = K.frame([9000, 9000], 15.5), S = { near: K.makeBag(), far: K.makeBag(), strips: [] };
      const meas = (name, g) => { const r = geom.inspect(g); checks.push({ name: `shell sample: ${name} (open above the foot m, flipped, overlap m2)`, value: `${r.openAbove.toFixed(2)}, ${r.flipped}, ${r.overlap.toFixed(3)}`, expect: '0, 0, 0', pass: r.openAbove < 0.02 && r.flipped === 0 && r.overlap < 0.01 }); g.dispose(); };
      { const w = geom.writer(); K.block(w, w, f0.rect(0, 0, 5.2, 3.3), 0, 12, { parapet: 0.9, pt: 0.45 }); meas('pilaster tower', geom.merge([w])); }
      { const w = geom.writer(); K.block(w, w, f0.ring([[0, 0], [18, 0], [18, 12], [13, 12], [13, 5], [5, 5], [5, 12], [0, 12]]), 0, 7, { parapet: 0.6, pt: 0.4 }); meas('room range round a court', geom.merge([w])); }
      { K.enclosure(S, [f0.L(0, 40), f0.L(40, 40)], [{ key: 'brickY', top: 10, thick: 6, base: 0, merlon: null, kerb: 0.45 }], { side: 1 }); meas('wall with parapet, walk and kerb', S.near.take('brickY')); }
      { const w = geom.writer(), Bx = { near: { w: () => w }, far: { w: () => geom.writer() } }; K.block(w, w, f0.rect(60, 0, 80, 12), 0, 10, { parapet: 0.8, pt: 0.45, skip: [0] }); K.portalFace(Bx, 'x', f0.L(60, 0), f0.L(80, 0), 0, 10.8, -1, { at: 0.5, width: 7.5, height: 8, sill: 0.5, depth: 2, rebates: 2, step: 0.4, rd: 0.45, bands: false }); meas('hall with recessed portal', geom.merge([w])); }
    }
    stats.triangles = Math.round(totals.tris); stats.merlons = totals.merlons; stats.emitters = totals.emitters; stats.jars = jarCount;
    checks.push({ name: 'palaces: triangles submitted', value: stats.triangles, expect: '<= 600,000 (ENGINE.md 10)', pass: stats.triangles <= 600000 });
    checks.push({ name: 'palaces: merlons (stepped, 0.9 m high)', value: totals.merlons, expect: '> 2,000, under 1 m high', pass: totals.merlons > 2000 });
    return { stats, checks };
  },
};
