// js/modules/streets/paving.js — the paved streets (SPEC 3.7, R2 7.2, R3):
//   A  gate to the canal crossing: 10.5 m roadway, five rows of white limestone slabs 1.05 m between two bands of
//      four rows of red breccia 0.66 m, bitumen joints; a brick apron where the street widens at the palace gate
//   B  canal crossing to the turn at the precinct corner: 6.4 m, 4.2 m of breccia slabs 0.59 m on the WEST,
//      2.2 m of asphalted brick on the east
//   C  the west-east street to the bridge: 6.4 m of asphalted brick
//   the Marduk Gate ("Ziggurat") street: a 4.2 m breccia lane for its first 200 m; the branch toward precinct gate V
// Slabs are mapped in uv space (u across the strip from its left edge, v along the street, in metres), so the
// rows follow the street round every bend and five slabs fill the limestone band exactly.
import * as M from '../../core/mathx.js';
import { vnoise } from './surface.js';

class UVBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  vert(x, y, z, u, v, nx, ny, nz, c = 1) { this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c, c, c); return this.n++; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometry(geom) { return this.n ? geom.custom({ position: this.pos, normal: this.nor, uv: this.uv, color: this.col, index: this.idx }) : null; }
}

export function buildPaving(ctx, net, surf) {
  const { geom, ground, materials, world } = ctx;
  const stats = { strips: 0, tris: 0, metres: {} }, checks = [];
  const pw = net.pw;
  const mats = {
    limestone: materials.variant('limestone', { name: 'streets-limestone', space: 'uv', uvFace: 'top', uvMetres: 1 }),
    breccia: materials.variant('breccia', { name: 'streets-breccia', space: 'uv', uvFace: 'top', uvMetres: 1 }),
    // asphalted brick under the dust of a street in use: a third of the way to the street earth
    asphalt: materials.variant('asphaltedBrickRoad', { name: 'streets-asphalt', space: 'uv', uvFace: 'top', uvMetres: 1, color: materials.color('asphaltedBrickRoad').lerp(materials.color('streetEarth'), 0.3) }),
    brick: materials.get('bakedBrickBuff'),                                             // world-mapped brick, tinted to paving (as the altar patches)
  };
  const paveTint = (() => { const a = materials.color('courtBrickPaving'), b = materials.color('bakedBrickBuff'); return [Math.min(1, a.r / b.r), Math.min(1, a.g / b.g), Math.min(1, a.b / b.b)]; })();
  const bufs = { limestone: new UVBuf(), breccia: new UVBuf(), asphalt: new UVBuf(), brick: new UVBuf() };
  // slabs above the earth strip beside them (the earth UNDER them is 3.5 cm lower: net.js `under`): limestone 4 cm,
  // breccia 3, brick 2 (the lion street north of the gate is laid the same way: 8.5 / 7.5 / 5 cm above the ground)
  const RAISE = 0.03, RAISES = { limestone: 0.04, breccia: 0.03, asphalt: 0.022, brick: 0.02 };

  /**
   * One paved strip along a record between chainages a and b, between the lateral offsets l0 < l1 (+ = right of travel).
   * opts: { uScale: uv metres per metre (slabs of another size from the same material), kerb: [left, right] booleans
   *         (a vertical edge face down into the ground), capA / capB: end faces, raise }
   */
  function strip(mat, rec, a, b, l0, l1, opts = {}) {
    const B = bufs[mat], k = opts.uScale || 1, raise = opts.raise ?? RAISES[mat] ?? RAISE, kerb = opts.kerb || [false, false];
    const sts = surf.stationsOf(rec, a, b), n0 = B.n;
    const rows = [];
    for (const st of sts) {
      const xa = st.x + st.rx * l0, za = st.z + st.rz * l0, xb = st.x + st.rx * l1, zb = st.z + st.rz * l1;
      const ya = net.baseY(xa, za) + net.liftAt(xa, za) + raise, yb = net.baseY(xb, zb) + net.liftAt(xb, zb) + raise;
      // wear and dust: a soft tone along the street, a little darker toward the edges of the roadway
      const c = 0.9 + 0.1 * vnoise(st.x / 7, st.z / 7, 88);
      const v = (st.s - a) * k;
      rows.push([B.vert(xa, ya, za, 0, v, 0, 1, 0, c), B.vert(xb, yb, zb, (l1 - l0) * k, v, 0, 1, 0, c), xa, ya, za, xb, yb, zb, v, st]);
    }
    for (let i = 0; i + 1 < rows.length; i++) B.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
    // edge faces: the thickness of the slabs showing above the ground beside them
    const D = 0.45;
    for (const side of [0, 1]) {
      if (!kerb[side]) continue;
      for (let i = 0; i + 1 < rows.length; i++) {
        const r0 = rows[i], r1 = rows[i + 1], o = side ? 5 : 2, st = r0[9], sg = side ? 1 : -1, nx = st.rx * sg, nz = st.rz * sg;
        const a0 = B.vert(r0[o], r0[o + 1], r0[o + 2], 0, r0[8], nx, 0, nz, 0.8), a1 = B.vert(r1[o], r1[o + 1], r1[o + 2], 0, r1[8], nx, 0, nz, 0.8);
        const b0 = B.vert(r0[o], r0[o + 1] - D, r0[o + 2], D * k, r0[8], nx, 0, nz, 0.6), b1 = B.vert(r1[o], r1[o + 1] - D, r1[o + 2], D * k, r1[8], nx, 0, nz, 0.6);
        if (side) B.quad(a0, b0, b1, a1); else B.quad(a0, a1, b1, b0);
      }
    }
    for (const end of [0, 1]) {
      if (!(end ? opts.capB : opts.capA)) continue;
      const r = rows[end ? rows.length - 1 : 0], st = r[9], sg = end ? 1 : -1, nx = st.dx * sg, nz = st.dz * sg, w = (l1 - l0) * k;
      const a0 = B.vert(r[2], r[3], r[4], 0, r[8], nx, 0, nz, 0.8), a1 = B.vert(r[5], r[6], r[7], w, r[8], nx, 0, nz, 0.8);
      const b0 = B.vert(r[2], r[3] - D, r[4], 0, r[8] + D * k, nx, 0, nz, 0.6), b1 = B.vert(r[5], r[6] - D, r[7], w, r[8] + D * k, nx, 0, nz, 0.6);
      if (end) B.quad(a0, a1, b1, b0); else B.quad(a0, b0, b1, a1);
    }
    stats.strips++; stats.metres[mat] = (stats.metres[mat] || 0) + (b - a);
    return B.n - n0;
  }

  if (pw) {
    const A0 = pw.s0 - 0.35, AB = pw.ch[16] + 8 < pw.turn ? pw.ch[16] + 8 : pw.s0 + 200, T = pw.turn, END = pw.s1;
    // A: limestone between breccia (R2 7.2: 5 x 1.05 = 5.25 m and 4 x 0.66 = 2.64 m each side)
    const LS = 5 * 1.05 / 2, BR = LS + 4 * 0.66;
    strip('limestone', pw, A0, AB, -LS, LS, { capB: true });
    strip('breccia', pw, A0, AB, -BR, -LS, { kerb: [true, false], capB: true });
    strip('breccia', pw, A0, AB, LS, BR, { kerb: [false, true], capB: true });
    // the street widens at the palace gate: a brick apron from the roadway to the palace front
    const gateS = pw.ch[13], apron = 17;
    const edgeAt = (s) => { const p = net.at(pw, s); let l = BR; while (l < 30) { const z = ground.zone(p.x + p.rx * (l + 0.5), p.z + p.rz * (l + 0.5)); if (z.zone === 'monument') break; l += 0.5; } return l; };
    const eL = Math.min(edgeAt(gateS - apron), edgeAt(gateS), edgeAt(gateS + apron));
    if (eL > BR + 1.5) strip('brick', pw, gateS - apron, gateS + apron, BR, eL + 0.4, { capA: true, capB: true });
    stats.palaceApron = +(eL - BR).toFixed(1);
    // B: breccia band on the west (+ lateral), asphalted brick on the east; 0.59 m slabs from the 0.66 m material
    const kB = 0.66 / 0.6;
    strip('breccia', pw, AB, T - 3.2, -1.0, 3.2, { uScale: kB, kerb: [false, true], capA: true });
    strip('asphalt', pw, AB, T - 3.2, -3.2, -1.0, { kerb: [true, false], capA: true });
    // C: the west-east street, asphalted brick, round the corner with a mitre
    strip('asphalt', pw, T - 3.2, END, -3.2, 3.2, { kerb: [true, true] });
    checks.push({ name: 'Processional Way paved from the gate to the bridge (m)', value: Math.round(END - A0), expect: 'about 1,404 (946 gate front to the turn + 509 to the bridge, less the 50 m gate)', pass: Math.abs(END - A0 - 1404) < 25 });
    checks.push({ name: 'roadway widths (m): limestone + breccia / breccia + asphalted brick', value: `${(2 * BR).toFixed(2)} / 6.40`, expect: '10.5 / 6.4', pass: Math.abs(2 * BR - 10.5) < 0.1 });

    // the branch of the breccia band toward the main east gate (V) of the precinct: up to the precinct outline
    const gv = M.nearestOnPolyline(345, 5.3, pw.pl).s;
    const reach = (() => { const p = net.at(pw, gv); let l = 3.2; while (l < 12) { const z = ground.zone(p.x + p.rx * (l + 0.3), p.z + p.rz * (l + 0.3)); if (z.zone === 'monument' || z.platform) break; l += 0.25; } return l; })();
    if (reach > 3.5) strip('breccia', pw, gv - 2.1, gv + 2.1, 3.2, reach + 0.3, { uScale: kB, capA: true, capB: true });
    stats.gateVBranch = +(reach - 3.2).toFixed(1);
  }

  // the Marduk Gate street: "a 4.2 m breccia lane" for its first 200 m (world.json streets[mardukGateStreet].pavedLane)
  const mg = net.recs.find((r) => r.id === 'mardukGateStreet'), mgW = world.streets.find((s) => s.id === 'mardukGateStreet');
  if (mg && mg.pieces.length) {
    const half = ((mgW && mgW.pavedLane) || 4.2) / 2, a = 3.25, b = Math.min(200, mg.len);
    strip('breccia', mg, a, b, -half, half, { uScale: 0.66 / 0.6, kerb: [true, true], capB: true });
    stats.mardukLane = Math.round(b - a);
  }

  for (const id of Object.keys(bufs)) {
    const g = bufs[id].geometry(geom); if (!g) continue;
    stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    geom.addStatic(mats[id], id === 'brick' ? geom.paint(g, paveTint) : g, { castShadow: false, tile: 1024 });
  }
  return { stats, checks, mats };
}
