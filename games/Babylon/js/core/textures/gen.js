// textures/gen.js — GPU generator for the procedural texture sets of the "materials" subsystem.
// OWNER: materials engineer. Not a subsystem by itself: js/core/materials.js is the entry.
//
// A set is ONE fragment program that writes two tiling textures in one pass (MRT):
//   A  "detail"  RGB = albedo multiplier around mid grey (linear DATA, not sRGB; the surface shader multiplies
//                by gain = 1 / mean, so the far-field average of every material is exactly its palette colour),
//                A = secondary-colour mask (damp, repairs, thin wash, veins ... per set)
//   N  "relief"  RGB = tangent-space normal (three.js layout, +z out of the surface), A = roughness detail
//                around 0.5
// Everything is periodic over the tile (integer lattice periods), deterministic (integer hashes, no time,
// no random source) and generated in a few milliseconds, so the draft tier and the final tier differ only
// in resolution.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/** GLSL library shared by every set: periodic integer-hash noise. uv is 0..1 over the tile. */
export const NOISE_GLSL = /* glsl */ `
precision highp float;
precision highp int;
uniform float uSize;      // texels per side
uniform float uTile;      // metres per repeat
const float PI = 3.14159265;
uint bh( uint x ) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }
uint bh2( ivec2 p, uint s ) { return bh( uint( p.x ) * 0x9E3779B9U ^ bh( uint( p.y ) + s * 0x85EBCA6BU + 0x1B873593U ) ); }
float h1( ivec2 p, uint s ) { return float( bh2( p, s ) >> 8 ) * ( 1.0 / 16777216.0 ); }
vec2 h2( ivec2 p, uint s ) { uint a = bh2( p, s ); return vec2( float( a >> 8 ), float( bh( a ) >> 8 ) ) * ( 1.0 / 16777216.0 ); }
vec3 h3( ivec2 p, uint s ) { uint a = bh2( p, s ); uint b = bh( a ); return vec3( float( a >> 8 ), float( b >> 8 ), float( bh( b ) >> 8 ) ) * ( 1.0 / 16777216.0 ); }
ivec2 wrapi( ivec2 i, ivec2 per ) { return i - per * ivec2( floor( vec2( i ) / vec2( per ) ) ); }
// value noise 0..1; p in lattice units, per = lattice period (integers)
float vnoise( vec2 p, ivec2 per, uint s ) {
	vec2 fl = floor( p ), f = p - fl; ivec2 i = ivec2( fl );
	vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	float a = h1( wrapi( i, per ), s ), b = h1( wrapi( i + ivec2( 1, 0 ), per ), s );
	float c = h1( wrapi( i + ivec2( 0, 1 ), per ), s ), d = h1( wrapi( i + ivec2( 1, 1 ), per ), s );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
// fbm of value noise, 0..1 with mean 0.5. f = integer base frequency per tile (vec2: anisotropic)
float fbmA( vec2 uv, vec2 f, int oct, uint s ) {
	float a = 0.5, sum = 0.0, norm = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		if ( i >= oct ) break;
		sum += a * vnoise( uv * f, ivec2( f ), s + uint( i ) * 17u ); norm += a;
		f *= 2.0; a *= 0.5;
	}
	return sum / norm;
}
float fbm( vec2 uv, float f, int oct, uint s ) { return fbmA( uv, vec2( f ), oct, s ); }
// ridged fbm 0..1 (bright thin ridges)
float ridge( vec2 uv, float f, int oct, uint s ) {
	float a = 0.5, sum = 0.0, norm = 0.0; vec2 ff = vec2( f );
	for ( int i = 0; i < 8; i ++ ) {
		if ( i >= oct ) break;
		float n = 1.0 - abs( 2.0 * vnoise( uv * ff, ivec2( ff ), s + uint( i ) * 29u ) - 1.0 );
		sum += a * n * n; norm += a; ff *= 2.0; a *= 0.5;
	}
	return sum / norm;
}
// cellular noise: x = F1, y = F2 - F1 (0 on cell borders), z = random id of the nearest cell; all in cell units
vec3 cells( vec2 uv, float f, uint s, float jitter ) {
	vec2 p = uv * f; ivec2 ip = ivec2( floor( p ) ); ivec2 per = ivec2( f );
	float f1 = 9.0, f2 = 9.0, id = 0.0;
	for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
		ivec2 c = ip + ivec2( i, j ); ivec2 cw = wrapi( c, per );
		vec2 o = 0.5 + jitter * ( h2( cw, s ) - 0.5 );
		float d = length( p - ( vec2( c ) + o ) );
		if ( d < f1 ) { f2 = f1; f1 = d; id = h1( cw, s + 7u ); } else if ( d < f2 ) f2 = d;
	}
	return vec3( f1, f2 - f1, id );
}
// like cells() but returns the vector to the nearest site too (for shaded blobs): xy = offset, z = id
vec3 cellVec( vec2 uv, float f, uint s, float jitter, out float f1, out float edge ) {
	vec2 p = uv * f; ivec2 ip = ivec2( floor( p ) ); ivec2 per = ivec2( f );
	float a = 9.0, b = 9.0, id = 0.0; vec2 best = vec2( 0.0 );
	for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
		ivec2 c = ip + ivec2( i, j ); ivec2 cw = wrapi( c, per );
		vec2 o = 0.5 + jitter * ( h2( cw, s ) - 0.5 );
		vec2 v = p - ( vec2( c ) + o ); float d = length( v );
		if ( d < a ) { b = a; a = d; id = h1( cw, s + 7u ); best = v; } else if ( d < b ) b = d;
	}
	f1 = a; edge = b - a;
	return vec3( best, id );
}
// scattered short strokes (straw, scratches): one segment per cell with probability prob. Returns coverage 0..1.
// f = cells per tile, len = half length in cell units (min, max), wid = half width in cell units, dirBias: 0 = any direction
float strokes( vec2 uv, float f, uint s, float prob, vec2 len, float wid, vec2 angle ) {
	vec2 p = uv * f; ivec2 ip = ivec2( floor( p ) ); ivec2 per = ivec2( f ); float m = 0.0;
	for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
		ivec2 c = ip + ivec2( i, j ); ivec2 cw = wrapi( c, per );
		vec3 r = h3( cw, s ); vec2 r2 = h2( cw, s + 3u );
		if ( r.z > prob ) continue;
		float ang = angle.x + angle.y * ( r2.x - 0.5 ); vec2 dir = vec2( cos( ang ), sin( ang ) );
		float hl = mix( len.x, len.y, r2.y );
		vec2 q = p - ( vec2( c ) + r.xy ); float t = clamp( dot( q, dir ), - hl, hl ); float d = length( q - dir * t );
		m = max( m, ( 1.0 - smoothstep( wid * 0.35, wid, d ) ) * ( 0.45 + 0.55 * r2.y ) );
	}
	return m;
}
// like strokes() but a smooth bowl (prints, dents): coverage falls off from the axis to wid
float dents( vec2 uv, float f, uint s, float prob, vec2 len, float wid, vec2 angle ) {
	vec2 p = uv * f; ivec2 ip = ivec2( floor( p ) ); ivec2 per = ivec2( f ); float m = 0.0;
	for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
		ivec2 c = ip + ivec2( i, j ); ivec2 cw = wrapi( c, per );
		vec3 r = h3( cw, s ); vec2 r2 = h2( cw, s + 3u );
		if ( r.z > prob ) continue;
		float ang = angle.x + angle.y * ( r2.x - 0.5 ); vec2 dir = vec2( cos( ang ), sin( ang ) );
		float hl = mix( len.x, len.y, r2.y );
		vec2 q = p - ( vec2( c ) + r.xy ); float t = clamp( dot( q, dir ), - hl, hl ); float d = length( q - dir * t ) / wid;
		float k = max( 1.0 - d, 0.0 );
		m = max( m, k * k * ( 3.0 - 2.0 * k ) * ( 0.4 + 0.6 * r2.y ) );
	}
	return m;
}
// scattered round blobs: one per cell with probability prob; returns x = coverage (soft), y = id, z = 1 - d/r (height profile)
vec3 blobs( vec2 uv, float f, uint s, float prob, vec2 rad ) {
	vec2 p = uv * f; ivec2 ip = ivec2( floor( p ) ); ivec2 per = ivec2( f ); vec3 best = vec3( 0.0 );
	for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
		ivec2 c = ip + ivec2( i, j ); ivec2 cw = wrapi( c, per );
		vec3 r = h3( cw, s ); vec2 r2 = h2( cw, s + 5u );
		if ( r.z > prob ) continue;
		float rr = mix( rad.x, rad.y, r2.x * r2.x );
		float d = length( p - ( vec2( c ) + r.xy ) ) / rr;
		float k = 1.0 - d;
		if ( k > best.z ) best = vec3( smoothstep( 0.0, 0.35, k ), r2.y, k );
	}
	return best;
}
`;

const VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

// The set supplies:  float surf( vec2 uv, out vec3 det, out float mask, out float rough )
//   returns the height in METRES; det = albedo multiplier (1 = neutral), mask 0..1, rough = detail around 0.5.
const MAIN = /* glsl */ `
layout( location = 0 ) out vec4 oA;
layout( location = 1 ) out vec4 oN;
void main() {
	vec2 uv = gl_FragCoord.xy / uSize;
	vec3 det; float mask, rough; vec3 d2; float m2, r2;
	float h = surf( uv, det, mask, rough );
	float e = 1.0 / uSize;
	float hx1 = surf( uv + vec2( e, 0.0 ), d2, m2, r2 ), hx0 = surf( uv - vec2( e, 0.0 ), d2, m2, r2 );
	float hy1 = surf( uv + vec2( 0.0, e ), d2, m2, r2 ), hy0 = surf( uv - vec2( 0.0, e ), d2, m2, r2 );
	float texel = uTile / uSize;                       // metres
	vec3 n = normalize( vec3( - ( hx1 - hx0 ) / ( 2.0 * texel ), - ( hy1 - hy0 ) / ( 2.0 * texel ), 1.0 ) );
	oA = vec4( clamp( det * 0.5, 0.0, 1.0 ), clamp( mask, 0.0, 1.0 ) );
	oN = vec4( n * 0.5 + 0.5, clamp( rough, 0.0, 1.0 ) );
}
`;

const MEAN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex; uniform float uLod;
out vec4 o;
void main() { o = textureLod( uTex, gl_FragCoord.xy / 8.0, uLod ); }
`;

/**
 * createGenerator(renderer) -> { generate(def, size), macro(size), bytes }.
 * def = { name, tile (metres per repeat), glsl (defines surf()), size? (1 = full, 0.5 = half resolution) }.
 * generate() returns { name, map, normalMap, size, tile, gain: [r, g, b], meanMask, ms }.
 */
export function createGenerator(renderer) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(tri, null); mesh.frustumCulled = false; scene.add(mesh);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let bytes = 0;

  const meanMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: MEAN_FRAG, uniforms: { uTex: { value: null }, uLod: { value: 0 } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const meanRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const meanBuf = new Float32Array(8 * 8 * 4);

  function draw(material, target) {
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevSort = renderer.sortObjects;
    mesh.material = material;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAuto; renderer.sortObjects = prevSort;
  }

  /** Mean of a mip-mapped texture (linear data), read from its 8 x 8 mip level. */
  function meanOf(texture, size) {
    meanMat.uniforms.uTex.value = texture; meanMat.uniforms.uLod.value = Math.max(0, Math.log2(size) - 3);
    draw(meanMat, meanRT);
    renderer.readRenderTargetPixels(meanRT, 0, 0, 8, 8, meanBuf);
    const m = [0, 0, 0, 0];
    for (let i = 0; i < 64; i++) for (let c = 0; c < 4; c++) m[c] += meanBuf[i * 4 + c] / 64;
    return m;
  }

  function setup(tex, name, mips = true) {
    tex.name = name; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.generateMipmaps = mips; tex.anisotropy = maxAniso; tex.colorSpace = THREE.NoColorSpace;
  }

  function generate(def, size) {
    const t0 = performance.now();   // timing only: never influences a pixel
    const rt = new THREE.WebGLRenderTarget(size, size, { count: 2, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: maxAniso, colorSpace: THREE.NoColorSpace });
    setup(rt.textures[0], `bbl:${def.name}:detail`); setup(rt.textures[1], `bbl:${def.name}:relief`);
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: NOISE_GLSL + '\n' + def.glsl + '\n' + MAIN,
      uniforms: { uSize: { value: size }, uTile: { value: def.tile } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    draw(mat, rt);
    const mean = meanOf(rt.textures[0], size);
    mat.dispose();
    bytes += 2 * size * size * 4 * (4 / 3);
    const safe = (v) => (v > 0.01 ? 1 / v : 2);            // gain so that (texel * gain) has mean 1 (the map stores multiplier / 2)
    return {
      name: def.name, map: rt.textures[0], normalMap: rt.textures[1], roughnessMap: rt.textures[1], roughnessChannel: 'a',
      size, tile: def.tile, metresPerRepeat: def.tile, texelsPerMetre: size / def.tile,
      gain: [safe(mean[0]), safe(mean[1]), safe(mean[2])], meanMask: mean[3],
      ms: Math.round(performance.now() - t0), target: rt,
    };
  }

  /** The shared macro-variation texture: four decorrelated low-frequency noise fields, linear RGBA8. */
  function macro(size) {
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 4, colorSpace: THREE.NoColorSpace });
    setup(rt.texture, 'bbl:macro'); rt.texture.anisotropy = 4;
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: { uSize: { value: size }, uTile: { value: 1 } },
      fragmentShader: NOISE_GLSL + /* glsl */ `
out vec4 o;
void main() {
	vec2 uv = gl_FragCoord.xy / uSize;
	float a = fbm( uv, 3.0, 6, 101u );                                   // broad clouds
	float b = fbm( uv + 0.31 * ( fbm( uv, 5.0, 3, 103u ) - 0.5 ), 7.0, 5, 102u );   // warped, mid
	float c = ridge( uv, 5.0, 5, 104u );                                 // streaky
	float d = fbm( uv, 23.0, 4, 105u );                                  // fine blotches
	o = vec4( a, b, c, d );
}`,
    });
    draw(mat, rt); mat.dispose();
    bytes += size * size * 4 * (4 / 3);
    return rt.texture;
  }

  return { generate, macro, meanOf, get bytes() { return bytes; }, maxAnisotropy: maxAniso };
}
