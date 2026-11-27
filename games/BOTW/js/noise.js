import * as THREE from 'three';

export const WORLD_HALF = 6200.0;
export const WATER_LEVEL = 6.2;

export const VOLCANO_POS = { x: 1180.0, z: -4550.0 };
export const LAKE_BOUNDS = { cx: 920.0, cz: -1420.0, rx: 1440.0, rz: 1350.0 };

export const CITY_BOUNDS = {
  cx: -860.0,
  cz: -920.0,
  halfW: 800.0,
  halfD: 820.0,
  y: 10.6
};

// Major downtown arterial axes kept exported for radar & compatibility
export const ROAD_X = [-740.0, -460.0, -200.0];
export const ROAD_Z = [-920.0, -560.0, -240.0];

export function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

export function mix(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

/** Deterministic PRNG for procedural texture synthesis and prop placement. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

export function hash2Vec(ix, iz) {
  const h1 = hash2(ix, iz);
  const h2 = hash2(ix + 53.7, iz + 91.3);
  return [h1, h2];
}

export function valueNoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uz);
}

function gradNoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
  const uz = fz * fz * fz * (fz * (fz * 6.0 - 15.0) + 10.0);

  const g = (gx, gz) => {
    const h = hash2(gx, gz) * 6.28318530718;
    return Math.cos(h) * (x - gx) + Math.sin(h) * (z - gz);
  };
  return mix(
    mix(g(ix, iz), g(ix + 1, iz), ux),
    mix(g(ix, iz + 1), g(ix + 1, iz + 1), ux),
    uz
  );
}

export function fbm2(x, z, octaves = 4, lacunarity = 2.02, gain = 0.5) {
  let sum = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0.0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gradNoise2(x * freq, z * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / Math.max(norm, 0.0001);
}

export function ridgedFbm2(x, z, octaves = 4, lacunarity = 2.1, gain = 0.52) {
  let sum = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  let weight = 1.0;
  let norm = 0.0;
  for (let i = 0; i < octaves; i++) {
    let n = 1.0 - Math.abs(gradNoise2(x * freq, z * freq));
    n = n * n * weight;
    weight = clamp(n * 1.6, 0.2, 1.0);
    sum += n * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / Math.max(norm, 0.0001);
}

/** 2D Worley cellular F1/F2 distance for rock cleavage, bark fissures & stone cracks. */
export function worley2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  let f1 = 8.0;
  let f2 = 8.0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [rx, rz] = hash2Vec(ix + dx, iz + dz);
      const px = dx + rx - fx;
      const pz = dz + rz - fz;
      const d = Math.hypot(px, pz);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, edge: f2 - f1 };
}

/** Curved stone waterfront seawall X coordinate along the western bay edge (z in [-1760, -140]). */
export function getQuayX(z) {
  return (
    -132.0 +
    Math.sin((z + 720.0) * 0.0024) * 34.0 +
    Math.cos((z + 240.0) * 0.0052) * 14.0
  );
}

export function isInCityBounds(x, z, pad = 0.0) {
  const qx = getQuayX(clamp(z, -1760.0, -140.0));
  return (
    x >= -1660.0 - pad &&
    x <= qx + 6.0 + pad &&
    z >= -1740.0 - pad &&
    z <= -140.0 + pad
  );
}

export function getCityDistrict(x, z) {
  if (!isInCityBounds(x, z, 2.0)) return null;
  const qx = getQuayX(clamp(z, -1760.0, -140.0));
  if (x >= qx - 140.0 && z >= -1140.0 && z <= -160.0) return 'waterfront';
  if (x >= -745.0 && x < qx - 140.0 && z >= -860.0 && z <= -310.0) return 'citadel';
  if (x >= -1160.0 && x <= -150.0 && z >= -1140.0 && z <= -160.0) return 'midtown';
  return 'urban_sea';
}

/** Target city terrace height rising organically into western & northern foothills away from the flat harbor core. */
export function getCityTerraceY(x, z) {
  const westRise = Math.max(0.0, (-940.0 - x) * 0.022);
  const northRise = Math.max(0.0, (-1240.0 - z) * 0.018);
  const undul = fbm2(x * 0.0025, z * 0.0025, 2) * 2.2 * smoothstep(-840.0, -1350.0, x);
  return CITY_BOUNDS.y + Math.min(28.0, westRise + northRise + Math.max(0.0, undul));
}

/** Winding dirt trail centerline x(z) across the valley foothills south/east of the Overlook. */
export function getPathCenterX(z) {
  return (
    18.0 +
    28.0 * Math.sin(z * 0.014 + 0.35) +
    16.0 * Math.cos(z * 0.007) +
    (z < -180 ? (z + 180) * 0.08 : 0.0)
  );
}

export function getBaseTerrainHeight(x, z) {
  // 1) Macro continental rolling plains across 12.4 km x 12.4 km world
  let h =
    11.8 +
    fbm2(x * 0.0014, z * 0.0014, 4) * 16.5 +
    fbm2(x * 0.0065 + 11.3, z * 0.0065 - 7.1, 3) * 4.2 +
    (ridgedFbm2(x * 0.0032, z * 0.0032, 3) - 0.35) * 8.0;

  // 2) Broad emerald valley & lakefront basin flattening before mountain Overlook
  const valleyDist = Math.hypot((x - 320.0) / 2100.0, (z + 1350.0) / 1850.0);
  const valleyMask = smoothstep(1.25, 0.35, valleyDist);
  h = mix(h, 11.4 + fbm2(x * 0.0035, z * 0.0035, 3) * 4.6, valleyMask * 0.65);

  const dryFloor = WATER_LEVEL + 1.85;
  if (h < dryFloor) {
    h = dryFloor + (h - dryFloor) * 0.16;
  }

  // 3) Great Plateau Mountain Overlook at (0, 0) ~ 74.0m overlooking City (left), Huge Lake (center), Far Volcano (horizon)!
  const forwardMask = smoothstep(-95.0, -14.0, z) * smoothstep(260.0, 95.0, z);
  const lateralMask =
    Math.exp(-Math.pow(Math.max(0.0, -x - 24.0) / 36.0, 2.0)) *
    Math.exp(-Math.pow(Math.max(0.0, x - 34.0) / 56.0, 2.0));
  const plateauMask = forwardMask * lateralMask;

  const plateauNoise =
    fbm2(x * 0.032, z * 0.032, 3) * 1.45 +
    fbm2(x * 0.10, z * 0.10, 2) * 0.35;
  const cliffLipTarget = 74.0 + plateauNoise;
  h = mix(h, cliffLipTarget, clamp(plateauMask, 0.0, 1.0));

  // Level player crest + camera behind player (z = -2..+18, x = -11..+11)
  const dCamPad = Math.hypot((x - 0.0) * 0.68, (z - 5.5) * 0.52);
  const camPadMask = smoothstep(12.5, 3.6, dCamPad);
  h = mix(h, 74.0 - clamp(z * 0.03, -0.3, 0.5), camPadMask * 0.90);

  // Ancient ruin terrace on left foreground (-10.5, -1)
  const dRuinPad = Math.hypot((x + 10.5) * 0.85, (z + 0.5) * 0.88);
  const ruinPadMask = smoothstep(8.0, 2.8, dRuinPad);
  h = mix(h, 73.4, ruinPadMask * 0.78);

  // Right craggy boulder shoulder (15.5, 2.0)
  const dRightShoulder = Math.hypot(x - 15.5, z - 2.0);
  h += 3.8 * Math.exp(-(dRightShoulder * dRightShoulder) / 140.0);

  // 4) HUGE Lake Hylia (~2.8 km x 2.7 km) meeting curved city seawall cleanly at getQuayX(z)!
  const lakeDx = (x - LAKE_BOUNDS.cx) / LAKE_BOUNDS.rx;
  const lakeDz = (z - LAKE_BOUNDS.cz) / LAKE_BOUNDS.rz;
  const lakeWarp = fbm2(x * 0.0045, z * 0.0045, 2) * 0.14;
  const lakeR = Math.hypot(lakeDx, lakeDz) + lakeWarp * 0.25;
  const lakeCarve = smoothstep(1.03, 0.35, lakeR);
  h -= 18.0 * lakeCarve;

  // Crisp deep harbor basin immediately east of the curved stone quay
  const qx = getQuayX(clamp(z, -1760.0, -140.0));
  const seawallBayMask =
    smoothstep(qx - 2.0, qx + 4.5, x) *
    smoothstep(qx + 340.0, qx + 25.0, x) *
    smoothstep(-1765.0, -1700.0, z) *
    smoothstep(-120.0, -185.0, z);
  h = mix(h, Math.min(h, WATER_LEVEL - 4.8), seawallBayMask * 0.96);

  // Three Scenic Rocky Lake Islands
  for (const [ix, iz, rx, rz, ih] of [
    [340.0, -680.0, 48.0, 38.0, 22.0],
    [980.0, -1480.0, 74.0, 58.0, 29.0],
    [1520.0, -960.0, 52.0, 44.0, 24.0]
  ]) {
    const di = Math.hypot((x - ix) / rx, (z - iz) / rz);
    h += ih * Math.exp(-(di * di) * 1.15);
  }

  // Waterfall rocky cliff bluff on far eastern shore at (1980, -1160)
  const wfBluffDist = Math.hypot((x - 2080.0) / 140.0, (z + 1160.0) / 120.0);
  h += 54.0 * Math.exp(-(wfBluffDist * wfBluffDist) * 1.1);

  // 5) Sprawling Babylon-Inspired Metropolis Terraced Apron (x < getQuayX(z))
  const inEastBay = x > qx - 1.5 && z >= -1760.0 && z <= -140.0;
  if (!inEastBay) {
    const dxWest = Math.max(0.0, -1650.0 - x);
    const dxEast = Math.max(0.0, x - qx);
    const dzNorth = Math.max(0.0, -1730.0 - z);
    const dzSouth = Math.max(0.0, z - (-150.0));
    const edgeDist = Math.hypot(dxWest + dxEast * 5.2, dzNorth + dzSouth * 2.2);
    const edgeWobble = fbm2(x * 0.008, z * 0.008, 2) * 16.0;
    const cityMask = smoothstep(115.0 + edgeWobble, 0.0, edgeDist);
    if (cityMask > 0.0001) {
      h = mix(h, getCityTerraceY(x, z), cityMask);
    }
  }

  // 6) Hyrule Castle Citadel Bluff (-1350, -2850) & Watchtower Knolls
  const dCastle = Math.hypot((x + 1350.0) / 190.0, (z + 2850.0) / 170.0);
  h += 76.0 * Math.exp(-(dCastle * dCastle));

  for (const [kx, kz] of [[-520.0, -1980.0], [1820.0, -2450.0], [-1920.0, -780.0]]) {
    const dk = Math.hypot(x - kx, z - kz);
    h += 28.0 * Math.exp(-(dk * dk) / 5200.0);
  }

  // 7) Eastern Red-Rock Canyon & Mesa Foothills (x > 2150)
  const mesaZone = smoothstep(2050.0, 2650.0, x) * smoothstep(-2900.0, -1900.0, z) * smoothstep(900.0, 200.0, z);
  const canyonRidge = ridgedFbm2(x * 0.0022 + 1.9, z * 0.0022 - 3.1, 4);
  h += mesaZone * (28.0 + Math.pow(canyonRidge, 1.25) * 95.0);

  // 8) 360-Degree Alpine Mountain Amphitheater (r = 3200..6200m) + Colossal Volcano Foothill Saddle
  const rCenter = Math.hypot(x - 150.0, z + 1500.0);
  const rimMask = smoothstep(2550.0, 3850.0, rCenter);
  if (rimMask > 0.0001) {
    const warpX = fbm2(x * 0.0008, z * 0.0008, 2) * 140.0;
    const warpZ = fbm2(x * 0.0008 + 7.2, z * 0.0008 - 4.4, 2) * 140.0;
    const ridge = ridgedFbm2((x + warpX) * 0.00105 + 3.1, (z + warpZ) * 0.00105 - 1.7, 5);
    const macro = fbm2(x * 0.0005, z * 0.0005, 3) * 0.5 + 0.5;
    // Open saddle centered around colossal Mount Eldin Volcano (1180, -4550) so its 1,080m cone stands heroically free!
    const dVolc = Math.hypot((x - VOLCANO_POS.x) / 1450.0, (z - VOLCANO_POS.z) / 1450.0);
    const volcanoGap = dVolc < 1.15 ? smoothstep(0.28, 1.15, dVolc) : 1.0;
    const outerDrop = 1.0 - smoothstep(5750.0, 6280.0, Math.max(Math.abs(x), Math.abs(z)));
    const mtnH = (48.0 + Math.pow(ridge, 1.15) * 440.0 * (0.55 + macro * 0.65)) * rimMask * volcanoGap * outerDrop;
    h += mtnH;
  }

  return h;
}

// ============================================================================
// SCENIC ~6.2 KM RING EXPRESSWAY + SOUTHERN LAKEFRONT CAUSEWAY BRIDGE
// ============================================================================
const HIGHWAY_CONTROL_PTS = [
  [-195, -240],
  [-460, -240],
  [-740, -240],
  [-1120, -210],
  [-1580, -340],
  [-1760, -760],
  [-1740, -1380],
  [-1340, -1820],
  [-620, -1860],
  [-145, -1620],
  [-85, -1080],
  [95, -520],
  [360, -260],
  [210, -125],
  [35, -142]
];

function evalCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

function buildHighwaySamples() {
  const pts = HIGHWAY_CONTROL_PTS;
  const n = pts.length;
  const stepsPerSeg = 22;
  const samples = [];

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const isSouthBlvd = i <= 1;

    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      const x = isSouthBlvd ? mix(p1[0], p2[0], t) : evalCatmullRom(p0[0], p1[0], p2[0], p3[0], t);
      const z = isSouthBlvd ? mix(p1[1], p2[1], t) : evalCatmullRom(p0[1], p1[1], p2[1], p3[1], t);

      const rawY = getBaseTerrainHeight(x, z);
      const inCity = isInCityBounds(x, z, -4.0);
      const isBridge = !inCity && rawY < WATER_LEVEL + 2.6;
      const cityTerrace = inCity ? getCityTerraceY(x, z) + 0.08 : rawY + 0.30;
      let targetY = inCity ? cityTerrace : Math.max(WATER_LEVEL + 6.4, rawY + 0.30);
      if (isBridge) targetY = WATER_LEVEL + 6.4;

      samples.push({
        x,
        z,
        y: targetY,
        isBridge,
        inCity,
        tx: 0,
        tz: -1
      });
    }
  }

  const smoothed = samples.map((s) => s.y);
  for (let pass = 0; pass < 9; pass++) {
    const next = smoothed.slice();
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].inCity && Math.abs(samples[i].z + 240.0) < 25.0) {
        next[i] = getCityTerraceY(samples[i].x, samples[i].z) + 0.08;
        continue;
      }
      const prevY = smoothed[(i - 1 + samples.length) % samples.length];
      const nextY = smoothed[(i + 1) % samples.length];
      next[i] = prevY * 0.25 + smoothed[i] * 0.50 + nextY * 0.25;
      if (samples[i].isBridge) next[i] = Math.max(next[i], WATER_LEVEL + 6.2);
    }
    for (let i = 0; i < samples.length; i++) smoothed[i] = next[i];
  }

  for (let i = 0; i < samples.length; i++) {
    samples[i].y = smoothed[i];
    const pPrev = samples[(i - 1 + samples.length) % samples.length];
    const pNext = samples[(i + 1) % samples.length];
    const dx = pNext.x - pPrev.x;
    const dz = pNext.z - pPrev.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    samples[i].tx = dx / len;
    samples[i].tz = dz / len;
  }

  return samples;
}

export const HIGHWAY_SAMPLES = buildHighwaySamples();

const HW_CELL = 110.0;
const highwayGrid = new Map();
(function indexHighwaySegments() {
  const N = HIGHWAY_SAMPLES.length;
  for (let i = 0; i < N; i++) {
    const a = HIGHWAY_SAMPLES[i];
    const b = HIGHWAY_SAMPLES[(i + 1) % N];
    const minCx = Math.floor((Math.min(a.x, b.x) - 40.0) / HW_CELL);
    const maxCx = Math.floor((Math.max(a.x, b.x) + 40.0) / HW_CELL);
    const minCz = Math.floor((Math.min(a.z, b.z) - 40.0) / HW_CELL);
    const maxCz = Math.floor((Math.max(a.z, b.z) + 40.0) / HW_CELL);
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cz}`;
        let arr = highwayGrid.get(key);
        if (!arr) {
          arr = [];
          highwayGrid.set(key, arr);
        }
        arr.push(i);
      }
    }
  }
})();

export function getHighwayInfo(x, z) {
  const cx = Math.floor(x / HW_CELL);
  const cz = Math.floor(z / HW_CELL);
  const segs = highwayGrid.get(`${cx},${cz}`);
  if (!segs) return { dist: 9999.0, roadY: 10.6, isBridge: false, inCity: false, tangentX: 1.0, tangentZ: 0.0 };

  let bestDistSq = 1e12;
  let bestY = 10.6;
  let bestBridge = false;
  let bestCity = false;
  let bestTx = 1.0;
  let bestTz = 0.0;
  const N = HIGHWAY_SAMPLES.length;

  for (let k = 0; k < segs.length; k++) {
    const idx = segs[k];
    const a = HIGHWAY_SAMPLES[idx];
    const b = HIGHWAY_SAMPLES[(idx + 1) % N];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abLenSq = abx * abx + abz * abz;
    const t = abLenSq > 0.0001 ? clamp(((x - a.x) * abx + (z - a.z) * abz) / abLenSq, 0.0, 1.0) : 0.0;
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestY = mix(a.y, b.y, t);
      bestBridge = t < 0.5 ? a.isBridge : b.isBridge;
      bestCity = a.inCity && b.inCity;
      bestTx = a.tx;
      bestTz = a.tz;
    }
  }

  return {
    dist: Math.sqrt(bestDistSq),
    roadY: bestY,
    isBridge: bestBridge,
    inCity: bestCity,
    tangentX: bestTx,
    tangentZ: bestTz
  };
}

let _extraRoadCheck = null;
export function setExtraRoadChecker(fn) {
  _extraRoadCheck = fn;
}

export function isOnRoadOrHighway(x, z, pad = 0.0) {
  if (_extraRoadCheck && _extraRoadCheck(x, z, pad)) return true;
  if (isInCityBounds(x, z, pad)) {
    for (let i = 0; i < ROAD_X.length; i++) {
      if (Math.abs(x - ROAD_X[i]) <= 11.0 + pad) return true;
    }
    for (let i = 0; i < ROAD_Z.length; i++) {
      if (Math.abs(z - ROAD_Z[i]) <= 10.0 + pad) return true;
    }
  }
  const hw = getHighwayInfo(x, z);
  return hw.dist <= 9.0 + pad;
}

export function getTerrainHeight(x, z) {
  let h = getBaseTerrainHeight(x, z);

  // Highway bed cut-and-fill grading outside city & bridges so asphalt hugs natural terrain!
  const hw = getHighwayInfo(x, z);
  if (hw.dist < 28.0 && !hw.inCity && !hw.isBridge) {
    const grade = smoothstep(28.0, 9.0, hw.dist);
    h = mix(h, hw.roadY - 0.16, grade);
  }
  return h;
}

const _tmpNorm = new THREE.Vector3();
export function getTerrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.75;
  const hL = getTerrainHeight(x - e, z);
  const hR = getTerrainHeight(x + e, z);
  const hD = getTerrainHeight(x, z - e);
  const hU = getTerrainHeight(x, z + e);
  return out.set(hL - hR, 2.0 * e, hD - hU).normalize();
}

export function getTerrainSlope(x, z) {
  return 1.0 - getTerrainNormal(x, z, _tmpNorm).y;
}
