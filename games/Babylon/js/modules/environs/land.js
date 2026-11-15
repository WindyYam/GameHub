// js/modules/environs/land.js — the linear works of the countryside: roads (claim 'roads') with their bridges,
// branch canals and field ditches with spoil banks, water and sluices, field bunds, garden and estate walls.
import { M, hash2, mix3, mul3, norm2, quadC, quad1, triC, obox, beam, wallLine, ridgeLine, flatRect, simplify, segX } from './util.js';

const FIELD_USE = { barleyRipe: 1, stubble: 1, fallow: 1, ploughed: 1, saltCrust: 1, reedMarsh: 1, garden: 1, palmGarden: 1, steppe: 1 };
const GARDEN_USE = { garden: 1, palmGarden: 1 };

// =========================================================================================================
// ROADS
// =========================================================================================================
export function buildRoads(E) {
  const { g, L, C } = E, W = E.W;
  const roads = L.streets.filter((s) => s.cls === 'road');
  const canals = g.canals.filter((c) => c.levee > 0);
  const out = { roads: roads.length, metres: 0, stations: 0, bridges: [], lines: [] };
  const cRoad = mix3(C.streetEarth, C.saltCrust, 0.24), cRut = mul3(C.streetEarthDamp, 0.86), cMid = mix3(C.streetEarth, C.streetEarthDamp, 0.45), cSlope = mix3(C.alluvialSoilDry, C.fallow, 0.45);
  const bad = (x, z) => {
    if (g.isWater(x, z)) return true;
    const zn = g.zone(x, z);
    if (zn.zone === 'wall' || zn.zone === 'moat' || zn.zone === 'river' || zn.zone === 'canal' || zn.zone === 'berm' || zn.zone === 'monument' || zn.zone === 'innerCity') return true;
    return zn.zone === 'street' && typeof zn.id === 'string' && /^causeway:/.test(zn.id);
  };
  for (const r of roads) {
    const pl = r.polyline, len = M.polylineLength(pl), w = r.width, hw = w / 2, ch = M.chainage(pl);
    // canal crossings: the road leaves the ground from levee crest to levee crest
    const gaps = [];
    for (const c of canals) {
      const cch = M.chainage(c.polyline);
      for (let i = 0; i + 1 < pl.length; i++) for (let j = 0; j + 1 < c.polyline.length; j++) {
        const X = segX(pl[i], pl[i + 1], c.polyline[j], c.polyline[j + 1]); if (!X) continue;
        const sc = cch[j] + X[3] * (cch[j + 1] - cch[j]); if (!c.cutAt(sc)) continue;
        const dR = norm2(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]), dC = norm2(c.polyline[j + 1][0] - c.polyline[j][0], c.polyline[j + 1][1] - c.polyline[j][1]);
        const sinA = Math.max(0.5, Math.abs(dR[0] * dC[1] - dR[1] * dC[0])), s = ch[i] + X[2] * (ch[i + 1] - ch[i]), crest = c.width / 2 + 17;
        gaps.push({ s, s0: s - (crest + 3) / sinA, s1: s + (crest + 3) / sinA, c, x: X[0], z: X[1], dR, dC, sinA, crest });
      }
    }
    // stations
    const st = [];
    for (let s = 0; s <= len;) {
      const p = M.pointAlong(pl, s), sd = E.seen(p.x, p.z);
      if (sd > 6500) { st.push(null); s += 150; continue; }
      let step = sd < 1500 ? 10 : sd < 3300 ? 25 : 60;
      const y = g.height(p.x, p.z), p2 = M.pointAlong(pl, Math.min(len, s + step)), pm = M.pointAlong(pl, Math.min(len, s + step / 2));
      if (Math.abs(g.height(pm.x, pm.z) - (y + g.height(p2.x, p2.z)) / 2) > 0.1) step = Math.max(3.5, step / 5);
      const inGap = gaps.some((q) => s > q.s0 && s < q.s1);
      st.push(inGap || bad(p.x, p.z) ? null : { s, x: p.x, z: p.z, y, sd });
      if (s >= len) break;
      s = Math.min(len, s + step);
    }
    // strips between consecutive valid stations
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        out.lines.push({ road: r.id, width: w, pts: run.map((q) => [q.x, q.z]), s0: run[0].s, s1: run[run.length - 1].s });
        for (let i = 0; i < run.length; i++) {
          const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)], [dx, dz] = norm2(b.x - a.x, b.z - a.z);
          run[i].nx = -dz; run[i].nz = dx;
        }
        for (let i = 0; i + 1 < run.length; i++) {
          const a = run[i], b = run[i + 1], near = Math.min(a.sd, b.sd) < 1500;
          const offs = near ? [-(hw + 1.4), -hw, -1.1, -0.55, 0.55, 1.1, hw, hw + 1.4] : [-(hw + 1.4), -hw, hw, hw + 1.4];
          const cols = near ? [cSlope, cRoad, cRut, cMid, cRut, cRoad, cSlope] : [cSlope, mix3(cRoad, cMid, 0.3), cSlope];
          const v = 0.94 + 0.12 * hash2(Math.round(a.s), 3, 5101);
          const P = (q, o) => { const x = q.x + q.nx * o, z = q.z + q.nz * o, edge = Math.abs(o) > hw + 0.1; return [x, edge ? Math.min(g.height(x, z) - 0.25, q.y - 0.2) : q.y + 0.14, z]; };
          for (let k = 0; k + 1 < offs.length; k++) {
            const slope = k === 0 || k === offs.length - 2, c0 = mul3(cols[k], v), wr = slope ? W.earth : W.flat;
            if (slope) { const top = mul3(cRoad, v), foot = mul3(cSlope, v); const o0 = offs[k], o1 = offs[k + 1], lo = Math.abs(o0) > Math.abs(o1) ? o0 : o1, hi = lo === o0 ? o1 : o0; quadC(wr, P(a, lo), P(b, lo), P(b, hi), P(a, hi), foot, foot, top, top, a.nx * Math.sign(lo), 0.8, a.nz * Math.sign(lo)); }
            else quad1(wr, P(a, offs[k]), P(b, offs[k]), P(b, offs[k + 1]), P(a, offs[k + 1]), c0, 0, 1, 0);
          }
          out.metres += Math.hypot(b.x - a.x, b.z - a.z); out.stations++;
        }
      }
      run = [];
    };
    for (const q of st) { if (q) run.push(q); else flush(); }
    flush();
    for (const q of gaps) if (E.seen(q.x, q.z) < 7000) out.bridges.push(bridge(E, r, q));
  }
  return out;
}

/** A timber-decked bridge on brick abutments and two boat-shaped piers where a road crosses a cut canal. */
function bridge(E, r, q) {
  const { g, C } = E, W = E.W, c = q.c, [dx, dz] = q.dR, nx = -dz, nz = dx, wd = Math.min(r.width, 5.6), hw = wd / 2;
  const at = (u, o = 0) => [q.x + dx * u + nx * o, q.z + dz * u + nz * o];
  const uCrest = (q.crest + 3) / q.sinA, uAb = (c.width / 2 + 2.6) / q.sinA;
  const yDeck = Math.max(g.height(...at(-uCrest)), g.height(...at(uCrest))) + 0.18;
  const brick = mix3(C.bakedBrickBuff, C.bakedBrickRed, 0.35), brickTop = mix3(C.streetEarth, C.saltCrust, 0.2);
  // abutments: brick-faced ramps from the crest of the levee to the edge of the water, with low parapets
  for (const sgn of [-1, 1]) {
    const u0 = sgn * uAb, u1 = sgn * uCrest, um = (u0 + u1) / 2, hl = Math.abs(u1 - u0) / 2, [cx, cz] = at(um);
    obox(W.brick, cx, cz, -4.6, yDeck - 0.02, hl, hw + 0.75, dx, dz, { side: brick, top: brickTop, foot: mul3(brick, 0.62), batter: 0.04 });
    for (const sd of [-1, 1]) { const [px, pz] = at(um, sd * (hw + 0.42)); obox(W.brick, px, pz, yDeck - 0.1, yDeck + 0.55, hl - 0.2, 0.2, dx, dz, { side: mul3(brick, 1.04), top: mul3(brick, 1.08), foot: mul3(brick, 0.9) }); }
    // the roadway on the abutment
    flatRect(W.flat, cx, cz, hl, hw + 0.2, dx, dz, yDeck + 0.03, mix3(C.streetEarth, C.streetEarthDamp, 0.3));
  }
  // piers in the stream, bows up and down stream (the big bridge in small)
  const [cxd, czd] = q.dC, pn = [-czd, cxd];
  for (const sgn of [-1, 1]) {
    const [px, pz] = at((sgn * 3.1) / q.sinA), hl = hw + 1.1, ring = [];
    for (const [a, b] of [[-hl, -0.7], [-hl - 1.3, 0], [-hl, 0.7], [hl, 0.7], [hl + 1.3, 0], [hl, -0.7]]) ring.push([px + cxd * a + pn[0] * b, pz + czd * a + pn[1] * b]);
    // the pier lies along the stream: its long axis is the canal direction
    const y0 = -5.6, y1 = yDeck - 0.42, n = ring.length, col = mul3(brick, 0.96), top = [px, y1, pz];
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      quadC(W.brick, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], mul3(col, 0.55), mul3(col, 0.55), col, col, (a[0] + b[0]) / 2 - px, 0.001, (a[1] + b[1]) / 2 - pz);
      triC(W.brick, top, [a[0], y1, a[1]], [b[0], y1, b[1]], col, col, col, 0, 1, 0);
    }
  }
  // the deck: beams, planking, kerbs
  const [mx, mz] = at(0), wood = mix3(C.palmWood, C.streetEarth, 0.25);
  obox(W.wood, mx, mz, yDeck - 0.42, yDeck, uAb + 0.6, hw, dx, dz, { side: mul3(C.palmWood, 0.8), top: wood, foot: mul3(C.palmWood, 0.55), bottom: true });
  for (const sd of [-1, 1]) { const [kx, kz] = at(0, sd * (hw - 0.14)); obox(W.wood, kx, kz, yDeck, yDeck + 0.3, uAb + 0.6, 0.12, dx, dz, { side: C.palmWood, top: mul3(C.palmWood, 1.1) }); }
  for (let k = -3; k <= 3; k++) { const [bx, bz] = at(0, (k * hw) / 3.4); obox(E.N.wood, bx, bz, yDeck - 0.78, yDeck - 0.42, uAb + 0.9, 0.16, dx, dz, { side: mul3(C.palmTrunk, 0.8), topFace: false, bottom: true }); }
  return { x: q.x, z: q.z, canal: c.id, road: r.id, deck: yDeck, width: wd, length: 2 * uAb + 1.2 };
}

// =========================================================================================================
// BRANCH CANALS and FIELD DITCHES (painted by the terrain, given banks, water and sluices here)
// =========================================================================================================
export function buildBranches(E) {
  const { g, C } = E, W = E.W;
  const out = { branches: 0, metres: 0, sluices: [], culverts: 0, heads: [] };
  const cBank = mix3(C.alluvialSoilDry, C.fallow, 0.3), cBankTop = mix3(C.alluvialSoilDry, C.saltCrust, 0.3), brick = mix3(C.bakedBrickBuff, C.bakedBrickRed, 0.3);
  const okAt = (x, z) => { if (g.isWater(x, z)) return false; const u = g.landUse(x, z).use; return u !== 'street' && u !== 'built' && u !== 'water' && !E.L.houseAt(x, z); };
  for (const b of g.fields.branches) {
    let sd = 1e9; for (const p of b.polyline) sd = Math.min(sd, E.seen(p[0], p[1]));
    if (sd > (b.order === 2 ? 5200 : 3400)) continue;
    if (b.order === 3 && E.thin(hash2(b.polyline.length, Math.round(b.polyline[0][0]), 5203))) continue;
    const w = b.width, big = b.order === 2, hb = big ? 1.5 : 0.9, hh = big ? 0.46 : 0.34;
    const pl = M.resamplePolyline(b.polyline, sd < 1700 ? 20 : 45);
    let run = [];
    const flush = (cut) => {
      if (run.length > 1) {
        const v = 0.92 + 0.14 * hash2(Math.round(run[0][0]), Math.round(run[0][1]), 5204), cb = mul3(cBank, v), ct = mul3(cBankTop, v);
        for (const side of [-1, 1]) {
          const off = M.offsetPolyline(run, side * (w / 2 + hb)), pts = off.map((p) => [p[0], g.height(p[0], p[1]), p[1]]);
          ridgeLine(W.earth, pts, hb, (i) => hh * (0.7 + 0.6 * hash2(i, Math.round(pts[i][0]), 5205)), cb, { flat: big ? 0.25 : 0, top: ct, foot: mul3(cb, 0.94) });
        }
        const l = M.offsetPolyline(run, -(w / 2 - 0.05)), rr = M.offsetPolyline(run, w / 2 - 0.05);
        for (let i = 0; i + 1 < run.length; i++) {
          const y0 = g.height(run[i][0], run[i][1]) + 0.1, y1 = g.height(run[i + 1][0], run[i + 1][1]) + 0.1, k = 0.9 + 0.2 * hash2(i, Math.round(run[i][0]), 5206), c = [k, k, k];
          quad1(W.water, [l[i][0], y0, l[i][1]], [l[i + 1][0], y1, l[i + 1][1]], [rr[i + 1][0], y1, rr[i + 1][1]], [rr[i][0], y0, rr[i][1]], c, 0, 1, 0);
          out.metres += Math.hypot(run[i + 1][0] - run[i][0], run[i + 1][1] - run[i][1]);
        }
        // a culvert mouth where the run ends at a road
        if (cut) for (const end of [0, run.length - 1]) {
          const p = run[end], q = run[end === 0 ? 1 : end - 1], [dx, dz] = norm2(p[0] - q[0], p[1] - q[1]), gy = g.height(p[0], p[1]);
          if (p !== pl[0] && !okAt(p[0] + dx * 4, p[1] + dz * 4)) { obox(W.brick, p[0] + dx * 0.3, p[1] + dz * 0.3, gy - 0.5, gy + 0.75, 0.28, w / 2 + hb + 0.4, dx, dz, { side: brick, top: mul3(brick, 1.06) }); out.culverts++; }
        }
      }
      run = [];
    };
    let any = false;
    for (const p of pl) { if (okAt(p[0], p[1])) run.push(p); else { flush(true); any = true; } }
    flush(any);
    out.branches++;
    // footbridges: two or three palm trunks laid from bank to bank, earthed over, where the field paths cross
    if (sd < 2800) {
      const len = M.polylineLength(b.polyline);
      for (let fs = 70 + 120 * hash2(Math.round(b.polyline[0][0]), 1, 5207), i = 0; fs < len - 30; fs += (big ? 190 : 150) + 160 * hash2(Math.round(b.polyline[0][1]), i, 5208), i++) {
        const p = M.pointAlong(b.polyline, fs); if (!okAt(p.x, p.z) || !okAt(p.x + p.dir[0] * 4, p.z + p.dir[1] * 4) || !okAt(p.x - p.dir[0] * 4, p.z - p.dir[1] * 4)) continue;
        const gy = g.height(p.x, p.z), nx = -p.dir[1], nz = p.dir[0], hl = w / 2 + hb * 1.7, wd = big ? 0.6 : 0.34, col = mul3(C.palmTrunk, 0.8 + 0.3 * hash2(i, Math.round(p.x), 5209));
        obox(W.wood, p.x, p.z, gy + hh * 0.75, gy + hh * 0.75 + 0.24, hl, wd, nx, nz, { side: mul3(col, 0.8), top: mix3(col, C.streetEarth, 0.5), foot: mul3(col, 0.6), bottom: true });
        out.footbridges = (out.footbridges || 0) + 1;
      }
    }
    // the head works: a brick sluice where the branch leaves its parent
    const p0 = b.polyline[0], p1 = b.polyline[1], [dx, dz] = norm2(p1[0] - p0[0], p1[1] - p0[1]);
    if (okAt(p0[0], p0[1])) { sluice(E, p0[0] + dx * 1.5, p0[1] + dz * 1.5, dx, dz, w, big); out.sluices.push([p0[0], p0[1]]); }
    out.heads.push({ x: p0[0], z: p0[1], dir: [dx, dz], width: w, order: b.order });
  }
  return out;
}

/** A brick sluice: two cheek walls, a sill, and a timber gate between two posts with a cross-beam. */
function sluice(E, x, z, dx, dz, w, big) {
  const { g, C } = E, W = E.W, nx = -dz, nz = dx, gy = g.height(x, z), half = Math.min(w / 2, big ? 1.5 : 0.8) + 0.35, L = big ? 2.6 : 1.4, H = big ? 1.1 : 0.7;
  const brick = mix3(C.bakedBrickBuff, C.bakedBrickRed, 0.3 + 0.3 * hash2(Math.round(x), Math.round(z), 5301));
  for (const s of [-1, 1]) obox(W.brick, x + nx * s * half, z + nz * s * half, gy - 0.6, gy + H, L, 0.32, dx, dz, { side: brick, top: mul3(brick, 1.07), foot: mul3(brick, 0.7) });
  // wing walls splayed against the bank
  for (const s of [-1, 1]) { const ax = x - dx * L + nx * s * (half + 0.9), az = z - dz * L + nz * s * (half + 0.9), [ux, uz] = norm2(nx * s * 0.8 - dx * 0.6, nz * s * 0.8 - dz * 0.6); obox(W.brick, ax, az, gy - 0.6, gy + H * 0.8, 1.1, 0.28, ux, uz, { side: brick, top: mul3(brick, 1.07), foot: mul3(brick, 0.7) }); }
  // the gate: posts, cross-beam, board
  const px = x - dx * (L - 0.6), pz = z - dz * (L - 0.6), top = gy + H + (big ? 1.5 : 0.9), wood = mul3(C.palmWood, 0.9);
  for (const s of [-1, 1]) beam(W.wood, [px + nx * s * (half - 0.32), gy + 0.1, pz + nz * s * (half - 0.32)], [px + nx * s * (half - 0.32), top, pz + nz * s * (half - 0.32)], big ? 0.2 : 0.14, wood);
  beam(W.wood, [px - nx * (half + 0.1), top - 0.1, pz - nz * (half + 0.1)], [px + nx * (half + 0.1), top - 0.1, pz + nz * (half + 0.1)], big ? 0.2 : 0.14, wood, true);
  const lift = (big ? 0.55 : 0.3) * hash2(Math.round(x * 3), Math.round(z * 3), 5302);
  obox(W.wood, px, pz, gy - 0.1 + lift, gy + H + 0.15 + lift, 0.05, half - 0.36, dx, dz, { side: mul3(C.palmWood, 0.75), top: wood, bottom: true });
}

export function buildDitches(E) {
  const { g, C } = E, W = E.W, out = { lines: 0, metres: 0, wet: 0 };
  const cBank = mix3(C.alluvialSoilDry, C.fallow, 0.55);
  for (let di = 0; di < g.fields.ditches.length; di++) {
    const d = g.fields.ditches[di], mid = d.polyline[d.polyline.length >> 1], sd = Math.min(E.seen(mid[0], mid[1]), E.seen(d.polyline[0][0], d.polyline[0][1]));
    if (sd > 2700) continue;
    if (E.thin(hash2(di, 1, 5401))) continue;
    const pl = simplify(d.polyline, 0.35), side = hash2(di, 2, 5402) < 0.5 ? -1 : 1, head = d.kind === 'head';
    const half = head ? 0.75 : 0.6, h = (head ? 0.42 : 0.32) * (0.8 + 0.4 * hash2(di, 3, 5403)), wet = hash2(di, 4, 5404) < (head ? 0.5 : 0.3) && sd < 2400;
    const v = 0.9 + 0.18 * hash2(di, 5, 5405), cb = mul3(cBank, v);
    // split into runs on field ground
    const fine = M.resamplePolyline(pl, 30); let run = [];
    const flush = () => {
      if (run.length > 1) {
        const off = M.offsetPolyline(run, side * (d.width / 2 + half)), pts = off.map((p) => [p[0], g.height(p[0], p[1]), p[1]]);
        ridgeLine(W.earth, pts, half, h, cb);
        if (wet) {
          const ww = Math.max(0.45, d.width * 0.42), l = M.offsetPolyline(run, -ww), rr = M.offsetPolyline(run, ww);
          for (let i = 0; i + 1 < run.length; i++) { const y0 = g.height(run[i][0], run[i][1]) + 0.09, y1 = g.height(run[i + 1][0], run[i + 1][1]) + 0.09; quad1(W.water, [l[i][0], y0, l[i][1]], [l[i + 1][0], y1, l[i + 1][1]], [rr[i + 1][0], y1, rr[i + 1][1]], [rr[i][0], y0, rr[i][1]], [1, 1, 1], 0, 1, 0); }
          out.wet += M.polylineLength(run);
        }
        out.metres += M.polylineLength(run);
      }
      run = [];
    };
    for (const p of fine) { const lu = g.landUse(p[0], p[1]); if (FIELD_USE[lu.use] && !g.isWater(p[0], p[1]) && !E.L.houseAt(p[0], p[1])) run.push(p); else flush(); }
    flush();
    out.lines++;
  }
  return out;
}

// =========================================================================================================
// FIELD BUNDS: the low earth ridges between strips (0.2 to 0.4 m, SPEC 3.16 fieldPattern.bundHeight)
// =========================================================================================================
export function buildBunds(E, strips) {
  const { g, C } = E, W = E.W; let n = 0, metres = 0;
  // Most strip records are hidden under a nearer tier (ground.js rasterises far tiers first): a bund is built only
  // along the stretch where THIS strip is the field that shows, and once per boundary (by the smaller strip id).
  for (const s of strips) {
    if (s.sd > 2200 || GARDEN_USE[s.use] || s.use === 'urban' || s.use === 'reedMarsh') continue;
    if (E.thin(hash2(s.seed, 1, 5501))) continue;
    const r = s.ring, ins = Math.min(6, s.width * 0.4), [ax, az] = norm2(r[0][0] - r[1][0], r[0][1] - r[1][1]);     // (ax, az): from the side r1-r2 into the strip
    const tone = C[s.tone] || C.fallow, col = mul3(mix3(C.alluvialSoilDry, tone, 0.35), 0.92 + 0.14 * hash2(s.seed, 2, 5502));
    const h = 0.24 + 0.18 * hash2(s.seed, 3, 5503), half = 0.55 + 0.3 * hash2(s.seed, 4, 5504), k = Math.max(3, Math.round(s.length / 20));
    for (const [a, b, ix, iz] of [[r[1], r[2], ax, az], [r[3], r[0], -ax, -az]]) {
      const own = (x, z) => {
        const lu = g.landUse(x + ix * ins, z + iz * ins); if (!lu.strip || lu.strip[0] !== s.id || g.isWater(x, z)) return false;
        const nb = g.landUse(x - ix * ins, z - iz * ins); if (!FIELD_USE[nb.use] || GARDEN_USE[nb.use]) return false;       // gardens have walls
        return (!nb.strip || nb.strip[0] > s.id) && !E.L.houseAt(x, z);
      };
      let pts = [];
      const flush = () => {
        if (pts.length > 1) {
          const q = pts.length > 3 ? [pts[0], pts[pts.length >> 1], pts[pts.length - 1]] : [pts[0], pts[pts.length - 1]];
          ridgeLine(W.earth, q, half, h, col);
          n++; metres += Math.hypot(q[q.length - 1][0] - q[0][0], q[q.length - 1][2] - q[0][2]);
        }
        pts = [];
      };
      for (let i = 0; i <= k; i++) { const x = a[0] + ((b[0] - a[0]) * i) / k, z = a[1] + ((b[1] - a[1]) * i) / k; if (own(x, z)) pts.push([x, g.height(x, z), z]); else flush(); }
      flush();
    }
  }
  return { bunds: n, metres };
}

// =========================================================================================================
// GARDEN WALLS: mud walls round the palm-garden and vegetable strips (R1 9, R5 3.5: 1.5 to 2 m), and the
// enclosures of the estates of the outer city
// =========================================================================================================
export function buildGardenWalls(E, strips) {
  const { g, C } = E, W = E.W, out = { walls: 0, metres: 0, gates: [], walled: [] };
  const tones = [C.mudPlaster, C.mudPlasterWeathered, C.mudPlasterGrey, C.mudPlasterSunlit, C.mudPlasterFresh];
  const isGarden = (x, z) => !!GARDEN_USE[g.landUse(x, z).use];
  /** wall from a to b where the ground belongs to strip `sid` on the (ix, iz) side; returns metres built. gate: leave a doorway at this share of the length. */
  const wall = (a, b, h, t, col, seed, gate, sid, ix, iz, inset, caps = true) => {
    // the strip raster has 6 m cells: ask well inside the strip which field shows there
    const okAt = (x, z) => { if (g.isWater(x, z)) return false; const lu = g.landUse(x + ix * inset, z + iz * inset); return !!lu.strip && lu.strip[0] === sid && E.L.isFree(x, z, 0.8); };
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 9)), [dx, dz] = norm2(b[0] - a[0], b[1] - a[1]);
    let run = [], built = 0;
    const top = mul3(col, 1.16), flush = () => {
      if (run.length > 1) {
        const near = E.path(run[0][0], run[0][2]) < 460;
        let pts = run;
        if (!near && run.length > 2) {       // far from every low camera: one piece per 27 m unless the ground bends
          pts = [run[0]];
          for (let i = 1; i < run.length - 1; i++) { const p = pts[pts.length - 1], q = run[i + 1], k = Math.hypot(run[i][0] - p[0], run[i][2] - p[2]) / (Math.hypot(q[0] - p[0], q[2] - p[2]) || 1); if (i % 3 === 0 || Math.abs(run[i][1] - (p[1] + (q[1] - p[1]) * k)) > 0.07) pts.push(run[i]); }
          pts.push(run[run.length - 1]);
        }
        wallLine(W.wall, pts, t, (i) => h * (0.93 + 0.14 * hash2(i, seed, 5601)), col, top, { sink: 0.5, capA: caps, capB: caps });
        if (near) wallDetail(E, pts, t, h, col, seed);
        built += Math.hypot(run[run.length - 1][0] - run[0][0], run[run.length - 1][2] - run[0][2]);
      }
      run = [];
    };
    const gi = gate === undefined ? -1 : Math.round(gate * n);
    for (let i = 0; i <= n; i++) {
      const x = a[0] + dx * (len * i) / n, z = a[1] + dz * (len * i) / n;
      if (i === gi) {
        // a doorway 1.5 m wide: the wall stops 0.75 m either side of this point
        if (run.length) { run.push([x - dx * 0.75, g.height(x, z), z - dz * 0.75]); flush(); }
        if (okAt(x, z)) { out.gates.push({ x, z, dir: [dx, dz], h, t, col, sd: E.seen(x, z) }); run.push([x + dx * 0.75, g.height(x, z), z + dz * 0.75]); }
        continue;
      }
      if (okAt(x, z)) run.push([x, g.height(x, z), z]); else flush();
    }
    flush();
    return built;
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const s of strips) {
    if (!GARDEN_USE[s.use] || s.sd > 2700) continue;
    if (E.thin(hash2(s.seed, 9, 5609))) continue;
    const palm = s.use === 'palmGarden', far = s.sd > 1900, r = s.ring, dx = s.dir[0], dz = s.dir[1];
    const col = mul3(tones[Math.floor(hash2(s.seed, 2, 5603) * tones.length)], 0.92 + 0.2 * hash2(s.seed, 3, 5604));
    const h = (palm ? 1.65 : 1.15) + (palm ? 0.65 : 0.45) * hash2(s.seed, 4, 5605), t = 0.5;
    const [ax, az] = norm2(r[0][0] - r[1][0], r[0][1] - r[1][1]);          // from the long side r1-r2 into the strip
    let m = 0, q;
    const inL = Math.min(6, s.width * 0.4), inS = Math.min(9, s.length * 0.2);
    // long side shared with the next strip: always walled where the garden ends there, often between two gardens
    q = mid(r[1], r[2]);
    if (hash2(s.seed, 1, 5602) < (isGarden(q[0] - ax * 3, q[1] - az * 3) ? (far ? 0 : palm ? 0.2 : 0.1) : 0.93)) m += wall(r[1], r[2], h, t, col, s.seed, undefined, s.id, ax, az, inL);
    // the other long side: only where no garden lies beyond it (otherwise that strip builds the wall)
    q = mid(r[3], r[0]);
    if (!isGarden(q[0] + ax * 3, q[1] + az * 3) && hash2(s.seed, 8, 5611) < 0.9) m += wall(r[3], r[0], h, t, col, s.seed + 3, undefined, s.id, -ax, -az, inL);
    // the head (towards the water or the road): the front wall with the gate
    q = mid(r[0], r[1]);
    { const gdn = isGarden(q[0] - dx * 3, q[1] - dz * 3); if ((!far || !gdn) && hash2(s.seed, 5, 5606) < (gdn ? 0.2 : 0.8)) m += wall(r[0], r[1], h, t, col, s.seed + 1, s.sd < 1500 ? 0.3 + 0.4 * hash2(s.seed, 6, 5607) : undefined, s.id, dx, dz, inS, s.sd < 1200); }
    // the tail
    q = mid(r[2], r[3]);
    { const gdn = isGarden(q[0] + dx * 3, q[1] + dz * 3); if ((!far || !gdn) && hash2(s.seed, 7, 5608) < (gdn ? 0.12 : 0.5)) m += wall(r[2], r[3], h, t, col, s.seed + 2, undefined, s.id, -dx, -dz, inS, s.sd < 1200); }
    if (m > 0) { out.walls++; out.metres += m; out.walled.push(s); }
  }
  // gates: two piers; a timber door leaf and a lintel beam where a frame comes near
  for (const q of out.gates) {
    if (q.sd > 2300) continue;
    const gy = g.height(q.x, q.z), [dx, dz] = q.dir, col = q.col;
    for (const s of [-1, 1]) obox(W.wall, q.x + dx * s * 0.95, q.z + dz * s * 0.95, gy - 0.5, gy + q.h + 0.3, 0.3, q.t / 2 + 0.12, dx, dz, { side: col, top: mul3(col, 1.14), foot: mul3(col, 0.7) });
    if (q.sd > 1500) continue;
    const ajar = 0.5 * hash2(Math.round(q.x), Math.round(q.z), 5610), [ux, uz] = norm2(dx * Math.cos(ajar) - dz * Math.sin(ajar), dz * Math.cos(ajar) + dx * Math.sin(ajar));
    obox(W.wood, q.x - dx * 0.65 + ux * 0.62, q.z - dz * 0.65 + uz * 0.62, gy + 0.05, gy + Math.min(1.9, q.h + 0.1), 0.62, 0.04, ux, uz, { side: mul3(C.palmWood, 0.85), top: C.palmWood, bottom: true });
    beam(W.wood, [q.x - dx * 0.8, gy + q.h + 0.22, q.z - dz * 0.8], [q.x + dx * 0.8, gy + q.h + 0.22, q.z + dz * 0.8], 0.16, mul3(C.palmTrunk, 0.9), true);
  }
  return out;
}

/** Add-on detail of a wall near the low flights: a rounded mud coping, buttress piers, weep holes. */
function wallDetail(E, run, t, h, col, seed) {
  const N = E.N, cop = mul3(col, 1.12);
  // coping: a slightly wider cap with chamfered shoulders
  for (let i = 0; i + 1 < run.length; i++) {
    const a = run[i], b = run[i + 1], [dx, dz] = norm2(b[0] - a[0], b[2] - a[2]), nx = -dz, nz = dx;
    const ha = h * (0.94 + 0.12 * hash2(i, seed, 5601)), hb = h * (0.94 + 0.12 * hash2(i + 1, seed, 5601));
    const sec = [[-t / 2 - 0.07, -0.08], [-t / 2 - 0.07, 0.04], [-t / 4, 0.16], [t / 4, 0.16], [t / 2 + 0.07, 0.04], [t / 2 + 0.07, -0.08]];
    for (let k = 0; k + 1 < sec.length; k++) {
      const P = (p, hh, s) => [p[0] + nx * s[0], p[1] + hh + s[1], p[2] + nz * s[0]];
      const ex = (sec[k][0] + sec[k + 1][0]) / 2, ey = 0.5;
      quad1(N.wall, P(a, ha, sec[k]), P(b, hb, sec[k]), P(b, hb, sec[k + 1]), P(a, ha, sec[k + 1]), cop, nx * ex, ey, nz * ex);
    }
    // a buttress pier on alternate sides
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len > 5) { const s = hash2(i, seed, 5611) < 0.5 ? -1 : 1, k = 0.3 + 0.4 * hash2(i, seed, 5612), x = a[0] + dx * len * k + nx * s * (t / 2 + 0.2), z = a[2] + dz * len * k + nz * s * (t / 2 + 0.2), y = a[1] + (b[1] - a[1]) * k; obox(N.wall, x, z, y - 0.4, y + ha * 0.82, 0.38, 0.24, dx, dz, { side: col, top: cop, foot: mul3(col, 0.7), batter: 0.06 }); }
  }
}

export function buildEstates(E) {
  const { g, L, C } = E, W = E.W, out = { estates: 0, metres: 0, gates: 0 };
  const polys = L.openSpaces.filter((o) => o.use === 'estate');
  const edges = [];
  for (const o of polys) { const r = M.openRing(o.polygon); for (let i = 0; i < r.length; i++) edges.push({ o, a: r[i], b: r[(i + 1) % r.length] }); }
  const nearHouse = (x, z) => { for (const h of L.housesNear(x, z, 30)) if (M.pointInPolygon(x, z, h.footprint) || M.distToRing(x, z, h.footprint) < 0.9) return true; return false; };
  const shared = (e, x, z) => { for (const f of edges) if (f.o !== e.o && Math.abs(f.a[0] - x) + Math.abs(f.a[1] - z) < 400 && M.distToSegment(x, z, f.a[0], f.a[1], f.b[0], f.b[1])[0] < 0.6) return true; return false; };
  const seenO = new Set();
  for (const e of edges) {
    const mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[1] + e.b[1]) / 2;
    if (E.seen(mx, mz) > 6000) continue;
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); if (len < 1.5) continue;
    if (shared(e, mx, mz)) continue;
    const seed = e.o.id, col = mul3(hash2(seed, 1, 5701) < 0.25 ? C.limewashAged : hash2(seed, 1, 5701) < 0.6 ? C.mudPlaster : C.mudPlasterWeathered, 0.92 + 0.14 * hash2(seed, 2, 5702)), h = 2.1 + 0.6 * hash2(seed, 3, 5703), t = 0.6;
    const n = Math.max(1, Math.round(len / 7)), [dx, dz] = norm2(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const gate = !seenO.has(seed) && len > 9 && !nearHouse(mx, mz) ? Math.round(n * 0.5) : -1;
    let run = [];
    const flush = () => { if (run.length > 1) { wallLine(W.wall, run, t, h, col, mul3(col, 1.1), { sink: 0.6 }); if (E.path(run[0][0], run[0][2]) < 460) wallDetail(E, run, t, h, col, seed); out.metres += Math.hypot(run[run.length - 1][0] - run[0][0], run[run.length - 1][2] - run[0][2]); } run = []; };
    for (let i = 0; i <= n; i++) {
      const x = e.a[0] + (dx * len * i) / n, z = e.a[1] + (dz * len * i) / n;
      if (i === gate) {
        seenO.add(seed); out.gates++;
        const gy = g.height(x, z);
        if (run.length) { run.push([x - dx * 1.1, gy, z - dz * 1.1]); flush(); }
        run.push([x + dx * 1.1, gy, z + dz * 1.1]);
        // gate piers, lintel and a two-leaved door
        for (const s of [-1, 1]) obox(W.wall, x + dx * s * 1.4, z + dz * s * 1.4, gy - 0.6, gy + h + 0.5, 0.42, t / 2 + 0.18, dx, dz, { side: col, top: mul3(col, 1.1), foot: mul3(col, 0.7) });
        obox(W.wall, x, z, gy + h - 0.25, gy + h + 0.35, 1.3, t / 2 + 0.05, dx, dz, { side: col, top: mul3(col, 1.1), foot: mul3(col, 0.8), bottom: true });
        obox(W.wood, x, z, gy + 0.05, gy + h - 0.25, 1.0, 0.05, dx, dz, { side: mul3(C.cedar, 0.9), top: C.cedar });
        continue;
      }
      if (g.isWater(x, z) || nearHouse(x, z)) flush(); else run.push([x, g.height(x, z), z]);
    }
    flush();
  }
  out.estates = polys.length;
  return out;
}
