// hooks.js — THE material hook chain: one compile-hook dispatcher for the whole engine (ENGINE.md section 6).
// OWNER: engine architect / integrator. It is NOT part of the "materials" subsystem, so that replacing
// js/core/materials.js can never break shadows, aerial perspective or anybody else's shader patch.
//
// The engine creates one chain at boot (ctx.hooks) and installs its functions on ctx.materials, so
//   ctx.materials.register / adopt / addHook / removeHook / hooks / all / isRegistered / info / isBuiltIn / isLit
// are always THESE functions, whichever materials implementation is loaded.
//
// What it guarantees:
//   - every registered material has ONE onBeforeCompile (the dispatcher) and ONE customProgramCacheKey;
//     both are accessor properties, so code that later does `material.onBeforeCompile = fn` does not knock
//     the chain out: fn becomes the material's own first patch and the chain still runs after it;
//   - hooks are named, ordered (order, then name) and versioned; the program cache key contains the list of
//     hooks that apply to the material with their revision, so adding, replacing or removing a hook at ANY
//     time recompiles exactly the affected programs, for materials created before or after;
//   - a hook that throws is reported once and skipped; a patch whose anchor is missing is reported once;
//   - the hook 'world' (order 0, engine-owned) gives every built-in material `vBWorldPos` / `vBWorldNormal`.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ---- GLSL chunks owned by the engine (custom ShaderMaterials #include them, ENGINE.md section 6) -----------
//   bbl_world_pars_vertex / bbl_world_pars_fragment : declare `varying vec3 vBWorldPos; varying vec3 vBWorldNormal;`
//                      (the fragment one also declares float bblHash21(vec2) and float bblValueNoise(vec2))
//   bbl_world_vertex : sets both varyings; needs `transformed` (object-space position) in scope and, if
//                      BBL_HAS_NORMAL is defined, `transformedNormal` (view-space normal).
THREE.ShaderChunk.bbl_world_pars_vertex = /* glsl */ `
varying vec3 vBWorldPos;
varying vec3 vBWorldNormal;
`;
THREE.ShaderChunk.bbl_world_pars_fragment = /* glsl */ `
varying vec3 vBWorldPos;
varying vec3 vBWorldNormal;
float bblHash21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float bblValueNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( bblHash21( i ), bblHash21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( bblHash21( i + vec2( 0.0, 1.0 ) ), bblHash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;
THREE.ShaderChunk.bbl_world_vertex = /* glsl */ `
{
	vec4 bblWP = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		bblWP = batchingMatrix * bblWP;
	#endif
	#ifdef USE_INSTANCING
		bblWP = instanceMatrix * bblWP;
	#endif
	vBWorldPos = ( modelMatrix * bblWP ).xyz;
	#ifdef BBL_HAS_NORMAL
		vBWorldNormal = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );
	#else
		vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	#endif
}
`;

/** Lit built-in materials (their vertex shader has `transformedNormal`). */
export const isLit = (m) => !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial) && !m.isShaderMaterial;
/** Built-in three mesh materials whose shaders are assembled from the standard `#include <...>` chunks. */
export const isBuiltIn = (m) => (isLit(m) || !!m.isMeshBasicMaterial) && !m.isShaderMaterial;

const RESERVED = { world: 0 };   // engine-owned hooks: cannot be replaced or removed
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Create the hook chain. opts.report(message) receives problems (default console.warn); each distinct
 * message is reported once.
 */
export function createHookChain(opts = {}) {
  const registered = new Set();        // every registered material (strong refs: materials live for the whole run)
  const recOf = new WeakMap();         // material -> { info, base, baseKey, applied: Map(hookName -> rev) }
  const hooks = [];                    // sorted by (order, name)
  const revOf = new Map();             // hook name -> revision counter (survives remove / re-add)
  const told = new Set();
  // one report per problem KIND (hook + anchor, hook + failing callback), naming the first material it happened on
  const problems = [];
  const report = (key, msg) => { if (told.has(key)) return; told.add(key); problems.push(msg); (opts.report || ((m) => console.warn('[hooks] ' + m)))(msg); };
  const first = (e) => String(e && e.message ? e.message : e).split('\n')[0];

  function accepts(h, material, rec) {
    const skip = rec.info.skipHooks;
    if (skip === true ? !h.force : Array.isArray(skip) && skip.includes(h.name)) return false;
    if (!h.filter) return true;
    try { return !!h.filter(material, rec.info); }
    catch (e) { report(`filter:${h.name}`, `hook '${h.name}': filter threw (first on material '${material.name || material.type}'): ${first(e)}`); return false; }
  }

  /** Patch helper handed to hook.shader() as its 4th argument: string edits that REPORT a missing anchor. */
  function makePatch(shader, h, material) {
    const norm = (a) => (a.startsWith('<') ? '#include ' + a : a);
    const stage = (key, label) => {
      const edit = (anchor, fn) => {
        const a = norm(anchor), src = shader[key];
        if (!src.includes(a)) { report(`anchor:${h.name}:${label}:${a}:${material.type}`, `hook '${h.name}': anchor '${a}' not found in the ${label} shader of ${material.type} (first on material '${material.name || material.type}'); that patch was skipped`); return false; }
        shader[key] = src.replace(a, fn(a));
        return true;
      };
      return {
        /** true if the anchor (an `#include <chunk>` line or any exact text; '<chunk>' is shorthand) is present */
        has: (anchor) => shader[key].includes(norm(anchor)),
        /** insert code on the line before / after the anchor; the anchor stays, so other hooks can use it too */
        before: (anchor, code) => edit(anchor, (a) => code + '\n' + a),
        after: (anchor, code) => edit(anchor, (a) => a + '\n' + code),
        /** replace the anchor. Only for the anchors your subsystem owns (ENGINE.md section 6 lists them) */
        replace: (anchor, code) => edit(anchor, () => code),
        /** declarations (uniforms, varyings, functions): inserted after `#include <common>`, or at the top */
        header: (code) => { if (shader[key].includes('#include <common>')) shader[key] = shader[key].replace('#include <common>', '#include <common>\n' + code); else shader[key] = code + '\n' + shader[key]; return true; },
      };
    };
    return {
      vertex: stage('vertexShader', 'vertex'), fragment: stage('fragmentShader', 'fragment'),
      /** attach shared uniform OBJECTS ({ name: { value } }): updating .value later reaches every program */
      uniforms: (obj) => { Object.assign(shader.uniforms, obj); },
    };
  }

  function applyHooks(material, rec) {
    for (const h of hooks) {
      if (!h.apply || rec.applied.get(h.name) === h.rev || !accepts(h, material, rec)) continue;
      rec.applied.set(h.name, h.rev);
      try { h.apply(material, rec.info); }
      catch (e) { report(`apply:${h.name}`, `hook '${h.name}': apply threw (first on material '${material.name || material.type}'): ${first(e)}`); }
    }
  }

  /**
   * Put a material under the hook chain. Idempotent; calling it again with more `info` merges the info and
   * re-evaluates which hooks apply. Call it for EVERY material you construct yourself (materials.get /
   * materials.variant / geom.addStatic / geom.instanced do it for you).
   * info: { owner?: string, skipHooks?: true | string[], aerial?: boolean, noVariation?: boolean, ...free-form flags for hook filters }
   * An onBeforeCompile / customProgramCacheKey the material already has is kept and runs BEFORE the hooks.
   */
  function register(material, info = {}) {
    if (!material || !material.isMaterial) throw new Error('materials.register: not a THREE.Material');
    let rec = recOf.get(material);
    if (rec) {
      let changed = false;
      for (const k of Object.keys(info || {})) if (rec.info[k] !== info[k]) { rec.info[k] = info[k]; changed = true; }
      if (changed) { applyHooks(material, rec); material.needsUpdate = true; }
      return material;
    }
    rec = { info: { ...(info || {}) }, base: hasOwn(material, 'onBeforeCompile') ? material.onBeforeCompile : null, baseKey: hasOwn(material, 'customProgramCacheKey') ? material.customProgramCacheKey : null, applied: new Map() };
    recOf.set(material, rec); registered.add(material);
    const dispatch = function (shader, renderer) {
      if (rec.base) rec.base.call(material, shader, renderer);
      for (const h of hooks) {
        if (!h.shader || !accepts(h, material, rec)) continue;
        try { h.shader(shader, material, renderer, makePatch(shader, h, material)); }
        catch (e) { report(`shader:${h.name}`, `hook '${h.name}': shader() threw (first on material '${material.name || material.type}'): ${first(e)}`); }
      }
    };
    const cacheKey = function () {
      // the author's own patch must be part of the key: two materials with different onBeforeCompile must not share a program
      let k = rec.baseKey ? String(rec.baseKey.call(material)) : rec.base ? rec.base.toString() : '';
      k += '|bbl:';
      for (const h of hooks) if (accepts(h, material, rec)) k += h.name + '@' + h.rev + (h.key ? '=' + h.key(material, rec.info) : '') + ';';
      return k;
    };
    Object.defineProperty(material, 'onBeforeCompile', {
      configurable: true, enumerable: false,
      get: () => dispatch,
      set: (fn) => { rec.base = typeof fn === 'function' ? fn : null; material.needsUpdate = true; },
    });
    Object.defineProperty(material, 'customProgramCacheKey', {
      configurable: true, enumerable: false,
      get: () => cacheKey,
      set: (fn) => { rec.baseKey = typeof fn === 'function' ? fn : null; material.needsUpdate = true; },
    });
    applyHooks(material, rec);
    return material;
  }

  /**
   * Add (or replace, by name) a global hook. It is applied to all registered materials now and to every
   * material registered later.
   * hook = {
   *   name: string (unique; adding the same name again REPLACES it and recompiles the affected programs),
   *   order?: number (default 500; lower runs first. Reserved: world 0, shadows 300, wetness 600, aerial 900),
   *   filter?(material, info) -> boolean (default: every material that did not opt out),
   *   apply?(material, info)  : runs once per material and hook revision (defines, flags, uniforms of ShaderMaterials),
   *   shader?(shader, material, renderer, patch) : runs inside onBeforeCompile. Edit shader.vertexShader /
   *       shader.fragmentShader / shader.uniforms directly, or use `patch` (reports missing anchors):
   *       patch.fragment.after('<color_fragment>', code), .before, .replace, .header(declarations), .has;
   *       patch.vertex.*; patch.uniforms({ uName: sharedUniformObject }),
   *   key?(material, info) -> string : extra program-cache key if the patch depends on material state,
   *   force?: boolean : also applies to materials registered with skipHooks: true (do not use lightly)
   * }
   */
  function addHook(hook) {
    if (!hook || typeof hook.name !== 'string' || !hook.name) throw new Error('materials.addHook: hook.name required');
    if (hook.name in RESERVED && hooks.some((h) => h.name === hook.name)) throw new Error(`materials.addHook: '${hook.name}' is an engine hook and cannot be replaced`);
    const rev = (revOf.get(hook.name) || 0) + 1; revOf.set(hook.name, rev);
    const i = hooks.findIndex((h) => h.name === hook.name); if (i >= 0) hooks.splice(i, 1);
    hooks.push({ order: 500, ...hook, rev });
    hooks.sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const m of registered) { applyHooks(m, recOf.get(m)); m.needsUpdate = true; }
    return rev;
  }
  /** Remove a hook by name. Returns false if there was none. Engine hooks ('world') cannot be removed. */
  function removeHook(name) {
    if (name in RESERVED) { report(`remove:${name}`, `removeHook('${name}'): engine hook, not removed`); return false; }
    const i = hooks.findIndex((h) => h.name === name);
    if (i < 0) return false;
    hooks.splice(i, 1);
    for (const m of registered) m.needsUpdate = true;
    return true;
  }

  /** Register every unregistered material found under an Object3D. Returns the names of the newly registered ones. */
  function adopt(root, info = {}) {
    const found = [];
    root.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) if (m && m.isMaterial && !recOf.has(m)) { register(m, { adopted: true, ...info }); found.push(m.name || m.type); }
      for (const k of ['customDepthMaterial', 'customDistanceMaterial']) if (o[k] && !recOf.has(o[k])) register(o[k], { adopted: true, depth: true, skipHooks: true });
    });
    return found;
  }

  // The one engine-owned hook: world-space position and normal varyings in every built-in material.
  addHook({
    name: 'world', order: RESERVED.world,
    filter: (m) => isBuiltIn(m),
    shader(shader, m, renderer, patch) {
      if (isLit(m)) shader.vertexShader = '#define BBL_HAS_NORMAL\n' + shader.vertexShader;
      patch.vertex.header('#include <bbl_world_pars_vertex>');
      patch.vertex.after('<project_vertex>', '#include <bbl_world_vertex>');
      patch.fragment.header('#include <bbl_world_pars_fragment>');
    },
  });

  return {
    register, adopt, addHook, removeHook,
    /** [{ name, order, rev }] in execution order */
    hooks: () => hooks.map((h) => ({ name: h.name, order: h.order, rev: h.rev })),
    /** All registered materials (live Set). */
    all: () => registered,
    isRegistered: (m) => recOf.has(m),
    /** The info object a material was registered with (live), or null. */
    info: (m) => (recOf.has(m) ? recOf.get(m).info : null),
    /** Names of the hooks that apply to a material, in order (debugging aid). */
    hooksFor: (m) => { const rec = recOf.get(m); return rec ? hooks.filter((h) => accepts(h, m, rec)).map((h) => h.name) : []; },
    isBuiltIn, isLit,
    /** Problems reported so far (missing anchors, throwing hooks). */
    problems: () => problems.slice(),
  };
}

/** Names the engine installs on ctx.materials from the chain (registry.js). */
export const HOOK_API = ['register', 'adopt', 'addHook', 'removeHook', 'hooks', 'all', 'isRegistered', 'info', 'hooksFor', 'isBuiltIn', 'isLit'];
