// glazed/filmscene.js — debug scene "glazedfilm" of the "glazed" subsystem. OWNER: relief artist. DEBUG ONLY.
// Switched on by the URL flag with=glazedfilm (render.mjs --with glazedfilm); never part of the film.
//
// It dresses the Ishtar Gate and the lion street AT THEIR TRUE PLACES in world.json with the glazed panels, through
// the real tile batcher and both levels of detail (glazed.addPanel), so that the film's own cameras (shots 1, 2, 3)
// show what the reliefs will look like before the `ishtar` module exists. The masonry behind the skins is plain
// boxes: fore-gate with its two towers and round-arched door, the taller main gate behind it, the two bastions, the
// two street walls with blue merlons, a pavement between them. It takes the claims 'monument:ishtarGate' and
// 'lionStreet', so the massing leaves these two out.
//
// Everything here is the public API of docs/glazed.md, used as the `ishtar` author will use it: the frame of the
// gate (axis, stations, half widths) comes from world.json monuments[ishtarGate].dims, the lions stride north on
// both walls, the frieze steps down with the 3 % slope division by division.
import { COURSE } from './module.js';

export function buildFilmScene(ctx, G) {
  const { geom, W, mathx: M } = ctx;
  const prevOwner = geom.owner; geom.owner = 'glazedfilm';
  ctx.claims.add('monument:ishtarGate'); ctx.claims.add('lionStreet');

  const d = W.monument('ishtarGate').dims, ax = d.axis, y0 = d.pavementLevel;
  const S = [(ax.south[0] - ax.north[0]) / ax.length, (ax.south[1] - ax.north[1]) / ax.length];   // unit vector along the axis, to the south
  const E = [S[1], -S[0]];                                                                          // unit vector to the east
  const at = (u, s) => [ax.north[0] + E[0] * u + S[0] * s, ax.north[1] + E[1] * u + S[1] * s];      // u east of the axis, s south of the tower fronts
  const v3 = (p, y) => [p[0], y, p[1]];
  const rot = M.dirToAz(-S[0], -S[1]);
  // viewer's right on a face that looks north / east / west
  const RN = [-E[0], 0, -E[1]], RE = [-S[0], 0, -S[1]], RW = [S[0], 0, S[1]];
  const SK = 0.03;                                         // the skin stands 3 cm before the masonry
  const brick = [], blue = [];
  const box = (list, u0, u1, s0, s1, ya, yb) => { const c = at((u0 + u1) / 2, (s0 + s1) / 2); list.push(geom.box({ x: c[0], z: c[1], sx: Math.abs(u1 - u0), sz: Math.abs(s1 - s0), y0: y0 + ya, y1: y0 + yb, rotDeg: rot })); };
  const add = (p) => G.addPanel(p, { switchAt: 150 });
  let animals = 0, lions = 0;
  const count = (p) => { animals += p.items.length; return p; };

  // one gate front: towers (uIn..uOut, front at sT, flanks back to sW), curtain at sW out to uBody, door 4.5 m
  function gateFront({ sT, sW, depth, uIn, uOut, uBody, wall, tower, towerDepth, seed, reveal }) {
    const door = d.doors, hw = door.width / 2;
    for (const side of [-1, 1]) {
      const uA = side * uIn, uB = side * uOut, uE = Math.max(uA, uB), uWst = Math.min(uA, uB);
      const toDoor = side < 0 ? 'L' : 'R';          // on a north face west is to the viewer's right: the west tower's animals walk left, to the door
      // tower: front, two flanks
      add(count(G.gatePanel({ origin: v3(at(uE, sT - SK), y0), right: RN, width: uOut - uIn, height: tower, facing: toDoor, corners: 'both', seed: seed + side })));
      add(count(G.gatePanel({ origin: v3(at(uE + SK, sW), y0), right: RE, width: sW - sT, height: tower, perRow: 1, facing: 'R', seed: seed + 10 + side })));
      add(count(G.gatePanel({ origin: v3(at(uWst - SK, sT), y0), right: RW, width: sW - sT, height: tower, perRow: 1, facing: 'L', seed: seed + 20 + side })));
      box(blue, uWst, uE, sT, sT + towerDepth, -1.5, tower);
      // curtain outside the tower, and the strip between the tower and the door (corner edging on the jamb)
      if (uBody > uOut + 0.5) add(count(G.gatePanel({ origin: v3(at(side < 0 ? -uOut : uBody, sW - SK), y0), right: RN, width: uBody - uOut, height: wall, perRow: 1, facing: toDoor, seed: seed + 30 + side })));
      add(count(G.gatePanel({ origin: v3(at(side < 0 ? -hw : uIn, sW - SK), y0), right: RN, width: uIn - hw, height: wall, perRow: 1, facing: toDoor, corners: side < 0 ? 'left' : 'right', seed: seed + 40 + side })));
      box(blue, side * hw, side * uBody, sW, sW + depth, -1.5, wall);
    }
    // over the door: plain bricks round the semicircular arch, in bond; the lintel block behind
    const ring = [[0, door.jamb], [0, wall], [door.width, wall], [door.width, door.jamb]];
    for (let i = 0; i <= 24; i++) { const a = (Math.PI * i) / 24; ring.push([hw + hw * Math.cos(a), door.jamb + hw * Math.sin(a)]); }
    geom.addStatic(G.material, G.fieldShape({ origin: v3(at(hw, sW - SK), y0), right: RN, ring, seed: seed + 50 }), { castShadow: false });
    box(blue, -hw, hw, sW, sW + depth, door.crown, wall);
    // door reveals: four rows, one column, striding north
    add(count(G.gatePanel({ origin: v3(at(hw - SK, sW), y0), right: RW, width: reveal, height: door.jamb, rows: 4, perRow: 1, facing: 'L', seed: seed + 60 })));
    add(count(G.gatePanel({ origin: v3(at(-hw + SK, sW + reveal), y0), right: RE, width: reveal, height: door.jamb, rows: 4, perRow: 1, facing: 'R', seed: seed + 61 })));
  }
  const fg = d.foreGate, mg = d.mainGate, st = d.stations_s;
  const WALK = 1.2;                                        // the parapet walk lies this far below the merlon tops
  gateFront({ sT: 0, sW: st.door1, depth: st.foreGateSouthFace - st.door1, uIn: fg.towers.innerFacesApart / 2, uOut: fg.towers.innerFacesApart / 2 + fg.towers.width, uBody: fg.width / 2, wall: fg.wallTop - WALK, tower: fg.towerTop - WALK, towerDepth: 7, seed: 100, reveal: fg.frontWall });
  gateFront({ sT: st.mainGateTowerFronts, sW: st.door3, depth: st.mainGateSouthFace - st.door3, uIn: mg.towers.innerFacesApart / 2, uOut: mg.towers.innerFacesApart / 2 + mg.towers.width, uBody: mg.towers.innerFacesApart / 2 + mg.towers.width, wall: mg.wallTop - WALK, tower: mg.towerTop - WALK, towerDepth: 10, seed: 300, reveal: mg.walls });
  // bastions and the North Gate, as plain blocks
  for (const key of ['west', 'east']) {
    const bb = d.bastions[key], bx = (bb[0][0] + bb[1][0]) / 2 + (key === 'west' ? -8 : 8), bz = (bb[0][1] + bb[1][1]) / 2;
    brick.push(geom.box({ x: bx, z: bz, sx: 16, sz: 18, y0: 0, y1: 28.4, rotDeg: rot }));
  }
  const ng = d.northGate;
  for (const sgn of [-1, 1]) brick.push(geom.box({ x: ng.x + sgn * 11, z: ng.z, sx: 9, sz: ng.length, y0: 0, y1: ng.level + 12, rotDeg: 356 }));
  geom.addStatic('glazeBlue', geom.merge(blue), { reflect: true });

  // merlons on the fore-gate (towers and curtain) and the main-gate towers
  const mer = d.merlons, merl = (pts, y) => geom.addMerlons('glazeBlue', pts, { y: y0 + y, pitch: mer.width + 0.17, width: mer.width, height: mer.height, thickness: 0.5 });
  for (const side of [-1, 1]) {
    const a = fg.towers.innerFacesApart / 2, b = a + fg.towers.width, c = mg.towers.innerFacesApart / 2, e = c + mg.towers.width;
    merl([at(side * a, 7), at(side * a, 0.3), at(side * b, 0.3), at(side * b, 7)], fg.towerTop - WALK);
    merl([at(side * b, st.door1 + 0.3), at(side * fg.width / 2, st.door1 + 0.3)], fg.wallTop - WALK);
    merl([at(side * c, st.mainGateTowerFronts + 10), at(side * c, st.mainGateTowerFronts + 0.3), at(side * e, st.mainGateTowerFronts + 0.3), at(side * e, st.mainGateTowerFronts + 10)], mg.towerTop - WALK);
  }
  merl([at(-fg.towers.innerFacesApart / 2, st.door1 + 0.3), at(fg.towers.innerFacesApart / 2, st.door1 + 0.3)], fg.wallTop - WALK);
  merl([at(-mg.towers.innerFacesApart / 2, st.door3 + 0.3), at(mg.towers.innerFacesApart / 2, st.door3 + 0.3)], mg.wallTop - WALK);

  // ------------------------------------------------------------------------------------- the lion street
  const pw = W.street('processionalWay');
  const LIFT = 0.2, pwLevel = (x, z) => M.valueAlong(pw.levels, M.nearestOnPolyline(x, z, pw.polyline)) + LIFT;
  const np = W.monument('northPalace'), ef = W.monument('eastFortification');
  const westWall = np.footprint.polygon.slice(3, 6).reverse();   // wall face, travelling north
  const eastWall = ef.footprint.polygon.slice(0, 3);
  const ew = np.dims.eastWall, top = (x, z) => pwLevel(x, z) + ew.heightAboveStreet;
  brick.push(geom.wall(westWall, { thickness: ew.thickness, offset: -ew.thickness / 2, base: 0, top, step: 15 }));
  brick.push(geom.wall(eastWall, { thickness: ew.thickness, offset: ew.thickness / 2, base: 0, top, step: 15 }));
  geom.addStatic('bakedBrickBuff', geom.merge(brick), { reflect: true });
  for (const [line, off] of [[westWall, -0.35], [eastWall, 0.35]]) geom.addMerlons('glazeBlue', M.resamplePolyline(line, 15), { y: top, pitch: 1.3, width: 0.8, height: 1.1, thickness: 0.6, offset: off });
  // a pavement between the walls (the massing has only the 10.5 m roadway on a coarse terrain)
  const mid = [0, 1, 2].map((i) => [(westWall[i][0] + eastWall[i][0]) / 2, (westWall[i][1] + eastWall[i][1]) / 2]);
  geom.addStatic('limestone', geom.ribbon(M.resamplePolyline([[346.4, -764], ...mid], 10), { width: 24, y: (x, z) => pwLevel(x, z) }), { castShadow: false });

  // friezes: one panel per 6 m division, two lions each, level, stepping down northwards with the street
  const D = 6, LINE = 0.055;
  for (const [line, side] of [[eastWall, 'east'], [westWall, 'west']]) {
    let i = 0;
    for (let k = 0; k + 1 < line.length; k++) {
      const a = line[k], b = line[k + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(len / D), dn = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];   // dn: along the wall, northwards
      const out = side === 'east' ? [dn[1], -dn[0]] : [-dn[1], dn[0]];                                              // from the wall face into the street
      const w = len / n - 2 * LINE;
      for (let j = 0; j < n; j++, i++) {
        const sA = (j * len) / n, sB = ((j + 1) * len) / n;                                   // south and north end of the division
        const pS = [a[0] + dn[0] * sA + out[0] * SK, a[1] + dn[1] * sA + out[1] * SK], pN = [a[0] + dn[0] * sB + out[0] * SK, a[1] + dn[1] * sB + out[1] * SK];
        const level = Math.floor((pwLevel(pN[0], pN[1]) - 0.02) / COURSE) * COURSE;           // foot on a whole course, never above the pavement
        const ground = i % 2 ? 'lapis' : 'turquoise';
        // east wall looks west: the viewer's right is south, origin = north end, north is to his LEFT
        // west wall looks east: the viewer's right is north, origin = south end, north is to his RIGHT
        const right = side === 'east' ? [-dn[0], 0, -dn[1]] : [dn[0], 0, dn[1]];
        const o = side === 'east' ? [pN[0] - dn[0] * 2 * LINE, level, pN[1] - dn[1] * 2 * LINE] : [pS[0] + dn[0] * 2 * LINE, level, pS[1] + dn[1] * 2 * LINE];
        const p = add(G.lionFrieze({ origin: o, right, width: w, count: 2, facing: side === 'east' ? 'L' : 'R', ground, variantStart: i % 2, seed: (side === 'east' ? 500 : 700) + i }));
        lions += p.items.length;
        const e0 = side === 'east' ? pN : pS, sg = side === 'east' ? -1 : 1;                  // the black and white line at the division's edge
        for (const [q, id] of [[0, 'course:glazeBlack'], [1, 'course:glazeWhite']]) {
          geom.addStatic(G.material, G.quad(id, [e0[0] + sg * dn[0] * q * LINE, level, e0[1] + sg * dn[1] * q * LINE], right, [0, 1, 0], { width: LINE, height: G.frieze.height }), { castShadow: false });
        }
      }
    }
  }
  geom.owner = prevOwner;
  const info = { animals, lions, axis: { north: ax.north, south: ax.south }, pavement: y0 };
  console.info('[glazed] film scene: ' + animals + ' bulls and dragons on the gate, ' + lions + ' lions on the street walls');
  return info;
}
