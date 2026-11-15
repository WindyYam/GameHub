// js/core/lighting.js — subsystem "lighting" (ENGINE.md 5.5). OWNER: lighting engineer. Notes: docs/lighting.md.
//
//   modes        the four light states of world.json lighting.modes, in scene-referred radiance
//   stateAt      pure: the sun on its real arc between two modes; sky, fog, exposure, stars, fires follow one weight
//   key light    ONE directional light in the scene (sun by day, moon at night), never a three.js shadow caster
//   shadows      four maps of quality.shadowMapSize rendered by renderShadows(frame) through three's own
//                shadow pass (so castShadow, customDepthMaterial, alphaTest, instancing all work) and sampled by
//                bblShadow(): a 16-tap rotated disc of hardware-filtered comparisons with a penumbra in METRES
//   ambient      a PMREM of the sky dome per mode (blended in a transition, never rebuilt per frame) scaled to
//                the key : fill ratio of the mode, plus a small hemisphere fill
//   air          js/core/atmosphere.js;   sky dome   js/core/sky.js
//   fires        a pool of point lights (no shadows) given every sub-frame to the registered fires that matter
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import * as M from './mathx.js';
import { createAtmosphere, HAZE } from './atmosphere.js';
import { createSky } from './sky.js';

// ---- display-referred colours ---------------------------------------------------------------------------------
// The sky, fog and cloud colours of world.json were measured on finished frames of the reference. To show them
// on OUR finished frames they are run backwards through the tone curve of post (ACES filmic, exposure of the
// mode): radiance = ACES^-1(colour) / exposure. Everything else in the scene is physical (albedo x light).
const ACES_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const ACES_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const ACES_IN_INV = ACES_IN.clone().invert(), ACES_OUT_INV = ACES_OUT.clone().invert();
const _v = new THREE.Vector3();
/** THREE.ACESFilmicToneMapping at exposure 1: scene-linear Color -> display-linear Color (new object). */
export function acesForward(c) {
  _v.set(c.r, c.g, c.b).multiplyScalar(1 / 0.6).applyMatrix3(ACES_IN);
  const f = (x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081);
  _v.set(f(_v.x), f(_v.y), f(_v.z)).applyMatrix3(ACES_OUT);
  return new THREE.Color(M.clamp(_v.x), M.clamp(_v.y), M.clamp(_v.z));
}
/** Inverse of acesForward: display-linear Color -> scene-linear radiance at exposure 1 (new object). */
export function acesInverse(c) {
  _v.set(c.r, c.g, c.b).applyMatrix3(ACES_OUT_INV);
  const g = (y0) => {
    const y = M.clamp(y0, 0.0004, 0.985), A = 1 - 0.983729 * y, B = 0.0245786 - 0.4329510 * y, C = -(0.000090537 + 0.238081 * y);
    return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  };
  _v.set(g(_v.x), g(_v.y), g(_v.z)).applyMatrix3(ACES_IN_INV).multiplyScalar(0.6);
  return new THREE.Color(Math.max(_v.x, 0), Math.max(_v.y, 0), Math.max(_v.z, 0));
}
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const acesGrey = (x) => acesForward(new THREE.Color(x, x, x)).g;
/**
 * Fill irradiance (luminance) on a wall the key light does not reach, such that ON THE FINISHED FRAME a light
 * surface (albedo 0.6) in the key light is `ratio` times as bright (display-linear) as the same surface in the
 * shade. The key : fill ratios of world.json were measured on finished frames; the tone curve steepens the
 * darks, so the scene ratio is about half of the displayed one.
 */
export function solveFill(keyOnWall, ratio, exposure = 1, albedo = 0.6) {
  let lo = 1e-5, hi = keyOnWall * 6;
  for (let i = 0; i < 60; i++) {
    const f = (lo + hi) / 2, r = acesGrey(((keyOnWall + f) * albedo / Math.PI) * exposure) / acesGrey((f * albedo / Math.PI) * exposure);
    if (r > ratio) lo = f; else hi = f;
  }
  return (lo + hi) / 2;
}

// ---- constants (tuned on rendered stills; docs/lighting.md says what each one does) -----------------------------
// Exposure per mode, set on a white wall (albedo 0.65) facing the sun in open ground (out/audit-lighting/scripts/probe2.js)
// against what the reference shows (STYLE 6.1, 6.2) and on the median luma of the ten shots:
//   golden 1.45     the wall shows #E5CBA3 (display-linear luma 0.62); reference white stone #DECFBA (0.64). At 1.22 it was
//                   0.57 and shot 4 had a median of 0.42
//   afternoon 1.2   no measurement in the reference; wall #DFD3C0; shots 2 and 3 at a median of 0.445 and 0.59 (target 0.46 to 0.60)
//   morning 0.84    at 1.0 the wall showed #D3CEC9 and frames had a median of 0.69 to 0.75; the reference's lit cream is #B3B4BA
// Sky, fog and cloud colours are display-referred (displayToScene) and the fill is solved for the key : fill ratio at the
// exposure, so changing a value here moves the sunlit surfaces and little else.
const EXPOSURE = { golden: 1.45, afternoon: 1.2, morning: 0.84, blue: 1.0 };
const GLOW = { golden: 0.9, afternoon: 0.7, morning: 0.6, blue: 0.0 };          // amount of the warm lobe toward the sun
// sun lobe of the haze: [azimuth weight, azimuth exponent, angle weight, angle exponent, horizon exponent, core exponent].
// blue: the lobe IS the afterglow where it meets the horizon (weight 1, as wide as the twilight arch of sky.js, its core colour
// narrow), so the dark plain dissolves into the glow instead of ending in a dull band under it
const HAZE_LOBE = { golden: [0.5, 4, 0.5, 20, 6, 1], afternoon: [0.42, 4, 0.5, 20, 6, 1], morning: [0.38, 4, 0.5, 20, 6, 1], blue: [1.0, 1.6, 0.0, 8, 18, 6] };
const FILL_GAIN = { golden: 1.0, afternoon: 1.0, morning: 1.0, blue: 1.0 };      // multiplier on the fill solved from keyToFill
const NIGHT_FILL = 0.23;     // fill irradiance (luminance) of the blue mode: sets its median luma
// Grade per light mode, handed to post as frame.light.grade (integration round; docs/post.md section 2). Morning: the
// calibrated albedos under a white sun and a blue fill left mud plaster and rolled-mud roofs a neutral grey-white
// (mean saturation 0.12 to 0.18, frames read as concrete); a little saturation and a warm balance bring the mud back
// without touching the exposure. The others are neutral.
const GRADE = {
  golden: { saturation: 1, contrast: 1, balance: [1, 1, 1] },
  afternoon: { saturation: 1, contrast: 1, balance: [1, 1, 1] },
  morning: { saturation: 1.22, contrast: 1.06, balance: [1.035, 1.0, 0.945] },
  blue: { saturation: 1, contrast: 1, balance: [1, 1, 1] },
};
// From high up by day the haze between the camera and the ground is thinned and the contrast raised a little: the
// opening panorama had its darkest values at 0.27 (reference 0.11 to 0.28, typically 0.14). [from, to] = camera level.
const HIGH_VIEW = { from: 300, to: 800, hazeCut: 0.42, contrast: 0.1 };
const HEMI_SHARE = 0.3;      // share of the fill carried by the hemisphere light (the rest: image-based)
const SKY_SHARE = 0.72;      // share of the image-based fill on a wall that comes from the sky (the rest: ground bounce)
const MOON_GAIN = 1.0;       // multiplier on world.json moon.intensity
const SUN_DISC = 95;         // radiance of the sun disc before the haze dims it (bloom threshold is 3)
const FIRE_GAIN = 8;         // point-light intensity of a fire of intensity 1
const GROUND_ALBEDO = new THREE.Color('#B9A27C');

// ---- cascade layout ------------------------------------------------------------------------------------------------
const Y_LO = -12, Y_HI = 100;            // slab that holds every shadow receiver (datum levels)
const Y_BULK = 34;                       // top of the bulk of the city: where a high camera's view "lands"
const SLICE_A = [42, 290, 2000];         // far depth of the three view slices for a camera in the city (m)
const SLICE_Q = [1.5, 2.3, 3.6];         // ... and as multiples of the landing depth for a camera above it
const REUSE_RADIUS = 800;                // maps at least this large are drawn once per output frame, not once per sub-frame
const SLICE4_A = [42, 130, 450, 2000];   // four slices instead, when the look target is so near that a hero map would repeat the first slice
const SLICE4_Q = [1.5, 2.0, 2.8, 3.8];
const HERO_K = 0.5, HERO_FROM = 60, HERO_MAX = 1024;  // the hero map: a sphere of HERO_K x distance around the look target, from 60 m radius up
const R_BASE = 8;                        // radii are rounded up to R_BASE x 2^(n/4): the texel size changes in steps, never drifts
const PENUMBRA_SUN = 0.34, PENUMBRA_MOON = 1.8;        // metres, near cascades
const TAPS = 16;

const vogel = (n) => Array.from({ length: n }, (_, i) => { const r = Math.sqrt((i + 0.5) / n), a = i * 2.39996323; return `vec2( ${(r * Math.cos(a)).toFixed(5)}, ${(r * Math.sin(a)).toFixed(5)} )`; }).join(', ');

// bblShadow( worldPos, worldNormal ): fraction of the key light that reaches a surface (1 = lit). For custom
// ShaderMaterials: #include <bbl_shadow_pars_fragment> and register with { shadows: true }.
THREE.ShaderChunk.bbl_shadow_pars_fragment = /* glsl */ `
#ifndef BBL_SHADOW_TAPS
	#define BBL_SHADOW_TAPS ${TAPS}
#endif
uniform sampler2DShadow uBCsmMap0;
uniform sampler2DShadow uBCsmMap1;
uniform sampler2DShadow uBCsmMap2;
uniform sampler2DShadow uBCsmMap3;
uniform mat4 uBCsmMatrix[ 4 ];   // world -> shadow uv and depth, finest map first
uniform vec4 uBCsmInfo[ 4 ];     // metres per texel, metres across the map, 1 / depth range (1/m), kernel radius (m)
uniform vec3 uBKeyDir;           // unit vector TO the key light (sun or moon)
uniform vec3 uBKeyRight;         // the shadow maps' u axis in the world
uniform vec3 uBKeyUp;            // the shadow maps' v axis in the world
uniform vec4 uBShadow;           // strength 0..1, rotation of this sub-frame 0..1, distance where shadows end (m), sub-frame index
const vec2 BBL_VOGEL[ ${TAPS} ] = vec2[ ${TAPS} ]( ${vogel(TAPS)} );
float bblCsmTap( int c, vec3 uvz ) {
	if ( c == 0 ) return texture( uBCsmMap0, uvz );
	if ( c == 1 ) return texture( uBCsmMap1, uvz );
	if ( c == 2 ) return texture( uBCsmMap2, uvz );
	return texture( uBCsmMap3, uvz );
}
float bblCsmSample( int c, vec3 P, vec3 N, float ndl, mat2 rot ) {
	vec4 info = uBCsmInfo[ c ];
	float sinT = sqrt( max( 1.0 - ndl * ndl, 0.0 ) );
	vec3 sc = ( uBCsmMatrix[ c ] * vec4( P + N * ( info.x * 1.4 * sinT + 0.012 ), 1.0 ) ).xyz;
	// depth of the receiver's own plane under each tap: a wide kernel on a slanted surface must not shadow itself
	vec2 slope = clamp( vec2( dot( N, uBKeyRight ), dot( N, uBKeyUp ) ) / max( ndl, 0.08 ), - 9.0, 9.0 ) * info.z;
	float ref = sc.z - ( 0.02 + 0.5 * info.x ) * info.z;
	float sum = 0.0;
	#if BBL_SHADOW_TAPS == ${TAPS}
	for ( int i = 0; i < ${TAPS}; i ++ ) {
		vec2 o = rot * BBL_VOGEL[ i ] * info.w;
		sum += bblCsmTap( c, vec3( sc.xy + o / info.y, ref + dot( slope, o ) ) );
	}
	#else
	for ( int i = 0; i < BBL_SHADOW_TAPS; i ++ ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( BBL_SHADOW_TAPS ) ), a = float( i ) * 2.39996323;
		vec2 o = rot * vec2( r * cos( a ), r * sin( a ) ) * info.w;
		sum += bblCsmTap( c, vec3( sc.xy + o / info.y, ref + dot( slope, o ) ) );
	}
	#endif
	return sum / float( BBL_SHADOW_TAPS );
}
float bblShadow( vec3 P, vec3 N ) {
	if ( uBShadow.x <= 0.0 ) return 1.0;
	float ndl = dot( N, uBKeyDir );
	if ( ndl <= 0.0 ) return 1.0;                       // faces away: the BRDF already gives no key light
	float fadeFar = 1.0 - smoothstep( 0.85 * uBShadow.z, uBShadow.z, distance( P, cameraPosition ) );
	if ( fadeFar <= 0.0 ) return 1.0;
	// interleaved gradient noise, shifted every sub-frame so that accumulation converges
	vec2 fc = gl_FragCoord.xy + 5.588238 * uBShadow.w;
	float a = 6.2831853 * ( fract( 52.9829189 * fract( dot( fc, vec2( 0.06711056, 0.00583715 ) ) ) ) + uBShadow.y );
	mat2 rot = mat2( cos( a ), sin( a ), - sin( a ), cos( a ) );
	float acc = 0.0, remaining = 1.0;
	for ( int c = 0; c < 4; c ++ ) {
		vec4 info = uBCsmInfo[ c ];
		vec3 sc = ( uBCsmMatrix[ c ] * vec4( P, 1.0 ) ).xyz;
		vec2 q = abs( sc.xy * 2.0 - 1.0 );
		float m = max( q.x, q.y );
		float edge = 1.0 - 2.0 * ( info.w + 2.5 * info.x ) / info.y;
		if ( m >= edge || sc.z <= 0.0 || sc.z >= 1.0 ) continue;
		// the finest map that holds the point wins; in its outer tenth it hands over to the next one
		float w = remaining * ( 1.0 - smoothstep( edge - 0.1, edge, m ) );
		acc += w * bblCsmSample( c, P, N, ndl, rot );
		remaining -= w;
		if ( remaining < 0.004 ) break;
	}
	return mix( 1.0, acc + remaining, uBShadow.x * fadeFar );
}
`;
// Built-in lit materials: the key light of the scene is multiplied by bblShadow() where three would have
// multiplied a directional light by its own shadow map.
THREE.ShaderChunk.bbl_shadow_light_pars_fragment = /* glsl */ `
uniform float uBFillBoost;
uniform float uBEnvDiffuse;
float bblKeyShadowCache = - 1.0;
float bblKeyShadow() {
	if ( bblKeyShadowCache < 0.0 ) bblKeyShadowCache = bblShadow( vBWorldPos, normalize( vBWorldNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 ) );
	return bblKeyShadowCache;
}
#if NUM_DIR_LIGHTS > 0
void bblDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
	getDirectionalLightInfo( directionalLight, light );
	if ( receiveShadow ) light.color *= bblKeyShadow();
}
#endif
`;

export async function create(ctx) {
  const L = ctx.world.lighting, scene = ctx.scene, renderer = ctx.renderer, LAYERS = ctx.LAYERS;
  const lat = L.site.lat * M.DEG, dec = L.solarDeclinationDeg * M.DEG, ROT = L.gridRotationFromTrueNorthDeg;
  const col = (hex) => new THREE.Color(hex);
  /** Scene radiance that post shows as the sRGB colour `hex` at the given exposure. */
  const displayToScene = (hex, exposure = 1) => acesInverse(col(hex)).multiplyScalar(1 / exposure);

  // ---- modes -------------------------------------------------------------------------------------------------------
  const moonRaw = L.modes.blue.moon;
  const moonDir = new THREE.Vector3(...M.dirFromAzEl(moonRaw.modelAzimuthDeg, moonRaw.elevationDeg));
  const moonColor = col(moonRaw.color), moonIntensity = moonRaw.intensity * MOON_GAIN;
  const modes = {};
  for (const [name, m] of Object.entries(L.modes)) {
    const el = m.sunElevationDeg * M.DEG, night = name === 'blue', ex = EXPOSURE[name];
    const cosH = M.clamp((Math.sin(el) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec)), -1, 1);
    const D = (hex) => displayToScene(hex, ex);
    const sunColor = col(m.sunColor);
    const keyLum = night ? lum(moonColor) * moonIntensity : lum(sunColor) * m.sunIntensity;
    const fillHex = night ? '#5A6CA0' : m.fillColor, fillColor = col(fillHex);
    const ag = m.afterglow || ['#F6E8C6', '#DCAD87', '#C68C76', '#6A5078'];
    const toward = m.skyTowardSun || (night ? ag[1] : '#F6F2EA');
    modes[name] = {
      name, raw: m, night,
      hourAngleDeg: Math.acos(cosH) * M.RAD * (m.sunTrueAzimuthDeg > 180 ? 1 : -1),
      sunColor, sunIntensity: m.sunIntensity,
      /** luminance of the fill irradiance on a wall that the key light does not reach */
      fillLum: (night ? NIGHT_FILL : solveFill(keyLum * 0.85, m.keyToFill, ex)) * FILL_GAIN[name],
      fillColor: fillColor.clone().multiplyScalar(1 / lum(fillColor)),     // the hemisphere's sky colour, luminance 1
      skyZenith: D(m.skyZenith), skyMid: D(m.skyMid), skyHorizon: D(m.skyHorizon), skyTowardSun: D(toward),
      glow: GLOW[name],
      // the haze toward the sun: by day the warm sky there; at night what the afterglow shows where it meets the horizon
      // (sky.js bblAfterglow just above the horizon: 0.3 x colour 0 + 0.7 x colour 1 in the sun's azimuth, colours 2 to 3 on the flanks)
      fogColor: D(m.fogColor), hazeLobe: HAZE_LOBE[name],
      hazeSunColor: night ? D(ag[0]).lerp(D(ag[1]), 0.7) : D(toward),
      hazeSunColor2: night ? D(ag[2]).lerp(D(ag[3]).lerp(D(m.skyHorizon), 0.4), 0.35) : D(toward),
      fogDensity: m.fogDensity,
      cloudColor: D(m.clouds.color), cloudShade: D(m.clouds.color).lerp(D(m.skyMid), 0.55), cloudCover: m.clouds.cover,
      cloudGlow: night ? D(ag[2]).multiplyScalar(0.5) : sunColor.clone().multiplyScalar(name === 'morning' ? 0.5 : 0.75),
      cloudOpacity: night ? 0.7 : name === 'morning' ? 0.72 : 0.85,
      after: ag.map((h, i) => (i === 3 ? displayToScene(h, EXPOSURE.blue).lerp(displayToScene(L.modes.blue.skyHorizon, EXPOSURE.blue), 0.4) : displayToScene(h, EXPOSURE.blue))),
      exposure: ex,
      // filled in by buildEnvironments(): groundColor (hemisphere), envIntensity, env (PMREM target), probe
      groundColor: col(0x000000), envIntensity: 1, env: null, hemiIntensity: 0,
    };
  }
  const modeNames = Object.keys(modes);

  /** Sun position for an hour angle (degrees, + = afternoon): { elevationDeg, azimuthDeg (MODEL), dir: [x, y, z] }. */
  function sunAtHourAngle(Hdeg) {
    const H = Hdeg * M.DEG;
    const E = -Math.cos(dec) * Math.sin(H), N = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(H) * Math.sin(lat);
    const U = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
    const elevationDeg = Math.asin(M.clamp(U, -1, 1)) * M.RAD, azimuthDeg = M.mod(Math.atan2(E, N) * M.RAD + ROT, 360);
    return { elevationDeg, azimuthDeg, dir: M.dirFromAzEl(azimuthDeg, elevationDeg) };
  }

  const DEEP = new THREE.Color(1.0, 0.33, 0.07);     // the sun through a long path of haze
  /**
   * Pure light state for a mode blend { a, b, k } (from ctx.film.lightAt(t)). The sun travels along its arc:
   * the hour angle is linear in k. Between two day modes everything else is linear in k as well. Between a day
   * mode and blue everything follows ONE weight derived from the sun's elevation (0 above +8 degrees, 1 at -3; a slow start,
   * so that the dusk of shot 8 fades evenly over the two seconds in which the sun sinks from 6 degrees to below the horizon):
   * sky, fog, exposure, fill, afterglow, stars, moon and `night` (the fire emissive factor).
   */
  function stateAt(spec) {
    const A = modes[spec.a] || modes.golden, B = modes[spec.b || spec.a] || A, k = M.clamp(spec.k || 0);
    let hB = B.hourAngleDeg;
    if (spec.wrapDawn && A.night && !B.night && hB < A.hourAngleDeg) hB += 360;
    const sun = sunAtHourAngle(M.lerp(A.hourAngleDeg, hB, k)), el = sun.elevationDeg;
    const dusk = Math.pow(M.clamp((8 - el) / 11), 1.8);                // the twilight weight: 0 above +8 degrees, 0.56 with the sun on the horizon, 1 at -3
    const night = A.night && B.night ? 1 : A.night !== B.night ? dusk : 0;
    const w = A.night === B.night ? k : B.night ? dusk : 1 - dusk;     // weight of B in every table
    const mix = (key) => A[key].clone().lerp(B[key], w);
    const num = (key) => M.lerp(A[key], B[key], w);
    // the sun itself: dimmer and redder as it sinks into the haze, gone just below the horizon
    const day = A.night ? B : A, sunFade = M.smoothstep(-0.3, 4, el), redden = M.smoothstep(9, 0, el) * (A.night === B.night ? 0 : 1);
    const sunColor = (A.night === B.night ? mix('sunColor') : day.sunColor.clone().lerp(modes.blue.sunColor, redden));
    const sunIntensity = (A.night === B.night ? num('sunIntensity') : day.sunIntensity) * (A.night && B.night ? 0 : sunFade);
    const moonI = moonIntensity * M.smoothstep(0.55, 1, night);
    const sunDir = new THREE.Vector3(...sun.dir);
    const sunIsKey = sunIntensity * lum(sunColor) >= moonI * lum(moonColor);
    const trans = Math.exp(-0.1 / Math.max(Math.sin(el * M.DEG) + 0.015, 0.004)) * M.smoothstep(-0.7, 0.4, el);
    const discColor = sunColor.clone().lerp(new THREE.Color(1, 1, 1), 0.35).lerp(DEEP, 1 - Math.sqrt(trans));
    const afterglow = M.smoothstep(0.2, 0.9, night);
    const s = {
      a: A.name, b: B.name, k, w,
      sunDir, sunElevationDeg: el, sunAzimuthDeg: sun.azimuthDeg, sunColor, sunIntensity,
      moonDir: moonDir.clone(), moonColor: moonColor.clone(), moonIntensity: moonI,
      keyDir: sunIsKey ? sunDir.clone() : moonDir.clone(), keyColor: sunIsKey ? sunColor.clone() : moonColor.clone(),
      keyIntensity: sunIsKey ? sunIntensity : moonI, keyIsMoon: !sunIsKey,
      fillColor: mix('fillColor'), groundColor: mix('groundColor'), fillIntensity: num('hemiIntensity'), fillLum: num('fillLum'),
      envIntensity: num('envIntensity'),
      skyZenith: mix('skyZenith'), skyMid: mix('skyMid'), skyHorizon: mix('skyHorizon'), skyTowardSun: mix('skyTowardSun'), glow: num('glow') * (1 - afterglow),
      fogColor: mix('fogColor'), hazeSunColor: mix('hazeSunColor'), hazeSunColor2: mix('hazeSunColor2'), hazeLobe: A.hazeLobe.map((v, i) => M.lerp(v, B.hazeLobe[i], w)),
      fogDensity: num('fogDensity'), fogHeightFalloff: 1 / HAZE.lowHeight,
      cloudColor: mix('cloudColor'), cloudShade: mix('cloudShade'), cloudGlow: mix('cloudGlow').multiplyScalar(A.night === B.night ? 1 : M.lerp(1, 0.5 + 0.5 * sunFade, 1 - night)),
      cloudCover: num('cloudCover'), cloudOpacity: num('cloudOpacity'),
      sunDisc: discColor.clone().multiplyScalar(SUN_DISC * trans), aureole: sunColor.clone().multiplyScalar(Math.sqrt(trans) * (1 - 0.6 * night)),
      moonDisc: moonColor.clone().multiplyScalar(1.9), moonAmount: M.smoothstep(0.3, 0.8, night),
      after: modes.blue.after, afterglow, stars: M.smoothstep(0.55, 1, night),
      night, exposure: num('exposure'),
      grade: {
        saturation: M.lerp(GRADE[A.name].saturation, GRADE[B.name].saturation, w), contrast: M.lerp(GRADE[A.name].contrast, GRADE[B.name].contrast, w),
        balance: GRADE[A.name].balance.map((v, i) => M.lerp(v, GRADE[B.name].balance[i], w)),
      },
    };
    return s;
  }

  // ---- scene objects ---------------------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.name = 'key'; sun.castShadow = false;           // shadows come from the cascades below, not from three's light
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  hemi.name = 'fill';
  for (const l of [sun, hemi]) l.layers.enableAll();  // lights are filtered by camera layers too (reflection pass!)
  scene.add(sun, sun.target, hemi);
  scene.fog = new THREE.FogExp2(0xffffff, 0.0003);    // keeps USE_FOG defined; points and sprites use it as it is
  const atmosphere = createAtmosphere(ctx), U = atmosphere.uniforms;
  const sky = createSky(ctx, U);
  scene.add(sky.mesh, sky.stars);

  // ---- cascades ------------------------------------------------------------------------------------------------------
  const mapSize = ctx.quality.shadowMapSize;
  const cascades = [];
  for (let i = 0; i < 4; i++) {
    const light = new THREE.DirectionalLight(0xffffff, 0);
    light.name = 'cascade' + i; light.castShadow = true; light.layers.enableAll();
    const depth = new THREE.DepthTexture(mapSize, mapSize, THREE.UnsignedIntType);
    depth.minFilter = depth.magFilter = THREE.LinearFilter; depth.compareFunction = THREE.LessEqualCompare; depth.name = `lighting.cascade${i}.depth`;
    const map = new THREE.WebGLRenderTarget(mapSize, mapSize, { format: THREE.RedFormat, type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true, stencilBuffer: false, depthTexture: depth });
    map.texture.name = `lighting.cascade${i}.unused`;
    light.shadow.mapSize.set(mapSize, mapSize); light.shadow.map = map; light.shadow.autoUpdate = true;
    cascades.push({ index: i, light, depth, reused: false, kind: 'slice', radius: 100, texel: 0.05, penumbra: PENUMBRA_SUN, center: new THREE.Vector3(), near: 1, far: 1000, zNear: 0, zFar: 0, calls: 0, triangles: 0 });
  }
  const SU = {
    uBCsmMap0: { value: cascades[0].depth }, uBCsmMap1: { value: cascades[1].depth }, uBCsmMap2: { value: cascades[2].depth }, uBCsmMap3: { value: cascades[3].depth },
    uBCsmMatrix: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
    uBCsmInfo: { value: [new THREE.Vector4(0.05, 200, 0.001, 0.2), new THREE.Vector4(0.05, 200, 0.001, 0.2), new THREE.Vector4(0.05, 200, 0.001, 0.2), new THREE.Vector4(0.05, 200, 0.001, 0.2)] },
    uBKeyDir: { value: new THREE.Vector3(0, 1, 0) }, uBKeyRight: { value: new THREE.Vector3(1, 0, 0) }, uBKeyUp: { value: new THREE.Vector3(0, 0, -1) },
    uBShadow: { value: new THREE.Vector4(0, 0, 3000, 0) },
    uBFillBoost: { value: 1 / HEMI_SHARE }, uBEnvDiffuse: { value: 1 },
  };
  const ALL_U = { ...U, ...SU };

  // TWO hooks, as ENGINE.md 5.5 says: 'shadows' (order 300: the cascade shadows, inserted around
  // <lights_fragment_begin>, which stays in place for everybody else) and 'aerial' (order 900: the aerial
  // perspective, which owns <fog_fragment>). skipHooks: ['aerial'] drops the air only, ['shadows'] the shadows only.
  // (SPLIT = false folds both into 'aerial', as the first version did while tests/hooks.js pinned the hook list.)
  const SPLIT = true;
  const reDirect = (m) => (m.isMeshStandardMaterial ? 'RE_Direct_Physical' : m.isMeshPhongMaterial ? 'RE_Direct_BlinnPhong' : m.isMeshToonMaterial ? 'RE_Direct_Toon' : 'RE_Direct_Lambert');
  function patchShadows(shader, m, patch) {
    patch.uniforms(SU);
    const re = reDirect(m);
    patch.fragment.after('<lights_pars_begin>', '#include <bbl_shadow_pars_fragment>\n#include <bbl_shadow_light_pars_fragment>');
    // a light that contributes nothing (a fire out of reach, the key light in full shadow) skips the BRDF
    patch.fragment.before('<lights_fragment_begin>', `#undef RE_Direct\n#define RE_Direct( dl, gp, gn, gv, gc, mt, rl ) if ( dl.color.r + dl.color.g + dl.color.b > 1e-6 ) { ${re}( dl, gp, gn, gv, gc, mt, rl ); }\n#if NUM_DIR_LIGHTS > 0\n#define getDirectionalLightInfo bblDirectionalLightInfo\n#endif`);
    // materials without image-based ambient (Lambert, Phong, Toon) get the whole fill from the hemisphere
    patch.fragment.after('<lights_fragment_begin>', `#if NUM_DIR_LIGHTS > 0\n#undef getDirectionalLightInfo\n#endif\n#undef RE_Direct\n#define RE_Direct ${re}\n#if defined( RE_IndirectDiffuse ) && ! defined( STANDARD )\n\tirradiance *= uBFillBoost;\n#endif`);
    // image-based light: reflections see the sky at its own radiance, the diffuse part is scaled to the fill of the mode
    patch.fragment.after('<lights_fragment_maps>', '#if defined( STANDARD ) && defined( USE_ENVMAP )\n\tiblIrradiance *= uBEnvDiffuse;\n#endif');
    // HDR scale (ENGINE.md section 1): nothing lit by sun, moon or fire may glow. A flat glossy face that mirrors
    // the low sun into the camera (the glazed summit temple from the roof of shot 8) reached a radiance of 3 and
    // more: one white, blooming rectangle. The DIRECT highlight is rolled off: unchanged up to 0.6, then compressed
    // toward 1.4. Water shades itself; a material opts out with register(mat, { noSpecularKnee: true }).
    if (m.isMeshStandardMaterial && !noKnee(ctx.materials.info(m))) patch.fragment.after('<lights_fragment_end>', '\t{ float bblSm = max( reflectedLight.directSpecular.r, max( reflectedLight.directSpecular.g, reflectedLight.directSpecular.b ) );\n\t  if ( bblSm > 0.6 ) reflectedLight.directSpecular *= ( 0.6 + ( bblSm - 0.6 ) / ( 1.0 + ( bblSm - 0.6 ) / 0.8 ) ) / bblSm; }');
  }
  const noKnee = (info) => !!(info && (info.water || info.noSpecularKnee));
  function patchAerial(shader, m, patch) {
    patch.uniforms(U);
    patch.fragment.after('<fog_pars_fragment>', '#include <bbl_aerial_pars_fragment>');
    patch.fragment.replace('<fog_fragment>', '#include <bbl_aerial_fragment>');
  }
  const wantsShadows = (m, info) => (ctx.materials.isLit(m) && !(info && info.noShadows)) || (m.isShaderMaterial && info && info.shadows === true);
  const wantsAerial = (m, info) => ctx.materials.isBuiltIn(m) || (m.isShaderMaterial && info && info.aerial === true);
  ctx.materials.addHook({
    name: 'aerial', order: 900,
    filter: (m, info) => wantsAerial(m, info) || (!SPLIT && wantsShadows(m, info)),
    apply(m, info) {
      if (!m.isShaderMaterial) return;
      if (wantsAerial(m, info)) Object.assign(m.uniforms, U);
      if (!SPLIT && wantsShadows(m, info)) Object.assign(m.uniforms, SU);
    },
    shader(shader, m, r, patch) {
      if (m.isShaderMaterial) return;
      if (!SPLIT && wantsShadows(m, ctx.materials.info(m))) patchShadows(shader, m, patch);
      patchAerial(shader, m, patch);
    },
    key: (m, info) => (info && info.noShadows ? 'ns' : 's') + (info && info.shadows ? 'S' : '') + (info && info.aerial ? 'A' : ''),
  });
  if (SPLIT) ctx.materials.addHook({
    name: 'shadows', order: 300, filter: wantsShadows,
    key: (m, info) => (noKnee(info) ? 'k0' : 'k1'),
    apply(m) { if (m.isShaderMaterial) Object.assign(m.uniforms, SU); },
    shader(shader, m, r, patch) { if (!m.isShaderMaterial) patchShadows(shader, m, patch); },
  });

  // The shadow pass. three's WebGLShadowMap.render(lights, scene, camera) does the work; it needs to run inside
  // a renderer.render() call, so an empty private scene is rendered into a 1 x 1 target and the cascades are
  // drawn from its onAfterRender. The cascade lights are NOT in ctx.scene: no shader program ever sees them, and
  // no other pass (reflection, GTAO ...) can rebuild or disturb the maps.
  const trigScene = new THREE.Scene(); trigScene.name = 'lighting.shadowTrigger'; trigScene.matrixWorldAutoUpdate = false;
  const trigCam = new THREE.PerspectiveCamera(1, 1, 1, 2);
  const trigTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const layerCam = new THREE.PerspectiveCamera();      // only its layer mask is read by the shadow pass
  let shadowPasses = 0, cascadesRendered = 0;
  const cascadeListeners = new Set(), casterLimits = [];
  const shadowState = { enabled: true, far: SLICE_A[2], reuse: null, canReuse: true };

  // ---- image-based ambient ---------------------------------------------------------------------------------------------
  const envSize = ctx.quality.draft ? 128 : 256;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cubeRT = new THREE.WebGLCubeRenderTarget(envSize, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(0.1, 10, cubeRT);
  let envRT = null;
  const blendU = { tA: { value: null }, tB: { value: null }, uK: { value: 0 } };
  const blendMat = new THREE.ShaderMaterial({
    name: 'lighting.envBlend', uniforms: blendU, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: 'varying vec2 vUv; uniform sampler2D tA, tB; uniform float uK; void main() { gl_FragColor = mix( texture2D( tA, vUv ), texture2D( tB, vUv ), uK ); }',
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const blendQuad = new THREE.Mesh(tri, blendMat); blendQuad.frustumCulled = false;
  const blendCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let envKey = '';

  /** (Re)build the PMREM of every mode and scale it so that the fill has the key : fill ratio of the mode. */
  function buildEnvironments() {
    const prevAuto = renderer.autoClear; renderer.autoClear = true;
    for (const name of modeNames) {
      const mode = modes[name];
      const st = stateAt({ a: name, b: name, k: 0 });
      sky.update(st, null); atmosphere.apply(st, null);
      const pr = sky.probe();
      const envFill = mode.fillLum * (1 - HEMI_SHARE);
      const scale = envFill * SKY_SHARE / Math.max(lum(pr.horiz), 1e-6);
      // the ground the dome lacks: sunlit earth (about half of it in shadow at these sun heights) plus what the sky gives it
      const sunDown = mode.night ? 0 : mode.sunIntensity * Math.sin(mode.raw.sunElevationDeg * M.DEG) * 0.55;
      const tint = mode.sunColor.clone().multiplyScalar(sunDown).add(pr.up.clone().multiplyScalar(scale)).multiply(GROUND_ALBEDO);
      const groundLum = envFill * (1 - SKY_SHARE) * 2 / Math.PI;
      const ground = tint.multiplyScalar(groundLum / Math.max(lum(tint), 1e-9));
      sky.capture(cubeCam, ground.clone().multiplyScalar(1 / scale));
      if (mode.env) mode.env.dispose();
      mode.env = pmrem.fromCubemap(cubeRT.texture);
      mode.env.texture.name = `lighting.env.${name}`;
      mode.envIntensity = scale;
      // hemisphere: sky colour above, the same warm ground below; on a wall it gives HEMI_SHARE of the fill
      mode.groundColor = ground.clone().multiplyScalar(0.7 / Math.max(lum(ground), 1e-9));
      mode.hemiIntensity = mode.fillLum * HEMI_SHARE / (0.5 * (1 + 0.7));
      mode.probe = { skyUp: lum(pr.up) * scale, skyWall: lum(pr.horiz) * scale, groundWall: groundLum * Math.PI / 2, hemiWall: mode.fillLum * HEMI_SHARE, fillLum: mode.fillLum, scale };
    }
    renderer.autoClear = prevAuto;
    const ref = modes[modeNames[0]].env;
    if (!envRT) {
      envRT = new THREE.WebGLRenderTarget(ref.width, ref.height, { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
      envRT.texture.mapping = THREE.CubeUVReflectionMapping; envRT.texture.name = 'lighting.environment';
    }
    envKey = '';
  }
  function blendEnvironment(s) {
    const key = `${s.a}|${s.b}|${s.w.toFixed(5)}`;
    if (key === envKey) return;
    envKey = key;
    const prev = renderer.getRenderTarget();
    blendU.tA.value = modes[s.a].env.texture; blendU.tB.value = modes[s.b].env.texture; blendU.uK.value = s.a === s.b ? 0 : s.w;
    renderer.setRenderTarget(envRT); renderer.render(blendQuad, blendCam); renderer.setRenderTarget(prev);
  }
  buildEnvironments();
  scene.environment = envRT.texture;

  // ---- fire lights: a FIXED pool of point lights (their number is compiled into every lit shader program) ------
  const FIRE_POOL = 12, fireColor = col(L.modes.blue.fires.lampColor);
  const fireSources = [], firePool = [];
  for (let i = 0; i < FIRE_POOL; i++) {
    const pl = new THREE.PointLight(fireColor, 0, 20, 2);
    pl.name = 'fire' + i; pl.castShadow = false; pl.layers.enableAll(); pl.position.set(0, -1000, 0); pl.visible = false;
    scene.add(pl); firePool.push(pl);
  }
  let fireId = 0;

  // ---- cascade fitting -------------------------------------------------------------------------------------------------
  const _Y = new THREE.Vector3(0, 1, 0), _X = new THREE.Vector3(1, 0, 0);
  const _pos = new THREE.Vector3(), _fwd = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _c = new THREE.Vector3();
  const _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const quant = (R) => R_BASE * Math.pow(2, Math.ceil(Math.log2(Math.max(R, R_BASE) / R_BASE) * 4 - 1e-6) / 4);
  /** Bounding sphere (Ritter) of a list of [x, y, z]. */
  function boundPoints(pts) {
    let a = pts[0], b = pts[0], dm = -1;
    for (const p of pts) { const d = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2 + (p[2] - a[2]) ** 2; if (d > dm) { dm = d; b = p; } }
    a = b; dm = -1; let c2 = a;
    for (const p of pts) { const d = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2 + (p[2] - a[2]) ** 2; if (d > dm) { dm = d; c2 = p; } }
    let cx = (a[0] + c2[0]) / 2, cy = (a[1] + c2[1]) / 2, cz = (a[2] + c2[2]) / 2, r = Math.sqrt(dm) / 2;
    for (const p of pts) {
      const d = Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz);
      if (d > r) { const nr = (r + d) / 2, k = (d - nr) / d; cx += (p[0] - cx) * k; cy += (p[1] - cy) * k; cz += (p[2] - cz) * k; r = nr; }
    }
    return { center: [cx, cy, cz], radius: r };
  }
  // debug only (tests/…, docs/lighting.md "proof of stability"): fit the maps for another camera pose, switch the snap off
  const debug = { fitPose: null, snap: true };
  function fitCascades(frame, s) {
    const cam = debug.fitPose || frame.camera, aspect = ctx.camera.aspect || ctx.size.width / ctx.size.height;
    _pos.fromArray(cam.pos); _fwd.fromArray(cam.look).sub(_pos);
    const lookDist = Math.max(_fwd.length(), 1e-3); _fwd.multiplyScalar(1 / lookDist);
    _up.fromArray(cam.up || [0, 1, 0]); _rt.crossVectors(_fwd, _up);
    if (_rt.lengthSq() < 1e-8) _rt.crossVectors(_fwd, _X);
    _rt.normalize(); _up.crossVectors(_rt, _fwd);
    const tanV = Math.tan((cam.fov * M.DEG) / 2), tanH = tanV * aspect, near = cam.near || 0.3;
    const corner = (sx, sy, z) => [
      _pos.x + (_fwd.x + _rt.x * sx * tanH + _up.x * sy * tanV) * z,
      _pos.y + (_fwd.y + _rt.y * sx * tanH + _up.y * sy * tanV) * z,
      _pos.z + (_fwd.z + _rt.z * sx * tanH + _up.z * sy * tanV) * z];
    // light basis: the same axes three's shadow camera will have (right = Y x L, up = L x right)
    const Ld = s.keyDir;
    _lr.crossVectors(_Y, Ld); if (_lr.lengthSq() < 1e-8) _lr.copy(_X); _lr.normalize(); _lu.crossVectors(Ld, _lr).normalize();
    const override = frame.shadow && frame.shadow.radius;
    const list = [];
    let far = 1e9;
    if (override) {
      // an explicit extent (plan stills): four maps side by side around the look target, one texel size everywhere
      const R = override / 2;
      for (let i = 0; i < 4; i++) {
        _c.fromArray(cam.look).addScaledVector(_lr, (i & 1 ? 1 : -1) * R).addScaledVector(_lu, (i & 2 ? 1 : -1) * R);
        list.push({ kind: 'tile', center: _c.toArray(), radius: R * 1.04, zNear: 0, zFar: 0 });
      }
    } else {
      // where the view lands on the city: the smallest view depth at which the frustum reaches down to Y_BULK
      let d0 = near;
      if (_pos.y > Y_BULK) {
        let zMin = Infinity;
        for (const [sx, sy] of [[-1, -1], [1, -1], [0, -1], [-1, 1], [1, 1]]) {
          const dy = _fwd.y + _rt.y * sx * tanH + _up.y * sy * tanV;
          if (dy < -1e-6) zMin = Math.min(zMin, (Y_BULK - _pos.y) / dy);
        }
        if (Number.isFinite(zMin)) d0 = M.clamp(zMin, near, 20000);
      }
      const hero = HERO_K * lookDist >= HERO_FROM, SA = hero ? SLICE_A : SLICE4_A, SQ = hero ? SLICE_Q : SLICE4_Q;
      const splits = SA.map((a, i) => Math.max(d0 + a, d0 * SQ[i]));
      far = splits[splits.length - 1];
      let zn = d0 * 0.96;
      for (let i = 0; i < splits.length; i++) {
        const zf = splits[i];
        const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [corner(sx, sy, zn), corner(sx, sy, zf)]);
        const edges = [];
        for (let j = 0; j < 4; j++) { const n = (j + 1) % 4; edges.push([P[j][0], P[n][0]], [P[j][1], P[n][1]], [P[j][0], P[j][1]]); }
        const pts = [];
        for (const [p, q] of edges) {
          const dy = q[1] - p[1];
          let t0 = 0, t1 = 1;
          if (Math.abs(dy) < 1e-9) { if (p[1] < Y_LO || p[1] > Y_HI) continue; }
          else { const ta = (Y_LO - p[1]) / dy, tb = (Y_HI - p[1]) / dy; t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb)); if (t0 > t1) continue; }
          pts.push([p[0] + (q[0] - p[0]) * t0, p[1] + dy * t0, p[2] + (q[2] - p[2]) * t0], [p[0] + (q[0] - p[0]) * t1, p[1] + dy * t1, p[2] + (q[2] - p[2]) * t1]);
        }
        const bs = boundPoints(pts.length >= 2 ? pts : P.flat());
        list.push({ kind: 'slice', center: bs.center, radius: bs.radius * 1.02 + 0.3, zNear: zn, zFar: zf });
        zn = zf * 0.9;
      }
      // the hero map: what the camera looks at, wherever the slices happen to put their seams
      const hy = M.clamp(cam.look[1], Y_LO + 6, Y_HI - 20);
      if (hero) list.push({ kind: 'hero', center: [cam.look[0], hy, cam.look[2]], radius: Math.min(HERO_K * lookDist, HERO_MAX), zNear: lookDist, zFar: lookDist });
    }
    for (const c of list) c.radius = override ? c.radius : quant(c.radius);
    list.sort((p, q) => p.radius - q.radius || (p.kind < q.kind ? -1 : 1));
    const el = Math.max(Math.asin(M.clamp(Ld.y, -1, 1)), 0.03);
    const reach = Math.min((Y_HI - Y_LO + 10) / Math.sin(el), 7000);      // how far toward the light a caster can stand
    const pen0 = s.keyIsMoon ? PENUMBRA_MOON : PENUMBRA_SUN;
    // inside one output frame (sub-frames 1..n-1) the large maps of sub-frame 0 are kept: the camera moves a few
    // metres and the sun a fraction of a degree in half a frame interval, far less than one of their texels
    const ru = shadowState.reuse, sub = frame.sub || 0;
    const chain = shadowState.canReuse && sub > 0 && ru && ru.rendered && ru.tFrame === frame.tFrame && ru.sub === sub - 1 && ru.dir.dot(Ld) > 0.99995 && !override;
    shadowState.reuse = { tFrame: frame.tFrame, sub, dir: chain ? ru.dir : Ld.clone(), rendered: false };
    for (let i = 0; i < 4; i++) {
      const c = cascades[i], f = list[i], R = f.radius, texel = (2 * R) / mapSize;
      if (chain && c.radius >= REUSE_RADIUS && c.kind === f.kind && c.radius === R && c.center.distanceTo(_c.fromArray(f.center)) < 0.05 * R) { c.reused = true; continue; }
      c.reused = false;
      // snap the centre to whole texels along the map's axes (and to whole metres along the light), so the
      // texel grid is fixed in the world while the camera moves
      _c.fromArray(f.center);
      const snap = debug.snap ? Math.round : (v) => v;
      const r = snap(_c.dot(_lr) / texel) * texel, u = snap(_c.dot(_lu) / texel) * texel, d = snap(_c.dot(Ld));
      _c.set(0, 0, 0).addScaledVector(_lr, r).addScaledVector(_lu, u).addScaledVector(Ld, d);
      const light = c.light, sc = light.shadow.camera, dist = R + reach;
      light.target.position.copy(_c); light.position.copy(_c).addScaledVector(Ld, dist);
      light.updateMatrixWorld(true); light.target.updateMatrixWorld(true);
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = dist + R + 60; sc.updateProjectionMatrix();
      light.shadow.updateMatrices(light);
      c.kind = f.kind; c.radius = R; c.texel = texel; c.center.copy(_c); c.near = sc.near; c.far = sc.far; c.zNear = f.zNear; c.zFar = f.zFar;
      c.penumbra = Math.max(pen0, 2.4 * texel);
      SU.uBCsmMatrix.value[i].copy(light.shadow.matrix);
      SU.uBCsmInfo.value[i].set(texel, 2 * R, 1 / (sc.far - sc.near), c.penumbra / 2);
    }
    SU.uBKeyDir.value.copy(Ld); SU.uBKeyRight.value.copy(_lr); SU.uBKeyUp.value.copy(_lu);
    shadowState.far = far;
  }

  // ---- per-frame ---------------------------------------------------------------------------------------------------
  const nightListeners = new Set();
  let toneChecked = false;
  const lighting = {
    impl: 'real',
    debug,
    modes, modeNames,
    stateAt, sunAtHourAngle,
    /** Latest state applied by update(); same object as ctx.frame.light. */
    state: null,
    /** The key light of the scene (sun by day, moon at night; NOT a three.js shadow caster), the hemisphere fill, the sky dome mesh. */
    sun, hemi, sky: sky.mesh,
    /** The round star points (layer SKY), the dome's uniforms, the seeded noise texture the clouds use. */
    stars: sky.stars, skyUniforms: sky.uniforms, noiseTexture: sky.noise,
    /**
     * Shadow maps. cascades: 4. lights: the four shadow cameras' lights (NOT in the scene). texel / radius: of the
     * finest and of the coarsest map of the last update. info: [{ kind: 'slice' | 'hero' | 'tile', radius, texel,
     * penumbra, center, zNear, zFar, calls, triangles }] finest first (calls and triangles: of the last shadow pass).
     */
    shadow: {
      cascades: 4, mapSize, lights: cascades.map((c) => c.light), texel: 0, radius: 0, info: cascades, taps: TAPS,
      get enabled() { return shadowState.enabled; }, set enabled(v) { shadowState.enabled = !!v; },
      /** true (default): maps with a radius of 800 m or more are drawn in sub-frame 0 and kept for the other sub-frames of the output frame. */
      get reuse() { return shadowState.canReuse; }, set reuse(v) { shadowState.canReuse = !!v; },
      get far() { return shadowState.far; },
      /** Draw calls of the last shadow pass, all four maps. */
      get calls() { return cascades.reduce((a, c) => a + c.calls, 0); },
      get rendered() { return cascadesRendered; },
    },
    /** PMREM texture of the sky for the current state (also scene.environment). environments[mode]: the per-mode targets. */
    environment: envRT.texture,
    get environments() { return Object.fromEntries(modeNames.map((n) => [n, modes[n].env])); },
    /** Uniform objects of the aerial chunk and of the shadow chunk (attached by register(mat, { aerial: true }) / { shadows: true }). */
    uniforms: ALL_U, aerialUniforms: U, shadowUniforms: SU,
    atmosphere,
    /** Scene radiance that the finished frame shows as the sRGB colour `hex` at `exposure` (ACES filmic). */
    displayToScene,
    /** Fraction of a surface's radiance that survives the air from `from` (camera) to `to`, both [x, y, z]: the GLSL bblAerialFade on the CPU. */
    aerialFade: (from, to) => atmosphere.fade(from, to),
    /** fn(night 0..1, state) is called on every update(). Returns an unsubscribe function. */
    onNight(fn) { nightListeners.add(fn); return () => nightListeners.delete(fn); },
    /** fn(index, cascade) is called before each shadow map is drawn (hide what need not cast into a coarse map). Returns an unsubscribe function. */
    onShadowCascade(fn) { cascadeListeners.add(fn); return () => cascadeListeners.delete(fn); },
    /** Let `object` cast only into shadow maps whose texel is at most maxTexel metres (small props: 0.15; people: 0.3). Returns { remove() }. */
    limitShadow(object, maxTexel) {
      const rec = { object, maxTexel, remove() { const i = casterLimits.indexOf(rec); if (i >= 0) casterLimits.splice(i, 1); } };
      casterLimits.push(rec); return rec;
    },
    /**
     * Register a fire (brazier, torch, hearth, fire bowl, lamp cluster) as a LIGHT SOURCE for its surroundings.
     * The flame itself is drawn by nightfx. Never add THREE lights to the scene: lighting keeps a pool of
     * fireLights.max point lights (no shadows) and gives it, every sub-frame, to the registered fires that
     * matter most to the camera (bright, near, in view); a fire that is about to lose its light has already
     * faded to nothing, so nothing pops.
     * spec: { pos: [x, y, z] | (t) => [x, y, z] | null (pure), color?: hex (default world.json fires.lampColor),
     *         intensity?: 1 (1 = an oil-lamp cluster or small hearth, 3 = a brazier, 5 = a big fire bowl or torch pair),
     *         reach?: metres (default 7; world.json fires.reach: lamp 3, brazier 7, torch 10), flicker?: 0..1 (default 0.25),
     *         day?: false (true: also lit by day) }
     * Returns { id, remove() }.
     */
    addFireLight(spec) {
      const src = { id: ++fireId, pos: spec.pos, color: spec.color !== undefined ? col(spec.color) : fireColor, intensity: spec.intensity ?? 1, reach: spec.reach ?? 7, flicker: spec.flicker ?? 0.25, day: !!spec.day,
        remove() { const i = fireSources.indexOf(src); if (i >= 0) fireSources.splice(i, 1); } };
      fireSources.push(src);
      return src;
    },
    /** { max: size of the pool, sources: registered fires (live), active: ids lit in the last update, weights: their fade 0..1, gain } */
    fireLights: { max: FIRE_POOL, sources: fireSources, active: [], weights: [], gain: FIRE_GAIN },
    /**
     * Render the shadow maps for this sub-frame. Called by post.renderFrame() once per sub-frame, after
     * ctx.update() and before the pre-passes and the main pass (which then all sample the same maps).
     */
    renderShadows(frame) {
      shadowPasses++;
      const s = lighting.state;
      const on = shadowState.enabled && s && s.keyIntensity * lum(s.keyColor) > 1e-4;
      SU.uBShadow.value.x = on ? 1 : 0;
      if (!on) { for (const c of cascades) { c.calls = 0; c.triangles = 0; } return; }
      const r = renderer, sm = r.shadowMap, prevRT = r.getRenderTarget(), prevEnabled = sm.enabled, prevType = sm.type, prevNeeds = sm.needsUpdate;
      layerCam.layers.mask = ctx.post ? ctx.post.mainLayers.mask : 1;
      if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();   // modules moved things in update(); three has not seen it yet
      trigScene.onAfterRender = () => {
        sm.enabled = true; if (sm.type === THREE.VSMShadowMap) sm.type = THREE.PCFSoftShadowMap;
        // a limit only ever switches a caster OFF for the coarse maps: what geom's shadowFar (or the module) decided stays
        for (const l of casterLimits) l.base = l.object.castShadow;
        for (const c of cascades) {
          if (c.reused) { c.calls = 0; c.triangles = 0; continue; }
          for (const fn of cascadeListeners) fn(c.index, c);
          for (const l of casterLimits) l.object.castShadow = l.base && c.texel <= l.maxTexel;
          const c0 = r.info.render.calls, t0 = r.info.render.triangles;
          sm.needsUpdate = true;
          sm.render([c.light], scene, layerCam);
          c.calls = r.info.render.calls - c0; c.triangles = r.info.render.triangles - t0;
          cascadesRendered++;
        }
        for (const l of casterLimits) l.object.castShadow = l.base;
        if (shadowState.reuse) shadowState.reuse.rendered = true;
      };
      r.setRenderTarget(trigTarget);
      r.render(trigScene, trigCam);
      r.setRenderTarget(prevRT);
      sm.enabled = prevEnabled; sm.type = prevType; sm.needsUpdate = prevNeeds;
    },
    get shadowPasses() { return shadowPasses; },
    /** Rebuild the per-mode environments (the sky captures and their scaling). Not needed in normal use. */
    rebuildEnvironments() { buildEnvironments(); },
    /**
     * Apply the light state of this frame: key light, fill, environment, sky, air, exposure, cascades, fire pool.
     * Reads frame.lightSpec ({ a, b, k }), frame.camera, frame.fog, frame.shadow, frame.sub; sets frame.light.
     */
    update(frame) {
      if (!toneChecked && ctx.post) {
        toneChecked = true;
        if (ctx.post.tone && ctx.post.tone.operator && ctx.post.tone.operator !== 'aces') ctx.stats.warnings.push(`lighting: sky, fog and cloud colours are calibrated for the ACES filmic curve, post.tone.operator is '${ctx.post.tone.operator}'`);
      }
      const s = stateAt(frame.lightSpec);
      lighting.state = s; frame.light = s;
      const cam = frame.camera;
      // the view from high up by day (HIGH_VIEW): thinner haze, a little more contrast
      const high = M.smoothstep(HIGH_VIEW.from, HIGH_VIEW.to, cam.pos[1]) * (1 - s.night);
      if (high > 0) { s.fogDensity *= 1 - HIGH_VIEW.hazeCut * high; s.grade.contrast *= 1 + HIGH_VIEW.contrast * high; }
      // key and fill
      sun.color.copy(s.keyColor); sun.intensity = s.keyIntensity;
      sun.target.position.set(cam.look[0], 0, cam.look[2]); sun.position.copy(sun.target.position).addScaledVector(s.keyDir, 5000);
      hemi.color.copy(s.fillColor); hemi.groundColor.copy(s.groundColor); hemi.intensity = s.fillIntensity;
      blendEnvironment(s);
      scene.environment = envRT.texture; scene.environmentIntensity = 1; SU.uBEnvDiffuse.value = s.envIntensity;
      // air and sky
      atmosphere.apply(s, frame); sky.update(s, frame);
      const off = frame.fog === 0, mul = frame.fog === null || frame.fog === undefined ? 1 : frame.fog;
      scene.fog.color.copy(s.fogColor);
      scene.fog.density = off ? 0 : Math.sqrt(Math.max(atmosphere.densityAt(cam.pos[1]) * mul, 0) / 1500);   // FogExp2 (points, sprites): the same value at 1.5 km
      renderer.toneMappingExposure = s.exposure;
      // shadows
      fitCascades(frame, s);
      const sub = frame.sub || 0;
      SU.uBShadow.value.set(shadowState.enabled && s.keyIntensity * lum(s.keyColor) > 1e-4 ? 1 : 0, (sub * 0.61803398875) % 1, shadowState.far, sub);
      lighting.shadow.texel = cascades[0].texel; lighting.shadow.radius = cascades[3].radius;
      // fire pool: importance = brightness x reach^2 / distance^2, higher in view; a pure function of the frame
      const t = frame.t, cp = cam.pos, cand = [];
      _fwd.fromArray(cam.look).sub(_pos.fromArray(cp)).normalize();
      for (const src of fireSources) {
        const kn = src.day ? 1 : s.night; if (kn <= 0.001) continue;
        const p = typeof src.pos === 'function' ? src.pos(t) : src.pos; if (!p) continue;
        const dx = p[0] - cp[0], dy = p[1] - cp[1], dz = p[2] - cp[2], d = Math.max(Math.hypot(dx, dy, dz), 1e-3);
        const view = 0.2 + 0.8 * M.smoothstep(0.26, 0.7, (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / d);
        const rr = Math.max(src.reach, 1);
        cand.push({ src, p, kn, score: src.intensity * view * (rr * rr) / Math.max(d * d, rr * rr) });
      }
      cand.sort((p, q) => q.score - p.score || p.src.id - q.src.id);
      const cut = cand.length > FIRE_POOL ? cand[FIRE_POOL].score : 0;
      const fl = lighting.fireLights; fl.active = []; fl.weights = [];
      let any = false;
      for (let i = 0; i < FIRE_POOL; i++) {
        const pl = firePool[i], c = cand[i];
        if (!c) { pl.intensity = 0; continue; }
        const wgt = cut > 0 ? M.smoothstep(0, 1, (c.score - cut) / (0.4 * c.score + 1e-12)) : 1;
        const flick = 1 + c.src.flicker * (0.55 * Math.sin(t * 13.1 + c.src.id * 7.31) + 0.45 * Math.sin(t * 31.7 + c.src.id * 2.17));
        pl.position.set(c.p[0], c.p[1], c.p[2]); pl.color.copy(c.src.color);
        pl.intensity = FIRE_GAIN * c.src.intensity * c.kn * flick * wgt; pl.distance = c.src.reach * 2.4;
        if (pl.intensity > 0) { any = true; fl.active.push(c.src.id); fl.weights.push(wgt); }
      }
      // by day the pool is not in the scene at all: lit shaders are compiled for 0 point lights
      for (const pl of firePool) pl.visible = any;
      for (const fn of nightListeners) fn(s.night, s);
      return s;
    },
  };
  return lighting;
}
