// js/core/post.js — subsystem "post": the per-frame render. OWNER: post engineer. Contract: ENGINE.md 5.6, notes: docs/post.md.
//
// renderFrame(t) for each of N sub-frames:
//   ctx.update(t + shutter offset)  ->  projection jitter  ->  lighting.renderShadows  ->  pre-passes
//   phase 1   MAIN + SKY (+ DEBUG)  into the HDR MSAA 4 target; colour and depth are resolved
//   GTAO      from the resolved depth (world-space radius, distance fade, 4x4 rotation pattern + bilateral blur)
//   phase 2   the AO multiply (a full-screen mesh that draws first, depth-tested so sky samples stay untouched),
//             then WATER + FX into the same MSAA target: water and effects are never darkened by AO and may
//             sample the opaque scene (post.uniforms: depth and colour of phase 1)
//   accumulate  += sub-frame / N into a float target, with a short blur along the camera-motion vector of the
//             sub-frame's own time slice, so that the N slices join into one continuous motion blur
// then once per frame: bloom (threshold in scene radiance), exposure from the lighting state, tone mapping,
// grade (with a per-light-mode trim of warm saturation), vignette, sRGB, dither -> canvas.
// Nothing here keeps history: the image is a pure function of (t, N, canvas size).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { halton } from './mathx.js';

/** Layer of the engine's own full-screen meshes that live in ctx.scene (not in ctx.LAYERS: nobody else draws on it). */
const POST_LAYER = 6;

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// view-space position from the resolved depth texture (standard perspective depth, ENGINE.md 13)
const DEPTH_PARS = /* glsl */ `
uniform sampler2D tDepth;
uniform vec4 uProj;   // P00, P11, P02, P12 of the projection of THIS sub-frame (jitter included)
uniform vec3 uZ;      // near, 1 - near / far, far
float bblLinZ( float d ) { return uZ.x / ( 1.0 - d * uZ.y ); }
vec3 bblViewPos( vec2 uv, float z ) { return vec3( ( uv * 2.0 - 1.0 + uProj.zw ) / uProj.xy * z, - z ); }
`;

// ---- GTAO (horizon-based, after Jimenez et al. 2016 / XeGTAO) ----------------------------------------------
const AO_FRAG = /* glsl */ `
#define PI 3.14159265359
#define HALF_PI 1.5707963268
varying vec2 vUv;
${DEPTH_PARS}
uniform vec2 uRes;        // target size in pixels
uniform float uRadius;    // world metres
uniform float uProjScale; // pixels per metre at 1 m distance
uniform float uMaxPx;     // largest search radius in pixels
uniform vec2 uFade;       // view distance where AO starts / ends fading (m)
uniform float uPower;
uniform vec3 uShape;      // x: share of the radius over which a sample loses its weight, y: exponent of the step distribution, z: height bias (m)
uniform vec2 uNoise;      // per-sub-frame offsets of the rotation and the step pattern, 0..1
uniform int uDebug;
const float B4[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
vec2 snap( vec2 uv ) { return ( floor( uv * uRes ) + 0.5 ) / uRes; }
void main() {
	float d = texture2D( tDepth, vUv ).x;
	float z = bblLinZ( d );
	float fade = 1.0 - smoothstep( uFade.x, uFade.y, z );
	float rPx = uRadius * uProjScale / z;
	if ( d >= 1.0 || fade <= 0.0 || rPx < 1.0 ) { gl_FragColor = vec4( 1.0, z / uZ.z, 0.0, 1.0 ); return; }
	float R = uRadius;
	if ( rPx > uMaxPx ) { R *= uMaxPx / rPx; rPx = uMaxPx; }
	vec2 px = 1.0 / uRes;
	vec3 P = bblViewPos( vUv, z );
	// normal from depth: on each axis the neighbour pair that agrees with a linear extrapolation of the depth
	vec2 ex = vec2( px.x, 0.0 ), ey = vec2( 0.0, px.y );
	float zl = bblLinZ( texture2D( tDepth, vUv - ex ).x ), zr = bblLinZ( texture2D( tDepth, vUv + ex ).x );
	float zd = bblLinZ( texture2D( tDepth, vUv - ey ).x ), zu = bblLinZ( texture2D( tDepth, vUv + ey ).x );
	float zl2 = bblLinZ( texture2D( tDepth, vUv - 2.0 * ex ).x ), zr2 = bblLinZ( texture2D( tDepth, vUv + 2.0 * ex ).x );
	float zd2 = bblLinZ( texture2D( tDepth, vUv - 2.0 * ey ).x ), zu2 = bblLinZ( texture2D( tDepth, vUv + 2.0 * ey ).x );
	vec3 ddx = abs( 2.0 * zl - zl2 - z ) < abs( 2.0 * zr - zr2 - z ) ? P - bblViewPos( vUv - ex, zl ) : bblViewPos( vUv + ex, zr ) - P;
	vec3 ddy = abs( 2.0 * zd - zd2 - z ) < abs( 2.0 * zu - zu2 - z ) ? P - bblViewPos( vUv - ey, zd ) : bblViewPos( vUv + ey, zu ) - P;
	vec3 N = normalize( cross( ddx, ddy ) );
	vec3 V = normalize( - P );
	if ( uDebug == 1 ) { gl_FragColor = vec4( N.y * 0.5 + 0.5, z / uZ.z, 0.0, 1.0 ); return; }
	if ( uDebug == 2 ) { gl_FragColor = vec4( fract( z ), z / uZ.z, 0.0, 1.0 ); return; }
	ivec2 ip = ivec2( gl_FragCoord.xy ) & 3;
	float nA = ( B4[ ip.x + ip.y * 4 ] + uNoise.x ) / 16.0;
	float nS = fract( ( B4[ ip.y + ip.x * 4 ] + 0.5 ) / 16.0 + uNoise.y );
	float fRange = uShape.x * R, fMul = - 1.0 / fRange, fAdd = ( R - fRange ) / fRange + 1.0;
	float minS = 1.3 / rPx;
	float vis = 0.0;
	for ( int s = 0; s < AO_SLICES; s ++ ) {
		float phi = ( float( s ) + nA ) * PI / float( AO_SLICES );
		vec2 om = vec2( cos( phi ), sin( phi ) );
		vec3 dirV = vec3( om, 0.0 );
		vec3 ortho = dirV - dot( dirV, V ) * V;
		vec3 axis = normalize( cross( ortho, V ) );
		vec3 pN = N - axis * dot( N, axis );
		float pNLen = max( length( pN ), 1e-5 );
		float cosN = clamp( dot( pN, V ) / pNLen, 0.0, 1.0 );
		float n = sign( dot( ortho, pN ) ) * acos( cosN );
		float low0 = cos( n + HALF_PI ), low1 = cos( n - HALF_PI );
		float h0c = low0, h1c = low1;
		vec2 omUv = om * rPx * px;
		for ( int j = 0; j < AO_STEPS; j ++ ) {
			float f = ( float( j ) + fract( nS + float( s * AO_STEPS + j ) * 0.6180339887 ) ) / float( AO_STEPS );
			f = pow( f, uShape.y ) + minS;
			vec2 uv0 = snap( vUv + omUv * f ), uv1 = snap( vUv - omUv * f );
			vec3 D0 = bblViewPos( uv0, bblLinZ( texture2D( tDepth, uv0 ).x ) ) - P;
			vec3 D1 = bblViewPos( uv1, bblLinZ( texture2D( tDepth, uv1 ).x ) ) - P;
			float l0 = max( length( D0 ), 1e-4 ), l1 = max( length( D1 ), 1e-4 );
			// height bias: what rises less than uShape.z above the receiver's plane does not occlude. Paving and decals
			// float 5 to 18 cm above the ground by convention: neither their edge nor the slot under them may go dark
			float w0 = clamp( l0 * fMul + fAdd, 0.0, 1.0 ) * smoothstep( uShape.z, 2.0 * uShape.z, dot( D0, N ) );
			float w1 = clamp( l1 * fMul + fAdd, 0.0, 1.0 ) * smoothstep( uShape.z, 2.0 * uShape.z, dot( D1, N ) );
			h0c = max( h0c, mix( low0, dot( D0, V ) / l0, w0 ) );
			h1c = max( h1c, mix( low1, dot( D1, V ) / l1, w1 ) );
		}
		pNLen = mix( pNLen, 1.0, 0.05 );
		float h0 = - acos( clamp( h1c, - 1.0, 1.0 ) ), h1 = acos( clamp( h0c, - 1.0, 1.0 ) );
		h0 = n + clamp( h0 - n, - HALF_PI, HALF_PI ); h1 = n + clamp( h1 - n, - HALF_PI, HALF_PI );
		float sn = sin( n );
		vis += pNLen * 0.25 * ( ( cosN + 2.0 * h0 * sn - cos( 2.0 * h0 - n ) ) + ( cosN + 2.0 * h1 * sn - cos( 2.0 * h1 - n ) ) );
	}
	float ao = pow( clamp( vis / float( AO_SLICES ), 0.0, 1.0 ), uPower );
	gl_FragColor = vec4( mix( 1.0, ao, fade ), z / uZ.z, 0.0, 1.0 );
}`;

// depth-aware 1-2-2-2-1 blur along one axis; two passes integrate the 4x4 rotation pattern exactly on flat ground
const AO_BLUR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tAO;   // r = ao, g = linear depth / far
uniform vec2 uStep;
void main() {
	vec2 c = texture2D( tAO, vUv ).rg;
	float sum = 2.0 * c.r, w = 2.0, tol = 0.012 * c.g;
	for ( int i = - 2; i <= 2; i ++ ) {
		if ( i == 0 ) continue;
		vec2 s = texture2D( tAO, vUv + uStep * float( i ) ).rg;
		float k = ( abs( i ) == 2 ? 1.0 : 2.0 ) * ( 1.0 - smoothstep( 0.5 * tol, tol, abs( s.g - c.g ) ) );
		sum += s.r * k; w += k;
	}
	gl_FragColor = vec4( sum / w, c.g, 0.0, 1.0 );
}`;

// the AO multiply: lives in ctx.scene on POST_LAYER and is the first thing drawn in phase 2
const AO_APPLY_VERT = /* glsl */ `void main() { gl_Position = vec4( position.xy, 1.0, 1.0 ); }`;
const AO_APPLY_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform sampler2D tScene;   // resolved colour of phase 1
uniform vec2 uInvRes;
uniform float uIntensity, uLitKeep, uExposure;
uniform vec2 uLum;
void main() {
	vec2 uv = gl_FragCoord.xy * uInvRes;
	float ao = texture2D( tAO, uv ).r;
	float l = dot( texture2D( tScene, uv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * uExposure;
	// occlusion belongs to the ambient light: keep only part of it where the surface is in direct light
	float k = uIntensity * mix( 1.0, uLitKeep, smoothstep( uLum.x, uLum.y, l ) );
	gl_FragColor = vec4( vec3( mix( 1.0, ao, k ) ), 1.0 );
}`;

// ---- accumulation with gap-filling motion blur -----------------------------------------------------------------
const ACCUM_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uWeight;
#ifdef MOTION_BLUR
${DEPTH_PARS}
uniform mat4 uReprojA, uReprojB;   // view space of this sub-frame -> clip space at the start / end of its time slice
uniform vec2 uRes;
uniform float uMaxBlur, uNoise;
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
#endif
void main() {
	vec3 c;
	#ifdef MOTION_BLUR
		vec4 P = vec4( bblViewPos( vUv, bblLinZ( texture2D( tDepth, vUv ).x ) ), 1.0 );
		vec4 a = uReprojA * P, b = uReprojB * P;
		vec2 v = ( a.w > 1e-3 && b.w > 1e-3 ) ? 0.5 * ( b.xy / b.w - a.xy / a.w ) : vec2( 0.0 );
		float len = length( v * uRes );
		if ( len > uMaxBlur ) { v *= uMaxBlur / len; len = uMaxBlur; }
		if ( len < 0.5 ) c = texture2D( tSrc, vUv ).rgb;
		else {
			float n = clamp( ceil( len / 1.25 ), 2.0, float( MB_TAPS ) );
			float j = fract( ign( gl_FragCoord.xy ) + uNoise );
			c = vec3( 0.0 );
			for ( int i = 0; i < MB_TAPS; i ++ ) {
				if ( float( i ) >= n ) break;
				c += texture2D( tSrc, vUv + v * ( ( float( i ) + j ) / n - 0.5 ) ).rgb;
			}
			c /= n;
		}
	#else
		c = texture2D( tSrc, vUv ).rgb;
	#endif
	gl_FragColor = vec4( c * uWeight, 1.0 );
}`;

// ---- bloom: threshold + 13-tap downsample chain, 9-tap tent upsample (Jimenez 2014) -------------------------------
const BLOOM_DOWN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;        // 1 / source size
uniform float uThreshold, uKnee, uClamp, uKaris;
vec3 pick( vec2 o ) {
	vec3 c = texture2D( tSrc, vUv + o * uTexel ).rgb;
	#ifdef PREFILTER
		c = min( c, vec3( uClamp ) );
		float br = max( c.r, max( c.g, c.b ) );
		float soft = clamp( br - uThreshold + uKnee, 0.0, 2.0 * uKnee );
		soft = soft * soft / ( 4.0 * uKnee + 1e-5 );
		c *= max( soft, br - uThreshold ) / max( br, 1e-5 );
	#endif
	return c;
}
#ifdef PREFILTER
	// optional Karis average (uKaris = 1): damps single very bright samples. It is OFF by default: the picture it
	// reads is the accumulated, anti-aliased frame, so nothing flickers, and the damping would take 25 to 60 % of the
	// glow from exactly the small emitters (lamps, sparkles) that have to glow
	vec3 group( vec3 a, vec3 b, vec3 c, vec3 d, out float w ) { vec3 m = 0.25 * ( a + b + c + d ); w = 1.0 / ( 1.0 + uKaris * 0.25 * max( m.r, max( m.g, m.b ) ) ); return m * w; }
#endif
void main() {
	vec3 A = pick( vec2( - 2.0, 2.0 ) ), B = pick( vec2( 0.0, 2.0 ) ), C = pick( vec2( 2.0, 2.0 ) );
	vec3 D = pick( vec2( - 2.0, 0.0 ) ), E = pick( vec2( 0.0, 0.0 ) ), F = pick( vec2( 2.0, 0.0 ) );
	vec3 G = pick( vec2( - 2.0, - 2.0 ) ), H = pick( vec2( 0.0, - 2.0 ) ), I = pick( vec2( 2.0, - 2.0 ) );
	vec3 J = pick( vec2( - 1.0, 1.0 ) ), K = pick( vec2( 1.0, 1.0 ) ), L = pick( vec2( - 1.0, - 1.0 ) ), M = pick( vec2( 1.0, - 1.0 ) );
	#ifdef PREFILTER
		float w0, w1, w2, w3, w4;
		vec3 c = 0.5 * group( J, K, L, M, w0 ) + 0.125 * ( group( A, B, D, E, w1 ) + group( B, C, E, F, w2 ) + group( D, E, G, H, w3 ) + group( E, F, H, I, w4 ) );
		c /= 0.5 * w0 + 0.125 * ( w1 + w2 + w3 + w4 );
	#else
		vec3 c = 0.125 * E + 0.03125 * ( A + C + G + I ) + 0.0625 * ( B + D + F + H ) + 0.125 * ( J + K + L + M );
	#endif
	gl_FragColor = vec4( max( c, 0.0 ), 1.0 );
}`;
const BLOOM_UP_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;     // the coarser level, already summed
uniform sampler2D tBase;    // this level of the down chain
uniform vec2 uTexel;        // 1 / size of tSrc
uniform float uWeight, uWeightSrc;
void main() {
	vec2 d = uTexel;
	vec3 s = 4.0 * texture2D( tSrc, vUv ).rgb
		+ 2.0 * ( texture2D( tSrc, vUv + vec2( d.x, 0.0 ) ).rgb + texture2D( tSrc, vUv - vec2( d.x, 0.0 ) ).rgb + texture2D( tSrc, vUv + vec2( 0.0, d.y ) ).rgb + texture2D( tSrc, vUv - vec2( 0.0, d.y ) ).rgb )
		+ texture2D( tSrc, vUv + d ).rgb + texture2D( tSrc, vUv - d ).rgb + texture2D( tSrc, vUv + vec2( d.x, - d.y ) ).rgb + texture2D( tSrc, vUv + vec2( - d.x, d.y ) ).rgb;
	gl_FragColor = vec4( s * ( uWeightSrc / 16.0 ) + texture2D( tBase, vUv ).rgb * uWeight, 1.0 );
}`;

// ---- resolve: bloom, exposure, tone mapping, grade, vignette, sRGB, dither ----------------------------------------
const OUT_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc, tBloom, tAO, tOverlay;
uniform float uOverlay;
uniform vec2 uBloomTexel;
uniform float uBloom, uExposure, uSaturation, uWarmSat, uContrast, uLift, uVignette, uAspect, uDither;
uniform vec3 uBalance;
uniform vec4 uNightGrade;    // rgb: tint of the dark tones at night, a: their saturation
uniform vec3 uNightRange;    // x: night factor 0..1, y / z: display-linear luma between which the night grade fades out
uniform int uOperator, uView, uDitherMode;
uniform uint uSeed;
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
// ACES filmic (Stephen Hill's fit; the same maths as THREE.ACESFilmicToneMapping, so the stub and this agree)
vec3 RRTAndODTFit( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
vec3 tmACES( vec3 color ) {
	const mat3 ACES_IN = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
	const mat3 ACES_OUT = mat3( vec3( 1.60475, - 0.10208, - 0.00327 ), vec3( - 0.53108, 1.10813, - 0.07276 ), vec3( - 0.07367, - 0.00605, 1.07602 ) );
	return clamp( ACES_OUT * RRTAndODTFit( ACES_IN * ( color / 0.6 ) ), 0.0, 1.0 );
}
// AgX (the same maths as THREE.AgXToneMapping)
vec3 tmAgX( vec3 color ) {
	const mat3 TO2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
	const mat3 FROM2020 = mat3( vec3( 1.6605, - 0.1246, - 0.0182 ), vec3( - 0.5876, 1.1329, - 0.1006 ), vec3( - 0.0728, - 0.0083, 1.1187 ) );
	const mat3 INSET = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
	const mat3 OUTSET = mat3( vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ), vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ), vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
	color = INSET * ( TO2020 * color );
	color = clamp( ( log2( max( color, 1e-10 ) ) + 12.47393 ) / 16.5, 0.0, 1.0 );
	vec3 x2 = color * color, x4 = x2 * x2;
	color = 15.5 * x4 * x2 - 40.14 * x4 * color + 31.96 * x4 - 6.868 * x2 * color + 0.4298 * x2 + 0.1191 * color - 0.00232;
	color = pow( max( vec3( 0.0 ), OUTSET * color ), vec3( 2.2 ) );
	return clamp( FROM2020 * color, 0.0, 1.0 );
}
uvec3 pcg3d( uvec3 v ) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
	v ^= v >> 16u;
	v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
	return v;
}
void main() {
	vec3 c = texture2D( tSrc, vUv ).rgb;
	vec2 d = uBloomTexel;
	vec3 bloom = 4.0 * texture2D( tBloom, vUv ).rgb
		+ 2.0 * ( texture2D( tBloom, vUv + vec2( d.x, 0.0 ) ).rgb + texture2D( tBloom, vUv - vec2( d.x, 0.0 ) ).rgb + texture2D( tBloom, vUv + vec2( 0.0, d.y ) ).rgb + texture2D( tBloom, vUv - vec2( 0.0, d.y ) ).rgb )
		+ texture2D( tBloom, vUv + d ).rgb + texture2D( tBloom, vUv - d ).rgb + texture2D( tBloom, vUv + vec2( d.x, - d.y ) ).rgb + texture2D( tBloom, vUv + vec2( - d.x, d.y ) ).rgb;
	bloom *= uBloom / 16.0;
	if ( uView == 1 ) { gl_FragColor = vec4( vec3( texture2D( tAO, vUv ).r ), 1.0 ); return; }   // debug: the AO buffer of the last sub-frame
	if ( uView == 2 ) c = bloom; else c += bloom;                                                  // debug 2: bloom alone
	c = max( c * uExposure * uBalance, 0.0 );
	c = uOperator == 1 ? tmAgX( c ) : tmACES( c );
	// grade, in display-linear light: contrast about mid grey, saturation, a lift that keeps the darkest values off zero
	c = 0.18 * pow( c / 0.18, vec3( uContrast ) );
	// saturation; warm colours (red above blue) take uWarmSat on top, cool and neutral ones do not: the low golden sun
	// on mud brick is the one place where the earth palette runs away into orange, sky and water are left alone
	float warm = smoothstep( 0.1, 0.5, ( c.r - c.b ) / max( max( c.r, max( c.g, c.b ) ), 1e-4 ) );
	c = mix( vec3( dot( c, LUMA ) ), c, uSaturation * mix( 1.0, uWarmSat, warm ) );
	c = clamp( c, 0.0, 1.0 );
	// night: what the moon and the last of the sky light is seen with less colour and cooler (the eye's own night
	// response); anything bright (flames, lamp glow, the afterglow, lit plaster beside a fire) keeps its colour
	if ( uNightRange.x > 0.0 ) {
		float nl = dot( c, LUMA );
		float nm = uNightRange.x * ( 1.0 - smoothstep( uNightRange.y, uNightRange.z, nl ) );
		c = mix( c, mix( vec3( nl ), c, uNightGrade.a ) * uNightGrade.rgb, nm );
	}
	c += uLift * ( 1.0 - c ) * ( 1.0 - c );
	vec2 q = ( vUv - 0.5 ) * vec2( uAspect, 1.0 ) / length( vec2( uAspect, 1.0 ) * 0.5 );
	float r2 = dot( q, q );
	c *= 1.0 - uVignette * r2 * r2;
	c = mix( c * 12.92, 1.055 * pow( max( c, 1e-6 ), vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
	// dither before the 8-bit quantisation: no banding in sky and fog gradients
	if ( uDitherMode == 1 ) {
		// ordered 8 x 8: the Bayer rank v and a decorrelated permutation of it add up to a TRIANGULAR distribution
		// over the tile, +-1 code value (no bands, and no bands of texture either), in a pattern PNG compresses fast
		ivec2 q8 = ( ivec2( gl_FragCoord.xy ) + ivec2( int( uSeed ) * 3, int( uSeed ) * 5 ) ) & 7;
		int bx = q8.x ^ q8.y, v = 0;
		for ( int k = 0; k < 3; k ++ ) { v = ( v << 2 ) | ( ( ( q8.y >> k ) & 1 ) << 1 ) | ( ( bx >> k ) & 1 ); }
		c += ( float( v + ( ( 3 * v + 6 ) & 63 ) + 1 ) / 64.0 - 1.0 ) * ( uDither / 255.0 );
	} else {
		// triangular white noise, +-1 code value, independent per channel
		uvec3 ip = uvec3( uint( gl_FragCoord.x ), uint( gl_FragCoord.y ), uSeed );
		vec3 r1 = vec3( pcg3d( ip ) ) * ( 1.0 / 4294967296.0 ), r2d = vec3( pcg3d( ip + uvec3( 0u, 0u, 7919u ) ) ) * ( 1.0 / 4294967296.0 );
		c += ( r1 + r2d - 1.0 ) * ( uDither / 255.0 );
	}
	// optional overlay (titles, captions): a canvas with straight alpha, blended in display space like a DOM layer
	if ( uOverlay > 0.0 ) { vec4 o = texture2D( tOverlay, vUv ); c = mix( c, o.rgb, o.a * uOverlay ); }
	gl_FragColor = vec4( c, 1.0 );
}`;

export async function create(ctx) {
  const { renderer, scene, camera, LAYERS } = ctx;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // only for anything that draws straight to the canvas; post tone-maps itself
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // shadow maps are rebuilt once per sub-frame by ctx.lighting.renderShadows(frame)
  renderer.autoClear = false;            // every clear is explicit (the accumulation target must survive between sub-frames)
  renderer.info.autoReset = false;       // renderFrame() resets it, so info.render covers the whole frame (all passes, all sub-frames)

  // the accumulation target is 32-bit float when the GPU can render to, blend into and filter one (else half float)
  const floatTargets = renderer.extensions.has('EXT_color_buffer_float') && renderer.extensions.has('EXT_float_blend') && renderer.extensions.has('OES_texture_float_linear');
  let W = 1, H = 1;

  // ---- render targets ----------------------------------------------------------------------------------------
  const depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);   // 24-bit, ENGINE.md 13
  depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter; depthTexture.name = 'post.depth';
  const rtScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: ctx.flags.web ? 2 : 4, depthBuffer: true, depthTexture });
  const rtAccum = new THREE.WebGLRenderTarget(1, 1, { type: floatTargets ? THREE.FloatType : THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const aoOpts = { type: THREE.HalfFloatType, format: THREE.RGFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const rtAO = new THREE.WebGLRenderTarget(1, 1, aoOpts), rtAOTmp = new THREE.WebGLRenderTarget(1, 1, aoOpts);
  rtScene.texture.name = 'post.scene'; rtAccum.texture.name = 'post.accum'; rtAO.texture.name = 'post.ao'; rtAOTmp.texture.name = 'post.ao.tmp';
  const BLOOM_MAX = 8;
  const bloomDown = [], bloomUp = [];
  for (let i = 0; i < BLOOM_MAX; i++) {
    const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    bloomDown.push(new THREE.WebGLRenderTarget(1, 1, o)); bloomUp.push(new THREE.WebGLRenderTarget(1, 1, o));
    bloomDown[i].texture.name = 'post.bloom.down' + i; bloomUp[i].texture.name = 'post.bloom.up' + i;
  }
  let bloomLevels = 1;

  // ---- full-screen machinery -----------------------------------------------------------------------------------
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsMaterial = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending, ...extra });
  const pass = (material, target) => { quad.material = material; renderer.setRenderTarget(target); renderer.render(quad, quadCam); };

  const depthU = { tDepth: { value: depthTexture }, uProj: { value: new THREE.Vector4() }, uZ: { value: new THREE.Vector3() } };
  const resU = { value: new THREE.Vector2(1, 1) }, invResU = { value: new THREE.Vector2(1, 1) };

  const AO_QUALITY = ctx.flags.web ? { slices: 2, steps: 4 } : { slices: 3, steps: 8 };
  const aoMat = fsMaterial(AO_FRAG, { ...depthU, uRes: resU, uRadius: { value: 2 }, uProjScale: { value: 1 }, uMaxPx: { value: 64 }, uFade: { value: new THREE.Vector2(350, 800) }, uPower: { value: 1.6 }, uShape: { value: new THREE.Vector3(0.7, 1.7, 0.15) }, uDebug: { value: 0 }, uNoise: { value: new THREE.Vector2() } },
    { defines: { AO_SLICES: AO_QUALITY.slices, AO_STEPS: AO_QUALITY.steps } });
  const aoBlurMat = fsMaterial(AO_BLUR_FRAG, { tAO: { value: null }, uStep: { value: new THREE.Vector2() } });
  const aoApplyMat = new THREE.ShaderMaterial({
    name: 'post-ao-apply', vertexShader: AO_APPLY_VERT, fragmentShader: AO_APPLY_FRAG,
    uniforms: { tAO: { value: rtAO.texture }, tScene: { value: rtScene.texture }, uInvRes: invResU, uIntensity: { value: 1 }, uLitKeep: { value: 0.45 }, uExposure: { value: 1 }, uLum: { value: new THREE.Vector2(0.12, 0.5) } },
    // dst = dst * src. Depth test "not equal" against a quad on the far plane: only samples that hold geometry
    // pass, so at a silhouette the sky samples of an edge pixel are not darkened (no halo against the sky).
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    depthTest: true, depthFunc: THREE.NotEqualDepth, depthWrite: false, transparent: false, toneMapped: false, fog: false,
  });
  ctx.hooks.register(aoApplyMat, { owner: 'post', skipHooks: true });
  const aoApply = new THREE.Mesh(tri, aoApplyMat);
  aoApply.name = 'post:ao-apply'; aoApply.frustumCulled = false; aoApply.renderOrder = -1e9; aoApply.matrixAutoUpdate = false;
  aoApply.castShadow = false; aoApply.receiveShadow = false; aoApply.layers.set(POST_LAYER); aoApply.visible = false;
  const postGroup = new THREE.Group(); postGroup.name = 'post'; postGroup.add(aoApply); scene.add(postGroup);

  const MB_TAPS = 32;
  const accumU = { tSrc: { value: rtScene.texture }, uWeight: { value: 1 }, ...depthU, uReprojA: { value: new THREE.Matrix4() }, uReprojB: { value: new THREE.Matrix4() }, uRes: resU, uMaxBlur: { value: 96 }, uNoise: { value: 0 } };
  const accumMat = fsMaterial(ACCUM_FRAG, accumU), accumMatMB = fsMaterial(ACCUM_FRAG, accumU, { defines: { MOTION_BLUR: 1, MB_TAPS } });
  const accumAdd = (m, first) => { m.blending = first ? THREE.NoBlending : THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor; };

  const bloomPreMat = fsMaterial(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 3 }, uKnee: { value: 0.5 }, uClamp: { value: 64 }, uKaris: { value: 0 } }, { defines: { PREFILTER: 1 } });
  const bloomDownMat = fsMaterial(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uKnee: { value: 0 }, uClamp: { value: 0 }, uKaris: { value: 0 } });
  const bloomUpMat = fsMaterial(BLOOM_UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 }, uWeightSrc: { value: 1 } });
  const outU = {
    tSrc: { value: rtAccum.texture }, tBloom: { value: null }, tAO: { value: rtAO.texture }, uBloomTexel: { value: new THREE.Vector2() },
    uBloom: { value: 0 }, uExposure: { value: 1 }, uSaturation: { value: 1 }, uWarmSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: 0 }, uVignette: { value: 0 }, uAspect: { value: 1 },
    uDither: { value: 1 }, uBalance: { value: new THREE.Vector3(1, 1, 1) }, uNightGrade: { value: new THREE.Vector4(1, 1, 1, 1) }, uNightRange: { value: new THREE.Vector3(0, 0.06, 0.38) }, uOperator: { value: 0 }, uView: { value: 0 }, uSeed: { value: 0 }, uDitherMode: { value: 0 }, tOverlay: { value: null }, uOverlay: { value: 0 },
  };
  const outMat = fsMaterial(OUT_FRAG, outU);

  const mainLayers = new THREE.Layers();
  mainLayers.set(LAYERS.MAIN); mainLayers.enable(LAYERS.WATER); mainLayers.enable(LAYERS.SKY); mainLayers.enable(LAYERS.FX);
  const reflectionLayers = new THREE.Layers();
  reflectionLayers.set(LAYERS.REFLECT); reflectionLayers.enable(LAYERS.SKY);
  const opaqueLayers = new THREE.Layers();   // phase 1
  opaqueLayers.set(LAYERS.MAIN); opaqueLayers.enable(LAYERS.SKY);
  const overlayLayers = new THREE.Layers();  // phase 2
  overlayLayers.set(LAYERS.WATER); overlayLayers.enable(LAYERS.FX); overlayLayers.enable(POST_LAYER);

  const prePasses = [];
  let frameBytes = null;
  const camA = new THREE.PerspectiveCamera(), camB = new THREE.PerspectiveCamera();
  const _m = new THREE.Matrix4();

  function setSize(width, height, dpr) {
    W = Math.max(1, Math.round(width * dpr)); H = Math.max(1, Math.round(height * dpr));
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    rtScene.setSize(W, H); rtAccum.setSize(W, H); rtAO.setSize(W, H); rtAOTmp.setSize(W, H);
    // bloom chain: level i is 1 / 2^(i+1) of the frame; the coarsest level is about 16 pixels high, so the widest
    // glow is the same fraction of the picture at any resolution
    bloomLevels = Math.max(2, Math.min(BLOOM_MAX, Math.round(Math.log2(H / 16))));
    for (let i = 0; i < BLOOM_MAX; i++) {
      const on = i < bloomLevels, w = on ? Math.max(1, Math.round(W / 2 ** (i + 1))) : 1, h = on ? Math.max(1, Math.round(H / 2 ** (i + 1))) : 1;
      bloomDown[i].setSize(w, h); bloomUp[i].setSize(w, h);
    }
    resU.value.set(W, H); invResU.value.set(1 / W, 1 / H);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }

  // low-discrepancy sub-pixel pattern, centred so that N sub-frames and 1 sub-frame are registered on each other
  const jitterTables = new Map();
  function jitterTable(n) {
    let tb = jitterTables.get(n);
    if (!tb) {
      tb = []; let mx = 0, my = 0;
      for (let i = 0; i < n; i++) { const p = [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]; tb.push(p); mx += p[0] / n; my += p[1] / n; }
      for (const p of tb) { p[0] = Math.max(-0.5, Math.min(0.5, p[0] - mx)); p[1] = Math.max(-0.5, Math.min(0.5, p[1] - my)); }
      jitterTables.set(n, tb);
    }
    return tb;
  }

  function runBloom() {
    const b = post.bloom;
    bloomPreMat.uniforms.uThreshold.value = b.threshold; bloomPreMat.uniforms.uKnee.value = Math.max(1e-4, b.knee * b.threshold); bloomPreMat.uniforms.uClamp.value = b.clamp; bloomPreMat.uniforms.uKaris.value = b.karis ? 1 : 0;
    bloomPreMat.uniforms.tSrc.value = rtAccum.texture; bloomPreMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    pass(bloomPreMat, bloomDown[0]);
    for (let i = 1; i < bloomLevels; i++) {
      bloomDownMat.uniforms.tSrc.value = bloomDown[i - 1].texture; bloomDownMat.uniforms.uTexel.value.set(1 / bloomDown[i - 1].width, 1 / bloomDown[i - 1].height);
      pass(bloomDownMat, bloomDown[i]);
    }
    // level weights: each coarser octave carries 4^(radius - 0.5) times the energy of the next finer one. 0.5 = the
    // same energy in every octave (a wide 1 / r^2 veil); the default 0.25 = 0.71 per octave, so about a third of
    // the glow stays within a few pixels of its source (a lamp two pixels wide gets a visible halo) and the veil
    // over the rest of the frame stays faint
    const tilt = 4 ** (b.radius - 0.5), w = []; let sum = 0;
    for (let i = 0; i < bloomLevels; i++) { w.push(tilt ** (i - (bloomLevels - 1))); sum += w[i]; }
    let src = bloomDown[bloomLevels - 1], srcW = w[bloomLevels - 1] / sum;
    for (let i = bloomLevels - 2; i >= 0; i--) {
      bloomUpMat.uniforms.tSrc.value = src.texture; bloomUpMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      bloomUpMat.uniforms.tBase.value = bloomDown[i].texture; bloomUpMat.uniforms.uWeight.value = w[i] / sum; bloomUpMat.uniforms.uWeightSrc.value = srcW;
      pass(bloomUpMat, bloomUp[i]);
      src = bloomUp[i]; srcW = 1;
    }
    outU.tBloom.value = src.texture; outU.uBloomTexel.value.set(1 / src.width, 1 / src.height);
  }

  const post = {
    impl: 'real',
    /** Layers drawn by the main camera (MAIN, WATER, SKY, FX; DEBUG is added when frame.debug is set). */
    mainLayers,
    /** Layers a planar-reflection camera must use: objects opt in with object.layers.enable(ctx.LAYERS.REFLECT). */
    reflectionLayers,
    /** The two phases of the main render: opaque = MAIN + SKY (+ DEBUG), overlay = WATER + FX (after the AO multiply). */
    opaqueLayers, overlayLayers,
    /**
     * Render targets: { scene (HDR, MSAA 4, linear; resolved after each phase), accum (linear HDR sum of the sub-frames),
     * ao (r = occlusion of the last sub-frame), bloom (the summed chain, half resolution) }.
     * depthTexture: resolved depth of PHASE 1 (opaque scene) of the current sub-frame, standard 24-bit perspective depth.
     */
    targets: { scene: rtScene, accum: rtAccum, ao: rtAO, get bloom() { return bloomUp[0]; } }, depthTexture,
    /**
     * Uniform objects for shaders drawn in PHASE 2 (layers WATER and FX): the opaque scene behind them.
     *   uniform sampler2D uBPostDepth;  uniform sampler2D uBPostColor;  uniform vec2 uBPostInvRes;  uniform vec3 uBPostZ;
     *   vec2 uv = gl_FragCoord.xy * uBPostInvRes;
     *   float sceneZ = uBPostZ.x / ( 1.0 - texture2D( uBPostDepth, uv ).x * uBPostZ.y );     // metres along the view axis
     * (soft particles, water depth and refraction). Not valid in phase 1 or in a pre-pass: they hold the previous sub-frame there.
     */
    uniforms: { uBPostDepth: depthU.tDepth, uBPostColor: { value: rtScene.texture }, uBPostInvRes: invResU, uBPostZ: depthU.uZ },
    /** Drawing-buffer size in device pixels. */
    get width() { return W; }, get height() { return H; },
    setSize,
    /**
     * Register a pass that runs for every sub-frame after ctx.update() and the shadow pass, before the main scene
     * render (planar reflection ...). fn(ctx, frame). Lower order runs first. The pass must restore the render
     * target it changed. Returns a function that removes the pass.
     * opts.perFrame = true: run only in the FIRST sub-frame of each output frame (frame.sub === 0). Cheaper, but
     * what it renders is then one sub-frame old for the others: use it only for things that barely depend on the
     * camera (a far environment capture), not for a planar reflection during a fast transition.
     */
    addPrePass(name, fn, order = 100, opts = {}) {
      const p = { name, fn, order, perFrame: !!(opts && opts.perFrame) }; prePasses.push(p); prePasses.sort((a, b) => a.order - b.order);
      return () => { const i = prePasses.indexOf(p); if (i >= 0) prePasses.splice(i, 1); };
    },
    prePasses: () => prePasses.map((p) => p.name),
    /**
     * Bloom (ENGINE.md section 1, "HDR scale"). threshold: linear scene radiance BEFORE exposure; only what exceeds
     * it glows (sun disc, glitter, flames). strength: the glow carries strength x the radiance above the threshold;
     * radius 0..1: how the glow is spread over the octaves, each coarser octave gets 4^(radius - 0.5) x the energy of
     * the next finer one (0.25: tight halo and a faint veil; 0.5: equal energy, wide veil); knee: soft knee as a
     * fraction of the threshold; clamp: radiance cap before the threshold (the sun disc and a brazier glow alike
     * per pixel); karis: damp single bright samples (off: the frame is already anti-aliased by the accumulation).
     */
    bloom: { enabled: true, threshold: 3.0, strength: 1.0, radius: 0.25, knee: 0.25, clamp: 20, karis: false },
    /**
     * Ambient occlusion (GTAO). radius: world metres; intensity 0..1; power: contrast of the occlusion; fadeStart /
     * fadeEnd: view distance (m) over which it fades out; litKeep: share of the occlusion kept on surfaces in direct
     * light (lum = [lo, hi] exposed luminance where that sets in); maxPixels: cap of the search radius as a fraction
     * of the frame height (0.4: the full 3 m from about 9 m of view distance on at fov 46; nearer than that the
     * radius shrinks in proportion). The passes are skipped where nothing in view can be nearer than fadeEnd.
     */
    ao: { enabled: true, radius: 3.0, intensity: 1.0, power: 1.5, falloff: 0.7, distribution: 1.7, bias: 0.15, fadeStart: 350, fadeEnd: 800, litKeep: 0.45, lum: [0.12, 0.5], maxPixels: 0.4, slices: AO_QUALITY.slices, steps: AO_QUALITY.steps },
    /**
     * Motion blur. shutter: fraction of the frame interval the shutter is open (0.5 = 180 degrees); used when
     * renderFrame gets no shutter and ctx.film.shutterAt(t) does not exist. gapFill: blur each sub-frame along the
     * camera-motion vector of its own time slice, so N slices join into one continuous blur. Rotation and
     * translation are both filled at any speed, EXCEPT while the camera is carried by something that fills the frame:
     * there the translation is filled only above minSpeed (m/s), fully above fullSpeed, so that the carrier stays
     * sharp. carried: 'auto' (the shot record has raw.ridesBoat: the boat of shot 5) | true | false | (frame) => boolean.
     * maxPixels: cap per slice as a fraction of the frame height. enabled = false: no motion blur at all (every
     * sub-frame is rendered at t; they still anti-alias). single: with ONE sub-frame, blur it over the whole shutter
     * (default false: a still with sub = 1 is a sharp snapshot, as the contract says; motion blur needs sub >= 2).
     */
    motionBlur: { enabled: true, shutter: 0.5, gapFill: true, single: false, carried: 'auto', minSpeed: 4.5, fullSpeed: 8, maxPixels: 0.08 },
    /** Tone mapping: operator 'aces' (as the stub and THREE.ACESFilmicToneMapping) or 'agx'. Exposure is NOT here: it is frame.light.exposure. */
    tone: { operator: 'aces' },
    /**
     * Grade after tone mapping (display-linear): contrast about mid grey, saturation, lift (keeps blacks off zero),
     * balance [r, g, b] (before the curve), vignette (darkening in the corners, at most 0.05). This is the film-wide
     * grade. warm: { <light mode>: s } is a saturation factor for WARM colours only (red above blue; sky, water and
     * neutrals are untouched), per light mode and blended like the light (missing mode = 1, warm: null = off): the
     * golden sun on mud brick is where the earth palette runs away into orange (SPEC 4: mean saturation 0.25-0.33).
     * A light state may carry its own grade, frame.light.grade = { saturation, contrast, balance: [r, g, b],
     * warmSaturation } (all optional): saturation, contrast and balance are multiplied in, warmSaturation REPLACES
     * the table value, all averaged over the sub-frames, so a per-mode look follows the light.
     */
    grade: { enabled: true, contrast: 1.0, saturation: 1.0, warm: { golden: 0.8, afternoon: 0.8 }, lift: 0.0015, balance: [1, 1, 1], vignette: 0.035,
      /** Night grade of the DARK tones, weighted by frame.light.night: saturation, tint [r, g, b], and the display-linear luma range over which it fades out (bright things keep their colour). null switches it off. */
      night: { saturation: 0.62, tint: [0.88, 0.98, 1.16], range: [0.05, 0.36] } },
    /**
     * Dither before the 8-bit quantisation, +-1 code value with a triangular distribution. pattern 'bayer': ordered
     * 8 x 8 (PNG capture stays fast); 'noise': white noise per channel (capture about 0.2 s slower at 4K). amplitude scales
     * either; temporal: shift the pattern every frame (false = fixed in screen space).
     */
    dither: { enabled: true, pattern: 'bayer', amplitude: 1, temporal: false },
    /** Debug view: null | 'ao' (occlusion buffer of the last sub-frame) | 'normal' (view-space y of the normal GTAO reconstructs) | 'z' (fract of the view depth) | 'bloom' (bloom alone). */
    view: null,
    /**
     * Optional overlay INSIDE the canvas pixels (titles, captions), for a capture path that does not screenshot the
     * DOM (readFrame, canvas.toBlob). setOverlay(canvas2d | null); after redrawing the canvas set overlay.needsUpdate = true.
     * The canvas is stretched over the frame, uses straight alpha and is blended in display space, after the dither.
     */
    overlay: { canvas: null, texture: null, opacity: 1, needsUpdate: false },
    setOverlay(canvas) {
      const ov = post.overlay;
      if (ov.texture) { ov.texture.dispose(); ov.texture = null; }
      ov.canvas = canvas || null;
      if (canvas) { ov.texture = new THREE.CanvasTexture(canvas); ov.texture.colorSpace = THREE.NoColorSpace; ov.texture.minFilter = ov.texture.magFilter = THREE.LinearFilter; ov.texture.generateMipmaps = false; ov.needsUpdate = true; }
      return ov;
    },
    /**
     * The finished 8-bit frame as RGBA bytes, rows BOTTOM-UP (GL order; flip with ffmpeg -vf vflip). About 6 ms at
     * 3840 x 2160 against 0.3 to 0.6 s for a PNG screenshot. Reuses one buffer: copy it if you keep it.
     */
    readFrame() {
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!frameBytes || frameBytes.length !== w * h * 4) frameBytes = new Uint8Array(w * h * 4);
      renderer.setRenderTarget(null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, frameBytes);
      return { width: w, height: h, data: frameBytes };
    },
    /** Estimated GPU memory of post's own render targets in MB: { total, scene (MSAA colour + depth + resolves), accum, ao, bloom, canvas }. */
    memory() {
      const px = W * H, mb = (b) => Math.round(b / 1048576);
      const sceneB = px * 8 * 4 + px * 4 * 4 + px * 8 + px * 4, accumB = px * (floatTargets ? 16 : 8), aoB = 2 * px * 4, canvasB = 2 * px * 4;
      let bloomB = 0; for (let i = 0; i < bloomLevels; i++) bloomB += 2 * bloomDown[i].width * bloomDown[i].height * 8;
      return { total: mb(sceneB + accumB + aoB + bloomB + canvasB), scene: mb(sceneB), accum: mb(accumB), ao: mb(aoB), bloom: mb(bloomB), canvas: mb(canvasB) };
    },
    /** Test switches (never set in the film). skipPrePasses: run no pre-pass (out/post/scripts/shadoworder.js). aoAlways: run the AO passes even where the altitude rule skips them (out/audit-post/scripts/aoskip.js). */
    debug: { skipPrePasses: false, aoAlways: false },
    /**
     * What the last renderFrame did: { sub, exposure, ao (ran), gapFill 0..1, speed (m/s), shutter, grade: { saturation,
     * warmSaturation, contrast, balance } (as applied), passes }. passes = draw calls and triangles of ONE sub-frame (the
     * largest of the frame) per pass: { shadows: { calls, triangles, cascades: [calls per map] }, 'pre:<name>' for every
     * pre-pass (the reflection is 'pre:water-reflection'), main (opaque + sky), ao (post's own quads), overlay (water + FX) }.
     */
    last: { sub: 0, exposure: 1, ao: false, gapFill: 0, speed: 0, shutter: 0.5 },
    /** Sub-pixel jitter of sub-frame i of n in device pixels, each in [-0.5, 0.5]: Halton(2, 3), centred on the pixel. [0, 0] when n = 1. */
    jitter(i, n) { return n <= 1 ? [0, 0] : jitterTable(n)[((i % n) + n) % n].slice(); },
    /** Film-time offset (seconds) of sub-frame i of n for a shutter open `shutter` of the frame interval, centred on t. */
    timeOffset(i, n, shutter, fps) { return n <= 1 ? 0 : (((i + 0.5) / n) - 0.5) * shutter / fps; },
    /**
     * Render film time t to the canvas. opts: { sub: sub-frame count (default ctx.flags.sub), shutter (default
     * film.shutterAt(t) or motionBlur.shutter), fps: film fps }.
     * Returns { t, sub, frame } where frame is ctx.frame after the last sub-frame.
     */
    renderFrame(t, opts = {}) {
      const n = Math.max(1, Math.floor(opts.sub ?? ctx.flags.sub ?? 1));
      const fps = opts.fps ?? ctx.film.fps;
      const ao = post.ao, mb = post.motionBlur;
      // motionBlur.enabled = false means NO motion blur: every sub-frame is rendered at t (they still anti-alias)
      const shutter = !mb.enabled ? 0 : opts.shutter ?? (typeof ctx.film.shutterAt === 'function' ? ctx.film.shutterAt(t) : mb.shutter);
      // with 4 or more sub-frames the directions are spread over the sub-frames: one slice less per sub-frame
      const slices = Math.max(1, (ao.slices | 0) - (n >= 4 ? 1 : 0)), steps = Math.max(1, ao.steps | 0);
      if (slices !== aoMat.defines.AO_SLICES || steps !== aoMat.defines.AO_STEPS) { aoMat.defines.AO_SLICES = slices; aoMat.defines.AO_STEPS = steps; aoMat.needsUpdate = true; }
      let frame = null, exposure = 0, aoRan = false, gap = 0, speed = 0;
      const lg = { saturation: 0, contrast: 0, balance: [0, 0, 0], warm: 0, night: 0 };   // mean of the light's grade over the sub-frames
      renderer.info.reset();
      // draw calls and triangles per pass (the largest sub-frame of the frame): post.last.passes
      const ri = renderer.info.render, passes = {}, cascadeCalls = [];
      let c0 = 0, t0 = 0;
      const mark = (name) => { const e = passes[name] || (passes[name] = { calls: 0, triangles: 0 }); e.calls = Math.max(e.calls, ri.calls - c0); e.triangles = Math.max(e.triangles, ri.triangles - t0); c0 = ri.calls; t0 = ri.triangles; };
      for (let i = 0; i < n; i++) {
        const ts = t + post.timeOffset(i, n, shutter, fps);
        frame = ctx.update(ts, { sub: i, subCount: n, tFrame: t });
        camera.layers.mask = mainLayers.mask;
        if (frame.debug) camera.layers.enable(LAYERS.DEBUG);
        const j = post.jitter(i, n);
        if (n > 1) camera.setViewOffset(W, H, j[0], j[1], W, H); else camera.clearViewOffset();
        // shadow maps: once per sub-frame, before any pass. (A lighting implementation without renderShadows
        // falls back to three's own update inside the first scene render of the sub-frame.)
        c0 = ri.calls; t0 = ri.triangles;
        if (typeof ctx.lighting.renderShadows === 'function') ctx.lighting.renderShadows(frame); else renderer.shadowMap.needsUpdate = true;
        mark('shadows');
        const si = ctx.lighting.shadow && ctx.lighting.shadow.info;
        if (Array.isArray(si)) si.forEach((c, q) => { cascadeCalls[q] = Math.max(cascadeCalls[q] || 0, c.calls || 0); });
        if (!post.debug.skipPrePasses) for (const p of prePasses) if (!p.perFrame || i === 0) { p.fn(ctx, frame); mark('pre:' + p.name); }
        const ex = frame.light && Number.isFinite(frame.light.exposure) ? frame.light.exposure : renderer.toneMappingExposure;
        exposure += ex / n;
        const fg = (frame.light && frame.light.grade) || null, fb = fg && Array.isArray(fg.balance) ? fg.balance : null;
        lg.saturation += (fg && Number.isFinite(fg.saturation) ? fg.saturation : 1) / n; lg.contrast += (fg && Number.isFinite(fg.contrast) ? fg.contrast : 1) / n;
        for (let q = 0; q < 3; q++) lg.balance[q] += (fb && Number.isFinite(fb[q]) ? fb[q] : 1) / n;
        // warm trim: the light state's own value if it gives one, else post.grade.warm per light mode, blended like the light
        let ws = 1;
        if (fg && Number.isFinite(fg.warmSaturation)) ws = fg.warmSaturation;
        else if (post.grade.warm && frame.light) {
          const tb = post.grade.warm, L = frame.light, sa = Number.isFinite(tb[L.a]) ? tb[L.a] : 1, sb = Number.isFinite(tb[L.b]) ? tb[L.b] : 1;
          const wk = Number.isFinite(L.w) ? L.w : Number.isFinite(L.k) ? L.k : 0;
          ws = sa + (sb - sa) * Math.min(1, Math.max(0, wk));
        }
        lg.warm += ws / n;
        lg.night += (frame.light && Number.isFinite(frame.light.night) ? frame.light.night : 0) / n;
        const pe = camera.projectionMatrix.elements;
        depthU.uProj.value.set(pe[0], pe[5], pe[8], pe[9]);
        depthU.uZ.value.set(camera.near, 1 - camera.near / camera.far, camera.far);

        // ---- phase 1: opaque scene and sky ------------------------------------------------------------------
        camera.layers.mask = opaqueLayers.mask;
        if (frame.debug) camera.layers.enable(LAYERS.DEBUG);
        aoApply.visible = false;
        rtScene.resolveDepthBuffer = true;
        renderer.setRenderTarget(rtScene);
        renderer.setClearColor(0x000000, 1); renderer.clear();
        c0 = ri.calls; t0 = ri.triangles;
        renderer.render(scene, camera);
        mark('main');

        // ---- ambient occlusion from the resolved depth ------------------------------------------------------
        // skipped when nothing in view can be nearer than the fade distance: the camera stands `clearance` above
        // the tallest thing below it (120 m over the ground), and the steepest ray of the frustum (bottom edge,
        // centre) reaches that level only after clearance / sin(pitch + fov / 2)
        const cp = frame.camera.pos, cl = frame.camera.look;
        const clearance = ctx.ground && typeof ctx.ground.height === 'function' ? cp[1] - ctx.ground.height(cp[0], cp[2]) - 120 : 0;
        let nearest = clearance;
        if (clearance > 0 && cl) {
          const down = Math.atan2(cp[1] - cl[1], Math.hypot(cl[0] - cp[0], cl[2] - cp[2])) + 0.5 * camera.fov * Math.PI / 180;
          nearest = down <= 0.02 ? Infinity : clearance / Math.sin(Math.min(Math.PI / 2, down));
        }
        const doAO = ao.enabled && ao.intensity > 0 && (nearest < ao.fadeEnd || post.debug.aoAlways);
        if (doAO) {
          const u = aoMat.uniforms;
          u.uRadius.value = ao.radius; u.uProjScale.value = 0.5 * H * pe[5]; u.uMaxPx.value = Math.max(8, ao.maxPixels * H);
          u.uFade.value.set(ao.fadeStart, ao.fadeEnd); u.uPower.value = ao.power; u.uShape.value.set(ao.falloff, ao.distribution, ao.bias);
          u.uNoise.value.set(n > 1 ? halton(i + 1, 2) : 0, n > 1 ? halton(i + 1, 3) : 0); u.uDebug.value = post.view === 'normal' ? 1 : post.view === 'z' ? 2 : 0;
          pass(aoMat, rtAO);
          aoBlurMat.uniforms.tAO.value = rtAO.texture; aoBlurMat.uniforms.uStep.value.set(1 / W, 0); pass(aoBlurMat, rtAOTmp);
          aoBlurMat.uniforms.tAO.value = rtAOTmp.texture; aoBlurMat.uniforms.uStep.value.set(0, 1 / H); pass(aoBlurMat, rtAO);
          const a = aoApplyMat.uniforms;
          a.uIntensity.value = Math.min(1, ao.intensity); a.uLitKeep.value = ao.litKeep; a.uExposure.value = ex; a.uLum.value.set(ao.lum[0], ao.lum[1]);
          aoRan = true;
        }

        // ---- phase 2: AO multiply, then water and effects -----------------------------------------------------
        aoApply.visible = doAO;
        camera.layers.mask = overlayLayers.mask;
        rtScene.resolveDepthBuffer = false;   // the depth texture keeps the opaque scene (motion vectors, post.uniforms)
        renderer.setRenderTarget(rtScene);
        mark('ao');
        renderer.render(scene, camera);
        mark('overlay');
        aoApply.visible = false;
        camera.layers.mask = mainLayers.mask;
        if (frame.debug) camera.layers.enable(LAYERS.DEBUG);

        // ---- accumulate, filling the time slice of this sub-frame with a blur along the camera motion ---------
        let m = accumMat;
        // one sub-frame is a sharp snapshot at t (ENGINE.md 5.6: "no jitter, no time offset") unless motionBlur.single
        if (mb.enabled && mb.gapFill && shutter > 0 && (n > 1 || mb.single) && typeof ctx.film.poseAt === 'function') {
          const half = 0.5 * shutter / (fps * n);
          const pa = ctx.film.poseAt(ts - half), pb = ctx.film.poseAt(ts + half);
          const v = Math.hypot(pb.pos[0] - pa.pos[0], pb.pos[1] - pa.pos[1], pb.pos[2] - pa.pos[2]) / (2 * half);
          // translation is filled at any speed, except while the camera is carried by something that fills the
          // frame (the boat of shot 5): there only above minSpeed, so that the carrier stays sharp
          const carried = typeof mb.carried === 'function' ? !!mb.carried(frame) : mb.carried === true || ((mb.carried === 'auto' || mb.carried === undefined) && !!(frame.shot && frame.shot.raw && frame.shot.raw.ridesBoat));
          const k = Math.min(1, Math.max(0, (v - mb.minSpeed) / Math.max(1e-6, mb.fullSpeed - mb.minSpeed))), g = carried ? k * k * (3 - 2 * k) : 1;
          speed = Math.max(speed, v); gap = Math.max(gap, g);
          for (const [pose, cam, target] of [[pa, camA, accumU.uReprojA.value], [pb, camB, accumU.uReprojB.value]]) {
            const q = { ...pose, pos: [cp[0] + (pose.pos[0] - cp[0]) * g, cp[1] + (pose.pos[1] - cp[1]) * g, cp[2] + (pose.pos[2] - cp[2]) * g], near: camera.near, far: camera.far };
            cam.aspect = camera.aspect;
            if (n > 1) cam.setViewOffset(W, H, j[0], j[1], W, H); else cam.clearViewOffset();
            ctx.film.applyCamera(cam, q);
            cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
            target.multiplyMatrices(cam.projectionMatrix, _m.multiplyMatrices(cam.matrixWorldInverse, camera.matrixWorld));
          }
          accumU.uMaxBlur.value = Math.max(4, mb.maxPixels * H); accumU.uNoise.value = n > 1 ? halton(i + 1, 5) : 0;
          m = accumMatMB;
        }
        accumU.tSrc.value = rtScene.texture; accumU.uWeight.value = 1 / n;
        accumAdd(m, i === 0);
        pass(m, rtAccum);
      }
      camera.clearViewOffset();

      // ---- once per frame: bloom, tone mapping, grade, dither -> canvas -------------------------------------------
      const b = post.bloom, g = post.grade, dth = post.dither;
      const bloomOn = b.enabled && b.strength > 0;
      if (bloomOn) runBloom(); else outU.tBloom.value = rtAccum.texture;
      outU.uBloom.value = bloomOn ? b.strength : 0;
      outU.uExposure.value = exposure;
      outU.uOperator.value = post.tone.operator === 'agx' ? 1 : 0;
      outU.uContrast.value = g.enabled ? g.contrast * lg.contrast : 1; outU.uSaturation.value = g.enabled ? g.saturation * lg.saturation : 1; outU.uLift.value = g.enabled ? g.lift : 0;
      outU.uWarmSat.value = g.enabled ? lg.warm : 1;
      const ng = g.enabled ? g.night : null;
      outU.uNightRange.value.set(ng ? lg.night : 0, ng ? ng.range[0] : 0.05, ng ? ng.range[1] : 0.36);
      if (ng) outU.uNightGrade.value.set(ng.tint[0], ng.tint[1], ng.tint[2], ng.saturation);
      outU.uVignette.value = g.enabled ? Math.min(0.05, Math.max(0, g.vignette)) : 0; outU.uAspect.value = W / H;
      if (g.enabled) outU.uBalance.value.set(g.balance[0] * lg.balance[0], g.balance[1] * lg.balance[1], g.balance[2] * lg.balance[2]); else outU.uBalance.value.set(1, 1, 1);
      outU.uDither.value = dth.enabled ? dth.amplitude : 0; outU.uDitherMode.value = dth.pattern === 'bayer' ? 1 : 0; outU.uSeed.value = dth.temporal ? (Math.round(t * fps) & 0xffff) + 1 : 0;
      const ov = post.overlay;
      if (ov.texture && ov.needsUpdate) { ov.texture.needsUpdate = true; ov.needsUpdate = false; }
      outU.tOverlay.value = ov.texture; outU.uOverlay.value = ov.texture && !post.view ? ov.opacity : 0;
      outU.uView.value = post.view === 'ao' || post.view === 'normal' || post.view === 'z' ? 1 : post.view === 'bloom' ? 2 : 0;
      pass(outMat, null);
      passes.shadows = { ...(passes.shadows || { calls: 0, triangles: 0 }), cascades: cascadeCalls };
      post.last = { sub: n, exposure, ao: aoRan, gapFill: gap, speed, shutter, passes, grade: { saturation: outU.uSaturation.value, warmSaturation: outU.uWarmSat.value, contrast: outU.uContrast.value, balance: outU.uBalance.value.toArray(), night: outU.uNightRange.value.x } };
      return { t, sub: n, frame };
    },
  };
  setSize(ctx.size.width, ctx.size.height, ctx.size.dpr);
  return post;
}
