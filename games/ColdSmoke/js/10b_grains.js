"use strict";
// ---------------------------------------------------------------- the grains in thrown snow: glinting crystals and clumps
// Thrown snow is three sizes of thing at once (RESEARCH.md appendix A1). The fine dust is the cloud (10_spray.js). This file draws the other two:
//   crystals — single plates and grains a millimetre or two across. They outrun the smoke, ride the air and settle at under a metre a second,
//              so they are still falling, glittering, after the cloud has thinned. Each is a tiny mirror tumbling several times a second:
//              most of the time a faint point of forward-scattered light (against the sun every one of them shows), and now and then,
//              when a face turns through the angle that throws the sun at the lens, a flash. Tens of thousands of them, stateless like the
//              spray: a launch record each, the flight in closed form on the GPU.
//   clumps   — lumps of the surface a few centimetres across. Heavy enough to fly true arcs, so they are drawn as small solid things with
//              a lit side and a shaded side, tumbling, shedding a wisp as they go, and breaking up in a puff where they come down. When they
//              come down is worked out as they are thrown (Course.height), so the puff, the crumbs and the pock in the snow are laid on then.
// Both are fed by the spray's emission events (Spray.onEmit) and can be thrown directly (Grains.crystals, Grains.clumps: trees, landings).

const CRYSTAL_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  var g: GlintV = glintCull();
  let t: f32 = U.camPos.w - a.a0.w; let life: f32 = a.a2.z;
  if (t > 0.0 && t < life) {
    let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
    // (a2 = how far the air lets its throw carry, the speed it settles at, life, how much light it has)
    let seed: f32 = a.a1.w; let vs: f32 = a.a2.y;
    let fy: Fly = snowFly(a.a0.xyz, a.a1.xyz, t, a.a2.x, 0.55, vs, 0.95);
    var pos: vec3f = fy.pos; var vel: vec3f = fy.vel;
    // a plate does not settle straight down: once its throw is spent it rocks and glides to and fro, a few centimetres, a turn or two a second
    let fq: f32 = 5.0 + 6.0 * fract(seed * 23.17); let fa: f32 = (0.02 + 0.05 * fract(seed * 5.71)) * smoothstep(0.15, 0.9, t);
    let ph: f32 = seed * 61.3 + t * fq;
    pos += vec3f(cos(ph), 0.0, sin(ph * 0.77)) * fa;
    vel += vec3f(-sin(ph), 0.0, 0.77 * cos(ph * 0.77)) * (fa * fq);
    if (pos.y > groundH(pos) + 0.01) {
      let rel: vec3f = pos - U.camPos.xyz; let zv: f32 = dot(rel, U.camFwd.xyz);
      let lf: f32 = t / life;
      let fade: f32 = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.6, 1.0, lf)) * smoothstep(0.3, 0.9, zv) * a.a2.w;
      if (fade > 0.002) {
        // (never smaller than about a pixel: a point of light much smaller than the pixels it falls between would only flicker as it moves)
        g = glintQuad(corner, pos, vel, seed, 1.0, 1.0, M.cr.z, M.cp.w);
        if (g.shp.y > 0.0) {
          let V: vec3f = -rel / max(length(rel), 1e-3); let L: vec3f = U.sunDir.xyz; let mu: f32 = dot(-V, L);
          // seen through the cloud: how much of the thrown cloud lies in front of it (its optical depth, and the depth of its near face).
          // Inside the thick heart of a curtain no crystal shows, as in the real thing; in the thin veil round it they all do
          let cp: vec4f = U.viewProj * vec4f(pos, 1.0); let ndc: vec2f = cp.xy / cp.w;
          let hp: vec2i = clamp(vec2i((vec2f(ndc.x, -ndc.y) * 0.5 + 0.5) * U.res.xy * 0.5), vec2i(0, 0), vec2i(M.cq.xy));
          let oc: vec4f = clamp(texFetch(tOcc, hp, 0), vec4f(-30000.0), vec4f(30000.0));
          var Tv: f32 = 1.0;
          if (oc.x > 0.001 && oc.w > 1e-7) { let zn: f32 = oc.z / oc.w + U.dof.x; Tv = exp(-M.cr.x * oc.x * smoothstep(zn - 0.4, zn + 1.2, zv)); }
          // the sun reaching it: through the terrain, the trees, the skier, and the cloud on the sun's side
          let ts: f32 = sprayTau(pos, 0.1);
          let vis: f32 = shadowFast(pos, 0.0015) * (0.58 * exp(-0.85 * ts) + 0.42 * exp(-0.16 * ts));
          // The flash. Turning a few times a second, a face lines up with the sun now and then: a chance event, drawn afresh in every slice
          // of time a crystal takes to turn through a few degrees (a slice spans two or three frames, so a flash is never a one-frame speck
          // of noise). There are more of them toward the sun, where light bent through the plate joins what its faces reflect.
          let tm: f32 = U.camPos.w;
          let sr: f32 = 14.0 + 22.0 * fract(seed * 7.31);
          let sl: f32 = tm * sr + seed * 917.0; let k: f32 = floor(sl); let fr: f32 = sl - k;
          let hs: u32 = pcg(u32(seed * 16777215.0) ^ pcg(u32(k)));
          let h1: f32 = u2f(hs); let h2: f32 = u2f(pcg(hs + 7u)); let h3: f32 = u2f(pcg(hs + 13u));
          let back: f32 = smoothstep(-0.1, 0.92, mu);
          let pf: f32 = M.cp.x * (0.33 + 0.67 * back);
          let env: f32 = sin(3.14159 * fr);
          let Hh: vec3f = normalize(V + L + vec3f(0.0, 1e-4, 0.0));
          let fres: f32 = 0.04 + 0.96 * pow(1.0 - saturate(dot(Hh, L)), 5.0);
          // (most flashes are a glint; a few blaze)
          let str: f32 = 0.3 + 0.7 * h2 * h2;
          var e: f32 = 0.0; var fl: f32 = 0.0;
          if (h1 < pf) { fl = str * env; e = M.cp.y * fl * (0.25 + 1.2 * fres + 1.5 * back); }
          // between flashes: what a crystal scatters forward. Against the sun every one of them is a point of light; away from it, nothing
          e += M.cq.z * min(hg(mu, 0.8) * 12.566, 12.0) * (0.3 + 0.7 * fract(seed * 3.37));
          // and what any grain does in sunlight whichever way it is seen: a speck of white, lit on the side toward the sun. So thrown snow
          // reads as grit and not only as smoke, front-lit and side-lit too (the owner: '主动摩擦起来的雪' has to show its particles)
          e += M.cr.y * (0.4 + 1.2 * fract(seed * 5.13)) * (0.45 + 0.55 * saturate(-mu * 0.5 + 0.5));
          var gc: vec3f = U.sunCol.rgb * (e * vis * M.cp.z);
          // the headlamp: crystals in its beam flash back at it, and the lens is just behind it
          if (U.lamp.w > 0.0) {
            let ll: vec3f = lampLight(pos);
            if (ll.x > 0.00002) { var el: f32 = 0.10; if (h3 < M.cp.x * 0.9) { el += M.cq.w * str * env; fl = max(fl, str * env); } gc += ll * el; }
          }
          // the same light spread over the footprint it is drawn on (a crystal blurred into a lens disc is dimmer per pixel, not brighter)
          let sc: f32 = max(U.res.y / 1170.0, 0.75);
          let area: f32 = 3.14159 * g.shp.y * g.shp.y + 4.0 * g.shp.y * g.shp.x;
          let kA: f32 = (3.14159 * 0.85 * 0.85 * sc * sc) / pow(area, 0.78);
          let hue: vec3f = mix(vec3f(1.0, 0.86, 0.62), vec3f(0.62, 0.86, 1.0), fract(seed * 11.0));
          gc *= mix(vec3f(1.0), hue, 0.22 * saturate(fl * 3.0)) * (kA * Tv * fade);
          if (max(gc.r, max(gc.g, gc.b)) < 2e-5) { g = glintCull(); } else { g.col = vec4f(gc, fl); }
        }
      }
    }
  }
  v.clip = g.clip; v.uv = g.uv; v.shp = g.shp; v.col = g.col;
  return v;
}`;

// a clump: a camera-facing card with a lumpy disc on it, smeared along its motion over the shutter, lit as a white solid
// a0 = (launch position, launch time), a1 = (launch velocity, seed), a2 = (drag time constant, terminal speed, time to impact, size), a3 = (wind it drifts with x z, tumble rad/s, -)
const CLUMP_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec2f(0.0); v.k0 = vec4f(0.0); v.k1 = vec4f(0.0); v.k2 = vec4f(0.0); v.k3 = vec4f(0.0); v.k4 = vec4f(0.0);
  let t: f32 = U.camPos.w - a.a0.w;
  if (t <= 0.0 || t >= a.a2.z) { return v; }
  let tau: f32 = a.a2.x; let size: f32 = a.a2.w;
  // the flight with a linear drag whose terminal speed is the clump's: it starts off falling at g, and a lump of snow is nowhere near its
  // terminal speed (8-12 m/s) before it lands, so this is a true arc. The same formula runs on the CPU to find where it lands
  let vT: vec3f = vec3f(a.a3.x, -a.a2.y, a.a3.y);
  let ex: f32 = exp(-t / tau);
  let pos: vec3f = a.a0.xyz + (a.a1.xyz - vT) * (tau * (1.0 - ex)) + vT * t;
  let vel: vec3f = (a.a1.xyz - vT) * ex + vT;
  let rel: vec3f = pos - U.camPos.xyz; let zv: f32 = dot(rel, U.camFwd.xyz);
  if (zv < 0.45) { return v; }
  let cp: vec4f = U.viewProj * vec4f(pos, 1.0); let ndc: vec2f = cp.xy / cp.w;
  if (abs(ndc.x) > 1.2 || abs(ndc.y) > 1.2) { return v; }
  let sc: f32 = U.res.y / 1170.0;
  let rp: f32 = 0.5 * size * U.res.y / (2.0 * U.camRight.w * zv);
  let coc: f32 = min(U.dof.y * abs(1.0 / U.dof.x - 1.0 / zv), U.dof.z) * sc;
  let R: f32 = sqrt(rp * rp + coc * coc + 0.3 * sc * sc);
  // where it was a shutter ago: a streak (a little longer than the real shutter, as the spray's grains are)
  let pp: vec4f = U.prevViewProj * vec4f(pos - vel * U.misc.z, 1.0);
  var mv: vec2f = vec2f(0.0);
  if (pp.w > 0.05) { mv = (ndc - pp.xy / pp.w) * vec2f(0.5, -0.5) * U.res.xy * (U.dof.w * M.kp.x / max(U.misc.z, 0.004)); }
  var ml: f32 = length(mv); var ax: vec2f = vec2f(1.0, 0.0);
  if (ml > 0.3) { ax = mv / ml; } else { ml = 0.0; }
  ml = min(ml, 0.1 * U.res.y);
  let hl: f32 = ml * 0.5;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let lp: vec2f = corner * vec2f(hl + R * 1.15 + 1.5, R * 1.15 + 1.5);
  let opx: vec2f = ax * lp.x + vec2f(-ax.y, ax.x) * lp.y;
  v.clip = vec4f((ndc + opx * vec2f(2.0, -2.0) * U.res.zw) * cp.w, cp.z, cp.w);
  v.uv = lp;
  // behind the thick of the cloud it is lost; in the thin of it, veiled
  let hp: vec2i = clamp(vec2i((vec2f(ndc.x, -ndc.y) * 0.5 + 0.5) * U.res.xy * 0.5), vec2i(0, 0), vec2i(M.kq.xy));
  let oc: vec4f = clamp(texFetch(tOcc, hp, 0), vec4f(-30000.0), vec4f(30000.0));
  var Tv: f32 = 1.0;
  // (a lump is solid: in the photos the ones in the near face of a powder cloud show as specks on it, only those deep inside are lost)
  if (oc.x > 0.001 && oc.w > 1e-7) { let zn: f32 = oc.z / oc.w + U.dof.x; Tv = exp(-0.45 * oc.x * smoothstep(zn - 0.1, zn + 1.2, zv)); }
  let ts: f32 = sprayTau(pos, 0.05);
  let vis: f32 = shadowFast(pos, 0.002) * (0.58 * exp(-0.85 * ts) + 0.42 * exp(-0.16 * ts));
  // a smeared or blurred lump covers less of each pixel it is spread over
  let cov: f32 = min(1.0, (rp * rp + 0.3 * sc * sc) / (R * R)) / (1.0 + 0.9 * hl / R);
  // (one within a stride or two of the lens is a blur crossing the picture in a frame: left in, a near one is a flat chip as big as a hand)
  let fade: f32 = smoothstep(0.0, 0.025, t) * smoothstep(0.9, 2.4, zv) * M.kp.z;
  v.k0 = vec4f(hl, R, rp, zv);
  v.k1 = vec4f(ax, a.a1.w * 6.2832 + t * a.a3.z, cov * fade * Tv);
  v.k2 = vec4f(vis, a.a1.w, dot(normalize(rel), U.sunDir.xyz), size);
  var ll: vec3f = vec3f(0.0); var Ld: vec3f = vec3f(0.0, 1.0, 0.0);
  if (U.lamp.w > 0.0) { ll = lampLight(pos); Ld = normalize(U.lamp.xyz - pos); }
  v.k3 = vec4f(ll, 0.0); v.k4 = vec4f(Ld, 0.0);
  return v;
}`;
const CLUMP_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut; o.color = vec4f(0.0);
  let hl: f32 = v.k0.x; let R: f32 = v.k0.y; let rp: f32 = v.k0.z;
  // the nearest point of the streak, in units of the drawn radius
  let q: vec2f = vec2f(v.uv.x - clamp(v.uv.x, -hl, hl), v.uv.y) / R;
  let r: f32 = length(q);
  if (r > 1.2) { return o; }
  // the scene in front of it hides it
  let sz: f32 = linDepth(texFetchD(tDepth, vec2i(v.clip.xy), 0));
  if (v.k0.w > sz + 0.04) { return o; }
  // back to the axes of the screen (x right, y down)
  let ax: vec2f = v.k1.xy; let s: vec2f = vec2f(ax.x * q.x - ax.y * q.y, ax.y * q.x + ax.x * q.y);
  // a lump, not a ball: its outline goes in and out, and turns as it tumbles (blurred, the detail goes)
  let sd: f32 = v.k2.y * 40.0; let ph: f32 = v.k1.z; let th: f32 = atan2(s.y, s.x);
  let sharp: f32 = rp / R;
  let rim0: f32 = 0.80 + 0.11 * sin(2.0 * th + ph + sd) + 0.08 * sin(3.0 * th - 1.3 * ph + sd * 1.7) + 0.05 * sin(5.0 * th + 2.1 * ph + sd * 2.3);
  let rim: f32 = mix(0.92, rim0, sharp);
  let w: f32 = max(1.4 / R, 1.0 - sharp);
  var al: f32 = smoothstep(rim + 0.5 * w, rim - 0.5 * w, r);
  if (al < 0.003) { return o; }
  // its normal: a ball's, bent by a few knobs that turn with it
  var nxy: vec2f = vec2f(s.x, -s.y) / rim;
  nxy += 0.22 * vec2f(sin(s.x * 5.0 + ph * 1.3 + sd), cos(s.y * 4.0 - ph + sd * 0.7)) * sharp;
  let l2: f32 = dot(nxy, nxy);
  if (l2 > 0.97) { nxy *= sqrt(0.97 / l2); }
  let nz: f32 = sqrt(max(1.0 - dot(nxy, nxy), 0.0));
  let N: vec3f = normalize(U.camRight.xyz * nxy.x + U.camUp.xyz * nxy.y - U.camFwd.xyz * nz);
  // lit as the snow it came from: the sun on the side that faces it (a little wrapped: snow is translucent), the blue sky on the rest,
  // the bright slope from below, and the lamp after dark
  let L: vec3f = U.sunDir.xyz;
  let wrap: f32 = saturate((dot(N, L) + 0.2) / 1.2);
  let amb: vec3f = U.ambSky.rgb * (1.3 + 0.8 * N.y) + U.ambGnd.rgb * (0.50 - 0.45 * N.y) + twiLight(N);
  var col: vec3f = 0.9 * (U.sunCol.rgb * (wrap * v.k2.x) + amb);
  col += v.k3.rgb * (0.9 * saturate(dot(N, v.k4.xyz)) + 0.1);
  // a lump of snow is not a stone: light gets into it and out again. Seen against the sun its edge glows, and even its shaded side is lit
  // a little from inside (with the sun behind it, a pure diffuse ball read as a grey pebble lying on the bright snow)
  let mu: f32 = v.k2.z;
  col += U.sunCol.rgb * (v.k2.x * (0.18 + 0.55 * saturate(mu) * pow(1.0 - nz, 2.0) + 0.25 * hg(mu, 0.5) * 12.566 * 0.12));
  // (and a crumb a centimetre across is thin enough that the sun comes through it whole: against the sun the small ones glow, they are not
  // grey chips. The bigger the lump, the more of it is its own shade)
  let thin: f32 = 1.0 - 0.7 * smoothstep(0.012, 0.07, v.k2.w);
  col += U.sunCol.rgb * (v.k2.x * thin * 2.6 * pow(saturate(mu), 2.0));
  // (no two alike: some catch more of the light than others)
  col *= 0.7 + 0.6 * fract(v.k2.y * 23.7);
  // (by night a clump is as faint as the veil it flies in unless the lamp has it: a dark fleck on the moonlit snow reads as dirt)
  al *= v.k1.w * mix(1.0, saturate(0.25 + luma(v.k3.rgb) * 8.0), M.kp.w);
  o.color = vec4f(col * al, al);
  return o;
}`;

const Grains = (() => {
  const G = { NC: 49152, CF: 12, NK: 8192, KF: 16, enabled: true,
    // the crystals' light: how many of them flash in a slice of time (toward the sun), how bright a flash is, how bright the forward glow between
    flashP: 0.16, flashK: 70, glowK: 0.05, lampK: 9, shutK: 0.5, clumpShut: 1.5,
    // (occK: how much of the cloud's optical depth in front of a crystal hides it; rmin: the smallest drawn radius, px at 1170 lines)
    occK: 0.6, rmin: 0.75,
    // (gritK: how bright a grain is just for being white snow in the sun, between its flashes)
    gritK: 0.25,
    stats: { crystals: 0, clumps: 0, impacts: 0, deposits: 0, ms: 0 } };
  // the owner's choices. sparkle: a = none of this (the spray's own grains only), b = as real backlit spray measures, c = a little more.
  // clumps: a = none, b = as many as real turns and landings throw, c = more
  if (typeof Variants !== 'undefined') {
    Variants.def('sparkle', '闪光', [['a', '没有冰晶群'], ['b', '真实'], ['c', '再多一点']], 'b');
    Variants.def('clumps', '雪团', [['a', '没有'], ['b', '真实'], ['c', '多一些']], 'b');
  }
  const GRK = { a: 0, b: 1, c: 1.6 }, SPK = { a: 0, b: 1, c: 1.7 }, CLK = { a: 0, b: 1, c: 2.2 };
  const GNK = { a: 0, b: 1, c: 1.8 }, gritN = () => typeof Variants !== 'undefined' ? GNK[Variants.val.sparkle] ?? 1 : 1;
  const sparkK = () => typeof Variants !== 'undefined' ? SPK[Variants.val.sparkle] ?? 1 : 1;
  const clumpK = () => typeof Variants !== 'undefined' ? CLK[Variants.val.clumps] ?? 1 : 1;
  let gfx, cBuf, kBuf, cCPU, kCPU, pipeC, pipeK, ch = 0, kh = 0, poolK = 1, liveC = null, liveK = null;
  const dirtyC = [], dirtyK = [];
  const org = [0, 0, 0];
  const rnd = RNG(4211);
  const impacts = [];          // clumps on their way down: when and where each lands (for the pock it leaves)

  G.init = function (g) {
    gfx = g;
    // a phone gets half the crystals (each thrown is then worth twice as much light, so the glitter reads the same, only coarser)
    const hand = !!(window.matchMedia && matchMedia('(pointer: coarse) and (hover: none)').matches), q = +new URLSearchParams(location.search).get('crystals');
    G.NC = q > 0 ? Math.round(q) : hand || (navigator.deviceMemory || 8) < 4 ? 20480 : 49152;
    poolK = G.NC / 49152;
    cCPU = new Float32Array(G.NC * G.CF); kCPU = new Float32Array(G.NK * G.KF);
    cBuf = gfx.buffer(cCPU, 'vertex', true); kBuf = gfx.buffer(kCPU, 'vertex', true); liveC = LiveRing(G.NC, G.CF); liveK = LiveRing(G.NK, G.KF);
    pipeC = gfx.pipeline({
      name: 'grainCrystal', lib: [SL.common, SL.hash, SL.depth, SL.shadow, SL.sprayTau, GROUND_SSL, FLIGHT_SSL, GLINT_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'add',
      buffers: [{ instanced: true, attrs: [['a0', 'vec4f'], ['a1', 'vec4f'], ['a2', 'vec4f']] }],
      varyings: { uv: 'vec2f', shp: 'vec4f', col: 'vec4f' }, uniforms: { hx: 'vec4f', cp: 'vec4f', cq: 'vec4f', cr: 'vec4f' },
      textures: { tH: 'fetch', tDepth: 'depth', tShadow: 'shadow', tSunTau: '2d', tOcc: '2d' },
      vs: CRYSTAL_VS, fs: `fn frag(v: VOut) -> FOut { var o: FOut; o.color = glintShade(v.uv, v.shp, v.col); return o; }`,
    });
    pipeK = gfx.pipeline({
      name: 'grainClump', lib: [SL.common, SL.depth, SL.shadow, SL.sprayTau], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'premul',
      buffers: [{ instanced: true, attrs: [['a0', 'vec4f'], ['a1', 'vec4f'], ['a2', 'vec4f'], ['a3', 'vec4f']] }],
      varyings: { uv: 'vec2f', k0: 'vec4f', k1: 'vec4f', k2: 'vec4f', k3: 'vec4f', k4: 'vec4f' }, uniforms: { kp: 'vec4f', kq: 'vec4f' },
      textures: { tDepth: 'depth', tShadow: 'shadow', tSunTau: '2d', tOcc: '2d' },
      vs: CLUMP_VS, fs: CLUMP_FS,
    });
    G.pipes = [pipeC, pipeK];
    org[0] = Render.origin[0]; org[1] = Render.origin[1]; org[2] = Render.origin[2];
    // fed by the spray as it throws snow (10_spray.js says what it threw on Spray.onEmit)
    if (typeof Spray !== 'undefined') { if (Spray.onEmit) Spray.onEmit.push(G.onEmit); else tap(); }
    if (typeof App !== 'undefined' && App.onTick) App.onTick.push(G.step);
  };

  // the records are kept in render space (relative to the floating origin, like the spray's): when the origin moves, so do they
  function sync() {
    const o = Render.origin, dx = o[0] - org[0], dy = o[1] - org[1], dz = o[2] - org[2];
    if (!dx && !dy && !dz) return;
    for (let i = 0; i < G.NC; i++) { const j = i * G.CF; cCPU[j] -= dx; cCPU[j + 1] -= dy; cCPU[j + 2] -= dz; }
    for (let i = 0; i < G.NK; i++) { const j = i * G.KF; kCPU[j] -= dx; kCPU[j + 1] -= dy; kCPU[j + 2] -= dz; }
    dirtyC.length = 0; dirtyK.length = 0; dirtyC.push([0, G.NC]); dirtyK.push([0, G.NK]);
    org[0] = o[0]; org[1] = o[1]; org[2] = o[2];
  }
  function mark(list, i) { const l = list[list.length - 1]; if (l && l[0] + l[1] === i) l[1]++; else list.push([i, 1]); }
  function upload(buf, cpu, list, stride) {
    for (const [first, count] of list) gfx.updateBuffer(buf, first * stride * 4, cpu.subarray(first * stride, (first + count) * stride));
    list.length = 0;
  }
  G.clear = function () { if (!cCPU) return; cCPU.fill(0); kCPU.fill(0); impacts.length = 0; dirtyC.length = 0; dirtyK.length = 0; dirtyC.push([0, G.NC]); dirtyK.push([0, G.NK]); liveC.clear(); liveK.clear(); };

  // one crystal: world position and velocity; brake = how far the air lets its throw carry (m), vs = the speed it settles at, life (s), light
  function crystal(t0, x, y, z, vx, vy, vz, brake, vs, life, power) {
    const i = ch * G.CF, c = cCPU;
    c[i] = x - org[0]; c[i + 1] = y - org[1]; c[i + 2] = z - org[2]; c[i + 3] = t0;
    c[i + 4] = vx; c[i + 5] = vy; c[i + 6] = vz; c[i + 7] = rnd();
    c[i + 8] = brake; c[i + 9] = vs; c[i + 10] = life; c[i + 11] = power;
    mark(dirtyC, ch); ch = (ch + 1) % G.NC; liveC.put(); G.stats.crystals++;
  }
  // Grains.crystals(t, p, v, n, opts): n crystals thrown from about p (world) at about v. opts: spread (m/s of scatter, 0.6), r (m round p, 0.1),
  // life (s, 3), brake (m, 1.6), vs ([slowest, fastest] settling speed, [0.3, 1.0]), power (1). n is the realistic count: the owner's choice
  // and the size of this device's pool scale it
  G.crystals = function (t, p, v, n, opts) {
    if (!cCPU || !G.enabled) return 0;
    sync();
    const o = opts || {}, sp = o.spread != null ? o.spread : 0.6, r = o.r != null ? o.r : 0.1, life = o.life || 3, brake = o.brake || 1.6, vs = o.vs || [0.3, 1.0], pw = o.power || 1;
    const qk = Quality.k('glitter'); let m = n * sparkK() * poolK * qk; const whole = Math.floor(m); m = whole + (rnd() < m - whole ? 1 : 0);
    for (let k = 0; k < m; k++) {
      const a = rnd() * TAU, b = rnd() * 2 - 1, s = Math.sqrt(1 - b * b), rr = r * Math.cbrt(rnd()), g = 0.65 + 0.7 * rnd();
      const jx = Math.cos(a) * s, jy = b, jz = Math.sin(a) * s, js = sp * Math.sqrt(rnd());
      crystal(t + (o.dt || 0) * rnd(), p[0] + jx * rr, p[1] + jy * rr, p[2] + jz * rr, v[0] * g + jx * js, v[1] * g + jy * js, v[2] * g + jz * js,
        brake * (0.6 + 0.8 * rnd()), lerp(vs[0], vs[1], Math.pow(rnd(), 1.5)), life * (0.6 + 0.8 * rnd()), pw * (0.5 + rnd()) / Math.sqrt(poolK * qk));
    }
    return m;
  };

  // ---- clumps
  const GR = 9.81;
  // where a clump is at time t of its flight (world space). The same closed form as CLUMP_VS
  function kpos(out, p, v, vT, tau, t) {
    const ex = Math.exp(-t / tau), f = tau * (1 - ex);
    out[0] = p[0] + (v[0] - vT[0]) * f + vT[0] * t; out[1] = p[1] + (v[1] - vT[1]) * f + vT[1] * t; out[2] = p[2] + (v[2] - vT[2]) * f + vT[2] * t;
    return out;
  }
  const q0 = [0, 0, 0], q1 = [0, 0, 0];
  // when it comes down: march its arc against the snow, then close in on the crossing
  // (dt: the march step. A granule, gone without a mark where it lands, takes a coarser one: there are thousands of them a second)
  function impactT(p, v, vT, tau, dt, nb) {
    let ta = 0, tb = 0; dt = dt || 0.03;
    for (let t = dt; t < 3.5; t += dt) {
      kpos(q0, p, v, vT, tau, t);
      if (q0[1] <= Course.height(q0[0], q0[2], 0.5)) { tb = t; break; }
      ta = t;
    }
    if (!tb) return 3.5;
    for (let k = 0; k < (nb || 6); k++) { const tm = 0.5 * (ta + tb); kpos(q1, p, v, vT, tau, tm); if (q1[1] <= Course.height(q1[0], q1[2], 0.5)) tb = tm; else ta = tm; }
    return tb;
  }
  function wind() { const w = App.state && App.state.wind; return w ? [w[0], w[2]] : [1.2, 0.4]; }
  // one clump: p, v world space; size = across (m). opts: trail (a wisp shed on the way, default true), burst (its puff where it lands, 1),
  // powder 0..1 (it sinks in and goes up in a puff; on hard snow it breaks into crumbs that skitter on), split (may break into pieces, true)
  function clump(t0, p, v, size, o) {
    sync();
    const vt = 7 + 5 * Math.sqrt(Math.min(size / 0.08, 1)) * (0.8 + 0.4 * rnd()), tau = vt / GR, w = wind(), wk = 0.12;
    const vT = [w[0] * wk, -vt, w[1] * wk], T = o.nodep ? impactT(p, v, vT, tau, 0.08, 4) : impactT(p, v, vT, tau);
    const i = kh * G.KF, c = kCPU;
    c[i] = p[0] - org[0]; c[i + 1] = p[1] - org[1]; c[i + 2] = p[2] - org[2]; c[i + 3] = t0;
    c[i + 4] = v[0]; c[i + 5] = v[1]; c[i + 6] = v[2]; c[i + 7] = rnd();
    c[i + 8] = tau; c[i + 9] = vt; c[i + 10] = T; c[i + 11] = size;
    c[i + 12] = vT[0]; c[i + 13] = vT[2]; c[i + 14] = (rnd() < 0.5 ? -1 : 1) * (3 + 12 * rnd()); c[i + 15] = 0;
    mark(dirtyK, kh); kh = (kh + 1) % G.NK; liveK.put(); G.stats.clumps++;
    const ip = kpos([0, 0, 0], p, v, vT, tau, T), ex = Math.exp(-T / tau), vi = [(v[0] - vT[0]) * ex + vT[0], (v[1] - vT[1]) * ex + vT[1], (v[2] - vT[2]) * ex + vT[2]];
    const pow = o.powder || 0, S = typeof Spray !== 'undefined' && Spray.puff ? Spray : null;
    // it sheds as it goes: a wisp or two of smoke left hanging along its arc, and a crumb or two that glitter down after it
    if (S && o.trail !== false && size > 0.02) {
      const nt = size > 0.045 ? 2 : 1;
      for (let k = 1; k <= nt; k++) {
        const tk = T * (k / (nt + 1)) * (0.7 + 0.3 * rnd()), pk = kpos([0, 0, 0], p, v, vT, tau, tk), ek = Math.exp(-tk / tau);
        S.puff(t0 + tk, pk[0], pk[1], pk[2], ((v[0] - vT[0]) * ek + vT[0]) * 0.12, ((v[1] - vT[1]) * ek + vT[1]) * 0.12, ((v[2] - vT[2]) * ek + vT[2]) * 0.12, 0.88, 0.02 + 0.35 * size, 0.25 + 9 * size, 1.4, 0.45, 0.3);
      }
      G.crystals(t0 + T * 0.5 * rnd(), kpos([0, 0, 0], p, v, vT, tau, T * 0.4), [vi[0] * 0.1, 0.2, vi[2] * 0.1], 2 + 40 * size, { spread: 0.3, r: 0.05, life: 2 });
    }
    if (S && o.burst !== 0) {
      // where it lands: it bursts. On hard snow into a low puff and a skitter of crumbs; in powder it plunges and the puff goes up
      const b = o.burst || 1, up = lerp(0.35, 1.1, pow) * (0.7 + 0.6 * rnd()), h = 0.25 + 0.15 * pow;
      S.puff(t0 + T, ip[0], ip[1] + 0.03, ip[2], vi[0] * h, up, vi[2] * h, 0.55 + 0.3 * rnd(), 0.03 + 0.9 * size, Math.min(1.4 + 38 * size, 4.5) * b * (0.8 + 0.5 * pow), 1, 0.6 + 0.4 * pow, 0.5);
      G.crystals(t0 + T, [ip[0], ip[1] + 0.03, ip[2]], [vi[0] * 0.15, 0.6 + 0.6 * pow, vi[2] * 0.15], (5 + 160 * size) * b, { spread: 0.9, r: 0.04, life: 1.8, brake: 0.6 });
    }
    if (o.split !== false && size > 0.045 && pow < 0.5 && rnd() < 0.7) {
      // a big one on firm snow does not stop where it hits: it breaks, and the pieces skip on down the slope
      const np = 2 + (rnd() < 0.4 ? 1 : 0);
      for (let k = 0; k < np; k++) {
        const a = (rnd() - 0.5) * 1.2, ca = Math.cos(a), sa = Math.sin(a), sk = 0.3 + 0.25 * rnd();
        const vx = (vi[0] * ca - vi[2] * sa) * sk, vz = (vi[0] * sa + vi[2] * ca) * sk, vy = Math.abs(vi[1]) * (0.15 + 0.2 * rnd()) + 0.4;
        clump(t0 + T, [ip[0], ip[1] + 0.03, ip[2]], [vx, vy, vz], size * (0.35 + 0.25 * rnd()), { trail: false, burst: 0.5, split: false, powder: pow });
      }
    }
    if (!o.nodep) impacts.push({ t: t0 + T, p: ip, d: [vi[0], vi[2]], s: size, pow });
    return T;
  }
  // Grains.clumps(t, p, v, n, size, opts): n clumps of about `size` (m across) thrown from about p at about v (world space).
  // opts: spread (m/s of scatter, 1.0), r (m round p, 0.15), powder 0..1, trail, burst, split (see clump). n is the realistic count:
  // the owner's choice scales it
  G.clumps = function (t, p, v, n, size, opts) {
    if (!kCPU || !G.enabled) return 0;
    const o = opts || {}, sp = o.spread != null ? o.spread : 1.0, r = o.r != null ? o.r : 0.15;
    let m = n * clumpK(); const whole = Math.floor(m); m = whole + (rnd() < m - whole ? 1 : 0);
    for (let k = 0; k < m; k++) {
      const a = rnd() * TAU, b = rnd() * 2 - 1, s = Math.sqrt(1 - b * b), g = 0.75 + 0.55 * rnd(), js = sp * Math.sqrt(rnd());
      const jx = Math.cos(a) * s, jy = b, jz = Math.sin(a) * s, rr = r * Math.sqrt(rnd());
      // sizes: most a couple of centimetres, a few the size of a fist
      const sz = Math.min(size * Math.exp(0.5 * (rnd() + rnd() + rnd() - 1.5)), 0.08);
      clump(t + (o.dt || 0) * rnd(), [p[0] + jx * rr, p[1] + Math.abs(jy) * rr * 0.3, p[2] + jz * rr], [v[0] * g + jx * js, v[1] * g + jy * js * 0.6, v[2] * g + jz * js], sz, o);
    }
    return m;
  };
  // each frame: the clumps that have come down by now leave a pock in the snow (17_tracks.js, when it has them)
  G.step = function () {
    if (!impacts.length) return;
    const now = App.t, dep = typeof Tracks !== 'undefined' && typeof Tracks.deposit === 'function';
    for (let i = impacts.length - 1; i >= 0; i--) {
      const m = impacts[i]; if (m.t > now) continue;
      impacts.splice(i, 1); G.stats.impacts++;
      if (dep && now - m.t < 1) { const l = Math.hypot(m.d[0], m.d[1]) || 1; Tracks.deposit('pock', m.p, [m.d[0] / l, m.d[1] / l], m.s); G.stats.deposits++; }
    }
  };

  // ---- fed by the spray. e = { kind, t, p, v (mean throw velocity), spread, rate 0..2, powder 0..1, r: [x, z] right, f: [x, z] forward }
  let lastT = -9, accC = 0, accK = 0, accG = 0;
  G.onEmit = function (e) {
    if (!G.enabled || !e || !e.p) return;
    const t0 = performance.now();
    const k = e.kind, rate = Math.max(0, Math.min(e.rate || 0, 2.5)), pw = e.powder || 0, v = e.v || [0, 0, 0], sp = Math.hypot(v[0], v[1], v[2]);
    const f = e.f || [0, -1], r = e.r || [1, 0];
    if (k === 'carve' || k === 'skid' || k === 'powder') {
      // the sheet off the edges: crystals all along the ski, thrown faster and wider than the smoke (they lead its rim and top it), and
      // in a hard turn the clumps the edge cuts out of the surface
      let dt = e.t - lastT; lastT = e.t; dt = dt > 0 && dt < 0.1 ? dt : 1 / 120;
      accC += Math.pow(rate, 0.9) * 12000 * (0.7 + 0.6 * pw) * dt;
      const sk = k === 'skid' ? 1 : 0, hard = Math.max(0, rate - 0.35);
      // (deep snow comes away in lumps: the owner's photo of a powder turn is full of them)
      accK += Math.pow(hard, 1.3) * 26 * (0.9 + 2.6 * pw * pw + 0.5 * sk) * dt;
      // the granules: the sugar the edge scrapes off the surface, a few millimetres to a centimetre and a half, thrown in a sheet that
      // leads the cloud and outlines it. Most of what a camera close to a fast turn sees as 'particles' is these (the owner: the spray at
      // speed was all fog, no grain). Small solid specks, lit and shaded, smeared over the shutter; they fall back without a mark
      // (on packed snow nearly all of what the edge throws is this sugar: the spray's own puffs leave it to these)
      // (and gliding fast on packed snow, even a light turn kicks some off the tails. sp here is the throw, about a sixth of the skier's speed)
      accG += 220 * smooth(3, 6, sp) * (1 - smooth(0.25, 0.9, pw)) * gritN() * dt;
      accG += Math.pow(rate, 1.1) * 1800 * (0.6 + 0.6 * pw + 0.6 * (1 - smooth(0.25, 0.9, pw))) * smooth(2, 8, sp) * gritN() * dt;
      if (accG >= 1) {
        const n = Math.min(Math.floor(accG), 320); accG -= Math.floor(accG);
        for (let j = 0; j < n; j++) {
          const al = lerp(-0.8, 0.5, rnd()), g = 0.7 + 0.7 * Math.pow(rnd(), 0.8), el = (rnd() - 0.25) * (e.spread || 0.5);
          const sz = 0.004 + 0.018 * Math.pow(rnd(), 3);
          clump(e.t - rnd() / 120, [e.p[0] + f[0] * al, e.p[1] + 0.03, e.p[2] + f[1] * al],
            [v[0] * g + (rnd() - 0.5) * 1.6, v[1] * g + el * sp * 0.7 + 0.6 * rnd(), v[2] * g + (rnd() - 0.5) * 1.6], sz, { trail: false, burst: 0, split: false, nodep: true, powder: pw });
        }
      }
      if (accC >= 1) {
        const n = Math.floor(accC); accC -= n;
        for (let j = 0; j < n; j++) {
          const al = lerp(-0.85, 0.55, rnd()), g = 0.85 + 0.95 * Math.pow(rnd(), 0.7), el = (rnd() - 0.4) * (e.spread || 0.5);
          const vx = v[0] * g + (rnd() - 0.5) * 0.8, vy = v[1] * g + el * sp * 0.6 + 0.25 * rnd(), vz = v[2] * g + (rnd() - 0.5) * 0.8;
          G.crystals(e.t - rnd() / 120, [e.p[0] + f[0] * al, e.p[1] + 0.02, e.p[2] + f[1] * al], [vx, vy, vz], 1,
            { spread: 0.35 + 0.3 * sp * 0.1, r: 0.06, life: lerp(1.8, 4.5, pw), brake: lerp(1.6, 3.4, Math.min(rate, 1.5) / 1.5) });
        }
      }
      if (accK >= 1) {
        const n = Math.floor(accK); accK -= n;
        for (let j = 0; j < n; j++) {
          const al = lerp(-0.7, 0.4, rnd()), g = 0.85 + 0.5 * rnd();
          G.clumps(e.t, [e.p[0] + f[0] * al, e.p[1] + 0.03, e.p[2] + f[1] * al], [v[0] * g, v[1] * g + 0.5 * rnd(), v[2] * g], 1, lerp(0.025, 0.04, pw) * (1 + 0.4 * sk), { spread: 0.9 + 0.1 * sp, powder: pw, r: 0.1 });
        }
      }
    } else if (k === 'land' || k === 'fall') {
      // two fans out from under the skis: crystals in a glittering burst, clumps thrown low to each side
      const jet = 2.2 + 2.0 * rate, fs = sp * 0.3;
      const fu = Math.hypot(f[0], f[1]) || 1, fx = f[0] / fu, fz = f[1] / fu;
      for (const side of [-1, 1]) {
        const vv = [r[0] * side * jet * 0.8 + fx * fs, 0.9 + 0.8 * rate, r[1] * side * jet * 0.8 + fz * fs];
        G.crystals(e.t, [e.p[0], e.p[1] + 0.04, e.p[2]], vv, 260 * rate * (0.7 + 0.6 * pw), { spread: 1.6, r: 0.5, life: lerp(1.8, 4.5, pw), brake: 1.4 });
        G.clumps(e.t, [e.p[0] + r[0] * side * 0.2, e.p[1] + 0.04, e.p[2] + r[1] * side * 0.2], [vv[0], 0.7 + 1.4 * rate * (0.6 + 0.6 * pw), vv[2]], rate * (4 + 9 * pw), lerp(0.03, 0.045, pw), { spread: 1.4, powder: pw, r: 0.5, dt: 0.1 });
      }
    } else if (k === 'sift') {
      // snow off a bough: a shower of crystals, the odd clump
      G.crystals(e.t, e.p, v, 220 * rate, { spread: 0.7, r: 0.8, life: 4, brake: 0.6, vs: [0.3, 0.8] });
      G.clumps(e.t, e.p, v, 2.5 * rate, 0.035, { spread: 0.6, r: 0.7, powder: 1 });
    } else if (k === 'pole') {
      G.crystals(e.t, e.p, v, 25 * Math.max(rate, 0.5), { spread: 0.6, r: 0.05, life: 1.6, brake: 0.4 });
    }
    G.stats.ms += performance.now() - t0;
  };

  // Until 10_spray.js says what it throws (Spray.onEmit), the same events are read off its emitters here. (When it does, none of this runs.)
  function tap() {
    const P = Spray, step = P.onStep, slap = P.slap, sift = P.sift, poles = P.poles;
    P.onStep = function (S, H, t) {
      step.call(P, S, H, t);
      if (!S.contact || S.speed < 1.2) return;
      const turn = S.aReac >= 0 ? 1 : -1, n = S.n, tt = S.t, rr = S.r, cb = Math.cos(S.beta), sb = Math.sin(S.beta), skid = Math.abs(sb), lat = Math.abs(S.aReac) / 9.81;
      const ox = -turn * (rr[0] * cb - tt[0] * sb), oy = -turn * (rr[1] * cb - tt[1] * sb), oz = -turn * (rr[2] * cb - tt[2] * sb);
      const fx = tt[0] * cb + rr[0] * sb, fz = tt[2] * cb + rr[2] * sb;
      const ve = clamp(S.speed * (0.08 + 0.42 * sat(lat / 1.5) + 0.85 * skid), 1.2, 15), el = lerp(0.5, 0.85, sat(skid / 0.4)), ce = Math.cos(el), se = Math.sin(el);
      const st = Game.pose.stance * 0.5 + 0.05;
      G.onEmit({ kind: skid > 0.3 ? 'skid' : S.powder > 0.6 ? 'powder' : 'carve', t, p: [S.p[0] + ox * st, S.h + 0.03, S.p[2] + oz * st],
        v: [S.v[0] * 0.15 + (ox * ce + n[0] * se) * ve * 0.8, S.v[1] * 0.15 + (oy * ce + n[1] * se) * ve * 0.8, S.v[2] * 0.15 + (oz * ce + n[2] * se) * ve * 0.8],
        spread: 0.5, rate: Math.min(P.intensity, 2), powder: S.powder, r: [rr[0], rr[2]], f: [fx, fz] });
    };
    P.slap = function (t, p, v, n, power) {
      slap.call(P, t, p, v, n, power);
      const sp = Math.hypot(v[0], v[2]) || 1, fx = v[0] / sp, fz = v[2] / sp;
      G.onEmit({ kind: 'land', t, p: [p[0], Course.height(p[0], p[2], 0.5), p[2]], v: [v[0] * 0.3, 1, v[2] * 0.3], spread: 1.2, rate: power, powder: Game.s.powder, r: [-fz, fx], f: [fx, fz] });
    };
    P.sift = function (t, p, v, power) { sift.call(P, t, p, v, power); G.onEmit({ kind: 'sift', t, p, v: [v[0] * 0.25, -0.6, v[2] * 0.25], spread: 1, rate: power, powder: 1, r: [1, 0], f: [0, -1] }); };
    P.poles = function (t, root, stance) {
      poles.call(P, t, root, stance);
      const f = root.fwd; G.onEmit({ kind: 'pole', t, p: [root.pos[0] + f[0] * 0.25, root.pos[1], root.pos[2] + f[2] * 0.25], v: [-f[0] * 0.6, 1.2, -f[2] * 0.6], spread: 0.8, rate: 1, powder: Game.s.powder, r: [1, 0], f: [f[0], f[2]] });
    };
    G.tapped = true;
  }

  G.fx = function (R) {
    if (!G.enabled || !pipeC) return;
    sync();
    upload(cBuf, cCPU, dirtyC, G.CF); upload(kBuf, kCPU, dirtyK, G.KF);
    liveC.trim(cCPU, ch, R.time); liveK.trim(kCPU, kh, R.time); G.stats.live = liveC.n; G.stats.liveK = liveK.n;
    const occ = Post.occTex; if (!occ) return;
    const hb = Spray.hb || Terrain.heightBinding(R.origin, 1), ow = Math.max(1, Render.W >> 1) - 1, oh = Math.max(1, Render.H >> 1) - 1;
    // by night the moon's flashes are few and faint: the lamp's carry it (Spray.nt: 0 by day, at golden hour and dusk; 1 in the night proper)
    const nt = Spray.nt || 0, wk = typeof Weather !== 'undefined' ? Weather.k || 0 : 0;
    // (under the snow cloud of heavy weather the light is spread: even in a break the sun is through haze, and the glitter goes with it)
    const sunK = (1 - 0.97 * nt) * (1 - 0.6 * wk);
    if (sparkK() > 0) { const d = { u: { hx: hb.xf, cp: [G.flashP, G.flashK, sunK, G.shutK], cq: [ow, oh, G.glowK, G.lampK], cr: [G.occK, G.gritK * (GRK[typeof Variants !== 'undefined' ? Variants.val.sparkle : 'b'] ?? 1), G.rmin * Math.max(1, Render.H / 1170), 0] }, tex: { tH: hb.tex, tDepth: R.depth, tShadow: R.shadowTex, tSunTau: Spray.sunTex, tOcc: occ }, vb: [cBuf], count: 4 }; liveC.spans(ch, (b, n) => { d.base = b; d.instances = n; gfx.draw(pipeC, d); }); }
    { const d = { u: { kp: [G.clumpShut, 0, 1, nt], kq: [ow, oh, 0, 0] }, tex: { tDepth: R.depth, tShadow: R.shadowTex, tSunTau: Spray.sunTex, tOcc: occ }, vb: [kBuf], count: 4 }; liveK.spans(kh, (b, n) => { d.base = b; d.instances = n; gfx.draw(pipeK, d); }); }
  };
  return G;
})();
