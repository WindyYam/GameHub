"use strict";
// ---------------------------------------------------------------- 路线卡: the line a challenge run drew down the mountain, as a picture to share
// Asked by the owner (2026-11-18 23:00 UTC): when a challenge is over and the player looks at the result, a beautiful card with the route
// they skied on it, to screenshot or share ("给他们一个这个成绩单上面加了一个他滑行的路线这个卡，就是一个很漂亮的一个这个 visualization").
// Aim (his 23:03 UTC rewrite): someone who never played sees at a glance a line skied down a snowy mountain and wants to try; someone who did
// wants another go at a better line. Bar: good sport share cards (Strava, ski apps) and the feel of topographic maps and contours.
// First step (his rule: show the ways to draw it, he picks, then it goes in the game): three ways, all from the run's own numbers and the real
// mountain, nothing painted. Cards stay landscape and nothing figurative on them (集卡 rule 2026-11-17: landscape, traces, no animals/people).
//   a 等高线  the mountain from above as a night topographic map: hill shading, contours every 20 m (every 100 m bolder), the forest as
//             specks, the run's groomed band, the route lit by speed, every ring on it, the stations named along the way, a scale bar
//   b 剖面    the run seen from the side as a poster: the ridges beside the run as layered silhouettes, hazier the farther, under a night
//             sky with the moon of this card's seed; the run's own profile in front with the route on it (jumps lift off it)
//   c 山脊线  the mountain in perspective from below the finish, as stacked cross-sections every 50 m (each hides the ones behind it), the
//             route threaded through them
// RouteCard.draw(canvas, data, style) draws onto a canvas of any size (laid out for 16:9). data:
//   track [[x, s, y, speed, air], ...] every 0.1 s from 出发 (s = metres down the course, x across, y height), rings [{ s, x, y, pass }],
//   segs [{ s0, len, type }], names ['1 开阔大坡', ...], H(x, s) the height of the mountain, line '越野线', diff '标准', mountain '寒烟山',
//   score (= t − ring bonus), t, bonus (s per ring passed), date (ms), seed (a number: the player and the moment)
// (用户 2026-11-19 00:52 UTC: 中文模式出现了 Challenge → every word in the language of the moment) W: a word through the dictionary (00a_i18n.js)
const RC_W = s => typeof I18N !== 'undefined' ? I18N.t(s) : s, RC_EN = () => typeof I18N !== 'undefined' && I18N.en();
const RouteCard = self.RouteCard = (() => {
  const RC = {};
  const SONG = '"Noto Serif SC","Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC",serif';
  const LAT = '"Jost","Futura","Avenir Next","Century Gothic","Segoe UI",sans-serif';
  const SUN = [255, 208, 138], SNOW = [244, 247, 251], COOL = [150, 186, 226], MISS = '#ff9d8c';
  const cl = (v, a, b) => v < a ? a : v > b ? b : v, mix = (a, b, u) => a + (b - a) * u;
  const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), r = t - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); };
  const rgb = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')';
  const lerpC = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
  function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // ---- what the run was, in numbers, and the card's code (from the line itself: two runs never give the same one)
  function stats(d) {
    const T = d.track, n = T.length; let dist = 0, air = 0, vmax = 0;
    for (let i = 1; i < n; i++) { dist += Math.hypot(T[i][0] - T[i - 1][0], T[i][1] - T[i - 1][1], T[i][2] - T[i - 1][2]); if (T[i][4]) air += 0.1; vmax = Math.max(vmax, T[i][3]); }
    let h = 2166136261 >>> 0; const mixh = v => { h ^= v & 0xffff; h = Math.imul(h, 16777619) >>> 0; };
    for (let i = 0; i < n; i += 7) { mixh(Math.round(T[i][0] * 10)); mixh(Math.round(T[i][1])); }
    mixh(d.seed || 0);
    const A = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ', code = [0, 1, 2, 3, 4, 5, 6, 7].map(i => A[(h >>> (i * 4) ^ (h >>> (28 - i * 3))) % 34]).join('');
    const passed = d.rings.filter(r => r.pass).length;
    return { dist, air, vmax, drop: T[0][2] - T[n - 1][2], passed, tot: d.rings.length, code: code.slice(0, 4) + '·' + code.slice(4), sMax: T[n - 1][1] };
  }
  // speed to colour: crawling a cool pale blue, cruising snow white, flying the sun's gold
  function vcol(v, lo, hi) { const u = cl((v - lo) / (hi - lo), 0, 1); return u < 0.45 ? lerpC(COOL, SNOW, u / 0.45) : lerpC(SNOW, SUN, (u - 0.45) / 0.55); }

  // the route as a lit line: a wide soft glow, then the line itself, coloured piece by piece by speed. P(i) gives [X, Y] of track point i
  function route(g, d, P, w, st, from, to) {
    const T = d.track, lo = 6, hi = Math.max(lo + 4, st.vmax * 0.92), n = T.length, a = from || 0, b = to == null ? n - 1 : to;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1, 2]) {
      const lw = pass === 0 ? w * 5 : pass === 1 ? w * 2.2 : w, al = pass === 0 ? 0.13 : pass === 1 ? 0.28 : 0.95;
      if (pass === 0) { g.shadowColor = rgb(SUN, 0.5); g.shadowBlur = w * 6; } else g.shadowBlur = 0;
      for (let i = a; i < b; i += 4) {
        const j = Math.min(b, i + 4), c = vcol(T[Math.min(n - 1, i + 2)][3], lo, hi);
        g.strokeStyle = rgb(pass === 2 ? c : lerpC(c, SUN, 0.5), al); g.lineWidth = T[i][4] && pass === 2 ? w * 0.6 : lw;
        g.beginPath(); let p = P(i); g.moveTo(p[0], p[1]); for (let k = i + 1; k <= j; k++) { p = P(k); g.lineTo(p[0], p[1]); } g.stroke();
      }
    }
    g.restore();
  }
  // the rings on the route: a gold point for each one passed, an open coral ring for each missed
  function ringsOn(g, d, Q, r) {
    for (const q of d.rings) { const p = Q(q); if (!p) continue;
      g.beginPath(); g.arc(p[0], p[1], q.pass ? r : r * 1.25, 0, 6.2832);
      if (q.pass) { g.fillStyle = rgb(SUN, 0.95); g.fill(); } else { g.strokeStyle = MISS; g.lineWidth = Math.max(1, r * 0.5); g.stroke(); } }
  }
  // the track point nearest a course distance s (track s only grows: binary search)
  function at(T, s) { let a = 0, b = T.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (T[m][1] < s) a = m; else b = m; } return a; }

  // ---- the words: line and difficulty, the time, the numbers, the code and the date, the game's name
  function words(g, W, H, d, st, o) {
    const u = W / 1600, ink = o.ink || SNOW, dim = rgb(ink, 0.62), faint = rgb(ink, 0.4);
    g.save(); g.textBaseline = 'alphabetic';
    if (o.shade) { const gr = g.createLinearGradient(0, H, 0, H * 0.55); gr.addColorStop(0, o.shade); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, H * 0.55, W, H * 0.45);
      const g2 = g.createLinearGradient(0, 0, 0, H * 0.24); g2.addColorStop(0, o.shade); g2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = g2; g.fillRect(0, 0, W, H * 0.24); }
    const L = 72 * u, B = H - 64 * u;
    g.fillStyle = rgb(ink); g.font = '400 ' + 46 * u + 'px ' + SONG; g.fillText(d.line, L, 104 * u);
    const lw = g.measureText(d.line).width;
    g.fillStyle = dim; g.font = '400 ' + 20 * u + 'px ' + SONG; spaced(g, d.diff + ' · ' + d.mountain, L + lw + 22 * u, 102 * u, 0.24 * 20 * u);
    g.fillStyle = rgb(SUN); g.fillRect(L, 128 * u, 30 * u, 1.5 * u);
    // the time, large and light, the numbers under it
    g.fillStyle = rgb(ink); g.font = '300 ' + 112 * u + 'px ' + LAT; g.fillText(fmt(d.score), L - 4 * u, B - 64 * u);
    const items = [[st.passed + ' / ' + st.tot, '光圈'], [(st.vmax * 3.6).toFixed(0) + ' km/h', '最快'], [(st.dist / 1000).toFixed(2) + ' km', '滑行'], [Math.round(st.drop).toLocaleString('en-US') + ' m', '落差']];
    if (st.air > 0.5) items.push([st.air.toFixed(1) + ' s', '腾空']);
    let x = L;
    for (const [v, k] of items) { g.fillStyle = rgb(ink, 0.92); g.font = '300 ' + 30 * u + 'px ' + LAT; g.fillText(v, x, B); const vw = g.measureText(v).width;
      g.fillStyle = faint; g.font = '400 ' + 15 * u + 'px ' + SONG; spaced(g, k, x, B + 30 * u, 0.3 * 15 * u); x += Math.max(vw, 60 * u) + 44 * u; }
    // top right: the card's own code and the date; bottom right: the game
    const R = W - 72 * u, dt = new Date(d.date || Date.now()), ds = dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0') + '  ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    g.textAlign = 'right'; g.fillStyle = dim; g.font = '500 ' + 15 * u + 'px ' + LAT; spacedR(g, '#' + st.code, R, 96 * u, 0.3 * 15 * u);
    g.fillStyle = faint; spacedR(g, ds, R, 122 * u, 0.2 * 15 * u);
    g.fillStyle = rgb(ink, 0.9); g.font = '400 ' + 24 * u + 'px ' + SONG; spacedR(g, '雪迹', R, B, 0.3 * 24 * u);
    g.fillStyle = faint; g.font = '500 ' + 12 * u + 'px ' + LAT; spacedR(g, 'COLD SMOKE', R, B + 26 * u, 0.42 * 12 * u);
    g.restore();
  }
  function spaced(g, s, x, y, sp) { for (const ch of s) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; } return x; }
  function spacedR(g, s, x, y, sp) { const a = g.textAlign; g.textAlign = 'left'; let w = 0; for (const ch of s) w += g.measureText(ch).width + sp; spaced(g, s, x - w + sp, y, sp); g.textAlign = a; }
  function frame(g, W, H, c) { const u = W / 1600; g.save(); g.strokeStyle = c; g.lineWidth = 1.2 * u; g.strokeRect(28 * u, 28 * u, W - 56 * u, H - 56 * u); g.restore(); }
  function stations(d) { const out = []; d.segs.forEach((sg, i) => { if (i < d.names.length) out.push({ s: sg.s0, name: d.names[i] }); }); return out; }

  // ================================================================ a 等高线: the night topographic map
  function drawA(g, W, H, d, st) {
    const u = W / 1600, T = d.track, s0 = T[0][1] - 160, s1 = st.sMax + 160, k = (W - 0) / (s1 - s0);
    let xm = 0; for (const p of T) xm += p[0]; xm /= T.length;
    const yc = H * 0.5, X = s => (s - s0) * k, Y = x => yc + (x - xm) * k, IX = px => s0 + px / k, IY = py => xm + (py - yc) / k;
    g.fillStyle = '#070b12'; g.fillRect(0, 0, W, H);
    // hill shading, from the mountain's own heights, at a quarter of the card's pixels
    const sw = Math.ceil(W / 3), sh = Math.ceil(H / 3), img = g.createImageData(sw, sh), D = img.data, e = 6;
    let hmin = 1e9, hmax = -1e9; for (let j = 0; j < sh; j += 6) for (let i = 0; i < sw; i += 6) { const h = d.H(IY(j * 3), IX(i * 3)); if (h == null) continue; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const x = IY(j * 3), s = IX(i * 3), h = d.H(x, s), o = (j * sw + i) * 4;
      if (h == null) { D[o] = 7; D[o + 1] = 11; D[o + 2] = 18; D[o + 3] = 255; continue; }
      const hx = (d.H(x + e, s) - d.H(x - e, s)) / (2 * e), hs = (d.H(x, s + e) - d.H(x, s - e)) / (2 * e);
      // light from up the mountain and to one side, low (a moonlit relief)
      const nx = -hx, ns = -hs, nl = Math.hypot(nx, ns, 1), lit = cl((nx * 0.55 + ns * -0.62 + 0.56) / nl, 0, 1);
      const el = cl((h - hmin) / (hmax - hmin + 1e-6), 0, 1), fade = cl(Math.min(j, sh - j) / (sh * 0.16), 0, 1) * cl(Math.min(i, sw - i) / (sw * 0.04), 0, 1);
      const v = (10 + 54 * Math.pow(lit, 1.4) + 14 * el) * fade + 8 * (1 - fade);
      D[o] = v * 0.80 + 2; D[o + 1] = v * 0.90 + 4; D[o + 2] = v * 1.08 + 8; D[o + 3] = 255;
    }
    const cv = mk(sw, sh); cv.getContext('2d').putImageData(img, 0, 0);
    g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, W, H); g.restore();
    // contours: marching squares on a 10 m grid over the card
    const step = 10, nx = Math.ceil((s1 - s0) / step) + 1, ny = Math.ceil((H / k) / step) + 1, yA = IY(0), G = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const h = d.H(yA + j * step, s0 + i * step); G[j * nx + i] = h == null ? NaN : h; }
    const lev0 = Math.ceil(hmin / 20) * 20;
    g.save(); g.lineCap = 'round';
    for (let lv = lev0; lv <= hmax; lv += 20) {
      const major = lv % 100 === 0; g.beginPath();
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = G[j * nx + i], b = G[j * nx + i + 1], c = G[(j + 1) * nx + i + 1], dd = G[(j + 1) * nx + i];
        if (a !== a || b !== b || c !== c || dd !== dd) continue;
        const m = (a > lv) | (b > lv) << 1 | (c > lv) << 2 | (dd > lv) << 3; if (m === 0 || m === 15) continue;
        const px = (i2, j2) => [X(s0 + i2 * step), Y(yA + j2 * step)];
        const E = [];
        const ed = (va, vb, pa, pb) => { const t = (lv - va) / (vb - va); E.push([mix(pa[0], pb[0], t), mix(pa[1], pb[1], t)]); };
        const P0 = px(i, j), P1 = px(i + 1, j), P2 = px(i + 1, j + 1), P3 = px(i, j + 1);
        if ((a > lv) !== (b > lv)) ed(a, b, P0, P1); if ((b > lv) !== (c > lv)) ed(b, c, P1, P2); if ((c > lv) !== (dd > lv)) ed(c, dd, P2, P3); if ((dd > lv) !== (a > lv)) ed(dd, a, P3, P0);
        for (let q = 0; q + 1 < E.length; q += 2) { g.moveTo(E[q][0], E[q][1]); g.lineTo(E[q + 1][0], E[q + 1][1]); }
      }
      g.strokeStyle = major ? 'rgba(214,226,245,.34)' : 'rgba(214,226,245,.08)'; g.lineWidth = (major ? 1.3 : 0.8) * u; g.stroke();
      // the height of the bold ones, small, where they cross the top band
      if (major) { const sx = s0 + ((lv / 100) % 7 + 1) * (s1 - s0) / 9; }
    }
    g.restore();
    // the forest, as specks
    if (d.trees) { g.save(); g.fillStyle = 'rgba(4,8,12,.55)'; for (const t of d.trees) { const x = X(t[1]), y = Y(t[0]); if (y < 0 || y > H) continue; g.globalAlpha = cl(t[2], 0, 1) * 0.9; g.fillRect(x - 0.9 * u, y - 0.9 * u, 1.8 * u, 1.8 * u); } g.restore(); }
    // the groomed run: a faint band
    if (d.cx) { g.save(); g.fillStyle = 'rgba(230,238,250,.05)'; g.beginPath(); const C = d.cx; for (const c of C) g.lineTo(X(c[0]), Y(c[1] - c[2])); for (let i = C.length - 1; i >= 0; i--) g.lineTo(X(C[i][0]), Y(C[i][1] + C[i][2])); g.fill(); g.restore(); }
    // stations along the way: a tick across the route, the name beside it, above and below in turn
    g.save(); g.textAlign = 'center';
    stations(d).forEach((q, i) => { if (q.s < T[0][1] + 5) q.s = T[0][1] + 5; const p = T[at(T, q.s)], x = X(p[1]), y = Y(p[0]), up = i % 2 ? 1 : -1;
      g.strokeStyle = 'rgba(244,247,251,.42)'; g.lineWidth = 1 * u; g.beginPath(); g.moveTo(x, y + up * 10 * u); g.lineTo(x, y + up * 44 * u); g.stroke();
      g.fillStyle = 'rgba(244,247,251,.78)'; g.font = '400 ' + 16 * u + 'px ' + SONG; g.fillText(q.name.replace(/^\d+ /, ''), x, y + up * (up < 0 ? 52 : 66) * u);
      g.fillStyle = 'rgba(244,247,251,.42)'; g.font = '500 ' + 11 * u + 'px ' + LAT; g.fillText(String(i + 1).padStart(2, '0'), x, y + up * (up < 0 ? 72 : 46) * u); });
    g.restore();
    // where the mountain known to the card ends, the map fades into the night (no hard edge)
    let yT = 0, yB = H; { const sm = (s0 + s1) / 2; for (let y = 0; y < H; y += 4) if (d.H(IY(y), sm) != null) { yT = y; break; } for (let y = H; y > 0; y -= 4) if (d.H(IY(y), sm) != null) { yB = y; break; } }
    g.save(); g.fillStyle = '#070b12'; g.fillRect(0, 0, W, yT); g.fillRect(0, yB, W, H - yB);
    const fa = g.createLinearGradient(0, yT, 0, yT + 110 * u); fa.addColorStop(0, '#070b12'); fa.addColorStop(1, 'rgba(7,11,18,0)'); g.fillStyle = fa; g.fillRect(0, yT, W, 110 * u);
    const fb = g.createLinearGradient(0, yB, 0, yB - 110 * u); fb.addColorStop(0, '#070b12'); fb.addColorStop(1, 'rgba(7,11,18,0)'); g.fillStyle = fb; g.fillRect(0, yB - 110 * u, W, 110 * u); g.restore();
    // a scale bar
    g.save(); const bw = 500 * k, bx = W - 72 * u - bw, by = H * 0.5 + 250 * u; g.strokeStyle = 'rgba(244,247,251,.5)'; g.lineWidth = 1 * u;
    g.beginPath(); g.moveTo(bx, by - 5 * u); g.lineTo(bx, by); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by - 5 * u); g.stroke();
    g.fillStyle = 'rgba(244,247,251,.5)'; g.font = '500 ' + 11 * u + 'px ' + LAT; g.textAlign = 'right'; g.fillText('500 M', bx + bw, by - 10 * u); g.restore();
    route(g, d, i => [X(T[i][1]), Y(T[i][0])], 2.4 * u, st);
    ringsOn(g, d, q => [X(q.s), Y(q.x)], 2.1 * u);
    ends(g, X(T[0][1]), Y(T[0][0]), X(T[T.length - 1][1]), Y(T[T.length - 1][0]), u);
    words(g, W, H, d, st, { shade: 'rgba(5,8,13,.78)' });
    frame(g, W, H, 'rgba(255,208,138,.35)');
  }
  // the start (a small open triangle) and the finish (a ring in a ring)
  function ends(g, x0, y0, x1, y1, u) {
    g.save(); g.strokeStyle = rgb(SNOW, 0.9); g.lineWidth = 1.4 * u;
    g.beginPath(); g.moveTo(x0 - 7 * u, y0 - 8 * u); g.lineTo(x0 + 8 * u, y0); g.lineTo(x0 - 7 * u, y0 + 8 * u); g.closePath(); g.stroke();
    g.strokeStyle = rgb(SUN); g.beginPath(); g.arc(x1, y1, 9 * u, 0, 6.2832); g.stroke(); g.beginPath(); g.arc(x1, y1, 4 * u, 0, 6.2832); g.fillStyle = rgb(SUN); g.fill();
    g.restore();
  }
  function mk(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ================================================================ b 剖面: the run from the side, a night poster
  function drawB(g, W, H, d, st) {
    const u = W / 1600, T = d.track, n = T.length, R = rnd((d.seed || 1) * 2654435761);
    // distance along the route (across the ground) for every track point
    const D = new Float32Array(n); for (let i = 1; i < n; i++) D[i] = D[i - 1] + Math.hypot(T[i][0] - T[i - 1][0], T[i][1] - T[i - 1][1]);
    const L = D[n - 1], yTop = T[0][2], yBot = T[n - 1][2];
    // the frame: the profile runs from 90 px to W - 90 px; top of the run at 30% of the height, the finish at 82%; behind, ridges up to 12%
    const xA = 90 * u, xB = W - 90 * u, X = dd => xA + (dd / L) * (xB - xA), vk = (H * 0.44) / Math.max(1, yTop - yBot), Y = y => H * 0.36 + (yTop - y) * vk;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#050a16'); sky.addColorStop(0.55, '#0d1830'); sky.addColorStop(1, '#1a2742');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { const x = R() * W, y = Math.pow(R(), 1.6) * H * 0.62, r = (R() < 0.08 ? 1.3 : 0.7) * u; g.fillStyle = 'rgba(235,240,255,' + (0.25 + R() * 0.55).toFixed(2) + ')'; g.fillRect(x, y, r, r); }
    // the moon of this card: its phase from the seed
    const mx = W * (0.62 + R() * 0.22), my = H * (0.12 + R() * 0.08), mr = 26 * u, ph = R();
    g.save(); g.shadowColor = 'rgba(255,236,200,.55)'; g.shadowBlur = 40 * u; g.fillStyle = '#f6ecd6'; g.beginPath(); g.arc(mx, my, mr, 0, 6.2832); g.fill(); g.restore();
    g.save(); g.fillStyle = '#081124'; g.beginPath(); g.arc(mx + (ph - 0.5) * 2.6 * mr, my - 0.1 * mr, mr * 0.98, 0, 6.2832); g.fill(); g.restore();
    // the ridges beside the run, far to near: the mountain's heights along lines out to one side and the other, hazier the farther
    const offs = [[1250, 0.20], [-900, 0.30], [640, 0.44], [-380, 0.60], [190, 0.78]];
    const far = [96, 122, 160], near = [16, 26, 44];
    for (const [off, nr] of offs) {
      const c = lerpC(far, near, nr); g.fillStyle = rgb(c); g.beginPath(); g.moveTo(0, H);
      for (let k = 0; k <= 160; k++) { const i = Math.min(n - 1, Math.round(k / 160 * (n - 1))), p = T[i], h = d.H(p[0] + off, p[1]); const y = Y(h == null ? p[2] : h) - (1 - nr) * 26 * u; g.lineTo(k === 0 ? 0 : k === 160 ? W : X(D[i]), y); }
      g.lineTo(W, H); g.closePath(); g.fill();
      // a little snow light on the ridge tops
      g.strokeStyle = rgb(lerpC(c, SNOW, 0.35), 0.5); g.lineWidth = 1 * u; g.stroke();
    }
    // the run's own profile, nearest, nearly black, and the snow line on its top
    g.fillStyle = '#070c16'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, Y(T[0][2]));
    const hs = i => { const h = d.H(T[i][0], T[i][1]); return h == null ? T[i][2] : h; };
    for (let i = 0; i < n; i += 2) g.lineTo(X(D[i]), Y(hs(i))); g.lineTo(W, Y(T[n - 1][2])); g.lineTo(W, H); g.closePath(); g.fill();
    // stations: a hairline down from the run, the number and name at the foot
    g.save(); g.textAlign = 'left';
    const stn = stations(d); stn.forEach((q, i) => { const j = at(T, Math.max(T[0][1] + 5, q.s)), x = X(D[j]), y = Y(hs(j));
      g.strokeStyle = 'rgba(244,247,251,.16)'; g.lineWidth = 1 * u; g.beginPath(); g.moveTo(x, y + 8 * u); g.lineTo(x, H - 150 * u); g.stroke();
      if (i % 2 === 0 || true) { g.fillStyle = 'rgba(244,247,251,.36)'; g.font = '500 ' + 10 * u + 'px ' + LAT; g.fillText(String(i + 1).padStart(2, '0'), x + 5 * u, H - 152 * u);
        g.save(); g.translate(x + 6 * u, y + 34 * u); g.fillStyle = 'rgba(244,247,251,.5)'; g.font = '400 ' + 13 * u + 'px ' + SONG; g.fillText(q.name.replace(/^\d+ /, ''), 0, 0); g.restore(); } });
    g.restore();
    // the route on it, the skier's own height (so a jump leaves the snow), and the rings over it
    route(g, d, i => [X(D[i]), Y(T[i][2])], 2.2 * u, st);
    ringsOn(g, d, q => { const j = at(T, q.s); return [X(D[j]), Y(q.y) - 6 * u]; }, 2 * u);
    ends(g, X(0), Y(T[0][2]), X(L), Y(T[n - 1][2]), u);
    // heights at the two ends
    g.save(); g.fillStyle = 'rgba(244,247,251,.55)'; g.font = '500 ' + 12 * u + 'px ' + LAT; g.font = '400 ' + 14 * u + 'px ' + SONG; g.fillText('出发', X(0) + 14 * u, Y(yTop) - 14 * u);
    g.textAlign = 'right'; g.fillText('终点  ↓ ' + Math.round(yTop - yBot).toLocaleString('en-US') + ' M', X(L) - 16 * u, Y(yBot) - 16 * u); g.restore();
    words(g, W, H, d, st, { shade: 'rgba(5,8,13,.6)' });
    frame(g, W, H, 'rgba(255,208,138,.35)');
  }

  // ================================================================ c 山脊线: stacked cross-sections in perspective
  function drawC(g, W, H, d, st) {
    const u = W / 1600, T = d.track, n = T.length, sA = T[0][1], sB = st.sMax;
    let xm = 0; for (const p of T) xm += p[0]; xm /= n;
    // the eye stands below and beyond the finish, above the snow, looking up the line
    const sEye = sB + 3000, hEye = T[n - 1][2] + 1700, F = W * 0.95;
    const pitch = Math.atan2((T[0][2] + T[n - 1][2]) / 2 - hEye, sEye - (sA + sB) / 2), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const proj = (x, s, h) => { const zf = sEye - s, dy = h - hEye, zc = zf * cp + dy * sp, yc = -zf * sp + dy * cp; if (zc < 50) return null; return [W * 0.58 + (x - xm) * F / zc, H * 0.40 - yc * F / zc]; };
    g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
    const dS = 50, half = 1000, dx = 12;
    const secs = []; for (let s = sA - 100; s <= sB + 60; s += dS) secs.push(s);
    // far (up the mountain) to near: each section hides what is behind it, then the route between it and the next nearer one
    let ti = 0;
    for (let q = 0; q < secs.length; q++) {
      const s = secs[q], pts = [];
      for (let x = xm - half; x <= xm + half; x += dx) { const h = d.H(x, s); if (h == null) continue; const p = proj(x, s, h); if (p) pts.push(p); }
      if (pts.length < 2) continue;
      // nearer sections a touch brighter; the run's own trench shows itself in the lines
      const near = cl((s - sA) / (sB - sA), 0, 1);
      g.fillStyle = '#05070b'; g.beginPath(); g.moveTo(pts[0][0], H + 10); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(pts[pts.length - 1][0], H + 10); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(232,238,248,' + (0.30 + 0.38 * near).toFixed(2) + ')'; g.lineWidth = (0.8 + 0.6 * near) * u; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
      // the route as far as the next section
      const sN = q + 1 < secs.length ? secs[q + 1] : 1e9; const t0 = ti; while (ti < n - 1 && T[ti][1] < sN) ti++;
      if (ti > t0) route(g, d, i => proj(T[i][0], T[i][1], T[i][2] + 1.5) || [0, 0], 2.0 * u, st, Math.max(0, t0 - 1), ti);
      for (const r of d.rings) if (r.s >= s && r.s < sN) { const p = proj(r.x, r.s, r.y + 1); if (p) { g.beginPath(); g.arc(p[0], p[1], (r.pass ? 2 : 2.5) * u, 0, 6.2832); if (r.pass) { g.fillStyle = rgb(SUN, 0.95); g.fill(); } else { g.strokeStyle = MISS; g.lineWidth = 1.1 * u; g.stroke(); } } }
    }
    const p0 = proj(T[0][0], T[0][1], T[0][2] + 1.5), p1 = proj(T[n - 1][0], T[n - 1][1], T[n - 1][2] + 1.5);
    if (p0 && p1) ends(g, p0[0], p0[1], p1[0], p1[1], u * 0.8);
    words(g, W, H, d, st, { shade: 'rgba(5,7,11,.95)' });
    frame(g, W, H, 'rgba(255,208,138,.3)');
  }


  // ================================================================ d 平面线稿: the run as a folded strip map, flat colour and line (owner 2026-11-18 23:3x UTC:
  // "我比较喜欢平面图的版本…扁平风格的线稿…有颜色…它本身就是一幅 artwork…雪道其实是很窄的…不需要框的那么宽…还有很多 information").
  // Borrowed, each from a real map: the strip map (Ogilby's Britannia, 1675: a narrow road cut into strips laid side by side, read top to
  // bottom, so the line fills the card and nothing is framed wider than the road); Minard (1869: the width of the band is the number, here
  // the speed; the band's breaks are the jumps); Imhof's Swiss maps (sunlit slopes warm, the shade a cool violet, the snow white) flattened
  // into a few tones; Tanaka's illuminated contours (lit on the sun side, dark on the shade side, so flat lines still read as relief);
  // Beck's Tube map (stations as numbered marks with the name beside, every stop the same mark). Paper, ink, and one strong red for the line.
  function drawD(g, W, H, d, st, TH) {
    TH = TH || THEMES.paper;
    // (owner 23:59 UTC: 卡片一般都是竖的…适合竖屏) on a tall canvas (3:4, the shape of a 小红书 post) the words go above in one glass panel, the
    // strips stand under it, the speed and the key at the foot; on a wide one the words sit in a column on the left as before
    const PT = H > W, u = PT ? W / 1200 : W / 1600, T = d.track, n = T.length, sA = T[0][1], sB = st.sMax;
    const Lo = PT ? { strips: [48, W / u - 48, 500, H / u - 300], panel: [36, 36, W / u - 72, 430], title: [72, 128, 56], diff: [74, 166], rule: [72, 188], time: [66, 300, 100], pen: [72, 336], who: [72, 376, 20],
        stats: [700, 140, 210, 96, 2, 36], legend: [700, H / u - 254], speed: [72, H / u - 250, 560, 104], brand: [72, H / u - 62], code: [W / u - 72, H / u - 62, 'right'] }
      : { strips: [452, W / u - 56, 92, H / u - 62], panel: [36, 40, 392, H / u - 80], title: [64, 124, 50], diff: [66, 156], rule: [64, 176], time: [61, 262, 76], pen: [64, 290], who: [64, 318, 16],
        stats: [64, 372, 112, 58, 3, 24], legend: [64, 512], speed: [64, 0, 336, 70], brand: [64, H / u - 92], code: [64, H / u - 66, 'left'] };
    const INK = TH.ink, GREY = TH.grey, RED = TH.line, FOREST = TH.forest, FORESTD = TH.forestD, SNOWW = TH.snow, LOW = TH.low, SHADE = TH.shade, SHADE2 = TH.shade2, SUNW = TH.sun;
    TH.ground(g, W, H, u);
    // the strips: as many as keep each about 1.5 km, laid right of the panel
    const N = cl(Math.round((sB - sA) / 1450), 2, 6), cX0 = Lo.strips[0] * u, cX1 = Lo.strips[1] * u, gap = (PT ? 24 : 30) * u, cY0 = Lo.strips[2] * u, cY1 = Lo.strips[3] * u;
    const cw = (cX1 - cX0 - gap * (N - 1)) / N, ch = cY1 - cY0, seg = (sB - sA + 40) / N, k = ch / seg;
    const cols = [];
    for (let c = 0; c < N; c++) {
      const s0 = sA - 20 + c * seg, s1 = s0 + seg, i0 = at(T, s0), i1 = at(T, s1);
      // the strip follows the line's drift (a straight fit of x on s over the strip), so the road stays in the middle
      let ms = 0, mx = 0, m = 0; for (let i = i0; i <= i1; i++) { ms += T[i][1]; mx += T[i][0]; m++; } ms /= m; mx /= m;
      let a = 0, b = 0; for (let i = i0; i <= i1; i++) { a += (T[i][1] - ms) * (T[i][0] - mx); b += (T[i][1] - ms) * (T[i][1] - ms); } const sl = b > 1 ? a / b : 0;
      const left = cX0 + c * (cw + gap), mid = left + cw / 2, xc = s => mx + sl * (s - ms);
      cols.push({ c, s0, s1, left, mid, xc, X: (x, s) => mid + (x - xc(s)) * k, Y: s => cY0 + (s - s0) * k });
    }
    const colOf = s => cols[cl(Math.floor((s - (sA - 20)) / seg), 0, N - 1)];
    // the ground of each strip: flat tones from height (higher whiter), sun and shade in three steps, the forest as flat shapes
    const hmax = T[0][2] + 60, hmin = T[n - 1][2] - 60, BAND = 100;
    for (const C of cols) {
      const R = 2, sw = Math.ceil(cw / R), sh = Math.ceil(ch / R), img = g.createImageData(sw, sh), D = img.data, Hh = new Float32Array(sw * sh);
      const XY = (i, j) => { const s = C.s0 + (j * R) / k; return [C.xc(s) + (i * R - cw / 2) / k, s]; };
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const [x, s] = XY(i, j); let h = 0, q = 0; for (const [ox, os] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) { const v = d.H(x + ox, s + os); if (v != null) { h += v; q++; } } Hh[j * sw + i] = q ? h / q : NaN; }
      const e = R / k; let mhs = 0, mq = 0; for (let j = 1; j < sh - 1; j += 3) for (let i = 0; i < sw; i += 3) { const a = Hh[(j + 1) * sw + i], b = Hh[(j - 1) * sw + i]; if (a === a && b === b) { mhs += (a - b) / (2 * e); mq++; } } mhs /= Math.max(1, mq);
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        const o = (j * sw + i) * 4, h = Hh[j * sw + i]; if (h !== h) { D[o] = TH.off[0]; D[o + 1] = TH.off[1]; D[o + 2] = TH.off[2]; D[o + 3] = 255; continue; }
        const hx = (Hh[j * sw + Math.min(sw - 1, i + 1)] - Hh[j * sw + Math.max(0, i - 1)]) / (2 * e), hs = (Hh[Math.min(sh - 1, j + 1) * sw + i] - Hh[Math.max(0, j - 1) * sw + i]) / (2 * e);
        const hd = hs - mhs, nl = Math.hypot(hx, hd, 1), lit = (-hx * 0.66 + hd * 0.3 + 0.72) / nl;          // (the fall of the whole run taken out: the slopes across it, lit or in shade)
        const band = Math.floor((h - hmin) / BAND), top = cl(band * BAND / (hmax - hmin), 0, 1);
        let c = lerpC(LOW, SNOWW, Math.pow(top, 0.7));
        // (owner 23:55 UTC: 不要阴影…平面设计的感觉) no light and shade: one flat tone per 100 m band of height, nothing else
        const [x, s] = XY(i, j), tr = d.T ? d.T(x, s) : 0;
        D[o] = cl(c[0], 0, 255); D[o + 1] = cl(c[1], 0, 255); D[o + 2] = cl(c[2], 0, 255); D[o + 3] = 255;
      }
      const cv = mk(sw, sh); cv.getContext('2d').putImageData(img, 0, 0);
      g.save(); g.beginPath(); g.rect(C.left, cY0, cw, ch); g.clip(); g.imageSmoothingEnabled = true; g.drawImage(cv, C.left, cY0, sw * R, sh * R);
      // the forest as tree marks, the way a hand-drawn map does it: a round crown every ~11 m where the wood is, a little jitter, the shade side darker
      if (d.T) { const TS = 11, rr = rnd(C.c * 7919 + 17);
        for (let s = C.s0 - TS; s < C.s1 + TS; s += TS) for (let x = C.xc(s) - cw / 2 / k - TS; x < C.xc(s) + cw / 2 / k + TS; x += TS) {
          const jx = x + (rr() - 0.5) * TS * 0.8, js = s + (rr() - 0.5) * TS * 0.8, tr = d.T(jx, js), q = rr(); if (tr < 0.42 || q > (tr - 0.3) * 1.6) continue;
          const px = C.X(jx, js), py = C.Y(js), r = (2.2 + 0.8 * rr()) * u;
          g.fillStyle = rgb(FOREST, 1); g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fill(); } }
      // contours every 20 m, Tanaka-lit: the sun side of each line light, the shade side dark; every 100 m a little heavier
      const step = 2, gx = Math.ceil(sw / step), gy = Math.ceil(sh / step), Gv = (i, j) => Hh[Math.min(sh - 1, j * step) * sw + Math.min(sw - 1, i * step)];
      for (let lv = Math.ceil(hmin / 20) * 20; lv < hmax; lv += 20) {
        const major = lv % 100 === 0, lit = [], dark = [];
        for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
          const a = Gv(i, j), b = Gv(i + 1, j), c = Gv(i + 1, j + 1), dd = Gv(i, j + 1); if (a !== a || b !== b || c !== c || dd !== dd) continue;
          if ((a > lv) === (b > lv) && (b > lv) === (c > lv) && (c > lv) === (dd > lv)) continue;
          const P = (fi, fj) => [C.left + fi * step * R, cY0 + fj * step * R], E = [];
          const ed = (va, vb, pa, pb) => { const t = (lv - va) / (vb - va); E.push([mix(pa[0], pb[0], t), mix(pa[1], pb[1], t)]); };
          const P0 = P(i, j), P1 = P(i + 1, j), P2 = P(i + 1, j + 1), P3 = P(i, j + 1);
          if ((a > lv) !== (b > lv)) ed(a, b, P0, P1); if ((b > lv) !== (c > lv)) ed(b, c, P1, P2); if ((c > lv) !== (dd > lv)) ed(c, dd, P2, P3); if ((dd > lv) !== (a > lv)) ed(dd, a, P3, P0);
          const gxv = (b + c - a - dd) / 2, gyv = (dd + c - a - b) / 2 - mhs * step * e, gl = Math.hypot(gxv, gyv) || 1, li = (-gxv * 0.62 + gyv * 0.35) / gl;
          for (let q = 0; q + 1 < E.length; q += 2) dark.push(E[q], E[q + 1]);          // (flat: every contour the same ink, no lit side)
        }
        for (const [L2, col] of [[dark, major ? TH.cMajor : TH.cLine]]) {
          if (!L2.length) continue; g.beginPath(); for (let q = 0; q < L2.length; q += 2) { g.moveTo(L2[q][0], L2[q][1]); g.lineTo(L2[q + 1][0], L2[q + 1][1]); }
          // (owner 23:58 UTC: 高一点粗一点、重一点，低一点轻一点) the line's weight follows its height over the whole run
          const hz = cl((lv - hmin) / (hmax - hmin), 0, 1);
          g.globalAlpha = 0.35 + 0.65 * hz; g.strokeStyle = col; g.lineWidth = (major ? 1.0 + 1.3 * hz : 0.45 + 0.8 * hz) * u; g.stroke(); g.globalAlpha = 1; }
      }
      // the groomed run: a white band with fine dashed edges
      if (d.cx) { const pts = d.cx.filter(q => q[0] >= C.s0 - 10 && q[0] <= C.s1 + 10);
        if (pts.length > 1) { g.fillStyle = TH.piste; g.beginPath(); for (const q of pts) g.lineTo(C.X(q[1] - q[2], q[0]), C.Y(q[0])); for (let i = pts.length - 1; i >= 0; i--) g.lineTo(C.X(pts[i][1] + pts[i][2], pts[i][0]), C.Y(pts[i][0])); g.fill();
          g.setLineDash([3 * u, 3 * u]); g.strokeStyle = TH.pisteEdge; g.lineWidth = 0.8 * u; for (const sg of [-1, 1]) { g.beginPath(); for (const q of pts) g.lineTo(C.X(q[1] + sg * q[2], q[0]), C.Y(q[0])); g.stroke(); } g.setLineDash([]); } }
      g.restore();
      // the strip's frame: a hairline, and how far down the mountain it starts
      g.strokeStyle = TH.frame; g.lineWidth = 1 * u; g.strokeRect(C.left, cY0, cw, ch);
      g.fillStyle = GREY; g.font = '500 ' + 11 * u + 'px ' + LAT; g.textAlign = 'left';
      spaced(g, (Math.max(0, C.s0 - sA) / 1000).toFixed(1) + ' – ' + (Math.min(sB, C.s1) - sA > 0 ? ((Math.min(sB, C.s1) - sA) / 1000).toFixed(1) : '0') + ' KM', C.left, cY0 - 10 * u, 0.2 * 11 * u);
    }
    // the line itself, strip by strip: a white halo, then the red band as wide as the speed; in the air a fine dark dashed line
    const wv = v => (1.6 + 8.4 * Math.pow(cl(v / Math.max(20, st.vmax), 0, 1), 1.3)) * u;
    const P = i => { const C = colOf(T[i][1]); return [C.X(T[i][0], T[i][1]), C.Y(T[i][1]), C.c]; };
    // (owner 23:58 UTC: 轨迹描边感觉不太好) no outline and no beads on it: the line is one clean flat band, Minard's way, its two edges
    // drawn as one shape (offset either side of the path by half the speed's width, both smoothed), so it swells and thins without lumps.
    // In the air a fine dashed line. Rings missed: a small hollow coral ring where the ring stood, off to the side of the band
    const PS = []; for (let i = 0; i < n; i++) PS.push(P(i));
    const sm = (f, i, r) => { let a = 0, q = 0; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) { if (PS[k][2] !== PS[i][2]) continue; a += f(k); q++; } return a / q; };
    const runs = []; { let cur = null; for (let i = 0; i < n; i++) { const air = !!T[i][4], key = PS[i][2] + (air ? 'a' : 'g'); if (!cur || cur.key !== key) { cur = { key, air, c: PS[i][2], idx: [] }; runs.push(cur); } cur.idx.push(i); } }
    g.save();
    for (const rn of runs) {
      const I = rn.idx; if (I.length < 2) continue;
      if (rn.air) { g.strokeStyle = TH.air; g.lineWidth = 1.2 * u; g.setLineDash([2 * u, 2.6 * u]); g.beginPath(); I.forEach((i, k) => k ? g.lineTo(PS[i][0], PS[i][1]) : g.moveTo(PS[i][0], PS[i][1])); g.stroke(); g.setLineDash([]); continue; }
      const L2 = [], R2 = [];
      for (const i of I) {
        const x = sm(k => PS[k][0], i, 2), y = sm(k => PS[k][1], i, 2), j0 = Math.max(I[0], i - 2), j1 = Math.min(I[I.length - 1], i + 2);
        let tx = PS[j1][0] - PS[j0][0], ty = PS[j1][1] - PS[j0][1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const hw = sm(k => wv(T[k][3]), i, 6) / 2; L2.push([x - ty * hw, y + tx * hw]); R2.push([x + ty * hw, y - tx * hw]);
      }
      g.fillStyle = RED; g.beginPath(); L2.forEach((p2, k) => k ? g.lineTo(p2[0], p2[1]) : g.moveTo(p2[0], p2[1])); for (let k = R2.length - 1; k >= 0; k--) g.lineTo(R2[k][0], R2[k][1]); g.closePath(); g.fill();
      // round ends where a run starts and stops (after a jump, at the strip's edge)
      for (const i of [I[0], I[I.length - 1]]) { g.beginPath(); g.arc(PS[i][0], PS[i][1], wv(T[i][3]) / 2, 0, 6.2832); g.fill(); }
    }
    g.restore();
    for (const r of d.rings) { if (r.pass) continue; const C = colOf(r.s), x = C.X(r.x, r.s), y = C.Y(r.s); g.beginPath(); g.arc(x, y, 2.4 * u, 0, 6.2832); g.strokeStyle = TH.miss; g.lineWidth = 1 * u; g.stroke(); }
    // every kilometre: a fine tick across the line and the number
    g.save(); g.font = '500 ' + 10 * u + 'px ' + LAT; g.fillStyle = TH.kmText; g.strokeStyle = TH.label; g.lineWidth = 1 * u;
    { let acc = 0, km = 1; for (let i = 1; i < n; i++) { acc += Math.hypot(T[i][0] - T[i - 1][0], T[i][1] - T[i - 1][1]); if (acc >= km * 1000) { const p = P(i); g.beginPath(); g.moveTo(p[0] - 9 * u, p[1]); g.lineTo(p[0] - 4 * u, p[1]); g.stroke(); g.textAlign = 'right'; g.fillText(km + 'K', p[0] - 11 * u, p[1] + 3.5 * u); km++; } } }
    g.restore();
    // stations, Beck's way: a numbered disc on the line, the name and this run's time for it beside, on a paper halo
    const sp = d.split || [], segT = sp.map((t, i) => t - (i ? sp[i - 1] : 0)); let best = -1, bv = 0;
    segT.forEach((t, i) => { const sg = d.segs[i]; if (!sg || t <= 0) return; const v = sg.len / t; if (v > bv) { bv = v; best = i; } });
    stations(d).forEach((q, i) => {
      const s = Math.max(sA + 3, q.s), j = at(T, s), p = P(j), C = cols[p[2]], right = p[0] < C.mid;
      const r = 8 * u; g.beginPath(); g.arc(p[0], p[1], r, 0, 6.2832); g.fillStyle = i === best ? TH.bestDisc : TH.disc; g.fill(); g.strokeStyle = TH.discRing; g.lineWidth = 1.5 * u; g.stroke();
      g.fillStyle = i === best ? TH.bestText : TH.discText; g.font = '600 ' + 9.5 * u + 'px ' + LAT; g.textAlign = 'center'; g.fillText(String(i + 1), p[0], p[1] + 3.4 * u);
      const tx = right ? p[0] + 14 * u : p[0] - 14 * u; g.textAlign = right ? 'left' : 'right';
      g.lineJoin = 'round'; g.strokeStyle = TH.halo; g.lineWidth = 4 * u;
      g.font = '500 ' + 14 * u + 'px ' + SONG; const nm = q.name.replace(/^\d+ /, ''); g.strokeText(nm, tx, p[1] + 1 * u); g.fillStyle = TH.label; g.fillText(nm, tx, p[1] + 1 * u);
      if (segT[i] > 0) { g.font = '500 ' + 11 * u + 'px ' + LAT; const ts = fmt(segT[i]); g.strokeText(ts, tx, p[1] + 15 * u); g.fillStyle = i === best ? RED : GREY; g.fillText(ts, tx, p[1] + 15 * u); }
    });
    // the fastest moment and the longest flight, each with a leader line
    { let im = 0; for (let i = 0; i < n; i++) if (T[i][3] > T[im][3]) im = i;
      let la = 0, lb = 0, a0 = -1; for (let i = 0; i < n; i++) { if (T[i][4]) { if (a0 < 0) a0 = i; if (i - a0 > lb - la) { la = a0; lb = i; } } else a0 = -1; }
      const note = (i, txt) => { const p = P(i), C = cols[p[2]], right = p[0] < C.mid, x2 = right ? C.left + cw - 6 * u : C.left + 6 * u, y2 = p[1] > cY1 - 60 * u ? p[1] - 46 * u : p[1] + 26 * u;
        g.strokeStyle = TH.label; g.lineWidth = 0.8 * u; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(x2, y2); g.stroke();
        g.font = '500 ' + 11 * u + 'px ' + LAT; g.textAlign = right ? 'right' : 'left'; g.lineWidth = 4 * u; g.strokeStyle = TH.halo; g.strokeText(txt, x2, y2 + 13 * u); g.fillStyle = TH.label; g.fillText(txt, x2, y2 + 13 * u); };
      note(im, (RC_W('最快') + ' ' + (T[im][3] * 3.6).toFixed(0) + ' KM/H').toUpperCase()); if (lb - la >= 5) note(Math.round((la + lb) / 2), (RC_W('腾空') + ' ' + ((lb - la) * 0.1).toFixed(1) + ' S').toUpperCase()); }
    // start and finish
    { const p0 = P(0), p1 = P(n - 1); g.fillStyle = TH.label; g.beginPath(); g.moveTo(p0[0] - 7 * u, p0[1] - 9 * u); g.lineTo(p0[0] + 7 * u, p0[1] - 9 * u); g.lineTo(p0[0], p0[1] + 2 * u); g.closePath(); g.fill();
      g.beginPath(); g.arc(p1[0], p1[1], 7 * u, 0, 6.2832); g.strokeStyle = TH.label; g.lineWidth = 2 * u; g.stroke(); g.beginPath(); g.arc(p1[0], p1[1], 3 * u, 0, 6.2832); g.fillStyle = RED; g.fill(); }
    // between the strips: where the line goes on (an arrow from the foot of one strip to the head of the next)
    g.strokeStyle = TH.frame; g.lineWidth = 1 * u; g.fillStyle = GREY;
    for (let c = 0; c < N - 1; c++) { const a = cols[c], b = cols[c + 1], ya = cY1 + 16 * u, yb = cY0 - 30 * u; g.font = '500 ' + 10 * u + 'px ' + LAT; g.textAlign = 'center'; g.fillText('↓', a.mid, cY1 + 18 * u); g.fillText('↓', b.mid + cw * 0.36, cY0 - 26 * u); }
    // the panel: name, time, who and the place, the numbers, the key, a strip of speed over the run, the code
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; if (TH.panel) TH.panel(g, Lo.panel.map(v => v * u), u);
    const at2 = (k, i) => Lo[k][i] * u;
    g.fillStyle = INK; g.font = '500 ' + at2('title', 2) + 'px ' + SONG; g.fillText(d.line, at2('title', 0), at2('title', 1));
    g.fillStyle = GREY; g.font = '400 ' + 17 * u * (PT ? 1.2 : 1) + 'px ' + SONG; spaced(g, d.diff + ' · ' + d.mountain, at2('diff', 0), at2('diff', 1), 0.3 * 17 * u);
    g.fillStyle = RED; g.fillRect(at2('rule', 0), at2('rule', 1), 34 * u, 3 * u);
    g.fillStyle = INK; g.font = '300 ' + at2('time', 2) + 'px ' + LAT; g.fillText(fmt(d.score), at2('time', 0), at2('time', 1));
    const bon = d.t - d.score; if (bon > 0.01) { g.fillStyle = GREY; g.font = '400 ' + 13 * u * (PT ? 1.25 : 1) + 'px ' + SONG; spaced(g, RC_W('用时') + ' ' + fmt(d.t) + '  ' + RC_W('光圈奖励') + ' −' + (+bon.toFixed(1)) + (RC_EN() ? ' s' : ' 秒'), at2('pen', 0), at2('pen', 1), 0.1 * 13 * u); }   // (rings 2026-11-19: score = time − ring bonus, no more penalty)
    // who skied it and where it stands (小红书: the player's nickname from the boards, later the login; the place on this line's board)
    { const who = d.player || RC_W('雪友'), rk = d.rank != null ? (typeof d.rank === 'number' ? (RC_EN() ? '#' + d.rank : '第 ' + d.rank + ' 名') : String(d.rank)) : '', fs = at2('who', 2);
      g.fillStyle = INK; g.font = '400 ' + fs + 'px ' + SONG; const ex = spaced(g, who, at2('who', 0), at2('who', 1), 0.12 * fs);
      if (rk) { g.fillStyle = RED; spaced(g, rk, ex + 14 * u, at2('who', 1), 0.12 * fs); } }
    const items = [[st.passed + '/' + st.tot, RC_W('光圈')], [(st.vmax * 3.6).toFixed(0), RC_W('最快 km/h')], [(st.dist / 1000).toFixed(2), RC_W('滑行 km')], [Math.round(st.drop).toLocaleString('en-US'), RC_W('落差 m')], [st.air.toFixed(1), RC_W('腾空 s')]];
    { const [sx, sy, dx, dy, nc, vs] = Lo.stats;
      items.forEach(([v, k2], i) => { const x = (sx + (i % nc) * dx) * u, y = (sy + Math.floor(i / nc) * dy) * u; g.fillStyle = INK; g.font = '300 ' + vs * u + 'px ' + LAT; g.fillText(v, x, y); g.fillStyle = GREY; g.font = '400 ' + (PT ? 14 : 12) * u + 'px ' + SONG; spaced(g, k2, x, y + (PT ? 26 : 20) * u, 0.12 * 12 * u); }); }
    // the key
    const L = at2('legend', 0); let ky = at2('legend', 1); g.fillStyle = GREY; g.font = '500 ' + 10.5 * u + 'px ' + LAT; spaced(g, 'LEGEND', L, ky, 0.4 * 10.5 * u); ky += 24 * u;
    g.lineCap = 'round'; [30, 70, 110].forEach((kmh, i) => { const x = L + i * 70 * u; g.strokeStyle = RED; g.lineWidth = wv(kmh / 3.6); g.beginPath(); g.moveTo(x, ky); g.lineTo(x + 34 * u, ky); g.stroke(); g.fillStyle = GREY; g.font = '400 ' + 10.5 * u + 'px ' + LAT; g.fillText(kmh, x + 38 * u, ky + 4 * u); });
    g.fillStyle = INK; g.font = '400 ' + 12 * u + 'px ' + SONG; g.fillText(RC_W('线宽 = 速度 km/h'), L + 214 * u, ky + 4 * u); ky += 28 * u;
    g.strokeStyle = TH.air; g.lineWidth = 1.2 * u; g.setLineDash([2 * u, 2.6 * u]); g.beginPath(); g.moveTo(L, ky); g.lineTo(L + 34 * u, ky); g.stroke(); g.setLineDash([]); g.fillText(RC_W('腾空'), L + 42 * u, ky + 4 * u);
    g.beginPath(); g.arc(L + 102 * u, ky, 2.6 * u, 0, 6.2832); g.strokeStyle = TH.miss; g.lineWidth = 1 * u; g.stroke(); g.fillText(RC_W('漏掉的圈'), L + 110 * u, ky + 4 * u);
    g.beginPath(); g.arc(L + 190 * u, ky, 8 * u, 0, 6.2832); g.fillStyle = TH.bestDisc; g.fill(); g.fillStyle = INK; g.fillText(RC_W('最快的一站'), L + 203 * u, ky + 4 * u); ky += 26 * u;
    // speed over the run, Minard's lower strip: the filled area is the speed, the station marks under it
    const sxA = at2('speed', 0), sy0 = PT ? at2('speed', 1) + 20 * u : ky + 26 * u, sh2 = at2('speed', 3) * (PT ? 0.8 : 1), sx1 = sxA + at2('speed', 2), sxL = sx1 - sxA;
    { let acc = 0; const Dd = [0]; for (let i = 1; i < n; i++) { acc += Math.hypot(T[i][0] - T[i - 1][0], T[i][1] - T[i - 1][1]); Dd.push(acc); }
      g.fillStyle = TH.speedFill; g.beginPath(); g.moveTo(sxA, sy0 + sh2); for (let i = 0; i < n; i += 3) g.lineTo(sxA + Dd[i] / acc * sxL, sy0 + sh2 - T[i][3] / st.vmax * sh2); g.lineTo(sx1, sy0 + sh2); g.closePath(); g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.8 * u; g.beginPath(); g.moveTo(sxA, sy0 + sh2); g.lineTo(sx1, sy0 + sh2); g.stroke();
      stations(d).forEach((q, i) => { const j = at(T, Math.max(sA + 3, q.s)), x = sxA + Dd[j] / acc * sxL; g.beginPath(); g.moveTo(x, sy0 + sh2); g.lineTo(x, sy0 + sh2 + 5 * u); g.stroke(); g.fillStyle = GREY; g.font = '500 ' + 8.5 * u + 'px ' + LAT; g.textAlign = 'center'; g.fillText(String(i + 1), x + 0, sy0 + sh2 + 15 * u); });
      g.textAlign = 'left'; g.fillStyle = GREY; g.font = '400 ' + 11 * u + 'px ' + SONG; g.fillText(RC_W('一路的速度'), sxA, sy0 - 8 * u); }
    // the foot: the game, the card's code and the date
    const dt = new Date(d.date || Date.now()), ds = dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0') + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    g.fillStyle = INK; g.font = '500 ' + 22 * u + 'px ' + SONG; spaced(g, '雪迹', at2('brand', 0), at2('brand', 1), 0.3 * 22 * u); g.fillStyle = GREY; g.font = '500 ' + 10 * u + 'px ' + LAT; spaced(g, 'COLD SMOKE', at2('brand', 0) + 74 * u, at2('brand', 1) - 1 * u, 0.4 * 10 * u);
    g.font = '500 ' + 11 * u + 'px ' + LAT; (Lo.code[2] === 'right' ? spacedR : spaced)(g, '#' + st.code + '   ' + ds, at2('code', 0), at2('code', 1), 0.2 * 11 * u);
  }

  // ---- the two looks of the plan card: paper (ink and one red, a printed map) and the game's own (雪迹's menus and result card: the dusk
  // glass, snow-white words, the sun's gold for what matters, coral for what was lost; Song serif names, light Jost figures)
  const THEMES = {
    paper: { ink: '#1d2a34', grey: '#7c8791', line: '#df4a2f', label: '#1d2a34', kmText: '#7c8791', forest: [104, 138, 124], forestD: [78, 110, 100], snow: [252, 252, 250], low: [221, 230, 236],
      shade: [0.90, 0.91, 0.975], shade2: [0.80, 0.82, 0.93], sun: [1.0, 0.988, 0.955], off: [241, 237, 228], cLine: 'rgba(60,80,108,.45)', cMajor: 'rgba(52,70,98,.7)',
      piste: 'rgba(253,253,251,.62)', pisteEdge: 'rgba(70,90,112,.45)', frame: 'rgba(29,42,52,.55)', lineHalo: 'rgba(255,255,255,.85)', air: '#1d2a34', bead: '#fff', miss: 'rgba(29,42,52,.55)',
      disc: '#1d2a34', discRing: '#fff', discText: '#fff', bestDisc: '#df4a2f', bestText: '#fff', halo: 'rgba(241,237,228,.92)', speedFill: 'rgba(223,74,47,.85)',
      ground: (g, W, H) => { g.fillStyle = '#f1ede4'; g.fillRect(0, 0, W, H); } },
    game: { ink: '#f4f7fb', grey: 'rgba(244,247,251,.62)', line: '#ffd08a', label: '#f4f7fb', kmText: 'rgba(244,247,251,.75)', forest: [30, 42, 58], forestD: [30, 42, 58], snow: [150, 166, 192], low: [96, 112, 142],
      shade: [0.86, 0.88, 0.97], shade2: [0.72, 0.76, 0.92], sun: [1.03, 1.0, 0.96], off: [24, 32, 46], cLine: 'rgba(232,240,250,.42)', cMajor: 'rgba(232,240,250,.7)',
      piste: 'rgba(206,218,234,.32)', pisteEdge: 'rgba(16,24,40,.38)', frame: 'rgba(244,247,251,.22)', lineHalo: 'rgba(8,12,20,.42)', air: '#f4f7fb', bead: '#fff8ea', miss: '#ff9d8c',
      disc: 'rgba(5,8,13,.85)', discRing: 'rgba(244,247,251,.75)', discText: '#f4f7fb', bestDisc: '#ffd08a', bestText: '#1b1408', halo: 'rgba(5,8,13,.42)', speedFill: 'rgba(255,208,138,.78)',
      // the dusk the menus sit on: a deep blue, warmer low on the left where the sun has gone down, a faint snow grain
      ground: (g, W, H, u) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#141c2b'); gr.addColorStop(0.6, '#1f2a3d'); gr.addColorStop(1, '#2c3850'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        const sun = g.createRadialGradient(W * 0.12, H * 0.08, 0, W * 0.12, H * 0.08, W * 0.5); sun.addColorStop(0, 'rgba(255,214,160,.16)'); sun.addColorStop(1, 'rgba(255,214,160,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, H);
        const R = rnd(91); for (let i = 0; i < 420; i++) { g.fillStyle = 'rgba(244,247,251,' + (0.03 + R() * 0.07).toFixed(3) + ')'; g.fillRect(R() * W, R() * H, 1.2 * u, 1.2 * u); } },
      // the result card's glass behind the words: rgba(5,8,13,.52), 12 px corners, a hairline inside
      panel: (g, R4, u) => { const [x, y, w, h] = R4, r = 12 * u; g.save(); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
        g.fillStyle = 'rgba(5,8,13,.52)'; g.fill(); g.strokeStyle = 'rgba(244,247,251,.22)'; g.lineWidth = 1 * u; g.stroke(); g.restore(); } },
  };

  RC.styles = { a: '等高线', b: '剖面', c: '山脊线', d: '平面线稿', e: '平面线稿·游戏配色' };
  RC.stats = stats;
  RC.draw = function (cv, d, style) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, st = stats(d);
    g.save(); g.clearRect(0, 0, W, H);
    (style === 'b' ? drawB : style === 'c' ? drawC : style === 'd' ? drawD : style === 'e' ? (g2, W2, H2, d2, st2) => drawD(g2, W2, H2, d2, st2, THEMES.game) : drawA)(g, W, H, d, st);
    g.restore(); return st;
  };
  return RC;
})();

// ---------------------------------------------------------------- 路线卡 in the game: recorded on every challenge run, opened from the result card
// (owner 2026-11-19 00:04 UTC: ok to the tall card in the game's colours.) While a challenge runs, every 0.1 s of the run's clock keeps where
// the skier was, how fast, in the air or not; every ring met is kept by reference (what became of it is read at the finish). At the finish
// the mountain round the line is sampled once into small grids (height every 10 m, forest every 8 m, ~0.1 M samples, done in slices so no
// frame stalls), and the result card gets a 路线卡 button (key C): the tall 3:4 card over the dimmed game, with 保存图片 and 关闭 (Esc).
// The player's name is the 小红书 nickname from the line's board (Rank.me), later the login; outside the container it is 雪友 and no place.
(() => {
  if (typeof window === 'undefined' || typeof Game === 'undefined') return;
  const RG = window.__rings; if (!RG || !RG.hooks) return;
  const G = Game, S = G.s;
  const RCg = { rec: null, data: null, el: null, busy: false, hist: [], view: 0 };          // hist: this player's cards, newest first
  self.RouteCardGame = RCg;          // (for test scripts)

  function begin(info) { RCg.rec = { info, track: [], rings: new Map(), nextT: 0, date: Date.now() }; RCg.data = null; }
  function sample() {
    const r = RCg.rec; if (!r || r.done || G.mode !== 'run') return;
    if (G.runT + 1e-6 >= r.nextT) { r.nextT = G.runT + 0.1; r.track.push([S.p[0], -S.p[2], S.p[1], S.speed || 0, S.air ? 1 : 0]); }
    if (RG.rings) for (const q of RG.rings) if (!q.skip && !r.rings.has(q.id)) r.rings.set(q.id, q);
  }
  const U0 = G.update;
  G.update = function (dt) { U0.call(this, dt); try { sample(); } catch (e) { } };

  // at the finish: the run's numbers, then the mountain round it, a slice per frame
  function finish(o) {
    const r = RCg.rec; if (!r || r.track.length < 20) { RCg.rec = null; return; }
    r.done = true; sample();
    const T = r.track, C = Course;
    const rings = [...r.rings.values()].map(q => ({ s: q.s, x: q.x, y: q.y, pass: !!q.hit, fin: !!q.fin })).filter(q => !q.fin).sort((a, b) => a.s - b.s);
    const segs = C.segs.filter(g => g.s0 <= T[T.length - 1][1] + 10).map(g => ({ s0: g.s0, len: g.len, type: g.type }));
    let xa = 1e9, xb = -1e9; for (const p of T) { xa = Math.min(xa, p[0]); xb = Math.max(xb, p[0]); }
    const sA = T[0][1] - 60, sB = T[T.length - 1][1] + 60;
    const HG = { x0: Math.floor((xa - 420) / 10) * 10, s0: Math.floor(sA / 10) * 10, step: 10, rows: [] }, NX = Math.ceil((xb + 420 - HG.x0) / 10) + 1;
    const TG = { x0: Math.floor((xa - 360) / 8) * 8, s0: Math.floor(sA / 8) * 8, step: 8, rows: [] }, TX = Math.ceil((xb + 360 - TG.x0) / 8) + 1;
    const cx = []; for (let s = Math.max(0, sA); s <= sB; s += 10) { const c = C.at(s); cx.push([s, c.cx, c.hw]); }
    const mt = C.mountainBySeed && C.mountainBySeed(), d = { track: T, rings, segs, names: (o.names || []).map(s => { const m = /^(\d+ )(.+)$/.exec(s); return m ? m[1] + RC_W(m[2]) : RC_W(s); }), cx, line: RC_W(o.name || ''), diff: RC_W(({ a: '轻松', b: '标准', c: '难' })[o.diff] || ''), mountain: mt ? (RC_EN() ? mt.en || mt.zh : mt.zh) : typeof App !== 'undefined' && App.isDaily && App.isDaily() ? RC_W('今日之山') : '',
      score: o.score, t: o.t, split: o.splits || [], date: r.date, seed: (Math.random() * 1e9) | 0, player: RC_W('雪友'), rank: null, ready: false };
    RCg.data = d; RCg.rec = null;
    const ent = { id: r.date + '_' + d.seed, line: d.line, diff: d.diff, score: d.score, date: r.date, data: d };
    RCg.hist.unshift(ent); RCg.view = 0; prune(); dockPaint(); menuBtn();
    let js = HG.s0, jt = TG.s0;
    const step = () => {
      if (RCg.data !== d) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 6 && (js <= sB || jt <= sB)) {
        if (js <= sB) { const row = new Float32Array(NX); for (let i = 0; i < NX; i++) row[i] = C.height(HG.x0 + i * 10, -js, 4); HG.rows.push(row); js += 10; }
        if (jt <= sB) { const row = new Uint8Array(TX); for (let i = 0; i < TX; i++) row[i] = Math.round(cl01(C.treeDensity(TG.x0 + i * 8, -jt)) * 100); TG.rows.push(row); jt += 8; }
      }
      if (js <= sB || jt <= sB) { setTimeout(step, 0); return; }
      d.H = (x, s) => { const fi = (x - HG.x0) / 10, fj = (s - HG.s0) / 10; if (fi < 0 || fj < 0 || fi >= NX - 1 || fj >= HG.rows.length - 1) return null;
        const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, A = HG.rows[j], B = HG.rows[j + 1]; return (A[i] * (1 - u) + A[i + 1] * u) * (1 - v) + (B[i] * (1 - u) + B[i + 1] * u) * v; };
      const tv = (i, j) => { const row = TG.rows[j]; return row && i >= 0 && i < TX ? row[i] / 100 : 0; };
      d.T = (x, s) => { const fi = (x - TG.x0) / 8, fj = (s - TG.s0) / 8, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j; return (tv(i, j) * (1 - u) + tv(i + 1, j) * u) * (1 - v) + (tv(i, j + 1) * (1 - u) + tv(i + 1, j + 1) * u) * v; };
      d.ready = true; render(ent);
    };
    setTimeout(step, 400);          // (after the finish's own burst and the card sliding in)
    // who and the place: the board answers a moment after the finish (92_rings.js submits the time first)
    if (typeof Rank !== 'undefined' && Rank.me && Rank.on && Rank.chalBoard) {   // all three difficulties share one board since 2026-11-19
      const m = C.mountainBySeed && C.mountainBySeed(), b = m ? Rank.chalBoard(m.id, o.line) : 0;
      if (b) setTimeout(() => Rank.me(b).then(w => { if (!w || RCg.data !== d) return; if (w.nick) d.player = w.nick; if (w.rank != null) d.rank = w.rank; if (d.ready) render(ent); }).catch(() => { }), 2500);
    }
  }
  const cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  RG.hooks.go.push(begin); RG.hooks.finish.push(finish);

  // ---- every card is kept (用户 2026-11-19 06:50 UTC: 关了继续滑以后，就找不到之前的路线卡了): once drawn, the card goes as a picture into
  // the browser's own store (IndexedDB, the last HMAX cards), so it is still there after 继续滑, the next run, or the next day. The pause
  // menu has 路线卡 whenever there is one, and the card shows them all, newest first (‹ › or the arrow keys)
  const HMAX = 12;
  const DB = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      try { const q = indexedDB.open('coldsmoke-routecards', 1); q.onupgradeneeded = () => q.result.createObjectStore('c', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }
      catch (e) { rej(e); }
    }));
    const run = (mode, f) => open().then(db => new Promise((res, rej) => { const t = db.transaction('c', mode), q = f(t.objectStore('c')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
    return { all: () => run('readonly', s => s.getAll()), put: o => run('readwrite', s => s.put(o)), del: id => run('readwrite', s => s.delete(id)) };
  })();
  const keep = e => DB.put({ id: e.id, line: e.line, diff: e.diff, score: e.score, date: e.date, blob: e.blob }).then(prune).catch(() => { });
  function prune() { while (RCg.hist.length > HMAX) { const e = RCg.hist.pop(); DB.del(e.id).catch(() => { }); if (e.url) URL.revokeObjectURL(e.url); } }
  try { DB.all().then(list => {
    const have = new Set(RCg.hist.map(e => e.id));
    for (const o of list || []) if (o && o.blob && !have.has(o.id)) RCg.hist.push({ id: o.id, line: o.line, diff: o.diff, score: o.score, date: o.date, blob: o.blob });
    RCg.hist.sort((a, b) => b.date - a.date); prune(); menuBtn();
  }).catch(() => { }); } catch (e) { }

  // one full-size drawing per card (1200×1600): the card, the thumbnail beside the result and the kept picture all come from it
  function render(e) {
    const d = e.data; if (!d || !d.ready) return;
    const cv = e.full || (e.full = document.createElement('canvas')); cv.width = 1200; cv.height = 1600;
    try { RouteCard.draw(cv, d, 'e'); e.ok = true; } catch (err) { console.warn('route card:', err); e.ok = false; }
    if (e.ok) try { cv.toBlob(b => { if (!b) return; e.blob = b; if (e.url) { URL.revokeObjectURL(e.url); e.url = null; } keep(e); }, 'image/jpeg', 0.9); } catch (err) { }
    if (RCg.hist[0] === e) dockPaint();
    if (RCg.el && RCg.el.classList.contains('on') && RCg.hist[RCg.view] === e) paint();
    menuBtn();
  }
  function pic(e, cb) {          // a kept card (from an earlier day): its picture
    if (e.img) { cb(e.img); return; }
    if (!e.blob) { cb(null); return; }
    const im = new Image(); e.url = e.url || URL.createObjectURL(e.blob);
    im.onload = () => { e.img = im; cb(im); }; im.onerror = () => cb(null); im.src = e.url;
  }
  function placeholder(cv, text) {
    const g = cv.getContext('2d'); g.fillStyle = '#141c2b'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(244,247,251,.62)'; g.font = '400 ' + Math.round(cv.width / 37) + 'px "Noto Serif SC","Songti SC",serif'; g.textAlign = 'center'; g.fillText(RC_W(text), cv.width / 2, cv.height / 2);
  }
  function drawEntry(cv, e, done) {
    if (!e) { placeholder(cv, '还没有路线卡'); done && done(false); return; }
    const g = cv.getContext('2d');
    if (e.full && e.ok) { g.drawImage(e.full, 0, 0, cv.width, cv.height); done && done(true); return; }
    if (e.data) { placeholder(cv, e.data.ready ? '这张卡没画出来' : '正在画这条线…'); done && done(false); return; }
    pic(e, im => { if (im) { g.drawImage(im, 0, 0, cv.width, cv.height); done && done(true); } else { placeholder(cv, '这张卡没画出来'); done && done(false); } });
  }

  // ---- beside the result (用户 2026-11-19 06:50 UTC: 弹出统计的时候，路线卡没有一起弹出来): the card itself, small, to the left of the result
  // card, coming in with it and going with it (CSS: it follows .card.on, so 回放, 继续滑 and a new run take it away too). A tap opens it large
  // (below the time and its line at the top middle, so they stay readable on a phone turned sideways)
  // (the result card is min(330px,calc(var(--cw) * .44)) wide plus its 20 px padding each side, so the card sits 40 + 12 px further left than that)
  function dock() {
    const L = RG.line; if (!L || !L.el) return null;
    if (RCg.dk && RCg.dk.parentNode === L.el) return RCg.dk;
    const st = document.createElement('style');
    st.textContent = '#rline .rcdock{position:absolute;top:calc(50% + 36px);right:calc(var(--gr) + min(330px,calc(var(--cw) * .44)) + 52px);height:min(calc(100% - var(--gt) - var(--gb) - 72px),560px);max-width:calc(100% - var(--gr) - min(330px,calc(var(--cw) * .44)) - 64px);aspect-ratio:3/4;object-fit:contain;transform:translate(12px,-50%);opacity:0;transition:opacity .5s .2s,transform .6s .2s cubic-bezier(.2,.6,.2,1);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.45),inset 0 0 0 1px rgba(244,247,251,.22);cursor:pointer;pointer-events:none}'
      + '#rline .card.on ~ .rcdock{opacity:1;transform:translate(0,-50%);pointer-events:auto}';
    const cv = document.createElement('canvas'); cv.className = 'rcdock'; cv.width = 600; cv.height = 800; cv.title = RC_W('路线卡');
    cv.addEventListener('click', e => { e.stopPropagation(); RCg.view = 0; open(); });
    L.el.appendChild(st); L.el.appendChild(cv); RCg.dk = cv; return cv;
  }
  function dockPaint() { const cv = dock(); if (cv) drawEntry(cv, RCg.hist[0]); }

  // ---- the card large, over the game
  function ui() {
    if (RCg.el) return RCg.el;
    const d = document.createElement('div'); d.id = 'rcard';
    d.innerHTML = '<style>'
      + '#rcard{position:absolute;inset:0;z-index:60;display:none;align-items:center;justify-content:center;gap:clamp(12px,3vmin,24px);background:rgba(5,8,13,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);pointer-events:auto}'
      + '#rcard.on{display:flex}#rcard canvas{height:min(calc(100% - 32px),calc((var(--cw) - 200px) * 4 / 3));aspect-ratio:3/4;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.5),inset 0 0 0 1px rgba(244,247,251,.22)}'
      + '#rcard .side{display:flex;flex-direction:column;gap:8px;min-width:120px}#rcard .msg{font-family:var(--f-song);font-size:12px;letter-spacing:.14em;color:var(--dim);line-height:1.7;max-width:150px}'
      + '#rcard button{appearance:none;-webkit-appearance:none;margin:0;border:0;height:38px;padding:0 16px;border-radius:12px;font-family:var(--f-ui);font-size:12px;letter-spacing:.14em;cursor:pointer;color:var(--dim);background:rgba(5,8,13,.25);box-shadow:inset 0 0 0 1px var(--hair)}'
      + '#rcard button:disabled{opacity:.3;cursor:default}#rcard .nav{display:flex;gap:8px;align-items:center}#rcard .nav button{flex:1;padding:0;font-family:var(--f-lat);font-size:16px;letter-spacing:0}#rcard .n{font-family:var(--f-lat);font-size:11px;letter-spacing:.1em;color:var(--faint);text-align:center}'
      + '#rcard button.p{color:var(--sun);background:rgba(255,208,138,.08);box-shadow:inset 0 0 0 1px var(--sun);font-family:var(--f-song);letter-spacing:.3em}#rcard kbd{margin-left:.5em;font-family:var(--f-lat);font-size:.85em;opacity:.6}'
      + '</style><canvas width="1200" height="1600"></canvas><div class="side"><button class="p" data-a="save"></button><button data-a="close"></button>'
      + '<div class="nav"><button data-a="newer">‹</button><button data-a="older">›</button></div><div class="n"></div><div class="msg"></div></div>';
    (document.getElementById('app') || document.body).appendChild(d);
    d.addEventListener('click', e => {
      e.stopPropagation();
      const a = e.target && e.target.closest && e.target.closest('[data-a]'); if (!a) { if (e.target === d) close(); return; }
      const k = a.dataset.a; if (k === 'save') save(); else if (k === 'newer') step(-1); else if (k === 'older') step(1); else close();
    });
    RCg.el = d; return d;
  }
  const when = t => { const x = new Date(t), p = n => (n < 10 ? '0' : '') + n; return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + p(x.getHours()) + ':' + p(x.getMinutes()); };
  function paint() {
    const el = RCg.el, cv = el.querySelector('canvas'), msg = el.querySelector('.msg'), H = RCg.hist, i = RCg.view, e = H[i];
    el.querySelector('[data-a=save]').textContent = RC_W('保存图片'); el.querySelector('[data-a=close]').innerHTML = RC_W('关闭') + '<kbd>Esc</kbd>';
    el.querySelector('[data-a=newer]').disabled = i <= 0; el.querySelector('[data-a=older]').disabled = i >= H.length - 1;
    el.querySelector('.nav').style.display = H.length > 1 ? '' : 'none';
    el.querySelector('.n').textContent = e ? (H.length > 1 ? (i + 1) + ' / ' + H.length + ' · ' : '') + when(e.date) : '';
    drawEntry(cv, e, ok => { if (RCg.hist[RCg.view] === e) msg.textContent = ok ? RC_W('截图或保存，发给朋友') : ''; });
  }
  function step(k) { const n = RCg.view + k; if (n < 0 || n >= RCg.hist.length) return; RCg.view = n; paint(); }
  // (opened from the result: the result card steps aside and comes back after; from the pause menu: the menu stays under it, paused)
  function open() { if (!RCg.hist.length) return; RCg.view = cl(RCg.view, 0, RCg.hist.length - 1); ui().classList.add('on'); RCg.fromCard = !!(RG.line && RG.line.st === 'done'); if (RCg.fromCard) RG.cardShow(false); paint(); if (typeof UI !== 'undefined' && UI.layer) UI.layer('rcard', true, close); }
  function close() { if (!RCg.el || !RCg.el.classList.contains('on')) return; RCg.el.classList.remove('on'); if (typeof UI !== 'undefined' && UI.layer) UI.layer('rcard', false); if (RCg.fromCard) RG.cardShow(true); RCg.fromCard = false; }
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  function save() {
    const el = RCg.el, cv = el.querySelector('canvas'), e = RCg.hist[RCg.view], msg = el.querySelector('.msg');
    const name = '雪迹_' + (e && e.line ? e.line : '路线') + '_' + new Date(e ? e.date : Date.now()).toISOString().slice(0, 10) + '.png';
    if (typeof XHS !== 'undefined' && XHS.on && XHS.saveShot) {          // inside 小红书: a download link does nothing there, so straight into the album
      msg.textContent = RC_W('正在存…');
      XHS.saveShot(cv.toDataURL('image/jpeg', 0.92)).then(ok => { msg.textContent = RC_W(ok ? '已存到相册' : '没能存到相册，截图就好'); }, () => { msg.textContent = RC_W('没能存到相册，截图就好'); });
      return;
    }
    try { cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }, 'image/png'); }
    catch (err) { msg.textContent = RC_W('这里存不了图，截图就好'); }
  }
  RCg.open = open; RCg.close = close;
  RG.cardButtons.push({ label: '路线卡', key: 'C', on: () => { RCg.view = 0; open(); } });

  // ---- the pause menu's 路线卡 (under 拍照 / 挑战 / 上一场回放): whenever there is a card, in a run or at the top
  function menuBtn() {
    if (typeof document === 'undefined') return;
    if (!RCg.mb) {
      const ph = document.getElementById('m-replay') || document.getElementById('m-chal') || document.getElementById('m-photo'); if (!ph || !ph.parentNode) return;
      const b = document.createElement('button'); b.type = 'button'; b.id = 'm-rcard'; if (typeof I18N !== 'undefined' && I18N.live) I18N.live(b, '路线卡'); else b.textContent = '路线卡'; b.hidden = true;
      b.addEventListener('click', e => { e.stopPropagation(); RCg.view = 0; open(); if (e.detail) b.blur(); });
      ph.parentNode.insertBefore(b, ph.nextSibling); RCg.mb = b;
    }
    const sh = RCg.hist.length > 0 && !(G.mode === 'replay'); if (RCg.mb.hidden === sh) RCg.mb.hidden = !sh;
  }
  setInterval(menuBtn, 500);          // (the menu's own buttons come and go with the state; this one only needs a card to exist)

  addEventListener('keydown', e => {
    const on = RCg.el && RCg.el.classList.contains('on');
    if (on) {
      if (e.code === 'Escape' || e.code === 'KeyC') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); step(e.code === 'ArrowLeft' ? -1 : 1); return; }
      e.stopImmediatePropagation(); return;          // (nothing else reaches the game while the card is up)
    }
    if (e.code === 'KeyC' && RG.line && RG.line.st === 'done' && RCg.hist.length && !(G.mode === 'replay')) { e.preventDefault(); RCg.view = 0; open(); }
  }, true);
  // a new run or the title: the large card goes
  RG.hooks.go.push(() => close());
})();
