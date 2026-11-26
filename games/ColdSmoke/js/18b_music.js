"use strict";
// ---------------------------------------------------------------- music: a score that follows the skiing, played by oscillators
// Nothing is recorded and nothing is rendered ahead: every note is an envelope written a fifth of a second ahead on the audio clock, onto
// voices that run all the time at zero (no node is made after the build, so nothing is left for the garbage collector and nothing can click).
// It is built in layers that all hang on one clock, each brought in by what the skier is doing and always on a bar line:
//   bed      a slow chord of detuned saws under a low-pass that opens with speed; always there, four bars to a chord
//   pulse    plucked notes through the chord, echoed a dotted eighth later: one every beat and a half once the skis run, eighths at a
//            cruise, sixteenths when it is fast
//   bass     long notes when it gets quick or steep, then a pulsing eighth with a soft 3+3+2 kick under it
//   shimmer  high glass notes climbing for as long as the edges throw snow, on the side the snow goes
//   lead     now and then two or three long notes over the top, never the same phrase twice running
// The pitch set never changes (the seven notes of A major), so layers and chord sets can change at any moment without a clash; what the
// light changes is which note is home: D by day (Lydian: bright, unresolved, cold clear air), A in the hour of gold, F sharp minor as the
// sun goes, B at night (Dorian: dark with one bright note in it, for the nebula). 90 beats a minute: a bar lasts about as long as one
// carved turn, a chord about four, and the sixteen bars of a round (43 s) never line up with the half minute of a section.
// Leaving the ground on a real jump the dry sound closes and falls away, the reverb's tail and two high held notes hang in the air, and the
// landing is made the downbeat of the next chord. When time runs slow (Game.timeScale) tempo, pitch and brightness sag with it.
const Music = (() => {
  const MU = { bpm: 90, level: 0.28, sag: 0.13, look: 0.2 };        // look: how far ahead notes are written (s): a frame that hangs for less than this does not make the beat stumble
  // how loud the score sits against the wind and the snow: a, as delivered (measured: 5 to 9 dB under them between 500 Hz and 2 kHz, where the
  // plucked line lives, and the faster the more); b, 4 dB up. And the title page: a, silent until the first push (as delivered); b, the bed
  // and the slowest layer 6 dB down while the title is up, carried on without a break into the run
  const LevelV = { a: 1, b: 1.585 };
  if (typeof Variants !== 'undefined') { Variants.def('mlevel', '音乐音量', [['a', '原来'], ['b', '大一点']], 'b'); Variants.def('tmusic', '标题页音乐', [['a', '没有'], ['b', '有']], 'a'); }
  const vOf = n => typeof Variants !== 'undefined' ? Variants.val[n] : null;
  MU.titleOn = () => vOf('tmusic') === 'b';
  const MIX = { pad: 1.15, arp: 1.1, bass: 0.7, shim: 1.3, lead: 1.25, air: 1, ring: 1.35 };       // the layers against each other (set by measuring each one alone)
  // a chord: bass note and the note the bass moves to, four bed voices, six notes for the pulse (low to high), five for lead and shimmer.
  // The bed is voiced open: never two seconds side by side and no semitone low down (under snow and wind a cluster is only mud)
  const C = (b, alt, pad, arp, lead) => ({ b, alt, pad, arp, lead });
  const SETS = {
    clear: [C(38, 45, [57, 64, 66, 69], [62, 64, 66, 69, 74, 76], [76, 78, 81, 83, 88]),      // D add9
      C(38, 40, [59, 62, 64, 68], [62, 64, 68, 71, 76, 80], [76, 78, 80, 83, 88]),              // E over D: the Lydian chord
      C(35, 42, [57, 62, 66, 71], [59, 62, 66, 69, 71, 76], [76, 78, 81, 83, 86]),              // B minor 11
      C(33, 40, [57, 61, 64, 71], [57, 61, 64, 69, 71, 76], [76, 78, 81, 83, 85])],             // A add9
    clear2: [C(38, 45, [57, 61, 64, 66], [62, 66, 69, 73, 76, 78], [76, 78, 81, 85, 88]),     // D major 7
      C(42, 37, [57, 61, 64, 68], [61, 64, 66, 71, 73, 76], [76, 78, 81, 83, 85]),              // F sharp minor 11
      C(45, 40, [57, 61, 64, 71], [57, 61, 64, 69, 71, 76], [76, 78, 81, 83, 85]),              // A add9
      C(40, 47, [56, 59, 64, 66], [59, 64, 66, 68, 71, 76], [76, 78, 80, 83, 88])],             // E add9
    gold: [C(45, 40, [57, 61, 64, 71], [57, 61, 64, 69, 71, 76], [76, 78, 81, 83, 85]),       // A add9, and the bass walks down from it
      C(44, 47, [56, 59, 64, 66], [59, 64, 66, 68, 71, 76], [76, 78, 80, 83, 88]),              // E over G sharp
      C(42, 37, [57, 61, 64, 66], [61, 64, 66, 69, 73, 76], [76, 78, 81, 83, 85]),              // F sharp minor 7
      C(38, 45, [54, 57, 61, 64], [62, 66, 69, 73, 76, 78], [76, 78, 81, 85, 88])],             // D major 9
    ember: [C(42, 37, [57, 61, 64, 68], [61, 64, 68, 69, 73, 76], [76, 78, 80, 81, 85]),      // F sharp minor 9
      C(38, 45, [57, 61, 66, 69], [62, 66, 69, 73, 74, 78], [76, 78, 81, 85, 86]),              // D major 7
      C(40, 45, [57, 61, 64, 71], [57, 61, 64, 69, 73, 76], [76, 78, 81, 83, 85]),              // A over E
      C(37, 44, [56, 59, 64, 68], [61, 64, 68, 71, 73, 76], [76, 80, 83, 85, 88])],             // C sharp minor 7
    nebula: [C(35, 42, [57, 62, 66, 73], [59, 62, 66, 69, 73, 78], [78, 81, 83, 85, 86]),     // B minor 9
      C(35, 40, [56, 59, 64, 66], [59, 64, 68, 71, 76, 80], [76, 78, 80, 83, 88]),              // E over B: the Dorian chord
      C(38, 45, [57, 61, 64, 68], [62, 66, 68, 73, 76, 80], [76, 78, 80, 85, 88]),              // D major 7 sharp 11
      C(42, 37, [59, 64, 66, 73], [61, 64, 66, 71, 73, 76], [76, 78, 81, 83, 85])],             // F sharp minor 11
  };
  // how the plucked notes are voiced under each light: which partial the bright edge of a note is (2: glass, 1: a soft mallet, 3: hollow) and
  // how strong, how long a note rings, and how far the whole score is darkened (octaves)
  const TONE = { clear: { ratio: 2, idx: 0.5, ring: 0.16, b: 0 }, clear2: { ratio: 2, idx: 0.5, ring: 0.16, b: 0 }, gold: { ratio: 1, idx: 0.8, ring: 0.2, b: -0.2 },
    ember: { ratio: 1, idx: 0.7, ring: 0.24, b: -0.35 }, nebula: { ratio: 3, idx: 0.5, ring: 0.3, b: -0.6 } };
  // what each kind of run does to it: brightness (octaves), reverb, register of the pulse (semitones), length of its notes, its figure, its level
  const KIND = { bowl: { b: 0, r: 1, o: 0, d: 1, z: 0, a: 1 }, steeps: { b: 0.3, r: 0.85, o: 0, d: 0.85, z: 1, a: 1 }, glade: { b: -0.45, r: 0.55, o: 0, d: 0.7, z: 2, a: 0.9 },
    rollers: { b: 0, r: 1, o: 0, d: 0.9, z: 3, a: 1 }, gully: { b: -0.3, r: 1.3, o: 0, d: 1.1, z: 0, a: 0.95 }, kickers: { b: 0.1, r: 1, o: 0, d: 1, z: 1, a: 1 },
    powder: { b: -0.4, r: 1.1, o: 0, d: 1.25, z: 2, a: 0.8 }, ridge: { b: 0.35, r: 1.2, o: 12, d: 0.9, z: 1, a: 0.7 }, moguls: { b: 0, r: 0.8, o: 0, d: 0.7, z: 3, a: 1 } };
  // figures for the pulse, as steps through the chord's six notes. Their lengths (10, 7, 5, 9) do not divide a bar, so a figure never falls
  // on the same beats two bars running
  const FIG = [[0, 2, 1, 3, 2, 4, 3, 5, 4, 2], [0, 1, 2, 3, 4, 5, 3], [0, 1, 0, 2, 1], [0, 3, 1, 4, 2, 5, 1, 4, 0]];
  const ACC = [1, 0.35, 0.55, 0.8, 0.4, 0.5, 0.85, 0.4, 0.9, 0.35, 0.55, 0.75, 0.45, 0.5, 0.8, 0.5];        // weight of each sixteenth: a lean of 3+3+2
  // phrases for the lead: [sixteenths after the bar line, which of the chord's five notes, length]
  const PHR = [[[0, 0, 6], [6, 3, 10]], [[0, 1, 4], [4, 0, 4], [8, 2, 8]], [[0, 3, 6], [6, 2, 4], [10, 1, 6]], [[0, 2, 4], [4, 3, 4], [8, 4, 8]], [[0, 1, 8], [8, 0, 8]], [[0, 0, 3], [3, 1, 3], [6, 3, 10]]];
  const PUP = [8.5, 16, 27], PDN = [6.5, 14, 24.5], BUP = [0.3, 0.68], BDN = [0.15, 0.5];      // speeds (m/s) and drive at which a layer comes in, and goes again
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const tier = (x, k, up, dn) => { while (k < up.length && x > up[k]) k++; while (k > 0 && x < dn[k - 1]) k--; return k; };

  // the room: two seconds of a far, open slope answering, darker the longer it rings. One channel only: a convolution is by far the dearest
  // thing in the score and a second one for the other ear would double it, so the two ears are told apart afterwards (see the way out)
  function impulse(ctx, rnd) {
    const sr = ctx.sampleRate, n = Math.round(sr * 2.2), b = ctx.createBuffer(1, n, sr), pre = Math.round(sr * 0.03), fade = Math.round(sr * 0.08), d = b.getChannelData(0); let lo = 0, lo2 = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr, w = (rnd() + rnd() + rnd() + rnd() - 2) * 1.73, k = 1 - Math.exp(-TAU * (900 + 6000 * Math.exp(-t / 0.5)) / sr);
      lo += k * (w - lo); lo2 += k * (lo - lo2); d[i] = lo2 * Math.exp(-t / 0.48) * Math.min(1, t / 0.012) * Math.min(1, (n - i) / fade);
    }
    return b;
  }

  // dest: where the score goes (a tap on the engine's bus). kit: the engine's own little helpers. opt.layer: hear one layer alone (tests)
  MU.build = function (ctx, dest, opt, kit) {
    const { gain, biq, pan, chain, H, set } = kit, SPS = MU.bpm / 15, rnd = RNG(4177), S = { log: [] };
    const say = opt.log ? (t, s) => S.log.push([+t.toFixed(3), s]) : () => { };
    const lay = name => gain(opt.layer && opt.layer !== name ? 0 : MIX[name]);
    const osc = (type, f = 220) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    // what moves slowly is worked out once per block of 128 samples, not for every sample (measured: most of what the score cost was there)
    const kr = p => { try { p.automationRate = 'k-rate'; } catch (e) { } return p; };
    // every pitch can be bent at once (time running slow): the detunes are kept in a list, each with its own few cents, and moved together
    const bent = [], bend = (o, cents = 0) => { o.detune.value = cents; bent.push([kr(o.detune), cents]); return o; };

    // ---- the way out. What is played dry passes a low-pass and a gain that close when the skier leaves the ground; the reverb comes back
    // in after them, so whatever was sounding at that moment is left hanging
    const sum = gain(1), lp = biq('lowpass', 9000, 0.6), duck = gain(1), eq = biq('peaking', 1250, 0.9, -2), outG = gain(0), hp = biq('highpass', 48, 0.7);
    chain(sum, lp, duck, eq, outG, hp, dest); kr(lp.frequency); kr(eq.gain);
    // the room has one channel. One ear gets it plus a copy of itself a fortieth of a second late, the other ear minus that copy: as wide as
    // two rooms, for the price of one delay (and on a single loudspeaker the copies cancel, leaving the room as it was)
    const rvIn = gain(1), rv = ctx.createConvolver(), rvLP = biq('lowpass', 5200, 0.5), rvG = gain(0.5), rvM = ctx.createChannelMerger(2), rvD = ctx.createDelay(0.1), rvC = gain(0.8), rvP = gain(0.6), rvN = gain(-0.6);
    try { rv.channelCount = 1; rv.channelCountMode = 'explicit'; } catch (e) { } rv.buffer = impulse(ctx, rnd); rvD.delayTime.value = 0.023;
    chain(rvIn, rv, rvLP, rvG, rvC); rvC.connect(rvM, 0, 0); rvC.connect(rvM, 0, 1); chain(rvG, rvD, rvP); rvP.connect(rvM, 0, 0); chain(rvD, rvN); rvN.connect(rvM, 0, 1); rvM.connect(eq);
    // echo: a dotted eighth, answering from one side and then the other
    const dIn = gain(1), dL = ctx.createDelay(1), dR = ctx.createDelay(1), dA = gain(0.5), dB = gain(0.42), dLP = biq('lowpass', 2400, 0.5), dPL = pan(), dPR = pan(), dOut = gain(0.55), dRv = gain(0.5);
    dL.delayTime.value = dR.delayTime.value = 3 / SPS; if (dPL.pan) { dPL.pan.value = -0.55; dPR.pan.value = 0.55; }
    chain(dIn, dL, dPL, dOut, sum); chain(dL, dA, dLP, dR, dPR, dOut); chain(dR, dB, dL); chain(dOut, dRv, rvIn);
    const bus = (name, dry, rev, dly) => { const g = gain(0), s = lay(name); g.connect(s); if (dry) chain(s, gain(dry), sum); if (rev) chain(s, gain(rev), rvIn); if (dly) chain(s, gain(dly), dIn); return g; };

    // ---- bed: two banks of voices that take turns, one chord coming up as the last one goes. Each note is a pair of saws a few cents apart,
    // one to each ear; a triangle holds the root under them. Its brightness breathes on two slow cycles that never line up (in update)
    const padB = bus('pad', 1, 0.45, 0), padLP = biq('lowpass', 600, 0.5); chain(padLP, padB); kr(padLP.frequency);
    const bank = () => {
      const g = gain(0), mg = ctx.createChannelMerger(2), l = gain(0.074), r = gain(0.074), xl = gain(0.3), xr = gain(0.3), v = [];
      l.connect(mg, 0, 0); r.connect(mg, 0, 1); chain(l, xl); xl.connect(mg, 0, 1); chain(r, xr); xr.connect(mg, 0, 0); chain(mg, g, padLP);
      for (let i = 0; i < 4; i++) { const a = bend(osc('sawtooth'), -7 - i), b = bend(osc('sawtooth'), 7 + i); a.connect(l); b.connect(r); v.push([kr(a.frequency), kr(b.frequency)]); }
      const root = bend(osc('triangle')), gr = gain(1.6); chain(root, gr, l); gr.connect(r); v.push([kr(root.frequency)]);
      return { g: g.gain, v };
    };
    const banks = [bank(), bank()]; let nb = 0;
    const padTo = (ch, t, att, rel) => {
      const bk = banks[nb ^= 1], old = banks[nb ^ 1];
      for (let i = 0; i < 4; i++) { const f = hz(ch.pad[i]); bk.v[i][0].setValueAtTime(f, t); bk.v[i][1].setValueAtTime(f, t); }
      bk.v[4][0].setValueAtTime(hz(ch.b + 12), t); bk.g.setTargetAtTime(1, t, att); old.g.setTargetAtTime(0, t, rel);
    };
    // ---- plucked and struck voices: a sine, and over its first instants a brighter tone (a partial and that partial's octave) that dies away
    // at once: the edge of the note. Both pitches are set a block early (they are only looked at once per block), on a voice long since faded
    const edge = ctx.createPeriodicWave(new Float32Array([0, 0, 0]), new Float32Array([0, 1, 0.45]));
    const voice = out => { const c = bend(osc('sine')), m = bend(osc('sine')), mg = gain(0), g = gain(0), p = pan(); m.setPeriodicWave(edge); if (p.pan) kr(p.pan); chain(m, mg, g); chain(c, g, p, out); return { c: kr(c.frequency), m: kr(m.frequency), mg: mg.gain, g: g.gain, p: p.pan }; };
    // ratio: which partial the edge is (2 glass, 1 a soft mallet, 3 hollow, 3.5 a bell); idx: how strong; ring: how long the note lasts
    const pluck = (V, t, f, v, ratio, idx, ring, pn, att = 0.003, hold = 0) => {
      V.c.setValueAtTime(f, t - 0.003); V.m.setValueAtTime(f * ratio, t - 0.003);
      V.mg.setTargetAtTime(idx * 0.65, t, 0.001); V.mg.setTargetAtTime(idx * 0.05, t + 0.006, Math.max(0.03, ring * 0.35));
      V.g.setTargetAtTime(v, t, att); V.g.setTargetAtTime(0, t + att * 4 + hold, ring);
      if (V.p) V.p.setTargetAtTime(pn, t, 0.012);
    };
    const arpB = bus('arp', 1, 0.3, 0.5), arpLP = biq('lowpass', 2200, 0.5); chain(arpLP, arpB); kr(arpLP.frequency); const arpV = [0, 1, 2, 3, 4].map(() => voice(arpLP));
    const shB = bus('shim', 0.7, 0.6, 0.6), shV = [0, 1, 2, 3].map(() => voice(shB)); shB.gain.value = 1;
    const ldB = bus('lead', 1, 0.5, 0.45), ldV = [0, 1].map(() => voice(ldB)); ldB.gain.value = 1;
    // ---- 光圈 (用户 2026-11-18 22:58 UTC: 通过这个圈的话，音乐会根据这个来蹦一个音，好听，有一种反馈): through a ring the score answers
    // with a struck glass note from the chord sounding at that moment (so it can never clash), an octave over the lead, with its fifth
    // above it soft. Ring after ring through without a miss the notes climb the chord, a run going up; a miss starts the climb again
    // from the bottom. Struck at once, not held for the beat (a reply that waits a sixteenth feels late); the echo puts it on the beat
    const rgB = bus('ring', 1, 0.55, 0.45), rgV = [0, 1, 2, 3, 4, 5].map(() => voice(rgB)); rgB.gain.value = 1;
    // ---- bass: a triangle and its octave; a kick that is only a falling sine
    const basB = bus('bass', 1, 0, 0), bO = bend(osc('triangle', 73)), bO2 = bend(osc('sine', 146)), bG = gain(0), bLP = biq('lowpass', 260, 0.7); chain(bO, bLP, bG, basB); chain(bO2, gain(0.22), bG); kr(bO.frequency); kr(bO2.frequency);
    const bass = (t, m, v, long) => {
      const f = hz(m); bO.frequency.setTargetAtTime(f, t, 0.004); bO2.frequency.setTargetAtTime(f * 2, t, 0.004);
      if (long) { bG.gain.setTargetAtTime(v, t, 0.07); bG.gain.setTargetAtTime(v * 0.55, t + 0.5, 0.9); } else { bG.gain.setTargetAtTime(v, t, 0.006); bG.gain.setTargetAtTime(v * 0.22, t + 0.03, 0.085); }
    };
    const kikB = bus('bass', 1, 0, 0), kO = osc('sine', 50), kG = gain(0); chain(kO, kG, kikB);
    const kick = (t, v) => { const f = kO.frequency; f.cancelScheduledValues(t); f.setValueAtTime(118, t); f.exponentialRampToValueAtTime(47, t + 0.085); kG.gain.setTargetAtTime(v, t, 0.002); kG.gain.setTargetAtTime(0, t + 0.03, 0.06); };
    // ---- the tone held in the air: an open interval from the chord, high, where the wind leaves room; it joins after the gain that ducks the rest
    const hO = [0, 1, 2, 3].map(i => { const o = bend(osc('sine', i < 2 ? 1319 : 1976), i & 1 ? 3 : -3); kr(o.frequency); return o; }), hG = gain(0), hS = lay('air'), hHi = gain(0.6), hB = [gain(0.5), gain(0.5)];
    chain(hO[0], hG, hS); chain(hO[1], hB[0], hG); chain(hO[2], hHi, hG); chain(hO[3], hB[1], hHi); chain(hS, gain(0.5), rv); chain(hS, gain(0.5), eq);     // (pairs a few cents apart: a lone sine in a reverb sits on whatever peak or hole the room has at its pitch)

    const h = { padLP: H(padLP.frequency), arpLP: H(arpLP.frequency), pad: H(padB.gain), eq: H(eq.gain), out: H(outG.gain), duck: H(duck.gain), lp: H(lp.frequency), rvIn: H(rvIn.gain), held: H(hG.gain),
      rvG: H(rvG.gain), dA: H(dA.gain), arp: H(arpB.gain), bas: H(basB.gain), kik: H(kikB.gain) };
    const T = { t: 0, on: false, pos: 0, next: 0, last: 0, abs: 0, step: 0, bar: 0, chord: 0, round: 0, nBar: 0, set: 'clear', want: 'clear', ch: SETS.clear[0], tone: TONE.clear, kind: KIND.bowl,
      tierP: 0, tierB: 0, wantP: 0, wantB: 0, dwP: 0, dwB: 0, sag: 0, sp: 0, carve: 0, side: 0, night: 0, d: 0, full: false, fly: 0, H: 0, hush: 0, bl: 0, bloom: 0, tail: 0, np: 0, ns: 0, av: 0, sv: 0, lv: 0, ph: null, phS: 0, lastPh: -1, rest: 0 };

    // a new chord (every fourth bar, or the instant of a landing)
    function chordIn(t) {
      if (T.chord === 0) T.round++;
      // the light has moved on: the next chord is taken from the new set (same scale, another home). By day two rounds alternate
      if (T.set !== T.want && !(T.want === 'clear' && T.set === 'clear2')) T.set = T.want; if (T.chord === 0 && (T.set === 'clear' || T.set === 'clear2')) T.set = T.round & 1 ? 'clear' : 'clear2';
      const ch = T.ch = SETS[T.set][T.chord], k = T.bl; T.tone = TONE[T.set]; T.bl = 0;
      padTo(ch, t, k ? 0.07 : 1.3, k ? 0.45 : 1.6); say(t, 'chord ' + T.set + ':' + T.chord + (k ? ' landed' : ''));
      if (k) {       // the landing: the chord comes up at once and bright, struck upward through the pulse's voices, the bass under it
        T.bloom = k; for (let i = 0; i < 5; i++) pluck(arpV[T.av++ % 5], t + 0.012 + i * 0.052, hz(ch.arp[i + 1]), (0.22 + 0.25 * k) * (0.75 + 0.06 * i), T.tone.ratio, T.tone.idx * 1.3, T.tone.ring * 1.6, (i - 2) * 0.22);
        pluck(shV[T.sv++ & 3], t + 0.28, hz(ch.lead[4] + 12), 0.2 + 0.25 * k, 2, 0.3, 0.5, 0);
        if (T.wantB === 0) { set(h.bas, 0.8, t, 0.02); bass(t, ch.b, 0.3 + 0.25 * k, true); bG.gain.setTargetAtTime(0, t + 1.6, 0.5); T.tail = 2; }      // (one long note even where no bass is playing)
      }
    }
    function barIn(t) {
      T.nBar++; T.dwP++; T.dwB++; const p = T.wantP < T.tierP && T.dwP < 2 ? T.tierP : T.wantP, b = T.wantB < T.tierB && T.dwB < 2 ? T.tierB : T.wantB;      // (a layer that has just come in stays two bars at least)
      if (p !== T.tierP) { T.dwP = 0; say(t, 'pulse ' + p); } if (b !== T.tierB) { T.dwB = 0; say(t, 'bass ' + b); }
      if (b) T.tail = 0; else if (T.tail === 2) T.tail = 1; else if (T.tierB || T.tail) { bG.gain.setTargetAtTime(0, t, 0.12); T.tail = 0; }
      T.tierP = p; T.tierB = b;
      set(h.arp, [0, 0.85, 1, 1][p] * T.kind.a, t, p ? 0.2 : 0.5); if (b) set(h.bas, [0, 0.8, 1][b], t, 0.25); set(h.kik, b === 2 ? 1 : 0, t, 0.1);
      // every other bar the lead may take a phrase: less often when it has just spoken, more when it has kept quiet
      if ((T.bar & 1) === 0) {
        if (rnd() < [0.2, 0.36, 0.32, 0.24][p] * (T.rest > 1 ? 1.6 : T.rest ? 1 : 0.5)) { let k = Math.floor(rnd() * PHR.length); if (k === T.lastPh) k = (k + 1) % PHR.length; if (k === 3 && p < 2) k = 0; T.lastPh = k; T.ph = PHR[k]; T.phS = 0; T.rest = 0; say(t, 'lead ' + k); }
        else { T.ph = null; T.rest++; }
      }
    }
    // one sixteenth, written at its moment on the audio clock
    function step(t) {
      T.last = t;
      if (T.step === 0) { if (T.bar === 0) chordIn(t); barIn(t); }
      const ch = T.ch, s = T.step, acc = ACC[s], P = T.tierP, B = T.tierB, tn = T.tone, kd = T.kind;
      if (P && (P === 1 ? T.abs % 6 === 0 : P === 2 ? (s & 1) === 0 : true)) {
        const fig = FIG[kd.z], k = fig[T.np++ % fig.length]; let m = ch.arp[k] + kd.o, v = (P === 3 && (s & 1) ? 0.55 : 1) * (0.5 + 0.5 * acc);
        if (P === 3 && acc > 0.75 && rnd() < 0.5) m += 12; else if (P > 1 && rnd() < 0.07) v = 0;           // at full speed the accents leap an octave; now and then a note is left out
        if (v) pluck(arpV[T.av++ % 5], t, hz(m), v * 0.5, tn.ratio, tn.idx * (0.6 + 0.6 * acc), tn.ring * kd.d * (P === 1 ? 1.6 : 1), (rnd() - 0.5) * 0.7);
      }
      if (B === 1) { if (s === 0) bass(t, ch.b, 0.45, true); }
      else if (B === 2) {
        if ((s & 1) === 0) bass(t, s === 14 ? ch.b + 12 : s === 10 ? ch.alt : ch.b, s === 0 ? 1 : s === 6 || s === 12 ? 0.8 : 0.5, false);
        if (s === 0) kick(t, 1.3); else if (s === 6) kick(t, 0.7); else if (s === 12) kick(t, 1);
      }
      // shimmer: the harder the carve the closer together the notes; they climb the chord for as long as it lasts
      if (T.carve > 0.1) { if (T.abs % (T.carve > 0.85 ? 2 : T.carve > 0.5 ? 3 : 4) === 0) pluck(shV[T.sv++ & 3], t, hz(ch.lead[T.ns++ % 5] + 12), 0.2 + 0.4 * T.carve, 2, 0.3, 0.32, T.side * 0.6, 0.004); }
      else T.ns = 0;
      // night: a star now and then
      if (T.night > 0.3 && rnd() < 0.05 * T.night) pluck(shV[T.sv++ & 3], t, hz(ch.lead[Math.floor(rnd() * 5)] + (rnd() < 0.4 ? 24 : 12)), 0.1 + 0.08 * rnd(), 3.5, 0.25, 0.9, rnd() * 1.6 - 0.8, 0.004);
      if (T.ph) { for (const n of T.ph) if (n[0] === T.phS) pluck(ldV[T.lv++ & 1], t, hz(ch.lead[n[1]]), 0.3, 1, 0.3, 0.38, (T.lv & 1 ? 0.18 : -0.18), 0.045, n[2] / SPS * 0.7); T.phS++; }
      T.abs++; if (++T.step === 16) { T.step = 0; if (++T.bar === 4) { T.bar = 0; T.chord = (T.chord + 1) & 3; } }
    }

    // ---- events
    // how much of the music a flight takes away, 0..1, from how long it lasts (fly, s) and how high over the snow it goes (hgt, m). A hop off
    // a bump or a roller, the player's own pop, a drop of a metre or two: nothing, the beat goes on. A kicker's three or four metres and more
    // than a second in the air: the music sinks away, darker and quieter, and slows with the clock, the more the bigger the jump. Only the
    // biggest air (past FULL) stops it dead, to come back on the landing
    const size = (fly, hgt) => sat(0.5 * (smooth(0.8, 1.6, fly) + smooth(1.0, 5.0, hgt))), FULL = 0.8;
    // leaving the ground
    S.takeoff = function (t, fly, hgt) { if (!T.on) return; T.fly = t; T.H = hgt || 0; const d = size(fly, T.H); if (d > 0) say(t, 'dip ' + d.toFixed(2)); drop(d, t); };
    function drop(d, t) {
      if (d <= T.d) return; T.d = d;
      if (d > FULL && !T.full) { T.full = true; for (let i = 0; i < 4; i++) hO[i].frequency.setValueAtTime(hz(T.ch.lead[i < 2 ? 0 : 3] + 12), t); say(t, 'drop'); }
    }
    // touching down: after a real flight the landing is the downbeat of the next chord, and the music comes back with it, as large as the jump was
    S.down = function (t, v, airT) {
      const full = T.full; T.fly = 0; T.d = 0; T.H = 0; T.full = false; if (!T.on || !full) return;
      T.bl = Math.max(0.25, sat(airT / 1.3) * (0.55 + 0.45 * sat(v / 7)));
      T.step = 0; T.bar = 0; T.abs = 0; T.chord = (T.chord + 1) & 3; T.pos = T.next = Math.ceil(T.pos); T.ph = null; say(t, 'land ' + T.bl.toFixed(2));
    };
    // through a ring: k how many in a row (0 the first), fin the finish ring (the whole chord, struck upward), side where it was (-1..1)
    S.ring = function (t, k, fin, side) {
      const ch = T.ch, L5 = ch.lead, pn = clamp(side || 0, -0.6, 0.6);
      if (fin) { for (let i = 0; i < 5; i++) pluck(rgV[T.rg = ((T.rg || 0) + 1) % 6], t + 0.01 + i * 0.07, hz(L5[i] + 12), 0.34 - 0.03 * i, 2, 0.45, 0.7 + 0.1 * i, (i - 2) * 0.25, 0.003); pluck(rgV[T.rg = (T.rg + 1) % 6], t + 0.4, hz(L5[0] + 24), 0.22, 3.5, 0.3, 1.4, 0, 0.004); return; }
      const n = k % 5, o = 12 * (1 + Math.min(1, Math.floor(k / 5)));
      pluck(rgV[T.rg = ((T.rg || 0) + 1) % 6], t + 0.01, hz(L5[n] + o), 0.36, 2, 0.5, 0.55, pn, 0.003);
      pluck(rgV[T.rg = (T.rg + 1) % 6], t + 0.03, hz(L5[n] + o + 7), 0.11, 3.5, 0.25, 0.8, -pn, 0.004);
      say(t, 'ring ' + k);
    };
    // hitting a tree: the music flinches
    S.crash = function (t) { if (!T.on) return; T.hush = t + 0.8; T.wantP = Math.min(T.wantP, 1); T.wantB = 0; T.tierP = Math.min(T.tierP, 1); T.tierB = 0; T.tail = 0; set(h.arp, [0, 0.85][T.tierP] * T.kind.a, t, 0.1); bG.gain.setTargetAtTime(0, t, 0.08); set(h.kik, 0, t, 0.05); say(t, 'crash'); };

    // ---- every frame. s: the engine's snapshot of the skier; E: how hard the edges are moving snow; side: which side it flies to
    S.update = function (s, t, E, side) {
      const dt = clamp(t - T.t, 0, MU.look); T.t = t;
      const e = s.sun == null ? 0.2 : s.sun, tsR = clamp(s.ts || 1, 0.05, 1);
      T.night = smooth(0, -0.17, e); T.want = e < -0.1 ? 'nebula' : e < 0.03 ? 'ember' : e < 0.12 ? 'gold' : 'clear';
      const live = s.run || s.park || (!!s.title && MU.titleOn());       // (park: stopped after a challenge's finish line, the music plays on)
      if (live && !T.on) {        // a run begins (the first or a later one): from the top, with nothing remembered of what the skier was doing before
        T.on = true; T.pos = T.next = T.abs = T.step = T.bar = T.chord = 0; T.wantP = T.wantB = T.tierP = T.tierB = T.carve = T.bloom = T.hush = T.fly = T.tail = 0; T.ph = null;
        T.set = T.want; T.sp = s.speed; h.out.v = NaN; say(t, 'start');
      }
      else if (!live && T.on) { T.on = false; T.d = 0; T.full = false; set(h.out, 0, t, 0.3); for (const b of banks) b.g.setTargetAtTime(0, t, 0.3); bG.gain.setTargetAtTime(0, t, 0.1); say(t, 'stop'); }
      if (!T.on) return;
      // what the skier is doing, as the few slow numbers the score listens to
      const kd = T.kind = KIND[s.kind] || KIND.bowl; T.sp = damp(T.sp, s.speed, 1.5, dt);
      const drive = Math.max(smooth(24, 32, T.sp), 0.8 * smooth(0.46, 0.56, s.slope || 0) * smooth(12, 20, T.sp));
      T.wantP = tier(T.sp, T.wantP, PUP, PDN); T.wantB = t < T.hush ? 0 : tier(drive, T.wantB, BUP, BDN);
      const c = sat(((E || 0) - 0.33) / 0.42); T.carve = damp(T.carve, c, c > T.carve ? 9 : 1.1, dt); if (c > 0.05) T.side = side || 0;
      // a flight that turns out longer or higher than it looked still gets its share; one that ended without a word is closed
      if (T.fly) { if (s.air) { T.H = Math.max(T.H, s.clear || 0); drop(size(Math.max(s.airT, s.pred || 0), T.H), t); } else if (t - T.fly > 0.3) S.down(t, 0, 0); }
      // time running slow pulls every pitch flat and closes the sound: as much of it as the flight has taken of the music (a small hop that
      // the clock slows a touch for leaves the score alone)
      const ts = lerp(1, tsR, smooth(0.15, 0.6, T.d));
      const sg = 1200 * Math.log2(ts) * MU.sag; if (Math.abs(sg - T.sag) > 1.5 || (!sg && T.sag)) { T.sag = sg; for (const b of bent) b[0].setTargetAtTime(b[1] + sg, t, 0.04); }
      const hush = t < T.hush ? 0.6 : 0, dk = Math.max(T.d, hush), vk = sat(T.sp / 34), tn = T.tone;
      set(h.duck, lerp(1, 0.17, dk), t, dk > 0 ? 0.05 : 0.035); set(h.lp, 9000 * Math.pow(0.04, dk) * Math.pow(ts, 0.7), t, dk > 0 ? 0.07 : 0.04);
      set(h.rvIn, lerp(1, 0.1, T.d), t, 0.05); set(h.held, T.full ? 0.07 : 0, t, T.full ? 0.3 : 0.12);
      // brightness: speed opens the bed and the pulse; the light and the kind of run colour them; a landing flares; the bed breathes besides
      T.bloom = damp(T.bloom, 0, 1.3, dt);
      set(h.padLP, 500 * Math.pow(2, 1.5 * vk + tn.b + kd.b + 1.3 * T.bloom + (Math.sin(t * TAU / 23) + Math.sin(t * TAU / 37)) / 6), t, 0.3); set(h.arpLP, 1900 * Math.pow(2, 0.7 * vk + 0.5 * (tn.b + kd.b)), t, 0.3);
      set(h.pad, 1 - 0.08 * Math.min(T.tierP, 2) - 0.07 * T.tierB + 0.25 * T.bloom, t, 0.5);
      set(h.eq, -2 - 7 * sat((E || 0) * 0.85), t, 0.08);                    // room for the scrape of the edges, where it lives
      set(h.rvG, 0.5 * kd.r * (1 + 0.3 * T.night), t, 0.8); set(h.dA, kd.r > 1.1 ? 0.6 : 0.5, t, 0.8);
      set(h.out, MU.level * (LevelV[vOf('mlevel')] || 1) * (s.run || s.park ? 1 : 0.5) * (1 - 0.15 * T.night), t, s.run ? 0.8 : 1.6);
      // the clock runs on the game's time; nothing is written while the skier is in the air on a real jump
      if (!T.full) { T.pos += dt * ts * SPS; const end = T.pos + MU.look * ts * SPS; let n = 0; while (T.next <= end && n++ < 6) { step(Math.max(t, t + (T.next - T.pos) / (ts * SPS))); T.next++; } }
    };
    S.dbg = () => [T.nBar, T.set + ':' + T.chord, T.tierP, T.tierB, +T.d.toFixed(2), T.full ? 1 : 0, +T.carve.toFixed(2), +T.sp.toFixed(1)];
    return S;
  };
  return MU;
})();
