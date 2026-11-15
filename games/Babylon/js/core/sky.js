// js/core/sky.js — part of subsystem "lighting". OWNER: lighting engineer. Notes: docs/lighting.md.
//
// The sky dome: a three-stop gradient that is reached within 30 degrees of the horizon (the film never looks
// higher), a warm lobe toward the sun, an HDR sun disc with a small aureole, a haze band that is exactly
// bblHazeColor(dir) at and below the horizon (so far ground and sky cannot differ), two layers of streaky cirrus
// mapped on curved shells, and for the night: afterglow, moon with its real phase, Milky Way, and about 400
// stars as round points. The same shader, with the sun disc off and a ground hemisphere, is rendered into a
// cube for the image-based ambient (capture()) and into six small float targets to measure irradiance (probe()).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { HAZE } from './atmosphere.js';

/** GLSL shared by the dome and the star points: value noise from a texture, the cloud shells, the afterglow weight. */
const SKY_COMMON = /* glsl */ `
uniform sampler2D tNoise;
uniform vec4 uCloudA;     // layer A: streak direction (x, z), feature length along / across the streak (km)
uniform vec4 uCloudB;     // layer B
uniform vec4 uCloudP;     // threshold A, threshold B, opacity, drift (km)
uniform vec4 uNight;      // night 0..1, milky way amount, moon amount, afterglow amount
float bblVN( vec2 x ) {
	vec2 i = floor( x ), f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return textureLod( tNoise, ( i + f + 0.5 ) / 256.0, 0.0 ).r;
}
// where a view ray meets a shell h km above a (small, for a pleasing curvature) planet: km east / south of the camera
vec2 bblCloudPlane( vec3 d, float h ) {
	const float R = 1500.0;
	float s = max( d.y, - 0.01 );
	return d.xz * ( - R * s + sqrt( R * R * s * s + 2.0 * R * h + h * h ) );
}
float bblCirrus( vec3 d, float h, vec4 lay, float th, float seed ) {
	vec2 p = bblCloudPlane( d, h );
	float fine = clamp( 55.0 / max( length( p ), 1.0 ), 0.0, 1.0 );       // far away the small octaves would only shimmer
	p += lay.xy * uCloudP.w;
	vec2 q0 = vec2( dot( p, lay.xy ) / lay.z, dot( p, vec2( - lay.y, lay.x ) ) / lay.w ) + seed;
	vec2 q = q0;
	float field = bblVN( q * 0.21 + 3.7 );                                   // where the bands are
	vec2 w = vec2( bblVN( q * 0.55 + 31.7 ), bblVN( q * 0.55 + 58.3 ) ) - 0.5;
	q += w * vec2( 1.2, 1.6 );
	float f = 0.0, a = 0.5;
	for ( int i = 0; i < 5; i ++ ) { f += a * mix( 0.5, bblVN( q ), i < 3 ? 1.0 : fine ); q = q * vec2( 1.93, 2.27 ) + 19.7; a *= 0.45; }
	f += ( field - 0.5 ) * 0.7;
	float dens = smoothstep( th - 0.01, th + 0.22, f );
	// fibres along the streak comb the edges: cirrus has no outline
	float fib = bblVN( vec2( q0.x * 1.3, q0.y * 9.0 ) + 71.3 ) * 0.65 + bblVN( vec2( q0.x * 2.9, q0.y * 23.0 ) + 13.1 ) * 0.35;
	return clamp( dens * ( 0.45 + 1.1 * mix( 0.5, fib, fine ) ), 0.0, 1.0 );
}
// both layers: x = combined opacity 0..1, y = density of the lower layer alone
vec2 bblClouds( vec3 d ) {
	float a = bblCirrus( d, 8.5, uCloudA, uCloudP.x, 0.0 );
	float b = bblCirrus( d, 11.5, uCloudB, uCloudP.y, 43.0 ) * 0.7;
	return vec2( 1.0 - ( 1.0 - a ) * ( 1.0 - b ), a );
}
// afterglow: x = weight 0..1, y = radial coordinate (0 core .. 1 edge and beyond) around the sun's place below the horizon.
// A twilight arch: widest along the horizon, narrowing upward, with no outline.
vec2 bblAfterglow( vec3 d, vec3 sunDir ) {
	vec2 a = normalize( d.xz + vec2( 1e-5, 0.0 ) ), b = normalize( sunDir.xz + vec2( 1e-5, 0.0 ) );
	float dAz = acos( clamp( dot( a, b ), - 1.0, 1.0 ) );
	float el = asin( clamp( d.y, - 1.0, 1.0 ) ), sunEl = asin( clamp( sunDir.y, - 1.0, 1.0 ) );
	float v = max( el - sunEl, 0.0 ) / 0.30;
	float r = length( vec2( dAz / ( 1.15 - 0.55 * min( v, 1.0 ) ), v ) );
	return vec2( uNight.w * exp( - 1.25 * r * r * r ), r );
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
	gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
#include <common>
varying vec3 vDir;
#include <bbl_aerial_pars_fragment>
${SKY_COMMON}
uniform vec3 uZenith, uMid, uHorizon, uTowardSun;
uniform vec3 uSunDisc;        // radiance of the sun disc (0 when it is down)
uniform vec3 uAureole;        // radiance scale of the glow right around the disc
uniform vec4 uSunP;           // angular radius (rad), toward-sun lobe amount, height of the haze band (sin elevation), angular size of a pixel (rad)
uniform float uDip;           // sin of the angle below the horizon down to which the dome is pure haze (a high camera: toward where its terrain ends)
uniform vec3 uMoonDir, uMoonColor;
uniform vec3 uAfter0, uAfter1, uAfter2, uAfter3;
uniform vec3 uCloudLit, uCloudShade, uCloudGlow;
uniform vec3 uGround;
uniform float uEnv;
void main() {
	vec3 d = normalize( vDir );
	float e = d.y;
	float sd = dot( d, uBSunDir );
	float sdp = max( sd, 0.0 );
	// ---- gradient: horizon -> mid at about 12 degrees -> "zenith" at about 30 degrees, a little deeper above
	vec3 col = mix( uHorizon, uMid, smoothstep( 0.02, 0.23, e ) );
	col = mix( col, uZenith, smoothstep( 0.16, 0.52, e ) );
	col *= 1.0 - 0.22 * smoothstep( 0.5, 1.0, e );
	// ---- night sky behind everything else
	if ( uNight.x > 0.001 ) {
		// Milky Way: a faint, mottled band on a great circle
		const vec3 MW = vec3( 0.5567, 0.3492, - 0.7538 );
		float band = exp( - pow( dot( d, MW ) / 0.17, 2.0 ) );
		vec2 mq = vec2( atan( d.z, d.x ) * 9.0, d.y * 14.0 );
		float mott = 0.35 + 0.9 * bblVN( mq ) * bblVN( mq * 2.7 + 5.0 );
		col += vec3( 0.62, 0.72, 1.0 ) * ( 0.022 * band * mott * uNight.y * smoothstep( 0.02, 0.3, e ) );
		// moon: a sphere lit by the real sun direction, so the phase and its tilt are right
		const float RM = 0.0068;
		float md = dot( d, uMoonDir );
		if ( md > 0.85 ) {
			float inside = 0.0;
			if ( md > 0.9998 ) {
				vec3 mx = normalize( cross( vec3( 0.0, 1.0, 0.0 ), uMoonDir ) ), my = cross( uMoonDir, mx );
				vec2 q = vec2( dot( d, mx ), dot( d, my ) ) / RM;
				float r2 = dot( q, q );
				float aa = uSunP.w / RM;
				inside = 1.0 - smoothstep( 1.0 - aa, 1.0 + aa, sqrt( r2 ) );
				vec3 n = q.x * mx + q.y * my - sqrt( max( 1.0 - r2, 0.0 ) ) * uMoonDir;
				float lit = smoothstep( - 0.04, 0.10, dot( n, uBSunDir ) );
				float maria = 0.74 + 0.26 * smoothstep( 0.25, 0.75, bblVN( q * 2.3 + 40.0 ) * 0.6 + bblVN( q * 5.1 + 11.0 ) * 0.4 );
				float limb = 0.82 + 0.18 * sqrt( max( 1.0 - r2, 0.0 ) );
				col = mix( col, uMoonColor * ( lit * maria * limb + 0.012 ), inside * uNight.z );
			}
			// halo: it has faded to nothing (3e-9) where this branch begins, so it has no edge
			col += uMoonColor * ( 0.035 * pow( md, 900.0 ) + 0.012 * pow( md, 120.0 ) ) * uNight.z * ( 1.0 - inside );
		}
	}
	// ---- warm lobe toward the sun, afterglow after sunset
	vec2 az = normalize( d.xz + vec2( 1e-5, 0.0 ) ), sz = normalize( uBSunDir.xz + vec2( 1e-5, 0.0 ) );
	float azd = max( dot( az, sz ), 0.0 );
	float low = 1.0 - smoothstep( 0.0, 0.55, e );
	col = mix( col, uTowardSun, clamp( uSunP.y * ( 0.5 * pow( azd, 5.0 ) * low + 0.5 * bblSunLobe( sd, 22.0 ) ), 0.0, 1.0 ) );
	if ( uNight.w > 0.001 ) {
		vec2 ag = bblAfterglow( d, uBSunDir );
		vec3 gc = mix( uAfter0, uAfter1, smoothstep( 0.0, 0.3, ag.y ) );
		gc = mix( gc, uAfter2, smoothstep( 0.26, 0.62, ag.y ) );
		gc = mix( gc, uAfter3, smoothstep( 0.58, 1.05, ag.y ) );
		col = mix( col, gc, ag.x );
	}
	// ---- cirrus
	float cloudCover = 0.0;
	if ( e > - 0.005 && uCloudP.z > 0.0 ) {
		vec2 cl = bblClouds( d );
		cloudCover = cl.x;
		vec3 cc = mix( uCloudLit, uCloudShade, 0.45 * cl.x * cl.x );
		cc += uCloudGlow * ( 0.55 * pow( sdp, 5.0 ) + 0.9 * pow( sdp, 40.0 ) );
		col = mix( col, cc, cl.x * uCloudP.z * smoothstep( - 0.005, 0.06, e ) );
	}
	// ---- haze band: exactly the aerial in-scatter colour at and below the horizon
	vec3 haze = bblHazeColor( d );
	// no kink at the horizon: the band leaves the haze with zero slope and has a long tail (a kink reads as a line
	// wherever sky and haze differ: under the afterglow, from high up)
	float hx = max( e + uDip, 0.0 ) / uSunP.z;
	float hb = pow( 1.0 + hx * hx, - 1.5 );
	col = mix( col, haze, hb );
	// ---- sun: aureole and disc
	float ang = length( cross( d, uBSunDir ) );
	float vis = ( 1.0 - 0.75 * cloudCover ) * smoothstep( - 0.004, 0.012, e );
	if ( sd > 0.0 ) {
		col += uAureole * ( 5.0 * pow( sdp, 5000.0 ) + 0.9 * pow( sdp, 520.0 ) + 0.12 * pow( sdp, 60.0 ) ) * ( 1.0 - 0.5 * cloudCover ) * smoothstep( - 0.02, 0.03, e );
		if ( uEnv < 0.5 ) {
			float aa = uSunP.w * 0.9;
			float disc = 1.0 - smoothstep( uSunP.x - aa, uSunP.x + aa, ang );
			float limb = 0.72 + 0.28 * sqrt( max( 1.0 - ( ang * ang ) / ( uSunP.x * uSunP.x ), 0.0 ) );
			col += uSunDisc * ( disc * limb * vis );
		}
	}
	// ---- capture for the ambient: the ground the sky dome does not have, and no fireflies
	if ( uEnv > 0.5 ) {
		col = mix( col, uGround, smoothstep( 0.0, - 0.10, e ) );
		col = min( col, vec3( 6.0 ) );
	}
	gl_FragColor = vec4( col, 1.0 );
}`;

const STAR_VERT = /* glsl */ `
attribute vec4 aStar;     // unit direction, brightness 0..1
attribute vec3 aTint;
uniform vec3 uBSunDir;
uniform float uPx, uStar, uBTime;
${SKY_COMMON}
varying vec3 vCol;
void main() {
	vec3 d = aStar.xyz;
	vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * d, 1.0 );
	gl_Position = p.xyww;
	float b = aStar.w;
	gl_PointSize = uPx * ( 1.7 + 2.5 * sqrt( b ) );
	float ext = smoothstep( 0.035, 0.32, d.y );
	float tw = 1.0 + 0.16 * sin( uBTime * ( 2.5 + 9.0 * fract( b * 91.7 ) ) + b * 400.0 );
	float cl = uCloudP.z > 0.0 ? bblClouds( d ).x * uCloudP.z : 0.0;
	float glow = bblAfterglow( d, uBSunDir ).x;
	vCol = aTint * ( ( 0.07 + 1.25 * b * b ) * tw * ext * ( 1.0 - min( 1.4 * cl, 1.0 ) ) * ( 1.0 - 0.95 * glow ) * uStar );
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
	float r = length( gl_PointCoord - 0.5 ) * 2.0;
	float a = smoothstep( 1.0, 0.2, r );
	gl_FragColor = vec4( vCol * a * a, 1.0 );
}`;

/** Standard normal quantile (Acklam's approximation is more than needed: this one is good to 2 %). */
function probit(p) {
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4), t = Math.sqrt(-2 * Math.log(q < 0.5 ? q : 1 - q));
  const x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return q < 0.5 ? -x : x;
}
/** Threshold of the cirrus noise for a wanted cover (fraction of the sky that shows any cloud). Mean 0.445, sigma 0.193 measured on the noise. */
export const cloudThreshold = (cover) => (cover <= 0 ? 9 : 0.47 + 0.193 * probit(1 - cover));
/**
 * The two layers together, with the band field added to the noise, cover more sky than the quantile of one layer says.
 * Measured on the dome (out/audit-lighting/scripts/skylab.js: six views of 60 degrees around the horizon, elevations
 * 0 to 58 degrees; a pixel counts as cloud when the clouds change its radiance by more than 2.5 %):
 * [cover handed to cloudThreshold, cover measured]. coverToNoise() is the inverse of this table.
 */
const COVER_TABLE = [[0, 0], [0.041, 0.153], [0.086, 0.24], [0.132, 0.301], [0.2, 0.385], [0.3, 0.476], [1, 1]];
export function coverToNoise(cover) {
  if (cover <= 0) return 0;
  for (let i = 1; i < COVER_TABLE.length; i++) {
    const [n0, c0] = COVER_TABLE[i - 1], [n1, c1] = COVER_TABLE[i];
    if (cover <= c1) return n0 + (n1 - n0) * (cover - c0) / (c1 - c0);
  }
  return 1;
}

export function createSky(ctx, aerialUniforms) {
  const { LAYERS, renderer } = ctx;
  const col = () => new THREE.Color(0, 0, 0);

  // ---- noise texture (seeded; value noise comes from bilinear filtering of random texels) ----------------------
  const rng = ctx.rng('lighting.sky.noise'), N = 256, data = new Uint8Array(N * N * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng.next() * 256);
  const noise = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.magFilter = noise.minFilter = THREE.LinearFilter; noise.generateMipmaps = false;
  noise.colorSpace = THREE.NoColorSpace; noise.name = 'lighting.skyNoise'; noise.needsUpdate = true;

  // streaks run NNE-SSW: diagonal to every view of the film (west 241-267, north-west 320, south 150-182 degrees)
  const dirA = [Math.sin(208 * Math.PI / 180), -Math.cos(208 * Math.PI / 180)], dirB = [Math.sin(216 * Math.PI / 180), -Math.cos(216 * Math.PI / 180)];
  const U = {
    ...aerialUniforms,
    tNoise: { value: noise },
    uCloudA: { value: new THREE.Vector4(dirA[0], dirA[1], 9.0, 1.4) }, uCloudB: { value: new THREE.Vector4(dirB[0], dirB[1], 16.0, 2.5) },
    uCloudP: { value: new THREE.Vector4(0.5, 0.52, 0.8, 0) },
    uNight: { value: new THREE.Vector4(0, 0, 0, 0) },
    uZenith: { value: col() }, uMid: { value: col() }, uHorizon: { value: col() }, uTowardSun: { value: col() },
    uSunDisc: { value: col() }, uAureole: { value: col() }, uSunP: { value: new THREE.Vector4(0.0058, 0.8, 0.045, 0) }, uDip: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonColor: { value: col() },
    uAfter0: { value: col() }, uAfter1: { value: col() }, uAfter2: { value: col() }, uAfter3: { value: col() },
    uCloudLit: { value: col() }, uCloudShade: { value: col() }, uCloudGlow: { value: col() },
    uGround: { value: col() }, uEnv: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ name: 'sky', vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false });
  ctx.materials.register(material, { owner: 'lighting', skipHooks: true });
  const domeGeo = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(domeGeo, material);
  mesh.name = 'sky'; mesh.frustumCulled = false; mesh.renderOrder = 1000; mesh.layers.set(LAYERS.SKY);
  mesh.castShadow = false; mesh.receiveShadow = false;

  // ---- stars: world.json lighting.modes.blue.stars round points of varied magnitude -----------------------------
  const nStars = ctx.world.lighting.modes.blue.stars || 400, srng = ctx.rng('lighting.sky.stars');
  const aStar = new Float32Array(nStars * 4), aTint = new Float32Array(nStars * 3), aPos = new Float32Array(nStars * 3);
  const TINTS = [[0.72, 0.82, 1.0], [0.86, 0.91, 1.0], [1.0, 1.0, 1.0], [1.0, 0.95, 0.84], [1.0, 0.86, 0.68]];
  for (let i = 0; i < nStars; i++) {
    const y = 0.05 + 0.95 * srng.next(), a = srng.next() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    aStar.set([r * Math.cos(a), y, r * Math.sin(a), Math.pow(srng.next(), 2.6)], i * 4);
    aPos.set([r * Math.cos(a), y, r * Math.sin(a)], i * 3);
    aTint.set(TINTS[Math.floor(srng.next() * TINTS.length)], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  starGeo.setAttribute('aStar', new THREE.BufferAttribute(aStar, 4));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(aTint, 3));
  const starU = { uBSunDir: aerialUniforms.uBSunDir, uBTime: ctx.materials.uniforms.uBTime, uPx: { value: 1 }, uStar: { value: 0 }, tNoise: U.tNoise, uCloudA: U.uCloudA, uCloudB: U.uCloudB, uCloudP: U.uCloudP, uNight: U.uNight };
  const starMat = new THREE.ShaderMaterial({ name: 'sky-stars', vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: starU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false, toneMapped: false });
  ctx.materials.register(starMat, { owner: 'lighting', skipHooks: true });
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'sky-stars'; stars.frustumCulled = false; stars.renderOrder = 1001; stars.layers.set(LAYERS.SKY); stars.visible = false;

  // ---- capture rigs ---------------------------------------------------------------------------------------------
  const envScene = new THREE.Scene(); envScene.name = 'lighting.envScene';
  envScene.add(new THREE.Mesh(domeGeo, material));
  envScene.children[0].frustumCulled = false;
  const probeCam = new THREE.PerspectiveCamera(90, 1, 0.1, 10), PN = 24;
  const probeRT = new THREE.WebGLRenderTarget(PN, PN, { type: THREE.FloatType, depthBuffer: false });
  const FACES = [[1, 0, 0, 0, 1, 0], [-1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, -1], [0, -1, 0, 0, 0, 1], [0, 0, 1, 0, 1, 0], [0, 0, -1, 0, 1, 0]];
  const buf = new Float32Array(PN * PN * 4);

  const sky = {
    mesh, stars, material, uniforms: U, noise, starCount: nStars,
    /** Write the uniforms for a light state (see lighting.stateAt). */
    update(state, frame) {
      U.uZenith.value.copy(state.skyZenith); U.uMid.value.copy(state.skyMid); U.uHorizon.value.copy(state.skyHorizon); U.uTowardSun.value.copy(state.skyTowardSun);
      U.uSunDisc.value.copy(state.sunDisc); U.uAureole.value.copy(state.aureole);
      const camY = frame && frame.camera ? frame.camera.pos[1] : 0;
      // the haze band is a little thinner from high up (the camera looks over the dense layer) and begins below the horizon there:
      // the terrain ends (fully in haze) at atan(camY / HAZE.far) under the horizon, the band leaves the haze at 0.6 of that
      const fovDeg = frame && frame.camera ? frame.camera.fov : 50, hPx = ctx.post && ctx.post.height ? ctx.post.height : ctx.size.height * ctx.size.dpr;
      U.uSunP.value.set(0.0058, state.glow, 0.05 * (0.7 + 0.3 * Math.exp(-Math.max(camY, 0) / 700)), (2 * Math.tan((fovDeg * Math.PI) / 360)) / hPx);
      U.uDip.value = 0.6 * Math.max(camY, 0) / Math.hypot(Math.max(camY, 0), HAZE.far);
      U.uMoonDir.value.copy(state.moonDir); U.uMoonColor.value.copy(state.moonDisc);
      U.uNight.value.set(state.night, state.stars, state.moonAmount, state.afterglow);
      U.uAfter0.value.copy(state.after[0]); U.uAfter1.value.copy(state.after[1]); U.uAfter2.value.copy(state.after[2]); U.uAfter3.value.copy(state.after[3]);
      U.uCloudLit.value.copy(state.cloudColor); U.uCloudShade.value.copy(state.cloudShade); U.uCloudGlow.value.copy(state.cloudGlow);
      const t = frame ? frame.t : 0;
      const cn = coverToNoise(state.cloudCover);
      U.uCloudP.value.set(cloudThreshold(cn * 0.75), cloudThreshold(cn * 0.45), state.cloudOpacity, 4 + 0.03 * t);
      starU.uStar.value = state.stars; stars.visible = state.stars > 0.003;
      starU.uPx.value = Math.max(1, (ctx.post && ctx.post.height ? ctx.post.height : ctx.size.height * ctx.size.dpr) / 1080);
    },
    /**
     * Irradiance of the sky (ground black) on six axis-aligned surfaces and on average over the horizontal ones:
     * { up: Color, down: Color, horiz: Color } in the units of a light's colour x intensity.
     * Call after update(state).
     */
    probe() {
      const prevRT = renderer.getRenderTarget(), prevEnv = U.uEnv.value, prevGround = U.uGround.value.clone();
      U.uEnv.value = 1; U.uGround.value.setRGB(0, 0, 0);
      const E = { px: [0, 0, 0], nx: [0, 0, 0], py: [0, 0, 0], ny: [0, 0, 0], pz: [0, 0, 0], nz: [0, 0, 0] };
      const NORM = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
      const f = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), dir = new THREE.Vector3();
      for (const F of FACES) {
        probeCam.position.set(0, 0, 0); probeCam.up.set(F[3], F[4], F[5]); probeCam.lookAt(F[0], F[1], F[2]); probeCam.updateMatrixWorld(true);
        renderer.setRenderTarget(probeRT); renderer.clear(); renderer.render(envScene, probeCam);
        renderer.readRenderTargetPixels(probeRT, 0, 0, PN, PN, buf);
        f.set(F[0], F[1], F[2]); u.set(F[3], F[4], F[5]); r.crossVectors(f, u);
        for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
          const x = ((i + 0.5) / PN) * 2 - 1, y = ((j + 0.5) / PN) * 2 - 1, k = (j * PN + i) * 4;
          const dw = (4 / (PN * PN)) / Math.pow(1 + x * x + y * y, 1.5);
          dir.copy(f).addScaledVector(r, x).addScaledVector(u, y).normalize();
          for (const key in E) {
            const n = NORM[key], c = dir.x * n[0] + dir.y * n[1] + dir.z * n[2];
            if (c > 0) { E[key][0] += buf[k] * c * dw; E[key][1] += buf[k + 1] * c * dw; E[key][2] += buf[k + 2] * c * dw; }
          }
        }
      }
      renderer.setRenderTarget(prevRT); U.uEnv.value = prevEnv; U.uGround.value.copy(prevGround);
      const C = (a) => new THREE.Color(a[0], a[1], a[2]);
      const horiz = [0, 1, 2].map((i) => (E.px[i] + E.nx[i] + E.pz[i] + E.nz[i]) / 4);
      return { up: C(E.py), down: C(E.ny), horiz: C(horiz), faces: E };
    },
    /** Render the sky (no sun disc, with a ground hemisphere of radiance `ground`) into a cube target. Call after update(state). */
    capture(cubeCamera, ground) {
      const prevRT = renderer.getRenderTarget(), prevEnv = U.uEnv.value;
      U.uEnv.value = 1; U.uGround.value.copy(ground);
      cubeCamera.update(renderer, envScene);
      renderer.setRenderTarget(prevRT); U.uEnv.value = prevEnv;
    },
  };
  return sky;
}
