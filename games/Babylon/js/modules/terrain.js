// js/modules/terrain.js — the ground surface of the whole model (SPEC 3.1, 3.16). Claims 'ground'.
// Notes: docs/ground.md (section "terrain module"). OWNER: ground engineer.
//
// What it draws
//   MESH    ctx.ground.meshHeight(x, z) on a restricted quadtree out to 32 km: leaves of 1 m at the low cameras,
//           2 m round the other holds, 4 m in the core, 8 m where canals are cut, up to 4 km on the flat plain.
//           Neighbouring leaves differ by at most one level and the coarser one takes the finer one's edge
//           vertex, so the surface is closed: no skirts, no T-junctions. Banks, canal cuts, levees, platform
//           edges and causeways are all in the height function; this file only samples it.
//   HARD EDGES  Where the ground steps straight down into water behind brickwork (ground.hardEdges: quay banks,
//           brick-lined canals) a height field cannot hold the line. There the quadtree stays at bed level
//           for 1.5 leaf sizes behind the edge (no triangle can carry earth in front of a quay), and an exact
//           strip is laid over that trench: a vertical CURTAIN 1 m behind the edge and an APRON at
//           ground.height() from the curtain inland. Quay masonry (at least 1.5 m thick) hides the curtain.
//   COLOUR  two land-use maps painted on 2D canvases from the same data ctx.ground.landUse() answers from:
//           field strips as polygons, the ditch net, branch canals, roads, kiln yards, mud banks, and inside
//           the walls the layout's streets, blocks and open ground. 'inner' covers 7.2 km at 1.76 m per texel
//           (final tier), 'outer' 17.6 km at 4.3 m; beyond that the plain is vertex-coloured.
//   DETAIL  hook 'terrainFields' (order 60) on the inner material: furrows, plough passes and basin bunds along
//           each strip's long axis (from a small direction map), wet mud and a silt line on earth banks. The
//           registry's texture set, macro variation and the waterline wetness come on top through the hook chain.
// It casts no shadows (walls, quays and houses do) and receives them. Tiles with a bank are in the water reflection.
// Deterministic: no clock, no random numbers; hash2 only.
import * as M from '../core/mathx.js';
import { hash2 } from '../core/rng.js';

const ROOT = 4096, EXT = 32768, NR = (2 * EXT) / ROOT;           // 16 x 16 roots
const INNER = { x0: -2850, z0: -4350, size: 7200 };              // the walled city, the outer city and the Summer Palace
const OUTER = { x0: -8800, z0: -8800, size: 17600 };             // the irrigated landscape (ground.fields.extent)
const CURTAIN = 1.0;                                             // m behind a hard edge
const LIFT = 0.02;                                                // m: the apron lies this far above ground.height() (paving 0.05 m above the ground clears it)

// Land uses as the field map stores them (4 bits), with how strongly each shows rows along its long axis
// (furrows, sowing lines, beds) and how much standing crop softens their relief
const USE_ID = { ploughed: 1, barleyRipe: 2, stubble: 3, garden: 4, fallow: 5, palmGarden: 6, saltCrust: 7 };
const ROWS = [0, 1, 0.7, 0.75, 0.9, 0.4, 0.3, 0.2], COVER = [0, 0, 1, 0.55, 0.8, 0.35, 0.5, 0.15];
const glf = (a) => a.map((v) => v.toFixed(2)).join(', ');

const FIELD_PARS = /* glsl */ `
uniform highp sampler2D uTFieldMap;  // per texel (never filtered): R = use (4 bit) | angle hi (4 bit), G = angle lo, B = offset of the strip's centreline, A = its half width
uniform sampler2D uTShoreMap;        // linear: nearness of an earth bank
uniform vec4 uTFieldRect;            // x0, z0, 1 / size, water level
uniform vec2 uTFieldSize;            // texels across, metres per texel
const float tfRows[8] = float[8]( ${glf(ROWS)} );
const float tfCover[8] = float[8]( ${glf(COVER)} );
`;
const fieldChunk = (hasNd, hasWet) => /* glsl */ `
{
	// terrainFields: rows along the long axis of each field strip, wet mud and the silt line on earth banks
	vec2 tfUv = ( vBWorldPos.xz - uTFieldRect.xy ) * uTFieldRect.z;
	float tfSh = texture2D( uTShoreMap, clamp( tfUv, 0.0, 1.0 ) ).r;
	vec2 tfDx = dFdx( vBWorldPos.xz ), tfDy = dFdy( vBWorldPos.xz );
	float tfIn = step( 0.0, tfUv.x ) * step( tfUv.x, 1.0 ) * step( 0.0, tfUv.y ) * step( tfUv.y, 1.0 );
	tfSh *= tfIn;
	float tfFoot = max( length( tfDx ), length( tfDy ) );
	if ( tfIn > 0.5 && tfSh < 0.45 && tfFoot < 9.0 ) {
		// the strip this fragment lies in: of the four texels round it, the first whose strip contains it.
		// Angle, centreline and width are those of the STRIP, so rows are straight, in phase and end on its edges.
		vec2 tfT = tfUv * uTFieldSize.x - 0.5, tfB = floor( tfT ), tfF = tfT - tfB;
		ivec2 tfO = ivec2( tfF.x > 0.5 ? 1 : 0, tfF.y > 0.5 ? 1 : 0 );
		float tfUse = 0.0, tfQl = 0.0, tfHw = 0.0, tfTh = 0.0;
		for ( int k = 0; k < 4; k ++ ) {
			ivec2 o = ivec2( ( k & 1 ) == 0 ? tfO.x : 1 - tfO.x, k < 2 ? tfO.y : 1 - tfO.y );
			ivec2 ij = clamp( ivec2( tfB ) + o, ivec2( 0 ), ivec2( int( uTFieldSize.x ) - 1 ) );
			vec4 t = texelFetch( uTFieldMap, ij, 0 );
			float hi = floor( t.r * 255.0 + 0.5 ), u = floor( hi / 16.0 );
			if ( u < 0.5 ) continue;
			float th = ( ( hi - u * 16.0 ) * 256.0 + floor( t.g * 255.0 + 0.5 ) ) * 7.66990e-4;
			vec2 tc = uTFieldRect.xy + ( vec2( ij ) + 0.5 ) * uTFieldSize.y;
			float ql = dot( vBWorldPos.xz - tc, vec2( - sin( th ), cos( th ) ) ) - ( t.b * 255.0 - 128.0 ) * 0.3, hw = t.a * 255.0 * 0.3;
			if ( abs( ql ) < hw ) { tfUse = u; tfQl = ql; tfHw = hw; tfTh = th; break; }
		}
		if ( tfUse > 0.5 ) {
			int ui = int( tfUse );
			vec2 d = vec2( cos( tfTh ), sin( tfTh ) ), pp = vec2( - d.y, d.x );
			// qa: the absolute coordinate across the strip (exact and continuous: the phase of every row);
			// tfQl, from the quantised centreline, only says how far the edges are
			float a = dot( vBWorldPos.xz, d ), qa = dot( vBWorldPos.xz, pp ), sd = tfTh * 37.0 + tfUse;
			float fq = abs( dot( tfDx, pp ) ) + abs( dot( tfDy, pp ) ), fa = abs( dot( tfDx, d ) ) + abs( dot( tfDy, d ) );
			float S = tfRows[ ui ] * ( 1.0 - smoothstep( 0.0, 0.45, tfSh ) ) * smoothstep( 0.0, 0.9, tfHw - abs( tfQl ) );
			float bare = 1.0 - 0.7 * tfCover[ ui ];
			// 1. furrows and sowing rows 0.7 m apart, wandering a little: relief near the camera, gone when a pixel covers half a row
			float f1 = 1.0 - smoothstep( 0.2, 0.55, fq / 0.7 );
			float wob = 0.07 * sin( a * 0.23 + sd ) + 0.04 * sin( a * 0.71 + 2.0 * sd );
			float ph = ( qa + wob ) * 8.97598;
			float amp = 0.7 + 0.6 * bblValueNoise( vec2( qa * 1.7, a * 0.21 ) + sd );
			float tone = 1.0 + 0.07 * S * f1 * amp * cos( ph );
			${hasNd ? `#ifdef BBL_TEX
				bblNd += vec3( pp.x, 0.0, pp.y ) * ( 0.17 * bare * S * f1 * amp * sin( ph ) );
			#endif` : ''}
			// 2. plough and sowing passes 3.3 m wide: each a slightly different tone, to 1.5 km
			float bq = qa / 3.3, bi = floor( bq ), bf = bq - bi, e2 = clamp( 1.6 * fq / 3.3, 0.08, 1.0 );
			float t2 = mix( bblHash21( vec2( bi, sd ) ), bblHash21( vec2( bi + 1.0, sd ) ), smoothstep( 1.0 - e2, 1.0, bf ) );
			tone *= 1.0 + 0.22 * S * ( 1.0 - smoothstep( 0.5, 1.5, fq / 3.3 ) ) * ( t2 - 0.5 );
			// 3. irrigation basins: a cross bund every 19 to 27 m along the strip, each basin its own tone
			float bw = 19.0 + 8.0 * fract( sd * 0.37 );
			float ba = a / bw, bj = floor( ba ), bg = ba - bj, e3 = clamp( 1.5 * fa / bw, 0.02, 1.0 );
			float t3 = mix( bblHash21( vec2( bj, sd ) ), bblHash21( vec2( bj + 1.0, sd ) ), smoothstep( 1.0 - e3, 1.0, bg ) );
			tone *= 1.0 + 0.15 * S * ( 1.0 - smoothstep( 0.6, 2.0, fa / bw ) ) * ( t3 - 0.5 );
			tone *= 1.0 + 0.09 * S * ( 1.0 - smoothstep( 0.08, 0.24, fa / bw ) ) * ( 1.0 - smoothstep( 0.0, 0.03, abs( bg - 0.5 ) - 0.47 ) );
			diffuseColor.rgb *= tone;
		}
	}
	float tfHt = vBWorldPos.y - uTFieldRect.w;
	if ( tfSh > 0.004 && tfHt > - 0.6 && tfHt < 3.4 ) {
		float nz = bblValueNoise( vBWorldPos.xz * 0.83 ) + 0.5 * bblValueNoise( vBWorldPos.xz * 3.1 );
		float damp = tfSh * ( 1.0 - smoothstep( 0.1, 1.5, tfHt + 0.45 * nz - 0.3 ) );
		float silt = tfSh * smoothstep( 1.0, 1.25, tfHt + 0.3 * nz ) * ( 1.0 - smoothstep( 1.45, 1.9, tfHt + 0.3 * nz ) );
		diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.54, 0.52, 0.49 ), damp );
		diffuseColor.rgb *= 1.0 + 0.2 * silt;
		${hasNd ? `#ifdef BBL_TEX
		{
			// slumped, trodden mud: a lumpy normal on the bank (the geometry stays the plane of ground.height)
			vec2 bp = vBWorldPos.xz * 0.31, br = vec2( 0.8 * bp.x - 0.6 * bp.y, 0.6 * bp.x + 0.8 * bp.y ) * 2.7;
			float b0 = bblValueNoise( bp ) + 0.5 * bblValueNoise( br );
			float bx = bblValueNoise( bp + vec2( 0.3, 0.0 ) ) + 0.5 * bblValueNoise( br + vec2( 0.648, 0.486 ) );
			float bz = bblValueNoise( bp + vec2( 0.0, 0.3 ) ) + 0.5 * bblValueNoise( br + vec2( - 0.486, 0.648 ) );
			bblNd += vec3( b0 - bx, 0.0, b0 - bz ) * ( 0.5 * tfSh * ( 1.0 - smoothstep( 1.0, 4.0, tfFoot ) ) );
		}
		#endif` : ''}
		${hasWet ? 'bblWet = max( bblWet, tfSh * ( 1.0 - smoothstep( 0.0, 0.5, tfHt + 0.25 * nz - 0.1 ) ) );' : ''}
	}
}
`;

export default {
  name: 'terrain',
  claims: ['ground'],
  async build(ctx) {
    const { THREE, ground, geom, materials, world, layout, film } = ctx;
    const draft = ctx.quality.draft, WL = ground.waterLevel;
    // A ground without the feature query (the frozen stub: 1:5 banks, nothing cut) gets a coarse, quick terrain
    const coarse = typeof ground.hasFeatures !== 'function';
    const hasFeatures = ground.hasFeatures;
    const detailFade = ground.detailFade || (() => 1);
    const cb = ground.coreBounds;
    const STEP = ground.stepInset || 1.2;
    const hardEdges = (!coarse && ground.hardEdges) || [];
    const nearHard = hardEdges.length && ground.nearHardEdge ? ground.nearHardEdge : null;
    const nearStep = !coarse && ground.nearStep && ground.platformAt ? ground.nearStep : null;
    const mh0 = ground.meshHeight || ground.height;                 // with the default inset (drives the refinement)

    // ------------------------------------------------------------------------------------------------------
    // 1. how fine: detail classes from the film path (the path is fixed by world.json; ENGINE.md section 4)
    // ------------------------------------------------------------------------------------------------------
    const low = [], mid = [];
    for (const s of film.shots) {
      const k = s.keyframes, a = k[0].pos, b = k[k.length - 1].pos;
      const h = Math.min(a[1] - Math.max(ground.height(a[0], a[2]), WL), b[1] - Math.max(ground.height(b[0], b[2]), WL));
      if (h < 8) low.push([a[0], a[2], b[0], b[2]]);
      if (h < 140) { mid.push([a[0], a[2], 650], [b[0], b[2], 650]); for (const q of k) mid.push([q.look[0], q.look[2], 400]); }
    }
    const K = coarse ? 4 : draft ? 2 : 1;
    const CLASS = [{ min: 1 * K, tol: 0.04 * K }, { min: 2 * K, tol: 0.07 * K }, { min: 4 * K, tol: 0.12 * K }, { min: 8 * K, tol: 0.25 * K }, { min: 64, tol: 0.6 }];
    /** detail class of a square: 0 = at a low camera ... 4 = the open plain */
    function classOf(cx, cz, s) {
      const r = s * 0.7072;
      for (const q of low) if (M.distToSegment(cx, cz, q[0], q[1], q[2], q[3])[0] - r < 170) return 0;
      for (const q of mid) if (Math.hypot(cx - q[0], cz - q[1]) - r < q[2]) return 1;
      if (cx + r > cb[0] - 150 && cx - r < cb[2] + 150 && cz + r > cb[1] - 150 && cz - r < cb[3] + 150) return 2;
      if (detailFade(cx, cz) > 0.02 || detailFade(cx - r, cz - r) > 0.02 || detailFade(cx + r, cz + r) > 0.02) return 3;
      return 4;
    }
    // the causeways are 10 m wide with sheer sides: always at the finest leaf
    const cways = (ground.causeways || []).map((c) => { const l = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]), ux = (c.to[0] - c.from[0]) / l, uz = (c.to[1] - c.from[1]) / l; return [c.from[0] - ux * 3, c.from[1] - uz * 3, c.to[0] + ux * 4, c.to[1] + uz * 4, c.width / 2 + 1.5]; });
    const onCauseway = (cx, cz, s) => { for (const c of cways) if (M.distToSegment(cx, cz, c[0], c[1], c[2], c[3])[0] < c[4] + s * 0.7072) return true; return false; };

    // ------------------------------------------------------------------------------------------------------
    // 2. the quadtree
    // ------------------------------------------------------------------------------------------------------
    let cap = 1 << 16, n = 0;
    let NX = new Float64Array(cap), NZ = new Float64Array(cap), NS = new Float32Array(cap), NC = new Int32Array(cap);
    const grow = () => { cap *= 2; const g = (A, T) => { const B = new T(cap); B.set(A); return B; }; NX = g(NX, Float64Array); NZ = g(NZ, Float64Array); NS = g(NS, Float32Array); NC = g(NC, Int32Array); };
    const add = (x, z, s) => { if (n === cap) grow(); NX[n] = x; NZ[n] = z; NS[n] = s; NC[n] = -1; return n++; };
    for (let j = 0; j < NR; j++) for (let i = 0; i < NR; i++) add(-EXT + i * ROOT, -EXT + j * ROOT, ROOT);
    const split = (i) => { const x = NX[i], z = NZ[i], h = NS[i] / 2, c = add(x, z, h); add(x + h, z, h); add(x, z + h, h); add(x + h, z + h, h); NC[i] = c; return c; };
    function leafAt(x, z) {
      if (x < -EXT || x >= EXT || z < -EXT || z >= EXT) return -1;
      let i = Math.floor((x + EXT) / ROOT) + Math.floor((z + EXT) / ROOT) * NR;
      while (NC[i] >= 0) { const h = NS[i] / 2; i = NC[i] + (x >= NX[i] + h ? 1 : 0) + (z >= NZ[i] + h ? 2 : 0); }
      return i;
    }
    const leafSize = (x, z) => { const i = leafAt(x, z); return i < 0 ? 0 : NS[i]; };
    /** largest difference between the height function and the bilinear patch of the square, on an m x m lattice */
    function patchError(x0, z0, s, m, tol) {
      const a = mh0(x0, z0), b = mh0(x0 + s, z0), c = mh0(x0, z0 + s), d = mh0(x0 + s, z0 + s), q = m - 1;
      let worst = 0;
      for (let j = 0; j <= q; j++) for (let i = 0; i <= q; i++) {
        if ((i === 0 || i === q) && (j === 0 || j === q)) continue;
        const u = i / q, v = j / q, e = Math.abs(mh0(x0 + u * s, z0 + v * s) - ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v));
        if (e > worst) { worst = e; if (e > tol) return e; }
      }
      return worst;
    }
    function wantsSplit(i) {
      const s = NS[i], x0 = NX[i], z0 = NZ[i], cx = x0 + s / 2, cz = z0 + s / 2, k = CLASS[classOf(cx, cz, s)];
      if (s <= k.min) {
        if (coarse || k.min > 8 * K) return false;
        if (s > K && onCauseway(cx, cz, s)) return true;
        if (s > Math.max(K, k.min / 2)) {
          // one level finer than the class asks for at quay lines and lined canals (every leaf that reaches to
          // within 1 m of a hard edge is then of that size: section 5 relies on it) and at sheer steps of 2.5 m
          // and more (platform edges): the step stays within the masonry that hides it
          if (nearHard ? nearHard(cx, cz, s * 0.75 + 1.2) : !!(ground.bankAt && (() => { const b = ground.bankAt(cx, cz); return b && b.type === 'quay' && b.dist < s * 0.75 + 1.2; })())) return true;
          return nearStep ? nearStep(cx, cz, s * 0.75 + 1.2, 0.5) : patchError(x0, z0, s, 3, 2.5) > 2.5;
        }
        return false;
      }
      if (s > 2048) return Math.abs(cx) < 12000 && Math.abs(cz) < 12000;      // the 4 km roots only on the far plain
      if (s > 32) {
        if (coarse) return k.min < 64 && s > 256 ? true : patchError(x0, z0, s, 9, k.tol * 2) > k.tol * 2;
        return hasFeatures(x0, z0, x0 + s, z0 + s) ? true : patchError(x0, z0, s, 5, k.tol * 2) > k.tol * 2;
      }
      return patchError(x0, z0, s, s >= 16 ? 9 : s >= 4 ? 5 : 3, k.tol) > k.tol;
    }
    for (let i = 0; i < n; i++) if (wantsSplit(i)) split(i);           // children are appended, so the loop reaches them
    // 2:1 balance across edges
    const queue = [];
    for (let i = 0; i < n; i++) if (NC[i] < 0) queue.push(i);
    const SIDE = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      if (NC[i] >= 0) continue;
      const s = NS[i], cx = NX[i] + s / 2, cz = NZ[i] + s / 2;
      for (const [dx, dz] of SIDE) {
        const o = leafAt(cx + dx * (s / 2 + 0.25), cz + dz * (s / 2 + 0.25));
        if (o >= 0 && NS[o] > 2 * s) { const c = split(o); queue.push(c, c + 1, c + 2, c + 3, i); }
      }
    }
    /** the size of the leaves of a class that reach a hard edge (see wantsSplit), 0 on the open plain */
    const edgeLeaf = (li) => { const s = NS[li], k = CLASS[classOf(NX[li] + s / 2, NZ[li] + s / 2, s)]; return k.min > 8 * K ? 0 : Math.max(K, k.min / 2); };
    const PROBE = [[-0.01, -0.01], [0.01, -0.01], [-0.01, 0.01], [0.01, 0.01]];
    /**
     * How far behind a hard edge the mesh stays at bed level at this vertex: the curtain distance plus 1.5 x the
     * largest edge-sized leaf that has the vertex. Every triangle that touches the water is then at bed level, and
     * every rising face of the quadtree begins behind the curtain (and ends under the apron).
     */
    const edgeMax = (x, z) => { let m = 0; for (const [dx, dz] of PROBE) { const li = leafAt(x + dx, z + dz); if (li >= 0 && NS[li] > m && NS[li] <= edgeLeaf(li)) m = NS[li]; } return m; };
    function insetAt(x, z) {
      if (!nearHard || !nearHard(x, z, CURTAIN + 6.5 * K)) return STEP;
      const m = edgeMax(x, z);
      return m > 0 ? CURTAIN + 1.5 * m : STEP;
    }
    /**
     * The same for the edge of a raised platform (a palace terrace, a temple floor): the mesh keeps the level of the
     * ground outside for 0.3 m + 1.5 edge-sized leaves inside the outline, so its ragged rise never shows outside the
     * retaining wall that stands on the outline.
     */
    function platformInsetAt(x, z) {
      if (!nearStep || !ground.platformAt(x, z)) return STEP;
      const m = edgeMax(x, z);
      return m > 0 ? Math.max(STEP, 0.3 + 1.5 * m) : STEP;
    }
    const mh = nearHard || nearStep ? (x, z) => ground.meshHeight(x, z, insetAt(x, z), platformInsetAt(x, z)) : mh0;

    // ------------------------------------------------------------------------------------------------------
    // 3. the land-use maps
    // ------------------------------------------------------------------------------------------------------
    const P = world.palette.materials;
    const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const css = (c, a = 1) => `rgba(${Math.round(M.clamp(c[0], 0, 255))},${Math.round(M.clamp(c[1], 0, 255))},${Math.round(M.clamp(c[2], 0, 255))},${a})`;
    const C = Object.fromEntries(['alluvialSoilDry', 'streetEarth', 'streetEarthDamp', 'gardenGreen', 'barleyRipe', 'stubble', 'fallow', 'ploughedSoil', 'saltCrust', 'reedsGreen', 'wetBank', 'courtBrickPaving', 'palmFrond'].map((k) => [k, rgb(P[k])]));
    const soil = C.alluvialSoilDry;
    // What a land use looks like from the air at the barley harvest (R5 3.6): ripe barley gold, pale stubble,
    // weedy grey-brown fallow, dark ploughed soil, salt-flecked patches, and the dark earth and undergrowth of the
    // palm gardens (the crowns are the vegetation module's). Greens are kept earthy: no lawn (SPEC 3.1).
    const USE = {
      barleyRipe: mix(C.barleyRipe, soil, 0.14), stubble: mix(C.stubble, [206, 190, 150], 0.35), fallow: mix(C.fallow, [150, 140, 112], 0.35), ploughed: mix(C.ploughedSoil, soil, 0.08),
      saltCrust: mix(C.saltCrust, C.fallow, 0.3), palmGarden: mix(mix(C.gardenGreen, C.ploughedSoil, 0.7), soil, 0.22), garden: mix(C.gardenGreen, soil, 0.34),
      reedMarsh: mix(C.reedsGreen, C.wetBank, 0.45), urban: mix(soil, C.streetEarth, 0.5), steppe: mix(mix(C.fallow, soil, 0.4), [176, 166, 146], 0.4), bare: soil,
      street: C.streetEarth, built: mix(C.courtBrickPaving, soil, 0.35), water: mix(C.wetBank, [70, 66, 52], 0.5),
    };
    const madeGround = mix(soil, C.streetEarth, 0.5), trodden = mix(C.streetEarth, C.streetEarthDamp, 0.4);
    const mudDry = mix(soil, C.wetBank, 0.28), mudDamp = mix(soil, C.wetBank, 0.62), mudWet = mul(C.wetBank, 0.86);
    const farTone = USE.steppe;
    const noise = (x, z, period, seed) => {
      const fx = x / period, fz = z / period, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
      return M.lerp(M.lerp(hash2(i, j, seed), hash2(i + 1, j, seed), a), M.lerp(hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed), a), b);
    };
    /** base colour of a point that is not painted as a polygon: the land use itself; the dry margin as mottled fallow, salt and scrub */
    const useColour = (x, z) => {
      const lu = ground.landUse(x, z);
      if (lu.use === 'steppe' || (lu.strip && lu.strip[0] < 0)) {
        const s = noise(x, z, 620, 13) + 0.45 * (noise(x, z, 140, 14) - 0.5) + 0.25 * (noise(x, z, 37, 15) - 0.5);
        const scrub = noise(x, z, 260, 16) + 0.4 * (noise(x, z, 61, 17) - 0.5);
        let c = lu.use === 'steppe' ? USE.steppe : mix(USE.fallow, USE.steppe, 0.5);
        c = mix(c, mix(C.fallow, [118, 122, 88], 0.5), 0.5 * M.smoothstep(0.55, 0.85, scrub));     // tamarisk and camel-thorn scrub
        return mix(c, C.saltCrust, 0.75 * M.smoothstep(0.52, 0.78, s));                             // salt pans
      }
      return USE[lu.use] || soil;
    };
    const maxTex = ctx.renderer.capabilities.maxTextureSize, aniso = ctx.renderer.capabilities.getMaxAnisotropy();
    const texSize = Math.min(maxTex, ctx.quality.textureSize * 2);        // 4096 final, 1024 draft
    const innerSize = Math.min(maxTex, draft ? 2048 : 8192);              // the map the low and middle cameras see: 0.88 m per texel
    const fields = ground.fields || {};
    const strips = fields.strips || [], ditches = fields.ditches || [];
    const maxTier = strips.reduce((m, s) => (s ? Math.max(m, s.tier) : m), 0);
    const ditchByTier = []; for (const d of ditches) (ditchByTier[d.tier] || (ditchByTier[d.tier] = [])).push(d);
    // tileable mottle patterns (1 pixel = 1.5 m), drawn in world space
    const pattern = (g, seed, fn) => {
      const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
      const pg = cv.getContext('2d'), img = pg.createImageData(N, N);
      const wrap = (i, j, p, sd) => { const fx = i / p, fz = j / p, n2 = N / p, i0 = Math.floor(fx), j0 = Math.floor(fz), u = fx - i0, v = fz - j0, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v), h = (ii, jj) => hash2(((ii % n2) + n2) % n2, ((jj % n2) + n2) % n2, sd); return M.lerp(M.lerp(h(i0, j0), h(i0 + 1, j0), a), M.lerp(h(i0, j0 + 1), h(i0 + 1, j0 + 1), a), b); };
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = fn(wrap(i, j, 32, seed), wrap(i, j, 8, seed + 1), wrap(i, j, 2, seed + 2), hash2(i, j, seed + 3)), o = (j * N + i) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c.length > 3 ? c[3] : 255; }
      pg.putImageData(img, 0, 0);
      const pt = g.createPattern(cv, 'repeat'); pt.setTransform(new DOMMatrix().scale(1.5));
      return pt;
    };
    function paintMap(R, size) {
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d', { willReadFrequently: false }), sc = size / R.size, mpt = R.size / size;   // metres per texel
      // 3a. base: the land-use function itself on a coarse lattice, smoothed (zones, the dry margin, the steppe)
      const bn = Math.max(64, Math.min(1024, size >> 3)), base = document.createElement('canvas'); base.width = base.height = bn;
      const bg = base.getContext('2d'), img = bg.createImageData(bn, bn), cell = R.size / bn;
      for (let j = 0; j < bn; j++) for (let i = 0; i < bn; i++) {
        const x = R.x0 + (i + 0.5) * cell, z = R.z0 + (j + 0.5) * cell, c = useColour(x, z), v = 0.95 + 0.1 * hash2(i, j, 4401), o = (j * bn + i) * 4;
        img.data[o] = c[0] * v; img.data[o + 1] = c[1] * v; img.data[o + 2] = c[2] * v; img.data[o + 3] = 255;
      }
      bg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(base, 0, 0, size, size);
      g.setTransform(sc, 0, 0, sc, -R.x0 * sc, -R.z0 * sc);                 // from here on: world metres
      g.lineJoin = 'round'; g.lineCap = 'round';
      const inMap = (bb, pad = 0) => bb[2] > R.x0 - pad && bb[0] < R.x0 + R.size + pad && bb[3] > R.z0 - pad && bb[1] < R.z0 + R.size + pad;
      const poly = (ring) => { g.beginPath(); g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); };
      const line = (pl) => { g.beginPath(); g.moveTo(pl[0][0], pl[0][1]); for (let i = 1; i < pl.length; i++) g.lineTo(pl[i][0], pl[i][1]); };
      const stroke = (pl, w, c, a = 1) => { line(pl); g.lineWidth = w; g.strokeStyle = css(c, a); g.stroke(); };
      const fill = (ring, c, a = 1) => { poly(ring); g.fillStyle = css(c, a); g.fill(); };
      // mottles: undergrowth and shade in the palm gardens, salt flecks, weeds on fallow, reed clumps
      const PAT = {
        palmGarden: pattern(g, 510, (a, b, c, d) => { const k = 0.9 + 0.24 * b + 0.14 * (c - 0.5) - 0.1 * a; return mul(mix(USE.palmGarden, C.gardenGreen, 0.3 * M.smoothstep(0.55, 0.8, c)), k); }),
        saltCrust: pattern(g, 520, (a, b, c, d) => mix(mul(C.fallow, 0.98 + 0.06 * c), C.saltCrust, M.clamp(M.smoothstep(0.3, 0.72, 0.55 * a + 0.3 * b + 0.25 * c) * 0.95 + 0.25 * (d - 0.5), 0, 1))),
        fallow: pattern(g, 530, (a, b, c, d) => mul(mix(USE.fallow, [128, 132, 96], 0.5 * M.smoothstep(0.52, 0.8, 0.5 * b + 0.5 * c)), 0.95 + 0.1 * a)),
        reedMarsh: pattern(g, 540, (a, b, c, d) => mul(mix(USE.reedMarsh, C.wetBank, 0.6 * M.smoothstep(0.45, 0.7, b)), 0.88 + 0.24 * c)),
        steppe: pattern(g, 550, (a, b, c, d) => [128, 128, 128, 255]),
      };
      const fine = mpt < 2.6;
      // 3b. field strips, far tiers first (the order ground.js rasterised them in: a nearer tier wins); the head
      //     and side ditches of a tier go on top of its strips
      let k0 = 1;
      for (let tier = maxTier; tier >= 0; tier--) {
        let k = k0;
        for (; k < strips.length && strips[k].tier === tier; k++) {
          const s = strips[k], r = s.ring;
          if (!inMap(M.bbox(r))) continue;
          const h1 = hash2(s.seed, 11, 77), h2 = hash2(s.seed, 12, 77), hr = hash2(s.run, s.feeder * 16 + s.tier, 78), v = 0.86 + 0.08 * hr + 0.2 * h1;
          poly(r);
          if (PAT[s.use]) { g.fillStyle = PAT[s.use]; g.fill(); g.fillStyle = v < 1 ? `rgba(40,34,22,${(1 - v) * 0.9})` : `rgba(255,246,222,${(v - 1) * 0.9})`; g.fill(); }
          else { const c = USE[s.use] || soil; g.fillStyle = css([c[0] * v * (1 + 0.05 * (h2 - 0.5)), c[1] * v, c[2] * v * (1 - 0.12 * (h2 - 0.5))]); g.fill(); }
          // the bund between this strip and the next: one side only, so that neighbours share a line
          if (fine && s.use !== 'urban') { g.beginPath(); g.moveTo(r[1][0], r[1][1]); g.lineTo(r[2][0], r[2][1]); g.lineWidth = Math.max(mpt * 0.9, 1.5); g.strokeStyle = s.use === 'palmGarden' ? 'rgba(46,44,28,0.4)' : h2 < 0.55 ? 'rgba(54,44,30,0.62)' : 'rgba(232,218,186,0.5)'; g.stroke(); }
        }
        k0 = k;
        for (const d of ditchByTier[tier] || []) {
          if (!inMap(M.bbox(d.polyline), 10)) continue;
          if (d.kind === 'side') { stroke(d.polyline, d.width + 5, mix(USE.fallow, [120, 126, 86], 0.4), 0.55); stroke(d.polyline, Math.max(d.width, mpt * 0.9), mix(mudDamp, [86, 96, 78], 0.3), 0.9); }
          else { stroke(d.polyline, d.width + 3, mix(USE.fallow, [124, 128, 90], 0.3), 0.45); stroke(d.polyline, Math.max(d.width * 0.8, mpt * 0.8), mudDamp, 0.8); }
        }
      }
      // 3c. what is never a field, in the order ground.js cleared its raster: the walled city, the palace quarter,
      //     the wall zones, canals with levees, branch canals and ditches, roads, kiln yards, causeway heads
      const iw = world.innerWalls, OFF = iw.profile.offsetsFromImgurEnlilCentreline, OW = world.outerWall.profile.offsetsFromMudWallCentreline;
      for (const key of ['innerEast', 'innerWest']) { const e = world.enclosures[key], ring = Array.isArray(e) ? e : e && e.polygon; if (ring && ring.length > 2) fill(ring, USE.urban); }
      if (ground.palaceQuarter) fill(ground.palaceQuarter, madeGround);
      g.lineJoin = 'miter'; g.lineCap = 'butt';
      for (const side of ['east', 'west']) stroke(iw[side].innerLine, 2 * (OFF.quay[1] + 1), madeGround);
      stroke(world.outerWall.line, 2 * (OW.quay[1] + 1), madeGround);
      g.lineJoin = 'round'; g.lineCap = 'round';
      for (const c of ground.canals || []) {
        if (!c.levee) continue;
        stroke(c.polyline, c.width + 44, mix(soil, C.fallow, 0.5));                 // the spoil banks: bare, trodden along the crest
        stroke(c.polyline, c.width + 31, mix(soil, C.saltCrust, 0.25), 0.5);
        stroke(c.polyline, c.width + 15, mudDry, 0.9);                              // the inner slopes
        stroke(c.polyline, c.width + 5, mudDamp);
        stroke(c.polyline, c.width, USE.water);
      }
      for (const b of fields.branches || []) {
        if (!inMap(M.bbox(b.polyline), 12)) continue;
        if (b.order === 2) { stroke(b.polyline, b.width + 9, mix(soil, C.fallow, 0.6), 0.8); stroke(b.polyline, b.width + 3.5, mix(mudDamp, [104, 112, 76], 0.45), 0.9); stroke(b.polyline, Math.max(b.width, mpt * 1.2), mix([70, 84, 74], C.wetBank, 0.4)); }
        else { stroke(b.polyline, b.width + 4.5, mix(USE.fallow, [118, 124, 84], 0.45), 0.7); stroke(b.polyline, Math.max(b.width, mpt), mix([78, 88, 76], C.wetBank, 0.5)); }
      }
      for (const r of ground.roads || []) {
        stroke(r.polyline, r.width + 5, mix(soil, C.fallow, 0.4), 0.7);
        stroke(r.polyline, Math.max(r.width, mpt * 1.2), mix(C.streetEarth, C.saltCrust, 0.22));
      }
      for (const cw of ground.causeways || []) { const ux = (cw.to[0] - cw.from[0]) / cw.length, uz = (cw.to[1] - cw.from[1]) / cw.length; stroke([cw.to, [cw.to[0] + ux * 30, cw.to[1] + uz * 30]], 16, madeGround, 0.9); }
      // kiln yards: clay pits (dark, damp) and the pale drying floors of the brick makers, not a disc
      (ground.kilnYards || []).forEach((k, ki) => {
        for (let q = 0; q < 7; q++) {
          const a = M.TAU * hash2(ki, q, 610), d = k.radius * (0.15 + 0.62 * hash2(ki, q, 611)), x = k.x + Math.cos(a) * d, z = k.z + Math.sin(a) * d, rot = 180 * hash2(ki, q, 612);
          if (q < 3) { const ring = []; for (let t = 0; t < 12; t++) { const an = (t / 12) * M.TAU, rr = (9 + 13 * hash2(ki, q, 613)) * (0.7 + 0.5 * hash2(t, ki * 8 + q, 614)); ring.push([x + Math.cos(an) * rr, z + Math.sin(an) * rr * 0.75]); } fill(ring, mix(C.ploughedSoil, C.wetBank, 0.5), 0.9); }
          else fill(M.rectRing(x, z, 16 + 22 * hash2(ki, q, 615), 9 + 9 * hash2(ki, q, 616), rot), mix(C.streetEarth, C.saltCrust, 0.25), 0.85);
        }
      });
      // 3d. inside the walls and in the suburbs: the layout's blocks, open ground and streets
      if (layout && layout.blocks) {
        for (let bi = 0; bi < layout.blocks.length; bi++) {
          const b = layout.blocks[bi];
          if (!b.polygon || b.polygon.length < 3 || !inMap(M.bbox(b.polygon))) continue;
          const v = 0.9 + 0.12 * hash2(bi, 5, 4402);
          fill(b.polygon, mix(C.streetEarthDamp, C.streetEarth, 0.45).map((q) => q * v));
        }
        const veg = mix(C.gardenGreen, C.ploughedSoil, 0.45);
        const OPEN = { vegetable: mix(veg, soil, 0.3), orchard: mix(veg, [72, 80, 52], 0.3), palms: mix(veg, [70, 74, 52], 0.4), estate: mix(veg, soil, 0.35), palace: mix(veg, soil, 0.25), temple: mix(veg, soil, 0.4), backyard: mix(soil, veg, 0.25),
          empty: mix(soil, C.fallow, 0.5), ruin: mix(C.fallow, C.ploughedSoil, 0.35), rubbish: mix(C.ploughedSoil, [96, 90, 80], 0.4), brickPit: mix(C.ploughedSoil, C.wetBank, 0.4), bank: mix(soil, C.wetBank, 0.3) };
        const open = layout.openSpaces || [];
        for (let oi = 0; oi < open.length; oi++) {
          const o = open[oi];
          if (!o.polygon || o.polygon.length < 3 || !inMap(M.bbox(o.polygon))) continue;
          const c = OPEN[o.use] || (o.kind === 'garden' ? OPEN.vegetable : o.kind === 'palmGrove' ? OPEN.palms : o.kind === 'square' ? C.streetEarth : OPEN.empty);
          const v = 0.92 + 0.16 * hash2(oi, 6, 4403);
          fill(o.polygon, c.map((q) => q * v));
        }
        // trodden yards round the houses outside the walls (suburbs, road ribbons, villages): ribbons, not discs
        if (fine) for (const h of layout.houses || []) {
          if (h.enclosure === 'innerEast' || h.enclosure === 'innerWest' || !h.footprint || !inMap(M.bbox(h.footprint), 8)) continue;
          poly(h.footprint); g.lineWidth = 9; g.strokeStyle = css(trodden, 0.7); g.stroke(); g.fillStyle = css(trodden); g.fill();
        }
        const tone = { processional: mix(C.streetEarth, C.saltCrust, 0.3), main: mix(C.streetEarth, C.saltCrust, 0.15), lane: C.streetEarth, alley: mix(C.streetEarth, C.streetEarthDamp, 0.35), road: mix(C.streetEarth, C.saltCrust, 0.22) };
        g.lineCap = 'butt';
        for (const s of layout.streets || []) {
          if (!s.polyline || s.polyline.length < 2 || !inMap(s.bb || M.bbox(s.polyline), 20)) continue;
          stroke(s.polyline, Math.max(s.width || 3, mpt * 1.1), tone[s.cls] || C.streetEarth);
        }
        g.lineCap = 'round';
      }
      // 3e. monuments and their courts; made terraces; the garden terraces of the North Palace
      for (const m of world.monuments) { const r = m.footprint && m.footprint.polygon; if (r && inMap(M.bbox(r))) fill(r, USE.built); }
      for (const p of ground.platforms || []) {
        if (!p.polygon || !inMap(M.bbox(p.polygon))) continue;
        if (/:garden:/.test(p.id) || /gardenStrip/.test(p.id)) fill(p.polygon, mix(mix(C.gardenGreen, C.ploughedSoil, 0.6), soil, 0.2));
        else if (/canalQuay|dryStrip|forecourt/.test(p.id)) fill(p.polygon, USE.built);
        else if (/northLane|northStrip|northFortification/.test(p.id)) fill(p.polygon, madeGround);
      }
      // 3f. earth banks: bare above, damp below, wet at the water; then the beds of river and moats
      for (const e of ground.banks || []) {
        if (e.type !== 'earth' || !inMap(M.bbox([e.a, e.b]), 20)) continue;
        const pl = [e.a, e.b];
        stroke(pl, 30, mudDry, 0.5); stroke(pl, 17, mudDry, 0.75); stroke(pl, 10, mudDamp, 0.85); stroke(pl, 4, mudWet);
      }
      for (const r of [world.river.polygon, ...world.moats.map((m) => m.polygon)]) fill(r, USE.water);
      // 3g. a soft mottle over everything (two scales), so that no fill is flat
      g.globalCompositeOperation = 'soft-light';
      const mott = pattern(g, 560, (a, b, c, d) => { const v = 128 + 38 * (a - 0.5) + 34 * (b - 0.5) + 26 * (c - 0.5); return [v, v, v, 255]; });
      g.fillStyle = mott; g.fillRect(R.x0, R.z0, R.size, R.size);
      mott.setTransform(new DOMMatrix().scale(11.3).rotate(31)); g.globalAlpha = 0.8; g.fillRect(R.x0, R.z0, R.size, R.size);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // 3h. the rim of the outer map dissolves into the tone of the open plain (the vertex-coloured far field)
      if (R === OUTER) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        const rim = Math.round(size * 0.06), c0 = css(farTone, 0), c1 = css(farTone, 1);
        const side = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, c1); gr.addColorStop(1, c0); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
        side(0, 0, rim, 0, 0, 0, rim, size); side(size, 0, size - rim, 0, size - rim, 0, rim, size);
        side(0, 0, 0, rim, 0, 0, size, rim); side(0, size, 0, size - rim, 0, size - rim, size, rim);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.name = 'terrain:landUse:' + (R === INNER ? 'inner' : 'outer'); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = aniso; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      return tex;
    }
    const maps = [paintMap(INNER, innerSize), paintMap(OUTER, texSize)];

    // ------------------------------------------------------------------------------------------------------
    // 3x. the field direction map of the inner region and the hook that reads it
    //     R, G: unit vector of twice the strip's angle x the strength of its rows; B: nearness of an earth bank
    // ------------------------------------------------------------------------------------------------------
    const FM = draft ? 1024 : 2048, fmData = new Uint8Array(FM * FM * 4), fmCell = INNER.size / FM;
    const SM = draft ? 512 : 1024, smData = new Uint8Array(SM * SM), smCell = INNER.size / SM;
    if (fields.stripAt) {
      // per strip, once: use, angle (12 bit over 180 degrees), centreline and half width across that angle
      const rec = new Map();
      const recOf = (st) => {
        let r = rec.get(st.id); if (r !== undefined) return r;
        const u = USE_ID[st.use] || 0;
        if (!u) { rec.set(st.id, null); return null; }
        let th = Math.atan2(st.dir[1], st.dir[0]); if (th < 0) th += Math.PI;
        const ang = Math.round((th / Math.PI) * 4096) & 4095, tq = (ang * Math.PI) / 4096, px = -Math.sin(tq), pz = Math.cos(tq), g = st.ring;
        const c0 = ((g[0][0] + g[1][0] + g[2][0] + g[3][0]) * px + (g[0][1] + g[1][1] + g[2][1] + g[3][1]) * pz) / 4;
        const w0 = Math.abs((g[1][0] - g[0][0]) * px + (g[1][1] - g[0][1]) * pz), w1 = Math.abs((g[2][0] - g[3][0]) * px + (g[2][1] - g[3][1]) * pz);
        r = { hi: (u << 4) | (ang >> 8), lo: ang & 255, px, pz, c0, hw: Math.min(255, Math.round((Math.min(w0, w1) / 2 + 0.25 * Math.abs(w0 - w1) / 2) / 0.3)) };
        rec.set(st.id, r); return r;
      };
      for (let j = 0, o = 0; j < FM; j++) for (let i = 0; i < FM; i++, o += 4) {
        const x = INNER.x0 + (i + 0.5) * fmCell, z = INNER.z0 + (j + 0.5) * fmCell, st = fields.stripAt(x, z), r = st ? recOf(st) : null;
        if (!r) continue;
        const dq = Math.round((r.c0 - (x * r.px + z * r.pz)) / 0.3) + 128;
        if (dq < 0 || dq > 255) continue;
        fmData[o] = r.hi; fmData[o + 1] = r.lo; fmData[o + 2] = dq; fmData[o + 3] = r.hw;
      }
      // shore map: 1 on the line of an earth bank, 0 at 14 m from it
      const stamp = (ax, az, bx, bz, r) => {
        const len = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(len / 40));
        for (let q = 0; q < m; q++) {
          const x0 = ax + ((bx - ax) * q) / m, z0 = az + ((bz - az) * q) / m, x1 = ax + ((bx - ax) * (q + 1)) / m, z1 = az + ((bz - az) * (q + 1)) / m;
          const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - r - INNER.x0) / smCell)), i1 = Math.min(SM - 1, Math.ceil((Math.max(x0, x1) + r - INNER.x0) / smCell));
          const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - r - INNER.z0) / smCell)), j1 = Math.min(SM - 1, Math.ceil((Math.max(z0, z1) + r - INNER.z0) / smCell));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const d = M.distToSegment(INNER.x0 + (i + 0.5) * smCell, INNER.z0 + (j + 0.5) * smCell, x0, z0, x1, z1)[0], v = Math.round(255 * M.clamp(1 - d / r, 0, 1)), o = j * SM + i;
            if (v > smData[o]) smData[o] = v;
          }
        }
      };
      for (const e of ground.banks || []) if (e.type === 'earth') stamp(e.a[0], e.a[1], e.b[0], e.b[1], 16);
      for (const c of ground.canals || []) if (c.levee) for (let i = 0; i + 1 < c.polyline.length; i++) stamp(c.polyline[i][0], c.polyline[i][1], c.polyline[i + 1][0], c.polyline[i + 1][1], c.width / 2 + 11);
    }
    const fieldMap = new THREE.DataTexture(fmData, FM, FM, THREE.RGBAFormat, THREE.UnsignedByteType);
    fieldMap.name = 'terrain:fieldMap'; fieldMap.colorSpace = THREE.NoColorSpace; fieldMap.flipY = false;
    fieldMap.wrapS = fieldMap.wrapT = THREE.ClampToEdgeWrapping; fieldMap.magFilter = THREE.NearestFilter; fieldMap.minFilter = THREE.NearestFilter; fieldMap.generateMipmaps = false; fieldMap.needsUpdate = true;
    const shoreMap = new THREE.DataTexture(smData, SM, SM, THREE.RedFormat, THREE.UnsignedByteType);
    shoreMap.name = 'terrain:shoreMap'; shoreMap.colorSpace = THREE.NoColorSpace; shoreMap.flipY = false;
    shoreMap.wrapS = shoreMap.wrapT = THREE.ClampToEdgeWrapping; shoreMap.magFilter = THREE.LinearFilter; shoreMap.minFilter = THREE.LinearMipmapLinearFilter; shoreMap.generateMipmaps = true; shoreMap.needsUpdate = true;
    const fieldUniforms = { uTFieldMap: { value: fieldMap }, uTShoreMap: { value: shoreMap }, uTFieldRect: { value: new THREE.Vector4(INNER.x0, INNER.z0, 1 / INNER.size, WL) }, uTFieldSize: { value: new THREE.Vector2(FM, fmCell) } };
    const fieldHook = {
      name: 'terrainFields', order: 60,                             // after 'variation' (50): it adds to that hook's normal delta and wetness
      filter: (m, info) => !!(info && info.terrainFields),
      shader(shader, material, renderer, patch) {
        patch.uniforms(fieldUniforms);
        patch.fragment.header(FIELD_PARS);
        patch.fragment.after('<color_fragment>', fieldChunk(/\bbblNd\b/.test(shader.fragmentShader), /\bbblWet\b/.test(shader.fragmentShader)));
      },
      key: () => 'tf8',
    };
    materials.addHook(fieldHook);

    const mats = [
      // inner map: trodden earth (the 'earth' set of the streets) where the low cameras are; the cracked alluvium of the
      // 'soil' set is for the open plain
      materials.variant('streetEarth', { name: 'terrain-inner', color: 0xffffff, map: maps[0], texture: 'earth', mask: 0.6, info: { terrainFields: true } }),
      materials.variant('alluvialSoilDry', { name: 'terrain-outer', color: 0xffffff, map: maps[1], texture: 'soil' }),
      materials.variant('alluvialSoilDry', { name: 'terrain-far' }),          // palette colour x the vertex tint farMul
    ];
    const farLin = new THREE.Color().setRGB(farTone[0] / 255, farTone[1] / 255, farTone[2] / 255, THREE.SRGBColorSpace);
    const soilLin = materials.color('alluvialSoilDry');
    const farMul = [farLin.r / soilLin.r, farLin.g / soilLin.g, farLin.b / soilLin.b];   // 'terrain-far' has no map: the tone is a vertex tint

    // ------------------------------------------------------------------------------------------------------
    // 4. triangles, binned by group (inner / outer / far) and tile
    // ------------------------------------------------------------------------------------------------------
    const TILES = [1024, 4096, 16384], REGION = [INNER, OUTER, null];
    const bins = new Map();
    const groupOf = (cx, cz, s) => {
      const h = s / 2;
      if (cx - h >= INNER.x0 + 8 && cx + h <= INNER.x0 + INNER.size - 8 && cz - h >= INNER.z0 + 8 && cz + h <= INNER.z0 + INNER.size - 8) return 0;
      if (cx - h >= OUTER.x0 + 20 && cx + h <= OUTER.x0 + OUTER.size - 20 && cz - h >= OUTER.z0 + 20 && cz + h <= OUTER.z0 + OUTER.size - 20) return 1;
      return 2;
    };
    const binFor = (g, cx, cz) => {
      const T = TILES[g], tx = Math.floor(cx / T), tz = Math.floor(cz / T), key = g * 1e8 + (tx + 5000) * 10000 + (tz + 5000);
      let b = bins.get(key);
      if (!b) bins.set(key, (b = { g, tx, tz, pos: [], nor: [], col: [], uv: [], idx: [], vmap: new Map(), water: false }));
      return b;
    };
    const offExamples = [];
    const RING8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
    let nVerts = 0, nTris = 0, minLeaf = Infinity, landBelow = 0, waterAbove = 0, offGround = 0, checked = 0;
    const leafCount = [0, 0, 0, 0, 0];
    /** unit normal of the height field; a sheer step (hidden in masonry) does not tilt the ground beside it */
    function normalAt(x, z, e, fn, out) {
      let gx = (fn(x + e, z) - fn(x - e, z)) / (2 * e), gz = (fn(x, z + e) - fn(x, z - e)) / (2 * e);
      const g2 = gx * gx + gz * gz;
      if (g2 > 0.49) { if (g2 > 4) { gx = 0; gz = 0; } else { const k = 0.7 / Math.sqrt(g2); gx *= k; gz *= k; } }
      const l = Math.hypot(gx, 1, gz);
      out.push(-gx / l, 1 / l, -gz / l);
    }
    function vert(b, x, z, s) {
      const key = (x * 2 + 70000) * 140001 + (z * 2 + 70000);
      let i = b.vmap.get(key);
      if (i !== undefined) return i;
      i = b.pos.length / 3;
      const inset = insetAt(x, z), y = mh(x, z);
      b.pos.push(x, y, z); normalAt(x, z, M.clamp(s / 2, 0.75, 8), mh, b.nor);
      // the bed is wet silt; the plain beyond the maps carries its tone as a vertex tint
      const wet = M.smoothstep(WL + 0.1, WL - 0.6, y), k = 1 - 0.34 * wet;
      if (b.g === 2) b.col.push(farMul[0] * k, farMul[1] * k, farMul[2] * k); else b.col.push(k, k * (1 - 0.02 * wet), k * (1 - 0.05 * wet));
      const R = REGION[b.g];
      if (R) b.uv.push((x - R.x0) / R.size, (z - R.z0) / R.size);
      if (y < WL + 0.3 && y > WL - 2.5) b.water = true;
      b.vmap.set(key, i); nVerts++;
      // self-check on the fly, where the ground is locally smooth (meshHeight differs from height only at steps, which
      // it moves into the masonry, and on monument floors, which it sinks by 0.15 m): the mesh is the ground, land
      // stays above the water plane and beds stay below it. The trench behind a hard edge is under its apron.
      if (s <= 8 && (i & 3) === 0 && !(nearHard && nearHard(x, z, inset + 0.3)) && !(nearStep && nearStep(x, z, platformInsetAt(x, z) + 0.3, 0.3))) {
        const h = ground.height(x, z);
        let smooth = true;
        for (const d of [1.3, 2.6]) for (const [ux, uz] of RING8) if (Math.abs(ground.height(x + ux * d, z + uz * d) - h) >= 0.3) smooth = false;
        if (smooth) {
          checked++;
          if (Math.abs(y - h) > 0.46) { offGround++; if (offExamples.length < 6) offExamples.push([x, z, +h.toFixed(2), +y.toFixed(2)]); }                 // a step under 0.3 m at a platform edge + the 0.15 m sink
          const w = ground.isWater(x, z);
          if (w && h < WL - 0.3 && y > WL - 0.05) waterAbove++;
          if (!w && h > WL + 0.3 && y < WL) landBelow++;
        }
      }
      return i;
    }
    for (let i = 0; i < n; i++) {
      if (NC[i] >= 0) continue;
      const s = NS[i], x0 = NX[i], z0 = NZ[i], x1 = x0 + s, z1 = z0 + s, cx = x0 + s / 2, cz = z0 + s / 2;
      const b = binFor(groupOf(cx, cz, s), cx, cz);
      if (s < minLeaf) minLeaf = s;
      leafCount[classOf(cx, cz, s)]++;
      const finer = (px, pz) => { const o = leafAt(px, pz); return o >= 0 && NS[o] < s; };
      const fw = finer(x0 - 0.25, cz - s / 4), fs = finer(cx - s / 4, z1 + 0.25), fe = finer(x1 + 0.25, cz - s / 4), fn = finer(cx - s / 4, z0 - 0.25);
      const v00 = vert(b, x0, z0, s), v01 = vert(b, x0, z1, s), v11 = vert(b, x1, z1, s), v10 = vert(b, x1, z0, s);
      if (!fw && !fs && !fe && !fn) {
        // two triangles, split along the diagonal whose ends are closer in height (follows ridges and banks)
        const P2 = b.pos, d1 = Math.abs(P2[v00 * 3 + 1] - P2[v11 * 3 + 1]), d2 = Math.abs(P2[v01 * 3 + 1] - P2[v10 * 3 + 1]);
        if (d1 <= d2) b.idx.push(v00, v01, v11, v00, v11, v10); else b.idx.push(v00, v01, v10, v01, v11, v10);
        nTris += 2;
      } else {
        // a fan round the centre: west side going south, south side going east, east side going north, north side going west
        const c = vert(b, cx, cz, s), ring = [v00];
        if (fw) ring.push(vert(b, x0, cz, s)); ring.push(v01);
        if (fs) ring.push(vert(b, cx, z1, s)); ring.push(v11);
        if (fe) ring.push(vert(b, x1, cz, s)); ring.push(v10);
        if (fn) ring.push(vert(b, cx, z0, s));
        for (let q = 0; q < ring.length; q++) b.idx.push(c, ring[q], ring[(q + 1) % ring.length]);
        nTris += ring.length;
      }
    }

    // ------------------------------------------------------------------------------------------------------
    // 5. curtains and aprons: along every hard edge (quay lines, lined canal sides) and along every edge of a
    //    platform that stands 0.5 m or more above the ground outside it. The quadtree keeps the LOW level for
    //    1.5 leaf sizes into the high side there (insetAt, platformInsetAt); this strip lays the exact step over
    //    that trench: a vertical curtain just inside the high side and an apron at the true level behind it.
    // ------------------------------------------------------------------------------------------------------
    let edgeTris = 0, edgeLen = 0, platLen = 0, edgeGaps = 0, apronMax = 0;
    const baseVerts = new Map();                       // vertices of the closed quadtree surface per tile (the strips come after them)
    for (const b of bins.values()) baseVerts.set(`${b.g}:${b.tx}:${b.tz}`, b.pos.length / 3);
    const height = ground.height, COLS = [0, 0.22, 0.55, 1], PCURTAIN = 0.3;
    /** a vertex outside the shared lattice: position, normal, tint, map coordinate of (ux, uz) */
    const push = (b, x, y, z, nx, ny, nz, ux, uz, k) => {
      const i = b.pos.length / 3, R = REGION[b.g];
      b.pos.push(x, y, z); b.nor.push(nx, ny, nz);
      if (b.g === 2) b.col.push(farMul[0] * k, farMul[1] * k, farMul[2] * k); else b.col.push(k, k, k);
      if (R) b.uv.push((ux - R.x0) / R.size, (uz - R.z0) / R.size);
      if (y < WL + 0.3) b.water = true;
      nVerts++;
      return i;
    };
    /** a quad a-b-c-d (a to b along the edge, d above a) facing the side of (fx, fy, fz) */
    const quad = (b, A, B2, C2, D, fx, fy, fz) => {
      const ux = B2[0] - A[0], uy = B2[1] - A[1], uz = B2[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
      const front = (uy * vz - uz * vy) * fx + (uz * vx - ux * vz) * fy + (ux * vy - uy * vx) * fz >= 0;
      const ia = push(b, ...A), ib = push(b, ...B2), ic = push(b, ...C2), id = push(b, ...D);
      if (front) b.idx.push(ia, ib, ic, ia, ic, id); else b.idx.push(ia, ic, ib, ia, id, ic);
      nTris += 2; edgeTris += 2;
    };
    const wetK = (y) => 1 - 0.34 * M.smoothstep(WL + 0.1, WL - 0.6, y);
    const sinkAt = (x, z) => { const p = ground.platformAt ? ground.platformAt(x, z) : null; return p && p.sink ? p.sink : 0; };
    /** stations along a polyline, closer where the leaves are finer: { x, z, ux, uz, nx, nz (unit, to the high side), corner, mx, mz (mitred offset) } */
    function stationsOf(pl, side, closed) {
      const st = [], n = pl.length - 1;
      let first = null, prev = null;
      for (let i = 0; i < n; i++) {
        const a = pl[i], b2 = pl[i + 1], len = Math.hypot(b2[0] - a[0], b2[1] - a[1]); if (len < 0.02) continue;
        const ux = (b2[0] - a[0]) / len, uz = (b2[1] - a[1]) / len, nx = -uz * side, nz = ux * side;
        if (!first) first = [nx, nz];
        let s = 0;
        while (s < len - 0.01) {
          const x = a[0] + ux * s, z = a[1] + uz * s, ls = Math.max(K, leafSize(x + nx * 2, z + nz * 2));
          st.push({ x, z, ux, uz, nx, nz, corner: s === 0 });
          s += Math.min(len - s, M.clamp(ls * 1.5, 1.5 * K, 6));
        }
        prev = { x: b2[0], z: b2[1], ux, uz, nx, nz, corner: true };
      }
      if (prev) st.push(prev);
      // mitre the corners: the offset direction at a vertex is the bisector, lengthened
      const mitre = (p, ax, az) => { const bx = ax + p.nx, bz = az + p.nz, l = Math.hypot(bx, bz); if (l < 0.3 || (ax === p.nx && az === p.nz)) return; const k = Math.min(2.2, 2 / l) / l; p.mx = bx * k; p.mz = bz * k; };
      for (let i = 1; i < st.length - 1; i++) if (st[i].corner) mitre(st[i], st[i - 1].nx, st[i - 1].nz);
      if (closed && st.length > 2 && first) { const l = st[st.length - 1]; mitre(st[0], l.nx, l.nz); l.mx = st[0].mx; l.mz = st[0].mz; }
      return st;
    }
    /**
     * Curtain and apron along stations. o = { curtain (m into the high side), foot(p) -> level of the curtain's
     * foot, top(x, z) -> level of the apron, ok(p, x, z) -> may a curtain stand at (x, z), reach(p, ox, oz, W) -> W
     * clipped to what the apron may cover }. Returns the metres laid.
     */
    function layStrip(st, o) {
      if (st.length < 2) return 0;
      // apron width from the leaves under it: the ragged rise of the quadtree ends 2.9 leaf sizes behind the curtain
      for (const p of st) {
        const f = Math.max(K, leafSize(p.x + p.nx * 0.5, p.z + p.nz * 0.5));       // the edge leaf here
        let W = 3 * f + 1;
        for (const d of [2, 4, 7, 11, 16]) { if (d > o.curtain + 1.5 * f + 0.5) break; W = Math.max(W, 1.5 * f + 1.5 * leafSize(p.x + p.nx * d, p.z + p.nz * d) + 1); }
        p.W = W;
      }
      for (let i = 0; i < st.length; i++) { const a = st[Math.max(0, i - 1)].W, c = st[Math.min(st.length - 1, i + 1)].W; st[i].W2 = Math.max(st[i].W, a, c); }
      // columns of each station; a station where no curtain may stand (water: a canal mouth; a platform edge that is not raised) is a gap
      for (const p of st) {
        const ox = p.mx !== undefined ? p.mx : p.nx, oz = p.mz !== undefined ? p.mz : p.nz;
        const W = o.reach ? o.reach(p, ox, oz, p.W2) : p.W2;
        p.c = COLS.map((t) => { const d = o.curtain + t * W, x = p.x + ox * d, z = p.z + oz * d; return [x, o.top(x, z), z]; });
        p.foot = o.foot(p);
        p.dry = W > 0.4 && o.ok(p, p.c[0][0], p.c[0][2]) && p.c[0][1] > p.foot + 0.3;
        if (p.dry && W > apronMax) apronMax = W;
      }
      const up = [0, 1, 0];
      const cap = (p, sign) => {         // closes the trench at the end of a run: across the columns, from the apron down to the foot
        for (let k = 0; k + 1 < COLS.length; k++) {
          const A = p.c[k], B2 = p.c[k + 1], b = binFor(groupOf(A[0], A[2], 1), A[0], A[2]), fx = p.ux * sign, fz = p.uz * sign, w = wetK(p.foot);
          quad(b, [A[0], p.foot, A[2], fx, 0, fz, A[0], A[2], w], [B2[0], p.foot, B2[2], fx, 0, fz, B2[0], B2[2], w], [B2[0], B2[1], B2[2], fx, 0, fz, B2[0], B2[2], 1], [A[0], A[1], A[2], fx, 0, fz, A[0], A[2], 1], fx, 0, fz);
        }
      };
      let laid = 0;
      for (let i = 0; i + 1 < st.length; i++) {
        const p = st[i], q = st[i + 1];
        if (!p.dry || !q.dry) { if (p.dry !== q.dry) { edgeGaps++; cap(p.dry ? p : q, p.dry ? 1 : -1); } continue; }
        if (i === 0 && !o.closed) cap(p, -1);
        if (i + 2 === st.length && !o.closed) cap(q, 1);
        const mx = (p.c[0][0] + q.c[0][0]) / 2, mz = (p.c[0][2] + q.c[0][2]) / 2, b = binFor(groupOf(mx, mz, 1), mx, mz);
        laid += Math.hypot(q.x - p.x, q.z - p.z);
        // the curtain: its colour is that of the ground at its top (no stretched map), wet at the foot
        const A = p.c[0], B2 = q.c[0], fx = -p.nx, fz = -p.nz;
        quad(b, [A[0], p.foot, A[2], fx, 0, fz, A[0], A[2], wetK(p.foot)], [B2[0], q.foot, B2[2], fx, 0, fz, B2[0], B2[2], wetK(q.foot)], [B2[0], B2[1], B2[2], fx, 0, fz, B2[0], B2[2], 1], [A[0], A[1], A[2], fx, 0, fz, A[0], A[2], 1], fx, 0, fz);
        // the apron
        for (let k = 0; k + 1 < COLS.length; k++) {
          const a0 = p.c[k], a1 = q.c[k], b1 = q.c[k + 1], b0 = p.c[k + 1];
          quad(b, [a0[0], a0[1], a0[2], ...up, a0[0], a0[2], 1], [a1[0], a1[1], a1[2], ...up, a1[0], a1[2], 1], [b1[0], b1[1], b1[2], ...up, b1[0], b1[2], 1], [b0[0], b0[1], b0[2], ...up, b0[0], b0[2], 1], 0, 1, 0);
        }
      }
      return laid;
    }
    /** how far along the ray from station p (direction ox, oz) pred(x, z) holds: from d0 to at most d1, to 2 cm */
    const march = (p, ox, oz, d0, d1, pred) => {
      let d = d0;
      while (d + 0.5 <= d1 && pred(p.x + ox * (d + 0.5), p.z + oz * (d + 0.5))) d += 0.5;
      if (d + 0.5 > d1) return pred(p.x + ox * d1, p.z + oz * d1) ? d1 : d;
      let lo = d, hi = d + 0.5;
      for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (pred(p.x + ox * m, p.z + oz * m)) lo = m; else hi = m; }
      return lo - 0.02;
    };
    // 5a. hard edges: bed level under the quay wall, the curtain 1 m behind the line. The apron follows height()
    //     and stops in front of the next sharp step behind the quay (a terrace wall a few metres inland)
    for (const e of hardEdges) {
      edgeLen += layStrip(stationsOf(e.polyline, e.land, false), {
        curtain: CURTAIN, foot: () => e.foot - 0.4, top: (x, z) => height(x, z) - sinkAt(x, z) + LIFT,
        ok: (p, x, z) => !ground.isWater(x, z) && height(x, z) > WL + 0.2,
        reach: (p, ox, oz, W) => {
          let h = height(p.x + ox * CURTAIN, p.z + oz * CURTAIN);
          return march(p, ox, oz, CURTAIN, CURTAIN + W, (x, z) => { const y = height(x, z), same = Math.abs(y - h) < 0.45; h = y; return same; }) - CURTAIN;
        },
      });
    }
    // 5b. raised platform edges: the terrace is level right up to a curtain 0.3 m inside its outline
    if (nearStep) for (const pf of ground.platforms) {
      const ring = pf.polygon; if (!ring || ring.length < 4) continue;
      const inP = (x, z) => { const q = ground.platformAt(x, z); return !!q && q.id === pf.id; };
      const top = pf.level - (pf.sink || 0) + LIFT;
      platLen += layStrip(stationsOf(ring, M.polygonArea(ring) > 0 ? 1 : -1, true), {
        curtain: PCURTAIN, closed: true, top: () => top,
        foot: (p) => { p.out = height(p.x - p.nx * 0.3, p.z - p.nz * 0.3); return Math.min(p.out, top - 0.5) - 0.4; },
        ok: (p, x, z) => inP(x, z) && pf.level - p.out >= 0.5 && !(nearHard && nearHard(p.x, p.z, 1.6)),
        // the apron stays inside its own platform (a terrace may be narrower than the apron is wide)
        reach: (p, ox, oz, W) => march(p, ox, oz, PCURTAIN, PCURTAIN + W, inP) - PCURTAIN,
      });
    }

    let reflectTiles = 0;
    for (const b of bins.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      if (b.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      const reflect = b.g === 0 && b.water;
      if (reflect) reflectTiles++;
      geom.addStatic(mats[b.g], g, { castShadow: false, receiveShadow: true, ao: false, occluder: false, reflect, tile: TILES[b.g], tileKey: [b.tx, b.tz] });
    }

    const budget = draft || coarse ? 0.7e6 : 1.3e6;
    const mapsMB = Math.round(((innerSize * innerSize + texSize * texSize) * 4 * 1.33 + FM * FM * 4 + SM * SM * 1.33) / 1048576);
    return {
      stats: { offGroundExamples: offExamples, triangles: nTris, vertices: nVerts, leaves: leafCount.reduce((a, v) => a + v, 0), leavesByClass: leafCount, nodes: n, smallestLeaf: minLeaf, tiles: bins.size, reflectTiles,
        hardEdges: hardEdges.length, hardEdgeMetres: Math.round(edgeLen), platformEdgeMetres: Math.round(platLen), edgeTriangles: edgeTris, edgeGaps, apronWidestMetres: +apronMax.toFixed(1),
        strips: Math.max(0, strips.length - 1), ditchLines: ditches.length, innerMapSize: innerSize, outerMapSize: texSize, fieldMapSize: FM, innerMetresPerTexel: +(INNER.size / innerSize).toFixed(2), outerMetresPerTexel: +(OUTER.size / texSize).toFixed(2), mapsMB },
      checks: [
        { name: 'terrain triangles within the budget', value: nTris, expect: `<= ${budget}`, pass: nTris <= budget },
        { name: 'smallest leaf (m) at the low cameras', value: minLeaf, expect: `<= ${K}`, pass: minLeaf <= K },
        // a handful remain where two platforms abut with a sliver of lower ground between them (inside the monuments' walls)
        { name: 'mesh vertices more than 0.46 m off ctx.ground.height (smooth ground only)', value: offGround, expect: `<= ${Math.ceil(checked * 0.0005)} of ${checked}`, pass: offGround <= checked * 0.0005 },
        { name: 'land vertices below the water plane (smooth ground only)', value: landBelow, expect: '0', pass: landBelow === 0 },
        { name: 'bed vertices above the water plane (smooth ground only)', value: waterAbove, expect: '0', pass: waterAbove === 0 },
        { name: 'quay lines and lined canal sides with a curtain and an apron (m)', value: Math.round(edgeLen), expect: coarse ? '0 (stub ground)' : '>= 20000', pass: coarse || edgeLen >= 20000 },
        { name: 'raised platform edges with a curtain and an apron (m)', value: Math.round(platLen), expect: coarse ? '0 (stub ground)' : '>= 5000', pass: coarse || platLen >= 5000 },
      ],
      api: { inner: INNER, outer: OUTER, maps, fieldMap, shoreMap, fieldHook, materials: mats, leafSizeAt: (x, z) => { const i = leafAt(x, z); return i < 0 ? null : NS[i]; }, insetAt, tileSizes: TILES,
        /** vertices of the closed quadtree surface in the tile mesh of group g (0 inner, 1 outer, 2 far) and tile (tx, tz); the curtain and apron vertices follow them */
        baseVertexCount: (g, tx, tz) => baseVerts.get(`${g}:${tx}:${tz}`) || 0 },
    };
  },
};
