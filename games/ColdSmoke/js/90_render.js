"use strict";
// ---------------------------------------------------------------- renderer: targets, per-frame globals, pass order
const Render = (() => {
  const R = { W: 0, H: 0, scale: 1, origin: [0, 0, 0], frame: 0, time: 0, dt: 1 / 60, shadowRes: 2048, shadowRange: 62, motionBlur: true, stats: {} };
  let gfx, canvas, hdr, hdrB, depth, scene, smap, shadowT;
  const G = new Float32Array(GLOBALS_SIZE);
  R.G = G;
  R.cam = { pos: [0, 2, 0], fwd: [0, 0, -1], up: [0, 1, 0], right: [1, 0, 0], fovY: 1.0, near: CAM_NEAR, far: CAM_FAR, roll: 0 };
  let prevVP = null, prevOrigin = [0, 0, 0];

  R.init = function (g, cv) {
    gfx = g; canvas = cv; R.gfx = g;
    smap = gfx.texture({ w: R.shadowRes, h: R.shadowRes, format: 'depth', filter: 'linear', compare: true }); shadowT = gfx.target({ depth: smap }); R.shadowTex = smap;
  };
  // a different shadow map (Quality: 2048 texels across, fewer on a weaker phone). The shaders read its size, so only the map changes
  R.setShadowRes = function (n) {
    if (!gfx || n === R.shadowRes) { R.shadowRes = n; return; }
    gfx.destroyTarget(shadowT); gfx.destroyTexture(smap); R.shadowRes = n;
    smap = gfx.texture({ w: n, h: n, format: 'depth', filter: 'linear', compare: true }); shadowT = gfx.target({ depth: smap }); R.shadowTex = smap;
  };
  R.resize = function (w, h) {
    if (w === R.W && h === R.H) return;
    // Screen-space motion vectors from the old projection do not describe this viewport.
    prevVP = null;
    if (scene) { gfx.destroyTarget(scene); gfx.destroyTarget(R.hdrOnly); gfx.destroyTarget(R.hdrOnlyB); gfx.destroyTexture(hdr); gfx.destroyTexture(hdrB); gfx.destroyTexture(depth); }
    R.W = w; R.H = h; if (!R.xr) { canvas.width = w; canvas.height = h; }      // (in the headset the canvas is not what is shown: its size is left alone)
    hdr = gfx.texture({ w, h, format: 'rgba16f', filter: 'linear' }); depth = gfx.texture({ w, h, format: 'depth', filter: 'nearest' });
    scene = gfx.target({ color: hdr, depth }); R.hdr = hdr; R.depth = depth; R.scene = scene;
    R.hdrOnly = gfx.target({ color: hdr });       // same colour, no depth attached: passes that read scene depth as a texture draw here
    hdrB = gfx.texture({ w, h, format: 'rgba16f', filter: 'linear' }); R.hdrOnlyB = gfx.target({ color: hdrB });   // the scene after the shutter has smeared it
    Post.resize(w, h); for (const f of R.onResize) f(w, h); gfx.resize();
  };
  // floating origin: GPU positions are relative to a point that only moves in 1024 m steps, so shader noise can stay periodic
  R.updateOrigin = function (p) {
    const o = R.origin;
    if (Math.abs(p[0] - o[0]) > 640 || Math.abs(p[2] - o[2]) > 640 || Math.abs(p[1] - o[1]) > 400) {
      const n = [Math.round(p[0] / 1024) * 1024, Math.round(p[1] / 64) * 64, Math.round(p[2] / 1024) * 1024];
      const d = [n[0] - o[0], n[1] - o[1], n[2] - o[2]]; R.origin = n;
      if (R.onOriginShift) R.onOriginShift(d);
      return true;
    }
    return false;
  };
  R.setCamera = function (pos, target, up, fovY, roll) {
    const c = R.cam; c.pos = pos.slice(); c.fovY = fovY;
    let f = v3.norm(v3.sub(target, pos)), r = v3.norm(v3.cross(f, up)), u = v3.cross(r, f);
    if (roll) { const cs = Math.cos(roll), sn = Math.sin(roll); const r2 = v3.add(v3.mul(r, cs), v3.mul(u, sn)); u = v3.sub(v3.mul(u, cs), v3.mul(r, sn)); r = r2; }
    c.fwd = f; c.right = r; c.up = u;
  };
  function viewMatrix(c, o) { const e = v3.sub(c.pos, o), r = c.right, u = c.up, f = c.fwd; return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -v3.dot(r, e), -v3.dot(u, e), v3.dot(f, e), 1]; }

  R.computeGlobals = function (time, dt, state) {
    const c = R.cam, o = R.origin, aspect = R.W / R.H; R.time = time; R.dt = dt;
    const proj = m4.perspective(c.fovY, aspect, c.near, c.far), view = viewMatrix(c, o), vp = m4.mul(proj, view);
    R.vp = vp; R.view = view; R.proj = proj;
    // previous frame's view-projection expressed in this frame's render space (origin shifts cancel out)
    let pvp = prevVP || vp;
    if (prevVP && (prevOrigin[0] !== o[0] || prevOrigin[1] !== o[1] || prevOrigin[2] !== o[2])) pvp = m4.mul(prevVP, m4.translate([o[0] - prevOrigin[0], o[1] - prevOrigin[1], o[2] - prevOrigin[2]]));
    G.set(vp, GOFF.viewProj); G.set(m4.invert(vp), GOFF.invViewProj); G.set(pvp, GOFF.prevViewProj);
    prevVP = vp; prevOrigin = o.slice();
    const e = v3.sub(c.pos, o), th = Math.tan(c.fovY / 2);
    G.set([e[0], e[1], e[2], time], GOFF.camPos); G.set([...c.right, th], GOFF.camRight); G.set([...c.up, aspect], GOFF.camUp); G.set([...c.fwd, c.near], GOFF.camFwd);
    Sky.update(); const sun = Sky.sunDir();
    Post.exposure = Sky.exposure * R.exposureBias; Post.flare = Sky.isMoon ? 0.55 : 1; Post.burst = Sky.isMoon ? 0.0 : 1; Post.ghosts = Sky.isMoon ? 0.25 : 1;
    G.set([...sun, Sky.milk], GOFF.sunDir); G.set([...Sky.sunCol, 260], GOFF.sunCol); G.set([...Sky.ambSky, Post.exposure], GOFF.ambSky); G.set([...Sky.ambGnd, state.drift != null ? state.drift : 1], GOFF.ambGnd);
    // haze: thin up here, pooling toward the cloud sea far below the camera
    G.set([state.fogDensity != null ? state.fogDensity : 0.00016, 1 / 900, e[1] - 700, 9000], GOFF.fogA);
    G.set([R.W, R.H, 1 / R.W, 1 / R.H], GOFF.res);
    G.set([((o[0] % 1024) + 1024) % 1024, ((o[1] % 1024) + 1024) % 1024, ((o[2] % 1024) + 1024) % 1024, R.frame], GOFF.origin);
    G.set([state.speed || 0, state.lean || 0, dt, R.shadowRange], GOFF.misc);
    G.set([state.wind ? state.wind[0] : 1.2, 0, state.wind ? state.wind[2] : 0.4, time * 0.2], GOFF.wind);
    const pp = state.playerPos || c.pos; G.set([pp[0] - o[0], pp[1] - o[1], pp[2] - o[2], state.air ? 1 : 0], GOFF.player);
    // sun in screen space
    const sp = [sun[0] * 1e5, sun[1] * 1e5, sun[2] * 1e5], cw = vp[3] * sp[0] + vp[7] * sp[1] + vp[11] * sp[2];
    const sx = (vp[0] * sp[0] + vp[4] * sp[1] + vp[8] * sp[2]) / cw, sy = (vp[1] * sp[0] + vp[5] * sp[1] + vp[9] * sp[2]) / cw;
    G.set([sx * 0.5 + 0.5, 0.5 - sy * 0.5, cw > 0 ? 1 : 0, Sky.elev], GOFF.sunScr);
    G.set([(state.dust != null ? state.dust : 1) * (1 - 0.6 * Sky.night), 1, 1, state.microShadow != null ? state.microShadow : 1], GOFF.fx); G.set([Sky.E * Sky.nd, time * 0.004, Sky.lights, Sky.stars], GOFF.skyP); G.set([Sky.twi[0], Sky.twi[1], Sky.twi[2], 0], GOFF.twi);
    // (w, the shutter the crystals streak by, thrown snow and the dust in the air alike: as much shorter as time runs slower, like the
    // picture's own (07c_feel.js). Left at full length in a jump's slow motion, every grain kept its streak while its motion shrank)
    G.set([state.focus || 7.5, 9, 44, (typeof Feel !== 'undefined' ? Feel.timeK : 1) / 800], GOFF.dof);
    { const lp = state.lampPos, ld = state.lampDir, lk = (state.lamp != null ? state.lamp : 1) * Sky.lampK * R.lampPower;
      const still = typeof Variants !== 'undefined' && Variants.val.tgrain === 'b' ? 1 : 0;      // (w: the trees' grain held still, 14_trees.js 'tgrain')
      if (lp && ld && lk > 0.001) { G.set([lp[0] - o[0], lp[1] - o[1], lp[2] - o[2], lk], GOFF.lamp); G.set([ld[0], ld[1], ld[2], still], GOFF.lampDir); } else { G.set([0, 0, 0, 0], GOFF.lamp); G.set([0, -1, 0, still], GOFF.lampDir); } }
    const cwd = R.cloudWind; G.set([(time * cwd[0]) % 1024, (time * cwd[1]) % 1024, R.cloudShade, R.cloudCover], GOFF.cloudP);
    if (typeof Weather !== 'undefined') Weather.globals(G);            // heavy snow: the sun under cloud, the overcast's flat light, the eye opening for it, a flash
    // shadow frustum: orthographic box along the sun, centred ahead of the camera, snapped to texels
    const fh = v3.norm([c.fwd[0], 0, c.fwd[2]]), ctr = v3.add(e, v3.mul(fh, R.shadowRange * 0.62));
    const lz = sun, lx = v3.norm(v3.cross([0, 1, 0], lz)), ly = v3.cross(lz, lx), rng = R.shadowRange, tex = 2 * rng / R.shadowRes;
    let cx = v3.dot(ctr, lx), cy = v3.dot(ctr, ly); const cz = v3.dot(ctr, lz);
    // snapping in absolute space so shadows don't crawl: include the origin offset
    const ox = v3.dot(o, lx), oy = v3.dot(o, ly);
    cx = Math.round((cx + ox) / tex) * tex - ox; cy = Math.round((cy + oy) / tex) * tex - oy;
    // (a light that moves turns that grid about the world's origin, and far down the mountain it slid most of a texel a frame under the
    // shadows, which boiled: when the light has turned, the grid's phase is carried along so that it stays put where the camera is)
    { const P = R.snapP || (R.snapP = { lx, ly, x: 0, y: 0 }), a = v3.add(ctr, o); P.x = (P.x + v3.dot(a, v3.sub(lx, P.lx))) % tex; P.y = (P.y + v3.dot(a, v3.sub(ly, P.ly))) % tex; P.lx = lx; P.ly = ly;
      cx = Math.round((v3.dot(ctr, lx) + ox - P.x) / tex) * tex - ox + P.x; cy = Math.round((v3.dot(ctr, ly) + oy - P.y) / tex) * tex - oy + P.y; }
    const eye = v3.add(v3.add(v3.mul(lx, cx), v3.mul(ly, cy)), v3.mul(lz, cz + 600));
    const lview = [lx[0], ly[0], lz[0], 0, lx[1], ly[1], lz[1], 0, lx[2], ly[2], lz[2], 0, -v3.dot(lx, eye), -v3.dot(ly, eye), -v3.dot(lz, eye), 1];
    const svp = m4.mul(m4.ortho(-rng, rng, -rng, rng, 1, 1200), lview);
    G.set(svp, GOFF.shadowVP); R.shadowVP = svp;
    // window of the thrown-snow depth map: a small square of the shadow map's footprint that follows the skier, snapped to its texels
    { const px = pp[0] - o[0], py = pp[1] - o[1], pz = pp[2] - o[2], S = R.shadowRange / R.sprayRange, tq = 2 / R.sprayRes;
      const sx = svp[0] * px + svp[4] * py + svp[8] * pz + svp[12], sy = svp[1] * px + svp[5] * py + svp[9] * pz + svp[13], sz = svp[2] * px + svp[6] * py + svp[10] * pz + svp[14];
      G.set([S, Math.round(S * sx / tq) * tq, Math.round(S * sy / tq) * tq, sz], GOFF.sprayT); }
    gfx.setGlobals(G);
  };

  // one frame. `scene` callbacks let modules add their draws without this file knowing them.
  // shadow: into the shadow map. opaque/transparent: inside the scene pass (colour + depth).
  // offscreen: own render passes that may sample scene depth. fx: drawn over the finished scene (no depth attachment, depth is sampled).
  R.passes = { shadow: [], pre: [], opaque: [], transparent: [], offscreen: [], fx: [] };
  R.sprayRange = 40; R.sprayRes = 512;
  R.cloudWind = [-5.5, -2.5]; R.cloudShade = 0.86; R.cloudCover = 0.60; R.exposureBias = 1; R.lampPower = 37;   // (the shadows are read at the point plus cloudWind * time, so it points upwind: they drift with the wind and the cumulus, toward +x)
  R.onResize = [];
  // one eye of a headset (21_xr.js): everything in the globals that hangs on where the lens is and which way it looks, for camera c, drawn
  // at the size the targets have. The rest of the frame (sun, shadows, weather) was set once for the head by computeGlobals and stays.
  // There is no previous frame for an eye: the streaks of the snow in the air come from its own motion only, never from the head's
  R.eyeGlobals = function (c, frustum) {
    const o = R.origin, aspect = R.W / R.H;
    const proj = m4.perspective(c.fovY, aspect, c.near, c.far);
    
    const view = viewMatrix(c, o), vp = m4.mul(proj, view);
    R.vp = vp; R.view = view; R.proj = proj;
    G.set(vp, GOFF.viewProj); G.set(m4.invert(vp), GOFF.invViewProj); G.set(vp, GOFF.prevViewProj);
    const e = v3.sub(c.pos, o), th = Math.tan(c.fovY / 2);
    G.set([e[0], e[1], e[2], R.time], GOFF.camPos); G.set([...c.right, th], GOFF.camRight); G.set([...c.up, aspect], GOFF.camUp); G.set([...c.fwd, c.near], GOFF.camFwd);
    const sun = Sky.sunDir(), sp = [sun[0] * 1e5, sun[1] * 1e5, sun[2] * 1e5], cw = vp[3] * sp[0] + vp[7] * sp[1] + vp[11] * sp[2];
    const sx = (vp[0] * sp[0] + vp[4] * sp[1] + vp[8] * sp[2]) / cw, sy = (vp[1] * sp[0] + vp[5] * sp[1] + vp[9] * sp[2]) / cw;
    G.set([sx * 0.5 + 0.5, 0.5 - sy * 0.5, cw > 0 ? 1 : 0, Sky.elev], GOFF.sunScr);
    gfx.setGlobals(G);
  };
  // the frame in two halves, so that a headset can draw the second once for each eye: what is the same for both (bakes, the shadow map,
  // the snow's own maps), then the picture from one lens, from the scene through the lens effects to the screen
  R.renderShared = function () {
    Sky.bakeLut();
    if (!Nebula.baked) Nebula.bake();
    Clouds.update();
    if (!Trees.isBaked()) Trees.bake();
    gfx.beginPass(shadowT, { depth: 1 });
    Terrain.drawShadow(R.origin, typeof Quality !== 'undefined' ? Quality.k('shLv') : 2);
    for (const f of R.passes.shadow) f(R);
    gfx.endPass();
    for (const f of R.passes.pre) f(R);
  };
  R.renderView = function (eye, frustum) {
    gfx.beginPass(scene, { color: [0, 0, 0, 0], depth: 1 });
    for (const f of R.passes.opaque) f(R);
    Terrain.draw(R.origin, smap, Sky.lut, Spray.sunTex, eye, frustum);
    Sky.draw();
    for (const f of R.passes.transparent) f(R);
    gfx.endPass();
    for (const f of R.passes.offscreen) f(R);
    let out = hdr, outT = R.hdrOnly;
    if (R.motionBlur && R.dt > 0) { gfx.beginPass(R.hdrOnlyB, { color: [0, 0, 0, 0] }); Post.motionBlur(hdr, depth, R.dt); gfx.endPass(); out = hdrB; outT = R.hdrOnlyB; }
    if (R.passes.fx.length) { gfx.beginPass(outT, {}); for (const f of R.passes.fx) f(R); gfx.endPass(); }
    Post.run(out, depth);
  };
  R.render = function () {
    gfx.beginFrame();
    R.renderShared();
    R.renderView();
    gfx.endFrame();
    R.frame++;
  };
  return R;
})();
