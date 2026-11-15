// js/modules/vegetation/index.js — module "vegetation" (SPEC 3.17, the planting of the garden of 3.9; R5 2.4 / 3.5;
// R4 7.3; GAPS G12): everything that grows. No claims.
//   palms     date palms from 1 to 18.5 m out of ONE unit mesh per level of detail (geo.js): a near palm with 64
//             arching fronds (leaflets on alpha cards), stubs of old frond bases, fruit stalks, a variant with a
//             skirt of dead fronds; a middle palm of 24 frond strips; a far palm of 15 triangles; beyond 1.2 km
//             from the camera path three crowns per instance. Rows in the palm-garden strips of the ground model,
//             groves and gardens of the layout, courts the layout marks, the open strip behind the river quays.
//   trees     Euphrates poplar, willow and tamarisk on earth banks; fig, pomegranate and apple in gardens, courts
//             and under the palms; cypress and juniper in the royal gardens only.
//   reeds     beds on the earth banks of river, moats and unlined canals and on the reed-marsh strips, swaying.
//   gardens   the royal terraced garden on the North Palace (CONJECTURAL) with growth hanging over its walls, the
//             garden west of the South Palace, Ea's garden at Esagila; rows of standing barley and garden crops
//             where the camera comes down over the fields.
// One painted atlas (atlas.js), one matte alpha-tested material. Wind is a vertex shader that is a pure function of
// the film time and ctx.wind, mirrored in the depth material, so shadows sway with their plants.
// Notes: docs/mod-vegetation.md.
import * as M from '../../core/mathx.js';
import { hash2 } from '../../core/rng.js';
import { makeAtlas, ALPHA_TEST } from './atlas.js';
import * as G from './geo.js';

const NEAR = 200, MID = 600;        // palms: full crown below NEAR, 16 frond strips to MID, 15 triangles beyond
const HERO = 180;                   // a full crown only for palms this close to where the camera HOLDS or moves slowly
const MIDR = 350;                   // palms farther than this from the camera path exist as the far palm only
const SINGLE = 1200;                // palms farther than this from the camera path are planted three crowns to an instance
const TREE_NEAR = 240, TREE_HERO = 260;
const REED_NEAR = 350, REED_HERO = 420, REED_END = 2600, REED_REACH = 2000;

// ---- GLSL: the instance puts the crown on its trunk and the wind moves it -----------------------------------------
const VEG_PARS = /* glsl */ `
attribute vec3 aVeg;      // sway (m at wind strength 1), phase, 0 | -1 palm bark | -2 wood | 10 + height above the crown base (crown radii)
uniform float uVegTime;
uniform vec4 uVegWind;    // wind direction (x, z), strength, -
`;
const VEG_BEGIN = /* glsl */ `
#ifdef USE_INSTANCING
{
	vec3 vegS = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
	if ( aVeg.z > 5.0 ) transformed.y += ( aVeg.z - 10.0 ) * vegS.x / vegS.y;
	if ( aVeg.x > 0.0 ) {
		vec2 vegP = instanceMatrix[ 3 ].xz;
		float vegPh = dot( vegP, uVegWind.xy );
		float vegGust = 1.0 + 0.3 * sin( 0.61 * uVegTime - 0.011 * vegPh ) + 0.15 * sin( 1.73 * uVegTime - 0.037 * vegPh + 1.3 );   // = ctx.wind.gust
		float vegA = aVeg.x * uVegWind.z * vegGust;
		float vegW1 = sin( uVegTime * 1.7 + aVeg.y * 6.2832 + vegP.x * 0.37 + vegP.y * 0.23 );
		float vegW2 = sin( uVegTime * 3.1 + aVeg.y * 15.1 + vegP.x * 0.71 - vegP.y * 0.4 );
		vec3 vegD = vec3( uVegWind.x, 0.0, uVegWind.y ) * vegA * ( 0.55 + 0.45 * vegW1 ) + vec3( 0.0, vegA * 0.3 * vegW2, 0.0 );
		transformed += vec3( dot( vegD, instanceMatrix[ 0 ].xyz ), dot( vegD, instanceMatrix[ 1 ].xyz ), dot( vegD, instanceMatrix[ 2 ].xyz ) ) / ( vegS * vegS );
	}
}
#endif
`;
const VEG_NORMAL = /* glsl */ `
#ifdef USE_INSTANCING
	if ( aVeg.z > 5.0 ) objectNormal *= vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
#endif
`;
const VEG_UV = /* glsl */ `
#if defined( USE_MAP ) && defined( USE_INSTANCING )
	if ( aVeg.z < - 0.5 && aVeg.z > - 1.5 ) vMapUv.y *= length( instanceMatrix[ 1 ].xyz );
#endif
`;
// wood keeps its own colour: the instance tint is a LEAF colour; only its brightness reaches the trunk
const VEG_COLOR = /* glsl */ `
#if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
	if ( aVeg.z < - 1.5 ) vColor.xyz = color.xyz * ( 0.62 + 0.45 * clamp( dot( instanceColor.xyz, vec3( 0.3, 0.5, 0.2 ) ), 0.0, 1.0 ) );
#endif
`;
// foliage is lit by its authored normal on both faces (three flips the normal of a back face)
const VEG_FRAG_NORMAL = /* glsl */ `
#ifdef DOUBLE_SIDED
	normal *= faceDirection;
	nonPerturbedNormal = normal;
#endif
`;

function makeMaterials(ctx, atlas) {
  const { THREE, materials } = ctx;
  const uVegWind = { value: new THREE.Vector4(ctx.wind.dir[0], ctx.wind.dir[1], ctx.wind.speed / 2.6, 0) };
  // matte: a glossy card that faces the sky mirrors it at grazing angles and turns white against the light
  const common = { map: atlas.texture, color: 0xffffff, vertexColors: true, alphaTest: ALPHA_TEST, side: THREE.DoubleSide };
  const leaf = new THREE.MeshLambertMaterial({ name: 'vegetation-leaf', ...common });
  const still = new THREE.MeshLambertMaterial({ name: 'vegetation-leaf-static', ...common });
  materials.register(leaf, { owner: 'vegetation', noVariation: true, vegSway: true, vegFoliage: true });
  materials.register(still, { owner: 'vegetation', noVariation: true, vegFoliage: true });
  materials.addHook({
    name: 'vegetation', order: 120,
    filter: (m, info) => !!(info && (info.vegSway || info.vegFoliage)),
    key: (m, info) => (info.vegSway ? 's' : '-') + (info.vegFoliage ? 'f' : '-'),
    shader(shader, m, renderer, patch) {
      const info = materials.info(m) || {};
      if (info.vegSway) {
        patch.uniforms({ uVegTime: materials.uniforms.uBTime, uVegWind });
        patch.vertex.header(VEG_PARS);
        patch.vertex.after('<uv_vertex>', VEG_UV);
        patch.vertex.after('<color_vertex>', VEG_COLOR);
        patch.vertex.after('<beginnormal_vertex>', VEG_NORMAL);
        patch.vertex.after('<begin_vertex>', VEG_BEGIN);
      }
      if (info.vegFoliage) patch.fragment.after('<normal_fragment_begin>', VEG_FRAG_NORMAL);
    },
  });
  // the same vertex work in the shadow pass: the crown must stand on its trunk there too, and sway with it
  const depth = new THREE.MeshDepthMaterial({ name: 'vegetation-depth', depthPacking: THREE.RGBADepthPacking, map: atlas.texture, alphaTest: ALPHA_TEST, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uVegTime = materials.uniforms.uBTime; shader.uniforms.uVegWind = uVegWind;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VEG_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VEG_BEGIN);
  };
  materials.register(depth, { owner: 'vegetation', skipHooks: true });
  return { leaf, still, depth, uVegWind };
}

/**
 * Distance from a ground point to the camera path of the film: at(x, z) on a 100 m grid (3D, the point 2 m above
 * the datum), and slow(x, y, z), exact, to the part of the path where the camera holds or moves slower than 14 m/s
 * (there a palm is looked at; in a flight it is a blur).
 */
function makePathDistance(ctx) {
  const { film } = ctx, pts = [], slowPts = [];
  let prev = null;
  for (let t = 0; t <= film.duration + 1e-6; t += 0.1) {
    const p = film.pathPoseAt(t).pos; pts.push(p[0], p[1] - 2, p[2]);
    const q = film.pathPoseAt(Math.min(film.duration, t + 0.05)).pos, v = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 0.05;
    if (v < 14 || (prev !== null && prev < 14)) slowPts.push(p[0], p[1], p[2]);
    prev = v;
  }
  const X0 = -9200, Z0 = -10200, C = 100, N = 200, grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X0 + i * C, z = Z0 + j * C; let best = 1e18;
    for (let k = 0; k < pts.length; k += 3) { const dx = pts[k] - x, dz = pts[k + 2] - z, d = dx * dx + pts[k + 1] * pts[k + 1] + dz * dz; if (d < best) best = d; }
    grid[j * N + i] = Math.sqrt(best);
  }
  const slow = (x, y, z) => { let best = 1e18; for (let k = 0; k < slowPts.length; k += 3) { const dx = slowPts[k] - x, dy = slowPts[k + 1] - y, dz = slowPts[k + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; } return Math.sqrt(best); };
  const at = (x, z) => {
    const fx = M.clamp((x - X0) / C, 0, N - 1.001), fz = M.clamp((z - Z0) / C, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (grid[j * N + i] * (1 - u) + grid[j * N + i + 1] * u) * (1 - v) + (grid[(j + 1) * N + i] * (1 - u) + grid[(j + 1) * N + i + 1] * u) * v;
  };
  return { at, slow };
}

export default {
  name: 'vegetation',
  claims: [],

  async build(ctx) {
    const { THREE, geom, ground, layout, materials } = ctx;
    const stats = {}, checks = [], draft = ctx.quality.draft;
    const atlas = makeAtlas(ctx), mat = makeMaterials(ctx, atlas), R = atlas.rect;
    const pathD = makePathDistance(ctx);
    const col = new THREE.Color(), m4 = new THREE.Matrix4();
    const tintOf = (r, g, b) => col.setRGB(r, g, b).clone();

    // ================================================================================================ sets =====
    const swaySets = [];
    const inst = (o) => { const s = geom.instanced({ material: mat.leaf, receiveShadow: true, ...o }); swaySets.push(s); return s; };
    const palmGeo = { full: G.palmNear(THREE, R, 'full'), old: G.palmNear(THREE, R, 'old'), mid: G.palmMid(THREE, R), far: G.palmFar(THREE, R), clump: G.palmClump(THREE, R) };
    // Cells: 512 m for the near and middle levels, 1024 m for the far level of the palms that have one, 2048 m for
    // the palms that are only ever far, 8192 m for the three-crown instances: few draw calls in every pass.
    const palm = {
      full: inst({ name: 'veg-palm-near-a', geometry: palmGeo.full, cell: 512, lod: [0, NEAR], lodGrid: [512, 512], shadowTexel: 1.0, reflect: true }),
      old: inst({ name: 'veg-palm-near-b', geometry: palmGeo.old, cell: 512, lod: [0, NEAR], lodGrid: [512, 512], shadowTexel: 1.0, reflect: true }),
      heroMid: inst({ name: 'veg-palm-mid-hero', geometry: palmGeo.mid, cell: 512, lod: [NEAR, MID], lodGrid: [512, 1024], shadowTexel: 1.0, reflect: true }),
      mid: inst({ name: 'veg-palm-mid', geometry: palmGeo.mid, cell: 512, lod: [0, MID], lodGrid: [512, 1024], shadowTexel: 1.0, reflect: true }),
      farBand: inst({ name: 'veg-palm-far-band', geometry: palmGeo.far, cell: 1024, lod: [MID, Infinity], lodGrid: [1024, 1024], shadowTexel: 1.0, reflect: true }),
      far: inst({ name: 'veg-palm-far', geometry: palmGeo.far, cell: 2048, shadowTexel: 1.0, reflect: true }),
      clump: inst({ name: 'veg-palm-clump', geometry: palmGeo.clump, cell: 4096, shadowTexel: 2.5 }),
    };
    const count = { palms: 0, heroPalms: 0, midPalms: 0, suckers: 0, clumps: 0, trees: 0, heroTrees: 0, reeds: 0, heroReeds: 0, courtPalms: 0, cityPalms: 0, tallest: 0, shortest: 99 };
    const sample = [];              // every eighth palm and every hero palm: x, z, in a court, hero (for the checks)

    /** Instance matrix of a palm: crown radius R, trunk height H, leaning by `lean` (tangent of the angle) toward leanAz. */
    const palmMatrix = (x, y, z, Rr, H, rot, lean, leanAz) => {
      const c = Math.cos(rot), s = Math.sin(rot), lx = lean * Math.cos(leanAz), lz = lean * Math.sin(leanAz);
      return m4.set(c * Rr, lx * H, s * Rr, x, 0, H, 0, y, -s * Rr, lz * H, c * Rr, z, 0, 0, 0, 1);
    };
    /**
     * Plant one date palm. k1, k2: integers that make this palm's own random numbers. o: { H, R } to force a size,
     * age: 'garden' | 'city' | 'young'.
     */
    function addPalm(x, y, z, k1, k2, o = {}) {
      const h = (n) => hash2(k1 * 31 + n, k2, 9173);
      let H = o.H, Rr = o.R;
      if (!H) {
        const a = h(1);
        // R5 3.5: 30 % young (2 to 6 m), 50 % mature (8 to 14), 20 % old (15 to 20); a worked garden holds fewer of the youngest
        if (a < (o.age === 'young' ? 0.8 : 0.2)) H = 2.2 + 3.8 * h(2); else if (a < 0.78) H = 7.5 + 6 * h(2); else H = 13.5 + 5 * h(2);
      }
      if (!Rr) Rr = (H < 6 ? 2.7 + 0.14 * H : H < 13.5 ? 3.5 : 3.25) * (0.9 + 0.25 * h(3));
      const d = o.d !== undefined ? o.d : pathD.at(x, z), lean = (h(4) < 0.75 ? 0.07 : 0.2) * h(5) * (H < 5 ? 0.6 : 1);
      const mtx = palmMatrix(x, y, z, Rr, H, h(6) * M.TAU, lean, h(7) * M.TAU);
      const v = 0.86 + 0.26 * h(8), w = h(9), tint = tintOf(v * (0.96 + 0.1 * w), v, v * (1.04 - 0.14 * w));
      const hero = d < MIDR + 40 && pathD.slow(x, y + H, z) < HERO;
      if (hero) { (h(10) < 0.3 || H > 14 ? palm.old : palm.full).add(mtx, tint); palm.heroMid.add(mtx, tint); palm.farBand.add(mtx, tint); count.heroPalms++; }
      else if (d < MIDR) { palm.mid.add(mtx, tint); palm.farBand.add(mtx, tint); count.midPalms++; }
      else palm.far.add(mtx, tint);
      count.palms++;
      if (H > count.tallest) count.tallest = H; if (H < count.shortest) count.shortest = H;
      if ((count.palms & 7) === 0 || hero) sample.push(x, z, o.court ? 1 : 0, hero ? 1 : 0);
      // offshoots: a date palm suckers at its foot; in a worked garden some are left to grow (R5 3.5: "a clump of suckers")
      if (!o.sucker && d < 520 && H > 5 && h(11) < 0.12) {
        const n = h(12) < 0.4 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const a = h(13 + k) * M.TAU, r = 0.75 + 0.5 * h(15 + k), sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
          if (!o.court && !free(sx, sz, 0.3)) continue;
          addPalm(sx, y, sz, k1 * 7 + 3 + k, k2, { H: 1.1 + 1.6 * h(17 + k), R: 1.5 + 0.8 * h(19 + k), d, sucker: true, court: o.court });
          count.suckers++;
        }
      }
      return H;
    }
    function addClump(x, y, z, k1, k2) {
      const h = (n) => hash2(k1 * 31 + n, k2, 5521), H = 7 + 7 * h(1), Rr = 3.3 + 0.8 * h(2), v = 0.7 + 0.22 * h(8), w = h(9);
      palm.clump.add(palmMatrix(x, y, z, Rr, H, h(6) * M.TAU, 0.05 * h(5), h(7) * M.TAU), tintOf(v * (0.96 + 0.1 * w), v, v * (1.04 - 0.14 * w)));
      count.clumps++;
    }

    // ---- the other trees ---------------------------------------------------------------------------------------
    const lin = (hexStr) => { const c = new THREE.Color(hexStr); return [c.r, c.g, c.b]; };
    const LEAFMEAN = 0.6;       // linear mean of the painted leaf textures
    const SPECIES = {
      // mesh, colour, height range (m), width / height
      fig: { mesh: 'broadleaf', col: lin('#4b6b2f'), h: [3.4, 6.0], w: [1.05, 1.35] },
      apple: { mesh: 'broadleaf', col: lin('#5d8238'), h: [3.0, 5.0], w: [0.9, 1.15] },
      poplar: { mesh: 'broadleaf', col: lin(ctx.world.palette.materials.poplar || '#7FA24A'), h: [8, 14], w: [0.5, 0.68] },
      pomegranate: { mesh: 'bushLeaf', col: lin('#5a8336'), h: [2.2, 4.0], w: [0.85, 1.1] },
      shrub: { mesh: 'bushLeaf', col: lin('#62803c'), h: [1.0, 2.0], w: [1.0, 1.5] },
      tamarisk: { mesh: 'bushFeather', col: lin(ctx.world.palette.materials.tamarisk || '#7C8C6A'), h: [3, 6.5], w: [0.95, 1.3] },
      willow: { mesh: 'willow', col: lin('#7c9a48'), h: [5, 9], w: [0.95, 1.2] },
      cypress: { mesh: 'conifer', col: lin(ctx.world.palette.materials.cypressJuniper || '#2E4A2C'), h: [5, 10], w: [0.36, 0.46] },
      juniper: { mesh: 'conifer', col: lin('#37523a'), h: [3.5, 7], w: [0.6, 0.85] },
    };
    const treeGeo = { broadleaf: G.treeBroadleaf(THREE, R), bushLeaf: G.treeBush(THREE, R, 'leaf'), bushFeather: G.treeBush(THREE, R, 'feather'), willow: G.treeWillow(THREE, R), conifer: G.treeConifer(THREE, R), far: G.treeFar(THREE, R) };
    const tree = {};
    for (const k of ['broadleaf', 'bushLeaf', 'bushFeather', 'willow', 'conifer']) tree[k] = inst({ name: 'veg-tree-' + k, geometry: treeGeo[k], cell: 512, lod: [0, TREE_NEAR], lodGrid: [1024, 1024], shadowTexel: 0.6, reflect: true });
    tree.farHero = inst({ name: 'veg-tree-far-hero', geometry: treeGeo.far, cell: 1024, lod: [TREE_NEAR, Infinity], lodGrid: [1024, 1024], shadowTexel: 1.0 });
    tree.far = inst({ name: 'veg-tree-far', geometry: treeGeo.far, cell: 4096, shadowTexel: 1.0 });
    function addTree(kind, x, y, z, k1, k2, o = {}) {
      const sp = SPECIES[kind], h = (n) => hash2(k1 * 37 + n, k2, 2903);
      const H = o.H || M.lerp(sp.h[0], sp.h[1], h(1)), Wd = H * M.lerp(sp.w[0], sp.w[1], h(2)), d = o.d !== undefined ? o.d : pathD.at(x, z);
      const v = (0.84 + 0.3 * h(3)) / LEAFMEAN, w = h(4), tint = tintOf(sp.col[0] * v * (0.92 + 0.2 * w), sp.col[1] * v, sp.col[2] * v * (1.1 - 0.25 * w));
      const t = { x, y, z, rotY: h(5) * M.TAU, sx: Wd, sy: H, sz: Wd * (0.88 + 0.24 * h(6)) };
      if (d < TREE_HERO) { tree[sp.mesh].add(t, tint); tree.farHero.add(t, tint); count.heroTrees++; } else tree.far.add(t, tint);
      count.trees++;
    }

    // ---- reeds ---------------------------------------------------------------------------------------------------
    const reedGeo = { near: G.reedClump(THREE, R, 3, 2), far: G.reedClump(THREE, R, 2, 1) };
    const reed = {
      near: inst({ name: 'veg-reeds-near', geometry: reedGeo.near, cell: 512, lod: [0, REED_NEAR], lodGrid: [512, 1024], shadowTexel: 0.3, reflect: true }),
      farBand: inst({ name: 'veg-reeds-far-band', geometry: reedGeo.far, cell: 1024, lod: [REED_NEAR, REED_END], lodGrid: [1024, 1024], castShadow: false, reflect: true }),
      far: inst({ name: 'veg-reeds-far', geometry: reedGeo.far, cell: 4096, lod: [0, REED_END + 400], lodGrid: [4096, 4096], castShadow: false, reflect: true }),
    };
    function addReed(x, y, z, k1, k2, scale = 1, d = 1e9) {
      const h = (n) => hash2(k1 * 13 + n, k2, 771), w = (0.85 + 0.6 * h(1)) * scale, ht = (0.6 + 0.6 * h(2)) * scale;
      const v = 0.74 + 0.3 * h(3), dry = h(4), tint = tintOf(v * (1 + 0.12 * dry), v, v * (1 - 0.1 * dry));
      const t = { x, y, z, rotY: h(5) * M.TAU, sx: w, sy: ht, sz: w };
      if (d < REED_HERO) { reed.near.add(t, tint); reed.farBand.add(t, tint); count.heroReeds++; } else reed.far.add(t, tint);
      count.reeds++;
    }

    // What other modules have put on open ground and published (all optional: built before this module when they
    // exist): landings and beached boats (riverworks), threshing floors, kilns, pens, shadufs, sluices and road
    // bridges (environs). Nothing is planted on them.
    const obst = new Map(), OC = 48;
    const addObst = (x, z, r) => { if (!(r > 0) || !isFinite(x) || !isFinite(z)) return; for (let i = Math.floor((x - r) / OC); i <= Math.floor((x + r) / OC); i++) for (let j = Math.floor((z - r) / OC); j <= Math.floor((z + r) / OC); j++) { const k = i * 100003 + j; let a = obst.get(k); if (!a) obst.set(k, (a = [])); a.push(x, z, r); } };
    {
      const rw = ctx.modules.riverworks || {}, en = ctx.modules.environs || {};
      for (const m of rw.moorings || []) if (m.kind !== 'quay') addObst(m.x, m.z, (m.length || 8) / 2 + 4);
      for (const l of rw.landings || []) { if (!l.polygon) continue; let r = 0; for (const p of l.polygon) r = Math.max(r, Math.hypot(p[0] - l.center[0], p[1] - l.center[1])); addObst(l.center[0], l.center[1], r + 3); }
      for (const st of rw.stairs || []) if (st.from && st.to) addObst((st.from[0] + st.to[0]) / 2, (st.from[2] + st.to[2]) / 2, Math.hypot(st.to[0] - st.from[0], st.to[2] - st.from[2]) / 2 + (st.width || 2) + 1.5);
      for (const f of en.threshingFloors || []) addObst(f.x, f.z, (f.radius || 10) + 2.5);
      for (const k of en.kilns || []) addObst(k.x, k.z, 8);
      for (const q of en.pens || []) addObst(q.x, q.z, Math.hypot(q.hx || 4, q.hz || 4) + 1.5);
      for (const q of en.shadufs || []) addObst(q.x, q.z, 3);
      for (const q of en.sluices || []) addObst(q[0], q[1], 2.5);
      for (const b of en.bridges || []) addObst(b.x, b.z, (b.length || 12) / 2 + 4);
    }
    const blockedAt = (x, z, r = 0) => { const a = obst.get(Math.floor(x / OC) * 100003 + Math.floor(z / OC)); if (!a) return false; for (let k = 0; k < a.length; k += 3) if (Math.hypot(x - a[k], z - a[k + 1]) < a[k + 2] + r) return true; return false; };
    stats.obstacles = obst.size;
    const free = (x, z, r) => !ground.isWater(x, z) && layout.isFree(x, z, r) && !blockedAt(x, z, r);
    const noise1 = (v, seed) => { const i = Math.floor(v), f = v - i, a = hash2(i, seed, 88), b = hash2(i + 1, seed, 88), t = f * f * (3 - 2 * f); return a + (b - a) * t; };
    const density = draft ? 0.3 : 1;            // the draft tier thins everything that is not beside the camera path
    const keep = (d, k1, k2) => !draft || d < 400 || hash2(k1, k2, 4409) < density;

    // =================================================================================== palm gardens ==========
    // The palm-garden strips of the ground model (river, moat and canal belts, the gardens of the outer city):
    // rows along the strip, R5 2.4: 100 to 220 palms per hectare "roughly in rows parallel to the feeding ditch".
    {
      const strips = ground.fields.strips;
      let under = 0;
      for (let si = 1; si < strips.length; si++) {
        const s = strips[si];
        if (!s || !(s.palmsPerHa > 0)) continue;
        const ring = s.ring, cx = (ring[0][0] + ring[2][0]) / 2, cz = (ring[0][1] + ring[2][1]) / 2, dC = pathD.at(cx, cz), reach = s.length / 2 + s.width;
        if (dC - reach > 9000) continue;
        const pitch = Math.sqrt(10000 / s.palmsPerHa);
        const ax = (ring[1][0] - ring[0][0]) / s.width, az = (ring[1][1] - ring[0][1]) / s.width;          // across the strip
        const lx = (ring[3][0] - ring[0][0]) / s.length, lz = (ring[3][1] - ring[0][1]) / s.length;        // along it
        const rows = Math.max(1, Math.round(s.width / pitch)), rp = s.width / rows, n = Math.max(1, Math.round(s.length / pitch)), np = s.length / n;
        const allFar = dC - reach > SINGLE;
        // far strips: one instance of three palms for three lattice points (thinner still beyond 3 km)
        const pFar = dC < 3000 ? 1 / 3 : dC < 5000 ? 0.15 : 0.08;
        for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
          const k1 = si, k2 = r * 4096 + i;
          if (allFar && hash2(k1, k2, 61) > pFar * density) continue;
          const ja = (hash2(k1, k2, 62) - 0.5) * 0.5, jl = (hash2(k1, k2, 63) - 0.5) * 0.55;
          const u = (r + 0.5 + ja) * rp, v = (i + 0.5 + jl + (r & 1 ? 0.5 : 0)) * np;
          if (v > s.length) continue;
          const x = ring[0][0] + ax * u + lx * v, z = ring[0][1] + az * u + lz * v;
          const d = allFar ? dC : pathD.at(x, z);
          if (!allFar && d > SINGLE && hash2(k1, k2, 61) > pFar * density) continue;
          if (!keep(d, k1, k2)) continue;
          const lu = ground.landUse(x, z);
          if (!(lu.palmsPerHa > 0) || !lu.strip || lu.strip[0] !== s.id || ground.isWater(x, z)) continue;
          if (d < 3200 && !layout.isFree(x, z, 1.2)) continue;
          if (blockedAt(x, z, 1.5)) continue;
          const y = ground.height(x, z);
          if (d > SINGLE) addClump(x, y, z, k1, k2); else addPalm(x, y, z, k1, k2, { d });
          // under-storey: fruit trees between the palms where a low camera can look into the garden (R5 3.5)
          if (d < 600 && hash2(k1, k2, 64) < 0.24) {
            const ux = x + lx * np * 0.5 + ax * rp * 0.45, uz = z + lz * np * 0.5 + az * rp * 0.45;
            if (free(ux, uz, 0.8) && ground.landUse(ux, uz).palmsPerHa > 0) { addTree(hash2(k1, k2, 65) < 0.55 ? 'pomegranate' : hash2(k1, k2, 65) < 0.85 ? 'fig' : 'apple', ux, ground.height(ux, uz), uz, k1, k2 + 7); under++; }
          }
        }
      }
      stats.underStorey = under;
    }
    stats.gardenPalms = count.palms;                 // planted in the strips of the ground model

    // ============================================================================== the city and its gardens ====
    const inRing = (x, z, ring) => M.pointInPolygon(x, z, ring);
    /** Lattice points inside a polygon: pitch p, jitter j (share of p), turned by rotDeg; calls fn(x, z, i, j). */
    function lattice(poly, p, jit, rotDeg, seed, fn, inset = 0) {
      const bb = M.bbox(poly), c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], rad = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + p, n = Math.ceil(rad / p);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const lxx = (i + (hash2(i, j, seed) - 0.5) * jit + (j & 1 ? 0.5 : 0)) * p, lzz = (j + (hash2(i, j, seed + 1) - 0.5) * jit) * p;
        const [x, z] = M.localToWorld(c, rotDeg, lxx, lzz);
        if (!inRing(x, z, poly)) continue;
        if (inset > 0 && M.distToRing(x, z, poly) < inset) continue;
        fn(x, z, i, j);
      }
    }
    const longAxisDeg = (poly) => { let best = 0, bl = 0; const r = M.openRing(poly); for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = Math.atan2(b[1] - a[1], b[0] - a[0]) * M.RAD; } } return best; };

    for (const o of layout.openSpaces) {
      if (o.kind !== 'garden' && o.kind !== 'palmGrove' && !(o.kind === 'lot' && (o.use === 'empty' || o.use === 'ruin'))) continue;
      const d0 = pathD.at(o.center[0], o.center[1]), id = o.id, rot = longAxisDeg(o.polygon), area = o.area || Math.abs(M.polygonArea(o.polygon));
      if (draft && d0 > 500 && hash2(id, 3, 4411) > 0.3) continue;
      const plant = (x, z, r) => free(x, z, r);
      const yAt = (x, z) => ground.height(x, z);
      if (o.kind === 'palmGrove') {
        lattice(o.polygon, 8.3, 0.5, rot, id, (x, z, i, j) => { if (plant(x, z, 1.0)) { addPalm(x, yAt(x, z), z, id + 70000, i * 512 + j); count.cityPalms++; } }, 1.5);
      } else if (o.use === 'orchard') {
        lattice(o.polygon, 5.6, 0.55, rot, id, (x, z, i, j) => {
          if (!plant(x, z, 0.9)) return;
          const u = hash2(i, j, id + 11);
          if (u < 0.16) { addPalm(x, yAt(x, z), z, id + 70000, i * 512 + j); count.cityPalms++; } else addTree(u < 0.5 ? 'pomegranate' : u < 0.8 ? 'fig' : 'apple', x, yAt(x, z), z, id + 70000, i * 512 + j);
        }, 1.3);
      } else if (o.use === 'estate') {
        lattice(o.polygon, 7.4, 0.5, rot, id, (x, z, i, j) => {
          if (!plant(x, z, 0.9)) return;
          const u = hash2(i, j, id + 11);
          if (u < 0.5) { addPalm(x, yAt(x, z), z, id + 70000, i * 512 + j); count.cityPalms++; } else addTree(u < 0.7 ? 'pomegranate' : u < 0.9 ? 'fig' : 'apple', x, yAt(x, z), z, id + 70000, i * 512 + j);
        }, 1.5);
      } else if (o.use === 'vegetable') {
        // beds on the ground (plots.js); a palm or a fruit tree stands at the edge of some plots
        const ringO = M.openRing(o.polygon), nT = area > 350 ? 3 : area > 150 ? 2 : 1;
        for (let k = 0; k < nT; k++) {
          if (hash2(id, k, 21) > 0.6) continue;
          const a = ringO[Math.floor(hash2(id, k, 22) * ringO.length)], c = o.center, t = 0.25 + 0.2 * hash2(id, k, 23), x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t;
          if (!plant(x, z, 0.9)) continue;
          if (hash2(id, k, 24) < 0.5) { addPalm(x, yAt(x, z), z, id + 70000, k); count.cityPalms++; } else addTree(hash2(id, k, 25) < 0.6 ? 'fig' : 'pomegranate', x, yAt(x, z), z, id + 70000, k);
        }
      } else if (o.use === 'backyard') {
        if (hash2(id, 1, 31) < 0.6 && area > 36) {
          const x = o.center[0] + (hash2(id, 2, 31) - 0.5) * 2, z = o.center[1] + (hash2(id, 3, 31) - 0.5) * 2;
          if (plant(x, z, 0.8)) { if (hash2(id, 4, 31) < 0.6) { addPalm(x, yAt(x, z), z, id + 70000, 1, { age: 'city' }); count.cityPalms++; } else addTree(hash2(id, 5, 31) < 0.6 ? 'fig' : 'pomegranate', x, yAt(x, z), z, id + 70000, 1); }
        }
      } else if (o.use === 'palace' || o.use === 'temple') {
        // the garden west of the South Palace (R4 3.8) and Ea's garden on the river bank (R5 2.4): formal rows of
        // palms with fruit trees between them; a few junipers in the palace garden
        lattice(o.polygon, 6.2, 0.3, rot, id, (x, z, i, j) => {
          if (!plant(x, z, 0.9)) return;
          const y = yAt(x, z);
          if ((i + j) % 2 === 0) { addPalm(x, y, z, id + 70000, i * 512 + j, { H: 7 + 6 * hash2(i, j, id + 3) }); count.cityPalms++; } else {
            const u = hash2(i, j, id + 11);
            addTree(o.use === 'palace' && u < 0.22 ? 'juniper' : u < 0.6 ? 'pomegranate' : u < 0.85 ? 'fig' : 'apple', x, y, z, id + 70000, i * 512 + j);
          }
        }, 1.6);
      } else if (o.kind === 'lot') {
        // waste ground: a stray palm, tamarisk scrub
        if (area > 70 && hash2(id, 1, 41) < 0.3) {
          const x = o.center[0] + (hash2(id, 2, 41) - 0.5) * 4, z = o.center[1] + (hash2(id, 3, 41) - 0.5) * 4;
          if (plant(x, z, 0.8)) { if (hash2(id, 4, 41) < 0.6) { addPalm(x, yAt(x, z), z, id + 70000, 1); count.cityPalms++; } else addTree('tamarisk', x, yAt(x, z), z, id + 70000, 1, { H: 2.2 + 2.2 * hash2(id, 5, 41) }); }
        }
      }
    }

    // ---- courts: a palm or a fig where the layout marks a court tree (SPEC 3.15: about one court in ten) -----------
    for (const hs of layout.houses) {
      if (!hs.courtTree || !layout.isBuilt(hs)) continue;
      const p = layout.courtTreePoint(hs); if (!p) continue;
      const u = hash2(hs.seed & 0xffff, hs.seed >>> 16, 51), wall = (hs.roofLevel - hs.groundLevel) + (hs.mainRaise || 0);
      const c = hs.courts[0], cw = c ? Math.min(Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])) : 4;
      if (u < 0.62 || cw < 4.6) {
        // the crown must clear the roofs: trunk = wall height + 2.5 to 7 m
        const H = wall + 2.5 + 4.5 * hash2(hs.id, 2, 51);
        addPalm(p.x, p.y, p.z, hs.id + 200000, 3, { H, R: Math.min(3.9, 2.9 + 0.9 * hash2(hs.id, 3, 51)), court: true, sucker: true }); count.courtPalms++;
      } else addTree(u < 0.86 ? 'fig' : 'pomegranate', p.x, p.y, p.z, hs.id + 200000, 3, { H: Math.min(wall + 1.8, u < 0.86 ? 4.2 + 2.2 * hash2(hs.id, 4, 51) : 3 + 1.2 * hash2(hs.id, 4, 51)) });
    }

    // ---- the open strip behind the river quays inside the walls ---------------------------------------------------
    // The layout keeps 11 to 20 m free between the quay and the first houses. "Palms cluster more thickly near the
    // water" (R5 2.4): loose groups of palms and a few tamarisks stand on that strip, more on the unexcavated west
    // bank than on the east, none before the precinct wall (the quay and the white wall are bare: SPEC 3.2, shot 5).
    {
      const pr = ctx.W.hasMonument('etemenankiPrecinct') ? ctx.W.monument('etemenankiPrecinct').footprint.polygon : null;
      let nQuay = 0, ei = 0;
      for (const e of ground.hardEdges || []) {
        ei++;
        if (e.kind !== 'quay' || e.body !== 'river') continue;
        const pl = M.resamplePolyline(e.polyline, 2), west = /:4$/.test(e.id), seed = 400 + ei;
        for (let i = 0; i < pl.length - 1; i++) {
          const a = pl[i], b = pl[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / l) * e.land, nz = ((b[0] - a[0]) / l) * e.land;
          if (ground.zone(a[0] + nx * 12, a[1] + nz * 12).zone !== 'innerCity') continue;
          const cl = M.smoothstep(0.38, 0.6, noise1(i / 19, seed) * 0.7 + noise1(i / 5.3, seed + 1) * 0.3);
          if (hash2(i, 1, seed) > (west ? 0.2 : 0.085) * cl) continue;
          const n = 1 + Math.floor(hash2(i, 2, seed) * 2.6);
          for (let k = 0; k < n; k++) {
            const off = 4.5 + 10.5 * hash2(i, 3 + k, seed), sl = (hash2(i, 6 + k, seed) - 0.5) * 7, x = a[0] + nx * off + (b[0] - a[0]) / l * sl, z = a[1] + nz * off + (b[1] - a[1]) / l * sl;
            if (pr && (M.pointInPolygon(x, z, pr) || M.distToRing(x, z, pr) < 32)) continue;
            if (!free(x, z, 1.4) || ground.zone(x, z).zone !== 'innerCity') continue;
            if (hash2(i, 9 + k, seed) < 0.13) addTree('tamarisk', x, ground.height(x, z), z, seed, i * 8 + k, { H: 2.5 + 2.5 * hash2(i, 12 + k, seed) });
            else { addPalm(x, ground.height(x, z), z, seed, i * 8 + k, { age: k ? 'young' : 'city' }); count.cityPalms++; nQuay++; }
          }
        }
      }
      stats.quayStripPalms = nQuay;
    }

    // ===================================================================================== banks: reeds, trees ===
    // Earth banks of river and moats (ground.banks: a -> b is the waterline, the normal points to land) and the
    // edges of the unlined canals. Reeds stand from 0.3 m of water to 0.8 m above it, in patches; poplar, willow
    // and tamarisk on the bank above (R5 3.5).
    {
      let run = 0;
      const alongBank = (ax, az, bx, bz, nx, nz, seed, opts) => {
        const len = Math.hypot(bx - ax, bz - az); if (len < 2) { run += len; return; }
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        const dMid = pathD.at((ax + bx) / 2, (az + bz) / 2);
        if (dMid - len / 2 > REED_REACH) { run += len; return; }
        const step = 1.5;
        for (let s = 0.7; s < len; s += step) {
          const c = run + s, x0 = ax + tx * s, z0 = az + tz * s, k1 = seed, k2 = Math.round(c / step);
          const d = pathD.at(x0, z0);
          if (d > REED_REACH || !keep(d, k1, k2)) continue;
          // patches 30 to 120 m long, about half of the bank; the thick of a patch has three rows
          const patch = noise1(c / 47, seed) * 0.65 + noise1(c / 13, seed + 5) * 0.35, thick = M.smoothstep(opts.cover, opts.cover + 0.12, patch);
          if (thick > 0.02) {
            for (let row = 0; row < 4; row++) {
              if (hash2(k2, row, seed + 3) > thick * (row === 1 ? 1 : row === 0 ? 0.75 : row === 2 ? 0.7 : 0.4)) continue;
              const off = [-1.3, -0.1, 1.2, 2.6][row] + (hash2(k2, row, seed + 4) - 0.5) * 0.9, sl = (hash2(k2, row, seed + 6) - 0.5) * 1.2;
              const x = x0 + nx * off + tx * sl, z = z0 + nz * off + tz * sl, y = ground.height(x, z);
              if (y < ground.waterLevel - 0.55 || y > ground.waterLevel + 1.1 || blockedAt(x, z, 1)) continue;
              addReed(x, y, z, k2 * 4 + row, seed, row >= 2 ? 0.85 : 1, d);
            }
          }
          // trees on the bank above the reeds
          if (opts.trees && d < 1700) {
            const u = hash2(k2, 9, seed + 7);
            if (u < opts.trees) {
              const kind = hash2(k2, 10, seed) < 0.4 ? 'tamarisk' : hash2(k2, 10, seed) < 0.7 ? 'willow' : 'poplar';
              const off = kind === 'willow' ? 1.5 + 2 * hash2(k2, 11, seed) : 5 + 7 * hash2(k2, 11, seed), x = x0 + nx * off, z = z0 + nz * off;
              if (free(x, z, 1.0) && ground.height(x, z) > ground.waterLevel + 0.15) addTree(kind, x, ground.height(x, z), z, k2, seed);
            }
          }
        }
        run += len;
      };
      const bodies = new Map();
      for (const e of ground.banks) {
        if (e.type !== 'earth') { continue; }
        if (!bodies.has(e.body)) bodies.set(e.body, bodies.size + 1);
        // the outer bank of a moat is a reed bank (SPEC 3.3); on the river reeds grow on bars and in backwaters
        alongBank(e.a[0], e.a[1], e.b[0], e.b[1], e.normal[0], e.normal[1], 100 + bodies.get(e.body), { cover: e.body === 'river' ? 0.54 : 0.46, trees: e.body === 'river' ? 0.045 : 0.03 });
      }
      // unlined canals: both edges, where the channel is cut
      let ci = 0;
      for (const cn of ground.canals) {
        ci++;
        if (cn.lined) continue;
        const pl = M.resamplePolyline(cn.polyline, 24);
        for (const side of [-1, 1]) {
          run = 0;
          for (let i = 0; i < pl.length - 1; i++) {
            const a = pl[i], b = pl[i + 1], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
            if (pathD.at(mx, mz) > REED_REACH + 30) { run += 24; continue; }
            const s = M.nearestOnPolyline(mx, mz, cn.polyline).s;
            if (!cn.cutAt(s)) { run += 24; continue; }
            const l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l, nx = -tz * side, nz = tx * side, hw = cn.widthAt(s) / 2;
            // the waterline: walk outward from the nominal edge until the ground rises through the water plane
            let off = hw - 2; while (off < hw + 6 && ground.height(mx + nx * off, mz + nz * off) < ground.waterLevel + 0.02) off += 0.4;
            alongBank(a[0] + nx * off, a[1] + nz * off, b[0] + nx * off, b[1] + nz * off, nx, nz, 300 + ci * 2 + (side > 0 ? 1 : 0), { cover: 0.52, trees: 0.02 });
          }
        }
      }
    }

    // ============================================================================ the royal terraced garden =====
    // SPEC 3.9 / R4 7.3 (CONJECTURAL, after Berossus / Streck / Pedersen): the north slope and the west flank of the
    // North Palace step down in brick-walled terraces; "all manner of trees" stand dense on every step and hang
    // over its edge. Mountain trees (cypress, juniper) on the upper steps, fruit trees in the middle, palms, poplar,
    // willow and tamarisk at the foot. Kept lower than the palace parapets (+18): the garden is an appendage of the
    // palace, never a green mountain.
    const hang = new G.MB();         // static cards of the growth that hangs over the retaining walls
    {
      const hr = (name) => R(name, 0.03);
      const drape = (a, b, n, level, drop, seed) => {
        // from a to b along the top of a retaining wall; n = unit normal pointing downhill
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
        const mb = hang;
        for (let s = 0.6; s < len - 0.6;) {
          const k = Math.round(s * 10), w = 1.6 + 1.6 * hash2(k, 1, seed), gap = hash2(k, 2, seed) < 0.3 ? 1.2 + 3 * hash2(k, 3, seed) : -0.3;
          if (s + w > len - 0.4) break;
          const willow = hash2(k, 4, seed) < 0.45, r = hr(willow ? 'willow' : 'leaf'), d = drop * (0.55 + 0.6 * hash2(k, 5, seed)), up = 0.5 + 0.5 * hash2(k, 6, seed);
          const g = 0.8 + 0.35 * hash2(k, 7, seed), c = willow ? [0.38 * g, 0.5 * g, 0.2 * g] : [0.28 * g, 0.42 * g, 0.16 * g];
          const x0 = a[0] + tx * s, z0 = a[1] + tz * s, x1 = x0 + tx * w, z1 = z0 + tz * w, out = 0.14, bulge = 0.3 + 0.25 * hash2(k, 8, seed);
          const rows = [[level + up, -0.25], [level + 0.1, out + 0.05], [level - d * 0.45, out + bulge], [level - d, out + bulge * 0.5]];
          let prev = null;
          rows.forEach(([y, o], ri) => {
            const t = ri / (rows.length - 1), v = r.v0 + (r.v1 - r.v0) * (willow ? t : 1 - t), sh = 1 - 0.3 * t;
            const row = [mb.vert(x0 + n[0] * o, y, z0 + n[1] * o, n[0], 0.6, n[1], r.u0, v, [c[0] * sh, c[1] * sh, c[2] * sh]), mb.vert(x1 + n[0] * o, y, z1 + n[1] * o, n[0], 0.6, n[1], r.u1, v, [c[0] * sh, c[1] * sh, c[2] * sh])];
            if (prev) mb.quad(prev[0], prev[1], row[1], row[0]);
            prev = row;
          });
          s += w + gap;
        }
      };
      const upper = ['cypress', 'juniper', 'pomegranate', 'cypress', 'apple', 'pomegranate'];
      const middle = ['fig', 'juniper', 'apple', 'fig', 'pomegranate', 'poplar', 'cypress'];
      const lower = ['willow', 'tamarisk', 'poplar', 'fig', 'tamarisk'];
      const TOP = 18.4;             // palace parapets (SPEC 3.9: outer walls to +18)
      // What the palaces module builds on the treads (js/modules/palaces/north.js), in the palace's own frame
      // (local x east, local z south): flights of stairs, shaduf stations with their basins, wells, the vault
      // mouths under the lowest west tread. Nothing is planted there.
      const np = ctx.W.hasMonument('northPalace') ? ctx.W.monument('northPalace') : null, mbd = np && np.dims && np.dims.mainBuilding;
      const toLocal = (x, z) => (mbd ? M.worldToLocal(mbd.center, mbd.rotationDeg, x, z) : [0, 0]);
      const WX = -71.3;
      const blocked = (id, x, z) => {
        if (!mbd) return false;
        const [lx, lz] = toLocal(x, z), k = +id.split(':')[1];
        if (id.startsWith('north')) {
          for (const xs of [-78, 16, 84]) if (Math.abs(lx - xs) < 5.4) return true;                 // switchback stairs
          for (const xs of [-40, 52]) if (lx > xs - 2.6 && lx < xs + 7.6) return true;              // shadufs and basins
          if (k === 0) for (const xc of [-58, 8, 70]) if (Math.abs(lx - xc) < 2.4) return true;      // wells
          return false;
        }
        for (const zc of [-38, 26]) if (Math.abs(lz - zc) < 3.0) return true;                        // axial stairs
        if (k === 0) for (const zc of [-52, -6, 44]) if (Math.abs(lz - zc) < 3.0 && lx > WX - 9.4) return true;   // wells and basins
        if (k === 4 && lx > WX - 48 - 3.8) return true;                                             // vault mouths
        return false;
      };
      let gi = 0, planted = 0;
      for (const t of ground.gardenTerraces || []) {
        gi++;
        const ring = M.openRing(t.ring), seed = 600 + gi;
        // the long edges of the tread, and which of them looks downhill
        const edges = ring.map((p, i) => { const q = ring[(i + 1) % ring.length]; return { a: p, b: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; }).sort((e1, e2) => e2.len - e1.len);
        const cen = M.polygonCentroid(t.ring), depth = Math.abs(M.polygonArea(t.ring)) / edges[0].len;
        let down = null;
        for (const e of edges.slice(0, 2)) {
          const mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[1] + e.b[1]) / 2; let nx = mx - cen[0], nz = mz - cen[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
          const below = ground.height(mx + nx * 1.6, mz + nz * 1.6);
          if (below < t.level - 1.2) { drape(e.a, e.b, [nx, nz], t.level, Math.min(2.6, (t.level - below) * 0.7), seed); down = [nx, nz]; }
        }
        // trees in rows along the tread: one row on the 3 m treads of the north slope, three on the 12 m treads of
        // the west flank; the kerb of the retaining wall stands on the downhill edge, a channel runs at the uphill one
        const e0 = edges[0], tx = (e0.b[0] - e0.a[0]) / e0.len, tz = (e0.b[1] - e0.a[1]) / e0.len;
        const dn = down || [-tz, tx];
        const offs = depth > 9 ? [-0.28 * depth, 0.02 * depth, 0.3 * depth] : [-0.12 * depth];            // along `dn` from the centre line
        const list = t.level >= 12.5 ? upper : t.level >= 6 ? middle : lower;
        const room = TOP - t.level;                                       // how high a crown may stand here
        offs.forEach((across, r) => {
          const pitch = depth > 9 ? 4.4 : 3.9;
          for (let s = 1.8 + r * 1.9; s < e0.len - 1.6; s += pitch * (0.8 + 0.4 * hash2(Math.round(s * 3), r, seed))) {
            const k2 = Math.round(s * 4) + r * 9000, j = (hash2(k2, 1, seed) - 0.5) * 0.7;
            const x = cen[0] + tx * (s - e0.len / 2 + j) + dn[0] * across, z = cen[1] + tz * (s - e0.len / 2 + j) + dn[1] * across;
            if (!inRing(x, z, t.ring) || M.distToRing(x, z, t.ring) < 0.95 || blocked(t.id, x, z)) continue;
            const y = t.level, u = hash2(k2, 2, seed);
            if (t.level < 6 && u < 0.4) { addPalm(x, y, z, seed, k2, { H: Math.min(room - 3.2, 5 + 5 * hash2(k2, 3, seed)), R: 3.0 + 0.6 * hash2(k2, 4, seed), sucker: true, court: true }); count.cityPalms++; planted++; continue; }
            const kind = list[Math.floor(hash2(k2, 5, seed) * list.length)], sp = SPECIES[kind];
            const H = Math.min(room - 0.4, M.lerp(sp.h[0], sp.h[1], hash2(k2, 6, seed)) * (t.level >= 12.5 ? 0.62 : 1));
            if (H < 1.6) continue;
            addTree(kind, x, y, z, seed, k2, { H }); planted++;
            // aromatic shrubs between the trees
            if (hash2(k2, 7, seed) < 0.65) {
              const sx = x + tx * pitch * 0.5, sz = z + tz * pitch * 0.5;
              if (inRing(sx, sz, t.ring) && M.distToRing(sx, sz, t.ring) > 0.8 && !blocked(t.id, sx, sz)) { addTree('shrub', sx, y, sz, seed, k2 + 3); planted++; }
            }
          }
        });
      }
      stats.royalGardenPlants = planted;
      if (hang.tris) { const g = hang.build(THREE, 'veg-hanging'); g.deleteAttribute('aVeg'); geom.addStatic(mat.still, g, { lod: [0, 900], castShadow: true, shadowTexel: 0.6, ao: false, occluder: false }); }
      stats.hangingTris = hang.tris;
    }

    // ================================================================= crops beside the low camera stretches ====
    // The terrain paints and furrows the fields. Where the camera comes down over them (the descent into shot 2,
    // the roof-level flights inside the walls) the ripe barley and the garden rows stand up as rows of cards with
    // the ears along their top, swaying; reed-marsh strips carry scattered reed clumps.
    {
      const rows = inst({ name: 'veg-crop-rows', geometry: G.cropRow(THREE, R), cell: 512, lod: [0, 320], lodGrid: [512, 512], castShadow: false });
      const BARLEY = [1, 1, 1], GREENS = [[0.24, 0.46, 0.22], [0.3, 0.5, 0.2], [0.2, 0.4, 0.25]];       // onion and leek, lettuce, cress: over the barley-coloured card
      let nRows = 0, nMarsh = 0;
      const rowAt = (x, z, rotY, len, ht, tint, k1, k2) => {
        const v = 0.86 + 0.26 * hash2(k1, k2, 931);
        rows.add({ x, y: ground.height(x, z) - 0.03, z, rotY, sx: len / 6, sy: ht * (0.85 + 0.3 * hash2(k1, k2, 932)), sz: 1 }, tintOf(tint[0] * v, tint[1] * v, tint[2] * v));
        nRows++;
      };
      const strips = ground.fields.strips;
      for (let si = 1; si < strips.length; si++) {
        const s = strips[si];
        if (!s || (s.use !== 'barleyRipe' && s.use !== 'garden' && s.use !== 'reedMarsh')) continue;
        const ring = s.ring, cx = (ring[0][0] + ring[2][0]) / 2, cz = (ring[0][1] + ring[2][1]) / 2, dC = pathD.at(cx, cz), reach = s.length / 2;
        const lim = s.use === 'reedMarsh' ? 1500 : 170;
        if (dC - reach > lim) continue;
        const ax = (ring[1][0] - ring[0][0]) / s.width, az = (ring[1][1] - ring[0][1]) / s.width, lx = (ring[3][0] - ring[0][0]) / s.length, lz = (ring[3][1] - ring[0][1]) / s.length;
        if (s.use === 'reedMarsh') {
          const p = 6.5, nr = Math.max(1, Math.round(s.width / p)), nl = Math.max(1, Math.round(s.length / p));
          for (let r = 0; r < nr; r++) for (let i = 0; i < nl; i++) {
            if (hash2(si, r * 4096 + i, 941) > 0.5) continue;
            const u = (r + 0.2 + 0.6 * hash2(si, r * 4096 + i, 942)) * s.width / nr, v = (i + 0.2 + 0.6 * hash2(si, r * 4096 + i, 943)) * s.length / nl;
            const x = ring[0][0] + ax * u + lx * v, z = ring[0][1] + az * u + lz * v, d = pathD.at(x, z);
            if (d > lim || !keep(d, si, i)) continue;
            const lu = ground.landUse(x, z);
            if (lu.use !== 'reedMarsh' || ground.isWater(x, z) || blockedAt(x, z, 1)) continue;
            addReed(x, ground.height(x, z), z, si, r * 4096 + i, 1.15, d); nMarsh++;
          }
          continue;
        }
        const barley = s.use === 'barleyRipe', sp = barley ? 2.3 : 1.6, ht = barley ? 0.85 : 0.42, rotY = -Math.atan2(lz, lx);
        const nr = Math.max(1, Math.floor(s.width / sp)), nl = Math.max(1, Math.floor(s.length / 5.8));
        for (let r = 0; r < nr; r++) for (let i = 0; i < nl; i++) {
          const u = (r + 0.5) * s.width / nr, v = (i + 0.5) * s.length / nl, x = ring[0][0] + ax * u + lx * v, z = ring[0][1] + az * u + lz * v;
          if (pathD.at(x, z) > lim) continue;
          const lu = ground.landUse(x, z);
          if (lu.use !== s.use || !lu.strip || lu.strip[0] !== s.id) continue;
          // a garden is a patchwork of beds: every few metres another crop, some beds bare
          const bed = Math.floor(v / 7.5) * 31 + Math.floor(u / 4.8);
          if (!barley && hash2(si, bed, 951) < 0.22) continue;
          if (!layout.isFree(x, z, 0.4)) continue;
          rowAt(x, z, rotY, s.length / nl + 0.3, ht * (barley ? 1 : 0.6 + 0.8 * hash2(si, bed, 952)), barley ? BARLEY : GREENS[Math.floor(hash2(si, bed, 953) * 3)], si, r * 4096 + i);
        }
      }
      // the vegetable gardens inside the walls
      for (const o of layout.openSpaces) {
        if (o.use !== 'vegetable' || pathD.at(o.center[0], o.center[1]) > 330) continue;
        const rot = longAxisDeg(o.polygon), id = o.id;
        lattice(o.polygon, 1, 0, rot, id, (x, z, i, j) => {
          // lattice of 1 m: rows 1.5 m apart (every third line skipped as the path between beds), cards 3 m long
          if (j % 3 !== 0 && (j % 3 !== 1 || j % 2)) return;
          if (((i % 3) + 3) % 3 !== 0) return;
          const bed = Math.floor(i / 6) * 17 + Math.floor(j / 4);
          if (hash2(id, bed, 961) < 0.18 || !layout.isFree(x, z, 0.4)) return;
          rowAt(x, z, -rot * M.DEG, 3.1, 0.3 + 0.3 * hash2(id, bed, 962), GREENS[Math.floor(hash2(id, bed, 963) * 3)], id + 5000, i * 512 + j);
        }, 1.2);
      }
      stats.cropRows = nRows; stats.marshReeds = nMarsh;
    }

    // ================================================================================================ report ====
    Object.assign(stats, count);
    const tri = (g) => Math.round(g.index.count / 3);
    stats.palmTris = { near: tri(palmGeo.full), old: tri(palmGeo.old), mid: tri(palmGeo.mid), far: tri(palmGeo.far), clump: tri(palmGeo.clump) };
    stats.treeTris = Object.fromEntries(Object.entries(treeGeo).map(([k, g]) => [k, tri(g)]));
    stats.palmsInAll = count.palms + count.clumps * 3;
    const own = geom.statsFor('vegetation');
    stats.trianglesMultipliedOut = Math.round(own.tris + own.instancedTris);
    // measured on the sample: nothing stands in water, in a room or on a street; the roof of shot 8 has palms to look at
    let wet = 0, built = 0, nearRoof = 0;
    const roof = ctx.film.shots[7] ? ctx.film.pathPoseAt(ctx.film.shots[7].tHold ?? ctx.film.shots[7].t0).pos : [533.8, 16.8, -227.9];
    for (let i = 0; i < sample.length; i += 4) {
      const x = sample[i], z = sample[i + 1];
      if (ground.isWater(x, z)) wet++;
      if (!sample[i + 2] && layout.houseAt && layout.houseAt(x, z)) built++;
      if (sample[i + 3] && Math.hypot(x - roof[0], z - roof[2]) < 260) nearRoof++;
    }
    const want = draft ? 4000 : 40000;
    checks.push({ name: 'date palms planted one by one', value: count.palms, expect: '>= ' + want + ' (SPEC 3.17, 9.8)', pass: count.palms >= want });
    checks.push({ name: 'date palms with the three-crown far instances', value: stats.palmsInAll, expect: '>= ' + want, pass: stats.palmsInAll >= want });
    checks.push({ name: 'palm trunk heights (m)', value: count.shortest.toFixed(1) + ' to ' + count.tallest.toFixed(1), expect: 'young 1 to 6, mature and old up to 19 (SPEC 3.17: 4 to 18)', pass: count.shortest < 4 && count.tallest > 15 && count.tallest < 19.5 });
    checks.push({ name: 'trees that are not palms', value: count.trees, expect: '>= ' + (draft ? 600 : 6000) + ' (SPEC 3.17)', pass: count.trees >= (draft ? 600 : 6000) });
    checks.push({ name: 'reed clumps on earth banks and marsh strips', value: count.reeds, expect: '>= ' + (draft ? 2500 : 25000) + ' (SPEC 3.17)', pass: count.reeds >= (draft ? 2500 : 25000) });
    checks.push({ name: 'near palm: fronds as geometry (triangles)', value: stats.palmTris.near, expect: '1200 to 1800', pass: stats.palmTris.near >= 1200 && stats.palmTris.near <= 1800 });
    checks.push({ name: 'sampled palms standing in water', value: wet, expect: 0, pass: wet === 0 });
    checks.push({ name: 'sampled palms standing inside a house (court trees excepted)', value: built, expect: 0, pass: built === 0 });
    checks.push({ name: 'full-crown palms within 260 m of the roof of shot 8', value: nearRoof, expect: '>= 5', pass: nearRoof >= 5 });
    checks.push({ name: 'plant meshes (species and forms)', value: Object.keys(palmGeo).length + Object.keys(treeGeo).length + 2, expect: '>= 5 (STYLE E)', pass: true });
    checks.push({ name: 'triangles, every instance of every level counted', value: stats.trianglesMultipliedOut, expect: '<= 2.2 M (share 2 M)', pass: draft || stats.trianglesMultipliedOut <= 2.2e6 });

    let attached = 0;
    return {
      update() {
        // shadows: the depth material that knows the crown code and the wind (meshes exist after geom.finalize())
        let n = 0; for (const s of swaySets) n += s.meshes.length + s.families.length;
        if (n !== attached) {
          attached = n;
          for (const s of swaySets) { for (const m of s.meshes) m.customDepthMaterial = mat.depth; for (const f of s.families) f.parent.customDepthMaterial = mat.depth; }
        }
      },
      stats, checks,
      api: { atlas, materials: mat, count, pathDistance: pathD.at },
    };
  },
};
