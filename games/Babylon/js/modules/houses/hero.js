// js/modules/houses/hero.js — Merkes House III, the "Great House" (world.json landmarkHouses[0]; R5 2.1, 3.1;
// Koldewey ch. 46): the house the rooftop camera of shot 8 stands on. Built to its excavated outline and court:
//   shell      geom.houseInto() from layout.roofParts (east range +15.2, main-room range +13.4, north range and
//              west part +11.6, two lesser courts), 90 saw-teeth on three fronts above the 1.5 m terrace plinth
//   main court a lining of the four court walls with rebated doorways (the door of the main room in the middle
//              of the south side, facing north), vents under the roof line, a footing band, paving of square
//              baked bricks laid to the court's axes, a drain
//   roofs      worn parapet heads and feet, drain spouts from the higher roofs onto the lower ones, two flights
//              of mud-brick steps over the parapets between the roof levels (conjectural: no stair survives in
//              any excavated house; the roof itself was reached by ladder, which is a prop of `dressing`)
// Everything here is in the FULL band of the tile (to 400 m), not in the 170 m detail band: the camera lives on it.
import * as M from '../../core/mathx.js';
import { Rng } from '../../core/rng.js';
import { faceFrame, pt, box, tbox, FRONT, BACK, LEFT, RIGHT, TOP, BOTTOM, ALL5 } from './detail.js';

export function buildHero(ctx, h, env) {
  const { geom, layout } = ctx, { styleOf, specOf, hq, W, bin, detail } = env, T = geom.TILE, c = h.center, st = styleOf(h), sp = specOf(h);
  const { mul, mix, col, colors } = detail, { WOOD, BRICK, DAMP, DARK } = colors;
  const stats = { tris: 0, courtDoors: 0, roofSteps: 0, spouts: 0 };
  // ---- shell in the three levels ------------------------------------------------------------------------
  const bF = bin('full', T, c[0], c[1]);
  const wallName = st.white ? 'lime' : 'walls';
  geom.houseInto({ walls: W(bF, wallName, 8192), roof: W(bF, 'roof', 2048) }, sp, st, 'full');
  const bs = bin('shell', T, c[0], c[1]);
  geom.houseInto({ walls: W(bs, 'walls', 4096) }, sp, st, 'shell');
  geom.houseInto({ walls: W(bin('box', 1024, c[0], c[1]), 'walls', 4096) }, sp, st, 'box');

  // ---- the near detail every house has (street door with its flight, fronts, lesser courts, roof patches) ----
  const t = 0.38;                                   // thickness of the lining of the main court
  detail.house(h, 0, 'full', { headShift: (P, k, ed) => (ed.kind === 0 && ed.e < 0 ? t : 0) });
  const wr = detail.writers(h, 'full'), wW = wr.walls, wT = wr.timber, wP = wr.paving, wR = wr.roof;
  const plan = geom.housePlan(sp), g = plan.g, rnd = new Rng((h.seed ^ 0x9e0) >>> 0);
  const wall = st.wallColor, mud = st.mud, GREY = geom.toRGB('#8C7A66');
  const partAt = (x, z) => plan.parts.find((P) => M.pointInPolygon(x, z, P.ring));

  // ---- main court -------------------------------------------------------------------------------------------
  const court = M.openRing(h.courts[0]), cc = M.polygonCentroid(court), m = court.length;
  const walls = [];
  for (let i = 0; i < m; i++) {
    const a = court[i], b = court[(i + 1) % m], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    if ((cc[0] - (a[0] + b[0]) / 2) * nx + (cc[1] - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    const P = partAt((a[0] + b[0]) / 2 - nx * 0.6, (a[1] + b[1]) / 2 - nz * 0.6);
    walls.push({ i, a, b, len, n: [nx, nz], F: faceFrame(a, b, nx, nz), top: P ? P.T : h.roofLevel + h.parapet, roof: P ? P.L : h.roofLevel, part: P });
  }
  const south = [-Math.sin(h.rotationDeg * M.DEG), Math.cos(h.rotationDeg * M.DEG)];
  const woodC = mix(WOOD, GREY, 0.45);
  for (const w of walls) {
    // neighbours at the two ends of the frame (s = 0 and s = len): the higher lining runs through, the lower butts against it
    const iPrev = (w.i + m - 1) % m, iNext = (w.i + 1) % m, n0 = walls[w.F.flipped ? iNext : iPrev], n1 = walls[w.F.flipped ? iPrev : iNext];
    const through = (o) => w.top > o.top + 0.01 || (Math.abs(w.top - o.top) <= 0.01 && w.i < o.i);
    const e0 = through(n0) ? 0 : t, e1 = through(n1) ? 0 : t, F = w.F, len = w.len, y0 = g, y1 = w.top;
    const isMain = -(w.n[0] * south[0] + w.n[1] * south[1]) > 0.7;
    // openings: [{ s, w, h }] outer size (in the lining); the inner opening is 0.2 m narrower each side
    const ops = [];
    if (isMain) { ops.push({ s: len * 0.5, w: 2.7, h: 3.7, main: true }); ops.push({ s: len * 0.14, w: 1.4, h: 2.5 }); ops.push({ s: len * 0.86, w: 1.4, h: 2.5 }); }
    else { const n = len > 14 ? 3 : 2; for (let k = 0; k < n; k++) ops.push({ s: len * ((k + 0.5) / n) + (rnd.next() - 0.5) * 1.2, w: 1.35 + 0.15 * rnd.next(), h: 2.45 + 0.15 * rnd.next() }); }
    ops.sort((p, q) => p.s - q.s);
    col(wW, wall);
    let sPrev = e0;
    for (const o of ops) {
      const s0 = o.s - o.w / 2, s1 = o.s + o.w / 2, yt = y0 + o.h, r = 0.2, t2 = 0.19, yi = yt - r;
      col(wW, wall);
      wW.quadP(pt(F, sPrev, t, y0), pt(F, s0, t, y0), pt(F, s0, t, y1), pt(F, sPrev, t, y1));                       // pier before the opening
      wW.quadP(pt(F, s0, t, yt), pt(F, s1, t, yt), pt(F, s1, t, y1), pt(F, s0, t, y1));                             // wall over it
      wW.occlusion(0.75);
      // outer reveal (jambs and head), then the inner frame one step in, its reveal, the room behind
      wW.quadP(pt(F, s0, t, y0), pt(F, s0, t2, y0), pt(F, s0, t2, yt), pt(F, s0, t, yt));
      wW.quadP(pt(F, s1, t2, y0), pt(F, s1, t, y0), pt(F, s1, t, yt), pt(F, s1, t2, yt));
      wW.quadP(pt(F, s0, t2, yt), pt(F, s1, t2, yt), pt(F, s1, t, yt), pt(F, s0, t, yt));
      wW.quadP(pt(F, s0, t2, y0), pt(F, s0 + r, t2, y0), pt(F, s0 + r, t2, yt), pt(F, s0, t2, yt));
      wW.quadP(pt(F, s1 - r, t2, y0), pt(F, s1, t2, y0), pt(F, s1, t2, yt), pt(F, s1 - r, t2, yt));
      wW.quadP(pt(F, s0 + r, t2, yi), pt(F, s1 - r, t2, yi), pt(F, s1 - r, t2, yt), pt(F, s0 + r, t2, yt));
      wW.occlusion(0.6);
      wW.quadP(pt(F, s0 + r, t2, y0), pt(F, s0 + r, 0.012, y0), pt(F, s0 + r, 0.012, yi), pt(F, s0 + r, t2, yi));
      wW.quadP(pt(F, s1 - r, 0.012, y0), pt(F, s1 - r, t2, y0), pt(F, s1 - r, t2, yi), pt(F, s1 - r, 0.012, yi));
      wW.quadP(pt(F, s0 + r, 0.012, yi), pt(F, s1 - r, 0.012, yi), pt(F, s1 - r, t2, yi), pt(F, s0 + r, t2, yi));
      col(wW, DARK); wW.occlusion(0.5);
      wW.quadP(pt(F, s0 + r, 0.012, y0), pt(F, s1 - r, 0.012, y0), pt(F, s1 - r, 0.012, yi), pt(F, s0 + r, 0.012, yi));
      wW.occlusion(1);
      // door leaves standing open against the inner reveal (the main room has two), a threshold of baked brick
      col(wT, mul(woodC, 0.8 + 0.3 * rnd.next()));
      tbox(wT, F, s0 + r, s0 + r + 0.05, 0.02, t2 - 0.01, y0 + 0.03, yi - 0.03, RIGHT | FRONT, 'y', rnd.next() * 3, rnd.next() * 3);
      if (o.main) tbox(wT, F, s1 - r - 0.05, s1 - r, 0.02, t2 - 0.01, y0 + 0.03, yi - 0.03, LEFT | FRONT, 'y', rnd.next() * 3, rnd.next() * 3);
      // lintel beams over the outer opening
      col(wT, mul(woodC, 0.95));
      tbox(wT, F, s0 - 0.3, s1 + 0.3, t - 0.02, t + 0.045, yt, yt + (o.main ? 0.3 : 0.2), ALL5, 's', rnd.next() * 3, rnd.next() * 3);
      col(wP, mul(BRICK, 1.05));
      wP.quadUV(...pt(F, s0, t + 0.06, y0 + 0.045), ...pt(F, s1, t + 0.06, y0 + 0.045), ...pt(F, s1, 0.012, y0 + 0.045), ...pt(F, s0, 0.012, y0 + 0.045), 0, 0, o.w, t + 0.05);
      wP.quadUV(...pt(F, s0, t + 0.06, y0), ...pt(F, s1, t + 0.06, y0), ...pt(F, s1, t + 0.06, y0 + 0.045), ...pt(F, s0, t + 0.06, y0 + 0.045), 0, 0, o.w, 0.045);
      sPrev = s1; stats.courtDoors++;
    }
    col(wW, wall); wW.occlusion(1);
    wW.quadP(pt(F, sPrev, t, y0), pt(F, len - e1, t, y0), pt(F, len - e1, t, y1), pt(F, sPrev, t, y1));
    // top of the lining (it widens the head of the wall to the court), and its ends where it runs past a lower neighbour
    wW.quadP(pt(F, e0, t, y1), pt(F, len - e1, t, y1), pt(F, len - e1, 0, y1), pt(F, e0, 0, y1));
    if (e0 === 0 && n0.top < y1 - 0.01) wW.quadP(pt(F, 0, 0, n0.top), pt(F, 0, t, n0.top), pt(F, 0, t, y1), pt(F, 0, 0, y1));
    if (e1 === 0 && n1.top < y1 - 0.01) wW.quadP(pt(F, len, t, n1.top), pt(F, len, 0, n1.top), pt(F, len, 0, y1), pt(F, len, t, y1));
    // vents under the roof line, a footing band (splash and wear), rain wash
    const f = { F: { ...F, len }, y0, y1, flat: true, seed: (h.seed ^ (w.i * 131)) | 0, ch: (s) => s, roof: w.roof };
    col(wW, DARK); wW.occlusion(0.6);
    const nv = Math.floor(len / 2.1);
    for (let k = 0; k < nv; k++) { const s = len * ((k + 0.5) / nv); if (ops.some((o) => Math.abs(s - o.s) < o.w / 2 + 0.2 && w.roof - 0.4 - 0.26 < y0 + o.h + 0.5)) continue; wW.quadP(pt(F, s - 0.055, t + 0.008, w.roof - 0.66), pt(F, s + 0.055, t + 0.008, w.roof - 0.66), pt(F, s + 0.055, t + 0.008, w.roof - 0.4), pt(F, s - 0.055, t + 0.008, w.roof - 0.4)); }
    wW.occlusion(1);
    const nz = detail.vnoise(f.seed), fl = { ...f, F: { ...F, len, ox: F.ox + F.vx * t, oz: F.oz + F.vz * t } };
    let a0 = e0 + 0.02;
    for (const o of [...ops, { s: len - e1 + 0.02, w: 0 }]) { detail.band(wW, fl, a0, o.s - o.w / 2 - 0.02, () => y0, (s) => y0 + 0.28 + 0.4 * nz(s / 0.7), mix(mul(wall, 0.9), mud, 0.3), 0.02, 0.5); a0 = o.s + o.w / 2 + 0.02; }
    const ns = Math.floor(len / 4.5);
    for (let k = 0; k < ns; k++) { const s = e0 + 0.4 + (len - e0 - e1 - 0.8) * rnd.next(); detail.streak(wW, fl, s, 0.8 + 2.2 * rnd.next(), 0.06 + 0.1 * rnd.next(), mul(mix(wall, mud, 0.14), 0.95), (rnd.next() - 0.5) * 0.12); }
    for (let k = 0; k < ns; k++) { const s = e0 + 0.4 + (len - e0 - e1 - 0.8) * rnd.next(); if (!ops.some((o) => Math.abs(s - o.s) < o.w / 2 + 0.4)) detail.crack(wW, fl, s, y1 - 0.01, 1 + 2.5 * rnd.next(), mul(wall, 0.62), rnd); }
  }
  // paving of square baked bricks to the court's own axes, with a drain near the middle
  {
    const o = M.openRing(geom.insetRing(h.courts[0], t)), up = M.polygonArea(o) > 0 ? [o[0], o[3], o[2], o[1]] : [o[0], o[1], o[2], o[3]];      // counter-clockwise seen from above
    const lu = Math.hypot(up[1][0] - up[0][0], up[1][1] - up[0][1]), lv = Math.hypot(up[2][0] - up[1][0], up[2][1] - up[1][1]), y = g + 0.03;
    col(wP, mul(BRICK, 0.98));
    wP.quadUV(up[0][0], y, up[0][1], up[1][0], y, up[1][1], up[2][0], y, up[2][1], up[3][0], y, up[3][1], 0, 0, lu, lv);
    const ux = (up[1][0] - up[0][0]) / lu, uz = (up[1][1] - up[0][1]) / lu, vx = (up[2][0] - up[1][0]) / lv, vz = (up[2][1] - up[1][1]) / lv;
    const at = (a, b) => [up[0][0] + ux * a + vx * b, up[0][1] + uz * a + vz * b], dq = (a0, b0, a1, b1, yy, cl) => { col(wP, cl); const p = at(a0, b0), q = at(a1, b0), r = at(a1, b1), s = at(a0, b1); wP.quadUV(p[0], yy, p[1], q[0], yy, q[1], r[0], yy, r[1], s[0], yy, s[1], 0, 0, a1 - a0, b1 - b0); };
    const da = lu * 0.42, db = lv * 0.55;
    dq(da - 0.5, db - 0.5, da + 0.5, db + 0.5, y + 0.012, mul(BRICK, 0.8)); dq(da - 0.17, db - 0.17, da + 0.17, db + 0.17, y + 0.024, DARK);
  }

  // ---- parapets: worn heads, dirty feet -------------------------------------------------------------------------
  // (every parapet face that looks onto a roof: a band where roof plaster is drawn up the wall, wash from the head;
  //  patches on the heads where the lime wash is worn through to the mud)
  for (const P of plan.parts) {
    if (!P.inner) continue;
    const mm = P.edges.length;
    for (let k = 0; k < mm; k++) {
      const ed = P.edges[k];
      if (ed.kind === 2 || !(P.dFull[k] > 0)) continue;
      const a = P.inner.A[k], b = P.inner.B[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1.2) continue;
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, nx = P.cw ? -dz : dz, nz = P.cw ? dx : -dx;        // into the roof
      const F = faceFrame(a, b, nx, nz), f = { F, y0: P.L, y1: P.T, tooth: true, seed: (h.seed ^ (k * 977 + P.L * 13)) | 0, ch: (s) => s };
      const nzf = detail.vnoise(f.seed);
      detail.band(wW, f, 0.05, len - 0.05, () => P.L, (s) => P.L + 0.07 + 0.13 * nzf(s / 0.4), mix(mul(wall, 0.95), st.roofColor, 0.4), 0.016, 0.33);
      // where hands and elbows rest: the head of the face a little darker, in an uneven band
      detail.band(wW, f, 0.05, len - 0.05, (s) => P.T - 0.05 - 0.16 * nzf(s / 0.8 + 40), () => P.T, mul(mix(wall, mud, 0.12), 0.97), 0.014, 0.4);
      const nc = Math.floor((len / 3.5) * (0.4 + rnd.next()));
      for (let q = 0; q < nc; q++) detail.crack(wW, f, 0.3 + (len - 0.6) * rnd.next(), P.T - 0.005, (P.T - P.L) * (0.5 + 0.5 * rnd.next()), mul(wall, 0.62), rnd);
    }
  }

  // ---- water from the higher roofs: spouts through the parapets onto the lower roofs and into the court ------------------
  for (const P of plan.parts) for (let k = 0; k < P.edges.length; k++) {
    const ed = P.edges[k];
    if (ed.kind !== 1 && !(ed.kind === 0 && ed.e < 0)) continue;
    const len = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]);
    if (len < 5) continue;
    const dx = (ed.q[0] - ed.p[0]) / len, dz = (ed.q[1] - ed.p[1]) / len, nx = P.cw ? dz : -dz, nz = P.cw ? -dx : dx;          // outward
    const courtSide = ed.kind === 0, F = faceFrame(ed.p, ed.q, nx, nz);
    if (courtSide) { F.ox += nx * t; F.oz += nz * t; }
    const f = { F, y0: courtSide ? g : ed.Lnb, y1: P.T, roof: P.L, edge: ed, inset: P.dFull[k] + 0.03 + (courtSide ? t : 0) };
    const n = len > 12 ? 2 : 1;
    for (let q = 0; q < n; q++) {
      const s = len * ((q + 0.3 + 0.4 * rnd.next()) / n);
      detail.spout({ walls: wW, timber: wT, roof: wR }, f, s, st, h, rnd, P);
      stats.spouts++;
    }
  }

  // ---- steps over the parapets between the roof levels ------------------------------------------------------------------
  // a flight on the lower roof against the wall of the higher part, up to the head of its parapet, and two steps down inside
  const stile = (lowName, highName, at) => {
    const parts = layout.roofParts(h), iLow = parts.findIndex((q) => q.name === lowName), iHigh = parts.findIndex((q) => q.name === highName);
    const lo = plan.parts[iLow], hi = plan.parts[iHigh];
    if (!lo || !hi) return;
    const k = hi.edges.findIndex((ed) => ed.kind === 1 && ed.nb === lo);
    if (k < 0) return;
    const ed = hi.edges[k], len = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]), dx = (ed.q[0] - ed.p[0]) / len, dz = (ed.q[1] - ed.p[1]) / len, nx = hi.cw ? dz : -dz, nz = hi.cw ? -dx : dx;
    const F = faceFrame(ed.p, ed.q, nx, nz), rise = hi.T - lo.L, nr = Math.round(rise / 0.2), riser = rise / nr, tr = 0.27, wd = 0.85, run = (nr - 1) * tr;
    if (len < run + 1.6) return;
    const s0 = Math.min(len - run - 0.8, Math.max(0.8, len * at)), stepC = mul(mix(wall, mud, 0.55), 0.95);
    col(wW, stepC);
    for (let j = 1; j < nr; j++) {
      const sa = s0 + (j - 1) * tr;
      box(wW, F, sa, sa + tr, 0, wd, lo.L, lo.L + j * riser, FRONT | LEFT | TOP | (j === nr - 1 ? RIGHT : 0));
    }
    // inside: two steps down from the head of the parapet to the higher roof
    const tp = hi.dFull[k], sTop = s0 + run - tr * 0.5, down = hi.T - hi.L, nd = Math.max(2, Math.round(down / 0.24)), rd = down / nd;
    const Fi = faceFrame(ed.p, ed.q, -nx, -nz), si = Fi.flipped === F.flipped ? sTop : len - sTop;
    Fi.ox += -nx * tp; Fi.oz += -nz * tp;
    for (let j = 1; j < nd; j++) box(wW, Fi, si - 0.45, si + 0.45, (j - 1) * 0.27, j * 0.27, hi.L, hi.T - j * rd, FRONT | LEFT | RIGHT | TOP);
    stats.roofSteps += nr - 1 + nd - 1;
    return { from: pt(F, s0, wd / 2, lo.L), to: pt(F, s0 + run, wd / 2, hi.T), width: wd };
  };
  const stairs = [stile('west part', 'main-room range', 0.3), stile('main-room range', 'east range', 0.55)].filter(Boolean);

  return { stats, stairs };
}
