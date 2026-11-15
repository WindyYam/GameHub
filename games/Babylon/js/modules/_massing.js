// _massing.js — TEMPORARY debug module (engine architect). Draws world.json as simple massing so that every
// engineer has a scene to test with and the plan can be checked against plan.png.
//
// It runs LAST and draws only what no built module has claimed (ctx.claims; the keys are CLAIM_KEYS in js/core/registry.js):
//   'ground'  'water'  'innerWalls'  'outerWall'  'lionStreet'  'streets'  'roads'  'bridge'  'houses'  'monument:<id>'
// massing=0 switches it off, massing=1 (default) draws the unclaimed parts, massing=2 draws everything.
// District outlines are drawn on the DEBUG layer (visible in plan stills and with ?debug=1).
//
// Known simplifications (the real modules fix them): banks are 1:5 earth slopes everywhere (stub ground);
// canals are painted on the ground, not cut into it; stepped walls are ramps; gates have no passage.
import * as M from '../core/mathx.js';
import { hash2 } from '../core/rng.js';
import { monumentLevels } from '../core/world.js';

export default {
  name: '_massing',
  async build(ctx) {
    const { world, W, geom, ground, water, materials, layout, LAYERS, THREE } = ctx;
    const all = ctx.flags.massing >= 2;
    const want = (claim) => all || !ctx.claims.has(claim);
    const WL = ground.waterLevel;
    const drawn = [];
    const pending = new Map(); // material -> geometries[]  (merged per material before submission)
    const put = (mat, g) => { let a = pending.get(mat); if (!a) pending.set(mat, (a = [])); a.push(g); };
    const flush = (opts = {}) => { for (const [mat, list] of pending) geom.addStatic(mat, geom.merge(list), opts); pending.clear(); };
    const baseOf = (ring) => { let m = Infinity; for (const p of ring) m = Math.min(m, ground.height(p[0], p[1])); return Math.max(-6, m - 1.5); };

    // ------------------------------------------------------------------------------------------
    // ground: 500 m blocks, fine (20-25 m cells) in the core and along water, one quad elsewhere
    // ------------------------------------------------------------------------------------------
    if (want('ground')) {
      drawn.push('ground');
      const B = 500, R = ground.terrainRadius, cb = ground.coreBounds, N = ctx.quality.draft ? 20 : 25;
      const groundMat = materials.variant('alluvialSoilDry', { color: 0xffffff, name: 'massing-ground' });
      const tones = new Map();
      const c = (id) => { let k = tones.get(id); if (!k) { const q = materials.color(id); tones.set(id, (k = [q.r, q.g, q.b])); } return k; };
      const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      const C = { bed: c('wetBank'), outer: c('alluvialSoilDry'), steppe: c('fallow') };
      const calm = mixc(mixc(c('barleyRipe'), c('fallow'), 0.5), C.outer, 0.4);
      // fine blocks: the colour of ctx.ground.landUse (ONE land-use answer for terrain, vegetation and environs)
      const colourAt = (x, z, y, coarse) => {
        if (y < WL - 1.5) return C.bed;
        if (coarse) return Math.hypot(x, z) > 7500 ? C.steppe : calm;
        const lu = ground.landUse(x, z);
        return lu.strip ? mixc(c(lu.tone), C.outer, lu.use === 'palmGarden' || lu.use === 'garden' ? 0.45 : 0.25) : c(lu.tone);
      };
      // bounding box of all water (river polygon and moats): only blocks near it need the shore test
      let wb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const ring of [world.river.polygon, ...world.moats.map((m) => m.polygon)]) { const b = M.bbox(ring); wb = [Math.min(wb[0], b[0]), Math.min(wb[1], b[1]), Math.max(wb[2], b[2]), Math.max(wb[3], b[3])]; }
      const nearWaterBox = (x0, z0, size) => x0 + size > wb[0] - 60 && x0 < wb[2] + 60 && z0 + size > wb[1] - 60 && z0 < wb[3] + 60;
      const inCore = (x0, z0, size) => x0 + size > cb[0] && x0 < cb[2] && z0 + size > cb[1] && z0 < cb[3];
      const isFine = (bx, bz) => {
        if (inCore(bx, bz, B)) return true;
        if (!nearWaterBox(bx, bz, B)) return false;
        for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) if (ground.shoreDistance(bx + (i * B) / 4, bz + (j * B) / 4) < 45) return true;
        return false;
      };
      const pos = { fine: [], far: [] }, col = { fine: [], far: [] };
      /** One square block of n x n cells with a skirt; heights and colours are sampled once per grid vertex. */
      const emitBlock = (set, x0, z0, size, n) => {
        const s = size / n, m = n + 1, ys = new Float32Array(m * m), ks = new Array(m * m);
        for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const x = x0 + i * s, z = z0 + j * s, y = ground.height(x, z); ys[j * m + i] = y; ks[j * m + i] = colourAt(x, z, y, n === 1); }
        const P = pos[set], K = col[set];
        const v = (i, j, dy = 0) => { const q = j * m + i, k = ks[q]; P.push(x0 + i * s, ys[q] - dy, z0 + j * s); K.push(k[0], k[1], k[2]); };
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { v(i, j); v(i, j + 1); v(i + 1, j + 1); v(i, j); v(i + 1, j + 1); v(i + 1, j); }
        const skirt = (i0, j0, i1, j1) => { v(i0, j0); v(i1, j1); v(i1, j1, 15); v(i0, j0); v(i1, j1, 15); v(i0, j0, 15); };
        for (let i = 0; i < n; i++) { skirt(i, 0, i + 1, 0); skirt(i + 1, n, i, n); skirt(0, i + 1, 0, i); skirt(n, i, n, i + 1); }
      };
      const SB = 2000; // far field: 2 km quads; 500 m blocks near the city and along the water
      for (let sz = -R; sz < R; sz += SB) for (let sx = -R; sx < R; sx += SB) {
        if (!inCore(sx, sz, SB) && !nearWaterBox(sx, sz, SB)) { emitBlock('far', sx, sz, SB, 1); continue; }
        for (let bz = sz; bz < sz + SB; bz += B) for (let bx = sx; bx < sx + SB; bx += B) {
          if (isFine(bx, bz)) emitBlock('fine', bx, bz, B, N); else emitBlock('far', bx, bz, B, 1);
        }
      }
      for (const set of ['fine', 'far']) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos[set], 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col[set], 3));
        g.computeVertexNormals();
        geom.addStatic(groundMat, g, { castShadow: false, ao: false, reflect: set === 'fine', tile: set === 'fine' ? 1024 : 8192 });
      }
    }

    // ------------------------------------------------------------------------------------------
    // water: river polygon, moats, canals (painted ribbons)
    // ------------------------------------------------------------------------------------------
    if (want('water')) {
      drawn.push('water');
      water.addSurface({ id: 'river', kind: 'river', polygon: world.river.polygon, level: WL });
      for (const m of world.moats) water.addSurface({ id: m.id, kind: 'moat', polygon: m.polygon, level: (m.waterLevel ?? WL) - 0.03 });
      for (const cn of world.canals) {
        const w = cn.width || 8;
        water.addSurface({ id: cn.id, kind: 'canal', ribbon: { polyline: cn.polyline, width: Math.max(w, 4) }, level: (x, z) => Math.max(ground.height(x, z), WL) + 0.25 });
      }
    }

    // ------------------------------------------------------------------------------------------
    // inner walls: Imgur-Enlil, Nemetti-Enlil, quay, towers, ordinary gates, causeways
    // ------------------------------------------------------------------------------------------
    const iw = world.innerWalls, prof = iw.profile;
    if (want('innerWalls')) {
      drawn.push('innerWalls');
      const main = prof.imgurEnlil, quay = prof.quay;
      const BASE = -3;
      for (const side of ['east', 'west']) {
        const S = iw[side], east = side === 'east';
        // levels along the wall (raised stretch at the palaces and the Ishtar Gate): the shared helper
        const lv = (x, z) => W.innerWallLevels(side, x, z);
        put('mudPlaster', geom.wall(S.innerLine, { thickness: main.thickness, base: BASE, top: (x, z) => lv(x, z).parapetTop, step: 13.8 }));
        put('mudPlasterWeathered', geom.wall(S.outerLine, { thickness: prof.nemettiEnlil.thickness, base: BASE, top: (x, z) => lv(x, z).frontTop, step: 13.8 }));
        // quay: quayLine is the water face; the wall body lies towards the city. East side: no quay west of the Ishtar Gate.
        const ql = east ? S.quayLine.slice(1) : S.quayLine;
        const towardsCity = M.nearestOnPolyline(S.innerLine[east ? 2 : 1][0], S.innerLine[east ? 2 : 1][1], ql).side;
        put('bakedBrickBuff', geom.wall(ql, { thickness: quay.nebuchadnezzar.thickness, offset: towardsCity * quay.nebuchadnezzar.thickness / 2, base: quay.base, top: (x, z) => lv(x, z).quayTop, step: 13.8 }));
        // towers at the canonical centres (W.wallTowers: per straight run between corners and gates)
        for (const t of W.wallTowers(side + ':main')) put('mudPlaster', geom.tower({ x: t.x, z: t.z, w: t.w, d: t.d, rotDeg: t.rotDeg, base: BASE, top: t.top + main.parapet }));
        for (const t of W.wallTowers(side + ':front')) put('mudPlasterWeathered', geom.tower({ x: t.x, z: t.z, w: t.w, d: t.d, rotDeg: t.rotDeg, base: BASE, top: t.top }));
        for (const t of W.wallTowers(side + ':quay')) put('bakedBrickBuff', geom.tower({ x: t.x + t.out[0] * t.d / 2, z: t.z + t.out[1] * t.d / 2, w: t.w, d: t.d, rotDeg: t.rotDeg, base: quay.base, top: t.top }));
      }
      // the seven ordinary gates (the Ishtar Gate is monument:ishtarGate) and their causeways
      for (const g of iw.gates) {
        if (g.monumentId) continue;
        const out = M.azToDir(g.facingDeg), fg = g.foreGate, mg = g.mainGate, rot = g.facingDeg;
        const at = (d) => [g.x + out[0] * d, g.z + out[1] * d];
        const mIn = mg.depth * 0.663, mOut = mg.depth - mIn;            // the wall line meets the main gate 1/3 from its front
        const mc = at((mOut - mIn) / 2), fc = at(mOut + g.gap + fg.depth / 2);
        put('mudPlasterFresh', geom.box({ x: mc[0], z: mc[1], sx: mg.width, sz: mg.depth, y0: -3, y1: mg.topLevel, rotDeg: rot }));
        put('mudPlasterFresh', geom.box({ x: fc[0], z: fc[1], sx: fg.width, sz: fg.depth, y0: -3, y1: fg.topLevel, rotDeg: rot }));
        const r = M.rightOf(out[0], out[1]);
        for (const sgn of [-1, 1]) {
          const mtw = at(mOut - 2), ftw = at(mOut + g.gap + fg.depth - 2);
          put('mudPlasterFresh', geom.box({ x: mtw[0] + r[0] * sgn * (mg.width / 2 - 4.5), z: mtw[1] + r[1] * sgn * (mg.width / 2 - 4.5), sx: 9, sz: 8, y0: -3, y1: mg.towerTopLevel, rotDeg: rot }));
          put('mudPlasterFresh', geom.box({ x: ftw[0] + r[0] * sgn * (fg.width / 2 - 3.1), z: ftw[1] + r[1] * sgn * (fg.width / 2 - 3.1), sx: 6.2, sz: 6, y0: -3, y1: fg.towerTopLevel, rotDeg: rot }));
        }
        if (g.causeway && g.causeway.from) put('bakedBrickBuff', geom.wall([g.causeway.from, g.causeway.to], { thickness: g.causeway.width, base: -6, top: prof.quay.nabopolassar.top }));
      }
      flush({ reflect: true });
    }

    // ------------------------------------------------------------------------------------------
    // outer wall: mud wall + baked wall, towers (instanced), gates, cross-wall
    // ------------------------------------------------------------------------------------------
    if (want('outerWall')) {
      drawn.push('outerWall');
      const ow = world.outerWall, p = ow.profile, line = ow.line;
      // outward side: the side of the first segment that is NOT inside the outer city
      const mid = [(line[1][0] + line[2][0]) / 2, (line[1][1] + line[2][1]) / 2], d = [line[2][0] - line[1][0], line[2][1] - line[1][1]], dl = Math.hypot(d[0], d[1]);
      const rt = M.rightOf(d[0] / dl, d[1] / dl);
      const outSign = M.pointInPolygon(mid[0] + rt[0] * 60, mid[1] + rt[1] * 60, world.enclosures.outerCity) ? -1 : 1;
      const bw = p.offsetsFromMudWallCentreline.bakedWall;
      put('mudPlaster', geom.wall(line, { thickness: p.mudWall.thickness, base: -2, top: p.mudWall.top + p.mudWall.crenellation }));
      put('bakedBrickYellow', geom.wall(line, { thickness: p.bakedWall.thickness, offset: outSign * (bw[0] + bw[1]) / 2, base: -6, top: p.bakedWall.top }));
      const unit = geom.box({ x: 0, z: 0, sx: 1, sz: 1, y0: 0, y1: 1 });
      const towers = geom.instanced({ name: 'massing-outer-towers', geometry: unit, material: 'mudPlaster', reflect: true });
      for (const t of W.wallTowers('outer')) towers.add({ x: t.x, y: -2, z: t.z, rotDeg: t.rotDeg, sx: t.w, sy: t.top + 2, sz: t.d });
      for (const g of ow.gates) put('mudPlasterFresh', geom.box({ x: g.x, z: g.z, sx: g.width, sz: g.depth, y0: -2, y1: 19, rotDeg: g.facingDeg }));
      const cw = ow.crossWall;
      put('mudPlasterGrey', geom.wall(cw.polyline, { thickness: cw.thickness, base: -2, top: (x, z) => ground.height(x, z) + cw.height, step: 30 }));
      flush({ reflect: true });
    }

    // ------------------------------------------------------------------------------------------
    // streets
    // ------------------------------------------------------------------------------------------
    const onGround = (x, z) => ground.height(x, z);
    if (want('streets')) {
      drawn.push('streets');
      for (const s of world.streets) {
        if (s.class === 'road') continue;
        if (s.levels) put(s.class === 'processional' ? 'limestone' : 'streetEarthDamp', geom.ribbon(s.polyline, { widths: s.widths, width: s.width, y: s.levels, lift: 0.12, step: 12 }));
        else put('streetEarthDamp', geom.ribbon(s.polyline, { width: s.width, y: onGround, lift: 0.18, step: 20 }));
      }
      for (const s of world.merkesStreets.streets) put('streetEarthDamp', geom.ribbon(s.polyline, { width: s.width, y: onGround, lift: 0.18, step: 10 }));
      flush({ castShadow: false, ao: false });
    }
    // roads outside the inner city (layout.streets with cls 'road'): the north road and the six country roads
    if (want('roads')) {
      drawn.push('roads');
      for (const s of world.streets) if (s.class === 'road') put('streetEarth', geom.ribbon(s.polyline, { width: s.width, y: onGround, lift: 0.18, step: 20 }));
      for (const r of world.environs.roads || []) put('streetEarth', geom.ribbon(r.polyline, { width: r.width, y: onGround, lift: 0.25, step: 60 }));
      flush({ castShadow: false, ao: false });
    }

    // ------------------------------------------------------------------------------------------
    // bridge: six boat-shaped piers (bow upstream) and the deck
    // ------------------------------------------------------------------------------------------
    if (want('bridge')) {
      drawn.push('bridge');
      const b = world.bridge, hw = b.pierSize.alongBridge / 2, hl = b.pierSize.alongStream / 2;
      const shape = [[0, -hl], [hw, -hl + 6.5], [hw, hl - 2], [hw - 2, hl], [-hw + 2, hl], [-hw, hl - 2], [-hw, -hl + 6.5]]; // local: -z = upstream
      for (const p of b.piers) put('bakedBrickBuff', geom.prism(M.closeRing(shape.map(([lx, lz]) => M.localToWorld([p.x, p.z], b.pierBowAzimuthDeg, lx, lz))), b.pierBase, b.pierTop, { bottom: false }));
      put('cedar', geom.wall([b.westAbutment, b.eastAbutment], { thickness: b.width, base: b.deckStructure.undersideLevel, top: b.deckLevel }));
      flush({ reflect: true });
    }

    // ------------------------------------------------------------------------------------------
    // monuments
    // ------------------------------------------------------------------------------------------
    const pw = W.street('processionalWay');
    const pwLevel = (x, z) => M.valueAlong(pw.levels, M.nearestOnPolyline(x, z, pw.polyline));
    const inwardOffset = (ring, t) => (M.polygonArea(ring) > 0 ? 1 : -1) * t / 2; // clockwise ring: interior on the right
    for (const m of world.monuments) {
      if (!want('monument:' + m.id)) continue;
      drawn.push('monument:' + m.id);
      const fp = m.footprint, ring = fp.polygon, d = m.dims || {}, lv = monumentLevels(m);
      const cx = fp.center[0], cz = fp.center[1], base = baseOf(ring);
      if (m.id === 'etemenanki') {
        let y = d.baseLevel;
        for (const [side, h] of d.stages) { put('bakedBrickBuff', geom.box({ x: cx, z: cz, sx: side, sz: side, y0: y, y1: y + h, rotDeg: fp.rotationDeg })); y += h; }
        put('glazeBlue', geom.box({ x: cx, z: cz, sx: d.temple.size[0], sz: d.temple.size[1], y0: y, y1: y + d.temple.height, rotDeg: fp.rotationDeg }));
        const fl = d.stairs.flights, rot = fp.rotationDeg, L = (lx, lz) => M.localToWorld(fp.center, rot, lx, lz);
        const c0 = L(0, d.stairs.central.zTo);
        put('bakedBrickYellow', geom.stairs({ x: c0[0], z: c0[1], azDeg: rot, width: d.stairs.central.width, steps: fl.central.risers, riser: fl.central.riser, tread: fl.central.tread, base: d.baseLevel }));
        const lb = d.stairs.lateralBlock, half = d.baseSide / 2, zc = half + lb.projection / 2;
        const w0 = L(lb.xFrom, zc), e0 = L(lb.xTo, zc);
        put('bakedBrickYellow', geom.stairs({ x: w0[0], z: w0[1], azDeg: rot + 90, width: lb.projection, steps: fl.lateralWest.risers, riser: fl.lateralWest.riser, tread: fl.lateralWest.tread, base: d.baseLevel }));
        put('bakedBrickYellow', geom.stairs({ x: e0[0], z: e0[1], azDeg: rot + 270, width: lb.projection, steps: fl.lateralEast.risers, riser: fl.lateralEast.riser, tread: fl.lateralEast.tread, base: d.baseLevel }));
        const la = d.stairs.landing, lc = L((la.xFrom + la.xTo) / 2, zc);
        put('bakedBrickYellow', geom.box({ x: lc[0], z: lc[1], sx: la.xTo - la.xFrom, sz: lb.projection, y0: d.baseLevel, y1: d.baseLevel + la.level, rotDeg: rot }));
      } else if (m.id === 'etemenankiPrecinct') {
        const top = d.courtLevel + d.wall.height;
        put('templePlasterWhite', geom.wall(ring, { closed: true, thickness: d.wall.depth, offset: inwardOffset(ring, d.wall.depth), base, top }));
        put('courtBrickPaving', geom.cap(ring, d.courtLevel + 0.05));
        const ns = d.northStorehouse, ss = d.southStorehouse;
        put('limewashAged', geom.prism(ns.polygon, d.courtLevel, d.courtLevel + ns.height, { holes: ns.court ? [ns.court] : [] }));
        put('limewashAged', geom.prism(ss.polygon, d.courtLevel, d.courtLevel + ss.height));
      } else if (m.id === 'southPalace') {
        const courts = Object.values(d.courts).map((c) => c.polygon);
        put('bakedBrickYellow', geom.prism(ring, base, d.wallTopLevel - 2, { holes: courts, top: false }));
        put('roofEarth', geom.cap(ring, d.wallTopLevel - 2, { holes: courts }));
        put('bakedBrickYellow', geom.wall(ring, { closed: true, thickness: 4, offset: inwardOffset(ring, 4), base: d.floorLevel, top: d.wallTopLevel }));
        for (const c of courts) put('courtBrickPaving', geom.cap(c, d.floorLevel));
      } else if (m.id === 'northPalace') {
        put('courtBrickPaving', geom.cap(ring, d.lowerTerraceLevel));
        // enclosure wall WITHOUT its east side: that is the west wall of the lion street (claim 'lionStreet')
        put('bakedBrickYellow', geom.wall([ring[5], ring[0], ring[1], ring[2], ring[3]], { thickness: 7, offset: inwardOffset(ring, 7), base, top: d.outerWallTop }));
        const mb = d.mainBuilding, courts = Object.values(mb.courts).map((c) => M.rectRing(c.center[0], c.center[1], c.size[0], c.size[1], mb.rotationDeg));
        put('bakedBrickYellow', geom.prism(mb.polygon, d.lowerTerraceLevel, d.terraceLevel + 9, { holes: courts, top: false }));
        put('roofEarth', geom.cap(mb.polygon, d.terraceLevel + 9, { holes: courts }));
        for (const c of courts) put('limestone', geom.cap(c, d.terraceLevel));
      } else if (m.id === 'eastFortification') {
        // enclosure wall WITHOUT its west side: that is the east wall of the lion street (claim 'lionStreet')
        put('bakedBrickBuff', geom.wall([ring[2], ring[3], ring[4], ring[5], ring[0]], { thickness: 7, offset: inwardOffset(ring, 7), base: -6, top: d.wallTopLevel.north }));
      } else if (m.id === 'westFortification') {
        put('bakedBrickBuff', geom.prism(ring, d.base, d.top));
      } else if (m.id === 'summerPalace') {
        put('bakedBrickYellow', geom.prism(ring, base, d.wallTop));
      } else if (m.id === 'ishtarGate') {
        const ax = d.axis, dir = [(ax.south[0] - ax.north[0]) / ax.length, (ax.south[1] - ax.north[1]) / ax.length], rot = M.dirToAz(-dir[0], -dir[1]);
        const at = (s) => [ax.north[0] + dir[0] * s, ax.north[1] + dir[1] * s], r = M.rightOf(-dir[0], -dir[1]);
        const st2 = d.stations_s, fgc = at(st2.foreGateSouthFace / 2), mgc = at((st2.mainGateTowerFronts + st2.mainGateSouthFace) / 2);
        put('glazeBlue', geom.box({ x: fgc[0], z: fgc[1], sx: d.foreGate.width, sz: d.foreGate.depth, y0: 0, y1: d.foreGate.wallTopLevel, rotDeg: rot }));
        put('glazeBlue', geom.box({ x: mgc[0], z: mgc[1], sx: d.mainGate.width, sz: d.mainGate.depth, y0: 0, y1: d.mainGate.wallTopLevel, rotDeg: rot }));
        for (const sgn of [-1, 1]) {
          const f = at(d.foreGate.towers.projection + 1.5), g2 = at(st2.mainGateTowerFronts + 3);
          const fo = sgn * (d.foreGate.towers.innerFacesApart / 2 + d.foreGate.towers.width / 2), mo = sgn * (d.mainGate.towers.innerFacesApart / 2 + d.mainGate.towers.width / 2);
          put('glazeBlueDark', geom.box({ x: f[0] + r[0] * fo, z: f[1] + r[1] * fo, sx: d.foreGate.towers.width, sz: 7, y0: 0, y1: d.foreGate.towerTopLevel, rotDeg: rot }));
          put('glazeBlueDark', geom.box({ x: g2[0] + r[0] * mo, z: g2[1] + r[1] * mo, sx: d.mainGate.towers.width, sz: 10, y0: 0, y1: d.mainGate.towerTopLevel, rotDeg: rot }));
        }
        for (const key of ['west', 'east']) {
          const bb = d.bastions[key], bx = (bb[0][0] + bb[1][0]) / 2 + (key === 'west' ? -8 : 8), bz = (bb[0][1] + bb[1][1]) / 2;
          put('bakedBrickBuff', geom.box({ x: bx, z: bz, sx: 16, sz: 18, y0: 0, y1: 28.4, rotDeg: rot }));
        }
        const ng = d.northGate;
        for (const sgn of [-1, 1]) put('bakedBrickBuff', geom.box({ x: ng.x + sgn * 11, z: ng.z, sx: 9, sz: ng.length, y0: 0, y1: ng.level + 12, rotDeg: 356 }));
      } else {
        // temples and anything else: a solid block from the ground to its top
        const floor = lv.floor ?? ground.height(cx, cz), top = lv.top ?? floor + (lv.height ?? 9);
        const white = /temple/.test(m.kind);
        put(white ? 'templePlasterWhite' : 'mudPlaster', geom.prism(ring, Math.min(base, floor - 1), top, { top: false }));
        put('roofEarth', geom.cap(ring, top));
      }
    }
    flush({ reflect: true });

    // ------------------------------------------------------------------------------------------
    // lion street: the two street walls between the North Gate and the bastions, 12 m above the pavement,
    // with blue merlons in both levels of detail (geometry near, alpha strip beyond 600 m)
    // ------------------------------------------------------------------------------------------
    if (want('lionStreet')) {
      drawn.push('lionStreet');
      const np = W.monument('northPalace'), ef = W.monument('eastFortification');
      const westWall = np.footprint.polygon.slice(3, 6).reverse();   // (335.7, -780.7) -> (346.9, -940.5), travelling north
      const eastWall = ef.footprint.polygon.slice(0, 3);             // (357.7, -768.3) -> (369.2, -934.3), travelling north
      const h = np.dims.eastWall.heightAboveStreet, th = np.dims.eastWall.thickness, top = (x, z) => pwLevel(x, z) + h;
      // each wall lies on the palace side of the footprint edge (travelling north: west wall to the left, east wall to the right)
      put('bakedBrickBuff', geom.wall(westWall, { thickness: th, offset: -th / 2, base: baseOf(westWall), top, step: 15 }));
      put('bakedBrickBuff', geom.wall(eastWall, { thickness: th, offset: th / 2, base: -6, top, step: 15 }));
      flush({ reflect: true });
      const mer = prof.merlons;
      for (const [line, off] of [[westWall, -0.35], [eastWall, 0.35]]) geom.addMerlons('glazeBlue', M.resamplePolyline(line, 15), { y: top, pitch: mer.pitch, width: mer.width, height: mer.height, thickness: 0.6, offset: off });
    }

    // ------------------------------------------------------------------------------------------
    // houses from ctx.layout (walls + mud roof, real court voids), thinned in the draft tier
    // ------------------------------------------------------------------------------------------
    let houseCount = 0;
    if (want('houses')) {
      drawn.push('houses');
      // one white material for all house walls; the mud tone / lime wash is a per-house vertex tint (2 draw calls per tile)
      const wallMat = materials.variant('mudPlaster', { color: 0xffffff, name: 'massing-house-walls' });
      const tones = ['mudPlaster', 'mudPlasterSunlit', 'mudPlasterWeathered', 'mudPlasterFresh', 'mudPlasterGrey', 'mudPlasterReddish', 'mudPlasterDark'].map((id) => materials.color(id));
      const lime = materials.color('limewash');
      for (const h of layout.houses) {
        if (!layout.isBuilt(h)) continue;
        put(wallMat, geom.paint(geom.prism(h.footprint, h.groundLevel - 1.5, h.roofLevel + h.parapet, { holes: h.courts, top: false }), h.whitewashed ? lime : tones[h.seed % tones.length]));
        put('roofEarth', geom.cap(h.footprint, h.roofLevel, { holes: h.courts }));
        houseCount++;
      }
      flush();
    }

    // ------------------------------------------------------------------------------------------
    // district outlines (DEBUG layer)
    // ------------------------------------------------------------------------------------------
    const outline = materials.variant('dyeMadderRed', { name: 'massing-outline', emissive: 0x8a1f18, emissiveIntensity: 1.0 });
    for (const dst of world.districts) put(outline, geom.ribbon(dst.polygon, { width: 4, y: (x, z) => Math.max(ground.height(x, z), WL) + 1.0, step: 40 }));
    flush({ castShadow: false, receiveShadow: false, ao: false, layer: LAYERS.DEBUG, tile: 4096 });

    return {
      stats: { drawn: drawn.length, parts: drawn.filter((p) => !p.startsWith('monument:')), monuments: drawn.filter((p) => p.startsWith('monument:')).length, houses: houseCount },
    };
  },
};
