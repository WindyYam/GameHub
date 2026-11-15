// js/modules/nightfx/shaders.js — GLSL of the night and air effects (docs/mod-nightfx.md).
// Everything here is drawn on LAYERS.FX in phase 2 of post (after the opaque scene and its ambient occlusion),
// without depth writes. Animation is a closed form of the shared uniform uBTime (film time of the sub-frame).

/* ------------------------------------------------------------------------------------------------------------------
 * 1. LAMP POINTS: one GL point per house lamp / hearth. Near: a small teardrop flame with a faint halo.
 *    Far: a round blob that never falls below uMinPx device pixels (docs/post.md: 2.5 px and radiance 12+ to glow).
 * ---------------------------------------------------------------------------------------------------------------- */
export const LAMP_VERT = /* glsl */ `
#include <bbl_world_pars_vertex>
attribute vec4 aA;      // threshold of the night factor, phase 0..1, gain, sprite size (m)
attribute vec2 aB;      // kind (0 lamp, 1 hearth), colour temperature 0..1
uniform float uNight, uBTime, uPx, uMinPx;
varying float vOn; varying float vNear; varying vec2 vB; varying float vPh;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vBWorldPos = wp.xyz; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	vec4 mv = viewMatrix * wp;
	float on = smoothstep( aA.x, aA.x + 0.12, uNight );
	float ph = aA.y * 6.2831853;
	float fl = 1.0 + 0.14 * sin( uBTime * 11.3 + ph * 7.0 ) + 0.09 * sin( uBTime * 23.9 + ph * 13.0 ) + 0.07 * sin( uBTime * 4.7 + ph * 3.0 );
	float px = aA.w * uPx / max( - mv.z, 0.1 );
	float minPx = uMinPx * ( 0.8 + 0.3 * aA.z );
	vNear = clamp( px / minPx, 0.0, 6.0 );
	vOn = on * fl * aA.z;
	vB = aB; vPh = ph;
	gl_PointSize = max( px, minPx );
	gl_Position = on > 0.0 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

export const LAMP_FRAG = /* glsl */ `
#include <common>
#include <bbl_world_pars_fragment>
#include <bbl_aerial_pars_fragment>
uniform vec3 uLamp, uPale, uEmber;
uniform float uBTime, uFarRad, uNearRad, uHalo;
varying float vOn; varying float vNear; varying vec2 vB; varying float vPh;
void main() {
	vec2 q = gl_PointCoord * 2.0 - 1.0; q.y = - q.y;
	float r2 = dot( q, q );
	if ( r2 > 1.0 ) discard;
	float edge = 1.0 - smoothstep( 0.6, 1.0, r2 );
	vec3 base = mix( mix( uLamp, uPale, vB.y ), uEmber, vB.x * 0.75 );
	// far: a soft round blob
	vec3 far = base * vec3( 1.0, 0.66, 0.5 ) * uFarRad * exp( - 3.2 * r2 ) * mix( 1.0, 0.55, vB.x );
	// near: the flame fills the middle fifth of the sprite; the rest is glare
	float sway = 0.035 * sin( uBTime * 8.3 + vPh * 5.0 ) * ( q.y + 0.2 );
	vec2 f = vec2( ( q.x - sway ) / 0.085, ( q.y - 0.06 ) / 0.20 );
	f.x *= 1.0 + 0.9 * max( f.y, 0.0 );                       // pointed tip
	float core = exp( - 2.2 * dot( f, f ) );
	float hearth = exp( - 7.0 * ( q.x * q.x + q.y * q.y * 2.5 ) );   // a hearth is a low, wide, red glow
	core = mix( core, hearth * 0.55, vB.x );
	vec3 near = mix( base, uPale, core * ( 1.0 - vB.x ) ) * ( uNearRad * core + uHalo * exp( - 4.5 * r2 ) );
	vec3 c = mix( far, near, smoothstep( 1.2, 3.2, vNear ) );
	gl_FragColor = vec4( c * ( vOn * edge * bblAerialFade( vBWorldPos ) ), 1.0 );
}`;

/* ------------------------------------------------------------------------------------------------------------------
 * 2. LIGHT VOLUMES: what a lamp or fire lights. One instanced box per light; the fragment shader finds the opaque
 *    surface behind the pixel from post's depth, and adds the light that falls on it (inverse square from a small
 *    area source, windowed like three's point lights), times an albedo estimated from the opaque colour.
 *    type 0: a court (the box is the court: nothing outside its walls is lit)
 *    type 1: a free fire or a roof lamp (a sphere of radius R, nothing below yMin)
 *    type 2: door spill (only what the lamp inside the doorway can see through the door opening)
 *    Back faces with a GREATER-EQUAL depth test: only pixels whose surface lies in front of the far side are shaded,
 *    and the camera may stand inside the volume.
 * ---------------------------------------------------------------------------------------------------------------- */
export const VOL_VERT = /* glsl */ `
#include <bbl_world_pars_vertex>
attribute vec3 iCenter; attribute vec3 iHalf;
attribute vec4 iRT;      // cos, sin of the box's yaw (local x in the world = ( cos, sin )), type, cut-off radius R
attribute vec4 iLight;   // light position (world), intensity
attribute vec4 iAux;     // phase, threshold, source size (m), extra (type 1: yMin; type 2: half width of the door)
attribute vec4 iColor;   // rgb of the light, flicker amplitude
uniform float uNight, uBTime;
varying vec3 vView; varying vec4 vLight; varying vec3 vCenter; varying vec3 vHalf; varying vec4 vRT; varying vec3 vColor; varying vec2 vAux;
void main() {
	float on = smoothstep( iAux.y, iAux.y + 0.12, uNight );
	float ph = iAux.x * 6.2831853;
	float fl = 1.0 + iColor.w * ( 0.5 * sin( uBTime * 11.3 + ph * 7.0 ) + 0.3 * sin( uBTime * 23.9 + ph * 13.0 ) + 0.25 * sin( uBTime * 4.7 + ph * 3.0 ) );
	vec3 l = position * iHalf;
	vec3 wp = iCenter + vec3( iRT.x * l.x - iRT.y * l.z, l.y, iRT.y * l.x + iRT.x * l.z );
	vBWorldPos = wp; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	vec4 mv = viewMatrix * vec4( wp, 1.0 );
	vView = mv.xyz;
	float inten = iLight.w * on * fl;
	vLight = vec4( iLight.xyz, inten );
	vCenter = iCenter; vHalf = iHalf; vRT = iRT; vColor = iColor.rgb; vAux = iAux.zw;
	gl_Position = inten > 0.0 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

export const VOL_FRAG = /* glsl */ `
#include <common>
#include <bbl_world_pars_fragment>
#include <bbl_aerial_pars_fragment>
uniform sampler2D uBPostDepth; uniform sampler2D uBPostColor; uniform vec2 uBPostInvRes; uniform vec3 uBPostZ;
uniform mat4 uCamWorld;
uniform float uAmbInv, uGain, uWater, uPxAngle, uFarBoost, uCap;
varying vec3 vView; varying vec4 vLight; varying vec3 vCenter; varying vec3 vHalf; varying vec4 vRT; varying vec3 vColor; varying vec2 vAux;
void main() {
	vec2 uv = gl_FragCoord.xy * uBPostInvRes;
	float d = texture2D( uBPostDepth, uv ).x;
	float sceneZ = uBPostZ.x / ( 1.0 - min( d, 0.9999999 ) * uBPostZ.y );
	vec3 vp = vView * ( sceneZ / - vView.z );
	vec3 wp = ( uCamWorld * vec4( vp, 1.0 ) ).xyz;
	vec3 ddx = dFdx( wp ), ddy = dFdy( wp );
	vec3 sc = texture2D( uBPostColor, uv ).rgb;
	if ( d >= 0.9999999 || wp.y < uWater ) discard;

	vec3 rel = wp - vCenter;
	vec3 q = vec3( vRT.x * rel.x + vRT.y * rel.z, rel.y, - vRT.y * rel.x + vRT.x * rel.z );
	float mask = 1.0, fill = 0.0;
	if ( vRT.z < 0.5 ) {
		vec3 m3 = 1.0 - smoothstep( vHalf - vec3( 0.16, 0.3, 0.16 ), vHalf, abs( q ) );
		mask = m3.x * m3.y * m3.z;
		// the light that the walls and the floor of the court throw back at each other: strongest low down
		fill = vAux.y * mix( 1.0, 0.55, clamp( ( q.y + vHalf.y ) / ( 2.0 * vHalf.y ), 0.0, 1.0 ) );
	} else if ( vRT.z < 1.5 ) {
		mask = smoothstep( vAux.y - 0.3, vAux.y + 0.1, wp.y );
	} else {
		// door spill: local z runs out of the door, the door plane is at q.z = - vHalf.z, the sill 1.0 above the box floor
		float zl = q.z + vHalf.z;
		float sy = vLight.y - vCenter.y;                       // the lamp, 0.5 m inside the door
		float s = 0.5 / max( zl + 0.5, 1e-3 );
		float ax = q.x * s, ay = sy + ( q.y - sy ) * s;
		float sill = - vHalf.y + 1.0;
		float pen = 0.07 + 0.05 * zl;
		mask = step( 0.0, zl ) * ( 1.0 - smoothstep( vAux.y - pen, vAux.y + pen, abs( ax ) ) ) * smoothstep( sill - pen, sill + pen, ay ) * ( 1.0 - smoothstep( sill + 1.95 - pen, sill + 1.95 + pen, ay ) );
	}
	vec3 Lv = vLight.xyz - wp;
	float dist2 = dot( Lv, Lv ), R2 = vRT.w * vRT.w;
	float wnd = clamp( 1.0 - ( dist2 * dist2 ) / ( R2 * R2 ), 0.0, 1.0 ); wnd *= wnd;
	if ( mask * ( wnd + fill ) <= 0.0 ) discard;
	float atten = wnd / ( dist2 + vAux.x * vAux.x );

	// the surface normal from the depth buffer, trusted only where a pixel is small and the surface continuous
	float foot = sceneZ * uPxAngle;
	float stretch = max( length( ddx ), length( ddy ) ) / max( foot, 1e-5 );
	float trust = ( 1.0 - smoothstep( 4.0, 9.0, stretch ) ) * ( 1.0 - smoothstep( 0.03, 0.2, foot ) );
	vec3 n = normalize( cross( ddx, ddy ) + vec3( 0.0, 1e-9, 0.0 ) );
	if ( dot( n, cameraPosition - wp ) < 0.0 ) n = - n;
	float lam = max( dot( n, Lv ) * inversesqrt( max( dist2, 1e-6 ) ), 0.0 );
	float shade = mix( 0.5, 0.12 + 0.88 * lam, trust );

	// albedo from the opaque colour. The baked occlusion of a court is in that colour too and must not dim the lamp
	// that stands inside it, so the estimate is pulled half way toward plain mud plaster
	float alb = clamp( 0.2 + 0.58 * dot( sc, vec3( 0.2126, 0.7152, 0.0722 ) ) * uAmbInv, 0.24, 0.8 );
	float far = 1.0 + uFarBoost * smoothstep( 120.0, 2200.0, sceneZ );
	vec3 c = vColor * ( vLight.w * uGain * ( atten * shade + fill ) * mask * alb * far * RECIPROCAL_PI );
	c *= min( 1.0, uCap / max( max( c.r, c.g ), max( c.b, 1e-4 ) ) );          // never into the bloom, and the hue is kept
	gl_FragColor = vec4( c * bblAerialFade( wp ), 1.0 );
}`;

/** Fallback when post has no depth to read (--stub post): nothing to shade against, so the volumes are not drawn. */

/* ------------------------------------------------------------------------------------------------------------------
 * 3. AIR GLOW: the light a court or a fire throws into the smoky air above it. Soft additive billboards, far below
 *    the bloom threshold, faded where they meet a wall.
 * ---------------------------------------------------------------------------------------------------------------- */
export const GLOW_VERT = /* glsl */ `
#include <bbl_world_pars_vertex>
attribute vec3 iPos;
attribute vec4 iA;      // size (m), radiance, threshold, phase
attribute vec4 iC;      // rgb, vertical stretch
uniform float uNight, uBTime, uPx, uMinPx;
varying vec2 vUv; varying vec3 vC; varying float vZ; varying float vSoft;
void main() {
	float on = smoothstep( iA.z, iA.z + 0.12, uNight );
	float ph = iA.w * 6.2831853;
	float fl = 1.0 + 0.10 * sin( uBTime * 11.3 + ph * 7.0 ) + 0.07 * sin( uBTime * 4.7 + ph * 3.0 );
	vec3 camRight = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
	vec3 camUp = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
	float dist = distance( cameraPosition, iPos );
	float px = iA.x * uPx / max( dist, 0.1 );
	float grow = max( 1.0, uMinPx * 2.2 / max( px, 1e-3 ) );          // never under a few pixels
	// seen from above it is a pool; seen from the side a low, faint band over the court mouth
	float above = smoothstep( 0.1, 0.5, abs( cameraPosition.y - iPos.y ) / max( dist, 0.1 ) );
	float squash = iC.w < 0.95 ? mix( 0.38, iC.w, above ) : 1.0;
	vec3 wp = iPos + ( camRight * position.x + camUp * position.y * squash ) * iA.x * grow;
	vBWorldPos = iPos; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	vec4 mv = viewMatrix * vec4( wp, 1.0 );
	vUv = position.xy * 2.0; vZ = - mv.z; vSoft = max( 0.35 * iA.x, 0.4 );
	vC = iC.rgb * ( iA.y * on * fl / ( grow * grow ) ) * smoothstep( 0.6, 2.5, dist / iA.x );
	gl_Position = on > 0.0 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

export const GLOW_FRAG = /* glsl */ `
#include <common>
#include <bbl_world_pars_fragment>
#include <bbl_aerial_pars_fragment>
#ifdef SOFT
uniform sampler2D uBPostDepth; uniform vec2 uBPostInvRes; uniform vec3 uBPostZ;
#endif
varying vec2 vUv; varying vec3 vC; varying float vZ; varying float vSoft;
void main() {
	float r2 = dot( vUv, vUv );
	if ( r2 > 1.0 ) discard;
	float g = exp( - 3.6 * r2 ) * ( 1.0 - r2 );
	#ifdef SOFT
	float sceneZ = uBPostZ.x / ( 1.0 - texture2D( uBPostDepth, gl_FragCoord.xy * uBPostInvRes ).x * uBPostZ.y );
	g *= clamp( ( sceneZ - vZ ) / vSoft + 0.5, 0.0, 1.0 );
	#endif
	gl_FragColor = vec4( vC * ( g * bblAerialFade( vBWorldPos ) ), 1.0 );
}`;

/* ------------------------------------------------------------------------------------------------------------------
 * 4. FLAMES of torches, braziers, fire bowls, hearths and free lamps: one instanced billboard each. The flame is a
 *    tongue shaped by two octaves of noise that scroll upward; far away it becomes a blob of at least uMinPx pixels.
 * ---------------------------------------------------------------------------------------------------------------- */
export const FLAME_VERT = /* glsl */ `
#include <bbl_world_pars_vertex>
attribute vec4 iPos;    // position of the fire's base (world), w = 1 lit / 0 off (a moving emitter that is away)
attribute vec4 iA;      // width, height (m), seed 0..1, threshold
attribute vec4 iB;      // kind (0 lamp, 1 hearth, 2 torch, 3 brazier, 4 fire bowl), gain, share kept by day, colour temperature
uniform float uNight, uBTime, uPx, uMinPx, uDayDim;
varying vec2 vUv; varying float vOn; varying vec4 vS; varying float vNear;
void main() {
	float on = max( smoothstep( iA.w, iA.w + 0.14, uNight ), iB.z * uDayDim ) * iPos.w;
	vec3 toCam = cameraPosition - iPos.xyz; float dist = max( length( toCam ), 0.05 );
	vec3 camUp = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
	float steep = smoothstep( 0.55, 0.92, abs( toCam.y ) / dist );
	vec3 up = normalize( mix( vec3( 0.0, 1.0, 0.0 ), camUp, steep ) );
	vec3 right = normalize( cross( up, toCam ) );
	// the quad is 2.2 flame widths by 1.5 flame heights, so that the glare has room round the tongue
	float w = iA.x * 2.2, h = iA.y * 1.5;
	float hpx = h * uPx / dist;
	float grow = max( 1.0, uMinPx * 1.6 / max( hpx, 1e-3 ) );
	vNear = clamp( hpx / ( uMinPx * 1.6 ), 0.0, 8.0 );
	w = mix( w, max( w, h ), clamp( grow - 1.0, 0.0, 1.0 ) ) * grow; h *= grow;
	vec3 wp = iPos.xyz + right * position.x * w + up * ( ( position.y + 0.5 ) * h - 0.14 * h - 0.5 * ( grow - 1.0 ) * h / grow );
	vBWorldPos = iPos.xyz; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	float gust = 0.5 + 0.5 * sin( uBTime * 1.9 + iA.z * 40.0 );
	vUv = vec2( position.x * 2.0, position.y + 0.5 );
	vOn = on * iB.y * ( 0.9 + 0.2 * gust );
	vS = vec4( iA.z, iB.x, iB.w, gust );
	gl_Position = on > 0.0 ? projectionMatrix * viewMatrix * vec4( wp, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

export const FLAME_FRAG = /* glsl */ `
#include <common>
#include <bbl_world_pars_fragment>
#include <bbl_aerial_pars_fragment>
uniform sampler2D uNoise;
uniform vec3 uLamp, uPale, uEmber;
uniform float uBTime, uFarRad, uNearRad, uHalo;
uniform vec3 uWindLean;      // lean of the tongues with the wind, in the billboard's frame: set per frame ( x across, unused, unused )
varying vec2 vUv; varying float vOn; varying vec4 vS; varying float vNear;
void main() {
	// flame coordinates: x -1..1 across the tongue, y 0 at the base, 1 at the tip
	vec2 p = vec2( vUv.x * 2.2, ( vUv.y - 0.14 ) * 1.5 );
	float seed = vS.x, kind = vS.y;
	float t = uBTime;
	float n1 = texture2D( uNoise, vec2( p.x * 0.21 + seed * 7.3, p.y * 0.36 - t * 0.83 + seed * 3.1 ) ).r;
	float n2 = texture2D( uNoise, vec2( p.x * 0.55 + seed * 2.9, p.y * 0.95 - t * 1.75 + seed ) ).g;
	float n3 = texture2D( uNoise, vec2( seed * 5.1 + t * 0.31, 0.37 ) ).b;
	float py = clamp( p.y, 0.0, 1.0 );
	float x = p.x + ( ( n1 - 0.5 ) * 1.0 + ( n2 - 0.5 ) * 0.45 + ( n3 - 0.5 ) * 0.6 ) * py + uWindLean.x * py * py;
	float wide = step( 2.5, kind ) * 0.25 + step( 0.5, kind ) * ( 1.0 - step( 1.5, kind ) ) * 0.4;      // braziers, bowls and hearths burn broad
	float prof = pow( 1.0 - py, 0.75 - wide ) * ( 0.5 + 0.5 * smoothstep( 0.0, 0.16, py ) ) * ( 0.8 + 0.55 * ( n2 - 0.5 ) );
	float body = ( 1.0 - smoothstep( prof * 0.2, prof, abs( x ) ) ) * smoothstep( - 0.04, 0.03, p.y ) * ( 1.0 - smoothstep( 0.5, 1.0, py + ( n1 - 0.5 ) * 0.7 ) );
	// tongues: higher up the flame breaks into licks (not for the single flame of an oil lamp)
	float lick = smoothstep( 0.16, 0.5, n2 + ( 1.0 - py ) * 0.8 - 0.3 * n1 );
	body *= mix( lick, 1.0, 1.0 - step( 0.5, kind ) );
	// heat: white-yellow low in the middle, orange in the body, deep red at the edges and tips. Radiance stays near
	// the bloom threshold, so the flame keeps its colours and only its heart glows
	float heat = body * ( 1.0 - 0.5 * py ) * ( 0.7 + 0.6 * n1 );
	vec3 col = mix( vec3( 1.0, 0.15, 0.02 ), vec3( 1.0, 0.4, 0.06 ), smoothstep( 0.06, 0.38, heat ) );
	col = mix( col, vec3( 1.0, 0.74, 0.3 ), smoothstep( 0.4, 0.85, heat ) );
	float hearthK = step( 0.5, kind ) * ( 1.0 - step( 1.5, kind ) );
	col *= mix( vec3( 1.0 ), vec3( 1.0, 0.6, 0.5 ), hearthK * 0.7 );
	vec3 base = mix( mix( uLamp, uPale, vS.z ), uEmber, hearthK * 0.6 );
	float rad = uNearRad * ( 0.22 + 0.78 * smoothstep( 0.0, 0.7, heat ) ) * smoothstep( 0.0, 0.1, body );
	vec2 hq = vec2( vUv.x, ( vUv.y - 0.42 ) * 1.5 );
	float halo = exp( - 5.0 * dot( hq, hq ) ) * ( 1.0 - smoothstep( 0.55, 1.0, dot( hq, hq ) ) );
	vec3 near = col * rad + base * ( uHalo * halo );
	vec2 bq = vec2( p.x * 1.15, ( p.y - 0.42 ) * 1.55 );
	float b2 = dot( bq, bq );
	vec3 far = base * vec3( 1.0, 0.5, 0.3 ) * ( uFarRad * exp( - 2.6 * b2 ) * ( 1.0 - smoothstep( 0.75, 1.15, b2 ) ) );
	vec3 c = mix( far, near, smoothstep( 1.0, 2.6, vNear ) );
	gl_FragColor = vec4( c * ( vOn * bblAerialFade( vBWorldPos ) ), 1.0 );
}`;

/* ------------------------------------------------------------------------------------------------------------------
 * 5. SPARKS over the big fires: GL points on closed-form paths (rise, drift with the wind, fade).
 * ---------------------------------------------------------------------------------------------------------------- */
export const SPARK_VERT = /* glsl */ `
#include <bbl_world_pars_vertex>
attribute vec4 aS;      // phase, rate (1/s), rise (m), spread (m)
attribute vec2 aT;      // threshold, seed
uniform float uNight, uBTime, uPx, uDayDim;
uniform vec2 uWind;
varying float vA;
void main() {
	float on = smoothstep( aT.x, aT.x + 0.14, uNight );
	float a = fract( uBTime * aS.y + aS.x );
	float s = aT.y * 6.2831853;
	vec3 wp = position + vec3( sin( s * 5.0 + a * 9.0 ) * aS.w * a + uWind.x * a * a * 1.6, a * aS.z * ( 1.0 - 0.35 * a ), cos( s * 3.0 + a * 7.0 ) * aS.w * a + uWind.y * a * a * 1.6 );
	vBWorldPos = wp; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	vec4 mv = viewMatrix * vec4( wp, 1.0 );
	float px = 0.045 * uPx / max( - mv.z, 0.1 );
	vA = on * ( 1.0 - a ) * ( 1.0 - a ) * smoothstep( 0.0, 0.08, a ) * clamp( px / 0.9, 0.0, 1.0 ) * ( 0.6 + 0.4 * sin( uBTime * 31.0 + s * 9.0 ) );
	gl_PointSize = clamp( px, 1.5, 6.0 );
	gl_Position = vA > 0.002 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

export const SPARK_FRAG = /* glsl */ `
#include <common>
#include <bbl_world_pars_fragment>
#include <bbl_aerial_pars_fragment>
uniform vec3 uLamp; uniform float uRad;
varying float vA;
void main() {
	vec2 q = gl_PointCoord * 2.0 - 1.0;
	float g = exp( - 3.0 * dot( q, q ) );
	gl_FragColor = vec4( uLamp * ( uRad * g * vA * bblAerialFade( vBWorldPos ) ), 1.0 );
}`;

/* ------------------------------------------------------------------------------------------------------------------
 * 6. PUFFS: smoke columns, kiln smoke, dust, the evening haze over the housing, the morning mist on the water and
 *    the lit smoke of the night fires. One instanced billboard per puff; a puff's age is fract( t / life + phase ),
 *    so a column is a chain of puffs that rise, drift with the one wind and thin out. Lit by the key light (with
 *    the engine's shadows for the columns) and the fill; soft where it meets the scene.
 *    kind: 0 oven / hearth / altar smoke, 1 kiln smoke, 2 dust, 3 haze, 4 mist, 5 fire smoke (lit from below)
 * ---------------------------------------------------------------------------------------------------------------- */
export const PUFF_VERT = /* glsl */ `
#include <bbl_world_pars_vertex>
attribute vec4 iBase;   // source position (world), w = 1 / puffs in the column (0: a moving source that is away)
attribute vec4 iA;      // phase 0..1, life (s), rise (m), drift (m along the wind over the life)
attribute vec4 iB;      // size at birth, size at death (kinds 3, 4: width, thickness), alpha, seed
attribute vec4 iC;      // albedo rgb, kind
uniform float uBTime;
uniform vec2 uWind;       // unit vector the air moves toward
uniform float uKW[ 6 ];   // weight per kind
varying vec2 vUv; varying float vAlpha; varying vec3 vAlb; varying vec3 vCtr; varying vec4 vK; varying float vZ; varying float vSoft; varying vec2 vOff;
void main() {
	float kind = iC.w;
	float flat_ = step( 2.5, kind ) * ( 1.0 - step( 4.5, kind ) );
	float a = fract( uBTime / iA.y + iA.x );
	float gust = 1.0 + 0.3 * sin( 0.61 * uBTime - 0.011 * dot( iBase.xz, uWind ) ) + 0.15 * sin( 1.73 * uBTime - 0.037 * dot( iBase.xz, uWind ) + 1.3 );
	float up = iA.z * ( 1.0 - ( 1.0 - a ) * ( 1.0 - a ) * ( 1.0 - a ) );   // fast at the source, then it levels off and shears away
	float dr = iA.w * mix( pow( a, 1.5 ) * mix( 1.0, gust, 0.5 ), a, flat_ );
	vec3 c = iBase.xyz + vec3( uWind.x * dr, up, uWind.y * dr );
	float size = mix( mix( iB.x, iB.y, pow( a, 0.8 ) ), iB.x, flat_ );
	vec2 perp = vec2( - uWind.y, uWind.x );
	float s = iB.w * 6.2831853;
	// the column wavers as ONE thread: the wave depends on the source, the age and the time, not on the puff
	float cs = fract( sin( dot( iBase.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
	c.xz += perp * ( sin( a * 6.0 + cs - uBTime * 0.31 ) * 0.7 + sin( a * 13.0 + cs * 3.0 - uBTime * 0.53 ) * 0.3 ) * size * ( 1.0 - flat_ ) * smoothstep( 0.0, 0.35, a );
	// ... and it does not climb a clean curve: the rise itself wavers a little with the age
	c.y += ( sin( a * 9.0 + cs * 1.7 - uBTime * 0.4 ) * 0.25 ) * size * ( 1.0 - flat_ ) * smoothstep( 0.05, 0.4, a );
	float fadeIn = mix( 0.04, 0.22, flat_ ), fadeOut = mix( 0.3, 0.72, flat_ );
	float fade = smoothstep( 0.0, fadeIn, a ) * ( 1.0 - smoothstep( fadeOut, 1.0, a ) ) * mix( 1.0 - 0.45 * a, 1.0, flat_ );
	vec3 toCam = cameraPosition - c; float dist = max( length( toCam ), 0.01 );
	vec3 camRight = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
	vec3 camUp = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
	float sx = size, sy = size;
	vec2 along = vec2( 0.0, 1.0 );
	float thin = 1.0;
	vec3 wp;
	float nearFade;
	if ( flat_ > 0.5 ) {
		// haze and mist lie as level sheets (the fragment shader thickens them for a grazing view): they meet walls,
		// boats and the bridge at their true height, which a camera-facing card would not
		float ang = s;
		vec3 ax = vec3( cos( ang ), 0.0, sin( ang ) ), az = vec3( - ax.z, 0.0, ax.x );
		wp = c + ax * ( position.x * size ) + az * ( position.y * size );
		nearFade = smoothstep( 0.4, 3.5, abs( toCam.y ) );
	} else {
		// a column is a chain of puffs: each is drawn out along the plume until it reaches its neighbours, so the
		// column is one streak and not a string of beads
		float dup = iA.z * 3.0 * ( 1.0 - a ) * ( 1.0 - a ), ddr = iA.w * 1.5 * sqrt( a ) * mix( 1.0, gust, 0.5 );
		vec3 T = vec3( uWind.x * ddr, dup, uWind.y * ddr );
		vec2 ts = vec2( dot( T, camRight ), dot( T, camUp ) );
		float tl = length( ts );
		if ( tl > 1e-4 ) along = ts / tl;
		sy = max( size, 2.6 * tl * iBase.w );
		thin = sqrt( size / sy );
		wp = c + ( camRight * along.y - camUp * along.x ) * ( position.x * sx ) + ( camRight * along.x + camUp * along.y ) * ( position.y * sy );
		nearFade = smoothstep( 0.35, 1.5, dist / max( sx, 0.5 ) );
	}
	vBWorldPos = wp; vBWorldNormal = vec3( 0.0, 1.0, 0.0 );
	vec4 mv = viewMatrix * vec4( wp, 1.0 );
	float w = uKW[ int( kind + 0.5 ) ];
	vAlpha = iB.z * fade * nearFade * w * thin * step( 1e-5, iBase.w );
	vAlb = iC.rgb; vCtr = c; vUv = position.xy + 0.5;
	vK = vec4( kind, a, up, iB.w );
	vZ = - mv.z; vSoft = mix( max( 0.45 * min( sx, sy ), 0.25 ), 0.6 * iB.y, flat_ );
	vOff = vec2( iB.w * 13.7, iB.w * 7.1 + a * 0.35 );
	gl_Position = vAlpha > 0.002 ? projectionMatrix * mv : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

export const PUFF_FRAG = /* glsl */ `
#include <common>
#include <bbl_world_pars_fragment>
#include <bbl_aerial_pars_fragment>
#ifdef SHADOWS
	#define BBL_SHADOW_TAPS 4
	#include <bbl_shadow_pars_fragment>
#endif
#ifdef SOFT
uniform sampler2D uBPostDepth; uniform vec2 uBPostInvRes; uniform vec3 uBPostZ;
#endif
uniform sampler2D uNoise;
uniform float uBTime, uNight;
uniform vec3 uKeyDir, uKeyCol, uAmbCol, uFireCol;
varying vec2 vUv; varying float vAlpha; varying vec3 vAlb; varying vec3 vCtr; varying vec4 vK; varying float vZ; varying float vSoft; varying vec2 vOff;
void main() {
	vec2 p = vUv * 2.0 - 1.0; float r2 = dot( p, p );
	if ( r2 >= 1.0 ) discard;
	float kind = vK.x;
	float big = step( 2.5, kind ) * ( 1.0 - step( 4.5, kind ) );
	vec2 nuv = vUv * mix( 0.42, 1.1, big ) + vOff;
	float n1 = texture2D( uNoise, nuv + vec2( 0.0, - uBTime * 0.012 ) ).r;
	float n2 = texture2D( uNoise, nuv * 2.9 + vec2( uBTime * 0.017, 0.0 ) ).g;
	float nn = n1 * 0.62 + n2 * 0.38;
	float fall = 1.0 - r2; fall *= mix( fall, 1.0, big * 0.6 );
	float dens = fall * mix( smoothstep( 0.16, 0.7, nn * 1.1 + fall * 0.4 - 0.1 ), smoothstep( 0.12, 0.62, nn * 0.9 + fall * 0.5 - 0.08 ), big );
	float soft = 1.0;
	#ifdef SOFT
	float sceneZ = uBPostZ.x / ( 1.0 - texture2D( uBPostDepth, gl_FragCoord.xy * uBPostInvRes ).x * uBPostZ.y );
	soft = clamp( ( sceneZ - vZ ) / vSoft + 0.3, 0.0, 1.0 );
	#endif
	float alpha = vAlpha * dens * soft;
	if ( big > 0.5 ) {
		// a level sheet: the vertical opacity becomes the opacity along this ray through the slab
		float se = max( abs( normalize( vBWorldPos - cameraPosition ).y ), 0.045 );
		alpha = min( 1.0 - pow( 1.0 - min( vAlpha * dens, 0.9 ), 1.0 / se ), 0.62 ) * soft;
	}
	if ( alpha < 0.003 ) discard;
	vec3 camRight = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
	vec3 camUp = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
	vec3 camBack = vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
	vec3 nv = vec3( p, sqrt( max( 1.0 - r2, 0.0 ) ) );
	vec3 nW = normalize( camRight * nv.x + camUp * nv.y + camBack * nv.z + ( n1 - 0.5 ) * 0.8 * camUp );
	if ( big > 0.5 ) nW = normalize( vec3( ( n1 - 0.5 ) * 0.9, 1.0, ( n2 - 0.5 ) * 0.9 ) );
	float nl = dot( nW, uKeyDir ) * 0.5 + 0.5;
	vec3 V = normalize( vCtr - cameraPosition );
	float fwd = pow( max( dot( V, uKeyDir ), 0.0 ), 5.0 );
	float sh = 1.0;
	#ifdef SHADOWS
	if ( big < 0.5 ) sh = 0.25 + 0.75 * bblShadow( vCtr, uBKeyDir );
	#endif
	vec3 lit = vAlb * ( uKeyCol * ( ( 0.28 + 0.72 * nl ) * sh * ( 1.0 + 3.0 * fwd * ( 1.0 - 0.7 * dens ) ) ) + uAmbCol ) * RECIPROCAL_PI;
	// smoke also passes on the light of the sky behind it: against the afterglow it is a veil, not a black streak
	#ifdef HAZE
	lit += vAlb * bblHazeColor( V ) * 0.4 * ( 1.0 - 0.5 * dens );
	#else
	lit += vAlb * uAmbCol * 0.3;
	#endif
	// the smoke of a night fire is lit from below by its own flames
	float fire = step( 4.5, kind ) * uNight * exp( - vK.z * 0.55 ) * ( 0.6 + 0.4 * ( 1.0 - p.y ) );
	lit += uFireCol * fire;
	lit = min( lit, vec3( 1.3 ) );
	gl_FragColor = vec4( bblAerial( lit, vCtr ), alpha );
}`;
