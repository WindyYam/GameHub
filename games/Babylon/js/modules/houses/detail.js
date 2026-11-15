// js/modules/houses/detail.js — the near level of the houses: everything a street, court or roof camera sees
// within about 200 m that the shell of geom.houseInto() does not have. One call per house, written into the
// tile bin of the 'detail' band (four materials: plaster, timber, court paving, roof decals).
//   street door   leaf of boards with battens, timber lintel, baked-brick threshold, steps with true risers
//                 down to the street (a side flight where the floor stands high), a mud bench or a jar stand
//   street walls  re-plastered / eroded foot band with an irregular top, patches, a capping on the parapet,
//                 beam ends under the roof line, wooden drain spouts with their stain and splash
//   courts        a lining with a doorway to every room range (real reveals, lintel, door leaf or dark room),
//                 vent slits under the roof line, paving of square baked bricks laid to the court's own axes
//   roofs         re-plastered patches, roof rooms (declared through the shell spec: `upper`)
// Frames: every piece is placed in a wall frame F = { origin, u along the wall, v = outward normal }, with the
// outward normal on the RIGHT of travel along u, so the quads below wind counter-clockwise seen from outside.
import * as M from '../../core/mathx.js';
import { Rng, hash2 } from '../../core/rng.js';

export const FRONT = 1, BACK = 2, LEFT = 4, RIGHT = 8, TOP = 16, BOTTOM = 32, SIDES = FRONT | LEFT | RIGHT, ALL5 = FRONT | LEFT | RIGHT | TOP | BOTTOM;

/** Wall frame at (ox, oz) with outward unit normal (nx, nz): u = (nz, -nx), so that v = n is right of travel along u. */
export const frameOf = (ox, oz, nx, nz) => ({ ox, oz, ux: nz, uz: -nx, vx: nx, vz: nz });
/** Frame of the wall face a -> b whose outward normal is (nx, nz): origin at the end from which u runs toward the other. */
export function faceFrame(a, b, nx, nz) {
  const ux = nz, uz = -nx, fwd = (b[0] - a[0]) * ux + (b[1] - a[1]) * uz >= 0, o = fwd ? a : b;
  return { ox: o[0], oz: o[1], ux, uz, vx: nx, vz: nz, len: Math.hypot(b[0] - a[0], b[1] - a[1]), flipped: !fwd };
}
export const pt = (F, s, d, y) => [F.ox + F.ux * s + F.vx * d, y, F.oz + F.uz * s + F.vz * d];

/** Box in a wall frame: s0..s1 along the wall, d0..d1 outward, y0..y1; `faces` = which of its six faces to write. */
export function box(w, F, s0, s1, d0, d1, y0, y1, faces = ALL5) {
  if (faces & FRONT) w.quadP(pt(F, s0, d1, y0), pt(F, s1, d1, y0), pt(F, s1, d1, y1), pt(F, s0, d1, y1));
  if (faces & BACK) w.quadP(pt(F, s1, d0, y0), pt(F, s0, d0, y0), pt(F, s0, d0, y1), pt(F, s1, d0, y1));
  if (faces & RIGHT) w.quadP(pt(F, s1, d1, y0), pt(F, s1, d0, y0), pt(F, s1, d0, y1), pt(F, s1, d1, y1));
  if (faces & LEFT) w.quadP(pt(F, s0, d0, y0), pt(F, s0, d1, y0), pt(F, s0, d1, y1), pt(F, s0, d0, y1));
  if (faces & TOP) w.quadP(pt(F, s0, d1, y1), pt(F, s1, d1, y1), pt(F, s1, d0, y1), pt(F, s0, d0, y1));
  if (faces & BOTTOM) w.quadP(pt(F, s0, d0, y0), pt(F, s1, d0, y0), pt(F, s1, d1, y0), pt(F, s0, d1, y0));
}
// a quad with UVs in metres: a -> b is the axis `p`, b -> c the axis `q`; the grain (u of the texture) runs along `grain`
function quadG(w, a, b, c, d, lp, lq, p, q, grain, u0, v0) {
  if (grain === q) w.quadUV(b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], a[0], a[1], a[2], u0, v0, u0 + lq, v0 + lp);
  else if (grain === p) w.quadUV(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], u0, v0, u0 + lp, v0 + lq);
  else w.quadUV(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], u0, v0, u0 + lp * 0.35, v0 + lq * 0.35);     // end grain
}
/** Timber box with UVs in metres; grain: 's' along the wall, 'y' upright, 'd' outward. (u0, v0) shifts the piece on the texture. */
export function tbox(w, F, s0, s1, d0, d1, y0, y1, faces = ALL5, grain = 's', u0 = 0, v0 = 0) {
  const ls = s1 - s0, ld = d1 - d0, ly = y1 - y0;
  if (faces & FRONT) quadG(w, pt(F, s0, d1, y0), pt(F, s1, d1, y0), pt(F, s1, d1, y1), pt(F, s0, d1, y1), ls, ly, 's', 'y', grain, u0, v0);
  if (faces & BACK) quadG(w, pt(F, s1, d0, y0), pt(F, s0, d0, y0), pt(F, s0, d0, y1), pt(F, s1, d0, y1), ls, ly, 's', 'y', grain, u0, v0);
  if (faces & RIGHT) quadG(w, pt(F, s1, d1, y0), pt(F, s1, d0, y0), pt(F, s1, d0, y1), pt(F, s1, d1, y1), ld, ly, 'd', 'y', grain, u0 + 0.31, v0);
  if (faces & LEFT) quadG(w, pt(F, s0, d0, y0), pt(F, s0, d1, y0), pt(F, s0, d1, y1), pt(F, s0, d0, y1), ld, ly, 'd', 'y', grain, u0 + 0.57, v0);
  if (faces & TOP) quadG(w, pt(F, s0, d1, y1), pt(F, s1, d1, y1), pt(F, s1, d0, y1), pt(F, s0, d0, y1), ls, ld, 's', 'd', grain, u0, v0 + 0.43);
  if (faces & BOTTOM) quadG(w, pt(F, s0, d0, y0), pt(F, s1, d0, y0), pt(F, s1, d1, y0), pt(F, s0, d1, y0), ls, ld, 's', 'd', grain, u0, v0 + 0.71);
}
/** A lathe (jar) round the vertical axis at (x, z): profile [[r, y], ...] from the foot up, n sides. Closed with a top disc at the last ring. */
export function lathe(w, x, y0, z, profile, n = 8, top = null) {
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, h0] = profile[i], [r1, h1] = profile[i + 1];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * M.TAU, a1 = ((k + 1) / n) * M.TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // counter-clockwise seen from outside: along -angle at the bottom, then up
      w.quad(x + c1 * r0, y0 + h0, z + s1 * r0, x + c0 * r0, y0 + h0, z + s0 * r0, x + c0 * r1, y0 + h1, z + s0 * r1, x + c1 * r1, y0 + h1, z + s1 * r1);
    }
  }
  if (top) {
    const [r, hh] = profile[profile.length - 1], flat = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * M.TAU; flat.push(x + Math.cos(a) * r, z + Math.sin(a) * r); }
    w.color(top[0], top[1], top[2]); w.polygon(flat, null, y0 + hh - 0.03, true);
  }
}

export function makeDetail(ctx, env) {
  const { geom, layout, ground, materials } = ctx, { styleOf, specOf, hq, mat, W, bin, camDist } = env, T = geom.TILE;
  const NEAR = 95, MID = 190, LINED = 130;          // tiers by distance from the film path: 0 everything, 1 no boards / beam ends, 2 roofs and court doors only
  mat.timber = materials.variant('palmWood', { name: 'houses-timber', color: 0xffffff, space: 'uv', uvMetres: [1, 1] });
  mat.pavingUV = materials.variant('courtBrickPaving', { name: 'houses-court-paving', color: 0xffffff, space: 'uv', uvMetres: [1, 1], uvFace: 'top', polygonOffset: 1 });
  mat.roofDecal = materials.variant('roofEarth', { name: 'houses-roof-patches', color: 0xffffff, polygonOffset: 1 });
  const rgb = (id) => geom.toRGB(materials.color(id));
  const WOOD = rgb('palmWood'), CEDAR = rgb('cedar'), BRICK = rgb('courtBrickPaving'), CLAY = rgb('bakedBrickRed'), FRESH = rgb('mudPlasterFresh'), DAMP = rgb('mudPlasterDampBase'), ROOF = rgb('roofEarth');
  const DARK = [0.022, 0.018, 0.015], GREY = geom.toRGB('#8C7A66');       // sun-greyed timber (R5 6)
  /** Smooth 1-D value noise in 0..1 (period-free), for the irregular edges of plaster bands along a wall. */
  const vnoise = (seed) => (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash2(i, seed, 77) * (1 - u) + hash2(i + 1, seed, 77) * u; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const col = (w, c) => w.color(c[0], c[1], c[2]);
  const stats = { cracks: 0, heads: 0, doors: 0, boards: 0, steps: 0, sideFlights: 0, benches: 0, jarStands: 0, footBands: 0, topBands: 0, streaks: 0, roofDrains: 0, patches: 0, cappings: 0, beamEnds: 0, spouts: 0, courtDoors: 0, vents: 0, pavedCourts: 0, roofPatches: 0, roofRooms: 0, skippedForCamera: 0 };
  const roofRooms = [];
  const samples = {}, sample = (kind, F, s, d, y) => { const a = samples[kind] || (samples[kind] = []); if (a.length < 4) { const p = pt(F, s, d, y); a.push([+p[0].toFixed(1), +p[1].toFixed(1), +p[2].toFixed(1), +F.vx.toFixed(2), +F.vz.toFixed(2)]); } };
  stats.samples = samples;
  const footAt = (F, s, d = 0.25) => ground.height(F.ox + F.ux * s + F.vx * d, F.oz + F.uz * s + F.vz * d);

  /** The writers of a house's tile in the band `lodName` ('detail', or 'full' for the hero): { walls, timber, paving, roof }. */
  const writers = (h, lodName = 'detail') => {
    const b = bin(lodName, T, h.center[0], h.center[1]);
    const wt = W(b, 'timber', 1024), wp = W(b, 'pavingUV', 256);
    wt.useUV(); wp.useUV();
    return { walls: W(b, lodName !== 'detail' && styleOf(h).white ? 'lime' : 'walls', 2048), timber: wt, paving: wp, roof: W(b, 'roofDecal', 256) };
  };

  // ------------------------------------------------------------------------------------------ street door ----
  function doorGeometry(h, sp, plan) {
    const door = plan.door;
    if (!door) return null;
    const P = plan.parts[door.part], ed = P.edges[door.edge], pts = ed.line || [ed.p, ed.q], a = pts[door.seg], b = pts[door.seg + 1];
    const len = door.len, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, left = P.cw, nx = left ? dz : -dz, nz = left ? -dx : dx;
    const g = plan.g, base = sp.base ?? g - 1, Tp = P.T;
    const pl = ed.line && plan.PL !== null ? Math.min(Math.max(plan.PL, base), Tp - 0.4) : base;
    const yS = Math.max(g, pl), yD = Math.min(yS + door.dH, Tp - 0.22 - 0.25), yL = yD + 0.22;
    const cx = a[0] + dx * door.s, cz = a[1] + dz * door.s;
    // how far the door face lies behind the plot line (a stepped front: the plinth ledge lies before the door)
    const r = M.distToSegment(cx, cz, ed.p[0], ed.p[1], ed.q[0], ed.q[1]);
    // Fp: the frame of the PLOT line before the door (a stepped front: the plinth face; steps and landings stand against it)
    const el = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]) || 1, ex = (ed.q[0] - ed.p[0]) / el, ez = (ed.q[1] - ed.p[1]) / el;
    const Fp = ed.line ? frameOf(ed.p[0] + (ed.q[0] - ed.p[0]) * r[1], ed.p[1] + (ed.q[1] - ed.p[1]) * r[1], left ? ez : -ez, left ? -ex : ex) : frameOf(cx, cz, nx, nz);
    return { F: frameOf(cx, cz, nx, nz), Fp, hw: door.dW, yS, yD, yL, Tp, ledge: ed.line ? Math.min(0.7, r[0]) : 0, toothed: !!ed.line, segLen: len, segS: door.s, a, b, dx, dz, edge: ed, part: P,
      edgeS: r[1] * el, edgeLen: el, uSign: Fp.ux * ex + Fp.uz * ez >= 0 ? 1 : -1 };
  }
  function streetDoor(h, st, D, wr, tier, rnd) {
    const { F, hw, yS, yD, yL } = D, wW = wr.walls, wT = wr.timber, wall = st.wallColor;
    const side = h.sides[h.doorSide] || { kind: 'e', street: null }, street = side.street ? layout.streetById(side.street) : null;
    const sw = street ? street.width : 4;
    stats.doors++;
    // the leaf: boards with gaps, two or three battens (tier 0); one or two leaves
    const wood = mul(mix(mix(WOOD, CEDAR, 0.5 * hq(h, 201)), GREY, 0.25 + 0.6 * hq(h, 202)), 0.85 + 0.3 * hq(h, 213)), dLeaf = -0.35 + 0.03;
    // a rebated reveal (the doorway of a well-built house steps in once): liners in the back half of the recess
    const reb = tier === 0 && hw > 0.5 ? (st.elite ? 0.11 : 0.07) : 0;
    if (reb > 0) {
      col(wW, mul(wall, 0.97)); wW.occlusion(0.8);
      const dF = -0.16, dB = -0.34;
      wW.quadP(pt(F, -hw, dF, yS), pt(F, -hw + reb, dF, yS), pt(F, -hw + reb, dF, yD), pt(F, -hw, dF, yD));
      wW.quadP(pt(F, hw - reb, dF, yS), pt(F, hw, dF, yS), pt(F, hw, dF, yD), pt(F, hw - reb, dF, yD));
      wW.quadP(pt(F, -hw + reb, dF, yD - reb), pt(F, hw - reb, dF, yD - reb), pt(F, hw - reb, dF, yD), pt(F, -hw + reb, dF, yD));
      wW.quadP(pt(F, -hw + reb, dF, yS), pt(F, -hw + reb, dB, yS), pt(F, -hw + reb, dB, yD - reb), pt(F, -hw + reb, dF, yD - reb));
      wW.quadP(pt(F, hw - reb, dB, yS), pt(F, hw - reb, dF, yS), pt(F, hw - reb, dF, yD - reb), pt(F, hw - reb, dB, yD - reb));
      wW.quadP(pt(F, -hw + reb, dB, yD - reb), pt(F, hw - reb, dB, yD - reb), pt(F, hw - reb, dF, yD - reb), pt(F, -hw + reb, dF, yD - reb));
      wW.occlusion(1);
    }
    const lw = hw - reb, yTop = yD - reb;
    if (tier === 0) {
      const nb = Math.max(3, Math.round((2 * lw) / 0.23)), bw = (2 * lw - 0.02) / nb, two = lw > 0.72;
      for (let i = 0; i < nb; i++) {
        const k = 0.84 + 0.32 * rnd.next(), s0 = -lw + 0.01 + i * bw + 0.006, s1 = s0 + bw - 0.012 - (two && i === nb / 2 - 1 ? 0.012 : 0);
        col(wT, mul(wood, k)); tbox(wT, F, s0, s1, dLeaf - 0.01, dLeaf, yS + 0.04, yTop - 0.015, FRONT, 'y', rnd.next() * 3, rnd.next() * 3);
        stats.boards++;
      }
      col(wT, mul(wood, 0.8));
      const nbat = yTop - yS > 2.6 ? 3 : 2;
      for (let i = 0; i < nbat; i++) { const y = yS + 0.32 + ((yTop - yS - 0.64) * i) / (nbat - 1); tbox(wT, F, -lw + 0.03, lw - 0.03, dLeaf, dLeaf + 0.028, y - 0.06, y + 0.06, FRONT | TOP | BOTTOM, 's', rnd.next() * 3, rnd.next() * 3); }
      // the pivot post of the leaf stands in the jamb corner
      col(wT, mul(wood, 0.72)); tbox(wT, F, -lw + 0.0, -lw + 0.07, dLeaf, dLeaf + 0.05, yS + 0.04, yTop - 0.01, FRONT | RIGHT, 'y', rnd.next() * 3, 0);
    }
    // lintel: a beam (or two palm logs) across the opening, proud of the wall, bearing a hand's breadth on each jamb
    const bear = 0.2 + 0.12 * hq(h, 203);
    col(wT, mul(wood, 0.92)); tbox(wT, F, -hw - bear, hw + bear, -0.33, 0.045, yD - 0.005, yL + 0.02, ALL5, 's', rnd.next() * 3, rnd.next() * 3);
    // threshold: a course of baked bricks on edge, lying on the recess floor and showing 5 cm before the wall
    const wP = wr.paving;
    col(wP, mul(BRICK, 1.0 + 0.15 * hq(h, 204)));
    const sill = (s0, s1, d0, d1, y0, y1) => { const q = (a, b, c, d, lu, lv) => wP.quadUV(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], 0, 0, lu, lv);
      q(pt(F, s0, d1, y1), pt(F, s1, d1, y1), pt(F, s1, d0, y1), pt(F, s0, d0, y1), s1 - s0, d1 - d0);
      q(pt(F, s0, d1, y0), pt(F, s1, d1, y0), pt(F, s1, d1, y1), pt(F, s0, d1, y1), s1 - s0, y1 - y0); };
    sill(-hw, hw, -0.33, D.ledge > 0.05 ? 0 : 0.05, yS, yS + 0.035);
    // steps down to the street
    // steps: as many as stand clear of the ground, which falls from the foot of the wall to the street. They stand
    // against the plot line (on a stepped front that is the face of the plinth; the ledge of the plinth lies behind)
    const S = D.Fp, tread = sw < 2.6 ? 0.25 : 0.3, wHalf = hw + 0.12 + 0.1 * hq(h, 205);
    const stepC = mul(mix(wall, st.mud, st.white ? 0.5 : 0), 0.9);
    let n = 0;
    while (n < 9 && yS - (n + 1) * 0.19 - Math.max(footAt(S, 0, (n + 1) * tread - 0.04), footAt(S, 0, n * tread + 0.06)) > 0.19) n++;
    let reach = D.ledge;                                      // how far the door furniture stands out into the street
    if (n >= 1) {
      const allowed = Math.max(0.3, Math.min(1.25, 0.28 * sw));
      col(wW, stepC);
      if (n * tread <= allowed) {
        const gEnd = footAt(S, 0, n * tread + 0.12), riser = (yS - gEnd) / (n + 1), far = pt(S, 0, n * tread, yS);
        if (!layout.houseAt(far[0], far[2]) && camDist(far[0], gEnd + 0.5, far[2]) > 0.9) {
          for (let k = 1; k <= n; k++) box(wW, S, -wHalf, wHalf, (k - 1) * tread, k * tread, gEnd - 0.4, yS - k * riser, FRONT | LEFT | RIGHT | TOP);
          stats.steps += n; reach = n * tread;
        } else stats.skippedForCamera++;
      } else {
        // the floor stands high above a narrow street: a landing before the door and a flight along the wall
        const land = Math.min(0.85, allowed + 0.1), tr = 0.27;
        for (const dir of hq(h, 206) < 0.5 ? [-1, 1] : [1, -1]) {
          const gEnd = footAt(S, dir * (wHalf + (n - 1) * tr + 0.12), land * 0.5), riser = (yS - gEnd) / (n + 1), far = pt(S, dir * (wHalf + n * tr), land, yS);
          const endS = D.edgeS + D.uSign * dir * (wHalf + n * tr);                          // the flight stays before its own house
          if (endS < 0.1 || endS > D.edgeLen - 0.1 || layout.houseAt(far[0], far[2]) || camDist(far[0], gEnd + 0.6, far[2]) <= 0.9) continue;
          box(wW, S, -wHalf, wHalf, 0, land, gEnd - 0.4, yS - riser, FRONT | LEFT | RIGHT | TOP);
          for (let k = 2; k <= n; k++) {
            const sa = wHalf + (k - 2) * tr, sb = sa + tr;
            if (dir > 0) box(wW, S, sa, sb, 0, land, gEnd - 0.4, yS - k * riser, FRONT | RIGHT | TOP); else box(wW, S, -sb, -sa, 0, land, gEnd - 0.4, yS - k * riser, FRONT | LEFT | TOP);
          }
          stats.steps += n; stats.sideFlights++; reach = land; sample('sideFlight', S, 0, land, yS);
          break;
        }
      }
    }
    // a mud bench beside the door, or a stand with a water jar (only on a flat stretch of wall)
    if (!D.toothed && side.kind === 's' && sw >= 2.2 && tier < 2) {
      const q = hq(h, 207), want = q < 0.24 ? 'bench' : q < 0.33 ? 'jar' : null;
      if (want) {
        // room on the wall face beside the door: the face runs from a to b; s in the door frame is +u from the door centre
        const sa = D.segS, sb = D.segLen - D.segS, alongU = F.ux * D.dx + F.uz * D.dz > 0, roomPlus = alongU ? sb : sa, roomMinus = alongU ? sa : sb;
        const L = want === 'bench' ? 1.3 + 1.1 * hq(h, 208) : 0.6, gap = hw + 0.45 + 0.3 * hq(h, 209);
        const dirs = hq(h, 210) < 0.5 ? [1, -1] : [-1, 1];
        for (const dir of dirs) {
          if ((dir > 0 ? roomPlus : roomMinus) < gap + L + 0.3) continue;
          const s0 = dir > 0 ? gap : -gap - L, s1 = s0 + L, gb = footAt(F, (s0 + s1) / 2, 0.3), dep = want === 'bench' ? 0.42 : 0.5, hgt = want === 'bench' ? 0.42 + 0.08 * hq(h, 211) : 0.34;
          const pf = pt(F, (s0 + s1) / 2, dep, gb);
          if (camDist(pf[0], gb + 0.6, pf[2]) < 1.0 || layout.houseAt(pf[0], pf[2])) { stats.skippedForCamera++; break; }
          col(wW, mul(mix(wall, st.mud, st.white ? 0.35 : 0), 0.94));
          box(wW, F, s0, s1, 0, dep, gb - 0.3, gb + hgt, FRONT | LEFT | RIGHT | TOP);
          if (want === 'jar') {
            const c = pt(F, (s0 + s1) / 2, dep * 0.5, gb + hgt);
            col(wW, mul(CLAY, 0.85 + 0.3 * hq(h, 212)));
            lathe(wW, c[0], c[1] - 0.1, c[2], [[0.1, 0], [0.19, 0.1], [0.225, 0.26], [0.19, 0.42], [0.11, 0.5], [0.135, 0.56]], 8, [0.03, 0.03, 0.03]);
            stats.jarStands++; sample('jar', F, (s0 + s1) / 2, dep, gb + hgt);
          } else { stats.benches++; sample('bench', F, (s0 + s1) / 2, dep, gb + hgt); }
          break;
        }
      }
    }
    return reach;
  }

  // ------------------------------------------------------------------------------------------ street walls ----
  // the faces of a house that look on a street or on open ground:
  // [{ a, b, F (frame, with len), flat | plinth | tooth, edge, part, y0, y1 (foot and top of THIS face), roof, side, ch(s) }]
  // ch(s) = chainage along the plot edge of the point s of the face: the same band runs over all the teeth of a front
  function streetFaces(h, sp, plan) {
    const out = [], g = plan.g, base = sp.base ?? g - 1;
    for (const P of plan.parts) for (const ed of P.edges) {
      if (ed.kind !== 0 || ed.e < 0) continue;
      const side = h.sides[ed.e];
      if (!side || side.kind === 'p') continue;
      const left = P.cw, norm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l; return left ? [dz, -dx] : [-dz, dx]; };
      const el = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]) || 1, ex = (ed.q[0] - ed.p[0]) / el, ez = (ed.q[1] - ed.p[1]) / el;
      const on = norm(ed.p, ed.q);
      const face = (a, b, extra) => {
        const n = norm(a, b), F = faceFrame(a, b, n[0], n[1]);
        const c0 = (F.ox - ed.p[0]) * ex + (F.oz - ed.p[1]) * ez, cs = F.ux * ex + F.uz * ez;
        // gAt: the ground before the PLOT line at the chainage of s (the same for the plinth and for every tooth above it)
        const gAt = (s) => { const c = c0 + cs * s; return ground.height(ed.p[0] + ex * c + on[0] * 0.3, ed.p[1] + ez * c + on[1] * 0.3); };
        out.push({ a, b, F, edge: ed, part: P, roof: P.L, side, seed: (h.seed ^ (ed.e * 7919)) | 0, ch: (s) => c0 + cs * s, gAt, edgeLen: el, ...extra });
      };
      if (!ed.line) face(ed.p, ed.q, { flat: true, y0: base, y1: P.T });
      else {
        const pl = plan.PL !== null ? Math.min(Math.max(plan.PL, base), P.T - 0.4) : base;
        face(ed.p, ed.q, { plinth: true, y0: base, y1: pl });
        for (let j = 0; j + 1 < ed.line.length; j++) {
          const a = ed.line[j], b = ed.line[j + 1];
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.85) face(a, b, { tooth: true, y0: pl, y1: P.T });
        }
      }
    }
    return out;
  }
  /**
   * A band of other plaster on a wall face between s0 and s1, proud of it by D: from low(s) to high(s) (datum levels),
   * clipped to the face. Its edges follow the functions in steps of about `step` metres.
   */
  function band(w, f, s0, s1, low, high, c, D = 0.024, step = 0.9) {
    if (s1 - s0 < 0.3) return 0;
    const F = f.F, n = Math.max(1, Math.round((s1 - s0) / step)), lo = f.y0 + (f.tooth ? 0.002 : -10), hi = f.y1 - (f.plinth ? 0.035 : 0.0);
    let sp = s0, lp = Math.max(lo, low(sp)), hp = Math.min(hi, high(sp)), nq = 0;
    col(w, c);
    for (let i = 1; i <= n; i++) {
      const sn = s0 + ((s1 - s0) * i) / n, ln = Math.max(lo, low(sn)), hn = Math.min(hi, high(sn));
      if (hp > lp + 0.05 || hn > ln + 0.05) { w.quadP(pt(F, sp, D, lp), pt(F, sn, D, ln), pt(F, sn, D, Math.max(ln, hn)), pt(F, sp, D, Math.max(lp, hp))); nq++; }
      sp = sn; lp = ln; hp = hn;
    }
    return nq;
  }
  // a patch of newer plaster: an irregular blot proud of the face
  function patch(w, f, sc, yc, rx, ry, c, rnd) {
    const F = f.F, D = 0.034, n = 8, P = [], ph = rnd.next() * M.TAU;
    for (let k = 0; k < n; k++) { const a = ph + ((k + 0.5 * rnd.next()) / n) * M.TAU, r = 0.55 + 0.6 * rnd.next(); P.push(pt(F, sc + Math.cos(a) * rx * r, D, yc + Math.sin(a) * ry * r)); }
    const C = pt(F, sc, D, yc);
    col(w, c);
    for (let k = 0; k < n; k++) w.triP(C, P[k], P[(k + 1) % n]);
    stats.patches++;
  }
  // rain wash below the top of a wall: a narrow streak that widens a little and fades out
  function streak(w, f, s, len, wd, c, lean) {
    const F = f.F, D = 0.012, y = f.y1 - 0.02;
    col(w, c);
    w.quadP(pt(F, s - wd * 0.5, D, y), pt(F, s - wd * 0.7 + lean, D, y - len), pt(F, s + wd * 0.3 + lean, D, y - len), pt(F, s + wd * 0.5, D, y));
    stats.streaks++;
  }
  // a shrinkage crack running down from the head of a wall: a thin dark line in a few kinked strokes
  function crack(w, f, s, yTop, len, c, rnd) {
    const F = f.F, D = 0.007, n = 3 + Math.floor(rnd.next() * 4);
    let ps = s, py = yTop;
    col(w, c);
    for (let i = 0; i < n; i++) {
      const ny = py - (len / n) * (0.6 + 0.8 * rnd.next()), ns = ps + (rnd.next() - 0.5) * 0.12, wd = 0.006 * (1 - i / (n + 1)) + 0.0025;
      w.quadP(pt(F, ps - wd, D, py), pt(F, ns - wd * 0.8, D, ny), pt(F, ns + wd * 0.8, D, ny), pt(F, ps + wd, D, py));
      ps = ns; py = ny;
    }
    stats.cracks++;
  }
  function spout(wr, f, s, st, h, rnd, P) {
    const F = f.F, wT = wr.timber, wW = wr.walls, y = f.roof - 0.04, wood = mul(mix(WOOD, GREY, 0.3 + 0.6 * rnd.next()), 0.8 + 0.4 * rnd.next()), len = 0.42 + 0.2 * rnd.next();
    col(wT, wood);
    tbox(wT, F, s - 0.085, s + 0.085, -0.06, len, y, y + 0.03, FRONT | BOTTOM | LEFT | RIGHT, 'd', rnd.next() * 3, rnd.next() * 3);
    tbox(wT, F, s - 0.085, s - 0.055, -0.06, len, y + 0.03, y + 0.11, FRONT | TOP | LEFT, 'd', rnd.next() * 3, rnd.next() * 3);
    tbox(wT, F, s + 0.055, s + 0.085, -0.06, len, y + 0.03, y + 0.11, FRONT | TOP | RIGHT, 'd', rnd.next() * 3, rnd.next() * 3);
    col(wT, mul(wood, 0.35)); tbox(wT, F, s - 0.055, s + 0.055, -0.06, len, y + 0.03, y + 0.034, TOP, 'd', 0, 0);
    // the stain it leaves on the wall
    const gy = f.gAt ? f.gAt(s) : footAt(F, s), drop = Math.min(y - Math.max(gy, f.y0) - 0.3, 1.2 + 2.0 * rnd.next()), lean = (rnd.next() - 0.5) * 0.2, dark = mul(mix(st.wallColor, DAMP, 0.16), 0.93), D = 0.013;
    if (drop > 0.5) {
      col(wW, dark);
      wW.quadP(pt(F, s - 0.07, D, y - 0.01), pt(F, s - 0.07 - 0.12 + lean * 0.5, D, y - drop * 0.55), pt(F, s + 0.1 + lean * 0.5, D, y - drop * 0.55), pt(F, s + 0.07, D, y - 0.01));
      wW.quadP(pt(F, s - 0.19 + lean * 0.5, D, y - drop * 0.55), pt(F, s - 0.05 + lean, D, y - drop), pt(F, s + 0.04 + lean, D, y - drop), pt(F, s + 0.1 + lean * 0.5, D, y - drop * 0.55));
    }
    // ... and the way the water takes to it on the roof: a darker fan before the hole in the parapet
    if (P && P.inner) {
      const k = P.edges.indexOf(f.edge), inset = f.inset ?? (k >= 0 ? P.dFull[k] : 0.4) + (f.tooth ? 0.6 : 0.03), L = 1.6 + 2.2 * rnd.next(), wR = wr.roof;
      const q = [pt(F, s - 0.16, -inset, 0), pt(F, s + 0.16, -inset, 0), pt(F, s + 0.5 + 0.5 * rnd.next(), -inset - L * 0.7, 0), pt(F, s + 0.2 * (rnd.next() - 0.5), -inset - L, 0), pt(F, s - 0.5 - 0.5 * rnd.next(), -inset - L * 0.75, 0)];
      let ok = true;
      for (const v of q) { if (!M.pointInPolygon(v[0], v[2], P.inner.ring)) ok = false; for (const c of P.holes) if (M.pointInPolygon(v[0], v[2], c) || M.distToRing(v[0], v[2], c) < 0.45) ok = false; }
      if (ok) { col(wR, mul(st.roofColor, 0.84)); wR.polygon(q.flatMap((v) => [v[0], v[2]]), null, P.L + 0.016, true); stats.roofDrains++; }
    }
    stats.spouts++;
  }
  function beamEnds(wr, f, st, h, rnd) {
    const F = f.F, wT = wr.timber, y = f.roof - 0.42, pitch = 0.52 + 0.2 * hq(h, 221), n = Math.min(26, Math.floor((F.len - 0.7) / pitch));
    if (n < 3) return;
    const s0 = (F.len - (n - 1) * pitch) / 2, hsz = 0.065 + 0.02 * hq(h, 222);
    for (let i = 0; i < n; i++) {
      const s = s0 + i * pitch + (rnd.next() - 0.5) * 0.08, yy = y + (rnd.next() - 0.5) * 0.04, out = 0.07 + 0.07 * rnd.next();
      col(wT, mul(mix(WOOD, GREY, 0.2 + 0.6 * rnd.next()), 0.7 + 0.4 * rnd.next()));
      tbox(wT, F, s - hsz, s + hsz, 0, out, yy - hsz, yy + hsz, ALL5, 'd', rnd.next() * 3, rnd.next() * 3);
      stats.beamEnds++;
    }
  }
  const F_len = (f) => f.F.len;
  // position of the door centre along a face's own frame (null when the door is not on this face)
  function doorS(f, D) {
    const x = D.F.ox, z = D.F.oz, F = f.F, s = (x - F.ox) * F.ux + (z - F.oz) * F.uz, d = (x - F.ox) * F.vx + (z - F.oz) * F.vz;
    return Math.abs(d) < 0.75 && s > -0.5 && s < F.len + 0.5 ? s : null;
  }
  const onDoor = (f, D, s, m) => { const c = doorS(f, D); return c !== null && Math.abs(s - c) < D.hw + m; };

  function streetWalls(h, st, sp, plan, D, wr, tier, rnd) {
    const faces = streetFaces(h, sp, plan), wW = wr.walls, wall = st.wallColor;
    if (!faces.length) return;
    // the looks of this house: what the foot of its walls is like, whether beam ends show, whether the parapet is capped
    const q = hq(h, 230), white = st.white;
    // foot: eroded and damp (darker), or re-plastered (fresher), low or as a dado of a man's height
    const footC = white ? mix(mul(wall, 0.93), st.mud, 0.1 + 0.16 * hq(h, 231)) : q < 0.5 ? mul(mix(wall, DAMP, 0.14), 0.95) : mul(mix(wall, FRESH, 0.4), 1.04);
    const footH = q > 0.88 ? 0 : !white && hq(h, 232) < 0.22 ? 1.25 + 0.9 * hq(h, 238) : 0.4 + 0.55 * hq(h, 238);
    // top: a repair of the parapet and the wall head, over a part of the front
    const topC = white ? mul(wall, 0.94 + 0.08 * hq(h, 243)) : mul(mix(wall, hq(h, 243) < 0.5 ? FRESH : st.mud, 0.35), 0.95 + 0.1 * hq(h, 244));
    const hasTop = hq(h, 245) < 0.75 && tier < 2;
    const beams = !white && h.cls !== 'mansion' && hq(h, 233) < (h.cls === 'small' ? 0.42 : 0.26) && tier === 0;
    const cap = hq(h, 234) < 0.3 && tier < 2;
    const long = faces.filter((f) => !f.plinth && F_len(f) > 1.6);
    // spouts: one or two, on the longest faces (never over the door)
    const nSp = tier < 2 ? (hq(h, 235) < 0.62 ? 1 : 0) + (hq(h, 236) < 0.25 ? 1 : 0) : 0;
    const spFaces = long.slice().sort((a, b) => F_len(b) - F_len(a));
    for (let k = 0; k < nSp && k < spFaces.length; k++) {
      const f = spFaces[k], s = F_len(f) * (0.25 + 0.5 * hq(h, 237 + k));
      if (D && f.edge === D.edge && onDoor(f, D, s, 0.9)) continue;
      spout(wr, f, s, st, h, rnd, f.part); sample('spout', f.F, s, 0, f.roof);
    }
    for (const f of faces) {
      const len = F_len(f), F = f.F, nz = vnoise(f.seed), nz2 = vnoise(f.seed + 31);
      // the door zone of this face in its own frame
      let z0 = Infinity, z1 = -Infinity;
      if (D && f.edge === D.edge) { const c = doorS(f, D); if (c !== null) { z0 = c - D.hw - 0.42; z1 = c + D.hw + 0.42; } }
      const runs = z1 < z0 ? [[0.03, len - 0.03]] : [[0.03, Math.max(0.03, z0)], [Math.min(len - 0.03, z1), len - 0.03]];
      if (tier < 2 && footH > 0 && (f.flat || f.plinth || tier === 0)) {
        // (a stepped front: slow noise, so that the band meets itself across the returns of the teeth)
        const per = f.flat ? 0.62 : 2.6, top = (s) => f.gAt(s) + footH * (0.78 + 0.4 * nz(f.ch(s) / per)), low = (s) => f.gAt(s) - 0.25;
        for (const r of runs) stats.footBands += band(wW, f, r[0], r[1], low, top, footC, 0.026, f.tooth ? 1.4 : tier === 0 ? 0.42 : 0.8) ? 1 : 0;
      }
      if (f.plinth) continue;
      if (hasTop && (f.flat || tier === 0)) {
        // the repaired stretch: where a slow noise along the front is high
        const dep = (s) => { const c = f.ch(s), m = nz2(c / 4.5 + 3); return m > 0.42 ? 0.3 + 1.6 * (m - 0.42) * (0.7 + 0.6 * nz(c / (f.flat ? 0.6 : 2.6) + 9)) : 0; };
        const nq = band(wW, f, 0.0, len, (s) => f.y1 - dep(s), () => f.y1, topC, 0.019, f.tooth ? 1.4 : tier === 0 ? 0.45 : 0.8);
        if (nq) stats.topBands++;
      }
      if (tier < 2 && (f.flat || len > 1.5)) {
        // patches of newer plaster
        const np = f.flat ? (hq(h, 240) < 0.55 ? 1 : 0) + (len > 7 && hq(h, 241) < 0.5 ? 1 : 0) : rnd.next() < 0.12 ? 1 : 0;
        for (let k = 0; k < np; k++) {
          const rx = Math.min(len * 0.3, 0.45 + 0.7 * rnd.next()), ry = 0.35 + 0.6 * rnd.next(), sc = rx + 0.2 + (len - 2 * rx - 0.4) * rnd.next(), gy = f.gAt(sc), yb = Math.max(f.y0, gy);
          const yc = yb + 1.1 + (f.y1 - yb - 2.0) * rnd.next();
          if (yc + ry * 1.2 > f.y1 - 0.15 || yc - ry * 1.2 < yb + 0.15 || (sc + rx * 1.3 > z0 && sc - rx * 1.3 < z1)) continue;
          patch(wW, f, sc, yc, rx, ry, white ? mul(wall, 0.93 + 0.1 * rnd.next()) : mul(mix(wall, FRESH, 0.15 + 0.25 * rnd.next()), 0.95 + 0.1 * rnd.next()), rnd);
        }
        // rain wash from the top
        const ns = f.flat ? Math.min(4, Math.floor(len / 2.2 * (0.4 + rnd.next()))) : rnd.next() < 0.25 ? 1 : 0;
        for (let k = 0; k < ns; k++) { const s = 0.2 + (len - 0.4) * rnd.next(); if (s > z0 - 0.2 && s < z1 + 0.2) continue; streak(wW, f, s, 0.7 + 1.9 * rnd.next(), 0.06 + 0.1 * rnd.next(), mul(mix(wall, white ? st.mud : DAMP, 0.14), 0.95), (rnd.next() - 0.5) * 0.1); }
      }
      if (tier === 0 && len > 1.2 && rnd.next() < (f.flat ? Math.min(0.9, len / 9) : 0.1)) {
        const s = 0.3 + (len - 0.6) * rnd.next();
        if (!(s > z0 - 0.3 && s < z1 + 0.3)) crack(wW, f, s, f.y1 - 0.01, 0.6 + 1.6 * rnd.next(), mul(wall, 0.62), rnd);
      }
      if (cap && f.flat) {
        col(wW, mul(mix(wall, st.mud, white ? 0.15 : 0), 1.03));
        box(wW, F, 0, len, 0, 0.035, f.y1 - 0.2 - 0.06 * hq(h, 242), f.y1, FRONT | BOTTOM | TOP);
        stats.cappings++; sample('capping', F, len / 2, 0, f.y1);
      }
      if (beams && f.flat && len > 2.4) { beamEnds(wr, f, st, h, rnd); sample('beams', F, len / 2, 0, f.roof - 0.4); }
    }
  }

  // ------------------------------------------------------------------------------------------ wall heads ----
  // The head of a mud parapet is rounded by hand and by rain and never quite level: a low crust on the parapet top,
  // 1 to 4 cm high, chamfered to both sides (the shell's own top is a level plane with square edges).
  const headNoise = vnoise(4711);
  const headH = (x, z) => 0.008 + 0.03 * headNoise((x * 0.83 + z * 1.31) / 1.1) * (0.6 + 0.4 * headNoise((x * 1.7 - z * 0.9) / 0.37 + 5));
  /** Crust between the outer line o0 -> o1 (the wall face) and the inner line i0 -> i1 at level y; `inner` adds the chamfer to the roof side. */
  function crust(w, o0, o1, i0, i1, y, c, seg = 1.4, inner = true) {
    const len = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]), n = Math.max(1, Math.round(len / seg)), CH = 0.14;
    // is the inner line on the left of travel o0 -> o1? (decides the winding)
    const left = (o1[0] - o0[0]) * (i0[1] - o0[1]) - (o1[1] - o0[1]) * (i0[0] - o0[0]) < 0;
    const at = (t) => { const ox = o0[0] + (o1[0] - o0[0]) * t, oz = o0[1] + (o1[1] - o0[1]) * t, ix = i0[0] + (i1[0] - i0[0]) * t, iz = i0[1] + (i1[1] - i0[1]) * t, hh = y + headH(ox, oz);
      return [[ox, y, oz], [ox + (ix - ox) * CH, hh, oz + (iz - oz) * CH], [ox + (ix - ox) * (1 - CH), hh, oz + (iz - oz) * (1 - CH)], [ix, y, iz]]; };
    col(w, c);
    let A = at(0);
    for (let k = 1; k <= n; k++) {
      const B = at(k / n);
      for (let j = 0; j < (inner ? 3 : 2); j++) { if (left) w.quadP(B[j], B[j + 1], A[j + 1], A[j]); else w.quadP(A[j], A[j + 1], B[j + 1], B[j]); }
      A = B;
    }
    stats.heads += n;
  }
  function heads(h, st, sp, plan, wr, all, shiftOut = null) {
    const wW = wr.walls, c = st.parapetColor || st.wallColor;
    for (const P of plan.parts) {
      if (!P.inner) continue;
      for (let k = 0; k < P.edges.length; k++) {
        const ed = P.edges[k];
        if (ed.kind === 2 || !(P.dFull[k] > 0.15)) continue;
        const side = ed.e >= 0 ? h.sides[ed.e] : null, street = ed.kind === 0 && side && side.kind !== 'p';
        if (!all && !street) continue;
        const a = P.inner.A[k], b = P.inner.B[k];
        if (!ed.line) {
          const l = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]), sh = shiftOut ? shiftOut(P, k, ed) : 0;
          if (l <= 0.5) continue;
          // (the hero's court linings widen the head toward the court: the crust covers them too)
          const ox = ((P.cw ? ed.q[1] - ed.p[1] : ed.p[1] - ed.q[1]) / l) * sh, oz = ((P.cw ? ed.p[0] - ed.q[0] : ed.q[0] - ed.p[0]) / l) * sh;
          crust(wW, [ed.p[0] + ox, ed.p[1] + oz], [ed.q[0] + ox, ed.q[1] + oz], a, b, P.T, c, all ? 0.7 : 1.4, all);
          continue;
        }
        // a stepped front: a strip on every long face of the teeth
        for (let j = 0; j + 1 < ed.line.length; j++) {
          const p = ed.line[j], q = ed.line[j + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (l < 0.85) continue;
          const dx = (q[0] - p[0]) / l, dz = (q[1] - p[1]) / l, inx = P.cw ? -dz : dz, inz = P.cw ? dx : -dx, wd = Math.min(0.2, P.dFull[k] * 0.5);
          const o0 = [p[0] + dx * 0.02, p[1] + dz * 0.02], o1 = [q[0] - dx * 0.02, q[1] - dz * 0.02];
          crust(wW, o0, o1, [o0[0] + inx * wd, o0[1] + inz * wd], [o1[0] + inx * wd, o1[1] + inz * wd], P.T, c, 2.5, all);
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ courts ----
  /** Which edge of the first court carries the shell's stair (geom/house.js stairInto), or -1. */
  function stairEdge(sp, plan) {
    const main = plan.parts[0];
    if (!sp.courtStair || !main || !main.holes.length) return -1;
    const c = main.holes[0], m = c.length;
    let best = 0, bl = 0;
    for (let i = 0; i < m; i++) { const p = c[i], q = c[(i + 1) % m], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; best = i; } }
    const rise = main.L - plan.g, nst = Math.max(3, Math.round(rise / 0.23)), tread = Math.min(0.28, (bl - 0.3) / nst);
    return tread < 0.16 ? -1 : best;
  }
  /**
   * The lining of one court wall (from `a` to `b`, the court on the side of the unit normal n): a skin of thickness t
   * with a doorway cut through it, mitred at both ends against the linings of the neighbouring walls.
   * door: { s, w, h, leaf: boolean } | null in the wall's own frame.
   */
  function courtWall(wr, F, len, y0, y1, t, door, c, opt = {}) {
    const wW = wr.walls, e0 = opt.end0 ?? t, e1 = opt.end1 ?? t;
    col(wW, c);
    if (!door) wW.quadP(pt(F, e0, t, y0), pt(F, len - e1, t, y0), pt(F, len - e1, t, y1), pt(F, e0, t, y1));
    else {
      const s0 = door.s - door.w / 2, s1 = door.s + door.w / 2, yt = y0 + door.h;
      wW.quadP(pt(F, e0, t, y0), pt(F, s0, t, y0), pt(F, s0, t, y1), pt(F, e0, t, y1));
      wW.quadP(pt(F, s1, t, y0), pt(F, len - e1, t, y0), pt(F, len - e1, t, y1), pt(F, s1, t, y1));
      wW.quadP(pt(F, s0, t, yt), pt(F, s1, t, yt), pt(F, s1, t, y1), pt(F, s0, t, y1));
      wW.occlusion(0.7);
      wW.quadP(pt(F, s0, t, y0), pt(F, s0, 0.012, y0), pt(F, s0, 0.012, yt), pt(F, s0, t, yt));          // jamb looking along +u
      wW.quadP(pt(F, s1, 0.012, y0), pt(F, s1, t, y0), pt(F, s1, t, yt), pt(F, s1, 0.012, yt));          // jamb looking along -u
      wW.occlusion(1);
      const wT = wr.timber;
      if (door.leaf) { col(wT, door.wood); tbox(wT, F, s0, s1, 0, 0.03, y0, yt, FRONT, 'y', door.u, door.v); }
      else { col(wW, DARK); wW.occlusion(0.5); wW.quadP(pt(F, s0, 0.012, y0), pt(F, s1, 0.012, y0), pt(F, s1, 0.012, yt), pt(F, s0, 0.012, yt)); wW.occlusion(1); }
      // lintel: its soffit closes the head of the opening, its face stands proud of the lining
      col(wT, door.lintel);
      tbox(wT, F, s0 - 0.16, s1 + 0.16, 0.012, t + 0.03, yt - 0.01, yt + 0.15, opt.lintelFaces ?? FRONT | BOTTOM, 's', door.u + 1.3, door.v + 0.7);
      stats.courtDoors++;
    }
    if (opt.top !== false) { col(wW, opt.topColor || c); wW.quadP(pt(F, e0, t, y1), pt(F, len - e1, t, y1), pt(F, len, 0, y1), pt(F, 0, 0, y1)); }
  }
  function vents(wr, F, len, y, t, n, door) {
    const wW = wr.walls;
    col(wW, DARK); wW.occlusion(0.6);
    for (let i = 0; i < n; i++) {
      const s = len * ((i + 0.5) / n) + (i % 2 ? 0.12 : -0.1);
      if (s < t + 0.3 || s > len - t - 0.3) continue;
      wW.quadP(pt(F, s - 0.05, t + 0.008, y - 0.24), pt(F, s + 0.05, t + 0.008, y - 0.24), pt(F, s + 0.05, t + 0.008, y), pt(F, s - 0.05, t + 0.008, y));
      stats.vents++;
    }
    wW.occlusion(1);
  }
  function courts(h, st, sp, plan, wr, tier, rnd) {
    const g = plan.g, sEdge = stairEdge(sp, plan), wood = mul(mix(mix(WOOD, CEDAR, 0.5 * hq(h, 251)), GREY, 0.2 + 0.5 * hq(h, 252)), 0.85 + 0.3 * hq(h, 256));
    const south = [-Math.sin(h.rotationDeg * M.DEG), Math.cos(h.rotationDeg * M.DEG)];
    for (let pi = 0; pi < plan.parts.length; pi++) {
      const P = plan.parts[pi], tkP = Math.min(sp.kerbThickness ?? 0.3, P.tk), kerbP = tkP >= 0.08 ? sp.kerb ?? 0.3 : 0, rim = P.inner ? P.L + kerbP : P.T;
      for (let ci = 0; ci < P.holes.length; ci++) {
        const c = P.holes[ci], m = c.length, cc = M.polygonCentroid(c);
        let minLen = Infinity; for (let i = 0; i < m; i++) minLen = Math.min(minLen, Math.hypot(c[(i + 1) % m][0] - c[i][0], c[(i + 1) % m][1] - c[i][1]));
        const t = tier < 2 ? Math.min(0.2, 0.14 + 0.04 * hq(h, 253), minLen * 0.08) : 0.035;
        for (let i = 0; i < m; i++) {
          const a = c[i], b = c[(i + 1) % m], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 0.6) continue;
          let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
          if ((cc[0] - (a[0] + b[0]) / 2) * nx + (cc[1] - (a[1] + b[1]) / 2) * nz < 0) { nx = -nx; nz = -nz; }
          const F = faceFrame(a, b, nx, nz), stair = pi === 0 && ci === 0 && i === sEdge;
          // the wall that looks north is the wall of the main room, south of the court: its door is the widest (R5 3.1)
          const isMain = -(nx * south[0] + nz * south[1]) > 0.7;
          let door = null;
          const r1 = rnd.next(), r2 = rnd.next(), r3 = rnd.next(), r4 = rnd.next();
          if (!stair && len > 1.7) {
            const big = st.elite, w = Math.min(len - 1.0, isMain ? (big ? 1.5 + 0.9 * r1 : 1.05 + 0.35 * r1) : 0.8 + 0.3 * r1), hh = Math.min(rim - g - 0.55, isMain ? (big ? 2.6 + 0.5 * r2 : 2.1 + 0.2 * r2) : 1.85 + 0.25 * r2);
            const s = isMain ? len / 2 + (r3 - 0.5) * 0.2 * len : M.lerp(w / 2 + 0.45, len - w / 2 - 0.45, r3);
            if (w >= 0.7 && hh >= 1.5) door = { s, w, h: hh, leaf: r4 < 0.3, wood: mul(wood, 0.8 + 0.4 * r1), lintel: mul(wood, 0.9), u: r2 * 3, v: r3 * 3 };
          }
          if (tier < 2) {
            courtWall(wr, F, len, g, rim, t, door, st.wallColor);
            if (len > 2.6 && rim - g > 2.9) vents(wr, F, len, P.L - 0.4, t, len > 9 ? 5 : len > 6 ? 4 : len > 4 ? 3 : 2, door);
          } else if (door) {
            // far tier: the doorway as a dark panel with its lintel, applied to the wall
            const wW = wr.walls, wT = wr.timber, s0 = door.s - door.w / 2, s1 = door.s + door.w / 2;
            col(wW, DARK); wW.quadP(pt(F, s0, t, g), pt(F, s1, t, g), pt(F, s1, t, g + door.h), pt(F, s0, t, g + door.h));
            col(wT, door.lintel); tbox(wT, F, s0 - 0.16, s1 + 0.16, 0, t + 0.02, g + door.h, g + door.h + 0.15, FRONT, 's', door.u, door.v);
            stats.courtDoors++;
          }
        }
        // paving of square baked bricks, laid to the axes of the court
        if (st.paved && m === 4) {
          const q = geom.insetRing(c.concat([c[0]]), tier < 2 ? t : 0.02), o = M.openRing(q);
          if (o.length === 4) {
            const up = M.polygonArea(o) > 0 ? [o[0], o[3], o[2], o[1]] : [o[0], o[1], o[2], o[3]];       // counter-clockwise seen from above (polygonArea > 0 is clockwise)
            const lu = Math.hypot(up[1][0] - up[0][0], up[1][1] - up[0][1]), lv = Math.hypot(up[2][0] - up[1][0], up[2][1] - up[1][1]), wP = wr.paving, u0 = 3 * hq(h, 254), v0 = 3 * hq(h, 255), y = g + 0.03;
            col(wP, mul(BRICK, (st.floorColor[0] + st.floorColor[1] + st.floorColor[2]) / (BRICK[0] + BRICK[1] + BRICK[2])));
            wP.quadUV(up[0][0], y, up[0][1], up[1][0], y, up[1][1], up[2][0], y, up[2][1], up[3][0], y, up[3][1], u0, v0, u0 + lu, v0 + lv);
            stats.pavedCourts++;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ roofs ----
  function roofPatches(h, st, sp, plan, wr, tier, rnd) {
    const wR = wr.roof;
    for (const P of plan.parts) {
      if (!P.inner) continue;
      const ring = P.inner.ring, bb = M.bbox(ring), area = Math.abs(M.polygonArea(ring));
      const n = area < 30 ? (rnd.next() < 0.5 ? 1 : 0) : area < 120 ? 1 + (rnd.next() < 0.5 ? 1 : 0) : 2 + (rnd.next() < 0.6 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const x = M.lerp(bb[0], bb[2], rnd.next()), z = M.lerp(bb[1], bb[3], rnd.next()), r0 = Math.min(2.6, 0.7 + 0.11 * Math.sqrt(area) * (0.6 + rnd.next()));
        const flat = [], ph = rnd.next() * M.TAU, ax = 0.6 + 0.8 * rnd.next(), rot = rnd.next() * M.TAU, cr = Math.cos(rot), sr = Math.sin(rot);
        let ok = true;
        for (let i = 0; i < 9 && ok; i++) {
          const a = ph - ((i + 0.6 * rnd.next()) / 9) * M.TAU, r = r0 * (0.55 + 0.75 * rnd.next()), lx = Math.cos(a) * r * ax, lz = Math.sin(a) * r, px = x + lx * cr - lz * sr, pz = z + lx * sr + lz * cr;
          if (!M.pointInPolygon(px, pz, ring) || M.distToRing(px, pz, ring) < 0.08) ok = false;
          for (const c of P.holes) if (ok && (M.pointInPolygon(px, pz, c) || M.distToRing(px, pz, c) < 0.5)) ok = false;
          flat.push(px, pz);
        }
        if (!ok) continue;
        const kk = rnd.next();
        col(wR, kk < 0.5 ? mul(st.roofColor, 0.86 + 0.08 * rnd.next()) : mul(mix(st.roofColor, mul(FRESH, 0.92), 0.5), 1.02 + 0.08 * rnd.next()));
        wR.polygon(flat, null, P.L + 0.012, true);
        stats.roofPatches++;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ roof rooms ----
  /**
   * A light room on the roof (R5 2.1: "a possible room on the flat roof"), against a parapet of the main roof:
   * { ring, height, parapet, door } or null. Pure function of the record; stays clear of the roof anchors and
   * lamps of the layout (what other modules put on the roof), of the courts, and of the film camera.
   */
  function roofRoomFor(h, plan, capLevel) {
    const q = hq(h, 260), p = h.cls === 'mansion' ? 0.5 : h.cls === 'large' ? 0.3 : h.cls === 'medium' ? 0.13 : 0.05;
    if (q >= p || h.landmark) return null;
    const P = plan.parts[0];
    if (!P || !P.inner) return null;
    const hgt = 2.0 + 0.35 * hq(h, 261), par = 0.3;
    if (P.L + hgt + par > capLevel) return null;
    const rnd = new Rng((h.seed ^ 0x6f0f) >>> 0), anchors = layout.roofAnchors(h).items, lamps = layout.lampsFor(h).filter((l) => l.kind === 'roof');
    const ring = P.inner.ring, m = P.edges.length;
    for (let tries = 0; tries < 10; tries++) {
      const k = rnd.int(0, m - 1), ed = P.edges[k];
      if (ed.kind === 2 || ed.line) continue;
      const len = Math.hypot(ed.q[0] - ed.p[0], ed.q[1] - ed.p[1]), wdt = 2.4 + 1.4 * rnd.next(), dep = 2.1 + 0.9 * rnd.next();
      if (len < wdt + 1.2) continue;
      const dx = (ed.q[0] - ed.p[0]) / len, dz = (ed.q[1] - ed.p[1]) / len, inx = P.cw ? -dz : dz, inz = P.cw ? dx : -dx;
      const s0 = 0.6 + (len - wdt - 1.2) * rnd.next(), off = P.dFull[k] + 0.02;
      const c = (s, d) => [ed.p[0] + dx * s + inx * (off + d), ed.p[1] + dz * s + inz * (off + d)];
      const r = [c(s0, 0), c(s0 + wdt, 0), c(s0 + wdt, dep), c(s0, dep)];
      let ok = true;
      for (const v of [c(s0 - 0.05, 0.05), c(s0 + wdt + 0.05, 0.05), c(s0 + wdt + 0.3, dep + 0.5), c(s0 - 0.3, dep + 0.5), c(s0 + wdt / 2, dep + 0.9)]) {
        if (!M.pointInPolygon(v[0], v[1], ring)) ok = false;
        for (const ct of P.holes) if (M.pointInPolygon(v[0], v[1], ct) || M.distToRing(v[0], v[1], ct) < 0.7) ok = false;
      }
      if (!ok) continue;
      const mid = c(s0 + wdt / 2, dep / 2);
      for (const it of anchors) if (Math.hypot(it.x - mid[0], it.z - mid[1]) < Math.hypot(wdt, dep) / 2 + Math.max(it.size[0], it.size[1]) / 2 + 0.4) ok = false;
      for (const l of lamps) if (Math.hypot(l.x - mid[0], l.z - mid[1]) < Math.hypot(wdt, dep) / 2 + 0.8) ok = false;
      if (!ok) continue;
      if (camDist(mid[0], P.L + hgt, mid[1]) < 9) { stats.skippedForCamera++; return null; }
      return { ring: [...r, r[0]], height: hgt, parapet: par, level: P.L, door: { a: c(s0, dep), b: c(s0 + wdt, dep), n: [inx, inz], at: 0.25 + 0.5 * rnd.next() }, house: h.id, center: mid };
    }
    return null;
  }
  function roofRoomDetail(h, st, room, wr, rnd) {
    // its doorway: a dark opening with a timber lintel, on the side that looks over the roof
    const wW = wr.walls, wT = wr.timber, d = room.door, F = faceFrame(d.a, d.b, d.n[0], d.n[1]), s = F.len * d.at, w = 0.75, y0 = room.level, hh = Math.min(1.75, room.height - 0.3);
    col(wW, DARK); wW.quadP(pt(F, s - w / 2, 0.012, y0), pt(F, s + w / 2, 0.012, y0), pt(F, s + w / 2, 0.012, y0 + hh), pt(F, s - w / 2, 0.012, y0 + hh));
    col(wT, mix(WOOD, GREY, 0.6)); tbox(wT, F, s - w / 2 - 0.15, s + w / 2 + 0.15, 0, 0.04, y0 + hh, y0 + hh + 0.13, ALL5, 's', rnd.next() * 3, rnd.next() * 3);
  }

  // ------------------------------------------------------------------------------------------ one house ----
  const rooms = new Map();
  return {
    stats, roofRooms, mat,
    /** The roof room of a house, decided once (index.js puts it into the shell spec as `upper`). */
    roomOf(h, plan, capLevel) {
      if (!rooms.has(h.id)) { const r = roofRoomFor(h, plan, capLevel); rooms.set(h.id, r); if (r) { roofRooms.push({ house: r.house, ring: r.ring, level: r.level, top: r.level + r.height + r.parapet, center: r.center }); stats.roofRooms++; } }
      return rooms.get(h.id);
    },
    /** Near detail of one house; d = its distance from the film path; lodName = the band it is written into. */
    house(h, d, lodName = 'detail', opts = {}) {
      const st = styleOf(h), sp = specOf(h), plan = geom.housePlan(sp);
      if (!plan.ok || !plan.parts.length) return;
      const tier = d < NEAR ? 0 : d < MID ? 1 : 2, wr = writers(h, lodName), rnd = new Rng((h.seed ^ 0x51a7) >>> 0);
      let D = null;
      if (tier < 2) { D = doorGeometry(h, sp, plan); if (D) streetDoor(h, st, D, wr, tier, rnd); }
      streetWalls(h, st, sp, plan, D, wr, tier, rnd);
      // (within 50 m of the film path the roofs are seen from above at close range: every parapet gets its crust)
      if (tier === 0) heads(h, st, sp, plan, wr, lodName !== 'detail' || d < 50, opts.headShift || null);
      courts(h, st, sp, plan, wr, d < LINED ? tier : 2, rnd);          // beyond 130 m the court doorways are applied panels
      roofPatches(h, st, sp, plan, wr, tier, rnd);
      const room = rooms.get(h.id);
      if (room && tier < 2) roofRoomDetail(h, st, room, wr, rnd);
    },
    writers, doorGeometry, streetDoor, streetFaces, streetWalls, band, patch, streak, crack, crust, heads, spout, beamEnds, courtWall, vents, courts, roofPatches, vnoise, footAt,
    colors: { WOOD, CEDAR, BRICK, CLAY, FRESH, DAMP, ROOF, DARK }, mul, mix, col,
    /** Submit one writer of a bin with the options its material needs. */
    submit(name, w, common, lod) {
      if (lod === 'box') return geom.addStatic(mat.walls, w, common);
      const small = { ...common, shadowTexel: 0.15, occluder: false }, flat = { ...common, castShadow: false, occluder: false };
      if (name === 'walls') return geom.addStatic(mat.walls, w, lod === 'detail' ? small : common);
      if (name === 'lime') return geom.addStatic(mat.lime, w, common);
      if (name === 'roof') return geom.addStatic(mat.roof, w, common);
      if (name === 'timber') return geom.addStatic(mat.timber, w, small);
      if (name === 'pavingUV') return geom.addStatic(mat.pavingUV, w, flat);
      if (name === 'roofDecal') return geom.addStatic(mat.roofDecal, w, flat);
      throw new Error('houses: unknown writer ' + name);
    },
    checks: () => [
      { name: 'street doors with a timber lintel and threshold (near level)', value: stats.doors, expect: '> 0', pass: stats.doors > 0 },
      { name: 'court doorways (near level)', value: stats.courtDoors, expect: '> 0', pass: stats.courtDoors > 0 },
    ],
  };
}
