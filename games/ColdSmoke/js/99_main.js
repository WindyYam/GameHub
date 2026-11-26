"use strict";
// ---------------------------------------------------------------- boot, main loop, test hooks
const App = { state: { speed: 0, lean: 0 }, ready: false, t: 0, lookYaw: null, lampTilt: 0.07 };
const QS = new URLSearchParams(location.search);
// ?dev, or a path ending in /dev, is the test harness and the developer menu. The 小红书 build sets COLD_SMOKE.noDev and never opens it.
const DEV = !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && (QS.has('dev') || /(?:^|\/)dev\/?$/.test(location.pathname) || !!(self.COLD_SMOKE && self.COLD_SMOKE.dev));      // (COLD_SMOKE.dev: a test file opened as it is, with no address to put ?dev in)

// Start-up runs in stages with a breath between them, so the loading page can show where it has got to
Variants.def('bootq', '开机顺序', [['a', '全部编好再开'], ['b', '先编第一眼要的']], 'b');
const BOOT_LATER = /^(city|neb|deer|fauna|gate|wind|shaft|fpv)/;
// what the title page never shows or plays is made once it is up (Variants 'bootlz' b): the deer and the other animals (their meshes are
// carved from distance fields, 0.7 s of an M3's time) and the sound (every voice synthesised, 0.6 s; it can only start from a tap anyway,
// and a tap that comes first makes it there and then: Sound.ensure). Nothing on the title page changes; tests (?manual) still make all at boot
Variants.def('par', '开机多线程', [['a', '只用一个线程'], ['b', '后台线程一起做']], 'b');
// (inside a background thread: take on the page's versions, mountain and sun before the first job)
Par.jobs.__init = st => { Object.assign(Variants.val, st.vars); Course.forceType = st.fT; Course.classic = st.cl; Course.setSeed(st.seed); Terrain.setSun(st.az); };
Variants.def('bootlz', '开机后补', [['a', '开机时全做'], ['b', '标题出来后再做']], 'b');
App.bootT = [];          // [stage, ms since the page began] for every stage of the start-up (shown in the developer menu as 启动用时)
async function boot(stage) {
  const manual = QS.has('manual'), lazy = !manual && Variants.val.bootlz !== 'a';
  const step = async (f, name) => { if (name) App.bootT.push([name, Math.round(performance.now())]); if (stage) stage(f, name); if (!manual) await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
  const canvas = document.getElementById('view');
  await step(0.03, '醒来');
  BootCache.load((!manual || QS.has('bcache')) && !(DEV && QS.has('nocache')));          // (the second start: 00e_cache.js; read while the graphics wake)
  if (typeof XHS !== 'undefined') await XHS.restore();               // (inside 小红书: the player's settings from the container's own storage)
  Quality.decide(); App.applyQuality(true);                             // how much this device is asked to draw (00c_quality.js)
  if (DEV) console.log('quality', Quality.tier, Quality.why, Quality.gpu);
  // a browser that can open a headset's immersive mode (Safari on Apple Vision Pro) is drawn with WebGL2 from the start: WebXR hands its
  // framebuffer to WebGL only, so that is the context that can later be taken into the headset without starting over (21_xr.js)
  const xrOK = await XR.probe();
  let gfx = null; const want = QS.get('backend') || (gpuFellBack() || xrOK ? 'webgl2' : null);
  if (want !== 'webgl2') { try { gfx = await createGPU(canvas, { offscreen: QS.has('offscreen') }); } catch (e) { console.warn('WebGPU init failed', e); gfx = null; } }
  if (!gfx) gfx = createGL(canvas, { xr: xrOK });
  if (!gfx) throw new Error('这台设备的浏览器不支持 WebGL2，画面无法启动。');
  App.gfx = gfx;
  // the first time a page is opened (and after every update that changes a shader) the browser compiles every shader from scratch: on
  // an iPhone some 10 to 25 seconds behind the loading page, measured. What the title picture does not show is held back until it is up
  // (Variants 'bootq' b): the far city's lights, the night sky's bake, animals, gates, crest plumes, light shafts, the first-person body
  if (Variants.val.bootq !== 'a') gfx.hold = n => BOOT_LATER.test(n);
  Course.forceType = QS.get('seg') || null; Course.classic = QS.has('classic');      // dev: a mountain made of one kind of run; the runs in the order the first mountain had them
  Course.setSeed(DEV ? (seedInHash() || Math.floor(+QS.get('seed')) || Course.seed) : Course.seed);      // outside dev: always the home mountain (寒烟山)
  if (QS.get('tod')) { const q = QS.get('tod'); Sky.setClock(q in Sky.times ? Sky.times[q] : +q || 0); }
  // background threads (00d_par.js): started now, so they have read the script by the time the first pieces are handed out
  const pre = {};
  const farW = +QS.get('vistares') || (gfx.caps.maxTex >= 4096 ? 3072 : 2048), cityW = +QS.get('cityres') || (1024);
  // what the last start worked out, if it was this same build, mountain, sun and set of versions (00e_cache.js): then no threads are needed
  const bkey = [Course.seed, Course.forceType, Course.classic, Sky.az, farW, cityW, JSON.stringify(Variants.val)].join('|');
  const hit = await BootCache.take(bkey, 250), got = App.bootGot = BootCache.on ? {} : null;
  if (hit) { pre.noise = hit.noise; pre.snow = hit.snow; pre.far = hit.far; pre.skier = hit.skier; Terrain.cache = hit.terr; App.bootT.push(['缓存', Math.round(performance.now())]); }
  if (DEV) console.log('bootcache', BootCache.on ? (hit ? 'hit' : BootCache.late ? 'late' : 'miss') : 'off', BootCache.ms + 'ms');
  Terrain.grab = !!got;
  if (!hit && Variants.val.par !== 'a' && (!manual || QS.has('par'))) {          // (tests: ?manual&par to use them too)
    const hc = navigator.hardwareConcurrency || 4;
    if (Par.start(Math.max(2, Math.min(4, hc)),          // (the page itself mostly waits on them, so as many threads as cores, up to 4)
       { vars: Object.assign({}, Variants.val), seed: Course.seed, fT: Course.forceType, cl: Course.classic, az: Sky.az })) {
      // first what is needed first (the snow and noise textures, the far ranges), then the heights of the mountain round where Game.reset
      // will stand the skier; the page meanwhile carves the skier, plants the trees and lights the city
      pre.noise = Par.run('noiseData', {}).catch(() => null); 
      pre.snow = Promise.all([Par.run('snowData', { az: Sky.az, only: 'fine' }), Par.run('snowData', { az: Sky.az, only: 'snow' })]).then(([f, s]) => ({ snow: s.snow, fine: f.fine }), () => null);
      pre.skier = Par.run('skierMesh', {}).catch(() => null);
      pre.far = Par.run('vistaFar', { w: farW }).catch(() => null);
      const c = Course.at(14, {}); Terrain.setSun(Sky.az); Terrain.prefill(c.cx, -14);
    }
  }
  // (with the threads the page first does what is its own, the sky and the skier and the trees, while they make the textures, the far
  // ranges and the mountain; without them, the order it always had)
  const texs = async () => {
    await step(0.08, '磨雪');
    const nz = makeNoiseTextures(gfx, await pre.noise), sn = makeSnowTexture(gfx, Sky.az, await pre.snow); Terrain.setSun(Sky.az);
    if (got) { got.noise = nz; got.snow = { snow: sn.snow, fine: sn.fine }; }
    await step(0.20, '远山与城市');
    const t0 = performance.now();
    Vista.init(gfx, { farW, far: await pre.far, cityW, city: hit && hit.city, keep: DEV && QS.has('vistadbg'), grab: !!got });
    if (got) { got.far = Vista.farData; got.city = Vista.cityData; Vista.farData = Vista.cityData = null; }
    if (DEV) console.log('vista', Math.round(performance.now() - t0) + 'ms', JSON.stringify(Vista.stats));
  };
  const own = async () => {
    await step(0.36, '立起天空');
    Render.init(gfx, canvas); Sky.init(gfx); Terrain.init(gfx); Post.init(gfx);
    const skier = () => Skier.init(gfx), trees = () => { const t0 = performance.now(); Trees.init(gfx, hit && hit.trees, !!got); if (got) { got.trees = Trees.meshData; Trees.meshData = null; } Gates.init(gfx); if (DEV) console.log('trees', Math.round(performance.now() - t0) + 'ms', 'build ' + Math.round(TreeModel.buildMs) + 'ms', Math.round(Trees.stats.tris) + ' tris'); };
    // (with the threads the skier is being carved in one of them: the trees are planted first, and the body is taken in after)
    if (pre.skier) { await step(0.44, '种树'); trees(); Skier.adopt(await pre.skier); skier(); }
    else { skier(); if (!lazy) { await step(0.40, '林子里有鹿'); makeDeer(gfx); } await step(0.44, '种树'); trees(); }
    if (pre.skier && !lazy) { await step(0.40, '林子里有鹿'); makeDeer(gfx); }
  };
  if (Par.ok) { Vista.setRes(farW, cityW); await own(); await texs(); }
  else { await texs(); await own(); }
  // (dev, ?parcheck: every piece the threads made, made again here and compared number for number)
  if (DEV && QS.has('parcheck') && Par.ok) {
    const same = (a, b) => { let bad = 0; if (!a || !b || a.length !== b.length) return -1; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) bad++; return bad; };
    const N0 = noiseData(), S0 = snowData(Sky.az), F0 = Vista.farBuild(farW), N1 = await pre.noise, S1 = await pre.snow, F1 = await pre.far;
    const K0 = Skier.freshMesh(), K1 = Skier.mesh;
    console.log('parcheck skier', JSON.stringify({ same: K0 !== K1, V: same(K0.V, K1.V), W: same(K0.W, K1.W), I: same(K0.I, K1.I) }));
    console.log('parcheck tex', JSON.stringify({ noise: same(N0.noise, N1.noise), detail: same(N0.detail, N1.detail), snow: same(S0.snow, S1.snow), fine: same(S0.fine, S1.fine), farA: same(F0.A, F1.A), farB: same(F0.B, F1.B) }));
  }
  await step(0.56, '点亮星云');
  Spray.init(gfx); Grains.init(gfx); Dust.init(gfx); Nebula.init(gfx, +QS.get('nebres') || (gfx.caps.maxTex >= 4096 && (navigator.deviceMemory || 8) >= 4 ? 1536 : 768)); Clouds.init(gfx, +QS.get('cloudres') || 0); Shafts.init(gfx); Tracks.init(gfx);
  Wind.init(gfx);                                                        // snow the wind carries off the crests and along the ground (11b_wind.js)
  if (!lazy) { await step(0.64, '调音'); Sound.ensure(); }
  Render.onResize.push(Spray.resize); Render.onResize.push(Shafts.resize);
  Render.onOriginShift = d => { Spray.shiftOrigin(d); };
  Render.passes.offscreen.push(R => Spray.offscreen(R));
  Render.passes.offscreen.push(R => Shafts.offscreen(R));
  Render.passes.fx.push(R => Dust.veil(R));                              // (heavy snow: the veil of the far snowfall, under everything near)
  Render.passes.fx.push(R => Shafts.fx(R));
  Render.passes.fx.push(R => Wind.fx(R));
  Render.passes.fx.push(R => Spray.fx(R));
  Render.passes.fx.push(R => Grains.fx(R));                             // (the crystals and clumps in the thrown snow, over its cloud)
  Render.passes.fx.push(R => Dust.fx(R));
  Game.onStep = (S, H) => Spray.onStep(S, H, App.t - (Game.t - Game.stepT));
  Render.passes.shadow.push(() => { if (App.skierRoot) Skier.drawShadow(); Deer.drawShadow(); Trees.drawShadow(); });
  Render.passes.shadow.push(() => Gates.drawShadow());
  Render.passes.pre.push(R => Spray.pre(R)); Render.passes.pre.push(() => Tracks.pre());
  Render.passes.opaque.push(R => { if (App.skierRoot) Skier.draw(R.shadowTex, Sky.lut); Deer.draw(R.shadowTex, Sky.lut); Trees.draw(R); });
  Render.passes.opaque.push(R => Gates.draw(R));
  Render.passes.transparent.push(R => Clouds.draw(R)); Render.passes.transparent.push(R => Trees.drawGhost(R));
  Render.passes.transparent.push(R => Gates.drawOver(R));
  await step(0.70, '调光');
  const pipes = [].concat(Sky.pipes, Terrain.pipes, Post.pipes, Skier.pipes, Deer.pipes || [], Trees.pipes, Spray.pipes, Grains.pipes, Dust.pipes, Nebula.pipes, Clouds.pipes, Shafts.pipes, Tracks.pipes, Wind.pipes);
  pipes.push(...Gates.pipes);
  for (let i = 0; i < pipes.length; i++) { const p = pipes[i]; if (p.held) continue; if (gfx.finishPipelineAsync) await gfx.finishPipelineAsync(p); else gfx.finishPipeline(p); if (stage && !manual && i % 6 === 5) stage(0.70 + 0.16 * (i + 1) / pipes.length, null); }
  await step(0.87, '铺雪');
  fit();
  Input.init(canvas);
  Game.reset();
  App.skierRoot = Game.root; App.skierPose = Game.pose;
  tick(1 / 60, false);
  if (DEV && QS.has('parcheck')) Terrain.check = true;
  const tc = DEV && QS.has('cachecheck') && hit ? hit.terr : null;
  { const t0 = performance.now(); await Terrain.firstFill(Render.cam.pos[0], Render.cam.pos[2]); if (DEV) console.log('terrain', Math.round(performance.now() - t0) + 'ms', Par.ok ? 'par ' + Par.n + ' ' + JSON.stringify(Terrain.fillMs) : '', Terrain.check ? 'parcheck ' + JSON.stringify(Terrain.check) : ''); }
  if (tc) console.log('cachecheck terrain', JSON.stringify(Terrain.checkCache(tc)));
  if (got) { const m = Skier.mesh; got.skier = m && { V: m.V, W: m.W, I: m.I, nv: m.nv, ni: m.ni, v: m.v, ride: m.ride, hand: m.hand, lr: m.lr }; got.terr = Terrain.snap; Terrain.snap = null;
    got.full = !!hit && Terrain.fromCache === Terrain.LEVELS; }
  if (DEV && QS.has('cachecheck') && hit) {
    const same = (a, b) => { let bad = 0; if (!a || !b || a.length !== b.length) return -1; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) bad++; return bad; };
    const N0 = noiseData(), S0 = snowData(Sky.az), F0 = Vista.farBuild(farW), K0 = Skier.freshMesh(), K1 = Skier.mesh;
    console.log('cachecheck tex', JSON.stringify({ skierAdopted: K1 === hit.skier, V: same(K0.V, hit.skier.V), W: same(K0.W, hit.skier.W), I: same(K0.I, hit.skier.I), noise: same(N0.noise, hit.noise.noise), detail: same(N0.detail, hit.noise.detail), snow: same(S0.snow, hit.snow.snow), fine: same(S0.fine, hit.snow.fine), farA: same(F0.A, hit.far.A), farB: same(F0.B, hit.far.B), city: hit.city ? Vista.cityCheck(hit.city) : null, trees: hit.trees ? TreeModel.check(hit.trees) : null }));
  }
  if (!lazy) Par.stop();
  // the first picture bakes the nebula and the trees: do it while the loading page still covers the canvas
  if (!manual) { await step(0.96, '第一缕光'); tick(1 / 60, true); await step(1, null); }
  App.ready = true; App.bootT.push(['ready', Math.round(performance.now())]);
  App.later = gfx.release ? gfx.release() : Promise.resolve();
  App.late = lazy ? bootLate(gfx) : saveBoot();
}
// (what this start worked out, written for the next one: 00e_cache.js. Not when all of it came from there already)
async function saveBoot() {
  const got = App.bootGot; App.bootGot = null;
  if (!got || got.full || !got.noise || !got.snow || !got.far || !got.terr) return;
  delete got.full; const ok = await BootCache.save(got);
  App.bootT.push(['后补:缓存' + (ok ? '' : '(未存)'), Math.round(performance.now())]);
}
function makeDeer(gfx) { const t0 = performance.now(); Deer.init(gfx); if (DEV) console.log('deer', Math.round(performance.now() - t0) + 'ms', Deer.mesh.nv + ' verts'); }
// the work held back from the start-up, done one piece at a time once the title page is up, each in a task of its own between frames
async function bootLate(gfx) {
  const idle = () => new Promise(r => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 60));
  try {
    await idle(); Sound.ensure(); App.bootT.push(['后补:声音', Math.round(performance.now())]);
    await idle(); makeDeer(gfx);
    for (const p of Deer.pipes) { if (gfx.finishPipelineAsync) await gfx.finishPipelineAsync(p); else gfx.finishPipeline(p); }
    App.bootT.push(['后补:动物', Math.round(performance.now())]);
    await idle(); App.fpvOK = true;          // (the first-person body: built by its own first tick, 07d_fpv.js)
    Par.stop();
    await idle(); await saveBoot();
  } catch (e) { reportError(e); }
}
// one simulation + presentation step. `draw` false: advance everything but skip the GPU frame (tests fast-forward this way)
function tick(dt, draw) {
  // slow motion (Game.timeScale, set in the air by 07_game.js): the whole world below runs on the game's clock (this dt, App.t); only the
  // player's hand on the controls stays on the real one (App.dtReal, for anything else that must)
  const real = App.dtReal = dt, j0 = performance.now(); dt *= Game.timeScale || 1;
  App.t += dt;
  Input.update(real);
  Game.update(dt);
  if (App.camHook) App.camHook(dt);                                     // (in the headset the lens is the player's own head, set on the game's camera: 21_xr.js)
  const cp = Render.cam.pos, S = Game.s, st = App.state;
  Tracks.step(Game.root, Game.pose, S);
  Render.updateOrigin(cp);
  if (draw !== false) Terrain.update(cp[0], cp[2]);
  Skier.update(Game.root, Game.pose, Render.origin);
  Trees.update(Render.cam, Render.origin, Render.W / Render.H, Game.root.pos, dt);
  Gates.update(Render.cam, Render.origin, Game.root.pos, dt, App.t);
  Deer.update(dt, App.t);
  st.speed = S.speed; st.lean = S.lean; st.playerPos = Game.root.pos; st.air = S.air;
  // the headlamp sits on the forehead and looks where the skier is looking: down the mountain along the line being skied (the head stays
  // quiet while the skis swing under it), a little below the lie of the slope, so its pool falls a few lengths ahead
  { const W = Skier.world, hb = W.hb;
    if (hb && W.J) {
      const m = (v) => [W.X[0] * v[0] + W.Y[0] * v[1] + W.Z[0] * v[2], W.X[1] * v[0] + W.Y[1] * v[1] + W.Z[1] * v[2], W.X[2] * v[0] + W.Y[2] * v[1] + W.Z[2] * v[2]];
      const hp = m(v3.add(v3.mad(W.J.head, hb.Z, -0.11), v3.mul(hb.Y, 0.04))), n = Game.root.nrm;
      st.lampPos = [Game.root.pos[0] + hp[0], Game.root.pos[1] + hp[1], Game.root.pos[2] + hp[2]];
      const vy = S.speed > 1.5 ? Math.atan2(S.v[0], -S.v[2]) : 0; App.lookYaw = damp(App.lookYaw == null ? vy : App.lookYaw, vy * 0.85, 4.5, dt);
      const h = [Math.sin(App.lookYaw), 0, -Math.cos(App.lookYaw)], hn = v3.dot(h, n), d = v3.norm([h[0] - n[0] * hn, h[1] - n[1] * hn, h[2] - n[2] * hn]), ca = Math.cos(App.lampTilt), sa = Math.sin(App.lampTilt);
      st.lampDir = v3.norm([d[0] * ca - n[0] * sa, d[1] * ca - n[1] * sa, d[2] * ca - n[2] * sa]);
    } }
  // the day moves on while you ski (the title page stays in the afternoon)
  if (Game.mode === 'run' && Sky.rate !== 0) Sky.setClock(Sky.clock + dt * (Sky.rate || 1));
  Sky.updatePlane(App.t, dt, cp, Render.cam.fwd);
  Weather.update(dt);                                                   // clear, light or heavy snow: its clouds, wind, sun and lightning (05b_weather.js)
  Feel.update(dt);                                                     // speed in the lens, snow on the glass, the air of this run (reads Game.events: keep above the loop that clears them)
  Render.computeGlobals(App.t, dt, st);
  for (const ev of Game.events) {
    Sound.event(ev);
    if (ev.type === 'land') Spray.slap(App.t, Game.root.pos, S.v, S.n, clamp(ev.v / 5, 0.3, 2.2));
    else if (ev.type === 'pole') Spray.poles(App.t, Game.root, Game.pose.stance);
    // snow knocked off the boughs
    else if (ev.type === 'brush' || ev.type === 'crash') {
      const p = Game.root.pos, dx = ev.x - p[0], dz = ev.z - p[2], l = Math.hypot(dx, dz) || 1, k = Math.min(1, 0.9 / l);
      (Trees.sift || Spray.sift)(App.t, [p[0] + dx * k, p[1] + 1.5, p[2] + dz * k], S.v, ev.type === 'crash' ? 1.6 : 0.8);
      if (ev.type === 'crash') { Game.shake = Math.max(Game.shake, 0.05); Spray.fall(App.t, p, S.n, clamp(ev.v / 5, 0.3, 2.2)); }
    }
  }
  Game.events.length = 0;
  Feel.pass(dt);                                                        // a tree gone by close, untouched: said as an event (`near`) for the next step, where the trees hear it too
  Sound.frame();
  for (const f of App.onTick) f(dt, draw !== false);
  App.stepS = (performance.now() - j0) / 1000;                           // (the page's own work this frame, before anything is drawn: the governor below asks for it)
  if (draw !== false) (App.renderHook || Render.render)();
}
App.onTick = [];
// (interface) App.paused: the run is set down, nothing steps or draws. App.resumeK: the world's speed as it is taken up again (0.3 up to 1,
// eased by the interface); it scales the time handed to the step, where the slow motion of a jump (Game.timeScale) scales it again
App.resumeK = 1;
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (App.gfx && App.gfx.lost) { UI.lost(); return; }                    // the graphics device was taken away: the interface says so, and offers to start over
  if (!App.ready || App.paused || XR.active) { lastT = now; return; }       // (in the headset its own frames drive the game: 21_xr.js)
  
  const raw = (now - lastT) / 1000, dt = clamp(raw, 1 / 240, 1 / 20); lastT = now;
  if (App.photoFrame) { try { App.photoFrame(dt); } catch (e) { console.warn('photo', e); if (typeof Photo !== 'undefined') Photo.exit(); } return; }      // 拍照: the world stands still, only the lens moves (19d_photo.js)
  try { tick(dt * App.resumeK, true); UI.frame(dt); govern(now, raw); } catch (e) { App.ready = false; reportError(e); }
}
function fit() {
  if (XR.active) return;                                                // (the headset sets the size of what is drawn while it is on)
  const PL = self.COLD_SMOKE || {}, L = Quality.L; View.measure(); let k = Math.min(devicePixelRatio || 1, PL.maxDpr || 2, L.maxDpr) * Render.scale;
  // a very large display is drawn at no more than about 2400 x 1400 and stretched: past that the extra pixels cost far more than they show
  // (and a lower Quality level asks for fewer still)
  const px = View.w * View.h * k * k, cap = +QS.get('maxpx') || Math.min(PL.maxPx || 3.4e6, L.maxPx); if (px > cap) k *= Math.sqrt(cap / px);
  const w = +QS.get('w') || Math.round(View.w * k), h = +QS.get('h') || Math.round(View.h * k);
  Render.resize(Math.max(64, w), Math.max(64, h));
}
// 60 frames a second come first. If this machine cannot hold them at full sharpness the picture is drawn a little smaller and stretched,
// and it goes back up when there is room again. If even that is not enough, the Quality level steps down (00c_quality.js; only while it is
// on 自动) and the picture starts again at full size for that level; after a long while with room to spare it may step back up, once
const Gov = { on: QS.get('gov') !== '0' && !QS.get('w'), probe: null, fixed: false, acc: 0, n: 0, slow: 0, fast: 0, last: 0, downs: 0, t0: 0, calm: 0, js: 0, ownT: 0, ownN: 0, own: 0 };
Variants.def('govjs', '自动清晰度', [['a', '看平均帧时间'], ['b', '不算脚本卡的帧']], 'b');
function govern(now, raw) {
  const js = Gov.js; Gov.js = App.stepS || 0;                             // (the step before this one: what this frame waited on)
  if (!Gov.on || raw > 1) return;                                         // (a tab coming back to the front is not a slow frame)
  if (!Gov.t0) Gov.t0 = now; if (now - Gov.t0 < 3000) return;             // the first seconds are still compiling and warming up
  // A frame that waited on the page's own work (a strip of terrain being made, say: more than half the wait, and most of a 60th of a
  // second, went in script before anything was drawn) says nothing about the GPU, and a smaller picture would not have helped it:
  // such frames are left out of the average. A second made mostly of them is the script being slow, and nothing is changed for it
  if (js > Math.max(0.5 * raw, 0.0135) && Variants.val.govjs !== 'a') { Gov.ownT += raw; Gov.ownN++; }
  Gov.acc += raw; Gov.n++; if (Gov.acc < 1) return;
  const n = Gov.n - Gov.ownN, own = Gov.ownN > n, avg = n > 0 ? (Gov.acc - Gov.ownT) / n : 0; Gov.acc = Gov.ownT = 0; Gov.n = Gov.ownN = 0;
  Gov.own = own ? Gov.own + 1 : 0; if (own) { Gov.slow = Gov.fast = Gov.calm = 0; return; }
  if (avg > 1 / 50) { Gov.slow++; Gov.fast = 0; } else if (avg < 1 / 57) { Gov.fast++; Gov.slow = 0; } else { Gov.slow = 0; Gov.fast = 0; }
  if (Variants.val.qtier !== 'a') { govAct(avg, avg > 1 / 36, avg < 1 / 57, now, false); return; }
  const floor = Quality.L.floor;
  if (Gov.slow >= 2 && Render.scale > floor) { Render.scale = Math.max(floor, Render.scale * (avg > 1 / 36 ? 0.8 : 0.9)); Gov.slow = 0; Gov.downs++; Gov.last = now; fit(); }
  else if (Gov.slow >= 2 && Quality.step(1)) { Render.scale = 1; Gov.slow = 0; Gov.fast = 0; Gov.downs = 0; Gov.calm = 0; Gov.last = now; App.applyQuality(); }
  else if (Gov.fast >= 12 && Render.scale < 1 && Gov.downs < 5 && now - Gov.last > 20000) { Render.scale = Math.min(1, Render.scale * 1.08); Gov.fast = 0; Gov.last = now; fit(); }
  // (a level back up: a full minute at full size, every second of it with room to spare, and only once a visit)
  if (avg < 1 / 57 && Render.scale >= 1) Gov.calm++; else Gov.calm = 0;
  if (Gov.calm >= 60 && Quality.ups < 1 && Quality.tier > 0 && now - Gov.last > 60000 && Quality.step(-1)) { Gov.calm = 0; Gov.fast = 0; Gov.last = now; App.applyQuality(); }
}
// (Variants 'qtier' b) what the governor does about it, in this order, once two seconds running were slow:
//   1. light load (Quality.lite): fewer of the small things that fly about. Hard to see, and it takes off work that does not shrink with
//      the picture, which on a phone is most of a frame
//   2. the picture drawn a little smaller, as before. But each step is checked: if the next second is not at least 5% quicker, the
//      device is held up by something the size of the picture does not touch, so the step is taken back (no blur for nothing) and
//   3. a level down (with light load back to none: the new level has its own numbers)
// and back the other way when there has been room to spare: the picture back to full size first, then light load off, then (once a
// visit, after a full calm minute) a level up. w: the measure of this second (the frame time, or on the native player the GPU's own)
function govAct(w, verySlow, fast, now, metal) {
  if (Gov.probe && now - Gov.probe.t > 900) {
    const p = Gov.probe; Gov.probe = null;
    if (w > p.w * 0.95 && Gov.slow > 0) { Gov.fixed = true; Render.scale = p.from; fit(); Gov.slow = 2; }
  }
  const floor = Quality.floor();
  if (Gov.slow >= 2) {
    Gov.slow = 0; Gov.fast = 0; Gov.calm = 0; Gov.last = now;
    if (Quality.auto() && Quality.setLite(Quality.lite + 1)) return;       // (read as things are drawn: nothing to apply)
    if (Render.scale > floor && !Gov.fixed) { Gov.probe = { t: now, w, from: Render.scale }; Render.scale = Math.max(floor, Render.scale * (verySlow ? 0.8 : 0.9)); Gov.downs++; fit(); return; }
    if (Quality.step(1)) { Render.scale = 1; Gov.downs = 0; Gov.fixed = false; Gov.probe = null; Quality.setLite(0); App.applyQuality(); }
    return;
  }
  if (Gov.fast >= 12 && now - Gov.last > 20000) {
    if (Render.scale < 1 && (metal || Gov.downs < 5)) { Render.scale = Math.min(1, Render.scale * 1.08); Gov.fast = 0; Gov.last = now; fit(); return; }
    if (Quality.lite > 0 && Quality.setLite(Quality.lite - 1)) { Gov.fast = 0; Gov.last = now; return; }
  }
  if (fast && Render.scale >= 1 && Quality.lite === 0) Gov.calm++; else Gov.calm = 0;
  if (Gov.calm >= 60 && Quality.ups < 1 && Quality.tier > 0 && now - Gov.last > 60000 && Quality.step(-1)) { Gov.calm = 0; Gov.fast = 0; Gov.fixed = false; Gov.last = now; App.applyQuality(); }
}

// a Quality level into the modules that read it once (the rest read Quality.L as they draw). first: before anything is built
App.applyQuality = function (first) {
  const L = Quality.L;
  Render.motionBlur = L.blur; Trees.far = L.far;
  if (first) { Render.shadowRes = L.shadow; Post.bloomLevels = L.bloom; return; }
  Render.setShadowRes(L.shadow);
  if (Post.bloomLevels !== L.bloom) { Post.bloomLevels = L.bloom; if (Render.W) Post.resize(Render.W, Render.H); }
  if (App.ready && !QS.get('w')) fit();
  if (App.redraw) App.redraw();
};
Quality.on((t, from) => { if (from === 'pick') { Render.scale = 1; Gov.slow = Gov.fast = Gov.downs = Gov.calm = 0; Gov.fixed = false; Gov.probe = null; Quality.setLite(0); } App.applyQuality(); });
App.gov = Gov;
// If WebGPU starts but the game cannot be built on it (a stricter shader compiler than the ones it was tested on, say), start again on WebGL2
// rather than leave an error on a black page. Once per visit: the choice is kept for the tab, and in the address.
function gpuFellBack() { try { return sessionStorage.getItem('cs-backend') === 'webgl2'; } catch (e) { return false; } }
function retryOnWebGL2(e) {
  if (!App.gfx || App.gfx.caps.backend !== 'webgpu' || QS.get('backend') || gpuFellBack()) return false;
  console.warn('WebGPU could not build the game, starting again on WebGL2', e);
  try { sessionStorage.setItem('cs-backend', 'webgl2'); } catch (x) { }
  const q = new URLSearchParams(location.search); q.set('backend', 'webgl2');
  try { location.replace(location.pathname + '?' + q + location.hash); } catch (x) { location.reload(); }
  return true;
}
function reportError(e) {
  console.error(e && e.message ? e.message : e); if (e && e.vs) console.log(e.vs.slice(0, 20000)); if (e && e.fs) console.log(e.fs.slice(0, 20000));
  const el = document.getElementById('fatal'); if (el) { el.hidden = false; el.textContent = I18N.t(String(e && e.message ? e.message : e)); }
}

// ---- which mountain. Outside dev the address cannot name one: play opens on the home seed (寒烟山, Course.seed). #seed-<n>, ?seed=,
// #today and #daily are ignored, and nothing writes #seed- back into the address. A mountain in 滑过的山 is chosen from the registry, not
// from a seed the player types. In dev a seed in the address names it: #seed-<n>, or ?seed=<n> (inside a frame only a plain hash survives).
// The test harness asks for dev; its scripts aim at jumps they know on the home mountain.
const seedInHash = () => { if (!DEV) return 0; const h = location.hash || ''; if (/(?:^|[#&])(?:today|daily)(?:$|&)/.test(h)) return App.dailySeed(); const m = /(?:^|[#&])seed[-=](\d{1,12})/.exec(h); return m ? +m[1] : 0; };
// ---- 今日之山: one mountain a day, the same for everyone who asks for it. Dev only (normal play never asks for it). The day is Beijing's
// (it turns at Beijing midnight, as the 小红书 boards count days: 16:00 UTC), and the mountain's number is that day hashed into six figures,
// so it needs no server and every phone agrees. #today (or #daily) is today's mountain; once there the address names it as #seed-<n>.
App.today = () => Math.floor((Date.now() + 8 * 3600e3) / 86400e3);
App.dailySeed = (d = App.today()) => { let h = Math.imul(d ^ 0x2c1b3c6d, 0x297a2d39); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return 100000 + (h >>> 0) % 900000; };
App.isDaily = () => Course.seed === App.dailySeed();
App.dayLabel = (d = App.today(), en = false) => { const t = new Date(d * 86400e3), m = t.getUTCMonth() + 1, n = t.getUTCDate(); return en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + n : m + '月' + n + '日'; };
App.randomSeed = () => { let n; do n = 100000 + Math.floor(Math.random() * 900000); while (n === Course.seed || n === App.dailySeed()); return n; };      // six figures: easy to read out
// Setting the skier down where no terrain has been made yet (another mountain, or far off on this one) is about a second of work for the
// terrain. It is done a slice a frame behind the dark veil the game opened from: the picture on screen is held while the veil closes,
// `place` puts the skier where it should stand (Game.reset and the like), the terrain is made again round the lens, and the veil lifts on
// the skier at rest; if a run was on, it starts again from there. Nothing is seen half made and no frame is long.
// (now: all of it before returning, without the veil. That is what the headless tools get, which have no frames to spread it over.)
App.swap = function (place, now = QS.has('manual')) {
  const sw = { run: App.swapping ? App.swapping.run : Game.mode === 'run', lift: 0, t0: performance.now() }, veil = document.getElementById('veil');
  const x0 = Render.cam.pos[0], z0 = Render.cam.pos[2]; App.swapping = null;
  place();
  // what lay on the old snow or hung in the old air goes; the far sky stays where it was (the airliner keeps its place in it)
  Game.mode = 'title'; Game.events.length = 0; App.strides = null; Tracks.reset(); Spray.clear();
  tick(1 / 60, false);                           // body, lens and all that follows them are where they belong before anything is shown
  { const pl = Sky.plane, c = Render.cam.pos; if (pl && pl.on) { pl.x += c[0] - x0; pl.z += c[2] - z0; } }
  Terrain.rebuild(Render.cam.pos[0], Render.cam.pos[2]);
  if (now) { Terrain.rebuildStep(); if (sw.run) Game.start(); return; }
  App.swapping = sw; if (veil) { veil.style.transition = 'opacity .2s ease-in'; veil.classList.remove('lift'); }
};
// a change of mogul shape (Variants 'mogf') remakes the ground under the skier, as another place would
Variants.on((n, id, first) => { if (n === 'mogf' && !first) { const s0 = -Game.s.p[2]; App.swap(() => Game.reset(s0)); } });
App.onTick.push(() => {
  const sw = App.swapping, t = performance.now(); if (!sw) return;
  Gov.acc = Gov.n = Gov.ownT = Gov.ownN = Gov.slow = 0;                // (these frames say nothing about how fast this machine draws)
  if (!sw.lift) { if (Terrain.rebuildStep(24) && t - sw.t0 >= 230) sw.lift = 1; }      // drawn again from this frame on: the new place is on the screen before the veil thins
  else if (sw.lift === 1) { sw.lift = 2; sw.t0 = t; const veil = document.getElementById('veil'); if (veil) { veil.style.transition = 'opacity .65s ease-out'; veil.classList.add('lift'); } }
  else if (t - sw.t0 > 260) { App.swapping = null; if (sw.run && Game.mode === 'title') Game.start(); }      // the push-off is seen: it waits for the veil to thin
});
// (while the terrain is being made the last picture stays up: nothing is drawn)
{ const draw = Render.render; Render.render = function () { const sw = App.swapping; if (!sw || sw.lift) draw(); }; }
// another mountain, now: the course is laid out again from `seed` (a new one when none is given), everything made from the old course
// is thrown away or made again, and the skier stands at the top of it, on the title page or in a run as before. Returns the seed.
App.onMountain = [];                             // called with the seed after every change of mountain
App.newMountain = function (seed, now) {
  seed = Math.floor(+seed) >= 1 ? +seed : App.randomSeed();
  App.swap(() => {
    Course.setSeed(seed); if (Trees.reset) Trees.reset();
    if (Deer.herd) { Deer.herd.length = 0; Deer.next = 36; } if (typeof Fauna !== 'undefined' && Fauna.reset) Fauna.reset();
    Game.reset();
  }, now);
  for (const f of App.onMountain) f(Course.seed);
  return Course.seed;
};
addEventListener('hashchange', () => { if (!DEV) return; const n = seedInHash(); if (App.ready && n && n !== Course.seed) App.newMountain(n); });

// ---- test API (used by the headless harness; harmless in production)
window.__ski = {
  boot: () => boot().then(() => 'ok ' + App.gfx.caps.backend, e => { reportError(e); return 'ERR ' + (e && e.message); }),
  view(pos, target, fov, roll) {
    Render.updateOrigin(pos); Render.setCamera(pos, target, [0, 1, 0], fov || 1.0, roll || 0);
    Terrain.update(pos[0], pos[2]);
    if (App.skierRoot) Skier.update(App.skierRoot, App.skierPose, Render.origin);
    Trees.update(Render.cam, Render.origin, Render.W / Render.H);
    Gates.update(Render.cam, Render.origin, null, 0, App.t);
    Render.computeGlobals(App.t, 1 / 60, App.state); for (const f of App.onTick) f(0, true); Render.render();
  },
  skier(x, z, yaw, pose) {
    const h = Course.height(x, z, 0.5), n = Course.normal(x, z).slice(), f0 = [Math.sin(yaw), 0, -Math.cos(yaw)];
    App.skierRoot = { pos: [x, h, z], fwd: v3.norm(v3.sub(f0, v3.mul(n, v3.dot(f0, n)))), nrm: n }; App.skierPose = pose || {};
    return App.skierRoot.pos;
  },
  async shot() { const cap = await App.gfx.capture(); const c2 = document.createElement('canvas'); c2.width = cap.w; c2.height = cap.h; c2.getContext('2d').putImageData(new ImageData(cap.data, cap.w, cap.h), 0, 0); return c2.toDataURL('image/png'); },
  height: (x, z) => Course.height(x, z, 0.5),
  mod: n => ({ Trees, TreeModel, Game, Course, Render, Spray, Sound })[n],        // test hook: a module by name (tree checks)
  set(path, v) { const parts = path.split('.'); let o = { Sky, Render, Post, App, Terrain, Course, Spray, Game, Input, Dust, Nebula, Clouds, Trees, Shafts, Vista, Tracks, Sound, Deer }; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = v; },
  err: () => App.gfx && App.gfx.lastError,
  // fast-forward the game: fn(t) returns the steering input (-1..1) for that moment; the last step is drawn
  sim(seconds, fn, opt = {}) {
    const n = Math.round(seconds * 60); if (Game.mode !== 'run') Game.start();
    const gl2 = App.gfx.caps.backend === 'webgl2';
    // (opt.dts: the frames' lengths in turn instead of 1/60 each, as a real browser's are never all the same: a test of what depends on them)
    for (let i = 0; i < n; i++) { Input.script = fn ? fn(Game.runT) : 0; const d = i === n - 1 && opt.draw !== false; tick(opt.dts ? opt.dts[i % opt.dts.length] : 1 / 60, d); if (!d && gl2 && i % 6 === 5) Tracks.pre(); }   // the tracks are pressed and wiped as in play
    const S = Game.s; return { p: S.p.map(v => +v.toFixed(2)), speed: +S.speed.toFixed(2), lean: +S.lean.toFixed(3), beta: +S.beta.toFixed(3), air: S.air, e: +S.e.toFixed(3), seg: Course.segAt(-S.p[2]).type };
  },
  frame(dt) { tick(dt == null ? 1 / 60 : dt, true); },
  step(dt) { tick(dt == null ? 1 / 60 : dt, false); },          // (a frame with nothing drawn: tests that only read numbers)
  // the sound of a stretch of skiing, rendered offline: the same instrument, fed the same states, on a clock that advances 1/60 s a step.
  // Returns a 16-bit WAV (base64) and a log of what the skier was doing
  async audioTest(seconds, fn, opt = {}) {
    const sr = opt.sr || 44100, off = new OfflineAudioContext(2, Math.round(seconds * sr), sr), rig = Sound.build(off, opt), n = Math.round(seconds * 60), log = [];
    const keep = { rig: Sound.rig, now: Sound.now }; let i = 0; Sound.rig = rig; Sound.now = () => i / 60 + 0.012; rig.fade(opt.level || Sound.level, 0, 0.01);
    if (!opt.title && Game.mode !== 'run') Game.start();
    for (i = 0; i < n; i++) {
      Input.script = fn ? fn(Game.runT) : 0; tick(1 / 60, false);
      if (i % 6 === 0) { const s = Sound.snapshot(); log.push([+(i / 60).toFixed(1), +s.speed.toFixed(1), +s.lat.toFixed(2), +s.I.toFixed(2), +s.load.toFixed(2), s.contact ? 1 : 0, +s.powder.toFixed(2), +(rig.E || 0).toFixed(2), +s.lean.toFixed(2), +s.skid.toFixed(2)]); }
    }
    Sound.rig = keep.rig; Sound.now = keep.now;
    const buf = await off.startRendering(), L = buf.getChannelData(0), Rr = buf.getChannelData(1), N = L.length, u8 = new Uint8Array(44 + N * 4), dv = new DataView(u8.buffer);
    const wr = (o, str) => { for (let k = 0; k < str.length; k++) u8[o + k] = str.charCodeAt(k); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); wr(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, N * 4, true);
    let peak = 0;
    for (let k = 0; k < N; k++) { peak = Math.max(peak, Math.abs(L[k]), Math.abs(Rr[k])); dv.setInt16(44 + k * 4, clamp(L[k], -1, 1) * 32767, true); dv.setInt16(46 + k * 4, clamp(Rr[k], -1, 1) * 32767, true); }
    let b64 = ''; for (let k = 0; k < u8.length; k += 0x6000) b64 += btoa(String.fromCharCode.apply(null, u8.subarray(k, k + 0x6000)));
    return { wav: b64, log, peak, chirps: (rig.chirps || 0) + ' passes ' + (rig.passes || 0) + ' hoofs ' + (rig.hoofs || 0) };
  },
  // test pilot: linked turns down the middle of the run, steering round the trees. Returns the steering function sim() wants
  pilot(amp = 0.45, period = 5.2) {
    const pc = {}, tn = {};
    return t => {
      const S = Game.s, p = S.p, look = 10 + Math.max(S.speed, 4) * 0.9, c = Course.at(-p[2] + look, pc);
      let tx = c.cx + amp * c.hw * Math.sin(t * TAU / period); const tz = p[2] - look;
      for (let k = 1; k <= 8; k++) { const qx = p[0] + (tx - p[0]) * k / 8, qz = p[2] + (tz - p[2]) * k / 8; Course.nearTree(qx, qz, tn); if (tn.ok && !tn.soft && tn.d < 3.4) tx += (qx >= tn.x ? 1 : -1) * (4.6 - tn.d) * (k < 3 ? 2.6 : 1.1); }
      return clamp((Math.atan2(tx - p[0], -(tz - p[2])) - Math.atan2(S.v[0], -S.v[2])) * 2.4, -0.85, 0.85);
    };
  },
  reset(s0) { Game.reset(s0); Game.mode = 'title'; },
  // set the time of day: minutes from midnight on the 24-minute day, or a name (day, golden, sunset, dusk, night, dawn, sunrise)
  tod(t) { Sky.setClock(typeof t === 'string' ? Sky.times[t] : t); Sky.update(); Clouds.baked = false; Vista.shadowElev = -9; Vista.updateShadow(true); return +Sky.sunElev.toFixed(4); },
  game: () => Game, input: () => Input, app: () => App, ui: () => UI, i18n: () => I18N,
  get m() { return { Sky, Render, Post, App, Terrain, Course, Spray, Game, Input, Skier, Tex, Dust, Nebula, Clouds, Trees, Shafts, Vista, Tracks, Sound, Atmo, Deer, View, Variants, Weather, Grains, Quality, SnowLook, XR, UI }; },
};
App.fit = fit;
window.__ski.gates = Gates;
addEventListener('resize', () => { if (typeof UI !== 'undefined' && UI.layout) UI.layout(); if (App.ready && !QS.get('w')) fit(); });
// (interface) a run set down keeps its last picture on the canvas; when the frame changes shape meanwhile that picture is drawn once more to fit
App.redraw = () => {
  if (XR.active) return;
  if (!App.ready || !App.paused || (App.gfx && App.gfx.lost)) return;
  try { Render.computeGlobals(App.t, 1 / 60, App.state); for (const f of App.onTick) f(0, true); Render.render(); } catch (e) { }
};
addEventListener('resize', () => App.redraw());
if (Par.W) { }          // (a background thread of the start-up: it only answers jobs, 00d_par.js)
else if (QS.has('manual') && !QS.has('ui')) document.getElementById('app').classList.add('bare');
else {
  UI.init();
  boot(UI.stage).then(() => { UI.ready(); lastT = performance.now(); requestAnimationFrame(loop); if (QS.has('autostart')) UI.go(); }).catch(e => { if (!retryOnWebGL2(e)) reportError(e); });
}
