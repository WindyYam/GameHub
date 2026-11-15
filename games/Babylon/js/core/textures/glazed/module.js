// glazed/module.js — the brick module of the glazed reliefs, and what stands on it.
// OWNER: relief artist (subsystem "glazed"). No THREE, no DOM: pure data.
//
// Everything in the glazed atlas is laid out on ONE brick grid (research/R2-ishtar-gate.md 4, 5, 6.1, 7.5):
//   brick   33 x 33 x 8-8.5 cm, visible face 33 cm, thin joints            -> BRICK  = 1/3 m   (pitch along the wall)
//   courses 24 courses = 2.06 m, the animal row module (Koldewey 1918 p. 20) -> COURSE = 2.06/24 m (pitch up the wall)
//   bond    running bond of whole bricks: course k has its head joints at (k mod 2) half bricks + whole bricks
// A "half brick" (HB = BRICK / 2) is the horizontal unit of every position; a course is the vertical unit.

export const BRICK = 1 / 3;
export const HB = BRICK / 2;
export const COURSE = 2.06 / 24;
/**
 * Bricks across the atlas: the period of every strip that tiles along u (32 bricks = 10.67 m). The atlas is laid out
 * with a power of two of texels per half brick and per course (64 x 32 in the final tier, 32 x 16 in draft), so that
 * every mip level averages whole joints: a course of 22 texels beats against the mip grid and shows as lines.
 */
export const BRICKS_ACROSS = 32;

/**
 * Relief figures. `hb` x `courses` is the grid cell the figure fills (its bounding box on the originals):
 *   bull    9 half bricks x 13 courses = 1.500 x 1.116 m   (Koldewey: 13 courses, 9 half-brick fields)
 *   dragon 10 half bricks x 13 courses = 1.667 x 1.116 m   (13 courses, 10 fields)
 *   lion   12 half bricks x 11 courses = 2.000 x 0.944 m   (11 courses, c. 2.0 m nose to tail tuft)
 * `w` x `h` is the nominal size of the engine contract (ENGINE.md 5.3): glazed.rect / glazed.quad return a
 * window of exactly that size cut from the cell (anchored at the feet line, centred sideways).
 * `variants`: colour schemes.
 */
export const FIGURES = {
  bull: {
    w: 1.5, h: 1.1, hb: 9, courses: 13, variants: 2,
    variantNames: ['white bull, blue hair, yellow horn and hooves', 'ochre bull, blue hair, RED horn and hooves'],
  },
  dragon: {
    w: 1.7, h: 1.1, hb: 10, courses: 13, variants: 2, stretch: 1.03,   // drawn 1.60 m long; stretched about the cell centre to 1.645 m (audit: "c. 1.7 m, 10 fields")
    variantNames: ['white dragon, yellow horn / crest / tongue / claws', 'ochre dragon, RED horn / crest / tongue / claws'],
  },
  lion: {
    w: 2.0, h: 0.95, hb: 12, courses: 11, variants: 4,
    variantNames: ['white lion, yellow mane, turquoise ground', 'yellow lion, RED mane, lapis ground', 'white lion, yellow mane, lapis ground', 'yellow lion, RED mane, turquoise ground'],
  },
  // the lion of the South Palace throne-room facade: tail RAISED. Not for the street (R2 14, mistake 7).
  lionUp: { w: 2.0, h: 0.95, hb: 12, courses: 11, variants: 1, variantNames: ['ochre lion, red mane, tail raised, blue ground'] },
};
for (const f of Object.values(FIGURES)) { f.cellW = f.hb * HB; f.cellH = f.courses * COURSE; }

/** Margins stored round every figure cell in the atlas (plain ground bricks): half bricks left/right, courses below/above. */
export const CELL_MARGIN = { hb: 1, courses: 1 };

/**
 * Bands: full-width strips of the atlas that tile along u (period = the whole strip, 32 bricks = 10.67 m).
 * `h` and `period` are the values of the engine contract (metres); `courses` the height in courses.
 *   rosette  5 courses: blue, white 16-petal daisies with yellow centres, pitch 4/3 brick (3 per 4 bricks), d = 0.26 m
 *   checker  3 courses: yellow / yellow half bricks alternating with black-white-black insets / yellow
 */
export const BANDS = {
  rosette: { courses: 5, h: 5 * COURSE, period: (4 / 3) * BRICK, diameter: 0.26, petals: 16 },
  checker: { courses: 3, h: 3 * COURSE, period: BRICK },
};

/**
 * Corner edging of the gate: a vertical stripe 3 half bricks (0.5 m) wide that runs up every outer corner above the
 * socle. From the corner inwards, in quarter bricks: blue, red, yellow, black-white-black insets (2 courses of every
 * 4), yellow, blue. Stored 24 courses high; it repeats every 4 courses and is stacked.
 */
export const CORNER = { hb: 3, courses: 24, period: 4 };

/** Plain glazed courses: 'course:<paletteId>' (ENGINE.md 5.3). */
export const COURSES = ['glazeBlue', 'glazeBlueDark', 'glazeBlueLight', 'glazeTurquoise', 'glazeYellow', 'glazeWhite', 'glazeRed', 'glazeBlack'];

/** Height in courses of each plain strip in the atlas (the three grounds are tall, for large fields; all even, so that stacked strips keep the bond). */
export const COURSE_STRIP = { glazeBlue: 16, glazeBlueDark: 14, glazeTurquoise: 14, glazeBlueLight: 2, glazeYellow: 2, glazeWhite: 2, glazeRed: 2, glazeBlack: 2 };

/** Ground of a figure variant: palette id of the plain strip that continues it. */
export function groundOf(kind, variant = 0) {
  if (kind !== 'lion') return 'glazeBlue';
  return variant % 4 === 0 || variant % 4 === 3 ? 'glazeTurquoise' : 'glazeBlueDark';
}

/** Band sequences of the two standard panels, bottom to top, in courses. */
export const GATE_SOCLE = [['field', 2], ['checker', 3], ['rosette', 5], ['checker', 3]];        // 13 courses = 1.116 m
export const GATE_ROW = { animal: 13, plain: 11 };                                                // 24 courses = 2.06 m
export const LION_FRIEZE = [['field', 2], ['checker', 3], ['rosette', 5], ['checker', 3], ['lions', 13], ['checker', 3], ['rosette', 5], ['checker', 3], ['field', 2]]; // 39 courses = 3.35 m; lions' feet 13 courses = 1.116 m up
