"use strict";
// ---------------------------------------------------------------- the nebula: a sheet of glowing gas far beyond the sky, faintly there even at noon
// Structure is computed once (domain-warped noise -> two textures); at runtime the sky shader does eight fetches and nothing else.
// It is never still, the way a cloud is never still: the whole sheet is folded on by two fields of slow eddies that drift across each other
// (so its form changes, and never comes round again), light streams down its threads along a flow field (two lives a place, started at
// different moments in different places, so it never pulses as one), lanes of dark dust ride a different current from the glow they hide,
// and light travels through it: fronts running outward from the stars, waves running along the arms, knots that come up and die away.
// ---- how much colour the night sky carries (the owner: "收"). One colour statement at night, the nebula's rose; the rest calmer:
// tp = how far the nebula's teal threads are pulled toward a grey violet, ns = the nebula's saturation, cs = the city's lights' saturation
// (night only), bd = the share of searchlights still burning (half of them go), bk = the rest's strength. Eased, so a switch never snaps.
const NSKY = (() => {
  const T = { a: [0, 1, 1, 1, 1], b: [0.62, 0.85, 0.62, 0, 1], c: [0.80, 0.70, 0.42, 0, 0.7] };
  const VN = typeof Variants !== 'undefined' ? Variants : { val: {}, def() { } };
  VN.def('nsky', '夜空颜色', [['a', '原来'], ['b', '收'], ['c', '更收']], 'b');
  const K = { v: (T[VN.val.nsky] || T.b).slice(), t: null };
  K.step = function (t) { const g = T[VN.val.nsky] || T.b, f = K.t === null ? 1 : 1 - Math.exp(-Math.max(0, Math.abs(t - K.t)) * 3); K.t = t; for (let i = 0; i < 5; i++) K.v[i] += (g[i] - K.v[i]) * f; return K.v; };
  return K;
})();
const NEB_TILE = 512;      // side of one tile of the second texture (two tiles side by side: flow | dust, veil and the arms' phase)
const Nebula = (() => {
  const N = { res: 768, az: 0.17, el: 0.31, half: 0.50, roll: -0.20, gain: 1, stars: 0.45 };
  N.nsky = NSKY;                                               // (tests: Nebula.nsky.t = null lands a switch at once)
  let gfx, texA, texB, tA, tB, pipeA, pipeB;
  N.init = function (g, res) {
    gfx = g; if (res) N.res = res;
    // (mipmapped: on a small screen its threads are finer than a pixel, and now that they move they would sparkle)
    texA = gfx.texture({ w: N.res, h: N.res, format: 'rgba8', filter: 'linear', wrap: 'clamp', mips: true }); tA = gfx.target({ color: texA });
    texB = gfx.texture({ w: NEB_TILE * 2, h: NEB_TILE, format: 'rgba8', filter: 'linear', wrap: 'clamp' }); tB = gfx.target({ color: texB });
    N.texA = texA; N.texB = texB;
    const mk = (name, fs) => gfx.pipeline({ name, lib: [SL.common, SL.hash, SL.noise, SL.tnoise, NEB_FIELD_SSL], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { p: 'vec4f' }, textures: { tNoise: '2d' },
      colorFormat: 'rgba8', depth: false, depthTest: false, cull: 'none', vs: VS_FULLSCREEN, fs });
    pipeA = mk('nebBakeA', `fn frag(v: VOut) -> FOut { var o: FOut; o.color = nebStructure(vec2f(v.uv.x * 2.0 - 1.0, 1.0 - v.uv.y * 2.0)); return o; }`);
    pipeB = mk('nebBakeB', `fn frag(v: VOut) -> FOut { var o: FOut; let p: vec2f = vec2f(fract(v.uv.x * 2.0) * 2.0 - 1.0, 1.0 - v.uv.y * 2.0);
      if (v.uv.x < 0.5) { o.color = nebFlow(p); } else { o.color = nebExtra(p); } return o; }`);
    N.pipes = [pipeA, pipeB];
  };
  N.bake = function () {
    if (gfx.isReady && !(gfx.isReady(pipeA) && gfx.isReady(pipeB))) return;      // (still compiling at start-up: baked on a later frame)
    gfx.beginPass(tA, { color: [0, 0, 0, 0] }); gfx.draw(pipeA, { u: { p: [0, 0, 0, 0] }, tex: { tNoise: Tex.noise }, count: 3 }); gfx.endPass(); gfx.genMips(texA);
    gfx.beginPass(tB, { color: [0, 0, 0, 0] }); gfx.draw(pipeB, { u: { p: [0, 0, 0, 0] }, tex: { tNoise: Tex.noise }, count: 3 }); gfx.endPass();
    N.baked = true;
  };
  // basis of the patch of sky the nebula lives on (world-fixed): forward toward its centre, right/up rolled a little so it hangs at an angle
  // (two hangings: lying along the horizon for a wide picture, standing up for a tall one)
  N.wide = { az: 0.40, el: 0.215, half: 0.47, roll: 0.55 }; N.tall = { az: 0.17, el: 0.31, half: 0.50, roll: -0.20 };
  N.basis = function () {
    Object.assign(N, Render.W >= Render.H ? N.wide : N.tall);
    if (typeof Clouds !== 'undefined' && Clouds.skyOf) { const k = Clouds.skyOf(); N.az += k[1]; N.el += k[2]; }      // (Variants 'vary' b: each mountain its own sky)
    const ce = Math.cos(N.el), f = [Math.sin(N.az) * ce, Math.sin(N.el), -Math.cos(N.az) * ce];
    let r = v3.norm(v3.cross(f, [0, 1, 0])), u = v3.cross(r, f);
    const c = Math.cos(N.roll), s = Math.sin(N.roll), r2 = v3.add(v3.mul(r, c), v3.mul(u, s)), u2 = v3.sub(v3.mul(u, c), v3.mul(r, s));
    return { nr: [...r2, 1 / N.half], nu: [...u2, N.gain], nf: [...f, N.stars] };
  };
  return N;
})();

// ---- the shape of the thing (bake time only)
// Laid out in polar coordinates round the young stars at its heart: gas streams outward in two unequal wings, combed into fibres,
// with bright shells where the starlight eats into it and a bay of dark dust on one side. Then the whole pattern is folded three
// times by a curl field, the way ink folds in water, so nothing stays straight.
const NEB_FIELD_SSL = `
fn nfb(p: vec2f, z: f32) -> f32 {
  var q: vec3f = vec3f(p, z); var s: f32 = 0.5 * vnoise3(q); q = vec3f(q.xy * 2.03 + vec2f(13.1, 7.7), q.z + 3.7);
  s += 0.25 * vnoise3(q); q = vec3f(q.xy * 2.03 + vec2f(13.1, 7.7), q.z + 3.7);
  s += 0.125 * tnoise3(q); q = vec3f(q.xy * 2.03 + vec2f(13.1, 7.7), q.z + 3.7);
  s += 0.0625 * tnoise3(q); q = vec3f(q.xy * 2.03 + vec2f(13.1, 7.7), q.z + 3.7);
  s += 0.03125 * tnoise3(q);
  return s / 0.96875;
}
const NEB_CORE: vec2f = vec2f(0.02, -0.04);
fn nebThin(n: f32, pw: f32) -> f32 { return pow(1.0 - abs(2.0 * n - 1.0), pw); }
fn nebRot(v: vec2f, a: f32) -> vec2f { let c: f32 = cos(a); let s: f32 = sin(a); return vec2f(v.x * c - v.y * s, v.x * s + v.y * c); }
fn nebPotl(p: vec2f, z: f32) -> f32 { return vnoise3(vec3f(p, z)) + 0.5 * vnoise3(vec3f(p * 2.1 + vec2f(5.0, 3.0), z + 2.0)); }
fn nebCurl(p: vec2f, z: f32) -> vec2f {
  let e: f32 = 0.05;
  return vec2f(nebPotl(p + vec2f(0.0, e), z) - nebPotl(p - vec2f(0.0, e), z), nebPotl(p - vec2f(e, 0.0), z) - nebPotl(p + vec2f(e, 0.0), z)) / (2.0 * e);
}
fn nebFold(p: vec2f) -> vec2f {
  let k: f32 = 0.42 + 0.58 * smoothstep(0.04, 0.55, length(p - NEB_CORE));          // orderly near the stars, stirred further out
  var q: vec2f = p;
  q += nebCurl(q * 0.75 + vec2f(6.2, 3.3), 13.5) * (0.085 * k);
  q += nebCurl(q * 1.4 + vec2f(1.7, 9.2), 1.5) * (NEB_FOLD.x * k);
  q += nebCurl(q * 3.1 + vec2f(8.3, 2.8), 5.5) * (NEB_FOLD.y * k);
  q += nebCurl(q * 6.7 + vec2f(4.1, 6.6), 9.5) * (NEB_FOLD.z * k);
  return q;
}
// how far the gas reaches in a given direction: one long wing, a shorter one opposite, a halo all round
fn nebReach(dir: vec2f) -> f32 {
  let a: f32 = pow(saturate(dot(dir, vec2f(-0.75, 0.66)) * 0.5 + 0.5), 3.4);
  let b: f32 = pow(saturate(dot(dir, vec2f(0.62, -0.78)) * 0.5 + 0.5), 4.0);
  return 0.20 + 0.86 * a + 0.52 * b;
}
// a front where starlight meets the gas: knife-sharp on the outside, glowing away inward
fn nebFront(d: f32, w: f32) -> f32 { return select(exp(d / (w * 5.0)), exp(-d * d / (w * w)), d > 0.0); }
fn nebSpike(p: vec2f, c: vec2f, r: f32) -> f32 { let d: vec2f = (p - c) / r; return exp(-dot(d, d) * 6.0) + 0.5 * exp(-abs(d.x) * 2.2 - abs(d.y) * 22.0) + 0.5 * exp(-abs(d.y) * 2.2 - abs(d.x) * 22.0); }
fn nebStructure(p: vec2f) -> vec4f {
  let q: vec2f = nebFold(p);
  let rd: vec2f = q - NEB_CORE; let r: f32 = length(rd); let dir: vec2f = rd / max(r, 1e-4);
  let x: f32 = r / nebReach(dir);                                         // 0 at the stars, 1 where the gas gives out
  let tw: vec2f = nebRot(dir, 1.0 * r);                                   // the arms trail round as they go out
  // ---- glowing gas: fibres combed outward along the arms, over broad billows
  let g1: f32 = nfb(tw * 2.3 + vec2f(2.0, 7.0), r * 1.8 + 30.5); let g2: f32 = nfb(q * 2.6 + vec2f(6.0, 1.0), 34.5);
  let gf: f32 = g1 * 0.6 + g2 * 0.4 + 0.33 * (1.0 - x);
  var gas: f32 = smoothstep(0.42, 0.80, gf) * smoothstep(1.08, 0.30, x);
  // ---- dark dust: a bay cutting in from one side toward the core, and lanes folded through the wings
  let bay: f32 = pow(saturate(dot(dir, vec2f(0.80, 0.60)) * 0.5 + 0.5), 5.0) * smoothstep(0.03, 0.14, r) * smoothstep(0.75, 0.2, r);
  let d1: f32 = nfb(q * 2.4 + vec2f(5.0, 5.0), 90.5) * 0.65 + nfb(tw * 3.0 + vec2f(1.0, 8.0), r * 2.5 + 94.5) * 0.35 + 0.34 * bay;
  let dust: f32 = smoothstep(0.545, 0.60, d1) * smoothstep(0.04, 0.16, r);
  // ---- threads: knife-thin, some combed along the arms, some loose and folded, gathered into braids
  let n1: f32 = vnoise3(vec3f(tw * 6.5 + vec2f(1.0, 3.0), r * 2.4 + 60.5));
  let n2: f32 = vnoise3(vec3f(tw * 14.0 + vec2f(7.0, 2.0), r * 4.5 + 70.5));
  let n3: f32 = tnoise3(vec3f(q * 8.5 + vec2f(3.0, 9.0), 75.5));
  let n4: f32 = tnoise3(vec3f(q * 19.0 + vec2f(13.0, 4.0), 78.5));
  let r1: f32 = nebThin(n1, 10.0); let r2: f32 = nebThin(n2, 8.0); let r3: f32 = nebThin(n3, 9.0); let r4: f32 = nebThin(n4, 7.0);
  let braid: f32 = smoothstep(0.36, 0.62, nfb(q * 1.9 + vec2f(4.0, 9.0), 55.5));
  var fil: f32 = (r1 + 0.7 * r2 * (0.4 + 0.8 * r1 + 0.5 * braid) + 0.75 * r3 * braid + 0.35 * r4 * (0.3 + r3)) * (0.25 + 0.75 * braid);
  // ---- shells: three broken arcs at different distances, and the lit rims of the dust
  let wob: f32 = nfb(q * 2.0 + vec2f(11.0, 3.0), 40.5) - 0.5;
  let am: f32 = nfb(tw * 1.6 + vec2f(3.0, 5.0), 44.5); let am2: f32 = nfb(tw * 1.6 + vec2f(9.0, 2.0), 47.5);
  var front: f32 = nebFront(x + 0.30 * wob - 0.26, 0.016) * smoothstep(0.40, 0.56, am)
                 + nebFront(x + 0.42 * wob - 0.52, 0.018) * smoothstep(0.62, 0.46, am) * 0.8
                 + nebFront(x + 0.55 * wob - 0.84, 0.022) * smoothstep(0.38, 0.55, am2) * 0.6;
  front += exp(-sq((d1 - 0.535) / 0.012)) * smoothstep(0.04, 0.16, r) * 0.8;
  gas *= 1.0 - 0.90 * dust; fil *= 1.0 - 0.95 * dust; front *= 1.0 - 0.6 * dust * (1.0 - exp(-sq((d1 - 0.535) / 0.012)));
  // which gas: 0 = hydrogen rose by the stars, 1 = oxygen teal out on the rim
  let hue: f32 = saturate(1.15 * x - 0.22 + (nfb(q * 1.7 + vec2f(9.0, 1.0), 80.5) - 0.5) * 1.3);
  // ---- the hot young stars that light it all (diffraction spikes and all); they are not folded
  var str: f32 = nebSpike(p, NEB_CORE + vec2f(0.004, 0.006), 0.030) + 0.85 * nebSpike(p, NEB_CORE + vec2f(0.040, 0.027), 0.019) + 0.75 * nebSpike(p, NEB_CORE + vec2f(-0.039, -0.014), 0.017) + 0.65 * nebSpike(p, NEB_CORE + vec2f(0.012, -0.047), 0.015);
  str += 0.55 * nebSpike(p, vec2f(-0.33, 0.21), 0.012) + 0.5 * nebSpike(p, vec2f(-0.52, 0.52), 0.011) + 0.45 * nebSpike(p, vec2f(0.30, -0.36), 0.011) + 0.4 * nebSpike(p, vec2f(-0.20, -0.20), 0.010) + 0.4 * nebSpike(p, vec2f(0.22, 0.30), 0.010);
  let edge: f32 = smoothstep(1.0, 0.86, max(abs(p.x), abs(p.y)));
  let near: f32 = 0.22 + 0.78 * exp(-x * 2.4);                            // brightest by the stars
  let reach: f32 = smoothstep(1.30, 0.55, x) * (0.30 + 0.70 * exp(-x * 1.4));   // threads run on past where the glow gives out
  return vec4f(saturate(gas * near * 1.1) * edge, saturate((fil * 0.75 + front * 0.8) * reach) * edge, hue, saturate(str * edge));
}
fn nebFlow(p: vec2f) -> vec4f {
  let q: vec2f = nebFold(p);
  let rd: vec2f = q - NEB_CORE; let r: f32 = length(rd); let dir: vec2f = rd / max(r, 1e-4);
  let x: f32 = r / nebReach(dir);
  // the gas streams outward along the trailing arms, with a slow swirl on top
  let fl: vec2f = nebRot(dir, 0.55) * (0.25 + 0.75 * smoothstep(0.0, 0.3, r)) * 0.7 + nebCurl(p * 1.6 + vec2f(3.0, 8.0), 100.5) * 0.16;
  // phase of the travelling light: distance out from the stars, roughened so the bands are not rings
  let ph: f32 = saturate(0.08 + 0.62 * x + 0.16 * (nfb(q * 2.2 + vec2f(2.0, 6.0), 110.5) - 0.5));
  let dc: f32 = length(p - NEB_CORE);
  let core: f32 = 0.85 * exp(-sq(dc / 0.045)) + 0.30 * exp(-sq(dc / 0.16));
  return vec4f(saturate(fl * 0.5 + 0.5), ph, saturate(core * (0.55 + 0.9 * nfb(p * 6.0, 120.5))));
}
// what rides on the gas and is not the gas (second tile): R a field whose upper half is dark dust in lanes, G a looser system of threads that
// reaches further out (the veil), BA the cosine and sine of a phase that winds round the stars in three trailing arms (the pair can be
// turned at runtime, which makes a wave travel along the arms without a seam anywhere)
fn nebExtra(p: vec2f) -> vec4f {
  let q: vec2f = nebFold(p);
  let rd: vec2f = q - NEB_CORE; let r: f32 = length(rd); let dir: vec2f = rd / max(r, 1e-4);
  let x: f32 = r / nebReach(dir);
  let tw: vec2f = nebRot(dir, 1.0 * r);
  let l1: f32 = nfb(q * 2.1 + vec2f(15.0, 3.0), 140.5) * 0.6 + nfb(tw * 2.7 + vec2f(4.0, 12.0), r * 2.3 + 144.5) * 0.4;
  let v1: f32 = nebThin(vnoise3(vec3f(tw * 4.3 + vec2f(21.0, 5.0), r * 1.9 + 160.5)), 7.0);
  let v2: f32 = nebThin(tnoise3(vec3f(q * 6.1 + vec2f(2.0, 17.0), 165.5)), 8.0);
  let vb: f32 = smoothstep(0.40, 0.66, nfb(q * 1.5 + vec2f(12.0, 6.0), 170.5));
  let edge: f32 = smoothstep(1.0, 0.86, max(abs(p.x), abs(p.y)));
  let veil: f32 = saturate((v1 * (0.5 + 0.5 * vb) + 0.8 * v2 * vb) * smoothstep(1.45, 0.45, x) * smoothstep(0.18, 0.50, x) * (0.35 + 0.65 * exp(-x * 1.1))) * edge;
  let ph: f32 = 3.0 * atan2(rd.y, rd.x) + 7.0 * r + 5.0 * (nfb(q * 1.4 + vec2f(8.0, 2.0), 150.5) - 0.5);
  let amp: f32 = smoothstep(0.03, 0.14, r);                               // (round the stars themselves the arms have not parted yet)
  return vec4f(saturate((l1 - 0.30) * 2.5) * smoothstep(0.05, 0.24, r), veil, 0.5 + 0.5 * amp * cos(ph), 0.5 + 0.5 * amp * sin(ph));
}
`.replace(/NEB_FOLD/g, 'vec3f(0.10, 0.045, 0.020)');

// ---- runtime: looked up by the sky shader
const NEBULA_SSL = `
// one field of eddies: xy = which way it carries the gas (the curl of a height field, so nothing piles up), z = the height itself, a slow noise
fn nebEddy(uv: vec2f, lod: f32) -> vec3f { let e: vec4f = texLod(tDetail, uv, lod); return vec3f(e.y - 0.5, 0.5 - e.x, e.z); }
fn nebB(uv: vec2f) -> vec4f { return texLod(tNebB, vec2f(clamp(uv.x, NEB_H, 1.0 - NEB_H) * 0.5, uv.y), 0.0); }
fn nebC(uv: vec2f) -> vec4f { return texLod(tNebB, vec2f(clamp(uv.x, NEB_H, 1.0 - NEB_H) * 0.5 + 0.5, uv.y), 0.0); }
// a front of light on the move: steep on its leading side, glowing away behind
fn nebWave(f: f32) -> f32 { return exp((f - 1.0) * 5.0) * smoothstep(1.0, 0.93, f); }
// returns emitted colour (rgb) of the nebula in direction d
fn nebula(d: vec3f, tm: f32) -> vec4f {
  let z: f32 = dot(d, M.nf.xyz);
  if (z < 0.3) { return vec4f(0.0); }
  let p: vec2f = vec2f(dot(d, M.nr.xyz), dot(d, M.nu.xyz)) / z * M.nr.w;
  if (abs(p.x) >= 1.0 || abs(p.y) >= 1.0) { return vec4f(0.0); }
  // how many texels of the big texture one pixel covers
  let lod: f32 = max(log2(U.camRight.w * U.res.w * M.nr.w * texSize(tNebA).x) - 0.85, 0.0);
  // ---- the sheet is folded on, slowly, by two fields of eddies drifting across each other; near its stars the gas holds its place
  let k: f32 = 0.12 + 0.88 * smoothstep(0.03, 0.45, length(p - vec2f(0.02, -0.04)));
  let e1: vec3f = nebEddy(p * 0.105 + vec2f(0.31, 0.17) + tm * vec2f(0.0029, 0.0017), 4.0);
  let q1: vec2f = p + e1.xy * (NEB_A1 * k);
  let e2: vec3f = nebEddy(q1 * 0.26 + vec2f(0.71, 0.43) + tm * vec2f(-0.0063, 0.0047), 4.0);
  let q: vec2f = q1 + e2.xy * (NEB_A2 * k);
  let uv: vec2f = vec2f(q.x, -q.y) * 0.5 + 0.5;
  // ---- it streams along the flow. What streams is the light along each thread, not the thread: the picture itself is fetched once and
  // stays knife-sharp (two copies of it slid along the flow and cross-faded, the usual way, went soft and left ghosts across the threads).
  // The flow carries a pattern of brighter and dimmer stretches instead: two lives of it, half a life apart, each fading in upstream and
  // out downstream, started at different moments in different places so the whole never pulses as one
  let fb: vec4f = nebB(uv);
  let flow: vec2f = (fb.xy - 0.5) * vec2f(1.0, -1.0) * 0.16;
  let ph: f32 = fract(tm * 0.085 + e1.z * 1.7 + fb.z * 0.9); let ph2: f32 = fract(ph + 0.5);
  let a: vec4f = texLod(tNebA, uv, lod);
  let s0: f32 = texLod(tDetail, (uv - flow * (ph - 0.5)) * 2.0 + vec2f(0.13, 0.57), 3.0).x; let s1: f32 = texLod(tDetail, (uv - flow * (ph2 - 0.5)) * 2.0 + vec2f(0.61, 0.29), 3.0).y;
  let strm: f32 = saturate(0.5 + 3.0 * (mix(s0, s1, abs(2.0 * ph - 1.0)) - 0.5));
  // ---- what rides a different current: the lanes of dust, the veil, the phase of the arms
  let qc: vec2f = p - e1.xy * (0.7 * NEB_A1 * k) + e2.xy * (1.5 * NEB_A2 * k);
  let c: vec4f = nebC(vec2f(qc.x, -qc.y) * 0.5 + 0.5);
  // ---- light. Fronts run outward from the stars (their shape wanders, and only arcs of them are lit at any time)...
  let s: f32 = fb.z; let j: f32 = (e1.z - 0.5) * 1.6 + (e2.z - 0.5) * 0.5;
  let w1: f32 = nebWave(fract(s * 4.0 - tm * 0.105 + j)) * smoothstep(0.40, 0.62, e2.z);
  let w2: f32 = nebWave(fract(s * 7.0 - tm * 0.071 - j * 1.3 + 0.4)) * smoothstep(0.60, 0.42, e1.z + 0.25 * e2.z);
  // ...waves run along the arms (turn the baked pair and the wave travels), a broad one and a finer one twice as dense going the other way round...
  let ca: vec2f = c.ba * 2.0 - 1.0; let ta: f32 = tm * 0.16; let tb: f32 = tm * 0.27 + 1.0;
  let arm: f32 = ca.x * cos(ta) + ca.y * sin(ta);
  let arm2: f32 = (ca.x * ca.x - ca.y * ca.y) * cos(tb) - 2.0 * ca.x * ca.y * sin(tb);
  let w3: f32 = pow(saturate(arm * 0.5 + 0.5), 4.0); let w4: f32 = pow(saturate(arm2 * 0.5 + 0.5), 3.0);
  // ...and knots come up and die away where two slow noises agree
  let knot: f32 = smoothstep(0.50, 0.66, e1.z * 0.45 + e2.z * 0.55 + 0.05 * arm);
  let pulse: f32 = min(0.80 + 1.6 * w1 + 1.0 * w2 + 0.45 * w3 + 0.25 * w4 + 0.5 * knot, 2.8);
  // ---- colour: which gas glows where drifts too
  let hue: f32 = saturate(a.z + ((e1.z - 0.5) * 0.40 + 0.08 * arm) * k);
  let rose: vec3f = vec3f(1.00, 0.26, 0.44); let violet: vec3f = vec3f(0.46, 0.32, 1.00); let teal: vec3f = mix(vec3f(0.14, 0.95, 0.84), vec3f(0.56, 0.52, 0.84), M.ns.x); let gold: vec3f = vec3f(1.00, 0.76, 0.46);
  var col: vec3f = mix(rose, violet, smoothstep(0.30, 0.90, hue)) * a.x * (0.7 + 0.3 * pulse) * (0.51 + 0.08 * strm);
  let thr: vec3f = mix(mix(gold, rose, 0.5), teal, smoothstep(0.30, 0.62, hue));
  col += thr * a.y * pulse * (0.62 + 0.86 * strm);
  col += mix(thr, violet, 0.35 * smoothstep(0.35, 0.75, hue + 0.2 * arm2)) * c.g * (0.25 + 0.5 * w3 + 0.6 * w1 + 0.3 * knot) * 0.5;
  // the dust: dark where it lies thick, and its edge lit where it stands against the glow
  let dl: f32 = c.r + (e2.z - 0.5) * 0.12;
  col *= 1.0 - 0.60 * smoothstep(0.56, 0.70, dl);
  col += mix(gold, rose, 0.35) * (exp(-sq((dl - 0.545) / 0.022)) * (a.x * 0.9 + a.y * 0.5) * (0.5 + 0.5 * pulse) * 0.35);
  col += vec3f(1.0, 0.86, 0.80) * fb.w * (1.5 + 0.25 * w3 + 0.2 * knot);
  col = mix(vec3f(luma(col)), col, M.ns.y);
  // the stars are not carried along (sampled without the folding or the flow) and scintillate a little
  let st: f32 = texLod(tNebA, vec2f(p.x, -p.y) * 0.5 + 0.5, lod).w;
  col += vec3f(0.90, 0.95, 1.0) * st * (0.8 + 0.2 * sin(tm * 3.3 + p.x * 57.0 + p.y * 31.0)) * 2.0 * M.nf.w;
  return vec4f(col, 1.0);
}
`.replace(/NEB_H/g, (0.5 / NEB_TILE).toFixed(7)).replace(/NEB_A1/g, '0.40').replace(/NEB_A2/g, '0.10');
