// js/modules/dressing/index.js — module "dressing": the static THINGS of daily life across the whole city
// (SPEC 3.15 "roof and court dressing", 3.18, 9.5; research/R5-urban-life.md 3.1 to 3.4; STYLE 5.3).
//
//   library   kit.js (prototype builder), props.js (roofs, courts), props2.js (streets, markets, quays, lion
//             street): 45 kinds, 159 variants, each in three grades (hero / reduced / crude)
//   placing   on roofs and in courts from ctx.layout.roofAnchors / courtAnchors (fitted inside parapets, kerbs
//             and roof steps; near the film every anchor becomes a group and the roof gets a loose grid of roof
//             life), ladders at court edges, tools on parapets; along house fronts (never at a door, never on a
//             street axis); market pitches on gate squares, crossings and bridgeheads, sellers at temple fronts
//             and beside the Processional Way; cargo behind the quay walls and on landings, boat repair and nets
//             on the banks; incense stands on the lion street (R5 2.5, conjectural); refuse lots
//   keeping   out of every reservation of another module (people's roofs and street strip, riverworks' sheds and
//             landings, shrines), off the roof the camera stands on, 0.9 m and more from the film path
//   drawing   NOT instanced: 45 kinds x near tiles would cost hundreds of draw calls. Everything is merged per
//             256 m tile into four white materials (reed, fired clay, wood, cloth; all colour in the vertices):
//               L0  0 to 150 m      detail by the prop's own distance to the film path (hero < 45 m, reduced < 100 m)
//               L1  150 to 450 m    crude shapes, one material, no shadow casting (a shadow proxy per 1024 m
//                                   cell stands in for awnings, booths, stalls and cloth lines)
//               L2  beyond 450 m    one flat quad per mat, awning, cloth line ... in 1024 m tiles (the colour
//                                   specks of the roofscape in the aerial shots)
//             Measured: 21 to 52 draw calls in the main pass, 1.7 M triangles in memory, 0.8 s to build.
//   night     nothing: ovens that smoke are declared as emitters (unless `houses` already did), nightfx draws.
//   debug=1   lays every variant of every kind out in its three grades at x -9000, z 5200 (the prop sheet).
// Notes and sources: docs/mod-dressing.md.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { PB, Bin, SLOT } from './kit.js';
import { HOUSE_KINDS, ladder } from './props.js';
import { TOWN_KINDS } from './props2.js';

const D0 = 150, D1 = 450;                 // LOD bounds (tile distance)
const GRADE_A = 45, GRADE_B = 100;        // prop detail by distance to the film path
const NEAR_HOUSE = 230;                   // houses nearer than this to the film path get the extras (tools, benches, door things)
const LIFT = { roof: 0.02, court: 0.04, street: 0.07, square: 0.07, quay: 0.06, lion: 0.07 };
const KINDS = { ...HOUSE_KINDS, ...TOWN_KINDS, ladder: { n: 2, f: null } };
const KIND_INDEX = Object.fromEntries(Object.keys(KINDS).map((k, i) => [k, i]));

export default {
  name: 'dressing',
  claims: [],

  async build(ctx) {
    const { geom, layout, ground, materials, film, THREE, world } = ctx;
    const T = geom.TILE, CELL = 1024;
    const stats = { placed: 0, byKind: {}, grade: [0, 0, 0], gradeTris: [0, 0, 0], skippedCorridor: 0, skippedReserved: 0, skippedFit: 0 }, checks = [];

    // ---- palette: linear albedo; ids through the registry (never hex(id)), other colours softened like the registry's albedo rule
    const lin = (c) => [c.r, c.g, c.b];
    const id = (name, k = 1) => lin(materials.color(name)).map((v) => v * k);
    const hx = (hex, chroma = 0.86) => { const c = lin(new THREE.Color(hex)), y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map((v) => y + (v - y) * chroma); };
    const P = {
      white: [1, 1, 1],
      reed: id('reedMat'), reedOld: hx(0xa8935f), reedDark: hx(0x86724a), reedGrey: hx(0xa39678, 0.6), rope: hx(0x9c8459), frond: hx(0xb09a62), straw: id('stubble'),
      palmWood: id('palmWood'), palmTrunk: id('palmTrunk'), cedar: id('cedar'), woodCut: hx(0xb89f78), brush: hx(0x6b5b48), poplar: hx(0x8a7c68),
      clayRed: id('bakedBrickRed'), clayBuff: id('bakedBrickBuff'), clayPale: hx(0xd6caa2), clayGreen: hx(0xc3c29a), clayDark: hx(0x5c4a3c), soot: hx(0x1f1b18), dung: hx(0x5e4d38),
      mud: id('mudPlaster'), earth: id('streetEarthDamp'), dirt: hx(0x6f5d47, 0.9), limestone: id('limestone', 0.78), breccia: id('breccia'), basalt: hx(0x38383b), bitumen: id('bitumen'), copper: id('bronze'),
      woolCream: id('woolCream'), woolOatmeal: id('woolOatmeal'), woolBrown: id('woolBrown'), woolDark: id('woolDark'), linen: id('linenWhite'), goat: hx(0x221d1a), net: hx(0x7d6f5a, 0.8),
      madder: id('dyeMadderRed'), indigo: id('dyeIndigo'), saffron: id('dyeSaffron'), purple: id('dyePurple'),
      dates: hx(0x6f4424), datesAmber: hx(0xb07a2c), grain: id('barleyRipe'), onion: hx(0xc49a62), garlic: hx(0xe2dccb), sesame: hx(0x8a7858), greens: hx(0x6c8a42), pomegranate: hx(0x9a3d30),
      flour: hx(0xe6ddc6), bread: hx(0xc9a26a), ash: hx(0x9b958b), fish: hx(0x9aa3a6), water: hx(0x47564a),
    };
    const UNDYED = [[P.woolCream, 0.32], [P.linen, 0.14], [P.woolOatmeal, 0.26], [P.woolBrown, 0.18], [P.woolDark, 0.1]];
    const DYES = [[P.madder, 0.42], [P.indigo, 0.3], [P.saffron, 0.22], [P.purple, 0.06]];
    const wpick = (list, u) => { for (const [c, w] of list) { u -= w; if (u <= 0) return c; } return list[0][0]; };

    // ---- materials: four white variants, every colour in the vertices -------------------------------------
    const mats = [
      materials.variant('reedMat', { name: 'dressing-reed', color: 0xffffff }),
      materials.preset('pottery', { name: 'dressing-clay', color: 0xffffff }),
      materials.variant('palmWood', { name: 'dressing-wood', color: 0xffffff }),
      materials.variant('woolCream', { name: 'dressing-cloth', color: 0xffffff }),
    ];
    const FAR = SLOT.CLOTH;                // the crude and flat levels use the cloth material alone

    // ---- the film path: detail and levels of detail follow it ---------------------------------------------
    const path = [];
    for (let t = 0; t <= film.duration + 1e-6; t += 0.05) path.push(film.pathPoseAt(t).pos);
    const NP = path.length, PX = new Float32Array(NP), PY = new Float32Array(NP), PZ = new Float32Array(NP);
    path.forEach((p, i) => { PX[i] = p[0]; PY[i] = p[1]; PZ[i] = p[2]; });
    const pathD = (x, y, z) => { let d = Infinity; for (let i = 0; i < NP; i++) { const dx = PX[i] - x, dy = PY[i] - y, dz = PZ[i] - z, dd = dx * dx + dy * dy + dz * dz; if (dd < d) d = dd; } return Math.sqrt(d); };
    const squareD = (tx, tz, size) => { let d = Infinity; const x0 = tx * size, z0 = tz * size; for (let i = 0; i < NP; i++) { const dx = Math.max(x0 - PX[i], 0, PX[i] - x0 - size), dz = Math.max(z0 - PZ[i], 0, PZ[i] - z0 - size), dd = dx * dx + dz * dz + PY[i] * PY[i]; if (dd < d) d = dd; } return Math.sqrt(d); };
    const tileNear = new Map(), cellNearM = new Map(), key = (a, b) => (a + 2048) * 8192 + (b + 2048);
    const isTileNear = (tx, tz) => { const k = key(tx, tz); let v = tileNear.get(k); if (v === undefined) tileNear.set(k, (v = squareD(tx, tz, T) < D0 * 1.08)); return v; };
    const isCellNear = (cx, cz) => { const k = key(cx, cz); let v = cellNearM.get(k); if (v === undefined) cellNearM.set(k, (v = squareD(cx, cz, CELL) < D1 * 1.08)); return v; };

    // the four low cameras (SPEC 9.5: 25 figures, animals or props within 30 m): counted while placing
    const low = [2, 5, 7, 8].map((n) => { const s = film.shots.find((q) => q.n === n); return s ? { n, a: film.pathPoseAt(s.tHold).pos, b: film.pathPoseAt(s.t1 - 0.02).pos, look: film.pathPoseAt(s.tHold).look, count: 0 } : null; }).filter(Boolean);
    const segD = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], L2 = vx * vx + vy * vy + vz * vz, t = L2 > 0 ? M.clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy + (p[2] - a[2]) * vz) / L2) : 0; return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t, p[2] - a[2] - vz * t); };
    const roofShot = film.shots.find((s) => s.raw && s.raw.onRoofOf), stand = roofShot ? film.pathPoseAt(roofShot.tHold) : null;
    let minApproach = Infinity;

    // ---- reservations of other modules (people's vignettes, shrines, landings): nothing of ours inside ----
    const foreign = layout.reserved.filter((r) => r.owner !== 'world' && r.owner !== 'dressing');
    const reservedAt = (x, z, pad = 0.3) => { for (const r of foreign) { const p = (r.margin || 0) + pad; if (M.inBBox(r.bb, x, z, p) && (M.pointInPolygon(x, z, r.polygon) || M.distToRing(x, z, r.polygon) < p)) return true; } return false; };

    // ---- prototypes ------------------------------------------------------------------------------------------
    const protos = new Map();
    let protoTris = 0, flipped = 0;
    function proto(kind, v, lod, extra = 0) {
      const k = kind + '|' + v + '|' + lod + '|' + extra;
      let p = protos.get(k);
      if (!p) {
        const b = new PB(), ki = KIND_INDEX[kind], q = (n) => hash2(n | 0, v * 131 + ki * 7919, 77);
        if (kind === 'ladder') ladder(b, extra / 4, lod, P, v === 1); else KINDS[kind].f(b, q, lod, P, v);
        p = b.done(); protos.set(k, p); protoTris += p.tris;
      }
      return p;
    }

    // ---- bins ------------------------------------------------------------------------------------------------
    const L0 = new Map(), L1 = new Map(), L2 = new Map(), PXY = new Map();
    const binOf = (map, k, n) => { let a = map.get(k); if (!a) { a = { tx: 0, tz: 0, bins: [] }; for (let i = 0; i < n; i++) a.bins.push(null); map.set(k, a); } return a; };
    const need = (a, i) => a.bins[i] || (a.bins[i] = new Bin());
    const ONE = [1, 1, 1];
    const SMALL = new Set(['jars', 'baskets', 'tools', 'roller', 'firewood', 'quern', 'mortar', 'hearth', 'waterstand', 'bench', 'sacks', 'bricks', 'fronds', 'panniers', 'trough', 'incense', 'ropes']);

    /**
     * Place one prop. Returns false if it was refused (film corridor).
     * o: { k: scale, d: distance to the film path if known, dye: true = a dyed accent for certain, far: shade of the crude level
     *      (0.62 in a court), tall: height for the corridor test, extra: ladder height x 4, mud: [r, g, b] tint of role-1 clay (benches) }
     */
    function put(kind, v, x, y, z, rotDeg, o = {}) {
      const def = KINDS[kind]; v = ((v % def.n) + def.n) % def.n;
      const tx = Math.floor(x / T), tz = Math.floor(z / T), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      const cellN = isCellNear(cx, cz), near = cellN && isTileNear(tx, tz), scale = o.k ?? 1;
      if (SMALL.has(kind)) o.noFar = true;                     // a jar is a pixel at 150 m: no far level
      if (o.noFar && !near) return false;                      // things nobody can see from 150 m (the floor of a court, a jar at a door)
      const u1 = hash2(Math.round(x * 20), Math.round(z * 20), 11 + KIND_INDEX[kind]), u2 = hash2(Math.round(x * 20), Math.round(z * 20), 23), u3 = hash2(Math.round(x * 20), Math.round(z * 20), 37);
      // tints of this instance: reed tone, cloth colour, accent
      // reed: mostly sun-bleached grey-straw, some mats new and yellow (R5 6: #C8AE6A new, #A8935F weathered)
      const rk = 0.84 + 0.26 * u2, rf = u1 * u1, reedT = [0, 1, 2].map((i) => rk * (P.reedGrey[i] + (P.reed[i] - P.reedGrey[i]) * rf) / P.reed[i]);
      const clothT = wpick(UNDYED, u1), dyed = o.dye || u3 < 0.3, accent = dyed ? wpick(DYES, u2) : wpick(UNDYED, (u1 + 0.37) % 1);
      const tints = [reedT, o.mud || ONE, ONE, clothT];
      let d = Infinity;
      if (cellN) {
        d = o.d ?? pathD(x, y + 0.8, z);
        // the camera must never fly through a thing: test the top and the middle against the exact path
        if (d < 14) {
          const h = (o.tall ?? proto(kind, v, 2, o.extra || 0).h) * scale, r = Math.min(1.6, proto(kind, v, 2, o.extra || 0).r * scale);
          const a = Math.min(film.nearestApproach([x, y + h, z]).dist, film.nearestApproach([x, y + h * 0.5, z]).dist, film.nearestApproach([x, y + 0.1, z]).dist);
          if (a < 0.9 + r * 0.7) { stats.skippedCorridor++; return false; }
          if (a - r * 0.7 < minApproach) minApproach = a - r * 0.7;
        }
      }
      const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG);
      if (near) {
        const grade = d < GRADE_A ? 0 : d < GRADE_B ? 1 : 2, p = proto(kind, v, grade, o.extra || 0), a = binOf(L0, key(tx, tz), 4); a.tx = tx; a.tz = tz;
        for (let i = 0; i < 4; i++) if (p.slots[i]) need(a, i).add(p.slots[i], x, y, z, c, s, scale, tints[i], accent, 1);
        stats.grade[grade]++; stats.gradeTris[grade] += p.tris;
      }
      if (cellN && !o.noFar) {
        const p = proto(kind, v, 2, o.extra || 0), a = binOf(L1, key(tx, tz), 1), far = o.far ?? 1; a.tx = tx; a.tz = tz; a.near = near;
        for (let i = 0; i < 4; i++) if (p.slots[i]) need(a, 0).add(p.slots[i], x, y, z, c, s, scale, tints[i], accent, far);
        if (def.proxy) { const b = binOf(PXY, key(cx, cz), 1); b.tx = cx; b.tz = cz; need(b, 0).boxAt(x, y + def.proxy[2] * scale, y + def.proxy[3] * scale, z, def.proxy[0] * scale / 2, def.proxy[1] * scale / 2, c, s); }
      }
      if (def.flat && !o.noFar) {
        const f = def.flat, a = binOf(L2, key(cx, cz), 1); a.tx = cx; a.tz = cz; a.near = cellN;
        const role = def.flatRole ? def.flatRole[v] : f[4], base = def.flatCol ? P[def.flatCol[v]] : P[f[3]], t = role === 1 ? (f[3] === 'white' ? clothT : reedT) : role === 2 ? accent : ONE, far = (o.far ?? 1) * 0.97;
        need(a, 0).flat(x, y + Math.max(0.12, f[2] * scale), z, f[0] * scale / 2, f[1] * scale / 2, c, s, [base[0] * t[0] * far, base[1] * t[1] * far, base[2] * t[2] * far]);
      }
      stats.placed++; stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
      for (const L of low) if (segD([x, y + 0.5, z], L.a, L.b) < 30) L.count++;
      return true;
    }

    // ---- helpers of the placing ---------------------------------------------------------------------------
    const hq = (h, k) => hash2(h.seed & 0xffff, h.seed >>> 16, k);
    const partAt = (parts, x, z) => { for (const p of parts) if (M.pointInPolygon(x, z, p.polygon)) return p; return null; };
    const parapetOf = (h) => (h.cls === 'mansion' ? 0.86 : h.cls === 'large' ? 0.7 : h.cls === 'medium' ? 0.57 : 0.47);      // what `houses` builds, plus a hand
    /** Is the rectangle (centre x, z; half sizes hw, hd; rotDeg) on roof part `part`, clear of its parapet, of the courts and their kerbs? */
    function rectOnRoof(h, part, x, z, rotDeg, hw, hd, pt) {
      const c = Math.cos(rotDeg * M.DEG), s = Math.sin(rotDeg * M.DEG);
      for (const [lx, lz] of [[0, 0], [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
        const px = x + lx * c - lz * s, pz = z + lx * s + lz * c;
        if (!M.pointInPolygon(px, pz, part.polygon) || M.distToRing(px, pz, part.polygon) < pt) return false;
        for (const ct of h.courts) if (M.pointInPolygon(px, pz, ct) || M.distToRing(px, pz, ct) < 0.55) return false;
      }
      return true;
    }
    /** Fit a rectangle near (x, z) on the roof: as given, smaller, or moved toward the middle of the part. -> { x, z, k } | null */
    function fitOnRoof(h, part, x, z, rotDeg, hw, hd, pt) {
      const cen = M.polygonCentroid(part.polygon);
      for (const k of [1, 0.85, 0.72]) for (let st = 0; st < 4; st++) {
        const dx = cen[0] - x, dz = cen[1] - z, l = Math.hypot(dx, dz) || 1, px = x + (dx / l) * Math.min(l, 0.45 * st), pz = z + (dz / l) * Math.min(l, 0.45 * st);
        if (rectOnRoof(h, part, px, pz, rotDeg, hw * k, hd * k, pt)) return { x: px, z: pz, k };
      }
      return null;
    }
    const SIZE = {            // half sizes of what stands on a roof anchor (local x, z), after the builders of props.js
      mat: [0.98, 1.35], bedding: [0.65, 0.98], drying: [1.18, 0.8], clothline: [1.75, 0.3], rack: [1.0, 0.4], jars: [0.62, 0.55], baskets: [0.5, 0.45], oven: [0.95, 0.95],
      awning: [1.65, 1.35], booth: [1.45, 1.25], loomH: [0.75, 1.75], roller: [0.4, 0.7], firewood: [0.65, 0.5],
    };

    // ---- 1. houses: roofs and courts ----------------------------------------------------------------------------
    const built = layout.houses.filter((h) => layout.isBuilt(h));
    const eyeTop = stand ? stand.pos[1] - 0.6 : Infinity, viewAz = stand ? M.dirToAz(stand.look[0] - stand.pos[0], stand.look[2] - stand.pos[2]) : 0, viewDir = M.azToDir(viewAz);
    /** Would a thing with its top at `top` stand in the view of the roof camera of shot 8? (tall things near the horizon line) */
    const blocksRoofView = (x, z, top) => { if (!stand || top < eyeTop) return false; const dx = x - stand.pos[0], dz = z - stand.pos[2], dist = Math.hypot(dx, dz); return dist < 420 && Math.abs(M.angleDiffDeg(viewAz, M.dirToAz(dx, dz))) < 50; };
    const TALL = { awning: 2.3, booth: 2.15, clothline: 1.9, rack: 1.35, loomV: 2.05 };
    const smokeHere = new Set();          // ovens we drew, by house id
    let roofItems = 0, courtItems = 0, ladders = 0, extras = 0;
    const roomsOf = new Map();
    for (const rm of (ctx.modules.houses && ctx.modules.houses.roofRooms) || []) {
      if (!rm || !rm.center || !rm.ring) continue;
      const r = Math.max(...rm.ring.map((p) => Math.hypot(p[0] - rm.center[0], p[1] - rm.center[1]))) + 0.35;
      if (!roomsOf.has(rm.house)) roomsOf.set(rm.house, []);
      roomsOf.get(rm.house).push([rm.center[0], rm.center[1], r]);
    }

    for (const h of built) {
      const cx = Math.floor(h.center[0] / CELL), cz = Math.floor(h.center[1] / CELL), cellN = isCellNear(cx, cz);
      const items = layout.roofAnchors(h).items, parts = layout.roofParts(h);
      const dH = cellN ? pathD(h.center[0], h.roofLevel, h.center[1]) : Infinity, close = dH < NEAR_HOUSE, pt = parapetOf(h);
      const taken = [];                    // what stands on this house: [x, z, r]
      for (const rm of roomsOf.get(h.id) || []) taken.push(rm);          // the roof room `houses` built (ctx.modules.houses.roofRooms)
      const free = (x, z, r) => { for (const q of taken) if (Math.hypot(q[0] - x, q[1] - z) < q[2] + r) return false; return true; };

      // -- roof anchors: each becomes a small group near the film (beds in a row, mats side by side, crops on several mats)
      const hero = !!stand && Math.hypot(h.center[0] - stand.pos[0], h.center[1] - stand.pos[2]) < 100 && (h.center[0] - stand.pos[0]) * viewDir[0] + (h.center[1] - stand.pos[2]) * viewDir[1] > -12;
      const rank = h.cls === 'mansion' || h.landmark ? 4 : h.cls === 'large' ? 3 : h.cls === 'medium' ? 2 : 1;
      const onCameraRoof = (part) => !!stand && M.pointInPolygon(stand.pos[0], stand.pos[2], part.polygon);
      /** Try to stand `kind` at (x, z) on the roof; returns true when placed. */
      const onRoof = (kind, v, x, z, rot, k, exact, o = {}) => {
        const part = partAt(parts, x, z);
        if (!part || onCameraRoof(part)) return false;
        if (TALL[kind] && blocksRoofView(x, z, part.level + TALL[kind])) kind = 'mat';
        const sz = SIZE[kind] || [0.6, 0.6];
        let fit = exact ? (rectOnRoof(h, part, x, z, rot, sz[0] * k, sz[1] * k, pt) ? { x, z, k: 1 } : null) : fitOnRoof(h, part, x, z, rot, sz[0] * k, sz[1] * k, pt);
        if (!fit && !exact) { fit = fitOnRoof(h, part, x, z, rot, 0.5, 0.45, pt); if (fit) { kind = v % 2 ? 'baskets' : 'jars'; k = 1; } }
        if (!fit) { stats.skippedFit++; return false; }
        if (reservedAt(fit.x, fit.z)) { stats.skippedReserved++; return false; }
        const rad = Math.hypot(sz[0], sz[1]) * k * fit.k;
        if (!free(fit.x, fit.z, rad * 0.62)) return false;
        if (!put(kind, v, fit.x, part.level + LIFT.roof, fit.z, rot, { k: k * fit.k, d: dH, dye: kind === 'rack' || (kind === 'drying' && v % 6 === 4), ...o })) return false;
        taken.push([fit.x, fit.z, rad * 0.62]);
        return { x: fit.x, z: fit.z, kind };
      };
      const ROW = { mat: [2.2, 2], bedding: [1.5, 4], drying: [2.6, 3], jars: [1.35, 1], baskets: [1.15, 1] };          // pitch along the thing's own x, most copies
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'ladder') continue;
        const u = hq(h, 200 + i * 7), u2 = hq(h, 201 + i * 7), v = Math.floor(hq(h, 210 + i * 7) * 97);
        let kind = it.kind, rot = it.rotDeg;
        if (kind === 'drying') kind = u < 0.68 ? 'drying' : u < 0.87 ? 'clothline' : 'rack';
        else if (kind === 'jars') kind = u < 0.78 ? 'jars' : 'baskets';
        else if (kind === 'loom') kind = 'loomH';
        else if (kind === 'bedding') rot += 90;
        if (!cellN) { if (put(kind, v, it.x, it.y + LIFT.roof, it.z, rot, { dye: kind === 'rack' || (kind === 'drying' && v % 6 === 4) })) roofItems++; continue; }       // far away: the flat only
        const done = onRoof(kind, v, it.x, it.z, rot, 0.94 + 0.12 * u2, false);
        if (!done) continue;
        roofItems++; if (it.kind === 'oven') smokeHere.add(h.id);
        const R = ROW[done.kind];
        if (R && close) {
          const want = Math.min(R[1], rank + (hero ? 1 : 0)), n = hero ? want : Math.floor(hq(h, 212 + i * 7) * (want + 1)), c = Math.cos(rot * M.DEG), s = Math.sin(rot * M.DEG);
          for (let j = 1, got = 0; got < n && j <= 2 * n + 2; j++) {
            const off = Math.ceil(j / 2) * R[0] * (j % 2 ? 1 : -1);
            if (onRoof(done.kind, v + j * 13, done.x + off * c, done.z + off * s, rot, 0.94 + 0.12 * hq(h, 213 + i * 7 + j), true)) { got++; extras++; }
          }
        }
        // what goes with it: fuel by the oven, a mat and a jar by the loom, baskets by the drying crop
        if (close && (done.kind === 'oven' || done.kind === 'loomH' || done.kind === 'drying' || done.kind === 'booth' || done.kind === 'awning')) {
          const a = 360 * hq(h, 214 + i * 7), sz = SIZE[done.kind], r = Math.max(sz[0], sz[1]) + 0.75, side = done.kind === 'oven' ? 'firewood' : done.kind === 'drying' ? 'baskets' : hq(h, 215 + i * 7) < 0.5 ? 'jars' : 'baskets';
          for (let t = 0; t < 3; t++) { const [dx, dz] = M.azToDir(a + t * 120); if (onRoof(side, v + 5, done.x + dx * r, done.z + dz * r, a, 1, true)) { extras++; break; } }
        }
      }

      // -- more on the roofs of houses near the film: tools on the parapets, then a loose grid of roof life
      //    (R5 3.1: in the hot months the household sleeps, cooks, weaves and dries its crops up here)
      if (close) {
        const nTools = Math.min(4, rank) + (hero ? 2 : 0);
        for (let e = 0; e < nTools; e++) {
          const F = h.footprint, cands = [];
          for (let i = 0; i + 1 < F.length; i++) if (h.sides[i] && h.sides[i].kind === 'p' && Math.hypot(F[i + 1][0] - F[i][0], F[i + 1][1] - F[i][1]) > 2.4) cands.push(i);
          if (!cands.length) break;
          const i = cands[Math.floor(hq(h, 301 + e * 5) * cands.length)], a = F[i], b = F[i + 1], t = 0.15 + 0.7 * hq(h, 302 + e * 5), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; const mx = a[0] + (b[0] - a[0]) * t, mz = a[1] + (b[1] - a[1]) * t;
          if (!M.pointInPolygon(mx + nx * 0.6, mz + nz * 0.6, F)) { nx = -nx; nz = -nz; }          // inward normal
          const inset = (pt - 0.12) + 0.14, x = mx + nx * inset, z = mz + nz * inset, part = partAt(parts, x + nx * 0.3, z + nz * 0.3);
          if (!part || onCameraRoof(part)) continue;
          if (!rectOnRoof(h, part, x + nx * 0.45, z + nz * 0.45, 0, 0.3, 0.3, pt - 0.1) || !free(x, z, 0.5) || reservedAt(x, z)) continue;
          if (put('tools', Math.floor(hq(h, 303 + e * 5) * 97), x, part.level + LIFT.roof, z, M.dirToAz(-nx, -nz), { k: M.clamp(part.parapet / 0.72, 0.85, 1.3), d: dH })) { taken.push([x, z, 0.6]); extras++; }
        }
        const step = hero ? 3.4 : dH < 90 ? 4.0 : 4.7, pFill = hero ? 0.85 : dH < 90 ? 0.66 : 0.55, bbH = M.bbox(h.footprint);
        // seen from the roof of shot 8 the neighbours' roofs lie at a grazing angle behind their parapets: there the things that stand up count
        const LOOSE = hero
          ? [['mat', 0.14], ['bedding', 0.12], ['drying', 0.1], ['jars', 0.12], ['baskets', 0.06], ['clothline', 0.14], ['rack', 0.07], ['loomH', 0.03], ['roller', 0.02], ['firewood', 0.04], ['awning', 0.09], ['booth', 0.04], ['oven', 0.03]]
          : [['mat', 0.2], ['bedding', 0.15], ['drying', 0.12], ['jars', 0.15], ['baskets', 0.1], ['clothline', 0.05], ['rack', 0.03], ['loomH', 0.03], ['roller', 0.03], ['firewood', 0.05], ['awning', 0.04], ['booth', 0.02], ['oven', 0.03]];
        for (let gz = bbH[1] + step * 0.5; gz < bbH[3]; gz += step) for (let gx = bbH[0] + step * 0.5; gx < bbH[2]; gx += step) {
          const ix = Math.round(gx * 2), iz = Math.round(gz * 2);
          if (hash2(ix, iz, 151) > pFill) continue;
          const x = gx + (hash2(ix, iz, 152) - 0.5) * step * 0.5, z = gz + (hash2(ix, iz, 153) - 0.5) * step * 0.5;
          if (!M.pointInPolygon(x, z, h.footprint)) continue;
          let u = hash2(ix, iz, 154), kind = 'mat'; for (const [k, w] of LOOSE) { u -= w; if (u <= 0) { kind = k; break; } }
          const rot = h.rotationDeg + 90 * Math.floor(hash2(ix, iz, 155) * 4) + (kind === 'mat' || kind === 'bedding' ? 24 * (hash2(ix, iz, 156) - 0.5) : 0), v = Math.floor(hash2(ix, iz, 157) * 97), k = 0.92 + 0.14 * hash2(ix, iz, 158);
          if (onRoof(kind, v, x, z, rot, k, true) || onRoof(v % 2 ? 'jars' : 'baskets', v, x, z, rot, 1, true)) extras++;
        }
      }

      // -- courts
      const g = h.groundLevel + LIFT.court, cTaken = [];
      const cFree = (x, z, r) => { for (const q of cTaken) if (Math.hypot(q[0] - x, q[1] - z) < q[2] + r) return false; return true; };
      const courts = !cellN ? null : h.courts.map((ct) => { const R = M.openRing(ct), n = R.length, cen = M.polygonCentroid(ct), edges = []; let longest = 0; for (let i = 0; i < n; i++) { const a = R[i], b = R[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); let ox = (b[1] - a[1]) / l, oz = -(b[0] - a[0]) / l; if ((a[0] + b[0]) / 2 * ox + (a[1] + b[1]) / 2 * oz < cen[0] * ox + cen[1] * oz) { ox = -ox; oz = -oz; } edges.push({ a, b, l, ox, oz }); if (l > edges[longest].l) longest = i; } return { ring: ct, cen, edges, longest }; });
      /** A place against the wall of court ci: edge e, share t along it, `depth` from the wall -> { x, z, rot } with the back to the wall */
      const atWall = (ci, e, t, depth) => { const E = courts[ci].edges[e]; return { x: E.a[0] + (E.b[0] - E.a[0]) * t - E.ox * depth, z: E.a[1] + (E.b[1] - E.a[1]) * t - E.oz * depth, rot: M.dirToAz(E.ox, E.oz), E }; };
      const inCourt = (ci, x, z, m) => M.pointInPolygon(x, z, courts[ci].ring) && M.distToRing(x, z, courts[ci].ring) >= m;
      const cAnch = layout.courtAnchors(h);
      for (const a of cAnch) if (a.kind === 'tree') cTaken.push([a.x, a.z, 1.3]);
      for (let i = 0; i < cAnch.length; i++) {
        const a = cAnch[i], ci = a.court, u = hq(h, 400 + i * 7), v = Math.floor(hq(h, 401 + i * 7) * 97);
        if (a.kind === 'tree') continue;
        if (!cellN) { if (a.kind === 'awning') put('awning', v, a.x, g, a.z, h.rotationDeg, { far: 0.62 }); continue; }          // far away only what shows from the air
        let kind = a.kind, x = a.x, z = a.z, rot = h.rotationDeg + 90 * Math.floor(u * 4), rad = 0.7, m = 0.5;
        if (kind === 'jars') { if (u < 0.5) { kind = 'pithoi'; } else kind = 'jars'; }
        if (kind === 'loom' || kind === 'pithoi' || kind === 'trough') {        // these stand against a wall: the nearest one that is not the stair wall
          let best = -1, bd = Infinity; const C = courts[ci];
          for (let e = 0; e < C.edges.length; e++) { if (ci === 0 && e === C.longest) continue; const E = C.edges[e], dd = M.distToSegment(x, z, E.a[0], E.a[1], E.b[0], E.b[1])[0]; if (dd < bd && E.l > 2.2) { bd = dd; best = e; } }
          if (best < 0) continue;
          const E = C.edges[best], tt = M.clamp(((x - E.a[0]) * (E.b[0] - E.a[0]) + (z - E.a[1]) * (E.b[1] - E.a[1])) / (E.l * E.l), 1.1 / E.l, 1 - 1.1 / E.l), w = atWall(ci, best, tt, kind === 'trough' ? 0.4 : kind === 'pithoi' ? 0.32 : 0.12);
          x = w.x; z = w.z; rot = w.rot; if (kind === 'loom') kind = 'loomV'; rad = 0.9; m = 0.1;
        } else if (kind === 'oven') { rad = 0.9; m = 0.6; const C = courts[ci], dx = C.cen[0] - x, dz = C.cen[1] - z, l = Math.hypot(dx, dz) || 1; if (!inCourt(ci, x, z, 0.75)) { x += (dx / l) * 0.5; z += (dz / l) * 0.5; } }
        else if (kind === 'awning') { rad = 1.9; m = 1.5; rot = h.rotationDeg; }
        if (!inCourt(ci, x, z, m) || !cFree(x, z, rad * 0.7) || reservedAt(x, z)) { stats.skippedFit++; continue; }
        cTaken.push([x, z, rad]);
        if (put(kind, v, x, g, z, rot, { d: dH, far: 0.62, k: kind === 'awning' ? 0.9 : 1, noFar: kind !== 'awning' && kind !== 'oven' && kind !== 'pithoi' })) { courtItems++; if (a.kind === 'oven') smokeHere.add(h.id); }
      }
      if (cellN) {
        // -- the ladder to the roof: at the edge of the first court, leaning on the kerb of the roof behind it
        const lad = items.find((q) => q.kind === 'ladder');
        if (lad && h.courts.length) {
          const C = courts[0]; let best = -1, bd = Infinity;
          for (let e = 0; e < C.edges.length; e++) {
            if (e === C.longest) continue;
            const E = C.edges[e], mx = (E.a[0] + E.b[0]) / 2 + E.ox * 0.7, mz = (E.a[1] + E.b[1]) / 2 + E.oz * 0.7, part = partAt(parts, mx, mz);
            if (!part || part.level - h.groundLevel > 5.6 || E.l < 1.6) continue;
            const dd = M.distToSegment(lad.x, lad.z, E.a[0], E.a[1], E.b[0], E.b[1])[0] + (part.level - h.groundLevel) * 0.6;
            if (dd < bd) { bd = dd; best = e; }
          }
          if (best >= 0) {
            const E = C.edges[best], part = partAt(parts, (E.a[0] + E.b[0]) / 2 + E.ox * 0.7, (E.a[1] + E.b[1]) / 2 + E.oz * 0.7), H = part.level + 0.3 - h.groundLevel;
            const t = 0.25 + 0.5 * hq(h, 500), w = atWall(0, best, t, 0.06), run = Math.max(0.7, H * 0.26);
            if (inCourt(0, w.x - E.ox * run, w.z - E.oz * run, 0.2) && cFree(w.x - E.ox * run * 0.5, w.z - E.oz * run * 0.5, 0.5) && !reservedAt(w.x, w.z)) {
              cTaken.push([w.x - E.ox * run * 0.5, w.z - E.oz * run * 0.5, 0.7]);
              // the foot stands `run` out from the wall; the prototype leans toward its own -z
              if (put('ladder', hq(h, 501) < 0.12 ? 1 : 0, w.x - E.ox * run, g, w.z - E.oz * run, w.rot, { d: dH, far: 0.7, extra: Math.round(H * 4), tall: H + 0.5 })) ladders++;
            }
          }
        }
        // -- extras in the courts of houses near the film: what stands along the walls
        if (close) {
          const wallKinds = ['bench', 'pithoi', 'waterstand', 'firewood', 'baskets', 'tools', 'jars', 'bench'], floorKinds = ['quern', 'hearth', 'mortar', 'baskets', 'jars'];
          for (let ci = 0; ci < courts.length; ci++) {
            const C = courts[ci], per = C.edges.reduce((s, e) => s + e.l, 0), n = Math.min(7, Math.round(per / (h.landmark ? 5 : 7.5) + (dH < 90 ? 1 : 0)));
            for (let e = 0; e < n; e++) {
              const u = hq(h, 600 + ci * 40 + e * 5), v = Math.floor(hq(h, 601 + ci * 40 + e * 5) * 97);
              if (u < 0.7) {
                const ei = Math.floor(hq(h, 602 + ci * 40 + e * 5) * C.edges.length);
                if ((ci === 0 && ei === C.longest) || C.edges[ei].l < 2.4) continue;
                const kind = wallKinds[Math.floor(hq(h, 603 + ci * 40 + e * 5) * wallKinds.length)], depth = kind === 'bench' ? 0.03 : kind === 'pithoi' ? 0.32 : kind === 'tools' ? 0.22 : 0.45;
                const tt = 1.0 / C.edges[ei].l + (1 - 2.0 / C.edges[ei].l) * hq(h, 604 + ci * 40 + e * 5), w = atWall(ci, ei, tt, depth);
                if (!inCourt(ci, w.x, w.z, 0.02) || !cFree(w.x, w.z, 0.75) || reservedAt(w.x, w.z)) continue;
                cTaken.push([w.x, w.z, kind === 'pithoi' || kind === 'bench' ? 1.1 : 0.7]);
                if (put(kind === 'tools' ? 'reedLean' : kind, v, w.x, g, w.z, w.rot, { d: dH, far: 0.62, k: kind === 'tools' ? 0.8 : 1, noFar: true })) extras++;
              } else {
                const kind = floorKinds[Math.floor(hq(h, 605 + ci * 40 + e * 5) * floorKinds.length)], bb = M.bbox(C.ring), x = M.lerp(bb[0], bb[2], 0.2 + 0.6 * hq(h, 606 + ci * 40 + e * 5)), z = M.lerp(bb[1], bb[3], 0.2 + 0.6 * hq(h, 607 + ci * 40 + e * 5));
                if (!inCourt(ci, x, z, 1.0) || Math.hypot(x - C.cen[0], z - C.cen[1]) < 1.2 || !cFree(x, z, 0.9) || reservedAt(x, z)) continue;          // the middle stays free (the lamp of the house stands there at night)
                cTaken.push([x, z, 0.9]);
                if (put(kind, v, x, g, z, 360 * hq(h, 608 + ci * 40 + e * 5), { d: dH, far: 0.62, noFar: true })) extras++;
              }
            }
          }
        }
      }
    }
    stats.roofItems = roofItems; stats.courtItems = courtItems; stats.ladders = ladders; stats.houseExtras = extras;

    // ---- 2. along the house fronts: things at doors and against blank walls -------------------------------------
    const onMonument = (x, z) => { const zn = ground.zone(x, z); return zn.zone === 'monument' || zn.zone === 'precinctCourt' || zn.water; };
    // a door keeps r metres free; where `houses` builds a bench or a jar stand beside the door (its detail.js draws
    // hq(h, 207) < 0.33, up to 3.8 m along the wall) the free stretch is 4.4 m
    const doorsNear = (x, z, r) => { for (const q of layout.housesNear(x, z, r + 6)) { if (!q.door) continue; const d = Math.hypot(q.door[0] - x, q.door[1] - z); if (d < r || (d < 4.4 && hq(q, 207) < 0.33)) return true; } return false; };
    const streetLevel = (x, z) => { const sp = layout.nearestStreetPoint(x, z, { maxDist: 14 }); return Math.max(ground.height(x, z), sp && sp.street.levels ? sp.level : -1e9); };
    const heroStreet = layout.streetById('merkes0');
    const altars = [];
    for (const m of world.monuments) { if (m.dims && Array.isArray(m.dims.streetAltars)) for (const a of m.dims.streetAltars) altars.push(a); if (m.dims && Array.isArray(m.dims.altar) && typeof m.dims.altar[0] === 'number') altars.push(m.dims.altar); }
    const nearAltar = (x, z, r) => altars.some((a) => Math.hypot(a[0] - x, a[1] - z) < r);
    // kind, weight, distance of its origin from the wall, half width along the wall
    const FRONT = [['pithoi', 0.14, 0.32, 1.0], ['jars', 0.14, 0.42, 0.62], ['sacks', 0.12, 0.5, 0.75], ['reedLean', 0.13, 0.1, 0.7], ['baskets', 0.09, 0.42, 0.55], ['bricks', 0.07, 0.05, 0.9], ['firewood', 0.08, 0.42, 0.7], ['bench', 0.1, 0.03, 1.1], ['fronds', 0.03, 0.5, 1.4], ['panniers', 0.05, 0.45, 0.7], ['trough', 0.03, 0.4, 0.9], ['refuse', 0.02, 0.8, 1.3]];
    let frontItems = 0;
    for (const h of built) {
      if (!isCellNear(Math.floor(h.center[0] / CELL), Math.floor(h.center[1] / CELL))) continue;
      const dH = pathD(h.center[0], h.groundLevel + 1.5, h.center[1]);
      if (dH > 330) continue;
      const F = h.footprint;
      for (let i = 0; i + 1 < F.length; i++) {
        const sd = h.sides[i];
        if (!sd || (sd.kind !== 's' && sd.kind !== 'o')) continue;
        const open = sd.kind === 'o' || !sd.street, st = open ? null : layout.streetById(sd.street);       // a front on a square or forecourt, or on a street
        if (!open && (!st || st.cls === 'road' || st.cls === 'processional')) continue;
        const a = F[i], b = F[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 2.5) continue;
        let ox = (b[1] - a[1]) / l, oz = -(b[0] - a[0]) / l;
        if (M.pointInPolygon((a[0] + b[0]) / 2 + ox * 0.5, (a[1] + b[1]) / 2 + oz * 0.5, F)) { ox = -ox; oz = -oz; }                      // outward normal
        const hero = st === heroStreet || (open && dH < 45), p = hero ? 0.9 : dH < 120 ? 0.34 : 0.15, pitch = hero ? 2.5 : 3.6, n = Math.floor((l - 1.0) / pitch);
        for (let k = 0; k < n; k++) {
          if (hash2(h.id, i * 131 + k, 71) > p) continue;
          const t = (0.8 + pitch * (k + 0.2 + 0.6 * hash2(h.id, i * 131 + k, 72))) / l, u = hash2(h.id, i * 131 + k, 73);
          let pick = FRONT[0], acc = 0; for (const f of FRONT) { acc += f[1]; if (u <= acc) { pick = f; break; } }
          const [kind, , depth, rad] = pick, wx = a[0] + (b[0] - a[0]) * t, wz = a[1] + (b[1] - a[1]) * t, x = wx + ox * (depth + 0.06), z = wz + oz * (depth + 0.06);
          const sp = open ? null : layout.nearestStreetPoint(x, z, { maxDist: 12 });
          if (!open) {
            if (!sp) continue;
            const half = sp.width / 2, reach = depth + rad * 0.75;                     // how far the thing stands out from the wall
            if (sp.width < 1.9 || reach > Math.max(0.55, half - 0.95) || (hero && sp.dist < 1.35)) continue;      // the way stays open (and the axis of the camera's street)
            if (kind === 'refuse' && sp.width < 4) continue;
          } else if (onMonument(x, z)) continue;
          if (doorsNear(wx, wz, 1.7 + rad * 0.5) || nearAltar(x, z, 2.6) || reservedAt(x, z, 0)) continue;
          let cross = false; for (const q of layout.streetsNear(x, z, 9)) if ((open || q.street !== sp.street) && q.dist < q.street.width / 2 + rad + 0.3) { cross = true; break; }
          if (cross) continue;
          if (layout.houseAt(x + ox * rad * 0.5, z + oz * rad * 0.5)) continue;       // a kink of the street: another house stands there
          const y = streetLevel(x, z) + LIFT.street, v = Math.floor(hash2(h.id, i * 131 + k, 74) * 97);
          if (put(kind, v, x, y, z, M.dirToAz(-ox, -oz), { far: 0.8, k: kind === 'refuse' ? 0.55 : kind === 'pithoi' ? 0.85 : 1, noFar: true })) frontItems++;
        }
      }
    }
    // the street of shot 7: an ox cart stands unhitched against the south wall ahead of the camera (R5 3.3: carts with solid wheels)
    if (heroStreet && low.some((L) => L.n === 7)) {
      const cam = low.find((L) => L.n === 7), dir = [cam.b[0] - cam.a[0], cam.b[2] - cam.a[2]], dl = Math.hypot(dir[0], dir[1]) || 1;
      for (const [ahead, side, kind, v, off] of [[17, 1, 'cart', 1, 1.3], [26, -1, 'sledge', 1, 0.95], [34, 1, 'cart', 0, 1.3], [44, -1, 'panniers', 0, 0.6]]) {
        for (const tryAhead of [ahead, ahead + 2.5, ahead - 2.5, ahead + 5]) {
          const px = cam.a[0] + (dir[0] / dl) * tryAhead, pz = cam.a[2] + (dir[1] / dl) * tryAhead, sp = layout.nearestStreetPoint(px, pz, { maxDist: 8 });
          if (!sp || sp.street !== heroStreet) continue;
          const r = M.rightOf(sp.dir[0], sp.dir[1]), sg = (r[0] * -dir[1] + r[1] * dir[0] > 0 ? 1 : -1) * side;          // side +1 = the camera's left (south, walking west)
          const x = sp.x - r[0] * sg * (sp.width / 2 - off), z = sp.z - r[1] * sg * (sp.width / 2 - off);
          if (layout.houseAt(x, z) || layout.houseAt(x - r[0] * sg * 0.7, z - r[1] * sg * 0.7) || doorsNear(x, z, 3.2) || reservedAt(x, z, 1.2) || nearAltar(x, z, 3.5) || onMonument(x, z)) continue;
          if (!layout.houseAt(x - r[0] * sg * (off + 0.6), z - r[1] * sg * (off + 0.6))) continue;                       // it stands against a house wall, not in an opening
          if (put(kind, v, x, streetLevel(x, z) + LIFT.street, z, M.dirToAz(sp.dir[0], sp.dir[1]) + (ahead % 2 ? 180 : 0), { far: 0.8 })) { frontItems++; break; }
        }
      }
    }
    stats.frontItems = frontItems;

    // The brick quays are up to 5.25 m thick (SPEC 3.2): cargo stands behind them, 6.5 m and more from the water.
    const riverEdges = (ground.hardEdges || []).filter((e) => e.kind === 'quay' && e.body === 'river');
    const edgeDist = (x, z) => { let d = Infinity; for (const e of riverEdges) { if (M.polylineLength(e.polyline) < 50) continue; const q = M.distToPolyline(x, z, e.polyline); if (q < d) d = q; } return d; };
    const rw = ctx.modules.riverworks || null, sheds = rw && Array.isArray(rw.sheds) ? rw.sheds : [];          // riverworks' own sheds and the goods beside them
    const nearShed = (x, z, r) => sheds.some((q) => q.center && Math.hypot(q.center[0] - x, q.center[1] - z) < r);
    // ---- 3. markets: pitches on gate squares, crossings and bridgeheads; sellers' mats at temple fronts ---------
    let stalls = 0, vendors = 0, marketThings = 0;
    for (const sq of layout.squares) {
      const use = sq.use, bb = M.bbox(sq.polygon);
      if (use === 'quay') continue;
      const market = use === 'gate' || use === 'crossing' || use === 'bridgehead', step = market ? 3.9 : 3.4;
      const sid = hash2(Math.round(sq.center[0]), Math.round(sq.center[1]), 81);
      let n = 0, wellDone = false;
      const sqD = pathD(sq.center[0], ground.height(sq.center[0], sq.center[1]) + 1.5, sq.center[1]), tight = !market && sqD < 160;      // a temple front the film passes: use the narrow strips too
      for (let gz = bb[1] + 1.5; gz < bb[3]; gz += tight ? 2.9 : step) for (let gx = bb[0] + 1.5; gx < bb[2]; gx += tight ? 2.9 : step) {
        const u = hash2(Math.round(gx * 3), Math.round(gz * 3), 82), x = gx + (u - 0.5) * 0.9, z = gz + (hash2(Math.round(gx * 3), Math.round(gz * 3), 83) - 0.5) * 0.9;
        if (!M.pointInPolygon(x, z, sq.polygon) || M.distToRing(x, z, sq.polygon) < (tight ? 1.0 : 1.6)) continue;
        if (onMonument(x, z) || reservedAt(x, z, 1.5) || nearAltar(x, z, tight ? 4.5 : 3.5) || layout.houseAt(x, z) || edgeDist(x, z) < 6.6 || nearShed(x, z, 8)) continue;
        // keep every street that crosses the square open, and face the nearest one
        let nearest = null, blocked = false;
        for (const q of layout.streetsNear(x, z, 26)) { const edge = q.dist - q.street.width / 2; if (edge < (tight ? 1.15 : 1.9)) { blocked = true; break; } if (!nearest || edge < nearest.edge) nearest = { edge, street: q.street }; }
        if (blocked) continue;
        let rot = 360 * hash2(Math.round(gx), Math.round(gz), 84);
        if (nearest) { const sp = M.nearestOnPolyline(x, z, nearest.street.polyline); rot = M.dirToAz(x - sp.x, z - sp.z); }          // the back turned away from the street
        else if (!market) continue;
        const edgeD = nearest ? nearest.edge : 99, y = Math.max(ground.height(x, z), streetLevel(x, z)) + LIFT.square, v = Math.floor(hash2(Math.round(gx), Math.round(gz), 85) * 97);
        const w = hash2(Math.round(gx), Math.round(gz), 86);
        if (market) {
          if (edgeD > 9 && w > 0.35) continue;
          if (w < 0.56) { if (put('stall', v, x, y, z, rot, { far: 0.85, dye: v % 10 === 3 })) { stalls++; n++; } }
          else if (w < 0.74) { if (put('vendor', v, x, y, z, rot, { far: 0.85, dye: true })) { vendors++; n++; } }
          else if (w < 0.8 && !wellDone && use === 'gate') { if (put('well', 0, x, y, z, rot, { far: 0.85 })) { wellDone = true; marketThings++; } }
          else if (w < 0.9) { const kind = ['cart', 'sacks', 'panniers', 'bales', 'jarRow', 'reedStack', 'trough', 'sledge'][Math.floor(hash2(Math.round(gx), Math.round(gz), 87) * 8)]; if (put(kind, v, x, y, z, rot + 90 * Math.floor(sid * 4), { far: 0.85 })) marketThings++; }
        } else {
          // a temple front: a few sellers of offerings along the street side, nothing before the door
          // sellers keep to the edges of the open space: never out in the middle, never on the roadway
          if (edgeD > (tight ? 9 : 5.5) || w > (tight ? 0.85 : 0.34) || (tight && (M.distToRing(x, z, sq.polygon) > 2.6 || edgeD < 1.6))) continue;
          if (put(tight && w < 0.3 && edgeD > 1.8 ? 'stall' : 'vendor', v, x, y, z, rot, { far: 0.85, dye: true, k: tight && edgeD < 1.8 ? 0.85 : 1 })) { vendors++; n++; }
        }
      }
    }
    let templeFront = 0;
    // temple fronts: sellers of offerings sit with their backs to the temple wall, clear of the door (the altar stands before it)
    // (a forecourt of world.json that another module's reservation took out of the layout's list is still a forecourt)
    const forecourts = layout.squares.filter((q) => q.use === 'forecourt');
    for (const m of world.monuments) {
      const poly = m.dims && m.dims.forecourt && Array.isArray(m.dims.forecourt.polygon) ? m.dims.forecourt.polygon : null;
      if (!poly) continue;
      const c = M.polygonCentroid(M.closeRing(poly));
      if (!forecourts.some((q) => M.pointInPolygon(c[0], c[1], q.polygon))) forecourts.push({ use: 'forecourt', polygon: M.closeRing(poly), center: c, monument: m.id });
    }
    for (const sq of forecourts) {
      const R = M.openRing(sq.polygon), cen = M.polygonCentroid(sq.polygon), sqD = pathD(sq.center[0], ground.height(sq.center[0], sq.center[1]) + 1.5, sq.center[1]), pSell = sqD < 160 ? 0.8 : 0.4;
      for (let i = 0; i < R.length; i++) {
        const a = R[i], b = R[(i + 1) % R.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 5) continue;
        let ox = (b[1] - a[1]) / l, oz = -(b[0] - a[0]) / l;
        if ((a[0] + b[0]) / 2 * ox + (a[1] + b[1]) / 2 * oz < cen[0] * ox + cen[1] * oz) { ox = -ox; oz = -oz; }          // outward: into the temple
        const mon = ctx.W.monumentAt((a[0] + b[0]) / 2 + ox * 1.2, (a[1] + b[1]) / 2 + oz * 1.2);
        if (!mon || mon.kind === 'precinct') continue;                                                             // this edge is a temple front
        for (let st = 1.8; st < l - 1.5; st += 3.3) {
          const ix = Math.round((a[0] + (b[0] - a[0]) * st / l) * 2), iz = Math.round((a[1] + (b[1] - a[1]) * st / l) * 2), u = hash2(ix, iz, 161);
          if (u > pSell) continue;
          // how much room there is between the wall and the roadway decides what sits here: a pitch with a shade, a mat, or nothing
          const wx = a[0] + (b[0] - a[0]) * st / l, wz = a[1] + (b[1] - a[1]) * st / l;
          let room = 99; for (const q of layout.streetsNear(wx - ox * 1.0, wz - oz * 1.0, 14)) room = Math.min(room, q.dist - q.street.width / 2 + 1.0);      // wall to the edge of the roadway
          if (room < 1.9) continue;
          const small = room < 3.4, off = small ? 0.95 : 1.45 + 0.4 * hash2(ix, iz, 162), x = wx - ox * off, z = wz - oz * off;
          if (!M.pointInPolygon(x, z, sq.polygon) || onMonument(x, z) || reservedAt(x, z, small ? 0.5 : 0.9) || nearAltar(x, z, 4.6) || layout.houseAt(x, z)) continue;
          const y = Math.max(ground.height(x, z), streetLevel(x, z)) + LIFT.square, v = Math.floor(hash2(ix, iz, 163) * 97), kind = !small && hash2(ix, iz, 164) < 0.3 ? 'stall' : 'vendor';
          if (put(kind, v, x, y, z, M.dirToAz(ox, oz), { far: 0.85, dye: true, k: kind === 'stall' ? 0.9 : small ? 0.8 : 1 })) { vendors++; templeFront++; }
        }
      }
    }
    // sellers on the open strip beside the Processional Way at Merkes and south of it (R5 3.2), and the public well there
    const pw = layout.streetById('processionalWay');
    if (pw) {
      const len = M.polylineLength(pw.polyline);
      let wellAt = false;
      for (let s = 0; s < len; s += 7.5) {
        const p = M.pointAlong(pw.polyline, s);
        if (p.z < -470 || p.z > 150 || p.x < 300) continue;                           // from the canal crossing to the turn at the precinct corner
        for (const side of [-1, 1]) {
          const u = hash2(Math.round(s), side, 91);
          if (u > 0.42) continue;
          const r = M.rightOf(p.dir[0], p.dir[1]), off = 6.4 / 2 + 2.6 + 3.2 * hash2(Math.round(s), side, 92), x = p.x + r[0] * off * side, z = p.z + r[1] * off * side;
          if (!layout.isFree(x, z, 1.3) || onMonument(x, z) || reservedAt(x, z, 1.5) || nearAltar(x, z, 4) || doorsNear(x, z, 3)) continue;
          const rot = M.dirToAz(r[0] * side, r[1] * side), y = ground.height(x, z) + LIFT.square, v = Math.floor(hash2(Math.round(s), side, 93) * 97);
          if (!wellAt && p.z > -300 && p.z < -240 && side > 0) { if (put('well', 0, x, y, z, rot, { far: 0.85 })) { wellAt = true; marketThings++; } continue; }
          if (u < 0.12) { if (put('stall', v, x, y, z, rot, { far: 0.85, dye: v % 10 === 3 })) stalls++; }
          else if (put('vendor', v, x, y, z, rot, { far: 0.85, dye: true })) vendors++;
        }
      }
    }
    stats.stalls = stalls; stats.vendors = vendors; stats.marketThings = marketThings; stats.templeFront = templeFront;

    // ---- 4. quays and landings, banks ----------------------------------------------------------------------------
    const riverLine = world.river.centerline.map((p) => [p[0], p[1]]);
    const CARGO = ['bales', 'jarRow', 'timber', 'reedStack', 'grainHeap', 'stone', 'sacks', 'ropes', 'bitumen', 'cart', 'sledge', 'netRack', 'bricks', 'baskets'];
    let cargo = 0, bankThings = 0;
    const smokeSpots = [];
    for (const sq of layout.squares) {
      if (sq.use !== 'quay') continue;
      const bb = M.bbox(sq.polygon), west = sq.center[0] < M.nearestOnPolyline(sq.center[0], sq.center[1], riverLine).x;
      for (let gz = bb[1] + 1.2; gz < bb[3]; gz += 3.3) for (let gx = bb[0] + 1.2; gx < bb[2]; gx += 3.3) {
        const x = gx + (hash2(Math.round(gx * 3), Math.round(gz * 3), 101) - 0.5), z = gz + (hash2(Math.round(gx * 3), Math.round(gz * 3), 102) - 0.5);
        if (!M.pointInPolygon(x, z, sq.polygon) || M.distToRing(x, z, sq.polygon) < 1.0 || ground.isWater(x, z) || edgeDist(x, z) < 6.6) continue;
        if (onMonument(x, z) || reservedAt(x, z, 1.5) || layout.houseAt(x, z) || nearShed(x, z, 8)) continue;
        let blocked = false; for (const q of layout.streetsNear(x, z, 12)) if (q.dist < q.street.width / 2 + 1.6) { blocked = true; break; }
        if (blocked || hash2(Math.round(gx), Math.round(gz), 103) > 0.62) continue;
        const u = hash2(Math.round(gx), Math.round(gz), 104), v = Math.floor(hash2(Math.round(gx), Math.round(gz), 105) * 97);
        let kind = CARGO[Math.floor(u * CARGO.length)];
        if (west && u < 0.22) kind = 'quffa';
        const bank = ground.bankAt ? ground.bankAt(x, z) : null, rot = bank ? M.dirToAz(bank.normal[0], bank.normal[1]) + (kind === 'timber' || kind === 'netRack' ? 0 : 90 * Math.floor(hash2(Math.round(gx), Math.round(gz), 106) * 4)) : 360 * u;
        if (put(kind, v, x, ground.height(x, z) + LIFT.quay, z, rot, { far: 0.9 })) { cargo++; if (kind === 'bitumen') smokeSpots.push([x, ground.height(x, z) + 0.75, z, 0.5]); }
      }
    }
    // along the quay tops between the landings (two loose rows behind the quay wall), and on the earth banks (boat repair, nets, reeds)
    for (const e of riverEdges) {
      const L = M.polylineLength(e.polyline);
      if (L < 50) continue;
      const westBank = e.id === 'quay:river:4';
      for (let s = 5; s < L; s += 5.5) {
        const p = M.pointAlong(e.polyline, s), r = M.rightOf(p.dir[0], p.dir[1]);
        if (p.z < -1000 || p.z > 1000) continue;
        for (let row = -1; row < 2; row++) {
          const ix = Math.round(p.x * 2) + row * 7919, iz = Math.round(p.z * 2), u = hash2(ix, iz, 111);
          const off = row < 0 ? 5.5 : (row ? 11.2 : 7.6) + 2.4 * hash2(ix, iz, 112), x = p.x + r[0] * off * e.land, z = p.z + r[1] * off * e.land;
          const d = pathD(x, ground.height(x, z) + 1, z);
          if (u > (d < 130 ? 0.72 : d < 320 ? 0.4 : 0.14)) continue;
          if (!layout.isFree(x, z, 1.6) || onMonument(x, z) || reservedAt(x, z, 1.5) || nearShed(x, z, 8) || doorsNear(x, z, 3) || ground.zone(x, z).zone === 'wall' || ground.zone(x, z).zone === 'berm') continue;
          const w = hash2(ix, iz, 113), v = Math.floor(hash2(ix, iz, 114) * 97);
          if (row < 0 && (u > 0.3 || d > 330)) continue;                                // nets and reeds standing just behind the quay wall: seen above it from the water
          const kind = row < 0 ? (w < 0.6 ? 'netRack' : 'reedStack') : westBank && w < 0.2 ? 'quffa' : ['netRack', 'ropes', 'reedStack', 'timber', 'jarRow', 'bales', 'bitumen', 'netRack', 'sacks', 'grainHeap', 'reedStack', 'stone'][Math.floor(w * 12)];
          const rot = M.dirToAz(p.dir[0], p.dir[1]) + (kind === 'timber' || kind === 'netRack' || kind === 'reedStack' ? 90 : 0) + 14 * (hash2(ix, iz, 115) - 0.5);
          if (put(kind, row < 0 && kind === 'reedStack' ? 1 : v, x, ground.height(x, z) + LIFT.quay, z, rot, { d, far: 0.9, k: row < 0 ? 1.22 : 1 })) { cargo++; if (kind === 'bitumen' && d < 400) smokeSpots.push([x, ground.height(x, z) + 0.75, z, 0.5]); }
        }
      }
    }
    for (const bk of ground.banks || []) {
      if (bk.body !== 'river' || bk.type !== 'earth') continue;
      const mx = (bk.a[0] + bk.b[0]) / 2, mz = (bk.a[1] + bk.b[1]) / 2;
      if (mz < -1500 || mz > 1500) continue;
      const l = Math.hypot(bk.b[0] - bk.a[0], bk.b[1] - bk.a[1]);
      for (let s = 6; s < l; s += 14) {
        const t = s / l, bx = bk.a[0] + (bk.b[0] - bk.a[0]) * t, bz = bk.a[1] + (bk.b[1] - bk.a[1]) * t, u = hash2(Math.round(bx), Math.round(bz), 121);
        if (u > 0.45) continue;
        // up the slope to dry ground
        let x = bx, z = bz, ok = false;
        for (let k = 2; k <= 9; k++) { x = bx + bk.normal[0] * k * 2; z = bz + bk.normal[1] * k * 2; if (ground.height(x, z) > ground.waterLevel + 1.6 && !ground.isWater(x, z)) { ok = true; break; } }
        if (!ok || !layout.isFree(x, z, 1.8) || onMonument(x, z) || reservedAt(x, z, 1.5) || ground.zone(x, z).zone === 'wall') continue;
        const w = hash2(Math.round(bx), Math.round(bz), 122), v = Math.floor(hash2(Math.round(bx), Math.round(bz), 123) * 97), kind = w < 0.42 ? 'quffa' : w < 0.68 ? 'netRack' : w < 0.84 ? 'reedStack' : 'bitumen';
        if (put(kind, v, x, ground.height(x, z) + LIFT.quay, z, M.dirToAz(bk.normal[0], bk.normal[1]) + (kind === 'netRack' ? 90 : 360 * w), { far: 0.9 })) bankThings++;
      }
    }
    stats.cargo = cargo; stats.bankThings = bankThings;

    // ---- 5. the lion street: incense stands along both walls (R5 2.5 after Curtius: conjectural), the guard's water jars
    //      They stand 1.85 m before the wall faces: the towers stand 1.3 m proud of them (world.json northPalace.eastWall).
    let lion = 0;
    if (pw) {
      const np = world.monuments.find((m) => m.id === 'northPalace'), ef = world.monuments.find((m) => m.id === 'eastFortification');
      const faces = { '-1': np ? [5, 4, 3, 2].map((i) => np.footprint.polygon[i]).filter(Boolean) : null, 1: ef ? [0, 1, 2, 3].map((i) => ef.footprint.polygon[i]).filter(Boolean) : null };
      const pl = pw.polyline, len = M.polylineLength(pl);
      for (let s = 0; s < len; s += 7) {
        const p = M.pointAlong(pl, s);
        if (p.z > -786 || p.z < -925) continue;                                       // between the North Gate and the bastions
        const r = M.rightOf(p.dir[0], p.dir[1]), k = Math.round(s / 7);
        for (const side of [-1, 1]) {
          // the wall on this side of the street: the nearer of the two faces
          let hit = null;
          for (const f of Object.values(faces)) { if (!f || f.length < 2) continue; const q = M.nearestOnPolyline(p.x + r[0] * 10.75 * side, p.z + r[1] * 10.75 * side, f); if (!hit || q.dist < hit.dist) hit = q; }
          let x = p.x + r[0] * 8.9 * side, z = p.z + r[1] * 8.9 * side;
          if (hit && hit.dist < 4) { const dx = p.x - hit.x, dz = p.z - hit.z, l = Math.hypot(dx, dz) || 1; x = hit.x + (dx / l) * 1.85; z = hit.z + (dz / l) * 1.85; }
          const y = ground.height(x, z) + LIFT.lion;
          if (reservedAt(x, z, 0.4)) continue;
          const rot = M.dirToAz(r[0] * side, r[1] * side);                              // back to the wall
          if (k % 2 === 0) { if (put('incense', (k / 2 + (side > 0 ? 1 : 0)) % 2, x, y, z, rot, { far: 0.85 })) { lion++; if (pathD(x, y, z) < 60 && k % 4 === 0) smokeSpots.push([x, y + 1.0, z, 0.3]); } }
          else if (hash2(k, side, 131) < 0.62) { const kind = ['pithoi', 'jars', 'baskets', 'pithoi'][Math.floor(hash2(k, side, 132) * 4)]; if (put(kind, Math.floor(hash2(k, side, 133) * 97), x, y, z, rot, { far: 0.85, k: 0.85 })) lion++; }
        }
      }
    }
    stats.lionStreet = lion;

    // ---- 6. open lots: rubbish heaps, brick stacks at the pits inside the city ----------------------------------
    let lotThings = 0;
    for (const o of layout.openSpaces) {
      if (o.kind !== 'lot' || (o.use !== 'rubbish' && o.use !== 'brickPit')) continue;
      const bb = M.bbox(o.polygon), n = o.use === 'rubbish' ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const x = M.lerp(bb[0], bb[2], 0.15 + 0.7 * hash2(o.id, i, 141)), z = M.lerp(bb[1], bb[3], 0.15 + 0.7 * hash2(o.id, i, 142));
        if (!M.pointInPolygon(x, z, o.polygon) || M.distToRing(x, z, o.polygon) < 1.6 || !layout.isFree(x, z, 1.2) || reservedAt(x, z, 1)) continue;
        if (put(o.use === 'rubbish' ? 'refuse' : 'bricks', Math.floor(hash2(o.id, i, 143) * 97), x, ground.height(x, z) + 0.04, z, 360 * hash2(o.id, i, 144), { far: 0.9, k: o.use === 'rubbish' ? 0.8 + 0.7 * hash2(o.id, i, 145) : 1 })) lotThings++;
      }
    }
    stats.lotThings = lotThings;

    const toGeom = (b) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(b.nor.slice(0, b.nv * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, b.nv * 3), 3)); g.setIndex(new THREE.BufferAttribute(b.idx.slice(0, b.ni), 1)); return g; };
    // ---- debug=1: the prop sheet, every variant of every kind in its three grades, far out on the plain (x -9000, z 5200)
    const sheet = [];
    if (ctx.flags && ctx.flags.debug) {
      const bins = [new Bin(), new Bin(), new Bin(), new Bin()], X0 = -9000, Z0 = 5200, tA = [0.95, 0.93, 0.86], tC = P.woolCream, acc = P.madder;
      let row = 0;
      for (const kind of Object.keys(KINDS)) {
        const n = KINDS[kind].n;
        for (let v = 0; v < n; v++) for (let lod = 0; lod < 3; lod++) {
          const p = proto(kind, v, lod, kind === 'ladder' ? 14 : 0), x = X0 + v * 5.2, z = Z0 + row * 6 + lod * 60 * 6, y = ground.height(x, z) + 0.03;
          for (let i = 0; i < 4; i++) if (p.slots[i]) bins[i].add(p.slots[i], x, y, z, 1, 0, 1, i === 0 ? tA : i === 3 ? tC : ONE, acc, 1);
        }
        sheet.push([kind, row]); row++;
      }
      for (let i = 0; i < 4; i++) if (bins[i].ni) geom.addStatic(mats[i], toGeom(bins[i]), { shadowTexel: 0.15, occluder: false });
      stats.sheet = { at: [X0, Z0], rows: sheet };
    }

    // ---- submit ------------------------------------------------------------------------------------------------
    const tris = { L0: 0, L1: 0, L2: 0, proxy: 0 };
    for (const a of L0.values()) for (let i = 0; i < 4; i++) { const b = a.bins[i]; if (!b || !b.ni) continue; tris.L0 += b.ni / 3; geom.addStatic(mats[i], toGeom(b), { tileKey: [a.tx, a.tz], lod: [0, D0], lodGrid: T, shadowTexel: 0.15, occluder: false }); }
    for (const a of L1.values()) { const b = a.bins[0]; if (!b || !b.ni) continue; tris.L1 += b.ni / 3; geom.addStatic(mats[FAR], toGeom(b), { tileKey: [a.tx, a.tz], lod: [a.near ? D0 : 0, D1], lodGrid: [T, CELL], castShadow: false, ao: false, occluder: false }); }
    for (const a of L2.values()) { const b = a.bins[0]; if (!b || !b.ni) continue; tris.L2 += b.ni / 3; geom.addStatic(mats[FAR], toGeom(b), { tile: CELL, tileKey: [a.tx, a.tz], lod: a.near ? [D1, Infinity] : null, lodGrid: CELL, castShadow: false, ao: false, occluder: false }); }
    for (const a of PXY.values()) { const b = a.bins[0]; if (!b || !b.ni) continue; tris.proxy += b.ni / 3; geom.addShadowProxy(toGeom(b), { tile: CELL, tileKey: [a.tx, a.tz], lod: [0, D1], lodGrid: CELL, shadowTexel: 0.6 }); }
    stats.tris = tris; stats.prototypes = protos.size; stats.prototypeTris = protoTris;
    { const tb = {}; for (const [k, p] of protos) { const [kind, , lod] = k.split('|'); const e = tb[kind] || (tb[kind] = [[0, 0], [0, 0], [0, 0]]); e[+lod][0] += p.tris; e[+lod][1]++; } stats.protoTris = Object.fromEntries(Object.entries(tb).map(([k, e]) => [k, e.map((q) => (q[1] ? Math.round(q[0] / q[1]) : 0))])); }

    // ---- emitters: the smoke of bread ovens (unless `houses` declared it), bitumen cauldrons, incense -------------
    const have = ctx.emitters.list.filter((e) => e.kind === 'smoke' && e.pos);
    const smokeNear = (x, y, z, r) => have.some((e) => Math.hypot(e.pos[0] - x, e.pos[1] - y, e.pos[2] - z) < r);
    let smoke = 0;
    for (const sm of layout.smokeSources()) {
      if (!smokeHere.has(sm.house) || smokeNear(sm.x, sm.y, sm.z, 1.6)) continue;
      ctx.emitters.add({ kind: 'smoke', pos: [sm.x, sm.y + 0.12, sm.z], size: 0.8, data: { house: sm.house, source: 'oven' } }); smoke++;
    }
    // shot 8 asks for oven smoke among the roofs: make sure two or three ovens in front of the roof camera burn
    if (stand) {
      const c = [];
      for (const h of layout.housesNear(stand.pos[0], stand.pos[2], 110)) {
        if (!smokeHere.has(h.id)) continue;
        const o = layout.ovenOf(h); if (!o) continue;
        const dx = o.x - stand.pos[0], dz = o.z - stand.pos[2], dist = Math.hypot(dx, dz), off = Math.abs(M.angleDiffDeg(viewAz, M.dirToAz(dx, dz)));
        if (dist > 22 && off < 38) c.push({ o, h, dist, off });
      }
      c.sort((a, b) => a.dist - b.dist);
      let n = 0;
      for (const q of c) { if (n >= 3) break; if (smokeNear(q.o.x, q.o.y, q.o.z, 1.6) || have.some((e) => Math.hypot(e.pos[0] - q.o.x, e.pos[2] - q.o.z) < 1.6)) { n++; continue; } ctx.emitters.add({ kind: 'smoke', pos: [q.o.x, q.o.y + 0.12, q.o.z], size: 0.8, data: { house: q.h.id, source: 'oven', staged: 'rooftop' } }); smoke++; n++; }
    }
    for (const sp of smokeSpots) { ctx.emitters.add({ kind: 'smoke', pos: [sp[0], sp[1], sp[2]], size: sp[3], data: { source: sp[3] < 0.4 ? 'incense' : 'bitumen' } }); smoke++; }
    stats.smoke = smoke;

    // ---- checks ------------------------------------------------------------------------------------------------
    for (const [k, p] of protos) { void k; for (const sl of p.slots) { if (!sl) continue; const P3 = sl.pos, N3 = sl.nor, I = sl.idx; for (let t = 0; t < sl.ni; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P3[b] - P3[a], uy = P3[b + 1] - P3[a + 1], uz = P3[b + 2] - P3[a + 2], vx = P3[c] - P3[a], vy = P3[c + 1] - P3[a + 1], vz = P3[c + 2] - P3[a + 2]; const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx; if (gx * (N3[a] + N3[b] + N3[c]) + gy * (N3[a + 1] + N3[b + 1] + N3[c + 1]) + gz * (N3[a + 2] + N3[b + 2] + N3[c + 2]) < -1e-9) flipped++; } } }
    const total = tris.L0 + tris.L1 + tris.L2 + tris.proxy;
    stats.low = Object.fromEntries(low.map((L) => ['shot' + L.n, L.count]));
    stats.minApproach = minApproach === Infinity ? null : +minApproach.toFixed(2);
    const full = ctx.quality.density >= 1;
    checks.push({ name: 'props placed (SPEC 3.15: 60,000 and more)', value: stats.placed, expect: full ? '>= 60000' : '> 0 (draft)', pass: full ? stats.placed >= 60000 : stats.placed > 0 });
    checks.push({ name: 'kinds of prop in use', value: Object.keys(stats.byKind).length, expect: '>= 40', pass: Object.keys(stats.byKind).length >= 40 });
    checks.push({ name: 'triangles in memory (share: 2 M)', value: Math.round(total), expect: '<= 2000000', pass: total <= 2.0e6 });
    checks.push({ name: 'prototype triangles wound against their normals', value: flipped, expect: 0, pass: flipped === 0 });
    for (const L of low) if (L.n !== 5) checks.push({ name: `props within 30 m of the camera of shot ${L.n} (SPEC 9.5 asks for 25 with the figures)`, value: L.count, expect: L.n === 2 ? '>= 8' : '>= 25', pass: L.count >= (L.n === 2 ? 8 : 25) });
    checks.push({ name: 'nearest any prop comes to the camera path (m, less its radius)', value: stats.minApproach, expect: '>= 0.2', pass: minApproach >= 0.2 });
    ctx.module.log && ctx.module.log(`dressing: ${stats.placed} props, ${Math.round(total / 1000)}k triangles (L0 ${Math.round(tris.L0 / 1000)}k, L1 ${Math.round(tris.L1 / 1000)}k, L2 ${Math.round(tris.L2 / 1000)}k)`);

    return { stats, checks, api: { counts: stats.byKind, lowCameras: stats.low } };
  },
};
