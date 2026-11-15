// js/core/water.js — subsystem "water" (REAL). OWNER: water engineer (also js/modules/waterbodies.js, docs/water.md).
// Contract: ENGINE.md 5.7. Everything the stub had is kept; additions are documented in docs/water.md.
//
// What it does
//   surfaces   flat meshes on the water plane (grid-covered polygons that tuck 1 cell under the banks, exact
//              polygons for pools, strips for canals). Shading is a function of WORLD position and of three
//              per-vertex fields (drift velocity, calmness, body colour) that are blended across water bodies,
//              so river, moats and canals join without a seam.
//   material   ONE MeshStandardMaterial with its own onBeforeCompile patch (no global hook): the standard
//              lighting gives the irradiance on the water (sun WITH the engine's shadows, sky fill, fire
//              lights); the patch adds ripples (a generated LEAN texture: slopes + slope variance, so unresolved
//              ripples turn into roughness instead of noise), Fresnel, the planar reflection, sun / moon
//              glitter with discrete sparkles, shore foam, wakes. Aerial perspective comes from the 'aerial' hook.
//   reflection a mirrored camera renders layers REFLECT + SKY once per output frame into a half-resolution HDR
//              target (oblique near plane = the water plane, so every material is clipped); above
//              settings.reflection.maxHeight only the sky is rendered.
//   wakes      registered sources are drawn once per output frame into a camera-centred "wake map"
//              (slope, foam, calm lane) as a pure function of film time, and read by the water shader.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from './mathx.js';
import { hash2 } from './rng.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------
// GLSL: ripple texture generator (run once at boot on the GPU)
// ---------------------------------------------------------------------------------------------------------
const NWAVES = 56;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const RIPPLE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec4 uW[ ${NWAVES} ];   // m, n (integer wave numbers per tile), slope amplitude, phase
uniform float uHeightNorm;
void main() {
	vec2 s = vec2( 0.0 ); float h = 0.0;
	for ( int i = 0; i < ${NWAVES}; i ++ ) {
		vec4 w = uW[ i ];
		float k = length( w.xy );
		float th = 6.28318530718 * ( w.x * vUv.x + w.y * vUv.y ) + w.w;
		// Stokes-like profile: second harmonic in phase with the crests (sharper crests, flatter troughs)
		s += w.z * ( w.xy / k ) * ( - sin( th ) - 0.5 * sin( 2.0 * th ) );
		h += ( w.z / k ) * ( cos( th ) + 0.25 * cos( 2.0 * th ) );
	}
	gl_FragColor = vec4( s, dot( s, s ), h * uHeightNorm );
}`;

// ---------------------------------------------------------------------------------------------------------
// GLSL: the water patch for MeshStandardMaterial
// ---------------------------------------------------------------------------------------------------------
const WATER_PARS_VERT = /* glsl */ `
attribute vec3 aBWFlow;
attribute vec3 aBWBody;
varying vec3 vBWFlow;
varying vec3 vBWBody;
`;
const WATER_VERT = /* glsl */ `
	vBWFlow = aBWFlow;
	vBWBody = aBWBody;
`;
const WATER_PARS_FRAG = /* glsl */ `
varying vec3 vBWFlow;   // xy: drift velocity of the ripple pattern (world x, z; m/s), z: calmness scale of the ripples
varying vec3 vBWBody;   // body (upwelling) albedo, linear
uniform sampler2D tBWNorm;
uniform sampler2D tBWRefl;
uniform sampler2D tBWReflDepth;
uniform sampler2D tBWShore;
uniform sampler2D tBWWake;
uniform sampler2D tBWWake2;
uniform mat4 uBWReflMatrix;
uniform mat4 uBWReflInv;
uniform vec4 uBWRefl;       // x: enabled, y: target pixels per radian, z: 1 = scene objects are in the target, w: max lod
uniform vec4 uBWShoreRect;  // minX, minZ, 1 / sizeX, 1 / sizeZ   (w < 0: no shore map)
uniform vec4 uBWWakeRect;   // near wake map: centre x, centre z, 1 / (2 * half size), enabled
uniform vec4 uBWWakeRect2;  // far wake map (4 x the size)
uniform vec3 uBWSunDir;
uniform vec3 uBWSunE;       // sun irradiance at normal incidence (colour * intensity)
uniform vec3 uBWMoonDir;
uniform vec3 uBWMoonE;
uniform vec3 uBWKeyE;       // radiance of a white horizontal surface lit by the UNSHADOWED key light (for the shadow factor)
uniform vec3 uBWSkyUp;
uniform vec3 uBWSkyHor;
uniform vec3 uBWLookDown;   // albedo multiplier looking straight down (riverLookDown / riverNormal)
uniform vec3 uBWDeep;       // albedo multiplier in deep water (riverDeep / riverNormal)
uniform vec3 uBWFoamCol;
uniform vec3 uBWSilt;       // albedo multiplier in a silt plume (riverFlood / riverNormal)
uniform vec4 uBWWind;       // xy: unit direction the wind blows toward (world x, z), z: ripple gain, w: sub-frame dither 0..1
uniform vec4 uBWScale;      // metres per tile of the four ripple layers
uniform vec4 uBWSlope;      // RMS slope of the four ripple layers on the open river
uniform vec4 uBWGlit;       // x: sparkle radiance, y: minimum sigma (sun disc), z: gain, w: cell size in pixels
uniform vec4 uBWGlit2;      // x: probability of a stray sparkle per cell, y: its radiance per unit of sun irradiance, z: cap on the glitter radiance, w: largest cell (m) that still shows stray sparkles
uniform vec4 uBWFoam;       // x: shore foam width (m), y: shore foam strength, z: silt plume strength, w: shallow tint strength
uniform vec4 uBWLook;       // x: body gain, y: glitter spread across the view, z: wind-streak contrast, w: night 0..1
uniform vec4 uBWBody;       // x: gain on the direct light that feeds the body under a low sun (see settings.lowSun)
uniform float uBTime;
uniform float uBWDebug;

float bbwHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float bbwNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( bbwHash( i ), bbwHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( bbwHash( i + vec2( 0.0, 1.0 ) ), bbwHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float bbwIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }

// One ripple layer: the tile is laid out along (ax, ay) in world x-z, L metres per repeat, and drifts with
// velocity vel using two phases that are cross-faded (flow-map advection: the pattern never smears).
// Returns xy: mean slope (dh/dx, dh/dz in world), z: slope variance lost to filtering, w: height.
vec4 bbwLayer( vec2 p, vec2 gx, vec2 gz, vec2 vel, float L, vec2 ax, vec2 ay, float period, float ph0 ) {
	float ph = fract( uBTime / period + ph0 );
	float wa = 1.0 - abs( 2.0 * ph - 1.0 ), wb = 1.0 - wa;
	float ta = ( ph - 0.5 ) * period, tb = ( fract( ph + 0.5 ) - 0.5 ) * period;
	vec2 qa = p - vel * ta, qb = p - vel * tb;
	// (the footprint is taken 1.5 x wider than the pixel: ripples near the pixel size go to the variance, not to moire)
	vec2 dx = vec2( dot( gx, ax ), dot( gx, ay ) ) * ( 1.5 / L ), dy = vec2( dot( gz, ax ), dot( gz, ay ) ) * ( 1.5 / L );
	vec4 A = textureGrad( tBWNorm, vec2( dot( qa, ax ), dot( qa, ay ) ) / L, dx, dy );
	vec4 B = textureGrad( tBWNorm, vec2( dot( qb, ax ), dot( qb, ay ) ) / L + vec2( 0.37, 0.61 ), dx, dy );
	float nrm = inversesqrt( wa * wa + wb * wb );
	vec2 s = ( wa * A.xy + wb * B.xy ) * nrm;
	float va = max( A.z - dot( A.xy, A.xy ), 0.0 ), vb = max( B.z - dot( B.xy, B.xy ), 0.0 );
	return vec4( ax * s.x + ay * s.y, ( wa * wa * va + wb * wb * vb ) * nrm * nrm, ( wa * A.w + wb * B.w ) * nrm );
}

// one level of the sparkle grid: q in cell units; p = probability that a cell is lit; returns 0..1
float bbwSpark( vec2 q, float p ) {
	vec2 id = floor( q ), f = fract( q ) - 0.5;
	float h1 = bbwHash( id + 0.17 ), h2 = bbwHash( id.yx + 7.31 ), h3 = bbwHash( id + 31.7 );
	float tt = uBTime / 0.17 + h1 * 7.0, slot = floor( tt ), ph = tt - slot;
	// (bbwHash has only about 2^-10 resolution: two draws give the fine probabilities the edge of the path needs)
	vec2 ic = id + vec2( slot * 0.618, slot * 1.37 ) + 3.1;
	float on = step( bbwHash( ic ) + bbwHash( ic.yx + 5.7 ) * 0.001, p ) * step( 1e-7, p );
	float d = length( f - ( vec2( h2, h3 ) - 0.5 ) * 0.44 );
	return on * ( 1.0 - smoothstep( 0.16, 0.40, d ) ) * ( 0.45 + 0.55 * sin( 3.14159265 * ph ) );
}

// the sparkle grid at a cell size that follows the pixel footprint: two octaves cross-faded, so the pattern never jumps
float bbwSparkGrid( vec2 pxz, float cell, float p ) {
	float lf = log2( max( cell, 1e-3 ) / 0.05 ), l0 = floor( lf ), fr = lf - l0;
	float s0 = 0.05 * exp2( l0 );
	return mix( bbwSpark( pxz / s0, p ), bbwSpark( pxz / ( 2.0 * s0 ) + 13.7, p ), fr );
}

// Glitter of a distant disc light (sun, moon) on a rippled surface: Gaussian slope statistics around the
// resolved slope, realised as discrete sparkles whose density follows the mean radiance (energy preserving).
// spread widens the lobe ACROSS the view (art direction: a sun path 15-25 degrees wide under a low sun).
vec3 bbwGlitter( vec3 V, vec3 Ld, vec3 E, vec2 sres, float var, float nv, vec2 pxz, float cell, float dist, float sparkL, vec2 fwd, float spread ) {
	vec3 H = normalize( Ld + V );
	if ( H.y < 0.08 || Ld.y < - 0.02 ) return vec3( 0.0 );
	vec2 d = - H.xz / H.y - sres;
	float df = dot( d, fwd ), dl = dot( d, vec2( - fwd.y, fwd.x ) ) / spread;
	float r2 = df * df + dl * dl;
	float P = exp( - 0.5 * r2 / var ) / ( 6.2831853 * var * spread );
	// heavy tail: a few sparkles beside the path. It ends well before the horizon of slopes, so that water seen
	// away from the sun stays clean
	P += 0.04 * exp( - 0.5 * r2 / ( var * 5.0 ) ) / ( 6.2831853 * var * 5.0 * spread ) * ( 1.0 - smoothstep( 0.2, 0.45, length( d ) ) );
	float F = 0.02 + 0.98 * pow( 1.0 - max( dot( V, H ), 0.0 ), 5.0 );
	float h2 = H.y * H.y;
	float mean = uBWGlit.z * F * P / ( 4.0 * max( nv, 0.07 ) * h2 * h2 );
	float lum = max( E.r, max( E.g, E.b ) ) * mean;
	if ( lum < 1e-4 ) return vec3( 0.0 );
	const float C = 0.19;                                  // mean of bbwSpark over a lit cell and its life
	float p = clamp( lum / ( sparkL * C ), 0.0, 1.0 );
	float sparse = smoothstep( 0.0006, 0.005, p );         // the path thins out and ends: no stray sparkles far from it
	float disc = bbwSparkGrid( pxz, cell, p ) / ( p * C );   // discrete realisation, mean 1
	float solid = smoothstep( 1.0, 5.0, lum / ( sparkL * C ) );   // the core of the path fills in
	float far = smoothstep( 1400.0, 3200.0, dist );               // no sparkle noise at distance: statistics only
	// (the sheet is capped: at the far end of a long path the mean radiance would otherwise bloom into a second sun)
	return E * min( mean * mix( disc * sparse, 1.0, max( solid * 0.75, far ) ), uBWGlit2.z / max( E.r, max( E.g, E.b ) ) );
}

vec3 bbwSky( vec3 R ) { return mix( uBWSkyHor, uBWSkyUp, smoothstep( 0.0, 0.6, R.y ) ); }
vec3 bbwReflSample( vec3 P, vec3 R, float d0, float lod ) {
	vec4 c = uBWReflMatrix * vec4( P + R * d0, 1.0 );
	vec2 uv = c.xy / max( c.w, 1e-4 );
	vec3 col = textureLod( tBWRefl, clamp( uv, vec2( 0.003 ), vec2( 0.997 ) ), lod ).rgb;
	vec2 e = abs( uv - 0.5 );
	float off = max( step( c.w, 0.0 ), smoothstep( 0.5, 0.56, max( e.x, e.y ) ) );
	return mix( col, bbwSky( R ), off );
}
`;

// Runs just before <lights_physical_fragment>: the standard lighting then computes the irradiance on a white,
// flat, rough horizontal surface (sun with the engine's shadows, sky fill, fire lights).
const WATER_PRE_LIGHT = /* glsl */ `
	diffuseColor.rgb = vec3( 1.0 );
	roughnessFactor = 1.0;
	metalnessFactor = 0.0;
	normal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
`;

// Runs just before <opaque_fragment>: replaces outgoingLight.
const WATER_SHADE = /* glsl */ `
{
	vec3 bwP = vBWorldPos;
	vec3 bwToEye = cameraPosition - bwP;
	float bwDist = length( bwToEye );
	vec3 bwV = bwToEye / bwDist;
	vec2 bwGx = dFdx( bwP.xz ), bwGz = dFdy( bwP.xz );
	float bwFmin = max( min( length( bwGx ), length( bwGz ) ), 1e-4 );
	// sparkle cell (m): a few pixels wide; at grazing angles it grows with the square root of the footprint's
	// elongation, so a sparkle stays more than a pixel high and reads as a short horizontal dash, not as grain
	float bwCell = uBWGlit.w * bwFmin * sqrt( min( max( length( bwGx ), length( bwGz ) ) / bwFmin, 9.0 ) );
	vec3 bwLit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;     // radiance of a white floor here
	float bwShadow = smoothstep( 0.12, 0.7, dot( reflectedLight.directDiffuse, vec3( 1.0 ) ) / max( dot( uBWKeyE, vec3( 1.0 ) ), 1e-4 ) );

	// ---- wakes (camera-centred map): xy slope, z foam, w calm lane --------------------------------
	vec4 bwWake = vec4( 0.0 );
	if ( uBWWakeRect.w > 0.5 ) {
		vec2 u0 = ( bwP.xz - uBWWakeRect.xy ) * uBWWakeRect.z + 0.5, u1 = ( bwP.xz - uBWWakeRect2.xy ) * uBWWakeRect2.z + 0.5;
		vec2 e0 = abs( u0 - 0.5 ), e1 = abs( u1 - 0.5 );
		float m0 = 1.0 - smoothstep( 0.42, 0.5, max( e0.x, e0.y ) ), m1 = 1.0 - smoothstep( 0.44, 0.5, max( e1.x, e1.y ) );
		bwWake = mix( texture2D( tBWWake2, u1 ) * m1, texture2D( tBWWake, u0 ), m0 );
	}

	// ---- shore map: r = signed distance to bank or obstacle, -4..4 m (positive in water); g = distance to the bank, 0..48 m ----
	float bwShoreNear = 4.0, bwShoreFar = 24.0, bwShoreMask = 0.0;
	if ( uBWShoreRect.w > 0.0 ) {
		vec2 suv = ( bwP.xz - uBWShoreRect.xy ) * uBWShoreRect.zw;
		vec2 se = abs( suv - 0.5 );
		bwShoreMask = 1.0 - smoothstep( 0.47, 0.5, max( se.x, se.y ) );
		if ( bwShoreMask > 0.0 ) {
			vec2 sh = texture2D( tBWShore, suv ).rg;
			bwShoreNear = mix( 4.0, sh.r * 8.0 - 4.0, bwShoreMask );
			bwShoreFar = mix( 24.0, sh.g * 48.0, bwShoreMask );
		}
	}

	// ---- ripples: four scales, wind-aligned, drifting with the water --------------------------------
	vec2 bwW = uBWWind.xy, bwWr = vec2( - bwW.y, bwW.x );
	float bwCalm = vBWFlow.z * uBWWind.z * ( 1.0 - 0.75 * clamp( bwWake.w, 0.0, 1.0 ) );
	bwCalm *= mix( 1.0, 0.55, ( 1.0 - smoothstep( 0.0, 7.0, bwShoreFar ) ) * bwShoreMask );          // lee of the bank
	float bwPaw, bwSlick;
	{	// cat's paws: patches of livelier and slacker water, stretched along the wind, drifting slowly; and broad
		// bands hundreds of metres long (rippled water beside slicks) that give the river its pattern from the air
		vec2 sp = vec2( dot( bwP.xz, bwWr ), dot( bwP.xz, bwW ) - uBTime * 0.6 );
		float st = bbwNoise( sp / vec2( 38.0, 120.0 ) ) * 0.62 + bbwNoise( sp / vec2( 11.0, 41.0 ) + 7.3 ) * 0.38;
		bwPaw = smoothstep( 0.25, 0.75, st );
		bwSlick = smoothstep( 0.3, 0.7, bbwNoise( sp / vec2( 130.0, 520.0 ) + 3.1 ) * 0.65 + bbwNoise( sp / vec2( 47.0, 190.0 ) + 11.9 ) * 0.35 );
		bwCalm *= ( 1.0 + uBWLook.z * ( bwPaw - 0.55 ) ) * ( 0.8 + 0.4 * bwSlick );
	}
	float bwPn = bbwNoise( bwP.xz / 47.0 ) * 0.4;
	vec2 bwVel = vBWFlow.xy;
	vec2 bwS = bwWake.xy; float bwVar = 0.0, bwH = 0.0;
	vec4 bwL;
	vec2 bwWd = bwW * ( 0.3 + 0.7 * min( vBWFlow.z, 1.0 ) );          // ripples run down wind; slower where the water is sheltered (moats, pools)
	bwL = bbwLayer( bwP.xz, bwGx, bwGz, bwVel + bwWd * 0.50, uBWScale.x, bwWr, bwW, 11.0, bwPn );
	bwS += bwL.xy * ( uBWSlope.x * bwCalm ); bwVar += bwL.z * uBWSlope.x * uBWSlope.x * bwCalm * bwCalm; bwH += bwL.w * 0.5;
	bwL = bbwLayer( bwP.xz, bwGx, bwGz, bwVel + bwWd * 0.36, uBWScale.y, bwWr * 0.9563 + bwW * 0.2924, bwW * 0.9563 - bwWr * 0.2924, 7.0, bwPn + 0.31 );
	bwS += bwL.xy * ( uBWSlope.y * bwCalm ); bwVar += bwL.z * uBWSlope.y * uBWSlope.y * bwCalm * bwCalm; bwH += bwL.w;
	bwL = bbwLayer( bwP.xz, bwGx, bwGz, bwVel + bwWd * 0.27, uBWScale.z, bwWr * 0.9205 - bwW * 0.3907, bwW * 0.9205 + bwWr * 0.3907, 5.0, bwPn + 0.63 );
	bwS += bwL.xy * ( uBWSlope.z * bwCalm ); bwVar += bwL.z * uBWSlope.z * uBWSlope.z * bwCalm * bwCalm; bwH += bwL.w * 0.6;
	if ( bwDist < 90.0 ) {
		bwL = bbwLayer( bwP.xz, bwGx, bwGz, bwVel + bwWd * 0.2, uBWScale.w, bwWr * 0.9877 + bwW * 0.1564, bwW * 0.9877 - bwWr * 0.1564, 3.3, bwPn + 0.83 );
		float fd = 1.0 - smoothstep( 60.0, 90.0, bwDist );
		bwS += bwL.xy * ( uBWSlope.w * bwCalm * fd );
		bwVar += ( bwL.z * fd * fd + ( 1.0 - fd * fd ) ) * uBWSlope.w * uBWSlope.w * bwCalm * bwCalm;
	} else {
		bwVar += uBWSlope.w * uBWSlope.w * bwCalm * bwCalm;
	}
	float bwSu = sqrt( bwVar );
	vec3 bwN = normalize( vec3( - bwS.x, 1.0, - bwS.y ) );
	float bwNV = max( dot( bwN, bwV ), 0.0 );

	// ---- reflection: planar target, perturbed by the resolved slope, smeared along the view by the rest ----
	vec3 bwReflCol = vec3( 0.0 ); float bwF = 0.0;
	vec2 bwFwd = normalize( bwP.xz - cameraPosition.xz + vec2( 1e-4, 0.0 ) );
	{
		float d0 = 1e5, lod = 0.0;
		if ( uBWRefl.x > 0.5 ) {
			vec4 c0 = uBWReflMatrix * vec4( bwP, 1.0 );
			vec2 uv0 = clamp( c0.xy / max( c0.w, 1e-4 ), vec2( 0.002 ), vec2( 0.998 ) );
			float z0 = textureLod( tBWReflDepth, uv0, 0.0 ).r;
			if ( z0 < 0.999995 ) {
				vec4 q = uBWReflInv * vec4( uv0 * 2.0 - 1.0, z0 * 2.0 - 1.0, 1.0 );
				d0 = clamp( length( q.xyz / q.w - bwP ), 0.3, 1e5 );
			}
			float par = d0 / ( bwDist + d0 );
			lod = clamp( log2( max( 0.5 * bwSu * par * uBWRefl.y, 1.0 ) ), 0.0, uBWRefl.w ) + ( 1.0 - uBWRefl.z ) * 2.0;
		}
		vec2 fwd = bwFwd, lat = vec2( - fwd.y, fwd.x );
		float dth = fract( bbwIGN( gl_FragCoord.xy ) + uBWWind.w ), dth2 = fract( bbwIGN( gl_FragCoord.yx + 19.0 ) + uBWWind.w * 1.3247 );   // uBWWind.w: golden-ratio sequence over the sub-frames
		float accW = 0.0;
		for ( int k = 0; k < 6; k ++ ) {
			float tk = ( float( k ) + dth ) / 6.0;
			float g = ( tk - 0.5 ) * 3.6;
			float lk = fract( tk * 2.618 + dth2 ) - 0.5;
			vec2 s = bwS + ( fwd * g + lat * lk * 1.2 ) * bwSu;
			vec3 nk = normalize( vec3( - s.x, 1.0, - s.y ) );
			float nvk = dot( nk, bwV );
			float wk = exp( - 0.5 * g * g ) * max( nvk, 0.0 );
			if ( wk <= 0.0 ) continue;
			vec3 Rk = reflect( - bwV, nk );
			Rk.y = abs( Rk.y ) + 0.003; Rk = normalize( Rk );
			float Fk = 0.02 + 0.98 * pow( 1.0 - clamp( nvk, 0.0, 1.0 ), 5.0 );
			vec3 ck = uBWRefl.x > 0.5 ? bbwReflSample( bwP, Rk, d0, lod ) : bbwSky( Rk );
			// the sun disc is drawn by the glitter term: keep it out of the mirrored sky
			ck = mix( ck, min( ck, vec3( 1.6 ) ), smoothstep( 0.975, 0.992, dot( Rk, uBWSunDir ) ) );
			// by night the mirrored sky keeps its afterglow and its blue, but loses the magenta in between (art direction: no purple water)
			ck.r = mix( ck.r, min( ck.r, ck.g * 1.04 ), uBWLook.w * smoothstep( 0.0, 0.12, ( ck.b - ck.g ) / max( ck.b, 1e-4 ) ) * ( 1.0 - smoothstep( 1.5, 3.0, ck.r ) ) );
			bwReflCol += wk * Fk * ck; bwF += wk * Fk; accW += wk;
		}
		bwReflCol /= max( accW, 1e-4 ); bwF /= max( accW, 1e-4 );
		bwReflCol *= mix( 1.1, 0.92, bwSlick );                                  // slicks mirror the low sky; rippled bands are a shade darker
	}

	// ---- body: silt-laden water. Albedo from the palette, greener looking down, darker in deep water ----
	float bwObl = 1.0 - clamp( bwV.y, 0.0, 1.0 );
	vec3 bwAlb = vBWBody * mix( uBWLookDown, vec3( 1.0 ), smoothstep( 0.03, 0.8, bwObl ) );
	bwAlb *= mix( vec3( 1.0 ), uBWDeep, smoothstep( 3.0, 40.0, bwShoreFar ) * 0.85 );
	{	// silt: streaks of more and less turbid water, stretched along the current and carried by it
		vec2 fd = bwVel + bwW * 0.08; fd /= max( length( fd ), 1e-4 );
		vec2 q = bwP.xz - bwVel * uBTime;
		vec2 sc = vec2( dot( q, vec2( - fd.y, fd.x ) ), dot( q, fd ) );
		float pl = bbwNoise( sc / vec2( 21.0, 95.0 ) ) * 0.6 + bbwNoise( sc / vec2( 6.5, 31.0 ) + 3.7 ) * 0.4;
		bwAlb *= mix( vec3( 1.0 ), uBWSilt, smoothstep( 0.35, 0.8, pl ) * uBWFoam.z ) * ( 0.9 + 0.2 * pl );
	}
	bwAlb *= 1.0 + 0.06 * clamp( bwH, - 2.5, 2.5 ) * min( bwCalm, 1.0 );                 // crests a shade lighter than troughs: ripples also read looking down
	bwAlb *= mix( 0.95, 1.05, bwSlick );
	float bwShallow = ( 1.0 - smoothstep( 0.2, 4.5, bwShoreFar ) ) * bwShoreMask;
	bwAlb = mix( bwAlb, bwAlb * 1.18 + vec3( 0.025, 0.02, 0.01 ), bwShallow * uBWFoam.w );
	bwAlb = mix( bwAlb, vec3( dot( bwAlb, vec3( 0.3, 0.5, 0.2 ) ) ) * vec3( 0.55, 0.85, 1.5 ), 0.75 * uBWLook.w );    // by night: no green, no brown: deep blue water
	// turbid water scatters more of a low sun's light back up than a matte floor would (its light enters steeply after refraction)
	vec3 bwCol = bwAlb * ( reflectedLight.directDiffuse * uBWBody.x + reflectedLight.indirectDiffuse ) * ( uBWLook.x * ( 1.0 - bwF ) ) + bwReflCol;

	// ---- glitter: sun by day, moon at night -----------------------------------------------------------
	float bwGVar = bwVar + uBWGlit.y * uBWGlit.y, bwStrayP = 0.0;
	if ( uBWSunE.r + uBWSunE.g + uBWSunE.b > 1e-3 ) {
		bwCol += bwShadow * bbwGlitter( bwV, uBWSunDir, uBWSunE, bwS, bwGVar, bwNV, bwP.xz, bwCell, bwDist, uBWGlit.x, bwFwd, uBWLook.y );
		// stray sparkles outside the path: here and there a steep facet catches the sun, more often toward it and
		// in livelier water. Only while a sparkle is resolved, so there is no sparkle noise at distance.
		if ( uBWSunDir.y > 0.0 && uBWGlit2.x > 0.0 && bwCell < uBWGlit2.w ) {
			// (none looking away from the sun, and none at grazing angles, where they would be sub-pixel dashes: noise)
			float tw = smoothstep( - 0.15, 0.8, dot( bwFwd, normalize( uBWSunDir.xz + vec2( 1e-5, 0.0 ) ) ) ) * smoothstep( 0.05, 0.22, bwV.y );
			float pa = uBWGlit2.x * tw * min( bwCalm, 1.4 ) * ( 0.3 + 1.4 * bwPaw ) * ( 1.0 - smoothstep( 0.4 * uBWGlit2.w, uBWGlit2.w, bwCell ) );
			vec3 ws = mix( uBWSunE, vec3( max( uBWSunE.r, max( uBWSunE.g, uBWSunE.b ) ) ), 0.45 );          // a glint is whiter than the light it mirrors
			bwStrayP = pa;
			if ( pa > 1e-6 ) bwCol += bwShadow * ws * ( uBWGlit2.y * bbwSparkGrid( bwP.xz + 91.7, bwCell, pa ) );
		}
	}
	if ( uBWMoonE.r + uBWMoonE.g + uBWMoonE.b > 1e-3 )
		bwCol += bwShadow * bbwGlitter( bwV, uBWMoonDir, uBWMoonE, bwS, bwGVar, bwNV, bwP.xz + 51.3, bwCell, bwDist, uBWGlit.x * 0.22, bwFwd, 1.6 );

	// ---- foam: shore line, drifting flecks, wakes ------------------------------------------------------
	float bwFn = bbwNoise( bwP.xz * 1.7 + bwVel * uBTime * 0.4 ) * 0.6 + bbwNoise( bwP.xz * 5.3 - bwVel * uBTime ) * 0.4;
	// scum gathers in patches: stretches of bank with a foam line alternate with clean ones (never a drawn outline)
	float bwFp = smoothstep( 0.4, 0.62, bbwNoise( bwP.xz / 9.0 + 4.7 ) * 0.55 + bbwNoise( bwP.xz / 33.0 + 9.2 ) * 0.45 );
	float bwFoam = ( 1.0 - smoothstep( 0.0, uBWFoam.x * ( 0.35 + 1.3 * bwFn ), bwShoreNear ) ) * smoothstep( - 0.9, - 0.35, bwShoreNear ) * smoothstep( 0.2, 0.55, bwFn + 0.25 ) * uBWFoam.y * ( 0.12 + 0.88 * bwFp ) * ( 1.0 - 0.35 * uBWLook.w ) * bwShoreMask;
	bwFoam += bwWake.z * ( 0.55 + 0.9 * bwFn );
	bwFoam = clamp( bwFoam, 0.0, 0.92 ) * ( 1.0 - smoothstep( 0.6, 2.5, bwFmin ) * 0.5 );
	// foam is a rough white froth: it catches the low sun that a flat surface does not
	bwCol = mix( bwCol, uBWFoamCol * ( bwLit * 1.25 + bwShadow * uBWSunE * 0.06 ), bwFoam );

	outgoingLight = bwCol;
	if ( uBWDebug > 0.5 ) {
		vec3 gS = bwShadow * bbwGlitter( bwV, uBWSunDir, uBWSunE, bwS, bwGVar, bwNV, bwP.xz, bwCell, bwDist, uBWGlit.x, bwFwd, uBWLook.y );
		outgoingLight = uBWDebug < 1.5 ? vec3( bwShadow ) : uBWDebug < 2.5 ? vec3( sqrt( bwVar ) * 5.0 ) : uBWDebug < 3.5 ? bwLit : uBWDebug < 4.5 ? bwReflCol
			: uBWDebug < 5.5 ? gS : uBWDebug < 6.5 ? vec3( bwS * 4.0 + 0.5, 0.5 ) : uBWDebug < 7.5 ? vec3( bwShoreNear / 8.0 + 0.5, bwShoreFar / 48.0, bwShoreMask )
			: uBWDebug < 8.5 ? vec3( bwWake.xy * 2.0 + 0.5, bwWake.z ) : uBWDebug < 9.5 ? vec3( bwF ) : uBWDebug < 10.5 ? bwAlb * bwLit : uBWDebug < 11.5 ? vec3( vBWFlow.xy * 0.5 + 0.5, vBWFlow.z )
			: uBWDebug < 12.5 ? vec3( bwStrayP * 100.0, bwSlick, bwPaw ) : vec3( bwCell * 0.25, bwFmin * 0.25, 0.0 );
	}
}
`;

// ---------------------------------------------------------------------------------------------------------
// GLSL: wake map (top-down, additive: rg = slope in world x / z, b = foam, a = calm lane)
// ---------------------------------------------------------------------------------------------------------
const WAKE_VERT = /* glsl */ `
attribute vec4 aA;   // strip: lateral offset (m), distance behind the bow (m), beam (m), speed through the water (m/s)   ring: local x, local z, radius, wavelength
attribute vec4 aB;   // strip: strength, hull length, seed, kind (0 boat, 1 quffa, 2 pier, 3 swimmer)                    ring: amplitude, band width, seed, splash
attribute vec4 aC;   // strip: lateral unit vector (x, z), tangent unit vector (x, z)
uniform vec4 uRect;  // centre x, centre z, half size, texel size (m)
varying vec4 vA; varying vec4 vB; varying vec4 vC;
void main() {
	vA = aA; vB = aB; vC = aC;
	gl_Position = vec4( ( position.x - uRect.x ) / uRect.z, ( position.z - uRect.y ) / uRect.z, 0.0, 1.0 );
}`;
const WAKE_NOISE = /* glsl */ `
float wHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float wNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( wHash( i ), wHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wHash( i + vec2( 0.0, 1.0 ) ), wHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}`;
// A hull wake in track coordinates: l = metres to the side of the track, d = metres behind the bow.
//   arms   the Kelvin cusp lines at 19.5 degrees: a thin pale line (seen from the air) carrying a packet of short crests
//   stern  churned, streaky foam for about two hull lengths, then a smooth lane to the end of the trail
//   hull   a thin crest of foam along the waterline
// 'pier' (kind 2): the same thing standing still in the current: two eddy lines trailing from the shoulders and a slick between.
const WAKE_STRIP_FRAG = /* glsl */ `
varying vec4 vA; varying vec4 vB; varying vec4 vC;
uniform vec4 uRect;
uniform float uTime;
${WAKE_NOISE}
void main() {
	float l = vA.x, d = vA.y, beam = vA.z, U = vA.w;
	float strength = vB.x, len = max( vB.y, beam ), seed = vB.z, kind = vB.w, texel = uRect.w;
	vec2 latv = vC.xy, tanv = vC.zw;
	float al = abs( l ), sg = l < 0.0 ? - 1.0 : 1.0;
	float pier = step( 1.5, kind ) * ( 1.0 - step( 2.5, kind ) );
	float sp = smoothstep( 0.12, 1.0, U );
	float decay = pow( 1.0 + max( d, 0.0 ) / len, - 0.8 );
	// ---- arms -------------------------------------------------------------------------------------
	float lam = clamp( 6.2832 * U * U / 9.81 * 0.55, 0.2, 1.5 );
	float armC = max( beam * 0.5, 0.354 * d ) + 0.08 * beam;
	float armW = max( 0.07 * beam + 0.028 * d, 1.25 * texel );
	float q = al - armC;
	float env = exp( - q * q / ( armW * armW ) ) * smoothstep( 0.1 * len, 0.5 * len, d ) * ( 0.5 + 0.5 * wNoise( vec2( d * 0.21 + seed * 13.0, sg * 2.0 ) ) );
	float thin = min( 1.0, ( 0.07 * beam + 0.028 * d ) / armW );                         // widened to a texel: keep the energy
	float res = 1.0 - smoothstep( 0.22 * lam, 0.55 * lam, texel );                        // crests only where the map resolves them
	float A = strength * decay * sp * mix( 1.0, 0.45, pier );
	float ph = 6.2832 * ( q / lam ) - d * 1.1;
	vec2 slope = latv * ( - 0.3 * A * env * sin( ph ) * res * sg );
	float foam = A * env * thin * ( 0.36 + 0.2 * cos( ph ) * res );
	// ---- transverse waves between the arms -------------------------------------------------------------
	float lamT = clamp( 6.2832 * U * U / 9.81, 0.3, 3.0 );
	float inside = ( 1.0 - smoothstep( 0.5, 0.95, al / max( armC, 1e-3 ) ) ) * smoothstep( 0.9 * len, 1.4 * len, d );
	slope += tanv * ( 0.12 * A * decay * inside * ( 1.0 - smoothstep( 0.22 * lamT, 0.55 * lamT, texel ) ) * sin( 6.2832 * d / lamT ) );
	// ---- stern: streaky foam, turbulence, then the smooth lane --------------------------------------------
	float after = max( d - len, 0.0 );
	float coreW = beam * ( 0.42 + 0.1 * after / len );
	float core = ( 1.0 - smoothstep( 0.55, 1.0, al / coreW ) ) * smoothstep( 0.7 * len, 1.0 * len, d );
	float dw = d - U * uTime;                                                             // fixed in the water: the boat leaves its froth behind
	vec2 np = vec2( l * 4.4 + seed * 37.0, dw * 0.8 );
	float n = wNoise( np ) * 0.5 + wNoise( np * vec2( 2.9, 2.3 ) + 5.0 ) * 0.5;
	float churn = core * exp( - after / ( 1.3 * len ) ) * sp * strength * ( 1.0 - 0.75 * pier );
	foam += churn * smoothstep( 0.42, 0.74, n ) * 0.8;
	slope += ( latv * ( n - 0.5 ) + tanv * ( wNoise( np.yx * 1.7 + 11.0 ) - 0.5 ) ) * ( 0.3 * churn );
	float lane = core * min( 1.0, strength * 1.5 ) * ( 0.35 + 0.65 * sp ) * exp( - after / ( 9.0 * len ) );
	// ---- eddy lines of a pier: thin broken streaks trailing from both shoulders ---------------------------
	float wob = ( wNoise( vec2( dw * 0.06 + seed * 9.0, sg * 5.0 ) ) - 0.5 ) * beam * 0.7 * smoothstep( 0.8 * len, 3.0 * len, d );
	float edge = exp( - pow( ( al - coreW * 0.92 - wob ) / max( 0.1 * beam, 1.25 * texel ), 2.0 ) ) * smoothstep( 0.6 * len, 1.0 * len, d );
	foam += pier * edge * strength * exp( - after / ( 2.6 * len ) ) * ( 0.2 + 0.8 * smoothstep( 0.3, 0.8, wNoise( vec2( dw * 0.1 + seed * 9.0, sg * 3.0 ) ) ) ) * 0.3;
	// ---- hull line -------------------------------------------------------------------------------------
	float hullW = max( 0.1 + 0.02 * beam, 1.25 * texel );
	float hullEdge = exp( - pow( ( al - beam * 0.5 ) / hullW, 2.0 ) ) * ( 1.0 - smoothstep( 0.75 * len, 1.02 * len, d ) ) * smoothstep( 0.0, 0.2 * len, d );
	foam += hullEdge * smoothstep( 0.25, 0.6, n + 0.15 ) * strength * mix( sp, 0.6, pier ) * 0.7 * min( 1.0, 0.25 / hullW + 0.3 );
	gl_FragColor = vec4( slope, foam, lane );
}`;
// Rings from a stroke: an expanding packet of two or three crests, a splash of foam at the start.
const WAKE_RING_FRAG = /* glsl */ `
varying vec4 vA; varying vec4 vB; varying vec4 vC;
uniform vec4 uRect;
void main() {
	vec2 lp = vA.xy; float r = vA.z, lam = vA.w, texel = uRect.w;
	float amp = vB.x, bw = max( vB.y, texel * 1.25 );
	float rho = length( lp ), q = rho - r;
	float env = exp( - q * q / ( bw * bw ) );
	float res = 1.0 - smoothstep( 0.22 * lam, 0.55 * lam, texel );
	vec2 dir = lp / max( rho, 1e-3 );
	float splash = vB.w * exp( - rho * rho / max( 0.07, texel * texel ) );
	gl_FragColor = vec4( dir * ( - amp * env * sin( 6.2832 * q / lam ) * res ), splash + amp * env * 0.3 * ( 1.0 - 0.6 * res ) * min( 1.0, vB.y / bw ), 0.0 );
}`;

// ---------------------------------------------------------------------------------------------------------
export async function create(ctx) {
  const { scene, renderer, LAYERS, materials, world, quality } = ctx;
  const level = world.levels.water;
  const root = new THREE.Group(); root.name = 'water'; scene.add(root);
  const wind = ctx.wind || { dir: [0.49, 0.87], speed: 2.6 };
  const col = (id) => materials.color(id);

  // ---- tunables (documented in docs/water.md; change them through ctx.water.settings) --------------------
  const settings = {
    cell: 12,                      // m: grid of the big polygon surfaces (river, moats); one global grid, so overlapping surfaces share vertices
    margin: 2,                     // m: how far a gridded surface is guaranteed to reach beyond its polygon (it tucks under the bank)
    overshoot: 1,                  // extra rings of grid cells beyond that: the bank geometry, not the water mesh, draws the waterline
    blend: 30,                     // m: half width of the zone in which two water bodies blend their look (moat mouths)
    kinds: {
      river: { color: 'riverNormal', calm: 1.0, flow: 0.75, drift: 0 },
      moat: { color: 'moat', calm: 0.36, flow: 0, drift: 0.05 },
      canal: { color: 'canal', calm: 0.5, flow: 0.25, drift: 0 },
      pool: { color: 'canal', calm: 0.22, flow: 0, drift: 0.02 },
    },
    ripple: { scales: [43, 11.7, 3.1, 0.83], slopes: [0.012, 0.024, 0.03, 0.024], gain: 1, streaks: 0.6 },   // RMS slope per scale on the open river (total about 0.047)
    glitter: { sparkle: 30, minSigma: 0.016, gain: 1, cellPx: 4.2, spread: 0, width: 20, stray: 0.003, strayGain: 4, cap: 45, strayMaxCell: 2.2 },   // cellPx: at 2160 lines; spread 0 = automatic from `width` (degrees) and the sun's elevation
    bodyGain: 2.2,                 // silt: the upwelling light of the turbid river relative to a matte surface of the palette colour
    bodyNight: 0.6,                // the same by night, as a share of bodyGain: dark water that carries the reflections
    lowSun: 1.8,                   // extra gain on the DIRECT light in the body when the key light is at the horizon (1 = none), fading out by 30 degrees
    foam: { width: 0.55, strength: 0.5, silt: 0.42, shallow: 0.5, color: [0.84, 0.82, 0.77] },
    reflection: { enabled: true, scale: 0.5, fovScale: 1.2, maxHeight: 650, fadeFrom: 420, clipBias: 0.03, samples: 4, everySubFrame: false },
    wakes: { enabled: true, size: quality.draft ? 1024 : 2048, autoBoats: true },
    shore: { texel: quality.draft ? 2.5 : 1.0, pad: 60 },
    debug: 0,                      // 1 shadow factor, 2 unresolved sigma x5, 3 light on the water, 4 reflection, 5 glitter, 6 slope, 7 shore map, 8 wake map, 9 Fresnel, 10 body, 11 drift / calm
    bob: 0.018,                    // m: amplitude of heightAt() on the open river
  };

  // ---- ripple texture (LEAN): rg = slope with RMS 1, b = |slope|^2, a = height with RMS 1 ------------------
  const rippleSize = quality.draft ? 512 : 1024;
  const rippleRT = new THREE.WebGLRenderTarget(rippleSize, rippleSize, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  });
  rippleRT.texture.name = 'water.ripples'; rippleRT.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  {
    const rng = ctx.rng('water-ripples'), waves = [], seen = new Set();
    while (waves.length < NWAVES) {
      const kmag = Math.exp(rng.range(Math.log(5), Math.log(46))), ang = rng.gauss() * 0.52;   // waves run along +v (down wind), spread about 30 degrees
      const m = Math.round(kmag * Math.sin(ang)), n = Math.round(kmag * Math.cos(ang)), key = m + ',' + n;
      if (n <= 0 || seen.has(key)) continue;
      seen.add(key);
      waves.push(new THREE.Vector4(m, n, Math.pow(Math.hypot(m, n), -0.3), rng.range(0, TAU)));
    }
    let vs = 0, vh = 0;
    for (const w of waves) { const k = Math.hypot(w.x, w.y); vs += w.z * w.z * (1 + 0.25) / 2; vh += (w.z / k) * (w.z / k) * (1 + 0.0625) / 2; }
    const ks = 1 / Math.sqrt(vs);
    for (const w of waves) w.z *= ks;
    const gen = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: RIPPLE_FRAG, uniforms: { uW: { value: waves }, uHeightNorm: { value: 1 / (Math.sqrt(vh) * ks) } }, depthTest: false, depthWrite: false, toneMapped: false });
    const q = new THREE.Mesh(tri, gen); q.frustumCulled = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rippleRT); renderer.clear(); renderer.render(q, quadCam); renderer.setRenderTarget(prev);
    gen.dispose();
  }

  // ---- uniforms shared by every water program ---------------------------------------------------------------
  const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true;
  const farDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); farDepth.needsUpdate = true;
  const shoreNone = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1); shoreNone.needsUpdate = true;
  const ratio = (a, b) => { const A = col(a), B = col(b); return new THREE.Vector3(A.r / B.r, A.g / B.g, A.b / B.b); };
  const U = {
    uBTime: materials.uniforms.uBTime,
    tBWNorm: { value: rippleRT.texture }, tBWRefl: { value: blackTex }, tBWReflDepth: { value: farDepth }, tBWShore: { value: shoreNone }, tBWWake: { value: blackTex }, tBWWake2: { value: blackTex },
    uBWReflMatrix: { value: new THREE.Matrix4() }, uBWReflInv: { value: new THREE.Matrix4() },
    uBWRefl: { value: new THREE.Vector4(0, 1000, 1, 6) },
    uBWShoreRect: { value: new THREE.Vector4(0, 0, 1, -1) },
    uBWWakeRect: { value: new THREE.Vector4(0, 0, 1, 0) }, uBWWakeRect2: { value: new THREE.Vector4(0, 0, 1, 0) },
    uBWSunDir: { value: new THREE.Vector3(0, 1, 0) }, uBWSunE: { value: new THREE.Vector3() },
    uBWMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uBWMoonE: { value: new THREE.Vector3() },
    uBWKeyE: { value: new THREE.Vector3(1, 1, 1) },
    uBWSkyUp: { value: new THREE.Color() }, uBWSkyHor: { value: new THREE.Color() },
    uBWLookDown: { value: ratio('riverLookDown', 'riverNormal') }, uBWDeep: { value: ratio('riverDeep', 'riverNormal') }, uBWSilt: { value: ratio('riverFlood', 'riverNormal') },
    uBWFoamCol: { value: new THREE.Vector3(...settings.foam.color) },
    uBWWind: { value: new THREE.Vector4(wind.dir[0], wind.dir[1], 1, 0) },
    uBWScale: { value: new THREE.Vector4(...settings.ripple.scales) },
    uBWSlope: { value: new THREE.Vector4(...settings.ripple.slopes) },
    uBWGlit: { value: new THREE.Vector4(30, 0.016, 1, 4) },
    uBWGlit2: { value: new THREE.Vector4(0.003, 4, 45, 2.2) },
    uBWFoam: { value: new THREE.Vector4(0.75, 0.85, 0.3, 0.55) },
    uBWDebug: { value: 0 },
    uBWLook: { value: new THREE.Vector4(1.5, 3.5, 0.6, 0) },
    uBWBody: { value: new THREE.Vector4(1, 0, 0, 0) },
  };

  // ---- the material: MeshStandardMaterial + its OWN onBeforeCompile ---------------------------------------------
  // The water patch is the material's own patch (it runs before the hook chain and adds no global hook), so the
  // engine's hooks still apply on top: 'world' (vBWorldPos), lighting's 'shadows' and 'aerial'.
  const material = new THREE.MeshStandardMaterial({ name: 'water', color: 0xffffff, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    const edit = (stage, anchor, fn) => {
      if (!shader[stage].includes(anchor)) { const msg = `water: anchor '${anchor}' not found in the ${stage} of the water material; the water will look wrong`; console.warn('[water] ' + msg); if (ctx.stats && !ctx.stats.warnings.includes(msg)) ctx.stats.warnings.push(msg); return; }
      shader[stage] = shader[stage].replace(anchor, fn(anchor));
    };
    edit('vertexShader', '#include <common>', (a) => a + '\n' + WATER_PARS_VERT);
    edit('vertexShader', '#include <begin_vertex>', (a) => a + '\n' + WATER_VERT);
    edit('fragmentShader', 'void main() {', (a) => WATER_PARS_FRAG + '\n' + a);
    edit('fragmentShader', '#include <lights_physical_fragment>', (a) => WATER_PRE_LIGHT + '\n' + a);
    edit('fragmentShader', '#include <opaque_fragment>', (a) => WATER_SHADE + '\n' + a);
  };
  material.customProgramCacheKey = () => 'water-v3';
  materials.register(material, { owner: 'water', water: true, noVariation: true, noTexture: true });

  // =========================================================================================================
  // Surfaces
  // =========================================================================================================
  const surfaces = [], wakes = [], obstacles = [];
  let nextId = 1, fieldsDirty = false, shoreDirty = true, dirtyAll = false;
  const dirtyBoxes = [];

  /** Smooth, resampled centreline (flow direction field of a river): { pl, s, half } with half = half width per point. */
  function smoothCenterline(cl) {
    const pts = cl.map((p) => [p[0], p[1]]), widths = cl.map((p) => p[2] || 120);
    const ch = M.chainage(pts), total = ch[ch.length - 1], step = 25, n = Math.max(2, Math.round(total / step));
    let pl = [], half = [];
    for (let i = 0; i <= n; i++) {
      const hit = M.pointAlong(pts, (total * i) / n);
      pl.push([hit.x, hit.z]); half.push(M.valueAlong(widths, hit) / 2);
    }
    for (let pass = 0; pass < 3; pass++) {                 // box filter over about 250 m, three passes: the kinks go, the course stays
      const out = pl.map((p) => p.slice()), R = 5;
      for (let i = 1; i < pl.length - 1; i++) {
        const r = Math.min(R, i, pl.length - 1 - i); let sx = 0, sz = 0;
        for (let k = -r; k <= r; k++) { sx += pl[i + k][0]; sz += pl[i + k][1]; }
        out[i] = [sx / (2 * r + 1), sz / (2 * r + 1)];
      }
      pl = out;
    }
    let monotonic = true; for (let i = 1; i < pl.length; i++) if (pl[i][1] <= pl[i - 1][1]) { monotonic = false; break; }
    return { pl, half, monotonic };                       // monotonic in z (a river running north to south): fast nearest-point queries
  }
  function nearestOnCL(c, x, z) {
    const pl = c.pl, n = pl.length - 1; let best = Infinity, bi = 0, bt = 0;
    const test = (i) => { const a = pl[i], b = pl[i + 1], r = M.distToSegment(x, z, a[0], a[1], b[0], b[1]); if (r[0] < best) { best = r[0]; bi = i; bt = r[1]; } };
    if (c.monotonic) {                                    // start at the segment abreast of z and walk outward while a closer one is possible
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (pl[m + 1][1] < z) lo = m + 1; else hi = m; }
      test(lo);
      for (let i = lo - 1; i >= 0 && z - pl[i + 1][1] < best; i--) test(i);
      for (let i = lo + 1; i < n && pl[i][1] - z < best; i++) test(i);
    } else for (let i = 0; i < n; i++) test(i);
    const a = pl[bi], b = pl[bi + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { dist: best, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], half: M.lerp(c.half[bi], c.half[bi + 1], bt) };
  }

  /** Distance inside a surface (positive inside, negative outside), metres. */
  function insideDist(s, x, z) {
    if (s.ring) {
      let d = M.distToRing(x, z, s.ring), inside = M.pointInPolygon(x, z, s.ring);
      if (inside) for (const h of s.holes) if (M.pointInPolygon(x, z, h)) { inside = false; d = M.distToRing(x, z, h); break; }
      return inside ? d : -d;
    }
    const hit = M.nearestOnPolyline(x, z, s.line);
    return M.valueAlong(s.halfWidths, hit) - hit.dist;
  }
  /** Look of one surface at a point: [vx, vz, calm, r, g, b]. */
  function ownField(s, x, z, out) {
    const k = s.params; let vx = 0, vz = 0;
    if (s.flowFn) { const f = s.flowFn(x, z); vx = f[0]; vz = f[1]; }
    else if (s.centerline) {
      const h = nearestOnCL(s.centerline, x, z), e = Math.min(1, h.dist / Math.max(h.half, 1));
      const v = k.flow * (1 - 0.45 * e * e);                // slower along the banks
      vx = h.dir[0] * v; vz = h.dir[1] * v;
    } else if (s.line) {
      const h = M.nearestOnPolyline(x, z, s.line); vx = h.dir[0] * k.flow; vz = h.dir[1] * k.flow;
    } else if (s.spec.flow) { vx = s.spec.flow[0]; vz = s.spec.flow[1]; }
    else { vx = wind.dir[0] * k.drift; vz = wind.dir[1] * k.drift; }
    out[0] = vx; out[1] = vz; out[2] = k.calm; out[3] = s.body.r; out[4] = s.body.g; out[5] = s.body.b;
    return out;
  }
  const _f = new Float64Array(6), _acc = new Float64Array(6);
  /** Blended look at a point: every water body within settings.blend contributes (seamless mouths). */
  function fieldAt(x, z, self, out) {
    const B = settings.blend; let wsum = 0;
    _acc.fill(0);
    for (const s of surfaces) {
      if (s === self || !M.inBBox(s.bb, x, z, B) || Math.abs(s.levelRef - self.levelRef) > 0.5) continue;        // different water levels never blend
      const w = M.smoothstep(-B, B, insideDist(s, x, z));
      if (w <= 0) continue;
      ownField(s, x, z, _f);
      for (let i = 0; i < 6; i++) _acc[i] += _f[i] * w;
      wsum += w;
    }
    ownField(self, x, z, out);
    if (wsum <= 0) return out;                              // nobody else near: the surface's own look
    const ws = Math.max(M.smoothstep(-B, B, insideDist(self, x, z)), 1e-3);
    for (let i = 0; i < 6; i++) out[i] = (out[i] * ws + _acc[i]) / (ws + wsum);
    return out;
  }
  function fillFields(s) {
    const g = s.mesh.geometry, pos = g.attributes.position, n = pos.count;
    const flow = g.attributes.aBWFlow, body = g.attributes.aBWBody, o = new Float64Array(6);
    for (let i = 0; i < n; i++) {
      fieldAt(pos.getX(i), pos.getZ(i), s, o);
      flow.setXYZ(i, o[0], o[1], o[2]); body.setXYZ(i, o[3], o[4], o[5]);
    }
    flow.needsUpdate = true; body.needsUpdate = true;
  }

  // ---- mesh builders --------------------------------------------------------------------------------------
  function finishGeometry(positions, indices) {
    const g = new THREE.BufferGeometry(), n = positions.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const nor = new Float32Array(n * 3); for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aBWFlow', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aBWBody', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  /** Cells of the global grid that touch the polygon (dilated by `margin`): the surface tucks under the bank. */
  function gridCover(ring, holes, cell, margin, yOf) {
    const bb = M.bbox(ring);
    const pad = 1 + settings.overshoot;
    const i0 = Math.floor((bb[0] - margin) / cell) - pad, j0 = Math.floor((bb[1] - margin) / cell) - pad;
    const nx = Math.ceil((bb[2] + margin) / cell) + pad - i0, nz = Math.ceil((bb[3] + margin) / cell) + pad - j0;
    const keep = new Uint8Array(nx * nz), rings = [ring, ...holes];
    const xs = [];
    for (let j = 0; j < nz; j++) {                         // interior: scanline through the cell centres (even-odd, holes included)
      const zc = (j0 + j + 0.5) * cell; xs.length = 0;
      for (const r of rings) for (let a = 0, n = r.length, b = n - 1; a < n; b = a++) {
        const za = r[a][1], zb = r[b][1];
        if ((za > zc) !== (zb > zc)) xs.push(r[a][0] + ((zc - za) / (zb - za)) * (r[b][0] - r[a][0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ia = Math.max(0, Math.ceil(xs[k] / cell - 0.5) - i0), ib = Math.min(nx - 1, Math.floor(xs[k + 1] / cell - 0.5) - i0);
        for (let i = ia; i <= ib; i++) keep[j * nx + i] = 1;
      }
    }
    const mark = (x, z) => { const i = Math.floor(x / cell) - i0, j = Math.floor(z / cell) - j0; if (i >= 0 && j >= 0 && i < nx && j < nz) keep[j * nx + i] = 1; };
    for (let a = 0, n = ring.length, b = n - 1; a < n; b = a++) {     // boundary of the outer ring, dilated
      const ax = ring[b][0], az = ring[b][1], bx = ring[a][0], bz = ring[a][1], len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len));
      for (let k = 0; k <= steps; k++) {
        const x = ax + ((bx - ax) * k) / steps, z = az + ((bz - az) * k) / steps;
        mark(x, z); mark(x - margin, z - margin); mark(x + margin, z - margin); mark(x - margin, z + margin); mark(x + margin, z + margin);
      }
    }
    for (let ring_ = 0; ring_ < settings.overshoot; ring_++) {          // tuck further under the banks: `overshoot` more rings of cells
      const src = keep.slice();
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        if (src[j * nx + i]) continue;
        if ((i > 0 && src[j * nx + i - 1]) || (i < nx - 1 && src[j * nx + i + 1]) || (j > 0 && src[(j - 1) * nx + i]) || (j < nz - 1 && src[(j + 1) * nx + i])) keep[j * nx + i] = 1;
      }
    }
    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1), positions = [], indices = [];
    const v = (i, j) => {
      const key = j * (nx + 1) + i; let id = vid[key];
      if (id < 0) { const x = (i0 + i) * cell, z = (j0 + j) * cell; id = vid[key] = positions.length / 3; positions.push(x, yOf(x, z), z); }
      return id;
    };
    let cells = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!keep[j * nx + i]) continue;
      cells++;
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      if ((i + j + i0 + j0) & 1) indices.push(a, d, b, b, d, c); else indices.push(a, d, c, a, c, b);
    }
    return { geometry: finishGeometry(positions, indices), cells };
  }
  /** The polygon itself, triangulated (pools, basins: nothing spills over the rim). */
  function exactCover(ring, holes, yOf) {
    const contour = ring.map((p) => new THREE.Vector2(p[0], p[1])), hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    for (const h of hs) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
    const all = contour.concat(...hs), tris = THREE.ShapeUtils.triangulateShape(contour, hs), positions = [], indices = [];
    for (const p of all) positions.push(p.x, yOf(p.x, p.y), p.y);
    for (const t of tris) {                                // face up (+y)
      const a = all[t[0]], b = all[t[1]], c = all[t[2]];
      const up = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y) > 0;
      if (up) indices.push(t[0], t[1], t[2]); else indices.push(t[0], t[2], t[1]);
    }
    return { geometry: finishGeometry(positions, indices), cells: tris.length };
  }
  /** A strip along a polyline: three vertices across, widths and levels interpolated per original vertex. */
  function ribbonCover(line, widths, lv) {
    const ch = M.chainage(line), total = ch[ch.length - 1];
    const pts = [];                                       // { x, z, w, y, s }
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], len = ch[i + 1] - ch[i];
      const step = M.clamp(Math.max(widths[i], widths[i + 1]) * 1.5, 4, 30), n = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < n; k++) { const t = k / n; pts.push({ x: M.lerp(a[0], b[0], t), z: M.lerp(a[1], b[1], t), w: M.lerp(widths[i], widths[i + 1], t), i, t }); }
    }
    const last = line.length - 1; pts.push({ x: line[last][0], z: line[last][1], w: widths[last], i: last - 1, t: 1 });
    const yAt = (p, x, z) => (typeof lv === 'function' ? lv(x, z) : Array.isArray(lv) ? M.lerp(lv[p.i], lv[Math.min(p.i + 1, lv.length - 1)], p.t) : lv);
    const positions = [], indices = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const rx = -dz, rz = dx, y = yAt(p, p.x, p.z);        // right of travel; ONE level per cross-section
      positions.push(p.x - rx * p.w / 2, y, p.z - rz * p.w / 2, p.x, y, p.z, p.x + rx * p.w / 2, y, p.z + rz * p.w / 2);
      if (i > 0) { const o = (i - 1) * 3; indices.push(o, o + 1, o + 3, o + 1, o + 4, o + 3, o + 1, o + 2, o + 4, o + 2, o + 5, o + 4); }
    }
    return { geometry: finishGeometry(positions, indices), cells: (pts.length - 1) * 2, length: total };
  }

  /** Bounding spheres of a surface in 256 m blocks: is any water inside the view frustum? */
  function blocksOf(g) {
    const P = g.attributes.position.array, map = new Map(), B = 256;
    for (let i = 0; i < P.length; i += 3) {
      const k = Math.floor(P[i] / B) + ',' + Math.floor(P[i + 2] / B); let b = map.get(k);
      if (!b) map.set(k, (b = new THREE.Box3()));
      b.expandByPoint(_v3.set(P[i], P[i + 1], P[i + 2]));
    }
    return [...map.values()].map((b) => b.getBoundingSphere(new THREE.Sphere()));
  }
  const _v3 = new THREE.Vector3(), _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4();
  function waterInView(camera) {
    _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const s of surfaces) for (const b of s.blocks) if (_frustum.intersectsSphere(b)) return true;
    return false;
  }

  const water = {
    impl: 'real',
    /** The single water plane of the model (datum y = -3.0). */
    level,
    surfaces, wakes, obstacles,
    settings, material, uniforms: U,
    /** The generated ripple texture (LEAN): rg = slope (RMS 1), b = |slope|^2, a = height (RMS 1); tiles, mip-mapped. */
    rippleTexture: rippleRT.texture,
    /** Planar reflection state for other shaders: uv = (matrix * vec4(worldPos, 1)).xy / w. `objects` = scene objects are in it (false: sky only). */
    reflection: { enabled: false, texture: null, matrix: U.uBWReflMatrix.value, depthTexture: null, inverse: U.uBWReflInv.value, camera: null, objects: false, width: 0, height: 0, renders: 0, skipped: 0 },
    /**
     * Add a water surface.
     * spec: { id?: string, kind: 'river' | 'moat' | 'canal' | 'pool',
     *         polygon?: closed [x, z] ring, holes?: ring[] (islands),
     *         ribbon?: { polyline: [[x, z], ...], width: m | widths: m[] per vertex },
     *         level?: y (default water.level) | y[] per ribbon vertex | (x, z) => y,
     *         flow?: [dx, dz] metres per second (drift of the ripple pattern; default: by kind),
     *         centerline?: [[x, z, width?], ...] (rivers: the pattern drifts along it at `flowSpeed`, north -> south as listed),
     *         flowSpeed?: m/s (default by kind: river 0.75, canal 0.25, moat 0), calm?: 0..1.5 ripple amplitude (river 1, moat 0.36),
     *         color?: palette id | hex | [r, g, b] linear (default by kind: riverNormal, moat, canal),
     *         exact?: boolean (triangulate the polygon itself; default for 'pool' and for small polygons),
     *         margin?: m (gridded surfaces reach at least this far beyond the polygon; default 2),
     *         shore?: false (left out of the shore map: no foam line, fringe or lee), foam?: false (no foam line along its own banks),
     *         ribbon.margin?: m (the ribbon MESH is this much wider on both sides and tucks under the banks) }
     * Give either polygon or ribbon. Returns { id, kind, mesh, remove() }.
     */
    addSurface(spec) {
      const kind = spec.kind || 'river', kp = settings.kinds[kind] || settings.kinds.river;
      const lv = spec.level === undefined || spec.level === null ? level : spec.level;
      const yOf = typeof lv === 'function' ? lv : () => (Array.isArray(lv) ? lv[0] : lv);
      const s = {
        id: spec.id || 'surface' + nextId++, kind, spec, mesh: null, ring: null, holes: [], line: null, halfWidths: null, centerline: null, flowFn: null,
        params: { calm: spec.calm ?? kp.calm, flow: spec.flowSpeed ?? kp.flow, drift: kp.drift },
        body: spec.color === undefined ? col(kp.color) : Array.isArray(spec.color) ? new THREE.Color(spec.color[0], spec.color[1], spec.color[2]) : typeof spec.color === 'string' && materials.has(spec.color) ? col(spec.color) : new THREE.Color(spec.color),
        levelRef: typeof lv === 'number' ? lv : Array.isArray(lv) ? lv[0] : level, shore: spec.shore !== false, foam: spec.foam !== false,
        remove() { root.remove(s.mesh); s.mesh.geometry.dispose(); const i = surfaces.indexOf(s); if (i >= 0) surfaces.splice(i, 1); touch(s); },
      };
      let built;
      if (spec.polygon) {
        s.ring = M.openRing(spec.polygon); s.holes = (spec.holes || []).map((h) => M.openRing(h));
        s.bb = M.bbox(s.ring);
        if (spec.centerline) s.centerline = smoothCenterline(spec.centerline);
        const small = Math.min(s.bb[2] - s.bb[0], s.bb[3] - s.bb[1]) < settings.cell * 3;
        const exact = spec.exact ?? (kind === 'pool' || small);
        built = exact ? exactCover(s.ring, s.holes, yOf) : gridCover(s.ring, s.holes, spec.cell || settings.cell, spec.margin ?? settings.margin, yOf);
        s.exact = exact;
      } else if (spec.ribbon) {
        const line = spec.ribbon.polyline.map((p) => [p[0], p[1]]);
        const widths = spec.ribbon.widths ? spec.ribbon.widths.slice() : line.map(() => spec.ribbon.width ?? 4);
        s.line = line; s.halfWidths = widths.map((w) => w / 2);
        const maxW = Math.max(...widths), bb = M.bbox(line); s.bb = [bb[0] - maxW, bb[1] - maxW, bb[2] + maxW, bb[3] + maxW];
        const mg = spec.ribbon.margin || 0;                // the MESH is this much wider on both sides (it tucks under the banks); the water body keeps its width
        built = ribbonCover(line, mg ? widths.map((w) => w + 2 * mg) : widths, lv);
        s.exact = true;
      } else throw new Error('water.addSurface: polygon or ribbon required');
      if (typeof spec.flow === 'function') s.flowFn = spec.flow;
      s.blocks = blocksOf(built.geometry);
      const mesh = new THREE.Mesh(built.geometry, material);
      mesh.name = 'water:' + s.id; mesh.layers.set(LAYERS.WATER);
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 5;   // after the opaque world: hidden water costs nothing
      root.add(mesh);
      s.mesh = mesh; s.cells = built.cells;
      surfaces.push(s);
      touch(s);                                             // fields and shore map are (re)built lazily in update()
      return s;
    },
    /**
     * Register a wake source. It must be a pure function of film time.
     * spec: { id?: string, kind: 'boat' | 'quffa' | 'oar' | 'pier' | 'swimmer',
     *         at: (t) => ({ x, z, headingDeg (model azimuth of travel), speed (m/s over the ground) }) | null (null = inactive at t),
     *         width: m (hull beam), length: m (how far the wake trails), strength?: 0..1,
     *         hull?: m (hull length, default 3 x width; `at` is the hull CENTRE), period?: s and phase?: s (stroke rhythm of
     *         'oar', 'quffa', 'swimmer': one ring per stroke), side?: m (strokes alternate +side / -side of the track) }
     * Returns { id, remove() }.
     */
    addWake(spec) {
      const w = { id: spec.id || 'wake' + nextId++, strength: 1, ...spec, remove() { const i = wakes.indexOf(w); if (i >= 0) wakes.splice(i, 1); } };
      if (typeof w.at !== 'function') throw new Error('water.addWake: at(t) required');
      w.seed = hash2(wakes.length + 1, nextId, 911);
      wakes.push(w);
      return w;
    },
    /** Water surface elevation including waves at film time t (boats bob on this). Pure. Centimetres on the river, millimetres on moats. */
    heightAt(x, z, t) {
      const s = surfaceAt(x, z);
      const base = s ? (typeof s.spec.level === 'function' ? s.spec.level(x, z) : s.levelRef) : level;
      const a = settings.bob * (s ? s.params.calm : 1), wx = wind.dir[0], wz = wind.dir[1], u = x * wx + z * wz, v = -x * wz + z * wx;
      return base + a * (Math.sin(u * 0.62 - t * 1.9 + v * 0.11) + 0.6 * Math.sin(u * 1.37 - t * 2.9 - v * 0.23 + 1.3) + 0.4 * Math.sin(v * 0.9 + u * 0.31 - t * 2.3 + 4.1));
    },
    update, stats,
  };

  /** Something changed near surface or obstacle `s`: neighbouring surfaces re-blend, the shore map is re-baked (both lazily). */
  function touch(s) {
    fieldsDirty = true;
    if (s && s.bb) dirtyBoxes.push(s.bb); else dirtyAll = true;
    if (!shoreBounds || !s || !s.bb || (s.bb[2] > shoreBounds[0] && s.bb[0] < shoreBounds[2] && s.bb[3] > shoreBounds[1] && s.bb[1] < shoreBounds[3])) shoreDirty = true;
  }
  function surfaceAt(x, z) {
    let best = null;
    for (const s of surfaces) {
      if (!M.inBBox(s.bb, x, z)) continue;
      if (insideDist(s, x, z) >= 0 && (!best || s.kind === 'river')) best = s;
    }
    return best;
  }
  /** Which water body is at (x, z): the surface record or null. */
  water.surfaceAt = surfaceAt;
  /** How often the lazy per-vertex fields and the shore map were rebuilt (they follow addSurface / addObstacle / remove). */
  water.rebuilds = { fields: 0, shore: 0 };
  /**
   * Velocity of the water at a plan point: { vx, vz, speed, headingDeg (model azimuth it flows toward) }, all 0 on land
   * and in still water. Pure; boats drift with it, wakes are carried by it.
   */
  water.flowAt = (x, z) => {
    const s = surfaceAt(x, z);
    if (!s || (!s.centerline && !s.line && !s.flowFn)) return { vx: 0, vz: 0, speed: 0, headingDeg: 0 };
    const f = ownField(s, x, z, new Float64Array(6)), sp = Math.hypot(f[0], f[1]);
    return { vx: f[0], vz: f[1], speed: sp, headingDeg: sp > 1e-6 ? M.dirToAz(f[0], f[1]) : 0 };
  };
  /**
   * Something solid standing in the water (bridge pier, bastion, mooring post, island): the shore map draws a
   * foam line and a calm lee around its outline. ring: [x, z] pairs. opts: { id }. Adding the same id again replaces it.
   */
  water.addObstacle = (ring, opts = {}) => {
    const o = { id: opts.id || 'obstacle' + nextId++, ring: M.openRing(ring), remove() { const i = obstacles.indexOf(o); if (i >= 0) obstacles.splice(i, 1); touch(o); } };
    o.bb = M.bbox(o.ring);
    const i = obstacles.findIndex((q) => q.id === o.id); if (i >= 0) obstacles.splice(i, 1);
    obstacles.push(o); touch(o);
    return o;
  };
  /**
   * Convenience for the rivercraft author: wakes for a boat record of the agreed shape
   * { id, kind: 'barge' | 'quffa' | 'kelek' | 'canoe', moored, length, poseAt(t) -> { x, y, z, headingDeg } }.
   * opts: { beam, strength, length (of the trail), period, phase, side } override the defaults by kind.
   * Speed and direction of travel are measured from poseAt (pure). Returns { id, remove() }.
   */
  water.addBoat = (boat, opts = {}) => {
    const L = boat.length || 6, kind = boat.kind || 'barge';
    const beam = opts.beam ?? (kind === 'quffa' ? L : kind === 'kelek' ? L * 0.65 : kind === 'canoe' ? Math.max(0.7, L / 6) : L / 3.4);
    const at = (t) => {
      const p = boat.poseAt(t); if (!p) return null;
      const q = boat.poseAt(t - 0.2) || p;
      const vx = (p.x - q.x) / 0.2, vz = (p.z - q.z) / 0.2, sp = Math.hypot(vx, vz);
      return { x: p.x, z: p.z, headingDeg: sp > 0.03 ? M.dirToAz(vx, vz) : p.headingDeg, speed: sp, facingDeg: p.headingDeg };
    };
    const paddled = kind === 'quffa' || kind === 'canoe';
    return water.addWake({
      id: 'boat:' + boat.id, kind: kind === 'quffa' ? 'quffa' : 'boat', at, width: beam, hull: L,
      length: opts.length ?? (kind === 'quffa' ? 5 * L : 9 * L), strength: opts.strength ?? (kind === 'quffa' ? 0.6 : kind === 'kelek' ? 0.7 : 1),
      period: opts.period ?? (paddled && !boat.moored ? 1.9 : 0), phase: opts.phase ?? hash2(wakes.length, 7, 31) * 2, side: opts.side ?? beam * 0.55,
    });
  };

  // =========================================================================================================
  // Shore map (baked lazily): r = signed distance to the nearest bank or obstacle, g = distance 0..48 m
  // =========================================================================================================
  let shoreBounds = null, shoreTex = null;
  {
    const rings = (world.moats || []).filter((m) => /inner|Palace/i.test(m.id)).map((m) => m.polygon);
    if (rings.length) {
      let bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of rings) { const b = M.bbox(r); bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }
      const p = settings.shore.pad; shoreBounds = [bb[0] - p, bb[1] - p, bb[2] + p, bb[3] + p];
    }
  }
  function bakeShore() {
    shoreDirty = false;
    if (!shoreBounds) return;
    const tx = settings.shore.texel, [x0, z0, x1, z1] = shoreBounds;
    const w = Math.ceil((x1 - x0) / tx), h = Math.ceil((z1 - z0) / tx), RANGE = 48;
    const inB = (s) => s.bb[2] > x0 && s.bb[0] < x1 && s.bb[3] > z0 && s.bb[1] < z1;
    const list = surfaces.filter((s) => inB(s) && Math.abs(s.levelRef - level) < 0.5 && s.shore);
    // 1. which texels are water: rasterise the union with the 2D canvas
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.fillStyle = '#000'; c2.fillRect(0, 0, w, h);
    const path = (ring) => { for (let i = 0; i < ring.length; i++) { const X = (ring[i][0] - x0) / tx, Z = (ring[i][1] - z0) / tx; if (i) c2.lineTo(X, Z); else c2.moveTo(X, Z); } c2.closePath(); };
    c2.fillStyle = '#fff'; c2.strokeStyle = '#fff'; c2.lineJoin = 'round'; c2.lineCap = 'butt';
    for (const s of list) {
      if (!s.foam) continue;                                // no foam line of its own: left out of the mask (it still opens the bank of its neighbours)
      if (s.ring) { c2.beginPath(); path(s.ring); for (const hole of s.holes) path(hole); c2.fill('evenodd'); }
      else for (let i = 0; i < s.line.length - 1; i++) {
        const a = s.line[i], b = s.line[i + 1];
        c2.lineWidth = Math.max(1, (s.halfWidths[i] + s.halfWidths[i + 1]) / tx);
        c2.beginPath(); c2.moveTo((a[0] - x0) / tx, (a[1] - z0) / tx); c2.lineTo((b[0] - x0) / tx, (b[1] - z0) / tx); c2.stroke();
      }
    }
    c2.fillStyle = '#000';
    for (const o of obstacles) { c2.beginPath(); path(o.ring); c2.fill(); }
    const mask = c2.getImageData(0, 0, w, h).data;
    // 2. shore pieces: polygon and ribbon edges that do not open into another water body, plus obstacle outlines
    const pieces = [];
    const otherWater = (self, x, z) => { for (const s of list) if (s !== self && M.inBBox(s.bb, x, z) && insideDist(s, x, z) > 0) return true; return false; };
    const addEdge = (self, ax, az, bx, bz, ox, oz) => {    // (ox, oz): unit vector pointing out of the water
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 15));
      for (let k = 0; k < n; k++) {
        const pax = ax + ((bx - ax) * k) / n, paz = az + ((bz - az) * k) / n, pbx = ax + ((bx - ax) * (k + 1)) / n, pbz = az + ((bz - az) * (k + 1)) / n;
        if (Math.max(pax, pbx) < x0 - RANGE || Math.min(pax, pbx) > x1 + RANGE || Math.max(paz, pbz) < z0 - RANGE || Math.min(paz, pbz) > z1 + RANGE) continue;
        if (self && otherWater(self, (pax + pbx) / 2 + ox * 1.5, (paz + pbz) / 2 + oz * 1.5)) continue;
        pieces.push(pax, paz, pbx, pbz);
      }
    };
    const ringEdges = (self, ring, outwardSign) => {
      const cw = M.polygonArea(ring) > 0;
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const r = M.rightOf((b[0] - a[0]) / l, (b[1] - a[1]) / l), sgn = (cw ? -1 : 1) * outwardSign;
        addEdge(self, a[0], a[1], b[0], b[1], r[0] * sgn, r[1] * sgn);
      }
    };
    for (const s of list) {
      if (!s.foam) continue;                                // counts as water (mask, mouths) but gets no foam line of its own
      if (s.ring) { ringEdges(s, s.ring, 1); for (const hole of s.holes) ringEdges(null, hole, 1); }
      else {
        const L = s.line, hw = s.halfWidths;
        for (let i = 0; i < L.length - 1; i++) {
          const a = L[i], b = L[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, rx = -(b[1] - a[1]) / l, rz = (b[0] - a[0]) / l;
          addEdge(s, a[0] + rx * hw[i], a[1] + rz * hw[i], b[0] + rx * hw[i + 1], b[1] + rz * hw[i + 1], rx, rz);
          addEdge(s, a[0] - rx * hw[i], a[1] - rz * hw[i], b[0] - rx * hw[i + 1], b[1] - rz * hw[i + 1], -rx, -rz);
        }
      }
    }
    const bankPieces = pieces.length;
    for (const o of obstacles) ringEdges(null, o.ring, 1);
    // 3. exact distance to the nearest piece, within RANGE: d2 = banks and obstacles (foam line), b2 = banks only (depth)
    const d2 = new Float32Array(w * h).fill(RANGE * RANGE), b2 = new Float32Array(w * h).fill(RANGE * RANGE);
    for (let p = 0; p < pieces.length; p += 4) {
      const bank = p < bankPieces;
      const ax = pieces[p], az = pieces[p + 1], bx = pieces[p + 2], bz = pieces[p + 3], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
      const ia = Math.max(0, Math.floor((Math.min(ax, bx) - RANGE - x0) / tx)), ib = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + RANGE - x0) / tx));
      const ja = Math.max(0, Math.floor((Math.min(az, bz) - RANGE - z0) / tx)), jb = Math.min(h - 1, Math.ceil((Math.max(az, bz) + RANGE - z0) / tx));
      for (let j = ja; j <= jb; j++) {
        const z = z0 + (j + 0.5) * tx, row = j * w;
        for (let i = ia; i <= ib; i++) {
          const x = x0 + (i + 0.5) * tx;
          let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = x - ax - dx * t, ez = z - az - dz * t, q = ex * ex + ez * ez;
          if (q < d2[row + i]) d2[row + i] = q;
          if (bank && q < b2[row + i]) b2[row + i] = q;
        }
      }
    }
    const data = new Uint8Array(w * h * 2);
    for (let i = 0, n = w * h; i < n; i++) {
      const d = Math.sqrt(d2[i]), sd = mask[i * 4] > 127 ? d : -d;
      data[i * 2] = Math.round(M.clamp((sd + 4) / 8) * 255);
      data[i * 2 + 1] = mask[i * 4] > 127 ? Math.round(M.clamp(Math.sqrt(b2[i]) / RANGE) * 255) : 0;
    }
    if (shoreTex) shoreTex.dispose();
    shoreTex = new THREE.DataTexture(data, w, h, THREE.RGFormat, THREE.UnsignedByteType);
    shoreTex.name = 'water.shore'; shoreTex.minFilter = THREE.LinearFilter; shoreTex.magFilter = THREE.LinearFilter;
    shoreTex.wrapS = shoreTex.wrapT = THREE.ClampToEdgeWrapping; shoreTex.unpackAlignment = 1; shoreTex.needsUpdate = true;
    U.tBWShore.value = shoreTex;
    U.uBWShoreRect.value.set(x0, z0, 1 / (w * tx), 1 / (h * tx));
    water.shore = { texture: shoreTex, bounds: [x0, z0, x0 + w * tx, z0 + h * tx], texel: tx, pieces: pieces.length / 4, width: w, height: h };
  }

  // =========================================================================================================
  // Planar reflection (pre-pass 'water-reflection')
  // =========================================================================================================
  const mirror = new THREE.PerspectiveCamera();
  mirror.name = 'water.mirror'; mirror.matrixAutoUpdate = true;
  water.reflection.camera = mirror;
  let reflRT = null, reflDone = false;
  const skyOnly = new THREE.Layers(); skyOnly.set(LAYERS.SKY);
  const _pos = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(), _tgt = new THREE.Vector3();
  const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), _cc = new THREE.Color();
  function ensureReflTarget() {
    const k = settings.reflection.scale, w = Math.max(64, Math.round(ctx.post.width * k)), h = Math.max(36, Math.round(ctx.post.height * k));
    if (reflRT && reflRT.width === w && reflRT.height === h) return;
    if (reflRT) { reflRT.depthTexture.dispose(); reflRT.dispose(); }
    const depth = new THREE.DepthTexture(w, h); depth.type = THREE.UnsignedIntType; depth.minFilter = depth.magFilter = THREE.NearestFilter;
    reflRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, depthTexture: depth, samples: settings.reflection.samples,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    reflRT.texture.name = 'water.reflection';
    const r = water.reflection; r.texture = reflRT.texture; r.depthTexture = depth; r.width = w; r.height = h;
    U.tBWRefl.value = reflRT.texture; U.tBWReflDepth.value = depth;
  }
  function renderReflection(frame) {
    const R = settings.reflection, r = water.reflection;
    if (!R.enabled || !surfaces.length) { r.enabled = false; U.uBWRefl.value.x = 0; return; }
    // Once per output frame: on sub-frame 0, or on the first later sub-frame that has water in view. A sub-frame
    // never samples a target left over from another frame (frames may be rendered in any order).
    if (frame.sub === 0) reflDone = false;
    if (reflDone && !R.everySubFrame) return;
    const cam = ctx.camera; cam.updateMatrixWorld();
    const h = cam.position.y - level;
    if (!(h > 0.02)) { r.enabled = false; U.uBWRefl.value.x = 0; return; }
    if (!waterInView(cam)) { r.skipped++; return; }                   // no water in the frustum: nothing samples it
    reflDone = true;
    ensureReflTarget();
    // the camera mirrored in the water plane (a proper camera: mirrored position, direction and up)
    cam.getWorldDirection(_dir); _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    _pos.copy(cam.position); _pos.y = 2 * level - _pos.y;
    _dir.y = -_dir.y; _up.y = -_up.y;
    mirror.position.copy(_pos); mirror.up.copy(_up); mirror.lookAt(_tgt.copy(_pos).add(_dir));
    mirror.fov = Math.min(150, cam.fov * R.fovScale); mirror.aspect = cam.aspect; mirror.near = cam.near; mirror.far = cam.far;
    mirror.updateProjectionMatrix(); mirror.updateMatrixWorld(true);
    // oblique near plane = the water plane (Lengyel): everything below the water is clipped, whatever its material
    _plane.set(new THREE.Vector3(0, 1, 0), -(level - R.clipBias)).applyMatrix4(mirror.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = mirror.projectionMatrix, e = pm.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1; e[14] = _clip.w;
    mirror.projectionMatrixInverse.copy(pm).invert();
    const objects = h < R.maxHeight;
    mirror.layers.mask = objects ? ctx.post.reflectionLayers.mask : skyOnly.mask;
    const prev = renderer.getRenderTarget(); renderer.getClearColor(_cc); const prevA = renderer.getClearAlpha();
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, false);
    renderer.render(scene, mirror);
    renderer.setRenderTarget(prev); renderer.setClearColor(_cc, prevA);
    r.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(pm).multiply(mirror.matrixWorldInverse);
    r.inverse.multiplyMatrices(pm, mirror.matrixWorldInverse).invert();
    r.enabled = true; r.objects = objects; r.renders++;
    const fovY = mirror.fov * M.DEG;
    U.uBWRefl.value.set(1, reflRT.height / (2 * Math.tan(fovY / 2)), objects ? M.smoothstep(R.maxHeight, R.fadeFrom, h) : 0, Math.log2(reflRT.height) - 2);
  }

  // =========================================================================================================
  // Wake maps (pre-pass 'water-wakes'): two camera-centred top-down maps, the far one four times the size
  // =========================================================================================================
  const wakeScene = new THREE.Scene(), wakeU = { uRect: { value: new THREE.Vector4(0, 0, 100, 0.1) }, uTime: { value: 0 } };
  const WAKE_BLEND = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, transparent: true };
  const stripMat = new THREE.ShaderMaterial({ name: 'water.wakeStrip', vertexShader: WAKE_VERT, fragmentShader: WAKE_STRIP_FRAG, uniforms: wakeU, ...WAKE_BLEND });
  const ringMat = new THREE.ShaderMaterial({ name: 'water.wakeRing', vertexShader: WAKE_VERT, fragmentShader: WAKE_RING_FRAG, uniforms: wakeU, ...WAKE_BLEND });
  materials.register(stripMat, { owner: 'water', skipHooks: true }); materials.register(ringMat, { owner: 'water', skipHooks: true });
  function dynMesh(mat, capacity) {
    const g = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['aA', 4], ['aB', 4], ['aC', 4]]) { const a = new THREE.BufferAttribute(new Float32Array(capacity * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); }
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; wakeScene.add(m);
    return { mesh: m, g, capacity, n: 0, P: g.attributes.position.array, A: g.attributes.aA.array, B: g.attributes.aB.array, C: g.attributes.aC.array };
  }
  const strips = dynMesh(stripMat, 90000), rings = dynMesh(ringMat, 30000);
  const put = (b, x, z, a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3) => {
    if (b.n >= b.capacity) return;
    const i = b.n++; b.P[i * 3] = x; b.P[i * 3 + 1] = 0; b.P[i * 3 + 2] = z;
    b.A[i * 4] = a0; b.A[i * 4 + 1] = a1; b.A[i * 4 + 2] = a2; b.A[i * 4 + 3] = a3;
    b.B[i * 4] = b0; b.B[i * 4 + 1] = b1; b.B[i * 4 + 2] = b2; b.B[i * 4 + 3] = b3;
    b.C[i * 4] = c0; b.C[i * 4 + 1] = c1; b.C[i * 4 + 2] = c2; b.C[i * 4 + 3] = c3;
  };
  const wakeRT = [null, null];
  const wakeState = { near: { cx: 0, cz: 0, half: 100, texel: 0.1 }, far: { cx: 0, cz: 0, half: 400, texel: 0.8 }, drawn: 0, rings: 0, verts: 0 };
  /** The two wake maps of the last frame: { near: { cx, cz, half, texel }, far: {...}, drawn (hull wakes), rings, verts }. */
  water.wakeMap = wakeState;
  const KSEG = 20, KIND_CODE = { boat: 0, quffa: 1, pier: 2, swimmer: 3 };
  function buildWakes(t, cx, cz, half, texel) {
    strips.n = 0; rings.n = 0; wakeState.drawn = 0; wakeState.rings = 0;
    const tr = new Array(KSEG + 1);
    for (const w of wakes) {
      const p0 = w.at(t); if (!p0) continue;
      const reach = (w.length || 30) + half;
      if (Math.abs(p0.x - cx) > reach || Math.abs(p0.z - cz) > reach) continue;
      const fl = water.flowAt(p0.x, p0.z);
      const hd = M.azToDir(p0.headingDeg || 0), gs = p0.speed || 0;
      const rvx = hd[0] * gs - fl.vx, rvz = hd[1] * gs - fl.vz, Urel = Math.hypot(rvx, rvz);    // velocity through the water
      const beam = w.width || 2, hull = w.hull ?? (w.kind === 'pier' ? beam * 2.3 : w.kind === 'quffa' ? beam : beam * 3), strength = w.strength ?? 1;
      const kindGain = w.kind === 'quffa' ? 0.7 : w.kind === 'swimmer' ? 0.5 : w.kind === 'oar' ? 0 : 1, code = KIND_CODE[w.kind] ?? 0;
      // ---- hull wake: a strip along the track of the BOW through the water over the last T seconds ----
      if (kindGain > 0 && Urel > 0.04) {
        const dirx = rvx / Urel, dirz = rvz / Urel;             // heading through the water
        const L = Math.min(w.length || 30, 400), T = L / Math.max(Urel, 0.12);
        let n = 0, dist = 0;
        for (let k = 0; k <= KSEG; k++) {
          const age = T * Math.pow(k / KSEG, 1.3);
          const p = k === 0 ? p0 : w.at(t - age); if (!p) break;
          // where the bow was `age` seconds ago, carried downstream since then
          const x = p.x + fl.vx * age + dirx * hull * 0.5, z = p.z + fl.vz * age + dirz * hull * 0.5;
          if (n > 0) dist += Math.hypot(x - tr[n - 1].x, z - tr[n - 1].z);
          tr[n++] = { x, z, d: dist };
        }
        if (n >= 2 && tr[n - 1].d > 0.5) {
          const total = tr[n - 1].d;
          for (let k = 0; k < n; k++) {
            const a = tr[Math.max(0, k - 1)], b = tr[Math.min(n - 1, k + 1)];
            let tx = a.x - b.x, tz = a.z - b.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;   // tangent pointing forward (toward the bow)
            const q = tr[k];
            q.tx = tx; q.tz = tz; q.lx = -tz; q.lz = tx;
            q.hw = Math.max(beam * 0.5, 0.354 * q.d) + 0.6 * beam + 0.1 * q.d + 5 * texel;
            q.st = strength * kindGain * (1 - M.smoothstep(0.55, 1, q.d / total));
          }
          for (let k = 0; k < n - 1; k++) {
            const a = tr[k], b = tr[k + 1];
            const v = (q, sgn) => put(strips, q.x + q.lx * q.hw * sgn, q.z + q.lz * q.hw * sgn, q.hw * sgn, q.d, beam, Urel, q.st, hull, w.seed, code, q.lx, q.lz, q.tx, q.tz);
            v(a, -1); v(a, 1); v(b, 1); v(a, -1); v(b, 1); v(b, -1);
          }
          wakeState.drawn++;
        }
      }
      // ---- rings: one per stroke (oars, paddles, swimmers), expanding and drifting with the water ----
      const period = w.period ?? (w.kind === 'oar' ? 2.4 : w.kind === 'swimmer' ? 1.3 : 0);
      if (period > 0) {
        const ph = w.phase || 0, n0 = Math.floor((t - ph) / period), LIFE = 6, c = 0.4, lam = 0.38;
        for (let m = 0; m < Math.ceil(LIFE / period) + 1; m++) {
          const ts = (n0 - m) * period + ph, age = t - ts;
          if (age < 0 || age > LIFE) continue;
          const p = w.at(ts); if (!p) continue;
          const hd2 = M.azToDir((p.facingDeg ?? p.headingDeg) || 0), sd = (w.side || 0) * (((n0 - m) & 1) ? -1 : 1);
          const x = p.x - hd2[1] * sd + fl.vx * age, z = p.z + hd2[0] * sd + fl.vz * age;
          const r = 0.1 + c * age, amp = 0.32 * strength * Math.exp(-age / 2.4) * M.smoothstep(0, 0.2, age), bw = 0.2 + 0.09 * age;
          const R = r + 2.5 * Math.max(bw, texel * 1.5) + texel, splash = 0.75 * strength * Math.exp(-age / 0.5);
          const v = (lx, lz) => put(rings, x + lx, z + lz, lx, lz, r, lam, amp, bw, w.seed, splash, 0, 0, 0, 0);
          v(-R, -R); v(R, -R); v(R, R); v(-R, -R); v(R, R); v(-R, R);
          wakeState.rings++;
        }
      }
    }
    for (const b of [strips, rings]) {
      b.g.setDrawRange(0, b.n);
      for (const k of ['position', 'aA', 'aB', 'aC']) { const a = b.g.attributes[k]; a.clearUpdateRanges(); a.addUpdateRange(0, b.n * a.itemSize); a.needsUpdate = true; }
      b.mesh.visible = b.n > 0;
    }
    wakeState.verts = strips.n + rings.n;
  }
  function renderWakes(frame) {
    const S = settings.wakes;
    if (!S.enabled || !wakes.length) { U.uBWWakeRect.value.w = 0; return; }
    if (frame.sub > 0 && U.uBWWakeRect.value.w > 0.5) return;        // once per output frame
    for (let i = 0; i < 2; i++) {
      const size = i === 0 ? S.size : S.size / 2;
      if (wakeRT[i] && wakeRT[i].width === size) continue;
      if (wakeRT[i]) wakeRT[i].dispose();
      wakeRT[i] = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      wakeRT[i].texture.name = 'water.wakes' + i; wakeRT[i].texture.anisotropy = 8;
    }
    U.tBWWake.value = wakeRT[0].texture; U.tBWWake2.value = wakeRT[1].texture;
    const cam = frame.camera, h = Math.max(0.2, cam.pos[1] - level);
    let fx = cam.look[0] - cam.pos[0], fz = cam.look[2] - cam.pos[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    // each window looks ahead of the camera and is snapped to a multiple of its texels (no swimming while the camera drifts)
    const win = (half, size, lead) => {
      const texel = (2 * half) / size, q = texel * 16, ahead = Math.min(half * lead, fl * 0.7);
      return { cx: Math.round((cam.pos[0] + fx * ahead) / q) * q, cz: Math.round((cam.pos[2] + fz * ahead) / q) * q, half, texel };
    };
    const h0 = M.clamp(1.7 * h + 80, 80, 2600);
    const A = win(h0, S.size, 0.62), B = win(h0 * 4, S.size / 2, 0.5);
    buildWakes(frame.t, B.cx, B.cz, B.half, A.texel);
    Object.assign(wakeState.near, A); Object.assign(wakeState.far, B);
    wakeU.uTime.value = frame.t;
    const prev = renderer.getRenderTarget(); renderer.getClearColor(_cc); const prevA = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    [A, B].forEach((w, i) => {
      wakeU.uRect.value.set(w.cx, w.cz, w.half, w.texel);
      renderer.setRenderTarget(wakeRT[i]); renderer.clear(true, false, false);
      if (wakeState.verts > 0) renderer.render(wakeScene, quadCam);
    });
    renderer.setRenderTarget(prev); renderer.setClearColor(_cc, prevA);
    U.uBWWakeRect.value.set(A.cx, A.cz, 1 / (2 * A.half), 1);
    U.uBWWakeRect2.value.set(B.cx, B.cz, 1 / (2 * B.half), 1);
  }

  // =========================================================================================================
  // Per-frame
  // =========================================================================================================
  let prePassesInstalled = false, boatsSeen = null;
  const _E = new THREE.Vector3(), _ld = new THREE.Vector3();
  /** Per-frame: uniforms from the light state; lazy re-blend of the surfaces and re-bake of the shore map. Called by the engine. */
  function update(frame) {
    if (!prePassesInstalled && ctx.post && typeof ctx.post.addPrePass === 'function') {
      prePassesInstalled = true;
      ctx.post.addPrePass('water-wakes', (c, f) => renderWakes(f), 40);
      ctx.post.addPrePass('water-reflection', (c, f) => renderReflection(f), 50);
    }
    // boats published by rivercraft get wakes unless their author registered them (ids 'boat:<id>')
    const rc = ctx.modules && ctx.modules.rivercraft;
    if (settings.wakes.autoBoats && rc && Array.isArray(rc.boats) && boatsSeen !== rc.boats) {
      boatsSeen = rc.boats;
      for (const b of rc.boats) if (b && typeof b.poseAt === 'function' && !wakes.some((w) => w.id === 'boat:' + b.id || w.boat === b.id)) water.addBoat(b);
    }
    if (fieldsDirty) {
      const B = settings.blend + 1;
      for (const s of surfaces) if (dirtyAll || dirtyBoxes.some((b) => b[2] + B > s.bb[0] && b[0] - B < s.bb[2] && b[3] + B > s.bb[1] && b[1] - B < s.bb[3])) fillFields(s);
      fieldsDirty = false; dirtyAll = false; dirtyBoxes.length = 0; water.rebuilds.fields++;
    }
    if (shoreDirty) { bakeShore(); water.rebuilds.shore++; }
    const s = frame.light; if (!s) return;
    U.uBWSunDir.value.copy(s.sunDir);
    U.uBWSunE.value.set(s.sunColor.r, s.sunColor.g, s.sunColor.b).multiplyScalar(s.sunIntensity);
    U.uBWMoonDir.value.copy(s.moonDir);
    U.uBWMoonE.value.set(s.moonColor.r, s.moonColor.g, s.moonColor.b).multiplyScalar(s.moonIntensity * s.night);
    // what the standard lighting would give a white horizontal surface from the unshadowed key light
    const key = ctx.lighting && ctx.lighting.sun;
    if (key && key.isDirectionalLight) {
      _ld.copy(key.position).sub(key.target.position).normalize();
      _E.set(key.color.r, key.color.g, key.color.b).multiplyScalar((key.intensity * Math.max(_ld.y, 0)) / Math.PI);
    } else _E.set(s.keyColor.r, s.keyColor.g, s.keyColor.b).multiplyScalar((s.keyIntensity * Math.max(s.keyDir.y, 0)) / Math.PI);
    U.uBWKeyE.value.copy(_E);
    U.uBWSkyUp.value.copy(s.skyZenith).lerp(s.skyMid, 0.5); U.uBWSkyHor.value.copy(s.skyHorizon);
    const R = settings.ripple, G = settings.glitter, F = settings.foam;
    U.uBWScale.value.set(R.scales[0], R.scales[1], R.scales[2], R.scales[3]);
    U.uBWSlope.value.set(R.slopes[0], R.slopes[1], R.slopes[2], R.slopes[3]);
    U.uBWWind.value.set(wind.dir[0], wind.dir[1], R.gain, ((frame.sub || 0) * 0.6180339887) % 1);
    // sparkle cells are sized for the 2160-line film frame; smaller frames keep the same share of the picture
    U.uBWGlit.value.set(G.sparkle, G.minSigma, G.gain, G.cellPx * ((ctx.post && ctx.post.height) || 2160) / 2160);
    U.uBWGlit2.value.set(G.stray, G.strayGain, G.cap, G.strayMaxCell);
    U.uBWFoam.value.set(F.width, F.strength, F.silt, F.shallow);
    U.uBWFoamCol.value.set(F.color[0], F.color[1], F.color[2]);
    U.uBWDebug.value = settings.debug || 0;
    // width of the sun path: the lateral slope spread that gives a dense path `width` degrees wide (about 3 sigma)
    // under this sun. Physics alone gives 3 to 4 degrees under an 11 degree sun; the art direction asks for 15 to 25.
    let spread = G.spread;
    if (!(spread > 0)) {
      const sig = Math.hypot(Math.hypot(R.slopes[0], R.slopes[1], R.slopes[2], R.slopes[3]) * R.gain, G.minSigma);
      const sy = M.clamp(s.sunDir.y, 0.05, 0.95), tanEl = sy / Math.sqrt(1 - sy * sy);
      spread = M.clamp((G.width * M.DEG) / 3 / (2 * sig * tanEl), 1, 8);
    }
    water.sunPath = { spread, widthDeg: (3 * 2 * Math.hypot(Math.hypot(R.slopes[0], R.slopes[1], R.slopes[2], R.slopes[3]) * R.gain, G.minSigma) * spread * (Math.max(s.sunDir.y, 0.05) / Math.sqrt(1 - Math.min(s.sunDir.y, 0.95) ** 2))) / M.DEG };
    const night = s.night || 0;
    U.uBWLook.value.set(settings.bodyGain * (1 - (1 - settings.bodyNight) * night), spread, R.streaks, night);
    U.uBWBody.value.x = M.lerp(settings.lowSun, 1, M.smoothstep(0.08, 0.5, Math.max(s.keyDir ? s.keyDir.y : s.sunDir.y, 0)));
    if (!settings.reflection.enabled) { U.uBWRefl.value.x = 0; water.reflection.enabled = false; }
  }
  /** Counts for the self-test and for docs: surfaces by kind, triangles, wakes, reflection and shore map sizes. */
  function stats() {
    let tris = 0; const kinds = {};
    for (const s of surfaces) { tris += s.mesh.geometry.index.count / 3; kinds[s.kind] = (kinds[s.kind] || 0) + 1; }
    return {
      surfaces: surfaces.length, kinds, triangles: tris, drawCalls: surfaces.length, wakes: wakes.length, obstacles: obstacles.length,
      reflection: { enabled: water.reflection.enabled, objects: water.reflection.objects, width: water.reflection.width, height: water.reflection.height, renders: water.reflection.renders, skipped: water.reflection.skipped },
      shore: water.shore ? { width: water.shore.width, height: water.shore.height, texel: water.shore.texel, pieces: water.shore.pieces } : null,
      wakeMap: JSON.parse(JSON.stringify(wakeState)), rippleTexture: rippleSize,
    };
  }
  return water;
}
