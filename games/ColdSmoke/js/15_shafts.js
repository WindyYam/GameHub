"use strict";
// ---------------------------------------------------------------- light in the air
// A thin layer of ice haze lies on the slope (denser in drifting wisps). Wherever the sun reaches it, it glows — hardest when you look
// toward the sun; wherever a tree, the skier or the mountain stands in the way, it stays dark. Marching each view ray through the same
// shadow map the snow uses turns that into beams between the trees. Low resolution, depth-aware upsample.
const Shafts = (() => {
  const S = { enabled: false, lamp: true, lampAir: 0.012, div: 2, range: 170, sigma: 0.0030, H0: 9, g: 0.80, wispScale: 0.085, wispLo: 0.28, wispHi: 1.55, drift: 1.6, gain: 1 };
  let gfx, pipeMarch, pipeBlur, pipeComp, tex, tgt, tex2, tgt2, lw = 0, lh = 0;
  S.init = function (g) {
    gfx = g;
    const fs = { buffers: [], varyings: { uv: 'vec2f' }, depth: false, depthTest: false, cull: 'none', vs: VS_FULLSCREEN };
    pipeMarch = gfx.pipeline(Object.assign({ name: 'shaftMarch', lib: [SL.common, SL.depth, SL.tnoise, SL.shadow, SL.tonemap],
      uniforms: { p: 'vec4f', q: 'vec4f', r: 'vec4f', s: 'vec4f' }, textures: { tDepth: 'depth', tShadow: 'shadow', tNoise: '2d', tSun: '2d' }, colorFormat: 'rgba16f', fs: SHAFT_MARCH_FS }, fs));
    pipeBlur = gfx.pipeline(Object.assign({ name: 'shaftBlur', lib: [SL.common], uniforms: { p: 'vec4f' }, textures: { tShaft: 'fetch' }, colorFormat: 'rgba16f', fs: SHAFT_BLUR_FS }, fs));
    pipeComp = gfx.pipeline(Object.assign({ name: 'shaftComposite', lib: [SL.common, SL.depth], uniforms: { p: 'vec4f' }, textures: { tShaft: 'fetch', tDepth: 'depth' }, blend: 'add', fs: SHAFT_COMP_FS }, fs));
    S.pipes = [pipeMarch, pipeBlur, pipeComp];
  };
  S.resize = function (w, h) {
    if (tgt) { gfx.destroyTarget(tgt); gfx.destroyTexture(tex); gfx.destroyTarget(tgt2); gfx.destroyTexture(tex2); }
    lw = Math.max(2, Math.ceil(w / S.div)); lh = Math.max(2, Math.ceil(h / S.div));
    tex = gfx.texture({ w: lw, h: lh, format: 'rgba16f', filter: 'nearest' }); tgt = gfx.target({ color: tex });
    tex2 = gfx.texture({ w: lw, h: lh, format: 'rgba16f', filter: 'nearest' }); tgt2 = gfx.target({ color: tex2 });
  };
  const wr = x => ((x % 256) + 256) % 256;
  // (the pass also carries the beam of the headlamp after dark; with the sun's own shafts switched off it runs for the lamp alone)
  const lampOn = () => S.lamp && Sky.lampK > 0.002;
  S.offscreen = function (R) {
    S.on = S.enabled || lampOn();
    if (!S.on) return;
    const o = R.origin, k = S.wispScale, t = R.time * S.drift * k, sb = Terrain.sunBinding(o, 3);
    gfx.beginPass(tgt, { color: [0, 0, 0, 0] });
    gfx.draw(pipeMarch, { u: { p: [S.range, 1 / S.H0, S.g, S.sigma * S.gain], q: [wr(o[0] * k - t * 1.0), wr(o[1] * k - t * 0.25), wr(o[2] * k - t * 0.45), k], r: [S.wispLo, S.wispHi, lampOn() ? S.lampAir : 0, S.enabled ? 1 : 0], s: sb.xf },
      tex: { tDepth: R.depth, tShadow: R.shadowTex, tNoise: Tex.noise, tSun: sb.tex }, count: 3 });
    gfx.endPass();
    // one pass of depth-aware smoothing takes the grain of the jittered march away
    gfx.beginPass(tgt2, { color: [0, 0, 0, 0] });
    gfx.draw(pipeBlur, { u: { p: [lw, lh, 0, 0] }, tex: { tShaft: tex }, count: 3 });
    gfx.endPass();
  };
  S.fx = function (R) {
    if (!S.on) return;
    gfx.draw(pipeComp, { u: { p: [lw, lh, S.div, 0] }, tex: { tShaft: tex2, tDepth: R.depth }, count: 3 });
  };
  return S;
})();

const SHAFT_MARCH_FS = `
// what stands under a point and toward the sun from it: (ground height, tangent of the mountain's horizon there, 1 / distance to that crest)
fn station(p: vec3f) -> vec3f { let s: vec4f = texLod(tSun, p.xz * M.s.x + M.s.yz, 0.0); return vec3f(s.z + ${HREF_SLOPE.toFixed(4)} * p.z + M.s.w, s.x, s.y); }
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let fp: vec2i = clamp(vec2i(v.uv * U.res.xy), vec2i(0, 0), vec2i(U.res.xy) - vec2i(1, 1));
  let zf: f32 = linDepth(texFetchD(tDepth, fp, 0));
  let ndc: vec2f = vec2f(v.uv.x * 2.0 - 1.0, 1.0 - v.uv.y * 2.0);
  let dv: vec3f = screenRay(ndc);
  let len: f32 = length(dv); let d: vec3f = dv / len;
  var tmax: f32 = min(zf * len, M.p.x);
  let mu: f32 = dot(d, U.sunDir.xyz);
  let tanE: f32 = U.sunDir.y / max(length(U.sunDir.xz), 1e-3);
  // (the march's steps are offset per pixel by a pattern. With the owner's 'tgrain' b (U.lampDir.w = 1, 14_trees.js) the pattern is held still:
  // moved every frame with nothing to average it over time, the beams between the trees shimmered)
  let jit: f32 = ign(v.clip.xy + 5.588238 * (U.origin.w - 64.0 * floor(U.origin.w / 64.0)) * (1.0 - U.lampDir.w));
  var g0: vec3f = station(U.camPos.xyz);
  // a ray that climbs out of the layer has nothing more to find up there: stop where it leaves, and spend every step inside
  let top: f32 = 4.6 / M.p.y; let h0: f32 = max(U.camPos.y - g0.x, 0.0);
  let hE: f32 = U.camPos.y + d.y * tmax - station(U.camPos.xyz + d * tmax).x;
  if (hE > top) { tmax *= clamp((top - h0) / max(hE - h0, 1e-3), 0.02, 1.0); }
  var acc: f32 = 0.0; var t0: f32 = 0.0;
  // steps crowd toward the camera (t = tmax u^2): beams are finest where they are nearest
  if (M.r.w > 0.5) { for (var k: i32 = 0; k < 6; k++) {
    let t1: f32 = tmax * sq(f32(k + 1) / 6.0);
    let g1: vec3f = station(U.camPos.xyz + d * t1);
    for (var i: i32 = 0; i < 4; i++) {
      let u: f32 = (f32(k) + (f32(i) + jit) * 0.25) / 6.0;
      let t: f32 = tmax * u * u;
      let p: vec3f = U.camPos.xyz + d * t;
      let g: vec3f = mix(g0, g1, (t - t0) / max(t1 - t0, 1e-4));
      let hgt: f32 = max(p.y - g.x, 0.0);
      let mtn: f32 = smoothstep(-0.010, 0.022, tanE - g.y + hgt * g.z);
      let wn: f32 = tnoise3(p * M.q.w + M.q.xyz);
      let dens: f32 = exp(-hgt * M.p.y) * (M.r.x + M.r.y * smoothstep(0.30, 0.78, wn));
      acc += shadowFast(p, 0.0006) * mtn * dens * u;
    }
    g0 = g1; t0 = t1;
  } }
  let ph: f32 = 0.86 * hg(mu, M.p.z) + 0.14 * hg(mu, 0.35);
  var air: vec3f = U.sunCol.rgb * (PI * ph * M.p.w * tmax * (2.0 / 24.0) * acc);
  // after dark the same haze (and the fine snow falling through it) shows the beam of the headlamp. The steps are spaced by the angle they
  // subtend at the lamp, so they crowd where its light is strongest and the rest is integrated exactly
  if (U.lamp.w > 0.0 && M.r.z > 0.0) {
    let rel: vec3f = U.lamp.xyz - U.camPos.xyz; let tc: f32 = dot(rel, d);
    let D: f32 = sqrt(max(dot(rel, rel) - tc * tc, 0.0) + 30.0);
    let nearL: f32 = smoothstep(2.6, 1.0, length(rel)) * saturate(M.r.z / 0.012 - 1.0);      // (heavy snow raises lampAir over 0.012: then, lamp at the lens, its first metres of air are thinned: a cone ahead, not a ball)
    // (a lens in front of the skier, the lamp turned toward it: the beam's first metres lie between the lens and the figure, and drawn there they
    // fogged the whole figure. There the march starts just past the lamp: the beam shows beyond the skier, the figure is seen clear and the lamp is
    // a small bright point on the helmet. With the lens at the lamp, or behind it, nothing changes)
    let tEnd: f32 = min(zf * len, 80.0);
    let facing: f32 = smoothstep(0.05, 0.45, dot(U.lampDir.xyz, -rel) / max(length(rel), 1e-3)) * smoothstep(1.2, 2.2, length(rel));
    let tS: f32 = min(facing * max(tc + 0.6, 0.0), tEnd);
    let th0: f32 = atan2(tS - tc, D); let th1: f32 = atan2(tEnd - tc, D);
    var a: f32 = 0.0;
    for (var i: i32 = 0; i < 6; i++) {
      let t: f32 = tc + D * tan(mix(th0, th1, (f32(i) + jit) / 6.0));
      let p: vec3f = U.camPos.xyz + d * t;
      let dl: vec3f = p - U.lamp.xyz;
      let hgt: f32 = max(p.y - station(p).x, 0.0);
      let wn: f32 = tnoise3(p * (M.q.w * 2.3) + M.q.xyz * 2.3);
      a += lampCone(dot(dl, U.lampDir.xyz) / sqrt(max(dot(dl, dl), 1e-4))) * exp(-hgt * M.p.y) * (0.55 + 0.9 * smoothstep(0.25, 0.80, wn)) * mix(1.0, smoothstep(1.0, 12.0, t), nearL);
    }
    air += vec3f(1.0, 0.85, 0.64) * (U.lamp.w * M.r.z * a * (th1 - th0) / (6.0 * D));
  }
  o.color = vec4f(air, min(zf, 4000.0));
  return o;
}
`;
const SHAFT_BLUR_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let p: vec2i = vec2i(v.clip.xy); let mx: vec2i = vec2i(M.p.xy) - vec2i(1, 1);
  let c: vec4f = texFetch(tShaft, p, 0);
  var acc: vec3f = c.rgb * 2.0; var ws: f32 = 2.0;
  for (var j: i32 = -1; j <= 1; j++) { for (var i: i32 = -1; i <= 1; i++) {
    if (i == 0 && j == 0) { continue; }
    let s: vec4f = texFetch(tShaft, clamp(p + vec2i(i, j), vec2i(0, 0), mx), 0);
    let w: f32 = 1.0 / (1.0 + sq((s.a - c.a) / (0.05 * c.a + 0.05)));
    acc += s.rgb * w; ws += w;
  } }
  o.color = vec4f(acc / ws, c.a);
  return o;
}
`;
const SHAFT_COMP_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let zf: f32 = min(linDepth(texFetchD(tDepth, vec2i(v.clip.xy), 0)), 4000.0);
  let hp: vec2f = v.clip.xy / M.p.z - 0.5; let h0: vec2f = floor(hp); let hf: vec2f = hp - h0;
  let mx: vec2i = vec2i(M.p.xy) - vec2i(1, 1);
  var acc: vec3f = vec3f(0.0); var wsum: f32 = 0.0;
  for (var j: i32 = 0; j < 4; j++) {
    let dx: i32 = j & 1; let dy: i32 = j >> 1;
    let s: vec4f = texFetch(tShaft, clamp(vec2i(h0) + vec2i(dx, dy), vec2i(0, 0), mx), 0);
    let wb: f32 = mix(1.0 - hf.x, hf.x, f32(dx)) * mix(1.0 - hf.y, hf.y, f32(dy));
    let wz: f32 = 1.0 / (1.0 + sq((s.a - zf) / (0.05 * zf + 0.05)));
    let w: f32 = (wb + 0.02) * wz;
    acc += s.rgb * w; wsum += w;
  }
  o.color = vec4f(acc / max(wsum, 1e-4), 0.0);
  return o;
}
`;
