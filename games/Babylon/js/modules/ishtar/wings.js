// js/modules/ishtar/wings.js — what ties the gate into its surroundings (SPEC 3.6, R2 4.1, 8.1):
//   the four baked-brick wing walls on the lines of the double city wall (the two northern ones glazed, with
//   animals, on their north fronts), each with a cavalier tower at the place of the wall's own first tower; the
//   brick platform between the wings with the stair to the wall tops; the forecourt with its two side walls,
//   doorways and stairs down to the berm; the two pairs of bastions.
import * as M from '../../core/mathx.js';
import { BREAST } from './util.js';
import { makeBeasts } from './beasts.js';

export function buildWings(ctx, K, gate) {
  const { geom, glazed: G, W, ground, world } = ctx, C = K.C, put = K.put;
  const { at, E, S, P0, lv, mOut, mgHW, fgHW, CTW, BR, MGW } = gate;
  const uOf = (p) => (p[0] - at(0, 0)[0]) * E[0] + (p[1] - at(0, 0)[1]) * E[1];
  const sOf = (p) => (p[0] - at(0, 0)[0]) * S[0] + (p[1] - at(0, 0)[1]) * S[1];
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const east = world.innerWalls.east, stats = { animals: 0, towers: 0 };
  const dims = W.monument('ishtarGate').dims, gateRec = world.innerWalls.gates.find((g) => g.monumentId === 'ishtarGate');
  const count = (p) => { if (p) stats.animals += p.items.length; return p; };
  const out = { wings: [] }, BE = makeBeasts(ctx.THREE, geom);
  let seed = 900;

  // ------------------------------------------------------------------------------------------ wing walls ----
  // kind 'front': on Nemetti-Enlil's line, as high as the blocks beside the court (walk 10.8 m above the pavement:
  // 0.8 m over the mud wall's +25.4); kind 'main': on Imgur-Enlil's line, walk 16.5 m (0.5 m over its parapet +31.4)
  const LEN = 20;
  function wing(kind, sg) {
    const line = kind === 'front' ? east.outerLine : east.innerLine, gv = line[1], far = sg < 0 ? line[0] : line[2];
    const dir = K.unit(K.sub(far, gv)), nrm = [dir[1], -dir[0]];                 // nrm: a normal of the line
    const north = nrm[1] < 0 ? nrm : [-nrm[0], -nrm[1]];                         // the one that points north
    const th = kind === 'front' ? 4.5 : 7.3, walkC = kind === 'front' ? CTW : 192, walk = lv(walkC);
    const uFace = sg * (kind === 'front' ? mOut : mgHW);
    const tAt = (off) => { const p = add(gv, north, off); return (uFace - uOf(p)) / (dir[0] * E[0] + dir[1] * E[1]); };   // where an edge line meets the gate's side
    // the wing ends where the mud wall of `walls` begins: half the gate's width + the 20 m of the wing, measured along
    // the line from the gate (the same rule as js/modules/walls; its published ends are used when it was built)
    const pub = ((ctx.modules.walls && ctx.modules.walls.ishtarEnds) || []).find((e) => e.wall === kind && e.side === (sg < 0 ? 'west' : 'east'));
    const t1 = pub ? (pub.x - gv[0]) * dir[0] + (pub.z - gv[1]) * dir[1] : (kind === 'front' ? gateRec.width / 2 : dims.mainGate.width / 2) + LEN;
    const nIn = add(add(gv, north, th / 2), dir, tAt(th / 2)), sIn = add(add(gv, north, -th / 2), dir, tAt(-th / 2));
    const nOut = add(add(gv, north, th / 2), dir, t1), sOut = add(add(gv, north, -th / 2), dir, t1);
    const ring = [nIn, nOut, sOut, sIn], gMin = Math.min(...ring.map((p) => ground.height(p[0], p[1])), ground.height(...add(nOut, north, 2)), ground.height(...add(sOut, north, -2)));
    const base = gMin - 1.2;
    put('brick', geom.prism(ring, base, walk, { top: false }));
    put('roof', geom.cap(ring, walk));
    // parapets on both long edges (the walk on the left of travel)
    const westward = dir[0] < 0;
    K.parapet(westward ? [nIn, nOut] : [nOut, nIn], walk, { key: kind === 'front' ? 'blue' : 'brick' });
    K.parapet(westward ? [sOut, sIn] : [sIn, sOut], walk, { key: 'brick' });
    K.parapet(westward ? [nOut, sOut] : [sOut, nOut], walk, { key: 'brick', merlons: false, height: 0.25 });   // a sill at the step down to the mud wall
    K.putFar('brick', geom.prism(ring, base, walk + 1));

    // the cavalier tower: at the place (and a little larger than) the first tower of the city wall on this side
    const list = W.wallTowers(kind === 'front' ? 'east:front' : 'east:main').filter((t) => (t.x - gv[0]) * dir[0] + (t.z - gv[1]) * dir[1] > 0);
    list.sort((a, b) => Math.hypot(a.x - gv[0], a.z - gv[1]) - Math.hypot(b.x - gv[0], b.z - gv[1]));
    const t = list[0];
    let tower = null;
    if (t && Math.hypot(t.x - gv[0], t.z - gv[1]) < 45) {
      const tw = t.w + 0.9, td = t.d + 0.9, top = t.top + 0.25, tr = M.rectRing(t.x, t.z, tw, td, t.rotDeg).slice(0, 4);
      put('brick', geom.prism(tr, base, top, { top: false }));
      put('roof', geom.cap(tr, top));
      K.parapet(K.ccw(tr), top, { closed: true, key: kind === 'front' ? 'blue' : 'brick' });
      K.putFar('brick', geom.prism(tr, base, top + 1));
      tower = { x: t.x, z: t.z, w: tw, d: td, rotDeg: t.rotDeg, top, ring: tr };
      stats.towers++;
      // slit loopholes on the outer faces of the upper part
      for (const q of [0.3, 0.7]) for (const sd of [1, -1]) {
        if (kind === 'front' && sd > 0) continue;                 // the north face of a northern tower is glazed
        const c = add(add([t.x, t.z], north, sd * (td / 2 + 0.012)), dir, (q - 0.5) * tw), nn = [north[0] * sd, north[1] * sd], rr = [nn[1], -nn[0]];
        put('dark', geom.custom({ position: [c[0] - rr[0] * 0.11, top - 2.3, c[1] - rr[1] * 0.11, c[0] + rr[0] * 0.11, top - 2.3, c[1] + rr[1] * 0.11, c[0] + rr[0] * 0.11, top - 1.0, c[1] + rr[1] * 0.11, c[0] - rr[0] * 0.11, top - 1.0, c[1] - rr[1] * 0.11], index: [0, 1, 2, 0, 2, 3], normal: [nn[0], 0, nn[1], nn[0], 0, nn[1], nn[0], 0, nn[1], nn[0], 0, nn[1]] }));
      }
    }

    // the glazed north front of a northern wing: the rows of the gate carried on down to the berm (two more rows
    // below the level of the pavement), socle on a brick footing
    if (kind === 'front') {
      const foot = P0 - 48 * C, courses = 48 + walkC + BR, lineTop = 48 + walkC;
      // the viewer of a north face has west on his right: A = the eastern end
      const [A, B] = westward ? [nIn, nOut] : [nOut, nIn], toDoor = sg < 0 ? 'L' : 'R';
      if (tower) {
        // three stretches: beside the gate, the tower front (it stands 1 m before the wall), beyond the tower
        const along = (p) => (p[0] - A[0]) * (B[0] - A[0]) / K.len(K.sub(B, A)) + (p[1] - A[1]) * (B[1] - A[1]) / K.len(K.sub(B, A));
        const u = K.unit(K.sub(B, A)), c0 = along([tower.x, tower.z]), a0 = Math.max(0.3, c0 - tower.w / 2), a1 = Math.min(K.len(K.sub(B, A)) - 0.3, c0 + tower.w / 2), L = K.len(K.sub(B, A));
        const P = (k) => add(A, u, k), proj = tower.d / 2 - th / 2, TA = add(P(a0), north, proj), TB = add(P(a1), north, proj), tc = Math.round((tower.top + BREAST - foot) / C);
        count(K.gateSkin(A, P(a0), foot, courses, { rows: 7, spacing: 3.2, facing: toDoor, top: 'checker', above: courses - lineTop, seed: seed++ }));
        count(K.gateSkin(P(a1), B, foot, courses, { rows: 7, spacing: 3.2, facing: toDoor, top: 'checker', above: courses - lineTop, seed: seed++ }));
        count(K.gateSkin(TA, TB, foot, tc, { rows: 7, perRow: 2, facing: toDoor, corners: 'both', top: 'checker', above: 8, seed: seed++ }));
        K.gateSkin(P(a0), TA, foot, tc, { rows: 0, top: 'checker', above: 8, seed: seed++ });       // the tower's two flanks
        K.gateSkin(TB, P(a1), foot, tc, { rows: 0, top: 'checker', above: 8, seed: seed++ });
      } else count(K.gateSkin(A, B, foot, courses, { rows: 7, spacing: 3.2, facing: toDoor, top: 'checker', above: courses - lineTop, seed: seed++ }));
    }
    out.wings.push({ kind, sg, ring, walk, base, tower, north, dir, nIn, sIn, nOut, sOut, th });
    return out.wings[out.wings.length - 1];
  }
  const wingsBy = {};
  for (const sg of [-1, 1]) { wingsBy['f' + sg] = wing('front', sg); wingsBy['m' + sg] = wing('main', sg); }

  // the brick platform between the two wings beside the gate, level with the northern wing's walk, with the
  // stair up to the main wall (R2 4.1: "an intermediate platform with a passage and the stairs to the wall tops")
  for (const sg of [-1, 1]) {
    const f = wingsBy['f' + sg], m = wingsBy['m' + sg], PL = 7.5;
    const a = f.sIn, b = add(f.sIn, f.dir, PL);
    // m.nIn lies on the main body's side (u = mgHW): start the platform at the main tower's outer face instead
    const tM = (sg * mOut - uOf(m.nIn)) / (m.dir[0] * E[0] + m.dir[1] * E[1]), d2 = add(m.nIn, m.dir, tM), c2 = add(d2, m.dir, PL);
    const ring = [a, b, c2, d2], top = f.walk, base = Math.min(...ring.map((p) => ground.height(p[0], p[1]))) - 1.2;
    put('brick', geom.prism(ring, base, top, { top: false }));
    put('roof', geom.cap(ring, top));
    K.parapet(sg < 0 ? [b, c2] : [c2, b], top, { key: 'brick' });
    // the mouth of the passage under the platform: a dark arched doorway on the outer face
    const mid = K.lerp2(b, c2, 0.5), o = f.dir, g0 = ground.height(...add(mid, o, 1)), tt = K.unit(K.sub(c2, b)), pos = [], idx = [], nor = [];
    const pts = [[-1.1, 0], [1.1, 0]]; for (let i = 0; i <= 10; i++) { const an = (Math.PI * i) / 10; pts.push([1.1 * Math.cos(an), 2.2 + 1.1 * Math.sin(an)]); }
    for (const [x, y] of pts) { pos.push(mid[0] + tt[0] * x + o[0] * 0.015, g0 + y, mid[1] + tt[1] * x + o[1] * 0.015); nor.push(o[0], 0, o[1]); }
    const flip = (tt[0] * o[1] - tt[1] * o[0]) < 0;       // fan wound so that it faces along o
    for (let i = 1; i + 1 < pts.length; i++) { if (flip) idx.push(0, i + 1, i); else idx.push(0, i, i + 1); }
    put('dark', geom.custom({ position: pos, index: idx, normal: nor }));
    // the stair from the platform up to the main wing's walk, along its north face
    const rise = m.walk - top, steps = Math.round(rise / 0.26), foot = add(add(d2, m.dir, PL - 0.6), m.north, 0.75), az = M.dirToAz(-m.dir[0], -m.dir[1]);
    put('brick', geom.stairs({ x: foot[0], z: foot[1], azDeg: az, width: 1.4, steps, riser: rise / steps, tread: (PL - 1.0) / steps, base: top, sink: 0.05 }));
  }

  // ------------------------------------------------------------------------------------------ forecourt ----
  // the terrace of the forecourt (32 m between the side walls) is retained by its two side walls: brick, 6 m to the
  // walk above the paving, a glazed band and blue merlons at the top (after Pedersen's model); west wall with the
  // 4.65 m doorway and the stair of 17 steps down to the berm, east wall with three doorways (R2 8.1)
  const FW = 70, fwTop = lv(FW);                                   // walk 6.0 m above the pavement of the gate
  const bst = W.monument('ishtarGate').dims.bastions;
  const pwl = W.street('processionalWay');
  const street = (x, z) => M.valueAlong(pwl.levels, M.nearestOnPolyline(x, z, pwl.polyline));
  function forecourtWall(sg) {
    // the edge of the terrace in the ground model: x = 329.5 / 361.6 at z = -742, leaning 0.035 per metre northwards
    const edge = (z) => (sg < 0 ? 329.5 : 361.6) - 0.035 * (z + 742);
    const th = sg < 0 ? 4.6 : 5.5, inner = (z) => edge(z) - sg * 0.45, outer = (z) => inner(z) + sg * th;
    const zN = (sg < 0 ? bst.west[1][1] : bst.east[1][1]) - 0.6, z0 = at(sg * fgHW, 0)[1], zS = at(sg * fgHW, 7.5)[1];
    const base = 8.6;
    const doors = sg < 0 ? [{ z: -753.2, w: 4.65, h: 5.0 }] : [{ z: -748.4, w: 2.2, h: 3.5 }, { z: -753.4, w: 2.2, h: 3.5 }, { z: -758.4, w: 2.2, h: 3.5 }];
    // pieces of the north-south leg between zN and z0, cut at the doorways (a door piece is 2.4 m longer than its door)
    let z = zN;
    const piece = (za, zb) => { if (zb - za < 0.05) return; const ring = [[inner(za), za], [inner(zb), zb], [outer(zb), zb], [outer(za), za]]; put('brick', geom.prism(ring, base, fwTop, { top: false })); };
    for (const dr of [...doors].sort((p, q) => p.z - q.z)) {
      const za = dr.z - dr.w / 2 - 1.2, zb = dr.z + dr.w / 2 + 1.2, xm = (za2) => (inner(za2) + outer(za2)) / 2, fl = street(inner(dr.z), dr.z) + 0.06;
      piece(z, za);
      put('brick', geom.archedWall({ a: [xm(za), za], b: [xm(zb), zb], thickness: th, base, floor: fl, top: fwTop, door: { width: dr.w, height: dr.h, arch: true }, topFace: false, segments: 12 }));
      // threshold slab in the passage, and the stair outside
      const cx = xm(dr.z), dirOut = [sg, 0], stairW = dr.w, drop = fl - 10.5, steps = sg < 0 ? 17 : Math.round(drop / 0.26), tread = 0.34;
      put('stone', geom.box({ x: cx, z: dr.z, sx: th + 0.3, sz: dr.w - 0.02, y0: fl - 0.25, y1: fl + 0.03 }));
      if (sg < 0 || dr === doors[1]) {
        const foot = [outer(dr.z) + sg * (steps * tread + 0.02), dr.z];
        put('brick', geom.stairs({ x: foot[0], z: foot[1], azDeg: sg < 0 ? 90 : 270, width: stairW, steps, riser: drop / steps, tread, base: fl - drop, sink: 1.2, parapet: { height: 0.9, thickness: 0.45 } }));
      } else {
        // the two outer doorways of the east wall open on a landing with a parapet
        put('brick', geom.box({ x: outer(dr.z) + sg * 1.3, z: dr.z, sx: 2.6, sz: dr.w + 1.6, y0: base, y1: fl }));
      }
      void dirOut;
      z = zb;
    }
    piece(z, z0);
    // the block in the corner between the side wall and the fore-gate (it closes the terrace on the south)
    const cornerRing = sg < 0 ? [[outer(z0), z0], at(sg * fgHW, 0), at(sg * fgHW, 7.5), [outer(zS), zS]] : [at(sg * fgHW, 0), [outer(z0), z0], [outer(zS), zS], at(sg * fgHW, 7.5)];
    put('brick', geom.prism(cornerRing, base, fwTop, { top: false }));
    // deck and parapets
    const deckRing = [[inner(zN), zN], [inner(z0), z0], at(sg * fgHW, 0), at(sg * fgHW, 7.5), [outer(zS), zS], [outer(zN), zN]];
    put('roof', geom.cap(deckRing, fwTop));
    const inEdge = [[inner(zN), zN], [inner(z0), z0], at(sg * (fgHW + 0.0), 0)], outEdge = [at(sg * fgHW, 7.5), [outer(zS), zS], [outer(zN), zN]];
    // west wall: the terrace is to the east; inner edge travelled northwards has the wall on its left
    K.parapet(sg < 0 ? [...inEdge].reverse() : inEdge, fwTop);
    K.parapet(sg < 0 ? [...outEdge].reverse() : outEdge, fwTop, { key: 'brick' });
    K.putFar('brick', geom.prism(deckRing, base, fwTop + 1));
    // the glazed band under the breastwork on the faces towards the forecourt: plain blue, checker, rosettes, checker
    const bandC = 2 + 3 + 5 + 3 + 4, y = fwTop + BREAST - bandC * C, bands = [{ type: 'field', courses: 2, ground: 'glazeBlue' }, { type: 'checker' }, { type: 'rosette' }, { type: 'checker' }, { type: 'field', courses: 4, ground: 'glazeBlue' }];
    const pN = [inner(zN + 0.6), zN + 0.6], p0 = [inner(z0), z0], pc = at(sg * fgHW, 0);
    // the west wall's inner face looks east (the viewer's right is north), the east wall's looks west (right = south)
    if (sg < 0) { K.skin(p0, pN, y, bands, { seed: seed++ }); K.skin(pc, p0, y, bands, { seed: seed++ }); }
    else { K.skin(pN, p0, y, bands, { seed: seed++ }); K.skin(p0, pc, y, bands, { seed: seed++ }); }
    return { inner, outer, zN, z0, zS, th };
  }
  out.forecourt = { west: forecourtWall(-1), east: forecourtWall(1), walk: fwTop };

  // ------------------------------------------------------------------------------------------ bastions ----
  // two pairs: at the street a block 16 x 18 m on each side (their street faces carry the lion frieze: street.js),
  // behind each a second, lower block (R2 8.1). Plain brick, blue merlons, tops 14 / 13 m above the street.
  /** Shallow buttress-towers on a face P -> Q that looks along n: at the fractions `at`, 3.2 m wide, 0.55 m proud. */
  function buttresses(P, Q, n, at, base, top) {
    const d = K.unit(K.sub(Q, P)), L = K.len(K.sub(Q, P));
    for (const f of at) {
      const c = add(P, d, f * L), a = add(c, d, -1.6), b = add(c, d, 1.6);
      put('brick', geom.prism([a, b, add(b, n, 0.55), add(a, n, 0.55)], base, top));
      // a slit in its upper part
      const cp = add(c, n, 0.562), r = [n[1], -n[0]];
      put('dark', geom.custom({ position: [cp[0] - r[0] * 0.11, top - 3.4, cp[1] - r[1] * 0.11, cp[0] + r[0] * 0.11, top - 3.4, cp[1] + r[1] * 0.11, cp[0] + r[0] * 0.11, top - 2.0, cp[1] + r[1] * 0.11, cp[0] - r[0] * 0.11, top - 2.0, cp[1] - r[1] * 0.11], index: [0, 1, 2, 0, 2, 3], normal: [n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1], n[0], 0, n[1]] }));
    }
  }
  /** A stair-head hut on a roof: mud-plastered brick, flat roof, a dark doorway on the side `dn`. */
  function hut(c, d, w, l, y, dn) {
    const n = [-d[1], d[0]], ring = [add(add(c, d, -l / 2), n, -w / 2), add(add(c, d, l / 2), n, -w / 2), add(add(c, d, l / 2), n, w / 2), add(add(c, d, -l / 2), n, w / 2)];
    put('brick', geom.prism(ring, y - 0.05, y + 2.3, { top: false }));
    put('roof', geom.cap(ring, y + 2.3));
    put('brick', geom.wall(K.ccw(ring), { closed: true, thickness: 0.3, offset: -0.15, base: y + 2.25, top: y + 2.55 }));
    const face = dn === 'd' ? d : dn === '-d' ? [-d[0], -d[1]] : dn === 'n' ? n : [-n[0], -n[1]], half = dn === 'd' || dn === '-d' ? l / 2 : w / 2;
    const p = add(c, face, half + 0.012), r = [face[1], -face[0]];
    put('dark', geom.custom({ position: [p[0] - r[0] * 0.45, y, p[1] - r[1] * 0.45, p[0] + r[0] * 0.45, y, p[1] + r[1] * 0.45, p[0] + r[0] * 0.45, y + 1.8, p[1] + r[1] * 0.45, p[0] - r[0] * 0.45, y + 1.8, p[1] - r[1] * 0.45], index: [0, 1, 2, 0, 2, 3], normal: [face[0], 0, face[1], face[0], 0, face[1], face[0], 0, face[1], face[0], 0, face[1]] }));
  }
  function bastion(sg) {
    const f = sg < 0 ? bst.west : bst.east, A = f[0], B = f[1];                // street face, north end -> south end
    const dS = K.unit(K.sub(B, A)), away = sg < 0 ? [-dS[1], dS[0]] : [dS[1], -dS[0]];   // away from the street
    const lvl = street(A[0], A[1]), walk = Math.round((lvl + 14 - 1.243) / C) * C, walk2 = walk - 12 * C, depth = sg < 0 ? 16 : 16.5;
    const base = sg < 0 ? 6.8 : -3.9, north = [-dS[0], -dS[1]], bt = (w) => w + BREAST;
    const Bs = add(B, dS, 0.25);                                               // a little past the forecourt's north line
    // the rhythm of the street-wall towers is carried across the bastion's street face: one tower 8 m wide,
    // 6.5 m from the bastion's north edge (a design choice; it also takes in the ends of the palace walls behind)
    const into = [-away[0], -away[1]], T0 = add(A, dS, 6.5), T1 = add(A, dS, 14.5), TP = 1.75, T0p = add(T0, into, TP), T1p = add(T1, into, TP);
    const ring = [A, T0, T0p, T1p, T1, Bs, add(Bs, away, depth), add(A, away, depth)];
    const faces = [{ P: A, Q: T0, n: into, count: 2 }, { P: T0p, Q: T1p, n: into, count: 3, tower: true, flanks: [[T0, T0p, [-dS[0], -dS[1]]], [T1, T1p, dS]] }, { P: T1, Q: Bs, n: into, count: 1 }];
    put('brick', geom.paint(geom.prism(ring, base, walk, { top: false }), [0.94, 0.94, 0.95]));
    put('roof', geom.cap(ring, walk));
    K.parapet(K.ccw(ring), walk, { closed: true });
    K.putFar('brick', geom.prism(ring, base, walk + 1));
    hut(add(add(A, dS, 5), away, depth - 4.2), dS, 2.6, 3.2, walk, '-n');
    // a watch fire on the bastion, towards the forecourt
    { const p = add(add(Bs, dS, -2.2), away, 2.4); put('bronze', geom.transform(BE.brazier(), { x: p[0], y: walk, z: p[1], rotDeg: 15 })); ctx.emitters.add({ kind: 'brazier', pos: [p[0], walk + 1.3, p[1]], size: 1.3 }); }
    // the second block: north of the first, behind the street wall (7 m back from the street face); on the east
    // side it also wraps the first block's outer end
    const back = 9.4, n0 = add(A, dS, -(sg < 0 ? 10 : 7.2));                   // behind the street wall and the backs of its towers
    const ring2 = sg < 0
      ? [add(A, away, back), add(A, away, back + 16), add(n0, away, back + 16), add(n0, away, back)]
      : [add(A, away, back), add(A, away, depth), add(Bs, away, depth), add(Bs, away, depth + 3.2), add(n0, away, depth + 3.2), add(n0, away, back)];
    put('brick', geom.prism(ring2, base, walk2, { top: false }));
    put('roof', geom.cap(ring2, walk2));
    K.parapet(K.ccw(ring2), walk2, { closed: true });
    K.putFar('brick', geom.prism(ring2, base, walk2 + 1));
    // shallow buttress-towers on the free faces (not on the street face, which carries the lion frieze)
    if (sg < 0) {
      buttresses(ring[7], ring[6], away, [0.27, 0.73], base, bt(walk));                 // west face of the first block
      buttresses(ring[5], ring[6], dS, [0.8], base, bt(walk));                          // its south face, beyond the forecourt wall
      buttresses(ring2[2], ring2[1], away, [0.5], base, bt(walk2));                     // west face of the second block
      buttresses(ring2[3], ring2[2], north, [0.3, 0.72], base, bt(walk2));              // its north face
    } else {
      buttresses(ring2[4], ring2[3], away, [0.2, 0.5, 0.8], base, bt(walk2));           // east face of the second block
      buttresses(ring2[5], ring2[4], north, [0.5], base, bt(walk2));                    // its north face
      buttresses(ring[5], ring[6], dS, [0.78], base, bt(walk));                         // south face of the first block
    }
    return { A, B: Bs, away, dS, walk, walk2, ring, ring2, level: lvl, faces };
  }
  out.bastions = { west: bastion(-1), east: bastion(1) };
  out.stats = stats;
  return out;
}
