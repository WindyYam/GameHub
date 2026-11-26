"use strict";
// ---------------------------------------------------------------- gfx: one tiny rendering layer, two backends (WebGPU, WebGL2)
// Shaders are authored once in "SSL" (a typed WGSL subset) and machine-translated to GLSL ES 3.00 for the WebGL2 path.
// Conventions (both backends): clip z in [0,1], NDC y up, texture row 0 = top of image, uniform structs hold only vec4f / mat4x4f.

const SSL_TYPES = { f32: 'float', i32: 'int', u32: 'uint', vec2f: 'vec2', vec3f: 'vec3', vec4f: 'vec4', vec2i: 'ivec2', vec3i: 'ivec3', vec4i: 'ivec4', vec2u: 'uvec2', vec3u: 'uvec3', vec4u: 'uvec4', mat2x2f: 'mat2', mat3x3f: 'mat3', mat4x4f: 'mat4' };
const SSL_SIZE = { f32: 1, vec2f: 2, vec3f: 3, vec4f: 4, mat4x4f: 16 };

function sslToGlsl(src) {
  let s = src.replace(/\/\/[^\n]*/g, "");                                   // comments go first: their words ("let", commas in a struct) are not code
  s = s.replace(/struct\s+(\w+)\s*\{([^}]*)\}/g, (m, name, body) => {
    const fields = body.split(',').map(f => f.trim()).filter(Boolean).map(f => { const i = f.indexOf(':'); return '  ' + f.slice(i + 1).trim() + ' ' + f.slice(0, i).trim() + ';'; });
    return 'struct ' + name + ' {\n' + fields.join('\n') + '\n};';
  });
  s = s.replace(/\bfn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\w+))?\s*\{/g, (m, name, params, ret) => {
    const ps = params.split(',').map(p => p.trim()).filter(Boolean).map(p => { const i = p.indexOf(':'); return p.slice(i + 1).trim() + ' ' + p.slice(0, i).trim(); });
    return (ret || 'void') + ' ' + name + '(' + ps.join(', ') + ') {';
  });
  s = s.replace(/\bconst\s+(\w+)\s*:\s*(\w+)\s*=/g, 'const $2 $1 =');
  s = s.replace(/\b(?:let|var)\s+(\w+)\s*:\s*(\w+)\s*(=|;)/g, '$2 $1 $3');
  s = s.replace(/\b(f32|i32|u32|vec[234][fiu]|mat[234]x[234]f)\b/g, t => SSL_TYPES[t] || t);
  const bad = s.match(/\b(let|var)\s+\w+[^\n]*/);
  if (bad) throw new Error('SSL: untyped declaration: ' + bad[0]);
  return s;
}
function sslToWgsl(src) {
  return src
    .replace(/\btexLod\(\s*(\w+)\s*,/g, 'textureSampleLevel($1, $1_s,')
    .replace(/\btexFetchD\(\s*(\w+)\s*,/g, 'textureLoad($1,')
    .replace(/\btexFetch\(\s*(\w+)\s*,/g, 'textureLoad($1,')
    .replace(/\btexShadow\(\s*(\w+)\s*,/g, 'textureSampleCompareLevel($1, $1_s,')
    .replace(/\btexSize\(\s*(\w+)\s*\)/g, 'vec2f(textureDimensions($1))')
    .replace(/\btex\(\s*(\w+)\s*,/g, 'textureSample($1, $1_s,');
}
const GLSL_PRELUDE = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DShadow;
#define dpdx dFdx
#define dpdy dFdy
#define atan2(y, x) atan(y, x)
#define inverseSqrt inversesqrt
#define tex(t, uv) texture(t, uv)
#define texLod(t, uv, l) textureLod(t, uv, l)
#define texFetch(t, p, l) texelFetch(t, p, l)
#define texFetchD(t, p, l) texelFetch(t, p, l).r
#define texShadow(t, uv, r) texture(t, vec3(uv, r))
#define texSize(t) vec2(textureSize(t, 0))
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }
vec4 saturate(vec4 x) { return clamp(x, 0.0, 1.0); }
float select(float a, float b, bool c) { return c ? b : a; }
vec2 select(vec2 a, vec2 b, bool c) { return c ? b : a; }
vec3 select(vec3 a, vec3 b, bool c) { return c ? b : a; }
vec4 select(vec4 a, vec4 b, bool c) { return c ? b : a; }
int select(int a, int b, bool c) { return c ? b : a; }
`;

// global uniform block shared by every pipeline (fields: vec4f / mat4x4f only, so std140 == WGSL layout)
const GLOBALS = [];           // [name, type] — filled by defineGlobals()
let GLOBALS_SIZE = 0;         // in floats
const GOFF = {};              // name -> float offset
function defineGlobals(list) { GLOBALS.length = 0; GLOBALS_SIZE = 0; for (const [n, t] of list) { GLOBALS.push([n, t]); GOFF[n] = GLOBALS_SIZE; GLOBALS_SIZE += SSL_SIZE[t]; } }

function numberLines(s) { return s.split('\n').map((l, i) => String(i + 1).padStart(4) + ' ' + l).join('\n'); }

// Build both shader texts for a pipeline description.
// smoothstep with its edges written high-to-low (a fade *out*, used all over the shaders) is undefined in GLSL and a hard error in WGSL when
// the edges are constants: Safari's WebGPU refuses the whole module ("smoothstep called with 'low' not less than 'high'"), Chrome lets it
// pass. Every such call is rewritten to the same curve the right way round: smoothstep(a, b, x) = 1 - smoothstep(b, a, x)
function fixSmoothstep(src) {
  const num = (x) => { x = x.trim(); if (!/^[-+*/(). 0-9eE]+$/.test(x) || !/\d/.test(x)) return null; try { const v = Function('return (' + x + ')')(); return isFinite(v) ? v : null; } catch (e) { return null; } };
  let out = '', i = 0;
  for (;;) {
    const k = src.indexOf('smoothstep(', i);
    if (k < 0) return out + src.slice(i);
    if (k > 0 && /[\w.]/.test(src[k - 1])) { out += src.slice(i, k + 11); i = k + 11; continue; }
    let j = k + 11, d = 1; const args = []; let a0 = j;
    for (; j < src.length; j++) { const c = src[j]; if (c === '(') d++; else if (c === ')') { if (--d === 0) break; } else if (c === ',' && d === 1) { args.push(src.slice(a0, j)); a0 = j + 1; } }
    args.push(src.slice(a0, j));
    const A = args.map(fixSmoothstep), lo = num(A[0] || ''), hi = num(A[1] || '');
    out += src.slice(i, k) + (A.length === 3 && lo !== null && hi !== null && lo > hi ? '(1.0 - smoothstep(' + A[1].trim() + ', ' + A[0].trim() + ', ' + A[2].trim() + '))' : 'smoothstep(' + A.join(',') + ')');
    i = j + 1;
  }
}
function buildShader(desc, lang) {
  desc = Object.assign({}, desc, { lib: (desc.lib || []).map(fixSmoothstep), vs: fixSmoothstep(desc.vs), fs: desc.fs ? fixSmoothstep(desc.fs) : desc.fs });
  const attrs = []; (desc.buffers || []).forEach(b => b.attrs.forEach(a => attrs.push(a)));
  const vary = Object.entries(desc.varyings || {});
  const ufields = Object.entries(desc.uniforms || {});
  const texs = Object.entries(desc.textures || {});
  const lib = (desc.lib || []).join('\n');
  const uStruct = 'struct Globals {\n' + GLOBALS.map(([n, t]) => '  ' + n + ': ' + t + ',').join('\n') + '\n}\n';
  const mStruct = ufields.length ? 'struct MatU {\n' + ufields.map(([n, t]) => '  ' + n + ': ' + t + ',').join('\n') + '\n}\n' : '';
  if (lang === 'wgsl') {
    let h = 'diagnostic(off, derivative_uniformity);\n' + uStruct + '@group(0) @binding(0) var<uniform> U: Globals;\n';
    if (ufields.length) h += mStruct + '@group(1) @binding(0) var<uniform> M: MatU;\n';
    let b = 0;
    for (const [n, k] of texs) {
      if (k === '2d') { h += `@group(2) @binding(${b++}) var ${n}: texture_2d<f32>;\n@group(2) @binding(${b++}) var ${n}_s: sampler;\n`; }
      else if (k === 'fetch') { h += `@group(2) @binding(${b++}) var ${n}: texture_2d<f32>;\n`; }
      else if (k === 'depth') { h += `@group(2) @binding(${b++}) var ${n}: texture_depth_2d;\n`; }
      else if (k === 'shadow') { h += `@group(2) @binding(${b++}) var ${n}: texture_depth_2d;\n@group(2) @binding(${b++}) var ${n}_s: sampler_comparison;\n`; }
    }
    h += 'struct VIn {\n' + attrs.map((a, i) => `  @location(${i}) ${a[0]}: ${a[1]},`).join('\n') + '\n  @builtin(vertex_index) vid: u32,\n  @builtin(instance_index) iid: u32,\n}\n';
    h += 'struct VOut {\n  @builtin(position) clip: vec4f,\n' + vary.map(([n, t], i) => `  @location(${i}) ${n}: ${t},`).join('\n') + '\n}\n';
    h += 'struct FOut {\n  @location(0) color: vec4f,\n}\n';
    const body = sslToWgsl(lib + '\n' + desc.vs + '\n' + (desc.fs || ''));
    let e = '@vertex fn vs_main(a: VIn) -> VOut { return vert(a); }\n';
    if (desc.fs) e += '@fragment fn fs_main(v: VOut) -> FOut { return frag(v); }\n';
    return { code: h + body + '\n' + e };
  }
  // ---- GLSL
  const common = GLSL_PRELUDE + 'layout(std140) uniform GlobalsBlock {\n' + GLOBALS.map(([n, t]) => '  ' + SSL_TYPES[t] + ' ' + n + ';').join('\n') + '\n} U;\n'
    + (ufields.length ? sslToGlsl(mStruct) + '\nuniform MatU M;\n' : '')
    + texs.map(([n, k]) => 'uniform ' + (k === 'shadow' ? 'sampler2DShadow ' : 'sampler2D ') + n + ';').join('\n') + '\n'
    + 'struct VIn {\n' + attrs.map(a => '  ' + SSL_TYPES[a[1]] + ' ' + a[0] + ';').join('\n') + '\n  uint vid;\n  uint iid;\n};\n'
    + 'struct VOut {\n  vec4 clip;\n' + vary.map(([n, t]) => '  ' + SSL_TYPES[t] + ' ' + n + ';').join('\n') + '\n};\n'
    + 'struct FOut {\n  vec4 color;\n};\n';
  const glib = sslToGlsl(lib);
  const vsrc = common + attrs.map((a, i) => `layout(location=${i}) in ${SSL_TYPES[a[1]]} a_${a[0]};`).join('\n') + '\n'
    + vary.map(([n, t]) => `out ${SSL_TYPES[t]} v_${n};`).join('\n') + '\nuniform float u_ysign;\n' + glib + '\n' + sslToGlsl(desc.vs) + '\n'
    + 'void main() {\n  VIn a;\n' + attrs.map(a => `  a.${a[0]} = a_${a[0]};`).join('\n') + '\n  a.vid = uint(gl_VertexID); a.iid = uint(gl_InstanceID);\n  VOut v = vert(a);\n'
    + vary.map(([n]) => `  v_${n} = v.${n};`).join('\n') + '\n  gl_Position = vec4(v.clip.x, v.clip.y * u_ysign, v.clip.z * 2.0 - v.clip.w, v.clip.w);\n}\n';
  const fsrc = common + vary.map(([n, t]) => `in ${SSL_TYPES[t]} v_${n};`).join('\n') + '\nlayout(location=0) out vec4 o_color;\n'
    + 'uniform float u_ysign;\nuniform float u_fbh;\n'
    + (desc.fs ? glib + '\n' + sslToGlsl(desc.fs) + '\nvoid main() {\n  VOut v;\n  v.clip = gl_FragCoord;\n  if (u_ysign > 0.0) { v.clip.y = u_fbh - v.clip.y; }\n' + vary.map(([n]) => `  v.${n} = v_${n};`).join('\n') + '\n  FOut o = frag(v);\n  o_color = o.color;\n}\n'
      : 'void main() { o_color = vec4(0.0); }\n');
  return { vs: vsrc, fs: fsrc };
}

function uniformLayout(desc) { const f = []; let off = 0; for (const [n, t] of Object.entries(desc.uniforms || {})) { f.push({ name: n, type: t, off, size: SSL_SIZE[t] }); off += SSL_SIZE[t]; } return { fields: f, size: off }; }
function packUniforms(layout, obj, out) {
  for (const f of layout.fields) { const v = obj[f.name]; if (v === undefined) continue; if (typeof v === 'number') { out[f.off] = v; out[f.off + 1] = 0; out[f.off + 2] = 0; out[f.off + 3] = 0; } else { for (let i = 0; i < f.size; i++) out[f.off + i] = v[i] || 0; } }
}

let _gfxId = 1;

// ================================================================= WebGL2 backend
// opt.xr: the context may be handed to a WebXR session later (21_xr.js): asked for as compatible from the start, so nothing is rebuilt
function createGL(canvas, opt = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, xrCompatible: !!opt.xr });
  if (!gl) return null;
  const extF = gl.getExtension('EXT_color_buffer_float'), extHF = gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  const caps = { backend: 'webgl2', hdr: !!(extF || extHF), r32fTarget: !!extF, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), name: 'WebGL2' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'); caps.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'webgl2';
  const F = {
    rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT], r32f: [gl.R32F, gl.RED, gl.FLOAT], rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT],
    r8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE], depth: [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT],
  };
  const gbuf = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, gbuf); gl.bufferData(gl.UNIFORM_BUFFER, GLOBALS_SIZE * 4, gl.DYNAMIC_DRAW); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, gbuf);
  let curProg = null, curTarget = undefined, ysign = 1, st = {};
  const vaos = new Map();
  const g = {
    caps, gl,
    texture(o) {
      const t = { id: _gfxId++, w: o.w, h: o.h, format: o.format, filter: o.filter || 'linear', wrap: o.wrap || 'clamp', mips: !!o.mips, compare: !!o.compare, levels: o.mips ? (Math.floor(Math.log2(Math.max(o.w, o.h))) + 1) : 1 };
      const f = F[o.format]; t.gl = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.gl);
      gl.texStorage2D(gl.TEXTURE_2D, t.levels, f[0], o.w, o.h);
      const lin = t.filter === 'linear';
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.mips ? (lin ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST) : (lin ? gl.LINEAR : gl.NEAREST));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
      const w = t.wrap === 'repeat' ? gl.REPEAT : t.wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
      const wy = o.wrapY ? (o.wrapY === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE) : w;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wy);
      if (t.compare) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); }
      if (o.data) g.updateTexture(t, 0, 0, o.w, o.h, o.data);
      return t;
    },
    updateTexture(t, x, y, w, h, data) {
      const f = F[t.format]; gl.bindTexture(gl.TEXTURE_2D, t.gl); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, f[1], f[2], data);
    },
    genMips(t) { gl.bindTexture(gl.TEXTURE_2D, t.gl); gl.generateMipmap(gl.TEXTURE_2D); },
    destroyTexture(t) { if (t && t.gl) { gl.deleteTexture(t.gl); t.gl = null; } },
    target(o) {   // { color: tex|null, depth: tex|null }
      const T = { id: _gfxId++, color: o.color || null, depth: o.depth || null, w: (o.color || o.depth).w, h: (o.color || o.depth).h, level: o.level || 0 };
      T.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
      if (T.color) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.color.gl, T.level);
      if (T.depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, T.depth.gl, 0);
      if (!T.color) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
      if (T.level) { T.w = Math.max(1, T.w >> T.level); T.h = Math.max(1, T.h >> T.level); }
      const s = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (s !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete 0x' + s.toString(16) + ' fmt ' + (T.color && T.color.format));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); curTarget = undefined;
      return T;
    },
    destroyTarget(T) { if (T && T.fb) { gl.deleteFramebuffer(T.fb); T.fb = null; } },
    buffer(data, kind, dynamic) {
      const b = { id: _gfxId++, kind, size: data.byteLength }; b.gl = gl.createBuffer(); const tgt = kind === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
      gl.bindVertexArray(null); gl.bindBuffer(tgt, b.gl); gl.bufferData(tgt, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); return b;
    },
    updateBuffer(b, byteOffset, data) { const tgt = b.kind === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER; gl.bindVertexArray(null); gl.bindBuffer(tgt, b.gl); gl.bufferSubData(tgt, byteOffset, data); },
    destroyBuffer(b) { if (b && b.gl) { gl.deleteBuffer(b.gl); b.gl = null; } },
    pipeline(desc) {
      const src = buildShader(desc, 'glsl');
      const mk = (type, s) => { const sh = gl.createShader(type); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
      const vs = mk(gl.VERTEX_SHADER, src.vs), fs = mk(gl.FRAGMENT_SHADER, src.fs), prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      const P = { id: _gfxId++, desc, prog, vs, fs, src, layout: uniformLayout(desc), ready: false, name: desc.name };
      P.ubuf = new Float32Array(Math.max(4, P.layout.size));
      return P;
    },
    release() { g.hold = null; return Promise.resolve(); },
    isReady: () => true,
    finishPipeline(P) {
      if (P.ready) return; const prog = P.prog;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const vl = gl.getShaderInfoLog(P.vs), fl = gl.getShaderInfoLog(P.fs), pl = gl.getProgramInfoLog(prog);
        const err = new Error('GLSL [' + P.name + ']\nVS: ' + vl + '\nFS: ' + fl + '\nLINK: ' + pl); err.vs = numberLines(P.src.vs); err.fs = numberLines(P.src.fs); throw err;
      }
      gl.useProgram(prog); curProg = null;
      const bi = gl.getUniformBlockIndex(prog, 'GlobalsBlock'); if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(prog, bi, 0);
      P.uy = gl.getUniformLocation(prog, 'u_ysign'); P.ufbh = gl.getUniformLocation(prog, 'u_fbh');
      P.ulocs = P.layout.fields.map(f => gl.getUniformLocation(prog, 'M.' + f.name));
      P.texNames = Object.keys(P.desc.textures || {});
      P.texNames.forEach((n, i) => { const l = gl.getUniformLocation(prog, n); if (l) gl.uniform1i(l, i); });
      P.ready = true;
    },
    setGlobals(f32) { gl.bindBuffer(gl.UNIFORM_BUFFER, gbuf); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, f32); },
    beginFrame() { },
    // (g.screen: a target that stands in for the canvas. In the headset each eye's finished picture is drawn into a texture of its own
    // first, and only then handed to the headset's framebuffer: 21_xr.js)
    beginPass(T, o = {}) {
      if (!T && g.screen) T = g.screen;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T ? T.fb : null); curTarget = T; ysign = T ? -1 : 1;
      const w = T ? T.w : canvas.width, h = T ? T.h : canvas.height; gl.viewport(0, 0, w, h); g.passW = w; g.passH = h;
      gl.frontFace(T ? gl.CW : gl.CCW);
      let bits = 0;
      if (o.color) { gl.colorMask(true, true, true, true); st.cm = true; gl.clearColor(o.color[0], o.color[1], o.color[2], o.color[3]); bits |= gl.COLOR_BUFFER_BIT; }
      if (o.depth != null) { gl.depthMask(true); st.dw = true; gl.clearDepth(o.depth); bits |= gl.DEPTH_BUFFER_BIT; }
      if (bits) gl.clear(bits);
      curProg = null;
    },
    endPass() { },
    // a framebuffer this layer did not make (the headset's), and a rectangle of it: drawn into as the canvas is, the right way up
    beginRaw(fb, x, y, w, h) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); curTarget = null; ysign = 1; gl.viewport(x, y, w, h); g.passW = w; g.passH = h;
      gl.frontFace(gl.CCW); curProg = null;
    },
    draw(P, d) {
      if (!P.ready) g.finishPipeline(P);
      const desc = P.desc;
      if (curProg !== P) { gl.useProgram(P.prog); curProg = P; gl.uniform1f(P.uy, ysign); if (P.ufbh) gl.uniform1f(P.ufbh, g.passH); }
      // state
      const blend = desc.blend || 'none';
      if (st.blend !== blend) {
        st.blend = blend;
        if (blend === 'none') gl.disable(gl.BLEND); else {
          gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
          if (blend === 'alpha') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          else if (blend === 'premul') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
          else if (blend === 'add') gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
          else if (blend === 'mul') gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ZERO, gl.ONE);
          else if (blend === 'add4') gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);           // accumulate all four channels
          else if (blend === 'trans') gl.blendFuncSeparate(gl.ONE, gl.SRC_ALPHA, gl.ZERO, gl.ONE);  // src = (in-scattered light, transmittance)
        }
      }
      const dt = desc.depthTest !== false && !!(curTarget && curTarget.depth), dw = dt && desc.depthWrite !== false, df = desc.depthFunc || 'less';
      if (st.dt !== dt) { st.dt = dt; dt ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST); }
      if (st.dw !== dw) { st.dw = dw; gl.depthMask(dw); }
      if (st.df !== df) { st.df = df; gl.depthFunc(df === 'lequal' ? gl.LEQUAL : df === 'always' ? gl.ALWAYS : df === 'equal' ? gl.EQUAL : gl.LESS); }
      const cull = desc.cull || 'back';
      if (st.cull !== cull) { st.cull = cull; if (cull === 'none') gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(cull === 'front' ? gl.FRONT : gl.BACK); } }
      const bias = desc.depthBias || 0;
      if (st.bias !== bias) { st.bias = bias; if (bias) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(desc.depthBiasSlope || 2, bias); } else gl.disable(gl.POLYGON_OFFSET_FILL); }
      const cm = desc.colorMask === false ? false : true;
      if (st.cm !== cm) { st.cm = cm; gl.colorMask(cm, cm, cm, cm); }
      // uniforms
      if (d.u) {
        packUniforms(P.layout, d.u, P.ubuf);
        for (let i = 0; i < P.layout.fields.length; i++) { const f = P.layout.fields[i], l = P.ulocs[i]; if (!l) continue; if (f.size === 16) gl.uniformMatrix4fv(l, false, P.ubuf, f.off, 16); else gl.uniform4fv(l, P.ubuf, f.off, 4); }
      }
      // textures
      for (let i = 0; i < P.texNames.length; i++) { const t = d.tex && d.tex[P.texNames[i]]; if (!t) throw new Error('missing texture ' + P.texNames[i] + ' for ' + P.name); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t.gl); }
      // vertex state
      const vb = d.vb || [], key = P.id + ':' + vb.map(b => b.id).join(',') + ':' + (d.ib ? d.ib.id : 0);
      let vao = vaos.get(key);
      if (!vao) {
        vao = gl.createVertexArray(); gl.bindVertexArray(vao); let loc = 0;
        (desc.buffers || []).forEach((b, bi) => {
          gl.bindBuffer(gl.ARRAY_BUFFER, vb[bi].gl); const stride = b.attrs.reduce((s, a) => s + SSL_SIZE[a[1]], 0) * 4; let off = 0;
          for (const a of b.attrs) { const n = SSL_SIZE[a[1]]; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); if (b.instanced) gl.vertexAttribDivisor(loc, 1); off += n * 4; loc++; }
        });
        if (d.ib) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ib.gl);
        vaos.set(key, vao); vao.base = 0;
      } else gl.bindVertexArray(vao);
      // d.base: the first instance to read (WebGL2 has no first instance, so the instanced attributes are pointed that far into their buffers)
      const base = d.base || 0;
      if (vao.base !== base) {
        vao.base = base; let loc = 0;
        (desc.buffers || []).forEach((b, bi) => {
          const stride = b.attrs.reduce((s, a) => s + SSL_SIZE[a[1]], 0) * 4; let off = b.instanced ? base * stride : 0;
          if (b.instanced) gl.bindBuffer(gl.ARRAY_BUFFER, vb[bi].gl);
          for (const a of b.attrs) { const n = SSL_SIZE[a[1]]; if (b.instanced) gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); off += n * 4; loc++; }
        });
      }
      const mode = desc.topology === 'strip' ? gl.TRIANGLE_STRIP : desc.topology === 'lines' ? gl.LINES : gl.TRIANGLES, inst = d.instances == null ? 1 : d.instances;
      if (inst <= 0 || d.count <= 0) return;
      if (d.ib) gl.drawElementsInstanced(mode, d.count, gl.UNSIGNED_INT, (d.first || 0) * 4, inst); else gl.drawArraysInstanced(mode, d.first || 0, d.count, inst);
    },
    endFrame() { },
    resize() { },
    async capture() {
      const w = canvas.width, h = canvas.height, raw = new Uint8Array(w * h * 4), out = new Uint8ClampedArray(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      return { w, h, data: out };
    },
    lost: false,
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); g.lost = true; });
  return g;
}

// ================================================================= WebGPU backend
async function createGPU(canvas, opt = {}) {
  if (!navigator.gpu) return null;
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { }
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  // offscreen mode (tests): never touch the canvas swap chain, render the final pass into a texture that capture() reads back
  const offscreen = !!opt.offscreen; let ctx = null, capTex = null;
  const canvasFormat = offscreen ? 'rgba8unorm' : navigator.gpu.getPreferredCanvasFormat();
  if (!offscreen) { ctx = canvas.getContext('webgpu'); if (!ctx) return null; ctx.configure({ device, format: canvasFormat, alphaMode: 'opaque' }); }
  const held = [];
  const caps = { backend: 'webgpu', hdr: true, r32fTarget: true, maxTex: device.limits.maxTextureDimension2D, name: 'WebGPU', renderer: (adapter.info && (adapter.info.description || adapter.info.vendor + ' ' + adapter.info.architecture)) || 'webgpu' };
  const F = { rgba8: 'rgba8unorm', rgba16f: 'rgba16float', r32f: 'r32float', rgba32f: 'rgba32float', r8: 'r8unorm', depth: 'depth24plus', canvas: canvasFormat };
  const BPP = { rgba8: 4, rgba16f: 8, r32f: 4, rgba32f: 16, r8: 1 };
  const align = device.limits.minUniformBufferOffsetAlignment || 256;
  const ARENA = 1 << 20;
  const arena = device.createBuffer({ size: ARENA, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const arenaCPU = new Float32Array(ARENA / 4); let arenaOff = 0;
  const gbuf = device.createBuffer({ size: Math.ceil(GLOBALS_SIZE * 4 / 16) * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const gLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
  const gGroup = device.createBindGroup({ layout: gLayout, entries: [{ binding: 0, resource: { buffer: gbuf } }] });
  const emptyLayout = device.createBindGroupLayout({ entries: [] }), emptyGroup = device.createBindGroup({ layout: emptyLayout, entries: [] });
  const samplers = new Map();
  const sampler = (filter, wrap, wrapY, compare, mips) => {
    const k = filter + wrap + wrapY + compare + mips; let s = samplers.get(k);
    if (!s) {
      const am = w => w === 'repeat' ? 'repeat' : w === 'mirror' ? 'mirror-repeat' : 'clamp-to-edge';
      const o = { magFilter: filter, minFilter: filter, mipmapFilter: mips && filter === 'linear' ? 'linear' : 'nearest', addressModeU: am(wrap), addressModeV: am(wrapY || wrap) };
      if (compare) o.compare = 'less-equal'; s = device.createSampler(o); samplers.set(k, s);
    } return s;
  };
  let enc = null, pass = null, curTarget = null, curPipe = null, errors = [];
  const dead = [];
  const texGroups = new Map();
  const mipPipes = new Map();
  const g = {
    caps, device,
    texture(o) {
      const t = { id: _gfxId++, w: o.w, h: o.h, format: o.format, filter: o.filter || 'linear', wrap: o.wrap || 'clamp', wrapY: o.wrapY, mips: !!o.mips, compare: !!o.compare, levels: o.mips ? (Math.floor(Math.log2(Math.max(o.w, o.h))) + 1) : 1 };
      t.gpu = device.createTexture({ size: [o.w, o.h], format: F[o.format], mipLevelCount: t.levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | (o.format === 'depth' ? 0 : GPUTextureUsage.COPY_DST) });
      t.view = t.gpu.createView(); t.sampler = sampler(t.filter === 'linear' ? 'linear' : 'nearest', t.wrap, t.wrapY || t.wrap, t.compare, t.mips);
      if (o.data) g.updateTexture(t, 0, 0, o.w, o.h, o.data);
      return t;
    },
    updateTexture(t, x, y, w, h, data) {
      device.queue.writeTexture({ texture: t.gpu, origin: [x, y] }, data, { bytesPerRow: w * BPP[t.format], rowsPerImage: h }, [w, h]);
    },
    genMips(t) {
      let P = mipPipes.get(t.format);
      if (!P) {
        const mod = device.createShaderModule({ code: `@group(0) @binding(0) var t: texture_2d<f32>; @group(0) @binding(1) var s: sampler;
          struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f }
          @vertex fn vs(@builtin(vertex_index) i: u32) -> VO { let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u)); var o: VO; o.p = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0); o.uv = uv; return o; }
          @fragment fn fs(v: VO) -> @location(0) vec4f { return textureSampleLevel(t, s, v.uv, 0.0); }` });
        P = device.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: F[t.format] }] } });
        mipPipes.set(t.format, P);
      }
      // inside a frame the mips must be built after the passes already recorded this frame, so they go into the frame's own encoder
      const own = !enc, e = enc || device.createCommandEncoder(), smp = sampler('linear', 'clamp', 'clamp', false, false);
      for (let l = 1; l < t.levels; l++) {
        const bg = device.createBindGroup({ layout: P.getBindGroupLayout(0), entries: [{ binding: 0, resource: t.gpu.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) }, { binding: 1, resource: smp }] });
        const p = e.beginRenderPass({ colorAttachments: [{ view: t.gpu.createView({ baseMipLevel: l, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store' }] });
        p.setPipeline(P); p.setBindGroup(0, bg); p.draw(3); p.end();
      }
      if (own) device.queue.submit([e.finish()]);
    },
    // (a texture dropped mid-frame may still be named by commands waiting in the encoder: it is destroyed once they are submitted)
    destroyTexture(t) { if (t && t.gpu) { if (enc) dead.push(t.gpu); else t.gpu.destroy(); t.gpu = null; texGroups.clear(); } },
    target(o) {
      const T = { id: _gfxId++, color: o.color || null, depth: o.depth || null, w: (o.color || o.depth).w, h: (o.color || o.depth).h, level: o.level || 0 };
      if (T.color) T.cview = T.level ? T.color.gpu.createView({ baseMipLevel: T.level, mipLevelCount: 1 }) : T.color.gpu.createView({ baseMipLevel: 0, mipLevelCount: 1 });
      if (T.depth) T.dview = T.depth.gpu.createView();
      if (T.level) { T.w = Math.max(1, T.w >> T.level); T.h = Math.max(1, T.h >> T.level); }
      return T;
    },
    destroyTarget() { },
    buffer(data, kind, dynamic) {
      const size = Math.ceil(data.byteLength / 4) * 4;
      const b = { id: _gfxId++, kind, size }; b.gpu = device.createBuffer({ size: Math.max(4, size), usage: (kind === 'index' ? GPUBufferUsage.INDEX : GPUBufferUsage.VERTEX) | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(b.gpu, 0, data.buffer, data.byteOffset, data.byteLength); return b;
    },
    updateBuffer(b, byteOffset, data) { device.queue.writeBuffer(b.gpu, byteOffset, data.buffer, data.byteOffset, data.byteLength); },
    destroyBuffer(b) { if (b && b.gpu) { b.gpu.destroy(); b.gpu = null; } },
    // g.hold(name): while it is set (at start-up), a pipeline it says yes to is only noted, not compiled: what the first picture does not
    // need waits, so that what it does need is not queued behind it. g.release() compiles the ones held, in the order they were asked for.
    // A draw with a pipeline not compiled yet draws nothing (see draw), which is how the rest of the game already treats a pipeline in flight
    pipeline(desc, P0) {
      if (!P0 && g.hold && g.hold(desc.name)) { const P = { id: _gfxId++, desc, layout: uniformLayout(desc), ready: false, name: desc.name, held: true }; P.ubuf = new Float32Array(Math.max(4, P.layout.size)); P.wait = new Promise(r => { P.go = r; }); held.push(P); return P; }
      const src = buildShader(desc, 'wgsl');
      const P = P0 || { id: _gfxId++, desc, layout: uniformLayout(desc), ready: false, name: desc.name }; P.src = src; P.held = false;
      P.ubuf = P.ubuf || new Float32Array(Math.max(4, P.layout.size));
      device.pushErrorScope('validation');
      const mod = device.createShaderModule({ code: src.code });
      P.mod = mod;
      const hasU = P.layout.size > 0;
      P.uLayout = hasU ? device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: P.layout.size * 4 } }] }) : emptyLayout;
      P.uGroup = hasU ? device.createBindGroup({ layout: P.uLayout, entries: [{ binding: 0, resource: { buffer: arena, size: P.layout.size * 4 } }] }) : emptyGroup;
      const te = []; let b = 0; P.texNames = Object.keys(desc.textures || {}); P.texKinds = Object.values(desc.textures || {});
      const vis = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
      for (const k of P.texKinds) {
        if (k === '2d') { te.push({ binding: b++, visibility: vis, texture: { sampleType: 'float' } }); te.push({ binding: b++, visibility: vis, sampler: { type: 'filtering' } }); }
        else if (k === 'fetch') te.push({ binding: b++, visibility: vis, texture: { sampleType: 'unfilterable-float' } });
        else if (k === 'depth') te.push({ binding: b++, visibility: vis, texture: { sampleType: 'depth' } });
        else if (k === 'shadow') { te.push({ binding: b++, visibility: vis, texture: { sampleType: 'depth' } }); te.push({ binding: b++, visibility: vis, sampler: { type: 'comparison' } }); }
      }
      P.tLayout = device.createBindGroupLayout({ entries: te });
      const layout = device.createPipelineLayout({ bindGroupLayouts: [gLayout, P.uLayout, P.tLayout] });
      let loc = 0; const buffers = (desc.buffers || []).map(bd => {
        let off = 0; const attributes = bd.attrs.map(a => { const n = SSL_SIZE[a[1]]; const r = { shaderLocation: loc++, offset: off, format: n === 1 ? 'float32' : 'float32x' + n }; off += n * 4; return r; });
        return { arrayStride: off, stepMode: bd.instanced ? 'instance' : 'vertex', attributes };
      });
      const blend = desc.blend || 'none'; let bl;
      if (blend === 'alpha') bl = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
      else if (blend === 'premul') bl = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
      else if (blend === 'add') bl = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
      else if (blend === 'mul') bl = { color: { srcFactor: 'dst', dstFactor: 'zero' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
      else if (blend === 'add4') bl = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
      else if (blend === 'trans') bl = { color: { srcFactor: 'one', dstFactor: 'src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
      const pd = { layout, vertex: { module: mod, entryPoint: 'vs_main', buffers }, primitive: { topology: desc.topology === 'strip' ? 'triangle-strip' : desc.topology === 'lines' ? 'line-list' : 'triangle-list', cullMode: desc.cull || 'back', frontFace: 'ccw' } };
      const cf = desc.colorFormat === undefined ? 'rgba16f' : desc.colorFormat;
      if (cf) { const tg = { format: F[cf] }; if (bl) tg.blend = bl; if (desc.colorMask === false) tg.writeMask = 0; pd.fragment = { module: mod, entryPoint: 'fs_main', targets: [tg] }; }
      else if (desc.fs) pd.fragment = { module: mod, entryPoint: 'fs_main', targets: [] };      // depth-only with a fragment stage (alpha-tested shadows)
      if (desc.depth !== false && desc.depthTarget !== false) {
        const dt = desc.depthTest !== false;
        pd.depthStencil = { format: 'depth24plus', depthWriteEnabled: dt && desc.depthWrite !== false, depthCompare: !dt ? 'always' : desc.depthFunc === 'lequal' ? 'less-equal' : desc.depthFunc === 'always' ? 'always' : desc.depthFunc === 'equal' ? 'equal' : 'less' };
        if (desc.depthBias) { pd.depthStencil.depthBias = Math.round(desc.depthBias); pd.depthStencil.depthBiasSlopeScale = desc.depthBiasSlope || 2; }
      }
      P.pd = pd;
      P.promise = device.createRenderPipelineAsync(pd).then(p => { P.gpu = p; }, e => { P.err = e; });
      P.scope = device.popErrorScope();
      return P;
    },
    release() {
      g.hold = null; const L = held.splice(0); for (const P of L) { g.pipeline(P.desc, P); P.go(); }
      return Promise.all(L.map(P => g.finishPipelineAsync(P).catch(e => console.warn('pipeline', P.name, e))));
    },
    isReady: P => !!P.gpu,
    async finishPipelineAsync(P) {
      if (P.held) await P.wait;      // (held back at start-up: compiled once g.release() is called)
      if (P.ready) return;
      const info = await P.mod.getCompilationInfo(); const errs = info.messages.filter(m => m.type === 'error');
      await P.promise; const se = await P.scope;
      if (errs.length || P.err || se) {
        const err = new Error('WGSL [' + P.name + ']\n' + errs.map(m => m.lineNum + ':' + m.linePos + ' ' + m.message).join('\n') + (P.err ? '\n' + P.err.message : '') + (se ? '\n' + se.message : ''));
        err.vs = numberLines(P.src.code); throw err;
      }
      P.ready = true;
    },
    finishPipeline(P) { if (!P.gpu) throw new Error('pipeline not ready: ' + P.name); P.ready = true; },
    setGlobals(f32) { device.queue.writeBuffer(gbuf, 0, f32.buffer, f32.byteOffset, GLOBALS_SIZE * 4); },
    beginFrame() { enc = device.createCommandEncoder(); arenaOff = 0; g.canvasView = null; },
    beginPass(T, o = {}) {
      const rp = { colorAttachments: [] };
      if (!T) {
        if (!g.canvasView) {
          if (offscreen) {
            if (!capTex || capTex.width !== canvas.width || capTex.height !== canvas.height) { if (capTex) capTex.destroy(); capTex = device.createTexture({ size: [canvas.width, canvas.height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC }); }
            g.canvasView = capTex.createView();
          } else g.canvasView = ctx.getCurrentTexture().createView();
        }
        rp.colorAttachments.push({ view: g.canvasView, loadOp: o.color ? 'clear' : 'load', storeOp: 'store', clearValue: o.color || [0, 0, 0, 1] }); g.passW = canvas.width; g.passH = canvas.height;
      } else {
        if (T.color) rp.colorAttachments.push({ view: T.cview, loadOp: o.color ? 'clear' : 'load', storeOp: 'store', clearValue: o.color || [0, 0, 0, 0] });
        if (T.depth) rp.depthStencilAttachment = { view: T.dview, depthLoadOp: o.depth != null ? 'clear' : 'load', depthStoreOp: 'store', depthClearValue: o.depth != null ? o.depth : 1 };
        g.passW = T.w; g.passH = T.h;
      }
      pass = enc.beginRenderPass(rp); curTarget = T; curPipe = null; pass.setBindGroup(0, gGroup);
    },
    endPass() { pass.end(); pass = null; },
    draw(P, d) {
      if (!P.gpu) { if (P.err) throw P.err; return; }
      const inst = d.instances == null ? 1 : d.instances; if (inst <= 0 || d.count <= 0) return;
      if (curPipe !== P) { pass.setPipeline(P.gpu); curPipe = P; }
      if (P.layout.size) {
        if (d.u) packUniforms(P.layout, d.u, P.ubuf);
        const n = P.layout.size; if ((arenaOff + n) * 4 > ARENA) throw new Error('uniform arena overflow');
        arenaCPU.set(P.ubuf.subarray(0, n), arenaOff); pass.setBindGroup(1, P.uGroup, [arenaOff * 4]);
        arenaOff = Math.ceil((arenaOff + n) * 4 / align) * align / 4;
      } else pass.setBindGroup(1, emptyGroup);
      let key = P.id + ''; for (const n of P.texNames) { const t = d.tex && d.tex[n]; if (!t) throw new Error('missing texture ' + n + ' for ' + P.name); key += ':' + t.id; }
      let tg = texGroups.get(key);
      if (!tg) {
        const entries = []; let b = 0;
        P.texNames.forEach((n, i) => { const t = d.tex[n], k = P.texKinds[i]; entries.push({ binding: b++, resource: t.view }); if (k === '2d' || k === 'shadow') entries.push({ binding: b++, resource: t.sampler }); });
        tg = device.createBindGroup({ layout: P.tLayout, entries }); texGroups.set(key, tg);
        if (texGroups.size > 4000) texGroups.clear();
      }
      pass.setBindGroup(2, tg);
      const vb = d.vb || []; for (let i = 0; i < vb.length; i++) pass.setVertexBuffer(i, vb[i].gpu);
      if (d.ib) { pass.setIndexBuffer(d.ib.gpu, 'uint32'); pass.drawIndexed(d.count, inst, d.first || 0, 0, d.base || 0); } else pass.draw(d.count, inst, d.first || 0, d.base || 0);
    },
    endFrame() { device.queue.writeBuffer(arena, 0, arenaCPU.buffer, 0, Math.min(ARENA, Math.ceil(arenaOff * 4 / 4) * 4 + 256)); device.queue.submit([enc.finish()]); enc = null; for (const d of dead) d.destroy(); dead.length = 0; },
    resize() { texGroups.clear(); },
    async capture() {
      if (!capTex) return null; const w = capTex.width, h = capTex.height, bpr = Math.ceil(w * 4 / 256) * 256;
      const buf = device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const e = device.createCommandEncoder(); e.copyTextureToBuffer({ texture: capTex }, { buffer: buf, bytesPerRow: bpr }, [w, h]); device.queue.submit([e.finish()]);
      await buf.mapAsync(GPUMapMode.READ); const src = new Uint8Array(buf.getMappedRange()), out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) out.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
      buf.unmap(); buf.destroy(); return { w, h, data: out };
    },
    lost: false,
  };
  device.lost.then(() => { g.lost = true; });
  device.addEventListener && device.addEventListener('uncapturederror', e => { if (errors.length < 8) { errors.push(e.error.message); console.error('[gpu]', e.error.message); } g.lastError = e.error.message; });
  return g;
}

// fullscreen-triangle vertex stage shared by every post pass
const VS_FULLSCREEN = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let uv: vec2f = vec2f(f32((a.vid << 1u) & 2u), f32(a.vid & 2u));
  v.clip = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  v.uv = uv;
  return v;
}`;
