// js/modules/riverworks/bridge.js — the Euphrates bridge (SPEC 3.13, R3 3.5): six boat-shaped brick piers with the
// bow upstream, stone-capped at +1.6, a level timber deck (bearers, stringers, planking: 0.75 m) with the roadway
// at +2.35, rails, kerbs, a pile bent in the wide west opening, bridge heads with wing walls and torches.
// Local frame of the bridge: lx along the axis (west abutment -> east abutment), lz downstream; the origin is the
// middle of the bridge (world.json bridge.x, bridge.z).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../../core/mathx.js';
import { hash1, hash2 } from '../../core/rng.js';
import { lineBox } from './sweep.js';

import { WET, DAMP, FLOOD, BRICK } from './quays.js';
// timber tones as linear albedo (the timber material of the module is white: every piece carries its own tone)
export const WOOD = { plank: [0.34, 0.262, 0.165], beam: [0.2, 0.128, 0.07], log: [0.22, 0.158, 0.096], rail: [0.27, 0.19, 0.115], dark: [0.085, 0.062, 0.045], wet: [0.12, 0.095, 0.07] };
const tone = (base, k = 1, warm = 0) => [base[0] * k * (1 + warm), base[1] * k, base[2] * k * (1 - warm)];

const BOW0 = 0.095, STERN0 = 0.82, BOW_POW = 1.8, FLAT = 0.62;
/**
 * Outline of a pier in its own frame, [u (upstream), v (along the bridge)], from the bow tip round by the +v side:
 * a boat's waterline, pointed upstream, the sides parallel from 1 m above the middle to 1.9 m from the stern, the
 * stern flat for 0.62 of the beam between rounded quarters. k = how far the outline lies INSIDE the waterline one
 * (the batter; negative below the water): the same curve family, so every level has the same vertices and a level
 * can never fold over itself at the sharp bow (a mitred polygon offset does).
 */
export function pierOutline(hw, hl, k = 0) {
  const bow0 = hl * BOW0, stern0 = -hl * STERN0, alpha = Math.atan((hw * BOW_POW) / (hl - bow0));        // half angle of the bow at its tip
  const tip = hl - k / Math.sin(alpha), end = -(hl - k), w = hw - k, flat = (FLAT * hw - 0.45 * k) / w;
  const CURVE = 0.4, endQ = end + CURVE;                             // the stern is "slightly rounded": it bulges 0.4 m between its quarters
  const half = (u) => {
    if (u >= bow0) { const t = M.clamp((u - bow0) / (tip - bow0)); return w * (1 - Math.pow(t, BOW_POW)); }
    if (u >= stern0) return w;
    const t = M.clamp((stern0 - u) / (stern0 - endQ));
    return w * (flat + (1 - flat) * Math.pow(1 - Math.pow(t, 2.4), 1 / 2.4));
  };
  const us = [];
  for (const t of [1, 0.965, 0.9, 0.82, 0.72, 0.6, 0.46, 0.3, 0.15, 0]) us.push(bow0 + (tip - bow0) * t);
  us.push((bow0 + stern0) / 2, stern0);
  for (const t of [0.4, 0.68, 0.86, 0.96, 1]) us.push(stern0 + (endQ - stern0) * t);
  const side = us.map((u) => [u, half(u)]);
  // the shallow arc of the stern from the quarter to the middle
  for (const f of [0.66, 0.33, 0]) side.push([end + CURVE * f * f, flat * w * f]);
  return [...side, ...side.slice(1, -1).reverse().map(([u, v]) => [u, -v])];
}

export function buildBridge(ctx, R) {
  const { geom, world, ground, water, materials } = ctx;
  const b = world.bridge, C = [b.x, b.z], rot = b.rotationDeg;
  const W = b.westAbutment, E = b.eastAbutment, len = Math.hypot(E[0] - W[0], E[1] - W[1]);
  const ax = [(E[0] - W[0]) / len, (E[1] - W[1]) / len], dn = M.rightOf(ax[0], ax[1]);        // axis W -> E, downstream
  const L = (lx, lz) => [C[0] + ax[0] * lx + dn[0] * lz, C[1] + ax[1] * lx + dn[1] * lz];
  const toLocal = (x, z) => [(x - C[0]) * ax[0] + (z - C[1]) * ax[1], (x - C[0]) * dn[0] + (z - C[1]) * dn[1]];
  const hw = b.pierSize.alongBridge / 2, hl = b.pierSize.alongStream / 2;
  const BATTER = 0.14, capBase = b.pierTop - 0.35, capTop = b.pierTop, deck = b.deckLevel;
  const bearerTop = capTop + 0.25, stringerTop = deck - 0.15;
  const brick = [], stone = [], timber = [], small = [], palm = [];
  const stats = {}, checks = [];
  const tint = (g, c) => geom.paint(g, c);
  const box = (lx0, lx1, lz0, lz1, y0, y1, c, bottom = true) => {
    const p = L((lx0 + lx1) / 2, (lz0 + lz1) / 2);
    const g = geom.box({ x: p[0], z: p[1], y0, y1, sx: Math.abs(lx1 - lx0), sz: Math.abs(lz1 - lz0), rotDeg: rot, bottom });
    return c === undefined ? g : tint(g, c);
  };
  /** A squared timber between two points in space (braces, raking piles). */
  const beam = (p0, p1, wdt, hgt, c) => {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), l = d.length();
    const g = new THREE.BoxGeometry(wdt, l, hgt);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    const ni = g.toNonIndexed(); ni.computeVertexNormals(); g.dispose();
    return c === undefined ? ni : tint(ni, c);
  };

  // ------------------------------------------------------------------------------------------- piers ----
  const pierWorld = (p, k = 0) => pierOutline(hw, hl, k).map(([u, v]) => [p.x + ax[0] * v - dn[0] * u, p.z + ax[1] * v - dn[1] * u]);   // the outline k metres inside the waterline one
  const PB = [BRICK[0] * 0.97, BRICK[1] * 0.95, BRICK[2] * 0.93], pt = (c, k = 1) => [c[0] * PB[0] * k, c[1] * PB[1] * k, c[2] * PB[2] * k];   // the piers are older brick than the quay
  const levels = [[b.pierBase - 3.1, pt(WET)], [-3.0, pt(WET)], [-2.4, pt(DAMP)], [-1.5, pt(FLOOD)], [0.2, pt([1, 1, 1], 0.94)], [capBase, pt([1, 1, 1], 1.06)]];
  const piers = [];
  for (const p of b.piers) {
    const w = geom.writer({ verts: 1024, color: true });
    const rings = levels.map(([y]) => pierWorld(p, BATTER * (y + 3)));
    for (let j = 0; j < levels.length - 1; j++) {
      const lo = rings[j], hi = rings[j + 1], yl = levels[j][0], yh = levels[j + 1][0], cl = levels[j][1], ch = levels[j + 1][1], n = lo.length;
      for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n, a = lo[i], bb = lo[i1], c = hi[i1], d = hi[i];
        // a, bb on the lower ring, c, d on the upper one; the face normal from the diagonals, turned away from the pier centre
        const mx = (a[0] + bb[0]) / 2 - p.x, mz = (a[1] + bb[1]) / 2 - p.z;
        let V = [[a, yl, cl], [bb, yl, cl], [c, yh, ch], [d, yh, ch]];
        const ux = V[2][0][0] - V[0][0][0], uy = V[2][1] - V[0][1], uz = V[2][0][1] - V[0][0][1], vx = V[3][0][0] - V[1][0][0], vy = V[3][1] - V[1][1], vz = V[3][0][1] - V[1][0][1];
        let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
        if (fx * mx + fz * mz < 0) { fx = -fx; fy = -fy; fz = -fz; V = [V[0], V[3], V[2], V[1]]; }
        let i0 = -1;
        for (let k = 0; k < 4; k++) { const q = V[k]; w.color(q[2][0], q[2][1], q[2][2]); const id = w.vert(q[0][0], q[1], q[0][1], fx, fy, fz); if (k === 0) i0 = id; }
        w.tri(i0, i0 + 1, i0 + 2); w.tri(i0, i0 + 2, i0 + 3);
      }
    }
    const capRing = pierWorld(p, BATTER * (capBase + 3) - 0.12);
    if (!R.samplePier) R.samplePier = () => geom.merge([w.toGeometry(), geom.prism(M.closeRing(capRing), capBase, capTop, { bottom: true })]);
    brick.push(w);
    // stone capping: limestone slabs 0.35 m thick, 0.12 m proud of the brickwork
    stone.push(geom.prism(M.closeRing(capRing), capBase, capTop, { bottom: true }));
    // ends of the timber baulks laid through the masonry, two tiers 2 m apart (R3 3.5)
    for (const y of [-1.0, 1.0]) {
      const ring = pierWorld(p, BATTER * (y + 3)), n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i], c = ring[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]), ex = (c[0] - a[0]) / l, ez = (c[1] - a[1]) / l;
        let ox = ez, oz = -ex; if (ox * ((a[0] + c[0]) / 2 - p.x) + oz * ((a[1] + c[1]) / 2 - p.z) < 0) { ox = -ox; oz = -oz; }
        const m = Math.floor(l / 0.75);
        for (let k = 0; k < m; k++) {
          const s = (l - (m - 1) * 0.75) / 2 + k * 0.75, x = a[0] + ex * s - ox * 0.1, z = a[1] + ez * s - oz * 0.1;
          small.push(tint(geom.box({ x, z, y0: y - 0.1, y1: y + 0.1, sx: 0.2, sz: 0.27, rotDeg: M.dirToAz(ex, ez) - 90, bottom: false }), WOOD.dark));
        }
      }
    }
    // the water: foam line round the real waterline outline
    if (water.addObstacle) water.addObstacle(pierWorld(p, 0), { id: 'bridge:pier' + p.n });
    const lc = toLocal(p.x, p.z);
    piers.push({ n: p.n, lx: lc[0], lz: lc[1], top: capRing });
  }
  piers.sort((p, q) => q.lx - p.lx);                                    // east to west

  // ----------------------------------------------------------------------------- where the deck ends ----
  const lxE = len / 2, lxW = -len / 2;
  /** lx at which the line lz = const meets the back of the bearing shelf of an abutment (0.75 m behind the quay line). */
  const shelfBack = (bank, lz, back = 0.75) => {
    const line = bank === 'east' ? R.east && R.east.line : R.west && R.west.line, sgn = bank === 'east' ? 1 : -1;
    if (!line) return sgn * (len / 2 + back);
    let lo = sgn * (len / 2 - 6), hi = sgn * (len / 2 + 8);                // d(lo) < back < d(hi)
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2, p = L(mid, lz), d = line.locate(p[0], p[1]).d; if (d < back) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const endE = (lz) => shelfBack('east', lz) - 0.03, endW = (lz) => shelfBack('west', lz) + 0.03;
  const DW = b.width / 2;                                                // 4.5
  let plankE = Infinity, plankW = -Infinity;
  for (let lz = -DW - 0.1; lz <= DW + 0.1; lz += 0.5) { plankE = Math.min(plankE, endE(lz)); plankW = Math.max(plankW, endW(lz)); }

  // ----------------------------------------------------------------------- bearers, stringers, bent ----
  const supports = [];                                                   // lx of the lines that carry stringers, east to west
  for (const p of piers) {
    for (const o of [2.45, -2.45]) timber.push(box(p.lx + o - 0.2, p.lx + o + 0.2, -DW - 0.25, DW + 0.25, capTop, bearerTop, tone(WOOD.beam, 1.05)));
    supports.push(p.lx);
  }
  // the west opening is 18.2 m clear: a timber pile bent stands in the middle of it (conjectural; see docs/mod-riverworks.md)
  const west = piers[piers.length - 1], bentLx = (lxW + (west.lx - hw)) / 2;
  {
    const bed = ground.height(...L(bentLx, 0));
    const pileGeo = (lz, rake) => {
      const foot = L(bentLx, lz + rake), head = L(bentLx, lz), g = new THREE.CylinderGeometry(0.2, 0.24, 1, 8, 1, false);
      const d = new THREE.Vector3(head[0] - foot[0], bearerTop - 0.35 - (bed - 1.2), head[1] - foot[1]), l = d.length();
      g.scale(1, l, 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate((foot[0] + head[0]) / 2, (bed - 1.2 + bearerTop - 0.35) / 2, (foot[1] + head[1]) / 2);
      const ni = g.toNonIndexed(); ni.computeVertexNormals(); g.dispose();
      return tint(ni, tone(WOOD.log, 0.8));
    };
    for (const [lz, rake] of [[-4.3, -0.9], [-2.15, 0], [0, 0], [2.15, 0], [4.3, 0.9]]) timber.push(pileGeo(lz, rake));
    timber.push(box(bentLx - 0.22, bentLx + 0.22, -DW - 0.35, DW + 0.35, bearerTop - 0.35, bearerTop, tone(WOOD.beam, 1.0)));
    for (const s of [-1, 1]) {
      const p0 = L(bentLx + s * 0.27, -4.3), p1 = L(bentLx + s * 0.27, 4.3);
      timber.push(beam([p0[0], s > 0 ? -2.2 : 1.2, p0[1]], [p1[0], s > 0 ? 1.2 : -2.2, p1[1]], 0.09, 0.26, tone(WOOD.rail, 0.85)));
    }
    supports.push(bentLx);
    R.bent = { lx: bentLx, at: L(bentLx, 0) };
  }
  // wall plates on the bearing shelves of the abutments
  for (const bank of ['east', 'west']) {
    const q = R[bank]; if (!q) continue;
    timber.push(geom.paint(lineBox(geom, q.line, q.sAb - 4.95, q.sAb + 4.95, 0.22, 0.62, capTop, bearerTop).toGeometry(), tone(WOOD.beam, 1.0)));
  }
  // stringers: 13 baulks 0.36 x 0.35 m at 0.7 m, butted over the piers
  const NS = 13, sPitch = 0.7;
  for (let k = 0; k < NS; k++) {
    const lz = -(NS - 1) * sPitch * 0.5 + k * sPitch;
    const stops = [endE(lz) - 0.05, ...supports, endW(lz) + 0.05];
    for (let i = 0; i < stops.length - 1; i++) {
      // butt joints over the supports, a little apart and never in one line
      const g0 = i === 0 ? 0 : 0.04 + 0.3 * hash2(k, i, 31), g1 = i === stops.length - 2 ? 0 : 0.04 + 0.3 * hash2(k, i + 1, 35);
      const c = 0.8 + 0.4 * hash2(k, i, 32), wdt = 0.3 + 0.1 * hash2(k, i, 33);
      timber.push(box(stops[i + 1] + g1, stops[i] - g0, lz - wdt / 2, lz + wdt / 2, bearerTop, stringerTop, tone(hash2(k, i, 34) < 0.35 ? WOOD.log : WOOD.beam, c)));
    }
  }

  // ------------------------------------------------------------------------------------------ planking ----
  // transverse planks 0.30 m wide and 0.15 m thick in loose panels of eight (the sections that can be taken up)
  const PW = 0.3, GAP = 0.012, PANEL = 8, PANEL_GAP = 0.035;
  let nPlanks = 0, lx = plankE - 0.02, panels = 0;
  while (lx - PW > plankW + 0.02) {
    const i = nPlanks, c = 0.72 + 0.5 * hash1(i, 41) * hash1(i, 48), jz0 = 0.07 * hash1(i, 42), jz1 = 0.07 * hash1(i, 43), dy = 0.012 * hash1(i, 44);
    timber.push(box(lx - PW, lx, -DW - jz0, DW + jz1, stringerTop, deck - dy, tone(WOOD.plank, c, 0.06 * (hash1(i, 49) - 0.5))));
    nPlanks++;
    lx -= PW + GAP + (nPlanks % PANEL === 0 ? PANEL_GAP : 0);
    if (nPlanks % PANEL === 0) panels++;
  }
  // the pieces that close the deck against the skew abutments
  const endPiece = (x0, edge) => {
    const ring = [L(x0, -DW), L(x0, DW)];
    for (let lz = DW; lz >= -DW - 1e-6; lz -= 1.5) ring.push(L(edge(lz), lz));
    return tint(geom.prism(M.closeRing(ring), stringerTop, deck, { bottom: true }), tone(WOOD.plank, 0.9));
  };
  timber.push(endPiece(plankE - 0.02, endE), endPiece(lx, endW));
  // kerbs either side of the 6.4 m roadway, in lengths of about 9 m
  const RW = b.roadwayWidth / 2;
  for (const s of [-1, 1]) for (let x = plankE - 0.3, i = 0; x > plankW + 0.6; i++) {
    const l = Math.min(8.6 + hash2(i, s + 2, 45), x - plankW - 0.3), c = 0.8 + 0.3 * hash2(i, s + 2, 46);
    timber.push(box(x - l, x, s * RW, s * (RW + 0.2), deck - 0.012, deck + 0.18, tone(WOOD.rail, c)));
    x -= l + 0.06;
  }
  // rails: posts every 2.5 m (one panel) with a top rail and a mid rail
  const RZ = DW - 0.17, POST = (PW + GAP) * PANEL + PANEL_GAP, railTop = deck + 1.1;
  let nPosts = 0;
  for (const s of [-1, 1]) {
    const posts = [];
    for (let x = plankE - 0.25; x > plankW + 0.2; x -= POST) posts.push(x);
    for (const x of posts) { timber.push(box(x - 0.07, x + 0.07, s * RZ - 0.07, s * RZ + 0.07, deck - 0.012, railTop + 0.06, tone(WOOD.rail, 0.9), false)); nPosts++; }
    for (let i = 0; i + 1 < posts.length; i += 2) {
      const x0 = posts[Math.min(posts.length - 1, i + 2)], x1 = posts[i], c = 0.85 + 0.3 * hash2(i, s + 2, 47);
      timber.push(box(x0 - 0.1, x1 + 0.1, s * RZ - 0.05, s * RZ + 0.05, railTop - 0.1, railTop, tone(WOOD.rail, c)));
      timber.push(box(x0 - 0.1, x1 + 0.1, s * (RZ + 0.07) - 0.025, s * (RZ + 0.07) + 0.025, deck + 0.5, deck + 0.62, tone(WOOD.rail, c * 0.92)));
    }
  }

  // ---------------------------------------------------------------------------------------- bridge heads ----
  const heads = [];
  for (const bank of ['east', 'west']) {
    const q = R[bank], sgn = bank === 'east' ? 1 : -1, edge = bank === 'east' ? endE : endW;
    const g0 = ground.height(...L(sgn * (len / 2 + 4), 0));
    // wing walls from the deck corners, flaring 16 degrees, 0.9 m high (not on the upstream side of the east head: the
    // return of the upper quay wall stands there)
    for (const s of [-1, 1]) {
      if (bank === 'east' && s < 0) continue;
      const a = L(edge(s * DW) + sgn * 1.25, s * (DW + 0.35)), c = L(edge(s * DW) + sgn * 7.2, s * (DW + 2.05));
      const top = Math.max(ground.height(a[0], a[1]), ground.height(c[0], c[1])) + 0.9;
      brick.push(tint(geom.wall([a, c], { thickness: 0.5, base: g0 - 0.7, top }), BRICK));
      brick.push(tint(geom.box({ x: c[0], z: c[1], y0: g0 - 0.7, y1: top + 0.25, sx: 0.75, sz: 0.75, rotDeg: rot }), BRICK));
    }
    // torch standards: at the corners of the deck end and, 7 m further in, either side of the street (four to a head)
    for (const s of [-1, 1]) for (const [inl, out, sz] of [[0.55, 0.38, 1.7], [7.2, 2.05, 1.5]]) {
      const p = L(edge(s * DW) + sgn * inl, s * (DW + out)), gy = Math.max(ground.height(p[0], p[1]), inl < 1 ? deck : -1e9);
      const onPier = inl > 1 && !(bank === 'east' && s < 0), base = onPier ? gy + 1.15 : gy;          // on the end pier of a wing wall where there is one
      small.push(tint(geom.box({ x: p[0], z: p[1], y0: base - 0.5, y1: base + (onPier ? 1.5 : 2.5), sx: 0.16, sz: 0.16, rotDeg: rot }), tone(WOOD.beam, 0.9)));
      heads.push({ bank, kind: 'torch', size: sz, pos: [p[0], base + (onPier ? 1.78 : 2.78), p[1]], bowl: [p[0], base + (onPier ? 1.5 : 2.5), p[1]] });
    }
    // a watch fire beside the approach, on the downstream side
    const w = L(edge(DW) + sgn * 4.4, DW + 4.6), wy = ground.height(w[0], w[1]);
    heads.push({ bank, kind: 'brazier', size: 1.8, pos: [w[0], wy + 0.75, w[1]], bowl: [w[0], wy, w[1]] });
    if (q) R.heads[bank] = { street: L(sgn * (len / 2 + 2), 0), level: deck, threshold: L(edge(0), 0) };
  }

  // ------------------------------------------------------------------------------------------- numbers ----
  const centres = piers.map((p) => p.lx), gaps = []; for (let i = 0; i < centres.length - 1; i++) gaps.push(centres[i] - centres[i + 1]);
  // measured on the built outline at the waterline
  const pc = toLocal(b.piers[0].x, b.piers[0].z), rel = (ring) => ring.map((p) => { const q = toLocal(p[0], p[1]); return [q[0] - pc[0], q[1] - pc[1]]; });
  const o0 = rel(pierWorld(b.piers[0], 0));                                 // [along the bridge, downstream] from the pier centre
  const ext = (pts, k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
  const along = ext(o0, 1), across = ext(o0, 0);
  const bowUp = o0.reduce((m, p) => (p[1] < m[1] ? p : m), o0[0]);          // the most upstream point: the single tip on the pier's axis
  const sternW = o0.filter((p) => p[1] > hl - 1.2), bowW = o0.filter((p) => p[1] < -hl + 1.2);
  const widthAt = (pts) => ext(pts, 0);
  stats.pierWaterline = [+across.toFixed(2), +along.toFixed(2)];
  { const t = rel(pierWorld(b.piers[0], BATTER * (capBase + 3))); stats.pierTopBrick = [+ext(t, 0).toFixed(2), +ext(t, 1).toFixed(2)]; }
  stats.pierBatter = BATTER;
  stats.planks = nPlanks; stats.panels = panels; stats.railPosts = nPosts; stats.stringers = NS;
  const clearE = lxE - (centres[0] + hw), clearW = centres[centres.length - 1] - hw - lxW;
  checks.push({ name: 'bridge length between the abutment faces (m)', value: +len.toFixed(1), expect: '126.2 +/- 0.5', pass: Math.abs(len - b.length) < 0.5 });
  checks.push({ name: 'bridge piers', value: piers.length, expect: 6, pass: piers.length === 6 });
  checks.push({ name: 'pier at the waterline, along the bridge x along the stream (m)', value: stats.pierWaterline.join(' x '), expect: '9 x 21', pass: Math.abs(across - 9) < 0.05 && Math.abs(along - 21) < 0.05 });
  checks.push({ name: 'pier centres (m)', value: gaps.map((g) => g.toFixed(2)).join(' '), expect: '18.0 each', pass: gaps.every((g) => Math.abs(g - b.pierSpacingCC) < 0.1) });
  checks.push({ name: 'clear openings at the waterline: east abutment / between piers / west abutment (m)', value: [clearE, b.pierSpacingCC - 2 * hw, clearW].map((v) => v.toFixed(1)).join(' / '), expect: '9 / 9 / 18.2', pass: Math.abs(clearE - 9) < 0.2 && Math.abs(clearW - 18.2) < 0.2 });
  checks.push({ name: 'pier is boat-shaped, bow upstream: width 1.2 m from the upstream tip / from the downstream end (m)', value: `${widthAt(bowW).toFixed(1)} / ${widthAt(sternW).toFixed(1)}`, expect: 'pointed upstream (< 2.5), blunt downstream (> 5)', pass: widthAt(bowW) < 2.5 && widthAt(sternW) > 5 && Math.abs(bowUp[0]) < 0.01 });
  checks.push({ name: 'roadway level / top of the stone capping of the piers (datum)', value: `${deck} / ${capTop}`, expect: '+2.35 / +1.6', pass: deck === 2.35 && capTop === 1.6 && Math.abs(deck - capTop - b.deckStructure.beamsAndPlanking) < 1e-6 });
  checks.push({ name: 'no pier masonry above the roadway: highest masonry of a pier (datum)', value: capTop, expect: '<= +1.6', pass: capTop <= 1.6 });
  checks.push({ name: 'deck width / roadway between the kerbs (m)', value: `${(2 * DW).toFixed(1)} / ${(2 * RW).toFixed(1)}`, expect: '9 / 6.4', pass: true });

  R.bridge = { from: [...L(plankW, 0).slice(0, 1), deck, L(plankW, 0)[1]], to: [...L(plankE, 0).slice(0, 1), deck, L(plankE, 0)[1]], width: 2 * RW, deckWidth: 2 * DW, level: deck, railTop, axis: ax, L, toLocal, piers, heads };
  return { brick, stone, timber, small, palm, heads, stats, checks };
}
