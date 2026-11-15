// js/modules/riverworks/dressing.js — what stands on and beside the quays: reed-mat sheds and stacked goods at the
// main quay (the bridge heads), goods, ladders, fenders and shades along the walkways, landings, slipways and
// beaching places on the mud banks north and south of the walls, and the list of moorings.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from '../../core/mathx.js';
import { hash1, hash2 } from '../../core/rng.js';
import { Q, BRICK } from './quays.js';
import { WOOD } from './bridge.js';
import { lineBox } from './sweep.js';

const tone = (base, k = 1, warm = 0) => [base[0] * k * (1 + warm), base[1] * k, base[2] * k * (1 - warm)];
const SHED = { w: 3.6, d: 7.0 };

// ------------------------------------------------------------------------------------------------- plan ----
/**
 * Where the landings and the sheds are. Pure: world.json, the ground model and the layout only, so prepare() and
 * build() agree. Returns { reserve: [{ polygon, kind, margin }], landings: [...], sheds: [...] }.
 */
export function planLandings(ctx) {
  const { ground, layout, world, W } = ctx;
  const earth = (ground.banks || []).filter((b) => b.body === 'river' && b.type === 'earth');
  const reserve = [], landings = [], sheds = [];
  const freeAt = (x, z, r) => { try { return layout.isFree(x, z, r) && !ground.isWater(x, z); } catch (e) { return true; } };

  // ---- landings on the mud banks: the nearest earth bank to each seed point, moved along it until the ground is free
  const seeds = [
    { id: 'north', near: [195, -1228], kind: 'landing', jetty: true, slip: true, shed: true, logs: true, tar: true },   // the kelek landing north of the palaces (R5 3.4)
    { id: 'north2', near: [272, -1332], kind: 'beach', slip: false },
    { id: 'west', near: [-212, -664], kind: 'landing', jetty: true, shed: true },                              // the unembanked west bank north of the west city
    { id: 'west2', near: [-207, -722], kind: 'beach', slip: true, tar: true },
    { id: 'urash', near: [62, 1135], kind: 'landing', jetty: true, shed: true },                               // outside the Urash Gate, where the Borsippa road arrives
    { id: 'south-west', near: [-58, 1162], kind: 'beach', slip: true },
  ];
  for (const sd of seeds) {
    let best = null;
    for (const b of earth) { const [d, t] = M.distToSegment(sd.near[0], sd.near[1], b.a[0], b.a[1], b.b[0], b.b[1]); if (!best || d < best.d) best = { d, t, b }; }
    if (!best || best.d > 120) continue;
    const b = best.b, len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), tx = (b.b[0] - b.a[0]) / len, tz = (b.b[1] - b.a[1]) / len, n = b.normal;
    let pick = null;
    for (const shift of [0, 14, -14, 28, -28, 42, -42]) {
      const s = best.t * len + shift; if (s < 18 || s > len - 18) continue;
      const o = [b.a[0] + tx * s, b.a[1] + tz * s];
      let ok = true;
      for (const [a, d] of [[0, 8], [-9, 14], [9, 14], [-9, 21], [9, 21], [0, 21]]) if (!freeAt(o[0] + tx * a + n[0] * d, o[1] + tz * a + n[1] * d, 3.5)) ok = false;
      if (ok) { pick = o; break; }
    }
    const deep = !!pick, o = pick || [b.a[0] + tx * best.t * len, b.a[1] + tz * best.t * len];
    const P = (a, d) => [o[0] + tx * a + n[0] * d, o[1] + tz * a + n[1] * d];
    const depth = deep ? 25 : 11;
    const polygon = [P(-15, 0.5), P(15, 0.5), P(15, depth), P(-15, depth), P(-15, 0.5)];
    landings.push({ ...sd, origin: o, n: [n[0], n[1]], t: [tx, tz], deep, polygon });
    reserve.push({ polygon, kind: 'landing', margin: 0.5 });
  }

  // ---- sheds of the main quay at the east bridge head: in the open strip between the quay lane and the precinct wall,
  //      and on the south side of the bridge-head square; one on the west bank
  const b = world.bridge, ax = M.azToDir(b.axisAzimuthDeg);
  const tryShed = (x, z, rotDeg, tag) => {
    const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG);
    for (const [lx, lz] of [[0, 0], [0, -2.4], [0, 2.4], [1.3, -3], [-1.3, 3], [1.3, 3], [-1.3, -3]]) if (!freeAt(x + lx * c - lz * s, z + lx * s + lz * c, 1.2)) return false;
    sheds.push({ x, z, rotDeg, w: SHED.w, d: SHED.d, tag });
    reserve.push({ polygon: M.rectRing(x, z, SHED.w + 1, SHED.d + 1, rotDeg), kind: 'shed', margin: 0.3 });
    return true;
  };
  if (W.hasMonument && W.hasMonument('etemenankiPrecinct')) {
    const ring = W.monument('etemenankiPrecinct').footprint.polygon;
    // the south-west corner of the precinct = the vertex nearest the east abutment; the wall runs north from it
    let k = 0; for (let i = 0; i < ring.length - 1; i++) if (Math.hypot(ring[i][0] - b.eastAbutment[0], ring[i][1] - b.eastAbutment[1]) < Math.hypot(ring[k][0] - b.eastAbutment[0], ring[k][1] - b.eastAbutment[1])) k = i;
    const c0 = ring[k], cands = [ring[(k + 1) % (ring.length - 1)], ring[(k - 1 + ring.length - 1) % (ring.length - 1)]];
    const c1 = cands.reduce((m, p) => (p[1] < m[1] ? p : m), cands[0]);                 // the neighbour to the north (smaller z)
    const l = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]), ux = (c1[0] - c0[0]) / l, uz = (c1[1] - c0[1]) / l;
    let ox = uz, oz = -ux; if (ox * (b.eastAbutment[0] - c0[0]) + oz * (b.eastAbutment[1] - c0[1]) < 0) { ox = -ox; oz = -oz; }   // toward the river
    const rot = M.dirToAz(ux, uz) + 180;                                        // long axis along the wall, the open front toward the river
    let placed = 0;
    for (const along of [14, 23.5, 33, 42.5, 52]) { if (placed >= 3) break; for (const out of [7.4, 9, 6]) if (tryShed(c0[0] + ux * along + ox * out, c0[1] + uz * along + oz * out, rot, 'yard')) { placed++; break; } }
  }
  // beside each bridge head, clear of street and lane: the free spot nearest a point 18 m inland and 17 m downstream of
  // the abutment (east: the bridge-head square; west: the strip between the quay and its lane)
  const dn = M.rightOf(ax[0], ax[1]);
  for (const [abut, sgn, inland, tag] of [[b.eastAbutment, 1, 19, 'square'], [b.westAbutment, -1, 10.5, 'west']]) {
    const tx = abut[0] + ax[0] * sgn * inland + dn[0] * 17, tz = abut[1] + ax[1] * sgn * inland + dn[1] * 17;
    const cands = [];
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const x = tx + ax[0] * i * 1.25 + dn[0] * j * 1.25, z = tz + ax[1] * i * 1.25 + dn[1] * j * 1.25; cands.push([Math.hypot(i, j), x, z]); }
    cands.sort((p, q) => p[0] - q[0]);
    // long axis along the stream, the open front toward the river
    const rot = M.dirToAz(-ax[0] * sgn, -ax[1] * sgn) - 90;
    for (const [, x, z] of cands) if (tryShed(x, z, rot, tag)) break;
  }
  return { reserve, landings, sheds };
}

// --------------------------------------------------------------------------------------------- dressing ----
export function buildDressing(ctx, R, plan, quays) {
  const { geom, ground, world, materials, layout, film } = ctx;
  const WALK = world.levels.quayWalkwayRiver, D_LOW = Q.D_UP - Q.WALK_W, D_BACK = Q.D_UP + Q.UP_T;
  const brick = [], stone = [], timber = [], palm = [], small = [], reed = [], earth = [], fires = [], checks = [], tall = [];
  const items = { jar: [], sack: [], basket: [], bundle: [], log: [], lump: [], bowl: [] };
  const stats = { sheds: 0, shades: 0, stacks: 0, ladders: 0, fenders: 0, landings: 0 };
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
  const mat = (x, y, z, rx, ry, rz, sx = 1, sy = sx, sz = sx) => _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)).clone();
  const srgb = (c) => new THREE.Color(c[0], c[1], c[2]).getHex(THREE.SRGBColorSpace);
  const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
  const JAR_TINTS = [0xffffff, 0xf0e2cc, 0xe4cfae, 0xd9b592, 0xc8a27e], SACK_TINTS = [0xffffff, 0xe9dcc2, 0xd6c7a6, 0xbfae8c, 0xa8936f], REED_TINTS = [0xffffff, 0xe8dcae, 0xd2c48e, 0xc0b47a];

  /** A squared timber between two points. */
  const beam = (p0, p1, wdt, hgt, c) => {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), l = d.length();
    const g = new THREE.BoxGeometry(wdt, l, hgt);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    const ni = g.toNonIndexed(); ni.computeVertexNormals(); g.dispose();
    return geom.paint(ni, c);
  };
  /** A round pole between two points (6 sides). */
  const pole = (p0, p1, r, c, sides = 6) => {
    const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), l = d.length();
    const g = new THREE.CylinderGeometry(r * 0.85, r, l, sides, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    const ni = g.toNonIndexed(); ni.computeVertexNormals(); g.dispose();
    return geom.paint(ni, c);
  };
  /** A thin slab (reed mat, plank) given by its four corners [x, y, z] in order round it, `th` thick below them. */
  const slab = (a, b, c, d, th, col) => {
    const w = geom.writer({ verts: 24, color: true }); w.color(col[0], col[1], col[2]);
    const lo = (p) => [p[0], p[1] - th, p[2]], A = lo(a), B = lo(b), C = lo(c), D = lo(d);
    const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cy = (a[1] + b[1] + c[1] + d[1]) / 4 - th / 2, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
    const face = (p, q, r, t) => {
      // turned so that its normal points away from the middle of the slab
      const ux = r[0] - p[0], uy = r[1] - p[1], uz = r[2] - p[2], vx = t[0] - q[0], vy = t[1] - q[1], vz = t[2] - q[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (p[0] + q[0] + r[0] + t[0]) / 4 - cx, my = (p[1] + q[1] + r[1] + t[1]) / 4 - cy, mz = (p[2] + q[2] + r[2] + t[2]) / 4 - cz;
      if (nx * mx + ny * my + nz * mz >= 0) w.quadP(p, q, r, t); else w.quadP(t, r, q, p);
    };
    face(a, b, c, d); face(A, B, C, D); face(a, b, B, A); face(b, c, C, B); face(c, d, D, C); face(d, a, A, D);
    return w;
  };

  // ---------------------------------------------------------------------------------------- goods ----
  /** A stack of goods round (x, z) on level y, turned rotDeg; kinds: jars, sacks, baskets, bundles, logs, lumps, bricks, slabs. */
  function stack(kind, x, y, z, rotDeg, seed, size = 1) {
    const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c], ry = -rotDeg * M.DEG;
    const h = (i, k) => hash2(seed * 13 + i, k, 77);
    stats.stacks++;
    if (kind === 'jars') {
      const nx = Math.round(2 + 2 * size * h(0, 1)), nz = Math.round(1 + 1.6 * size * h(0, 2));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (h(i * 7 + j, 3) < 0.12) continue;
        const p = at((i - (nx - 1) / 2) * 0.6 + 0.08 * (h(i * 7 + j, 4) - 0.5), (j - (nz - 1) / 2) * 0.6 + 0.08 * (h(i * 7 + j, 5) - 0.5)), k = 0.85 + 0.5 * h(i * 7 + j, 6);
        const lying = h(i * 7 + j, 7) < 0.08;
        items.jar.push({ m: lying ? mat(p[0], y + 0.24 * k, p[1], 0, 6.28 * h(i + j, 8), Math.PI / 2, k) : mat(p[0], y, p[1], 0, 6.28 * h(i + j, 8), 0, k * 0.95, k, k * 0.95), c: pick(JAR_TINTS, h(i * 7 + j, 9)) });
      }
    } else if (kind === 'sacks') {
      const layers = Math.round(1 + 2 * size * h(0, 1));
      for (let l = 0; l < layers; l++) { const n = Math.max(1, 3 - l); for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        if (l > 0 && h(l * 31 + i * 7 + j, 2) < 0.2) continue;
        const p = at((i - (n - 1) / 2) * 0.8 + 0.1 * (h(l * 31 + i * 7 + j, 3) - 0.5), (j - 0.5) * 0.52 + 0.06 * (h(l * 31 + i * 7 + j, 4) - 0.5));
        items.sack.push({ m: mat(p[0], y + 0.15 + l * 0.27, p[1], 0, ry + 0.35 * (h(l * 31 + i * 7 + j, 5) - 0.5), 0.1 * (h(l + i + j, 6) - 0.5), 0.8, 0.31, 0.5), c: pick(SACK_TINTS, h(l * 31 + i * 7 + j, 7)) });
      } }
    } else if (kind === 'baskets') {
      const n = Math.round(3 + 3 * size * h(0, 1));
      for (let i = 0; i < n; i++) {
        const p = at((i % 3 - 1) * 0.66 + 0.1 * (h(i, 2) - 0.5), (Math.floor(i / 3) - 0.5) * 0.66 + 0.1 * (h(i, 3) - 0.5)), k = 0.8 + 0.5 * h(i, 4), up = i >= 3 && h(i, 5) < 0.4 ? 0.38 * k : 0;
        items.basket.push({ m: mat(p[0], y + up, p[1], 0, 6.28 * h(i, 6), 0, k), c: pick(REED_TINTS, h(i, 7)) });
      }
    } else if (kind === 'bundles') {
      const rows = [3, 2, 1].slice(0, Math.round(1 + 2 * size * h(0, 1)));
      rows.forEach((n, l) => { for (let i = 0; i < n; i++) { const p = at(0.1 * (h(l * 9 + i, 2) - 0.5), (i - (n - 1) / 2) * 0.36); items.bundle.push({ m: mat(p[0], y + 0.17 + l * 0.3, p[1], 0, ry + 0.08 * (h(l * 9 + i, 3) - 0.5), 0, 0.95 + 0.25 * h(l * 9 + i, 4), 1, 1), c: pick(REED_TINTS, h(l * 9 + i, 5)) }); } });
    } else if (kind === 'logs') {
      const base = Math.round(3 + 2 * size * h(0, 1)), len = 4 + 2.6 * h(0, 2);
      for (let l = 0, n = base; n > 0 && l < 3; l++, n--) for (let i = 0; i < n; i++) {
        const p = at(0.4 * (h(l * 9 + i, 3) - 0.5), (i - (n - 1) / 2) * 0.4), k = 0.85 + 0.3 * h(l * 9 + i, 4);
        items.log.push({ m: mat(p[0], y + 0.19 + l * 0.34, p[1], 0, ry + 0.03 * (h(l * 9 + i, 5) - 0.5), 0, len * (0.85 + 0.15 * h(l * 9 + i, 6)), k, k), c: srgb(tone(WOOD.log, 0.75 + 0.6 * h(l * 9 + i, 7), 0.08 * (h(l * 9 + i, 8) - 0.5))) });
      }
    } else if (kind === 'lumps') {
      const n = Math.round(4 + 5 * size * h(0, 1));
      for (let i = 0; i < n; i++) { const r = 0.55 * Math.sqrt(h(i, 2)), a = 6.28 * h(i, 3), p = at(r * Math.cos(a), r * Math.sin(a)), k = 0.7 + 0.9 * h(i, 4); items.lump.push({ m: mat(p[0], y + 0.1 * k, p[1], h(i, 5), 6.28 * h(i, 6), h(i, 7), k, k * 0.7, k), c: 0xffffff }); }
    } else if (kind === 'bricks') {
      const lx = 1.02 + 0.34 * Math.round(2 * h(0, 1)), lz = 0.68, hgt = 0.0858 * Math.round(5 + 5 * size * h(0, 2));
      brick.push(geom.paint(geom.box({ x, z, y0: y - 0.05, y1: y + hgt, sx: lx, sz: lz, rotDeg }), [0.96, 0.93, 0.9]));
      if (h(0, 3) < 0.6) { const p = at(lx * 0.5 + 0.5, 0.1); brick.push(geom.paint(geom.box({ x: p[0], z: p[1], y0: y - 0.05, y1: y + hgt * 0.55, sx: 0.68, sz: lz, rotDeg }), [0.9, 0.9, 0.88])); }
    } else if (kind === 'slabs') {
      const n = Math.round(2 + 3 * size * h(0, 1));
      for (let i = 0; i < n; i++) { const p = at(0.08 * (h(i, 2) - 0.5), 0.08 * (h(i, 3) - 0.5)); stone.push(geom.paint(geom.box({ x: p[0], z: p[1], y0: y + i * 0.16 - (i === 0 ? 0.05 : 0), y1: y + i * 0.16 + 0.14, sx: 1.3, sz: 0.85, rotDeg: rotDeg + 5 * (h(i, 4) - 0.5) }), [0.9 + 0.1 * h(i, 5), 0.9 + 0.08 * h(i, 5), 0.88]));
      }
    }
  }
  /** A file of jars, sacks and baskets along the foot of a wall on a bank line. */
  function row(line, s0, s1, d, y, seed) {
    let s = Math.min(s0, s1) + 0.3; const end = Math.max(s0, s1) - 0.3; let i = 0;
    while (s < end) {
      const k = hash2(seed, i, 81), f = line.at(s), ry = Math.atan2(-f.tz, f.tx), p = line.point(s, d + 0.06 * (hash2(seed, i, 82) - 0.5));
      if (k < 0.5) { const sc = 0.8 + 0.35 * hash2(seed, i, 83); items.jar.push({ m: mat(p[0], y, p[1], 0, 6.28 * k, 0, sc * 0.92, sc, sc * 0.92), c: pick(JAR_TINTS, hash2(seed, i, 84)) }); s += 0.52 * sc + 0.06; }
      else if (k < 0.78) { const n = 1 + Math.floor(3 * hash2(seed, i, 85)); for (let l = 0; l < n; l++) items.sack.push({ m: mat(p[0], y + 0.15 + l * 0.27, p[1], 0, ry + 0.3 * (hash2(seed, i * 5 + l, 86) - 0.5), 0, 0.74, 0.3, 0.44), c: pick(SACK_TINTS, hash2(seed, i * 5 + l, 87)) }); s += 0.86; }
      else if (k < 0.92) { const sc = 0.8 + 0.4 * hash2(seed, i, 88); items.basket.push({ m: mat(p[0], y, p[1], 0, 6.28 * k, 0, sc), c: pick(REED_TINTS, hash2(seed, i, 89)) }); s += 0.66 * sc + 0.05; }
      else s += 0.9 + 1.5 * hash2(seed, i, 90);
      i++;
    }
  }

  // --------------------------------------------------------------------------------------------- sheds ----
  /** Reed-mat shed on palm posts: w across, d along (local z), floor at y; the mat roof falls 0.25 m to the front (local +x). */
  function shed(x, z, rotDeg, w, d, y, seed, o = {}) {
    const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
    const hBack = o.h ?? 2.55, hFront = hBack - 0.28, nb = Math.max(2, Math.round(d / 2.4)), col = tone(WOOD.log, 0.95);
    const yOf = (lx) => y + hFront + ((hBack - hFront) * (w / 2 - lx)) / w;
    for (let i = 0; i <= nb; i++) for (const lx of [-w / 2, w / 2]) {
      const p = at(lx + 0.05 * (hash2(seed, i, 61) - 0.5), -d / 2 + (d * i) / nb), g = Math.min(y, ground.height(p[0], p[1]));
      palm.push(pole([p[0], g - 0.5, p[1]], [p[0], yOf(lx) - 0.02, p[1]], 0.075, tone(col, 0.8 + 0.4 * hash2(seed, i * 2 + (lx > 0 ? 1 : 0), 62))));
    }
    // plates on the posts, rafters across, the mat on top
    for (const lx of [-w / 2, w / 2]) { const a = at(lx, -d / 2 - 0.3), b2 = at(lx, d / 2 + 0.3); palm.push(pole([a[0], yOf(lx), a[1]], [b2[0], yOf(lx), b2[1]], 0.06, tone(col, 0.9))); }
    const nr = Math.max(3, Math.round(d / 1.1));
    for (let i = 0; i <= nr; i++) { const lz = -d / 2 + (d * i) / nr, a = at(-w / 2 - 0.35, lz), b2 = at(w / 2 + 0.35, lz); palm.push(pole([a[0], yOf(-w / 2 - 0.35) + 0.06, a[1]], [b2[0], yOf(w / 2 + 0.35) + 0.06, b2[1]], 0.04, tone(col, 1.05), 5)); }
    // the roof in two or three mats that overlap, each a little differently faded
    const nm = Math.max(2, Math.round(d / 2.6));
    for (let i = 0; i < nm; i++) {
      const z0 = -d / 2 - 0.4 + ((d + 0.8) * i) / nm - (i ? 0.12 : 0), z1 = -d / 2 - 0.4 + ((d + 0.8) * (i + 1)) / nm, lift = 0.11 + 0.03 * (i % 2), x0 = -w / 2 - 0.45, x1 = w / 2 + 0.45, k = 0.84 + 0.3 * hash2(seed, i, 63);
      const A = at(x0, z0), B = at(x1, z0), C = at(x1, z1), D = at(x0, z1);
      reed.push(slab([A[0], yOf(x0) + lift, A[1]], [B[0], yOf(x1) + lift, B[1]], [C[0], yOf(x1) + lift, C[1]], [D[0], yOf(x0) + lift, D[1]], 0.05, [k, k * 0.98, k * 0.92]));
    }
    // a mat screen on the back (and on one end)
    if (o.screen !== false) {
      const A = at(-w / 2 - 0.04, -d / 2), B = at(-w / 2 - 0.04, d / 2), top = y + hBack - 0.35;
      reed.push(geom.paint(geom.wall([A, B], { thickness: 0.05, base: y + 0.12, top, bottom: true }), [0.82, 0.8, 0.74]));
      if (hash1(seed, 64) < 0.6) { const E = at(-w / 2, -d / 2 - 0.03), F = at(w * 0.2, -d / 2 - 0.03); reed.push(geom.paint(geom.wall([E, F], { thickness: 0.05, base: y + 0.12, top: top - 0.25, bottom: true }), [0.9, 0.86, 0.78])); }
    }
    tall.push({ x, y, z, h: hBack });
    R.sheds.push({ center: [x, z], rotDeg, size: [w, d], floor: y, eaves: y + hFront });
    // the watchman's lamp hangs from the front plate
    { const lp = at(w / 2 - 0.25, d * 0.2); fires.push({ kind: 'lamp', pos: [lp[0], y + hFront - 0.45, lp[1]], size: 1 }); }
    stats.sheds++;
    // what is kept under it
    const kinds = ['sacks', 'jars', 'baskets', 'jars', 'sacks', 'bundles'];
    for (let i = 0; i < nb; i++) { const p = at(-0.5 + 0.5 * hash2(seed, i, 65), -d / 2 + (d * (i + 0.5)) / nb); stack(pick(kinds, hash2(seed, i, 66)), p[0], y, p[1], rotDeg + 90 * Math.round(hash2(seed, i, 67)), seed * 17 + i, 1.2); }
  }
  /** A small shade on four poles (a tally clerk's place on the quay wall). */
  function shade(x, z, rotDeg, w, d, y, seed) {
    const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c], h0 = 2.05, h1 = 1.85;
    const P = [[-w / 2, -d / 2, h0], [w / 2, -d / 2, h1], [w / 2, d / 2, h1], [-w / 2, d / 2, h0]].map(([lx, lz, hh]) => { const p = at(lx, lz); return [p[0], y + hh, p[1]]; });
    for (const p of P) palm.push(pole([p[0], y - 0.05, p[2]], [p[0], p[1], p[2]], 0.05, tone(WOOD.log, 0.9), 5));
    const k = 0.86 + 0.25 * hash1(seed, 68), e = 0.25, Pm = [[-w / 2 - e, -d / 2 - e, h0 + 0.05], [w / 2 + e, -d / 2 - e, h1 + 0.03], [w / 2 + e, d / 2 + e, h1 + 0.03], [-w / 2 - e, d / 2 + e, h0 + 0.05]].map(([lx, lz, hh]) => { const p = at(lx, lz); return [p[0], y + hh, p[1]]; });
    reed.push(slab(Pm[0], Pm[1], Pm[2], Pm[3], 0.04, [k, k * 0.97, k * 0.9]));
    tall.push({ x, y, z, h: h0 });
    stats.shades++;
  }

  // ----------------------------------------------------------------------------------- along the quays ----
  for (const g of R.ghats) {
    const line = quays.lines[g.bank] || null; if (!line) continue;
    const seed = Math.round(g.s * 3) + (g.bank === 'east' ? 0 : 5000), dLow = D_LOW - Q.BULGE;
    // goods on the widened walkway: beyond the foot of the upper flight, clear of the walking line and of the posts
    const sA = g.waterStair[0] - g.dir * 2.6, sB = g.waterStair[0] - g.dir * 0.4;
    const kinds = ['jars', 'sacks', 'baskets', 'sacks', 'jars', 'bundles', 'bricks', 'lumps'];
    const p = line.point((sA + sB) / 2, dLow + 1.05), f = line.at(g.s), rot = M.dirToAz(f.tx, f.tz) - 90;
    stack(pick(kinds, hash1(seed, 1)), p[0], WALK, p[1], rot, seed, 0.9);
    if (hash1(seed, 2) < 0.75) { const q = line.point(g.s - g.dir * 2.3, dLow + 0.95); stack(pick(kinds, hash1(seed, 3)), q[0], WALK, q[1], rot, seed + 1, 0.7); }
    // a file of jars and sacks at the foot of the wall on the far side of the opening
    row(line, g.s - g.dir * 2.2, g.s - g.dir * (5 + 6 * hash1(seed, 4)), Q.D_UP - 0.29, WALK, seed);
    // a shade on the quay wall beside the opening, on the side away from the stair
    if (hash1(seed, 5) < 0.7) {
      const T = g.T, q = line.point(g.s - g.dir * (Q.OPEN_W / 2 + 2.0), Q.D_UP + 1.75);
      shade(q[0], q[1], M.dirToAz(f.tx, f.tz), 2.2, 2.6, T, seed);
      const jq = line.point(g.s - g.dir * (Q.OPEN_W / 2 + 1.9), Q.D_UP + 2.4); stack('jars', jq[0], T, jq[1], rot, seed + 2, 0.4);
    }
  }
  // ladders down to the water and reed fenders where boats lie against the plain quay
  {
    const FACE = (y) => D_LOW - Q.BL * (WALK - y);
    let i = 0;
    for (const mo of R.moorings) {
      if (mo.kind !== 'quay' || !mo.plain) continue;
      const line = quays.lines[mo.bank]; if (!line) continue;
      const s = mo.s, seed = Math.round(s * 5) + (mo.bank === 'east' ? 0 : 7000);
      for (const off of [-2.6, 2.4]) {
        const p = line.point(s + off, FACE(-2.3) - 0.2), top = line.point(s + off, D_LOW + 0.12);
        items.bundle.push({ m: mat(p[0], -2.35, p[1], 0, 0, Math.PI / 2, 0.8, 1.25, 1.25), c: pick(REED_TINTS, hash2(seed, off > 0 ? 1 : 0, 91)) });
        small.push(beam([p[0], -1.6, p[1]], [top[0], WALK + 0.02, top[1]], 0.03, 0.03, [0.3, 0.25, 0.17]));
        stats.fenders++;
      }
      // what was unloaded here stands at the foot of the wall
      if (hash1(seed, 96) < 0.55) row(line, s - 1.5 - 4 * hash1(seed, 97), s + 1 + 3 * hash1(seed, 98), Q.D_UP - 0.29, WALK, seed + 9);
      if (i++ % 2 === 0) {
        const col = tone(WOOD.rail, 0.9);
        for (const off of [-0.24, 0.24]) { const a = line.point(s + 5.2 + off, FACE(-3.6) - 0.1), b2 = line.point(s + 5.2 + off, D_LOW - 0.06); small.push(beam([a[0], -3.6, a[1]], [b2[0], WALK + 0.75, b2[1]], 0.07, 0.06, col)); }
        for (let y = -3.2; y < WALK + 0.6; y += 0.36) { const a = line.point(s + 5.2 - 0.27, FACE(y) - 0.08 + 0.0), b2 = line.point(s + 5.2 + 0.27, FACE(y) - 0.08); small.push(beam([a[0], y, a[1]], [b2[0], y, b2[1]], 0.04, 0.045, col)); }
        stats.ladders++;
      }
    }
  }
  // the Libil-hegalla slot: planks carry the walkway across, a timber footbridge carries the quay lane
  for (const sl of R.slots) {
    const line = sl.line, a = sl.s0 - 0.5, b2 = sl.s1 + 0.5, col = tone(WOOD.plank, 0.9);
    for (let k = 0; k < 4; k++) { const d0 = D_LOW + 0.12 + k * 0.36; timber.push(geom.paint(lineBox(geom, line, a, b2, d0, d0 + 0.33, WALK - 0.02, WALK + 0.09).toGeometry(), tone(WOOD.plank, 0.8 + 0.3 * hash1(k, 93)))); }
    const g = Math.max(ground.height(...line.point(a - 1.5, 8)), ground.height(...line.point(b2 + 1.5, 8)));
    for (let k = 0; k < 6; k++) { const d0 = D_BACK + 1.3 + k * 1.0; timber.push(geom.paint(lineBox(geom, line, a - 1.0, b2 + 1.0, d0, d0 + 0.28, g - 0.28, g + 0.04).toGeometry(), tone(WOOD.beam, 0.9 + 0.3 * hash1(k, 94)))); }
    for (let s = a - 1.0, k = 0; s < b2 + 0.7; s += 0.33, k++) timber.push(geom.paint(lineBox(geom, line, s, s + 0.3, D_BACK + 1.1, D_BACK + 6.8, g + 0.04, g + 0.13).toGeometry(), tone(WOOD.plank, 0.75 + 0.4 * hash1(k, 95))));
    for (const d0 of [D_BACK + 1.15, D_BACK + 6.65]) { timber.push(geom.paint(lineBox(geom, line, a - 0.9, b2 + 0.9, d0, d0 + 0.1, g + 0.95, g + 1.05).toGeometry(), col)); for (const s of [a - 0.8, (a + b2) / 2, b2 + 0.7]) timber.push(geom.paint(lineBox(geom, line, s, s + 0.1, d0, d0 + 0.1, g + 0.1, g + 0.95).toGeometry(), col)); }
    R.footbridges = (R.footbridges || []); R.footbridges.push({ from: line.point(a - 1, D_BACK + 3.95), to: line.point(b2 + 1, D_BACK + 3.95), level: g + 0.13, width: 5.5 });
  }

  // ---------------------------------------------------------------------------- the main quay: bridge heads ----
  for (const sh of plan.sheds) {
    const y = ground.height(sh.x, sh.z) + 0.04;
    shed(sh.x, sh.z, sh.rotDeg, sh.w, sh.d, y, Math.round(sh.x * 3 + sh.z * 7));
    // goods standing in the open beside the shed
    const c = Math.cos(sh.rotDeg * M.DEG), s = Math.sin(sh.rotDeg * M.DEG), at = (lx, lz) => [sh.x + lx * c - lz * s, sh.z + lx * s + lz * c];
    const seed = Math.round(sh.x * 5 + sh.z * 3), kinds = ['logs', 'bricks', 'slabs', 'lumps', 'bundles', 'jars', 'sacks'];
    for (let i = 0; i < 3; i++) {
      const p = at(sh.w / 2 + 1.6 + 1.2 * hash2(seed, i, 71), -sh.d / 2 + 1 + (sh.d - 2) * (i / 2));
      if (!layout.isFree(p[0], p[1], 1.0) && !plan.sheds.some((q) => Math.hypot(q.x - p[0], q.z - p[1]) < 6)) continue;
      const kind = pick(kinds, hash2(seed, i, 72));
      stack(kind, p[0], ground.height(p[0], p[1]) + 0.03, p[1], sh.rotDeg + (kind === 'logs' || kind === 'bundles' ? 90 : 0) + 12 * (hash2(seed, i, 73) - 0.5), seed + i, 1.3);
    }
  }
  // on the older quay at the bridge heads goods stand along the water's edge (clear of the posts and of the stair)
  for (const bank of ['east', 'west']) {
    const q = R[bank]; if (!q) continue;
    const line = q.line, T = q.Tlow(), kinds = ['slabs', 'logs', 'bricks', 'sacks', 'jars', 'lumps', 'baskets', 'bundles'];
    for (let s = q.sBrN + 3, i = 0; s < q.sBrS - 2; s += 4.6 + 2 * hash2(i, bank.length, 74), i++) {
      if (Math.abs(s - q.sAb) < 9.5 || (q.lowStair && s > q.lowStair[0] - 1.5 && s < q.lowStair[1] + 1.5)) continue;
      const f = line.at(s), p = line.point(s, 2.9 + 0.8 * hash2(i, bank.length, 75)), kind = pick(kinds, hash2(i, bank.length, 76));
      if (!layout.isFree(p[0], p[1], 0.8)) continue;
      stack(kind, p[0], ground.height(p[0], p[1]) + 0.03, p[1], M.dirToAz(f.tx, f.tz) - (kind === 'logs' || kind === 'bundles' ? 90 : 0), i + (bank === 'east' ? 300 : 600), 1.1);
    }
  }
  // fire bowls and torch cressets of the bridge heads (the fires themselves are emitters; nightfx draws them)
  for (const h of R.bridge ? R.bridge.heads : []) {
    if (h.kind === 'torch') items.bowl.push({ m: mat(h.bowl[0], h.bowl[1] - 0.02, h.bowl[2], 0, 0, 0, 0.5, 0.5, 0.5), c: 0x8a5a3a });
    else { brick.push(geom.paint(geom.box({ x: h.bowl[0], z: h.bowl[2], y0: h.bowl[1] - 0.4, y1: h.bowl[1] + 0.4, sx: 0.7, sz: 0.7, rotDeg: world.bridge.rotationDeg }), BRICK)); items.bowl.push({ m: mat(h.bowl[0], h.bowl[1] + 0.4, h.bowl[2], 0, 0, 0, 1.15, 0.8, 1.15), c: 0x9a6a48 }); }
  }

  // --------------------------------------------------------------------------------- landings on the mud ----
  for (const Ld of plan.landings) {
    const o = Ld.origin, n = Ld.n, t = Ld.t, P = (a, d) => [o[0] + t[0] * a + n[0] * d, o[1] + t[1] * a + n[1] * d], G = (a, d) => { const p = P(a, d); return ground.height(p[0], p[1]); };
    const seed = Math.round(o[0] * 3 + o[1] * 5), azN = M.dirToAz(n[0], n[1]), azT = M.dirToAz(t[0], t[1]);
    const col = tone(WOOD.log, 0.9);
    stats.landings++;
    // mooring stakes along the water's edge
    for (let a = -13; a <= 13.1; a += 3.7) {
      if (Ld.jetty && Math.abs(a) < 2.5) continue;
      const d = 0.9 + 1.4 * hash2(seed, Math.round(a * 3), 51), p = P(a + 0.6 * (hash2(seed, Math.round(a * 3), 52) - 0.5), d), y = ground.height(p[0], p[1]), lean = 0.12 * (hash2(seed, Math.round(a * 3), 53) - 0.5);
      palm.push(pole([p[0], y - 0.7, p[1]], [p[0] + lean, y + 0.9 + 0.5 * hash2(seed, Math.round(a * 3), 54), p[1] + lean], 0.08, tone(col, 0.7 + 0.4 * hash2(seed, Math.round(a * 3), 55))));
    }
    if (Ld.jetty) {
      // a staging of palm logs: 2.2 m wide, from the foreshore 9 m out, 0.7 m above the water
      const yj = world.river.waterLevel + 0.72, d0 = 3.6, d1 = -9;
      for (let d = d0 - 0.2, i = 0; d > d1; d -= 0.31, i++) {
        const a = P(-1.1 - 0.06 * hash2(seed, i, 56), d), b2 = P(1.1 + 0.06 * hash2(seed, i, 57), d);
        timber.push(beam([a[0], yj - 0.045, a[1]], [b2[0], yj - 0.045, b2[1]], 0.28, 0.09, tone(WOOD.plank, 0.7 + 0.45 * hash2(seed, i, 58))));
      }
      for (const a of [-0.85, 0.85]) { const p = P(a, d0), q = P(a, d1); palm.push(pole([p[0], yj - 0.2, p[1]], [q[0], yj - 0.2, q[1]], 0.1, col)); }
      for (let d = 2.4, i = 0; d > d1 - 0.1; d -= 2.8, i++) for (const a of [-1.0, 1.0]) {
        const p = P(a, d), bed = ground.height(p[0], p[1]), head = d < d1 + 3.2 || (i % 2 === 0 && a > 0);
        palm.push(pole([p[0], bed - 1.2, p[1]], [p[0], yj + (head ? 0.85 : -0.1), p[1]], 0.11, tone(col, 0.75 + 0.3 * hash2(seed, i * 2 + (a > 0 ? 1 : 0), 59)), 7));
      }
      // the trodden way up the bank
      const way = []; for (let d = d0 - 0.4; d <= (Ld.deep ? 23 : 10); d += 1.6) way.push(P(0.5 * Math.sin(d * 0.3), d));
      earth.push(geom.ribbon(way, { width: 2.6, y: (x, z) => ground.height(x, z) + 0.07 }));
      if (ctx.water.addObstacle) ctx.water.addObstacle([P(-1.2, 0.4), P(1.2, 0.4), P(1.2, d1), P(-1.2, d1)], { id: 'riverworks:jetty:' + Ld.id });
      Ld.jettyHead = P(0, d1); Ld.jettyLevel = yj;
    }
    if (Ld.slip) {
      // a slipway: two runners of palm logs down the foreshore into the water, sleepers across, rollers lying about
      const a0 = Ld.jetty ? 8.5 : -2;
      for (const a of [a0 - 0.75, a0 + 0.75]) for (let d = -2.5; d < 10.5; d += 3.2) { const p = P(a, d), q = P(a, Math.min(10.5, d + 3.3)); palm.push(pole([p[0], ground.height(p[0], p[1]) + 0.1, p[1]], [q[0], ground.height(q[0], q[1]) + 0.1, q[1]], 0.11, tone(col, 0.8 + 0.3 * hash2(seed, Math.round(d * 3 + a), 41)), 7)); }
      for (let d = -1.6; d < 10; d += 1.45) { const p = P(a0 - 1.15, d), q = P(a0 + 1.15, d); palm.push(pole([p[0], ground.height(p[0], p[1]) + 0.02, p[1]], [q[0], ground.height(q[0], q[1]) + 0.02, q[1]], 0.075, tone(col, 0.7 + 0.3 * hash2(seed, Math.round(d * 3), 42)), 6)); }
      for (let i = 0; i < 4; i++) { const p = P(a0 + 2.2 + 1.5 * hash2(seed, i, 43), 3 + 5 * hash2(seed, i, 44)); items.log.push({ m: mat(p[0], ground.height(p[0], p[1]) + 0.12, p[1], 0, 6.28 * hash2(seed, i, 45), 0, 1.6, 0.6, 0.6), c: srgb(tone(WOOD.log, 0.8)) }); }
    }
    if (Ld.deep) {
      // on the bank top: a shed, timber from the rafts, reed bundles, jars
      if (Ld.shed) { const p = P(-7.5, 20.2); shed(p[0], p[1], azN + 90, SHED.w, 6, ground.height(p[0], p[1]) + 0.04, seed + 3, { h: 2.4 }); }
      const p1 = P(6.5, 17.5), p2 = P(8, 21.5), p3 = P(-1.5, 19.5);
      stack(Ld.logs ? 'logs' : 'bundles', p1[0], ground.height(p1[0], p1[1]) + 0.03, p1[1], azT - 90, seed + 4, 1.4);
      stack(Ld.logs ? 'logs' : 'sacks', p2[0], ground.height(p2[0], p2[1]) + 0.03, p2[1], azT - 90 + 8, seed + 5, 1.2);
      stack('jars', p3[0], ground.height(p3[0], p3[1]) + 0.03, p3[1], azT, seed + 6, 1.0);
    }
    if (Ld.tar) {
      // caulking: a hearth of baked bricks with a bitumen pot on the upper foreshore, lumps beside it; it smokes by day
      const p = P(Ld.jetty ? -6 : 6.5, 9.5), y = ground.height(p[0], p[1]);
      brick.push(geom.paint(geom.box({ x: p[0], z: p[1], y0: y - 0.3, y1: y + 0.3, sx: 0.8, sz: 0.8, rotDeg: azT }), BRICK));
      items.bowl.push({ m: mat(p[0], y + 0.3, p[1], 0, 0, 0, 1.0, 0.75, 1.0), c: 0x3a3028 });
      const q = P(Ld.jetty ? -7.3 : 7.8, 9.9); stack('lumps', q[0], ground.height(q[0], q[1]) + 0.02, q[1], 0, seed + 7, 1);
      fires.push({ kind: 'smoke', pos: [p[0], y + 0.75, p[1]], size: 0.8 });
    }
    R.landings.push({ id: Ld.id, kind: Ld.kind, center: P(0, Ld.deep ? 12 : 6), polygon: Ld.polygon, n: Ld.n, t: Ld.t, jetty: !!Ld.jetty, deep: Ld.deep });
  }

  // ---------------------------------------------------------------------------------------------- props ----
  /**
   * Every small thing (jars, sacks, baskets, bundles, logs, lumps, bowls) is baked into ONE static mesh that shares
   * the white timber material of the module: the tone of each piece is in its vertex colours, so the goods of 3 km
   * of quay cost no draw call of their own. Returns the list of geometries (world space, painted).
   */
  function bakeProps() {
    const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const lin = (id, k = 1) => { const c = materials.color(id); return [c.r * k, c.g * k, c.b * k]; };
    const defs = {
      jar: { g: lathe([[0, 0], [0.14, 0.01], [0.26, 0.3], [0.2, 0.56], [0.11, 0.68], [0.135, 0.75]], 7), base: lin('bakedBrickRed', 0.95) },
      sack: { g: new THREE.SphereGeometry(0.5, 6, 3), base: lin('woolOatmeal', 0.9) },
      basket: { g: geom.merge([new THREE.CylinderGeometry(0.3, 0.21, 0.4, 8, 1, true).translate(0, 0.2, 0), new THREE.CylinderGeometry(0.33, 0.33, 0.05, 8).translate(0, 0.4, 0)]), base: lin('reedMat', 0.9) },
      bundle: { g: new THREE.CylinderGeometry(0.16, 0.18, 1.8, 6).rotateZ(Math.PI / 2), base: lin('reedMat', 0.8) },
      log: { g: new THREE.CylinderGeometry(0.17, 0.2, 1, 7).rotateZ(Math.PI / 2), base: [1, 1, 1] },
      lump: { g: new THREE.IcosahedronGeometry(0.22, 0), base: lin('bitumen', 1.3) },
      bowl: { g: lathe([[0, 0], [0.16, 0], [0.32, 0.16], [0.36, 0.3], [0.33, 0.31], [0.28, 0.2], [0, 0.12]], 8), base: lin('bakedBrickRed', 0.8) },
    };
    const out = [], counts = {}, tmp = new THREE.Color();
    for (const [k, list] of Object.entries(items)) {
      counts[k] = list.length;
      const d = defs[k];
      for (const it of list) {
        const g = d.g.clone().applyMatrix4(it.m);
        tmp.set(it.c);                                             // an sRGB tint, as an instance colour would be
        out.push(geom.paint(g, [d.base[0] * tmp.r, d.base[1] * tmp.g, d.base[2] * tmp.b]));
      }
      d.g.dispose();
    }
    stats.props = counts;
    return out;
  }

  checks.push({ name: 'reed-mat sheds at the main quay and the landings / landings on the mud banks', value: `${stats.sheds} / ${plan.landings.length}`, expect: '>= 4 / >= 4', pass: stats.sheds >= 4 && plan.landings.length >= 4 });
  return { brick, stone, timber, palm, small, reed, earth, fires, checks, stats, tall, bakeProps };
}

// --------------------------------------------------------------------------------------------- moorings ----
/**
 * The mooring list (ENGINE.md section 4): { x, z, headingDeg, kind: 'quay' | 'landing' | 'bank' } plus
 *   id, bank, rank (0 = the berths the film sees best; the list is sorted by it), length (longest boat that fits),
 *   nx, nz (unit vector from the boat toward the masonry face or up the bank), clear (m from (x, z) to that face
 *   or to the water's edge), walk: [x, y, z] (where a porter stands for this berth).
 * 'quay': the boat lies ALONG the quay, bow upstream. 'landing': beside a timber staging, bow to the bank.
 * 'bank': drawn up on the mud, bow up the bank; (x, z) lies just afloat at the water's edge (clear = 0.45 m).
 */
export function buildMoorings(ctx, R, plan) {
  const { ground, world, film } = ctx;
  const WALK = world.levels.quayWalkwayRiver, D_LOW = Q.D_UP - Q.WALK_W, FACE = D_LOW - Q.BL * (WALK + 3);
  const out = R.moorings, b = world.bridge;
  const boatShot = film.shots.find((s) => s.raw && s.raw.ridesBoat) || film.shots.find((s) => s.n === 5);
  const cam = boatShot ? film.pathPoseAt(boatShot.tHold ?? boatShot.mid) : { pos: [-150, 0, -335], look: [-110, 16, 110] };
  const vd = [cam.look[0] - cam.pos[0], cam.look[2] - cam.pos[2]], vl = Math.hypot(vd[0], vd[1]) || 1;
  const ax = M.azToDir(b.axisAzimuthDeg), toAxis = (x, z) => Math.abs((x - b.x) * -ax[1] + (z - b.z) * ax[0]);     // distance from the bridge axis
  /** 0 = in front of the boat camera within 300 m; then by distance from that reach and from the bridge. */
  const rankOf = (x, z) => {
    const rx = x - cam.pos[0], rz = z - cam.pos[2], fwd = (rx * vd[0] + rz * vd[1]) / vl, side = Math.abs(rx * vd[1] - rz * vd[0]) / vl;
    const inView = fwd > 60 && side < fwd * 0.85;
    return +(inView ? fwd / 60 : 8 + Math.min(Math.hypot(rx, rz), Math.hypot(x - b.x, z - b.z) + 150) / 60).toFixed(1);
  };
  let id = 0;
  const push = (m) => { m.id = 'm' + id++; m.rank = rankOf(m.x, m.z); out.push(m); return m; };
  const add = (line, s, face, bank, o = {}) => {
    const f = line.at(s), nl = Math.hypot(f.nx, f.nz) || 1, nx = f.nx / nl, nz = f.nz / nl, clear = o.clear ?? 2.6;
    const x = f.x + nx * (face - clear), z = f.z + nz * (face - clear);
    if (!ground.isWater(x, z) || toAxis(x, z) < 16) return null;
    // bows upstream (north): the current holds the boat off its stern line
    const up = f.tz < 0 ? 1 : -1, headingDeg = M.mod(M.dirToAz(f.tx * up, f.tz * up), 360);
    const w = line.point(s, o.walkD ?? (D_LOW + Q.D_UP) / 2);
    return push({ x, z, headingDeg, kind: 'quay', bank, nx, nz, clear, walk: [w[0], o.walkY ?? WALK, w[1]], length: o.length ?? 12, s, plain: !!o.plain });
  };
  for (const bank of ['east', 'west']) {
    const q = R[bank]; if (!q) continue;
    const line = q.line, gh = R.ghats.filter((g) => g.bank === bank);
    const s0 = bank === 'east' ? q.sCorner + 6 : 8;
    for (let s = s0 + 9; s < line.length - 12; s += 19 + 6 * hash1(Math.round(s), 91)) {
      if (gh.some((g) => s > g.extent[0] - 9 && s < g.extent[1] + 9)) continue;
      if (s > q.sBrN - 8 && s < q.sBrS + 8) continue;
      if (R.slots.some((sl) => sl.line === line && s > sl.s0 - 9 && s < sl.s1 + 9)) continue;
      add(line, s, FACE, bank, { length: 14, plain: true });
    }
    // at every stair: one berth alongside the widened walkway, a small one at the foot of the water stair
    for (const g of gh) {
      add(line, (g.s + g.waterStair[0]) / 2, g.face, bank, { length: 9, walkD: D_LOW - Q.BULGE + 0.9 });
      add(line, g.waterStair[1] + g.dir * 3.4, FACE, bank, { length: 5, clear: 2.0 });
    }
    // the older quay at the bridge head: boats lie against its sheer face
    for (const s of [q.sBrN + 5, q.sAb + 15, q.sAb + 28, q.sAb - 14, q.sBrS - 6]) {
      if (s < q.sBrN + 3 || s > q.sBrS - 3 || Math.abs(s - q.sAb) < 11 || (q.lowStair && s > q.lowStair[0] - 7 && s < q.lowStair[1] + 7)) continue;
      add(line, s, 0, bank, { length: 10, walkD: 1.1, walkY: q.Tlow() });
    }
  }
  // landings and beaching places on the mud banks
  for (const Ld of plan.landings) {
    const o = Ld.origin, n = Ld.n, t = Ld.t, P = (a, d) => [o[0] + t[0] * a + n[0] * d, o[1] + t[1] * a + n[1] * d], azN = M.dirToAz(n[0], n[1]);
    const h = (i) => hash2(Math.round(o[0]), i, 97);
    if (Ld.jetty) {
      // beside the staging, bow to the bank: the "face" of these berths is the side of the staging
      for (const sd of [-1, 1]) {
        const p = P(sd * 2.9, -5.2); if (!ground.isWater(p[0], p[1])) continue;
        const w = P(sd * 0.6, -5.2);
        push({ x: p[0], z: p[1], headingDeg: M.mod(azN, 360), kind: 'landing', bank: Ld.id, nx: -sd * t[0], nz: -sd * t[1], clear: 1.8, walk: [w[0], world.river.waterLevel + 0.72, w[1]], length: 8 });
      }
    }
    // drawn up on the mud: (x, z) just afloat at the water's edge, the bow goes up the bank
    const spots = Ld.jetty ? [-12.5, -8.2, 12.2] : [-12, -7.6, -3.2, 3.4, 7.8, 12.2];
    spots.forEach((a, i) => {
      if (Ld.slip && Math.abs(a - (Ld.jetty ? 8.5 : -2)) < 3) return;
      const p = P(a + 0.8 * (h(i) - 0.5), -0.45); if (!ground.isWater(p[0], p[1])) return;
      const w = P(a, 2.5);
      push({ x: p[0], z: p[1], headingDeg: M.mod(azN + 24 * (h(i + 20) - 0.5), 360), kind: 'bank', bank: Ld.id, nx: n[0], nz: n[1], clear: 0.45, walk: [w[0], ground.height(w[0], w[1]), w[1]], length: 5 + 3.5 * h(i + 40) });
    });
  }
  out.sort((p, q) => p.rank - q.rank);
  return out;
}
