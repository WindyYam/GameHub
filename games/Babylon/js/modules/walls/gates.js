// js/modules/walls/gates.js — double gates (SPEC 3.4): a fore-gate in the front wall and a larger main gate in the
// main wall on one axis, each a block with a brick-vaulted passage, a roofed gate chamber and two flanking towers
// taller than the curtain; an open court between them; open cedar leaves with bronze bands; pedestals with copper
// beasts at the jambs; braziers; the causeway across the 80 m moat with its timber span; the ramp into the city.
// Local frame of a gate: u = metres to the right of the facing, v = metres outward along the facing.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { PARAPET } from './kit.js';

export function makeGates(ctx, K, L) {
  const { geom, ground, world, W, THREE } = ctx;
  const { put, putFar, mul, mix, TONE, mudTone, brickTone, writer, boxInto, panel, merlonRow, tower } = K;
  const iw = world.innerWalls;

  /**
   * One double gate. g: { name, x, z, az (facing), F (roadway level), seed, door: { width, height },
   *   main / fore: { v0, v1 (front of the door wall), halfW, top, towerTop, wallA, wallB (0: one block), chamberHalf,
   *                  tower: { w, uIn, v0, v1 }, key, sideDoors: [{ v, y }] },
   *   causeway: ground.causeways record | null, cityGround: level inside the city, courtHalf }
   */
  function doubleGate(g) {
    const { x, z, az, F, seed } = g, o = M.azToDir(az), r = M.rightOf(o[0], o[1]);
    const P = (u, v) => [x + r[0] * u + o[0] * v, z + r[1] * u + o[1] * v];
    const rect = (u0, u1, v0, v1) => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    const door = { width: g.door.width, height: g.door.height, arch: true };
    const emit = [], wasForced = K.state.force; K.state.force = g.force !== false;      // every gate keeps its stepped merlons as geometry
    let gmin = Infinity; for (const [u, v] of [[-14, g.main.v0], [14, g.main.v0], [-14, g.fore.v1 + 2], [14, g.fore.v1 + 2], [0, 0], [-12, 8], [12, 8]]) { const p = P(u, v); gmin = Math.min(gmin, ground.height(p[0], p[1])); }
    const base = gmin - 1.5;

    const buildings = [g.main, g.fore].map((b, bi) => {
      const key = b.key || 'mud', tint = key === 'brick' ? brickTone(bi, seed) : mul(mudTone(bi, seed, 0.1), 1.02), depth = b.v1 - b.v0, W2 = b.halfW * 2;
      const pb = (vc, d, extra) => geom.passageBlock({ x: P(0, vc)[0], z: P(0, vc)[1], rotDeg: az, width: W2, depth: d, base, floor: F, top: b.top, door, segments: K.draft ? 8 : 14, ...extra });
      if (b.wallB > 0) {
        // door wall, roofed chamber, door wall
        put(key, pb(b.v1 - b.wallA / 2, b.wallA, { rebates: 2 }), tint);
        put(key, pb(b.v0 + b.wallB / 2, b.wallB, { rebatesBack: 2 }), tint);
        const c0 = b.v0 + b.wallB, c1 = b.v1 - b.wallA, w = writer(); w.color(tint);
        for (const sx of [-1, 1]) {
          // side wall of the chamber: outer face with the doors from the wall-walks, inner face toward the chamber
          const uo = sx * b.halfW, ui = sx * b.chamberHalf, A = P(uo, c0), B = P(uo, c1), C = P(ui, c1), D = P(ui, c0);
          const rec = (b.sideDoors || []).filter((d) => d.v > c0 + 1 && d.v < c1 - 1).map((d) => ({ s0: (sx > 0 ? d.v - c0 : c1 - d.v) - 0.55, s1: (sx > 0 ? d.v - c0 : c1 - d.v) + 0.55, y0: d.y + 0.02, y1: d.y + 1.95, depth: 0.9, ao: 0.42 }));
          // panel() looks to the right of travel: +o travel looks along +r
          if (sx > 0) { panel(w, A, B, base, b.top, rec); panel(w, C, D, base, b.top); } else { panel(w, B, A, base, b.top, rec); panel(w, D, C, base, b.top); }
          topQuad(w, [A, B, C, D], b.top);
        }
        put(key, w.toGeometry());
        // the roof of the chamber, with its ceiling
        put(key, geom.box({ x: P(0, (c0 + c1) / 2)[0], z: P(0, (c0 + c1) / 2)[1], y0: b.top - 0.7, y1: b.top, sx: b.chamberHalf * 2, sz: c1 - c0, rotDeg: az, bottom: true }), mul(tint, 0.95));
      } else put(key, pb((b.v0 + b.v1) / 2, depth, { rebates: 2, rebatesBack: 1 }), tint);
      // far level: one block with the passage
      putFar(geom.passageBlock({ x: P(0, (b.v0 + b.v1) / 2)[0], z: P(0, (b.v0 + b.v1) / 2)[1], rotDeg: az, width: W2, depth, base, floor: F, top: b.top + PARAPET * 0.6, door, segments: 6 }), tint);
      // parapet round the roof and its merlons (the towers stand in the front corners)
      const ring = rect(-b.halfW, b.halfW, b.v0, b.v1), sgn = M.polygonArea(ring) > 0 ? 1 : -1;
      put(key, geom.wall(ring, { closed: true, thickness: 0.55, offset: sgn * 0.275, base: b.top, top: b.top + PARAPET }), mul(tint, 1.03));
      const t = b.tower, rows = [[P(-b.halfW + 0.28, b.v0 + 0.28), P(b.halfW - 0.28, b.v0 + 0.28)]];
      for (const sx of [-1, 1]) {
        const uEdge = sx * (b.halfW - 0.28), vEnd = Math.abs(sx * (t.uIn + t.w)) >= b.halfW - 0.3 ? t.v0 - 0.2 : b.v1 - 0.28;
        rows.push([P(uEdge, b.v0 + 0.9), P(uEdge, vEnd)]);
        if (Math.abs(t.uIn + t.w) < b.halfW - 1.5) rows.push([P(sx * (t.uIn + t.w + 0.3), b.v1 - 0.28), P(sx * (b.halfW - 0.9), b.v1 - 0.28)]);
      }
      rows.push([P(-t.uIn + 0.2, b.v1 - 0.28), P(t.uIn - 0.2, b.v1 - 0.28)]);
      for (const row of rows) merlonRow(key, row, b.top + PARAPET, mul(tint, 1.03));
      // the two towers: grooved fronts, loopholes under the platform, an oversailing crenellated top
      for (const sx of [-1, 1]) {
        const c = P(sx * (t.uIn + t.w / 2), (t.v0 + t.v1) / 2), tt = key === 'brick' ? brickTone(bi * 2 + (sx > 0 ? 1 : 0) + 4, seed) : mudTone(bi * 2 + (sx > 0 ? 1 : 0) + 4, seed, 0.1);
        tower({ x: c[0], z: c[1], rotDeg: az, w: t.w, d: t.v1 - t.v0, out: o, base, top: b.towerTop, key, tint: tt, grooves: t.w > 7 ? 3 : 2, groovesFrom: F + 2.2,
          rows: [{ y0: b.towerTop - 2.7, y1: b.towerTop - 1.8, n: t.w > 7 ? 3 : 2, width: 0.32, depth: 0.5 }], corbel: 0.26, hatch: true, door: false });
        emit.push({ kind: 'torch', pos: [c[0], b.towerTop + 1.5, c[1]], size: 1.2 });
      }
      return { key, tint };
    });

    // ---- the plinth under the gate and its court; the roadway of trodden earth on it
    const cw = g.courtHalf, vIn = g.main.v0, vOut = g.fore.v1;
    // (0.2 m inside the faces of the buildings, so that its sides never lie in their planes)
    for (const [hu, va, vb] of [[g.main.halfW - 0.2, vIn + 0.2, g.main.v1 - 0.2], [cw - 0.2, g.main.v1 - 0.2, vOut - 0.2]]) put('mud', geom.box({ x: P(0, (va + vb) / 2)[0], z: P(0, (va + vb) / 2)[1], y0: base, y1: F - 0.12, sx: hu * 2, sz: vb - va, rotDeg: az, bottom: false }), mul(buildings[0].tint, 0.9));
    const earth = writer(); earth.color(TONE.white);
    const flat = (ring, y) => topQuad(earth, ring, y);
    const hw = door.width / 2 - 0.08;
    flat(rect(-hw, hw, vIn - 0.3, vOut + 0.3), F);                                                    // through the passages
    for (const b of [g.main, g.fore]) if (b.wallB > 0) for (const sx of [-1, 1]) flat(rect(sx > 0 ? hw : -b.chamberHalf, sx > 0 ? b.chamberHalf : -hw, b.v0 + b.wallB, b.v1 - b.wallA), F);   // chamber floors
    for (const sx of [-1, 1]) flat(rect(sx > 0 ? hw : -cw, sx > 0 ? cw : -hw, g.main.tower.v1, g.fore.v0), F);            // the court between the gates
    for (const sx of [-1, 1]) flat(rect(sx > 0 ? hw : -g.main.tower.uIn, sx > 0 ? g.main.tower.uIn : -hw, g.main.v1, g.main.tower.v1), F);   // between the main towers
    // far level of the floor: one dark strip so the court does not vanish
    put('earth', earth.toGeometry());
    putFar(geom.cap(rect(-cw, cw, g.main.v1, g.fore.v0), F), mul(TONE.earth, 0.8));

    // ---- door leaves: two cedar leaves with bronze bands, swung open into each front passage
    if (!K.draft) for (const b of [g.main, g.fore]) {
      const vh = b.v1 - 2 * 0.4 - 0.25, jamb = Math.min(door.height - door.width / 2, b.top - F - 2.6), lw = door.width / 2 - 0.06, th = 78 * M.DEG;
      const tw = writer(), bz = writer(); tw.color(TONE.white); bz.color(TONE.white);
      for (const sx of [-1, 1]) {
        const h = P(sx * (door.width / 2 - 0.05), vh), lu = -sx * Math.cos(th), lv = -Math.sin(th), e = [r[0] * lu + o[0] * lv, r[1] * lu + o[1] * lv];
        const cx = h[0] + e[0] * lw / 2, cz = h[1] + e[1] * lw / 2;
        boxInto(tw, cx, cz, e, lw / 2, 0.08, F + 0.06, F + jamb, { top: true });
        for (let k = 0; k < 7; k++) { const y = F + 0.5 + (k * (jamb - 1.0)) / 6; boxInto(bz, cx, cz, e, lw / 2 + 0.012, 0.095, y, y + 0.2, { top: true, bottom: true }); }
      }
      put('timber', tw.toGeometry()); put('bronze', bz.toGeometry());
    }

    // ---- pedestals with the copper beasts at the jambs of the outer door, braziers on brick stands beside the road
    {
      const v = g.fore.tower.v1 + 1.4, pw = writer(), pr = g.props || {}; pw.color(buildings[1].tint);
      for (const sx of [-1, 1]) {
        const c = P(sx * (pr.pedU ?? door.width / 2 + 1.5), v);
        boxInto(pw, c[0], c[1], r, 0.75, 0.75, F - 0.6, F + 1.0);
        if (!K.draft) beast(sx > 0 ? 'dragon' : 'bull', c[0], F + 1.0, c[1], o);
        const s = P(sx * (pr.brazU ?? door.width / 2 + 4.6), v + (pr.brazV ?? 2.2));
        boxInto(pw, s[0], s[1], r, 0.4, 0.4, F - 0.6, F + 0.9);
        put('bronze', geom.prism(M.closeRing(circle(s[0], s[1], 0.33, 10)), F + 0.9, F + 1.25, { batter: -0.55, bottom: true }));
        emit.push({ kind: 'brazier', pos: [s[0], F + 1.45, s[1]], size: 1.5 });
      }
      put(buildings[1].key, pw.toGeometry());
      const c = P(g.courtHalf - 2.2, (g.main.tower.v1 + g.fore.v0) / 2);
      emit.push({ kind: 'brazier', pos: [c[0], F + 1.3, c[1]], size: 1.2 });
      const cwr = writer(); cwr.color(buildings[0].tint); boxInto(cwr, c[0], c[1], r, 0.4, 0.4, F - 0.2, F + 0.85); put('mud', cwr.toGeometry());
      put('bronze', geom.prism(M.closeRing(circle(c[0], c[1], 0.33, 10)), F + 0.85, F + 1.2, { batter: -0.55, bottom: true }));
    }

    // ---- the ramp from the gate floor down to the street inside the city
    {
      const rise = F - g.cityGround, len = Math.max(8, rise / 0.09);
      if (rise > 0.12) {
        const lo = P(0, vIn - len), gl = Math.min(g.cityGround, ground.height(lo[0], lo[1]));
        put('earth', geom.ramp({ x: lo[0], z: lo[1], azDeg: az, width: 7.5, length: len + 0.3, rise: F - gl, base: gl, sink: 1.2 }));
      }
    }

    // ---- the road from the outer door to the causeway, the causeway and its timber span
    const c = g.causeway;
    if (c) {
      const ux = (c.to[0] - c.from[0]) / c.length, uz = (c.to[1] - c.from[1]) / c.length, e = [ux, uz], q = [-uz, ux];
      const C = (s, k) => [c.from[0] + ux * s + q[0] * k, c.from[1] + uz * s + q[1] * k];
      const hwC = c.width / 2, top = c.top, tint = brickTone(9, seed), s0 = c.span.s0, s1 = c.span.s1, sEnd = c.length + 3.5;
      // the trodden road across the berm
      const a = P(0, vOut + 0.2), b = C(0.4, 0);
      put('earth', geom.ribbon([a, b], { width: 6.5, y: (px, pz) => Math.max(F, ground.height(px, pz)) + 0.07, step: 2.5 }));
      for (const [a0, a1] of [[-0.6, s0], [s1, sEnd]]) {
        const mid = C((a0 + a1) / 2, 0), len = a1 - a0, rot = M.dirToAz(ux, uz) - 90;
        // brick side walls with a parapet, an earth fill between them, cross walls at the ends
        for (const sd of [-1, 1]) put('brick', geom.wall([C(a0, sd * (hwC - 0.4)), C(a1, sd * (hwC - 0.4))], { thickness: 0.8, base: -6.6, top: top + 0.95 }), tint);
        const f0 = a0 === s1 ? a0 + 0.8 : a0, f1 = a1 === s0 ? a1 - 0.8 : a1, fm = C((f0 + f1) / 2, 0);
        put('earth', geom.box({ x: fm[0], z: fm[1], y0: -6.6, y1: top, sx: f1 - f0, sz: c.width - 1.6, rotDeg: rot, bottom: false }));
        putFar(geom.box({ x: mid[0], z: mid[1], y0: -6.6, y1: top + 0.5, sx: len, sz: c.width, rotDeg: rot, bottom: false }), tint);
      }
      for (const s of [s0 - 0.4, s1 + 0.4]) put('brick', geom.wall([C(s, -(hwC - 0.8)), C(s, hwC - 0.8)], { thickness: 0.8, base: -6.6, top: top - 0.46, caps: false }), mul(tint, 0.95));
      // the timber span: five palm logs, a plank deck, rails on posts, a trestle in mid-water
      const tw = writer(); tw.color(TONE.white);
      const sm = (s0 + s1) / 2, m = C(sm, 0), L2 = (s1 - s0) / 2 + 0.7;
      for (let k = -2; k <= 2; k++) { const p = C(sm, k * 1.9); boxInto(tw, p[0], p[1], e, L2, 0.17, top - 0.46, top - 0.1, { bottom: true }); }
      boxInto(tw, m[0], m[1], e, L2 + 0.1, hwC - 0.8, top - 0.1, top + 0.01, { bottom: true });
      for (const sd of [-1, 1]) {
        const k = sd * (hwC - 0.62), p = C(sm, k);
        boxInto(tw, p[0], p[1], e, L2 - 0.3, 0.06, top + 0.86, top + 0.98, { bottom: true });
        for (let j = 0; j <= 4; j++) { const pp = C(s0 - 0.2 + (j * (s1 - s0 + 0.4)) / 4, k); boxInto(tw, pp[0], pp[1], e, 0.07, 0.07, top, top + 0.9); }
        const tp = C(sm, sd * 2.6); boxInto(tw, tp[0], tp[1], e, 0.16, 0.16, -6.4, top - 0.46);
      }
      boxInto(tw, m[0], m[1], q, 3.4, 0.15, top - 0.74, top - 0.46, { bottom: true });
      put('timber', tw.toGeometry());
      putFar(geom.box({ x: m[0], z: m[1], y0: top - 0.5, y1: top + 0.05, sx: s1 - s0 + 1.4, sz: c.width - 1, rotDeg: M.dirToAz(ux, uz) - 90, bottom: true }), mul(TONE.timber, 0.9));
    }
    for (const q of emit) ctx.emitters.add(q);
    K.state.force = wasForced;
    return { emitters: emit.length, base };
  }

  /** horizontal quad that looks up, whatever the winding of the ring */
  const topQuad = (w, ring, y) => { const q = M.polygonArea(ring) > 0 ? [...ring].reverse() : ring; w.quad(q[0][0], y, q[0][1], q[1][0], y, q[1][1], q[2][0], y, q[2][1], q[3][0], y, q[3][1]); };
  const circle = (cx, cz, rad, n) => { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * M.TAU; out.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]); } return out; };

  /** A striding bull or snake-dragon of copper on its pedestal: low-polygon, about 1.9 m long, facing `o`. */
  function beast(kind, x, y, z, o) {
    const w = writer(); w.color(TONE.white);
    const e = o, f = [-o[1], o[0]];
    const B = (a, s, hx, hz, y0, y1, dir = e) => boxInto(w, x + e[0] * a + f[0] * s, z + e[1] * a + f[1] * s, dir, hx, hz, y + y0, y + y1, { top: true, bottom: true });
    if (kind === 'bull') {
      B(0, 0, 0.62, 0.2, 0.62, 1.12);                               // body
      B(0.52, 0, 0.2, 0.22, 0.7, 1.2);                              // shoulders (the hump)
      B(0.86, 0, 0.2, 0.13, 0.86, 1.26);                            // neck and head
      B(1.08, 0, 0.12, 0.1, 0.8, 1.06);                             // muzzle
      B(0.92, 0.1, 0.04, 0.03, 1.26, 1.5); B(0.92, -0.1, 0.04, 0.03, 1.26, 1.5);   // horns
      for (const [a, s] of [[0.5, 0.12], [0.3, -0.12], [-0.38, 0.12], [-0.56, -0.12]]) B(a, s, 0.065, 0.065, 0, 0.64);
      B(-0.66, 0, 0.03, 0.03, 0.25, 1.02);                          // tail
    } else {
      B(0, 0, 0.6, 0.15, 0.62, 0.98);                               // body
      B(0.62, 0, 0.1, 0.1, 0.9, 1.55);                              // the long neck
      B(0.78, 0, 0.17, 0.085, 1.5, 1.7);                            // head
      B(0.66, 0, 0.03, 0.03, 1.7, 1.95);                            // the horn
      for (const [a, s] of [[0.46, 0.1], [0.3, -0.1], [-0.36, 0.1], [-0.52, -0.1]]) B(a, s, 0.055, 0.055, 0, 0.64);
      B(-0.66, 0, 0.035, 0.035, 0.9, 1.5);                          // the tail, held up
    }
    put('bronze', w.toGeometry());
  }

  /** The seven ordinary gates of the inner walls. */
  function buildInner(cuts, built) {
    const floors = {}, checks = [], stats = { gates: 0, emitters: 0, causeways: 0 };
    for (const g of iw.gates) {
      if (g.monumentId) continue;
      const o = M.azToDir(g.facingDeg), P = (v, u = 0) => [g.x + o[0] * v - o[1] * u, g.z + o[1] * v + o[0] * u];
      // the roadway must clear the ground everywhere under the gate and its court
      let gmax = -Infinity; for (let v = -24; v <= 29; v += 1.5) for (const u of [-3, 0, 3]) { const p = P(v, u); gmax = Math.max(gmax, ground.height(p[0], p[1])); }
      const F = Math.max(g.roadwayLevel, gmax + 0.12), pin = P(-34), lv = W.innerWallLevels(/Enlil|King|Adad|Shamash/.test(g.name) ? 'west' : 'east', g.x, g.z);
      const fg = g.foreGate, mg = g.mainGate, c = ground.causeways.find((q) => q.gate === g.name) || null;
      const spec = {
        name: g.name, x: g.x, z: g.z, az: g.facingDeg, F, seed: 400 + stats.gates * 7, door: { width: g.doorWidth, height: g.doorHeight },
        main: { v0: 11.15 - mg.depth, v1: 7.15, halfW: mg.width / 2, top: mg.topLevel, towerTop: mg.towerTopLevel, wallA: 7, wallB: 7, chamberHalf: 4, tower: { w: 9, uIn: 5, v0: 1.15, v1: 11.15 }, sideDoors: [{ v: 0, y: lv.walk }] },
        fore: { v0: 14.15, v1: 14.15 + fg.depth - 2, halfW: fg.width / 2, top: fg.topLevel, towerTop: fg.towerTopLevel, wallA: 4.1, wallB: fg.depth - 2 - 4.1 - 3.7, chamberHalf: 10.95, tower: { w: 6.2, uIn: 4.85, v0: 14.15 + fg.depth - 6.2, v1: 14.15 + fg.depth } },
        causeway: c, cityGround: ground.height(pin[0], pin[1]), courtHalf: fg.width / 2 - 0.5,
      };
      let res;
      if (!stats.inspect) { const q = K.inspectOf(() => doubleGate(spec)); res = q.out; stats.inspect = q.inspect; } else res = doubleGate(spec);
      floors[g.name] = F; stats.gates++; stats.emitters += res.emitters; if (c) stats.causeways++;
    }
    const cl = ground.causeways.filter((q) => q.kind === 'inner').map((q) => q.length);
    checks.push({ name: 'ordinary inner gates built as double gates / with a causeway', value: `${stats.gates} / ${stats.causeways}`, expect: '7 / 7', pass: stats.gates === 7 && stats.causeways === 7 });
    checks.push({ name: 'causeway length quay line to outer bank (m): min .. max', value: `${Math.min(...cl).toFixed(1)} .. ${Math.max(...cl).toFixed(1)}`, expect: '80 +/- 1.5', pass: Math.min(...cl) > 78.5 && Math.max(...cl) < 81.5 });
    if (stats.inspect) checks.push({ name: 'a double gate with causeway measured by geom.inspect: open edge above the foot (m) / flipped / overlap (m2)', value: `${stats.inspect.openAbove} / ${stats.inspect.flipped} / ${stats.inspect.overlap}`, expect: 'flipped 0, overlap under 1 (the open edge is the underside of parts founded at different depths)', pass: stats.inspect.flipped === 0 && stats.inspect.overlap < 1 });
    return { floors, checks, stats };
  }

  return { doubleGate, buildInner, beast, circle };
}
