"use strict";
// ---------------------------------------------------------------- thrown snow: the curtain off the ski edges, and the grains inside it
// Two populations, both stateless on the GPU (each particle is a launch record; the vertex shader integrates drag + gravity in closed form):
//   puffs  — soft volumes. Their optical depth is ACCUMULATED (order-independent) into a half-res buffer, then one full-screen pass
//            lights that buffer like a participating medium: thin parts glow when the sun is behind them, thick parts fall to sky-lit blue.
//   grains — individual crystals: sub-pixel sparks with tumbling glints, shutter streaks and lens blur. Shared with the diamond dust.

const GROUND_SSL = `
fn groundH(p: vec3f) -> f32 {
  let g: vec2f = p.xz * M.hx.x + M.hx.yz; let c0: vec2f = floor(g); let f: vec2f = g - c0;
  let i0: vec2i = vec2i(c0) & vec2i(255, 255); let i1: vec2i = (vec2i(c0) + vec2i(1, 1)) & vec2i(255, 255);
  let h00: f32 = texFetch(tH, i0, 0).x; let h10: f32 = texFetch(tH, vec2i(i1.x, i0.y), 0).x;
  let h01: f32 = texFetch(tH, vec2i(i0.x, i1.y), 0).x; let h11: f32 = texFetch(tH, i1, 0).x;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) + ${HREF_SLOPE.toFixed(4)} * p.z + M.hx.w;
}
`;

// crystals as points of light. glintQuad() turns a world position + velocity into a screen-space capsule (streak) with a blur radius,
// glintShade() draws it. Used by spray grains (10_spray.js) and by the air-borne diamond dust (11_dust.js).
const GLINT_SSL = `
struct GlintV { clip: vec4f, uv: vec2f, shp: vec4f, col: vec4f, }
fn glintCull() -> GlintV { var g: GlintV; g.clip = vec4f(0.0, 0.0, -2.0, 1.0); g.uv = vec2f(0.0); g.shp = vec4f(0.0); g.col = vec4f(0.0); return g; }
// corner: quad corner (-1..1). pos/vel: render-space position and velocity. seed: 0..1. power: light of the crystal. vis: sun visibility.
fn glintQuad(corner: vec2f, pos: vec3f, vel: vec3f, seed: f32, power: f32, vis: f32, rmin0: f32, shutK: f32) -> GlintV {
  var g: GlintV = glintCull();
  let rel: vec3f = pos - U.camPos.xyz; let zv: f32 = dot(rel, U.camFwd.xyz);
  if (zv < 0.12 || power <= 0.0) { return g; }
  let cp: vec4f = U.viewProj * vec4f(pos, 1.0); let ndc: vec2f = cp.xy / cp.w;
  if (abs(ndc.x) > 1.25 || abs(ndc.y) > 1.25) { return g; }
  // hidden behind the scene? (one depth fetch per crystal, in the vertex stage)
  let pix: vec2f = clamp((vec2f(ndc.x, -ndc.y) * 0.5 + 0.5) * U.res.xy, vec2f(0.0), U.res.xy - 1.0);
  let sz: f32 = linDepth(texFetchD(tDepth, vec2i(pix), 0));
  if (zv > sz + 0.03) { return g; }
  // where it was one shutter ago -> streak
  let pp: vec4f = U.prevViewProj * vec4f(pos - vel * U.misc.z, 1.0);
  var mv: vec2f = vec2f(0.0);
  if (pp.w > 0.05) { mv = (ndc - pp.xy / pp.w) * vec2f(0.5, -0.5) * U.res.xy * (U.dof.w * shutK / max(U.misc.z, 0.004)); }
  var ml: f32 = length(mv); var ax: vec2f = vec2f(1.0, 0.0);
  if (ml > 0.25) { ax = mv / ml; }
  // circle of confusion (px): sharp at the skier, soft discs close to the lens
  let sc: f32 = U.res.y / 1170.0;
  let coc: f32 = min(U.dof.y * abs(1.0 / U.dof.x - 1.0 / zv), U.dof.z) * sc;
  let rmin: f32 = max(0.62 * sc, rmin0);
  let rad: f32 = sqrt(coc * coc + rmin * rmin);
  // a sharp crystal streaks with the shutter; one blurred into a lens disc is already smeared, so it stays (almost) round
  // (a crumb of snow going past the lens is another matter: that is a streak however soft it is)
  ml = min(ml, 0.16 * U.res.y) * mix(min(1.0, 2.2 * sc / rad), 1.0, saturate(shutK - 1.0));
  let hl: f32 = ml * 0.5;
  let ext: vec2f = vec2f(hl + rad + 1.0, rad + 1.0);
  let lp: vec2f = corner * ext;                                        // local px: x along the streak
  let opx: vec2f = ax * lp.x + vec2f(-ax.y, ax.x) * lp.y;
  g.clip = vec4f((ndc + opx * vec2f(2.0, -2.0) * U.res.zw) * cp.w, cp.z, cp.w);
  g.uv = lp; g.shp = vec4f(hl, rad, coc / max(rad, 0.01), zv);
  // --- light. A crystal is a tumbling plate: most of the time a faint forward-scattered spark, now and then a mirror flash of the sun.
  let V: vec3f = -rel / max(length(rel), 1e-3); let L: vec3f = U.sunDir.xyz;
  let Hh: vec3f = normalize(V + L);
  let tm: f32 = U.camPos.w;
  let a1: f32 = seed * 311.7 + tm * (2.2 + 5.0 * fract(seed * 17.31)); let a2: f32 = seed * 127.1 + tm * (1.7 + 4.0 * fract(seed * 43.77));
  let nrm: vec3f = vec3f(sin(a1) * cos(a2), cos(a1), sin(a1) * sin(a2));
  let fl: f32 = pow(abs(dot(nrm, Hh)), 90.0);
  let ci: f32 = saturate(dot(Hh, L)); let fres: f32 = 0.04 + 0.96 * pow(1.0 - ci, 5.0);
  let mu: f32 = dot(-V, L);
  let fwd: f32 = 0.5 * hg(mu, 0.84) + 0.5 * hg(mu, 0.3);
  let e: f32 = power * vis * (fwd * 1.5 + fl * (0.5 + 13.0 * fres));
  // spread the same light over the blurred / streaked footprint; big lens discs keep a floor so they still read as discs
  let area: f32 = 3.14159 * rad * rad + 4.0 * rad * hl;
  let k: f32 = (3.14159 * 0.85 * 0.85 * sc * sc) / pow(area, 0.78);
  // faint prismatic tint on the flashes
  let hue: vec3f = mix(vec3f(1.0, 0.84, 0.56), vec3f(0.56, 0.84, 1.0), fract(seed * 7.0));
  let tint: vec3f = mix(vec3f(1.0), hue, 0.26 * saturate(fl * 4.0));
  var gc: vec3f = U.sunCol.rgb * vec3f(0.90, 1.0, 1.12) * tint * e;
  // in the beam of the headlamp the same crystal flashes back at the lamp (and at the lens behind it)
  if (U.lamp.w > 0.0) {
    let ll: vec3f = lampLight(pos);
    if (ll.x > 0.00002) { let Ld: vec3f = normalize(U.lamp.xyz - pos); let f2: f32 = pow(abs(dot(nrm, normalize(V + Ld))), 60.0); gc += ll * tint * (power * (0.22 + 7.0 * f2)); }
  }
  g.col = vec4f(gc * k, fl);
  return g;
}
fn glintShade(uv: vec2f, shp: vec4f, col: vec4f) -> vec4f {
  let d: f32 = length(vec2f(max(abs(uv.x) - shp.x, 0.0), uv.y));
  let r: f32 = shp.y;
  let bk: f32 = smoothstep(2.5, 7.0, r) * shp.z;
  let aa: f32 = max(1.0, r * (0.12 + 0.16 * bk));
  var a: f32 = smoothstep(r, r - aa, d);
  // lens discs: soft edge, a slightly brighter rim and a hollow-ish centre (spherical aberration), only once they are clearly out of focus
  a *= mix(1.0, 0.70 + 0.5 * smoothstep(0.5 * r, 0.9 * r, d), bk);
  return vec4f(col.rgb * a, 0.0);
}
`;

// The flight of thrown snow in closed form: nothing is stored but the launch, so it runs backwards, slows with the game clock and costs nothing.
// Two motions added together:
//  the THROW, along the launch direction, braked by the air the snow has to drag along with it: dv/dt = -v/tb - v*v/L. That is quadratic: a
//    sheet that leaves the edge at 10 m/s has lost half its speed in a few tenths of a second and creeps to a stop L*ln(1 + s0*tb/L) from the ski;
//  the FALL: gravity (and the wind) as they act on something that starts at rest in the air and nears its terminal speed vs with the time
//    constant vs/g. A clot (vs 7 m/s) is nowhere near that speed before it lands: -g*t*t/2, a true arc. Smoke (vs 0.3 m/s) sifts down from the start.
// (before this the only gravity was the terminal speed of a linear drag: everything, clots included, rose and fell at a tenth of g)
const FLIGHT_SSL = `
struct Fly { pos: vec3f, vel: vec3f, run: vec3f, }
fn snowFly(p0: vec3f, v0: vec3f, t: f32, L: f32, tb: f32, vs: f32, wk: f32) -> Fly {
  var f: Fly;
  let s0: f32 = length(v0); let dir: vec3f = v0 / max(s0, 1e-4);
  let eb: f32 = exp(-t / tb); let q: f32 = s0 * tb / L * (1.0 - eb);
  let ts: f32 = max(vs / 9.81, 0.03); let es: f32 = exp(-t / ts);
  let vT: vec3f = U.wind.xyz * wk + vec3f(0.0, -vs, 0.0);
  f.run = dir * (L * log(1.0 + q));                                     // the path of the throw so far
  f.pos = p0 + f.run + vT * (t - ts * (1.0 - es));
  f.vel = dir * (s0 * eb / (1.0 + q)) + vT * (1.0 - es);
  return f;
}
`;

const Spray = (() => {
  const P = { NP: 12288, NG: 16384, PF: 16, GF: 12, gain: 1, reach: 1.0, clots: 0.22, lens: 1.3, bump: 1.0, tear: 1.0, speck: 1.0, keyhole: 1.0, nearBlur: 0.75, shutter: true, streakMax: 0.06, crumb: 1.0, grainShutter: 4.0, face: 0, grainy: true, shadows: true, enabled: true, moonMix: 0, night: null, nt: 0, stats: { puffs: 0, grains: 0 } };
  // the owner's choice: how much the moon shows of the snow in the air by night (the headlamp's share is the same in both). a: thin and dark blue,
  // the lamp carries it; b: the moon lights the curtain too, silver-blue. (P.night: null = by the sun's height; a number holds it, for tests)
  if (typeof Variants !== 'undefined') Variants.def('nspray', '夜间雪雾', [['a', '暗蓝头灯'], ['b', '月光亮些']], 'a');
  // the owner's choice: how tall the curtain stands by the kind of snow. Real snow: a carve on groomed snow throws a low fan of 0.2-0.6 m that
  // is down within half a second; a slash in deep powder a wall of 1.5-3 m that hangs for seconds. a: tall everywhere (as it was);
  // b: as real snow has it; c: between (about a metre on packed snow, and it does not hang long)
  if (typeof Variants !== 'undefined') Variants.def('curtain', '雪幕高度', [['a', '处处都高'], ['b', '按雪况'], ['c', '折中']], 'c');
  // the owner's choice: what a fast turn throws. a: the soft cloud as it was (a bank of fog behind the skis at speed); b: as real snow has it
  // (on packed snow a low fan of sugar and crumbs that is down within the second, a thin veil over it; deep powder still a cloud);
  // c: between. P.oldK: 1 for a, 0 for b
  if (typeof Variants !== 'undefined') Variants.def('spray', '扬雪', [['a', '雪雾（旧）'], ['b', '颗粒（真实）'], ['c', '折中']], 'a');
  P.oldK = () => { const v = typeof Variants !== 'undefined' ? Variants.val.spray : 'b'; return v === 'a' ? 1 : v === 'c' ? 0.5 : 0; };
  // height (k) and how long the fine part hangs (l), from how soft the snow is (0 packed .. 1 deep powder)
  P.curtainK = function (powder) {
    const v = typeof Variants !== 'undefined' ? Variants.val.curtain : 'c', s = smooth(0.25, 0.9, powder);
    if (v === 'a') return [1, 1];
    if (v === 'b') return [lerp(0.32, 1.2, s), lerp(0.45, 1.6, s)];
    return [lerp(0.62, 1.12, s), lerp(0.62, 1.4, s)];
  };
  let gfx, puffBuf, grainBuf, puffCPU, grainCPU, pipePuff, pipePuffSun, pipeComp, pipeGrain, accTex, accT, sunTex, sunT, hw = 0, hh = 0;
  let ph = 0, gh = 0, liveP = null, liveG = null;                                   // ring heads
  const dirtyP = [], dirtyG = [];                        // [first, count] ranges written since the last upload
  let accP = 0, accG = 0;
  const rnd = RNG(977), gRnd = RNG(4243);       // (gRnd: only which grains a lower Quality level leaves out, so the rest of the spray draws the same numbers)
  // Other modules that add to thrown snow (grains, clumps, marks left on the slope, wind) hear every emission here, synchronously, as it happens.
  // e = { kind: 'carve'|'skid'|'powder'|'land'|'sift'|'fall'|'pole', t, p:[x,y,z], v:[x,y,z] (mean throw velocity), spread (rad),
  //       rate (how much snow this step, 0..2), powder (0..1), r:[x,z] right axis, f:[x,z] forward axis }   (world space)
  // A listener that throws is dropped from that one call, never from the game.
  P.onEmit = [];
  P.fogMul = 1; P.plume = 1;
  // how dark the thrown snow is from the sun's side (its shadow on the slope and the shaded face of the curtain). The owner's photos from above
  // show blue shadows and a shaded side to every plume: at 1 a plume from above was white all over
  P.shadowK = 2;
  const LF0 = [0, 0, 0, 0], LF1 = [0, 0, 0, 0], liftU = () => { if (typeof Tracks === 'undefined' || !Tracks.liftU) return LF0; const u = Tracks.liftU(), o = (typeof Render !== 'undefined' && Render.origin) || LF0; LF1[0] = u[0] - o[0]; LF1[1] = u[1] - o[2]; LF1[2] = u[2]; LF1[3] = u[3]; return LF1; };
  function emit(kind, t, p, v, spread, rate, powder, r, f) {
    if (!P.onEmit.length) return;
    const e = { kind, t, p, v, spread, rate, powder, r, f };
    for (const fn of P.onEmit) { try { fn(e); } catch (err) { if (typeof console !== 'undefined') console.warn('Spray.onEmit', err); } }
  }

  P.init = function (g) {
    gfx = g;
    puffCPU = new Float32Array(P.NP * P.PF); grainCPU = new Float32Array(P.NG * P.GF);
    puffBuf = gfx.buffer(puffCPU, 'vertex', true); grainBuf = gfx.buffer(grainCPU, 'vertex', true); liveP = LiveRing(P.NP, P.PF); liveG = LiveRing(P.NG, P.GF);
    pipePuff = gfx.pipeline({
      name: 'sprayPuff', lib: [SL.common, SL.depth, SL.shadow, SL.sprayTau, GROUND_SSL, FLIGHT_SSL, PUFF_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'add4',
      buffers: [{ instanced: true, attrs: [['a0', 'vec4f'], ['a1', 'vec4f'], ['a2', 'vec4f'], ['a3', 'vec4f']] }],
      varyings: { uv: 'vec2f', d0: 'vec4f', d1: 'vec4f', d2: 'vec4f' }, uniforms: { hx: 'vec4f', hx2: 'vec4f', fc: 'vec4f', lf: 'vec4f' },
      textures: { tH: 'fetch', tDepth: 'depth', tDetail: '2d', tShadow: 'shadow', tSunTau: '2d' },
      vs: PUFF_VS, fs: PUFF_FS,
    });
    // the same puffs seen from the sun: optical depth and its depth moments, accumulated into a small map that follows the skier
    sunTex = gfx.texture({ w: Render.sprayRes, h: Render.sprayRes, format: 'rgba16f', filter: 'linear', wrap: 'clamp' }); sunT = gfx.target({ color: sunTex }); P.sunTex = sunTex;
    pipePuffSun = gfx.pipeline({
      name: 'spraySun', lib: [SL.common, GROUND_SSL, FLIGHT_SSL, PUFF_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'add4', colorFormat: 'rgba16f',
      buffers: [{ instanced: true, attrs: [['a0', 'vec4f'], ['a1', 'vec4f'], ['a2', 'vec4f'], ['a3', 'vec4f']] }],
      varyings: { uv: 'vec2f', d0: 'vec4f' }, uniforms: { hx: 'vec4f', sn: 'vec4f', lf: 'vec4f' }, textures: { tH: 'fetch' },
      vs: PUFF_SUN_VS, fs: PUFF_SUN_FS,
    });
    pipeComp = gfx.pipeline({
      name: 'sprayComposite', lib: [SL.common, SL.depth, SL.tnoise], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { p: 'vec4f', q: 'vec4f', r: 'vec4f', c: 'vec4f' }, textures: { tSpray: '2d', tDepth: 'depth', tNoise: '2d' },
      depth: false, depthTest: false, cull: 'none', blend: 'trans', vs: VS_FULLSCREEN, fs: SPRAY_COMP_FS,
    });
    pipeGrain = gfx.pipeline({
      name: 'sprayGrain', lib: [SL.common, SL.depth, SL.shadow, SL.sprayTau, GROUND_SSL, FLIGHT_SSL, GLINT_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'trans',
      buffers: [{ instanced: true, attrs: [['a0', 'vec4f'], ['a1', 'vec4f'], ['a2', 'vec4f']] }],
      varyings: { uv: 'vec2f', shp: 'vec4f', col: 'vec4f', cc: 'vec4f' }, uniforms: { hx: 'vec4f', gp: 'vec4f' },
      textures: { tH: 'fetch', tDepth: 'depth', tShadow: 'shadow', tSunTau: '2d' },
      vs: GRAIN_VS, fs: `fn frag(v: VOut) -> FOut { var o: FOut;
  let g: vec4f = glintShade(v.uv, v.shp, v.col);
  // the crumb itself: a small white body over whatever is behind it (its flash is light, and is added)
  let d: f32 = length(vec2f(max(abs(v.uv.x) - v.shp.x, 0.0), v.uv.y)); let r: f32 = v.shp.y;
  // out of focus a body is its own outline spread over the lens disc: a soft core that thins to nothing, not the hard-edged disc
  // a point of light makes. rho = how much of the radius is still solid.
  let cz: f32 = v.shp.z; let rt: f32 = sqrt(max(1.0 - cz * cz, 0.0)); let rho: f32 = max(rt - cz, 0.0) / max(rt + cz, 1e-3);
  let a: f32 = smoothstep(r, min(r * rho, r - max(1.0, r * 0.3)), d) * min(1.0, v.cc.a / (0.3 + 0.7 * rho * rho));
  // (by night a crumb is light, not pepper: it takes little of what is behind it, so a dim one is nothing on lit snow, never a dark blue fleck)
  o.color = vec4f(g.rgb + v.cc.rgb * a, 1.0 - a * mix(1.0, 0.15, M.gp.z)); return o; }`,
    });
    P.pipes = [pipePuff, pipePuffSun, pipeComp, pipeGrain];
  };
  P.resize = function (w, h) {
    if (accT) { gfx.destroyTarget(accT); gfx.destroyTexture(accTex); }
    hw = Math.max(2, w >> 1); hh = Math.max(2, h >> 1);
    accTex = gfx.texture({ w: hw, h: hh, format: 'rgba16f', filter: 'linear' }); accT = gfx.target({ color: accTex }); Post.occTex = accTex;
  };

  function mark(list, i) { const l = list[list.length - 1]; if (l && l[0] + l[1] === i) l[1]++; else list.push([i, 1]); }
  // launch record of one puff. p, v: world space. f: fineness 0 (a heavy clot) .. 1 (smoke).
  // Two numbers decide how it flies (see puffState): how far the air lets its throw carry (a clot ploughs on for metres; the fine part of
  // the sheet has to drag the air along and is stopped within `brake` metres: more for a thick sheet than for a wisp), and the speed it
  // falls at once the air has it (a clot 7 m/s: it never gets there, it flies a true arc under gravity; smoke 0.3 m/s: it hangs and sifts down)
  // (vsO, LO: when given, the speed it falls at and how far the air lets its throw carry, as they are: sugar on packed snow is neither a clot nor smoke)
  P.puff = function (t0, px, py, pz, vx, vy, vz, f, r0, dens, stretch, lifeK, brake, vsO, LO, gK) {
    const o = Render.origin, i = ph * P.PF, c = puffCPU, u = rnd();
    c[i] = px - o[0]; c[i + 1] = py - o[1]; c[i + 2] = pz - o[2]; c[i + 3] = t0;
    c[i + 4] = vx; c[i + 5] = vy; c[i + 6] = vz; c[i + 7] = u;
    c[i + 8] = LO || lerp(brake || 1.0, 6.0, Math.pow(1 - f, 2.5)); c[i + 9] = vsO || 0.28 + 6.9 * Math.pow(1 - f, 2.6); c[i + 10] = lerp(0.8, 3.3, f) * (0.75 + 0.5 * rnd()) * (lifeK || 1); c[i + 11] = r0;
    c[i + 12] = lerp(0.07, 0.30, f) * (0.7 + 0.6 * rnd()) * (gK || 1); c[i + 13] = dens; c[i + 14] = f; c[i + 15] = stretch;
    mark(dirtyP, ph); ph = (ph + 1) % P.NP; liveP.put(); P.stats.puffs++;
  };
  // a breath in cold air (the skier waiting at the top of the run): a little vapour pushed out a hand's breadth from the mouth. It does not fall: it
  // swells, rises a little, goes off with the wind and is gone within a second. p, v: world space; dens: its optical depth as it leaves the mouth
  P.breath = function (t0, p, v, dens) {
    const o = Render.origin, i = ph * P.PF, c = puffCPU;
    c[i] = p[0] - o[0]; c[i + 1] = p[1] - o[1]; c[i + 2] = p[2] - o[2]; c[i + 3] = t0; c[i + 4] = v[0]; c[i + 5] = v[1]; c[i + 6] = v[2]; c[i + 7] = rnd();
    c[i + 8] = 0.30; c[i + 9] = -0.25; c[i + 10] = 0.8 + 0.3 * rnd(); c[i + 11] = 0.06; c[i + 12] = 0.16 + 0.04 * rnd(); c[i + 13] = dens; c[i + 14] = 0.6; c[i + 15] = 1;
    mark(dirtyP, ph); ph = (ph + 1) % P.NP; liveP.put(); P.stats.puffs++;
  };
  // one crystal or crumb. f: 0 a crumb the size of a hazelnut (flies an arc, down in half a second) .. 1 a flake (rides the air of the sheet, sifts down)
  // (a lower Quality level throws fewer of them, Quality.k('grain'): the ones it keeps a little brighter, so the sheet holds its light)
  P.grain = function (t0, px, py, pz, vx, vy, vz, f, power, lifeK, brake) {
    const qg = typeof Quality !== 'undefined' ? Quality.k('grain') : 1;
    if (qg < 1) { if (gRnd() > qg) return; power *= Math.min(1.6, 1 / Math.sqrt(qg)); }
    const o = Render.origin, i = gh * P.GF, c = grainCPU;
    c[i] = px - o[0]; c[i + 1] = py - o[1]; c[i + 2] = pz - o[2]; c[i + 3] = t0;
    c[i + 4] = vx; c[i + 5] = vy; c[i + 6] = vz; c[i + 7] = rnd();
    c[i + 8] = lerp(brake || 1.2, 8.0, (1 - f) * (1 - f)); c[i + 9] = 0.45 + 8.5 * Math.pow(1 - f, 2.2); c[i + 10] = lerp(0.9, 4.2, f) * (0.7 + 0.6 * rnd()) * (lifeK || 1); c[i + 11] = power;
    mark(dirtyG, gh); gh = (gh + 1) % P.NG; liveG.put(); P.stats.grains++;
  };
  function upload(buf, cpu, list, stride) {
    for (const [first, count] of list) gfx.updateBuffer(buf, first * stride * 4, cpu.subarray(first * stride, (first + count) * stride));
    list.length = 0;
  }
  P.shiftOrigin = function (d) {
    for (let i = 0; i < P.NP; i++) { const o = i * P.PF; puffCPU[o] -= d[0]; puffCPU[o + 1] -= d[1]; puffCPU[o + 2] -= d[2]; }
    for (let i = 0; i < P.NG; i++) { const o = i * P.GF; grainCPU[o] -= d[0]; grainCPU[o + 1] -= d[1]; grainCPU[o + 2] -= d[2]; }
    dirtyP.length = 0; dirtyG.length = 0; dirtyP.push([0, P.NP]); dirtyG.push([0, P.NG]);
  };
  P.clear = function () { puffCPU.fill(0); grainCPU.fill(0); dirtyP.length = 0; dirtyG.length = 0; dirtyP.push([0, P.NP]); dirtyG.push([0, P.NG]); liveP.clear(); liveG.clear(); };

  // ---- emission: called once per physics substep (120 Hz) so trails stay continuous at any frame rate
  P.intensity = 0;
  const was = [0, 0, 0];      // the skier's velocity a moment ago (a fall throws snow on the way it WAS going)
  let airEnd = -9;            // when the skier was last in the air
  P.onStep = function (S, H, t) {
    const sp = S.speed;
    for (let i = 0; i < 3; i++) was[i] = damp(was[i], S.v[i], 12, H);
    if (S.air) airEnd = t;
    if (!S.contact || sp < 1.2) { P.intensity = damp(P.intensity, 0, 12, H); P.face = faceEnv(t); return; }
    const g = 9.81, N = S.load / g, lat = Math.abs(S.aReac) / g, skid = Math.abs(Math.sin(S.beta));
    // how hard the edges are moving snow: a whisper when gliding, a wall when the skis are thrown sideways
    const pw = 0.6 + 0.6 * S.powder;
    // (it grows with the load: skis that are merely turned across the track, with no weight on them yet, move very little snow)
    const inten = (N, lat) => N * (0.05 * pw + 0.78 * Math.pow(lat, 1.3) + 1.25 * skid * (0.15 + 0.85 * sat(lat))) * smooth(1.5, 13, sp) * pw, I = inten(N, lat);
    P.intensity = damp(P.intensity, I, 30, H);
    const turn = S.aReac >= 0 ? 1 : -1, n = S.n, tt = S.t, rr = S.r, cb = Math.cos(S.beta), sb = Math.sin(S.beta);
    // ski axes on the snow: f along the skis, o across them toward the OUTSIDE of the turn (where the bases face)
    const fx = tt[0] * cb + rr[0] * sb, fy = tt[1] * cb + rr[1] * sb, fz = tt[2] * cb + rr[2] * sb;
    const ox = -turn * (rr[0] * cb - tt[0] * sb), oy = -turn * (rr[1] * cb - tt[1] * sb), oz = -turn * (rr[2] * cb - tt[2] * sb);
    // (the inside ski runs a little ahead of the outside one, as the figure and its tracks have it)
    const stance = Game.pose.stance * 0.5, lead = -turn * (Game.pose.lead || 0), v = S.v;
    // How fast the edge throws: about as fast as it is ploughing sideways through the snow (a carving edge still cuts outward a little),
    // more where the snow is squeezed out from under the base. Real spray is quick: the wall beside a hard turn is up in a tenth of a second
    const Nq = Math.min(N, 2.8), latq = lat * Nq / Math.max(N, 1e-3);
    // (a clean carve on packed snow moves little: 1-4 m/s off the edge. Soft snow and a skid throw it far harder)
    const OK = P.oldK(), soft = smooth(0.25, 0.9, S.powder || 0), ve = clamp(sp * (0.08 + lerp(lerp(0.22, 0.42, OK), 0.42, soft) * sat(latq / 1.5) + 0.85 * skid), 1.2, 15);
    const straight = sat(1 - latq / 0.22) * sat(1 - skid / 0.1), tailP = smooth(0.2, 0.8, straight);
    // touchdown: for a moment the load is the impact, many times the skier's weight. That snow goes out as the two fans of `slap`; the edge
    // has not ploughed anywhere yet, and when it does it is with the load a turn can have, not the impact's. (Without this, landing with
    // any lean on threw the sheet of the hardest turn there is, all of it to one side, and that one-sided wall WAS the landing.)
    // The sound still hears the full `intensity`.
    const Iq = inten(Nq, latq) * smooth(0.12, 0.5, t - airEnd);
    const hard = sat(Iq * 2.2);
    // (the blow of a fall or a landing is a spike of load, not a turn: it does not throw a hundred times the snow)
    const Ie = Math.min(Iq, 3.2), X = 0.12 + 0.5 * hard + 0.55 * sat(Iq);
    // (running straight, the tails still drag a plume out of the snow: enough lumps per metre of track that it is one plume, at any speed)
    // (a turn does not throw one even band of snow along its arc: it comes off the edge in a few thick sheets with thin stretches between,
    // two to four to a turn)
    // In soft snow the same mass goes out as fewer, bigger lumps (2.6x fewer, 1.6x across: the optical depth is the same). At 5000-9000 puffs a
    // second the ring of puffs was used up in about a second, so a powder plume was overwritten before it could hang (the owner's photos: plumes
    // that hang over the whole arc for seconds), and the many small ones ran together into one smooth wall instead of billows
    const pwS = smooth(0.25, 0.9, S.powder || 0), pwN = 1 / (1 + 1.6 * pwS), pwR = 1 + 0.6 * pwS;
    const ch = vnoise1(t * 3.1, 71) * 0.5 + 0.5, chunk = 1.25 * (0.32 + 1.3 * ch * ch);
    accP = Math.min(accP + (70 + 160 * smooth(8, 22, sp) * (1 - soft) + 1700 * Math.pow(Ie, 0.9) * chunk * pwN + 13 * sp * tailP * smooth(5, 12, sp)) * H * P.gain, 60); accG = Math.min(accG + (90 + 4600 * Math.pow(Ie, 0.85) * (0.4 + 0.6 * chunk)) * H * P.gain, 160);
    // a thick sheet has the mass to push further through the air before it is braked: the harder the turn, the taller the curtain it leaves.
    // How tall also goes with the snow: hard snow comes off as a low fan of grains, deep powder as a wall (P.curtainK)
    const CK = P.curtainK(S.powder || 0), hk = CK[0], lk = CK[1];
    // fast on packed snow, what the edges throw is mostly grains (10b_grains.js), and the smoke is a thin veil over them: at 90 km/h and more,
    // a third of the fine part and of the trail behind the tails (the owner: at speed the spray read as nothing but a bank of fog. Measured: the
    // bank was mostly the clots below, ~1000 dense puffs alive at once, and the fine part, all within 6 m of a chase camera that drives into it)
    const fogK = P.fogMul * lerp(1, lerp(0.3, 0.5, OK), smooth(10, 25, Math.hypot(S.v[0], S.v[1], S.v[2])) * (1 - smooth(0.25, 0.9, S.powder || 0)));
    const pk = (1 - soft) * (1 - OK);
    const Ls = P.reach * (0.75 + 1.95 * Math.pow(sat(Ie / 2.6), 0.7)) * hk;
    // (it leaves the edge low and across the ski, steeper where the skis are thrown sideways and the snow piles against the bases;
    // a skidding ski ploughs along its whole length, a carving one sheds from under the foot back)
    const base = S.h, elBase = lerp(0.42, lerp(0.62, 0.92, sat(skid / 0.5)), hard) * lerp(0.62, 1, sat(hk)), alMax = lerp(0.42, 0.88, sat(skid / 0.3));
    // The edge throws a SHEET, not a cloud: direction and speed vary smoothly along the ski and in time, so neighbouring lumps fly together
    // and the curtain shows fingers and scallops along its crest. A minority is loose mist that fills in around it and lingers.
    // (the fingers come and go: a stretch of even spray, then a few tall ones, never a comb)
    const sheet = (al, tj) => {
      const a = al * 5.0 + tj * 6.0, gust = 0.5 + 0.5 * Math.sin(tj * 1.31 + 1.7 * Math.sin(tj * 0.53 + 0.8));
      return clamp(0.5 + (0.30 * Math.sin(a + 1.7 * Math.sin(tj * 2.3 + al * 2.0)) + 0.20 * Math.sin(a * 2.7 + tj * 9.0)) * (0.5 + 0.7 * gust)
        + 0.15 * Math.sin(al * 21.0 + tj * 47.0 + 2.2 * Math.sin(tj * 6.1 + al * 3.0)) * (1.2 - gust), 0, 1);          // 0..1
    };
    if (P.onEmit.length && Ie > 0.004) {
      const el = elBase, ce = Math.cos(el), se = Math.sin(el), c = 0.15, al = 0.2;
      const lx = fx * al + ox * stance, lz = fz * al + oz * stance;
      emit(S.powder > 0.5 ? 'powder' : skid > 0.25 ? 'skid' : 'carve', t, [S.p[0] + lx, base - (n[0] * lx + n[2] * lz) / n[1] + 0.04, S.p[2] + lz],
        [v[0] * c + (ox * ce + n[0] * se) * ve, v[1] * c + (oy * ce + n[1] * se) * ve, v[2] * c + (oz * ce + n[2] * se) * ve],
        0.35 + 0.5 * skid, Math.min(Ie, 2), S.powder || 0, [rr[0], rr[2]], [fx, fz]);
    }
    while (accP >= 1) {
      accP -= 1;
      const u1 = rnd(), u2 = rnd(), u3 = rnd(), u4 = rnd(), jt = rnd() * H, tail = rnd() < tailP;
      // the outside ski does most of the work. Running straight, the snow pressed under each ski springs up behind its tail and is left
      // there: a low rooster tail, taller the faster the skis go
      const side = tail ? (rnd() < 0.5 ? 1 : -1) : (rnd() < 0.74 ? 1 : -1);
      const al = tail ? -0.78 - 0.14 * u1 : lerp(-0.86, alMax, u1 * u1 * 0.4 + u1 * 0.6) + side * lead, lo = side * stance + (tail ? (u3 - 0.5) * 0.09 : 0.05);
      const lx = fx * al + ox * lo - v[0] * jt, lz = fz * al + oz * lo - v[2] * jt;
      const px = S.p[0] + lx, pz = S.p[2] + lz, py = base - (n[0] * lx + n[2] * lz) / n[1] + 0.04;
      if (tail) {
        const up = (0.5 + 0.085 * sp) * (0.45 + u4), c = 0.08 + 0.2 * rnd(), sw = (u2 - 0.5) * 0.9;
        P.puff(t - jt, px, py, pz, v[0] * c + n[0] * up + ox * sw, v[1] * c + n[1] * up + oy * sw, v[2] * c + n[2] * up + oz * sw, 0.7 + 0.3 * rnd(), lerp(0.05, 0.09, rnd()), (0.3 + 0.6 * smooth(8, 26, sp) + 2.0 * X) * Math.max(fogK, 0.6), 1, 1, 0.8);
        continue;
      }
      // the sheet here and now: the angle it leaves at and the speed of its rim
      const fg = sheet(al, t - jt), vr = ve * (0.55 + 0.6 * fg) * 1.1, elS = elBase + 0.34 * (fg - 0.5);
      let f, el, sv, dens, carry, r0, jit, lifeK = 1, brake = Ls, vsO = 0, LO = 0, gK = 1;
      if (u2 < 0.13) {
        // loose mist torn off the sheet: slow, any direction, soon stopped
        f = 0.8 + 0.2 * rnd(); el = lerp(0.3, 1.3, u3); sv = vr * (0.15 + 0.4 * u4); carry = 0.10 + 0.25 * rnd();
        dens = 1.5 * X * fogK * (1 - 0.4 * pk); r0 = lerp(0.07, 0.12, rnd()); jit = 1.2; brake = Ls * 0.6;
      } else if (u2 < 0.13 + P.clots * lerp(1, 1.8, OK) * hard) {
        // the dense heart of the sheet: clots that fly true arcs, lead its rim and break up within the second (the crisp edge, then the streaks)
        f = 0.4 * Math.pow(rnd(), 0.9); el = elS + (u3 - 0.5) * 0.16; sv = vr * (0.5 + 0.5 * Math.pow(u4, 0.45));
        carry = 0.07 + 0.18 * fg * rnd() + 0.2 * skid * rnd();
        dens = lerp(7.6, 4.6, f / 0.4) * X * lerp(0.2 + 0.4 * fogK, 0.4 + 0.6 * fogK, OK); r0 = lerp(lerp(0.035, 0.04, OK), lerp(0.065, 0.075, OK), rnd()) * (0.75 + 0.55 * sat(Iq)); jit = 0.35; lifeK = lerp(0.38, 0.7, OK);
      } else {
        // its fine part, which is most of what is seen: thrown with the rest, braked by the air within a metre or two, and left hanging: the curtain
        // (not a membrane: most of the snow goes out with the crest, the rest at every speed below it, and that fills the wall under it)
        // (on packed snow there is little dust to tear off: what the edge throws is sugar, a millimetre or two, that falls at a metre or two a
        // second and is down within the second. Only in soft snow is the fine part smoke that hangs)
        f = Math.max(0.62 + 0.38 * rnd(), 1 - hard); el = elS + (u3 - 0.5) * 0.30; sv = vr * (0.42 + 0.58 * Math.pow(u4, 0.6));
        carry = 0.07 + 0.18 * fg * rnd() + 0.2 * skid * rnd();
        dens = lerp(4.2, 2.6, sat((f - 0.62) / 0.38)) * X * fogK; r0 = lerp(0.05, 0.09, rnd()) * (0.75 + 0.55 * sat(Iq)); jit = 0.5; brake = Ls * (0.75 + 0.5 * rnd());
        if (rnd() < pk * 0.85) {
          // sugar: on packed snow most of it. Each grain is braked by the air on its own (a few tenths of a metre), falls at one to two metres a
          // second and is down within the second: a low granular fan, not a curtain
          f = 0.36 + 0.06 * rnd(); vsO = 0.9 + 1.1 * rnd(); LO = 0.25 + 0.35 * rnd(); lifeK = 0.42; r0 *= 0.7; gK = 0.3; jit = 0.6;
          // (not thinned with speed as the smoke is: a light turn at speed still kicks a small low puff of it off the skis, the owner's photo R5)
          dens = lerp(4.2, 2.6, sat((f - 0.62) / 0.38)) * Math.max(X, 0.7) * 0.4;
        }
      }
      const ce = Math.cos(el), se = Math.sin(el);
      const vx = v[0] * carry + (ox * ce + n[0] * se) * sv + (rnd() - 0.5) * jit, vy = v[1] * carry + (oy * ce + n[1] * se) * sv + rnd() * 0.4 * jit, vz = v[2] * carry + (oz * ce + n[2] * se) * sv + (rnd() - 0.5) * jit;
      P.puff(t - jt, px, py, pz, vx, vy, vz, f, r0 * pwR, dens, 1, lifeK * (f > 0.5 ? lk * (0.4 + 0.6 * fogK) * (1 + 0.4 * pwS) : 1), brake, vsO, LO, gK);
    }
    // The plume (the owner's photos from above, R2 and R6): in soft snow a hard turn throws a wall of fine snow steeply up off the outside ski,
    // left standing along the arc where it was thrown, two or three metres tall. It is big and slow to spread, so it hangs for three or four
    // seconds, goes off with the wind and throws a long blue shadow on the slope. Only in soft snow: on packed snow the fan stays low
    // (the chase camera drives through what is left behind; a wall there was the fog bank the owner disliked)
    const plK = soft * smooth(0.35, 1.3, Iq) * P.plume;
    accU = Math.min(accU + 320 * plK * H * P.gain, 12); P.stats.plume = (P.stats.plume || 0) + 320 * plK * H;
    while (accU >= 1) {
      accU -= 1;
      const jt = rnd() * H, al = lerp(-0.75, 0.45, rnd()), lo = stance + 0.08 + 0.1 * rnd();
      const lx = fx * al + ox * lo - v[0] * jt, lz = fz * al + oz * lo - v[2] * jt;
      const px = S.p[0] + lx, pz = S.p[2] + lz, py = base - (n[0] * lx + n[2] * lz) / n[1] + 0.1;
      // (steeper than the sheet, and as fast as its rim: the crest of the wall; it is left behind the skier, not carried along)
      const fg = sheet(al, t - jt), el = lerp(0.5, 1.25, rnd()) - 0.15 * (1 - fg), ce = Math.cos(el), se = Math.sin(el);
      const sv = ve * (0.7 + 0.5 * fg) * (0.6 + 0.6 * rnd()), c = 0.04 + 0.1 * rnd();
      const vx = v[0] * c + (ox * ce + n[0] * se) * sv + (rnd() - 0.5) * 0.8, vy = v[1] * c + (oy * ce + n[1] * se) * sv, vz = v[2] * c + (oz * ce + n[2] * se) * sv + (rnd() - 0.5) * 0.8;
      P.puff(t - jt, px, py, pz, vx, vy, vz, 0.9 + 0.1 * rnd(), lerp(0.2, 0.36, rnd()), (2.4 + 1.8 * fg) * Math.min(X, 1.2), 1, 1.25, Ls * (1.2 + 0.6 * rnd()), 0, 0, 0.6);
    }
    while (accG >= 1) {
      accG -= 1;
      const u1 = rnd(), u3 = rnd(), u4 = rnd(), jt = rnd() * H, tail = rnd() < tailP;
      const side = tail ? (rnd() < 0.5 ? 1 : -1) : (rnd() < 0.74 ? 1 : -1);
      const al = tail ? -0.78 - 0.14 * u1 : lerp(-0.86, alMax + 0.08, u1) + side * lead, lo = side * stance + (tail ? (u3 - 0.5) * 0.09 : 0.05);
      const lx = fx * al + ox * lo - v[0] * jt, lz = fz * al + oz * lo - v[2] * jt;
      const px = S.p[0] + lx, pz = S.p[2] + lz, py = base - (n[0] * lx + n[2] * lz) / n[1] + 0.03;
      if (tail) {
        const up = (0.6 + 0.10 * sp) * (0.3 + 1.2 * u4), c = 0.08 + 0.3 * rnd(), sw = (rnd() - 0.5) * 1.6;
        P.grain(t - jt, px, py, pz, v[0] * c + n[0] * up + ox * sw, v[1] * c + n[1] * up + oy * sw, v[2] * c + n[2] * up + oz * sw, rnd(), 1.2 + 3.0 * rnd() * rnd(), 1, 0.9);
        continue;
      }
      // grains ride the same sheet but scatter wider, and the heavy ones outrun it: the glitter along its crest and ahead of it
      const f = rnd(), fg = sheet(al, t - jt);
      const el = elBase + 0.34 * (fg - 0.5) + (u3 - 0.5) * 0.7, ce = Math.cos(el), se = Math.sin(el);
      const sv = ve * (0.55 + 0.6 * fg) * 1.1 * (0.45 + 0.75 * Math.pow(u4, 1.3));
      const carry = 0.10 + 0.4 * rnd() * rnd() + 0.2 * skid * rnd();
      const vx = v[0] * carry + (ox * ce + n[0] * se) * sv + (rnd() - 0.5) * 1.2, vy = v[1] * carry + (oy * ce + n[1] * se) * sv + rnd() * 0.8, vz = v[2] * carry + (oz * ce + n[2] * se) * sv + (rnd() - 0.5) * 1.2;
      P.grain(t - jt, px, py, pz, vx, vy, vz, f, 1.2 + 3.0 * rnd() * rnd(), 1, Ls * (0.8 + 0.5 * rnd()));
    }
    // Deep powder boils round the boots: the skis run under the surface and the snow over them is pushed up and ahead, a low, thick,
    // short-lived churn round the shins that hides where the legs go into the snow. (How deep the skier rides is the tracks' business:
    // Tracks.D if it is there.)
    const dp = smooth(0.45, 0.9, S.powder || 0);
    if (dp > 0 && sp > 2.5) {
      const D = typeof Tracks !== 'undefined' && Tracks.D != null ? Tracks.D : 0.3 * dp, surf = base + 0.7 * D;
      accB = Math.min(accB + (30 + 70 * sat(sp / 14) + 160 * sat(Iq)) * dp * H * P.gain, 20);
      while (accB >= 1) {
        accB -= 1;
        const side = rnd() < 0.5 ? 1 : -1, al = lerp(-0.35, 1.0, Math.sqrt(rnd())), lo = side * stance + (rnd() - 0.5) * 0.32, jt = rnd() * H;
        const lx = fx * al + ox * lo - v[0] * jt, lz = fz * al + oz * lo - v[2] * jt;
        const px = S.p[0] + lx, pz = S.p[2] + lz, py = surf - (n[0] * lx + n[2] * lz) / n[1] + 0.03 + 0.12 * rnd();
        // (carried along with the skis, a little slower than them, and up over the tips; outward where the edge is turned)
        const c = 0.55 + 0.3 * rnd(), up = 0.5 + 1.2 * rnd() + 0.8 * sat(Iq), out = (rnd() - 0.5) * 1.2 + 0.6 * sat(Iq) * (side > 0 ? 1 : 0.3);
        P.puff(t - jt, px, py, pz, v[0] * c + n[0] * up + ox * out, v[1] * c + n[1] * up + oy * out, v[2] * c + n[2] * up + oz * out,
          0.72 + 0.25 * rnd(), lerp(0.05, 0.10, rnd()), (1.6 + 1.6 * sat(Iq)) * dp, 1, 0.32 + 0.25 * rnd(), 0.45);
      }
      // and a face shot: from the skier's own eyes a hard turn in deep powder throws the snow over the tips straight into the face. For a
      // moment the lens lets the snow come right up to it (P.face) and a burst of it goes past, soft and white, half the picture gone
      const fp = typeof Game !== 'undefined' && (Game.view === 'fp' || Game.view === 'tips');
      if (fp && dp > 0.5 && sp > 6 && Iq > 0.7 && t - faceT0 > 1.6 && rnd() < H * 5.0 * sat((Iq - 0.7) / 0.8)) {
        faceT0 = t; faceN = Math.round(60 + 40 * sat(Iq - 0.7) * dp);
      }
      if (fp && faceN > 0 && typeof Render !== 'undefined' && Render.cam) {
        const cam = Render.cam, cf = cam.fwd, cr = cam.right, cu = cam.up, k = Math.min(faceN, Math.ceil(faceN * H / 0.18) + 1);
        for (let i = 0; i < k; i++, faceN--) {
          const dz = 0.5 + 1.4 * rnd(), dx = (rnd() - 0.5) * 1.5 * dz, dy = (rnd() - 0.6) * 1.0 * dz;
          const px = cam.pos[0] + cf[0] * dz + cr[0] * dx + cu[0] * dy, py = cam.pos[1] + cf[1] * dz + cr[1] * dx + cu[1] * dy, pz = cam.pos[2] + cf[2] * dz + cr[2] * dx + cu[2] * dy;
          // (thrown up off the tips it goes on with the skier, only a little slower, so it comes back at the lens and over it)
          const c = 0.86 + 0.1 * rnd(), up = 0.4 + 1.0 * rnd();
          P.puff(t, px, py, pz, v[0] * c - cf[0] * 1.2, v[1] * c + up, v[2] * c - cf[2] * 1.2, 0.9 + 0.1 * rnd(), lerp(0.12, 0.26, rnd()), 3 + 3 * rnd(), 0.4, 0.5 + 0.4 * rnd(), 0.4);
        }
      }
    }
    P.face = faceEnv(t);
  };
  let accU = 0, accB = 0, faceT0 = -9, faceN = 0;
  // the lens lets the snow right up to it for a moment after a face shot: in a tenth of a second, held a third, gone in half a second more
  function faceEnv(t) { const a = t - faceT0; return a < 0 ? 0 : smooth(0, 0.1, a) * (1 - smooth(0.4, 0.95, a)); }
  // a landing, or a fall: the skis come down flat and the snow under them has one way out: sideways from under each ski, along its whole
  // length, low and fast, raked forward by the skis that were riding on it. Two fans, one off each ski, and the skier rides out from between
  // them (what is squeezed toward the middle meets its opposite number and goes up and forward: a small spurt between the tips). Nor is it
  // over in an instant: the skis sink in over a tenth of a second, a couple of metres of track, so it is laid along the track as they go.
  // p: on the snow under the skier, v: the way the skis are travelling, n: slope normal, power: 0.3 a hop .. 2.2 a hard landing
  P.slap = function (t, p, v, n, power) {
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2], tx = v[0] - n[0] * vn, ty = v[1] - n[1] * vn, tz = v[2] - n[2] * vn, sp = Math.hypot(tx, ty, tz);
    const fx = sp > 0.3 ? tx / sp : 0, fy = sp > 0.3 ? ty / sp : 0, fz = sp > 0.3 ? tz / sp : -1;
    let rx = fy * n[2] - fz * n[1], ry = fz * n[0] - fx * n[2], rz = fx * n[1] - fy * n[0]; const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const stance = Game.pose.stance * 0.5, base = Course.height(p[0], p[2], 0.5), T = 0.08 + 0.04 * power;
    // How much snow a landing moves goes with the energy of the blow (the square of the speed it comes down at), not the speed: a hop is
    // a puff, a big drop is an explosion. In deep snow the skis go in deep and the snow has to go up and out all round them, a ring
    // (a doughnut) from waist to chest high that closes round the legs in a second or two and then hangs; on hard snow a low ring along
    // the surface.
    const E = power * power, pw = (Game.s && Game.s.powder) || 0, soft = smooth(0.25, 0.9, pw), CK = P.curtainK(pw);
    const np = Math.round(Math.min(40 + 85 * E, 520)), ng = Math.round(Math.min(80 + 150 * E, 900)), jet = 3.0 + 3.6 * power, reach = (0.9 + 0.75 * power) * lerp(0.75, 1.1, soft);
    const ring = lerp(0.25, 0.6, soft);
    // (skis that come down on their edges have their bases turned outward: more of it goes that way)
    const lean = Game.s.lean || 0, pOut = 0.5 - 0.3 * Math.sign(lean) * sat(Math.abs(lean) / 0.5);
    emit(P.slapKind || 'land', t, [p[0], base, p[2]], [tx * 0.3 + n[0] * jet * 0.3, ty * 0.3 + n[1] * jet * 0.3, tz * 0.3 + n[2] * jet * 0.3], 1.4, Math.min(power, 2), pw, [rx, rz], [fx, fz]);
    for (let i = 0; i < np + ng; i++) {
      const pf = i < np, tau = T * Math.pow(rnd(), 1.6);
      if (rnd() < ring) {
        // the ring: out all round from under the skier, the front of it a dense sheet, then braked by the air and left standing
        const a = rnd() * TAU, ca = Math.cos(a), sa = Math.sin(a), rr = stance + 0.15 + 0.25 * rnd();
        const hs = (4 + 4 * rnd()) * Math.sqrt(Math.min(E, 5)) * 0.62, vu = (1 + 2 * rnd()) * lerp(0.35, 1.0, soft) * Math.sqrt(power);
        const dx = rx * ca + fx * sa, dz = rz * ca + fz * sa, dy = ry * ca + fy * sa;
        const lx = dx * rr + tx * tau, lz = dz * rr + tz * tau;
        const px = p[0] + lx, pz = p[2] + lz, py = base - (n[0] * lx + n[2] * lz) / n[1] + 0.05;
        const c = 0.25 + 0.2 * rnd(), vx = tx * c + dx * hs + n[0] * vu, vy = ty * c + dy * hs + n[1] * vu, vz = tz * c + dz * hs + n[2] * vu;
        if (pf) {
          const f = 0.5 + 0.45 * rnd();
          P.puff(t + tau, px, py, pz, vx, vy, vz, f, lerp(0.07, 0.13, rnd()) * (0.8 + 0.2 * power), 3.4 * (0.6 + 0.4 * Math.min(power, 1.5)) * lerp(0.8, 1.2, soft), 1, (f > 0.6 ? CK[1] : 0.8) * lerp(0.9, 1.3, soft), reach * (0.5 + 0.5 * rnd()) * lerp(0.6, 1, CK[0]));
        } else P.grain(t + tau, px, py, pz, vx * 1.1, vy * 1.2 + 0.3, vz * 1.1, rnd(), 0.6 + 1.6 * rnd() * rnd(), 1, reach * (0.8 + 0.6 * rnd()));
        continue;
      }
      const mid = rnd() < 0.15, side = rnd() < pOut ? 1 : -1, u = rnd();
      // where along the ski it comes out (tail .. shovel), and on which side of it
      const al = lerp(-0.8, 0.95, rnd()), lo = mid ? (rnd() - 0.5) * stance * 1.6 : side * (stance + 0.05 + 0.04 * rnd());
      // which way: across the ski and raked forward (the spurt in the middle straight ahead), low: the harder it is squeezed the flatter it leaves
      const az = mid ? 1.57 - rnd() * 0.4 : lerp(0.15, 1.0, rnd()), el = mid ? lerp(0.3, 0.8, u) : lerp(0.12, 0.62, u * (0.5 + 0.5 * u));
      const s = jet * (mid ? 0.6 : 1) * (pf ? 0.45 + 0.55 * Math.sqrt(rnd()) : 0.4 + 0.9 * rnd()), carry = (mid ? 0.35 : 0.2) + 0.25 * rnd();
      const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az) * side * ce, sa = Math.sin(az) * ce;
      const lx = fx * al + rx * lo + tx * tau, lz = fz * al + rz * lo + tz * tau;
      const px = p[0] + lx, pz = p[2] + lz, py = base - (n[0] * lx + n[2] * lz) / n[1] + 0.04;
      const vx = tx * carry + (rx * ca + fx * sa + n[0] * se) * s, vy = ty * carry + (ry * ca + fy * sa + n[1] * se) * s, vz = tz * carry + (rz * ca + fz * sa + n[2] * se) * s;
      if (pf) {
        const clot = rnd() < 0.35, f = clot ? 0.4 * rnd() : 0.6 + 0.4 * rnd();
        P.puff(t + tau, px, py, pz, vx, vy, vz, f, lerp(0.06, 0.11, rnd()) * (0.8 + 0.2 * power), (clot ? 5.5 : 3.2) * (0.55 + 0.45 * Math.min(power, 1.5)), 1, clot ? 0.7 : 0.9 * CK[1], reach * (0.7 + 0.6 * rnd()));
      } else P.grain(t + tau, px, py, pz, vx * 1.15, vy * 1.3 + 0.3, vz * 1.15, rnd(), 0.6 + 1.6 * rnd() * rnd(), 1, reach * (0.9 + 0.6 * rnd()));
    }
  };
  P.burst = P.slap;      // (the old name, from when this was a ring thrown out round one point)
  // a fall (into a tree): the skis are stopped but the snow they were ploughing is not: the same two fans, thrown on the way the skier WAS going
  P.fall = function (t, p, n, power) { P.slapKind = 'fall'; try { P.slap(t, p, [was[0] * 0.6, was[1] * 0.6, was[2] * 0.6], n, power); } finally { P.slapKind = null; } };
  // a double-pole push: the two tips go in beside the skis, about level with the toes: a pinch of snow each, flicked back as the basket bites
  P.poles = function (t, root, stance) {
    const f = root.fwd, n = root.nrm, rx = f[1] * n[2] - f[2] * n[1], rz = f[0] * n[1] - f[1] * n[0], d = (stance || 0.3) * 0.5 + 0.24;
    for (const sd of [-1, 1]) {
      const x = root.pos[0] + f[0] * 0.25 + rx * sd * d, z = root.pos[2] + f[2] * 0.25 + rz * sd * d, y = Course.height(x, z, 0.5) + 0.03;
      emit('pole', t, [x, y, z], [-f[0] * 0.5 + rx * sd * 0.3, 0.9, -f[2] * 0.5 + rz * sd * 0.3], 1.2, 0.1, (typeof Game !== 'undefined' && Game.s && Game.s.powder) || 0, [rx, rz], [f[0], f[2]]);
      for (let i = 0; i < 20; i++) {
        const a = rnd() * TAU, c = 0.25 + 0.5 * rnd(), up = 0.5 + 1.1 * rnd();
        const vx = -f[0] * 0.5 + rx * sd * 0.3 + Math.cos(a) * c, vz = -f[2] * 0.5 + rz * sd * 0.3 + Math.sin(a) * c;
        if (i < 5) P.puff(t, x, y, z, vx, up, vz, 0.6 + 0.4 * rnd(), lerp(0.035, 0.06, rnd()), 2.4, 1, 0.4, 0.35);
        else P.grain(t, x, y, z, vx * 1.6, up * 1.6, vz * 1.6, rnd(), 0.5 + 1.2 * rnd(), 0.6, 0.5);
      }
    }
  };

  // a hoof driving into the snow: a small spurt thrown up and back
  P.kick = function (t, p, v, power) {
    const np = Math.round(4 * power), ng = Math.round(46 * power);
    for (let i = 0; i < np + ng; i++) {
      const a = rnd() * TAU, el = lerp(0.35, 1.15, rnd()), s = lerp(0.7, 3.0, rnd()), ce = Math.cos(el);
      const dx = Math.cos(a) * ce, dz = Math.sin(a) * ce, dy = Math.sin(el), px = p[0] + dx * 0.12, pz = p[2] + dz * 0.12, py = p[1] + 0.04;
      if (i < np) P.puff(t, px, py, pz, v[0] + dx * s, v[1] + dy * s, v[2] + dz * s, Math.pow(rnd(), 0.6), lerp(0.05, 0.10, rnd()), 0.85, 0.6, 0.55);
      else P.grain(t, px, py, pz, v[0] * 1.2 + dx * s * 1.4, v[1] + dy * s * 1.8, v[2] * 1.2 + dz * s * 1.4, rnd(), 0.5 + 1.2 * rnd(), 0.8);
    }
  };
  // snow shaken off a bough: a thin veil of fine dust that hangs and sifts down, and a shower of sparkling grains
  P.sift = function (t, p, v, power) {
    const np = Math.round(9 * power), ng = Math.round(220 * power);
    emit('sift', t, [p[0], p[1], p[2]], [v[0] * 0.25, -0.9, v[2] * 0.25], 3.14, Math.min(power, 2), 1, [1, 0], [0, -1]);
    for (let i = 0; i < np + ng; i++) {
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * 0.9, px = p[0] + Math.cos(a) * rr, pz = p[2] + Math.sin(a) * rr, py = p[1] + (rnd() - 0.3) * 1.4;
      const vx = v[0] * (0.15 + 0.25 * rnd()) + (rnd() - 0.5) * 1.2, vz = v[2] * (0.15 + 0.25 * rnd()) + (rnd() - 0.5) * 1.2, vy = -0.3 - rnd() * 1.2;
      if (i < np) P.puff(t, px, py, pz, vx, vy, vz, 0.8 + 0.2 * rnd(), lerp(0.16, 0.30, rnd()), 0.45, 0.6, 1.3);
      else P.grain(t, px, py, pz, vx * 1.4, vy * 1.6 + 0.6, vz * 1.4, 0.35 + 0.65 * rnd(), 0.5 + 1.6 * rnd() * rnd(), 1.2);
    }
  };
  // before the scene: the snow cloud as the sun sees it (the slope, the skier and the cloud itself all read it)
  P.pre = function (R) {
    upload(puffBuf, puffCPU, dirtyP, P.PF); upload(grainBuf, grainCPU, dirtyG, P.GF);
    liveP.trim(puffCPU, ph, R.time); liveG.trim(grainCPU, gh, R.time); P.stats.live = liveP.n; P.stats.liveG = liveG.n;
    const hb = Terrain.heightBinding(R.origin, 1); P.hb = hb;
    gfx.beginPass(sunT, { color: [0, 0, 0, 0] });
    // night: 0 by day, at golden hour and at dusk (they keep the look they had), 1 once the sun is well under (see the end of SPRAY_COMP_FS)
    P.nt = P.night != null ? P.night : smooth(-0.07, -0.16, Sky.sunElev);
    if (P.enabled && P.shadows) { const d = { u: { hx: hb.xf, sn: [(1 - 0.6 * P.nt) * P.shadowK, 0, 0, 0], lf: liftU() }, tex: { tH: hb.tex }, vb: [puffBuf], count: 4 }; liveP.spans(ph, (b, n) => { d.base = b; d.instances = n; gfx.draw(pipePuffSun, d); }); }
    gfx.endPass();
  };
  // (a phone draws the rim of the curtain with one noise instead of two: P.grainy off there and whenever the governor has had to shrink the picture)
  const touchSmall = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 600;
  P.offscreen = function (R) {
    P.grainy = !touchSmall && !(Render.scale < 0.75);
    gfx.beginPass(accT, { color: [0, 0, 0, 0] });
    if (P.enabled) { const d = { u: { hx: P.hb.xf, hx2: [P.nearBlur, P.shutter && R.motionBlur !== false && R.dt > 0 ? Post.shutter / Math.max(R.dt, 1 / 240) : 0, P.streakMax, P.lens], fc: [P.face, P.grainy ? 1 : 0, 0, 0], lf: liftU() }, tex: { tH: P.hb.tex, tDepth: R.depth, tDetail: Tex.detail, tShadow: R.shadowTex, tSunTau: sunTex }, vb: [puffBuf], count: 4 }; liveP.spans(ph, (b, n) => { d.base = b; d.instances = n; gfx.draw(pipePuff, d); }); }
    gfx.endPass();
  };
  P.fx = function (R) {
    if (!P.enabled) return;
    const o = R.origin, wr = (x, f) => ((x * f) % 256 + 256) % 256;
    const nt = P.nt || 0, az = typeof Vista !== 'undefined' && Vista.cityAz != null ? Vista.cityAz : 0;
    // (the owner's choice between the two nights is eased, not switched)
    { const want = typeof Variants !== 'undefined' && Variants.val.nspray === 'b' ? 1 : 0; P.moonMix = R.dt > 0 ? damp(P.moonMix, want, 6, R.dt) : want; }
    gfx.draw(pipeComp, { u: { p: [hw, hh, P.bump, P.tear], q: [wr(o[0], 3.1), wr(o[1], 3.1), wr(o[2], 3.1), P.speck], r: [P.keyhole, nt, P.moonMix, 0], c: [Math.sin(az), -Math.cos(az), 0, 0] }, tex: { tSpray: accTex, tDepth: R.depth, tNoise: Tex.noise }, count: 3 });
    { const d = { u: { hx: P.hb.xf, gp: [P.crumb, P.grainShutter, nt, P.moonMix] }, tex: { tH: P.hb.tex, tDepth: R.depth, tShadow: R.shadowTex, tSunTau: sunTex }, vb: [grainBuf], count: 4 }; liveG.spans(gh, (b, n) => { d.base = b; d.instances = n; gfx.draw(pipeGrain, d); }); }
  };
  return P;
})();

const PUFF_SSL = `
// the snow surface as drawn: near the skier the terrain raises the powder by the depth the skis ride at (Tracks.lift, the same numbers)
fn groundS(p: vec3f) -> f32 {
  let d: f32 = length(p.xz - M.lf.xy);
  return groundH(p) + M.lf.z * (1.0 - smoothstep(mix(1.0, 3.0, M.lf.w), mix(2.15, 7.5, M.lf.w), d));
}
struct PuffS { pos: vec3f, vel: vec3f, sm: vec3f, r: f32, dens: f32, lf: f32, t: f32, }
// one puff now: thrown, braked, then hanging and sifting down (snowFly). dens = optical depth at its centre (0 = dead).
// a2 = (how far the air lets its throw carry, the speed it falls at in the end, life, radius at launch), a3 = (growth, optical depth, fineness, stretch)
fn puffState(a0: vec4f, a1: vec4f, a2: vec4f, a3: vec4f) -> PuffS {
  var s: PuffS; s.pos = vec3f(0.0); s.vel = vec3f(0.0); s.sm = vec3f(0.0); s.r = 0.0; s.dens = 0.0; s.lf = 0.0; s.t = 0.0;
  let t: f32 = U.camPos.w - a0.w; let life: f32 = a2.z;
  if (t <= 0.0 || t >= life) { return s; }
  let seed: f32 = a1.w; let fine: f32 = a3.z;
  // (the fine dust is carried by the air entirely: whatever the wind does, it does; a clot hardly notices)
  let fy: Fly = snowFly(a0.xyz, a1.xyz, t, a2.x, mix(2.2, 0.45, fine), a2.y, mix(0.3, 1.0, smoothstep(0.45, 0.85, fine)));
  var pos: vec3f = fy.pos; s.vel = fy.vel;
  // Billows. The sheet drags the air along and the shear between them rolls it up: each lump of the fine part is carried round in an
  // eddy of its own (radius 0.1-0.5 m, grown within half a second, turning slower and slower as the eddy dies), rolling back over the
  // top of the throw and up. Every puff has its own phase and rate: in step, the whole curtain would swim like a liquid.
  let fr: f32 = smoothstep(0.35, 0.8, fine);
  let hd0: vec2f = a1.xz; let hl: f32 = length(hd0);
  var hd: vec3f = vec3f(0.7071, 0.0, 0.7071);
  if (hl > 0.05) { hd = vec3f(hd0.x / hl, 0.0, hd0.y / hl); }
  let A: f32 = (0.10 + 0.32 * fract(seed * 3.71)) * fr * (1.0 - exp(-t / 0.4));
  let tr: f32 = 1.6; let om: f32 = 0.8 + 1.6 * fract(seed * 11.3);
  let ang: f32 = seed * 6.2832 + om * tr * (1.0 - exp(-t / tr));
  let sd: vec3f = vec3f(-hd.z, 0.0, hd.x);
  pos += A * (hd * (cos(ang) - 0.6) + vec3f(0.0, 1.0, 0.0) * (sin(ang) + 0.35) + sd * (0.6 * sin(ang * 1.37 + seed * 17.0)));
  // the top of a thrown sheet (it left the edge steep and fast) keeps rolling up and back for a second: the crest of the curtain climbs
  pos.y += fr * 0.32 * saturate(a1.y / 4.0) * (1.0 - exp(-t / 0.9));
  var r: f32 = a2.w + a3.x * pow(t, 0.72);
  // Thrown snow is drawn out along its way only while it is still flying fast (the quick part of a lump outruns the slow part, and the
  // shutter adds its share in the vertex stage); once the air has it, it is a lump again. (Kept drawn out, the hanging curtain read as
  // combs from the side, a paint splash from the front and flames along its top.) What hangs on is combed a little the way the wind blows.
  s.sm = s.vel * (0.07 * a3.w * (1.0 - smoothstep(0.06, 0.22, t))) + U.wind.xyz * (0.06 * fr * smoothstep(0.6, 2.5, t));
  // Back on the snow. A clot is snow again: it fades where it lands. The fine part is heavier than the air it hangs in: what reaches the
  // ground does not stop there but runs out along it, a flat flow spreading as the square root of time and sliding downhill at the
  // better part of a metre a second, slowing within a second or two, thinning as it goes.
  let g0: f32 = groundS(pos); let gy: f32 = g0 + r * 0.28;
  let pen: f32 = max(gy - pos.y, 0.0);
  let tg: f32 = pen / max(a2.y, 0.15);                                  // about how long ago it reached the snow
  let onG: f32 = saturate(pen / max(r * 0.4, 0.04)) * fr;
  if (onG > 0.0) {
    let gx: f32 = groundS(pos + vec3f(0.6, 0.0, 0.0)) - g0; let gz: f32 = groundS(pos + vec3f(0.0, 0.0, 0.6)) - g0;
    let gl: f32 = length(vec2f(gx, gz));
    var dn: vec2f = vec2f(0.0);
    if (gl > 1e-4) { dn = -vec2f(gx, gz) / gl; }
    let run: f32 = 0.85 * 1.1 * (1.0 - exp(-tg / 1.1)) * smoothstep(0.0, 0.12, gl / 0.6) * onG;
    pos.x += dn.x * run; pos.z += dn.y * run;
    r *= 1.0 + 0.75 * sqrt(tg) * onG;
    // (and it lies flat: wider than it is tall)
    let cr: vec3f = U.camRight.xyz; let ch: vec2f = vec2f(cr.x, cr.z); let chl: f32 = max(length(ch), 1e-3);
    s.sm += vec3f(ch.x / chl, 0.0, ch.y / chl) * (r * 1.3 * onG * saturate(tg * 2.0));
    pos.y = g0 + (gx * dn.x + gz * dn.y) / 0.6 * run + r * 0.28;
  }
  let landed: f32 = mix(saturate(1.0 - pen / 0.35), 1.0, fr);
  // ...and the coarse snow on its way back down thins before it touches: no pale lid lying on the slope
  let settle: f32 = mix(1.0, smoothstep(0.30, 1.10, (pos.y - g0) / r), saturate(-s.vel.y * 2.5) * smoothstep(0.25, 0.8, t) * (1.0 - fr));
  if (onG <= 0.0) { pos.y = max(pos.y, gy); }
  let lf: f32 = t / life;
  s.pos = pos; s.r = r; s.lf = lf; s.t = t;
  // the mass spreads as the puff grows (optical depth ~ 1/r^2); fades in fast, out slowly
  s.dens = a3.y * pow(a2.w / r, 1.9) * smoothstep(0.0, 0.03, t) * pow(1.0 - lf, 1.3) * landed * settle;
  return s;
}
`;

const PUFF_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec2f(0.0); v.d0 = vec4f(0.0); v.d1 = vec4f(0.0); v.d2 = vec4f(0.0);
  let s: PuffS = puffState(a.a0, a.a1, a.a2, a.a3);
  if (s.dens <= 0.0) { return v; }
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let seed: f32 = a.a1.w; let pos: vec3f = s.pos; let r: f32 = s.r;
  let rel: vec3f = pos - U.camPos.xyz; let zc: f32 = dot(rel, U.camFwd.xyz);
  if (zc < 0.35) { return v; }
  // it dissolves before it reaches the lens: the curtain is something to look at, not to be blinded by
  let lens: f32 = mix(M.hx2.w, 0.32, M.fc.x);
  var dens: f32 = s.dens * smoothstep(lens, lens * 3.0 + 0.7, zc);
  if (dens < 0.002) { return v; }
  let sv: vec2f = vec2f(dot(s.sm, U.camRight.xyz), dot(s.sm, U.camUp.xyz)); let sl: f32 = length(sv);
  var ax: vec2f = vec2f(1.0, 0.0);
  if (sl > 1e-3) { ax = sv / sl; }
  let st0: f32 = 1.0 + min(sl / r, 3.2);
  // the shutter: snow hanging in the air goes by the lens like everything else does. A lump two strides from the camera is not a ball
  // standing in the picture: it is a streak along the way it went past (half that path, in metres at its own depth)
  let c0: vec4f = U.viewProj * vec4f(pos, 1.0); let c1: vec4f = U.prevViewProj * vec4f(pos - s.vel * U.misc.z, 1.0);
  var mb: vec2f = vec2f(0.0);
  if (c0.w > 0.05 && c1.w > 0.05) { mb = (c0.xy / c0.w - c1.xy / c1.w) * vec2f(U.camUp.w, 1.0) * (0.5 * M.hx2.y); }
  let ml: f32 = length(mb);
  if (ml > M.hx2.z) { mb *= M.hx2.z / ml; }
  let mw: vec2f = mb * (zc * U.camRight.w);
  var sa: vec2f = ax * (r * (st0 - 1.0));
  if (dot(sa, mw) < 0.0) { sa = -sa; }
  let sc: vec2f = sa + mw; let cl: f32 = length(sc);
  if (cl > 1e-4) { ax = sc / cl; }
  let rl: f32 = r + cl;
  // ...and it is far out of focus there: the same snow spread over a wider, softer disc, so that a handful of lumps close by run
  // together into a veil
  let bw: f32 = M.hx2.x * pow(max(1.0 - zc / 4.0, 0.0), 1.2);
  let rc: f32 = 0.42 * zc * U.camRight.w;
  let rb: f32 = min(sqrt(r * r + bw * bw), max(rc, r)); let ra: f32 = min(sqrt(rl * rl + bw * bw), max(rc * 1.5, r * st0));
  let st: f32 = ra / rb; let blur: f32 = max(1.0 - (r * r) / (rb * rb), 1.0 - smoothstep(1.4, 2.8, zc));
  dens *= (r * r * st0) / (ra * rb);
  if (dens < 0.0012) { return v; }
  let off: vec2f = ax * (corner.x * ra) + vec2f(-ax.y, ax.x) * (corner.y * rb);
  v.clip = U.viewProj * vec4f(pos + U.camRight.xyz * off.x + U.camUp.xyz * off.y, 1.0);
  v.uv = corner;
  // sun reaching this puff: through terrain, trees and the skier (shadow map)...
  let lx: vec3f = normalize(cross(vec3f(0.0, 1.0, 0.0), U.sunDir.xyz)); let ly: vec3f = cross(U.sunDir.xyz, lx);
  let sp: vec3f = pos + U.sunDir.xyz * (0.12 + r * 0.6); let rr: f32 = r * 0.6 + 0.05;
  var vis: f32 = 0.25 * (shadowFast(sp + lx * rr, 0.0015) + shadowFast(sp - lx * rr, 0.0015) + shadowFast(sp + ly * rr, 0.0015) + shadowFast(sp - ly * rr, 0.0015));
  // ...and through the rest of the curtain, taken at this corner of the lump so the shading runs smoothly across it
  let wc: vec3f = pos + U.camRight.xyz * (off.x * 0.7) + U.camUp.xyz * (off.y * 0.7);
  // (snow scatters almost without loss, and mostly forward: what the direct beam loses on the way in arrives a little later, sideways)
  let ts: f32 = sprayTau(wc, r * 0.5);
  vis *= 0.58 * exp(-0.85 * ts) + 0.42 * exp(-0.16 * ts);
  v.d0 = vec4f(dens / sqrt(st0), vis, zc, rb);
  v.d1 = vec4f(fract(seed * 13.7), fract(seed * 29.3), seed * 6.2832 + s.t * (fract(seed * 5.3) - 0.5) * 0.9, pow(s.lf, 0.7));
  // a lump's outline is noise, but the card it is drawn on is round: feather the last of the card so no lump ever ends on a perfect arc,
  // and more the nearer it is (a lone lump a few strides off is a soft tuft, never a disc with a rim)
  v.d2 = vec4f(a.a3.z, st, blur, mix(0.14, 1.0, 1.0 - smoothstep(3.0, 5.5, zc)));
  return v;
}`;

const PUFF_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut; o.color = vec4f(0.0);
  let q: vec2f = v.uv; let dd: f32 = dot(q, q);
  if (dd >= 1.0) { return o; }
  let k: f32 = 1.0 - dd;
  let e: f32 = v.d1.w;
  // A lump of thrown snow, built the way a cloud is: a soft round body, its outline pushed in and out by billows, then eaten away
  // where it is thin. The billows are counted on the lump (a handful round its rim, so they grow with it: a few centimetres as it
  // leaves the edge, a few decimetres once it hangs); the grain is counted in metres (a crumb every five or six centimetres), so a lump close by is
  // grainy at the scale real snow is. Thin snow breaks up into grains; the thick heart of a lump, and of a cloud where many overlap,
  // stays whole and smooth.
  let ang: f32 = v.d1.z;
  let cs: f32 = cos(ang); let sn: f32 = sin(ang);
  let qr: vec2f = vec2f(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  let n1: f32 = tex(tDetail, qr * 0.30 + v.d1.xy).z;
  let bill: f32 = 1.0 - abs(n1 - 0.5) * 2.6;                          // ridged: round tops, creased between (cauliflower)
  let lm: vec2f = vec2f(q.x * v.d2.y, q.y) * v.d0.w;                  // metres across the card
  let n2: f32 = tex(tDetail, lm * 0.85 + v.d1.yx * 3.0).z;
  var F: f32 = k + (bill - 0.45) * (0.34 + 0.40 * e) + (n2 - 0.5) * 0.7;
  let dsh: f32 = smoothstep(0.02, 0.30 + 0.35 * e, F);
  // erosion (as clouds are eroded): it bites only where the density is low, so the rim crumbles and the core is untouched
  var gn: f32 = 0.5;
  if (M.fc.y > 0.5) { gn = tex(tDetail, lm * 0.034 + v.d1.xy * 7.0).w; }
  let ek: f32 = (0.8 + 0.5 * e) * (1.0 - v.d2.z) * mix(0.6, 1.0, v.d2.x);
  let ee: f32 = saturate((gn * 0.9 + n2 * 0.5) * (1.0 - dsh * dsh) * ek);
  let de: f32 = saturate((dsh - ee) / max(1.0 - ee, 0.05));
  let m: f32 = mix(de * mix(0.55 + 0.45 * k, 0.40 + 0.60 * k, smoothstep(0.1, 0.5, e)) * smoothstep(0.0, v.d2.w, k), 1.5 * k * k, v.d2.z);
  let sz: f32 = linDepth(texFetchD(tDepth, vec2i(v.clip.xy) * 2, 0));
  let hh: f32 = v.d0.w * sqrt(k) + 0.02;
  let front: f32 = saturate((sz - (v.d0.z - hh)) / (2.0 * hh));
  // (no per-pixel shimmer here: in a half-resolution buffer it was a 2x2 checkerboard crawling over every veil)
  let tau: f32 = v.d0.x * m * front;
  // depth of this lump's near face (bulging, roughened by the same noise), weighted so the nearest lumps decide the cloud's visible surface
  // (the weight is bounded: a thick cloud close to the lens must not overflow the half-float buffer the lumps add up in)
  // (a fall or a hard landing piles a great deal of snow into one place: with a wider range than this the sums ran past what a half float
  // holds, and the picture had a black hole in it)
  let zf: f32 = clamp(v.d0.z - hh * (0.8 + 0.4 * bill) - U.dof.x, -4.5, 8.0);
  let w: f32 = exp(-max(zf, -1.5) * 1.4);
  o.color = vec4f(tau, tau * w * v.d0.y, tau * w * zf, tau * w);
  return o;
}`;

const PUFF_SUN_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec2f(0.0); v.d0 = vec4f(0.0);
  let s: PuffS = puffState(a.a0, a.a1, a.a2, a.a3);
  if (s.dens < 0.004) { return v; }
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let c: vec4f = U.shadowVP * vec4f(s.pos, 1.0);
  v.clip = vec4f((c.xy + corner * (s.r * 1.15 / U.misc.w)) * U.sprayT.x - U.sprayT.yz, 0.5, 1.0);
  // (M.sn.x: by night the moon's shadow of the cloud is as thin as the cloud is shown: a veil that can hardly be seen does not lay black blotches on the snow)
  v.uv = corner; v.d0 = vec4f(s.dens * M.sn.x, (c.z - U.sprayT.w) * 1199.0, 0.0, 0.0);
  return v;
}`;
const PUFF_SUN_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut; o.color = vec4f(0.0);
  let k: f32 = 1.0 - dot(v.uv, v.uv);
  if (k <= 0.0) { return o; }
  let t: f32 = v.d0.x * k * k * 0.75; let z: f32 = v.d0.y;
  o.color = vec4f(t, t * z, t * z * z, t);
  return o;
}`;

// the accumulated optical depth, lit as a snow cloud
const SPRAY_COMP_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut; o.color = vec4f(0.0, 0.0, 0.0, 1.0);
  var a: vec4f = texLod(tSpray, v.uv, 0.0);
  if (a.x < 0.0006) { return o; }
  // depth-aware upsample from half res so the cloud doesn't halo around the skier
  let zf: f32 = linDepth(texFetchD(tDepth, vec2i(v.clip.xy), 0));
  let hp: vec2f = v.clip.xy * 0.5 - 0.5; let h0: vec2f = floor(hp); let hf: vec2f = hp - h0;
  let mx: vec2i = vec2i(M.p.xy) - vec2i(1, 1);
  var acc: vec4f = vec4f(0.0); var wsum: f32 = 0.0;
  for (var j: i32 = 0; j < 4; j++) {
    let dx: i32 = j & 1; let dy: i32 = j >> 1;
    let tc: vec2i = clamp(vec2i(h0) + vec2i(dx, dy), vec2i(0, 0), mx);
    let zj: f32 = linDepth(texFetchD(tDepth, tc * 2, 0));
    let wb: f32 = mix(1.0 - hf.x, hf.x, f32(dx)) * mix(1.0 - hf.y, hf.y, f32(dy));
    let wz: f32 = 1.0 / (1.0 + sq((zj - zf) / (0.03 * zf + 0.03)));
    let w: f32 = (wb + 0.02) * wz;
    acc += texFetch(tSpray, tc, 0) * w; wsum += w;
  }
  a = clamp(acc / max(wsum, 1e-4), vec4f(-30000.0), vec4f(30000.0));
  if (a.x < 0.0005) { return o; }
  // (a soft knee, not a threshold: seen against the sun the faintest veil is bright, and a cut-off there draws the outline of a single lump)
  a.x = a.x * a.x / (a.x + 0.01);
  let vis: f32 = saturate(a.y / max(a.w, 1e-7));           // sun reaching the near face of the cloud (through terrain, skier and the cloud itself)
  let zr: f32 = a.z / max(a.w, 1e-7); let zm: f32 = zr + U.dof.x;
  let ndc: vec2f = vec2f(v.uv.x * 2.0 - 1.0, 1.0 - v.uv.y * 2.0);
  let d: vec3f = normalize(screenRay(ndc));
  let L: vec3f = U.sunDir.xyz; let mu: f32 = dot(d, L);
  // --- powder is not smoke. Hanging in the air it tears into veils and strands (a noise field anchored in the world, sinking with the snow,
  // read on the cloud's near face so it holds still while the camera moves), and where it is thin it breaks up into single winking specks.
  let tm: f32 = U.camPos.w;
  // (one noise at one frequency, read at a depth that steps from lump to lump, drew level contour lines over a curtain that had hung a
  // couple of seconds, like ripples on water: the field is warped by a coarser one of its own and the strands are a gentle modulation)
  let wq0: vec3f = (U.camPos.xyz + d * (zm / max(dot(d, U.camFwd.xyz), 0.2))) * 2.3 + M.q.xyz + vec3f(-U.wind.x, 0.9, -U.wind.z) * (tm * 0.9 - 256.0 * floor(tm * 0.9 / 256.0));
  let wwp: vec3f = vec3f(tnoise3(wq0 * 0.37 + vec3f(3.1, 0.0, 1.7)), tnoise3(wq0 * 0.37 + vec3f(8.3, 5.2, 0.4)), tnoise3(wq0 * 0.37 + vec3f(1.9, 9.6, 6.1))) - 0.5;
  let wq: vec3f = wq0 + wwp * 2.4;
  let w1: f32 = tnoise3(wq); let w2: f32 = tnoise3(wq * 2.9 + vec3f(7.3, 1.9, 4.4)); let w3: f32 = tnoise3(wq * vec3f(7.1, 2.3, 7.1) + vec3f(2.1, 8.4, 5.7));
  let wn: f32 = w1 * 0.50 + w2 * 0.30 + w3 * 0.20;
  let thin: f32 = 1.0 - smoothstep(0.25, 2.6, a.x);
  // (what hangs within a few strides of the lens is far out of focus: no strands and no specks there, only a soft bright veil)
  let sharp: f32 = smoothstep(1.8, 3.4, zm);
  var tau: f32 = a.x * mix(1.0, (0.35 + 1.3 * smoothstep(0.25, 0.75, wn)), (0.12 + 0.45 * thin) * M.p.w * sharp);
  let gs: f32 = 1170.0 / U.res.y;
  let gp: vec2f = v.clip.xy * (gs / 1.35);
  let s1: f32 = texLod(tNoise, (gp + vec2f(tm * 11.0, -tm * 37.0)) / 256.0, 0.0).x;
  let s2: f32 = texLod(tNoise, (gp * 0.57 + vec2f(-tm * 6.0, -tm * 17.0)) / 256.0 + vec2f(0.37, 0.61), 0.0).z;
  let spk: f32 = s1 * s2 * 4.0;
  // (by day the grain of the veil is the lumps' own eroded rims and the crystals that fly in it: screen-space pepper here only made
  // a sheet of white noise. The night keeps it: there it is the lamp catching crystals)
  tau *= mix(1.0, spk, 0.34 * (1.0 - smoothstep(0.08, 1.3, tau)) * M.q.w * sharp * M.r.y);
  // however much snow hangs between the lens and the skier, the figure is never lost in it: round the skier the cloud in front is only
  // ever so thick (thin veils are untouched; it is the solid wall that is held back)
  { let pc: vec4f = U.viewProj * vec4f(U.player.xyz + vec3f(0.0, 0.9, 0.0), 1.0);
    let dp: vec2f = (ndc - pc.xy / max(pc.w, 0.1)) * vec2f(U.camUp.w, 0.8);
    let hole: f32 = (1.0 - smoothstep(0.20, 0.62, length(dp))) * step(0.1, pc.w) * smoothstep(0.3, -0.5, zr) * M.r.x;
    // (by night the figure is a dark shape with a lamp on it, and takes less veiling than the bright figure of the day does)
    let cap: f32 = mix(40.0, mix(1.05, 0.6, M.r.y), hole);
    tau = cap * (1.0 - exp(-tau / cap)); }
  // by night a thick cloud close to the lens had nothing left in it: no strands (out of focus), no specks (too thick), and the cap round
  // the figure flattened what was left to one even tint, so it stood beside the skier as a pane of blue glass, its outline the crisp sum
  // of the lumps. By night it is grains in a beam, not a sheet: the edge is eaten away from outside in by a lumpy mask (how much of the
  // ring round this pixel is cloud, pushed about by the world noise), and inside it is torn into tufts and peppered with crystals at
  // any distance (a dark veil out of focus still shows its grain against the lamp; it is the bright day veil that goes smooth)
  if (M.r.y > 0.0) {
    // (two rings: a near one for the grain of the edge, a wide one, centred a little above, so the whole outline is eaten in and the top of
    // a curtain thins away into the dark instead of ending on a cut-out line; the wide ring is a share of the picture, not of texels, so
    // a curtain that fills half the frame from close by is eroded as much as a far one)
    let ra: f32 = w1 * 6.2832; var cs: f32 = 0.0; var cw: f32 = 0.0; let ax: f32 = M.p.y / M.p.x;
    let rs: f32 = (6.0 + 5.0 * w2) / M.p.y; let rw: f32 = 0.035 + 0.035 * w3;
    for (var j: i32 = 0; j < 8; j++) {
      let an: f32 = ra + f32(j) * 0.7854; let dv: vec2f = vec2f(cos(an) * ax, sin(an));
      cs += 1.0 - exp(-1.5 * texLod(tSpray, v.uv + dv * (rs * (1.0 + 0.6 * f32(j & 1))), 0.0).x);
      cw += 1.0 - exp(-1.2 * texLod(tSpray, v.uv + vec2f(0.0, -0.7 * rw) + dv * rw, 0.0).x);
    }
    // (a pixel on the very rim sees about half its ring in cloud: the mask must already be at nothing there, or the rim is a step)
    let cov: f32 = min(cs / 8.0, 0.25 + cw / 8.0);
    let em: f32 = smoothstep(0.50, 1.0, cov + (wn - 0.5) * 0.6);
    let tuft: f32 = mix(0.25, 1.6, smoothstep(0.30, 0.66, wn)) * mix(0.55, 1.35, smoothstep(0.35, 0.75, w3));
    let grit: f32 = mix(1.0, spk, 0.45);
    // (and however thick it is, the eroded band stays see-through: a thick cloud times a thin mask is still a wall with a sharp rim)
    let tq: f32 = min(tau * em * tuft * grit, 0.05 + 4.0 * em * em);
    tau = mix(tau, tq, M.r.y);
  }
  if (tau < 0.00002) { return o; }
  let T: f32 = exp(-tau);
  // --- a little relief: the slope of the cloud's near face gives a normal, so billows read as billows (kept gentle: this is powder, not cotton)
  let e: vec2f = 2.5 / M.p.xy;
  let lim: vec4f = vec4f(30000.0);
  let x0: vec4f = clamp(texLod(tSpray, v.uv - vec2f(e.x, 0.0), 0.0), -lim, lim); let x1: vec4f = clamp(texLod(tSpray, v.uv + vec2f(e.x, 0.0), 0.0), -lim, lim);
  let y0: vec4f = clamp(texLod(tSpray, v.uv - vec2f(0.0, e.y), 0.0), -lim, lim); let y1: vec4f = clamp(texLod(tSpray, v.uv + vec2f(0.0, e.y), 0.0), -lim, lim);
  let zx0: f32 = mix(zr, x0.z / max(x0.w, 1e-7), saturate(x0.x * 3.0)); let zx1: f32 = mix(zr, x1.z / max(x1.w, 1e-7), saturate(x1.x * 3.0));
  let zy0: f32 = mix(zr, y0.z / max(y0.w, 1e-7), saturate(y0.x * 3.0)); let zy1: f32 = mix(zr, y1.z / max(y1.w, 1e-7), saturate(y1.x * 3.0));
  let mpu: vec2f = vec2f(2.0 * zm * U.camRight.w * U.camUp.w, 2.0 * zm * U.camRight.w);          // metres per unit uv at that depth
  var gr: vec2f = vec2f(zx1 - zx0, zy1 - zy0) / (2.0 * e * mpu) * M.p.z;
  // the strands have relief too
  gr = (gr + vec2f(w2 - 0.5, w1 - 0.5) * 0.9) * sharp;
  // (the relief is for the thick body of a cloud seen from some way off. Close by and where it is thin, a normal from the depth of the
  // near face lit the curtain like the sunny side of a dune: a solid thing. There the light comes from how much snow it passes through)
  let body: f32 = smoothstep(0.25, 1.8, tau);
  gr *= mix(body * smoothstep(5.0, 14.0, zm) + 0.15, 1.0, M.r.y);
  let gl: f32 = length(gr); gr = gr * (min(gl, 3.0) / max(gl, 1e-4));
  let nv: vec3f = normalize(vec3f(gr.x, -gr.y, 1.0));
  let Nw: vec3f = U.camRight.xyz * nv.x + U.camUp.xyz * nv.y - U.camFwd.xyz * nv.z;
  let ndl: f32 = dot(Nw, L);
  let sun: vec3f = U.sunCol.rgb * vis;
  // (1) the veil: light scattered once on its way through. Thin and against the sun = blazing
  let wbk: f32 = sq(saturate(mu)); let wfr: f32 = sq(saturate(-mu)); let wsd: f32 = 1.0 - wbk - wfr;
  let S1: f32 = wbk * tau * T + (wsd * (1.0 - T) + wfr * 0.5 * (1.0 - T * T)) * 0.5;
  let ph: f32 = (0.50 * hg(mu, 0.86) + 0.38 * hg(mu, 0.40) + 0.12 * hg(mu, -0.30)) * 12.566;
  var col: vec3f = sun * ph * S1 * 1.1;
  // (2) the body: where it is thick it is a white solid with a lit side and a shaded side. How lit is the sun that reaches this part of
  // its near face through the rest of the cloud (vis: from the cloud as the sun sees it), not a fixed share: under a side light the
  // half toward the sun is white-hot and the far half is in the cloud's own shadow
  let wrapD: f32 = mix(0.92, pow(saturate((ndl + 0.45) / 1.45), 1.25), body * smoothstep(5.0, 14.0, zm));
  // (white in the end: the light that comes back out of a thick cloud has been round many crystals and has lost some of the sun's tint)
  let sunN: vec3f = mix(sun, vec3f(luma(sun)), 0.3);
  col += sunN * (1.0 - T) * 0.95 * wrapD * mix(0.70, 1.0, body);
  // (3) light that got in on the sunny side and was scattered again (two more orders, each weaker, less forward and reaching deeper:
  // Wrenninge's octaves; vis^a is the sun's transmittance through a times the snow). It is what keeps a backlit core a soft grey and
  // not black, and what is left on the shaded side; by then it has lost the sun's warmth to the blue of the sky
  let ph2: f32 = (0.5 * hg(mu, 0.43) + 0.5 * hg(mu, 0.20)) * 12.566; let ph3: f32 = (0.5 * hg(mu, 0.21) + 0.5 * hg(mu, 0.10)) * 12.566;
  let skyT: vec3f = U.ambSky.rgb / max(luma(U.ambSky.rgb), 1e-5);
  let msC: vec3f = mix(U.sunCol.rgb, vec3f(luma(U.sunCol.rgb)), 0.3) * mix(vec3f(1.0), mix(vec3f(1.0), skyT, 0.6), 1.0 - vis);
  col += msC * ((1.0 - T) * (0.50 * mix(ph2, 1.2, body) * pow(vis, 0.5) + 0.30 * mix(ph3, 1.2, body) * pow(vis, 0.25)));
  // (4) the sky: from above blue, from below the white of the snow under it (weaker), less of either deep inside a thick cloud
  let up: f32 = Nw.y * 0.5 + 0.5;
  let occ: f32 = mix(1.0, 0.72, body);
  let amb: vec3f = (U.ambSky.rgb * (1.9 + 1.3 * up) + (U.ambGnd.rgb * 0.8 + U.sunCol.rgb * 0.035) * (1.0 - 0.6 * up)) * occ;
  col += amb * (1.0 - T);
  // (the night below keeps the shading it had)
  let deep: f32 = pow(vis, 0.35);
  let wrapN: f32 = pow(saturate((ndl + 0.45) / 1.45), 1.25);
  // (and whatever of it hangs in the beam of the headlamp)
  if (U.lamp.w > 0.0) { col += lampLight(U.camPos.xyz + d * (zm / max(dot(d, U.camFwd.xyz), 0.2))) * ((1.0 - T) * 0.55); }
  var To: f32 = T;
  // ---- by night none of the above will do. Those are the sun's formulas, and with the moon's light put through them (it is as grey as the
  // sun's is, and it hangs over the valley ahead, so the lens looks against it all night) the cloud was a bright grey fog on dark blue snow,
  // with the figure a ghost behind it and every shaded part of it a dark blotch. By night snow in the air shows where something lights it: in
  // the cone of the headlamp it glows and sparkles; the moon gives it a cold, faint edge; the town far off, a trace. The rest of it is all but
  // unseen: what a veil that swallows no light takes out of the dark behind it, it gives back from the dark around it. So there it is thin,
  // and as blue as the night is. (M.r.y: 0 by day, at golden hour and at dusk, which keep every digit of the above; 1 in the night proper)
  if (M.r.y > 0.0) {
    let tn: f32 = tau * mix(0.55, 0.75, M.r.z); let Tn: f32 = exp(-tn);
    let moon: vec3f = U.sunCol.rgb * vec3f(0.56, 0.78, 1.16) * (vis * mix(1.0, 2.1, M.r.z));
    // (against the moon the veil has a silver edge: it does not blaze as it does against the sun)
    let S1n: f32 = wbk * tn * Tn + (wsd * (1.0 - Tn) + wfr * 0.5 * (1.0 - Tn * Tn)) * 0.5;
    // (snow in the air by night is seen only where a light finds it. Outside the lamp's cone that is the moon alone, and the moon picks out
    // wisps, not a sheet: what it lights is torn by the same world noise as the edge, and the rest of the cloud is all but nothing.
    // With a constant ambient fill and the moon lighting all of it evenly, the curtain behind the skier read as a grey poster)
    let wisp: f32 = smoothstep(0.42, 0.78, wn) * smoothstep(0.30, 0.70, w3);
    var cn: vec3f = moon * ((min(ph, 1.4) * S1n * 0.8 + (1.0 - Tn) * mix(0.16, 0.55 * wrapN, smoothstep(0.25, 1.8, tn))) * (0.30 + 1.40 * wisp));
    // the dark around it: the sky, and the moonlit slope it hangs over, which is the largest light there is by night (a veil over that
    // snow has that snow's brightness, give or take: shaded with the sky alone it stood on the slope as a wall of dark smoke)
    // (but it is only what the cloud takes out of the snow behind it, given back: the cloud itself takes out little (see To below), so
    // this is a faint grey haze over the dark, and over lit snow next to nothing: it neither darkens that snow nor paints it blue)
    let ambN: vec3f = U.ambSky.rgb * (1.1 + 0.6 * up) + U.ambGnd.rgb * 0.95;
    cn += (mix(ambN, vec3f(luma(ambN)), 0.6) * 0.18 + moon * (0.05 * deep)) * ((1.0 - Tn) * (0.25 + 0.75 * wisp));
    // the town: a trace of its warmth in whatever hangs toward it
    cn += vec3f(1.0, 0.50, 0.42) * (0.0045 * U.skyP.z * (0.35 + 0.65 * sq(saturate(dot(d.xz, M.c.xy)))) * (1.0 - Tn));
    // the headlamp. It is the one light close enough to show how much snow there is, so it sees all of it (not the thinned veil).
    // Thin snow passes the beam on, most of it straight ahead: looked at against the lamp it blazes, from behind the lamp it glows.
    // Thick snow is a white face turned to the lamp. And it is crystals: here and there one of them throws the lamp straight back.
    if (U.lamp.w > 0.0) {
      let P1: vec3f = U.camPos.xyz + d * (zm / max(dot(d, U.camFwd.xyz), 0.2));
      // (the cone, and round the skier what the lamp spills sideways and what its pool on the snow throws back up: the turn's own snow is
      // beside and behind the lamp, never in its cone, and without this the skier's light did not touch the snow the skier throws)
      let dl: vec3f = P1 - U.lamp.xyz; let r2: f32 = dot(dl, dl); let cl: f32 = dot(dl, U.lampDir.xyz) / sqrt(max(r2, 1e-4));
      // (the spill is a glow, not a flood: at full strength it lit the whole near curtain behind the skier to one flat grey slab)
      let E: vec3f = lampLight(P1) + vec3f(1.0, 0.85, 0.64) * (U.lamp.w * 0.004 * smoothstep(-0.6, 0.3, cl) / (r2 + 6.0));
      let ml: f32 = dot(d, -dl) / sqrt(max(r2, 1e-4));
      // (the peak is held down: unheld, the whole cloud burnt out to one white shape against the lamp, thick and thin alike. Held, the thick
      // of it stands dark in a bright rim, as snow against a light does. And it is in thin snow that single crystals show)
      let phl: f32 = min((0.50 * hg(ml, 0.86) + 0.38 * hg(ml, 0.40) + 0.12 * hg(ml, -0.30)) * 12.566, 3.5);
      let glit: f32 = smoothstep(0.70, 1.0, s1) * smoothstep(0.40, 1.0, s2) * 14.0 * max(sharp, 0.6) * (1.0 - 0.6 * smoothstep(0.6, 2.5, tau));
      // (lit snow in the air is crystals and tufts, lit unevenly: the same world noise the edge is torn by, so it is never one even face)
      let tl: f32 = mix(0.15, 1.6, smoothstep(0.30, 0.70, wn));
      cn += E * ((phl * tau * T + (1.0 - T) * mix(0.30, 0.60, saturate(0.5 - 0.5 * ml))) * (tl + glit));
    }
    // the night cloud is light added, not a dye: it takes at most a tenth of what is behind it (real crystals off the lamp are all but
    // clear; it was its absorption, at full strength, that laid a dark blue smear over the lit kicker)
    col = mix(col, cn, M.r.y); To = mix(T, 1.0 - 0.10 * (1.0 - Tn), M.r.y);
  }
  o.color = vec4f(col, To);
  return o;
}`;

const GRAIN_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let t: f32 = U.camPos.w - a.a0.w; let life: f32 = a.a2.z;
  var g: GlintV = glintCull(); var cc: vec4f = vec4f(0.0);
  if (t > 0.0 && t < life) {
    let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
    // (a2 = how far the air lets its throw carry, the speed it falls at in the end, life, light: a crumb flies an arc, a flake rides the sheet's air)
    let seed: f32 = a.a1.w; let vs: f32 = a.a2.y; let wk: f32 = saturate(1.2 - vs * 0.25);
    let fy: Fly = snowFly(a.a0.xyz, a.a1.xyz, t, a.a2.x, 0.65 + 0.2 * vs, vs, wk);
    var pos: vec3f = fy.pos; let vel: vec3f = fy.vel;
    // flutter of the light flakes
    let fl: f32 = wk * smoothstep(0.2, 1.5, t) * 0.10;
    pos += fl * vec3f(sin(seed * 191.7 + t * 3.1), 0.5 * sin(seed * 77.3 + t * 2.3), cos(seed * 131.1 + t * 2.7));
    if (pos.y > groundH(pos) + 0.015) {
      let lf: f32 = t / life;
      // (right at the lens they would be discs and bars across the picture: they thin out before that)
      let zv: f32 = max(dot(pos - U.camPos.xyz, U.camFwd.xyz), 0.3);
      let fade: f32 = smoothstep(0.0, 0.02, t) * (1.0 - lf * lf * lf) * smoothstep(0.7, 2.6, zv);
      let power: f32 = a.a2.w * fade;
      let ts: f32 = sprayTau(pos, 0.1);
      let visC: f32 = 0.58 * exp(-0.85 * ts) + 0.42 * exp(-0.16 * ts);
      let vis: f32 = shadowFast(pos, 0.0015) * visC;
      // every one of them is a crumb of snow with a size of its own (most a few millimetres, a few the size of a hazelnut)
      let rc: f32 = (0.0032 + 0.011 * pow(fract(seed * 7.77), 3.0)) * (0.5 * U.res.y / U.camRight.w) / zv;
      // (by night, M.gp.z: the moon's sparks are fewer and fainter, the lamp's flashes carry it. glintQuad's moon light goes with power * vis,
      // its lamp light with power alone)
      let nt: f32 = M.gp.z; let pm: f32 = mix(1.0, 2.2, nt);
      g = glintQuad(corner, pos, vel, seed, power * pm, vis * mix(1.0, mix(0.40, 0.80, M.gp.w) / 2.2, nt), min(rc, 0.006 * U.res.y), M.gp.y);
      let foot: f32 = 3.14159 * g.shp.y * g.shp.y + 4.0 * g.shp.y * g.shp.x;
      // (one that is down in the shade of the cloud is lost in it: it is the ones flung clear, in the sun, that show. And the ones that go
      // past within a few strides of the lens are a blur of a blur: left in, they are bars across the sky, like rain on the glass)
      cc = vec4f(U.sunCol.rgb * (0.08 + 0.66 * vis) + U.ambSky.rgb * 1.5, min(1.0, 3.14159 * rc * rc / max(foot, 1e-3)) * 0.92 * fade * smoothstep(0.30, 0.85, vis) * smoothstep(2.4, 5.2, zv) * M.gp.x);
      // (by night a crumb is as cold and faint as the veil it flies in, unless the lamp has it: left as by day, they were dark pepper on a bright fog)
      if (nt > 0.0) {
        let ll: vec3f = lampLight(pos);
        let cn: vec3f = U.sunCol.rgb * vec3f(0.56, 0.78, 1.16) * ((0.05 + 0.36 * vis) * mix(1.0, 2.1, M.gp.w)) + (U.ambSky.rgb * 1.3 + U.ambGnd.rgb * 0.6) * 0.3 + ll * 1.2;
        let an: f32 = min(1.0, 3.14159 * rc * rc / max(foot, 1e-3)) * 0.92 * fade * max(smoothstep(0.30, 0.85, vis), saturate(ll.x * 6.0)) * smoothstep(2.4, 5.2, zv) * M.gp.x;
        cc = mix(cc, vec4f(cn, an), nt);
      }
    }
  }
  v.clip = g.clip; v.uv = g.uv; v.shp = g.shp; v.col = g.col; v.cc = cc;
  return v;
}`;
