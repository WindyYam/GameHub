// js/modules/people/vignettes.js — the staged scenes at the four low cameras (SPEC 3.18, 7, 9.5), placed from the
// film path: the procession on the lion street (shot 2), crews, tow teams and bank life on the river (shot 5),
// the Merkes street (shot 7), the family on the roof of the Great House and their neighbours (shot 8).
import { bit } from './human.js';
import { qbit, bbit } from './animals.js';

export function buildVignettes(ctx, sys, cast, st, props) {
  const { film, layout, ground, geom, materials, mathx: M } = ctx;
  const rng0 = ctx.module.rng.fork('vignettes');
  const pal = sys.palette, mul = cast.mul, C = sys.C;
  const shot = (id) => film.shots.find((s) => s.id === id);
  const counts = {}, updates = [];
  const note = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const put = (k, f, min) => { f.tag = k; const g = st.place(f, min); if (g) note(k); else note(k + ':dropped'); return g; };
  const seated = (f) => { if (f.mask & bit('skirtLong')) f.mask = (f.mask & ~bit('skirtLong')) | bit('skirtSeat'); f.mask &= ~bit('staff'); f.base = 'sit'; return f; };   // a long garment lies as a lap over the crossed legs; a short one leaves them bare

  // ---- a thin rope between two moving points (halter ropes) ------------------------------------------------------
  const ropeGeo = new ctx.THREE.CylinderGeometry(0.012, 0.012, 1, 5); ropeGeo.translate(0, 0.5, 0);
  const ropes = [], ropeSet = geom.instanced({ name: 'people-ropes', geometry: ropeGeo, material: 'reedMat', dynamic: true, capacity: 24, castShadow: false });
  const _m = new ctx.THREE.Matrix4(), _q = new ctx.THREE.Quaternion(), _up = new ctx.THREE.Vector3(0, 1, 0), _d = new ctx.THREE.Vector3(), _p = new ctx.THREE.Vector3(), _s = new ctx.THREE.Vector3();
  const Sa = { x: 0, y: 0, z: 0, az: 0, s: 0 }, Sb = { x: 0, y: 0, z: 0, az: 0, s: 0 };
  /** A rope from a point on figure a (offset: right, up, forward in its own frame) to a point on figure b. */
  const rope = (a, offA, b, offB, t0 = -Infinity, t1 = Infinity) => { if (a && b && ropes.length < 24) ropes.push({ a, offA, b, offB, t0, t1 }); };
  const anchor = (f, off, t, S, out) => {
    if (f.move) f.move(t, S, f); else { S.x = f.x; S.y = f.y; S.z = f.z; S.az = f.az; }
    const a = S.az * Math.PI / 180, fx = Math.sin(a), fz = -Math.cos(a), k = f.scale || 1;
    out.set(S.x + (-fz * off[0] + fx * off[2]) * k, S.y + off[1] * k, S.z + (fx * off[0] + fz * off[2]) * k);
  };
  updates.push((frame) => {
    const t = frame.t; let n = 0;
    for (const r of ropes) {
      if (t < r.t0 || t >= r.t1) continue;
      anchor(r.a, r.offA, t, Sa, _p); anchor(r.b, r.offB, t, Sb, _d);
      _d.sub(_p); const len = _d.length(); if (len < 0.02 || len > 6) continue;
      _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / len)); _s.set(1, len, 1);
      ropeSet.setAt(n++, _m.compose(_p, _q, _s));
    }
    ropeSet.count = n; ropeSet.commit();
  });

  // ==============================================================================================================
  // Shot 2: the procession on the lion street, moving toward the gate
  // ==============================================================================================================
  (function procession() {
    const sh = shot('processionalWay'), pw = layout.streetById('processionalWay');
    if (!sh || !pw) return;
    const rng = rng0.fork('procession'), line = pw.polyline, V = 1.08;
    const cam0 = film.pathPoseAt(sh.tHold).pos, sC = M.nearestOnPolyline(cam0[0], cam0[2], line).s;
    const sGate = M.nearestOnPolyline(345.5, -744.3, line).s;
    const narrow = (s) => 0.42 + 0.58 * M.smoothstep(sGate - 4, sGate - 26, s);          // the files close up to pass the gate
    const cache = new Map();
    const pathFor = (u) => {
      let p = cache.get(u); if (p) return p;
      const s0 = sC - 75, s1 = Math.min(M.polylineLength(line) - 1, sGate + 70), n = Math.ceil(s1 - s0) + 1, pts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = s0 + (s1 - s0) * i / (n - 1), h = M.pointAlong(line, s), k = u * narrow(s), x = h.x - h.dir[1] * k, z = h.z + h.dir[0] * k;
        pts[i * 3] = x; pts[i * 3 + 1] = st.standY(x, z); pts[i * 3 + 2] = z;
      }
      p = { pts, n, len: s1 - s0, step: (s1 - s0) / (n - 1), s0 }; cache.set(u, p); return p;
    };
    /** d: metres ahead of the camera when the hold begins; u: metres right (west) of the axis. */
    const walk = (role, d, u, opts = {}) => {
      const f = cast.dress(role, rng, opts), p = pathFor(u);
      st.walkOn(f, p, sC - p.s0 + d + rng.range(-0.15, 0.15), V, sh.tHold);
      return put('procession', f, 0.95);
    };
    // citizens following, behind the camera's landing (off the axis)
    for (let i = 0; i < 12; i++) walk(rng.pick(['man', 'man', 'elder', 'woman', 'man']), -3 - i * 1.55 - rng.range(0, 0.6), (i % 2 ? 1 : -1) * rng.range(2.3, 4.6), rng.chance(0.3) ? { add: bit('staff'), arms: 'staff' } : {});
    // rear guard: the camera walks up between its two files
    for (const d of [3.6, 6.2, 8.8]) for (const u of [-2.7, 2.7]) walk('soldier', d, u);
    // priests in white linen, hands clasped, four abreast with the middle open
    for (const d of [11.6, 13.7, 15.8, 17.9]) for (const u of [-3.3, -1.7, 1.7, 3.3]) walk('priest', d, u, { arms: 'clasp' });
    // musicians: lyres, frame drums, double pipes
    const mus = [['lyre', -2.4, 20.6], ['pipes', 0, 20.9], ['lyre', 2.4, 20.6], ['drum', -2.4, 22.9], ['drum', 0, 23.2], ['pipes', 2.4, 22.9]];
    for (const [ins, u, d] of mus) walk('musician', d, u, { add: bit(ins), arms: ins });
    // standards
    for (const u of [-3.0, -1.0, 1.0, 3.0]) walk('priest', 26.0, u, { add: bit('standard'), arms: 'standard', tall: 1.6, B: mul(pal.red, 0.95) });
    // the litter with the god's emblem on the shoulders of six bearers
    const dL = 30.4, bearers = [];
    for (const d of [-1.25, 0, 1.25]) for (const s of [-1, 1]) {
      const b = walk('porter', dL + d, s * 0.62, { arms: s > 0 ? 'yokeL' : 'yokeR', A: mul(pal.linen, 0.96), D: null, B: mul(pal.red, 0.95), scale: 0.985, mask: bit('skirtShort', 'hairShort', 'headband', 'beard'), amp: 0.33 });
      if (b) { b.D = b.C; bearers.push(b); }
    }
    {
      const wood = C('cedar'), gold = C('gold'), red = C('dyeMadderRed'), white = C('linenWhite'), parts = [];
      const bx = (x, y0, y1, z, sx, sz, col) => parts.push(geom.paint(geom.box({ x, z, y0, y1, sx, sz }), col));
      for (const s of [-1, 1]) bx(s * 0.45, 1.43, 1.51, 0, 0.075, 3.9, wood);                       // carrying poles
      bx(0, 1.51, 1.57, 0, 1.15, 1.6, wood);                                                          // platform
      bx(0, 1.57, 1.63, 0, 1.0, 1.4, red);                                                            // cloth over it
      bx(0, 1.63, 2.25, 0.1, 0.62, 0.7, white); bx(0, 2.25, 2.33, 0.1, 0.72, 0.8, gold);              // the shrine: a small white chapel with a gilded cornice
      bx(0, 1.63, 2.0, -0.26, 0.26, 0.03, [0.03, 0.025, 0.02]);                                       // its dark doorway
      for (const s of [-1, 1]) for (const t of [-1, 1]) bx(s * 0.5, 1.63, 2.75, t * 0.7, 0.045, 0.045, wood);   // canopy posts
      bx(0, 2.75, 2.80, 0, 1.2, 1.6, red); bx(0, 2.70, 2.75, 0, 1.26, 1.66, gold);                    // canopy
      const disc = new ctx.THREE.CylinderGeometry(0.2, 0.2, 0.03, 14); disc.rotateX(Math.PI / 2); disc.translate(0, 3.12, 0); if (disc.attributes.uv) disc.deleteAttribute('uv');
      parts.push(geom.paint(geom.ensureAttributes(disc), gold)); bx(0, 2.8, 2.95, 0, 0.05, 0.05, gold);
      const g = geom.merge(parts), mat = materials.variant('cedar', { name: 'people-litter', color: 0xffffff });
      const litter = geom.instanced({ name: 'people-litter', geometry: g, material: mat, dynamic: true, capacity: 1, shadowTexel: 0.3 });
      const p0 = pathFor(0), S = { x: 0, y: 0, z: 0, az: 0 };
      updates.push((frame) => {
        if (bearers.length < 6) { litter.count = 0; litter.commit(); return; }
        st.pathAt(p0, sC - p0.s0 + dL + V * (frame.t - sh.tHold), 1, S);
        litter.setAt(0, { x: S.x, y: S.y + 0.012 * Math.sin(frame.t * 5.1), z: S.z, rotDeg: S.az });
        litter.count = 1; litter.commit();
      });
      note('props', 1);
    }
    // priests round the litter and at the head, the high priest with his staff in front
    for (const [d, u] of [[33.6, -1.3], [33.6, 1.3], [33.9, -2.9], [33.9, 2.9], [35.8, -1.6], [35.8, 1.6]]) walk('priest', d, u, { arms: 'clasp' });
    walk('elder', 38.6, 0, { A: mul(pal.linen, 1.0), E: mul(pal.purple, 1.0), B: mul(pal.red, 0.9), hair: 0.8 });
    for (const u of [-1.6, 1.6]) walk('priest', 40.8, u, { add: bit('standard'), arms: 'standard', tall: 1.6, B: mul(pal.saffron, 0.95) });
    for (const d of [43.2, 45.6]) for (const u of [-2.7, 2.7]) walk('soldier', d, u);
    // guards walking on both flanks
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) walk('soldier', 1.5 + i * 5.9 + (s > 0 ? 1.2 : 0), s * 5.75);

    // onlookers on the side strips, in knots that leave the friezes open between them
    const end = sGate - 24;
    let side = 1;
    for (let s = sC - 46; s < end; s += rng.range(7.5, 11)) {
      side = -side;
      const h = M.pointAlong(line, s), u = side * rng.range(6.7, 7.9), x = h.x - h.dir[1] * u, z = h.z + h.dir[0] * u, y = st.standY(x, z), n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const px = x + h.dir[0] * (i - (n - 1) / 2) * rng.range(0.7, 0.95) + rng.range(-0.25, 0.25) * h.dir[1], pz = z + h.dir[1] * (i - (n - 1) / 2) * 0.85 + rng.range(-0.25, 0.25) * h.dir[0];
        const role = rng.pick(['man', 'woman', 'man', 'child', 'elder', 'worker', 'woman', 'girl']);
        const f = cast.dress(role, rng, { base: 'stand' });
        if (role === 'man' && rng.chance(0.3)) { f.mask |= bit('staff'); f.arms = 'staff'; } else if (rng.chance(0.3)) f.arms = rng.pick(['point', 'talk', 'wave', 'hips']);
        if (rng.chance(0.12) && role !== 'child') seated(f);
        // they look up the street toward the procession as it comes, turning a little
        st.fixed(f, px, st.standY(px, pz), pz, st.azTo(px, pz, h.x + h.dir[0] * side * 0, h.z) + rng.range(-25, 25) - side * 20);
        put('onlookers', f);
      }
    }
    // sentries on both street walls, behind the merlons (the wall-walk lies about 10 m above the street)
    for (let s = sC - 60; s < end + 10; s += 28) for (const sd of [-1, 1]) {
      const h = M.pointAlong(line, s + (sd > 0 ? 9 : 0)), u = sd * 12.4, x = h.x - h.dir[1] * u, z = h.z + h.dir[0] * u;
      const f = cast.dress('soldier', rng, { base: 'stand', arms: 'guardEasy', del: bit('shield') });
      st.fixed(f, x, ground.height(h.x, h.z) + 10.0, z, st.azTo(x, z, h.x, h.z));
      put('sentries', f);
    }
  })();

  // ==============================================================================================================
  // Shot 7: Untere Tempelstrasse in Merkes, the camera walking west with the morning sun behind it
  // ==============================================================================================================
  (function merkes() {
    const sh = shot('merkesLane'), rec = layout.streetById('merkes0');
    if (!sh || !rec) return;
    const rng = rng0.fork('merkes'), line = rec.polyline;                                    // runs west -> east: +u is the south side
    const cam0 = film.pathPoseAt(sh.tHold).pos, sC = M.nearestOnPolyline(cam0[0], cam0[2], line).s, T0 = sh.tHold;
    const paths = new Map(), pathFor = (u) => { let p = paths.get(u); if (!p) paths.set(u, (p = st.makePath(line, u))); return p; };
    /** e: metres WEST of the camera (ahead) when the hold begins; v > 0 walks east, toward the camera. */
    const walk = (role, e, u, v, opts = {}) => { const f = cast.dress(role, rng, opts); st.walkOn(f, pathFor(u), sC - e, v, T0); return put('merkes', f, 0.95); };
    const at = (e, u) => { const h = M.pointAlong(line, sC - e); return { x: h.x - h.dir[1] * u, z: h.z + h.dir[0] * u, dir: h.dir }; };
    // two water carriers coming up the street, jars on their heads, a girl beside them
    walk('woman', 15.5, -1.75, 1.12, { add: bit('jarHead'), arms: 'jar' });
    walk('woman', 18.2, -2.3, 1.12, { add: bit('jarHead'), arms: 'jarBoth', A: mul(pal.oat, 0.95) });
    walk('girl', 16.9, -1.05, 1.12, { amp: 0.4 });
    // a donkey with two water jars, led west on the south side: the camera draws level with it
    const man = walk('worker', 10.4, 1.55, -1.08, { arms: 'lead', amp: 0.36 });
    const donkey = { kind: 'quad', species: 'donkey', mask: qbit('donkey', 'jars', 'pad'), A: C('donkey', 0.95), B: mul(pal.red, 0.8), seed: 0.31, base: 'walk' };
    st.walkOn(donkey, pathFor(1.75), sC - 8.3, -1.08, T0); put('merkes:animals', donkey, 0.95);
    rope(man, [-0.2, 0.86, 0.12], donkey, [0, 1.02, -0.98]);
    // children running up the street, a dog trotting down it
    walk('child', 25, 0.75, 2.5, { arms: 'child', amp: 0.5 }); walk('child', 27.4, -0.55, 2.6, { arms: 'child', amp: 0.5 });
    const dog = { kind: 'quad', species: 'dog', mask: qbit('dog'), A: C('woolOatmeal', 0.75), seed: 0.6, base: 'walk' };
    st.walkOn(dog, pathFor(-1.25), sC - 8.2, -1.75, T0); put('merkes:animals', dog, 0.95);
    // a porter far ahead, two men in talk on the south side, an old man sitting against the north wall with his wares
    walk('porter', 31, 0.9, -1.2, { add: bit('sack'), arms: 'sack' });
    { const p = at(21.5, 2.05); const g = st.group(p.x, p.z, null, 2, rng, ['man', 'elder']); note('merkes', g.length); }
    {
      const p = at(12.6, -2.5), f = seated(cast.dress('elder', rng, { arms: 'knees', del: bit('staff', 'mantle') }));
      st.fixed(f, p.x, st.standY(p.x, p.z), p.z, M.dirToAz(-p.dir[1], p.dir[0]));               // facing south, across the street
      put('merkes', f);
      const y = ground.height(p.x, p.z) + st.LIFT;
      props.mat(p.x + p.dir[0] * 1.0, y, p.z + p.dir[1] * 1.0, 1.3, 0.9, M.dirToAz(p.dir[0], p.dir[1]));
      props.basket(p.x + p.dir[0] * 0.85, y + 0.03, p.z + p.dir[1] * 0.85, 0.2, C('woolBrown', 0.6));
      props.basket(p.x + p.dir[0] * 1.3, y + 0.03, p.z + p.dir[1] * 1.3 + 0.15, 0.17, C('dyeSaffron', 0.8));
      props.jar(p.x - p.dir[0] * 0.8, y, p.z - p.dir[1] * 0.8, 0.55);
      props.jar(p.x - p.dir[0] * 1.25, y, p.z - p.dir[1] * 1.25 + 0.1, 0.38, [1.1, 1.05, 0.95]);
      props.bowl(p.x + p.dir[0] * 1.6, y + 0.03, p.z + p.dir[1] * 1.6 - 0.1, 0.13);
      note('props', 6);
    }
    // a woman at her door with a small child, on the frontage ahead of the camera
    {
      let best = null;
      for (const h of layout.housesNear(cam0[0] - 14, cam0[2], 32)) {
        if (!layout.isBuilt(h)) continue;
        const fac = layout.facade(h), d = fac && fac[h.doorSide] && fac[h.doorSide].door; if (!d) continue;
        const n = M.nearestOnPolyline(d.x, d.z, line), e = sC - n.s; if (e < 5.5 || e > 26 || n.dist > 4.6) continue;
        if (!best || Math.abs(e - 13) < Math.abs(best.e - 13)) best = { d, e, h, side: n.side };
      }
      if (best) {
        const d = best.d, dx = d.dir ? d.dir[0] : best.h.doorDir[0], dz = d.dir ? d.dir[1] : best.h.doorDir[1];
        const x = d.x + dx * 0.55, z = d.z + dz * 0.55, f = cast.dress('woman', rng, { base: 'stand', arms: 'door', del: bit('veil') });
        st.fixed(f, x, st.standY(x, z), z, M.dirToAz(dx, dz) + 25);
        put('merkes', f);
        const c = cast.dress('child', rng, { base: 'stand', scale: 0.56 }); st.fixed(c, x + dz * 0.7 + dx * 0.25, st.standY(x, z), z - dx * 0.7 + dz * 0.25, M.dirToAz(dx, dz) - 30); put('merkes', c);
        const y = ground.height(x, z) + st.LIFT;
        props.jar(d.x + dx * 0.3 - dz * 1.05, y, d.z + dz * 0.3 + dx * 1.05, 0.62); props.jar(d.x + dx * 0.28 - dz * 1.55, y, d.z + dz * 0.28 + dx * 1.55, 0.45, [0.95, 0.9, 0.85]);
        props.basket(d.x + dx * 0.35 + dz * 1.2, y, d.z + dz * 0.35 - dx * 1.2, 0.22, C('woolCream', 0.9));
        note('props', 3);
      }
    }
    // before the temple: worshippers on the forecourt, a man bringing two sheep
    {
      const fc = layout.squares.find((s) => s.use === 'forecourt' && Math.hypot(s.center[0] - 436, s.center[1] + 295) < 30);
      const c = fc ? fc.center : [437, -296];
      const g = st.group(c[0] + 6, c[1] - 1.5, null, 3, rng, ['man', 'woman', 'priest']); note('merkes', g.length);
      const g2 = st.group(c[0] - 3, c[1] - 2.5, null, 2, rng, ['woman', 'man']); note('merkes', g2.length);
      walk('woman', 34, -2.0, -1.0, { add: bit('basketHead'), arms: 'basket' });
      const herd = walk('man', 40, -0.9, -0.95, { add: bit('staff'), arms: 'staff' });
      for (const [de, u, sd] of [[-1.5, -1.5, 0.2], [-2.3, -0.4, 0.7]]) {
        const sheep = { kind: 'quad', species: 'sheep', mask: qbit('sheep'), A: C('sheep'), B: sd > 0.5 ? C('woolDark', 0.9) : C('sheep', 0.9), seed: sd, base: 'walk' };
        st.walkOn(sheep, pathFor(u), sC - 40 - de, -0.95, T0); put('merkes:animals', sheep);
      }
      if (herd) note('merkes', 0);
    }
  })();

  // ==============================================================================================================
  // Shot 8: the family on the roofs of the Great House; neighbours on their roofs as the light goes
  // ==============================================================================================================
  const roof = (function rooftop() {
    const sh = film.shots.find((s) => s.raw && s.raw.onRoofOf), house = layout.houses.find((h) => /Great House/.test(h.landmark || ''));
    if (!sh || !house) return null;
    const rng = rng0.fork('roof'), parts = layout.roofParts(house), stand = film.pathPoseAt(sh.tHold);
    const view = M.dirToAz(stand.look[0] - stand.pos[0], stand.look[2] - stand.pos[2]), [fx, fz] = M.azToDir(view), [rx, rz] = M.rightOf(fx, fz);
    const partAt = (x, z) => parts.find((p) => M.pointInPolygon(x, z, p.polygon) && !(p.holes || []).some((h) => M.pointInPolygon(x, z, h))) || null;
    const part0 = partAt(stand.pos[0], stand.pos[2]) || parts[0], Y = part0.level;
    /** a point `a` metres ahead and `r` metres to the right of the standpoint */
    const P = (a, r) => [stand.pos[0] + fx * a + rx * r, stand.pos[2] + fz * a + rz * r];
    const inside = (p, x, z, m = 0.5) => M.pointInPolygon(x, z, p.polygon) && M.distToRing(x, z, p.polygon) > m && !(p.holes || []).some((h) => M.pointInPolygon(x, z, h) || M.distToRing(x, z, h) < m);
    // how far ahead the roof ends (the kerb over the court), per lateral offset
    const edgeAhead = (r) => { let a = 0.5; while (a < 12 && inside(part0, ...P(a + 0.1, r), 0.02)) a += 0.1; return a; };
    const wool = (k) => mul(rng.pick([pal.cream, pal.oat, pal.brown]), k);
    const sit = (role, a, r, az, opts = {}) => { const [x, z] = P(a, r), f = seated(cast.dress(role, rng, opts)); st.fixed(f, x, Y, z, az); return put('roof:family', f, 0.9); };
    const lamps = [];
    // --- beside the camera: the family sits along the parapet over the court (0.72 m high, 0.62 m thick), their
    //     backs against it, a lamp, a jar, a blanket and the cat on top of it. Everything stays under 1.5 m.
    const PH = part0.parapet || 0.7, PT = 0.62, topY = Y + PH;
    const eh = M.nearestOnPolyline(...P(edgeAhead(0.5), 0.5), M.closeRing(part0.polygon)), edgeRot = M.dirToAz(eh.dir[0], eh.dir[1]) - 90;      // a box with this rotDeg lies along the parapet
    const face = (r) => edgeAhead(r) - PT;                                                    // distance ahead to the inner face of the parapet
    const back = view + 180;                                                                  // facing the camera
    // (integration round: the four sat with their backs to the parapet, facing the camera, so the hold opened on four
    //  half faces cut by the bottom of the frame. They now sit on the mat turned to the evening: all four watch the sun
    //  go down, their backs to the camera, the two at the ends turned a little toward each other.)
    sit('woman', face(-1.25) - 0.8, -1.25, view + 28, { arms: 'work', del: bit('veil'), A: mul(pal.linen, 0.95), B: mul(pal.blue, 0.9), hair: 0.02 });
    sit('girl', face(-0.45) - 0.72, -0.45, view - 12, { arms: 'knees' });
    sit('man', face(1.35) - 0.85, 1.35, view - 24, { arms: 'knees', A: wool(1), mask: bit('skirtShort', 'hairLong', 'beard', 'headband', 'mantle') });
    sit('elder', face(2.15) - 0.75, 2.15, view + 16, { arms: 'knees', del: bit('staff') });
    { const [x, z] = P(face(-2.05) - 0.3, -2.05), f = cast.dress('child', rng, { base: 'stand', scale: 0.62, arms: 'point' }); st.fixed(f, x, Y, z, view - 8); put('roof:family', f, 0.9); }
    {
      const [mx, mz] = P(face(0.4) - 0.85, 0.4); props.mat(mx, Y, mz, 4.6, 1.5, edgeRot, [1, 0.97, 0.9]);
      const [bx, bz] = P(face(0.45) - 0.55, 0.45); props.basket(bx, Y, bz, 0.2, C('woolCream', 1.0)); const [cx, cz] = P(face(-1.9) - 0.9, -1.2); props.jar(cx, Y, cz, 0.36, [1.05, 1.0, 0.92]);
      const [dx, dz] = P(face(0.5) - 1.0, 0.75); props.bowl(dx, Y + 0.02, dz, 0.12); note('props', 4);
    }
    // on the parapet: the cat, a lamp, a small jar, a blanket hung over it
    { const [x, z] = P(edgeAhead(0.62) - PT / 2, 0.62); const cat = { kind: 'quad', species: 'cat', mask: qbit('cat'), A: C('woolOatmeal', 0.62), seed: 0.2, base: 'stand', scale: 1.08 }; st.fixed(cat, x, topY, z, view + 105); put('roof:animals', cat, 0.6); }
    { const [x, z] = P(edgeAhead(-0.15) - PT / 2, -0.15); lamps.push([x, topY + 0.09, z]); props.bowl(x, topY, z, 0.075, [0.9, 0.85, 0.8]); note('props'); }
    { const [x, z] = P(edgeAhead(-1.9) - PT / 2, -1.9); props.rug(x, topY - 0.5, z, 0.9, PT + 0.08, edgeRot, mul(pal.red, 0.8), 0.53); props.rug(x + Math.sin((edgeRot + 90) * M.DEG) * 0.03, topY - 0.52, z - Math.cos((edgeRot + 90) * M.DEG) * 0.03, 0.42, PT + 0.1, edgeRot, wool(1.0), 0.56); note('props', 2); }
    { const [x, z] = P(edgeAhead(2.75) - PT / 2, 2.75); props.jar(x, topY, z, 0.34, [1.05, 1.0, 0.92]); note('props'); }
    // store jars on the floor at the far right, bedding at the left, where the camera does not land
    for (const [r, s2, bk] of [[2.75, 0.82, 0.5], [3.2, 0.6, 0.45], [2.9, 0.5, 1.05]]) { const [x, z] = P(face(r) - bk, r); if (inside(part0, x, z, 0.3)) { props.jar(x, Y, z, s2); note('props'); } }
    for (const [a2, r, rot] of [[0.9, -2.9, 20], [1.3, -3.5, 35]]) { const [x, z] = P(a2, r); if (inside(part0, x, z, 0.5)) { props.roll(x, Y, z, 1.5, view + rot, wool(0.95)); note('props'); } }
    // --- the lower roofs across the court: awning, loom, mats, the rest of the household -------------------------
    const byName = (n) => parts.find((p) => p.name === n);
    const west = byName('west part'), main = byName('main-room range'), north = byName('north range');
    const spot = (p, x, z, m = 0.7) => { if (!p) return null; for (let i = 0; i < 40; i++) { const px = x + (i ? rng.range(-0.35, 0.35) * Math.sqrt(i) : 0), pz = z + (i ? rng.range(-0.35, 0.35) * Math.sqrt(i) : 0); if (inside(p, px, pz, m)) return [px, pz]; } return null; };
    const onRoof = (p, role, x, z, az, opts = {}, m = 0.6) => { const q = spot(p, x, z, m); if (!q) return null; const f = cast.dress(role, rng, opts); if (opts.base === 'sit') seated(f); st.fixed(f, q[0], p.level, q[1], az); return put('roof:family', f); };
    if (west) {
      const wy = west.level, rot = house.rotationDeg || 0;
      const a = spot(west, 510.5, -231.5, 2.0);
      if (a) {
        props.awning(a[0], wy, a[1], 3.2, 2.6, rot, 2.05, mul(pal.oat, 0.9)); props.mat(a[0], wy, a[1], 2.6, 2.0, rot); note('props', 2);
        onRoof(west, 'woman', a[0] - 0.5, a[1] + 0.3, 80, { base: 'sit', arms: 'work' }, 0.3); onRoof(west, 'elder', a[0] + 0.6, a[1] - 0.4, 250, { base: 'sit', arms: 'knees', del: bit('staff') }, 0.3);
        props.jar(a[0] + 1.2, wy, a[1] + 0.9, 0.5); props.basket(a[0] - 1.0, wy, a[1] - 0.8, 0.24, C('woolBrown', 0.55)); note('props', 2);
        lamps.push([a[0] + 0.1, wy + 0.09, a[1] + 0.05]);
      }
      const l = spot(west, 513.5, -246.5, 1.3); if (l) { props.loom(l[0], wy, l[1], rot + 90, mul(pal.red, 0.85)); note('props'); onRoof(west, 'woman', l[0] - 1.0, l[1] - 0.2, 100, { base: 'sit', arms: 'work', del: bit('veil') }, 0.3); }
      const d = spot(west, 504.5, -214.5, 1.4); if (d) { props.mat(d[0], wy, d[1], 2.4, 1.6, rot + 15); props.heap(d[0] - 0.4, wy, d[1], 0.5, 0.14, C('woolBrown', 0.45)); props.heap(d[0] + 0.5, wy, d[1] + 0.2, 0.4, 0.1, C('dyeSaffron', 0.6)); note('props', 3); }
      onRoof(west, 'man', 515.2, -237.5, 95, { base: 'stand', arms: 'hips' });
      onRoof(west, 'woman', 512.8, -226.0, 60, { base: 'stand', add: bit('jarHead'), arms: 'jar' });
      onRoof(west, 'child', 509.0, -221.5, 130, { base: 'stand' }); onRoof(west, 'girl', 508.2, -222.6, 310, { base: 'stand', arms: 'talk' });
      for (const [x, z, rr] of [[499.5, -231.5, 10], [498.6, -243.5, 80], [506.5, -248.0, 0]]) { const q = spot(west, x, z, 0.9); if (q) { props.roll(q[0], wy, q[1], 1.6, rr, wool(0.9)); props.rug(q[0] + 0.9, wy, q[1] + 0.5, 1.7, 0.9, rr + 20, wool(1.0)); note('props', 2); } }
      const j = spot(west, 517.0, -230.0, 0.8); if (j) { props.jar(j[0], wy, j[1], 0.7); props.jar(j[0] + 0.5, wy, j[1] + 0.45, 0.5, [0.95, 0.9, 0.85]); note('props', 2); }
      // the ladder up from the lower roof to the camera's range leans on the north side, out of the way
      if (north) { const q = spot(north, 529.5, -243.2, 0.7); if (q) { props.ladder(q[0], north.level, q[1], 160, Y - north.level + 0.5, 1.1); note('props'); } }
    }
    if (main) {
      const my = main.level;
      onRoof(main, 'man', 515.6, -219.6, 40, { base: 'sit', arms: 'knees' }); onRoof(main, 'woman', 516.6, -218.6, 220, { base: 'sit', arms: 'work' });
      const q = spot(main, 516.1, -219.1, 0.8); if (q) { props.mat(q[0], my, q[1], 2.2, 1.6, 25); lamps.push([q[0] + 0.1, my + 0.09, q[1]]); note('props'); }
      const j = spot(main, 520.5, -214.5, 0.8); if (j) { props.jar(j[0], my, j[1], 0.8); props.jar(j[0] + 0.6, my, j[1] - 0.3, 0.6); props.basket(j[0] - 0.5, my, j[1] + 0.3, 0.26, C('woolCream', 0.95)); note('props', 3); }
    }
    if (north) {
      onRoof(north, 'worker', 524.5, -245.0, 200, { base: 'squat' }); onRoof(north, 'man', 527.0, -246.0, 150, { base: 'stand', arms: 'talk' });
      const q = spot(north, 522.0, -246.3, 0.9); if (q) { props.roll(q[0], north.level, q[1], 1.5, 70, wool(0.9)); note('props'); }
    }
    for (const l of lamps) ctx.emitters.add({ kind: 'lamp', pos: l, size: 0.5 });
    note('roof:lamps', lamps.length);
    return { stand, house, view };
  })();

  // neighbours on their roofs for the evening (from the flight into shot 8 on), each knot with a lamp of its own
  (function neighbours() {
    if (!roof) return;
    const rng = rng0.fork('neighbours'), sh = film.shots.find((s) => s.raw && s.raw.onRoofOf), c = roof.stand.pos, T = sh.tIn;
    const rooms = (ctx.modules.houses && ctx.modules.houses.roofRooms) || null;
    let lamps = 0;
    const hs = layout.housesNear(c[0] - 60, c[2], 190).filter((h) => h !== roof.house && layout.isBuilt(h)).sort((a, b) => a.id - b.id);
    for (const h of hs) {
      const d = Math.hypot(h.center[0] - c[0], h.center[1] - c[2]);
      if (!rng.chance(d < 70 ? 0.8 : d < 130 ? 0.5 : 0.3)) continue;
      const p = layout.roofPoint(h, rng, 1.3); if (!p) continue;
      const pr = layout.roofParts(h).find((q) => Math.abs(q.level - p.y) < 0.01 && M.pointInPolygon(p.x, p.z, q.polygon));
      if (pr && pr.kind === 'raised' && h.storeys === 2) continue;                                   // an upper room stands there
      if (rooms && Array.isArray(rooms) && rooms.some((r) => r && r.ring && M.pointInPolygon(p.x, p.z, r.ring))) continue;
      const n = rng.int(1, d < 90 ? 4 : 3), facing = rng.range(0, 360);
      for (let i = 0; i < n; i++) {
        const a = facing + i * 360 / Math.max(n, 2) + rng.range(-20, 20), r = n === 1 ? 0 : rng.range(0.7, 1.0), x = p.x + Math.sin(a * M.DEG) * r, z = p.z - Math.cos(a * M.DEG) * r;
        if (M.distToRing(x, z, h.footprint) < 0.9 || h.courts.some((q) => M.pointInPolygon(x, z, q) || M.distToRing(x, z, q) < 0.7)) continue;
        const role = rng.pick(['man', 'woman', 'woman', 'child', 'man', 'elder', 'girl']);
        const f = cast.dress(role, rng, {});
        const k = rng.next();
        if (i === 0 && n > 1) { f.base = 'squat'; f.mask &= ~bit('staff'); f.arms = null; }                      // the one who tends the lamp
        else if (k < 0.55 && role !== 'child') { seated(f); f.arms = rng.pick(['knees', 'work', 'talk']); f.mask &= ~bit('staff'); }
        else { f.base = 'stand'; f.arms = f.arms === 'staff' ? 'staff' : rng.pick([null, 'talk', 'hips', 'point']); }
        st.fixed(f, x, p.y, z, n === 1 ? rng.range(230, 310) : a + 180);
        f.t0 = T;
        put('roof:neighbours', f);
      }
      if (n > 1 && d < 150) { ctx.emitters.add({ kind: 'lamp', pos: [p.x, p.y + 0.09, p.z], size: 0.45 }); lamps++; }
    }
    note('roof:lamps', lamps);
  })();

  // ==============================================================================================================
  // Shot 5: crews of every boat, the tow teams, life on the banks, birds on the river
  // ==============================================================================================================
  (function river() {
    const rng = rng0.fork('river'), rc = ctx.modules.rivercraft, sh = film.shots.find((s) => s.raw && s.raw.ridesBoat);
    const camAt = sh ? film.pathPoseAt(sh.tHold).pos : [-150, 0, -335];
    if (rc && Array.isArray(rc.boats)) {
      for (const b of rc.boats) {
        if (!Array.isArray(b.crew) || typeof b.seatAt !== 'function') continue;
        const hero = b.id === rc.cameraBoat, brng = rng.fork('b' + b.id);
        for (let i = 0; i < b.crew.length; i++) {
          const place = b.crew[i], pose = place.pose || 'stand';
          if (b.moored && (i === 0 || !brng.chance(pose === 'sit' || pose === 'crouch' ? 0.45 : 0.15))) continue;
          if (hero && i === 3) continue;                                                     // the port thwart: only a head would show at the foot of the frame
          const f = cast.dress(pose === 'stand' && brng.chance(0.4) ? (brng.chance(0.5) ? 'man' : 'woman') : 'boatman', brng, {});
          if (pose === 'sit') { seated(f); f.arms = brng.pick(['knees', 'knees', 'work', 'talk']); }
          else if (pose === 'crouch') f.base = 'squat';
          else if (pose === 'pole' || pose === 'paddle') { f.base = 'pole'; f.arms = 'pole'; f.mask |= bit('pole'); }
          else if (pose === 'steer') { f.base = 'stand'; f.arms = 'steer'; }
          else f.base = 'stand';
          f.mask &= ~bit('staff');
          f.move = (t, S) => { const s = b.seatAt(i, t); S.x = s.x; S.y = s.y; S.z = s.z; S.az = s.headingDeg; };
          const s0 = b.seatAt(i, sh ? sh.tHold : 0); f.x = s0.x; f.y = s0.y; f.z = s0.z;
          if (hero) f.lodScale = 0.5;
          put(hero ? 'river:hero' : 'river:crews', f, hero ? 0.75 : 0.9);
        }
      }
      for (const tow of rc.tows || []) {
        for (let k = 0; k < tow.haulers; k++) {
          const f = cast.dress('worker', rng, { base: 'tow', arms: 'tow', amp: 0.30, mask: bit('skirtShort', rng.chance(0.5) ? 'hairShort' : 'hairLong', 'headband') + (rng.chance(0.6) ? bit('beard') : 0) });
          f.D = f.C;
          f.move = (t, S) => { const h = tow.haulerAt(t, k); S.x = h.x; S.y = h.y; S.z = h.z; S.az = h.headingDeg; S.s = 0.92 * t; };
          const h0 = tow.haulerAt(0, k); f.x = h0.x; f.y = h0.y; f.z = h0.z;
          put('river:tow', f);
        }
      }
    }
    // bank life on the quay walkway (riverworks) and beside the boats drawn up on the mud
    const rw = ctx.modules.riverworks;
    if (rw && Array.isArray(rw.walkways)) {
      for (const wk of rw.walkways) {
        const pl = wk.polyline; if (!pl || pl.length < 2) continue;
        const len = M.polylineLength(pl), y = wk.level !== undefined ? wk.level : -0.4, half = (wk.width || 1.65) / 2;
        // which side is the river
        const h0 = M.pointAlong(pl, len / 2), wet = ground.isWater(h0.x - h0.dir[1] * (half + 1.2), h0.z + h0.dir[0] * (half + 1.2)) ? 1 : -1;
        const nearCam = (s) => { const h = M.pointAlong(pl, s); return Math.hypot(h.x - camAt[0], h.z - camAt[2]); };
        const n = Math.round(len / 55);
        for (let i = 0; i < n; i++) {
          const s = rng.range(2, len - 2); if (nearCam(s) > 700) continue;
          const k = rng.next(), h = M.pointAlong(pl, s);
          if (k < 0.4) {                                                                    // a porter under a sack
            const f = cast.dress('porter', rng, { add: bit('sack'), arms: 'sack' }), off = -wet * rng.range(0.0, 0.3), path = st.makePath(pl, off, () => y);
            st.walkOn(f, path, s, rng.sign() * rng.range(0.95, 1.2), 0); put('river:bank', f);
          } else if (k < 0.72) {                                                            // a man fishing, legs over the edge
            const x = h.x - h.dir[1] * wet * (half - 0.08), z = h.z + h.dir[0] * wet * (half - 0.08);
            const f = cast.dress('worker', rng, { base: 'sitEdge', seat: 0.45, arms: 'knees' }); st.fixed(f, x, y - 0.45, z, M.dirToAz(-h.dir[1] * wet, h.dir[0] * wet)); put('river:bank', f);
          } else {                                                                          // two or three standing by the water
            const x = h.x + h.dir[1] * wet * 0.25, z = h.z - h.dir[0] * wet * 0.25;
            for (let j = 0, m = rng.int(1, 2); j < m; j++) { const f = cast.dress(rng.pick(['woman', 'man', 'worker', 'child']), rng, { base: 'stand' }); if (f.role === 'woman' && rng.chance(0.6)) { f.mask |= bit('jarHead'); f.arms = 'jar'; } st.fixed(f, x + h.dir[0] * j * 0.8, y, z + h.dir[1] * j * 0.8, M.dirToAz(-h.dir[1] * wet, h.dir[0] * wet) + rng.range(-50, 50)); put('river:bank', f); }
          }
        }
      }
    }
    if (rc && Array.isArray(rc.boats)) for (const b of rc.boats) {
      if (!b.beached) continue;
      const p = b.poseAt(0); if (Math.hypot(p.x - camAt[0], p.z - camAt[2]) > 600 || !rng.chance(0.6)) continue;
      const a = (p.headingDeg + 90) * M.DEG;
      for (const sgn of [1, -1]) {
        const x = p.x + Math.sin(a) * sgn * ((b.beam || 2) / 2 + 1.1), z = p.z - Math.cos(a) * sgn * ((b.beam || 2) / 2 + 1.1), g = ground.height(x, z);
        if (ground.isWater(x, z) || g < ground.waterLevel + 0.15 || !layout.isFree(x, z, 0.4)) continue;
        const f = cast.dress(rng.pick(['boatman', 'worker']), rng, { base: rng.chance(0.4) ? 'squat' : 'stand', arms: rng.pick([null, 'hips', 'work']) }); st.fixed(f, x, g + 0.02, z, p.headingDeg - sgn * 90 + rng.range(-30, 30)); put('river:bank', f); break;
      }
    }

    // --- birds of the river --------------------------------------------------------------------------------------
    const heronCol = C('linenWhite', 0.78), T5 = sh ? sh.tHold : 26.5, ride = sh ? film.rideAt(sh.n, T5) : null;
    const hd = ride ? ride.headingDeg : 189.5, [bx, bz] = M.azToDir(hd), [sx, sz] = M.rightOf(bx, bz);                // ahead, starboard
    const ahead = (a, r) => [camAt[0] + bx * a + sx * r, camAt[2] + bz * a + sz * r];
    // two herons crossing low ahead of the boat during the hold
    for (const [a0, r0, a1, r1, y, tt, sd] of [[95, -75, 55, 70, 2.6, 1.3, 0.1], [130, 85, 70, -90, 4.2, 2.3, 0.6]]) {
      const A = ahead(a0, r0), Bp = ahead(a1, r1), L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), v = 9.5, az = st.azTo(A[0], A[1], Bp[0], Bp[1]);
      const f = { kind: 'bird', scale: 2.6, mask: bbit('spread', 'heronNeck', 'heronLegs'), base: 'fly', flapHz: 2.3, flapAmp: 0.55, tuck: 1, A: heronCol, seed: sd };
      f.move = (t, S) => { const s = L * 0.5 + v * (t - (T5 + tt)); S.x = A[0] + (Bp[0] - A[0]) * s / L; S.z = A[1] + (Bp[1] - A[1]) * s / L; S.y = ground.waterLevel + y + 0.25 * Math.sin(t * 2.3 * 6.283 + sd * 6.28 + 1.2); S.az = az; };
      f.x = A[0]; f.y = y; f.z = A[1]; put('birds', f, 1.5);
    }
    // herons standing in the shallows of the west bank and on mud by the water
    let standing = 0;
    for (let i = 0; i < 400 && standing < 4; i++) {
      const [x, z] = ahead(rng.range(40, 330), rng.range(30, 110)), g = ground.height(x, z), d = ground.waterLevel - g;
      if (d < 0.02 || d > 0.42) continue;                                                              // wading depth
      const f = { kind: 'bird', scale: 2.6, mask: bbit('folded', 'heronNeck', 'heronLegs'), base: 'stand', A: heronCol, seed: rng.next() };
      st.fixed(f, x, g + 0.52, z, rng.range(0, 360)); put('birds', f, 1.5); standing++;
    }
    // ducks on the water off the bow: a few close under it, more ahead
    for (let i = 0; i < 13; i++) {
      const close = i < 6, [x0, z0] = ahead(close ? rng.range(11, 27) : rng.range(28, 80), (close ? rng.range(5.5, 15) : rng.range(8, 36)) * (i % 2 ? 1 : -1)), az = rng.range(0, 360), v = rng.range(0.15, 0.4), sd = rng.next(), [dx, dz] = M.azToDir(az);
      if (!ground.isWater(x0, z0)) continue;
      const f = { kind: 'bird', scale: 1.5, mask: bbit('folded'), base: 'stand', A: C('woolBrown', rng.range(0.6, 0.9)), seed: sd };
      f.move = (t, S) => { S.x = x0 + dx * v * (t - T5); S.z = z0 + dz * v * (t - T5); S.y = ctx.water.heightAt(S.x, S.z, t) + 0.045; S.az = az + 12 * Math.sin(t * 0.7 + sd * 9); };
      f.x = x0; f.y = ground.waterLevel; f.z = z0; put('birds', f, 1.2);
    }
    // swallows hawking over the water
    for (let i = 0; i < 9; i++) {
      const [cx, cz] = ahead(i < 3 ? rng.range(12, 24) : rng.range(25, 110), i < 3 ? rng.range(-12, 12) : rng.range(-45, 45)), R = i < 3 ? rng.range(7, 11) : rng.range(9, 20), w = rng.sign() * rng.range(0.9, 1.5), ph = rng.range(0, 6.28), y0 = ground.waterLevel + rng.range(1.2, 5), sd = rng.next();
      const f = { kind: 'bird', scale: 0.5, mask: bbit('spread'), base: 'fly', flapHz: 7, flapAmp: 0.8, glide: 2.2, A: [0.03, 0.035, 0.05], seed: sd };
      f.move = (t, S) => { const a = ph + w * t, k = 1 + 0.35 * Math.sin(2 * a + sd * 5); S.x = cx + R * k * Math.cos(a); S.z = cz + R * Math.sin(a); S.y = y0 + 1.1 * Math.sin(1.7 * a + sd * 4); S.az = Math.atan2(-Math.sin(a) * w, -Math.cos(a) * w) * 57.2958; S.bank = -0.6 * Math.sign(w); };
      f.x = cx; f.y = y0; f.z = cz; put('birds', f, 1.5);
    }
  })();

  props.flush();
  return { counts, update(frame) { for (const u of updates) u(frame); }, roof };
}
