// js/modules/rivercraft/index.js — river traffic of Babylon c. 575 BCE (SPEC 3.18; R5 2.3; docs/mod-rivercraft.md).
//   * the hero: the 14 m grain barge the camera rides in shot 5, placed under the film path (film.rideAt)
//   * 26 craft under way on lanes that follow the channel (pure functions of film time), two of them towed upstream
//     from the bank, ferries at the bridge, everything through the gaps between the piers
//   * about 60 moored or beached at the moorings of riverworks (fallback: the banks of world.json)
//   * wakes (ctx.water.addBoat), boat lamps (ctx.emitters), tow ropes
// Publishes ctx.modules.rivercraft = { boats, cameraBoat, tows, eye, models } (agreed shape + documented extras).
// Files: mesh.js (mesh writer), hull.js (hull and cargo), models.js (the craft), traffic.js (channel, lanes, moorings).
// OWNER: rivercraft. Claims nothing.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { MB } from './mesh.js';
import { colours, buildHero, HERO, FLEET } from './models.js';
import { makeRiver, lanePose, ferryPose, towPath, fallbackMoorings } from './traffic.js';

const NEAR = 140;                 // metres: inside this a boat is drawn with its four materials, beyond it with one
const SLOTS = ['hull', 'wood', 'mat', 'clay'];

export default {
  name: 'rivercraft',
  claims: [],

  async build(ctx) {
    const { THREE, geom, water, ground, film, materials, world, LAYERS } = ctx;
    const rng = ctx.module.rng, log = ctx.module.log || (() => {}), warn = ctx.module.warn || ((m) => console.warn('[rivercraft] ' + m));
    const C = colours(ctx);
    const T = film.duration;

    // ---- materials: white variants, the tones are in the vertex colours ---------------------------------------
    const MAT = {
      hull: materials.variant('bitumen', { name: 'rivercraft-hull', color: 0xffffff, rows: { pitch: 0.27, strength: 0.3, bevel: 0.4 }, roughness: 1, spec: 0.35, wet: false }),
      wood: materials.variant('cedar', { name: 'rivercraft-wood', color: 0xffffff, rows: { pitch: 0.21, strength: 0.13, bevel: 0.22, value: 0.13 } }),
      mat: materials.variant('reedMat', { name: 'rivercraft-mat', color: 0xffffff, wet: false }),
      clay: materials.preset('pottery', { name: 'rivercraft-clay', color: 0xffffff, wet: false }),
      cloth: materials.variant('woolBrown', { name: 'rivercraft-cloth', color: 0xffffff, wet: false }),
      far: materials.variant('bitumen', { name: 'rivercraft-far', color: 0xffffff, relief: 0.5, roughness: 1, spec: 0.35, wet: false }),
    };

    // ---- the channel ------------------------------------------------------------------------------------------------
    const river = makeRiver(ctx);
    const boatShot = film.shots.find((s) => s.raw && s.raw.ridesBoat) || null;

    // =================================================================================================================
    // 1. THE HERO under the film path
    // =================================================================================================================
    const hero = buildHero(C);
    const heroGroup = new THREE.Group(); heroGroup.name = 'rivercraft:hero';
    let heroTris = 0;
    for (const slot of [...SLOTS, 'cloth']) {
      if (!hero.parts[slot].tris) continue;
      const mesh = new THREE.Mesh(hero.parts[slot].toGeometry(THREE), MAT[slot]);
      mesh.name = 'rivercraft:hero:' + slot; mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(LAYERS.REFLECT);
      heroGroup.add(mesh); heroTris += hero.parts[slot].tris;
    }
    ctx.module.group.add(heroGroup);
    const eye = HERO.eye;
    /** the hero's pose: the eye of the film path stands at HERO.eye on the steering platform */
    const heroPose = (t) => {
      if (!boatShot) return null;
      const r = film.rideAt(boatShot.n, t), h = r.headingDeg, f = M.azToDir(h), rt = M.rightOf(f[0], f[1]);
      return {
        x: r.pos[0] - rt[0] * eye[0] + f[0] * eye[2], y: r.pos[1] - eye[1], z: r.pos[2] - rt[1] * eye[0] + f[1] * eye[2], headingDeg: h,
        roll: 0.32 * Math.sin(t * 1.25 + 0.6) + 0.12 * Math.sin(t * 2.7), pitch: 0.1 * Math.sin(t * 0.95 + 2.1),
      };
    };

    // =================================================================================================================
    // 2. The fleet models, near (four materials) and far (one)
    // =================================================================================================================
    const models = {};
    for (const name of Object.keys(FLEET)) {
      const near = FLEET[name](C, 1), far = FLEET[name](C, 0);
      const goods = new MB(); goods.append(near.parts.clay); goods.append(near.parts.cloth);
      const one = new MB(); for (const s of [...SLOTS, 'cloth']) one.append(far.parts[s]);
      models[name] = {
        name, meta: near.meta,
        near: { hull: near.parts.hull, wood: near.parts.wood, mat: near.parts.mat, clay: goods }, far: one,
        nearTris: near.parts.tris(), farTris: one.tris, boats: [],
      };
    }

    // =================================================================================================================
    // 3. Boats under way
    // =================================================================================================================
    const boats = [];                                      // every record, hero first
    const mk = (id, model, moored, poseAt, extra = {}) => {
      const md = models[model], scale = extra.scale ?? 1, meta = md ? md.meta : hero.meta;
      const rec = {
        id, kind: meta.kind, moored, length: meta.length * scale, poseAt,
        // documented extras (docs/mod-rivercraft.md)
        model, beam: meta.beam * scale, scale, freeboard: (meta.freeboard || 0.9) * scale,
        crew: meta.crew.map((c) => ({ ...c, x: c.x * scale, y: c.y * scale, z: c.z * scale })),
        tint: extra.tint && extra.tint.isColor ? extra.tint : new THREE.Color(1, 1, 1), beached: !!extra.beached, towed: !!extra.towed, group: extra.group || null,
        /** boat-local [x (starboard), y (above the waterline), z (astern)] -> world [x, y, z] at film time t */
        toWorld(local, t) { const p = poseAt(t); if (!p) return null; const f = M.azToDir(p.headingDeg), r = M.rightOf(f[0], f[1]); return [p.x + r[0] * local[0] - f[0] * local[2], p.y + local[1], p.z + r[1] * local[0] - f[1] * local[2]]; },
        /** the i-th crew place in the world: { x, y, z, headingDeg (the way the figure faces), pose } */
        seatAt(i, t) { const c = rec.crew[i], p = poseAt(t); if (!c || !p) return null; const w = rec.toWorld([c.x, c.y, c.z], t); return { x: w[0], y: w[1], z: w[2], headingDeg: M.mod(p.headingDeg + (c.faceDeg || 0), 360), pose: c.pose }; },
      };
      if (md) md.boats.push(rec);
      boats.push(rec);
      return rec;
    };
    if (boatShot) mk('hero', null, false, heroPose);
    const heroRec = boats[0] || null;
    if (heroRec) { heroRec.model = 'hero'; heroRec.eye = eye.slice(); heroRec.deck = HERO.deck; }

    const tRef = boatShot ? boatShot.mid : 28.3;
    // [id, model, x, z at film time t, speed along the channel (+ downstream), options]
    const LANES = [
      // in front of the camera boat (shot 5): quffas left and right of its track, a grain barge ahead, a canoe by the west bank
      ['quffa-donkey', 'quffaDonkey', -127, -268, tRef, 1.15, { spin: 14 }],
      ['quffa-casks', 'quffaCasks', -186, -236, tRef, 1.3, { spin: 10 }],
      ['barge-jars', 'bargeJars', -161, -190, tRef, 1.55, {}],
      ['quffa-small-3', 'quffaSmall', -140, -226, tRef, 1.2, { spin: 14 }],
      ['barge-grain-0', 'bargeGrain', -172, -84, tRef, 1.5, {}],
      ['canoe-west', 'canoe', -203, -196, tRef, -1.25, {}],
      ['barge-reed', 'bargeReed', -206, -40, tRef, 1.45, {}],
      ['quffa-small-1', 'quffaSmall', -150, 20, tRef, 1.2, { spin: 16 }],
      ['canoe-near', 'canoe', -198, -262, tRef, -1.3, {}],
      ['skiff-east', 'skiff', -131, -170, tRef, -1.25, {}],
      // behind it in the basin below the palace (seen coming down in the flight into shot 5)
      ['kelek-1', 'kelek', -158, -452, 25.0, 0.98, {}],
      ['barge-grain-1', 'bargeGrain', -120, -545, 25.0, 1.5, {}],
      ['quffa-casks-2', 'quffaCasks', -165, -590, 25.0, 1.25, { spin: 12 }],
      // at and below the bridge (the flight into shot 6 passes over them; shots 9 and 10 see their lamps)
      ['quffa-bridge', 'quffaSmall', -183.5, 142, 32.4, 1.25, { spin: 6, gap: 1 }],
      ['skiff-bridge', 'skiff', -236.5, 166, 32.0, -1.35, { gap: 4 }],
      ['barge-empty-1', 'bargeEmpty', -190, 300, 33.0, 1.6, {}],
      ['quffa-donkey-2', 'quffaDonkey', -228, 255, 33.0, 1.1, { spin: 12 }],
      ['canoe-south', 'canoe', -262, 420, 33.0, 1.7, {}],
      ['barge-grain-2', 'bargeGrain', -175, 640, 33.0, 1.5, {}],
      ['quffa-small-2', 'quffaSmall', -120, 560, 33.0, 1.15, { spin: 15 }],
      ['skiff-south', 'skiff', -95, 800, 33.0, -1.2, {}],
      // the bay north-west of the West Fortification (shot 4, contre-jour) and the reach past the palaces (shot 1)
      ['barge-jars-2', 'bargeJars', -145, -800, 21.75, 1.5, {}],
      ['quffa-casks-3', 'quffaCasks', -120, -905, 21.75, 1.2, { spin: 12 }],
      ['canoe-bay', 'canoe', -60, -985, 21.75, -1.3, {}],
      ['barge-grain-3', 'bargeGrain', 5, -1045, 21.75, 1.45, {}],
      ['kelek-2', 'kelek', 150, -1262, 3.0, 0.95, {}],
      ['barge-reed-2', 'bargeReed', 300, -1465, 3.0, 1.4, {}],
      ['quffa-north', 'quffaDonkey', 395, -1585, 3.0, 1.1, { spin: 12 }],
      // the reach north of the city, under the fly-in of shot 1
      ['quffa-north-2', 'quffaCasks', 610, -1885, 3.0, 1.2, { spin: 12 }],
      ['barge-north-1', 'bargeGrain', 705, -2060, 3.0, 1.5, {}],
      ['kelek-3', 'kelek', 850, -2400, 3.0, 0.95, {}],
      ['barge-north-2', 'bargeJars', 925, -2620, 3.0, 1.45, {}],
    ];
    for (const [id, model, x, z, t, v, o] of LANES) {
      const seed = hash2(boats.length, 17, 5), kind = models[model].meta.kind;
      mk(id, model, false, lanePose(ctx, river, { at: [x, z], t, v, kind, seed, spin: o.spin || 0, gap: o.gap }), { scale: 0.94 + 0.12 * hash2(boats.length, 3, 9), tint: tintOf(hash2(boats.length, 5, 2)) });
    }
    // ferries: round quffas crossing above and below the bridge
    const FERRIES = [
      ['ferry-north', [-122, -28], [-246, -44], tRef + 1, 1.05, 0.52],
      ['ferry-south', [-166, 318], [-281, 300], 34.0, 1.0, 0.4],
    ];
    for (const [id, from, to, t, v, k] of FERRIES) mk(id, 'quffaFerry', false, ferryPose(ctx, { from, to, t, v, k, seed: hash2(boats.length, 7, 7), crab: -14 }), { scale: 1 });

    // towed barges: (a) along the Nebuchadnezzar quay below the precinct, in the view of shot 5; (b) along the earth bank north of the palaces
    const quay = (world.river.quays || []).find((q) => /Nebuchadnezzar/i.test(q.name || ''));
    const tows = [];
    const addTow = (id, model, line, spec) => {
      const tp = towPath(ctx, { line, ...spec, seed: hash2(boats.length, 11, 3) });
      const rec = mk(id, model, false, tp.boatPose, { scale: 1, towed: true });
      const md = models[model].meta;
      const tow = {
        boat: id, haulers: tp.haulers, spacing: tp.spacing,
        /** the k-th hauler on the path (0 leads): { x, y (the path under his feet), z, headingDeg } */
        haulerAt: (t, k = 0) => tp.teamAt(t, k),
        /** the line: from the mast head to the shoulder of the hauler nearest the boat */
        ropeFrom: (t) => rec.toWorld(md.tow, t),
        ropeTo: (t) => { const h = tp.teamAt(t, tp.haulers - 1); return [h.x, h.y + 1.25, h.z]; },
      };
      tows.push(tow); rec.tow = tow;
      return rec;
    };
    const rw = (ctx.modules && ctx.modules.riverworks) || null;
    {
      // the team walks the quay's walkway (riverworks: 1.65 m wide at -0.4, its middle 0.33 m riverward of the quay line)
      const northSouth = (pl) => (pl[0][1] > pl[pl.length - 1][1] ? pl.slice().reverse() : pl);
      const walks = rw && Array.isArray(rw.walkways) ? rw.walkways.filter((w) => w.bank === 'east' && Array.isArray(w.polyline) && w.polyline.length > 1) : [];
      const walk = walks.find((w) => { const h = M.nearestOnPolyline(-88, -185, w.polyline), e = M.nearestOnPolyline(-98, -110, w.polyline); return h.dist < 4 && e.dist < 4; });
      const spec = { at: [-107, -172], t: tRef, v: 0.92, riverSide: 1, lead: 33, haulers: 5 };
      if (walk) addTow('tow-quay', 'bargeTow', northSouth(walk.polyline), { ...spec, off: 15.8, inland: 0, pathLevel: walk.level ?? -0.4 });
      else if (quay) addTow('tow-quay', 'bargeTow', northSouth(quay.polyline), { ...spec, off: 15.5, inland: rw ? -0.33 : 0.85, pathLevel: rw ? -0.4 : undefined });
    }
    addTow('tow-north', 'bargeTimber', world.river.eastBank.filter((p) => p[1] > -1750 && p[1] < -1100), { at: [262, -1318], t: 3.0, v: 0.9, off: 15, riverSide: 1, inland: 3.2, lead: 34, haulers: 6 });

    // ---- nothing runs through the piers, the banks or another boat: measured over the whole film --------------------
    const moving = boats.slice();
    const sample = (b, t) => { const p = b.poseAt(t); return p; };
    let minSep = Infinity, minSepPair = '', minPier = Infinity, minPierBoat = '', dry = 0;
    const TS = []; for (let t = 0; t <= T + 1e-6; t += 0.5) TS.push(t);
    const track = moving.map((b) => TS.map((t) => sample(b, t)));
    for (let i = 0; i < moving.length; i++) {
      for (let k = 0; k < TS.length; k++) {
        const p = track[i][k]; if (!p) continue;
        const f = M.azToDir(p.headingDeg), hl = moving[i].length / 2;
        for (const e of [-1, 0, 1]) {                                  // bow, middle, stern
          const x = p.x + f[0] * hl * e * 0.9, z = p.z + f[1] * hl * e * 0.9;
          const pc = river.pierClearance(x, z) - moving[i].beam / 2;
          if (pc < minPier) { minPier = pc; minPierBoat = moving[i].id; }
          if (!ground.isWater(x, z)) dry++;
        }
        for (let j = i + 1; j < moving.length; j++) {
          const q = track[j][k]; if (!q) continue;
          if (Math.hypot(p.x - q.x, p.z - q.z) > (moving[i].length + moving[j].length) / 2 + 12) continue;
          const d = hullGap(p, moving[i], q, moving[j]);
          if (d < minSep) { minSep = d; minSepPair = `${moving[i].id} / ${moving[j].id} at t=${TS[k]}`; }
        }
      }
    }

    // =================================================================================================================
    // 4. Moored and beached craft
    // =================================================================================================================
    // riverworks publishes berths at its quays: (x, z) is the middle of the berth in the water, (nx, nz) points to the
    // quay face `clear` metres away, `length` is the longest boat that fits, `rank` is low where the film looks.
    // The mud banks and the landings north of the palaces come from world.json (boats drawn up; keleks being broken up).
    const published = rw && Array.isArray(rw.moorings) && rw.moorings.length >= 20 ? rw.moorings : null;
    const fallback = fallbackMoorings(ctx, rng.fork('moorings'));
    let spots;
    if (published) {
      const srng = rng.fork('berths');
      const byRank = published.map((m, i) => ({ m, i })).sort((p, q) => (p.m.rank ?? p.i) - (q.m.rank ?? q.i));
      spots = [];
      byRank.forEach(({ m }, order) => {
        // the embankment before Esagila, south of the bridge (R5: where boats collect; the night shots look there)
        const esagila = m.z > 185 && m.z < 560 && m.x > world.bridge.x;
        if (!srng.chance(esagila ? 0.5 : order < 36 ? 0.8 : order < 80 ? 0.42 : 0.2)) return;
        let qx = m.nx, qz = m.nz;                                      // toward the quay
        if (qx === undefined || qz === undefined) { const b = typeof ground.bankAt === 'function' ? ground.bankAt(m.x, m.z) : null; if (b && b.normal) { qx = b.normal[0]; qz = b.normal[1]; } else { const f = M.azToDir(m.headingDeg), r = M.rightOf(f[0], f[1]); const sg = ground.isWater(m.x + r[0] * 8, m.z + r[1] * 8) ? -1 : 1; qx = r[0] * sg; qz = r[1] * sg; } }
        spots.push({ berth: true, x: m.x, z: m.z, headingDeg: m.headingDeg, nx: -qx, nz: -qz, clear: m.clear ?? 2.6, maxLen: m.length ?? 12, walkY: Array.isArray(m.walk) ? m.walk[1] : -0.4, kind: m.kind === 'bank' ? 'bank' : 'quay', group: m.kind === 'landing' ? 'landing' : m.kind === 'bank' ? 'bank' : esagila ? 'esagila' : 'berth' });
      });
      for (const f of fallback) if (f.kind === 'bank') spots.push(f);
    } else spots = fallback;

    const QUAY_MODELS = ['bargeJars', 'bargeGrain', 'bargeEmpty', 'bargeReed', 'bargeEmpty', 'skiff', 'quffaCasks', 'bargeTow', 'bargeReed', 'bargeJars', 'bargeGrain', 'bargeEmpty', 'skiff', 'quffaFerry'];
    const BANK_MODELS = ['skiff', 'quffaSmall', 'canoe', 'quffaCasks', 'canoe', 'skiff', 'quffaFerry', 'canoe', 'bargeReed'];
    const mrng = rng.fork('moored');
    const placed = [];
    let keleks = 0;                                        // rafts being broken up at the north landings: few (R5)
    const clearOfTraffic = (x, z, len, tall) => {
      for (let i = 0; i < moving.length; i++) for (let k = 0; k < TS.length; k += 2) { const p = track[i][k]; if (p && Math.hypot(p.x - x, p.z - z) < (len + moving[i].length) / 2 + 3) return false; }
      // the tow line passes 3.3 m above the water over craft lying at the quay: only a mast would foul it
      if (tall) for (const tw of tows) for (let k = 0; k < TS.length; k += 4) {
        const a = tw.ropeFrom(TS[k]), b = tw.ropeTo(TS[k]);
        if (M.distToSegment(x, z, a[0], a[2], b[0], b[2])[0] < len / 2 + 2.5) return false;
      }
      return true;
    };
    const tryPlace = (sp, model, raft = 0) => {
      const md = models[model].meta, scale = 0.92 + 0.16 * mrng.next(), L = md.length * scale, Bm = md.beam * scale;
      if (sp.maxLen && L > sp.maxLen + 0.5 && !raft) return null;
      const along = M.azToDir(sp.headingDeg);
      let x, z, hd, pitch = 0, roll = 0, y = water.level, beached = false;
      if (sp.kind === 'bank' && md.kind !== 'kelek' && L < 9) {
        // drawn up: bow on the mud, a quarter of the length still afloat
        beached = true; hd = M.dirToAz(-sp.nx, -sp.nz) + mrng.range(-22, 22);
        const out = md.kind === 'quffa' ? Bm * 0.55 : L * 0.27;
        x = sp.x + sp.nx * out; z = sp.z + sp.nz * out; pitch = md.kind === 'quffa' ? 2 : 4.5; roll = mrng.range(-3, 3); y = water.level + (md.kind === 'quffa' ? 0.04 : 0.1);
      } else {
        // alongside: parallel to the bank, bow up or down stream; a second boat may lie outside the first
        // a published berth is `clear` metres off the face: bring the hull to 0.6 m from it; else measure from the bank line
        const off = sp.berth ? Bm / 2 + 0.6 - sp.clear + raft : Bm / 2 + (sp.kind === 'bank' ? 2.2 + md.length * 0.12 : 0.55) + raft;
        x = sp.x + sp.nx * off; z = sp.z + sp.nz * off; hd = sp.headingDeg + (mrng.chance(sp.berth ? 0.25 : 0.6) ? 180 : 0) + mrng.range(-4, 4);
        if (md.kind === 'quffa') hd = mrng.range(0, 360);
      }
      void along;
      // afloat hulls must lie in water along their whole length
      if (!beached) { const f = M.azToDir(hd); for (const e of [-0.5, 0, 0.5]) if (!ground.isWater(x + f[0] * L * e * 0.9 + sp.nx * 0.2, z + f[1] * L * e * 0.9 + sp.nz * 0.2)) return null; }
      for (const q of placed) if (Math.hypot(q.x - x, q.z - z) < (q.L + L) / 2 * (raft ? 0.45 : 1) + (raft ? Bm * 0.5 : 0.8) && !(raft && q === placed[placed.length - 1])) return null;
      if (river.pierClearance(x, z) < L / 2 + 2 || !clearOfTraffic(x, z, L, md.tow[1] > 2.5)) return null;
      const pose = { x, y, z, headingDeg: M.mod(hd, 360), roll, pitch };
      const rec = { x, z, L, Bm, model, scale, pose, beached, group: sp.group, sp, raft };
      placed.push(rec);
      return rec;
    };
    for (const sp of spots) {
      const list = sp.kind === 'bank' ? BANK_MODELS : QUAY_MODELS;
      let model = list[Math.floor(mrng.next() * list.length)];
      if (sp.group === 'north' && sp.kind === 'bank' && keleks < 2 && mrng.chance(0.35)) { model = 'kelek'; keleks++; }
      const first = tryPlace(sp, model) || tryPlace(sp, sp.kind === 'bank' ? 'canoe' : 'bargeReed') || tryPlace(sp, 'skiff') || tryPlace(sp, 'quffaSmall');
      // rafted up two deep where boats crowd: the bridge landings and the embankment before Esagila
      const crowded = /bridge|esagila|landing/i.test(sp.group || '') || (sp.berth && Math.hypot(sp.x - world.bridge.x, sp.z - world.bridge.z) < 260);
      if (first && !first.beached && crowded && mrng.chance(0.4)) tryPlace(sp, mrng.pick(['skiff', 'quffaSmall', 'bargeEmpty', 'quffaCasks']), first.Bm + 0.5);
    }
    // thin to the target (world.json targets.boats.moored), dropping from the far reaches first
    const target = (world.targets && world.targets.boats && world.targets.boats.moored) || 60;
    let keep = placed.slice();
    if (published) {
      // published berths are listed best-seen first: the last ones go first; the banks, the landings and the Esagila reach stay
      const isBerth = (q) => q.group === 'berth';
      const allow = Math.max(20, target + 2 - keep.filter((q) => !isBerth(q)).length);
      let nB = keep.filter(isBerth).length;
      for (let j = keep.length - 1; j >= 0 && nB > allow; j--) if (isBerth(keep[j])) { keep.splice(j, 1); nB--; }
    } else {
      // (every other one of a group goes, the far reaches first)
      for (const g of ['south', 'basin', 'westBank', 'north', 'esagila', 'bridgeWest', 'bridgeEast', 'precinct']) {
        let i = 0; while (keep.length > target + 2) { const idx = keep.findIndex((q, j) => j >= i && q.group === g); if (idx < 0) break; keep.splice(idx, 1); i = idx + 1; }
        if (keep.length <= target + 2) break;
      }
    }
    keep.forEach((q, i) => {
      const pose = q.pose, seed = hash2(i, 23, 4);
      const bob = q.beached ? () => pose : (t) => ({ x: pose.x, y: pose.y + (water.heightAt(pose.x, pose.z, t) - water.level) * 0.5, z: pose.z, headingDeg: pose.headingDeg, roll: pose.roll + 0.5 * Math.sin(t * (0.9 + seed) + seed * 40), pitch: pose.pitch });
      const rec = mk('moored-' + i, q.model, true, bob, { scale: q.scale, tint: tintOf(hash2(i, 29, 6)), beached: q.beached, group: q.group });
      rec._berth = q;
    });
    const moored = boats.filter((b) => b.moored);

    // =================================================================================================================
    // 5. Batches: every model's geometry lives in five THREE.BatchedMesh (bitumen, timber, reed, clay; and one far
    //    level in one material), so the whole fleet costs five draw calls per pass whatever the number of models
    //    (the engine's world-position chunk supports batching: js/core/hooks.js). Each boat owns one instance per
    //    batch; every frame the near or the far ones are switched on by its distance from the camera.
    // =================================================================================================================
    let fleetTris = 0;
    const used = Object.values(models).filter((md) => md.boats.length);
    const makeBatch = (name, material, pick, shadowTexel) => {
      let nv = 0, ni = 0, nInst = 0; const list = [];
      for (const md of used) { const mb = pick(md); if (!mb || !mb.tris) continue; list.push([md, mb]); nv += mb.verts; ni += mb.i.length; nInst += md.boats.length; fleetTris += mb.tris; }
      const bm = new THREE.BatchedMesh(Math.max(1, nInst) + 1, nv, ni, material);
      bm.userData.gids = {};
      bm.name = name; bm.castShadow = true; bm.receiveShadow = true; bm.layers.enable(LAYERS.REFLECT);
      bm.frustumCulled = false; bm.perObjectFrustumCulled = true; bm.sortObjects = false;
      for (const [md, mb] of list) {
        const gid = bm.addGeometry(mb.toGeometry(THREE)); bm.userData.gids[md.name] = gid;
        for (const boat of md.boats) { const id = bm.addInstance(gid); bm.setColorAt(id, boat.tint); bm.setVisibleAt(id, false); (boat._inst[name] = boat._inst[name] || []).push(id); }
      }
      if (shadowTexel && ctx.lighting && typeof ctx.lighting.limitShadow === 'function') ctx.lighting.limitShadow(bm, shadowTexel);
      ctx.module.group.add(bm);
      return bm;
    };
    for (const b of boats) b._inst = {};
    const batches = { near: SLOTS.map((slot) => makeBatch('rivercraft:near:' + slot, MAT[slot], (md) => md.near[slot], 0)), far: makeBatch('rivercraft:far', MAT.far, (md) => md.far, 0.6) };
    const nearNames = SLOTS.map((slot) => 'rivercraft:near:' + slot);
    // the hero seen from afar (beyond 450 m its five meshes are hidden and a grain barge of its size stands in)
    let heroFar = -1;
    if (heroRec && batches.far.userData.gids.bargeGrain !== undefined) { heroFar = batches.far.addInstance(batches.far.userData.gids.bargeGrain); batches.far.setColorAt(heroFar, new THREE.Color(0.95, 0.95, 0.95)); batches.far.setVisibleAt(heroFar, false); }
    const heroFarScale = heroRec ? HERO.L / models.bargeGrain.meta.length : 1;

    // =================================================================================================================
    // 6. Wakes, lamps, tow ropes
    // =================================================================================================================
    for (const b of boats) {
      if (b.moored) { water.addWake({ id: 'boat:' + b.id, kind: 'boat', boat: b.id, width: b.beam, length: 1, at: () => null }); continue; }
      const k = b.kind;
      water.addBoat(b, { beam: b.beam, strength: b.id === 'hero' ? 1 : k === 'kelek' ? 0.6 : k === 'quffa' ? 0.65 : k === 'canoe' ? 0.7 : 0.9 });
    }
    // the sweeps of the rafts and the steering oars leave rings
    for (const b of boats) if (!b.moored && b.kind === 'kelek') for (const s of [-1, 1]) water.addWake({ kind: 'oar', period: 3.4, phase: s > 0 ? 0 : 1.7, width: 0.35, length: 5, at: (t) => { const w = b.toWorld([-0.35 * s, 0, s * (b.length / 2 + 3.2)], t), p = b.poseAt(t); return { x: w[0], z: w[2], headingDeg: p.headingDeg, speed: 0.9 }; } });

    // lamps: an open oil lamp on most moored craft, on a few under way after dark (SPEC 3.19: no lanterns)
    let lamps = 0;
    const lampOf = (b) => { const md = b.model === 'hero' ? hero.meta : models[b.model].meta; return md.lamp.map((v) => v * b.scale); };
    for (const b of boats) {
      const h = hash2(lamps + boats.indexOf(b), 41, 8);
      if (b.moored ? h > 0.62 : !(b.id === 'hero' || h < 0.4)) continue;
      const lp = lampOf(b);
      if (b.moored && b.beached) { const w = b.toWorld(lp, 0); ctx.emitters.add({ kind: 'lamp', pos: w, size: 0.8, data: { boat: b.id } }); }
      else ctx.emitters.add({ kind: 'lamp', at: (t) => b.toWorld(lp, t), size: 0.8, data: { boat: b.id } });
      b.lamp = lp; lamps++;
    }

    // mooring lines (one static mesh): bow and stern lines up to the quay walkway, a line to a stake for craft on the mud
    {
      const mb = new MB(), ropeCol = C.rope, stakeCol = [C.woodPale[0] * 0.8, C.woodPale[1] * 0.8, C.woodPale[2] * 0.8];
      const line = (a, b, sag, r = 0.024) => { const pts = []; for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k]); } mb.tube(pts, r, 4, ropeCol, { caps: false }); };
      for (const b of boats) {
        const q = b._berth; if (!q || q.raft) continue;
        const md = models[b.model].meta, sp = q.sp, bow = b.toWorld(md.tow.map((v) => v * b.scale), 0), stern = b.toWorld([0, (md.freeboard || 0.7) * b.scale + 0.25, b.length * 0.44], 0);
        if (!q.beached && sp.berth) {
          // the quay: its face is 0.6 m from the hull, the walkway edge just behind it
          const d = q.Bm / 2 + 0.6 + 0.4, y = (sp.walkY ?? -0.4) + 0.04, f = M.azToDir(q.pose.headingDeg);
          const at = (e) => [q.x - sp.nx * d + f[0] * e, y, q.z - sp.nz * d + f[1] * e];
          if (b.kind === 'quffa') line(bow, at(0.4), 0.12);
          else { line(bow, at(b.length * 0.5 + 1.2), 0.22); line(stern, at(-b.length * 0.5 - 1.2), 0.22); }
        } else if (sp.kind === 'bank') {
          // a stake driven into the bank a few metres up from the water
          const far = q.beached ? 2.2 : 1.2, sx = (q.beached ? bow[0] : q.x) - sp.nx * (q.beached ? far : q.Bm / 2 + 2.2 + md.length * 0.12 + far), sz = (q.beached ? bow[2] : q.z) - sp.nz * (q.beached ? far : q.Bm / 2 + 2.2 + md.length * 0.12 + far), gy = ground.height(sx, sz);
          if (gy > water.level + 0.05 && gy < water.level + 3) { mb.tube([[sx, gy - 0.3, sz], [sx + 0.03, gy + 0.55, sz]], 0.045, 5, stakeCol); line(bow, [sx, gy + 0.4, sz], 0.1); }
        }
      }
      if (mb.tris) {
        const mesh = new THREE.Mesh(mb.toGeometry(THREE), MAT.mat);
        mesh.name = 'rivercraft:moorings'; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
        ctx.module.group.add(mesh);
      }
    }

    // tow ropes: a sagging line from the mast head to the team, redrawn every frame from the two poses
    const ropes = tows.map((tw) => makeRope(ctx, MAT.mat, C.rope, tw));
    for (const r of ropes) ctx.module.group.add(r.mesh);

    // =================================================================================================================
    // 7. Per frame
    // =================================================================================================================
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    const D = Math.PI / 180;
    const matrixOf = (p, scale) => { _e.set((p.pitch || 0) * D, -p.headingDeg * D, (p.roll || 0) * D, 'YXZ'); _q.setFromEuler(_e); _p.set(p.x, p.y, p.z); _s.set(scale, scale, scale); return _m.compose(_p, _q, _s); };
    const stats = { near: 0, far: 0 };
    const update = (frame) => {
      const t = frame.animTime ?? frame.t, cam = frame.camera.pos;
      const hp = heroPose(t);
      if (hp) {
        const far = heroFar >= 0 && Math.hypot(hp.x - cam[0], hp.y - cam[1], hp.z - cam[2]) > 450;
        heroGroup.visible = !far;
        if (!far) { heroGroup.position.set(hp.x, hp.y, hp.z); heroGroup.rotation.set(hp.pitch * D, -hp.headingDeg * D, hp.roll * D, 'YXZ'); }
        if (heroFar >= 0) { batches.far.setVisibleAt(heroFar, far); if (far) batches.far.setMatrixAt(heroFar, matrixOf(hp, heroFarScale)); }
      } else heroGroup.visible = false;
      let nNear = 0, nFar = 0;
      for (const boat of boats) {
        if (!boat._inst['rivercraft:far']) continue;                   // the hero has meshes of its own
        const p = boat.poseAt(t), m = matrixOf(p, boat.scale), d = Math.hypot(p.x - cam[0], p.y - cam[1], p.z - cam[2]), near = d < NEAR + boat.length;
        const fid = boat._inst['rivercraft:far'][0];
        batches.far.setVisibleAt(fid, !near); if (!near) batches.far.setMatrixAt(fid, m);
        for (let k = 0; k < nearNames.length; k++) { const ids = boat._inst[nearNames[k]]; if (!ids) continue; batches.near[k].setVisibleAt(ids[0], near); if (near) batches.near[k].setMatrixAt(ids[0], m); }
        if (near) nNear++; else nFar++;
      }
      stats.near = nNear; stats.far = nFar;
      for (const r of ropes) r.update(t);
    };

    // =================================================================================================================
    // 8. Checks (SPEC 9 / assignment)
    // =================================================================================================================
    const checks = [];
    const under = boats.filter((b) => !b.moored).length;
    const tg = (world.targets && world.targets.boats) || { underWay: 25, moored: 60 };
    checks.push({ name: 'boats under way', value: under, expect: '>= ' + tg.underWay, pass: under >= tg.underWay });
    checks.push({ name: 'boats moored or beached', value: moored.length, expect: `${tg.moored} +/- 8`, pass: Math.abs(moored.length - tg.moored) <= 8 });
    const kinds = {}; for (const b of boats) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
    checks.push({ name: 'boat types (barge, quffa, kelek, canoe)', value: JSON.stringify(kinds), expect: 'all four', pass: ['barge', 'quffa', 'kelek', 'canoe'].every((k) => kinds[k] > 0) });
    checks.push({ name: 'closest two craft under way come over the film (m of water between the hulls)', value: +minSep.toFixed(1), expect: '> 2.5', pass: minSep > 2.5, note: minSepPair });
    checks.push({ name: 'clearance of craft under way from the bridge piers (m)', value: +minPier.toFixed(2), expect: '> 0.8', pass: minPier > 0.8, note: minPierBoat });
    checks.push({ name: 'samples of craft under way that are not on water', value: dry, expect: 0, pass: dry === 0 });
    if (heroRec && boatShot) {
      // the camera boat is exactly under the path, and nothing of it stands in the camera's way (docs/film.md "corridors")
      const p = heroRec.toWorld(eye, boatShot.mid), c = film.pathPoseAt(boatShot.mid).pos, off = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      checks.push({ name: 'camera boat: eye point under the film path in shot 5 (m)', value: +off.toFixed(3), expect: '< 0.02', pass: off < 0.02 });
      const post = hero.H.posts, tip = (path) => path.reduce((a, q) => (q[1] > a[1] ? q : a), path[0]);
      const pts = { 'bow post': tip(post.bow), 'stern post': tip(post.stern), 'sweep loom': [0.95, 2.9, 4.55], 'steersman head': [0.85, HERO.deck + 1.7, 4.7], 'mast heel': [1.3, 1.5, 2.2] };
      let worst = Infinity, worstName = '';
      for (const [name, q] of Object.entries(pts)) { const r = film.nearestApproach((t) => heroRec.toWorld(q, t)); if (r.dist < worst) { worst = r.dist; worstName = name + ' at t=' + r.t.toFixed(2); } }
      checks.push({ name: 'camera boat: nearest the film path comes to post, sweep or steersman (m)', value: +worst.toFixed(2), expect: '> 0.8', pass: worst > 0.8, note: worstName });
      // the bow in the frame of shot 5
      const cp = film.pathPoseAt(boatShot.mid), bow = heroRec.toWorld(tip(post.bow), boatShot.mid);
      const cam = new THREE.PerspectiveCamera(cp.fov, 16 / 9, 0.1, 5000); cam.position.set(...cp.pos); cam.lookAt(...cp.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const v = new THREE.Vector3(...bow).project(cam);
      checks.push({ name: 'camera boat: bow post in the frame of shot 5 (ndc x, y)', value: `${v.x.toFixed(2)}, ${v.y.toFixed(2)}`, expect: 'inside, in the lower half', pass: Math.abs(v.x) < 0.95 && v.y < 0 && v.y > -0.95 });
    }
    const mem = heroTris + fleetTris;
    checks.push({ name: 'triangles in memory (hero + models)', value: mem, expect: '< 100000', pass: mem < 100000 });

    log(`rivercraft: ${under} under way, ${moored.length} moored (${moored.filter((b) => b.beached).length} beached), ${lamps} lamps, hero ${heroTris} tris, models ${fleetTris} tris, moorings ${published ? 'riverworks' : 'fallback'}`);
    if (minSep <= 2.5) warn('craft too close: ' + minSepPair + ' ' + minSep.toFixed(1) + ' m');
    if (minPier <= 0.8) warn('craft too close to a pier: ' + minPierBoat + ' ' + minPier.toFixed(2) + ' m');

    return {
      update,
      stats: { underWay: under, moored: moored.length, beached: moored.filter((b) => b.beached).length, lamps, heroTris, modelTris: fleetTris, kinds, moorings: published ? 'riverworks' : 'fallback', models: Object.fromEntries(Object.values(models).map((m) => [m.name, { near: m.nearTris, far: m.farTris, boats: m.boats.length }])), drawn: stats },
      checks,
      api: {
        boats, cameraBoat: heroRec ? heroRec.id : null,
        // extras (docs/mod-rivercraft.md): tow teams for `people`, the eye point, the models' crew places
        tows, eye: heroRec ? { boat: heroRec.id, local: eye.slice(), deck: HERO.deck } : null,
        models: Object.fromEntries(Object.values(models).map((m) => [m.name, m.meta])),
      },
    };

    /** water between two hulls (m): each hull is a capsule, its centre line shortened by the beam, radius half the beam */
    function hullGap(p, a, q, b) {
      const seg = (o, r) => { const f = M.azToDir(o.headingDeg), h = Math.max(0, (r.length - r.beam) / 2); return [o.x - f[0] * h, o.z - f[1] * h, o.x + f[0] * h, o.z + f[1] * h]; };
      const A = seg(p, a), B = seg(q, b);
      const ds = (x, z, s) => M.distToSegment(x, z, s[0], s[1], s[2], s[3])[0];
      const d = Math.min(ds(A[0], A[1], B), ds(A[2], A[3], B), ds(B[0], B[1], A), ds(B[2], B[3], A));
      return d - (a.beam + b.beam) / 2;
    }
    function tintOf(h) { const k = 0.82 + 0.18 * h, c = new THREE.Color(k, k * (0.97 + 0.03 * h), k * (0.93 + 0.07 * h)); return c; }
  },
};

/** A tow line as a thin tube whose vertices are recomputed from the two ends every frame (pure in t). */
function makeRope(ctx, material, color, tow) {
  const { THREE } = ctx, SEG = 20, SIDES = 4, tail = 3, rings = SEG + 1 + tail, r = 0.028;
  const pos = new Float32Array(rings * (SIDES + 1) * 3), nrm = new Float32Array(rings * (SIDES + 1) * 3), col = new Float32Array(rings * (SIDES + 1) * 3), idx = [];
  for (let i = 0; i < rings * (SIDES + 1); i++) { col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2]; }
  for (let i = 0; i < rings - 1; i++) for (let k = 0; k < SIDES; k++) { const a = i * (SIDES + 1) + k, b = a + SIDES + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'rivercraft:towline:' + tow.boat; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  const pts = [];
  const update = (t) => {
    const a = tow.ropeFrom(t), b = tow.ropeTo(t); if (!a || !b) { mesh.visible = false; return; }
    mesh.visible = true;
    const span = Math.hypot(b[0] - a[0], b[2] - a[2]), sag = Math.min(2.6, 0.03 * span + 0.35 + 0.18 * Math.sin(t * 1.3));
    pts.length = 0;
    for (let i = 0; i <= SEG; i++) { const k = i / SEG; pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - sag * 4 * k * (1 - k), a[2] + (b[2] - a[2]) * k]); }
    // along the team, shoulder to shoulder, to the leader
    for (let j = 1; j <= tail; j++) { const h = tow.haulerAt(t, Math.round((tow.haulers - 1) * (1 - j / tail))); pts.push([h.x, h.y + 1.25, h.z]); }
    for (let i = 0; i < rings; i++) {
      const p = pts[i], q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(rings - 1, i + 1)];
      let tx = q1[0] - q0[0], ty = q1[1] - q0[1], tz = q1[2] - q0[2]; const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      // side = t x up, up' = side x t
      let sx = -tz, sz = tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      const ux = -sz * ty, uy = sz * tx - sx * tz, uz = sx * ty;
      for (let k = 0; k <= SIDES; k++) {
        const ang = (k / SIDES) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang), o = (i * (SIDES + 1) + k) * 3;
        const nx = sx * c + ux * s, ny = uy * s, nz = sz * c + uz * s;
        pos[o] = p[0] + nx * r; pos[o + 1] = p[1] + ny * r; pos[o + 2] = p[2] + nz * r; nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  };
  return { mesh, update };
}
