// js/modules/southpalace/facade.js — the upper registers of the throne-room court facade, which the relief atlas
// of ctx.glazed does not hold (docs/glazed.md section 7): flat glazed brick on a dark-blue ground, bottom to top
//   slender yellow palm shafts set close together, each crowned by three stacked pairs of light-blue volutes
//   outlined in white, the capitals linked by arcs that carry palmette buds;
//   a band of yellow / black / white squares; a frieze of white double palmettes; a band of squares.
// (R4 3.6 after Koldewey ch. XV and the Berlin reconstruction; the stacking and the heights are conjectural.)
// One tile = one column pitch (7 bricks) wide, 101 courses high, on the brick grid of the atlas (brick 1/3 m,
// course 2.06 / 24 m), drawn with the grid showing through the glaze. Deterministic: hashes of brick indices.
import { hash2 } from '../../core/rng.js';

export const FACADE = { bricks: 7, courses: 101, brick: 1 / 3, course: 2.06 / 24 };
FACADE.width = FACADE.bricks * FACADE.brick;        // 2.333 m: the column pitch
FACADE.height = FACADE.courses * FACADE.course;     // 8.669 m

const C = { ground: [31, 63, 138], deep: [23, 52, 112], light: [40, 96, 170], yellow: [224, 178, 58], ochre: [201, 154, 60], white: [241, 237, 220], blue: [79, 169, 196], black: [20, 20, 22], red: [154, 59, 34] };
const css = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

export function makeFacadeTexture(THREE, { draft = false } = {}) {
  const W = draft ? 256 : 512, H = draft ? 1024 : 2048, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), sx = W / FACADE.width, sy = H / FACADE.height, bw = FACADE.brick, ch = FACADE.course;
  // metres, origin at the bottom left, y up
  g.setTransform(sx, 0, 0, -sy, 0, H);
  // 1. the ground: bricks from deep lapis to light blue
  for (let r = 0; r < FACADE.courses; r++) for (let b = -1; b <= FACADE.bricks; b++) {
    const off = r % 2 ? 0.5 : 0, bi = ((b % FACADE.bricks) + FACADE.bricks) % FACADE.bricks, h = hash2(bi * 2 + (r % 2), r, 913), h2 = hash2(bi, r, 77);
    const t = h * h, c = h2 < 0.07 ? [42, 127, 166] : [C.deep[0] + (C.light[0] - C.deep[0]) * t, C.deep[1] + (C.light[1] - C.deep[1]) * t, C.deep[2] + (C.light[2] - C.deep[2]) * t];
    g.fillStyle = css(c); g.fillRect((b + off) * bw, r * ch, bw, ch);
  }
  const P = FACADE.width, cx = P / 2;
  const line = (w, c) => { g.lineWidth = w; g.strokeStyle = css(c); g.lineCap = 'round'; g.lineJoin = 'round'; };
  const band = (y0) => {                          // three courses: yellow line, squares yellow / black / white, yellow line
    g.fillStyle = css(C.yellow); g.fillRect(0, y0, P, ch * 3);
    const n = FACADE.bricks * 2, q = P / n, cols = [C.black, C.white, C.black, C.yellow];
    for (let i = 0; i < n; i++) { g.fillStyle = css(cols[i % 4]); g.fillRect(i * q + q * 0.08, y0 + ch * 0.75, q * 0.84, ch * 1.5); }
  };
  const petal = (x, y, ang, len, wid, c, edge) => {   // a pointed leaf from (x, y)
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, len * 0.55, 0, len); g.quadraticCurveTo(-wid, len * 0.55, 0, 0); g.closePath();
    g.fillStyle = css(c); g.fill(); if (edge) { line(0.012, edge); g.stroke(); }
    g.restore();
  };
  const fan = (x, y, dir, n, len, wid) => {       // palmette: n petals, the middle one longest; dir +1 up, -1 down
    for (let i = 0; i < n; i++) { const a = ((i - (n - 1) / 2) / ((n - 1) / 2)) * 1.15, l = len * (1 - 0.32 * Math.abs(a) / 1.15); petal(x, y, dir > 0 ? -a : Math.PI + a, l, wid, i % 2 ? C.white : C.white, C.black); }
    g.beginPath(); g.arc(x, y, wid * 1.15, 0, Math.PI * 2); g.fillStyle = css(C.yellow); g.fill(); line(0.012, C.black); g.stroke();
  };
  const volute = (x, y, s, R) => {                // one scroll: leaves the stem at (x, y), curls outward and down; s = +-1
    const pts = [], turns = 1.35, n = 40;
    for (let i = 0; i <= n; i++) { const f = i / n, a = Math.PI / 2 - f * turns * 2 * Math.PI, r = R * (1 - 0.72 * f); pts.push([x + s * (R * 1.05 + r * Math.cos(a)), y + R * 0.15 + r * Math.sin(a) - R * 0.2 * f]); }
    const path = () => { g.beginPath(); g.moveTo(x, y - R * 0.55); g.quadraticCurveTo(x + s * R * 0.2, y + R * 0.9, pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); };
    line(R * 0.62, C.black); path(); g.stroke(); line(R * 0.5, C.white); path(); g.stroke(); line(R * 0.3, C.blue); path(); g.stroke();
    const e = pts[pts.length - 1]; g.beginPath(); g.arc(e[0], e[1], R * 0.17, 0, Math.PI * 2); g.fillStyle = css(C.yellow); g.fill();
  };
  // 2. the palm shafts: 52 courses of shaft, three tiers of volutes, a bud
  const shaftH = 52 * ch, tier = 7 * ch, sw = 0.3;
  for (const x of [cx - P, cx, cx + P]) {
    g.fillStyle = css(C.black); g.fillRect(x - sw / 2 - 0.022, 0, sw + 0.044, shaftH);
    g.fillStyle = css(C.yellow); g.fillRect(x - sw / 2, 0, sw, shaftH);
    g.fillStyle = css(C.ochre); g.fillRect(x - sw / 2, 0, sw * 0.22, shaftH);            // the round of the trunk
    g.fillStyle = css(C.white, 0.98); g.fillRect(x + sw * 0.12, 0, sw * 0.1, shaftH);
    for (const y of [shaftH - ch * 1.2, shaftH - ch * 3.2, ch * 0.4]) { g.fillStyle = css(C.black); g.fillRect(x - sw / 2 - 0.05, y - 0.012, sw + 0.1, ch * 0.8 + 0.024); g.fillStyle = css(C.white); g.fillRect(x - sw / 2 - 0.04, y, sw + 0.08, ch * 0.8); }
    for (let k = 2; k >= 0; k--) {                 // volutes: the lowest pair widest
      const y = shaftH + tier * (k + 0.55), R = 0.2 - 0.022 * k;
      g.fillStyle = css(C.yellow); g.beginPath(); g.moveTo(x - sw * 0.5, y - tier * 0.55); g.lineTo(x + sw * 0.5, y - tier * 0.55); g.lineTo(x + sw * 0.34, y + tier * 0.45); g.lineTo(x - sw * 0.34, y + tier * 0.45); g.closePath(); g.fill(); line(0.014, C.black); g.stroke();
      volute(x, y, 1, R); volute(x, y, -1, R);
      g.fillStyle = css(C.red); g.beginPath(); g.moveTo(x - sw * 0.2, y + R * 0.2); g.lineTo(x, y + R * 0.95); g.lineTo(x + sw * 0.2, y + R * 0.2); g.closePath(); g.fill();
    }
    fan(x, shaftH + tier * 3 + 0.04, 1, 7, 0.52, 0.07);
  }
  // arcs from capital to capital, a bud on each
  const arcY = shaftH + tier * 2.2;
  for (const x of [cx - P, cx]) {
    line(0.05, C.black); g.beginPath(); g.moveTo(x + 0.42, arcY); g.quadraticCurveTo(x + P / 2, arcY + 1.05, x + P - 0.42, arcY); g.stroke();
    line(0.03, C.white); g.stroke();
    petal(x + P / 2, arcY + 0.5, 0, 0.36, 0.085, C.blue, C.white); petal(x + P / 2, arcY + 0.5, 0.7, 0.24, 0.05, C.white, C.black); petal(x + P / 2, arcY + 0.5, -0.7, 0.24, 0.05, C.white, C.black);
    g.beginPath(); g.arc(x + P / 2, arcY + 0.5, 0.055, 0, Math.PI * 2); g.fillStyle = css(C.yellow); g.fill();
  }
  // 3. band, palmette frieze, band
  const y1 = 80 * ch; band(y1);
  const fy = y1 + 3 * ch, fh = 12 * ch;
  for (let i = -1; i <= 2; i++) {
    const x = (i + 0.5) * (P / 2);
    line(0.06, C.black); g.beginPath(); g.moveTo(x, fy + fh * 0.5); g.bezierCurveTo(x + P * 0.12, fy + fh * 0.95, x + P * 0.38, fy + fh * 0.05, x + P / 2, fy + fh * 0.5); g.stroke();
    line(0.036, C.blue); g.stroke();
    fan(x, fy + fh * 0.5, 1, 7, fh * 0.46, 0.06); fan(x, fy + fh * 0.5, -1, 5, fh * 0.4, 0.055);
  }
  band(fy + fh);
  // 4. the brick grid through the glaze: joints, and a tone per brick
  for (let r = 0; r < FACADE.courses; r++) {
    const off = r % 2 ? 0.5 : 0;
    for (let b = -1; b <= FACADE.bricks; b++) {
      const bi = ((b % FACADE.bricks) + FACADE.bricks) % FACADE.bricks, k = hash2(bi * 2 + (r % 2), r, 321);
      g.fillStyle = k > 0.5 ? `rgba(255,255,255,${(k - 0.5) * 0.2})` : `rgba(0,0,0,${(0.5 - k) * 0.3})`;
      g.fillRect((b + off) * bw, r * ch, bw, ch);
      g.fillStyle = 'rgba(18,22,34,0.55)'; g.fillRect((b + off) * bw - 0.004, r * ch, 0.008, ch);
    }
    g.fillStyle = 'rgba(18,22,34,0.55)'; g.fillRect(0, r * ch - 0.004, P, 0.008);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.name = 'southpalace-throne-facade'; tex.needsUpdate = true;
  return tex;
}
