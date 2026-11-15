// textures/sets.js — the procedural texture sets (GLSL bodies for textures/gen.js). OWNER: materials engineer.
// Every set defines   float surf( vec2 uv, out vec3 det, out float mask, out float rough )
//   uv    0..1 over the tile (tile = metres per repeat, below)
//   returns the surface height in METRES (the generator differentiates it into the normal map)
//   det   albedo multiplier, 1 = the palette colour (kept subtle: everything in 575 BCE is maintained and new)
//   mask  0..1 secondary-colour mask (what it means is listed per set; the material table says which colour)
//   rough roughness detail around 0.5
// `res` is the share of ctx.quality.textureSize used (1 = 2048 px in final, 512 px in draft).

const plaster = /* glsl */ `
// MUD PLASTER, hand-trowelled: broad undulation, trowel sweeps in three directions, chopped straw (pale stalks and
// the dark voids they leave), small pits, lift lines every 1.33 m with a tone per lift, hairline crazing in patches,
// a few repairs. mask = rain wash and damp: soft vertical streaks in clouds.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 5.0, 4, 21u ) - 0.5;
	float mid = fbm( uv, 26.0, 3, 22u ) - 0.5;
	float fine = fbm( uv, 420.0, 2, 23u ) - 0.5;
	float sel = fbm( uv, 7.0, 2, 12u );
	float s1 = fbmA( uv, vec2( 22.0, 150.0 ), 3, 13u );
	float s2 = fbmA( uv, vec2( 150.0, 22.0 ), 3, 14u );
	vec2 dg = vec2( uv.x + uv.y, uv.x - uv.y );
	float s3 = fbmA( dg, vec2( 16.0, 106.0 ), 3, 15u );
	float st = mix( mix( s1, s2, smoothstep( 0.44, 0.50, sel ) ), s3, smoothstep( 0.55, 0.61, sel ) ) - 0.5;
	float straw = strokes( uv, 230.0, 31u, 0.50, vec2( 0.10, 0.42 ), 0.085, vec2( 0.0, 6.2832 ) );
	float voids = strokes( uv, 190.0, 28u, 0.22, vec2( 0.08, 0.30 ), 0.075, vec2( 0.0, 6.2832 ) );
	vec3 pit = blobs( uv, 260.0, 29u, 0.14, vec2( 0.07, 0.24 ) );
	// lifts: the wall was plastered in bands of 1.33 m; each has its own tone and they meet in a soft seam
	float lw = ( fbmA( uv, vec2( 30.0, 12.0 ), 3, 33u ) - 0.5 ) * 0.16;
	float ly = uv.y * 12.0 + lw, li = floor( ly ), lf = ly - li;
	float liftTone = h1( wrapi( ivec2( int( li ), 0 ), ivec2( 12, 1 ) ), 34u ) - 0.5;
	float lift = ( 1.0 - smoothstep( 0.0, 0.045, min( lf, 1.0 - lf ) ) ) * smoothstep( 0.30, 0.55, fbm( uv, 9.0, 2, 32u ) );
	vec3 cz = cells( uv, 120.0, 35u, 0.9 );
	float craze = ( 1.0 - smoothstep( 0.0, 0.05, cz.y ) ) * smoothstep( 0.60, 0.74, fbm( uv, 6.0, 3, 36u ) ) * ( 0.35 + 0.65 * cz.z );      // hairlines, in a few patches only
	vec2 rw = uv + 0.012 * vec2( fbm( uv, 40.0, 2, 37u ) - 0.5, fbm( uv, 40.0, 2, 38u ) - 0.5 );
	vec3 rp = blobs( rw, 5.0, 39u, 0.5, vec2( 0.10, 0.26 ) );
	float rin = smoothstep( 0.0, 0.12, rp.z ), redge = rin * ( 1.0 - smoothstep( 0.03, 0.18, rp.z ) );
	float h = broad * 0.010 + mid * 0.004 + st * 0.0034 * ( 1.0 - 0.5 * rin ) + fine * 0.0010 + straw * 0.0007 - voids * 0.0008 - pit.x * pit.z * 0.0016 + lift * 0.0012 - craze * 0.0004 + rin * 0.0012;
	float v = 1.0 + 0.11 * broad + 0.09 * mid + 0.08 * fine + 0.09 * st;
	v *= 1.0 + 0.16 * straw; v *= 1.0 - 0.20 * voids - 0.24 * pit.x; v *= 1.0 - 0.10 * craze; v *= 1.0 - 0.055 * lift + 0.05 * liftTone; v *= 1.0 + 0.045 * rin - 0.06 * redge;
	float w = fbm( uv, 6.0, 3, 24u ) - 0.5;
	det = v * vec3( 1.0 + 0.04 * w, 1.0, 1.0 - 0.07 * w );
	det = mix( det, det * vec3( 1.05, 1.02, 0.88 ), straw * 0.7 );
	float streak = fbmA( uv, vec2( 96.0, 5.0 ), 3, 26u );
	mask = smoothstep( 0.40, 0.80, fbm( uv, 6.0, 5, 25u ) ) * ( 0.35 + 0.85 * smoothstep( 0.30, 0.75, streak ) );
	rough = 0.5 + 0.35 * fine + 0.10 * mid - 0.12 * rin;
	return h;
}`;

const limewash = /* glsl */ `
// LIME WASH / white lime-gypsum plaster brushed over mud plaster: brush strokes (mostly vertical), bristle
// lines, thin places and small flakes where the mud shows. mask = mud showing through.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 4.0, 4, 41u ) - 0.5;
	float under = fbm( uv, 24.0, 3, 42u ) - 0.5;
	float sel = smoothstep( 0.60, 0.66, fbm( uv, 6.0, 2, 43u ) );
	float brush = mix( fbmA( uv, vec2( 140.0, 14.0 ), 3, 44u ), fbmA( uv, vec2( 14.0, 140.0 ), 3, 45u ), sel ) - 0.5;
	float bristle = mix( fbmA( uv, vec2( 760.0, 40.0 ), 2, 46u ), fbmA( uv, vec2( 40.0, 760.0 ), 2, 47u ), sel ) - 0.5;
	float thin = smoothstep( 0.10, 0.34, - brush + 0.5 * broad + 0.35 * ( fbm( uv, 18.0, 3, 48u ) - 0.5 ) );
	vec2 fw = uv + 0.004 * vec2( fbm( uv, 300.0, 2, 49u ) - 0.5, fbm( uv, 300.0, 2, 50u ) - 0.5 );
	vec3 fl = blobs( fw, 64.0, 51u, 0.035, vec2( 0.05, 0.22 ) );
	float flake = smoothstep( 0.10, 0.30, fl.z ) * smoothstep( 0.40, 0.60, fbm( uv, 5.0, 2, 53u ) );
	float h = broad * 0.008 + under * 0.004 + brush * 0.0018 + bristle * 0.0006 - flake * 0.0012;
	float v = 1.0 + 0.05 * broad + 0.075 * brush + 0.05 * bristle + 0.03 * under;
	float w = fbm( uv, 5.0, 3, 52u ) - 0.5;
	det = v * vec3( 1.0 + 0.02 * w, 1.0, 1.0 - 0.045 * w );
	mask = max( thin * 0.55, flake );
	rough = 0.5 + 0.30 * bristle + 0.15 * brush + 0.20 * flake;
	return h;
}`;

const earth = /* glsl */ `
// STREET EARTH: trodden, dusty; faint wavering paths and ruts along u, soft foot and hoof prints, pebbles and
// potsherds, straw, damp patches with a few shrinkage cracks where they dry. mask = damp (soft-edged).
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 4.0, 4, 61u ) - 0.5, mid = fbm( uv, 22.0, 4, 62u ) - 0.5, fine = fbm( uv, 380.0, 2, 63u ) - 0.5;
	float rut = 0.0, shoulder = 0.0;
	for ( int k = 0; k < 5; k ++ ) {
		vec2 r = h2( ivec2( k, 3 ), 64u );
		float vc = ( float( k ) + 0.25 + 0.5 * r.x ) / 5.0;
		float wav = ( fbmA( vec2( uv.x, r.y ), vec2( 5.0, 1.0 ), 3, 65u + uint( k ) ) - 0.5 ) * 0.035;
		float on = smoothstep( 0.45, 0.70, fbmA( vec2( uv.x, r.y ), vec2( 3.0, 1.0 ), 2, 71u + uint( k ) ) );
		float w = ( 0.07 + 0.05 * r.y ) / uTile;
		float d = abs( uv.y - vc - wav ); d = min( d, 1.0 - d );
		if ( ( k & 1 ) == 1 ) { float d2 = abs( uv.y - vc - wav - 1.3 / uTile ); d = min( d, min( d2, 1.0 - d2 ) ); }
		float k1 = max( 1.0 - d / w, 0.0 ), k2 = max( 1.0 - d / ( 2.8 * w ), 0.0 );
		rut = max( rut, k1 * k1 * ( 3.0 - 2.0 * k1 ) * on );
		shoulder = max( shoulder, k2 * on );
	}
	shoulder = max( shoulder - rut, 0.0 );
	float brk = 0.6 + 0.8 * fbm( uv, 90.0, 2, 80u );
	float foot = dents( uv, 36.0, 81u, 0.30, vec2( 0.16, 0.26 ), 0.17, vec2( 0.0, 1.4 ) ) * brk;
	float hoof = dents( uv, 60.0, 82u, 0.20, vec2( 0.03, 0.07 ), 0.20, vec2( 0.0, 6.2832 ) ) * brk;
	vec3 pb = blobs( uv, 150.0, 83u, 0.14, vec2( 0.08, 0.28 ) );
	float straw = strokes( uv, 120.0, 85u, 0.15, vec2( 0.10, 0.30 ), 0.05, vec2( 0.0, 6.2832 ) );
	vec2 dw = uv + 0.03 * vec2( fbm( uv, 11.0, 2, 86u ) - 0.5, fbm( uv, 11.0, 2, 87u ) - 0.5 );
	float dn = fbm( dw, 5.0, 4, 84u );
	float damp = smoothstep( 0.50, 0.78, dn );
	// shrinkage cracks all over the drying part of a damp patch, strongest in its middle: never a ring round its edge
	vec3 cz = cells( uv, 90.0, 88u, 0.95 );
	float crack = ( 1.0 - smoothstep( 0.0, 0.05, cz.y ) ) * smoothstep( 0.56, 0.70, dn ) * smoothstep( 0.35, 0.60, fbm( uv, 13.0, 2, 79u ) );
	float h = broad * 0.030 + mid * 0.012 + fine * 0.002 - rut * 0.012 + shoulder * 0.003 - foot * 0.004 - hoof * 0.004 + pb.x * pb.z * 0.006 - damp * 0.002 - crack * 0.0015;
	float v = 1.0 + 0.13 * broad + 0.12 * mid + 0.10 * fine;
	v *= 1.0 - 0.06 * rut + 0.03 * shoulder; v *= 1.0 - 0.05 * foot - 0.06 * hoof; v *= 1.0 - 0.10 * crack; v *= 1.0 + 0.12 * straw;
	float w = fbm( uv, 7.0, 3, 89u ) - 0.5;
	det = v * vec3( 1.0 + 0.03 * w, 1.0, 1.0 - 0.06 * w );
	vec3 pc = pb.y < 0.45 ? vec3( 1.20, 1.18, 1.14 ) : pb.y < 0.75 ? vec3( 0.66, 0.64, 0.64 ) : vec3( 1.20, 0.88, 0.70 );   // pale pebble, dark pebble or ash, red sherd
	det = mix( det, det * pc, pb.x * 0.85 );
	mask = damp;
	rough = 0.5 + 0.30 * fine - 0.10 * rut;
	return h;
}`;

const roofEarth = /* glsl */ `
// ROLLED-MUD ROOF: roller bands 0.55 m wide along u with overlap ridges, fine shrinkage
// cracks, much chaff, re-plastered patches. mask = fresh patches.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 4.0, 4, 90u ) - 0.5, mid = fbm( uv, 24.0, 3, 97u ) - 0.5, fine = fbm( uv, 400.0, 2, 98u ) - 0.5;
	float by = uv.y * 29.0 + ( fbmA( uv, vec2( 6.0, 29.0 ), 2, 91u ) - 0.5 ) * 0.5;
	float bi = floor( by ), bf = by - bi;
	float bandTone = h1( wrapi( ivec2( int( bi ), 0 ), ivec2( 29, 1 ) ), 92u ) - 0.5;
	float edge = 1.0 - smoothstep( 0.0, 0.07, min( bf, 1.0 - bf ) );
	vec2 cw = uv + 0.004 * vec2( fbm( uv, 60.0, 2, 100u ) - 0.5, fbm( uv, 60.0, 2, 106u ) - 0.5 );
	vec3 c1 = cells( cw, 70.0, 93u, 0.95 );
	float crack = ( 1.0 - smoothstep( 0.0, 0.03, c1.y ) ) * smoothstep( 0.42, 0.62, fbm( uv, 9.0, 3, 94u ) );
	float pn = fbm( uv + 0.02 * vec2( fbm( uv, 14.0, 2, 107u ) - 0.5, fbm( uv, 14.0, 2, 108u ) - 0.5 ), 4.0, 3, 95u );
	float fresh = smoothstep( 0.60, 0.64, pn );
	float straw = strokes( uv, 200.0, 96u, 0.70, vec2( 0.12, 0.36 ), 0.085, vec2( 0.0, 6.2832 ) );
	vec3 pb = blobs( uv, 110.0, 109u, 0.08, vec2( 0.08, 0.25 ) );
	crack *= 1.0 - 0.8 * fresh;
	float h = broad * 0.020 + mid * 0.006 + edge * 0.003 * ( 1.0 - fresh ) - crack * 0.003 + straw * 0.0006 + fine * 0.001 + pb.x * pb.z * 0.005 + fresh * 0.002;
	float v = 1.0 + 0.13 * broad + 0.09 * mid + 0.07 * fine + 0.06 * bandTone * ( 1.0 - fresh ) - 0.04 * edge * ( 1.0 - fresh );
	v *= 1.0 - 0.22 * crack; v *= 1.0 + 0.16 * straw; v *= 1.0 - 0.3 * pb.x;
	float w = fbm( uv, 6.0, 3, 110u ) - 0.5;
	det = v * vec3( 1.0 + 0.04 * w, 1.0, 1.0 - 0.08 * w );
	det = mix( det, det * vec3( 1.06, 1.02, 0.84 ), straw * 0.7 );
	mask = fresh;
	rough = 0.5 + 0.30 * fine - 0.10 * fresh;
	return h;
}`;

const soil = /* glsl */ `
// ALLUVIAL SOIL: clods, polygonal desiccation cracks, grit. mask = pale crust on the polygon tops (salt, dry silt).
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 4.0, 4, 111u ) - 0.5, mid = fbm( uv, 20.0, 4, 115u ) - 0.5, fine = fbm( uv, 360.0, 2, 116u ) - 0.5;
	vec3 c = cells( uv, 110.0, 117u, 1.0 );
	float clod = ( 1.0 - smoothstep( 0.0, 0.7, c.x ) ) * ( 0.5 + 0.5 * c.z );
	vec2 cw = uv + 0.006 * vec2( fbm( uv, 50.0, 2, 118u ) - 0.5, fbm( uv, 50.0, 2, 119u ) - 0.5 );
	vec3 k1 = cells( cw, 34.0, 112u, 1.0 );
	float crack = 1.0 - smoothstep( 0.0, 0.05, k1.y );
	vec3 k2 = cells( cw, 100.0, 113u, 1.0 );
	crack = max( crack, ( 1.0 - smoothstep( 0.0, 0.06, k2.y ) ) * 0.6 * smoothstep( 0.45, 0.6, fbm( uv, 8.0, 3, 120u ) ) );
	float h = broad * 0.040 + mid * 0.020 + clod * 0.012 + fine * 0.003 - crack * 0.020;
	float v = 1.0 + 0.20 * broad + 0.16 * mid + 0.12 * fine + 0.14 * ( clod - 0.3 );
	v *= 1.0 - 0.40 * crack;
	float w = fbm( uv, 6.0, 3, 126u ) - 0.5;
	det = v * vec3( 1.0 + 0.05 * w, 1.0, 1.0 - 0.10 * w );
	mask = smoothstep( 0.48, 0.74, fbm( uv, 7.0, 5, 114u ) ) * ( 1.0 - crack ) * ( 0.55 + 0.45 * k1.z );
	rough = 0.5 + 0.30 * fine;
	return h;
}`;

const crop = /* glsl */ `
// STANDING CEREAL seen from above and obliquely: ears as bright specks, stalk shadow between, wind-lodged
// streaks, thin places. mask = bare soil showing.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float speck = fbm( uv, 500.0, 2, 121u ) - 0.5;
	vec3 c = cells( uv, 380.0, 122u, 1.0 );
	float ear = 1.0 - smoothstep( 0.10, 0.55, c.x );
	vec2 sw = uv + 0.02 * vec2( fbm( uv, 9.0, 2, 127u ) - 0.5, fbm( uv, 9.0, 2, 128u ) - 0.5 );
	float swirl = fbmA( sw, vec2( 16.0, 40.0 ), 4, 123u ) - 0.5;
	float broad = fbm( uv, 4.0, 4, 124u ) - 0.5;
	float gaps = smoothstep( 0.66, 0.80, fbm( uv, 9.0, 4, 125u ) );
	float h = ear * 0.02 + speck * 0.012 + swirl * 0.05 + broad * 0.05 - gaps * 0.06;
	float v = 1.0 + 0.50 * ( ear - 0.25 ) + 0.30 * speck + 0.22 * swirl + 0.16 * broad;
	float g = fbm( uv, 6.0, 3, 129u ) - 0.5;
	det = v * vec3( 1.0 + 0.08 * g, 1.0, 1.0 - 0.20 * g );
	mask = gaps;
	rough = 0.5 + 0.2 * speck;
	return h;
}`;

const foliage = /* glsl */ `
// LEAF MASS (garden beds, tree crowns, reed tops): clumps of 30 cm with leaves of 9 cm, dark gaps between.
// mask = sunlit leaf tips.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float f1, e1, f2, e2;
	vec3 c1 = cellVec( uv, 26.0, 131u, 1.0, f1, e1 );
	vec3 c2 = cellVec( uv, 90.0, 132u, 1.0, f2, e2 );
	float clump = 1.0 - smoothstep( 0.0, 0.75, f1 ), leaf = 1.0 - smoothstep( 0.0, 0.6, f2 );
	float gap = 1.0 - smoothstep( 0.0, 0.12, e1 );
	float broad = fbm( uv, 4.0, 3, 133u ) - 0.5;
	float h = clump * 0.12 + leaf * 0.03;
	float v = 1.0 + 0.35 * ( clump - 0.45 ) + 0.30 * ( leaf - 0.4 ) + 0.25 * ( c1.z - 0.5 ) + 0.15 * ( c2.z - 0.5 ) + 0.2 * broad;
	v *= 1.0 - 0.35 * gap;
	float g = c1.z - 0.5;
	det = v * vec3( 1.0 + 0.10 * g, 1.0, 1.0 - 0.15 * g );
	mask = smoothstep( 0.55, 0.90, clump * leaf + 0.3 * c2.z );
	rough = 0.5;
	return h;
}`;

const grain = /* glsl */ `
// MINERAL GRAIN for baked-brick faces, limestone, basalt, sandstone, bitumen: mottling, sand, pits, chaff
// voids, light and dark inclusions, faint wipe marks along u. mask = dust and stains.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 3.0, 4, 141u ) - 0.5, mottle = fbm( uv, 14.0, 4, 142u ) - 0.5, fine = fbm( uv, 360.0, 3, 143u ) - 0.5;
	vec3 pit = blobs( uv, 170.0, 144u, 0.30, vec2( 0.05, 0.22 ) );
	float chaff = strokes( uv, 110.0, 145u, 0.18, vec2( 0.08, 0.22 ), 0.06, vec2( 0.0, 6.2832 ) );
	vec3 lf = blobs( uv, 300.0, 146u, 0.12, vec2( 0.08, 0.20 ) ), df = blobs( uv, 300.0, 147u, 0.10, vec2( 0.08, 0.20 ) );
	float wipe = fbmA( uv, vec2( 8.0, 240.0 ), 3, 148u ) - 0.5;
	float h = broad * 0.002 + mottle * 0.0012 + fine * 0.0006 + wipe * 0.0004 - pit.x * pit.z * 0.0022 - chaff * 0.0012;
	float v = 1.0 + 0.10 * broad + 0.12 * mottle + 0.10 * fine + 0.03 * wipe;
	v *= 1.0 - 0.30 * pit.x - 0.25 * chaff; v *= 1.0 + 0.25 * lf.x - 0.30 * df.x;
	float w = fbm( uv, 9.0, 3, 149u ) - 0.5;
	det = v * vec3( 1.0 + 0.06 * w, 1.0, 1.0 - 0.10 * w );
	mask = smoothstep( 0.52, 0.74, fbm( uv, 5.0, 5, 150u ) );
	rough = 0.5 + 0.30 * fine + 0.30 * pit.x;
	return h;
}`;

const stone = /* glsl */ `
// DRESSED STONE (limestone flags, basalt, sandstone): sugary grain, soft mottling, faint bedding streaks along u,
// a few shell sections and pits; worn smooth. mask = dust and dirt.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float broad = fbm( uv, 3.0, 4, 201u ) - 0.5, mott = fbm( uv, 11.0, 4, 202u ) - 0.5, fine = fbm( uv, 400.0, 3, 203u ) - 0.5;
	float bed = fbmA( uv + vec2( 0.0, 0.02 * ( fbm( uv, 5.0, 2, 204u ) - 0.5 ) ), vec2( 6.0, 90.0 ), 3, 205u ) - 0.5;
	vec3 pit = blobs( uv, 120.0, 206u, 0.12, vec2( 0.04, 0.16 ) );
	vec3 sh = blobs( uv, 60.0, 207u, 0.10, vec2( 0.08, 0.20 ) );
	float shell = smoothstep( 0.25, 0.40, sh.z ) * ( 1.0 - smoothstep( 0.50, 0.70, sh.z ) );
	float h = broad * 0.0015 + mott * 0.0006 + fine * 0.00025 - pit.x * pit.z * 0.0015;
	float v = 1.0 + 0.08 * broad + 0.09 * mott + 0.05 * fine + 0.05 * bed;
	v *= 1.0 - 0.28 * pit.x; v *= 1.0 + 0.10 * shell;
	float w = fbm( uv, 7.0, 3, 208u ) - 0.5;
	det = v * vec3( 1.0 + 0.04 * w, 1.0, 1.0 - 0.07 * w );
	mask = smoothstep( 0.50, 0.74, fbm( uv, 5.0, 5, 209u ) );
	rough = 0.5 + 0.25 * fine + 0.30 * pit.x - 0.10 * mott;
	return h;
}`;

const breccia = /* glsl */ `
// RED BRECCIA (turminabanda): angular clasts of 3 to 9 cm in a fine red matrix, lighter and darker reds, a few
// pale ones, and thin white calcite veins that cross the stone; polished by use. mask = white (veins, pale clasts).
float tone( float t, out float white ) {
	white = 0.0;
	if ( t < 0.55 ) return 0.86 + 0.22 * t;
	if ( t < 0.84 ) return 1.02 + 0.45 * ( t - 0.55 );
	if ( t < 0.90 ) { white = 0.75; return 1.2; }
	return 0.72;
}
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float f1, e1, f2, e2, w1, w2;
	vec2 wp = uv + 0.010 * vec2( fbm( uv, 30.0, 2, 151u ) - 0.5, fbm( uv, 30.0, 2, 152u ) - 0.5 );
	vec3 c1 = cellVec( wp, 46.0, 153u, 1.0, f1, e1 );
	vec3 c2 = cellVec( wp, 120.0, 154u, 1.0, f2, e2 );
	float fine = fbm( uv, 420.0, 2, 156u ) - 0.5, mott = fbm( uv, 40.0, 3, 157u ) - 0.5;
	float big = smoothstep( 0.06, 0.15, e1 ) * step( 0.30, c1.z );          // a third of the big cells are matrix with small clasts
	float small = smoothstep( 0.08, 0.20, e2 ) * step( 0.40, c2.z );
	float t1 = tone( fract( c1.z * 7.31 ), w1 ), t2 = tone( fract( c2.z * 5.17 ), w2 );
	float matrix = 0.93 + 0.20 * mott;
	float v = mix( mix( matrix, t2, small ), t1, big );
	float white = mix( w2 * small, w1, big );
	// veins: level lines of a ramp plus noise, so they run across the whole stone instead of closing into rings
	float q1 = fract( uv.x * 2.0 + uv.y + 0.9 * ( fbm( uv, 4.0, 3, 155u ) - 0.5 ) );
	float q2 = fract( uv.y * 3.0 - uv.x + 0.7 * ( fbm( uv, 6.0, 3, 160u ) - 0.5 ) );
	float on = smoothstep( 0.35, 0.55, fbm( uv, 7.0, 2, 158u ) );
	float vein = 0.8 * max( 1.0 - smoothstep( 0.0010, 0.0032, abs( q1 - 0.5 ) ), ( 1.0 - smoothstep( 0.0008, 0.0028, abs( q2 - 0.5 ) ) ) * on );
	v *= 1.0 + 0.10 * fine;
	float clast = max( big, small );
	det = v * mix( vec3( 1.0 ), vec3( 0.97, 1.0, 1.03 ), ( 1.0 - clast ) * 0.5 );
	float dk = step( 0.90, fract( c1.z * 7.31 ) ) * big;                    // dark clasts are brown, not red
	det = mix( det, vec3( dot( det, vec3( 0.333 ) ) ) * vec3( 0.95, 1.05, 1.05 ), dk * 0.6 );
	mask = max( vein, white );
	rough = 0.5 + 0.25 * ( 1.0 - clast ) + 0.2 * fine;
	return fine * 0.0002 - ( 1.0 - clast ) * 0.0004 - vein * 0.0002;
}`;

const wood = /* glsl */ `
// TIMBER, grain along u: growth rings, fibres, pores, a few knots and drying checks. mask = sun-greyed surface.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float warp = fbmA( uv, vec2( 3.0, 12.0 ), 3, 161u ) - 0.5;
	float r = 0.5 + 0.5 * sin( ( uv.y + 0.035 * warp ) * 6.2832 * 46.0 );
	r = pow( r, 2.2 );
	float fibre = fbmA( uv, vec2( 10.0, 420.0 ), 3, 162u ) - 0.5;
	float pore = strokes( uv, 90.0, 163u, 0.5, vec2( 0.3, 0.9 ), 0.05, vec2( 0.0, 0.15 ) );
	vec3 kn = blobs( uv, 3.0, 164u, 0.45, vec2( 0.03, 0.06 ) );
	float check = strokes( uv, 14.0, 165u, 0.4, vec2( 0.3, 0.8 ), 0.012, vec2( 0.0, 0.06 ) );
	float h = r * 0.0008 + fibre * 0.0006 - check * 0.002 - pore * 0.0004 + kn.x * 0.001;
	float v = 1.0 + 0.22 * ( r - 0.4 ) + 0.16 * fibre - 0.20 * pore - 0.45 * check;
	v *= 1.0 - 0.45 * kn.x * ( 0.6 + 0.4 * sin( kn.z * 30.0 ) );
	det = v * vec3( 1.0 + 0.05 * ( r - 0.4 ), 1.0, 1.0 - 0.10 * ( r - 0.4 ) );
	mask = smoothstep( 0.50, 0.75, fbmA( uv, vec2( 4.0, 20.0 ), 4, 166u ) );
	rough = 0.5 + 0.3 * fibre + 0.2 * check;
	return h;
}`;

const palmTrunk = /* glsl */ `
// DATE-PALM TRUNK: rows of overlapping leaf-base scales, 12.5 cm wide and 9 cm high, staggered; fibrous.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float ry = uv.y * 22.0, ri = floor( ry ), rf = ry - ri;
	float odd = mod( ri, 2.0 );
	float sx = uv.x * 16.0 + 0.5 * odd, ci = floor( sx ), cf = sx - ci - 0.5;
	float id = h1( wrapi( ivec2( int( ci ), int( ri ) ), ivec2( 16, 22 ) ), 171u );
	float w = 0.5 * ( 0.30 + 0.70 * smoothstep( 0.0, 0.75, rf ) );
	float inside = 1.0 - smoothstep( w - 0.10, w, abs( cf ) );
	float hgt = inside * ( 0.20 + 0.80 * rf ) * ( 0.7 + 0.6 * id );
	float fib = fbmA( uv, vec2( 260.0, 20.0 ), 2, 172u ) - 0.5;
	float fine = fbm( uv, 300.0, 2, 173u ) - 0.5;
	float h = hgt * 0.020 + fib * 0.0015;
	float v = 1.0 + 0.45 * ( hgt - 0.40 ) + 0.20 * fib + 0.22 * ( id - 0.5 ) + 0.1 * fine;
	v *= mix( 0.50, 1.0, inside );
	det = v * vec3( 1.0 + 0.06 * ( id - 0.5 ), 1.0, 1.0 - 0.12 * ( id - 0.5 ) );
	mask = 0.0;
	rough = 0.5 + 0.3 * fine;
	return h;
}`;

const reedMat = /* glsl */ `
// REED MAT: 2/2 twill of split reeds 1.56 cm wide. mask = 0.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	vec2 p = uv * 128.0; ivec2 ip = ivec2( floor( p ) ); vec2 f = p - floor( p );
	int k = ( ip.x + ip.y ) & 3; bool warpTop = k < 2;
	float across = warpTop ? f.x : f.y;
	int stripId = warpTop ? ip.x : ip.y;
	float alongF = ( float( warpTop ? k : k - 2 ) + ( warpTop ? f.y : f.x ) ) * 0.5;
	float crown = sin( across * PI ), bulge = sin( alongF * PI );
	float id = h1( ivec2( stripId, warpTop ? 1 : 2 ), 181u );
	float fib = ( warpTop ? fbmA( uv, vec2( 640.0, 16.0 ), 2, 182u ) : fbmA( uv, vec2( 16.0, 640.0 ), 2, 183u ) ) - 0.5;
	float broad = fbm( uv, 5.0, 3, 184u ) - 0.5;
	float h = ( 0.35 + 0.65 * crown ) * ( 0.5 + 0.5 * bulge ) * 0.004;
	float v = ( 0.74 + 0.34 * crown ) * ( 0.82 + 0.24 * bulge ) * ( 1.0 + 0.30 * ( id - 0.5 ) ) * ( 1.0 + 0.16 * fib ) * ( 1.0 + 0.15 * broad );
	det = v * vec3( 1.0 + 0.06 * ( id - 0.5 ), 1.0, 1.0 - 0.14 * ( id - 0.5 ) );
	mask = 0.0;
	rough = 0.5 - 0.15 * crown;
	return h;
}`;

const cloth = /* glsl */ `
// WOVEN CLOTH (wool, linen): plain weave, threads 2 mm, uneven hand-spun yarn. mask = 0.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	vec2 p = uv * 250.0; ivec2 ip = ivec2( floor( p ) ); vec2 f = p - floor( p );
	bool warpTop = ( ( ip.x + ip.y ) & 1 ) == 0;
	float crown = sin( ( warpTop ? f.x : f.y ) * PI ) * sin( ( warpTop ? f.y : f.x ) * PI );
	float yv = ( warpTop ? fbmA( uv, vec2( 250.0, 6.0 ), 2, 185u ) : fbmA( uv, vec2( 6.0, 250.0 ), 2, 186u ) ) - 0.5;
	float broad = fbm( uv, 3.0, 3, 187u ) - 0.5, fuzz = fbm( uv, 500.0, 1, 188u ) - 0.5;
	float h = crown * 0.0006 * ( 1.0 + yv );
	float v = 0.80 + 0.30 * crown + 0.30 * yv + 0.10 * broad + 0.10 * fuzz;
	det = vec3( v );
	mask = 0.0;
	rough = 0.5 + 0.2 * fuzz;
	return h;
}`;

const metal = /* glsl */ `
// HAMMERED SHEET METAL (copper, bronze, gold, silver): facets of 1.8 cm, fine scratches. mask = patina.
float surf( vec2 uv, out vec3 det, out float mask, out float rough ) {
	float f1, e1;
	vec3 c = cellVec( uv, 28.0, 191u, 1.0, f1, e1 );
	vec2 dg = vec2( uv.x + uv.y, uv.x - uv.y );
	float s1 = fbmA( uv, vec2( 6.0, 500.0 ), 2, 192u ), s2 = fbmA( dg, vec2( 5.0, 420.0 ), 2, 193u );
	float scratch = max( smoothstep( 0.62, 0.70, s1 ), smoothstep( 0.64, 0.72, s2 ) );
	float broad = fbm( uv, 4.0, 4, 195u ) - 0.5, fine = fbm( uv, 480.0, 1, 196u ) - 0.5;
	float h = f1 * f1 * 0.0006 + fine * 0.00005 - scratch * 0.00008;
	float v = 1.0 + 0.05 * ( c.z - 0.5 ) + 0.05 * broad - 0.06 * scratch;
	det = vec3( v );
	mask = smoothstep( 0.42, 0.80, fbm( uv, 3.0, 4, 194u ) ) * ( 0.55 + 0.45 * ( 1.0 - smoothstep( 0.0, 0.6, f1 ) ) );
	rough = 0.5 + 0.30 * scratch + 0.15 * broad;
	return h;
}`;

/** name -> { tile: metres per repeat, res: share of the tier's texture size, min: smallest size that still resolves the pattern, glsl } */
export const SETS = {
  plaster: { tile: 16, res: 1, glsl: plaster },
  limewash: { tile: 16, res: 1, glsl: limewash },
  earth: { tile: 16, res: 1, glsl: earth },
  roofEarth: { tile: 16, res: 1, glsl: roofEarth },
  soil: { tile: 16, res: 1, glsl: soil },
  crop: { tile: 16, res: 1, glsl: crop },
  grain: { tile: 4, res: 1, glsl: grain },
  stone: { tile: 4, res: 1, glsl: stone },
  breccia: { tile: 4, res: 1, glsl: breccia },
  foliage: { tile: 8, res: 0.5, glsl: foliage },
  wood: { tile: 2, res: 0.5, min: 512, glsl: wood },
  palmTrunk: { tile: 2, res: 0.5, min: 512, glsl: palmTrunk },
  reedMat: { tile: 2, res: 0.5, min: 1024, glsl: reedMat },        // 8 texels per reed strip, whatever the tier
  cloth: { tile: 0.5, res: 0.5, min: 1024, glsl: cloth },          // 4 texels per thread
  metal: { tile: 0.5, res: 0.5, min: 512, glsl: metal },
};
