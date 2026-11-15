// js/modules/ishtar/index.js — module "ishtar": the Ishtar Gate (double gate, wing walls, forecourt, pedestals,
// copper beasts, bastions), the two street walls of the Processional Way north of it with the lion friezes, the
// roadway, the North Gate and the causeway north of it (SPEC 3.6, research/R2-ishtar-gate.md).
// Notes on every choice that the spec leaves open: docs/mod-ishtar.md.
//   node render.mjs still --shots 2,3 --only ishtar,terrain --label ishtar
// Parts: util.js (buckets, skins, parapets, paving strips, doors), gate.js (the double gate), wings.js (wing walls,
// forecourt, bastions), street.js (street walls, friezes, roadway, North Gate, causeway), beasts.js (copper beasts).
import { makeKit, MERLON } from './util.js';
import { buildGate } from './gate.js';
import { buildWings } from './wings.js';
import { buildStreet } from './street.js';

export default {
  name: 'ishtar',
  claims: ['monument:ishtarGate', 'lionStreet'],

  async build(ctx) {
    const K = makeKit(ctx), G = ctx.glazed;
    const gate = buildGate(ctx, K);
    const wings = buildWings(ctx, K, gate);
    const street = buildStreet(ctx, K, gate, wings);
    const tris = K.flush();

    const d = ctx.W.monument('ishtarGate').dims, s = street.stats, g = gate.stats, h = gate.heights;
    const mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length), near = (v, t, e) => Math.abs(v - t) <= e;
    const feet = mean(s.lionFeet), spacing = mean(s.lionSpacing);
    const northward = street.lions.every((l) => l.facing === (l.side === 'east' ? 'L' : 'R'));
    const beastsOn = gate.beasts.map((b) => b.n).sort().join(',');
    const checks = [
      { name: 'gate depth along the axis (m)', value: d.axis.length, expect: '49.94', pass: near(d.axis.length, 49.94, 0.05) },
      { name: 'fore-gate wall / tower, main-gate wall / tower: merlon tops above the pavement (m)', value: [h.foreWall, h.foreTower, h.mainWall, h.mainTower].map((v) => +v.toFixed(2)).join(' / '), expect: '14.5 / 18.5 / 19.2 / 24.0 within 0.15', pass: near(h.foreWall, 14.5, 0.15) && near(h.foreTower, 18.5, 0.15) && near(h.mainWall, 19.2, 0.15) && near(h.mainTower, 24.0, 0.15) },
      { name: 'animals on the gate and its two glazed wing walls: bulls and dragons only', value: `${g.bulls} bulls + ${g.dragons} dragons on the gate, ${wings.stats.animals} on the wings`, expect: '300 to 400 in all (R2 6.2)', pass: g.animals + wings.stats.animals >= 270 && g.animals + wings.stats.animals <= 420 && !g.other },
      { name: 'rows of animals on a facade', value: g.rows, expect: '6', pass: g.rows === 6 },
      { name: 'gate animal height (m)', value: +g.animalHeight.toFixed(3), expect: '1.1 (13 courses)', pass: near(g.animalHeight, 1.1, 0.03) },
      { name: 'lions per side (east / west)', value: `${s.lions.east} / ${s.lions.west}`, expect: 'about 60 each (50 to 66; the west wall has the palace doorway)', pass: s.lions.east >= 50 && s.lions.east <= 66 && s.lions.west >= 50 && s.lions.west <= 66 },
      { name: 'all lions stride north (east wall L, west wall R)', value: northward, expect: 'true', pass: northward },
      { name: 'lion feet above the pavement, mean (m)', value: +feet.toFixed(2), expect: '1.15 +/- 0.15', pass: near(feet, 1.15, 0.15) },
      { name: 'lion spacing, mean (m)', value: +spacing.toFixed(2), expect: '2.4 to 3.2', pass: spacing >= 2.4 && spacing <= 3.2 },
      { name: 'lion size (m)', value: `${G.figures.lion.cellW.toFixed(2)} x ${G.figures.lion.cellH.toFixed(2)}`, expect: '2.0 x 0.95', pass: near(G.figures.lion.cellW, 2.0, 0.05) && near(G.figures.lion.cellH, 0.95, 0.03) },
      { name: 'merlon height (m)', value: MERLON.height, expect: '< 1', pass: MERLON.height < 1 },
      { name: 'copper beasts on pedestals', value: beastsOn, expect: '3,4,7,8 (door-jambs only)', pass: beastsOn === '3,4,7,8' },
      { name: 'street-wall towers on the lion stretch', value: s.lionTowers, expect: '10 a side at 14 m centres', pass: s.lionTowers === 20 },
      { name: 'gate shell sample: open edge above the foot (m), flipped normals', value: `${gate.inspect.openAbove.toFixed(2)}, ${gate.inspect.flipped}`, expect: '0, 0', pass: gate.inspect.openAbove < 0.01 && gate.inspect.flipped === 0 },
    ];
    return {
      stats: { tris, buckets: K.bucketTris, merlons: K.merlons(), gate: g, lions: s.lions, lionFeet: +feet.toFixed(3), lionSpacing: +spacing.toFixed(2), towers: s.towers, northGate: s.northGate, wingAnimals: wings.stats.animals },
      checks,
      // conveniences for people / nightfx (optional): where the roadway lies and what stands on it
      api: {
        pavementLift: street.paving.lift.lime,
        roadway: { limestoneHalf: street.paving.limestoneHalf, brecciaHalf: street.paving.brecciaHalf },
        gate: { pavement: gate.P0, axis: d.axis },
        pedestals: gate.plinths, beasts: gate.beasts, fires: gate.fires,
        lions: street.lions.length,
      },
    };
  },
};
