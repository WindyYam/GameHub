/* MAIN — build the scene, run the show loop, input */
(function () {
'use strict';
const NA = window.NA, P = NA.P, T = NA.track, scene = NA.scene, V3 = NA.V3, { clamp, smooth } = NA.M;
const SX = [1, 1, -1, -1], SZ = [-1, 1, -1, 1];
const Q = new URLSearchParams(location.search);

// ---- one-time build ----
const rh = NA.rehearse();
console.log('[rehearsal]', 'launch speed ' + (rh.vLaunch || 0).toFixed(1) + ' m/s', 'apex y ' + (rh.maxAlt || 0).toFixed(1) + ' m',
  'flight ' + (rh.tFlight || 0).toFixed(1) + ' s', 'tank left ' + (rh.airLeft * 100).toFixed(0) + '%',
  'land', rh.land.x.toFixed(1), rh.land.z.toFixed(1), 'heading', (rh.heading * 57.3).toFixed(1) + '°', 'impact vy', rh.landVel ? rh.landVel.y.toFixed(2) : '-');
T.build(scene);
NA.world.build(rh);
const car = NA.buildCar(); scene.add(car.root);
NA.fx.build();
NA.director.init(rh);

let sim = new NA.Sim({ manual: isManual() });
let timeScale = 1, paused = false, fadeT = 0, fadeDir = 0, restartAt = -1;
let lastCount = '', hudOn = true;
const speedSlider = document.getElementById('speedSlider'), speedVal = document.getElementById('speedVal'), speedCtl = document.getElementById('speedCtl');
const applySpeed = () => { P.vCruise = speedSlider.value / 3.6; speedVal.textContent = speedSlider.value; };
speedSlider.addEventListener('input', applySpeed);
speedSlider.addEventListener('change', () => speedSlider.blur());
applySpeed();
const tmpCol = new THREE.Color(), invM = new THREE.Matrix4();
const ex = V3();

// ---- manual mode: Q E A D = front-left, front-right, rear-left, rear-right nozzle (keyboard or on-screen buttons) ----
const ENGINE_KEYS = { q: 0, e: 1, a: 2, d: 3 };
const keyDown = [false, false, false, false], padDown = [false, false, false, false];
const modeBtn = document.getElementById('modeBtn'), engBtns = [...document.querySelectorAll('.eng')];
function isManual() {
  const p = Q.get('manual');
  if (p !== null) return p === '1';
  try { return localStorage.getItem('neonAscentManual') === '1'; } catch (e) { return false; }
}
function syncModeUi() {
  document.body.classList.toggle('manual', sim.manual);
  modeBtn.textContent = sim.manual ? 'Manual · Q E A D' : 'Auto pilot';
  modeBtn.classList.toggle('on', sim.manual);
}
function setManual(on) {
  if (on === sim.manual) return;
  try { localStorage.setItem('neonAscentManual', on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  keyDown.fill(false); padDown.fill(false);
  resetShow(on);
}
modeBtn.addEventListener('click', () => { setManual(!sim.manual); modeBtn.blur(); });
engBtns.forEach(b => {
  const i = +b.dataset.i;
  const set = v => { padDown[i] = v; b.classList.toggle('down', v); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); NA.director.audio.init(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
});
addEventListener('blur', () => { keyDown.fill(false); padDown.fill(false); engBtns.forEach(b => b.classList.remove('down')); });

function resetShow(manual = sim.manual) {
  sim = new NA.Sim({ manual }); lastCount = '';
  car.setWreck(false); syncModeUi();
  for (let i = 0; i < 4; i++) { car.wheels[i].children[0].rotation.z = 0; }
  NA.fx.clear && NA.fx.clear(); NA.world.resetShow();
  NA.director.rig = '';
  fadeDir = -1; restartAt = -1;
}
syncModeUi();

function tick(dt, render) {
  const S = NA.shared, t = performance.now() / 1000;
  const sdt = paused ? 0 : dt * timeScale;
  // countdown & start
  let count = '';
  if (sim.phase === 'GRID') {
    const c = sim.t;
    if (c >= 1) NA.startLamps[0].material.color.setHex(0xff1a1a).multiplyScalar(2.4);
    if (c >= 2) NA.startLamps[1].material.color.setHex(0xff1a1a).multiplyScalar(2.4);
    if (c >= 3) NA.startLamps[2].material.color.setHex(0xff1a1a).multiplyScalar(2.4);
    count = c < 1 ? '' : c < 2 ? '3' : c < 3 ? '2' : c < 4 ? '1' : '';
    if (c >= 4) { NA.startLamps.forEach(l => l.material.color.setHex(0x20ff60).multiplyScalar(2.4)); sim.go(); }
  } else if (sim.t < 4.9 && sim.phase === 'ASCENT') count = 'GO';
  if (count !== lastCount) {
    if (count === '3' || count === '2' || count === '1') NA.director.audio.beep(520, .2);
    if (count === 'GO') NA.director.audio.beep(1040, .5, .3);
    lastCount = count;
  }
  if (sim.manual) for (let i = 0; i < 4; i++) sim.input[i] = keyDown[i] || padDown[i] ? 1 : 0;
  sim.advance(sdt);
  speedCtl.classList.toggle('locked', !(sim.phase === 'GRID' || sim.phase === 'ASCENT'));
  const ev = sim.events;
  if (ev.crash) { NA.fx.explode(ev.crash.pos, ev.crash.vel); NA.director.audio.boom(); car.setWreck(true); ev.crash = null; }
  if (ev.touchdown) { ev.touchdown = false; NA.fx.burst(); NA.director.audio.thump(); }
  if (ev.stack) { NA.world.placeStack(ev.stack); ev.stack = null; }
  if (ev.jump) { ev.jump = false; NA.director.audio.thump(.5); }
  if (ev.cheer) { ev.cheer = false; NA.director.audio.cheer(); }
  if (ev.launched) { ev.launched = false; }
  if (ev.done) { ev.done = false; fadeDir = 1; restartAt = performance.now() + 1700; }

  // ---- car visuals ----
  car.root.position.copy(sim.pos); car.root.quaternion.copy(sim.q);
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    w.position.set(SX[i] * P.wbHalf, P.yA - sim.L[i], SZ[i] * P.trackHalf);
    w.children[0].rotation.z = -sim.wheelA[i];
  }
  car.root.updateMatrixWorld(true);
  S.uTime.value += sdt; NA.post.uTime.value = t;
  const sNeon = sim.s;
  NA.neonColor(sNeon, S.uTime.value, tmpCol, .55);
  NA.carMat.neon.color.copy(tmpCol).multiplyScalar(3.2);
  car.hueTop.color.copy(tmpCol);
  NA.neonColor(sNeon + 160, S.uTime.value, car.hueLow.color, .55);
  S.uGlow.value.copy(car.hueLow.color).multiplyScalar(.5);
  S.uCarInv.value.copy(invM.copy(car.root.matrixWorld).invert());
  S.uCarPos.value.copy(sim.pos);
  ex.set(1, 0, 0).applyQuaternion(sim.q); S.uCarFwd.value.copy(ex);
  if (NA.fx.wreck()) NA.fx.wreckLight(S.uCarPos.value, S.uGlow.value);
  NA.world.update(S.uTime.value, NA.camera);
  NA.world.updateShow(sdt, sim);
  NA.fx.update(sdt, sim, car, S.uTime.value);
  NA.director.update(dt, sim);
  NA.director.updateHud(dt, sim, count);
  NA.director.audio.update(sim);
  NA.world.update(S.uTime.value, NA.camera);

  // fade handling
  if (fadeDir !== 0) {
    fadeT = clamp(fadeT + fadeDir * dt / 1.2, 0, 1);
    NA.post.uFade.value = fadeT; if ((fadeDir > 0 && fadeT >= 1) || (fadeDir < 0 && fadeT <= 0)) fadeDir = 0;
  }
  if (restartAt > 0 && performance.now() > restartAt) resetShow();
  if (render) NA.renderFrame();
}

// fast-forward for testing / sharing a moment: ?t=seconds
const skip = parseFloat(Q.get('t')) || 0;
if (Q.get('hud') === '0') { hudOn = false; document.getElementById('hud').classList.add('off'); }
for (let i = 0; i < skip * 30 && sim.t < skip + 100; i++) { tick(1 / 30, false); if (sim.t >= skip) break; }
if (Q.get('hold')) paused = true;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05); last = now;
  tick(dt, true);
}
requestAnimationFrame(frame);
NA.debug = { sim: () => sim, pause: b => { paused = b; }, scale: s => { timeScale = s; }, setManual, press: (i, v) => { keyDown[i] = !!v; }, tick: (dt, n = 1) => { for (let i = 0; i < n; i++) tick(dt, i === n - 1); },
  cam: (dx, dy, dz, fov = 34) => { NA.camera.fov = fov; NA.camera.updateProjectionMatrix(); NA.camera.position.set(sim.pos.x + dx, sim.pos.y + dy, sim.pos.z + dz); } };
document.getElementById('loading').classList.add('gone');

// ---- input ----
addEventListener('keydown', e => {
  NA.director.audio.init();
  const k = e.key.toLowerCase();
  if (k in ENGINE_KEYS && !e.ctrlKey && !e.metaKey && !e.altKey) { keyDown[ENGINE_KEYS[k]] = true; e.preventDefault(); return; }
  if (k === ' ') { paused = !paused; e.preventDefault(); }
  else if (k === 'r') { resetShow(); }
  else if (k === 'c') { setManual(!sim.manual); }
  else if (k === 't') { timeScale = timeScale === 1 ? .25 : timeScale === .25 ? 2 : 1; }
  else if (k === 'm') { NA.director.audio.muted = !NA.director.audio.muted; }
  else if (k === 'h') { hudOn = !hudOn; document.getElementById('hud').classList.toggle('off', !hudOn); }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k in ENGINE_KEYS) keyDown[ENGINE_KEYS[k]] = false; });
addEventListener('pointerdown', () => NA.director.audio.init());
})();
