// textures/surface.js — the surface shader of the "materials" subsystem: GLSL that the hook 'variation'
// (js/core/materials.js) inserts into every lit built-in material. OWNER: materials engineer.
//
// What it does, per fragment:
//   1. MAPPING without UVs. Horizontal faces are mapped by world x/z (optionally rotated: variant rotDeg).
//      Vertical and battered faces are mapped ALONG THE WALL: u = distance along the horizontal direction of
//      the face, v = world y. So courses run level on every wall whatever its orientation and bricks keep
//      their true length. Smooth curved surfaces (the normal varies inside the face) fall back to a blend of
//      the two axis projections. Spaces: world (default), object (moving things), uv.
//   2. TEXTURE SET: detail map (albedo multiplier, mean exactly 1) + relief map (normal, roughness), sampled at
//      three scales: base, a larger non-commensurate one (hides the repeat) and a close-up one (crispness
//      under magnification). All lookups use explicit gradients.
//   3. ANALYTIC MASONRY: joints of bricks and slabs at true module, box-filtered against the pixel footprint
//      (sharp at 3 m, a level tone at 1.7 km, no moire), per-brick tint, kiln-batch banding, bevelled edges.
//   4. Secondary colour by the set's mask (damp, thin wash, veins, dust), macro variation from one shared
//      noise texture, the damp band at the foot of walls (height above the ground map), wetness at the waterline.
// Samplers per program: detail, relief, macro, ground = 4 (+ whatever UV maps a variant passes; budget 8).

export const PARS_VERTEX = /* glsl */ `
#if BBL_SPACE == 1
	varying vec3 vBObjPos; varying vec3 vBObjNormal; varying vec3 vBObjX; varying vec3 vBObjY;
#elif BBL_SPACE == 2
	varying vec2 vBUv;
#endif
`;

export const VERTEX = /* glsl */ `
#if BBL_SPACE == 1
	vBObjPos = position; vBObjNormal = normal;
	{
		mat3 bblM = normalMatrix;
		#ifdef USE_INSTANCING
			bblM = bblM * mat3( instanceMatrix );
		#endif
		vBObjX = normalize( bblM * vec3( 1.0, 0.0, 0.0 ) ); vBObjY = normalize( bblM * vec3( 0.0, 1.0, 0.0 ) );
	}
#elif BBL_SPACE == 2
	vBUv = uv;
#endif
`;

export const PARS_FRAGMENT = /* glsl */ `
uniform vec4 uBWet;          // x: water level (datum y), y: band height (m), z: darkening, w: roughness when wet
#ifdef BBL_TEX
uniform sampler2D uBTexA;    // detail: rgb albedo multiplier / gain, a mask
uniform sampler2D uBTexN;    // relief: rgb normal, a roughness detail
uniform sampler2D uBMacro;   // shared macro noise
uniform vec4 uBMacroMean;    // its mean per channel
uniform sampler2D uBGround;  // shared ground map: r = ground level, g = confidence
uniform vec4 uBGroundRect;   // minX, minZ, 1 / sizeX, 1 / sizeZ
uniform vec4 uBTexScale;     // x: repeats per metre, y: 1 = on walls the grain and the rows run vertically, z: close-layer ratio, w: relief strength
uniform vec4 uBTexMix;       // x: detail strength, y: mid-layer strength, z: close strength, w: roughness detail
uniform vec4 uBGain;         // rgb: 1 / mean of the detail map, a: unused
uniform vec4 uBComp;         // rgb: compensation so that the far-field mean is the palette colour, a: unused
uniform vec4 uBColor2;       // rgb: secondary colour as a RATIO to the base colour, a: mask strength
uniform vec4 uBMaskFx;       // x: roughness change under the mask, y: mask boost in the foot band, z: roughness change in joints, w: how much the mask is gated by the larger-scale noise (0..1)
uniform vec4 uBSpec;         // x: factor on the specular reflectance at normal incidence (BBL_SPEC), y: at grazing incidence, zw: unused
uniform vec4 uBFoot;         // x: band height (m), y: darkening, z: datum level where a course starts on walls, w: unused
uniform vec4 uBTopXf;        // world/object: cos, sin of the horizontal rotation, offset x, z.  uv space: metres per uv unit (u, v), offset
uniform vec4 uBMacroMix;     // x: amplitude at 811 m, y: at 97 m, z: hue amplitude, w: unused
#if BBL_SPACE == 1
	varying vec3 vBObjPos; varying vec3 vBObjNormal; varying vec3 vBObjX; varying vec3 vBObjY;
#elif BBL_SPACE == 2
	varying vec2 vBUv;
#endif
#ifdef BBL_PATTERN
uniform vec4 uBPatSide;      // wall faces:  cell u, cell v (m), stagger of odd rows (share of cell u), joint width (m)
uniform vec4 uBPatTop;       // horizontal faces: the same
uniform vec4 uBPatFx;        // x: per-cell value jitter, y: per-cell hue jitter, z: bevel strength, w: per-cell texture offset (0 / 1)
uniform vec4 uBPatAlt;       // x: waver of the joint edges (share of the joint width; a NEGATIVE stagger means odd rows are half cells), y: soft rows instead of joints (0 / 1), z: batch banding amplitude, w: bevel width (m)
uniform vec4 uBJoint;        // rgb: joint colour as a RATIO to the base colour, a: strength
uniform vec4 uBPatGloss;     // x: per-cell facet tilt (slope), y: per-cell roughness jitter, z: roughness added where cells are no longer resolved, w: amplitude of the day's-work bands
#else
#define uBPatSide vec4( 0.0 )
#define uBPatTop vec4( 0.0 )
#endif
struct BblS { vec3 det; float mask; vec2 tn; float rough; float joint; };
// box-filtered coverage of the periodic interval [0, L) (period P) seen through a footprint w centred on x
float bblCov( float x, float P, float L, float w ) {
	float a = ( x - 0.5 * w ) / P, b = ( x + 0.5 * w ) / P;
	float fa = floor( a ), fb = floor( b );
	return ( ( fb - fa ) * L + min( ( b - fb ) * P, L ) - min( ( a - fa ) * P, L ) ) / w;
}
float bblCellHash( vec2 p ) { vec3 q = fract( p.xyx * vec3( 0.1031, 0.1030, 0.0973 ) ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float bblVN( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( bblCellHash( i ), bblCellHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( bblCellHash( i + vec2( 0.0, 1.0 ) ), bblCellHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// one projection plane: pm = position in the plane (metres), dx / dy = its screen derivatives
void bblPlane( in vec2 pm, in vec2 dx, in vec2 dy, in vec4 pat, in float swap, out BblS s ) {
	if ( swap > 0.5 ) { pm = pm.yx; dx = dx.yx; dy = dy.yx; }     // grain and rows run up the wall
	vec2 q = pm;
	float cellV = 1.0; vec3 cellTint = vec3( 1.0 ); float joint = 0.0; vec2 bev = vec2( 0.0 ); float cellRough = 0.0;
	vec3 jcomp = vec3( 1.0 );      // keeps the far-field mean at the palette colour whatever the joints do
	#ifdef BBL_PATTERN
	if ( pat.x > 0.0 ) {
		float wu = max( abs( dx.x ) + abs( dy.x ), 1e-6 ), wv = max( abs( dx.y ) + abs( dy.y ), 1e-6 );
		float cv = pat.y, row = floor( pm.y / cv ), odd = mod( row, 2.0 );
		if ( uBPatAlt.y > 0.5 ) {
			// soft rows (furrows, stubble rows, planks): a cosine profile across v, fading to its mean
			float ph = pm.y / cv * 6.2831853, fade = 1.0 - smoothstep( 0.25, 0.70, wv / cv );
			joint = mix( 0.5, 0.5 - 0.5 * cos( ph ), fade );
			bev = vec2( 0.0, - uBPatFx.z * sin( ph ) * fade );
			float r1 = bblCellHash( vec2( row, 3.0 ) );
			cellV = 1.0 + uBPatFx.x * ( r1 - 0.5 ) * 2.0 * fade;
			jcomp = 1.0 / ( 1.0 - 0.5 * uBJoint.a * ( 1.0 - uBJoint.rgb ) );
		} else {
			float alt = pat.z < 0.0 ? 1.0 : 0.0;                       // odd rows are half cells
			float cu = pat.x * ( 1.0 - 0.5 * alt * odd );
			float xs = pm.x + odd * abs( pat.z ) * pat.x;
			float col = floor( xs / cu );
			float jw = pat.w;
			float rowMix = smoothstep( 0.6, 1.6, wv / cv );              // rows no longer resolved: head joints average out
			// hand-laid: the joint edges waver by a couple of millimetres (only where a pixel is smaller than a joint)
			float wob = uBPatAlt.x * jw * ( 1.0 - smoothstep( 0.002, 0.012, max( wu, wv ) ) );
			vec2 pw = vec2( xs, pm.y ) + ( vec2( bblVN( pm * 17.0 ), bblVN( pm * 17.0 + 31.7 ) ) - 0.5 + 0.4 * ( vec2( bblVN( pm * 71.0 + 5.3 ), bblVN( pm * 71.0 + 47.1 ) ) - 0.5 ) ) * wob;
			float jv = bblCov( pw.y + 0.5 * jw, cv, jw, wv );
			float ju = mix( bblCov( pw.x + 0.5 * jw, cu, jw, wu ), jw / cu, rowMix );
			joint = 1.0 - ( 1.0 - jv ) * ( 1.0 - ju );
			float dutyU = jw / pat.x * ( 1.0 + 0.5 * alt ), dutyV = jw / cv;
			jcomp = 1.0 / ( 1.0 - ( dutyU + dutyV - dutyU * dutyV ) * uBJoint.a * ( 1.0 - uBJoint.rgb ) );
			float bz = 0.5 * jw + uBPatAlt.w;
			float bvy = bblCov( pw.y, cv, bz, wv ) - bblCov( pw.y + bz, cv, bz, wv );
			float bux = ( bblCov( pw.x, cu, bz, wu ) - bblCov( pw.x + bz, cu, bz, wu ) ) * ( 1.0 - rowMix );
			bev = - uBPatFx.z * vec2( bux, bvy );
			float cellFade = 1.0 - smoothstep( 0.35, 1.2, max( wu / cu, wv / cv ) );
			float r1 = bblCellHash( vec2( col, row ) ), r2 = bblCellHash( vec2( col + 17.0, row + 43.0 ) );
			float hu = uBPatFx.y * ( r2 - 0.5 ) * 2.0 * cellFade;
			cellV = 1.0 + uBPatFx.x * ( r1 - 0.5 ) * 2.0 * cellFade;
			cellTint = vec3( 1.0 + hu, 1.0 - 0.2 * hu, 1.0 - 1.5 * hu );
			float band = bblCellHash( vec2( floor( row / 4.0 ), 7.0 ) ) + 0.5 * bblCellHash( vec2( row, 11.0 ) ) - 0.75;
			cellV *= 1.0 + uBPatAlt.z * band * ( 1.0 - smoothstep( 1.5, 6.0, wv / cv ) );
			// the day's work: soft lens-shaped bands about 11 courses high and some metres long, each batch of bricks
			// with its own tone. They carry a large brick face from 30 m to 1 km, where courses are below the pixel
			float lift = bblVN( vec2( pm.x / 7.3 + 3.1, pm.y / ( cv * 11.0 ) ) ) + 0.5 * bblVN( vec2( pm.x / 2.9 + 11.7, pm.y / ( cv * 5.0 ) + 4.3 ) ) - 0.75;
			cellV *= 1.0 + uBPatGloss.w * 2.0 * lift * ( 1.0 - smoothstep( 25.0, 70.0, wv / cv ) );
			// every brick is its own facet with its own gloss (glazed bricks sparkle one by one); beyond the
			// distance where bricks are resolved the scatter of the facets is roughness
			float r3 = bblCellHash( vec2( col + 71.0, row + 13.0 ) ), r4 = bblCellHash( vec2( col + 5.0, row + 91.0 ) );
			bev += uBPatGloss.x * ( vec2( r3, r4 ) - 0.5 ) * 2.0 * cellFade;
			cellRough = uBPatGloss.y * ( r4 - 0.5 ) * 2.0 * cellFade + uBPatGloss.z * ( 1.0 - cellFade );
			if ( uBPatFx.w > 0.5 ) q += vec2( r1, r2 ) / uBTexScale.x;      // every brick / slab is its own piece of material
		}
	}
	#endif
	float sc = uBTexScale.x;
	vec4 a1 = textureGrad( uBTexA, q * sc, dx * sc, dy * sc );
	vec4 n1 = textureGrad( uBTexN, q * sc, dx * sc, dy * sc );
	vec3 det = a1.rgb * uBGain.rgb;
	vec2 tn = n1.xy * 2.0 - 1.0;
	float rough = n1.a - 0.5;
	// mid layer: the shared noise at 23.7 m per repeat, axes swapped: breaks up the repeat of the base map
	const float fs = 1.0 / 23.7;
	vec4 mf = textureGrad( uBMacro, pm.yx * fs + vec2( 0.37, 0.71 ), dx.yx * fs, dy.yx * fs ) - uBMacroMean;
	float mid = uBTexMix.y * ( 0.56 * mf.a + 0.32 * mf.g );
	det *= ( 1.0 + mid ) * vec3( 1.0 + 0.25 * uBTexMix.y * mf.r, 1.0, 1.0 - 0.40 * uBTexMix.y * mf.r );
	// close layer: crispness when the base map is magnified
	float fp = max( length( dx ), length( dy ) );
	if ( uBTexMix.z > 0.0 && fp < 0.02 ) {
		float cs = sc * uBTexScale.z, k = uBTexMix.z * ( 1.0 - smoothstep( 0.008, 0.02, fp ) );
		vec2 uv3 = q.yx * cs + vec2( 0.13, 0.59 );
		vec4 a3 = textureGrad( uBTexA, uv3, dx.yx * cs, dy.yx * cs );
		vec4 n3 = textureGrad( uBTexN, uv3, dx.yx * cs, dy.yx * cs );
		det *= mix( vec3( 1.0 ), a3.rgb * uBGain.rgb, k );
		tn += ( n3.yx * 2.0 - 1.0 ) * k;
		rough += ( n3.a - 0.5 ) * k * 0.5;
	}
	s.det = mix( vec3( 1.0 ), det, uBTexMix.x ) * cellV * cellTint * jcomp;
	// gated by the mid layer: stains come in clusters, never on a grid. The gate only ever REMOVES mask: it used to
	// multiply it by up to 2.5 (and the macro gate again), which turned a 22 % stain into solid dark blotches
	s.mask = a1.a * mix( 1.0, clamp( 0.55 + 4.0 * mf.a + 2.0 * mf.g, 0.0, 1.0 ), uBMaskFx.w );
	tn = tn * uBTexScale.w + bev;
	s.tn = swap > 0.5 ? tn.yx : tn;
	s.rough = rough * uBTexMix.w + cellRough;
	s.joint = joint;
}
#endif
`;

// after #include <map_fragment>: everything that changes diffuseColor; leaves bblRoughAdd, bblNd / bblNdView, bblWet behind
export const FRAGMENT_COLOR = /* glsl */ `
	float bblWet = 0.0, bblRoughAdd = 0.0;
	#ifdef BBL_WETNESS
	{
		float hw = vBWorldPos.y - uBWet.x;
		if ( hw < uBWet.y * 1.3 + 0.1 ) {
			// soaked up to 40 % of the band, then drying out to its top; the upper edge wavers with a noise
			float nz = bblValueNoise( vBWorldPos.xz * 1.7 + vBWorldPos.y * 0.9 );
			bblWet = 1.0 - smoothstep( 0.4 * uBWet.y, uBWet.y, hw + ( nz - 0.5 ) * 0.3 * uBWet.y );
		}
	}
	#endif
	#ifdef BBL_TEX
	vec3 bblNd = vec3( 0.0 );          // normal delta (world / object axes, or view space in uv mode)
	{
		vec3 bblDet = vec3( 0.0 ); float bblMask = 0.0, bblJoint = 0.0, bblSideW = 0.0;
		BblS bs;
		#if BBL_SPACE == 2
			vec2 pm = vBUv * uBTopXf.xy + uBTopXf.zw;
			vec2 pdx = dFdx( pm ), pdy = dFdy( pm );
			bblPlane( pm, pdx, pdy, uBPatTop, 0.0, bs );
			bblDet = bs.det; bblMask = bs.mask; bblRoughAdd = bs.rough; bblJoint = bs.joint;
			{
				vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
				vec3 ng = normalize( cross( q0, q1 ) );
				if ( dot( ng, vViewPosition ) < 0.0 ) ng = - ng;
				vec3 q1p = cross( q1, ng ), q0p = cross( ng, q0 );
				vec3 T = q1p * pdx.x + q0p * pdy.x, B = q1p * pdx.y + q0p * pdy.y;
				float dd = max( dot( T, T ), dot( B, B ) ), sc2 = dd == 0.0 ? 0.0 : inversesqrt( dd );
				bblNd = ( T * bs.tn.x + B * bs.tn.y ) * sc2;
			}
			vec3 bblMP = vBWorldPos;
		#else
			#if BBL_SPACE == 1
				vec3 bblP = vBObjPos; vec3 bblNw = normalize( vBObjNormal ); vec3 bblMP = vBObjPos;
			#else
				vec3 bblP = vBWorldPos; vec3 bblNw = normalize( vBWorldNormal ); vec3 bblMP = vBWorldPos;
			#endif
			vec3 bblDX = dFdx( bblP ), bblDY = dFdy( bblP );
			vec3 fwN = fwidth( bblNw );
			float bblNy = abs( bblNw.y );
			#ifdef BBL_PATTERN
				float bblTopW = step( 0.70, bblNy );                  // masonry: never blend two bonds
			#else
				float bblTopW = smoothstep( 0.62, 0.80, bblNy );
			#endif
			bblSideW = 1.0 - bblTopW;
			if ( bblTopW > 0.001 ) {
				vec2 c = uBTopXf.xy;
				vec2 pm = vec2( c.x * bblP.x + c.y * bblP.z, - c.y * bblP.x + c.x * bblP.z ) + uBTopXf.zw;
				vec2 pdx = vec2( c.x * bblDX.x + c.y * bblDX.z, - c.y * bblDX.x + c.x * bblDX.z );
				vec2 pdy = vec2( c.x * bblDY.x + c.y * bblDY.z, - c.y * bblDY.x + c.x * bblDY.z );
				bblPlane( pm, pdx, pdy, uBPatTop, 0.0, bs );
				bblDet += bblTopW * bs.det; bblMask += bblTopW * bs.mask; bblRoughAdd += bblTopW * bs.rough; bblJoint += bblTopW * bs.joint;
				bblNd += bblTopW * ( bs.tn.x * vec3( c.x, 0.0, c.y ) + bs.tn.y * vec3( - c.y, 0.0, c.x ) );
			}
			if ( bblSideW > 0.001 ) {
				vec2 hn = bblNw.xz; float hl = length( hn );
				hn = hl > 1e-4 ? hn / hl : vec2( 1.0, 0.0 );
				if ( fwN.x + fwN.y + fwN.z < 3e-5 ) {
					// a flat face: map along the wall
					vec2 td = vec2( hn.y, - hn.x );                   // +u runs to the right of a viewer facing the wall
					vec2 pm = vec2( dot( bblP.xz, td ), bblP.y - uBFoot.z );
					vec2 pdx = vec2( dot( bblDX.xz, td ), bblDX.y ), pdy = vec2( dot( bblDY.xz, td ), bblDY.y );
					bblPlane( pm, pdx, pdy, uBPatSide, uBTexScale.y, bs );
					bblDet += bblSideW * bs.det; bblMask += bblSideW * bs.mask; bblRoughAdd += bblSideW * bs.rough; bblJoint += bblSideW * bs.joint;
					bblNd += bblSideW * ( bs.tn.x * vec3( td.x, 0.0, td.y ) + bs.tn.y * vec3( 0.0, 1.0, 0.0 ) );
				} else {
					// a curved surface: blend the two axis projections
					#ifdef BBL_PATTERN
						float wx = step( 0.5, hn.x * hn.x ), wz = 1.0 - wx;      // masonry: never blend two bonds (courses stay level across the seam)
					#else
						float wx = smoothstep( 0.25, 0.75, hn.x * hn.x ), wz = 1.0 - wx;
					#endif
					if ( wx > 0.001 ) {
						float sg = bblNw.x < 0.0 ? - 1.0 : 1.0, w = bblSideW * wx;
						bblPlane( vec2( - sg * bblP.z, bblP.y - uBFoot.z ), vec2( - sg * bblDX.z, bblDX.y ), vec2( - sg * bblDY.z, bblDY.y ), uBPatSide, uBTexScale.y, bs );
						bblDet += w * bs.det; bblMask += w * bs.mask; bblRoughAdd += w * bs.rough; bblJoint += w * bs.joint;
						bblNd += w * ( bs.tn.x * vec3( 0.0, 0.0, - sg ) + bs.tn.y * vec3( 0.0, 1.0, 0.0 ) );
					}
					if ( wz > 0.001 ) {
						float sg = bblNw.z < 0.0 ? - 1.0 : 1.0, w = bblSideW * wz;
						bblPlane( vec2( sg * bblP.x, bblP.y - uBFoot.z ), vec2( sg * bblDX.x, bblDX.y ), vec2( sg * bblDY.x, bblDY.y ), uBPatSide, uBTexScale.y, bs );
						bblDet += w * bs.det; bblMask += w * bs.mask; bblRoughAdd += w * bs.rough; bblJoint += w * bs.joint;
						bblNd += w * ( bs.tn.x * vec3( sg, 0.0, 0.0 ) + bs.tn.y * vec3( 0.0, 1.0, 0.0 ) );
					}
				}
			}
		#endif
		// macro variation: two scales of one shared noise texture (walls vary with height too)
		vec2 mc = bblMP.xz + bblMP.y * vec2( 0.37, 0.61 );
		vec4 m1 = texture2D( uBMacro, mc * ( 1.0 / 811.0 ) ) - uBMacroMean;
		vec4 m2 = texture2D( uBMacro, mc.yx * ( 1.0 / 97.0 ) + 0.5 ) - uBMacroMean;
		float mv = 1.0 + uBMacroMix.x * m1.r * 2.0 + uBMacroMix.y * m2.g * 2.0;
		float mh = uBMacroMix.z * ( m1.a + 0.5 * m2.r ) * 2.0;
		// damp band at the foot of walls: height above the ground map
		float foot = 0.0;
		if ( uBFoot.x > 0.0 && bblSideW > 0.5 ) {
			vec2 guv = ( vBWorldPos.xz - uBGroundRect.xy ) * uBGroundRect.zw;
			if ( guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0 ) {
				vec4 g = textureLod( uBGround, guv, 0.0 );
				float hag = vBWorldPos.y - g.r;
				float top = uBFoot.x * ( 1.0 + 0.9 * m2.a + 0.5 * bblMask );
				foot = ( 1.0 - smoothstep( 0.15, 1.0, hag / top ) ) * g.g * step( - 2.5, hag );
			}
		}
		float mk = clamp( ( bblMask * mix( 1.0, clamp( 0.6 + 1.6 * m2.b + 1.2 * m2.g, 0.0, 1.0 ), uBMaskFx.w ) + uBMaskFx.y * foot ) * uBColor2.a, 0.0, 1.0 );
		vec3 bblC = bblDet * uBComp.rgb * mv * vec3( 1.0 + mh, 1.0, 1.0 - 1.5 * mh );
		bblC *= mix( vec3( 1.0 ), uBColor2.rgb, mk );
		#ifdef BBL_PATTERN
			bblC *= mix( vec3( 1.0 ), uBJoint.rgb, bblJoint * uBJoint.a );
			bblRoughAdd += uBMaskFx.z * bblJoint;
		#endif
		bblC *= 1.0 - uBFoot.y * foot;
		bblRoughAdd += uBMaskFx.x * mk;
		diffuseColor.rgb *= bblC;
	}
	#else
		#ifdef BBL_PLAIN_VARIATION
			diffuseColor.rgb *= 0.93 + 0.14 * bblValueNoise( vBWorldPos.xz * 0.045 + vBWorldPos.y * 0.31 );
		#endif
	#endif
	diffuseColor.rgb *= 1.0 - uBWet.z * bblWet;
`;

export const FRAGMENT_ROUGHNESS = /* glsl */ `
	roughnessFactor = clamp( roughnessFactor + bblRoughAdd, 0.04, 1.0 );
	roughnessFactor = mix( roughnessFactor, min( roughnessFactor, uBWet.w ), bblWet );
`;

export const FRAGMENT_NORMAL = /* glsl */ `
	#ifdef BBL_TEX
		#if BBL_SPACE == 2
			normal = normalize( normal + bblNd );
		#elif BBL_SPACE == 1
			normal = normalize( normal + mat3( vBObjX, vBObjY, cross( vBObjX, vBObjY ) ) * bblNd );
		#else
			normal = normalize( normal + mat3( viewMatrix ) * bblNd );
		#endif
	#endif
`;


// after #include <lights_physical_fragment>: the specular reflectance of the surface (variant / table `spec`)
export const FRAGMENT_SPECULAR = /* glsl */ `
	#ifdef BBL_SPEC
		material.specularColor *= uBSpec.x; material.specularF90 *= uBSpec.y;
	#endif
`;
