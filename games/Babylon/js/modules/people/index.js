// js/modules/people/index.js — module "people": people, animals, birds and the staged vignettes at the four low
// cameras (SPEC 3.18, 7, 9.5; research/R5-urban-life.md 2.5, 3.3). Claims nothing. Notes: docs/mod-people.md.
//
//   rig.js       GPU skinning for instanced figures: one float texture of bone rows, a hook on the figure material
//   meshkit.js   lofted shells with bone weights, part bits and colour slots
//   human.js     the human figure (three levels of detail), skeleton, poses
//   animals.js   donkey, ox, sheep, goat, dog, cat in one mesh; one bird in several sizes
//   system.js    the per-sub-frame loop: place, choose the level of detail, pose, write instances
//   cast.js      dress and colours by role
//   stage.js     paths, movers, the camera-corridor test
//   props.js     the static props the vignettes bring (the roof of the Great House)
//   vignettes.js shots 2, 5, 7 and 8;  crowd.js: everybody else
import { createSystem } from './system.js';
import { createCast } from './cast.js';
import { createStage } from './stage.js';
import { createProps } from './props.js';
import { buildVignettes } from './vignettes.js';
import { buildCrowd } from './crowd.js';

export default {
  name: 'people',
  claims: [],

  /** The roofs of the Great House (shot 8) and the walked strip of the Merkes street (shot 7) are dressed here. */
  prepare(ctx) {
    const { layout, film, mathx: M, geom } = ctx;
    const house = layout.houses.find((h) => /Great House/.test(h.landmark || ''));
    if (house) for (const p of layout.roofParts(house)) {
      let ring = M.openRing(p.polygon);
      try { const r = geom.insetRing(ring, 0.35); if (r && r.length >= 3) ring = r; } catch (e) { /* keep the outline */ }
      layout.reserve(ring, { owner: 'people', kind: 'roofDressing', margin: 0 });
    }
    const sh = film.shots.find((s) => s.id === 'merkesLane'), rec = layout.streetById && layout.streetById('merkes0');
    if (sh && rec) {
      const c = film.pathPoseAt(sh.tHold).pos, sC = M.nearestOnPolyline(c[0], c[2], rec.polyline).s, a = [], b = [];
      for (let s = sC - 46; s <= sC + 16; s += 4) { const h = M.pointAlong(rec.polyline, Math.max(0, Math.min(rec.length, s))); a.push([h.x - h.dir[1] * 2.45, h.z + h.dir[0] * 2.45]); b.push([h.x + h.dir[1] * 2.45, h.z - h.dir[0] * 2.45]); }
      layout.reserve(a.concat(b.reverse()), { owner: 'people', kind: 'vignette:merkes', margin: 0 });
    }
  },

  async build(ctx) {
    const { film, layout, mathx: M } = ctx;
    const sys = createSystem(ctx), cast = createCast(sys), st = createStage(ctx, sys, cast), props = createProps(ctx);
    const vig = buildVignettes(ctx, sys, cast, st, props);
    const crowd = buildCrowd(ctx, sys, cast, st);

    // ---- counts and checks -------------------------------------------------------------------------------------
    const figs = sys.figures, humans = figs.filter((f) => f.kind === 'human'), quads = figs.filter((f) => f.kind === 'quad'), birds = figs.filter((f) => f.kind === 'bird');
    const adults = humans.filter((f) => f.role !== 'child' && f.role !== 'girl'), hts = adults.map((f) => f.scale * 1.70);
    const hMin = Math.min(...hts), hMax = Math.max(...hts);
    const S = { x: 0, y: 0, z: 0, az: 0, s: 0, moving: true, hide: false };
    const nearCam = (id, r = 30) => {
      const sh = film.shots.find((s) => s.id === id); if (!sh) return -1;
      const t = sh.mid !== undefined ? sh.mid : (sh.tHold + sh.t1) / 2, c = film.pathPoseAt(t).pos;
      let n = 0;
      for (const f of figs) {
        if (t < f.t0 || t >= f.t1) continue;
        S.hide = false; if (f.move) { f.move(t, S, f); if (S.hide) continue; } else { S.x = f.x; S.y = f.y; S.z = f.z; }
        if (Math.hypot(S.x - c[0], S.y - c[1], S.z - c[2]) < r) n++;
      }
      return n;
    };
    const final = !ctx.quality.draft;
    const near = { processionalWay: nearCam('processionalWay'), euphrates: nearCam('euphrates'), merkesLane: nearCam('merkesLane'), rooftop: nearCam('rooftop') };
    const rc = ctx.modules.rivercraft;
    const checks = [
      { name: 'people', value: humans.length, expect: final ? '>= 2500' : '> 600 (draft tier)', pass: humans.length >= (final ? 2500 : 600) },
      { name: 'animals', value: quads.length, expect: final ? '>= 300' : '> 90 (draft tier)', pass: quads.length >= (final ? 300 : 90) },
      { name: 'birds', value: birds.length, expect: '>= 60', pass: birds.length >= 60 },
      { name: 'height of adults (m)', value: `${hMin.toFixed(2)} to ${hMax.toFixed(2)}`, expect: '1.55 to 1.75', pass: hMin >= 1.549 && hMax <= 1.751 },
      { name: 'figures and animals within 30 m of the camera, shot 2', value: near.processionalWay, expect: '>= 25', pass: near.processionalWay >= 25 },
      { name: 'figures and animals within 30 m of the camera, shot 7 (+ ' + props.count + ' props of the vignettes)', value: near.merkesLane, expect: '>= 14 figures (25 with props)', pass: near.merkesLane >= 14 },
      { name: 'figures and animals within 30 m of the camera, shot 8', value: near.rooftop, expect: '>= 14 figures (25 with props)', pass: near.rooftop >= 14 },
      { name: 'figures, animals and birds within 30 m of the camera, shot 5', value: near.euphrates, expect: rc ? '>= 8 (crew of the camera boat, ducks; the boats are rivercraft)' : 'rivercraft absent', pass: !rc || near.euphrates >= 8 },
      { name: 'figures dropped because the film camera passes within 1 m', value: st.dropped, expect: 'reported', pass: true },
      { name: 'canned pose rows', value: sys.rig.cannedEnd, expect: '< 700 of ' + sys.rig.rows, pass: sys.rig.cannedEnd < 700 },
    ];
    const tris = {}; for (const k of Object.keys(sys.kinds)) tris[k] = sys.kinds[k].tris;
    return {
      update(frame) { sys.update(frame); vig.update(frame); },
      stats: { people: humans.length, animals: quads.length, birds: birds.length, props: props.count, near, vignettes: vig.counts, crowd: crowd.counts, dropped: st.dropped, tris, canned: sys.rig.cannedEnd, live: sys.stats, sets: sys.rig.sets.map((s) => ({ name: s.name, tris: s.tris, capacity: s.capacity, peak: s.peak, dropped: s.dropped })) },
      checks,
      api: { _dbg: { sys, cast, st } },
    };
  },
};
