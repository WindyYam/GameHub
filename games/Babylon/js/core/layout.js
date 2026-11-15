// js/core/layout.js — subsystem "layout": the urban layout DATA of the whole city (ENGINE.md 5.8, docs/layout.md).
// OWNER: urban-layout engineer. Data only, no meshes; derived from world.json with seeded generators; the same
// records in both quality tiers. Sub-files: js/core/layout/ (poly: polygon kernel, net: street net, parcels:
// block -> plots, house: plot -> record, params: grain per district, outer: suburbs, ribbons, villages).
//
// Pipeline, per bank of the inner city:
//   enclosure ring (wall centreline + river bank)  ->  pulled back from wall and quay (the open strip inside the wall)
//   -> the given streets are laid in on their lines (net.resolveFixed); the corridors of the Processional Way and
//      of the canal are as wide as the ground model makes their slopes (scarpHalf)  ->  generated street net (net.gridSplit)
//   -> blocks = cells pulled back by the street half widths, minus monuments, forecourts, squares, landmark houses
//   -> open blocks (gardens, groves, pits) or party-walled plots (parcels.parcelize)  ->  house records (house.make);
//      a plot across a scarp stays open; floors stand on the highest ground under the plot
// then the outer city (suburb patches along the roads), road ribbons outside the walls, the 28 villages; roofs are
// capped (fabricTopLevel, shot 8), generated streets are cut back from water, open spaces in water are dropped.
import * as M from './mathx.js';
import { hash2, Rng, GLOBAL_SEED } from './rng.js';
import * as G from './layout/poly.js';
import { createNet, PARTY } from './layout/net.js';
import { parcelize } from './layout/parcels.js';
import { createHouses, ARCHETYPES } from './layout/house.js';
import { makeParams, RURAL } from './layout/params.js';
import { buildOuter } from './layout/outer.js';

const CELL = 64;      // spatial hash cell (m)
const OPEN = Object.freeze({ k: 'open', st: null, hw: 0 });
const EDGE = Object.freeze({ k: 'edge', st: null, hw: 0 });

export async function create(ctx) {
  const world = ctx.world, W = ctx.W, ground = ctx.ground;
  const root = new Rng(GLOBAL_SEED + ':layout');
  const paramsAt = makeParams(world, W);
  let frozen = false, finalHouses = null;

  // =================================================================================================
  // streets
  // =================================================================================================
  const streets = [], streetById = new Map();
  let gen = 0;
  /** Street record (ENGINE.md 5.8) + additions: level (0 short lane .. 3 gate street), blind, ch (chainage, lazy). */
  function addStreet(o) {
    const polyline = o.polyline.map((q) => [q[0], q[1]]);
    const rec = {
      id: o.id || 'g' + (gen++), name: o.name || 'lane', cls: o.cls || 'lane', polyline, width: o.width,
      widths: o.widths || null, levels: o.levels || null, length: M.polylineLength(polyline), bb: M.bbox(polyline),
      src: o.src || 'generated', conjectural: o.conjectural !== undefined ? !!o.conjectural : true,
      level: o.level ?? 0, blind: !!o.blind, district: o.district || null,
    };
    streets.push(rec); streetById.set(rec.id, rec);
    return rec;
  }
  for (const s of world.streets) addStreet({ id: s.id, name: s.name, cls: s.class === 'processional' ? 'processional' : s.class === 'road' ? 'road' : 'main', polyline: s.polyline, width: s.width, widths: s.widths, levels: s.levels, src: 'world', conjectural: /low|assum|conject/i.test(String(s.conf || '')) && s.class !== 'processional', level: 3 });
  world.merkesStreets.streets.forEach((s, i) => {
    // Untere Tempelstrasse: +5.0 before the Ishtar-of-Agade temple, rising west to the Processional Way; 3 m wide east of x = 550
    const ut = i === 0;
    addStreet({ id: 'merkes' + i, name: s.name, cls: 'lane', polyline: s.polyline, width: s.width, widths: ut ? [6, 6, 6, 6, 3, 3] : null,
      levels: ut ? [7.2, 5.0, 5.0, 5.2, 5.3, 5.4] : s.level !== undefined ? s.polyline.map(() => s.level) : null, src: 'world', conjectural: false, level: 2 });
  });
  for (const r of world.environs.roads || []) addStreet({ id: 'road:' + r.name, name: r.name, cls: 'road', polyline: r.polyline, width: r.width, src: 'world', conjectural: true, level: 3 });

  // =================================================================================================
  // reservations
  // =================================================================================================
  const reserved = [];
  function addReserved(polygon, owner, kind, margin = 0) {
    const ring = M.closeRing(polygon);
    const r = { id: reserved.length, polygon: ring, owner, kind, margin, bb: M.bbox(ring) };
    reserved.push(r);
    return r;
  }
  for (const m of world.monuments) addReserved(m.footprint.polygon, 'world', 'monument:' + m.id, 3);
  const inReserved = (x, z, pad = 0) => {
    for (const r of reserved) {
      const p = r.margin + pad;
      if (!M.inBBox(r.bb, x, z, p)) continue;
      if (M.pointInPolygon(x, z, r.polygon) || (p > 0 && M.distToRing(x, z, r.polygon) < p)) return r;
    }
    return null;
  };

  // =================================================================================================
  // records and sinks
  // =================================================================================================
  const houses = [], openSpaces = [], blocks = [], villages = [];
  const index = new Map();
  const cellKey = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  let maxRad = 12;
  function indexHouse(h) {
    const k = cellKey(Math.floor(h.center[0] / CELL), Math.floor(h.center[1] / CELL));
    let a = index.get(k); if (!a) index.set(k, (a = [])); a.push(h);
    const rad = 0.5 * Math.hypot(h.size[0], h.size[1]); if (rad > maxRad) maxRad = rad;
  }
  const heightAt = (x, z) => ground.height(x, z);
  const H = createHouses({ heightAt });
  // hero zones: houses round the eye-level and rooftop cameras are always built, also in the draft tier
  const heroes = [];
  for (const s of world.shots.list) if (s.eyeLevel || s.onRoofOf) for (const k of s.keyframes || []) if (!W.monumentAt(k.pos[0], k.pos[2]) && W.enclosureAt(k.pos[0], k.pos[2])) heroes.push([k.pos[0], k.pos[2], 95]);
  const isHero = (x, z) => heroes.some((q) => Math.hypot(x - q[0], z - q[1]) < q[2]);

  function addHouse(lot, o) {
    const h = H.make(lot, o);
    h.id = houses.length;
    houses.push(h); indexHouse(h);
    return h;
  }
  const ZC = ground.ZONE || {};
  /** Water or the bed of a canal (the ground model decides). */
  const wetPoint = (x, z) => ground.isWater(x, z) || (ZC.CANAL !== undefined && ground.zoneCode(x, z) === ZC.CANAL);
  function addOpen(poly, kind, use, o = {}) {
    const p = poly.p || poly, c = G.centroid(p);
    // no garden, grove or lot in the river, a moat or a canal (a suburb patch is laid out blind); landings may reach over the water
    if (kind !== 'square' && (wetPoint(c[0], c[1]) || p.some((q) => wetPoint(q[0], q[1])))) { stat.wetOpen++; return null; }
    const rec = { id: openSpaces.length, kind, polygon: G.ring(p), center: c, district: o.district ?? (W.districtAt(c[0], c[1]) || {}).name ?? null, use: use || null, area: Math.abs(G.area(p)), blockId: o.blockId ?? null };
    openSpaces.push(rec);
    return rec;
  }
  /** A plot is not built on where the ground under it falls by more than this (m): it straddles a scarp. */
  const SCARP = 1.9;
  /**
   * Half width of the corridor a given line needs on one side so that the blocks beside it start on level
   * ground: the bank of a cut canal, the slope of the Processional Way terrace. Read off the ground model
   * (ctx.ground), so it follows whatever the ground engineer builds; with flat ground it returns hwMin.
   * a, b: the segment; side: +1 right of travel, -1 left. Walks outward from hwMin and stops where the ground
   * has been level for 3 m (after looking ahead `look` m for a slope that begins further out).
   */
  function scarpHalf(a, b, side, hwMin, hwMax = 48, look = 8) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len * side, nz = (b[0] - a[0]) / len * side, found = [];
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const px = a[0] + (b[0] - a[0]) * f, pz = a[1] + (b[1] - a[1]) * f;
      let d = Math.max(0, hwMin - 2), last = -Infinity, prev = heightAt(px + nx * d, pz + nz * d);
      for (d += 1; d <= hwMax; d += 1) {
        const h = heightAt(px + nx * d, pz + nz * d);
        if (Math.abs(h - prev) > 0.14) last = d; else if (d - last > 3 && d > hwMin + look) break;
        prev = h;
      }
      found.push(last > 0 ? Math.min(hwMax, last + 1.5) : hwMin);
    }
    found.sort((p, q) => p - q);
    return Math.max(hwMin, found[3]);       // the second widest of five: one stray sample (a crossing canal) does not count
  }

  /**
   * One block (already pulled back from its streets): an open block, or plots and houses.
   * o: { prm, enclosure, district, village, openBlock (probability override), allow(lot) -> bool, limit: { n } }
   */
  function buildBlock(poly, o = {}) {
    const p = poly.p, A = G.area(p), c = G.centroid(p);
    const prm = o.prm || paramsAt(c[0], c[1]);
    const id = blocks.length;
    const rng = root.fork('block:' + Math.round(c[0]) + ':' + Math.round(c[1]));
    const sts = new Set(); for (const t of poly.t) if (t && t.st) sts.add(t.st.id);
    const block = { id, polygon: G.ring(p), district: o.district !== undefined ? o.district : prm.name, streets: [...sts], houses: [], area: A, kind: 'built', enclosure: o.enclosure ?? null, center: c, grossArea: o.gross || A * 1.18 };
    blocks.push(block);
    if (A < 70) { block.kind = 'open'; addOpen(poly, 'lot', 'sliver', { district: block.district, blockId: id }); return block; }
    const pOpen = o.openBlock !== undefined ? o.openBlock : prm.openBlock * (o.nearWall ? 2.4 : 1);
    if (rng.next() < pOpen) {
      block.kind = 'open';
      const wet = prm.levelRange && prm.levelRange[0] < 0.5, q = rng.next();
      const kind = wet ? (q < 0.45 ? 'palmGrove' : q < 0.8 ? 'garden' : 'lot') : (q < 0.22 ? 'palmGrove' : q < 0.62 ? 'garden' : 'lot');
      const use = kind === 'lot' ? (rng.next() < 0.4 ? 'brickPit' : rng.next() < 0.5 ? 'rubbish' : 'empty') : kind === 'garden' ? (rng.next() < 0.5 ? 'vegetable' : 'orchard') : 'palms';
      addOpen(poly, kind, use, { district: block.district, blockId: id });
      return block;
    }
    const blockRank = hash2(Math.round(c[0]), Math.round(c[1]), 911), blockAngle = rng.range(9.5, 16);
    const hero = isHero(c[0], c[1]);
    const sink = {
      lot(lot) {
        if (o.limit && o.limit.n <= 0) return;
        if (o.allow && !o.allow(lot)) return;
        // a plot across a scarp (canal bank, quay, terrace slope, levee) stays open ground
        const span = H.groundSpan(lot.p, G.centroid(lot.p));
        if (span.max - span.min > SCARP) { stat.scarpLots++; addOpen(lot, 'lot', 'bank', { district: block.district, blockId: id }); return; }
        const h = addHouse(lot, { prm, blockId: id, blockRank, blockAngle, span, district: block.district, enclosure: block.enclosure, village: o.village ?? null, hero });
        block.houses.push(h.id);
        if (o.limit) o.limit.n--;
      },
      open(lot, kind, use) { if (o.allow && !o.allow(lot)) return; addOpen(lot, kind, use, { district: block.district, blockId: id }); },
      alley(pl, width, blind) { return addStreet({ name: blind ? 'blind alley' : 'alley', cls: 'alley', polyline: pl, width, blind, src: 'generated', conjectural: true, level: 0 }); },
    };
    parcelize(poly, prm, rng, sink);
    return block;
  }

  // =================================================================================================
  // cutters: what is taken out of the blocks (monuments with their margin, forecourts, squares, landmark houses)
  // =================================================================================================
  const cutters = [], obstacles = [];
  /** kind: 'monument' | 'zone' | 'garden' | 'landmark' (streets are cut where they enter these) | 'square' | 'open' (streets run on) */
  function addCutter(points, o = {}) {
    let ring = G.hull(points);
    if (o.margin) ring = G.grow(ring, o.margin);
    const c = { ring, bb: G.bbox(ring), tag: o.party ? PARTY : OPEN, kind: o.kind || 'square' };
    cutters.push(c);
    // generated streets go round small monuments and landmark houses instead of through them
    if (o.avoid) { const g = G.grow(G.hull(points), 2.2); obstacles.push({ ring: g, bb: G.bbox(g) }); }
    return c;
  }
  const monument = (id) => W.monument(id);
  for (const m of world.monuments) {
    const fp = m.footprint.polygon, big = Math.abs(M.polygonArea(fp)) > 9000;
    let pts = fp;
    if (m.id === 'ishtarAgadeTemple' && m.dims && m.dims.forecourt) pts = [...fp, ...m.dims.forecourt.polygon];
    addCutter(pts, { margin: m.id === 'etemenankiPrecinct' ? 6 : big ? 5 : 4, kind: 'monument', avoid: !big });
  }
  // the palace quarter west of the Processional Way and north of the canal: palace, its garden, no houses
  addCutter([[-75, -592], [362, -500], [364, -735], [20, -735]], { kind: 'zone' });
  // Esagila, its annex and the river-bank gardens of Ea's temple (Tintir IV; R5 4.3)
  addCutter([...monument('esagila').footprint.polygon, ...monument('esagilaAnnex').footprint.polygon], { margin: 7, kind: 'monument' });
  // the precinct "hugs the quay" (SPEC 2, point 7; plan_centre.png): the 12 to 30 m between the river quay and its
  // west wall are the quay street and open ground, not a row of houses in front of the white wall (shot 5)
  {
    const pr = M.openRing(monument('etemenankiPrecinct').footprint.polygon), pb = M.bbox(pr);
    const west = pr.filter((q) => q[0] < pb[0] + 0.2 * (pb[2] - pb[0])).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i + 1 < west.length; i++) addCutter([[west[i][0] - 70, west[i][1]], west[i], west[i + 1], [west[i + 1][0] - 70, west[i + 1][1]]], { kind: 'open' });
  }

  // landmark houses (R5 4.1): their plots are fixed, the fabric fills in round them
  const merkesRecs = world.merkesStreets.streets.map((_, i) => streetById.get('merkes' + i));
  const corridorLines = [...world.streets.filter((s) => s.class !== 'road').map((s) => ({ pl: s.polyline, hw: (s.width || 8) / 2 })), ...world.merkesStreets.streets.map((s) => ({ pl: s.polyline, hw: s.width / 2 }))];
  const landmarkLots = [];
  // excavated footprints take precedence over the street centre lines (world.json merkesStreets.note): a
  // Merkes line that runs into a FIXED outline (the Great House) is moved clear of it ...
  const fixedOutlines = world.landmarkHouses.houses.filter((lh) => lh.outline).map((lh) => M.openRing(lh.outline));
  const merkesLines = world.merkesStreets.streets.map((s, i) => {
    let pl = s.polyline.map((q) => [q[0], q[1]]);
    for (const ring of fixedOutlines) {
      const c = G.centroid(ring); let need = 0, nx = 0, nz = 0;
      for (const v of ring) {
        const hit = M.nearestOnPolyline(v[0], v[1], pl), gap = hit.dist - (s.width / 2 + 0.15);
        if (gap < -need && hit.t > 0 && hit.t < 1) { need = -gap; nx = -hit.dir[1]; nz = hit.dir[0]; if ((c[0] - hit.x) * nx + (c[1] - hit.z) * nz > 0) { nx = -nx; nz = -nz; } }
      }
      if (need > 0 && need < 3) pl = pl.map((q) => [q[0] + nx * need, q[1] + nz * need]);
    }
    const rec = merkesRecs[i];
    if (i === 0 && pl.length === 6) {
      // Untere Tempelstrasse is 6 m wide as far as the Ostweg corner and 3 m east of it (R5 2.2): the width steps
      // within 4 m, where the house fronts step, instead of tapering over the 21 m to the next vertex
      const a = pl[3], b = pl[4], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      pl.splice(4, 0, [a[0] + (b[0] - a[0]) * 4 / l, a[1] + (b[1] - a[1]) * 4 / l]);
      rec.widths = [6, 6, 6, 6, 3, 3, 3]; rec.levels = [7.2, 5.0, 5.0, 5.2, 5.22, 5.3, 5.4];
    }
    rec.polyline = pl; rec.bb = M.bbox(pl);
    return { pl, hw: s.width / 2 };
  });
  corridorLines.length = 0;
  corridorLines.push(...world.streets.filter((s) => s.class !== 'road').map((s) => ({ pl: s.polyline, hw: (s.width || 8) / 2 })), ...merkesLines);
  // ... and a landmark house known only by its position (+/-10 m) is moved square off any street or temple it sits on
  for (const lh of world.landmarkHouses.houses) {
    let ring;
    if (lh.outline) ring = M.openRing(lh.outline);
    else {
      const side = Math.sqrt(lh.areaM2), size = lh.size || [side, side];
      let best = null;
      for (const l of corridorLines) { const hit = M.nearestOnPolyline(lh.x, lh.z, l.pl); if (!best || hit.dist < best.dist) best = hit; }
      const rot = best && best.dist < 80 ? M.mod(Math.atan2(best.dir[1], best.dir[0]) * M.RAD + 45, 90) - 45 : 0;
      let cx = lh.x, cz = lh.z;
      for (let it = 0; it < 8; it++) {
        const r = M.openRing(M.rectRing(cx, cz, size[0], size[1], rot));
        let sx = 0, sz = 0, big = 0;
        for (const l of corridorLines) {
          const hc = M.nearestOnPolyline(cx, cz, l.pl);
          if (hc.dist > 0.75 * Math.hypot(size[0], size[1]) + l.hw + 1) continue;
          let nx = -hc.dir[1], nz = hc.dir[0];
          if ((cx - hc.x) * nx + (cz - hc.z) * nz < 0) { nx = -nx; nz = -nz; }
          let minSd = Infinity;
          for (const v of r) minSd = Math.min(minSd, (v[0] - hc.x) * nx + (v[1] - hc.z) * nz);
          const push = l.hw + 0.4 - minSd;
          if (push > big) { big = push; sx = nx * push; sz = nz * push; }
        }
        for (const m of world.monuments) {
          const mr = m.footprint.polygon;
          if (!r.some((v) => M.pointInPolygon(v[0], v[1], mr) || M.distToRing(v[0], v[1], mr) < 2.5)) continue;
          const mc = m.footprint.center, dx = cx - mc[0], dz = cz - mc[1], l = Math.hypot(dx, dz) || 1;
          if (big < 1.5) { big = 1.5; sx = (dx / l) * 1.5; sz = (dz / l) * 1.5; }
        }
        if (big < 0.05) break;
        cx += sx; cz += sz;
      }
      ring = M.openRing(M.rectRing(cx, cz, size[0], size[1], rot));
    }
    landmarkLots.push({ lh, ring });
    addCutter(ring, { party: true, kind: 'landmark', avoid: true });
    addReserved(ring, 'world', 'landmarkHouse', 2);
  }

  // =================================================================================================
  // the inner city, one bank at a time
  // =================================================================================================
  const net = createNet({ rng: root.fork('net'), paramsAt, addStreet, obstacles });
  const stat = { cells: 0, innerBlocks: 0, regions: 0, scarpLots: 0, wetStreets: 0, wetOpen: 0, capped: 0 };
  let canalCorridor = null;

  function specsFor(side) {
    const specs = [];
    const add = (o) => specs.push(net.makeSpec(o));
    for (const s of world.streets) {
      if (s.class === 'road') continue;
      const rec = streetById.get(s.id);
      if (s.id === 'processionalWay') {
        // right of travel (south-bound) = west; the west-east leg hugs the precinct wall in a 20 m corridor
        const n = s.polyline.length - 1, R = [], L = [];
        for (let i = 0; i < n; i++) {
          const we = i >= 25, palace = i <= 15, a = s.polyline[i], b = s.polyline[i + 1];
          // the roadway stands on a terrace beside the palace and on a causeway further south: blocks begin at the foot of its slope
          R.push(we ? 4 : scarpHalf(a, b, 1, palace ? 12 : 10)); L.push(we ? 16 : scarpHalf(a, b, -1, palace ? 12 : 10.3));
        }
        add({ id: s.id, pl: s.polyline, rec, hw: [R, L], ext: 60, prio: 5, name: 'Processional Way' });
      } else add({ id: s.id, pl: s.polyline, rec, hw: (s.width || 8) / 2, ext: 70, prio: 4, extCls: 'main', extWidth: Math.min(8, s.width || 8), name: s.name });
    }
    if (side === 'east') {
      // Libil-hegalla: a narrow canal with a bank path on either side; a region boundary, not a street
      const c = W.canal('libilHegalla');
      // (its half width follows the cut of the ground model: banks of 1 in 1.5 east of the Processional Way)
      const chw = c.polyline.slice(1).map((q, i) => { const m = q[0] <= 347.5 ? 5 : 6, p = c.polyline[i]; return Math.max(scarpHalf(p, q, 1, m, 24, 4), scarpHalf(p, q, -1, m, 24, 4)); });
      canalCorridor = { pl: c.polyline, hw: chw, bb: M.bbox(c.polyline) };
      add({ id: 'canal:libilHegalla', pl: c.polyline, rec: null, kind: 'open', hw: chw, ext: 400, prio: 3 });
      world.merkesStreets.streets.forEach((s, i) => {
        const rec = merkesRecs[i], n = rec.polyline.length - 1;
        add({ id: rec.id, pl: rec.polyline, rec, hw: i === 0 ? [3, 3, 3, 3, 1.5, 1.5].slice(0, n) : s.width / 2, ext: 115, prio: 2, extCls: 'lane', extWidth: Math.max(2.5, Math.min(4.5, s.width)), name: s.name });
      });
      // "Winkelgasse": the angle lane the Great House door opens on (R5 4.1), north of the house, then up to Untere Tempelstrasse
      const gh = landmarkLots[0].ring, vi = landmarkLots[1].ring, cgh = G.centroid(gh);
      let e = 0, bestZ = Infinity;
      for (let i = 0; i < gh.length; i++) { const mz = (gh[i][1] + gh[(i + 1) % gh.length][1]) / 2; if (mz < bestZ) { bestZ = mz; e = i; } }
      const a = gh[e], b = gh[(e + 1) % gh.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; if ((cgh[0] - a[0]) * nx + (cgh[1] - a[1]) * nz > 0) { nx = -nx; nz = -nz; }
      const w0 = a[0] < b[0] ? a : b, w1 = a[0] < b[0] ? b : a, off = 1.75;
      const g1 = [[w0[0] + nx * off, w0[1] + nz * off], [w1[0] + nx * off, w1[1] + nz * off]];
      const recA = addStreet({ id: 'merkes:winkelgasse', name: 'Winkelgasse', cls: 'alley', polyline: g1, width: 3, src: 'derived', conjectural: true, level: 1 });
      add({ id: recA.id, pl: g1, rec: recA, hw: 1.5, ext: 45, prio: 1, extCls: 'alley', extWidth: 3, name: 'Winkelgasse' });
      const vx0 = Math.min(...vi.map((q) => q[0])) - 3.2, zTop = Math.min(...vi.map((q) => q[1])) - 2;
      const g2 = [[vx0 - 1.2, g1[0][1] + (g1[1][1] - g1[0][1]) * ((vx0 - g1[0][0]) / (g1[1][0] - g1[0][0]))], [vx0 + 1.6, zTop]];
      const recB = addStreet({ id: 'merkes:winkelgasse2', name: 'Winkelgasse', cls: 'alley', polyline: g2, width: 2.6, src: 'derived', conjectural: true, level: 1 });
      add({ id: recB.id, pl: g2, rec: recB, hw: 1.3, ext: 30, prio: 0, extCls: 'alley', extWidth: 2.6, name: 'Winkelgasse' });
      // the largest house had saw-tooth street fronts north and south (R5 4.1): a lane along each
      const nt = landmarkLots.find((q) => /New Town/.test(q.lh.name));
      if (nt) {
        const r = nt.ring, cn = G.centroid(r);
        for (const [key, sgn] of [['north', -1], ['south', 1]]) {
          let e = 0, b = -Infinity;
          for (let i = 0; i < r.length; i++) { const v = ((r[i][1] + r[(i + 1) % r.length][1]) / 2 - cn[1]) * sgn; if (v > b) { b = v; e = i; } }
          const p0 = r[e], p1 = r[(e + 1) % r.length], l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / l, uz = (p1[1] - p0[1]) / l;
          let nx = -uz, nz = ux; if ((cn[0] - p0[0]) * nx + (cn[1] - p0[1]) * nz > 0) { nx = -nx; nz = -nz; }
          const pl = [[p0[0] - ux * 4 + nx * 1.9, p0[1] - uz * 4 + nz * 1.9], [p1[0] + ux * 4 + nx * 1.9, p1[1] + uz * 4 + nz * 1.9]];
          const rec = addStreet({ id: 'newtown:' + key, name: 'lane by the great house of the New Town', cls: 'alley', polyline: pl, width: 3.2, src: 'derived', conjectural: true, level: 1 });
          add({ id: rec.id, pl, rec, hw: 1.6, ext: 110, prio: 1, extCls: 'lane', extWidth: 3.2, name: rec.name });
        }
      }
    }
    net.snapSpecEnds(specs, 9);
    return specs;
  }

  const gateSquares = [];
  function buildInner(side) {
    const east = side === 'east', encl = east ? 'innerEast' : 'innerWest';
    const wallLine = world.innerWalls[side].innerLine;
    const base = G.make(world.enclosures[encl], null);
    const isWall = base.p.map((a, i) => { const b = base.p[(i + 1) % base.p.length]; return M.distToPolyline(a[0], a[1], wallLine) < 2 && M.distToPolyline(b[0], b[1], wallLine) < 2 && M.distToPolyline((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, wallLine) < 2; });
    // the lane inside the wall (houses stand back about 30 m: Curtius 5.1.26) and the street behind the quay
    const inside = (pl) => { const q = pl[Math.floor(pl.length / 2)]; return M.pointInPolygon(q[0], q[1], world.enclosures[encl]); };
    const wl = east ? wallLine.slice(1) : wallLine;
    let wallPl = M.offsetPolyline(wl, 22.5); if (!inside(wallPl)) wallPl = M.offsetPolyline(wl, -22.5);
    const wallRec = addStreet({ id: 'wallLane:' + side, name: 'lane inside the city wall', cls: 'lane', polyline: wallPl, width: 6, src: 'derived', conjectural: true, level: 2 });
    const quay = world.river.quays.find((q) => (east ? /Nebuchadnezzar quay/.test(q.name) : /west bank quay/.test(q.name))).polyline;
    const qOff = east ? 8.5 : 16;
    const mkQuay = (pl, id) => { let o = M.offsetPolyline(pl, qOff); if (!inside(o)) o = M.offsetPolyline(pl, -qOff); return addStreet({ id, name: east ? 'quay street' : 'bank street', cls: 'lane', polyline: o, width: 5, src: 'derived', conjectural: true, level: 2 }); };
    const quayRec = east ? mkQuay(quay.slice(6), 'quayLane:east:south') : mkQuay(quay, 'quayLane:west');
    if (east) {
      mkQuay(quay.slice(1, 4), 'quayLane:east:north');
      // beside the precinct the quay street exists only where the wall leaves room for it (from about z = -25 to the bridge)
      const a = quay[4], b = quay[5], k = 0.38, pl = [[a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], b];
      let o = M.offsetPolyline(pl, 7); if (!inside(o)) o = M.offsetPolyline(pl, -7);
      addStreet({ id: 'quayLane:east:precinct', name: 'quay street', cls: 'lane', polyline: o, width: 4, src: 'derived', conjectural: true, level: 2 });
    }
    const wallTag = { k: 'street', st: wallRec, hw: 4, line: { junctions: [], rec: wallRec } }, bankTag = { k: 'street', st: quayRec, hw: 0.5, line: { junctions: [], rec: quayRec } };
    base.t = isWall.map((w) => (w ? wallTag : bankTag));
    const P0 = G.inset(base, isWall.map((w) => (w ? 26 : east ? 11 : 20)));
    // open strip inside the wall
    const sr = root.fork('strip:' + side);
    for (let i = 0; i < base.p.length; i++) {
      if (!isWall[i]) continue;
      const a = base.p[i], b = base.p[(i + 1) % base.p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l, nx = -dz, nz = dx;
      for (let s = 30; s < l - 60;) {
        const len = sr.range(70, 120), e = Math.min(l - 30, s + len), mx = a[0] + dx * (s + e) / 2, mz = a[1] + dz * (s + e) / 2;
        if (!world.innerWalls.gates.some((g) => Math.hypot(g.x - mx, g.z - mz) < 45 + (e - s) / 2) && !W.monumentAt(mx + nx * 12, mz + nz * 12) && !(east && mx < 420 && mz < -600)) {
          const q = sr.next();
          const [kind, use] = q < 0.66 ? ['lot', 'wallStrip'] : q < 0.8 ? ['garden', 'vegetable'] : q < 0.89 ? ['lot', 'rubbish'] : q < 0.95 ? ['lot', 'brickPit'] : ['palmGrove', 'palms'];
          addOpen([[a[0] + dx * s + nx * 5, a[1] + dz * s + nz * 5], [a[0] + dx * e + nx * 5, a[1] + dz * e + nz * 5], [a[0] + dx * e + nx * 19, a[1] + dz * e + nz * 19], [a[0] + dx * s + nx * 19, a[1] + dz * s + nz * 19]], kind, use);
        }
        s = e + sr.range(0, 14);
      }
    }
    // squares inside the gates and at the main crossings
    const localCut = [];
    for (const g of world.innerWalls.gates) {
      if (!!g.monumentId || (W.enclosureAt(g.x - M.azToDir(g.facingDeg)[0] * 50, g.z - M.azToDir(g.facingDeg)[1] * 50) !== encl)) continue;
      const d = M.azToDir(g.facingDeg), cx = g.x - d[0] * 44, cz = g.z - d[1] * 44;
      const ring = M.openRing(M.rectRing(cx, cz, 38, 30, g.facingDeg));
      localCut.push(addCutter(ring, {}));
      const sq = addOpen(ring, 'square', 'gate'); sq.gate = g.name; gateSquares.push(sq);
    }
    const crossings = east ? [[140, 440, 15, 'crossing'], [103, 196, 13, 'crossing'], [-150, 176, 14, 'bridgehead'], [352, 18, 13, 'forecourt']] : [[-385, 131, 16, 'crossing'], [-300, 134, 14, 'bridgehead'], [-362, 660, 13, 'crossing']];
    for (const [x, z, r, use] of crossings) {
      // a small square where two main streets meet: its sides follow the streets, so the blocks lose a corner each
      let rot = 0, bd = 60;
      for (const s of streets) { if (s.cls !== 'main' && s.cls !== 'processional') continue; const hit = M.nearestOnPolyline(x, z, s.polyline); if (hit.dist < bd) { bd = hit.dist; rot = M.mod(Math.atan2(hit.dir[1], hit.dir[0]) * M.RAD + 45, 90) - 45; } }
      const ring = M.openRing(M.rectRing(x, z, 2 * r, 2 * r, rot));
      addCutter(ring, {}); addOpen(ring, 'square', use);
    }
    if (east) {
      addOpen([[-10, -586], [27, -577], [60, -690], [38, -700]], 'garden', 'palace');                               // probable garden west of the South Palace (R5 4.3)
      const eg = [[-146, 236], [-104, 240], [-103, 398], [-138, 402]];
      addCutter(eg, {}); addOpen(eg, 'garden', 'temple');                                                             // river-bank gardens of Ea's temple
      const fc = monument('ishtarAgadeTemple').dims.forecourt;
      if (fc) addOpen(M.openRing(fc.polygon), 'square', 'forecourt');
    }

    const specs = specsFor(side), regions = [], cells = [];
    net.resolveFixed(net.region(P0, [], 1), specs, regions);
    // an excavated street is recorded as it was laid: ends put on the street they meet, short stubs beyond a crossing dropped
    for (const sp of specs) {
      if (!sp.rec || !/^merkes\d/.test(sp.id) || !sp.laid.length) continue;
      const lo = Math.min(...sp.laid.map((q) => q[0])), hi = Math.max(...sp.laid.map((q) => q[1]));
      const a = M.pointAlong(sp.pl, lo), b = M.pointAlong(sp.pl, hi), pl = [[a.x, a.z]];
      const keep = [0];
      for (let i = 1; i + 1 < sp.pl.length; i++) if (sp.ch[i] > lo + 0.3 && sp.ch[i] < hi - 0.3) { pl.push(sp.pl[i]); keep.push(i); }
      pl.push([b.x, b.z]); keep.push(sp.pl.length - 1);
      const r = sp.rec;
      if (r.widths) r.widths = keep.map((i) => r.widths[i]);
      if (r.levels) r.levels = keep.map((i) => r.levels[i]);
      r.polyline = pl; r.length = M.polylineLength(pl); r.bb = M.bbox(pl);
    }
    stat.regions += regions.length;
    for (const r of regions) net.gridSplit(r, 0, cells);
    stat.cells += cells.length;
    // temple forecourts: open ground between a temple front and the street it faces (a known entrance side, else the nearest street)
    for (const m of world.monuments) {
      const fp = M.openRing(m.footprint.polygon), mc = G.centroid(fp);
      if (Math.abs(M.polygonArea(fp)) > 9000 || !/temple/.test(m.kind || '') || W.enclosureAt(mc[0], mc[1]) !== encl || (m.dims && m.dims.forecourt)) continue;
      const ent = String((m.dims && m.dims.entrance) || '');
      let want = /\beast\b/i.test(ent) ? [1, 0] : /\b(N|NNW|north)\b/i.test(ent) ? [0, -1] : null, dist = 12;
      if (!want) {
        let best = null;
        for (const st of streets) { if (!M.inBBox(st.bb, mc[0], mc[1], 90)) continue; const hit = M.nearestOnPolyline(mc[0], mc[1], st.polyline); if (!best || hit.dist - st.width / 2 < best.d) best = { d: hit.dist - st.width / 2, hit }; }
        if (!best) continue;
        want = [best.hit.x - mc[0], best.hit.z - mc[1]];
      }
      const ring = G.make(fp, null).p; let e = 0, bv = -Infinity;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, v = ((b[1] - a[1]) / l) * want[0] + (-(b[0] - a[0]) / l) * want[1]; if (v > bv) { bv = v; e = i; } }
      const a = ring[e], b = ring[(e + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ox = (b[1] - a[1]) / l, oz = -(b[0] - a[0]) / l;
      const fc = [a, b, [b[0] + ox * dist, b[1] + oz * dist], [a[0] + ox * dist, a[1] + oz * dist]];
      addCutter(fc, { kind: 'square' }); const sq = addOpen(G.hull(fc), 'square', 'forecourt'); sq.monument = m.id;
    }
    // small landings where a street comes out on the river front
    for (const j of bankTag.line.junctions) {
      if (hash2(Math.round(j[0]), Math.round(j[1]), 77) > 0.45 || W.monumentAt(j[0], j[1])) continue;
      const hit = M.nearestOnPolyline(j[0], j[1], quay), q = M.rectRing(j[0], j[1], 15, 18, Math.atan2(hit.dir[1], hit.dir[0]) * M.RAD);
      addCutter(q, { kind: 'square' }); addOpen(M.openRing(q), 'square', 'quay');
    }
    for (const cell of cells) {
      const b = G.inset(cell, (t) => (t ? t.hw : 0));
      if (!b || G.area(b.p) < 30) continue;
      let pieces = [b];
      const bb = G.bbox(b.p);
      for (const cut of cutters) {
        if (!G.bbOverlap(cut.bb, bb, 0.5)) continue;
        const next = [];
        for (const pc of pieces) for (const q of G.difference(pc, cut.ring, cut.tag, PARTY)) next.push(q);
        pieces = next;
        if (!pieces.length) break;
      }
      const cellA = G.area(cell.p); let sumA = 0; for (const pc of pieces) sumA += G.area(pc.p);
      for (const pc of pieces) {
        const a = G.area(pc.p);
        if (a < 12) continue;
        const c = G.centroid(pc.p);
        const nearWall = M.distToPolyline(c[0], c[1], wallLine) < 95;
        buildBlock(G.simplify(pc), { enclosure: encl, nearWall, gross: Math.min(cellA, a * 1.6) * (pieces.length > 1 ? a / sumA : 1) });
        stat.innerBlocks++;
      }
    }
  }

  // landmark houses first: stable ids 0..4, the Great House is houses[0]
  for (const { lh, ring } of landmarkLots) {
    const c = G.centroid(ring), prm = paramsAt(c[0], c[1]), d = W.districtAt(c[0], c[1]);
    const lot = G.make(ring, null), n = lot.p.length;
    const mid = (i) => [(lot.p[i][0] + lot.p[(i + 1) % n][0]) / 2, (lot.p[i][1] + lot.p[(i + 1) % n][1]) / 2];
    // sides: which edges face a given street (the fabric closes in on the others)
    lot.t = lot.p.map((a, i) => {
      const [mx, mz] = mid(i);
      let best = null;
      for (const s of streets) {
        if (s.cls === 'road' || s.src === 'generated') continue;
        const hit = M.nearestOnPolyline(mx, mz, s.polyline), reach = s.width / 2 + (s.cls === 'processional' ? 13 : 9);
        if (hit.dist < reach && (!best || hit.dist < best.d)) best = { d: hit.dist, s };
      }
      return best ? { k: 'street', st: best.s, hw: 0 } : PARTY;
    });
    // the doors that are known (R5 4.1): Great House north on the angle lane, House VI north on Untere Tempelstrasse,
    // the shop house west on the open strip of the Processional Way, the New Town house north
    const edgeToward = (dx, dz) => { let e = 0, b = -Infinity; for (let i = 0; i < n; i++) { const m = mid(i), v = (m[0] - c[0]) * dx + (m[1] - c[1]) * dz; if (v > b) { b = v; e = i; } } return e; };
    const west = /shops/.test(lh.name), doorSide = west ? edgeToward(-1, 0) : edgeToward(0, -1);
    if (/Great House/.test(lh.name)) lot.t = lot.t.map((t, i) => (i === doorSide ? { k: 'street', st: streetById.get('merkes:winkelgasse') || { id: 'merkes:winkelgasse', cls: 'alley' }, hw: 0 } : t.k === 'street' ? { k: 'open', st: t.st, hw: 0 } : t));
    if (/New Town/.test(lh.name)) { const so = edgeToward(0, 1); lot.t = lot.t.map((t, i) => (i === doorSide ? { k: 'street', st: { id: 'newtown:north', cls: 'alley' }, hw: 0 } : i === so ? { k: 'street', st: { id: 'newtown:south', cls: 'alley' }, hw: 0 } : t)); }
    const side = Math.sqrt(lh.areaM2), gh = heightAt(c[0], c[1]);
    // a floor never lies below the ground model (House VI: +5.4 in world.json, the street beside it +5.0 to +5.3)
    const floor = lh.floorLevel !== undefined ? (lh.roofLevel !== undefined ? lh.floorLevel : Math.max(lh.floorLevel, gh + 0.1, H.groundSpan(lot.p, c).max + 0.1)) : undefined;
    // The Great House is built to its plan (SPEC 3.15) and has the stepped roof of a great house (R5 3.1), in three
    // levels: the east range, on which the rooftop camera of shot 8 stands, carries the recorded roof (+15.2); the
    // main-room range south of the court stands 6.4 m high (+13.4); the north range and the west part, with the
    // two lesser courts of the house (House III had three courts: R5 2.1; their positions are not in world.json),
    // are an ordinary 4.6 m (+11.6), so the main room is 1.8 m higher than the ordinary ranges. From the east
    // range one therefore looks across the court and OVER the rest of the house to the roofs of Merkes and to
    // Etemenanki; with one roof level the house itself hid everything below 1.2 degrees under the horizon.
    let courtsFixed = lh.court ? [M.closeRing(lh.court.polygon)] : undefined, partsFixed = null;
    if (lh.court && lh.roofLevel !== undefined && floor !== undefined) {
      const ct = M.openRing(lh.court.polygon), cc = G.centroid(ct), E = {};
      for (let i = 0; i < ct.length; i++) {
        const a = ct[i], b = ct[(i + 1) % ct.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        let nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;
        if ((cc[0] - a[0]) * nx + (cc[1] - a[1]) * nz > 0) { nx = -nx; nz = -nz; }                                  // outward normal of this court side
        E[Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 'e' : 'w') : (nz > 0 ? 's' : 'n')] = { p: a, nx, nz };
      }
      const half = (poly, e, sign) => (poly && e ? G.clip(poly, e.p[0], e.p[1], e.nx * sign, e.nz * sign, 0, null) : null);
      const whole = G.make(ring, null), between = half(half(whole, E.e, -1), E.w, -1);
      const east = half(whole, E.e, 1), westPart = half(whole, E.w, 1), south = half(between, E.s, 1), north = half(between, E.n, 1);
      if (east && westPart && south && north) {
        const low = floor + 4.6, mainTop = Math.min(lh.roofLevel - 1.2, floor + 6.4), rot = lh.court.rotationDeg ?? 15.5, wc = G.centroid(westPart.p), nN = [Math.sin(rot * M.DEG), -Math.cos(rot * M.DEG)];
        const lesser = [];
        for (const [along, w, dp] of [[9.6, 7.4, 8.4], [-9.2, 6.4, 6.4]]) {
          for (let k = 1; k > 0.55; k *= 0.88) {
            const q = M.rectRing(wc[0] + nN[0] * along, wc[1] + nN[1] * along, w * k, dp * k, rot);
            if (M.openRing(q).every((v) => M.signedDistToPolygon(v[0], v[1], G.ring(westPart.p)) < -2.6)) { lesser.push(G.ring(M.openRing(q))); break; }
          }
        }
        courtsFixed = [courtsFixed[0], ...lesser];
        partsFixed = [
          { polygon: G.ring(east.p), holes: [], level: lh.roofLevel, kind: 'main', name: 'east range' },
          { polygon: G.ring(south.p), holes: [], level: mainTop, kind: 'wing', name: 'main-room range' },
          { polygon: G.ring(north.p), holes: [], level: low, kind: 'wing', name: 'north range' },
          { polygon: G.ring(westPart.p), holes: lesser, level: low, kind: 'wing', name: 'west part' },
        ];
      }
    }
    const lmHouse = addHouse(lot, {
      prm: { ...prm, sawToothShare: 1, whitewashShare: 1, tree: 0 }, blockId: null, district: d ? d.name : null, enclosure: W.enclosureAt(c[0], c[1]), hero: true,
      fixed: {
        name: lh.name, rotationDeg: 15.5, cls: lh.areaM2 >= 950 ? 'mansion' : lh.areaM2 >= 400 ? 'large' : 'medium', doorSide,
        toothLength: /Great House/.test(lh.name) ? 1.3 : undefined,       // about 30 teeth on the 39 m east wall (Koldewey fig. 236)
        groundLevel: floor, roofLevel: lh.roofLevel ?? (floor !== undefined ? floor + (side > 30 ? 7.4 : side > 20 ? 5.4 : 4.3) : undefined),
        courts: courtsFixed, whitewashed: true,
      },
    });
    if (partsFixed) Object.defineProperty(lmHouse, '_roofParts', { value: partsFixed.map((q) => ({ ...q, parapet: lmHouse.parapet })), enumerable: false });
  }
  buildInner('east');
  buildInner('west');
  const nInnerGen = houses.length;
  // generated streets end where they meet a monument, the palace quarter or a landmark house; the lane inside
  // the wall is interrupted at the gates (the gate building and its square stand there)
  const gateRings = world.innerWalls.gates.map((g) => { const ring = M.openRing(M.rectRing(g.x, g.z, (g.width || 28) + 14, 62, g.facingDeg)); return { ring: G.make(ring, null).p, bb: G.bbox(ring), kind: 'gate' }; });
  const clipStreets = (from) => {
   for (let k = streets.length - 1; k >= from; k--) {
    const s = streets[k];
    if (s.src === 'world' || s.cls === 'road' || /^merkes:/.test(s.id)) continue;
    let parts = [s.polyline];
    for (const cut of /^wallLane/.test(s.id) ? [...cutters, ...gateRings] : cutters) {
      if (cut.kind === 'square' || cut.kind === 'open' || !G.bbOverlap(cut.bb, s.bb, 0.5)) continue;
      const next = [];
      for (const pl of parts) {
        const inside = G.polylinePieces({ p: cut.ring }, pl, 0.05);
        if (!inside.length) { next.push(pl); continue; }
        const ch = M.chainage(pl), L = ch[ch.length - 1]; let from = 0;
        const sub = (a, b) => { if (b - a < (s.src === 'derived' ? 12 : 4)) return; const pa = M.pointAlong(pl, a), pb = M.pointAlong(pl, b), out = [[pa.x, pa.z]]; for (let i = 1; i + 1 < pl.length; i++) if (ch[i] > a + 0.3 && ch[i] < b - 0.3) out.push(pl[i]); out.push([pb.x, pb.z]); next.push(out); };
        for (const pc of inside) { sub(from, pc.s0); from = pc.s1; }
        sub(from, L);
      }
      parts = next;
      if (!parts.length) break;
    }
    if (parts.length === 1 && parts[0] === s.polyline) continue;
    if (!parts.length) { streets.splice(k, 1); streetById.delete(s.id); s.removed = true; continue; }
    parts.sort((a, b) => M.polylineLength(b) - M.polylineLength(a));
    s.polyline = parts[0]; s.length = M.polylineLength(parts[0]); s.bb = M.bbox(parts[0]);
    for (let q = 1; q < parts.length; q++) addStreet({ id: s.id + ':' + q, name: s.name, cls: s.cls, polyline: parts[q], width: s.width, src: s.src, conjectural: s.conjectural, level: s.level, blind: s.blind });
   }
  };
  clipStreets(0);
  /**
   * Generated streets do not run into water: a lane that meets the canal ends at the top of its bank, the lanes
   * of a suburb patch end at the river or moat bank (the patches are laid out blind and only their houses were
   * checked). Dry runs shorter than 10 m are dropped. Given streets (bridges, culverts) are left alone.
   */
  const wetAt = (x, z) => {
    if (wetPoint(x, z)) return true;
    if (canalCorridor && M.inBBox(canalCorridor.bb, x, z, 26)) { const hit = M.nearestOnPolyline(x, z, canalCorridor.pl); if (hit.dist < canalCorridor.hw[Math.min(hit.i, canalCorridor.hw.length - 1)] - 1.5) return true; }
    return false;
  };
  const clipWet = (from) => {
    for (let k = streets.length - 1; k >= from; k--) {
      const s = streets[k];
      if (s.src === 'world' || s.cls === 'road') continue;
      // (the lanes inside the wall and behind the quay end at the river or moat bank; they may cross the canal)
      const derived = s.src === 'derived', open = (x, z) => { const c = ground.zoneCode(x, z); return ground.isWater(x, z) && (c === ZC.RIVER || c === ZC.MOAT); };
      const pl = s.polyline, ch = M.chainage(pl), Ls = ch[ch.length - 1], n = Math.max(2, Math.ceil(Ls / 2.5)), runs = [];
      let start = null, wet = 0;
      for (let i = 0; i <= n; i++) {
        const sAt = Ls * i / n, q = M.pointAlong(pl, sAt), w = derived ? open(q.x, q.z) : wetAt(q.x, q.z);
        if (w) wet++;
        if (!w && start === null) start = sAt;
        if (w && start !== null) { runs.push([start, Ls * (i - 1) / n]); start = null; }
      }
      if (!wet) continue;
      if (start !== null) runs.push([start, Ls]);
      stat.wetStreets++;
      const keep = runs.filter((q) => q[1] - q[0] >= 10).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
      if (!keep.length) { streets.splice(k, 1); streetById.delete(s.id); s.removed = true; continue; }
      const sub = (a, b) => { const pa = M.pointAlong(pl, a), pb = M.pointAlong(pl, b), out = [[pa.x, pa.z]]; for (let i = 1; i + 1 < pl.length; i++) if (ch[i] > a + 0.3 && ch[i] < b - 0.3) out.push(pl[i]); out.push([pb.x, pb.z]); return out; };
      const first = sub(keep[0][0], keep[0][1]);
      for (let q = 1; q < keep.length; q++) addStreet({ id: s.id + ':w' + q, name: s.name, cls: s.cls, polyline: sub(keep[q][0], keep[q][1]), width: s.width, src: s.src, conjectural: s.conjectural, level: s.level, blind: s.blind });
      s.polyline = first; s.length = M.polylineLength(first); s.bb = M.bbox(first);
    }
  };
  clipWet(0);
  const nInnerStreets = streets.length;

  // =================================================================================================
  // outside the inner walls: suburbs of the outer city, ribbons along the roads, villages
  // =================================================================================================
  const overlapsHouse = (pts) => {
    const c = G.centroid(pts); let rad = 0; for (const q of pts) rad = Math.max(rad, Math.hypot(q[0] - c[0], q[1] - c[1]));
    const R = rad + maxRad + 1;
    for (let cz = Math.floor((c[1] - R) / CELL); cz <= Math.floor((c[1] + R) / CELL); cz++) for (let cx = Math.floor((c[0] - R) / CELL); cx <= Math.floor((c[0] + R) / CELL); cx++) {
      const a = index.get(cellKey(cx, cz)); if (!a) continue;
      for (const h of a) if (Math.hypot(h.center[0] - c[0], h.center[1] - c[1]) < rad + 0.5 * Math.hypot(h.size[0], h.size[1]) + 0.5 && G.overlaps(pts, h.footprint.slice(0, -1))) return true;
    }
    return false;
  };
  const onReserved = (pts) => { const bb = G.bbox(pts); for (const c of cutters) if (c.kind !== 'square' && G.bbOverlap(c.bb, bb, 2) && G.overlaps(pts, c.ring)) return true; return false; };
  const outer = buildOuter({ onReserved, ctx, world, W, M, G, root, net, paramsAt, addStreet, streets, streetById, buildBlock, addOpen, addHouse, inReserved, villages, houses, RURAL, EDGE, OPEN, PARTY, overlapsHouse, housesNearRaw: (x, z, r) => { for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) { const a = index.get(cellKey(cx, cz)); if (a) for (const h of a) if (Math.hypot(h.center[0] - x, h.center[1] - z) < r) return true; } return false; } });

  clipStreets(nInnerStreets);
  clipWet(nInnerStreets);
  // no roof, raised range or parapet rises above the `fabricTopLevel` of its district: the camera path of
  // world.json was validated against that level (tools/validate_world.py), so the fabric must stay below it
  const fabricTop = new Map(world.districts.map((d) => [d.name, d.fabricTopLevel]));
  for (const h of houses) {
    const cap = fabricTop.get(h.district);
    if (cap === undefined || h.landmark) continue;
    let over = h.roofLevel + h.mainRaise + h.parapet - cap;
    if (over <= 0) continue;
    const cut = Math.min(h.mainRaise, over); h.mainRaise -= cut; over -= cut;
    if (over > 0) { h.roofLevel = Math.max(h.groundLevel + 3, h.roofLevel - over); h.wallHeight = h.roofLevel - h.groundLevel; }
    stat.capped++;
  }
  // nothing within 320 m of a roof the camera stands on rises above that roof (shot 8 looks over the roofs to Etemenanki)
  for (const sh of world.shots.list) {
    if (!sh.onRoofOf) continue;
    const base = houses.find((h) => h.landmark === sh.onRoofOf); if (!base) continue;
    const cap = base.roofLevel - 0.3;
    for (const h of houses) {
      if (h === base || Math.hypot(h.center[0] - base.center[0], h.center[1] - base.center[1]) > 320) continue;
      let over = h.roofLevel + h.mainRaise + h.parapet - cap;
      if (over <= 0) continue;
      const cut = Math.min(h.mainRaise, over); h.mainRaise -= cut; over -= cut;
      if (over > 0) { h.roofLevel = Math.max(h.groundLevel + 3, h.roofLevel - over); h.wallHeight = h.roofLevel - h.groundLevel; }
    }
    base.mainRaise = 0;
  }

  // =================================================================================================
  // indices
  // =================================================================================================
  const alive = (h) => !h.removed;
  const sIndex = new Map();
  let maxHalf = 0;
  function indexStreet(s) {
    const pl = s.polyline, hw = (s.widths ? Math.max(...s.widths) : s.width) / 2;
    if (hw > maxHalf) maxHalf = hw;
    s.ch = M.chainage(pl);
    for (let i = 0; i + 1 < pl.length; i++) {
      const a = pl[i], b = pl[i + 1];
      const c0 = Math.floor(Math.min(a[0], b[0]) / CELL), c1 = Math.floor(Math.max(a[0], b[0]) / CELL), d0 = Math.floor(Math.min(a[1], b[1]) / CELL), d1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      if ((c1 - c0 + 1) * (d1 - d0 + 1) > 64) {
        // a long segment: walk it
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.5)); let last = null;
        for (let k = 0; k <= n; k++) { const key = cellKey(Math.floor((a[0] + (b[0] - a[0]) * k / n) / CELL), Math.floor((a[1] + (b[1] - a[1]) * k / n) / CELL)); if (key === last) continue; last = key; let arr = sIndex.get(key); if (!arr) sIndex.set(key, (arr = [])); arr.push(s, i); }
        continue;
      }
      for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) { const key = cellKey(cx, cz); let arr = sIndex.get(key); if (!arr) sIndex.set(key, (arr = [])); arr.push(s, i); }
    }
  }
  for (const s of streets) indexStreet(s);
  // a door that opens on open ground (a square, the lane round a temple, an estate garden) still belongs to a street
  for (const h of houses) {
    if (!h.street || !streetById.has(h.street)) { const st = nearestStreetRaw(h.door[0], h.door[1], 60) || (h.estate ? nearestStreet(h.door[0], h.door[1], 400) : null); if (st) h.street = st.street ? st.street.id : st.id; }
    else if (/^(wallLane|quayLane)/.test(h.street)) { const st = nearestStreetRaw(h.door[0], h.door[1], 30); if (st) h.street = st.id; }   // the piece of the lane it stands on
  }

  function streetHit(s, i, x, z) {
    const a = s.polyline[i], b = s.polyline[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    return { d: Math.hypot(x - px, z - pz), t, px, pz };
  }
  function finishHit(s, i, t, px, pz, x, z, dist) {
    const a = s.polyline[i], b = s.polyline[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const side = dir[0] * (z - pz) - dir[1] * (x - px) >= 0 ? 1 : -1;
    const lerpV = (arr) => M.lerp(arr[i], arr[Math.min(i + 1, arr.length - 1)], t);
    return { x: px, z: pz, street: s, s: s.ch[i] + len * t, dist, dir, side, width: s.widths ? lerpV(s.widths) : s.width, level: s.levels ? lerpV(s.levels) : ground.height(px, pz) };
  }
  function nearestStreetRaw(x, z, maxDist) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); let best = null, bd = maxDist;
    for (let iz = cz - 1; iz <= cz + 1; iz++) for (let ix = cx - 1; ix <= cx + 1; ix++) {
      const arr = sIndex.get(cellKey(ix, iz)); if (!arr) continue;
      for (let k = 0; k < arr.length; k += 2) { const d = streetHit(arr[k], arr[k + 1], x, z).d; if (d < bd) { bd = d; best = arr[k]; } }
    }
    return best;
  }
  function nearestStreet(x, z, maxDist = Infinity, cls = null) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), maxRing = Math.ceil(Math.min(maxDist, 2600) / CELL) + 1;
    let best = null, bd = maxDist;
    const visit = (ix, iz) => {
      const arr = sIndex.get(cellKey(ix, iz)); if (!arr) return;
      for (let k = 0; k < arr.length; k += 2) {
        const s = arr[k]; if (cls && s.cls !== cls) continue;
        const h = streetHit(s, arr[k + 1], x, z);
        if (h.d <= bd) { bd = h.d; best = { s, i: arr[k + 1], h }; }
      }
    };
    for (let ring = 0; ring <= maxRing; ring++) {
      if (ring === 0) visit(cx, cz);
      else {
        for (let k = -ring; k <= ring; k++) { visit(cx + k, cz - ring); visit(cx + k, cz + ring); }
        for (let k = -ring + 1; k < ring; k++) { visit(cx - ring, cz + k); visit(cx + ring, cz + k); }
      }
      if (best && bd <= ring * CELL) break;
    }
    if (!best && maxDist > 2600) {
      for (const s of streets) {
        if (cls && s.cls !== cls) continue;
        if (!M.inBBox(s.bb, x, z, bd)) continue;
        for (let i = 0; i + 1 < s.polyline.length; i++) { const h = streetHit(s, i, x, z); if (h.d <= bd) { bd = h.d; best = { s, i, h }; } }
      }
    }
    return best ? finishHit(best.s, best.i, best.h.t, best.h.px, best.h.pz, x, z, best.h.d) : null;
  }

  function housesNear(x, z, r) {
    const out = [], R = r + maxRad, c0 = Math.floor((x - R) / CELL), c1 = Math.floor((x + R) / CELL), d0 = Math.floor((z - R) / CELL), d1 = Math.floor((z + R) / CELL);
    for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
      const a = index.get(cellKey(cx, cz)); if (!a) continue;
      for (const h of a) if (alive(h) && Math.hypot(h.center[0] - x, h.center[1] - z) <= r + 0.5 * Math.hypot(h.size[0], h.size[1])) out.push(h);
    }
    return out;
  }
  function houseAt(x, z) {
    for (const h of housesNear(x, z, 0.5)) if (M.pointInPolygon(x, z, h.footprint)) return h;
    return null;
  }

  // pools for randomStreetPoint: segments by district and class, with cumulative lengths
  const pools = new Map();
  let segDistrict = null;
  function pool(district, cls) {
    const key = (district || '*') + '|' + (cls || '*');
    let p = pools.get(key); if (p) return p;
    if (district && !segDistrict) {
      segDistrict = new Map();
      for (const s of streets) { const arr = []; for (let i = 0; i + 1 < s.polyline.length; i++) { const d = W.districtAt((s.polyline[i][0] + s.polyline[i + 1][0]) / 2, (s.polyline[i][1] + s.polyline[i + 1][1]) / 2); arr.push(d ? d.name : null); } segDistrict.set(s, arr); }
    }
    const segs = [], cum = []; let total = 0;
    for (const s of streets) {
      if (cls && s.cls !== cls) continue;
      const dn = district ? segDistrict.get(s) : null;
      for (let i = 0; i + 1 < s.polyline.length; i++) {
        if (district && dn[i] !== district) continue;
        const l = s.ch[i + 1] - s.ch[i]; if (l <= 0) continue;
        total += l; segs.push(s, i); cum.push(total);
      }
    }
    p = { segs, cum, total }; pools.set(key, p);
    return p;
  }

  // canals and walls: lines nothing may be scattered on (isFree)
  const barriers = [];
  for (const c of world.canals) barriers.push({ pl: c.polyline, half: Math.max(c.width || 10, c.widthEastOfPW || 0) / 2 + 0.5, bb: M.bbox(c.polyline) });
  for (const side of ['east', 'west']) {
    const iw = world.innerWalls[side], pr = world.innerWalls.profile;
    barriers.push({ pl: iw.innerLine, half: pr.imgurEnlil.thickness / 2 + 0.6, bb: M.bbox(iw.innerLine) }, { pl: iw.outerLine, half: pr.nemettiEnlil.thickness / 2 + 0.6, bb: M.bbox(iw.outerLine) });
  }
  barriers.push({ pl: world.outerWall.line, half: world.outerWall.profile.mudWall.thickness / 2 + 0.6, bb: M.bbox(world.outerWall.line) });
  if (world.outerWall.crossWall) barriers.push({ pl: world.outerWall.crossWall.polyline, half: world.outerWall.crossWall.thickness / 2 + 0.6, bb: M.bbox(world.outerWall.crossWall.polyline) });

  // =================================================================================================
  // the subsystem object
  // =================================================================================================
  const lampK = { court: [0.55, 0.21], roof: [0.18, 0.03], door: 0.045 };
  const layout = {
    impl: 'real',
    /** Street[]: { id, name, cls, polyline, width, widths|null, levels|null, length, bb, src, conjectural } + { level, blind, district } */
    streets,
    /** Block[]: { id, polygon (closed ring), district, streets: id[], houses: id[], area } + { kind: 'built'|'open', enclosure, center } */
    blocks,
    /** House[] (ENGINE.md 5.8, additions in docs/layout.md). Final once build() begins: never mutate records. */
    get houses() { return finalHouses || (finalHouses = houses.filter(alive)); },
    /** OpenSpace[]: { id, kind: 'garden'|'lot'|'square'|'palmGrove', polygon, center, district } + { use, area, blockId } */
    openSpaces,
    /** Village[]: { id, x, z, houses: id[], dir: [dx, dz] } + { lane: street id } */
    villages,
    /** Reserved[]: { id, polygon, owner, kind, margin } */
    reserved,
    districts: world.districts,
    archetypes: ARCHETYPES,
    houseById: (id) => (houses[id] && alive(houses[id]) ? houses[id] : null),
    streetById: (id) => streetById.get(id) || null,
    blockById: (id) => blocks[id] || null,
    housesNear, houseAt,
    housesInBox(minX, minZ, maxX, maxZ) {
      const out = [];
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
        const a = index.get(cellKey(cx, cz)); if (!a) continue;
        for (const h of a) if (alive(h) && h.center[0] >= minX && h.center[0] <= maxX && h.center[1] >= minZ && h.center[1] <= maxZ) out.push(h);
      }
      return out;
    },
    housesInDistrict: (name) => houses.filter((h) => alive(h) && h.district === name),
    /** Is this house record built in the current quality tier? (landmarks always; others by rank). EVERY module uses this rule. */
    isBuilt: (h) => !!h.landmark || h.rank < ctx.quality.density,
    /** Centre [x, z] of court i of a house (the floor of a court is at house.groundLevel). */
    courtCenter: (h, i = 0) => M.polygonCentroid(h.courts[Math.min(i, h.courts.length - 1)]),
    /** A point on the flat roof (y = roofLevel), at least `margin` m from the parapet and from every court: { x, y, z } or null. */
    roofPoint(h, rng, margin = 0.8) {
      const bb = M.bbox(h.footprint), parts = layout.roofParts(h);
      for (let i = 0; i < 40; i++) {
        const x = M.lerp(bb[0], bb[2], rng.next()), z = M.lerp(bb[1], bb[3], rng.next());
        if (!M.pointInPolygon(x, z, h.footprint) || M.distToRing(x, z, h.footprint) < margin) continue;
        if (h.courts.some((c) => M.pointInPolygon(x, z, c) || M.distToRing(x, z, c) < margin)) continue;
        if (parts.length === 1) return { x, y: h.roofLevel, z };
        // a roof of several levels: the level of the part the point lies on, clear of the step to the next part
        const part = parts.find((q) => M.pointInPolygon(x, z, q.polygon));
        if (!part || M.distToRing(x, z, part.polygon) < margin) continue;
        return { x, y: part.level, z };
      }
      return null;
    },
    /**
     * The night lamps of a house: [{ x, y, z, kind: 'court' | 'roof' | 'door', seed }] (0 to 2; most houses: none).
     * Pure. court: 0.9 m above the court floor; roof: 0.4 m above the roof; door: door spill in the lane.
     */
    lampsFor(h) {
      const out = [], q = (k) => hash2(h.seed & 0xffff, h.seed >>> 16, k), big = h.cls === 'large' || h.cls === 'mansion' || !!h.landmark;
      if (q(31) < lampK.court[big ? 0 : 1]) {
        const c = M.polygonCentroid(h.courts[0]), bb = M.bbox(h.courts[0]), j = Math.min(0.6, 0.18 * Math.min(bb[2] - bb[0], bb[3] - bb[1]));
        out.push({ x: c[0] + (q(32) - 0.5) * 2 * j, y: h.groundLevel + 0.9, z: c[1] + (q(33) - 0.5) * 2 * j, kind: 'court', seed: (h.seed ^ 0x9e3779b9) >>> 0 });
      }
      if (q(34) < lampK.roof[big ? 0 : 1]) {
        const p = layout.roofPoint(h, new Rng(h.seed ^ 0x51ed27), 1.0);
        if (p) out.push({ x: p.x, y: p.y + 0.4, z: p.z, kind: 'roof', seed: (h.seed ^ 0x7f4a7c15) >>> 0 });
      }
      if (out.length < 2 && q(35) < lampK.door) out.push({ x: h.door[0] + h.doorDir[0] * 0.6, y: h.groundLevel + 1.6, z: h.door[1] + h.doorDir[1] * 0.6, kind: 'door', seed: (h.seed ^ 0x2545f491) >>> 0 });
      return out;
    },
    /** Nearest point on the street net: { x, z, street, s, dist, dir, side, width, level } or null. opts: { maxDist, cls } */
    nearestStreetPoint(x, z, opts = {}) { return nearestStreet(x, z, opts.maxDist ?? Infinity, opts.cls || null); },
    /** Streets with a point within r metres of (x, z): [{ street, dist }] nearest first. */
    streetsNear(x, z, r) {
      const seen = new Map(), R = r, c0 = Math.floor((x - R) / CELL), c1 = Math.floor((x + R) / CELL), d0 = Math.floor((z - R) / CELL), d1 = Math.floor((z + R) / CELL);
      for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
        const arr = sIndex.get(cellKey(cx, cz)); if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) { const d = streetHit(arr[k], arr[k + 1], x, z).d; if (d <= r && (!seen.has(arr[k]) || d < seen.get(arr[k]))) seen.set(arr[k], d); }
      }
      return [...seen].map(([street, dist]) => ({ street, dist })).sort((a, b) => a.dist - b.dist);
    },
    /**
     * True if a disc of radius r at (x, z) touches no water, street, house footprint or reserved polygon
     * (and no canal, city wall or outer wall: nothing should be scattered on those either).
     */
    isFree(x, z, r = 0) {
      if (inReserved(x, z, r)) return false;
      for (const l of barriers) if (M.inBBox(l.bb, x, z, l.half + r) && M.distToPolyline(x, z, l.pl) < l.half + r) return false;
      const st = nearestStreet(x, z, r + maxHalf + 0.01);
      if (st && st.dist < st.width / 2 + r) return false;
      for (const h of housesNear(x, z, r)) if (M.pointInPolygon(x, z, h.footprint) || M.distToRing(x, z, h.footprint) < r) return false;
      if (ground.isWater(x, z) || (r > 0 && ground.shoreDistance(x, z) < r)) return false;
      return true;
    },
    /** Deterministic random point on a street: same shape as nearestStreetPoint (dist = lateral offset), or null. opts: { cls, lateral } */
    randomStreetPoint(district, rng, opts = {}) {
      const p = pool(district || null, opts.cls || null);
      if (!p.total) return null;
      const r = rng.next() * p.total; let lo = 0, hi = p.cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (p.cum[mid] < r) lo = mid + 1; else hi = mid; }
      const s = p.segs[lo * 2], i = p.segs[lo * 2 + 1], a = s.polyline[i], b = s.polyline[i + 1], len = s.ch[i + 1] - s.ch[i];
      const t = rng.next(), dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const width = s.widths ? M.lerp(s.widths[i], s.widths[Math.min(i + 1, s.widths.length - 1)], t) : s.width, lat = (rng.next() * 2 - 1) * (opts.lateral ?? 0.6) * width / 2;
      const x = a[0] + (b[0] - a[0]) * t - dir[1] * lat, z = a[1] + (b[1] - a[1]) * t + dir[0] * lat;
      return { x, z, street: s, s: s.ch[i] + len * t, dist: Math.abs(lat), dir, side: lat >= 0 ? 1 : -1, width, level: s.levels ? M.lerp(s.levels[i], s.levels[Math.min(i + 1, s.levels.length - 1)], t) : ground.height(x, z) };
    },
    /** Reserve ground (only in prepare()): houses the polygon (grown by margin) touches are removed. Returns the reservation id. */
    reserve(polygon, opts = {}) {
      if (frozen) throw new Error('layout.reserve: the layout is frozen (call reserve() in prepare(), not in build())');
      const r = addReserved(polygon, opts.owner || 'unknown', opts.kind || 'reserved', opts.margin || 0);
      const ring = M.openRing(r.polygon), grown = r.margin > 0 ? G.grow(G.hull(ring), r.margin) : null;
      const bb = grown ? G.bbox(grown) : r.bb;
      for (const h of layout.housesInBox(bb[0] - maxRad, bb[1] - maxRad, bb[2] + maxRad, bb[3] + maxRad)) {
        if (h.landmark) continue;
        const fp = h.footprint.slice(0, -1);
        if (G.overlaps(fp, ring) || (grown && G.overlaps(fp, grown) && fp.some((p) => M.pointInPolygon(p[0], p[1], r.polygon) || M.distToRing(p[0], p[1], r.polygon) < r.margin))) { h.removed = true; finalHouses = null; }
      }
      for (let i = openSpaces.length - 1; i >= 0; i--) { const o = openSpaces[i]; if (M.inBBox(bb, o.center[0], o.center[1]) && M.pointInPolygon(o.center[0], o.center[1], r.polygon)) openSpaces.splice(i, 1); }
      return r.id;
    },
    /** Called by the engine after every module's prepare(): house records are final from here on. */
    freeze() {
      if (frozen) return;
      frozen = true;
      for (const b of blocks) if (b.houses.length) b.houses = b.houses.filter((id) => alive(houses[id]));
      for (const v of villages) v.houses = v.houses.filter((id) => alive(houses[id]));
    },
    get frozen() { return frozen; },

    // ---- additions (docs/layout.md) -----------------------------------------------------------
    /** The street fronts of a house with their saw-tooth lines (see layout/house.js facade). Cached. */
    facade(h) { return h._facade || (Object.defineProperty(h, '_facade', { value: H.facade(h), enumerable: false })._facade); },
    /**
     * The raised main-room range of a house (R5 3.1: always on the south side of the court, 1 to 3 m higher than
     * the rest): { polygon (closed ring), raise (m above roofLevel) } or null for houses with one roof level.
     */
    mainRoom(h) {
      if (!(h.mainRaise > 0)) return null;
      const a = h.rotationDeg * M.DEG, sx = -Math.sin(a), sz = Math.cos(a);          // the house's south
      let far = -Infinity; for (const ct of h.courts) for (const q of ct) far = Math.max(far, q[0] * sx + q[1] * sz);       // south of every court
      const part = G.clip(G.make(h.footprint, null), 0, 0, sx, sz, far + 0.5, null);
      return part && G.area(part.p) > 6 ? { polygon: G.ring(part.p), raise: h.mainRaise, line: [sx, sz, far + 0.5] } : null;
    },
    /**
     * The roof of a house as parts that do not overlap and together cover the footprint less its courts:
     * [{ polygon (closed ring), holes: court rings inside this part, level (datum y of the roof), parapet, kind }]
     *   kind 'main'    the ordinary roof at house.roofLevel
     *        'raised'  the main-room range, at roofLevel + mainRaise (R5 3.1)
     *        'wing'    a lower part of a great house (only the Great House of Merkes: north range and west part)
     * Most houses have one part or two. Build the shell from THIS (walls of each part from the footing to
     * level + parapet, a roof at level): roofPoint, roofAnchors and the roof lamps stand on these levels. Cached.
     */
    roofParts(h) {
      if (h._roofParts) return h._roofParts;
      const mr = layout.mainRoom(h);
      let parts;
      if (!mr) parts = [{ polygon: h.footprint, holes: h.courts, level: h.roofLevel, parapet: h.parapet, kind: 'main' }];
      else {
        const rest = G.clip(G.make(h.footprint, null), 0, 0, -mr.line[0], -mr.line[1], -mr.line[2], null);
        parts = rest && G.area(rest.p) > 6
          ? [{ polygon: G.ring(rest.p), holes: h.courts, level: h.roofLevel, parapet: h.parapet, kind: 'main' }, { polygon: mr.polygon, holes: [], level: h.roofLevel + mr.raise, parapet: h.parapet, kind: 'raised' }]
          : [{ polygon: h.footprint, holes: h.courts, level: h.roofLevel, parapet: h.parapet, kind: 'main' }];
      }
      Object.defineProperty(h, '_roofParts', { value: parts, enumerable: false });
      return parts;
    },
    /** Squares (open spaces of kind 'square'); gate squares carry .gate. */
    get squares() { return openSpaces.filter((o) => o.kind === 'square'); },
    /** Where the gate streets meet the gates: [{ gate, x, z, dir (into the city), inside: [x, z], outside: [x, z], street }] */
    gateApproaches: world.innerWalls.gates.map((g) => {
      const d = M.azToDir(g.facingDeg), inside = [g.x - d[0] * 44, g.z - d[1] * 44];
      const st = nearestStreet(inside[0], inside[1], 80, 'main') || nearestStreet(inside[0], inside[1], 80, 'processional');
      return { gate: g.name, x: g.x, z: g.z, dir: [-d[0], -d[1]], inside, outside: g.causeway && g.causeway.to ? g.causeway.to : [g.x + d[0] * 60, g.z + d[1] * 60], street: st ? st.street.id : null };
    }),
    /**
     * Roof life of a house (pure, seeded): { polygon: footprint ring, holes: courts, area, items: [{ kind, x, y, z, rotDeg, size: [w, d] }] }
     * kinds: 'awning' 'mat' 'bedding' 'oven' 'booth' 'jars' 'ladder' 'drying' 'loom'. 2 to 4 items on most roofs.
     */
    roofAnchors(h) {
      const r = new Rng(h.seed ^ 0x0f00d), items = [], roofArea = h.area - h.courtArea;
      const want = roofArea < 45 ? r.int(1, 2) : roofArea < 160 ? r.int(2, 3) : r.int(3, 5);
      const table = [['mat', 0.26, [1.8, 2.6]], ['jars', 0.16, [1.2, 1.2]], ['drying', 0.14, [2.4, 1.6]], ['awning', 0.13, [3.2, 2.6]], ['bedding', 0.1, [1.9, 1.3]], ['booth', 0.08, [2.6, 2.2]], ['oven', 0.07, [0.9, 0.9]], ['loom', 0.06, [1.8, 0.8]]];
      // the ladder stands at the edge of the first court
      const bb = M.bbox(h.courts[0]), cc = M.polygonCentroid(h.courts[0]);
      items.push({ kind: 'ladder', x: cc[0] + (bb[2] - bb[0]) * 0.38 * (r.next() < 0.5 ? -1 : 1), y: h.roofLevel, z: cc[1] + (r.next() - 0.5) * (bb[3] - bb[1]) * 0.5, rotDeg: h.rotationDeg + 90 * r.int(0, 3), size: [0.6, 0.3] });
      const once = new Set();
      for (let k = 0; k < want; k++) {
        let q = r.next(), pick = table[0];
        for (const t of table) { q -= t[1]; if (q <= 0) { pick = t; break; } }
        if (pick[0] !== 'mat' && pick[0] !== 'jars' && pick[0] !== 'bedding') { if (once.has(pick[0])) pick = table[0]; else once.add(pick[0]); }
        const p = layout.roofPoint(h, r, Math.max(0.6, pick[2][0] * 0.55));
        if (!p) continue;
        items.push({ kind: pick[0], x: p.x, y: p.y, z: p.z, rotDeg: h.rotationDeg + (pick[0] === 'mat' || pick[0] === 'bedding' ? r.range(-25, 25) : 90 * r.int(0, 1)), size: pick[2] });
      }
      return { polygon: h.footprint, holes: h.courts, area: roofArea, items };
    },
    /** Court dressing anchors (pure): [{ kind: 'oven' | 'jars' | 'tree' | 'well' | 'loom' | 'trough' | 'awning', x, y, z, court }] */
    courtAnchors(h) {
      const r = new Rng(h.seed ^ 0xc0047), out = [];
      h.courts.forEach((ct, ci) => {
        const bb = M.bbox(ct), c = M.polygonCentroid(ct), w = bb[2] - bb[0], d = bb[3] - bb[1], inC = (x, z) => M.pointInPolygon(x, z, ct) && M.distToRing(x, z, ct) > 0.35;
        const put = (kind, fx, fz) => { const x = c[0] + fx * w * 0.5, z = c[1] + fz * d * 0.5; if (inC(x, z)) out.push({ kind, x, y: h.groundLevel, z, court: ci }); };
        if (ci === 0 && h.courtTree) put('tree', (r.next() - 0.5) * 0.3, (r.next() - 0.5) * 0.3);
        if (ci === 0 && hash2(h.seed & 0xffff, h.seed >>> 16, 61) < 0.42) put('oven', r.sign() * 0.55, r.sign() * 0.55);
        if (r.next() < 0.7) put('jars', r.sign() * 0.5, (r.next() - 0.5) * 0.9);
        if (Math.min(w, d) > 4.5 && r.next() < 0.3) put(r.next() < 0.5 ? 'loom' : 'trough', (r.next() - 0.5) * 0.9, r.sign() * 0.55);
        if (Math.min(w, d) > 6 && r.next() < 0.25) put('awning', r.sign() * 0.3, r.sign() * 0.3);
      });
      return out;
    },
    /** The bread oven of a house, if it has one: { x, y, z, where: 'court' | 'roof', smokes } (about 300 smoke in the whole city). */
    ovenOf(h) {
      const c = layout.courtAnchors(h).find((a) => a.kind === 'oven');
      const smokes = hash2(h.seed & 0xffff, h.seed >>> 16, 62) < 0.036;
      if (c) return { x: c.x, y: c.y + 0.9, z: c.z, where: 'court', smokes };
      const rf = layout.roofAnchors(h).items.find((a) => a.kind === 'oven');
      return rf ? { x: rf.x, y: rf.y + 0.9, z: rf.z, where: 'roof', smokes } : null;
    },
    /** Smoke sources of the housing: [{ x, y, z, house }] for built houses whose oven smokes (SPEC 3.18: 400 columns with kilns and altars). */
    smokeSources() {
      const out = [];
      for (const h of layout.houses) { if (!layout.isBuilt(h) || hash2(h.seed & 0xffff, h.seed >>> 16, 62) >= 0.036) continue; const o = layout.ovenOf(h); if (o) out.push({ x: o.x, y: o.y, z: o.z, house: h.id }); }
      return out;
    },
    /** Point for the tree of a court (house.courtTree): { x, y, z } or null. */
    courtTreePoint(h) { const a = h.courtTree ? layout.courtAnchors(h).find((q) => q.kind === 'tree') : null; return a ? { x: a.x, y: a.y, z: a.z } : null; },
    /** Open space containing a point, or null. */
    openSpaceAt(x, z) { for (const o of openSpaces) if (M.pointInPolygon(x, z, o.polygon)) return o; return null; },
    paramsAt,
    /** Counts for the self-test: { houses, lamps, courtTrees, inner, outer, village, streets, openSpaces, reserved } + details. */
    stats() {
      const hs = houses.filter(alive);
      const by = (f) => hs.reduce((a, h) => { const k = f(h); a[k] = (a[k] || 0) + 1; return a; }, {});
      const districts = world.districts.map((d) => {
        const list = hs.filter((h) => h.district === d.name), bl = blocks.filter((b) => b.district === d.name && b.kind === 'built' && b.houses.length);
        const builtHa = bl.reduce((a, b) => a + b.area, 0) / 1e4, plotHa = list.reduce((a, h) => a + h.area, 0) / 1e4;
        const grossHa = bl.reduce((a, b) => a + b.grossArea, 0) / 1e4, openHa = openSpaces.filter((o) => o.district === d.name).reduce((a, o) => a + o.area, 0) / 1e4;
        return { name: d.name, houses: list.length, target: d.estHouses, areaHa: d.areaHa, perHaDistrict: +(list.length / Math.max(0.1, d.areaHa - (d.monumentAreaHa || 0))).toFixed(1), builtBlocksHa: +grossHa.toFixed(1), perHaBuilt: +(list.length / Math.max(0.01, grossHa)).toFixed(1), perHaNet: +(list.length / Math.max(0.01, builtHa)).toFixed(1), meanPlot: Math.round(plotHa * 1e4 / Math.max(1, list.length)), openShare: +(openHa / Math.max(0.01, openHa + plotHa)).toFixed(2), openTarget: d.kind === 'outerCity' ? null : d.openGardenFraction, sawTooth: +(list.filter((h) => h.sawTooth).length / Math.max(1, list.length)).toFixed(2), white: +(list.filter((h) => h.whitewashed).length / Math.max(1, list.length)).toFixed(2) };
      });
      const inner = hs.filter((h) => h.enclosure === 'innerEast' || h.enclosure === 'innerWest');
      return {
        houses: hs.length, lamps: hs.reduce((a, h) => a + layout.lampsFor(h).length, 0), courtTrees: hs.filter((h) => h.courtTree).length,
        inner: inner.length, innerEast: hs.filter((h) => h.enclosure === 'innerEast').length, innerWest: hs.filter((h) => h.enclosure === 'innerWest').length,
        outer: hs.filter((h) => h.enclosure === 'outerCity').length, village: hs.filter((h) => h.village !== null).length,
        ribbon: hs.filter((h) => h.enclosure === null && h.village === null).length,
        streets: streets.length, openSpaces: openSpaces.length, reserved: reserved.length,
        blocks: blocks.length, builtBlocks: blocks.filter((b) => b.kind === 'built' && b.houses.length).length,
        streetsByClass: streets.reduce((a, s) => { a[s.cls] = (a[s.cls] || 0) + 1; return a; }, {}),
        streetKm: +(streets.reduce((a, s) => a + s.length, 0) / 1000).toFixed(1), blindAlleys: streets.filter((s) => s.blind).length,
        classes: by((h) => h.cls), archetypes: by((h) => h.archetype), courts: hs.reduce((a, h) => a + h.courts.length, 0),
        sawTooth: hs.filter((h) => h.sawTooth).length, whitewashed: hs.filter((h) => h.whitewashed).length, twoStorey: hs.filter((h) => h.storeys > 1).length,
        openByKind: openSpaces.reduce((a, o) => { a[o.kind] = (a[o.kind] || 0) + 1; return a; }, {}),
        innerPerHaBuilt: +(inner.length / Math.max(0.01, blocks.filter((b) => (b.enclosure === 'innerEast' || b.enclosure === 'innerWest') && b.kind === 'built' && b.houses.length).reduce((a, b) => a + b.grossArea, 0) / 1e4)).toFixed(1),
        districts, net: stat, netLog: net.log,
      };
    },
  };
  void nInnerGen; void outer;
  return layout;
}
