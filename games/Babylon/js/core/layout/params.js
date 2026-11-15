// layout/params.js — the grain of each district: block size, regularity, street widths, plot sizes, open ground.
// Sources: R5 2.1-2.2 (Merkes: blocks 60-80 m, some 45 x 50; streets 1.2-6 m; +/-3-10 degrees; T-junctions and
// dog-legs; "little open ground"), R5 3.2 (west bank: ordinary classes, more unbuilt plots toward the wall),
// R5 5 (class mix per kind of quarter), world.json districts (class mix, shares, open fraction, target counts).
//
//   B        nominal street spacing, m. Blocks come out skew and uneven, so the mean block is about 0.8 B on a side:
//            B = 65-80 gives the 50-75 m blocks of the excavated quarter (R5 2.2: 60-80, some 45 x 50)
//   sd       log-normal sigma of the block spacing (0.15 = regular, 0.3 = very uneven)
//   pc       chance that a new street continues one that ends on the other side of the street it meets
//            (high = long through streets and four-way crossings, low = T-junctions and dog-legs)
//   tilt     standard deviation of the angle jitter of a street, degrees
//   skew     lean of the through streets of the quarter against the lines they start from, degrees (the grain turns from quarter to quarter)
//   bend     chance that a street longer than 100 m has a kink
//   lane     width range of ordinary streets, m;  alley: width range of blind alleys, m
//   through  share of block alleys that run through the block instead of ending blind
//   size     multiplier on the plot areas drawn from the class ranges (calibrates the house count)
//   openBlock / openLot  shares of whole blocks / single plots left open (gardens, empty and ruined plots)
//   tree     chance of a tree in a court
export const DISTRICT = {
  'Ka-dingirra': { B: 72, sd: 0.22, pc: 0.55, tilt: 3.0, skew: 2, bend: 0.5, lane: [2.2, 4.2], alley: [1.3, 2.2], through: 0.3, size: 0.98, openBlock: 0.04, openLot: 0.06, tree: 0.08 },
  'Eridu': { B: 80, sd: 0.18, pc: 0.70, tilt: 2.2, skew: 0, bend: 0.4, lane: [3.0, 5.0], alley: [1.6, 2.5], through: 0.4, size: 0.36, openBlock: 0.05, openLot: 0.04, tree: 0.07 },
  'Shuanna': { B: 70, sd: 0.24, pc: 0.50, tilt: 3.5, skew: -4, bend: 0.6, lane: [2.2, 4.0], alley: [1.2, 2.0], through: 0.3, size: 0.93, openBlock: 0.03, openLot: 0.07, tree: 0.10 },
  'New City (Alu eshshu)': { B: 76, sd: 0.20, pc: 0.62, tilt: 2.6, skew: 0, bend: 0.5, lane: [2.6, 4.6], alley: [1.4, 2.2], through: 0.35, size: 0.86, openBlock: 0.05, openLot: 0.08, tree: 0.10 },
  'Kullab': { B: 78, sd: 0.20, pc: 0.62, tilt: 3.0, skew: 1, bend: 0.5, lane: [2.4, 4.6], alley: [1.3, 2.2], through: 0.3, size: 0.83, openBlock: 0.04, openLot: 0.07, tree: 0.08 },
  'TE.E (Te)': { B: 74, sd: 0.28, pc: 0.42, tilt: 4.5, skew: 6, bend: 0.7, lane: [2.0, 3.8], alley: [1.2, 2.0], through: 0.25, size: 1.12, openBlock: 0.22, openLot: 0.17, tree: 0.14 },
  'Bab-Lugalirra': { B: 68, sd: 0.27, pc: 0.45, tilt: 4.0, skew: 5, bend: 0.7, lane: [2.0, 3.6], alley: [1.2, 1.9], through: 0.25, size: 1.07, openBlock: 0.13, openLot: 0.14, tree: 0.13 },
  'Kumar': { B: 65, sd: 0.25, pc: 0.50, tilt: 3.6, skew: -3, bend: 0.6, lane: [2.0, 3.8], alley: [1.2, 2.0], through: 0.3, size: 0.9, openBlock: 0.07, openLot: 0.11, tree: 0.12 },
  'Tuba': { B: 70, sd: 0.27, pc: 0.45, tilt: 4.2, skew: 7, bend: 0.7, lane: [2.0, 3.6], alley: [1.2, 1.9], through: 0.25, size: 1.07, openBlock: 0.12, openLot: 0.13, tree: 0.13 },
  'Nu[...] (name broken)': { B: 72, sd: 0.30, pc: 0.38, tilt: 5.0, skew: -6, bend: 0.8, lane: [2.0, 3.4], alley: [1.2, 1.8], through: 0.2, size: 1.02, openBlock: 0.16, openLot: 0.16, tree: 0.15 },
  'Outer city north':      { B: 66, sd: 0.30, pc: 0.40, tilt: 5.0, bend: 0.8, lane: [2.2, 4.0], alley: [1.3, 2.0], through: 0.3, size: 0.90, openBlock: 0.12, openLot: 0.18, tree: 0.16 },
  'Outer city east':       { B: 66, sd: 0.30, pc: 0.40, tilt: 5.0, bend: 0.8, lane: [2.2, 4.0], alley: [1.3, 2.0], through: 0.3, size: 0.90, openBlock: 0.12, openLot: 0.18, tree: 0.16 },
  'Outer city south':      { B: 64, sd: 0.30, pc: 0.40, tilt: 5.0, bend: 0.8, lane: [2.2, 4.0], alley: [1.3, 2.0], through: 0.3, size: 0.90, openBlock: 0.12, openLot: 0.20, tree: 0.16 },
};
export const DEFAULT = { B: 70, sd: 0.28, pc: 0.4, tilt: 5, bend: 0.7, lane: [2.2, 3.8], alley: [1.3, 2.0], through: 0.3, size: 0.9, openBlock: 0.12, openLot: 0.18, tree: 0.16 };

/** Country ribbons and villages: low, small, loose. */
export const RURAL = {
  name: null, B: 46, sd: 0.3, pc: 0.3, tilt: 6, bend: 0.8, lane: [2.2, 3.6], alley: [1.3, 2.0], through: 0.3, size: 0.8, openBlock: 0, openLot: 0.22, tree: 0.2,
  classMix: { small: 0.82, medium: 0.17, large: 0.01, mansion: 0 }, sawToothShare: 0.1, whitewashShare: 0.03, elite: 0,
};

/** Class ranges, m2 (R5 3.1 "sizes at a glance"). */
export const CLASS_AREA = { small: [60, 150], medium: [150, 400], large: [400, 900], mansion: [1000, 1900] };
/** Elite quarters (Merkes mound, New Town core, near temples): R5 5 class mix. */
export const ELITE_MIX = { small: 0.10, medium: 0.45, large: 0.35, mansion: 0.10 };

/**
 * paramsAt(x, z): the parameters that hold at a point: the district's own (world.json + the table above) blended
 * toward the elite mix inside the excavated Merkes mound, the New Town core and near Esagila.
 */
export function makeParams(world, W) {
  const base = new Map();
  for (const d of world.districts) {
    const g = DISTRICT[d.name] || DEFAULT;
    base.set(d.name, {
      name: d.name, kind: d.kind, bank: d.bank, ...g,
      classMix: d.classMix, sawToothShare: d.sawToothShare ?? 0.4, whitewashShare: d.whitewashShare ?? 0.1,
      openFraction: d.openGardenFraction ?? 0.15, levelRange: d.groundLevelRange || [0, 2],
    });
  }
  const none = { name: null, kind: 'none', bank: null, ...DEFAULT, classMix: { small: 0.7, medium: 0.27, large: 0.03, mansion: 0 }, sawToothShare: 0.2, whitewashShare: 0.05, openFraction: 0.3, levelRange: [0, 2] };
  const box = (x, z, x0, z0, x1, z1, soft) => Math.max(0, Math.min(1, Math.min(x - x0, x1 - x, z - z0, z1 - z) / soft + 0.5));
  /** 0..1: how much of the elite mix applies here. */
  const elite = (x, z) => Math.max(
    box(x, z, 350, -360, 620, 80, 50),                                          // Merkes mound (R5 4.3)
    0.8 * Math.max(0, 1 - Math.hypot(x - 724.6, z + 519.2) / 150),              // New Town core round the largest house
    0.6 * Math.max(0, 1 - Math.hypot(x + 20, z - 330) / 260),                   // round Esagila
  );
  const lerpMix = (a, b, k) => ({ small: a.small + (b.small - a.small) * k, medium: a.medium + (b.medium - a.medium) * k, large: a.large + (b.large - a.large) * k, mansion: a.mansion + (b.mansion - a.mansion) * k });
  return function paramsAt(x, z) {
    const d = W.districtAt(x, z), b = d ? base.get(d.name) : none, e = b.kind === 'quarter' ? elite(x, z) : 0;
    if (e <= 0.02) return { ...b, elite: 0 };
    return {
      ...b, elite: e,
      classMix: lerpMix(b.classMix, ELITE_MIX, e),
      sawToothShare: b.sawToothShare + (0.8 - b.sawToothShare) * e,
      whitewashShare: b.whitewashShare + (0.45 - b.whitewashShare) * e,
      openBlock: b.openBlock * Math.max(0, 1 - 1.4 * e), openLot: b.openLot * (1 - 0.8 * e), tree: b.tree * (1 - 0.5 * e),
      size: b.size + (0.74 - b.size) * e,
    };
  };
}
