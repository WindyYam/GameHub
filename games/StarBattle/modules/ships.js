'use strict';

/* =====================================================================
   STEP 3 — THE FLAGSHIPS: texture toolkit → hull lofts (coarse mass) →
            superstructure, deck greebles, turrets, hangar bays, engine bells
   ===================================================================== */

// ---------- texture toolkit ----------
function canvasTex(size, paint, { srgb = true, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true }); paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function pixelFill(g, size, fn) {
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4, c = fn(x / size, y / size, x, y, d[o], d[o + 1], d[o + 2]);
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const cl255 = v => clamp(v, 0, 255);
const TILE = 30;                                  // world units covered by one hull-texture tile

// recursive plating: bsp-split panels with seams, vents, hatches and rivets, then weathering
function hullTexture(base, { grime = .5, tint = [1, 1, 1], accentRows = null } = {}) {
  return canvasTex(1024, (g, S) => {
    g.fillStyle = rgb(base[0], base[1], base[2]); g.fillRect(0, 0, S, S);
    function panel(x, y, w, h) {
      const t = rr(-.13, .13), a = t > 0 ? 255 : 0;
      g.fillStyle = `rgba(${a},${a},${a},${Math.abs(t)})`; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2.5; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      g.strokeStyle = 'rgba(255,255,255,.17)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 4, y + h - 4); g.lineTo(x + 4, y + 4); g.lineTo(x + w - 4, y + 4); g.stroke();
      const r = rand();
      if (r < .14 && w > 50 && h > 50) {                          // vent slits
        const n = 3 + (rand() * 5 | 0); g.fillStyle = 'rgba(0,0,0,.5)';
        for (let i = 0; i < n; i++) g.fillRect(x + w * .18, y + h * (.2 + i * .6 / n), w * .64, 3);
      } else if (r < .24 && w > 50 && h > 50) {                   // hatch
        g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2; g.strokeRect(x + w * .25, y + h * .25, w * .5, h * .5);
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + w * .25 + 2, y + h * .25 + 2, w * .5 - 4, 3);
      } else if (r < .34) {                                       // rivet row
        g.fillStyle = 'rgba(0,0,0,.4)'; for (let i = 0; i < w - 14; i += 11) g.fillRect(x + 9 + i, y + h - 9, 2.5, 2.5);
      } else if (r < .38 && accentRows) {                         // painted stripe
        g.fillStyle = accentRows; g.fillRect(x + 4, y + h * .42, w - 8, h * .16);
      }
    }
    function split(x, y, w, h, d) {
      if (d < 5 && w > 64 && h > 64 && (d < 2 || rand() < .62)) {
        if (w > h) { const c = rr(.36, .64) * w; split(x, y, c, h, d + 1); split(x + c, y, w - c, h, d + 1); }
        else { const c = rr(.36, .64) * h; split(x, y, w, c, d + 1); split(x, y + c, w, h - c, d + 1); }
      } else panel(x, y, w, h);
    }
    split(0, 0, S, S, 0);
    pixelFill(g, S, (u, v, x, y, r, gg, b) => {
      const n = fbm(u * 8, v * 8, 4, 31, 8, 8), st = fbm(u * 48, v * 4, 3, 41, 48, 4), dust = fbm(u * 90, v * 90, 2, 51, 90, 90);
      const m = (.78 + n * .5) * (1 - Math.max(0, st - .55) * grime * 1.6) * (.92 + dust * .16);
      return [cl255(r * m * tint[0]), cl255(gg * m * tint[1]), cl255(b * m * tint[2])];
    });
  });
}
// lit windows: sparse rows of tiny lights (emissive map)
function windowTexture(cols, density) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < 64; r++) {
      if (rand() > density) continue;
      const y = r * 8 + 2, run = 3 + (rand() * 20 | 0), c = pick(cols); let x = rr(0, S - 120);
      for (let i = 0; i < run; i++) { if (rand() < .82) { g.fillStyle = c; g.fillRect(x + i * 7, y, 5, 3); } }
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = pick(cols); g.fillRect(rr(0, S), rr(0, S), 9, 4); }
  });
}
// derive a tangent-space normal map and a packed roughness (G) / metalness (B) map from the plating albedo:
// seams and grime read as recessed, rough, bare metal; fresh paint stays smooth and dielectric
function deriveHullMaps(albedo, { rough = .5, metal = .3, relief = 2.6 } = {}) {
  const S = albedo.image.width, src = albedo.image.getContext('2d').getImageData(0, 0, S, S).data;
  const H = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) H[i] = (src[i * 4] * .299 + src[i * 4 + 1] * .587 + src[i * 4 + 2] * .114) / 255;
  const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
  const normal = canvasTex(S, (g) => {
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * .25;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * .25;
      let nx = -dx * relief * 4, ny = dy * relief * 4, nz = 1; const il = 1 / Math.hypot(nx, ny, nz);
      const o = (y * S + x) * 4; d[o] = (nx * il * .5 + .5) * 255; d[o + 1] = (ny * il * .5 + .5) * 255; d[o + 2] = (nz * il * .5 + .5) * 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  const orm = canvasTex(S, (g) => {
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const l = H[y * S + x], w = fbm(x / S * 24, y / S * 24, 3, 77, 24, 24);
      const r = clamp(rough * .72 + .75 * (1 - l) * (1 - l) + (w - .5) * .3, .12, 1);
      const m = clamp(metal + (.5 - l) * .9 + (w - .5) * .2, .04, .9);
      const o = (y * S + x) * 4; d[o] = 255; d[o + 1] = r * 255; d[o + 2] = m * 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  return { normal, orm };
}
const TEX = {
  hullA: hullTexture([158, 163, 172], { grime: .55, tint: [1, 1.01, 1.04], accentRows: 'rgba(170,30,26,.85)' }),
  hullB: hullTexture([84, 87, 98], { grime: .8, tint: [1, 1.0, 1.08], accentRows: 'rgba(210,110,30,.7)' }),
  winA: windowTexture(['#ffe8b8', '#cfe6ff', '#ffd08a'], .45),
  winB: windowTexture(['#7fc4ff', '#ff6a4a', '#a8e0ff'], .5)
};
TEX.mapsA = deriveHullMaps(TEX.hullA, { rough: .5, metal: .22 });
TEX.mapsB = deriveHullMaps(TEX.hullB, { rough: .55, metal: .4 });

// ---------- geometry kit: merge many parts into one mesh with vertex colours + box-projected UVs ----------
const BOXG = new THREE.BoxGeometry(1, 1, 1), SPHG = new THREE.SphereGeometry(1, 16, 12), CYLG = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const COL = { W: [1, 1, 1], RED: [1.5, .16, .12], DARK: [.32, .34, .4], LT: [1.3, 1.3, 1.35], BLK: [.12, .12, .15], ORG: [1.3, .5, .15] };
function makeKit() {
  const hull = [], glow = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = V3(), S = V3();
  function push(list, geo, m, col) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m); g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new Float32Array(n * 3), e = m.elements;
    const v = list === hull ? 1 + .16 * Math.sin(e[12] * .085 + e[14] * .045) * Math.sin(e[14] * .06 - e[12] * .05 + 2) : 1;   // slow tonal patches across the hull
    for (let i = 0; i < n; i++) { c[i * 3] = col[0] * v; c[i * 3 + 1] = col[1] * v; c[i * 3 + 2] = col[2] * v; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); list.push(g);
  }
  const mat = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), S.set(sx, sy, sz)).clone();
  const K = {
    box(w, h, d, x, y, z, col = COL.W, rx = 0, ry = 0, rz = 0) { push(hull, BOXG, mat(x, y, z, w, h, d, rx, ry, rz), col); },
    sph(r, x, y, z, col = COL.W, sx = 1, sy = 1, sz = 1) { push(hull, SPHG, mat(x, y, z, r * sx, r * sy, r * sz), col); },
    // cylinder along Y (default) — rx = PI/2 turns it along Z
    cyl(r, h, x, y, z, col = COL.W, rx = 0, ry = 0, rz = 0, rTop = 1) { const g = new THREE.CylinderGeometry(r * rTop, r, h, 14, 1); push(hull, g, mat(x, y, z, 1, 1, 1, rx, ry, rz), col); },
    gbox(w, h, d, x, y, z, col, rx = 0, ry = 0, rz = 0) { push(glow, BOXG, mat(x, y, z, w, h, d, rx, ry, rz), col); },
    gcyl(r, h, x, y, z, col, rx = 0) { push(glow, CYLG, mat(x, y, z, r, h, r, rx, 0, 0), col); },
    gsph(r, x, y, z, col) { push(glow, SPHG, mat(x, y, z, r, r, r), col); },
    // loft: sections [{z, pts:[[x,y]..]}] with identical, counter-clockwise rings (seen from +z)
    loft(sections, col = COL.W) {
      const pos = [], n = sections[0].pts.length, tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      const at = (i, j) => { const s = sections[i], p = s.pts[j % n]; return [p[0], p[1], s.z]; };
      for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < n; j++) { const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j); tri(a, b, c); tri(a, c, d); }
      const cap = (i, flip) => {
        const s = sections[i]; const cx = s.pts.reduce((a, p) => a + p[0], 0) / n, cy = s.pts.reduce((a, p) => a + p[1], 0) / n, c = [cx, cy, s.z];
        for (let j = 0; j < n; j++) { const a = at(i, j), b = at(i, j + 1); flip ? tri(c, b, a) : tri(c, a, b); }
      };
      cap(0, true); cap(sections.length - 1, false);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      push(hull, g, new THREE.Matrix4(), col);
    },
    geometry() { return finish(hull); },
    glowGeometry() { return glow.length ? finish(glow, true) : null; }
  };
  function finish(list, noUV) {
    const g = THREE.BufferGeometryUtils.mergeBufferGeometries(list, false);
    if (noUV) return g;
    const p = g.attributes.position, nrm = g.attributes.normal, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let u, v; if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
      uv[i * 2] = u / TILE; uv[i * 2 + 1] = v / TILE;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
  }
  return K;
}
// hexagonal hull ring (counter-clockwise): keel · chine · deck edge
const ring = (w, yt, yb, topF = .62, botF = .6, midT = .5) => { const ym = yb + (yt - yb) * midT; return [[w * botF, yb], [w, ym], [w * topF, yt], [-w * topF, yt], [-w, ym], [-w * botF, yb]]; };
function secInterp(sec) {      // rows [z, halfWidth, deckY, keelY]
  return z => {
    let i = 0; while (i < sec.length - 2 && z > sec[i + 1][0]) i++;
    const a = sec[i], b = sec[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    return { w: lerp(a[1], b[1], t), yt: lerp(a[2], b[2], t), yb: lerp(a[3], b[3], t) };
  };
}

// ---------- shared materials ----------
const mkHullMat = (map, maps, win, clearcoat, envI) => new THREE.MeshPhysicalMaterial({
  map, normalMap: maps.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: maps.orm, metalnessMap: maps.orm, roughness: 1, metalness: 1,
  emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.2, vertexColors: true,
  clearcoat, clearcoatRoughness: .32, envMapIntensity: envI
});
const HULL_MAT = { A: mkHullMat(TEX.hullA, TEX.mapsA, TEX.winA, .45, 1.5), B: mkHullMat(TEX.hullB, TEX.mapsB, TEX.winB, .18, 2.0) };
const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });

// ---------- turrets: one merged head geometry per size; yaw/pitch driven at run time ----------
function turretGeometry(size, barrels) {
  const K = makeKit(), s = size;
  K.box(1.9 * s, .95 * s, 2.4 * s, 0, .1 * s, -.1 * s, COL.W);
  K.box(1.5 * s, .5 * s, 1.1 * s, 0, .6 * s, -.5 * s, COL.DARK);
  const bw = barrels === 3 ? [-.62, 0, .62] : [-.42, .42];
  for (const bx of bw) { K.cyl(.2 * s, 3.8 * s, bx * s, .15 * s, 2.4 * s, COL.DARK, Math.PI / 2); K.cyl(.28 * s, .5 * s, bx * s, .15 * s, 4.3 * s, COL.BLK, Math.PI / 2); }
  return { geo: K.geometry(), muzzles: bw.map(bx => V3(bx * s, .15 * s, 4.7 * s)) };
}
const TUR_GEO = { s1: turretGeometry(1, 2), s15: turretGeometry(1.5, 2), s2: turretGeometry(2.1, 3) };

// themed deck districts (silo clusters, pipe runs, landing pads, antenna fields, domes, block stacks) so detail clumps like a designed hull
function deckDistricts(K, { top, hw, clear, z0, z1, n }) {
  const kinds = ['blocks', 'silos', 'pipes', 'pads', 'masts', 'domes'];
  for (let d = 0; d < n; d++) {
    const cz = rr(z0, z1), cx = rr(-1, 1) * hw(cz) * .75, yaw = rr(-.25, .25), kind = pick(kinds), col = pick([COL.W, COL.W, COL.LT, COL.DARK]);
    const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const ok = (x, z, m = 0) => Math.abs(x) < hw(z) * .94 && !clear(x, z, m);
    if (kind === 'blocks') {
      const H = rr(1.2, 3.4), cols = 2 + (rand() * 3 | 0), rows = 2 + (rand() * 3 | 0), cw = rr(2.6, 4.2), cd = rr(3, 5);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (rand() < .18) continue;
        const [x, z] = at((i - cols / 2) * cw, (j - rows / 2) * cd); if (!ok(x, z, 1.5)) continue;
        const h = H * rr(.55, 1.25) * (i === cols >> 1 ? 1.4 : 1);
        K.box(cw * .86, h, cd * .86, x, top(z) + h / 2 - .05, z, col, 0, yaw, 0);
        if (rand() < .3) K.box(cw * .4, h * .35, cd * .4, x, top(z) + h * 1.15, z, COL.DARK, 0, yaw, 0);
      }
    } else if (kind === 'silos') {
      const n2 = 3 + (rand() * 6 | 0), r = rr(.8, 1.6), h = rr(1.2, 3.2);
      for (let i = 0; i < n2; i++) {
        const [x, z] = at(((i >> 1) - n2 / 4) * r * 2.8, (i & 1) * r * 2.8); if (!ok(x, z, r + 1)) continue;
        const hh = h * rr(.7, 1.3), y0 = top(z);
        K.cyl(r, hh, x, y0 + hh / 2 - .05, z, col); K.cyl(r * .78, .35, x, y0 + hh + .1, z, COL.LT);
        if (rand() < .2) K.gcyl(r * .6, .12, x, y0 + hh + .3, z, pick([[3, .4, .3], [.4, 1.6, 3]]));
      }
    } else if (kind === 'pipes') {
      const lines = 2 + (rand() * 3 | 0), L = rr(10, 26), pr = rr(.25, .5), gap = pr * 3.2;
      for (let sg = -L / 2; sg < L / 2; sg += 3) {
        for (let i = 0; i < lines; i++) {
          const [x, z] = at((i - (lines - 1) / 2) * gap, sg + 1.5); if (!ok(x, z, .5)) continue;
          K.cyl(pr, 3.05, x, top(z) + pr * 1.2, z, col, Math.PI / 2, yaw);
        }
        if (Math.abs(sg % 6) < .01) { const [x, z] = at(0, sg + 1.5); if (ok(x, z, .5)) K.box(lines * gap + .4, pr * 1.1, .6, x, top(z) + pr * .5, z, COL.DARK, 0, yaw, 0); }
      }
    } else if (kind === 'pads') {
      const w = rr(6, 12), dd = rr(8, 14), [x, z] = at(0, 0); if (!ok(x, z, Math.max(w, dd) * .45)) continue;
      const y0 = top(z);
      K.box(w, .5, dd, x, y0 + .2, z, COL.DARK, 0, yaw, 0); K.box(w * .8, .1, dd * .8, x, y0 + .5, z, col, 0, yaw, 0);
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [gx, gz] = at(lx * w * .46, lz * dd * .46); K.gbox(.4, .25, .4, gx, y0 + .55, gz, [3, .5, .3]); }
    } else if (kind === 'masts') {
      const m = 6 + (rand() * 10 | 0);
      for (let i = 0; i < m; i++) {
        const [x, z] = at(rr(-7, 7), rr(-7, 7)); if (!ok(x, z, 1)) continue;
        const h = rr(1.5, 6.5), y0 = top(z);
        K.box(.8, .3, .8, x, y0 + .1, z, COL.DARK, 0, yaw, 0); K.cyl(rr(.06, .16), h, x, y0 + h / 2, z, COL.DARK);
        if (rand() < .2) K.gsph(.14, x, y0 + h + .1, z, [3, .4, .3]);
      }
    } else {
      const n2 = 1 + (rand() * 3 | 0);
      for (let i = 0; i < n2; i++) {
        const [x, z] = at(i * 6, rr(-2, 2)), r = rr(1.4, 3); if (!ok(x, z, r + 1)) continue;
        const y0 = top(z); K.cyl(r * 1.1, .8, x, y0 + .35, z, COL.DARK); K.sph(r, x, y0 + .7, z, COL.LT, 1, .75, 1);
        if (rand() < .5) K.cyl(.12, r * 1.6, x + r * .4, y0 + r * 1.2, z, COL.DARK);
      }
    }
  }
}
// fine panel detail, thinned into patches so bare plateaus separate the busy areas
function deckDetail(K, { top, hw, clear, z0, z1, n, lights }) {
  for (let i = 0; i < n; i++) {
    const z = rr(z0, z1), x = rr(-1, 1) * hw(z) * .94; if (clear(x, z)) continue;
    if (Math.sin(z * .11 + x * .05) * Math.sin(z * .043 - x * .09 + 1.7) < -.15 && rand() < .85) continue;
    const w = rr(.7, 3.4), d = rr(.7, 4.2), h = rr(.2, 1.3), b = rr(.75, 1.2);
    K.box(w, h, d, x, top(z) + h / 2 - .05, z, [b, b, b * 1.03]);
    if (rand() < .06) K.gbox(.35, .35, .35, x, top(z) + h + .2, z, pick(lights));
  }
}

const SHIPS = [];
function finishShip(K, spec) {
  const root = new THREE.Group();
  const hullMesh = new THREE.Mesh(K.geometry(), HULL_MAT[spec.key]); hullMesh.castShadow = hullMesh.receiveShadow = true; root.add(hullMesh);
  const gg = K.glowGeometry(); if (gg) { const gm = new THREE.Mesh(gg, GLOW_MAT); root.add(gm); }
  const ship = { key: spec.key, root, hullMesh, turrets: [], engines: spec.engines, hangar: spec.hangar, len: spec.len, hw: spec.hw, top: spec.top, sec: spec.sec };
  for (const t of spec.turrets) {
    const tg = TUR_GEO[t.size];
    const m = new THREE.Mesh(tg.geo, HULL_MAT[spec.key]); m.castShadow = true; m.receiveShadow = true;
    m.position.set(t.x, t.y, t.z); m.rotation.order = 'YXZ'; m.rotation.set(-.2, t.yaw || 0, 0); root.add(m);
    ship.turrets.push({ obj: m, muzzles: tg.muzzles, cd: rr(0, 3), yaw: t.yaw || 0, pitch: -.2, size: t.size, main: t.size === 's2' });
  }
  SHIPS.push(ship); scene.add(root);
  return ship;
}

// ---------- SHIP A — the loyal wedge cruiser (pale hull, red livery, tall bridge tower) ----------
function buildShipA() {
  const K = makeKit();
  const sec = [[-88, 21, 9, -8], [-70, 26, 8.5, -7.5], [-30, 24, 7, -6], [20, 15, 5, -4], [70, 5.5, 3, -2], [100, 1.2, 1.6, -1]];
  const S = secInterp(sec), TF = .62;
  K.loft(sec.map(r => ({ z: r[0], pts: ring(r[1], r[2], r[3], TF, .72, .55) })));
  const top = z => S(z).yt, hw = z => S(z).w * TF;
  const turrets = [], engines = [];

  // flank livery bands — irregular lengths and gaps
  for (const sx of [-1, 1]) for (let z = -78; z < 60; z += rr(12, 27)) {
    if (rand() < .2) continue;
    K.box(.5, rr(2.6, 4), rr(7, 15), sx * (S(z).w + .15) * .98, S(z).yb + (S(z).yt - S(z).yb) * .5, z, COL.RED, 0, 0, sx * -.18);
  }

  // tower complex
  const tb = top(-52);
  K.box(26, 4, 34, 0, tb + 2, -52); K.box(17, 4, 24, 0, tb + 6, -53); K.box(11, 4, 14, 0, tb + 10, -54);
  K.box(7, 5, 7, 0, tb + 14.5, -55); K.box(26, 2.6, 5.5, 0, tb + 18.4, -55.5); K.box(14, 1.2, 8, 0, tb + 20.1, -55.5, COL.LT);
  K.gbox(26.2, .5, .15, 0, tb + 18.5, -52.7, [2.6, 2.2, 1.6]);
  K.gbox(15, .3, .15, 0, tb + 14.8, -51.45, [1.2, 1.7, 2.6]);
  for (const sx of [-1, 1]) {
    K.sph(3.2, sx * 9.5, tb + 21.2, -56, COL.LT, 1, .8, 1); K.cyl(.9, 3, sx * 9.5, tb + 19.7, -56, COL.DARK);
    K.sph(2.3, sx * 7.5, tb + 8.8, -66, COL.LT, 1, .9, 1);
    K.box(2.4, 5, 9, sx * 14.2, tb + 3, -52, COL.DARK); K.box(4, 2, 12, sx * 11, tb + 5, -62, COL.W);
    K.cyl(.22, 12, sx * 3, tb + 26, -56, COL.DARK); K.cyl(.12, 8, sx * 6, tb + 24, -58, COL.DARK);
    K.gbox(.5, .5, .5, sx * 3, tb + 32.2, -56, [3, .3, .3]);
  }
  K.cyl(.3, 14, 0, tb + 27.5, -57, COL.DARK);
  K.cyl(2.6, .6, 0, tb + 22.4, -53, COL.LT); K.box(.2, 3, 4.8, 0, tb + 24.2, -53, COL.DARK);

  // hangar bay — open dorsal well, glowing floor, framed walls
  const hz = 4, hl = 30, hww = 11.5, hy = top(hz);
  K.gbox(hww, .35, hl, 0, hy + .25, hz, [1.5, 1.25, .95]);
  for (const sx of [-1, 1]) { K.box(1.3, 2.8, hl + 2, sx * (hww / 2 + .9), hy + 1.3, hz, COL.W); K.gbox(.18, .18, hl - 2, sx * (hww / 2 - .1), hy + 2, hz, [.8, 1.8, 3]); }
  K.box(hww + 3, 3.2, 1.4, 0, hy + 1.5, hz - hl / 2 - .5, COL.DARK); K.gbox(hww, .4, .2, 0, hy + 2.4, hz - hl / 2 + .3, [3, 2, 1]);
  for (let z = hz - hl / 2 + 4; z < hz + hl / 2; z += 5) K.gbox(hww * .8, .1, .25, 0, hy + .46, z, [2.4, 2.1, 1.5]);
  const hangar = { pos: V3(0, hy + 1.6, hz + hl / 2 - 3), dir: V3(0, .12, 1).normalize() };

  // turrets first (spread out, asymmetric), then detail that steers around them
  const baseClear = (x, z, m = 0) => (Math.abs(x) < hww / 2 + 2.6 + m && z > hz - hl / 2 - 3 && z < hz + hl / 2 + 3) || (Math.abs(x) < 17 + m && z < -34 + m && z > -72 - m);
  const addTur = (x, z, size, yaw = 0) => {
    if (baseClear(x, z, 1) || turrets.some(t => Math.hypot(t.x - x, t.z - z) < 5.5)) return;
    const y = top(z) + .55; K.cyl(size === 's2' ? 2.2 : size === 's15' ? 1.7 : 1.3, .9, x, y - .2, z, COL.DARK); turrets.push({ x, y: y + .55, z, size, yaw });
  };
  addTur(-6, -26, 's2'); addTur(6, -26, 's2'); addTur(0, 64, 's1'); addTur(0, 78, 's1');
  for (let z = -22; z < 72; z += rr(5, 10)) for (const sx of [-1, 1]) {
    const h = hw(z);
    if (rand() < .85) addTur(sx * h * rr(.72, .9), z + rr(-2, 2), rand() < .25 ? 's1' : 's15', sx * 1.3);
    if (rand() < .55) addTur(sx * h * rr(.25, .5), z + rr(3, 9), 's1', sx * 1.1);
  }
  const clear = (x, z, m = 0) => baseClear(x, z, m) || turrets.some(t => Math.abs(t.x - x) < 4.5 + m && Math.abs(t.z - z) < 4.5 + m);
  // dorsal livery panels
  for (let z = -26; z < 74; z += rr(7, 14)) for (const sx of [-1, 1]) {
    if (rand() < .22) continue;
    const len = rr(5, 10), zc = z + len / 2, h = hw(zc) * .92, x1 = sx * h * rr(.5, .7), x2 = sx * h * rr(.15, .3);
    if (!clear(x1, zc, 1)) K.box(rr(1.8, 3), .22, len, x1, top(zc) + .1, zc, COL.RED);
    if (rand() < .6 && !clear(x2, zc, 1)) K.box(rr(.8, 1.4), .24, len * rr(.6, 1), x2, top(zc) + .12, zc, COL.RED);
  }
  deckDistricts(K, { top, hw, clear, z0: -84, z1: 86, n: 34 });
  deckDetail(K, { top, hw, clear, z0: -84, z1: 90, n: 320, lights: [[3, .4, .3], [.4, 1.6, 3], [3, 2.6, 1.6]] });
  // flank greebles on the sloped side walls
  for (let i = 0; i < 160; i++) {
    const z = rr(-84, 90), sx = rand() < .5 ? -1 : 1, s = S(z), t = rr(.05, .95), ym = s.yb + (s.yt - s.yb) * .5;
    if (Math.sin(z * .13 + sx * 2) * Math.sin(z * .05 + 1) < -.15) continue;
    const y = lerp(ym, s.yt, t), x = sx * lerp(s.w, s.w * TF, t);
    K.box(rr(.7, 2.2), rr(.4, 1.4), rr(1, 4.5), x + sx * .3, y, z, pick([COL.W, COL.DARK, COL.LT]), 0, 0, sx * -.4);
  }
  // engines
  const eng = [[-13.5, 0, 3.2], [-6.8, 0, 3.6], [0, 0, 4.4], [6.8, 0, 3.6], [13.5, 0, 3.2], [-9, -5, 2.2], [9, -5, 2.2]];
  for (const [x, y, r] of eng) {
    const z0 = -88; K.cyl(r, 7, x, y, z0 - 2.5, COL.DARK, Math.PI / 2, 0, 0, 1.18); K.cyl(r * 1.25, 1.2, x, y, z0 - .6, COL.W, Math.PI / 2);
    K.gcyl(r * .9, .3, x, y, z0 - 6, [1.2, 2.2, 4.8], Math.PI / 2);
    engines.push({ pos: V3(x, y, z0 - 6.2), r });
  }
  K.box(46, 3, 3, 0, 3.5, -89.5, COL.DARK);
  return finishShip(K, { key: 'A', engines, hangar, turrets, len: 188, hw, top, sec: S });
}

// ---------- SHIP B — the dark dreadnought (blunt, layered, orange-lit) ----------
function buildShipB() {
  const K = makeKit();
  const sec = [[-104, 30, 17, -15], [-84, 34, 16, -14], [-24, 28, 10, -11], [40, 18, 6.5, -7.5], [96, 8, 3.8, -4], [120, 1.6, 2.2, -2]];
  const S = secInterp(sec), TF = .78;
  K.loft(sec.map(r => ({ z: r[0], pts: ring(r[1], r[2], r[3], TF, .62, .5) })), [1, 1, 1]);
  const top = z => S(z).yt, hw = z => S(z).w * TF;
  const turrets = [], engines = [];

  // stepped armour shelves along both flanks
  for (const sx of [-1, 1]) for (let z = -92; z < 92; z += rr(7, 15)) {
    if (rand() < .15) continue;
    const s = S(z), h = (s.yt - s.yb), L = rr(6, 12.5), j = rr(-.06, .06);
    K.box(rr(2, 2.8), h * rr(.12, .2), L, sx * (s.w * .93), s.yb + h * (.72 + j), z, COL.W, 0, 0, sx * -.32);
    K.box(2.2, h * rr(.1, .14), L, sx * (s.w * .96), s.yb + h * (.42 + j), z, COL.DARK, 0, 0, sx * -.32);
    if (rand() < .7) K.gbox(.3, .2, L * .7, sx * (s.w * .94 + 1), s.yb + h * (.56 + j), z, [1.9, .55, .14], 0, 0, sx * -.3);
  }
  // central dorsal trench lit from below
  for (const sx of [-1, 1]) K.box(2.2, 1.6, 150, sx * 6.2, top(0) + .6, 10, COL.BLK);
  K.gbox(.7, .15, 150, 0, top(0) + .12, 10, [1.5, .5, .12]);

  // command citadel — three-tier tower at the stern
  const tb = top(-76);
  K.box(46, 6, 44, 0, tb + 3, -78); K.box(36, 6, 34, 0, tb + 9, -80); K.box(26, 6, 24, 0, tb + 15, -82);
  K.box(14, 8, 14, 0, tb + 22, -84); K.box(34, 3, 7, 0, tb + 27.5, -85, COL.W); K.box(22, 1.6, 9, 0, tb + 30, -85, COL.LT);
  K.gbox(34.2, .6, .15, 0, tb + 27.7, -81.4, [.5, 1.7, 3]); K.gbox(26.2, .5, .15, 0, tb + 15.4, -69.7, [2.3, .8, .2]); K.gbox(36.2, .4, .15, 0, tb + 9.4, -62.9, [1.6, .5, .12]);
  for (const sx of [-1, 1]) {
    K.sph(5.6, sx * 14, tb + 33, -86, COL.LT, 1, .85, 1); K.cyl(1.6, 5, sx * 14, tb + 29.5, -86, COL.DARK);
    K.cyl(.4, 24, sx * 6, tb + 42, -86, COL.DARK); K.sph(1.3, sx * 6, tb + 54.5, -86, COL.LT);
    K.box(5, 10, 18, sx * 25, tb + 6, -88, COL.DARK); K.box(3, 3, 16, sx * 29, tb + 12, -88, COL.W);
    K.gbox(.6, .6, .6, sx * 6, tb + 55.2, -86, [3, .3, .25]);
  }
  K.cyl(.5, 20, 0, tb + 42, -86, COL.DARK);

  // hangar bay
  const hz = 22, hl = 36, hww = 14, hy = top(hz);
  K.gbox(hww, .35, hl, 0, hy + .25, hz, [.8, 1.2, 1.8]);
  for (const sx of [-1, 1]) { K.box(1.6, 3.4, hl + 2, sx * (hww / 2 + 1), hy + 1.5, hz, COL.DARK); K.gbox(.2, .2, hl - 2, sx * (hww / 2 - .1), hy + 2.3, hz, [3, .7, .2]); }
  K.box(hww + 4, 4, 1.6, 0, hy + 1.8, hz - hl / 2 - .5, COL.DARK);
  for (let z = hz - hl / 2 + 4; z < hz + hl / 2; z += 5) K.gbox(hww * .8, .1, .25, 0, hy + .46, z, [.9, 1.5, 2.4]);
  const hangar = { pos: V3(0, hy + 1.8, hz + hl / 2 - 3), dir: V3(0, .12, 1).normalize() };

  // turrets first (spread out, asymmetric), then detail that steers around them
  const baseClear = (x, z, m = 0) => (Math.abs(x) < hww / 2 + 3 + m && z > hz - hl / 2 - 3 && z < hz + hl / 2 + 3) || (Math.abs(x) < 24 + m && z < -54 && z > -104) || (Math.abs(x) < 9 + m && z > -54 && z < 84);
  const addTur = (x, z, size, yaw = 0) => {
    if (baseClear(x, z, 1) || turrets.some(t => Math.hypot(t.x - x, t.z - z) < 6)) return;
    const y = top(z) + .5; K.cyl(size === 's2' ? 2.6 : size === 's15' ? 1.9 : 1.4, 1.1, x, y - .2, z, COL.DARK); turrets.push({ x, y: y + .55, z, size, yaw });
  };
  addTur(-14, -50, 's2'); addTur(14, -50, 's2'); addTur(0, 100, 's1');
  for (let z = -46; z < 96; z += rr(6, 11)) for (const sx of [-1, 1]) {
    const h = hw(z);
    if (rand() < .85) addTur(sx * h * rr(.72, .88), z + rr(-2, 2), z < 0 && rand() < .3 ? 's2' : 's15', sx * 1.4);
    if (rand() < .5) addTur(sx * h * rr(.3, .58), z + rr(4, 9), 's1', sx * 1.2);
  }
  const clear = (x, z, m = 0) => baseClear(x, z, m) || turrets.some(t => Math.abs(t.x - x) < 5 + m && Math.abs(t.z - z) < 5 + m);
  deckDistricts(K, { top, hw, clear, z0: -96, z1: 100, n: 38 });
  deckDetail(K, { top, hw, clear, z0: -100, z1: 112, n: 380, lights: [[3, .4, .3], [3, 1.4, .3], [.4, 1.6, 3]] });
  for (let i = 0; i < 180; i++) {
    const z = rr(-100, 112), sx = rand() < .5 ? -1 : 1, s = S(z), t = rr(.05, .95), ym = s.yb + (s.yt - s.yb) * .5;
    if (Math.sin(z * .12 + sx * 2) * Math.sin(z * .05 + 1) < -.15) continue;
    const y = lerp(ym, s.yt, t), x = sx * lerp(s.w, s.w * TF, t);
    K.box(rr(.8, 2.4), rr(.5, 1.6), rr(1.2, 5), x + sx * .3, y, z, pick([COL.W, COL.DARK, COL.LT]), 0, 0, sx * -.3);
  }

  // engines — eight bells in two rows
  const eng = [-24, -17, -10, -3.5, 3.5, 10, 17, 24];
  for (let i = 0; i < eng.length; i++) {
    const x = eng[i], y = (i % 2 ? 6 : -4), r = (i % 2 ? 3.1 : 3.8), z0 = -104;
    K.cyl(r, 7, x, y, z0 - 2.5, COL.DARK, Math.PI / 2, 0, 0, 1.18); K.cyl(r * 1.25, 1.2, x, y, z0 - .6, COL.W, Math.PI / 2);
    K.gcyl(r * .9, .3, x, y, z0 - 6, [3.6, 1.2, .5], Math.PI / 2);
    engines.push({ pos: V3(x, y, z0 - 6.2), r });
  }
  K.box(60, 4, 3, 0, 1, -105.5, COL.DARK);
  return finishShip(K, { key: 'B', engines, hangar, turrets, len: 224, hw, top, sec: S });
}

const SHIP_A = buildShipA(), SHIP_B = buildShipB();
// world placement: A (front-left) bears down on B (rear-right); both bank slightly
const SH = { A: { pos: V3(-402, -20, 344), yaw: rad(58), pitch: .05, roll: -.1 }, B: { pos: V3(446, 22, -328), yaw: rad(-52), pitch: -.04, roll: .08 } };
for (const [k, s] of [['A', SHIP_A], ['B', SHIP_B]]) {
  const d = SH[k]; s.base = d; s.root.rotation.order = 'YXZ'; s.root.position.copy(d.pos); s.root.rotation.set(d.pitch, d.yaw, d.roll); s.root.scale.setScalar(1.15);
}
// slow cinematic drift
onFrame((dt, t) => {
  for (const [k, s] of [['A', SHIP_A], ['B', SHIP_B]]) {
    const d = SH[k], ph = k === 'A' ? 0 : 2.4;
    s.root.position.set(d.pos.x + Math.sin(t * .05 + ph) * 3, d.pos.y + Math.sin(t * .11 + ph) * 1.4, d.pos.z + Math.cos(t * .043 + ph) * 3);
    s.root.rotation.set(d.pitch + Math.sin(t * .09 + ph) * .006, d.yaw + Math.sin(t * .03 + ph) * .012, d.roll + Math.sin(t * .07 + ph) * .01);
    s.root.updateMatrixWorld(true);
  }
});
SHIP_A.root.updateMatrixWorld(true); SHIP_B.root.updateMatrixWorld(true);
