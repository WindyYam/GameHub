"use strict";
// ---------------------------------------------------------------- immersive mode in a headset (WebXR; first target: Safari on Apple Vision Pro)
// Only where the browser says it can open an immersive session does any of this show: the title page then has a 沉浸模式 button, and the
// page is drawn with WebGL2 from the start (99_main.js), because WebXR hands its framebuffer to WebGL alone. A computer or a phone never
// sees it and draws exactly as before.
//
// How a frame is made in there (all of it on top of the flat game, which keeps running underneath unchanged):
// - The rig. The game's chase camera still runs (07_game.js) and decides where the lens stands: behind the skier, riding the snow. The
//   headset takes only that position, never the camera's turn up or down, its roll, its shake or its lens kicks, and turns the world
//   about the vertical alone, slowly, to keep the skier ahead. Nothing ever swings the view by itself: the player's own head looks around.
// - The eyes. WebXR crops the visible region out of a centred lens. On visionOS, the GPU draws that region directly using the
//   compositor's off-axis projection and a matching origin for the sky and atmosphere's screen rays.
//   The shadow map and the snow's own maps are drawn once for both eyes (Render.renderShared), the rest once for each (Render.renderView).
// - Comfort. No lens effects (ghosts, the starburst, snow on the glass, speed fringes, the shutter's smear): there is no lens. A soft
//   darkening closes in at the edges while the rig turns fast or the skier is in the air, the usual remedy for being moved by something
//   other than your own legs.
// - Steering. The head leaned (or tipped) to the side steers, the head over the tips or back over the tails moves the weight, as
//   the finger or the arrows do. Whatever way the player stands when the run starts is 'straight'. A pinch starts the run; held, the
//   right hand tucks, the left loads a jump and lets it go. The Digital Crown (the system's own way out) leaves, and the run waits on
//   the menu, flat again.
// - What is drawn: a lower quality level of its own (two eyes at 90 frames a second are about six times the work of one window at 60),
//   at a sharpness that steps down by itself when the frames cannot be held.
// Never yet run on a real headset: tested with a WebXR emulator in a browser (see docs/ARCHITECTURE.md, Immersive mode).
const XR = (() => {
  const qs = new URLSearchParams(location.search);
  // the level drawn in the headset (read like Quality.L by the modules that draw: 00c_quality.js)
  const LEVEL = { name: 'XR', maxDpr: 1, maxPx: 1e9, floor: 0.6, shadow: 1024, blur: false, dust: 0.5, glitter: 0.45, far: 380, bloom: 5 };
  
  const X = {
    ok: false, active: false, starting: false, session: null, ref: null, layer: null, pose: null,
    scale: clamp(+qs.get('xrscale') || 0.62, 0.25, 1.5), minScale: 0.32, maxScale: clamp(+qs.get('xrscale') || 0.8, 0.25, 1.5),
    maxPx: 2.2e6, fbScale: clamp(+qs.get('xrfb') || 1, 0.3, 1.5), vignette: qs.get('xrvig') !== '0',
    yaw: null, yawRate: 1.4, turn: 0, vig: 0, steer: 0, fa: 0, tx: 1, ty: 1, recenter: true, hidden: false,
    bodyControls: true,
    refPos: [0, 0, 0], refYaw: 0, rig: [0, 0, 0], stats: { frames: 0, avg: 0 },
  };
  let pPanel = null, pVig = null, pPresent = null, eyeTex = null, eyeT = null, panelTex = null, panelCv = null, panelKey = '', panelT = 0, saved = null;
  const gov = { acc: 0, n: 0, fast: 0, min: 1 };

  // can this browser open a headset? (asked once at start-up; ?xr=0 says no whatever the browser says)
  X.probe = async function () {
    X.ok = false;
    if (qs.get('xr') === '0') return false;
    try {
      if (navigator.xr && navigator.xr.isSessionSupported)
        X.ok = !!(await Promise.race([navigator.xr.isSessionSupported('immersive-vr'), new Promise(r => setTimeout(() => r(false), 1500))]));
    } catch (e) { X.ok = false; }
    return X.ok;
  };

  // ---- small maths: XR space and the game's share their axes (y up, -z ahead), so only a turn about y lies between them
  const rotY = (a, v) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c]; };
  // the three axes of an orientation (a unit quaternion)
  function axes(q) {
    const x = q.x, y = q.y, z = q.z, w = q.w;
    return {
      right: [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
      up: [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
      back: [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
    };
  }
  const P3 = p => [p.x, p.y, p.z];
  // a point at the top of the neck, ~10 cm behind and 8 cm below the eyes: turning the head to look round moves the eyes a long way
  // sideways and that point hardly at all, so leaning (which moves it) can steer and looking around does not
  const neck = (p, A) => [p[0] - 0.08 * A.up[0] + 0.10 * A.back[0], p[1] - 0.08 * A.up[1] + 0.10 * A.back[1], p[2] - 0.08 * A.up[2] + 0.10 * A.back[2]];
  // the frustum of one view, as tangents of its four sides (a projection matrix, column major)
  function sides(P) { return { L: (P[8] - 1) / P[0], R: (P[8] + 1) / P[0], B: (P[9] - 1) / P[5], T: (P[9] + 1) / P[5] }; }
  // a point in the player's room (XR 'local' space) -> the world: the rig stands where the player stood when the run started
  const phi = () => X.yaw - X.refYaw;
  const toWorld = p => { const d = rotY(phi(), [p[0] - X.refPos[0], p[1] - X.refPos[1], p[2] - X.refPos[2]]); return [X.rig[0] + d[0], X.rig[1] + d[1], X.rig[2] + d[2]]; };
  function camOf(t, fovY) {
    const A = axes(t.orientation), f = phi();
    return { pos: toWorld(P3(t.position)), right: rotY(f, A.right), up: rotY(f, A.up), fwd: rotY(f, A.back.map(x => -x)), fovY, near: CAM_NEAR, far: CAM_FAR, roll: 0 };
  }

  // ---- in and out
  X.enter = async function () {
    if (X.active || X.starting || !X.ok) return;
    const gfx = App.gfx;
    // (drawn with WebGPU after all, the start-up question having been too slow to answer: start again on WebGL2; the player taps again)
    if (!gfx || gfx.caps.backend !== 'webgl2') { const u = new URL(location.href); u.searchParams.set('backend', 'webgl2'); location.replace(u.href); return; }
    X.starting = true;
    try { Sound.unlock(); } catch (e) { }
    let s = null;
    try {
      s = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local'] });
      const gl = gfx.gl; if (gl.makeXRCompatible) await gl.makeXRCompatible();
      X.layer = new XRWebGLLayer(s, gl, { antialias: false, depth: false, stencil: false, alpha: false, framebufferScaleFactor: X.fbScale });
      s.updateRenderState({ baseLayer: X.layer, depthNear: CAM_NEAR, depthFar: CAM_FAR });
      X.ref = await s.requestReferenceSpace('local');
    } catch (e) {
      console.warn('immersive mode refused', e); X.starting = false; X.layer = null;
      if (s) try { s.end(); } catch (_) { }
      return;
    }
    X.session = s; X.starting = false;
    s.addEventListener('end', end);
    s.addEventListener('select', onSelect); s.addEventListener('selectstart', onSelectStart); s.addEventListener('selectend', onSelectEnd);
    s.addEventListener('visibilitychange', () => { X.hidden = s.visibilityState === 'hidden'; });
    begin();
    s.requestAnimationFrame(frame);
  };
  X.exit = function () { if (X.session) try { X.session.end(); } catch (e) { end(); } };

  function begin() {
    const gfx = App.gfx;
    Object.assign(gov, { acc: 0, gpu: 0, n: 0, slow: 0, fast: 0, min: 1 });
    X.error = null; X.active = true; Render.xr = true; X.sized = false; X.lastT = 0; X.yaw = null; X.recenter = true; X.vig = 0; X.steer = 0; X.fa = 0;
    saved = { L: Quality.L, view: Game.view, fringe: Post.fringe };
    Quality.L = Object.assign({}, Quality.L, LEVEL);
    Render.motionBlur = false; Render.setShadowRes(LEVEL.shadow); Trees.far = LEVEL.far; Post.bloomLevels = LEVEL.bloom;
    Game.setView('chase', true);
    if (!pPresent) build(gfx);
    App.camHook = camHook; App.renderHook = render;
    Input.xr = { steer: 0, fa: 0 };
    if (UI.state === 'run' && UI.open) UI.resume();                     // (the menu was open: it is out of sight in there, so the run goes on)
  }
  function end() {
    if (!X.active) return;
    X.active = false; Render.xr = false; X.session = null; X.layer = null; X.pose = null; X.frameObj = null;
    App.camHook = null; App.renderHook = null; Input.xr = null; Input.btn.jump = Input.btn.tuck = false;
    if (App.gfx) App.gfx.screen = null;
    if (saved) {
      Quality.L = saved.L; Post.fringe = saved.fringe;
      Game.setView(saved.view, true);
      saved = null;
    }
    Render.W = 0; App.applyQuality();                                   // (the window's own size, shadow map and bloom again)
    if (UI.state === 'run') UI.pause();                                 // the run waits on the menu, flat again
  }

  // ---- the pipelines of this file: the finished eye handed to the headset, the panel of words in the air, the darkening at the edges
  function build(gfx) {
    const base = { buffers: [], varyings: { uv: 'vec2f' }, depth: false, depthTest: false, cull: 'none', colorFormat: 'rgba8' };
    pPresent = gfx.pipeline(Object.assign({}, base, { name: 'xrPresent', colorFormat: 'rgba8', uniforms: { p: 'vec4f' }, textures: { tA: '2d' }, vs: VS_FULLSCREEN, fs: `
fn frag(v: VOut) -> FOut { var o: FOut; let uv: vec2f = mix(M.p.xy, M.p.zw, v.uv); o.color = vec4f(texLod(tA, uv, 0.0).rgb, 1.0); return o; }` }));
    // (p: strength, the centred lens's half widths as tangents (x, y), and where the darkening begins, as a tangent off the axis)
    pVig = gfx.pipeline(Object.assign({}, base, { name: 'xrVignette', blend: 'alpha', uniforms: { p: 'vec4f' }, vs: VS_FULLSCREEN, fs: `
fn frag(v: VOut) -> FOut { var o: FOut; let q: vec2f = (v.uv - vec2f(0.5)) * 2.0 * M.p.yz + vec2f(U.eyeCenter.x, -U.eyeCenter.y); let r: f32 = length(q);
  o.color = vec4f(0.0, 0.0, 0.0, M.p.x * smoothstep(M.p.w, M.p.w + 0.55, r)); return o; }` }));
    // (a quad in the world: p0 its top left corner (render space; w: how much it shows), ex across it, ey down it)
    pPanel = gfx.pipeline(Object.assign({}, base, { name: 'xrPanel', blend: 'premul', topology: 'strip', uniforms: { p0: 'vec4f', ex: 'vec4f', ey: 'vec4f' }, textures: { tP: '2d' }, vs: `
fn vert(a: VIn) -> VOut {
  var v: VOut;
  let uv: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u));
  v.clip = U.viewProj * vec4f(M.p0.xyz + M.ex.xyz * uv.x + M.ey.xyz * uv.y, 1.0);
  v.uv = uv;
  return v;
}`, fs: `
fn frag(v: VOut) -> FOut { var o: FOut; let c: vec4f = tex(tP, v.uv); let a: f32 = c.a * M.p0.w; o.color = vec4f(c.rgb * a, a); return o; }` }));
    panelCv = document.createElement('canvas'); panelCv.width = 1024; panelCv.height = 512;
    panelTex = gfx.texture({ w: 1024, h: 512, format: 'rgba8', filter: 'linear' });
  }

  // ---- size: the centred lens that holds both eyes' frusta, and how many pixels it is drawn at
  function size(pose) {
    let tx = 0, ty = 0, H = 0;
    const S = pose.views.map(v => { const s = sides(v.projectionMatrix); tx = Math.max(tx, -s.L, s.R); ty = Math.max(ty, -s.B, s.T); return s; });
    pose.views.forEach((v, i) => {
      const vp = X.layer.getViewport(v), s = S[i];
      H = Math.max(H, vp.height * 2 * ty / (s.T - s.B));
      
    });
    X.tx = tx; X.ty = ty;
    H *= X.scale; let W = H * tx / ty;
    if (W * H > X.maxPx) { const k = Math.sqrt(X.maxPx / (W * H)); W *= k; H *= k; }
    
    W = Math.max(64, Math.round(W)); H = Math.max(64, Math.round(H));
    const gfx = App.gfx;
    if (!eyeTex || eyeTex.w !== W || eyeTex.h !== H) {
      if (eyeTex) { gfx.destroyTarget(eyeT); gfx.destroyTexture(eyeTex); }
      eyeTex = gfx.texture({ w: W, h: H, format: 'rgba8', filter: 'linear' }); eyeT = gfx.target({ color: eyeTex });
    }
    if (Render.W !== W || Render.H !== H) Render.resize(W, H); else Post.resize(W, H);
    X.sized = true; X.stats.W = W; X.stats.H = H;
  }

  // ---- once a frame, between the game's step and everything that reads the lens (07_game.js has just placed its chase camera)
  function camHook(dt) {
    const pose = X.pose; if (!pose) return;
    // Game.update has just placed the selected camera. Take its position and
    // horizontal heading before applying the wearer's pose to either eye.
    const selectable = false;
    const c = Game.cam;
    const dx = c.anchor[0] - c.pos[0];
    const dz = c.anchor[2] - c.pos[2];
    // the rig turns to face the skier, slowly, and about the vertical only (the game's own pitch, roll, shake and kicks stay out)
    const prev = X.yaw;
    if (Math.hypot(dx, dz) > (0.5) || X.yaw == null) {
      const tgt = Math.atan2(dx, -dz);
      if (X.yaw == null) X.yaw = tgt; else { const d = Math.atan2(Math.sin(tgt - X.yaw), Math.cos(tgt - X.yaw)); X.yaw += d * (1 - Math.exp(-X.yawRate * dt)); }
    }
    X.turn = dt > 0 && prev != null ? damp(X.turn, Math.abs(Math.atan2(Math.sin(X.yaw - prev), Math.cos(X.yaw - prev))) / dt, 6, dt) : 0;
    X.rig = c.pos.slice();
    if (X.recenter) recenter(pose);
    // the lens everything else reads this frame (culling, the shadow box, the trees that fade before the lens): the head itself, wide
    // enough to hold both eyes. Each eye is set on its own before it is drawn
    const h = camOf(pose.transform, headFov());
    Object.assign(Render.cam, h);
    if (X.bodyControls) head(pose, dt);
    // the darkening at the edges: while the rig turns quickly, and in the air
    const want = X.vignette ? clamp(smooth(0.18, 0.8, X.turn) * 0.6 + (Game.s.air ? 0.3 : 0), 0, 0.75) : 0;
    X.vig = damp(X.vig, want, want > X.vig ? 6 : 2.5, dt);
  }
  // whatever way the player stands now is 'straight ahead', and where the head is now is the middle
  function recenter(pose) {
    const t = pose.transform, A = axes(t.orientation);
    X.refPos = neck(P3(t.position), A); X.refYaw = Math.atan2(-A.back[0], A.back[2]); X.recenter = false; X.steer = 0; X.fa = 0;
  }
  X.recentre = () => { X.recenter = true; };
  // The shared shadow/culling camera must encompass both off-centre eyes.
  function headFov() { return 2 * Math.atan(1.06 * Math.max(X.ty, X.tx * Render.H / Render.W)); }
  // the head as the steering: leaned to the side (the neck moved, ~14 cm for all of it) or tipped (~22 degrees for all of it), both
  // the same way round; over the tips or back over the tails (~12 cm). A dead band in the middle, and a little smoothing of the tracking
  function head(pose, dt) {
    const t = pose.transform, A = axes(t.orientation), n = neck(P3(t.position), A);
    const d = [n[0] - X.refPos[0], n[1] - X.refPos[1], n[2] - X.refPos[2]], cr = Math.cos(X.refYaw), sr = Math.sin(X.refYaw);
    const side = d[0] * cr + d[2] * sr, ahead = d[0] * sr - d[2] * cr, roll = Math.asin(clamp(A.right[1], -1, 1));
    const band = (x, b) => sign(x) * Math.max(0, Math.abs(x) - b) / (1 - b);
    const s = band(clamp(side / 0.14 - roll / 0.38, -1, 1), 0.08), f = band(clamp(ahead / 0.12, -1, 1), 0.15);
    X.steer = damp(X.steer, s, 14, dt); X.fa = damp(X.fa, f, 10, dt);
    if (Input.xr) { Input.xr.steer = X.steer; Input.xr.fa = X.fa; }
  }

  // ---- pinches. Any pinch on the title page starts (and the head is centred again); in a run, held: right hand tucks, left loads a jump
  // (a hand the browser does not name counts as the right). The selects arrive as the pinch is let go, which is when a start may play sound
  function onSelect() { if (UI.state === 'title') { X.recenter = true; UI.go(); } }
  function onSelectStart(e) { if (UI.state !== 'run') return; const left = e.inputSource && e.inputSource.handedness === 'left'; Input.btn[left ? 'jump' : 'tuck'] = true; }
  function onSelectEnd(e) { const left = e.inputSource && e.inputSource.handedness === 'left'; Input.btn[left ? 'jump' : 'tuck'] = false; }

  // ---- a frame from the headset
  function frame(t, f) {
    const s = X.session; if (!s) return;
    s.requestAnimationFrame(frame);
    const pose = f.getViewerPose(X.ref); if (!pose || !X.layer) return;
    advance(t, pose, f);
  }
  
  function advance(t, pose, f) {
    X.pose = pose; X.frameObj = f;
    const raw = X.lastT ? (t - X.lastT) / 1000 : 1 / 90; X.lastT = t;
    const dt = clamp(raw, 1 / 240, 1 / 20);
    if (!X.sized) size(pose);
    try {
      { tick(X.hidden ? 1e-4 : dt * App.resumeK, true); UI.frame(dt); }
      govern(raw); X.stats.frames++;
    }
    catch (e) { console.error(e); X.error = String(e && e.stack || e); X.exit(); }
  }
  // the sharpness steps down while the frames come late, and back up a little after a long while with room. 'Late' is against the
  // headset's own rate (Vision Pro shows 90 a second; others 72, 60...): the session's frameRate where it says, else the quickest second seen
  function govern(raw) {
    if (raw > 0.5) return;
    gov.acc += raw; gov.n++; if (gov.acc < 1) return;
    const avg = gov.acc / gov.n; gov.acc = 0; gov.n = 0; X.stats.avg = avg; gov.min = Math.min(gov.min, avg);
    const fr = X.session && X.session.frameRate, frame = fr > 20 ? 1 / fr : Math.max(gov.min, 1 / 120); X.stats.target = frame;
    if (avg > frame * 1.12 && X.scale > X.minScale) { X.scale = Math.max(X.minScale, X.scale * 0.88); X.sized = false; gov.fast = 0; }
    else if (avg < frame * 1.04) { if (++gov.fast >= 15 && X.scale < X.maxScale) { X.scale = Math.min(X.maxScale, X.scale * 1.06); X.sized = false; gov.fast = 0; } }
    else gov.fast = 0;
  }
  

  // ---- drawing: shared maps once, then each eye into its own picture, words and edges on top, and that handed to the headset
  function render() {
    const gfx = App.gfx, pose = X.pose, layer = X.layer;
    
    gfx.beginFrame();
    Render.renderShared();
    // (no lens in a headset: none of what a camera's glass does to the light)
    Post.ghosts = 0; Post.burst = 0; Post.flare *= 0.6; Post.wet = 0; Post.wetNew = 0; Post.speed = 0; Post.radial = 0; Post.fringe = 0; Post.chat = [0, 0, 0];
    panel();
    for (const [index, v] of pose.views.entries()) {
      const s = sides(v.projectionMatrix);
      if (-s.L > X.tx * 1.001 || s.R > X.tx * 1.001 || -s.B > X.ty * 1.001 || s.T > X.ty * 1.001) X.sized = false;      // (it changed: sized again next frame)
      
      const eye = camOf(v.transform, 2 * Math.atan(X.ty));
      Render.eyeGlobals(eye, null);
      gfx.screen = eyeT; Render.renderView(eye, null); gfx.screen = null;
      const vp = layer.getViewport(v), tx = X.tx, ty = X.ty;
      const crop = [(s.L + tx) / (2 * tx), (ty - s.T) / (2 * ty), (s.R + tx) / (2 * tx), (ty - s.B) / (2 * ty)];
      
      if (panelTex || X.vig > 0.01) {
        gfx.beginPass(eyeT, {});
        if (panelTex) drawPanel();
        if (X.vig > 0.01) gfx.draw(pVig, { u: { p: [X.vig, X.tx, X.ty, lerp(1.1, 0.42, X.vig)] }, count: 3 });
        gfx.endPass();
      }
      gfx.beginRaw(layer.framebuffer, vp.x, vp.y, vp.width, vp.height);
      gfx.draw(pPresent, { u: { p: crop }, tex: { tA: eyeTex }, count: 3 });
      
    }
    gfx.endFrame();
    
    Render.frame++;
  }

  // ---- the words in the air: on the title page what to do, in a run the speed. They stand in the rig, ahead and below, like a dashboard
  function panelContent() {
    const t = s => I18N.t(s);
    
    if (UI.state === 'title' || UI.state === 'starting') return { kind: 'title', lines: [t('捏一下手指 出发'), t('左右歪头转弯 · 转弯时头往后压刃拐急，头往前搓雪减速'), t('右手捏住 蹲低加速 · 左手捏住 蓄力，松开起跳'), t('按数码表冠退出')] };
    if (UI.state === 'run') return { kind: 'run', lines: [String(Math.round((Game.s.speed || 0) * 3.6))] };
    return null;
  }
  function panel() {
    const c = panelContent(); X.panel = c; if (!c) return;
    const key = c.kind + '|' + c.lines.join('|'), now = performance.now();
    if (key === panelKey || (c.kind === 'run' && now - panelT < 100)) return;
    panelKey = key; panelT = now;
    const g = panelCv.getContext('2d', { willReadFrequently: true }), W = panelCv.width, H = panelCv.height;
    g.clearRect(0, 0, W, H);
    const round = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.fillStyle = 'rgba(12,16,24,0.58)'; round(8, 8, W - 16, H - 16, 48); g.fill();
    g.strokeStyle = 'rgba(255,214,150,0.55)'; g.lineWidth = 3; round(8, 8, W - 16, H - 16, 48); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f4ecdf';
    const sans = '"PingFang SC","Hiragino Sans GB",system-ui,-apple-system,sans-serif';
    if (c.kind === 'title') {
      g.font = '600 64px ' + sans; g.fillStyle = '#f7d6a2'; g.fillText(c.lines[0], W / 2, 120);
      g.fillStyle = '#f4ecdf'; g.font = '400 36px ' + sans; g.fillText(c.lines[1], W / 2, 240); g.fillText(c.lines[2], W / 2, 305);
      g.fillStyle = 'rgba(244,236,223,0.8)'; g.font = '400 30px ' + sans; g.fillText(c.lines[3], W / 2, 410);
      
    } else {
      g.font = '300 260px ' + sans; g.fillText(c.lines[0], W / 2 - 60, H / 2 + 10);
      g.font = '500 56px ' + sans; g.fillStyle = 'rgba(244,236,223,0.7)'; g.textAlign = 'left'; g.fillText('KM/H', W / 2 + 160, H / 2 + 70);
    }
    const img = g.getImageData(0, 0, W, H);
    App.gfx.updateTexture(panelTex, 0, 0, W, H, new Uint8Array(img.data.buffer));
  }
  function drawPanel() {
    const c = X.panel; if (!c) return;
    const big = c.kind === 'title', w = big ? 1.5 : 0.34, h = w / 2, at = big ? [0, -0.05, -2.3] : [0, -0.62, -1.5], f = phi(), o = Render.origin;
    const ctr = X.rig.map((r, i) => r + rotY(f, at)[i] - o[i]), right = rotY(f, [w, 0, 0]);
    const p0 = [ctr[0] - right[0] / 2, ctr[1] + h / 2, ctr[2] - right[2] / 2, big ? 1 : 0.85];
    App.gfx.draw(pPanel, { u: { p0, ex: [right[0], 0, right[2], 0], ey: [0, -h, 0, 0] }, tex: { tP: panelTex }, count: 4 });
  }

  return X;
})();
