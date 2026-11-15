// registry.js — loads the core subsystems (real file, or its frozen stub) and the world modules, each in
// isolation: a failing subsystem falls back to its stub, a failing module is recorded and skipped, and
// everything is timed and counted into ctx.stats (window.STATS).
// performance.now() is used here ONLY to time builds; it never influences a pixel.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { Rng, GLOBAL_SEED } from './rng.js';
import { HOOK_API } from './hooks.js';

/** Core subsystems in creation order. `real` is the file its owner edits; `stub` is frozen. */
export const SUBSYSTEMS = [
  { name: 'ground', real: './ground.js', stub: './stubs/ground.js', needs: ['height', 'landHeight', 'zone', 'zoneCode', 'isWater', 'waterDepth', 'normal', 'profile', 'shoreDistance', 'landUse', 'waterLevel', 'ZONE', 'ZONE_NAMES', 'coreBounds', 'terrainRadius'] },
  { name: 'materials', real: './materials.js', stub: './stubs/materials.js', needs: ['get', 'variant', 'color', 'hex', 'has', 'ids', 'uniforms', 'textureSet', 'update'] },
  { name: 'glazed', real: './textures/glazed.js', stub: './stubs/glazed.js', needs: ['atlas', 'material', 'materialFor', 'rect', 'quad', 'keys', 'figures', 'bands', 'courses'] },
  { name: 'lighting', real: './lighting.js', stub: './stubs/lighting.js', needs: ['modes', 'modeNames', 'stateAt', 'update', 'renderShadows', 'onNight', 'addFireLight', 'fireLights', 'sun', 'sky', 'shadow', 'uniforms', 'environment', 'state', 'sunAtHourAngle'] },
  { name: 'geom', real: './geom.js', stub: './stubs/geom.js', needs: ['TILE', 'box', 'prism', 'cap', 'wall', 'ribbon', 'tower', 'merlons', 'merlonStrip', 'stairs', 'nichedFacade', 'merge', 'transform', 'paint', 'ensureAttributes', 'addStatic', 'addMerlons', 'instanced', 'finalize', 'discard', 'setAOBaker', 'registerLOD', 'lodDistance', 'tileDistance', 'update', 'statsFor', 'stats', 'tileOf'] },
  { name: 'water', real: './water.js', stub: './stubs/water.js', needs: ['level', 'addSurface', 'addWake', 'heightAt', 'update', 'reflection', 'surfaces', 'wakes'] },
  { name: 'layout', real: './layout.js', stub: './stubs/layout.js', needs: ['streets', 'blocks', 'houses', 'openSpaces', 'villages', 'reserved', 'districts', 'housesNear', 'houseAt', 'housesInBox', 'housesInDistrict', 'houseById', 'isBuilt', 'courtCenter', 'roofPoint', 'lampsFor', 'nearestStreetPoint', 'isFree', 'randomStreetPoint', 'reserve', 'freeze', 'stats'] },
  { name: 'film', real: './shots.js', stub: './stubs/film.js', needs: ['duration', 'fps', 'shots', 'shotAt', 'poseAt', 'pathPoseAt', 'lightAt', 'captionAt', 'updateHud', 'shotMid', 'applyCamera', 'setOverride', 'override', 'depthRange'] },
  { name: 'post', real: './post.js', stub: './stubs/post.js', needs: ['renderFrame', 'addPrePass', 'prePasses', 'reflectionLayers', 'mainLayers', 'setSize', 'jitter', 'timeOffset', 'targets', 'bloom'] },
];

/**
 * Claim keys: the parts of the massing a world module can take over (besides 'monument:<id>' for every id
 * in world.json monuments). ENGINE.md section 4 says which module owns which.
 */
export const CLAIM_KEYS = ['ground', 'water', 'innerWalls', 'outerWall', 'lionStreet', 'streets', 'roads', 'bridge', 'houses'];

const now = () => performance.now();
const errText = (e) => (e && e.stack ? String(e.stack).split('\n').slice(0, 6).join('\n') : String(e));

export async function loadSubsystems(ctx) {
  const stubAll = ctx.flags.stub.includes('all');
  for (const spec of SUBSYSTEMS) {
    const rec = { name: spec.name, impl: null, ms: 0, error: null, missingApi: [] };
    ctx.stats.subsystems[spec.name] = rec;
    const wantStub = stubAll || ctx.flags.stub.includes(spec.name);
    const t0 = now();
    const load = async (path) => {
      const mod = await import(new URL(path, import.meta.url).href);
      if (typeof mod.create !== 'function') throw new Error(`${path} does not export create(ctx)`);
      const inst = await mod.create(ctx);
      if (!inst) throw new Error(`${path}: create(ctx) returned nothing`);
      return inst;
    };
    let inst = null;
    if (!wantStub) {
      try { inst = await load(spec.real); rec.impl = inst.impl === 'stub' ? 'stub (re-exported)' : 'real'; }
      catch (e) {
        rec.error = errText(e);
        ctx.stats.errors.push(`subsystem ${spec.name}: ${rec.error}`);
        console.error(`[engine] subsystem '${spec.name}' failed, falling back to its stub:\n${rec.error}`);
      }
    }
    if (!inst) { inst = await load(spec.stub); rec.impl = wantStub ? 'stub (forced)' : 'stub (FALLBACK after error)'; }
    if (spec.name === 'materials') {
      // The hook chain is the engine's (js/core/hooks.js): whatever the materials implementation carries under
      // these names is replaced, so that there is exactly one compile-hook dispatcher.
      const own = HOOK_API.filter((k) => k in inst && inst[k] !== ctx.hooks[k]);
      if (own.length) console.info(`[engine] materials (${rec.impl}): its own ${own.join(', ')} were replaced by the engine hook chain (ctx.hooks)`);
      try { for (const k of HOOK_API) inst[k] = ctx.hooks[k]; }
      catch { const wrapped = Object.create(inst); for (const k of HOOK_API) Object.defineProperty(wrapped, k, { value: ctx.hooks[k], enumerable: true }); inst = wrapped; }   // a frozen object
    }
    rec.missingApi = spec.needs.filter((k) => !(k in inst));
    if (rec.missingApi.length) {
      const msg = `subsystem ${spec.name} (${rec.impl}) lacks contract members: ${rec.missingApi.join(', ')}`;
      ctx.stats.errors.push(msg); console.error('[engine] ' + msg);
    }
    rec.ms = Math.round(now() - t0);
    ctx[spec.name] = inst;
  }
}

/** Directory listing from the harness server ({files, dirs}) or null when served by a plain static server. */
async function listModulesDir() {
  try {
    const res = await fetch('./__ls?dir=js/modules');
    if (!res.ok) return null;
    const j = await res.json();
    return j && Array.isArray(j.files) ? j : null;
  } catch { return null; }
}

function countObject(root) {
  let tris = 0, draws = 0, instances = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const g = o.geometry; if (!g || !g.attributes.position) return;
    const n = o.isMesh ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
    const k = o.isInstancedMesh ? o.count : 1;
    tris += n * k; draws++; if (o.isInstancedMesh) instances += o.count;
  });
  return { tris, draws, instances };
}

export async function loadModules(ctx, names) {
  const { flags, stats } = ctx;
  const listing = await listModulesDir();
  const loaded = [];
  for (const name of names) {
    const rec = { name, status: 'pending', ms: 0, prepareMs: 0, tris: 0, draws: 0, instances: 0, error: null, stats: null, checks: [], claims: [] };
    stats.modules.push(rec);
    // _massing is governed by the massing flag alone, so that `only=walls` still gives walls + massing context
    if (name === '_massing') { if (flags.massing === 0) { rec.status = 'off'; continue; } }
    else if ((flags.only.length && !flags.only.includes(name) && !flags.with.includes(name)) || flags.skip.includes(name)) { rec.status = 'skipped'; continue; }
    let path = null;
    if (listing) {
      if (listing.files.includes(name + '.js')) path = `../modules/${name}.js`;
      else if (listing.dirs.includes(name)) path = `../modules/${name}/index.js`;
      if (!path) {
        rec.status = 'missing'; console.info(`[engine] module '${name}': missing (not built yet)`);
        if (flags.with.includes(name) || flags.only.includes(name)) { const msg = `module '${name}' was asked for (with / only) but js/modules/${name}.js does not exist`; stats.warnings.push(msg); console.warn('[engine] ' + msg); }
        continue;
      }
    }
    let mod = null;
    try {
      if (path) mod = await import(new URL(path, import.meta.url).href);
      else {
        try { mod = await import(new URL(`../modules/${name}.js`, import.meta.url).href); }
        catch (e1) {
          try { mod = await import(new URL(`../modules/${name}/index.js`, import.meta.url).href); }
          catch (e2) {
            // without a listing a 404 and a syntax error look alike: report both honestly
            if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(String(e1))) { rec.status = 'missing'; console.info(`[engine] module '${name}': missing (not built yet)`); continue; }
            throw e1;
          }
        }
      }
      const def = mod.default;
      if (!def || typeof def.build !== 'function') throw new Error(`module '${name}' has no default export { name, build(ctx) }`);
      if (def.name && def.name !== name) console.warn(`[engine] module file '${name}' exports name '${def.name}'`);
      const group = new THREE.Group(); group.name = 'module:' + name; ctx.scene.add(group);
      const mctx = Object.create(ctx);
      mctx.module = {
        name, group, rng: new Rng(`${GLOBAL_SEED}:module:${name}`),
        log: (...a) => console.info(`[${name}]`, ...a), warn: (...a) => console.warn(`[${name}]`, ...a),
      };
      loaded.push({ name, def, rec, mctx, group, result: null });
    } catch (e) {
      rec.status = 'error'; rec.error = errText(e);
      stats.errors.push(`module ${name} (load): ${rec.error}`);
      console.error(`[engine] module '${name}' failed to load:\n${rec.error}`);
    }
  }

  // phase 1: prepare (reservations and other declarations that must precede every build)
  for (const m of loaded) {
    if (typeof m.def.prepare !== 'function') continue;
    const t0 = now();
    try { ctx.geom.owner = m.name; await m.def.prepare(m.mctx); }
    catch (e) {
      m.rec.status = 'error'; m.rec.error = errText(e);
      stats.errors.push(`module ${m.name} (prepare): ${m.rec.error}`);
      console.error(`[engine] module '${m.name}' failed in prepare():\n${m.rec.error}`);
      ctx.geom.discard(m.name); ctx.scene.remove(m.group);
    }
    m.rec.prepareMs = Math.round(now() - t0);
  }
  ctx.geom.owner = null;
  ctx.layout.freeze();

  // phase 2: build, in list order
  for (const m of loaded) {
    if (m.rec.status === 'error') continue;
    const t0 = now();
    try {
      ctx.geom.owner = m.name;
      m.result = (await m.def.build(m.mctx)) || {};
      m.rec.status = 'ok';
      m.rec.claims = [...(m.def.claims || []), ...(m.result.claims || [])];
      for (const c of m.rec.claims) {
        ctx.claims.add(c);
        const known = CLAIM_KEYS.includes(c) || (c.startsWith('monument:') && ctx.world.monuments.some((q) => q.id === c.slice(9)));
        if (!known) { const msg = `module ${m.name} claims '${c}', which is not a claim key (typo? see ENGINE.md section 4)`; stats.warnings.push(msg); console.warn('[engine] ' + msg); }
      }
      m.rec.stats = m.result.stats || null;
      m.rec.checks = m.result.checks || [];
      if (m.result.api) ctx.modules[m.name] = m.result.api;
      ctx.builtModules.add(m.name);
      // contract checks that are cheap to make here
      let lights = 0; m.group.traverse((o) => { if (o.isLight) lights++; });
      if (lights) { const msg = `module ${m.name} added ${lights} THREE light(s) to the scene: use ctx.lighting.addFireLight() (lights change every shader program)`; stats.warnings.push(msg); console.warn('[engine] ' + msg); }
    } catch (e) {
      m.rec.status = 'error'; m.rec.error = errText(e);
      stats.errors.push(`module ${m.name} (build): ${m.rec.error}`);
      console.error(`[engine] module '${m.name}' failed in build():\n${m.rec.error}`);
      ctx.geom.discard(m.name); ctx.scene.remove(m.group);   // half a module never shows
    }
    ctx.geom.owner = null;
    m.rec.ms = Math.round(now() - t0);
    const own = countObject(m.group), g = ctx.geom.statsFor(m.name);
    m.rec.tris = Math.round(own.tris + g.tris + g.instancedTris);
    m.rec.draws = own.draws + g.draws;
    m.rec.instances = own.instances + g.instances;
  }

  const updaters = loaded.filter((m) => m.rec.status === 'ok' && typeof m.result.update === 'function');
  /** Per-frame update of every module (isolated: a module that throws is disabled and reported once). */
  return function updateModules(frame) {
    for (const m of updaters) {
      if (m.dead) continue;
      try { ctx.geom.owner = m.name; m.result.update(frame); }
      catch (e) {
        m.dead = true; m.rec.status = 'error'; m.rec.error = 'update(): ' + errText(e);
        stats.errors.push(`module ${m.name} (update): ${errText(e)}`);
        console.error(`[engine] module '${m.name}' failed in update() and was disabled:\n${errText(e)}`);
      }
    }
    ctx.geom.owner = null;
  };
}
