// js/modules/people/system.js — the figure system: one loop over every figure per sub-frame.
// For each figure: where it is at film time t (a closed form), which level of detail the camera needs, a pose
// (its own bone row near the camera, a canned row far away), one instance in the right set.
import { createRig, makePose, fk, NB } from './rig.js';
import { buildHuman, SKEL, B, PART, bit, poseWalk, poseStand, poseSit, poseSitEdge, poseSquat, poseTow, posePole, poseArms, strideOf } from './human.js';
import { buildQuadrupeds, buildBird, SPECIES, QSKEL, BSKEL, QPART, qbit, BPART, bbit, quadStride, poseQuadWalk, poseQuadStand, poseBirdFly, poseBirdStand } from './animals.js';

const TAU = Math.PI * 2;

export function createSystem(ctx) {
  const { materials, quality } = ctx;
  const rig = createRig(ctx, { rows: 1536 });
  const C = (id, k = 1) => { const c = materials.color(id); return [c.r * k, c.g * k, c.b * k]; };
  const tones = {
    wood: C('palmWood'), pottery: C('bakedBrickRed', 1.05), potteryPale: C('bakedBrickBuff'), bronze: C('bronze'), reed: C('reedMat'), gold: C('gold'),
    leather: C('woolBrown', 0.8), sack: C('woolDark', 1.2), dates: C('woolBrown', 0.7), hide: C('woolCream', 0.95),
  };
  const palette = {
    wool: [C('woolCream'), C('woolOatmeal'), C('woolBrown'), C('woolDark'), C('linenWhite')],
    dyes: [C('dyeMadderRed'), C('dyeIndigo'), C('dyeSaffron'), C('dyePurple')],
    linen: C('linenWhite'), cream: C('woolCream'), oat: C('woolOatmeal'), brown: C('woolBrown'), dark: C('woolDark'),
    red: C('dyeMadderRed'), blue: C('dyeIndigo'), saffron: C('dyeSaffron'), purple: C('dyePurple'),
    skin: C('skin'), skinDark: C('skinDark'), leather: tones.leather, bronze: tones.bronze,
  };

  // ---- humans ------------------------------------------------------------------------------------------------
  const cloth = rig.material('woolCream', 'people-figure', { roughness: 0.92, relief: 0.7, detail: 0.8 });
  const cap = quality.draft ? [180, 420, 900, 1600] : [220, 760, 1500, 3600];
  const hGeo = [0, 1, 2, 3].map((l) => buildHuman(l, tones));
  const human = {
    name: 'human', skel: SKEL,
    sets: hGeo.map((b, l) => rig.set({ name: 'human-lod' + l, geometry: b.toGeometry(ctx.THREE), material: cloth, capacity: cap[l], castShadow: l < 3, shadowTexel: l === 2 ? 0.2 : 0.3 })),
    dist: [30, 115, 300, 850], poseDist: 100, tris: hGeo.map((b) => b.tris),
    pose(f, t, S, P) {
      switch (f.base) {
        case 'walk': if (S.moving === false) poseStand(P, t, f.seed); else poseWalk(P, TAU * (S.s / f.stride + f.seed), f.amp, f.lean, f.lift); break;
        case 'sit': poseSit(P, t, f.seed); break;
        case 'sitEdge': poseSitEdge(P, t, f.seed, f.seat); break;
        case 'squat': poseSquat(P, t, f.seed); break;
        case 'tow': poseTow(P, TAU * (S.s / f.stride + f.seed)); break;
        case 'pole': posePole(P, t, f.seed); break;
        default: poseStand(P, t, f.seed);
      }
      if (f.arms) poseArms(P, f.arms, t, f.seed);
      if (f.headScale) P.sc[B.HEAD] = f.headScale;
      if (f.tweak) f.tweak(P, t, S, f);
    },
    cycle: (f) => f.base === 'walk' || f.base === 'tow',
  };

  // ---- quadrupeds: every species in one mesh, two levels of detail ----------------------------------------------
  const fur = rig.material('donkey', 'people-animal', { roughness: 0.95 });
  const aTones = { sack: tones.sack, pottery: tones.pottery, reed: tones.reed, rope: C('reedMat', 0.7), horn: C('linenWhite', 0.8) };
  const qGeo = [0, 1].map((l) => buildQuadrupeds(l, aTones));
  const qSets = qGeo.map((b, l) => rig.set({ name: 'quad-lod' + l, geometry: b.toGeometry(ctx.THREE), material: fur, capacity: quality.draft ? [80, 260][l] : [120, 520][l], castShadow: true, shadowTexel: 0.3 }));
  const quad = {
    name: 'quad', sets: [qSets[0], qSets[1]], dist: [36, 520], poseDist: 100, tris: qGeo.map((b) => b.tris),
    skelOf: (f) => QSKEL[f.species],
    pose(f, t, S, P) {
      const sp = SPECIES[f.species];
      if (f.base === 'walk' && S.moving !== false) poseQuadWalk(P, TAU * (S.s / f.stride + f.seed), sp, t, f.seed);
      else poseQuadStand(P, t, f.seed, sp || { name: 'cat' }, f.base === 'graze' ? 1 : 0);
      if (f.tweak) f.tweak(P, t, S, f);
    },
    cycle: (f) => f.base === 'walk',
  };
  // ---- birds ---------------------------------------------------------------------------------------------------
  const bGeo = buildBird();
  const bSet = rig.set({ name: 'birds', geometry: bGeo.toGeometry(ctx.THREE), material: fur, capacity: 96, castShadow: true, shadowTexel: 0.3 });
  const bird = {
    name: 'bird', sets: [bSet], dist: [900], poseDist: 900, tris: [bGeo.tris], skelOf: () => BSKEL,
    pose(f, t, S, P) {
      if (f.base === 'fly') {
        const ph = t * f.flapHz * TAU + f.seed * TAU, gl = f.glide ? Math.max(0, Math.sin(t * f.glide + f.seed * 9)) : 0;
        poseBirdFly(P, (f.flapAmp * Math.sin(ph)) * (1 - gl) + 0.12 + 0.1 * gl, S.bank || 0, f.tuck || 0);
      } else poseBirdStand(P, t, f.seed);
    },
    cycle: () => false,
  };

  const kinds = { human, quad, bird };
  const figures = [];
  const dynamicFigures = [];
  const staticCells = new Map();
  const CELL_SIZE = 64;
  const CELL_RADIUS = 46; // sqrt(32^2 + 32^2) ~ 45.3
  let gridDirty = true;
  const cannedCache = new Map();
  const P = makePose(), bones = new Float32Array(NB * 12);
  const S = { x: 0, y: 0, z: 0, az: 0, s: 0, moving: true, pitch: 0, hide: false, bank: 0 };
  const WHITE = [1, 1, 1];

  /** Canned rows of a figure: eight phases of a cycle, or one frozen pose. */
  function cannedFor(f) {
    const kind = kinds[f.kind], cyc = kind.cycle(f);
    const key = [f.kind, f.base, f.arms || '', f.amp || 0, f.seat || 0, f.headScale ? 1 : 0, f.species || '', f.cannedKey || '', f.flapHz || 0, cyc ? '' : Math.floor((f.seed || 0) * 2)].join('|');
    let rows = cannedCache.get(key);
    if (rows) return rows;
    rows = [];
    const n = cyc ? 6 : 1, st = { x: 0, y: 0, z: 0, az: 0, s: 0, moving: true, pitch: 0 }, seed = f.seed;
    for (let i = 0; i < n; i++) {
      st.s = cyc ? (i + 0.5) / n * f.stride : 0;
      const g = cyc ? { ...f, seed: 0, tweak: null } : { ...f, tweak: null };
      kind.pose(g, 1.7 + (seed || 0) * 5, st, P);
      rows.push(rig.canned(fk(kind.skelOf ? kind.skelOf(f) : kind.skel, P, bones)));
    }
    cannedCache.set(key, rows);
    return rows;
  }

  /** Add a figure record. Fields are documented in docs/mod-people.md. */
  function add(f) {
    f.kind = f.kind || 'human';
    if (f.t0 === undefined) f.t0 = -Infinity; if (f.t1 === undefined) f.t1 = Infinity;
    if (f.scale === undefined) f.scale = 1;
    if (f.seed === undefined) f.seed = 0;
    if (f.kind === 'human') {
      if (f.amp === undefined) f.amp = 0.42; if (f.lean === undefined) f.lean = 0.04; if (f.lift === undefined) f.lift = 1;
      f.stride = f.strideOverride || strideOf(f.amp, f.scale);
    } else if (f.kind === 'quad') {
      f.stride = f.species === 'cat' ? 1 : quadStride(SPECIES[f.species], f.scale);
      if (!f.B) f.B = f.A;
    } else f.stride = 1;
    if (!f.B) f.B = WHITE; if (!f.C) f.C = WHITE; if (!f.D) f.D = WHITE; if (!f.hair) f.hair = 0;
    f.cr = cannedFor(f);
    figures.push(f);
    if (f.move) dynamicFigures.push(f);
    else gridDirty = true;
    return f;
  }

  function rebuildStaticGrid() {
    staticCells.clear();
    for (let i = 0; i < figures.length; i++) {
      const f = figures[i];
      if (f.move) continue;
      const gx = Math.floor(f.x / CELL_SIZE);
      const gz = Math.floor(f.z / CELL_SIZE);
      const key = gx * 65536 + gz;
      let cell = staticCells.get(key);
      if (!cell) {
        cell = { cx: (gx + 0.5) * CELL_SIZE, cz: (gz + 0.5) * CELL_SIZE, list: [] };
        staticCells.set(key, cell);
      }
      cell.list.push(f);
    }
    gridDirty = false;
  }

  const stats = { near: 0, mid: 0, far: 0, posed: 0, shown: 0 };
  function update(frame) {
    if (gridDirty) rebuildStaticGrid();
    const t = frame.animTime ?? frame.t;
    const cam = frame.camera.pos, look = frame.camera.look;
    const cx = cam[0], cy = cam[1], cz = cam[2];
    let fx = look[0] - cx, fy = look[1] - cy, fz = look[2] - cz;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const fovDeg = frame.camera.fov || 50;
    const aspect = Math.max(1.8, (ctx.size.width || 1280) / (ctx.size.height || 720));
    const coneRad = Math.atan(Math.tan(fovDeg * Math.PI / 360) * aspect) + 0.28;
    const minCos = Math.cos(Math.min(Math.PI * 0.49, coneRad));

    // a level of detail changes over the sub-frames of a frame, not in one step
    const jit = frame.subCount > 1 ? 1 + 0.08 * ((frame.sub + 0.5) / frame.subCount - 0.5) : 1;
    rig.begin();
    const dark = frame.light && frame.light.night > 0.97 ? 0.35 : 1;             // at night nothing far from a lamp can be seen
    const maxAnyDist = 900 * dark;
    let near = 0, mid = 0, far = 0, posed = 0;

    function processFigure(f) {
      if (t < f.t0 || t >= f.t1) return;
      S.pitch = 0; S.moving = true; S.s = 0; S.hide = false; S.bank = 0;
      if (f.move) { f.move(t, S, f); if (S.hide) return; } else { S.x = f.x; S.y = f.y; S.z = f.z; S.az = f.az; }
      const dx = S.x - cx, dy = S.y - cy, dz = S.z - cz;
      const dRaw = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // Frustum cone cull for visible assets only (keep <=18m for nearby shadow casters)
      if (dRaw > 18 && (dx * fx + dy * fy + dz * fz) < dRaw * minCos) return;
      const d = dRaw * jit * (f.lodScale || 1);
      const kind = kinds[f.kind], dist = kind.dist;
      const nl = dist.length;
      if (d > dist[nl - 1] * dark) return;
      let lod = 0; while (d >= dist[lod]) lod++;
      let row = -1;
      if (d < kind.poseDist) {
        row = rig.alloc();
        if (row >= 0) { kind.pose(f, t, S, P); rig.write(row, fk(kind.skelOf ? kind.skelOf(f) : kind.skel, P, bones)); posed++; }
      }
      if (row < 0) {
        const cr = f.cr;
        row = cr.length === 1 ? cr[0] : cr[Math.floor((((S.s / f.stride + f.seed) % 1) + 1) % 1 * cr.length) % cr.length];
      }
      kind.sets[lod].push(S.x, S.y, S.z, S.az, f.scale, row, f.mask, f.A, f.B, f.C, f.D, f.E || f.B, f.hair, S.pitch);
      if (lod === 0) near++; else if (lod === nl - 1 && nl > 1) far++; else mid++;
    }

    // 1. Dynamic figures (walkers, birds, animals)
    for (let i = 0, n = dynamicFigures.length; i < n; i++) {
      processFigure(dynamicFigures[i]);
    }
    // 2. Static figures grouped by 64m spatial cells (skip entire off-screen / out-of-range cells)
    for (const cell of staticCells.values()) {
      const cdx = cell.cx - cx, cdy = -cy, cdz = cell.cz - cz;
      const cd = Math.hypot(cdx, cdy, cdz);
      if (cd > maxAnyDist + CELL_RADIUS) continue;
      if (cd > CELL_RADIUS + 18 && (cdx * fx + cdy * fy + cdz * fz) < cd * minCos - CELL_RADIUS) continue;
      const list = cell.list;
      for (let i = 0, n = list.length; i < n; i++) {
        processFigure(list[i]);
      }
    }

    rig.commit();
    stats.near = near; stats.mid = mid; stats.far = far; stats.posed = posed; stats.shown = near + mid + far;
  }

  return { rig, kinds, figures, add, update, palette, tones, stats, C, cloth, cannedFor, PART, B, bit, SPECIES, QPART, qbit, BPART, bbit };
}

export { B, PART, bit };
