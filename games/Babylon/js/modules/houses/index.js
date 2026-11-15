// js/modules/houses/index.js — module "houses": the ARCHITECTURE of every ctx.layout house record (SPEC 3.15,
// R5 2.1 / 3.1, GAPS G02): party-walled mud-brick courtyard houses in three levels of detail plus a near
// "detail" level, and the Great House of Merkes as the hero of shot 8.
//   base     geom.houseInto() per house (roof parts at their own levels, court voids, parapets with thickness,
//            stepped street fronts, recessed door), binned by tile here so that walls, lime-washed walls, roofs
//            and floors go to the right material, tinted per vertex
//   detail   (detail.js) what a street or roof camera sees within about 200 m: door leaves of boards, lintels,
//            thresholds and steps with true risers, benches, jar stands, drain spouts with their stains, beam
//            ends, re-plastered feet and patches, parapet cappings, court doorways with real reveals, vents,
//            court paving, roof patches, roof rooms
//   hero     (hero.js) the Great House to its excavated outline: court lining with rebated doorways, paving,
//            court stair, roof steps between its three roof levels
// No night code, no loose props, no people (nightfx, dressing, people). Oven smoke is declared as emitters.
// Notes: docs/mod-houses.md.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { makeDetail } from './detail.js';
import { buildHero } from './hero.js';

const FULL = 400, SHELL = 2000, FAR_TILE = 1024;
const DETAIL = 170;              // upper bound of the detail band (tile distance, m)
const FULL_REACH = 520;          // houses farther than this from the film path are drawn as their shell from 0 m on
const DETAIL_REACH = 300;        // houses farther than this from the film path get no near detail

export default {
  name: 'houses',
  claims: ['houses'],

  async build(ctx) {
    const { geom, layout, materials, ground, film } = ctx;
    const T = geom.TILE, stats = {}, checks = [];

    // ---- materials: white variants, every tone in the vertex colours ---------------------------------
    const mat = {
      walls: materials.preset('houseWalls', { name: 'houses-walls', wear: 0.6, relief: 1.35, mask: 1.3 }),
      lime: materials.preset('houseLime', { name: 'houses-lime', wear: 0.6, relief: 1.4, mask: 1.5 }),
      roof: materials.variant('roofEarth', { name: 'houses-roof', color: 0xffffff }),
      paving: materials.variant('courtBrickPaving', { name: 'houses-paving', color: 0xffffff }),
    };
    const rgb = (id) => geom.toRGB(materials.color(id));
    const TONES = ['mudPlaster', 'mudPlasterSunlit', 'mudPlasterWeathered', 'mudPlasterFresh', 'mudPlasterGrey', 'mudPlasterReddish', 'mudPlasterDark', 'mudPlasterSunlit'].map(rgb);
    const LIME = rgb('limewash'), LIME_AGED = rgb('limewashAged'), ROOF = rgb('roofEarth'), PAVE = rgb('courtBrickPaving'), EARTH = rgb('streetEarthDamp');
    const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const hq = (h, k) => hash2(h.seed & 0xffff, h.seed >>> 16, k);

    const hero = layout.houses.find((h) => /Great House/.test(h.landmark || ''));

    /** Everything about the look of one house that every level of detail shares. Pure function of the record. */
    const styles = new Map();
    function styleOf(h) {
      let s = styles.get(h.id);
      if (s) return s;
      const j = 0.88 + 0.24 * hq(h, 101);                                           // +-12 % value (SPEC 3.15)
      const mud = mul(TONES[(h.tone ?? h.seed) % TONES.length], j);
      const white = !!h.whitewashed;
      const wall = white ? mul(mix(LIME, LIME_AGED, hq(h, 102)), 0.95 + 0.08 * hq(h, 103)) : mud;
      // the roof is rolled mud of the house's own earth: roofEarth pulled a little toward the wall tone, 0.40 to 0.48
      // (SPEC 4.3: all roofs rolled mud at 0.40 to 0.48, never white)
      const r0 = mix(ROOF, mul(mud, 0.42 / 0.4), 0.22), roof = mul(r0, (0.4 + 0.08 * hq(h, 104)) / (0.2126 * r0[0] + 0.7152 * r0[1] + 0.0722 * r0[2]));
      const elite = h.cls === 'large' || h.cls === 'mansion' || !!h.landmark;
      const paved = elite ? hq(h, 105) < 0.85 : h.cls === 'medium' ? hq(h, 105) < 0.45 : hq(h, 105) < 0.12;      // R5 3.1: baked-brick paving in good houses
      const floor = paved ? mul(PAVE, 0.92 + 0.16 * hq(h, 106)) : mul(mix(EARTH, mud, 0.35), 0.8 + 0.12 * hq(h, 106));
      s = { white, mud, wallColor: wall, parapetColor: wall, roofColor: roof, roofAbs: roof, floorColor: floor, courtAbs: mul(floor, 0.5), paved, elite,
        trimColor: [0.115, 0.085, 0.06] };
      styles.set(h.id, s);
      return s;
    }
    /** Parapet thickness by class: the wall thickness that shows on the roof (R5 2.1: 0.5 to 0.7 / 1.0 / 1.4 m and more). */
    const parapetThickness = (h) => (h.cls === 'mansion' ? 0.7 : h.cls === 'large' ? 0.55 : h.cls === 'medium' ? 0.42 : 0.32) + 0.08 * hq(h, 107);
    const specs = new Map();
    // nothing of the fabric rises above the fabricTopLevel of its district, and nothing within 320 m of the Great
    // House above +14.9 (docs/layout.md: the camera path and the view of shot 8 were checked against these)
    const caps = new Map(ctx.world.districts.map((d) => [d.name, d.fabricTopLevel]));
    const capOf = (h) => {
      let cap = caps.get(h.district);
      if (cap === undefined) { cap = 11; for (const [name, v] of caps) if (h.district && (name.startsWith(h.district) || name.includes('(' + h.district + ')'))) cap = v; }
      if (hero && Math.hypot(h.center[0] - hero.center[0], h.center[1] - hero.center[1]) < 320) cap = Math.min(cap, 14.9);
      return cap;
    };
    // Village houses on a canal levee: the levee crest of the ground model runs up to 1.2 m above the recorded floor
    // of a dozen of them (engine note). Such a house is built with floor, roof and plinth raised by that much.
    let raised = 0;
    const liftOf = (h) => {
      if (h.village === null || h.village === undefined) return 0;
      let hi = -Infinity; const bb = M.bbox(h.footprint);
      for (let x = bb[0]; x <= bb[2]; x += 1) for (let z = bb[1]; z <= bb[3]; z += 1) if (M.pointInPolygon(x, z, h.footprint)) hi = Math.max(hi, ground.height(x, z));
      return hi - h.groundLevel > 0.02 ? hi - h.groundLevel + 0.12 : 0;
    };
    function specOf(h) {
      let s = specs.get(h.id);
      if (!s) {
        const big = h.cls === 'large' || h.cls === 'mansion', lift = liftOf(h);
        const rec = lift > 0 ? { ...h, groundLevel: h.groundLevel + lift, roofLevel: h.roofLevel + lift, plinthLevel: h.plinthLevel + lift } : h;
        if (lift > 0) raised++;
        // (the Great House: no built stair, as none was found in any excavated house; its roofs are reached by ladder)
        s = h === hero ? geom.houseSpec(h, { parapetThickness: 0.62, spouts: 0, courtStair: false, kerbThickness: 0.45, kerb: 0.35 })
          : geom.houseSpec(rec, { parapetThickness: parapetThickness(h), spouts: 0, courtStair: big ? hq(h, 108) < 0.75 : hq(h, 108) < 0.14, kerbThickness: big ? 0.4 : 0.3 });
        specs.set(h.id, s);
        if (h !== hero && !lift) { const room = detail.roomOf(h, geom.housePlan(s), capOf(h)); if (room) s.upper = [{ ring: room.ring, height: room.height, parapet: room.parapet }]; }
      }
      return s;
    }

    // ---- which houses does the film ever come near? ----------------------------------------------------
    const path = [];
    for (let t = 0; t <= film.duration + 1e-6; t += 0.05) path.push(film.pathPoseAt(t).pos);
    const pathDist = (h) => {
      let d = Infinity; const x = h.center[0], y = h.roofLevel, z = h.center[1];
      for (let i = 0; i < path.length; i++) { const q = path[i], dx = q[0] - x, dy = q[1] - y, dz = q[2] - z, dd = dx * dx + dy * dy + dz * dz; if (dd < d) d = dd; }
      return Math.sqrt(d);
    };
    /** How close the film camera ever comes to a point (exact near the path, the coarse value beyond 14 m). */
    const camDist = (x, y, z) => {
      let d = Infinity;
      for (let i = 0; i < path.length; i++) { const q = path[i], dx = q[0] - x, dy = q[1] - y, dz = q[2] - z, dd = dx * dx + dy * dy + dz * dz; if (dd < d) d = dd; }
      d = Math.sqrt(d);
      return d > 14 ? d : film.nearestApproach([x, y, z]).dist;
    };

    // ---- bins ---------------------------------------------------------------------------------------------
    const bins = new Map();
    const writer = (verts) => geom.writer({ verts, color: true });
    function bin(lod, size, x, z) {
      const tx = Math.floor(x / size), tz = Math.floor(z / size), k = lod + ':' + tx + ',' + tz;
      let b = bins.get(k);
      if (!b) bins.set(k, (b = { lod, size, tx, tz, w: {} }));
      return b;
    }
    const W = (b, name, verts = 2048) => b.w[name] || (b.w[name] = writer(verts));

    const built = layout.houses.filter((h) => layout.isBuilt(h));
    let nFull = 0, nDetail = 0, nWhite = 0, nPaved = 0, nInner = 0;
    const detail = makeDetail(ctx, { styleOf, specOf, hq, mat, W, bin, camDist });
    const dist = new Map();
    for (const h of built) {
      const st = styleOf(h), sp = specOf(h), c = h.center, d = pathDist(h);
      dist.set(h.id, d);
      if (st.white) nWhite++; if (st.paved) nPaved++; if (h.enclosure === 'innerEast' || h.enclosure === 'innerWest') nInner++;
      if (h === hero) continue;                                           // hero.js builds the Great House in every level
      const hasFull = d < FULL_REACH;
      if (hasFull) {
        const b = bin('full', T, c[0], c[1]);
        geom.houseInto({ walls: W(b, st.white ? 'lime' : 'walls', 4096), roof: W(b, 'roof', 1024) }, sp, st, 'full');
        nFull++;
      }
      // the shell: ONE material (roofs and court floors in their own colours through the vertex tint): beyond 400 m the
      // texture of a roof is below the pixel, and a second material would double the draw calls of the whole mid field
      const bs = bin(hasFull ? 'shell' : 'shell0', T, c[0], c[1]);
      geom.houseInto({ walls: W(bs, 'walls', 4096) }, sp, st, 'shell');
      geom.houseInto({ walls: W(bin('box', FAR_TILE, c[0], c[1]), 'walls', 4096) }, sp, st, 'box');
      if (d < DETAIL_REACH) { detail.house(h, d); nDetail++; }
    }
    const heroRes = hero ? buildHero(ctx, hero, { styleOf, specOf, hq, mat, W, bin, detail, camDist }) : null;
    if (heroRes) stats.hero = heroRes.stats;

    // ---- submit --------------------------------------------------------------------------------------------
    const band = { full: [0, FULL], shell: [FULL, SHELL], shell0: [0, SHELL], box: [SHELL, Infinity], detail: [0, DETAIL] };
    const tris = { full: 0, shell: 0, box: 0, detail: 0 };
    let badNumbers = 0;
    for (const b of bins.values()) {
      const lodName = b.lod === 'shell0' ? 'shell' : b.lod;
      const common = { lod: band[b.lod], tile: b.size, tileKey: [b.tx, b.tz], lodGrid: b.lod === 'full' || b.lod === 'detail' ? T : b.lod === 'box' ? FAR_TILE : [T, FAR_TILE] };
      for (const name of Object.keys(b.w)) {
        const w = b.w[name];
        if (!w.nv) continue;
        tris[lodName] += w.triangleCount;
        if (b.lod === 'detail') { const P = w.pos, m = w.nv * 3; for (let i = 0; i < m; i++) if (P[i] !== P[i]) { badNumbers++; break; } }
        detail.submit(name, w, common, b.lod);
      }
    }
    stats.houses = built.length; stats.inner = nInner; stats.withFullLevel = nFull; stats.withDetail = nDetail; stats.whitewashed = nWhite; stats.pavedCourts = nPaved;
    stats.tris = tris; stats.detail = detail.stats; stats.raisedOnLevee = raised;

    // ---- oven smoke (SPEC 3.18: thin columns from bread ovens; nightfx draws them) ---------------------------
    let smoke = 0;
    for (const s of layout.smokeSources()) { ctx.emitters.add({ kind: 'smoke', pos: [s.x, s.y + 0.15, s.z], size: 0.8, data: { house: s.house, source: 'oven' } }); smoke++; }
    stats.smoke = smoke;

    // ---- checks (SPEC 9.3) -------------------------------------------------------------------------------------
    const final = ctx.quality.density >= 1;
    checks.push({ name: 'houses built', value: built.length, expect: final ? '>= 20000' : '> 0', pass: final ? built.length >= 20000 : built.length > 0 });
    checks.push({ name: 'houses inside the inner walls', value: nInner, expect: final ? '>= 12000' : '> 0', pass: final ? nInner >= 12000 : nInner > 0 });
    checks.push({ name: 'houses with a real court void', value: built.filter((h) => h.courts && h.courts.length > 0).length, expect: built.length, pass: built.every((h) => h.courts && h.courts.length > 0) });
    const share = nWhite / Math.max(1, built.length);
    checks.push({ name: 'lime-washed share of all houses', value: +share.toFixed(3), expect: '0.05 to 0.2', pass: share > 0.05 && share < 0.2 });
    // a sample of what was built, measured: every 97th house in the full level, and the landmark houses
    let n = 0, bad = 0, worst = null;
    for (let i = 0; i < built.length; i++) {
      const h = built[i];
      if ((i % 97 && !h.landmark) || h === hero) continue;
      const g = geom.house(specOf(h), styleOf(h), 'full'), r = geom.inspect(geom.merge([g.walls, g.roof, g.floor, g.trim].filter(Boolean)));
      n++;
      if (r.openAbove > 0.05 || r.flipped > 0 || r.overlap > 0.01) { bad++; if (!worst) worst = { id: h.id, openAbove: +r.openAbove.toFixed(2), flipped: r.flipped, overlap: +r.overlap.toFixed(3) }; }
    }
    stats.sample = { n, bad, worst };
    checks.push({ name: 'sampled house shells that are not clean (open edge, flipped face, coplanar overlap)', value: bad, expect: '<= 2 % of ' + n, pass: bad <= Math.max(1, 0.02 * n) });
    const total = tris.full + tris.shell + tris.box + tris.detail;
    checks.push({ name: 'house triangles in memory (M)', value: +(total / 1e6).toFixed(2), expect: '<= 4.0 (share 3 to 4 M)', pass: total <= 4.0e6 });
    // SPEC 4.3: every roof is rolled mud at 0.40 to 0.48, never white; lime wash on walls of 45 % of elite and 15 % of ordinary houses
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    let rMin = Infinity, rMax = -Infinity, eliteN = 0, eliteW = 0, ordN = 0, ordW = 0;
    for (const h of built) {
      const st = styleOf(h), l = lum(st.roofColor);
      if (l < rMin) rMin = l; if (l > rMax) rMax = l;
      if (h.enclosure !== 'innerEast' && h.enclosure !== 'innerWest') continue;
      if (h.cls === 'large' || h.cls === 'mansion') { eliteN++; if (st.white) eliteW++; } else { ordN++; if (st.white) ordW++; }
    }
    checks.push({ name: 'roof albedo (linear luminance), darkest / lightest house', value: rMin.toFixed(3) + ' / ' + rMax.toFixed(3), expect: '0.40 to 0.48 (rolled mud, never white)', pass: rMin >= 0.399 && rMax <= 0.481 });
    if (final) checks.push({ name: 'lime-washed share inside the walls, elite / ordinary houses', value: (eliteW / Math.max(1, eliteN)).toFixed(2) + ' / ' + (ordW / Math.max(1, ordN)).toFixed(2), expect: '0.45 / 0.15 (+-0.06)', pass: Math.abs(eliteW / Math.max(1, eliteN) - 0.45) < 0.06 && Math.abs(ordW / Math.max(1, ordN) - 0.15) < 0.06 });
    // SPEC 9.3: saw-tooth walls in the Merkes shot
    const s7 = film.shots.find((q) => q.id === 'merkesLane' || q.n === 7);
    if (s7) {
      const c7 = film.pathPoseAt(s7.tHold).pos; let teeth = 0, housesT = 0;
      for (const h of layout.housesNear(c7[0], c7[2], 70)) { if (!layout.isBuilt(h)) continue; let n = 0; for (const f of layout.facade(h)) if (f.line) n += f.teeth; if (n) { housesT++; teeth += n; } }
      checks.push({ name: 'stepped (saw-tooth) fronts within 70 m of the Merkes camera: houses / teeth', value: housesT + ' / ' + teeth, expect: '>= 5 houses', pass: housesT >= 5 });
    }
    if (heroRes) checks.push({ name: 'Great House: roof levels / rebated court doorways / steps between roof levels', value: layout.roofParts(hero).length + ' parts / ' + heroRes.stats.courtDoors + ' / ' + heroRes.stats.roofSteps, expect: '4 parts on 3 levels, >= 8 doorways', pass: new Set(layout.roofParts(hero).map((q) => q.level)).size === 3 && heroRes.stats.courtDoors >= 8 });
    checks.push({ name: 'oven smoke emitters declared', value: smoke, expect: final ? '>= 250' : '> 0', pass: final ? smoke >= 250 : smoke > 0 });
    checks.push({ name: 'detail tile meshes with a NaN position', value: badNumbers, expect: 0, pass: badNumbers === 0 });
    for (const c of detail.checks()) checks.push(c);

    return { stats, checks, api: { roofRooms: detail.roofRooms, roofStairs: heroRes ? heroRes.stairs : [], styleOf: (h) => { const s = styleOf(h); return { whitewashed: s.white, paved: s.paved, wall: s.wallColor.slice(), roof: s.roofColor.slice() }; } } };
  },
};
