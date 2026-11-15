// main.js — boot. Loads world.json, builds the context, the core subsystems (fixed order) and the world
// modules (order of js/modules/index.js), then exposes window.renderAt / READY / STATS for the harness.
// OWNER: engine architect. See ENGINE.md for the contract.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { loadWorld, makeWorldHelpers, WIND } from './core/world.js';
import { createHookChain } from './core/hooks.js';
import { makeRngFactory, GLOBAL_SEED } from './core/rng.js';
import * as mathx from './core/mathx.js';
import { loadSubsystems, loadModules } from './core/registry.js';
import { collectStats, frameHash, planPose, parseCam, installDebug } from './core/debug.js';
import { createOctree } from './core/octree.js';
import { createPlayer } from './core/player.js';
import MODULES, { OPT_IN } from './modules/index.js';

/** Render layers (THREE.Layers indices). An object is drawn by a camera when they share a layer. */
export const LAYERS = Object.freeze({
  MAIN: 0,     // default: everything solid
  REFLECT: 1,  // ALSO drawn in the water reflection pass (opt in: object.layers.enable(LAYERS.REFLECT))
  WATER: 2,    // water surfaces (never in the reflection pass)
  SKY: 3,      // sky dome (main and reflection pass)
  FX: 4,       // additive / transparent effects: flames, smoke, sprites
  DEBUG: 5,    // helpers; drawn only when frame.debug is set (plan stills, ?debug=1)
});

/** `with=` names that are debug scenes built by a subsystem itself (glazed, materials, geom), not world modules. */
export const SUBSYSTEM_SCENES = Object.freeze(['glazedtest', 'glazedfilm', '_swatches', 'geom-showcase', 'geom-stress', 'geom-all']);

/** Quality tiers. Modules thin heavy content with ctx.quality.density (fraction 0..1 of the final count). */
export const QUALITY = Object.freeze({
  draft: Object.freeze({ tier: 'draft', draft: true, density: 0.15, shadowMapSize: 2048, textureSize: 512, sub: 1 }),
  final: Object.freeze({ tier: 'final', draft: false, density: 1.0, shadowMapSize: 4096, textureSize: 2048, sub: 8 }),
});

function parseFlags() {
  const q = new URLSearchParams(location.search);
  const list = (k) => (q.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const num = (k, d) => (q.has(k) && q.get(k) !== '' && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const tier = q.get('q') === 'final' ? 'final' : 'draft';
  return {
    only: list('only'), skip: list('skip'), stub: list('stub'), with: list('with'),
    q: tier, massing: num('massing', 1), sub: num('sub', 1), hud: num('hud', 1), debug: num('debug', 0),
    play: num('play', 0), orbit: num('orbit', 0), t: num('t', 0),
    ...(window.BABYLON_FLAGS || {}),   // web build: the page's own flags win (artifact URLs carry no query string)
  };
}

/**
 * Draw calls per pass of the last rendered frame, for one sub-frame (the budget is 500 per pass, ENGINE.md 10):
 * { main (opaque + sky + water + effects), shadow: [calls per shadow map], reflection, prePasses: { name: calls }, post, worst }.
 * Exact with the real post subsystem (post.last.passes); with the stub only the total is known.
 */
function passCalls(ctx) {
  const p = ctx.post.last && ctx.post.last.passes;
  if (!p) return null;
  const pre = {}; let reflection = 0;
  for (const [k, v] of Object.entries(p)) if (k.startsWith('pre:')) { pre[k.slice(4)] = v.calls; if (/reflection/.test(k)) reflection += v.calls; }
  const main = (p.main ? p.main.calls : 0) + (p.overlay ? Math.max(0, p.overlay.calls - 1) : 0);      // the overlay pass also draws post's AO quad
  const shadow = (p.shadows && p.shadows.cascades) || [];
  return { main, mainTriangles: (p.main ? p.main.triangles : 0) + (p.overlay ? p.overlay.triangles : 0), shadow, shadowTriangles: p.shadows ? p.shadows.triangles : 0, reflection, prePasses: pre, post: p.ao ? p.ao.calls : 0, worst: Math.max(main, reflection, ...shadow, 0) };
}

async function boot() {
  const t0 = performance.now();
  const flags = parseFlags();
  const canvas = document.getElementById('c');
  const size = { width: window.innerWidth, height: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, flags.maxDpr || Infinity) };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.3, 40000);

  const stats = {
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', three: THREE.REVISION,
    flags, quality: flags.q, seed: GLOBAL_SEED, size,
    subsystems: {}, modules: [], totals: null, layout: null, errors: [], warnings: [], bootMs: 0, ready: false,
  };
  window.STATS = stats;

  const world = await loadWorld('./world.json');
  const ctx = {
    THREE, world, W: makeWorldHelpers(world), mathx,
    scene, camera, renderer, canvas, size, flags,
    quality: QUALITY[flags.q], LAYERS,
    /** ctx.rng(name) -> a fresh seeded generator for the named stream (same sequence every time). */
    rng: makeRngFactory(GLOBAL_SEED),
    /** The one wind of the film: { toAzDeg, dir: [dx, dz], speed (m/s), gust(t, x, z) } (js/core/world.js WIND). */
    wind: WIND,
    /** THE material hook chain (js/core/hooks.js). ctx.materials.register / addHook / ... are these same functions. */
    hooks: createHookChain({ report: (m) => { stats.warnings.push('hooks: ' + m); console.warn('[hooks] ' + m); } }),
    // subsystems, filled by loadSubsystems(): ground, materials, glazed, lighting, geom, water, layout, film, post
    ground: null, materials: null, glazed: null, lighting: null, geom: null, water: null, layout: null, film: null, post: null,
    /** APIs published by built world modules (build() result .api), by module name. Optional: always test for presence. */
    modules: {},
    /**
     * Fire and smoke sources declared by ANY module, drawn by ONE module (nightfx, which is built last):
     * ctx.emitters.add({ kind, pos: [x, y, z] | at: (t) => [x, y, z] | null, size?: 1, night?: boolean, data? }) -> { id, remove() }
     * kind: 'lamp' 'torch' 'brazier' 'fireBowl' 'hearth' (lit at night) | 'smoke' 'kilnSmoke' 'dust' (also by day).
     * ctx.emitters.list is the live array of { id, kind, pos, at, size, night, owner, data }.
     */
    emitters: (() => {
      const list = [], NIGHT = new Set(['lamp', 'torch', 'brazier', 'fireBowl', 'hearth']), KINDS = new Set([...NIGHT, 'smoke', 'kilnSmoke', 'dust']);
      let id = 0;
      return {
        list, kinds: [...KINDS],
        add(spec) {
          if (!spec || !KINDS.has(spec.kind)) throw new Error(`ctx.emitters.add: unknown kind '${spec && spec.kind}' (${[...KINDS].join(' ')})`);
          if (!Array.isArray(spec.pos) && typeof spec.at !== 'function') throw new Error('ctx.emitters.add: give pos: [x, y, z] or at: (t) => [x, y, z] | null');
          const e = { id: ++id, kind: spec.kind, pos: spec.pos || null, at: spec.at || null, size: spec.size ?? 1, night: spec.night ?? NIGHT.has(spec.kind), owner: ctx.geom && ctx.geom.owner ? ctx.geom.owner : spec.owner || 'unknown', data: spec.data ?? null,
            remove() { const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); } };
          list.push(e);
          return e;
        },
      };
    })(),
    /** Claims of built modules ('ground', 'water', 'monument:<id>', ...): what _massing must not draw. */
    claims: new Set(), builtModules: new Set(),
    built: (name) => ctx.builtModules.has(name),
    stats,
    /** Per-frame state, rewritten by ctx.update() for every sub-frame. */
    frame: {
      t: 0, animTime: 0, tFrame: 0, sub: 0, subCount: 1, shot: null, shotIndex: 0, shotT: 0, shotK: 0, inTransition: false,
      camera: { pos: [0, 100, 300], look: [0, 0, 0], up: [0, 1, 0], fov: 50, near: 0.3, far: 40000 },
      lightSpec: { a: 'golden', b: 'golden', k: 0 }, light: null,
      fog: null, lod: { fixed: null, scale: 1 }, shadow: { radius: null }, debug: false,
    },
    animTime: 0,
    update: null,
  };
  window.CTX = ctx;

  await loadSubsystems(ctx);

  /**
   * Bring the whole world to film time t (pure function of t and of the debug override). Called by
   * post.renderFrame() once per sub-frame. Order: film (shot, camera, light spec) -> lighting -> materials ->
   * modules' update(frame) in list order -> water -> geom (LOD). So when a module's update(frame) runs,
   * frame.t / shot / camera / light are already those of THIS sub-frame.
   */
  let updateModules = () => {};
  ctx.update = function update(t, o = {}) {
    const f = ctx.frame, film = ctx.film, ov = film.override;
    f.t = t; f.animTime = (flags.web && ctx.animTime > 0) ? ctx.animTime : t; f.tFrame = o.tFrame ?? t; f.sub = o.sub ?? 0; f.subCount = o.subCount ?? 1;
    const sa = film.shotAt(t);
    f.shot = sa.shot; f.shotIndex = sa.index; f.shotT = sa.local; f.shotK = sa.k; f.inTransition = sa.inTransition;
    f.camera = film.poseAt(t);
    film.applyCamera(camera, f.camera);
    f.lightSpec = film.lightAt(t);
    f.fog = ov && ov.fog !== undefined ? ov.fog : null;
    f.lod = { fixed: ov && ov.lod && ov.lod.fixed !== undefined ? ov.lod.fixed : null, scale: (ov && ov.lod && ov.lod.scale) || (ctx.octree ? ctx.octree.lodScale : 1) };
    f.shadow = { radius: (ov && ov.shadowRadius) || null };
    f.debug = !!(flags.debug || (ov && ov.debug));
    ctx.lighting.update(f);
    ctx.materials.update(f);
    updateModules(f);
    ctx.water.update(f);
    if (ctx.octree) ctx.octree.restore();
    ctx.geom.update(f);
    if (ctx.octree) ctx.octree.cull(camera, f);
    for (const fn of frameTaps) fn(f);
    return f;
  };
  /** Engine tap for tests and debug overlays (NOT for scene content): fn(frame) after every ctx.update(). Returns an unsubscribe function. */
  const frameTaps = new Set();
  ctx.onFrame = (fn) => { frameTaps.add(fn); return () => frameTaps.delete(fn); };
  // Prime the per-frame state for film time 0 BEFORE any module builds, so that build() code may read
  // ctx.frame.camera / ctx.frame.light / ctx.lighting.state (no module update runs yet).
  ctx.update(0);

  // world modules: the list, minus opt-in ones that were not asked for, plus any extra name given with
  // ?with= (a scratch module that is not in js/modules/index.js is built just before _massing)
  // names in ?with= that switch on a debug scene INSIDE a subsystem are not world modules (docs/<subsystem>.md)
  const extra = flags.with.filter((n) => !MODULES.includes(n) && !SUBSYSTEM_SCENES.includes(n));
  const listed = MODULES.filter((n) => !OPT_IN.includes(n) || flags.with.includes(n) || flags.only.includes(n));
  const mi = listed.indexOf('_massing');
  const names = mi < 0 ? [...listed, ...extra] : [...listed.slice(0, mi), ...extra, ...listed.slice(mi)];
  for (const n of MODULES) if (!names.includes(n)) stats.modules.push({ name: n, status: 'opt-in', ms: 0, tris: 0, draws: 0, instances: 0, error: null });
  // a mistyped flag must not pass silently
  const subsystemNames = Object.keys(stats.subsystems);
  const flagWarn = (msg) => { stats.warnings.push(msg); console.warn('[engine] ' + msg); };
  for (const n of [...flags.only, ...flags.skip]) if (!names.includes(n) && !MODULES.includes(n)) flagWarn(`flag only/skip names '${n}', which is not a module in js/modules/index.js (scratch modules need with=${n})`);
  for (const n of flags.stub) if (n !== 'all' && !subsystemNames.includes(n)) flagWarn(`flag stub names '${n}', which is not a subsystem (${subsystemNames.join(' ')})`);
  // In web/game mode, only build core spawn modules immediately and stream the rest during play
  const CORE_MODULES = new Set(['terrain', 'waterbodies', 'walls', 'ishtar', 'streets']);
  const useStreaming = Boolean(flags.web && !flags.only.length && !flags.with.length);
  const defer = useStreaming ? new Set(names.filter((n) => !CORE_MODULES.has(n))) : null;
  const bootProfile = {
    streaming: useStreaming,
    coreBuildMs: 0,
    finalizeMs: 0,
    octreeMs: 0,
    warmupMs: 0,
    streamedModules: {},
  };
  stats.bootProfile = bootProfile;

  const tMod0 = performance.now();
  updateModules = await loadModules(ctx, names, { defer });
  bootProfile.coreBuildMs = Math.round(performance.now() - tMod0);

  const tFin0 = performance.now();
  ctx.geom.finalize();
  bootProfile.finalizeMs = Math.round(performance.now() - tFin0);

  const tOct0 = performance.now();
  ctx.octree = createOctree(ctx);
  bootProfile.octreeMs = Math.round(performance.now() - tOct0);

  ctx.player = createPlayer(ctx);
  ctx.player.setActive(false);
  const reportAdopted = (adopted, when) => {
    if (!adopted.length) return;
    const msg = `${adopted.length} material(s) were not registered with ctx.materials.register() and were adopted ${when}: ${[...new Set(adopted)].slice(0, 12).join(', ')}`;
    stats.warnings.push(msg); console.warn('[engine] ' + msg);
  };
  reportAdopted(ctx.materials.adopt(scene), 'at the end of boot');

  ctx.streamRemainingCount = () => updateModules.streamRemaining ? updateModules.streamRemaining() : 0;
  ctx.streamQueueNames = () => updateModules.streamQueueNames ? updateModules.streamQueueNames() : [];
  ctx.streamNext = async () => {
    if (!updateModules.streamNext) return null;
    const ts = performance.now();
    const res = await updateModules.streamNext();
    if (!res) return null;
    // Yield a frame between build() and GPU finalize/octree sync so gameplay stays responsive
    await new Promise((r) => requestAnimationFrame(r));
    const tf = performance.now();
    ctx.geom.finalize();
    ctx.materials.adopt(scene);
    if (ctx.octree) ctx.octree.syncNewMeshes();
    const finalizeMs = Math.round(performance.now() - tf);
    const totalMs = Math.round(performance.now() - ts);
    bootProfile.streamedModules[res.name] = { buildMs: res.ms, finalizeMs, totalMs };
    return { ...res, finalizeMs, totalMs };
  };

  // ---- page API used by render.mjs ---------------------------------------------------------------
  /** Render film time t (seconds) to the canvas. opts: { sub: sub-frames, tag: debug label }. Pure in t. */
  window.renderAt = (t, opts = {}) => {
    const r = ctx.post.renderFrame(t, { sub: opts.sub ?? flags.sub });
    ctx.film.updateHud(t, opts.tag || null);
    const f = r.frame;
    return { t, sub: r.sub, shot: f.shot ? f.shot.id : null, light: f.lightSpec, night: f.light ? f.light.night : 0, camera: f.camera };
  };
  /** Debug camera: pose object, "x,y,z;lx,ly,lz;fov" string, or null to return to the film path. */
  window.setCamera = (pose, extra = {}) => { ctx.film.setOverride(pose ? { ...(typeof pose === 'string' ? parseCam(pose) : pose), ...extra } : null); return ctx.film.override; };
  window.planPose = (which) => planPose(ctx, which);
  window.frameHash = () => frameHash(ctx);
  window.refreshStats = () => {
    reportAdopted(ctx.materials.adopt(scene), 'after boot (created in update()?)');
    stats.totals = collectStats(ctx); stats.layout = ctx.layout.stats();
    stats.hooks = ctx.hooks.hooks(); stats.hookProblems = ctx.hooks.problems();
    stats.passes = 1 + (ctx.lighting.shadow.cascades || 1) + (ctx.water.reflection.enabled ? 1 : 0); // main + shadow cascades + reflection
    stats.lastFrameSubFrames = ctx.frame.subCount;
    stats.drawCalls = passCalls(ctx);                 // per pass, of the last rendered frame (budget: 500 each)
    return stats;
  };
  window.FILM = { duration: ctx.film.duration, fps: ctx.film.fps, shots: ctx.film.shots.map((s) => ({ n: s.n, id: s.id, name: s.name, mode: s.mode, t0: s.t0, t1: s.t1, mid: s.mid })) };
  installDebug(ctx);

  const tWarm0 = performance.now();
  if (!flags.web) window.renderAt(flags.t || 0); // warm-up: compiles the programs in view
  bootProfile.warmupMs = Math.round(performance.now() - tWarm0);
  window.refreshStats();
  stats.bootMs = Math.round(performance.now() - t0);
  console.info('[engine] boot profile:', JSON.stringify(bootProfile), 'total bootMs:', stats.bootMs);
  stats.ready = true;
  window.READY = true;
}

boot().catch((e) => {
  const msg = e && e.stack ? e.stack : String(e);
  window.BOOT_ERROR = msg;
  if (window.STATS) window.STATS.errors.push('boot: ' + msg);
  const el = document.getElementById('boot'); if (el) el.textContent = 'BOOT ERROR\n' + msg;
  console.error('[engine] boot failed:\n' + msg);
});
