"use strict";
// ---------------------------------------------------------------- 实验室人物: the skier and the rider moved by the human lab's motion (developer mode)
// The figure is the game's own (its clothes, gloves, boots, skis or board); every bone of it is set from the lab's skeleton (08h_labrig.js) posed
// by the lab's motion (08g_human.js):
//   - turning: Human.Turn, one whole turn as a function of its phase and amplitude, both read off the game's own lean (Human.Turn.track), in the
//     style of one of the riders' motion sets (the owner picks it: 双板风格 / 单板风格);
//   - jumping: Human.Moves, one move from load to landing, its time run on the game's own jump: the wind-up while the jump key is held, the air
//     stretched over the flight the game forecasts, the landing where the snow is met (the owner picks it: 双板跳的动作 / 单板跳的动作, or
//     随机: one that fits the air, never the same twice running). On-snow tricks (butters, presses) and half turns that land backwards are
//     left out: those are not in the game.
// Where the lab's frames are not solved yet (they are solved a few at a time, at most one per drawn frame) the game's own figure stands in.
// The game's physics is untouched: the figure goes down the same line; the game's own tricks stand back while this is on.
const LabRide = (() => {
  if (typeof Human === 'undefined' || typeof LabRig === 'undefined' || typeof Skier === 'undefined' || typeof Variants === 'undefined') return null;
  const H = Human, K = Skier, T = H.Turn, MV = H.Moves;
  const PS = T.PRESETS || [], forG = gr => PS.filter(p => gr === 'board' ? p.gear === 'board' : p.gear !== 'board');
  const L5 = 'abcdefghijklmnop';
  // (the skis' sets begin with the lab's own first set, 默认（第一版）; the board's with the lab's board keys as they stand)
  const SKI = forG('ski').length ? forG('ski') : [null], BOARD = [null, ...forG('board')];
  // (the 场景 panel's chips are short: a long name wrapped over several lines and ran into the next column, owner 2026-11-17 "这页都乱了".
  // A style keeps the first words of its description, a move the first word of its English name)
  const short = (t, n) => { t = t.replace(/[（(].*$/, '').trim(); return (t.length > n ? t.slice(0, n) : t).replace(/[、，,·\s]+$/, ''); };
  const label = p => p ? short(p.name.replace(/^(双板|单板) · /, ''), 5) || '默认' : '默认';
  const mlabel = z => { const e = z.match(/^[A-Za-z][A-Za-z0-9]*/); return e ? e[0] : short(z, 7); };
  // (moves in the air only: no butters or presses, no half turns that land backwards)
  const AIR = gr => MV.LIB[gr].filter(m => !m.groundT && !(m.spin && Math.abs(m.spin) % 360 === 180));
  const MSKI = AIR('ski'), MBOARD = AIR('board');
  Variants.def('rider', '实验室人物', [['a', '关'], ['b', '开']], 'a');      // (default off: the game keeps its own figure, which is the one 新求解器 drives and the owner playtested, 2026-11-18)
  Variants.def('rski', '双板风格', SKI.map((p, i) => [L5[i], label(p)]), 'a');
  Variants.def('rboard', '单板风格', BOARD.map((p, i) => [L5[i], label(p)]), 'a');
  Variants.def('rtski', '双板跳的动作', [['a', '随机'], ...MSKI.map((m, i) => [L5[i + 1], mlabel(m.zh)])], 'a');
  Variants.def('rtboard', '单板跳的动作', [['a', '随机'], ...MBOARD.map((m, i) => [L5[i + 1], mlabel(m.zh)])], 'a');
  // (developer mode only, as the board: without ?dev it is off, whatever an address or an earlier pick says)
  let dev = false; try { dev = !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && (/[?&]dev(=|&|$)/.test(location.search) || /\/dev\/?$/.test(location.pathname) || !!(self.COLD_SMOKE && self.COLD_SMOKE.dev)); } catch (e) { }
  if (!dev) Variants.val.rider = 'a';
  const on = () => dev && Variants.val.rider === 'b';
  K.labOn = () => on() && !!(K.boardOn && K.boardOn());       // (the board rider's body is built in the lab's arms: 08_skier.js K.build)

  const rig = LabRig(H, K), sk = rig.sk, V = v3, Q = H.q;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const g = p => [-p[0], p[1], -p[2]], yawOf = v => Math.atan2(v[0], -v[2]);
  const merge = (a, b) => { for (const k in b) { const x = b[k]; if (x && typeof x === 'object' && !Array.isArray(x) && a[k] && typeof a[k] === 'object') merge(a[k], x); else if (Array.isArray(x) && Array.isArray(a[k])) x.forEach((v, i) => { if (v && typeof v === 'object' && a[k][i]) merge(a[k][i], v); else a[k][i] = v; }); else a[k] = x; } return a; };
  const box3 = b => { const P = []; for (const a of [-0.5, 0.5]) for (const w of [-0.5, 0.5]) for (const t of [-0.5, 0.5]) P.push(V.add(V.add(V.add(b.c, V.mul(b.ax, a * b.L)), V.mul(b.side, w * b.W)), V.mul(b.n, t * b.T))); return P; };
  // a solved frame kept with where its gear is: its middle (x, z), the height to put on the snow (its lowest point; in the air, where the body
  // is), and which way it points (the game's yaw: 0 down its -z)
  function keep(gear, p, yaw0) {
    const xf = H.Skeleton.pose(sk, p), bx = H.Motion.gear(sk, xf, gear), c = bx.reduce((a, b) => V.add(a, V.mul(b.c, 1 / bx.length)), [0, 0, 0]);
    let low = Infinity; for (const b of bx) for (const q of box3(b)) low = Math.min(low, q[1]);
    const ax = g(bx.reduce((a, b) => V.add(a, b.ax), [0, 0, 0]));
    return { p, at: [c[0], low, c[2]], yaw: yaw0 != null ? yaw0 : yawOf([ax[0], 0, ax[2]]), com: H.Motion.com(sk, xf)[1] - low };
  }
  // ---- the frames, solved a few at a time: jobs in order (the turn first, then the plain jump, then the chosen move, then the rest)
  const SETS = {}, jobs = [];
  function styleOf(gear) { const i = L5.indexOf(Variants.val[gear === 'board' ? 'rboard' : 'rski']), P = (gear === 'board' ? BOARD : SKI)[Math.max(0, i)] || null;
    return { key: gear + ':' + (P ? P.name : '默认'), set: P ? merge(T.copy(T.SET0), T.copy(P)) : T.copy(T.SET0), speed: P && P.play && P.play.speed != null ? P.play.speed : 0.6 }; }
  function lazyJob(clip, n, done) { clip.frames = n; clip.budget = 1; let i = 0; return { step() { H.Motion.sample(sk, clip, clip.dur * i / n); if (++i >= n) { done(H.Motion.bakedFrames(sk, clip)); return true; } return false; } }; }
  function body(gear) {
    const s = styleOf(gear); if (SETS[s.key]) return SETS[s.key];
    const S = SETS[s.key] = { gear, ready: false, turn: null, stance: null, moves: {}, side: 1 }, set = s.set, NT = gear === 'board' ? 48 : 40;
    const tc = { name: 'lr_turn_' + s.key, gear, dur: 1, lazy: true, smooth: 1.5, at: u => { const r = T.pose(sk, set, u, 1, s.speed, gear); return gear === 'board' ? { pose: r.pose } : r; } };
    const sc = { name: 'lr_stance_' + s.key, gear, dur: 1, lazy: true, smooth: 0, at: () => { const r = T.pose(sk, set, 0, 0, s.speed, gear); return gear === 'board' ? { pose: r.pose } : r; } };
    jobs.push(lazyJob(sc, 2, F => { S.stance = keep(gear, F[0]); }));
    // (standing still on skis: tall, fists on the grips in front of the hips, the poles near upright and a little back)
    if (gear !== 'board') { const rc = { name: 'lr_ready_' + s.key, gear, dur: 1, lazy: true, smooth: 0, at: () => T.pose(sk, set, 0, 0, s.speed, gear, 1) };
      jobs.push(lazyJob(rc, 2, F => { S.rest = keep(gear, F[0]); })); }
    jobs.push(lazyJob(tc, NT, F => { S.turn = F.map(p => keep(gear, p));
      // (which way a turn of phase 0.25 leans against the way the gear points: the board rider stands sideways, so for him 0.25 is toe side)
      const k = S.turn[NT / 4], cm = g(H.Motion.com(sk, H.Skeleton.pose(sk, k.p))), cen = g(k.at), nose = [Math.sin(k.yaw), 0, -Math.cos(k.yaw)];
      S.side = Math.sign(V.dot(V.sub(cm, cen), V.cross([0, 1, 0], nose))) || 1; S.ready = true; }));
    // (the deep carve, Down held while steering on skis: the same turn with everything a third bigger, the body further over and lower, the
    // knees further in. Mixed in by how much the game says the edges are being driven, Game.s.deep)
    if (gear !== 'board') { const sd = T.copy(set); sd.style = Object.assign({}, sd.style, { exag: (sd.style && sd.style.exag || 1) * 1.35 });
      const dc = { name: 'lr_deep_' + s.key, gear, dur: 1, lazy: true, smooth: 1.5, at: u => T.pose(sk, sd, u, 1, s.speed, gear) };
      jobs.push(lazyJob(dc, NT, F => { S.deepTurn = F.map(p => keep(gear, p)); })); }
    return S;
  }
  const MOVES = gear => gear === 'board' ? MBOARD : MSKI;
  function move(gear, id) {
    const S = body(gear); if (S.moves[id]) return S.moves[id].ready ? S.moves[id] : null;
    const m = MV.LIB[gear].find(x => x.id === id); if (!m) return null;
    const c = MV.clip(m, gear), L = MV.timeline(m, null, gear), M = S.moves[id] = { id, ready: false, L, dur: c.dur, zh: m.zh };
    c.name = 'lr_mv_' + gear + '_' + id; const n = Math.round(c.dur * 24);
    jobs.push(lazyJob(c, n, F => {
      // on the snow the gear stays on it; in the air the body (its centre of mass) rides where the game puts it, as high over the figure's origin
      // as at the take-off, and the legs fold up under it (the move's own lift is the game's flight)
      const k0 = keep(gear, F[Math.min(F.length - 1, Math.round(L.to / c.dur * n))]), h0 = k0.com;
      M.F = F.map((p, i) => { const t = c.dur * i / n, a = sm(L.to - 0.02, L.to + 0.12, t) * (1 - sm(L.ld - 0.12, L.ld + 0.02, t)), k = keep(gear, p, k0.yaw);
        k.at[1] += (k.com - h0) * a; return k; });
      M.ready = true; }));
    return null;
  }
  // what to solve next: the turn, the plain jump, the chosen move (or all of them for 随机)
  function plan(gear) { const S = body(gear); if (!S.ready) return;
    const first = gear === 'board' ? 'ollie' : 'pop'; move(gear, first);
    const v = Variants.val[gear === 'board' ? 'rtboard' : 'rtski'], i = L5.indexOf(v) - 1, list = MOVES(gear);
    if (i >= 0 && list[i]) move(gear, list[i].id); else for (const m of list) move(gear, m.id); }
  function work() { const t0 = performance.now(); while (jobs.length && performance.now() - t0 < 6) { if (jobs[0].step()) jobs.shift(); } }

  // ---- blending kept frames
  const mixK = (a, b, w) => w <= 0 ? a : w >= 1 ? b : { p: H.lerpPose(a.p, b.p, w), at: V.lerp(a.at, b.at, w), yaw: a.yaw + ((((b.yaw - a.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * w };
  const atLoop = (F, u) => { const x = ((u % 1) + 1) % 1 * F.length, i = Math.floor(x) % F.length; return mixK(F[i], F[(i + 1) % F.length], x - Math.floor(x)); };
  const atClip = (F, dur, t) => { const x = clamp(t / dur, 0, 0.9999) * (F.length - 1), i = Math.floor(x); return mixK(F[i], F[Math.min(i + 1, F.length - 1)], x - i); };

  // ---- the jump, run on the game's: J = { id, t (the move's own time), w (how far it has come in), out (how far it has gone) }
  const R = { track: {}, J: null, last: '', gear: '' };
  function pickMove(gear, pred) {
    const v = Variants.val[gear === 'board' ? 'rtboard' : 'rtski'], i = L5.indexOf(v) - 1, list = MOVES(gear), first = gear === 'board' ? 'ollie' : 'pop';
    if (i >= 0 && list[i]) return move(gear, list[i].id) ? list[i].id : first;
    const ok = list.filter(m => m.id !== R.last && move(gear, m.id) && MV.timeline(m, null, gear).T <= pred * 1.35 + 0.1);
    return ok.length ? ok[Math.floor(Math.random() * ok.length)].id : first;
  }
  function jump(gear, dt) {
    const G = typeof Game !== 'undefined' ? Game : null, S = G && G.s, fl = G && G.flight; if (!S) return null;
    const air = !!S.air, pred = air && fl && fl.on ? fl.t + fl.rem : 0, first = gear === 'board' ? 'ollie' : 'pop';
    let J = R.J;
    if (!J) {
      if (!air && S.charge > 0.02 && move(gear, first)) J = R.J = { id: first, t: 0, w: 0, out: 0, ph: 'load' };
      else if (air && pred > 0.45) { const id = pickMove(gear, pred); J = R.J = { id, t: move(gear, id).L.to, w: 0, out: 0, ph: 'air' }; R.last = id; }
      if (!J) return null; }
    let M = move(gear, J.id); if (!M) { R.J = null; return null; } let L = M.L;
    if (J.ph === 'load') { J.t = Math.max(J.t, L.to - 0.5 + 0.44 * clamp(S.charge, 0, 1)); if (!(S.charge > 0.02) || air) { J.ph = 'pop'; J.wait = 0; } }
    if (J.ph === 'pop') {
      if (air) {      // (off the snow: the move for this air, from its take-off on; what was wound up blends into it)
        const id = pred > 0.45 ? pickMove(gear, pred) : J.id;
        if (id !== J.id) { J.from = { id: J.id, t: J.t }; J.fw = 0; J.id = id; M = move(gear, id); L = M.L; J.t = L.to - 0.02; R.last = id; }
        J.ph = 'air'; }
      else { J.t = Math.min(L.to - 0.02, J.t + dt); if ((J.wait += dt) > 0.5) J.ph = 'end'; } }
    if (J.ph === 'air') { if (air) J.t = Math.max(J.t, L.to + (L.ld - L.to) * clamp((fl ? fl.t : 0) / Math.max(0.25, pred || 0.25), 0, 0.97)); else { J.ph = 'land'; J.t = Math.max(J.t, L.ld); } }
    if (J.ph === 'land') { J.t += dt; if (air && J.t < L.ld + 0.4) { J.ph = 'air'; } if (J.t >= M.dur - 0.3) J.ph = 'end'; }
    if (J.ph === 'end') { J.out += dt / 0.3; if (J.out >= 1) { R.J = null; return null; } }
    J.w = Math.min(1, J.w + dt / 0.15);
    let k = atClip(M.F, M.dur, J.t);
    if (J.from) { J.fw = Math.min(1, J.fw + dt / 0.12); const Mf = move(gear, J.from.id); if (Mf && J.fw < 1) k = mixK(atClip(Mf.F, Mf.dur, J.from.t), k, J.fw * J.fw * (3 - 2 * J.fw)); else J.from = null; }
    const w = J.w * (1 - Math.min(1, J.out)); return { k, w: w * w * (3 - 2 * w) };
  }

  // ---- the pose for this frame: the lab's skeleton, moved so its gear stands at the figure's origin and points down -z, carried onto the game's
  function place(k) {
    const xf = H.Skeleton.pose(sk, k.p), c = k.at, q = Q.axis([0, 1, 0], k.yaw);
    for (let i = 0; i < xf.P.length; i++) xf.P[i] = Q.rot(q, V.sub(xf.P[i], c));
    for (let i = 0; i < xf.R.length; i++) xf.R[i] = Q.norm(Q.mul(q, xf.R[i]));
    return xf;
  }
  // ---- the upper body faces down the hill; the legs turn under it (user 2026-11-17: a good skier turns by moving the centre of mass over the
  // feet; the chest does not turn with the skis, it only sways side to side, and the arms go with the chest). The figure is placed on the
  // game's skis, so before this the chest and pelvis turned with the skis, 12 deg each way and a quarter turn ahead of the path: the body
  // seemed to turn first and the skis to follow. Now the chest is turned back by the spine toward where the skier is going on the whole: the
  // way of travel over the last ~1.2 s (down the fall line in linked turns, along the traverse in a long one)
  const FACE_T = 1.2, SEP = 35;
  const yawG = xf => { const a = xf.P[sk.idx.upperarm_L], b = xf.P[sk.idx.upperarm_R]; return Math.atan2(-(-(a[2] - b[2])), (a[0] - b[0])) * 180 / Math.PI; };
  function quietChest(k, dt, w) {
    if (!(w > 0) || typeof Game === 'undefined' || !Game.s || !Game.s.v || !Game.root) return k;
    // (Game.root.fwd: where the skis point in the world; Game.s.v: the way of travel)
    const v = Game.s.v, t = Game.root.fwd, sp = Math.hypot(v[0], v[2]);
    if (!R.face) R.face = [t[0], t[2]];
    if (sp > 1 && dt > 0) { const a = 1 - Math.exp(-dt / FACE_T); R.face = [R.face[0] + (v[0] / sp - R.face[0]) * a, R.face[1] + (v[2] / sp - R.face[1]) * a]; const l = Math.hypot(R.face[0], R.face[1]) || 1; R.face = [R.face[0] / l, R.face[1] / l]; }
    const yw = d => Math.atan2(d[0], -d[1]) * 180 / Math.PI, wrap = x => ((x + 540) % 360) - 180;
    const rel = wrap(yw(R.face) - yw([t[0], t[2]])) * LR.faceSign;
    const out = { p: H.lerpPose(k.p, k.p, 0), at: k.at, yaw: k.yaw };
    for (let it = 0; it < 2; it++) { const d = clamp(wrap(rel - yawG(place(out))), -SEP, SEP) * w; out.p.spine.twist = clamp(out.p.spine.twist + LR.twistSign * d, -45, 45); }
    return out;
  }
  const DPS = { e: 0 };
  function dpStroke(k0, dt) {
    const G = typeof Game !== 'undefined' && Game.s ? Game.s : null, f = G && !G.air && R.gear === 'ski' ? clamp(G.dp || 0, 0, 1) : 0;
    // (its weight eased in and out over a tenth of a second: a stroke begun or given up never hands the arms over in one frame)
    DPS.e += ((f > 0 ? 1 : 0) - DPS.e) * (1 - Math.exp(-(dt > 0 ? dt : 1 / 60) / 0.06));
    const w = DPS.e; if (w < 0.001) return [k0, 0];
    // (on a copy: the keys it starts from are the baked clips' own)
    const k = { p: H.lerpPose(k0.p, k0.p, 0), at: k0.at.slice(), yaw: k0.yaw };
    const L = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
    // key arm angles through the stroke (deg; elev from hanging down, plane 90 = straight forward, below 0 = behind), elbow, trunk bow
    const KEYS = [[0, 30, 75, 45, 8], [0.22, 62, 88, 35, 22], [0.42, 40, 60, 25, 34], [0.62, 28, -25, 12, 30], [0.8, 22, 30, 30, 16], [1, 30, 75, 45, 8]];
    let i = 0; while (i < KEYS.length - 2 && f > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = sm(0, 1, (f - a[0]) / (b[0] - a[0])), v = j => L(a[j], b[j], t);
    for (const sd of ['L', 'R']) { const A = k.p['arm_' + sd]; A.elev += (v(1) - A.elev) * w; A.plane += (v(2) - A.plane) * w; A.elbow += (v(3) - A.elbow) * w; A.grip = 1; }
    k.p.spine.flex += (v(4) - k.p.spine.flex) * w;
    // both tips in the snow from the plant to the release, a little ahead of the bindings at the plant and slid back past the boots by the end
    const pl = sm(0.16, 0.24, f) * (1 - sm(0.56, 0.86, f)) * w;
    k.p.plant = [pl, pl]; k.p.plantAt = L(0.15, -0.55, (f - 0.22) / 0.4);
    k.p.poleRest = 0;
    return [k, w];
  }
  K.labSolve = (cur, sec, dt) => {
    if (!on()) return null;
    const gear = K.boardOn && K.boardOn() ? 'board' : 'ski';
    if (gear !== R.gear) { R.gear = gear; R.J = null; R.track = {}; }
    plan(gear); work();
    const S = body(gear); if (!S.ready) return null;
    // (the game's lean is negative to the left; Human.Turn's phase 0.25 is a turn to the left on skis, to the toe side on a board)
    const lean = -(cur.lean || 0) * S.side, tr = T.track(R.track, lean, dt > 0 ? dt : 1 / 60, 0.75, 2 * Math.PI / 2.4);
    let k = mixK(S.stance, atLoop(S.turn, tr.phase), clamp(tr.amp, 0, 1));
    { const dw = S.deepTurn && typeof Game !== 'undefined' && Game.s ? clamp(Game.s.deep || 0, 0, 1) : 0;
      if (dw > 0.001) k = mixK(k, mixK(S.stance, atLoop(S.deepTurn, tr.phase), clamp(tr.amp, 0, 1)), dw); }
    // below about 3 m/s the skier comes up into the ready stance, fully at a stop (the game's speed, m/s)
    const sp = typeof Game !== 'undefined' && Game.s ? Game.s.speed || 0 : 99, rw = S.rest ? sm(3, 0.6, sp) * (1 - clamp(tr.amp, 0, 1)) : 0;
    // the double-pole stroke the game asks for at the start (Game.s.dp: reach, plant at 0.22, drive to 0.62, release, recover; 07_game.js gives
    // up to three from a standstill). The lab's figure had no stroke, so after the lab rider came in the start lost the push on the poles that
    // the game's own skier had (owner 2026-11-17: "以前一开始…他的手都会蹬一下地…为什么现在没了"). Done here on the lab's own pose: from the
    // ready stance the arms reach forward, both tips go into the snow a little ahead of the boots, the trunk bows over them as the arms drive
    // down and back past the hips while the body slides past the tips, then let go and come round to the front again
    let dpw = 0; { const r = dpStroke(k, dt); k = r[0]; dpw = r[1]; }
    if (rw > 0) { const w = rw * (1 - dpw); if (w > 0.001) { k = mixK(k, S.rest, w); k.p.poleRest = w; } }
    const j = jump(gear, dt > 0 ? dt : 0); if (j) k = mixK(k, j.k, j.w);
    if (gear === 'ski') k = quietChest(k, dt, j ? 1 - j.w : 1);
    rig.st.parallel = j ? 1 - j.w : 1;     // (skis held parallel on the snow, free in the air: 08h_labrig.js)
    return rig.fromLab(place(k), gear);
  };
  // (the game's own tricks stand back while this is on: 07_game.js asks)
  const LR = { faceSign: 1, twistSign: -1 };   // (signs checked by measuring the chest's turn in the world)
  const api = { on, rig, jobs, R, moves: MOVES, body, move, LR };
  // (developer mode: a handle for the headless checks, which reach the game's modules through it)
  if (dev) try { self.__labride = () => ({ LabRide: api, Game, Skier: K, Input, Variants, Course }); } catch (e) { }
  return api;
})();
