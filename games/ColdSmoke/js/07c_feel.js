"use strict";
// ---------------------------------------------------------------- feel: what the skiing does to the lens and to the air
// Nothing is drawn here. Once a frame (from tick, before the frame's globals are worked out) this sets what the lens in 09_post.js and
// the renderer's weather hooks read: how fast (a longer shutter, colour fringes and darker edges toward the sides of the frame, a tremor
// in the camera), snow thrown onto the glass by a landing, a bough or a fall, the air of each kind of run, the look of slow motion, and the
// tremble of the picture while the skis rub on the snow. It also says when a tree has gone by close (the `near` event), and how the
// lens flinches from it; and what wind the skier meets, which the sound of the air is made from and the lens is pushed about by.
// All of it is eased and runs on the game's time, so in slow motion it slows with the world; only the glass dries in real seconds.
const Feel = (() => {
  const F = { speed: 0, slow: 0, timeK: 1, air: [1, 1, 1], base: [1, 1, 0.00016], wrote: [], goal: 0, pend: null, since: 99, runT: 0, px: 0, pz: 0, init: false };
  // the speeds (m/s) between which the lens goes from calm to flat out, the tremor of the camera at full speed (m), how long a wet glass takes to dry (s)
  F.v0 = 22; F.v1 = 40; F.shake = 0; F.dry = 1.5;       // (shake: off. A constant fine tremor of the lens at speed reads as a stutter and makes people queasy; the one-off jolts stay)
  // the shutter (s) and the longest streak it may leave (picture heights), calm and flat out
  F.shut = [1 / 90, 1 / 50]; F.blur = [0.045, 0.11];
  // the corners drawn out toward where the lens is heading: the speeds (m/s) between which it grows (about 70 to 125 km/h). How much is the
  // owner's call (Variants, the 场景 panel): none (as delivered), light (the corners only), or clear (as the Riders Republic reference: longer,
  // and reaching further in from the sides). Each version: [streak at the very corner at the top of that (picture heights), where it begins
  // (0 the middle of the frame, 1 the middle of a side, 1.41 a corner)]. A change is eased in over a few tenths of a second
  F.rad = [19, 35]; F.radV = { a: [0, 0.6], b: [0.045, 0.6], c: [0.085, 0.45] }; F.radK = 0; F.radC = [0.5, 0.5];
  if (typeof Variants !== 'undefined') Variants.def('edge', '四角模糊', [['a', '无'], ['b', '轻'], ['c', '明显']], 'b');
  F.radL = (F.radV[typeof Variants !== 'undefined' && Variants.val.edge] || F.radV.b).slice();
  // the air of each kind of run, in multiples of the plain day's: [snow the wind carries along the ground, glitter hanging in the air, haze].
  // The ridge stands in the wind; among the trees and in deep powder the air is full of crystals; the gully holds the cold and its mist
  // (the haze is a far one: what shows is the slopes beyond going pale)
  F.AIR = { ridge: [5, 1, 1], glade: [1, 2.5, 1], powder: [1, 2.5, 1], gully: [1, 1, 4] };
  const PLAIN = [1, 1, 1], HOOK = ['drift', 'dust', 'fogDensity'], DAY = [1, 1, 0.00016];
  // snow chatter: while the skis rub on the snow the picture trembles, just enough to feel it. `chatter` 0..1 is how hard they rub (set
  // every frame below). chatPx: the furthest the picture is ever knocked, either way, in pixels of a picture 1280 wide (a wider one is
  // knocked as many more pixels, the same share of the frame; a narrower one the same pixels, because a knock cannot be less than one
  // and fewer of them would not be felt); 0 switches the tremble off. chatRot: a turn about the middle of the frame to go with it, as
  // what it moves the far edge by, in parts of chatPx. It is off: at this size a turn moves every part of the picture by less than a
  // pixel, so it can only be drawn by reading the scene between its pixels, and that costs more sharpness than the turn can be seen
  // (0.25 takes 3 to 13% of the fine detail off the frame, on and off, for a movement of at most a third of a pixel at the edges)
  F.chatter = 0; F.chatPx = 1.4; F.chatRot = 0;
  // (whether the picture trembles at all is the owner's pick: a off (the default: the whole frame hopping a pixel ten to twenty times a second read
  // as frames being dropped, and with the skier's body it made the run look shaky; the rub of the snow is heard, and seen in the spray), b on)
  if (typeof Variants !== 'undefined') Variants.def('chatter', '雪面颤动', [['a', '关'], ['b', '开']], 'a');
  // every snow has its grain: [how fast the picture rings (Hz), how soon a knock has died (damping, 0..1), knocks a second, how far]. Packed
  // and icy snow (the open bowl, the steeps, the ridge) is a fine fast grain; deep powder softer and slower; where the bumps of a mogul
  // field stand, and over rollers, there are fewer knocks and harder ones
  F.GRAIN = { packed: [15, 0.3, 50, 1], powder: [9, 0.5, 30, 0.75], rough: [12, 0.3, 9, 1.15] };
  const CH = F.chat = { lv: 0, con: 0, rough: 0, acc: 0, n: 0, q: [0, 0, 0, 0, 0, 0] }, clip = v => v / Math.sqrt(Math.sqrt(1 + v * v * v * v));

  // a tree gone by close. When the skier passes a tree at speed, near enough to feel it yet without touching, the moment is said to the
  // rest of the game as an event, `near`: x, z, h, r the tree, as the physics names the one it touches; side -1 it goes by on the left,
  // 1 on the right; ux, uz the way from its trunk to the skier's line; vx, vz the skier's speed; lead how many seconds before the skier is
  // level this is said; d how far off the trunk will be at its closest (m); k 0..1, how close a shave and how fast. The trees answer it
  // (14_trees.js: a breath of snow off the boughs on that side, one of them letting go), and the lens flinches: `roll` (radians, to be
  // ADDED to the roll the camera is set with: it tips away from the tree and is level again within 0.4 s) and `dip` (m, to be taken OFF
  // the camera's height: it ducks). Neither is drawn here (turning a finished picture softens it): they are for the camera to read.
  // nearGap: how far beyond the reach of its boughs a tree still counts (m; the reach is a fifth of its height, and nearer than that is a
  // touch: the physics' business, with effects of its own); nearV: from what speed (m/s); nearEvery: at most one in so many seconds;
  // nearLead: how long before the skier is level it is said (s: what the tree lets go takes a moment to show, and the lens, four metres
  // behind, is past the tree a quarter of a second after the skier); flinch: how far the lens tips (rad) and ducks (m) at the closest
  // shave, and how soon it is furthest over (s: the same as the lead, so that is as the skier is level)
  F.roll = 0; F.dip = 0; F.nearGap = 1.2; F.nearV = 12.5; F.nearEvery = 1.5; F.nearLead = 0.1; F.flinch = [0.007, 0.02, 0.1];
  const NM = F.nm = { tn: {}, x: NaN, z: NaN, d: 0, com: false, t: 9, q: [0, 0, 0, 0, 0, 0] };
  // Called once a step, after the step's events have been dealt with: so what it says is heard by everything in the next step, the trees
  // too (they are stepped before this module). It watches the trunk nearest the point the skier will have reached in nearLead seconds,
  // while that point comes nearer to it; the step the point begins to recede, it has just been at its closest. So of trees standing
  // together only the nearest speaks, and what it says is true to a few centimetres: how near the line passes, and that nothing is
  // touched. (The sound's scan of the rows ahead hears a trunk up to half a second before it is reached: in a turn the line moves
  // metres in that time, so it can know neither.)
  F.pass = function (dt) {
    const S = Game.s, L = F.nearLead, qx = S.p[0] + S.v[0] * L, qz = S.p[2] + S.v[2] * L, tn = Course.nearTree(qx, qz, NM.tn), same = tn.ok && tn.x === NM.x && tn.z === NM.z;
    NM.t += dt;
    if (same && NM.com && tn.d > NM.d) {
      // (not the saplings that mark a jump; clear of the boughs by a hand's breadth at least, since what is said ahead can be a few
      // centimetres out; on the snow or just off it, where the physics too lets a tree be touched; and nothing being touched just now)
      const gap = NM.d - 0.20 * tn.h, v = Math.hypot(S.v[0], S.v[2]);
      if (Game.mode === 'run' && !tn.soft && gap > 0.1 && gap < F.nearGap && v > F.nearV && S.e < 2.5 && !(S.brush > 0) && !(S.crash > 0) && NM.t > F.nearEvery) {
        NM.t = 0;
        Game.events.push({ type: 'near', x: tn.x, z: tn.z, h: tn.h, r: tn.r, side: sign((tn.z - qz) * S.v[0] - (tn.x - qx) * S.v[2]) || 1, ux: (qx - tn.x) / tn.d, uz: (qz - tn.z) / tn.d, vx: S.v[0], vz: S.v[2], lead: L, d: NM.d, k: (1 - gap / F.nearGap) * smooth(F.nearV, 1.6 * F.nearV, v) });
      }
    }
    NM.com = same && tn.d < NM.d; NM.x = tn.ok ? tn.x : NaN; NM.z = tn.z; NM.d = tn.d;
  };

  // the wind the skier meets, worked out once a step for the ear and the eye alike: the sound of the air is made from it (18_sound.js)
  // and the lens is pushed by it (at the end of update), so a gust is heard and seen as one thing. `wind.v` (m/s): the speed through the
  // air, with the gust of the moment added to it or taken off; `wind.g`: that gust, -1..1, the same fronts that cross the hill and lean
  // the flags (14b_gates.js) met at the skier's place, so the faster the run, the faster they come; `wind.k`: how hard the air presses,
  // the square of v (1 at 120 km/h, rising more slowly beyond), more on the ridge, where the air is torn, less among the trees, where
  // it stands, and less on a body folded into a tuck; `wind.b`: the blow of this moment, the eddies': two to five swells a second (more
  // of them the faster the air goes by), as often one way as the other, 1 in the mean and never over 2.7.
  // gust: the m/s a gust adds or takes on an open slope (at 60 km/h: it is the unevenness of the air run through, so there is more of
  // it the faster the run), how much more on the ridge, how much less among the trees.
  // buf: how far that blow turns the lens at 120 km/h, in the mean: across and down in picture heights (every lens, wide or long, is
  // moved the same pixels: about one, of a picture 592 high), and the tilt that goes with it (radians). The lens is turned, never
  // moved: nothing close to it can jump, and it cannot be pushed into the snow. `buffet` is what it is turned by now.
  // How much of it there is, is the owner's to pick (the registry of versions, 00b_variants.js; the pick is eased in over half a
  // second): a, none, the lens as it was (the cameras' own fine tremor, with the one this module has added to it from 80 km/h up,
  // F.shake); b, as said here; c, bufC times that. With b and c the tremor of F.shake is not added: it is the wind's push instead.
  F.wind = { v: 0, g: 0, b: 0, k: 0, ph: 0, amp: 0, on: 0, pc: {} }; F.gust = [3, 5, 2.5]; F.buf = [0.0019, 0.0015, 0.0009]; F.bufC = 1.9; F.buffet = [0, 0, 0];
  const WD = F.wind, WIND0 = [1.2, 0, 0.4], eddy = (o, sd) => 1.75 * (vnoise1(WD.ph + o, sd) + 0.5 * vnoise1(2.13 * WD.ph + o, sd + 1));
  if (typeof Variants !== 'undefined') Variants.def('buffet', '风压抖动', [['a', '原样'], ['b', '轻'], ['c', '明显']], 'b');

  // what the snow does on the glass is the owner's call (Variants 'lens'): a, it melts within a third of a second into clear beads that
  // dry in F.dry seconds (as delivered; it read as rain); b, it stays snow, white and dry as it is below freezing, and the air going by
  // tears it off and pushes it out over the edges of the frame, in one to three seconds at speed and slowly standing still; it hardly
  // melts at all; c, the same, but what is left melts in a couple of seconds into a few small beads. Each version: [look (Post.wetLook),
  // seconds for the snow to melt, seconds for all of it to go standing still, and at 25 m/s of air]
  F.lensV = { a: [0, 0.3, 1.5, 1.5], b: [1, 14, 9, 2.6], c: [1, 1.8, 7, 2.4] };
  if (typeof Variants !== 'undefined') Variants.def('lens', '镜头上的雪', [['a', '水珠'], ['b', '白雪被吹走'], ['c', '先白后化']], 'b');
  const lensPick = () => F.lensV[typeof Variants !== 'undefined' && Variants.val.lens] || F.lensV.b;

  // snow reaches the glass: how much (0..1: it is also how long it stays, 1 = F.dry seconds), from which side of the frame (-1 left .. 1 right)
  // and how much of it from below (0..1). On dry glass it lands as a new scatter of beads; on wet glass the ones there swell again.
  // (Snow that stays snow is a new scatter once what is there has nearly gone, its last crumbs already off the glass: the scatter starts again
  // where it lands, so a scatter that had been pushed out does not jump back to the middle while any of it still shows)
  F.splash = function (a, x, y) {
    if (!(F.goal > (Post.wetLook ? 0.03 : 0.02))) { Post.wetSeed = (Post.wetSeed + 1) % 61; Post.wetAge = 0; Post.wetBlow = 0; Post.wetBias[0] = x || 0; Post.wetBias[1] = y || 0; }
    F.goal = Math.max(F.goal, sat(a)); Post.wetNew = 1;
  };

  F.update = function (dt) {
    // ts: how much slower than life a jump's slow motion runs; tk: that, and the world being taken up again after a pause (App.resumeK, the
    // interface's, where there is one); rdt: real seconds
    const S = Game.s, st = App.state, run = Game.mode === 'run' || Game.mode === 'replay', ts = clamp(Game.timeScale || 1, 0.05, 1), tk = ts * clamp(App.resumeK || 1, 0.05, 1), rdt = dt / tk;
    // a new run, or the skier set down somewhere else: that is a cut, and after a cut things simply are what the place makes them
    const cut = !F.init || Game.runT < F.runT || Math.hypot(S.p[0] - F.px, S.p[2] - F.pz) > 15; F.init = true; F.runT = Game.runT; F.px = S.p[0]; F.pz = S.p[2];

    // ---- speed. From about 80 km/h to 145 the edges of the frame begin to tear (Post reads `speed`) and the camera trembles a little in
    // the wind: added through Game.shake, which the chase camera already reads (a blow that set it higher keeps its own).
    // (The speed through the air, not S.speed along the snow, which dips for a few steps wherever the snow under the skis tips over a lip.)
    const kv = run ? smooth(F.v0, F.v1, Math.hypot(S.v[0], S.v[1], S.v[2]) * ts) : 0;      // (the speed as it looks: in slow motion the world goes by slowly, and the edges, the tremble and the wind's push go with it)
    F.speed = cut ? kv : damp(F.speed, kv, kv > F.speed ? 2.5 : 5, dt); Post.speed = F.speed;
    if (run) Game.shake = Math.max(Game.shake, F.shake * F.speed * (1 - WD.on));       // (not where the wind itself pushes the lens: see F.wind)

    // ---- slow motion: its look follows the time scale itself, so it comes and goes exactly as time does. (Eased once more over a few
    // real frames, in case time is ever let go in one step.)
    F.slow = cut ? smooth(1, 0.4, ts) : damp(F.slow, smooth(1, 0.4, ts), 14, rdt); F.timeK = cut ? tk : damp(F.timeK, tk, 14, rdt);
    Post.slow = F.slow;

    // ---- the shutter. At speed it stays open longer and the streaks may run further: the edges tear, what rides with the lens stays sharp.
    // In slow motion the camera is a high-speed one, its shutter as much shorter as time is slower (the frame's dt is the world's time, so
    // without this every streak would keep its full-speed length while the motion itself shrank: a smear), and what hangs in the air hangs
    // sharp. (The thrown snow's own streaks read Post.shutter too, so they keep step with the ground's.)
    Post.shutter = lerp(F.shut[0], F.shut[1], F.speed) * F.timeK; Post.blurMax = lerp(F.blur[0], F.blur[1], F.speed);
    // (a lens orbiting beside or ahead of the skier sweeps the snow under it far faster than the chase: half the shutter and half the longest streak there, eased over a switch)
    F.viewShut = damp(F.viewShut || 1, { front: 1, left: 1, right: 1, low: 1 }[Game.view] ? 0.5 : 1, 6, rdt); Post.shutter *= F.viewShut; Post.blurMax *= F.viewShut;
    // ...and fast, the corners and sides of the frame are drawn out along lines to the point the lens is heading for, the far ridges as much as
    // the snow beside it, while the middle (the skier, the line ahead) stays sharp: Post.radial, the least streak at the very corner, and
    // Post.radC, that point (09_post.js). Only for a lens that travels along its view, forward or back (the chase, first person, in front;
    // not one looking across the line, nor the long lens far off), kept near the middle and eased, and as much shorter as time is slower.
    {
      const c = Render.cam, v = S.v, vl = Math.hypot(v[0], v[1], v[2]), kr = run ? smooth(F.rad[0], F.rad[1], vl) : 0;
      F.radK = cut ? kr : damp(F.radK, kr, kr > F.radK ? 2.5 : 5, dt);
      let x = 0.5, y = 0.5, al = 0;
      if (vl > 1) {
        const z = (v[0] * c.fwd[0] + v[1] * c.fwd[1] + v[2] * c.fwd[2]) / vl, T = Math.tan(c.fovY / 2), A = Render.W / Math.max(Render.H, 1); al = Math.abs(z);
        if (al > 0.05) { x = 0.5 + 0.5 * (v[0] * c.right[0] + v[1] * c.right[1] + v[2] * c.right[2]) / vl / (z * T * A); y = 0.5 - 0.5 * (v[0] * c.up[0] + v[1] * c.up[1] + v[2] * c.up[2]) / vl / (z * T); }
      }
      x = clamp(x, 0.32, 0.68); y = clamp(y, 0.34, 0.66);
      F.radC[0] = cut ? x : damp(F.radC[0], x, 6, dt); F.radC[1] = cut ? y : damp(F.radC[1], y, 6, dt);
      const L = F.radV[typeof Variants !== 'undefined' && Variants.val.edge] || F.radV.b; F.radL[0] = damp(F.radL[0], L[0], 8, rdt); F.radL[1] = damp(F.radL[1], L[1], 8, rdt);
      // (the ski-tips view tears its edges harder, as the Steep reference: Game.viewEdge 1..1.6, eased by 07b_views.js: longer, and from further in)
      const ve = Math.max(1, (typeof Game !== 'undefined' && Game.viewEdge) || 1);
      Post.radial = F.radL[0] * ve * F.radK * F.timeK * smooth(0.5, 0.85, al) * smooth(0.35, 0.8, c.fovY); Post.radIn = F.radL[1] - 0.25 * (ve - 1); Post.radC[0] = F.radC[0]; Post.radC[1] = F.radC[1];
    }

    // ---- each kind of run has its own air. It changes over a few seconds as the next run comes up (looked for a second ahead, so it is
    // there when the skier is). The wind itself is never touched: the falling snow is placed by wind x time and would jump.
    // (The three hooks are shared: if another hand has written one since my last frame, a switch for heavier snow say, that value is the
    // plain day mine multiplies; cleared again, it is the renderer's own default.)
    const a = F.AIR[Course.segAt(-S.p[2] + S.speed).type] || PLAIN;
    for (let i = 0; i < 3; i++) {
      const k = HOOK[i], v = st[k]; if (v == null) F.base[i] = DAY[i]; else if (v !== F.wrote[i]) F.base[i] = v;
      F.air[i] = cut ? a[i] : damp(F.air[i], a[i], 0.7, dt);
      st[k] = F.wrote[i] = F.base[i] * F.air[i];
    }

    // ---- snow on the glass: a landing harder than 5 m/s throws it up from below (all of it from 14 m/s), a bough or a trunk sheds it from its own side. Read from
    // the frame's events (before tick clears them). The lens rides a few metres behind the skier and meets that snow a moment later; a lens
    // that stands well off (the long one, 25 m away) stays dry
    if (cut) { F.goal = 0; F.pend = null; F.since = 99; Post.wet = 0; Post.wetNew = 0; }
    for (const e of Game.events) {
      let w = 0, x = 0, y = 0;
      if (e.type === 'land' && e.v > 5) { w = lerp(0.5, 1, sat((e.v - 5) / 9)); y = 1; }
      else if (e.type === 'brush' || e.type === 'crash') { const r = Render.cam.right; x = sign((e.x - S.p[0]) * r[0] + (e.z - S.p[2]) * r[2]); w = e.type === 'crash' ? 1 : 0.55; y = 0.25; }
      const c = Render.cam.pos; w *= smooth(16, 9, Math.hypot(c[0] - S.p[0], c[1] - S.p[1], c[2] - S.p[2]));
      if (w > 0 && (!F.pend || w >= F.pend.w)) F.pend = { t: clamp(Math.hypot(c[0] - S.p[0], c[2] - S.p[2]) / Math.max(S.speed, 3), 0.03, 0.3), w, x, y };
    }
    // (where one landing follows another, a field of rollers, the glass is not wet all the way down: what comes within a few seconds of
    // the last lot is less than half of it, unless it is a hard one)
    F.since += rdt;
    if (F.pend && (F.pend.t -= dt) <= 0) { const w = F.pend.w; F.splash(w * lerp(lerp(0.45, 1, smooth(1.5, 7, F.since)), 1, smooth(0.75, 1, w)), F.pend.x, F.pend.y); F.since = 0; F.pend = null; }
    // (it comes onto the glass over a few frames, not in one, and dries in real time: a held-back second does not keep the lens wet)
    // The air over the glass is the skier's speed and the wind together (WD.v, worked out below, last frame's: a frame late does not show).
    // Snow that stays snow goes as fast as that air tears it off; the water of version a dries in F.dry seconds whatever the speed
    const LV = lensPick(); Post.wetLook = LV[0];
    const air = smooth(2, 25, WD.v || 0), dry = LV[0] ? lerp(LV[2], LV[3], air) : F.dry;
    // (all on the game's clock: in slow motion the snow on the glass is torn off and melts as slowly as everything else moves; the owner
    // wants the whole world slowed in the air, nothing left running at full speed)
    F.goal = Math.max(0, F.goal - dt / dry);
    Post.wet = Post.wet < F.goal ? Math.min(F.goal, Post.wet + dt / 0.07) : F.goal;
    if (Post.wet > 0) Post.wetAge += dt; Post.wetNew = Math.max(0, Post.wetNew - dt / LV[1]);       // (version a: it lands as snow, white, and has melted in a third of a second)
    // how far the snow has been pushed out from the point the lens is heading for (the corners' blur aims at the same point). Standing it
    // creeps; at speed the crumbs a third of the way out are over the edge in about a second
    if (Post.wet > 0) Post.wetBlow += dt * (0.05 + 1.25 * air * air); else Post.wetBlow = 0;
    Post.wetC[0] = lerp(0.5, Post.radC[0], 0.6); Post.wetC[1] = lerp(0.5, Post.radC[1], 0.6);

    // ---- snow chatter. How hard the skis rub is read from the physics: what a skid brakes with (its force S.aSkid, the part of it that
    // lies along the way the skier is going) and what the edges hold in a carve (S.aCarve). Both carry the load on the legs; both grow
    // with speed. Skis running flat give a breath of it, more over bumps; off the snow or standing there is none. These are the things the
    // snow's sound is made of (lean, the angle of the skid, load, speed: 18_sound.js), so the eye and the ear agree. It comes up in 40 ms,
    // dies away in 150, and leaves with the snow in a few frames, as the sound does.
    {
      const g = 9.81, v3 = Math.hypot(S.v[0], S.v[1], S.v[2]), on = run && S.contact !== false && !S.air, pw = sat(((S.powder || 0) - 0.3) / 0.7);
      const rg = Course.segAt(-S.p[2]).type === 'rollers' ? 1 : Course.bumps ? Course.bumps(S.p[0], S.p[2]) : 0;
      const fS = (S.aSkid || 0) * Math.abs(Math.sin(S.beta || 0)) / g, fC = Math.abs(S.aCarve || 0) / g, fN = Math.min((S.load || 0) / g, 1.5);
      const drive = on ? sat(smooth(1, 15, v3) * (1.6 * fS + 0.45 * fC) + 0.06 * smooth(5, 30, v3) * fN * (1 - 0.7 * pw) * (1 + 1.5 * CH.rough)) : 0;
      if (cut) { CH.lv = CH.con = CH.acc = CH.n = 0; CH.q.fill(0); }
      CH.rough = cut ? rg : damp(CH.rough, rg, 3, dt);
      CH.lv = damp(CH.lv, drive, drive > CH.lv ? 25 : 6.7, dt); CH.con = damp(CH.con, on ? 1 : 0, on ? 40 : 28, dt);
      F.chatter = CH.lv * CH.con > 1e-3 ? CH.lv * CH.con : 0;
      // the tremble itself. The picture is a small sprung mass that the snow knocks at random moments, and what is drawn is how fast it
      // is moving: so it never drifts (every knock swings back), and it is no steady hum. It runs on a clock of its own, 240 steps to a
      // second of the game's time: the same tremble at any frame rate, slowed with the world, and still the moment time stands still
      const G = F.GRAIN, k = i => lerp(lerp(G.packed[i], G.powder[i], pw), G.rough[i], CH.rough), q = CH.q;
      const Hc = 1 / 240, zt = k(1), w = TAU * k(0) * Hc, r = 1 / Math.sqrt(1 - zt * zt), E = Math.exp(-zt * w), c = E * Math.cos(w / r), s = E * Math.sin(w / r), p = Math.min(1, k(2) * Hc), a = 0.873 * Math.sqrt(4 * zt * w / p);
      CH.acc += dt; let n = Math.min(12, Math.floor(CH.acc / Hc)); CH.acc -= n * Hc; if (CH.acc > Hc) CH.acc = 0;
      for (; n > 0; n--) for (let i = 0; i < 6; i += 2) {
        const x = q[i], y = q[i + 1], h = hash1(CH.n++); q[i] = (c + zt * r * s) * x + r * s * y; q[i + 1] = -r * s * x + (c - zt * r * s) * y;
        if (h < p) q[i + 1] += a * (h < 0.5 * p ? -1 : 1) * (0.5 + hash1(CH.n++));
      }
      // onto the picture (Post.chat: pixels across, pixels down, the turn in radians). It is moved by whole pixels only: a part of a
      // pixel can only be drawn by reading the scene between its pixels, and that softens it (a fifth of the fine detail gone, on and off
      // from frame to frame). So where less than a pixel is asked for, the picture is knocked a whole one, less often: the threshold
      // keeps the mean square what was asked, down to a tenth of a pixel or so, below which nothing moves at all
      const amp = (typeof Variants !== 'undefined' && Variants.val.chatter !== 'b' ? 0 : F.chatPx) * F.chatter * k(3), rms = amp * Math.max(Render.W, 1280) / 1280 / 2.8, T = 0.5 * Math.pow(sat(rms / 0.3), 0.6);
      for (let i = 0; i < 2; i++) { const d = rms * 2.8 * clip(q[2 * i + 1] / 2.8); Post.chat[i] = sign(d) * Math.floor(Math.abs(d) + 1 - T); }
      Post.chat[2] = F.chatRot * amp / 640 * clip(q[5] / 2.8);
    }

    // ---- the flinch. Every `near` gives the lens a push, and it rides it out the way a head does on its neck: over and back, once, with
    // no swinging after. The push goes through three soft links one after another, so the lens leaves rest gently (no jerk at the
    // start), is furthest over F.flinch[2] seconds later and has a twentieth of that left after not quite four times as long. What is
    // read is where it stands, so nothing ever jumps. On the game's time, the same at any frame rate.
    {
      const q = NM.q, x = 2 / F.flinch[2] * dt, E = Math.exp(-x);
      if (cut) q.fill(0);
      for (const e of Game.events) if (e.type === 'near') { const a = 0.5 * Math.E * Math.E * (0.6 + 0.4 * e.k); q[0] += a * e.side; q[3] += a; }
      for (let i = 0; i < 6; i += 3) { q[i + 2] = (q[i + 2] + x * q[i + 1] + 0.5 * x * x * q[i]) * E; q[i + 1] = (q[i + 1] + x * q[i]) * E; q[i] *= E; }
      F.roll = F.flinch[0] * q[2]; F.dip = F.flinch[1] * q[5];
    }

    // ---- the wind (see F.wind above). The gust is read where the flags read it: one front for the whole hill. Standing, there is
    // only the gust; in slow motion the eddies slow with the world (this runs on the game's time). Heavier weather (Weather.wind, 1 on
    // a day like today's) brings a wind of its own and more of the gusts.
    {
      const W = st.wind || WIND0, wl = Math.hypot(W[0], W[2]) || 1, c = Course.at(-S.p[2], WD.pc), rd = c.ridge || 0, gl = c.glade || 0;
      const ww = Math.max((typeof Weather !== 'undefined' && Weather.wind) || 1, 0.2), v = run ? Math.hypot(S.v[0], S.v[1], S.v[2]) : 0;
      WD.g = vnoise1(App.t * 0.31 - (S.p[0] * W[0] + S.p[2] * W[2]) / wl * 0.06, 7);
      WD.v = Math.abs(Math.hypot(v, 6 * Math.max(ww - 1, 0)) +Math.max(F.gust[0] * (0.6 + v / 40) + F.gust[1] * rd - F.gust[2] * gl, 0.3) * clamp(wl / 1.26, 0.5, 2.5) * ww * WD.g);
      const q = WD.v * WD.v / 1111; WD.k = 1.25 * q / (1 + 0.25 * q) * Math.min((1 + 0.6 * rd - 0.4 * gl) * (0.75 + 0.25 * ww), 2) * (1 - 0.35 * Math.max(S.tuck || 0, S.tuckIn || 0));
      WD.ph += dt * (5 + 0.09 * WD.v); WD.b = eddy(0, 21);
      // (the lens is pushed by the slow swell of the wind only, well under once a second: the eddies, two to five a second, are heard (WD.b), not
      // seen. Quick small turns of the whole picture read as a shaking camera, and make people queasy)
      WD.lp = (WD.lp || 0) + dt * (0.5 + 0.006 * WD.v); const swell = (o, sd) => 1.6 * vnoise1(WD.lp + o, sd);
      const pick = typeof Variants !== 'undefined' ? Variants.val.buffet : 'b', amp = pick === 'a' ? 0 : pick === 'c' ? F.bufC : 1;
      WD.amp = cut ? amp : damp(WD.amp, amp, 5, dt); WD.on = Math.min(WD.amp, 1);
      const B = F.buffet, a = WD.amp * WD.k; B[0] = F.buf[0] * a * swell(0, 21); B[1] = F.buf[1] * a * swell(31.7, 23); B[2] = F.buf[2] * a * swell(77.1, 25);
      // the lens is turned by it here: after whichever view has set the camera this step (the chase camera, first person, any other:
      // 07_game.js, 07b_views.js), before the frame is made from it; so it is the same push in every view, and it is the scene that is
      // drawn turned, not a finished picture that is moved (which would soften it). A step in which no view set the camera starts from
      // what the last one set, not from what was turned (cam.fwd still being the one written here says so): nothing can add up.
      const rc = Render.cam; if (rc.fwd !== WD.f) WD.c0 = [rc.fwd, rc.right, rc.up];
      const f0 = WD.c0[0], r0 = WD.c0[1], u0 = WD.c0[2], ka = 2 * Math.tan(rc.fovY / 2), ax = B[0] * ka, ay = B[1] * ka, cs = Math.cos(B[2]), sn = Math.sin(B[2]);
      const f = v3.norm([f0[0] + r0[0] * ax + u0[0] * ay, f0[1] + r0[1] * ax + u0[1] * ay, f0[2] + r0[2] * ax + u0[2] * ay]), r = v3.norm(v3.sub(r0, v3.mul(f, v3.dot(r0, f)))), u = v3.cross(r, f);
      rc.fwd = WD.f = f; rc.right = v3.add(v3.mul(r, cs), v3.mul(u, sn)); rc.up = v3.sub(v3.mul(u, cs), v3.mul(r, sn));
    }
  };
  return F;
})();
Game.feel = Feel;       // (the page keeps its modules to itself: this is how a test or a switch outside reaches it, e.g. __ski.m.Game.feel.splash(1, 0, 1))
