// js/modules/esagila/index.js — Esagila, the temple of Marduk, and its eastern annex (SPEC 3.12, R3 3.4 / 4.3).
// Claims monument:esagila and monument:esagilaAnnex. Notes: docs/mod-esagila.md.
//
// Everything is placed from world.json (footprint polygons, court, gate points, floor and wall levels) through
// ctx.W; ground levels come from ctx.ground. What is NOT in the record (roof levels inside the wall ring, door and
// tower rhythm of the courts, altars, standards, fires) is the plainest reading of R3 and is listed in the note.
//
// Files: index.js (plan, main building, annex, furniture, submission), night.js (fire-light hook, glow mesh).
import { hash2 } from '../../core/rng.js';
import { installNight } from './night.js';

// ------------------------------------------------------------------------------------------------ plan ----
/** A plan edge a -> b of a CLOCKWISE ring: d = unit direction, n = outward (left of travel) = the way its face looks. */
function edgeOf(M, a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const e = { a, b, len, d, n: [d[1], -d[0]] };
  e.rot = Math.atan2(d[1], d[0]) * 180 / Math.PI;       // rotDeg of a box whose local x runs along the edge
  e.az = M.dirToAz(e.n[0], e.n[1]);                     // model azimuth the face looks along
  e.at = (s, o = 0) => [a[0] + d[0] * s + e.n[0] * o, a[1] + d[1] * s + e.n[1] * o];
  e.sOf = (p) => (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1];
  e.oOf = (p) => (p[0] - a[0]) * e.n[0] + (p[1] - a[1]) * e.n[1];
  return e;
}

/** Everything that is pure plan data: used by prepare() (reservations) and build(). */
function planOf(ctx) {
  const { W, mathx: M } = ctx;
  const mm = W.monument('esagila'), ma = W.monument('esagilaAnnex');
  const cw = (ring) => { const r = M.openRing(ring).map((p) => [p[0], p[1]]); return M.polygonArea(r) > 0 ? r : r.reverse(); };
  const P = cw(mm.footprint.polygon);
  let A = cw(ma.footprint.polygon);
  const edges = (R) => R.map((p, i) => edgeOf(M, p, R[(i + 1) % R.length]));
  const PE = edges(P);
  const nearest = (E, pt) => {
    let best = null;
    E.forEach((e, k) => { const s = Math.min(e.len, Math.max(0, e.sOf(pt))), q = e.at(s), dist = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (!best || dist < best.dist) best = { k, s, o: e.oOf(pt), dist }; });
    return best;
  };
  // the annex edge that lies on the main building (shared wall): rotate the ring so that it is the LAST edge
  let shared = 0, bestD = Infinity;
  edges(A).forEach((e, k) => { const m = e.at(e.len / 2), d = Math.abs(M.signedDistToPolygon(m[0], m[1], M.closeRing(P))); if (d < bestD) { bestD = d; shared = k; } });
  A = A.map((_, i) => A[(i + shared + 1) % A.length]);
  const AE = edges(A);
  // gates of the main building by side
  const mg = {};
  for (const [key, pt] of Object.entries(mm.dims.gates)) {
    const side = /north/i.test(key) ? 'N' : /south/i.test(key) ? 'S' : /west/i.test(key) ? 'W' : 'E';
    mg[side] = { key, pt, ...nearest(PE, pt) };
  }
  const ag = {};
  for (const [key, pt] of Object.entries(ma.dims.gates)) ag[key[0]] = { key, pt, ...nearest(AE.slice(0, AE.length - 1), pt) };
  // reservations: approaches and forecourts that houses must not use
  const quad = (e, s0, s1, o0, o1) => [e.at(s0, o0), e.at(s1, o0), e.at(s1, o1), e.at(s0, o1)];
  const reserves = [];
  const eF = AE[ag.F.k], eG = AE[ag.G.k], eE = AE[ag.E.k], eH = AE[ag.H.k];
  reserves.push({ kind: 'forecourt', ring: quad(eF, ag.F.s - 19, ag.F.s + 19, 0.3, 21) });
  reserves.push({ kind: 'approach', ring: quad(eG, ag.G.s - 8, ag.G.s + 8, 0.3, 7.5) });
  reserves.push({ kind: 'approach', ring: quad(eE, ag.E.s - 6.5, ag.E.s + 7, 0.3, 9) });
  reserves.push({ kind: 'approach', ring: quad(eH, -1, eH.len + 1.2, 0.3, 47) });
  reserves.push({ kind: 'approach', ring: quad(PE[mg.N.k], mg.N.s - 12, mg.N.s + 13, 0.5, 11) });
  reserves.push({ kind: 'approach', ring: quad(PE[mg.S.k], mg.S.s - 12, mg.S.s + 28, 0.5, 14) });
  reserves.push({ kind: 'approach', ring: quad(PE[mg.W.k], mg.W.s - 9, mg.W.s + 9, 0.5, 8.5) });
  return { mm, ma, P, A, PE, AE, mg, ag, reserves, quad };
}

export default {
  name: 'esagila',
  claims: ['monument:esagila', 'monument:esagilaAnnex'],

  /** Forecourt before the Ka-mah gate and the approaches to the other gates: houses keep clear of them. */
  prepare(ctx) {
    const plan = planOf(ctx);
    for (const r of plan.reserves) ctx.layout.reserve(ctx.mathx.closeRing(r.ring), { owner: 'esagila', kind: r.kind, margin: 0.5 });
  },

  async build(ctx) {
    const { geom, ground, materials, mathx: M, THREE } = ctx;
    const plan = planOf(ctx), { mm, ma, P, A, PE, AE, mg, ag, quad } = plan;
    const edge = (a, b) => edgeOf(M, a, b);
    const md = mm.dims, ad = ma.dims;

    // ---------------------------------------------------------------------------------------- levels ----
    const FL = md.floorLevel;                         // +4.4: floors of Nebuchadnezzar
    const TOP = md.wallTopLevel;                      // +20.9: 16.5 m above the floor = the tips of the merlons
    const MER = 0.9;                                  // merlon height (SPEC: under 1 m)
    const PAR = TOP - MER, WALK = PAR - 0.9;          // parapet top and wall-walk of the outer wall
    const ROOF = WALK - 1.7, CPAR = ROOF + 0.9;       // room roofs inside the wall ring; parapet of the court
    const KISU = FL + 1.5;                            // top of the baked-brick socle (2.4 to 2.9 m above the ground outside)
    const TWR = PAR + 1.5;                            // platforms of gate towers and corner bastions
    const CEL = PAR + 0.3;                            // roof of Marduk's cella block
    const A_TOP = ad.floorLevel + ad.wallHeight;      // +19.4 annex: 15 m above the floor (merlon tips)
    const A_PAR = A_TOP - MER, A_ROOF = A_PAR - 0.9, A_CPAR = A_ROOF + 0.7;
    const gAt = (p) => ground.height(p[0], p[1]);
    const gMin = Math.min(...[...P, ...A].map(gAt), ...PE.map((e) => gAt(e.at(e.len / 2, 4))), ...AE.map((e) => gAt(e.at(e.len / 2, 4))));
    const BASE = gMin - 1.6;                          // every shell goes this far into the ground

    // ------------------------------------------------------------------------------------- materials ----
    // own variants (same look as the palette ids) so that the fire-light hook of night.js reaches exactly these
    const info = { esagilaFire: true };
    const mat = {
      plaster: materials.variant('templePlasterWhite', { name: 'esagila-plaster', info }),
      brick: materials.variant('bakedBrickBuff', { name: 'esagila-kisu', info }),
      paving: materials.variant('courtBrickPaving', { name: 'esagila-paving', info }),
      roof: materials.variant('roofEarth', { name: 'esagila-roof', info }),
      cedar: materials.preset('planks', { name: 'esagila-cedar', vertical: true, info }),
      bronze: materials.variant('bronze', { name: 'esagila-bronze', info }),
      pottery: materials.preset('pottery', { name: 'esagila-pottery', info }),
      ember: materials.variant('ember', { name: 'esagila-ember', night: 11, day: 0.003, vertexColors: false }),
    };
    const parts = { plaster: [], brick: [], paving: [], roof: [], cedar: [], bronze: [], pottery: [], ember: [] };
    const put = (k, g, tint) => { if (!g) return g; if (tint) geom.paint(g, tint); parts[k].push(g); return g; };
    const DADO = [0.105, 0.098, 0.092];               // bitumen wash at the foot of court walls ("black-banded interior")
    const VOID = [0.045, 0.04, 0.036];                // the dark of a room behind an open door
    const BAND = [1, 1, 1];
    const tone = (i, j) => { const k = 0.955 + 0.045 * hash2(i, j, 911); return [k, k, k * 0.995]; };

    const merlonLines = [];                           // { line, y, steps, offset, strip }
    const fires = [];                                 // sources of the fire-light hook
    const glow = { position: [], color: [], index: [] };
    const stats = { gates: 0, towers: 0, doors: 0, emitters: 0, fires: 0 };

    // ------------------------------------------------------------------------------------- small kit ----
    const ebox = (e, s0, s1, o0, o1, y0, y1, bottom = false) => {
      const c = e.at((s0 + s1) / 2, (o0 + o1) / 2);
      return geom.box({ x: c[0], z: c[1], y0, y1, sx: Math.abs(s1 - s0), sz: Math.abs(o1 - o0), rotDeg: e.rot, bottom });
    };
    const ering = (e, pts) => pts.map(([s, o]) => e.at(s, o));
    /** a box of wall with the black dado at its foot (two boxes, no overlap) */
    const wallBox = (e, s0, s1, o0, o1, y0, y1, dado, tint) => {
      if (s1 - s0 < 0.02) return;
      if (dado && dado > y0 && dado < y1) { put('plaster', ebox(e, s0, s1, o0, o1, y0, dado), DADO); put('plaster', ebox(e, s0, s1, o0, o1, dado, y1), tint); }
      else put('plaster', ebox(e, s0, s1, o0, o1, y0, y1), tint);
    };
    /** block on a ring: walls to `roof`, a parapet to `parTop`, a mud roof behind it, merlons */
    const block = (ring, base, roof, parTop, { t = 0.55, merlon = true, steps = 3, tint = null, strip = false } = {}) => {
      const r = M.openRing(ring), sgn = M.polygonArea(r) > 0 ? 1 : -1;
      put('plaster', geom.prism(r, base, roof, { top: false }), tint);
      put('plaster', geom.wall(r, { closed: true, thickness: t, offset: sgn * t / 2, base: roof, top: parTop }), tint);
      put('roof', geom.cap(geom.insetRing(r, t - 0.05), roof));
      if (merlon) merlonLines.push({ line: M.closeRing(geom.insetRing(r, 0.28)), y: parTop, steps, strip });
    };
    /** tessellated horizontal rectangle in a local frame (so that the baked AO has vertices to live on) */
    const gridCap = (c, rot, x0, z0, x1, z1, y, cell = 3) => {
      const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell)), pos = [], nor = [], idx = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const p = M.localToWorld(c, rot, x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz); pos.push(p[0], y, p[1]); nor.push(0, 1, 0); }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
      return geom.custom({ position: pos, index: idx, normal: nor });
    };
    const lathe = (profile, seg = 12) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const place = (g, x, y, z, rotDeg = 0, scale = 1) => geom.transform(g, { x, y, z, rotDeg, scale });

    // ---------------------------------------------------------------------------------- fires, glow ----
    const FIRE = new THREE.Color('#FF9C40'), FC = [FIRE.r, FIRE.g, FIRE.b];
    const ROOM = new THREE.Color('#FFAA52'), RC_ = [ROOM.r, ROOM.g, ROOM.b];
    const seedOf = (x, z) => hash2(Math.round(x * 10), Math.round(z * 10), 77);
    const addFire = (kind, x, y, z) => {
      const seed = seedOf(x, z);
      if (kind === 'bowl') { fires.push({ pos: [x, y + 0.55, z], reach: 12, power: 5.2, color: FC, seed }); ctx.emitters.add({ kind: 'fireBowl', pos: [x, y + 0.2, z], size: 1.7 }); stats.emitters++; }
      else if (kind === 'brazier') { fires.push({ pos: [x, y + 0.45, z], reach: 7.5, power: 4.2, color: FC, seed }); ctx.emitters.add({ kind: 'brazier', pos: [x, y + 0.15, z], size: 1.2 }); stats.emitters++; }
      else if (kind === 'lamp') { fires.push({ pos: [x, y + 0.2, z], reach: 4.2, power: 2.6, color: FC, seed }); ctx.emitters.add({ kind: 'lamp', pos: [x, y + 0.08, z], size: 0.6 }); stats.emitters++; }
      else fires.push({ pos: [x, y, z], reach: kind === 'hall' ? 10 : 6.5, power: kind === 'hall' ? 3.0 : 2.0, color: RC_, seed, steady: true });   // light of a lit room through its door
    };
    const glowQuad = (p, c) => { const b = glow.position.length / 3; for (let i = 0; i < 4; i++) { glow.position.push(p[i][0], p[i][1], p[i][2]); glow.color.push(c[i][0], c[i][1], c[i][2]); } glow.index.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    /** the glow of a lit room in a door opening: brighter low down (lamps stand on the floor) */
    const doorGlow = (e, s, hw, o, y0, y1, k) => {
      const xs = [-1, -0.45, 0.45, 1], ys = [0, 0.3, 0.65, 1], kx = [0.6, 1, 1, 0.6], ky = [1, 0.85, 0.5, 0.26];
      const P = (i, j) => { const p = e.at(s + xs[i] * hw, o); return [p[0], y0 + (y1 - y0) * ys[j], p[1]]; };
      const C = (i, j) => RC_.map((v) => v * k * kx[i] * ky[j]);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) glowQuad([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], [C(i, j), C(i + 1, j), C(i + 1, j + 1), C(i, j + 1)]);
    };
    /** spill of light on the ground outside a gate: a fan, brightest at the sill */
    const spill = (e, s, o, radius, k, lift = 0.22) => {
      const c = e.at(s, o), b = glow.position.length / 3, N = 9, col = RC_.map((v) => v * k);
      glow.position.push(c[0], gAt(c) + lift, c[1]); glow.color.push(col[0], col[1], col[2]);
      for (let i = 0; i <= N; i++) {
        const a = (-62 + (124 * i) / N) * Math.PI / 180, p = e.at(s + Math.sin(a) * radius, o + Math.cos(a) * radius);
        glow.position.push(p[0], gAt(p) + lift, p[1]); glow.color.push(0, 0, 0);
        if (i > 0) glow.index.push(b, b + i, b + i + 1);
      }
    };

    // --------------------------------------------------------------------------------------- props ----
    const fireBowl = (x, z, y, rot = 0) => {
      put('brick', geom.box({ x, z, y0: y - 0.4, y1: y + 0.95, sx: 0.95, sz: 0.95, rotDeg: rot }));
      put('brick', geom.box({ x, z, y0: y + 0.95, y1: y + 1.1, sx: 1.25, sz: 1.25, rotDeg: rot, bottom: true }));
      put('bronze', place(lathe([[0.0, 0], [0.3, 0], [0.5, 0.16], [0.64, 0.42], [0.58, 0.42], [0.46, 0.2], [0.0, 0.16]], 14), x, y + 1.1, z));
      put('ember', place(new THREE.SphereGeometry(0.56, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(0, 0.4, 0), x, y + 1.1, z));
      addFire('bowl', x, y + 1.55, z);
    };
    const brazier = (x, z, y) => {
      for (let i = 0; i < 3; i++) { const a = (i * 120 + 30) * Math.PI / 180; put('bronze', geom.box({ x: x + Math.cos(a) * 0.24, z: z + Math.sin(a) * 0.24, y0: y - 0.05, y1: y + 0.62, sx: 0.06, sz: 0.06, rotDeg: i * 120 })); }
      put('bronze', place(lathe([[0.0, 0], [0.2, 0], [0.34, 0.1], [0.4, 0.3], [0.36, 0.3], [0.28, 0.14], [0.0, 0.1]], 12), x, y + 0.6, z));
      put('ember', place(new THREE.SphereGeometry(0.35, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.28, 0), x, y + 0.6, z));
      addFire('brazier', x, y + 0.95, z);
    };
    const lampStand = (x, z, y) => {
      put('brick', geom.box({ x, z, y0: y - 0.2, y1: y + 0.7, sx: 0.4, sz: 0.4 }));
      put('pottery', place(lathe([[0.0, 0], [0.09, 0], [0.16, 0.05], [0.14, 0.09], [0.0, 0.07]], 8), x, y + 0.7, z));
      addFire('lamp', x, y + 0.82, z);
    };
    /** standard of Marduk: a cedar pole on a brick base with the bronze spade (marru). Conjectural (see the note). */
    const emblemPole = (x, z, y, rot, h = 8.6) => {
      put('brick', geom.box({ x, z, y0: y - 0.5, y1: y + 0.8, sx: 1.2, sz: 1.2, rotDeg: rot }));
      put('brick', geom.box({ x, z, y0: y + 0.8, y1: y + 0.98, sx: 0.9, sz: 0.9, rotDeg: rot }));
      put('cedar', place(new THREE.CylinderGeometry(0.095, 0.14, h, 8).translate(0, h / 2, 0), x, y + 0.98, z));
      const top = y + 0.98 + h;
      put('bronze', place(new THREE.CylinderGeometry(0.15, 0.17, 0.34, 8).translate(0, 0.17, 0), x, top - 0.1, z));
      put('bronze', geom.box({ x, z, y0: top + 0.2, y1: top + 0.3, sx: 0.95, sz: 0.1, rotDeg: rot, bottom: true }));
      const blade = new THREE.ConeGeometry(0.44, 1.35, 4).rotateY(Math.PI / 4).scale(1, 1, 0.2).translate(0, 0.675, 0);
      put('bronze', place(blade, x, top + 0.3, z, rot));
      for (const sx of [-1, 1]) {            // tassels of the crossbar
        const p = M.localToWorld([x, z], rot, sx * 0.42, 0);
        put('bronze', geom.box({ x: p[0], z: p[1], y0: top - 0.25, y1: top + 0.2, sx: 0.07, sz: 0.07, rotDeg: rot, bottom: true }));
      }
    };
    /** brick altar on two steps with a whitened table (R3: altars of baked brick before temple doors) */
    const altar = (x, z, y, rot, k = 1) => {
      put('brick', geom.box({ x, z, y0: y - 0.4, y1: y + 0.22, sx: 3.6 * k, sz: 3.0 * k, rotDeg: rot }));
      put('brick', geom.box({ x, z, y0: y + 0.22, y1: y + 0.44, sx: 3.0 * k, sz: 2.4 * k, rotDeg: rot }));
      put('plaster', geom.box({ x, z, y0: y + 0.44, y1: y + 1.3, sx: 2.2 * k, sz: 1.6 * k, rotDeg: rot }));
      put('plaster', geom.box({ x, z, y0: y + 1.3, y1: y + 1.46, sx: 2.5 * k, sz: 1.9 * k, rotDeg: rot, bottom: true }));
      put('plaster', geom.box({ x, z, y0: y + 1.46, y1: y + 1.5, sx: 2.1 * k, sz: 1.5 * k, rotDeg: rot }), DADO);     // the bitumen-coated top
    };
    const jarProfile = [[0.0, 0], [0.16, 0], [0.3, 0.3], [0.33, 0.62], [0.22, 0.86], [0.14, 0.92], [0.17, 1.0], [0.12, 1.0], [0.0, 0.9]];
    const jar = (x, z, y, s = 1, tint = null) => put('pottery', place(lathe(jarProfile, 10), x, y, z, 0, s), tint);

    // ------------------------------------------------------------------------- decorated wall faces ----
    /**
     * A wall face with real door openings: a veneer `t` thick behind the face line of `e` (which looks along e.n),
     * panels between the doors, lintels, a stepped inner frame, the door (cedar leaves with bronze bands, or the
     * dark of the room), pilaster-towers in front. doors: [{ s, w, top, kind: 'leaf' | 'void', glow }], pil: [{ s, w, p, top }].
     */
    const facade = (e, { s0 = 0, s1 = e.len, t = 0.7, y0, y1, dado = 0, doors = [], pil = [], id = 0 }) => {
      const ds = doors.filter((d) => d.s - d.w / 2 > s0 - 1e-6 && d.s + d.w / 2 < s1 + 1e-6).sort((a, b) => a.s - b.s);
      let cur = s0, n = 0;
      for (const d of ds) {
        const a = d.s - d.w / 2, b = d.s + d.w / 2, fw = d.w > 2.6 ? 0.34 : 0.26;
        wallBox(e, cur, a, -t, 0, y0, y1, dado, tone(id, n++));
        put('plaster', ebox(e, a, b, -t, 0, d.top, y1, true), tone(id, n++));                       // lintel
        wallBox(e, a, a + fw, -t, -0.3, y0, d.top, dado);                                            // stepped frame
        wallBox(e, b - fw, b, -t, -0.3, y0, d.top, dado);
        put('plaster', ebox(e, a + fw, b - fw, -t, -0.3, d.top - fw, d.top, true));
        const da = a + fw, db = b - fw, dt = d.top - fw;
        if (d.kind === 'leaf') {
          put('plaster', ebox(e, da, db, -t - 0.06, -t, y0, dt), VOID);                                 // what shows when the leaves are beyond their LOD band
          put('cedar', ebox(e, da, db, -t, -t + 0.1, y0, dt));
          for (const f of [0.14, 0.5, 0.86]) put('bronze', ebox(e, da, db, -t + 0.1, -t + 0.13, FL + (dt - FL) * f - 0.07, FL + (dt - FL) * f + 0.07, true));
          put('bronze', ebox(e, (da + db) / 2 - 0.035, (da + db) / 2 + 0.035, -t + 0.1, -t + 0.12, FL, dt, true));
        } else {
          put('plaster', ebox(e, da, db, -t, -t + 0.06, y0, dt), VOID);
          if (d.glow) {
            doorGlow(e, d.s, (db - da) / 2, -t + 0.1, FL, dt, d.glow);
            const p = e.at(d.s, 0.5); addFire(d.w > 2.6 ? 'hall' : 'room', p[0], FL + Math.min(2.6, (dt - FL) * 0.5), p[1]);
          }
        }
        stats.doors++;
        cur = b;
      }
      wallBox(e, cur, s1, -t, 0, y0, y1, dado, tone(id, n++));
      for (const p of pil) {
        if (p.s - p.w / 2 < s0 - 1e-6 || p.s + p.w / 2 > s1 + 1e-6) continue;
        wallBox(e, p.s - p.w / 2, p.s + p.w / 2, 0, p.p, y0, p.top ?? y1, dado, tone(id, n++));
        if (p.cap) {                                                                                  // a tower that rises above the parapet
          put('plaster', ebox(e, p.s - p.w / 2, p.s + p.w / 2, -t, 0, p.capFrom, p.top));
          merlonLines.push({ line: [e.at(p.s - p.w / 2 + 0.05, p.p - 0.3), e.at(p.s + p.w / 2 - 0.05, p.p - 0.3)], y: p.top, steps: 2, pitch: (p.w - 0.1) / 2 });
        }
        stats.towers++;
      }
    };
    /** drain spouts of fired clay just under the roof line of a court face, clear of the towers */
    const spouts = (e, roof, pil, n, seed) => {
      for (let i = 0; i < n; i++) {
        let s = e.len * (i + 0.5 + 0.3 * (hash2(i, seed, 41) - 0.5)) / n;
        for (const p of pil) if (Math.abs(p.s - s) < p.w / 2 + 0.4) s = p.s + (s < p.s ? -1 : 1) * (p.w / 2 + 0.5);
        if (s < 0.6 || s > e.len - 0.6) continue;
        const q = e.at(s, 0);
        put('pottery', geom.spout({ x: q[0], y: roof - 0.22, z: q[1], azDeg: e.az, length: 0.75, width: 0.2, height: 0.14, drop: 0.09 }), [0.82, 0.74, 0.64]);
      }
    };
    /** alternating towers and doors along a face (R3: "doorways and towers are symmetrically alternated") */
    const rhythm = (len, { s0 = 0, s1 = len, bay = 6.0, tw = 2.3, tp = 0.45, dw = 2.0, dh = 4.4, top, keep = [], seed = 1, leaf = 0.6, glow = 0.35, ends = false }) => {
      const n = Math.max(1, Math.round((s1 - s0) / bay)), bl = (s1 - s0) / n, doors = [], pil = [];
      const free = (s, w) => keep.every(([a, b]) => s + w / 2 < a || s - w / 2 > b);
      for (let i = ends ? 0 : 1; i <= (ends ? n : n - 1); i++) { const s = s0 + i * bl; if (free(s, tw)) pil.push({ s, w: tw, p: tp, top }); }
      for (let i = 0; i < n; i++) {
        const s = s0 + (i + 0.5) * bl; if (!free(s, dw)) continue;
        const h = hash2(i, seed, 313), isLeaf = h < leaf;
        doors.push({ s, w: dw, top: FL + dh, kind: isLeaf ? 'leaf' : 'void', glow: !isLeaf && hash2(i, seed, 517) < glow / (1 - leaf) ? 0.3 + 0.3 * hash2(i, seed, 71) : 0 });
      }
      return { doors, pil };
    };

    // ------------------------------------------------------------------------------- gates and ramps ----
    /**
     * Tower-flanked gateway on edge `e` at chainage s (geom.gateway), with mud roofs on its platforms, a brick skirt
     * round the tower feet, the paved passage, the dark of the vestibule and its glow at night.
     * spec: { width, tower, door, crown, front, back (offsets from the edge line, outward positive), proj, top, towerTop,
     *         rebates, base, skirt (level or 0), reveal (depth of the visible passage), glow, grooves }
     */
    const gate = (e, s, spec) => {
      const depth = spec.front - spec.back, c = e.at(s, (spec.front + spec.back) / 2), inner = spec.width / 2 - spec.tower;
      const gw = geom.gateway({ x: c[0], z: c[1], facingDeg: e.az, width: spec.width, depth, base: spec.base ?? BASE, floor: FL, top: spec.top,
        towerWidth: spec.tower, towerDepth: depth + spec.proj, towerProjection: spec.proj, towerTop: spec.towerTop,
        door: { width: spec.door, height: spec.crown, arch: true }, rebates: spec.rebates, parapet: 0.9, parapetThickness: 0.5,
        grooves: spec.grooves ?? { count: 3, width: 0.4, depth: 0.28, gap: Math.min(1.5, (spec.tower - 1.6) / 3) } });
      put('plaster', gw.geometry);
      for (const ml of gw.merlonLines) merlonLines.push({ line: ml.line, y: ml.y, steps: 3 });
      put('roof', geom.cap(ering(e, [[s - inner, spec.back + 0.5], [s + inner, spec.back + 0.5], [s + inner, spec.front - 0.5], [s - inner, spec.front - 0.5]]), spec.top + 0.06));
      for (const sx of [-1, 1]) {
        const a = s + sx * (inner + 0.5), b = s + sx * (spec.width / 2 - 0.5), lo = Math.min(a, b), hi = Math.max(a, b);
        put('roof', geom.cap(ering(e, [[lo, spec.back + 0.5], [hi, spec.back + 0.5], [hi, spec.front + spec.proj - 0.5], [lo, spec.front + spec.proj - 0.5]]), spec.towerTop + 0.06));
        if (spec.skirt) {
          const k0 = s + sx * (inner - 0.2), k1 = s + sx * (spec.width / 2 + 0.2);
          put('brick', ebox(e, Math.min(k0, k1), Math.max(k0, k1), spec.skirtBack ?? spec.front - 1.4, spec.front + spec.proj + 0.2, spec.base ?? BASE, spec.skirt));
        }
      }
      const hw = spec.door / 2, wide = hw + spec.rebates * 0.35, reveal = Math.min(spec.reveal ?? 3.2, depth - 0.25), vo = spec.front - reveal;
      put('paving', geom.cap(ering(e, [[s - wide, vo], [s + wide, vo], [s + wide, spec.front], [s - wide, spec.front]]), FL));
      put('plaster', ebox(e, s - hw - 0.3, s + hw + 0.3, vo - 0.1, vo, FL - 0.3, FL + spec.crown + 0.4), VOID);
      if (spec.glow) {
        doorGlow(e, s, hw, vo + 0.06, FL, FL + spec.crown, spec.glow);
        const p = e.at(s, spec.front - 0.6); addFire('hall', p[0], FL + 3.0, p[1]);
      }
      stats.gates++;
      return { inner, depth };
    };
    /** paved ramp from the floor at offset o0 down to the ground at offset o1, balustrades with end piers */
    const ramp = (e, s, o0, o1, width, gLevel) => {
      const foot = e.at(s, o1), g = gLevel ?? gAt(foot), len = o1 - o0;
      put('paving', geom.ramp({ x: foot[0], z: foot[1], azDeg: e.az + 180, width, length: len, rise: FL - g, base: g, sink: 1.3 }));
      const level = (o) => FL - (FL - g) * Math.min(1, Math.max(0, (o - o0) / len));
      for (const sx of [-1, 1]) {
        const sb = s + sx * (width / 2 + 0.3), a = e.at(sb, o0), b = e.at(sb, o1 - 0.45);
        put('brick', geom.wall([a, b], { thickness: 0.6, base: g - 0.9, top: (x, z) => level(e.oOf([x, z])) + 0.85 }));
        put('brick', ebox(e, sb - 0.5, sb + 0.5, o1 - 0.45, o1 + 0.55, g - 0.9, g + 1.45));
        put('brick', ebox(e, sb - 0.6, sb + 0.6, o1 - 0.55, o1 + 0.65, g + 1.45, g + 1.6, true));
      }
      return { foot, g };
    };
    /** steps with true risers from the floor at offset oTop down to the ground */
    const steps = (e, s, oTop, width) => {
      const g0 = gAt(e.at(s, oTop + 2.4)), n = Math.max(2, Math.round((FL - g0) / 0.175)), tread = 0.34;
      const foot = e.at(s, oTop + n * tread), g = Math.min(g0, gAt(foot)), riser = (FL - g) / n;
      put('brick', geom.stairs({ x: foot[0], z: foot[1], azDeg: e.az + 180, width, steps: n, riser, tread, base: g, sink: 1.2, parapet: { height: 0.5, thickness: 0.5 } }));
      return { foot, g, n, riser };
    };

    // =============================================================================== MAIN BUILDING ====
    const fp = mm.footprint, MC = fp.center, MR = fp.rotationDeg;
    const mL = (lx, lz) => M.localToWorld(MC, MR, lx, lz);
    const toL = (p) => M.worldToLocal(MC, MR, p[0], p[1]);
    const rectL = (x0, z0, x1, z1) => [mL(x0, z0), mL(x1, z0), mL(x1, z1), mL(x0, z1)];       // NW, NE, SE, SW (clockwise)
    const cL = toL(md.court.center), cw2 = md.court.size[0] / 2, ch2 = md.court.size[1] / 2;
    const court = rectL(cL[0] - cw2, cL[1] - ch2, cL[0] + cw2, cL[1] + ch2);
    const VT = 0.7;                                                                             // veneer of the court walls
    const courtBack = rectL(cL[0] - cw2 - VT, cL[1] - ch2 - VT, cL[0] + cw2 + VT, cL[1] + ch2 + VT);
    const RC = geom.insetRing(P, 1.2), RW = geom.insetRing(P, 5.0);                             // curtain face; inner edge of the wall-walk
    const lb = (() => { const q = P.map(toL); return { x0: Math.max(...q.filter((p) => p[0] < 0).map((p) => p[0])), x1: Math.min(...q.filter((p) => p[0] > 0).map((p) => p[0])), z0: Math.max(...q.filter((p) => p[1] < 0).map((p) => p[1])), z1: Math.min(...q.filter((p) => p[1] > 0).map((p) => p[1])) }; })();

    // gate dimensions of the main building: "massive projecting towers" (R3 3.4)
    const MG = { width: 19.6, tower: 6.4, door: 4.2, crown: 9.6, front: 1.0, back: -5.3, proj: 1.2, top: PAR + 0.6, towerTop: TWR, rebates: 3, skirt: KISU, skirtBack: -0.5, reveal: 2.15 };
    const BAST = 6.7;                                  // corner bastions occupy 0.3 .. 6.7 m along each side

    // socle (kisu): 2 m of baked brick round the foot, cut at the gates
    for (let k = 0; k < P.length; k++) {
      const e0 = PE[(k + P.length - 1) % P.length], e1 = PE[k];
      const g0 = Object.values(mg).find((g) => g.k === (k + P.length - 1) % P.length), g1 = Object.values(mg).find((g) => g.k === k);
      const from = g0 ? e0.at(g0.s + 3.3) : e0.at(e0.len / 2), to = g1 ? e1.at(g1.s - 3.3) : e1.at(e1.len / 2);
      put('brick', geom.wall([from, P[k], to], { thickness: 2.0, offset: 1.0, base: BASE, top: KISU }));
    }
    // body with the court as a hole; the wall ring above the room roofs; parapets
    put('plaster', geom.prism(RC, BASE, ROOF, { holes: [courtBack], top: false }));
    put('plaster', geom.wall(RC, { closed: true, thickness: 3.8, offset: 1.9, base: ROOF, top: WALK, topFace: false }));
    put('plaster', geom.wall(RC, { closed: true, thickness: 0.7, offset: 0.35, base: WALK, top: PAR }));
    put('plaster', geom.wall(RW, { closed: true, thickness: 0.45, offset: -0.225, base: WALK, top: WALK + 0.4 }));
    put('roof', geom.cap(geom.insetRing(P, 1.55), WALK, { holes: [geom.insetRing(P, 4.8)] }));
    merlonLines.push({ line: M.closeRing(geom.insetRing(P, 1.5)), y: PAR, steps: 3, strip: true });

    // towers of the outer face: every tower between two lower flanking ones ("a unit of three towers", Koldewey)
    const unit = (e, sc, fw, cwid, k) => {
      const a = sc - fw / 2, b = sc + fw / 2, c0 = sc - cwid / 2, c1 = sc + cwid / 2;
      put('plaster', geom.prism(ering(e, [[a, -1.2], [a, -0.75], [c0, -0.75], [c0, -0.3], [c1, -0.3], [c1, -0.75], [b, -0.75], [b, -1.2]]), KISU, PAR), tone(k, 3));
      put('plaster', geom.prism(ering(e, [[c0, -2.15], [c0, -0.3], [c1, -0.3], [c1, -2.15]]), PAR, PAR + 1.0), tone(k, 3));
      merlonLines.push({ line: [e.at(c0 + 0.05, -0.6), e.at(c1 - 0.05, -0.6)], y: PAR + 1.0, steps: 2, pitch: (cwid - 0.1) / 2 });
      stats.towers++;
    };
    PE.forEach((e, k) => {
      const g = Object.values(mg).find((q) => q.k === k), runs = g ? [[BAST, g.s - MG.width / 2], [g.s + MG.width / 2, e.len - BAST]] : [[BAST, e.len - BAST]];
      runs.forEach(([a, b], r) => {
        const n = Math.max(1, Math.round((b - a) / 5.8)), sp = (b - a) / n, fw = sp - 2.0;
        for (let j = 0; j < n; j++) unit(e, a + (j + 0.5) * sp, fw, Math.max(1.7, fw * 0.54), k * 40 + r * 20 + j);
      });
    });
    // corner bastions
    for (let k = 0; k < P.length; k++) {
      const e0 = PE[(k + P.length - 1) % P.length], e1 = PE[k], c = P[k];
      const pt = (a, b) => [c[0] - e0.d[0] * a + e1.d[0] * b, c[1] - e0.d[1] * a + e1.d[1] * b];
      const ring = [pt(0.3, 0.3), pt(0.3, BAST), pt(BAST, BAST), pt(BAST, 0.3)];
      put('plaster', geom.nichedPrism(ring, KISU, TWR, { bay: BAST - 0.3, nicheWidth: 0, nicheDepth: 0, grooves: { count: 3, width: 0.4, depth: 0.28, gap: 1.5 }, edges: [0, 3], socle: 1.0, frieze: 1.3, top: false }));
      put('plaster', geom.wall(ring, { closed: true, thickness: 0.55, offset: (M.polygonArea(ring) > 0 ? 1 : -1) * 0.275, base: TWR, top: TWR + 0.9 }));
      put('roof', geom.cap(geom.insetRing(ring, 0.5), TWR));
      merlonLines.push({ line: M.closeRing(geom.insetRing(ring, 0.28)), y: TWR + 0.9, steps: 3 });
      stats.towers++;
    }
    // the four gates; ramps with balustrades on the north, west and south (the east gate opens into the annex court)
    for (const [side, g] of Object.entries(mg)) {
      const e = PE[g.k];
      gate(e, g.s, { ...MG, glow: side === 'E' ? 0.75 : 0.6 });
      if (side !== 'E') {
        const gr = gAt(e.at(g.s, g.o + 1)), o1 = Math.max(g.o, MG.front + (FL - gr) * 4.6);
        const r = ramp(e, g.s, MG.front, o1, 6.4);
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * 3.5, o1 + 0.05); put('bronze', place(lathe([[0.0, 0], [0.2, 0], [0.34, 0.1], [0.4, 0.3], [0.36, 0.3], [0.28, 0.14], [0.0, 0.1]], 12), p[0], r.g + 1.6, p[1])); put('ember', place(new THREE.SphereGeometry(0.35, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.28, 0), p[0], r.g + 1.6, p[1])); addFire('brazier', p[0], r.g + 1.95, p[1]); }
        spill(e, g.s, o1 + 0.2, 9, 0.16);
      } else {
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * 5.6, MG.front + MG.proj + 2.2); brazier(p[0], p[1], FL); }
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * 8.4, MG.front + MG.proj + 4.2); emblemPole(p[0], p[1], FL, e.rot); }
      }
    }

    // --- roofs inside the wall ring ---
    put('roof', geom.cap(geom.insetRing(P, 4.9), ROOF, { holes: [rectL(cL[0] - cw2 - 0.35, cL[1] - ch2 - 0.35, cL[0] + cw2 + 0.35, cL[1] + ch2 + 0.35)] }));
    put('plaster', geom.wall(court, { closed: true, thickness: VT, offset: -VT / 2, base: ROOF, top: CPAR }));
    merlonLines.push({ line: M.closeRing(rectL(cL[0] - cw2 - 0.3, cL[1] - ch2 - 0.3, cL[0] + cw2 + 0.3, cL[1] + ch2 + 0.3)), y: CPAR, steps: 3 });
    // Marduk's cella block on the west of the court: higher than the rooms round it
    const cellaX0 = lb.x0 + 5.0 + 2.2, cellaX1 = cL[0] - cw2 + 0.05, cellaZ = 13.6;
    block(rectL(cellaX0, cL[1] - cellaZ, cellaX1, cL[1] + cellaZ), ROOF, CEL, CEL + 0.9, { strip: true });
    // Ea's cella on the north, the double cella on the south-east, the vestibule of the east gate: raised roofs
    block(rectL(cL[0] - 8.5, lb.z0 + 5.0 + 1.8, cL[0] + 8.5, cL[1] - ch2 - 2.0), ROOF, ROOF + 1.5, ROOF + 2.2, { merlon: false, tint: tone(5, 1) });
    block(rectL(cL[0] - 1.0, cL[1] + ch2 + 2.0, cL[0] + 14.5, lb.z1 - 5.0 - 1.8), ROOF, ROOF + 1.2, ROOF + 1.9, { merlon: false, tint: tone(5, 2) });
    block(rectL(cL[0] + cw2 + 1.35, cL[1] - 6.5, lb.x1 - 5.0, cL[1] + 6.5), ROOF, ROOF + 1.2, ROOF + 1.9, { merlon: false, tint: tone(5, 3) });
    // stair heads: where the stairs in the wall reach the roof
    for (const [x, z, rot] of [[lb.x0 + 5.0 + 4.2, lb.z0 + 5.0 + 4.0, 0], [lb.x1 - 5.0 - 4.2, lb.z1 - 5.0 - 4.0, 180], [lb.x1 - 5.0 - 4.0, lb.z0 + 5.0 + 3.6, 90]]) {
      const c = mL(x, z), k = edge(mL(x - 2.3, z), mL(x + 2.3, z));
      block(rectL(x - 2.3, z - 1.7, x + 2.3, z + 1.7), ROOF, ROOF + 2.3, ROOF + 2.55, { t: 0.3, merlon: false, tint: tone(6, rot) });
      const f = rot === 0 ? edge(mL(x + 2.3, z + 1.7), mL(x - 2.3, z + 1.7)) : rot === 180 ? edge(mL(x - 2.3, z - 1.7), mL(x + 2.3, z - 1.7)) : edge(mL(x - 2.3, z + 1.7), mL(x - 2.3, z - 1.7));
      put('plaster', ebox(f, f.len / 2 - 0.5, f.len / 2 + 0.5, 0, 0.04, ROOF, ROOF + 1.9), VOID);
      void c; void k;
    }
    // low ridges where the roofs of neighbouring rooms meet, and drain spouts into the court
    for (const [x0, z0, x1, z1] of [[lb.x0 + 5.2, cL[1] - ch2 - 4, cellaX0 - 0.3, cL[1] - ch2 - 4], [lb.x0 + 5.2, cL[1] + ch2 + 4, cellaX0 - 0.3, cL[1] + ch2 + 4], [cL[0] + cw2 + 4, lb.z0 + 5.2, cL[0] + cw2 + 4, cL[1] - 7], [cL[0] + cw2 + 4, cL[1] + 7, cL[0] + cw2 + 4, lb.z1 - 5.2], [cL[0] - 10, lb.z0 + 5.2, cL[0] - 10, cL[1] - ch2 - 0.8], [cL[0] - 3, cL[1] + ch2 + 0.8, cL[0] - 3, lb.z1 - 5.2]])
      put('plaster', geom.wall([mL(x0, z0), mL(x1, z1)], { thickness: 0.4, base: ROOF - 0.05, top: ROOF + 0.3 }), tone(7, Math.round(x0 + z0)));

    // --- the court: veneered walls with towers and doors, the towered front of Marduk's cella ---
    const cN = edge(court[1], court[0]), cE = edge(court[2], court[1]), cS = edge(court[3], court[2]), cW = edge(court[0], court[3]);
    const Y0 = FL - 0.45, DT = FL + 1.1;
    {
      // west: the front of the cella (Ka-gal). Towers 5.2 m wide flank a door 9.2 m high in three rebates.
      const mid = cW.len / 2, CG = { width: 17.4, tower: 5.2, door: 3.8, crown: 9.2, front: 1.3, back: -1.6, proj: 1.0, top: CEL - 0.3, towerTop: CEL + 0.4, rebates: 3, base: FL - 0.6, reveal: 1.95, glow: 0.95 };
      gate(cW, mid, CG);
      for (const [a, b, id] of [[0, mid - CG.width / 2, 11], [mid + CG.width / 2, cW.len, 12]]) {
        const sd = a === 0 ? b - 5.0 : a + 5.0;
        facade(cW, { s0: a, s1: b, t: VT, y0: Y0, y1: ROOF, dado: DT, id, doors: [{ s: sd, w: 2.2, top: FL + 5.0, kind: 'leaf' }], pil: [{ s: a === 0 ? 1.25 : cW.len - 1.25, w: 2.5, p: 0.45, top: CPAR }] });
      }
      // east: the inner front of the east gate
      const EG = { width: 12.4, tower: 3.5, door: 3.6, crown: 8.6, front: 0.9, back: -1.4, proj: 0.7, top: CPAR + 0.2, towerTop: CPAR + 0.9, rebates: 2, base: FL - 0.6, reveal: 1.55, glow: 0.6 };
      gate(cE, cE.len / 2, EG);
      for (const [a, b, id] of [[0, cE.len / 2 - EG.width / 2, 13], [cE.len / 2 + EG.width / 2, cE.len, 14]]) {
        const r = rhythm(cE.len, { s0: a, s1: b, bay: 6.3, top: CPAR, seed: id, leaf: 0.7, glow: 0.2 });
        facade(cE, { s0: a, s1: b, t: VT, y0: Y0, y1: ROOF, dado: DT, id, doors: r.doors, pil: r.pil });
      }
      spouts(cE, ROOF, [{ s: cE.len / 2, w: EG.width + 1 }], 4, 14);
      // north (Ea) and south (the double cella): a larger door between two towers, then towers and doors in turn
      for (const [e, id, big] of [[cN, 15, [{ s: cN.len / 2, w: 3.0, top: FL + 6.6, kind: 'void', glow: 0.8 }]], [cS, 16, [{ s: cS.len / 2 - 4.6, w: 2.8, top: FL + 6.0, kind: 'void', glow: 0.7 }, { s: cS.len / 2 + 4.6, w: 2.8, top: FL + 6.0, kind: 'leaf' }]]]) {
        const keep = big.map((d) => [d.s - d.w / 2 - 0.5, d.s + d.w / 2 + 0.5]);
        const r = rhythm(e.len, { bay: 5.2, top: CPAR, seed: id, keep, leaf: 0.65, glow: 0.3 });
        const flank = [];
        for (const d of big) for (const sx of [-1, 1]) { const s = d.s + sx * (d.w / 2 + 1.55); if (!flank.some((f) => Math.abs(f.s - s) < 2.2)) flank.push({ s, w: 2.2, p: 0.55, top: CPAR + 0.9, cap: true, capFrom: CPAR }); }
        const pil = [...flank, ...r.pil.filter((p) => flank.every((f) => Math.abs(f.s - p.s) > 2.6))];
        const doors = [...big, ...r.doors.filter((d) => pil.every((p) => Math.abs(p.s - d.s) > (p.w + d.w) / 2 + 0.25))];
        facade(e, { t: VT, y0: Y0, y1: ROOF, dado: DT, id, doors, pil });
        spouts(e, ROOF, pil, 4, id);
      }
      // floor of baked brick; furniture on the axis of the cella
      put('paving', gridCap(MC, MR, cL[0] - cw2 - 0.5, cL[1] - ch2 - 0.5, cL[0] + cw2 + 0.5, cL[1] + ch2 + 0.5, FL, 2.6));
      const ax = (dx, dz) => mL(cL[0] - cw2 + dx, cL[1] + dz);          // dx metres east of the cella front, dz south of the axis
      { const p = ax(11.5, 0); altar(p[0], p[1], FL, MR, 1); ctx.emitters.add({ kind: 'smoke', pos: [p[0], FL + 1.7, p[1]], size: 0.5 }); stats.emitters++; }
      for (const dz of [-4.4, 4.4]) { const p = ax(5.4, dz); emblemPole(p[0], p[1], FL, MR + 90, 9.4); }
      for (const dz of [-6.2, 6.2]) { const p = ax(9.6, dz); fireBowl(p[0], p[1], FL, MR); }
      for (const dz of [-9.5, 9.5]) { const p = ax(23.5, dz); fireBowl(p[0], p[1], FL, MR); }
      for (const dz of [-2.9, 2.9]) { const p = ax(3.3, dz); brazier(p[0], p[1], FL); }
      { const p = mL(cL[0] - 2.4, cL[1] - ch2 + 1.6); lampStand(p[0], p[1], FL); const q = mL(cL[0] + 2.4, cL[1] - ch2 + 1.6); lampStand(q[0], q[1], FL); }
      { const p = mL(cL[0] - 6.8, cL[1] + ch2 - 1.6); lampStand(p[0], p[1], FL); const q = mL(cL[0] + 6.8, cL[1] + ch2 - 1.6); lampStand(q[0], q[1], FL); }
      // the basin of lustration water before Ea's cella (apsu): a brick tank lined with bitumen
      { const b = mL(cL[0] + 8.2, cL[1] - ch2 + 6.2), r = M.rectRing(b[0], b[1], 3.4, 3.4, MR);
        put('brick', geom.wall(r, { closed: true, thickness: 0.4, offset: 0.2, base: FL - 0.3, top: FL + 0.75 }));
        put('plaster', geom.cap(geom.insetRing(r, 0.38), FL + 0.5), [0.07, 0.09, 0.1]); }
      { const p = mL(cL[0] + 11.8, cL[1] - ch2 + 3.0); jar(p[0], p[1], FL, 1.1); const q = mL(cL[0] + 12.6, cL[1] - ch2 + 4.0); jar(q[0], q[1], FL, 0.85, [0.86, 0.8, 0.72]); }
    }

    // ======================================================================================= ANNEX ====
    const nA = A.length, eSh = AE[nA - 1];                                  // the shared edge (annex side); eSh.n looks INTO the main building
    const AC = ad.courts.north.center, AR = M.mod(Math.atan2(AE[0].d[1], AE[0].d[0]) * 180 / Math.PI + 0.3, 360);   // local frame of the annex courts
    const aL = (c, lx, lz) => M.localToWorld(c, AR, lx, lz);
    const rectA = (c, w, h) => [aL(c, -w / 2, -h / 2), aL(c, w / 2, -h / 2), aL(c, w / 2, h / 2), aL(c, -w / 2, h / 2)];
    const nc = rectA(AC, ad.courts.north.size[0], ad.courts.north.size[1]);      // NW, NE, SE, SW
    const sc = rectA(ad.courts.south.center, ad.courts.south.size[0], ad.courts.south.size[1]);
    // the north court runs west to the main building: cut its north and south edges at the shared wall
    const hitShared = (p, q, o) => { const a = eSh.oOf(p) - o, b = eSh.oOf(q) - o, t = a / (a - b); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    const ncNW = hitShared(nc[1], nc[0], 0), ncSW = hitShared(nc[2], nc[3], 0);                 // on the outline of the main building
    const ncNWc = hitShared(nc[1], nc[0], 1.2), ncSWc = hitShared(nc[2], nc[3], 1.2);           // on its curtain face

    // --- outer walls: closely placed grooved towers (Koldewey) over the brick socle; parapet and merlons ---
    const AG = {
      F: { width: 16.9, tower: 5.0, door: 4.6, crown: 9.4, front: -2.1, back: -8.1, proj: 1.3, top: A_PAR + 0.5, towerTop: A_PAR + 1.8, rebates: 3, skirt: KISU, skirtBack: -3.4, glow: 0.7, recess: 19.3 },
      G: { width: 13.0, tower: 3.7, door: 3.2, crown: 7.4, front: 0.0, back: -5.0, proj: 1.0, top: A_PAR, towerTop: A_PAR + 0.8, rebates: 2, skirt: KISU, skirtBack: -1.0, glow: 0.5 },
      E: { width: 10.6, tower: 3.0, door: 2.6, crown: 6.8, front: 0.0, back: -5.0, proj: 1.0, top: A_PAR, towerTop: A_PAR + 0.8, rebates: 2, skirt: KISU, skirtBack: -1.0, glow: 0.5 },
      H: { width: 12.0, tower: 3.4, door: 3.0, crown: 7.2, front: 0.0, back: -5.0, proj: 1.0, top: A_PAR, towerTop: A_PAR + 0.8, rebates: 2, skirt: KISU, skirtBack: -1.0, glow: 0.5 },
    };
    const gaps = AE.slice(0, nA - 1).map(() => []);
    for (const [k, g] of Object.entries(ag)) { const hw = (AG[k].recess ?? AG[k].width - 0.6) / 2; gaps[g.k].push([g.s - hw, g.s + hw]); }
    gaps.forEach((l) => l.sort((a, b) => a[0] - b[0]));
    const AI = geom.insetRing(A, 0.3);
    const stretches = []; let cur = [{ k: 0, s: -0.75 }];
    for (let k = 0; k < nA - 1; k++) {
      for (const [g0, g1] of gaps[k]) { cur.push({ k, s: g0 }); stretches.push(cur); cur = [{ k, s: g1 }]; }
      if (k < nA - 2) cur.push({ corner: k + 1 }); else { cur.push({ k, s: AE[k].len + 1.5 }); stretches.push(cur); }
    }
    const ptOf = (p, o) => (p.corner !== undefined ? (o === 0 ? A[p.corner] : AI[p.corner]) : AE[p.k].at(p.s, o));
    const SKIN = { bay: 4.6, nicheWidth: 1.7, nicheDepth: 0.55, side: -1, steps: 1, grooves: { count: 2, width: 0.32, depth: 0.22, gap: 0.95 } };
    for (const st of stretches) {
      const face = st.map((p) => ptOf(p, -0.3)), out = st.map((p) => ptOf(p, 0));
      for (let i = 0; i < face.length - 1; i++) {
        const runLen = Math.hypot(face[i + 1][0] - face[i][0], face[i + 1][1] - face[i][1]);
        if (runLen < 0.4) continue;
        if (runLen < 3.4) { put('plaster', geom.wall([face[i], face[i + 1]], { thickness: 0.6, offset: 0.3, base: KISU, top: A_ROOF })); continue; }
        put('plaster', geom.nichedFacade({ a: face[i], b: face[i + 1], base: KISU, top: A_ROOF, ...SKIN, nicheBase: KISU + 0.9, nicheTop: A_ROOF - 1.3 }));
      }
      put('plaster', geom.wall(face, { thickness: 0.6, offset: 0.3, base: A_ROOF, top: A_PAR }));
      put('brick', geom.wall(out, { thickness: 2.0, offset: 1.0, base: BASE, top: KISU }));
      merlonLines.push({ line: face, y: A_PAR, steps: 3, offset: 0.28, strip: true });
    }
    // gates: Ka-mah (F) in its recess on a low podium with a ramp for the processions; E, G, H with steps
    for (const [k, g] of Object.entries(ag)) {
      const e = AE[g.k], sp = AG[k];
      gate(e, g.s, sp);
      if (k === 'F') {
        const hr = sp.recess / 2, back = -2.5;
        put('brick', ebox(e, g.s - hr - 0.3, g.s + hr + 0.3, -3.2, 0, BASE, FL - 0.08));                                       // podium across the mouth of the recess
        put('paving', geom.prism(ering(e, [[g.s - hr, back], [g.s + hr, back], [g.s + hr, 0.03], [g.s - hr, 0.03]]), FL - 0.2, FL + 0.02));
        for (const sx of [-1, 1]) {
          const a = g.s + sx * hr, b = g.s + sx * (sp.width / 2 - 0.3), lo = Math.min(a, b), hi = Math.max(a, b);
          put('plaster', ebox(e, lo, hi, back - 0.9, back, KISU, A_PAR));                                                // back of the recess beside the towers
          put('brick', ebox(e, lo, hi, back - 0.9, back + 0.2, FL - 0.2, KISU));
          const r0 = Math.min(a, a + sx * 1.2), r1 = Math.max(a, a + sx * 1.2);
          put('plaster', ebox(e, r0, r1, back - 0.9, -0.35, KISU, A_PAR));                                               // return of the recess
          put('brick', ebox(e, r0 - (sx < 0 ? 0 : 0.2), r1 + (sx < 0 ? 0.2 : 0), back - 0.9, -0.15, FL - 0.2, KISU));
        }
        let gF = -Infinity;
        for (let i = -19; i <= 19; i += 3.8) for (let j = 0.5; j <= 21; j += 4.1) gF = Math.max(gF, gAt(e.at(g.s + i, j)));
        const r = ramp(e, g.s, 0, 6.6, 6.2, gF + 0.1);
        r.g = gF + 0.03;
        put('paving', gridCap(e.at(g.s, 10.7), e.rot, -19, -10.3, 19, 10.3, r.g + 0.07, 3.2));                           // the forecourt
        put('brick', geom.wall([e.at(g.s - 19, 0.4), e.at(g.s - 19, 21), e.at(g.s + 19, 21), e.at(g.s + 19, 0.4)], { thickness: 0.5, offset: 0, base: r.g - 0.7, top: r.g + 0.12 }));
        // low white walls close the forecourt on the north and south; open to the street on the east
        for (const sx of [-1, 1]) {
          const w = [e.at(g.s + sx * 19, 0.6), e.at(g.s + sx * 19, 17.5)];
          put('plaster', geom.wall(w, { thickness: 0.7, base: r.g - 0.7, top: r.g + 2.1 }), tone(31, sx));
          put('brick', geom.wall(w, { thickness: 0.9, base: r.g - 0.7, top: r.g + 0.5 }));
          const p = e.at(g.s + sx * 19, 18.4); put('plaster', geom.box({ x: p[0], z: p[1], y0: r.g - 0.7, y1: r.g + 2.6, sx: 1.3, sz: 1.3, rotDeg: e.rot }), tone(32, sx));
        }
        { const p = e.at(g.s, 13.5); altar(p[0], p[1], r.g + 0.07, e.rot + 90, 1.1); }
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * 6.4, 8.6); emblemPole(p[0], p[1], r.g + 0.07, e.rot, 9.2); }
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * 10.5, 4.2); fireBowl(p[0], p[1], r.g + 0.07, e.rot); }
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * 3.9, -1.2); brazier(p[0], p[1], FL + 0.02); }
        spill(e, g.s, 6.9, 10, 0.2);
      } else {
        const st = steps(e, g.s, sp.front, sp.width - 2 * sp.tower - 1.4);
        for (const sx of [-1, 1]) { const p = e.at(g.s + sx * (sp.width / 2 - sp.tower - 0.5), sp.front + st.n * 0.34 + 0.8); brazier(p[0], p[1], st.g); }
        spill(e, g.s, sp.front + st.n * 0.34 + 0.3, 7, 0.14);
      }
    }

    // --- roofs of the annex: one level behind the parapets, the two courts open ---
    const AIr = geom.insetRing(A, 0.75);
    const shIn = (p, o) => { const s = eSh.sOf(p); return eSh.at(s, o); };                       // a point pushed onto a line parallel to the shared wall
    const roofRing = [];
    for (let i = 0; i < nA - 1; i++) {
      roofRing.push(i === 0 ? shIn(AIr[0], 1.25) : AIr[i]);
      if (i === ag.F.k) { const e = AE[i], hr = AG.F.recess / 2; roofRing.push(e.at(ag.F.s - hr, -0.75), e.at(ag.F.s - hr, -2.9), e.at(ag.F.s + hr, -2.9), e.at(ag.F.s + hr, -0.75)); }
    }
    roofRing.push(shIn(AIr[nA - 1], 1.25),
      shIn(ncSWc, 1.25), aL(AC, ad.courts.north.size[0] / 2 + 0.35, ad.courts.north.size[1] / 2 + 0.35), aL(AC, ad.courts.north.size[0] / 2 + 0.35, -ad.courts.north.size[1] / 2 - 0.35), shIn(ncNWc, 1.25));
    {
      const dS = eSh.oOf(aL(AC, 0, ad.courts.north.size[1] / 2 + 0.35)) - eSh.oOf(aL(AC, 0, ad.courts.north.size[1] / 2)), q = roofRing.length;
      void dS;
      // move the two points on the main wall out to the parapet line of the court (0.35 m beyond its faces)
      const sS = eSh.sOf(hitShared(aL(AC, 10, ad.courts.north.size[1] / 2 + 0.35), aL(AC, -40, ad.courts.north.size[1] / 2 + 0.35), 1.25));
      const sN = eSh.sOf(hitShared(aL(AC, 10, -ad.courts.north.size[1] / 2 - 0.35), aL(AC, -40, -ad.courts.north.size[1] / 2 - 0.35), 1.25));
      roofRing[q - 4] = eSh.at(sS, 1.25); roofRing[q - 1] = eSh.at(sN, 1.25);
    }
    const scOut = rectA(ad.courts.south.center, ad.courts.south.size[0] + 0.7, ad.courts.south.size[1] + 0.7);
    put('roof', geom.cap(roofRing, A_ROOF, { holes: [scOut] }));
    // court parapets with merlons
    const ncPar = [ncNWc, nc[1], nc[2], ncSWc];
    put('plaster', geom.wall(ncPar, { thickness: VT, offset: -VT / 2, base: A_ROOF, top: A_CPAR }));
    merlonLines.push({ line: ncPar, y: A_CPAR, steps: 2, offset: -0.3 });
    put('plaster', geom.wall(sc, { closed: true, thickness: VT, offset: -VT / 2, base: A_ROOF, top: A_CPAR }));
    merlonLines.push({ line: M.closeRing(sc), y: A_CPAR, steps: 2, offset: -0.3 });
    // roof structures: the gate house of Ka-mah rises through the roof (built by gate()); stair heads; ridges
    for (const [c, lx, lz, id] of [[AC, 8, -27.5, 1], [AC, 44, 12, 2], [ad.courts.south.center, -29.5, -4, 3], [ad.courts.south.center, 4, 20.5, 4]]) {
      const p = aL(c, lx, lz); if (M.signedDistToPolygon(p[0], p[1], M.closeRing(geom.insetRing(A, 3.2))) > 0) continue;
      block(M.openRing(M.rectRing(p[0], p[1], 4.4, 3.2, AR + (id % 2) * 90)), A_ROOF, A_ROOF + 2.2, A_ROOF + 2.45, { t: 0.3, merlon: false, tint: tone(8, id) });
    }
    for (const [c, x0, z0, x1, z1] of [[AC, -20, -24.2, -20, -30.4], [AC, 14, -24.2, 14, -30.4], [AC, 38.2, -8, 50, -8], [AC, -12, 24.2, -12, 30], [AC, 22, 24.2, 22, 30]]) {
      const a = aL(c, x0, z0), b = aL(c, x1, z1);
      if ([a, b].some((p) => M.signedDistToPolygon(p[0], p[1], M.closeRing(geom.insetRing(A, 1.0))) > 0)) continue;
      put('plaster', geom.wall([a, b], { thickness: 0.4, base: A_ROOF - 0.05, top: A_ROOF + 0.3 }), tone(9, Math.round(x0)));
    }

    // --- the courts of the annex (interiors conjectural: never excavated) ---
    const AY0 = FL - 0.45;
    {
      // north court: the towered east front of the main building closes it on the west
      const fN = edge(nc[1], ncNWc), fE = edge(nc[2], nc[1]), fS = edge(ncSWc, nc[2]);
      const rN = rhythm(fN.len, { s1: fN.len - 1.6, bay: 6.3, top: A_CPAR, seed: 21, dh: 4.6, leaf: 0.6, glow: 0.3 });
      facade(fN, { t: VT, y0: AY0, y1: A_ROOF, dado: DT, id: 21, doors: rN.doors, pil: rN.pil });
      spouts(fN, A_ROOF, rN.pil, 7, 21);
      // east side: the inner door of Ka-mah where the axis of the gate meets it
      const sF = Math.min(fE.len - 6, Math.max(6, fE.sOf(AE[ag.F.k].at(ag.F.s, -12))));
      const bigF = { s: sF, w: 4.6, top: FL + 8.6, kind: 'void', glow: 0.7 };
      const rE = rhythm(fE.len, { bay: 6.0, top: A_CPAR, seed: 22, keep: [[sF - 4.6, sF + 4.6]], leaf: 0.55, glow: 0.3 });
      facade(fE, { t: VT, y0: AY0, y1: A_ROOF, dado: DT, id: 22, doors: [bigF, ...rE.doors],
        pil: [...rE.pil, ...[-1, 1].map((sx) => ({ s: sF + sx * 3.6, w: 2.2, p: 0.55, top: A_CPAR + 0.9, cap: true, capFrom: A_CPAR }))] });
      // south side: a passage to the service court
      const sP = fS.sOf(aL(ad.courts.south.center, 0, 0)), bigP = { s: sP, w: 3.2, top: FL + 6.2, kind: 'void', glow: 0.45 };
      const rS = rhythm(fS.len, { s0: 1.6, bay: 6.3, top: A_CPAR, seed: 23, keep: [[sP - 3.0, sP + 3.0]], leaf: 0.6, glow: 0.3 });
      facade(fS, { t: VT, y0: AY0, y1: A_ROOF, dado: DT, id: 23, doors: [bigP, ...rS.doors], pil: rS.pil });
      spouts(fS, A_ROOF, rS.pil, 7, 23);
      // floor
      const w = ad.courts.north.size[0], h = ad.courts.north.size[1], wx = eSh.oOf(aL(AC, -w / 2, 0));
      void wx;
      const westL = M.worldToLocal(AC, AR, ncNW[0], ncNW[1])[0], westL2 = M.worldToLocal(AC, AR, ncSW[0], ncSW[1])[0];
      put('paving', gridCap(AC, AR, Math.min(westL, westL2) - 0.6, -h / 2 - 0.5, w / 2 + 0.5, h / 2 + 0.5, FL, 3.0));
      // furniture: fire bowls before the east gate of the main building and along the way from Ka-mah; an altar; jars
      const gA = mg.E, eA = PE[gA.k], aAt = (ds, o) => eA.at(gA.s + ds, o);
      for (const ds of [-12.5, 12.5]) { const p = aAt(ds, 9.5); fireBowl(p[0], p[1], FL, eA.rot); }
      { const p = aAt(0, 17); altar(p[0], p[1], FL, eA.rot + 90, 0.9); }
      const fIn = fE.at(sF, 0);
      for (const d of [8, 26]) for (const sx of [-1, 1]) { const p = [fIn[0] + fE.n[0] * d + fE.d[0] * sx * 5.2, fIn[1] + fE.n[1] * d + fE.d[1] * sx * 5.2]; if (d === 8) brazier(p[0], p[1], FL); else fireBowl(p[0], p[1], FL, AR); }
      for (const [lx, lz] of [[-6, -h / 2 + 1.5], [16, -h / 2 + 1.5], [-2, h / 2 - 1.5], [22, h / 2 - 1.5]]) { const p = aL(AC, lx, lz); lampStand(p[0], p[1], FL); }
      for (let i = 0; i < 7; i++) { const p = aL(AC, 24 + i * 0.95 + 0.3 * hash2(i, 3, 5), h / 2 - 1.3 - 0.5 * hash2(i, 7, 5)); jar(p[0], p[1], FL, 0.8 + 0.4 * hash2(i, 1, 9), hash2(i, 2, 9) < 0.4 ? [0.85, 0.8, 0.74] : null); }
    }
    {
      // south court: the service court (stores, kitchens): plain walls, doors, fewer towers
      const c = ad.courts.south.center, w = ad.courts.south.size[0], h = ad.courts.south.size[1];
      const F = [edge(sc[1], sc[0]), edge(sc[2], sc[1]), edge(sc[3], sc[2]), edge(sc[0], sc[3])];
      F.forEach((f, i) => {
        const r = rhythm(f.len, { bay: 7.6, tw: 1.9, tp: 0.35, top: A_CPAR, seed: 30 + i, dw: 1.8, dh: 3.8, leaf: 0.6, glow: 0.35 });
        facade(f, { t: VT, y0: AY0, y1: A_ROOF, dado: DT, id: 30 + i, doors: r.doors, pil: r.pil });
        spouts(f, A_ROOF, r.pil, i % 2 ? 3 : 4, 30 + i);
      });
      put('paving', gridCap(c, AR, -w / 2 - 0.5, -h / 2 - 0.5, w / 2 + 0.5, h / 2 + 0.5, FL, 3.0));
      // a well, bread ovens, store jars, a brazier
      { const p = aL(c, -8, 2); put('brick', geom.wall(M.openRing(M.rectRing(p[0], p[1], 2.2, 2.2, AR)), { closed: true, thickness: 0.4, offset: 0.2, base: FL - 0.3, top: FL + 0.8 })); put('plaster', geom.cap(M.rectRing(p[0], p[1], 1.5, 1.5, AR), FL + 0.2), [0.04, 0.05, 0.06]); }
      for (let i = 0; i < 3; i++) { const p = aL(c, w / 2 - 2.2 - i * 2.4, -h / 2 + 1.7); put('pottery', place(lathe([[0.0, 0], [0.75, 0], [0.82, 0.5], [0.62, 1.05], [0.3, 1.3], [0.24, 1.3], [0.0, 1.2]], 12), p[0], FL, p[1]), [0.8, 0.74, 0.66]); if (i === 1) { ctx.emitters.add({ kind: 'smoke', pos: [p[0], FL + 1.5, p[1]], size: 0.7 }); stats.emitters++; } }
      for (let i = 0; i < 14; i++) { const p = aL(c, -w / 2 + 1.4 + (i % 7) * 0.95, h / 2 - 1.2 - Math.floor(i / 7) * 0.9 - 0.2 * hash2(i, 4, 5)); jar(p[0], p[1], FL, 0.85 + 0.35 * hash2(i, 5, 9), hash2(i, 6, 9) < 0.35 ? [0.84, 0.8, 0.75] : null); }
      for (const [f, a, b] of [[F[0], 3.5, 12], [F[0], 27, 36], [F[2], 9, 20], [F[3], 6, 13]]) put('plaster', ebox(f, a, b, 0, 0.55, FL - 0.2, FL + 0.45), tone(40, Math.round(a)));   // mud benches
      for (let i = 0; i < 9; i++) { const p = aL(c, w / 2 - 9.6 - (i % 5) * 0.34, -h / 2 + 1.2 + Math.floor(i / 5) * 0.3); put('cedar', geom.box({ x: p[0], z: p[1], y0: FL + Math.floor(i / 5) * 0.16, y1: FL + 0.16 + Math.floor(i / 5) * 0.16, sx: 0.2, sz: 1.5, rotDeg: AR + 6 * (hash2(i, 9, 2) - 0.5) })); }   // firewood by the ovens
      { const q = [[-w / 2 + 1.0, -h / 2 + 1.0], [-w / 2 + 6.2, -h / 2 + 1.0], [-w / 2 + 6.2, -h / 2 + 4.6], [-w / 2 + 1.0, -h / 2 + 4.6]].map(([x, z]) => aL(c, x, z));
        for (const p of q) put('cedar', place(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6).translate(0, 1.25, 0), p[0], FL, p[1]));
        put('cedar', geom.prism(q, FL + 2.5, FL + 2.58, { bottom: true }), [1.25, 1.05, 0.72]);
        for (let i = 0; i < 6; i++) { const p = aL(c, -w / 2 + 1.8 + (i % 3) * 1.3, -h / 2 + 1.9 + Math.floor(i / 3) * 1.4); jar(p[0], p[1], FL, 1.0 + 0.3 * hash2(i, 8, 9), hash2(i, 9, 9) < 0.5 ? [0.84, 0.8, 0.75] : null); } }
      { const p = aL(c, 6, -3); brazier(p[0], p[1], FL); const q = aL(c, -14, -h / 2 + 1.5); lampStand(q[0], q[1], FL); const r = aL(c, 12, h / 2 - 1.5); lampStand(r[0], r[1], FL); }
    }

    // ==================================================================================== SUBMISSION ====
    // merlons: stepped geometry to 700 m, the alpha strip beyond for the long lines
    const MERL = { pitch: 1.2, width: 0.75, height: MER, thickness: 0.5 };
    const near = [], strips = [];
    for (const ml of merlonLines) {
      const o = { ...MERL, y: ml.y, steps: ml.steps ?? 3, offset: ml.offset ?? 0 };
      if (ml.pitch) { o.pitch = ml.pitch; o.width = Math.min(0.75, ml.pitch * 0.64); }
      near.push(geom.merlons(ml.line, o));
      if (ml.strip) strips.push(geom.merlonStrip(ml.line, o));
    }
    const merlonTris = near.reduce((n, g) => n + geom.triCount(g), 0);
    geom.addStatic(mat.plaster, geom.merge(near), { lod: [0, 700], shadowFar: 500 });
    geom.addStatic(geom.merlonStripMaterial('templePlasterWhite', MERL.width / MERL.pitch, 3), geom.merge(strips), { lod: [700, 1000], castShadow: false, ao: false });
    // No far level: the whole temple without its merlons is under 40,000 triangles, and the aerial of shot 9 hangs
    // 2.6 to 2.7 km from these tiles, exactly where a switch would sit. Plain tiles are merged per 1024 m cell by geom.

    const tris = {};
    const sample = geom.inspect(geom.gateway({ x: 0, z: 0, facingDeg: 0, width: MG.width, depth: MG.front - MG.back, base: BASE, floor: FL, top: MG.top, towerWidth: MG.tower, towerDepth: MG.front - MG.back + MG.proj, towerProjection: MG.proj, towerTop: MG.towerTop, door: { width: MG.door, height: MG.crown, arch: true }, rebates: 3 }).geometry);
    const eT = PE[0], unitSample = geom.inspect(geom.merge([
      geom.prism(ering(eT, [[10, -1.2], [10, -0.75], [10.9, -0.75], [10.9, -0.3], [12.9, -0.3], [12.9, -0.75], [13.8, -0.75], [13.8, -1.2]]), KISU, PAR, { bottom: true }),
    ]));
    for (const k of Object.keys(parts)) {
      if (!parts[k].length) continue;
      const g = geom.merge(parts[k]); tris[k] = Math.round(geom.triCount(g));
      if (k === 'plaster') geom.addStatic(mat.plaster, g);
      else if (k === 'roof') geom.addStatic(mat.roof, g, { castShadow: false, ao: false });
      else if (k === 'paving') geom.addStatic(mat.paving, g, { castShadow: false });
      else if (k === 'ember') geom.addStatic(mat.ember, g, { lod: [0, 600], castShadow: false, ao: false });
      else if (k === 'brick') geom.addStatic(mat.brick, g);
      else geom.addStatic(mat[k], g, { lod: [0, 600], shadowFar: 400 });                 // small things: doors, bronze, jars
    }

    // night: the fire-light hook on our materials, the glow mesh
    stats.fires = fires.length;
    const night = installNight(ctx, fires, glow);

    // ------------------------------------------------------------------------------------- checks ----
    const areaM = Math.abs(M.polygonArea(P)), areaA = Math.abs(M.polygonArea(A)), courtArea = Math.abs(M.polygonArea(court));
    const total = Object.values(tris).reduce((a, b) => a + b, 0) + merlonTris;
    const zig = ctx.W.monument('etemenanki'), zigH = zig.dims && (zig.dims.height || zig.dims.totalHeight) ? (zig.dims.height || zig.dims.totalHeight) : 91.5;
    const checks = [
      { name: 'main building footprint (m2)', value: Math.round(areaM), expect: 'within 3 % of ' + fp.areaM2, pass: Math.abs(areaM / fp.areaM2 - 1) < 0.03 },
      { name: 'annex footprint (m2)', value: Math.round(areaA), expect: 'within 3 % of ' + ma.footprint.areaM2, pass: Math.abs(areaA / ma.footprint.areaM2 - 1) < 0.03 },
      { name: 'court (m)', value: md.court.size.join(' x '), expect: '31.3 x 37.6', pass: Math.abs(courtArea - 31.3 * 37.6) < 2 },
      { name: 'merlon tips of the outer wall above the floor (m)', value: +(PAR + MER - FL).toFixed(2), expect: md.wallHeight, pass: Math.abs(PAR + MER - FL - md.wallHeight) < 0.05 },
      { name: 'height against the tower', value: +((PAR + MER - FL) / zigH).toFixed(3), expect: 'about one sixth (0.14 to 0.21)', pass: (PAR + MER - FL) / zigH > 0.14 && (PAR + MER - FL) / zigH < 0.21 },
      { name: 'gateways (4 main, 4 annex, 2 court fronts)', value: stats.gates, expect: 10, pass: stats.gates === 10 },
      { name: 'merlon height (m)', value: MER, expect: '< 1', pass: MER < 1 },
      { name: 'fires in the hook', value: fires.length, expect: '<= 80', pass: fires.length <= 80 && night.dropped === 0 },
      { name: 'gate block is a closed shell', value: +sample.openAbove.toFixed(3), expect: 0, pass: sample.openAbove < 0.01 && sample.flipped === 0 },
      { name: 'tower unit is a closed shell', value: +unitSample.openAbove.toFixed(3), expect: 0, pass: unitSample.openAbove < 0.01 && unitSample.flipped === 0 && unitSample.overlap < 0.001 },
      { name: 'triangles', value: total, expect: '< 160000', pass: total < 160000 },
    ];

    return {
      update(frame) { night.update(frame); },
      stats: { ...stats, tris, merlonTris, merlons: Math.round(merlonTris / 34), glowTris: glow.index.length / 3, levels: { FL, KISU, ROOF, WALK, PAR, TOP, TWR, A_ROOF, A_PAR, A_TOP } },
      checks,
    };
  },
};
