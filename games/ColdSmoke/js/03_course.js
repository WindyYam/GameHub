"use strict";
// ---------------------------------------------------------------- the mountain: an endless course made of ~30 s segments
// World: x right, y up, the fall line runs toward -z.  s = -z is distance travelled downhill.
// Everything here is plain double-precision JS; rendering samples it into clipmap textures, physics calls it directly.

const SEG_TYPES = {
  //           slope  hw  dish shoulder gul gw  gAmp rollA rollL mog forest glade powder ridge mean kick
  bowl:    { slope: 0.36, hw: 30, dish: 1.6, shoulder: 0.34, gul: 0, gw: 14, gAmp: 0, rollA: 0, rollL: 40, mog: 0, forest: 0.85, glade: 0, powder: 0.25, ridge: 0, mean: 1.0, kick: 0, enc: 0, gU: 0 },
  steeps:  { slope: 0.60, hw: 17, dish: 2.6, shoulder: 0.55, gul: 0, gw: 14, gAmp: 0, rollA: 0, rollL: 40, mog: 0, forest: 0.80, glade: 0, powder: 0.15, ridge: 0, mean: 0.55, kick: 0, enc: 0, gU: 0 },
  glade:   { slope: 0.33, hw: 44, dish: 0.8, shoulder: 0.26, gul: 0, gw: 14, gAmp: 0, rollA: 0.25, rollL: 34, mog: 0, forest: 1.0, glade: 1, powder: 0.6, ridge: 0, mean: 0.8, kick: 0, enc: 0, gU: 0 },
  rollers: { slope: 0.31, hw: 26, dish: 1.2, shoulder: 0.32, gul: 0, gw: 14, gAmp: 0, rollA: 1.5, rollL: 30, mog: 0, forest: 0.7, glade: 0, powder: 0.2, ridge: 0, mean: 0.7, kick: 0, enc: 0, gU: 0 },
  gully:   { slope: 0.36, hw: 24, dish: 0.6, shoulder: 0.42, gul: 5.5, gw: 9.5, gAmp: 13, rollA: 0, rollL: 40, mog: 0, forest: 0.8, glade: 0, powder: 0.3, ridge: 0, mean: 0.5, kick: 0, enc: 0, gU: 0 },
  kickers: { slope: 0.35, hw: 28, dish: 1.0, shoulder: 0.34, gul: 0, gw: 14, gAmp: 0, rollA: 0, rollL: 40, mog: 0, forest: 0.75, glade: 0, powder: 0.3, ridge: 0, mean: 0.5, kick: 1, enc: 0, gU: 0 },
  powder:  { slope: 0.42, hw: 46, dish: 2.2, shoulder: 0.30, gul: 0, gw: 14, gAmp: 0, rollA: 0.5, rollL: 60, mog: 0, forest: 0.45, glade: 0.12, powder: 1, ridge: 0, mean: 0.9, kick: 0, enc: 0, gU: 0 },
  ridge:   { slope: 0.30, hw: 14, dish: -0.8, shoulder: 0.30, gul: 0, gw: 14, gAmp: 0, rollA: 0.5, rollL: 46, mog: 0, forest: 0.15, glade: 0, powder: 0.2, ridge: 1, mean: 0.45, kick: 0, enc: 0, gU: 0 },
  moguls:  { slope: 0.40, hw: 22, dish: 1.4, shoulder: 0.38, gul: 0, gw: 14, gAmp: 0, rollA: 0, rollL: 40, mog: 1, forest: 0.8, glade: 0, powder: 0.1, ridge: 0, mean: 0.6, kick: 0, enc: 0, gU: 0 },
  // (经典编排 only: a narrow lane through tall forest that winds, the trees close at its edges; never dealt on a random mountain)
  corridor: { slope: 0.2, hw: 13, dish: 0.9, shoulder: 0.5, gul: 0, gw: 14, gAmp: 0, rollA: 0.3, rollL: 32, mog: 0, forest: 1.0, glade: 0, powder: 0.5, ridge: 0, mean: 0.4, kick: 0, enc: 1, gU: 0 },
};
const SEG_KEYS = ['slope', 'hw', 'dish', 'shoulder', 'gul', 'gw', 'gAmp', 'rollA', 'rollL', 'mog', 'forest', 'glade', 'powder', 'ridge', 'mean', 'kick', 'enc', 'gU'];
const SEG_NAMES = { bowl: '开阔大坡', steeps: '陡坡', glade: '树林', rollers: '起伏', gully: '雪槽', kickers: '跳台', powder: '深粉雪', ridge: '山脊', moguls: '蘑菇', corridor: '林道' };
// how fast each kind of run is covered (metres of mountain per second, measured with the test pilot, who weaves): its length is set so
// that it lasts about half a minute
// (re-measured for the feel the owner chose, 2026-11-13 (Variants 'feel' b: deep powder drags, a hard turn at speed washes out): the
// pilot's speed on two fixed mountains, scaled from the old figures by b over a)
const SEG_PACE = { bowl: 18.7, steeps: 28.6, glade: 11.6, rollers: 14.1, gully: 14.6, kickers: 17.0, powder: 10.8, ridge: 21.2, moguls: 15.3, corridor: 12.5 };
// ---- the richer mountain (Variants 'terr' b) and how much of it there is (Variants 'tdiff': 轻松 / 标准 / 野雪). With 'terr' a the
// mountain is the one it always was, to the last bit, whatever 'tdiff' says. With b three things come onto it, each from a random stream of
// its own, so the deck, the runs and the jumps of a seed stay what they are:
//   the pitch changes along the run: a run is no longer one even slope but steeper and easier pitches, with a rollover where it steepens
//   (the snow drops out of sight beyond it) and a bench where it eases, the same fall over the whole run;
//   the run is no longer the same on both sides: stretches where it leans to one side (off-camber) and stretches where one edge curls up
//   into a natural wall (a side hit) to ride up and come back down;
//   rock: snow-capped boulders along the edges and out on the open runs, and small drops, a snow-covered ledge with a soft landing below. A drop
//   never spans the run: there is always a way round, and the first turns of a mountain are free of them.
// tdiff scales all of it, and the run itself: slope and width. Every level keeps a clean line down; nothing here moves the camera.
const TERR_LV = {
  //   slope  width pitch  tilt   bank  drops  dropH       rocks islands mogul  pace (how far a run of ~30 s reaches at this level: test pilot, 2026-11-14)
  a: { slope: 0.82, hw: 1.22, pitch: 0.22, tilt: 0.035, bank: 1.4, drops: 0, dropH: [0, 0], rocks: 0.5, isl: 0.6, mog: 0.75, pace: 0.81, lanes: 0.8 },
  b: { slope: 1.00, hw: 1.00, pitch: 0.42, tilt: 0.075, bank: 2.8, drops: 0.6, dropH: [1.2, 2.0], rocks: 1.0, isl: 1.0, mog: 1.0, pace: 0.93, lanes: 1.4 },
  c: { slope: 1.10, hw: 0.86, pitch: 0.60, tilt: 0.12, bank: 4.0, drops: 1.4, dropH: [1.8, 3.5], rocks: 1.6, isl: 1.4, mog: 1.2, pace: 1.04, lanes: 2.0 },
};
// how much of each the kinds of run take (pitch, sides, rock): busy or narrow runs less, the open ones more
const TERR_K = {
  bowl: [1, 1, 1], steeps: [0.7, 0.6, 0.5], glade: [0.9, 0.7, 0.8], rollers: [0.5, 0.8, 0.8], gully: [0.9, 0.4, 0.6],
  kickers: [0.4, 0.5, 0.4], powder: [1, 0.9, 1.2], ridge: [0.8, 0, 0.3], moguls: [0.6, 0.6, 0.3], corridor: [0.5, 0, 0.3],
};
if (typeof Variants !== 'undefined') {
  Variants.def('terr', '地形', [['a', '原来'], ['b', '丰富']], 'b');
  Variants.def('tdiff', '地形难度', [['a', '轻松'], ['b', '标准'], ['c', '野雪']], 'b');
  // how steep the mountain is (owner, 2026-11-14: make the slope a choice. The review found the runs steeper than real ones: a bowl about
  // 20 degrees, a red run, and the steeps about 31, a steep black, so a skier just weaving runs at 80-120 km/h, where a real one averages
  // 40-45). a: as it was. b: real piste pitches (x0.75: a bowl about 15 degrees, a blue-red; the steeps about 24, a black). c: gentle
  // (x0.6: the steeps about 20 degrees). Every run's fall is scaled, nothing else: the deck, the features and their places stay the
  // same random draws, and speed falls by physics alone (no brakes anywhere). On top of 地形难度 (whose levels scale slope as well)
  Variants.def('slope', '坡度', [['a', '原来'], ['b', '真实雪道'], ['c', '平缓']], 'a');
  // 雪道 (owner, 2026-11-17: the mountain is fixed now, so make its run a designed, classic one, and lay it out like a Chinese garden: it winds,
  // the view is hidden and then given back, sometimes you are down inside the trees or the land). a: the runs dealt from the seed as before.
  // b: 经典编排, the first lap is a set order of stations (ROUTE below) that alternates 藏 (a winding lane closed in by forest, a deep U
  // gully) and 露 (out onto a crest that looks down the valley at the city in the clouds), then the dealt runs carry on as before.
  // Live for everyone since 2026-11-17 (owner: 合并上线).
  Variants.def('route', '雪道', [['a', '随机'], ['b', '经典编排']], 'b');
  // 雪道清障 (owner, 2026-11-17: no trees in the middle of the U gully). The lone groups of trees out on the run were placed knowing nothing of
  // the lines the run is built round, so they stood on the gully's floor, in a jump's run-in and landing and in the mogul field's smooth
  // channel. b keeps those lines clear. a: as it was
  Variants.def('rclear', '雪道清障', [['a', '原来'], ['b', '雪道上无树']], 'b');
  // (a change lays the same mountain out again)
  Variants.on((n, v, init) => { if (!init && (n === 'terr' || n === 'tdiff' || n === 'slope' || n === 'route' || n === 'rclear') && typeof App !== 'undefined' && App.ready && App.newMountain) App.newMountain(Course.seed); });
}
// slope scale and how much further a run of ~30 s then reaches (pace: the test pilot's distance over 30 s against a, 2026-11-14)
const SLOPE_K = { a: { k: 1, pace: 1 }, b: { k: 0.75, pace: 0.89 }, c: { k: 0.6, pace: 0.69 } };
const HREF_SLOPE = 0.36;        // reference plane removed from heights before they go into float textures
const TREE_CELL = 4.5;

const Course = ((vn1, vn2, h2U) => {
  const C = { seed: 261111, segs: [], feats: new Map(), mogK: 1, rockCap: 0, rich: false, lv: 'b', isl: 1 };
  // the shape of a mogul field (owner, 2026-11-14: are the bumps too tall and too close together? What do real ones look like?).
  // L: metres from one row of bumps to the next down the fall line; W: across; H: crest over trough of an average bump (big scales it
  // B0..B0+B1); Q: where in a row the crest stands (the rest is the short steep face below); R: how round the crown is; J: how far rows wander.
  // a: as it was (a dense field of tall, pointed bumps: 0.5-1.3 m, faces to about 40 degrees). b: a resort field skiers made, as measured
  // (Physics Today: natural moguls about 5.7 m apart, a checkerboard; 0.4-0.8 m tall): lower, rounder, a little uneven. c: a built FIS
  // course (moguls about 3.5-4 m apart down the line, 26-28 degree pitch), close, tall and regular
  Variants.def('mogf', '蘑菇形状', [['a', '原来'], ['b', '雪场'], ['c', '比赛']], 'b');
  const MOGF = {
    a: { L: 5.2, W: 4.2, H: 0.92, B0: 0.58, B1: 0.84, Q: 0.62, R: 0, J: 0.13, I: 1 },
    b: { L: 5.6, W: 5.0, H: 0.58, B0: 0.65, B1: 0.7, Q: 0.58, R: 0.7, J: 0.22, I: 1 },
    c: { L: 3.7, W: 4.0, H: 0.8, B0: 0.88, B1: 0.24, Q: 0.55, R: 0.6, J: 0.04, I: 1 },
  };
  const FEATS = C.feats;      // (the module's own map; C.feats is swapped for a lap-aware view while the mountain loops: C.setLoop)
  const CH = 2048, NF = 20;       // metres per cache chunk, fields per metre
  const F = { baseY: 0, cx: 1, hw: 2, dish: 3, shoulder: 4, gul: 5, gw: 6, goff: 7, roll: 8, mog: 9, forest: 10, glade: 11, powder: 12, ridge: 13, wall: 14, rtail: 15, tilt: 16, bank: 17, enc: 18, gU: 19 };
  const chunks = new Map();
  // Adjacent terrain texels query the same nine tree cells for ambient occlusion.
  const nearbyCells = new Array(64 * 64);
  let rng = RNG(C.seed), planned = 0, lastTypes = [], deck = [], pairs = [];
  let LV = null, trng = rng;      // the richer mountain: its level (TERR_LV) or null for the mountain as it was, and its own random stream
  // running integrals carried across chunks
  const integ = new Map();   // chunkIndex -> {baseY, rollPh, gPh} at chunk start

  // ---- one number makes the mountain. C.seed is that number (1..999999); outside dev it stays HOME (寒烟山). KEY is that number hashed, and every
  // random choice in this module hangs on it: the deck of runs (rng, toss), every noise field, every hash. For seed HOME the key is 0, which
  // leaves each of them exactly what it was when there was only one mountain: HOME (the test harness boots on it) is that mountain's ground
  // to the last bit, its runs in the order deal() gives them now; with C.classic set, in the order they had: the first mountain itself.
  const HOME = 261111, FIRST = 20261111;
  let KEY = 0, KZ = 0;
  // the helpers of 00_util.js, keyed. They shadow the plain ones for everything below, so no call site needs to know: a field's tag is
  // mixed with the key (four fields are tagged C.seed + k: those go back onto the first mountain's own number first), and the grid of
  // hashes (tree cells, the size of each bump) is read from another part of the same endless sheet
  const vnoise1 = (x, s) => vn1(x, (s < C.seed ? s : s - C.seed + FIRST) ^ KEY), vnoise2 = (x, y, s) => vn2(x, y, s ^ KEY), hash2U = (a, b) => h2U(a + KEY, b + KZ);
  // lay the mountain out again from seed n (anything that is not a number from 1 up: the same mountain again). Whoever keeps things made
  // from the course (terrain, trees, tracks, the game) has to be told: App.newMountain does all of that
  C.setSeed = function (n) {
    n = Math.floor(+n); if (n >= 1) C.seed = (n - 1) % 999999 + 1;
    KEY = hashU(C.seed) ^ hashU(HOME); KZ = Math.imul(KEY, 0x9e3779b1);
    C.segs = []; FEATS.clear(); chunks.clear(); integ.clear(); rng = RNG(FIRST ^ KEY); planned = 0; lastTypes = []; deck = []; pairs = [];
    nearbyCells.fill(undefined);
    hand = []; dealt = []; toss = RNG(KEY + TOSS);
    const tv = typeof Variants !== 'undefined' ? Variants.val : {};
    C.lv = TERR_LV[tv.tdiff] ? tv.tdiff : 'b'; LV = tv.terr === 'b' ? TERR_LV[C.lv] : null; C.rich = !!LV; C.isl = LV ? LV.isl : 1;
    trng = RNG((KEY ^ 0x7e4a11) + 131 * C.lv.charCodeAt(0));
    C.route = tv.route === 'b'; C.rclear = tv.rclear === 'b';
    planTo(4000);
    return C.seed;
  };
  C.reset = C.setSeed;
  // Official mountains (id, seed, Chinese name, English name). Play opens on the first, 寒烟山. `released` ones are offered in 滑过的山;
  // a mountain the player has skied stays on their list too. A later mountain is another entry here.
  C.mountains = [
    { id: 'hanyan', seed: HOME, zh: '寒烟山', en: 'Mount Cold Smoke', released: true },
  ];
  C.mountainBySeed = n => { const s = n == null ? C.seed : Math.floor(+n) || 0; return C.mountains.find(q => q.seed === s) || null; };
  C.mountainName = n => { const m = C.mountainBySeed(n); return m ? m.zh : ''; };

  // ---- 经典编排 (Variants 'route' b): the first lap of the mountain is laid out by hand, station by station, the way a Chinese garden leads a
  // walker: the view is screened before it is given (欲扬先抑), the way winds so that what lies ahead is hidden (曲径通幽), each turn shows
  // something else (步移景异), and the far country, the city standing in the cloud sea, is borrowed into the picture at the moments the run
  // opens toward it (借景). 藏: a lane through tall forest that winds (corridor), a U gully with walls taller than the lens. 露: out of the
  // trees onto a crest, the run swung round to face the city. Each station: type; sec (seconds it lasts, about); wind (how far the run
  // swings either way in its S bends, rad) and lam (metres from one bend to the next of the same hand); aim (the run turns to face the city);
  // U (the gully as a U with a flat floor and steep walls). After the last station the dealt runs carry on as on any mountain.
  const AIM = 0.14;        // the city in the clouds stands this far (rad) to the right of straight down the mountain (16_vista.js V.cityAz)
  const ROUTE = [
    { type: 'bowl' },                                            // 起点：开阔大坡，看得见云海和城（露），标题页也在这里
    { type: 'corridor', sec: 26, wind: 0.5, lam: 240 },          // 入林：窄道、S 弯、高树贴着道边（藏）
    { type: 'steeps', aim: 1 },                                  // 出林：坡顶一翻，整条山谷和城一下子都在眼前（露）
    { type: 'glade', enc: 0.45, wind: 0.25, lam: 300 },          // 树林：树间漏出远景（半藏）
    { type: 'kickers' },                                         // 跳台
    { type: 'gully', U: 1, wind: 0.3, lam: 360, sec: 32 },       // U 型雪槽：墙比镜头高，槽顶一排树框住天（藏）
    { type: 'ridge', aim: 1 },                                   // 山脊：最大的一次开阔（露）
    { type: 'moguls' },                                          // 蘑菇：平滑通道保留
    { type: 'corridor', sec: 22, wind: 0.55, lam: 220 },         // 第二段林道，弯更急（藏）
    { type: 'powder', aim: 1 },                                  // 出林到粉雪大坡（露）
    { type: 'rollers', enc: 0.3, wind: 0.2, lam: 300 },          // 林间起伏：每个坡顶一藏一露
    { type: 'steeps', enc: 0.6, wind: 0.32, lam: 300 },          // 收尾：林中陡槽，窄、急、看不远（藏），出去就是下一圈的开阔
  ];
  C.ROUTE = ROUTE;
  function routeType() { const st = ROUTE[C.segs.length]; dealt.push(st.type); hand = []; return st.type; }
  // which way the run heads at s (rad off straight down the mountain, + toward +x), for the designed mountain: a slow wander of its own, and on
  // a station the S bends it asks for, or the turn toward the city. A station's bends grow in after its start and die away before its end,
  // and where two stations meet the two headings are blended over TR, as everything else is
  const headFree = s => 0.3 * vnoise1(s / 560 + 3.7, C.seed + 61) + 0.1 * vnoise1(s / 190 + 1.3, C.seed + 62);
  function headSeg(sg, s) {
    const f = headFree(s), st = sg.st; if (!st) return f;
    if (st.aim) return AIM + 0.25 * f;
    if (!st.wind) return f;
    const env = smooth(sg.s0 - 20, sg.s0 + 80, s) * (1 - smooth(sg.s0 + sg.len - 80, sg.s0 + sg.len + 20, s));
    return 0.35 * f + st.wind * env * Math.sin(TAU * (s - sg.s0) / st.lam + sg.ph);
  }
  function headAt(s) {
    const sg = segAt(s), a = headSeg(sg, s), d0 = s - sg.s0, d1 = sg.s0 + sg.len - s;
    if (d0 < TR / 2 && sg.idx > 0) { const t = 0.5 - 0.5 * smoother(0, TR / 2, d0); return a + (headSeg(C.segs[sg.idx - 1], s) - a) * t; }
    if (d1 < TR / 2) { if (sg.idx + 1 >= C.segs.length) planTo(s + 3000); const t = 0.5 - 0.5 * smoother(0, TR / 2, d1); return a + (headSeg(C.segs[sg.idx + 1], s) - a) * t; }
    return a;
  }

  // ---- the deal: which kind of run comes next. A deck holds every kind once and the two that bring speed and air, steeps and kickers,
  // twice. It is shuffled and played in that order, each time the first card that keeps the rules, and shuffled again if it will not go out:
  //   never one slow kind (glade, moguls, rollers, powder) straight after another;
  //   no kind again before five others have passed (three for the two that come twice), and those two once in each half of the deck;
  //   the mountain opens with the bowl, and its second or third run is the steeps: the first minute already has speed in it;
  //   and no join of the last deck over again (the one rule that is let go, when sixty shuffles have not kept it).
  // (DECK is written in an order that keeps the first three after any deck: what is played should no shuffle ever go out.)
  // It has a stream of its own (toss): what rng draws after it, the length of each run and its jumps, does not depend on how it deals.
  const DECK = 'steeps,glade,kickers,moguls,gully,rollers,steeps,bowl,powder,kickers,ridge'.split(','), SLOW = { glade: 1, moguls: 1, rollers: 1, powder: 1 }, TWICE = { steeps: 1, kickers: 1 }, TOSS = 57;
  let hand = [], dealt = [], toss = rng;
  function deal() {
    if (!dealt.length) hand = ['bowl'];
    else if (!hand.length) {
      const first = dealt.length === 1, half = first ? 4 : 5, was = dealt.slice(-12).join('>'), at = first && toss() < 0.5 ? 0 : 1;
      for (let n = 0; ; n++) {
        const pool = DECK.filter(t => t !== 'bowl' || !first), a = dealt.slice(-5); hand = [];
        if (n > 600) { hand = pool; break; }
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(toss() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
        const fits = t => {
          const i = hand.length, p = a[a.length - 1];
          return !(SLOW[t] && SLOW[p]) && !a.slice(TWICE[t] ? -3 : -5).includes(t) && !(TWICE[t] && (i < half) === hand.includes(t))
            && !(first && i < 2 && (i === at) !== (t === 'steeps')) && !(n < 60 && was.includes(p + '>' + t));
        };
        for (let k; (k = pool.findIndex(fits)) >= 0;) { const t = pool.splice(k, 1)[0]; hand.push(t); a.push(t); }
        if (!pool.length) break;
      }
    }
    const t = hand.shift(); dealt.push(t); return t;
  }

  function planTo(sEnd) {
    while (planned < sEnd) {
      // every kind of run comes round once before any comes again (a shuffled deck), never before five others have passed, and where
      // there is a choice not straight after the kind it followed last time (so no stretch of the mountain is the last lap over again)
      let type;
      if (C.segs.length === 0) type = 'bowl';
      else {
        if (!deck.length) { deck = Object.keys(SEG_TYPES).filter(t => !SEG_TYPES[t].enc); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; } if (C.segs.length === 1) deck.splice(deck.indexOf('bowl'), 1); }
        const prev = lastTypes[lastTypes.length - 1]; let k = -1;
        for (let i = deck.length - 1; i >= 0; i--) { if (lastTypes.includes(deck[i])) continue; if (k < 0) k = i; if (!pairs.includes(prev + '>' + deck[i])) { k = i; break; } }
        if (k < 0) k = deck.length - 1;
        type = deck.splice(k, 1)[0]; pairs.push(prev + '>' + type); if (pairs.length > 18) pairs.shift();
      }
      // (that was the deal of the first mountain. It still runs, so that rng goes on drawing what it drew, but it is played only when
      // C.classic asks for that mountain's own order: the test scripts' way back to the mountain as it was delivered)
      if (!C.classic) type = C.route && C.segs.length < ROUTE.length ? routeType() : deal();
      if (C.forceType) type = C.forceType;
      lastTypes.push(type); if (lastTypes.length > 5) lastTypes.shift();
      const base = SEG_TYPES[type], p = {}, v = () => 0.85 + rng() * 0.3;
      for (const k of SEG_KEYS) p[k] = base[k];
      p.slope *= 0.93 + rng() * 0.14; p.hw *= v(); p.rollL *= v(); p.rollA *= v(); p.gAmp *= v(); p.gul *= v(); p.mean *= v();
      if (LV) { p.slope = Math.min(0.68, p.slope * LV.slope); p.hw *= LV.hw; p.mog *= LV.mog; p.rollA *= Math.min(1, LV.slope); }
      const SK = SLOPE_K[(typeof Variants !== 'undefined' && Variants.val.slope) || 'a'] || SLOPE_K.a;
      if (SK.k !== 1) p.slope *= SK.k;
      let len = C.segs.length === 0 ? 590 : SEG_PACE[type] * (27 + rng() * 6);       // about half a minute each
      if (LV && C.segs.length) len *= LV.pace;
      if (SK.pace !== 1 && C.segs.length) len *= SK.pace;
      const st = C.route && C.segs.length < ROUTE.length ? ROUTE[C.segs.length] : null;
      if (st) {
        if (st.sec && C.segs.length) len *= st.sec / 30;
        if (st.enc) p.enc = st.enc;
        if (st.U) { p.gU = 1; p.gul = 6 * (0.92 + 0.16 * rng()); p.gw = 10; p.gAmp = 8; p.forest = 0.9; p.enc = 0.5; }
      }
      const seg = { type, s0: planned, len, p, idx: C.segs.length, seed: (rng() * 1e9) | 0 };
      if (st) { seg.st = st; seg.ph = rng() < 0.5 ? 0 : PI; }
      C.segs.push(seg);
      if (p.kick > 0) {   // a line of jumps down the middle, alternating sides slightly; a pair of young spruce marks each lip (mark)
        const n = Math.floor((len - 160) / 105);
        for (let i = 0; i < n; i++) addFeat({ s: seg.s0 + 90 + i * 105 + rng() * 20, u: (rng() - 0.5) * 14, len: 17 + rng() * 4, wid: 11.5 + rng() * 3, h: 2.0 + rng() * 0.7, kind: 'kicker', mark: true });
      }
      if (type === 'rollers' || type === 'powder' || type === 'bowl' && C.segs.length > 1) {
        const n = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < n; i++) addFeat({ s: seg.s0 + 120 + rng() * (len - 240), u: (rng() - 0.5) * 30, len: 12, wid: 10, h: 1.1 + rng() * 0.6, kind: 'kicker' });
      }
      if (LV) enrich(seg, type);
      planned += len;
    }
  }
  // ---- the richer mountain (Variants 'terr' b): what one run gets, all drawn from trng
  function enrich(seg, type) {
    const k = TERR_K[type], p = seg.p, r = trng, s1 = seg.s0 + seg.len, from = seg.idx === 0 ? 240 : seg.s0 + 50, to = s1 - 60;
    // the pitch: easier and steeper stretches one after another, each 60-150 m. Where it steepens the snow rolls over (drawn out over
    // 24-38 m: quicker, it threw a fast skier metres into the air), where it eases it is drawn out too (a bench, no slam into it). The stretches are scaled so the run falls as
    // far as it did; no stretch is steeper than 36 degrees or flat enough to stall on
    const A = LV.pitch * k[0];
    if (A > 0.01) {
      const pk = []; let s = from + r() * 30, up = r() < 0.5 ? 1 : -1;
      while (s < to - 60) { pk.push({ s, m: 1 + up * A * (0.55 + 0.45 * r()), tl: up > 0 ? 24 + r() * 14 : 18 + r() * 16 }); s += 60 + r() * 90; up = -up; }
      if (pk.length) {
        pk.push({ s: Math.min(s, to), m: 1, tl: 24 });
        let a = 0, w = 0; for (let i = 0; i < pk.length - 1; i++) { const L = pk[i + 1].s - pk[i].s; a += pk[i].m * L; w += L; }
        for (let i = 0; i < pk.length - 1; i++) pk[i].m = clamp(pk[i].m * w / a, 0.16 / p.slope, 0.72 / p.slope);
        seg.pk = pk;
      }
    }
    // the sides: stretches of 70-150 m that are plain, lean to one side (off-camber), or have one edge curled up into a wall (a side hit)
    if (k[1] > 0) {
      const xs = []; let s = from + r() * 40;
      while (s < to - 50) {
        const q = r(), a = r() < 0.5 ? -1 : 1, b = r() < 0.5 ? -1 : 1, ta = 0.6 + 0.4 * r(), tb = 0.6 + 0.4 * r();
        xs.push({ s, tilt: q > 0.3 && q < 0.6 || q > 0.9 ? a * LV.tilt * k[1] * ta : 0, bank: q > 0.6 ? b * LV.bank * k[1] * tb : 0 });
        s += 70 + r() * 80;
      }
      if (xs.length) { xs.push({ s: Math.min(s, to), tilt: 0, bank: 0 }); seg.xs = xs; }
    }
    // rock. Drops first: a ledge 8-15 m wide set toward one edge (the rest of the run goes round it), a run-in that rises gently
    // onto it, and below the face a landing that is steeper than the run, so the skis come down along the snow, not onto it
    const R = LV.rocks * k[2];
    if (LV.drops > 0 && k[2] >= 0.6 && p.hw > 20 && !p.kick) {
      const n = Math.floor(LV.drops * k[2] + r());
      for (let i = 0; i < n; i++) {
        const D = LV.dropH[0] + r() * (LV.dropH[1] - LV.dropH[0]), wid = 8 + r() * 7, side = r() < 0.5 ? -1 : 1;
        const u = side * (p.hw - wid * 0.5 - 2 - r() * 5), sl = Math.max(from + 60, 700) + r() * Math.max(1, to - Math.max(from + 60, 700) - 60);
        if (sl > to - 60) continue;
        if (busy(sl - 80, sl + 50, u, wid * 0.5 + 6)) continue;
        addFeat({ s: sl - 40, len: 58, lip: sl, u, wid, h: D, kind: 'drop' });
      }
    }
    // boulders, capped with snow: most along the edges of the run, some out on it (never down its middle). The uphill side is long and
    // rounded, so a skier who rides onto one is lifted off it, not stopped; the sides and the downhill face are steep, and that is where
    // the rock shows
    if (R > 0.01) {
      const n = Math.floor(R * (seg.len / 110) * (0.6 + 0.8 * r()));
      for (let i = 0; i < n; i++) {
        let sc = from + r() * Math.max(1, to - from), edge = r() < 0.7 || p.hw < 24 || C.lv === 'a', side = r() < 0.5 ? -1 : 1;
        const g = r() < 0.3 ? 2 + Math.floor(r() * 2) : 1;
        let u = side * (edge ? p.hw * (0.66 + 0.3 * r()) : p.hw * (0.36 + 0.32 * r()));
        for (let j = 0; j < g; j++) {
          const rad = 1.2 + 1.8 * r(), h = (0.5 + 0.9 * r()) * (C.lv === 'c' ? 1.3 : 1) * Math.min(1, rad / 1.6);
          // (fewer than were first laid out, and almost none out on the run: every other group along the edges is left out, and of those out
          // on the run only a third on 野雪. The draws are all still made, so everything laid out after them stays where it was. Along the
          // edges they are not rock at all but mounds of firm, wind-packed snow, the stuff moguls are made of: f.snow, no rock shows)
          const keep = edge ? (i & 1) === 0 : C.lv === 'c' && i % 3 === 0;
          if (keep && !busy(sc - rad - 6, sc + rad + 6, u, rad + 3)) addFeat({ s: sc - 2.2 * rad, len: 3.4 * rad, cs: sc, u, rad, h: edge ? h * 0.75 : h, kind: 'rock', snow: edge });
          sc += (r() - 0.3) * 7; u += (r() - 0.5) * 6;
        }
      }
    }
    // other ways down: lanes that leave the run, go their own way for a while beside it and come back. Each is a clear way through the
    // forest of the apron (no trees on it, its own floor: the banks climb only beyond its edges), so whatever opening a skier sees, it goes
    // on down. Some are narrow ways among the trees, some are a gully with walls to ride. One or two on each side at a time, never on a ridge
    if (k[1] > 0 && seg.len > 260) {
      // (on each side a chain of lanes, one after another; the harder levels add a second, further out. LV.lanes: how many layers, the
      // fraction the chance that each lane of the last one is there at all)
      const ln = [];
      for (const side of [-1, 1]) for (let layer = 0; layer < Math.ceil(LV.lanes); layer++) {
        const pr = layer + 1 <= LV.lanes ? 1 : LV.lanes - layer;
        let s = seg.s0 + (seg.idx ? 10 : 260) + r() * 60;
        while (s < s1 - 120) {
          const L = 180 + r() * 200, kind = r() < 0.4 ? 'gully' : 'trees', w = kind === 'gully' ? 6 + r() * 3 : 4.5 + r() * 4;
          const off = side * (p.hw + w + 10 + r() * 14 + layer * (26 + r() * 12)), there = r() < pr;
          if (there) ln.push({ s0: s, s1: s + L, off, w, kind, ph: r() * 50, L1: 55 + r() * 30, L2: 60 + r() * 30 });
          s += L + 30 + r() * 90;
        }
      }
      if (ln.length) seg.ln = ln;
    }
  }
  // the lanes beside the run at s (null if none), and for one of them where its middle is, as an offset from the run's centre line
  // (a lane may run on past the end of its own run, into the next: a run's lanes are those it laid out and those of the run before)
  function lanesAt(s) { const sg = segAt(s); if (sg.lnAll === undefined) { const pv = sg.idx ? C.segs[sg.idx - 1].ln || [] : []; const a = (sg.ln || []).concat(pv); sg.lnAll = a.length ? a : null; } return sg.lnAll; }
  const laneU = (l, s) => l.off * smooth(l.s0, l.s0 + l.L1, s) * (1 - smooth(l.s1 - l.L2, l.s1, s)) + 5 * vnoise1(s / 85 + l.ph, 84) * smooth(l.s0, l.s0 + l.L1 * 1.5, s) * (1 - smooth(l.s1 - l.L2 * 1.5, l.s1, s));
  // how far beyond the nearest way down a point is: the edge of the run, or of a lane beside it (metres, negative inside). _lg: how deep in a
  // gully lane the point lies (0..1)
  let _lg = 0, _lb = 0, _lh = 0;
  function edgeE(s, u, e, hw) {
    _lg = 0; _lb = 0; _lh = 0; const e0 = e; const ln = LV ? lanesAt(s) : null; if (!ln) return e;
    for (let i = 0; i < ln.length; i++) {
      const l = ln[i]; if (s < l.s0 || s > l.s1) continue;
      const ul = laneU(l, s), d = Math.abs(u - ul), el = d - l.w;
      // (the island and the gully's trough come and go along the whole of the lane's leaving and its return, never faster: grown only as
      // fast as the lane moved out, they rose a metre or more in a few metres of run, a ramp beside the edge that threw a skier)
      const ks = smooth(l.s0 + 0.2 * l.L1, l.s0 + 1.3 * l.L1, s) * (1 - smooth(l.s1 - 1.3 * l.L2, l.s1 - 0.2 * l.L2, s));
      // (the nearer of the two edges, but rounded where they are about as near: a plain min has a crease along the middle of an island,
      // and everything laid on e (the apron's rise, the banks) would stand up into a sharp crest there, which throws a skier crossing it)
      { const k = 8, q = Math.max(0, k - Math.abs(e - el)) / k; e = Math.min(e, el) - q * q * k * 0.25; }
      // (between the run and a lane that has left it: an island. _lh: its swell, round from one edge to the other, highest in the middle
      // and never steeper than a gentle roll, so crossing it lifts a skier no more than a wave in the snow)
      if (e0 > 0 && el > 0 && u * ul > 0 && Math.abs(u) < Math.abs(ul)) {
        const k = smooth(hw, hw + l.w + 8, Math.abs(ul)) * ks, W = e0 + el; _lb = Math.max(_lb, k);
        _lh = Math.max(_lh, k * (4 * e0 * el / (W * W)) * Math.min(1, W / 36));
      }
      // (a gully lane is a trough only once it is clear of the run: it shallows out as it leaves and as it comes back, never cuts the run)
      if (l.kind === 'gully' && d < l.w * 2.6) { const q = d / (l.w * 1.35); _lg = Math.max(_lg, Math.exp(-q * q) * smooth(l.w * 2.6, l.w * 1.5, d) * smooth(hw + 2, hw + 2 * l.w + 6, Math.abs(ul)) * ks); }
    }
    return e;
  }
  // the ways down at s, as offsets from the run's centre line: the run (0) and each lane that has left it by then (for test pilots)
  // (the same lanes with what each is: { u, kind 'gully' | 'trees', w half-width }, for whoever lays a way through them: 92_rings.js 越野线)
  C.waysK = function (s) { const out = [], ln = LV ? lanesAt(s) : null; if (ln) for (const l of ln) if (s > l.s0 + 20 && s < l.s1 - 20) out.push({ u: laneU(l, s), kind: l.kind, w: l.w }); return out; };
  C.ways = function (s) { const out = [0], ln = LV ? lanesAt(s) : null; if (ln) for (const l of ln) if (s > l.s0 + 20 && s < l.s1 - 20) out.push(laneU(l, s)); return out; };
  // (for the game) how far off any way down the skier is: 0 or less on the run or in a lane
  C.offRun = function (x, z) { const s = -z, c = at(s, _py), u = x - c.cx; return edgeE(s, u, Math.abs(u) - c.hw, c.hw); };
  // anything already standing within [sa, sb] down the run and `room` metres of u across it?
  function busy(sa, sb, u, room) {
    for (let b = Math.floor((sa - 30) / 32); b <= Math.floor(sb / 32); b++) for (const f of FEATS.get(b) || []) {
      const fa = f.s, fb2 = f.s + f.len, half = f.kind === 'rock' ? f.rad : (f.wid || 10) * 0.5;
      if (fb2 > sa && fa < sb && Math.abs(f.u - u) < room + half) return true;
    }
    return false;
  }
  // the pitch at s, as a factor on the run's own slope (1 where nothing was laid out)
  function pitchAt(s) {
    const pk = segAt(s).pk; if (!pk) return 1;
    let m = 1;
    for (let i = 0; i < pk.length; i++) { const q = pk[i], h = q.tl * 0.5; if (s < q.s - h) break; const m0 = i ? pk[i - 1].m : 1; m = m0 + (q.m - m0) * smooth(q.s - h, q.s + h, s); }
    return m;
  }
  // the sides at s: [lean across the run, height of the wall on one edge (signed: + on the right)], changing over 36 m
  const _sd = [0, 0];
  function sideAt(s) {
    const xs = segAt(s).xs; _sd[0] = 0; _sd[1] = 0; if (!xs) return _sd;
    for (let i = 0; i < xs.length; i++) {
      const q = xs[i]; if (s < q.s - 18) break;
      const w = smooth(q.s - 18, q.s + 18, s), t0 = i ? xs[i - 1].tilt : 0, b0 = i ? xs[i - 1].bank : 0;
      _sd[0] = t0 + (q.tilt - t0) * w; _sd[1] = b0 + (q.bank - b0) * w;
    }
    return _sd;
  }
  const dropLip = (f, du) => 1.6 * vnoise1(du / 3.3 + f.lip * 0.17, 81) + 0.6 * vnoise1(du / 1.1 + f.lip * 0.29, 82);
  // trees keep clear of a drop (its run-in, face and landing) and stand off a boulder
  function clearAt(s, u) {
    const fb = FEATS.get(Math.floor(s / 32)); if (!fb) return 1;
    let k = 1;
    for (let i = 0; i < fb.length; i++) {
      const f = fb[i];
      if (f.kind === 'drop') { if (s > f.s - 6 && s < f.s + f.len + 22) k = Math.min(k, smooth(f.wid * 0.5 + 4, f.wid * 0.5 + 10, Math.abs(u - f.u))); }
      else if (f.kind === 'rock') k = Math.min(k, smooth(f.rad + 0.5, f.rad + 3, Math.hypot(s - f.cs, u - f.u)));
    }
    return k;
  }
  // where a boulder shows bare rock (0..1; the terrain shader bares only what is steep within it). A drop stays snow: a ledge with a
  // rounded, wind-packed lip (bare rock on its face was tried and read as a dark slab)
  C.rockAt = function (x, z) {
    if (!LV) return 0;
    const s = -z, fb = FEATS.get(Math.floor(s / 32)); if (!fb) return 0;
    let u = null, k = 0;
    for (let i = 0; i < fb.length; i++) {
      const f = fb[i]; if (f.kind !== 'rock' || f.snow) continue;
      if (u === null) u = x - at(s, _py).cx;
      k = Math.max(k, smooth(1.2, 0.85, Math.hypot((s - f.cs) * (s < f.cs ? 0.45 : 1), u - f.u) / f.rad));
    }
    return k;
  };
  // (for the game) a boulder is something to go round, not a ramp: the skier's body is told only of a low swell where one stands (C.rockCap,
  // set while the physics asks), and where the drawn rock stands more than ROCK_WALL above the snow it is a wall, as a trunk is. rockHit
  // fills o with the point on that wall's foot nearest the skier and its outward normal, and returns the rock (null where there is none)
  const ROCK_WALL = 0.45;
  function rockQ0(f) {        // the q at which the drawn rock stands ROCK_WALL high (its profile falls from the middle out)
    if (f.q0 === undefined) { let a = 0, b = 1; for (let i = 0; i < 18; i++) { const q = (a + b) * 0.5, hr = f.h * (0.45 * Math.sqrt(1 - q * q) + 0.55 * smooth(1, 0.5, q)); if (hr > ROCK_WALL) a = q; else b = q; } f.q0 = f.h > ROCK_WALL ? a : 0; }
    return f.q0;
  }
  C.rockHit = function (x, z, o) {
    if (!LV) return null;
    const s = -z, fb = FEATS.get(Math.floor(s / 32)); if (!fb) return null;
    const c = at(s, _py), u = x - c.cx;
    for (let i = 0; i < fb.length; i++) {
      const f = fb[i]; if (f.kind !== 'rock' || f.snow) continue;
      const q0 = rockQ0(f); if (q0 <= 0) continue;
      const k = s < f.cs ? 0.45 : 1, ds = (s - f.cs) * k, du = u - f.u, q = Math.hypot(ds, du) / f.rad;
      if (q >= q0) continue;
      const g = q > 1e-4 ? q0 / q : 0, gs = q > 1e-4 ? ds : -1, gu = q > 1e-4 ? du : 0;
      o.x = c.cx + f.u + (q > 1e-4 ? du * g : 0); o.z = -(f.cs + (q > 1e-4 ? ds * g : -q0 * f.rad) / k);
      let nx = gu, nz = -gs * k; const l = Math.hypot(nx, nz) || 1; o.nx = nx / l; o.nz = nz / l; o.h = f.h;
      return f;
    }
    return null;
  };
  function addFeat(f) { const b0 = Math.floor((f.s - 4) / 32), b1 = Math.floor((f.s + f.len + 30) / 32); for (let b = b0; b <= b1; b++) { let a = FEATS.get(b); if (!a) FEATS.set(b, a = []); a.push(f); } }

  function segAt(s) {
    if (s < 0) return C.segs[0];
    if (s >= planned) planTo(s + 3000);
    let lo = 0, hi = C.segs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (C.segs[m].s0 <= s) lo = m; else hi = m - 1; }
    return C.segs[lo];
  }
  C.segAt = segAt;
  const TR = 90;   // transition length between segments (m)
  const APRON = 36;      // (the richer mountain) metres of open slope beside the run before its banks climb
  const _pp = {};
  function paramsAt(s, out) {
    const sg = segAt(s), a = sg.p; let b = null, t = 0;
    const d0 = s - sg.s0, d1 = sg.s0 + sg.len - s;
    if (d0 < TR / 2 && sg.idx > 0) { b = C.segs[sg.idx - 1].p; t = 0.5 - 0.5 * smoother(0, TR / 2, d0); }
    else if (d1 < TR / 2) { if (sg.idx + 1 >= C.segs.length) planTo(s + 3000); b = C.segs[sg.idx + 1].p; t = 0.5 - 0.5 * smoother(0, TR / 2, d1); }
    if (b) for (const k of SEG_KEYS) out[k] = a[k] + (b[k] - a[k]) * t; else for (const k of SEG_KEYS) out[k] = a[k];
    return out;
  }
  C.paramsAt = paramsAt;

  // the valley's walls belong to the mountain, not to the stretch of run below them: they stand at full height everywhere except along a
  // ridge, where they draw back, and that change is spread over the better part of a kilometre (a weighted mean of what the run does)
  function wallAt(s) {
    let a = 0, wt = 0;
    for (let k = -4; k <= 4; k++) { const w = 5 - Math.abs(k); a += w * paramsAt(s + k * 112.5, _pw).ridge; wt += w; }
    return 1 - 0.72 * a / wt;
  }
  const _pw = {};
  // the land well off a ridge (the flank and the side valley below it) does not end where the crest does: it goes on falling away for some
  // nine hundred metres below, rising back to the banks of the run that follows only as fast as the mountain falls. So the side valley
  // drains back toward the run instead of ending in a closed basin, and a skier who has gone down into it is led back by the land
  // (rtail: the ridge as it was up to that far above, fading with the distance)
  function tailAt(s) {
    let r = 0;
    for (let k = 0; k <= 36; k++) r = Math.max(r, paramsAt(s - k * 25, _pw).ridge * (1 - smooth(0, 900, k * 25)));
    return r;
  }
  function chunk(ci) {
    let c = chunks.get(ci); if (c) return c;
    // integrate from the previous chunk (build sequentially so running sums stay continuous)
    let st;
    if (ci === 0) st = { baseY: 0, rollPh: 0, gPh: 0, cxI: 0 };
    else if (ci < 0) { st = null; }
    else { if (!integ.has(ci)) chunk(ci - 1); st = integ.get(ci); }
    c = new Float32Array((CH + 1) * NF); const base64 = new Float64Array(CH + 1);
    if (ci < 0) {   // above the start: a plain constant slope so there is something behind the camera
      const p = paramsAt(0, _pp);
      for (let i = 0; i <= CH; i++) { const s = ci * CH + i, o = i * NF; base64[i] = -p.slope * s; c[o + F.cx] = C.route ? 0 : centre(0, p.mean); c[o + F.hw] = p.hw; c[o + F.dish] = p.dish; c[o + F.shoulder] = p.shoulder; c[o + F.gw] = p.gw; c[o + F.forest] = p.forest; c[o + F.powder] = p.powder; c[o + F.wall] = wallAt(Math.max(0, s)); c[o + F.rtail] = 0; }
    } else {
      let y = st.baseY, rph = st.rollPh, gph = st.gPh, cxI = st.cxI;
      // how tall the valley's walls stand: worked out every 32 m, the metres between are filled in below
      const W32 = new Float32Array(CH / 32 + 1); for (let j = 0; j <= CH / 32; j++) W32[j] = wallAt(ci * CH + j * 32);
      for (let i = 0; i <= CH; i++) { const j = Math.min(CH / 32 - 1, i >> 5), f = (i - j * 32) / 32; c[i * NF + F.wall] = W32[j] + (W32[j + 1] - W32[j]) * f; }
      const T32 = new Float32Array(CH / 32 + 1); for (let j = 0; j <= CH / 32; j++) T32[j] = tailAt(ci * CH + j * 32);
      for (let i = 0; i <= CH; i++) { const j = Math.min(CH / 32 - 1, i >> 5), f = (i - j * 32) / 32; c[i * NF + F.rtail] = T32[j] + (T32[j + 1] - T32[j]) * f; }
      for (let i = 0; i <= CH; i++) {
        const s = ci * CH + i, o = i * NF, p = paramsAt(s, _pp);
        base64[i] = y; c[o + F.cx] = C.route ? cxI : centre(s, p.mean); c[o + F.enc] = p.enc; c[o + F.gU] = p.gU; c[o + F.hw] = p.hw; c[o + F.dish] = p.dish; c[o + F.shoulder] = p.shoulder; c[o + F.gul] = p.gul; c[o + F.gw] = p.gw;
        c[o + F.goff] = p.gAmp * Math.sin(gph); c[o + F.roll] = p.rollA * Math.sin(rph); c[o + F.mog] = p.mog; c[o + F.forest] = p.forest; c[o + F.glade] = p.glade; c[o + F.powder] = p.powder; c[o + F.ridge] = p.ridge;
        if (LV) { const sd = sideAt(s), nr = 1 - p.ridge; c[o + F.tilt] = sd[0] * nr; c[o + F.bank] = sd[1] * nr; }
        // (经典编排) a lane's bends are banked: the snow on the outside of each bend is piled into a berm a skier can lean into and ride
        // round, as skiers' own turns build them on a narrow way through trees (the outside is the side the run turns away from)
        if (C.route && p.enc > 0.3) { const k = clamp((headAt(s + 6) - headAt(s - 6)) / 12 * 75, -1, 1); c[o + F.bank] += -2.2 * k * smooth(0.3, 0.8, p.enc); }
        if (i < CH) {
          const p2 = paramsAt(s + 0.5, _pp); if (LV) y -= p2.slope * pitchAt(s + 0.5); else y -= p2.slope; rph += TAU / p2.rollL; gph += TAU / (78 + 42 * p2.gU);
          // (经典编排: the centre line is the heading summed metre by metre, eased in over the first 300 m from straight down)
          if (C.route) cxI += Math.tan(clamp(headAt(s + 0.5), -0.9, 0.9)) * smooth(0, 300, s + 0.5);
        }
      }
      integ.set(ci + 1, { baseY: y, rollPh: rph, gPh: gph, cxI });
    }
    c.base64 = base64; chunks.set(ci, c);
    if (chunks.size > 12) { const k = chunks.keys().next().value; if (k !== ci) chunks.delete(k); }
    return c;
  }
  // course centreline: the valley winds. Broad bends a kilometre or so long that belong to the mountain (whatever the run is doing), and a
  // quicker wander on top that each kind of run has more or less of. So the view down the valley, and where the sun stands in it, keep changing
  const bend = (s) => 260 * vnoise1(s / 1300 + 3.7, C.seed), wander = (s) => 60 * vnoise1(s / 370 + 11.3, C.seed + 5);
  function centre(s, mean) { return (bend(s) - bend(0) + mean * (wander(s) - wander(0))) * smooth(0, 400, s); }
  // which way the valley runs at s: the angle of its centre line off straight down the mountain (radians, positive toward +x)
  const _py = {};
  C.yawAt = function (s) { const a = at(s - 5, _py).cx; return Math.atan2(at(s + 35, _py).cx - a, 40); };

  const cur = { baseY: 0, cx: 0, hw: 40, dish: 0, shoulder: 0.3, gul: 0, gw: 10, goff: 0, roll: 0, mog: 0, forest: 0, glade: 0, powder: 0, ridge: 0, wall: 1, rtail: 0, tilt: 0, bank: 0, enc: 0, gU: 0, s: 0 };
  function at(s, out) {
    out = out || cur;
    const ci = Math.floor(s / CH), c = chunk(ci), fs = s - ci * CH, i = Math.min(CH - 1, Math.floor(fs)), f = fs - i, o = i * NF, o2 = o + NF;
    out.baseY = c.base64[i] + (c.base64[i + 1] - c.base64[i]) * f;
    out.cx = c[o + 1] + (c[o2 + 1] - c[o + 1]) * f; out.hw = c[o + 2] + (c[o2 + 2] - c[o + 2]) * f; out.dish = c[o + 3] + (c[o2 + 3] - c[o + 3]) * f;
    out.shoulder = c[o + 4] + (c[o2 + 4] - c[o + 4]) * f; out.gul = c[o + 5] + (c[o2 + 5] - c[o + 5]) * f; out.gw = c[o + 6] + (c[o2 + 6] - c[o + 6]) * f;
    out.goff = c[o + 7] + (c[o2 + 7] - c[o + 7]) * f; out.roll = c[o + 8] + (c[o2 + 8] - c[o + 8]) * f; out.mog = c[o + 9] + (c[o2 + 9] - c[o + 9]) * f;
    out.forest = c[o + 10] + (c[o2 + 10] - c[o + 10]) * f; out.glade = c[o + 11] + (c[o2 + 11] - c[o + 11]) * f; out.powder = c[o + 12] + (c[o2 + 12] - c[o + 12]) * f; out.ridge = c[o + 13] + (c[o2 + 13] - c[o + 13]) * f;
    out.wall = c[o + 14] + (c[o2 + 14] - c[o + 14]) * f; out.rtail = c[o + 15] + (c[o2 + 15] - c[o + 15]) * f;
    out.tilt = c[o + 16] + (c[o2 + 16] - c[o + 16]) * f; out.bank = c[o + 17] + (c[o2 + 17] - c[o + 17]) * f;
    out.enc = c[o + 18] + (c[o2 + 18] - c[o + 18]) * f; out.gU = c[o + 19] + (c[o2 + 19] - c[o + 19]) * f;
    out.s = s; return out;
  }
  C.at = at;

  // the large shapes of the mountain away from the run: ridges, peaks and the walls of the valley (e = distance beyond the edge of the run)
  function relief(x, z, e, cell) {
    const m = smooth(30, 900, e), mx = x / 1400, mz = z / 1400;
    const r1 = 1 - Math.abs(vnoise2(mx, mz, 71)), r2 = 1 - Math.abs(vnoise2(mx * 2.3 + 5.1, mz * 2.3, 72)), r3 = 1 - Math.abs(vnoise2(mx * 5.1, mz * 5.1 + 2.2, 73));
    return m * m * (r1 * r1 * 520 + r2 * r2 * 170 + (cell < 40 ? r3 * r3 * 60 : 30)) * (0.35 + 0.65 * smooth(0, 1500, e + 400 * vnoise2(mz * 0.7, mx * 0.7, 74)));
  }
  // gullies: in every cell of a jittered grid a cosine wave is laid ACROSS the slope (wave vector d = the slope turned a quarter turn)
  // and neighbouring cells are blended, so the crests run straight down the fall line and bend as the mountain turns. Writes
  // _er = [value -1..1, d/dx, d/dz]; feeding those derivatives back into d makes the next, finer set join the first like tributaries.
  const _er = [0, 0, 0];
  function gullies(px, pz, dx, dz, seed) {
    const ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix - 0.5, fz = pz - iz - 0.5;
    let v = 0, gx = 0, gz = 0, wt = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      let n = Math.imul(ix + i, 374761393) ^ Math.imul(iz + j, 668265263) ^ seed ^ KEY; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
      const qx = fx - i - ((n & 0xffff) / 65536 - 0.5) * 0.5, qz = fz - j - ((n >>> 16) / 65536 - 0.5) * 0.5;
      const d = 1 - (qx * qx + qz * qz) / 1.5625; if (d <= 0) continue;
      const wgt = d * d * d, ph = (qx * dx + qz * dz) * TAU, sn = Math.sin(ph);
      v += Math.cos(ph) * wgt; gx -= sn * dx * wgt; gz -= sn * dz * wgt; wt += wgt;
    }
    wt = 1 / wt; _er[0] = v * wt; _er[1] = gx * wt; _er[2] = gz * wt;
  }

  // the U gully (经典编排): a flat floor UF*gw either side of the trough's line, then walls that rise over UW*gw as a half cosine, steepest
  // (about 40 degrees) half way up and level again at the rim, so riding up one and over the top never meets a lip. The wall on the outside of
  // each meander stands taller (the cut bank of a stream) and the inside one lower: that is where the line climbs. Depth 0..1 (times gul)
  // (用户 2026-11-18 22:29 UTC: 现在的雪槽是不是太平了？之前是比较圆滑的，现在像梯形，之前像一个 U 型槽) the flat floor of 0.5 gw either side
  // and 1.25 gw walls read as a trapezoid: a flat strip, a hard bend, a straight-looking wall. Now the floor is all but gone (0.1 gw) and the
  // half cosine runs over 1.6 gw: the bottom is one round curve that turns into the walls (about 9 m radius at the bottom, walls about
  // 30 degrees at their steepest, as the old bell's 27, not 40), still level at the rim, so riding up and over never meets a lip
  const UF = 0.1, UW = 1.6;
  function uWall(ug, c) {
    const a = Math.abs(ug), fw = UF * c.gw, w = UW * c.gw, sd = clamp((ug > 0 ? 1 : -1) * c.goff / 8, -1, 1);
    const prof = a <= fw ? 1 : a >= fw + w ? 0 : 0.5 + 0.5 * Math.cos(PI * (a - fw) / w);
    return prof - 0.22 * sd * smooth(fw, fw + w, a) * (1 - smooth(fw + w + 2, fw + w + 12, a));
  }
  C.uWall = uWall;

  // ---- the height field.  cell = sampling spacing of the caller (m); wavelengths the caller cannot resolve are skipped.
  C.height = function (x, z, cell) {
    const s = -z, c = at(s), u = x - c.cx, au = Math.abs(u), hw = c.hw;
    let h = c.baseY;
    const e = LV ? edgeE(s, u, au - hw, hw) : au - hw, lg = _lg, lh = _lh;
    // (the richer mountain: the dish levels off into the apron gently instead of at a crease, which was a lip just outside the run's edge)
    { const r = au / hw, r1 = r - 1; h += c.dish * (!LV ? Math.min(1.6, (u * u) / (hw * hw)) : r1 < 0 ? r * r : r1 < 0.6 ? 1 + 2 * r1 - r1 * r1 / 0.6 : 1.6); }
    // (the richer mountain) a run that leans to one side, and one edge curled up into a wall: concave at its foot, rounded over at its top
    if (c.tilt !== 0) h += c.tilt * u / Math.sqrt(1 + u * u / (1.44 * hw * hw));
    // (it rises from 0.45 of the half-width and rolls over into a rounded shoulder 0.65 beyond the edge: no crease at its top, where a
    // wall that only rose to the edge and stopped was a lip that threw whoever rode up it. Its curve changes smoothly all the way, so
    // riding up it and over the top takes a lateral speed no skier carries to leave the snow)
    if (c.bank !== 0) { const x = sat(((c.bank > 0 ? u : -u) / hw - 0.45) / 1.2); h += Math.abs(c.bank) * x * x * x * (10 - 15 * x + 6 * x * x); }
    // forested banks either side of the run, each stretch of the run with its own; on a ridge they fall away instead. Farther out they
    // level off into the valley's own walls, which do not care what the run below is doing
    // (from fifteen metres out the land answers less to the ridge here and more to the ridge above: c.rtail)
    const rf = e > 15 ? c.ridge + (c.rtail - c.ridge) * smooth(15, 60, e) : c.ridge;
    if (e > 0) {
      // (the richer mountain: an apron of open, skiable slope first, rising only five centimetres a metre, before the banks begin to climb.
      // Whoever leaves the run keeps going down the mountain instead of traversing a bank that tips them back. Not along a ridge)
      const ap = LV ? APRON * (1 - rf) * (1 - c.enc) : 0, ea = e - ap > 0 ? e - ap : 0;
      if (ap > 0) h += 0.05 * (e < ap ? e : ap);
      const t = ea / 55, rise = 55 * (t * t / (1 + t)), near = 150 * (1 - Math.exp(-rise / 150));
      // a ridge: beside the crest the snow falls away steeply into hollows some twenty metres down, and rises again to a rim a hundred and
      // seventy metres out, still well below the crest (the view goes on over it); beyond the rim the mountainside falls away for good. The
      // hollows lie one below another down the mountain: each one's floor climbs, more slowly than the mountain falls, to a shoulder level
      // with the crest, and the next drops away below it. Whoever leaves the crest goes down into a hollow, as gravity says; the rim holds
      // the skier, and the shoulder at its end, never more than two hundred and forty metres on, carries the skier back up level with the
      // run without a climb. The last hollow runs on past the end of the ridge, growing shallower, until it meets the run below
      // (rh: the ridge, and for three hundred metres below it a fading memory of it; q: where in its hollow, 0 at the shoulder)
      const ph = (s / 240) % 1, q = ph < 0.8 ? 0.5 + 0.5 * Math.cos(PI * ph / 0.8) : 0.5 - 0.5 * Math.cos(PI * (ph - 0.8) / 0.2);
      const rh = Math.max(c.ridge, sat((c.rtail - 0.74) / 0.26)) * q, ef = Math.max(0, e - 170), tf = ef / 55, riseF = 55 * (tf * tf / (1 + tf));
      h += near * c.shoulder * (1 - rf) - rh * (20 * (1 - Math.exp(-e * e / 1300)) - 9 * smooth(100, 170, e)) - rf * (0.62 * Math.exp(-ef / 260) * riseF + 11 * (1 - Math.exp(-ef * ef / 400))) + 0.36 * c.wall * (rise - near);
    }
    // big mountain relief far from the run (side walls, peaks)
    if (e > 30) {
      const m = smooth(30, 900, e);
      let hm = relief(x, z, e, cell);
      const w = smooth(70, 420, e);
      // gullies and the ribs between them, cut straight down the fall line of the large shapes
      if (w > 0.01) {
        const sg = u > 0 ? 1 : -1, D = 24;
        const gx = (relief(x + D, z, e + sg * D, cell) - hm) / D + sg * lerp(c.shoulder * (1 - rf), 0.36 * c.wall, smooth(60, 300, e)), gz = (relief(x, z + D, e, cell) - hm) / D + 0.36;
        const sl = Math.hypot(gx, gz), K = 1.7 * Math.min(1, 1.4 / (sl + 1e-6)), dx = gz * K, dz = -gx * K;
        // four sizes, each bent by the ones before it: buttresses and the great couloirs between them, then gullies, then runnels
        gullies(x / 700 + 3.9, z / 700 + 8.2, dx, dz, 1213);
        let g = 52 * m * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * _er[0]))), ex = _er[1] * 0.5, ez = _er[2] * 0.5;      // sharp ribs, round gully floors
        if (cell <= 40) { gullies(x / 260, z / 260, dx + ez * 1.4, dz - ex * 1.4, 911); g += 22 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * _er[0]))); ex += _er[1]; ez += _er[2]; }
        if (cell <= 16) { gullies(x / 124 + 17.3, z / 124 - 5.1, dx + ez * 1.4, dz - ex * 1.4, 577); g += 10 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * _er[0]))); ex += _er[1] * 1.05; ez += _er[2] * 1.05; }
        if (cell <= 4) { gullies(x / 59 - 8.7, z / 59 + 31.9, dx + ez * 1.4, dz - ex * 1.4, 353); g += 4.2 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * _er[0]))); }
        hm += w * smooth(0.2, 0.7, sl) * (0.35 + 0.65 * m) * g;
      }
      if (cell < 12 && m > 0.05) hm += m * 14 * vnoise2(x / 90, z / 90, 75) + (cell < 4 ? m * 4 * vnoise2(x / 23, z / 23, 76) : 0);
      if (w > 0.01 && cell <= 20) {
        // rock bands: benches where the snow lies, steep risers between them where it cannot. They are cut along the beds of the rock
        // (C.strata), the same number the terrain shader reads for its ledges and layers, so mesh and shading agree
        const t = C.strata(x, h + hm, z), ft = Math.floor(t), fr = t - ft;
        // every bed makes its own cliff: tall and sheer along one stretch, hardly a step along the next
        const k = w * (0.10 + 0.74 * smooth(-0.3, 0.3, vnoise2((x + z) / 260 + ft * 3.31, (x - z) / 700 + ft * 1.73, 79)));
        hm += (smooth(0.22, 0.78, fr) - fr) * 64 * k;
      }
      h += hm;
    }
    if (c.gul > 0.01) { const ug = u - c.goff; h -= c.gul * (c.gU > 0.001 ? lerp(Math.exp(-(ug * ug) / (c.gw * c.gw)), uWall(ug, c), c.gU) : Math.exp(-(ug * ug) / (c.gw * c.gw))); }
    if (lg > 0.001) h -= 2.4 * lg;
    if (lh > 0.001) h += 1.1 * lh;      // (an island between two ways down stands a little proud of both)
    // along a ridge the wind builds a lip of packed snow on either edge of the crest: it catches the low sun, and it turns a ski back
    // (the richer mountain: a low, broad drift instead, a lip a skier can run up and over without being thrown: 0.8 m over some twenty)
    if (c.ridge > 0.01) { const q = LV ? (au - hw - 4) / 10 : (au - hw - 1.5) / 4.2; if (q > -3 && q < 3) h += c.ridge * (LV ? 0.8 : 1.5) * Math.exp(-q * q) * (0.75 + 0.25 * vnoise1(s / 37, 41)); }
    if (c.roll !== 0) h += c.roll * smooth(hw * 1.5, hw * 0.7, au);
    if (c.mog > 0.01 && cell <= 1) {
      const M = MOGF[Variants.val.mogf] || MOGF.a;
      const row = s / M.L, r0 = Math.floor(row), ph = (r0 & 1) * 0.5 + M.J * vnoise1(r0 * 1.7, 9);
      const col = u / M.W + ph, b0 = 0.5 + 0.5 * Math.cos(col * TAU), q = row - r0;
      // (C.mogK: the skier's legs soak up half of every bump, so the body is told about a field half as tall as the one that is drawn)
      // each bump rises gently from above and drops off short and steep below, the way skis carve them; no two are the same size.
      // (M.R rounds the top: 2b - b^2 is the same bump with a broad crown and the trough between two bumps left a narrow rut, as skis cut them)
      const along = q < M.Q ? smooth(0, M.Q, q) : 1 - smooth(M.Q, 1, q), bx = b0 + M.R * (b0 - b0 * b0);
      const big = M.B0 + M.B1 * (hash2U(Math.floor(col + 0.5) + 4096, r0 + 4096) & 0xffff) / 65536;
      h += C.mogK * c.mog * M.H * big * bx * along * mogField(u, s, hw) - c.mog * 0.2;
    }
    // natural undulation
    h += 1.7 * vnoise2(x / 61, z / 61, 3);
    if (cell <= 12) h += 0.75 * vnoise2(x / 27, z / 27, 4);
    if (cell <= 5) h += 0.32 * vnoise2(x / 11.3, z / 11.3, 5);
    if (cell <= 1.2) h += 0.09 * vnoise2(x / 3.1, z / 6.3, 6) * (0.4 + c.powder);
    // kickers and other placed features
    const fb = FEATS.get(Math.floor(s / 32));
    if (fb) for (let i = 0; i < fb.length; i++) {
      const f = fb[i];
      if (f.kind === 'rock') {
        const q = Math.hypot((s - f.cs) * (s < f.cs ? 0.45 : 1), u - f.u) / f.rad;
        if (q < 1) { const hr = f.h * (0.45 * Math.sqrt(1 - q * q) + 0.55 * smooth(1, 0.5, q)); h += C.rockCap > 0 ? C.rockCap * (1 - Math.exp(-hr / C.rockCap)) : hr; }      // (round on top, steep but not sheer at the sides: a sheer one cannot be drawn without teeth)
        continue;
      }
      if (f.kind === 'drop') {
        // run-in rising onto the step, the face (it takes 0.65 of the height in a metre), then a landing that falls away 0.35 more over twelve
        // (the lip is not a ruled line: it wanders a metre or two either way across the step, and so do the step's two ends)
        const du = u - f.u, w2 = f.wid * 0.5 + 1.5 * vnoise1(f.lip * 0.31 + (du > 0 ? 3.1 : 7.7), 83);
        const lat = smooth(w2 + 4, w2 - 1, Math.abs(du)); if (lat <= 0) continue;
        const d = s - f.lip - dropLip(f, du), k = d < 0 ? smooth(f.s - f.lip, -4, d) : d < 1.4 ? 1 - 0.65 * smooth(0, 1.4, d) : 0.35 * (1 - smooth(1.4, 13, d));
        h += f.h * k * lat; continue;
      }
      const t = (s - f.s) / f.len; if (t < -0.2 || t > 2.6) continue;
      // (a marked jump is a built wedge, half as wide as the hump it replaces: its sides are shovelled and packed to a batter of about 45-55
      // degrees, rounded over at the shoulder and run out into the snow at the toe, as a park crew shapes them. The sides are what the eye
      // finds from above)
      const lat = f.mark ? smooth(f.wid * 0.5 + 3.3, f.wid * 0.5 - 0.3, Math.abs(u - f.u)) : smooth(f.wid, f.wid * 0.45, Math.abs(u - f.u)); if (lat <= 0) continue;
      let k;
      // run-in ramp. A marked jump is a built takeoff: it steepens all the way to its lip, so that with the sun ahead its face is in shade and
      // its edge is drawn against the lit snow beyond (the others are rounded humps that only unweight the skis)
      if (t < 1) k = t <= 0 ? 0 : f.mark ? Math.pow(t, 1.9) : t * t * (3 - 2 * t) * (0.55 + 0.45 * t);
      else { const q = (t - 1) * f.len, qb = f.mark ? 3.4 : 1.4; k = q < qb ? 1 - smooth(0, qb, q) * 1.25 : -0.25 * (1 - smooth(qb, 20, q)); }   // lip, then a dug-out landing (a marked one's back is packed to a slope too, not a wall)
      h += f.h * k * lat;
    }
    return h;
  };
  C.MOGF = MOGF; C.mogShape = () => MOGF[Variants.val.mogf] || MOGF.a;
  // where the bumps of a mogul field stand (0..1): across the run short of its edges, except along one smooth line that winds down
  // through them. That line is the fast way; the bumps either side of it are slow going and throw the skier about
  // (the smooth line's centre across the run, for whoever lays the way through the bumps beside it: 92_rings.js)
  C.mogChan = (s, hw) => 0.5 * hw * vnoise1(s / 105 + 7.3, C.seed + 31);
  function mogField(u, s, hw) { return smooth(hw * 1.1, hw * 0.8, Math.abs(u)) * smooth(2.4, 6.5, Math.abs(u - 0.5 * hw * vnoise1(s / 105 + 7.3, C.seed + 31))); }
  // the snow under a lens: the highest of the fine surface there and 0.6 m either way. What a lens has to keep clear of is not only the
  // point under it: the corners of the picture's near plane reach a few tenths of a metre out from it, and on a gully wall or a mogul the
  // snow beside it stands higher than the snow under it (every camera keeps above this: 07_game.js, 07b_views.js, 19d_photo.js, 20_director.js)
  C.snowTop = function (x, z) { return Math.max(C.height(x, z, 0.5), C.height(x + 0.6, z, 0.5), C.height(x - 0.6, z, 0.5), C.height(x, z + 0.6, 0.5), C.height(x, z - 0.6, 0.5)); };
  // ...and the last word for every lens: how far it has to rise for the near plane of its picture (the rectangle `near` metres in front of
  // it, `fovY` high, `aspect` wide) to stand at least `m` clear of the fine snow at its four corners and its middle, looking the way `f`
  // (a unit vector) does. 0 when it is clear. Rising straight up moves none of those points across the map, so one lift settles it
  const _nl = [0, 0, 0];
  C.nearLift = function (p, f, fovY, aspect, near, m = 0.05, roll = 0) {
    const th = Math.tan(fovY / 2), hh = near * th, hw = hh * aspect, rl = Math.hypot(f[0], f[2]) || 1e-6, rx = -f[2] / rl, rz = f[0] / rl;
    const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];      // (up = right x forward, with right level)
    const cr = Math.cos(roll), sr = Math.sin(roll); let lift = C.height(p[0], p[2], 0.5) + m - p[1];
    for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
      const ka = hw * a * cr - hh * b * sr, kb = hw * a * sr + hh * b * cr;      // (the corner, turned with the horizon's tilt)
      _nl[0] = p[0] + f[0] * near + rx * ka + ux * kb; _nl[1] = p[1] + f[1] * near + uy * kb; _nl[2] = p[2] + f[2] * near + rz * ka + uz * kb;
      lift = Math.max(lift, C.height(_nl[0], _nl[2], 0.5) + m - _nl[1]);
    }
    return lift > 0 ? lift : 0;
  };
  C.bumps = function (x, z) { const c = at(-z, _py); return c.mog > 0.01 ? c.mog * mogField(x - c.cx, -z, c.hw) : 0; };
  // the lie of the rock: which bed of the mountain a point belongs to. Beds average 64 m but are not stacked plates: one is three or four
  // times the next, and how thick a bed is changes along the wall (the phase ph slides), so beds swell, pinch and nearly end. The warp
  // stays monotonic (its slope runs 0.39..1.61), so beds never cross. The dip is folded twice as hard as the plain y/64 cake had it.
  // Every term repeats over 1024 m in x, y and z (u + 16 per 1024 m of height; the warp's frequencies are whole turns per 16 beds), because
  // the shader only knows positions modulo that (strataAt in 04_terrain.js is the same function, term for term).
  C.strata = function (x, y, z) {
    const k = TAU / 1024;
    const u = y / 64 + 0.84 * Math.sin(k * (x + z) + 1.1 * Math.sin(k * (x - z) + 0.7)) + 0.32 * Math.sin(2 * k * x + 1.7 * Math.sin(k * z)) + 0.20 * Math.sin(3 * k * z + 1.3 * Math.sin(k * x) + 1.1) + 0.09 * Math.sin(4 * k * (x - z) + 2.0 * Math.sin(k * (x + z)));
    const ph = 2.1 * Math.sin(k * (x - z) + 0.4) + 1.3 * Math.sin(2 * k * z + 1.1 * Math.sin(k * x));
    return u + 0.22 * Math.sin(1.9634954 * u + 1.7 + ph) + 0.035 * Math.sin(5.1050881 * u + 0.6 - 0.8 * ph);
  };
  // how far up into the mountain's own country a point lies (0 on the run and its shoulders, 1 high on the walls)
  C.mountain = function (x, z) { const c = at(-z), u = x - c.cx, e = LV ? edgeE(-z, u, Math.abs(u) - c.hw, c.hw) : Math.abs(u) - c.hw; return smooth(30, 900, e); };
  const _g = [0, 0, 0];
  C.normal = function (x, z, d = 0.3) {
    const hx = C.height(x + d, z, 0.5) - C.height(x - d, z, 0.5), hz = C.height(x, z + d, 0.5) - C.height(x, z - d, 0.5);
    const nx = -hx / (2 * d), nz = -hz / (2 * d), l = Math.hypot(nx, 1, nz); _g[0] = nx / l; _g[1] = 1 / l; _g[2] = nz / l; return _g;
  };

  // ---- trees: one candidate per jittered grid cell, fully deterministic
  const _t = { x: 0, z: 0, h: 0, r: 0, variant: 0, rot: 0, ok: false }; let _ridge = 0, _enc = 0;
  C.treeDensity = function (x, z) {
    const s = -z; if (s < -400) return 0; const c = at(s), u = x - c.cx, au = Math.abs(u), e = LV ? edgeE(s, u, au - c.hw, c.hw) : au - c.hw;
    let d = 0;
    if (e > 3) {
      const patch = 0.55 + 0.45 * vnoise2(x / 70, z / 70, 21);
      d = c.forest * smooth(3, 26, e) * smooth(-0.25, 0.25, patch - 0.42);
      // (the richer mountain) the apron is open forest: thinner, with lanes running down the fall line between the trees, so there is always a
      // way through (a lane is where a stretched noise crosses zero: a few metres wide, tens of metres long, joining and parting)
      if (LV && e < APRON + 40) {
        const ln = Math.abs(vnoise2(x / 13, z / 70, 28)) + 0.5 * Math.abs(vnoise2(x / 29, z / 140, 29));
        d *= (0.55 + 0.45 * smooth(APRON * 0.7, APRON + 40, e)) * smooth(0.08, 0.22, ln);
      }
      // (an island between the run and a lane is forest, thick enough that the two read as two ways)
      if (LV && _lb > 0) d = Math.max(d, c.forest * 0.9 * _lb * smooth(2, 5, e) * smooth(-0.35, 0.1, patch - 0.42));
      d *= 1 - smooth(260, 620, e + 120 * vnoise2(x / 300, z / 300, 22));       // tree line: bare snow and rock higher up the walls
      d *= 1 - c.ridge * smooth(0, 30, e);
    }
    // (经典编排) a lane through the forest: the trees stand close at its edges, a wall of trunks either side, deep and unbroken (enc)
    if (c.enc > 0.01 && e > 0.8) { const pt = 0.55 + 0.45 * vnoise2(x / 70, z / 70, 21); d = Math.max(d, c.enc * smooth(0.8, 4.5, e) * (0.8 + 0.2 * pt) * (1 - smooth(70, 140, e))); }
    // (and the U gully: a row of trees along each rim, back from the top of the wall, that frames the sky from the floor; out on the run's
    // own snow the clearing below takes them off again, so the row stands where the run ends)
    if (c.gU > 0.01) { const a = Math.abs(u - c.goff), r = (UF + UW) * c.gw; d = Math.max(d, 0.6 * c.gU * smooth(r + 2, r + 5, a) * (1 - smooth(r + 12, r + 20, a)) * smooth(-0.3, 0.2, vnoise2(x / 17, z / 29, 30))); }
    if (c.glade > 0.01) {
      const lane = vnoise2(x / 19, z / 46, 23), cl = vnoise2(x / 55, z / 55, 24);
      const g = c.glade * smooth(0.02, 0.36, lane) * smooth(-0.5, 0.1, cl) * smooth(c.hw + 6, c.hw - 8, au);
      d = Math.max(d, g * 0.46);
    }
    // lone groups standing out on the run itself; a clear lane always winds between them, and the first turns are free of them
    if (au < c.hw && s > 150) {
      const lane = 0.42 * c.hw * vnoise1(s / 150 + 2.3, C.seed + 9), isl = vnoise2(x / 30 + 7.1, z / 46, 26);
      const g = c.forest * smooth(0.50, 0.66, isl) * smooth(6, 11, Math.abs(u - lane)) * smooth(150, 230, s) * (1 - c.ridge);
      d = Math.max(d, g * 0.7 * C.isl * (1 - c.enc));
    }
    // the ridge: wind-stunted spruce, plastered white, in loose groups along both edges of the crest (they are what goes by at speed up there)
    _ridge = c.ridge; _enc = c.enc;
    if (c.ridge > 0.01) {
      const g = c.ridge * smooth(c.hw - 4.5, c.hw - 1.5, au) * smooth(c.hw + 8, c.hw + 3, au) * smooth(-0.2, 0.4, vnoise2(x / 21, z / 34, 27));
      d = Math.max(d, g * 0.55);
    }
    if (LV && d > 0 && e < 14) d *= clearAt(s, u);
    if (d > 0 && (C.rclear || c.gU > 0.01) && au < c.hw + 6) d *= keepClear(s, u, c);
    if (s < 60) d *= smooth(8, 60, s + au);       // keep the start gate clear
    return d;
  };
  // (Variants 'rclear' b) the lines the run is built round stay clear of trees: the floor and walls of a gully, the mogul field's smooth channel
  // (the same line mogField leaves free of bumps), and a jump's way in, its lip and its landing (from 60 m above a marked one to 35 m past
  // its end). The U gully is always kept clear, whatever rclear says
  function keepClear(s, u, c) {
    let k = 1; const au = Math.abs(u);
    if (c.gul > 0.3) { const a = Math.abs(u - c.goff), r = c.gU > 0.5 ? (UF + UW) * c.gw + 1 : c.gw * 1.3; k *= 1 - smooth(0.3, 1.5, c.gul) * (1 - smooth(r, r + 3, a)); }
    if (!C.rclear) return k;
    // the run itself is bare snow from edge to edge: no lone groups out on it, nothing on a gully's banks between its two rim rows. Only the
    // 树林 glade keeps its trees, because skiing between them is what that stretch is for
    k *= lerp(smooth(c.hw - 1, c.hw + 1.5, au), 1, smooth(0.3, 0.7, c.glade));
    if (c.mog > 0.05) k *= lerp(1, smooth(4.5, 8, Math.abs(u - 0.5 * c.hw * vnoise1(s / 105 + 7.3, C.seed + 31))), smooth(0.05, 0.3, c.mog));
    const b0 = Math.floor(s / 32);
    for (let b = b0 - 1; b <= b0 + 2; b++) { const fb = FEATS.get(b); if (!fb) continue;
      for (let i = 0; i < fb.length; i++) { const f = fb[i]; if (f.kind !== 'kicker') continue;
        if (s > f.s - (f.mark ? 60 : 25) && s < f.s + f.len + (f.mark ? 35 : 15)) k *= smooth(f.wid * 0.5 + (f.mark ? 3 : 2.5), f.wid * 0.5 + (f.mark ? 7 : 5), Math.abs(u - f.u)); } }
    return k;
  }
  C.treeInCell = function (ci, cj, out) {
    out = out || _t; out.ok = false;
    const h0 = hash2U(ci, cj);
    const x = (ci + 0.15 + 0.7 * (h0 & 0xffff) / 65536) * TREE_CELL, z = (cj + 0.15 + 0.7 * (h0 >>> 16) / 65536) * TREE_CELL;
    const d = C.treeDensity(x, z); if (d <= 0.01) return out;
    const h1 = hashU(h0 + 0x51ed27);
    if ((h1 & 0xffff) / 65536 > d * 0.9) return out;
    const r2 = ((h1 >>> 16) & 0xff) / 255, r3 = (h1 >>> 24) / 255;
    // (old, tall forest along a lane: enc)
    out.ok = true; out.x = x; out.z = z; out.h = (6.5 + 9.5 * r2 * r2 + 2.5 * r3) * (1 - 0.6 * _ridge) * (1 + 0.4 * _enc); out.r = out.h * 0.17; out.variant = (h0 >>> 5) % 5; out.rot = r3 * TAU; out.seed = h1;
    return out;
  };
  // closest-trunk query for collisions / AO (checks the 3x3 neighbourhood)
  function nearbyTree(ci, cj) {
    const index = (cj & 63) * 64 + (ci & 63);
    let cell = nearbyCells[index];
    if (!cell || cell.ci !== ci || cell.cj !== cj) {
      if (!cell) nearbyCells[index] = cell = {};
      C.treeInCell(ci, cj, cell);
      cell.ci = ci; cell.cj = cj;
    }
    return cell;
  }
  C.nearTree = function (x, z, out) {
    const ci = Math.floor(x / TREE_CELL), cj = Math.floor(z / TREE_CELL); let best = 1e9; out.ok = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const t = nearbyTree(ci + a, cj + b); if (!t.ok) continue;
      const d = Math.hypot(t.x - x, t.z - z); if (d < best) { best = d; out.ok = true; out.x = t.x; out.z = t.z; out.h = t.h; out.r = t.r; out.d = d; out.soft = false; }
    }
    // (the saplings that mark a jump: they bend and shed their snow, they do not stop anyone. soft = brushed, never hit)
    // (once flags stand at those places instead of saplings, there is nothing there to brush: Gates bends its own flags)
    if (!(typeof Gates !== 'undefined' && Gates.enabled)) C.markers(-z - 8, -z + 8, (mx, mz, mh) => { const d = Math.hypot(mx - x, mz - z); if (d < best) { best = d; out.ok = true; out.x = mx; out.z = mz; out.h = mh; out.r = mh * 0.17; out.d = d; out.soft = true; } });
    return out;
  };
  // the spruce saplings that mark a jump, the way a line is marked on a mountain: a pair where the run-in begins and a pair beside the lip,
  // just clear of the wedge, so that from above it is a lane to ski into: fn(x, z, height, turn)
  C.markers = function (s0, s1, fn) {
    if (s1 >= planned) planTo(s1 + 3000);
    for (let b = Math.floor(s0 / 32); b <= Math.floor((s1 + 24) / 32); b++) {
      const fb = FEATS.get(b); if (!fb) continue;
      for (let i = 0; i < fb.length; i++) {
        const f = fb[i]; if (!f.mark) continue;
        const sl = f.s + f.len * 0.94; if (Math.floor(sl / 32) !== b) continue;      // (a jump lies in several buckets: counted in the one that holds its lip)
        if (f.mx === undefined) { f.mx = at(sl, _py).cx + f.u; f.mx0 = at(f.s + 1, _py).cx + f.u; f.mo = f.wid * 0.5 + 3.4; f.mh = 3.5 + 0.7 * ((f.s * 0.37) % 1); }
        fn(f.mx - f.mo, -sl, f.mh, f.s * 1.3); fn(f.mx + f.mo, -sl + 0.6, f.mh * 0.9, f.s * 2.9);
        fn(f.mx0 - f.mo, -f.s - 1, f.mh * 0.82, f.s * 4.1); fn(f.mx0 + f.mo, -f.s - 1.5, f.mh * 0.95, f.s * 5.3);
      }
    }
  };

  // ---- 一起滑: the mountain loops (owner, 2026-11-22 22:28 UTC: "这个应该是无缝衔接的…不需要出现雾，然后重新load一下" — reaching the
  // bottom must not cover the picture and load the top again). From B on, the land is the land from A on again, moved as one piece (dX across,
  // dY down, L along): the same snow, trees, jumps and rocks, so a skier who goes on past B is simply skiing the top again, with nothing to cut
  // to. Over the last T metres before B the shapes ease from one into the other; the things that stand on the land (trees, jumps, rocks,
  // stretches of run) change over at the middle of that, Bc. L is a whole number of 32 m feature buckets and of 4.5 m tree cells and dX of
  // tree cells, so every one of those lands exactly on one of its own. Laps go on for ever (lap n: s - nL). C.loop = null: no loop
  C.loop = null;
  const RAW = { at, height: C.height, bumps: C.bumps, mountain: C.mountain, offRun: C.offRun, treeDensity: C.treeDensity, rockAt: C.rockAt, rockHit: C.rockHit,
    treeInCell: C.treeInCell, markers: C.markers, segAt, paramsAt, ways: C.ways, waysK: C.waysK, mogChan: C.mogChan, yawAt: C.yawAt };
  const LK = ['baseY', 'cx', 'hw', 'dish', 'shoulder', 'gul', 'gw', 'goff', 'roll', 'mog', 'forest', 'glade', 'powder', 'ridge', 'wall', 'rtail', 'tilt', 'bank', 'enc', 'gU'];
  let WR = null; const _wb = {}, segC = new Map(), featC = new Map();
  // lap n at s (s - nL lies in [A, B) from B on), the blend w at s1 = s - nL (above 0 only in [B - T, B)), and k: the lap whose things stand at s
  function lapAt(s) { return s < WR.B ? 0 : Math.floor((s - WR.A) / WR.L); }
  function wOf(s1) { return s1 < WR.b0 ? 0 : smoother(WR.b0, WR.B, s1); }
  function kAt(s) { const n = lapAt(s); return n + (s - n * WR.L >= WR.Bc ? 1 : 0); }
  // a number field of the land at (x, s): lap n there, eased into lap n + 1 over the blend
  function blend2(x, s, f) { const n = lapAt(s), s1 = s - n * WR.L, w = wOf(s1), a = f(x - n * WR.dX, s1, n); return w > 0 ? a + (f(x - (n + 1) * WR.dX, s1 - WR.L, n + 1) - a) * w : a; }
  C.setLoop = function (A, B) {
    C.loop = WR = null; segC.clear(); featC.clear(); C.feats = FEATS;
    Object.assign(C, { at: RAW.at, height: RAW.height, bumps: RAW.bumps, mountain: RAW.mountain, offRun: RAW.offRun, treeDensity: RAW.treeDensity, rockAt: RAW.rockAt, rockHit: RAW.rockHit,
      treeInCell: RAW.treeInCell, markers: RAW.markers, segAt: RAW.segAt, paramsAt: RAW.paramsAt, ways: RAW.ways, waysK: RAW.waysK, mogChan: RAW.mogChan, yawAt: RAW.yawAt });
    if (!(B > A + 600)) return null;
    const T = 160, L = Math.max(288, Math.round((B - A) / 288) * 288); B = A + L;
    const Bc = B - T / 2, ca = RAW.at(Bc, {}), cb = RAW.at(Bc - L, {});
    const dX = Math.round((ca.cx - cb.cx) / TREE_CELL) * TREE_CELL, dY = ca.baseY - cb.baseY;
    C.loop = WR = { A, B, L, T, Bc, b0: B - T, dX, dY };
    C.at = function (s, out) {
      if (s < WR.b0) return RAW.at(s, out);
      const n = lapAt(s), s1 = s - n * L, w = wOf(s1), o = RAW.at(s1, out); o.cx += n * dX; o.baseY += n * dY;
      if (w > 0) { const b = RAW.at(s1 - L, _wb); b.cx += (n + 1) * dX; b.baseY += (n + 1) * dY; for (const k of LK) o[k] += (b[k] - o[k]) * w; }
      o.s = s; return o;
    };
    C.height = function (x, z, cell) { const s = -z; if (s < WR.b0) return RAW.height(x, z, cell); return blend2(x, s, (x1, s1, n) => RAW.height(x1, -s1, cell) + n * dY); };
    for (const k of ['bumps', 'mountain', 'offRun', 'treeDensity', 'rockAt']) { const f = RAW[k]; C[k] = function (x, z) { const s = -z; if (s < WR.b0) return f(x, z); return blend2(x, s, (x1, s1) => f(x1, -s1)); }; }
    C.rockHit = function (x, z, o) { const s = -z; if (s < WR.Bc) return RAW.rockHit(x, z, o); const k = kAt(s), r = RAW.rockHit(x - k * dX, z + k * L, o); if (r) { o.x += k * dX; o.z -= k * L; } return r; };
    C.treeInCell = function (ci, cj, out) {
      const s = -(cj + 0.5) * TREE_CELL; if (s < WR.Bc) return RAW.treeInCell(ci, cj, out);
      const k = kAt(s), o = RAW.treeInCell(ci - Math.round(k * dX / TREE_CELL), cj + Math.round(k * L / TREE_CELL), out); if (o.ok) { o.x += k * dX; o.z -= k * L; } return o;
    };
    C.markers = function (s0, s1, fn) {
      if (s1 < WR.Bc) return RAW.markers(s0, s1, fn);
      for (let k = s0 < WR.Bc ? 0 : kAt(s0), ke = kAt(s1); k <= ke; k++) {
        const a = k === 0 ? s0 : Math.max(s0, WR.Bc + (k - 1) * L), b = Math.min(s1, WR.Bc + k * L);
        if (b > a) RAW.markers(a - k * L, b - k * L, (x, z, h, r) => fn(x + k * dX, z - k * L, h, r));
      }
    };
    // (a stretch of run, a jump or a rock of a later lap: the same one, its distances moved on by whole laps)
    const segK = (g, k) => { if (!k) return g; const key = g.idx * 4096 + k; let c = segC.get(key); if (!c) segC.set(key, c = Object.assign({}, g, { s0: g.s0 + k * L, lap: k })); return c; };
    C.segAt = function (s) { if (s < WR.Bc) return RAW.segAt(s); const k = kAt(s); return segK(RAW.segAt(s - k * L), k); };
    C.paramsAt = function (s, out) { if (s < WR.Bc) return RAW.paramsAt(s, out); return RAW.paramsAt(s - kAt(s) * L, out); };
    for (const k of ['ways', 'waysK', 'yawAt']) { const f = RAW[k]; C[k] = function (s) { return s < WR.Bc ? f(s) : f(s - kAt(s) * L); }; }
    C.mogChan = (s, hw) => RAW.mogChan(s < WR.Bc ? s : s - kAt(s) * L, hw);
    const featK = (f, k) => { let m = featC.get(f); if (!m) featC.set(f, m = []); if (!m[k]) { const c = m[k] = Object.assign({}, f, { s: f.s + k * L, lap: k }); if (f.lip !== undefined) c.lip = f.lip + k * L; if (f.cs !== undefined) c.cs = f.cs + k * L; delete c.mx; delete c.mx0; } return m[k]; };
    const NB = L / 32;
    C.feats = { get(b) { const s = b * 32; if (s + 32 <= WR.Bc) return FEATS.get(b); const k = kAt(Math.max(s, WR.Bc)), a = FEATS.get(b - k * NB); return a && k ? a.map(f => featK(f, k)) : a; } };
    return WR;
  };
  // a point of lap k moved back into lap 0, in place (for whoever compares places on the mountain across laps: other skiers, 99b_net.js)
  C.lapShift = function (p, k) { if (!WR || !k) return p; p[0] -= k * WR.dX; p[1] -= k * WR.dY; p[2] += k * WR.L; return p; };
  C.lapOf = s => WR ? lapAt(s) : 0;
  // the loop as asked for (C.wantLoop = { A, segs }: from A to the end of the first `segs` stretches of run), laid again on every new mountain.
  // Whoever changes it makes the land round the lens again (App.swap): what was made before it went on without the loop
  C.wantLoop = null;
  C.loopTo = function (want) {
    C.wantLoop = want || null; if (!want) return C.setLoop(0, 0);
    let s = 14, sg = RAW.segAt(s); const first = sg.idx;
    for (let k = 0; k < 40 && sg.idx < first + want.segs; k++) { s = sg.s0 + sg.len + 0.5; sg = RAW.segAt(s); }
    return C.setLoop(want.A, sg.s0);
  };
  { const set = C.setSeed; C.setSeed = C.reset = function (n) { if (WR) C.setLoop(0, 0); const r = set(n); if (C.wantLoop) C.loopTo(C.wantLoop); return r; }; }
  C.reset(C.seed);
  return C;
})(vnoise1, vnoise2, hash2U);
