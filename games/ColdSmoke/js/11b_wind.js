"use strict";
// ---------------------------------------------------------------- snow the wind carries: smoke off the crests, and drift along the ground
// Two things the wind does to snow that lies, both stateless on the GPU (every particle is worked out from its number and the clock):
//   PLUMES — spindrift off the crests. Where a ridge stands across the wind (the windward side rising to it, the lee side falling away) the
//            wind picks the loose snow off the top and streams it out over the lee as a thin fibrous smoke that rises as it goes, with single
//            crystals flashing in it (A03, S6 ridge plume, snow blowing off a summit). A crest is looked for a few times a frame in the view
//            (Course.height across the wind at a spacing that grows with the distance, so a cornice lip on the ridge run near by and a summit
//            two kilometres off are found the same way); each found one becomes a streamer for ten to thirty seconds. A streamer's numbers sit
//            in a small float texture (one row each); its particles leave the crest one after another and are carried out along the wind.
//   GROUND — drift a hand high snaking across the open slope (S6 backlit ground drift): long low wisps in a box that rides ahead of the lens,
//            carried with the air, thick only in streams that wander and break, and only where a gust is passing.
// Both follow the wind of the game (App.state.wind, which 05b_weather.js sets: a breeze on a clear day, a gusting wind in heavy snow), and
// both come and go with the same gust fronts that cross the hill and lean the flags (14b_gates.js) and blow in the skier's ears (07c_feel.js):
// vnoise1(t * 0.31 - (x, z) . wind * 0.06, 7), worked out here on the GPU word for word. 05b_weather.js is only read.
const Wind = (() => {
  const W = { enabled: true, NS: 32, PS: 40, PC: 64, NG: 2000, BOX: 64, tries: 4, far: 2600,
    stats: { plumes: 0, found: 0, tried: 0, ground: 0, ms: 0 } };
  // the owner's choice: a no wind-blown snow (as it was), b smoke off the crests and drift along the ground, c the same, more of it
  if (typeof Variants !== 'undefined') Variants.def('drift', '风吹雪', [['a', '无'], ['b', '有'], ['c', '更强']], 'b');
  // the smoke off the crests: a, as delivered (lit by the sun's own colour, so at the golden hour and at sunset a thin wisp over a deep blue
  // sky came out tan, a brown feather or a stalk of dry grass, and a few wisps were thrown far up off the ridge); b, as the photographs show
  // spindrift: a white veil lying close along the crest, its wisps half as high again at most and wider, so they run together
  if (typeof Variants !== 'undefined') Variants.def('plume', '└ 山脊雪烟', [['a', '原来'], ['b', '白纱']], 'b');
  const KV = { a: 0, b: 1, c: 1.8 };
  let gfx, pipeSmoke, pipeGlint, pipeGround, dataTex, data, rnd = RNG(4517), kv = 1, nAct = 32, dirty = false;
  const slots = [], off = [0, 0];
  // (the mean bearing of the wind in 05b_weather.js: the ground's streams are laid out along it, not along the wind of the moment, so that
  // a swing of the wind never slides the whole pattern sideways)
  const A0 = 0.3218, D0 = [Math.cos(A0), Math.sin(A0)];

  W.init = function (g) {
    gfx = g;
    const phone = handheldNow();
    if (phone) { W.NG = 1000; nAct = 16; W.tries = 2; } else nAct = W.NS;
    for (let i = 0; i < W.NS; i++) slots.push({ on: false });
    data = new Float32Array(16 * W.NS);
    dataTex = gfx.texture({ w: 4, h: W.NS, format: 'rgba32f', filter: 'nearest' });
    gfx.updateTexture(dataTex, 0, 0, 4, W.NS, data);
    const lib = [SL.common, SL.hash, SL.depth, SL.shadow, SL.fog, WIND_SSL, PLUME_SSL];
    pipeSmoke = gfx.pipeline({
      name: 'windSmoke', lib, topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'premul', buffers: [],
      varyings: { uv: 'vec4f', c: 'vec4f', z: 'vec4f' }, uniforms: { p: 'vec4f' },
      textures: { tS: 'fetch', tDepth: 'depth', tShadow: 'shadow', tSky: '2d', tDetail: '2d' }, vs: PLUME_VS, fs: WISP_FS,
    });
    pipeGlint = gfx.pipeline({
      name: 'windGlint', lib: [SL.common, SL.hash, SL.depth, SL.shadow, GLINT_SSL, WIND_SSL, PLUME_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'add', buffers: [],
      varyings: { uv: 'vec2f', shp: 'vec4f', col: 'vec4f' }, uniforms: { p: 'vec4f' },
      textures: { tS: 'fetch', tDepth: 'depth', tShadow: 'shadow' }, vs: PLUME_GLINT_VS,
      fs: `fn frag(v: VOut) -> FOut { var o: FOut; o.color = glintShade(v.uv, v.shp, v.col); return o; }`,
    });
    pipeGround = gfx.pipeline({
      name: 'windGround', lib: [SL.common, SL.hash, SL.depth, SL.shadow, SL.fog, GROUND_SSL, WIND_SSL], topology: 'strip', cull: 'none', depth: false, depthTest: false, blend: 'premul', buffers: [],
      varyings: { uv: 'vec4f', c: 'vec4f', z: 'vec4f' }, uniforms: { hx: 'vec4f', g: 'vec4f', d: 'vec4f', o: 'vec4f' },
      textures: { tH: 'fetch', tDepth: 'depth', tShadow: 'shadow', tSky: '2d', tDetail: '2d' }, vs: GROUND_VS, fs: WISP_FS,
    });
    W.pipes = [pipeSmoke, pipeGlint, pipeGround];
    if (typeof App !== 'undefined' && App.onTick) App.onTick.push(dt => W.update(dt));
  };
  function handheldNow() { try { return !!(window.matchMedia && matchMedia('(pointer: coarse) and (hover: none)').matches); } catch (e) { return false; } }
  W.reset = function () { for (const s of slots) s.on = false; };

  // ---- the crests. A point is a crest across the wind if the ground rises to it from upwind and falls away from it downwind, both by a good
  // part of the spacing D it is asked at; it is then walked to the top along the wind. (The spacing grows with the distance: near by the lip
  // of a cornice is a crest, far off only a ridge of the mountain is.)
  const H = (x, z, cell) => Course.height(x, z, cell);
  function look(cam, wx, wz) {
    W.stats.tried++;
    let x, z, D;
    const s0 = -cam.pos[2], c0 = Course.at(s0 + 60);
    if ((c0.ridge || 0) > 0.25 && rnd() < 0.5) {
      // on the ridge run: its lips, either side of the crest (the lee one is the one that smokes; the test below says which)
      const s = s0 + 15 + 220 * rnd(), c = Course.at(s);
      if ((c.ridge || 0) < 0.25) return;
      const side = rnd() < 0.75 ? Math.sign(wx) || 1 : -(Math.sign(wx) || 1);
      x = c.cx + side * (c.hw + 1.5 + 2 * (rnd() - 0.5)); z = -s; D = 6;
    } else {
      // anywhere in the view, out to the far mountains, as many tries near as far (the distance is drawn on a log scale)
      const d = 45 * Math.pow(W.far / 45, rnd()), fl = Math.hypot(cam.fwd[0], cam.fwd[2]) || 1, yaw = Math.atan2(cam.fwd[0] / fl, cam.fwd[2] / fl);
      const half = Math.atan(Math.tan(cam.fovY / 2) * Math.max(Render.W / Math.max(Render.H, 1), 1)) * 1.1, a = yaw + (rnd() * 2 - 1) * half;
      x = cam.pos[0] + Math.sin(a) * d; z = cam.pos[2] + Math.cos(a) * d; D = clamp(d * 0.035, 6, 75);
    }
    const cell = clamp(D / 4, 0.5, 40);
    let h0 = H(x, z, cell); const hu = H(x - wx * D, z - wz * D, cell), hd = H(x + wx * D, z + wz * D, cell);
    if (h0 - hd < 0.26 * D || h0 - hu < 0.06 * D) return;
    for (const k of [0.5, 0.25]) {
      const a = H(x + wx * D * k, z + wz * D * k, cell), b = H(x - wx * D * k, z - wz * D * k, cell);
      if (a > h0 && a >= b) { x += wx * D * k; z += wz * D * k; h0 = a; } else if (b > h0) { x -= wx * D * k; z -= wz * D * k; h0 = b; }
    }
    const sharp = (2 * h0 - hu - hd) / D;
    // (one streamer to a stretch of crest: the next one along it is a separate try)
    for (const s of slots) if (s.on && Math.hypot(s.x - x, s.z - z) < Math.max(D, s.D) * 1.3) return;
    let free = null;
    for (let i = 0; i < nAct; i++) if (!slots[i].on) { free = slots[i]; break; }
    if (!free) return;
    W.stats.found++;
    const L = clamp(D * 4.5, 22, 340) * (0.75 + 0.5 * rnd());
    Object.assign(free, { on: true, x, y: h0 + 0.2, z, D, L, H: L * (0.16 + 0.12 * rnd()), Wc: D * (0.9 + 0.6 * rnd()), seed: Math.floor(rnd() * 1e6) + 1,
      age: 0, life: 10 + 22 * rnd(), k: clamp(0.45 + sharp * 0.9, 0.5, 1.25), U: 0, fade: 0 });
  }

  // once a step (App.onTick, so that it goes on while a test runs the game on without drawing): follow the wind, keep the streamers, look
  // for crests, write their numbers (uploaded when a frame is drawn)
  W.update = function (dt) {
    dt = dt > 0 && dt < 0.25 ? dt : 0;
    if (!W.enabled || !gfx) return 0;
    const t0 = performance.now(), cam = Render.cam, o = Render.origin;
    if (Course.seed !== W.seed) { W.seed = Course.seed; W.reset(); }        // (another mountain: its crests are elsewhere)
    kv = KV[typeof Variants !== 'undefined' ? Variants.val.drift : 'b']; if (kv == null) kv = 1;
    const st = App.state, wv = st.wind || [1.2, 0, 0.4], ws = Math.hypot(wv[0], wv[2]) || 1, wx = wv[0] / ws, wz = wv[2] / ws;
    const ks = typeof Weather !== 'undefined' ? Weather.ks || 0 : 0;
    W.wx = wx; W.wz = wz; W.ws = ws;
    // how hard it blows up on the crests: there is wind enough aloft on a clear day to smoke the high ridges, and a storm smokes them all
    W.plume = kv * (0.8 + 0.7 * smooth(2.5, 9, ws) + 0.35 * ks);
    // and along the ground: some on the open slopes even in a breeze (a ridge more: it stands in the wind), much more in a storm; little where
    // the trees stand in the run (a glade)
    const c = Course.at(-cam.pos[2] + 20), open = 1 - 0.85 * (c.glade || 0);
    W.ground = kv * open * (0.32 * (1 + 1.6 * (c.ridge || 0)) + 1.1 * smooth(2.5, 8.5, ws) + 0.25 * ks);
    // the air near the snow moves on at a little more than the breeze the game gives (a clear day's 1.3 m/s would be a stroll), and with it
    W.ud = 1.6 + 1.1 * ws;
    off[0] = (off[0] + wx * W.ud * dt) % 65536; off[1] = (off[1] + wz * W.ud * dt) % 65536;
    // streamers: born, live, fade; gone when far behind or far off
    const fx = cam.fwd[0], fz = cam.fwd[2], fl = Math.hypot(fx, fz) || 1;
    let n = 0;
    for (let i = 0; i < W.NS; i++) {
      const s = slots[i], q = i * 16;
      if (s.on) {
        s.age += dt;
        const dx = s.x - cam.pos[0], dz = s.z - cam.pos[2], d = Math.hypot(dx, dz);
        if ((dx * fx + dz * fz) / fl < -Math.max(40, s.L) || d > W.far * 1.15 || i >= nAct) s.life = Math.min(s.life, s.age + 1.5);
        if (s.age >= s.life || kv === 0) s.on = false;
      }
      if (!s.on) { data[q + 3] = 0; continue; }
      n++;
      // (the speed it leaves the crest at: the wind speeds up over a ridge, more over a big one)
      s.U = (3.5 + 1.3 * ws) * (s.L > 120 ? 1.5 : 1);
      s.fade = smooth(0, 2.5, s.age) * smooth(s.life, s.life - 3, s.age);
      data[q] = s.x - o[0]; data[q + 1] = s.y - o[1]; data[q + 2] = s.z - o[2]; data[q + 3] = s.fade * s.k * W.plume;
      data[q + 4] = wx; data[q + 5] = wz; data[q + 6] = s.U; data[q + 7] = s.L;
      data[q + 8] = (s.x * wx + s.z * wz) * 0.06; data[q + 9] = s.seed; data[q + 10] = s.L / s.U; data[q + 11] = s.H;
      data[q + 12] = s.Wc; data[q + 13] = W.plume * smooth(0.2, 1, s.k); data[q + 14] = 0; data[q + 15] = 0;
    }
    if (kv > 0 && dt) for (let k = 0; k < W.tries; k++) look(cam, wx, wz);
    W.stats.plumes = n; dirty = true;
    W.stats.ms = W.stats.ms * 0.95 + (performance.now() - t0) * 0.05;
    return n;
  };

  W.fx = function (R) {
    if (!W.enabled || !gfx) return;
    const n = W.stats.plumes;
    if (dirty) { gfx.updateTexture(dataTex, 0, 0, 4, W.NS, data); dirty = false; }
    if (kv === 0) return;
    const sky = typeof Sky !== 'undefined' ? Sky.lut : null;
    if (n) {
      // (a lower Quality level, Quality.k('wind'): fewer wisps to a plume, each a little thicker, p.z)
      const ps = Math.max(8, Math.round(W.PS * (typeof Quality !== 'undefined' ? Quality.k('wind') : 1)));
      gfx.draw(pipeSmoke, { u: { p: [ps, typeof Variants !== 'undefined' && Variants.val.plume === 'a' ? 0 : 1, W.PS / ps, 0] }, tex: { tS: dataTex, tDepth: R.depth, tShadow: R.shadowTex, tSky: sky, tDetail: Tex.detail }, count: 4, instances: W.NS * ps });
      gfx.draw(pipeGlint, { u: { p: [W.PC, typeof Variants !== 'undefined' && Variants.val.plume === 'a' ? 0 : 1, 0, 0] }, tex: { tS: dataTex, tDepth: R.depth, tShadow: R.shadowTex }, count: 4, instances: W.NS * W.PC });
    }
    const hb = typeof Spray !== 'undefined' ? Spray.hb : null;
    if (hb && W.ground > 0.01) {
      const o = R.origin, om = [((o[0] % 65536) + 65536) % 65536, ((o[2] % 65536) + 65536) % 65536];
      gfx.draw(pipeGround, { u: { hx: hb.xf, g: [W.BOX, off[0], off[1], W.ground], d: [W.wx, W.wz, W.ud, (o[0] * W.wx + o[2] * W.wz) * 0.06], o: [om[0], om[1], D0[0], D0[1]] },
        tex: { tH: hb.tex, tDepth: R.depth, tShadow: R.shadowTex, tSky: sky, tDetail: Tex.detail }, count: 4, instances: W.NG });
      W.stats.ground = W.NG;
    } else W.stats.ground = 0;
  };
  W.slots = slots;
  if (typeof window !== 'undefined') window.Wind = W;       // (for the test harness)
  return W;
})();

const WIND_SSL = `
// the gust fronts that cross the hill: vnoise1(x, 7) of 00_util.js, the same integers (hashU, and 1887086086 = imul(hashU(7), 0x9e3779b1))
fn wHash(x: u32) -> u32 { var v: u32 = x; v = v ^ (v >> 16u); v = v * 2146121005u; v = v ^ (v >> 15u); v = v * 2221713035u; v = v ^ (v >> 16u); return v; }
fn gustN(x: f32) -> f32 {
  let i: f32 = floor(x); let f: f32 = x - i; let u: f32 = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a: f32 = f32(wHash(u32(i32(i)) + 1887086086u)) * 2.3283064e-10; let b: f32 = f32(wHash(u32(i32(i) + 1) + 1887086086u)) * 2.3283064e-10;
  return mix(a, b, u) * 2.0 - 1.0;
}
// 0..1, as the flags have it (0.5 + 0.5 vnoise1): t game time, key = (world x, z) . wind direction * 0.06
fn gustAt(t: f32, key: f32) -> f32 { return 0.5 + 0.5 * gustN(t * 0.31 - key); }
// wind-blown snow is fine dust: it lets the sun through and throws it on forward, so it glows against the light, is a soft white side-lit
// and goes grey-blue in shade (lit by the sky and the snow below)
// (fw: how much of it is the forward glow. Drift along the ground is seen against snow as bright as itself, so it is the glow toward the sun
// and the haze it lays over the snow's own grain that show it, as in the photographs; the smoke up on a crest is seen against the sky)
fn windLight(pos: vec3f, V: vec3f, fw: f32) -> vec3f {
  let mu: f32 = dot(-V, U.sunDir.xyz);
  let vis: f32 = shadowFast(pos, 0.002) * cloudShade(pos);
  return U.sunCol.rgb * (vis * (0.50 + fw * (2.4 * hg(mu, 0.75) + 0.6 * hg(mu, 0.25)))) + U.ambSky.rgb * 0.9 + U.ambGnd.rgb * 0.35 + lampLight(pos) * 1.6;
}
`;
const PLUME_SSL = `
// one particle of a streamer: row j of the texture, number i of the PS it has. Its own launch: the crest point it left, how long ago
// (each leaves again once it has gone the length of the plume, each time somewhere else along the crest)
struct Plume { pos: vec3f, dir: vec3f, s: f32, em: f32, str: f32, L: f32, seed: f32, ok: f32, cr: f32, }
fn plumeAt(j: u32, i: u32, salt: u32) -> Plume {
  var P: Plume; P.ok = 0.0; P.pos = vec3f(0.0); P.dir = vec3f(1.0, 0.0, 0.0); P.s = 0.0; P.em = 0.0; P.str = 0.0; P.L = 1.0; P.seed = 0.0; P.cr = 0.0;
  let A0: vec4f = texFetch(tS, vec2i(0, i32(j)), 0);
  if (A0.w <= 0.001) { return P; }
  let A1: vec4f = texFetch(tS, vec2i(1, i32(j)), 0); let A2: vec4f = texFetch(tS, vec2i(2, i32(j)), 0); let A3: vec4f = texFetch(tS, vec2i(3, i32(j)), 0);
  let tm: f32 = U.camPos.w; let T: f32 = max(A2.z, 0.5); let sd: u32 = u32(A2.y);
  let ph: f32 = hashu(sd * 7919u + i * 13u + salt);
  let cy: f32 = tm / T + ph; let n: f32 = floor(cy); let s: f32 = cy - n;
  let h: vec3f = hashu3(sd * 104729u + i * 31u + u32(n) * 7u + salt); let h2: vec3f = hashu3(sd * 15485863u + i * 17u + u32(n) * 3u + salt * 5u);
  let tb: f32 = tm - s * T;
  // how much snow the crest gave up at birth: as the gust was at that moment (so a gust goes down the plume as a thicker puff)
  P.em = 0.18 + 0.82 * smoothstep(0.30, 0.82, gustAt(tb, A2.x));
  let d3: vec3f = vec3f(A1.x, 0.0, A1.y); let tg: vec3f = vec3f(-A1.y, 0.0, A1.x);
  let L: f32 = A1.w; let Hh: f32 = A2.w; let Wc: f32 = A3.x;
  // out along the wind (each at its own speed), up as it goes (the air over a crest lifts, and a little of it is thrown much higher than the
  // rest), spreading out, and stirred by eddies that grow with it
  let sp: f32 = 0.7 + 0.6 * h.x;
  let al: f32 = L * s * sp;
  let up: f32 = Hh * pow(s, 0.6) * (0.15 + mix(1.4, 0.7, M.p.y) * h.y * h.y);
  let lat: f32 = Wc * (h.z - 0.5) + L * 0.16 * s * (h2.z - 0.5);
  let ew: f32 = L * 0.05 * s;
  let e1: f32 = sin(tb * 1.7 + h2.x * 30.0 + s * 9.0); let e2: f32 = sin(tb * 1.3 + h2.y * 30.0 + s * 7.0);
  P.pos = A0.xyz + d3 * al + tg * (lat + ew * e1) + vec3f(0.0, up + ew * 0.8 * e2, 0.0);
  P.dir = normalize(d3 * (A1.z * sp) + vec3f(0.0, Hh / max(T, 0.5) * 0.6 * (0.15 + 1.4 * h.y * h.y) / max(pow(s, 0.4), 0.3), 0.0));
  P.s = s; P.str = A0.w; P.L = L; P.seed = h2.x; P.cr = A3.y; P.ok = 1.0;
  return P;
}
`;

// a wisp of the smoke off a crest: drawn as a soft card stretched along the way it goes, its fibres running the same way
const PLUME_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut; v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec4f(0.0); v.c = vec4f(0.0); v.z = vec4f(0.0);
  let PS: u32 = u32(M.p.x); let j: u32 = a.iid / PS; let i: u32 = a.iid - j * PS;
  let P: Plume = plumeAt(j, i, 1u);
  if (P.ok < 0.5) { return v; }
  let s: f32 = P.s;
  let rel: vec3f = P.pos - U.camPos.xyz; let zv: f32 = dot(rel, U.camFwd.xyz); let dist: f32 = length(rel);
  if (zv < 0.5) { return v; }
  // thin: what makes it read is the many wisps over each other, each one hardly there
  let dens: f32 = P.str * P.em * smoothstep(0.0, 0.07, s) * pow(1.0 - s, 1.4) * 3.6 * max(M.p.z, 1.0) * (0.55 + 0.9 * P.seed) * smoothstep(2.0, 6.0, zv);
  if (dens < 0.002) { return v; }
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let V: vec3f = rel / dist;
  var ax: vec3f = P.dir - V * dot(P.dir, V); let axl: f32 = length(ax);
  if (axl < 0.05) { ax = normalize(cross(vec3f(0.0, 1.0, 0.0), V)); } else { ax = ax / axl; }
  let ay: vec3f = normalize(cross(V, ax));
  // (never smaller than about a pixel and a half across: a wisp too far off to be seen is a little of the pixel it is in)
  let px: f32 = zv * U.camRight.w * 2.0 * U.res.w;
  let r0: f32 = P.L * mix(0.009 + 0.036 * s, 0.016 + 0.060 * s, M.p.y) * (0.6 + 0.8 * fract(P.seed * 7.3));
  let r: f32 = max(r0, px * 1.5); let st: f32 = 3.0 + 4.0 * s;
  let wp: vec3f = P.pos + ax * (corner.x * r * st) + ay * (corner.y * r);
  v.clip = U.viewProj * vec4f(wp, 1.0);
  v.uv = vec4f(corner, fract(P.seed * 13.1), fract(P.seed * 29.7));
  var col: vec3f = windLight(P.pos, V, 1.0);
  col = mix(col, vec3f(luma(col)) * vec3f(1.04, 1.0, 0.97), 0.55 * M.p.y);      // (b: snow dust scatters every colour alike: toward white)
  col = applyFog(col, P.pos);
  v.c = vec4f(col, min(dens, 0.55) * min(1.0, sq(r0 / r)) * mix(1.0, 0.75, fogAmount(P.pos)));
  v.z = vec4f(zv, r * 0.9, st, 0.0);
  return v;
}`;

// the crystals in it: single points of light where the sun catches them (the golden fountain against a low sun); only near enough to be
// seen as points (far off they are the smoke)
const PLUME_GLINT_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let PS: u32 = u32(M.p.x); let j: u32 = a.iid / PS; let i: u32 = a.iid - j * PS;
  let P: Plume = plumeAt(j, i, 977u);
  let g0: GlintV = glintCull(); v.clip = g0.clip; v.uv = g0.uv; v.shp = g0.shp; v.col = g0.col;
  if (P.ok < 0.5) { return v; }
  let rel: vec3f = P.pos - U.camPos.xyz; let zv: f32 = dot(rel, U.camFwd.xyz);
  let pw: f32 = P.cr * P.em * smoothstep(0.0, 0.05, P.s) * (1.0 - P.s) * smoothstep(320.0, 70.0, zv) * (0.25 + 1.6 * P.seed * P.seed * P.seed);
  if (pw < 0.01 || zv < 0.5) { return v; }
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let vis: f32 = shadowFast(P.pos, 0.0015);
  let g: GlintV = glintQuad(corner, P.pos, P.dir * 6.0, fract(P.seed * 17.0 + f32(i) * 0.013), pw, vis, 0.0, 1.0);
  v.clip = g.clip; v.uv = g.uv; v.shp = g.shp; v.col = g.col;
  return v;
}`;

// drift along the ground: wisps a hand high in a box of BOX metres that rides ahead of the lens, carried with the air (M.g.yz: how far it
// has gone, mod 65536), thick only in streams that wander across the slope and break up, and only where a gust is passing.
// M.g = (box, carried x, carried z, amount); M.d = (wind direction x, z, speed, gust key of the render-space origin); M.o = (the origin
// mod 65536 x, z, the mean bearing of the wind x, z)
const GROUND_VS = `
fn vert(a: VIn) -> VOut {
  var v: VOut; v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec4f(0.0); v.c = vec4f(0.0); v.z = vec4f(0.0);
  let Wb: f32 = M.g.x; let id: u32 = a.iid;
  let h: vec3f = hashu3(id * 3u + 51u); let h2: vec3f = hashu3(id * 3u + 2087u);
  let wk: f32 = 0.8 + 0.4 * h2.x;
  let ctr: vec3f = U.camPos.xyz + U.camFwd.xyz * (0.32 * Wb);
  let q: vec2f = h.xy * Wb + M.g.yz * wk;
  let rel: vec2f = (fract((q - ctr.xz - M.o.xy) / Wb + 0.5) - 0.5) * Wb;
  let pxz: vec2f = ctr.xz + rel;
  let edge: f32 = max(abs(rel.x), abs(rel.y)) / Wb;
  // the streams: ribbons across the mean wind a couple of metres apart that wander and wriggle as the air carries them, broken into lengths
  let pa: vec2f = pxz + M.o.xy - M.g.yz * wk;
  let al: f32 = dot(pa, M.o.zw); let ac: f32 = M.o.z * pa.y - M.o.w * pa.x;
  let tm: f32 = U.camPos.w;
  let sn: f32 = sin(ac * 2.6 + 2.4 * sin(al * 0.09 + tm * 0.23) + 1.2 * sin(al * 0.23 - tm * 0.41 + ac * 0.3));
  let brk: f32 = smoothstep(-0.2, 0.6, sin(al * 0.045 + ac * 0.11 + 1.7) + 0.6 * sin(al * 0.13 - ac * 0.05 - tm * 0.15));
  let strm: f32 = smoothstep(0.35, 0.92, sn) * brk;
  let gu: f32 = gustAt(tm, M.d.w + dot(pxz, M.d.xy) * 0.06);
  var dens: f32 = M.g.w * strm * (0.12 + 0.88 * smoothstep(0.35, 0.78, gu)) * smoothstep(0.5, 0.38, edge) * (0.4 + 0.6 * h2.z) * 2.6;
  let gy: f32 = groundH(vec3f(pxz.x, 0.0, pxz.y));
  let hh: f32 = 0.03 + 0.20 * h.z * h.z;
  let pos: vec3f = vec3f(pxz.x, gy + hh, pxz.y);
  let rp: vec3f = pos - U.camPos.xyz; let zv: f32 = dot(rp, U.camFwd.xyz); let dist: f32 = length(rp);
  dens *= smoothstep(1.5, 5.0, zv);
  if (dens < 0.002 || zv < 0.5) { return v; }
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  let V: vec3f = rp / dist; let dw: vec3f = vec3f(M.d.x, 0.0, M.d.y);
  var ax: vec3f = dw - V * dot(dw, V); let axl: f32 = length(ax);
  if (axl < 0.08) { ax = normalize(cross(vec3f(0.0, 1.0, 0.0), V)); } else { ax = ax / axl; }
  let ay: vec3f = normalize(cross(V, ax));
  // long and low: one to three metres along the wind, a hand or two high; the higher ones longer and thinner
  let ry: f32 = 0.05 + 0.10 * h2.y + hh * 0.4; let rx: f32 = 0.8 + 1.8 * h.z + 0.6 * h2.y;
  let px: f32 = zv * U.camRight.w * 2.0 * U.res.w; let ryp: f32 = max(ry, px * 1.5);
  let wp: vec3f = pos + ax * (corner.x * rx) + ay * (corner.y * ryp);
  v.clip = U.viewProj * vec4f(wp, 1.0);
  v.uv = vec4f(corner, fract(h2.x * 13.1), fract(h.x * 29.7));
  var col: vec3f = windLight(pos, V, 2.2);
  col = applyFog(col, pos);
  v.c = vec4f(col, min(dens, 0.5) * min(1.0, ry / ryp));
  v.z = vec4f(zv, 0.18, rx / max(ryp, 0.01), 1.0);
  return v;
}`;

// both kinds of wisp: soft, fibrous along their length (the noise is drawn out that way), and thinned where they meet what stands in front
// of them or the snow they lie on (no hard line where a card cuts the slope)
const WISP_FS = `
fn frag(v: VOut) -> FOut {
  var o: FOut; o.color = vec4f(0.0);
  let q: vec2f = v.uv.xy; let r2: f32 = dot(q, q);
  if (r2 >= 1.0) { return o; }
  let ln: f32 = max(v.z.z, 1.0);
  let n1: f32 = tex(tDetail, vec2f(q.x * 0.05 * ln + v.uv.z, q.y * 0.42 + v.uv.w)).z;
  let n2: f32 = tex(tDetail, vec2f(q.x * 0.11 * ln + v.uv.w, q.y * 0.95 + v.uv.z) + vec2f(0.37, 0.61)).z;
  let fib: f32 = saturate((n1 * 0.6 + n2 * 0.4 - 0.22) * 2.0);
  let prof: f32 = (1.0 - r2) * (1.0 - 0.5 * r2);
  let sz: f32 = linDepth(texFetchD(tDepth, vec2i(v.clip.xy), 0));
  let soft: f32 = saturate((sz - v.z.x) / max(v.z.y, 0.05));
  let a: f32 = v.c.w * prof * fib * soft;
  o.color = vec4f(v.c.rgb * a, a);
  return o;
}`;
