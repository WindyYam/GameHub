// js/modules/streets/index.js — module "streets" (claims `streets`): the surface of every ctx.layout street
// record except class `road` (environs) and except the lion street north of the Ishtar Gate (ishtar):
//   net.js        which records, how they are cut in junctions, how near the film comes, the lift over the terrain
//   surface.js    trodden earth in four levels of detail, squares and forecourts
//   paving.js     the Processional Way from the gate to the bridge, the breccia lane of the Marduk Gate street
//   furniture.js  street altars, pedestals, the public well, the drain, steps where a lane climbs a bank
//   clutter.js    sherds, brick bats, rubbish heaps where an eye-level camera passes
// Notes: docs/mod-streets.md. SPEC 3.7, R5 3.2, R2 7.2.
import { analyse } from './net.js';
import { makeSurface, BASE } from './surface.js';
import { buildPaving } from './paving.js';
import { buildFurniture } from './furniture.js';
import { buildClutter } from './clutter.js';

export default {
  name: 'streets',
  claims: ['streets'],

  async build(ctx) {
    const { geom, layout, materials, THREE } = ctx;
    const t0 = performance.now();                               // timing only: never influences a pixel
    const stats = {}, checks = [];

    const net = analyse(ctx);
    stats.net = net.stats; stats.netMs = Math.round(performance.now() - t0);

    // ---- trodden earth: one material for the whole city, every tone in the vertex colours -----------------
    const albedo = materials.color('streetEarth');
    // (grazing specular down: a dusty street does not mirror the sky at the far end of a lane)
    const earth = materials.variant('streetEarth', { name: 'streets-earth', color: new THREE.Color(Math.min(1, albedo.r / BASE), Math.min(1, albedo.g / BASE), Math.min(1, albedo.b / BASE)), spec: 0.6, specGrazing: 0.25 });
    const surf = makeSurface(ctx, net);
    for (const rec of net.recs) for (const pc of rec.pieces) surf.piece(rec, pc);
    for (const sq of layout.squares || []) surf.polygon(sq.polygon);
    const clutter = buildClutter(ctx, net, surf);                 // heaps are part of the earth mesh
    stats.clutter = clutter.stats;
    const gCore = surf.bufCore.geometry(geom), gOuter = surf.bufOuter.geometry(geom);
    // few and large meshes: a dozen draw calls from the air instead of one per 256 m tile
    if (gCore) geom.addStatic(earth, gCore, { castShadow: false, tile: 2048 });
    if (gOuter) geom.addStatic(earth, gOuter, { castShadow: false, tile: 8192 });
    stats.surface = surf.stats; stats.surfaceMs = Math.round(performance.now() - t0) - stats.netMs;

    const paving = buildPaving(ctx, net, surf);
    stats.paving = paving.stats; checks.push(...paving.checks);
    const furn = buildFurniture(ctx, net, surf);
    stats.furniture = furn.stats; checks.push(...furn.checks);
    stats.ms = Math.round(performance.now() - t0);

    checks.push({ name: 'street records surfaced', value: net.recs.filter((r) => r.pieces.length).length, expect: '>= 3000', pass: net.recs.filter((r) => r.pieces.length).length >= 3000 });
    // measured on a sample of what stands on the roadway: closed shells, no flipped faces (docs/geom.md 9)
    if (furn.sample) {
      const r = geom.inspect(furn.sample);
      checks.push({ name: 'a street altar is a closed shell (open edge above its foot, m / flipped normals)', value: `${+r.openAbove.toFixed(3)} / ${r.flipped}`, expect: '0 / 0', pass: r.openAbove < 0.01 && r.flipped === 0 });
    }
    const surfaced = net.recs.filter((r) => r.pieces.length), km = surfaced.reduce((n, r) => n + r.pieces.reduce((m, p) => m + p.b - p.a, 0), 0) / 1000;
    stats.km = +km.toFixed(1);
    checks.push({ name: 'street surface laid (km; every record but class road and the lion street)', value: stats.km, expect: '>= 225', pass: km >= 225 });
    checks.push({ name: 'surface above ctx.ground.height where the close cameras are (m)', value: +net.liftAt(480, -287.3).toFixed(3), expect: '<= 0.07 (props and feet stand on ground.height)', pass: net.liftAt(480, -287.3) <= 0.0701 || !net.exact });

    /** The level of the street surface at (x, z), or null where there is no street of this module: for whoever wants to stand something exactly on it. */
    const heightAt = (x, z) => { const h = net.streetAt(x, z); return h ? surf.sample(h.rec, h.s, h.lat).y : null; };
    return { stats, checks, api: { furniture: furn.list, heightAt } };
  },
};
