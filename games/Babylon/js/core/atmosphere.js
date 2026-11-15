// js/core/atmosphere.js — part of subsystem "lighting". OWNER: lighting engineer. Notes: docs/lighting.md.
//
// Aerial perspective: the air between the camera and a surface. Two exponential haze layers (a dense one that
// hugs the plain, a thin high one) are integrated analytically along the view ray, so the same air is 50 % at
// 2 km for a camera in the street and only about 30 % at 3 km for a camera 800 m up. The in-scatter colour
// depends on the angle to the sun (warmer and brighter toward it) and is THE SAME FUNCTION the sky dome uses at
// and below the horizon: bblHazeColor(dir). A surface far enough away therefore has exactly the colour of the
// sky behind it, at any camera altitude.
//
// GLSL chunks registered here (ENGINE.md 5.5, 6):
//   bbl_aerial_pars_fragment   uniforms + vec3 bblHazeColor(dir), float bblSunLobe(cosAngle, exponent),
//                              float bblAerialDepth(worldPos), float bblAerialFade(worldPos), vec3 bblAerial(color, worldPos)
//   bbl_aerial_fragment        applies bblAerial to gl_FragColor of a built-in material (replaces <fog_fragment>)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

THREE.ShaderChunk.bbl_aerial_pars_fragment = /* glsl */ `
uniform vec3 uBAerialColor;      // in-scatter radiance looking away from the sun ( = the sky at the horizon there )
uniform vec3 uBAerialSunColor;   // in-scatter radiance looking toward the sun's azimuth (at night: the core of the afterglow)
uniform vec3 uBAerialSunColor2;  // ... on the flanks of the azimuth lobe (by day the same colour; at night the rose of the afterglow)
uniform vec3 uBSunDir;           // unit vector TO the sun (below the horizon at night)
uniform float uBAerialDensity;   // low layer: extinction per metre at y = 0
uniform float uBAerialFalloff;   // low layer: 1 / scale height
uniform vec2 uBAerialHigh;       // high layer: ( extinction per metre at y = 0, 1 / scale height )
uniform vec4 uBAerialLobe;       // sun lobe: ( azimuth weight, azimuth exponent, angle weight, angle exponent )
uniform float uBAerialFar;       // distance at which the air is opaque whatever the altitude (m)
uniform float uBAerialFlat;      // how closely the azimuth lobe hugs the horizon (exponent)
uniform float uBAerialCore;      // how narrow the core colour is inside the azimuth lobe (exponent)
// the glow around the sun: a narrow core on long tails (one cosine power alone reads as a disc with an edge)
float bblSunLobe( float cosAngle, float exponent ) {
	float c = max( cosAngle, 0.0 );
	return 0.40 * pow( c, 0.3 * exponent ) + 0.38 * pow( c, exponent ) + 0.22 * pow( c, 5.0 * exponent );
}
// colour of the haze seen along a view direction (unit vector). The sky dome returns exactly this at and below
// the horizon, so distant ground and sky cannot differ.
vec3 bblHazeColor( vec3 dir ) {
	float h = length( dir.xz );
	vec2 a = dir.xz / max( h, 1e-4 );
	vec2 b = normalize( uBSunDir.xz + vec2( 1e-5, 0.0 ) );
	float az = max( dot( a, b ), 0.0 );
	// the azimuth lobe is the glow along the horizon: it fades for rays that look steeply down (or up)
	float w = uBAerialLobe.x * pow( az, uBAerialLobe.y ) * pow( 1.0 - abs( dir.y ), uBAerialFlat ) + uBAerialLobe.z * bblSunLobe( dot( dir, uBSunDir ), uBAerialLobe.w );
	vec3 warm = mix( uBAerialSunColor2, uBAerialSunColor, pow( az, uBAerialCore ) );
	return mix( uBAerialColor, warm, clamp( w, 0.0, 1.0 ) );
}
// mean extinction of one exponential layer along a ray from height y0 to y1 (per metre of path)
float bblAerialLayer( float rho, float invH, float y0, float y1 ) {
	float x = ( y1 - y0 ) * invH;
	float e0 = exp( - max( y0, - 60.0 ) * invH );
	if ( abs( x ) < 1e-3 ) return rho * e0 * ( 1.0 - 0.5 * x );
	return rho * ( e0 - exp( - max( y1, - 60.0 ) * invH ) ) / x;
}
// optical depth of the air between the camera and worldPos
float bblAerialDepth( vec3 worldPos ) {
	float dist = distance( worldPos, cameraPosition );
	float tau = dist * ( bblAerialLayer( uBAerialDensity, uBAerialFalloff, cameraPosition.y, worldPos.y ) + bblAerialLayer( uBAerialHigh.x, uBAerialHigh.y, cameraPosition.y, worldPos.y ) );
	// beyond the reach of the two layers (a camera high above them) the air still closes: a cubic ramp to opaque at uBAerialFar,
	// 1 % at a ninth of it, so the plain fades over many degrees of view and never ends in an edge
	float k = min( dist / uBAerialFar, 1.0 );
	return tau + 9.0 * k * k * k;
}
// fraction of a surface's radiance that survives the air (1 = clear). For ADDITIVE effects: colour *= bblAerialFade( p )
float bblAerialFade( vec3 worldPos ) {
	return exp( - bblAerialDepth( worldPos ) );
}
// a surface colour seen through the air. For opaque and alpha-blended surfaces.
vec3 bblAerial( vec3 color, vec3 worldPos ) {
	vec3 v = worldPos - cameraPosition;
	return mix( bblHazeColor( v / max( length( v ), 1e-4 ) ), color, bblAerialFade( worldPos ) );
}
`;
THREE.ShaderChunk.bbl_aerial_fragment = /* glsl */ `
#ifdef USE_FOG
	gl_FragColor.rgb = bblAerial( gl_FragColor.rgb, vBWorldPos );
#endif
`;

/** Share of the ground-level extinction in the low layer, and the two scale heights (m). */
export const HAZE = Object.freeze({ lowShare: 0.9, lowHeight: 160, highHeight: 3000, far: 27000 });

/**
 * Uniform objects of the aerial chunk plus JS mirrors of the GLSL (for tests, CPU-side fades of sprites, docs).
 * apply(state, frame) is called by lighting.update().
 */
export function createAtmosphere(ctx) {
  const U = {
    uBAerialColor: { value: new THREE.Color(1, 1, 1) }, uBAerialSunColor: { value: new THREE.Color(1, 1, 1) },
    uBSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uBAerialDensity: { value: 0.0003 }, uBAerialFalloff: { value: 1 / HAZE.lowHeight },
    uBAerialHigh: { value: new THREE.Vector2(0.00004, 1 / HAZE.highHeight) },
    uBAerialLobe: { value: new THREE.Vector4(0.5, 4, 0.5, 24) },
    uBAerialFar: { value: HAZE.far }, uBAerialFlat: { value: 6 }, uBAerialCore: { value: 1 },
    uBAerialSunColor2: { value: new THREE.Color(1, 1, 1) },
  };
  const layer = (rho, invH, y0, y1) => {
    const x = (y1 - y0) * invH, e0 = Math.exp(-Math.max(y0, -60) * invH);
    return Math.abs(x) < 1e-3 ? rho * e0 * (1 - 0.5 * x) : rho * (e0 - Math.exp(-Math.max(y1, -60) * invH)) / x;
  };
  const atmosphere = {
    uniforms: U,
    /** Optical depth between two world points [x, y, z] (the GLSL bblAerialDepth, with `from` as the camera). */
    opticalDepth(from, to) {
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const tau = dist * (layer(U.uBAerialDensity.value, U.uBAerialFalloff.value, from[1], to[1]) + layer(U.uBAerialHigh.value.x, U.uBAerialHigh.value.y, from[1], to[1]));
      const k = Math.min(dist / U.uBAerialFar.value, 1);
      return tau + 9 * k * k * k;
    },
    /** Fraction of a surface's radiance that survives the air between `from` (camera) and `to` (the GLSL bblAerialFade). */
    fade(from, to) { return Math.exp(-atmosphere.opticalDepth(from, to)); },
    /** Extinction per metre at height y (both layers). */
    densityAt(y) { return U.uBAerialDensity.value * Math.exp(-Math.max(y, -60) * U.uBAerialFalloff.value) + U.uBAerialHigh.value.x * Math.exp(-Math.max(y, -60) * U.uBAerialHigh.value.y); },
    /** Write the uniforms for a light state. frame.fog: null | multiplier (0 = off). */
    apply(state, frame) {
      const mul = frame && frame.fog !== null && frame.fog !== undefined ? frame.fog : 1;
      U.uBAerialColor.value.copy(state.fogColor); U.uBAerialSunColor.value.copy(state.hazeSunColor); U.uBAerialSunColor2.value.copy(state.hazeSunColor2 || state.hazeSunColor);
      U.uBSunDir.value.copy(state.sunDir);
      U.uBAerialDensity.value = state.fogDensity * HAZE.lowShare * mul;
      U.uBAerialFalloff.value = state.fogHeightFalloff;
      U.uBAerialHigh.value.set(state.fogDensity * (1 - HAZE.lowShare) * mul, 1 / HAZE.highHeight);
      U.uBAerialLobe.value.set(state.hazeLobe[0], state.hazeLobe[1], state.hazeLobe[2], state.hazeLobe[3]);
      U.uBAerialFar.value = mul > 0 ? HAZE.far : 1e12;
      U.uBAerialFlat.value = state.hazeLobe[4]; U.uBAerialCore.value = state.hazeLobe[5] === undefined ? 1 : state.hazeLobe[5];
    },
  };
  return atmosphere;
}
