// js/modules/etemenanki/precinct.js — the precinct (peribolos) of Etemenanki (SPEC 3.11, world.json
// monuments[etemenankiPrecinct], R3 3.2 and 4.2).
//   outline          the five-point polygon of world.json: N 407, E 412, S 462, W 292 + 120 m
//   wall             white-plastered casemate ranges 8.5 m deep (12 m on the north-east), solid 3.6 m wall on the
//                    north-west stretch; pilasters and recesses of equal width at 9.5 m, each with two vertical
//                    grooves; room doors and pilasters on the court side; stepped merlons; corner towers and turrets
//   gates            twelve: plain doors I, II; gate-houses III to XII with twin towers (14.5 m); the main gate V
//                    on the east behind its 88 m forecourt; four south gates behind forecourts 21 x 25 m
//   storehouses      two hollow squares, one ring of rooms round a court (the south one restored as a twin)
//   south range      the south-west corner house and four courtyard mansions between the gate forecourts
//   inner west wall, cross-wall stub, the small houses in the north-east corner, the paved court (left empty)
// Heights are reconstruction (R3: "no evidence"); the white plaster is a model choice (SPEC 8).
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';

export function buildPrecinct(ctx, T, parts) {
  const { geom, W, ground } = ctx;
  const m = W.monument('etemenankiPrecinct'), d = m.dims, poly = T.cw(m.footprint.polygon);      // NW, NE, SE, SW, kink
  const F = d.courtLevel, BASE = F - 1.5;
  const ROOF = F + d.wall.height, PARW = 0.6, TOPW = ROOF + PARW, MER = 0.9;                      // wall-walk +12.5, parapet +13.1, merlons +14.0
  const BAY = d.wall.pilasterBay, DC = d.wall.depth, DE = d.wall.depthEast, DSOLID = 3.6;
  const TOWER = F + d.gateTowersHeight - PARW - MER;                                             // platform of the gate towers: their merlons end 14.5 m above the court
  const white = geom.writer({ verts: 65536 }), roof = geom.writer({ verts: 8192 }), brick = geom.writer({ verts: 4096 }), cedar = geom.writer({ verts: 2048 }), paving = geom.writer({ verts: 8192 }), breccia = geom.writer();
  const merlonGeoms = [], gateGeoms = [], fires = [], lamps = [], gatesBuilt = {}, stats = { merlons: 0, doors: 0, bays: 0 };
  const centroid = (ring) => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
  const MERLON = { pitch: 1.25, width: 0.8, height: MER, thickness: 0.5 };

  const sides = poly.map((a, k) => {
    const b = poly[(k + 1) % poly.length], len = T.dist(a, b), t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-t[1], t[0]], nb = Math.round(len / BAY);
    return { k, a, b, len, t, n, bay: len / nb, O: (s) => [a[0] + t[0] * s, a[1] + t[1] * s], I: (s, dd) => [a[0] + t[0] * s + n[0] * dd, a[1] + t[1] * s + n[1] * dd] };
  });
  const [SN, SE, SS, SW1, SW2] = sides;
  const rect = (S, s0, s1, d0, d1) => [S.I(s0, d0), S.I(s1, d0), S.I(s1, d1), S.I(s0, d1)];
  /** ground level just outside the outline, highest along a stretch of a side */
  const outside = (S, s0, s1) => { let g = -Infinity; for (let s = s0; s <= s1 + 1e-6; s += Math.max(1, (s1 - s0) / 12)) { const p = S.I(s, -2.5); g = Math.max(g, ground.height(p[0], p[1])); } return g; };
  const merlons = (line, y, offset = 0.3) => { const g = geom.merlons(line, { y, offset, ...MERLON }); stats.merlons += Math.floor(M.polylineLength(line) / MERLON.pitch); merlonGeoms.push(g); };

  // ------------------------------------------------------------------------------------------ facades ----
  /**
   * The outer rhythm (R3 3.2): pilaster-towers and recesses of equal width, each with two vertical grooves.
   * g0..g1: the stretch in the coordinate that carries the phase (a side's chainage, or 0..len of a lone face);
   * rev: the face runs from g1 to g0. Returns notches in face coordinates.
   */
  function rhythm(g0, g1, bay, y0, y1, { rev = false, margin = 0.7, depth = 0.38 } = {}) {
    const out = [], loc = (g) => (rev ? g1 - g : g - g0);
    const put = (a, b, n) => { if (a < g0 + margin || b > g1 - margin) return; const s0 = rev ? loc(b) : loc(a), s1 = rev ? loc(a) : loc(b); out.push({ s0, s1, y0, y1, ...n }); };
    for (let k = Math.floor(g0 / bay) - 1; k <= Math.ceil(g1 / bay) + 1; k++) {
      const c = k * bay;
      for (const o of [-0.62, 0.62]) put(c + o - 0.17, c + o + 0.17, { depth: 0.22 });                                      // grooves of the pilaster
      const a = c + bay / 4, b = c + (3 * bay) / 4, mid = (a + b) / 2;
      if (a >= g0 + margin && b <= g1 - margin) {
        const s0 = rev ? loc(b) : loc(a), s1 = rev ? loc(a) : loc(b), ms = (s0 + s1) / 2;
        out.push({ s0, s1, y0, y1, depth, grooves: [{ at: ms - 0.62, width: 0.34, depth: 0.22 }, { at: ms + 0.62, width: 0.34, depth: 0.22 }] });
        stats.bays++;
      } else if (mid > g0 && mid < g1) { /* a recess cut by the end of the block: left plain */ }
    }
    return out;
  }
  /** Court side of a casemate range: one door and one slit per room, a pilaster between rooms (R3: "pilaster between each pair of room doors"). */
  function rooms(wallW, a, b, g0, g1, bay, { rev = false, floor = F, top = ROOF, doorW = 1.15, doorH = 2.25, slit = true, pil = true, pitch = bay } = {}) {
    const f = T.frame(a, b, -1), notches = [], loc = (g) => (rev ? g1 - g : g - g0);
    for (let k = Math.floor(g0 / pitch) - 1; k <= Math.ceil(g1 / pitch) + 1; k++) {
      const c = (k + 0.5) * pitch, e = k * pitch;
      if (c > g0 + 1.6 && c < g1 - 1.6) {
        const s = loc(c);
        notches.push({ s0: s - doorW / 2, s1: s + doorW / 2, depth: 0.45, y0: floor, y1: floor + doorH });
        if (slit) notches.push({ s0: s - 0.14, s1: s + 0.14, depth: 0.35, y0: floor + 3.7, y1: floor + 4.5 });
        T.quadF(cedar, f.P(s - doorW / 2, 0.41, floor), f.P(s + doorW / 2, 0.41, floor), f.P(s + doorW / 2, 0.41, floor + doorH), f.P(s - doorW / 2, 0.41, floor + doorH), f.nx, 0, f.nz);
        stats.doors++;
      }
      if (pil && e > g0 + 1.2 && e < g1 - 1.2) { const s = loc(e); T.boxInto(wallW, [f.p2(s - 0.65, 0), f.p2(s + 0.65, 0), f.p2(s + 0.65, -0.28), f.p2(s - 0.65, -0.28)], floor - 0.4, top - 0.5); }
    }
    return notches;
  }
  /** A pair of closed cedar leaves in a deep reveal on a face (storehouse and house doors): returns the notch. */
  function bigDoor(f, s, { w = 2.6, h = 3.6, depth = 0.9, floor = F } = {}) {
    T.quadF(cedar, f.P(s - w / 2, depth - 0.05, floor), f.P(s + w / 2, depth - 0.05, floor), f.P(s + w / 2, depth - 0.05, floor + h), f.P(s - w / 2, depth - 0.05, floor + h), f.nx, 0, f.nz);
    stats.doors++;
    return { s0: s - w / 2, s1: s + w / 2, depth, y0: floor, y1: floor + h, steps: 2, stepWidth: 0.25 };
  }
  const yRec = (S, s0, s1, kisu) => Math.max(F + 1.9, outside(S, s0, s1) + (kisu ? 2.3 : 1.1));
  const YTOP = ROOF - 1.2;                                                                       // recesses end 1.8 m under the parapet top

  // ------------------------------------------------------------------------------------------ wall pieces ----
  /** a casemate range on a side between two chainages: rhythm outside, rooms inside, merlons on the outer edge */
  function casemate(S, s0, s1, depth, { kisu = false, innerDoors = true } = {}) {
    const ring = rect(S, s0, s1, 0, depth), y0 = yRec(S, s0, s1, kisu);
    const inner = innerDoors ? rooms(white, ring[2], ring[3], s0, s1, S.bay, { rev: true }) : [];
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: ROOF, parapet: PARW, notches: [rhythm(s0, s1, S.bay, y0, YTOP), null, inner, null] });
    merlons([ring[0], ring[1]], TOPW);
    // the roof: a low ridge of rolled earth over each cross wall, a spout to the court from every second room
    for (let k = Math.ceil((s0 + 2) / S.bay); k * S.bay < s1 - 2; k++) {
      const s = k * S.bay;
      T.boxInto(roof, rect(S, s - 0.3, s + 0.3, 0.5, depth - 0.5), ROOF, ROOF + 0.13);
      if (k % 2 === 0) { const p = S.I(s + S.bay / 2, depth); if (s + S.bay / 2 < s1 - 1) geom.kit.spoutInto(white, p[0], ROOF + 0.05, p[1], M.dirToAz(S.n[0], S.n[1]), 0.65, 0.22, 0.15, 0.08); }
    }
  }
  /** a solid stretch of wall: rhythm outside, buttresses inside */
  function solid(S, s0, s1) {
    const ring = rect(S, s0, s1, 0, DSOLID), f = T.frame(ring[2], ring[3], -1);
    for (let k = Math.ceil((s0 + 1.5) / S.bay); k * S.bay < s1 - 1.5; k++) { const s = s1 - k * S.bay; T.boxInto(white, [f.p2(s - 0.8, 0), f.p2(s + 0.8, 0), f.p2(s + 0.8, -0.45), f.p2(s - 0.8, -0.45)], F - 0.4, ROOF - 0.6); }
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: ROOF, parapet: PARW, notches: [rhythm(s0, s1, S.bay, yRec(S, s0, s1, false), YTOP), null, null, null] });
    merlons([ring[0], ring[1]], TOPW);
  }
  /** a turret astride the wall: 0.6 m proud outside, 1.8 m higher; hides the joints between ranges */
  function turret(S, s, depth, { w = 9, up = 1.8 } = {}) {
    const ring = rect(S, s - w / 2, s + w / 2, -0.6, depth + 0.5), top = ROOF + up, y0 = yRec(S, s - w / 2, s + w / 2, false) + 0.4;
    const gr = (len) => [{ s0: len / 2 - 0.85, s1: len / 2 - 0.5, depth: 0.25, y0, y1: top - 0.9 }, { s0: len / 2 + 0.5, s1: len / 2 + 0.85, depth: 0.25, y0, y1: top - 0.9 }];
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: top, parapet: PARW, notches: [gr(w), null, gr(w), null] });
    merlons(M.closeRing(geom.insetRing(ring, 0.3)), top + PARW, 0);
    const c = centroid(ring); fires.push({ p: [c[0], top, c[1]], gate: 'tower' });
  }
  /** a corner tower on a vertex of the outline: covers `la` m of the side that arrives and `lb` m of the side that leaves */
  function cornerTower(Sa, Sb, la, lb, da, db, up = 2.4) {
    const C = Sb.a, e = 0.6;
    const p1 = [C[0] - Sa.t[0] * la - Sa.n[0] * e, C[1] - Sa.t[1] * la - Sa.n[1] * e];
    const p2 = T.lineX(p1, Sa.t, [C[0] + Sb.t[0] * lb - Sb.n[0] * e, C[1] + Sb.t[1] * lb - Sb.n[1] * e], Sb.t);
    const p3 = [C[0] + Sb.t[0] * lb - Sb.n[0] * e, C[1] + Sb.t[1] * lb - Sb.n[1] * e];
    const q3 = [p3[0] + Sb.n[0] * (da + e + 0.5), p3[1] + Sb.n[1] * (da + e + 0.5)], q1 = [p1[0] + Sa.n[0] * (db + e + 0.5), p1[1] + Sa.n[1] * (db + e + 0.5)];
    const p4 = T.lineX(q3, Sb.t, q1, Sa.t);
    const ring = [p1, p2, p3, q3, p4, q1], top = ROOF + up, y0 = Math.max(F + 2.3, ground.height(p2[0] - (Sa.n[0] + Sb.n[0]) * 2, p2[1] - (Sa.n[1] + Sb.n[1]) * 2) + 1.6);
    const gr = (len) => (len < 4 ? null : [{ s0: len / 2 - 0.85, s1: len / 2 - 0.5, depth: 0.25, y0, y1: top - 0.9 }, { s0: len / 2 + 0.5, s1: len / 2 + 0.85, depth: 0.25, y0, y1: top - 0.9 }]);
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: top, parapet: PARW, notches: ring.map((p, i) => gr(T.dist(p, ring[(i + 1) % ring.length]))) });
    merlons(M.closeRing(geom.insetRing(ring, 0.3)), top + PARW, 0);
    const c = centroid([p1, p2, p3, p4]); fires.push({ p: [c[0], top, c[1]], gate: 'tower' });
  }
  /** the baked-brick skirt (kisu) before a street face */
  function kisu(S, s0, s1) {
    if (s1 - s0 < 1) return;
    const line = M.resamplePolyline([S.O(s0), S.O(s1)], 8), topAt = (x, z) => ground.height(x - S.n[0] * 3, z - S.n[1] * 3) + 1.7;
    brick.append(wallArrays(geom.wall(line, { thickness: 0.7, offset: -0.35, base: (x, z) => ground.height(x - S.n[0] * 3, z - S.n[1] * 3) - 1.2, top: topAt, batter: 0.03 })));
  }
  const wallArrays = (g) => ({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col: null, uv: null, ao: null, idx: g.index.array, nv: g.attributes.position.count, ni: g.index.count });

  // ------------------------------------------------------------------------------------------ gates ----
  /** roof slabs of rolled earth on a gate block and its towers (the kit leaves them as bare platforms) */
  function gateRoofs(gw, x, z, facingDeg, width, depth, top, tw, zt) {
    const f = M.azToDir(facingDeg), r = M.rightOf(f[0], f[1]), P = (lx, lz) => [x + r[0] * lx + f[0] * lz, z + r[1] * lx + f[1] * lz];
    const hw = width / 2 - tw - 0.1, back = -depth / 2 + 0.65, mid = Math.max(back, zt - 0.35);       // lz: + toward the front
    T.boxInto(roof, [P(-hw, mid), P(hw, mid), P(hw, depth / 2 - 0.65), P(-hw, depth / 2 - 0.65)], top, top + 0.1);
    if (mid > back + 0.5) T.boxInto(roof, [P(-width / 2 + 0.55, back), P(width / 2 - 0.55, back), P(width / 2 - 0.55, mid), P(-width / 2 + 0.55, mid)], top, top + 0.1);
    for (const ml of gw.merlonLines.slice(2)) T.boxInto(roof, geom.insetRing(ml.line, 0.3), ml.y - PARW, ml.y - PARW + 0.1);
  }
  /**
   * A gate-house: twin towers before a gate block with a vaulted passage. cx, cz: centre of the block; out: unit
   * vector the front looks along; opts: width, depth, tw (tower width), door, floor (roadway), both (a second
   * towered front on the back: two blocks back to back), top, towerTop, projection, braziers.
   */
  function gateHouse(id, cx, cz, out, { width = 17, depth = DC, tw = 5.5, door = { width: 3.2, height: 5.6, arch: true }, floor = F, both = false, top = ROOF + 1.1, towerTop = TOWER, projection = 1.5, towerDepth = null, fireFront = true, fireBack = false, floorBack = F, grooves = { count: 2, width: 0.35, depth: 0.25, gap: 1.0 } } = {}) {
    const az = M.dirToAz(out[0], out[1]), base = BASE;
    const mk = (x, z, facing, dep, fl) => {
      const td = towerDepth ?? Math.min(dep + projection, 6.2);
      const gw = geom.gateway({ x, z, facingDeg: facing, width, depth: dep, base, floor: fl, top, towerWidth: tw, towerDepth: td, towerProjection: projection, towerTop, door, rebates: 2, parapet: PARW, parapetThickness: 0.45, grooves });
      gateGeoms.push(gw.geometry);
      gateRoofs(gw, x, z, facing, width, dep, top, tw, dep / 2 + projection - td);
      gw.merlonLines.forEach((ml, i) => { if (i === 1 && both) return; if (i < 2) merlons(ml.line, ml.y, 0); else merlons(ml.line, ml.y, 0); });
      return gw;
    };
    const r = M.rightOf(out[0], out[1]);
    if (both) {
      mk(cx + out[0] * depth / 4, cz + out[1] * depth / 4, az, depth / 2, floor);
      mk(cx - out[0] * depth / 4, cz - out[1] * depth / 4, az + 180, depth / 2, floorBack);
    } else mk(cx, cz, az, depth, floor);
    // the cedar leaves, standing open against the walls of the passage behind the reveals
    {
      const dw = door.width, lh = door.height - (door.arch === false ? 0 : dw / 2) + 0.3, ll = dw / 2 - 0.08, z0 = depth / 2 - 1.05;
      const P = (la, lz) => [cx + r[0] * la + out[0] * lz, cz + r[1] * la + out[1] * lz];
      for (const sd of [-1, 1]) { const la = sd * (dw / 2 - 0.075); T.boxInto(cedar, [P(la - 0.045, z0), P(la + 0.045, z0), P(la + 0.045, z0 - ll), P(la - 0.045, z0 - ll)], floor, floor + lh); }
    }
    // braziers beside the doorway (drawn and lit by nightfx; SPEC 3.19: "the precinct gates")
    const lat = door.width / 2 + 1.25;
    if (fireFront) for (const s of [-1, 1]) { const x = cx + out[0] * (depth / 2 + 0.75) + r[0] * s * lat, z = cz + out[1] * (depth / 2 + 0.75) + r[1] * s * lat; fires.push({ p: [x, Math.max(floor, ground.height(x, z)), z], gate: id }); }
    if (fireBack) for (const s of [-1, 1]) { const x = cx - out[0] * (depth / 2 + 0.75) + r[0] * s * lat, z = cz - out[1] * (depth / 2 + 0.75) + r[1] * s * lat; fires.push({ p: [x, floorBack, z], gate: id }); }
    gatesBuilt[id] = { x: cx, z: cz, facingDeg: az, width, depth, door: door.width, floor };
  }
  /** steps from a gate whose roadway lies above the court down into the court: foot `run` m inside the back of the gate */
  function stepsDown(cx, cz, out, depth, floor, width) {
    const rise = floor - F; if (rise < 0.12) return;
    const n = Math.ceil(rise / 0.17), riser = rise / n, tread = 0.34, run = n * tread;
    const x = cx - out[0] * (depth / 2 + run), z = cz - out[1] * (depth / 2 + run);
    brick.append(wallArrays(geom.stairs({ x, z, azDeg: M.dirToAz(out[0], out[1]), width, steps: n, riser, tread, base: F, sink: 0.5, parapet: { height: 0.55, thickness: 0.45 } })));
  }

  // ====================================================================================== the perimeter ====
  const CT = 10;                                                                                  // corner towers take 10 m of each side
  // ---- north side: solid wall with the plain doors I and II, then the casemate with gate III ----
  const sSolidN = 133, gIII = d.gates.III, sIII = (gIII.x - SN.a[0]) * SN.t[0] + (gIII.z - SN.a[1]) * SN.t[1];
  {
    let s = CT - 1;
    for (const id of ['I', 'II']) {
      const g = d.gates[id], sg = (g.x - SN.a[0]) * SN.t[0] + (g.z - SN.a[1]) * SN.t[1], w = 5.2, c = SN.I(sg, DSOLID / 2), fl = outside(SN, sg - 1, sg + 1);
      solid(SN, s, sg - w / 2);
      const top = TOPW + 0.9;
      gateGeoms.push(geom.passageBlock({ x: c[0], z: c[1], rotDeg: M.dirToAz(-SN.n[0], -SN.n[1]), width: w, depth: DSOLID + 0.5, base: BASE, floor: fl, top, door: { width: 2.1, height: 3.3, arch: true }, rebates: 2, rebateDepth: 0.3, rebateStep: 0.28 }));
      T.boxInto(roof, rect(SN, sg - w / 2 + 0.55, sg + w / 2 - 0.55, 0.3, DSOLID - 0.3), top, top + 0.1);
      merlons(rect(SN, sg - w / 2 + 0.25, sg + w / 2 - 0.25, 0, DSOLID).slice(0, 2), top, 0.05);
      stepsDown(c[0], c[1], [-SN.n[0], -SN.n[1]], DSOLID + 0.5, fl, 3.4);
      gatesBuilt[id] = { x: c[0], z: c[1], facingDeg: M.dirToAz(-SN.n[0], -SN.n[1]), width: w, depth: DSOLID, door: 2.1, floor: fl, plain: true };
      s = sg + w / 2;
    }
    solid(SN, s, sSolidN - 4.5);
    turret(SN, sSolidN, DC);
    casemate(SN, sSolidN + 4.5, sIII - 8.5, DC);
    const c = SN.I(sIII, DC / 2), fl = outside(SN, sIII - 2, sIII + 2) + 0.02;
    gateHouse('III', c[0], c[1], [-SN.n[0], -SN.n[1]], { floor: fl });
    stepsDown(c[0], c[1], [-SN.n[0], -SN.n[1]], DC, fl, 5.2);
    casemate(SN, sIII + 8.5, SN.len - CT - 3, DC);
  }
  cornerTower(SN, SE, CT + 3, CT, DE, DC);
  // ---- east side: casemate 12 m deep with the small gate IV, the two storehouses with the forecourt of the main gate, casemate to the corner ----
  const storeN = M.openRing(d.northStorehouse.polygon), storeS = M.openRing(d.southStorehouse.polygon);
  const sE = (p) => (p[0] - SE.a[0]) * SE.t[0] + (p[1] - SE.a[1]) * SE.t[1];
  const sN0 = sE(storeN[1]), sN1 = sE(storeN[2]), sS0 = sE(storeS[1]), sS1 = sE(storeS[2]);
  {
    const sIV = sE([d.gates.IV.x, d.gates.IV.z]) + 0.6, wIV = 13;
    casemate(SE, CT, sIV - wIV / 2, DE, { kisu: true });
    const c = SE.I(sIV, DE / 2), fl = outside(SE, sIV - 2, sIV + 2) + 0.02;
    gateHouse('IV', c[0], c[1], [-SE.n[0], -SE.n[1]], { width: wIV, depth: DE, tw: 4.2, door: { width: 2.4, height: 4.4, arch: true }, floor: fl, towerTop: TOWER - 1.5, top: ROOF + 0.9 });
    stepsDown(c[0], c[1], [-SE.n[0], -SE.n[1]], DE, fl, 4.2);
    kisu(SE, CT, sIV - wIV / 2); kisu(SE, sIV + wIV / 2, sN1 - 0.3); kisu(SE, sS0 + 0.3, SE.len - CT);
    casemate(SE, sS1, SE.len - CT, DC, { kisu: true });
  }
  cornerTower(SE, SS, CT, CT, DC, DC);
  // ---- south side: the range of houses with the four gate forecourts ----
  const FORE = { w: 21, d: 25, gate: 10 }, DM = FORE.d + FORE.gate;                              // houses and gate-houses are 35 m deep: one straight court front
  const sS = (p) => (p[0] - SS.a[0]) * SS.t[0] + (p[1] - SS.a[1]) * SS.t[1];
  const fore = ['VI', 'VII', 'VIII', 'IX'].map((id) => ({ id, s: sS(d.southForecourtMouths[id]) }));
  const sWestHouse = SS.len - CT;
  /** a courtyard mansion between two chainages of the south side: the casemate range on the street, rooms round one or two courts behind it */
  function mansion(s0, s1, { depth = DM, up = 8.5, courts = 1, seed = 1, west = null } = {}) {
    // street range (the precinct wall itself)
    const A = rect(SS, s0, s1, 0, DC), yA = yRec(SS, s0, s1, true);
    T.blockInto(white, roof, A, { ground: F, courtGround: F, base: BASE, roof: ROOF, parapet: PARW, notches: [rhythm(s0, s1, SS.bay, yA, YTOP), null, null, null] });
    merlons([A[0], A[1]], TOPW);
    kisu(SS, s0, s1);
    // the house behind: one block with its courts
    const hB = F + up, top = hB + 0.5, ring = west ? [SS.I(s0, DC), west[0], west[1], SS.I(s0, depth)] : rect(SS, s0, s1, DC, depth);
    const L = T.dist(ring[0], ring[1]), wing = 6.6, cross = 5.6, cw = (L - 2 * wing - (courts - 1) * cross) / courts, cRings = [], cNotches = [];
    const ex = [(ring[1][0] - ring[0][0]) / L, (ring[1][1] - ring[0][1]) / L], dd = depth - DC, cd0 = 6.2, cd1 = dd - 6.6;
    const Pm = (u, v) => [ring[0][0] + ex[0] * u + SS.n[0] * v, ring[0][1] + ex[1] * u + SS.n[1] * v];
    for (let c = 0; c < courts; c++) {
      const u0 = wing + c * (cw + cross), cr = [Pm(u0, cd0), Pm(u0 + cw, cd0), Pm(u0 + cw, cd1), Pm(u0, cd1)];
      cRings.push(cr);
      { const a = Pm(u0 + 1.1, cd0 + 1.1), b = Pm(u0 + cw - 1.1, cd1 - 1.1); lamps.push({ p: [a[0], F + 0.75, a[1]] }); if (cw > 30) lamps.push({ p: [b[0], F + 0.75, b[1]] }); }
      // doors of the rooms round the court, a pair of slits per side
      cNotches.push(cr.map((p, i) => {
        const q = cr[(i + 1) % 4], f = T.frame(p, q, 1), len = f.len, n = Math.max(1, Math.round(len / 5.2)), list = [];
        for (let j = 0; j < n; j++) {
          const s = ((j + 0.5) * len) / n, w = hash2(j, i + 7 * c, seed) < 0.25 ? 1.5 : 1.05, h = w > 1.2 ? 2.6 : 2.15;
          list.push({ s0: s - w / 2, s1: s + w / 2, depth: 0.4, y0: F, y1: F + h });
          T.quadF(cedar, f.P(s - w / 2, 0.36, F), f.P(s + w / 2, 0.36, F), f.P(s + w / 2, 0.36, F + h), f.P(s - w / 2, 0.36, F + h), f.nx, 0, f.nz);
          stats.doors++;
        }
        return list;
      }));
    }
    // outer faces: the door to the precinct court in the north face, a plain rhythm of shallow recesses on the flanks
    const fN = T.frame(ring[2], ring[3], -1), lenN = fN.len, north = [bigDoor(fN, lenN * (courts > 1 ? 0.5 : 0.36), { w: 1.9, h: 3.0, depth: 0.6 })];
    for (let k = 1; k * 7.4 < lenN - 3; k++) { const s = k * 7.4; if (Math.abs(s - north[0].s0) > 3 && Math.abs(s - north[0].s1) > 3) T.boxInto(white, [fN.p2(s - 0.6, 0), fN.p2(s + 0.6, 0), fN.p2(s + 0.6, -0.25), fN.p2(s - 0.6, -0.25)], F - 0.4, hB - 0.4); }
    const flank = (a, b) => rhythm(0, T.dist(a, b), T.dist(a, b) / Math.max(1, Math.round(T.dist(a, b) / 8.6)), F + 1.9, hB - 1.0, { depth: 0.3 });
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: hB, parapet: 0.5, pt: 0.4, notches: [null, flank(ring[1], ring[2]), north, flank(ring[3], ring[0])], courts: cRings, courtNotches: cNotches, courtBase: F - 0.6 });
    // roof furniture: ridges of rolled earth over the room walls of the long ranges, the heads of the roof stairs (one per court), spouts into the courts
    for (let u = 3.2; u < L - 3; u += 5.2) {
      T.boxInto(roof, [Pm(u - 0.28, 0.55), Pm(u + 0.28, 0.55), Pm(u + 0.28, cd0 - 0.65), Pm(u - 0.28, cd0 - 0.65)], hB, hB + 0.12);
      T.boxInto(roof, [Pm(u - 0.28, cd1 + 0.65), Pm(u + 0.28, cd1 + 0.65), Pm(u + 0.28, dd - 0.55), Pm(u - 0.28, dd - 0.55)], hB, hB + 0.12);
    }
    for (let k = Math.ceil((s0 + 2) / SS.bay); k * SS.bay < s1 - 2; k++) T.boxInto(roof, rect(SS, k * SS.bay - 0.3, k * SS.bay + 0.3, 0.5, DC - 0.5), ROOF, ROOF + 0.13);
    cRings.forEach((cr, c) => {
      const u0 = wing + c * (cw + cross), side = hash2(c, 3, seed) < 0.5 ? -1 : 1, u = side < 0 ? u0 - 3.4 : u0 + cw + 0.9, v = cd0 + 1.2;
      T.blockInto(white, roof, [Pm(u, v), Pm(u + 2.5, v), Pm(u + 2.5, v + 3.6), Pm(u, v + 3.6)], { base: hB - 0.1, roof: hB + 2.1, parapet: 0.25, pt: 0.3, notches: [null, null, [{ s0: 0.7, s1: 1.8, depth: 0.5, y0: hB + 0.02, y1: hB + 1.85 }], null] });
      for (let i = 0; i < 4; i++) { const p = cr[i], q = cr[(i + 1) % 4], f = T.frame(p, q, 1), t = 0.3 + 0.4 * hash2(i, c, seed + 9), x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t; geom.kit.spoutInto(white, x, hB + 0.06, z, M.dirToAz(f.nx, f.nz), 0.6, 0.2, 0.14, 0.07); }
    });
    for (const [a, b] of [[ring[1], ring[2]], [ring[3], ring[0]]]) if (!west || a !== ring[1]) merlons([a, b], top);
    return { ring, hB };
  }
  {
    // SE court wall, then the mansions and forecourts from east to west
    const m4 = 100;
    casemate(SS, CT, m4 - 4.5, DC, { kisu: true }); kisu(SS, CT, m4 - 4.5);
    turret(SS, m4, DC);
    let s = m4 + 4.5;
    const ups = [8.6, 8.0, 9.0, 8.3], cs = [2, 1, 2, 1];
    fore.forEach((fc, i) => {
      const a = fc.s - FORE.w / 2, b = fc.s + FORE.w / 2;
      mansion(s, a, { up: ups[i], courts: cs[i], seed: 11 + i });
      // the gate-house at the back of the forecourt: towered fronts to the street and to the court (R3 3.2)
      const c = SS.I(fc.s, FORE.d + FORE.gate / 2);
      gateHouse(fc.id, c[0], c[1], [-SS.n[0], -SS.n[1]], { width: FORE.w, depth: FORE.gate, tw: 5.6, both: true, fireBack: true, door: { width: 3.4, height: 5.8, arch: true } });
      s = b;
    });
    // the south-west corner house: its west side is the casemate of the west wall
    const wa = T.lineX(SS.I(0, DC), SS.t, SW1.I(0, DC), SW1.t), wb = T.lineX(SS.I(0, DM), SS.t, SW1.I(0, DC), SW1.t);
    mansion(s, sWestHouse, { up: 8.8, courts: 1, seed: 17, west: [wa, wb] });
  }
  cornerTower(SS, SW1, CT, CT, DC, DC);
  // ---- west side: casemate with the gate-houses X, XI, XII; the solid wall round the kink to the north-west corner ----
  {
    const sW = (g) => (g.x - SW1.a[0]) * SW1.t[0] + (g.z - SW1.a[1]) * SW1.t[1];
    let s = CT;
    for (const id of ['X', 'XI', 'XII']) {
      const sg = id === 'XII' ? Math.min(sW(d.gates[id]), SW1.len - 9.5) : sW(d.gates[id]), c = SW1.I(sg, DC / 2), fl = Math.max(F, outside(SW1, sg - 2, sg + 2)) + 0.02;
      casemate(SW1, s, sg - 8.5, DC);
      gateHouse(id, c[0], c[1], [-SW1.n[0], -SW1.n[1]], { floor: fl });
      stepsDown(c[0], c[1], [-SW1.n[0], -SW1.n[1]], DC, fl, 5.2);
      s = sg + 8.5;
    }
    // the solid wall: one mitred block round the kink
    const G = SW1.O(s), K = SW2.a, E = SW2.O(SW2.len - CT + 1), Ei = SW2.I(SW2.len - CT + 1, DSOLID), Gi = SW1.I(s, DSOLID), Ki = T.lineX(Gi, SW1.t, Ei, SW2.t);
    const ring = [G, K, E, Ei, Ki, Gi], l1 = T.dist(K, E);
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: ROOF, parapet: PARW, notches: [null, rhythm(0, l1, l1 / Math.round(l1 / BAY), yRec(SW2, 0, SW2.len - CT, false), YTOP), null, null, null, null] });
    merlons([G, K, E], TOPW);
    const fi = T.frame(Ei, Ki, -1);
    for (let k = 1; k * BAY < fi.len - 1; k++) T.boxInto(white, [fi.p2(k * BAY - 0.8, 0), fi.p2(k * BAY + 0.8, 0), fi.p2(k * BAY + 0.8, -0.45), fi.p2(k * BAY - 0.8, -0.45)], F - 0.4, ROOF - 0.6);
  }
  cornerTower(SW2, SN, CT - 1, CT - 1, DSOLID, DSOLID);

  // ====================================================================================== inside the wall ====
  // ---- the storehouses: a ring of rooms round a court; rhythm outside, a door and a slit per room inside ----
  function storehouse(id, ringIn, courtIn, sA, sB, doorEdge) {
    const ring = [ringIn[0], SE.O(sA), SE.O(sB), ringIn[3]], hS = F + d[id].height, top = hS + 0.6, y0 = Math.max(F + 1.9, outside(SE, sA, sB) + 2.3);
    const court = courtIn, lens = ring.map((p, i) => T.dist(p, ring[(i + 1) % 4]));
    const face = (i) => rhythm(0, lens[i], lens[i] / Math.round(lens[i] / BAY), i === 1 ? y0 : F + 1.9, hS - 1.2);
    const notches = [face(0), rhythm(sA, sB, SE.bay, y0, hS - 1.2), face(2), face(3)];
    // the one door, to the precinct court (R3 4.2: "a single door to a big inner court"), with a deep stepped reveal
    const fW = T.frame(ring[doorEdge], ring[(doorEdge + 1) % 4], -1), sd = fW.len / 2, dn = bigDoor(fW, sd, { w: 3.2, h: 4.6, depth: 1.1 });
    notches[doorEdge] = notches[doorEdge].filter((n) => n.s1 < dn.s0 - 0.9 || n.s0 > dn.s1 + 0.9).concat([dn]);
    const cN = court.map((p, i) => { const q = court[(i + 1) % 4], l = T.dist(p, q), pitch = l / Math.round(l / 4.5); return roomsCourt(p, q, l, pitch); });
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: hS, parapet: 0.6, notches, courts: [court], courtNotches: [cN], courtBase: F - 0.6 });
    merlons(M.closeRing(ring), top);
    // the roof: a ridge over the wall between each two rooms (they lie across the ring), spouts to the court, two stair heads
    court.forEach((p, i) => {
      const q = court[(i + 1) % 4], f = T.frame(p, q, 1), l = f.len, pitch = l / Math.round(l / 4.5), a = ring[i], b = ring[(i + 1) % 4];
      for (let k = 0; k * pitch < l + 0.1; k++) {
        const c0 = f.p2(k * pitch, 0.75), far = T.lineX(c0, [-f.nx, -f.nz], a, [b[0] - a[0], b[1] - a[1]]), len = T.dist(c0, far) - 0.75, c1 = f.p2(k * pitch, 0.75 + len);
        T.boxInto(roof, [f.p2(k * pitch - 0.3, 0.75), f.p2(k * pitch + 0.3, 0.75), [c1[0] + f.dx * 0.3, c1[1] + f.dz * 0.3], [c1[0] - f.dx * 0.3, c1[1] - f.dz * 0.3]], hS, hS + 0.13);
        if (k % 3 === 1) { const sp = f.p2((k + 0.5) * pitch, 0); if ((k + 0.5) * pitch < l - 1) geom.kit.spoutInto(white, sp[0], hS + 0.05, sp[1], M.dirToAz(f.nx, f.nz), 0.65, 0.22, 0.15, 0.08); }
      }
    });
    for (const i of [1, 3]) { const p = court[i], q = court[(i + 1) % 4], f = T.frame(p, q, 1), a = f.p2(f.len * 0.5, -1.2); lamps.push({ p: [a[0], F + 0.75, a[1]] }); }
    for (const i of [0, 2]) {
      const p = court[i], q = court[(i + 1) % 4], f = T.frame(p, q, 1), u = f.len * 0.2;
      T.blockInto(white, roof, T.cw([f.p2(u, 3), f.p2(u + 3.8, 3), f.p2(u + 3.8, 5.8), f.p2(u, 5.8)]), { base: hS - 0.1, roof: hS + 2.2, parapet: 0.25, pt: 0.3, notches: [[{ s0: 1.2, s1: 2.4, depth: 0.5, y0: hS + 0.02, y1: hS + 1.9 }], null, null, null] });
    }
    return { ring, court, hS };
  }
  /** court face of a storehouse: a door and a ventilation slit per room */
  function roomsCourt(p, q, len, pitch) {
    const f = T.frame(p, q, 1), list = [];
    for (let k = 0; (k + 0.5) * pitch < len; k++) {
      const s = (k + 0.5) * pitch;
      list.push({ s0: s - 0.6, s1: s + 0.6, depth: 0.45, y0: F, y1: F + 2.4 }, { s0: s - 0.14, s1: s + 0.14, depth: 0.35, y0: F + 3.9, y1: F + 4.7 });
      T.quadF(cedar, f.P(s - 0.6, 0.41, F), f.P(s + 0.6, 0.41, F), f.P(s + 0.6, 0.41, F + 2.4), f.P(s - 0.6, 0.41, F + 2.4), f.nx, 0, f.nz);
      stats.doors++;
    }
    return list;
  }
  const courtN = M.openRing(d.northStorehouse.court);
  const stN = storehouse('northStorehouse', storeN, courtN, sN0, sN1, 3);
  // the south storehouse is restored as a twin: its court mirrors the north one's margins
  const mN = [T.dist(storeN[0], courtN[0]) / Math.SQRT2, 0];
  const insetQuad = (r, k) => geom.insetRing(r, k);
  const stSring = [storeS[0], SE.O(sS0), SE.O(sS1), storeS[3]];
  const stS = storehouse('southStorehouse', storeS, insetQuad(stSring, Math.max(17, Math.min(21, mN[0]))), sS0, sS1, 3);

  // ---- the main gate V at the back of its forecourt, between the storehouses ----
  {
    const fv = d.gateVForecourt, g = d.gates.V, front = fv.depth - 2;                             // front of the gate block 86 m from the Processional Way
    const sMid = (sN1 + sS0) / 2, gd = 12, c = SE.I(sMid, front + gd / 2);
    // width: from storehouse to storehouse at the gate (their faces are not quite parallel): let it bite 0.3 m into both
    const zN = T.lineX(c, SE.t, stN.ring[3], [stN.ring[2][0] - stN.ring[3][0], stN.ring[2][1] - stN.ring[3][1]]), zS = T.lineX(c, SE.t, stS.ring[0], [stS.ring[1][0] - stS.ring[0][0], stS.ring[1][1] - stS.ring[0][1]]);
    const width = T.dist(zN, zS) + 0.6, mid = [(zN[0] + zS[0]) / 2, (zN[1] + zS[1]) / 2];
    gateHouse('V', mid[0], mid[1], [-SE.n[0], -SE.n[1]], { width, depth: gd, tw: 8.2, both: true, fireBack: true, projection: 2.2, towerDepth: 7.4, door: { width: 4.6, height: 7.6, arch: true }, top: ROOF + 1.6, towerTop: TOWER + 0.0, grooves: { count: 3, width: 0.4, depth: 0.3, gap: 1.25 } });
    gatesBuilt.V.distanceFromCourtAxis = Math.abs(M.worldToLocal([0, 0], W.monument('etemenanki').footprint.rotationDeg, mid[0], mid[1])[1]);
    gatesBuilt.V.given = [g.x, g.z];
    // the forecourt: a ramp down from the Processional Way (+3.0) to the court level, and the band of red breccia (R3 3.3)
    const yOut = outside(SE, sMid - 2, sMid + 2) + 0.03, a = sN1 + 0.4, b = sS0 - 0.4, r0 = 1.6, r1 = 8.0, APR = -2.6;      // the apron runs 2.6 m out under the edge of the street paving
    const lv = (dd) => (dd <= r0 ? yOut : dd >= r1 ? F + 0.0 : yOut + ((F - yOut) * (dd - r0)) / (r1 - r0));
    const strip = (d0, d1) => T.quadF(paving, [...SE.I(a, d0).slice(0, 1), lv(d0), SE.I(a, d0)[1]], [SE.I(b, d0)[0], lv(d0), SE.I(b, d0)[1]], [SE.I(b, d1)[0], lv(d1), SE.I(b, d1)[1]], [SE.I(a, d1)[0], lv(d1), SE.I(a, d1)[1]], 0, 1, 0);
    strip(APR, r0); strip(r0, r1);
    T.quadF(paving, [SE.I(a, APR)[0], yOut - 0.8, SE.I(a, APR)[1]], [SE.I(b, APR)[0], yOut - 0.8, SE.I(b, APR)[1]], [SE.I(b, APR)[0], yOut, SE.I(b, APR)[1]], [SE.I(a, APR)[0], yOut, SE.I(a, APR)[1]], -SE.n[0], 0, -SE.n[1]);
    const hw = fv.paving ? 2.1 : 2.1, bs = (d0, d1) => T.quadF(breccia, [SE.I(sMid - hw, d0)[0], lv(d0) + 0.03, SE.I(sMid - hw, d0)[1]], [SE.I(sMid + hw, d0)[0], lv(d0) + 0.03, SE.I(sMid + hw, d0)[1]], [SE.I(sMid + hw, d1)[0], lv(d1) + 0.03, SE.I(sMid + hw, d1)[1]], [SE.I(sMid - hw, d1)[0], lv(d1) + 0.03, SE.I(sMid - hw, d1)[1]], 0, 1, 0);
    bs(APR, r0); bs(r0, r1); bs(r1, front + 0.5);
  }

  // ---- the partition between the main court and the south-east court (R3 5: corner at (241, 150)) ----
  {
    // from inside the south-west corner of the south storehouse to inside the north-east corner of the easternmost mansion
    const c0 = stS.ring[3], a = [c0[0] + 1.6, c0[1] - 1.0], b = SS.I(100 + 4.5 + 1.6, DM - 1.0), th = 2.8, h = F + 7.5;
    const dir = [(b[0] - a[0]) / T.dist(a, b), (b[1] - a[1]) / T.dist(a, b)], nrm = [-dir[1], dir[0]], len = T.dist(a, b);
    const P = (s, o) => [a[0] + dir[0] * s + nrm[0] * o, a[1] + dir[1] * s + nrm[1] * o];
    const ring = T.cw([P(0, -th / 2), P(len, -th / 2), P(len, th / 2), P(0, th / 2)]);
    const f0 = T.frame(ring[0], ring[1], -1), f2 = T.frame(ring[2], ring[3], -1), sd = f0.len / 2;
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: h, parapet: 0.5, notches: [[bigDoor(f0, sd, { w: 2.2, h: 3.2, depth: 0.5 })], null, [bigDoor(f2, f2.len - sd, { w: 2.2, h: 3.2, depth: 0.5 })], null] });
  }

  // ---- the inner west wall: a second casemate wall beside the tower, and the cross-wall stub at the kink ----
  {
    const [a, b] = d.innerWestWall, len = T.dist(a, b), dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], nrm = [-dir[1], dir[0]];        // a north, b south: the right of travel is west
    const P = (s, o) => [a[0] + dir[0] * s + nrm[0] * o, a[1] + dir[1] * s + nrm[1] * o];
    // clockwise: east face first (north to south is not clockwise for the east face), so go south -> north on the west... build explicitly
    const end = T.lineX(P(0, -DC / 2), dir, SS.I(0, DM), SS.t), L = T.dist(P(0, -DC / 2), end);
    const ring = T.cw([P(4, -DC / 2), P(L, -DC / 2), P(L, DC / 2), P(4, DC / 2)]);
    const iE = ring.findIndex((p, i) => { const q = ring[(i + 1) % 4], mx = (p[0] + q[0]) / 2 - a[0], mz = (p[1] + q[1]) / 2 - a[1]; return mx * nrm[0] + mz * nrm[1] < -DC / 4 && Math.abs((q[0] - p[0]) * dir[0] + (q[1] - p[1]) * dir[1]) > 10; });
    const iW = (iE + 2) % 4, lenF = T.dist(ring[iE], ring[(iE + 1) % 4]), notches = [null, null, null, null];
    notches[iE] = rhythm(0, lenF, lenF / Math.round(lenF / BAY), F + 1.9, YTOP);
    notches[iW] = rooms(white, ring[iW], ring[(iW + 1) % 4], 0, lenF, lenF / Math.round(lenF / BAY));
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: ROOF, parapet: PARW, notches });
    merlons([ring[iE], ring[(iE + 1) % 4]], TOPW);
    // its free north end: a turret
    const tr = T.cw([P(-5, -DC / 2 - 0.6), P(4, -DC / 2 - 0.6), P(4, DC / 2 + 0.6), P(-5, DC / 2 + 0.6)]), tt = ROOF + 1.8;
    T.blockInto(white, roof, tr, { ground: F, courtGround: F, base: BASE, roof: tt, parapet: PARW, notches: tr.map((p, i) => { const l = T.dist(p, tr[(i + 1) % 4]); return [{ s0: l / 2 - 0.85, s1: l / 2 - 0.5, depth: 0.25, y0: F + 2.3, y1: tt - 0.9 }, { s0: l / 2 + 0.5, s1: l / 2 + 0.85, depth: 0.25, y0: F + 2.3, y1: tt - 0.9 }]; }) });
    merlons(M.closeRing(geom.insetRing(tr, 0.3)), tt + PARW, 0);
    { const c = centroid(tr); fires.push({ p: [c[0], tt, c[1]], gate: 'tower' }); }
    // the cross-wall stub running east from the kink (R3 3.2: 50 m, "may once have closed off a north court")
    const [ca, cb] = d.crossWallStub, cl = T.dist(ca, cb), cd = [(cb[0] - ca[0]) / cl, (cb[1] - ca[1]) / cl], cn = [-cd[1], cd[0]], th = 3.0, hc = F + 8;
    const Q = (s, o) => [ca[0] + cd[0] * s + cn[0] * o, ca[1] + cd[1] * s + cn[1] * o];
    const cr = T.cw([Q(DSOLID - 0.5, -th / 2), Q(cl, -th / 2), Q(cl, th / 2), Q(DSOLID - 0.5, th / 2)]);
    T.blockInto(white, roof, cr, { ground: F, courtGround: F, base: BASE, roof: hc, parapet: 0.5, notches: cr.map((p, i) => { const l = T.dist(p, cr[(i + 1) % 4]); return l > 10 ? rhythm(0, l, l / Math.round(l / BAY), F + 1.9, hc - 1.0, { depth: 0.3 }) : null; }) });
  }

  // ---- the small houses inside the north-east corner (R3 3.2: a cluster c. 15 x 37 m) ----
  {
    const h = d.smallHousesNE, rotE = M.dirToAz(SE.t[0], SE.t[1]) - 180, ring = T.cw(M.openRing(M.rectRing(h.x, h.z, h.size[0], h.size[1], rotE)));
    const c0 = M.openRing(M.rectRing(...M.localToWorld([h.x, h.z], rotE, 0, -8.5), 5.2, 9, rotE)), c1 = M.openRing(M.rectRing(...M.localToWorld([h.x, h.z], rotE, 0.6, 9), 6, 8, rotE));
    const hh = F + 5.6, cts = [T.cw(c0), T.cw(c1)];
    const cN = cts.map((cr, c) => cr.map((p, i) => { const q = cr[(i + 1) % 4], f = T.frame(p, q, 1), s = f.len / 2, list = [{ s0: s - 0.5, s1: s + 0.5, depth: 0.35, y0: F, y1: F + 2.05 }]; T.quadF(cedar, f.P(s - 0.5, 0.31, F), f.P(s + 0.5, 0.31, F), f.P(s + 0.5, 0.31, F + 2.05), f.P(s - 0.5, 0.31, F + 2.05), f.nx, 0, f.nz); stats.doors++; return list; }));
    for (const cr of cts) { const c = centroid(cr); lamps.push({ p: [c[0] + 1.2, F + 0.75, c[1] + 1.5] }); }
    const fd = T.frame(ring[3], ring[0], -1), fd2 = T.frame(ring[1], ring[2], -1);
    T.blockInto(white, roof, ring, { ground: F, courtGround: F, base: BASE, roof: hh, parapet: 0.45, pt: 0.35, notches: [null, [bigDoor(fd2, fd2.len * 0.3, { w: 1.2, h: 2.2, depth: 0.4 })], null, [bigDoor(fd, fd.len * 0.3, { w: 1.2, h: 2.2, depth: 0.4 })]], courts: cts, courtNotches: cN, courtBase: F - 0.6 });
  }

  // ====================================================================================== the court ====
  // baked-brick paving over the whole precinct: laid in fields of 12 m (each a slightly different batch of brick),
  // trodden pale on the ways from the gates to the stairs and round the tower, darker where nobody walks
  {
    const zig = W.monument('etemenanki'), rotT = zig.footprint.rotationDeg, clip = geom.insetRing(poly, 0.25), PAN = 12;
    const cs = M.bbox(clip.map((p) => M.worldToLocal([0, 0], rotT, p[0], p[1])));
    const foot = M.localToWorld([0, 0], rotT, 0, zig.dims.stairs.central.zTo + 3), hb = zig.dims.baseSide / 2;
    const ways = [];
    const gv = gatesBuilt.V; ways.push([[gv.x - 8, gv.z], foot], [[gv.x - 8, gv.z], M.localToWorld([0, 0], rotT, hb + 6, 0)]);
    for (const id of ['VI', 'VII', 'VIII', 'IX']) { const g = gatesBuilt[id]; ways.push([[g.x + SS.n[0] * 7, g.z + SS.n[1] * 7], foot]); }
    for (const id of ['III', 'X', 'XI']) { const g = gatesBuilt[id]; ways.push([[g.x, g.z], M.localToWorld([0, 0], rotT, id === 'III' ? hb + 6 : -hb - 6, id === 'III' ? -hb - 6 : 0)]); }
    const vnoise = (x, z, c, seed) => { const fx = x / c, fz = z / c, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return (hash2(ix, iz, seed) * (1 - su) + hash2(ix + 1, iz, seed) * su) * (1 - sv) + (hash2(ix, iz + 1, seed) * (1 - su) + hash2(ix + 1, iz + 1, seed) * su) * sv; };
    const wear = (x, z) => {
      let w = 0;
      for (const [a, b] of ways) { const dd = M.distToSegment(x, z, a[0], a[1], b[0], b[1])[0]; w = Math.max(w, Math.exp(-(dd * dd) / 60)); }
      const l = M.worldToLocal([0, 0], rotT, x, z), dt = Math.max(Math.abs(l[0]) - hb, Math.abs(l[1]) - hb);      // round the foot of the tower
      if (dt > 0) w = Math.max(w, 0.8 * Math.exp(-((dt - 4) * (dt - 4)) / 40));
      return w;
    };
    const tint = (x, z, batch) => { const k = batch * (0.82 + 0.18 * wear(x, z)) * (0.93 + 0.04 * vnoise(x, z, 23, 11) + 0.03 * vnoise(x, z, 71, 12)); return [Math.min(1, k), Math.min(1, k * 0.99), Math.min(1, k * 0.975)]; };
    paving.useColor();
    const EDGE = 0.34;                                           // a border course of one brick round every field of 24 m, laid dark (in bitumen)
    for (let i = Math.floor(cs[0] / PAN); i * PAN < cs[2]; i++) for (let j = Math.floor(cs[1] / PAN); j * PAN < cs[3]; j++) {
      const big = hash2(i >> 1, j >> 1, 9) < 0.6, batch = 0.88 + 0.12 * (big ? hash2(i >> 1, j >> 1, 71) : hash2(i, j, 72));      // laid fields of 12 or 24 m
      const cuts = (k) => (k & 1 ? [0, PAN / 3, (2 * PAN) / 3, PAN - EDGE, PAN] : [0, EDGE, PAN / 3, (2 * PAN) / 3, PAN]);
      const us = cuts(i), vs = cuts(j);
      for (let a = 0; a < us.length - 1; a++) for (let b = 0; b < vs.length - 1; b++) {
        const border = (i & 1 ? a === us.length - 2 : a === 0) || (j & 1 ? b === vs.length - 2 : b === 0), bt = border ? batch * 0.84 : batch;
        const q = [[us[a], vs[b]], [us[a + 1], vs[b]], [us[a + 1], vs[b + 1]], [us[a], vs[b + 1]]].map(([u, v]) => M.localToWorld([0, 0], rotT, i * PAN + u, j * PAN + v));
        const inside = q.every((p) => M.pointInPolygon(p[0], p[1], clip));
        if (inside) {
          const k = paving.quadP([q[0][0], F, q[0][1]], [q[3][0], F, q[3][1]], [q[2][0], F, q[2][1]], [q[1][0], F, q[1][1]]), order = [0, 3, 2, 1];
          if (k >= 0) order.forEach((v, n) => { const c = tint(q[v][0], q[v][1], bt); paving.col[(k + n) * 3] = c[0]; paving.col[(k + n) * 3 + 1] = c[1]; paving.col[(k + n) * 3 + 2] = c[2]; });
        } else {
          const c = T.clipConvex(q, clip);
          if (c.length < 3) continue;
          const mx = (q[0][0] + q[2][0]) / 2, mz = (q[0][1] + q[2][1]) / 2, tc = tint(mx, mz, bt), flat = [];
          for (const p of c) flat.push(p[0], p[1]);
          paving.color(tc[0], tc[1], tc[2]); paving.polygon(flat, null, F, true);
        }
      }
    }
    paving.color(1, 1, 1);
  }

  parts.white.push(white, ...merlonGeoms, ...gateGeoms);
  parts.roof.push(roof);
  parts.brick.push(brick);
  parts.cedar.push(cedar);
  parts.paving.push(paving);
  parts.breccia.push(breccia);

  // ------------------------------------------------------------------------------------------ checks ----
  const L = sides.map((s) => s.len), want = d.sides;
  const area = Math.abs(M.polygonArea(poly)), zigArea = W.monument('etemenanki').dims.baseSide ** 2;
  const checks = [
    { name: 'precinct sides N / E / S / W south + W north (m)', value: [L[0], L[1], L[2], L[3], L[4]].map((v) => v.toFixed(1)).join(' / '), expect: `${want.N} / ${want.E} / ${want.S} / ${want.W_south} + ${want.W_north}`, pass: Math.abs(L[0] - want.N) < 3 && Math.abs(L[1] - want.E) < 3 && Math.abs(L[2] - want.S) < 3 && Math.abs(L[3] - want.W_south) < 3 && Math.abs(L[4] - want.W_north) < 3 },
    { name: 'precinct area (ha)', value: +(area / 1e4).toFixed(2), expect: d.areaHa, pass: Math.abs(area / 1e4 - d.areaHa) < 0.3 },
    { name: 'tower share of the precinct (%)', value: +((100 * zigArea) / area).toFixed(1), expect: 'about 5', pass: zigArea / area > 0.04 && zigArea / area < 0.06 },
    { name: 'gates built', value: Object.keys(gatesBuilt).length, expect: 12, pass: Object.keys(gatesBuilt).length === 12 },
    { name: 'gate centres from the listed points, largest (m)', value: +Math.max(...Object.keys(d.gates).map((id) => Math.hypot(gatesBuilt[id].x - d.gates[id].x, gatesBuilt[id].z - d.gates[id].z))).toFixed(1), expect: 'under 8 (gate-houses are centred in walls 8.5 to 12 m deep)', pass: Object.keys(d.gates).every((id) => gatesBuilt[id] && Math.hypot(gatesBuilt[id].x - d.gates[id].x, gatesBuilt[id].z - d.gates[id].z) < 8) },
    { name: 'main gate V off the east-west axis of the tower (m)', value: +gatesBuilt.V.distanceFromCourtAxis.toFixed(1), expect: 'under 6', pass: gatesBuilt.V.distanceFromCourtAxis < 6 },
    { name: 'gate towers above the court (m)', value: +(TOWER + PARW + MER - F).toFixed(2), expect: d.gateTowersHeight, pass: Math.abs(TOWER + PARW + MER - F - d.gateTowersHeight) < 0.01 },
    { name: 'merlon height (m)', value: MER, expect: 'under 1', pass: MER < 1 },
  ];
  for (const [name, w] of [['walls', white], ['roofs', roof], ['doors', cedar], ['paving', paving]]) { const r = T.flipped(w); checks.push({ name: `precinct ${name}: flipped normals (of ${r.tris} triangles)`, value: r.flipped, expect: 0, pass: r.flipped === 0 }); }
  const api = { level: F, polygon: M.closeRing(poly), gates: gatesBuilt, wallTop: TOPW, storehouses: [stN.ring, stS.ring].map((r) => M.closeRing(r)) };
  return { fires, lamps, checks, stats, api };
}
