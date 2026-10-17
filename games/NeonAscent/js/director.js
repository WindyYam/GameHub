/* DIRECTOR — side-view follow camera (from a distance), HUD, synthesized sound */
(function () {
'use strict';
const NA = window.NA, P = NA.P, { clamp, damp } = NA.M, cam = NA.camera;
const D = NA.director = { rig: '', label: 'side follow', cameraMode: 'orbit', viewBlend: 0 };
const FOV = 34;
const DIST_MIN = 22, DIST_MAX = 220;                // camera stands `dist` metres from its pivot, which follows the car
const REAR_GROUND_CLEARANCE = 1.25;
const HOME = { dist: 62, yaw: 0, pitch: .08 };       // yaw 0 = side view of the track plane; the slight downward pitch keeps the camera above the crowd's heads
const REAR_HOME = { dist: 14, yaw: 0, pitch: .19 };
const REAR_DIST_MIN = 4, REAR_DIST_MAX = 45;
let dist = HOME.dist, yaw = HOME.yaw, pitch = HOME.pitch;
const tgt = { dist: HOME.dist, yaw: HOME.yaw, pitch: HOME.pitch }, pan = new THREE.Vector3(), panCur = new THREE.Vector3();
let rearDist = REAR_HOME.dist, rearYaw = REAR_HOME.yaw, rearPitch = REAR_HOME.pitch;
const rearTgt = { ...REAR_HOME }, rearPan = new THREE.Vector3(), rearPanCur = new THREE.Vector3();
D.setCameraMode = function (mode) {
  if (D.cameraMode === mode) return;
  D.cameraMode = mode;
  document.dispatchEvent(new Event('neon-camera-mode-change'));
};
D.toggleCamera = function () { D.setCameraMode(D.cameraMode === 'rear' ? 'orbit' : 'rear'); };

// controls: wheel / pinch = distance, drag = orbit around the pivot, right-drag / shift-drag / two-finger drag = move the pivot, double-click or V = reset
const zoomBy = k => {
  if (D.cameraMode === 'rear') rearTgt.dist = clamp(rearTgt.dist * k, REAR_DIST_MIN, REAR_DIST_MAX);
  else tgt.dist = clamp(tgt.dist * k, DIST_MIN, DIST_MAX);
};
const orbitBy = (dx, dy) => {
  if (D.cameraMode === 'rear') {
    rearTgt.yaw -= dx * .0055;
    rearTgt.pitch = clamp(rearTgt.pitch + dy * .0055, -.35, 1.2);
  } else {
    tgt.yaw -= dx * .0055;
    tgt.pitch = clamp(tgt.pitch + dy * .0055, -.04, 1.45);
  }
};
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), panDelta = new THREE.Vector3();
const carFrame = new THREE.Quaternion(), invCarFrame = new THREE.Quaternion();
const panBy = (dx, dy) => {
  const rear = D.cameraMode === 'rear', d = rear ? rearTgt.dist : tgt.dist, fov = rear ? 48 : FOV;
  const k = 2 * d * Math.tan(fov * Math.PI / 360) / innerHeight;
  _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1);
  panDelta.set(0, 0, 0).addScaledVector(_r, -dx * k).addScaledVector(_u, dy * k);
  const offset = rear ? rearPan.add(panDelta.applyQuaternion(invCarFrame.copy(carFrame).invert())) : pan.add(panDelta);
  if (offset.length() > (rear ? 25 : 90)) offset.setLength(rear ? 25 : 90);
};
const resetView = () => {
  Object.assign(tgt, HOME); pan.set(0, 0, 0);
  Object.assign(rearTgt, REAR_HOME); rearPan.set(0, 0, 0);
  D.setCameraMode('orbit');
};
addEventListener('wheel', e => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * .0012)); }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
const onUI = e => !!(e.target.closest && e.target.closest('#speedCtl,.ui'));
addEventListener('dblclick', e => { if (!onUI(e)) resetView(); });
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'v') resetView(); });
const pointers = new Map(); let pinch = 0;
const two = () => { const [a, b] = [...pointers.values()]; return { span: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
addEventListener('pointerdown', e => { if (onUI(e)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) pinch = two(); });
addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) { if (e.buttons & 2 || e.shiftKey) panBy(dx, dy); else orbitBy(dx, dy); }
  else if (pointers.size === 2) {
    const c = two();
    if (pinch && c.span > 0) { zoomBy(pinch.span / c.span); panBy(c.mx - pinch.mx, c.my - pinch.my); }
    pinch = c;
  }
});
const release = e => { pointers.delete(e.pointerId); pinch = 0; if (pointers.size === 2) pinch = two(); };
addEventListener('pointerup', release); addEventListener('pointercancel', release);

D.init = function (rh) { D.rh = rh; };

const _o = new THREE.Vector3(), piv = new THREE.Vector3();
const orbitPos = new THREE.Vector3(), orbitTarget = new THREE.Vector3(), rearPos = new THREE.Vector3(), rearTarget = new THREE.Vector3();
const rearOffset = new THREE.Vector3(), rearAim = new THREE.Vector3(3, .8, 0), rearLookOffset = new THREE.Vector3();
const rearPosCur = new THREE.Vector3(), rearTargetCur = new THREE.Vector3(), viewTarget = new THREE.Vector3();
const cameraFrameQ = new THREE.Quaternion(), worldFrameQ = new THREE.Quaternion();
const carUp = new THREE.Vector3(0, 1, 0);
let pivInit = false;
let rearInit = false;
D.update = function (dt, sim) {
  const p = sim.pos;                                  // pivot = centre of the car, followed softly
  if (!pivInit || D.rig !== 'side') { piv.copy(p); pivInit = true; D.rig = 'side'; dist = tgt.dist; yaw = tgt.yaw; pitch = tgt.pitch; panCur.copy(pan); }
  else { piv.x = damp(piv.x, p.x, 5, dt); piv.y = damp(piv.y, p.y, 5, dt); piv.z = damp(piv.z, p.z, 5, dt); }
  dist = damp(dist, tgt.dist, 8, dt); yaw = damp(yaw, tgt.yaw, 14, dt); pitch = damp(pitch, tgt.pitch, 14, dt);
  panCur.x = damp(panCur.x, pan.x, 14, dt); panCur.y = damp(panCur.y, pan.y, 14, dt); panCur.z = damp(panCur.z, pan.z, 14, dt);
  rearDist = damp(rearDist, rearTgt.dist, 8, dt); rearYaw = damp(rearYaw, rearTgt.yaw, 14, dt); rearPitch = damp(rearPitch, rearTgt.pitch, 14, dt);
  rearPanCur.x = damp(rearPanCur.x, rearPan.x, 8, dt); rearPanCur.y = damp(rearPanCur.y, rearPan.y, 8, dt); rearPanCur.z = damp(rearPanCur.z, rearPan.z, 8, dt);
  carFrame.copy(sim.q);
  // shake: engine buzz on the track, hard knock on touchdown
  const sh = (sim.phase === 'ASCENT' ? .012 * sim.v / 30 : 0) + sim.impact * .18, tm = sim.t * 41;
  const px = piv.x + panCur.x, py = piv.y + panCur.y, pz = piv.z + panCur.z;
  _o.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
  orbitPos.set(px + _o.x + Math.sin(tm * 1.3) * sh, Math.max(py + _o.y + Math.sin(tm * 1.7 + 1) * sh, .6), pz + _o.z);
  orbitTarget.set(px, py, pz);
  rearLookOffset.copy(rearAim).add(rearPanCur).applyQuaternion(sim.q).add(p);
  rearOffset.set(-Math.cos(rearYaw) * Math.cos(rearPitch) * rearDist, Math.sin(rearPitch) * rearDist, Math.sin(rearYaw) * Math.cos(rearPitch) * rearDist);
  rearPos.copy(rearLookOffset).add(rearOffset.applyQuaternion(sim.q));
  rearPos.x += Math.sin(tm * 1.3) * sh; rearPos.y += Math.sin(tm * 1.7 + 1) * sh;
  rearTarget.copy(rearLookOffset);
  if (!rearInit) { rearPosCur.copy(rearPos); rearTargetCur.copy(rearTarget); rearInit = true; }
  else {
    rearPosCur.lerp(rearPos, 1 - Math.exp(-5 * dt));
    rearTargetCur.lerp(rearTarget, 1 - Math.exp(-7 * dt));
  }
  D.viewBlend = damp(D.viewBlend, D.cameraMode === 'rear' ? 1 : 0, 5, dt);
  cam.position.lerpVectors(orbitPos, rearPosCur, D.viewBlend);
  cam.position.y = Math.max(cam.position.y, .6 + (REAR_GROUND_CLEARANCE - .6) * D.viewBlend);
  cameraFrameQ.slerpQuaternions(worldFrameQ, sim.q, D.viewBlend);
  cam.up.copy(carUp).applyQuaternion(cameraFrameQ).normalize();
  cam.lookAt(viewTarget.lerpVectors(orbitTarget, rearTargetCur, D.viewBlend));
  const fov = FOV + (48 - FOV) * D.viewBlend;
  if (Math.abs(cam.fov - fov) > .01) { cam.fov = fov; cam.updateProjectionMatrix(); }
};

// =====================  HUD  =====================
const $ = id => document.getElementById(id);
const hud = { spd: $('vSpd'), alt: $('vAlt'), vs: $('vVs'), g: $('vG'), tilt: $('vTilt'), air: $('vAir'), airP: $('vAirP'), mode: $('mode'), count: $('count'), jets: [...document.querySelectorAll('#jets i')],
  banner: $('banner'), bannerT: $('bannerT'), bannerS: $('bannerS'), eng: [...document.querySelectorAll('.eng')] };
let hudT = 0, countShown = '', bannerShown = '';
const _up = new THREE.Vector3();
D.updateHud = function (dt, sim, countdown) {
  hudT += dt; if (hudT < .066) return; hudT = 0;
  hud.spd.textContent = Math.round(sim.vel.length() * 3.6);
  hud.alt.textContent = sim.phase === 'GRID' || sim.phase === 'ASCENT' ? Math.round(Math.max(sim.pos.y - P.comH, 0)) : Math.round(sim.alt);
  hud.vs.textContent = (sim.vel.y >= 0 ? '+' : '') + sim.vel.y.toFixed(1);
  hud.g.textContent = sim.gload.toFixed(1);
  const tilt = Math.acos(clamp(_up.set(0, 1, 0).applyQuaternion(sim.q).y, -1, 1)) * 57.3;
  hud.tilt.textContent = Math.round(tilt);
  if (sim.manual) {                                   // warn when the touchdown state would be fatal
    const near = !sim.touched && !sim.crashed && (sim.phase === 'FLIGHT' || sim.phase === 'LANDED') && sim.alt < 14;
    hud.vs.parentNode.classList.remove('bad');
    hud.tilt.parentNode.classList.toggle('bad', near && tilt > Math.acos(P.crashUp) * 57.3);
  } else { hud.vs.parentNode.classList.remove('bad'); hud.tilt.parentNode.classList.remove('bad'); }
  const air = sim.air / P.air0; hud.air.style.width = (air * 100).toFixed(0) + '%'; hud.airP.textContent = Math.round(air * 100);
  hud.mode.textContent = sim.phase === 'GRID' ? 'STANDBY' : sim.mode;
  hud.jets.forEach((e, i) => e.style.height = (2 + 32 * clamp(sim.thr[i] / P.Tmax, 0, 1)).toFixed(0) + 'px');
  hud.eng.forEach((e, i) => e.style.setProperty('--k', clamp(sim.thr[i] / P.Tmax, 0, 1).toFixed(2)));
  const c = countdown;
  if (c !== countShown) { countShown = c; hud.count.textContent = c; hud.count.classList.toggle('show', !!c); }
  const bn = sim.banner ? sim.banner.join('|') : '';
  if (bn !== bannerShown) {
    bannerShown = bn;
    if (sim.banner) { hud.bannerT.textContent = sim.banner[0]; hud.bannerS.textContent = sim.banner[1]; }
    hud.banner.classList.toggle('show', !!bn);
    hud.banner.classList.toggle('crash', !!sim.crashed);
  }
};

// =====================  AUDIO  =====================
const A = D.audio = { ctx: null, muted: false };
A.init = function () {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = A.ctx = new AC(), out = c.createGain(); out.gain.value = .55; out.connect(c.destination); A.out = out;
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  A.nbuf = nb;
  const noise = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
  // electric motor: two detuned oscillators through a low-pass
  A.o1 = c.createOscillator(); A.o1.type = 'sawtooth'; A.o2 = c.createOscillator(); A.o2.type = 'triangle';
  A.mf = c.createBiquadFilter(); A.mf.type = 'lowpass'; A.mf.frequency.value = 900; A.mg = c.createGain(); A.mg.gain.value = 0;
  A.o1.connect(A.mf); A.o2.connect(A.mf); A.mf.connect(A.mg); A.mg.connect(out); A.o1.start(); A.o2.start();
  // air jets
  A.jf = c.createBiquadFilter(); A.jf.type = 'bandpass'; A.jf.frequency.value = 1400; A.jf.Q.value = .6; A.jg = c.createGain(); A.jg.gain.value = 0;
  noise().connect(A.jf); A.jf.connect(A.jg); A.jg.connect(out);
  // wind
  A.wf = c.createBiquadFilter(); A.wf.type = 'lowpass'; A.wf.frequency.value = 500; A.wg = c.createGain(); A.wg.gain.value = 0;
  noise().connect(A.wf); A.wf.connect(A.wg); A.wg.connect(out);
  // purge whoosh
  A.pf = c.createBiquadFilter(); A.pf.type = 'lowpass'; A.pf.frequency.value = 700; A.pg = c.createGain(); A.pg.gain.value = 0;
  noise().connect(A.pf); A.pf.connect(A.pg); A.pg.connect(out);
};
A.beep = function (f, len = .18, g = .25) {
  if (!A.ctx || A.muted) return;
  const c = A.ctx, o = c.createOscillator(), gg = c.createGain(); o.frequency.value = f; o.type = 'sine';
  gg.gain.setValueAtTime(g, c.currentTime); gg.gain.exponentialRampToValueAtTime(.001, c.currentTime + len); o.connect(gg); gg.connect(A.out); o.start(); o.stop(c.currentTime + len + .02);
};
A.thump = function (g = .8) {
  if (!A.ctx || A.muted) return;
  const c = A.ctx, o = c.createOscillator(), gg = c.createGain(); o.frequency.setValueAtTime(90, c.currentTime); o.frequency.exponentialRampToValueAtTime(30, c.currentTime + .5);
  gg.gain.setValueAtTime(g, c.currentTime); gg.gain.exponentialRampToValueAtTime(.001, c.currentTime + .6); o.connect(gg); gg.connect(A.out); o.start(); o.stop(c.currentTime + .7);
};
// crash: low boom, a bright noise blast sweeping down, then crackling fire
A.boom = function () {
  if (!A.ctx || A.muted) return;
  const c = A.ctx, t0 = c.currentTime, o = c.createOscillator(), og = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(24, t0 + 1.2);
  og.gain.setValueAtTime(1, t0); og.gain.exponentialRampToValueAtTime(.001, t0 + 1.4); o.connect(og); og.connect(A.out); o.start(t0); o.stop(t0 + 1.5);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = A.nbuf; f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t0); f.frequency.exponentialRampToValueAtTime(180, t0 + 2.2);
  g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + 2.4); s.connect(f); f.connect(g); g.connect(A.out); s.start(t0); s.stop(t0 + 2.5);
  for (let i = 0; i < 40; i++) {
    const st = t0 + .3 + Math.random() * 4, cs = c.createBufferSource(), cf = c.createBiquadFilter(), cg = c.createGain();
    cs.buffer = A.nbuf; cf.type = 'highpass'; cf.frequency.value = 1500 + Math.random() * 2500;
    cg.gain.setValueAtTime(.12 * (1 - (st - t0) / 4.5), st); cg.gain.exponentialRampToValueAtTime(.0005, st + .04 + Math.random() * .05);
    cs.connect(cf); cf.connect(cg); cg.connect(A.out); cs.start(st, Math.random()); cs.stop(st + .12);
  }
};
// crowd cheer: swelling band-passed noise roar, a few rising "whoo" voices and scattered claps
A.cheer = function () {
  if (!A.ctx || A.muted) return;
  const c = A.ctx, t0 = c.currentTime + .02, dur = 6;
  const env = (g, peak, rise, hold) => {
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + rise);
    g.gain.setValueAtTime(peak, t0 + rise + hold); g.gain.exponentialRampToValueAtTime(.0008, t0 + dur);
  };
  const roar = (freq, Q, peak) => {
    const s = c.createBufferSource(); s.buffer = A.nbuf; s.loop = true; s.playbackRate.value = .7 + Math.random() * .6;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = Q;
    const g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 4 + Math.random() * 3; lg.gain.value = peak * .25; lfo.connect(lg); lg.connect(g.gain);
    env(g, peak, .5, 2.2); s.connect(f); f.connect(g); g.connect(A.out);
    s.start(t0); s.stop(t0 + dur + .1); lfo.start(t0); lfo.stop(t0 + dur + .1);
  };
  roar(650, .7, .3); roar(1500, .9, .26); roar(3000, 1.2, .1);
  for (let i = 0; i < 8; i++) {
    const st = t0 + .1 + Math.random() * 1.4, f0 = 200 + Math.random() * 220;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, st); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, st + .45); o.frequency.exponentialRampToValueAtTime(f0 * 1.1, st + 1.6);
    f.type = 'bandpass'; f.frequency.value = 800 + Math.random() * 500; f.Q.value = 1.4;
    g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(.05, st + .2); g.gain.exponentialRampToValueAtTime(.0008, st + 1.8);
    o.connect(f); f.connect(g); g.connect(A.out); o.start(st); o.stop(st + 1.9);
  }
  for (let i = 0; i < 38; i++) {
    const st = t0 + .3 + Math.random() * 4.2, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.nbuf; s.playbackRate.value = 1; f.type = 'highpass'; f.frequency.value = 1800 + Math.random() * 1500;
    const amp = .07 * (1 - (st - t0) / 5.5);
    g.gain.setValueAtTime(amp, st); g.gain.exponentialRampToValueAtTime(.0005, st + .06 + Math.random() * .05);
    s.connect(f); f.connect(g); g.connect(A.out); s.start(st, Math.random()); s.stop(st + .14);
  }
};
A.update = function (sim) {
  if (!A.ctx) return; const c = A.ctx, t = c.currentTime, S = .06;
  const v = sim.vel.length(), onGround = !sim.crashed && (sim.phase === 'ASCENT' || (sim.phase === 'LANDED' || sim.phase === 'DONE'));
  const thr = clamp((sim.thr[0] + sim.thr[1] + sim.thr[2] + sim.thr[3]) / (4 * P.Tmax), 0, 1);
  const drive = sim.phase === 'ASCENT' ? 1 : (sim.drive ? 1 : 0);
  A.o1.frequency.setTargetAtTime(70 + v * 9, t, S); A.o2.frequency.setTargetAtTime(140.5 + v * 18, t, S);
  A.mf.frequency.setTargetAtTime(500 + v * 45, t, S);
  A.mg.gain.setTargetAtTime(A.muted ? 0 : (onGround && sim.phase !== 'GRID' ? .05 + .07 * drive : 0), t, .1);
  A.jg.gain.setTargetAtTime(A.muted ? 0 : thr * .9, t, .05); A.jf.frequency.setTargetAtTime(700 + 1800 * thr, t, .05);
  A.wg.gain.setTargetAtTime(A.muted ? 0 : clamp(v / 45, 0, 1) * .25, t, .1); A.wf.frequency.setTargetAtTime(300 + v * 25, t, .1);
  A.pg.gain.setTargetAtTime(A.muted ? 0 : sim.purge * .7, t, .1);
};
})();
