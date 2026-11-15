// js/modules/walls/index.js — world module "walls" (claims innerWalls, outerWall): SPEC 3.4 and 3.5.
//   inner.js   the inner double wall on both banks, the raised stretch, the moat quay with bastions
//   gates.js   the seven ordinary inner gates and the five outer gates as double gates, causeways, timber spans
//   outer.js   the outer wall triangle: mud wall, rubble road, baked wall, quay, canal water gates, cross-wall
//   lines.js   a towered wall swept along a line (bays, parapets, merlons, towers, stairs, spouts)
//   kit.js     bins, tones, faces with real recesses, towers, merlon rows
// Notes for other modules and what is conjectural: docs/mod-walls.md.
//   node render.mjs still --only walls --shots 1,3,9 --label walls
//   node render.mjs still --only walls --mode afternoon --cam "300,48,-770;400,26,-730;50" --label walls
import * as M from '../../core/mathx.js';
import { makeKit, NEAR, PARAPET, MERLON } from './kit.js';
import { makeLines } from './lines.js';
import { makeInner } from './inner.js';
import { makeGates } from './gates.js';
import { makeOuter } from './outer.js';

export default {
  name: 'walls',
  claims: ['innerWalls', 'outerWall'],

  /** The zone of the outer wall (mud wall, rubble road, baked wall, quay) is no ground for palms, props or houses. */
  prepare(ctx) {
    const { world, W, mathx: Mx, layout } = ctx;
    try {
      const ow = world.outerWall, line = ow.line, off = ow.profile.offsetsFromMudWallCentreline, t = W.wallTowers('outer')[0], p = Mx.pointAlong(line, t.s);
      const outSign = -p.dir[1] * t.out[0] + p.dir[0] * t.out[1] >= 0 ? 1 : -1;
      for (let i = 0; i < line.length - 1; i++) {
        const seg = [line[i], line[i + 1]], a = Mx.offsetPolyline(seg, outSign * off.quay[1]), b = Mx.offsetPolyline(seg, outSign * off.mudWall[0]);
        layout.reserve([a[0], a[1], b[1], b[0], a[0]], { owner: 'walls', kind: 'wall', margin: 0.5 });
      }
    } catch (e) { if (ctx.module && ctx.module.warn) ctx.module.warn('walls.prepare: ' + (e && e.message)); }
  },

  async build(ctx) {
    const { world, W, ground, geom } = ctx;
    const K = makeKit(ctx), L = makeLines(ctx, K), I = makeInner(ctx, K, L), G = makeGates(ctx, K, L), O = makeOuter(ctx, K, L, G, I);
    const iw = world.innerWalls, prof = iw.profile, checks = [], stats = {};
    const r1 = (v) => Math.round(v * 10) / 10;

    // ---- where the walls are interrupted: the seven ordinary gates (their bodies), the Ishtar Gate with its wing walls
    const ish = W.monument('ishtarGate').dims;
    // The four wing walls of the Ishtar Gate (module `ishtar`) run 20 m along the two wall lines from the sides of
    // the gate: from the body of the main gate (half width 11.0) on Imgur-Enlil's line, from the outer faces of the
    // main-gate towers (innerFacesApart / 2 + width = 14.8) on Nemetti-Enlil's. The mud walls begin where they end,
    // 0.5 / 0.2 m inside the thicker brickwork.
    const wingEnd = (line, uFace, overlap) => {
      const ax = ish.axis, l = ax.length, Sd = [(ax.south[0] - ax.north[0]) / l, (ax.south[1] - ax.north[1]) / l], E = [Sd[1], -Sd[0]];
      const gv = line[1], uOf = (q) => (q[0] - ax.north[0]) * E[0] + (q[1] - ax.north[1]) * E[1], res = [];
      for (const [far, sg] of [[line[0], -1], [line[2], 1]]) {
        const d = [far[0] - gv[0], far[1] - gv[1]], dl = Math.hypot(d[0], d[1]), dir = [d[0] / dl, d[1] / dl];
        res.push((sg * uFace - uOf(gv)) / (dir[0] * E[0] + dir[1] * E[1]) + ish.wingWalls.length - overlap);
      }
      return res;                                                   // [metres west of the vertex, metres east of it]
    };
    const mgT = ish.mainGate.towers;
    const cuts = iw.gates.map((g) => (g.monumentId
      ? { x: g.x, z: g.z, name: g.name, main: wingEnd(iw.east.innerLine, ish.mainGate.width / 2, 0.5), front: wingEnd(iw.east.outerLine, mgT.innerFacesApart / 2 + mgT.width, 0.2), ishtar: true }
      : { x: g.x, z: g.z, name: g.name, main: [g.mainGate.width / 2 - 0.5, g.mainGate.width / 2 - 0.5], front: [g.foreGate.width / 2 - 0.5, g.foreGate.width / 2 - 0.5] }));

    // ---- the inner double wall and its quay, both banks
    const built = {};
    for (const side of ['east', 'west']) {
      const S = iw[side], east = side === 'east', lv = (x, z) => W.innerWallLevels(side, x, z);
      built[side] = I.build(side, cuts);
      const edge = ground.hardEdges.find((h) => h.id === (east ? 'quay:innerMoatEast:0' : 'quay:innerMoatWest:0'));
      if (edge) {
        let pl = edge.polyline;
        if (east) {
          // the moat quay begins at the south-east corner of the East Fortification: the first three legs belong to ishtar and palaces
          const corner = S.quayLine.length ? M.nearestOnPolyline(649.8, -824, pl) : null, ch = M.chainage(pl);
          pl = K.subLine(pl, corner.s, ch[ch.length - 1], ch);
        }
        const bast = [];
        for (const t of W.wallTowers(side + ':quay')) { const h = M.nearestOnPolyline(t.x, t.z, pl); if (h.dist < 5 && h.s > 6 && h.s < M.polylineLength(pl) - 6) bast.push({ s: h.s, w: t.w, d: t.d }); }
        const openings = ground.causeways.filter((c) => c.kind === 'inner').map((c) => [c.from[0], c.from[1], c.width / 2 + 1.2]);
        built[side].quay = I.quay({ pl, land: edge.land, foot: edge.foot, topAt: (x, z) => lv(x, z).quayTop, walkAt: () => prof.quay.nabopolassar.top, openings, bastions: bast, seed: east ? 301 : 351 });
      }
      if (east) {
        // the embankment on the quay line between the bastions of the gate and the moat: a breastwork that falls with the walls
        const ql = S.quayLine, a = M.nearestOnPolyline(384, -763, ql), b = M.nearestOnPolyline(649.8, -824, ql), pl = K.subLine(ql, a.s, b.s);
        const bast = [];
        for (const t of W.wallTowers('east:quay')) {
          const h = M.nearestOnPolyline(t.x, t.z, pl); if (h.dist > 2 || h.s < 8 || h.s > M.polylineLength(pl) - 8) continue;
          // only where the strip between the quay line and the East Fortification is wide enough to carry it
          const p = M.pointAlong(pl, h.s), o = [p.dir[1], -p.dir[0]], g0 = ground.height(p.x, p.z);
          if (ground.height(p.x + o[0] * (t.d + 1.5), p.z + o[1] * (t.d + 1.5)) > g0 - 2) bast.push({ s: h.s, w: t.w, d: t.d });
        }
        built.east.embankment = I.quay({ pl, land: 1, foot: 0, embank: true, topAt: (x, z) => lv(x, z).quayTop, walkAt: (x, z) => ground.height(x, z), bastions: bast, seed: 371 });
      }
    }

    // ---- plasterers' scaffold on the front wall west of the Ishtar Gate (in view from the orbit of shot 3)
    {
      const bays = built.east.front.bays.filter((b) => !b.skip && b.s1 - b.s0 > 12);
      bays.sort((a, b) => Math.hypot(a.mid[0] - 289, a.mid[1] + 727) - Math.hypot(b.mid[0] - 289, b.mid[1] + 727));
      stats.workSite = I.workSite(bays[0], built.east.outFront);
    }

    // ---- the ends: at the palace quay, at the river (the 10 m quay stubs on the river edge there are `riverworks`')
    built.east.endWest = I.palaceEnd(); built.east.endSouth = I.riverEnd('east', false);
    built.west.endNorth = I.riverEnd('west', true); built.west.endSouth = I.riverEnd('west', false);
    // where the mud walls stop at the wing walls of the Ishtar Gate (published for `ishtar`)
    {
      const g = cuts.find((c) => c.ishtar), S = iw.east, ends = [];
      for (const [wall, line, half, th] of [['main', S.innerLine, g.main, I.T_MAIN], ['front', S.outerLine, g.front, I.T_FRONT]]) {
        const h = M.nearestOnPolyline(g.x, g.z, line);
        for (const [sideName, s] of [['west', h.s - half[0]], ['east', h.s + half[1]]]) {
          const p = M.pointAlong(line, s), lv = W.innerWallLevels('east', p.x, p.z);
          ends.push({ wall, side: sideName, x: p.x, z: p.z, dir: p.dir, thickness: th, walk: wall === 'main' ? lv.walk : lv.frontTop, parapetTop: (wall === 'main' ? lv.walk : lv.frontTop) + PARAPET + MERLON.height });
        }
      }
      built.east.ends = ends;
    }

    // ---- gates, outer wall
    const gates = G.buildInner(cuts, built);
    const outer = O.build();

    const tris = K.flush();
    stats.tris = tris; stats.kit = K.stats;
    const mine = (ctx.emitters.list || []).filter((e) => e.owner === 'walls');
    stats.emitters = { total: mine.length, braziers: mine.filter((e) => e.kind === 'brazier').length, torches: mine.filter((e) => e.kind === 'torch').length, towersEast: built.east.torches, towersWest: built.west.torches };

    // ---------------------------------------------------------------------------------------------- checks ----
    const count = (which) => W.wallTowers(which).length;
    const spacing = (which) => { const t = W.wallTowers(which); let n = 0, sum = 0; for (let i = 1; i < t.length; i++) if (t[i].run === t[i - 1].run) { sum += t[i].s - t[i - 1].s; n++; } return sum / n; };
    checks.push({ name: 'Imgur-Enlil / Nemetti-Enlil thickness, lane between them (m)', value: `${I.T_MAIN} / ${I.T_FRONT} / ${r1(prof.offsetsFromImgurEnlilCentreline.frontWall[0] - I.T_MAIN / 2)}`, expect: '6.5 / 3.7 / 7.2', pass: I.T_MAIN === 6.5 && I.T_FRONT === 3.7 && Math.abs(prof.offsetsFromImgurEnlilCentreline.frontWall[0] - I.T_MAIN / 2 - 7.2) < 0.01 });
    for (const [which, want, sp] of [['east:main', 159, 27.6], ['east:front', 216, 20.5], ['east:quay', 88, 48], ['west:main', 130, 27.6], ['west:front', 177, 20.5], ['west:quay', 78, 48], ['outer', 147, 52.5]]) {
      const n = count(which), s = spacing(which);
      checks.push({ name: `towers ${which}: canonical count, mean spacing (m)`, value: `${n}, ${r1(s)}`, expect: `${want} +/- 8 %, ${sp} +/- 6 %`, pass: Math.abs(n / want - 1) <= 0.08 && Math.abs(s / sp - 1) <= 0.06 });
    }
    {
      const lv = W.innerWallLevels('east', 346, -716), pave = ish.pavementLevel;
      checks.push({ name: 'city wall at the Ishtar Gate above the +15.4 pavement: front wall / wall-walk (m)', value: `${r1(lv.frontTop - pave)} / ${r1(lv.walk - pave)}`, expect: '10 / 14', pass: Math.abs(lv.frontTop - pave - 10) < 0.05 && Math.abs(lv.walk - pave - 14) < 0.05 });
      const a = ground.height(1000 + 4, -867 - 16.5), b = ground.height(1000 + 7, -867 - 30);
      checks.push({ name: 'berm level at the wall foot / at the quay (m)', value: `${r1(a)} / ${r1(b)}`, expect: '+1 / +2', pass: a > 0.8 && a < 1.4 && b > 1.7 && b < 2.2 });
    }
    // spacing of the towers as BUILT (centre to centre inside a stretch), and the moats measured from the quay face
    for (const [name, list, sp] of [['Imgur-Enlil east', built.east.main.towers, 27.6], ['Nemetti-Enlil east', built.east.front.towers, 20.5], ['Imgur-Enlil west', built.west.main.towers, 27.6], ['Nemetti-Enlil west', built.west.front.towers, 20.5]]) {
      let n = 0, sum = 0; for (let i = 1; i < list.length; i++) { const d = list[i].s - list[i - 1].s; if (d > 0 && d < sp * 1.6) { sum += d; n++; } }
      checks.push({ name: `built towers ${name}: number, mean centre-to-centre (m)`, value: `${list.length}, ${r1(sum / n)}`, expect: `${sp} +/- 4 %`, pass: Math.abs(sum / n / sp - 1) < 0.04 });
    }
    {
      const widths = [];
      for (const id of ['quay:innerMoatEast:0', 'quay:innerMoatWest:0', 'quay:outerMoat:0']) {
        const e = ground.hardEdges.find((h) => h.id === id); if (!e) continue;
        const len = M.polylineLength(e.polyline);
        for (const k of [0.42, 0.63, 0.81]) {
          const p = M.pointAlong(e.polyline, len * k), o = [p.dir[1] * e.land, -p.dir[0] * e.land];          // away from the land
          let d = 0.5; while (d < 140 && ground.isWater(p.x + o[0] * d, p.z + o[1] * d)) d += 0.25;
          widths.push(d);
        }
      }
      checks.push({ name: 'moat width from the quay face to the outer bank (m): min .. max of 9 sections', value: `${r1(Math.min(...widths))} .. ${r1(Math.max(...widths))}`, expect: '80 +/- 2', pass: Math.min(...widths) > 78 && Math.max(...widths) < 82 });
    }
    checks.push({ name: 'merlon height / width / pitch (m)', value: `${MERLON.height} / ${MERLON.width} / ${MERLON.pitch}`, expect: 'under 1 / 0.8 / 1.3', pass: MERLON.height < 1 });
    if (built.east.main.inspect) { const q = built.east.main.inspect; checks.push({ name: 'a main-wall tower measured by geom.inspect: open edge above the foot (m) / flipped / overlap (m2)', value: `${q.openAbove} / ${q.flipped} / ${q.overlap}`, expect: 'flipped 0, overlap 0', pass: q.flipped === 0 && q.overlap < 0.01 }); stats.towerInspect = q; }
    if (gates) checks.push(...gates.checks);
    if (outer) checks.push(...outer.checks);
    stats.inner = { east: summary(built.east), west: summary(built.west) };
    stats.gates = gates && gates.stats; stats.outer = outer && outer.stats;
    function summary(b) { return { mainTowers: b.main.towers.length, frontTowers: b.front.towers.length, bays: b.main.bays.length + b.front.bays.length, mainLength: Math.round(b.main.length), frontLength: Math.round(b.front.length), quay: b.quay && Math.round(b.quay.length), bastions: b.quay && b.quay.bastions }; }
    const builtTowers = built.east.main.towers.length + built.east.front.towers.length + built.west.main.towers.length + built.west.front.towers.length + (outer ? outer.stats.towers : 0);
    checks.push({ name: 'wall towers built (main, front, outer; without quay bastions and gate towers)', value: builtTowers, expect: '>= 780', pass: builtTowers >= 780 });
    checks.push({ name: 'fires declared for nightfx (braziers at the 12 gates, torches on gate and wall towers)', value: `${stats.emitters.braziers} + ${stats.emitters.torches}`, expect: '36 braziers, 100 to 220 torches', pass: stats.emitters.braziers === 36 && stats.emitters.torches >= 100 && stats.emitters.torches <= 220 });

    return {
      stats, checks,
      api: {
        /** Wall-walk level of Imgur-Enlil as built (level per bay: the walk steps at the towers on the raised stretch). */
        near: NEAR, parapet: PARAPET,
        /** Wall-walk level of the bay of the main / front wall nearest to (x, z), as built (it steps at the towers). */
        walkAt(side, x, z, wall = 'main') {
          const b = built[side] && built[side][wall]; if (!b) return null;
          let best = null, bd = Infinity; for (const q of b.bays) { if (q.skip) continue; const d = (q.mid[0] - x) ** 2 + (q.mid[1] - z) ** 2; if (d < bd) { bd = d; best = q; } }
          return best ? best.walk : null;
        },
        /** Where the mud walls end at the Ishtar Gate: the wing walls of `ishtar` join here. [{ wall: 'main' | 'front', side: 'west' | 'east', x, z, walk, thickness }] */
        ishtarEnds: built.east.ends || [],
        gateFloors: gates ? gates.floors : {},
      },
    };
  },
};
