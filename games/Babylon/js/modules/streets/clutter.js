// js/modules/streets/clutter.js — what lies in a trodden street where a camera passes close (R5 3.2: "potsherds,
// ash and straw trodden in"; street levels rise with dumped household rubbish): potsherds, brick bats and clods,
// heaps of ash and sweepings against the walls. Static geometry, one pottery material tinted per vertex; the
// heaps go into the earth mesh itself. Built only in the eye and hero zones of net.js.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { vnoise, BASE } from './surface.js';

export function buildClutter(ctx, net, surf) {
  const { geom, materials, layout } = ctx;
  const rng = ctx.module.rng.fork('clutter');
  const stats = { sherds: 0, bats: 0, heaps: 0 };
  const flat = { pos: [], nor: [], col: [], idx: [], n: 0 }, solid = { pos: [], nor: [], col: [], idx: [], n: 0 };
  const lin = (hex) => { const c = new ctx.THREE.Color(hex); return [c.r, c.g, c.b]; };
  // fired clay from pale buff to red-brown and smoke-blackened, relative to the pottery material's own colour (white variant)
  const CLAY = [lin(0xb9a486), lin(0xa98e72), lin(0x9c7e64), lin(0xc4b294), lin(0x85705c), lin(0x5e5248), lin(0xb09a7c), lin(0xa5927a)];
  const STONE = [lin(0x9a8f7c), lin(0x857a68), lin(0xa89a80), lin(0x6e665a)];
  const DUNG = [lin(0x5c4f3a), lin(0x6b5a40), lin(0x4c4232)];
  // (the frozen materials stub has no presets: fall back to the plain brick id there)
  const pottery = materials.preset ? materials.preset('pottery', { name: 'streets-sherds', color: 0xffffff }) : materials.variant('bakedBrickRed', { name: 'streets-sherds', color: 0xffffff });

  /** a potsherd: a small irregular plate lying on the surface, slightly curved up at one edge */
  function sherd(x, y, z, size, rot, tint, tilt) {
    const B = flat, n = 4 + (rng.next() < 0.4 ? 1 : 0), c = Math.cos(rot), s = Math.sin(rot), v0 = B.n;
    const k = 0.75 + 0.5 * rng.next();
    B.pos.push(x, y + 0.012 + size * 0.1, z); B.nor.push(0, 1, 0); B.col.push(tint[0] * k, tint[1] * k, tint[2] * k); B.n++;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * M.TAU + rng.range(-0.3, 0.3), r = size * rng.range(0.55, 1.0), lx = Math.cos(a) * r, lz = Math.sin(a) * r * rng.range(0.6, 1);
      const px = x + lx * c - lz * s, pz = z + lx * s + lz * c, lip = lx * tilt;                        // one side tipped up
      B.pos.push(px, y + 0.004 + Math.max(0, lip), pz); B.nor.push(-tilt * c * 0.6, 0.9, -tilt * s * 0.6); B.col.push(tint[0] * k * 0.9, tint[1] * k * 0.9, tint[2] * k * 0.9); B.n++;
    }
    // fan, counter-clockwise seen from above (angle a grows from +x toward +z: clockwise seen from above, so wind centre, i+1, i)
    for (let i = 0; i < n; i++) B.idx.push(v0, v0 + 1 + ((i + 1) % n), v0 + 1 + i);
    stats.sherds++;
  }
  const STRAW = [lin(0xd9c48e), lin(0xcbb47c), lin(0xe2d2a4)];
  /** a wisp of straw: a thin pale sliver lying flat */
  function straw(x, y, z, len, rot) {
    const B = flat, c = Math.cos(rot), s = Math.sin(rot), w = 0.006 + 0.006 * rng.next(), t = rng.pick(STRAW), v0 = B.n, k = 0.8 + 0.3 * rng.next();
    for (const [lx, lz] of [[-len / 2, -w], [len / 2, -w], [len / 2, w], [-len / 2, w]]) { B.pos.push(x + lx * c - lz * s, y + 0.008, z + lx * s + lz * c); B.nor.push(0, 1, 0); B.col.push(t[0] * k, t[1] * k, t[2] * k); B.n++; }
    B.idx.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2);
    stats.straw = (stats.straw || 0) + 1;
  }
  const sstep = (a, b, v) => { const u = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return u * u * (3 - 2 * u); };
  /** a brick bat, clod or stone: a small skewed box sunk a little into the earth */
  function bat(x, y, z, sx, sy, sz, rot, tint) {
    const g = geom.box({ x, z, y0: y - sy * 0.35, y1: y + sy * 0.65, sx, sz, rotDeg: rot, bottom: false, batter: 0.25 });
    const k = 0.8 + 0.4 * rng.next(), P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index ? g.index.array : null, B = solid, v0 = B.n;
    for (let i = 0; i < P.length; i += 3) { B.pos.push(P[i], P[i + 1], P[i + 2]); B.nor.push(N[i], N[i + 1], N[i + 2]); B.col.push(tint[0] * k, tint[1] * k, tint[2] * k); B.n++; }
    if (I) for (let i = 0; i < I.length; i++) B.idx.push(I[i] + v0); else for (let i = 0; i < P.length / 3; i++) B.idx.push(v0 + i);
    g.dispose(); stats.bats++;
  }
  /** a heap of ash and sweepings against a wall, written into the earth mesh: low and spreading, never a boulder */
  function heap(x, y, z, R, H, seed) {
    const buf = surf.bufCore, N = 9, rings = [[1.0, -0.03, 0], [0.74, 0.3, 0.45], [0.42, 0.78, 0.85], [0.16, 1.0, 1]], v0 = buf.nv, i0 = buf.ni;
    const ashy = hash2(seed, 3, 91) < 0.6, core = ashy ? [0.83, 0.84, 0.86] : [0.7, 0.66, 0.58], ph = hash2(seed, 5, 92) * 6.28;
    for (let r = 0; r < rings.length; r++) for (let k = 0; k < N; k++) {
      const a = (k / N) * M.TAU + ph, lob = 0.72 + 0.5 * vnoise(Math.cos(a) * 1.3 + seed * 0.37, Math.sin(a) * 1.3, 93), rad = R * rings[r][0] * lob, px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      const h = H * rings[r][1] * (0.7 + 0.6 * vnoise(px * 2.3, pz * 2.3, 95)), m = rings[r][2];
      const kk = BASE * (0.9 + 0.25 * vnoise(px * 3.1, pz * 3.1, 97));
      buf.vert(px, y + h, pz, Math.min(1, (1 + (core[0] - 1) * m) * kk), Math.min(1, (1 + (core[1] - 1) * m) * kk), Math.min(1, (1 + (core[2] - 1) * m) * kk));
    }
    const top = buf.vert(x, y + H, z, core[0] * BASE, core[1] * BASE, core[2] * BASE);
    for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < N; k++) { const a = v0 + r * N + k, b = v0 + r * N + ((k + 1) % N), c = a + N, d = b + N; buf.tri(a, c, b); buf.tri(b, c, d); }
    for (let k = 0; k < N; k++) buf.tri(v0 + (rings.length - 1) * N + k, top, v0 + (rings.length - 1) * N + ((k + 1) % N));
    buf.normals(v0, buf.nv, i0, buf.ni);
    stats.heaps++;
    return { x, y, z, R, H };
  }

  const heaps = [];
  for (const rec of net.recs) {
    for (const pc of rec.pieces) {
      // only the stretches the close cameras see
      let any = false; for (let s = pc.a; s <= pc.b; s += 6) { const p = net.at(rec, s); if (net.zoneAt(p.x, p.z) <= 1) { any = true; break; } }
      if (!any) continue;
      const cellSeed = rec.index * 131;
      for (let s = pc.a + 0.4; s < pc.b - 0.4; s += 0.5) {
        const p = net.at(rec, s), zone = net.zoneAt(p.x, p.z); if (zone > 1) continue;
        const lt = rec.lat(s), w = lt[1] - lt[0], eye = zone === 0;
        // sherds: thick along the walls, thin in the trodden middle
        const nEdge = (eye ? 1.5 : 0.36) * (0.4 + 1.2 * vnoise(s / 6, cellSeed * 0.01, 81)), nMid = (eye ? 0.45 : 0.08) * Math.min(4, w - 1.6);
        const count = (v) => Math.floor(v) + (rng.next() < v - Math.floor(v) ? 1 : 0);
        for (const side of [-1, 1]) for (let k = count(nEdge * 0.5); k > 0; k--) {
          const e = 0.08 + 0.9 * rng.next() ** 1.6, l = side < 0 ? lt[0] + e : lt[1] - e, q = surf.sample(rec, s + rng.range(-0.25, 0.25), l);
          if (!q.wall && rng.next() < 0.6) continue;
          sherd(q.x, q.y, q.z, rng.range(0.02, 0.065), rng.range(0, M.TAU), rng.pick(CLAY), rng.range(0, 0.35));
        }
        for (let k = count(nMid * 0.5); k > 0; k--) {
          const l = lt[0] + 0.9 + (w - 1.8) * rng.next(), q = surf.sample(rec, s + rng.range(-0.25, 0.25), l);
          sherd(q.x, q.y, q.z, rng.range(0.015, 0.042), rng.range(0, M.TAU), rng.pick(CLAY), rng.range(0, 0.2));
        }
        // chaff and chopped straw: pale slivers, in drifts
        if (eye || rng.next() < 0.3) {
          const dens = (eye ? 1.6 : 0.5) * sstep(0.55, 0.8, vnoise(p.x / 2.1, p.z / 2.1, 83));
          for (let k = count(dens); k > 0; k--) {
            const l = lt[0] + 0.2 + (w - 0.4) * rng.next(), q = surf.sample(rec, s + rng.range(-0.25, 0.25), l);
            straw(q.x, q.y, q.z, rng.range(0.05, 0.13), rng.range(0, M.TAU));
          }
        }
        // brick bats, stones and clods near the walls; dung in the middle
        if (rng.next() < (eye ? 0.2 : 0.04)) {
          const side = rng.sign(), e = 0.12 + 0.8 * rng.next() ** 2, q = surf.sample(rec, s, side < 0 ? lt[0] + e : lt[1] - e);
          const brickish = rng.next() < 0.55;
          if (brickish) bat(q.x, q.y, q.z, rng.range(0.1, 0.19), rng.range(0.06, 0.09), rng.range(0.09, 0.17), rng.range(0, 360), rng.pick(CLAY));
          else bat(q.x, q.y, q.z, rng.range(0.06, 0.15), rng.range(0.04, 0.09), rng.range(0.06, 0.13), rng.range(0, 360), rng.pick(STONE));
        }
        if (w > 2.2 && rng.next() < (eye ? 0.07 : 0.015)) {
          const l = lt[0] + 0.7 + (w - 1.4) * rng.next(), q = surf.sample(rec, s, l), n = rng.int(3, 5);
          for (let k = 0; k < n; k++) sherd(q.x + rng.range(-0.16, 0.16), q.y + 0.004, q.z + rng.range(-0.16, 0.16), rng.range(0.035, 0.06), rng.range(0, M.TAU), rng.pick(DUNG), 0);
        }
        // heaps of ash and sweepings against a wall, away from doors
        for (const side of [-1, 1]) {
          const cell = Math.floor(s / 2), hsh = hash2(rec.index * 2 + (side > 0 ? 1 : 0), cell, 4401);
          if (s - Math.floor(s / 2) * 2 >= 0.5 || hsh > (eye ? 0.13 : 0.09) * (w < 2.6 ? 1.5 : 1)) continue;
          const R = 0.45 + 0.65 * hash2(rec.index, cell, 4402), H = R * (0.1 + 0.11 * hash2(rec.index, cell, 4403));
          const l = side < 0 ? lt[0] + R * 0.45 : lt[1] - R * 0.45, q = surf.sample(rec, s, l);
          if (!q.wall || (q.door && q.door.k > 0)) continue;
          if (R > w * 0.4) continue;
          let near = false; for (const h of layout.housesNear(q.x, q.z, 5)) if (h.door && Math.hypot(h.door[0] - q.x, h.door[1] - q.z) < 2.4 + R) near = true;
          if (near) continue;
          heaps.push(heap(q.x, q.y - 0.02, q.z, R, H, rec.index * 7919 + cell));
          // what was thrown on it
          for (let k = rng.int(3, 8); k > 0; k--) { const a = rng.range(0, M.TAU), d = R * rng.range(0.1, 0.9); sherd(q.x + Math.cos(a) * d, q.y + H * (1 - d / R) * 0.8, q.z + Math.sin(a) * d, rng.range(0.03, 0.09), rng.range(0, M.TAU), rng.pick(CLAY), rng.range(0.1, 0.5)); }
        }
      }
    }
  }

  // one mesh: nothing here casts a shadow (the baked occlusion and post's ambient occlusion seat it on the ground)
  for (let i = 0; i < solid.idx.length; i++) flat.idx.push(solid.idx[i] + flat.n);
  flat.pos.push(...solid.pos); flat.nor.push(...solid.nor); flat.col.push(...solid.col); flat.n += solid.n;
  if (flat.n) geom.addStatic(pottery, geom.custom({ position: flat.pos, normal: flat.nor, color: flat.col, index: flat.idx }), { castShadow: false, lod: [0, 140], tile: 1024 });
  return { stats, heaps };
}
