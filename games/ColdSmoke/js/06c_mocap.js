"use strict";
// ---------------------------------------------------------------- the body through a turn, from real skiing (Variants 'mocap')
// One right turn of a real skier filmed from behind (data/mocap/, credits there), cut at the edge changes, the left turns mirrored onto it, averaged
// and smoothed: 32 phases from one edge change to the next. The left turn is the same turn mirrored. What it gives the figure, all from the one
// place in the turn, so the parts move together as one body instead of each on its own spring: how far the hips sink and rise, how far the
// shoulders are turned against the hips, where the hands are, and when a pole goes in. The lean itself stays the physics' own, and so do the
// legs (they are on the skis); fore and aft is the game's own too (one camera cannot see depth well enough: the source's shins lean backward).
// Where in the turn: read off the lean that is drawn, never off a clock. From an edge change the lean grows to its most (phase 0 -> 0.5),
// is held there as long as the turn is held, and is let go back to the next edge change (0.5 -> 1); the phase only ever goes forward within a
// turn, and it is 1 exactly where the lean crosses zero, which is phase 0 of the next turn, mirrored: no jump anywhere. How much of the
// motion: as much as the turn leaned, against how far the filmed skier leaned (36 degrees).
if (typeof Variants !== 'undefined') Variants.def('mocap', '人物动作数据', [['a', '原来'], ['b', '真人视频']], 'b');
const Mocap = (() => {
  const D = MOCAP_DATA.cc, N = 32, LEG = 0.86;
  const neg = a => a.map(v => -v), cat = (a, b) => a.concat(b);
  // over the turn pair (64 phases, 0..2): the first half the right turn as filmed, the second the left turn (mirrored: x and the twist change sign,
  // left and right hands swap)
  const C = { hip: cat(D.hip, D.hip), tw: cat(D.twist, neg(D.twist)),
    rx: cat(D.rwx, neg(D.lwx)), ry: cat(D.rwy, D.lwy), rz: cat(D.rwz, D.lwz), lx: cat(D.lwx, neg(D.rwx)), ly: cat(D.lwy, D.rwy), lz: cat(D.lwz, D.rwz) };
  const M = {}; for (const k in C) M[k] = C[k].reduce((s, v) => s + v, 0) / C[k].length;
  const A = D.inc.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  // (periodic Catmull-Rom between the phases)
  const at = (a, u) => { const n = a.length, x = (((u * N) % n) + n) % n, i = Math.floor(x), f = x - i, p0 = a[(i + n - 1) % n], p1 = a[i], p2 = a[(i + 1) % n], p3 = a[(i + 2) % n];
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0))); };
  // a pole goes in just before the edge change, on the side of the turn to come: the right pole before the right turn (u = 0)
  const bump = (u, c, w) => { let d = u - c; d -= 2 * Math.round(d / 2); return Math.abs(d) >= w ? 0 : Math.cos(d / w * PI / 2) ** 2; };
  const st = { sg: 0, ph: 0, pk: 0, pv: 0, rel: false, ph0: 0, uo: null };
  const out = { u: 0, k: 0, amp: 0, crouch: 0, sep: 0, hL: [0, 0, 0], hR: [0, 0, 0], plL: 0, plR: 0 };
  function reset() { st.sg = 0; st.ph = 0; st.pk = st.pv = 0; st.rel = false; st.ph0 = 0; st.uo = null; }
  // s: the lean that is drawn (radians, + to the skier's right); dt: seconds since the last call. Returns out
  // (the game's edge change is quicker than the filmed skier's: a third of a second where he takes most of one. The body is let through that part of
  // the turn no faster than RATE turns a second, and catches up as the new turn is held: the trunk comes round a moment after the legs, never at a
  // snap; the pole too, swung over a wide part of the turn so that it is never a flick)
  const RATE = 1.4;
  function update(s, dt) {
    const a = Math.abs(s), sg = s > 0 ? 1 : s < 0 ? -1 : st.sg;
    if (sg !== st.sg) { st.pv = st.sg ? st.pk : a; st.pk = 0; st.rel = false; st.ph = 0; st.sg = sg; }
    if (!st.rel) {
      st.pk = Math.max(st.pk, a); const phE = 0.5 * Math.min(a / Math.max(st.pv, 0.2), 1); st.ph = Math.max(st.ph, phE);
      if (st.pk > 0.04 && a < st.pk - 0.03) { st.rel = true; st.ph0 = Math.min(st.ph, 0.5); }
    } else {
      st.pk = Math.max(st.pk, a); st.ph = Math.max(st.ph, st.ph0 + (1 - st.ph0) * (1 - a / Math.max(st.pk, 1e-4)));
    }
    st.ph = Math.min(st.ph, 1);
    const ph = st.ph, u0 = sg < 0 ? 1 + ph : ph, amp = st.pv * (1 - ph) + st.pk * ph, k = clamp(amp / A, 0, 1);
    if (st.uo == null || !(dt > 0)) st.uo = st.uo == null ? u0 : st.uo; else { let d = u0 - st.uo; d -= 2 * Math.round(d / 2); st.uo += clamp(d, -RATE * dt, RATE * dt); st.uo -= 2 * Math.floor(st.uo / 2); }
    const u = st.uo; out.u = u; out.amp = amp; out.k = k;
    out.crouch = -(at(C.hip, u) - M.hip) * k * LEG / 0.38;
    out.sep = 0.8 * Math.tanh(0.8 * at(C.tw, u) * k / 0.65 / 0.8);       // (the figure turns the chest by sep and the hips by a third of it: 0.65 of it between them; the source's
    // twist is the noisiest thing in it, so four fifths of it, and rounded off toward 0.8 rather than stopped there)
    out.hL[0] = (at(C.lx, u) - M.lx) * k * LEG; out.hL[1] = 0.5 * (at(C.ly, u) - M.ly) * k * LEG; out.hL[2] = 0.5 * (at(C.lz, u) - M.lz) * k * LEG;
    out.hR[0] = (at(C.rx, u) - M.rx) * k * LEG; out.hR[1] = 0.5 * (at(C.ry, u) - M.ry) * k * LEG; out.hR[2] = 0.5 * (at(C.rz, u) - M.rz) * k * LEG;
    // (heights at half: the figure already carries the inside hand lower and the outside one higher as it leans, and the two together put the inside
    // fist below the belt with its pole dragged flat)
    const real = smooth(0.15, 0.35, amp);
    out.plR = bump(u, -0.08, 0.22) * real; out.plL = bump(u, 0.92, 0.22) * real;
    return out;
  }
  return { update, reset, out, st, A, T: D.T };
})();
if (typeof window !== 'undefined') window.__mocap = Mocap;     // (for the tests)
