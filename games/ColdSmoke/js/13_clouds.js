"use strict";
// ---------------------------------------------------------------- clouds: fair-weather cumulus hanging in the blue, and the sea of cloud below
// Neither ever comes nearer: the cumulus are drawn as directions from the eye, and the deck stays 950 m below it. So each is rendered as
// what it is, a volume of droplets (ray-marched; a second march toward the sun for self-shadow, strongly forward scattering for the silver
// lining, a diffusion term for the light that soaks through, the sky and the ground as fill) into a texture, exactly as seen from the eye:
// a "key". A cloud is never still, so keys are baked all the time, a few rows a frame, each for the cloud as it will be a couple of
// seconds on (thermals push up, stand, lean and are eaten away; the deck's cells turn over), and the picture is a cross-fade from the last
// finished key to the next. What merely moves between two keys (the deck with the wind, the billows welling up) is moved in the picture,
// so the fade only has to carry what changes shape. A frame costs two or three fetches per pixel; the marching is spread over the two
// seconds between keys. The keys hold scalars (light from the sun, from the sky, from below), so the colours follow the time of day for free.
const Clouds = (() => {
  const C = { res: 384, enabled: true, K: SEA.K, baked: false, time: 0, wind: 0.022, ksun: 1.0, ksky: 1.6, kgnd: 1.2, ktwi: 1.0,
    sigma: 42, kd: 1.1, silver: 1.8, shear: 0.18, evo: 1, life: 1.3, rise: 0.006, seaRate: 1, seaSigma: 0.04, seaKd: 1.15, seaSilver: 0.65, list: [
    // az, el: where it hangs; w: how wide it looks (rad); asp: height of its tile / width; tur: how strongly it towers; haze: air in front of it
    { az: -0.62, el: 0.100, w: 0.40, asp: 0.52, seed: 1, haze: 0.34, tur: 1.00 },
    { az: 0.38, el: 0.125, w: 0.30, asp: 0.66, seed: 2, haze: 0.28, tur: 1.15 },
    { az: -0.04, el: 0.175, w: 0.15, asp: 0.50, seed: 3, haze: 0.18, tur: 0.55 },
    { az: 0.88, el: 0.170, w: 0.24, asp: 0.55, seed: 4, haze: 0.22, tur: 0.90 },
    { az: -1.10, el: 0.160, w: 0.26, asp: 0.50, seed: 5, haze: 0.22, tur: 0.75 },
    { az: 0.10, el: 0.055, w: 0.17, asp: 0.42, seed: 6, haze: 0.50, tur: 0.45 },
  ] };
  const COLS = 3, ROWS = 2, ZR = 0.8, ZB = 0.6, S0 = 0.85, S1 = 1.9, S3 = 2.6;
  // The small ones, far off: drawn as crisp young cumulus they read as a flat lens stuck on the sky (a sticker, a saucer). Real small cumulus
  // at that range are scraps: torn, ragged underneath, thin enough to see the blue through, and softened by the air in front. Versions:
  // a as it was, b torn scraps (rag), c no small ones at all. (each cloud's rag and presence ease over a few seconds: nothing snaps)
  const VCU = typeof Variants !== 'undefined' ? Variants : { val: {}, def() { } };
  VCU.def('cu', '小云', [['a', '现在的'], ['b', '碎云'], ['c', '去掉小云']], 'c');
  const small = c => smooth(0.27, 0.16, c.w);
  let lastU = -1;
  let gfx, volTex, volT, pipeVol, pipeBake, pipeDraw, pipeSea, pipeSun, sunT, order;
  // the three keys of each: iA the one fading out, iB the one fading in, iC the one being baked; p = how far both the fade and the bake have got
  const cu = { tex: [], tgt: [] }, se = { tex: [], tgt: [], w: 0, h: 0 };
  let iA = 0, iB = 0, iC = 1, p = 0, lastT = -1e9, volDone = false, jobC = null;
  // (for the sky's shader: the two keys of the deck, how far the fade has got, and how far the wind has carried each since it was true)
  C.sea = { A: null, B: null, f: 0, oA: 0, oB: 0 };

  C.init = function (g, res) {
    gfx = g; if (res) C.res = res;
    volTex = gfx.texture({ w: 528, h: 528, format: 'rgba8', filter: 'linear', wrap: 'clamp' }); volT = gfx.target({ color: volTex }); Tex.vol = volTex;
    se.h = C.res; se.w = Math.round(C.res * 20 / 12) * 4;
    for (let i = 0; i < 3; i++) {
      cu.tex[i] = gfx.texture({ w: C.res * COLS, h: C.res * ROWS, format: 'rgba16f', filter: 'linear', wrap: 'clamp' }); cu.tgt[i] = gfx.target({ color: cu.tex[i] });
      se.tex[i] = gfx.texture({ w: se.w, h: se.h, format: 'rgba16f', filter: 'linear', wrap: 'repeat', wrapY: 'clamp' }); se.tgt[i] = gfx.target({ color: se.tex[i] });
    }
    C.atlas = cu.tex[0]; C.sea.A = C.sea.B = se.tex[0];
    const v4 = n => { const o = {}; for (const k of n.split(' ')) o[k] = 'vec4f'; return o; };
    pipeVol = gfx.pipeline({ name: 'cloudVol', lib: [SL.common, SL.hash], buffers: [], varyings: { uv: 'vec2f' }, uniforms: { p: 'vec4f' }, textures: {}, colorFormat: 'rgba8', depth: false, depthTest: false, cull: 'none', vs: VS_FULLSCREEN, fs: CLOUD_VOLNOISE_FS });
    pipeBake = gfx.pipeline({ name: 'cloudBake', lib: [SL.common, SL.hash, SL.tonemap, CLOUD_VOL_SSL, CLOUD_CU_SSL], topology: 'strip', buffers: [], varyings: { uv: 'vec2f' }, uniforms: v4('r t a b l c k o0 o1 o2 o3 l0 l1 l2 l3 l4 l5 l6 m0 m1 m2 m3 m4 m5 m6'),
      textures: { tVol: '2d' }, colorFormat: 'rgba16f', depth: false, depthTest: false, cull: 'none', vs: CLOUD_RECT_VS, fs: CLOUD_BAKE_FS });
    pipeSea = gfx.pipeline({ name: 'seaBake', lib: [SL.common, SL.hash, SL.tonemap, CLOUD_VOL_SSL, SEA_FIELD_SSL], topology: 'strip', buffers: [], varyings: { uv: 'vec2f' }, uniforms: v4('r t p l w'),
      textures: { tVol: '2d' }, colorFormat: 'rgba16f', depth: false, depthTest: false, cull: 'none', vs: CLOUD_RECT_VS, fs: SEA_BAKE_FS });
    pipeDraw = gfx.pipeline({ name: 'cloudDraw', lib: [SL.common, SL.fog], topology: 'strip', buffers: [], varyings: { uv: 'vec2f', dir: 'vec3f' }, uniforms: v4('a t k f s g0 g1 g2 n'),
      textures: { tCloudA: '2d', tCloudB: '2d', tSky: '2d' }, depthFunc: 'lequal', depthWrite: false, cull: 'none', blend: 'premul', vs: CLOUD_DRAW_VS, fs: CLOUD_DRAW_FS });
    // how much of the sun's disc the cumulus let through (1 = all): one texel, read by the lens (09_post.js sunVis) so that a cloud in front of
    // the sun hides its starburst, glare and ghosts the way it hides the disc
    C.sunTex = gfx.texture({ w: 1, h: 1, format: 'rgba8', filter: 'linear', wrap: 'clamp' }); sunT = gfx.target({ color: C.sunTex });
    pipeSun = gfx.pipeline({ name: 'cloudSun', lib: [SL.common], buffers: [], varyings: { uv: 'vec2f' }, uniforms: v4('a t f s'), textures: { tCloudA: '2d', tCloudB: '2d' },
      colorFormat: 'rgba8', depth: false, depthTest: false, cull: 'none', blend: 'mul', vs: VS_FULLSCREEN, fs: CLOUD_SUN_FS });
    C.pipes = [pipeVol, pipeBake, pipeSea, pipeDraw, pipeSun];
    for (const c of C.list) {
      const tw = Math.tan(c.w / 2), ce = Math.cos(c.el), sn = Math.sin(c.el), e = 0.93 * c.asp;
      c.tw = tw; c.D = 1 / tw;
      // the base is seen from below, so its far edge is the lowest thing in the tile: it is put as low as that edge allows
      c.yb = (ZB * sn - e * (1 + ZB * tw * ce)) / (ce + e * tw * sn); c.yt = e * (c.D - 0.55) / c.D;
    }
    order = C.list.map((c, i) => i).sort((a, b) => C.list[a].el - C.list[b].el);     // the lower in the sky, the farther off: drawn first
  };
  // they ride the wind at their level: the nearer ones (higher in the picture) cross the sky faster; round behind you and in again
  // (Variants 'vary' b: every mountain but the first has its own arrangement of the sky: the clouds turned round together by up to half a
  // radian, the nebula moved along the sky (12_nebula.js). The sun, the moon and the city keep their bearings: everything the key light
  // touches is built for that one bearing, and the city's is written into the sky shader. 寒烟山 keeps the sky it always had)
  if (typeof Variants !== 'undefined') Variants.def('vary', '远景随山变', [['a', '不变'], ['b', '每座山不同']], 'a');
  C.skyOf = function () {
    if (typeof Variants === 'undefined' || Variants.val.vary !== 'b' || typeof Course === 'undefined' || !Course.seed || Course.seed === 261111) return [0, 0, 0];
    const h = hashU(Course.seed * 7 + 31337);
    return [((h & 1023) / 1023 - 0.5) * 1.0, (((h >>> 10) & 1023) / 1023) * 0.65 - 0.15, (((h >>> 20) & 1023) / 1023 - 0.5) * 0.08];      // [clouds, nebula azimuth, nebula height] (rad)
  };
  const azAt = (c, t) => { const a = c.az + C.skyOf()[0] + C.wind * c.el * t; return ((a + 1.45) % 2.9 + 2.9) % 2.9 - 1.45; };
  const rect = i => { const tx = i % COLS, ty = Math.floor(i / COLS); return [tx / COLS, ty / ROWS, (tx + 1) / COLS, (ty + 1) / ROWS]; };
  // The thermals that make a cloud: a broad low mound that stays, and bubbles that push up through it one after another, each in its own
  // stretch of the cloud: it swells and climbs, stands a while as a crisp turret, then loses its supply, leans with the wind and is eaten
  // away (age 0 -> 1). How big and how high the next one will be is drawn afresh each time, while it is nothing: no cloud is twice the same.
  function lobes(c, phi) {
    const sd = c.seed * 97, H = c.yt - c.yb, ev = phi / C.life, L = [], M = [];
    const rg = c.rag || 0, r0 = 0.72 * (1 + 0.05 * Math.sin(ev * 0.017 + sd)) * (1 - 0.05 * rg), hm = (0.34 + 0.10 * c.tur) * H * (1 - 0.25 * rg);
    L.push([0.05 * Math.sin(ev * 0.011 + sd * 1.7), c.yb - 0.02, 0, r0]); M.push([hm / r0, 0, 0.22, 1]);
    for (let k = 1; k < 5; k++) {
      const T = 75 + 55 * hash2(k, sd), u0 = ev / T + hash2(k + 9, sd) + k * 0.23, n = Math.floor(u0), u = u0 - n;
      const hx = hash3(n, k, sd), hz = hash3(n, k + 20, sd), hr = hash3(n, k + 40, sd), hy = hash3(n, k + 60, sd);
      const grow = smooth(0, 0.36, u), age = smooth(0.40, 0.92, u), w = grow * smooth(1.0, 0.76, u);
      const r = (0.24 + 0.15 * hr) * (0.5 + 0.5 * grow) * (1 - 0.25 * rg), sy = 1.1 + 0.25 * hy, x = clamp((k - 2.5) * 0.29 + (hx - 0.5) * 0.24 + 0.10 * age, -0.74 + r, 0.74 - r);
      const top = c.yb + H * (0.50 + 0.42 * hy * (1 - 0.6 * x * x)) * (0.55 + 0.45 * c.tur);      // the tall ones stand toward the middle
      // (a torn scrap: its pieces lie low and flat along one ragged layer. Hung at different heights they read as twin stickers)
      const cy = lerp(lerp(c.yb + 0.10 * H, Math.max(top - r * sy * 1.25, c.yb + 0.10 * H), grow) - 0.04 * H * age, c.yb + H * (0.10 + 0.12 * hz), 0.8 * rg);
      L.push([x * (1 - 0.3 * rg), Math.min(cy, c.yt - r * sy * 1.3 - 0.01), (hz - 0.5) * 0.5, r]); M.push([sy * (1 - 0.4 * rg), 0, Math.max(age, 0.6 * rg), w * (1 - 0.5 * rg)]);      // (a scrap has no young crisp bubble in it: its bubbles shrink to small bumps on the layer)
    }
    // two crowns that always stand on the mound, drifting slowly (no cycle, so nothing to snap): without them, in the spells when no
    // thermal is up, the cloud is its bare mound, a box with a flat top. They swell and sink a little over minutes
    for (let k = 0; k < 2; k++) {
      const ph = ev * (0.0031 + 0.0013 * k) + sd * (1.3 + k), sw = 0.5 + 0.5 * Math.sin(ph * 1.7 + 2.1 * k);
      const r = (0.25 + 0.06 * sw) * (1 - 0.35 * rg), sy = 1.05 + 0.15 * sw, x = (k ? 0.26 : -0.30) + 0.10 * Math.sin(ph);
      const top = c.yb + H * (0.46 + 0.16 * sw) * (0.6 + 0.4 * c.tur) * (1 - 0.5 * rg);
      L.push([x, Math.max(top - r * sy, c.yb + 0.05 * H), 0.12 * Math.cos(ph * 1.3), r]); M.push([sy, 0, 0.35 + 0.25 * rg, 1 - 0.5 * rg]);
    }
    M[0][1] = rg;      // (the base mound's free slot carries the rag to the shader)
    return { L, M };
  }
  // everything a key is baked from is fixed when its first row is: the moment it is for, the light, the thermals
  function job(phi) {
    const L = Sky.sunDir(), fr = x => x - Math.floor(x), ev = phi * C.evo, v = C.rise, s2 = lerp(2.6, 3.4, sat((C.res - 160) / 224));
    return { phi, L, s2, cl: C.list.map(c => {
      const az = azAt(c, phi), ca = Math.cos(az), sa = Math.sin(az), s = c.seed;
      return { lb: lobes(c, phi), Ll: [L[0] * ca + L[2] * sa, L[1], L[0] * sa - L[2] * ca],
        // the billows well up through the cloud (all of them at one speed: the picture carries that between keys), and change as they go
        o0: [fr(s * 0.37), fr(s * 0.61 - phi * v * S0), fr(s * 0.13 + ev * 0.0012), 0],
        o1: [fr(s * 0.71 + 0.3), fr(s * 0.29 - phi * v * S1), fr(s * 0.53 + ev * 0.0035), 0],
        o2: [fr(s * 0.17 + 0.6), fr(s * 0.83 - phi * v * s2), fr(s * 0.41 + ev * 0.006), 0],
        // (the finest bulges and the wisps: a scale of their own, so they rise with the rest and the picture can carry them between keys)
        o3: [fr(s * 0.23 + 0.1), fr(s * 0.47 - phi * v * s2 * S3), fr(s * 0.67 + ev * 0.009), s2 * S3] };
    }) };
  }
  // rows f0..f1 (as fractions of the whole) of a key of the cumulus: the tiles one after another
  function bakeCu(tg, jb, f0, f1, all) {
    const N = C.list.length, tot = N * C.res, r0 = Math.round(f0 * tot), r1 = Math.round(f1 * tot);
    gfx.beginPass(tg, all ? { color: [0, 0, 0, 0] } : {});
    for (let i = Math.floor(r0 / C.res); i < N && i * C.res < r1; i++) {
      const v0 = Math.max(r0 - i * C.res, 0) / C.res, v1 = Math.min(r1 - i * C.res, C.res) / C.res; if (v1 <= v0) continue;
      const c = C.list[i], q = rect(i), J = jb.cl[i], u = { r: [q[0], lerp(q[1], q[3], v0), q[2], lerp(q[1], q[3], v1)], t: [0, v0, 1, v1],
        a: [c.seed, c.yb, c.tw, c.el], b: [c.D, ZR, c.asp, c.yt], l: [J.Ll[0], J.Ll[1], J.Ll[2], C.silver], c: [C.shear, S0, S1, jb.s2], k: [0.60, 0.70, C.kd, C.sigma * (1 - 0.55 * (c.rag || 0))], o0: J.o0, o1: J.o1, o2: J.o2, o3: J.o3 };
      for (let k = 0; k < 7; k++) { u['l' + k] = J.lb.L[k]; u['m' + k] = J.lb.M[k]; }
      gfx.draw(pipeBake, { u, tex: { tVol: volTex }, count: 4 });
    }
    gfx.endPass();
  }
  function bakeSea(tg, jb, f0, f1, all) {
    const r0 = Math.round(f0 * se.h), r1 = Math.round(f1 * se.h);
    gfx.beginPass(tg, all ? { color: [0, 0, 0, 0] } : {});
    if (r1 > r0) gfx.draw(pipeSea, { u: { r: [0, r0 / se.h, 1, r1 / se.h], t: [0, r0 / se.h, 1, r1 / se.h], p: [jb.phi, C.seaSigma, C.seaSilver, C.seaRate], l: [jb.L[0], jb.L[1], jb.L[2], C.seaKd],
      w: [-SEA.wind[0] * jb.phi, -SEA.wind[1] * jb.phi, 0, 0] }, tex: { tVol: volTex }, count: 4 });
    gfx.endPass();
  }
  // once a frame, before anything is drawn. Runs on the game's clock: in slow motion the clouds slow with everything else
  C.update = function () {
    const t = Render.time, ed = lastU < 0 ? 1 : 1 - Math.exp(-Math.min(Math.abs(t - lastU), 0.5) / 1.2), vc = VCU.val.cu || 'a'; lastU = t;
    for (const c of C.list) { const s = small(c); c.rag = lerp(c.rag || 0, vc === 'b' ? s : 0, ed); c.keep = lerp(c.keep === undefined ? 1 : c.keep, vc === 'c' ? 1 - s : 1, ed); }
    if (!volDone) { gfx.beginPass(volT, { color: [0, 0, 0, 0] }); gfx.draw(pipeVol, { u: { p: [0, 0, 0, 0] }, tex: {}, count: 3 }); gfx.endPass(); volDone = true; }
    if (!C.baked || t < lastT || t - lastT > C.K * 0.75) {
      // all at once: at the start, when the clock has jumped (a change of the hour, a test running the game ahead without drawing)
      const jb = job(t); bakeCu(cu.tgt[0], jb, 0, 1, true); bakeSea(se.tgt[0], jb, 0, 1, true);
      iA = iB = 0; iC = 1; jobC = job(t + C.K); p = 0; C.baked = true; lastT = t;
    } else {
      // as many rows of the next key as time has passed; when it is whole it becomes the one fading in, and the next is begun at once
      let adv = (t - lastT) / C.K; lastT = t;
      while (adv > 1e-9) {
        const p1 = Math.min(1, p + adv); bakeCu(cu.tgt[iC], jobC, p, p1, false); bakeSea(se.tgt[iC], jobC, p, p1, false); adv -= p1 - p; p = p1;
        if (p >= 1) { const free = iA === iB ? 3 - iB - iC : iA; iA = iB; iB = iC; iC = free; jobC = job(jobC.phi + C.K); p = 0; }
      }
    }
    // (while there is only one key, just after a bake of everything, it is shown drifting up to its place)
    C.oA = iA === iB ? p - 1 : p; C.oB = p - 1;
    C.sea.A = se.tex[iA]; C.sea.B = se.tex[iB]; C.sea.f = p; C.sea.oA = C.oA; C.sea.oB = C.oB; C.atlas = cu.tex[iB];
    // the sun seen through them: each cloud whose tile the sun is in multiplies its transmittance into the one texel
    const Ls = Sky.sunDir(), wx = typeof Weather !== 'undefined' ? 1 - Weather.kc : 1;
    gfx.beginPass(sunT, { color: [1, 1, 1, 1] });
    if (C.enabled && wx > 0.003) for (const i of order) {
      const c = C.list[i], az = azAt(c, t), fade = smooth(1.45, 1.2, Math.abs(az)) * wx * (c.keep === undefined ? 1 : c.keep), q = rect(i), ru = C.rise * C.K / (2 * c.asp);
      if (fade < 0.002 || Math.abs(az - Math.atan2(Ls[0], -Ls[2])) > c.w + 0.05 && Math.abs(az - Math.atan2(Ls[0], -Ls[2])) < 6.2 - c.w) continue;
      gfx.draw(pipeSun, { u: { a: [az, c.el, c.tw, c.asp], t: [q[0], q[1], q[2] - q[0], q[3] - q[1]], f: [fade, p, ru * C.oA, ru * C.oB], s: [Ls[0], Ls[1], Ls[2], 0] },
        tex: { tCloudA: cu.tex[iA], tCloudB: cu.tex[iB] }, count: 3 });
    }
    gfx.endPass();
  };
  // (for timing: all of a key of the cumulus ('cu'), of the deck ('sea'), or of both, now)
  C.bakeNow = function (which) { const jb = job(Render.time); if (which !== 'sea') bakeCu(cu.tgt[iC], jb, 0, 1, true); if (which !== 'cu') bakeSea(se.tgt[iC], jb, 0, 1, true); p = 0; };
  // At night the town lights the bases of the cloud near its bearing from below, in its own colours: sodium wide and low, each quarter's
  // neon over it (Vista.cores / famc, the same quarters cityGlow3 uses). Three colours across the base (left, middle, right), mixed in the
  // shader. n = (night, how strongly the moon lights the tops, thinning of the edges, -)
  C.night = { glow: 0.14, moon: 1.7, thin: 0.9 };
  function cityUp(c, az) {
    const V = typeof Vista !== 'undefined' ? Vista : null, lt = Sky.lights || 0, g = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    if (V && V.cores && V.famc && lt > 0.001) for (let j = 0; j < 3; j++) {
      const a = az + (j - 1) * c.w * 0.4, du = (a - V.cityAz) * V.cityDist;
      const town = Math.exp(-(((du + 200) / 5200) ** 2)) * V.lit.town * 1.4, col = [1.0 * town, 0.54 * town, 0.19 * town];
      V.cores.forEach((q, i) => { const k = Math.exp(-(((du - q[0]) / (q[2] * 2.4)) ** 2)) * V.lit.core * (0.3 + q[3] / 1000) * 3.0; for (let ch = 0; ch < 3; ch++) col[ch] += V.famc[i][ch] * k; });
      g[j] = col.map(v => v * lt * C.night.glow).concat([0]);
    }
    return { g0: g[0], g1: g[1], g2: g[2], n: [Sky.night || 0, C.night.moon, C.night.thin, 0] };
  }
  C.draw = function (R) {
    if (!C.enabled || !C.baked) return;
    C.time = R.time || 0;
    // (in heavy snow the fair-weather cumulus are lost in the overcast that rolls in over them: 05b_weather.js)
    const wx = typeof Weather !== 'undefined' ? 1 - Weather.kc : 1; if (wx < 0.003) return;
    for (const i of order) {
      const c = C.list[i], az = azAt(c, C.time), q = rect(i), fade = smooth(1.45, 1.2, Math.abs(az)) * wx * (c.keep === undefined ? 1 : c.keep), ru = C.rise * C.K / (2 * c.asp);
      if (fade < 0.002) continue;
      gfx.draw(pipeDraw, { u: { a: [az, c.el, c.tw, c.asp], t: [q[0], q[1], q[2] - q[0], q[3] - q[1]], k: [C.ksun, C.ksky, C.kgnd, c.haze + (1 - c.haze) * (0.10 + 0.32 * (c.rag || 0))], f: [fade, p, ru * C.oA, ru * C.oB], s: [Sky.sunFar[0], Sky.sunFar[1], Sky.sunFar[2], C.ktwi], ...cityUp(c, az) },
        tex: { tCloudA: cu.tex[iA], tCloudB: cu.tex[iB], tSky: Sky.lut }, count: 4 });
    }
  };
  return C;
})();

// ---- a 64^3 tiling noise volume packed as 8x8 slices: R billows (rounded cells with creases between them, 3 octaves), G soft noise
// (3 octaves), B finer billows, A very low soft noise. Each slice carries a rim one texel wide copied from its far side, so that a smooth
// tap near its edge never reads the neighbouring slice (and the volume has no seam where it repeats)
const CLOUD_VOLNOISE_FS = `
fn cvHash(c: vec3f, f: f32, sd: f32) -> vec3f { let w: vec3f = c - f * floor(c / f); return hash33(w + vec3f(sd * 17.0, sd * 31.0 + 5.0, sd * 47.0 + 11.0)); }
fn worleyP(p: vec3f, f: f32, sd: f32) -> f32 {
  let q: vec3f = p * f; let i: vec3f = floor(q); let fr: vec3f = q - i; var d: f32 = 9.0;
  for (var z: i32 = -1; z <= 1; z++) { for (var y: i32 = -1; y <= 1; y++) { for (var x: i32 = -1; x <= 1; x++) {
    let c: vec3f = vec3f(f32(x), f32(y), f32(z));
    let r: vec3f = c + cvHash(i + c, f, sd) - fr; d = min(d, dot(r, r));
  } } }
  return 1.0 - min(d, 1.0);
}
fn cvG(i: vec3f, c: vec3f, fr: vec3f, f: f32, sd: f32) -> f32 { return dot(cvHash(i + c, f, sd) * 2.0 - 1.0, fr - c); }
fn gradP(p: vec3f, f: f32, sd: f32) -> f32 {
  let q: vec3f = p * f; let i: vec3f = floor(q); let fr: vec3f = q - i; let u: vec3f = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  let a: f32 = mix(mix(cvG(i, vec3f(0.0, 0.0, 0.0), fr, f, sd), cvG(i, vec3f(1.0, 0.0, 0.0), fr, f, sd), u.x), mix(cvG(i, vec3f(0.0, 1.0, 0.0), fr, f, sd), cvG(i, vec3f(1.0, 1.0, 0.0), fr, f, sd), u.x), u.y);
  let b: f32 = mix(mix(cvG(i, vec3f(0.0, 0.0, 1.0), fr, f, sd), cvG(i, vec3f(1.0, 0.0, 1.0), fr, f, sd), u.x), mix(cvG(i, vec3f(0.0, 1.0, 1.0), fr, f, sd), cvG(i, vec3f(1.0, 1.0, 1.0), fr, f, sd), u.x), u.y);
  return mix(a, b, u.z);
}
fn frag(v: VOut) -> FOut { var o: FOut;
  let px: vec2f = v.uv * 528.0; let tile: vec2f = floor(px / 66.0);
  let p: vec3f = vec3f(fract((px - tile * 66.0 - 1.0) / 64.0), (tile.y * 8.0 + tile.x + 0.5) / 64.0);
  let w1: f32 = worleyP(p, 3.0, 1.0); let w2: f32 = worleyP(p, 6.0, 2.0); let w3: f32 = worleyP(p, 12.0, 3.0); let w4: f32 = worleyP(p, 20.0, 7.0);
  let g0: f32 = gradP(p, 2.0, 8.0); let g1: f32 = gradP(p, 4.0, 4.0); let g2: f32 = gradP(p, 8.0, 5.0); let g3: f32 = gradP(p, 16.0, 6.0);
  // (stretched to use the whole range: each ends up about 0..1 with its middle near a half)
  o.color = vec4f((w1 * 0.55 + w2 * 0.30 + w3 * 0.15 - 0.40) / 0.52, 0.5 + 1.7 * (g1 * 0.55 + g2 * 0.30 + g3 * 0.15), (w2 * 0.50 + w3 * 0.30 + w4 * 0.20 - 0.40) / 0.52, 0.5 + 1.5 * (g0 * 0.65 + g1 * 0.35)); return o; }
`;
const CLOUD_VOL_SSL = `
fn volT(z: f32) -> vec2f { let zz: f32 = z - 64.0 * floor(z / 64.0); let ty: f32 = floor(zz / 8.0); return vec2f(zz - ty * 8.0, ty) * 66.0 + 1.0; }
fn vol(p: vec3f) -> vec4f {
  let q: vec3f = fract(p) * 64.0;
  let zf: f32 = q.z - 0.5; let z0: f32 = floor(zf); let fz: f32 = zf - z0;
  return mix(texLod(tVol, (volT(z0) + q.xy) / 528.0, 0.0), texLod(tVol, (volT(z0 + 1.0) + q.xy) / 528.0, 0.0), fz);
}
// droplets throw most of the light on ahead and a little straight back
fn cloudPhase(c: f32, g: f32) -> f32 { return mix(hg(c, -0.3), hg(c, g), 0.8); }
`;
// ---- one cumulus in its own upright space: x across (as seen from the mountain), y up, z away; about two units wide.
// M.a = (seed, height of its base, tan of half its width as seen, its elevation), M.b = (distance, half depth, tile aspect, top),
// M.c = (lean with the wind, the three scales of the noise), M.k = (erosion when young, when old, diffuse share, extinction), M.o0..2 = where
// in the noise. The cloud is made of thermals: M.l0..4 = (centre, radius), M.m0..4 = (height / radius, -, age 0..1, weight)
const CLOUD_CU_SSL = `
// (how far inside the nearest thermal: 1 at its heart, 0 on its skin, negative outside; sums for the age of the air here)
fn cuLobe(p: vec3f, a: vec4f, b: vec4f, acc: vec3f) -> vec3f {
  let q: vec3f = (p - a.xyz) / (a.w * vec3f(1.0, b.x, 0.85));
  let e: f32 = 1.6 * b.w - 0.6 - length(q);
  let h: f32 = max(0.3 - abs(e - acc.x), 0.0);
  let g: f32 = saturate(e + 0.8); let w: f32 = g * g;
  return vec3f(max(e, acc.x) + h * h * 0.8333, acc.y + w * b.z, acc.z + w);
}
fn cuCov(p: vec3f) -> vec2f {
  var a: vec3f = vec3f(-9.0, 0.0, 1e-4);
  a = cuLobe(p, M.l0, M.m0, a); a = cuLobe(p, M.l1, M.m1, a); a = cuLobe(p, M.l2, M.m2, a); a = cuLobe(p, M.l3, M.m3, a); a = cuLobe(p, M.l4, M.m4, a); a = cuLobe(p, M.l5, M.m5, a); a = cuLobe(p, M.l6, M.m6, a);
  return vec2f(a.x, a.y / a.z);
}
// a torn scrap (M.m0.y) is drawn out along the wind: its noise is stretched across, so it tears into streaks, not into round patches
fn cuStr(p: vec3f) -> vec3f { return p * vec3f(1.0 - 0.65 * M.m0.y, 1.0, 1.0 - 0.4 * M.m0.y); }
// the wind is stronger higher up: the tops lean downwind
fn cuLean(p: vec3f) -> vec3f { return vec3f(p.x - M.c.x * (p.y - 0.5 * (M.a.y + M.b.w)), p.y, p.z); }
// the stretch of a line of sight (o + d t, in the leaned space) on which one thermal can have cloud: tr widened to take it in.
// (its skin can be pushed out by the billows and the wisps, and bulge where it meets a neighbour, by 0.51 of its radius at most)
fn cuHit(o: vec3f, d: vec3f, a: vec4f, b: vec4f, tr: vec2f) -> vec2f {
  let E: f32 = 1.6 * b.w - 0.09;
  if (E <= 0.0) { return tr; }
  let R: vec3f = a.w * E * vec3f(1.0, b.x, 0.85);
  let oq: vec3f = (o - a.xyz) / R; let dq: vec3f = d / R;
  let A: f32 = dot(dq, dq); let B: f32 = dot(oq, dq); let D: f32 = B * B - A * (dot(oq, oq) - 1.0);
  if (D <= 0.0) { return tr; }
  let sq: f32 = sqrt(D);
  return vec2f(min(tr.x, (-B - sq) / A), max(tr.y, (-B + sq) / A));
}
// young air has hard edges and is full of water; old air is thin and soft
fn cuSharp(age: f32) -> f32 { return mix(17.0, 2.2, sqrt(age)); }
fn cuMax(age: f32) -> f32 { return mix(1.0, 0.30, age * age); }
// a flat base where the air reaches its dew point (not quite flat: a little ragged)
// (a torn scrap, M.m0.y: no flat base at all, only a frayed underside)
fn cuBase(y: f32, n: f32) -> f32 { let rg: f32 = M.m0.y; return smoothstep(0.0, 0.045 + 0.08 * rg, y - M.a.y - (0.07 + 0.12 * rg) * (n - 0.5) - 0.02 * rg); }
// the cloud without its fine detail: enough for asking how much of it lies in the way of the light
fn cuDensLo(p: vec3f) -> f32 {
  if (p.y < M.a.y - 0.02) { return 0.0; }
  let ps: vec3f = cuLean(p); let cv: vec2f = cuCov(ps);
  if (cv.x < -0.4) { return 0.0; }
  let n: vec4f = vol(cuStr(ps) * M.c.y + M.o0.xyz);
  return saturate((cv.x + (mix(n.r, n.g, 0.35) - 0.56) * 0.75 - 0.07) * cuSharp(cv.y)) * cuMax(cv.y) * cuBase(p.y, n.a);
}
// (density, age). The thermals' skin is pushed out and in by billows a third their size; then the edge is eaten: young air along the
// seams between its bubbles (cauliflower), old air and the air at the base combed into shreds
fn cuDens(p: vec3f) -> vec2f {
  if (p.y < M.a.y - 0.02) { return vec2f(0.0); }
  let ps: vec3f = cuLean(p); let cv: vec2f = cuCov(ps);
  if (cv.x < -0.4) { return vec2f(0.0); }
  let n: vec4f = vol(cuStr(ps) * M.c.y + M.o0.xyz);
  // (a torn scrap: its outline is set by the soft noise more than by its bubbles)
  let rg: f32 = M.m0.y;
  var F: f32 = cv.x + (mix(n.r, n.g, 0.35 + 0.65 * rg) - 0.56) * (0.95 + 0.1 * rg);
  if (F <= -0.16) { return vec2f(0.0, cv.y); }
  let a: vec4f = vol(cuStr(ps) * M.c.z + M.o1.xyz); let b: vec4f = vol(cuStr(ps) * M.c.w + M.o2.xyz);
  let hN: f32 = saturate((p.y - M.a.y) / (M.b.w - M.a.y));
  // where the air is old: thermals past their prime, the skirts near the base, and patches all over where dry air has got in
  // (a torn scrap is old air through and through but for a firmer heart)
  let old: f32 = saturate(cv.y + 0.5 * (1.0 - smoothstep(0.0, 0.2, hN)) + 0.8 * smoothstep(0.50, 0.85, a.a) + M.m0.y * (0.85 - 0.3 * saturate(F * 3.0)));
  let seam: f32 = smoothstep(0.15, 0.85, (1.0 - a.r) * 0.62 + (1.0 - b.r) * 0.38);
  let e: f32 = mix(seam, a.g * 0.6 + b.g * 0.4, old);
  F -= e * mix(M.k.x, M.k.y, old) * (1.0 - 0.75 * (1.0 - 0.2 * rg) * saturate(F * 2.5));
  // the finest scale, on the skin only. Young air: small bulges on the bulges (the third step of the cauliflower), each crisp where the
  // sun finds it. Old air, the underside and the scraps: the same noise drawn out along the wind and flattened, so the edge frays into
  // streaks reaching out past the body (wisps), not into a soft glow
  if (F > -0.16 && F < 0.36 + 0.3 * rg) {
    let q: vec3f = ps * M.o3.w + M.o3.xyz;
    let wo: f32 = saturate(old + 0.7 * (1.0 - smoothstep(0.0, 0.3, hN)) + rg);
    let f4: vec4f = vol(q);
    var w4: f32 = 0.5; if (wo > 0.04) { w4 = vol(vec3f(q.x * 0.10, q.y * 0.55, q.z * 0.17) + vec3f(0.37, 0.0, 0.61)).g; }
    F -= saturate(1.0 - F / 0.36) * (1.0 - f4.b) * 0.18 * (1.0 - wo);
    F += max(1.0 - abs(F) / (0.30 + 0.25 * rg), 0.0) * (w4 - 0.47) * (0.36 + 0.5 * rg) * wo;
  }
  if (F <= 0.0) { return vec2f(0.0, old); }
  return vec2f(saturate(F * cuSharp(old) * (1.0 - 0.45 * rg)) * cuMax(old) * cuBase(p.y, n.a), old);
}
`;
const CLOUD_RECT_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let c: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u));
  let p: vec2f = mix(M.r.xy, M.r.zw, c);
  v.clip = vec4f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  v.uv = mix(M.t.xy, M.t.zw, c);
  return v; }`;
const CLOUD_BAKE_FS = `
fn nz(x: f32) -> f32 { return select(x, 1e-5, abs(x) < 1e-5); }
fn frag(v: VOut) -> FOut { var o: FOut;
  let yb: f32 = M.a.y; let tw: f32 = M.a.z; let yt: f32 = M.b.w; let sg: f32 = M.k.w; let Ls: vec3f = M.l.xyz;
  // the line of sight through this texel, turned into the cloud's upright space: the eye is below it and looks up at its base
  let dv: vec3f = normalize(vec3f((v.uv.x * 2.0 - 1.0) * tw, (1.0 - v.uv.y * 2.0) * M.b.z * tw, 1.0));
  let ce: f32 = cos(M.a.w); let se: f32 = sin(M.a.w);
  let rd: vec3f = vec3f(nz(dv.x), nz(dv.y * ce + dv.z * se), nz(dv.z * ce - dv.y * se));
  let ro: vec3f = vec3f(0.0, -M.b.x * se, -M.b.x * ce);
  // through the box the cloud lives in
  let ia: vec3f = (vec3f(-1.25, yb - 0.02, -M.b.y) - ro) / rd; let ib: vec3f = (vec3f(1.25, yt, M.b.y) - ro) / rd;
  // ...and of that only the stretch where a thermal is
  let rl: vec3f = cuLean(ro); let dl2: vec3f = vec3f(rd.x - M.c.x * rd.y, rd.y, rd.z);
  var tr: vec2f = vec2f(1e9, -1e9);
  tr = cuHit(rl, dl2, M.l0, M.m0, tr); tr = cuHit(rl, dl2, M.l1, M.m1, tr); tr = cuHit(rl, dl2, M.l2, M.m2, tr); tr = cuHit(rl, dl2, M.l3, M.m3, tr); tr = cuHit(rl, dl2, M.l4, M.m4, tr); tr = cuHit(rl, dl2, M.l5, M.m5, tr); tr = cuHit(rl, dl2, M.l6, M.m6, tr);
  let t0: f32 = max(max(max(min(ia.x, ib.x), min(ia.y, ib.y)), min(ia.z, ib.z)), tr.x); let t1: f32 = min(min(min(max(ia.x, ib.x), max(ia.y, ib.y)), max(ia.z, ib.z)), tr.y);
  if (t1 <= t0) { o.color = vec4f(0.0); return o; }
  // the angle between the sun and this line of sight (the silver lining is all about that angle)
  let c: f32 = dot(Ls, rd);
  let ph0: f32 = cloudPhase(c, 0.80); let ph1: f32 = cloudPhase(c, 0.40); let ph2: f32 = cloudPhase(c, 0.20);
  let ds: f32 = 0.0185; let jit: f32 = ign(v.clip.xy);
  var T: f32 = 1.0; var S: vec3f = vec3f(0.0);
  for (var i: i32 = 0; i < 100; i++) {
    let tt: f32 = t0 + (f32(i) + jit) * ds;
    if (tt > t1) { break; }
    let p: vec3f = ro + rd * tt;
    let dn: vec2f = cuDens(p);
    if (dn.x > 0.003) {
      // how much cloud lies between here and the sun: five strides that lengthen as they go
      var tl: f32 = 0.0; var st: f32 = 0.028; var pl: vec3f = p;
      for (var j: i32 = 0; j < 5; j++) {
        pl += Ls * (st * 0.5);
        // (the first with all the detail: the small bulges shade the seams between them)
        var dl: f32 = 0.0; if (j < 1) { dl = cuDens(pl).x; } else { dl = cuDensLo(pl); }
        tl += dl * st;
        pl += Ls * (st * 0.5); st *= 1.9;
      }
      let tau: f32 = tl * sg;
      // ...and how much hangs overhead, between here and the open sky
      // (two looks up: just over this spot, and further: a crease between two towers and the core under a turret see little of the sky)
      let tu: f32 = (cuDensLo(p + vec3f(0.0, 0.08, 0.0)) * 0.16 + cuDensLo(p + vec3f(0.0, 0.26, 0.0)) * 0.30) * sg;
      // light that has been scattered many times needs cloud all round to be scattered in: a thin shred has next to none of it, and seen
      // with the sun behind you it is greyer than the heart of the cloud (seen against the sun it blazes: the first term below)
      let pw: f32 = (1.0 - 0.7 * dn.y) * (0.45 + 0.55 * saturate(dn.x * 2.0));
      // the first bounces keep their direction; later ones forget it and reach deeper; what has no direction left still gets through, a
      // good deal of it: the heart of a cloud between the eye and the sun is a soft grey-white, not dark (but the far side of a really
      // thick one is dusky against a low sun: what gets right through falls off faster than what gets a little way in)
      let hN: f32 = saturate((p.y - yb) / (yt - yb));
      // (the far rim of the base, seen from below, is no silver lining: the gleam is kept to the flanks and the top; and thin air between
      // the bulges is greyer than the bulges)
      // Powder: right at a sunlit skin little light has yet been scattered sideways into the eye, so with the sun beside or behind you the
      // outermost skin of each bulge is a touch darker than just inside it: every bulge stands out against the one behind it. Seen against
      // the sun it is the other way round (the silver lining), so it fades out there
      let pdr: f32 = 1.0 - 0.5 * exp(-4.0 * tau) * saturate(0.6 - 0.8 * c);
      let lsun: f32 = M.l.w * mix(0.3, 1.0, smoothstep(0.0, 0.25, hN)) * PI * (ph0 * exp(-tau) * pdr + 0.6 * ph1 * exp(-0.6 * tau) + 0.3 * ph2 * exp(-0.3 * tau))
        + M.k.z * pw / (1.0 + 0.40 * tau + 0.025 * tau * tau);
      // the sky fills in from above and the snowfields and the deck from below (the base stays the darkest part of a big one); a shred is open to all of it (it is never darker than
      // the sky behind it), the body only where it faces them
      let asky: f32 = exp(-0.45 * tu) * mix(1.0, 0.45 + 0.55 * hN, pw);
      let agnd: f32 = mix(1.3, 0.55 * exp(-3.0 * hN) + 0.15, pw);
      let dT: f32 = exp(-dn.x * sg * ds);
      S += (T * (1.0 - dT)) * vec3f(lsun, asky, agnd);
      T *= dT;
      // (what little would still get through is taken as stopped here: else the sun's disc behind the thick of a cloud shines through it)
      if (T < 0.03) { S += T * vec3f(lsun, asky, agnd); T = 0.0; break; }
    }
  }
  o.color = vec4f(S, 1.0 - T); return o; }
`;
// the sun's disc through one cumulus: its direction put into the cloud's tile (as CLOUD_DRAW_VS lays the tile out), five taps over the disc
const CLOUD_SUN_FS = `
fn frag(v: VOut) -> FOut { var o: FOut;
  let ce: f32 = cos(M.a.y); let f: vec3f = vec3f(sin(M.a.x) * ce, sin(M.a.y), -cos(M.a.x) * ce);
  let r: vec3f = normalize(cross(f, vec3f(0.0, 1.0, 0.0))); let u: vec3f = cross(r, f);
  var a: f32 = 0.0;
  for (var i: i32 = 0; i < 5; i++) {
    let an: f32 = f32(i) * 1.2566; let rr: f32 = select(0.0045, 0.0, i == 0);
    let s: vec3f = normalize(M.s.xyz + (r * cos(an) + u * sin(an)) * rr);
    let k: f32 = dot(s, f);
    if (k > 0.05) {
      let x: f32 = dot(s, r) / (k * M.a.z); let y: f32 = dot(s, u) / (k * M.a.z * M.a.w);
      let uv: vec2f = vec2f(x * 0.5 + 0.5, 0.5 - y * 0.5);
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        let ua: vec2f = M.t.xy + clamp(vec2f(uv.x, uv.y + M.f.z), vec2f(0.004), vec2f(0.996)) * M.t.zw;
        let ub: vec2f = M.t.xy + clamp(vec2f(uv.x, uv.y + M.f.w), vec2f(0.004), vec2f(0.996)) * M.t.zw;
        let e: vec2f = min(uv, 1.0 - uv);
        a += mix(texLod(tCloudA, ua, 0.0).a, texLod(tCloudB, ub, 0.0).a, M.f.y) * smoothstep(0.0, 0.03, min(e.x, e.y));
      }
    }
  }
  let T: f32 = 1.0 - saturate(a / 5.0 * M.f.x);
  o.color = vec4f(T, T, T, 1.0); return o; }
`;
const CLOUD_DRAW_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let c: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u));
  let ce: f32 = cos(M.a.y); let f: vec3f = vec3f(sin(M.a.x) * ce, sin(M.a.y), -cos(M.a.x) * ce);
  let r: vec3f = normalize(cross(f, vec3f(0.0, 1.0, 0.0))); let u: vec3f = cross(r, f);
  let d: vec3f = f + r * ((c.x * 2.0 - 1.0) * M.a.z) + u * ((c.y * 2.0 - 1.0) * M.a.z * M.a.w);
  let cp: vec4f = U.viewProj * vec4f(U.camPos.xyz + d * 2000.0, 1.0);
  v.clip = vec4f(cp.xy, cp.w, cp.w);
  v.uv = vec2f(c.x, 1.0 - c.y); v.dir = d;
  return v; }`;
// M.f = (fading in at the edge of the sky, how far from the last key to the next, how far the billows have risen since the one / before the other)
const CLOUD_DRAW_FS = `
fn frag(v: VOut) -> FOut { var o: FOut;
  let ua: vec2f = M.t.xy + clamp(vec2f(v.uv.x, v.uv.y + M.f.z), vec2f(0.004), vec2f(0.996)) * M.t.zw;
  let ub: vec2f = M.t.xy + clamp(vec2f(v.uv.x, v.uv.y + M.f.w), vec2f(0.004), vec2f(0.996)) * M.t.zw;
  // between the last key and the next
  let t: vec4f = mix(texLod(tCloudA, ua, 0.0), texLod(tCloudB, ub, 0.0), M.f.y);
  if (t.a < 0.003) { discard; }
  // (they hang higher than the mountain and keep the sun a little longer: M.s)
  // (what comes up from below is as much the blue shade of the snowfields and the deck as their sunlit side)
  var col: vec3f = M.s.rgb * (t.x * M.k.x) + U.ambSky.rgb * (t.y * M.k.y + t.z * M.k.z * 0.55) + U.ambGnd.rgb * (t.z * M.k.z * 0.45);
  // after sunset the bright band low on the sun's bearing goes on lighting them, on the flanks turned to it and from underneath
  col += U.twi.rgb * ((t.x * 0.8 + t.z * 0.35) * M.s.w);
  // at night: the moon catches the tops (the key holds the moon's light then: 05_sky.js lights by the moon after dark), and the town's
  // glow comes up under the bases, in the colours of the quarters below them
  col += M.s.rgb * (t.x * M.k.x * M.n.x * (M.n.y - 1.0));
  let gx: f32 = v.uv.x * 2.0;
  col += mix(mix(M.g0.rgb, M.g1.rgb, saturate(gx)), M.g2.rgb, saturate(gx - 1.0)) * ((t.z * 0.9 + t.y * 0.03) * smoothstep(0.35, 0.9, v.uv.y));      // (the base: the lower part of the tile)
  // the air between here and the cloud
  let d: vec3f = normalize(v.dir);
  col = mix(col, skyLut(vec3f(d.x, max(d.y, 0.0), d.z)) * t.a, M.k.w);
  // (nothing may end at the edge of its tile)
  let e: vec2f = min(v.uv, 1.0 - v.uv);
  // at night the thin parts thin further, so the nebula and the stars show through the edges (a lump of smoke has hard ones)
  let ta: f32 = pow(t.a, 1.0 + M.n.z * M.n.x);
  // The sun's disc and its hot core are thousands of times the sky: whatever share of it a thin edge lets through would still blaze.
  // Close to the sun the cloud is taken as much thicker than it is (its transmittance to a high power): the disc is gone wherever there
  // is cloud worth the name, and shows only through the last frayed wisps at the very edge (the moon the same at night)
  let cs: f32 = dot(d, U.sunDir.xyz);
  let kp: f32 = 1.0 + 14.0 * smoothstep(0.9975, 0.99995, cs);
  let ao: f32 = 1.0 - pow(1.0 - ta, kp);
  // (what is taken from the blaze behind a thin edge comes back as that edge's own glow, in the colour of the sky round the sun: no dark seam)
  let fill: vec3f = skyLut(vec3f(d.x, max(d.y, 0.0), d.z)) * ((ao - ta) * 2.0);
  o.color = vec4f(col * (ta / max(t.a, 1e-4)) + fill, ao) * (M.f.x * smoothstep(0.0, 0.03, min(e.x, e.y))); return o; }
`;

// ---- the sea of cloud, as a volume. q = a spot on the map (m from the eye, carried along by the wind), y = height above the deck's floor (m).
// M.p = (time, extinction per metre, strength of the forward gleam, rate of change), M.l = (toward the sun, diffuse share), M.w = how far the wind has carried it
const SEA_FIELD_SSL = `
// (across the wind, along it): the deck is drawn out into streets along the wind
fn seaRot(q: vec2f) -> vec2f { return vec2f(q.x * ${seaF(SEA.wind[1] / Math.hypot(SEA.wind[0], SEA.wind[1]))} - q.y * ${seaF(SEA.wind[0] / Math.hypot(SEA.wind[0], SEA.wind[1]))}, q.x * ${seaF(SEA.wind[0] / Math.hypot(SEA.wind[0], SEA.wind[1]))} + q.y * ${seaF(SEA.wind[1] / Math.hypot(SEA.wind[0], SEA.wind[1]))}); }
// the lie of the deck without its cells: (mean height of its top, how high the cells stand, how lively this part is 0..1).
// A broad swell, long rolls, and stretches where it lies flat and thin as fog between stretches where it heaps up.
// (Towers pushed up through the top here and there were tried and taken out again: at this distance they read as a tray of cushions)
fn seaBase(q: vec2f) -> vec3f {
  let tt: f32 = M.p.x * M.p.w;
  let sw: vec4f = vol(vec3f(q / 23000.0 + vec2f(0.13, 0.71), tt * 0.0012));
  let qr: vec2f = seaRot(q);
  let ro: vec4f = vol(vec3f(qr.x / 3100.0, qr.y / 12000.0, tt * 0.0025 + 0.4));
  let vig: f32 = smoothstep(0.30, 0.70, sw.g);
  let mean: f32 = 150.0 + 110.0 * (sw.a - 0.5) + 60.0 * (ro.g - 0.5) * (0.4 + 0.6 * vig);
  return vec3f(mean, min(45.0 + 95.0 * vig, (mean - 35.0) * 1.4), vig);
}
// how much of it can no longer be told apart at range t (0 all there .. 1 gone): (the cells, the shreds and small bumps, the lumps)
fn seaLod(t: f32) -> vec3f { return vec3f(smoothstep(16000.0, 38000.0, t), smoothstep(4500.0, 11000.0, t), smoothstep(8000.0, 22000.0, t)); }
// the cells: rounded crowns with creases between them, longer along the wind than across; they turn over as time passes. On the crowns
// sit lumps a third their size, the wool of a real deck: each a small convective top, crisp while it rises.
// (0 crease .. 1 crown, the same for the small bumps, the same for the lumps)
fn seaCells(q: vec2f, lod: vec3f) -> vec3f {
  let tt: f32 = M.p.x * M.p.w; let qr: vec2f = seaRot(q);
  let c1: vec4f = vol(vec3f(qr.x / 3000.0, qr.y / 5200.0, tt * 0.004 + 0.2));
  let c2: vec4f = vol(vec3f((qr.x * 0.9 - qr.y * 0.43) / 1900.0 + 0.5, (qr.x * 0.43 + qr.y * 0.9) / 2900.0 + 0.3, tt * 0.0045 + 0.7));
  var lu: f32 = 0.56;
  if (lod.z < 0.999) { lu = mix(vol(vec3f((qr.x * 0.94 + qr.y * 0.34) / 1150.0 + 0.3, (qr.y * 0.94 - qr.x * 0.34) / 1650.0 + 0.6, tt * 0.004 + 0.1)).r, 0.56, lod.z); }
  return vec3f(mix(c1.r * 0.62 + c2.r * 0.38, 0.59, lod.x), mix(c2.b, 0.58, lod.y), lu);
}
// how high the lumps stand (m) on a cell of crown-ness cx where the cells stand b.y high: most on the crowns, next to nothing in the troughs
fn seaLump(by: f32, cx: f32) -> f32 { return (18.0 + 0.30 * by) * (0.25 + 0.75 * smoothstep(0.35, 0.75, cx)); }
fn seaHeight(b: vec3f, c: vec3f) -> f32 { return b.x + b.y * (c.x - 0.59 + 0.16 * (c.y - 0.58)) + seaLump(b.y, c.x) * (c.z - 0.56); }
// its top as a height field: (height, the mean height hereabouts, liveliness, how open to the sky: 0.4 deep in a crease .. 1 on a crown)
fn seaTop(q: vec2f, lod: vec3f) -> vec4f {
  let b: vec3f = seaBase(q);
  // (where creases can no longer be told apart their share of the sky is the average: 0.925 for the cells, 0.945 for the lumps)
  if (lod.x >= 0.999) { return vec4f(b.x, b.x, b.z, 0.874); }
  let c: vec3f = seaCells(q, lod);
  return vec4f(seaHeight(b, c), b.x, b.z, mix(0.62, 1.0, smoothstep(0.20, 0.60, c.x)) * mix(1.0, 0.925, lod.x) * mix(0.68, 1.0, smoothstep(0.12, 0.60, c.z)) * mix(1.0, 0.945, lod.z));
}
// (density 0..1, clear height above anything that could be cloud here). The top is no surface: over some tens of metres the dry air above
// eats into it and shreds of it lift off, drawn out along the wind, rising and thinning away. lod: see seaLod; t: how far off (m)
fn seaDens(q: vec2f, y: f32, lod: vec3f, t: f32) -> vec2f {
  let b: vec3f = seaBase(q);
  let gap: f32 = y - (b.x + (0.61 * b.y + 8.0) * (1.0 - lod.x) + 46.0);
  if (gap > 0.0) { return vec2f(0.0, gap); }
  var h: f32 = b.x; var soft: f32 = 36.0;
  // (a rising crown has a hard edge, the air sinking between the crowns is full of thinning fog)
  if (lod.x < 0.999) { let c: vec3f = seaCells(q, lod); h = seaHeight(b, c); soft = mix(36.0, mix(46.0, 16.0, smoothstep(0.35, 0.75, c.x) * (0.4 + 0.6 * smoothstep(0.35, 0.75, c.z))), 1.0 - lod.z); }
  let dp: f32 = h - y;
  if (dp < -56.0) { return vec2f(0.0); }
  var n: f32 = 0.5;
  if (t < 22000.0 && dp < 56.0) {
    let tt: f32 = M.p.x * M.p.w; let qr: vec2f = seaRot(q); let p3: vec3f = vec3f(qr.x, y * 1.5, qr.y * 0.55);
    let e1: vec4f = vol(p3 / 640.0 + vec3f(0.0, -tt * 0.004, tt * 0.0022));
    let e2: vec4f = vol(p3 / 205.0 + vec3f(tt * 0.0025, -tt * 0.0036, tt * 0.0025));
    n = mix(mix(e1.r * 0.35 + e1.g * 0.30 + e2.g * 0.35, e1.r * 0.45 + e1.g * 0.38 + 0.085, lod.y), 0.5, smoothstep(9000.0, 22000.0, t));
  }
  return vec2f(saturate(0.5 + dp / soft + (n - 0.5) * 1.4), 0.0);
}
`;
const SEA_BAKE_FS = `
fn frag(v: VOut) -> FOut { var o: FOut;
  // the line of sight this texel stands for (see seaUV in 05_sky.js: the same layout, the other way round)
  let ma: f32 = (v.uv.x - 0.5) * 6.2831853; var az: f32 = ma;
  for (var i: i32 = 0; i < 6; i++) { az -= (az + ${seaF(SEA.k)} * sin(az) - ma) / (1.0 + ${seaF(SEA.k)} * cos(az)); }
  let vv: f32 = v.uv.y; let th: f32 = ${seaF(SEA.ta)} * vv + ${seaF(SEA.tb)} * vv * vv * vv * vv;
  let sth: f32 = max(sin(th), 0.004); let cth: f32 = cos(th);
  let dh: vec2f = vec2f(sin(az), -cos(az));
  let mu: f32 = dot(M.l.xyz, vec3f(dh.x * cth, -sth, dh.y * cth));
  let ph0: f32 = cloudPhase(mu, 0.72); let ph1: f32 = cloudPhase(mu, 0.40);
  let sg: f32 = M.p.y; let Lh: vec2f = M.l.xz; let Ly: f32 = M.l.y; let lhl: f32 = max(length(Lh), 1e-3);
  // down through the layer in level slices seven metres apart (long strides while nothing can be there): however flat the line of sight,
  // no crest is stepped over. Between two slices the cloud is taken to thicken evenly, so the slices leave no terraces
  var y: f32 = ${seaF(SEA.top)}; var T: f32 = 1.0; var dnp: f32 = 0.0; var tp: f32 = ${seaF(SEA.deck - SEA.top)} / sth;
  var ts: f32 = 0.0; var ws: f32 = 0.0; var thn: f32 = 0.0;
  for (var i: i32 = 0; i < 72; i++) {
    let t: f32 = (${seaF(SEA.deck)} - y) / sth; let q: vec2f = dh * (cth * t) + M.w.xy;
    let d: vec2f = seaDens(q, y, seaLod(t), t);
    if (d.x + dnp > 0.0) {
      let tau: f32 = sg * (t - tp) * 0.5 * (d.x + dnp); let dT: f32 = exp(-tau); let w: f32 = T * (1.0 - dT);
      ts += w * (tp + (t - tp) / (2.0 + 0.6 * tau)); ws += w; thn += w * (1.0 - 0.5 * (d.x + dnp)); T *= dT;
    }
    if (T < 0.015 || y <= 0.0) { break; }
    dnp = d.x; tp = t; y = max(y - max(7.0, 0.6 * d.y), 0.0);
  }
  // where the eye comes to rest: that spot is lit (what is left over is the deck itself, whole under its top)
  let thin: f32 = smoothstep(0.45, 0.92, thn / max(ws, 1e-3));
  let tm: f32 = (ts + T * (${seaF(SEA.deck)} - y) / sth) / (ws + T);
  let ys: f32 = ${seaF(SEA.deck)} - sth * tm; let qs: vec2f = dh * (cth * tm) + M.w.xy;
  let lods: vec3f = seaLod(tm);
  let s0: vec4f = seaTop(qs, lods);
  // the sun: is there cloud in its way? What is near soaks the light up and passes it on; what is far simply throws a shadow
  var tn: f32 = 0.0; var tf: f32 = 0.0; var s: f32 = 0.0; var st: f32 = 24.0; var h1: f32 = s0.x;
  for (var j: i32 = 0; j < 7; j++) {
    s += st * 0.5;
    let tq: vec4f = seaTop(qs + Lh * s, vec3f(select(lods.x, 1.0, j > 4), select(lods.y, 1.0, j > 1), select(lods.z, 1.0, j > 3)));
    let dl: f32 = saturate(0.5 + (tq.x - (ys + Ly * s)) / select(36.0, 130.0, j > 4));
    if (j == 0) { h1 = tq.x; }
    if (j < 3) { tn += dl * st; } else { tf += dl * st; }
    s += st * 0.5; st *= 2.1;
  }
  // the lie of the top toward the sun: a flank turned to a low sun is bright, the level top only grazed
  let slope: f32 = (h1 - s0.x) / (12.0 * lhl);
  let lit: f32 = saturate(((Ly - slope * lhl) / sqrt(1.0 + slope * slope) + 0.3) / 1.3);
  let taun: f32 = tn * sg; let vis: f32 = exp(-0.014 * tf);
  // (a shred has no body to scatter in: seen with the sun behind you it is greyer than the deck, against the sun it gleams)
  let pw: f32 = 1.0 - 0.5 * thin;
  let open: f32 = smoothstep(-70.0, 50.0, ys - s0.y);
  // (light that went in on the sunlit side of a crown comes out again all round it: no shadow on cloud is as dark as one on snow)
  let lsun: f32 = vis * M.p.z * PI * (ph0 * exp(-taun) + 0.5 * ph1 * exp(-0.5 * taun)) * (0.5 + 0.5 * thin) + M.l.w * pw * (vis * lit / (1.0 + 0.11 * taun) + (1.0 - vis) * 0.03);
  let asky: f32 = 2.2 * (0.6 + 0.4 * open) * s0.w;
  let abnc: f32 = 0.15 * (1.0 - open) + 0.10 * thin + 0.03;
  o.color = vec4f(lsun, asky, abnc, tm * 0.001); return o; }
`;
