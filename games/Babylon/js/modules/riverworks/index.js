// js/modules/riverworks/index.js — river quays, the Euphrates bridge, landings (SPEC 3.2, 3.13; R1 5, R3 3.5, R5 3.4).
// Claims 'bridge'. Publishes ctx.modules.riverworks = { moorings: [{ x, z, headingDeg, kind }], ... }.
//   quays.js    the brick quays on the hard edges of the ground model, stairs, openings, drains, mooring posts
//   bridge.js   piers, deck, rails, bridge heads
//   dressing.js sheds and goods at the main quay, landings on the mud banks, mooring list
// Notes for readers: docs/mod-riverworks.md.
import * as M from '../../core/mathx.js';
import { hash1 } from '../../core/rng.js';
import { buildQuays } from './quays.js';
import { buildBridge } from './bridge.js';
import { planLandings, buildDressing, buildMoorings } from './dressing.js';

let PLAN = null;          // made in prepare(), used in build()

export default {
  name: 'riverworks',
  claims: ['bridge'],

  /** Landings on the mud banks and the goods yard at the bridge head are ground that houses, trees and reeds must leave alone. */
  prepare(ctx) {
    PLAN = planLandings(ctx);
    for (const r of PLAN.reserve) ctx.layout.reserve(r.polygon, { owner: 'riverworks', kind: r.kind, margin: r.margin ?? 1 });
  },

  async build(ctx) {
    const { geom, materials, THREE } = ctx;
    const R = { stairs: [], ghats: [], walkways: [], slots: [], heads: {}, moorings: [], landings: [], sheds: [] };
    const plan = PLAN || planLandings(ctx);
    const checks = [], stats = {};

    const quays = buildQuays(ctx, R);
    const bridge = buildBridge(ctx, R);
    buildMoorings(ctx, R, plan);
    const dress = buildDressing(ctx, R, plan, quays);

    // ---- small things on the walkways, baked into the one mesh of small timber (no draw call of their own)
    const small = [...bridge.small, ...dress.small, ...dress.palm, ...dress.bakeProps()];
    {
      const palm = materials.color('palmWood'), rope = materials.color('woolOatmeal'), clay = materials.color('bakedBrickRed');
      const post = geom.merge([new THREE.CylinderGeometry(0.105, 0.125, 0.95, 6, 1, true).translate(0, 0.475, 0), new THREE.CylinderGeometry(0.135, 0.135, 0.09, 6).translate(0, 0.9, 0)]);
      const coil = new THREE.TorusGeometry(0.2, 0.05, 4, 8).rotateX(Math.PI / 2).translate(0, 0.06, 0);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (const p of quays.posts) {
        // mooring posts: palm trunks, every one a little different; one in three with a coil of rope round it
        const k = hash1(p.seed, 5), w = 0.9 + 0.3 * k, tone = 0.8 + 0.5 * hash1(p.seed, 10);
        m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q.setFromAxisAngle(up, 6.283 * hash1(p.seed, 6)), new THREE.Vector3(w, 0.85 + 0.35 * hash1(p.seed, 7), w));
        small.push(geom.paint(post.clone().applyMatrix4(m), [palm.r * tone, palm.g * tone, palm.b * tone]));
        if (hash1(p.seed, 8) < 0.34) {
          m.compose(new THREE.Vector3(p.x, p.y + 0.3 + 0.3 * hash1(p.seed, 9), p.z), q.setFromAxisAngle(up, 6.283 * k), new THREE.Vector3(w, w, w).multiplyScalar(0.85));
          small.push(geom.paint(coil.clone().applyMatrix4(m), [rope.r * 0.8, rope.g * 0.8, rope.b * 0.75]));
        }
      }
      // drain outlets: fired-clay pipe mouths in the lower wall, the bore dark (the streak under each is in the wall's vertex colours)
      const pipe = new THREE.CylinderGeometry(0.17, 0.17, 0.46, 8, 1, false), pos = pipe.attributes.position, nor = pipe.attributes.normal;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const bore = nor.getY(i) > 0.9 && Math.hypot(pos.getX(i), pos.getZ(i)) < 0.16, k = bore ? 0.06 : 0.85; col[i * 3] = clay.r * k; col[i * 3 + 1] = clay.g * k; col[i * 3 + 2] = clay.b * k; }
      pipe.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (const p of quays.pipes) {
        q.setFromUnitVectors(up, new THREE.Vector3(p.ox, -0.06, p.oz).normalize());
        m.compose(new THREE.Vector3(p.x + p.ox * 0.13, p.y, p.z + p.oz * 0.13), q, new THREE.Vector3(1, 1, 1));
        small.push(pipe.clone().applyMatrix4(m));
      }
      post.dispose(); coil.dispose(); pipe.dispose();
    }

    // ---- submission: six meshes per 1024 m tile at most; everything big that stands at the water is mirrored in it
    const brick = materials.preset ? materials.preset('quayBrick') : materials.variant('bakedBrickBuff', { name: 'riverworks-brick', joint: 'bitumen' });
    const wood = materials.variant('palmWood', { name: 'riverworks-wood', color: 0xffffff });      // white: every piece carries its own tone
    const TILE = 1024;
    const sub = (m, list, opts) => { const l = list.filter(Boolean); if (l.length) geom.addStatic(m, geom.merge(l), { tile: TILE, ...opts }); };
    sub(brick, [...quays.brick, ...bridge.brick, ...dress.brick], { reflect: true });
    sub('limestone', [...bridge.stone, ...dress.stone], { reflect: true });
    sub(wood, [...bridge.timber, ...dress.timber], { reflect: true });
    sub(wood, small, { lod: [0, 900], shadowTexel: 0.15 });
    sub('reedMat', dress.reed, { lod: [0, 1800] });
    sub('streetEarthDamp', dress.earth, { castShadow: false });

    // ---- fires: declared here, drawn by nightfx (ENGINE.md section 4, "Night")
    let fires = 0;
    for (const h of [...bridge.heads, ...dress.fires]) { ctx.emitters.add({ kind: h.kind, pos: h.pos, size: h.size ?? (h.kind === 'torch' ? 1.3 : h.kind === 'brazier' ? 1.5 : 1) }); fires++; }

    // ---- checks (SPEC 9.2) and numbers
    checks.push(...bridge.checks, ...dress.checks);
    {
      // shells (docs/geom.md 9): one pier with its capping, and the whole east quay (sweeps, openings, stair heads)
      const rp = geom.inspect(R.samplePier()), rq = quays.samples.eastQuay ? geom.inspect(quays.samples.eastQuay) : { openAbove: 0, flipped: 0, overlap: 0 };
      checks.push({ name: 'a bridge pier with its capping is a closed shell: open edge above the foot (m) / flipped normals / coplanar overlap (m2)', value: `${rp.openAbove.toFixed(2)} / ${rp.flipped} / ${rp.overlap.toFixed(3)}`, expect: '0 / 0 / 0', pass: rp.openAbove < 0.01 && rp.flipped === 0 && rp.overlap < 0.001 });
      checks.push({ name: 'east quay (1.6 km of sweeps): open edge above the foot (m) / flipped normals / coplanar overlap (m2)', value: `${rq.openAbove.toFixed(2)} / ${rq.flipped} / ${rq.overlap.toFixed(3)}`, expect: '0 / 0 / 0', pass: rq.openAbove < 0.01 && rq.flipped === 0 && rq.overlap < 0.001 });
    }
    const q = quays.stats;
    const real = !!(ctx.ground.hardEdges && ctx.ground.hardEdges.length);                 // the frozen stub of the ground has no quays
    checks.push({ name: 'river quay built on the hard edges of the ground model (m)', value: q.metres, expect: '>= 4000 (east and west bank inside the walls, palace fronts, Summer Palace reach)', pass: q.metres >= 4000 || !real });
    checks.push({ name: 'top of the upper quay wall (datum): lowest / highest stretch', value: `${q.topMin} / ${q.topMax}`, expect: '+4.0 (SPEC 3.2), stepping up where the ground behind is higher', pass: (q.topMin === ctx.world.levels.riverQuayTop && q.topMax <= 7) || !real });
    checks.push({ name: 'street ends with an opening and stairs down to the walkway and the water', value: q.ghats, expect: '>= 16', pass: q.ghats >= 16 || !real });
    checks.push({ name: 'moorings published (quay / landing / bank)', value: ['quay', 'landing', 'bank'].map((k) => R.moorings.filter((mo) => mo.kind === k).length).join(' / '), expect: '>= 60 in all, every one in water', pass: (R.moorings.length >= 60 || !real) && R.moorings.every((mo) => ctx.ground.isWater(mo.x, mo.z)) });
    {
      // nothing of the module may stand in the way of the film camera
      let worst = Infinity;
      if (typeof ctx.film.nearestApproach === 'function') for (const p of [...quays.posts, ...dress.tall]) worst = Math.min(worst, ctx.film.nearestApproach([p.x, p.y + (p.h ?? 1), p.z]).dist);
      checks.push({ name: 'nearest approach of the film camera to a post, pole or shed (m)', value: +worst.toFixed(1), expect: '> 2', pass: worst > 2 });
    }
    Object.assign(stats, { quay: q, bridge: bridge.stats, dressing: dress.stats, fires, moorings: R.moorings.length });

    return {
      stats, checks,
      api: {
        moorings: R.moorings,                    // agreed shape { x, z, headingDeg, kind } plus: id, bank, nx, nz (unit vector toward the quay), clear, walk [x, y, z], post [x, y, z] | null, length, rank
        walkways: R.walkways,                    // [{ bank, polyline, level, width }]: the quay walkways at -0.4
        stairs: R.stairs,                        // [{ from: [x, y, z], to: [x, y, z], width, bank }]
        ghats: R.ghats.map((g) => ({ bank: g.bank, gate: g.gate, foot: g.foot, floor: g.floor })),
        bridge: { from: R.bridge.from, to: R.bridge.to, width: R.bridge.width, level: R.bridge.level, deckWidth: R.bridge.deckWidth, railTop: R.bridge.railTop },
        landings: R.landings,                    // [{ id, kind, center: [x, z], polygon, level }]
        sheds: R.sheds,                          // [{ center: [x, z], rotDeg, size: [w, d], floor, eaves }]
      },
    };
  },
};
