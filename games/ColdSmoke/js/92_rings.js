"use strict";
// ---------------------------------------------------------------- 光圈挑战（试玩版，?dev 下的 Variants「光圈挑战」，默认关）
// The rings of the ring challenge. The nearest ring is a dense swarm of glowing grains (thickest along its middle line, each grain jittering
// fast on its spot and running along the ring, short-lived, a few drifting outward: green low, violet high, like the game's aurora; 用户
// 05:22 UTC: 由点组成，不要实心的管子). The next three are only a flame each, fainter the farther they are, so the line ahead can be read. As
// the skier closes on the ring in front, the next flame swells in place and opens into a ring; the ring passed scatters.
// They are things in the world, drawn in the scene pass with the scene's depth (用户 04:58 UTC: 必须是 physical 的东西，人在前面要挡住，要有
// 体积，要有影子): the skier, the trees and the hill hide them pixel by pixel, each grain casts its shadow into the sun's shadow map (a dappled band
// that moves with them), and
// its light falls on the snow round it (and on the skier riding through). A flame's glow is a wide sheet of lit air at the flame's own depth,
// so what stands in front of the flame cuts it, and over a ridge the glow above the ridge line is still seen.
// Rings are laid ahead of the skier while the mode is on, station by station of the designed run (PLAN below), in three sizes set by
// 光圈难度; after a flagged kicker a ring hangs in the air of the jump.
const Rings = (() => {
  const RG = { on: false, rings: [], passed: 0, missed: 0, hud: null, n: 0, pipes: [] };
  if (typeof Variants !== 'undefined') Variants.def('rings', '光圈挑战', [['off', '关'], ['on', '开']], 'off');
  // (developer mode only for now, as the other trial switches: without ?dev it is off, whatever an address or an earlier pick says)
  // (用户 2026-11-18 16:57 UTC: 一个可以分享给别人试玩的链接，只看得到挑战，看不到其他 dev 的东西，也没有版本对比) ?chal in the address: the 挑战
  // button, the two lines, the rings, the result card and the replay, with every other dev thing (场景, 今日之山, 版本对比, the switches) off
  const shareOn = () => { try { return !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && /[?&]chal(=|&|$)/.test(location.search); } catch (e) { return false; } };
  const chalOn = () => true;          // (用户 2026-11-19 00:39 UTC: 直接上线，不需要放到 dev 后面) the challenge is for everyone now, the 小红书 build too
  const devOn = () => { try { return !(self.COLD_SMOKE && self.COLD_SMOKE.noDev) && (/[?&]dev(=|&|$)/.test(location.search) || /\/dev\/?$/.test(location.pathname) || !!(self.COLD_SMOKE && self.COLD_SMOKE.dev)); } catch (e) { return false; } };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = x => 1 - Math.pow(1 - cl(x, 0, 1), 3);
  // (用户 05:28 UTC: 现在的圈太大，随机混 3、4 种：现在的 2/3、1/2、1/3，钻着试): radii as shares of the 4.5 m ring he saw; the HUD names
  // the share of the ring in front so he can say which one is right
  // UPDATE (用户 05:43 UTC): keep three, 2/3, 1/2, 1/3, set by how hard the stretch is (index 0 easy .. 2 hard)
  const SIZES = [[2.5, '5 米'], [1.5, '3 米'], [1.0, '2 米']];          // (用户 2026-11-18 19:10 UTC: 试试 5、3、2: diameters in metres; were 6, 4.5, 3)
  const COLK = [1, 0.4, 0.13];          // (下一个圈提示 细高光柱: how bright the column over the 1st, 2nd and 3rd flame still to come)
  const AHEAD = 4;                 // the ring in front + three flames
  const TONGUES = 56;
  let gfx = null, pDust = null, pDustSh = null, pFlame = null, pLight = null;
  let lastS = null, rnd = 1, lastT = 0, serial = 0, drawList = [];
  const pc = {}, tn = {}, rk = {};
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };

  // ---- where the rings go
  function lipOf(f) { const xk = s => Course.at(s, pc).cx + f.u, hgt = s => Course.height(xk(s), -s, 0.5); let sc = f.s + f.len, best = 1e9; for (let s = f.s + 2; s <= f.s + f.len + 6; s += 0.5) { const c = hgt(s + 0.5) + hgt(s - 0.5) - 2 * hgt(s); if (c < best) { best = c; sc = s; } } return { s: sc, y: hgt(sc), x: xk(sc) }; }
  const kUsed = new Set();
  function kickerAhead(s0, s1) { for (let b = Math.floor((s0 - 40) / 32); b <= Math.floor(s1 / 32); b++) for (const f of Course.feats.get(b) || []) if (f.mark && !kUsed.has(f) && f.s + f.len + 14 > s0 + 6 && f.s < s1) return f; return null; }
  function kickerIn(s0, s1) { for (let b = Math.floor((s0 - 40) / 32); b <= Math.floor(s1 / 32); b++) for (const f of Course.feats.get(b) || []) if (f.mark && f.s + f.len > s0 && f.s < s1) return f; return null; }
  function clear(s, u, hw, lim = hw - 4) { for (const d of [0, -2.5, 2.5, -5, 5, -7.5, 7.5]) { const uu = cl(u + d, -lim, lim), x = Course.at(s, pc).cx + uu; let ok = true; for (const dz of [-6, 0, 6]) { Course.nearTree(x, -s + dz, tn); if (tn.ok && !tn.soft && tn.d < 5.5) ok = false; } if (Course.rockHit && Course.rockHit(x, -s, rk)) ok = false; if (ok) return uu; } return null; }
  // ---- how the rings are laid out (用户 05:43 UTC: 三档大小按难度定，再想想圈怎么排布). Each station of the designed run (Course.ROUTE,
  // 经典编排) has its own way: lv how hard it is (0 big rings, 2 small), gap metres between rings, how they stand across the run:
  //   weave  side to side, a slalom feel (open slopes)
  //   apex   on the inside of each bend of a winding lane, where the line through the bend runs; round the bend it is hidden by the trees
  //          until you are in it (藏), then there
  //   centre in the middle of the run where it opens to the city: the ring frames the view (露, 借景)
  //   crest  just over the top of a roller: hidden behind the crest, seen as you top it
  //   wall   up on one wall of the U gully, then the other: ride the walls. On the wall's own slope, a little over half way up, measured
  //          from the trough's line (which meanders up to 13 m off the run's middle), never on the bank above it
  //   zip    the mogul field: in the troughs between the bumps, one row-crest after another, side to side: turn round the bumps
  //   none   no ground rings (the jumps: the ring is in the air past each kicker)
  // 光圈难度 moves every station a step: 轻松 bigger rings, gentler side steps, more room; 难 smaller, wider steps, closer together
  const PLAN = {
    bowl: { lv: 0, gap: [45, 60], how: 'weave', side: 7 },
    corridor: { lv: 1, gap: [55, 75], how: 'apex' },
    steeps: { lv: 1, gap: [25, 32], how: 'weave', side: 4.5 },          // (short, linked turns down a steep pitch, not long traverses)
    glade: { lv: 1, gap: [38, 52], how: 'weave', side: 6 },
    kickers: { lv: 0, gap: [60, 80], how: 'none' },
    // (用户 19:21-19:37 UTC: 间距按高手流畅能过来定，标准 = 高手刚好流畅通过). Measured with tools/ring-expert.js (an expert pilot on a smooth
    // line through the rings ahead, carving deep and braking as it needs, 标准 sizes): gully 40-70 m all about 70-85% through, smoothest at
    // 60 m (no full lock); moguls 1 row 18%, 2 rows 71%, 3 rows 100% at 40 km/h with 5% full lock, 4 rows 94%; steeps 25 and 32 m 100%
    gully: { lv: 1, gap: [52, 62], how: 'wall' },          // (one wall to the other is ~24 m across the U)
    ridge: { lv: 0, gap: [60, 80], how: 'centre' },
    moguls: { lv: 1, gap: [11, 11], how: 'zip' },
    powder: { lv: 0, gap: [50, 70], how: 'weave', side: 9 },
    rollers: { lv: 1, gap: [45, 60], how: 'crest' },
  };
  if (typeof Variants !== 'undefined') Variants.def('ringdiff', '光圈难度', [['a', '轻松'], ['b', '标准'], ['c', '难']], 'b');
  const DIFF = { z: { off: -2, side: 0.3, gap: 1.35 }, a: { off: -1, side: 0.6, gap: 1.15 }, b: { off: 0, side: 1, gap: 1 }, c: { off: 1, side: 1.35, gap: 0.85 } };
  // (用户 2026-11-19 06:00 UTC: 标准非常密、非常难 → 06:02 选「整体降一档」) the layout each difficulty the player picks is laid out with:
  // the whole scale one step down (06:07 UTC: 难是现在的标准): 难 gets what 标准 had, 标准 what 轻松 had, 轻松 a sparser one still (z: bigger
  // rings, smaller swings, gaps a third longer); the old 难 layout (c) is kept in the tables, unused
  const lay = d => ({ a: 'z', b: 'a', c: 'b' })[d] || 'a';
  function station(s) {
    Course.at(s, pc);
    const segs = Course.segs || []; let sg = null; for (const g of segs) { if (g.s0 <= s) sg = g; else break; }
    const st = sg && Course.ROUTE && Course.route !== false && sg.idx < Course.ROUTE.length ? Course.ROUTE[sg.idx] : null;
    let pl = PLAN[sg ? sg.type : 'bowl'] || PLAN.bowl;
    if (st && st.aim) pl = Object.assign({}, pl, s - sg.s0 < 110 ? { how: 'centre', lv: 0 } : { how: 'weave', side: 7, lv: 0 });          // (the run swings round to face the city: the first rings frame it, then a wide weave)
    if (sg && sg.type === 'steeps' && st && st.enc) pl = Object.assign({}, pl, { how: 'apex', lv: 2 });          // (the last steep lane in the trees)
    if (sg && sg.type === 'corridor' && sg.idx > 2) pl = Object.assign({}, pl, { lv: 2 });          // (the second lane: tighter bends, smaller rings)
    return { pl, sg, st };
  }
  const bend = s => { const a = Course.at(s - 15, pc).cx, b = Course.at(s + 15, pc).cx, c = Course.at(s, pc).cx; return a + b - 2 * c; };
  const hump = s => { const cx = t => Course.at(t, pc).cx, h = t => Course.height(cx(t), -t, 0.5); return h(s - 8) + h(s + 8) - 2 * h(s); };
  // ---- laid by technique (用户 2026-11-18 17:20 UTC: 雪槽里的圈应该在雪槽的斜面上，鼓励在槽内滑；蘑菇区圈更密，鼓励在蘑菇上拐来拐去；
  // 所有道的目标都是引导玩家正确地滑这条道). Both lines use these wherever they cross a gully or a mogul field.
  // wallU: across the run, the point a share k of the way up the gully's wall on one side (side ±1); the wall is the gully's own shape
  // (Course.uWall for the U, the trough's bell otherwise), measured from the trough's line. null where there is no gully
  // (用户 19:08 UTC: 圈还是太靠上，放在斜坡中间，S 型滑的时候正好穿过去): the ring floats (r + gap, more on a slope), so the point it stands over is low on the wall
  const WALLK = { z: 0.24, a: 0.3, b: 0.38, c: 0.48 };
  function wallU(s, side, k) {
    const c = Course.at(s, pc); if (!(c.gul > 0.6)) return null;
    for (let a = 0; a <= 34; a += 0.25) {
      const ug = side * a, bell = Math.exp(-(ug * ug) / (c.gw * c.gw)), p = c.gU > 0.001 && Course.uWall ? bell + (Course.uWall(ug, c) - bell) * c.gU : bell;
      if (p <= 1 - k) return c.goff + ug;
    }
    return null;
  }
  // zipU: in a mogul field, the trough between two bumps on the crest row nearest s, beside the smooth line (the side with more bumps, kept for
  // the whole field), a little left or right (side ±1) of that strip's middle. { s, u } or null where there are no bumps
  let zipSide = 0, zipSeg = -1;
  function zipU(s, side) {
    const c = Course.at(s, pc); if (!(c.mog > 0.5) || !Course.mogShape || !Course.mogChan) return null;
    const M = Course.mogShape(), r0 = Math.round(s / M.L - M.Q), sr = (r0 + M.Q) * M.L, cr = Course.at(sr, pc), hw = cr.hw || 14, ch = Course.mogChan(sr, hw);
    const lo = [-hw * 0.8 + 1, ch - 6.5 - 1], hi = [ch + 6.5 + 1, hw * 0.8 - 1], sgi = station(sr).sg, id = sgi ? sgi.idx : -1;
    if (id !== zipSeg) { zipSeg = id; zipSide = (lo[1] - lo[0]) > (hi[1] - hi[0]) ? -1 : 1; }
    const z = zipSide < 0 ? lo : hi, w = z[1] - z[0]; if (w < 4) return null;
    const mid = (z[0] + z[1]) / 2, t = mid + side * Math.min(M.W * 0.5, w / 2 - 1.5);
    let best = t, bh = 1e9; for (let u = t - M.W * 0.5; u <= t + M.W * 0.5; u += 0.25) { if (u < z[0] || u > z[1]) continue; const h = Course.height(cr.cx + u, -sr, 0.5); if (h < bh) { bh = h; best = u; } }
    return { s: sr, u: best };
  }
  const ZIPROWS = { z: 5, a: 4, b: 3, c: 2 };          // (rows of bumps from one ring to the next: 标准 3 = 17 m, the closest an expert links smoothly)
  let wallSide = 1, cursor = null, lastHow = '';
  // (用户 2026-11-20 06:33 UTC：「圈儿太多了…你得有一些自由发挥的空间，有一些喘息的机会」; 06:34 简单的至少砍一半, 标准跟难的看情况砍;
  // 07:44「尽量是比较均匀的一个圈儿，别人可以有一个 expectation…然后再根据这个地形来 adjust」) rings come at an even, expected spacing:
  // RGAP metres apart at 90 km/h, a little longer where the slope runs faster (so about the same time apart), then nudged by the
  // terrain as before (a bend's apex, a crest, a gully wall, reachable from the ring before). About half the old count on 轻松,
  // about 60% on 标准 and 难
  const RGAP = { z: 125, a: 100, b: 85, c: 70 };          // (用户 08:18 UTC: 简单就是之前的一半，1/3 太少: 190 m gave ~30 of 92)
  const gapAt = (dk, s) => (RGAP[dk] || RGAP.a) * cl(vEst(s) * 3.6 / 90, 0.85, 1.25);
  // (简单: big rings, judged generously, laid along the run: no rings on a gully's wall or in a mogul trough; the jumps keep theirs, bigger)
  const EASY_R = 4.0, easyL = dk => dk === 'z';
  // ---- (用户 2026-11-19 06:08 UTC: 难度必须是选手用我们可用的这些手段跑得到的; 直线降速时就算铲雪转也转不过来) every ring must be one a
  // player can reach from the ring before with the game's own controls. Measured with tools/ring-reach.js (a pilot that, before each ring,
  // tries 48 ways of skiing to it in the game's physics: braking by skidding, how hard it steers, jumps, and keeps the quickest that also
  // makes the next): of 835 rings on both lines at all three levels, the 12 that no way reached were all rings too close in time to the
  // one before for the speed the slope gives there (steep pitches at 90-125 km/h, rings 9-32 m apart), or too far across for that time.
  // So: how fast a skier comes down here (the pilot's speeds against the fall of the run over the last 250 m, the faster tenth), at least
  // RT_T seconds from the ring before (0.6 s was the least that left out all 12; the owner: at least 1 s), and at most RT_U t^2 metres across from it in that time
  const RT_T = 1.0, RT_U = 8;          // (用户 07:14 UTC: 0.6 秒也很紧，至少 1 秒)
  function vEst(s) { const a = Math.max(0, s - 250), w = Math.max(30, s - a), c0 = Course.at(a, pc), c1 = Course.at(s, pc); const g = (Course.height(c0.cx, -a, 0.5) - Course.height(c1.cx, -s, 0.5)) / w; return cl(50 + 140 * g, 60, 150) / 3.6; }          // (07:2x-09:3x UTC checks at 1 s: steep rings met at 106-134 km/h, faster than this said: the upper end raised)
  const reachOK = (s0, u0, s, u) => { const t = (s - s0) / vEst(s); return t >= RT_T && Math.abs(u - u0) <= RT_U * t * t; };
  RG.reachOK = reachOK; RG.vEst = vEst; RG.reachStat = { moved: 0, dropped: 0 };          // (for test scripts)
  function spawn() {
    // (where the last ring, or the last place passed over without one, stood: a stretch with no ground rings is still walked through)
    const first = !!L.id && !cursor;
    if (!cursor) cursor = { s: -Game.s.p[2] + 25, u: Game.s.p[0] - Course.at(-Game.s.p[2], pc).cx };
    const s0 = cursor.s, u0 = cursor.u;
    const dk = lay((typeof Variants !== 'undefined' && Variants.val.ringdiff) || 'b'), D = DIFF[dk] || DIFF.a;
    let { pl } = station(s0 + 40);
    if (pl.how !== 'zip' && station(s0 + 12).pl.how === 'zip') pl = station(s0 + 12).pl;          // (the bumps start before the 40 m look-ahead says so)
    if (easyL(dk) && /^(zip|wall|apex)$/.test(pl.how)) pl = Object.assign({}, pl, { how: 'weave', side: 3, gap: pl.how === 'zip' ? [55, 70] : pl.gap });          // (简单: along the run, not on the technique)
    const gm = gapAt(dk, s0 + 60) * (0.94 + 0.12 * rand());          // (even, with a little give)
    let s = pl.how === 'zip' ? s0 + Math.max(ZIPROWS[dk] || 2, Math.round(gm / Course.mogShape().L)) * Course.mogShape().L : s0 + gm;
    // (a line: its last ring is the finish, big and in the middle of the run; nothing comes after it)
    if (L.id) {
      const sE = lineEnd();
      if (L.fin) { RG.rings.push({ id: serial++, s: 1e9, skip: true }); return; }
      // (越野线: the rings were all laid when the line was set up, along its own way through the trees; the next one past the last)
      if (L.id === 'x') {
        const q = xPlan().rings.find(q => q.s > s0 + 0.5);
        if (q && q.s <= sE - 70) { const c = Course.at(q.s, pc), x = c.cx + q.u, pick = SIZES.find(z => z[0] === q.r) || [q.r, '']; cursor = { s: q.s, u: q.u }; RG.rings.push({ id: serial++, s: q.s, u: q.u, x, y: floatY(x, q.s, q.r, -1e9), r: q.r, tag: pick[1], air: false, off: q.off, born: lastT, grow: -1, pass: -1, hit: 0, splash: -1 }); return; }
        s = sE;
      }
      // (用户 21:18 UTC: 最后一个圈要跟倒数第二个离得远一点): a ring that would stand within 70 m of the finish is left out, so the finish
      // ring stands on its own, a long straight run in after the last ring
      if (s > sE - 70) {
        const c = Course.at(sE, pc), r = 7.0; L.fin = true;          // (用户 18:54 UTC 终点是更大的圈; 21:33 UTC 不变颜色，还是绿色，更大、更密、动得更明显)
        RG.rings.push({ id: serial++, s: sE, u: 0, x: c.cx, y: floatY(c.cx, sE, r, -1e9), r, tag: '终点', fin: true, air: false, born: lastT, grow: -1, pass: -1, hit: 0, splash: -1 }); cursor = { s: sE, u: 0 }; return;
      }
    }
    // (用户 2026-11-20 08:21 UTC：不管简单、标准还是难，跳台跳起来那儿都得有圈，那是非常好的地方，必须确保有) every flagged kicker gets its
    // air ring, on every level: the first kicker not yet given one whose ring (14 m past the lip) is still ahead of the last ring, up to
    // where this ring could end up after the terrain moves it. The old window (from 10 m past the last ring) lost a kicker the ring
    // before stood just in front of, and 简单 had none at all
    const f = kickerAhead(s0, s + 60);
    const lvAir = cl(D.off, 0, 2);
    // (用户 20:47 UTC: 跳台的圈离跳台远一点，必须真的跳出一定距离和高度才穿得过去，而不是顺着跳台滑过去就一定通过). Measured on the run's three
    // kickers (tools/kicker-air.js, 15-18 m/s at the lip): 14 m past the lip, skiing flat over it the body is 2.6-4.9 m below the lip,
    // with the jump held it is 0.1-2.2 m below. So the ring hangs there, its centre 1 m below the lip, and is small (1.9 / 1.6 / 1.35 m
    // by 光圈难度; 简单 2.5 m, 1.3 m below the lip: a small hop is enough): only a real jump goes through it
    if (f) { kUsed.add(f); const lip = lipOf(f), sr = lip.s + 14, c = Course.at(sr, pc), z = SIZES[lvAir], ez = easyL(dk), ra = ez ? 2.5 : [1.9, 1.6, 1.35][lvAir]; RG.rings.push({ id: serial++, s: sr, u: f.u, x: c.cx + f.u, y: floatY(c.cx + f.u, sr, ra, lip.y - (ez ? 1.3 : 1.0)), r: ra, tag: (ra * 2).toFixed(1) + ' 米', air: true, born: lastT, grow: -1, pass: -1, hit: 0, splash: -1 }); cursor = { s: sr, u: f.u }; return; }
    if (pl.how === 'none') { cursor = { s, u: u0 }; RG.rings.push({ id: serial++, s, skip: true }); return; }
    const c0 = Course.at(s, pc), hw = c0.hw || 14;
    let u, tech = false;
    if (pl.how === 'apex') {
      // the bend's apex within the next stretch: where the run curves most; the ring on its inside
      let best = s, bk = 0; for (let t = s - 15; t <= s + 25; t += 5) { const k = bend(t); if (Math.abs(k) > Math.abs(bk)) { bk = k; best = t; } }
      if (Math.abs(bk) > 0.15) { s = best; u = Math.sign(bk) * hw * (D.off > 0 ? 0.45 : 0.3); } else u = u0 + (rand() < 0.5 ? -1 : 1) * 4 * D.side;
    } else if (pl.how === 'crest') {
      let best = s, bk = 0; for (let t = s - 15; t <= s + 20; t += 2.5) { const k = hump(t); if (k < bk) { bk = k; best = t; } }
      s = best + 5; u = u0 + (Math.abs(u0) > 2 ? -Math.sign(u0) : (rand() < 0.5 ? -1 : 1)) * (4 + 5 * rand()) * D.side;
    } else if (pl.how === 'wall') { wallSide = -wallSide; u = wallU(s, wallSide, WALLK[dk] || 0.6); tech = u !== null; if (!tech) u = u0 + (Math.abs(u0) > 2 ? -Math.sign(u0) : 1) * 6 * D.side; }
    else if (pl.how === 'zip') { wallSide = -wallSide; const z = zipU(s, wallSide); tech = !!z; if (z) { s = z.s; u = z.u; } else u = u0 + (Math.abs(u0) > 2 ? -Math.sign(u0) : 1) * 5 * D.side; }
    else if (pl.how === 'centre') u = (rand() - 0.5) * 3;
    else { const dir = Math.abs(u0) > 2 ? -Math.sign(u0) : (rand() < 0.5 ? -1 : 1); u = u0 + dir * (0.6 + 0.6 * rand()) * pl.side * 1.6 * D.side; }          // (side to side, a slalom: always back across the run)
    const c = Course.at(s, pc), hw2 = c.hw || 14;
    if (!tech) u = cl(u, -hw2 * 0.6, hw2 * 0.6);
    if (first && !tech) u = u0;          // (用户 18:08/18:11 UTC: 第一个圈在正前方，慢慢预热；只要第一个)
    // (reachable from the ring before: later down the hill until there is time for it, then, if still too far across, nearer; the
    // technique rings keep their place on the wall or in the trough and only move down the hill. The bumps are skied slowly: not them)
    // (in the bumps: a row further on at a time, the ring still in its trough. 07:5x UTC check: the field's rings 17 m apart were met at
    // 65-71 km/h and no way through them was found; the bumps do not slow a skier as much as was thought)
    if (pl.how === 'zip' && !first) { const L2 = Course.mogShape().L; for (let k = 0; k < 6 && !reachOK(s0, u0, s, u); k++) { s += L2; const z = zipU(s, wallSide); if (z) { s = z.s; u = z.u; } } }
    if (!first && !reachOK(s0, u0, s, u)) {          // (the bumps too, once a few rows on still left it too far across: 08:3x UTC check)
      RG.reachStat.moved++;
      const v = vEst(s); if (s - s0 < RT_T * v) s = s0 + RT_T * v;
      if (tech && pl.how === 'wall') { for (let k = 0; k < 12 && !reachOK(s0, u0, s, u); k++) { s += 4; const w2 = wallU(s, wallSide, WALLK[dk] || 0.6); if (w2 !== null) u = w2; } }
      if (!reachOK(s0, u0, s, u)) { const t = (s - s0) / vEst(s), dm = RT_U * t * t; u = u0 + cl(u - u0, -dm, dm); tech = false; }
    }
    let uu = tech ? clear(s, u, hw2, 40) : clear(s, u, hw2); if (uu === null) { cursor = { s, u: u0 }; RG.rings.push({ id: serial++, s, skip: true }); return; }
    // (用户 04:47 UTC 一整个圈; 16:55 UTC 不要接到雪地上，留一点空间，悬浮起来): the whole ring floats, its lowest point a little above the snow
    const lv = cl(Math.round(pl.lv + D.off + (pl.how === 'zip' ? 0.4 : (rand() - 0.5) * 1.3)), 0, 2), pick = easyL(dk) ? [EASY_R, (EASY_R * 2) + ' 米'] : SIZES[lv], r = pick[0];
    // (seen from the chase camera coming up on the ring before: else the nearest place it is, sideways a little or pulled in. Technique
    // rings (gully walls, mogul troughs) move at most 3 m sideways, the rest within the run)
    let x = c.cx + uu;
    { const live = RG.rings.filter(q => !q.skip), cr = live[live.length - 1], pr = live[live.length - 2];
      if (cr && !cr.air && !cr.fin) {
        const P = pr ? { x: pr.x0 !== undefined ? pr.x0 : pr.x, s: pr.s } : { x: cr.x, s: cr.s - 30 }, Cq = { x: cr.x0 !== undefined ? cr.x0 : cr.x, s: cr.s }, st = RG.sightStat; st.tried++;
        const okA = (s2, u2) => { const c2 = Course.at(s2, pc); return (pl.how === 'zip' || reachOK(s0, u0, s2, u2)) && Math.abs(u2) <= (c2.hw || 14) - 3 && clear(s2, u2, c2.hw || 14, 40) !== null && Math.abs(clear(s2, u2, c2.hw || 14, 40) - u2) < 0.01; };
        const f = sightFix(P, Cq, { s, u: uu, r }, okA, tech ? 3 : 8);
        if (f) { if (f.moved) { st.moved++; s = f.s; uu = f.u; x = Course.at(s, pc).cx + uu; } } else st.failed++;
      } }
    cursor = { s, u: uu }; lastHow = pl.how;
    RG.rings.push({ id: serial++, s, u: uu, x, y: floatY(x, s, r, -1e9), r, tag: pick[1], air: false, born: lastT, grow: -1, pass: -1, hit: 0, splash: -1 });
  }

  // ---- (用户 2026-11-18 22:14 UTC: 设定圈的时候要确保追身视角靠近当前圈的时候能看到下一个圈或者光柱！全部检查一遍)
  // Coming up on a ring, the chase camera must have the ring after it, or the light column over it while it is still a flame, in the
  // picture and not behind the snow or a tree. The lens as the game has it (07_game.js): about 4.3 m behind the skier and 1.8 m over
  // the snow, turned a little over half way from the valley toward the skier's heading (at most 0.7 rad), a 16:9 frame some 44 degrees
  // either side. Tried 25, 15 and 8 m short of the ring, the skier coming in on the line from the ring before. Targets: the ring's centre
  // and top, and, while it is still a flame (more than ~45 m off, OPEN in update()), the column at 3..28 m over it (22:31 UTC: the column is enough, the ring itself may be out of the picture). Trees as the game's
  // own lens takes them (a cone of boughs 0.24 x height wide at its foot); the 6 m from the lens past the skier are left out (14_trees.js
  // fades what stands against it). tools/ring-sight.js checks the same thing on a real ride with the real camera.
  const tnS = {};
  function losClear(e, q) {
    const dx = q[0] - e[0], dy = q[1] - e[1], ds = q[2] - e[2], Lq = Math.hypot(dx, dy, ds), n = Math.ceil(Lq / 1.5);
    for (let i = 1; i < n; i++) {
      const f = i / n, x = e[0] + dx * f, y = e[1] + dy * f, s = e[2] + ds * f, dl = Lq * f;
      if (y < Course.height(x, -s, 0.5) + 0.05) return false;
      if (dl > 6 && Lq - dl > 2) { Course.nearTree(x, -s, tnS); if (tnS.ok && !tnS.soft) { const g = Course.height(tnS.x, tnS.z, 0.5), hy = (y - g) / Math.max(1, tnS.h); if (hy > 0.08 && hy < 1 && tnS.d < 0.24 * tnS.h * (1 - hy) + 0.25) return false; } }
    }
    return true;
  }
  // p the ring before, c the ring being come up on, q the one after it: {x (world), s, r}
  function sightOK(p, c, q) {
    let ix = c.x - p.x, is = Math.max(1, c.s - p.s); const l = Math.hypot(ix, is); ix /= l; is /= l;
    const head = Math.atan2(ix, is), cy = Course.yawAt(c.s), camY = cy + cl((head - cy) * 0.55, -0.7, 0.7), yq = floatY(q.x, q.s, q.r, -1e9);
    for (const d of [8, 15, 25]) {
      const sx = c.x - ix * d, ss = c.s - is * d, ex = sx - Math.sin(camY) * 4.3, es = ss - Math.cos(camY) * 4.3, ey = Course.height(ex, -es, 0.5) + 1.8;
      let da = Math.atan2(q.x - ex, q.s - es) - camY; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > 0.66) { RG.sightWhy = 'frame@' + d; return false; }
      const T = [[q.x, yq, q.s], [q.x, yq + q.r, q.s]];
      if (Math.hypot(q.x - sx, q.s - ss) > 45) for (const h of [3, 8, 14, 20, 28]) T.push([q.x, yq + q.r * 0.5 + h, q.s]);          // (only a flame has its column: within ~45 m it has opened, OPEN in update())
      if (!T.some(t => losClear([ex, ey, es], t))) { RG.sightWhy = 'hid@' + d; return false; }
    }
    return true;
  }
  // the nearest place to q (sideways first, then pulled in toward c) from where it is seen: {s, u} or null when none within reach.
  // ok(s, u) says whether a place is allowed at all (room among trees, on the run, ...); duMax how far sideways it may go
  function sightFix(p, c, q, ok, duMax) {
    const tries = []; for (const ds of [0, -3, 4, -6, -9, 8, -12, -16]) for (const du of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 8, -8, 10, -10, 12, -12]) if (Math.abs(du) <= duMax && q.s + ds - c.s >= 8) tries.push([Math.abs(du) + 0.5 * Math.abs(ds), ds, du]);
    tries.sort((a, b) => a[0] - b[0]);
    for (const [, ds, du] of tries) {
      const s = q.s + ds, u = q.u + du; if (!ok(s, u)) continue;
      if (sightOK(p, c, { x: Course.at(s, pc).cx + u, s, r: q.r })) return { s, u, moved: ds !== 0 || du !== 0 };
    }
    return null;
  }
  RG.sightOK = sightOK; RG.sightStat = { tried: 0, moved: 0, failed: 0 };
  // Every ring floats: the snow under any part of its lower half stays at least GAP below it (ground rings and air rings alike).
  const GAP = 0.9;          // (用户 20:47 UTC: 离地再高一点; was 0.35)
  function floatY(x, s, r, y, yaw = 0) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);          // (a ring turned to face the line: its lower half reaches up or down the slope too)
    let top = -1e9; for (let i = -6; i <= 6; i++) { const a = i / 6 * 1.2, dx = Math.sin(a) * r, dy = -Math.cos(a) * r; top = Math.max(top, Course.height(x + dx * cy, -(s - dx * sy), 0.5) - dy); }
    return Math.max(y, top + GAP);
  }
  function reset() { RG.rings.length = 0; RG.passed = RG.missed = 0; RG.streak = 0; rnd = L.id ? L.seed : 1 + Math.floor((Date.now() % 100000)); lastS = null; drawList = []; cursor = null; lastHow = ''; kUsed.clear(); L.fin = false; }

  // ---- each frame, before the game draws
  function update(T) {
    const S = Game.s, s = -S.p[2];
    if (lastS !== null && (s < lastS - 30 || s > lastS + 200)) reset();
    lastS = s;
    RG.rings = RG.rings.filter(r => !(r.pass >= 0 && T - r.pass > 2.4));
    // (用户 16:55 UTC 微小的左右、上下抖动): each ring sways a few centimetres round its place, slowly and never in step with the others
    for (const r of RG.rings) {
      if (r.skip) continue;
      if (r.x0 === undefined) { r.x0 = r.x; r.y0 = r.y; r.ph = (r.id * 2.39996) % 6.283; }
      const w = T * 6.283, p = r.ph;
      r.x = r.x0 + 0.09 * Math.sin(w * 0.31 + p) + 0.04 * Math.sin(w * 0.73 + p * 2.1);
      r.y = r.y0 + 0.07 * Math.sin(w * 0.43 + p * 1.7) + 0.03 * Math.sin(w * 0.91 + p * 0.6);
    }
    let live = RG.rings.filter(r => r.pass < 0).length;
    for (let tries = 0; live < AHEAD && tries < 20; tries++) { spawn(); const r = RG.rings[RG.rings.length - 1]; if (r.skip) RG.rings.pop(); else live++; }
    aim(S, s);
    const ahead = RG.rings.filter(r => r.pass < 0);
    const cur = ahead[0]; if (!cur) return;
    const v = Math.max(6, S.speed || 0), dCur = cur.s - s;
    // (用户 2026-11-18 20:36 UTC: 下一个火焰必须在我到一定距离之内才变成光圈；两个圈离得远时，刚穿过第一个，还没看到第二个火和上面的光柱它就
    // 已经变成光圈了，又找不见了) a flame opens into its ring only once the skier is within about 3 s of it (at least 45 m): until then it
    // stays a flame with its column over it, however far off, so the way on can always be found. On a challenge line the first one also
    // waits through 3-2-1 (用户 22:34 UTC) and opens on 出发
    const OPEN = Math.max(45, v * 3);
    if (cur.grow < 0 && L.st !== 'count' && (dCur < OPEN || RG.passed + RG.missed === 0)) cur.grow = T;
    // (用户 15:54 UTC: 一群光游过去 没有效果) it set off at the splash, 1.6 m before the ring, lost in the splash's own burst and then riding
    // along with the camera. Now it leaves while the ring is still ahead, ~0.6 s out (at least 12 m), so it is seen swimming off toward the next
    if (cur.flowT === undefined && !cur.fin && dCur < Math.max(18, v * 1.0)) cur.flowT = T;          // (Mac check 16:1x UTC: at 0.6 s / 4.5% it was barely seen: now ~1 s out)

    // (用户 05:16 UTC: 离圈一两米、头碰到圈面之前就要 splash 散开，半米一米时能不能过已经定了): the splash starts 1.6 m before the ring's plane
    // (用户 2026-11-18 21:47 UTC: 圈的方向是固定的吗？应该对着下一个圈) the ring now faces the way the line goes through it (aim()), so both
    // the plane the skier crosses and 'across' are the ring's own: dN how far past its plane, dA how far off its centre along it
    const yw = cur.yaw || 0, ex = S.p[0] - cur.x, es = s - cur.s, dN = ex * Math.sin(yw) + es * Math.cos(yw), dA = ex * Math.cos(yw) - es * Math.sin(yw);
    if (dN > -1.6 && cur.splash < 0) {
      const dy = (S.p[1] + 0.9) - cur.y;
      cur.splash = T; cur.hit = cur.air ? (Math.hypot(dA, dy) < cur.r) : (Math.abs(dA) < cur.r * (easyL(lay(diffKey())) ? 1.15 : 0.85));
    }
    if (dN >= 0 || dCur < -6) {          // through or past it
      const dy = (S.p[1] + 0.9) - cur.y;
      cur.hit = cur.air ? (Math.hypot(dA, dy) < cur.r) : (Math.abs(dA) < cur.r * (easyL(lay(diffKey())) ? 1.15 : 0.85));          // (ground rings: judged across only, the skier rides through the lower part)
      if (cur.splash < 0) cur.splash = T;
      if (cur.fin) { cur.hit = true; cur.pass = T; ringNote(0, true, 0); lineFinish(); return; }
      cur.pass = T; if (cur.hit) RG.passed++; else RG.missed++;
      // (用户 2026-11-18 22:58 UTC: 过圈音乐蹦一个音) the score answers each ring passed, climbing while the run of rings goes on (18b_music.js S.ring)
      RG.streak = cur.hit ? (RG.streak || 0) + 1 : 0; if (cur.hit) ringNote(RG.streak - 1, false, dA / Math.max(1, cur.r));
      if (ahead[1] && ahead[1].grow < 0 && ahead[1].s - s < OPEN) ahead[1].grow = T;
    }
  }
  // (用户 2026-11-18 21:47 UTC: 光圈的方向是固定的吗？是不是应该对着下一个光圈) each ring turns to face the way the line runs through it:
  // the bisector of the way in (from the ring before, or from where the skier was when it came) and the way out (to the ring after), as
  // a slalom gate or an air-race gate is set square to the line through it. Pointing at the next ring alone would still be entered
  // slantwise. Until the ring after exists the way in alone is used; once both are known it is fixed. At most 55 degrees off the fall
  // line (the skier always runs downhill), the finish square on.
  const YAWMAX = 55 * Math.PI / 180;
  function aim(S, s) {
    let prev = null;
    for (let i = 0; i < RG.rings.length; i++) {
      const r = RG.rings[i]; if (r.skip) continue;
      const rx = r.x0 !== undefined ? r.x0 : r.x;
      if (r.pvS === undefined) { if (prev) { r.pvX = prev.x0 !== undefined ? prev.x0 : prev.x; r.pvS = prev.s; } else { r.pvX = S.p[0]; r.pvS = Math.min(s, r.s - 20); } }
      if (!r.yawFix) {
        if (r.fin) { r.yaw = 0; r.yawFix = true; }
        else {
          let nx = null; for (let k = i + 1; k < RG.rings.length; k++) if (!RG.rings[k].skip) { nx = RG.rings[k]; break; }
          let ix = rx - r.pvX, is = Math.max(1, r.s - r.pvS); const li = Math.hypot(ix, is); ix /= li; is /= li;
          let ax = ix, as = is;
          if (nx) { let ox = (nx.x0 !== undefined ? nx.x0 : nx.x) - rx, os = Math.max(1, nx.s - r.s); const lo = Math.hypot(ox, os); ax += ox / lo; as += os / lo; r.yawFix = true; }
          r.yaw = RG.noYaw ? 0 : cl(Math.atan2(ax, as), -YAWMAX, YAWMAX);          // (RG.noYaw: tools compare with the old square-on rings)
          if (r.yawFix) { const y = floatY(rx, r.s, r.r, r.y0 !== undefined ? r.y0 : r.y, r.yaw); if (r.y0 !== undefined) { r.y += y - r.y0; r.y0 = y; } else r.y = y; }
        }
      }
      prev = r;
    }
  }
  // what each ring is this frame: how far open, how far scattered, how bright (far ones barely there), and its flame
  function prep(T) {
    const S = Game.s, s = -S.p[2], cam = Render.cam.pos, o = Render.origin, night = cl(((Sky.night || 0) - 0.2) / 0.6, 0, 1);
    const ahead = RG.rings.filter(r => r.pass < 0), fmode = typeof Variants !== 'undefined' ? ({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 })[Variants.val.rflow] || 0 : 0;
    drawList = [];
    const cols = ahead.filter(q => q.grow < 0 && !q.fin && !q.skip).slice(0, 3), dtP = Math.min(0.1, Math.max(0, T - (RG.prepT || T))); RG.prepT = T;
    for (const r of RG.rings) {
      const dist = Math.hypot(r.x - cam[0], r.y - cam[1], -r.s - cam[2]), ord = r.pass >= 0 ? 0 : ahead.indexOf(r);
      const sz = Math.sqrt(r.r / 4.5), near = Math.pow(cl(1 - (dist - 25) / 280, 0.16, 1), 1.2);          // (用户 20:39 UTC: 有时候还是比较淡，亮一点、点多一点: far ones still fainter, but not lost)
      if (r.fin && r.grow < 0) r.grow = r.born - 1;          // (the finish is a whole ring from the moment it is there, never a flame)
      const grown = r.grow >= 0 ? cl((T - r.grow) / 0.9, 0, 1) : 0;
      const dis = r.splash >= 0 ? cl((T - r.splash) / 2.2, 0, 1) : 0;
      const ordK = ord <= 1 ? 1 : ord === 2 ? 0.62 : 0.4;
      const flameA = r.fin ? 0 : (grown < 1 ? (1 - cl((grown - 0.35) / 0.35, 0, 1)) : 0) * near * ordK * cl((T - r.born) / 0.6, 0, 1);
      const open = grown > 0.3 ? ease((grown - 0.3) / 0.6) : 0, A = cl((grown - 0.3) / 0.3, 0, 1) * Math.max(0.5, near);
      const c = [r.x - o[0], r.y - o[1], -r.s - o[2]];
      // (下一个圈提示, Variants rflow): the next ring along, for the ring being ridden at (and the one just splashing): where the cue points.
      // ap: how near this ring is, 0 far .. 1 close (the cues that show before the ring is reached grow with it; the 光柱 starts further out)
      let nx = null, ap = 0, bk = 0;
      if (fmode === 7) {
        // (用户 16:44 UTC: 喜欢细高光柱；一开始有一个光柱，等火团变成光球以后，光柱比较快地消失) the column stands over each of the next two
        // rings for as long as it is a flame, and goes in about 0.3 s once the flame opens into a ring
        // (16:45 UTC: 被火团吸进去) bk 1 while the flame burns and while the column is being drawn in; ab how far in, over ~0.7 s of opening
        // (16:49 UTC: 太快了，慢一点；不用全部吸进来，有些慢慢 fade out，只要顺序从上往下) ~1.6 s from when the flame starts to open
        const abT = r.grow >= 0 ? cl((T - r.grow) / 1.6, 0, 1) : 0;
        // (用户 20:45 UTC: 接下来几个圈都有这条线是好的，但要区分开：紧接着下一个最亮，第二个明显暗一点，第三个非常暗; 20:39 UTC 开局两条
        // 一样亮的线分不清哪个是第一个) a column over each of the next three flames still to open, at 1, 0.4 and 0.13 of the brightness, each
        // easing to its new rank in ~0.4 s as the one before it opens; an opening ring's column fades out top first from where it stood
        const rk = cols.indexOf(r), tgt = rk >= 0 ? COLK[rk] : r.grow >= 0 ? (r.colK || 0) : 0;
        if (rk >= 0) r.colOn = true;
        r.colK = r.colK === undefined ? tgt : r.colK + (tgt - r.colK) * Math.min(1, dtP * 2.5);
        if (!r.fin && abT < 1 && r.colOn && r.colK > 0.01) { bk = 1; nx = [c[0], c[1], c[2], r.r]; ap = r.colK; }
      } else if (fmode && !r.fin && (r.splash >= 0 || ord === 0)) {
        const dC = r.s - s; ap = r.splash >= 0 ? 1 : fmode === 5 || fmode === 7 || fmode === 8 ? cl(1 - (dC - 10) / 70, 0, 1) : cl(1 - (dC - 6) / 34, 0, 1); const i = RG.rings.indexOf(r); for (let k = i + 1; k < RG.rings.length; k++) { const q = RG.rings[k]; if (q.skip) continue; nx = [q.x - o[0], q.y - o[1], -q.s - o[2], q.r]; break; } }
      drawList.push({ r, nx, ap, bk, ab: fmode === 7 && r.grow >= 0 ? cl((T - r.grow) / 1.6, 0, 1) : 0, fmode, fl: r.flowT >= 0 ? T - r.flowT : -1, dist, c, sz, near, grown, dis, open, A, flameA, night, ord, flameSc: (1 + 1.6 * ease(grown / 0.35)) * (ord <= 1 ? 1 : ord === 2 ? 0.85 : 0.72), tint: ord <= 1 ? 0 : ord === 2 ? 1 : 2, hitK: r.hit || r.splash < 0 ? 1 : 0.5 });
    }
    drawList.sort((a, b) => b.dist - a.dist);          // far first: the near ring's tube writes depth over what lies behind it
  }
  function hud() {
    
    if (!RG.hud) { RG.hud = document.createElement('div'); RG.hud.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);font:500 13px/1 system-ui,sans-serif;letter-spacing:.12em;color:rgba(255,255,255,.85);text-shadow:0 1px 3px rgba(0,0,0,.45);pointer-events:none;z-index:3'; document.body.appendChild(RG.hud); }
    RG.hud.style.display = RG.on && !L.id ? '' : 'none'; if (L.id) return;
    const cur = RG.rings.find(r => r.pass < 0 && !r.skip), dn = T({ a: '轻松', b: '标准', c: '难' }[(typeof Variants !== 'undefined' && Variants.val.ringdiff) || 'b'] || '标准'), t = tx('光圈（' + dn + '） ', 'Rings (' + dn + ') ') + RG.passed + ' / ' + (RG.passed + RG.missed) + (cur && cur.tag ? tx('　·　这个圈直径 ' + cur.tag, '　·　this ring ' + cur.tag.replace(' 米', ' m').replace('终点', 'finish')) : ''); if (RG.hud.textContent !== t) RG.hud.textContent = t;
  }

  // ---- the GPU side
  const ringU = (d, T) => ({ a: [d.c[0], d.c[1], d.c[2], d.r.r], b: [d.open, d.dis, d.A, d.near], c: [T, d.r.id % 4096, d.hitK, d.sz], d: [d.night, d.r.fin ? 1 : 0, d.grown, d.nx ? d.fmode : 0], e: [Math.round(9600 * d.sz * (d.r.fin ? 2 : 1)), Math.round(800 * d.sz * (d.r.fin ? 2 : 1)), 0, d.ap || 0], f: d.nx || [0, 0, 0, 0], g: [d.fl, d.ab || 0, 0, d.r.yaw || 0] });
  const ringLive = d => d.grown > 0.3 && d.dis < 1 && d.open > 0.01;
  RG.init = function (g) {
    gfx = g;
    const lib = [SL.common, SL.hash, SL.fog, RING_SSL];
    const UR = { a: 'vec4f', b: 'vec4f', c: 'vec4f', d: 'vec4f', e: 'vec4f', f: 'vec4f', g: 'vec4f' };
    pDust = gfx.pipeline({
      name: 'ringDust', lib: lib.concat([DUST_SSL]), buffers: [], topology: 'strip', cull: 'none', blend: 'premul', depthWrite: false, depthFunc: 'lequal',
      varyings: { uv: 'vec2f', col: 'vec4f', sh: 'vec4f' }, uniforms: UR, textures: { tSky: '2d' }, vs: DUST_VS, fs: SPARK_FS,
    });
    pDustSh = gfx.pipeline({
      name: 'ringDustShadow', lib: [SL.common, SL.hash, RING_SSL, DUST_SSL], buffers: [], topology: 'strip', varyings: { uv: 'vec2f' }, uniforms: UR, textures: {}, colorFormat: null, cull: 'none', depthBias: 2, depthBiasSlope: 2.5,
      vs: DUST_SH_VS, fs: DUST_SH_FS,
    });
    pFlame = gfx.pipeline({
      name: 'ringFlame', lib, buffers: [], topology: 'strip', cull: 'none', blend: 'premul', depthWrite: false, depthFunc: 'lequal',
      varyings: { uv: 'vec2f', col: 'vec4f', sh: 'vec4f' }, uniforms: { a: 'vec4f', b: 'vec4f', c: 'vec4f' }, textures: { tSky: '2d' }, vs: FLAME_VS, fs: SPARK_FS,
    });
    pLight = gfx.pipeline({
      name: 'ringLight', lib: [SL.common, SL.fog, SL.depth, RING_SSL], buffers: [], topology: 'strip', cull: 'none', blend: 'add', depth: false, depthTest: false,
      varyings: { uv: 'vec2f' }, uniforms: { a: 'vec4f', b: 'vec4f', c: 'vec4f' }, textures: { tDepth: 'depth', tSky: '2d' }, vs: LIGHT_VS, fs: LIGHT_FS,
    });
    RG.pipes = [pDust, pDustSh, pFlame, pLight];
    if (gfx.finishPipelineAsync) for (const P of RG.pipes) gfx.finishPipelineAsync(P).catch(e => console.warn('rings pipeline', P.name, e && e.message ? e.message : e));
  };
  const active = () => RG.on && gfx && typeof Game !== 'undefined' && Game.s && (Game.mode === 'run' || Game.mode === 'hold' || Game.mode === 'park' || Game.mode === 'replay') && drawList.length;
  RG.drawShadow = function () {
    if (!active()) return;
    for (const d of drawList) if (ringLive(d)) { const u = ringU(d, lastT % 4096); gfx.draw(pDustSh, { u, count: 4, instances: u.e[0] + u.e[1] }); }
  };
  RG.drawScene = function () {
    if (!active()) return;
    const T = lastT % 4096, tex = { tSky: Sky.lut };
    for (const d of drawList) {
      if (d.flameA > 0.01) gfx.draw(pFlame, { u: { a: [d.c[0], d.c[1], d.c[2], d.flameSc], b: [d.flameA, d.sz, d.tint, 0], c: [T, d.r.id % 4096, d.night, 0] }, tex, count: 4, instances: 2 + TONGUES });
      if (ringLive(d)) {
        const u = ringU(d, T);
        gfx.draw(pDust, { u, tex, count: 4, instances: u.e[0] + u.e[1] + u.e[2] });
      } else if (d.bk > 0) {
        // (性能: a flame's column alone) only the column's own grains are drawn, not the whole ring's thousands: g.z tells the shader
        // that every instance here is a column grain
        const u = ringU(d, T); u.g[2] = 1;
        gfx.draw(pDust, { u, tex, count: 4, instances: Math.round(u.e[0] * 0.035) });
      }
    }
  };
  // the ring's light on what is round it: the snow under it, the skier riding through, a tree beside it
  RG.drawLight = function (R) {
    if (!active()) return;
    const tex = { tDepth: R.depth, tSky: Sky.lut };
    for (const d of drawList) {
      const k = d.night * 0.85 + 0.15;
      if (ringLive(d)) { const I = 0.16 * k * d.A * d.near * Math.pow(1 - d.dis, 2); if (I > 0.002) gfx.draw(pLight, { u: { a: [d.c[0], d.c[1], d.c[2], d.r.r * d.open], b: [0.10, 0.95, 0.55, I], c: [d.r.r * d.open + 4.5, 0, 0, 0] }, tex, count: 4 }); }
      if (d.flameA > 0.01) { const I = 0.30 * k * d.flameA * d.flameSc; gfx.draw(pLight, { u: { a: [d.c[0], d.c[1], d.c[2], 0], b: [0.15, 1.0, 0.80, I], c: [5.5 * Math.min(1.6, d.flameSc), 0, 0, 0] }, tex, count: 4 }); }
    }
  };

  // ---- 穿圈拖影 (用户 18:51 UTC: 钻进光圈的时候来一个延迟摄影、拖影子的效果，试一下，只是一个分支; 18:53 UTC: 每隔比如 0.5 米留一个残影).
  // Like a sequence photo of a skier: from a few metres before a ring until just after it, every 0.5 m the skier leaves a see-through copy of
  // himself (his pose at that moment), which fades in about half a second. Only the body, never the camera or the time: the game runs on as is.
  if (typeof Variants !== 'undefined') Variants.def('rflow', '下一个圈提示', [['off', '关'], ['a', '一群光游过去'], ['b', '一缕光线'], ['c', '细流引路'], ['d', '亮边指方向'], ['e', '远处光柱'], ['f', '溪流（连成一条）'], ['g', '细高光柱'], ['h', '螺旋光柱']], 'g');
  if (typeof Variants !== 'undefined') Variants.def('rtrail', '穿圈拖影', [['off', '关'], ['a', '残影·白'], ['b', '残影·光圈色']], 'off');
  const TR = { list: [], last: null, now: 0, done: 0, passT: null, STEP: 0.5, LIFE: 0.8, REACH: 3.2, BEFORE: 7, AFTER: 0.4 };
  function trail() {
    const mode = typeof Variants !== 'undefined' ? Variants.val.rtrail : 'off', T = Game.runT || 0;          // (game time: a pause or a test stepping frame by frame keeps them as they were)
    // (Mac 截图 19:00 UTC: at 90 km/h half a second of copies reached back past the camera and filled the screen with huge ghosts): the copies
    // are kept only while they are within REACH metres of the skier, so the chase camera always looks at them from behind, never through them
    const P0 = Game.s ? Game.s.p : [0, 0, 0];
    for (const g of TR.list) g.d = Math.hypot(g.w[0] - P0[0], g.w[1] - P0[1], g.w[2] - P0[2]);
    TR.list = TR.list.filter(g => T - g.t < TR.LIFE && T >= g.t && g.d < TR.REACH); TR.now = T;
    if (!mode || mode === 'off' || typeof Skier === 'undefined' || !Skier.ghostSnap) { TR.list.length = 0; TR.last = null; return; }
    const S = Game.s, s = -S.p[2], done = RG.passed + RG.missed;
    if (done !== TR.done) { TR.done = done; TR.passT = T; }
    const cur = RG.rings.find(r => r.pass < 0 && !r.skip);
    const on = (cur && cur.s - s < TR.BEFORE) || (TR.passT != null && T - TR.passT < TR.AFTER);
    if (!on) { TR.last = null; return; }
    const p = [S.p[0], S.p[1], S.p[2]];
    if (TR.last && Math.hypot(p[0] - TR.last[0], p[1] - TR.last[1], p[2] - TR.last[2]) < TR.STEP) return;
    TR.last = p;
    const g = Skier.ghostSnap(Render.origin, T); if (!g) return; g.w = p; g.d = 0;
    TR.list.push(g); while (TR.list.length > 15) TR.list.shift();          // (the bone copies are a ring of 16: never draw one already written over)
  }
  RG.ghosts = () => TR.list.length;          // (for test scripts)
  RG.drawGhosts = function () {
    if (!TR.list.length || !RG.on || typeof Game === 'undefined' || !Game.s || !Skier.drawGhosts) return;
    const o = Render.origin, mode = Variants.val.rtrail, n = TR.list.length, out = [];
    for (let i = 0; i < n - 1; i++) {          // oldest first; the newest one sits in the skier, left out
      const g = TR.list[i], age = cl((TR.now - g.t) / TR.LIFE, 0, 1), far = cl(g.d / TR.REACH, 0, 1), a = Math.pow(1 - far, 1.3) * Math.pow(1 - age, 1.5) * 0.55;
      if (a < 0.01) continue;
      const q = mode === 'b' ? [0.25 + 0.4 * far, 1.0 - 0.6 * far, 0.7 + 0.3 * far, 0.85] : [0.85, 0.93, 1.0, 0.8];
      out.push({ tex: g.tex, p: [g.o[0] - o[0], g.o[1] - o[1], g.o[2] - o[2], a], q });
    }
    Skier.drawGhosts(out);
  };

  // ---- 光圈路线 (用户 17:18 UTC: 先按速降线、探索线的光圈路线做一个；开始要不要倒计时、结束怎么提示、成绩页都要先想清楚).
  // The first line is a downhill line (速降线) over the designed run: its rings stand in the same places every time (a fixed seed for each
  // line and 光圈难度), so it can be learnt. Start: from the gate the skier is held while 3, 2, 1, 出发 counts down, the rings ahead already
  // lit so the line can be read; on 出发 the skier pushes off and the clock starts (the same moment for everyone). In the run: the clock at the
  // top (penalties already in it), rings and penalty below it, a red '+4' by the clock for a missed ring, each station's split flashed
  // green or red against the best. The last ring is the finish, big and in the middle of the run: through it the clock stops and flares, the
  // time comes up in the middle, and a card slides in from the right while the skier rides on (no rings after it: free skiing again).
  // Backspace starts the line again from the gate; on the card Enter = 再来一局, Esc = 继续滑. Records stay on this device.
  // (用户 2026-11-18 06:51 UTC: 每张地图两条线，速降线沿主路，越野线钻树林、走奇怪的地方，为了 explore；前三站不要了)
  if (typeof Variants !== 'undefined') Variants.def('rline', '光圈路线', [['off', '关'], ['a', '速降线'], ['x', '越野线']], 'off');
  const LINES = { a: { n: 12, name: '速降线' }, x: { n: 12, name: '越野线' } };
  // (用户 2026-11-19 00:23 UTC: 与其说罚时，不如每过一个圈减时间，像 bonus) each ring passed takes BON seconds off the clock; a ring missed
  // simply earns nothing. Same stakes per ring as the penalty it replaces (用户 2026-11-18 23:36 UTC 选 1.5 / 2 / 3: about twice what
  // skipping a ring saves, measured 0.6-1.2 s), shown as a reward
  const BON = { a: 1.5, b: 1.5, c: 1.5 },          // (one value for all three: with 2 or 3 on 难, a clean run there would come out below zero)
  DNAME = { a: '轻松', b: '标准', c: '难' }, DNEXT = { a: 'b', b: 'c' };
  // (用户 2026-11-19 00:18 UTC: 简单、中等、难都上同一个排行榜，简单的加一些时间，中等少加一些，难的不加，放到一起比) the board time is
  // the run's score (time less the rings' bonus) plus this, per line. 2026-11-19, after the levels moved down a step and every ring was
  // made reachable: tools/ring-reach.js (the searching pilot, one skier for all three) rode each line at each level three times; its score
  // with every ring through came out 速降线 难 127.5 / 标准 122.6 / 轻松 126.8 s, 越野线 152.6 / 120.3 / 150.4 s (the bonus for the
  // extra rings all but pays for the extra time). So: what the same skier gains on that level over 难, plus 5 s for each step easier.
  // (用户 2026-11-23 15:29 UTC「为什么轻松只加10秒，但是标准要加35秒？Doesn't make sense」) Those 11-19 figures were from lines since laid
  // out again (b527ebb), and 越野线 标准 then ran 32 s short. Measured again on b527ebb (ring-reach.js, 3 rides each; a ride that stuck
  // left out): score 速降线 难 191.5 / 标准 187.9 / 轻松 187.0 s, 越野线 222.1 / 238.3 / 269.6 s. Same rule, never below 0: 速降线 轻松
  // +14.5 → 15, 标准 +8.6 → 10; 越野线 both come out below 0 (the easier levels are already slower: fewer rings, less bonus) → 0.
  // And whatever the figures, an easier level never adds less than a harder one: hcOf holds 轻松 ≥ 标准 ≥ 难 = 0
  const HC = { a: { a: 15, b: 10, c: 0 }, x: { a: 0, b: 0, c: 0 } };
  const hcOf = (id, df) => { const h = HC[id] || {}, v = k => Math.max(0, h[k] || 0); return df === 'c' ? 0 : df === 'b' ? v('b') : Math.max(v('a'), v('b')); };
  // (用户 2026-11-19 00:39-00:40 UTC: 电脑上玩存 localStorage，没有排名就不显示；小红书才加排名；网站以后能登录再排) nothing about the boards
  // is shown where there are none: no 全部最好 / 排名, no handicap line, no 排行榜 note
  const rankOn = () => typeof Rank !== 'undefined' && !!Rank.on && !!Rank.line;
  const L = { id: null, diff: null, st: 'idle', seed: 1, fin: false, sEnd: 0, segs: null, cut: [], names: [], split: [], ci: 0, pen: 0, missSeen: 0, cT: 0, lastF: 0, el: null, rec: null };
  const diffKey = () => (typeof Variants !== 'undefined' && Variants.val.ringdiff) || 'b';
  const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), r = t - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); };          // (用户 21:25 UTC: 计时精确到 2 位)
  const sgn = d => Math.abs(d) < 0.005 ? tx('持平', 'even') : (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2);
  function lineEnd() {
    if (L.sEnd && L.segs === Course.segs && L.seg0 === Course.segs[0]) return L.sEnd;
    const n = LINES[L.id].n, segs = Course.segs;
    for (let k = 0; segs.length <= n && k < 40; k++) { const g = segs[segs.length - 1]; Course.segAt(g ? g.s0 + g.len + 10 : 10); }
    L.segs = segs; L.seg0 = segs[0]; L.sEnd = segs[n].s0;
    L.cut = segs.slice(1, n + 1).map(g => g.s0);
    L.names = segs.slice(0, n).map((g, i) => (i + 1) + ' ' + ((typeof SEG_NAMES !== 'undefined' && SEG_NAMES[g.type]) || g.type));
    return L.sEnd;
  }
  // ---- 越野线: one way down through the trees beside the run, the same for every player, found once when the line is set up.
  // A shortest-path search down the run every 4 m, across it every metre (−90..90 m from the run's centre line): the trees are walls
  // (within 1.6 m of a crown: never; within 3.5 m: dear), the groomed run is dear (that is the 速降线's), its edge a little dear, in among
  // the trees beside it cheap, a lane through the forest cheapest; beyond 40 m off the run and not in a lane it climbs the banks, very dear.
  // It starts and ends on the run (the gate, the finish ring), and goes at most 3 m across for 4 m down. Rings every 34-48 m along it
  // (further apart on 轻松, closer on 难), sized by 光圈难度 and made smaller where the trees leave no room. tools/ring-plan.js draws it.
  const XSZ = { z: [[2.5, 2.5], 1.4], a: [[2.5, 1.5], 1.2], b: [[1.5, 1.0], 1.0], c: [[1.0, 1.0], 0.85] };
  function xPlan() {
    const sE = lineEnd(), df = L.diff || 'b';
    if (L.xp && L.xp.sE === sE && L.xp.df === df) return L.xp;
    const t0 = Date.now(), TC = 4.5, NU = 181, U0 = -90, n = Math.floor(sE / 4) + 1, o = {};
    const rows = [], cost = new Float32Array(n * NU), lanes = [], lk = [], dr = [];
    // (用户 21:32 UTC: 路线还是无聊，应该九曲十八弯，地图左面和右面穿插来，钻密林尽量避免很多圈排成笔直的线) the way is drawn toward a winding
    // guide: it keeps to one side of the run, then crosses to the other every 280-420 m (never where the run is its gully or mogul field),
    // and on each side it swings 10 m either way every ~40 m (a direction change every 35-45 m: between a giant slalom's 30-35 m and a
    // super-G's 50 m turning pole to turning pole, FIS/SSNZ course setting rules). Trees, lanes and the rest still decide where it can go
    let gr = 7 + 13 * 7919; const grr = () => { gr = (gr * 16807) % 2147483647; return (gr - 1) / 2147483646; };
    const sw = []; { let ss = 180 + 200 * grr(), sd = -1; sw.push([0, sd]); while (ss < sE - 200) { let t2 = ss; for (let k = 0; k < 40; k++) { const c = Course.at(t2, pc), c2 = Course.at(t2 + 160, pc); if (!(c.gul > 0.3 || c.mog > 0.3 || c2.gul > 0.3 || c2.mog > 0.3)) break; t2 += 20; } sd = -sd; sw.push([t2, sd]); ss = t2 + 280 + 140 * grr(); } }
    const wph = 6.283 * grr(), wl = 76 + 12 * grr(), GW = RG.GW || 0.8;
    const guide = (s, hw) => { let a = sw[0][1], i = 0; while (i + 1 < sw.length && sw[i + 1][0] <= s) i++; a = sw[i][1]; let side = a; if (i > 0) { const f = cl((s - sw[i][0]) / 160, 0, 1), e2 = f * f * (3 - 2 * f); side = -a + 2 * a * e2; }
      return side * (hw + 22) + 10 * Math.sin(wph + s / wl * 6.283) * cl((s - 80) / 120, 0, 1); };
    for (let k = 0; k < n; k++) {
      const s = k * 4, c = Course.at(s, pc), cx = c.cx, hw = c.hw || 14, j0 = Math.floor(-s / TC), tr = [];
      for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = Math.floor((cx + U0 - 8) / TC); i <= Math.floor((cx - U0 + 8) / TC); i++) { Course.treeInCell(i, j, o); if (o.ok) tr.push([o.x, -o.z, o.r]); }
      rows.push({ s, cx, hw, tr }); const ln = Course.ways(s).slice(1); lanes.push(ln);
      lk.push(Course.waysK ? Course.waysK(s) : []); const fd = []; for (let bb = Math.floor((s - 60) / 32); bb <= Math.floor((s + 40) / 32); bb++) for (const f of Course.feats.get(bb) || []) if (f.kind === 'drop' && f.lip - s > -18 && f.lip - s < 34 && !fd.includes(f)) fd.push(f); dr.push(fd);
      const dist = new Float32Array(NU).fill(1e9);
      const dens = new Uint8Array(NU);
      for (const t of tr) { const ds = t[1] - s; if (Math.abs(ds) > 8) continue; for (let ui = Math.max(0, Math.floor(t[0] - cx - U0 - 8)); ui < NU && ui + U0 + cx < t[0] + 8; ui++) { const d = Math.hypot(ui + U0 + cx - t[0], ds) - t[2]; if (d < dist[ui]) dist[ui] = d; if (d < 7 && dens[ui] < 255) dens[ui]++; } }
      for (let ui = 0; ui < NU; ui++) {
        const u = ui + U0, e = Math.abs(u) - hw, d = dist[ui]; let onl = false; for (const lu of ln) if (Math.abs(u - lu) < 5) onl = true;
        let q = (d < 1.6 ? 1e6 : 0) + (d < 3.5 ? (3.5 - d) * 6 : 0);
        // (用户 20:43 UTC: 越野可以钻树林，但只是很小的一些树林) thick wood costs more the thicker it is, so the way goes through small stands and
        // glades, not deep forest where the rings ahead are lost
        // (20:44 UTC: 越野可以加一些钻小树林) a few trees about (2-4 within 7 m) is a small stand to weave through and is sought out a little
        if (dens[ui] > 5) q += (dens[ui] - 5) * 1.8; else if (dens[ui] >= 2) q -= 1.2;
        if (e < -2) q += 4.5;          // (用户 17:40/17:48 UTC: 不需要完全离开主线，可以偶尔交错: mostly out, now and then across it to the other side)
         if (e > 40 && !onl) q += (e - 40) * (e - 40) * 0.5 + 20; if (onl && e > 0) q -= 4; if (e > 6 && e < 40) q -= 2.5; if (e >= -2 && e <= 6) q += 1;
        // (用户 18:08/18:11 UTC: 所有线的第一个圈在正前方，慢慢预热；只要第一个就可以) the way leaves the gate straight, through the first ring
        if (s < 100 || s > sE - 120) q += Math.abs(u) * 2;
        else q += GW * Math.min(20, Math.abs(u - guide(s, hw)));
        // (用户 17:29 UTC: 越野线不跑标准道，去探索平常标准道不会去到的、好玩的地方) the run's own gully and mogul field are the 速降线's: the
        // line keeps out of them and off the gully's rim just above (17:20 UTC: a ring up there is not what a gully is for), and goes
        // out to the ways the run does not: a gully lane in the trees most of all (a small half-pipe of its own), and over a drop's lip
        if (c.gul > 0.3) { const ug = u - c.goff, bell = Math.exp(-(ug * ug) / (c.gw * c.gw)), pr = c.gU > 0.001 && Course.uWall ? bell + (Course.uWall(ug, c) - bell) * c.gU : bell, rim = (c.gU > 0.5 ? 1.75 : 1.3) * c.gw; q += pr > 0.04 ? 12 : Math.abs(ug) < rim + 14 ? 9 * (1 - (Math.abs(ug) - rim) / 20) : 0; }
        if (c.mog > 0.5 && e < 2) q += 9;
        for (const w of lk[k]) if (w.kind === 'gully' && Math.abs(u - w.u) < w.w * 0.9) q -= 4;
        for (const f of dr[k]) { const ds = f.lip - s; if (ds > -18 && ds < 34 && Math.abs(u - f.u) < f.wid * 0.35) q -= 9; }
        cost[k * NU + ui] = q;
      }
    }
    let acc = cost.slice(0, NU); const back = new Int8Array(n * NU);
    for (let k = 1; k < n; k++) {
      const nx = new Float32Array(NU);
      for (let ui = 0; ui < NU; ui++) { let b = Infinity, bd = 0; for (let du = -3; du <= 3; du++) { const pi = ui - du; if (pi < 0 || pi >= NU) continue; const v = acc[pi] + 0.6 * du * du; if (v < b) { b = v; bd = du; } } nx[ui] = b + cost[k * NU + ui]; back[k * NU + ui] = bd; }
      acc = nx;
    }
    const path = new Int16Array(n); path[n - 1] = -U0;
    for (let k = n - 1; k > 0; k--) path[k - 1] = path[k] - back[k * NU + path[k]];
    const pu = []; for (let k = 0; k < n; k++) { let a = 0; for (let m = -2; m <= 2; m++) a += path[Math.min(n - 1, Math.max(0, k + m))] + U0; pu.push(a / 5); }
    // the rings along it
    const lyk = lay(df), [sz, gk] = XSZ[lyk] || XSZ.a; let r0 = 1 + { z: 10, a: 11, b: 12, c: 13 }[lyk] * 7919;
    const rr = () => { r0 = (r0 * 16807) % 2147483647; return (r0 - 1) / 2147483646; };
    const rings = []; let s = 40, side = 1;
    for (;;) {
      // (where the way rides a gully lane in the trees: a ring on each of its walls in turn, as in the run's own gully; where it goes over a
      // drop: one on the run-in at the lip, so the line takes the drop, and one in the landing; elsewhere on the way searched)
      const k0 = Math.min(n - 1, Math.round((s + 20) / 4)), lg = lk[k0].find(w => w.kind === 'gully' && Math.abs(pu[k0] - w.u) < w.w * 1.2);
      const dp = dr[k0].find(f => f.lip > s + 4 && Math.abs(pu[Math.min(n - 1, Math.round(f.lip / 4))] - f.u) < f.wid * 0.5);
      if (dp) {
        for (const [ds, rr2] of [[-5, sz[0]], [16, sz[0]]]) { const ts = dp.lip + ds; if (ts > sE - 70) break; rings.push({ s: ts, u: ds < 0 ? dp.u : pu[Math.min(n - 1, Math.round(ts / 4))], r: rr2, off: true, how: 'drop' }); }
        s = dp.lip + 16; continue;
      }
      // (in among trees: closer, through the gaps, a tree run's rhythm; out in the open as before)
      const kt = Math.min(n - 1, Math.round((s + 14) / 4)); let near = 1e9; for (const tt of rows[kt].tr) near = Math.min(near, Math.hypot(tt[0] - rows[kt].cx - pu[kt], tt[1] - rows[kt].s) - tt[2]);
      // (用户 20:43 UTC: 树林里的圈一定要离得近，冲过去就钻进林子什么都看不见了) among trees the next ring is the furthest of 20..10 m on whose
      // straight line from the last ring no trunk stands (it can be seen from there, column and all); never further
      if (near < 7 && !lg) {
        const pl0 = rings.length ? rings[rings.length - 1] : null, p0 = pl0 && pl0.s >= s - 1 ? pl0 : { s, u: pu[Math.min(n - 1, Math.round(s / 4))] }; let pick = 10;          // (from the last ring, or from where the search last stood if a ring was left out there: always onward)
        for (const st of [20, 18, 16, 14, 12, 10]) {
          const s2 = p0.s + st, k2 = Math.min(n - 1, Math.round(s2 / 4)), x2 = rows[k2].cx + pu[k2], x1 = Course.at(p0.s, pc).cx + p0.u; let ok = true;
          for (let j = 1; j < st && ok; j++) { const f = j / st, xs = x1 + (x2 - x1) * f, ss = p0.s + j, kk = Math.min(n - 1, Math.round(ss / 4)); for (const tt of rows[kk].tr) if (Math.hypot(tt[0] - xs, tt[1] - ss) - tt[2] < 1.0) { ok = false; break; } }
          if (ok) { pick = st; break; }
        }
        s = p0.s + pick;
      } else s += lg ? (30 + 8 * rr()) * gk : (34 + 14 * rr()) * gk;
      if (s > sE - 70) break;
      if (lg) {
        // (the lane's own gully: its bell is 1.35 w wide, steepest at about 0.95 w out from its middle; trees stand only beyond that)
        side = -side; const kq = Math.min(n - 1, Math.round(s / 4)), w = lk[kq].find(q => q.kind === 'gully' && Math.abs(pu[kq] - q.u) < q.w * 1.6) || lg;
        const tu = easyL(lyk) ? w.u : w.u + side * w.w * (0.6 + 0.5 * (WALLK[lyk] || 0.6)), R = rows[kq], xr = R.cx + tu; let room = 1e9; for (const tt of R.tr) room = Math.min(room, Math.hypot(tt[0] - xr, tt[1] - R.s) - tt[2]);
        if (room > sz[1] + 0.8) { rings.push({ s: R.s, u: tu, r: sz[1], off: true, how: 'lane' }); continue; }
      }
      const k = Math.min(n - 1, Math.round(s / 4)), R = rows[k];
      // (用户 20:44 UTC: 越野也要尽量摆在路中间、空隙之间，别人左拐右拐从这儿钻过去，路线比较明确) between trees the ring stands in the middle of
      // the gap the way goes through: halfway between the nearest trunk on either side (when the gap is under 14 m)
      let u = rings.length ? pu[k] : 0;
      if (rings.length) { let lt = -1e9, rt = 1e9; const xw = R.cx + u; for (const tt of R.tr) { if (Math.abs(tt[1] - R.s) > 3) continue; const dx = tt[0] - xw; if (dx < 0 && dx > -8 && tt[0] + tt[2] > lt) lt = tt[0] + tt[2]; if (dx >= 0 && dx < 8 && tt[0] - tt[2] < rt) rt = tt[0] - tt[2]; }
        if (lt > -1e8 && rt < 1e8 && rt - lt < 14) u = (lt + rt) / 2 - R.cx; }
      const x = R.cx + u;
      { const cg = Course.at(R.s, pc); if (cg.gul > 0.3 && Math.abs(u - cg.goff) < (cg.gU > 0.5 ? 1.75 : 1.3) * cg.gw + 6) continue; }          // (never up on the rim of the run's gully)
      let r = rr() < 0.5 ? sz[0] : sz[1], room = 1e9;
      for (const t of R.tr) room = Math.min(room, Math.hypot(t[0] - x, t[1] - R.s) - t[2]);
      while (r > 1.0 && room < r + 0.8) r = r > 2 ? 1.5 : 1.0;
      if (room < 2) continue;
      rings.push({ s: R.s, u, r, off: Math.abs(u) > R.hw });
    }
    // (用户 2026-11-18 22:14 UTC: 追身视角靠近当前圈时能看到下一个圈或光柱) each ring seen from the chase camera coming up on the one before
    // (sightOK): else moved to the nearest place it is, up to 8 m sideways or pulled up to 12 m in, with room round it among the trees
    // and never onto the rim of the run's gully. Not the drop rings (the line there is the drop), not the first (straight ahead)
    { const st = RG.sightStat, tn2 = {};
      const okX = r => (s2, u2) => { const c2 = Course.at(s2, pc); if (c2.gul > 0.3 && Math.abs(u2 - c2.goff) < (c2.gU > 0.5 ? 1.75 : 1.3) * c2.gw + 6) return false;
        Course.nearTree(c2.cx + u2, -s2, tn2); return !(tn2.ok && !tn2.soft && tn2.d < Math.max(2, r + 0.8)); };
      const X = q => ({ x: Course.at(q.s, pc).cx + q.u, s: q.s, r: q.r });
      for (let i = 1; i < rings.length; i++) {
        const q = rings[i], c = rings[i - 1]; if (q.how === 'drop' || c.how === 'drop') continue;
        const P = i >= 2 ? X(rings[i - 2]) : { x: Course.at(c.s - 30, pc).cx, s: c.s - 30 }; st.tried++;
        let f = sightFix(P, X(c), q, okX(q.r), 12);
        // (none: then the ring before it moves a little too, as long as it is still seen itself, coming up on the one before it)
        if (!f && i >= 2 && c.how !== 'lane') {
          const PP = i >= 3 ? X(rings[i - 3]) : { x: Course.at(rings[i - 2].s - 30, pc).cx, s: rings[i - 2].s - 30 }, okC = okX(c.r);
          outer: for (const ds of [0, -4, 4]) for (const du of [1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6]) {
            const c2 = { s: c.s + ds, u: c.u + du, r: c.r }; if (c2.s - rings[i - 2].s < 8 || q.s - c2.s < 8 || !okC(c2.s, c2.u)) continue;
            if (!sightOK(PP, X(rings[i - 2]), { x: Course.at(c2.s, pc).cx + c2.u, s: c2.s, r: c2.r })) continue;
            for (const ds2 of [0, -6, -12]) for (const du2 of [0, 3, -3, 6, -6]) { const s2 = q.s + ds2, u2 = q.u + du2; if (s2 - c2.s < 8 || !okX(q.r)(s2, u2)) continue;
              if (sightOK(X(rings[i - 2]), X(c2), { x: Course.at(s2, pc).cx + u2, s: s2, r: q.r })) { c.s = c2.s; c.u = c2.u; f = { s: s2, u: u2, moved: true }; break outer; } }
          }
        }
        // (still none: one more ring between the two, where it is seen and from where the next is seen)
        if (!f && q.s - c.s >= 18) {
          let m = null;
          ins: for (let s2 = c.s + 8; s2 <= q.s - 8; s2 += 3) for (const du of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 8, -8]) {
            const u2 = c.u + (q.u - c.u) * (s2 - c.s) / (q.s - c.s) + du; if (!okX(sz[1])(s2, u2)) continue;
            const M = { x: Course.at(s2, pc).cx + u2, s: s2, r: sz[1] };
            if (sightOK(P, X(c), M) && sightOK(X(c), M, X(q))) { m = { s: s2, u: u2, r: sz[1], off: Math.abs(u2) > (Course.at(s2, pc).hw || 14), how: 'sight' }; break ins; }
          }
          if (m) { rings.splice(i, 0, m); st.moved++; continue; }
        }
        if (!f) { st.failed++; continue; }
        if (f.moved) { st.moved++; q.s = f.s; q.u = f.u; q.off = Math.abs(q.u) > (Course.at(q.s, pc).hw || 14); }
      } }
    // (用户 2026-11-19 06:08 UTC: 每个圈都要跑得到) each ring reachable from the one before (reachOK above): else it moves on down the way,
    // up to 40 m, to where it is (with room round it among the trees), or it is left out. Not the drop's two rings: the line there is the drop
    { const tn3 = {};
      const room = (s2, u2, r) => { const c2 = Course.at(s2, pc); if (c2.gul > 0.3 && Math.abs(u2 - c2.goff) < (c2.gU > 0.5 ? 1.75 : 1.3) * c2.gw + 6) return false; Course.nearTree(c2.cx + u2, -s2, tn3); return !(tn3.ok && !tn3.soft && tn3.d < Math.max(2, r + 0.8)); };
      for (let i = 1; i < rings.length; i++) {
        const q = rings[i], c = rings[i - 1]; if (q.how === 'drop' || c.how === 'drop' || reachOK(c.s, c.u, q.s, q.u)) continue;
        let ok = false; const nx = rings[i + 1];
        for (let s2 = q.s + 3; s2 <= q.s + 40 && (!nx || s2 < nx.s - 8) && s2 <= sE - 70; s2 += 3) {
          const u2 = pu[Math.min(n - 1, Math.round(s2 / 4))]; if (reachOK(c.s, c.u, s2, u2) && room(s2, u2, q.r)) { q.s = s2; q.u = u2; q.off = Math.abs(u2) > (Course.at(s2, pc).hw || 14); ok = true; break; } }
        if (ok) RG.reachStat.moved++; else { rings.splice(i, 1); i--; RG.reachStat.dropped++; }
      } }
    // (even spacing, as on the other line: gapAt above. Of the rings searched along the way, the one nearest the spacing from the last
    // kept; closer in only where the trees close in (the search placed rings near there so each is seen from the last). A drop's two
    // rings go or stay together)
    { const keep = []; let last = null;
      for (let i = 0; i < rings.length; i++) {
        const q = rings[i], pair = q.how === 'drop' && rings[i + 1] && rings[i + 1].how === 'drop' ? 2 : 1;
        if (!last) { for (let j = 0; j < pair; j++) keep.push(rings[i + j]); last = rings[i + pair - 1]; i += pair - 1; continue; }
        const g = gapAt(lyk, last.s + 60), d = q.s - last.s, nx = rings[i + pair];
        if (d < g * 0.8 || (nx && Math.abs(nx.s - last.s - g) < Math.abs(d - g) && nx.s - last.s < g * 1.25)) { i += pair - 1; continue; }
        for (let j = 0; j < pair; j++) keep.push(rings[i + j]); last = rings[i + pair - 1]; i += pair - 1;
      }
      rings.length = 0; rings.push(...keep); }
    let off = 0; for (let k = 0; k < n; k++) if (Math.abs(pu[k]) > rows[k].hw) off++;
    L.xp = { sE, df, rings, path: pu, off: off / n, ms: Date.now() - t0 };
    return L.xp;
  }
  RG.xPlan = () => L.id === 'x' ? xPlan() : null;          // (for test scripts)
  RG.PLAN = PLAN; RG.ZIPROWS = ZIPROWS; RG.columns = () => drawList.filter(d => d.bk > 0).length;          // (for tools/ring-expert.js: how far apart a smooth expert line can take the rings)
  function ringNote(k, fin, side) { try { const R = typeof Sound !== 'undefined' && Sound.rig; if (R && R.ring && Sound.on !== false && Sound.ctx) R.ring(Sound.ctx.currentTime, k, fin, side); } catch (e) { } }
  function beep(f, d, g) {
    try { const A = Sound.ctx; if (!A || !Sound.on) return; const o = A.createOscillator(), v = A.createGain(), t = A.currentTime; o.type = 'sine'; o.frequency.value = f; v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.012); v.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(v); v.connect(A.destination); o.start(t); o.stop(t + d + 0.05); } catch (e) { }
  }
  const recKey = () => 'coldsmoke.line2.' + L.id + '.' + diffKey() + mapSuf();          // (line2: scores with the ring bonus, 2026-11-19; the old penalty bests stay under coldsmoke.line.)
  // (records go through Store where it is there (00d_store.js): in the Xiaohongshu container it keeps them when the page's own storage is not kept)
  const ST = () => typeof Store !== 'undefined' && Store.getJSON ? Store : null;
  function recLoad() { try { const S = ST(); if (S) { if (S.durable) S.durable(recKey()); return S.getJSON(recKey()) || null; } return JSON.parse(localStorage.getItem(recKey()) || 'null'); } catch (e) { return null; } }
  function recSave(r) { try { const S = ST(); if (S) { if (S.durable) S.durable(recKey()); S.setJSON(recKey(), r); return; } localStorage.setItem(recKey(), JSON.stringify(r)); } catch (e) { } }

  // ---- what is on the screen
  function ui() {
    if (L.el) return L.el;
    const d = document.createElement('div'); d.id = 'rline';
    // (用户 20:58 UTC: 结束这些菜单的 UI 要跟现在整个 UI 的风格一样): the game's own type and colours (template.html: --snow, --dim, --faint,
    // --hair, --sun; Jost light for figures, the Song serif for words that are names, small spaced Jost capitals for labels, a hairline of
    // amber as the accent, dark glass for what has to sit on the picture). Inside #app, so its margins and the turned phone apply
    d.innerHTML = '<style>#rline{position:absolute;inset:0;pointer-events:none;z-index:4;font-family:var(--f-ui);color:var(--snow);text-shadow:0 1px 16px rgba(5,8,13,.55)}'
      + '#rline .tm{position:absolute;top:var(--gt);left:50%;transform:translateX(-50%);font-family:var(--f-lat);font-weight:300;font-size:clamp(26px,6.4vmin,42px);line-height:1;letter-spacing:.02em;font-variant-numeric:tabular-nums;transition:transform .5s cubic-bezier(.2,.6,.2,1),color .5s}'
      + '#rline .tm.fin{color:var(--sun);transform:translateX(-50%) scale(1.12)}'
      + '#rline .sub{position:absolute;top:calc(var(--gt) + clamp(34px,7.6vmin,50px));left:50%;transform:translateX(-50%);font-weight:500;font-size:11px;letter-spacing:.3em;margin-right:-.3em;color:var(--dim);white-space:nowrap}'
      + '#rline .pop{position:absolute;top:var(--gt);left:calc(50% + clamp(62px,12vmin,90px));font-family:var(--f-lat);font-weight:400;font-size:clamp(16px,3.4vmin,22px);color:#ff9d8c;opacity:0;transition:opacity .25s,transform .9s cubic-bezier(.2,.6,.2,1)}'
      + '#rline .pop.on{opacity:1;transform:translateY(-6px)}'
      + '#rline .spl{position:absolute;top:calc(var(--gt) + clamp(56px,11vmin,74px));left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.1em;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .45s;white-space:nowrap}'
      + '#rline .spl.on{opacity:1}#rline .spl .k{font-family:var(--f-song);letter-spacing:.2em;color:rgba(244,247,251,.82)}'
      + '#rline .g{color:var(--sun)}#rline .r{color:#ff9d8c}'
      + '#rline .cd{position:absolute;top:38%;left:50%;transform:translate(-50%,-50%);font-family:var(--f-lat);font-weight:300;font-size:clamp(72px,20vmin,132px);line-height:1;opacity:0;transition:opacity .15s}'
      + '#rline .cd.on{opacity:1}#rline .cd.w{font-family:var(--f-song);font-size:clamp(40px,11vmin,72px);letter-spacing:.6em;margin-right:-.6em;color:var(--sun)}'
      + '#rline .ban{position:absolute;top:34%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center;opacity:0;transition:opacity .5s}'
      + '#rline .ban.on{opacity:1}#rline .ban b{display:block;font-family:var(--f-lat);font-weight:300;font-size:clamp(46px,12vmin,84px);line-height:1;font-variant-numeric:tabular-nums}'
      + '#rline .ban .rule{width:26px;height:1px;background:var(--sun);margin:14px 0 12px}#rline .ban i{display:block;font-family:var(--f-song);font-weight:300;font-style:normal;font-size:clamp(13px,3.4vmin,16px);letter-spacing:.34em;margin-right:-.34em}'
      + '#rline .card{position:absolute;top:50%;right:var(--gr);width:min(330px,calc(var(--cw) * .44));max-height:calc(100% - var(--gt) - var(--gb));display:flex;flex-direction:column;overflow:hidden;transform:translate(calc(100% + var(--gr) + 20px),-50%);transition:transform .6s cubic-bezier(.2,.6,.2,1);background:rgba(5,8,13,.52);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:12px;box-shadow:inset 0 0 0 1px var(--hair);padding:18px 20px;pointer-events:auto;text-shadow:none;font-size:12px}'
      + '#rline .card::-webkit-scrollbar{display:none}#rline .card.on{transform:translate(0,-50%)}'
      + '#rline .card h3{margin:0;font-family:var(--f-lat);font-weight:500;font-size:10px;letter-spacing:.4em;color:var(--dim);white-space:nowrap}#rline .card h3 em{font-family:var(--f-song);font-style:normal;font-size:12px;letter-spacing:.24em;color:var(--snow);margin-right:.6em}'
      + '#rline .card .big{margin-top:10px;font-family:var(--f-lat);font-weight:300;font-size:clamp(34px,7vmin,46px);line-height:1;font-variant-numeric:tabular-nums}'
      + '#rline .card .rule{width:26px;height:1px;background:var(--sun);margin:12px 0 10px}#rline .card .dl{font-size:12px;letter-spacing:.12em}'
      + '#rline .fs{display:flex;gap:clamp(14px,3vmin,24px);margin-top:14px}#rline .fs>div{display:flex;flex-direction:column}#rline .fs b{font-family:var(--f-lat);font-weight:300;font-size:clamp(16px,3.2vmin,20px);line-height:1;font-variant-numeric:tabular-nums}'
      + '#rline .fs span{margin-top:6px;font-family:var(--f-lat);font-weight:500;font-size:10px;letter-spacing:.3em;white-space:nowrap;color:var(--dim)}'
      + '#rline table{width:100%;margin-top:14px;border-collapse:collapse;font-variant-numeric:tabular-nums}#rline td,#rline th{padding:4px 2px;text-align:right;font-weight:400;border-top:1px solid rgba(244,247,251,.08)}'
      + '#rline th{border-top:0;font-family:var(--f-lat);font-weight:500;font-size:10px;letter-spacing:.24em;color:var(--faint)}#rline td:first-child,#rline th:first-child{text-align:left}#rline td:first-child{font-family:var(--f-song);letter-spacing:.1em}'
      + '#rline tr.worst td{color:#ffc4b8}#rline .tip{margin-top:10px;font-size:11px;line-height:1.7;letter-spacing:.1em;color:var(--dim)}#rline .tip:empty{display:none}'
      + '#rline .bt{display:flex;gap:8px;margin-top:16px}#rline button{flex:1;appearance:none;-webkit-appearance:none;margin:0;border:0;height:38px;border-radius:12px;font-family:var(--f-ui);font-size:12px;letter-spacing:.14em;cursor:pointer;color:var(--dim);background:rgba(5,8,13,.25);box-shadow:inset 0 0 0 1px var(--hair);transition:color .2s,box-shadow .2s}'
      + '#rline button.p{color:var(--sun);background:rgba(255,208,138,.08);box-shadow:inset 0 0 0 1px var(--sun);font-family:var(--f-song);letter-spacing:.3em}'
      + '@media (hover:hover){#rline button:hover{color:var(--snow);box-shadow:inset 0 0 0 1px rgba(244,247,251,.5)}#rline button.p:hover{color:#ffe2b5;box-shadow:inset 0 0 0 1px #ffe2b5}}'
      // (路线卡线程 2026-11-19 06:59 UTC, measured on the Mac: at 1280x720 「再来一局 ⏎」 broke onto two lines, five buttons in 330 px; at
      // 844x390 only 7 stations showed and every button was below the card's edge. Now: 再来一局 has its own row and the rest share the
      // next, never broken; the buttons stay pinned to the card's foot while the splits scroll under them, and on a low screen the card packs tighter. The
      // card's own width and padding are unchanged: the route card docks beside it by them)
      + '#rline .bt{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}#rline .bt button{flex:1 1 auto;white-space:nowrap;padding:0 10px}#rline .bt button.p{flex-basis:100%}'
      + '#app.short #rline .card .big{margin-top:6px;font-size:clamp(28px,6vmin,36px)}#app.short #rline .card .rule{margin:8px 0 6px}#app.short #rline .fs{margin-top:8px}#app.short #rline table{margin-top:8px}#app.short #rline td,#app.short #rline th{padding:2px 2px;font-size:11px}#app.short #rline .bt{gap:6px}#app.short #rline .bt button{height:32px}'
      + '#app.midh #rline td,#app.midh #rline th{padding:3px 2px}'
      + '#app.rcardon #hud>:not(#pad),#app.rcardon #rline .tm,#app.rcardon #rline .sub{opacity:0!important;transition:opacity .3s}'          // (用户 2026-11-19: 手机上成绩卡压在速度、路段名、计时上)
      + '#rline .card .sc{flex:0 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}#rline .card .sc::-webkit-scrollbar{display:none}#rline .bt{flex:none}'          // (no position:sticky: inside the frame the game turns itself, Safari put the sticky row in the middle of the panel, 用户 21:15 UTC 截图)
      + '#rline kbd{margin-left:.5em;font-family:var(--f-lat);font-size:.85em;letter-spacing:.04em;opacity:.6}</style>'
      + '<div class="tm"></div><div class="sub"></div><div class="pop"></div><div class="spl"></div><div class="cd"></div><div class="ban"><b></b><span class="rule"></span><i></i></div><div class="card"></div>';
    (document.getElementById('app') || document.body).appendChild(d); L.el = d;
    d.addEventListener('click', e => { const a = e.target && e.target.dataset && e.target.dataset.a, cb = e.target && e.target.closest && e.target.closest('[data-cb]'); if (cb) { const b = RG.cardButtons[+cb.dataset.cb]; if (b && b.on) b.on(); return; } if (a === 'again') lineRestart(); else if (a === 'harder') lineHarder(); else if (a === 'free') lineFree(); else if (a === 'board') { const m = mapNow(); if (Rank.pick && m) Rank.pick(m.id, L.id); if (typeof UI !== 'undefined') UI.menu('rank'); } });
    L.q = k => d.querySelector('.' + k);
    return d;
  }
  function show(on) { const d = ui(); d.style.display = on ? '' : 'none'; }
  function setTxt(k, t) { const e = L.q(k); if (e.textContent !== t) e.textContent = t; }
  function flash(k, html, ms) { const e = L.q(k); e.innerHTML = html; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), ms); }
  function hideAll() { if (!L.el) return; for (const k of ['pop', 'spl', 'cd', 'ban', 'card']) L.q(k).classList.remove('on'); L.q('tm').classList.remove('fin'); }

  function lineSetup() {
    L.diff = diffKey(); L.st = 'idle'; L.sEnd = 0; L.segs = null; L.fin = false;
    L.seed = 1 + ((L.id || 'x').charCodeAt(0) * 7919 + L.diff.charCodeAt(0) * 104729) % 2147480000;
    if (L.el) { hideAll(); show(!!L.id); setTxt('tm', ''); setTxt('sub', ''); }
    reset();
  }
  // armed instead of pushing off: held at the gate, the count-down runs
  function lineArm() {
    lineSetup(); ui(); show(true); hideAll();
    L.st = 'count'; L.cT = 0; L.lastK = 4; Game.mode = 'hold';
    setTxt('tm', fmt(0)); setTxt('sub', T(LINES[L.id].name) + ' · ' + T(DNAME[L.diff]));
  }
  function lineGo() {
    L.st = 'go'; L.pen = 0; L.split = []; L.ci = 0; L.missSeen = 0; L.rec = recLoad();
    Game.mode = 'title'; GS0.call(Game);          // (the game's own push-off: G.start sets the clock to 0 here)
    lineEnd();
    emit('go', { line: L.id, name: LINES[L.id].name, diff: L.diff, sEnd: L.sEnd });
  }
  // ---- hooks for other parts (the replay, 93_replay.js): RG.hooks.go / .finish get { line, diff, ... } when a challenge pushes off and
  // crosses the finish; RG.cardButtons [{ label, key, on() }] are added to the result card's row; RG.cardShow(on) hides / brings back the card
  RG.hooks = { go: [], finish: [] }; RG.cardButtons = [];
  function emit(k, o) { for (const f of RG.hooks[k] || []) try { f(o); } catch (e) { console.warn('rings hook ' + k + ':', e); } }
  RG.cardShow = on => { if (L.el && L.st === 'done') L.q('card').classList.toggle('on', !!on); };
  // ---- the top of the screen while a line is skied: the clock (bonus taken off), the rings, a station's time as it is reached, the
  // finish. One set of words and one look, written by the run as it goes and by its replay as it plays back (RG.replayHud below):
  // (用户 2026-11-19 18:39 UTC: 回放模式的画面（上面的时间数据）应该和玩的时候一样) the replay used to draw its own copy, worded and timed differently
  function hudRun(t, passed, missed, p, finAhead) {
    L.q('tm').classList.remove('fin');
    setTxt('tm', fmt(Math.max(0, t - passed * p)));
    const bo = +(passed * p).toFixed(1);
    setTxt('sub', tx('穿过 ', 'Rings ') + passed + (passed ? tx(' · 奖励 −' + bo + ' 秒', ' · bonus −' + bo + ' s') : '') + (missed ? tx(' · 漏 ', ' · missed ') + missed : '') + (finAhead ? tx(' · 前方终点', ' · finish ahead') : ''));
  }
  function hudFin(score, passed, tot, bonus, miss) {
    setTxt('tm', fmt(score)); L.q('tm').classList.add('fin');
    setTxt('sub', tx('光圈 ', 'Rings ') + passed + ' / ' + tot + tx(' · 奖励 −' + bonus + ' 秒', ' · bonus −' + bonus + ' s') + (miss ? '' : tx(' · 全部穿过', ' · all rings')));
  }
  function finBanner(score, txt) {
    const ban = L.q('ban'); ban.querySelector('b').textContent = fmt(score); ban.querySelector('i').textContent = txt || '';
    ban.classList.add('on'); clearTimeout(ban._t); ban._t = setTimeout(() => ban.classList.remove('on'), 1400);          // (gone before the card slides in)
    beep(880, 0.25, 0.18); setTimeout(() => beep(1320, 0.6, 0.16), 140);
  }
  function splitFlash(name, d, b) { flash('spl', '<span class="k">' + TN(name || '') + '</span>　' + fmt(d) + (b != null ? '　<span class="' + (d <= b ? 'g' : 'r') + '">' + sgn(d - b) + '</span>' : ''), 2200); }
  function missFlash(p) { flash('pop', '+' + p, 900); beep(220, 0.22, 0.14); }
  // the replay (93_replay.js), each frame: st = { t: the run's clock, passed, missed, finAhead, play, fin: the finish hook's payload }.
  // The same words appear at the same moments as in the run; a station's time and the finish banner come only while it plays forward
  // (dragged along the time line, the numbers simply stand where they were). st = null: the replay is over, the screen as the run left it
  const RS = { t: -1, ci: 0, miss: 0, done: false };
  RG.replayHud = function (st) {
    if (!L.el && !st) return; ui();
    if (!st) {
      for (const k of ['pop', 'spl', 'ban']) L.q(k).classList.remove('on');
      if (L.st === 'done' && L.finHud) { const f = L.finHud; hudFin(f.score, f.passed, f.tot, f.bonus, f.miss); }
      show(L.st !== 'idle' && L.st !== 'free'); RS.t = -1; return;
    }
    show(true);
    const f = st.fin || {}, sp = f.splits || [], nm = f.names || [], sb = f.segBest || [], p = f.bonus || BON[f.diff] || 1.5, end = f.t != null ? f.t : Infinity, t = st.t;
    const jump = RS.t < 0 || t < RS.t - 1e-4 || t - RS.t > 0.75;
    if (jump) {
      RS.ci = 0; while (RS.ci < sp.length - 1 && t >= sp[RS.ci]) RS.ci++;
      RS.miss = st.missed; RS.done = t >= end - 1e-6;
      for (const k of ['pop', 'spl', 'ban']) L.q(k).classList.remove('on');
    }
    RS.t = t;
    if (st.missed > RS.miss) { RS.miss = st.missed; if (st.play) missFlash(p); }
    while (RS.ci < sp.length - 1 && t >= sp[RS.ci]) { const i = RS.ci, d = sp[i] - (i ? sp[i - 1] : 0); if (st.play) splitFlash(nm[i], d, sb[i]); RS.ci++; }
    if (t < end - 1e-6) { RS.done = false; hudRun(t, st.passed, st.missed, p, st.finAhead); return; }
    hudFin(f.score, f.passed, (f.passed || 0) + (f.missed || 0), +((f.passed || 0) * p).toFixed(1), f.missed);
    if (!RS.done) { RS.done = true; if (st.play) finBanner(f.score, f.ban); }
  };
  function lineFinish() {
    if (L.st !== 'go') return;
    L.st = 'done'; L.tEnd = Game.runT; L.split.push(L.tEnd); brake(true);
    const p = BON[L.diff] || 2, miss = RG.missed, bonus = +(RG.passed * p).toFixed(1), score = Math.max(0, L.tEnd - bonus), tot = RG.passed + RG.missed;
    const seg = L.split.map((t, i) => t - (i ? L.split[i - 1] : 0));
    const old = L.rec, best = old && old.best, segBest = old && old.seg || [];
    const isNew = !best || score < best.score - 1e-6;
    const rec = { best: isNew ? { score, t: L.tEnd, miss, tot, date: Date.now() } : best, seg: seg.map((d, i) => segBest[i] != null ? Math.min(segBest[i], d) : d), runs: ((old && old.runs) || 0) + 1 };
    recSave(rec);
    try { if (typeof Cards !== 'undefined' && Cards.emit) Cards.emit('ring.line', { line: L.id === 'x' ? 'cross' : 'speed', full: miss === 0, t: L.tEnd, missed: miss }); } catch (e) { }          // (集卡: the card system picks it up when it is there)
    const banTxt = isNew ? (best ? tx('新纪录！快了 ' + (best.score - score).toFixed(2) + ' 秒', 'New record! ' + (best.score - score).toFixed(2) + ' s faster') : tx('第一次完成', 'First finish')) : tx('比最好慢 ' + (score - best.score).toFixed(2) + ' 秒', (score - best.score).toFixed(2) + ' s off your best');
    hudFin(score, RG.passed, tot, bonus, miss); finBanner(score, banTxt);
    L.finHud = { score, passed: RG.passed, tot, bonus, miss };          // (what the top of the screen says once the run is over: put back after a replay)
    // the card: what this run was, against the best before it
    let worst = -1, wd = 0;
    const rows = seg.map((d, i) => { const b = segBest[i]; const df = b != null ? d - b : null; if (df != null && df >= 0.3 && df > wd) { wd = df; worst = i; } return { n: L.names[i] || (i + 1) + '', d, b, df }; });
    const td = r => '<td>' + (r.b != null ? fmt(r.b) : '—') + '</td><td class="' + (r.df == null || Math.abs(r.df) < 0.005 ? '' : r.df < 0 ? 'g' : 'r') + '">' + (r.df == null ? '' : sgn(r.df)) + '</td>';
    const fs = items => '<div class="fs">' + items.map(([v, k, c]) => '<div><b' + (c ? ' class="' + c + '"' : '') + '>' + v + '</b><span>' + k + '</span></div>').join('') + '</div>';
    L.q('card').innerHTML = '<div class="sc"><h3><em>' + T(LINES[L.id].name) + '</em>' + T(DNAME[L.diff]) + '</h3><div class="big">' + fmt(score) + '</div><div class="rule"></div>'
      + '<div class="dl ' + (isNew ? 'g' : 'r') + '">' + (isNew ? (best ? tx('新纪录，快了 ' + (best.score - score).toFixed(2) + ' 秒', 'New record, ' + (best.score - score).toFixed(2) + ' s faster') : tx('第一次完成，这就是你的纪录', 'First finish: this is your record')) : tx('比最好慢 ' + (score - best.score).toFixed(2) + ' 秒', (score - best.score).toFixed(2) + ' s off your best')) + '</div>'
      + fs([[fmt(L.tEnd), tx('用时', 'Time')], [RG.passed + ' / ' + tot, tx('光圈', 'Rings')], [(+bonus > 0 ? '−' : '') + bonus, tx('光圈奖励（秒）', 'Ring bonus (s)'), 'g']])
      + '<table><tr><th>' + tx('分站', 'Stage') + '</th><th>' + tx('本局', 'This run') + '</th><th>' + tx('之前最好', 'Best before') + '</th><th></th></tr>' + rows.map((r, i) => '<tr' + (i === worst ? ' class="worst"' : '') + '><td>' + TN(r.n) + '</td><td>' + fmt(r.d) + '</td>' + td(r) + '</tr>').join('') + '</table>'
      + '<div class="tip">' + [miss ? tx('漏了 ' + miss + ' 个圈，少减 ' + +(miss * p).toFixed(1) + ' 秒', miss + ' rings missed: ' + +(miss * p).toFixed(1) + ' s of bonus lost') : '', worst >= 0 ? tx('最慢的一站：' + rows[worst].n + '，比最好慢 ' + wd.toFixed(2) + ' 秒', 'Slowest stage: ' + TN(rows[worst].n) + ', ' + wd.toFixed(2) + ' s off its best') : ''].filter(Boolean).join(tx('；', '; ')) + '</div>'
      + (rankOn() && boardOf(L.id, L.diff) ? fs([[fmt(rec.best.score), tx('个人最好', 'Your best')], ['…', tx('全部最好', 'Best of all'), 'gtop'], ['…', tx('排名', 'Place'), 'grank']])
      + '<div class="tip">' + (hcOf(L.id, L.diff) ? tx('排行榜成绩 ' + fmt(score + hcOf(L.id, L.diff)) + '（' + DNAME[L.diff] + '加时 +' + hcOf(L.id, L.diff) + ' 秒，三档一起排）', 'Board time ' + fmt(score + hcOf(L.id, L.diff)) + ' (' + T(DNAME[L.diff]) + ' +' + hcOf(L.id, L.diff) + ' s; all three levels on one board)') : tx('排行榜成绩 ' + fmt(score) + '（难不加时，三档一起排）', 'Board time ' + fmt(score) + ' (Hard: nothing added; all three levels on one board)')) + '</div>' : fs([[fmt(rec.best.score), tx('个人最好', 'Your best')]]))
      + '</div><div class="bt"><button class="p" data-a="again">' + tx('再来一局', 'Again') + '<kbd>⏎</kbd></button>' + (DNEXT[L.diff] ? '<button data-a="harder">' + tx('增加难度', 'Harder') + '</button>' : '') + '' + RG.cardButtons.map((b, i) => '<button data-cb="' + i + '">' + T(b.label) + (b.key ? '<kbd>' + b.key + '</kbd>' : '') + '</button>').join('') + (MB() && rankOn() && boardOf(L.id, L.diff) ? '<button data-a="board">' + tx('看排行榜', 'Board') + '</button>' : '') + '<button data-a="free">' + tx('继续滑', 'Ski on') + '<kbd>Esc</kbd></button></div>';
    emit('finish', { line: L.id, name: LINES[L.id].name, diff: L.diff, score, t: L.tEnd, bonus: p, missed: miss, passed: RG.passed, splits: L.split.slice(), names: L.names.slice(), isNew, segBest: segBest.slice(), ban: banTxt });
    board(score + hcOf(L.id, L.diff));
    // (用户 2026-11-20 08:44 UTC：刚过终点这些东西马上都弹出来了，让这个人先停下来、站稳，然后再弹出来) the card waits for the stop: it
    // comes 0.8 s after the skier is parked standing (park below), or after 6 s whatever happens (in the air at the line, a menu open)
    clearTimeout(L.cardT); L.cardT = setTimeout(cardIn, 6000);
  }
  // the boards (小红书 only): the best of everyone and this player's place, filled in when they come back
  function board(score) {
    const set = (a, b) => { const c = L.q('card'), x = c.querySelector('.gtop'), y = c.querySelector('.grank'); if (x) x.textContent = a; if (y) y.textContent = b; };
    const bd = boardOf(L.id, L.diff);
    if (typeof Rank === 'undefined' || !Rank.line || !Rank.on || !bd) { set('—', '—'); return; }
    Rank.line(score, bd).then(r => { if (L.st !== 'done') return; if (!r) { set('—', '—'); return; } set(r.top != null ? fmt(r.top) : '—', r.rank != null ? (typeof r.rank === 'number' ? tx('第 ' + r.rank + ' 名', '#' + r.rank) : r.rank) : '—'); });
  }
  // (用户 18:54 UTC: 结束后就可以停下来): through the finish the skier stops by himself, the way a skier does: held right over into a turn
  // across the hill until the skis stand still (the game's own turning brake, nothing pulls him), until 继续滑 or 再来一局 gives the skis back
  function brake(on) {
    if (typeof Input === 'undefined') return;
    if (!on) { if (L.braking) { Input.script = null; Input.faScript = null; L.braking = 0; } park(false); return; }
    const S = Game.s; L.braking = (S.v[0] || 0) >= 0 ? 1 : -1; L.brakeT = 0; L.brakeV0 = null;
  }
  function cardIn() { if (L.st === 'done') L.q('card').classList.add('on'); }
  function park(on) {
    if (typeof Game === 'undefined' || !Game.s) return;
    if (on) {
      const S = Game.s; S.v[0] = S.v[1] = S.v[2] = 0; S.speed = 0; S.tuck = 0; S.lean = 0; if ('leanV' in S) S.leanV = 0; if ('beta' in S) S.beta = 0; if ('charge' in S) S.charge = 0;
      Input.script = 0; Input.faScript = 0; Game.mode = 'park'; L.parked = true;
      if (L.st === 'done') { clearTimeout(L.cardT); L.cardT = setTimeout(cardIn, 800); }          // (stood still: then the card)
    } else if (L.parked) { L.parked = false; if (Game.mode === 'park') Game.mode = 'run'; }
  }
  function lineHarder() { const n = DNEXT[L.diff]; if (!n) return; Variants.set('ringdiff', n); lineRestart(); }
  function lineRestart() {
    brake(false); hideAll(); L.st = 'idle';
    if (typeof UI !== 'undefined' && UI.toTop && UI.toTop()) setTimeout(() => { if (UI.state === 'title') { RG.chal = true; UI.go(); } }, 800);
  }
  function lineFree() { brake(false); L.q('card').classList.remove('on'); L.st = 'free'; setTxt('tm', ''); setTxt('sub', ''); }
  function lineFrame(T) {
    if (typeof Game !== 'undefined' && Game.mode === 'replay') { L.lastF = T; return; }          // (the replay (93_replay.js) plays the run back: nothing here moves, brakes or times meanwhile)
    const dt = cl(T - (L.lastF || T), 0, 0.1); L.lastF = T;
    // (用户 20:57 UTC: 过终点后不要还在溜、做奇怪的动作，直接刹住停下来，站起来看着远方，直到玩家按继续滑): held round into a turn across
    // the hill (no skid asked for) until under 2 m/s or 6 s, then parked: no more physics steps, the skier stands still where he stopped,
    // tall and quiet, until 继续滑 or 再来一局. Game.mode 'park' is neither a run nor the title: the pose and the camera still update
    if (L.braking && typeof Input !== 'undefined') {
      if (L.st === 'done' && Game.mode === 'run') {
        // (用户 21:12 UTC: 冲过终点直接甩尾刹车停下来; 21:25 UTC: 菜单马上弹出来，人不要马上停住，缓 2-3 秒慢慢停下来，整个动作要自然).
        // A hockey stop, eased: the steering comes over in a third of a second (not snapped to full lock), the weight goes forward so the
        // game skids the skis across, and the speed follows a smooth curve from what it was at the line down to nothing over 2-3 s
        // (faster lines take the longer time): no jolt as the stop begins, none as it ends. The game's own skid only ever slows it more.
        // Under 0.3 m/s at the end of it: parked, standing.
        L.brakeT = (L.brakeT || 0) + dt;
        const S = Game.s, v = Math.hypot(S.v[0], S.v[1], S.v[2]);
        if (L.brakeV0 == null) { L.brakeV0 = Math.max(v, 0.5); L.brakeDur = cl(L.brakeV0 / 11, 2, 3); }
        const u = cl(L.brakeT / L.brakeDur, 0, 1), eas = u * u * (3 - 2 * u);
        Input.script = L.braking * Math.min(1, L.brakeT / 0.35); Input.faScript = Math.min(1, L.brakeT / 0.5);
        const vt = L.brakeV0 * (1 - eas);
        if (!S.air && v > vt && v > 1e-3) { const k = vt / v; S.v[0] *= k; S.v[1] *= k; S.v[2] *= k; }
        if (u >= 1 || (u > 0.5 && Game.s.speed < 0.3)) park(true);
      } else if (L.st !== 'done') brake(false);
    }
    ui();
    const G = Game, title = G.mode === 'title';
    if (title && L.st !== 'idle' && L.st !== 'count') { L.st = 'idle'; hideAll(); }
    show(L.st !== 'idle' && L.st !== 'free');
    if (L.st === 'count') {
      if (G.mode === 'run') G.mode = 'hold';          // (the menu let go during the count: the skier still waits for 出发)
      const held = typeof UI !== 'undefined' && (UI.open || UI.paused);
      if (!held) L.cT += dt;
      const k = 3 - Math.floor(L.cT / 0.8), cd = L.q('cd');
      if (k !== L.lastK) {
        L.lastK = k;
        if (k >= 1) { cd.textContent = k; cd.classList.remove('w'); cd.classList.add('on'); beep(660, 0.14, 0.16); }
        else { cd.textContent = tx('出发', 'GO'); cd.classList.add('on', 'w'); beep(1320, 0.35, 0.18); clearTimeout(cd._t); cd._t = setTimeout(() => cd.classList.remove('on'), 700); lineGo(); }
      }
      return;
    }
    if (L.st === 'go') {
      const s = -G.s.p[2], p = BON[L.diff] || 2;
      if (RG.missed > L.missSeen) { L.missSeen = RG.missed; missFlash(p); }
      L.pen = -RG.passed * p;
      while (L.ci < L.cut.length - 1 && s >= L.cut[L.ci]) {
        const t = G.runT, d = t - (L.ci ? L.split[L.ci - 1] : 0), b = L.rec && L.rec.seg && L.rec.seg[L.ci];
        L.split.push(t);
        splitFlash(L.names[L.ci], d, b);
        L.ci++;
      }
      const cur = RG.rings.find(r => r.pass < 0 && !r.skip);
      hudRun(G.runT, RG.passed, RG.missed, p, !!(cur && cur.fin));
    }
  }
  // ---- 挑战 on the title page (dev). (用户 21:31 UTC: 出发就是普通地滑；出发底下加一个「挑战」，点开以后再选路线这些.) 出发 and Enter are always
  // free skiing; 挑战 (a button in the left column like 场景 / 视角) opens a panel: the lines with this device's best, the difficulty,
  // then 开始挑战 (or Enter), which counts down 3, 2, 1. Esc, 返回, a tap on the dimmed page or the phone's own back closes it.
  const PICK = [['a', '速降线', '沿主路，从山顶到山脚'], ['x', '越野线', '钻树林、走侧道，从山顶到山脚']];
  // (用户 2026-11-18 02:38 UTC: 挑战是根据地图挑战，每个地图都有不同的挑战) each map has its own lines; the panel lists the current map's only.
  // A map = an official mountain (Course.mountains). Today there is one, 寒烟山, with these two lines; a mountain with none says so
  const MAP_LINES = { hanyan: ['a', 'x'] };
  const mapNow = () => { try { const m = Course.mountainBySeed(); return m ? m : null; } catch (e) { return null; } };
  const mapLines = () => { const m = mapNow(); return m && MAP_LINES[m.id] ? MAP_LINES[m.id] : ['a', 'x']; };
  // (用户 2026-11-19 01:54 UTC: 「这张地图还没有挑战」wtf；现在只有寒烟山一张地图) the lines were tied to the official mountain's id, so on any
  // other seed (今日之山, a dev seed) the panel said there was no challenge. Both lines are laid out from whatever course is under the skis, so
  // every mountain has them; only the boards stay with the official ones (Rank.chalBoard), and a best is kept per mountain
  const mapSuf = () => { const m = mapNow(); return m && m.id === 'hanyan' ? '' : '.s' + (typeof Course !== 'undefined' ? Course.seed : 0); };
  const mapLabel = () => { const m = mapNow(); if (m) return isEN() ? m.en || m.zh : m.zh; return typeof App !== 'undefined' && App.isDaily && App.isDaily() ? T('今日之山') : tx('这座山', 'this mountain'); };
  // the ranked line's board (小红书): the 标准 run of a map's ranked line only (用户 02:40 UTC: 每张地图一条长线上榜)
  const boardOf = (id, df) => { const m = mapNow(); return m && typeof Rank !== 'undefined' && Rank.chalBoard ? Rank.chalBoard(m.id, id) : 0; };
  // (用户 2026-11-19 00:52 UTC: 中文模式出现了 Challenge) every word of the challenge in the language of the moment: T for names that are in
  // the dictionary (00a_i18n.js), tx(zh, en) for sentences built round numbers
  const T = s => typeof I18N !== 'undefined' ? I18N.t(s) : s, isEN = () => typeof I18N !== 'undefined' && I18N.en(), tx = (zh, en) => isEN() ? en : zh;
  const TN = s => { const m = /^(\d+ )(.+)$/.exec(s || ''); return m ? m[1] + T(m[2]) : T(s); };          // (a station: '3 陡坡')
  const lab = (e, zh) => { if (typeof I18N !== 'undefined' && I18N.live) I18N.live(e, zh); else e.textContent = zh; };          // (words that follow a language change)
  const RING_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.6"/><path d="M10 1.8v1.6M10 16.6v1.6M1.8 10h1.6M16.6 10h1.6"/></svg>';
  const MB = () => typeof UI !== 'undefined' && !!UI.mb;          // (菜单方案 B, 19_ui.js layoutB: web and 小红书, not the native apps)
  function syncLine() { const lid = chalOn() && LINES[Variants.val.rline] ? Variants.val.rline : null; if (lid !== L.id || (lid && diffKey() !== L.diff)) { L.id = lid; lineSetup(); } }
  function chalButton() {
    if (RG.cb || typeof document === 'undefined') return;
    const more = document.getElementById('more'); if (!more) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = devOn() ? 'dev-only' : ''; b.innerHTML = RING_ICON + '<span></span>'; lab(b.lastChild, '挑战');
    b.addEventListener('click', e => { e.stopPropagation(); pickOpen(true); if (e.detail) b.blur(); });
    // (菜单方案 B, 用户 2026-11-22: 自由滑和挑战两个一样大的入口) beside 自由滑, the same size and look, instead of in the small row
    const go = MB() && document.getElementById('go');
    if (go && go.parentNode) { b.id = 'go2'; b.className = ''; b.textContent = ''; lab(b, '挑战'); go.after(b); }
    else more.insertBefore(b, more.firstChild);
    RG.cb = b;
  }
  // (用户 2026-11-18 22:52 UTC: 滑到中间的时候，这个菜单我不能重新直接点挑战) the pause menu has 挑战 too, under 拍照: it goes back to the top
  // (as 回到山顶 does) and opens the same panel there, so a line can be started again or another one picked
  function chalMenuButton() {
    if (RG.cmb || typeof document === 'undefined') return;
    const ph = document.getElementById('m-photo'); if (!ph || !ph.parentNode) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'm-chal'; lab(b, '挑战'); b.hidden = true;
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (MB() && L.id && typeof UI !== 'undefined' && UI.state === 'run') { UI.menu(false); lineRestart(); return; }          // (菜单方案 B: during a line this is 重来这条线)
      if (typeof UI === 'undefined' || !UI.toTop || UI.toTop() === false) return;
      const t0 = Date.now(), wait = () => { if (UI.state === 'title' && !UI.open) pickOpen(true); else if (Date.now() - t0 < 20000) setTimeout(wait, 100); };
      setTimeout(wait, 100);
    });
    const mg = MB() && document.getElementById('m-go');
    if (mg && mg.parentNode) mg.after(b); else ph.parentNode.insertBefore(b, ph.nextSibling);
    RG.cmb = b;
  }
  function pickUI() {
    if (RG.pk) return RG.pk;
    const d = document.createElement('div'); d.id = 'rpick';
    d.innerHTML = '<style>#rpick{--pkl:calc(var(--col) + max(clamp(200px,calc(var(--cw) * .24),300px),calc(var(--actw,190px) + 24px)));position:absolute;left:var(--pkl);top:calc(var(--gt) + (var(--ch) - var(--gt) - var(--gb)) / 2);transform:translate(-8px,-50%);opacity:0;width:min(320px,calc(var(--cw) - var(--pkl) - var(--gr) - 56px));box-sizing:border-box;max-height:calc(var(--ch) - var(--gt) - var(--gb));display:flex;flex-direction:column;overflow:hidden;z-index:5;pointer-events:none;background:rgba(5,8,13,.52);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:12px;box-shadow:inset 0 0 0 1px var(--hair);padding:18px 18px 16px;color:var(--snow);font-family:var(--f-ui);font-size:12px;transition:opacity .35s ease,transform .45s cubic-bezier(.2,.6,.2,1)}'
      + '#rpick.on{opacity:1;transform:translate(0,-50%);pointer-events:auto}#rpick .sc{flex:0 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}#rpick .sc::-webkit-scrollbar{display:none}'
      + '#app.pkopen #title .how,#app.pkopen #title .fine{-webkit-clip-path:inset(0 0 100% 0);clip-path:inset(0 0 100% 0)}'          // (the title's foot lines run under the panel: they step aside while it is up, clipped, so they are back at once when it closes)
      + '#rpick h4{margin:0 0 12px;font-family:var(--f-lat);font-weight:500;font-size:10px;letter-spacing:.4em;color:var(--dim);white-space:nowrap}#rpick .l{display:flex;flex-direction:column;gap:6px}'
      + '#rpick button{appearance:none;-webkit-appearance:none;margin:0;border:0;font:inherit;color:var(--dim);cursor:pointer;box-sizing:border-box;text-align:left;border-radius:10px;padding:9px 12px;background:rgba(5,8,13,.25);box-shadow:inset 0 0 0 1px var(--hair);transition:color .2s,box-shadow .2s}'
      + '#rpick button.on{color:var(--sun);background:rgba(255,208,138,.08);box-shadow:inset 0 0 0 1px var(--sun)}@media (hover:hover){#rpick button:not(.on):hover{color:var(--snow);box-shadow:inset 0 0 0 1px rgba(244,247,251,.5)}}'
      + '#rpick .l button b{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--f-song);font-weight:400;font-size:15px;letter-spacing:.2em;line-height:1.4;color:var(--snow)}#rpick .l button.on b{color:var(--sun)}'
      + '#rpick .l button i{display:block;margin-top:2px;font-style:normal;font-size:11px;letter-spacing:.1em;color:var(--faint)}#rpick .l button em{font-family:var(--f-lat);font-style:normal;font-weight:300;font-size:13px;letter-spacing:.02em;font-variant-numeric:tabular-nums;color:var(--dim)}'
      + '#rpick .r{display:flex;gap:6px;margin-top:10px}#rpick .r button{flex:1;text-align:center;padding:0;height:32px;border-radius:10px;letter-spacing:.2em}'
      + '#rpick .t{margin-top:12px;font-size:11px;line-height:1.7;letter-spacing:.1em;color:var(--dim)}'
      + '#rpick .bt{flex:none;display:flex;gap:8px;margin-top:14px}#rpick .bt button{flex:1;text-align:center;height:40px;padding:0;border-radius:12px;letter-spacing:.2em}'
      + '#rpick .bt .go{flex:1.6;color:var(--sun);background:rgba(255,208,138,.08);box-shadow:inset 0 0 0 1px var(--sun);font-family:var(--f-song);font-size:15px;letter-spacing:.5em;text-indent:.5em}'
      + '#rpick .l button i .rk{display:block;margin-top:3px;color:var(--dim);letter-spacing:.06em}#rpick .no{padding:14px 4px;font-size:13px;line-height:1.8;letter-spacing:.12em;color:var(--dim)}#rpick.none .r,#rpick.none .t,#rpick.none .go{display:none}'
      + '#app.short #rpick{padding:12px 14px 12px}#app.short #rpick h4{margin-bottom:8px}#app.short #rpick .l{gap:5px}#app.short #rpick .l button{padding:6px 10px}#app.short #rpick .r{margin-top:8px}#app.short #rpick .r button{height:30px}#app.short #rpick .t{margin-top:8px;line-height:1.55}#app.short #rpick .bt{margin-top:10px}#app.short #rpick .bt button{height:36px}'
      + '#rpick kbd{margin-left:.4em;font-family:var(--f-lat);font-size:.75em;letter-spacing:.04em;opacity:.6;text-indent:0}'
      + '#rpick .bk{align-self:flex-start;flex:none;margin:-6px 0 4px -10px;background:none;box-shadow:none;border-radius:10px;text-align:left}'          // (返回 at the layer's top left, as on every layer: 19_ui.js U.layer)
      + '#pkscrim{position:absolute;inset:0;background:rgba(5,8,13,.5);opacity:0;visibility:hidden;transition:opacity .25s ease,visibility 0s linear .25s}#app.pkopen #pkscrim{opacity:1;visibility:visible;transition:opacity .25s ease}</style>'
      + '<button class="bk" data-x="1" type="button"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg><span>返回</span></button>'
      // (菜单方案 B, 用户 2026-11-22: 排行榜跟着挑战走) the board of the line picked stands in a column on the right, 小红书 only (#rpick.brd)
      + '<style>#rpick .cols{display:flex;gap:18px;flex:1 1 auto;min-height:0}#rpick .lc{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;min-width:0}#rpick .rc{display:none}'
      + '#rpick.brd{--pbw:min(820px,calc(var(--cw) - var(--gl) - var(--gr) - 16px));left:calc(var(--gl) + (var(--cw) - var(--gl) - var(--gr) - var(--pbw)) / 2);width:var(--pbw);height:calc(var(--ch) - var(--gt) - var(--gb))}'
      + '#rpick.brd .lc{flex:0 0 min(300px,44%)}#rpick.brd .rc{display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;border-left:1px solid var(--hair);padding-left:16px}'
      + '#rpick .rc .p{display:flex;gap:6px;margin:0 0 8px}#rpick .rc .p button{flex:1;text-align:center;padding:0;height:32px;border-radius:10px;letter-spacing:.2em}'
      + '#rpick .rc .me{margin:0 0 6px;font-size:12px;letter-spacing:.1em;color:var(--sun)}#rpick .rc ol{list-style:none;margin:0;padding:0;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}#rpick .rc ol::-webkit-scrollbar{display:none}'
      + '#rpick .rc li{display:flex;align-items:baseline;gap:10px;padding:5px 8px;border-radius:8px;font-size:13px;letter-spacing:.06em}#rpick .rc li b{width:2.2em;flex:none;text-align:right;font-family:var(--f-lat);font-weight:500;color:var(--dim)}#rpick .rc li.top b{color:var(--sun)}'
      + '#rpick .rc li span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#rpick .rc li em{font-style:normal;font-family:var(--f-lat);font-variant-numeric:tabular-nums}#rpick .rc li.mine{background:rgba(255,208,138,.1);box-shadow:inset 0 0 0 1px rgba(255,208,138,.45)}#rpick .rc li.mine b,#rpick .rc li.mine span{color:var(--sun)}'
      + '#rpick .rc li.none{color:var(--dim)}#rpick .rc .nt{flex:none;margin:8px 0 0;font-size:10.5px;line-height:1.6;letter-spacing:.06em;color:var(--faint)}#app.short #rpick .rc .nt{margin-top:4px;font-size:10px;line-height:1.45}#app.short #rpick .rc li{padding:3px 8px}</style>'
      + '<div class="cols"><div class="lc"><div class="sc"><h4></h4><div class="l"></div><div class="r d"></div><div class="t"></div></div><div class="bt"><button class="go" data-go="1">开始挑战</button></div></div><div class="rc"></div></div>';
    // the page under the panel is dimmed and takes no tap: a tap there puts the panel away (it used to be 出发, a run started by mistake)
    const sc = document.createElement('div'); sc.id = 'pkscrim';
    sc.addEventListener('click', e => { e.stopPropagation(); pickOpen(false); });
    const host = document.getElementById('app') || document.body; host.appendChild(sc); host.appendChild(d); RG.pk = d;
    d.addEventListener('click', e => {
      e.stopPropagation();          // (a click anywhere on the title page is 出发: never from inside this panel)
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.l) { RG.pkSel = b.dataset.l; pickDraw(); }
      else if (b.dataset.d) { Variants.set('ringdiff', b.dataset.d); pickDraw(); }
      else if (b.dataset.per) { RG.pkPer = b.dataset.per; pickBoard(); }
      else if (b.dataset.go) chalGo();
      else if (b.dataset.x) pickOpen(false);
    });
    return d;
  }
  function bestOf(id, df) { try { const k = 'coldsmoke.line2.' + id + '.' + df + mapSuf(), S = ST(); const r = S ? S.getJSON(k) : JSON.parse(localStorage.getItem(k) || 'null'); return r && r.best ? r.best.score : null; } catch (e) { return null; } }
  function pickDraw() {
    const d = pickUI(), df = diffKey(), ids = mapLines(), m = mapNow();
    if (!ids.includes(RG.pkSel)) RG.pkSel = ids.includes(Variants.val.rline) ? Variants.val.rline : ids[0];
    const cur = RG.pkSel;
    d.querySelector('h4').textContent = (isEN() ? 'Challenge · ' : '挑战 · ') + mapLabel();
    d.querySelector('.go').textContent = tx('开始挑战', 'Start'); d.querySelector('.bk span').textContent = tx('返回', 'Back');
    d.classList.toggle('none', !ids.length);
    d.querySelector('.l').innerHTML = !ids.length ? tx('<div class="no">这张地图还没有挑战。<br>回到寒烟山就有。</div>', '<div class="no">No challenge on this mountain yet.<br>Mount Cold Smoke has them.</div>') : PICK.filter(p => ids.includes(p[0])).map(([id, n, t]) => {
      const b = bestOf(id, df), bd = boardOf(id, df);
      return '<button data-l="' + id + '" class="' + (cur === id ? 'on' : '') + '"><b>' + T(n) + (b != null ? '<em>' + tx('最好 ', 'Best ') + fmt(b) + '</em>' : '') + '</b><i>' + T(t) + (bd ? '<span class="rk" data-rk="' + id + '">' + tx('排行榜 · 读取中…', 'Board · loading…') + '</span>' : '') + '</i></button>';
    }).join('');
    // the place and the best of everyone, for the ranked line (小红书 only; elsewhere the line just says 排行榜 in the 小红书 version)
    const sig = RG.pkSig = (RG.pkSig || 0) + 1;
    for (const sp of d.querySelectorAll('[data-rk]')) {
      const id = sp.dataset.rk, bd = boardOf(id, df);
      if (!rankOn() || MB()) { sp.remove(); continue; }          // (菜单方案 B: the board column says it all)
      Rank.line(null, bd).then(r => { if (RG.pkSig !== sig || !sp.isConnected) return; sp.textContent = !r ? tx('排行榜暂时读不到', 'Board unavailable for now') : (r.top != null ? tx('第一 ', 'Top ') + fmt(r.top) : tx('还没有人上榜', 'No one on the board yet')) + (r.rank != null ? tx(' · 我 ', ' · me ') + (typeof r.rank === 'number' ? tx('第 ' + r.rank + ' 名', '#' + r.rank) : r.rank) : ''); });
    }
    d.querySelector('.d').innerHTML = ['a', 'b', 'c'].map(k => '<button data-d="' + k + '" class="' + (df === k ? 'on' : '') + '">' + T(DNAME[k]) + '</button>').join('');
    const hint = d.querySelector('.t');
    hint.textContent = isEN() ? 'Each ring passed takes ' + BON[df] + ' s off' + (rankOn() && ids.some(k => boardOf(k, df)) ? ' · all three levels share one board, ' + (df === 'c' ? 'Hard adds nothing' : T(DNAME[df]) + ' adds ' + ['a', 'x'].filter(k => ids.includes(k)).map(k => T(LINES[k].name) + (hcOf(k, df) ? ' +' + hcOf(k, df) + ' s' : ' nothing')).join(', ')) : '') + ' · counts down 3, 2, 1'
      : '每穿过一个圈减 ' + BON[df] + ' 秒' + (rankOn() && ids.some(k => boardOf(k, df)) ? ' · 排行榜三档一起排，' + (df === 'c' ? '难不加时' : DNAME[df] + '加时 ' + ['a', 'x'].filter(k => ids.includes(k)).map(k => LINES[k].name + (hcOf(k, df) ? ' +' + hcOf(k, df) + ' 秒' : '不加')).join('、')) : '') + ' · 开始后倒数 3、2、1';
    const restart = document.createElement('span');
    restart.className = 'restart-key';
    restart.textContent = tx(' · 途中 Backspace 重来', ' · Backspace to restart');
    hint.appendChild(restart);
    pickBoard();
  }
  // the board column (菜单方案 B, 小红书 only): the line picked, today / this week / all time, this player's own row lit
  function pickBoard() {
    const d = RG.pk; if (!d) return;
    const on = MB() && rankOn() && !d.classList.contains('none'); d.classList.toggle('brd', on); { const app = document.getElementById('app'); if (app) app.classList.toggle('pkbrd', on); }
    const rc = d.querySelector('.rc'); if (!on) { rc.textContent = ''; return; }
    const id = RG.pkSel, own = boardOf(id), bd = own || Rank.chalBoard('hanyan', id), per = RG.pkPer || 'day';
    const PER = [['day', '今日'], ['week', '本周'], ['all', '总榜']];
    rc.innerHTML = '<h4></h4><div class="p">' + PER.map(([k, n]) => '<button data-per="' + k + '" class="' + (k === per ? 'on' : '') + '">' + T(n) + '</button>').join('') + '</div><p class="me"></p><ol></ol><p class="nt"></p>';
    const ln = (PICK.find(p => p[0] === id) || [, ''])[1];
    rc.querySelector('h4').textContent = (own ? '' : tx('寒烟山 · ', 'Mt Cold Smoke · ')) + T(ln) + tx(' · 排行榜', ' · Board');
    const hk = diffKey(), hv = hcOf(id, hk), hAll = !hcOf(id, 'a') && !hcOf(id, 'b');          // (the added time of this line at this level, said where it is seen: 用户 2026-11-23)
    rc.querySelector('.nt').textContent = own ? tx('每穿过一个圈减 ' + BON[hk] + ' 秒。轻松、标准、难一起排，' + (hAll ? '三档都不加时' : DNAME[hk] + (hv ? '加 ' + hv + ' 秒' : '不加时')) + '，越少越靠前。今日和本周按北京时间零点重新开始。每人只留最好的一次。', 'Each ring passed takes ' + BON[hk] + ' s off. All three levels on one board, ' + (hAll ? 'no level adds time' : T(DNAME[hk]) + (hv ? ' adds ' + hv + ' s' : ' adds nothing')) + '; lowest wins. Today and This week restart at Beijing midnight. Only your best run counts.')
      : tx('这座山的成绩不上榜，排行榜只算寒烟山。', 'Times on this mountain do not go on the board: only Mt Cold Smoke counts.');
    const me = rc.querySelector('.me'), ol = rc.querySelector('ol'); me.textContent = tx('读取中…', 'Loading…');
    const sig = RG.pbSig = (RG.pbSig || 0) + 1;
    Rank.top(bd, per, 100).then(r => {
      if (RG.pbSig !== sig || !rc.isConnected) return;
      if (!r) { me.textContent = tx('排行榜暂时读不到', 'Board unavailable for now'); return; }
      if (r.err) { me.textContent = T(r.err); return; }
      me.textContent = r.me ? tx('我 · 第 ' + r.me.rank + ' 名 · ' + r.me.t, 'Me · #' + r.me.rank + ' · ' + r.me.t) : tx('还没有成绩，滑一趟就会上榜', 'No time yet: one run puts you on it');
      const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      ol.innerHTML = r.rows.length ? r.rows.map(it => '<li class="' + (it.rank <= 3 ? 'top' : '') + (r.me && +r.me.rank === it.rank ? ' mine' : '') + '"><b>' + it.rank + '</b><span>' + esc(it.name) + '</span><em>' + it.t + '</em></li>').join('')
        : '<li class="none">' + (per === 'day' ? tx('今天还没有人上榜，第一个就是你', 'No one yet today: be the first') : tx('还没有人上榜', 'No one on the board yet')) + '</li>';
    });
  }
  // ---- the title's board card (菜单方案 B, 用户 2026-11-22: 一开始就看得到排行榜). Top right of the title page. 小红书: today's board of
  // 寒烟山 · 速降线, the first three and this player's own place; a tap opens the 挑战 panel with its board. The web build has no public
  // board, so there the card is this device's own bests on this mountain (none yet: no card). Redrawn every minute while the title is up
  function teaseUI() {
    if (RG.te) return RG.te;
    const t = document.getElementById('title'); if (!t) return null;
    const a = document.createElement('aside'); a.id = 'tease'; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.innerHTML = '<style>#tease{position:absolute;right:calc(var(--gr) + 4px);top:calc(var(--gt) + 52px);width:clamp(200px,calc(var(--cw) * .24),270px);box-sizing:border-box;padding:12px 14px 10px;border-radius:14px;background:rgba(7,11,18,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--hair);color:var(--snow);font-family:var(--f-ui);cursor:pointer;pointer-events:auto;opacity:0;transform:translateY(6px);transition:opacity 1s ease 2.2s,transform 1s cubic-bezier(.2,.6,.2,1) 2.2s}'
      + '#title.on #tease.on{opacity:1;transform:none}#tease:not(.on),#title:not(.on) #tease{pointer-events:none;transition-delay:0s}#app.pkopen #tease{opacity:0;transition:none}'
      + '#tease h5{margin:0 0 6px;font-family:var(--f-ui);font-weight:500;font-size:11px;letter-spacing:.22em;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#tease ol{list-style:none;margin:0;padding:0}'
      + '#tease li{display:flex;align-items:baseline;gap:8px;padding:3px 6px;border-radius:7px;font-size:13px;letter-spacing:.05em}#tease li b{width:1.6em;flex:none;text-align:right;font-family:var(--f-lat);font-weight:500;color:var(--sun)}#tease li span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '#tease li em{font-style:normal;font-family:var(--f-lat);font-variant-numeric:tabular-nums}#tease li.mine{background:rgba(255,208,138,.1);box-shadow:inset 0 0 0 1px rgba(255,208,138,.45)}#tease li.mine span{color:var(--sun)}#tease li.none{color:var(--dim);font-size:12px}'
      + '#tease .mo{margin:6px 0 0;text-align:right;font-size:12px;letter-spacing:.14em;color:var(--sun)}@media (hover:hover){#tease:hover{box-shadow:inset 0 0 0 1px rgba(255,208,138,.6)}}#app.short #tease{top:calc(var(--gt) + 46px);padding:9px 12px 8px}#app.short #tease li{padding:2px 6px}</style><div class="in"></div>';
    const go = e => { e.stopPropagation(); if (e.type === 'keydown' && e.code !== 'Enter' && e.code !== 'Space') return; if (e.type === 'keydown') e.preventDefault(); pickOpen(true); };
    a.addEventListener('click', go); a.addEventListener('keydown', go);
    t.appendChild(a); RG.te = a; return a;
  }
  function teaseDraw() {
    const a = teaseUI(); if (!a) return;
    RG.teT = Date.now();
    const box = a.querySelector('.in'), esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const li = (r, n, t, mine) => '<li class="' + (mine ? 'mine' : '') + '"><b>' + r + '</b><span>' + esc(n) + '</span><em>' + t + '</em></li>';
    if (rankOn()) {
      const bd = Rank.chalBoard('hanyan', 'a'), sig = RG.teSig = (RG.teSig || 0) + 1;
      Rank.top(bd, 'day', 3).then(r => {
        if (RG.teSig !== sig) return;
        if (!r || r.err) { a.classList.remove('on'); return; }
        const inTop = r.me && r.rows.some(it => it.rank === +r.me.rank);
        box.innerHTML = '<h5>' + tx('今日 · 寒烟山速降线', 'Today · Cold Smoke downhill') + '</h5><ol>'
          + (r.rows.length ? r.rows.map(it => li(it.rank, it.name, it.t, inTop && it.rank === +r.me.rank)).join('') : '<li class="none">' + tx('今天还没有人上榜，第一个就是你', 'No one yet today: be the first') + '</li>')
          + (r.me && !inTop ? li(r.me.rank, tx('我', 'Me'), r.me.t, true) : '') + '</ol><p class="mo">' + tx('看全部排行 ›', 'Full board ›') + '</p>';
        a.classList.add('on');
      });
      return;
    }
    const df = diffKey(), ids = mapLines(), bests = ids.map(id => [id, bestOf(id, df)]).filter(x => x[1] != null);
    if (!bests.length) { a.classList.remove('on'); return; }
    box.innerHTML = '<h5>' + tx('我的最好 · ', 'My best · ') + esc(mapLabel()) + ' · ' + T(DNAME[df]) + '</h5><ol>'
      + bests.map(([id, b]) => li('', T((PICK.find(p => p[0] === id) || [, id])[1]), fmt(b), false)).join('') + '</ol><p class="mo">' + tx('去挑战 ›', 'Challenge ›') + '</p>';
    a.classList.add('on');
  }
  RG.teaseDraw = () => teaseDraw();          // (for tools/menu-review-shots.js)
  if (typeof I18N !== 'undefined' && I18N.on) I18N.on(() => { if (RG.te) teaseDraw(); });
  if (typeof I18N !== 'undefined' && I18N.on) I18N.on(() => { if (RG.pkOpen) pickDraw(); });          // (the language changed while the panel is up)
  function pickOpen(on) {
    if (on && !(typeof UI !== 'undefined' && UI.state === 'title' && !UI.open)) return;
    RG.pkOpen = !!on; const d = pickUI(); if (on) pickDraw(); d.classList.toggle('on', !!on); if (RG.cb) RG.cb.classList.toggle('on', !!on); const app = document.getElementById('app'); if (app) app.classList.toggle('pkopen', !!on);
    if (typeof UI !== 'undefined' && UI.layer) UI.layer('pick', !!on, () => pickOpen(false));          // (a layer: 返回, Esc and the phone's own back close it, 19_ui.js)
    
  }
  
  function chalGo() {
    const ids = mapLines(); if (!ids.length) return;
    const id = ids.includes(RG.pkSel) ? RG.pkSel : ids[0];
    Variants.set('rline', id); syncLine(); pickOpen(false);
    RG.chal = true; if (typeof UI !== 'undefined') UI.go();
  }
  // 出发 (the button, Enter, a click on the picture) is free skiing: the line is put away first, unless the run being started is a challenge
  if (typeof UI !== 'undefined' && UI.go) {
    const GO0 = UI.go;
    UI.go = function () {
      if (chalOn() && typeof Variants !== 'undefined') { if (!RG.chal && Variants.val.rline !== 'off') Variants.set('rline', 'off'); RG.chal = false; syncLine(); }
      pickOpen(false);
      return GO0.apply(this, arguments);
    };
  }
  if (typeof addEventListener !== 'undefined') addEventListener('keydown', e => {
    if (!RG.pkOpen || e.repeat) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); pickOpen(false); }
    else if (e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); chalGo(); }
  }, true);
  function pickFrame() {
    if (typeof document === 'undefined') return;
    if (chalOn()) { chalButton(); chalMenuButton(); }
    if (RG.cmb) { const sh = chalOn() && typeof UI !== 'undefined' && UI.state === 'run' && mapLines().length > 0; if (RG.cmb.hidden === sh) RG.cmb.hidden = !sh;
      if (MB()) { const w = L.id ? '重来这条线' : '挑战'; if (RG.cmb.dataset.zh !== w) lab(RG.cmb, w); } }
    if (MB() && typeof UI !== 'undefined' && UI.state === 'title' && (!RG.teT || Date.now() - RG.teT > 60000 || RG.teMap !== (typeof Course !== 'undefined' ? Course.seed : 0) + diffKey())) { RG.teMap = (typeof Course !== 'undefined' ? Course.seed : 0) + diffKey(); teaseDraw(); }
    if (RG.pkOpen && !(typeof UI !== 'undefined' && UI.state === 'title' && !UI.open)) pickOpen(false);
  }
  RG.share = shareOn();          // (19b_rank.js: the challenge boards show on the share link too)
  RG.lipOf = lipOf; RG.kickerIn = kickerIn;          // (for test scripts)
  RG.rules = { BON, HC, hcOf };          // (the board's own note says how a time is scored, from these: 19b_rank.js)
  RG.pickOpen = on => pickOpen(on); RG.finishNow = () => lineFinish();          // (for tools/layout-check.js: the panel and the result card without skiing a whole line)
  RG.line = L; if (typeof window !== 'undefined') window.__rings = RG;          // (for test scripts)
  const GS0 = typeof Game !== 'undefined' ? Game.start : null;
  if (GS0) Game.start = function () { if (L.id && Game.s) { if (L.st !== 'count') lineArm(); return; } return GS0.apply(this, arguments); };
  if (typeof addEventListener !== 'undefined') addEventListener('keydown', e => {
    if (!L.id || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (typeof Game !== 'undefined' && Game.mode === 'replay') return;          // (the replay has the keys while it plays)
    const card = L.el && L.q('card').classList.contains('on');
    if (card && (e.code === 'Enter' || e.code === 'Escape')) { e.preventDefault(); e.stopImmediatePropagation(); if (e.code === 'Enter') lineRestart(); else lineFree(); return; }
    if (e.code === 'Backspace' && typeof UI !== 'undefined' && UI.state === 'run' && !UI.open) { e.preventDefault(); e.stopImmediatePropagation(); lineRestart(); }
  }, true);
  RG.frame = function () {
    { const c = L.el && L.q('card'), app = document.getElementById('app'); if (app) app.classList.toggle('rcardon', !!(c && c.classList.contains('on'))); }
    if (typeof document !== 'undefined') try { pickFrame(); } catch (e) { if (!RG.perr) { RG.perr = 1; console.warn('pick:', e); } }
    const lid = typeof Variants !== 'undefined' && chalOn() && LINES[Variants.val.rline] ? Variants.val.rline : null;
    if (lid !== L.id || (lid && diffKey() !== L.diff)) { L.id = lid; lineSetup(); }
    const want = typeof Variants !== 'undefined' && chalOn() && ((Variants.val.rings === 'on' && devOn()) || !!L.id || (typeof Game !== 'undefined' && Game.mode === 'replay'));          // (a replay watched while skiing freely (上一场回放) still draws its rings)
    if (want !== RG.on) { RG.on = want; reset(); hud(); }
    
    const T = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    if (L.id && typeof document !== 'undefined') try { lineFrame(T); } catch (e) { if (!RG.lerr) { RG.lerr = 1; console.warn('line:', e); } }
    // (用户 05:16 UTC: 拍照时光圈不见了): held (the pause menu, 拍照) the world stands still, and so do the rings: drawn as they were, time stopped.
    // The count-down at the gate holds the skier the same way, but the rings ahead are already there and alive, so the line can be read
    const counting = L.st === 'count';
    if (RG.on && typeof Game !== 'undefined' && Game.mode === 'hold' && !counting) return;
    // (the replay, 93_replay.js: Game.mode 'replay'; RG.replay(T) sets RG.rings to how they stood at that moment of the run, then they are drawn)
    if (RG.on && typeof Game !== 'undefined' && Game.mode === 'replay') { if (RG.replay) try { const tr = RG.replay(T), t = typeof tr === 'number' ? tr : T; prep(t); lastT = t; } catch (e) { drawList = []; } else drawList = []; return; }          // (the replay hands back the run's own clock: the rings flow on it, and stand still with its pause)
    if (!RG.on || typeof Game === 'undefined' || !Game.s || (Game.mode !== 'run' && Game.mode !== 'park' && !counting)) { drawList = []; if (RG.hud) RG.hud.style.display = 'none'; return; }
    lastT = T;          // (park: stopped past the finish, the rings stay where they are and keep moving)
    RG.n++; try { update(T); prep(T); hud(); trail(); } catch (e) { drawList = []; if (!RG.err) { RG.err = 1; console.warn('rings:', e); } }
  };
  RG.clock = () => lastT;          // (for test scripts: the clock the rings are drawn with this frame)
  // Shared work runs once before the shadow map and both eye views.
  if (typeof Render !== 'undefined') {
    const R0 = Render.renderShared; Render.renderShared = function () { RG.frame(); order(); return R0.apply(this, arguments); };
    const I0 = Render.init; Render.init = function (g) { const out = I0.apply(this, arguments); try { RG.init(g); } catch (e) { console.warn('rings init:', e); } return out; };
    // (a pipeline that failed to build must never take the game's frame down with it: the rings are then simply not drawn)
    const safe = f => R => { try { f(R); } catch (e) { if (!RG.gerr) { RG.gerr = 1; console.warn('rings draw:', e && e.message ? e.message : e); } } };
    // (用户 2026-11-18 07:46 UTC: 云把近处的光圈挡住了) The rings write no depth, so whatever transparent thing is drawn after them covers them,
    // however far it is. This file loads before the game's own passes are put in (99_main.js boot), so the rings used to come first: the sky's
    // clouds, the cloud sea, the far city's lights, the tree ghosts and the gate flags then all drew over a ring 20 m away. Every frame the
    // rings are put back where they belong: last of the transparent pass (they are always nearer than the clouds and the vista), and in the
    // fx pass straight after the far snowfall's veil (Dust.veil, the first there), under the near spray and snow
    const pS = safe(R => RG.drawShadow(R)), pT = safe(R => RG.drawScene(R)), pG = safe(R => RG.drawGhosts(R)), pL = safe(R => RG.drawLight(R));
    const order = () => {
      const P = Render.passes, t = P.transparent, f = P.fx, n = t.length;
      if (t[n - 2] !== pT || t[n - 1] !== pG) { for (const q of [pT, pG]) { const i = t.indexOf(q); if (i >= 0) t.splice(i, 1); } t.push(pT, pG); }
      const want = f.length > 1 ? 1 : 0;
      if (f[want] !== pL) { const i = f.indexOf(pL); if (i >= 0) f.splice(i, 1); f.splice(Math.min(f.length, f.length > 0 && f[0] !== pL ? 1 : 0), 0, pL); }
    };
    RG.order = order;
    Render.passes.shadow.push(pS);
    Render.passes.transparent.push(pT, pG);
    Render.passes.fx.push(pL);
  }
  return RG;
})();

// ---- shaders. Colours are linear; light is in units of film white (ringE: one over the exposure, so 1 is white on the screen at any hour)
const RING_SSL = `
fn ringE() -> f32 { return 1.0 / max(U.ambSky.w, 1e-4); }
fn ringGrn(n: f32) -> vec3f { return mix(vec3f(0.033, 0.896, 0.392), vec3f(0.021, 1.0, 0.262), n); }
fn ringVio(n: f32) -> vec3f { return mix(vec3f(0.305, 0.188, 0.791), vec3f(0.402, 0.045, 0.716), n); }
// green low, violet high; by day the violet is held back (pale violet on bright snow and sky read as a missing top half)
fn ringHue(a: f32, e: f32, n: f32) -> vec3f { return mix(ringGrn(n), ringVio(n), saturate((sin(a) + 1.0) * 0.5 * mix(0.3, 0.75, n) + e * mix(0.5, 1.0, n))); }
// a grain on the screen: drawn at its true size, or minPx, whichever is larger (k: how much of the drawn disc it really fills, so a far
// grain enlarged to stay a pixel keeps its own light), streaked from p0 to p1. Its depth is p0's: the scene's depth test hides it
struct RQ { clip: vec4f, uv: vec2f, k: f32, hl: f32 }
fn ringQuad(corner: vec2f, p0: vec3f, p1: vec3f, rw: f32, minPx: f32) -> RQ {
  var q: RQ; q.clip = vec4f(0.0, 0.0, -2.0, 1.0); q.uv = vec2f(0.0); q.k = 0.0; q.hl = 0.0;
  let c0: vec4f = U.viewProj * vec4f(p0, 1.0); let c1: vec4f = U.viewProj * vec4f(p1, 1.0);
  if (c0.w < 0.3 || c1.w < 0.3) { return q; }
  let asp: f32 = U.camUp.w;
  let s0: vec2f = c0.xy / c0.w * vec2f(asp, 1.0); let s1: vec2f = c1.xy / c1.w * vec2f(asp, 1.0);
  let rt: f32 = rw / (c0.w * U.camRight.w);
  let r: f32 = max(rt, minPx * 2.0 * U.res.w);
  let ax: vec2f = s1 - s0; let L: f32 = length(ax);
  var dir: vec2f = vec2f(0.0, 1.0); if (L > 1e-6) { dir = ax / L; }
  let nr: vec2f = vec2f(-dir.y, dir.x);
  let sp: vec2f = mix(s0, s1, corner.y * 0.5 + 0.5) + dir * (corner.y * r) + nr * (corner.x * r);
  q.clip = vec4f(sp.x / asp * c0.w, sp.y * c0.w, c0.z, c0.w);
  q.hl = 0.5 * L / r;
  q.uv = vec2f(corner.x, corner.y * (1.0 + q.hl));
  q.k = min(1.0, sq(rt / r));
  return q;
}
`;
// the grains: kind 0 the dense swarm along the ring, kind 1 the outer grains drifting off and turning violet, kind 2 the curtain's threads (none drawn now).
// Each is a pure function of (index, time): a life of a few seconds, then it is born again somewhere else on the ring
// one grain of a ring, a pure function of (index, time): where it is, how bright, how big
const DUST_SSL = `
struct DG { p: vec3f, b: f32, wsz: f32, minPx: f32, up: f32, col: vec3f, st: vec3f }
fn bez3(a: vec3f, b: vec3f, c: vec3f, d: vec3f, t: f32) -> vec3f { let u: f32 = 1.0 - t; return a * (u * u * u) + b * (3.0 * u * u * t) + c * (3.0 * u * t * t) + d * (t * t * t); }
// the ring's own frame turned to face the line through it (M.g.w the yaw, 0 = square to the fall line): x across, z back up the line
fn ringRot(o: vec3f) -> vec3f { let cy: f32 = cos(M.g.w); let sy: f32 = sin(M.g.w); return vec3f(o.x * cy - o.z * sy, o.y, o.x * sy + o.z * cy); }
fn dustGrain(i: u32) -> DG {
  var g: DG;
  let C: vec3f = M.a.xyz; let R0: f32 = M.a.w; let open: f32 = M.b.x; let dis: f32 = M.b.y;
  let A: f32 = M.b.z; let nearK: f32 = M.b.w; let T: f32 = M.c.x; let rid: u32 = u32(M.c.y); let hitK: f32 = M.c.z; let sz: f32 = M.c.w;
  let n: f32 = M.d.x; let grown: f32 = M.d.z;
  let NI: u32 = u32(M.e.x); let NO: u32 = u32(M.e.y); let NC: f32 = M.e.z;
  var kind: u32 = 0u; if (i >= NI) { kind = 1u; } if (i >= NI + NO) { kind = 2u; }
  let hs: vec3f = hashu3(i * 7u + rid * 7919u + 11u);
  var L: f32 = mix(1.2, 2.2, hs.x); if (kind == 1u) { L = mix(1.0, 1.8, hs.x); }
  let ph: f32 = (T + hs.y * L) / L; let u: f32 = fract(ph); let gen: u32 = u32(floor(ph));
  let h: vec3f = hashu3(i * 13u + gen * 104729u + rid * 7919u + 3u);
  let h2: vec3f = hashu3(i * 17u + gen * 15485863u + rid * 31u + 5u);
  var ang: f32 = h.x * 6.2831853; var rr: f32 = R0; var dz: f32 = 0.0; var dy: f32 = 0.0;
  var b: f32 = 0.0; var wsz: f32 = 0.02; var minPx: f32 = 1.3; var col: vec3f = vec3f(0.0); var up: f32 = 0.0;
  if (kind == 0u) {
    // (用户 05:22 UTC: 整个圈要明显是点组成的，中间很密，点都在动、动得快，轻、飘): no solid tube any more. The grains crowd toward the
    // ring's middle line (rad ~ h.y squared), each running along the ring at its own pace one way or the other and jittering fast on its spot
    let rad: f32 = 0.36 * sz * h.y * h.y; let th: f32 = h.z * 6.2831853;
    let fin: f32 = M.d.y; let jf: f32 = (3.0 + 4.0 * h2.x) * (1.0 + 0.6 * fin);          // (the finish ring (用户 21:33 UTC): the same green, but bigger, denser, brighter and livelier)
    rr = R0 + rad * cos(th) + 0.035 * (1.0 + 1.8 * fin) * sz * sin(T * jf + h.x * 40.0);
    dz = rad * sin(th) + 0.035 * (1.0 + 1.8 * fin) * sz * cos(T * jf * 0.83 + h.y * 40.0);
    let flow: f32 = (0.5 + 1.4 * h2.y) * (1.0 + 1.2 * fin) * select(-1.0, 1.0, h2.z > 0.5) / max(R0, 1.0);
    ang = ang + flow * u * L + 0.02 * sin(T * jf * 1.3 + h.z * 40.0);
    let fade: f32 = min(1.0, min(u / 0.12, (1.0 - u) / 0.2));
    let blink: f32 = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(T * (4.0 + 6.0 * h2.x) + h.y * 30.0), 3.0);
    let qn: f32 = saturate((grown - (0.3 + 0.45 * h2.y)) / 0.25);
    b = fade * blink * qn * (1.0 - 0.5 * h.y);
    wsz = 0.032 * sz * (0.6 + 0.9 * h2.z); minPx = 1.8;
    col = mix(ringHue(ang, 0.0, n), vec3f(0.9, 1.0, 0.97), 0.4 * h2.x * h2.x);
  } else if (kind == 1u) {
    let ou: f32 = 0.15 + 0.85 * h2.x;
    rr = R0 + (h.y - 0.5) * 0.3 * sz + ou * 2.0 * sz * u;
    dz = (h.z - 0.5) * 0.6 * sz * (0.3 + u);
    dy = 0.5 * u * sz;
    ang = ang + 0.05 * sin(T + h.y * 30.0);
    b = min(1.0, u / 0.2) * (1.0 - u) * 0.6;
    wsz = 0.08 * sz * (0.9 + 0.8 * h2.y); minPx = 2.2;
    col = ringHue(ang, 0.4 * u, n);
  } else {
    let j: f32 = f32(i - NI - NO);
    ang = (j + 0.5 * hs.z) / NC * 6.2831853;
    let w: f32 = pow(0.5 + 0.5 * sin(ang * 5.0 - T * 1.6 + sin(ang * 3.0 + T * 0.7)), 3.0);
    let curt: f32 = sq(saturate((grown - 0.6) / 0.4)) * (1.0 - saturate(dis * 2.5));
    b = 0.55 * w * curt;
    rr = R0 + 0.30 * sz * (hs.x - 0.5); dz = 0.30 * sz * (hs.y - 0.5);
    wsz = 0.02 * sz; minPx = 1.1; up = (0.25 + 0.35 * w) * sz;
    col = ringHue(ang, 0.25, n);
  }
  // ---- 下一个圈提示 (Variants rflow; 用户 2026-11-18 08:04 UTC: 下一个圈常被地形挡住，穿圈时不知道下一个在哪；靠近这个圈时就要有一个
  // 直观、subtle 的提示，大概知道下一个在哪). M.d.w the kind (1-5, 0 none), M.f the next ring (centre, radius), M.e.w how near this ring is.
  //   1 一群光游过去 ~0.6 s before the ring (15:54 UTC) 4.5% of the grains gather into a loose swarm that swims on one meandering curve to the next ring (08:06 UTC)
  //   2 一缕光线    at the splash a single thin thread of grains leaves the side facing the next ring and draws one line to it
  //   3 细流引路    from ~40 m out a few grains keep peeling off and drifting to the next ring, a faint living trickle that points the way
  //   4 亮边指方向  the side of this ring facing the next one glows brighter and leans out, a compass on the ring itself
  //   5 远处光柱    a faint column of grains rises 20 m over the next ring, seen above a crest that hides the ring itself
  //   6 溪流 / 7 细高光柱 / 8 螺旋光柱: 16:23 UTC variants of 3 and 5 (see each below)
  var flowP: vec3f = vec3f(0.0); var flowSt: vec3f = vec3f(0.0); var useFlow: f32 = 0.0;
  let hsel: vec3f = hashu3(i * 37u + rid * 613u + 21u);
  let md: f32 = M.d.w; let apr: f32 = M.e.w;
  let N: vec3f = M.f.xyz; let RN: f32 = M.f.w;
  let dxy: vec2f = vec2f(N.x - C.x, (N.y - C.y) * 0.35); let angD: f32 = atan2(dxy.y, dxy.x); let dk: f32 = saturate(length(dxy) / 3.0);
  if (md > 3.5 && md < 4.5 && kind == 0u) {
    let w: f32 = pow(max(0.0, cos(ang - angD)), 10.0) * dk * apr * (1.0 - saturate(dis * 3.0));
    b = b * (1.0 + 2.2 * w); rr = rr + w * 0.22 * sz;
  }
  if (md > 0.5 && md < 1.5 && M.g.x >= 0.0 && kind == 0u && hsel.x < 0.07) {
    // a swarm (用户 08:06 UTC: 不要每颗直线飞过去，突兀；要像一群 swarm，沿一条不规则的曲线一起游到下一个圈). The grains gather off the ring's
    // side that faces the next one into a loose cloud, the cloud swims on one shared, meandering curve (a cubic plus two slow wiggles that
    // die at both ends), each grain circling inside it on its own orbit and lagging a little, the cloud swelling mid-way and drawing in
    // again; at the next ring it spreads back onto the ring, each grain to its own place. No streaks: points only, a third as bright
    let hd: vec3f = hashu3(i * 23u + rid * 101u + 9u);
    let hf: vec3f = hashu3(i * 29u + rid * 211u + 17u);
    let hr: vec3f = hashu3(rid * 131u + 7u);
    let ro0: f32 = rr * open;
    let Pown: vec3f = C + ringRot(vec3f(cos(ang) * ro0, sin(ang) * ro0 + dy, dz));
    let a1: f32 = angD + 3.1415927 + (hd.x - 0.5) * 2.4;
    let Pland: vec3f = N + vec3f(cos(a1) * RN, sin(a1) * RN, (hf.y - 0.5) * 0.3);
    let P0: vec3f = C + ringRot(vec3f(cos(angD), sin(angD), 0.0) * R0 * open);
    let P1: vec3f = N + vec3f(cos(angD + 3.1415927), sin(angD + 3.1415927), 0.0) * RN * 0.6;
    let D: vec3f = P1 - P0; let dl: f32 = length(D);
    let sd: vec3f = normalize(vec3f(-D.z, 0.0, D.x) + vec3f(0.0001, 0.0, 0.0));
    let c1: vec3f = P0 + vec3f(cos(angD), sin(angD), 0.0) * 2.0 * sz + vec3f(0.0, 1.2 + 2.0 * hr.x, 0.0) + D * 0.25 + sd * (hr.y - 0.5) * 0.3 * dl;
    let c2: vec3f = P1 - D * 0.3 + sd * (hr.z - 0.5) * 0.35 * dl + vec3f(0.0, (0.05 + 0.1 * hr.x) * dl, 0.0);
    let ts: f32 = M.g.x;
    let delay: f32 = 0.15 * hd.y;
    let dur: f32 = clamp(1.0 + dl * 0.005, 1.0, 1.5);
    let t: f32 = saturate((ts - delay) / dur);
    let e: f32 = mix(t * t * (3.0 - 2.0 * t), 1.0 - (1.0 - t) * (1.0 - t), 0.5);
    let bell: f32 = sin(3.1415927 * e);
    let mw: vec3f = (sd * sin(e * 9.4 + hr.x * 6.0) * 0.07 + vec3f(0.0, sin(e * 7.1 + hr.y * 6.0), 0.0) * 0.04) * dl * bell;
    let core: vec3f = bez3(P0, c1, c2, P1, e) + mw;
    let th: f32 = hf.x * 6.2831853 + T * (1.5 + 2.5 * hf.z) * select(-1.0, 1.0, hd.z > 0.5);
    let rs: f32 = (0.5 + 1.6 * hf.y) * (0.5 + 0.9 * bell);
    let orb: vec3f = sd * (cos(th) * rs) + vec3f(0.0, sin(th) * rs * 0.7, 0.0) + vec3f(0.0, 0.0, (hd.x - 0.5) * 0.8 * sz * bell);
    let swarm: vec3f = core + orb;
    let gather: f32 = smoothstep(0.0, 0.22, e); let spread: f32 = smoothstep(0.78, 1.0, e);
    flowP = mix(mix(Pown, swarm, gather), Pland, spread);
    flowSt = vec3f(0.0);
    let after: f32 = ts - delay - dur;
    let land: f32 = select(1.0, 1.0 - saturate(after / 0.35), after > 0.0);
    b = b * mix(1.0, 1.1, saturate(t * 5.0)) * land;
    wsz = wsz * mix(1.0, 2.2, gather * (1.0 - spread)); minPx = mix(minPx, 2.6, gather * (1.0 - spread));          // (bigger grains in flight: at 20-50 m the swarm's 1.8 px dots were lost)
    useFlow = 1.0;
  } else if (md > 1.5 && md < 2.5 && dis > 0.0 && kind == 0u && hsel.x < 0.012) {
    // one thread: every grain on the same curve (handles from the ring's own hash), strung out along it by when it leaves
    let q: f32 = hsel.x / 0.012; let hr: vec3f = hashu3(rid * 131u + 7u); let hj: vec3f = hashu3(i * 43u + rid * 17u + 3u) - vec3f(0.5);
    let P0: vec3f = C + ringRot(vec3f(cos(angD), sin(angD), 0.0) * R0 * open);
    let P1: vec3f = N + vec3f(cos(angD + 3.1415927), sin(angD + 3.1415927), 0.0) * RN * 0.8;
    let D: vec3f = P1 - P0; let dl: f32 = length(D);
    let sd: vec3f = normalize(vec3f(-D.z, 0.0, D.x) + vec3f(0.0001, 0.0, 0.0));
    let c1: vec3f = P0 + vec3f(cos(angD), sin(angD), 0.0) * 2.5 * sz + vec3f(0.0, 1.0 + 1.5 * hr.x, 0.0) + D * 0.25;
    let c2: vec3f = P1 - D * 0.3 + sd * (hr.y - 0.5) * 0.25 * dl + vec3f(0.0, 0.08 * dl, 0.0);
    let ts: f32 = dis * 2.2; let dur: f32 = clamp(0.4 + dl * 0.006, 0.45, 1.0);
    let t: f32 = saturate((ts - q * 0.35) / dur); let tp: f32 = saturate((ts - q * 0.35 - 0.04) / dur);
    let e: f32 = 1.0 - pow(1.0 - t, 2.0); let ep: f32 = 1.0 - pow(1.0 - tp, 2.0);
    let jit: vec3f = hj * 0.18 * sz * sin(3.1415927 * e);
    flowP = bez3(P0, c1, c2, P1, e) + jit;
    flowSt = (bez3(P0, c1, c2, P1, ep) + jit - flowP) * select(0.0, 0.3, t > 0.0 && t < 1.0);          // (a short blur only: long straight streaks looked out of place, 08:06 UTC)
    let after: f32 = ts - q * 0.35 - dur;
    b = 0.55 * select(1.0, 1.0 - saturate(after / 0.3), after > 0.0) * select(0.0, 1.0, t > 0.0);
    useFlow = 1.0;
  } else if (md > 2.5 && md < 3.5 && apr > 0.0 && kind == 0u && hsel.x < 0.006) {
    // a trickle: each of these grains leaves its place on the ring every 1.6 s or so and drifts to the next ring, on a new curve each time
    let Pd: f32 = 1.4 + 0.5 * hsel.z; let ph: f32 = T / Pd + hsel.y * 7.0; let cyc: u32 = u32(floor(ph)); let t: f32 = fract(ph);
    let hd: vec3f = hashu3(i * 53u + cyc * 7919u + rid * 3u + 1u);
    let a0: f32 = hd.x * 6.2831853; let ro0: f32 = R0 * open;
    let P0: vec3f = C + vec3f(cos(a0) * ro0, sin(a0) * ro0, 0.0);
    let P1: vec3f = N + vec3f(cos(a0 + (hd.y - 0.5)) * RN, sin(a0 + (hd.y - 0.5)) * RN, 0.0);
    let D: vec3f = P1 - P0; let dl: f32 = length(D);
    let sd: vec3f = normalize(vec3f(-D.z, 0.0, D.x) + vec3f(0.0001, 0.0, 0.0));
    let c1: vec3f = P0 + vec3f(cos(a0), sin(a0), 0.0) * (0.5 + 1.5 * hd.z) * sz + vec3f(0.0, 0.5 + hd.x, 0.0) + D * 0.2;
    let c2: vec3f = P1 - D * 0.25 + sd * (hd.z - 0.5) * 0.2 * dl;
    let e: f32 = t * t * (3.0 - 2.0 * t); let tp: f32 = max(0.0, t - 0.03); let ep: f32 = tp * tp * (3.0 - 2.0 * tp);
    flowP = bez3(P0, c1, c2, P1, e);
    flowSt = (bez3(P0, c1, c2, P1, ep) - flowP) * 0.3;
    b = 0.45 * apr * sin(3.1415927 * t) * (1.0 - saturate(dis * 3.0));
    useFlow = 1.0;
  } else if (md > 4.5 && md < 5.5 && kind == 0u && hsel.x < 0.03 && apr > 0.0) {
    // a beacon: grains rise slowly in a loose column over the next ring and fade at the top
    let ph: f32 = fract(T / 3.2 + hsel.y * 11.0); let a0: f32 = hsel.z * 6.2831853 + T * 0.4; let rj: f32 = RN * 0.45 * sqrt(fract(hsel.y * 37.0));
    flowP = N + vec3f(cos(a0) * rj, RN * 0.6 + ph * 20.0, sin(a0) * rj);
    flowSt = vec3f(0.0, -0.35, 0.0);
    b = 0.4 * apr * sin(3.1415927 * ph) * (1.0 - 0.6 * ph) * (1.0 - saturate(dis * 2.0));
    useFlow = 1.0;
  } else if (md > 5.5 && md < 6.5 && kind == 0u && hsel.x < 0.05 && apr > 0.0) {
    // 6 溪流 (用户 16:23 UTC: 细流和光柱都不错，再研究): the trickle made one stream. All its grains run on one shared curve from the side of this
    // ring facing the next to the next one, meandering like a brook (two slow bends that drift with time), each grain a little to one
    // side of the line and on its own phase, so the stream is a dotted, living line that keeps flowing for as long as the ring is ahead
    let hr: vec3f = hashu3(rid * 131u + 7u);
    let P0: vec3f = C + ringRot(vec3f(cos(angD), sin(angD), 0.0) * R0 * open);
    let P1: vec3f = N + vec3f(cos(angD + 3.1415927), sin(angD + 3.1415927), 0.0) * RN * 0.85;
    let D: vec3f = P1 - P0; let dl: f32 = length(D);
    let sd: vec3f = normalize(vec3f(-D.z, 0.0, D.x) + vec3f(0.0001, 0.0, 0.0));
    let c1: vec3f = P0 + vec3f(cos(angD), sin(angD), 0.0) * 1.5 * sz + vec3f(0.0, 0.8 + hr.x, 0.0) + D * 0.3 + sd * (hr.y - 0.5) * 0.2 * dl;
    let c2: vec3f = P1 - D * 0.3 + sd * (hr.z - 0.5) * 0.2 * dl + vec3f(0.0, 0.06 * dl, 0.0);
    let Pd: f32 = clamp(1.2 + dl * 0.02, 1.4, 2.6); let ph: f32 = fract(T / Pd + hsel.y * 13.0); let e: f32 = ph;
    let bell: f32 = sin(3.1415927 * e);
    let mw: vec3f = (sd * sin(e * 9.0 + T * 0.7 + hr.x * 6.0) * 0.05 + vec3f(0.0, sin(e * 6.0 + T * 0.5 + hr.y * 6.0), 0.0) * 0.02) * dl * bell;
    let hj: vec3f = hashu3(i * 47u + rid * 19u + 5u) - vec3f(0.5);
    flowP = bez3(P0, c1, c2, P1, e) + mw + (sd * hj.x + vec3f(0.0, hj.y * 0.6, 0.0)) * 0.35 * sz * (0.4 + bell) + vec3f(0.0, 0.04 * sin(T * 5.0 + hsel.z * 30.0), 0.0);
    let tg: vec3f = bez3(P0, c1, c2, P1, min(1.0, e + 0.01)) - bez3(P0, c1, c2, P1, e);
    flowSt = -normalize(tg + vec3f(0.0, 0.0001, 0.0)) * 0.35;          // (a short tail along the stream: Mac check 16:4x UTC, bare dots at 2.2% were not seen)
    b = 0.85 * apr * min(1.0, e * 8.0) * min(1.0, (1.0 - e) * 6.0) * (1.0 - saturate(dis * 3.0));
    wsz = wsz * 1.8; minPx = 2.4;
    useFlow = 1.0;
  } else if (md > 6.5 && md < 7.5 && kind == 0u && (hsel.x < 0.035 || M.g.z > 0.5) && apr > 0.0) {
    // 7 细高光柱: a thin tall column over the next ring, 35 m, densest at the bottom, swaying a little at the top, grains streaming upward
    let ph: f32 = fract(T / 4.5 + hsel.y * 11.0); let hh: f32 = pow(ph, 0.8) * 35.0; let a0: f32 = hsel.z * 6.2831853 + T * 0.6;
    let rj: f32 = RN * 0.18 * sqrt(fract(hsel.y * 37.0)) * (1.0 - 0.5 * ph);
    let sw: f32 = sin(T * 0.45 + f32(rid) * 0.37) * 0.04 * hh;
    let colP: vec3f = N + vec3f(cos(a0) * rj + sw, RN * 0.4 + hh, sin(a0) * rj);
    // (用户 16:45 UTC: 光柱逐渐被火团吸进去一样，然后变成光圈) M.g.y: 0 while the flame burns, then 0..1 over ~0.7 s as it opens. The column
    // is drawn down into the flame (16:49 UTC: from the top down, the top first), each grain falling faster as it nears (ease-in), brightening as it
    // feeds the flame, and gone into it as the ring opens
    // (16:49 UTC) top first, the bottom last; about two grains in five are drawn into the flame, the rest fade where they are
    // (16:51 UTC: 不用把点挪回来，从上到下慢慢 fade out，不要太规律：上面的先消失的概率高，下面的低) no grain moves now: each goes out where
    // it is at its own moment, the top ones likely early, the bottom ones likely late, with a good deal of chance in it
    let ab: f32 = M.g.y; let st0: f32 = min(0.72, 0.5 * (1.0 - ph) + 0.4 * fract(hsel.y * 71.0 + hsel.z * 13.0)); let kk: f32 = saturate((ab - st0) / 0.28); let suck: f32 = 0.0;
    let ea: f32 = kk * kk * suck;
    // (16:51 UTC: 吸进来的目的地不是火团中心，而是新光圈上的位置，分散地落到圈上) each to its own place round the opening ring
    let ht: vec3f = hashu3(i * 59u + rid * 7u + 2u); let at: f32 = ht.x * 6.2831853; let rt: f32 = RN * max(open, 0.3) * (1.0 + 0.06 * (ht.y - 0.5));
    let tgt: vec3f = N + vec3f(cos(at) * rt, sin(at) * rt, (ht.z - 0.5) * 0.25);
    flowP = mix(colP, tgt, ea);
    flowSt = vec3f(0.0, -0.5, 0.0);
    b = 0.45 * apr * min(1.0, ph * 10.0) * pow(1.0 - ph, 1.3) * (1.0 - saturate(dis * 2.0));
    let fadeK: f32 = select(1.0 - kk, (1.0 + 1.2 * ea) * (1.0 - saturate((kk - 0.85) / 0.15)), suck > 0.5);
    b = select(b, 0.45 * apr * min(1.0, ph * 10.0) * pow(1.0 - ph, mix(1.3, 0.0, suck * kk)) * fadeK, ab > 0.0);
    useFlow = 1.0;
  } else if (md > 7.5 && md < 8.5 && kind == 0u && hsel.x < 0.05 && apr > 0.0) {
    // 8 螺旋光柱: two strands of grains winding up round the next ring's axis, narrowing as they rise, fading at 24 m
    let ph: f32 = fract(T / 4.0 + hsel.y * 11.0); let st2: f32 = select(0.0, 3.1415927, hsel.z > 0.5);
    let a0: f32 = ph * 12.566 + T * 1.1 + st2; let rj: f32 = RN * 0.55 * (1.0 - 0.45 * ph) + (fract(hsel.y * 53.0) - 0.5) * 0.25;
    flowP = N + vec3f(cos(a0) * rj, RN * 0.5 + ph * 24.0, sin(a0) * rj);
    flowSt = -normalize(vec3f(-sin(a0) * rj * 12.566, 24.0, cos(a0) * rj * 12.566)) * 0.45;          // (a short tail along the strand; bare dots were not seen)
    b = 0.75 * apr * sin(3.1415927 * ph) * (1.0 - saturate(dis * 2.0));
    wsz = wsz * 1.6; minPx = 2.2;
    useFlow = 1.0;
  } else if (dis > 0.0) {
    let hd: vec3f = hashu3(i * 23u + rid * 101u + 9u);
    // a splash: a quick burst out of the tube (half its way in the first half second), then a slow drift and a slow fade. The grains are
    // thrown every way off the tube, outward and up a little, and carried on along the line the skier rides (toward -z)
    let d: f32 = saturate(dis * (1.0 + 0.5 * hd.x) - 0.06 * hd.y); let e: f32 = 1.0 - pow(1.0 - d, 4.0);
    let th2: f32 = hd.y * 6.2831853; let sp: f32 = (0.5 + 1.3 * hd.z) * sz;
    rr = rr + e * (sp * cos(th2) + R0 * 0.25 * hd.x);
    dz = dz + e * (sp * sin(th2) - (0.6 + 2.6 * hd.z));
    dy = dy + e * (0.3 + 0.9 * hd.x);
    ang = ang + e * (hd.z - 0.5) * 0.25;
    b = b * (1.0 + 2.2 * exp(-d * 10.0)) * pow(1.0 - d, 1.3) * hitK;
  }
  let ro: f32 = rr * open;
  g.p = C + ringRot(vec3f(cos(ang) * ro, sin(ang) * ro + dy, dz));
  if (useFlow > 0.5) { g.p = flowP; }
  g.b = b * select(A, 1.0, useFlow > 0.5 && md > 6.5 && md < 7.5); g.wsz = wsz; g.minPx = minPx; g.up = up; g.col = col; g.st = flowSt;
  return g;
}
`;
const DUST_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec2f(0.0); v.col = vec4f(0.0); v.sh = vec4f(0.0);
  let g: DG = dustGrain(a.iid);
  if (g.b < 0.003) { return v; }
  let q: RQ = ringQuad(corner, g.p, g.p + vec3f(0.0, g.up, 0.0) + g.st, g.wsz, g.minPx);
  let fog: f32 = 1.0 - fogAmount(g.p);
  let bright: f32 = g.b * M.b.w * mix(1.0, 1.2, M.d.x) * (1.0 + 0.7 * M.d.y) * fog;
  v.clip = q.clip; v.uv = q.uv; v.sh = vec4f(q.hl, 0.0, 0.0, 0.0);
  v.col = vec4f(g.col * (bright * sqrt(q.k) * 11.0 * ringE()), mix(0.18, 0.0, M.d.x) * saturate(bright) * sqrt(q.k));
  return v; }
`;
// the grains' own shadow (用户 05:23 UTC: 影子也要由点投下、跟着点一起动): each grain that is lit enough is a small disc in the sun's shadow
// map, a little larger than the grain (one texel is 6 cm), so the shadow on the snow is a dappled band that moves and flickers with them
const DUST_SH_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  v.uv = corner; v.clip = vec4f(0.0, 0.0, -2.0, 1.0);
  let g: DG = dustGrain(a.iid);
  if (g.b < 0.12) { return v; }
  let sp: vec4f = U.shadowVP * vec4f(g.p, 1.0);
  let r: f32 = (0.035 + 0.05 * saturate(g.b)) * M.c.w / U.misc.w;
  v.clip = vec4f(sp.xy + corner * r, sp.z, 1.0);
  return v; }
`;
const DUST_SH_FS = `fn frag(v: VOut) -> FOut { var o: FOut; if (dot(v.uv, v.uv) > 1.0) { discard; } o.color = vec4f(0.0); return o; }`;

// a flame: [0] the wide glow of the air round it, [1] its white-hot heart, [2..] tongues rising off it and turning violet
const FLAME_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  v.clip = vec4f(0.0, 0.0, -2.0, 1.0); v.uv = vec2f(0.0); v.col = vec4f(0.0); v.sh = vec4f(0.0);
  let C: vec3f = M.a.xyz; let sc: f32 = M.a.w; let fa: f32 = M.b.x; let sz: f32 = M.b.y; let ti: f32 = M.b.z;
  let T: f32 = M.c.x; let rid: u32 = u32(M.c.y); let n: f32 = M.c.z;
  var tint: vec3f = vec3f(0.061, 1.0, 0.753);
  if (ti > 1.5) { tint = mix(ringGrn(n), ringVio(n), 0.5); } else if (ti > 0.5) { tint = ringGrn(n); }
  let i: u32 = a.iid;
  var p0: vec3f = C; var wsz: f32 = 0.1; var minPx: f32 = 1.0; var col: vec3f = tint; var b: f32 = 0.0; var shape: f32 = 0.0; var al: f32 = 0.0;
  if (i == 0u) {
    wsz = 3.2 * sz * min(sc, 1.6); minPx = 26.0 * U.res.y / 1170.0; b = 0.9 * mix(1.0, 0.8, n); shape = 1.0;
  } else if (i == 1u) {
    wsz = 0.38 * sz * sc; minPx = 4.0; col = vec3f(0.9, 1.0, 0.97); b = 6.0; shape = 2.0;
  } else {
    let fr: f32 = 1.7 + 0.8 * hashu(i * 3u + rid * 77u);
    let ph: f32 = T * fr + hashu(i * 5u + rid * 77u); let u: f32 = fract(ph); let gen: u32 = u32(floor(ph));
    let h: vec3f = hashu3(i * 11u + gen * 7717u + rid * 131u);
    let an: f32 = h.x * 6.2831853; let rr: f32 = 0.5 * sz * sc * sqrt(h.y);
    let hgt: f32 = 1.8 * sz * sc * (0.6 + 0.8 * hashu(i * 7u + rid * 3u));
    p0 = C + vec3f(rr * cos(an), u * hgt - 0.25 * sz * sc, rr * sin(an));
    wsz = 0.26 * sz * sc * pow(1.0 - u, 0.7) * (0.7 + 0.6 * h.z); minPx = 2.0;
    if (u < 0.3) { col = mix(vec3f(0.85, 1.0, 0.97), tint, u / 0.3); } else { col = mix(tint, ringVio(n), (u - 0.3) / 0.7); }
    b = 2.4 * pow(1.0 - u, 0.8) * (0.7 + 0.3 * sin(T * 23.0 + f32(i)));
    al = mix(0.2, 0.0, n);
  }
  let q: RQ = ringQuad(corner, p0, p0, wsz, minPx);
  let fog: f32 = 1.0 - fogAmount(p0);
  var k: f32 = sqrt(q.k); if (i == 0u) { k = 1.0; }          // (the glow keeps a share of its light when it is drawn larger than it is: it is the place's glow, not a point)
  v.clip = q.clip; v.uv = q.uv; v.sh = vec4f(0.0, shape, 0.0, 0.0);
  v.col = vec4f(col * (b * fa * fog * k * ringE()), al * saturate(b * fa) * k);
  return v; }
`;
const SPARK_FS = `
fn frag(v: VOut) -> FOut { var o: FOut;
  let d: f32 = length(vec2f(v.uv.x, max(abs(v.uv.y) - v.sh.x, 0.0)));
  if (d >= 1.0) { discard; }
  var pr: f32 = 0.8 * exp(-d * d * 9.0) + 0.2 * sq(1.0 - d);
  if (v.sh.y > 1.5) { pr = exp(-d * d * 6.0); } else if (v.sh.y > 0.5) { pr = exp(-d * 4.5) * sq(1.0 - d); }
  o.color = v.col * pr;
  return o; }
`;
// the light of a ring (a circle of light, M.a.w its radius) or of a flame (a point, M.a.w = 0) on the surfaces round it, read back from the
// scene's depth. M.b = colour, strength; M.c.x = how far it reaches
const LIGHT_VS = `
fn vert(a: VIn) -> VOut { var v: VOut;
  let corner: vec2f = vec2f(f32(a.vid & 1u), f32((a.vid >> 1u) & 1u)) * 2.0 - 1.0;
  v.uv = corner;
  let C: vec3f = M.a.xyz; let RL: f32 = M.c.x;
  let dist: f32 = length(C - U.camPos.xyz);
  let cp: vec4f = U.viewProj * vec4f(C, 1.0);
  if (dist < RL * 1.3) { v.clip = vec4f(corner, 0.5, 1.0); return v; }
  if (cp.w < 0.1) { v.clip = vec4f(0.0, 0.0, -2.0, 1.0); return v; }
  let r: f32 = RL * 1.3 / (cp.w * U.camRight.w);
  v.clip = vec4f(cp.x + corner.x * r / U.camUp.w * cp.w, cp.y + corner.y * r * cp.w, 0.5 * cp.w, cp.w);
  return v; }
`;
const LIGHT_FS = `
fn frag(v: VOut) -> FOut { var o: FOut;
  let zf: f32 = linDepth(texFetchD(tDepth, vec2i(v.clip.xy), 0));
  if (zf > 8000.0) { discard; }
  let ndc: vec2f = vec2f(v.clip.x * U.res.z * 2.0 - 1.0, 1.0 - v.clip.y * U.res.w * 2.0);
  let wp: vec3f = U.camPos.xyz + screenRay(ndc) * zf;
  let q: vec3f = wp - M.a.xyz;
  var d2: f32 = dot(q, q);
  if (M.a.w > 0.0) { d2 = sq(length(q.xy) - M.a.w) + q.z * q.z; }
  let fall: f32 = smoothstep(M.c.x, M.c.x * 0.5, length(q));
  let E: f32 = M.b.w / (d2 + 0.35) * fall;
  o.color = vec4f(M.b.rgb * (E * ringE() * (1.0 - fogAmount(wp))), 1.0);
  return o; }
`;
