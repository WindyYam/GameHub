// js/core/materials.js — subsystem "materials" (ENGINE.md 5.2). OWNER: materials engineer. Notes: docs/materials.md.
//
// A registry with one MeshStandardMaterial for every id of world.json palette.materials, textured at true scale
// by procedural texture sets (js/core/textures/) without UVs: in world space, or riding with the object for the
// things that move (timber, reed, bitumen, foliage, cloth).
//   textures/gen.js      GPU generator (detail + relief texture per set, tiling, deterministic)
//   textures/sets.js     the sets: plaster, limewash, earth, roofEarth, soil, crop, grain, breccia, foliage, wood, ...
//   textures/table.js    palette id -> set, parameters and albedo rule (the one place to tune a material)
//   textures/surface.js  the surface shader: mapping along walls, analytic masonry at true module, macro variation,
//                        damp band at the foot of walls, wetness at the waterline
//   textures/_swatches.js debug scene (flag swatches=1, or --with _swatches in the harness)
// ALBEDO: the palette of world.json holds DISPLAY colours. color(id) and the registry materials carry the ALBEDO
// derived from them (textures/table.js, `albedo`): earth colours lose part of their chroma so that the golden sun
// does not turn the city orange, and the value rules of SPEC 4.3 hold. hex(id) stays the palette's own value.
// The HOOK CHAIN is not here: it is the engine's (js/core/hooks.js, ctx.hooks). All texturing goes through ONE
// hook, 'variation' (order 50), which patches after <map_fragment>, <roughnessmap_fragment>, <normal_fragment_maps>
// and, for materials with a specular factor, after <lights_physical_fragment>.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { createGenerator } from './textures/gen.js';
import { SETS } from './textures/sets.js';
import { TABLE, DEFAULTS, JOINTS, COURSE, BRICK } from './textures/table.js';
import * as SURF from './textures/surface.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Mean of the product of the two mask gates of the surface shader (measured on the macro texture). */
const MEAN_GATE = 0.36;
const SPACES = { world: 0, object: 1, uv: 2 };
const PATTERN_DEFAULTS = { value: 0, hue: 0, band: 0, lift: 0, tilt: 0, gloss: 0, farRough: 0, bevel: 0, bevelWidth: 0.006, cellOffset: 0, soft: 0, wobble: 0, joint: 'mud', jointStrength: 0.8, jointRough: 0 };

export async function create(ctx) {
  const palette = ctx.world.palette.materials;
  const { register } = ctx.hooks;
  const cache = new Map();
  const warnedUnknown = new Set();
  const stateOf = new WeakMap();          // material -> { id, cfg, set, uniforms, flags }
  const nightDriven = [];                 // { material, base, day }
  const search = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const wantSwatches = search.get('swatches') === '1' || (ctx.flags.with || []).includes('_swatches');
  const swatches = wantSwatches ? await import('./textures/_swatches.js') : null;

  // ---- shared uniforms ---------------------------------------------------------------------------
  const waterLevel = ctx.ground && typeof ctx.ground.waterLevel === 'number' ? ctx.ground.waterLevel : -3.0;
  const uniforms = {
    uBTime: { value: 0 },
    /** wetness band at the waterline: x = water level, y = band height (m), z = darkening, w = roughness when wet */
    uBWet: { value: new THREE.Vector4(waterLevel, 0.55, 0.36, 0.3) },
    uBMacro: { value: null },
    uBMacroMean: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) },
    uBGround: { value: null },
    uBGroundRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  };

  // ---- texture sets (generated on first use) -------------------------------------------------------
  const gen = createGenerator(ctx.renderer);
  const sets = new Map();
  const texSize = (def) => Math.max(def.min || 64, Math.round(ctx.quality.textureSize * def.res));
  let macroMean = [0.5, 0.5, 0.5, 0.5], extraBytes = 0;
  function sharedTextures() {
    if (uniforms.uBMacro.value) return;
    const size = ctx.quality.draft ? 256 : 1024;
    uniforms.uBMacro.value = gen.macro(size);
    macroMean = gen.meanOf(uniforms.uBMacro.value, size);
    uniforms.uBMacroMean.value.set(macroMean[0], macroMean[1], macroMean[2], macroMean[3]);
    bakeGround();
  }
  /** Texture set by name: generated once, shared by every material that uses it. */
  function getSet(name) {
    let s = sets.get(name);
    if (s) return s;
    const def = SETS[name];
    if (!def) return null;
    s = gen.generate({ name, tile: def.tile, glsl: def.glsl }, texSize(def));
    sets.set(name, s);
    return s;
  }

  /**
   * The ground map: ground level (r) and a confidence (g) that falls to 0 where the ground steps (terrace
   * edges, scarps), over ground.coreBounds. The surface shader uses it for the damp band at the foot of walls.
   */
  function bakeGround() {
    const g = ctx.ground, cb = (g && g.coreBounds) || [-2000, -3500, 3500, 2000];
    const sx = cb[2] - cb[0], sz = cb[3] - cb[1];
    // A FIXED resolution per tier (2.7 m per texel in final, 10.7 m in draft). It used to be chosen from a timing
    // probe: a busy machine baked a coarser map and the damp band moved, so two runs could differ in their pixels.
    // ground.height costs about 0.1 microseconds: 0.5 s in final, 0.03 s in draft.
    const n = ctx.quality.draft ? 512 : 2048;
    const data = new Float32Array(n * n * 2), h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = cb[0] + (i + 0.5) / n * sx, z = cb[1] + (j + 0.5) / n * sz;
      h[j * n + i] = g && g.height ? g.height(x, z) : 0;
    }
    const conf = new Float32Array(n * n), cell = sx / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = h[j * n + i]; let d = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = clamp(i + di, 0, n - 1), jj = clamp(j + dj, 0, n - 1); d = Math.max(d, Math.abs(h[jj * n + ii] - c)); }
      const slope = d / cell;                                  // rise over run between neighbouring samples
      conf[j * n + i] = 1 - clamp((slope - 0.12) / 0.25);     // gentle ground: 1; steps and scarps: 0
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let c = 1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) c = Math.min(c, conf[clamp(j + dj, 0, n - 1) * n + clamp(i + di, 0, n - 1)]);
      data[(j * n + i) * 2] = h[j * n + i]; data[(j * n + i) * 2 + 1] = c;
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGFormat, THREE.FloatType);
    tex.name = 'bbl:groundMap'; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false; tex.needsUpdate = true;
    uniforms.uBGround.value = tex; uniforms.uBGroundRect.value.set(cb[0], cb[1], 1 / sx, 1 / sz);
    extraBytes += n * n * 8;
    groundMapInfo = { size: n, metresPerTexel: cell };
  }
  let groundMapInfo = null;

  // ---- palette colour -> albedo ----------------------------------------------------------------------
  const albedoCache = new Map();
  /**
   * The albedo of a palette id (linear working space): the palette's display colour with the `albedo` rule of the
   * table applied: chroma scaled about the luminance, then scaled to the luminance the value rules ask for.
   */
  function albedoOf(id) {
    let c = albedoCache.get(id);
    if (c) return c;
    c = new THREE.Color(palette[id] || '#ff00ff');
    const a = TABLE[id] && TABLE[id].albedo;
    if (a) {
      const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, k = a.chroma === undefined ? 1 : a.chroma, s = a.lum && y > 1e-4 ? a.lum / y : 1;
      c.setRGB(clamp((y + (c.r - y) * k) * s), clamp((y + (c.g - y) * k) * s), clamp((y + (c.b - y) * k) * s));
    }
    albedoCache.set(id, c);
    return c;
  }

  // ---- configuration -> uniforms -------------------------------------------------------------------
  const lin = (spec) => (palette[spec] ? albedoOf(spec) : new THREE.Color(JOINTS[spec] || spec));   // linear working space
  const hexOf = (c) => (Math.round(clamp(c.r) * 255) << 16) | (Math.round(clamp(c.g) * 255) << 8) | Math.round(clamp(c.b) * 255);
  function ratioTo(base, spec) {
    if (!spec) return [1, 1, 1];
    if (spec.ratio) return spec.ratio;
    const c = lin(spec);
    return [c.r / Math.max(base.r, 0.004), c.g / Math.max(base.g, 0.004), c.b / Math.max(base.b, 0.004)];
  }
  /** The resolved configuration of a palette id (table + defaults), before variant options. */
  function baseConfig(id) {
    const t = TABLE[id] || {};
    const cfg = { ...DEFAULTS, ...t, wear: 0.25, scale: 1, rotDeg: 0, origin: [0, 0], originY: 0, uvMetres: [1, 1] };
    if (t.pattern) cfg.pattern = { ...PATTERN_DEFAULTS, ...t.pattern };
    return cfg;
  }
  /** Apply the texturing options of variant() to a configuration (returns a new one). */
  function applyOptions(cfg, o) {
    const c = { ...cfg, pattern: cfg.pattern ? { ...cfg.pattern } : null, foot: cfg.foot ? { ...cfg.foot } : null };
    if (o.texture === false) { c.set = null; c.pattern = null; c.variation = false; }
    else if (typeof o.texture === 'string' && SETS[o.texture]) c.set = o.texture;
    if (o.wear !== undefined) c.wear = clamp(o.wear, 0, 1);
    if (o.scale !== undefined) c.scale = Math.max(0.01, o.scale);
    if (o.rotDeg !== undefined) c.rotDeg = o.rotDeg;
    if (o.origin) c.origin = [o.origin[0], o.origin[1]];
    if (o.originY !== undefined) c.originY = o.originY;
    if (o.space && o.space in SPACES) c.space = o.space;
    if (o.uvMetres !== undefined) c.uvMetres = Array.isArray(o.uvMetres) ? [o.uvMetres[0], o.uvMetres[1]] : [o.uvMetres, o.uvMetres];
    if (o.uvFace !== undefined) c.uvFace = o.uvFace === 'top' ? 'top' : 'side';
    if (o.detail !== undefined) { c.detail *= o.detail; c.far *= Math.min(1.5, o.detail); }
    if (o.relief !== undefined) c.relief *= o.relief;
    if (o.macro !== undefined) c.macro = c.macro.map((v) => v * o.macro);
    if (o.mask !== undefined) c.mask *= o.mask;
    if (o.maskGate !== undefined) c.maskGate = clamp(o.maskGate);
    if (o.spec !== undefined) c.spec = Math.max(0, o.spec);
    if (o.specGrazing !== undefined) c.specGrazing = Math.max(0, o.specGrazing);
    if (o.color2 !== undefined) c.color2 = o.color2;
    if (o.foot !== undefined) { if (!o.foot) c.foot = null; else if (c.foot) { c.foot.dark *= o.foot; c.foot.mask *= o.foot; } }
    if (o.wet !== undefined) c.wet = !!o.wet;
    if (o.vertical !== undefined) c.vertical = !!o.vertical;
    if (c.pattern) {
      const p = c.pattern;
      if (o.pattern === false) c.pattern = null;
      else {
        if (o.module !== undefined) {              // size of one slab / brick on HORIZONTAL faces: number or [u, v]
          const mu = Array.isArray(o.module) ? o.module[0] : o.module, mv = Array.isArray(o.module) ? o.module[1] : o.module;
          p.top = [mu, mv, p.top[2], p.top[3]];
        }
        if (o.moduleTop) p.top = o.moduleTop.slice(0, 4);
        if (o.moduleSide) p.side = o.moduleSide.slice(0, 4);
        if (o.joint !== undefined) {
          if (typeof o.joint === 'string') p.joint = o.joint;
          else if (o.joint && typeof o.joint === 'object') {
            if (o.joint.color !== undefined) p.joint = o.joint.color;
            if (o.joint.ratio) p.joint = { ratio: o.joint.ratio };
            if (o.joint.strength !== undefined) p.jointStrength = o.joint.strength;
            if (o.joint.width !== undefined) { p.top = [p.top[0], p.top[1], p.top[2], o.joint.width]; p.side = [p.side[0], p.side[1], p.side[2], o.joint.width]; }
          }
        }
      }
    }
    if (o.rows && c.set) {                        // soft rows on any textured material: planks, furrows, reed bundles
      const r = typeof o.rows === 'number' ? { pitch: o.rows } : o.rows;
      c.pattern = { ...PATTERN_DEFAULTS, value: r.value ?? 0.06, bevel: r.bevel ?? 0.5, bevelWidth: 0, soft: 1, joint: r.color ?? { ratio: [0.6, 0.6, 0.6] }, jointStrength: r.strength ?? 0.5,
        side: [r.pitch, r.pitch, 0, 0], top: [r.pitch, r.pitch, 0, 0] };
    }
    return c;
  }

  function buildState(id, cfg) {
    const base = lin(id), wearMul = clamp(cfg.wear / 0.25, 0, 4);
    const set = cfg.set ? getSet(cfg.set) : null;
    const st = { id, cfg, set, uniforms: null, tex: !!set, pattern: !!(set && cfg.pattern), space: SPACES[cfg.space] || 0, wet: !!cfg.wet, variation: !!cfg.variation, spec: cfg.spec !== 1 || (cfg.specGrazing !== undefined && cfg.specGrazing !== null && cfg.specGrazing !== 1) };
    if (!set) return st;
    sharedTextures();
    // wear: the mask strength grows with it; what exceeds 1 deepens the secondary colour, and a neglected surface
    // is stained more widely (the gate opens), so wear 0.6 and wear 1 are not the same wall
    const wearX = clamp((cfg.wear - 0.25) / 0.75), over = Math.max(1, cfg.mask * wearMul);
    const r2 = ratioTo(base, cfg.color2).map((r) => Math.pow(r, over)), maskS = cfg.color2 ? clamp(cfg.mask * wearMul) : 0;
    // mean of the mask as the shader mixes it: the two gates (mid layer, macro) pass about a third of it on average
    const gate = clamp(cfg.maskGate === undefined ? 1 : cfg.maskGate) * (1 - 0.6 * wearX), mEff = clamp(set.meanMask, 0, 1) * maskS * (1 - gate + gate * MEAN_GATE);
    const comp = r2.map((r) => clamp(1 / (1 + mEff * (r - 1)), 0.5, 2));
    const rot = cfg.rotDeg * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
    const topXf = st.space === 2 ? new THREE.Vector4(cfg.uvMetres[0], cfg.uvMetres[1], cfg.origin[0], cfg.origin[1])
      : new THREE.Vector4(c, s, -(cfg.origin[0] * c + cfg.origin[1] * s), -(-cfg.origin[0] * s + cfg.origin[1] * c));
    const foot = cfg.foot && st.space === 0 ? cfg.foot : null;
    const u = {
      uBTexA: { value: set.map }, uBTexN: { value: set.normalMap },
      uBMacro: uniforms.uBMacro, uBMacroMean: uniforms.uBMacroMean, uBGround: uniforms.uBGround, uBGroundRect: uniforms.uBGroundRect,
      uBTexScale: { value: new THREE.Vector4(1 / (set.tile * cfg.scale), cfg.vertical ? 1 : 0, cfg.closeRatio, cfg.relief) },
      uBTexMix: { value: new THREE.Vector4(clamp(cfg.detail * (0.85 + 0.15 * wearMul), 0, 2), clamp(cfg.far * (0.75 + 0.25 * wearMul), 0, 1.5), cfg.close, cfg.roughAmt * 2) },
      uBGain: { value: new THREE.Vector4(set.gain[0], set.gain[1], set.gain[2], 0) },
      uBComp: { value: new THREE.Vector4(comp[0], comp[1], comp[2], 0) },
      uBColor2: { value: new THREE.Vector4(r2[0], r2[1], r2[2], maskS) },
      uBMaskFx: { value: new THREE.Vector4(cfg.maskRough, foot ? foot.mask : 0, cfg.pattern ? cfg.pattern.jointRough : 0, gate) },
      uBSpec: { value: new THREE.Vector4(cfg.spec, cfg.specGrazing === undefined || cfg.specGrazing === null ? cfg.spec : cfg.specGrazing, 0, 0) },
      uBFoot: { value: new THREE.Vector4(foot ? foot.h : 0, foot ? clamp(foot.dark * (0.5 + 0.5 * wearMul), 0, 0.6) : 0, cfg.originY, 0) },
      uBTopXf: { value: topXf },
      uBMacroMix: { value: new THREE.Vector4(cfg.macro[0] * (0.75 + 0.25 * wearMul), cfg.macro[1] * (0.75 + 0.25 * wearMul), cfg.macro[2], 0) },
    };
    if (st.pattern) {
      const p = cfg.pattern, jr = ratioTo(base, p.joint);
      u.uBPatSide = { value: new THREE.Vector4(p.side[0], p.side[1], p.side[2], p.side[3]) };
      // uv space has one projection: the wall bond (courses along u) unless the variant says uvFace: 'top' (paving)
      const flat = st.space === 2 && cfg.uvFace !== 'top' ? p.side : p.top;
      u.uBPatTop = { value: new THREE.Vector4(flat[0], flat[1], flat[2], flat[3]) };
      u.uBPatFx = { value: new THREE.Vector4(p.value, p.hue, p.bevel, p.cellOffset ? 1 : 0) };
      u.uBPatAlt = { value: new THREE.Vector4(p.wobble, p.soft ? 1 : 0, p.band, p.bevelWidth) };
      u.uBJoint = { value: new THREE.Vector4(jr[0], jr[1], jr[2], clamp(p.jointStrength)) };
      u.uBPatGloss = { value: new THREE.Vector4(p.tilt, p.gloss, p.farRough, p.lift) };
    }
    st.uniforms = u;
    return st;
  }
  /** State of a material: registry materials have one; a clone made outside variant() gets its id's base state. */
  function stateFor(m) {
    let st = stateOf.get(m);
    if (st === undefined) {
      const id = m.userData && m.userData.paletteId;
      st = id && palette[id] && m.isMeshStandardMaterial ? buildState(id, baseConfig(id)) : null;
      stateOf.set(m, st);
    }
    return st;
  }
  const flagsOf = (m, info) => {
    const st = stateFor(m);
    if (!st) return { tex: false, pattern: false, space: 0, wet: !info.noWetness, variation: true, spec: false };   // a material from outside the registry
    return st;
  };

  // ---- THE hook: all texturing, in one place ---------------------------------------------------------
  ctx.hooks.addHook({
    name: 'variation', order: 50,
    filter: (m, info) => ctx.hooks.isLit(m) && !info.noVariation,
    key: (m, info) => { const f = flagsOf(m, info); return 'r2' + (f.tex ? 'T' : '') + (f.pattern ? 'P' : '') + f.space + (f.wet ? 'W' : '') + (f.variation ? 'V' : '') + (f.spec ? 'S' : ''); },
    shader(shader, m, renderer, patch) {
      const f = flagsOf(m, ctx.hooks.info(m) || {}), st = stateFor(m);
      const defs = `#define BBL_SPACE ${f.tex ? f.space : 0}\n` + (f.tex ? '#define BBL_TEX\n' : '') + (f.pattern ? '#define BBL_PATTERN\n' : '') + (f.wet ? '#define BBL_WETNESS\n' : '') + (!f.tex && f.variation ? '#define BBL_PLAIN_VARIATION\n' : '') + (f.tex && f.spec ? '#define BBL_SPEC\n' : '');
      shader.fragmentShader = defs + shader.fragmentShader;
      patch.uniforms({ uBWet: uniforms.uBWet });
      if (st && st.uniforms) patch.uniforms(st.uniforms);
      if (f.tex && f.space !== 0) {
        shader.vertexShader = defs + shader.vertexShader;
        patch.vertex.header(SURF.PARS_VERTEX);
        patch.vertex.after('<project_vertex>', SURF.VERTEX);
      }
      patch.fragment.header(SURF.PARS_FRAGMENT);
      patch.fragment.after('<map_fragment>', SURF.FRAGMENT_COLOR);
      if (patch.fragment.has('<roughnessmap_fragment>')) patch.fragment.after('<roughnessmap_fragment>', SURF.FRAGMENT_ROUGHNESS);   // Lambert / Phong have none
      if (f.tex) patch.fragment.after('<normal_fragment_maps>', SURF.FRAGMENT_NORMAL);
      if (f.tex && f.spec && patch.fragment.has('<lights_physical_fragment>')) patch.fragment.after('<lights_physical_fragment>', SURF.FRAGMENT_SPECULAR);
    },
  });

  // ---- registry ----------------------------------------------------------------------------------
  function makeBase(id) {
    const cfg = baseConfig(id);
    const m = new THREE.MeshStandardMaterial({ name: id, color: albedoOf(id).clone(), roughness: cfg.rough, metalness: cfg.metal, vertexColors: true });
    // emitters: black body, emissive = palette colour. emissiveIntensity 6 is above the bloom threshold
    // (ENGINE.md section 1, "HDR scale"); modules scale it with the night factor, or ask for variant(id, { night: 6 }).
    if (cfg.emissive) { m.color.set(0x000000); m.emissive.set(palette[id]); m.emissiveIntensity = 6.0; }
    m.userData.paletteId = id;
    stateOf.set(m, buildState(id, cfg));
    return m;
  }

  /** Shared material for a palette id. Do not mutate it: use variant(). Needs a `color` vertex attribute (geom adds it). */
  function get(id) {
    let m = cache.get(id);
    if (m) return m;
    if (!palette[id]) {
      if (!warnedUnknown.has(id)) { warnedUnknown.add(id); console.warn(`[materials] unknown material id '${id}', using magenta`); }
      m = new THREE.MeshStandardMaterial({ name: 'UNKNOWN:' + id, color: 0xff00ff, vertexColors: true });
      stateOf.set(m, null);
    } else m = makeBase(id);
    cache.set(id, m);
    return register(m, { owner: 'materials', id });
  }

  const STD_KEYS = ['roughness', 'metalness', 'emissiveIntensity', 'side', 'transparent', 'opacity', 'alphaTest', 'depthWrite', 'blending', 'vertexColors', 'flatShading', 'map', 'alphaMap', 'normalMap', 'roughnessMap', 'fog'];
  /**
   * A shared material derived from a palette id. The same (id, opts) returns the same instance. Variants of one
   * id share its textures (and its shader program when they differ only in numbers).
   * Contract options: { name, color (hex | THREE.Color: replaces the palette colour), tint: [r, g, b] (multiplies),
   *   roughness, metalness, emissive (hex), emissiveIntensity, side, transparent, opacity, alphaTest, depthWrite,
   *   blending, vertexColors (default true), flatShading, polygonOffset (number, for paving decals),
   *   map, alphaMap, normalMap, roughnessMap (THREE.Texture, UV-mapped, three.js semantics), fog (default true),
   *   info (flags for hook filters) }
   * Texturing options (docs/materials.md):
   *   wear: 0..1 (default 0.25: maintained and new; 0 = pristine, 1 = neglected) stains, flaking, foot band, variation
   *   scale: number  size of the texture features (2 = twice as large); the masonry module is NOT scaled
   *   rotDeg, origin: [x, z]  rotation (clockwise from above, as footprints) and origin of the pattern on horizontal faces
   *   originY: datum level at which a course starts on walls
   *   space: 'world' | 'object' | 'uv', uvMetres: n | [mu, mv] (metres per uv unit in uv space), uvFace: 'side' (default: the
   *     wall bond, courses along u, for round towers and curved walls) | 'top' (the paving bond)
   *   module: n | [u, v] (slab / brick size on horizontal faces), moduleTop / moduleSide: [cellU, cellV, stagger, jointWidth]
   *   joint: 'mud' | 'bitumen' | 'lime' | palette id | '#hex' | { color, ratio, strength, width }, pattern: false
   *   rows: pitch | { pitch, strength, bevel, color, value }  soft rows (planks, furrows) on any textured id
   *   vertical: true  on walls the grain (timber) and the rows run up the wall instead of along it
   *   detail, relief, macro, mask, foot: multipliers (0 switches the feature off), color2, wet: false, texture: false | set name
   *   maskGate: 0..1 (1 = stains in clusters, 0 = wherever the set says), spec, specGrazing: factors on the specular reflectance
   *   night: n  emissiveIntensity = n x night factor, driven by the engine (emitters; `day`: share kept by day)
   * `color` REPLACES the albedo (0xffffff for a variant that is tinted per vertex or per instance with materials.color(id));
   * `tint` multiplies it.
   */
  function variant(id, opts = {}) {
    const keyOpts = { ...opts };
    for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap']) if (keyOpts[k]) keyOpts[k] = keyOpts[k].uuid;
    if (keyOpts.color && keyOpts.color.isColor) keyOpts.color = keyOpts.color.getHex();
    const key = id + '#' + JSON.stringify(keyOpts);
    let m = cache.get(key);
    if (m) return m;
    const base = get(id);
    m = base.clone();
    m.userData.paletteId = id;
    m.name = opts.name || id + ':variant';
    if (opts.color !== undefined) m.color.set(opts.color);
    if (opts.tint) m.color.multiply(new THREE.Color(opts.tint[0], opts.tint[1], opts.tint[2]));
    for (const k of STD_KEYS) if (opts[k] !== undefined) m[k] = opts[k];
    if (opts.emissive !== undefined) m.emissive.set(opts.emissive);
    if (opts.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -opts.polygonOffset; m.polygonOffsetUnits = -opts.polygonOffset * 4; }
    if (palette[id]) {
      let cfg = applyOptions(baseConfig(id), opts);
      // a variant that brings its own UV colour map is not textured in world space unless it asks for it
      if (opts.map && opts.texture === undefined && opts.space === undefined) cfg = applyOptions(cfg, { texture: false });
      stateOf.set(m, buildState(id, cfg));
      if (opts.night !== undefined && opts.night !== false) {
        const baseI = opts.night === true ? 6 : Number(opts.night);
        nightDriven.push({ material: m, base: baseI, day: clamp(opts.day || 0) });
        m.emissiveIntensity = baseI * clamp(opts.day || 0);
      }
    } else stateOf.set(m, null);
    cache.set(key, m);
    return register(m, { owner: 'materials', id, ...(opts.info || {}) });
  }

  /**
   * Ready-made variants for things many modules build: preset(name, extraOptions) = variant(id, { ...preset, ...extra }).
   *   pottery / potteryPale   fired clay without masonry joints, riding with the object: jars, bowls, ovens, drain pipes
   *                           (a jar drawn with 'bakedBrickRed' itself shows brick courses)
   *   quayBrick               baked brick laid in bitumen (quays, bridge piers, the lower courses of the gate)
   *   planks / palmPlanks     cedar / palm boards 22 / 30 cm wide along the piece ({ vertical: true } for doors and posts)
   *   houseWalls / houseLime  WHITE mud-plaster / lime-wash variants to be tinted per vertex or per instance with
   *                           materials.color(toneId): one material for all the tones of a block
   */
  const PRESETS = {
    pottery: ['bakedBrickRed', { pattern: false, space: 'object', relief: 0.6, roughness: 0.8, foot: 0 }],
    potteryPale: ['bakedBrickBuff', { pattern: false, space: 'object', relief: 0.6, roughness: 0.8, foot: 0 }],
    quayBrick: ['bakedBrickBuff', { joint: 'bitumen' }],
    planks: ['cedar', { rows: 0.22 }],
    palmPlanks: ['palmWood', { rows: 0.3 }],
    houseWalls: ['mudPlaster', { color: 0xffffff }],
    houseLime: ['limewash', { color: 0xffffff }],
  };
  function preset(name, extra = {}) {
    const p = PRESETS[name];
    if (!p) { console.warn(`[materials] unknown preset '${name}' (have: ${Object.keys(PRESETS).join(', ')})`); return get('no-such-preset:' + name); }
    return variant(p[0], { name, ...p[1], ...extra });
  }

  /** GPU memory of the texture sets in MB (with mip chains) and what was generated. */
  function memory() {
    return {
      MB: Math.round((gen.bytes + extraBytes) / 1048576 * 10) / 10,
      sets: [...sets.values()].map((s) => ({ name: s.name, size: s.size, metresPerRepeat: s.tile, texelsPerMetre: Math.round(s.texelsPerMetre), ms: s.ms })),
      groundMap: groundMapInfo, anisotropy: gen.maxAnisotropy,
    };
  }

  let swatchesBuilt = false;
  return {
    impl: 'real',
    ids: Object.keys(palette),
    has: (id) => !!palette[id],
    get, variant,
    /** Ready-made variants: preset('pottery' | 'potteryPale' | 'quayBrick' | 'planks' | 'palmPlanks' | 'houseWalls' | 'houseLime', extraOptions). */
    preset, presets: Object.keys(PRESETS),
    /**
     * The ALBEDO of a palette id as a THREE.Color in the linear working space (new instance): what the registry
     * material of that id carries, and what to paint into vertex colours of a white variant
     * (geom.paint(g, materials.color('mudPlasterGrey'))). For most ids it is the palette colour; the earth
     * colours are less chromatic and follow the value rules of SPEC 4.3 (textures/table.js, `albedo`).
     */
    color: (id) => albedoOf(id).clone(),
    /** The palette's own display colour as 0xRRGGBB (world.json, unchanged). For tints use color() or tintHex(). */
    hex: (id) => parseInt((palette[id] || '#ff00ff').slice(1), 16),
    /** The albedo of a palette id as an sRGB 0xRRGGBB: the tint to give an instance of a WHITE variant (geom.instanced: set.add(t, materials.tintHex(id))). */
    tintHex: (id) => hexOf(new THREE.Color().copyLinearToSRGB(albedoOf(id))),
    /** The palette's display colour as a linear THREE.Color (new instance), without the albedo rule: for emitters, overlays, plans. */
    displayColor: (id) => new THREE.Color(palette[id] || '#ff00ff'),
    /** Shared uniforms any hook or custom shader may reference: uBTime (film time of the sub-frame), uBWet, uBMacro, uBGround, uBGroundRect. */
    uniforms,
    /**
     * Procedural texture set by SET name ('plaster', 'grain', ...) or by palette id (the set that id uses):
     * { name, map (detail: linear albedo multiplier x gain, alpha = mask), normalMap (rgb normal, alpha = roughness
     * detail), roughnessMap (= normalMap, channel a), metresPerRepeat, texelsPerMetre, size, gain, meanMask } or null.
     * To draw a set on UV-mapped geometry use variant(id, { space: 'uv', uvMetres }), not these textures directly.
     */
    textureSet: (name) => (SETS[name] ? getSet(name) : TABLE[name] && TABLE[name].set ? getSet(TABLE[name].set) : null),
    /** Names of all texture sets. */
    setNames: Object.keys(SETS),
    /** The resolved texturing configuration of a palette id (read only; table + defaults). */
    describe: (id) => (palette[id] ? baseConfig(id) : null),
    /** The texturing state of a registry material: { id, cfg, set, tex, pattern, space } or null. */
    stateOf: (m) => stateFor(m),
    memory,
    /** Debug: camera strings of the swatch scene ({ name: "x,y,z;lx,ly,lz;fov" }), or null when it is not built. */
    swatchCameras: () => (swatches && swatchesBuilt ? swatches.cameras() : null),
    /** True module of baked brick: course height and brick pitch in metres. */
    module: { course: COURSE, brick: BRICK },
    /** Per-frame: shared uniforms and night-driven emitters. Called by the engine before every sub-frame render. */
    update(frame) {
      uniforms.uBTime.value = frame.t;
      if (nightDriven.length) {
        const night = frame.light && typeof frame.light.night === 'number' ? frame.light.night : 0;
        for (const n of nightDriven) n.material.emissiveIntensity = n.base * (n.day + (1 - n.day) * night);
      }
      if (swatches && !swatchesBuilt) {
        swatchesBuilt = true;
        try { swatches.build(ctx); } catch (e) { console.error('[materials] swatch scene failed: ' + (e && e.stack ? e.stack : e)); }
      }
      if (swatches && swatchesBuilt && swatches.update) swatches.update(frame);
    },
    // register, adopt, addHook, removeHook, hooks, all, isRegistered, info, hooksFor, isBuiltIn, isLit:
    // installed by the engine from ctx.hooks (js/core/hooks.js) after create() returns.
  };
}
