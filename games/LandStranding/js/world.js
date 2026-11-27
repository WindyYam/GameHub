/**
 * 100% Pure Procedural Infinite Icelandic World Geology & Settlement Generator.
 *
 * Every seed (default or random) runs through the exact same unified procedural
 * macro-cell generator (800m x 800m cells) creating coherent Icelandic landscapes:
 * - Stepped flat-topped basalt escarpments & concave mossy talus aprons
 * - Escarpment waterfalls pouring from recessed rock clefts into boulder plunge pools
 * - Braided glacial outflow rivers flowing naturally from waterfall plunge pools across valleys
 * - Small Icelandic coastal/valley villages (turf cottages, corrugated Nordic houses, kirkja church)
 * - Geothermal silica hot springs, steaming fumaroles, basalt column outcrops, stone cairns,
 *   weathered timber footbridges, rusted hydro-relays, and distant research outposts.
 */
import * as THREE from 'three';
import {
  clamp,
  mix,
  smoothstep,
  smootherstep,
  seedFromString,
  hash2i,
  fbm2,
  ridged2,
  warpedFbm2,
  worley2,
  distToPolyline2D
} from './noise.js';

export const DEFAULT_SEED_STR = 'ICELAND-01';
export const CELL_SIZE = 800;
export const TRUNK_SPACING = 1600; // Infinite unbroken continental glacial trunk river spacing
export const MACRO_LAKE_CELL = 14000; // Multi-kilometer Grand Glacial Lake grid (1.8km..10km lakes!)
export const MED_LAKE_CELL = 1550;   // Medium Alpine & Valley Glacial Lake grid (230m..1000m lakes!)

let _seedStr = DEFAULT_SEED_STR;
let _seedInt = seedFromString(DEFAULT_SEED_STR);

/**
 * Continuous, infinite C-infinity meandering X centerline of glacial trunk river band `bandIdx` at world `z`.
 * Never ends or disconnects across cell boundaries!
 */
export function getTrunkRiverX(z, bandIdx = 0) {
  const baseX = bandIdx * TRUNK_SPACING + (hash2i(bandIdx, 17, _seedInt + 211) - 0.5) * 140.0;
  const w1 = (fbm2(z * 0.00072 + bandIdx * 7.3, bandIdx * 3.1 + 1.7, 3, _seedInt + 223) - 0.5) * 440.0;
  const w2 = Math.sin(z * 0.0021 + bandIdx * 2.1 + (_seedInt % 97) * 0.1) * 92.0;
  const w3 = (fbm2(z * 0.0036 - bandIdx * 4.1, 9.4, 2, _seedInt + 239) - 0.5) * 44.0;
  return baseX + w1 + w2 + w3;
}

/** Smooth continuous water surface elevation for the infinite glacial trunk river. */
export function getTrunkWaterY(x, z) {
  const vLow = fbm2(x * 0.0008, z * 0.0008, 3, _seedInt + 7);
  return 14.5 + vLow * 5.8;
}

const _trunkLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };

/** Trunk river water surface elevation smoothly graded to match any intersecting glacial lake's waterY. */
export function getTrunkWaterYAt(x, z, lk = null) {
  const base = getTrunkWaterY(x, z);
  const s = lk || sampleLake(x, z, _trunkLakeTmp);
  if (s.lake && s.shoreMeters > -s.shoreGrade * 1.5) {
    const t = smoothstep(-s.shoreGrade * 1.5, -6.0, s.shoreMeters);
    return mix(base, s.waterY, t);
  }
  return base;
}

/** Perpendicular distance to the nearest infinite trunk river channel (fast helper for placement & carving). */
export function getNearestTrunkDist(x, z) {
  const band = Math.round(x / TRUNK_SPACING);
  const rx = getTrunkRiverX(z, band);
  const dxdz = (getTrunkRiverX(z + 4.0, band) - getTrunkRiverX(z - 4.0, band)) * 0.125;
  return Math.abs(x - rx) / Math.hypot(1.0, dxdz);
}

const _cellCache = new Map();
const _neighCache = new Map();
const _trunkOverCache = new Map();
const _macroLakeCache = new Map();
const _medLakeCache = new Map();
const _worleyA = { f1: 0, f2: 0, edge: 0 };
const _worleyB = { f1: 0, f2: 0, edge: 0 };
const _polyTmp = { dist: 0, tx: 0, tz: 1, t: 0 };

export function setWorldSeed(seedStr) {
  const clean = (seedStr || DEFAULT_SEED_STR).trim() || DEFAULT_SEED_STR;
  _seedStr = clean;
  _seedInt = seedFromString(clean);
  _cellCache.clear();
  _neighCache.clear();
  _trunkOverCache.clear();
  _macroLakeCache.clear();
  _medLakeCache.clear();
}

/**
 * Tier A: Vast Multi-Kilometer Glacial Lakes (1.8 km .. 10.0 km across)
 * Deterministic per 14000m macro-cell with organic fjord bays, peninsulas & occasional basalt islets.
 */
function getMacroLake(mx, mz) {
  const key = ((mx + 4096) << 13) | (mz + 4096);
  if (_macroLakeCache.has(key)) return _macroLakeCache.get(key);

  const isOrigin = mx === 0 && mz === 0;
  const h0 = hash2i(mx, mz, _seedInt + 1201);
  if (!isOrigin && h0 < 0.28) {
    _macroLakeCache.set(key, null);
    return null;
  }

  const h1 = hash2i(mx, mz, _seedInt + 1217);
  const h2 = hash2i(mx, mz, _seedInt + 1231);
  const h3 = hash2i(mx, mz, _seedInt + 1249);
  const h4 = hash2i(mx, mz, _seedInt + 1277);
  const h5 = hash2i(mx, mz, _seedInt + 1291);
  const h6 = hash2i(mx, mz, _seedInt + 1303);
  const h7 = hash2i(mx, mz, _seedInt + 1319);

  let rx, rz, cx, cz, rot;
  if (isOrigin) {
    // Guaranteed sweeping Grand Glacial Lake (3.2km..10.0km diameter) near the origin sector without flooding spawn!
    rx = 1600.0 + h2 * 3400.0;
    rz = rx * (0.48 + h3 * 0.28);
    // Pick an offset direction pointing toward dramatic distant mountain ranges (cleanly >480m clear of origin!)
    const ang = h1 * Math.PI * 2.0;
    const dist = rx * 1.44 + 480.0;
    cx = Math.cos(ang) * dist;
    cz = Math.sin(ang) * dist;
    // Angle the lake organically across the vista so looking from the near shore sweeps across kilometers of blue water!
    rot = ang + Math.PI * 0.35 + (h4 - 0.5) * 0.7;
  } else {
    rx = 900.0 + h2 * 4100.0; // Diameter 1.8 km .. 10.0 km
    rz = rx * (0.44 + h3 * 0.34);
    const maxJit = Math.max(0.0, MACRO_LAKE_CELL * 0.16);
    cx = mx * MACRO_LAKE_CELL + (h1 - 0.5) * 2.0 * maxJit;
    cz = mz * MACRO_LAKE_CELL + (h4 - 0.5) * 2.0 * maxJit;
    rot = h5 * Math.PI;
  }

  const avgR = (rx + rz) * 0.5;
  const shoreGrade = clamp(avgR * 0.24, 110.0, 320.0);
  const boundR = Math.max(rx, rz) * 1.56 + shoreGrade + 20.0;

  // Avoid colliding with the offset origin macro-lake
  if (!isOrigin && Math.abs(mx) <= 1 && Math.abs(mz) <= 1) {
    const om = getMacroLake(0, 0);
    if (om && Math.hypot(cx - om.cx, cz - om.cz) < om.boundR + boundR + 120.0) {
      _macroLakeCache.set(key, null);
      return null;
    }
  }

  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const waterY = computeLakeWaterY(cx, cz, rx, rz, cosR, sinR);
  const maxDepth = 15.0 + h6 * 19.0 + clamp((avgR - 1200.0) * 0.006, 0.0, 16.0); // 15m..50m deep sapphire glacial trough

  // Occasional dramatic mossy basalt islet rising out of deep glacial blue water (~48% of grand lakes)
  const hasIslet = h7 > 0.52;
  const isletAng = h6 * Math.PI * 2.0;
  const isletDist = avgR * (0.14 + h3 * 0.22);

  const lake = {
    id: `M_${mx}_${mz}`,
    tier: 'macro',
    mx,
    mz,
    cx,
    cz,
    rx,
    rz,
    avgR,
    boundR,
    rot,
    cosR,
    sinR,
    waterY,
    maxDepth,
    shelfWidth: clamp(avgR * 0.055, 22.0, 90.0),
    deepWidth: clamp(avgR * 0.24, 95.0, 520.0),
    shoreGrade,
    freq: clamp(1.45 / Math.max(avgR, 900.0), 0.00038, 0.00115),
    seedOff: (mx * 17.3 - mz * 29.1) + h1 * 19.0,
    lobePhase: h4 * Math.PI * 2.0,
    hasIslet,
    isletX: cx + Math.cos(isletAng) * isletDist,
    isletZ: cz + Math.sin(isletAng) * isletDist,
    isletR: 26.0 + h5 * 34.0,
    isletH: 9.0 + h2 * 15.0
  };
  _macroLakeCache.set(key, lake);
  return lake;
}

/**
 * Tier B: Medium Glacial Valley & Alpine Tarn Lakes (230 m .. 1000 m across)
 * Deterministic per 1550m grid cell, automatically avoiding overlap with multi-km Grand Lakes.
 */
function getMediumLake(lx, lz) {
  const key = ((lx + 4096) << 13) | (lz + 4096);
  if (_medLakeCache.has(key)) return _medLakeCache.get(key);

  const isOrigin = lx === 0 && lz === 0;
  const h0 = hash2i(lx, lz, _seedInt + 1409);
  if (!isOrigin && h0 < 0.36) {
    _medLakeCache.set(key, null);
    return null;
  }

  const h1 = hash2i(lx, lz, _seedInt + 1423);
  const h2 = hash2i(lx, lz, _seedInt + 1439);
  const h3 = hash2i(lx, lz, _seedInt + 1451);
  const h4 = hash2i(lx, lz, _seedInt + 1471);
  const h5 = hash2i(lx, lz, _seedInt + 1483);
  const h6 = hash2i(lx, lz, _seedInt + 1499);

  let rx, rz, cx, cz, rot;
  if (isOrigin) {
    // Guaranteed breathtaking 360m..1000m scenic glacial lake right near the origin sector!
    rx = 180.0 + h2 * 320.0;
    rz = rx * (0.54 + h3 * 0.26);
    // Offset cleanly from origin (0,0) and opposite the origin macro-lake direction so both sit in distinct vistas!
    const originMacro = getMacroLake(0, 0);
    const macroAng = originMacro ? Math.atan2(originMacro.cz, originMacro.cx) : 0.0;
    const ang = macroAng + Math.PI * (0.68 + h1 * 0.64);
    const dist = rx * 1.46 + 185.0;
    cx = Math.cos(ang) * dist;
    cz = Math.sin(ang) * dist;
    rot = ang + Math.PI * 0.42 + (h4 - 0.5) * 0.6;
  } else {
    rx = 115.0 + h2 * 385.0; // Diameter 230 m .. 1000 m (1 km)
    rz = rx * (0.48 + h3 * 0.36);
    const maxJit = MED_LAKE_CELL * 0.16;
    cx = lx * MED_LAKE_CELL + (h1 - 0.5) * 2.0 * maxJit;
    cz = lz * MED_LAKE_CELL + (h4 - 0.5) * 2.0 * maxJit;
    rot = h5 * Math.PI;
  }

  const avgR = (rx + rz) * 0.5;
  const shoreGrade = clamp(avgR * 0.36, 55.0, 130.0);
  const boundR = Math.max(rx, rz) * 1.56 + shoreGrade + 20.0;

  // Avoid colliding with any nearby multi-km Grand Glacial Lake
  const pmx = Math.round(cx / MACRO_LAKE_CELL);
  const pmz = Math.round(cz / MACRO_LAKE_CELL);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ml = getMacroLake(pmx + dx, pmz + dz);
      if (ml && Math.hypot(cx - ml.cx, cz - ml.cz) < ml.boundR + boundR + 80.0) {
        _medLakeCache.set(key, null);
        return null;
      }
    }
  }

  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const waterY = computeLakeWaterY(cx, cz, rx, rz, cosR, sinR);

  const maxDepth = 7.5 + h6 * 10.5; // 7.5m..18m deep turquoise-to-cobalt glacial lake

  const lake = {
    id: `S_${lx}_${lz}`,
    tier: 'medium',
    mx: lx,
    mz: lz,
    cx,
    cz,
    rx,
    rz,
    avgR,
    boundR,
    rot,
    cosR,
    sinR,
    waterY,
    maxDepth,
    shelfWidth: clamp(avgR * 0.085, 11.0, 26.0),
    deepWidth: clamp(avgR * 0.34, 42.0, 110.0),
    shoreGrade,
    freq: 0.0042,
    seedOff: (lx * 23.7 + lz * 13.9) + h1 * 17.0,
    lobePhase: h4 * Math.PI * 2.0,
    hasIslet: false,
    isletX: cx,
    isletZ: cz,
    isletR: 0,
    isletH: 0
  };
  _medLakeCache.set(key, lake);
  return lake;
}

/** Evaluate exact organic signed distance (in meters; >0 inside lake, <0 outside on land) & bathymetry for one lake. */
export function evalSingleLake(lake, x, z, out) {
  const dx = x - lake.cx;
  const dz = z - lake.cz;
  const dSq = dx * dx + dz * dz;
  if (dSq > lake.boundR * lake.boundR) {
    out.inside = false;
    out.shoreMeters = -9999.0;
    out.bedDepth = 0.0;
    out.isletBoost = 0.0;
    return false;
  }

  const ux = (dx * lake.cosR + dz * lake.sinR) / lake.rx;
  const vz = (-dx * lake.sinR + dz * lake.cosR) / lake.rz;
  const baseR = Math.hypot(ux, vz);
  if (baseR > 1.62) {
    out.inside = false;
    out.shoreMeters = -9999.0;
    out.bedDepth = 0.0;
    out.isletBoost = 0.0;
    return false;
  }

  const ang = Math.atan2(vz, ux);
  const f = lake.freq;
  const w1 = (fbm2(x * f + lake.seedOff, z * f - lake.seedOff * 0.7, 3, _seedInt + 1103) - 0.5) * 0.44;
  const w2 = (fbm2(x * f * 2.75 - lake.seedOff * 1.3, z * f * 2.75 + lake.seedOff, 2, _seedInt + 1117) - 0.5) * 0.16;
  const lobe = Math.sin(ang * 2.0 + lake.lobePhase) * 0.10 + Math.cos(ang * 3.0 - lake.lobePhase * 1.35) * 0.07;
  const effR = baseR + w1 + w2 + lobe;
  let shoreMeters = (1.0 - effR) * lake.avgR;

  let isletBoost = 0.0;
  if (lake.hasIslet && shoreMeters > 10.0) {
    const id = Math.hypot(x - lake.isletX, z - lake.isletZ);
    if (id < lake.isletR * 1.9) {
      const iw = (fbm2(x * 0.04 + 2.3, z * 0.04 - 1.9, 2, _seedInt + 1163) - 0.5) * lake.isletR * 0.45;
      const ir = id + iw;
      if (ir < lake.isletR * 1.55) {
        const rise = 1.0 - smoothstep(lake.isletR * 0.25, lake.isletR * 1.45, ir);
        isletBoost = rise * rise * (lake.isletH + 6.0);
        // Pull shoreMeters negative right over the emerged rocky islet so foam wraps around the island!
        shoreMeters = Math.min(shoreMeters, (ir - lake.isletR * 0.85));
      }
    }
  }

  let bedDepth = 0.0;
  if (shoreMeters > 0.0) {
    const tShelf = smoothstep(0.0, lake.shelfWidth, shoreMeters);
    const tDeep = smoothstep(lake.shelfWidth * 0.5, lake.deepWidth, shoreMeters);
    const bedVar = (fbm2(x * 0.015 + 3.1, z * 0.015 - 4.7, 2, _seedInt + 1151) - 0.5) * 2.2 * tShelf;
    bedDepth = Math.max(0.0, tShelf * 3.6 + tDeep * (lake.maxDepth - 3.6) + bedVar);
  }

  out.inside = shoreMeters > 0.0;
  out.shoreMeters = shoreMeters;
  out.bedDepth = bedDepth;
  out.isletBoost = isletBoost;
  return shoreMeters > -lake.shoreGrade;
}

const _lakeEvalTmp = { inside: false, shoreMeters: -9999, bedDepth: 0, isletBoost: 0 };

/**
 * Sample combined glacial lake influence at world (x, z).
 * Fast bounding-sphere early-out across 3x3 macro + 3x3 medium lake grids.
 */
export function sampleLake(x, z, out = null) {
  const res = out || {
    lake: null,
    shoreMeters: -9999.0,
    bedDepth: 0.0,
    waterY: 16.0,
    shoreGrade: 60.0,
    isletBoost: 0.0
  };
  res.lake = null;
  res.shoreMeters = -9999.0;
  res.bedDepth = 0.0;
  res.waterY = 16.0;
  res.shoreGrade = 60.0;
  res.isletBoost = 0.0;

  const pmx = Math.round(x / MACRO_LAKE_CELL);
  const pmz = Math.round(z / MACRO_LAKE_CELL);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ml = getMacroLake(pmx + dx, pmz + dz);
      if (!ml) continue;
      if (evalSingleLake(ml, x, z, _lakeEvalTmp)) {
        if (_lakeEvalTmp.shoreMeters > res.shoreMeters) {
          res.lake = ml;
          res.shoreMeters = _lakeEvalTmp.shoreMeters;
          res.bedDepth = _lakeEvalTmp.bedDepth;
          res.waterY = ml.waterY;
          res.shoreGrade = ml.shoreGrade;
          res.isletBoost = _lakeEvalTmp.isletBoost;
        }
      }
    }
  }

  const plx = Math.round(x / MED_LAKE_CELL);
  const plz = Math.round(z / MED_LAKE_CELL);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sl = getMediumLake(plx + dx, plz + dz);
      if (!sl) continue;
      if (evalSingleLake(sl, x, z, _lakeEvalTmp)) {
        if (_lakeEvalTmp.shoreMeters > res.shoreMeters) {
          res.lake = sl;
          res.shoreMeters = _lakeEvalTmp.shoreMeters;
          res.bedDepth = _lakeEvalTmp.bedDepth;
          res.waterY = sl.waterY;
          res.shoreGrade = sl.shoreGrade;
          res.isletBoost = _lakeEvalTmp.isletBoost;
        }
      }
    }
  }

  return res;
}

/** Return all active glacial lakes (both multi-km macro and several-hundred-meter medium) within `radius` meters of (x, z). */
export function getActiveLakesAround(x, z, radius = 6800) {
  const out = [];
  const mSpan = Math.ceil((radius + 8500) / MACRO_LAKE_CELL);
  const pmx = Math.round(x / MACRO_LAKE_CELL);
  const pmz = Math.round(z / MACRO_LAKE_CELL);
  for (let dz = -mSpan; dz <= mSpan; dz++) {
    for (let dx = -mSpan; dx <= mSpan; dx++) {
      const ml = getMacroLake(pmx + dx, pmz + dz);
      if (!ml) continue;
      const d = Math.hypot(x - ml.cx, z - ml.cz);
      if (d - ml.boundR <= radius) out.push(ml);
    }
  }

  const sSpan = Math.ceil((radius + 950) / MED_LAKE_CELL);
  const plx = Math.round(x / MED_LAKE_CELL);
  const plz = Math.round(z / MED_LAKE_CELL);
  for (let dz = -sSpan; dz <= sSpan; dz++) {
    for (let dx = -sSpan; dx <= sSpan; dx++) {
      const sl = getMediumLake(plx + dx, plz + dz);
      if (!sl) continue;
      const d = Math.hypot(x - sl.cx, z - sl.cz);
      if (d - sl.boundR <= radius) out.push(sl);
    }
  }
  return out;
}

/** Convenience helper returning the origin sector's scenic medium glacial lake and grand multi-km lake. */
export function getOriginLakes() {
  return {
    medium: getMediumLake(0, 0),
    grand: getMacroLake(0, 0)
  };
}

function sampleBroadPlateau(x, z) {
  // Huge 2.5km..5km+ sweeping Icelandic table-plateaus with gentle rolling hills between distant mountains
  const plateauField = warpedFbm2(x * 0.00024 + 7.2, z * 0.00024 - 4.1, 0.52, 3, _seedInt + 911);
  const plateauGuard = smoothstep(240.0, 680.0, Math.hypot(x, z));
  const mask = smootherstep(0.42, 0.55, plateauField) * plateauGuard;
  if (mask <= 0.001) return { height: 0, rimCliff: 0 };

  const gentleHills =
    (fbm2(x * 0.0024 + 1.5, z * 0.0024 - 2.3, 4, _seedInt + 929) - 0.5) * 24.0 +
    (fbm2(x * 0.0075 - 3.1, z * 0.0075 + 5.2, 3, _seedInt + 937) - 0.5) * 9.0;
  const rimCliff = smoothstep(0.06, 0.35, mask) * (1.0 - smoothstep(0.62, 0.94, mask));
  return {
    height: mask * (54.0 + gentleHills),
    rimCliff
  };
}

function computeLakeWaterY(cx, cz, rx, rz, cosR, sinR) {
  let minShoreH = sampleTerrainBaseElevation(cx, cz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2.0;
    const lx = Math.cos(a) * rx * 0.85;
    const lz = Math.sin(a) * rz * 0.85;
    const wx = cx + lx * cosR - lz * sinR;
    const wz = cz + lx * sinR + lz * cosR;
    const sh = sampleTerrainBaseElevation(wx, wz);
    if (sh < minShoreH) minShoreH = sh;
  }
  return Math.max(14.0, minShoreH - 1.2);
}

/**
 * Base continental elevation (valleys, ridges, plateaus, massifs, mountains) without escarpments or lakes.
 * Safe to call during lake/feature generation without cell-feature recursion.
 */
function sampleTerrainBaseElevation(x, z) {
  const valleyLow = fbm2(x * 0.0014, z * 0.0014, 4, _seedInt + 7);
  const broadRidge = ridged2(x * 0.0016 + 4.2, z * 0.0016 - 2.1, 4, _seedInt + 23);
  const medSwell = fbm2(x * 0.0085, z * 0.0085, 4, _seedInt + 41);
  const rollingMound = (fbm2(x * 0.022 + 2.3, z * 0.022 - 3.7, 3, _seedInt + 59) - 0.5) * 3.6;

  const rangeNoise = warpedFbm2(x * 0.00014 + 3.1, z * 0.00014 - 5.4, 0.56, 3, _seedInt + 811);
  const valleyOpenGuard = smoothstep(1100.0, 2200.0, Math.hypot(x, z));
  const rangePresence = smoothstep(0.60, 0.82, rangeNoise) * valleyOpenGuard;

  // Mid-to-tall broad Icelandic highland massifs (distinct 120m..235m+ volcanic mountains spaced far apart)
  const massifField = warpedFbm2(x * 0.00028 - 4.7, z * 0.00028 + 2.3, 0.48, 3, _seedInt + 823);
  const massifGuard = smoothstep(850.0, 1750.0, Math.hypot(x, z));
  const massifPresence = smoothstep(0.64, 0.88, massifField) * massifGuard;
  const massifShape = fbm2(x * 0.0014 + 1.3, z * 0.0014 - 2.9, 3, _seedInt + 829);
  const massifRidge = ridged2(x * 0.0012 - 3.4, z * 0.0012 + 1.8, 3, _seedInt + 833);
  const highlandMassifH =
    Math.pow(massifPresence, 1.28) * (105.0 + Math.pow(massifShape * 0.55 + massifRidge * 0.45, 1.15) * 105.0);

  const rangeRoll = fbm2(x * 0.00072 - 1.9, z * 0.00072 + 4.3, 4, _seedInt + 839);
  const rangeCrest = ridged2(x * 0.00058 + 2.1, z * 0.00058 - 3.7, 3, _seedInt + 853);
  const broadMountainH =
    Math.pow(rangePresence, 1.35) * 305.0 +
    rangePresence * Math.pow(rangeRoll * 0.60 + rangeCrest * 0.40, 1.18) * 205.0;

  const glacierTrough =
    (1.0 - smoothstep(0.16, 0.50, ridged2(x * 0.00095 + 6.2, z * 0.00095 - 2.8, 3, _seedInt + 877))) *
    smoothstep(0.26, 0.72, rangePresence);

  const ridgeCapped = Math.min(Math.pow(broadRidge, 1.55), 0.74);
  const broadPlateau = sampleBroadPlateau(x, z);
  return (
    12.5 +
    valleyLow * 16.0 +
    ridgeCapped * 24.0 +
    broadPlateau.height +
    highlandMassifH +
    broadMountainH -
    glacierTrough * 22.0 +
    (medSwell - 0.5) * 10.0 +
    rollingMound
  );
}

/**
 * Pure macro geological elevation (valley + broad glaciated mountain ranges + cell basalt escarpments)
 * BEFORE any river carving or micro hummocks. Used to determine clean, smooth mountain overburden for river caves!
 */
export function sampleMacroHeight(x, z) {
  let h = sampleTerrainBaseElevation(x, z);

  const cx = Math.round(x / CELL_SIZE);
  const cz = Math.round(z / CELL_SIZE);
  const neighbors = getNeighborCells(cx, cz);
  for (let ni = 0; ni < 9; ni++) {
    const f = neighbors[ni];
    if (!f.hasEscarpment) continue;
    const relX = x - f.centerX;
    const relZ = z - f.centerZ;
    const distCell = Math.hypot(relX, relZ);
    const cellMask = 1.0 - smoothstep(420, 760, distCell);
    if (cellMask <= 0.001) continue;

    const curve = sampleEscarpmentCurve(x, z, _seedInt);
    const signedD = relX * f.nx + relZ * f.nz + curve;
    const talusU = clamp((signedD + 86.0) / 88.0, 0, 1);
    const fanRib = (fbm2(x * 0.044, z * 0.044, 3, _seedInt + 209) - 0.5) * 5.2 * talusU * (1.0 - talusU * 0.35);
    const talusH = Math.pow(talusU, 2.3) * (f.cliffHeight * 0.38) + fanRib;

    const lowerTier = smootherstep(-8.0, 13.0, signedD);
    const midTier = smootherstep(10.0, 28.0, signedD);
    const upperTier = smootherstep(24.0, 46.0, signedD);
    const strataBench = Math.sin(lowerTier * Math.PI * 4.0) * 2.1 * lowerTier * (1.0 - lowerTier);
    const mesaRaw = fbm2(x * 0.024, z * 0.024, 3, _seedInt + 227);
    const mesaSteps = (Math.floor(mesaRaw * 5.0) + smoothstep(0.18, 0.82, (mesaRaw * 5.0) % 1)) * 2.2;
    const crownCrag = ridged2(x * 0.036, z * 0.036, 3, _seedInt + 251);
    const plateauHill = (fbm2(x * 0.0055, z * 0.0055, 3, _seedInt + 263) - 0.5) * 14.0 * smoothstep(20, 65, signedD);

    const wallH = f.cliffHeight * 0.62;
    let escarpH =
      talusH +
      lowerTier * (wallH * 0.56) +
      midTier * (wallH * 0.28) +
      upperTier * (wallH * 0.16) +
      strataBench +
      smoothstep(-5.0, 22.0, signedD) * (mesaSteps + (crownCrag - 0.5) * 4.0) +
      plateauHill;

    if (f.waterfall) {
      const wRelX = x - f.waterfall.x;
      const wRelZ = z - f.waterfall.z;
      const alongWf = Math.abs(wRelX * f.tx + wRelZ * f.tz);
      const wfCleft = Math.exp(-Math.pow(alongWf / 12.0, 2)) * smoothstep(-6, 46, signedD) * 12.0;
      const plungeD = Math.hypot(x - f.waterfall.plungeX, z - f.waterfall.plungeZ);
      const plungeBasin = (1.0 - smoothstep(10, 28, plungeD)) * 5.2;
      escarpH -= (wfCleft + plungeBasin);
    }
    h += escarpH * cellMask;
  }

  // Respect glacial lake basins so subterranean river cave overburden stays 100% consistent (no cave roofs over lakes!)
  const lk = sampleLake(x, z, _macroLakeTmp);
  if (lk.lake && lk.shoreMeters > -lk.shoreGrade) {
    if (lk.shoreMeters > 0.0) {
      h = lk.waterY - lk.bedDepth;
    } else {
      const uS = clamp(-lk.shoreMeters / lk.shoreGrade, 0.0, 1.0);
      const hDry = Math.max(h, lk.waterY + smoothstep(0.0, 0.35, uS) * 2.2);
      h = mix(lk.waterY, hDry, smoothstep(0.0, 1.0, uS));
    }
  }
  return h;
}
const _macroLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };

function sampleTrunkOverSlice(bandIdx, zi) {
  const key = ((bandIdx + 256) << 18) ^ (zi + 131072);
  let v = _trunkOverCache.get(key);
  if (v !== undefined) return v;
  const z = zi * 4.0;
  const rx = getTrunkRiverX(z, bandIdx);
  // Suppress subterranean cave overburden near/inside glacial lakes so hills at lake shores never open cave cutouts
  const lk = sampleLake(rx, z, _trunkLakeTmp);
  if (lk.lake && lk.shoreMeters > -lk.shoreGrade * 0.6) {
    v = 0.0;
    if (_trunkOverCache.size > 32768) _trunkOverCache.clear();
    _trunkOverCache.set(key, v);
    return v;
  }
  // 3-point smoothed macro overburden directly along the river centerline -> zero lateral canyon wall artifacts!
  const h0 = sampleMacroHeight(rx, z);
  const hPrev = sampleMacroHeight(getTrunkRiverX(z - 8.0, bandIdx), z - 8.0);
  const hNext = sampleMacroHeight(getTrunkRiverX(z + 8.0, bandIdx), z + 8.0);
  const smoothH = h0 * 0.50 + (hPrev + hNext) * 0.25;
  v = smoothH - getTrunkWaterYAt(rx, z, lk);
  if (lk.lake && lk.shoreMeters > -lk.shoreGrade * 1.4) {
    v *= 1.0 - smoothstep(-lk.shoreGrade * 1.4, -lk.shoreGrade * 0.6, lk.shoreMeters);
  }
  if (_trunkOverCache.size > 32768) _trunkOverCache.clear();
  _trunkOverCache.set(key, v);
  return v;
}

/** Smooth, cached mountain overburden directly along the trunk river centerline at world z. */
export function getTrunkCenterOverburden(z, bandIdx = 0) {
  const zf = z * 0.25;
  const zi = Math.floor(zf);
  const frac = zf - zi;
  return mix(sampleTrunkOverSlice(bandIdx, zi), sampleTrunkOverSlice(bandIdx, zi + 1), frac);
}

function getNeighborCells(cx, cz) {
  const k = ((cx + 4096) << 13) | (cz + 4096);
  let arr = _neighCache.get(k);
  if (arr) return arr;
  arr = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      arr.push(getCellFeatures(cx + dx, cz + dz));
    }
  }
  _neighCache.set(k, arr);
  return arr;
}

export function getWorldSeed() {
  return _seedStr;
}

/**
 * Compute smooth organic lateral curvature along a cell's escarpment fault line
 * so the cliff edge weaves into natural headlands & recessed amphitheaters.
 */
function sampleEscarpmentCurve(x, z, seedBase) {
  const w = (warpedFbm2(x * 0.0042, z * 0.0042, 0.78, 3, seedBase + 109) - 0.5) * 112.0;
  const r = (ridged2(x * 0.015, z * 0.015, 3, seedBase + 157) - 0.5) * 20.0;
  return w + r;
}

/**
 * Deterministic macro-geology, hydrology, villages & landmarks for an 800m x 800m cell (cx, cz).
 * Purely procedural for ALL seeds — zero hardcoded special-case layouts!
 */
export function getCellFeatures(cx, cz) {
  const key = `${cx},${cz}`;
  let feat = _cellCache.get(key);
  if (feat) return feat;

  const h0 = hash2i(cx, cz, _seedInt + 11);
  const h1 = hash2i(cx, cz, _seedInt + 29);
  const h2 = hash2i(cx, cz, _seedInt + 47);
  const h3 = hash2i(cx, cz, _seedInt + 71);
  const h4 = hash2i(cx, cz, _seedInt + 97);
  const h5 = hash2i(cx, cz, _seedInt + 131);
  const h6 = hash2i(cx, cz, _seedInt + 167);
  const h7 = hash2i(cx, cz, _seedInt + 199);

  const originX = cx * CELL_SIZE;
  const originZ = cz * CELL_SIZE;
  const isOriginCell = cx === 0 && cz === 0;

  // 1. Stepped Basalt Escarpment (~76% of all cells; always present near origin valley)
  const hasEscarpment = isOriginCell || h0 > 0.24;
  // Normal (nx, nz) points FROM the mossy valley UP onto the basalt escarpment plateau
  const angle = (h1 - 0.5) * Math.PI * 2.0;
  const nx = Math.cos(angle);
  const nz = Math.sin(angle);
  const tx = -nz; // Tangent along escarpment wall
  const tz = nx;

  // Offset escarpment center slightly to one side so a generous mossy valley lies in front of it
  const centerX = originX + nx * (70 + (h2 - 0.5) * 110) + tx * ((h3 - 0.5) * 140);
  const centerZ = originZ + nz * (70 + (h2 - 0.5) * 110) + tz * ((h3 - 0.5) * 140);
  const cliffHeight = 72 + h4 * 56; // 72m..128m dramatic Icelandic basalt cliff walls

  // 2. Waterfall & Hydrologically Connected Tributary Stream merging seamlessly into the Infinite Trunk River!
  const hasRiver = isOriginCell || h2 > 0.26;
  const hasWaterfall = hasEscarpment && hasRiver && (isOriginCell || h3 > 0.30);

  let waterfall = null;
  const riverPts = [];

  if (hasWaterfall) {
    // Place waterfall notch right on the curved escarpment edge (keep clear of trunk river channel)
    const alongT = (h5 - 0.5) * 160;
    const approxX = centerX + tx * alongT;
    const approxZ = centerZ + tz * alongT;
    const curveOff = sampleEscarpmentCurve(approxX, approxZ, _seedInt);
    const wfX = approxX - nx * curveOff;
    const wfZ = approxZ - nz * curveOff;

    // Valley floor plunge pool directly out in front of the cliff face (-nx, -nz)
    const plungeX = wfX - nx * 24.0;
    const plungeZ = wfZ - nz * 24.0;

    // Never spawn a waterfall if a glacial lake basin has carved away the escarpment cliff or plunge valley
    const _wfLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };
    sampleLake(wfX, wfZ, _wfLakeTmp);
    const wfInLake = _wfLakeTmp.lake !== null && _wfLakeTmp.shoreMeters > -Math.max(48.0, _wfLakeTmp.shoreGrade * 0.55);
    sampleLake(wfX + nx * 18.0, wfZ + nz * 18.0, _wfLakeTmp);
    const crestInLake = _wfLakeTmp.lake !== null && _wfLakeTmp.shoreMeters > -32.0;
    sampleLake(plungeX, plungeZ, _wfLakeTmp);
    const plungeInLake = _wfLakeTmp.lake !== null && _wfLakeTmp.shoreMeters > -18.0;

    if (!wfInLake && !crestInLake && !plungeInLake) {
      waterfall = {
        x: wfX,
        z: wfZ,
        plungeX,
        plungeZ,
        nx: -nx, // Points OUT from cliff toward valley plunge pool
        nz: -nz,
        cliffHeight,
        yaw: Math.atan2(-nx, -nz)
      };

      // Route waterfall outflow tributary smoothly downstream to CONNECT DIRECTLY into the nearest infinite trunk river!
      const tBand = Math.round(plungeX / TRUNK_SPACING);
      const estZ = plungeZ - nz * 240.0 + (h6 > 0.5 ? 95.0 : -95.0);
      const confZ = estZ;
      const confX = getTrunkRiverX(confZ, tBand);
      const confDxDz = (getTrunkRiverX(confZ + 6.0, tBand) - getTrunkRiverX(confZ - 6.0, tBand)) / 12.0;
      const confTlen = Math.hypot(confDxDz, 1.0);
      const confDirX = confDxDz / confTlen;
      const confDirZ = 1.0 / confTlen;
      // Pick downstream merge tangent consistent with approach direction
      const approachDot = (confX - plungeX) * confDirX + (confZ - plungeZ) * confDirZ;
      const mergeSign = approachDot >= 0 ? 1.0 : -1.0;

      // Cubic Hermite curve: exits plunge pool along (-nx, -nz) -> merges smoothly tangent-aligned into trunk river!
      const distToConf = clamp(Math.hypot(confX - plungeX, confZ - plungeZ), 120.0, 950.0);
      const m0x = -nx * distToConf * 0.55;
      const m0z = -nz * distToConf * 0.55;
      const m1x = confDirX * mergeSign * distToConf * 0.45;
      const m1z = confDirZ * mergeSign * distToConf * 0.45;
      // Extend slightly into trunk river center so water sheets overlap seamlessly at the confluence!
      const endX = confX + confDirX * mergeSign * 18.0;
      const endZ = confZ + confDirZ * mergeSign * 18.0;

      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        const px = h00 * plungeX + h10 * m0x + h01 * endX + h11 * m1x;
        const pz = h00 * plungeZ + h10 * m0z + h01 * endZ + h11 * m1z;
        const meander = Math.sin(t * Math.PI * 2.0 + h1 * 4.0) * 18.0 * Math.sin(t * Math.PI);
        const perpX = -(endZ - plungeZ) / Math.max(distToConf, 1.0);
        const perpZ = (endX - plungeX) / Math.max(distToConf, 1.0);
        const rx = px + perpX * meander;
        const rz = pz + perpZ * meander;
        riverPts.push({ x: rx, z: rz });
        // Terminate tributary cleanly at the lake shore so it never crosses a glacial lake
        sampleLake(rx, rz, _wfLakeTmp);
        if (_wfLakeTmp.lake && _wfLakeTmp.shoreMeters > 4.0) {
          break;
        }
      }
    }
  }

  // Helper: check distance from rivers AND ensure landmarks never spawn underwater inside glacial lakes!
  const riverDistAt = (px, pz) => {
    let bestD = getNearestTrunkDist(px, pz);
    if (riverPts.length >= 2) {
      distToPolyline2D(px, pz, riverPts, _polyTmp);
      if (_polyTmp.dist < bestD) bestD = _polyTmp.dist;
    }
    return bestD;
  };
  const _cellLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };
  const isWetInLake = (px, pz, margin = 16.0) => {
    sampleLake(px, pz, _cellLakeTmp);
    return _cellLakeTmp.lake !== null && _cellLakeTmp.shoreMeters > -margin;
  };

  // 3. Small Icelandic Village (~58% of cells; always spawned in origin cell valley so players can discover it!)
  let village = null;
  const hasVillage = isOriginCell || h5 > 0.42;
  if (hasVillage) {
    // Place village in the scenic valley in front of the cliff, offset safely to one side of the river & dry of any lake
    const vSide = h6 > 0.5 ? -1 : 1; // Opposite side of river drift for natural scenic balance
    let vx = originX - nx * (155 + h3 * 90) + tx * (vSide * (78 + h7 * 75));
    let vz = originZ - nz * (155 + h3 * 90) + tz * (vSide * (78 + h7 * 75));

    // Nudge smoothly away if too close to river channel
    if (riverDistAt(vx, vz) < 42) {
      vx += tx * vSide * 58;
      vz += tz * vSide * 58;
    }
    // If candidate village lands in a glacial lake, try nudging cleanly onto the scenic dry lakeshore!
    if (isWetInLake(vx, vz, 58.0)) {
      const altVx = originX - nx * (155 + h3 * 90) - tx * (vSide * (92 + h7 * 75));
      const altVz = originZ - nz * (155 + h3 * 90) - tz * (vSide * (92 + h7 * 75));
      if (!isWetInLake(altVx, altVz, 54.0)) {
        vx = altVx;
        vz = altVz;
      }
    }

    if (!isWetInLake(vx, vz, 46.0)) {
    const houseCount = 6 + Math.floor(h7 * 3); // 6..8 traditional Icelandic turf cottages, barns & black kirkja church
    const buildings = [];
    const baseYaw = Math.atan2(nx, nz); // Oriented organically relative to valley & escarpment

    // Iconic Black-Timber Icelandic Church (Búðakirkja style) standing prominently on village eastern edge
    if (!isWetInLake(vx + tx * 21.0 + nx * 6.0, vz + tz * 21.0 + nz * 6.0, 14.0)) {
      buildings.push({
        kind: 'church',
        x: vx + tx * 21.0 + nx * 6.0,
        z: vz + tz * 21.0 + nz * 6.0,
        yaw: baseYaw + Math.PI * 0.5 + (h1 - 0.5) * 0.35,
        radius: 8.5
      });
    }

    // Organic Icelandic hamlet cluster: mostly low-slung mossy turf farmhouses + 2-3 weathered silver-timber barns
    const villageLanePts = [
      { x: vx - tx * 34 - nx * 16, z: vz - tz * 34 - nz * 16 },
      { x: vx - tx * 10 - nx * 6,  z: vz - tz * 10 - nz * 6 },
      { x: vx + tx * 8  - nx * 2,  z: vz + tz * 8  - nz * 2 },
      { x: vx + tx * 22 + nx * 1,  z: vz + tz * 22 + nz * 1 }
    ];

    for (let b = 0; b < houseCount; b++) {
      // Arrange turf houses along gentle arc behind the lane, timber barns slightly forward by the paddock!
      const isFrontBarn = b < 2;
      const along = ((b / Math.max(houseCount - 1, 1)) - 0.5) * 48.0 + (hash2i(cx * 17 + b, cz, _seedInt + 401) - 0.5) * 8.0;
      const depth = isFrontBarn
        ? -13.0 - hash2i(b, cz * 19, _seedInt + 419) * 10.0
        : 4.0 + hash2i(cx, b * 23, _seedInt + 421) * 18.0;
      const bx = vx + tx * along + nx * depth;
      const bz = vz + tz * along + nz * depth;

      let overlap = false;
      for (const ex of buildings) {
        if (Math.hypot(ex.x - bx, ex.z - bz) < 12.0) {
          overlap = true;
          break;
        }
      }
      if (overlap || riverDistAt(bx, bz) < 22 || isWetInLake(bx, bz, 14.0)) continue;

      const styleR = hash2i(cx + b * 7, cz + b * 13, _seedInt + 439);
      const kind = isFrontBarn ? 'weathered_barn' : (styleR < 0.78 ? 'turf_cottage' : 'weathered_barn');
      const roofStyle = hash2i(b, cx * 19 + cz * 23, _seedInt + 467);
      // Orient cottages & barns naturally toward the open valley/lane (baseYaw + PI) with organic variation
      buildings.push({
        kind,
        x: bx,
        z: bz,
        yaw: baseYaw + Math.PI + (isFrontBarn ? (b === 0 ? 0.22 : -0.18) : (hash2i(b, cx, _seedInt + 491) - 0.5) * 0.55),
        scale: 0.90 + hash2i(cz, b, _seedInt + 509) * 0.24,
        roofStyle,
        hasSmoke: kind === 'turf_cottage' && b < 4,
        radius: 5.8
      });
    }

    // Subtle rustic dark-iron yard lanterns (quiet in daylight, warm glow at dusk/night)
    const lamps = [];
    for (let l = 0; l < 3; l++) {
      const pt = villageLanePts[l];
      if (!isWetInLake(pt.x + nx * 3.8, pt.z + nz * 3.8, 10.0)) {
        lamps.push({ x: pt.x + nx * 3.8, z: pt.z + nz * 3.8 });
      }
    }

    if (buildings.length > 0) {
      village = {
        x: vx,
        z: vz,
        radius: 44.0,
        yaw: baseYaw,
        tx,
        tz,
        nx,
        nz,
        lanePts: villageLanePts,
        buildings,
        lamps
      };
    }
    }
  }

  // 4. Bridges Research Outpost Dome + Trail Guide Beacons (~45% of cells, well separated from village)
  const outposts = [];
  const beacons = [];
  if (h0 > 0.52 || (isOriginCell && h4 > 0.35)) {
    const oSide = h6 > 0.5 ? 1 : -1;
    let ox = originX - nx * (190 + h4 * 75) + tx * (oSide * (125 + h2 * 65));
    let oz = originZ - nz * (190 + h4 * 75) + tz * (oSide * (125 + h2 * 65));
    if (village && Math.hypot(ox - village.x, oz - village.z) < 95) {
      ox += tx * oSide * 90;
      oz += tz * oSide * 90;
    }
    if (riverDistAt(ox, oz) > 26 && getNearestTrunkDist(ox, oz) > 26 && !isWetInLake(ox, oz, 30.0)) {
      outposts.push({ x: ox, z: oz, yaw: h1 * Math.PI * 2 });
      for (let b = 1; b <= 5; b++) {
        const bx = ox - tx * oSide * b * 28 + nx * Math.sin(b * 0.7) * 10;
        const bz = oz - tz * oSide * b * 28 + nz * Math.sin(b * 0.7) * 10;
        if (riverDistAt(bx, bz) > 16 && !isWetInLake(bx, bz, 12.0)) {
          beacons.push({ x: bx, z: bz, kind: b === 3 ? 'amber' : 'cyan' });
        }
      }
    }
  }

  // 5. Weathered Rusted Hydro-Relay / Weather Station (~62% of cells, often perched on a mossy knoll near river)
  const relays = [];
  if (isOriginCell || h1 > 0.38) {
    const rSide = h6 > 0.5 ? 1 : -1;
    let rx = originX - nx * (95 + h7 * 75) + tx * (rSide * (70 + h3 * 70));
    let rz = originZ - nz * (95 + h7 * 75) + tz * (rSide * (70 + h3 * 70));
    if (riverDistAt(rx, rz) < 20) {
      rx += tx * rSide * 28;
      rz += tz * rSide * 28;
    }
    if ((!village || Math.hypot(rx - village.x, rz - village.z) > 48) && !isWetInLake(rx, rz, 18.0)) {
      relays.push({ x: rx, z: rz, yaw: h4 * Math.PI * 2 });
    }
  }

  // 6. Geothermal Hot Springs (steaming milky-turquoise pools with sinter crust) & Fumaroles
  const hotSprings = [];
  const fumaroles = [];
  if (h4 > 0.32 || isOriginCell) {
    const hsCount = 1 + (h7 > 0.65 ? 1 : 0);
    for (let i = 0; i < hsCount; i++) {
      const hsx = originX - nx * (115 + hash2i(cx + i, cz, _seedInt + 601) * 145) + tx * ((hash2i(cx, cz + i, _seedInt + 617) - 0.5) * 320);
      const hsz = originZ - nz * (115 + hash2i(cx + i, cz, _seedInt + 601) * 145) + tz * ((hash2i(cx, cz + i, _seedInt + 617) - 0.5) * 320);
      if (
        riverDistAt(hsx, hsz) > 24 &&
        getNearestTrunkDist(hsx, hsz) > 24 &&
        (!village || Math.hypot(hsx - village.x, hsz - village.z) > 52) &&
        outposts.every((op) => Math.hypot(hsx - op.x, hsz - op.z) > 45) &&
        !isWetInLake(hsx, hsz, 22.0)
      ) {
        const hsRad = 5.5 + hash2i(i, cx, _seedInt + 641) * 4.5;
        const hC = sampleTerrainBaseElevation(hsx, hsz);
        const hN = sampleTerrainBaseElevation(hsx, hsz + hsRad * 2.2);
        const hS = sampleTerrainBaseElevation(hsx, hsz - hsRad * 2.2);
        const hE = sampleTerrainBaseElevation(hsx + hsRad * 2.2, hsz);
        const hW = sampleTerrainBaseElevation(hsx - hsRad * 2.2, hsz);
        const relief = Math.max(hC, hN, hS, hE, hW) - Math.min(hC, hN, hS, hE, hW);
        if (relief < 4.5) {
          hotSprings.push({ x: hsx, z: hsz, radius: hsRad });
        }
      }
    }
  }
  if (isOriginCell || h3 > 0.30) {
    const count = isOriginCell ? 5 : (2 + Math.floor(h2 * 4));
    for (let i = 0; i < count; i++) {
      const fx = originX - nx * (85 + hash2i(cx + i, cz, _seedInt + 313) * 195) + tx * ((hash2i(cx, cz + i, _seedInt + 521) - 0.5) * 360);
      const fz = originZ - nz * (85 + hash2i(cx + i, cz, _seedInt + 313) * 195) + tz * ((hash2i(cx, cz + i, _seedInt + 521) - 0.5) * 360);
      if (riverDistAt(fx, fz) > 16 && !isWetInLake(fx, fz, 14.0)) fumaroles.push({ x: fx, z: fz });
    }
  }

  // 7. Hexagonal Basalt Column Clusters (iconic Svartifoss/Reynisdrangar volcanic organ pipes!)
  const basaltColumns = [];
  if (hasEscarpment) {
    const colCount = 3 + Math.floor(h5 * 3);
    for (let i = 0; i < colCount; i++) {
      const along = (hash2i(cx * 17 + i, cz * 29, _seedInt + 701) - 0.5) * 320;
      const ax = centerX + tx * along;
      const az = centerZ + tz * along;
      const cOff = sampleEscarpmentCurve(ax, az, _seedInt);
      // Nestled right at the rocky foot of the escarpment talus
      const bx = ax - nx * (cOff + 34 + hash2i(i, cx, _seedInt + 719) * 28);
      const bz = az - nz * (cOff + 34 + hash2i(i, cx, _seedInt + 719) * 28);
      if (riverDistAt(bx, bz) > 18 && (!village || Math.hypot(bx - village.x, bz - village.z) > 45) && !isWetInLake(bx, bz, 10.0)) {
        basaltColumns.push({
          x: bx,
          z: bz,
          scale: 0.85 + hash2i(cz, i, _seedInt + 733) * 0.75,
          seed: cx * 97 + cz * 53 + i * 19
        });
      }
    }
  }

  // 8. Natural Winding Footpath linking Village -> River Crossing / Valley Trail -> Outpost
  const pathPts = [];
  const bridges = [];
  const cairns = [];

  if (village) {
    const targetX = outposts.length > 0 ? outposts[0].x : (waterfall ? waterfall.plungeX - nx * 95 : village.x + tx * 160);
    const targetZ = outposts.length > 0 ? outposts[0].z : (waterfall ? waterfall.plungeZ - nz * 95 : village.z + tz * 160);
    const dx = targetX - village.x;
    const dz = targetZ - village.z;
    const len = Math.hypot(dx, dz) || 1;
    const pnx = -dz / len;
    const pnz = dx / len;
    for (let i = 0; i <= 7; i++) {
      const f = i / 7;
      const sway = Math.sin(f * Math.PI * 1.8 + h0 * 3.0) * 16.0 * Math.sin(f * Math.PI);
      const px = mix(village.x, targetX, f) + pnx * sway;
      const pz = mix(village.z, targetZ, f) + pnz * sway;
      pathPts.push({ x: px, z: pz });
    }

    // Place a weathered timber footbridge if the river passes within walkable distance of the village
    if (riverPts.length >= 4) {
      const midIdx = Math.min(4, riverPts.length - 2);
      const ra = riverPts[midIdx];
      const rb = riverPts[midIdx + 1];
      const mx = (ra.x + rb.x) * 0.5;
      const mz = (ra.z + rb.z) * 0.5;
      const rtx = rb.x - ra.x;
      const rtz = rb.z - ra.z;
      // Span perpendicular (across) the river channel rather than along its flow tangent
      const crossYaw = Math.atan2(-rtz, rtx);
      if (!isWetInLake(mx, mz, 14.0)) {
        bridges.push({ x: mx, z: mz, yaw: crossYaw, span: 28.0 });
      }
    }

    // Traditional stacked basalt stone traveler cairns (vörður) along trail
    for (let c = 1; c <= 4; c++) {
      const pt = pathPts[Math.min(c * 2 - 1, pathPts.length - 1)];
      if (pt && riverDistAt(pt.x, pt.z) > 16 && !isWetInLake(pt.x, pt.z, 12.0)) {
        cairns.push({
          x: pt.x + pnx * (c % 2 === 0 ? 3.5 : -3.5),
          z: pt.z + pnz * (c % 2 === 0 ? 3.5 : -3.5),
          seed: cx * 41 + cz * 73 + c * 17
        });
      }
    }
  } else {
    // Wilderness trail cairns even in uninhabited highland cells
    for (let c = 0; c < 3; c++) {
      const cxp = originX - nx * (120 + c * 55) + tx * ((hash2i(cx + c, cz, _seedInt + 811) - 0.5) * 220);
      const czp = originZ - nz * (120 + c * 55) + tz * ((hash2i(cx, cz + c, _seedInt + 827) - 0.5) * 220);
      if (riverDistAt(cxp, czp) > 18 && !isWetInLake(cxp, czp, 12.0)) {
        cairns.push({ x: cxp, z: czp, seed: cx * 31 + cz * 67 + c * 23 });
      }
    }
  }

  // 9. Procedural Orographic Cliff-Clinging Mist Banks along the cell's basalt escarpment crest
  const cliffMist = [];
  if (hasEscarpment) {
    const mistCount = 6;
    for (let m = 0; m < mistCount; m++) {
      const along = ((m / (mistCount - 1)) - 0.5) * 440;
      const ax = centerX + tx * along;
      const az = centerZ + tz * along;
      const cOff = sampleEscarpmentCurve(ax, az, _seedInt);
      const mx = ax - nx * (cOff + 14.0);
      const mz = az - nz * (cOff + 14.0);
      cliffMist.push({
        x: mx,
        z: mz,
        yOffset: cliffHeight * (0.72 + hash2i(m, cx * 13 + cz * 19, _seedInt + 907) * 0.24),
        sx: 78 + hash2i(m, 1, _seedInt + 911) * 68,
        sy: 26 + hash2i(m, 2, _seedInt + 911) * 16,
        op: 0.28 + hash2i(m, 3, _seedInt + 911) * 0.14
      });
    }
  }

  feat = {
    cx,
    cz,
    hasEscarpment,
    nx,
    nz,
    tx,
    tz,
    centerX,
    centerZ,
    cliffHeight,
    hasRiver,
    riverPts,
    waterfall,
    village,
    outposts,
    relays,
    beacons,
    hotSprings,
    fumaroles,
    basaltColumns,
    bridges,
    cairns,
    pathPts,
    cliffMist
  };
  _cellCache.set(key, feat);
  return feat;
}

/**
 * Unified Pure Procedural Icelandic Terrain & Surface Sampler at world (x, z).
 */
export function sampleWorld(x, z, out = null) {
  const res = out || {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5
  };

  const cx = Math.round(x / CELL_SIZE);
  const cz = Math.round(z / CELL_SIZE);

  // 1. Broad Icelandic Highland Valley & Occasional Colossal, Gently-Sloped Mountain Ranges (2.5km..4.5km wide!)
  const valleyLow = fbm2(x * 0.0014, z * 0.0014, 4, _seedInt + 7);
  const broadRidge = ridged2(x * 0.0016 + 4.2, z * 0.0016 - 2.1, 4, _seedInt + 23);
  const steepCrag = ridged2(x * 0.013 - 1.7, z * 0.013 + 3.9, 4, _seedInt + 37);
  const medSwell = fbm2(x * 0.0085, z * 0.0085, 4, _seedInt + 41);
  const rollingMound = (fbm2(x * 0.022 + 2.3, z * 0.022 - 3.7, 3, _seedInt + 59) - 0.5) * 3.6;

  // Continent-scale broad Icelandic mountain range / shield volcano field (spaced far apart with vast plateaus between!)
  const rangeNoise = warpedFbm2(x * 0.00014 + 3.1, z * 0.00014 - 5.4, 0.56, 3, _seedInt + 811);
  // Keep spawn valley & surrounding plateau open while letting vast mountain ranges rise in the distance
  const valleyOpenGuard = smoothstep(1100.0, 2200.0, Math.hypot(x, z));
  const rangePresence = smoothstep(0.60, 0.82, rangeNoise) * valleyOpenGuard;

  // Mid-to-tall broad Icelandic highland massifs (distinct 120m..235m+ volcanic mountains spaced far apart)
  const massifField = warpedFbm2(x * 0.00028 - 4.7, z * 0.00028 + 2.3, 0.48, 3, _seedInt + 823);
  const massifGuard = smoothstep(850.0, 1750.0, Math.hypot(x, z));
  const massifPresence = smoothstep(0.64, 0.88, massifField) * massifGuard;
  const massifShape = fbm2(x * 0.0014 + 1.3, z * 0.0014 - 2.9, 3, _seedInt + 829);
  const massifRidge = ridged2(x * 0.0012 - 3.4, z * 0.0012 + 1.8, 3, _seedInt + 833);
  const highlandMassifH =
    Math.pow(massifPresence, 1.28) * (105.0 + Math.pow(massifShape * 0.55 + massifRidge * 0.45, 1.15) * 105.0);

  // Broad, gentle, monumental Icelandic volcanic shield & mountain range spine (10°..20° slopes, peaking 350..510m+!)
  const rangeRoll = fbm2(x * 0.00072 - 1.9, z * 0.00072 + 4.3, 4, _seedInt + 839);
  const rangeCrest = ridged2(x * 0.00058 + 2.1, z * 0.00058 - 3.7, 3, _seedInt + 853);
  const broadMountainH =
    Math.pow(rangePresence, 1.35) * 305.0 +
    rangePresence * Math.pow(rangeRoll * 0.60 + rangeCrest * 0.40, 1.18) * 205.0;

  // Subtle wide U-shaped glacier drainage troughs carved gently into the flanks of these giant mountain ranges
  const glacierTrough =
    (1.0 - smoothstep(0.16, 0.50, ridged2(x * 0.00095 + 6.2, z * 0.00095 - 2.8, 3, _seedInt + 877))) *
    smoothstep(0.26, 0.72, rangePresence);

  const ridgeCapped = Math.min(Math.pow(broadRidge, 1.55), 0.74);
  const broadPlateau = sampleBroadPlateau(x, z);
  let h =
    12.5 +
    valleyLow * 16.0 +
    ridgeCapped * 24.0 +
    broadPlateau.height +
    highlandMassifH +
    broadMountainH -
    glacierTrough * 22.0 +
    (medSwell - 0.5) * 10.0 +
    rollingMound;
  let cliffInfluence = Math.max(
    smoothstep(0.50, 0.78, broadRidge) * smoothstep(0.42, 0.74, steepCrag),
    broadPlateau.rimCliff * 0.88
  );
  let talusScree = glacierTrough * smoothstep(115.0, 175.0, h) * 0.55;
  let wfSprayWet = 0;
  let padFlatten = 0;
  let padTargetY = h;

  // 2. Blend Stepped Basalt Escarpments, Talus Aprons, Waterfall Gorges & Settlement Pads from Nearby Cells
  let riverMask = 0;
  let riverDepth = 0;
  let flowX = 0;
  let flowZ = 1;
  let pathMask = 0;

  const neighbors = getNeighborCells(cx, cz);
  for (let ni = 0; ni < 9; ni++) {
    const f = neighbors[ni];

      if (f.hasEscarpment) {
        const relX = x - f.centerX;
        const relZ = z - f.centerZ;
        const distCell = Math.hypot(relX, relZ);
        const cellMask = 1.0 - smoothstep(420, 760, distCell);
        if (cellMask > 0.001) {
          const curve = sampleEscarpmentCurve(x, z, _seedInt);
          const signedD = relX * f.nx + relZ * f.nz + curve;

          // Concave olive-moss talus apron rising ~38% of cliff height
          const talusU = clamp((signedD + 86.0) / 88.0, 0, 1);
          const fanRib = (fbm2(x * 0.044, z * 0.044, 3, _seedInt + 209) - 0.5) * 5.2 * talusU * (1.0 - talusU * 0.35);
          const talusH = Math.pow(talusU, 2.3) * (f.cliffHeight * 0.38) + fanRib;

          // Multi-tiered flat-topped stepped basalt cliff wall (matching real Icelandic table cliffs!)
          const lowerTier = smootherstep(-8.0, 13.0, signedD);
          const midTier = smootherstep(10.0, 28.0, signedD);
          const upperTier = smootherstep(24.0, 46.0, signedD);
          const strataBench = Math.sin(lowerTier * Math.PI * 4.0) * 2.1 * lowerTier * (1.0 - lowerTier);
          const mesaRaw = fbm2(x * 0.024, z * 0.024, 3, _seedInt + 227);
          const mesaSteps = (Math.floor(mesaRaw * 5.0) + smoothstep(0.18, 0.82, (mesaRaw * 5.0) % 1)) * 2.2;
          const crownCrag = ridged2(x * 0.036, z * 0.036, 3, _seedInt + 251);
          const plateauHill = (fbm2(x * 0.0055, z * 0.0055, 3, _seedInt + 263) - 0.5) * 14.0 * smoothstep(20, 65, signedD);

          const wallH = f.cliffHeight * 0.62;
          let escarpH =
            talusH +
            lowerTier * (wallH * 0.56) +
            midTier * (wallH * 0.28) +
            upperTier * (wallH * 0.16) +
            strataBench +
            smoothstep(-5.0, 22.0, signedD) * (mesaSteps + (crownCrag - 0.5) * 4.0) +
            plateauHill;

          // Recessed gorge cleft & plunge basin where cell waterfall plunges!
          if (f.waterfall) {
            const wRelX = x - f.waterfall.x;
            const wRelZ = z - f.waterfall.z;
            const alongWf = Math.abs(wRelX * f.tx + wRelZ * f.tz);
            const wfCleft = Math.exp(-Math.pow(alongWf / 12.0, 2)) * smoothstep(-6, 46, signedD) * 12.0;
            const plungeD = Math.hypot(x - f.waterfall.plungeX, z - f.waterfall.plungeZ);
            const plungeBasin = (1.0 - smoothstep(10, 28, plungeD)) * 5.2;
            escarpH -= (wfCleft + plungeBasin);
            wfSprayWet = Math.max(wfSprayWet, (1.0 - smoothstep(16, 62, plungeD)) * 0.90);
          }

          h += escarpH * cellMask;

          const steepBand = smoothstep(-9.0, 11.0, signedD) * (1.0 - smoothstep(32.0, 68.0, signedD) * 0.35);
          const screeChutes =
            smoothstep(0.50, 0.78, ridged2(x * 0.065, z * 0.065, 3, _seedInt + 283)) *
            smoothstep(-62, -4, signedD) *
            (1.0 - lowerTier * 0.65);
          cliffInfluence = Math.max(cliffInfluence, (steepBand + screeChutes * 0.42) * cellMask);
          talusScree = Math.max(talusScree, screeChutes * 0.85 * cellMask);
        }
      }

      // Gently level natural terrace pads for villages, outposts, and geothermal hot springs
      // Also paint organic worn gravel/earth farmyard lanes & doorway aprons around village buildings!
      if (f.village) {
        const vd = Math.hypot(x - f.village.x, z - f.village.z);
        if (vd < 110) {
          const wPad = 1.0 - smootherstep(26, 106, vd);
          const vBase = sampleMacroHeight(f.village.x, f.village.z);
          // Retain gentle natural meadow micro-undulation instead of a rigid flat tabletop
          const meadowRoll = (fbm2(x * 0.035, z * 0.035, 2, _seedInt + 731) - 0.5) * 1.4;
          if (wPad > padFlatten) {
            padFlatten = wPad * 0.82;
            padTargetY = vBase + meadowRoll * (1.0 - wPad * 0.6);
          }

          // Worn village gravel lane weaving past barns & church
          if (f.village.lanePts && f.village.lanePts.length >= 2) {
            distToPolyline2D(x, z, f.village.lanePts, _polyTmp);
            const laneWarp = (fbm2(x * 0.16, z * 0.16, 2, _seedInt + 751) - 0.5) * 2.2;
            const laneM = 1.0 - smoothstep(1.8, 4.4, Math.abs(_polyTmp.dist + laneWarp * 0.5));
            pathMask = Math.max(pathMask, laneM * 0.92);
          }

          // Worn earthy gravel farmyard aprons right around building foundations & doorways
          for (let bi = 0; bi < f.village.buildings.length; bi++) {
            const bld = f.village.buildings[bi];
            const bd = Math.hypot(x - bld.x, z - bld.z);
            if (bd < bld.radius + 5.5) {
              const yardNoise = fbm2(x * 0.22 + bi * 3.1, z * 0.22 - bi * 1.7, 2, _seedInt + 769);
              const apron = (1.0 - smoothstep(bld.radius * 0.65, bld.radius + 4.8, bd)) * smoothstep(0.25, 0.72, yardNoise);
              pathMask = Math.max(pathMask, apron * 0.82);
              talusScree = Math.max(talusScree, (1.0 - smoothstep(bld.radius * 0.5, bld.radius + 2.2, bd)) * 0.55);
            }
          }
        }
      }

      for (let oi = 0; oi < f.outposts.length; oi++) {
        const op = f.outposts[oi];
        const od = Math.hypot(x - op.x, z - op.z);
        if (od < 80) {
          const wPad = 1.0 - smootherstep(18, 76, od);
          const oBase = sampleMacroHeight(op.x, op.z);
          if (wPad > padFlatten) {
            padFlatten = wPad * 0.86;
            padTargetY = oBase;
          }
        }
      }

      for (let hi = 0; hi < f.hotSprings.length; hi++) {
        const hs = f.hotSprings[hi];
        const hd = Math.hypot(x - hs.x, z - hs.z);
        if (hd < hs.radius * 4.0) {
          const hsBase = sampleMacroHeight(hs.x, hs.z);
          const rimFlat = 1.0 - smootherstep(hs.radius * 1.35, hs.radius * 3.8, hd);
          h = mix(h, hsBase, rimFlat);
          const basin = 1.0 - smoothstep(hs.radius * 0.55, hs.radius * 1.08, hd);
          h -= basin * 1.25;
          talusScree = Math.max(talusScree, (1.0 - smoothstep(hs.radius * 0.8, hs.radius * 2.0, hd)) * 0.85);
          wfSprayWet = Math.max(wfSprayWet, (1.0 - smoothstep(hs.radius * 0.6, hs.radius * 2.2, hd)) * 0.92);
        }
      }

      // Carve waterfall outflow tributary channel connecting seamlessly into the infinite trunk river!
      if (f.hasRiver && f.riverPts.length >= 2) {
        if (Math.abs(x - f.cx * CELL_SIZE) < 760 && Math.abs(z - f.cz * CELL_SIZE) < 760) {
          distToPolyline2D(x, z, f.riverPts, _polyTmp);
          const rJit = (fbm2(x * 0.08, z * 0.08, 2, _seedInt + 409) - 0.5) * 2.8;
          const halfW = mix(6.8, 11.4, _polyTmp.t) + rJit;
          if (_polyTmp.dist < halfW * 4.6) {
            const bankF = 1.0 - smoothstep(halfW * 0.55, halfW * 1.48, _polyTmp.dist);
            const valleyF = 1.0 - smootherstep(halfW * 0.85, halfW * 4.4, _polyTmp.dist);
            const p0 = f.riverPts[0];
            const pEnd = f.riverPts[f.riverPts.length - 1];
            const startWaterY = Math.max(getTrunkWaterY(p0.x, p0.z) + 1.4, 13.5 + fbm2(p0.x * 0.0014, p0.z * 0.0014, 4, _seedInt + 7) * 14.0);
            const endWaterY = getTrunkWaterY(pEnd.x, pEnd.z);
            const targetWaterY = mix(startWaterY, endWaterY, _polyTmp.t);
            const targetBedY = targetWaterY - 0.35;

            h = mix(h, Math.min(h, targetBedY + 2.4), valleyF * 0.78);
            // Wide black volcanic sandur shingle/gravel outwash flats flanking braided river channels!
            talusScree = Math.max(talusScree, valleyF * 0.92);
            if (bankF > 0.001) {
              const chanC = 1.0 - smoothstep(0, halfW * 0.84, _polyTmp.dist);
              const bedProf = mix(targetWaterY + 0.35, targetWaterY - 1.15, chanC);
              h = mix(h, bedProf, bankF * 0.99);

              const braid = smoothstep(0.54, 0.78, fbm2(x * 0.12 + 4.1, z * 0.09 - 2.3, 3, _seedInt + 433));
              const bar = braid * (1.0 - chanC * 0.55) * smoothstep(0.10, 0.85, _polyTmp.t);
              h += bar * 0.96;

              const d = clamp((chanC * 1.45 + bankF * 0.35 - bar * 1.05) * 1.15, 0, 1.85);
              if (bankF > riverMask) {
                riverMask = bankF;
                riverDepth = d;
                flowX = _polyTmp.tx;
                flowZ = _polyTmp.tz;
              }
            }
          }
        }
      }

      // Subtle worn volcanic dirt footpath linking village & landmarks
      if (f.pathPts.length >= 2) {
        if (Math.abs(x - f.cx * CELL_SIZE) < 520 && Math.abs(z - f.cz * CELL_SIZE) < 520) {
          distToPolyline2D(x, z, f.pathPts, _polyTmp);
          if (_polyTmp.dist < 6.0) {
            const pw = (fbm2(x * 0.25, z * 0.25, 2, _seedInt + 591) - 0.5) * 1.3;
            const pb = smoothstep(0.24, 0.76, fbm2(x * 0.18 + 6.2, z * 0.18 - 3.1, 2, _seedInt + 609));
            const width = mix(0.85, 1.55, pb);
            const pm = (1.0 - smoothstep(width * 0.38, width * 1.35, Math.abs(_polyTmp.dist + pw * 0.45))) * mix(0.60, 0.95, pb);
            pathMask = Math.max(pathMask, pm);
          }
        }
      }
    }

  // 2b. Continuous Infinite Glacial Trunk River: Open Valley River OR Subterranean Mountain Cave Tunnel!
  // When a mountain rises >10m above the river, STOP slicing the mountain in half — leave the mountain & snow cap
  // 100% intact overhead while the river flows into a real 3D sculpted vaulted volcanic cave tunnel beneath it!
  const tBand = Math.round(x / TRUNK_SPACING);
  const trunkCenterX = getTrunkRiverX(z, tBand);
  const rawDx = x - trunkCenterX;
  const roughDx = Math.abs(rawDx);
  let caveSignedD = 99.0;
  let caveWaterY = 16.0;
  let caveOverburden = 0.0;

  if (roughDx < 130.0) {
    const dxdz = (getTrunkRiverX(z + 4.0, tBand) - getTrunkRiverX(z - 4.0, tBand)) * 0.125;
    const invSlope = 1.0 / Math.hypot(1.0, dxdz);
    caveSignedD = rawDx * invSlope;
    const perpD = Math.abs(caveSignedD);
    const tWaterY = getTrunkWaterYAt(trunkCenterX, z);
    caveWaterY = tWaterY;
    // Measure smooth mountain overburden DIRECTLY along the river centerline -> zero lateral bank/cliff spikes!
    const overburden = getTrunkCenterOverburden(z, tBand);
    caveOverburden = overburden;

    // Smoothly taper surface carving over 9m..22m overburden so mountain slopes blend softly into river banks
    const openCarve = 1.0 - smootherstep(9.0, 22.0, overburden);
    const tJit = (fbm2(x * 0.065, z * 0.065, 2, _seedInt + 467) - 0.5) * 3.8;
    const halfW = 12.2 + tJit;

    if (openCarve > 0.001 && perpD < halfW * 5.2) {
      const bankF = (1.0 - smoothstep(halfW * 0.55, halfW * 1.48, perpD)) * openCarve;
      const gorgeF = (1.0 - smootherstep(halfW * 0.95, halfW * 5.0, perpD)) * openCarve;

      // Gently shape lowland riverbanks & broad black volcanic sandur gravel bars
      h = mix(h, Math.min(h, tWaterY + 2.8), gorgeF * 0.82);
      talusScree = Math.max(talusScree, gorgeF * 0.95);
      if (bankF > 0.001) {
        const chanC = 1.0 - smoothstep(0.0, halfW * 0.85, perpD);
        const bedProf = mix(tWaterY + 0.42, tWaterY - 1.25, chanC);
        h = mix(h, bedProf, bankF * 0.99);

        const braid = smoothstep(0.56, 0.80, fbm2(x * 0.095 + 3.7, z * 0.078 - 1.9, 3, _seedInt + 479));
        const bar = braid * (1.0 - chanC * 0.56);
        h += bar * 0.94 * openCarve;

        const d = clamp((chanC * 1.55 + bankF * 0.32 - bar * 0.95) * 1.12, 0, 1.95);
        if (bankF > riverMask) {
          riverMask = bankF;
          riverDepth = d;
          flowX = dxdz * invSlope;
          flowZ = invSlope;
        }
      }
    }
    if (overburden > 14.0 && perpD < 25.0) {
      // Darken cliff rock naturally around the cave mouth rim so the basalt portal blends seamlessly into the mountain!
      const rimMask = (1.0 - smoothstep(10.0, 24.0, perpD)) * smoothstep(14.0, 17.5, overburden) * (1.0 - smoothstep(20.0, 46.0, overburden));
      cliffInfluence = Math.max(cliffInfluence, rimMask * 0.92);
    }
  }

  // Apply village/outpost gentle ground terrace flattening
  if (padFlatten > 0.001) {
    h = mix(h, padTargetY, padFlatten);
  }

  // 2c. Glacial Lake Basins (several hundred meters to several kilometers!)
  // Sculpt smooth glacial-shingle shallows, deep sapphire troughs, fjord-wall shores & occasional rocky islets!
  let lakeMask = 0.0;
  let lakeDepth = 0.0;
  let lakeWaterY = 16.0;
  let lakeShoreDist = -9999.0;
  const lk = sampleLake(x, z, _sampleWorldLakeTmp);
  if (lk.lake && lk.shoreMeters > -lk.shoreGrade) {
    const sm = lk.shoreMeters;
    const wY = lk.waterY;
    lakeWaterY = wY;
    lakeShoreDist = sm;

    if (sm > 0.0) {
      // Submerged glacial lakebed: gentle turquoise pebble shelf -> deep cobalt/sapphire trough
      h = wY - lk.bedDepth;
      lakeDepth = lk.bedDepth;
      lakeMask = smoothstep(0.0, 2.5, sm);
      // Harmonize river overlaps cleanly inside lake basins
      riverMask *= (1.0 - smoothstep(0.0, 4.0, sm));
      riverDepth *= (1.0 - smoothstep(0.0, 4.0, sm));
    } else {
      // Dry shoreline & surrounding fjord/valley grading: strictly >= waterY, meeting waterY smoothly at sm = 0
      // Preserve intersecting river channels so rivers flow smoothly into the lake instead of getting dammed
      const uShore = clamp(-sm / lk.shoreGrade, 0.0, 1.0);
      const riverKeep = clamp(riverMask * 1.35, 0.0, 1.0);
      let hDry = Math.max(h, mix(wY + smoothstep(0.0, 0.35, uShore) * 2.2, wY - 1.15, riverKeep));
      if (lk.isletBoost > 0.0) {
        hDry = Math.max(hDry, wY + lk.isletBoost);
      }
      const shoreProfile = smootherstep(0.0, 1.0, uShore);
      const gentleCurve = Math.pow(uShore, 1.15);
      h = mix(wY, hDry, mix(shoreProfile, gentleCurve, 0.35));
    }

    // Authentic Icelandic wet dark volcanic shingle/cobble shoreline beach & submerged glacial silt bed
    const beachBand = smoothstep(-15.0, 1.5, sm);
    talusScree = Math.max(talusScree, beachBand * 0.96);
    wfSprayWet = Math.max(wfSprayWet, smoothstep(-5.5, 0.6, sm) * 0.96);
    if (sm > -3.5) {
      pathMask *= (1.0 - smoothstep(-3.5, 0.2, sm));
    }
  }

  // Suppress footpaths inside rivers or steep cliffs
  pathMask *= (1.0 - riverMask) * (1.0 - lakeMask) * (1.0 - smoothstep(0.30, 0.70, cliffInfluence));
  h -= pathMask * 0.11;

  // 3. Tactile Bulbous Icelandic Eldhraun Pillow-Moss Hummocks
  const wx = x + (fbm2(x * 0.14, z * 0.14, 2, _seedInt + 301) - 0.5) * 2.6;
  const wz = z + (fbm2(x * 0.14 + 9.2, z * 0.14 - 4.1, 2, _seedInt + 307) - 0.5) * 2.6;
  worley2(wx * 0.28, wz * 0.28, _seedInt + 319, _worleyA);
  worley2(wx * 0.62 + 1.9, wz * 0.62 - 3.4, _seedInt + 331, _worleyB);
  const puffA = clamp(1.0 - _worleyA.f1 * 1.12, 0, 1);
  const puffB = clamp(1.0 - _worleyB.f1 * 1.10, 0, 1);
  const hummock = Math.pow(puffA, 0.68) * 0.78 + Math.pow(puffB, 0.82) * 0.34;
  const macroHummock = fbm2(x * 0.11 - 2.3, z * 0.11 + 5.7, 3, _seedInt + 349);

  const slopeSuppress = 1.0 - smoothstep(0.32, 0.82, cliffInfluence);
  const hMoss = h + (fbm2(x * 0.0075 + 2.1, z * 0.0075 - 4.7, 2, _seedInt + 953) - 0.5) * 48.0;
  const altitudeMoss = (1.0 - smoothstep(115, 205, hMoss)) * slopeSuppress;
  const lakeMossClear = 1.0 - smoothstep(-8.0, 0.5, lakeShoreDist);
  const mossClear = altitudeMoss * (1.0 - riverMask) * lakeMossClear * (1.0 - pathMask * 0.88) * (1.0 - padFlatten * 0.92);
  h += (hummock * 1.02 + (macroHummock - 0.5) * 1.15) * mossClear;

  // 4. Natural Geologically Grounded Volcanic Gravel & Scree (strictly along riverbanks, lake shores, talus slopes & high ridges)
  const subtleScreePocket = smoothstep(0.76, 0.92, fbm2(x * 0.032 + 11.4, z * 0.032 - 6.2, 3, _seedInt + 521)) * 0.46;
  const highRidgeScree = smoothstep(105.0, 195.0, hMoss) * 0.52;

  const scree = clamp(
    subtleScreePocket +
    highRidgeScree +
    talusScree +
    riverMask * 0.96 +
    lakeMask * 0.98 +
    smoothstep(0.68, 0.96, cliffInfluence) * 0.50,
    0,
    1
  );
  const moss = clamp(
    altitudeMoss * lakeMossClear * (1.0 - scree * 0.72) * (1.0 - pathMask * 0.80) * (1.0 - padFlatten * 0.32),
    0,
    1
  );
  // 5. Higher, Geologically Organic Snowline & Glaciers (ZERO straight horizontal line!)
  // Multi-scale domain-warped elevation shift: macro climate/aspect + mid couloir bays + fine drift pockets + gully snow tongues!
  const snowMacroWarp = (warpedFbm2(x * 0.0016 + 5.1, z * 0.0016 - 3.4, 0.58, 3, _seedInt + 967) - 0.5) * 124.0;
  const snowMidWarp   = (fbm2(x * 0.0072 - 2.7, z * 0.0072 + 6.3, 3, _seedInt + 971) - 0.5) * 74.0;
  const snowFineWarp  = (fbm2(x * 0.024 + 8.1, z * 0.024 - 1.9, 3, _seedInt + 983) - 0.5) * 42.0;
  // Concave gullies/couloirs trap snow fingers far lower; convex wind-blasted rock ridges blow bare much higher!
  const gullyField    = 1.0 - ridged2(x * 0.014 + 1.4, z * 0.014 - 4.2, 3, _seedInt + 977);
  const gullyShift    = (gullyField - 0.48) * 96.0;
  const hSnow         = h + snowMacroWarp + snowMidWarp + snowFineWarp + gullyShift;

  const rangeGate = smoothstep(0.20, 0.58, rangePresence);
  const bigMountainGate = mix(0.45, 1.0, rangeGate);

  // Higher alpine snowline: ragged scattered patches & couloir streaks ~255..320m, broken snowfields ~320..405m, heavy alpine cap 410m+
  const alpineSnow = smoothstep(285.0, 412.0, hSnow) * bigMountainGate * (1.0 - smoothstep(0.40, 0.85, cliffInfluence) * 0.58);
  // Sweeping Icelandic ice-cap bowls (>338m) & broad outlet glaciers flowing down carved mountain troughs (>246m)!
  const highIceCap = smoothstep(338.0, 435.0, hSnow) * rangeGate * smoothstep(0.26, 0.72, fbm2(x * 0.006, z * 0.006, 2, _seedInt + 991)) * 0.88;
  const valleyGlacier = glacierTrough * smoothstep(246.0, 328.0, hSnow) * (1.0 - smoothstep(0.50, 0.86, cliffInfluence) * 0.72);
  const glacier = clamp(Math.max(highIceCap, valleyGlacier), 0, 1);
  const snow = clamp(Math.max(alpineSnow, glacier * 0.45), 0, 1);
  const mossFinal = clamp(moss * (1.0 - snow * 0.96) * (1.0 - glacier * 0.98), 0, 1);
  const wetness = clamp(riverMask * 0.96 + wfSprayWet + pathMask * 0.32 + glacier * 0.40 + (1.0 - altitudeMoss) * 0.15, 0, 1);

  res.height = h;
  res.moss = mossFinal;
  res.cliff = cliffInfluence;
  res.path = pathMask;
  res.scree = scree;
  res.riverDepth = riverDepth;
  res.riverMask = riverMask;
  res.lakeDepth = lakeDepth;
  res.lakeMask = lakeMask;
  res.lakeWaterY = lakeWaterY;
  res.lakeShoreDist = lakeShoreDist;
  res.flowX = flowX;
  res.flowZ = flowZ;
  res.snow = snow;
  res.glacier = glacier;
  res.wetness = wetness;
  res.hummockAO = clamp(hummock * 0.8 + macroHummock * 0.25, 0, 1);
  res.caveSignedD = caveSignedD;
  res.caveWaterY = caveWaterY;
  res.caveOverburden = caveOverburden;
  return res;
}

const _sampleWorldLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };

const _tmpSample = {
  height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
  riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
  flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
  caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
};

/**
 * Check if a world position (x, curY, z) is walking/looking inside a subterranean river cave tunnel under a mountain!
 * Allows seamless exploration through river caves while keeping mountain summits solid overhead.
 */
export function getRiverCaveState(x, z, curY) {
  const s = sampleWorld(x, z, _tmpSample);
  const absD = Math.abs(s.caveSignedD);
  if (s.caveOverburden > 16.8 && absD < 13.0 && curY < s.caveWaterY + 11.2) {
    const archU = Math.min(absD / 13.0, 0.99);
    const archCeil = s.caveWaterY + 10.6 * Math.sqrt(1.0 - archU * archU);
    const chanC = 1.0 - smoothstep(0.0, 11.8, absD);
    const floorY = mix(s.caveWaterY + 0.35, s.caveWaterY - 0.95, chanC);
    const darkness = smoothstep(16.8, 30.0, s.caveOverburden);
    return {
      inCave: true,
      floorY,
      ceilingY: archCeil,
      waterY: s.caveWaterY,
      darkness
    };
  }
  return { inCave: false, floorY: s.height, ceilingY: 1e6, waterY: s.caveWaterY, darkness: 0 };
}

export function getTerrainHeight(x, z) {
  return sampleWorld(x, z, _tmpSample).height;
}

export function getTerrainNormal(x, z, target = new THREE.Vector3(), eps = 0.6) {
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return target.set(hL - hR, 2.0 * eps, hD - hU).normalize();
}

export function getRiverSurfaceY(x, z) {
  const s = sampleWorld(x, z, _tmpSample);
  return s.height + Math.max(0.18, s.riverDepth * 0.82);
}

/**
 * Find a dramatic, walkable valley spawn position for ANY procedural seed,
 * framing the cell's waterfall, basalt cliff escarpment, braided river, and Icelandic village!
 */
export function findSpawnPosition() {
  const f = getCellFeatures(0, 0);
  const n = new THREE.Vector3();

  // Aim toward the midpoint of waterfall/cliff & village for an unforgettable initial vista
  let focusX = f.centerX;
  let focusZ = f.centerZ;
  if (f.waterfall && f.village) {
    focusX = mix(f.waterfall.plungeX, f.village.x, 0.42);
    focusZ = mix(f.waterfall.plungeZ, f.village.z, 0.42);
  } else if (f.waterfall) {
    focusX = f.waterfall.plungeX;
    focusZ = f.waterfall.plungeZ;
  } else if (f.village) {
    focusX = f.village.x;
    focusZ = f.village.z;
  }

  // Search scenic vantage arc in the mossy valley 135m..220m in front of the cliff/focus
  const baseBackX = f.hasEscarpment ? -f.nx : 0;
  const baseBackZ = f.hasEscarpment ? -f.nz : 1;
  const sideX = -baseBackZ;
  const sideZ = baseBackX;

  let best = null;
  let bestScore = -1e9;

  for (let d = 135; d <= 235; d += 18) {
    for (let s = -110; s <= 110; s += 22) {
      const px = focusX + baseBackX * d + sideX * s;
      const pz = focusZ + baseBackZ * d + sideZ * s;
      const smp = sampleWorld(px, pz, _tmpSample);
      getTerrainNormal(px, pz, n, 1.0);
      if (n.y < 0.86 || smp.riverMask > 0.08 || smp.lakeShoreDist > -8.0 || smp.cliff > 0.25) continue;

      // Keep clear of village buildings & hot springs
      let blocked = false;
      if (f.village) {
        for (const b of f.village.buildings) {
          if (Math.hypot(px - b.x, pz - b.z) < b.radius + 9.0) {
            blocked = true;
            break;
          }
        }
      }
      for (const hs of f.hotSprings) {
        if (Math.hypot(px - hs.x, pz - hs.z) < hs.radius + 8.0) blocked = true;
      }
      if (blocked) continue;

      // Prefer gently elevated mossy ground with crisp sightline to focus
      const distPref = 1.0 - Math.abs(d - 175) / 100.0;
      const score = smp.moss * 3.0 + distPref * 2.0 + clamp((smp.height - 14.0) * 0.12, -1.5, 2.5) - Math.abs(s) * 0.008;
      if (score > bestScore) {
        bestScore = score;
        const lookYaw = Math.atan2(focusX - px, focusZ - pz);
        best = { x: px, y: smp.height, z: pz, yaw: lookYaw };
      }
    }
  }

  if (best) return best;

  // Fallback spiral search
  for (let r = 0; r < 240; r += 16) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      const s = sampleWorld(px, pz, _tmpSample);
      getTerrainNormal(px, pz, n, 1.0);
      if (n.y > 0.85 && s.riverDepth < 0.15 && s.lakeShoreDist < -6.0 && s.height < 65) {
        return { x: px, y: s.height, z: pz, yaw: Math.atan2(focusX - px, focusZ - pz) };
      }
    }
  }
  return { x: 0, y: getTerrainHeight(0, 0), z: 0, yaw: 0 };
}

/**
 * Find a breathtaking panoramic dry shoreline overlook for any glacial lake,
 * framing the longest sweep of turquoise-to-sapphire water and towering mountains beyond.
 */
export function findLakeOverlook(lake) {
  if (!lake) return findSpawnPosition();
  const n = new THREE.Vector3();
  const s = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
    flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
    caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
  };
  let best = null;
  let bestScore = -1e9;

  // Scan 24 radial bearings around the lake perimeter to find an elevated scenic dry shore vantage
  for (let ai = 0; ai < 24; ai++) {
    const ang = (ai / 24) * Math.PI * 2.0;
    const dirX = Math.cos(ang);
    const dirZ = Math.sin(ang);

    // Walk outward from lake center along (dirX, dirZ) to locate exact shoreline crossing
    const maxR = lake.boundR + 120.0;
    const step = lake.tier === 'macro' ? 28.0 : 12.0;
    let shoreR = -1;
    for (let r = lake.avgR * 0.25; r <= maxR; r += step) {
      const px = lake.cx + dirX * r;
      const pz = lake.cz + dirZ * r;
      sampleLake(px, pz, _sampleWorldLakeTmp);
      if (!_sampleWorldLakeTmp.lake || _sampleWorldLakeTmp.shoreMeters <= 0.0) {
        shoreR = r;
        break;
      }
    }
    if (shoreR < 0) continue;

    // Test scenic shoreline bank distances (14m..48m back from waterline)
    for (const backOff of [14, 28, 46]) {
      const px = lake.cx + dirX * (shoreR + backOff);
      const pz = lake.cz + dirZ * (shoreR + backOff);
      sampleWorld(px, pz, s);
      if (s.lakeDepth > 0.0 || s.lakeShoreDist > -4.0 || s.riverMask > 0.15) continue;
      getTerrainNormal(px, pz, n, 1.0);
      if (n.y < 0.78) continue;

      const elevAboveWater = s.height - lake.waterY;
      if (elevAboveWater < 1.2 || elevAboveWater > 42.0) continue;

      // Prefer sweeping panoramic views looking slightly down over the water (4m..16m above lake surface!)
      const elevScore = 4.0 - Math.abs(elevAboveWater - (lake.tier === 'macro' ? 12.0 : 6.5)) * 0.22;
      // Bonus for looking across the lake's long axis AND toward taller mountains on the opposite shore!
      const oppX = lake.cx - dirX * (lake.avgR * 1.45);
      const oppZ = lake.cz - dirZ * (lake.avgR * 1.45);
      const oppH = sampleMacroHeight(oppX, oppZ);
      const mountainBackdrop = clamp((oppH - lake.waterY) * 0.035, 0.0, 9.0);
      const score = elevScore + mountainBackdrop + s.moss * 1.5;

      if (score > bestScore) {
        bestScore = score;
        const lookYaw = Math.atan2(lake.cx - px, lake.cz - pz);
        best = { x: px, y: s.height, z: pz, yaw: lookYaw, lake };
      }
    }
  }

  if (best) return best;
  const fx = lake.cx + lake.rx * 1.35;
  const fz = lake.cz;
  return { x: fx, y: getTerrainHeight(fx, fz), z: fz, yaw: Math.atan2(lake.cx - fx, lake.cz - fz), lake };
}
