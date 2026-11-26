"use strict";
// ---------------------------------------------------------------- input (tilt / drag / keys) and the skiing itself: physics, camera, body language
const Input = (() => {
  // keys: how far across the hill the line has to have come (rad off the way down) before a key still held asks for more than a carve, and
  // where it asks for all of it; and how long (s) a key has to be held to do the same wherever the line points
  const K_A0 = 0.70, K_A1 = 1.05, K_T0 = 1.8, K_T1 = 2.6;
  // when a held key breaks from the carve into a skid is a matter of taste, so the owner picks: as it was (after 0.6 s, in every long turn,
  // and let go again as the line comes across the hill), once the turn is finished (the line across the hill) or the key has been held
  // about two seconds, or only once the turn is finished. In the last two the skid stays for as long as the key does: a brake
  // d (owner, 2026-11-14: a held turn suddenly swinging into a skid after two seconds is wrong; I want to skid only when I ask for it): a
  // steering key or finger only ever carves, however long it is held or however far round the line has come; the skid is asked for with
  // the weight forward (↑ / W, or the steering finger pushed up) while turning, which is what throws the tails out on real skis (see
  // 'fore/aft' in step). Steering by tilt does the same with 前压 (or the phone tipped forward, Variants 'tilt'); only with fore/aft off does it keep the old rule (tipped all the way over skids)
  Variants.def('keys', '键盘转弯', [['a', '按半秒就搓'], ['b', '按两秒才搓'], ['c', '横过来才搓'], ['d', '前压才搓']], 'd');
  // the feel of the skiing (a player's notes, 2026-11-13: the drag of the snow, the body's weight going over in a turn, speed and momentum).
  // a: as it was. b: the edges hold only so much (past it the skis wash out sideways, scrubbing speed: a hard turn at speed is a wide one);
  // the faster the heavier the body is to throw from edge to edge; a key comes on over a third of a second; the snow is stickier crawling,
  // the edges' friction grows with how hard a turn presses them, deep powder drags as deep as the skis ride in it (and less as they plane
  // up); the body goes over before the edges do, sinks onto a loaded turn, rides forward into a turn and back out of it. Default b since
  // the owner skied it (2026-11-13) (see the 'feel' notes through step() and updatePose)
  Variants.def('feel', '滑行手感', [['a', '现在的'], ['b', '新的']], 'b');
  // fore and aft (a skier's note, 2026-11-13: left/right is only half of it; pressure moved between the shovels and the tails, timed with the
  // turn, is what decides a carve from a skid). a: none, as before (up jumps, down tucks). b: up / W presses the shovels, down / S the tails,
  // nothing held is centred and skis exactly as a; the jump is Space alone and the tuck moves to Shift. On a touch screen the steering finger
  // does both: across turns, up presses the shovels, down the tails. Read in step() ('fore/aft') and updatePose; works on top of feel b
  // (default b since the owner skied it, 2026-11-13)
  Variants.def('fa', '前后重心', [['a', '关'], ['b', '开']], 'b');
  // moguls (owner, 2026-11-14: over the bumps the speed hardly dropped, which is not true: a good skier folds the legs deep to soak up each bump,
  // and that costs speed; nobody hops bump to bump at speed). a: as it was, a flat extra friction over a field (0.12 of the load). b: what
  // the legs do costs what it costs. Every face that rises under the skis is folded into by the legs against the load they carry (that
  // work, load x fold, is taken from the speed: a bump's own height paid each time), the quicker the fold the more the legs' damping
  // burns (grows with speed), and a face met faster than a leg can fold (MOG_WMAX) is a blow, its speed into the snow lost as in a landing.
  // The smooth line through a field costs nothing. Measured against FIS mogul courses (26 deg, men need 11.8 m/s for full speed marks)
  // c (owner, 2026-11-14: b was slowed by hand, and now too slow; let physics alone decide): no fitted factor anywhere. A face costs what it
  // costs a body on legs: (1) the legs fold against the load (load x rise, heat in the muscles), (2) the face turns the skis up faster than
  // the legs can follow (MOG_TAU, a leg's response, ~0.1 s), and the vertical speed of whatever is not yet riding on soft legs is lost as in
  // any inelastic blow: 1/2 mu v^2 dtheta^2, mu the share of the body that is struck (MOG_MU0, skis, boots and shins, when the legs are
  // already folding into the face in rhythm; the whole body, 1, when the skier meets it stiff), (3) in rhythm the legs press the skis down
  // the back of each bump and win back up to what they paid folding (pumping)
  Variants.def('mog', '蘑菇减速', [['a', '原来'], ['b', '真实'], ['c', '纯物理']], 'c');
  // turning as a brake (owner, 2026-11-14: keep turning and you should come to a stop; there was no such thing). a: as it was (the lean
  // faded as the line came across the hill, so a held turn ended in a traverse still going down, and the skis skidded only when asked for).
  // b: what the snow and the slope do, nothing fitted. (1) The line may come round past across the hill, up to about 30 degrees uphill: there
  // gravity itself takes the speed away, and a held turn ends standing still (let go, the skis drop back down the fall line; the skier no
  // longer poles, nor is nudged on, while a turn is held). (2) A ski carves
  // no tighter than its sidecut lets it (TB_RSC, an all-mountain ski's 14 m, times the cosine of the edge angle): a turn asked tighter than
  // that, slow and short, is pivoted, the tails scraping sideways, and the snow across the ski is the brake. (3) The skid a held key asks for
  // swings the skis on round to straight across the fall line (a hockey stop), not just a third of the way. Read in step()
  Variants.def('tb', '转弯刹车', [['a', '原来'], ['b', '物理']], 'b');
  // edge bite by the snow (owner 2026-11-18, the research on 'animation commitment': the body goes over first, the skis take hold a moment
  // later, and how soon depends on the snow). a: as it was, the line turns with the body's lean. b, c: the edges (S.edge) follow the lean the way
  // a ski's edge takes hold, the new edge running behind the body by EB_T s from the first number on hard, icy snow to the second in deep
  // powder; the old edge lets go twice as fast. (b is the one the owner played and chose, default since 2026-11-18; c twice its delay, tried and not chosen) The carve, its limit, the wash and the scrape heard read the edges; the body's
  // lean, which the pose reads, still leads. Read in step()
  // the phone's tilt (owner 2026-11-19). a: tilt steers, and only steers: the owner tried tilt doing forward and back too and it was too hard
  // to control. Forward and back are the left thumb's up and down (前压 / 后压 on the cross, 19_ui.js), which works with the tilt at once:
  // the thumb's across adds to the tilt's. b: the phone tipped forward (the top edge away) is the weight on the shovels, tipped back the
  // tails, from however it was held as the run started. c: b with forward and back the other way round. In the 小红书 小工具, where the page's own tilt is switched
  // off, the container's gyroscope (only how fast the phone turns, no angle: see I.onGyro) gives the tilt
  Variants.def('tilt', '手机倾斜', [['a', '只转弯'], ['b', '转弯 + 前后倾'], ['c', '前后倾反过来']], 'a');
  Variants.def('ebite', '换刃咬雪', [['a', '原来'], ['b', '随雪况'], ['c', '两倍延迟']], 'b');
  const I = { u: 0, fa: 0, faV: 0, faT: 0, faScript: null, btn: { jump: false, tuck: false }, jump: false, tuck: false, mode: 'touch', xr: null, tiltOK: false, tiltSeen: -1e9, gx: 0, zero: 0, pitch: 0, pitch0: 0, gyro: null, keys: {}, drag: null, kb: 0, kHeld: 0, kWas: 0, script: null, used: false };
  I.init = function (el) {
    addEventListener('keydown', e => { if (e.code !== I.mute) I.keys[e.code] = true; }); addEventListener('keyup', e => { I.keys[e.code] = false; if (e.code === I.mute) I.mute = null; });
    // (I.mute: a key the interface has used, held down still: a space that confirmed a menu or started the run is not also a jump)
    el.addEventListener('pointerdown', e => { const x = View.x(e), y = View.y(e); I.drag = { id: e.pointerId, x0: x, x, y0: y, y }; try { el.setPointerCapture(e.pointerId); } catch (_) { } });
    el.addEventListener('pointermove', e => { if (I.drag && e.pointerId === I.drag.id) { I.drag.x = View.x(e); I.drag.y = View.y(e); } });
    const up = e => { if (I.drag && e.pointerId === I.drag.id) I.drag = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    addEventListener('blur', () => { I.keys = {}; I.drag = null; });
    // where the browser hands out tilt without asking (Android), listen from the start: the title page can then tell which way up it is held
    /*web{*/ try { if (typeof DeviceOrientationEvent !== 'undefined' && !DeviceOrientationEvent.requestPermission) { addEventListener('deviceorientation', I.onOrient); I.listening = true; } } catch (e) { } /*}web*/
  };
  // sideways component of gravity in screen space: the same number whether the phone is held upright like a wheel or flat like a tray
  I.onOrient = function (e) {
    if (e.beta == null || e.gamma == null) return;
    if (I.gyro) return;                                                                    // (the gyroscope, where it runs, is the one source)
    const b = e.beta * PI / 180, g = e.gamma * PI / 180, gx = Math.cos(b) * Math.sin(g), gy = -Math.sin(b), gz = -Math.cos(b) * Math.cos(g);
    if (View.gravity(gx) && I.onFlip) I.onFlip();                                          // held the other way up: turn the picture over
    const sc = toScreen(gx, gy); I.onGrav(sc[0], sc[1], gz);
  };
  // the device's own x and y (as the sensors give them) turned into the picture's: right across it and up it (z, out of the glass, is the same)
  function toScreen(x, y) { const ang = View.angle(); return ang === 90 ? [-y, x] : ang === 270 ? [y, -x] : ang === 180 ? [-x, -y] : [x, y]; }
  // gravity in the picture's frame, a unit vector (x right, y up the picture, z out of the glass toward the player), however it was found.
  // Across: its sideways part (the same number whether the phone is held upright like a wheel or flat like a tray). Forward and back: how far
  // the glass is tipped from upright toward lying face up, asin(-z), which turning the phone like a wheel leaves alone
  I.onGrav = function (x, y, z) {
    I.gx = x; I.pitch = Math.asin(clamp(-z, -1, 1));
    if (I.zeroPending) { I.zero = clamp(I.gx, -0.3, 0.3); I.pitch0 = I.pitch; I.zeroPending = false; }       // however the phone is held as the run starts is 'straight ahead' and 'centred'
    I.tiltSeen = performance.now(); if (!I.tiltOK) { I.tiltOK = true; if (I.onTiltOn) I.onTiltOn(); }
  };
  // the 小红书 小工具's gyroscope (miniTool.onGyroscopeChange, 19c_xhs.js): only how fast the phone turns about its own axes (rad/s), about
  // 16 times a second, no angle and no gravity. So gravity is carried by hand: it starts where a phone held for play usually is (upright,
  // tipped back GY_HOLD), each frame turns against the phone's own turning (dg/dt = g x w, the last rate held until the next one comes), and
  // eases back toward that start over GY_TAU s, which keeps the sensor's slow drift from building up: let go of a tilt and the steering
  // comes back to centre by itself, like a wheel. Each run starts from the same place, so 'straight ahead' is wherever the phone is then
  const GY_HOLD = 0.6, GY_TAU = 6, G0 = [0, -Math.cos(GY_HOLD), -Math.sin(GY_HOLD)];
  I.onGyro = function (f) {
    if (!f || !isFinite(f.x) || !isFinite(f.y) || !isFinite(f.z)) return;
    if (!I.gyro) I.gyro = { g: G0.slice(), w: [0, 0, 0], at: 0 };
    I.gyro.w[0] = f.x; I.gyro.w[1] = f.y; I.gyro.w[2] = f.z; I.gyro.at = performance.now();
  };
  function gyroStep(dt) {
    const Y = I.gyro; if (!Y) return;
    if (performance.now() - Y.at > 400) return;                                            // (no rate for a while: hidden, or stopped)
    if (I.zeroPending) Y.g = G0.slice();
    const sw = toScreen(Y.w[0], Y.w[1]), wx = sw[0], wy = sw[1], wz = Y.w[2], g = Y.g, h = Math.min(dt, 0.1);
    const nx = g[0] + (g[1] * wz - g[2] * wy) * h, ny = g[1] + (g[2] * wx - g[0] * wz) * h, nz = g[2] + (g[0] * wy - g[1] * wx) * h;
    const k = 1 - Math.exp(-h / GY_TAU), ax = nx + (G0[0] - nx) * k, ay = ny + (G0[1] - ny) * k, az = nz + (G0[2] - nz) * k, n = Math.hypot(ax, ay, az) || 1;
    g[0] = ax / n; g[1] = ay / n; g[2] = az / n;
    I.onGrav(g[0], g[1], g[2]);
  }
  // forward and back from the tilt, -1..1, or null where the tilt is not to give it (Variants 'tilt' a, or not tilting)
  I.faTilt = () => Variants.val.tilt !== 'a' && I.tiltLive();
  function tiltFa() {
    const d = (I.pitch - I.pitch0) * (Variants.val.tilt === 'c' ? -1 : 1);
    return clamp(sign(d) * Math.max(0, Math.abs(d) - 0.06) / 0.30, -1, 1);             // (3.5 degrees of play, all of it by 21 degrees)
  }
  // must be called from a tap (iOS asks for permission); resolves true if motion events may arrive.
  // (/*web{*/ … /*}web*/ is left out of the 小红书 小工具 build, where device orientation is switched off and the finger steers: tools/build-xhs.js)
  I.requestTilt = async function () {
    if (self.COLD_SMOKE?.noTilt) return false;
    /*web{*/ try {
      if (typeof DeviceOrientationEvent === 'undefined') return false;
      if (DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false; }
      if (!I.listening) { addEventListener('deviceorientation', I.onOrient); I.listening = true; } return true;
    } catch (e) { return false; } /*}web*/
    return false;
  };
  I.tiltLive = () => I.tiltOK && performance.now() - I.tiltSeen < 600;
  I.update = function (dt) {
    gyroStep(dt);
    const k = (I.keys.ArrowRight || I.keys.KeyD ? 1 : 0) - (I.keys.ArrowLeft || I.keys.KeyA ? 1 : 0);
    // a key is all or nothing, and all of the steering is a skid. So a key asks for a carve: it aims inside the carve range for as long as
    // the turn is still coming round, however the keys are linked. The skid is what a skier does when the turn is finished and the speed
    // has to go: with the key still down as the line comes across the hill (or held for longer than a linked turn lasts) it goes on
    // toward full, the farther across the more, and the skis are thrown sideways and brake
    I.kHeld = k && k === I.kWas ? I.kHeld + dt : 0; I.kWas = k;
    const kv = Variants.val.keys, hd = k * (Game.s.hdOff || 0), far = kv === 'd' ? 0 : kv === 'a' ? (I.kHeld > 0.6 ? smooth(1.04, 0.80, hd) : 0) : Math.max(smooth(K_A0, K_A1, hd), kv === 'c' ? 0 : smooth(K_T0, K_T1, I.kHeld));
    const fb = Variants.val.feel === 'b';
    if (!fb) I.kb = damp(I.kb, k * (0.66 + 0.34 * far), k ? (kv === 'a' && far ? 2.5 : 6) : 10, dt);
    else {
      // (feel b: a key is a leg pressing, not a switch. It comes on through a critically damped spring, nine tenths of the way in 0.35 s,
      // starting gently and settling without overshoot, and lets go in 0.2 s; the reach for a skid beyond the carve goes the same way)
      const want = k * (0.66 + 0.34 * far), on = Math.abs(want) >= Math.abs(I.kb) && want * I.kb >= 0, w = (on ? 11 : 19) * (kv === 'a' && far && k ? 0.5 : 1);
      const x = I.kb - want, vv = I.kbV || 0, e = Math.exp(-w * dt), bb = (vv + w * x) * dt; I.kb = want + (x + bb) * e; I.kbV = (vv - w * bb) * e;
    }
    if (!fb) I.kbV = 0;
    let t = 0;
    // (the tilt and the thumb together, owner 2026-11-19: the phone tipped steers, and a thumb across adds to it; a thumb only up or down,
    // for the weight, leaves the tilt's turn as it is)
    const tl = I.tiltLive() ? (() => { const d = I.gx - I.zero; return clamp(sign(d) * Math.max(0, Math.abs(d) - 0.025) / 0.40, -1, 1); })() : 0;
    if (I.drag) { t = clamp((I.drag.x - I.drag.x0) / (Math.min(View.w || innerWidth, (View.h || innerHeight) * 1.4, 900) * 0.2), -1, 1); if (fb) t = sign(t) * Math.max(0, Math.abs(t) - 0.04) / 0.96; t = clamp(t + tl, -1, 1); I.mode = 'touch'; }
    else if (I.xr) { t = I.xr.steer; I.mode = 'xr'; }                     // (in a headset: the head leaned or tipped to the side, 21_xr.js)
    else if (I.tiltLive()) { t = tl; I.mode = 'tilt'; }
    t = clamp(t + I.kb, -1, 1);
    if (I.script != null) t = I.script;
    if (Math.abs(t) > 0.25) I.used = true;
    I.u = t;
    // the two moves besides steering, each one thing held down: jump (Space, or W / ArrowUp) and tuck-or-pole (ArrowDown or S).
    // On a touch screen the interface's buttons set I.btn; the physics reads I.jump and I.tuck
    const K = I.keys;
    if (Variants.val.fa !== 'b') { I.jump = !!(K.Space || K.KeyW || K.ArrowUp || I.btn.jump); I.tuck = !!(K.ArrowDown || K.KeyS || I.btn.tuck); I.fa = I.faV = I.faT = 0; return; }
    // (fore/aft b: up / W the shovels (+1), down / S the tails (-1); the jump is Space alone, the tuck Shift. A key comes on as a leg moves the
    // weight, not at a blow: the same critically damped spring as the steering keys, nine tenths of the way in about a third of a second.
    // The steering finger's height from where it came down does the same, at the same scale as across; a script, if set, overrides both)
    I.jump = !!(K.Space || I.btn.jump); I.tuck = !!(K.ShiftLeft || K.ShiftRight || I.btn.tuck);
    const kf = (K.ArrowUp || K.KeyW ? 1 : 0) - (K.ArrowDown || K.KeyS ? 1 : 0);
    { const want = kf, w = Math.abs(want) >= Math.abs(I.fa) && want * I.fa >= 0 ? 11 : 15, x = I.fa - want, vv = I.faV, ee = Math.exp(-w * dt), bb = (vv + w * x) * dt; I.fa = want + (x + bb) * ee; I.faV = (vv - w * bb) * ee; }
    let f = I.fa;
    if (I.xr) f += I.xr.fa;                                              // (in a headset: the head over the tips or back over the tails)
    if (!I.drag && !I.xr && I.faTilt()) f += tiltFa();                 // (steering by tilt: the phone tipped forward or back, Variants 'tilt')
    if (I.drag && I.drag.y0 != null) { const L = Math.min(View.w || innerWidth, (View.h || innerHeight) * 1.4, 900) * 0.2, dy = clamp((I.drag.y0 - I.drag.y) / L, -1, 1); f += sign(dy) * Math.max(0, Math.abs(dy) - 0.08) / 0.92; }
    I.faT = clamp(I.faScript != null ? I.faScript : f, -1, 1);
  };
  return I;
})();

const Game = (() => {
  const G = { mode: 'title', t: 0, runT: 0, timeScale: 1, shake: 0, fovKick: 0, events: [], onStep: null, dist: 0, drop: 0, topSpeed: 0 };
  // the body on its legs: stiffness about the stance and toward the end of the travel, damping as they fold and (more) as they push back, how
  // far the legs reach down (E_MAX) and fold (E_MIN) from where they stand, the most they press in a turn or a dip and in a hard landing, how
  // fast the load that others read may change, how much of a mogul the body is told about and what a field of them costs, what a landing
  // costs (speed owed per m/s of speed into the snow, beyond what legs take in their stride), how fast a leg can follow snow that falls away
  // and how far the legs reach out for a landing; how fast the edges' grip follows the load, and how fast the skis are swung into a skid
  const GRAV = 9.81, K_LEG = 95, K3_LEG = 420, C_LEG = 16, C_REB = 40, E_MAX = 0.22, E_MIN = -0.30, N_MAX = 7 * GRAV, N_HARD = 14 * GRAV, N_SLEW = 2 * GRAV * 120, MOG_K = 0.45, MOG_MU = 0.12, LAND_K = 0.3, LAND_V0 = 3, LEG_V = 4, LEG_AIR = 0.18, BITE_K = 4, BETA_W = 15, H = 1 / 120;
  // (feel b) the most the edges hold across the line, in parts of the load, on packed snow and in deep powder; the snow's friction there at speed;
  // the drag of powder ploughed, per metre of depth the skis ride at (m/s^2 per m)
  const GRIP_B = [1.0, 0.95], MU_B = [0.035, 0.04], PLOW_K = 3.5;
  // how much the edges hold (review 2026-11-14: a grip of 1 g means at 80 km/h no turn tighter than 51 m, wider than the steeps, so at speed
  // the only line is straight down. Good recreational skiers carve at 1-1.5 g). a: 1 g, as it was. b: 1.4 g, turns can be finished at speed
  Variants.def('pcue', '坡感', [['a', '原来'], ['b', '陡处低头'], ['c', '低头 + 镜头高']], 'c');
  Variants.def('grip', '抓地', [['a', '原来 1g'], ['b', '更稳 1.4g']], 'a');
  const GRIP_K = { a: 1, b: 1.4 };
  // (turning brake b) a ski's sidecut radius (m); where the lean fades as the line comes round, from and to (rad off the fall line; a: 0.80..1.30);
  // how far a held key swings the skis across (rad, a: 0.62; never past straight across the fall line either way)
  const TB_RSC = 14, TB_H0 = 1.65, TB_H1 = 2.2, TB_SK = 1.35;
  // (mogul b) the blow of each face met, per (speed x angle)^2 per metre, charged square on with no rhythm; how much of it rhythm takes away
  // at best; how fast rhythm runs out (/s); how near a crest an edge change has to come (s); how much of a face's height the legs pump
  // back down its back at full rhythm. Measured on mountain 271828, two fields, steady speed after 4 s: test pilot charging straight 37
  // km/h, changing edges at random 41, changing edges on the crests 44.5 (a: 83 straight, 58 turning; FIS men need 42 km/h on 26 deg)
  const MOG_TAU = 0.1, MOG_WMAX = 3.4, MOG_MU0 = 0.25, MOG_I = 10, MOG_RK = 0.95, MOG_RD = 0.08, MOG_WIN = 0.18, MOG_P = 0.6, MOG_KR = 0.2;
  // the jump: time to wind up, how far the legs fold for it, the speed a tap and a full wind-up give, how long the drive lasts; how far a tuck sits down
  const CHG_T = 0.65, CHG_E = 0.27, POP_V0 = 1.5, POP_V1 = 3.3, POP_T = 0.14, TUCK_E = 0.07;
  // (Variants 'ebite' b, c, see its note above: how far the new edge runs behind the body (s, its time constant) on hard snow and in deep
  // powder, and how much quicker the old edge lets go)
  // (measured, mountain 261111, keys flipped every 1.4 s at 75-100 km/h, the full bite (9/10) behind the body's: b 0.11 s on the steeps,
  // 0.13 s in the open bowl, 0.33 s in powder; c 0.23 / 0.27 / 0.49 s: in powder the next turn comes before its edge has fully bitten)
  const EB_T = { b: [0.10, 0.30], c: [0.20, 0.60] }, EB_REL = 0.5;
  // the wind-up: the body starts down at once and slows into the bottom of the crouch, where it stays while the key is held (owner 2026-11-12)
  const chgK = t => { const x = sat(t / CHG_T); return 1 - (1 - x) * (1 - x); };
  // the double-pole stroke: its length (s), the phase of the plant and of the end of the drive, what one stroke is worth from rest (m/s), the
  // speed above which poling gives nothing and the skier tucks instead, and the speed at which the strokes that leave the start stop
  const DP_T = 0.95, DP_PLANT = 0.22, DP_END = 0.62, DP_DV = 1.6, V_POLE = 9.5, V_GLIDE = 6.5;
  const V_AUTO = 3.3, V_AUTO1 = 4.6;        // the skier poles by itself under 12 km/h, and keeps on to 16.5 km/h
  // what a stroke is worth at speed v, 0..1 of the stroke from rest. A planted pole drives only while the arms and trunk can push back faster
  // than the body passes the basket, so the gain falls with speed (double-poling studies: the thrust gets shorter as the skier goes faster,
  // the impulse per stroke smaller), but it never stops at once: under 8 m/s as before, then a small tail that fades out by 18 m/s
  const poleGain = v => Math.max(0, 1 - Math.pow(v / V_POLE, 1.5), 0.15 * (1 - smooth(8, 18, v)));
  // and held down, the key keeps poling up to V_HOLD (50 km/h, owner 2026-11-18: 38 was too low), then it is a tuck and nothing else
  const V_HOLD = 50 / 3.6;
  const S = G.s = {
    p: [0, 0, 0], v: [0, 0, 0], n: [0, 1, 0], t: [0, 0, -1], r: [1, 0, 0], h: 0, e: 0, air: false, airT: 0, speed: 0, lean: 0, leanV: 0, beta: 0, load: GRAV,
    aReac: 0, aSkid: 0, aCarve: 0, tuck: 0, tuckT: 0, powder: 0.25, landV: 0, crash: 0, brush: 0, u: 0, contact: true, hdot: 0,
    // for the others to read: the jump's wind-up 0..1, the player's own tuck 0..1, how airborne 0..1 (smooth), the phase of the double-pole
    // stroke (0 = none), and how far the legs are folded or reached out from the stance (m, E_MIN..E_MAX, never jumps: the skis are at p.y - leg)
    charge: 0, tuckIn: 0, airK: 0, dp: 0, leg: 0,
  };
  // (the physics' own book-keeping for the moves; set whenever the skier is put somewhere)
  const still = () => { S.charge = S.tuckIn = S.airK = S.dp = S.leg = 0; S.betaV = 0; S.bite = GRAV; S.jOn = false; S.jT = 0; S.jLock = true; S.edge = 0; S.popT = -1; S.popV = 0; S.lift = false; S.dpGo = 0; S.owe = 0; S.load = GRAV; S.airT = 0; S.landV = 0; S.off = 0; S.hdOff = 0; S.pdep = 0; S.aDrag = 0; S.wash = 0; S.mogR = 0; S.mogT = 9; S.mogF = 9; S.mogG = 0; S.mogA = 0; S.mogS = 0; S.aMog = 0; };
  still();
  // the chase camera when the picture is wide (the way the game is meant to be held): how low the skier sits in the frame, lens, distance, height
  // (wd, wh, wf: among trees it comes that much nearer (m), lower (m) and wider (rad): see cam.wood)
  G.camL = { k: 0.52, kf: 0.74, f0: 0.98, f1: 1.18, d0: 4.3, d1: 3.8, h0: 1.35, h1: 1.1, wd: 1.3, wh: 0.25, wf: 0.06 };
  // the hands and poles while skiing (see updatePose): a as before (hands low, the plant only in slow linked turns); b: hands ahead at the belt,
  // a plant at every edge change; c: the same, carried higher and wider, the outside hand thrown on round the turn (a freeride look)
  // HANDS: [wider, higher, further forward, higher and further forward for the outside hand, the same for the inside one] in metres, added to the stance's own
  const HANDS = { a: [0, 0, 0, 0, 0, 0, 0], b: [0.03, 0.07, 0.07, 0.04, 0.05, 0.12, 0.10], c: [0.06, 0.12, 0.10, 0.08, 0.09, 0.16, 0.12] }, PL_LEAD = 0.16, PL_HOLD = 0.14;
  if (typeof Variants !== 'undefined') Variants.def('poles', '持杖', [['a', '原样'], ['b', '手在前'], ['c', '更舒展']], 'b');
  // how the body moves under what the physics does (see updatePose, "motion"): a as before (the trunk turns with the skis, the poles swing on a clock);
  // b: shoulders and head stay on the fall line while the legs turn under them, a flex-and-rise through each edge change, a landing that is
  // soaked up and comes back past level once, a little chatter from the snow at speed
  if (typeof Variants !== 'undefined') Variants.def('motion', '人物动作', [['a', '原来'], ['b', '新的']], 'b');
  // the 2026-11-16 motion review: five corrections to the figure, each behind its own row so they can be compared one at a time (measured
  // with tools/motion, which is also the gate a change to the figure has to pass). None of them touches the physics: the skier goes down the
  // same line to the frame. Developer mode only for now, like the board (08a_board.js): without ?dev every row is a, whatever an address or an
  // earlier pick in this browser asks for.
  //   mo1   b: the ski tip's look-ahead goes the way the ski goes, not the way the body does (tipClear below). (It also read the lab posture
  //            ahead of the lean; taken out 2026-11-17 on the owner's word: where the lean comes to rest, letting a turn go, the guess ran past
  //            it and the upper body twisted twice more after every turn);
  //   medge b: the edges roll over with the body, to the same instant (updatePose; a is feel b's "the body goes first");
  //   mo2   b: the lab's hand stays outside its own leg and the pole is aimed again from where the hand ended up (08_skier.js, solve);
  //   mo3   b: the head keeps the game's own rule (level eyes) and a mogul field its quiet trunk (08_skier.js, solve);
  //   mo4   b: the legs use their travel through a jump (updatePose; measured with tools/motion/rom.js against people). The hips' height was the
  //            physics' body less a pile of let-downs that each kept its own clock: stacked, they left the legs bent 62 degrees at touchdown
  //            and 80 at lift-off; let go on their own clock, one of them cancelled half of a landing's sinking. b: the legs go long for a
  //            landing and the hips then fold into it, a jump is driven to straight legs, and a tuck is let go as the jump is wound up;
  //   kring b: at a keyboard the ring that fills as a jump is wound up (the jump button's, on a phone) is shown too (19_ui.js, #chg)
  if (typeof Variants !== 'undefined') {
    Variants.def('mo1', '动作·时序', [['a', '现在的'], ['b', '修正']], 'a'); Variants.def('medge', '板刃时序', [['a', '身体先走'], ['b', '和身体同步']], 'a');
    Variants.def('mo2', '动作·雪杖', [['a', '现在的'], ['b', '修正']], 'a'); Variants.def('mo3', '动作·头和上身', [['a', '现在的'], ['b', '修正']], 'a'); Variants.def('mo4', '动作·起跳和落地', [['a', '现在的'], ['b', '修正']], 'a'); Variants.def('land', '落地缓冲', [['a', '之前的'], ['b', '伸腿接雪，蹲得更深']], 'b'); Variants.def('kring', '电脑上的蓄力圈', [['a', '不显示'], ['b', '显示']], 'b');
    let dev = false; try { dev = !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && (/[?&]dev(=|&|$)/.test(location.search) || /\/dev\/?$/.test(location.pathname) || !!(self.COLD_SMOKE && self.COLD_SMOKE.dev)); } catch (e) { }
    if (!dev) for (const n of ['mo1', 'medge', 'mo2', 'mo3', 'mo4']) Variants.val[n] = 'a';      // (kring: shown to everyone, owner 2026-11-18)
  }
  // (the lens among trees is the owner's to choose. a: as it was. b: it closes up, and a tree in its way fades before it is reached.
  // c: it stays where it was, and only the fading is early. 14_trees.js reads the same choice for the fading)
  if (typeof Variants !== 'undefined') Variants.def('wood', '林间镜头', [['a', '现在的'], ['b', '贴近'], ['c', '原位淡树']], 'b');
  // each kind of run its own picture (the owner's choice 'shots'; a: one picture everywhere, the sun and the city always top centre).
  // Per kind: the lens higher (m), its angle narrower (-) or wider (rad; the distance makes up, so the figure keeps its size), the skier
  // lower in the frame (+, the horizon with it), and a swing round the skier (rad; its side alternates from one section to the next) that
  // carries the sun and the city across the picture. Steeps: high and long, down the fall line. Ridge: low, the horizon low, swung out over
  // one of the two drops. Gully: low between the walls. Glade: close, as it was. The open runs between are swung wide, three-quarter views
  const SHOTS = { steeps: [-0.2, -0.08, 0, 0.06], ridge: [-0.35, 0.03, 0.12, 0.32], gully: [-0.3, 0.05, 0.03, 0], glade: [0, 0, 0, 0], bowl: [0.15, -0.05, 0, 0.34], powder: [0.3, -0.02, 0.05, 0.24], rollers: [-0.2, 0.03, 0.08, 0.2], moguls: [0.25, -0.03, -0.02, 0.14], kickers: [0, 0, 0, 0.12] }, SH0 = [0, 0, 0, 0];
  // c (the owner's ask, 2026-11-12): the same chase camera everywhere, only nudged per kind of run, and gently: a little closer or further,
  // a little higher or lower, the framing tipped a little up or down. Never swung round the skier (no side views), never the gully's low bank.
  const SHOTS_C = {}; for (const k in SHOTS) { const t = SHOTS[k]; SHOTS_C[k] = [t[0] * 0.35, t[1] * 0.5, t[2] * 0.5, 0]; }
  if (typeof Variants !== 'undefined') Variants.def('shots', '分段机位', [['a', '不变'], ['b', '按路段大变'], ['c', '轻微变化']], 'c');
  // on the title page, with no sun ahead, the lens looks a little to the left of the valley (and the skier stands on the right third, see updateCamera)
  G.titleYaw = -0.05;
  const cam = G.cam = { pos: [0, 3, 8], yaw: 0, roll: 0, fov: 1.3, anchor: [0, 0, 0], pitch: -0.2, side: 0, gy: 0, init: false, fwd: [0, 0, -1] };
  const pc = {}, tn = { ok: false }, tnc = { ok: false }, rk = {}, ROCK_CAP = 0.3;
  let acc = 0;

  G.reset = function (s0 = 14) {
    const c = Course.at(s0, pc), x = c.cx, z = -s0, h = Course.height(x, z, 0.5);
    S.p = [x, h, z]; S.v = [0, 0, 0]; S.lean = S.leanV = S.beta = 0; S.air = false; S.speed = 0; S.tuck = 0; S.crash = 0; S.h = h; S.e = 0;
    const n = Course.normal(x, z, 0.35); S.n = [n[0], n[1], n[2]]; S.t = [0, 0, -1]; S.r = [1, 0, 0];
    cam.init = false; G.runT = 0; G.dist = 0; G.drop = 0; G.topSpeed = 0; G.y0 = h; acc = 0; pose.init = false;
    still();
  };

  function step(dt, u) {
    const p = S.p, v = S.v, n = S.n, FB = typeof Variants !== 'undefined' && Variants.val.feel === 'b', TB = typeof Variants !== 'undefined' && Variants.val.tb === 'b';
    // (mogul b: the better the rhythm, the more of each bump the legs take and the less the body rides: from 0.45 of it down to 0.25, the head
    // all but level, as a mogul skier's is. Eased, so the snow the body is told about never steps)
    // (c: and legs fold no faster than MOG_WMAX, as a skier's do: met faster than that, a face lifts the body with it; what the legs cannot
    // take, the body rides, and is thrown off the crest, to land where it lands. So speed itself, not a fitted brake, is what a field punishes)
    let kT = Variants.val.mog !== 'a' ? MOG_K - MOG_KR * (S.mogR || 0) : MOG_K;
    if (Variants.val.mog === 'c') { const M = Course.mogShape(), sR = 1.5 * M.H * (M.B0 + 0.5 * M.B1) / (M.Q * M.L), spd = Math.hypot(v[0], v[1], v[2]); kT = clamp(Math.max(kT, 1 - MOG_WMAX / Math.max(1e-3, spd * sR)), 0, 1); }
    S.mogKe = damp(S.mogKe || MOG_K, kT, Variants.val.mog === 'c' ? 4 : 2, dt);
    Course.mogK = S.mogKe; const h = Course.height(p[0], p[2], 0.5), nn = Course.normal(p[0], p[2], 0.35); n[0] = nn[0]; n[1] = nn[1]; n[2] = nn[2]; Course.mogK = 1;
    const c = Course.at(-p[2], pc); S.powder = c.powder; S.h = h; S.u = u;
    let e = p[1] - h, vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    // out of leg. What is left of the speed INTO the snow is lost in the blow: it is taken along the snow's own normal, so the speed along
    // the slope is kept and nothing is added. (Setting the vertical speed alone, as this did, pushed the body up any face that rose under it
    // without touching its speed over the ground.) A share of the blow is owed as speed: the skis punch in and plough
    if (e < E_MIN) { if (vn < 0) { S.owe += 0.25 * -vn; v[0] -= n[0] * vn; v[1] -= n[1] * vn; v[2] -= n[2] * vn; vn = 0; } p[1] = h + E_MIN; e = E_MIN; }
    S.hdot = -(n[0] * v[0] + n[2] * v[2]) / n[1]; S.e = e;
    // skis on the snow? While they are, the legs follow it down as far as they reach (E_MAX below the stance) and no faster than a leg can
    // be straightened: where the snow falls away quicker than that (the lip of a jump) the skis are off it at once, with the legs as they
    // were; and at the end of the drive of a jump the legs stop following (S.lift), so the skis come up with the body. Once off, the skis
    // meet the snow again only by coming down onto it. S.leg is how far the legs are folded (below 0) or reached out (above): on the snow
    // it is e itself; in the air it is held, and eased out for the landing on the way down from any real height. So it never jumps, and
    // the skis are always at p.y - S.leg
    const contact = S.air || S.lift ? e < S.leg : e < Math.min(E_MAX, S.leg + LEG_V * dt); S.lift = false;
    if (contact) S.leg = e; else if (S.leg > LEG_AIR || v[1] < S.hdot && e - S.leg > 0.25) S.leg += clamp((LEG_AIR - S.leg) * 6, -2, 2) * dt;
    // touchdown. landV is the speed INTO the snow, across its surface none: a landing that meets the slope is free, a flat one is paid for
    // in speed (the skis are driven in and plough: owed here, taken off over the next tenth of a second or so)
    if (S.air && contact) { S.air = false; S.landV = Math.max(0, -vn); S.owe += LAND_K * Math.pow(Math.max(0, S.landV - LAND_V0), 1.15) * (0.85 + 0.5 * S.powder); G.events.push({ type: 'land', v: S.landV, airT: S.airT }); }
    else if (!S.air && !contact) { S.air = true; S.airT = 0; G.events.push({ type: 'takeoff' }); }
    if (S.air) S.airT += dt;
    S.contact = contact;
    // how airborne, for whoever blends a pose or a lens on it (S.air is the switch, for logic): it comes in over the first fifth of a
    // second off the snow, is whole once the skis are well clear, eases as the snow comes back up and runs out over a tenth of a second after touchdown
    S.airK = damp(S.airK, S.air ? lerp(0.55, 1, smooth(0, 0.4, e - S.leg)) * smooth(0.02, 0.2, S.airT) : 0, S.air ? 14 : 16, dt);
    // tangent frame on the snow: t along travel, r to the skier's right
    let tx = v[0] - n[0] * vn, ty = v[1] - n[1] * vn, tz = v[2] - n[2] * vn; const sp = Math.hypot(tx, ty, tz);
    let fx = n[0] * n[1], fy = n[1] * n[1] - 1, fz = n[2] * n[1]; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;    // fall line
    if (sp < 0.3) { tx = fx; ty = fy; tz = fz; } else { tx /= sp; ty /= sp; tz /= sp; }
    const rx = ty * n[2] - tz * n[1], ry = tz * n[0] - tx * n[2], rz = tx * n[1] - ty * n[0];
    S.t[0] = tx; S.t[1] = ty; S.t[2] = tz; S.r[0] = rx; S.r[1] = ry; S.r[2] = rz; S.speed = sp;

    // ---- the player's own moves
    const sound = contact && S.crash <= 0, calm = Math.abs(S.lean) < 0.3 && Math.abs(u) < 0.6;
    // jump. Held on the snow, the legs fold and wind up (S.charge, full in under half a second); let go, they drive the body up off the
    // snow along its normal: a tap is a hop, a full wind-up a real jump, and more again when the snow is pressing back (in the kick of a
    // ramp, the bottom of a dip). The drive is a force through the legs over a tenth of a second, not a change of speed out of nowhere
    if (!Input.jump) S.jLock = false;
    let go = S.jOn && !(Input.jump && !S.jLock);
    if (Input.jump && !S.jLock) {
      S.jOn = true; if (sound) S.jT += dt;
      // (still held as the lip of a jump or the crest of a roller arrives: the legs fire by themselves, timed so that the drive ends where the snow falls away)
      if (sound && S.jT > 0.1 && sp > 4) { const d = sp * (POP_T + 0.02); Course.mogK = S.mogKe; go = h - (n[0] * tx + n[2] * tz) / n[1] * d - Course.height(p[0] + tx * d, p[2] + tz * d, 0.5) > 0.5; Course.mogK = 1; if (go) S.jLock = true; }
    }
    if (go) {
      if (sound && S.jT > 0) { S.popV = lerp(POP_V0, POP_V1, chgK(S.jT)) * (1 + 0.3 * sat((S.load / GRAV - 1.1) / 0.6)); S.popT = 0; }
      S.jOn = false; S.jT = 0;
    }
    
    S.charge = S.jOn ? chgK(S.jT) : Math.max(0, S.charge - dt / 0.07);
    
    let nPop = 0;
    if (S.popT >= 0) { const q = S.popT / POP_T, sq = Math.sin(PI * q); if (q >= 1 || !contact) { S.popT = -1; S.lift = contact; } else { nPop = S.popV * 2 / POP_T * sq * sq; S.popT += dt; } }
    // accelerate: one control. Slow, the skier double-poles, stroke after stroke (S.dp is the phase of the stroke: reach, plant at 0.22, drive
    // to 0.62, release, recover); poles give less and less as the skier goes faster (poleGain), so where a tuck pays more the same control held is a
    // tuck (S.tuckIn). The stroke in hand is always finished first. Leaving the start is the same stroke, up to three, until the slope takes over
    if (S.dpGo > 0 && sp >= V_GLIDE) S.dpGo = 0;
    // (and by itself, as any skier does: slow on the snow and not turning hard, the skier poles, stroke after stroke, without being asked:
    // on a flat, in deep snow off the run, getting going again after a tree. It starts under V_AUTO and keeps on to V_AUTO1, then glides)
    // (a key held at that speed does not stop it: there the key turns the skis only a little and no longer skids them, see su below; it
    // waits only for a body that is over on an edge or skis that are across)
    // (turning brake b: and not while the player is steering. A skier holding a turn round to a stop does not pole out of it; poling there
    // kept a held turn going at 12-16 km/h for ever)
    S.autoP = sound && !(TB && Math.abs(u) > 0.3) && Math.abs(S.lean) < 0.16 && Math.abs(S.beta) < 0.25 && !S.jOn && sp < (S.autoP ? V_AUTO1 : V_AUTO);
    const more = sound && (calm && (S.dpGo > 0 || Input.tuck && sp < V_HOLD) || S.autoP);
    S.dpMore = more;
    if (S.dp > 0) {
      const q0 = S.dp;
      if (q0 < DP_PLANT && !(sound && (calm || S.autoP))) S.dp = Math.max(0, q0 - 2 * dt / DP_T);       // not planted and no longer possible (off the snow, hard over, hit): the hands come back
      else { S.dp = q0 + dt / DP_T; if (q0 < DP_PLANT && S.dp >= DP_PLANT) G.events.push({ type: 'pole' }); if (S.dp >= 1) { S.dp = more ? S.dp - 1 + 1e-4 : 0; if (more && S.dpGo > 0) S.dpGo--; } }
    } else if (more) { S.dp = 1e-4; if (S.dpGo > 0) S.dpGo--; }
    let aPole = 0;
    if (S.dp > DP_PLANT && S.dp < DP_END && contact) { const sq = Math.sin(PI * (S.dp - DP_PLANT) / (DP_END - DP_PLANT)); aPole = DP_DV * poleGain(sp) * 2 * sq * sq / ((DP_END - DP_PLANT) * DP_T); }
    S.tuckIn = damp(S.tuckIn, Input.tuck && S.dp === 0 && S.crash <= 0 ? 1 : 0, 5, dt);

    // ---- legs: a damped spring along the snow's normal that can only push. It is soft about the stance (one more g sits the body a hand
    // lower, so a dip and a crest can be seen) and stiffens toward the end of its travel. A wind-up or a tuck lowers where it wants to stand
    const cn = (-(CHG_E * S.charge + TUCK_E * S.tuckIn) - e) * n[1];
    let N = 0;
    if (contact) {
      // (they give way faster than they push back: what a landing puts into them is soaked up, not thrown back as a bounce)
      N = clamp(GRAV * n[1] + (cn > 0 ? K_LEG * cn + K3_LEG * cn * cn * cn : K_LEG * cn) - (vn < 0 ? C_LEG : C_REB) * vn, 0, N_MAX);
      // a hard landing is more than that spring holds. Then the legs do what a skier's do: press as hard as it takes to bring the body to
      // rest within the fold they have left, steadily, instead of running out of leg with speed in hand (up to twice the usual limit)
      if (vn < 0) { const a = vn * vn / (2 * Math.max(0.02, (e - E_MIN - 0.03) * n[1])); N = Math.max(N, Math.min(N_HARD, (GRAV * n[1] + a) * smooth(1.5 * GRAV, 3 * GRAV, a))); }
      if (nPop > 0) N = Math.max(N, GRAV * n[1]) + nPop;
    }
    // (what the others read as the load comes on and goes off over a few steps, never in one; the force itself is the legs' own)
    S.load = clamp(N, S.load - 0.35 * N_SLEW * dt, S.load + N_SLEW * dt);
    // what the edges have to work with. The legs' force comes and goes with every ripple of the snow (over a roll at speed it is nothing at
    // all for a tenth of a second), but an edge in its groove does not let go and take hold again that fast: it bites with the mean load
    // of the last quarter of a second or so (never more than twice the skier's weight: a landing is not a turn), and lets go, over a few
    // steps, only when the skis really leave the snow
    S.bite = damp(S.bite, contact ? Math.min(N, 2 * GRAV) : 0, contact ? BITE_K : 30, dt);

    // ---- off the run. Nothing steers or pushes the skier back onto it: beyond the edge gravity takes the skier wherever the land falls, as
    // anywhere else. (What did, a force toward the run's centre line and after it a steer added to the player's and an edge held against
    // the flank, read as an invisible hand dragging the skier back up against gravity.) What keeps a skier near the run is what can be
    // seen: the land (03_course.js: banks rise either side; off a ridge the flank runs down into hollows whose floors climb back to a
    // shoulder level with the run) and the snow, deep and unpacked off the run, which drags (below)
    const eo = Course.rich ? Course.offRun(p[0], p[2]) : Math.abs(p[0] - c.cx) - c.hw; S.off = eo;      // (on the richer mountain a lane beside the run is not off it)
    // (no steering turns the skier on round until it faces up the hill: as the line swings across the slope the lean asked for fades to
    // nothing, so a turn held too long ends as a traverse, still going down; height is only ever won on speed already in hand. The slope is
    // the land's own under the skier, its fall line taken over some fifteen metres so that a bump or a roller does not swing it, the same on
    // the run and off it; where the land lies nearly level there is no 'up the hill' and nothing fades. It acts on the player's own steering
    // only, and never turns the skier anywhere)
    let uE = u, hd = 0;
    { const gx = Course.height(p[0] - 15, p[2], 2) - Course.height(p[0] + 15, p[2], 2), gz = Course.height(p[0], p[2] - 15, 2) - Course.height(p[0], p[2] + 15, 2), gl = Math.hypot(gx, gz);
      const w = smooth(0.06, 0.15, gl / 30);
      if (sp > 1.5 && w > 0) { hd = Math.atan2(v[0], -v[2]) - Math.atan2(gx, -gz); hd -= TAU * Math.round(hd / TAU); hd *= w; if (u * hd > 0) uE = u * (TB ? smooth(TB_H1, TB_H0, Math.abs(hd)) : smooth(1.30, 0.80, Math.abs(hd))); } }
    S.hdOff = hd;

    // the player leans; the lean is what turns the skis (tucked, the body cannot be thrown over as far, nor the skis pivoted)
    const gn = GRAV * n[1];
    // (turning brake b: across the hill the edges hold the skier against the slope as well as round the turn. Gravity pulls a traversing
    // skier sideways down the hill (gHold, its pull across the line of travel, toward the outside of the turn asked for), and a skier set on
    // the uphill edges leans into the hill that much more, at any speed: so a slow skier can still hold a line across the slope, turn on up
    // it and stand there, where before, slow, the lean was too small to hold against the hill and the line sagged back down at ~11 km/h)
    // ---- deep carve (owner 2026-11-17 21:29: "按住下再拐…更大的幅度，也拐得更急"). Down / S held WHILE steering is the skier driving the edges
    // over: more edge angle, and a ski tipped further bends into a tighter arc (its sidecut radius times the cosine of the edge angle), so the
    // same key turns harder and the body goes over further. Down held running straight is still the tails (fore/aft b below)
    // (the steering it waits for is remembered for half a second, and the depth eased: changing edges from one deep turn to the next the keys
    // pass through no steering for a frame or two, and the depth fell to nothing and came back, the body popping up 10 cm in two frames)
    S.deepU = Math.max(Math.abs(u), (S.deepU || 0) * Math.exp(-dt / 0.5));
    const deepT = FB && Variants.val.fa === 'b' && !S.air ? clamp(-(Input.faT || 0), 0, 1) * smooth(0.15, 0.45, S.deepU) * smooth(3, 7, sp) : 0;
    const deep = S.deep = damp(S.deep || 0, deepT, deepT > (S.deep || 0) ? 8 : 5, dt);
    const cu = clamp(uE / 0.72 * (1 + 0.15 * deep), -1, 1), gHold = FB && TB && contact ? Math.max(0, sign(cu) * GRAV * ry) : 0;
    // (turning brake b: slow, the steering held right over asks for a turn far tighter than a ski bends to, from a 10.5 m arc at 40 km/h
    // down to 4 m at a crawl, the way a slow skier pivots round a tree. The sidecut below cannot carve that, so the skis are swung and
    // scraped round: a short skidded turn that also scrubs speed)
    const rMin = TB ? lerp(4, 10.5, Math.max(smooth(4, 11, sp), 1 - smooth(0.45, 0.65, Math.abs(u)))) : 10.5;      // (a steering key, which asks for 0.66 (keys d), counts as held right over)
    const phiMax = Math.min(0.96 + 0.16 * deep, Math.atan(Math.max(sp, 2.5) ** 2 / (rMin * (1 - 0.4 * deep) * gn) + gHold / gn)) * (1 - 0.3 * S.tuckIn);
    // how much skid the player asks for, 0..1: by steering past 0.72 (a, b, c), or (keys d) by the weight forward while steering at all
    const skQ = Variants.val.keys === 'd' && (Input.mode !== 'tilt' || Variants.val.fa === 'b') ? smooth(0.15, 0.8, Math.max(0, Input.faT || 0)) * smooth(0.2, 0.5, Math.abs(u)) : smooth(0.72, 1.0, Math.abs(u));
    const phiT = sign(cu) * Math.pow(Math.abs(cu), 1.2) * phiMax * (S.air && S.airT > 0.14 ? 0.3 : 1) * (1 - 0.28 * skQ * (TB ? smooth(2.5, 6, sp) : 1));      // (b: the lean given up to a skid only where there is one: under 9 km/h a full key skids nothing, see su)
    // (feel b: the faster, the a little heavier the body is to throw over: the same spring up to 50 km/h, four fifths as quick from 108. Only a
    // hint of the momentum: heavier than that read as true but tiring to ski, turn after turn (owner, 2026-11-13: real vs fun, keep it light))
    // ---- fore/aft (Variants 'fa' b, on feel b). fa: where the weight is along the skis, +1 on the shovels, -1 on the tails, 0 centred (and then
    // nothing below changes anything). ph: where in the turn the skier is, from the line against the fall line: +1 at the top of a turn (still
    // above the fall line, the edges just coming up), -1 at the bottom (past it, the turn finishing), nothing running straight or where the land
    // lies level. Pressing the shovels: the tips bite, so the body goes over quicker; at the top that is a carve that hooks up and holds a little
    // better, held on through the bottom it lightens the tails and they wash out into a skid that brakes (the way to scrub speed). Pressing the
    // tails: the tips are light, so the edges come up slower and the arc is wider; through the bottom the tails hold and the ski runs on out of
    // the turn with less drag; sat back at the top the tips do not hook and the skis wash. Timed right (forward in, back out) is the clean carve
    // (since the deep carve above, down held WHILE steering is that and not the tails (k below gives the tails' share back as deep comes on), so
    // what a player meets is: down in a turn = lower and tighter, up = the tails wash out and scrub speed. The controls text says so, 2026-11-18)
    const FA = FB && Variants.val.fa === 'b' && !S.air;
    let fa = 0, ph = 0, gripFA = 1, turnFA = 1, dragFA = 1;
    if (FA) {
      fa = S.fa = clamp(Input.faT || 0, -1, 1);
      ph = clamp(-sign(S.lean) * hd / 0.55, -1, 1) * smooth(0.06, 0.22, Math.abs(S.lean));
      const top = Math.max(ph, 0), bot = Math.max(-ph, 0);
      if (fa > 0) gripFA = 1 + fa * (0.25 * top - 0.55 * bot);
      else { const k = Math.max(0, -fa - deep); gripFA = 1 + k * (0.15 * bot - 0.35 * top); turnFA = 1 - 0.4 * k; dragFA = 1 - 0.6 * k * bot; }
      // (shovels pressed through the bottom of a turn swing the tails out by themselves, a skid that is seen and heard even in a gentle turn)
      S.faKick = fa > 0 ? fa * bot * smooth(0.1, 0.3, Math.abs(S.lean)) * smooth(6, 12, sp) : 0;
      S.faPh = ph; S.faGrip = gripFA;
    } else { S.fa = 0; S.faPh = 0; S.faGrip = 1; S.faKick = 0; }
    const wn = (S.air ? 5 : FB ? lerp(9.5, 7.5, smooth(14, 30, sp)) : 9.5) * (1 + 0.5 * fa), zeta = 0.92;
    S.leanV += (wn * wn * (phiT - S.lean) - 2 * zeta * wn * S.leanV) * dt; S.lean += S.leanV * dt;
    // (edge bite b: the edges after the body; off the snow they are the lean itself, and so they are where the body is at touchdown)
    const ebT = FB && contact && EB_T[Variants.val.ebite];
    if (ebT) { const x = S.edge, eng = S.lean * x >= 0 && Math.abs(S.lean) > Math.abs(x), tau = lerp(ebT[0], ebT[1], smooth(0.1, 1, S.powder)) * (eng ? 1 : EB_REL); S.edge = S.lean + (x - S.lean) * Math.exp(-dt / tau); }
    else S.edge = S.lean;
    const eL = S.edge;
    // past the carve range the skis are pivoted across the direction of travel: a skid that brakes and throws snow. Only when asked for:
    // rolling from one edge to the other does not swing the skis. They are swung, and let come back, as a leg moves them, not at a blow
    // (their rate of turn never jumps); and never on round past straight across the hill: there the skid is a brake and nothing else
    // (and only with speed to scrub: crawling, a key held hard is a skier trying to turn, not to stop, and swinging the skis across then
    // only stalled the skier where it stood, in a skid at walking pace, the key still held. Under 9 km/h it does not skid at all, full from 22)
    const su = sign(u) * skQ * (1 - 0.8 * S.tuckIn) * smooth(2.5, 6, sp);
    // (feel b: what the edges can hold. A carve asks for bite * tan(lean) across the line; the snow gives at most GRIP_B of the load (less in
    // powder). Asked for more, the skis wash out: the line turns only as fast as the grip allows and what is left over swings the tails out
    // into a skid, 0.6 rad of skid for each whole grip asked for beyond it, which brakes and throws snow. So the same full turn is a tight
    // carve at 30 km/h and, at 80, a wide arc that scrubs speed: nothing is on rails)
    const gripB = (FB ? lerp(GRIP_B[0], GRIP_B[1], S.powder) * (GRIP_K[Variants.val.grip] || 1) : 1) * gripFA * (1 + 0.35 * deep);   // (deep: the edges driven in hold more)
    // (turning brake b: and no tighter than the ski's own arc. Edged over at the lean, a ski bent into the snow carves a circle of its sidecut
    // radius times the cosine of the edge angle; to turn tighter than that, slow and short, it has to be pivoted and scraped round. So what
    // the edges can hold across the line is the smaller of the grip and v^2 / that radius, and a turn asked beyond it is a skid)
    // (the part of the edges' work that only holds the skier against the slope bends no arc, so the sidecut does not limit it)
    const carveB = FB && TB ? Math.min(gripB, (sp * sp / (TB_RSC * Math.max(0.3, Math.cos(eL))) + gHold) / Math.max(S.bite, 0.5 * GRAV)) : gripB;
    const exB = FB && contact && sp > (TB ? 1 : 3) ? Math.max(0, Math.abs(Math.tan(eL)) * lerp(1.0, 0.8, S.powder) / Math.max(carveB, 0.05) - 1) * (TB ? smooth(1, 3, sp) : smooth(3, 8, sp)) : 0; S.wash = exB;
    { const w = contact ? BETA_W : 9, bMax = su * hd > 0 ? Math.max(0, PI / 2 - Math.abs(hd)) : 9, bT = contact ? clamp(su * (TB ? TB_SK : 0.62) + sign(eL) * Math.min(0.75, 0.6 * exB) * (1 - Math.abs(su)) + sign(eL) * 0.35 * (S.faKick || 0) * (1 - Math.abs(su)), -bMax, bMax) : 0; S.betaV += (w * w * (bT - S.beta) - 2 * w * S.betaV) * dt; S.beta += S.betaV * dt; }
    // ---- moguls (Variants 'mog' b). gF: the rise, along the line of travel just ahead of the boots, of the part of each bump the legs take
    // (the drawn snow less what the body rides): 0 on the smooth line and on a face that falls away. What the legs do costs speed, twice:
    // they fold that far against the load (load x rise), and the face turns the skis up into it, a blow as big as the speed squared times
    // the square of the angle it turns them through (MOG_I v^2 gF^2): a face met square on costs most, one met slanting, round the
    // shoulder of the bump, far less. And the rhythm (S.mogR, 0..1), the skill of skiing bumps (owner, 2026-11-14: find the rhythm and
    // shift left and right and you go quicker; charge them anyhow and every landing slows you): a turn begun on the crest of a bump, where
    // the tips and tails are free of the snow and the skis pivot at no cost, sets the next face up to be met on the shoulder, absorbed and
    // extended back into the trough with the skis on the snow. Each edge change within MOG_WIN s of a crest builds it; an edge change in
    // the trough wears it down; crests passed without one (charging straight) let it run out. It takes up to MOG_RK of the blow away
    let mogA = 0;
    if (c.mog > 0.01 && Variants.val.mog !== 'a') {
      const dH = (x, z) => { Course.mogK = 1; const a = Course.height(x, z, 0.5); Course.mogK = MOG_K; const b = Course.height(x, z, 0.5); Course.mogK = 1; return a - b; };
      const hl = Math.hypot(v[0], v[2]) || 1, hx = v[0] / hl, hz = v[2] / hl, gF = (dH(p[0] + hx * 0.35, p[2] + hz * 0.35) - dH(p[0] - hx * 0.15, p[2] - hz * 0.15)) / 0.5;
      S.mogT += dt; S.mogF += dt; S.mogR = Math.max(0, S.mogR - MOG_RD * dt);
      // (a crest: the rise under the boots turning to a fall (S.mogA: a real rise seen since the last one). An edge change waiting from just before it counts now; else the crest waits for one)
      if (gF > 0.04 * Course.mogShape().H / 0.92) S.mogA = 1;
      else if (S.mogA && gF <= 0) { S.mogA = 0; if (sp > 2) { if (S.mogF < MOG_WIN) { S.mogR += 0.6 * (1 - S.mogR); S.mogF = 9; S.mogT = 9; } else S.mogT = 0; } }
      S.mogG = gF;
      // (an edge change: the player's steering from one side to the other, the moment it is asked for: the body follows a tenth of a second on)
      const side = u > 0.2 ? 1 : u < -0.2 ? -1 : 0;
      if (side && side !== S.mogS) {
        if (S.mogS) { if (S.mogT < MOG_WIN) { S.mogR += 0.6 * (1 - S.mogR); S.mogT = 9; } else S.mogF = 0; }
        S.mogS = side;
      }
      // (out of time: a crest that waited in vain, or an edge change that no crest followed)
      if (S.mogT >= MOG_WIN && S.mogT < 8) { S.mogR *= 0.8; S.mogT = 9; }
      if (S.mogF >= MOG_WIN && S.mogF < 8) { S.mogR *= 0.75; S.mogF = 9; }
      const up = Math.max(0, gF);
      // (and in rhythm the legs pump: folded into the face, they are pressed out again down its back, pushing the skis down the falling snow,
      // the way a rider keeps speed over a pump track; charged anyhow they only hang on, or the skis leave the snow)
      if (contact && sp > 1) { const ld = Math.max(N, 0.6 * GRAV); S.mogL = up * ld; if (Variants.val.mog === 'c') {
          // (the blow: the face's angle gathered within one leg response; a step in it costs 1/2 mu v^2 dθ^2, a long gentle ramp next to nothing)
          const th = Math.atan(up), d = th - (S.mogTh || 0), B0 = (S.mogBk || 0) * Math.exp(-dt / MOG_TAU), mu = lerp(1, MOG_MU0, S.mogR);
          let B = B0; if (d > 0) B += d; S.mogTh = th; S.mogBk = B;
          S.mogB = d > 0 ? 0.5 * mu * sp * sp * (B * B - B0 * B0) / (sp * dt) : 0; S.mogP = S.mogR * Math.max(0, -gF) * ld;
        } else { S.mogB = MOG_I * Course.mogShape().I * (1 - MOG_RK * S.mogR) * sp * sp * up * up; S.mogP = MOG_P * S.mogR * Math.max(0, -gF) * ld; }
        mogA = S.mogL + S.mogB - S.mogP; }
    } else { S.mogR = Math.max(0, (S.mogR || 0) - MOG_RD * dt); S.mogG = 0; }
    S.aMog = mogA;
    let aLat = 0, aTan = aPole; S.aReac = 0; S.aSkid = 0; S.aCarve = 0;
    if (contact) {
      const grip = lerp(1.0, 0.8, S.powder), sb = Math.sin(S.beta), cb = Math.cos(S.beta);
      const aC = S.bite * Math.tan(eL) * grip * turnFA;
      const aSk = (0.95 + 0.25 * S.powder) * S.bite * sat(Math.abs(sb) / 0.34) * smooth(0.5, 3, sp);
      // (the part of a skid that turns the skier fades as the carve's does: nothing swings the line on round up the hill)
      // (feel b: the carve's own push is held to the grip; a skid pushes too, as the tails scrape round, but all of it together no more than
      // half as much again as the grip: the edge of the turn is felt, not a wall at twice the skier's weight)
      const aCb = FB ? clamp(aC, -carveB * S.bite, carveB * S.bite) : aC;
      const lim = (FB ? gripB * 1.5 : 1.95) * S.bite, aReac = clamp(aCb + aSk * cb * sign(sb) * (sb * hd > 0 ? (TB ? smooth(TB_H1, TB_H0, Math.abs(hd)) : smooth(1.30, 0.80, Math.abs(hd))) : 1), -lim, lim);
      // the snow's friction. a: one number per kind of snow. b: stickier at a crawl (the skis have not yet warmed a film of water under them:
      // two and a half times at a standstill, as good as gone by 5 m/s), and pressing on the whole load the edges carry, the turn's push as
      // well as the weight; and deep powder ploughed: a drag as deep as the skis ride in it (the same depth the tracks draw, 17_tracks.js,
      // planing up to under half of it from 6 to 18 m/s), deeper and slower as they settle in than as they plane out, and up to twice as
      // much with the skis thrown across it
      const mog = c.mog > 0.01 ? MOG_MU * Course.bumps(p[0], p[2]) : 0, lowV = sat(sp / 0.6);       // (a field of bumps is slow going; the smooth line through it is not)
      const MB = Variants.val.mog !== 'a', aMog = MB ? mogA : 0;
      let mu = lerp(0.028, 0.06, S.powder) + (MB ? 0 : mog), plow = 0, Nf = N;
      if (FB) {
        mu = lerp(MU_B[0], MU_B[1], S.powder) * (1 + 1.5 * Math.exp(-sp / 1.5)) + (MB ? 0 : mog); Nf = Math.hypot(N, aReac);
        // (only where the skis ride IN the snow, as the tracks have it (Tracks.deep): over the soft few centimetres on a packed run or among the
        // trees they ride on top and plough nothing to speak of)
        const pdv = { a: 0.10, b: 0.18, c: 0.50 }[Variants.val.pdepth] || 0.18, soft = pdv * S.powder * S.powder, dT = soft * smooth(0.05, 0.14, soft) * clamp(0.55 + 0.45 * S.load / GRAV, 0.7, 1.4) * lerp(1, 0.45, smooth(6, 18, sp));
        S.pdep = damp(S.pdep || 0, dT, dT > (S.pdep || 0) ? 5 : 1.7, dt);
        plow = PLOW_K * S.pdep * (1 + Math.abs(sb));
      }
      aLat = aReac; const aDr = (aSk * Math.abs(sb) + (0.05 * Math.abs(aCb) + mu * Nf) * dragFA + plow + aMog) * lowV; aTan -= aDr; S.aDrag = aDr;
      S.aReac = aReac; S.aSkid = aSk; S.aCarve = aC;
      if (S.crash > 0) { aTan -= 2.5 * lowV; }
      // (it slows, never stops: down any slope worth the name the skier still gathers speed off the run, only less of it. Tried at 1 + 0.008 v^2
      // it held a skier 25 m out to 30-40 km/h on a 20-degree pitch, and the owner felt it as gravity gone wrong (2026-11-12))
      if (eo > 0) aTan -= (Course.rich ? 0.5 : 1) * (0.3 + 0.0022 * sp * sp) * sat(eo / 16) * (1 - 0.5 * Math.max(c.ridge, sat((c.rtail - 0.74) / 0.26))) * sat(sp / 6);       // deep, unpacked snow off the run (wind-packed and firmer about a ridge)
      if (S.owe > 0) { const d = Math.min(S.owe, 16 * dt, sp); aTan -= d / dt; S.owe -= d; }
    }
    // the air drags on the whole of the speed, wherever it points (in flight too); a tuck halves it, and the player's own tuck counts for more than the one the body falls into at speed
    const sp3 = Math.hypot(v[0], v[1], v[2]), kd = lerp(0.0036, 0.0021, Math.max(0.55 * S.tuck, S.tuckIn)) * sp3;
    let ax = n[0] * N + rx * aLat + tx * aTan - kd * v[0], ay = -GRAV + n[1] * N + ry * aLat + ty * aTan - kd * v[1], az = n[2] * N + rz * aLat + tz * aTan - kd * v[2];
    if (contact && sp < 2.5 && !(TB && Math.abs(u) > 0.3)) { const k = 1.6 * (1 - sp / 2.5); ax += fx * k; ay += fy * k; az += fz * k; }     // never stall: a gentle push down the fall line
    v[0] += ax * dt; v[1] += ay * dt; v[2] += az * dt;
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    // trees: brushing the branches slows a little and shakes snow loose, hitting a trunk throws the skier off line
    S.brush = Math.max(0, S.brush - dt * 3); S.crash = Math.max(0, S.crash - dt);
    // boulders: riding onto one is the low swell the body is told of (Course.rockCap); where the rock stands up as a wall the skier is
    // stopped by it the way a trunk stops them, or turned along its flank by a glancing touch. Never thrown up off it
    if (Course.rockHit && e < 2 && Course.rockHit(p[0], p[2], rk)) {
      const nx = rk.nx, nz = rk.nz, vd = v[0] * nx + v[2] * nz;
      p[0] = rk.x + nx * 0.02; p[2] = rk.z + nz * 0.02;
      if (vd < 0) {
        const imp = -vd, hd = Math.hypot(v[0], v[2]) || 1, head = imp / hd;      // head: 1 straight at it, small for a glance
        v[0] -= (1 + 0.2 * head) * vd * nx; v[2] -= (1 + 0.2 * head) * vd * nz;
        const k = 1 - 0.55 * smooth(0.25, 0.8, head); v[0] *= k; v[2] *= k;
        if (imp > 6 && head > 0.45) { if (S.crash <= 0.2) G.events.push({ type: 'crash', v: imp, x: rk.x, z: rk.z, h: rk.h, r: 1 }); S.crash = 0.9; S.leanV += (rx * nx + rz * nz) * 4; }
      }
    }
    Course.nearTree(p[0], p[2], tn);
    if (tn.ok && e < 2.5) {
      const trunk = 0.14 + tn.h * 0.012, d = tn.d;
      if (d < trunk + 0.30 && !tn.soft) {
        let nx = p[0] - tn.x, nz = p[2] - tn.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const vd = v[0] * nx + v[2] * nz; if (vd < 0) { v[0] -= 1.5 * vd * nx; v[2] -= 1.5 * vd * nz; }
        const imp = Math.max(0, -vd); v[0] *= 0.45; v[2] *= 0.45; p[0] = tn.x + nx * (trunk + 0.31); p[2] = tn.z + nz * (trunk + 0.31);
        // (brought to a stop against it, the skier shuffles round it on the side the slope goes, instead of being held there by the slope)
        if (Math.hypot(v[0], v[2]) < 3) { let ux = -nz, uz = nx; if (ux * fx + uz * fz < 0) { ux = -ux; uz = -uz; } v[0] += ux * 1.5; v[2] += uz * 1.5; }
        if (S.crash <= 0.2) G.events.push({ type: 'crash', v: imp, x: tn.x, z: tn.z, h: tn.h, r: tn.r });
        S.crash = 0.9; S.leanV += (rx * nx + rz * nz) * 4;
      } else if (d < tn.h * 0.20 && sp > 3) {
        if (S.brush <= 0) { G.events.push({ type: 'brush', x: tn.x, z: tn.z, h: tn.h, r: tn.r }); S.rusT = 0; }
        // (version b of 'tpass', 14_trees.js: for as long as the body is in among the boughs they go on rustling against it and shedding
        // snow, a little more often the faster it goes through them)
        else if (typeof Variants !== 'undefined' && Variants.val.tpass === 'b' && (S.rusT = (S.rusT || 0) + dt) > lerp(0.3, 0.16, sat(sp / 16))) { S.rusT = 0; G.events.push({ type: 'rustle', x: tn.x, z: tn.z, h: tn.h, r: tn.r, d: d / (tn.h * 0.20), v: sp }); }
        S.brush = 1; const k = 1 - 0.28 * dt; v[0] *= k; v[2] *= k;
        // the boughs give, but only so far: inside half their reach they shoulder the skier back out
        const soft = tn.h * 0.115;
        if (d < soft) {
          let nx = p[0] - tn.x, nz = p[2] - tn.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
          const push = (soft - d) * Math.min(1, 16 * dt); p[0] += nx * push; p[2] += nz * push;
          // ...and off to one side: the speed that was carrying the skier into the tree is turned along its flank, not lost
          const vd = v[0] * nx + v[2] * nz;
          if (vd < 0) { const kk = Math.min(1, 12 * dt), h0 = Math.hypot(v[0], v[2]); let ux = -nz, uz = nx; if (v[0] * ux + v[2] * uz < 0) { ux = -ux; uz = -uz; } v[0] -= vd * (nx + 0.75 * ux) * kk; v[2] -= vd * (nz + 0.75 * uz) * kk;
            const h1 = Math.hypot(v[0], v[2]); if (h1 > h0) { v[0] *= h0 / h1; v[2] *= h0 / h1; } }      // (turned, never sped up)
        }
      }
    }
  }

  // ---- body language: physical state -> pose parameters (smoothed where a real body would lag)
  const pose = G.pose = { init: false, lean: 0, bal: 0, edge: 0, crouch: 0.2, tuck: 0, air: 0, sep: 0, headYaw: 0, lead: 0, stance: 0.31, fore: 0, fa: 0, armL: [0, 0, 0], armR: [0, 0, 0], swing: 0, liftL: 0, liftR: 0, pitchL: 0, pitchR: 0, plantL: 0, plantR: 0, grabL: 0, grabR: 0, dp: 0, tilt: 0, rollL: 0, rollR: 0 };
  const root = G.root = { pos: [0, 0, 0], fwd: [0, 0, -1], nrm: [0, 1, 0] };

  // ---- flight: what a jump is going to be, worked out as the skis leave the snow (and a little before): how long in the air, what to do
  // with it, how slow the clock runs. Everything the body, the lens and the clock take from here is eased: nothing reads the bare S.air,
  // so nothing snaps when it flips.
  G.slowMo = 1; G.forceTrick = null;       // how much of the slow motion to apply (0: none); tests: the id of the trick to do next
  // (three numbers that belong to the physics, taken from it where it names them: how much of a mogul the body is told about, how fast a
  // leg can be straightened, and how far the legs are reached out for a landing. The legs that are drawn move no faster than 3.4 m/s,
  // folding or straightening: the knee bend the figure is given then never changes by more than 0.15 in a sixtieth of a second)
  const V_LEG = Math.min(typeof LEG_V !== 'undefined' ? LEG_V : 4, 3.4), L_AIR = typeof LEG_AIR !== 'undefined' ? LEG_AIR : E_MAX;
  // how far the physics has the legs folded (below 0) or reached out (above), in metres: its skis are at p.y - leg. (S.leg where it keeps
  // one; the delivered physics has the legs follow the snow to their full reach and stay there in the air)
  const legP = () => S.leg !== undefined ? S.leg : S.contact ? Math.min(S.e, E_MAX) : E_MAX;
  // (mo4 b) how long the legs are reached out for a landing and after a jump, from the hips (m; 0.08 is as straight as the figure's legs go), and
  // how much further than the physics' own sinking the hips fold into a landing (of the legs' 0.38 m of travel)
  const L_R = 0.045, ABS = 0.22, AB_DEC = 25, FOLD_MIN = -0.25;      // (FOLD_MIN: the deepest the legs fold in a landing, m: below it the figure's crouch ran into its own end, crouch 1, and stopped dead)
       // (AB_DEC, land b: the most the legs brake a landing's fold, m/s^2)
  const fl = G.flight = { P: [0, 0, 0], a: [0, -GRAV, 0], q: {}, lip: [0, 0], last: '', last2: '' };
  // a critically damped spring stepped exactly (stable whatever the frame time): o[k] follows `to`, o[k + 'V'] is its rate
  function spring(o, k, to, w, dt) { const kv = k + 'V', x = (o[k] || 0) - to, v = o[kv] || 0, e = Math.exp(-w * dt), b = (v + w * x) * dt; o[k] = to + (x + b) * e; o[kv] = (v - w * b) * e; return o[k]; }
  const bell = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x));                 // up between a and b, held, down between c and d
  const smax = (a, b, r) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + r * r)), smin = (a, b, r) => 0.5 * (a + b - Math.sqrt((a - b) * (a - b) + r * r));
  // (the greater of two with a corner that ends: more than `r` apart, the lesser has no say at all)
  const cmax = (a, b, r) => { const h = Math.max(r - Math.abs(a - b), 0); return Math.max(a, b) + h * h / (4 * r); };
  // a turn of the body: from rest, a steady rate, slowing as the skier opens up for the landing (0..1 over phase 0..1)
  const turn = (u, a = 0.14, d = 0.24) => { const vc = 1 / (1 - a / 2 - d / 2); return u <= 0 ? 0 : u >= 1 ? 1 : u < a ? vc * u * u / (2 * a) : u < 1 - d ? vc * (u - a / 2) : 1 - vc * (1 - u) * (1 - u) / (2 * d); };

  // a line that rides on the snow `g` and has weight (o[k], its rate o[k + 'V']). It goes up with rising snow at once; where the snow falls
  // away from under it at a stroke (a lip) it comes down after it like a thing dropped, from the rate it had, never faster than `lim` m/s past
  // `vRef`; and within a metre of the snow and closing on it, it is braked onto it as on a cushion, to the snow's own rate: it neither
  // jumps down a cliff nor lands with a knock. (w: how hard it is drawn down)
  function weighted(o, k, g, vRef, w, dt, lim = 6) {
    const kV = k + 'V', kP = k + 'P', gR = clamp((g - o[kP]) / dt, -40, 40), gap = o[k] - g, near = smooth(1, 0.1, gap) * smooth(-0.3, 0.3, gR - o[kV]); o[kP] = g;
    o[kV] += lerp(-w * w * gap + 2 * w * (clamp(gR, vRef - lim, vRef + lim) - o[kV]), -144 * gap + 24 * (gR - o[kV]), near) * dt; o[k] += o[kV] * dt;
    if (o[k] <= g) { o[k] = g; o[kV] = Math.max(o[kV], gR); }
  }

  // the rest of a flight: the body's path marched forward over the snow, a thirtieth of a second at a time, under the acceleration `a`
  // it has been seen to have. Returns the seconds until the legs meet the snow again (0: they never really leave it)
  function airLeft(x, y, z, vx, vy, vz, a, maxT, leg) {
    const h = 1 / 30; Course.mogK = S.mogKe || MOG_K; let g0 = Course.height(x, z, 0.5), e0 = y - g0 - leg, left = e0 > 0.02, t = 0, out = maxT;
    while (t < maxT) {
      x += (vx + 0.5 * a[0] * h) * h; y += (vy + 0.5 * a[1] * h) * h; z += (vz + 0.5 * a[2] * h) * h; vx += a[0] * h; vy += a[1] * h; vz += a[2] * h; t += h;
      const g = Course.height(x, z, 0.5);
      // (on the way down from any real height the legs are reached out for the landing, as the physics has them do)
      if (leg > L_AIR || vy * h < g - g0 && y - g - leg > 0.25) leg += clamp((L_AIR - leg) * 6, -2, 2) * h;
      const e = y - g - leg;
      if (e > 0.02) left = true; else if (left && e <= 0) { out = t - h + h * sat(e0 / (e0 - e)); break; } else if (!left && t > 0.3) { out = 0; break; }
      e0 = e; g0 = g;
    }
    Course.mogK = 1; return out;
  }
  // a lip ahead? The snow along the line being skied, sampled every twentieth of a second for the next half second: where it falls away
  // faster than a body can fall, the skis are about to leave it. fl.lipT = seconds until then, fl.lipAir = the flight it promises
  function scanLip(P, v, vh) {
    const dx = v[0] / vh, dz = v[2] / vh, st = vh * 0.05, at = s => Course.height(P[0] + dx * s, P[2] + dz * s, 0.5); Course.mogK = S.mogKe || MOG_K;
    let g0 = at(0), g1 = at(st), j = 1, hit = false;
    for (; j <= 9; j++) { const g2 = at(st * (j + 1)); if (g2 - 2 * g1 + g0 < -1.15 * GRAV * 0.0025) { hit = true; break; } g0 = g1; g1 = g2; }
    if (!hit) { Course.mogK = 1; return; }
    // (where exactly, to a hand's breadth: the point past which the snow drops below the line it was keeping)
    let lo = st * j, hi = lo + st; const sl = (g1 - g0) / st;
    for (let i = 0; i < 4; i++) { const m = 0.5 * (lo + hi); if (g1 + sl * (m - st * j) - at(m) > 0.03) hi = m; else lo = m; }
    Course.mogK = 1; const s = 0.5 * (lo + hi), lx = P[0] + dx * s, lz = P[2] + dz * s;
    if (fl.lipAge > 0.3 || Math.hypot(lx - fl.lip[0], lz - fl.lip[1]) > 2.5) {      // a lip not seen before
      fl.lip[0] = lx; fl.lip[1] = lz; const c = 0.0036 * vh;
      fl.lipAir = airLeft(lx, g1 + sl * (s - st * j) + clamp(S.e, -0.1, 0.1), lz, v[0], sl * vh, v[2], [-c * v[0], -GRAV, -c * v[2]], 4, S.leg !== undefined ? clamp(S.e, -0.1, 0.1) : E_MAX);
    }
    fl.lipT = ((fl.lip[0] - P[0]) * dx + (fl.lip[1] - P[2]) * dz) / vh; fl.lipAge = 0;
  }

  // ---- tricks. Each is a shape the body takes and holds (legs, arms, skis) and perhaps a turn of the whole figure, laid out over phase
  // u = 0..1 of the usable air: set, into it, hold, spot the landing, open up. d = the side it goes to (-1 left, +1 right).
  // q: own = how much of the body the trick has taken over, c = knees up (the crouch it wants), yaw / flip = turns of the whole figure
  // (radians), dip = a sink on the snow, a* / b* = left / right hand offsets, the rest are pose parameters to add
  function clearQ(q) { q.own = q.c = q.tuck = q.sep = q.head = q.st = q.lead = q.lL = q.lR = q.pL = q.pR = q.gL = q.gR = q.rL = q.rR = q.air = q.fore = q.yaw = q.flip = q.dip = q.ax = q.ay = q.az = q.bx = q.by = q.bz = 0; return q; }
  const hands = (q, out, y, z, k) => { q.ax -= out * k; q.ay += y * k; q.az += z * k; q.bx += out * k; q.by += y * k; q.bz += z * k; };
  const hand = (q, side, out, y, z, k) => { if (side < 0) { q.ax -= out * k; q.ay += y * k; q.az += z * k; } else { q.bx += out * k; q.by += y * k; q.bz += z * k; } };
  // a hand on the ski beside the binding, knees drawn up to meet it, the free arm out for balance, that ski tipped up
  function grabShape(q, u, d, a, b) {
    const g = bell(a, a + 0.16, b - 0.18, b, u), kn = bell(a - 0.14, a + 0.08, b - 0.06, b + 0.12, u);
    if (d < 0) { q.gL = g; q.lL = 0.12 * kn; q.pL = 0.3 * kn; q.pR = -0.12 * kn; } else { q.gR = g; q.lR = 0.12 * kn; q.pR = 0.3 * kn; q.pL = -0.12 * kn; }
    q.c = Math.max(q.c, 0.93); q.own = Math.max(q.own, kn); q.tuck += 0.3 * kn; q.st -= 0.05 * kn; hand(q, -d, 0.2, 0.2, 0.06, kn);
  }
  // a spin of n half turns about the body's own axis (base: half turns already made, i.e. starting from switch)
  // (the least air a spin is done in, as a share of its own least (TRICKS, below): and the slowest it may be hurried to)
  const SPIN_U = 0.85, spinMin = tr => (TRICKS[String(tr.id).split('+')[0]] || [0.5])[0];
  const PIVOT_T = 1.15;      // seconds the pivot back from switch takes on the snow (was 0.5)
  function spinShape(q, u, d, n, base, c) {
    // (新求解器, fl.pre: the turn was thrown on the snow, shoulders first (THROW, below). The skis leave already turning at the rate they keep, and the
    // shoulders, ahead by the throw, are caught up by the hips through the first half)
    const th = !!fl.pre && !base, a = (base + n * (th ? turn(u, 0.12) : turn(u))) * PI, b = bell(0.02, 0.2, 0.7, 0.95, u);
    q.yaw = d * a; q.c = c; q.own = b; q.tuck = 0.12 * b; q.sep = d * 0.38 * (th ? 1 - smooth(0.28, 0.55, u) : bell(0, 0.18, 0.28, 0.55, u));
    // (the head leads the turn and finds the landing before the body comes round to it; landed switch, it looks back down the hill)
    q.head = d * Math.min(Math.ceil((base + n) / 2) * TAU - a, SOLV() ? 0.7 : 1.15) *      // (新求解器: 0.7, 40 deg. On top of the chest's own lead the head stood 75 deg round from the hips, Mac round 22: the face to the camera on a body still side on)
      (base ? 1 : th ? Math.max(smooth(0, 0.12, u), 0.43) : smooth(0, 0.12, u));      // (thrown: the head is already looking round, 0.5 rad, as the skis leave)
  }
  const SHAPES = {
    // skis and hips twisted off to one side under shoulders that keep facing down the hill, and back
    shifty(q, u, d, tr) { const b = bell(0.03, 0.36, 0.54, 0.94, u); q.yaw = d * tr.amp * b; q.sep = -0.92 * q.yaw; q.c = 0.5; q.own = bell(0, 0.2, 0.72, 1, u); q.air = 0.5 * b; },
    // the same, one way and then the other
    twist(q, u, d, tr) { const e = bell(0, 0.14, 0.86, 1, u); q.yaw = d * tr.amp * 0.9 * Math.sin(TAU * u) * e; q.sep = -0.92 * q.yaw; q.c = 0.45; q.own = bell(0, 0.15, 0.8, 1, u); q.air = 0.45 * e; },
    // knees to the chest, hands on the shins
    tuck(q, u) { const b = bell(0.04, 0.34, 0.58, 0.93, u); q.c = 0.97; q.own = b; q.tuck = 0.3 * b; q.st = -0.06 * b; hands(q, -0.05, -0.16, -0.03, b); },
    // legs and arms flung wide: an X against the sky
    spread(q, u) { const b = bell(0.05, 0.3, 0.6, 0.93, u); q.c = 0.03; q.own = b; q.st = 0.7 * b; q.air = b; q.fore = 0.25 * b; hands(q, 0.10, 0.26, 0.04, b); },
    // the spread eagle (the owner: "空中的动作再加一个张腿的"): legs straight and flung apart in a wide V to the sides, each ski rolled up on its outer
    // edge with the leg (rollL/R) and its tip up, chest up, arms straight out and high; then the legs are drawn back together well before the snow (closed by 0.8 of the usable air,
    // which itself ends tOut before touchdown), so it never lands with the legs apart
    eagle(q, u) { const b = bell(0.06, 0.32, 0.56, 0.80, u); q.c = 0.02; q.own = bell(0, 0.22, 0.78, 0.97, u); q.st = 1.05 * b; q.lL = q.lR = 0.06 * b; q.rL = -0.62 * b; q.rR = 0.62 * b; q.pL = q.pR = 0.14 * b; q.air = b; q.fore = -0.15 * b; hands(q, 0.24, 0.30, 0.10, b); },
    // a stride in the air: one ski forward with its tip up, the other back with its tip down, arms opposite
    daffy(q, u, d) {
      const b = bell(0.05, 0.3, 0.6, 0.93, u); q.lead = d * 0.40 * b; q.c = 0.12; q.own = b; q.air = 0.3 * b;
      if (d > 0) { q.pR = 0.55 * b; q.pL = -0.7 * b; q.lL = 0.07 * b; } else { q.pL = 0.55 * b; q.pR = -0.7 * b; q.lR = 0.07 * b; }
      hand(q, -d, 0, 0.04, -0.18, b); hand(q, d, 0.04, 0, 0.2, b);
    },
    // knees bent back until the tails of the skis reach for the shoulders, back arched, arms up
    scratch(q, u) { const b = bell(0.06, 0.32, 0.58, 0.92, u); q.pL = q.pR = -0.8 * b; q.c = 0.55; q.own = b; q.fore = 0.6 * b; q.air = 0.65 * b; hands(q, 0.06, 0.2, 0.12, b); },
    grab(q, u, d) { grabShape(q, u, d, 0.2, 0.8); },
    180(q, u, d, tr) { spinShape(q, u, d, 1, tr.base || 0, 0.5); },
    360(q, u, d) { spinShape(q, u, d, 2, 0, 0.68); },
    540(q, u, d) { spinShape(q, u, d, 3, 0, 0.8); },
    720(q, u, d) { spinShape(q, u, d, 4, 0, 0.82); },
    '360grab'(q, u, d) { spinShape(q, u, d, 2, 0, 0.7); grabShape(q, u, d, 0.26, 0.74); },
    // a backward somersault, tucked: the tips come up and over
    flip(q, u) { const b = bell(0.06, 0.28, 0.66, 0.93, u); q.flip = TAU * turn(u, 0.18, 0.2); q.c = 0.92; q.own = bell(0.02, 0.22, 0.7, 0.95, u); q.tuck = 0.3 * b; hands(q, -0.04, -0.14, -0.03, b); },
    flipgrab(q, u, d) { SHAPES.flip(q, u); q.ax = q.ay = q.az = q.bx = q.by = q.bz = 0; grabShape(q, u, d, 0.24, 0.76); },
    // (riding switch after a half turn: a quick pivot on the snow brings the skier round to face the hill again)
    // (owner 2026-11-18: "它一下就转过去了，不可能，转正应该有一个过程". It was half a turn at a constant 444 deg/s, begun from nothing. Now PIVOT_T long and in
    // three parts: a sink with the shoulders and head going round first (the wind-up, skis still on their line), the legs pushed long and the
    // skis, light, brought round under the body with a rate that eases in and out (360 deg/s at most), then a sink to take the skis' bite, and up)
    pivot(q, u, d) {
      const a = (1 + smooth(0.2, 0.84, u)) * PI, b = bell(0.02, 0.2, 0.7, 0.95, u);
      q.yaw = d * a; q.c = 0.3; q.own = b; q.tuck = 0.12 * b; q.sep = d * 0.38 * bell(0, 0.2, 0.34, 0.62, u);
      q.head = d * Math.min(TAU - a, SOLV() ? 0.7 : 1.15);
      q.dip = 0.2 * bell(0, 0.2, 0.24, 0.46, u) - 0.05 * bell(0.26, 0.44, 0.56, 0.74, u) + 0.16 * bell(0.66, 0.84, 0.86, 1, u);
    },
  };
  // the least usable air each needs (seconds), how often it is chosen, and how much air to spare it bears before it is a small thing
  // lost in a big flight (a tweak fills a hop; the biggest air goes to the turns, the somersaults and the combinations)
  const TRICKS = { 180: [0.5, 1.6, 0.25], 360: [0.62, 4, 0.4], 540: [1.05, 1.4, 0.8], 720: [1.25, 2.8, 1], shifty: [0.34, 3, 0.2], tuck: [0.34, 2, 0.2], spread: [0.42, 2.2, 0.22], daffy: [0.5, 2.2, 0.22], scratch: [0.5, 1.2, 0.22], twist: [0.66, 1.5, 0.25], grab: [0.6, 3, 0.3], '360grab': [0.9, 3, 0.8], flip: [0.9, 2.4, 0.7], flipgrab: [1.15, 2.2, 1], eagle: [0.75, 2.4, 0.45] };
  const PAIRS = ['shifty', 'tuck', 'spread', 'daffy', 'scratch', 'grab'];
  G.tricks = Object.keys(TRICKS);
  let rnd = RNG((Math.random() * 4294967296) >>> 0); G.trickSeed = n => { rnd = RNG(n >>> 0); fl.last = fl.last2 = ''; };
  function trickShape(tr, u, q) {
    clearQ(q); if (!tr) return q;
    if (tr.seq) { const i = u < 0.5 ? 0 : 1; SHAPES[tr.seq[i]](q, u * 2 - i, i ? -tr.dir : tr.dir, tr); } else SHAPES[tr.id](q, u, tr.dir, tr);
    // (a tweak squeezed into a short hop is made smaller, not quicker: limbs are not flung out and back at whip speed. tr.k: how much of it)
    if (tr.k < 1) { const c = q.c; for (const key in q) q[key] *= tr.k; q.c = c; }
    return q;
  }
  // which trick for U seconds of usable air: something that fills the time (little air: a tweak; more: a grab, a half or full turn; the
  // most: two turns, a somersault, or two shapes one after the other), never the one just done
  // (big: 2 off a marked jump, 1 for any other flight forecast to last 0.8 s or more, 0 for a hop. A hop off a mogul or the wall of a gully gets
  // a small shape at most; a big air off the terrain may turn, but only whole turns, so it always comes down facing forward; and off the terrain
  // there is one trick at most every HOP_GAP seconds of the game's time. Spun on every bump, landing backwards and pivoting round on the snow,
  // the figure turned round every few seconds and read as a glitch, not as style. Off a marked jump anything goes, as before)
  const HOP = { grab: 1, scratch: 1, spread: 1, tuck: 1, daffy: 1 }, HOP_GAP = 6, _kc = {};
  // (seen from inside the helmet, first person or the ski tips: only shapes that keep the body upright and facing the way the lens looks. A spin or a
  // somersault would turn the figure away under a lens that keeps looking down the valley; a helmet camera that spun with it is no way to ride. And
  // ones that read from in there: the spread and the eagle fling the skis out of the picture, and in a grab the head is folded out over the ski
  // tips with the hand on the ski behind and under the lens: nothing to see. A tuck, a daffy, a tail press: hands up in front, skis below)
  const FPOK = { scratch: 1, tuck: 1, daffy: 1 }, fpView = () => G.view === 'fp' || G.view === 'tips', fpOK = id => !fpView() || String(id).split('+').every(k => FPOK[k]);
  const offKicker = () => { const s0 = -fl.P[2]; for (let b = Math.floor((s0 - 40) / 32), e = Math.floor((s0 + 16) / 32); b <= e; b++) for (const f of Course.feats.get(b) || []) {
    if (!f.mark || f.kind !== 'kicker') continue; const ds = s0 - f.s; if (ds < -14 || ds > f.len + 8) continue; if (Math.abs(fl.P[0] - Course.at(f.s + f.len, _kc).cx - f.u) < f.wid * 0.5 + 2.5) return true; } return false; };
  const bigAir = pred => offKicker() ? 2 : pred >= 0.8 ? 1 : 0, ODD = id => /^(180|540)/.test(id);
  function pickTrick(U, big) {
    if (U < 0.34) return null;
    if (typeof LabRide !== 'undefined' && LabRide && LabRide.on()) return null;      // (实验室人物: its own moves, 08i_labride.js)
    if (big < 2 && !G.forceTrick && fl.hopT != null && G.t >= fl.hopT && G.t - fl.hopT < HOP_GAP) return null;
    // (a spin goes the way the skier was last leaning, if any: carved into; n = its half turns)
    const mk = id => { const n = parseInt(id) / 180 || 0; return { id, n, spin: n > 0, base: 0, dir: n && Math.abs(S.lean) > 0.12 ? sign(S.lean) : rnd() < 0.5 ? -1 : 1, amp: 0.72 + 0.33 * rnd(), min: TRICKS[id] ? TRICKS[id][0] : 0 }; };
    if (G.forceTrick) { const ids = String(G.forceTrick).split('+').filter(id => SHAPES[id]); if (ids.length === 2) { const t = mk(ids[0]); t.id = ids.join('+'); t.seq = ids; t.spin = false; t.n = 0; t.min = 0; return t; } if (ids.length) { const t = mk(ids[0]); t.min = 0; return t; } }
    if (big && U >= 1.1 && rnd() < 0.35) {            // two shapes, one after the other
      const ok = PAIRS.filter(id => TRICKS[id][0] * 0.9 <= U / 2 && fpOK(id)), a = ok[Math.floor(rnd() * ok.length)], rest = ok.filter(id => id !== a), b = rest[Math.floor(rnd() * rest.length)];
      if (a && b && a + '+' + b !== fl.last) { const t = mk(a); t.id = a + '+' + b; t.seq = [a, b]; t.min = 1.0; return t; }
    }
    let tot = 0; const c = [];
    for (const id in TRICKS) {
      const m = TRICKS[id][0]; if (m > U || (!big && !HOP[id]) || (big < 2 && ODD(id)) || !fpOK(id) || (id === 'eagle' && SOLV())) continue;      // (新求解器 does not make the eagle yet: forced on a flat kicker, cloud 2026-11-18, the knee folds backwards for 11 frames and the ankles turn right over. Left out until its legs are made for this figure)
      // (wanted most when the air is a little more than it needs: not rushed, and fading out as the air outgrows it)
      const wt = TRICKS[id][1] * sat((U - m) / 0.15 + 0.35) * Math.exp(-Math.max(0, U - m - 0.15) / TRICKS[id][2]) * (id === fl.last ? 0.04 : id === fl.last2 ? 0.4 : 1);
      c.push(id, wt); tot += wt;
    }
    let r = rnd() * tot; for (let i = 0; i < c.length; i += 2) { r -= c[i + 1]; if (r <= 0) return mk(c[i]); }
    return c.length ? mk(c[c.length - 2]) : null;
  }
  // (what was planned on the way in stands while it suits the air there is: with too little for it, or a good deal more than it was
  // chosen to fill, something else is picked; a turn keeps the side it has been wound up to)
  const planFor = (U, old, pred) => { const big = bigAir(pred); if (old && old.min <= U && U - old.U < 0.25 && (big === 2 || (big && !ODD(old.id)) || HOP[old.id] || G.forceTrick) && (fpOK(old.id) || G.forceTrick) && (!G.forceTrick || old.id === String(G.forceTrick))) return old; const t = pickTrick(U, big); if (t) { t.U = U; t.big = big; t.k = /\d|flip|grab/.test(t.id) ? 1 : clamp((t.seq ? U / 2 : U) / 0.62, 0.5, 1); if (old && old.spin && t.spin) t.dir = old.dir; } return t; };
  const SOLV = () => Variants.val.solver === 'b', PRE_T = 0.13, PRE_U = 0.10, SPIN_LEAN = 0.22;     // (SPIN_LEAN: a spin is thrown from a flat, square stance. Leaving the lip banked over 35 deg in a turn, a 360 swapped the bent leg for the straight one a quarter turn in; from there another trick is taken)
  function startTrick(tr) { fl.tr = tr; fl.ph = 0; fl.swT = 0; if (tr.id !== 'pivot' && !tr.base) { fl.last2 = fl.last; fl.last = tr.id; G.events.push({ type: 'trick', id: tr.id, dir: tr.dir }); } }
  function flightReset() {
    Object.assign(fl, { air: false, on: false, t: 0, rem: 0, pred: 0, big: 0, w: 0, wV: 0, wu: 0, wuV: 0, plL: 0, plLV: 0, plR: 0, plRV: 0, kc: 0, kcV: 0, lipT: 9, lipAir: 0, lipAge: 9, prepL: 0, prepLV: 0, prep: 0, aK: 0, mL: 0, reach: 0, reachV: 0, soak: 0, soakV: 0, hit: 0, ph: 1, tr: null, plan: null, took: false,
      swT: 0, tOut: 0.2, ts: 1, tsV: 0, since: 9, fresh: 1, dep: 0, trick: '', sw: 0, dpK: 0, vp: null, tk: 0, tkV: 0, lean: 0, sepB: 0, hy: 0, hd: 0, hdV: 0, balG: 0, gk: 1, rl: 0, hold: 0, loadP: 0, stP: 0, pump: 0, crashK: 0, fy: 0, fr: 0, Xs: 0, sink: 0 });
    G.timeScale = 1; clearQ(fl.q);
  }
  flightReset();
  function updateFlight(dt, n) {
    const P = fl.P, p = S.p, v = S.v, q = fl.q;
    if (!pose.init) flightReset();
    P[0] = p[0] + v[0] * acc; P[1] = p[1] + v[1] * acc; P[2] = p[2] + v[2] * acc;        // where the body is at this instant (the physics stands a part of a step behind)
    const vh = Math.hypot(v[0], v[2]), sp = Math.hypot(vh, v[1]);
    if (S.air && !fl.air) {            // the skis have just left the snow
      const c = lerp(0.0036, 0.0025, S.tuck) * sp; fl.a[0] = -c * v[0]; fl.a[1] = -GRAV - c * v[1]; fl.a[2] = -c * v[2];
      fl.on = true; fl.took = false; fl.vp = null; fl.fresh = 0.45 + 0.55 * smooth(1, 5, fl.since);
    } else if (!S.air && fl.air) {     // ...and have met it again
      fl.on = false; fl.pre = 0; fl.rem = 0; fl.plan = null; fl.mL = 1; if (fl.dep > 0.15) fl.since = 0;
      // (how heavy the landing is, 0..1: the legs soak it up, the lens dips, shakes a touch and opens for a moment)
      const h = sat((S.landV - 1.5) / 9) * (0.3 + 0.7 * fl.big); fl.hit = Math.max(fl.hit, h); G.shake = Math.max(G.shake, 0.03 * h); G.fovKick = Math.max(G.fovKick, 0.08 * h);
    }
    fl.air = S.air;
    if (fl.on) {
      // (the acceleration the body really has, whatever step() does with gravity and drag: the forecast follows it)
      if (n && fl.vp) { const hh = n * (G.hs || H), r = 1 - Math.exp(-8 * hh); for (let i = 0; i < 3; i++) fl.a[i] += ((v[i] - fl.vp[i]) / hh - fl.a[i]) * r; }
      if (n) fl.vp = [v[0], v[1], v[2]];
      fl.t = S.airT + acc; fl.rem = airLeft(P[0], P[1], P[2], v[0], v[1], v[2], fl.a, 4, legP()); fl.pred = fl.t + fl.rem; fl.big = smooth(0.25, 0.45, fl.pred);
      // what to do with it: chosen once, in the first moments (what was planned on the way in, if the air is there for it)
      if (!fl.took && fl.t < 0.25) {
        fl.tOut = clamp(0.2 * fl.pred, 0.2, 0.36); const U = fl.pred - 0.05 - fl.tOut, cur = fl.tr;
        if (cur && cur.id === 'pivot') fl.took = true;                                                                    // (already coming round)
        // (owner 2026-11-18: "起跳的高度非常低，但是它就会做一个180度转向，然后非常快，一下就转回来…动作要跟真正腾空的高度搭配". A spin was chosen
        // from the lip's forecast and begun on the snow; when the skis came off lower than forecast, nothing looked again, and the turn was squeezed
        // into the air there was, up to six times its pace, or finished on the snow in a few frames. Now the flight the physics really has is
        // checked as the skis leave: a spin it cannot hold at its own pace is let go (the shoulders come back square, below), and the half
        // turn back from switch is done only in air that holds one. Riding switch, a hop too small is ridden out and pivoted on the snow)
        else if (cur && fl.pre && cur.spin && !cur.base && U < SPIN_U * spinMin(cur)) { fl.back = cur.dir * Math.max(fl.thr || 0, 0.6); fl.tr = null; fl.pre = 0; fl.thr = 0; fl.plan = null; clearQ(q); fl.took = true; }      // (and the plan goes with it: kept, it was thrown again on the snow after the hop, the shoulders held round for half a second)
        else if (cur) { if (!fl.pre && U >= spinMin({ id: '180' }) && cur.spin && ((cur.base + cur.n) & 1)) startTrick({ id: '180', dir: cur.dir, spin: true, n: 1, base: 1, amp: 1, min: 0, big: 2 }); fl.took = true; }     // riding switch: a half turn back to forward (a shape still being let go of off the last hop is simply finished)
        // (新求解器, owner 2026-11-18: "跳起来突然就转圈…转圈肯定是起的那一下要带一下的". A body in the air cannot start to turn: the turn is thrown
        // on the snow. A spin is only done when it was begun before the skis left (fl.pre, below); found in the air with nothing thrown, the
        // trick is one of the shapes that need no turn)
        else { let tr = planFor(U, fl.plan, fl.pred); if (SOLV() && tr && tr.spin) { tr = null; for (let i = 0; i < 8 && !tr; i++) { const t2 = pickTrick(U, bigAir(fl.pred)); if (t2 && !t2.spin) { t2.U = U; tr = t2; } } } if (tr) { startTrick(tr); fl.took = true; if (tr.big < 2) fl.hopT = G.t; } }
      }
    }
    // the lip ahead, while on the snow and moving
    fl.lipAge += dt; if (!S.air && vh > 5 && G.mode === 'run') scanLip(P, v, vh); if (fl.lipAge > 0.12) fl.lipT = 9;
    const lip = !S.air && fl.lipT < 0.45 && fl.lipAir >= 0.42;
    if (lip && !fl.tr) fl.plan = planFor(fl.lipAir - 0.05 - clamp(0.2 * fl.lipAir, 0.2, 0.36), fl.plan, fl.lipAir);
    if (!lip && !S.air && fl.lipAge > 0.6) fl.plan = null;
    // (新求解器: a planned spin begins on the snow, in the last tenth of a second before the lip or through the push of a jump: the shoulders go
    // first (the shape's own sep), the skis come round a few degrees, and the body leaves the snow already turning at its full rate)
    if (SOLV() && !S.air && !fl.tr && fl.plan && fl.plan.spin && Math.abs(fl.lb) < SPIN_LEAN && Math.abs(fl.lb + 0.3 * (fl.lbV || 0)) < SPIN_LEAN && S.contact && S.crash <= 0 && ((lip && fl.lipT < PRE_T) || (S.popT >= 0 && fl.lipAir >= 0.42 && fl.lipAge < 0.6))) { startTrick(fl.plan); fl.pre = 1; fl.preT = 0; fl.thr = 0; fl.back = 0; }
    // the trick runs on the time there is: its phase moves so as to be done `tOut` before the skis touch, however the forecast shifts
    const tr = fl.tr;
    if (tr) {
      if (tr.id === 'pivot') fl.ph = Math.min(1, fl.ph + dt / PIVOT_T);
      else if (fl.pre && !fl.on) { fl.preT += dt; const k = sat(Math.max(fl.lipT < 9 ? 1 - fl.lipT / PRE_T : 0, S.popT >= 0 ? S.popT / POP_T : 0)); fl.thr = Math.max(fl.thr || 0, k * k * (3 - 2 * k)); fl.ph = 0;
        // (Mac round 20: begun as the spin itself, the skis came round 15-23 deg while the track stayed straight, a sideslip with snow thrown off the
        // tails; then they waited seven frames for the lip, and jumped to full rate. On the snow only the shoulders go, the skis hold their line)
        if (fl.preT > 0.45 || Math.abs(fl.lb) > SPIN_LEAN * 1.3) { fl.tr = null; fl.pre = 0; fl.back = tr.dir * fl.thr; fl.thr = 0; clearQ(q); } }      // (thrown, and the snow did not let go, or the skier banked into a turn: the shoulders are let back, below)
      else if (fl.on) { if (fl.t > 0.05 || fl.pre) fl.ph = Math.min(1, fl.ph + dt * Math.min((1 - fl.ph) / Math.max(fl.rem - fl.tOut, 0.02), tr.spin ? 1 / (SPIN_U * spinMin(tr)) : 6)); }      // (a spin turns at the pace it left the snow with: in the air nothing can hurry it)
      else fl.ph = Math.min(1, fl.ph + dt * (tr.spin ? 2.5 : 6));      // (met the snow early: what is left of it is finished there, quickly; what is left of a turn is skidded round, not snapped)
      if (fl.tr && fl.pre && !fl.on) { clearQ(q); q.sep = tr.dir * 0.38 * (fl.thr || 0); q.head = tr.dir * 0.5 * (fl.thr || 0); } else if (fl.tr) trickShape(tr, fl.ph, q);
      if (fl.ph >= 1 && !fl.on) {
        if (!(tr.spin && ((tr.base + tr.n) & 1))) { fl.tr = null; clearQ(q); }
        // landed switch: ride it out for a moment, then pivot round on the snow
        else { fl.swT += dt; if (fl.swT > 0.6 && S.contact && S.crash <= 0) startTrick({ id: 'pivot', dir: tr.dir, spin: true, n: 1, base: 1, amp: 1, min: 0 }); }
      }
    }
    if (!fl.tr && fl.back) { const b0 = fl.back; fl.back = Math.abs(b0) < 0.02 ? 0 : b0 * Math.exp(-7 * dt); q.sep = 0.38 * fl.back; q.head = 0.5 * fl.back; }      // (a throw taken back: the shoulders come round square again in a quarter second)
    fl.trick = fl.tr ? fl.tr.id : ''; fl.sw = fl.tr && fl.tr.spin && fl.ph >= 1 && ((fl.tr.base + fl.tr.n) & 1) ? fl.tr.dir : 0;
    // how far the body has gone over to its flight shape: in over the first fifth of a second, out again before the skis touch
    // (through a spring: a forecast that changes its mind for a step, grazing a mogul, must not twitch the whole figure)
    fl.w = sat(spring(fl, 'w', fl.on ? fl.big * smooth(0, 0.22, fl.t) * smooth(0.02, 0.30, fl.rem) : 0, 30, dt));
    // how airborne, where that alone is the question (the physics' own smooth count where it keeps one)
    fl.aK = S.airK !== undefined ? S.airK : damp(fl.aK, S.air ? smooth(0.02, 0.2, S.airT) : 0, S.air ? 14 : 16, dt); fl.mL = damp(fl.mL, 0, 12, dt);
    // sinking ahead of a lip, standing up through it (prepL: the body's own setting for a jump it can see coming, as deep as the
    // flight the lip promises is long: a small lip, or one misjudged, gets a nod and not a wind-up); prep adds the wind-up
    // the player holds (S.charge: there the physics itself sits the body down, so the legs need no more from here: only arms and shoulders)
    { const to = lip && fl.lipT > 0.085 ? 0.8 * smooth(0.42, 0.75, fl.lipAir) : 0; spring(fl, 'prepL', to, to > fl.prepL ? 10 : 24, dt); fl.prep = 1 - (1 - sat(fl.prepL)) * (1 - (S.charge || 0)); }
    // (mo4 b: on the snow it is let go over half a second or so, as the skier stands up out of the landing, not in a seventh: see Xr in updatePose)
    spring(fl, 'reach', fl.on ? fl.big * smooth(0.40, 0.12, fl.rem) : 0, fl.on ? 14 : typeof Variants !== 'undefined' && Variants.val.mo4 === 'b' ? 5 : Variants.val.land === 'b' ? lerp(22, 5, fl.rlK || 0) : 22, dt);
    // the landing: a blow that the body and the lens take up and let go of
    fl.hit = damp(fl.hit, 0, 5, dt); spring(fl, 'soak', fl.hit, 15, dt);
    // the lens leaves the snow's lead a moment before the skis do (it crosses the lip a fifth of a second behind them) and comes back to it after
    // (it is asked for by degrees over the last third of a second of the approach: what is asked for at a stroke starts with a jerk)
    { const to = fl.on ? smooth(0.4, 0.62, fl.pred) : lip ? smooth(0.4, 0.62, fl.lipAir) * smooth(0.40, 0.12, fl.lipT) : 0; spring(fl, 'kc', to, to > 0 ? 11 : 5.5, dt); }
    // the clock: eased down just after takeoff, slowest through the middle of the flight, back to full speed before the skis touch. Deeper
    // the longer the flight; half as deep when jumps come one on another (a field of rollers must not turn to treacle)
    // (it begins at 0.8 s of air and is all there at a second: a hop off the skier's own legs, 0.7 s, and the common roller, 0.77 s, are
    // left at full speed. From 0.6 s, as it was, most of those were slowed a little, and a little is neither one thing nor the other)
    // (the owner, 2026-11-12: hang time. Hardly any slowing as the skis leave the lip; it deepens as the body rises and is deepest at the top of
    // the arc, then lets go on the way down. And it goes by how high the jump is: an ordinary hop is barely slowed at all, a big air a lot)
    // Hpk: the top of the arc over the snow under it, forecast on the way up (ballistic: what is left of the climb, vy^2/2g, carried forward
    // to where the top will be) and held from there on
    // (heights over the snow below, not over the sea: off a lip on a steep face the body falls all the time and still climbs away from the slope.
    // vr: how fast it climbs from the snow under it; the top of the arc is where that is nil)
    let vr = 0;
    if (fl.on) {
      const h0 = Course.height(P[0], P[2], 0.5), gx = (Course.height(P[0] + 0.5, P[2], 0.5) - h0) / 0.5, gz = (Course.height(P[0], P[2] + 0.5, 0.5) - h0) / 0.5;
      vr = v[1] - gx * v[0] - gz * v[2];
      if (vr > -0.5) { let hm = 0; const T = Math.min(fl.rem || 0, 3); for (let t = 0; t <= T; t += 0.1) hm = Math.max(hm, P[1] + v[1] * t - 4.905 * t * t - Course.height(P[0] + v[0] * t, P[2] + v[2] * t, 0.5)); fl.Hpk = Math.max(fl.Hpk || 0, hm); }
    } else fl.Hpk = 0;
    const dep = fl.on ? G.slowMo * 0.72 * Math.pow(smooth(1.4, 5.5, fl.Hpk || 0), 1.2) * smooth(0.8, 1.0, fl.pred) * fl.fresh : 0; if (fl.on) fl.dep = dep; else fl.since += dt;
    const apex = Math.exp(-((vr / 3.2) ** 2));
    const tsT = fl.on && S.crash <= 0 ? 1 - dep * apex * smooth(0.0, 0.15, fl.t) * smooth(0.10, 0.35, fl.rem) : 1;
    G.timeScale = clamp(spring(fl, 'ts', tsT, 20, dt / G.timeScale), 0.15, 1);          // (eased on the real clock, so a crash or an early landing brings time back without a jolt)
  }

  function tipClear(fl, pose, dt) {
    fl.tcL = fl.tcL || 0; fl.tcR = fl.tcR || 0;
    const W = typeof Skier !== 'undefined' && Skier.world, o = Render.origin;
    if (!W || !W.seg || !o || dt <= 0) return;
    const ce = Math.max(Math.cos(pose.edge || 0), 0.35), MO1 = typeof Variants !== 'undefined' && Variants.val.mo1 === 'b';
    for (let k = 0; k < 2; k++) {
      const tip = W.seg[k][1], sf = (x, z) => Course.height(x, z, 0.5) + (typeof Tracks !== 'undefined' && Tracks.lift ? Tracks.lift(x, z) : 0);
      // (and where the tip will be in the next few hundredths of a second, carried on at the speed it goes: at 80 km/h a mogul's face comes at it
      // faster than it could be seen and answered after the fact)
      // (mo1 b: carried on the way the ski goes, not the body. The body's own fall says nothing about the ski: on the snow the boot rides the snow
      // while the legs take the body's sinking up, and coming down to a landing the body is still falling into its legs after the ski has
      // stopped on the snow. Carried on at the body's speed the tip was seen a hand deep in snow it never reached, kicked up 23 degrees just
      // before every landing, and the tail dug in a third of a metre. So: ahead on the snow, the boot's height changes as the snow under the
      // boot does; in the air, at the body's speed less the legs' own (fl.LV), and never below the snow)
      let pen = -1;
      if (MO1) { const tl = W.seg[k][0], bq = 0.4535, bx0 = tl[0] + (tip[0] - tl[0]) * bq + o[0], by0 = tl[1] + (tip[1] - tl[1]) * bq + o[1], bz0 = tl[2] + (tip[2] - tl[2]) * bq + o[2], g0 = sf(bx0, bz0), vyS = S.v[1] - (fl.LV || 0);      // (the boot: 45% of the way from the tail to the tip)
        for (const a of [0, 0.04, 0.08]) { const x = tip[0] + o[0] + S.v[0] * a, z = tip[2] + o[2] + S.v[2] * a, gb = sf(bx0 + S.v[0] * a, bz0 + S.v[2] * a), dy = !a ? 0 : S.air ? Math.max(by0 + vyS * a, gb) - by0 : gb - g0; pen = Math.max(pen, sf(x, z) - (tip[1] + o[1] + dy)); } }
      else for (const a of [0, 0.04, 0.08]) { const x = tip[0] + o[0] + S.v[0] * a, z = tip[2] + o[2] + S.v[2] * a; pen = Math.max(pen, sf(x, z) - (tip[1] + o[1] + S.v[1] * a)); }
      // (in deep powder the shovel planes well up out of it: a hand's breadth of tip shows; owner 2026-11-12)
      pen += 0.02 + 0.06 * (typeof Tracks !== 'undefined' ? Tracks.deep || 0 : 0); const key = k ? 'tcR' : 'tcL', cur = fl[key];
      const want = clamp(cur + pen / (0.94 * ce), 0, 0.5);
      fl[key] = want > cur ? cur + (want - cur) * (1 - Math.exp(-dt / 0.03)) : cur + (want - cur) * (1 - Math.exp(-dt / 0.25));
    }
  }
  function updatePose(dt) {
    const first = !pose.init, k = first ? 1e6 : 1, kd = dt * k; pose.init = true;
    const FB = typeof Variants !== 'undefined' && Variants.val.feel === 'b', MO4 = typeof Variants !== 'undefined' && Variants.val.mo4 === 'b', MOL = MO4 || typeof Variants !== 'undefined' && Variants.val.land === 'b';
    // (speeds are the body's own: S.speed, the speed along the snow under the skis, collapses for a few steps over a lip)
    const P = fl.P, v = S.v, vh = Math.hypot(v[0], v[2]), sp = Math.hypot(vh, v[1]), q = fl.q, w = fl.w, cy = Math.cos(q.yaw);
    // the snow under the body at this instant: the snow that is drawn (hv) and, over bumps, the smoother one the body is told about (hb)
    const hv = Course.height(P[0], P[2], 0.5); let hb = hv; if (pc.mog > 0.01) { Course.mogK = S.mogKe || MOG_K; hb = Course.height(P[0], P[2], 0.5); Course.mogK = 1; } S.hv = hv;
    const eV = P[1] - hv; fl.eV = eV;
    // the snow under the skier as the lens is to take it (fl.sg): the body's own ground, but off a lip it does not vanish from under the
    // skier in a step: it sinks away to the landing below over a few tenths of a second, and the skier is seen to rise from it
    if (first || dt <= 0) { fl.sg = hb; fl.sgV = 0; fl.sgP = hb; } else weighted(fl, 'sg', hb, fl.sgV, 4.5, dt);
    // a double-pole stroke is drawn by the skier from pose.dp: while one runs, the turn pole plant, the tuck and the balance arms stand back
    const dpK = fl.dpK = damp(fl.dpK, S.dp > 0 ? 1 : 0, 14, kd); pose.dp = S.dp || 0; pose.dpn = S.dpMore ? 1 : 0; pose.chg = S.charge || 0;
    fl.crashK = damp(fl.crashK, S.crash, S.crash > fl.crashK ? 25 : 60, kd); const crash = fl.crashK;
    // tuck when running straight and fast
    // (above a hundred an hour a racer holds the tuck through long turns too, and only stands out of it to turn hard)
    const fast = smooth(24, 31, sp), wantTuck = (!S.air && sp > 15 && Math.abs(S.u) < lerp(0.12, 0.55, fast) && Math.abs(S.lean) < lerp(0.14, 0.40, fast) && S.crash <= 0 && !(S.dp > 0)) ? 1 : 0;
    S.tuckT = wantTuck ? S.tuckT + dt : 0; S.tuck = damp(S.tuck, S.tuckT > 0.45 ? 1 : 0, wantTuck ? 2.5 : 6, dt);
    // (...and at that pace nobody stands tall even to turn: between tucks it is a high tuck, hands forward and together, lower the gentler the turn)
    pose.tuckHi = damp(pose.tuckHi || 0, 0.62 * fast * (1 - 0.5 * sat((Math.abs(S.lean) - 0.4) / 0.45)) * (1 - w) * (1 - sat(S.crash * 5)), 3, dt);
    // (in the air the tuck is let go as the flight shape comes on, unless the player is holding one; a hard landing folds the chest down over the knees)
    // (mo4 b: nobody jumps out of a tuck. The tuck the skier falls into by itself at speed was kept through the wind-up and the legs' drive and let
    // go only as the flight's shape came on, a fifth of a second into the air: off a kicker the skis left the snow under knees bent 93 degrees.
    // It is let go as the jump is wound up (fl.prep: the player's wind-up, or the body's own for a lip it sees coming), at the tuck's own pace,
    // and stays off from the drive's first step until the skis are down again (fl.pop). Let go only with the drive it had to go twice as fast:
    // the trunk came up 50 degrees in a seventh of a second, a jolt in arms and head at every take-off. One the player holds is kept, as before)
    fl.pop = S.popT >= 0 || fl.pop && S.air ? 1 : 0; const rdy = MO4 ? Math.max(fl.pop, fl.prep || 0) : 0;
    pose.tuck = sat(spring(fl, 'tk', Math.max(Math.max(S.tuck, pose.tuckHi) * (1 - w) * (1 - rdy), (S.tuckIn || 0) * (1 - q.own)) * (1 - dpK) + q.tuck + 0.45 * fl.soak, 11, kd));
    pose.air = 0.42 * w * (1 - q.own) + q.air; pose.onSnow = S.contact ? 1 : 0;      // (新求解器, 08j_solver.js: whether the skis have snow under them, the physics' own word, not eased)
    // the body stands where the forces put it. Its inclination follows what the snow is pushing back with (sideways push over load: the
    // angle at which a skier is in balance), not the steering that causes it: so it is into the turn the moment the edges bite, and back
    // over the skis the moment the load comes off. (Over a crest, with no load to speak of, it holds what it had. In the air it stands over
    // its skis; and the push of a landing is believed over a few steps, not in the first one: gk.)
    // (each time the skis take load again, after a flight and just as much after every crest and mogul skied light, that angle starts
    // somewhere new, often far from where it was held: it is come to over a few steps, not in one. fl.rl: how long the load has been back,
    // and steady)
    // (...and while the load is going off fast, over a crest or a lip, there is no saying where the balance is: the physics lets the
    // load it reports fade over a few steps while the sideways push is gone in one, and for those steps their quotient means nothing.
    // The body keeps the angle it had, as a body leaving the snow does. fl.hold: 1 while the load falls faster than 500 m/s^2 a second)
    { const tS = G.stepT || 0; if (tS !== fl.stP) { fl.hold = first ? 0 : smooth(200, 500, (fl.loadP - S.load) / Math.max(tS - fl.stP, H)); fl.loadP = S.load; fl.stP = tS; } }
    fl.rl = S.load > 1.5 ? (fl.rl + dt) * (1 - fl.hold) : 0;
    if (S.load > 1.5) fl.balG = damp(fl.balG, Math.atan2(S.aReac, S.load), lerp(12, 120, smooth(0, 0.15, fl.rl)) * (1 - fl.hold), kd);
    fl.gk = damp(fl.gk, S.load > 1.5 ? 1 : 0, S.load > 1.5 ? 10 : fl.on && fl.t > 0.14 ? 9 : 0, kd); pose.bal = lerp(S.lean * 0.5, fl.balG, fl.gk);
    const balT = lerp(S.lean, clamp(pose.bal || 0, -0.92, 0.92), 0.8 * smooth(3, 9, sp));
    // (turned round in the air or riding switch, what was the body's right is its left: cy)
    fl.lean = damp(fl.lean, balT, 15, kd);
    // (the body that is drawn: the legs are its suspension, the trunk and head ride on them quiet. The load the snow pushes back with rises and falls
    // some three times a second in a carve, and the balance angle read from it with it: taken as it comes, the whole figure rocked sideways a couple of
    // centimetres at the head, three times a second. So the figure leans as the physics' own lean does (S.lean: smooth, and on time with the steering),
    // and what the balance adds to that comes through a critically damped spring of a little over 1 Hz: the turn is leaned into on time, the
    // wobble is gone. In the air, a fall or a trick it follows more closely, as before)
    const lnW = lerp(8, 30, Math.max(w, sat(crash * 5), q.own)), lnC = spring(fl, 'lnC', fl.lean - S.lean, lnW, kd); fl.lb = S.lean + lnC; fl.lbV = (S.leanV || 0) + (fl.lnCV || 0);
    // (...and the physics' own lean trembles a little too in a hard carve. What is drawn follows it through a lag that is as short as the lean is
    // quick: a hundredth of a second or two through an edge change, a fifth of a second while it is only trembling about a held angle)
    { const r = fl.lbR = first || dt <= 0 ? Math.abs(fl.lbV) : damp(fl.lbR || 0, Math.abs(fl.lbV), 8, dt), fc = (FB ? 2.5 : 0.8 + 3.5 * r) + 30 * Math.max(w, sat(crash * 5), q.own);
      fl.lbF = first || dt <= 0 || fl.lbF == null ? fl.lb : fl.lbF + (fl.lb - fl.lbF) * (1 - Math.exp(-TAU * fc * dt)); fl.lb = fl.lbF; }
    const Lv = fl.lb * cy * (1 - (fl.pre && fl.on && q.yaw ? 1 : 0.7 * w) * q.own), sL = Math.sin(Lv); pose.lean = Lv;
    // (feel b: the body goes first. The hips cross over into the new turn and the edges follow them a tenth of a second or so later, through a
    // critically damped spring, instead of rolling with the body to the same instant)
    // (medge b: to the same instant after all. A ski boot holds the shin square to the ski sideways, so an edge a tenth of a second behind the
    // body was a shin leaning 18 degrees inside its boot at every edge change, knees pointing 46 degrees apart, and half of the poles through
    // the thighs. Only the drawing: the physics never read this edge)
    { const eT = clamp(Lv * 1.12 + S.beta * 0.25 * cy, -1.3, 1.3); if (FB && !first && !(typeof Variants !== 'undefined' && Variants.val.medge === 'b')) { fl.edB = spring(fl, 'edB', eT, lerp(30, 16, (1 - w) * (1 - sat(crash * 5))), kd); pose.edge = clamp(fl.edB, -1.3, 1.3); } else { fl.edB = eT; fl.edBV = 0; pose.edge = eT; } }
    // legs. The hips ride where the physics has the body, set lower by how the skier is standing (Xs); the legs are whatever it takes to
    // get from there to the skis. fl.l is how far they are folded (below 0) or reached out (above), in metres, measured from the hips;
    // fl.L the same counted as the physics counts its own (S.leg): the skis are at P.y - L, always. The figure draws the knee bend it
    // is given with no lag of its own (its legs are its suspension), so the bend itself must move as legs move: fl.l goes no faster
    // than V_LEG either way, and takes up or gives up a pace over two steps or three, never in one. The one rule holds on the snow and
    // in the air alike: nothing changes hands when the skis leave the snow or meet it.
    // On the snow the skis stay on the snow that is drawn, down a falling slope as fast as a leg can be straightened and as far as it
    // reaches: where the snow drops away faster than that (a lip, the back of a mogul at speed) they come off it by themselves, still
    // straightening. In the air a spring says where the legs would go: from the value and the rate they had to the shape of the flight
    // (knees up for a trick: the feet come up to the hips, not the hips down) and, as that shape is let go before touchdown, out to where
    // the physics holds its own legs for the landing: the skis that are drawn and the skis that are computed meet the snow together.
    // A landing: the snow comes up under the skis faster than any leg folds (nine metres a second off a wedge). For those few steps
    // something has to give, and it is the snow: the skis go into it (a hand's breadth off a wedge, fl.sink, inside the burst of snow
    // the landing throws up) and it lets go of them as the legs catch up. Skis held on the surface would have the knees snap shut in
    // one step, or the hips stop dead in one.
    // (the hips keep the body's line only as low as folded legs can carry them, eH: the last of a hard landing the physics takes on
    // its end stop, and the hips do not go there with it)
    // (reach: coming down, the hips are let down by a hand or two against the body the physics computes, so that the legs, reached out
    // as far as the physics has its own, still have a bend in them when the skis touch: they begin to fold at that instant, and the hips
    // go on down along their line. With the knees already straight the hips would stop with the skis for a step, and then start again)
    fl.pump = damp(fl.pump, clamp(S.load / GRAV - 1, -1, 2), 9, kd);
    // (feel b: and onto the turn's push as well: the edges carry the weight and the push across together, so the hips settle lower the harder
    // the turn, a hand's width at the apex of a hard carve, and come up as it is let go)
    fl.pumpL = damp(fl.pumpL || 0, FB && S.contact ? clamp((Math.hypot(S.load, S.aReac) - S.load) / GRAV, 0, 1.5) : 0, 9, kd); const pumpL = spring(fl, 'pmL', fl.pumpL, 8, kd);
    // (the hips sink onto a loaded ski at the pace of the turn, not of the snow: the load's quick rise and fall is the knees' to take, so the sink the
    // hips are given comes through a critically damped spring of about 1.6 Hz)
    const pumpH = spring(fl, 'pmH', fl.pump, 10, kd);
    // (mo4 b: a tuck let go for a wind-up gives up its shape, not its height: the wind-up sinks from there)
    const Xo = Math.abs(Lv) * 0.10 + (MO4 && rdy > 0 && !S.air ? Math.max(pose.tuck, Math.max(S.tuck, pose.tuckHi) * (1 - w) * rdy) : pose.tuck) * 0.22 + 0.16 * smooth(17, 30, sp) + 0.25 * smooth(0, 0.25, crash) + 0.3 * fl.prepL + q.dip + 0.09 * pumpH + 0.22 * pumpL * (1 - w);
    // (mo4 b, the let-down for a landing. As it was, a fixed hand and a half came on top of whatever else already had the hips down (at speed, the
    // stance alone is 6 cm), so the skis met the snow under legs already bent 62 degrees, where a skier's are 35 to 45; and it was given back within
    // a seventh of a second of touchdown, just while the body sank into its legs, so half of that sinking was never seen: off a kicker the hips came
    // down 6 cm and the knees went to 68 degrees, where a person stepping off a 30 cm box goes from 23 to 91. Now: (1) coming down, the hips are let
    // down by what leaves the legs long (L_R), counting what the other let-downs have done already (and as long for a hop of a third of a second
    // as for a jump: fl.reach is smaller the shorter the flight, so it is taken here for its timing only); (2) what is held at touchdown stays through
    // the landing and goes out with fl.reach, which on the snow is now slow (updateFlight): as the skier stands up, not while the legs fold.
    // Held from one frame to the next it can only go out, so a hop straight out of a landing starts from what was left; (3) and the skier folds
    // into the landing, as people do: the physics' legs are a spring, and off 30 cm a spring's body stops 8 cm under its stance while a person's
    // hips go on down to knees at 91 degrees, twice as far, so as to stop gently. That fold (ABS, by how hard the snow was met) is quick down and
    // slow up, as a landing is (the owner, playing: "the instant the skis touch you go down fast, then come up slowly"): in over 0.035 s,
    // deepest 0.08 s after touchdown, out over 0.3 s. It rode on fl.reach first, deepest at a fifth of a
    // second and as slow out as in, and read as a slow sink after the snow had already been met.
    // A hard landing needs none of it: there the physics' own legs go to the end of their travel)
    let Xr = (0.12 + 2.7 * (L_AIR - 0.08)) * fl.reach;
    fl.tl = S.air ? 0 : (fl.tl || 0) + dt;      // (how long the skis have been back on the snow)
    // (land b: how much of a landing this one is. A brush off a roller's crest or a mogul, a few frames off the snow at 1 or 2 m/s, is not one, and
    // the quick fold, the slow let-go and the extra squat were jolting the whole figure at every crest: they go by this, set once at touchdown)
    if (S.air) fl.airT0 = S.airT; else if (fl.tl <= dt + 1e-6) fl.rlK = smooth(2, 4, S.landV || 0) * smooth(0.12, 0.3, fl.airT0 || 0);
    if (MOL) {
      if (S.air) { const held = fl.rrP > 0.01 ? (fl.rxP || 0) * Math.min(fl.reach / fl.rrP, 1) : 0; Xr = Math.max(sat(fl.reach / Math.max(fl.big, 0.2)) * Math.max(((fl.L || 0) - L_R) / 0.38 - Xo, 0), held); fl.rx0 = Xr; fl.rr0 = fl.reach; }
      else { const r = fl.rr0 > 0.01 ? Math.min(fl.reach / fl.rr0, 1) : 0, tl = fl.tl || 0; Xr = (fl.rx0 || 0) * r + ABS * smooth(0.5, 2.5, S.landV || 0) * fl.big * (1 - Math.exp(-tl / 0.035)) * Math.exp(-tl / 0.3) / 0.688; }
      fl.rxP = Xr; fl.rrP = fl.reach;
    }
    let Xs = clamp(Xo + Xr, -0.1, 0.8);
    const eH = cmax(eV - 0.38 * Xs, -0.32, 0.25); Xs = fl.Xs = (eV - eH) / 0.38;        // (eH: the hips' line over the snow that is drawn; Xs as it comes out with that floor)
    if (first) { fl.l = eH; fl.lV = 0; fl.L = eV; fl.LV = 0; }
    else if (dt > 0) {
      const l0 = fl.l, V0 = fl.lV, L0 = fl.L;
      // (where the legs would go by themselves: in the air to the shape of the flight, on the snow out after the snow...)
      // (mo4 b: a jump is finished before the flight's shape is taken. The physics lets the skis go at the end of its drive with the legs as they
      // are, still bent 81 degrees on average, and the figure flew off like that: nobody leaves the ground with the knees bent. While there is air
      // ahead the legs first go long, as far as the snow under them lets them (so the skis are seen to leave it as the legs straighten), then to
      // the flight's shape a tenth of a second later; and they are back where the physics holds its own before the skis touch. A jump the
      // skier drives has its straight legs already from the drive: there the knees come up at once, as in a hop, which is the spring of it)
      const lg0 = legP(), lgA = MO4 && fl.on && !fl.pop ? lerp(lg0, Math.max(lg0, L_R + 0.38 * Xs), smooth(0.12, 0.30, fl.rem)) : lg0, wl = MO4 && !fl.pop ? w * smooth(0.06, 0.20, fl.t) : w;
      let lw = S.air ? spring(fl, 'L', lerp(lgA, Math.max(0.08 - 0.38 * (lerp(0.38, q.c, q.own) - Xs), E_MIN), wl), 24, dt) - 0.38 * Xs
        : Math.min(l0 + (V0 < 0 ? Math.min(V0 + 120 * dt, 60 * dt) : Math.min(V0 + 60 * dt, V_LEG)) * dt, E_MAX + 0.03 - 0.38 * Xs);
      // (...which is in the way: the skis are on it, less what it still holds of them)
      if (lw >= eH) lw = eH + Math.max(l0 - fl.eH0, 0) * Math.exp(-20 * dt);
      // (land b: in a landing the legs fold as fast as the snow comes up: the feet stop and the hips come on at the speed of the fall, 6 m/s and more,
      // which no 3.4 m/s leg follows. Held to that the skis were drawn a hand deep in the snow at every hard landing)
      const fold = MOL && !S.air && (fl.tl || 0) < 0.25 && (fl.rlK || 0) > 0.5,      // (a real landing only: not every brush off a roller's crest)
        vF = fold ? Math.max(V_LEG, Math.min(S.landV || 0, 8)) : V_LEG, aF = fold ? 360 : 120;
      // (and, folding, it comes to the bottom the way a person does, braking at no more than AB_DEC: stopped dead on its target the hips jolted)
      let vT = (lw - l0) / dt; if (fold && V0 < 0) { const lS = Math.max(lw, eH - 0.01, FOLD_MIN); if (lS < l0) vT = Math.max(vT, -Math.sqrt(2 * AB_DEC * (l0 - lS))); }
      let l = l0 + clamp(vT, Math.max(V0 - aF * dt, -vF), Math.min(V0 + (fold ? AB_DEC : 120) * dt, V_LEG)) * dt;
      if (fold && l < Math.max(eH, FOLD_MIN) && l < l0) l = Math.min(l0, Math.max(eH, FOLD_MIN));      // (and no further than the snow: caught up, the skis are on it)
      if (l > eH + 0.45) l = eH + 0.45;
      fl.lV = (l - l0) / dt; fl.l = l; fl.L = l + 0.38 * Xs; fl.LV = (fl.L - L0) / dt;
    }
    fl.eH0 = eH; fl.sink = Math.max(fl.l - eH, 0);
    // (the knee bend is that length and nothing else: hips, shoulders and head keep the smooth line of the body the physics computes.
    // Toward either end of their travel the legs give less and less, never against a stop)
    // (mo4 b: through a jump's drive the legs are asked for straight, over the drive itself. The figure eases into whatever it is asked over
    // 0.08 s (its flow: nothing may snap), so legs that only followed the hips up were drawn 0.08 s behind the skis: these left the snow under
    // knees still bent 56 degrees. Asked for straight from the drive's first step they were (the owner: "a straight-legged jump, it used to
    // spring"): the push has to be seen. So the ask rises with the drive (pose.drive, below) over its first half, and the figure, 0.08 s behind as ever, stands up over the
    // whole of it: the thighs straighten while the skis are still on the snow (the owner: "first the thighs stand up, then you leave"). Asked faster
    // than that the legs reached straight and stopped dead, a jolt at every jump. If the drive ends a frame before the skis leave, the ask stays;
    // once they have been in the air it is the landing's again)
    // (mo4 b: through a jump's drive the hips are the game's own. The lab's turns (08f_labmo.js) hold a real skier's turning posture, knees 60
    // degrees and more at low speed, and handed the figure over to the air only over a quarter second; so a hop out of a turn left the snow with
    // the legs still bent as they were (the owner: "the thighs haven't stood up and you're already in the air"). pose.drive takes the hips' height
    // from the lab back to the game's legs as the drive builds, holds it through the air, and gives it back over 0.3 s once on the snow)
    { const on = S.popT >= 0 || S.air && fl.pop; fl.dAir0 = fl.dOn; fl.dOn = on; if (on) { fl.dv = S.air ? 1 : smooth(0, 0.5, S.popT / POP_T); fl.dOff = 0; fl.dAir = S.air ? 1 : S.popT >= 0 && !fl.dAir0 ? 0 : fl.dAir; } else fl.dOff = (fl.dOff || 0) + dt;
      pose.drive = MO4 ? (on ? fl.dv : (fl.dv || 0) * (1 - smooth(0, 0.3, fl.dOff))) : 0; }
    pose.crouch = clamp(smin(smax((0.08 - (MO4 && pose.drive > 0 && !S.air && !fl.dAir ? lerp(fl.l, Math.max(fl.l, 0.08), pose.drive) : fl.l)) / 0.38, 0.03, 0.1), 1, 0.15), 0, 1);
    fl.sepB = damp(fl.sepB, -S.beta * 0.8 - fl.lean * 0.22, 8, kd); fl.hy = damp(fl.hy, fl.lean * 0.3 + S.beta * 0.3, 6, kd);
    // (a turn in the air is wound up on the way in: shoulders drawn back against it as the body sinks, thrown into it as it stands up)
    // (the head is turned as a head is, through a spring: the look into a spin begins and ends without a jerk)
    // (the wind-up too: a plan can change, or be dropped, from one step to the next)
    // ---- motion (Variants 'motion' b; mo eases a switch over). Separation: the skis are turned across the fall line by the turn, the shoulders go only
    // a third of the way with them and the hips half, so the legs are seen to turn under a quiet trunk; the head looks between the fall line and the
    // way it is going. (Most of it below the fall line, where the skis come round under a trunk that faces down the hill and leans out over them; above
    // it, facing the fall line is facing into the new turn, and a trunk folded forward that way would dive into it.) Taken through critically damped
    // springs: the trunk is heavy and comes round late, never at a jerk. (Only on the snow, forwards,
    // with the skis under the body: in the air, a tuck, a stroke or a fall the old reading stands. gnd: how far all that holds)
    const mo = fl.mo = first ? (Variants.val.motion === 'a' ? 0 : 1) : damp(fl.mo, Variants.val.motion === 'a' ? 0 : 1, 4, dt);
    // (Variants 'mocap' b, mcK easing a switch over: the upper body through a turn as a real skier moves it, 06c_mocap.js; it takes the place of the
    // separation, the hands' reach round the turn, the flex-and-rise, the swing of the poles and their plant, and the fore and aft of motion b)
    const mcK = fl.mcK = first ? (Variants.val.mocap === 'b' && Variants.val.labmo !== 'b' ? 1 : 0) : damp(fl.mcK, Variants.val.mocap === 'b' && Variants.val.labmo !== 'b' ? 1 : 0, 4, dt);
    if (first) Mocap.reset(); const MC = Mocap.update(Lv, dt);
    const gnd = fl.gnd = (1 - w) * (1 - dpK) * (1 - sat(S.crash * 5)) * smooth(3, 8, sp) * smooth(0.3, 0.8, cy) * (1 - 0.6 * smooth(0.3, 1, pose.tuck)) * (1 - sat(Math.abs(q.yaw) * 3));
    // (mogul b, in a field of bumps: the trunk faces straight down the hill whichever way the skis point, the head still, as the judges want it:
    // the legs turn under it. fl.mogU eases in and out over half a second)
    fl.mogU = damp(fl.mogU || 0, Variants.val.mog !== 'a' && pc.mog > 0.01 ? 1 : 0, 2, kd);
    const wr = a => Math.atan2(Math.sin(a), Math.cos(a)), fall = Course.yawAt(-P[2]), skY = Math.atan2(root.fwd[0], -root.fwd[2]), skR = wr(skY - fall), trR = vh > 1 ? wr(Math.atan2(v[0], -v[2]) - fall) : skR;
    // (the trunk follows the skis, never leads them: its own heading is the skis' heading taken through the heavy spring, and only the part of
    // the turn it does not share (kS) is held back. Before, the spring sat on the separation itself, so the trunk's heading was the skis' less
    // a late copy of them, which runs AHEAD of the skis (by some 80 ms in a mogul line): the shoulders seemed to turn the legs, owner 2026-11-14.
    // No spring on the result (even a quick one put the trunk ahead again): only gnd, how far all this holds, is eased (fl.gS))
    const kS = lerp(lerp(0.3, 0.8, smooth(-0.04, 0.04, skR * fl.lean * cy)), 1, fl.mogU), skL = spring(fl, 'skL', skR, 6, kd);
    const sepM = clamp((1 - kS) * skL - skR, -0.85, 0.85) * (fl.gS = damp(fl.gS == null ? gnd : fl.gS, gnd, 12, kd)), hdM = spring(fl, 'hdM', clamp((0.35 * trR - 0.34 * skR) * gnd - 0.15 * skR * gnd, -0.7, 0.7) * (1 - fl.mogU), 9, kd);
    pose.quiet = fl.mogU;
    { const wu = spring(fl, 'wu', fl.plan && fl.plan.spin && !fl.pre ? fl.plan.dir * 0.3 * fl.prep : 0, 20, kd); pose.sep = lerp(lerp(fl.sepB * cy, sepM, mo), lerp(fl.sepB * cy, MC.sep, gnd), mcK) + q.sep - wu; pose.sepQ = q.sep - wu; pose.hdQ = spring(fl, 'hq', q.head, 16, kd); } pose.headYaw = clamp(spring(fl, 'hd', lerp(lerp(fl.hy * cy, hdM, mo), fl.hy * cy * (1 - gnd), mcK) + q.head, 16, kd), -1.3, 1.3);
    // (the inside ski draws ahead as the edges come up: hardly at all in a shallow turn)
    pose.lead = 0.19 * sL * Math.abs(sL) + q.lead; pose.stance = 0.31 + 0.16 * Math.abs(sL) + 0.04 * w + q.st;
    fl.foreS = damp(fl.foreS || 0, clamp(-0.25 * w * (1 - q.own) + q.fore - 0.5 * fl.soak, -1, 1), 8, kd); pose.fore = fl.foreS;
    // (mo4 b: reaching for a landing the chest stays forward over the feet, and through the landing while the legs fold: see solve)
    pose.reach = MOL ? fl.reach : 0;
    // (land b, the owner 2026-11-18: "跳得高，落地有一个比较明显的蹲下去缓冲，而且是一接地赶紧缓冲". Stopping a fall of v over a distance d costs v^2 / 2d: met at
    // 6 m/s and stopped in the 16 cm the hips used to travel that is 11 g, in 45 cm 4 g, which is why a person lands on long legs and folds deep. The
    // physics' own legs are stiffer than a person's (they stop 6 m/s in 28 cm), so for a hard landing the figure sits further down by itself
    // (pose.lnd, LND_H in 08_skier.js): in over 0.07 s from the touch, deepest 0.13 s after it, out over 0.4 s)
    { const tl = fl.tl || 0; pose.lnd = MOL && !S.air ? smooth(4, 8, S.landV || 0) * (fl.rlK || 0) * (fl.bigL || 0) * (1 - Math.exp(-tl / 0.07)) * Math.exp(-tl / 0.4) / 0.61 : 0; if (S.air) fl.bigL = fl.big; }
    // (mo4 b: for the first quarter second of a landing the figure takes the knee bend it is given more quickly (08_skier.js, flow). That bend is
    // already paced as legs move (V_LEG, above); eased a second time at the usual rate it reached its depth 0.08 s after the legs did, and a
    // hard landing read as a slow sink after the snow had been met)
    pose.cfast = !MOL || S.air ? 0 : (MO4 ? 1 : fl.rlK || 0) * (1 - smooth(0.2, 0.4, fl.tl));
    // (fore/aft, Variants 'fa': the stance itself moved, not a spring on it. Forward: hips over the toes, shins pressed into the tongues, chest a
    // little lower; back: hips behind the heels, sitting into the boots. 08_skier.js draws it from pose.fa; nothing of it in the air or a trick)
    pose.fa = damp(pose.fa || 0, (S.fa || 0) * (1 - w) * (1 - q.own) * (1 - sat(S.crash * 5)) * (1 - smooth(0.3, 0.9, pose.tuck)), 9, kd);
    pose.liftL = q.lL; pose.liftR = q.lR; fl.tipUp = damp(fl.tipUp || 0, S.contact && typeof Tracks !== 'undefined' ? (Tracks.deep || 0) * lerp(0.22, 0.14, smooth(5, 18, sp)) * (1 - w) : 0, 5, dt);
    // (in deep powder the skis ride tips up, planing: the shovels come up out of the snow and the tails run low in it, more so when slow)
    // and whatever else: a ski's shovel never digs into the snow (the owner: '任何情况下雪橇的头都不应该扎到雪里面'). A real ski bends and its tip
    // rides up over a hollow, a mogul's face, the lip of the run-out, the powder; this one is stiff, so where its tip would be under the
    // snow as drawn (the ground, and round the skier the powder standing above it: Tracks.lift) it is pitched up at the boot until the
    // shovel stands 2 cm clear. Measured on last step's skis, raised within a few hundredths of a second, let down over a few tenths
    tipClear(fl, pose, dt);
    pose.pitchL = q.pL; pose.pitchR = q.pR; pose.tipL = fl.tipUp + fl.tcL; pose.tipR = fl.tipUp + fl.tcR; pose.rollL = q.rL; pose.rollR = q.rR; pose.grabL = q.gL; pose.grabR = q.gR;
    // the pole plant: as one turn is let go the new inside pole swings forward, and its basket touches the snow beside the ski tip at the
    // moment the edges change; then it is left behind. (A gentle change of direction gets half a swing and no touch.)
    const quiet = (Variants.val.poles === 'a' ? 1 - sat(pose.tuck * 3) : 1 - sat((pose.tuck - 0.25) * 2.5)) * smooth(3, 7, sp) * (1 - fl.aK) * (1 - sat(S.crash * 5)) * (1 - dpK) * (1 - sat(Math.abs(q.yaw) * 3));
    // (when: timed to the edge change itself, not to how fast the lean goes. The body's own lean is watched heading through zero, and the plant is
    // asked for PL_LEAD seconds before it gets there, however quick the change (a mogul line changes edges three times a second): the basket is in
    // the snow as the edges change and stays a moment while the body goes past it. A turn must have been a turn (pk: the most it leaned) to earn one)
    if (dt > 0) { const lv = fl.lnV = damp(fl.lnV || 0, (fl.lean - (fl.lnP == null ? fl.lean : fl.lnP)) / dt, 25, dt); fl.lnP = fl.lean; fl.plT = (fl.plT || 0) + dt;
      const sn = Math.sign(fl.lean); if (!fl.plSg) fl.plSg = sn; if (sn === fl.plSg) fl.plPk = Math.max(fl.plPk || 0, Math.abs(fl.lean));
      const sg = fl.plSg, tc = sn === sg ? (fl.lean * lv < 0 ? Math.abs(fl.lean / lv) : 9) : Math.abs(fl.lean) < 0.25 ? 0 : 9;   // (crossed already, between two steps: at once)
      // (fast, the pole is only swung forward and flicked toward the snow, not planted: at 50 km/h and more a tip held in the snow is left
      // behind by a third of a metre a frame, and the pole whipped back and was pulled out again within three or four frames, a twitch of the
      // hand and the pole at every turn, owner 2026-11-13 '手还有杆莫名其妙抽搐'. A plant asked for at half its reach never touches: no pin)
      if (sg && tc < PL_LEAD) { const pk = fl.plPk || 0; fl.plSg = -sg; fl.plPk = 0; if (pk > 0.14) { fl.plS = -sg; fl.plT = 0; fl.plDur = tc + PL_HOLD; fl.plK = lerp(0.62, 1, smooth(0.14, 0.32, pk)) * lerp(1, 0.5, smooth(8, 13, sp)); } } }
    const plWant = side => Variants.val.poles === 'a' ? quiet * sat(side * S.leanV * 0.75 - 0.15) * smooth(0.62, 0.20, -side * S.lean) * smooth(0.20, 0.03, side * S.lean)
      : fl.plS === side && fl.plT < (fl.plDur || 0) ? quiet * fl.plK : 0;
    // hands ahead: a skier carries the hands in front and a little wide, at the height of the belt, the outside hand reaching on round the turn;
    // the inside one forward and up, ready for its plant; never trailing down by the knees (act: how much the skiing stance is on: not in a tuck, a stroke, the air or a fall)
    const act = (1 - smooth(0.2, 0.8, pose.tuck)) * (1 - dpK) * (1 - fl.aK) * (1 - sat(S.crash * 5)) * smooth(2, 6, sp), sLn = Math.sin(fl.lean * cy);
    { const H = HANDS[Variants.val.poles] || HANDS.b; if (!fl.ha) fl.ha = H.slice(); for (let i = 0; i < 7; i++) fl.ha[i] = damp(fl.ha[i], H[i], 5, kd); }     // (a version switched in play eases over)
    // hands, beyond what the stance gives them: low and back as the body sinks before a jump, forward and apart to meet the landing,
    // forward and down as a hard one is taken up, and wherever the trick wants them
    // (a landing: the hands go forward and up for balance as the legs take it, not down to the knees)
    // (新求解器, the deep squat of a full charge (08_skier.js CHG_H): with the hips under the knees the fists of the tuck lay on the thighs and the
    // forearms went through the knees (Mac round 18; 92 of 213 charged frames within the thigh). The hands are carried forward, up and a little
    // apart as the squat deepens: elbows ahead of the knees, fists before the chin)
    const SQX = 0.03, SQY = 0.08, SQZ = -0.12; const hk = 1 - dpK, hy0 = (-0.05 * fl.prep + 0.05 * fl.reach + 0.04 * fl.soak) * hk, hz0 = (0.08 * fl.prep - 0.12 * fl.reach - 0.16 * fl.soak) * hk, sq = Variants.val.solver === 'b' ? (S.charge || 0) * hk : 0, hx = (0.05 * fl.reach + 0.04 * fl.soak) * hk + SQX * sq;
    const hy = hy0 + SQY * sq, hz = hz0 + SQZ * sq;
    const grabs = typeof Skier !== 'undefined' && Skier.P0 && 'grabL' in Skier.P0;     // (does the figure know how to take hold of a ski? if not, the hand is at least sent there)
    for (const side of [-1, 1]) {
      // (wanted from the last third of the old turn until the new edges have just begun to bite: a touch, not a prop to lean on)
      const key = side < 0 ? 'plantL' : 'plantR', want = plWant(side);
      // (it is asked for at a stroke; the hand sets off after it through a spring, without a jerk)
      pose[key] = sat(spring(fl, side < 0 ? 'plL' : 'plR', want, want > (pose[key] || 0) ? 16 : 11, dt * k));      // (16 / 11: the swing set going and given back without a flick, owner 2026-11-13)
      if (mcK > 0) pose[key] = lerp(pose[key], (side < 0 ? MC.plL : MC.plR) * quiet * lerp(1, 0.5, smooth(8, 13, sp)), mcK);      // (mocap: the plant is where the turn is, no spring)
      const a = side < 0 ? pose.armL : pose.armR, pl = pose[key], g = grabs ? 0 : side < 0 ? q.gL : q.gR;
      const out = sat(-side * sLn * 1.6) * (1 - mcK), inn = sat(side * sLn * 1.6) * (1 - mcK), ac = act * (1 - g), HA = fl.ha, hm = side < 0 ? MC.hL : MC.hR;
      a[0] = side * (0.03 * pl + hx - 0.13 * g + HA[0] * ac) + (side < 0 ? q.ax : q.bx) * hk; a[1] = 0.03 * pl + hy - 0.6 * g + (HA[1] + HA[3] * out + HA[5] * inn) * ac + (side < 0 ? q.ay : q.by) * hk; a[2] = -0.10 * pl + hz + 0.32 * g - (HA[2] + HA[4] * out + HA[6] * inn) * ac + (side < 0 ? q.az : q.bz) * hk;
      if (mcK > 0) for (let i = 0; i < 3; i++) a[i] += hm[i] * ac * gnd * mcK;
    }
    // (b: the poles do not swing to a clock: they nod with how the legs are loaded and with the body going over, and with the snow's chatter)
    pose.swing = lerp(Math.sin(G.t * 2.3) * 0.25 + S.leanV * 0.12, S.leanV * 0.12 + 0.16 * clamp(fl.pump, -1, 1) + 6 * (fl.chat || 0), mo) * hk * (1 - mcK);
    // (angulation: in a turn the knees and hips go inside and the chest stays nearer upright over the outside ski; the more it is laid over the more so.
    // Through a spring: the trunk comes upright a moment after the legs tip in)
    pose.tilt = spring(fl, 'tlt', -0.17 * fl.lean * cy * smooth(0.08, 0.6, Math.abs(fl.lean)) * gnd, 9, kd) * mo;
    // ---- motion b, the legs. Through an edge change the body flexes to let the old turn go (the edges come off as the knees fold), rises as it goes
    // over the skis into the new one, and sinks onto the new outside ski as it loads (that last part is the physics' own load, pump, above). Read off
    // the lean and how fast it is going: rel while it is going back toward upright from a turn, ent while it is leaving upright for the next.
    // A landing is soaked up by the legs (the physics) and then comes back past level once, as a body does: an underdamped spring set going by the
    // speed the snow was met with (ld). At speed the snow is never quite smooth: a tremor through the legs and the hands, faster the faster it goes.
    { const lv = fl.lbV || 0, aL = Math.abs(fl.lb), rel = sat(-fl.lb * lv / 1.2) * smooth(0.04, 0.3, aL), ent = sat(fl.lb * lv / 1.2) * smooth(0.55, 0.12, aL);       // (read off the lean that is drawn: its rate is smooth)
      const fx = spring(fl, 'xo', (0.13 * rel - 0.17 * ent) * gnd, 11, kd);
      if (dt > 0) { if (fl.wasAir && !S.air) fl.ldV = (fl.ldV || 0) + Math.min(S.landV || 0, 9) * 0.2; const x = fl.ld || 0, vv = fl.ldV || 0, W = 7, Z = 0.3, ac = -W * W * x - 2 * Z * W * vv;
        fl.ldV = vv + ac * dt; fl.ld = x + fl.ldV * dt; } fl.wasAir = S.air;
      if (dt > 0) fl.dist = ((fl.dist || 0) + sp * dt) % 4096;
      const ch = fl.chat = 0.011 * smooth(10, 30, sp) * (1 - w) * (1 - 0.6 * (S.powder || 0)) * (vnoise1(fl.dist * 0.42, 31) * 0.7 + vnoise1(fl.dist * 1.1, 37) * 0.3);
      pose.crouch = clamp(pose.crouch + lerp(mo * fx, MC.crouch * gnd, mcK) + mo * (fl.ld || 0) * (1 - w), 0, 1);
      // (feel b: fore and aft on the snow. Into a new turn the shins press the boots and the hips go forward over the feet; through the apex they
      // are centred; out of it the weight comes back toward the tails; and whatever the snow is braking with (a skid, the powder) sets the body
      // back on its heels a little. Through a spring of a little under 1 Hz: the weight shifts, it does not jump)
      const foT = FB ? clamp((0.55 * ent - 0.35 * rel - 0.06 * (S.aDrag || 0)) * gnd, -0.6, 0.6) : 0;
      pose.fore = clamp(pose.fore + spring(fl, 'foB', foT, 5.5, kd) * (1 - mcK), -1, 1);       // (the snow's chatter is not put into the knee bend: with the feet on the snow that moved the hips and everything above them)
      for (const a of [pose.armL, pose.armR]) { a[1] += mo * (1.6 * ch * (1 - mcK) - 0.25 * (fl.ld || 0)) * hk; a[2] -= mo * 0.4 * (fl.ld || 0) * hk; } }
    if (crash > 0.001) { const wb = Math.sin(crash * 22) * crash; pose.armL[1] += 0.18 * crash + 0.05 * wb; pose.armR[1] += 0.18 * crash - 0.05 * wb; pose.sep += wb * 0.25; }
    // ---- root frame
    // the feet (on the snow they stand on the snow that is drawn; over bumps the body rides a smoother line and the legs make up the difference)
    const fy = fl.fy = P[1] - fl.L;
    // how the skis lie. On the snow: along the line of travel, on the snow's own plane taken over their length (tail, boot, tip, and a hand
    // to either side): a ski bridges a hollow, and over a lip it keeps the line it had instead of nodding down after the falling snow.
    let dx, dz; if (vh > 1) { dx = v[0] / vh; dz = v[2] / vh; } else { const l = Math.hypot(S.t[0], S.t[2]) || 1; dx = S.t[0] / l; dz = S.t[2] / l; }
    // (toward the end of a flight the snow that matters is the snow the skis will come down on: the plane is taken there, `ah` seconds ahead)
    const ah = fl.on ? fl.rem * smooth(0.5, 0.34, fl.rem) * smooth(0, 0.12, fl.t) : 0, qx = P[0] + v[0] * ah, qz = P[2] + v[2] * ah;
    const rx = -dz, rz = dx, Lh = 0.8, Wh = 0.45; Course.mogK = S.mogKe || MOG_K;
    const gC = ah > 0 ? Course.height(qx, qz, 0.5) : hb, gT = Course.height(qx - dx * Lh, qz - dz * Lh, 0.5), gF = Course.height(qx + dx * Lh, qz + dz * Lh, 0.5), gL = Course.height(qx - rx * Wh, qz - rz * Wh, 0.5), gR = Course.height(qx + rx * Wh, qz + rz * Wh, 0.5); Course.mogK = 1;
    const sR = (gC - gT) / Lh, sF = (gF - gC) / Lh, sc = 0.5 * (sR + sF), sk = clamp(vh > 1 ? v[1] / vh : sc, Math.min(sF, sc), Math.max(sR, sc)), sl = (gR - gL) / (2 * Wh);
    let nx = -sk * dx - sl * rx, ny = 1, nz = -sk * dz - sl * rz; { const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; }
    let fx = dx, fyv = sk, fz = dz; { const l = Math.hypot(fx, fyv, fz); fx /= l; fyv /= l; fz /= l; }
    // In the air: along the flight path, nose slightly up, level from side to side. The one passes into the other as the skis come clear
    // of the snow; and over the last third of a second of a flight the skis are laid back onto the plane of the snow they are about to
    // meet (m), so at touchdown they are already lying along it: nothing turns at the instant of contact
    { const il = 1 / (sp || 1); let ax = v[0] * il, ay = v[1] * il + 0.10 * w, az = v[2] * il; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
      let ux = -ax * ay, uy = 1 - ay * ay, uz = -az * ay; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const m = fl.on ? smooth(0.34, 0.04, fl.rem) : fl.mL, wo = sp > 1 ? (1 - (1 - w) * (1 - smooth(0.03, 0.15, fy - hv))) * (1 - m) : 0;
      fx += (ax - fx) * wo; fyv += (ay - fyv) * wo; fz += (az - fz) * wo; nx += (ux - nx) * wo; ny += (uy - ny) * wo; nz += (uz - nz) * wo; }
    // (followed with a spring, not a lag: when what it follows steps, it starts to move without a jolt)
    spring(fl, 'fX', fx, 30, kd); spring(fl, 'fY', fyv, 30, kd); spring(fl, 'fZ', fz, 30, kd); spring(fl, 'nX', nx, 30, kd); spring(fl, 'nY', ny, 30, kd); spring(fl, 'nZ', nz, 30, kd);
    { const l = Math.hypot(fl.nX, fl.nY, fl.nZ) || 1; nx = fl.nX / l; ny = fl.nY / l; nz = fl.nZ / l; const d = fl.fX * nx + fl.fY * ny + fl.fZ * nz; fx = fl.fX - nx * d; fyv = fl.fY - ny * d; fz = fl.fZ - nz * d; const m = Math.hypot(fx, fyv, fz) || 1; fx /= m; fyv /= m; fz /= m; }
    // the skis pivoted across the line of travel by the skid angle (which the physics lets go of by itself in the air), and the turns of a
    // trick: a spin about the body's own long axis, a somersault about the hips
    let ox = 0, oy = 0, oz = 0;
    { const a = S.beta + q.yaw, c = Math.cos(a), s = Math.sin(a), bx = fyv * nz - fz * ny, by = fz * nx - fx * nz, bz = fx * ny - fyv * nx; fx = fx * c + bx * s; fyv = fyv * c + by * s; fz = fz * c + bz * s; }
    if (q.flip) {
      const c = Math.cos(q.flip), s = Math.sin(q.flip), Hc = 0.98 - 0.38 * pose.crouch, ax = fx * c + nx * s, ay = fyv * c + ny * s, az = fz * c + nz * s, ux = nx * c - fx * s, uy = ny * c - fyv * s, uz = nz * c - fz * s;
      ox = (nx - ux) * Hc; oy = (ny - uy) * Hc; oz = (nz - uz) * Hc; fx = ax; fyv = ay; fz = az; nx = ux; ny = uy; nz = uz;
    }
    pose.mogK = S.mogKe == null ? 1 : S.mogKe;      // (新求解器: how much of a mogul's height the physics rides, the rest the legs are to take)
    pose.sink = S.contact ? fl.L - S.e : 0;      // (新求解器: how far under the physics' own snow the figure's skis are put: soft snow, a landing)
    root.pos[0] = P[0] + ox; root.pos[1] = fy + oy; root.pos[2] = P[2] + oz; root.fwd[0] = fx; root.fwd[1] = fyv; root.fwd[2] = fz; root.nrm[0] = nx; root.nrm[1] = ny; root.nrm[2] = nz;
    // (what the lens frames by: the feet on the snow; in the air the level the feet would hang at, which does not bob as the knees come up)
    fl.fr = lerp(fy, P[1] + 0.03 - 0.38 * Xs, fl.kc);
    // (...and the snow the lens goes by cannot stay above them: coming down on that line faster than it sinks, the skier takes it along,
    // and the two reach the real snow together)
    if (!S.contact && fl.sg > fl.fr && fl.sg > hb) { fl.sg = Math.max(fl.fr, hb); fl.sgV = Math.min(fl.sgV, v[1]); }
  }

  // ---- chase camera: behind and above, looking down the mountain past the skier
  const _ca = {}, _cb = {};
  function updateCamera(dt) {
    const p = fl.P, v = S.v, aspect = Render.W / Math.max(1, Render.H), portrait = aspect < 1, first = !cam.init; cam.init = true; const q = first ? 1e6 : 1;
    // (the speed the lens goes by is the body's own. S.speed, the speed along the snow under the skis, collapses for a few steps over a
    // lip, and a lens that sets its distance and its angle by it stalls and lunges: that was the hitch at takeoff. It is taken through
    // a spring: a hard landing scrubs a metre or two per second off in one step, and that must not be a step in the lens's own speed)
    if (first) { cam.sp = Math.hypot(v[0], v[1], v[2]); cam.spV = 0; }
    const sp = spring(cam, 'sp', Math.hypot(v[0], v[1], v[2]), 16, dt), k = smooth(6, 30, sp), kc = fl.kc;
    // the lens looks down the valley, whichever way the valley is running just here, and goes a little over half way with the skier's own turns
    const cyw = Course.yawAt(-p[2]), vyaw = lerp(cyw, Math.atan2(v[0], -v[2]), smooth(0.8, 2.5, Math.hypot(v[0], v[2])));
    // off the run and going slowly (lost among the trees, getting going again after one), the lens turns away from the skier's own line
    // toward the run: to a point on its middle some thirty metres down, so the open lane between the trees is in the picture and it is
    // plain which way to go; and it stands a little higher and further back to see over the snow. cam.lost 0..1, eased over a second or
    // two either way. (Nothing moves the skier: only the picture turns)
    { const s0 = -p[2], c = Course.at(s0, _ca), eo = Course.rich ? Course.offRun(p[0], p[2]) : Math.abs(p[0] - c.cx) - c.hw, to = G.mode === 'run' ? smooth(3, 16, eo) * lerp(0.2, 1, smooth(8, 3.5, sp)) : 0;
      spring(cam, 'lost', first ? 0 : to, to > (cam.lost || 0) ? 1.6 : 1.0, dt * q);
      if (cam.lost > 1e-3) { const cR = Course.at(s0 + 30, _cb), ry = Math.atan2(cR.cx - p[0], 30); cam.ryaw = 0 * clamp(ry - cyw, -0.3, 0.3); } }
    const lost = cam.lost || 0, cyl = cyw + lost * (cam.ryaw || 0);
    cam.cyaw = damp(cam.cyaw == null || first ? cyl : cam.cyaw, cyl, 1.3, dt * q);
    cam.yaw = damp(cam.yaw, cam.cyaw + clamp((vyaw - cam.cyaw) * 0.55 * (1 - 0.3 * lost), -0.7, 0.7), 2.4, dt * q);
    // drift toward the inside of the turn: the curtain hangs just outside the track, and from in here the lens looks along its lit face instead of flying through it
    cam.side = damp(cam.side, S.lean * 0.55 + S.beta * 0.5, 2.2, dt * q);
    cam.roll = damp(cam.roll, -S.lean * 0.20, 5, dt * q);
    // the camera rides low, at about hip height: the skier and the thrown snow stand up against the valley and the sky, and the snow rushes past close.
    // in a hard turn it sinks a little more and swings wide, so the curtain is between the lens and the sun
    cam.low = damp(cam.low || 0, sat(Math.abs(S.lean) / 0.8) * (1 - kc), 3, dt * q);
    const CL = G.camL;
    // (the point the lens follows trails the skier by a sixteenth of a second: most of that is taken back out of the distance, or the figure would shrink as the speed went up)
    // on a steep pitch the lens rides higher and nearer, and so looks down the fall line: the slope is seen to drop away under the skier
    { const s0 = -p[2], sl = (Course.at(s0 - 14, _ca).baseY - Course.at(s0 + 14, _cb).baseY) / 28; cam.steep = damp(cam.steep || 0, smooth(0.44, 0.58, sl), 1.2, dt * q);
      cam.slA = damp(cam.slA == null || first ? Math.atan(Math.max(0, sl)) : cam.slA, Math.atan(Math.max(0, sl)), 1.0, dt * q); }
    // (坡感, the owner 2026-11-14: the runs felt flat although they are 20-31 degrees. The level line was held a fifth below the top of the
    // picture on every pitch, so a steep and a gentle run made the same picture. b: on a pitch the lens may look down past that, by about
    // 0.85 of the pitch over 7 degrees, so the far edge of the world climbs out of the top and the snow falls away below. c: b, and the lens
    // also stands up to 1.6 m higher and 0.8 m further back there, to see the run drop below the skier. Only the height and the
    // pitch move, slowly with the slope; never the angle round the skier)
    const pcue = typeof Variants !== 'undefined' ? Variants.val.pcue : 'a', slX = pcue === 'a' ? 0 : smooth(0.2, 0.55, cam.slA || 0) * 0.85 * Math.max(0, (cam.slA || 0) - 0.12), slH = pcue === 'c' ? smooth(0.2, 0.55, cam.slA || 0) : 0;
    // among trees (a glade; the woods off the edge of a run) the lens closes up on the skier, sits lower and opens a touch: cam.wood, 0..1.
    // Four metres back its line cuts the corners of the skier's own, through the boughs the skier has just gone round; close behind, it goes
    // where the skier went. It comes on a second ahead of the trees and goes off more slowly behind them. On an open run nothing changes
    // (nothing at all: the last ten-thousandth of its going, a tenth of a millimetre of the lens's place, is not waited for)
    // (The groups of trees that stand out on an open run are left to 14_trees.js: tried, a lens that closed up for each of them was on
    // the move two thirds of a powder run)
    // (Only in version b of the owner's choice: switched to another, it goes off as it does behind the last tree)
    { const s0 = -p[2], c = Course.at(s0, _ca), e = Math.abs(p[0] - c.cx) - c.hw, to = typeof Variants !== 'undefined' && Variants.val.wood !== 'b' ? 0 : Math.max(smooth(0.15, 0.75, Math.max(c.glade, Course.at(s0 + sp, _cb).glade)), smooth(4, 16, e) * smooth(0.3, 0.7, c.forest));
      spring(cam, 'wood', to, to > (cam.wood || 0) ? 2 : 0.9, dt * q); if (!to && cam.wood < 1e-4) cam.wood = cam.woodV = 0; }
    // the picture of this kind of run (SHOTS), taken over through springs some three seconds long: a new section comes into the lens,
    // never in a cut, and switching the owner's choice glides the same way. (Not in a tall window: that branch is left as it was; nor on the title page, which has its own picture)
    { const sg = Course.segAt(-p[2]), T = !portrait && G.mode !== 'title' && typeof Variants !== 'undefined' && (Variants.val.shots === 'b' ? SHOTS[sg.type] : Variants.val.shots === 'c' ? SHOTS_C[sg.type] : null) || SH0, sd = sg.idx & 1 ? -1 : 1, w = 1.3;
      spring(cam, 'shH', T[0], w, dt * q); spring(cam, 'shF', T[1], w, dt * q); spring(cam, 'shK', T[2], w, dt * q); spring(cam, 'shO', T[3] * sd, w * 0.8, dt * q); spring(cam, 'shG', T === SH0 || Variants.val.shots !== 'b' || sg.type !== 'gully' ? 0 : 1, w, dt * q); }
    // a marked jump: the lens swings out about fifteen degrees to one side as the skier lines up for it (from about 100 m), so the lip stands
    // clear beside the figure instead of hidden behind it, and through a flight the forecast says will last over a second it stays out there
    // and drops: the skier crosses the horizon side-on with the landing below. It comes back once the skis are down. cam.jw 0..1 (all of
    // it), cam.ja 0..1 (the flight's share: the lens turns from the lip to the skier); jSide is chosen as it starts, toward the run's middle
    { let to = 0; const s0 = -p[2];
      if (!portrait && sp > 11) for (let b = Math.floor(s0 / 32), e = Math.floor((s0 + 84) / 32); b <= e; b++) for (const f of Course.feats.get(b) || []) {
        if (!f.mark) continue; const ds = f.s + f.len - s0, du = Math.abs(p[0] - Course.at(f.s + f.len, _ca).cx - f.u);
        to = Math.max(to, smooth(105, 70, ds) * smooth(-1, 3, ds) * smooth(f.wid * 0.5 + 5, f.wid * 0.5 + 1, du) * smooth(12, 16, sp)); }
      // (a kicker air of 0.6 to 1 s gets the same at half strength, and swings out quicker: the lip and the drop beside the figure, not a
      // hop seen from behind. Only off the kickers of a kicker run: the hops of a mogul field stay as they were)
      const pr = fl.pred || 0, kick = Course.segAt(s0).type === 'kickers', air = fl.on && !S.contact ? Math.max(smooth(0.85, 1.05, pr), kick ? 0.5 * smooth(0.55, 0.75, pr) : 0) : 0, quick = air > 0 && air < 0.55; to = Math.max(to, air);
      if ((cam.jw || 0) < 0.01 && to > 0) { const c = Course.at(s0, _cb); cam.jSide = p[0] > c.cx ? -1 : 1; }
      spring(cam, 'jw', to, to > (cam.jw || 0) ? (quick ? 3.6 : 1.8) : 1.4, dt * q); spring(cam, 'ja', air, air > (cam.ja || 0) ? (quick ? 6 : 4) : 1.6, dt * q);
      // the owner (2026-11-12): the lens must never swing to the side on its own at a jump. Off: it stays behind the skier.
      cam.jw = 0; cam.ja = 0; }
    // the title page: the lens looks toward the sun or the moon, whichever lights the scene (when it is up and somewhere ahead; else a little left of the valley), and is swung
    // round the figure until the skier stands on the right third, across the picture from the words. tLook: where it looks, tPsi: the
    // way from the lens to the skier. Both glide (the sun moves; the window can change shape)
    const idl = cam.idle == null ? 1 : cam.idle;
    { let look = cam.yaw + G.titleYaw;
      if (typeof Sky !== 'undefined' && Sky.sunDir) { const sd = Sky.sunDir(), el = Math.asin(clamp(sd[1], -1, 1)); let da = Math.atan2(sd[0], -sd[2]) - look; da = Math.atan2(Math.sin(da), Math.cos(da)); look += da * smooth(-0.03, 0.03, el) * smooth(1.1, 0.7, Math.abs(da)); }
      const psi = look + Math.atan(aspect * Math.tan(cam.fov / 2) / 3); cam.tLook = first ? look : damp(cam.tLook, look, 2, dt); cam.tPsi = first ? psi : damp(cam.tPsi, psi, 2, dt); }
    const orb = cam.shO + (cam.jSide || 1) * (0.27 + 0.1 * (cam.ja || 0)) * cam.jw + (portrait ? 0 : idl * (cam.tPsi - cam.yaw));
    // (each stroke of a double-pole push gives the lens a small pull: it falls back a hand's breadth and opens a touch as the skier drives. Where the physics has no strokes yet, leaving the gate gives one such pull)
    const drive = spring(cam, 'drv', S.dp > 0 ? bell(0.22, 0.36, 0.5, 0.7, S.dp) : cam.launch || 0, 9, dt * q); cam.launch = damp(cam.launch || 0, 0, 3.5, dt);
    // (in the air it draws back a little, the more the higher the skier is over the snow, but never by much: the figure has to stay
    // large enough for the trick to be read. cam.hA: that height, as the lens takes it, a little late)
    spring(cam, 'hA', first ? 0 : Math.max(0, fl.fr - fl.sg), 5, dt * q);
    // the lens: wider with speed (and in the air, on a stroke, among trees), then the section's own (cam.shF)
    const fovS = (portrait ? lerp(1.30, 1.50, k) : lerp(CL.f0, CL.f1, k) + 0.10 * smooth(29, 41, sp)) + 0.05 * kc + 0.035 * drive + CL.wf * cam.wood, fovT = fovS + cam.shF;
    // (the distance to the skier as the picture sees it: the lens's own and the sixteenth of a second it trails by, sp / 16. As the lens
    // widens with speed the figure shrank to a seventh of the frame on the steeps at 115 km/h: from 80 km/h up the distance gives back
    // what the widening takes, so the figure holds about a fifth even tucked. A narrower lens for the section stands back by as much)
    let dist = (portrait ? lerp(5.6, 5.0, k) : lerp(CL.d0, CL.d1, k)) - 0.75 * Math.min(sp, 46) / 16 - 0.45 * cam.steep + 0.3 * kc + smin(0.3 * cam.hA, 1.4, 0.7) + 0.12 * drive - CL.wd * cam.wood + 0.7 * lost + 0.8 * slH;
    // (the title page stands a metre further back: the skier, the sun a fifth of the way down and the valley all have room)
    // (and through a long flight it comes in closer than it would on the snow, so the figure is large against the sky as it goes over)
    if (!portrait) dist += 1.0 * (cam.idle == null ? 1 : cam.idle) - 0.8 * (cam.ja || 0);
    if (!portrait) { const lag = sp / 16, zc = (1 - Math.tan(CL.f0 / 2) / Math.tan(fovS / 2)) * smooth(22, 32, sp); dist = (dist + lag) * (1 - zc - 0.08 * smooth(25, 33, sp)) * Math.tan(fovS / 2) / Math.tan(fovT / 2) - lag; }
    // (on the title page the lens stands lower, so that pitched up to bring the sun a fifth of the way down the frame it still has the
    // skis in the picture; lining up for a marked jump it stands higher, and looks onto the face of the takeoff instead of along it)
    const hC = (portrait ? lerp(1.6, 1.3, k) : lerp(CL.h0, CL.h1, k)) - 0.3 * cam.low + 0.6 * cam.steep - CL.wh * cam.wood + cam.shH - 0.95 * (cam.idle == null ? 1 : cam.idle) + 0.6 * cam.jw * (1 - (cam.ja || 0)) + 0.55 * lost + 1.6 * slH;
    const yo = cam.yaw + orb, dx = Math.sin(yo), dz = -Math.cos(yo), rx = Math.cos(yo), rz = Math.sin(yo);
    const a = cam.anchor;
    a[0] = damp(a[0], p[0], 16, dt * q); a[2] = damp(a[2], p[2], 16, dt * q); a[1] = damp(a[1], fl.fr, 9, dt * q);
    // before the run the lens idles: a slow drift from side to side, always turned back toward the figure
    cam.idle = damp(cam.idle == null ? 1 : cam.idle, G.mode === 'title' ? 1 : 0, 1.2, dt); const sway = cam.idle * 1.3 * Math.sin(G.t * 0.12);
    let cx = a[0] - dx * dist + rx * (cam.side + sway), cz = a[2] - dz * dist + rz * (cam.side + sway);
    // trees are solid to the lens too: it slides round the boughs instead of flying through them
    // (it looks a little way ahead along its own path as well, so the swerve starts before the boughs arrive)
    { let m = 0;
      for (let i = 0; i < 3; i++) {
        const la = i * 1.6, qx = cx + dx * la, qz = cz + dz * la; Course.nearTree(qx, qz, tnc);
        if (tnc.ok) { const R = tnc.h * 0.24 + 0.8; if (tnc.d < R) { const mi = ((qx - tnc.x) * rx + (qz - tnc.z) * rz >= 0 ? 1 : -1) * (R - tnc.d) * (1 - i * 0.22); if (Math.abs(mi) > Math.abs(m)) m = mi; } }
      }
      // (not among trees, cam.wood: there it would be stepping aside all the time, off the skier's line and into the next one's boughs,
      // and the trees it steps round are out of the picture before it reaches them: 14_trees.js takes out what stands against the lens)
      cam.dodge = 0; m = 0; /* off (the owner, 2026-11-12: the lens never jumps aside by itself; 14_trees.js fades what stands against it) */ cx += rx * cam.dodge; cz += rz * cam.dodge; }
    // height: follow the snow under the camera with a spring that tracks a steady descent exactly (no lag on a constant slope) but rounds off bumps
    // (gy: the snow under the lens with the bumps of a mogul field left out, as the lens has always taken it. Coming down behind a jump
    // it can meet that floor, so there the floor stands as far above it as the bumps do: mF)
    // (that margin comes on through a spring: a lip called in the middle of a mogul field must not lift the floor under the lens at a stroke)
    const gy = Course.height(cx, cz, 2), bm = Course.bumps(cx, cz), mF = spring(cam, 'mF', 0.8 * bm * smooth(0, 0.5, kc), 5, dt * q);
    if (first) { cam.dip = 0; cam.dipV = 0; cam.fk = 0; cam.fkV = 0; cam.shk = 0; }
    if (first || dt <= 0) { cam.gy = gy; cam.gv = 0; cam.tPrev = gy; cam.hOff = hC; cam.ys = p[1]; cam.yv = v[1]; cam.oS = gy + hC - p[1]; cam.fl = cam.flP = gy + 0.7 + mF; cam.flV = 0; cam.hA = 0; cam.hAV = 0; }
    else {
      // (the floor the lens keeps above, cam.fl: 0.7 m over the snow under it, and a thing with weight. It rides up with rising snow at
      // once, but where the snow falls away from under it - the lens crossing a lip, a moment behind the skier - it comes down after it
      // like something dropped, starting from the rate it had. With the skier in the air the lens's own ground line follows that floor
      // and not the bare snow: no edge of a lip, with three metres of air behind it, ever reaches the lens. It is drawn down harder than
      // a thing merely dropped: the skier is falling too, and a lens held up on that floor would never get down beside a short flight)
      const g7 = gy + 0.7 + mF; weighted(cam, 'fl', g7, cam.flV, 4.5, dt, 3);
      const T = gy + smooth(0, 0.3, kc) * (cam.fl - g7), w = 7.5, vT = clamp((T - cam.tPrev) / dt, -40, 40); cam.tPrev = T;
      cam.gv += (w * w * (T - cam.gy) + 2 * w * (vT - cam.gv)) * dt; cam.gy += cam.gv * dt;
      // (with the skier in the air a second spring follows the skier's own body, late: the body rises against the lens off the lip, hangs,
      // and falls away from it toward the landing; when the skis stop, the lens is still coming down)
      const ws = 3.6; cam.yv += (ws * ws * (p[1] - cam.ys) + 2 * ws * (v[1] - cam.yv)) * dt; cam.ys += cam.yv * dt;
    }
    // between banks (a gully, the trough of a turn in deep snow) the lens rides higher, so the picture is the run ahead and not the bank beside it
    const bankT = clamp(0.45 * (Math.max(Course.height(cx + rx * 7, cz + rz * 7, 2), Course.height(cx - rx * 7, cz - rz * 7, 2)) - gy - 0.5), 0, 2.4);
    // (...except in a gully under the owner's 'shots' b: there the lens keeps low between the walls, and the walls stand up in the picture)
    cam.bank = damp(cam.bank || 0, bankT * (1 - 0.7 * (cam.shG || 0)), 2.2, dt * q);
    // (and over a mogul field a hand higher: at hip height the crests come up to within a hand of the lens, nearer than it can see)
    cam.hOff = damp(cam.hOff, hC + cam.bank + 0.25 * bm, 2.5, dt * q);
    // (in flight the lens follows the body late, and low. Off the lip it is where the ramp had it, a little over a metre above the skis;
    // once the snow has fallen half a metre to two metres away beneath them it sinks to about the level of their knees: the skier stands
    // up out of the landing slope against the far side of the valley and the sky, and the height is seen from the side, as height. A
    // lens that stays above looks down on the figure flat against the snow, and three metres of air read as none. Coming down, the
    // same rule lifts it again before the snow has to. On the snow that offset is simply kept equal to where the lens is: no seam)
    cam.oS = damp(cam.oS, lerp(cam.gy + cam.hOff - cam.ys, lerp(1.25, 0.05 - 0.55 * (cam.ja || 0), smooth(0.5, 2, fl.fr - fl.sg)), smooth(0.05, 0.6, kc)), 5, dt * q);
    // (a landing presses the lens down for a moment)
    spring(cam, 'dip', fl.soak, 12, dt * q);
    // ...and that flight line keeps clear of the snow under the lens: of its own rounded ground line, cam.gy (riding 0.7 m over the
    // bare snow it would take every crease in it), and from well off, by a wide corner (wider, the higher the flight: the lens comes
    // down fast behind a big drop). So the ramp behind a lip hands the lens over to the flight, and the landing slope takes it back,
    // over a metre or two and not in a step. Only then are the line on the snow and the line in the air mixed, by how far into a
    // flight the skier is: on the snow the floor has no say, and coming back to it after a landing there is no corner left to close.
    // (The last resort is the weighted floor itself, not the bare snow under it, which vanishes at a lip; and its corner has an end,
    // so a floor well below the lens does not reach it at all)
    const fly = smax(cam.ys + cam.oS, cam.gy + 0.7 + mF, 1.2 + 0.2 * cam.hA);
    cam.pos[0] = cx; cam.pos[2] = cz; cam.pos[1] = cmax(lerp(cam.gy + cam.hOff, fly, kc) - 0.3 * cam.dip, cam.fl, 0.4);
    // and it never drops below the skier's knees (the skier on a crest, the lens still in the dip behind): it would be looking up at the sky
    // (except through a jump: there the lens is late on purpose, and for a moment the skier stands over it against the sky)
    { const lo = fl.fr + 0.55 - 4 * kc * kc, y = cam.pos[1]; cam.pos[1] = 0.5 * (y + lo + Math.sqrt((y - lo) * (y - lo) + 0.09)); }
    // (the lens kick, G.fovKick: a heavy landing sets it, and the lens opens a touch within a tenth of a second and closes again. It is
    // taken through a spring and added outside the slow follow of the lens: quick, and still without a corner)
    spring(cam, 'fk', G.fovKick, 14, dt);
    cam.fovB = damp(first ? fovT : cam.fovB, fovT, 3, dt * q); cam.fov = cam.fovB + cam.fk;
    // frame the skier in the lower part of the picture, whatever the slope is doing
    // (a wide picture is framed by the snow under the skis, which sits a fixed way up from its lower edge; standing at the start there is a
    // little more room under it. So in the air nothing has to be decided: the lens keeps looking at the snow, the skier leaves it and
    // rises in the picture by just the height gained, hangs, and comes back down to it; the slope and the shadow stay in view below)
    const hd = Math.hypot(p[0] - cam.pos[0], p[2] - cam.pos[2]) || 1, th = Math.tan(cam.fov / 2);
    const eFeet = Math.atan2(fl.fr - 0.1 - cam.pos[1], hd), eHead = Math.atan2(fl.fr + 1.85 - cam.pos[1], hd);
    const pitchT = portrait ? Math.atan2(fl.fr + 0.95 - cam.pos[1], dist) + Math.atan(0.27 * th) : Math.atan2(fl.sg - 0.1 - cam.pos[1], hd) + Math.atan((CL.kf + cam.shK - 0.05 * cam.idle) * th);
    // (on the title page the lens is pitched by the sun instead, so that it stands a fifth of the way down the frame (0.47: measured, the
    // drawn disc sits a little above the sun line through glare and refraction): by day, with the sun
    // in the picture. The limits below still hold the skis and the head in it)
    let pT = pitchT;
    if (cam.idle > 0.001 && !portrait && typeof Sky !== 'undefined' && Sky.sunDir) {
      const sd = Sky.sunDir(), el = Math.asin(clamp(sd[1], -1, 1)), az = Math.atan2(sd[0], -sd[2]), hh = Math.atan(aspect * th);
      let da = az - cam.tLook; da = Math.atan2(Math.sin(da), Math.cos(da));
      pT = lerp(pitchT, el - Math.atan(0.47 * th * Math.cos(da)), cam.idle * smooth(-0.03, 0.03, el) * smooth(hh + 0.15, hh - 0.1, Math.abs(da)));
    }
    // (looking down a steep pitch the far edge of the world must not leave by the top: the level line, and the city on it, stays at
    // least a fifth of the frame below the top edge. Not on the title page, which is pitched by the sun; the skis still win, below)
    if (!portrait) { const ph = -Math.atan(0.62 * th) - slX * (1 - (cam.idle || 0)); pT = lerp(pT, smax(pT, ph, 0.03), 1 - idl); }
    // ...and whatever the snow does (a drop off a crest, a landing) the skis never leave by the lower edge, nor the head by the upper
    // (the limits are rounded where they take hold: the lens is turned by them, not struck)
    // (the owner, 2026-11-14: the title page shook. The lens was eased toward the sun and then pushed back by the skis' limit, and the
    // eased value was kept: each frame the ease pulled by an amount that grows with the frame's length and the limit took it back, so
    // with frames of uneven length the picture nodded a third of a degree up and down, frame by frame. Now the limits shape the aim
    // before the ease, and the eased value, cam.pitchS, is never written back by them: the limits only shape what is shown)
    const pMax = eFeet + Math.atan((0.90 - 0.2 * cam.idle) * th), pMin = eHead - Math.atan(0.74 * th), lim = x => smin(smax(x, Math.min(pMin, pMax), 0.03), pMax, 0.03);
    cam.pitchS = first || cam.pitchS == null ? lim(pT) : damp(cam.pitchS, lim(pT), 4.5, dt * q);
    cam.pitch = lim(cam.pitchS);
    G.fovKick = damp(G.fovKick, 0, 3, dt); G.shake = damp(G.shake, 0, 5, dt); cam.shk = damp(cam.shk, G.shake, 30, dt);
    const sh = cam.shk, t = G.t;       // (only the one-off jolts: a landing, a fall, a bough. The constant fine tremor at speed is gone: it read as a stutter, and sickened)
    const ox = vnoise1(t * 17, 1) * sh, oy = vnoise1(t * 19, 2) * sh;
    // pushed aside by a tree, the lens turns back toward the skier so the figure never leaves the frame
    cam.pull = 0;   // off (the owner: no glances at animals; the lens stays on the skier)                 // something worth a glance beside us
    // (dA: what these two turns take the lens's distance to be. `dist` is measured from the point the lens follows, which trails the skier
    // by sp / 16 s: past about 140 km/h in a tuck (sooner, closing up among trees) it goes below nothing, and an atan2 of nothing over
    // less than nothing is half a turn. That was the lens thrown round to look back up the hill, the skier gone (the owner, 2026-11-12))
    const dA = Math.max(dist, 0.5);
    const ly = yo - (cam.jSide || 1) * 0.27 * cam.jw * 0.6 * (1 - (cam.ja || 0)) + Math.atan2(-cam.dodge, Math.max(lerp(dA, hd, cam.wood), 0.5)) * 0.9 + Math.atan2(-sway, dA) * 0.85 + (portrait ? 0 : (cam.tLook - cam.tPsi) * cam.idle) + cam.pull;
    const cp = Math.cos(cam.pitch), f = [Math.sin(ly) * cp, Math.sin(cam.pitch), -Math.cos(ly) * cp];
    cam.fwd = f;
    // (a tree gone by close, untouched: the lens ducks a finger's breadth and tips away from it, as 07c_feel.js has worked out; both
    // come and go without a corner, and the other viewpoints are handed the same lens)
    const fe = typeof Feel !== 'undefined' ? Feel : null, pos = [cam.pos[0] + rx * ox, cam.pos[1] + oy - (fe && fe.dip || 0), cam.pos[2] + rz * ox];
    // (the last word, the same for every lens (Course.nearLift): whatever moved it - a jolt, the flinch past a tree, the floor above taken
    // without the bumps of a mogul field - the corners of the picture stay out of the snow. It only ever lifts, never turns the lens)
    pos[1] += Course.nearLift(pos, f, cam.fov, aspect, Render.cam.near || CAM_NEAR, 0.05, cam.roll);
    // other viewpoints (07b_views.js) take the lens over here; the chase camera above keeps running underneath, so switching back is seamless
    const viewOver = G.viewCam && G.viewCam(dt, cam, pos, f);
    
    if (viewOver) return;
    Render.setCamera(pos, v3.add(pos, f), [0, 1, 0], cam.fov, cam.roll + vnoise1(t * 13, 3) * sh * 0.5 + (fe && fe.roll || 0));
  }

  // push off: a couple of skating strides' worth of speed straight down the fall line
  G.start = function () {
    G.mode = 'run'; G.runT = 0;
    const n = S.n; let fx = n[0] * n[1], fy = n[1] * n[1] - 1, fz = n[2] * n[1]; const fl = Math.hypot(fx, fy, fz) || 1;
    if (S.speed < 6) { if (S.speed < 1.2) { S.v[0] = fx / fl * 1.2; S.v[1] = fy / fl * 1.2; S.v[2] = fz / fl * 1.2; } S.dpGo = 3; }      // (the poles do the rest: up to three double-pole strokes, see step)
    // (the lens gives with the lunge, and the skis kick a little snow back: leaving the gate is a moment, not a fade)
    if (S.dp === undefined) cam.launch = 2.2; G.events.push({ type: 'push' });
  };
  G.update = function (dt) {
    G.t += dt; let n = 0;
    if (G.mode === 'run') {
      G.runT += dt; acc += dt;
      // (in slow motion the step shrinks with the clock: as many steps to a frame as at full speed, so the skier moves on every frame. With the
      // step held at 1/120 s of game time, at a third of the speed a frame got one step or none by turns and the flight juddered)
      // (and each frame's time is cut into equal steps of at most 1/120 s and spent whole: nothing carried over to the next frame. With a
      // remainder carried, a frame got one step, the next three, as the clock eased: the owner still saw the flight stutter)
      const ns = Math.min(Math.max(Math.ceil(acc / H - 1e-6), 1), 10), Hs = acc / ns; G.hs = Hs;
      // (a boulder or a mound of packed snow beside the run is, to the body, only a low swell: Course.rockCap, while the physics and the
      // forecast of the flight ask. The skis and legs below still follow the snow as it is drawn)
      Course.rockCap = ROCK_CAP;
      if (acc > 1e-7) for (let k = 0; k < ns; k++) { step(Hs, Input.u); acc -= Hs; n++; G.stepT = G.t - Math.max(acc, 0); if (G.onStep) G.onStep(S, Hs); }
      acc = 0;
      if (n === 10) acc = 0;
      G.dist = -S.p[2]; G.drop = G.y0 - S.p[1]; if (S.speed > G.topSpeed) G.topSpeed = S.speed;
    }
    Course.rockCap = ROCK_CAP; G.nSteps = n; updateFlight(dt, n); Course.rockCap = 0; updatePose(dt); if (G.afterPose) G.afterPose(dt); updateCamera(dt);          // (afterPose: the replay puts the run's own pose back here, 93_replay.js)
  };
  G.step = step;
  return G;
})();
