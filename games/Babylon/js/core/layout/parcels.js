// layout/parcels.js — a block becomes party-walled plots with no gaps.
//
//   block  ->  (a great house on a corner, sometimes)
//          ->  rows: the block is cut lengthwise by blind alleys (1.2-2.5 m) so that no row is more than two
//              plots deep; a blind alley ends at a cross row of plots that closes the far end of the block
//          ->  bays: each row is cut crosswise into bays of very unequal width (the width follows from a plot
//              area drawn from the excavated size classes)
//          ->  plots: a bay is one plot through the whole depth, or two back to back with the party line
//              anywhere between 40 and 60 %, or a plot with an unbuilt back yard; half plots may split again
// Every plot keeps the tags of its edges (street frontage / party line), so the house builder knows where the
// door can be. R5 2.1-2.2, 3.1-3.2; Koldewey fig. 155.
import * as G from './poly.js';
import { PARTY } from './net.js';
import { CLASS_AREA } from './params.js';

const ACCESS = (t) => !!t && (t.k === 'street' || t.k === 'open');
/** Where an alley can be entered: a street, open ground, or the open edge of a suburb patch or village. */
const MOUTH = (t) => !t || t.k === 'street' || t.k === 'open' || t.k === 'edge';
const CLASSES = ['small', 'medium', 'large', 'mansion'];

/** Typical plot depth of a quarter: from the geometric mean of the class areas. */
export function plotDepth(prm) {
  let s = 0, w = 0;
  for (const c of CLASSES) { const m = prm.classMix[c] || 0, r = CLASS_AREA[c]; s += m * Math.log(Math.sqrt(r[0] * r[1]) * 0.98); w += m; }
  return Math.max(9.5, Math.min(21, 1.05 * Math.sqrt(Math.exp(s / (w || 1)) * prm.size)));
}

/**
 * parcelize(block, prm, rng, sink)
 * block: working polygon (clockwise, tags). sink: { lot(poly), open(poly, kind, use), alley(polyline, width, blind) -> street record }
 */
export function parcelize(block, prm, rng, sink) {
  const d0 = plotDepth(prm);
  const drawClass = () => {
    let r = rng.next(), acc = 0;
    for (const c of CLASSES) { acc += prm.classMix[c] || 0; if (r < acc) return c; }
    return 'small';
  };
  const drawArea = (c) => { const r = CLASS_AREA[c]; return r[0] * Math.pow(r[1] / r[0], Math.pow(rng.next(), 1.35)) * prm.size; };
  const frame = (P) => {
    let [ux, uz] = G.longestEdgeDir(P.p), ex = G.extents(P.p, ux, uz);
    if (ex.v1 - ex.v0 > ex.u1 - ex.u0) { [ux, uz] = [-uz, ux]; ex = G.extents(P.p, ux, uz); }
    return { ux, uz, vx: -uz, vz: ux, ex, Lu: ex.u1 - ex.u0, Lv: ex.v1 - ex.v0 };
  };
  const at = (f, u, v) => [f.ux * u + f.vx * v, f.uz * u + f.vz * v];
  const rot = (x, z, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - z * s, x * s + z * c]; };

  function finish(P) {
    if (!P) return;
    const A = G.area(P.p);
    if (A < 34) { sink.open(P, 'lot', 'sliver'); return; }
    const f = frame(P);
    // too narrow, a splinter, or a wedge (a plot needs room for rooms round a court)
    if (f.Lv < 4.8 || A < 46 || f.Lu / f.Lv > (A > 150 ? 4.2 : 3.2) || A / (f.Lu * f.Lv) < 0.56) { sink.open(P, 'lot', A < 80 ? 'sliver' : 'empty'); return; }
    let access = false;
    for (let i = 0, n = P.p.length; i < n; i++) {
      if (!ACCESS(P.t[i])) continue;
      const a = P.p[i], b = P.p[(i + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 2.2) { access = true; break; }
    }
    if (!access) { sink.open(P, 'garden', 'backyard'); return; }
    sink.lot(P);
  }

  /** One row (at most two plots deep): cut into bays, bays into plots. */
  function bays(S) {
    const f = frame(S), ex = f.ex, vm = (ex.v0 + ex.v1) / 2;
    if (f.Lu < 7 || G.area(S.p) < 60) return finish(S);
    let accLo = false, accHi = false;
    for (let i = 0, n = S.p.length; i < n; i++) {
      if (!ACCESS(S.t[i])) continue;
      const a = S.p[i], b = S.p[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 2.5 || Math.abs(((b[0] - a[0]) * f.ux + (b[1] - a[1]) * f.uz) / l) < 0.8) continue;
      const mv = (-(a[0] + b[0]) * f.uz + (a[1] + b[1]) * f.ux) / 2;
      if (mv < vm) accLo = true; else accHi = true;
    }
    const both = accLo && accHi, one = accLo !== accHi;
    let rest = S, u = ex.u0, openRun = false;
    for (let guard = 0; rest && guard < 200; guard++) {
      const remaining = ex.u1 - u;
      const probe = G.chordOfLine(rest, ...at(f, u + Math.min(3, remaining / 2), vm), f.vx, f.vz);
      const D = probe ? probe.b.s - probe.a.s : f.Lv;
      const cls = drawClass(), A = drawArea(cls), dA = Math.sqrt(A);
      let mode = 'full', w = A / Math.max(D, 4), frac = 0.5;
      if (both && D > 1.45 * dA && D / 2 >= 7.2) { mode = 'half'; frac = rng.range(0.4, 0.6); w = A / (frac * D); }
      else if (!both && D * D / A > 2.6) {
        if (rng.next() < 0.5 * (1 - 0.85 * (prm.elite || 0)) && D > dA * 1.5 + 5) { mode = 'yard'; frac = Math.min(0.8, dA * rng.range(1.05, 1.4) / D); w = A / (frac * D); }
        else w = D / 2.6;
      }
      w = Math.max(5.6, Math.min(62, w));
      // a run of unbuilt plots (gardens, empty and ruined plots) keeps going a little
      const openP = prm.openLot * (openRun ? 2.2 : 0.78);
      const isOpen = rng.next() < openP;
      openRun = isOpen;
      let bay;
      if (remaining - w < 6.5) { bay = rest; rest = null; }
      else {
        const [dx, dz] = rot(f.vx, f.vz, rng.gauss() * 1.8);
        const parts = G.splitLine(rest, ...at(f, u + w, vm), dx, dz, PARTY, PARTY);
        bay = parts[0]; rest = parts[1];
        u += w;
        if (!bay) continue;
      }
      if (isOpen) {
        const r = rng.next();
        sink.open(bay, r < 0.45 ? 'garden' : 'lot', r < 0.45 ? (rng.next() < 0.5 ? 'vegetable' : 'orchard') : r < 0.78 ? 'empty' : r < 0.92 ? 'ruin' : 'rubbish');
        continue;
      }
      if (mode === 'full') { finish(bay); continue; }
      // party line along the row
      const fb = G.extents(bay.p, f.ux, f.uz), um = (fb.u0 + fb.u1) / 2;
      const loFirst = mode === 'yard' ? accLo : rng.next() < 0.5;
      const vc = loFirst ? fb.v0 + (fb.v1 - fb.v0) * frac : fb.v1 - (fb.v1 - fb.v0) * frac;
      const [dx, dz] = rot(f.ux, f.uz, rng.gauss() * 1.5);
      const [hi, lo] = G.splitLine(bay, ...at(f, um, vc), dx, dz, PARTY, PARTY);     // right of travel along u = higher v
      if (mode === 'yard') {
        const front = loFirst ? lo : hi, back = loFirst ? hi : lo;
        finish(front);
        if (back) sink.open(back, 'garden', 'backyard');
        continue;
      }
      for (const lot of [lo, hi]) {
        if (!lot) continue;
        const fl = G.extents(lot.p, f.ux, f.uz), lw = fl.u1 - fl.u0;
        if (lw >= 12 && G.area(lot.p) > 190 * prm.size && rng.next() < 0.4) {
          const [ex2, ez2] = rot(f.vx, f.vz, rng.gauss() * 1.5);
          const [a, b] = G.splitLine(lot, ...at(f, fl.u0 + lw * rng.range(0.4, 0.6), (fl.v0 + fl.v1) / 2), ex2, ez2, PARTY, PARTY);
          finish(a); finish(b);
        } else finish(lot);
      }
    }
  }

  /** A block or part of one: blind alleys, cross row, rows. */
  function rows(P) {
    const f = frame(P), ex = f.ex;
    const k = Math.min(4, Math.ceil(f.Lv / (2.3 * d0) - 0.08));
    if (k <= 1 || G.area(P.p) < 4 * d0 * d0) return bays(P);
    let main = P;
    const through = rng.next() < prm.through || f.Lu < 2.7 * d0;
    let capC = null;
    if (!through) {
      // the cross row that closes the blind end
      const capD = d0 * rng.range(0.9, 1.25), capHi = rng.next() < 0.5;
      const uc = capHi ? ex.u1 - capD : ex.u0 + capD;
      const [dx, dz] = rot(f.vx, f.vz, rng.gauss() * 1.5);
      const [lowU, highU] = G.splitLine(P, ...at(f, uc, (ex.v0 + ex.v1) / 2), dx, dz, PARTY, PARTY);
      const cap = capHi ? highU : lowU, body = capHi ? lowU : highU;
      if (cap && body) { capC = G.centroid(cap.p); bays(cap); main = body; }
    }
    // the alleys run along the block (the frame of the whole block, so that they meet the cross row squarely)
    const em = G.extents(main.p, f.ux, f.uz), fm = main === P ? f : { ...f, ex: em, Lu: em.u1 - em.u0, Lv: em.v1 - em.v0 };
    const cornerClear = (poly, h, min) => { const n = poly.p.length, a = poly.p[h.e], b = poly.p[(h.e + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return h.t * l >= min && (1 - h.t) * l >= min; };
    let rest = main;
    for (let j = 1; j < k && rest; j++) {
      const aw = rng.range(prm.alley[0], prm.alley[1]) * (through ? 1.15 : 1);
      const vc = fm.ex.v0 + fm.Lv * (j / k + rng.range(-0.05, 0.05));
      const [dx, dz] = rot(fm.ux, fm.uz, rng.gauss() * 1.2);
      const pt = at(fm, (fm.ex.u0 + fm.ex.u1) / 2, vc);
      const ch = G.chordOfLine(rest, pt[0], pt[1], dx, dz);
      if (!ch || ch.b.s - ch.a.s < 8 || !cornerClear(rest, ch.a, aw / 2 + 0.8) || !cornerClear(rest, ch.b, aw / 2 + 0.8)) continue;
      // an alley is entered from a street or open ground: an end on a party line (the cross row, a great house,
      // another part of the block) is blind; an alley closed at both ends is not laid
      const openA = MOUTH(rest.t[ch.a.e]), openB = MOUTH(rest.t[ch.b.e]);
      if (!openA && !openB) continue;
      const tag = { k: 'street', st: null, hw: aw / 2 };
      const [hiV, loV] = G.splitLine(rest, pt[0], pt[1], dx, dz, tag, tag, aw / 2, aw / 2);
      if (!hiV || !loV) continue;
      // the polyline runs from the mouth to the blind end
      const a = [ch.a.x, ch.a.z], b = [ch.b.x, ch.b.z];
      tag.st = sink.alley(openA ? [a, b] : [b, a], aw, !(openA && openB));
      bays(loV);
      rest = hiV;
    }
    if (rest) bays(rest);
  }

  // great houses: a corner plot of 1,000 to 1,900 m2 cut out of the block before the rows are made
  let P = block;
  const A0 = G.area(P.p), meanA = (() => { let s = 0; for (const c of CLASSES) s += (prm.classMix[c] || 0) * Math.sqrt(CLASS_AREA[c][0] * CLASS_AREA[c][1]); return s * prm.size; })();
  const expect = (prm.classMix.mansion || 0) * A0 / meanA;
  const nGreat = Math.floor(expect + rng.next());
  for (let g = 0; g < nGreat && P; g++) {
    const f = frame(P), area = Math.min(1750, drawArea('mansion') / prm.size * Math.max(0.8, prm.size)), side = Math.sqrt(area);
    if (f.Lv < side * 0.85 || f.Lu < side * 1.5 || G.area(P.p) < area * 1.8) break;
    const dv = Math.min(side * rng.range(0.9, 1.1), f.Lv), du = area / dv;
    const atLoV = rng.next() < 0.5, atLoU = rng.next() < 0.5;
    const vc = atLoV ? f.ex.v0 + dv : f.ex.v1 - dv;
    const whole = f.Lv - dv < 7;
    const [hiV, loV] = whole ? [null, null] : G.splitLine(P, ...at(f, (f.ex.u0 + f.ex.u1) / 2, vc), f.ux, f.uz, PARTY, PARTY);
    const band = whole ? P : atLoV ? loV : hiV, other = whole ? null : atLoV ? hiV : loV;
    if (!band) break;
    const fb = G.extents(band.p, f.ux, f.uz), uc = atLoU ? fb.u0 + du : fb.u1 - du;
    const [lowU, highU] = G.splitLine(band, ...at(f, uc, (fb.v0 + fb.v1) / 2), f.vx, f.vz, PARTY, PARTY);
    const great = atLoU ? lowU : highU, restBand = atLoU ? highU : lowU;
    if (!great || G.area(great.p) < 700) break;
    finish(great);
    if (restBand) rows(restBand);
    P = other;
  }
  if (P) rows(P);
}
