"use strict";
// ---------------------------------------------------------------- weather: a clear sky (晴), the fine snow of a clear day (小雪, as it always was) or a heavy snowfall (大雪)
// Heavy snow comes under a broken overcast. The clouds roll in first and the snowfall thickens after them (seven seconds when a weather is
// chosen by hand, about half a minute when the day chooses it), the wind rises and gusts, the light goes flat and soft while the sun is in,
// and now and then a break drifts across the sun and lets it out for a while. The far city and ranges fade to shapes behind the falling snow;
// the run ahead stays readable. Every so often lightning flickers inside the cloud (two or three strokes within a third of a second; sometimes
// a bolt is seen far off): its light is what lights the slope, and its thunder rolls in later by its distance, muffled by the snow.
// Which weather it is comes from the day's clock (one real second is one minute), a seeded run of spells. Lightning and the breaks in the
// cloud still run on the game's own clock.
//   Weather.levels (clear / light / heavy), .level, .auto / .setAuto(on) (the day's own weather, the default), .set(id) (eases there and holds it), .set(id, true) (there at once), .flash(opt), .sun(v)
//   .tune / .configure(o) / .spellAt(t): the probabilities, the lengths, the fade and the seed (developer mode edits these)
//   .shown(): what the corner should say (clear, light, heavy, or aurora once that is the sky)
//   For others to read: .k (0 clear or light .. 1 heavy), .dust (0 a bare sky .. 1 the diamond dust of 小雪), .kc (cloud), .ks (snowfall), .v, .wind, .hush
const Weather = (() => {
  const W = { levels: [['clear', '晴'], ['light', '小雪'], ['heavy', '大雪']], level: 'light', k: 0, dust: 1, kc: 0, ks: 0, v: 1, hold: null, wind: 1, hush: 0, gust: 0, ramp: 7,
    off: [0, 0, 0], cloud: [0, 0], windNow: [1.2, 0, 0.4], F: 0, fl: null, flashes: 0, flashAt: -1, ex: null, hole: [0.6, 0, 0, 0], cityK: 1, cityOut: 0 };
  // the two kinds of heavy snow the owner can pick between (Variants 'snow'). a: snow showers under a broken sky, the sun out for a while now and
  // then (the owner's own words); b: a blizzard, thicker and windier, the sun seldom out (and then mostly as a pale disc), lightning more often.
  // sig/D: how thick the falling snow is and how far off it levels out (m); sky: how thick it is against the sky; hid/out: spells of the sun
  // in and out (s); thin: the share of breaks that only thin the cloud; flash: seconds between flashes; wind (m/s) and its gusts; flakes: how many
  const KIND = {
    a: { sig: 0.0021, D: 900, sky: 1.75, hid: [12, 34], out: [7, 22], thin: 0.3, flash: [18, 44], wind: 4.8, gust: 0.38, flakes: 1.0, seed: 77031 },
    b: { sig: 0.0034, D: 760, sky: 2.3, hid: [24, 58], out: [5, 11], thin: 0.55, flash: [11, 30], wind: 7.5, gust: 0.5, flakes: 1.35, seed: 51137 },
  };
  const kind = () => (typeof Variants !== 'undefined' && KIND[Variants.val.snow]) ? Variants.val.snow : 'a';
  if (typeof Variants !== 'undefined') Variants.def('snow', '大雪样式', [['a', '阵雪'], ['b', '暴风雪']], 'a');
  W.kind = kind; W.KIND = KIND;
  // (what moves on screen when the kind is changed is eased there over a second or two: no snap)
  const NUM = ['sig', 'D', 'sky', 'wind', 'gust', 'flakes']; W.P = Object.assign({}, KIND[kind()]);
  // ---- the sun's own story under the overcast: long spells behind the cloud, shorter ones out in a break that drifts across it from upwind.
  // Precomputed, read off the game clock. A break is a round hole in the cloud (radius R, soft edge E) whose centre slides past the sun at w rad/s:
  // its edge takes `tr` seconds to cross the disc, and the sun stands clear in it for `out` seconds. It is seen coming for a few seconds before
  // and drifting away after.
  const E = 0.07, spans = {};
  for (const id in KIND) {
    const P = KIND[id], r = RNG(P.seed), L = []; let t = 3;
    for (let i = 0; i < 160; i++) {
      const hid = lerp(P.hid[0], P.hid[1], r()), out = lerp(P.out[0], P.out[1], r()), tr = 3.2 + 2.6 * r(), deep = r() < P.thin ? 0.45 + 0.3 * r() : 1;
      L.push({ a: t + hid, out, tr, deep, y: (r() - 0.5) * 0.05 }); t += hid + out + 2 * tr;
    }
    spans[id] = { L, T: t };
  }
  // where the break nearest the sun is: [offset along the drift (rad), offset across, radius, how clear it is 0..1]
  function holeAt(t) {
    if (W.hold !== null) return W.hold < 0.5 ? [0, 0, 0.24, 1] : [0.6, 0, 0.24, 0];
    const S = spans[kind()], tt = ((t % S.T) + S.T) % S.T;
    for (const b of S.L) {
      const end = b.a + b.out + 2 * b.tr; if (tt < b.a - 9) break; if (tt > end + 9) continue;
      const w = 2 * E / b.tr, R = E + w * b.out / 2, mid = b.a + b.tr + b.out / 2;
      return [(tt - mid) * w, b.y, R, b.deep * smooth(b.a - 9, b.a - 5, tt) * smooth(end + 9, end + 5, tt)];
    }
    return [0.6, 0, 0, 0];
  }
  // (the break is a tear stretched along the drift, ST times longer than it is wide: H[2] is its half length, the sky draws it the same way)
  const ST = 3, sunIn = H => 1 - H[3] * smooth(H[2] + E, H[2] - E, Math.hypot(H[0], H[1] * ST));

  // ---- 自动 (the default): the weather is a function of the day's clock. The run opens on 小雪, as it always has (two and a half to five
  // minutes of it, from the afternoon the picture starts in), and after that each spell is drawn from the seed: mostly light or heavy, now
  // and then a clear sky, a spell never the same as the one before it. Picking 晴, 小雪 or 大雪 holds that one. There is no fog.
  W.auto = true;
  W.tune = { seed: 40961, ramp: 30, noRepeat: true, p: { clear: 0.12, light: 0.40, heavy: 0.48 }, dur: { clear: [90, 180], light: [150, 300], heavy: [60, 150] } };
  const IDS = ['clear', 'light', 'heavy'];
  let cache = { key: '', spells: [], lo: 0, hi: 0, t0: 0, t1: 0 };
  function probs() {
    const p = W.tune.p; let c = Math.max(0, +p.clear || 0), l = Math.max(0, +p.light || 0), h = Math.max(0, +p.heavy || 0);
    if (c + l + h <= 0) { c = 0.12; l = 0.40; h = 0.48; }
    const s = c + l + h; return { clear: c / s, light: l / s, heavy: h / s };
  }
  function span(id, u) { const d = W.tune.dur[id] || W.tune.dur.light, lo = Math.max(8, Math.min(d[0], d[1])), hi = Math.max(lo, d[0], d[1]); return lo + (hi - lo) * u; }
  function roll(i, avoid) {
    const seed = W.tune.seed >>> 0;
    if (i === 0) return { id: 'light', dur: span('light', hash2(19, seed)) };     // the opening spell is always the fine snow
    const u = hash2(i * 2 + 3, seed), p = probs();
    let id = u < p.clear ? 'clear' : u < p.clear + p.light ? 'light' : 'heavy';
    if (W.tune.noRepeat && avoid && id === avoid) {
      const rest = IDS.filter(x => x !== avoid), w0 = p[rest[0]], w1 = p[rest[1]], s = w0 + w1 || 1;
      id = hash2(i * 2 + 7, seed) < w0 / s ? rest[0] : rest[1];     // the other two, in proportion, so the weights still mean what they say
    }
    return { id, dur: span(id, hash2(i * 2 + 5, seed)) };
  }
  function tuneKey() {
    const t = W.tune, p = t.p, d = t.dur;
    return [t.seed >>> 0, t.noRepeat ? 1 : 0, p.clear, p.light, p.heavy, d.clear.join(','), d.light.join(','), d.heavy.join(',')].join('|');
  }
  // spells laid end to end from the afternoon the day opens on (Sky.times.day). Built out only as far as a clock asks.
  function atRel(x) {
    const key = tuneKey();
    if (key !== cache.key) cache = { key, spells: [], lo: 0, hi: 0, t0: 0, t1: 0 };
    if (!cache.spells.length) { const s = roll(0, null); cache.spells.push(s); cache.t1 = s.dur; cache.hi = 1; }     // spell 0 is the opening 小雪, so the one before it can avoid it
    let guard = 0;
    while (x >= cache.t1 && guard++ < 100000) { const prev = cache.spells.length ? cache.spells[cache.spells.length - 1].id : null; const s = roll(cache.hi, cache.hi ? prev : null); cache.spells.push(s); cache.t1 += s.dur; cache.hi++; }
    while (x < cache.t0 && guard++ < 100000) { const avoid = cache.spells.length ? cache.spells[0].id : null; const s = roll(cache.lo - 1, avoid); cache.spells.unshift(s); cache.t0 -= s.dur; cache.lo--; }
    let t = cache.t0;
    for (let i = 0; i < cache.spells.length; i++) { const s = cache.spells[i]; if (x < t + s.dur) return { id: s.id, dur: s.dur, left: t + s.dur - x }; t += s.dur; }
    const s = cache.spells[cache.spells.length - 1] || { id: 'light', dur: 1 }; return { id: s.id, dur: s.dur, left: 0 };
  }
  W.spellAt = function (t) { const origin = (typeof Sky !== 'undefined' && Sky.times) ? Sky.times.day : 0; return atRel((t == null ? Sky.clock : t) - origin); };
  W.configure = function (o) {
    if (!o) return W.tune;
    const t = W.tune;
    if (o.seed != null && o.seed === o.seed) t.seed = o.seed >>> 0;
    if (o.ramp != null && o.ramp === o.ramp) t.ramp = clamp(+o.ramp, 0.5, 120);
    if (o.noRepeat != null) t.noRepeat = !!o.noRepeat;
    if (o.p) for (const k of IDS) if (o.p[k] != null && o.p[k] === o.p[k]) t.p[k] = clamp(+o.p[k], 0, 1);
    if (o.dur) for (const k of IDS) if (o.dur[k]) {
      let lo = +o.dur[k][0], hi = +o.dur[k][1];
      if (!(lo >= 5)) lo = t.dur[k][0]; if (!(hi >= lo)) hi = Math.max(lo, t.dur[k][1]); t.dur[k] = [lo, hi];
    }
    cache.key = '';
    if (W.auto && typeof Sky !== 'undefined') { const s = W.spellAt(Sky.clock); if (s) W.level = s.id; }
    return W.tune;
  };
  let primed = false;
  function autoStep() {
    if (!W.auto || typeof Sky === 'undefined') return;
    const id = W.spellAt(Sky.clock).id;
    if (!primed) { primed = true; if (id !== W.level) { W.level = id; W.k = id === 'heavy' ? 1 : 0; W.dust = id === 'clear' ? 0 : 1; } return; }
    if (id !== W.level) W.level = id;
  }
  const mixOf = id => id === 'heavy' ? [1, 1] : id === 'clear' ? [0, 0] : [0, 1];     // [k, dust]
  W.setAuto = function (on) { W.auto = on !== false; if (W.auto && typeof Sky !== 'undefined') { const s = W.spellAt(Sky.clock); if (s) W.level = s.id; } return W.auto; };
  W.set = function (id, now) {
    if (!W.levels.some(l => l[0] === id)) return W.level;
    W.level = id; W.auto = false;
    if (now) { const m = mixOf(id); W.k = m[0]; W.dust = m[1]; W.ex = null; W.mix(); }
    return W.level;
  };
  // what the corner says: the picture, not the spell it is on its way toward. Aurora only once the snow is not hiding it.
  W.shown = function () {
    let id = W.k >= 0.45 ? 'heavy' : (W.dust < 0.35 && W.k < 0.25) ? 'clear' : 'light';
    if (id !== 'heavy' && typeof Sky !== 'undefined' && (Sky.stars || 0) > 0.45 && Sky.show && Sky.show() === 'aurora') id = 'aurora';
    return id;
  };
  W.sun = function (v) { W.hold = v == null ? null : +v; W.hole = holeAt(App.t); W.v = sunIn(W.hole); W.ex = null; };
  W.mix = function () { W.kc = smoother(0, 0.75, W.k); W.ks = smoother(0.2, 1, W.k); };
  { const q = typeof location !== 'undefined' ? location.search : '', m = /[?&]wx=(\w+)/.exec(q); if (m) W.set(m[1], true); if (/[?&]manual\b/.test(q)) W.auto = false; }   // (test renders hold the weather)

  // ---- lightning. Two or three return strokes down the same channel within a third of a second, each a blink of a few hundredths of a
  // second with a short glow after it. In the cloud at az/el, `dist` metres off; with a bolt, its channel is seen from the cloud base down.
  const FC = [0.70, 0.82, 1.0];
  function strike(o = {}) {
    const r = RNG(9001 + 7919 * W.flashes++), f = Render.cam.fwd, yaw = Math.atan2(f[0], -f[2]);
    const fl = { t0: App.t, az: o.az != null ? o.az : yaw + (r() - 0.5) * 2.0, el: o.el != null ? o.el : 0.12 + 0.28 * r(), dist: o.dist || 900 + 3600 * r() * r(),
      bolt: o.bolt != null ? !!o.bolt : r() < 0.42, seed: 1 + Math.floor(r() * 997), st: [] };
    fl.top = Math.atan2(1300, fl.dist) * (0.8 + 0.25 * r());                      // the cloud base, seen at that distance
    const n = o.strokes || (2 + (r() < 0.55 ? 1 : 0)); let ts = 0;
    for (let i = 0; i < n; i++) { fl.st.push([ts, i === 0 ? 0.8 + 0.2 * r() : 0.45 + 0.55 * r()]); ts += 0.05 + 0.09 * r(); }
    W.fl = fl;
    // the thunder, from where the flash was, by the time the sound has come that far
    const rig = typeof Sound !== 'undefined' && Sound.rig; if (rig && rig.thunder) rig.thunder(Sound.now() + fl.dist / 343, fl.dist, clamp(Math.sin(fl.az - yaw) * 0.8, -0.8, 0.8), fl.bolt);
    return fl;
  }
  W.flash = function (o) { return strike(o); };
  function flashLight(t) {
    const f = W.fl; if (!f) return 0; const a = t - f.t0; let F = 0;
    for (const [ts, A] of f.st) { const u = a - ts; if (u >= 0) F += A * (Math.exp(-u / 0.034) + 0.16 * Math.exp(-u / 0.18)); }
    if (a > 2 || a < 0) W.fl = null;
    return F;
  }

  W.update = function (dt) {
    const t = App.t, P = W.P, KP = KIND[kind()], kp = 1 - Math.exp(-dt / 1.5);
    for (const n of NUM) P[n] += (KP[n] - P[n]) * kp;
    // toward the chosen weather, at an even pace: the cloud leads, the snowfall follows (and on the way back the snow eases before the sky clears)
    const prev = W._ck; W._ck = typeof Sky !== 'undefined' ? Sky.clock : 0;
    autoStep();
    const m = mixOf(W.level), rp = Math.max(0.05, W.auto ? W.tune.ramp : W.ramp);
    // a clock wound by hand (a time of day chosen) shows the weather of that hour at once; a clock that runs by itself eases there
    const jumped = primed && prev != null && Math.abs(W._ck - prev) > Math.max(0.05, dt) * 3;
    const step = (cur, tgt) => cur === tgt ? cur : tgt > cur ? Math.min(tgt, cur + dt / rp) : Math.max(tgt, cur - dt / rp);
    if (jumped && W.auto) { W.k = m[0]; W.dust = m[1]; } else { W.k = step(W.k, m[0]); W.dust = step(W.dust, m[1]); }
    W.mix();
    // the break nearest the sun: carried along smoothly (and so also when the kind of snow is changed)
    const H = holeAt(t), kh = 1 - Math.exp(-dt / 0.6); for (let i = 0; i < 4; i++) W.hole[i] += (H[i] - W.hole[i]) * kh;
    W.v = sunIn(W.hole);
    // the wind: the light breeze of a clear day, rising to a gusting wind in heavy snow (gusts of a few seconds; it swings a little with them)
    const g = vnoise1(t * 0.21, 3) * 0.65 + vnoise1(t * 0.57, 4) * 0.35, ws = lerp(1, P.wind / 1.265 * (1 + P.gust * g), W.ks), ang = 0.3218 + 0.16 * W.ks * vnoise1(t * 0.13, 5);
    W.gust = g; W.windNow = [1.265 * ws * Math.cos(ang), 0, 1.265 * ws * Math.sin(ang)];
    if (typeof App !== 'undefined') App.state.wind = W.windNow;
    // where the wind has carried the air so far (the falling snow rides it: a change of wind must not jump the flakes), and the cloud, which
    // moves four times as fast up there
    for (let i = 0; i < 3; i++) W.off[i] += W.windNow[i] * dt;
    W.cloud[0] = (W.cloud[0] + W.windNow[0] * dt * 4) % 60000; W.cloud[1] = (W.cloud[1] + W.windNow[2] * dt * 4) % 60000;
    W.wind = 1 + 0.45 * W.ks; W.hush = 0.65 * W.ks;
    // the far city behind the snowfall: a dim shape, its lights no more than their glow on the cloud's underside (the sky draws the towers
    // with this, and the lights drawn over the sky by Vista.drawLights are turned down by it for as long as they are drawn)
    W.cityOut = W.kc * lerp(0.45, 0.9, typeof Sky !== 'undefined' ? Sky.night || 0 : 0);     // (by day its towers stay a grey shape)
    if (typeof Vista !== 'undefined' && Vista.drawLights && !Vista.drawLights.wx) {
      const dl = Vista.drawLights, f = function (R) {
        const k = 1 - W.cityOut, L = Vista.lit; if (k < 0.995 && L) { const keep = {}; for (const n in L) if (typeof L[n] === 'number') { keep[n] = L[n]; L[n] *= k; } try { dl(R); } finally { Object.assign(L, keep); } } else dl(R);
      }; f.wx = true; Vista.drawLights = f;
    }
    // the headlamp's beam stands out in the falling snow
    // (15_shafts.js thins the beam's air for the first metres when the lamp is at the lens: from the skier's own eyes it is a cone reaching out
    // ahead, not a lit ball in front of the face)
    // and when the sun comes out through a break, its light stands in the falling snow as shafts between the trees' and ridges' shadows
    if (typeof Shafts !== 'undefined') {
      if (W.lampAir0 == null) { W.lampAir0 = Shafts.lampAir; W.shOn0 = Shafts.enabled; W.shGain0 = Shafts.gain; }
      Shafts.lampAir = W.lampAir0 * (1 + 3.0 * W.ks);
      const so = W.ks * (1 - W.v) * (1 - (typeof Sky !== 'undefined' ? Sky.night || 0 : 0));
      if (W.shOn0) Shafts.gain = W.shGain0 * (1 + 2 * so); else { Shafts.enabled = so > 0.01; Shafts.gain = so > 0.01 ? W.shGain0 * 1.1 * so : W.shGain0; }      // (gain held low: the march's forward lobe made a blown ball of the sun)
    }
    // lightning, once the snow is heavy: the first soon after it has come, then every half minute or so
    if (W.ks > 0.6) {
      if (W.flashAt < 0) W.flashAt = t + 5 + 7 * hash1(W.flashes * 31 + 7);
      else if (t >= W.flashAt && !W.fl) { strike(); W.flashAt = t + lerp(KP.flash[0], KP.flash[1], hash1(W.flashes * 131 + 3)); }
    } else W.flashAt = -1;
    W.F = flashLight(t);
  };

  // ---- the light. Called from Render.computeGlobals after the sky's own values are in G: under the cloud the sun is let through less, the sky's
  // light becomes the overcast's (grey, flat, from everywhere above), the band of bright sky low on the sun's bearing goes, the light thrown up
  // from the snow follows, and the camera opens up a little for it as it does for the time of day. A flash is light from the whole sky.
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const ZERO = [0, 0, 0, 0];
  W.sky = { wa: ZERO, wb: ZERO, wc: ZERO, wd: ZERO, we: ZERO, wf: ZERO, wg: ZERO };
  W.veilU = null;
  W.globals = function (G) {
    const kc = W.kc, ks = W.ks, v = W.v, P = W.P;
    if (kc < 1e-4 && W.F < 1e-4) { W.ex = null; W.sky = { wa: ZERO, wb: ZERO, wc: ZERO, wd: ZERO, we: ZERO, wf: ZERO, wg: ZERO }; W.veilU = null; W.sunK = 1; return; }
    const sc = Sky.sunCol, as = Sky.ambSky, tw = Sky.twi, e = Sky.elev, sf = Sky.sunFar;
    const sunT = lerp(1, lerp(0.85, 0.07, v), kc); W.sunK = sunT;
    const sun = sc.map(c => c * sunT);
    // the overcast's own light: what falls on its top (the sun, and the sky above it), let through and spread out, and greyed as cloud greys it
    const se = Math.max(Math.sin(e), 0.03), top = [0, 1, 2].map(i => sf[i] * se * 0.9 + as[i] * 1.1), tl = lum(top);
    const ov = top.map((c, i) => 0.56 * lerp(c, tl, 0.75) * [0.95, 1.0, 1.07][i]);
    // a night snowstorm is cold blue-grey: the moonlit overcast is pulled toward a cool grey. The far city's sodium glow only warms the cloud
    // low on its own bearing (overcast() and the veil, M.wf / c); over the skier it adds no more than a trace, else the whole storm goes sepia
    { const n = Sky.night || 0, l = lum(ov); for (let i = 0; i < 3; i++) ov[i] = lerp(ov[i], l * [0.80, 0.92, 1.14][i], 0.7 * n); }
    const cg = Sky.lights * W.cityK;
    ov[0] += 0.0014 * cg; ov[1] += 0.0011 * cg; ov[2] += 0.0009 * cg;
    const amb = as.map((c, i) => lerp(c, ov[i] * 0.5, kc)), twi = tw.map(c => c * (1 - 0.85 * kc));
    const up = Math.max(0, Math.sin(e)), gnd = [0, 1, 2].map(i => 0.5 * (sun[i] * (up * 0.9 + 0.2 * smooth(-0.05, 0.15, Math.sin(e))) + amb[i] * 0.8));
    // the eye opens as the light goes flat (by the law the sky uses for the time of day, a little less of it at night), over a second or so
    const L0 = lum(sc) * 0.33 + lum(as) * 1.9 + lum(tw) * 0.5, L1 = lum(sun) * 0.33 + lum(amb) * 1.9 + lum(twi) * 0.5;
    const tgt = Math.pow(L0 / Math.max(L1, 1e-6), lerp(0.78, 0.35, Sky.night));       // (by day a snowfall is bright white-grey, not dim)
    W.ex = W.ex == null ? tgt : damp(W.ex, tgt, 0.85, Render.dt || 1 / 60);
    const ex = Post.exposure * W.ex; Post.exposure = ex;
    // lightning: the cloud round the flash lights up, and the slope takes blue-white light from it, less than the sky shows (the eye cannot follow it)
    const Ef = W.F * lerp(0.13, 0.20, Sky.night) / ex;
    // (and the lens sees no disc, so no starburst or ghosts, while the sun is in; through the falling snow they are weaker)
    { const sv = (1 - 0.4 * kc) * (1 - kc * smooth(0, 0.6, v)); Post.flare *= sv; Post.burst *= sv; Post.ghosts *= sv; }
    for (let i = 0; i < 3; i++) { amb[i] += FC[i] * Ef * 0.5; gnd[i] += FC[i] * Ef * 0.22; }
    G.set([sun[0], sun[1], sun[2], 260], GOFF.sunCol); G.set([amb[0], amb[1], amb[2], ex], GOFF.ambSky);
    G.set([gnd[0], gnd[1], gnd[2]], GOFF.ambGnd); G.set([twi[0], twi[1], twi[2], kc], GOFF.twi);      // (twi.w: how overcast, for skyLut in 02_shaderlib.js)
    G[GOFF.cloudP + 3] = lerp(Render.cloudCover, 0.46, kc);
    // for the sky (05_sky.js overcast() and bolt()) and the veil of falling snow (11_dust.js)
    const sd = Sky.sunDir(), saz = Math.atan2(sd[0], -sd[2]), sel = Math.asin(clamp(sd[1], -1, 1)), H = W.hole, f = W.fl;
    const fd = f ? [Math.sin(f.az) * Math.cos(f.el), Math.sin(f.el), -Math.cos(f.az) * Math.cos(f.el)] : [0, 1, 0];
    const bl = f && f.bolt ? W.F * 7 / ex : 0, den = lerp(0.72, 1, v);
    // (a sky only partly clouded is lit far better than one under a closed deck: the first clouds are bright, and they only darken to the
    // overcast's grey as they close up, while the eye opens with them; a constant deck colour made the first patches a dark slab)
    const wk = lerp(1.9, 1, smoother(0.2, 0.95, kc));
    W.sky = { wa: [ov[0] * wk, ov[1] * wk, ov[2] * wk, kc], wb: [saz + H[0] / Math.max(Math.cos(sel), 0.2), sel + H[1], H[2], H[3]], wc: [sc[0], sc[1], sc[2], E],
      wd: [fd[0], fd[1], fd[2], Ef], we: f ? [f.az, f.top, f.seed, bl] : ZERO, wf: [0.050 * cg * kc, 0.036 * cg * kc, 0.024 * cg * kc, W.cityOut], wg: [W.cloud[0] / 1500, W.cloud[1] / 1500, 1.3 * ks, 0] };
    W.veilU = ks < 0.002 ? null : { a: [P.sig * ks * den, P.D, P.sky * ks * den, ks], b: [ov[0] * 1.12 + gnd[0] * 0.08, ov[1] * 1.12 + gnd[1] * 0.08, ov[2] * 1.12 + gnd[2] * 0.08, 0],
      c: [0.030 * cg * ks, 0.021 * cg * ks, 0.014 * cg * ks, 0], d: [fd[0], fd[1], fd[2], Ef * ks],
      e: [((W.off[0] % 1024) + 1024) % 1024, 0, ((W.off[2] % 1024) + 1024) % 1024, App.t % 1024] };
    W.share = ks * (P.flakes / 1.35) * lerp(0.8, 1, v);          // (11_dust.js holds the blizzard's count of flakes)
  };

  // ---- sound. Built into the game's instrument (18_sound.js calls this from Sound.build on the live context or an offline one) and fed every
  // frame. The storm's own wind, there whatever the skier does: a broad rush that swells and falls on gusts of its own with its top end rising in
  // them, and a low moan in it; and thunder. Falling snow swallows the hiss of what is far: the body of the wind and the roll of the thunder are left.
  W.build = function (ctx, out, M, k) {
    const { gain, biq, chain, H, set } = k, sr = ctx.sampleRate, R = {};
    const loop = (b, rate, off) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(0, off); return s; };
    const pan = () => ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
    const air = loop(M.pink, 0.91, 2.3), hp = biq('highpass', 50, 0.7), bp = biq('bandpass', 360, 0.42), lp = biq('lowpass', 1300, 0.6), g = gain(0);
    const gl = loop(M.lfo, 8 / sr, 0.031), gd = gain(0), gf = gain(0);
    chain(air, hp, bp, lp, g, out); chain(gl, gd); gd.connect(g.gain); gl.connect(gf); gf.connect(bp.frequency);
    const wh = loop(M.white, 0.97, 1.7), mb = biq('bandpass', 480, 6), mb2 = biq('lowpass', 900, 0.7), mg = gain(0), md = gain(0), mf = gain(0);
    chain(wh, mb, mb2, mg, out); gl.connect(md); md.connect(mg.gain); gl.connect(mf); mf.connect(mb.frequency);
    const h = { g: H(g.gain), gd: H(gd.gain), gf: H(gf.gain), lp: H(lp.frequency), mg: H(mg.gain), md: H(md.gain), mf: H(mf.gain) };
    R.update = function (s, t) {
      const q = W.ks, v = s.run ? s.speed : 0, mask = 1 - 0.35 * smooth(10, 30, v);     // (at speed the air at the ears covers it)
      set(h.g, 0.30 * q * mask, t, 0.6); set(h.gd, 0.17 * q * mask, t, 0.6); set(h.gf, 110 * q, t, 0.5); set(h.lp, lerp(1500, 950, W.hush), t, 0.5);
      set(h.mg, 0.05 * q * mask, t, 0.8); set(h.md, 0.045 * q * mask, t, 0.8); set(h.mf, 70 * q, t, 0.8);
    };
    // thunder: a few rolls of different lengths, made once. The roll is the channel heard section by section, each from its own distance: bursts
    // of low noise that overlap, swell and die away; a near one opens with the tearing crack of the channel itself
    const bufs = [];
    for (let vv = 0; vv < 3; vv++) {
      const n = Math.round(sr * 7.5), b = ctx.createBuffer(2, n, sr), r = RNG(3301 + vv * 17), gauss = () => (r() + r() + r() + r() - 2) * 1.7320508, env = new Float32Array(n);
      const nb = 10 + Math.floor(r() * 6);
      for (let i = 0; i < nb; i++) {
        const t0 = (vv === 0 ? 0.03 : 0.12) + 4.6 * Math.pow(r(), 1.5), a = (0.35 + 0.65 * r()) * Math.exp(-t0 / 2.4), at = 0.06 + 0.3 * r(), dc = 0.3 + 1.2 * r();
        for (let j = Math.round(t0 * sr); j < n; j++) { const u = j / sr - t0, e = a * (1 - Math.exp(-u / at)) * Math.exp(-u / dc); if (u > dc * 7) break; env[j] += e; }
      }
      const k1 = 1 - Math.exp(-TAU * 160 / sr), k2 = 1 - Math.exp(-TAU * 1800 / sr), kh = Math.exp(-TAU * 350 / sr);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c); let br = 0, l1 = 0, l2 = 0, cr = 0, hx = 0, hy = 0, crE = 0;
        for (let i = 0; i < n; i++) {
          const w = gauss(); br = br * 0.996 + w * 0.08; l1 += (br - l1) * k1; l2 += (l1 - l2) * k1;
          let x = l2 * env[i] * 6.0;
          if (vv === 0 && i < sr * 0.7) {             // the crack: ragged bursts of broadband noise, then the boom under it
            if (r() < 60 / sr) crE += 0.6 + r(); crE *= Math.exp(-1 / (sr * 0.012));
            cr += (w - cr) * k2; const hpv = kh * (hx + cr - hy); hx = hpv; hy = cr;
            x += hpv * crE * 0.5 * Math.exp(-i / (sr * 0.25));
          }
          d[i] = x;
        }
      }
      let m = 0; for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); }
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c), s = 0.9 / (m || 1), f = Math.round(sr * 0.3); for (let i = 0; i < n; i++) d[i] *= s * (i > n - f ? (n - i) / f : 1); }
      bufs.push(b);
    }
    R.thunder = function (t, dist, pn, bolt) {
      R.claps = (R.claps || 0) + 1;
      const near = dist < 1600, s = ctx.createBufferSource(), f = biq('lowpass', lerp(1100, 260, smooth(800, 4500, dist)) * (1 - 0.35 * W.hush), 0.6), f2 = biq('lowshelf', 120, 0.7, 4), gg = gain(clamp(1500 / dist, 0.28, 1) * (bolt ? 0.95 : 0.75)), p = pan();
      s.buffer = bufs[near ? 0 : 1 + (R.claps % 2)]; s.playbackRate.value = 0.86 + 0.2 * hash1(R.claps * 11 + 1);
      if (p.pan) p.pan.value = pn;
      chain(s, f, f2, gg, p, out); s.start(t);
    };
    return R;
  };
  return W;
})();

// ---- the sky's part (drawn by 05_sky.js): the overcast over everything above the horizon, and a bolt far off.
// M.wa = (the overcast's own light rgb, how much cloud 0..1); M.wb = (the break by the sun: azimuth, elevation, radius, how clear 0..1);
// M.wc = (the sun above the cloud rgb, edge of the break); M.wd = (the flash: direction, its light); M.we = (the bolt: azimuth, top elevation,
// seed, its light); M.wf = (the city's glow on the cloud's underside rgb, -); M.wg = (how far the wind has carried the cloud: in its height)
function weatherSkySSL() {
  const f = x => (+x).toFixed(5), ca = typeof Vista !== 'undefined' ? Vista.cityAz : 0.14;
  return `
fn wxAng(a: vec3f, b: vec3f) -> f32 { return acos(clamp(dot(a, b), -1.0, 1.0)); }
fn overcast(d: vec3f, mu: f32, colIn: vec3f) -> vec3f {
  if (M.wa.w < 0.002) { return colIn; }
  // its underside, as a plane over the eye: what lies farther off is seen flatter and its detail packs closer
  let hy: f32 = max(d.y, 0.0) + 0.07;
  let p: vec2f = d.xz / hy;
  let px: f32 = 2.0 * U.camRight.w * U.res.w / (hy * hy);
  let q: vec2f = p * 0.30 - M.wg.xy;
  let l1: f32 = clamp(log2(px * 0.30 * 0.09 * 512.0), 0.0, 7.0);
  let n1: f32 = texLod(tDetail, q * 0.09 + vec2f(0.13, 0.57), l1).z;
  let n2: f32 = texLod(tDetail, q * 0.31 + vec2f(0.71, 0.23) + M.wg.yx * 0.11, l1 + 1.78).z;
  let n3: f32 = texLod(tDetail, q * 1.05 + vec2f(0.37, 0.91), l1 + 3.54).z;
  // (low toward the horizon the deck is seen edge-on and its fine detail packs into thin horizontal strips: there it is softened, so the far
  // cloud reads as a deep soft bank and not as flat panes stacked one over another)
  let soft: f32 = smoothstep(0.0, 0.2, d.y);
  let n: f32 = saturate(0.5 + (n1 - 0.5) * 1.5 + ((n2 - 0.5) * 0.8 + (n3 - 0.5) * 0.35) * mix(0.35, 1.0, soft));
  // the clouds come in from their thickest parts (the switch from a clear sky), and the break drifts past the sun with a ragged edge
  // (kept true right at the sun, so the disc goes in and out with the light on the snow)
  let kc: f32 = M.wa.w;
  // (the edge is wide while the cloud is coming in, so the first of it arrives as soft torn stratus, never a slab with a hard rim)
  let cov: f32 = smoothstep(1.05 - 1.35 * kc, 1.05 - 1.35 * kc + mix(0.75, 0.25, kc) * mix(2.2, 1.0, soft), n + 0.35 * kc);
  let toSun: f32 = acos(clamp(mu, -1.0, 1.0));
  // (a tear, not a porthole: three times longer along the drift than across it, its edge torn at the scale of the cloud's own lumps)
  let el: f32 = asin(clamp(d.y, -1.0, 1.0));
  var dz: f32 = atan2(d.x, -d.z) - M.wb.x; dz = atan2(sin(dz), cos(dz));
  let lc: vec2f = vec2f(dz * cos(el), (el - M.wb.y) * 3.0);
  // (the edge is torn by noise read in angle round the break, the same both ways: a deck's own noise is stretched flat near the horizon and
  // tore the edge into horizontal slats)
  let ra: f32 = texLod(tDetail, vec2f(dz, el) * 1.9 + vec2f(0.29, 0.61) + M.wg.xy * 0.02, 0.0).z;
  let rb: f32 = texLod(tDetail, vec2f(dz, el) * 6.1 + vec2f(0.83, 0.17), 0.0).z;
  let rag: f32 = ((ra - 0.5) * 1.3 + (rb - 0.5) * 0.6 + (n - 0.5) * 0.4) * M.wb.z * smoothstep(0.03, 0.15, toSun);
  let hole: f32 = M.wb.w * smoothstep(M.wb.z + M.wc.w, M.wb.z - M.wc.w, length(lc) + rag);
  // (thickest in front of the sun itself unless a break is there: where the light on the snow says the sun is in, no disc shows through)
  // (and while snow falls there is snow in the break too: what shows through it is a hazed blue, never the deep clear sky)
  let tau: f32 = max(cov * (5.5 + 8.0 * n + 7.0 * smoothstep(0.15, 0.03, toSun)) * (1.0 - hole), M.wg.z);
  // (thick cloud lets nothing of the sky above through, however bright: no stars, nebula or moon show through the overcast at night; only
  // where it thins toward a break does the sky come through, hazed)
  let T: f32 = exp(-tau - 2.0 * kc * max(tau - 2.0, 0.0));
  // its light: the overcast's, darker where it is thicker; the sun soaking through the thin parts round it (brightest just at the edge of a break,
  // the silver lining) and a pale glow round it however thick the cloud; the city's glow underneath at night; a flash lighting it from inside
  var c: vec3f = M.wa.rgb * (1.42 - 0.5 * n) * (0.88 + 0.12 * smoothstep(0.0, 0.4, d.y));
  // (thin cloud is bright, lit through: it only greys as it thickens. While it comes in, before the light below has followed it, it takes the
  // sky's own light, so a new patch is pale and never darker than the sky it crosses)
  c *= mix(1.6, 1.0, saturate(tau / 4.0));
  c = mix(max(c, luma(colIn) * vec3f(0.97, 0.99, 1.03) * 0.92), c, smoothstep(0.35, 0.85, kc));
  // (the sun's light through thin cloud is whitened by it, and in the break itself the glow stays a soft halo: the disc shows through the
  // snow there small, not as a blown ball the size of the break)
  var sg: vec3f = mix(M.wc.rgb, vec3f(luma(M.wc.rgb)), 0.35) * (hg(mu, 0.75) * (0.02 + 0.17 * (1.0 - smoothstep(0.0, 7.0, tau)) * (1.0 - 0.75 * hole)) + 0.008);
  c += sg * min(1.0, 2.0 * luma(M.wa.rgb) / max(luma(sg), 1e-6));
  let az: f32 = atan2(d.x, -d.z) - ${f(ca)};
  c += M.wf.rgb * ((0.06 + exp(-abs(atan2(sin(az), cos(az))) / 0.45)) * (0.15 + smoothstep(0.35, 0.0, d.y)));
  c += vec3f(0.78, 0.86, 1.0) * (M.wd.w * (0.7 + 2.6 * exp(-sq(wxAng(d, M.wd.xyz)) / 0.10)) * (0.6 + 0.8 * n));
  // (what shows through a break: the disc itself, but the sky's wide glare round it held to a few times the overcast, as the snow in the
  // break scatters it away; while the cloud is still coming in the clear sky's glare is left as it is)
  let cin: vec3f = mix(colIn, mix(min(colIn, vec3f(luma(M.wa.rgb) * 4.0)), colIn, smoothstep(0.03, 0.008, toSun)), smoothstep(0.3, 0.8, kc));
  return cin * T + c * (1.0 - T);
}
fn boltWalk(x: f32, s: f32) -> f32 { let i: f32 = floor(x); let fr: f32 = x - i; return mix(hash21(vec2f(i, s)), hash21(vec2f(i + 1.0, s)), fr) * 2.0 - 1.0; }
fn boltLine(w: f32, px: f32) -> f32 { return exp(-sq(w / (0.75 * px))) + 0.07 * exp(-abs(w) / (5.0 * px)); }
fn bolt(d: vec3f) -> vec3f {
  if (M.we.w <= 0.0) { return vec3f(0.0); }
  let el: f32 = asin(clamp(d.y, -1.0, 1.0)); let top: f32 = M.we.y; let bot: f32 = -0.035;
  if (el > top + 0.01 || el < bot) { return vec3f(0.0); }
  // the channel, down from the cloud base: kinked every half degree or so, and kinked again on a finer scale (a function of height, so it
  // never doubles back), with a branch forking off it part of the way down
  let s: f32 = M.we.z; let u: f32 = (top - el) / (top - bot);
  let x: f32 = boltWalk(u * 13.0, s) * 0.026 + boltWalk(u * 41.0, s + 7.0) * 0.009 + boltWalk(u * 130.0, s + 3.0) * 0.0028;
  var da: f32 = atan2(d.x, -d.z) - M.we.x - x; da = atan2(sin(da), cos(da));
  let px: f32 = 2.0 * U.camRight.w * U.res.w;
  var b: f32 = boltLine(da * cos(el), px);
  let u0: f32 = 0.22 + 0.25 * hash21(vec2f(s, 5.0));
  if (u > u0 && u < u0 + 0.35) {
    let bx: f32 = (u - u0) * (0.10 * sign(hash21(vec2f(s, 9.0)) - 0.5)) + boltWalk(u * 47.0, s + 11.0) * 0.008 * (u - u0) * 4.0;
    b += 0.45 * boltLine((da - bx) * cos(el), px) * smoothstep(u0 + 0.35, u0 + 0.1, u);
  }
  return vec3f(0.80, 0.88, 1.0) * (b * M.we.w * smoothstep(top + 0.01, top - 0.01, el));
}
`;
}
