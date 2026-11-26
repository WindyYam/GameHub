"use strict";
// ---------------------------------------------------------------- 拍照: the moment held dead still, and the lens in the player's own hands
// Asked by the owner (2026-11-15): from the pause menu, a photo mode. Everything stops where it is (the skier, the snow in the air, the
// thrown spray, the weather, the clouds, the animals: nothing of the world steps, its clock App.t stands), the menu and every word on
// screen go, and the player moves the lens freely round the scene, turns it, zooms, and takes the picture.
// The chase camera's own rule (it never changes angle by itself) is untouched: this lens moves only while the player moves it, and on the
// way out the game's camera is put back exactly where it was.
// How the world is stopped: the main loop hands its frames here instead of to tick() (App.photoFrame, 99_main.js). Each frame only the lens
// is set and the picture drawn again: what depends on where the lens stands (the terrain's detail round it, which trees are meshes, which
// cards, which are in view) is brought up to date with no time passing (dt 0), and the motion blur is off (Render: dt 0 draws none).
// The picture saved is the canvas alone, read in the same frame it was drawn: no menu, no words, no buttons are ever in it.
//   keyboard + mouse   drag to look · W A S D / arrows to move · Q E down / up · Shift faster · wheel or - = to zoom · Z C tilt the horizon
//                      · R back to where it started · H hide these words · Enter or P to take the picture · Esc back to the menu
//   phone (landscape)  drag on the right to look · the stick on the left to move · ▲ ▼ up / down · two fingers to zoom · the round button
//                      to take the picture; the picture is shown, 保存 puts it in the phone's photos (the system's share sheet), or press and
//                      hold it. Inside 小红书 it goes straight to the album.
const Photo = self.Photo = (() => {
  const P = { on: false, shots: 0 };
  const T = s => I18N.t(s);
  const REACH = 60;                         // the farthest the lens may go from the skier (m): the scene is made round the skier, not the whole mountain
  const GROUND = 0.3;                       // the least it keeps above the snow (m)
  const FOV = [0.18, 1.75];
  let el = null, saved = null, cam = null, start = null, busy = false, want = false, toastT = 0, hideW = false;
  const keys = {}, ptr = new Map();
  let stick = null, look = null, pinch = null, vbtn = 0;

  // ---- the lens: where it stands, which way it looks (yaw from -z toward +x, pitch above the horizon), its tilt and its field of view
  const fwd = c => [Math.sin(c.yaw) * Math.cos(c.pit), Math.sin(c.pit), -Math.cos(c.yaw) * Math.cos(c.pit)];
  function fromRender() {
    const c = Render.cam, f = c.fwd;
    return { pos: c.pos.slice(), yaw: Math.atan2(f[0], -f[2]), pit: Math.asin(clamp(f[1], -1, 1)), roll: 0, fov: clamp(c.fovY, FOV[0], FOV[1]), v: [0, 0, 0], ty: 0, tp: 0 };
  }
  function keepIn(p) {
    const s = Game.root.pos, dx = p[0] - s[0], dy = p[1] - s[1], dz = p[2] - s[2], d = Math.hypot(dx, dy, dz);
    if (d > REACH) { const k = REACH / d; p[0] = s[0] + dx * k; p[1] = s[1] + dy * k; p[2] = s[2] + dz * k; }
    // (the snow round the lens, not only under it: 0.3 m over a 40-degree slope is less than the near corners of the picture reach, and they went in)
    const h = Course.snowTop(p[0], p[2]) + GROUND; if (p[1] < h) p[1] = h;
    return p;
  }
  

  // ---- in and out
  P.can = () => !P.on && typeof UI !== 'undefined' && (UI.open) && !UI.gone && !App.swapping && App.ready && !(App.gfx && App.gfx.lost) && !(typeof XR !== 'undefined' && XR.active);
  P.enter = function () {
    if (!P.can()) return false;
    if (!el) build();
    
    const c = Render.cam, F = typeof Fpv !== 'undefined' ? Fpv : null;
    saved = { pos: c.pos.slice(), fwd: c.fwd.slice(), up: c.up.slice(), right: c.right.slice(), fovY: c.fovY, near: c.near, roll: c.roll,
      scale: Render.scale, blur: Render.motionBlur, fpv: F ? [F.vis, F.hideFig] : null };
    // (from inside the helmet, first person and the ski tips, the figure is drawn without its head and its own arms. Here it is seen whole
    // once the photo lens has left the head; while it is still in it, the picture stays the one the player saw. 2026-11-18: it was made
    // whole at once, and a photo taken in first person showed the figure's own neck, collar, sleeves and thighs from inside its head)
    saved.cut = typeof Skier !== 'undefined' ? Skier.lensCut : null; fpHere(c.pos);
    c.near = CAM_NEAR;
    // the picture at its full sharpness while it holds still (the frame-rate governor may have drawn it smaller to keep a run smooth)
    if (Render.scale !== 1 && !QS.get('w')) { Render.scale = 1; if (App.fit) App.fit(); }
    cam = fromRender(); start = { pos: cam.pos.slice(), yaw: cam.yaw, pit: cam.pit, fov: cam.fov };
    for (const k in keys) keys[k] = false; ptr.clear(); stick = look = pinch = null; vbtn = 0;
    P.on = true; App.photoFrame = frame;
    el.app.classList.add('photo'); el.root.setAttribute('aria-hidden', 'false'); showWords(true); closeShot();
    hint();
    return true;
  };
  P.exit = function () {
    if (!P.on) return;
    P.on = false; App.photoFrame = null; closeShot();
    if (want) { want = false; busy = false; }
    const c = Render.cam, s = saved; saved = null;
    if (s) {
      c.pos = s.pos; c.fwd = s.fwd; c.up = s.up; c.right = s.right; c.fovY = s.fovY; c.near = s.near; c.roll = s.roll;
      const F = typeof Fpv !== 'undefined' ? Fpv : null; if (F && s.fpv) { F.vis = s.fpv[0]; F.hideFig = s.fpv[1]; }
      if (typeof Skier !== 'undefined') Skier.lensCut = s.cut;
      if (Render.scale !== s.scale) { Render.scale = s.scale; if (App.fit) App.fit(); }
      Render.motionBlur = s.blur;
    }
    // the scene round the game's own lens again, and the last frame's lens forgotten (no smear from where the photo lens stood)
    try { redraw(); Render.computeGlobals(App.t, 0, App.state); } catch (e) { }
    el.app.classList.remove('photo'); el.root.setAttribute('aria-hidden', 'true');
    stickOff();
    if (App.redraw && App.paused) App.redraw();
  };

  // ---- one frame: the lens moved by whatever the player is holding, then the scene drawn again with no time passing
  function steer(dt) {
    const c = cam;
    // looking: eased a little, so a flick of the mouse is a turn of the head and not a jump
    const kl = 1 - Math.exp(-dt * 22); c.yaw += c.ty * kl; c.pit += c.tp * kl; c.ty -= c.ty * kl; c.tp -= c.tp * kl;
    c.pit = clamp(c.pit, -1.45, 1.45);
    // moving: across the map in the direction the lens faces (a level move, so looking down does not drive it into the snow), and up or down
    let mf = 0, mr = 0, mu = 0;
    if (keys.KeyW || keys.ArrowUp) mf += 1; if (keys.KeyS || keys.ArrowDown) mf -= 1;
    if (keys.KeyD || keys.ArrowRight) mr += 1; if (keys.KeyA || keys.ArrowLeft) mr -= 1;
    if (keys.KeyE || keys.Space || keys.PageUp) mu += 1; if (keys.KeyQ || keys.PageDown) mu -= 1;
    if (stick) { mr += stick.vx; mf -= stick.vy; }
    mu += vbtn;
    const fast = keys.ShiftLeft || keys.ShiftRight ? 3.2 : 1, sp = 3.2 * fast * (0.55 + 0.45 * c.fov);      // (a long lens moves slower, as the picture would race)
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), want = [(sy * mf + cy * mr) * sp, mu * sp * 0.75, (-cy * mf + sy * mr) * sp];
    const kv = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < 3; i++) { c.v[i] += (want[i] - c.v[i]) * kv; c.pos[i] += c.v[i] * dt; }
    // the horizon's tilt and the zoom from the keys
    if (keys.KeyZ) c.roll = clamp(c.roll - 0.6 * dt, -0.7, 0.7); if (keys.KeyC) c.roll = clamp(c.roll + 0.6 * dt, -0.7, 0.7);
    if (keys.Minus || keys.NumpadSubtract) zoom(Math.exp(0.9 * dt)); if (keys.Equal || keys.NumpadAdd) zoom(Math.exp(-0.9 * dt));
    keepIn(c.pos);
    // (and the near corners of the picture clear of the snow, whichever way it looks: Course.nearLift)
    c.pos[1] += Course.nearLift(c.pos, fwd(c), c.fov, Render.W / Render.H, Render.cam.near, 0.05, c.roll);
  }
  function zoom(k) { cam.fov = clamp(cam.fov * k, FOV[0], FOV[1]); }
  function place() {
    const c = cam, f = fwd(c);
    Render.setCamera(c.pos, [c.pos[0] + f[0], c.pos[1] + f[1], c.pos[2] + f[2]], [0, 1, 0], c.fov, c.roll);
  }
  function redraw() {
    const c = Render.cam, o = Render.origin;
    Terrain.update(c.pos[0], c.pos[2]);
    Trees.update(c, o, Render.W / Render.H, Game.root.pos, 0);
    if (typeof Gates !== 'undefined') Gates.update(c, o, Game.root.pos, 0, App.t);
  }
  P.drawFrozen = function () {
    redraw();
    Render.motionBlur = false;
    Render.computeGlobals(App.t, 0, App.state);
    for (const f of App.onTick) f(0, true);
    (App.renderHook || Render.render)();
  };
  // the first-person drawing (07d_fpv.js) kept while the photo lens is within FPNEAR m of where it started, the figure whole beyond
  const FPNEAR = 0.6;
  function fpHere(pos) {
    const F = typeof Fpv !== 'undefined' ? Fpv : null, s = saved; if (!F || !s || !s.fpv) return;
    const near = s.fpv[0] && Math.hypot(pos[0] - s.pos[0], pos[1] - s.pos[1], pos[2] - s.pos[2]) < FPNEAR;
    F.vis = near && s.fpv[0]; F.hideFig = near && s.fpv[1];
    if (typeof Skier !== 'undefined') Skier.lensCut = near ? s.cut : null;
  }
  function frame(dt) {
    steer(dt); place(); fpHere(cam.pos); P.drawFrozen();
    if (want) { const request = want; want = false; grab(request); }
    if (toastT > 0 && (toastT -= dt) <= 0) el.toast.classList.remove('on');
    lens();
  }
  // (the field of view as a 35 mm lens would have it, shown small at the foot: something to come back to)
  let lastMM = 0;
  function lens() { const mm = Math.round(12 / Math.tan(cam.fov / 2)); if (mm !== lastMM) { lastMM = mm; el.mm.textContent = mm + ' mm'; } }

  // ---- the picture: the canvas read in the frame it was drawn in (WebGL keeps no buffer once the frame is shown, WebGPU hands it on)
  P.snap = function () { if (!P.on || busy) return; busy = true; want = 'preview'; };
  async function grab(request) {
    const session = saved;
    
    let url = null, cv = null;
    try {
      {
        const v = document.getElementById('view'); cv = document.createElement('canvas'); cv.width = v.width; cv.height = v.height; cv.getContext('2d').drawImage(v, 0, 0);
      }
    } catch (e) { console.warn('photo', e); busy = false; if (saved === session) tell('没能拍下来'); return; }
    if (saved !== session) { busy = false; return; }
    el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on');
    P.shots++;
    const name = fileName();
    if (typeof XHS !== 'undefined' && XHS.on && XHS.saveShot) {          // inside 小红书: straight into the album
      url = cv.toDataURL('image/jpeg', 0.92);
      XHS.saveShot(url).then(ok => tell(ok ? '已存到相册' : '没能存到相册'), () => tell('没能存到相册')).finally(() => { busy = false; });
      return;
    }
    cv.toBlob(b => {
      busy = false; if (saved !== session) return; if (!b) { tell('没能拍下来'); return; }
      if (hand()) showShot(b, name);
      else { download(b, name); tell('已保存', name); }
    }, 'image/png');
  }
  const hand = () => !el.app.classList.contains('desk');
  function fileName() {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return 'ColdSmoke_' + (Course.seed || 0) + '_' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '.png';
  }
  function download(b, name) {
    const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
  // a phone: the picture is shown over the scene; 保存 hands it to the system (the share sheet: 存储图像 puts it in the photos), or it can be
  // pressed and held as any picture on a page. Without a share sheet the button downloads it
  let shot = null;
  function showShot(b, name) {
    closeShot(); const u = URL.createObjectURL(b); shot = { b, name, u };
    el.img.src = u; el.card.classList.add('on'); el.card.setAttribute('aria-hidden', 'false');
  }
  function closeShot() {
    if (!el) return; el.card.classList.remove('on'); el.card.setAttribute('aria-hidden', 'true');
    if (shot) { const u = shot.u; setTimeout(() => URL.revokeObjectURL(u), 1000); shot = null; el.img.removeAttribute('src'); }
  }
  async function saveShot() {
    if (!shot) return; const { b, name } = shot;
    
    try {
      const f = new File([b], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); closeShot(); tell('已保存'); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; console.warn('share', e); }
    download(b, name); closeShot(); tell('已保存', name);
  }
  function tell(k, v) { el.tk.textContent = T(k); el.tv.textContent = v || ''; el.toast.classList.add('on'); toastT = 2.6; }

  // ---- the words and buttons over the scene: shown, or put away (H, or the button) for an empty frame to look through; a tap brings them back
  function showWords(on) { hideW = !on; el.root.classList.toggle('bare', hideW); }
  function hint() {
    el.hint.textContent = T(hand() ? '右边拖动转视角 · 左边摇杆移动 · 双指缩放' : '拖动鼠标转视角 · WASD 移动 · Q E 升降 · 滚轮缩放 · Z C 歪斜 · R 复位 · H 隐藏文字');
  }

  // ---- the hands
  function onKey(e) {
    if (!P.on) return;
    if (e.metaKey || e.ctrlKey) return;
    e.stopImmediatePropagation();          // (nothing else on the page hears the keys while the lens is in the player's hands)
    if (e.type === 'keyup') { keys[e.code] = false; return; }
    if (/^Arrow|^Page|Space/.test(e.code)) e.preventDefault();
    keys[e.code] = true; if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); if (shot) closeShot(); else P.exit(); }
    else if (e.code === 'Enter' || e.code === 'KeyP' || e.code === 'NumpadEnter') { e.preventDefault(); P.snap(); }
    else if (e.code === 'KeyH') showWords(hideW);
    else if (e.code === 'KeyR') reset();
  }
  function reset() { if (!start) return; cam.pos = start.pos.slice(); cam.yaw = start.yaw; cam.pit = start.pit; cam.fov = start.fov; cam.roll = 0; cam.v = [0, 0, 0]; cam.ty = cam.tp = 0; }
  // a finger or the mouse on the scene: the left part of a phone's frame is the stick, the rest looks; two fingers looking pinch the zoom
  function down(e) {
    if (!P.on || e.target.closest('button') || e.target.closest('#ph-card')) return;
    e.preventDefault(); try { el.surf.setPointerCapture(e.pointerId); } catch (_) { }
    const x = View.x(e), y = View.y(e), q = { id: e.pointerId, x0: x, y0: y, x, y, t0: performance.now(), mouse: e.pointerType === 'mouse', role: 'look' };
    if (!q.mouse && x < (View.w || innerWidth) * 0.4 && !stick) { q.role = 'stick'; stickOn(q); }
    ptr.set(e.pointerId, q);
    const lk = [...ptr.values()].filter(p => p.role === 'look');
    if (lk.length >= 2) { pinch = { a: lk[0].id, b: lk[1].id, d: Math.hypot(lk[0].x - lk[1].x, lk[0].y - lk[1].y) || 1 }; }
  }
  function move(e) {
    const q = ptr.get(e.pointerId); if (!q) return;
    const x = View.x(e), y = View.y(e), dx = x - q.x, dy = y - q.y; q.x = x; q.y = y;
    if (q.role === 'stick') { stickMove(q); return; }
    if (pinch && (q.id === pinch.a || q.id === pinch.b)) {
      const a = ptr.get(pinch.a), b = ptr.get(pinch.b); if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1; zoom(pinch.d / d); pinch.d = d; return;
    }
    // drag right: the lens turns right. A drag across the frame's height turns it by about its own field of view, so the scene stays under the finger
    const H = View.h || innerHeight, k = (q.mouse ? 1.15 : 1.0) * cam.fov / H;
    cam.ty += dx * k; cam.tp -= dy * k;
  }
  function up(e) {
    const q = ptr.get(e.pointerId); if (!q) return; ptr.delete(e.pointerId);
    if (q.role === 'stick') stickOff();
    if (pinch && (q.id === pinch.a || q.id === pinch.b)) pinch = null;
    // a tap (no drag) with the words put away brings them back
    if (hideW && q.role === 'look' && performance.now() - q.t0 < 300 && Math.hypot(q.x - q.x0, q.y - q.y0) < 10) showWords(true);
  }
  const SR = 54;                       // how far the stick's knob goes (px)
  function stickOn(q) { stick = { id: q.id, x0: q.x0, y0: q.y0, vx: 0, vy: 0 }; el.stick.style.transform = 'translate(' + q.x0.toFixed(1) + 'px, ' + q.y0.toFixed(1) + 'px)'; el.knob.style.transform = ''; el.stick.classList.add('on'); }
  function stickMove(q) {
    if (!stick) return; let dx = q.x - stick.x0, dy = q.y - stick.y0; const l = Math.hypot(dx, dy); if (l > SR) { dx *= SR / l; dy *= SR / l; }
    stick.vx = dx / SR; stick.vy = dy / SR; el.knob.style.transform = 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px)';
  }
  function stickOff() { stick = null; if (el) { el.stick.classList.remove('on'); el.knob.style.transform = ''; } }
  function wheel(e) { if (!P.on) return; e.preventDefault(); zoom(Math.exp(clamp(e.deltaY, -120, 120) * 0.0016)); }
  // a button held (▲ ▼): pressed and released by its own finger
  function holdBtn(b, v) {
    let id = null;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; try { b.setPointerCapture(id); } catch (_) { } vbtn = v; b.classList.add('down'); });
    const off = e => { if (e.pointerId !== id) return; id = null; if (vbtn === v) vbtn = 0; b.classList.remove('down'); };
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
  function build() {
    const $ = id => document.getElementById(id);
    el = { app: $('app'), root: $('photo'), surf: $('ph-surf'), shut: $('ph-shut'), back: $('ph-back'), hide: $('ph-hide'), reset: $('ph-reset'), hint: $('ph-hint'), mm: $('ph-mm'),
      up: $('ph-up'), dn: $('ph-dn'), stick: $('ph-stick'), knob: $('ph-stick').firstElementChild, flash: $('ph-flash'), toast: $('ph-toast'), tk: $('ph-tk'), tv: $('ph-tv'),
      card: $('ph-card'), img: $('ph-img'), save: $('ph-save'), again: $('ph-again') };
    const tap = (b, fn) => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); if (e.detail) b.blur(); });
    tap(el.shut, P.snap); tap(el.back, P.exit); tap(el.hide, () => showWords(false)); tap(el.reset, reset);
    tap(el.save, saveShot); tap(el.again, closeShot);
    holdBtn(el.up, 1); holdBtn(el.dn, -1);
    el.surf.addEventListener('pointerdown', down); el.surf.addEventListener('pointermove', move);
    el.surf.addEventListener('pointerup', up); el.surf.addEventListener('pointercancel', up);
    el.surf.addEventListener('contextmenu', e => e.preventDefault());
    el.root.addEventListener('wheel', wheel, { passive: false });
    // (the page's own clicks, the title page's "the whole picture is the button", never hear a press in here)
    el.root.addEventListener('click', e => e.stopPropagation());
    el.root.addEventListener('touchmove', e => { if (!e.target.closest('#ph-card')) e.preventDefault(); }, { passive: false });
    if (typeof I18N !== 'undefined' && I18N.on) I18N.on(() => { if (P.on) hint(); });
  }
  addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; vbtn = 0; stickOff(); ptr.clear(); pinch = null; });
  return P;
})();
