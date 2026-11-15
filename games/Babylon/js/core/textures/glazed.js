// js/core/textures/glazed.js — subsystem "glazed": the glazed-brick reliefs of the Ishtar Gate and the
// Processional Way. OWNER: relief artist. Contract: ENGINE.md 5.3; everything added to it: docs/glazed.md.
//
// One atlas (albedo + normal + roughness; 4096 px and 384 texels per metre in the final tier, 2048 px and 192 in draft) holds
//   the aurochs bull and the mushhushshu dragon (each walking left and right, white and ochre),
//   the striding lion (left and right; white with a yellow mane, yellow with a red mane; on turquoise and on lapis),
//   the rosette band, the yellow / white / black checker border, and tileable fields of plain glazed bricks,
// all drawn procedurally on the true brick module (brick 1/3 m, course 2.06/24 m; glazed/module.js), so that
// the joints run through the animals. Panels are laid out on that grid by glazed/panel.js:
//   const p = ctx.glazed.gatePanel({ origin, right, up, width: 6.2, height: 17.3, facing: 'R' });
//   ctx.geom.addStatic(p.material, p.geometry, { castShadow: false });
// Files: glazed/module.js (the grid), paths.js + figures.js (the drawings), atlas.js (pixels), panel.js (layout),
// testscene.js (debug scene, URL flag with=glazedtest), filmscene.js (debug scene with=glazedfilm: the gate and the
// lion street dressed at their true places, for the film's own cameras), dev/ (stand-alone atlas preview).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { BRICK, HB, COURSE, FIGURES, BANDS, COURSES, COURSE_STRIP, GATE_SOCLE, GATE_ROW, LION_FRIEZE, groundOf } from './glazed/module.js';
import { buildAtlas } from './glazed/atlas.js';
import { layoutPanel, quadsToArrays, gateBands, friezeBands, spread } from './glazed/panel.js';
import { buildTestScene } from './glazed/testscene.js';
import { buildFilmScene } from './glazed/filmscene.js';

/**
 * Debug scenes only. The tile batcher (ctx.geom) does not exist yet while glazed is created, so a debug scene that
 * goes through it is built right after the engine's first ctx.update(0): after every subsystem exists, before the
 * world modules build and before geom.finalize(). Deterministic (no timers); never active without a debug flag.
 */
function afterFirstUpdate(ctx, fn) {
  let real = ctx.update, done = false;
  Object.defineProperty(ctx, 'update', {
    configurable: true, enumerable: true,
    get() { return real; },
    set(f) {
      real = typeof f !== 'function' ? f : function update(t, o) {
        const r = f.call(this, t, o);
        if (!done) { done = true; try { fn(); } catch (e) { console.error('[glazed] debug scene failed: ' + ((e && e.stack) || e)); } }
        return r;
      };
    },
  });
}

/** Flip the rows of an RGBA byte image in place (canvas order to texture order: row 0 = bottom). */
function flipRows(a, w, h) {
  const row = w * 4, tmp = new Uint8Array(row);
  for (let y = 0; y < h >> 1; y++) {
    const p = y * row, q = (h - 1 - y) * row;
    tmp.set(a.subarray(p, p + row)); a.copyWithin(p, q, q + row); a.set(tmp, q);
  }
  return a;
}

/**
 * The glaze's own shading, as the material's onBeforeCompile (it runs before the engine's hook chain and leaves
 * every anchor in place: ENGINE.md 6).
 *  1. Specular anti-aliasing: where the relief normals change within a pixel (brick arrises and scales seen from
 *     afar) the lobe is widened by their screen-space variation, so that distant reliefs do not sparkle from frame
 *     to frame.
 *  2. Horizon occlusion of the sky reflection: a glossy wall seen at a grazing angle mirrors the sky just above
 *     the horizon at almost full strength, and the engine's environment knows no walls. In the street and in the
 *     gate that direction is always another wall, so reflections from near the horizon are cut to a third; without
 *     this the sunlit door reveals and tower flanks of the gate turned white from the camera of shot 2.
 * The sun's own highlight is untouched: the reliefs still catch the raking light.
 */
function glazeShading(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
	{ vec3 bGlazeDn = max( abs( dFdx( normal ) ), abs( dFdy( normal ) ) );
	  material.roughness = min( 1.0, material.roughness + 0.6 * max( max( bGlazeDn.x, bGlazeDn.y ), bGlazeDn.z ) ); }`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
	{ vec3 bGlazeR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
	  reflectedLight.indirectSpecular *= mix( 0.3, 1.0, smoothstep( -0.05, 0.5, bGlazeR.y ) ); }`);
}

export async function create(ctx) {
  const pal = ctx.world.palette.materials;
  const draft = !!ctx.quality.draft;
  const A = buildAtlas({ palette: pal, U: draft ? 32 : 64, V: draft ? 16 : 32 });
  const W = A.width, H = A.height, U = A.U, V = A.V;
  A.heightField = null;                                   // the relief height lives on in orm.b
  A.canvas = null;                                        // the flat-colour canvas is not needed any more

  // ---- textures (row 0 = bottom, so v runs up the wall)
  const maxAniso = ctx.renderer && ctx.renderer.capabilities ? ctx.renderer.capabilities.getMaxAnisotropy() : 16;
  const tex = (data, name, srgb) => {
    const t = new THREE.DataTexture(flipRows(data, W, H), W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.name = name; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = Math.min(16, maxAniso); t.flipY = false; t.needsUpdate = true;
    return t;
  };
  const atlas = tex(A.albedo, 'glazed-albedo', true);
  const normalMap = tex(A.normal, 'glazed-normal', false);
  const roughnessMap = tex(A.orm, 'glazed-orm', false);   // r = cavity occlusion, g = roughness, b = relief height

  /**
   * THE glazed material. Geometry needs uv + color (glazed.quad / glazed.panel provide both). Glossy glaze
   * (roughness about 0.2 per brick, from the map), matt joints, relief through the normal map.
   * polygonOffset pulls the skin towards the camera, so it may lie on (or a few cm proud of) the masonry behind it.
   */
  const glaze = (m) => { m.onBeforeCompile = glazeShading; return m; };
  const material = ctx.hooks.register(glaze(new THREE.MeshStandardMaterial({
    name: 'glazed', map: atlas, normalMap, roughnessMap, roughness: 1.0, metalness: 0.0, vertexColors: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  })), { owner: 'glazed', noVariation: true, glazed: true });

  // ---- rectangles
  const rects = {}, cells = {};
  const uvOf = (x0, yTop, x1, yBottom) => ({ u0: x0 / W, v0: 1 - yBottom / H, u1: x1 / W, v1: 1 - yTop / H });
  const pxPerM = { x: U / HB, y: V / COURSE };
  for (const r of A.list) {
    if (r.kind === 'corner') {
      const rec = { ...uvOf(r.cx, r.cy, r.cx + r.cw, r.cy + r.ch), widthM: r.hb * HB, heightM: r.courses * COURSE, hb: r.hb, courses: r.courses, tileU: false, tileV: true };
      rects['corner:L'] = cells['corner:L'] = Object.freeze(rec);
      rects['corner:R'] = cells['corner:R'] = Object.freeze({ ...rec, u0: rec.u1, u1: rec.u0 });   // the same texels, mirrored
    } else if (r.type === 'cell') {
      const F = FIGURES[r.kind];
      // contract window: exactly F.w x F.h, standing on the feet line, centred on the cell
      const ww = F.w * pxPerM.x, wh = F.h * pxPerM.y, x0 = r.cx + (r.cw - ww) / 2, yb = r.cy + r.ch;
      rects[r.key] = Object.freeze({ ...uvOf(x0, yb - wh, x0 + ww, yb), widthM: F.w, heightM: F.h, tileU: false });
      cells[r.key] = Object.freeze({ ...uvOf(r.cx, r.cy, r.cx + r.cw, yb), widthM: F.cellW, heightM: F.cellH, hb: F.hb, courses: F.courses, ground: r.ground, tileU: false });
    } else {
      const rec = Object.freeze({ ...uvOf(0, r.y, W, r.y + r.h), widthM: A.bricksAcross * BRICK, heightM: r.courses * COURSE, courses: r.courses, tileU: true });
      rects[r.key] = rec; cells[r.key] = rec;
    }
  }
  const keyOf = (name, facing, variant) => {
    if (rects[name]) return name;
    if (name === 'corner') return facing === 'R' ? 'corner:R' : 'corner:L';
    const F = FIGURES[name];
    if (!F) throw new Error(`glazed.rect: unknown figure '${name}' (${Object.keys(FIGURES).join(', ')}, rosette, checker, course:<${COURSES.join('|')}>)`);
    return `${name}:${facing === 'R' ? 'R' : 'L'}:${(((variant | 0) % F.variants) + F.variants) % F.variants}`;
  };

  /**
   * UV rectangle of a figure (ENGINE.md 5.3).
   * name: 'bull' | 'dragon' | 'lion' | 'lionUp' (with facing 'L' | 'R' = the way the animal walks as seen by a viewer facing
   * the panel, and variant = colour scheme, see glazed.figures[name].variantNames), 'rosette', 'checker',
   * 'course:<paletteId>', 'corner' (facing 'L' | 'R' = the side of the panel the corner is on).
   * Animals: a window of exactly widthM x heightM (bull 1.5 x 1.1, dragon 1.7 x 1.1, lion 2.0 x 0.95 m) standing on the
   * feet line. Bands and courses: tileU = true, the rect spans the atlas width (10.67 m = 32 bricks) and repeats along u.
   * @returns {{u0,v0,u1,v1,widthM,heightM,tileU}}
   */
  function rect(name, facing = 'L', variant = 0) { return rects[keyOf(name, facing, variant)]; }
  /**
   * The exact grid cell of a figure: bull 9 half bricks x 13 courses (1.5 x 1.116 m), dragon 10 x 13 (1.667 x 1.116),
   * lion 12 x 11 (2.0 x 0.944). @returns {{u0,v0,u1,v1,widthM,heightM,hb,courses,ground,tileU}}
   */
  function cell(name, facing = 'L', variant = 0) { return cells[keyOf(name, facing, variant)]; }

  function toGeometry(arrays) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
    return g;
  }

  /**
   * A UV-mapped panel as a BufferGeometry (position, normal, uv, color) in world space (ENGINE.md 5.3).
   * origin: [x, y, z] of the lower-left corner as seen by the viewer; right, up: unit vectors. The panel faces right x up.
   * Animals: width / height default to the real size. Bands and plain courses (tileU): the texture runs on along the
   * width at true scale; a height below the strip's shows whole courses from its foot, a greater height stacks strips.
   * opts: { facing, variant, width, height }
   */
  function quad(name, origin, right, up, { facing = 'L', variant = 0, width, height } = {}) {
    const r = rect(name, facing, variant);
    const w = width ?? r.widthM, h = height ?? r.heightM;
    const quads = [];
    if (!r.tileU) quads.push({ x0: 0, y0: 0, x1: w, y1: h, sx0: r.u0 * W, sx1: r.u1 * W, syb: (1 - r.v0) * H, syt: (1 - r.v1) * H });
    else {
      const R = A.regions[keyOf(name)], stack = R.courses % 2 === 0 && !R.band;
      const sx1 = (w / HB) * U;
      if (!stack || h <= r.heightM + 1e-9) {
        const t = stack ? Math.min(1, h / r.heightM) : 1;          // bands are never cropped: they keep their own height
        quads.push({ x0: 0, y0: 0, x1: w, y1: h, sx0: 0, sx1, syb: R.y + R.h, syt: R.y + R.h - R.h * t });
      } else {
        for (let y0 = 0, i = 0; y0 < h - 1e-9; y0 += r.heightM, i++) {
          const y1 = Math.min(h, y0 + r.heightM), t = (y1 - y0) / r.heightM, s = 2 * ((i * 19) % A.bricksAcross) * U;
          quads.push({ x0: 0, y0, x1: w, y1, sx0: s, sx1: s + sx1, syb: R.y + R.h, syt: R.y + R.h - R.h * t });
        }
      }
    }
    return toGeometry(quadsToArrays(A, quads, origin, right, up, 0));
  }

  /**
   * A wall panel laid out on the brick grid, as geometry for glazed.material.
   * spec: { origin: [x, y, z] (lower-left corner as seen by the viewer), right, up (unit vectors; default up = +y),
   *         width (m), height (m; default: the bands' own height; taller = plain blue above, shorter = clipped),
   *         bands: [...] (bottom to top, see glazed/panel.js layoutPanel; or gateBands / friezeBands),
   *         phase: 0 | 1 (bond phase of the wall at the left edge), seed: 0 (varies the plain bricks),
   *         corners: 'left' | 'right' | 'both' (the gate's corner edging up that edge, above the socle), cornerFrom: 13,
   *         proud: 0 (metres the skin stands in front of `origin`) }
   * Returns { geometry (near: every brick whole), far (the cheaper version: 2 triangles per animal), material,
   *           width, height, courses, items: [{ figure, facing, variant, x, y, row }] } with x = centre of the figure
   *           along `right` and y = its feet line along `up`, in metres from the origin.
   */
  function panel(spec) {
    if (!spec || !Array.isArray(spec.origin) || !Array.isArray(spec.right) || !(spec.width > 0) || !Array.isArray(spec.bands)) throw new Error('glazed.panel: give { origin, right, width, bands }');
    const up = spec.up || [0, 1, 0];
    const L = layoutPanel(A, spec);
    return {
      geometry: toGeometry(quadsToArrays(A, L.near, spec.origin, spec.right, up, spec.proud || 0)),
      far: toGeometry(quadsToArrays(A, L.far, spec.origin, spec.right, up, spec.proud || 0)),
      material, width: L.width, height: L.height, courses: L.courses, items: L.items,
      triangles: { near: L.near.length * 2, far: L.far.length * 2 },
    };
  }
  /** A face of the Ishtar Gate: glazed.panel with glazed.gateBands (socle, rows of bulls and dragons). opts: panel spec + gateBands options. */
  const gatePanel = (opts) => panel({ ...opts, bands: gateBands(opts) });
  /** A stretch of the lion frieze (3.35 m high): glazed.panel with glazed.friezeBands. opts: panel spec + friezeBands options (`length` = width). */
  const lionFrieze = (opts) => { const width = opts.width ?? opts.length; return panel({ ...opts, width, height: opts.height ?? frieze.height, bands: friezeBands({ ...opts, width }) }); };
  const frieze = { courses: LION_FRIEZE.reduce((s, b) => s + b[1], 0) };
  frieze.height = frieze.courses * COURSE; frieze.feet = 13 * COURSE;

  /**
   * Submit a panel to the tile batcher with both levels of detail: near in [0, switchAt), far beyond.
   * spec: as glazed.panel (or the result of glazed.panel / gatePanel / lionFrieze). opts: { switchAt: 150, far: Infinity,
   * reflect: false, tile, receiveShadow: true }. The skin casts no shadow (the masonry behind it does). Returns the panel.
   */
  function addPanel(spec, { switchAt = 150, far = Infinity, reflect = false, tile, receiveShadow = true } = {}) {
    const p = spec.geometry ? spec : panel(spec);
    const base = { castShadow: false, receiveShadow, reflect, ...(tile ? { tile } : {}) };
    ctx.geom.addStatic(material, p.geometry, { ...base, lod: [0, switchAt] });
    ctx.geom.addStatic(material, p.far, { ...base, lod: [switchAt, far] });
    return p;
  }

  /**
   * Plain glazed bricks on ANY flat outline (spandrels beside an arch, a lintel, a stepped or sloping top), in bond.
   * spec: { origin, right, up (as glazed.panel), ring: [[x, y], ...] (metres along right / up from the origin; a simple
   *         polygon, either winding), ground: 'glazeBlue' | 'glazeBlueDark' | 'glazeTurquoise' | any course id,
   *         phase: 0 | 1, seed: 0, proud: 0 }
   * Use the same origin, right and phase as the panels beside it and the courses and joints run through.
   * Returns a BufferGeometry for glazed.material.
   */
  function fieldShape({ origin, right, up = [0, 1, 0], ring, ground = 'glazeBlue', phase = 0, seed = 0, proud = 0 }) {
    const S = A.regions['course:' + ground];
    if (!S) throw new Error(`glazed.fieldShape: no plain ground '${ground}'`);
    const n = S.courses - (S.courses & 1), NB = A.bricksAcross;
    const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
    let ymin = Infinity, ymax = -Infinity;
    for (const q of pts) { ymin = Math.min(ymin, q[1]); ymax = Math.max(ymax, q[1]); }
    const clipY = (poly, yc, keepAbove) => {       // Sutherland-Hodgman against a horizontal line
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], ia = keepAbove ? a[1] >= yc : a[1] <= yc, ib = keepAbove ? b[1] >= yc : b[1] <= yc;
        if (ia) out.push(a);
        if (ia !== ib) { const t = (yc - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, yc]); }
      }
      return out;
    };
    const nrm = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    const o = [origin[0] + nrm[0] * proud, origin[1] + nrm[1] * proud, origin[2] + nrm[2] * proud];
    const pos = [], nor = [], uv = [];
    const hsh = (i, j) => { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    for (let kc = Math.floor(ymin / COURSE / n) * n; kc * COURSE < ymax; kc += n) {
      let poly = clipY(pts, kc * COURSE, true);
      if (poly.length >= 3) poly = clipY(poly, (kc + n) * COURSE, false);
      if (poly.length < 3) continue;
      const shift = ((kc + phase) & 1) + 2 * Math.floor(hsh(kc, 77) * NB);
      const tris = THREE.ShapeUtils.triangulateShape(poly.map((q) => new THREE.Vector2(q[0], q[1])), []);
      for (const t of tris) {
        const a = poly[t[0]], b = poly[t[1]], c = poly[t[2]];
        const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
        for (const q of ccw ? [a, b, c] : [a, c, b]) {
          pos.push(o[0] + right[0] * q[0] + up[0] * q[1], o[1] + right[1] * q[0] + up[1] * q[1], o[2] + right[2] * q[0] + up[2] * q[1]);
          nor.push(nrm[0], nrm[1], nrm[2]);
          uv.push(((q[0] / HB + shift) * U) / W, 1 - (S.y + S.h - (q[1] / COURSE - kc) * V) / H);
        }
      }
    }
    return toGeometry({ position: new Float32Array(pos), normal: new Float32Array(nor), uv: new Float32Array(uv), color: new Float32Array(pos.length).fill(1) });
  }

  // ---- baked panels
  let canvases = null;
  function atlasCanvases() {
    if (canvases) return canvases;
    canvases = [A.albedo, A.normal, A.orm].map((data) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), img = g.createImageData(W, H), row = W * 4;
      for (let y = 0; y < H; y++) img.data.set(data.subarray((H - 1 - y) * row, (H - y) * row), y * row);   // back to canvas order
      g.putImageData(img, 0, 0);
      return c;
    });
    return canvases;
  }
  /**
   * Bake a panel into textures of its own (for a facade that is cheaper as one quad, or for a distant version).
   * spec: as glazed.panel. opts: { texelsPerMetre: 128, detail: 'near' | 'far' (default: far below 100 texels/m), maxSize: 4096 }.
   * Returns { map, normalMap, roughnessMap (CanvasTextures), material (registered), geometry (one quad, uv 0..1,
   *           placed like the panel), width, height, texelsPerMetre, items }.
   */
  function bakePanel(spec, { texelsPerMetre = 128, detail, maxSize = 4096 } = {}) {
    const L = layoutPanel(A, spec), quads = (detail ?? (texelsPerMetre < 100 ? 'far' : 'near')) === 'far' ? L.far : L.near;
    let tpm = texelsPerMetre;
    tpm = Math.min(tpm, maxSize / L.width, maxSize / L.height);
    const cw = Math.max(1, Math.round(L.width * tpm)), ch = Math.max(1, Math.round(L.height * tpm));
    const src = atlasCanvases();
    const out = src.map((s, i) => {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.fillStyle = i === 0 ? pal.glazeBlue : i === 1 ? 'rgb(128,128,255)' : 'rgb(255,66,20)'; g.fillRect(0, 0, cw, ch);
      const kx = cw / L.width, ky = ch / L.height;
      for (const q of quads) {
        const dy = (L.height - q.y1) * ky, dh = (q.y1 - q.y0) * ky, sy = q.syt, sh = q.syb - q.syt;
        // split where the strip repeats
        if (q.sx1 < q.sx0) {      // mirrored piece (the right-hand corner stripe)
          g.save(); g.translate((q.x0 + q.x1) * kx, 0); g.scale(-1, 1);
          g.drawImage(s, q.sx1, sy, q.sx0 - q.sx1, sh, q.x0 * kx - 0.25, dy - 0.25, (q.x1 - q.x0) * kx + 0.5, dh + 0.5);
          g.restore();
          continue;
        }
        let a = q.sx0, x = q.x0;
        const mPerPx = (q.x1 - q.x0) / (q.sx1 - q.sx0);
        while (a < q.sx1 - 1e-6) {
          const base = Math.floor(a / W + 1e-9) * W, b = Math.min(q.sx1, base + W), dw = (b - a) * mPerPx;
          g.drawImage(s, a - base, sy, b - a, sh, x * kx - 0.25, dy - 0.25, dw * kx + 0.5, dh + 0.5);
          x += dw; a = b;
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.name = `glazed-baked-${['albedo', 'normal', 'orm'][i]}`; t.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = Math.min(16, maxAniso);
      return t;
    });
    const mat = ctx.hooks.register(glaze(new THREE.MeshStandardMaterial({
      name: 'glazed-baked', map: out[0], normalMap: out[1], roughnessMap: out[2], roughness: 1.0, metalness: 0.0, vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    })), { owner: 'glazed', noVariation: true, glazed: true });
    const one = [{ x0: 0, y0: 0, x1: L.width, y1: L.height, sx0: 0, sx1: W, syb: H, syt: 0 }];
    const geometry = toGeometry(quadsToArrays(A, one, spec.origin, spec.right, spec.up || [0, 1, 0], spec.proud || 0));
    return { map: out[0], normalMap: out[1], roughnessMap: out[2], material: mat, geometry, width: L.width, height: L.height, texelsPerMetre: tpm, items: L.items };
  }

  const figures = {};
  for (const [k, f] of Object.entries(FIGURES)) figures[k] = Object.freeze({ ...f });
  const bands = {};
  for (const [k, b] of Object.entries(BANDS)) bands[k] = Object.freeze({ ...b });

  const api = {
    impl: 'real',
    atlas, normalMap, roughnessMap,
    /** Material sampling the atlas (registered with the hook chain). Geometry must carry uv + color. */
    material,
    /** The material to draw a figure with (same names as rect()). One atlas, so always `material`; still: always ask. */
    materialFor: (name) => { rect(name); return material; },
    figures, bands, courses: COURSES.slice(),
    /** All rect keys present in the atlas ('bull:L:0', ..., 'rosette', 'checker', 'course:glazeBlue', ...). */
    keys: () => Object.keys(rects),
    rect, quad,
    /** Texels per metre of the atlas (up the wall; about 3 % more along it). */
    texelsPerMetre: V / COURSE,

    // ---- additions (docs/glazed.md)
    /** The brick grid: brick pitch 1/3 m, half brick 1/6 m, course 2.06/24 m. */
    BRICK, HB, COURSE,
    /** { courses: 13, height: 1.116 } of the gate socle; { animal: 13, plain: 11, courses: 24, height: 2.06 } of a gate row; { courses: 39, height: 3.348, feet: 1.116 } of the lion frieze. */
    socle: Object.freeze({ courses: GATE_SOCLE.reduce((s, b) => s + b[1], 0), height: GATE_SOCLE.reduce((s, b) => s + b[1], 0) * COURSE }),
    row: Object.freeze({ ...GATE_ROW, courses: GATE_ROW.animal + GATE_ROW.plain, height: (GATE_ROW.animal + GATE_ROW.plain) * COURSE }),
    frieze: Object.freeze(frieze),
    /** Height in metres of n courses; the height snapped to whole courses; the length snapped to half bricks. */
    coursesToM: (n) => n * COURSE, snapHeight: (h) => Math.round(h / COURSE) * COURSE, snapLength: (l) => Math.round(l / HB) * HB,
    /** Palette id of the plain ground that continues a figure variant ('glazeBlue', 'glazeTurquoise', 'glazeBlueDark'). */
    groundOf,
    courseStrip: Object.freeze({ ...COURSE_STRIP }),
    cell, panel, gatePanel, lionFrieze, addPanel, bakePanel, fieldShape,
    gateBands, friezeBands, spread,
    /** Atlas facts for debugging: size in px, px per half brick / course, the regions. (Build time: STATS.subsystems.glazed.ms.) */
    info: Object.freeze({ width: W, height: H, U, V, regions: A.list.map((r) => ({ key: r.key, type: r.type, x: r.x, y: r.y, w: r.w, h: r.h })) }),
    debug: null,
  };

  // debug scene: ?with=glazedtest (render.mjs --with glazedtest). The engine also reports that no MODULE of that
  // name exists; that warning is expected.
  const flagged = (name) => (ctx.flags && ctx.flags.with && ctx.flags.with.includes(name)) || (typeof location !== 'undefined' && new RegExp('[?&]' + name + '=1').test(location.search));
  if (flagged('glazedtest')) api.debug = buildTestScene(ctx, api);
  // debug scene 2: ?with=glazedfilm dresses the Ishtar Gate and the lion street at their true places (glazed/filmscene.js)
  if (flagged('glazedfilm')) afterFirstUpdate(ctx, () => { api.debug = { ...(api.debug || {}), film: buildFilmScene(ctx, api) }; });
  return api;
}
