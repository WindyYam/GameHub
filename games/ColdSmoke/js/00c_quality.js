"use strict";
// ---------------------------------------------------------------- how much this device is asked to draw
// Three levels. 高 is the game as designed and stays the level of every computer and every strong phone. A weaker phone (a mid-range Android
// GPU, say) starts lower, and any device that cannot hold its frame rate steps down by itself: first the picture is drawn a little smaller
// (the governor in 99_main.js), then a level down. What a level changes is chosen to be hard to see: the sharpness the picture is drawn at,
// the shadow map, the motion blur, how thick the fine snow in the air is and how much glitter the edges throw. Nothing is switched off at
// 均衡; 流畅 also drops the motion blur and draws the farthest trees a little nearer.
//   Quality.pick   'auto' (the default), or 0 / 1 / 2 chosen in 设置 (kept like the other settings)
//   Quality.tier   the level in use; Quality.L its numbers
//   Quality.on(fn) hears every change of level (99_main.js applies it)
// The level an automatic device settles at is remembered, so a phone that needed 流畅 starts there next time instead of stuttering first.
const Quality = (() => {
  const LEVELS = [
    { name: '高', maxDpr: 2, maxPx: 3.4e6, floor: 0.75, shadow: 2048, blur: true, dust: 1, glitter: 1, far: 460, bloom: 6, grain: 1, wind: 1, shLv: 2, patch: 0, tsh: 0, tmip: 1 },
    { name: '均衡', maxDpr: 1.25, maxPx: 1.2e6, floor: 0.75, shadow: 1536, blur: true, dust: 0.75, glitter: 0.7, far: 460, bloom: 6, grain: 0.75, wind: 1, shLv: 2, patch: 1, tsh: 0, tmip: 2 },
    { name: '流畅', maxDpr: 1, maxPx: 0.7e6, floor: 0.6, shadow: 1024, blur: false, dust: 0.5, glitter: 0.45, far: 380, bloom: 5, grain: 0.5, wind: 0.5, shLv: 1, patch: 1, tsh: 1, tmip: 2 },
  ];
  // (Variants 'qtier', 2026-11-19: a level used to change only pixels, and on a phone most of a frame does not scale with pixels: the
  // terrain's vertices, the shadow pass, the particles. b gives each level a say over those too: grain how many of the spray's grains are
  // thrown (the rest a little brighter, so the sheet reads as before), wind the blown snow's wisps, shLv how many terrain levels go into
  // the shadow map (level 1 still covers the 62 m the map reaches), patch 1 the half-density under-foot mesh whatever the height, tsh 1 the
  // terrain shader's optional middle-distance relief and forest-floor streaks left out, tmip 2 the ski tracks' blurred levels made every
  // other frame (17_tracks.js). And 流畅 is not drawn so small any more (floor).
  // a keeps the levels as they were)
  const OLD = { grain: 1, wind: 1, shLv: 2, patch: 0, tsh: 0, tmip: 1 };
  // Light load, the governor's first move inside a level: fewer of the small things that fly about (grains, glitter, air snow, wisps).
  // Q.lite 0..2; Q.k(name) is the level's number for name times the light-load share
  const LITE = [1, 0.8, 0.62];
  const KP = 'cs.q.pick', KA = 'cs.q.auto';
  if (typeof Variants !== 'undefined') Variants.def('qtier', '画质档管到的', [['a', '只管像素'], ['b', '也管网格和粒子']], 'b');
  const Q = { LEVELS, pick: 'auto', tier: 0, guess: 0, gpu: '', why: '', L: LEVELS[0], subs: [], downs: 0, ups: 0, lite: 0 };
  const newer = () => typeof Variants === 'undefined' || Variants.val.qtier !== 'a';
  Q.k = name => (newer() ? LEVELS[Q.tier][name] : name in OLD ? OLD[name] : LEVELS[Q.tier][name]) * (newer() && name in LITEK ? LITE[Q.lite] : 1);
  const LITEK = { grain: 1, wind: 1, dust: 1, glitter: 1 };
  Q.floor = () => (newer() && Q.tier === 2 ? 0.7 : LEVELS[Q.tier].floor);
  Q.setLite = n => { n = clamp(n | 0, 0, LITE.length - 1); if (n === Q.lite) return false; Q.lite = n; return true; };
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = k => v => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } if (Q.keep) Q.keep(k, v == null ? '' : v); };
  const handheld = () => !!(window.matchMedia && matchMedia('(pointer: coarse) and (hover: none)').matches);

  // the GPU's own name (the page can usually read it), sorted into a first guess. Only phones are guessed down: a computer starts at 高
  function gpuName() {
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return '';
      const x = gl.getExtension('WEBGL_debug_renderer_info'), s = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return String(s || '');
    } catch (e) { return ''; }
  }
  Q.classify = function (name, phone) {
    if (!phone) return [0, 'computer'];
    const s = name.toLowerCase(); let m;
    if ((m = /adreno[^0-9]*(\d{3})/.exec(s))) {
      const n = +m[1];
      if (n >= 800 || (n >= 725 && n < 800) || (n >= 650 && n < 700)) return [0, 'adreno ' + n];
      if (n >= 616) return [1, 'adreno ' + n];
      return [2, 'adreno ' + n];
    }
    if (/immortalis|mali-g(7[1-9]0|9\d\d)/.test(s)) return [0, 'mali high'];
    if (/mali-g(78|77|68|610|615|620|625)/.test(s)) return [1, 'mali mid'];
    if (/mali|powervr|img |ge8|bxm/.test(s)) return [2, 'mali/powervr low'];
    if (/xclipse 9\d\d/.test(s)) return [0, 'xclipse'];
    if (/maleoon|xclipse/.test(s)) return [1, 'mid'];
    if (/apple/.test(s)) return [0, 'apple'];
    return [1, 'unknown phone'];
  }

  // before anything is built: the pick, the level an automatic device settled at, or the guess
  Q.decide = function () {
    const qs = new URLSearchParams(location.search), forced = qs.get('quality');
    const p = get(KP); Q.pick = p === '0' || p === '1' || p === '2' ? +p : 'auto';
    const phone = handheld(); Q.gpu = gpuName();
    let [g, why] = Q.classify(Q.gpu, phone);
    if (phone && ((navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4)) { g = Math.max(g, 1); why += ', small memory/cpu'; }
    Q.guess = g;
    const a = get(KA), learned = a === '0' || a === '1' || a === '2' ? +a : null;
    Q.tier = forced != null && LEVELS[+forced] ? +forced : Q.pick !== 'auto' ? Q.pick : learned != null ? learned : g;
    Q.why = forced != null ? 'address' : Q.pick !== 'auto' ? 'picked' : learned != null ? 'remembered' : why;
    Q.L = LEVELS[Q.tier];
    return Q.tier;
  };
  Q.auto = () => Q.pick === 'auto';
  function set(t, from) {
    t = clamp(t | 0, 0, LEVELS.length - 1); if (t === Q.tier) return false;
    Q.tier = t; Q.L = LEVELS[t];
    for (const f of Q.subs) try { f(t, from); } catch (e) { console.warn('Quality', e); }
    return true;
  }
  // the governor: this device cannot hold its frame rate even drawn smaller (+1), or has had room to spare for a long while (-1)
  Q.step = function (d) {
    if (!Q.auto()) return false;
    if (d > 0 ? !set(Q.tier + 1, 'gov') : !set(Q.tier - 1, 'gov')) return false;
    d > 0 ? Q.downs++ : Q.ups++;
    put(KA)(String(Q.tier));
    return true;
  };
  // 设置: 自动 → 高 → 均衡 → 流畅 → 自动
  Q.select = function (next) {
    if (!['auto', 0, 1, 2].includes(next) || Q.pick === next) return Q.pick;
    Q.pick = next; put(KP)(next === 'auto' ? null : String(next));
    const a = get(KA), t = next !== 'auto' ? next : a === '0' || a === '1' || a === '2' ? +a : Q.guess;
    if (!set(t, 'pick')) for (const f of Q.subs) try { f(Q.tier, 'pick'); } catch (e) { }
    return Q.pick;
  };
  Q.cycle = function () {
    const order = ['auto', 0, 1, 2];
    return Q.select(order[(order.indexOf(Q.pick) + 1) % order.length]);
  };
  Q.label = () => (Q.pick === 'auto' ? '画质 自动' : '画质 ' + LEVELS[Q.pick].name);
  Q.on = fn => { Q.subs.push(fn); };
  return Q;
})();
