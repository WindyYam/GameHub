"use strict";
// ---------------------------------------------------------------- director: a recording-only mode for the demo video (?director=1)
// Nothing here runs in normal play. With ?director=1 in the address the page boots as usual, then the director takes the main loop over:
// each shot of a script is set up (mountain, time of day, weather, where on the run, how the skier skis, which trick) and played either live
// (a preview, real time) or frame by frame for a recording (every frame drawn and handed to whoever asks, at any fps, any slow motion).
// The game's own views (chase, first person, ski tips ...) are used as they are; the free cameras below exist only in this mode and never
// touch the chase camera of normal play (the owner's rule: in play the camera never changes angle by itself).
//   Director.shots            the script (an array of shot objects, see SHOT below); replace it or edit it from the console / the driver
//   Director.preview(i)       play shot i live; Director.previewAll() plays them all in a row; Director.stop()
//   Director.begin(i, fps)    set shot i up for recording; then Director.step() advances one frame and draws it, returns false when the shot is over
//   Director.frame()          the last drawn frame as a PNG data URL (canvas only: no interface)
//   Director.info(i)          what shot i is, how many frames it has at a given fps
// SHOT: { id, name, dur (s of screen time), seed, tod (name or clock s), hold (true: the clock stands still), wx ('light' | 'heavy'),
//   at: { s } | { seg: 'kickers', off: m, n: which one } | { kicker: n, before: m }, lead (m of run skied, unseen, before the shot so speed is up; 0 = from rest),
//   steer: { amp, period, lane } | { rhythm: true, amp, wide, lane } (edge change on every mogul crest) | number, tuck: true | [t0, t1], jump: [t0, t1], trick: '360grab', trickSeed, speed (time factor: 0.25 = 4x slow),
//   cam: 'chase' | 'fp' | 'tips' | 'low' | 'high' | 'left' | 'right' | 'front' | 'far' | { kind: 'orbit' | 'drone' | 'fixed' | 'sky', ... },
//   skip: s of the shot played unseen first, flash: [t ...] lightning at these shot times, variants: { id: val }, label: text drawn into the corner (the nine-view montage),
//   cuts: [[t, view, label?], ...] switch the game's view at these shot times (one run, many views) }
const Director = (() => {
  const on = /[?&]director=1\b/.test(location.search);
  const D = { on, shots: [], cur: null, playing: false, fps: 60, label: '' };
  if (!on) return D;
  const G = Game;

  // ---- the free cameras. Offsets are taken in the frame of the run where the shot starts (fwd: down the valley, right, up)
  let free = null;                 // { kind, ... , t (s into the shot), base: { p, yaw } }
  const frameAt = s => { const y = Course.yawAt(s); return { f: [Math.sin(y), 0, -Math.cos(y)], r: [Math.cos(y), 0, Math.sin(y)] }; };
  const off = (p, F, o) => [p[0] + F.r[0] * o[0] + F.f[0] * o[2], p[1] + o[1], p[2] + F.r[2] * o[0] + F.f[2] * o[2]];      // o = [right, up, ahead]
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const above = (p, m) => { const h = Course.snowTop(p[0], p[2]) + m; if (p[1] < h) p[1] = h; return p; };
  function freeCam(dt) {
    const c = free, sk = G.root.pos, u = c.dur > 0 ? clamp(c.t / c.dur, 0, 1) : 0, k = ease(u), F = c.F;
    let pos, tgt, fov = c.fov || 0.9, roll = 0;
    const lookAt = [sk[0], sk[1] + (c.th != null ? c.th : 1.0), sk[2]];
    if (c.kind === 'orbit') {          // round the skier as it skis: r m out, h m up, from az0 to az1 (rad, 0 = behind)
      const a = (c.az0 || 0) + ((c.az1 != null ? c.az1 : c.az0 || 0) - (c.az0 || 0)) * k, Fl = frameAt(-G.s.p[2]);
      pos = off(sk, Fl, [Math.sin(a) * c.r, c.h, -Math.cos(a) * c.r]); tgt = lookAt;
    } else if (c.kind === 'drone') {   // rides with the skier, sliding from one offset to another ([right, up, ahead] m); look: 'skier' or [r,u,a] ahead of the lens
      const Fl = frameAt(-G.s.p[2]); pos = off(sk, Fl, lerp3(c.from, c.to || c.from, k));
      tgt = c.look && c.look !== 'skier' ? off(pos, Fl, c.look) : lookAt;
    } else if (c.kind === 'fixed') {   // stands where it was put at the start ([right, up, ahead] of the skier then) and turns to follow; stare: stop following after this many s
      if (!c.P) c.P = above(off(c.base, F, c.at), 0.3);
      pos = c.P; if (c.stare != null && c.t > c.stare) { if (!c.T) c.T = lookAt.slice(); tgt = c.T; } else tgt = lookAt;
    } else {                           // sky: from where the skier starts, a slow tilt (pitch p0 to p1, rad above the horizon) and turn (yaw0 to yaw1, rad from down the valley)
      pos = off(c.base, F, c.at || [0, 3, -6]);
      const p = (c.p0 || 0) + ((c.p1 != null ? c.p1 : c.p0 || 0) - (c.p0 || 0)) * k, y = Math.atan2(F.f[0], -F.f[2]) + (c.yaw0 || 0) + ((c.yaw1 != null ? c.yaw1 : c.yaw0 || 0) - (c.yaw0 || 0)) * k;
      tgt = [pos[0] + Math.sin(y) * Math.cos(p), pos[1] + Math.sin(p), pos[2] - Math.cos(y) * Math.cos(p)];
    }
    if (c.fov1 != null) fov = c.fov + (c.fov1 - c.fov) * k;
    if (c.kind !== 'sky') { above(pos, c.mg != null ? c.mg : 0.4); pos[1] += Course.nearLift(pos, v3.norm(v3.sub(tgt, pos)), fov, Render.W / Render.H, Render.cam.near, 0.05, roll); }
    Render.setCamera(pos, tgt, [0, 1, 0], fov, roll);
  }
  const baseViewCam = G.viewCam;
  G.viewCam = function (dt, cam, pos, f) {
    if (free) { freeCam(dt); return true; }
    return baseViewCam ? baseViewCam(dt, cam, pos, f) : false;
  };

  // ---- the skier's line: linked turns down the run (as the test pilot), round the trees, and straight at a marked jump when one is near
  function kickerAhead(s0, range) {
    for (let b = Math.floor(s0 / 32); b <= Math.floor((s0 + range) / 32); b++) { const a = Course.feats.get(b); if (!a) continue; for (const f of a) if (f.kind === 'kicker' && f.mark && f.s > s0 && f.s < s0 + range) return f; }
    return null;
  }
  // (rhythm: a good mogul skier. The steering changes side on every crest of a bump the skis pass (S.mogG, mogul b), amp hard, and is
  // turned back toward the run's middle (or lane) before it strays more than `wide` m from it)
  function rhythmPilot(o) {
    const amp = o.amp != null ? o.amp : 0.3, wide = o.wide || 5, lane = o.lane || 0; let side = 1, arm = 0;
    return () => {
      const S = G.s, g = S.mogG || 0, c = Course.at(-S.p[2] + 6), off = S.p[0] - (c.cx + lane * c.hw);
      if (g > 0.04) arm = 1; else if (arm && g <= 0) { arm = 0; side = -side; }
      if (Math.abs(off) > wide && side * off > 0) side = -side;
      return side * amp;
    };
  }
  // (zipper: an expert's line through the bumps. One edge change on each crest, as the rhythm pilot, but the skis are steered to a heading
  // only `th` rad either side of the fall line (not held at a fixed steer), so the line stays in a narrow corridor straight down the field
  // and the speed stays up and even; a crest that does not come within `tmax` s is not waited for any longer)
  function zipperPilot(o) {
    const th = o.th != null ? o.th : 0.2, K = o.K || 2, base = o.base != null ? o.base : 0.3, kl = o.kl || 0.06, lane = o.lane || 0, tmax = o.tmax || 2, tmin = o.tmin || 0.25;
    let side = 1, arm = 0, tSide = 0, last = null, laneM = null, lsd = 0, ofs = 10;
    // (the corridor is kept in the bumps. Every field has a smooth line winding through it (mogField is 0 near it, 03_course.js), so the
    // lane is held on one side of that line, `gap` m from it (8-13 m: the bumps are full beyond 6.5), and follows it as it winds instead of
    // crossing it. The side is chosen once, where the field starts, for the whole way down (more room and fewer trees over the next 600 m);
    // the gap is then chosen frame by frame to keep the lane clear of trunks and inside the field, and the corridor slides at most 2.5 m/s)
    const fieldAt = (u, s) => { const c = Course.at(s); return c.mog > 0.01 ? Course.bumps(c.cx + u, -s) / c.mog : 0; };
    const chan = (s, hw) => { let a = 0, n = 0; for (let u = -0.7 * hw; u <= 0.7 * hw; u += 0.5) if (fieldAt(u, s) < 0.3) { a += u; n++; } return n ? a / n : 0; };
    const tn = {}, clearM = o.clear || 5;
    const trees = (u, s) => { let dm = 1e9; for (const d of [4, 8, 12, 16]) { const c = Course.at(s + d); for (const e of [-2, 0, 2]) { Course.nearTree(c.cx + u + e, -(s + d), tn); if (tn.ok) dm = Math.min(dm, tn.d); } } return clamp((clearM - dm) / 3, 0, 1); };
    const fill = (u, s) => { let m = 1; for (const d of [4, 8, 12, 16]) for (const e of [-2, 0, 2]) m = Math.min(m, fieldAt(u + e, s + d)); return m; };
    const score = (u, s) => fill(u, s) - trees(u, s);
    const gaps = [8, 9, 10, 11, 12, 13];
    const bestGap = (sd, s, hw, near) => { const g0 = chan(s + 10, hw); let best = near, bs = -1e9; for (const gp of gaps) { const u = g0 + sd * gp; if (Math.abs(u) > 0.78 * hw) continue; const q = score(u, s) - 0.02 * Math.abs(gp - near); if (q > bs) { bs = q; best = gp; } } return { gap: best, q: bs, u: g0 + sd * best }; };
    const plan = (s, hw) => { let best = 1, bs = -1e9; for (const sd of [-1, 1]) { let m = 0; for (let d = 0; d < 600; d += 15) { const b = bestGap(sd, s + d, Course.at(s + d).hw, 10); m += b.q > -1e8 ? b.q : -2; } if (m > bs) { bs = m; best = sd; } } return best; };
    return t => {
      const S = G.s, s = -S.p[2], c = Course.at(s), g = S.mogG || 0;
      if (last == null) last = t; const dt = Math.max(0, t - last); tSide += dt; last = t;
      if (g > 0.04) arm = 1; else if (arm && g <= 0) { arm = 0; if (tSide > tmin) { side = -side; tSide = 0; } }
      if (tSide > tmax) { side = -side; tSide = 0; }
      if (o.stay !== false && c.mog > 0.01) {
        if (!lsd) lsd = plan(s, c.hw);
        const b = bestGap(lsd, s, c.hw, ofs); ofs = b.gap;
        if (laneM == null) laneM = b.u; else laneM += clamp(b.u - laneM, -2.5 * dt, 2.5 * dt);
      }
      const off = S.p[0] - (c.cx + (laneM != null ? laneM : lane * c.hw)), a = Math.atan2(S.v[0], -S.v[2]) - Course.yawAt(s);
      return clamp(side * base + K * (side * th - clamp(kl * off, -0.35, 0.35) - a), -0.9, 0.9);
    };
  }
  function pilot(o) {
    if (o.rhythm) return rhythmPilot(o);
    if (o.zipper) return zipperPilot(o);
    const amp = o.amp != null ? o.amp : 0.45, per = o.period || 5.2, lane = o.lane || 0, pc = {}, tn = {};
    return t => {
      const S = G.s, p = S.p, s = -p[2], look = 10 + Math.max(S.speed, 4) * 0.9, c = Course.at(s + look, pc);
      let tx = c.cx + lane * c.hw + amp * c.hw * Math.sin(t * TAU / per); const tz = p[2] - look;
      const kf = o.jumps !== false && kickerAhead(s, 140);
      if (kf) { const kc = Course.at(kf.s, {}), w = smooth(140, 60, kf.s - s); tx = tx + (kc.cx + kf.u - tx) * w; }
      else for (let k = 1; k <= 8; k++) { const qx = p[0] + (tx - p[0]) * k / 8, qz = p[2] + (tz - p[2]) * k / 8; Course.nearTree(qx, qz, tn); if (tn.ok && !tn.soft && tn.d < 3.4) tx += (qx >= tn.x ? 1 : -1) * (4.6 - tn.d) * (k < 3 ? 2.6 : 1.1); }
      return clamp((Math.atan2(tx - p[0], -(tz - p[2])) - Math.atan2(S.v[0], -S.v[2])) * 2.4, -0.85, 0.85);
    };
  }
  const within = (r, t) => r === true || (Array.isArray(r) && t >= r[0] && t < r[1]);

  // ---- setting a shot up
  function whereAt(sh) {
    const a = sh.at || {};
    if (a.seg) { Course.at(4000, {}); let n = a.n || 0; for (let i = 0; i < 400; i++) { if (i >= Course.segs.length) Course.at(Course.segs[Course.segs.length - 1].s0 + 4000, {}); const g = Course.segs[i]; if (g && g.type === a.seg && n-- <= 0) return g.s0 + (a.off || 0); } }
    if (a.kicker != null) {          // the nth marked jump of the mountain, `before` m short of its lip
      let n = a.kicker; for (let s = 0; s < 40000; s += 32) { Course.at(s + 400, {}); const b = Course.feats.get(Math.floor(s / 32)); if (!b) continue; for (const f of b) if (f.kind === 'kicker' && f.mark && Math.floor(f.s / 32) === Math.floor(s / 32) && n-- <= 0) return f.s + (f.len || 0) - (a.before || 0); }
    }
    return a.s != null ? a.s : 14;
  }
  function setup(sh) {
    if (sh.variants && typeof Variants !== 'undefined') for (const k in sh.variants) try { Variants.set ? Variants.set(k, sh.variants[k]) : (Variants.val[k] = sh.variants[k]); } catch (e) { }
    if (sh.seed && sh.seed !== Course.seed) App.newMountain(sh.seed, true);
    Sky.rate = sh.hold === false ? 1 : 0;
    if (sh.tod != null) { Sky.setClock(typeof sh.tod === 'string' ? Sky.times[sh.tod] : sh.tod); Sky.update(); Clouds.baked = false; Vista.shadowElev = -9; Vista.updateShadow(true); }
    Weather.set(sh.wx || 'light', true);
    G.slowMo = sh.slowMo != null ? sh.slowMo : 1; G.forceTrick = sh.trick || null; if (sh.trickSeed != null) G.trickSeed(sh.trickSeed);
    const s = whereAt(sh), lead = sh.lead != null ? sh.lead : 0;
    G.setView(typeof sh.cam === 'string' ? sh.cam : 'chase', true);
    free = null;
    App.swap(() => G.reset(Math.max(14, s - lead)), true);
    Input.script = 0; Input.btn.tuck = Input.btn.jump = false;
    const steer = typeof sh.steer === 'number' ? () => sh.steer : pilot(sh.steer || {});
    if (sh.start !== false) G.start(); else G.mode = 'title';      // (a swap restarts a run that was on: a shot of the skier standing still takes it back)
    // ski the lead unseen (the tracks are pressed and the spray settles as in play), then a second more so the camera has caught up
    if (lead > 0) { let n = 0; while (-G.s.p[2] < s && n++ < 60 * 120) { Input.script = steer(G.runT); Input.btn.tuck = !!sh.leadTuck; tick(1 / 60, false); if (n % 6 === 5 && App.gfx.caps.backend === 'webgl2') Tracks.pre(); } }
    const st = { sh, steer, t: 0, n: 0, flashes: (sh.flash || []).slice(), cuts: (sh.cuts || []).slice() };
    if (typeof sh.cam === 'object' && sh.cam) { free = Object.assign({ t: 0, dur: sh.dur, base: G.root.pos.slice(), F: frameAt(-G.s.p[2]) }, sh.cam); }
    for (let i = 0; i < 30; i++) tickShot(st, 1 / 60, false, true);     // half a second of settling (lens springs, spray), not shown
    for (let i = 0, n = Math.round((sh.skip || 0) * 60); i < n; i++) tickShot(st, 1 / 60, false);     // skip: seconds of the shot played unseen (the montage shows one run in pieces)
    st.t = 0; if (free) { free.t = 0; if (sh.cam.kind === 'fixed') { free.base = G.root.pos.slice(); free.F = frameAt(-G.s.p[2]); free.P = null; } }
    D.label = sh.label || '';
    return st;
  }
  function tickShot(st, dt, draw, warm) {
    const sh = st.sh, k = sh.speed || 1, t = st.t;
    Input.script = st.steer(G.runT); Input.btn.tuck = within(sh.tuck, t); Input.btn.jump = within(sh.jump, t);
    if (!warm) while (st.flashes.length && st.flashes[0] <= t) { st.flashes.shift(); Weather.flash({}); }
    // (cuts: one continuous run seen through the game's own views in turn, [[t, view], ...]: at shot time t the view is switched at a stroke)
    if (!warm) while (st.cuts.length && st.cuts[0][0] <= t) { const c = st.cuts.shift(); G.setView(c[1], true); if (c[2] != null) D.label = c[2]; }
    if (free) free.t += dt;
    if (sh.start === false && G.mode === 'run') { G.mode = 'title'; G.reset(-G.s.p[2]); }      // a still shot stays still, whoever starts a run
    tick(dt * k, draw);
    st.t += dt;
  }

  // ---- live preview (real time; the machine's frame rate)
  let raf = 0;
  D.preview = function (i, then) {
    D.stop(); const sh = D.shots[i]; if (!sh) return; App.paused = true;
    const st = D.cur = setup(sh); D.playing = true; D.index = i; let last = performance.now();
    const go = now => {
      if (!D.playing) return;
      const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
      tickShot(st, dt, true); drawLabel();
      if (st.t >= sh.dur) { D.playing = false; if (then) then(); return; }
      raf = requestAnimationFrame(go);
    };
    raf = requestAnimationFrame(go);
  };
  D.previewAll = function (from = 0) { const next = i => { if (i < D.shots.length) D.preview(i, () => next(i + 1)); }; next(from); };
  D.stop = function () { D.playing = false; cancelAnimationFrame(raf); free = null; };
  D.release = function () { D.stop(); App.paused = false; };

  // ---- recording: fixed steps, every frame drawn
  // (audio: the game's own sound and score for exactly the frames recorded. With { audio: true } the instrument is built again on an offline
  // context as long as the shot and fed the same states on the shot's own clock while the frames are made; D.audio() then renders it and
  // returns a 16-bit WAV as base64, the same as __ski.audioTest)
  let aud = null;
  D.begin = function (i, fps = 60, opt = {}) {
    D.stop(); App.paused = true; D.fps = fps; D.index = i; aud = null; D.cur = setup(D.shots[i]);
    if (opt.audio && typeof Sound !== 'undefined' && Sound.build) {
      const sr = opt.sr || 48000, off = new OfflineAudioContext(2, Math.ceil(D.shots[i].dur * sr) + sr, sr), rig = Sound.build(off, {});
      aud = { off, rig, keep: { rig: Sound.rig, now: Sound.now }, sr };
      Sound.rig = rig; Sound.now = () => (D.cur ? D.cur.t : 0) + 0.012; rig.fade(opt.level || Sound.level || 0.8, 0, 0.01);
    }
    return D.info(i, fps);
  };
  D.audio = async function () {
    if (!aud) return null; const a = aud; aud = null; Sound.rig = a.keep.rig; Sound.now = a.keep.now;
    const buf = await a.off.startRendering(), dur = D.cur ? D.cur.sh.dur : buf.duration, N = Math.min(buf.length, Math.round(dur * a.sr)), L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const u8 = new Uint8Array(44 + N * 4), dv = new DataView(u8.buffer), wr = (o, str) => { for (let k = 0; k < str.length; k++) u8[o + k] = str.charCodeAt(k); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); wr(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, a.sr, true); dv.setUint32(28, a.sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, N * 4, true);
    for (let k = 0; k < N; k++) { dv.setInt16(44 + k * 4, clamp(L[k], -1, 1) * 32767, true); dv.setInt16(46 + k * 4, clamp(Rr[k], -1, 1) * 32767, true); }
    let b64 = ''; for (let k = 0; k < u8.length; k += 0x6000) b64 += btoa(String.fromCharCode.apply(null, u8.subarray(k, k + 0x6000)));
    return b64;
  };
  D.step = function () {
    const st = D.cur; if (!st || st.t >= st.sh.dur - 1e-6) return false;
    const sub = Math.max(1, Math.round(60 / D.fps / Math.max(st.sh.speed || 1, 0.05) / 1)), dt = 1 / D.fps;
    // (slow motion is the world's clock running slow: one screen frame is still 1/fps of screen time; physics keeps its own fixed step inside)
    for (let j = 0; j < sub - 1; j++) tickShot(st, dt / sub, false);
    tickShot(st, dt / sub, true); drawLabel(); st.n++;
    return true;
  };
  D.frame = function () { return window.__ski.shot(); };
  D.info = (i, fps = 60) => { const sh = D.shots[i]; return sh && { i, id: sh.id, name: sh.name, dur: sh.dur, frames: Math.round(sh.dur * fps) }; };

  // the montage's corner label: drawn as DOM over the canvas for the preview, and stamped by the driver (ffmpeg) for the recording
  let lab = null;
  function drawLabel() {
    if (!lab) { lab = document.createElement('div'); lab.style.cssText = 'position:fixed;left:3.2vw;bottom:5vh;font:500 2.2vh/1 "Noto Serif SC",serif;letter-spacing:.3em;color:#fff;opacity:.85;text-shadow:0 0 1.5vh rgba(0,0,0,.4);z-index:99;pointer-events:none;visibility:visible!important'; document.body.appendChild(lab); }
    if (lab.textContent !== D.label) lab.textContent = D.label;
  }

  // ---- a clean picture: every element of the interface hidden, only the canvas shows (no ids relied on: the interface may change)
  const css = document.createElement('style'); css.textContent = 'body *{visibility:hidden!important}canvas{visibility:visible!important}'; (document.head || document.documentElement).appendChild(css);
  // keys for the preview: [ and ] previous / next shot, P plays all from the current one, Esc stops and gives the game back
  addEventListener('keydown', e => {
    if (e.code === 'BracketRight') D.preview(Math.min((D.index || 0) + (D.playing ? 1 : 0), D.shots.length - 1));
    else if (e.code === 'BracketLeft') D.preview(Math.max((D.index || 0) - 1, 0));
    else if (e.code === 'KeyP') D.previewAll(D.index || 0);
    else if (e.code === 'Escape') D.release();
  }, true);
  // once the page is up: start the run, so that the title page is gone, then wait for a script
  const wait = setInterval(() => { let ok = false; try { ok = App.ready; } catch (e) { } if (!ok) return; clearInterval(wait); try { if (UI.go) UI.go(); } catch (e) { } D.ready = true; }, 200);
  return D;
})();
if (Director.on) window.Director = Director;
