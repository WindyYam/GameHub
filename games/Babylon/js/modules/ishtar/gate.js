// js/modules/ishtar/gate.js — the double gate itself (SPEC 3.6, R2 4-6): fore-gate with its two towers and the
// transverse chamber, the 4 m court, the larger and taller main gate with its long chamber, four round-arched doors
// with cedar leaves standing open, the glazed skin of every face (bulls and dragons where the wall is open to view),
// pedestals and the copper beasts at the door-jambs.
// Frame: u = metres east of the gate axis, s = metres south of the fore-gate tower fronts (world.json stations_s).
import * as M from '../../core/mathx.js';
import { BREAST } from './util.js';
import { makeBeasts } from './beasts.js';

export function buildGate(ctx, K) {
  const { geom, glazed: G, W, THREE } = ctx, C = K.C, put = K.put;
  const d = W.monument('ishtarGate').dims, ax = d.axis, st = d.stations_s, fg = d.foreGate, mg = d.mainGate, door = d.doors;
  const S = [(ax.south[0] - ax.north[0]) / ax.length, (ax.south[1] - ax.north[1]) / ax.length], E = [S[1], -S[0]];
  const at = (u, s) => [ax.north[0] + E[0] * u + S[0] * s, ax.north[1] + E[1] * u + S[1] * s];
  const rot = M.dirToAz(-S[0], -S[1]);                         // the gate looks north: 359.3
  const P0 = Math.floor(d.pavementLevel / C) * C;              // the pavement of the gate on a whole course: +15.364
  const BASE = 7.5, lv = (c) => P0 + c * C, cOf = (h) => Math.round(h / C);
  // walk levels in courses above the pavement (merlon tops = walk + 0.34 + 0.9: 14.55 / 18.58 / 19.27 / 24.07 m)
  const FGW = cOf(fg.wallTop - 1.2), FGT = cOf(fg.towerTop - 1.2), MGW = cOf(mg.wallTop - 1.2), MGT = cOf(mg.towerTop - 1.2), BR = 4;
  const CTW = 126;                                             // the blocks beside the court (= the northern wing walls): walk 10.8 m
  const fgHW = fg.width / 2, tIn = fg.towers.innerFacesApart / 2, tOut = tIn + fg.towers.width;
  const mgHW = mg.width / 2, mIn = mg.towers.innerFacesApart / 2, mOut = mIn + mg.towers.width;
  const ctHW = d.court.width / 2, dHW = door.width / 2, chHL = fg.chamber[0] / 2, mchHW = mg.chamber[0] / 2;
  const sD1 = st.door1, sC1 = st.foreChamberN, sD2 = st.door2, sFS = st.foreGateSouthFace, sMT = st.mainGateTowerFronts, sD3 = st.door3, sC2 = st.mainChamberN, sD4 = st.door4, sMS = st.mainGateSouthFace;
  const PJ = 0.165;                                            // the upper storey of a tower projects half a brick
  const SPRING = door.crown - dHW, IMPOST = 112;               // springing 9.65 m; jamb panels end on course 112 (9.61 m)
  const stats = { animals: 0, bulls: 0, dragons: 0, panels: 0, rows: 0, animalHeight: G.figures.bull.cellH };
  const count = (p) => { if (!p) return p; stats.panels++; for (const it of p.items) { stats.animals++; if (it.figure === 'bull') stats.bulls++; else if (it.figure === 'dragon') stats.dragons++; else stats.other = (stats.other || 0) + 1; stats.rows = Math.max(stats.rows, (it.row ?? 0) + 1); } return p; };

  const rect = (u0, u1, s0, s1) => [at(u0, s0), at(u1, s0), at(u1, s1), at(u0, s1)];
  const ringUS = (pts) => pts.map(([u, s]) => at(u, s));
  /** A solid of the gate: blue masonry from the pavement up, bare brick below it (where the ground outside is lower). */
  const mass = (ring, top, { topFace = false, bottom = false, from = 0 } = {}) => {
    put('blue', geom.prism(ring, from ? lv(from) : P0 - 0.1, lv(top), { top: topFace, bottom }));
    if (!from) put('brick', geom.prism(ring, BASE, P0 - 0.1, { top: false }));
  };
  /** A wall with a round-arched doorway through it, s0..s1, half width hw. */
  const doorWall = (s0, s1, hw, top) => {
    const c = at(0, (s0 + s1) / 2);
    put('blue', geom.passageBlock({ x: c[0], z: c[1], rotDeg: rot, width: 2 * hw, depth: s1 - s0, base: P0 - 0.1, floor: P0, top: lv(top), door: { width: door.width, height: door.crown, arch: true }, segments: 18, topFace: false }));
    put('brick', geom.prism(rect(-hw, hw, s0, s1), BASE, P0 - 0.1, { top: false }));
  };
  const deck = (u0, u1, s0, s1, c) => put('roof', geom.cap(rect(u0, u1, s0, s1), lv(c)));

  // ------------------------------------------------------------------------------------------ masonry ----
  // fore-gate: front wall (door 1), transverse chamber 21.9 x 3.68 m, back wall (door 2)
  doorWall(sD1, sC1, fgHW, FGW);
  doorWall(sD2, sFS, fgHW, FGW);
  for (const sg of [-1, 1]) mass(rect(Math.min(sg * chHL, sg * fgHW), Math.max(sg * chHL, sg * fgHW), sC1, sD2), FGW);
  put('blue', K.occlude(geom.box({ x: at(0, (sC1 + sD2) / 2)[0], z: at(0, (sC1 + sD2) / 2)[1], sx: 2 * chHL, sz: sD2 - sC1, y0: lv(146), y1: lv(FGW) - 0.08, rotDeg: rot }), 0.5));
  // main gate: front wall (door 3), chamber 8.05 x 14.9 m, back wall (door 4)
  doorWall(sD3, sC2, mgHW, MGW);
  doorWall(sD4, sMS, mgHW, MGW);
  for (const sg of [-1, 1]) mass(rect(Math.min(sg * mchHW, sg * mgHW), Math.max(sg * mchHW, sg * mgHW), sC2, sD4), MGW);
  put('blue', K.occlude(geom.box({ x: at(0, (sC2 + sD4) / 2)[0], z: at(0, (sC2 + sD4) / 2)[1], sx: 2 * mchHW, sz: sD4 - sC2, y0: lv(146), y1: lv(MGW) - 0.08, rotDeg: rot }), 0.5));
  // the blocks that close the court on both sides and tie the fore-gate to the main gate's towers
  for (const sg of [-1, 1]) mass(rect(Math.min(sg * ctHW, sg * mOut), Math.max(sg * ctHW, sg * mOut), sFS, sMT), CTW);

  // towers: lower part in front of (and, at the main gate, beside) the wall; upper storey projecting half a brick
  const towers = [];
  for (const sg of [-1, 1]) {
    const a = Math.min(sg * tIn, sg * tOut), b = Math.max(sg * tIn, sg * tOut);
    mass(rect(a, b, 0, sD1), FGW);
    towers.push({ name: 'fore', sg, uW: a - PJ, uE: b + PJ, sN: -PJ, sS: sC1, base: FGW, top: FGT, holesFront: 2, holesFlank: 2 });
    const c = Math.min(sg * mIn, sg * mOut), e = Math.max(sg * mIn, sg * mOut);
    mass(ringUS(sg > 0 ? [[mIn, sMT], [mOut, sMT], [mOut, sC2], [mgHW, sC2], [mgHW, sD3], [mIn, sD3]] : [[-mOut, sMT], [-mIn, sMT], [-mIn, sD3], [-mgHW, sD3], [-mgHW, sC2], [-mOut, sC2]]), MGW);
    towers.push({ name: 'main', sg, uW: c - PJ, uE: e + PJ, sN: sMT - PJ, sS: sC2, base: MGW, top: MGT, holesFront: 3, holesFlank: 3 });
  }
  for (const t of towers) {
    const ring = rect(t.uW, t.uE, t.sN, t.sS);
    put('blue', geom.prism(ring, lv(t.base), lv(t.top), { top: false, bottom: true }));
    put('roof', geom.cap(ring, lv(t.top)));
    K.parapet(K.ccw(ring), lv(t.top), { closed: true });
  }

  // roofs: rolled mud behind the parapets
  deck(-tIn + PJ, tIn - PJ, sD1, sC1, FGW);
  for (const sg of [-1, 1]) deck(Math.min(sg * (tOut + PJ), sg * fgHW), Math.max(sg * (tOut + PJ), sg * fgHW), sD1, sC1, FGW);
  deck(-fgHW, fgHW, sC1, sFS, FGW);
  for (const sg of [-1, 1]) deck(Math.min(sg * ctHW, sg * mOut), Math.max(sg * ctHW, sg * mOut), sFS, sMT, CTW);
  deck(-mIn + PJ, mIn - PJ, sD3, sC2, MGW);
  deck(-mgHW, mgHW, sC2, sMS, MGW);

  // parapets (outer edge travelled with the roof on the left)
  K.parapet([at(tIn - PJ, sD1), at(-tIn + PJ, sD1)], lv(FGW));
  K.parapet([at(fgHW, sD1), at(tOut + PJ, sD1)], lv(FGW));
  K.parapet([at(-tOut - PJ, sD1), at(-fgHW, sD1), at(-fgHW, sFS), at(fgHW, sFS), at(fgHW, sD1)], lv(FGW));
  for (const sg of [-1, 1]) {
    // court blocks: outer edge and the edge over the court
    K.parapet(sg < 0 ? [at(-mOut, sFS), at(-mOut, sMT)] : [at(mOut, sMT), at(mOut, sFS)], lv(CTW));
    K.parapet(sg < 0 ? [at(-ctHW, sMT), at(-ctHW, sFS)] : [at(ctHW, sFS), at(ctHW, sMT)], lv(CTW));
  }
  K.parapet([at(mIn - PJ, sD3), at(-mIn + PJ, sD3)], lv(MGW));
  K.parapet([at(-mgHW, sC2), at(-mgHW, sMS), at(mgHW, sMS), at(mgHW, sC2)], lv(MGW));

  // stair-head kiosks on the roofs (the way up from the wing platforms) and drain spouts through the breastwork
  const kiosk = (u, s, w, dd, c, doorSide) => {
    const ring = rect(u - w / 2, u + w / 2, s - dd / 2, s + dd / 2);
    put('brick', geom.prism(ring, lv(c) - 0.05, lv(c) + 2.25, { top: false }));
    put('roof', geom.cap(ring, lv(c) + 2.25));
    put('brick', geom.wall(K.ccw(ring), { closed: true, thickness: 0.3, offset: -0.15, base: lv(c) + 2.2, top: lv(c) + 2.5 }));
    const p = at(u + doorSide[0] * (w / 2 + 0.012), s + doorSide[1] * (dd / 2 + 0.012)), wd = [E[0] * doorSide[0] + S[0] * doorSide[1], E[1] * doorSide[0] + S[1] * doorSide[1]];
    const tt = [wd[1], -wd[0]];
    put('dark', geom.custom({ position: [p[0] - tt[0] * 0.45, lv(c), p[1] - tt[1] * 0.45, p[0] + tt[0] * 0.45, lv(c), p[1] + tt[1] * 0.45, p[0] + tt[0] * 0.45, lv(c) + 1.8, p[1] + tt[1] * 0.45, p[0] - tt[0] * 0.45, lv(c) + 1.8, p[1] - tt[1] * 0.45], index: [0, 1, 2, 0, 2, 3], normal: [wd[0], 0, wd[1], wd[0], 0, wd[1], wd[0], 0, wd[1], wd[0], 0, wd[1]] }));
  };
  kiosk(-12.2, 8.0, 2.4, 2.6, FGW, [1, 0]);
  kiosk(7.4, 36.0, 2.8, 3.2, MGW, [-1, 0]);
  const spout = (u, s, c, du, ds) => { const p = at(u, s), o = [E[0] * du + S[0] * ds, E[1] * du + S[1] * ds]; put('brick', geom.spout({ x: p[0], y: lv(c) + 0.02, z: p[1], azDeg: M.dirToAz(o[0], o[1]), length: 0.7, width: 0.22, height: 0.16 })); };
  for (const s of [5.2, 10.6]) { spout(-fgHW, s, FGW, -1, 0); spout(fgHW, s, FGW, 1, 0); }
  for (const s of [33, 39, 45]) { spout(-mgHW, s, MGW, -1, 0); spout(mgHW, s, MGW, 1, 0); }

  // cedar beams under both chamber roofs ("mighty cedars I laid lengthways for its ceiling")
  for (let u = -chHL + 0.6; u < chHL; u += 1.1) { const c = at(u, (sC1 + sD2) / 2); put('cedar', K.occlude(geom.box({ x: c[0], z: c[1], sx: 0.32, sz: sD2 - sC1, y0: lv(146) - 0.34, y1: lv(146) + 0.02, rotDeg: rot }), 0.45)); }
  for (let s = sC2 + 0.6; s < sD4; s += 1.1) { const c = at(0, s); put('cedar', K.occlude(geom.box({ x: c[0], z: c[1], sx: 2 * mchHW, sz: 0.32, y0: lv(146) - 0.34, y1: lv(146) + 0.02, rotDeg: rot }), 0.45)); }

  // ------------------------------------------------------------------------------------------ skins ----
  // faces by the way they look; A = the viewer's left end, B = his right end
  const faceN = (u0, u1, s) => [at(Math.max(u0, u1), s), at(Math.min(u0, u1), s)];      // looks north: the viewer's right is west
  const faceS = (u0, u1, s) => [at(Math.min(u0, u1), s), at(Math.max(u0, u1), s)];      // looks south: his right is east
  const faceE = (u, s0, s1) => [at(u, Math.max(s0, s1)), at(u, Math.min(s0, s1))];      // looks east: his right is north
  const faceW = (u, s0, s1) => [at(u, Math.min(s0, s1)), at(u, Math.max(s0, s1))];      // looks west: his right is south
  let seed = 100;
  const gs = (AB, courses, o) => {
    const p = count(K.gateSkin(AB[0], AB[1], P0, courses, { seed: seed++, ...o }));
    // faces without animals: single white rosettes on the blue (R2 6.3), unless the face is hidden
    if (o.rows === 0 && o.plain !== true) stats.rosettes = (stats.rosettes || 0) + K.rosettes(AB[0], AB[1], P0, { from: 37, to: courses - (o.above ?? 4) - 3 - 9, seed: seed });
    return p;
  };
  // the checker line runs round each building at one height: 11 courses under the top of the breastwork
  const topOf = (courses, lineTop) => ({ top: 'checker', above: courses - lineTop });
  const FGL = FGW - 4, MGL = MGW - 4;                          // top of the checker line: 4 courses under the walk

  /** One door front: jamb strips with a column of animals, the field over the arch, the archivolt, the top strip. */
  function doorBay(looksNorth, s, half, courses, lineTop, archivolt, perStrip = 1) {
    const face = looksNorth ? faceN : faceS;
    for (const sg of [-1, 1]) {
      const AB = face(sg * dHW, sg * half, s);
      // towards the door: on a north face west is to the viewer's right, on a south face to his left
      const toDoor = (sg < 0) === looksNorth ? 'L' : 'R', jambLeft = (sg < 0) === looksNorth;
      const bands = G.gateBands({ width: half - dHW, height: (IMPOST - 3) * C, rows: perStrip ? 4 : 0, perRow: perStrip || 1, facing: toDoor });
      bands.push({ type: 'checker' });
      count(K.skin(AB[0], AB[1], P0, bands, { corners: jambLeft ? 'left' : 'right', cornerFrom: 13, seed: seed++, height: IMPOST * C }));
    }
    const AB = face(-half, half, s), w = 2 * half, yb = IMPOST * C, yt = (lineTop - 3) * C, ro = archivolt ? dHW + 0.6867 : dHW, ring = [[0, yb], [half - ro, yb], [half - ro, SPRING]];
    for (let i = 1; i < 28; i++) { const a = Math.PI - (Math.PI * i) / 28; ring.push([half + ro * Math.cos(a), SPRING + ro * Math.sin(a)]); }
    ring.push([half + ro, SPRING], [half + ro, yb], [w, yb], [w, yt], [0, yt]);
    K.fieldSkin(AB[0], AB[1], P0, ring, seed++);
    K.skin(AB[0], AB[1], lv(lineTop - 3), [{ type: 'checker' }, { type: 'field', courses: courses - lineTop, ground: 'glazeBlue' }], { seed: seed++ });
    if (archivolt) {
      K.arcBand(AB[0], AB[1], P0, 'checker', half, SPRING, dHW, dHW + 0.2575);
      K.arcBand(AB[0], AB[1], P0, 'rosette', half, SPRING, dHW + 0.2575, dHW + 0.6867);
    }
  }
  /** The two reveals of a doorway through the wall s0..s1; the animals stand on the part towards `outer` (the face people arrive at). */
  function reveals(s0, s1, outer, withAnimals = true) {
    const cut = outer === s0 ? s0 + 1.85 : s1 - 1.85;
    for (const sg of [-1, 1]) {
      // the east reveal (u = +2.25) looks west, the west reveal looks east; the animals stride north
      const face = sg > 0 ? faceW : faceE, north = sg > 0 ? 'L' : 'R';
      for (const [a, b, animals] of [[Math.min(outer, cut), Math.max(outer, cut), withAnimals], [outer === s0 ? cut : s0, outer === s0 ? s1 : cut, false]]) {
        const AB = face(sg * dHW, a, b), bands = G.gateBands({ width: b - a, height: (IMPOST - 3) * C, rows: animals ? 4 : 0, perRow: 1, facing: north });
        bands.push({ type: 'checker' });
        count(K.skin(AB[0], AB[1], P0, bands, { seed: seed++, height: IMPOST * C }));
      }
    }
  }

  // fore-gate, north front
  for (const sg of [-1, 1]) {
    const toDoor = sg < 0 ? 'L' : 'R';
    gs(faceN(sg * tIn, sg * tOut, 0), FGW, { rows: 6, perRow: 2, facing: toDoor, corners: 'both', ...topOf(FGW, FGL) });
    // flanks of the tower's lower part: the inner one looks at the axis, the outer one away from it
    gs(sg > 0 ? faceW(tIn, 0, sD1) : faceE(-tIn, 0, sD1), FGW, { rows: 6, perRow: 1, facing: sg > 0 ? 'L' : 'R', corners: sg > 0 ? 'left' : 'right', ...topOf(FGW, FGL) });
    gs(sg > 0 ? faceE(tOut, 0, sD1) : faceW(-tOut, 0, sD1), FGW, { rows: 6, perRow: 1, facing: sg > 0 ? 'R' : 'L', corners: sg > 0 ? 'right' : 'left', ...topOf(FGW, FGL) });
    // the curtain outside the tower
    gs(faceN(sg * tOut, sg * fgHW, sD1), FGW + BR, { rows: 6, perRow: 1, facing: toDoor, corners: sg < 0 ? 'right' : 'left', ...topOf(FGW + BR, FGL) });
    // the side of the fore-gate (not open to view: plain blue above the pavement level)
    gs(sg > 0 ? faceE(fgHW, sD1, sFS) : faceW(-fgHW, sD1, sFS), FGW + BR, { rows: 0, ...topOf(FGW + BR, FGL) });
    // its back, beside and above the court blocks
    gs(faceS(sg * ctHW, sg * fgHW, sFS), FGW + BR, { rows: 0, socle: false, plain: true, ...topOf(FGW + BR, FGL) });
  }
  doorBay(true, sD1, tIn, FGW + BR, FGL, true);
  reveals(sD1, sC1, sD1);
  // door 2 and the court
  doorBay(false, sFS, ctHW, FGW + BR, FGL, false);
  reveals(sD2, sFS, sFS, false);
  for (const sg of [-1, 1]) {
    gs(sg > 0 ? faceW(ctHW, sFS, sMT) : faceE(-ctHW, sFS, sMT), CTW + BR, { rows: 5, perRow: 1, facing: sg > 0 ? 'L' : 'R', ...topOf(CTW + BR, CTW) });
    // outer faces of the court blocks
    gs(sg > 0 ? faceE(mOut, sFS, sMT) : faceW(-mOut, sFS, sMT), CTW + BR, { rows: 0, plain: true, ...topOf(CTW + BR, CTW) });
    gs(faceN(sg * fgHW, sg * mOut, sFS), CTW + BR, { rows: 0, plain: true, ...topOf(CTW + BR, CTW) });
  }
  // main gate, north front
  for (const sg of [-1, 1]) {
    const toDoor = sg < 0 ? 'L' : 'R';
    gs(faceN(sg * mIn, sg * mOut, sMT), MGW, { rows: 6, perRow: 3, facing: toDoor, corners: 'both', ...topOf(MGW, MGL) });
    gs(sg > 0 ? faceW(mIn, sMT, sD3) : faceE(-mIn, sMT, sD3), MGW, { rows: 6, perRow: 1, facing: sg > 0 ? 'L' : 'R', corners: sg > 0 ? 'left' : 'right', ...topOf(MGW, MGL) });
    gs(sg > 0 ? faceE(mOut, sMT, sC2) : faceW(-mOut, sMT, sC2), MGW, { rows: 0, corners: sg > 0 ? 'right' : 'left', ...topOf(MGW, MGL) });
    gs(faceS(sg * mgHW, sg * mOut, sC2), MGW, { rows: 0, plain: true, ...topOf(MGW, MGL) });
    gs(sg > 0 ? faceE(mgHW, sC2, sMS) : faceW(-mgHW, sC2, sMS), MGW + BR, { rows: 0, corners: sg > 0 ? 'left' : 'right', ...topOf(MGW + BR, MGL) });
    // the south front: three animals a row on each side of the door
    gs(faceS(sg * (dHW + 1.3), sg * mgHW, sMS), MGW + BR, { rows: 6, perRow: 3, facing: sg < 0 ? 'R' : 'L', corners: sg < 0 ? 'left' : 'right', ...topOf(MGW + BR, MGL) });
  }
  doorBay(true, sD3, mIn, MGW + BR, MGL, true);
  reveals(sD3, sC2, sD3);
  doorBay(false, sMS, dHW + 1.3, MGW + BR, MGL, true, 0);
  reveals(sD4, sMS, sMS);

  // upper storeys of the four towers: checker line, plain blue with round loopholes, checker line, breastwork
  function storeyFace(A, B, yBase, courses, holes) {
    const w = K.len(K.sub(B, A)), r = K.unit(K.sub(B, A)), n = [-r[1], r[0]];
    K.skin(A, B, yBase, [{ type: 'checker' }], { seed: seed++ });
    K.skin(A, B, yBase + (courses - 11) * C, [{ type: 'checker' }, { type: 'field', courses: 8, ground: 'glazeBlue' }], { seed: seed++ });
    const y0 = 3 * C, y1 = (courses - 11) * C, yh = y0 + (y1 - y0) * 0.56, rr = 0.3, q = 10;
    const xs = [0, ...holes.map((f) => f * w), w];
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1], ring = [[xa, y0], [xb, y0]];
      if (i + 2 < xs.length) { ring.push([xb, yh - rr]); for (let k = 1; k < q; k++) { const a = -Math.PI / 2 - (Math.PI * k) / q; ring.push([xb + rr * Math.cos(a), yh + rr * Math.sin(a)]); } ring.push([xb, yh + rr]); }
      ring.push([xb, y1], [xa, y1]);
      if (i > 0) { ring.push([xa, yh + rr]); for (let k = 1; k < q; k++) { const a = Math.PI / 2 - (Math.PI * k) / q; ring.push([xa + rr * Math.cos(a), yh + rr * Math.sin(a)]); } ring.push([xa, yh - rr]); }
      K.fieldSkin(A, B, yBase, ring, seed++);
    }
    for (const f of holes) put('dark', K.disc([A[0] + r[0] * f * w + n[0] * 0.012, yBase + yh, A[1] + r[1] * f * w + n[1] * 0.012], n, rr + 0.02));
  }
  for (const t of towers) {
    const h = t.top + BR - t.base, y = lv(t.base);
    const fr = faceN(t.uW, t.uE, t.sN), bk = faceS(t.uW, t.uE, t.sS), ea = faceE(t.uE, t.sN, t.sS), we = faceW(t.uW, t.sN, t.sS);
    storeyFace(fr[0], fr[1], y, h, t.holesFront === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8]);
    storeyFace(ea[0], ea[1], y, h, t.holesFlank === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8]);
    storeyFace(we[0], we[1], y, h, t.holesFlank === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8]);
    storeyFace(bk[0], bk[1], y, h, []);
  }

  // ------------------------------------------------------------------------------------------ doors ----
  // cedar leaves with bronze bands, standing open (12 degrees off the reveal); a lintel at the springing carries a
  // fixed boarded tympanum (R2 5); bronze sills at doors 1 to 3, a limestone threshold at the south exit
  const F = { at, E, S, rot }, doorSet = (sp, dir, sill) => K.doorSet(F, sp, dir, { half: dHW, floor: P0, spring: SPRING, sill });
  doorSet(sD1 + 1.85, 1, 'bronze');
  doorSet(sFS - 0.6, -1, 'bronze');
  doorSet(sD3 + 1.85, 1, 'bronze');
  doorSet(sMS - 1.85, -1, 'stone');

  // ------------------------------------------------------------------------------------------ pedestals, beasts ----
  const B = makeBeasts(THREE, geom), ped = d.pedestals, beasts = [], plinths = [];
  const BEAST = 1.25;                                          // about life size: 1.2 m at the withers, 2.5 m long (their size is unknown)
  for (const it of ped.items) {
    const p = at(it.u, it.s), y0 = P0 - 0.5, top = P0 + ped.height;
    if (/round/.test(it.shape)) { const ring = []; for (let i = 0; i < 20; i++) { const a = (i * 2 * Math.PI) / 20; ring.push([p[0] + 0.7 * Math.cos(a), p[1] + 0.7 * Math.sin(a)]); } put('brick', geom.prism(ring, y0, top)); }
    else put('brick', geom.box({ x: p[0], z: p[1], sx: 1.5, sz: 1.5, y0, y1: top, rotDeg: rot }));
    plinths.push({ n: it.n, x: p[0], z: p[1], top, carries: it.carries });
    if (/bull|dragon/.test(it.carries)) {
      const g = /bull/.test(it.carries) ? B.bull() : B.dragon();
      put('bronze', geom.transform(g, { x: p[0], y: top, z: p[1], rotDeg: rot, scale: BEAST }));
      beasts.push({ n: it.n, kind: /bull/.test(it.carries) ? 'bull' : 'dragon', x: p[0], z: p[1], y: top });
    }
  }
  // two bronze braziers beside the roadway before the gate, torches at the south exit (drawn by nightfx at night)
  const fires = [];
  for (const sg of [-1, 1]) {
    const p = at(sg * 3.5, -7.5), y = P0 - 0.15;
    put('bronze', geom.transform(B.brazier(), { x: p[0], y, z: p[1], rotDeg: 30 * sg }));
    ctx.emitters.add({ kind: 'brazier', pos: [p[0], y + 1.3, p[1]], size: 1.3 });
    fires.push([p[0], y + 1.3, p[1]]);
    const q = at(sg * 3.6, sMS + 0.3);
    put('bronze', geom.box({ x: q[0], z: q[1], sx: 0.08, sz: 0.5, y0: P0 + 2.9, y1: P0 + 2.98, rotDeg: rot }));
    ctx.emitters.add({ kind: 'torch', pos: [q[0], P0 + 3.25, q[1] + 0.3], size: 0.9 });
  }

  // watch fires on the four tower tops (bronze braziers by day, flames at night: nightfx)
  for (const t of towers) {
    const p = at((t.uW + t.uE) / 2 + t.sg * 1.2, t.sN + 1.6), y = lv(t.top);
    put('bronze', geom.transform(B.brazier(), { x: p[0], y, z: p[1], rotDeg: 20 }));
    ctx.emitters.add({ kind: 'brazier', pos: [p[0], y + 1.3, p[1]], size: t.name === 'main' ? 1.4 : 1.2 });
    fires.push([p[0], y + 1.3, p[1]]);
  }

  // ------------------------------------------------------------------------------------------ far stand-in ----
  K.putFar('blue', geom.prism(rect(-fgHW, fgHW, sD1, sFS), P0, lv(FGW + 12)));
  K.putFar('blue', geom.prism(rect(-mgHW, mgHW, sD3, sMS), P0, lv(MGW + 12)));
  for (const t of towers) K.putFar('blue', geom.prism(rect(t.uW, t.uE, t.name === 'fore' ? 0 : sMT, t.sS), P0, lv(t.top + 12)));
  K.putFar('brick', geom.prism(rect(-mOut, mOut, sD1, sMS), BASE, P0));

  const sample = geom.prism(rect(-fgHW, fgHW, sD1, sC1), BASE, lv(FGW));
  return {
    at, E, S, rot, P0, lv, BASE, FGW, FGT, MGW, MGT, CTW, BR, fgHW, mgHW, mOut, tOut, tIn, mIn, ctHW, st,
    stats, beasts, plinths, fires,
    heights: { foreWall: (FGW + BR) * C + 0.9, foreTower: (FGT + BR) * C + 0.9, mainWall: (MGW + BR) * C + 0.9, mainTower: (MGT + BR) * C + 0.9 },
    inspect: geom.inspect(sample),
  };
}
