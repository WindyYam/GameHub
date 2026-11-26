"use strict";
// ---------------------------------------------------------------- 一起滑: everyone who comes is on the same mountain, skiing it together
// Asked by the owner (2026-11-22 21:25 UTC): "任何人进来以后都会在这里面就是多一个人…你滑到底下就会自动到上面，所以你会一直循环", and
// (21:26) "加入一个人的简单的碰撞，人和人碰撞会有什么效果…这样还比较好玩". Web page only; the server is the owner's own machine.
//
// How it works. A small relay (server/mp/relay.js) puts each player in a room, and a room is a mountain: its seed. Nothing of the mountain goes
// over the wire, every page makes it from the seed as it always has. What goes over, about 12 times a second each way, is where each skier is
// and how they stand: the root on the snow (place, facing, how high above the snow), the speed, and every bone of the figure in its own frame
// (28 of them, a quaternion and an offset each, 16 bits a number: ~430 bytes). So the others are drawn as the same figure as the player's own,
// moving exactly as they moved on their own screens, without this page having to work their bodies out (08_skier.js otherTex/drawOthers).
//
//   time     each frame is stamped with its sender's clock. The others are shown 0.12 s behind the newest frame (the smallest gap seen between
//            a frame's stamp and its arrival, so the frames in between have always come), eased between the two around that moment, and
//            then carried on along their speed for those 0.12 s, so a friend skiing beside you is beside you and not two lengths back
//   the loop the run is a mountain of LOOP_SEGS stretches (about three minutes); past the end of the last one the snow comes up white round
//            the skier and they are back at the top, still in their run (App.swap with the white veil). Everyone keeps meeting everyone
//   bumping  nobody falls (the game has no falls). Two skiers who run into each other bounce apart softly, as two bodies in padded clothes
//            would: the part of their closing speed along the line between them is taken off, with a little back, and they are set apart. A
//            puff of snow where they met and a soft thump. Each page does this for its own skier against where it sees the other: both see
//            the same meeting, so both bounce
//   draft    a skier just behind another, in their line, is out of the wind: a little speed for staying together (never past theirs)
//
// Entry: the 一起滑 button on the title page (public room of today's mountain), or a link with #ski=<code> (a room for friends only: the 邀请
// button on the bar copies one). ?mp=ws://host:port/ski points the page at another relay (tests).
const Net = self.Net = (() => {
  const N = { on: false, ws: null, id: 0, room: null, seed: 0, peers: new Map(), state: 'off', sEnd: 0, loops: 0 };
  const tx = (zh, en) => (typeof I18N !== 'undefined' && I18N.en() ? en : zh);
  const PL = self.COLD_SMOKE || {};
  const URL0 = QS.get('mp') || PL.mp || 'wss://mp.huisky.xyz/ski';
  // (a second road, on the page's own host: huisky.xyz hands the connection on to the relay. Used when mp.huisky.xyz does not
  // resolve on a player's machine — owner 2026-11-24, his Mac's resolver still remembered the name as missing for an hour)
  const URLS = [URL0].concat(!QS.get('mp') && !PL.mp && /(^|\.)huisky\.xyz$/.test(location.hostname) ? ['wss://' + location.host + '/cold-smoke/mp/ski'] : []);
  let via = 0;
  const HZ = 12, DELAY = 0.12, LOOP_SEGS = 6, R_BODY = 0.48, VERSION = 1;
  // names: small animals of the snow line; jacket colours: linear RGB, none of them the player's own orange
  const NAMES = ['雪狐', '松鸦', '岩羊', '雪兔', '雷鸟', '旱獭', '雪豹', '雪鸮', '星鸦', '麝鹿', '狍子', '貂熊', '鼠兔', '白鼬', '雪鹑', '岩鹨'];
  const NAMES_EN = ['Fox', 'Jay', 'Ibex', 'Hare', 'Grouse', 'Marmot', 'Leopard', 'Owl', 'Nutcracker', 'Musk deer', 'Roe', 'Wolverine', 'Pika', 'Stoat', 'Snowcock', 'Accentor'];
  const COLS = [[0.62, 0.02, 0.03], [0.0, 0.32, 0.30], [0.85, 0.62, 0.02], [0.02, 0.12, 0.55], [0.30, 0.06, 0.48], [0.10, 0.42, 0.06], [0.80, 0.18, 0.38], [0.75, 0.78, 0.80],
    [0.02, 0.40, 0.70], [0.55, 0.30, 0.10], [0.45, 0.62, 0.05], [0.04, 0.04, 0.05], [0.90, 0.40, 0.55], [0.30, 0.55, 0.60], [0.60, 0.50, 0.30], [0.20, 0.20, 0.45]];
  const CSS = c => 'rgb(' + c.map(v => Math.round(255 * Math.pow(Math.min(1, v), 1 / 2.2))).join(',') + ')';
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  // (owner 2026-11-24 19:07 UTC: a player names themselves the first time, or takes a name drawn for them; the names drawn are people's
  // nicknames, Chinese and English mixed, the same kind the robots of tools/mp-bots.js have, so nobody can tell a robot by its name)
  const NICK = ['小林', 'Amy', '雪地里的猫', 'Leo', '阿飞', 'Mia', '老王滑雪', 'Sam', '一颗橙子', 'Nina', '北风', 'Jack', '小雪球', 'Emma', '大熊', 'Tom',
    '周五下班就去滑', 'Ivy', '松果', 'Max', '阿琳', 'Zoe', '慢慢滑', 'Ben', '月亮湾', 'Lily', '飞鱼', 'Eric', '布丁', 'Ruby', '小满', 'Alex', '阿雪', 'Coco',
    '山顶见', 'Ryan', '白茶', 'Ella', '风筝', 'Daniel', '豆豆', 'Grace', '雪糕', 'Kai', '初雪', 'Luna', '老张', 'Owen', '小周', 'Chloe', '粉雪一号', 'Jay'];
  const drawNick = () => NICK[Math.floor(Math.random() * NICK.length)];
  // who I am: a name and a colour, kept on this device (me.name: theirs or drawn; me.set: they have seen and kept it)
  let me = null; try { me = JSON.parse(store.get('cs.mp.me') || 'null'); } catch (e) { }
  if (!me || !(me.c >= 0 && me.c < COLS.length)) me = { c: Math.floor(Math.random() * COLS.length) };
  if (typeof me.name !== 'string' || !me.name.trim()) me.name = drawNick();
  const keepMe = () => { if (!N.isBot) store.set('cs.mp.me', JSON.stringify(me)); };
  keepMe();
  N.isBot = QS.has('mpbot');
  // (a robot skier, tools/mp-bots.js: its name and colour come in the address, ?mpname=…&mpcol=…)
  if (QS.get('mpname')) { me = { set: true, c: +QS.get('mpcol') >= 0 && +QS.get('mpcol') < COLS.length ? +QS.get('mpcol') : me.c, name: QS.get('mpname').slice(0, 12) }; }
  N.me = me; N.name = () => me.name;
  N.tagsOn = true; try { N.tagsOn = localStorage.getItem('cs.mp.tags') !== '0'; } catch (e) { }

  // ---- the frame: what one skier says about themselves
  const NB = 28, FR = 36 + NB * 14;
  const qFromM = (m, o, Q) => {          // the rotation of a column-major 4x4 (o: offset of its first column) -> [x, y, z, w]
    const m00 = m[o], m10 = m[o + 1], m20 = m[o + 2], m01 = m[o + 4], m11 = m[o + 5], m21 = m[o + 6], m02 = m[o + 8], m12 = m[o + 9], m22 = m[o + 10], tr = m00 + m11 + m22;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); Q[3] = 0.25 / s; Q[0] = (m21 - m12) * s; Q[1] = (m02 - m20) * s; Q[2] = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); Q[3] = (m21 - m12) / s; Q[0] = 0.25 * s; Q[1] = (m01 + m10) / s; Q[2] = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); Q[3] = (m02 - m20) / s; Q[0] = (m01 + m10) / s; Q[1] = 0.25 * s; Q[2] = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); Q[3] = (m10 - m01) / s; Q[0] = (m02 + m20) / s; Q[1] = (m12 + m21) / s; Q[2] = 0.25 * s; }
    const l = Math.hypot(Q[0], Q[1], Q[2], Q[3]) || 1; for (let i = 0; i < 4; i++) Q[i] /= l; if (Q[3] < 0) for (let i = 0; i < 4; i++) Q[i] = -Q[i]; return Q;
  };
  const mFromQ = (q, t, out) => {        // [x, y, z, w] + offset -> column-major 4x4
    const x = q[0], y = q[1], z = q[2], w = q[3];
    out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + z * w); out[2] = 2 * (x * z - y * w); out[3] = 0;
    out[4] = 2 * (x * y - z * w); out[5] = 1 - 2 * (x * x + z * z); out[6] = 2 * (y * z + x * w); out[7] = 0;
    out[8] = 2 * (x * z + y * w); out[9] = 2 * (y * z - x * w); out[10] = 1 - 2 * (x * x + y * y); out[11] = 0;
    out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1; return out;
  };
  const I16 = v => Math.max(-32767, Math.min(32767, Math.round(v)));
  const _q = [0, 0, 0, 0], _bm = new Array(16);
  function pack() {
    const W = Skier.world, S = Game.s, r = Game.root; if (!W || !W.M || !W.X || !r) return null;
    const buf = new ArrayBuffer(FR), dv = new DataView(buf); let o = 0;
    dv.setUint8(o++, VERSION); dv.setUint8(o++, (S.air ? 1 : 0) | (Game.mode === 'run' ? 2 : 0));
    dv.setFloat32(o, performance.now() / 1000, true); o += 4;
    for (let i = 0; i < 3; i++) { dv.setFloat32(o, r.pos[i], true); o += 4; }
    for (let i = 0; i < 3; i++) { _bm[i] = W.X[i]; _bm[4 + i] = W.Y[i]; _bm[8 + i] = W.Z[i]; }
    qFromM(_bm, 0, _q); for (let i = 0; i < 4; i++) { dv.setInt16(o, I16(_q[i] * 32767), true); o += 2; }
    for (let i = 0; i < 3; i++) { dv.setInt16(o, I16(S.v[i] * 100), true); o += 2; }
    dv.setInt16(o, I16((r.pos[1] - Course.height(r.pos[0], r.pos[2], 0.5)) * 1000), true); o += 2;
    dv.setUint16(o, NB, true); o += 2;
    for (let b = 0; b < NB; b++) {
      const M = W.M[b]; qFromM(M, 0, _q);
      for (let i = 0; i < 4; i++) { dv.setInt16(o, I16(_q[i] * 32767), true); o += 2; }
      for (let i = 0; i < 3; i++) { dv.setInt16(o, I16(M[12 + i] * 8000), true); o += 2; }
    }
    return buf;
  }
  function unpack(dv, o0) {
    let o = o0; if (dv.getUint8(o++) !== VERSION) return null; const fl = dv.getUint8(o++), f = { air: !!(fl & 1), run: !!(fl & 2) };
    f.t = dv.getFloat32(o, true); o += 4; f.p = [0, 0, 0]; for (let i = 0; i < 3; i++) { f.p[i] = dv.getFloat32(o, true); o += 4; }
    f.q = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) { f.q[i] = dv.getInt16(o, true) / 32767; o += 2; }
    f.v = [0, 0, 0]; for (let i = 0; i < 3; i++) { f.v[i] = dv.getInt16(o, true) / 100; o += 2; }
    f.h = dv.getInt16(o, true) / 1000; o += 2; const nb = dv.getUint16(o, true); o += 2; if (nb !== NB || dv.byteLength < o + nb * 14) return null;
    f.bq = new Float32Array(nb * 4); f.bt = new Float32Array(nb * 3);
    for (let b = 0; b < nb; b++) { for (let i = 0; i < 4; i++) { f.bq[b * 4 + i] = dv.getInt16(o, true) / 32767; o += 2; } for (let i = 0; i < 3; i++) { f.bt[b * 3 + i] = dv.getInt16(o, true) / 8000; o += 2; } }
    for (const k of ['p', 'v']) for (const x of f[k]) if (!(x === x) || Math.abs(x) > 1e7) return null;
    return f;
  }

  // ---- the others
  function peer(id, name, col, bot) {
    let P = N.peers.get(id); if (!P) { P = { id, snaps: [], off: Infinity, offs: [], tex: null, show: null, M: [], el: null, bumpT: -9 }; N.peers.set(id, P); }
    P.name = String(name || '').slice(0, 12) || tx('雪友', 'Skier'); P.col = Math.max(0, Math.min(COLS.length - 1, col | 0)); P.rgba = COLS[P.col].concat([1]); P.bot = !!bot;
    return P;
  }
  function drop(id) { const P = N.peers.get(id); if (!P) return; if (P.el) P.el.remove(); N.peers.delete(id); hud(); }
  function onFrame(id, dv, o) {
    const P = N.peers.get(id); if (!P) return; const f = unpack(dv, o); if (!f) return;
    const now = performance.now() / 1000, d = now - f.t;
    // (the smallest gap between stamp and arrival over the last few seconds: the sender's clock read on ours, with the fastest path)
    P.offs.push([now, d]); while (P.offs.length && now - P.offs[0][0] > 4) P.offs.shift(); P.off = Math.min(...P.offs.map(x => x[1]));
    if (P.snaps.length && f.t <= P.snaps[P.snaps.length - 1].t) return;
    P.snaps.push(f); if (P.snaps.length > 24) P.snaps.shift(); P.last = now;
  }
  const nlerp = (a, ao, b, bo, u, out, oo) => { let d = a[ao] * b[bo] + a[ao + 1] * b[bo + 1] + a[ao + 2] * b[bo + 2] + a[ao + 3] * b[bo + 3], s = d < 0 ? -1 : 1, l = 0;
    for (let i = 0; i < 4; i++) { out[oo + i] = a[ao + i] * (1 - u) + s * b[bo + i] * u; l += out[oo + i] * out[oo + i]; } l = Math.sqrt(l) || 1; for (let i = 0; i < 4; i++) out[oo + i] /= l; };
  // where a peer is shown now: eased between the frames around (their clock) now - DELAY, then carried on along their speed for DELAY
  function place(P, now) {
    const S = P.snaps; if (!S.length) return null; const tp = now - P.off - DELAY;
    let a = S[0], b = S[0]; for (let i = 0; i < S.length; i++) { if (S[i].t <= tp) a = S[i]; if (S[i].t >= tp) { b = S[i]; break; } b = S[i]; }
    const u = b.t > a.t ? Math.max(0, Math.min(1, (tp - a.t) / (b.t - a.t))) : 0, late = Math.max(0, Math.min(0.5, tp - b.t));
    const sh = P.show || (P.show = { p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], bq: new Float32Array(NB * 4), bt: new Float32Array(NB * 3), air: false, run: false, h: 0 });
    for (let i = 0; i < 3; i++) { sh.v[i] = a.v[i] + (b.v[i] - a.v[i]) * u; sh.p[i] = a.p[i] + (b.p[i] - a.p[i]) * u + sh.v[i] * (DELAY + late); }
    nlerp(a.q, 0, b.q, 0, u, sh.q, 0); for (let k = 0; k < NB; k++) nlerp(a.bq, k * 4, b.bq, k * 4, u, sh.bq, k * 4);
    for (let i = 0; i < NB * 3; i++) sh.bt[i] = a.bt[i] + (b.bt[i] - a.bt[i]) * u;
    sh.air = u < 0.5 ? a.air : b.air; sh.run = b.run; sh.h = a.h + (b.h - a.h) * u;
    // (the mountain loops, so the same snow lies once a lap: someone a lap or more on is shown where they are in this page's own lap)
    const Lp = Course.loop; if (Lp) { const k = Math.round((Game.s.p[2] - sh.p[2]) / Lp.L); if (k) Course.lapShift(sh.p, k); }
    // (carried on along the speed, the skis stay on the snow: the height is the snow's under where they are now, plus what they were above it)
    if (!sh.air) sh.p[1] = Course.height(sh.p[0], sh.p[2], 0.5) + sh.h;
    sh.stale = now - (P.last || 0) > 3;
    return sh;
  }
  const _R = new Array(16), _t = [0, 0, 0];
  function bones(P, sh) {
    if (!P.tex) { P.tex = Skier.otherTex(); if (!P.tex) return false; }
    for (let k = 0; k < NB; k++) { _t[0] = sh.bt[k * 3]; _t[1] = sh.bt[k * 3 + 1]; _t[2] = sh.bt[k * 3 + 2]; P.M[k] = mFromQ([sh.bq[k * 4], sh.bq[k * 4 + 1], sh.bq[k * 4 + 2], sh.bq[k * 4 + 3]], _t, P.M[k] || new Array(16)); }
    const o = Render.origin; _t[0] = sh.p[0] - o[0]; _t[1] = sh.p[1] - o[1]; _t[2] = sh.p[2] - o[2]; mFromQ(sh.q, _t, _R);
    Skier.otherBones(P.tex, _R, P.M); return true;
  }

  // ---- bumping and drafting: this page's skier against where it sees the others
  function touch(dt) {
    const S = Game.s; if (Game.mode !== 'run' || !S || !(dt > 0)) return;
    const p = S.p, v = S.v, sp = Math.hypot(v[0], v[2]);
    for (const P of N.peers.values()) {
      const sh = P.show; if (!sh || sh.stale || !sh.run) continue;
      const dx = p[0] - sh.p[0], dz = p[2] - sh.p[2], dy = p[1] - sh.p[1], d = Math.hypot(dx, dz);
      if (d < 2 * R_BODY && Math.abs(dy) < 1.6) {
        const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0, vn = (v[0] - sh.v[0]) * nx + (v[2] - sh.v[2]) * nz;
        // soft: closing speed along the line between them taken off, 0.3 of it given back; each page does its own half
        let j = 0; if (vn < 0) { j = -vn * 0.65; v[0] += nx * j; v[2] += nz * j; }
        const push = (2 * R_BODY - d) * 0.5; p[0] += nx * push; p[2] += nz * push;
        if (App.t - P.bumpT > 0.6) {
          bumpFx(P, nx, nz, -vn);
          // (over the network the other may not see this meeting: by the time my skier reaches them on their screen, mine has already bounced
          // off. So they are told, and take their half from this if they have not bumped into me themselves just now)
          if (N.ws && N.ws.readyState === 1) try { N.ws.send(JSON.stringify({ t: 'bump', to: P.id, j: +j.toFixed(2), nx: +nx.toFixed(3), nz: +nz.toFixed(3), cv: +(-vn).toFixed(2) })); } catch (e) { }
        }
      }
      // draft: within 2-14 m behind them, in their line, they faster than 8 m/s: a little push along my way, up to their speed
      const ps = Math.hypot(sh.v[0], sh.v[2]); if (ps < 8 || sp < 4) continue;
      const fx = sh.v[0] / ps, fz = sh.v[2] / ps, along = -(dx * fx + dz * fz), side = Math.abs(dx * fz - dz * fx);
      if (along > 2 && along < 14 && side < 1.6 && sp < ps + 1) { const a = 0.45 * (1 - (along - 2) / 12) * (1 - side / 1.6); v[0] += v[0] / sp * a * dt; v[2] += v[2] / sp * a * dt; N.draftT = App.t; }
    }
  }

  function bumpFx(P, nx, nz, cv) {
    const S = Game.s, p = S.p; P.bumpT = App.t; const k = Math.max(0.35, Math.min(1.8, cv / 4)), mid = [p[0] - nx * R_BODY, p[1] + 0.2, p[2] - nz * R_BODY];
    if (typeof Spray !== 'undefined') { if (Spray.slap) Spray.slap(App.t, mid, S.v, S.n, k); if (Spray.sift) Spray.sift(App.t, [mid[0], mid[1] + 0.9, mid[2]], S.v, 0.6 * k); }
    if (typeof Sound !== 'undefined' && Sound.event) Sound.event({ type: 'land', v: 1.2 + 1.5 * k, airT: 0.1 });
    Game.shake = Math.max(Game.shake || 0, 0.02 * k); N.bumps = (N.bumps || 0) + 1; say(tx('噗！撞到了 ', 'Bump! ') + P.name, 1.4);
  }
  // the other one bumped into me (they say so): my half, pushed the other way along the same line, unless I have just had this bump myself
  function bumpedBy(m) {
    const P = N.peers.get(m.id), S = Game.s; if (!P || m.to !== N.id || !S || Game.mode !== 'run' || App.t - P.bumpT < 0.6) return;
    // (a bump is taken only from someone this page itself shows within reach, and only as a direction and at most 15 m/s: a page sending
    // made-up bumps cannot shove a skier from across the mountain or fling them off it)
    const sh = P.show; if (!sh || sh.stale || Math.hypot(sh.p[0] - S.p[0], sh.p[2] - S.p[2]) > 4) return;
    let nx = -(+m.nx || 0), nz = -(+m.nz || 0); const l = Math.hypot(nx, nz), j = Math.max(0, Math.min(15, +m.j || 0)); if (!(l > 0.5 && l < 2)) return; nx /= l; nz /= l;
    S.v[0] += nx * j; S.v[2] += nz * j; bumpFx(P, nx, nz, Math.max(0, Math.min(30, +m.cv || 0)));
  }

  // ---- going together. A person pushing off from the top (joining, or round again from the bottom) says so; the robots (tools/mp-bots.js,
  // N.isBot) come back to the top with them, a little to the side each, and push off with them. N.lead: the person they ski with
  N.follows = QS.has('mpfollow');
  function announce() { if (N.isBot) return; const send = () => { if (N.ws && N.ws.readyState === 1) try { N.ws.send(JSON.stringify({ t: 'go' })); } catch (e) { } }; send(); setTimeout(send, 1500); }
  function goWith(m) {
    const P = N.peers.get(m.id); if (!N.follows || !P || P.bot) return;
    if (N.lead === m.id && performance.now() - (N.leadT || 0) < 5000) return;          // (the second word of the same push-off)
    if (App.swapping) { setTimeout(() => goWith(m), 700); return; }          // (mid white veil: try again once it has cleared, so the push-off is not lost)
    N.lead = m.id; N.leadT = performance.now();
    const k = (N.id % 6) - 2.5, s = 14 + 3 + Math.abs(k) * 2, c = Course.at(s, {}), x = c.cx + k * 2.6;
    App.swap(() => { Game.reset(s); const S = Game.s, h = Course.height(x, -s, 0.5), n = Course.normal(x, -s, 0.35); S.p[0] = x; S.p[1] = S.h = Game.y0 = h; S.n[0] = n[0]; S.n[1] = n[1]; S.n[2] = n[2]; });
    if (Game.mode !== 'run' && typeof UI !== 'undefined' && UI.state === 'title' && UI.go) UI.go();
  }
  N.leadShow = () => { const P = N.lead != null && N.peers.get(N.lead); return P && P.show && !P.show.stale ? P.show : null; };

  // ---- the loop (owner, 2026-11-22 22:28 UTC: no white veil and no loading at the bottom, it should just carry on, with a word that a new lap
  // has begun). The mountain itself loops: past the end of the first LOOP_SEGS stretches the land is the top's again (Course.loopTo,
  // 03_course.js), so nothing is moved and nothing is made again; crossing the join only counts a lap. Turning it on or off changes the
  // land past the join, so the land round the lens is made again then, behind the veil, back at the top
  const LOOP = { A: 200, segs: LOOP_SEGS };
  function loopOn(on) {
    if (!!Course.wantLoop === on) return;
    App.swap(() => { Course.loopTo(on ? LOOP : null); if (Trees.reset) Trees.reset(); if (typeof Gates !== 'undefined' && Gates.reset) Gates.reset(); Game.reset(); });
    N.sEnd = Course.loop ? Course.loop.B : 0;
  }
  let lapSeen = 0;
  function lapTick() {
    const lap = Course.lapOf(-Game.s.p[2]);
    if (lap > lapSeen && Game.mode === 'run') {
      const t0 = N.runT0 ? performance.now() - N.runT0 : 0; N.runT0 = performance.now(); N.loops = lap;
      say(tx('第 ' + (lap + 1) + ' 圈', 'Lap ' + (lap + 1)) + (t0 > 5000 ? tx(' · 上一圈 ', ' · last lap ') + fmt(t0 / 1000) : ''), 3);
    }
    lapSeen = lap;
  }
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // ---- the connection
  function connect(room) {
    if (N.ws) { try { N.ws.close(); } catch (e) { } N.ws = null; }
    // (the mountain the player is on: outside dev that is the one mountain there is, 寒烟山. It was today's seed for the public room, a
    // mountain nobody otherwise sees, and a robot started on another day was on another one: owner 2026-11-24 "现在只有一座山啊")
    const seed = Course.seed || 1;
    const U = URLS[via], url = U + (U.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(room) + '&seed=' + seed + '&name=' + encodeURIComponent(N.name()) + '&col=' + me.c + (N.isBot ? '&bot=1' : '');
    let ws; try { ws = new WebSocket(url); } catch (e) { N.state = 'error'; hud(); return; }
    ws.binaryType = 'arraybuffer'; N.ws = ws; N.state = 'connecting'; N.want = room; hud();
    // (a first try that never answers — the server down, or a network that swallows it — gives up after 8 s and says so, instead of 正在连接… for ever)
    setTimeout(() => { if (N.ws === ws && ws.readyState !== 1) { try { ws.close(); } catch (e) { } if (N.ws === ws) ws.onclose(); } }, 8000);
    ws.onmessage = e => {
      if (typeof e.data !== 'string') { const dv = new DataView(e.data); if (dv.byteLength > 2) onFrame(dv.getUint8(0), dv, 1); return; }
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.t === 'hi') {
        N.fresh = false; N.id = m.id; N.room = m.room; N.seed = m.seed; N.max = m.max; N.state = 'on'; N.on = true; N.retry = 0;
        for (const id of [...N.peers.keys()]) drop(id); for (const q of m.peers || []) peer(q.id, q.name, q.col, q.b);
        if (Course.seed !== m.seed) { Course.wantLoop = LOOP; App.newMountain(m.seed); } else loopOn(true);
        N.sEnd = Course.loop ? Course.loop.B : 0; hud(); if (N.onHi) { const f = N.onHi; N.onHi = null; f(); }
      } else if (m.t === 'join') { peer(m.id, m.name, m.col, m.b); hud(); say(m.name + tx(' 来了', ' joined'), 2); }
      else if (m.t === 'bye') drop(m.id);
      else if (m.t === 'bump') bumpedBy(m);
      else if (m.t === 'go') goWith(m);
      else if (m.t === 'full') { N.state = 'full'; hud(); }
    };
    ws.onclose = () => {
      if (N.ws !== ws) return; N.ws = null; for (const id of [...N.peers.keys()]) drop(id);
      if (N.on && N.want && N.fresh && via + 1 < URLS.length) { via++; connect(N.want); return; }
      if (N.on && N.want && N.fresh) { N.on = false; N.want = null; N.onHi = null; N.state = 'off'; hud(); say(tx('连不上一起滑的服务器，等一会儿再试', 'Can\'t reach the Together server, try again in a bit'), 4); return; }
      if (N.on && N.want) { N.state = 'retry'; N.retry = (N.retry || 0) + 1; setTimeout(() => { if (N.on && !N.ws) connect(N.want); }, Math.min(15000, 1000 * Math.pow(2, N.retry))); }
      else N.state = 'off';
      hud();
    };
  }
  // 一起滑: join (the public room of today's mountain, or the friends' room in the address), then push off
  N.enter = function (room) {
    if (!me.set && !N.isBot) { nick(() => N.enter(room)); return; }
    room = room || 'pub'; if (!N.on || N.state !== 'on') N.fresh = true; N.on = true;
    // (the owner, 22:14 UTC: "robot应该和我一起出发": a person who pushes off tells the room, and the robots come back to the top and go with them)
    const go = () => { N.runT0 = performance.now(); N.loops = 0; if (typeof UI !== 'undefined' && UI.state === 'title' && UI.go) UI.go();
      announce(); };
    if (N.state === 'on' && N.want === room) { go(); return; }
    N.onHi = go; connect(room);
  };
  N.leave = function () { if (roomInHash()) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } loopOn(false); N.on = false; N.want = null; if (N.ws) try { N.ws.close(); } catch (e) { } N.ws = null; for (const id of [...N.peers.keys()]) drop(id); N.state = 'off'; hud(); };
  N.invite = function () {
    // (a friend comes to the same mountain and the same room as everyone, robots included: the link is the page itself, and the relay puts
    // a newcomer where people already are. A private room left the player alone with nobody to find (owner 2026-11-24 19:06 UTC))
    const link = location.origin + location.pathname + location.search;
    try { navigator.clipboard.writeText(link).catch(() => { }); } catch (e) { }
    say(tx('链接已复制，发给朋友，打开后点「一起滑」就能在山上碰到你：', 'Link copied. Friends who open it and press Ski together meet you here: ') + link, 6);
    return link;
  };
  function roomInHash() { const m = /(?:^#|&)ski=([\w-]{3,16})/.exec(location.hash || ''); return m ? m[1] : null; }

  // ---- the name: a small panel, the first time 一起滑 is pressed and whenever the player taps their own name in the bar. It is a layer
  // (19_ui.js U.layer): 返回, Esc or the phone's back closes it. then(): what to do once it is kept (push off)
  let nk = null, who = null, whoT = 0;
  function nick(then) {
    ui(); if (!nk) return then && then();
    const inp = nk.querySelector('input'); inp.value = me.name; nk.classList.add('on'); nk.then = then || null;
    if (typeof UI !== 'undefined' && UI.layer) UI.layer('mpnick', true, () => nickClose(false));
    setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { } }, 50);
  }
  function nickClose(keep) {
    if (!nk || !nk.classList.contains('on')) return;
    const v = nk.querySelector('input').value.replace(/[<>&"'\\\u0000-\u001f]/g, '').trim().slice(0, 12);
    nk.classList.remove('on'); if (typeof UI !== 'undefined' && UI.layer) UI.layer('mpnick', false);
    if (!keep) { nk.then = null; return; }
    me.name = v || me.name; me.set = true; keepMe(); hud();
    if (N.ws && N.ws.readyState === 1) { const r = N.want; N.onHi = null; connect(r); }          // (the others are told the new name: join again)
    const t = nk.then; nk.then = null; if (t) t();
  }

  // ---- what is shown: the bar, the names over the others, the few words
  let bar = null, tags = null, sayEl = null, sayT = 0;
  function ui() {
    if (bar || typeof document === 'undefined' || !document.body) return;
    const st = document.createElement('style');
    st.textContent = '#veil.snow{background:#e9eef4}#mpbar{position:absolute;right:max(12px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));flex-direction:row-reverse;z-index:30;display:none;gap:6px;align-items:center;font:500 13px/1 system-ui,sans-serif;color:#fff;pointer-events:auto}'
      + '#mpbar.on{display:flex}#mpbar span,#mpbar button{background:rgba(10,14,22,.42);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 12px;color:#fff;font:inherit;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}'
      + '#mpbar button{cursor:pointer;min-height:32px}#mpbar button.off{color:rgba(255,255,255,.55)}#mpbar i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px}'
      + '#mptags{position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden}#mptags div{position:absolute;transform:translate(-50%,-100%);font:600 12px/1 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);white-space:nowrap;padding:3px 7px;border-radius:999px;background:rgba(10,14,22,.28)}'
      + '#mpsay{position:absolute;left:50%;top:22%;transform:translateX(-50%);z-index:31;font:600 15px/1.3 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);background:rgba(5,8,13,.62);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:8px 14px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);opacity:0;transition:opacity .3s;pointer-events:none;text-align:center;max-width:calc(var(--cw,100vw) * .8);box-sizing:border-box;word-break:break-all}#mpsay.on{opacity:1}';
    // (the bar stands only over a run: never over a menu, a panel or the title, whose own buttons are at the same top-left corner (owner
    // 2026-11-24 19:06 UTC: the bar lay over 返回 of the pause menu). The name panel: the same dark glass as the bar)
    st.textContent += '#app.layered #mpbar,#app.mpidle #mpbar,#app.layered #mptags,#app.mpidle #mptags{display:none!important}#mpn{cursor:pointer}#mpbar span,#mpbar button{white-space:nowrap;box-sizing:border-box}#app:not(.desk) #mpbar span,#app:not(.desk) #mpbar button{min-height:44px;display:inline-flex;align-items:center}'
      + '#mpnick{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(6,9,14,.45);font:500 15px/1.3 system-ui,sans-serif;color:#fff}'
      + '#mpnick.on{display:flex}#mpnick form{display:flex;flex-direction:column;gap:12px;width:min(340px,86%);padding:20px;border-radius:16px;background:rgba(14,18,28,.82);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}'
      + '#mpnick b{font-size:17px}#mpnick input{font:inherit;font-size:17px;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:10px 12px;min-height:44px;outline:none}'
      + '#mpnick input:focus{border-color:rgba(255,255,255,.6)}#mpnick .r{display:flex;gap:10px}#mpnick button{flex:1;font:inherit;min-height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}'
      + '#mpnick button.go{background:#f0c674;color:#1a1408;border-color:#f0c674;font-weight:600}'
      + '#mpwho{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(6,9,14,.45);font:500 15px/1.3 system-ui,sans-serif;color:#fff}#mpwho.on{display:flex}'
      + '#mpwho .p{display:flex;flex-direction:column;gap:10px;width:min(360px,88%);max-height:calc(var(--ch,100vh) - 40px);box-sizing:border-box;padding:18px;border-radius:16px;background:rgba(14,18,28,.82);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}'
      + '#mpwho .h{display:flex;align-items:center;justify-content:space-between;gap:10px}#mpwho b{font-size:17px}#mpwho .x{min-height:44px;min-width:44px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:inherit;cursor:pointer}'
      + '#mpwho .l{display:flex;flex-direction:column;gap:6px;overflow-y:auto;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}'
      + '#mpwho .l button{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font:inherit;text-align:left;cursor:pointer}'
      + '#mpwho .l button:disabled{opacity:.45;cursor:default}#mpwho .l i{flex:none;width:10px;height:10px;border-radius:50%}#mpwho .l span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mpwho .l em{flex:none;font-style:normal;font-size:13px;color:rgba(255,255,255,.65)}';
    document.head.appendChild(st);
    const host = document.getElementById('app') || document.body;
    nk = document.createElement('div'); nk.id = 'mpnick';
    nk.innerHTML = '<form><b></b><input id="mpnickin" maxlength="12" autocomplete="off" spellcheck="false"><div class="r"><button type="button" class="re"></button><button type="submit" class="go"></button></div></form>';
    host.appendChild(nk);
    who = document.createElement('div'); who.id = 'mpwho';
    who.innerHTML = '<div class="p"><div class="h"><b></b><button type="button" class="x">✕</button></div><div class="l"></div></div>';
    host.appendChild(who); who.querySelector('b').textContent = tx('找谁？', 'Find who?');
    who.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button');
      if (e.target === who || (b && b.classList.contains('x'))) { whoClose(); return; }
      if (b && b.dataset.id != null && !b.disabled) { const id = +b.dataset.id; whoClose(); N.find(id); } });
    for (const ev of ['keydown', 'keyup', 'pointerdown', 'touchstart', 'mousedown']) who.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'keydown' && e.code === 'Escape') whoClose(); });
    nk.querySelector('b').textContent = tx('你在山上的名字', 'Your name on the mountain');
    nk.querySelector('.re').textContent = tx('换一个', 'Another');
    nk.querySelector('.go').textContent = tx('就叫这个', 'Use this');
    nk.querySelector('.re').addEventListener('click', e => { e.stopPropagation(); nk.querySelector('input').value = drawNick(); });
    nk.querySelector('form').addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); nickClose(true); });
    nk.addEventListener('click', e => { e.stopPropagation(); if (e.target === nk) nickClose(false); });          // (Enter in the name box clicks 就叫这个 for the form: that click must not reach #app, where on the title it means 出发 — the run began before the room answered)
    for (const ev of ['keydown', 'keyup', 'pointerdown', 'touchstart', 'mousedown']) nk.addEventListener(ev, e => e.stopPropagation());
    tags = document.createElement('div'); tags.id = 'mptags'; host.appendChild(tags);
    bar = document.createElement('div'); bar.id = 'mpbar'; bar.innerHTML = '<button type="button" id="mpout"></button><button type="button" id="mpinv"></button><button type="button" id="mptag"></button><button type="button" id="mpfind"></button><span id="mpn"></span>'; host.appendChild(bar);
    sayEl = document.createElement('div'); sayEl.id = 'mpsay'; host.appendChild(sayEl);
    bar.querySelector('#mpfind').addEventListener('click', e => { e.stopPropagation(); N.pick(); if (e.detail) e.currentTarget.blur(); });
    // (owner 2026-11-24 21:21 UTC: with many people a name over every head clutters the picture: 名字 turns them on and off, kept on this device)
    bar.querySelector('#mptag').addEventListener('click', e => { e.stopPropagation(); N.tagsOn = !N.tagsOn; try { localStorage.setItem('cs.mp.tags', N.tagsOn ? '1' : '0'); } catch (_) { } if (tags) tags.style.display = N.tagsOn ? '' : 'none'; hud(); if (e.detail) e.currentTarget.blur(); });
    if (!N.tagsOn) tags.style.display = 'none';
    bar.querySelector('#mpinv').addEventListener('click', e => { e.stopPropagation(); N.invite(); });
    bar.querySelector('#mpout').addEventListener('click', e => { e.stopPropagation(); N.leave(); });
    bar.querySelector('#mpn').addEventListener('click', e => { e.stopPropagation(); nick(null); });
    // (owner 2026-11-24 19:24 UTC: after 离开 there was no way back in from the pause menu — the title and the pause menu had different entries.
    // Both now carry the same one: 一起滑 when off, 离开一起滑 when on)
    const toggle = e => { e.stopPropagation(); const t = e.currentTarget; if (t.id === 'm-mp' && typeof UI !== 'undefined' && UI.menu) UI.menu(false); if (N.on) N.leave(); else N.enter(); if (e.detail) t.blur(); };
    const b = document.getElementById('mpgo'); if (b) { b.hidden = false; b.addEventListener('click', toggle); }
    // (owner 2026-11-24 20:29 UTC「我应该随时可以改我的名字呀」: 设置 has a 名字 button, in or out of 一起滑; the bar's name still opens it too)
    const opts = document.querySelector('#mpane section[data-sec="opt"] .opts');
    if (opts) { const o = document.createElement('button'); o.type = 'button'; o.id = 'o-name'; o.addEventListener('click', e => { e.stopPropagation(); nick(null); if (e.detail) o.blur(); }); opts.appendChild(o); }
    const at = document.getElementById('m-chal') || document.getElementById('m-photo');
    if (at && at.parentNode) { const m = document.createElement('button'); m.type = 'button'; m.id = 'm-mp'; m.addEventListener('click', toggle); at.parentNode.insertBefore(m, at.nextSibling); }
    hud();
  }
  // (top right, owner 2026-11-24 19:13 UTC "状态栏可以放到右边？": in the same row as the game's own buttons (#bar), just to their left)
  // (menu thread's check 2026-11-24 21:45 UTC: on narrow screens the bar lay over the speed and the run's name, and English labels broke
  // in two. So: the full bar beside the game's buttons if it clears every part of the HUD; else short labels; else a row of its own under
  // the clock. The HUD's boxes are read twice a second, not every frame; the names over the others keep out of the same boxes)
  const HUDSEL = '#seg,.spd,#clock,#bar,#pad,#jump,#steer,#tuck,#cross,#drop,#hint,#say,#vw';
  // (menu thread 22:29 UTC: on a small phone the bar hopped between its two rows as the run's name came and went, so a finger missed it.
  // Once it has had to step down (short labels, or its own row) it stays there until the screen changes size)
  let hudBoxes = [], placeT = 0, placeLv = 0, placeWH = '', placeHit = 0, placeOn = 0, hintOn = null;          // (it steps down only after clashing on two reads in a row, and not in the first 2 s of being shown: menu thread 23:15 UTC, a wide screen got locked low by one bump at the start)
  const over = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  function readHud(ra) {          // (faded parts count too: the run's name fades in at every new stretch)
    hudBoxes = [];
    for (const e of document.querySelectorAll(HUDSEL)) { if (bar.contains(e)) continue; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) hudBoxes.push({ id: e.id, b: [r.left - ra.left, r.top - ra.top, r.right - ra.left, r.bottom - ra.top] }); }
  }
  function placeBar(force) {
    if (!bar || !bar.classList.contains('on')) return;
    const now = performance.now(); if (!force && now < placeT) return; placeT = now + 500;
    const a = document.getElementById('app'), b = document.getElementById('bar'); if (!a || !b) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); readHud(ra);
    if (!(rb.width > 0)) { bar.style.right = bar.style.top = ''; return; }
    const clashes = () => { const r = bar.getBoundingClientRect(), q = [r.left - ra.left, r.top - ra.top, r.right - ra.left, r.bottom - ra.top]; return q[0] < 8 || hudBoxes.some(h => h.id !== 'bar' && over(q, h.b)); };
    const row1 = () => { bar.style.right = Math.round(ra.right - rb.left + 8) + 'px'; bar.style.top = Math.round(rb.top - ra.top + (rb.height - bar.offsetHeight) / 2) + 'px'; };
    // (menu thread 23:36 UTC: deciding by what it bumps into now made it sit on the HUD for the first seconds and drop a row mid-run when a
    // long stretch name came. Now it is decided once per screen size and language, against the widest the run's name can ever be (every
    // name measured in a hidden copy of #seg) and the speed, clock and buttons; then it stays)
    if (!bar.offsetWidth) return;
    const wh = Math.round(ra.width) + 'x' + Math.round(ra.height) + (I18N.en() ? 'en' : 'zh');
    if (wh !== placeWH) {
      placeWH = wh; const seg = document.getElementById('seg'), worst = [];
      if (seg && seg.parentNode && typeof SEG_NAMES !== 'undefined') {
        const c = seg.cloneNode(true); c.style.cssText += ';opacity:1;transform:none;transition:none;visibility:hidden;pointer-events:none';
        seg.parentNode.appendChild(c); const b = c.querySelector('b'), sm = c.querySelector('small'), sp = c.querySelector('.split');
        if (sp) sp.style.display = 'none';
        for (const k of Object.keys(SEG_NAMES)) { if (b) b.textContent = I18N.t(SEG_NAMES[k]); if (sm) sm.textContent = I18N.en() ? '10' : '10 · DEEP POWDER'; const r = c.getBoundingClientRect(); worst.push([r.left - ra.left, r.top - ra.top, r.right - ra.left, r.bottom - ra.top]); }
        c.remove();          // (the copy kept id="seg" while measured, as its look comes from #seg; the real one comes first, getElementById still finds it)
      }
      const box = worst.reduce((a, q) => a ? [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])] : q, null);
      const obs = hudBoxes.filter(h => h.id !== 'bar' && h.id !== 'seg').map(h => h.b); if (box) obs.push(box);
      const fits = () => { const r = bar.getBoundingClientRect(), q = [r.left - ra.left, r.top - ra.top, r.right - ra.left, r.bottom - ra.top]; return q[0] >= 8 && !obs.some(o => over(q, o)); };
      // (measured as wide as it gets: 找人 shown, two-figure head count)
      const fd = bar.querySelector('#mpfind'), nn = bar.querySelector('#mpn'), wide = () => { fd.hidden = false; nn.textContent = nn.textContent.replace(/\d+/, '16'); };
      bar.classList.remove('cmp'); hud(); wide(); row1(); placeLv = fits() ? 0 : (bar.classList.add('cmp'), hud(), wide(), row1(), fits() ? 1 : 2);
    }
    bar.classList.toggle('cmp', placeLv > 0); hud();
    if (placeLv < 2) { row1(); return; }
    const ck = hudBoxes.find(h => h.id === 'clock'), y = Math.max(rb.bottom - ra.top, ck ? ck.b[3] : 0) + 6;
    bar.style.right = Math.round(ra.right - rb.right) + 'px'; bar.style.top = Math.round(y) + 'px';
  }
  function hud() {
    if (!bar) return; bar.classList.toggle('on', N.on);
    const n = N.peers.size + 1, w = { connecting: tx('正在连接…', 'Connecting…'), retry: tx('断开了，正在重连…', 'Reconnecting…'), full: tx('房间满了', 'Room is full'), error: tx('连不上服务器', 'Can\'t reach the server') }[N.state];
    const cmp = bar.classList.contains('cmp');
    bar.querySelector('#mpn').innerHTML = '<i style="background:' + CSS(COLS[me.c]) + '"></i>' + (w || (cmp ? tx(n + ' 人', n + ' here') : (N.room && N.room !== 'pub' ? tx('朋友房间 ', 'Friends ') + N.room + ' · ' : tx('一起滑 · ', 'Together · ')) + tx('山上 ' + n + ' 人', n + ' on the mountain')));
    bar.querySelector('#mpfind').textContent = cmp ? tx('找人', 'Find') : tx('找人', 'Find someone'); bar.querySelector('#mpfind').hidden = !N.peers.size; bar.querySelector('#mpinv').textContent = cmp ? tx('邀请', 'Invite') : tx('邀请朋友', 'Invite'); const tg = bar.querySelector('#mptag'); tg.textContent = cmp ? tx('名字', 'Names') : N.tagsOn ? tx('名字 开', 'Names on') : tx('名字 关', 'Names off'); tg.setAttribute('aria-pressed', N.tagsOn ? 'true' : 'false'); tg.classList.toggle('off', !N.tagsOn); bar.querySelector('#mpout').textContent = tx('离开', 'Leave');
    const lbl = N.on ? tx('离开一起滑', 'Leave Together') : tx('一起滑', 'Together');
    const b = document.getElementById('mpgo'); if (b) { const t = [...b.childNodes].reverse().find(x => x.nodeType === 3); if (t) t.textContent = N.on ? tx('离开', 'Leave') : lbl; }          // (the title's third of a row is too narrow for 离开一起滑)
    const m = document.getElementById('m-mp'); if (m) m.textContent = lbl;
    const o = document.getElementById('o-name'); if (o) o.textContent = tx('名字 · ', 'Name · ') + N.name();
  }
  function say(t, sec) { if (!sayEl) return; sayEl.textContent = t; sayEl.classList.add('on'); sayT = performance.now() + sec * 1000; }

  const _v = [0, 0, 0, 0];
  // (the owner, 22:13 UTC: "没有人啊？" — the others were far down the mountain and nothing said so. So everyone on the mountain always shows:
  // on the screen, a name over the head; off it, or too far to see, a name and how far, pinned to the edge of the screen in their direction)
  function tagsFrame(list) {
    if (!tags) return; const vp = Render.vp, o = Render.origin, cv = document.getElementById('view'); if (!vp || !cv) return;
    const rc = cv.getBoundingClientRect(), hr = tags.getBoundingClientRect(), me0 = Game.s.p, W = rc.width, H = rc.height, L = rc.left - hr.left, T = rc.top - hr.top;
    const show = [], ap = document.getElementById('app'), arc = ap ? ap.getBoundingClientRect() : hr, appL = arc.left, appT = arc.top;
    const hn = document.getElementById('hint'), hv = !!(hn && hn.offsetWidth && getComputedStyle(hn).opacity !== '0'); if (hv !== hintOn) { hintOn = hv; placeT = 0; }
    if (!hudBoxes.length || performance.now() > placeT) { if (bar && bar.classList.contains('on')) placeBar(); else readHud(arc); }
    for (const P of N.peers.values()) {
      const sh = P.show;
      if (!P.el) { P.el = document.createElement('div'); tags.appendChild(P.el); }
      if (!sh || sh.stale) { P.el.style.display = 'none'; continue; }
      const dist = Math.hypot(sh.p[0] - me0[0], sh.p[1] - me0[1], sh.p[2] - me0[2]);
      const x = sh.p[0] - o[0], y = sh.p[1] - o[1] + 2.05, z = sh.p[2] - o[2];
      for (let i = 0; i < 4; i++) _v[i] = vp[i] * x + vp[4 + i] * y + vp[8 + i] * z + vp[12 + i];
      let nx = _v[3] > 0.01 ? _v[0] / _v[3] : (_v[0] >= 0 ? 9 : -9), ny = _v[3] > 0.01 ? _v[1] / _v[3] : -9;
      const onScreen = list.includes(P) && _v[3] > 0.5 && Math.abs(nx) < 0.95 && Math.abs(ny) < 0.95;
      let txt = P.name;
      if (!onScreen) {
        // pinned: the direction to them on the screen, held inside its edge (behind the lens: along the bottom, to their side)
        // (kept out of the corners, where the speed, the drop and the buttons are: a pin lay over the speed at the bottom left)
        if (_v[3] <= 0.01) { nx = _v[0] >= 0 ? 0.4 : -0.4; ny = -0.72; }
        const k = Math.max(Math.abs(nx) / 0.7, Math.abs(ny) / 0.72, 1); nx /= k; ny /= k;
        txt = P.name + ' · ' + (dist < 1000 ? Math.round(dist) + tx(' 米', ' m') : (dist / 1000).toFixed(1) + tx(' 公里', ' km'));
      }
      const sx = L + (0.5 + 0.5 * nx) * W, sy = T + (0.5 - 0.5 * ny) * H;
      show.push({ P, sx, sy, txt, dist, onScreen });
    }
    // (menu thread's check 2026-11-24: names piled on each other and lay over the HUD and the touch buttons. Nearest first; a name that would
    // land on a nearer one, or on any part of the HUD, is left out this frame. The size is reckoned from the text, not read back from the page)
    show.sort((a, b) => a.dist - b.dist); const taken = [];
    const hb = hudBoxes.map(h => [h.b[0] - (hr.left - appL), h.b[1] - (hr.top - appT), h.b[2] - (hr.left - appL), h.b[3] - (hr.top - appT)]);
    if (bar && bar.offsetWidth) { const r = bar.getBoundingClientRect(); hb.push([r.left - hr.left, r.top - hr.top, r.right - hr.left, r.bottom - hr.top]); }
    for (const t of show) {
      const P = t.P, w = 18 + [...t.txt].reduce((k, c) => k + (c.charCodeAt(0) > 255 ? 12 : 7), 0), box = [t.sx - w / 2, t.sy - 20, t.sx + w / 2, t.sy];
      if (taken.some(q => over(q, box)) || hb.some(q => over(q, box))) { P.el.style.display = 'none'; continue; }
      taken.push(box);
      P.el.style.display = ''; P.el.style.left = t.sx.toFixed(1) + 'px'; P.el.style.top = t.sy.toFixed(1) + 'px';
      P.el.style.opacity = t.onScreen ? String(Math.max(0.35, Math.min(1, 1.4 - t.dist / 160))) : '0.85';
      if (P.el.textContent !== t.txt) { P.el.textContent = t.txt; P.el.style.borderLeft = '3px solid ' + CSS(COLS[P.col]); }
    }
  }

  // ---- 找人: put my skier a little behind one of the others, on their line, at their speed (the white veil, as the loop's)
  let findK = 0;
  // ---- 找人 asks who (owner 2026-11-24 21:19 UTC「找人我应该是可以选找谁呀」, it used to take you straight to the next one): everyone on the
  // mountain, nearest first, with how far and whether ahead or behind; the ones still at the top are listed but cannot be gone to yet
  function whoRows(full) {
    const l = who.querySelector('.l'), me0 = Game.s.p, rows = [];
    for (const P of N.peers.values()) {
      const sh = P.show, ok = !!(sh && !sh.stale && sh.run);
      const d = ok ? Math.hypot(sh.p[0] - me0[0], sh.p[2] - me0[2]) : Infinity, ah = ok && -sh.p[2] > -me0[2];
      rows.push({ P, ok, d, t: !sh || sh.stale ? tx('看不到', 'out of sight') : !sh.run ? tx('还在山顶', 'still at the top') : d < 30 ? tx('就在旁边', 'right here') : (ah ? tx('前面 ', 'ahead ') : tx('后面 ', 'behind ')) + (d < 1000 ? Math.round(d) + tx(' 米', ' m') : (d / 1000).toFixed(1) + tx(' 公里', ' km')) });
    }
    // (refreshed while open: the rows stay the same nodes, only their words change, so a finger already on one is not lost under it)
    const have = [...l.querySelectorAll('button')];
    if (!full && have.length === rows.length && rows.every(r => have.some(b => +b.dataset.id === r.P.id))) {
      for (const r of rows) { const b = have.find(x => +x.dataset.id === r.P.id); b.disabled = !r.ok; b.querySelector('em').textContent = r.t; }
      return;
    }
    rows.sort((a, b) => a.d - b.d);
    l.innerHTML = '';
    if (!rows.length) { const e = document.createElement('em'); e.textContent = tx('这里暂时只有你一个人', 'Nobody else is here right now'); l.appendChild(e); }
    for (const r of rows) { const b = document.createElement('button'); b.type = 'button'; b.dataset.id = r.P.id; b.disabled = !r.ok;
      b.innerHTML = '<i></i><span></span><em></em>'; b.querySelector('i').style.background = CSS(COLS[r.P.col] || COLS[0]); b.querySelector('span').textContent = r.P.name; b.querySelector('em').textContent = r.t; l.appendChild(b); }
  }
  N.pick = function () {
    ui(); if (!who) return;
    if (Game.mode !== 'run') { say(tx('先出发，再找人', 'Push off first, then find someone'), 2.5); return; }
    whoRows(true); who.classList.add('on'); clearInterval(whoT); whoT = setInterval(() => { if (who.classList.contains('on')) whoRows(); }, 700);
    if (typeof UI !== 'undefined' && UI.layer) UI.layer('mpwho', true, () => whoClose());
  };
  function whoClose() { if (!who || !who.classList.contains('on')) return; who.classList.remove('on'); clearInterval(whoT); if (typeof UI !== 'undefined' && UI.layer) UI.layer('mpwho', false); }
  N.find = function (id) {
    const live = [...N.peers.values()].filter(P => P.show && !P.show.stale && P.show.run);
    // (every way of not going says why: owner 2026-11-24 19:07 UTC "点找人为什么没有反应")
    if (App.swapping) return false;
    if (Game.mode !== 'run') { say(tx('先出发，再找人', 'Push off first, then find someone'), 2.5); return false; }
    if (!live.length) { say(N.peers.size ? tx('别人还在山顶，等他们出发', 'The others are still at the top') : tx('这里暂时只有你一个人', 'Nobody else is here right now'), 2.5); return false; }
    const P = id != null ? N.peers.get(id) || live[0] : live[findK++ % live.length];
    const veil = document.getElementById('veil'); if (veil) veil.classList.add('snow');
    // (owner 2026-11-24 21:46 UTC「找人来到身后还是看不到人…而且离得很近」: the place was taken from where they were at the press, and the
    // run started again from a stand after the veil, a second or two later — by then they were 100-150 m down and going away. Now the
    // place is taken at the moment the veil lifts, from where they are then, and the run goes on at their speed (set again once it is on))
    App.swap(() => behind(P, false));
    N.findGo = { P, t: performance.now() };
    say(tx('来到 ', 'Behind ') + P.name + tx(' 身后', ''), 2.5);
    setTimeout(() => { if (veil) veil.classList.remove('snow'); }, 2200);
    return true;
  };
  // put my skier GAP m behind P on their line; with speed: at their speed along their way
  const GAP = 9;
  function behind(P, speed) {
    const sh = P.show; if (!sh) return; const v = sh.v, sp = Math.hypot(v[0], v[2]), ux = sp > 1 ? v[0] / sp : 0, uz = sp > 1 ? v[2] / sp : -1;
    // (they are drawn on the lap nearest me: near the loop's end that can be "above the top" of mine. Placed there, the skier stood at the
    // start, far from them. Their place is moved on a lap until it is on the loop itself)
    const q = sh.p.slice(), Lp = Course.loop; if (Lp) for (let i = 0; i < 4 && -(q[2] - uz * GAP) < Lp.A + 20; i++) Course.lapShift(q, -1);
    const x = q[0] - ux * GAP, z = q[2] - uz * GAP, s = Math.max(14, -z);
    if (!speed) Game.reset(s);
    const S = Game.s, h = Course.height(x, -s, 0.5), n = Course.normal(x, -s, 0.35);
    S.p[0] = x; S.p[2] = -s; S.p[1] = S.h = Game.y0 = h; S.n[0] = n[0]; S.n[1] = n[1]; S.n[2] = n[2];
    // (their own speed: a cap of 24 m/s let a fast one pull away)
    if (speed) { const k = Math.min(1, 45 / Math.max(1, Math.hypot(v[0], v[1], v[2]))); S.v[0] = v[0] * k; S.v[1] = v[1] * k; S.v[2] = v[2] * k; S.speed = Math.hypot(S.v[0], S.v[1], S.v[2]); }
  }
  // the run is on again after the veil: once, the place from where they are now and their speed
  App.onTick.push(() => {
    const F = N.findGo; if (!F) return;
    if (performance.now() - F.t > 8000 || !N.peers.has(F.P.id)) { N.findGo = null; return; }
    if (App.swapping || Game.mode !== 'run') return;
    if (!F.P.show || F.P.show.stale) return;          // (their frames are a moment late after the veil's heavy frames: wait for the next)
    N.findGo = null; behind(F.P, true);
  });

  // the motion blur is told where each of the others is and how far it moved since the last frame drawn (09_post.js, Post.others), so that a
  // skier going by at the speed of the lens is not smeared as if it stood still in the snow
  function blurOthers(cp) {
    const o = Render.origin, L = Post.others; L.length = 0;
    for (const P of N.peers.values()) if (!vis.includes(P)) P.blurP = null;
    const near = vis.slice().sort((a, b) => Math.hypot(a.show.p[0] - cp[0], a.show.p[2] - cp[2]) - Math.hypot(b.show.p[0] - cp[0], b.show.p[2] - cp[2]));
    for (const P of near) {
      const p = P.show.p, q = P.blurP || (P.blurP = p.slice()), m = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      if (Math.hypot(m[0], m[1], m[2]) > 6) m[0] = m[1] = m[2] = 0;          // (a lap, a jump to someone: no streak)
      q[0] = p[0]; q[1] = p[1]; q[2] = p[2];
      if (L.length < 6) L.push({ c: [p[0] - o[0], p[1] - o[1] + 0.85, p[2] - o[2]], r: 0.78, m });
    }
  }
  // ---- every frame
  let sendT = 0, vis = [];
  App.onTick.push((dt, draw) => {
    ui();
    if (sayEl && sayT && performance.now() > sayT) { sayEl.classList.remove('on'); sayT = 0; }
    { const a = document.getElementById('app'); if (a) a.classList.toggle('mpidle', !(typeof UI === 'undefined' || UI.state === 'run')); }
    placeBar();
    if (!N.on) { vis = []; if (tags && tags.childElementCount) tags.textContent = ''; return; }
    const now = performance.now() / 1000;
    if (N.ws && N.ws.readyState === 1 && now - sendT >= 1 / HZ && !App.swapping) { sendT = now; const b = pack(); if (b) try { N.ws.send(b); } catch (e) { } }
    vis = [];
    for (const P of N.peers.values()) { const sh = place(P, now); if (sh && !sh.stale) vis.push(P); }
    touch(dt);
    if (draw) { const cp = Render.cam.pos; vis = vis.filter(P => Math.hypot(P.show.p[0] - cp[0], P.show.p[2] - cp[2]) < 450 && bones(P, P.show)); tagsFrame(vis); blurOthers(cp); }
    else if (!vis.length) Post.others.length = 0;
    lapTick();
  });
  Render.passes.shadow.push(() => { if (vis.length) Skier.drawOthersShadow(vis.map(P => ({ tex: P.tex }))); });
  Render.passes.opaque.push(R => { if (vis.length) Skier.drawOthers(vis.map(P => ({ tex: P.tex, col: P.rgba })), R.shadowTex, Sky.lut); });
  App.onMountain.push(() => { N.sEnd = Course.loop ? Course.loop.B : 0; });
  // (an old friends' link, #ski=CODE, from when 邀请朋友 made a private room: the address is cleaned up, and 一起滑 goes where everyone is)
  { const iv = setInterval(() => { if (!App.ready) return; clearInterval(iv); ui(); if (roomInHash()) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }, 300); }
  N.stats = () => ({ state: N.state, id: N.id, room: N.room, seed: N.seed, sEnd: N.sEnd, loops: N.loops, bumps: N.bumps || 0, peers: [...N.peers.values()].map(P => ({ id: P.id, name: P.name, n: P.snaps.length, shown: vis.includes(P), p: P.show && P.show.p.map(x => +x.toFixed(2)) })) });
  return N;
})();
