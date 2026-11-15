// web.js — live player of the Babylon film for the web page (built into web/js/web.js by web-build.mjs).
// Picks a detail tier, boots the engine (main.js) behind a loading poster, compiles every shot once, then plays the
// film in real time: play / pause, a shot timeline, the film's preset and light-mode pills as buttons, and a free
// camera (drag, wheel, pinch). The engine stays deterministic: the page only chooses the film time and, for free
// look and pinned light, sets the film's override.
import MODULES, { OPT_IN } from './modules/index.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* storage blocked: the switch just starts at 0:00 */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
const frameWait = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const title = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---- detail tier --------------------------------------------------------------------------------------------------
const TIERS = {
  full: { q: 'final', maxDpr: 1.15, label: 'Full detail', short: 'Full', other: 'light',
    note: 'Full detail draws every house, palm, boat and person. It needs a recent graphics chip with about 3 GB of memory.' },
  light: { q: 'draft', maxDpr: 1, label: 'Light detail', short: 'Light', other: 'full',
    note: 'Light detail draws fewer people, palms and props and smaller textures, for phones and older computers.' },
};
function pickTier() {
  const h = (location.hash || '').replace('#', '');
  if (TIERS[h]) return h;
  const small = Math.min(screen.width || 0, screen.height || 0) < 820;
  return navigator.maxTouchPoints > 0 && small ? 'light' : 'full';
}
const tier = pickTier();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
window.BABYLON_FLAGS = { q: TIERS[tier].q, sub: 1, hud: 1, web: 1, maxDpr: TIERS[tier].maxDpr };

function switchTier() {
  const t = window.CTX && window.CTX.frame ? window.CTX.frame.t : 0;
  store.set('babylon-t', String(t));
  location.hash = TIERS[tier].other;
  location.reload();
}

// ---- loader -------------------------------------------------------------------------------------------------------
const L = { root: $('loader'), status: $('ld-status'), count: $('ld-count'), bar: $('ld-bar'), note: $('ld-note'), alt: $('ld-alt'), err: $('ld-err') };
L.note.textContent = TIERS[tier].note;
L.alt.textContent = `Use ${TIERS[TIERS[tier].other].label.toLowerCase()}`;
L.alt.addEventListener('click', switchTier);
const setProgress = (label, done, total) => {
  L.status.textContent = label;
  L.count.textContent = total ? `${done} of ${total}` : '';
  L.bar.style.transform = `scaleX(${total ? clamp(done / total, 0, 1) : 0})`;
};
function showBootError(msg) {
  L.root.classList.add('failed');
  L.status.textContent = 'Babylon could not start in this browser.';
  L.count.textContent = '';
  L.err.hidden = false;
  L.err.textContent = String(msg).split('\n').slice(0, 3).join('\n');
}

const SUBSYSTEMS = ['ground', 'materials', 'glazed', 'lighting', 'geom', 'water', 'layout', 'film', 'post'];
const SUB_LABEL = { ground: 'Laying out the ground', materials: 'Mixing the materials', glazed: 'Firing the glazed brick', lighting: 'Setting the sun and sky',
  geom: 'Preparing the brick kit', water: 'Filling the river', layout: 'Laying out the streets', film: 'Plotting the camera path', post: 'Setting up the lens' };
const MOD_LABEL = { terrain: 'Ploughing the fields', waterbodies: 'Cutting the moats and canals', walls: 'Raising the city walls', ishtar: 'Glazing the Ishtar Gate',
  streets: 'Paving the Processional Way', riverworks: 'Building the quays and the bridge', etemenanki: 'Stacking Etemenanki', southpalace: 'Building the South Palace',
  palaces: 'Building the palaces', esagila: 'Building Esagila', temples: 'Building the temples', houses: 'Building the houses', dressing: 'Setting out jars, ovens and looms',
  environs: 'Building the outer city', vegetation: 'Planting the palms', rivercraft: 'Launching the boats', people: 'Filling the streets', nightfx: 'Trimming the lamps',
  _massing: 'Finishing' };
const moduleNames = MODULES.filter((n) => !OPT_IN.includes(n));
const TOTAL_PARTS = SUBSYSTEMS.length + moduleNames.length;
function pollBoot() {
  const st = window.STATS;
  if (!st) { setProgress('Loading the engine', 0, TOTAL_PARTS); return; }
  const subsDone = Object.keys(st.subsystems || {}).length;
  const modsDone = (st.modules || []).filter((m) => m.status !== 'opt-in').length;
  const done = Math.min(TOTAL_PARTS, subsDone + modsDone);
  const label = subsDone < SUBSYSTEMS.length ? SUB_LABEL[SUBSYSTEMS[subsDone]] : (MOD_LABEL[moduleNames[modsDone]] || 'Finishing');
  setProgress(label, done, TOTAL_PARTS);
}

// ---- boot ---------------------------------------------------------------------------------------------------------
async function start() {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) { showBootError('This page needs WebGL 2, which this browser or device does not offer.'); return; }
  const canvas = $('c');
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; showFault(); });

  pollBoot();
  const poll = setInterval(pollBoot, 120);
  try { await import('./main.js'); } catch (e) { clearInterval(poll); showBootError(e && e.message ? e.message : e); return; }
  while (!window.READY && !window.BOOT_ERROR && !lost) await sleep(100);
  clearInterval(poll);
  if (window.BOOT_ERROR) { showBootError(window.BOOT_ERROR); return; }
  if (lost) return;

  const ctx = window.CTX, film = ctx.film, THREE = ctx.THREE;
  const shots = film.shots, D = film.duration - 1 / 120;
  const modeIds = Object.keys(ctx.world.lighting.modes);

  // Skip pre-rendering all 10 aerial/night shots at boot; warm up only the spawn view once ready
  setProgress('Preparing spawn view', 0, 1);
  await frameWait();
  setProgress('Ready', 1, 1);

  // ---- player & game state --------------------------------------------------------------------------------------
  const saved = Number(store.get('babylon-t')); store.del('babylon-t');
  let t = Number.isFinite(saved) && saved > 0 ? clamp(saved, 0, D) : (reduceMotion ? shots[0].mid : 0);
  let gameMode = true;
  let playing = false, ended = false, dirty = true, last = performance.now();
  let pinned = null;                                   // light mode pinned by the viewer, or null = the film's light
  const free = { on: false, pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, look: false };

  // Day-night cycle state (0..1 -> full 24h cycle over 150s at 1x, with an extended night phase)
  let dayTime = 0.10;
  let dayRunning = true;
  let daySpeed = 1;
  const DAY_CYCLE_SEC = 150;

  function dayNightSpec(u) {
    u = ((u % 1) + 1) % 1;
    if (u < 0.16) return { a: 'morning', b: 'afternoon', k: u / 0.16 };
    if (u < 0.34) return { a: 'afternoon', b: 'golden', k: (u - 0.16) / 0.18 };
    if (u < 0.50) return { a: 'golden', b: 'blue', k: (u - 0.34) / 0.16 };
    if (u < 0.88) return { a: 'blue', b: 'blue', k: 0 };
    return { a: 'blue', b: 'morning', k: (u - 0.88) / 0.12, wrapDawn: true };
  }
  function formatTimeOfDay(u) {
    u = ((u % 1) + 1) % 1;
    const h24 = (6.5 + u * 24) % 24;
    const hh = String(Math.floor(h24)).padStart(2, '0');
    const mm = String(Math.floor((h24 % 1) * 60)).padStart(2, '0');
    const phase = u < 0.14 ? 'Morning' : u < 0.30 ? 'Afternoon' : u < 0.40 ? 'Golden Hour' : u < 0.50 ? 'Dusk' : u < 0.88 ? 'Night' : 'Dawn';
    return `${hh}:${mm} · ${phase}`;
  }

  function applyOverride() {
    if (gameMode) return;
    const o = {};
    if (free.on) Object.assign(o, { pos: free.pos.toArray(), look: free.target.toArray(), fov: free.fov });
    if (pinned) o.mode = pinned;
    film.setOverride(Object.keys(o).length ? o : null);
    dirty = true;
  }

  // ---- transport & game HUD -------------------------------------------------------------------------------------
  const ui = $('ui'), playBtn = $('play'), timeEl = $('time'), tl = $('tl'), fill = $('tl-fill'), head = $('tl-head'), tip = $('tl-tip');
  const freeChip = $('free'), detailBtn = $('detail'), fsBtn = $('fs');
  const modeBtn = $('mode-btn'), gameHud = $('game-hud'), gameKeys = $('game-keys'), gameLandmarks = $('game-landmarks');
  const todLabel = $('tod-label'), todSlider = $('tod-slider'), todPlay = $('tod-play'), todSpeed = $('tod-speed');
  const octStats = $('oct-stats'), octToggle = $('oct-toggle'), glideBtn = $('glide-btn');
  const hudRoot = $('hud');
  ui.hidden = false;

  // Populate landmark teleport pills
  if (ctx.player && gameLandmarks) {
    for (const lm of ctx.player.landmarks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'txt';
      b.textContent = lm.name;
      b.addEventListener('click', () => { ctx.player.teleport(lm); });
      gameLandmarks.appendChild(b);
    }
  }

  const isTouchDevice = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  const touchControls = $('touch-controls');
  const resBtn = $('res-btn');
  const RES_SCALES = [1.0, 0.75, 0.5, 1.25];
  const savedRes = Number(store.get('babylon-res'));
  let resScale = RES_SCALES.includes(savedRes) ? savedRes : (isTouchDevice ? 0.75 : 1.0);
  if (resBtn) {
    const syncResBtn = () => { resBtn.textContent = `${Math.round(resScale * 100)}%`; };
    syncResBtn();
    resBtn.addEventListener('click', () => {
      const idx = RES_SCALES.indexOf(resScale);
      resScale = RES_SCALES[(idx + 1) % RES_SCALES.length];
      store.set('babylon-res', String(resScale));
      syncResBtn();
      applySize();
    });
  }

  function syncModeUi() {
    if (ctx.player) ctx.player.setActive(gameMode);
    if (hudRoot) hudRoot.hidden = gameMode;
    if (gameHud) gameHud.hidden = !gameMode;
    if (gameKeys) gameKeys.hidden = !gameMode || isTouchDevice;
    if (touchControls) touchControls.hidden = !gameMode || !isTouchDevice;
    if (gameLandmarks) gameLandmarks.hidden = !gameMode;
    document.querySelectorAll('.film-only').forEach((el) => { el.hidden = gameMode; });
    document.querySelectorAll('.game-only').forEach((el) => { el.hidden = !gameMode; });
    if (modeBtn) {
      modeBtn.textContent = gameMode ? 'Film Mode' : '3rd Person';
      modeBtn.classList.toggle('on', !gameMode);
    }
    if (gameMode) {
      playing = false;
      free.on = false;
      freeChip.hidden = true;
      document.body.classList.remove('idle');
    } else {
      applyOverride();
    }
    dirty = true;
  }

  if (modeBtn) modeBtn.addEventListener('click', () => { gameMode = !gameMode; syncModeUi(); });
  if (todSlider) todSlider.addEventListener('input', () => { dayTime = Number(todSlider.value) / 1000; });
  if (todPlay) todPlay.addEventListener('click', () => {
    dayRunning = !dayRunning;
    todPlay.textContent = dayRunning ? 'Pause Sun' : 'Resume Sun';
  });
  if (todSpeed) todSpeed.addEventListener('click', () => {
    daySpeed = daySpeed === 1 ? 4 : daySpeed === 4 ? 12 : 1;
    todSpeed.textContent = `${daySpeed}x`;
  });
  if (octToggle && ctx.octree) octToggle.addEventListener('click', () => {
    ctx.octree.state.enabled = !ctx.octree.state.enabled;
    ctx.octree.state.occlusionEnabled = ctx.octree.state.enabled;
    if (!ctx.octree.state.enabled) ctx.octree.restore();
    octToggle.textContent = ctx.octree.state.enabled ? 'Octree On' : 'Octree Off';
    octToggle.classList.toggle('on', ctx.octree.state.enabled);
  });
  if (glideBtn && ctx.player) glideBtn.addEventListener('click', () => {
    ctx.player.state.glide = !ctx.player.state.glide;
    if (ctx.player.state.glide) {
      ctx.player.state.vel.y = 0;
      const gy = ctx.ground.height(ctx.player.state.pos.x, ctx.player.state.pos.z);
      if (ctx.player.state.pos.y <= gy + 0.5) ctx.player.state.pos.y = gy + 2.2;
      ctx.player.state.onGround = false;
    }
    glideBtn.classList.toggle('on', ctx.player.state.glide);
    glideBtn.textContent = ctx.player.state.glide ? 'Flying' : 'Fly';
  });
  detailBtn.querySelector('.long').textContent = TIERS[tier].label;
  detailBtn.querySelector('.short').textContent = TIERS[tier].short;
  detailBtn.title = `Switch to ${TIERS[TIERS[tier].other].label.toLowerCase()} (reloads the page)`;
  detailBtn.addEventListener('click', switchTier);

  const segs = $('tl-segs');
  for (const s of shots) {
    const seg = document.createElement('i');
    seg.style.left = `${(s.tHold / film.duration) * 100}%`;
    seg.style.width = `${((s.t1 - s.tHold) / film.duration) * 100}%`;
    segs.append(seg);
  }
  const shotIndexAt = (time) => { let k = 0; for (let i = 0; i < shots.length; i++) if (shots[i].tIn <= time + 1e-6) k = i; return k; };

  function syncPlay() {
    playBtn.dataset.state = playing ? 'pause' : ended ? 'replay' : 'play';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : ended ? 'Play again' : 'Play');
    playBtn.title = playing ? 'Pause (Space)' : ended ? 'Play again (Space)' : 'Play (Space)';
  }
  function play() {
    if (free.on) exitFree();
    if (ended || t >= D - 1e-3) { t = 0; ended = false; }
    playing = true; last = performance.now(); syncPlay(); wake();
  }
  function pause() { playing = false; syncPlay(); wake(); }
  const togglePlay = () => (playing ? pause() : play());
  playBtn.addEventListener('click', togglePlay);

  function seek(time) { t = clamp(time, 0, D); ended = false; dirty = true; syncPlay(); }
  function gotoShot(i) { if (free.on) exitFree(); seek(shots[clamp(i, 0, shots.length - 1)].tHold); wake(); }
  function stepShot(dir) {
    const k = shotIndexAt(t);
    if (dir > 0) gotoShot(k + 1);
    else gotoShot(t - shots[k].tHold > 1.5 ? k : k - 1);
  }

  let lastText = '';
  function syncUi() {
    const k = t / film.duration;
    fill.style.transform = `scaleX(${k})`;
    head.style.left = `${k * 100}%`;
    const text = `${fmt(t)} / ${fmt(film.duration)}`;
    if (text !== lastText) {
      lastText = text; timeEl.textContent = text;
      tl.setAttribute('aria-valuenow', String(Math.round(t)));
      tl.setAttribute('aria-valuetext', `${fmt(t)}, ${title(shots[shotIndexAt(t)].name)}`);
    }
  }

  // timeline: click or drag to scrub, arrows to step, hover for the shot name
  const timeAtX = (x) => { const r = tl.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1) * film.duration; };
  let scrub = null;
  tl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    tl.setPointerCapture(e.pointerId);
    scrub = { wasPlaying: playing };
    playing = false; if (free.on) exitFree();
    seek(timeAtX(e.clientX));
  });
  tl.addEventListener('pointermove', (e) => {
    const time = timeAtX(e.clientX);
    if (scrub) seek(time);
    const r = tl.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = `${title(shots[shotIndexAt(time)].name)} · ${fmt(time)}`;
    tip.style.left = `${clamp(e.clientX - r.left, 40, r.width - 40)}px`;
  });
  const endScrub = () => { if (!scrub) return; const w = scrub.wasPlaying; scrub = null; if (w) play(); else syncPlay(); };
  tl.addEventListener('pointerup', endScrub);
  tl.addEventListener('pointercancel', endScrub);
  tl.addEventListener('pointerleave', () => { if (!scrub) tip.hidden = true; });
  tl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    const map = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 };
    if (e.key in map) { e.preventDefault(); e.stopPropagation(); if (free.on) exitFree(); seek(t + map[e.key]); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); if (free.on) exitFree(); seek(e.key === 'Home' ? 0 : D); }
  });

  // the film's own bar: preset pills jump to a shot, mode pills pin a light (click the pinned one again to release it)
  const bar = document.querySelector('#hud .bar');
  const presetPills = [...document.querySelectorAll('#hud .presets .pill')];
  const modePills = [...document.querySelectorAll('#hud .modes .pill')];
  const asButton = (el, label, fn) => {
    el.setAttribute('role', 'button'); el.tabIndex = 0; el.title = label;
    el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn(); } });
  };
  presetPills.forEach((p, i) => asButton(p, `Go to the ${title(shots[i].name)} shot`, () => gotoShot(i)));
  function syncPinned() {
    if (bar) bar.toggleAttribute('data-pinned', !!pinned);
    modePills.forEach((p, i) => {
      const id = modeIds[i];
      p.title = pinned === id ? `Back to the film's own light` : `Hold the light at ${id}`;
      p.setAttribute('aria-pressed', String(pinned === id));
    });
  }
  modePills.forEach((p, i) => asButton(p, '', () => { const id = modeIds[i]; pinned = pinned === id ? null : id; applyOverride(); syncPinned(); wake(); }));
  syncPinned();

  // ---- free look ------------------------------------------------------------------------------------------------
  // Near the ground the camera turns in place (look around); higher up it orbits what the shot was looking at.
  const groundAt = (x, z) => (ctx.ground && typeof ctx.ground.height === 'function' ? Math.max(ctx.ground.height(x, z), -3) : 0);
  const sph = new THREE.Spherical(), off = new THREE.Vector3(), dir = new THREE.Vector3(), right = new THREE.Vector3(), fwd = new THREE.Vector3();
  function enterFree() {
    if (free.on) return;
    const p = ctx.frame.camera;
    free.pos.fromArray(p.pos);
    dir.fromArray(p.look).sub(free.pos);
    const dist = clamp(dir.length(), 5, 1200);
    dir.normalize();
    free.look = free.pos.y - groundAt(free.pos.x, free.pos.z) < 40;
    free.target.copy(free.pos).addScaledVector(dir, free.look ? 30 : dist);
    free.fov = p.fov;
    free.on = true; playing = false; syncPlay();
    freeChip.hidden = false;
    applyOverride(); wake();
  }
  function exitFree() {
    if (!free.on) return;
    free.on = false; freeChip.hidden = true;
    applyOverride();
  }
  function keepAboveGround(v, min) { const g = groundAt(v.x, v.z) + min; if (v.y < g) v.y = g; }
  function rotate(dx, dy) {
    const k = (Math.PI * 0.9) / Math.max(320, innerHeight);
    if (free.look) {                                   // turn the view around the camera
      off.copy(free.target).sub(free.pos); sph.setFromVector3(off);
      sph.theta -= dx * k; sph.phi = clamp(sph.phi - dy * k, 0.15, Math.PI - 0.15);
      free.target.copy(free.pos).add(off.setFromSpherical(sph));
    } else {                                           // orbit the camera around the target
      off.copy(free.pos).sub(free.target); sph.setFromVector3(off);
      sph.theta -= dx * k; sph.phi = clamp(sph.phi - dy * k, 0.05, 1.62);
      free.pos.copy(free.target).add(off.setFromSpherical(sph));
      keepAboveGround(free.pos, 2);
    }
    applyOverride();
  }
  function dolly(f) {                                  // f > 1 backs away, f < 1 moves in
    if (free.look) {
      dir.copy(free.target).sub(free.pos).normalize();
      const step = (f - 1) * -12;
      free.pos.addScaledVector(dir, step); free.target.addScaledVector(dir, step);
      keepAboveGround(free.pos, 1.6);
    } else {
      off.copy(free.pos).sub(free.target);
      const len = clamp(off.length() * f, 8, 9000);
      free.pos.copy(free.target).add(off.setLength(len));
      keepAboveGround(free.pos, 2);
    }
    applyOverride();
  }
  function pan(dx, dy) {                               // slide over the ground plane
    fwd.copy(free.target).sub(free.pos); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize(); right.set(-fwd.z, 0, fwd.x);
    const s = Math.max(0.05, free.pos.distanceTo(free.target) * (free.look ? 0.02 : 1)) * (1.6 / Math.max(320, innerHeight));
    const move = right.multiplyScalar(-dx * s).addScaledVector(fwd, dy * s);
    free.pos.add(move); free.target.add(move);
    keepAboveGround(free.pos, free.look ? 1.6 : 2);
    applyOverride();
  }
  const pointers = new Map();
  let drag = null, pinch = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (gameMode) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 2 || e.shiftKey };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    wake();
  });
  canvas.addEventListener('pointermove', (e) => {
    wake();
    if (gameMode) return;
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) { enterFree(); dolly(pinch / d); }
      pinch = d; return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    if (!drag.moved) { drag.moved = true; enterFree(); }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (drag.pan) pan(dx, dy); else rotate(dx, dy);
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; if (!pointers.size) drag = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (gameMode) return; e.preventDefault(); enterFree(); dolly(Math.exp(clamp(e.deltaY, -200, 200) * 0.0015)); wake(); }, { passive: false });
  $('back').addEventListener('click', () => { exitFree(); play(); });

  // ---- keys -----------------------------------------------------------------------------------------------------
  addEventListener('keydown', (e) => {
    if (gameMode || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target, onControl = el && el.closest && el.closest('button, [role="button"], [role="slider"]');
    if (e.key === ' ' && !onControl) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' && !onControl) { e.preventDefault(); stepShot(1); }
    else if (e.key === 'ArrowLeft' && !onControl) { e.preventDefault(); stepShot(-1); }
    else if (e.key === 'Escape' && free.on) exitFree();
    wake();
  });

  // ---- full screen, size, idle --------------------------------------------------------------------------------
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => { fsBtn.hidden = true; });
  });
  document.addEventListener('fullscreenchange', () => { fsBtn.dataset.state = document.fullscreenElement ? 'exit' : 'enter'; fsBtn.setAttribute('aria-label', document.fullscreenElement ? 'Leave full screen' : 'Full screen'); });

  // ---- mobile touch joystick & action buttons -------------------------------------------------------------------
  const joyZone = $('joy-zone'), joyKnob = $('joy-knob');
  if (joyZone && joyKnob && ctx.player) {
    let joyPtr = null;
    const maxR = 40;
    const updateJoy = (cx, cy) => {
      const r = joyZone.getBoundingClientRect();
      const dx = cx - (r.left + r.width * 0.5);
      const dy = cy - (r.top + r.height * 0.5);
      const d = Math.hypot(dx, dy);
      const k = d > maxR ? maxR / d : 1;
      const nx = dx * k, ny = dy * k;
      joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;
      ctx.player.setTouchInput({ moveX: -nx / maxR, moveY: -ny / maxR });
    };
    joyZone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      joyPtr = e.pointerId;
      if (joyZone.setPointerCapture) try { joyZone.setPointerCapture(e.pointerId); } catch {}
      updateJoy(e.clientX, e.clientY);
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyPtr) return;
      e.preventDefault(); e.stopPropagation();
      updateJoy(e.clientX, e.clientY);
    });
    const endJoy = (e) => {
      if (e.pointerId !== joyPtr) return;
      joyPtr = null;
      joyKnob.style.transform = 'translate(0px, 0px)';
      ctx.player.setTouchInput({ moveX: 0, moveY: 0 });
    };
    joyZone.addEventListener('pointerup', endJoy);
    joyZone.addEventListener('pointercancel', endJoy);

    const bindHold = (id, key) => {
      const el = $(id); if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); ctx.player.setTouchInput({ [key]: true }); });
      const off = (e) => { e.stopPropagation(); el.classList.remove('on'); ctx.player.setTouchInput({ [key]: false }); };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
    };
    bindHold('tb-laser', 'laser');
    bindHold('tb-down', 'descend');
    const tbPunch = $('tb-punch');
    if (tbPunch) tbPunch.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ctx.player.triggerPunch(); });
    const tbUp = $('tb-up');
    if (tbUp) {
      tbUp.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        tbUp.classList.add('on');
        if (ctx.player.state.glide) ctx.player.setTouchInput({ ascend: true });
        else ctx.player.triggerJump();
      });
      const offUp = (e) => { e.stopPropagation(); tbUp.classList.remove('on'); ctx.player.setTouchInput({ ascend: false }); };
      tbUp.addEventListener('pointerup', offUp);
      tbUp.addEventListener('pointercancel', offUp);
    }
    const tbBoost = $('tb-boost');
    let touchBoost = false;
    if (tbBoost) tbBoost.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      touchBoost = !touchBoost;
      tbBoost.classList.toggle('on', touchBoost);
      ctx.player.setTouchInput({ boost: touchBoost });
    });
    const tbFly = $('tb-fly');
    if (tbFly) tbFly.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      ctx.player.toggleFlight();
      tbFly.classList.toggle('on', ctx.player.state.glide);
    });
  }

  let rz = 0;
  function applySize() {
    const w = innerWidth, h = innerHeight;
    const baseDpr = Math.min(devicePixelRatio || 1, TIERS[tier].maxDpr);
    const dpr = clamp(baseDpr * resScale, 0.4, 2.0);
    if (w === ctx.size.width && h === ctx.size.height && dpr === ctx.size.dpr) return;
    Object.assign(ctx.size, { width: w, height: h, dpr });
    ctx.post.setSize(w, h, dpr);
    dirty = true;
  }
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(applySize, 120); });
  applySize();

  let idleTimer = 0;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (playing && !scrub && !ui.contains(document.activeElement)) document.body.classList.add('idle');
    }, 3200);
  }
  ui.addEventListener('pointermove', wake);
  ui.addEventListener('focusin', wake);

  // ---- fault ----------------------------------------------------------------------------------------------------
  function showFault() {
    const f = $('fault');
    f.hidden = false;
    $('fault-msg').textContent = tier === 'full'
      ? 'The graphics chip ran out of memory at full detail. Light detail needs much less.'
      : 'The graphics chip stopped drawing the scene. Reloading the page usually brings it back.';
    const b = $('fault-btn');
    b.textContent = tier === 'full' ? 'Reload in light detail' : 'Reload';
    b.onclick = () => (tier === 'full' ? switchTier() : location.reload());
  }

  // ---- loop -----------------------------------------------------------------------------------------------------
  let hudTick = 0;
  let streamingBusy = false;
  let nextStreamAt = performance.now() + 600;
  const totalStreamCount = ctx.streamRemainingCount ? ctx.streamRemainingCount() : 0;

  function stepStreaming(now, dt) {
    if (streamingBusy || !ctx.streamStep) return;
    const pendingFin = ctx.geom.hasPendingFinalize && ctx.geom.hasPendingFinalize();
    const remMod = ctx.streamRemainingCount ? ctx.streamRemainingCount() : 0;
    if (!pendingFin && remMod <= 0) return;

    if (pendingFin) {
      // Micro-job finalize: ~4ms slice per frame (skip if previous frame was heavy)
      if (dt > 0.036 && now < nextStreamAt) return;
      streamingBusy = true;
      ctx.streamStep(4.0).then((res) => {
        if (res && res.remaining === 0) {
          nextStreamAt = performance.now() + 260;
          if (ctx.streamRemainingCount() === 0 && window.STATS && window.STATS.bootProfile) {
            console.info('[engine] all streamed modules loaded:', JSON.stringify(window.STATS.bootProfile.streamedModules));
          }
        }
      }).finally(() => {
        streamingBusy = false;
        if (!gameMode) dirty = true;
      });
      return;
    }

    if (now < nextStreamAt) return;
    if (dt > 0.032 && now < nextStreamAt + 1200) return;
    streamingBusy = true;
    ctx.streamStep(4.0).then((res) => {
      const cost = res ? (res.ms || 60) : 60;
      nextStreamAt = performance.now() + Math.max(300, Math.min(2000, cost * 2.0));
    }).catch(() => {
      nextStreamAt = performance.now() + 500;
    }).finally(() => {
      streamingBusy = false;
      if (!gameMode) dirty = true;
    });
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (lost) return;
    const dt = clamp((now - last) / 1000, 0, 0.1);
    last = now;
    stepStreaming(now, dt);
    if (gameMode && ctx.player) {
      ctx.animTime = (ctx.animTime || 0) + dt;
      if (dayRunning) {
        dayTime = (dayTime + (dt * daySpeed) / DAY_CYCLE_SEC) % 1;
      }
      const pose = ctx.player.update(dt);
      if (pose) {
        film.setOverride({
          pos: pose.pos,
          look: pose.look,
          fov: pose.fov,
          mode: dayNightSpec(dayTime),
        });
      }
      window.renderAt(t);
      hudTick += dt;
      if (hudTick >= 0.15) {
        hudTick = 0;
        if (todLabel) todLabel.textContent = formatTimeOfDay(dayTime);
        if (todSlider && document.activeElement !== todSlider) todSlider.value = String(Math.round(dayTime * 1000));
        if (glideBtn) {
          glideBtn.classList.toggle('on', ctx.player.state.glide);
          glideBtn.textContent = ctx.player.state.glide ? 'Flying' : 'Fly';
        }
        if (octStats && ctx.octree) {
          const os = ctx.octree.state;
          const rem = ctx.streamRemainingCount ? ctx.streamRemainingCount() : 0;
          const streamStr = rem > 0 && totalStreamCount > 0 ? ` · Streaming: ${totalStreamCount - rem}/${totalStreamCount}` : '';
          octStats.textContent = os.enabled
            ? `Octree: ${os.visibleMeshes}/${os.totalMeshes} (Occ: ${os.occludedMeshes}) · LOD: ${ctx.octree.lodScale.toFixed(2)}x · ${os.fps} FPS${streamStr}`
            : `Octree: Off (${os.totalMeshes}) · LOD: 1.00x · ${os.fps} FPS${streamStr}`;
        }
      }
      return;
    }
    if (playing) {
      t += dt; dirty = true;
      if (t >= D) { t = D; playing = false; ended = true; syncPlay(); wake(); }
    }
    if (dirty) { dirty = false; window.renderAt(t); syncUi(); }
  }
  syncModeUi();
  syncPlay();
  if (gameMode && ctx.player) {
    const pose = ctx.player.update(0);
    if (pose) film.setOverride({ pos: pose.pos, look: pose.look, fov: pose.fov, mode: dayNightSpec(dayTime) });
    window.renderAt(t);
  } else {
    window.renderAt(t); syncUi();
  }
  L.root.classList.add('done');
  setTimeout(() => { L.root.hidden = true; }, reduceMotion ? 0 : 900);
  wake();
  last = performance.now();
  requestAnimationFrame(loop);
  window.PLAYER = { get t() { return t; }, seek, play, pause, gotoShot, get playing() { return playing; }, get free() { return free.on; }, get pinned() { return pinned; }, get gameMode() { return gameMode; }, get dayTime() { return dayTime; } };
}

start().catch((e) => showBootError(e && e.stack ? e.stack : e));
