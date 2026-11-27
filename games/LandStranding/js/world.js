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
}

/**
 * Pure macro geological elevation (valley + broad glaciated mountain ranges + cell basalt escarpments)
 * BEFORE any river carving or micro hummocks. Used to determine clean, smooth mountain overburden for river caves!
 */
export function sampleMacroHeight(x, z) {
  const valleyLow = fbm2(x * 0.0014, z * 0.0014, 4, _seedInt + 7);
  const broadRidge = ridged2(x * 0.0016 + 4.2, z * 0.0016 - 2.1, 4, _seedInt + 23);
  const medSwell = fbm2(x * 0.0085, z * 0.0085, 4, _seedInt + 41);
  const rollingMound = (fbm2(x * 0.022 + 2.3, z * 0.022 - 3.7, 3, _seedInt + 59) - 0.5) * 3.6;

  const rangeNoise = warpedFbm2(x * 0.00025 + 3.1, z * 0.00025 - 5.4, 0.56, 3, _seedInt + 811);
  const valleyOpenGuard = smoothstep(520.0, 1250.0, Math.hypot(x, z));
  const rangePresence = smoothstep(0.52, 0.75, rangeNoise) * valleyOpenGuard;

  // Mid-to-tall broad Icelandic highland massifs (distinct 120m..235m+ volcanic mountains across highlands without crowding valleys!)
  const massifField = warpedFbm2(x * 0.00055 - 4.7, z * 0.00055 + 2.3, 0.48, 3, _seedInt + 823);
  const massifGuard = smoothstep(380.0, 920.0, Math.hypot(x, z));
  const massifPresence = smoothstep(0.56, 0.82, massifField) * massifGuard;
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
  let h =
    12.5 +
    valleyLow * 16.0 +
    ridgeCapped * 44.0 +
    highlandMassifH +
    broadMountainH -
    glacierTrough * 22.0 +
    (medSwell - 0.5) * 10.0 +
    rollingMound;

  const cx = Math.round(x / CELL_SIZE);
  const cz = Math.round(z / CELL_SIZE);
  const neighbors = getNeighborCells(cx, cz);
  for (let ni = 0; ni < 9; ni++) {
    const f = neighbors[ni];
    if (!f.hasEscarpment) continue;
    const relX = x - f.centerX;
    const relZ = z - f.centerZ;
    const distCell = Math.hypot(relX, relZ);
    const cellMask = 1.0 - smoothstep(280, 540, distCell);
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

    const wallH = f.cliffHeight * 0.62;
    let escarpH =
      talusH +
      lowerTier * (wallH * 0.56) +
      midTier * (wallH * 0.28) +
      upperTier * (wallH * 0.16) +
      strataBench +
      smoothstep(-5.0, 22.0, signedD) * (mesaSteps + (crownCrag - 0.5) * 7.5);

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
  return h;
}

function sampleTrunkOverSlice(bandIdx, zi) {
  const key = ((bandIdx + 256) << 18) ^ (zi + 131072);
  let v = _trunkOverCache.get(key);
  if (v !== undefined) return v;
  const z = zi * 4.0;
  const rx = getTrunkRiverX(z, bandIdx);
  // 3-point smoothed macro overburden directly along the river centerline -> zero lateral canyon wall artifacts!
  const h0 = sampleMacroHeight(rx, z);
  const hPrev = sampleMacroHeight(getTrunkRiverX(z - 8.0, bandIdx), z - 8.0);
  const hNext = sampleMacroHeight(getTrunkRiverX(z + 8.0, bandIdx), z + 8.0);
  const smoothH = h0 * 0.50 + (hPrev + hNext) * 0.25;
  v = smoothH - getTrunkWaterY(rx, z);
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
      riverPts.push({
        x: px + perpX * meander,
        z: pz + perpZ * meander
      });
    }
  }

  // Helper: check distance from BOTH the waterfall tributary AND the infinite continental trunk river!
  const riverDistAt = (px, pz) => {
    let bestD = getNearestTrunkDist(px, pz);
    if (riverPts.length >= 2) {
      distToPolyline2D(px, pz, riverPts, _polyTmp);
      if (_polyTmp.dist < bestD) bestD = _polyTmp.dist;
    }
    return bestD;
  };

  // 3. Small Icelandic Village (~58% of cells; always spawned in origin cell valley so players can discover it!)
  let village = null;
  const hasVillage = isOriginCell || h5 > 0.42;
  if (hasVillage) {
    // Place village in the scenic valley in front of the cliff, offset safely to one side of the river
    const vSide = h6 > 0.5 ? -1 : 1; // Opposite side of river drift for natural scenic balance
    let vx = originX - nx * (155 + h3 * 90) + tx * (vSide * (78 + h7 * 75));
    let vz = originZ - nz * (155 + h3 * 90) + tz * (vSide * (78 + h7 * 75));

    // Nudge smoothly away if too close to river channel
    if (riverDistAt(vx, vz) < 42) {
      vx += tx * vSide * 58;
      vz += tz * vSide * 58;
    }

    const houseCount = 6 + Math.floor(h7 * 3); // 6..8 traditional Icelandic turf cottages, barns & black kirkja church
    const buildings = [];
    const baseYaw = Math.atan2(nx, nz); // Oriented organically relative to valley & escarpment

    // Iconic Black-Timber Icelandic Church (Búðakirkja style) standing prominently on village eastern edge
    buildings.push({
      kind: 'church',
      x: vx + tx * 21.0 + nx * 6.0,
      z: vz + tz * 21.0 + nz * 6.0,
      yaw: baseYaw + Math.PI * 0.5 + (h1 - 0.5) * 0.35,
      radius: 8.5
    });

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
      if (overlap || riverDistAt(bx, bz) < 22) continue;

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
      lamps.push({ x: pt.x + nx * 3.8, z: pt.z + nz * 3.8 });
    }

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
    if (riverDistAt(ox, oz) > 26) {
      outposts.push({ x: ox, z: oz, yaw: h1 * Math.PI * 2 });
      for (let b = 1; b <= 5; b++) {
        const bx = ox - tx * oSide * b * 28 + nx * Math.sin(b * 0.7) * 10;
        const bz = oz - tz * oSide * b * 28 + nz * Math.sin(b * 0.7) * 10;
        if (riverDistAt(bx, bz) > 16) {
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
    if (!village || Math.hypot(rx - village.x, rz - village.z) > 48) {
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
      if (riverDistAt(hsx, hsz) > 24 && (!village || Math.hypot(hsx - village.x, hsz - village.z) > 52)) {
        hotSprings.push({ x: hsx, z: hsz, radius: 5.5 + hash2i(i, cx, _seedInt + 641) * 4.5 });
      }
    }
  }
  if (h3 > 0.38) {
    const count = 2 + Math.floor(h2 * 3);
    for (let i = 0; i < count; i++) {
      const fx = originX - nx * (90 + hash2i(cx + i, cz, _seedInt + 313) * 190) + tx * ((hash2i(cx, cz + i, _seedInt + 521) - 0.5) * 380);
      const fz = originZ - nz * (90 + hash2i(cx + i, cz, _seedInt + 313) * 190) + tz * ((hash2i(cx, cz + i, _seedInt + 521) - 0.5) * 380);
      if (riverDistAt(fx, fz) > 18) fumaroles.push({ x: fx, z: fz });
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
      if (riverDistAt(bx, bz) > 18 && (!village || Math.hypot(bx - village.x, bz - village.z) > 45)) {
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
      const rYaw = Math.atan2(rtx, rtz);
      bridges.push({ x: mx, z: mz, yaw: rYaw, span: 20.0 });
    }

    // Traditional stacked basalt stone traveler cairns (vörður) along trail
    for (let c = 1; c <= 4; c++) {
      const pt = pathPts[Math.min(c * 2 - 1, pathPts.length - 1)];
      if (pt && riverDistAt(pt.x, pt.z) > 16) {
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
      if (riverDistAt(cxp, czp) > 18) {
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

  // Continent-scale broad Icelandic mountain range / shield volcano field (wavelength ~4.2km -> huge & gently sloped!)
  const rangeNoise = warpedFbm2(x * 0.00025 + 3.1, z * 0.00025 - 5.4, 0.56, 3, _seedInt + 811);
  // Keep spawn valley open lowland while letting vast broad mountain ranges rise naturally beyond ~650m+
  const valleyOpenGuard = smoothstep(520.0, 1250.0, Math.hypot(x, z));
  const rangePresence = smoothstep(0.52, 0.75, rangeNoise) * valleyOpenGuard;

  // Mid-to-tall broad Icelandic highland massifs (distinct 120m..235m+ volcanic mountains across highlands without crowding valleys!)
  const massifField = warpedFbm2(x * 0.00055 - 4.7, z * 0.00055 + 2.3, 0.48, 3, _seedInt + 823);
  const massifGuard = smoothstep(380.0, 920.0, Math.hypot(x, z));
  const massifPresence = smoothstep(0.56, 0.82, massifField) * massifGuard;
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
  let h =
    12.5 +
    valleyLow * 16.0 +
    ridgeCapped * 44.0 +
    highlandMassifH +
    broadMountainH -
    glacierTrough * 22.0 +
    (medSwell - 0.5) * 10.0 +
    rollingMound;
  let cliffInfluence = smoothstep(0.50, 0.78, broadRidge) * smoothstep(0.42, 0.74, steepCrag);
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
        const cellMask = 1.0 - smoothstep(280, 540, distCell);
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

          const wallH = f.cliffHeight * 0.62;
          let escarpH =
            talusH +
            lowerTier * (wallH * 0.56) +
            midTier * (wallH * 0.28) +
            upperTier * (wallH * 0.16) +
            strataBench +
            smoothstep(-5.0, 22.0, signedD) * (mesaSteps + (crownCrag - 0.5) * 7.5);

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
        if (vd < 64) {
          const wPad = 1.0 - smoothstep(28, 58, vd);
          const vBase = 12.5 + fbm2(f.village.x * 0.0014, f.village.z * 0.0014, 4, _seedInt + 7) * 16.0 + 4.5;
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
        if (od < 42) {
          const wPad = 1.0 - smoothstep(18, 40, od);
          const oBase = 12.5 + fbm2(op.x * 0.0014, op.z * 0.0014, 4, _seedInt + 7) * 16.0 + 3.8;
          if (wPad > padFlatten) {
            padFlatten = wPad * 0.86;
            padTargetY = oBase;
          }
        }
      }

      for (let hi = 0; hi < f.hotSprings.length; hi++) {
        const hs = f.hotSprings[hi];
        const hd = Math.hypot(x - hs.x, z - hs.z);
        if (hd < hs.radius * 2.2) {
          const basin = 1.0 - smoothstep(hs.radius * 0.55, hs.radius * 1.4, hd);
          h -= basin * 1.1;
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
          if (_polyTmp.dist < halfW * 2.6) {
            const bankF = 1.0 - smoothstep(halfW * 0.55, halfW * 1.48, _polyTmp.dist);
            const valleyF = 1.0 - smoothstep(halfW * 0.85, halfW * 2.45, _polyTmp.dist);
            const p0 = f.riverPts[0];
            const pEnd = f.riverPts[f.riverPts.length - 1];
            const startWaterY = Math.max(getTrunkWaterY(p0.x, p0.z) + 1.4, 13.5 + fbm2(p0.x * 0.0014, p0.z * 0.0014, 4, _seedInt + 7) * 14.0);
            const endWaterY = getTrunkWaterY(pEnd.x, pEnd.z);
            const targetWaterY = mix(startWaterY, endWaterY, _polyTmp.t);
            const targetBedY = targetWaterY - 0.35;

            h = mix(h, Math.min(h, targetBedY + 2.4), valleyF * 0.88);
            if (bankF > 0.001) {
              const chanC = 1.0 - smoothstep(0, halfW * 0.84, _polyTmp.dist);
              const bedProf = mix(targetWaterY + 0.35, targetWaterY - 1.15, chanC);
              h = mix(h, bedProf, bankF * 0.99);

              const braid = smoothstep(0.60, 0.82, fbm2(x * 0.14 + 4.1, z * 0.11 - 2.3, 3, _seedInt + 433));
              const bar = braid * (1.0 - chanC * 0.62) * smoothstep(0.12, 0.80, _polyTmp.t);
              h += bar * 0.82;

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

  if (roughDx < 96.0) {
    const dxdz = (getTrunkRiverX(z + 4.0, tBand) - getTrunkRiverX(z - 4.0, tBand)) * 0.125;
    const invSlope = 1.0 / Math.hypot(1.0, dxdz);
    caveSignedD = rawDx * invSlope;
    const perpD = Math.abs(caveSignedD);
    const tWaterY = getTrunkWaterY(trunkCenterX, z);
    caveWaterY = tWaterY;
    // Measure smooth mountain overburden DIRECTLY along the river centerline -> zero lateral bank/cliff spikes!
    const overburden = getTrunkCenterOverburden(z, tBand);
    caveOverburden = overburden;

    // Fade surface carving crisply over 15.5m..19.5m -> crisp cliff portal face while mountain & snow cap stay 100% unbroken!
    const openCarve = 1.0 - smoothstep(15.5, 19.5, overburden);
    const tJit = (fbm2(x * 0.065, z * 0.065, 2, _seedInt + 467) - 0.5) * 3.8;
    const halfW = 12.2 + tJit;

    if (openCarve > 0.001 && perpD < halfW * 3.2) {
      const bankF = (1.0 - smoothstep(halfW * 0.55, halfW * 1.48, perpD)) * openCarve;
      const gorgeF = (1.0 - smoothstep(halfW * 0.95, halfW * 3.05, perpD)) * openCarve;

      // Gently shape lowland riverbanks without cutting high mountains
      h = mix(h, Math.min(h, tWaterY + 2.8), gorgeF * 0.88);
      if (bankF > 0.001) {
        const chanC = 1.0 - smoothstep(0.0, halfW * 0.85, perpD);
        const bedProf = mix(tWaterY + 0.42, tWaterY - 1.25, chanC);
        h = mix(h, bedProf, bankF * 0.99);

        const braid = smoothstep(0.62, 0.84, fbm2(x * 0.11 + 3.7, z * 0.09 - 1.9, 3, _seedInt + 479));
        const bar = braid * (1.0 - chanC * 0.65);
        h += bar * 0.78 * openCarve;

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

  // Suppress footpaths inside rivers or steep cliffs
  pathMask *= (1.0 - riverMask) * (1.0 - smoothstep(0.30, 0.70, cliffInfluence));
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
  const mossClear = altitudeMoss * (1.0 - riverMask) * (1.0 - pathMask * 0.88) * (1.0 - padFlatten * 0.92);
  h += (hummock * 1.02 + (macroHummock - 0.5) * 1.15) * mossClear;

  // 4. Natural Geologically Grounded Volcanic Gravel & Scree (strictly along riverbanks, talus slopes & high ridges - NO random black spots on meadows!)
  const subtleScreePocket = smoothstep(0.76, 0.92, fbm2(x * 0.032 + 11.4, z * 0.032 - 6.2, 3, _seedInt + 521)) * 0.46;
  const highRidgeScree = smoothstep(105.0, 195.0, hMoss) * 0.52;

  const scree = clamp(
    subtleScreePocket +
    highRidgeScree +
    talusScree +
    riverMask * 0.96 +
    smoothstep(0.68, 0.96, cliffInfluence) * 0.50,
    0,
    1
  );
  const moss = clamp(
    altitudeMoss * (1.0 - scree * 0.72) * (1.0 - pathMask * 0.80) * (1.0 - padFlatten * 0.32),
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

const _tmpSample = {
  height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
  riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
  caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
};

/**
 * Check if a world position (x, curY, z) is walking/looking inside a subterranean river cave tunnel under a mountain!
 * Allows seamless exploration through river caves while keeping mountain summits solid overhead.
 */
export function getRiverCaveState(x, z, curY) {
  const s = sampleWorld(x, z, _tmpSample);
  const absD = Math.abs(s.caveSignedD);
  if (s.caveOverburden > 15.2 && absD < 13.0 && curY < s.caveWaterY + 11.2) {
    const archU = Math.min(absD / 13.0, 0.99);
    const archCeil = s.caveWaterY + 10.6 * Math.sqrt(1.0 - archU * archU);
    const chanC = 1.0 - smoothstep(0.0, 11.8, absD);
    const floorY = mix(s.caveWaterY + 0.35, s.caveWaterY - 0.95, chanC);
    const darkness = smoothstep(15.5, 30.0, s.caveOverburden);
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
      if (n.y < 0.86 || smp.riverMask > 0.08 || smp.cliff > 0.25) continue;

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
      if (n.y > 0.85 && s.riverDepth < 0.15 && s.height < 65) {
        return { x: px, y: s.height, z: pz, yaw: Math.atan2(focusX - px, focusZ - pz) };
      }
    }
  }
  return { x: 0, y: getTerrainHeight(0, 0), z: 0, yaw: 0 };
}
