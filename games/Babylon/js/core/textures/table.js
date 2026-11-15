// textures/table.js — what every id of world.json palette.materials IS: which texture set it uses and with
// which parameters. OWNER: materials engineer. Read by js/core/materials.js.
//
// Fields (all optional; DEFAULTS below):
//   set          name of a texture set in sets.js, or null (flat colour)
//   rough, metal base roughness / metalness
//   detail       strength of the albedo detail (1 = as generated)      far / close: strength of the larger-scale and close-up layers
//   relief       strength of the normal map                             roughAmt: strength of the roughness detail
//   color2       secondary colour shown where the set's mask is set: palette id, '#hex', or { ratio: [r, g, b] }
//   mask         strength of that mix at wear = 0.25 (the default wear)  maskRough: roughness change under the mask
//   foot         { h, dark, mask }: damp band at the foot of walls: height (m), darkening, extra mask
//   macro        [amplitude at 811 m, at 97 m, hue]: large-scale variation
//   pattern      analytic masonry: { side: [cellU, cellV, stagger, jointWidth], top: [...], value, hue, band, bevel,
//                bevelWidth, cellOffset, soft, joint (palette id | '#hex' | { ratio }), jointStrength, jointRough,
//                tilt (every brick is its own facet: slope), gloss (roughness jitter per brick), farRough (roughness
//                added where the bricks are no longer resolved), lift (tone of the day's work: bands of about 1 m) }
//                a NEGATIVE stagger means: odd rows are half cells (whole and half bricks in alternate courses)
//   space        'world' (default) | 'object' (moving things: the texture rides with the object) | 'uv'
//   wet          takes part in the wetness band at the waterline (default true)
//   variation    flat ids only: the faint world-space value noise of the stub (default false)
//   emissive     black body with emissive = palette colour, emissiveIntensity 6
//   albedo       { chroma, lum }: how the palette colour (a DISPLAY colour) becomes the albedo fed to the shader.
//                chroma = factor on its chroma (linear RGB about its luminance), lum = luminance to scale to (the
//                value rules of SPEC 4.3 / palette.rules). Default: the palette colour as it stands. See ALBEDO below.
//   maskGate     0..1: how much the secondary-colour mask is gated by the larger-scale noise (1 = in clusters: stains,
//                damp; 0 = everywhere the set says: veins, clasts). The gate never amplifies the mask.
//   spec         factor on the specular reflectance (default 1; hand-made glaze is wavy below the pixel)
//   specGrazing  the same at grazing incidence (default: spec). A wall of uneven bricks is no mirror at a grazing angle

export const DEFAULTS = {
  set: null, rough: 0.95, metal: 0, detail: 1, far: 0.5, close: 0.6, relief: 1, roughAmt: 0.3,
  closeRatio: 6.7, vertical: false,
  color2: null, mask: 0, maskRough: 0, maskGate: 1, foot: null, macro: [0.05, 0.045, 0.012],
  pattern: null, space: 'world', wet: true, variation: false, emissive: false, albedo: null, spec: 1, specGrazing: null,
};

/** One brick course: the Ishtar Gate module, 24 courses = 2.06 m (R2), so 11.65 courses per metre. */
export const COURSE = 2.06 / 24;
/** Brick 33 cm + joint: 10 half-brick fields = 1.70 m (the dragon of the gate, R2). */
export const BRICK = 0.34;
/** Glazed brick pitch of the relief atlas (js/core/textures/glazed/module.js): 1/3 m. */
export const GLAZED_BRICK = 1 / 3;

export const JOINTS = {
  mud: '#8C7A5E',          // mud mortar: the default for bare baked brick
  bitumen: '#1F1B18',      // quays, piers, the lower courses of the gate, the Processional Way slabs
  lime: '#E6DFCF',         // white gypsum / lime mortar (upper courses)
};

// ---- ALBEDO: palette colour -> albedo ---------------------------------------------------------------------
// The palette of world.json is a list of DISPLAY colours ("suggested sRGB starting points"). Under the white
// morning sun a surface with the palette colour as albedo shows the palette colour (measured: mudPlaster #B9A27C
// renders #BAA179). The golden and afternoon suns are #FFC27A / #FFDDB0 as LINEAR light colours (blue at 20 % /
// 43 % of red): a yellow-brown albedo under them runs away into orange (sunlit mud plaster had an HSV saturation of
// 0.58, the frame 0.38 to 0.40 against the 0.25 to 0.33 of SPEC 4.3). The earth colours therefore lose part of
// their chroma on the way to the shader: sunlit mud is then 0.51 in golden light (0.40 after post's warm trim) and
// still tan (0.24) in the morning; the measurements are in docs/materials.md section 2. Value rules of SPEC 4.3 (palette.rules), as linear luminance: limewashed faces 0.62-0.72, mud roofs
// 0.40-0.48, mud walls 0.38-0.50, streets 0.28-0.35, court floors about 0.30. Where the palette colour is outside
// its rule, `lum` moves it in.
const EARTH_CHROMA = 0.64;      // walls: they face the sun
// Ground and roofs lie flat: under a low sun they are lit mostly by the blue sky, which takes their warmth away by
// itself (street earth at chroma 0.64 was a neutral grey in the morning: saturation 0.08). They keep more chroma.
const GROUND_CHROMA = 0.82;
const A = (chroma, lum) => ({ chroma, lum });

// Mud plaster: maintained and new. The secondary colour is a slightly darker, damper mud (rain wash under the
// parapet, splash at the foot); at the default wear it is at most 9 % darker, in soft clusters.
const MUD = { set: 'plaster', rough: 0.95, relief: 1.5, color2: { ratio: [0.80, 0.77, 0.72] }, mask: 0.45, maskRough: -0.05, foot: { h: 0.7, dark: 0.10, mask: 0.7 }, albedo: A(EARTH_CHROMA) };
const LIME = { set: 'limewash', rough: 0.86, far: 0.4, color2: 'mudPlasterSunlit', mask: 0.35, foot: { h: 0.6, dark: 0.05, mask: 0.9 }, macro: [0.03, 0.03, 0.008] };
const BRICKWORK = {
  set: 'grain', rough: 0.86, detail: 0.9, far: 0.35, close: 0.5, color2: 'streetEarth', mask: 0.3, foot: { h: 0.6, dark: 0.10, mask: 0.8 }, albedo: A(0.74),
  pattern: { side: [BRICK, COURSE, -0.25, 0.007], top: [BRICK, BRICK, 0.5, 0.008], value: 0.10, hue: 0.04, band: 0.05, lift: 0.07, tilt: 0.012, bevel: 0.5, bevelWidth: 0.005, cellOffset: 1, wobble: 0.3, joint: 'mud', jointStrength: 0.7, jointRough: 0.08 },
};
const GLAZE = {
  // roughness 0.34 (SPEC 3.6: 0.25 to 0.35; the relief atlas has a mean of 0.26). A perfectly flat glazed face that
  // mirrors the low sun into the camera was one white rectangle (the summit temple in shot 8, any wall seen from
  // the sun's side). Hand-made glazed bricks are not flat: every brick is its own facet (tilt), its glaze has its
  // own gloss, and beyond the distance where bricks are resolved that scatter is roughness (farRough)
  set: 'grain', rough: 0.34, spec: 0.5, specGrazing: 0.3, detail: 0.35, far: 0.3, close: 0.25, relief: 0.4, roughAmt: 0.15, macro: [0.04, 0.05, 0.02], maskGate: 0,
  // the glazed bricks are on the relief atlas's module (1/3 m, the "glazed" subsystem), and every brick takes its own
  // shade (R2 13: between #173A7C and #2D66B6, a tenth toward turquoise), so plain glazed walls and merlons sit beside
  // the relief panels without a seam of liveliness. Joints 1 to 6 mm: the wall reads as fine coursing at 8.6 cm
  pattern: { side: [GLAZED_BRICK, COURSE, -0.25, 0.004], top: [GLAZED_BRICK, GLAZED_BRICK, 0.5, 0.004], value: 0.21, hue: 0.085, band: 0.07, lift: 0.03, tilt: 0.045, gloss: 0.07, farRough: 0.12,
    bevel: 0.3, bevelWidth: 0.004, cellOffset: 1, wobble: 0.3, joint: { ratio: [0.45, 0.45, 0.45] }, jointStrength: 0.8, jointRough: 0.4 },
};
const CLOTH = { set: 'cloth', rough: 0.9, detail: 0.8, far: 0.3, close: 0, relief: 0.6, space: 'object', macro: [0, 0.03, 0], wet: false };
// Things that MOVE or sway carry their texture with them (space 'object'): timber (boats, doors, carts), reed mats,
// bitumen (coracles), palm trunks and leaf masses (they sway in the wind), cloth. In world space the grain stood still
// while the boat sailed through it. For static geometry from the batcher object space IS world space.
const LEAF = { set: 'foliage', space: 'object', rough: 0.8, far: 0.4, close: 0.3, color2: { ratio: [1.30, 1.22, 0.90] }, mask: 0.5, macro: [0.07, 0.07, 0.03] };
const FLAT = { set: null, wet: false };
const WATER = { set: null, rough: 0.12, wet: false };
const FLAME = { set: null, rough: 1, wet: false, emissive: true };
// soft rows on fields: the seeder plough sows in furrows about 0.7 m apart, and the stubble stands in the same rows
const furrows = (pitch, strength, bevel, joint) => ({ side: [pitch, pitch, 0, 0], top: [pitch, pitch, 0, 0], soft: 1, value: 0.08, bevel, joint, jointStrength: strength, jointRough: 0 });

export const TABLE = {
  // ---- mud plaster family: one set, eight tones (SPEC 4.3: mud walls 0.38 to 0.50) ----------------
  mudPlaster: { ...MUD, albedo: A(EARTH_CHROMA, 0.40) },
  mudPlasterSunlit: { ...MUD, albedo: A(EARTH_CHROMA, 0.45) },
  mudPlasterWeathered: { ...MUD, mask: 0.75, foot: { h: 0.8, dark: 0.14, mask: 0.8 }, albedo: A(EARTH_CHROMA, 0.33) },
  mudPlasterFresh: { ...MUD, mask: 0.25, foot: { h: 0.5, dark: 0.06, mask: 0.4 }, albedo: A(EARTH_CHROMA, 0.47) },
  mudPlasterDampBase: { ...MUD, rough: 0.88, mask: 0.6, albedo: A(EARTH_CHROMA, 0.22) },
  mudPlasterGrey: { ...MUD, albedo: A(EARTH_CHROMA, 0.36) },
  mudPlasterReddish: { ...MUD, albedo: A(EARTH_CHROMA, 0.37) },
  mudPlasterDark: { ...MUD, mask: 0.6, albedo: A(EARTH_CHROMA, 0.28) },
  // ---- lime (SPEC 4.3: limewashed wall and parapet faces 0.62 to 0.72) ------------------------------
  limewash: { ...LIME, albedo: A(1, 0.70) },
  limewashAged: { ...LIME, mask: 0.6, foot: { h: 0.7, dark: 0.09, mask: 1.0 }, albedo: A(0.9, 0.63) },
  templePlasterWhite: { ...LIME, rough: 0.78, mask: 0.12, relief: 0.8, foot: { h: 0.5, dark: 0.04, mask: 0.4 }, albedo: A(1, 0.74) },
  // ---- baked brick at true module -----------------------------------------------------------------
  bakedBrickYellow: BRICKWORK,
  bakedBrickBuff: BRICKWORK,
  bakedBrickRed: BRICKWORK,
  bakedBrickOld: { ...BRICKWORK, mask: 0.5, albedo: A(0.75), pattern: { ...BRICKWORK.pattern, joint: '#6B5B48', value: 0.11 } },
  // court floors about 0.30 (SPEC 4.3)
  courtBrickPaving: { ...BRICKWORK, rough: 0.9, mask: 0.5, albedo: A(GROUND_CHROMA, 0.31), pattern: { ...BRICKWORK.pattern, side: [BRICK, COURSE, -0.25, 0.008], joint: '#7E6C52', bevel: 0.4, lift: 0 } },
  asphaltedBrickRoad: { ...BRICKWORK, rough: 0.62, detail: 0.8, color2: '#4A4239', mask: 0.6, maskRough: 0.25, foot: null, albedo: A(0.8),
    pattern: { ...BRICKWORK.pattern, top: [BRICK, BRICK, 0.5, 0.012], value: 0.06, hue: 0.01, band: 0, lift: 0, bevel: 0.25, joint: { ratio: [0.62, 0.62, 0.62] }, jointStrength: 0.7, jointRough: -0.15 } },
  // ---- bitumen and stone --------------------------------------------------------------------------
  bitumen: { set: 'grain', space: 'object', rough: 0.5, detail: 0.6, far: 0.4, relief: 0.8, color2: '#4A4239', mask: 0.45, maskRough: 0.3, macro: [0.03, 0.04, 0.0] },
  limestone: { set: 'stone', rough: 0.5, detail: 0.8, far: 0.4, close: 0.4, relief: 0.6, color2: 'streetEarth', mask: 0.35, maskRough: 0.3, albedo: A(0.9),
    pattern: { side: [1.05, 0.34, 0.5, 0.012], top: [1.05, 1.05, 0, 0.012], value: 0.05, hue: 0.012, band: 0, bevel: 0.3, bevelWidth: 0.010, cellOffset: 1, wobble: 0.12, joint: 'bitumen', jointStrength: 0.9, jointRough: 0.1 } },
  // "red breccia veined with white" (R2): the white is the set's mask, everywhere the set says (no gate)
  breccia: { set: 'breccia', rough: 0.5, far: 0.2, close: 0.3, relief: 0.7, color2: 'brecciaVein', mask: 0.8, maskGate: 0, macro: [0.04, 0.04, 0.01], albedo: A(0.8),
    pattern: { side: [0.66, 0.2, 0.5, 0.010], top: [0.66, 0.66, 0, 0.010], value: 0.07, hue: 0.02, band: 0, bevel: 0.3, bevelWidth: 0.008, cellOffset: 1, wobble: 0.12, joint: 'bitumen', jointStrength: 0.9, jointRough: 0.12 } },
  brecciaVein: { set: 'stone', rough: 0.6, detail: 0.7 },
  basalt: { set: 'stone', rough: 0.55, detail: 0.6, far: 0.4, macro: [0.03, 0.04, 0.0] },
  sandstoneMottled: { set: 'stone', rough: 0.85, detail: 1.2, far: 0.9, albedo: A(0.75) },
  // ---- timber and metal ---------------------------------------------------------------------------
  cedar: { set: 'wood', space: 'object', rough: 0.7, far: 0.3, color2: '#8C7A66', mask: 0.4, maskRough: 0.15, albedo: A(0.85) },
  palmWood: { set: 'wood', space: 'object', rough: 0.85, far: 0.3, color2: '#8C7A66', mask: 0.7, maskRough: 0.1, albedo: A(0.85) },
  bronze: { set: 'metal', rough: 0.42, metal: 0.85, far: 0.2, close: 0, roughAmt: 0.2, color2: 'bronzePatina', mask: 0.5, maskRough: 0.15, macro: [0.02, 0.03, 0] },
  bronzePatina: { set: 'metal', rough: 0.6, metal: 0.55, far: 0.2, close: 0, roughAmt: 0.2, color2: '#5E4A32', mask: 0.6, maskRough: 0.15, macro: [0.02, 0.03, 0] },
  // the palette's gold is a display colour of gold in the shade; as the reflectance of a metal it rendered as copper
  gold: { set: 'metal', rough: 0.34, metal: 0.9, far: 0.15, close: 0, roughAmt: 0.15, macro: [0.02, 0.02, 0], albedo: A(0.85, 0.60) },
  silver: { set: 'metal', rough: 0.32, metal: 0.9, far: 0.15, close: 0, roughAmt: 0.15, color2: '#8E8F92', mask: 0.3, maskRough: 0.12, macro: [0.02, 0.02, 0] },
  // ---- glazed brick courses (the reliefs themselves are the "glazed" subsystem) --------------------
  glazeBlue: GLAZE, glazeBlueDark: GLAZE, glazeBlueLight: GLAZE, glazeTurquoise: GLAZE,
  glazeYellow: GLAZE, glazeWhite: GLAZE, glazeRed: GLAZE, glazeBlack: GLAZE,
  // ---- earth (SPEC 4.3: streets 0.28 to 0.35, mud roofs 0.40 to 0.48) --------------------------------
  streetEarth: { set: 'earth', rough: 0.95, color2: 'streetEarthDamp', mask: 0.6, maskRough: -0.06, albedo: A(GROUND_CHROMA, 0.33) },
  streetEarthDamp: { set: 'earth', rough: 0.86, color2: '#7A6A50', mask: 0.7, maskRough: -0.06, albedo: A(GROUND_CHROMA) },
  roofEarth: { set: 'roofEarth', rough: 0.95, color2: { ratio: [0.90, 0.88, 0.83] }, mask: 0.8, albedo: A(GROUND_CHROMA, 0.42) },
  reedMat: { set: 'reedMat', space: 'object', rough: 0.7, far: 0.3, close: 0.3, macro: [0.03, 0.05, 0.01], albedo: A(0.8) },
  alluvialSoilDry: { set: 'soil', rough: 0.95, color2: 'saltCrust', mask: 0.35, macro: [0.06, 0.06, 0.015], albedo: A(GROUND_CHROMA) },
  wetBank: { set: 'soil', rough: 0.38, detail: 0.8, color2: '#8C7758', mask: 0.6, maskRough: 0.4, macro: [0.05, 0.06, 0.01], albedo: A(0.9) },
  // ---- water colours: flat and glossy; the water subsystem draws the real surfaces -------------------
  riverNormal: WATER, riverFlood: WATER, riverDeep: WATER, riverLookDown: WATER, moat: WATER, canal: WATER,
  // ---- vegetation ---------------------------------------------------------------------------------
  palmFrond: LEAF, palmFrondHighlight: LEAF, poplar: LEAF, tamarisk: LEAF, reedsGreen: LEAF, gardenGreen: LEAF, cypressJuniper: { ...LEAF, mask: 0.25 },
  palmTrunk: { set: 'palmTrunk', space: 'object', rough: 0.95, relief: 1.2, far: 0.3, close: 0.3, albedo: A(0.8) },
  // ---- fields (small patches and props; the terrain draws the fields themselves from its land-use map) ----
  barleyRipe: { set: 'crop', rough: 0.9, color2: 'alluvialSoilDry', mask: 0.5, macro: [0.07, 0.08, 0.02], albedo: A(0.8), pattern: furrows(0.7, 0.22, 0.3, { ratio: [0.62, 0.60, 0.56] }) },
  barleyGreen: { set: 'crop', rough: 0.9, color2: 'alluvialSoilDry', mask: 0.5, macro: [0.07, 0.08, 0.03], pattern: furrows(0.7, 0.25, 0.3, { ratio: [0.60, 0.62, 0.56] }) },
  stubble: { set: 'crop', rough: 0.95, detail: 0.8, color2: 'alluvialSoilDry', mask: 0.8, macro: [0.06, 0.07, 0.02], albedo: A(0.85), pattern: furrows(0.35, 0.3, 0.25, 'alluvialSoilDry') },
  fallow: { set: 'soil', rough: 0.95, color2: '#8A8F5A', mask: 0.6, macro: [0.07, 0.07, 0.02], albedo: A(0.9) },
  ploughedSoil: { set: 'soil', rough: 0.95, color2: 'fallow', mask: 0.45, macro: [0.06, 0.06, 0.015], albedo: A(0.9), pattern: furrows(0.45, 0.45, 0.5, { ratio: [0.62, 0.60, 0.58] }) },
  saltCrust: { set: 'soil', rough: 0.85, detail: 0.7, color2: 'fallow', mask: 0.8, macro: [0.06, 0.07, 0.01], albedo: A(0.9) },
  // ---- cloth: rides with the object -----------------------------------------------------------------
  woolCream: { ...CLOTH, albedo: A(0.9) }, woolOatmeal: { ...CLOTH, albedo: A(0.8) }, woolBrown: { ...CLOTH, albedo: A(0.8) }, woolDark: { ...CLOTH, albedo: A(0.85) }, linenWhite: { ...CLOTH, rough: 0.8 },
  dyeMadderRed: CLOTH, dyeIndigo: CLOTH, dyeSaffron: { ...CLOTH, albedo: A(0.85) }, dyePurple: CLOTH,
  // ---- people and animals: flat (they are small and they move) -------------------------------------
  skin: { ...FLAT, rough: 0.62, albedo: A(0.85) }, skinDark: { ...FLAT, rough: 0.62, albedo: A(0.85) }, hair: { ...FLAT, rough: 0.5 },
  donkey: { ...FLAT, rough: 0.9 }, ox: { ...FLAT, rough: 0.85, albedo: A(0.85) }, sheep: { ...FLAT, rough: 0.98 },
  // ---- emitters -----------------------------------------------------------------------------------
  lampFlame: FLAME, torchFlame: FLAME, ember: FLAME,
};
