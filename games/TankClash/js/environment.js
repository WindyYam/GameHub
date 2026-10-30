// ============================================================================
// TankClash — Procedural Infinite Meadow Battlefield Environment
// Features:
// - Infinite Chunk-Based Procedural Terrain Streaming around Tank
// - Smooth & Uniform Toroidal Grass Distribution (Stratified Grid, Zero Bald Patches)
// - Accurate Terrain Height Alignment (1:1 Synchronized CPU & GPU Height Functions)
// - Dynamic Grass Culling on Roads, Cottages, Ruins, Rocks & Spawn Clearing
// - Reverted to Authentic Maldive Celestial Sky Dome (Milky Way, Stars, Moon, Clouds)
// - Detailed Botanical Multi-Bough Spruce & Forked Deciduous Trees
// - European Timber-Framed Cottages & Smoldering War Ruins with Smoke Plumes
// - Deterministic Seeded PRNG with Session Persistence & 'R' Restart
// ============================================================================

var environmentMode = 'wild'; // 'wild' or 'studio'
var envGroup = null;
var chunksGroup = null;
var obstacles = [];
var targets = [];
var swayTrees = [];
var worldBuildings = [];
var worldObstacles = [];
var terrainMeshRef = null;
var aimRaycastMeshes = [];
var waterMeshRef = null;
var grassMeshRef = null;
var grassLOD0Mesh = null;
var grassLOD0MidMesh = null;
var grassLOD0FarMesh = null;
var grassLOD1Mesh = null;
var grassBillboardCloseMesh = null;
var skyDome = null;
var skyMat = null;

// Active chunks streaming map
var activeChunks = new Map();
var activeChunkCenterX = null;
var activeChunkCenterZ = null;
var sessionFallenTrees = new Set();
var sessionDestroyedTargets = new Set();

// Active smoke & fire plume instances for animation
var activeSmokePuffs = [];
var activeFireSprites = [];

// ============================================================================
// 1. ZONE CONFIGURATIONS, SEED MANAGEMENT & DETERMINISTIC PRNG
// ============================================================================
const ZONE_CONFIGS = {
    meadow: {
        id: 'meadow',
        typeIndex: 0,
        name: 'Coastal Meadow',
        shortName: 'Meadow',
        icon: '🌿',
        banner: '🌿 ZONE: COASTAL MEADOW COUNTRYSIDE',
        fogColor: 0xc2d0dc,
        fogDensity: 0.00085,
        dayHorizonTint: 0x82b6e5,
        groundDayTint: 0x56733a,
        trackDustColor: 0x5c4d3c
    },
    desert: {
        id: 'desert',
        typeIndex: 1,
        name: 'Sahara Desert',
        shortName: 'Desert',
        icon: '🏜️',
        banner: '🏜️ ZONE: SAHARA DESERT DUNES & OASIS',
        fogColor: 0xe4c79c,
        fogDensity: 0.00092,
        dayHorizonTint: 0xd9bf96,
        groundDayTint: 0xa67c46,
        trackDustColor: 0xc89d62
    },
    mountain: {
        id: 'mountain',
        typeIndex: 2,
        name: 'Alpine Mountains',
        shortName: 'Mountain',
        icon: '⛰️',
        banner: '⛰️ ZONE: ALPINE MOUNTAIN PASS & PEAKS',
        fogColor: 0xb6cbe0,
        fogDensity: 0.00088,
        dayHorizonTint: 0x7cb0e0,
        groundDayTint: 0x4b5c4a,
        trackDustColor: 0x62676e
    },
    hills: {
        id: 'hills',
        typeIndex: 3,
        name: 'Rolling Hills',
        shortName: 'Hills',
        icon: '🏞️',
        banner: '🏞️ ZONE: HIGHLAND ROLLING HILLS & VALLEYS',
        fogColor: 0xc5d2dc,
        fogDensity: 0.00085,
        dayHorizonTint: 0x88b8e2,
        groundDayTint: 0x626b38,
        trackDustColor: 0x635038
    }
};

const ALL_ZONES = ['meadow', 'desert', 'mountain', 'hills'];
var currentZone = ALL_ZONES[Math.floor(Math.random() * ALL_ZONES.length)];
var currentZoneIndex = ZONE_CONFIGS[currentZone].typeIndex;
var currentZoneConfig = ZONE_CONFIGS[currentZone];
window.ZONE_CONFIGS = ZONE_CONFIGS;
window.ALL_ZONES = ALL_ZONES;
window.currentZone = currentZone;
window.currentZoneIndex = currentZoneIndex;
window.currentZoneConfig = currentZoneConfig;

var currentSeed = Math.floor(Math.random() * 900000) + 100000;
var seedOffset = { x: 0, z: 0 };
var roadBaseX = 0;
var road2BaseZ = 0;
var road3BaseX = 0;
var road4BaseX = 0;
var zoneStaticGroup = null;

function syncZoneUniformsAndHUD() {
    if (terrainUniforms && terrainUniforms.uZoneType) {
        terrainUniforms.uZoneType.value = currentZoneIndex;
    }
    if (grassUniforms && grassUniforms.uZoneType) {
        grassUniforms.uZoneType.value = currentZoneIndex;
    }
    if (waterMeshRef) {
        if (waterMeshRef.material && waterMeshRef.material.uniforms && waterMeshRef.material.uniforms.uZoneType) {
            waterMeshRef.material.uniforms.uZoneType.value = currentZoneIndex;
        }
        // In Coastal Meadow, ocean spans +Z bay; in Desert/Mountain/Hills, water plane covers central oasis/tarn/pond basins
        waterMeshRef.position.set(0, -2.5, currentZone === 'meadow' ? 1500 : 0);
    }

    const zoneLabelEl = document.getElementById('hud-zone-label');
    if (zoneLabelEl && currentZoneConfig) {
        zoneLabelEl.textContent = `Zone: ${currentZoneConfig.shortName}`;
    }
    const zoneBtnEl = document.getElementById('btn-zone-cycle');
    if (zoneBtnEl && currentZoneConfig) {
        zoneBtnEl.innerHTML = `${currentZoneConfig.icon} <span id="hud-zone-label">Zone: ${currentZoneConfig.shortName}</span>`;
    }
}

function setWorldSeed(seed, zoneId) {
    if (zoneId && ZONE_CONFIGS[zoneId]) {
        currentZone = zoneId;
        currentZoneIndex = ZONE_CONFIGS[zoneId].typeIndex;
        currentZoneConfig = ZONE_CONFIGS[zoneId];
        window.currentZone = currentZone;
        window.currentZoneIndex = currentZoneIndex;
        window.currentZoneConfig = currentZoneConfig;
    }
    currentSeed = seed;
    window.currentSeed = currentSeed;
    seedOffset.x = (currentSeed % 289);
    seedOffset.z = ((Math.floor(currentSeed / 289)) % 289);
    roadBaseX = Math.sin(seedOffset.z * 0.009) * 32.0 + Math.cos(seedOffset.z * 0.021) * 12.0 + Math.sin(seedOffset.z * 0.0035) * 20.0;
    road2BaseZ = Math.sin(seedOffset.x * 0.010) * 22.0 + Math.cos(seedOffset.x * 0.022) * 8.0;
    road3BaseX = Math.sin(seedOffset.z * 0.014) * 20.0 + Math.cos(seedOffset.z * 0.028) * 7.0;
    road4BaseX = Math.sin(seedOffset.z * 0.012) * 18.0 + Math.cos(seedOffset.z * 0.025) * 6.0;

    if (terrainUniforms && terrainUniforms.uSeedOffset) {
        terrainUniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        terrainUniforms.uRoadBaseX.value = roadBaseX;
        terrainUniforms.uRoad2BaseZ.value = road2BaseZ;
        terrainUniforms.uRoad3BaseX.value = road3BaseX;
        terrainUniforms.uRoad4BaseX.value = road4BaseX;
    }
    if (grassUniforms && grassUniforms.uSeedOffset) {
        grassUniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        grassUniforms.uRoadBaseX.value = roadBaseX;
        grassUniforms.uRoad2BaseZ.value = road2BaseZ;
        grassUniforms.uRoad3BaseX.value = road3BaseX;
        grassUniforms.uRoad4BaseX.value = road4BaseX;
    }
    if (waterMeshRef && waterMeshRef.material && waterMeshRef.material.uniforms && waterMeshRef.material.uniforms.uSeedOffset) {
        if (waterMeshRef.material.uniforms.uSeedOffset.value && typeof waterMeshRef.material.uniforms.uSeedOffset.value.set === 'function') {
            waterMeshRef.material.uniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        } else {
            waterMeshRef.material.uniforms.uSeedOffset.value = new THREE.Vector2(seedOffset.x, seedOffset.z);
        }
        if (waterMeshRef.material.uniforms.uRoadBaseX) {
            waterMeshRef.material.uniforms.uRoadBaseX.value = roadBaseX;
        }
    }

    syncZoneUniformsAndHUD();
    sessionFallenTrees.clear();
    sessionDestroyedTargets.clear();
}

function createChunkRNG(cx, cz, seed) {
    let s = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(seed, 83492791)) >>> 0;
    return function() {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ============================================================================
// 2. MATH & PROCEDURAL NOISE (EXACT 1:1 CPU AND GPU SYNCHRONIZATION)
// ============================================================================
function fract(x) { return x - Math.floor(x); }
function mix(a, b, t) { return a + (b - a) * t; }
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
}

// Exact Stefan Gustavson modular permutation hash matching GLSL 1:1 with zero float precision divergence
function mod289(x) { return ((x % 289) + 289) % 289; }
function permute(x) { return mod289(((x * 34) + 1) * x); }
function hash2D(px, py) {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    return permute(permute(ix) + iy) / 288.0;
}

function valueNoise2D(px, py) {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    const a = hash2D(ix, iy);
    const b = hash2D(ix + 1.0, iy);
    const c = hash2D(ix, iy + 1.0);
    const d = hash2D(ix + 1.0, iy + 1.0);
    return mix(mix(a, b, ux), mix(c, d, ux), uy) * 2.0 - 1.0;
}

function fbm4(px, py) {
    let total = 0.0, freq = 1.0, amp = 1.0, maxVal = 0.0;
    for (let i = 0; i < 4; i++) {
        total += valueNoise2D(px * freq, py * freq) * amp;
        maxVal += amp;
        amp *= 0.48;
        freq *= 2.02;
    }
    return total / maxVal;
}

function fbm3(px, py) {
    let total = 0.0, freq = 1.0, amp = 1.0, maxVal = 0.0;
    for (let i = 0; i < 3; i++) {
        total += valueNoise2D(px * freq, py * freq) * amp;
        maxVal += amp;
        amp *= 0.45;
        freq *= 2.1;
    }
    return total / maxVal;
}

// Shared GLSL snippet injected into both Terrain and Grass LOD shaders
const SHARED_TERRAIN_GLSL = `
    uniform vec2 uSeedOffset;
    uniform float uRoadBaseX;
    uniform int uZoneType;

    float mod289_gpu(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289_gpu(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    float permute_gpu(float x) { return mod289_gpu(((x * 34.0) + 1.0) * x); }
    vec2 permute_gpu(vec2 x) { return mod289_gpu(((x * 34.0) + 1.0) * x); }

    float hash2D_gpu(vec2 p) {
        vec2 ip = floor(p);
        return permute_gpu(permute_gpu(ip.x) + ip.y) * (1.0 / 288.0);
    }

    float valueNoise2D_gpu(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash2D_gpu(i);
        float b = hash2D_gpu(i + vec2(1.0, 0.0));
        float c = hash2D_gpu(i + vec2(0.0, 1.0));
        float d = hash2D_gpu(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
    }

    float fbm4_gpu(vec2 p) {
        float total = 0.0, freq = 1.0, amp = 1.0, maxVal = 0.0;
        for (int i = 0; i < 4; i++) {
            total += valueNoise2D_gpu(p * freq) * amp;
            maxVal += amp;
            amp *= 0.48;
            freq *= 2.02;
        }
        return total / maxVal;
    }

    float fbm3_gpu(vec2 p) {
        float total = 0.0, freq = 1.0, amp = 1.0, maxVal = 0.0;
        for (int i = 0; i < 3; i++) {
            total += valueNoise2D_gpu(p * freq) * amp;
            maxVal += amp;
            amp *= 0.45;
            freq *= 2.1;
        }
        return total / maxVal;
    }

    uniform float uRoad2BaseZ;
    uniform float uRoad3BaseX;
    uniform float uRoad4BaseX;

    float getRoadDistance_gpu(float x, float z) {
        // Road 1: Main North-South Highway (through x ~ 0)
        float r1X = (sin((z + uSeedOffset.y) * 0.009) * 32.0 + cos((z + uSeedOffset.y) * 0.021) * 12.0 + sin((z + uSeedOffset.y) * 0.0035) * 20.0) - uRoadBaseX;
        float d1 = abs(x - r1X);

        // Road 2: East-West Valley Crossroad (through z ~ -28)
        float r2Z = -28.0 + (sin((x + uSeedOffset.x) * 0.010) * 22.0 + cos((x + uSeedOffset.x) * 0.022) * 8.0) - uRoad2BaseZ;
        float d2 = abs(z - r2Z);

        // Road 3: Northeast Village Ridge Byway (through x ~ 64)
        float r3X = 64.0 + (sin((z + uSeedOffset.y) * 0.014) * 20.0 + cos((z + uSeedOffset.y) * 0.028) * 7.0) - uRoad3BaseX;
        float d3 = abs(x - r3X);

        // Road 4: Northwest Coastal Byway (through x ~ -68)
        float r4X = -68.0 + (sin((z + uSeedOffset.y) * 0.012) * 18.0 + cos((z + uSeedOffset.y) * 0.025) * 6.0) - uRoad4BaseX;
        float d4 = abs(x - r4X);

        return min(min(d1, d2), min(d3, d4));
    }

    float getRoadCenterX_gpu(float z) {
        return (sin((z + uSeedOffset.y) * 0.009) * 32.0 + cos((z + uSeedOffset.y) * 0.021) * 12.0 + sin((z + uSeedOffset.y) * 0.0035) * 20.0) - uRoadBaseX;
    }

    float getRoadFactor_gpu(float x, float z) {
        float dist = getRoadDistance_gpu(x, z);
        float halfWidth = 4.6;
        if (dist > halfWidth) return 0.0;
        float t = 1.0 - (dist / halfWidth);
        return t * t * (3.0 - 2.0 * t);
    }

    const float SEA_LEVEL = -2.5;

    float getTerrainHeight_gpu(float x, float z) {
        vec2 s = vec2(x, z) + uSeedOffset;
        float dSpawn = length(vec2(x, z));
        float roadDist = getRoadDistance_gpu(x, z);
        float roadF = getRoadFactor_gpu(x, z);
        float finalH = 0.0;

        // ZONE 1: SAHARA DESERT DUNES, SANDSTONE MESAS & OASIS
        if (uZoneType == 1) {
            float duneWarp = fbm3_gpu(s * 0.0055) * 2.2;
            float dunePhase = (s.x * 0.82 + s.y * 0.57) * 0.019 + duneWarp;
            float duneWave = (sin(dunePhase) + 0.30 * sin(dunePhase * 2.0 - 0.55)) * 4.2;

            float macroErg = fbm4_gpu(s * 0.0036) * 6.5;
            float medDunes = fbm3_gpu(s * 0.014) * 1.8;
            float microRipples = valueNoise2D_gpu(s * 0.09) * 0.18;
            float h = 5.8 + macroErg + duneWave + medDunes + microRipples;

            // Flat-topped Sandstone Mesas / Buttes in the outer desert
            float mesaNoise = fbm3_gpu(s * 0.0042 + vec2(37.0, 61.0));
            float mesaMask = smoothstep(0.34, 0.48, mesaNoise) * smoothstep(55.0, 105.0, dSpawn) * smoothstep(10.0, 32.0, roadDist);
            h += mesaMask * 13.5;

            // Desert Oasis Basin at (58, 78)
            float dOasis = length(vec2(x - 58.0, z - 78.0));
            float oasisDip = (1.0 - smoothstep(14.0, 48.0, dOasis)) * 9.8;
            h -= oasisDip;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(6.2, h, spawnClear);

            if (roadF > 0.01) {
                float wadiTarget = 5.4 + macroErg * 0.45;
                h = mix(h, wadiTarget, roadF * 0.65);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.25;
                h -= (roadF * 0.22 + rut * roadF);
            }
            finalH = h;
        }

        // ZONE 2: ALPINE MOUNTAIN PASS, CRAGGY RIDGES & GLACIAL TARN
        else if (uZoneType == 2) {
            float valleyHills = fbm4_gpu(s * 0.0045) * 7.5;
            float foothillBumps = fbm3_gpu(s * 0.016) * 2.6;
            float microRock = valueNoise2D_gpu(s * 0.085) * 0.32;
            float h = 6.5 + valleyHills + foothillBumps + microRock;

            // Ridged Multifractal Alpine Peaks & Massifs flanking the passes
            float r1 = 1.0 - abs(valueNoise2D_gpu(s * 0.0052));
            float r2 = 1.0 - abs(valueNoise2D_gpu(s * 0.0115 + vec2(19.0, 31.0)));
            float ridgeCrest = (r1 * r1 * 0.65 + r2 * r2 * 0.35);
            float massifEnv = fbm3_gpu(s * 0.0038 + vec2(53.0, 17.0)) * 0.5 + 0.5;
            float mountainHeight = (pow(max(0.0, massifEnv), 1.45) * 26.0 + pow(ridgeCrest, 1.6) * 20.0);

            float passCorridor = smoothstep(9.0, 44.0, roadDist);
            float spawnCorridor = smoothstep(22.0, 78.0, dSpawn);
            h += mountainHeight * passCorridor * spawnCorridor;

            // Glacial Alpine Tarn at (-54, 92)
            float dTarn = length(vec2(x + 54.0, z - 92.0));
            float tarnDip = (1.0 - smoothstep(14.0, 46.0, dTarn)) * 11.5;
            h -= tarnDip;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(7.2, h, spawnClear);

            if (roadF > 0.01) {
                float passGrade = 6.5 + valleyHills * 0.55;
                h = mix(h, passGrade, roadF * 0.60);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.30;
                h -= (roadF * 0.28 + rut * roadF);
            }
            finalH = h;
        }

        // ZONE 3: HIGHLAND ROLLING HILLS, DRUMLINS & SUNKEN LANES
        else if (uZoneType == 3) {
            float bigHills = fbm4_gpu(s * 0.0062) * 10.5;
            float warp = fbm3_gpu(s * 0.009) * 2.2;
            float drumlins = sin(s.x * 0.021 + warp) * cos(s.y * 0.019 - warp) * 5.2;
            float medSlopes = fbm3_gpu(s * 0.020) * 2.4;
            float microTurf = valueNoise2D_gpu(s * 0.08) * 0.28;
            float h = 7.4 + bigHills + drumlins + medSlopes + microTurf;

            float knoll = (1.0 - smoothstep(15.0, 75.0, dSpawn)) * 3.2;
            h += knoll;

            // Highland Valley Pond Basin at (62, -82)
            float dPond = length(vec2(x - 62.0, z + 82.0));
            float pondDip = (1.0 - smoothstep(12.0, 42.0, dPond)) * 11.2;
            h -= pondDip;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(8.5, h, spawnClear);

            if (roadF > 0.01) {
                float laneGrade = 7.2 + bigHills * 0.55 + drumlins * 0.35;
                h = mix(h, laneGrade, roadF * 0.55);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
                h -= (roadF * 0.42 + rut * roadF);
            }
            finalH = h;
        }

        // ZONE 0 (DEFAULT): COASTAL MEADOW COUNTRYSIDE
        else {
            float rollingHills = fbm4_gpu(s * 0.0042) * 4.5;
            float mediumUndulation = fbm3_gpu(s * 0.016) * 1.8;
            float microBumps = valueNoise2D_gpu(s * 0.08) * 0.25;
            float h = 6.8 + rollingHills + mediumUndulation + microBumps;

            // Elevated grassy ridge around tank spawn (0, 0) overlooking the seaside
            float ridgeElev = (1.0 - smoothstep(12.0, 95.0, dSpawn)) * 2.8;
            h += ridgeElev;

            // Gentle rolling countryside slope descending toward the coastal ocean (+Z)
            float coastalDist = z + (fbm3_gpu(s * 0.009) * 28.0);
            float coastalSlope = smoothstep(110.0, 360.0, coastalDist) * 12.8;

            // Rolling coastal headlands framing the bay on the left and right
            float headland = smoothstep(60.0, 200.0, abs(x)) * smoothstep(60.0, 420.0, coastalDist) * 6.5;
            h = h - coastalSlope + headland;

            // Spawn pad clearing
            float spawnClear = smoothstep(3.5, 16.0, dSpawn);
            h = mix(7.2, h, spawnClear);

            if (roadF > 0.01) {
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
                h -= (roadF * 0.35 + rut * roadF);
            }
            finalH = h;
        }

        return finalH;
    }

    float getTerrainSurfaceHeight_gpu(float x, float z, out vec3 surfaceNormal) {
        const float terrainCellSize = 2.5;
        vec2 cell = floor(vec2(x, z) / terrainCellSize) * terrainCellSize;
        vec2 f = (vec2(x, z) - cell) / terrainCellSize;
        float h00 = getTerrainHeight_gpu(cell.x, cell.y);
        float h10 = getTerrainHeight_gpu(cell.x + terrainCellSize, cell.y);
        float h01 = getTerrainHeight_gpu(cell.x, cell.y + terrainCellSize);
        float h11 = getTerrainHeight_gpu(cell.x + terrainCellSize, cell.y + terrainCellSize);

        if (f.x + f.y <= 1.0) {
            surfaceNormal = normalize(vec3(h00 - h10, terrainCellSize, h00 - h01));
            return h00 * (1.0 - f.x - f.y) + h10 * f.x + h01 * f.y;
        }
        surfaceNormal = normalize(vec3(h01 - h11, terrainCellSize, h10 - h11));
        return h11 * (f.x + f.y - 1.0) + h01 * (1.0 - f.x) + h10 * (1.0 - f.y);
    }
`;

function getRoadDistance(x, z) {
    // Road 1: Main North-South Highway (through x ~ 0)
    const r1X = (Math.sin((z + seedOffset.z) * 0.009) * 32.0 + Math.cos((z + seedOffset.z) * 0.021) * 12.0 + Math.sin((z + seedOffset.z) * 0.0035) * 20.0) - roadBaseX;
    const d1 = Math.abs(x - r1X);

    // Road 2: East-West Valley Crossroad (through z ~ -28)
    const r2Z = -28.0 + (Math.sin((x + seedOffset.x) * 0.010) * 22.0 + Math.cos((x + seedOffset.x) * 0.022) * 8.0) - road2BaseZ;
    const d2 = Math.abs(z - r2Z);

    // Road 3: Northeast Village Ridge Byway (through x ~ 64)
    const r3X = 64.0 + (Math.sin((z + seedOffset.z) * 0.014) * 20.0 + Math.cos((z + seedOffset.z) * 0.028) * 7.0) - road3BaseX;
    const d3 = Math.abs(x - r3X);

    // Road 4: Northwest Coastal Byway (through x ~ -68)
    const r4X = -68.0 + (Math.sin((z + seedOffset.z) * 0.012) * 18.0 + Math.cos((z + seedOffset.z) * 0.025) * 6.0) - road4BaseX;
    const d4 = Math.abs(x - r4X);

    return Math.min(Math.min(d1, d2), Math.min(d3, d4));
}

function getRoadCenterX(z) {
    return (Math.sin((z + seedOffset.z) * 0.009) * 32.0 + Math.cos((z + seedOffset.z) * 0.021) * 12.0 + Math.sin((z + seedOffset.z) * 0.0035) * 20.0) - roadBaseX;
}

function getRoadFactor(x, z) {
    const dist = getRoadDistance(x, z);
    const halfWidth = 4.6;
    if (dist > halfWidth) return 0.0;
    const t = 1.0 - (dist / halfWidth);
    return t * t * (3.0 - 2.0 * t);
}

const SEA_LEVEL = -2.5;

function getTerrainHeight(x, z) {
    if (environmentMode === 'studio') return 0;

    const sx = x + seedOffset.x;
    const sz = z + seedOffset.z;
    const dSpawn = Math.hypot(x, z);
    const roadDist = getRoadDistance(x, z);
    const roadF = getRoadFactor(x, z);

    // ZONE 1: SAHARA DESERT DUNES, SANDSTONE MESAS & OASIS
    if (currentZoneIndex === 1) {
        const duneWarp = fbm3(sx * 0.0055, sz * 0.0055) * 2.2;
        const dunePhase = (sx * 0.82 + sz * 0.57) * 0.019 + duneWarp;
        const duneWave = (Math.sin(dunePhase) + 0.30 * Math.sin(dunePhase * 2.0 - 0.55)) * 4.2;

        const macroErg = fbm4(sx * 0.0036, sz * 0.0036) * 6.5;
        const medDunes = fbm3(sx * 0.014, sz * 0.014) * 1.8;
        const microRipples = valueNoise2D(sx * 0.09, sz * 0.09) * 0.18;
        let h = 5.8 + macroErg + duneWave + medDunes + microRipples;

        const mesaNoise = fbm3(sx * 0.0042 + 37.0, sz * 0.0042 + 61.0);
        const mesaMask = smoothstep(0.34, 0.48, mesaNoise) * smoothstep(55.0, 105.0, dSpawn) * smoothstep(10.0, 32.0, roadDist);
        h += mesaMask * 13.5;

        const dOasis = Math.hypot(x - 58.0, z - 78.0);
        const oasisDip = (1.0 - smoothstep(14.0, 48.0, dOasis)) * 9.8;
        h -= oasisDip;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(6.2, h, spawnClear);

        if (roadF > 0.01) {
            const wadiTarget = 5.4 + macroErg * 0.45;
            h = mix(h, wadiTarget, roadF * 0.65);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.25;
            h -= (roadF * 0.22 + rut * roadF);
        }
        return h;
    }

    // ZONE 2: ALPINE MOUNTAIN PASS, CRAGGY RIDGES & GLACIAL TARN
    if (currentZoneIndex === 2) {
        const valleyHills = fbm4(sx * 0.0045, sz * 0.0045) * 7.5;
        const foothillBumps = fbm3(sx * 0.016, sz * 0.016) * 2.6;
        const microRock = valueNoise2D(sx * 0.085, sz * 0.085) * 0.32;
        let h = 6.5 + valleyHills + foothillBumps + microRock;

        const r1 = 1.0 - Math.abs(valueNoise2D(sx * 0.0052, sz * 0.0052));
        const r2 = 1.0 - Math.abs(valueNoise2D(sx * 0.0115 + 19.0, sz * 0.0115 + 31.0));
        const ridgeCrest = (r1 * r1 * 0.65 + r2 * r2 * 0.35);
        const massifEnv = fbm3(sx * 0.0038 + 53.0, sz * 0.0038 + 17.0) * 0.5 + 0.5;
        const mountainHeight = (Math.pow(Math.max(0.0, massifEnv), 1.45) * 26.0 + Math.pow(ridgeCrest, 1.6) * 20.0);

        const passCorridor = smoothstep(9.0, 44.0, roadDist);
        const spawnCorridor = smoothstep(22.0, 78.0, dSpawn);
        h += mountainHeight * passCorridor * spawnCorridor;

        const dTarn = Math.hypot(x + 54.0, z - 92.0);
        const tarnDip = (1.0 - smoothstep(14.0, 46.0, dTarn)) * 11.5;
        h -= tarnDip;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.2, h, spawnClear);

        if (roadF > 0.01) {
            const passGrade = 6.5 + valleyHills * 0.55;
            h = mix(h, passGrade, roadF * 0.60);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.30;
            h -= (roadF * 0.28 + rut * roadF);
        }
        return h;
    }

    // ZONE 3: HIGHLAND ROLLING HILLS, DRUMLINS & SUNKEN LANES
    if (currentZoneIndex === 3) {
        const bigHills = fbm4(sx * 0.0062, sz * 0.0062) * 10.5;
        const warp = fbm3(sx * 0.009, sz * 0.009) * 2.2;
        const drumlins = Math.sin(sx * 0.021 + warp) * Math.cos(sz * 0.019 - warp) * 5.2;
        const medSlopes = fbm3(sx * 0.020, sz * 0.020) * 2.4;
        const microTurf = valueNoise2D(sx * 0.08, sz * 0.08) * 0.28;
        let h = 7.4 + bigHills + drumlins + medSlopes + microTurf;

        const knoll = (1.0 - smoothstep(15.0, 75.0, dSpawn)) * 3.2;
        h += knoll;

        const dPond = Math.hypot(x - 62.0, z + 82.0);
        const pondDip = (1.0 - smoothstep(12.0, 42.0, dPond)) * 11.2;
        h -= pondDip;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(8.5, h, spawnClear);

        if (roadF > 0.01) {
            const laneGrade = 7.2 + bigHills * 0.55 + drumlins * 0.35;
            h = mix(h, laneGrade, roadF * 0.55);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
            h -= (roadF * 0.42 + rut * roadF);
        }
        return h;
    }

    // ZONE 0 (DEFAULT): COASTAL MEADOW COUNTRYSIDE
    const rollingHills = fbm4(sx * 0.0042, sz * 0.0042) * 4.5;
    const mediumUndulation = fbm3(sx * 0.016, sz * 0.016) * 1.8;
    const microBumps = valueNoise2D(sx * 0.08, sz * 0.08) * 0.25;

    let h = 6.8 + rollingHills + mediumUndulation + microBumps;

    const ridgeElev = (1.0 - smoothstep(12.0, 95.0, dSpawn)) * 2.8;
    h += ridgeElev;

    const coastalDist = z + (fbm3(sx * 0.009, sz * 0.009) * 28.0);
    const coastalSlope = smoothstep(110.0, 360.0, coastalDist) * 12.8;

    const headland = smoothstep(60.0, 200.0, Math.abs(x)) * smoothstep(60.0, 420.0, coastalDist) * 6.5;
    h = h - coastalSlope + headland;

    const spawnClear = smoothstep(3.5, 16.0, dSpawn);
    h = mix(7.2, h, spawnClear);

    if (roadF > 0.01) {
        const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
        h -= (roadF * 0.35 + rut * roadF);
    }

    return h;
}

function getTerrainNormal(x, z) {
    const eps = 0.5;
    const hL = getTerrainHeight(x - eps, z);
    const hR = getTerrainHeight(x + eps, z);
    const hD = getTerrainHeight(x, z - eps);
    const hU = getTerrainHeight(x, z + eps);
    const n = new THREE.Vector3(hL - hR, 2.0 * eps, hD - hU);
    return n.normalize();
}

// ============================================================================
// 3. REVERTED TO PREVIOUS MALDIVE CELESTIAL SKY DOME (SUN, MOON, STARS, CLOUDS)
// ============================================================================
function updateSkyDome(t) {
    // Handled by main.js celestial loop with window.skyMat
}

function updateDaylightSystem(hour) {
    // Compatibility stub for controls/main calls
}

// ============================================================================
// 4. SHARED MATERIALS & SHADERS
// ============================================================================
const terrainUniforms = {
    uTime: { value: 0 },
    uWindSpeed: { value: 1.2 },
    uCameraPos: { value: new THREE.Vector3() },
    uCameraForwardXZ: { value: new THREE.Vector2(0, 1) },
    uSeedOffset: { value: new THREE.Vector2(0, 0) },
    uRoadBaseX: { value: 0 },
    uRoad2BaseZ: { value: 0 },
    uRoad3BaseX: { value: 0 },
    uRoad4BaseX: { value: 0 },
    uZoneType: { value: currentZoneIndex },
    uBuildings: { value: Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uBuildingCount: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.72, -0.52).normalize() },
    uSunColor: { value: new THREE.Color(0xfff5e0) },
    uSkyColor: { value: new THREE.Color(0x82b6e5) }
};

// Non-metal ground & vegetation: reduced static steel IBL fill for stronger sun/shade contrast
const GROUND_ENV_MAP_INTENSITY = 0.4;

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uWindSpeed = terrainUniforms.uWindSpeed;
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uSeedOffset = terrainUniforms.uSeedOffset;
    shader.uniforms.uRoadBaseX = terrainUniforms.uRoadBaseX;
    shader.uniforms.uRoad2BaseZ = terrainUniforms.uRoad2BaseZ;
    shader.uniforms.uRoad3BaseX = terrainUniforms.uRoad3BaseX;
    shader.uniforms.uRoad4BaseX = terrainUniforms.uRoad4BaseX;
    shader.uniforms.uZoneType = terrainUniforms.uZoneType;
    shader.uniforms.uBuildings = terrainUniforms.uBuildings;
    shader.uniforms.uBuildingCount = terrainUniforms.uBuildingCount;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;

    shader.vertexShader = `
        varying vec3 vTerrainWorldPos;
        varying float vTerrainSlope;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainSlope = 1.0 - normal.y;
        `
    );

    shader.fragmentShader = `
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec3 uCameraPos;
        uniform vec4 uBuildings[32];
        uniform int uBuildingCount;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        varying vec3 vTerrainWorldPos;
        varying float vTerrainSlope;
        ${SHARED_TERRAIN_GLSL}
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float distToCam = length(vTerrainWorldPos.xz - uCameraPos.xz);
        float roadMask = getRoadFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        float grassSurfaceMask = (1.0 - smoothstep(0.10, 0.45, roadMask)) * (1.0 - smoothstep(0.20, 0.40, vTerrainSlope));

        // High-frequency micro-blade & soil texture
        float microNoise = valueNoise2D_gpu(vTerrainWorldPos.xz * 4.2) * 0.5 + 0.5;
        float gravelNoise = valueNoise2D_gpu(vTerrainWorldPos.xz * 12.0) * 0.5 + 0.5;
        float macroPatch = valueNoise2D_gpu(vTerrainWorldPos.xz * 0.06) * 0.5 + 0.5;

        // Synchronized rolling wind waves
        float tWind = uTime * uWindSpeed;
        float wave1 = sin(vTerrainWorldPos.x * 0.14 + vTerrainWorldPos.z * 0.12 + tWind * 2.4);
        float wave2 = cos(vTerrainWorldPos.x * 0.35 - vTerrainWorldPos.z * 0.28 + tWind * 3.6) * 0.45;
        float windWave = (wave1 + wave2 * 0.7) * 0.5 + 0.5;

        // Convert vertex color from sRGB to linear space
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.001)), vec3(2.2));

        if (uZoneType == 1) {
            // SAHARA DESERT ZONE: Wind-rippled golden dunes, stratified red-ochre sandstone cliffs & desert oasis
            float sandRipple = sin(vTerrainWorldPos.x * 3.4 + vTerrainWorldPos.z * 2.1 + microNoise * 2.2) * 0.5 + 0.5;
            vec3 sunlitSand = vec3(0.48, 0.31, 0.14);
            vec3 warmErg    = vec3(0.35, 0.20, 0.08);
            vec3 duneTint   = mix(warmErg, sunlitSand, macroPatch * 0.55 + sandRipple * 0.30 + microNoise * 0.15);
            duneTint *= (0.97 + windWave * 0.05);
            diffuseColor.rgb = mix(diffuseColor.rgb, duneTint, grassSurfaceMask * 0.88);

            // Stratified desert sandstone strata on mesa cliffs & steep dune slip-faces
            if (vTerrainSlope > 0.15) {
                float strata = sin(vTerrainWorldPos.y * 2.6 + microNoise * 1.8) * 0.5 + 0.5;
                vec3 sandstoneA = vec3(0.34, 0.17, 0.08);
                vec3 sandstoneB = vec3(0.20, 0.10, 0.05);
                vec3 mesaRock = mix(sandstoneB, sandstoneA, strata * 0.75 + gravelNoise * 0.25);
                diffuseColor.rgb = mix(diffuseColor.rgb, mesaRock, smoothstep(0.15, 0.35, vTerrainSlope));
            }

            // Compacted Desert Hardpan & Gravel Wadi Trail
            if (roadMask > 0.02) {
                float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                vec3 wadiGravel = mix(vec3(0.28, 0.18, 0.09), vec3(0.20, 0.13, 0.06), gravelNoise * 0.65);
                vec3 dustyRut = vec3(0.15, 0.095, 0.045);
                vec3 wadiColor = mix(wadiGravel, dustyRut, rutMask * 0.78);
                diffuseColor.rgb = mix(diffuseColor.rgb, wadiColor, smoothstep(0.02, 0.48, roadMask));
            }

            // Lush Oasis Fringe & Wet Sand along oasis water edge
            float oasisMask = 1.0 - smoothstep(-2.55, -0.45, vTerrainWorldPos.y);
            if (oasisMask > 0.001) {
                float wetZone = 1.0 - smoothstep(-2.65, -1.95, vTerrainWorldPos.y);
                vec3 oasisMoss = mix(vec3(0.05, 0.11, 0.025), vec3(0.18, 0.14, 0.08), microNoise * 0.45);
                vec3 wetOasisSand = vec3(0.09, 0.07, 0.04);
                diffuseColor.rgb = mix(diffuseColor.rgb, mix(oasisMoss, wetOasisSand, wetZone), oasisMask * (1.0 - roadMask * 0.7));
            }
        } else if (uZoneType == 2) {
            // ALPINE MOUNTAIN ZONE: Valley pine turf, craggy cold granite/slate cliffs & high-altitude snowline
            vec3 rootGround = mix(vec3(0.024, 0.060, 0.015), vec3(0.048, 0.042, 0.022), macroPatch * 0.45);
            vec3 farBladeTint = rootGround * (0.92 + (microNoise * 0.5 + macroPatch * 0.5) * 0.16);
            farBladeTint *= (0.96 + windWave * 0.07);
            diffuseColor.rgb = mix(diffuseColor.rgb, farBladeTint, grassSurfaceMask);

            // Exposed Craggy Granite & Slate Cliff Faces
            float rockSlopeMask = smoothstep(0.14, 0.30, vTerrainSlope);
            if (rockSlopeMask > 0.01) {
                float rockStrata = sin(vTerrainWorldPos.y * 1.9 + vTerrainWorldPos.x * 0.4 + microNoise * 2.0) * 0.5 + 0.5;
                vec3 graniteDark  = vec3(0.075, 0.082, 0.095);
                vec3 graniteLight = vec3(0.165, 0.175, 0.195);
                vec3 cliffCol = mix(graniteDark, graniteLight, rockStrata * 0.6 + gravelNoise * 0.4);
                diffuseColor.rgb = mix(diffuseColor.rgb, cliffCol, rockSlopeMask);
            }

            // High-Altitude Alpine Snowline & Glacier Drifts (above y ~ 15.5m on ledges and peaks)
            float snowElev = vTerrainWorldPos.y + (macroPatch - 0.5) * 3.5 + (microNoise - 0.5) * 1.2 - vTerrainSlope * 11.5;
            float snowMask = smoothstep(14.5, 19.5, snowElev) * (1.0 - roadMask * 0.85);
            if (snowMask > 0.005) {
                vec3 pureSnow = mix(vec3(0.58, 0.66, 0.78), vec3(0.78, 0.84, 0.92), microNoise * 0.5 + 0.5);
                diffuseColor.rgb = mix(diffuseColor.rgb, pureSnow, snowMask);
            }

            // Crushed Granite & Slate Mountain Pass Road
            if (roadMask > 0.02) {
                float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                vec3 slateRoad = mix(vec3(0.13, 0.135, 0.145), vec3(0.085, 0.090, 0.098), gravelNoise * 0.6);
                vec3 wetTrack  = vec3(0.042, 0.044, 0.050);
                diffuseColor.rgb = mix(diffuseColor.rgb, mix(slateRoad, wetTrack, rutMask * 0.85), smoothstep(0.02, 0.48, roadMask));
            }

            // Glacial Tarn Shoreline (pebbles & wet slate)
            float tarnShore = 1.0 - smoothstep(-2.55, -1.35, vTerrainWorldPos.y);
            if (tarnShore > 0.001) {
                vec3 pebbleShore = mix(vec3(0.14, 0.15, 0.16), vec3(0.06, 0.07, 0.08), gravelNoise);
                diffuseColor.rgb = mix(diffuseColor.rgb, pebbleShore, tarnShore);
            }
        } else if (uZoneType == 3) {
            // HIGHLAND ROLLING HILLS ZONE: Upland pasture, golden heather/bracken hilltops & limestone bluffs
            float hillCrestFactor = smoothstep(9.5, 17.5, vTerrainWorldPos.y + (macroPatch - 0.5) * 3.0);
            vec3 valleyGreen  = vec3(0.028, 0.068, 0.014);
            vec3 uplandHeather = vec3(0.068, 0.052, 0.015);
            vec3 rootGround = mix(valleyGreen, uplandHeather, hillCrestFactor * 0.78);
            vec3 farBladeTint = rootGround * (0.92 + (microNoise * 0.5 + macroPatch * 0.5) * 0.18);
            farBladeTint *= (0.96 + windWave * 0.08);
            diffuseColor.rgb = mix(diffuseColor.rgb, farBladeTint, grassSurfaceMask);

            // Exposed Limestone & Chalky Hill Bluffs on steep drumlin flanks
            if (vTerrainSlope > 0.17) {
                vec3 limestoneCol = mix(vec3(0.18, 0.165, 0.14), vec3(0.28, 0.26, 0.22), gravelNoise * 0.6 + microNoise * 0.4);
                diffuseColor.rgb = mix(diffuseColor.rgb, limestoneCol, smoothstep(0.17, 0.34, vTerrainSlope));
            }

            // Sunken Country Lane with cobble/gravel & muddy wheel ruts
            if (roadMask > 0.02) {
                float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                float centerCrown = exp(-pow(distFromCenter, 2.0) / 0.65);
                vec3 dryRoad = mix(vec3(0.155, 0.120, 0.078), vec3(0.105, 0.080, 0.052), gravelNoise * 0.55);
                dryRoad = mix(dryRoad, uplandHeather, centerCrown * 0.45);
                vec3 wetRut = vec3(0.045, 0.032, 0.020);
                diffuseColor.rgb = mix(diffuseColor.rgb, mix(dryRoad, wetRut, rutMask * 0.88), smoothstep(0.02, 0.48, roadMask));
            }
        } else {
            // ZONE 0 (DEFAULT): COASTAL MEADOW COUNTRYSIDE
            vec3 rootGround = vec3(0.028, 0.070, 0.014);
            vec3 farBladeTint = rootGround * (0.92 + (microNoise * 0.5 + macroPatch * 0.5) * 0.16);
            farBladeTint *= (0.96 + windWave * 0.08);

            diffuseColor.rgb = mix(diffuseColor.rgb, farBladeTint, grassSurfaceMask);

            // Country Dirt Road with compacted gravel, verge grass transition, and wet wheel ruts
            if (roadMask > 0.02) {
                float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                float centerCrown = exp(-pow(distFromCenter, 2.0) / 0.65);
                vec3 dryRoad = mix(vec3(0.165, 0.128, 0.085), vec3(0.110, 0.085, 0.056), gravelNoise * 0.55);
                dryRoad = mix(dryRoad, vec3(0.065, 0.110, 0.028), centerCrown * 0.42);
                vec3 wetRut = vec3(0.048, 0.035, 0.022);
                vec3 roadColor = mix(dryRoad, wetRut, rutMask * 0.88);
                diffuseColor.rgb = mix(diffuseColor.rgb, roadColor, smoothstep(0.02, 0.48, roadMask));
            }

            // Coastal Shoreline: Golden beach sand right along the water edge (-2.6m to -1.35m)
            float beachMask = 1.0 - smoothstep(-2.55, -1.35, vTerrainWorldPos.y);
            if (beachMask > 0.001) {
                float wetZone = 1.0 - smoothstep(-2.65, -2.05, vTerrainWorldPos.y);
                vec3 drySand = mix(vec3(0.28, 0.23, 0.15), vec3(0.21, 0.17, 0.11), microNoise * 0.25);
                vec3 wetSand = vec3(0.08, 0.09, 0.08);
                vec3 sandCol = mix(drySand, wetSand, wetZone * 0.90);
                diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, beachMask * (1.0 - roadMask * 0.8));
            }
        }

        // Building Ground Contact Ambient Occlusion
        float buildingAO = 1.0;
        for (int b = 0; b < 32; b++) {
            if (b >= uBuildingCount) break;
            float distB = length(vTerrainWorldPos.xz - uBuildings[b].xy);
            float rad = uBuildings[b].z;
            if (distB < rad + 1.8) {
                float ao = smoothstep(rad - 0.4, rad + 1.8, distB);
                buildingAO = min(buildingAO, mix(0.42, 1.0, ao));
            }
        }
        diffuseColor.rgb *= buildingAO;
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        float rRoad = getRoadFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        if (rRoad > 0.05) {
            float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
            float rut = exp(-pow(distFromCenter - 1.35, 2.0) / 0.35);
            roughnessFactor = mix(roughnessFactor, (uZoneType == 1) ? 0.78 : 0.42, rut * rRoad);
        }
        if (uZoneType == 2 && vTerrainWorldPos.y > 15.0) {
            float snowR = smoothstep(15.0, 20.0, vTerrainWorldPos.y - vTerrainSlope * 10.0);
            roughnessFactor = mix(roughnessFactor, 0.36, snowR * 0.8);
        }
        if (vTerrainWorldPos.y < -1.8) {
            float wetBeach = 1.0 - smoothstep(-2.6, -1.8, vTerrainWorldPos.y);
            roughnessFactor = mix(roughnessFactor, 0.25, wetBeach * 0.9);
        }
        `
    );
};

// ============================================================================
// Tree Material: Texture-Atlas Botanical Shader with AlphaTest & Bent Normals
// ============================================================================
let botanicalAtlas = null;
function getBotanicalAtlas() {
    if (!botanicalAtlas && typeof createBotanicalFoliageAtlas === 'function') {
        botanicalAtlas = createBotanicalFoliageAtlas();
    }
    return botanicalAtlas;
}

const treeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.76,
    metalness: 0.03,
    side: THREE.DoubleSide,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

let sharedTreeDepthMaterial = null;
function getTreeDepthMaterial() {
    if (!sharedTreeDepthMaterial) {
        sharedTreeDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: getBotanicalAtlas(),
            alphaTest: 0.36,
            side: THREE.DoubleSide
        });
    }
    return sharedTreeDepthMaterial;
}
treeMaterial.customDepthMaterial = getTreeDepthMaterial();

treeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uWindSpeed = terrainUniforms.uWindSpeed;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uFoliageMap = { value: getBotanicalAtlas() };

    shader.vertexShader = `
        uniform float uTime;
        uniform float uWindSpeed;
        varying vec3 vTreeWorldPos;
        varying vec3 vTreeWorldNormal;
        varying vec3 vBotanicalNormal;
        varying float vTreeHeight;
        varying float vCanopyOuter;
        varying float vTreeWindWave;
        varying vec2 vFoliageUv;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vFoliageUv = uv;
        vTreeHeight = max(0.0, position.y);
        vCanopyOuter = clamp(length(position.xz) / 3.2, 0.0, 1.0);

        vec4 baseWorld = modelMatrix * vec4(transformed, 1.0);
        float tW = uTime * uWindSpeed;

        // Synchronized rolling wind waves across trees & grass (matching coastal_countryside_3d_scene.html)
        float wave1 = sin(baseWorld.x * 0.14 + baseWorld.z * 0.12 + tW * 2.4);
        float wave2 = cos(baseWorld.x * 0.35 - baseWorld.z * 0.28 + tW * 3.6) * 0.45;
        float heightFactor = pow(clamp(vTreeHeight / 12.0, 0.0, 1.2), 1.35);
        float trunkSway = (wave1 + wave2 * 0.5) * 0.22 * heightFactor;
        transformed.x += trunkSway;
        transformed.z += trunkSway * 0.60;

        bool isFoliageVert = (uv.y > 0.5 || uv.x < 0.5);
        if (isFoliageVert) {
            float boughWave = (wave1 + wave2) * 0.15 * (0.30 + 0.70 * vCanopyOuter);
            float leafFlutter = sin(tW * 4.2 + position.x * 2.6 + position.y * 1.8 + position.z * 2.6) * 0.045 * (0.3 + 0.7 * vCanopyOuter);
            transformed.x += boughWave + leafFlutter;
            transformed.z += (boughWave + leafFlutter) * 0.65;
            transformed.y -= abs(boughWave) * 0.10;
        }

        vTreeWindWave = wave1 * 0.5 + 0.5;
        vTreeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;

        // True world-space & view-space outward canopy normals tilted by wind waves for light-angle illumination
        vec3 tiltedObjNorm = objectNormal;
        if (isFoliageVert) {
            tiltedObjNorm = normalize(objectNormal + vec3(-trunkSway * 0.55, 0.0, -trunkSway * 0.35));
        }
        vTreeWorldNormal = normalize((modelMatrix * vec4(tiltedObjNorm, 0.0)).xyz);
        vBotanicalNormal = normalize(normalMatrix * tiltedObjNorm);
        `
    );

    shader.fragmentShader = `
        uniform sampler2D uFoliageMap;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vTreeWorldPos;
        varying vec3 vTreeWorldNormal;
        varying vec3 vBotanicalNormal;
        varying float vTreeHeight;
        varying float vCanopyOuter;
        varying float vTreeWindWave;
        varying vec2 vFoliageUv;
    ` + shader.fragmentShader;

    // Prevent DoubleSide backface normal inversion on volumetric foliage cards while preserving 3D view-space lighting!
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `
        #include <normal_fragment_begin>
        if (vFoliageUv.y > 0.5 || vFoliageUv.x < 0.5) {
            normal = normalize(vBotanicalNormal);
        }
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        vec4 texelColor = texture2D(uFoliageMap, vFoliageUv);
        vec3 linearTexel = pow(max(texelColor.rgb, vec3(0.001)), vec3(2.2));
        bool isFoliage = (vFoliageUv.y > 0.5 || vFoliageUv.x < 0.5);
        if (isFoliage) {
            if (texelColor.a < 0.36) discard;
            vec3 viewDir = normalize(cameraPosition - vTreeWorldPos);
            vec3 sunDir = normalize(uSunDir);
            vec3 worldNorm = normalize(vTreeWorldNormal);

            // Light-angle-dependent sun & subsurface backlit illumination + rolling wind-wave flow sheen
            float sunDot = max(dot(worldNorm, sunDir), 0.0);
            float backLight = pow(max(dot(-viewDir, sunDir), 0.0), 2.2);
            float outerTip = 0.35 + 0.65 * vCanopyOuter;
            vec3 sss = uSunColor * (backLight * 0.34 + sunDot * 0.18) * linearTexel * outerTip;
            vec3 halfVec = normalize(sunDir + viewDir);
            float specSheen = pow(max(dot(worldNorm, halfVec), 0.0), 14.0) * sunDot * vCanopyOuter;
            diffuseColor.rgb = (linearTexel * diffuseColor.rgb + sss + uSunColor * specSheen * 0.08) * (0.90 + vTreeWindWave * 0.20 * vCanopyOuter);
        } else {
            diffuseColor.rgb = linearTexel * diffuseColor.rgb;
        }
        `
    );
};

// ============================================================================
// Village Material: PBR Albedo + Normal Map + Roughness Atlas
// ============================================================================
let villageAtlas = null;
function getVillageAtlas() {
    if (!villageAtlas && typeof createVillagePBRAtlas === 'function') {
        villageAtlas = createVillagePBRAtlas();
    }
    return villageAtlas;
}

const villageMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.04,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

const rockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x6b6861).convertSRGBToLinear(),
    roughness: 0.92,
    metalness: 0.04,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

const desertRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xb87644).convertSRGBToLinear(),
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.03,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

const mountainRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x6e7884).convertSRGBToLinear(),
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.06,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

const cactusMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});

// ============================================================================
// 5. BOTANICAL MODEL GENERATORS WITH UV MAPPING & SPHERICAL CANOPY NORMALS
// ============================================================================
function mergeBufferGeometries(geometries) {
    let totalVerts = 0, totalIndices = 0;
    geometries.forEach(g => {
        if (!g.index) {
            const count = g.attributes.position.count;
            const idx = new Uint32Array(count);
            for (let k = 0; k < count; k++) idx[k] = k;
            g.setIndex(new THREE.BufferAttribute(idx, 1));
        }
        totalVerts += g.attributes.position.count;
        totalIndices += g.index.count;
    });

    const mergedPos = new Float32Array(totalVerts * 3);
    const mergedNorm = new Float32Array(totalVerts * 3);
    const mergedCol = new Float32Array(totalVerts * 3);
    const mergedUv = new Float32Array(totalVerts * 2);
    const mergedIdx = new Uint32Array(totalIndices);

    let vOffset = 0, iOffset = 0;
    geometries.forEach(g => {
        if (!g.attributes.normal) g.computeVertexNormals();
        const pos = g.attributes.position.array;
        const norm = g.attributes.normal.array;
        let col;
        if (g.attributes.color) {
            col = g.attributes.color.array;
        } else {
            col = new Float32Array(g.attributes.position.count * 3);
            col.fill(1.0);
        }
        let uv;
        if (g.attributes.uv) {
            uv = g.attributes.uv.array;
        } else {
            uv = new Float32Array(g.attributes.position.count * 2);
            uv.fill(0.0);
        }

        mergedPos.set(pos, vOffset * 3);
        mergedNorm.set(norm, vOffset * 3);
        mergedCol.set(col, vOffset * 3);
        mergedUv.set(uv, vOffset * 2);

        const idx = g.index.array;
        for (let j = 0; j < idx.length; j++) {
            mergedIdx[iOffset + j] = idx[j] + vOffset;
        }
        iOffset += idx.length;
        vOffset += g.attributes.position.count;
    });

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
    out.setAttribute('color', new THREE.BufferAttribute(mergedCol, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
    out.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
    return out;
}

function setGeometryUVBox(geo, uMin, uMax, vMin, vMax) {
    const uvAttr = geo.attributes.uv;
    if (!uvAttr) return;
    const count = uvAttr.count;
    for (let i = 0; i < count; i++) {
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);
        uvAttr.setXY(i, uMin + u * (uMax - uMin), vMin + v * (vMax - vMin));
    }
}

// Helper: Creates an arched rectangular botanical foliage card
function createCurvedFoliageCard(width, length, arch, uMin, uMax, vMin, vMax) {
    const hw = width * 0.5;
    const rows = 3;
    const pos = [], uvs = [], idx = [];
    for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        const z = arch * t * t;
        const y = length * t;
        pos.push(-hw, y, z, hw, y, z);
        const v = vMin + (vMax - vMin) * t;
        uvs.push(uMin, v, uMax, v);
        if (r < rows) {
            const i = r * 2;
            idx.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

// Helper: Assigns spherical outward canopy normals & radial AO vertex colors to a foliage card
function applyCanopyVolumeShading(card, centerVec, baseTintR, baseTintG, baseTintB, minAO) {
    const pos = card.attributes.position;
    const norm = card.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
        v.set(pos.getX(k), pos.getY(k), pos.getZ(k));
        const outward = v.clone().sub(centerVec);
        const dist = outward.length();
        if (dist > 0.001) outward.divideScalar(dist);
        outward.y = Math.max(0.28, outward.y + 0.22);
        outward.normalize();
        norm.setXYZ(k, outward.x, outward.y, outward.z);

        // Interior depth AO: darker near trunk/center, brighter at sunlit outer tips
        const radialAO = Math.min(1.15, minAO + Math.min(1.0, dist / 3.2) * (1.08 - minAO));
        col[k * 3 + 0] = baseTintR * radialAO;
        col[k * 3 + 1] = baseTintG * radialAO;
        col[k * 3 + 2] = baseTintB * radialAO;
    }
    card.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// 5A. Detailed Multi-Bough Nordic Spruce Tree (Conifer Needle Atlas Q0 & Bark Q3)
function createDetailedSpruceGeometry() {
    const parts = [];
    const trunkHeight = 14.6;
    const trunk = new THREE.CylinderGeometry(0.07, 0.52, trunkHeight, 8, 5);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    trunk.translate(0, trunkHeight * 0.5, 0);

    const tCol = new Float32Array(trunk.attributes.position.count * 3);
    for (let i = 0; i < trunk.attributes.position.count; i++) {
        const y = trunk.attributes.position.getY(i);
        const ao = Math.min(0.85, Math.max(0.25, y / 4.5));
        tCol[i * 3 + 0] = 0.45 * ao;
        tCol[i * 3 + 1] = 0.36 * ao;
        tCol[i * 3 + 2] = 0.28 * ao;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    parts.push(trunk);

    // 14 Dense Overlapping Conical Tiers of Drooping Boughs (Q0: [0.02..0.48, 0.52..0.98])
    const tierConfigs = [
        { y: 1.5,  rad: 4.5, boughs: 9, droop: 0.34 },
        { y: 2.5,  rad: 4.2, boughs: 9, droop: 0.32 },
        { y: 3.5,  rad: 3.9, boughs: 8, droop: 0.29 },
        { y: 4.5,  rad: 3.6, boughs: 8, droop: 0.26 },
        { y: 5.5,  rad: 3.3, boughs: 8, droop: 0.24 },
        { y: 6.5,  rad: 3.0, boughs: 7, droop: 0.21 },
        { y: 7.5,  rad: 2.7, boughs: 7, droop: 0.18 },
        { y: 8.5,  rad: 2.4, boughs: 7, droop: 0.16 },
        { y: 9.5,  rad: 2.0, boughs: 6, droop: 0.14 },
        { y: 10.4, rad: 1.7, boughs: 6, droop: 0.11 },
        { y: 11.3, rad: 1.4, boughs: 5, droop: 0.09 },
        { y: 12.2, rad: 1.1, boughs: 5, droop: 0.06 },
        { y: 13.0, rad: 0.8, boughs: 4, droop: 0.04 },
        { y: 13.8, rad: 0.5, boughs: 4, droop: 0.00 }
    ];

    tierConfigs.forEach((cfg, t) => {
        const tierCenter = new THREE.Vector3(0, cfg.y - 0.5, 0);
        const heightShade = 0.52 + (cfg.y / trunkHeight) * 0.48;
        for (let b = 0; b < cfg.boughs; b++) {
            const angle = (b / cfg.boughs) * Math.PI * 2.0 + t * 0.68;
            const bLen = cfg.rad;
            const bWidth = cfg.rad * 0.78;

            // Main horizontal draping conifer bough
            const mainCard = createCurvedFoliageCard(bWidth, bLen, 0.38, 0.02, 0.48, 0.52, 0.98);
            mainCard.rotateX(Math.PI * 0.5 + cfg.droop);
            mainCard.rotateY(angle);
            mainCard.translate(
                Math.cos(angle) * 0.12,
                cfg.y,
                Math.sin(angle) * 0.12
            );
            applyCanopyVolumeShading(mainCard, tierCenter, 0.62 * heightShade, 0.78 * heightShade, 0.52 * heightShade, 0.36);
            parts.push(mainCard);

            // Secondary angled upper-fill bough to hide inter-tier gaps
            if (b % 2 === 0) {
                const fillCard = createCurvedFoliageCard(bWidth * 0.85, bLen * 0.88, 0.28, 0.02, 0.48, 0.52, 0.98);
                fillCard.rotateZ(0.38);
                fillCard.rotateX(Math.PI * 0.42 + cfg.droop * 0.7);
                fillCard.rotateY(angle + 0.25);
                fillCard.translate(
                    Math.cos(angle + 0.25) * 0.15,
                    cfg.y + 0.32,
                    Math.sin(angle + 0.25) * 0.15
                );
                applyCanopyVolumeShading(fillCard, tierCenter, 0.56 * heightShade, 0.72 * heightShade, 0.48 * heightShade, 0.32);
                parts.push(fillCard);
            }
        }
    });

    return mergeBufferGeometries(parts);
}

// 5B. Detailed Maritime / Scots Pine Geometry (Lush Horizontal Umbrella Canopy Clouds)
function createDetailedPineGeometry() {
    const parts = [];
    const trunkHeight = 11.4;
    const trunk = new THREE.CylinderGeometry(0.14, 0.48, trunkHeight, 8, 7);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const ny = (tPos.getY(i) + trunkHeight * 0.5) / trunkHeight;
        tPos.setX(i, tPos.getX(i) + Math.sin(ny * 2.6) * 0.45);
        tPos.setZ(i, tPos.getZ(i) + Math.cos(ny * 2.1) * 0.22 - 0.22);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkHeight * 0.5, 0);

    const tCol = new Float32Array(trunk.attributes.position.count * 3);
    for (let i = 0; i < trunk.attributes.position.count; i++) {
        const y = trunk.attributes.position.getY(i);
        const ny = Math.max(0, Math.min(1, y / trunkHeight));
        const ao = Math.min(1.0, Math.max(0.35, y / 2.5)) * (1.0 - smoothstep(0.68, 0.98, ny) * 0.45);
        // Warm cinnamon-amber Scots pine upper bark, dark fissured lower bark
        tCol[i * 3 + 0] = (0.42 + ny * 0.34) * ao;
        tCol[i * 3 + 1] = (0.28 + ny * 0.16) * ao;
        tCol[i * 3 + 2] = (0.20 + ny * 0.06) * ao;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    parts.push(trunk);

    // 10 Overlapping Umbrella Canopy Pads forming a full coastal Scots Pine crown
    const umbrellaPads = [
        { x:  0.35, y: 11.5, z:  0.00, rad: 2.6, boughs: 7 }, // Top central crown dome
        { x:  0.20, y: 12.1, z:  0.10, rad: 2.0, boughs: 6 }, // Apex dome
        { x:  1.65, y: 10.6, z:  0.55, rad: 2.5, boughs: 7 },
        { x: -1.35, y: 10.4, z:  0.95, rad: 2.5, boughs: 7 },
        { x:  0.15, y: 10.2, z: -1.65, rad: 2.4, boughs: 6 },
        { x:  2.25, y:  9.3, z: -0.75, rad: 2.6, boughs: 7 },
        { x: -1.85, y:  9.1, z: -1.10, rad: 2.5, boughs: 7 },
        { x:  0.85, y:  8.9, z:  1.95, rad: 2.5, boughs: 6 },
        { x: -1.95, y:  8.0, z:  0.85, rad: 2.3, boughs: 6 },
        { x:  1.75, y:  7.8, z:  0.40, rad: 2.2, boughs: 6 }
    ];

    umbrellaPads.forEach((pad, pIdx) => {
        const padCenter = new THREE.Vector3(pad.x, pad.y - 0.35, pad.z);
        const topX = Math.sin(0.75 * 2.6) * 0.45;
        const dx = pad.x - topX;
        const dz = pad.z;
        const distXZ = Math.hypot(dx, dz);

        // Short tucked woody bough connecting trunk to the interior of the needle cloud
        if (distXZ > 0.6) {
            const limbLen = distXZ * 0.82;
            const limb = new THREE.CylinderGeometry(0.06, 0.13, limbLen, 6);
            setGeometryUVBox(limb, 0.52, 0.98, 0.02, 0.48);
            const limbAng = Math.atan2(dz, dx);
            limb.rotateZ(-Math.PI * 0.34);
            limb.rotateY(-limbAng);
            limb.translate(topX + dx * 0.42, pad.y - 0.55, dz * 0.42);
            const lCol = new Float32Array(limb.attributes.position.count * 3);
            for (let k = 0; k < limb.attributes.position.count; k++) {
                lCol[k * 3 + 0] = 0.42;
                lCol[k * 3 + 1] = 0.28;
                lCol[k * 3 + 2] = 0.19;
            }
            limb.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
            parts.push(limb);
        }

        const heightShade = 0.62 + ((pad.y - 7.0) / 5.5) * 0.38;
        // Lower/main horizontal radiating whorl of conifer boughs
        for (let b = 0; b < pad.boughs; b++) {
            const ang = (b / pad.boughs) * Math.PI * 2.0 + pIdx * 0.55;
            const card = createCurvedFoliageCard(pad.rad * 0.85, pad.rad, 0.32, 0.02, 0.48, 0.52, 0.98);
            card.rotateX(Math.PI * 0.5 + 0.16);
            card.rotateY(ang);
            card.translate(pad.x, pad.y, pad.z);
            applyCanopyVolumeShading(card, padCenter, 0.64 * heightShade, 0.80 * heightShade, 0.50 * heightShade, 0.38);
            parts.push(card);
        }
        // Upper domed cap whorl of conifer boughs so each pad is a lush 3D cloud
        const capCount = Math.max(4, pad.boughs - 2);
        for (let b = 0; b < capCount; b++) {
            const ang = (b / capCount) * Math.PI * 2.0 + pIdx * 0.9 + 0.4;
            const capCard = createCurvedFoliageCard(pad.rad * 0.78, pad.rad * 0.82, 0.28, 0.02, 0.48, 0.52, 0.98);
            capCard.rotateZ(0.25);
            capCard.rotateX(Math.PI * 0.38);
            capCard.rotateY(ang);
            capCard.translate(pad.x, pad.y + 0.38, pad.z);
            applyCanopyVolumeShading(capCard, padCenter, 0.70 * heightShade, 0.86 * heightShade, 0.54 * heightShade, 0.45);
            parts.push(capCard);
        }
    });

    return mergeBufferGeometries(parts);
}

// 5C. Detailed European Oak / Beech Broadleaf Tree (Multi-Domed Volumetric Canopy)
function createDetailedDeciduousGeometry() {
    const parts = [];
    const trunkHeight = 5.4;
    const trunk = new THREE.CylinderGeometry(0.24, 0.58, trunkHeight, 8, 5);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    trunk.translate(0, trunkHeight * 0.5, 0);

    const tCol = new Float32Array(trunk.attributes.position.count * 3);
    for (let i = 0; i < trunk.attributes.position.count; i++) {
        const y = trunk.attributes.position.getY(i);
        const ao = Math.min(0.88, Math.max(0.32, y / 2.6)) * (1.0 - smoothstep(3.8, 5.4, y) * 0.45);
        tCol[i * 3 + 0] = 0.48 * ao;
        tCol[i * 3 + 1] = 0.42 * ao;
        tCol[i * 3 + 2] = 0.35 * ao;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    parts.push(trunk);

    // Primary forked boughs rising into the lower canopy
    const mainForks = [
        { ang: 0.4,  tilt: 0.48, len: 2.6 },
        { ang: 2.5,  tilt: 0.52, len: 2.5 },
        { ang: 4.6,  tilt: 0.45, len: 2.7 }
    ];
    mainForks.forEach(fk => {
        const bough = new THREE.CylinderGeometry(0.10, 0.22, fk.len, 6);
        setGeometryUVBox(bough, 0.52, 0.98, 0.02, 0.48);
        bough.translate(0, fk.len * 0.5, 0);
        bough.rotateZ(fk.tilt);
        bough.rotateY(fk.ang);
        bough.translate(0, 4.2, 0);
        const bCol = new Float32Array(bough.attributes.position.count * 3);
        for (let k = 0; k < bough.attributes.position.count; k++) {
            bCol[k * 3 + 0] = 0.32;
            bCol[k * 3 + 1] = 0.28;
            bCol[k * 3 + 2] = 0.22;
        }
        bough.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
        parts.push(bough);
    });

    // 16 Overlapping Canopy Sub-Domes (Core shadow volume + Mid spreading boughs + Upper sunlit crown)
    const canopyClusters = [
        // Deep interior core clusters (prevent hollow center, darker AO)
        [ 0.0,  6.2,  0.0, 2.7, 0.55],
        [ 0.0,  7.6,  0.0, 2.6, 0.68],
        // Lower-mid spreading bough domes
        [-2.1,  5.8,  1.1, 2.3, 0.76],
        [ 2.2,  6.0, -0.9, 2.3, 0.78],
        [ 1.1,  5.9,  2.1, 2.2, 0.76],
        [-1.3,  5.7, -2.0, 2.3, 0.74],
        [-2.7,  6.3, -0.3, 2.1, 0.78],
        [ 2.6,  6.4,  0.9, 2.2, 0.80],
        [ 0.3,  6.1, -2.6, 2.1, 0.76],
        [-0.4,  6.0,  2.6, 2.1, 0.78],
        // Upper-mid fullness domes
        [ 1.5,  7.8,  1.2, 2.3, 0.88],
        [-1.5,  7.7, -1.1, 2.3, 0.86],
        [-1.3,  7.9,  1.4, 2.2, 0.88],
        [ 1.4,  7.8, -1.3, 2.2, 0.86],
        // Top sunlit crown domes
        [ 0.4,  9.1,  0.3, 2.3, 0.96],
        [-0.5,  8.9, -0.4, 2.2, 0.94]
    ];

    const crownCenter = new THREE.Vector3(0, 6.6, 0);
    const cardOrientations = [
        { rx:  0.18, ry: 0.00, rz:  0.12 },
        { rx: -0.22, ry: 1.05, rz: -0.15 },
        { rx:  0.25, ry: 2.10, rz:  0.18 },
        { rx:  0.95, ry: 0.52, rz:  0.00 },
        { rx:  0.88, ry: 2.09, rz:  0.20 }
    ];

    canopyClusters.forEach(([cx, cy, cz, rad, brightness], cIdx) => {
        cardOrientations.forEach((ori, oIdx) => {
            const w = rad * 1.45;
            const h = rad * 1.38;
            const card = createCurvedFoliageCard(w, h, 0.28, 0.52, 0.98, 0.52, 0.98);
            // Center card before rotating so all 5 cards intersect around their geometric center!
            card.translate(0, -h * 0.48, 0);
            card.rotateZ(ori.rz);
            card.rotateX(ori.rx);
            card.rotateY(ori.ry + cIdx * 0.45);
            card.translate(cx, cy, cz);

            applyCanopyVolumeShading(
                card,
                crownCenter,
                0.68 * brightness,
                0.82 * brightness,
                0.52 * brightness,
                0.35 * brightness
            );
            parts.push(card);
        });
    });

    return mergeBufferGeometries(parts);
}

// 5D. Detailed Flowering Meadow Bush / Hawthorn Shrub (Botanical Atlas Q2)
function createDetailedBushGeometry() {
    const parts = [];
    const bushCenter = new THREE.Vector3(0, 0.35, 0);
    const lobes = [
        [ 0.0,  0.85,  0.0, 1.45, 0.78],
        [-0.85, 0.68,  0.48, 1.25, 0.85],
        [ 0.90, 0.72, -0.38, 1.25, 0.86],
        [ 0.32, 0.65,  0.85, 1.20, 0.84],
        [-0.42, 0.66, -0.82, 1.20, 0.82],
        [ 0.0,  1.25,  0.10, 1.25, 0.94]
    ];
    const bushOrientations = [
        { rx:  0.20, ry: 0.00, rz:  0.10 },
        { rx: -0.22, ry: 1.05, rz: -0.12 },
        { rx:  0.24, ry: 2.10, rz:  0.14 },
        { rx:  0.88, ry: 0.78, rz:  0.00 }
    ];
    lobes.forEach(([bx, by, bz, br, shade], lIdx) => {
        bushOrientations.forEach(ori => {
            const w = br * 1.35;
            const h = br * 1.25;
            const card = createCurvedFoliageCard(w, h, 0.22, 0.02, 0.48, 0.02, 0.48);
            card.translate(0, -h * 0.48, 0);
            card.rotateZ(ori.rz);
            card.rotateX(ori.rx);
            card.rotateY(ori.ry + lIdx * 0.5);
            card.translate(bx, by, bz);

            applyCanopyVolumeShading(card, bushCenter, 0.68 * shade, 0.82 * shade, 0.54 * shade, 0.38);
            parts.push(card);
        });
    });
    return mergeBufferGeometries(parts);
}

// 5E. Massive Limestone Boulder & Defensive Outcrop Geometry (Sized for Tank Hull-Down & Full Cover)
function createLimestoneRockGeometry() {
    const parts = [];
    const boulders = [
        // Main central defensive crag (3.8m tall, 6.2m wide, 5.0m deep)
        { x: 0,     y: 1.85, z: 0,     sx: 3.2, sy: 1.95, sz: 2.6, rot: 0.2 },
        // Left flanking shoulder boulder
        { x: -2.4,  y: 1.45, z: 0.4,   sx: 2.2, sy: 1.55, sz: 2.0, rot: 1.1 },
        // Right buttress boulder
        { x: 2.2,   y: 1.35, z: -0.5,  sx: 2.1, sy: 1.45, sz: 1.9, rot: 2.3 },
        // Top cap stone & craggy parapet
        { x: 0.4,   y: 2.65, z: -0.3,  sx: 1.9, sy: 1.35, sz: 1.7, rot: 0.7 }
    ];

    boulders.forEach(b => {
        const geo = new THREE.DodecahedronGeometry(1.0, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const layerJitter = Math.sin(vy * 4.0) * 0.10 + (hash2D(vx * 3.2, vz * 3.2) - 0.5) * 0.20;
            const s = 0.92 + layerJitter;
            p.setXYZ(i, vx * s * b.sx, vy * s * b.sy, vz * s * b.sz);
        }
        geo.computeVertexNormals();
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);

        const col = new Float32Array(p.count * 3);
        for (let k = 0; k < p.count; k++) {
            const vy = p.getY(k);
            const shade = 0.50 + 0.26 * Math.min(1.0, Math.max(0.0, vy / 3.8));
            col[k * 3 + 0] = 0.64 * shade;
            col[k * 3 + 1] = 0.62 * shade;
            col[k * 3 + 2] = 0.58 * shade;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(geo);
    });

    return mergeBufferGeometries(parts);
}

// ============================================================================
// 5F. European Timber-Framed Cottage Geometry (Mapped to 1024x1024 Village Atlas)
// Q0: Facade & Windows [0..0.5, 0.5..1.0]
// Q1: Terracotta Tiles [0.5..1.0, 0.5..1.0]
// Q2: Fieldstone Masonry [0..0.5, 0..0.5]
// Q3: Timber Planks [0.5..1.0, 0..0.5]
// ============================================================================
function createPitchedRoofGeometry(w, l, hRoof) {
    const hw = w * 0.5;
    const hl = l * 0.5;
    const positions = [];
    const normals = [];
    const uvs = [];

    // Left slope
    const nl = new THREE.Vector3(-hRoof, hw, 0).normalize();
    positions.push(
        -hw, 0, hl,   0, hRoof, hl,   -hw, 0, -hl,
        -hw, 0, -hl,  0, hRoof, hl,   0, hRoof, -hl
    );
    for (let i = 0; i < 6; i++) {
        normals.push(nl.x, nl.y, nl.z);
    }
    uvs.push(
        0, 0,  1, 0,  0, 1,
        0, 1,  1, 0,  1, 1
    );

    // Right slope
    const nr = new THREE.Vector3(hRoof, hw, 0).normalize();
    positions.push(
        0, hRoof, hl,   hw, 0, hl,   0, hRoof, -hl,
        0, hRoof, -hl,  hw, 0, hl,   hw, 0, -hl
    );
    for (let i = 0; i < 6; i++) {
        normals.push(nr.x, nr.y, nr.z);
    }
    uvs.push(
        0, 0,  1, 0,  0, 1,
        0, 1,  1, 0,  1, 1
    );

    // Front gable (+Z)
    positions.push(
        -hw, 0, hl,   hw, 0, hl,   0, hRoof, hl
    );
    normals.push(0, 0, 1,  0, 0, 1,  0, 0, 1);
    uvs.push(0, 0,  1, 0,  0.5, 1);

    // Back gable (-Z)
    positions.push(
        hw, 0, -hl,   -hw, 0, -hl,   0, hRoof, -hl
    );
    normals.push(0, 0, -1,  0, 0, -1,  0, 0, -1);
    uvs.push(0, 0,  1, 0,  0.5, 1);

    // Bottom face (-Y)
    positions.push(
        -hw, 0, -hl,   hw, 0, -hl,   -hw, 0, hl,
        -hw, 0, hl,    hw, 0, -hl,   hw, 0, hl
    );
    for (let i = 0; i < 6; i++) {
        normals.push(0, -1, 0);
    }
    uvs.push(
        0, 0,  1, 0,  0, 1,
        0, 1,  1, 0,  1, 1
    );

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geom;
}

function createEuropeanCottageGeometry() {
    const parts = [];
    const w = 4.8, h = 3.4, l = 6.6;

    // 1. Dressed Fieldstone Foundation Plinth extending deep into hillside slopes (Q2: [0..0.5, 0..0.5])
    const found = new THREE.BoxGeometry(w + 0.35, 2.2, l + 0.35);
    setGeometryUVBox(found, 0.02, 0.48, 0.02, 0.48);
    found.translate(0, -0.1, 0);
    parts.push(found);

    // 2. Main 2-Story Plaster/Timber Facade Body (Q0: [0..0.5, 0.5..1.0])
    const walls = new THREE.BoxGeometry(w, h, l);
    setGeometryUVBox(walls, 0.02, 0.48, 0.52, 0.98);
    walls.translate(0, 1.0 + h * 0.5, 0);
    parts.push(walls);

    // 3. Overhanging Pitched Terracotta Roof with Exposed Eaves (Q1: [0.5..1.0, 0.5..1.0])
    const roof = createPitchedRoofGeometry(w + 1.2, l + 1.3, 2.85);
    setGeometryUVBox(roof, 0.52, 0.98, 0.52, 0.98);
    roof.translate(0, 1.0 + h, 0);
    parts.push(roof);

    // Eave fascia rafter beam (Q3: Timber)
    const fasciaL = new THREE.BoxGeometry(0.18, 0.22, l + 1.35);
    setGeometryUVBox(fasciaL, 0.52, 0.98, 0.02, 0.48);
    fasciaL.translate(-(w + 1.2) * 0.5, 1.0 + h - 0.05, 0);
    parts.push(fasciaL);

    const fasciaR = new THREE.BoxGeometry(0.18, 0.22, l + 1.35);
    setGeometryUVBox(fasciaR, 0.52, 0.98, 0.02, 0.48);
    fasciaR.translate((w + 1.2) * 0.5, 1.0 + h - 0.05, 0);
    parts.push(fasciaR);

    // 4. Corbeled Fieldstone Chimney Stack & Pots (Q2)
    const chim = new THREE.BoxGeometry(0.85, 3.2, 0.85);
    setGeometryUVBox(chim, 0.02, 0.48, 0.02, 0.48);
    chim.translate(w * 0.24, 1.0 + h + 1.6, -l * 0.25);
    parts.push(chim);

    for (let cp = -1; cp <= 1; cp += 2) {
        const pot = new THREE.CylinderGeometry(0.12, 0.15, 0.65, 8);
        setGeometryUVBox(pot, 0.52, 0.98, 0.52, 0.98); // Terracotta
        pot.translate(w * 0.24 + cp * 0.2, 1.0 + h + 3.4, -l * 0.25);
        parts.push(pot);
    }

    // 5. Front Timber Entrance Porch Canopy (Q3 Posts, Q1 Tiled Roof)
    const porchRoof = createPitchedRoofGeometry(2.1, 1.8, 0.9);
    setGeometryUVBox(porchRoof, 0.52, 0.98, 0.52, 0.98);
    porchRoof.translate(0, 3.2, l * 0.5 + 0.8);
    parts.push(porchRoof);

    [-0.85, 0.85].forEach(px => {
        const post = new THREE.BoxGeometry(0.14, 2.2, 0.14);
        setGeometryUVBox(post, 0.52, 0.98, 0.02, 0.48);
        post.translate(px, 2.0, l * 0.5 + 1.55);
        parts.push(post);
    });

    // 6. Attached Timber Barn / Tool Shed Wing with Stone Plinth (Q2 Plinth, Q3 Timber Walls, Q1 Roof)
    const shedPlinth = new THREE.BoxGeometry(2.5, 1.8, 3.9);
    setGeometryUVBox(shedPlinth, 0.02, 0.48, 0.02, 0.48);
    shedPlinth.translate(w * 0.5 + 1.2, -0.1, 0.3);
    parts.push(shedPlinth);

    const shed = new THREE.BoxGeometry(2.4, 1.8, 3.8);
    setGeometryUVBox(shed, 0.52, 0.98, 0.02, 0.48);
    shed.translate(w * 0.5 + 1.2, 1.5, 0.3);
    parts.push(shed);

    const shedRoof = createPitchedRoofGeometry(2.8, 4.2, 1.4);
    setGeometryUVBox(shedRoof, 0.52, 0.98, 0.52, 0.98);
    shedRoof.translate(w * 0.5 + 1.2, 2.4, 0.3);
    parts.push(shedRoof);

    return mergeBufferGeometries(parts);
}

// 5G. Smoldering Ruined House (Mapped to Village Atlas Q2 Masonry & Q3 Charred Timber with Soot AO)
function createRuinedHouseGeometry() {
    const parts = [];
    const w = 5.0, h = 3.0, l = 6.4;

    function tintRuinPart(geo, r, g, b) {
        const c = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < geo.attributes.position.count; i++) {
            const vy = geo.attributes.position.getY(i);
            const soot = 0.42 + 0.38 * Math.min(1.0, Math.max(0.0, (2.2 - vy) / 2.2));
            c[i * 3 + 0] = r * soot;
            c[i * 3 + 1] = g * soot;
            c[i * 3 + 2] = b * soot;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return geo;
    }

    const baseShell = new THREE.BoxGeometry(w, h * 0.62, l);
    setGeometryUVBox(baseShell, 0.02, 0.48, 0.02, 0.48);
    baseShell.translate(0, h * 0.31, 0);
    parts.push(tintRuinPart(baseShell, 0.72, 0.68, 0.64));

    const gableWall = new THREE.BoxGeometry(w * 0.88, h * 1.15, 0.48);
    setGeometryUVBox(gableWall, 0.02, 0.48, 0.02, 0.48);
    gableWall.translate(0, h * 0.58, -l * 0.45);
    parts.push(tintRuinPart(gableWall, 0.65, 0.60, 0.56));

    const chimney = new THREE.BoxGeometry(0.85, 4.4, 0.85);
    setGeometryUVBox(chimney, 0.02, 0.48, 0.02, 0.48);
    chimney.translate(-w * 0.25, 2.2, -l * 0.35);
    parts.push(tintRuinPart(chimney, 0.58, 0.54, 0.50));

    // Charred dark fallen timber rafters
    for (let r = -2; r <= 2; r++) {
        const rafter = new THREE.BoxGeometry(0.18, 3.1, 0.18);
        setGeometryUVBox(rafter, 0.52, 0.98, 0.02, 0.48);
        rafter.rotateZ(0.72 + (r * 0.04));
        rafter.translate(-1.0, h * 0.78, r * 1.15);
        parts.push(tintRuinPart(rafter, 0.25, 0.20, 0.16));
    }

    return mergeBufferGeometries(parts);
}

var sharedSpruceGeo = null;
var sharedPineGeo = null;
var sharedDecidGeo = null;
var sharedBushGeo = null;
var sharedRockGeo = null;
var sharedCottageGeo = null;
var sharedRuinGeo = null;
var sharedBarnGeo = null;
var sharedStoneWallGeo = null;
var sharedPalmGeo = null;
var sharedCactusGeo = null;
var sharedSandstoneRockGeo = null;
var sharedKasbahGeo = null;
var sharedDesertRuinGeo = null;
var sharedMountainRockGeo = null;
var sharedMountainBunkerGeo = null;

// 5H. European Farm Barn (Mapped to Village Atlas Q2 Foundation, Q3 Timber Siding, Q1 Roof, Q0 Doors)
function createBarnGeometry() {
    const parts = [];
    const w = 6.4, h = 4.2, l = 10.2;

    // Fieldstone Foundation Plinth (Q2: Masonry)
    const found = new THREE.BoxGeometry(w + 0.35, 1.8, l + 0.35);
    setGeometryUVBox(found, 0.02, 0.48, 0.02, 0.48);
    found.translate(0, -0.1, 0);
    parts.push(found);

    // Main Dark Timber Barn Walls (Q3: Timber Planks)
    const walls = new THREE.BoxGeometry(w, h, l);
    setGeometryUVBox(walls, 0.52, 0.98, 0.02, 0.48);
    walls.translate(0, 0.8 + h * 0.5, 0);
    parts.push(walls);

    // Front Double Wagon Barn Doors (+Z) (Q0)
    const doorF = new THREE.BoxGeometry(2.8, 3.4, 0.15);
    setGeometryUVBox(doorF, 0.02, 0.48, 0.52, 0.98);
    doorF.translate(0, 2.5, l * 0.5 + 0.05);
    parts.push(doorF);

    // Back Hayloft Doors (-Z) (Q0)
    const doorB = new THREE.BoxGeometry(2.2, 2.6, 0.15);
    setGeometryUVBox(doorB, 0.02, 0.48, 0.52, 0.98);
    doorB.translate(0, 2.1, -l * 0.5 - 0.05);
    parts.push(doorB);

    // High Terracotta Gambrel Barn Roof (Q1: Terracotta Tiles)
    const roof = createPitchedRoofGeometry(w + 1.2, l + 1.3, 3.5);
    setGeometryUVBox(roof, 0.52, 0.98, 0.52, 0.98);
    roof.translate(0, 0.8 + h, 0);
    parts.push(roof);

    // Overhanging Hayloft Crane Timber Awning (Q3)
    const loftAwning = new THREE.BoxGeometry(1.6, 0.22, 1.4);
    setGeometryUVBox(loftAwning, 0.52, 0.98, 0.02, 0.48);
    loftAwning.translate(0, 0.8 + h + 1.6, l * 0.5 + 0.8);
    parts.push(loftAwning);

    return mergeBufferGeometries(parts);
}

// 5I. European Fieldstone Perimeter Boundary Wall (Tactical Low Hull-Down Cover)
function createStoneWallGeometry() {
    const parts = [];
    // Dry-stack stone masonry wall body (Q2: Masonry)
    const wall = new THREE.BoxGeometry(0.7, 1.35, 6.2);
    setGeometryUVBox(wall, 0.02, 0.48, 0.02, 0.48);
    wall.translate(0, 0.6, 0);
    parts.push(wall);

    // Chiseled capstone coping slab (Q2: Masonry)
    const cap = new THREE.BoxGeometry(0.88, 0.20, 6.3);
    setGeometryUVBox(cap, 0.02, 0.48, 0.02, 0.48);
    cap.translate(0, 1.35, 0);
    parts.push(cap);

    return mergeBufferGeometries(parts);
}

// 5J. Desert Oasis Date Palm Tree (Curved Ringed Trunk + Arching Frond Crown)
function createDatePalmGeometry() {
    const parts = [];
    const trunkHeight = 11.8;
    const trunk = new THREE.CylinderGeometry(0.16, 0.42, trunkHeight, 8, 9);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const ny = (tPos.getY(i) + trunkHeight * 0.5) / trunkHeight;
        const ring = 1.0 + Math.sin(ny * 36.0) * 0.07;
        const curveX = Math.sin(ny * Math.PI * 0.82) * 1.15;
        const curveZ = (1.0 - Math.cos(ny * Math.PI * 0.65)) * 0.55;
        tPos.setX(i, tPos.getX(i) * ring + curveX);
        tPos.setZ(i, tPos.getZ(i) * ring + curveZ);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkHeight * 0.5, 0);

    const tCol = new Float32Array(tPos.count * 3);
    for (let i = 0; i < tPos.count; i++) {
        const y = tPos.getY(i);
        const ny = Math.max(0, Math.min(1, y / trunkHeight));
        const ringShade = 0.82 + 0.18 * Math.sin(ny * 36.0);
        const ao = Math.min(1.0, Math.max(0.38, y / 2.2)) * ringShade;
        tCol[i * 3 + 0] = 0.54 * ao;
        tCol[i * 3 + 1] = 0.40 * ao;
        tCol[i * 3 + 2] = 0.26 * ao;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    parts.push(trunk);

    const crownX = Math.sin(Math.PI * 0.82) * 1.15;
    const crownZ = (1.0 - Math.cos(Math.PI * 0.65)) * 0.55;
    const crownY = trunkHeight - 0.15;
    const crownCenter = new THREE.Vector3(crownX, crownY - 0.6, crownZ);

    // Date clusters beneath crown
    for (let d = 0; d < 4; d++) {
        const dAng = (d / 4) * Math.PI * 2.0 + 0.4;
        const cluster = new THREE.DodecahedronGeometry(0.32, 0);
        setGeometryUVBox(cluster, 0.52, 0.98, 0.02, 0.48);
        cluster.translate(crownX + Math.cos(dAng) * 0.36, crownY - 0.35, crownZ + Math.sin(dAng) * 0.36);
        const dCol = new Float32Array(cluster.attributes.position.count * 3);
        for (let k = 0; k < cluster.attributes.position.count; k++) {
            dCol[k * 3 + 0] = 0.68;
            dCol[k * 3 + 1] = 0.42;
            dCol[k * 3 + 2] = 0.14;
        }
        cluster.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
        parts.push(cluster);
    }

    // 14 Arching Date Palm Fronds in 2 Whorls (using Q0 Conifer/Frond Atlas)
    const frondLayers = [
        { count: 8, tilt: 0.58, arch: 1.45, len: 4.5, width: 1.95, yOff: -0.05, shade: 0.86 },
        { count: 6, tilt: 0.32, arch: 1.15, len: 3.9, width: 1.75, yOff:  0.22, shade: 1.00 }
    ];
    frondLayers.forEach((layer, lIdx) => {
        for (let f = 0; f < layer.count; f++) {
            const ang = (f / layer.count) * Math.PI * 2.0 + lIdx * 0.42;
            const frond = createCurvedFoliageCard(layer.width, layer.len, layer.arch, 0.02, 0.48, 0.52, 0.98);
            frond.rotateX(Math.PI * 0.5 - layer.tilt);
            frond.rotateY(ang);
            frond.translate(crownX, crownY + layer.yOff, crownZ);
            applyCanopyVolumeShading(
                frond,
                crownCenter,
                0.68 * layer.shade,
                0.82 * layer.shade,
                0.42 * layer.shade,
                0.45
            );
            parts.push(frond);
        }
    });

    return mergeBufferGeometries(parts);
}

// 5K. Desert Saguaro & Prickly Pear Cactus Geometry (Solid Ribbed Columnar Mesh)
function createDesertCactusGeometry() {
    const parts = [];
    function tintCactusPart(geo, baseY, maxH) {
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const ang = Math.atan2(vz, vx);
            const rib = 0.88 + 0.12 * Math.sin(ang * 10.0);
            const hao = Math.min(1.08, Math.max(0.45, (vy + baseY) / maxH + 0.35)) * rib;
            col[i * 3 + 0] = 0.16 * hao;
            col[i * 3 + 1] = 0.36 * hao;
            col[i * 3 + 2] = 0.12 * hao;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return geo;
    }

    // Main ribbed Saguaro stem
    const mainH = 4.8;
    const stem = new THREE.CylinderGeometry(0.28, 0.34, mainH, 10, 4);
    stem.translate(0, mainH * 0.5, 0);
    parts.push(tintCactusPart(stem, 0, mainH));

    const cap = new THREE.SphereGeometry(0.28, 10, 6);
    cap.translate(0, mainH, 0);
    parts.push(tintCactusPart(cap, 0, mainH));

    // Left upturned arm
    const armLHoriz = new THREE.CylinderGeometry(0.19, 0.21, 0.95, 8);
    armLHoriz.rotateZ(Math.PI * 0.5);
    armLHoriz.translate(-0.55, 2.35, 0);
    parts.push(tintCactusPart(armLHoriz, 0, mainH));

    const armLElbow = new THREE.SphereGeometry(0.20, 8, 6);
    armLElbow.translate(-0.98, 2.38, 0);
    parts.push(tintCactusPart(armLElbow, 0, mainH));

    const armLVert = new THREE.CylinderGeometry(0.18, 0.20, 1.75, 8);
    armLVert.translate(-0.98, 3.25, 0);
    parts.push(tintCactusPart(armLVert, 0, mainH));

    const armLCap = new THREE.SphereGeometry(0.18, 8, 6);
    armLCap.translate(-0.98, 4.12, 0);
    parts.push(tintCactusPart(armLCap, 0, mainH));

    // Right upturned arm
    const armRHoriz = new THREE.CylinderGeometry(0.18, 0.20, 0.85, 8);
    armRHoriz.rotateZ(-Math.PI * 0.5);
    armRHoriz.translate(0.50, 2.85, 0.12);
    parts.push(tintCactusPart(armRHoriz, 0, mainH));

    const armRElbow = new THREE.SphereGeometry(0.19, 8, 6);
    armRElbow.translate(0.90, 2.88, 0.12);
    parts.push(tintCactusPart(armRElbow, 0, mainH));

    const armRVert = new THREE.CylinderGeometry(0.16, 0.19, 1.45, 8);
    armRVert.translate(0.90, 3.60, 0.12);
    parts.push(tintCactusPart(armRVert, 0, mainH));

    const armRCap = new THREE.SphereGeometry(0.16, 8, 6);
    armRCap.translate(0.90, 4.32, 0.12);
    parts.push(tintCactusPart(armRCap, 0, mainH));

    // Base barrel cactus cluster
    const barrel = new THREE.SphereGeometry(0.42, 8, 6);
    barrel.scale(1.0, 1.25, 1.0);
    barrel.translate(0.55, 0.42, -0.48);
    parts.push(tintCactusPart(barrel, 0.5, mainH));

    return mergeBufferGeometries(parts);
}

// 5L. Desert Stratified Sandstone Rock & Eroded Hoodoo Outcrop
function createSandstoneRockGeometry() {
    const parts = [];
    const slabs = [
        { x: 0,     y: 1.95, z: 0,     sx: 3.5, sy: 2.10, sz: 2.8, rot: 0.15 },
        { x: -2.5,  y: 1.35, z: 0.5,   sx: 2.4, sy: 1.45, sz: 2.1, rot: 0.85 },
        { x: 2.3,   y: 1.50, z: -0.4,  sx: 2.3, sy: 1.60, sz: 2.0, rot: 1.95 },
        { x: 0.2,   y: 3.35, z: -0.2,  sx: 2.6, sy: 0.95, sz: 2.1, rot: 0.45 } // Flat-topped mesa cap
    ];

    slabs.forEach(b => {
        const geo = new THREE.DodecahedronGeometry(1.0, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            // Horizontal wind-carved sandstone strata ledges
            const strata = Math.sin(vy * 7.5) * 0.16 + (hash2D(vx * 2.8, vz * 2.8) - 0.5) * 0.14;
            const flatTop = vy > 0.55 ? 0.55 + (vy - 0.55) * 0.35 : vy;
            p.setXYZ(i, vx * (0.95 + strata) * b.sx, flatTop * b.sy, vz * (0.95 + strata) * b.sz);
        }
        geo.computeVertexNormals();
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);

        const col = new Float32Array(p.count * 3);
        for (let k = 0; k < p.count; k++) {
            const vy = p.getY(k);
            const band = 0.85 + 0.15 * Math.sin(vy * 5.2);
            const shade = (0.58 + 0.32 * Math.min(1.0, Math.max(0.0, vy / 4.2))) * band;
            col[k * 3 + 0] = 0.92 * shade;
            col[k * 3 + 1] = 0.68 * shade;
            col[k * 3 + 2] = 0.46 * shade;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(geo);
    });

    return mergeBufferGeometries(parts);
}

// 5M. North African Desert Adobe / Mud-Brick Kasbah House (Flat Roof, Parapet & Corner Watchtower)
function createDesertKasbahGeometry() {
    const parts = [];
    const w = 5.4, h = 3.8, l = 6.4;

    function tintAdobe(geo, r, g, b) {
        const pos = geo.attributes.position;
        const c = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vy = pos.getY(i);
            const sunBake = 0.72 + 0.28 * Math.min(1.0, Math.max(0.0, vy / 5.5));
            c[i * 3 + 0] = r * sunBake;
            c[i * 3 + 1] = g * sunBake;
            c[i * 3 + 2] = b * sunBake;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return geo;
    }

    // 1. Sandstone Plinth (Q2 Masonry)
    const found = new THREE.BoxGeometry(w + 0.4, 2.0, l + 0.4);
    setGeometryUVBox(found, 0.02, 0.48, 0.02, 0.48);
    found.translate(0, -0.1, 0);
    parts.push(tintAdobe(found, 0.92, 0.74, 0.52));

    // 2. Main Sun-Baked Mud-Brick Plaster Body (Q0 Facade)
    const walls = new THREE.BoxGeometry(w, h, l);
    setGeometryUVBox(walls, 0.02, 0.48, 0.52, 0.98);
    walls.translate(0, 0.9 + h * 0.5, 0);
    parts.push(tintAdobe(walls, 1.02, 0.84, 0.62));

    // 3. Flat Roof Parapet Rim & Stepped Corner Merlons (Q2 Masonry)
    const roofY = 0.9 + h;
    const paraF = new THREE.BoxGeometry(w + 0.25, 0.55, 0.35);
    setGeometryUVBox(paraF, 0.02, 0.48, 0.02, 0.48);
    paraF.translate(0, roofY + 0.25, l * 0.5);
    parts.push(tintAdobe(paraF, 0.96, 0.78, 0.56));

    const paraB = new THREE.BoxGeometry(w + 0.25, 0.55, 0.35);
    setGeometryUVBox(paraB, 0.02, 0.48, 0.02, 0.48);
    paraB.translate(0, roofY + 0.25, -l * 0.5);
    parts.push(tintAdobe(paraB, 0.96, 0.78, 0.56));

    const paraL = new THREE.BoxGeometry(0.35, 0.55, l + 0.25);
    setGeometryUVBox(paraL, 0.02, 0.48, 0.02, 0.48);
    paraL.translate(-w * 0.5, roofY + 0.25, 0);
    parts.push(tintAdobe(paraL, 0.96, 0.78, 0.56));

    const paraR = new THREE.BoxGeometry(0.35, 0.55, l + 0.25);
    setGeometryUVBox(paraR, 0.02, 0.48, 0.02, 0.48);
    paraR.translate(w * 0.5, roofY + 0.25, 0);
    parts.push(tintAdobe(paraR, 0.96, 0.78, 0.56));

    // 4. Elevated Kasbah Watchtower Turret on Corner
    const turret = new THREE.BoxGeometry(2.4, 2.2, 2.4);
    setGeometryUVBox(turret, 0.02, 0.48, 0.52, 0.98);
    turret.translate(-w * 0.28, roofY + 1.1, -l * 0.28);
    parts.push(tintAdobe(turret, 1.00, 0.82, 0.60));

    // Turret Crenellations
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
        const merlon = new THREE.BoxGeometry(0.65, 0.55, 0.65);
        setGeometryUVBox(merlon, 0.02, 0.48, 0.02, 0.48);
        merlon.translate(-w * 0.28 + cx * 0.85, roofY + 2.45, -l * 0.28 + cz * 0.85);
        parts.push(tintAdobe(merlon, 0.98, 0.80, 0.58));
    });

    // 5. Projecting Cedar Roof Beams (Vigas) & Shaded Courtyard Arcade Porch (Q3 Timber)
    for (let v = -2; v <= 2; v++) {
        const viga = new THREE.BoxGeometry(w + 0.7, 0.16, 0.16);
        setGeometryUVBox(viga, 0.52, 0.98, 0.02, 0.48);
        viga.translate(0, roofY - 0.25, v * 1.25);
        parts.push(tintAdobe(viga, 0.55, 0.40, 0.26));
    }

    const awning = new THREE.BoxGeometry(2.8, 0.22, 1.6);
    setGeometryUVBox(awning, 0.52, 0.98, 0.02, 0.48);
    awning.translate(0, 3.1, l * 0.5 + 0.75);
    parts.push(tintAdobe(awning, 0.62, 0.45, 0.30));

    [-1.15, 1.15].forEach(px => {
        const pillar = new THREE.BoxGeometry(0.32, 2.3, 0.32);
        setGeometryUVBox(pillar, 0.02, 0.48, 0.02, 0.48);
        pillar.translate(px, 1.9, l * 0.5 + 1.35);
        parts.push(tintAdobe(pillar, 0.94, 0.76, 0.54));
    });

    return mergeBufferGeometries(parts);
}

// 5N. Desert Ruined Sandstone / Mud-Brick Compound
function createDesertRuinGeometry() {
    const parts = [];
    const w = 5.2, h = 3.1, l = 6.2;

    function tintSandRuin(geo, r, g, b) {
        const c = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < geo.attributes.position.count; i++) {
            const vy = geo.attributes.position.getY(i);
            const shade = 0.55 + 0.38 * Math.min(1.0, Math.max(0.0, vy / 3.5));
            c[i * 3 + 0] = r * shade;
            c[i * 3 + 1] = g * shade;
            c[i * 3 + 2] = b * shade;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return geo;
    }

    const baseShell = new THREE.BoxGeometry(w, h * 0.65, l);
    setGeometryUVBox(baseShell, 0.02, 0.48, 0.02, 0.48);
    baseShell.translate(0, h * 0.32, 0);
    parts.push(tintSandRuin(baseShell, 0.92, 0.72, 0.48));

    const brokenTower = new THREE.BoxGeometry(2.3, h * 1.25, 2.3);
    setGeometryUVBox(brokenTower, 0.02, 0.48, 0.02, 0.48);
    brokenTower.translate(-w * 0.26, h * 0.62, -l * 0.26);
    parts.push(tintSandRuin(brokenTower, 0.88, 0.68, 0.45));

    const archWall = new THREE.BoxGeometry(w * 0.85, h * 0.95, 0.48);
    setGeometryUVBox(archWall, 0.02, 0.48, 0.02, 0.48);
    archWall.translate(0.2, h * 0.48, l * 0.44);
    parts.push(tintSandRuin(archWall, 0.85, 0.65, 0.42));

    return mergeBufferGeometries(parts);
}

// 5O. Alpine Jagged Granite Peak Crag & Snow-Dusted Boulder
function createMountainPeakCragGeometry() {
    const parts = [];
    const spires = [
        { x: 0,     y: 2.35, z: 0,     sx: 2.8, sy: 2.85, sz: 2.4, rot: 0.3 },
        { x: -2.1,  y: 1.65, z: 0.4,   sx: 2.1, sy: 1.95, sz: 1.8, rot: 1.2 },
        { x: 1.9,   y: 1.55, z: -0.5,  sx: 2.0, sy: 1.85, sz: 1.7, rot: 2.4 },
        { x: 0.3,   y: 3.45, z: -0.2,  sx: 1.6, sy: 2.10, sz: 1.5, rot: 0.8 }
    ];

    spires.forEach(b => {
        const geo = new THREE.DodecahedronGeometry(1.0, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const sharp = 1.0 - Math.max(0.0, vy) * 0.28;
            const crag = 0.88 + (hash2D(vx * 4.1, vz * 4.1) - 0.5) * 0.26;
            p.setXYZ(i, vx * sharp * crag * b.sx, vy * crag * b.sy, vz * sharp * crag * b.sz);
        }
        geo.computeVertexNormals();
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);

        const col = new Float32Array(p.count * 3);
        const nAttr = geo.attributes.normal;
        for (let k = 0; k < p.count; k++) {
            const vy = p.getY(k);
            const ny = nAttr.getY(k);
            const snowFrost = (vy > 3.2 && ny > 0.35) ? Math.min(1.0, (vy - 3.2) * 0.55) : 0.0;
            const shade = 0.48 + 0.32 * Math.min(1.0, Math.max(0.0, vy / 4.8));
            col[k * 3 + 0] = THREE.MathUtils.lerp(0.56 * shade, 0.92, snowFrost);
            col[k * 3 + 1] = THREE.MathUtils.lerp(0.60 * shade, 0.95, snowFrost);
            col[k * 3 + 2] = THREE.MathUtils.lerp(0.66 * shade, 1.00, snowFrost);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(geo);
    });

    return mergeBufferGeometries(parts);
}

// 5P. Alpine Stone & Concrete Mountain Pass Bunker / Chalet Outpost
function createMountainBunkerGeometry() {
    const parts = [];
    const w = 5.6, h = 2.8, l = 5.6;

    function tintGranite(geo, r, g, b) {
        const c = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < geo.attributes.position.count; i++) {
            const vy = geo.attributes.position.getY(i);
            const shade = 0.62 + 0.34 * Math.min(1.0, Math.max(0.0, vy / 4.0));
            c[i * 3 + 0] = r * shade;
            c[i * 3 + 1] = g * shade;
            c[i * 3 + 2] = b * shade;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return geo;
    }

    // Sloped reinforced granite & concrete casemate base (Q2 Masonry)
    const base = new THREE.BoxGeometry(w + 0.5, 2.2, l + 0.5);
    setGeometryUVBox(base, 0.02, 0.48, 0.02, 0.48);
    base.translate(0, -0.1, 0);
    parts.push(tintGranite(base, 0.65, 0.68, 0.72));

    const body = new THREE.BoxGeometry(w, h, l);
    setGeometryUVBox(body, 0.02, 0.48, 0.02, 0.48);
    body.translate(0, 0.9 + h * 0.5, 0);
    parts.push(tintGranite(body, 0.72, 0.75, 0.78));

    // Heavy overhanging snow-laden alpine slate roof (Q3 / Q2)
    const roof = createPitchedRoofGeometry(w + 1.5, l + 1.5, 2.1);
    setGeometryUVBox(roof, 0.02, 0.48, 0.02, 0.48);
    roof.translate(0, 0.9 + h, 0);
    parts.push(tintGranite(roof, 0.85, 0.88, 0.94));

    // Observation cupola turret on top
    const cupola = new THREE.CylinderGeometry(1.15, 1.30, 1.25, 8);
    setGeometryUVBox(cupola, 0.02, 0.48, 0.02, 0.48);
    cupola.translate(0, 0.9 + h + 1.35, 0);
    parts.push(tintGranite(cupola, 0.60, 0.64, 0.68));

    return mergeBufferGeometries(parts);
}


function ensureSharedGeometries() {
    if (!sharedSpruceGeo) sharedSpruceGeo = createDetailedSpruceGeometry();
    if (!sharedPineGeo) sharedPineGeo = createDetailedPineGeometry();
    if (!sharedDecidGeo) sharedDecidGeo = createDetailedDeciduousGeometry();
    if (!sharedBushGeo) sharedBushGeo = createDetailedBushGeometry();
    if (!sharedRockGeo) sharedRockGeo = createLimestoneRockGeometry();
    if (!sharedCottageGeo) sharedCottageGeo = createEuropeanCottageGeometry();
    if (!sharedRuinGeo) sharedRuinGeo = createRuinedHouseGeometry();
    if (!sharedBarnGeo) sharedBarnGeo = createBarnGeometry();
    if (!sharedStoneWallGeo) sharedStoneWallGeo = createStoneWallGeometry();
    if (!sharedPalmGeo) sharedPalmGeo = createDatePalmGeometry();
    if (!sharedCactusGeo) sharedCactusGeo = createDesertCactusGeometry();
    if (!sharedSandstoneRockGeo) sharedSandstoneRockGeo = createSandstoneRockGeometry();
    if (!sharedKasbahGeo) sharedKasbahGeo = createDesertKasbahGeometry();
    if (!sharedDesertRuinGeo) sharedDesertRuinGeo = createDesertRuinGeometry();
    if (!sharedMountainRockGeo) sharedMountainRockGeo = createMountainPeakCragGeometry();
    if (!sharedMountainBunkerGeo) sharedMountainBunkerGeo = createMountainBunkerGeometry();

    window.sharedSpruceGeo = sharedSpruceGeo;
    window.sharedPineGeo = sharedPineGeo;
    window.sharedDecidGeo = sharedDecidGeo;
    window.sharedBushGeo = sharedBushGeo;
    window.sharedRockGeo = sharedRockGeo;
    window.sharedCottageGeo = sharedCottageGeo;
    window.sharedRuinGeo = sharedRuinGeo;
    window.sharedPalmGeo = sharedPalmGeo;
    window.sharedCactusGeo = sharedCactusGeo;
    window.sharedSandstoneRockGeo = sharedSandstoneRockGeo;
    window.sharedKasbahGeo = sharedKasbahGeo;
    window.sharedDesertRuinGeo = sharedDesertRuinGeo;
    window.sharedMountainRockGeo = sharedMountainRockGeo;
    window.sharedMountainBunkerGeo = sharedMountainBunkerGeo;
}

// ============================================================================
// 6. VOLUMETRIC SMOKE PUFF & FIRE CANVAS TEXTURES
// ============================================================================
function createSmokeCanvasTexture() {
    const c = document.createElement('canvas');
    const size = 256;
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Organic procedural noisy smoke puff with billowing lobes & wispy perimeter
    const half = size / 2;
    for (let y = 0; y < size; y++) {
        const ny = (y - half) / (half * 0.92);
        for (let x = 0; x < size; x++) {
            const nx = (x - half) / (half * 0.92);
            const dist = Math.hypot(nx, ny);
            if (dist >= 1.0) continue;

            const angle = Math.atan2(ny, nx);
            const lobes = (
                Math.sin(angle * 5.0) * 0.09 +
                Math.cos(angle * 8.0 + 1.2) * 0.06 +
                Math.sin(angle * 13.0 - 0.7) * 0.03
            );
            const rDist = dist / (0.88 + lobes);
            if (rDist >= 1.0) continue;

            const n1 = Math.sin(nx * 8.0 + ny * 6.0) * Math.cos(ny * 9.0 - nx * 4.0) * 0.5 + 0.5;
            const n2 = Math.sin(nx * 18.0 - ny * 14.0) * Math.cos(nx * 12.0 + ny * 16.0) * 0.5 + 0.5;
            const turb = n1 * 0.65 + n2 * 0.35;

            const edgeFade = 1.0 - Math.pow(rDist, 1.8);
            const density = edgeFade * (0.65 + turb * 0.65);
            const alpha = Math.min(1.0, Math.max(0.0, density)) * 0.72;

            const soot = Math.floor(45 + turb * 25);
            const idx = (y * size + x) * 4;
            data[idx]     = soot;
            data[idx + 1] = soot + 2;
            data[idx + 2] = soot + 5;
            data[idx + 3] = Math.floor(alpha * 255);
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}

function createFireCanvasTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 72, 2, 64, 68, 54);
    grad.addColorStop(0.0, 'rgba(255, 185, 75, 0.72)');
    grad.addColorStop(0.32, 'rgba(235, 95, 20, 0.45)');
    grad.addColorStop(0.68, 'rgba(140, 30, 8, 0.15)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

var sharedSmokeTex = null;
var sharedFireTex = null;

// ============================================================================
// 7. HIGH-PERFORMANCE TEXTURE-ATLAS GRASS & WILDFLOWER SYSTEM
// 4-Column Botanical Tuft Atlas + Early-Out Frustum/Radius Vertex Culling
// Cuts grass instances from 1.4M to 56K (96% triangle reduction!)
// ============================================================================
let grassTuftAtlas = null;
function getGrassTuftAtlas() {
    if (!grassTuftAtlas && typeof createGrassTuftAtlasTexture === 'function') {
        grassTuftAtlas = createGrassTuftAtlasTexture();
    }
    return grassTuftAtlas;
}

let grassTuftEdgeAtlas = null;
function getGrassTuftEdgeAtlas() {
    if (!grassTuftEdgeAtlas && typeof window.getGrassTuftEdgeTexture === 'function') {
        grassTuftEdgeAtlas = window.getGrassTuftEdgeTexture();
    }
    return grassTuftEdgeAtlas;
}

const grassUniforms = {
    uTime: { value: 0 },
    uWindSpeed: { value: 1.2 },
    uCameraPos: { value: new THREE.Vector3() },
    uCameraForwardXZ: { value: new THREE.Vector2(0, 1) },
    uSeedOffset: terrainUniforms.uSeedOffset,
    uRoadBaseX: terrainUniforms.uRoadBaseX,
    uRoad2BaseZ: terrainUniforms.uRoad2BaseZ,
    uRoad3BaseX: terrainUniforms.uRoad3BaseX,
    uRoad4BaseX: terrainUniforms.uRoad4BaseX,
    uZoneType: terrainUniforms.uZoneType,
    uBuildings: terrainUniforms.uBuildings,
    uBuildingCount: terrainUniforms.uBuildingCount,
    uSunDir: terrainUniforms.uSunDir,
    uSunColor: terrainUniforms.uSunColor,
    uSkyColor: terrainUniforms.uSkyColor
};

// 3 Crossed Botanical Tuft Geometry with Upward Normals (Zero plane-intersection shading seams!)
function createCrossedTuftGeometry() {
    const planes = [
        { ang: 0.0,  tilt: 0.08 },
        { ang: 1.05, tilt: -0.08 },
        { ang: 2.10, tilt: 0.08 }
    ];
    // Optimized wider, lush WW2 meadow grass geometry
    const w = 1.85;
    const h = 1.18;
    const hw = w * 0.5;

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    planes.forEach((p, idx) => {
        const ca = Math.cos(p.ang);
        const sa = Math.sin(p.ang);
        const b = idx * 4;

        positions.push(
            -hw * ca, -0.04, -hw * sa,
             hw * ca, -0.04,  hw * sa,
            -hw * 0.92 * ca + sa * p.tilt, h, -hw * 0.92 * sa - ca * p.tilt,
             hw * 0.92 * ca + sa * p.tilt, h,  hw * 0.92 * sa - ca * p.tilt
        );

        // Point all vertex normals straight UP so crossed planes shade identically to the meadow ground!
        normals.push(
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0
        );

        uvs.push(
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0
        );

        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    return geo;
}

// Single camera-facing billboard quad for distant grass (2 triangles per instance)
function createBillboardTuftGeometry() {
    // Optimized wider distant billboard grass geometry
    const w = 2.45;
    const h = 1.30;
    const hw = w * 0.5;

    const positions = [
        -hw, -0.04, 0.0,
         hw, -0.04, 0.0,
        -hw,  h,    0.0,
         hw,  h,    0.0
    ];
    const normals = [
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0
    ];
    const uvs = [
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        1.0, 1.0
    ];
    const indices = [0, 1, 2, 1, 3, 2];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    return geo;
}

function createTexturedToroidalGrass(baseGeo, count, patchSize, minRadius, maxRadius, isBillboard) {
    // CRITICAL: Clone baseGeo so each LOD ring owns its own aInstanceData buffer!
    const geo = baseGeo.clone();
    const gridSide = Math.ceil(Math.sqrt(count));
    const cellSize = patchSize / gridSide;
    const offsets = new Float32Array(count * 4);
    let idx = 0;

    for (let gx = 0; gx < gridSide && idx < count; gx++) {
        for (let gz = 0; gz < gridSide && idx < count; gz++) {
            const jx = (gx + 0.10 + Math.random() * 0.80) * cellSize - patchSize * 0.5;
            const jz = (gz + 0.10 + Math.random() * 0.80) * cellSize - patchSize * 0.5;
            offsets[idx * 4 + 0] = jx;
            offsets[idx * 4 + 1] = jz;
            offsets[idx * 4 + 2] = Math.random() * Math.PI * 2.0;
            offsets[idx * 4 + 3] = Math.random();
            idx++;
        }
    }
    while (idx < count) {
        offsets[idx * 4 + 0] = (Math.random() - 0.5) * patchSize;
        offsets[idx * 4 + 1] = (Math.random() - 0.5) * patchSize;
        offsets[idx * 4 + 2] = Math.random() * Math.PI * 2.0;
        offsets[idx * 4 + 3] = Math.random();
        idx++;
    }

    geo.setAttribute('aInstanceData', new THREE.InstancedBufferAttribute(offsets, 4));

    const mat = new THREE.MeshStandardMaterial({
        roughness: 0.86,
        metalness: 0.0,
        side: THREE.DoubleSide,
        envMapIntensity: GROUND_ENV_MAP_INTENSITY
    });

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = grassUniforms.uTime;
        shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
        shader.uniforms.uCameraPos = grassUniforms.uCameraPos;
        shader.uniforms.uCameraForwardXZ = grassUniforms.uCameraForwardXZ;
        shader.uniforms.uSeedOffset = grassUniforms.uSeedOffset;
        shader.uniforms.uRoadBaseX = grassUniforms.uRoadBaseX;
        shader.uniforms.uRoad2BaseZ = grassUniforms.uRoad2BaseZ;
        shader.uniforms.uRoad3BaseX = grassUniforms.uRoad3BaseX;
        shader.uniforms.uRoad4BaseX = grassUniforms.uRoad4BaseX;
        shader.uniforms.uZoneType = grassUniforms.uZoneType;
        shader.uniforms.uBuildings = grassUniforms.uBuildings;
        shader.uniforms.uBuildingCount = grassUniforms.uBuildingCount;
        shader.uniforms.uSunDir = grassUniforms.uSunDir;
        shader.uniforms.uSunColor = grassUniforms.uSunColor;
        shader.uniforms.uSkyColor = grassUniforms.uSkyColor;
        shader.uniforms.uPatchSize = { value: patchSize };
        shader.uniforms.uMinRadius = { value: minRadius };
        shader.uniforms.uMaxRadius = { value: maxRadius };
        shader.uniforms.uGrassAtlas = { value: getGrassTuftAtlas() };
        shader.uniforms.uGrassEdgeAtlas = { value: getGrassTuftEdgeAtlas() };

        shader.vertexShader = `
            attribute vec4 aInstanceData;
            uniform float uTime;
            uniform float uWindSpeed;
            uniform vec3 uCameraPos;
            uniform vec2 uCameraForwardXZ;
            uniform vec4 uBuildings[32];
            uniform int uBuildingCount;
            uniform float uPatchSize;
            uniform float uMinRadius;
            uniform float uMaxRadius;
            varying vec2 vGrassAtlasUv;
            varying vec3 vGrassWorldPos;
            varying float vGrassHeightFrac;
            varying vec3 vTerrainNormalUp;
            ${SHARED_TERRAIN_GLSL}
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            `
            vec3 objectNormal = vec3(0.0, 1.0, 0.0);
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float halfPatch = uPatchSize * 0.5;
            vec2 relXZ = mod(aInstanceData.xy - uCameraPos.xz + halfPatch, uPatchSize) - halfPatch;
            vec2 worldXZ = uCameraPos.xz + relXZ;
            float distFromCam = length(relXZ);

            // 1. Discrete radius check: NO height squashing / shrinking transition
            if (distFromCam < uMinRadius || distFromCam >= uMaxRadius) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            // Camera Frustum Culling
            if (distFromCam > 12.0) {
                float viewDot = dot(normalize(relXZ), uCameraForwardXZ);
                if (viewDot < -0.34) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
            }

            // 2. Terrain height & road/beach/building culling
            float roadMask = getRoadFactor_gpu(worldXZ.x, worldXZ.y);
            float roadCull = 1.0 - smoothstep(0.06, 0.36, roadMask);
            if (roadCull <= 0.01) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            vec3 surfNorm;
            float groundY = getTerrainSurfaceHeight_gpu(worldXZ.x, worldXZ.y, surfNorm);
            vTerrainNormalUp = normalize(normalMatrix * surfNorm);

            float waterCull = smoothstep(-1.4, 0.5, groundY) * (1.0 - smoothstep(0.22, 0.38, 1.0 - surfNorm.y));
            float spawnCull = smoothstep(2.8, 5.5, length(worldXZ));

            float tuftRandom = fract(sin(dot(aInstanceData.xy, vec2(12.9898, 78.233))) * 43758.5453);

            // Zone-specific grass & scrub culling
            float zoneCull = 1.0;
            if (uZoneType == 1) {
                // Desert zone: dense around oasis shoreline, sparse desert scrub tufts on dry sand dunes
                if (groundY > -0.4 && tuftRandom > 0.14) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                zoneCull = (groundY > -0.4) ? 0.72 : 1.0;
            } else if (uZoneType == 2) {
                // Mountain zone: cull grass above snowline (15.5m) and on steep granite cliffs
                float snowCull = 1.0 - smoothstep(12.5, 16.0, groundY);
                float rockSlopeCull = 1.0 - smoothstep(0.16, 0.25, 1.0 - surfNorm.y);
                zoneCull = snowCull * rockSlopeCull;
                if (zoneCull <= 0.01) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
            }

            float bldgCull = 1.0;
            for (int b = 0; b < 32; b++) {
                if (b >= uBuildingCount) break;
                float dB = length(worldXZ - uBuildings[b].xy);
                if (dB < uBuildings[b].z + 0.8) {
                    bldgCull = min(bldgCull, smoothstep(uBuildings[b].z - 0.2, uBuildings[b].z + 0.8, dB));
                }
            }

            if (waterCull <= 0.01 || spawnCull <= 0.01 || bldgCull <= 0.01) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            float sizeVar = 0.92 + 0.38 * tuftRandom;
            vec2 meadowPos = worldXZ + uSeedOffset;

            // Original wildflower meadow look (baseline ~4.5% rising to ~16% in lush patches)
            float flowerPatch = valueNoise2D_gpu(meadowPos * 0.015) * 0.5 + 0.5;
            float origFlowerChance = mix(0.045, 0.16, smoothstep(0.35, 0.70, flowerPatch));

            // Regional variation: preserve the original flower-rich look across most of the world,
            // with natural variations including areas with only very few flowers
            float regionVar = valueNoise2D_gpu(meadowPos * 0.008 + vec2(71.0, 93.0)) * 0.5 + 0.5;
            float areaFlowerMod = smoothstep(0.28, 0.52, regionVar);

            float flowerChance = mix(0.005, origFlowerChance, areaFlowerMod);
            if (uZoneType == 1) flowerChance = 0.0; // No wildflowers in desert scrub
            float flowerColor = valueNoise2D_gpu(meadowPos * 0.035 + vec2(31.0, 17.0));
            float plumeThreshold = mix(0.90, 0.50, areaFlowerMod);

            float colIdx = aInstanceData.w < flowerChance
                ? (flowerColor < 0.0 ? 2.0 : 3.0)
                : (aInstanceData.w < plumeThreshold ? 0.0 : 1.0);
            float heightPatch = valueNoise2D_gpu(meadowPos * 0.035 + vec2(13.0, 47.0)) * 0.5 + 0.5;
            float heightVar = (0.68 + 0.62 * tuftRandom) * (0.78 + 0.44 * heightPatch) * zoneCull;
            vGrassAtlasUv = vec2(
                (colIdx + clamp(uv.x, 0.02, 0.98)) * 0.25,
                clamp(uv.y, 0.02, 0.98)
            );
            vGrassHeightFrac = uv.y;

            float windT = uTime * uWindSpeed;
            // Rolling wind waves shared with terrain & trees
            float wave1 = sin(worldXZ.x * 0.14 + worldXZ.y * 0.12 + windT * 2.4);
            float wave2 = cos(worldXZ.x * 0.35 - worldXZ.y * 0.28 + windT * 3.6) * 0.45;
            float windWave = (wave1 + wave2) * pow(max(uv.y, 0.0), 1.65) * 0.38;

            vec3 localP = transformed;
            localP.xz *= (0.85 + 0.30 * sizeVar);
            localP.y *= (heightVar * roadCull * waterCull * spawnCull * bldgCull);

            vec3 rotP;
` + (isBillboard ? `
            // Billboard cylindrical rotation: always faces camera horizontally on XZ plane
            vec2 toCam = normalize(-relXZ);
            vec2 tangent = vec2(-toCam.y, toCam.x);
            rotP = vec3(
                tangent.x * localP.x,
                localP.y,
                tangent.y * localP.x
            );
` : `
            // 3D crossed tuft rotation
            float ang = aInstanceData.z;
            float ca = cos(ang), sa = sin(ang);
            rotP = vec3(
                localP.x * ca - localP.z * sa,
                localP.y,
                localP.x * sa + localP.z * ca
            );
`) + `

            rotP.x += windWave;
            rotP.z += windWave * 0.65;
            rotP.y -= abs(windWave) * 0.18;

            transformed = rotP + vec3(worldXZ.x, groundY, worldXZ.y);
            vGrassWorldPos = transformed;
            `
        );

        shader.fragmentShader = `
            uniform sampler2D uGrassAtlas;
            uniform sampler2D uGrassEdgeAtlas;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uSkyColor;
            uniform int uZoneType;
            varying vec2 vGrassAtlasUv;
            varying vec3 vGrassWorldPos;
            varying float vGrassHeightFrac;
            varying vec3 vTerrainNormalUp;
        ` + shader.fragmentShader;

        // Keep grass normal aligned with terrain surface normal on both front and back faces!
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_begin>',
            `
            #include <normal_fragment_begin>
            normal = normalize(vTerrainNormalUp);
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            vec4 texelColor = texture2D(uGrassAtlas, vGrassAtlasUv);
            if (texelColor.a < 0.36) discard;

            // Convert grass atlas from sRGB to linear space
            vec3 bladeLinear = pow(max(texelColor.rgb, vec3(0.001)), vec3(2.2));

            // Seamlessly blend bottom root of grass tuft into the zone's linear ground color
            vec3 groundRootCol = vec3(0.028, 0.070, 0.014);
            if (uZoneType == 1) {
                float oasisF = 1.0 - smoothstep(-2.0, -0.3, vGrassWorldPos.y);
                groundRootCol = mix(vec3(0.42, 0.27, 0.12), vec3(0.055, 0.115, 0.028), oasisF);
                // Sun-bleached golden-tan desert scrub tint on dunes
                vec3 scrubBlade = mix(vec3(0.36, 0.26, 0.11), bladeLinear, 0.32);
                bladeLinear = mix(scrubBlade, bladeLinear, oasisF);
            } else if (uZoneType == 2) {
                groundRootCol = vec3(0.024, 0.060, 0.015);
            } else if (uZoneType == 3) {
                float heatherH = smoothstep(9.5, 17.5, vGrassWorldPos.y);
                groundRootCol = mix(vec3(0.028, 0.068, 0.014), vec3(0.068, 0.052, 0.015), heatherH * 0.78);
            }
            float rootBlend = smoothstep(0.02, 0.36, vGrassHeightFrac);
            bladeLinear = mix(groundRootCol, bladeLinear, rootBlend);

            // Subsurface scattering from sunlight strictly on blade edges & tips with natural variety
            vec3 viewDir = normalize(cameraPosition - vGrassWorldPos);
            vec3 sunDir = normalize(uSunDir);
            float backLight = pow(max(dot(-viewDir, sunDir), 0.0), 2.8);

            // Razor-thin silhouette contour rim + fine edge atlas mask (interior body stays strictly dark)
            float edgeMask = texture2D(uGrassEdgeAtlas, vGrassAtlasUv).r;
            float alphaRim = smoothstep(0.38, 0.48, texelColor.a) * (1.0 - smoothstep(0.56, 0.80, texelColor.a));
            float bladeInterior = smoothstep(0.80, 0.96, texelColor.a);
            float edgeFactor = clamp((edgeMask * 1.6 + alphaRim * 1.2) * (1.0 - bladeInterior * 0.92), 0.0, 1.0);

            // Backlight strictly on blade edges and tips (bottom 45% of tuft has zero backlight)
            float tipLight = smoothstep(0.70, 0.98, vGrassHeightFrac);
            float heightWeight = smoothstep(0.45, 0.92, vGrassHeightFrac);
            float edgeAndTip = clamp(edgeFactor * heightWeight + tipLight * 0.65, 0.0, 1.0);

            // Multi-scale natural variety across meadow tufts so glints sparkle organically without dullness
            float macroWave = sin(vGrassWorldPos.x * 0.08 + vGrassWorldPos.z * 0.07) * cos(vGrassWorldPos.x * 0.05 - vGrassWorldPos.z * 0.09) * 0.5 + 0.5;
            float microRand = fract(sin(dot(floor(vGrassWorldPos.xz * 2.8), vec2(12.9898, 78.233))) * 43758.5453);
            float sssVariety = mix(0.25, 1.35, macroWave * 0.65 + microRand * 0.35);

            vec3 sssColor = mix(bladeLinear * 2.0, uSunColor * 1.5, 0.40);
            vec3 sss = sssColor * backLight * edgeAndTip * sssVariety * 0.90;

            diffuseColor.rgb = bladeLinear + sss;
            `
        );
    };

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;

    const ident = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, ident);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
}

// ============================================================================
// 8. CHUNK-BASED PROCEDURAL TERRAIN & OPTIMIZED PROP STREAMING
// ============================================================================
const CHUNK_SIZE = 80;
const CHUNK_SEGS = 32;
const VIEW_RADIUS = 4; // 9x9 = 81 chunks (320m radius) - covers visual range with fog transition
const UNLOAD_RADIUS = 5; // Hysteresis buffer: only dispose chunks when player is >= 5 chunks (400m) away

// Non-blocking asynchronous chunk streaming queue
var chunkLoadQueue = [];
var chunkLoadSet = new Set();
var chunkUnloadQueue = [];

class TerrainChunk {
    constructor(cx, cz) {
        this.cx = cx;
        this.cz = cz;
        this.chunkKey = `${cx},${cz}`;
        this.group = new THREE.Group();
        this.trees = [];
        this.targets = [];
        this.raycastMeshes = [];
        this.buildings = [];
        this.rocks = [];
        this.smokePuffs = [];
        this.fireSprites = [];
        this.bushMesh = null;

        this.buildTerrainMesh();
        this.populateChunkContent();
        chunksGroup.add(this.group);
    }

    buildTerrainMesh() {
        const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGS, CHUNK_SEGS);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const count = pos.count;
        const colors = new Float32Array(count * 3);

        const colLushGrass = new THREE.Color(0x283e1c);
        const colDryGrass  = new THREE.Color(0x565026);
        const colSunlitGrass = new THREE.Color(0x405828);
        const colMudRoad   = new THREE.Color(0x3e3224);
        const colWetRut    = new THREE.Color(0x221a12);
        const colCliffRock = new THREE.Color(0x585652);
        const colMountain  = new THREE.Color(0x3c4852);
        const colDesertSand = new THREE.Color(0xd29c5a);
        const colDesertDune = new THREE.Color(0xe6ba7e);
        const colSandstone  = new THREE.Color(0xa65c32);
        const colAlpineSnow = new THREE.Color(0xeaf2fa);
        const colHeather    = new THREE.Color(0x644c22);
        const tempCol = new THREE.Color();
        const tempDirtCol = new THREE.Color();

        const xMin = this.cx * CHUNK_SIZE;
        const zMin = this.cz * CHUNK_SIZE;

        for (let i = 0; i < count; i++) {
            const lx = pos.getX(i);
            const lz = pos.getZ(i);
            const wx = xMin + lx + CHUNK_SIZE * 0.5;
            const wz = zMin + lz + CHUNK_SIZE * 0.5;
            const wy = getTerrainHeight(wx, wz);
            let meshY = wy;
            if (wy < -2.25) {
                const submergeDepth = smoothstep(-2.25, -2.85, wy);
                meshY -= submergeDepth * 2.5;
            }

            pos.setXYZ(i, lx, meshY, lz);

            const n = getTerrainNormal(wx, wz);
            const slope = 1.0 - n.y;
            const fieldNoise = fbm3((wx + seedOffset.x) * 0.014, (wz + seedOffset.z) * 0.014) * 0.5 + 0.5;
            const roadF = getRoadFactor(wx, wz);

            if (currentZoneIndex === 1) {
                // Desert zone vertex colors
                tempCol.copy(colDesertSand).lerp(colDesertDune, smoothstep(0.20, 0.80, fieldNoise));
                if (wy < -0.3) {
                    const oasisGreenery = 1.0 - smoothstep(-1.9, -0.3, wy);
                    tempCol.lerp(colLushGrass, oasisGreenery * 0.85);
                }
                if (roadF > 0.01) {
                    tempDirtCol.setHex(0x8c6239);
                    tempCol.lerp(tempDirtCol, Math.min(1.0, roadF * 1.1));
                }
                if (slope > 0.16) {
                    tempCol.lerp(colSandstone, Math.min(1.0, (slope - 0.16) * 4.2));
                }
            } else if (currentZoneIndex === 2) {
                // Alpine Mountain zone vertex colors
                tempCol.copy(colLushGrass).lerp(colSunlitGrass, smoothstep(0.15, 0.65, fieldNoise) * 0.65);
                if (roadF > 0.01) {
                    tempDirtCol.setHex(0x4a4c50);
                    tempCol.lerp(tempDirtCol, Math.min(1.0, roadF * 1.1));
                }
                if (slope > 0.15) {
                    tempCol.lerp(colMountain, Math.min(1.0, (slope - 0.15) * 4.5));
                }
                if (wy > 13.5) {
                    const snowBlend = Math.min(1.0, (wy - 13.5) / 8.0) * (1.0 - smoothstep(0.32, 0.58, slope) * 0.7);
                    tempCol.lerp(colAlpineSnow, snowBlend);
                }
            } else if (currentZoneIndex === 3) {
                // Highland Rolling Hills vertex colors
                tempCol.copy(colLushGrass).lerp(colSunlitGrass, smoothstep(0.10, 0.60, fieldNoise) * 0.75);
                tempCol.lerp(colDryGrass, smoothstep(0.55, 0.92, fieldNoise) * 0.78);
                if (wy > 9.0) {
                    tempCol.lerp(colHeather, Math.min(1.0, (wy - 9.0) / 9.0) * 0.75);
                }
                if (roadF > 0.01) {
                    const distFromCenter = getRoadDistance(wx, wz);
                    const rutDist = Math.abs(distFromCenter - 1.35);
                    const isRut = rutDist < 0.55 ? 0.75 : 0.0;
                    tempDirtCol.copy(colMudRoad).lerp(colWetRut, isRut);
                    tempCol.lerp(tempDirtCol, Math.min(1.0, roadF * 1.1));
                }
                if (slope > 0.20) {
                    tempCol.lerp(colCliffRock, Math.min(1.0, (slope - 0.20) * 4.5));
                }
            } else {
                // Coastal Meadow (default)
                tempCol.copy(colLushGrass).lerp(colSunlitGrass, smoothstep(0.10, 0.60, fieldNoise) * 0.75);
                tempCol.lerp(colDryGrass, smoothstep(0.58, 0.94, fieldNoise) * 0.82);

                if (roadF > 0.01) {
                    const distFromCenter = getRoadDistance(wx, wz);
                    const rutDist = Math.abs(distFromCenter - 1.35);
                    const isRut = rutDist < 0.55 ? 0.75 : 0.0;
                    tempDirtCol.copy(colMudRoad).lerp(colWetRut, isRut);
                    tempCol.lerp(tempDirtCol, Math.min(1.0, roadF * 1.1));
                }

                if (slope > 0.22) {
                    const rockBlend = Math.min(1.0, (slope - 0.22) * 4.5);
                    tempCol.lerp(colCliffRock, rockBlend);
                }

                if (wy > 12.0) {
                    const mBlend = Math.min(1.0, (wy - 12.0) / 12.0);
                    tempCol.lerp(colMountain, mBlend * 0.75);
                }
            }

            colors[i * 3 + 0] = tempCol.r;
            colors[i * 3 + 1] = tempCol.g;
            colors[i * 3 + 2] = tempCol.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        this.terrainMesh = new THREE.Mesh(geo, terrainMat);
        this.terrainMesh.position.set(xMin + CHUNK_SIZE * 0.5, 0, zMin + CHUNK_SIZE * 0.5);
        this.terrainMesh.receiveShadow = true;
        this.group.add(this.terrainMesh);
        this.raycastMeshes.push(this.terrainMesh);
        aimRaycastMeshes.push(this.terrainMesh);
    }

    populateChunkContent() {
        const isMobile = (typeof window.isMobileBrowser === "function" && window.isMobileBrowser()) || (typeof window.isMobileDevice === "function" && window.isMobileDevice());
        const rng = createChunkRNG(this.cx, this.cz, currentSeed);
        const xMin = this.cx * CHUNK_SIZE;
        const zMin = this.cz * CHUNK_SIZE;
        const chunkCenterX = xMin + CHUNK_SIZE * 0.5;
        const chunkCenterZ = zMin + CHUNK_SIZE * 0.5;
        const distFromSpawn = Math.hypot(chunkCenterX, chunkCenterZ);

        // ---------------------------------------------------------------------
        // 1. ZONE-APPROPRIATE VILLAGES, KASBAHS, BUNKERS & STRUCTURES
        // ---------------------------------------------------------------------
        const isCrossroadsVillage = (this.cx === 0 && this.cz === -1);
        const isEastVillage = (this.cx === 1 && this.cz === 1);
        const isWestVillage = (this.cx === -1 && this.cz === 1);
        const isProceduralVillage = (Math.abs(this.cx) + Math.abs(this.cz) >= 3) && ((Math.abs(this.cx * 11 + this.cz * 17) % 5) === 0);
        const isVillage = isCrossroadsVillage || isEastVillage || isWestVillage || isProceduralVillage;

        if (isVillage) {
            const villageTemplates = [
                { rx: -16, rz: -14, type: 'cottage', rot: 0.35, scale: 1.05 },
                { rx: 16, rz: -16, type: 'barn', rot: -0.42, scale: 1.10 },
                { rx: -15, rz: 15, type: isWestVillage ? 'ruin' : 'cottage', rot: 1.25, scale: 0.98 },
                { rx: 18, rz: 16, type: isWestVillage ? 'ruin' : 'barn', rot: -1.15, scale: 1.02 },
                { rx: -1, rz: -26, type: 'wall', rot: 0.05, scale: 1.0 },
                { rx: 1, rz: 26, type: 'wall', rot: 0.08, scale: 1.0 }
            ];

            villageTemplates.forEach((struct) => {
                let bx = chunkCenterX + struct.rx + (rng() - 0.5) * 4.0;
                let bz = chunkCenterZ + struct.rz + (rng() - 0.5) * 4.0;
                bx = THREE.MathUtils.clamp(bx, xMin + 8, xMin + CHUNK_SIZE - 8);
                bz = THREE.MathUtils.clamp(bz, zMin + 8, zMin + CHUNK_SIZE - 8);
                if (Math.hypot(bx, bz) < 32) return; // Keep spawn pad clear
                if (Math.hypot(bx - (-18), bz - 112) < 24) return; // Don't duplicate signature landmark
                if (Math.hypot(bx - (-19), bz - 22) < 20) return; // Don't duplicate signature rock

                const by = getTerrainHeight(bx, bz);
                const norm = getTerrainNormal(bx, bz);
                const minNormY = (currentZoneIndex === 2) ? 0.80 : 0.85;
                if (by < -1.8 || norm.y < minNormY || (currentZoneIndex === 2 && by > 16.5)) return;

                let bldgGeo, radius, height, isRuin = false, isWall = false;
                if (currentZoneIndex === 1) {
                    // Desert Kasbah & Mud-Brick Settlement
                    if (struct.type === 'cottage' || struct.type === 'barn') {
                        bldgGeo = sharedKasbahGeo;
                        radius = 5.8 * struct.scale;
                        height = 6.8 * struct.scale;
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedDesertRuinGeo;
                        radius = 4.9 * struct.scale;
                        height = 4.2 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        radius = 3.2 * struct.scale;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                } else if (currentZoneIndex === 2) {
                    // Alpine Mountain Bunkers & Stone Chalets
                    if (struct.type === 'cottage') {
                        bldgGeo = sharedMountainBunkerGeo;
                        radius = 5.6 * struct.scale;
                        height = 6.2 * struct.scale;
                    } else if (struct.type === 'barn') {
                        bldgGeo = sharedCottageGeo;
                        radius = 5.6 * struct.scale;
                        height = 6.6 * struct.scale;
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedRuinGeo;
                        radius = 4.8 * struct.scale;
                        height = 4.2 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        radius = 3.2 * struct.scale;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                } else {
                    // Meadow & Rolling Hills European Cottages & Barns
                    if (struct.type === 'cottage') {
                        bldgGeo = sharedCottageGeo;
                        radius = 5.6 * struct.scale;
                        height = 6.6 * struct.scale;
                    } else if (struct.type === 'barn') {
                        bldgGeo = sharedBarnGeo;
                        radius = 6.2 * struct.scale;
                        height = 7.5 * struct.scale;
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedRuinGeo;
                        radius = 4.8 * struct.scale;
                        height = 4.2 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        radius = 3.2 * struct.scale;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                }

                const bMesh = new THREE.Mesh(bldgGeo, villageMat);
                bMesh.position.set(bx, by - 0.15, bz);
                bMesh.rotation.y = struct.rot + (rng() - 0.5) * 0.25;
                bMesh.scale.setScalar(struct.scale);
                bMesh.castShadow = true;
                bMesh.receiveShadow = true;
                this.group.add(bMesh);

                this.raycastMeshes.push(bMesh);
                aimRaycastMeshes.push(bMesh);

                const bldgObj = {
                    mesh: bMesh,
                    x: bx,
                    y: by,
                    z: bz,
                    radius: radius,
                    height: height,
                    isRuin: isRuin,
                    isWall: isWall,
                    type: struct.type
                };
                this.buildings.push(bldgObj);
                worldBuildings.push(bldgObj);
                worldObstacles.push(bldgObj);
            });
        } else if (distFromSpawn > 35 && rng() < 0.28) {
            // Roadside Outpost, Kasbah, Bunker, or Ruin along road verges
            const roadDistCenter = getRoadDistance(chunkCenterX, chunkCenterZ);
            if (roadDistCenter < 35) {
                const sideSign = (rng() > 0.5) ? 1 : -1;
                let hx = chunkCenterX + sideSign * (14.0 + rng() * 8.0);
                let hz = chunkCenterZ + (rng() - 0.5) * 18.0;
                hx = THREE.MathUtils.clamp(hx, xMin + 8, xMin + CHUNK_SIZE - 8);
                hz = THREE.MathUtils.clamp(hz, zMin + 8, zMin + CHUNK_SIZE - 8);
                if (Math.hypot(hx, hz) < 32) return;
                if (Math.hypot(hx - (-18), hz - 112) < 24) return;
                if (Math.hypot(hx - (-19), hz - 22) < 20) return;
                const hy = getTerrainHeight(hx, hz);
                const norm = getTerrainNormal(hx, hz);

                if (hy > -1.8 && norm.y > 0.84 && (currentZoneIndex !== 2 || hy < 15.5)) {
                    const bType = (rng() < 0.35) ? 'ruin' : ((rng() < 0.70) ? 'cottage' : 'barn');
                    let bldgGeo;
                    if (currentZoneIndex === 1) {
                        bldgGeo = (bType === 'ruin') ? sharedDesertRuinGeo : sharedKasbahGeo;
                    } else if (currentZoneIndex === 2) {
                        bldgGeo = (bType === 'ruin') ? sharedRuinGeo : ((bType === 'cottage') ? sharedMountainBunkerGeo : sharedCottageGeo);
                    } else {
                        bldgGeo = (bType === 'ruin') ? sharedRuinGeo : ((bType === 'cottage') ? sharedCottageGeo : sharedBarnGeo);
                    }
                    const bScale = 0.95 + rng() * 0.25;
                    const bMesh = new THREE.Mesh(bldgGeo, villageMat);
                    bMesh.position.set(hx, hy - 0.15, hz);
                    bMesh.rotation.y = rng() * Math.PI * 2;
                    bMesh.scale.setScalar(bScale);
                    bMesh.castShadow = true;
                    bMesh.receiveShadow = true;
                    this.group.add(bMesh);

                    this.raycastMeshes.push(bMesh);
                    aimRaycastMeshes.push(bMesh);

                    const bldgObj = {
                        mesh: bMesh,
                        x: hx,
                        y: hy,
                        z: hz,
                        radius: (bType === 'ruin' ? 4.8 : (bType === 'barn' ? 6.2 : 5.6)) * bScale,
                        height: (bType === 'ruin' ? 4.2 : (bType === 'barn' ? 7.5 : 6.6)) * bScale,
                        isRuin: (bType === 'ruin'),
                        type: bType
                    };
                    this.buildings.push(bldgObj);
                    worldBuildings.push(bldgObj);
                    worldObstacles.push(bldgObj);

                    // Add an attached stone wall border
                    if (rng() < 0.60) {
                        let wx = hx + (rng() > 0.5 ? 7.0 : -7.0);
                        let wz = hz + (rng() - 0.5) * 4.0;
                        wx = THREE.MathUtils.clamp(wx, xMin + 6, xMin + CHUNK_SIZE - 6);
                        wz = THREE.MathUtils.clamp(wz, zMin + 6, zMin + CHUNK_SIZE - 6);
                        const wy = getTerrainHeight(wx, wz);
                        const wMesh = new THREE.Mesh(sharedStoneWallGeo, villageMat);
                        wMesh.position.set(wx, wy - 0.15, wz);
                        wMesh.rotation.y = bMesh.rotation.y + 0.3;
                        wMesh.scale.setScalar(bScale);
                        wMesh.castShadow = true;
                        wMesh.receiveShadow = true;
                        this.group.add(wMesh);
                        this.raycastMeshes.push(wMesh);
                        aimRaycastMeshes.push(wMesh);
                        const wallObj = { mesh: wMesh, x: wx, y: wy, z: wz, radius: 3.2 * bScale, height: 1.4 * bScale, isRuin: false, isWall: true, type: 'wall' };
                        this.buildings.push(wallObj);
                        worldBuildings.push(wallObj);
                        worldObstacles.push(wallObj);
                    }
                }
            }
        }

        // ---------------------------------------------------------------------
        // 2. ZONE-SPECIFIC ROCK CRAGS, SANDSTONE HOODOOS & ALPINE GRANITE PEAKS
        // ---------------------------------------------------------------------
        this.rocks = [];
        const rockProb = (currentZoneIndex === 2) ? (isMobile ? 0.55 : 0.90)
                       : (currentZoneIndex === 1 || currentZoneIndex === 3) ? (isMobile ? 0.45 : 0.80)
                       : (isMobile ? 0.35 : 0.70);
        const maxExtraRocks = (currentZoneIndex === 2) ? (isMobile ? 2 : 3) : (isMobile ? 1 : 2);
        const rockCount = (distFromSpawn > 20 && !isVillage && rng() < rockProb)
            ? (1 + Math.floor(rng() * maxExtraRocks))
            : 0;

        const zoneRockGeo = (currentZoneIndex === 1) ? sharedSandstoneRockGeo
                          : (currentZoneIndex === 2) ? sharedMountainRockGeo
                          : sharedRockGeo;
        const zoneRockMat = (currentZoneIndex === 1) ? desertRockMat
                          : (currentZoneIndex === 2) ? mountainRockMat
                          : rockMat;

        for (let r = 0; r < rockCount; r++) {
            let rx = xMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            let rz = zMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            if (Math.hypot(rx, rz) < 26) continue;
            if (Math.hypot(rx - (-19), rz - 22) < 18) continue;
            if (getRoadFactor(rx, rz) > 0.25) continue;
            const ry = getTerrainHeight(rx, rz);
            if (ry < -2.0) continue;

            const rs = (currentZoneIndex === 2 ? 1.15 : 1.0) + rng() * 0.50;
            const rockMesh = new THREE.Mesh(zoneRockGeo, zoneRockMat);
            rockMesh.position.set(rx, ry - 0.2, rz);
            rockMesh.rotation.y = rng() * Math.PI * 2;
            rockMesh.scale.set(rs, rs, rs);
            rockMesh.castShadow = true;
            rockMesh.receiveShadow = true;
            this.group.add(rockMesh);

            this.raycastMeshes.push(rockMesh);
            aimRaycastMeshes.push(rockMesh);

            const rockObj = {
                mesh: rockMesh,
                x: rx,
                y: ry,
                z: rz,
                radius: 4.8 * rs,
                height: 4.4 * rs,
                type: 'rock'
            };
            this.rocks.push(rockObj);
            worldObstacles.push(rockObj);
            worldBuildings.push({ x: rx, z: rz, radius: 4.8 * rs, isRuin: false, isRock: true });
        }

        // ---------------------------------------------------------------------
        // 3. ZONE-SPECIFIC BOTANICAL FLORA (PALMS/CACTI, ALPINE CONIFERS, WOODLANDS)
        // ---------------------------------------------------------------------
        const forestNoise = fbm3((chunkCenterX + seedOffset.x) * 0.007, (chunkCenterZ + seedOffset.z) * 0.007) * 0.5 + 0.5;

        let targetTreeCount = 0;
        if (currentZoneIndex === 1) {
            // Desert Zone: Lush Date Palm groves near the Oasis (58, 78), sparse Cacti & Palms across dunes
            const distFromOasis = Math.hypot(chunkCenterX - 58.0, chunkCenterZ - 78.0);
            if (distFromOasis < 95.0) {
                targetTreeCount = 9 + Math.floor(rng() * 7);
            } else if (isVillage) {
                targetTreeCount = 3 + Math.floor(rng() * 4);
            } else if (forestNoise > 0.45) {
                targetTreeCount = 3 + Math.floor(rng() * 4);
            } else {
                targetTreeCount = 1 + Math.floor(rng() * 2);
            }
        } else if (currentZoneIndex === 2) {
            // Alpine Mountain Zone: Dense Nordic Spruce & Scots Pine timberline forests in passes & lower slopes
            if (isVillage) {
                targetTreeCount = 3 + Math.floor(rng() * 3);
            } else if (forestNoise > 0.46) {
                targetTreeCount = 12 + Math.floor(rng() * 8);
            } else {
                targetTreeCount = 4 + Math.floor(rng() * 5);
            }
        } else if (currentZoneIndex === 3) {
            // Rolling Hills Zone: Scenic hilltop copses, valley oak/beech woods, and pine windbreaks
            if (isVillage) {
                targetTreeCount = 4 + Math.floor(rng() * 3);
            } else if (forestNoise > 0.50) {
                targetTreeCount = 11 + Math.floor(rng() * 7);
            } else if (forestNoise > 0.30) {
                targetTreeCount = 4 + Math.floor(rng() * 4);
            } else {
                targetTreeCount = 1 + Math.floor(rng() * 2);
            }
        } else {
            // Coastal Meadow (default)
            if (isVillage) {
                targetTreeCount = 3 + Math.floor(rng() * 3);
            } else if (forestNoise > 0.52) {
                targetTreeCount = 14 + Math.floor(rng() * 9);
            } else if (forestNoise > 0.32) {
                targetTreeCount = 5 + Math.floor(rng() * 5);
            } else {
                targetTreeCount = Math.floor(rng() * 3);
            }
        }
        if (isMobile) targetTreeCount = Math.ceil(targetTreeCount * 0.45);

        for (let t = 0; t < targetTreeCount; t++) {
            let tx = xMin + (0.08 + rng() * 0.84) * CHUNK_SIZE;
            let tz = zMin + (0.08 + rng() * 0.84) * CHUNK_SIZE;

            if (Math.hypot(tx, tz) < 20) continue; // Keep spawn clear
            if (getRoadFactor(tx, tz) > 0.20) continue; // Keep roads clear

            let collidesBuilding = false;
            for (let b = 0; b < this.buildings.length; b++) {
                const bldg = this.buildings[b];
                if (Math.hypot(tx - bldg.x, tz - bldg.z) < bldg.radius + 1.8) {
                    collidesBuilding = true;
                    break;
                }
            }
            if (collidesBuilding) continue;

            const ty = getTerrainHeight(tx, tz);
            if (ty < -2.4) continue;
            // In Alpine Mountains, respect the high-altitude snow timberline (no trees on sheer high peaks > 17m)
            if (currentZoneIndex === 2 && ty > 17.0) continue;

            const treeRoll = rng();
            let treeGeo, treeType, trunkH, chosenMat = treeMaterial, useTreeDepth = true;

            if (currentZoneIndex === 1) {
                // Desert: Date Palms near oasis/villages/low wadis, Saguaro Cacti on dry dunes
                const nearOasis = Math.hypot(tx - 58.0, tz - 78.0) < 88.0;
                if (nearOasis || isVillage || (ty < 1.8 && treeRoll < 0.65)) {
                    treeGeo = sharedPalmGeo;
                    treeType = 'palm';
                    trunkH = 11.5;
                } else {
                    treeGeo = sharedCactusGeo;
                    treeType = 'cactus';
                    trunkH = 4.8;
                    chosenMat = cactusMat;
                    useTreeDepth = false;
                }
            } else if (currentZoneIndex === 2) {
                // Alpine Mountains: Dominantly Nordic Spruce and Scots Pine
                if (treeRoll < 0.72) {
                    treeGeo = sharedSpruceGeo;
                    treeType = 'spruce';
                    trunkH = 14.2;
                } else {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.5;
                }
            } else if (currentZoneIndex === 3) {
                // Rolling Hills: Broadleaf Oak/Beech and Scots Pine on ridges
                if (treeRoll < 0.52) {
                    treeGeo = sharedDecidGeo;
                    treeType = 'beech';
                    trunkH = 10.2;
                } else if (treeRoll < 0.82) {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.5;
                } else {
                    treeGeo = sharedSpruceGeo;
                    treeType = 'spruce';
                    trunkH = 14.2;
                }
            } else {
                // Coastal Meadow
                if (isVillage) {
                    if (treeRoll < 0.65) {
                        treeGeo = sharedDecidGeo;
                        treeType = 'beech';
                        trunkH = 10.2;
                    } else {
                        treeGeo = sharedPineGeo;
                        treeType = 'pine';
                        trunkH = 12.5;
                    }
                } else if (forestNoise > 0.52) {
                    if (treeRoll < 0.58) {
                        treeGeo = sharedSpruceGeo;
                        treeType = 'spruce';
                        trunkH = 14.2;
                    } else if (treeRoll < 0.85) {
                        treeGeo = sharedPineGeo;
                        treeType = 'pine';
                        trunkH = 12.8;
                    } else {
                        treeGeo = sharedDecidGeo;
                        treeType = 'beech';
                        trunkH = 10.5;
                    }
                } else {
                    if (treeRoll < 0.48) {
                        treeGeo = sharedSpruceGeo;
                        treeType = 'spruce';
                        trunkH = 14.2;
                    } else if (treeRoll < 0.74) {
                        treeGeo = sharedPineGeo;
                        treeType = 'pine';
                        trunkH = 12.5;
                    } else {
                        treeGeo = sharedDecidGeo;
                        treeType = 'beech';
                        trunkH = 9.8;
                    }
                }
            }

            const scale = 0.85 + rng() * 0.55;
            const treeGroup = new THREE.Group();
            treeGroup.position.set(tx, ty, tz);
            treeGroup.scale.setScalar(scale);

            const treeMesh = new THREE.Mesh(treeGeo, chosenMat);
            treeMesh.castShadow = true;
            treeMesh.receiveShadow = true;
            if (useTreeDepth) {
                treeMesh.customDepthMaterial = getTreeDepthMaterial();
            }
            treeGroup.add(treeMesh);
            this.group.add(treeGroup);
            this.raycastMeshes.push(treeMesh);

            const treeId = `${this.chunkKey}:t:${t}`;
            const wasFallen = sessionFallenTrees.has(treeId);

            const treeObj = {
                id: treeId,
                group: treeGroup,
                mesh: treeMesh,
                chunkKey: this.chunkKey,
                phase: rng() * Math.PI * 2,
                x: tx,
                y: ty,
                z: tz,
                scale: scale,
                isFallen: wasFallen,
                fallAngle: wasFallen ? Math.PI * 0.48 : 0.0,
                angularVel: 0.0,
                maxFallAngle: Math.PI * 0.48,
                fallAxis: new THREE.Vector3(1, 0, 0),
                radius: (treeType === 'cactus' ? 0.75 : 1.35) * scale,
                trunkHeight: trunkH * scale,
                type: treeType
            };

            if (wasFallen) {
                treeGroup.rotation.z = Math.PI * 0.48;
                treeGroup.position.y = ty - 0.25;
            }

            this.trees.push(treeObj);
            swayTrees.push(treeObj);
        }

        // ---------------------------------------------------------------------
        // 4. UNDERGROWTH BUSHES & SCRUB (INSTANCED MESH)
        // ---------------------------------------------------------------------
        const bushMatrices = [];
        let bushCount = (forestNoise > 0.52) ? (5 + Math.floor(rng() * 5)) : (Math.floor(rng() * 3) + 1);
        if (currentZoneIndex === 1) {
            bushCount = Math.floor(rng() * 3); // Sparse desert wadi bushes
        }
        const dummyBush = new THREE.Object3D();

        for (let b = 0; b < bushCount; b++) {
            const bx = xMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            const bz = zMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            if (getRoadFactor(bx, bz) > 0.28) continue;
            const by = getTerrainHeight(bx, bz);
            if (by < -2.4 || (currentZoneIndex === 2 && by > 15.0)) continue;
            const bs = 0.75 + rng() * 0.65;

            dummyBush.position.set(bx, by, bz);
            dummyBush.scale.set(bs * 1.15, bs * 0.9, bs * 1.15);
            dummyBush.rotation.y = rng() * Math.PI * 2;
            dummyBush.updateMatrix();
            bushMatrices.push(dummyBush.matrix.clone());
        }

        if (bushMatrices.length > 0) {
            const bushInstMesh = new THREE.InstancedMesh(sharedBushGeo, treeMaterial, bushMatrices.length);
            for (let i = 0; i < bushMatrices.length; i++) {
                bushInstMesh.setMatrixAt(i, bushMatrices[i]);
            }
            bushInstMesh.instanceMatrix.needsUpdate = true;
            bushInstMesh.castShadow = true;
            bushInstMesh.receiveShadow = true;
            bushInstMesh.customDepthMaterial = getTreeDepthMaterial();
            this.group.add(bushInstMesh);
            this.bushMesh = bushInstMesh;
        }
    }

    dispose() {
        chunksGroup.remove(this.group);

        this.raycastMeshes.forEach(mesh => {
            const idx = aimRaycastMeshes.indexOf(mesh);
            if (idx !== -1) aimRaycastMeshes.splice(idx, 1);
        });

        this.trees.forEach(t => {
            const idx = swayTrees.indexOf(t);
            if (idx !== -1) swayTrees.splice(idx, 1);
        });

        this.targets.forEach(tg => {
            const idx = targets.indexOf(tg);
            if (idx !== -1) targets.splice(idx, 1);
        });

        this.buildings.forEach(b => {
            const idx = worldBuildings.indexOf(b);
            if (idx !== -1) worldBuildings.splice(idx, 1);
            const oIdx = worldObstacles.indexOf(b);
            if (oIdx !== -1) worldObstacles.splice(oIdx, 1);
        });

        if (this.rocks) {
            this.rocks.forEach(r => {
                const oIdx = worldObstacles.indexOf(r);
                if (oIdx !== -1) worldObstacles.splice(oIdx, 1);
                for (let k = worldBuildings.length - 1; k >= 0; k--) {
                    if (worldBuildings[k].isRock && Math.hypot(worldBuildings[k].x - r.x, worldBuildings[k].z - r.z) < 0.1) {
                        worldBuildings.splice(k, 1);
                    }
                }
            });
        }

        this.smokePuffs.forEach(p => {
            const idx = activeSmokePuffs.indexOf(p);
            if (idx !== -1) activeSmokePuffs.splice(idx, 1);
        });
        this.fireSprites.forEach(f => {
            const idx = activeFireSprites.indexOf(f);
            if (idx !== -1) activeFireSprites.splice(idx, 1);
        });

        if (this.terrainMesh) {
            this.terrainMesh.geometry.dispose();
        }
        if (this.bushMesh) {
            this.bushMesh.dispose && this.bushMesh.dispose();
        }
    }
}

function updateTerrainChunks(playerX, playerZ, forceSyncCenter = false) {
    const playerCX = Math.floor(playerX / CHUNK_SIZE);
    const playerCZ = Math.floor(playerZ / CHUNK_SIZE);

    const isMobile = (typeof window.isMobileBrowser === "function" && window.isMobileBrowser()) || (typeof window.isMobileDevice === "function" && window.isMobileDevice());
    const currentViewRadius = isMobile ? 2 : VIEW_RADIUS;
    const currentUnloadRadius = isMobile ? 3 : UNLOAD_RADIUS;

    const centerChanged = (playerCX !== activeChunkCenterX || playerCZ !== activeChunkCenterZ);

    if (centerChanged || forceSyncCenter) {
        activeChunkCenterX = playerCX;
        activeChunkCenterZ = playerCZ;

        // On initial zone boot or restart, build the center chunk immediately
        // so the player's tank has immediate collision ground
        const centerKey = `${playerCX},${playerCZ}`;
        if (forceSyncCenter && !activeChunks.has(centerKey)) {
            activeChunks.set(centerKey, new TerrainChunk(playerCX, playerCZ));
            chunkLoadSet.delete(centerKey);
        }

        // Collect all chunks required within view radius
        for (let dx = -currentViewRadius; dx <= currentViewRadius; dx++) {
            for (let dz = -currentViewRadius; dz <= currentViewRadius; dz++) {
                const cx = playerCX + dx;
                const cz = playerCZ + dz;
                const key = `${cx},${cz}`;

                if (!activeChunks.has(key) && !chunkLoadSet.has(key)) {
                    const distSq = dx * dx + dz * dz;
                    chunkLoadQueue.push({ cx, cz, key, distSq });
                    chunkLoadSet.add(key);
                }
            }
        }

        // Prune load queue: remove chunks that have moved out of unload radius
        for (let i = chunkLoadQueue.length - 1; i >= 0; i--) {
            const item = chunkLoadQueue[i];
            const distCX = Math.abs(item.cx - playerCX);
            const distCZ = Math.abs(item.cz - playerCZ);
            if (distCX > currentUnloadRadius || distCZ > currentUnloadRadius) {
                chunkLoadSet.delete(item.key);
                chunkLoadQueue.splice(i, 1);
            } else {
                item.distSq = (item.cx - playerCX) ** 2 + (item.cz - playerCZ) ** 2;
            }
        }

        // Sort queue: chunks closest to the player load first!
        chunkLoadQueue.sort((a, b) => a.distSq - b.distSq);

        // Queue chunks further than currentUnloadRadius for smooth background disposal
        for (const [key, chunk] of activeChunks.entries()) {
            const distCX = Math.abs(chunk.cx - playerCX);
            const distCZ = Math.abs(chunk.cz - playerCZ);
            if (distCX > currentUnloadRadius || distCZ > currentUnloadRadius) {
                if (!chunkUnloadQueue.includes(chunk)) {
                    chunkUnloadQueue.push(chunk);
                }
            }
        }
    }
}

// Progressive time-sliced background chunk loader: maintains constant 60 FPS
function processChunkStreamingQueue(budgetMs = 3.5) {
    // 1. Process at most 1 chunk disposal per frame to avoid garbage collection hitches
    if (chunkUnloadQueue.length > 0) {
        const chunk = chunkUnloadQueue.shift();
        if (chunk) {
            activeChunks.delete(chunk.chunkKey);
            chunk.dispose();
        }
    }

    // 2. Process chunk loading within allotted frame time budget
    if (chunkLoadQueue.length === 0) return;

    const startT = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    while (chunkLoadQueue.length > 0) {
        const item = chunkLoadQueue.shift();
        chunkLoadSet.delete(item.key);

        if (!activeChunks.has(item.key)) {
            activeChunks.set(item.key, new TerrainChunk(item.cx, item.cz));
        }

        const elapsed = ((window.performance && window.performance.now) ? window.performance.now() : Date.now()) - startT;
        if (elapsed >= budgetMs) {
            break;
        }
    }
}
window.updateTerrainChunks = updateTerrainChunks;
window.processChunkStreamingQueue = processChunkStreamingQueue;

// ============================================================================
// 9. TREE DESTRUCTION & PERSISTENCE
// ============================================================================
function hitTree(tree, hitDir, force = 3.5) {
    if (!tree || tree.isFallen) return;
    tree.isFallen = true;
    // Gentle initial impulse so tree starts tipping slowly, not snapping down
    tree.angularVel = Math.min(0.35, Math.max(0.12, (force || 1.0) * 0.05));

    if (tree.id) {
        sessionFallenTrees.add(tree.id);
    }

    const hDir = new THREE.Vector3(hitDir ? hitDir.x : 0, 0, hitDir ? hitDir.z : 1).normalize();
    if (hDir.lengthSq() < 0.001) hDir.set(0, 0, 1);
    // Rotating around (hDir.z, 0, -hDir.x) tilts vector (0, 1, 0) directly towards (hDir.x, 0, hDir.z)
    tree.fallAxis = new THREE.Vector3(hDir.z, 0, -hDir.x).normalize();
    tree.fallDir = hDir.clone();

    const impactY = tree.y + 0.9 * tree.scale;
    const impactPos = new THREE.Vector3(tree.x, impactY, tree.z);

    for (let s = 0; s < 12; s++) {
        const spkVel = new THREE.Vector3(
            (Math.random() - 0.5) * 6 + hDir.x * 2.5,
            2.0 + Math.random() * 4,
            (Math.random() - 0.5) * 6 + hDir.z * 2.5
        );
        if (typeof spawnParticle === 'function') {
            spawnParticle(impactPos, spkVel, (tree.type === 'pine' ? 0x3d281a : 0xdddddd), 0.16, 0.05, 0.8 + Math.random() * 0.5, false, 'spark');
        }
    }

    const folCol = (tree.type === 'pine') ? 0x1f3624 : 0x5a7d36;
    for (let f = 0; f < 16; f++) {
        const folVel = new THREE.Vector3(
            (Math.random() - 0.5) * 5 + hDir.x * 2.5,
            1.5 + Math.random() * 3.5,
            (Math.random() - 0.5) * 5 + hDir.z * 2.5
        );
        if (typeof spawnParticle === 'function') {
            spawnParticle(impactPos, folVel, folCol, 0.22, 0.65, 0.9 + Math.random() * 0.7, false, 'smoke');
        }
    }

    if (window.soundFX && typeof window.soundFX.playTreeCrack === 'function') {
        window.soundFX.playTreeCrack(impactPos);
    }
}
window.hitTree = hitTree;

// ============================================================================
// 10. SYSTEM INITIALIZATION & MAIN UPDATE LOOP
// ============================================================================
function initEnvironment(scene) {
    if (!envGroup) {
        envGroup = new THREE.Group();
        scene.add(envGroup);
    }
    if (!chunksGroup) {
        chunksGroup = new THREE.Group();
        envGroup.add(chunksGroup);
    }
    terrainMeshRef = chunksGroup;
    window.terrainMeshRef = chunksGroup;

    // Apply Village PBR Atlas to villageMat
    const vAtlas = getVillageAtlas();
    if (vAtlas) {
        villageMat.map = vAtlas.albedo;
        villageMat.normalMap = vAtlas.normal;
        villageMat.normalScale = new THREE.Vector2(0.85, 0.85);
        villageMat.roughnessMap = vAtlas.roughness;
    }

    ensureSharedGeometries();
    if (!sharedSmokeTex) sharedSmokeTex = createSmokeCanvasTexture();
    if (!sharedFireTex) sharedFireTex = createFireCanvasTexture();
}

function createZoneWaterMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSeedOffset: terrainUniforms.uSeedOffset,
            uRoadBaseX: terrainUniforms.uRoadBaseX,
            uRoad2BaseZ: terrainUniforms.uRoad2BaseZ,
            uRoad3BaseX: terrainUniforms.uRoad3BaseX,
            uRoad4BaseX: terrainUniforms.uRoad4BaseX,
            uZoneType: terrainUniforms.uZoneType,
            uSunDir: terrainUniforms.uSunDir,
            uSunColor: terrainUniforms.uSunColor,
            uSkyColor: terrainUniforms.uSkyColor
        },
        transparent: true,
        depthWrite: false,
        vertexShader: `
            uniform float uTime;
            varying vec3 vWorldPos;
            varying float vWaveHeight;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                float w1 = sin(wp.x * 0.032 + uTime * 1.45) * cos(wp.z * 0.026 + uTime * 1.15) * 0.24;
                float w2 = sin(wp.x * 0.085 - wp.z * 0.065 + uTime * 2.15) * 0.10;
                float w3 = cos(wp.z * 0.16 + uTime * 2.85) * 0.05;
                wp.y += w1 + w2 + w3;
                vWaveHeight = w1 + w2 + w3;
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uSkyColor;
            varying vec3 vWorldPos;
            varying float vWaveHeight;
            ${SHARED_TERRAIN_GLSL}

            void main() {
                float terrainY = getTerrainHeight_gpu(vWorldPos.x, vWorldPos.z);
                float waterDepth = (-2.5) - terrainY;
                if (waterDepth < -0.25) discard;

                vec2 p = vWorldPos.xz;
                float n1 = valueNoise2D_gpu(p * 0.18 + vec2(uTime * 0.45, uTime * 0.32));
                float n2 = valueNoise2D_gpu(p * 0.52 - vec2(uTime * 0.65, uTime * 0.48));
                float n3 = valueNoise2D_gpu(p * 1.35 + vec2(uTime * 1.10, -uTime * 0.85));

                vec3 N = normalize(vec3(
                    (n1 * 0.45 + n2 * 0.35 + n3 * 0.20) * 0.28,
                    1.0,
                    (n2 * 0.45 - n1 * 0.35 + n3 * 0.20) * 0.28
                ));

                vec3 V = normalize(cameraPosition - vWorldPos);
                vec3 L = normalize(uSunDir);
                vec3 H = normalize(L + V);

                float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
                float spec = pow(max(dot(N, H), 0.0), 180.0) * 2.6 + pow(max(dot(N, H), 0.0), 28.0) * 0.38;

                // Zone-adapted water colors (turquoise desert oasis, glacial alpine tarn, coastal sea)
                vec3 deepCol = vec3(0.02, 0.12, 0.24);
                vec3 midCol = vec3(0.04, 0.25, 0.36);
                vec3 shallowCol = vec3(0.10, 0.42, 0.44);
                if (uZoneType == 1) {
                    deepCol = vec3(0.02, 0.20, 0.26);
                    midCol = vec3(0.05, 0.36, 0.38);
                    shallowCol = vec3(0.14, 0.54, 0.48);
                } else if (uZoneType == 2) {
                    deepCol = vec3(0.02, 0.14, 0.28);
                    midCol = vec3(0.05, 0.28, 0.42);
                    shallowCol = vec3(0.12, 0.46, 0.54);
                }

                float depthFactor = clamp(waterDepth / 9.0, 0.0, 1.0);
                vec3 waterCol = mix(shallowCol, midCol, smoothstep(0.0, 0.45, depthFactor));
                waterCol = mix(waterCol, deepCol, smoothstep(0.35, 1.0, depthFactor));

                vec3 skyRefl = mix(uSkyColor * 0.85, uSunColor * 0.95, 0.22);
                waterCol = mix(waterCol, skyRefl, clamp(fresnel * 0.72 + 0.08, 0.0, 0.85));
                waterCol += uSunColor * spec;

                float foamNoise = n1 * 0.5 + n2 * 0.5;
                float surfWave = sin(waterDepth * 6.5 - uTime * 3.2 + foamNoise * 2.8);
                float primaryBreaker = (1.0 - smoothstep(0.0, 1.15, abs(waterDepth))) * smoothstep(0.20, 0.75, surfWave + 0.35);
                float secondaryRipple = smoothstep(0.4, 2.2, waterDepth) * (1.0 - smoothstep(2.2, 4.0, waterDepth)) * smoothstep(0.62, 0.92, surfWave);
                float whitecap = smoothstep(0.24, 0.38, vWaveHeight + n2 * 0.14) * smoothstep(1.5, 5.0, waterDepth) * 0.45;
                float totalFoam = clamp(primaryBreaker * 0.92 + secondaryRipple * 0.48 + whitecap, 0.0, 1.0);

                vec3 foamColor = mix(vec3(0.88, 0.93, 0.96), uSunColor, 0.25);
                waterCol = mix(waterCol, foamColor, totalFoam);

                float shoreAlpha = smoothstep(-0.20, 0.45, waterDepth);
                float dist = length(vWorldPos.xz - cameraPosition.xz);
                float fogF = 1.0 - exp(-0.00085 * 0.00085 * dist * dist);
                vec3 fogTarget = mix(uSkyColor, vec3(0.76, 0.82, 0.86), 0.35);
                waterCol = mix(waterCol, fogTarget, clamp(fogF, 0.0, 1.0));

                gl_FragColor = vec4(waterCol, clamp(shoreAlpha * 0.94 + totalFoam * 0.06, 0.0, 0.98));
            }
        `
    });
}

function createCoastalOceanMesh() {
    const oceanGeo = new THREE.PlaneGeometry(3600, 2800, 128, 128);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = createZoneWaterMaterial();
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(0, -2.5, currentZone === 'meadow' ? 1500 : 0);
    oceanMesh.receiveShadow = true;
    return oceanMesh;
}

var zoneStaticTrees = [];
var zoneStaticBuildings = [];
var zoneStaticObstacles = [];
var zoneStaticRaycastMeshes = [];
var zoneStaticSmokePuffs = [];

function clearZoneStaticProps() {
    if (zoneStaticGroup && envGroup) {
        envGroup.remove(zoneStaticGroup);
    }
    zoneStaticGroup = new THREE.Group();
    if (envGroup) envGroup.add(zoneStaticGroup);

    zoneStaticRaycastMeshes.forEach(m => {
        const idx = aimRaycastMeshes.indexOf(m);
        if (idx !== -1) aimRaycastMeshes.splice(idx, 1);
    });
    zoneStaticRaycastMeshes.length = 0;

    zoneStaticTrees.forEach(t => {
        const idx = swayTrees.indexOf(t);
        if (idx !== -1) swayTrees.splice(idx, 1);
    });
    zoneStaticTrees.length = 0;

    zoneStaticBuildings.forEach(b => {
        const idx = worldBuildings.indexOf(b);
        if (idx !== -1) worldBuildings.splice(idx, 1);
    });
    zoneStaticBuildings.length = 0;

    zoneStaticObstacles.forEach(o => {
        const idx = worldObstacles.indexOf(o);
        if (idx !== -1) worldObstacles.splice(idx, 1);
    });
    zoneStaticObstacles.length = 0;

    zoneStaticSmokePuffs.forEach(p => {
        const idx = activeSmokePuffs.indexOf(p);
        if (idx !== -1) activeSmokePuffs.splice(idx, 1);
    });
    zoneStaticSmokePuffs.length = 0;
}

function rebuildZoneStaticProps() {
    clearZoneStaticProps();

    // Update scene fog to match active zone
    const currentScene = window.scene;
    if (currentScene && currentScene.fog && currentZoneConfig && environmentMode !== 'studio') {
        currentScene.background.setHex(currentZoneConfig.fogColor);
        currentScene.fog.color.setHex(currentZoneConfig.fogColor);
        currentScene.fog.density = currentZoneConfig.fogDensity;
    }

    // 1. Signature Foreground Tree at (16.2, 9.5)
    const sigTx = 16.2;
    const sigTz = 9.5;
    const sigTy = getTerrainHeight(sigTx, sigTz);
    const sigScale = 1.35;
    const sigGroup = new THREE.Group();
    sigGroup.position.set(sigTx, sigTy, sigTz);
    sigGroup.scale.setScalar(sigScale);

    const sigTreeGeo = (currentZoneIndex === 1) ? sharedPalmGeo
                     : (currentZoneIndex === 3) ? sharedDecidGeo
                     : sharedSpruceGeo;
    const sigTreeType = (currentZoneIndex === 1) ? 'palm'
                      : (currentZoneIndex === 3) ? 'beech'
                      : 'spruce';
    const sigMesh = new THREE.Mesh(sigTreeGeo, treeMaterial);
    sigMesh.castShadow = true;
    sigMesh.receiveShadow = true;
    sigMesh.customDepthMaterial = getTreeDepthMaterial();
    sigGroup.add(sigMesh);
    zoneStaticGroup.add(sigGroup);
    zoneStaticRaycastMeshes.push(sigMesh);
    aimRaycastMeshes.push(sigMesh);

    const sigTreeObj = {
        id: 'signature:tree:left',
        group: sigGroup,
        mesh: sigMesh,
        phase: 0.8,
        x: sigTx,
        y: sigTy,
        z: sigTz,
        scale: sigScale,
        isFallen: false,
        fallAngle: 0,
        angularVel: 0,
        maxFallAngle: Math.PI * 0.48,
        fallAxis: new THREE.Vector3(1, 0, 0),
        radius: 1.4 * sigScale,
        trunkHeight: 13.5 * sigScale,
        type: sigTreeType
    };
    swayTrees.push(sigTreeObj);
    zoneStaticTrees.push(sigTreeObj);

    // 2. Signature Architectural Landmark at (-18.0, 112.0)
    const cotX = -18.0;
    const cotZ = 112.0;
    const cotY = getTerrainHeight(cotX, cotZ);
    const sigBldgGeo = (currentZoneIndex === 1) ? sharedKasbahGeo
                     : (currentZoneIndex === 2) ? sharedMountainBunkerGeo
                     : sharedCottageGeo;
    const cotMesh = new THREE.Mesh(sigBldgGeo, villageMat);
    cotMesh.position.set(cotX, cotY - 0.1, cotZ);
    cotMesh.rotation.y = 0.42;
    cotMesh.scale.setScalar(1.05);
    cotMesh.castShadow = true;
    cotMesh.receiveShadow = true;
    zoneStaticGroup.add(cotMesh);
    aimRaycastMeshes.push(cotMesh);
    zoneStaticRaycastMeshes.push(cotMesh);
    const staticCotObj = { mesh: cotMesh, x: cotX, y: cotY, z: cotZ, radius: 5.4, height: 6.6, isRuin: false, type: 'house' };
    worldBuildings.push(staticCotObj);
    worldObstacles.push(staticCotObj);
    zoneStaticBuildings.push(staticCotObj);
    zoneStaticObstacles.push(staticCotObj);

    // 3. Signature Tactical Cover Rock Formation near Spawn at (-19.0, 22.0)
    const sigRockX = -19.0;
    const sigRockZ = 22.0;
    const sigRockY = getTerrainHeight(sigRockX, sigRockZ);
    const sigRGeo = (currentZoneIndex === 1) ? sharedSandstoneRockGeo
                  : (currentZoneIndex === 2) ? sharedMountainRockGeo
                  : sharedRockGeo;
    const sigRMat = (currentZoneIndex === 1) ? desertRockMat
                  : (currentZoneIndex === 2) ? mountainRockMat
                  : rockMat;
    const sigRockMesh = new THREE.Mesh(sigRGeo, sigRMat);
    sigRockMesh.position.set(sigRockX, sigRockY - 0.25, sigRockZ);
    sigRockMesh.rotation.y = 0.85;
    sigRockMesh.scale.set(1.2, 1.2, 1.2);
    sigRockMesh.castShadow = true;
    sigRockMesh.receiveShadow = true;
    zoneStaticGroup.add(sigRockMesh);
    aimRaycastMeshes.push(sigRockMesh);
    zoneStaticRaycastMeshes.push(sigRockMesh);
    const sigRockObj = { mesh: sigRockMesh, x: sigRockX, y: sigRockY, z: sigRockZ, radius: 5.8, height: 4.8, type: 'rock' };
    const sigRockBldg = { x: sigRockX, z: sigRockZ, radius: 5.8, isRuin: false, isRock: true };
    worldBuildings.push(sigRockBldg);
    worldObstacles.push(sigRockObj);
    zoneStaticBuildings.push(sigRockBldg);
    zoneStaticObstacles.push(sigRockObj);

    // 4. Desert Oasis / Alpine Tarn / Hills Pond Shoreline Landmark Trees
    if (currentZoneIndex === 1) {
        // Ring of lush Date Palms framing the Desert Oasis at (58, 78)
        for (let p = 0; p < 8; p++) {
            const ang = (p / 8) * Math.PI * 2.0 + 0.25;
            const rad = 36.0 + (p % 2) * 5.0;
            const px = 58.0 + Math.cos(ang) * rad;
            const pz = 78.0 + Math.sin(ang) * rad;
            if (getRoadFactor(px, pz) > 0.2) continue;
            const py = getTerrainHeight(px, pz);
            const pScale = 0.95 + (p % 3) * 0.18;
            const pGroup = new THREE.Group();
            pGroup.position.set(px, py, pz);
            pGroup.scale.setScalar(pScale);
            const pMesh = new THREE.Mesh(sharedPalmGeo, treeMaterial);
            pMesh.castShadow = true;
            pMesh.receiveShadow = true;
            pMesh.customDepthMaterial = getTreeDepthMaterial();
            pGroup.add(pMesh);
            zoneStaticGroup.add(pGroup);
            aimRaycastMeshes.push(pMesh);
            zoneStaticRaycastMeshes.push(pMesh);
            const palmObj = {
                id: `oasis:palm:${p}`,
                group: pGroup,
                mesh: pMesh,
                phase: p * 0.7,
                x: px, y: py, z: pz,
                scale: pScale,
                isFallen: false, fallAngle: 0, angularVel: 0,
                maxFallAngle: Math.PI * 0.48,
                fallAxis: new THREE.Vector3(1, 0, 0),
                radius: 1.3 * pScale,
                trunkHeight: 11.5 * pScale,
                type: 'palm'
            };
            swayTrees.push(palmObj);
            zoneStaticTrees.push(palmObj);
        }
    }

    // 5. Rising Battlefield Smoke Plumes
    if (sharedSmokeTex) {
        const smokeOrigins = [
            { x: -32.0, z: 125.0, count: 8, mult: 1.1 },
            { x: -14.0, z: 135.0, count: 7, mult: 0.9 }
        ];
        smokeOrigins.forEach(so => {
            const sy = getTerrainHeight(so.x, so.z);
            for (let p = 0; p < so.count; p++) {
                const sMat = new THREE.SpriteMaterial({
                    map: sharedSmokeTex,
                    transparent: true,
                    depthWrite: false,
                    opacity: 0.45
                });
                const s = new THREE.Sprite(sMat);
                zoneStaticGroup.add(s);
                const puffObj = {
                    sprite: s,
                    originX: so.x + (Math.random() - 0.5) * 2.5,
                    originY: sy + 1.5,
                    originZ: so.z + (Math.random() - 0.5) * 2.5,
                    age: p / so.count,
                    speed: (0.035 + Math.random() * 0.012) / so.mult,
                    scaleMult: so.mult,
                    seed: Math.random() * 100
                };
                activeSmokePuffs.push(puffObj);
                zoneStaticSmokePuffs.push(puffObj);
            }
        });
    }
}

function buildEnvironment(scene) {
    initEnvironment(scene || window.scene);

    for (const chunk of activeChunks.values()) {
        chunk.dispose();
    }
    activeChunks.clear();
    activeChunkCenterX = null;
    activeChunkCenterZ = null;
    chunkLoadQueue.length = 0;
    chunkLoadSet.clear();
    chunkUnloadQueue.length = 0;
    aimRaycastMeshes.length = 0;
    activeSmokePuffs.length = 0;
    activeFireSprites.length = 0;
    swayTrees.length = 0;
    targets.length = 0;
    worldBuildings.length = 0;
    worldObstacles.length = 0;

    const currentScene = scene || window.scene;

    if (environmentMode === 'studio') {
        currentScene.background.setHex(0xf3f5f8);
        currentScene.fog.color.setHex(0xf3f5f8);
        currentScene.fog.density = 0.002;

        const studioGeo = new THREE.PlaneGeometry(360, 360);
        studioGeo.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(studioGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
        floor.receiveShadow = true;
        envGroup.add(floor);
        aimRaycastMeshes.push(floor);
        terrainMeshRef = floor;
        window.terrainMeshRef = floor;
        return;
    }

    currentScene.background.setHex(currentZoneConfig ? currentZoneConfig.fogColor : 0xc7d4e0);
    currentScene.fog.color.setHex(currentZoneConfig ? currentZoneConfig.fogColor : 0xc2d0dc);
    currentScene.fog.density = currentZoneConfig ? currentZoneConfig.fogDensity : 0.00085;

    if (window.createMaldiveSkyDome) {
        const skyData = window.createMaldiveSkyDome();
        skyDome = skyData.skyMesh;
        skyMat = skyData.skyMat;
        window.skyDome = skyDome;
        window.skyMat = skyMat;
        envGroup.add(skyDome);
    }

    // High-Performance Botanical Texture-Atlas Grass & Wildflower System
    if (!grassLOD0Mesh) {
        const tuftGeo = createCrossedTuftGeometry();
        const billboardGeo = createBillboardTuftGeometry();

        const isMobile = (typeof window.isMobileBrowser === "function" && window.isMobileBrowser()) || (typeof window.isMobileDevice === "function" && window.isMobileDevice());
        const tuftCount = isMobile ? 5000 : 16000;
        const midCount  = isMobile ? 3500 : 10000;
        const farPatchSize = isMobile ? 384.0 : 760.0;
        const farMaxRadius = isMobile ? 195.0 : 380.0;
        const farCount     = isMobile ? 0 : 16000;

        grassLOD0Mesh = createTexturedToroidalGrass(tuftGeo, tuftCount, 96.0, 0.0, 48.0, false);
        grassLOD0MidMesh = createTexturedToroidalGrass(tuftGeo, midCount, 192.0, 48.0, 98.0, false);
        grassLOD0FarMesh = farCount > 0 ? createTexturedToroidalGrass(billboardGeo, farCount, farPatchSize, 98.0, farMaxRadius, true) : new THREE.Group();
        grassLOD1Mesh = grassLOD0MidMesh;

        const closeBillboardCount = isMobile ? 3000 : 8000;
        grassBillboardCloseMesh = createTexturedToroidalGrass(billboardGeo, closeBillboardCount, 196.0, 0.0, 98.0, true);
        grassBillboardCloseMesh.visible = false;

        envGroup.add(grassLOD0Mesh);
        envGroup.add(grassLOD0MidMesh);
        envGroup.add(grassBillboardCloseMesh);
        if (farCount > 0) envGroup.add(grassLOD0FarMesh);

        grassMeshRef = grassLOD0Mesh;
        window.grassLOD0Mesh = grassLOD0Mesh;
        window.grassLOD0MidMesh = grassLOD0MidMesh;
        window.grassLOD0FarMesh = grassLOD0FarMesh;
        window.grassBillboardCloseMesh = grassBillboardCloseMesh;
        window.grassLOD1Mesh = grassLOD1Mesh;
        window.grassMeshRef = grassMeshRef;
    }

    if (!waterMeshRef) {
        waterMeshRef = createCoastalOceanMesh();
        envGroup.add(waterMeshRef);
        window.waterMeshRef = waterMeshRef;
    }

    setWorldSeed(currentSeed, currentZone);
    rebuildZoneStaticProps();

    updateTerrainChunks(0, 0, true);
    if (typeof window.spawnZoneEnemies === 'function') {
        window.spawnZoneEnemies();
    } else if (typeof window.spawnInitialFieldEnemies === 'function') {
        window.spawnInitialFieldEnemies();
    }
}

function updateEnvironment(dt, tankState) {
    if (environmentMode === 'studio') return;

    const timeSec = performance.now() * 0.001;
    terrainUniforms.uTime.value = timeSec;
    grassUniforms.uTime.value = timeSec;

    if (window.celestialLighting) {
        terrainUniforms.uSunDir.value.copy(window.celestialLighting.sunDirection.value);
        terrainUniforms.uSunColor.value.copy(window.celestialLighting.sunColor.value);
        terrainUniforms.uSkyColor.value.copy(window.celestialLighting.skyColor.value);
    }

    const px = (tankState && tankState.x !== undefined) ? tankState.x : 0;
    const pz = (tankState && tankState.z !== undefined) ? tankState.z : 0;

    const cam = window.activeCamera;
    const cx = (cam && cam.position && !isNaN(cam.position.x)) ? cam.position.x : px;
    const cz = (cam && cam.position && !isNaN(cam.position.z)) ? cam.position.z : pz;

    terrainUniforms.uCameraPos.value.set(cx, 0, cz);
    grassUniforms.uCameraPos.value.set(cx, 0, cz);

    if (cam) {
        const camDir = new THREE.Vector3();
        cam.getWorldDirection(camDir);
        const fwdXZ = new THREE.Vector2(camDir.x, camDir.z).normalize();
        grassUniforms.uCameraForwardXZ.value.copy(fwdXZ);
        terrainUniforms.uCameraForwardXZ.value.copy(fwdXZ);
    }

    if (waterMeshRef && waterMeshRef.material && waterMeshRef.material.uniforms && waterMeshRef.material.uniforms.uTime) {
        waterMeshRef.material.uniforms.uTime.value = timeSec;
    }

    // Update building positions near player for real-time grass & terrain contact culling
    const nearBldgs = [];
    for (let b = 0; b < worldBuildings.length; b++) {
        const bldg = worldBuildings[b];
        const dx = bldg.x - px;
        const dz = bldg.z - pz;
        if (dx * dx + dz * dz < 140 * 140) {
            nearBldgs.push(bldg);
            if (nearBldgs.length >= 32) break;
        }
    }
    const bArr = grassUniforms.uBuildings.value;
    for (let i = 0; i < 32; i++) {
        if (i < nearBldgs.length) {
            bArr[i].set(nearBldgs[i].x, nearBldgs[i].z, nearBldgs[i].radius, 1.0);
        } else {
            bArr[i].set(0, 0, 0, 0);
        }
    }
    grassUniforms.uBuildingCount.value = nearBldgs.length;
    terrainUniforms.uBuildingCount.value = nearBldgs.length;

    updateTerrainChunks(px, pz);
    processChunkStreamingQueue(3.5);

    // Animate active fire sprites and smoke plumes
    for (let i = 0; i < activeFireSprites.length; i++) {
        const f = activeFireSprites[i];
        const flicker = Math.sin(timeSec * 12.0 + f.phase);
        const s = f.baseScale * (1.0 + flicker * 0.12);
        f.sprite.scale.set(s, s * 0.85, 1);
        f.sprite.material.opacity = 0.9 + flicker * 0.1;
    }

    for (let i = 0; i < activeSmokePuffs.length; i++) {
        const p = activeSmokePuffs[i];
        p.age += p.speed * dt;
        if (p.age > 1.0) p.age -= 1.0;

        const y = p.originY + p.age * 22.0 * p.scaleMult;
        const x = p.originX + Math.sin(p.age * 4.0 + p.seed) * 2.5 * p.scaleMult + p.age * 4.0;
        const z = p.originZ + Math.cos(p.age * 4.0 + p.seed) * 2.5 * p.scaleMult;
        const sc = (3.0 + p.age * 12.0) * p.scaleMult;

        p.sprite.position.set(x, y, z);
        p.sprite.scale.set(sc, sc, 1);
        p.sprite.material.opacity = (1.0 - p.age) * 0.42;
    }
}

// ============================================================================
// 11. GAME RESTART & ZONE CYCLING (NEW SEED & RANDOM ZONE ON EACH RESTART)
// ============================================================================
function restartGame(customSeed, customZone) {
    const seed = (customSeed !== undefined && customSeed !== null)
        ? customSeed
        : Math.floor(Math.random() * 900000) + 100000;

    let nextZone = customZone;
    if (!nextZone || !ZONE_CONFIGS[nextZone]) {
        // Pick a random zone, preferring a different zone from the current one so each restart feels fresh
        const otherZones = ALL_ZONES.filter(z => z !== currentZone);
        nextZone = otherZones[Math.floor(Math.random() * otherZones.length)] || ALL_ZONES[0];
    }

    setWorldSeed(seed, nextZone);
    rebuildZoneStaticProps();

    if (window.tankState) {
        window.tankState.x = 0;
        window.tankState.z = 0;
        window.tankState.heading = 0;
        window.tankState.speed = 0;
        window.tankState.turnRate = 0;
        window.tankState.pitch = 0;
        window.tankState.roll = 0;
        window.tankState.pitchVel = 0;
        window.tankState.rollVel = 0;
        window.tankState.heave = 0;
        window.tankState.heaveVel = 0;
        window.tankState.turretYaw = 0;
        window.tankState.gunElevation = 0;
        window.tankState.targetTurretYaw = 0;
        window.tankState.targetGunElevation = 0;
        window.tankState.hitsCount = 0;
        window.tankState.reloadTimer = 0;
        window.tankState.mgHeat = 0;
        window.tankState.isKnockedOut = false;

        const spawnY = getTerrainHeight(0, 0);
        window.tankState.y = spawnY;

        if (window.tankRoot) {
            window.tankRoot.position.set(0, spawnY, 0);
            window.tankRoot.rotation.y = 0;
        }
        if (window.turretGroup) {
            if (window.turretGroup.userData && window.turretGroup.userData.basePos) {
                window.turretGroup.position.copy(window.turretGroup.userData.basePos);
            }
            window.turretGroup.rotation.x = 0;
            window.turretGroup.rotation.z = 0;
        }
        if (window.gunElevationPivot) {
            window.gunElevationPivot.rotation.x = 0;
        }
    }

    if (window.camOrbit) {
        window.camOrbit.theta = Math.PI + 0.38;
        window.camOrbit.phi = 1.42;
        window.camOrbit.distance = 10.5;
    }

    for (const chunk of activeChunks.values()) {
        chunk.dispose();
    }
    activeChunks.clear();
    activeChunkCenterX = null;
    activeChunkCenterZ = null;
    chunkLoadQueue.length = 0;
    chunkLoadSet.clear();
    chunkUnloadQueue.length = 0;
    updateTerrainChunks(0, 0, true);
    if (typeof window.resetEnemyTanks === 'function') window.resetEnemyTanks();
    if (typeof window.resetPlayerHealth === 'function') window.resetPlayerHealth();
    if (typeof window.resetSoldiers === 'function') window.resetSoldiers();
    if (typeof window.resetPlayerSoldier === 'function') window.resetPlayerSoldier();
    if (typeof window.hideKnockoutModal === 'function') window.hideKnockoutModal();

    const ALL_CAMPAIGNS = ['tiger', 'sherman', 't34'];
    const randCampaign = ALL_CAMPAIGNS[Math.floor(Math.random() * ALL_CAMPAIGNS.length)];
    if (typeof window.switchTank === 'function') {
        window.switchTank(randCampaign);
    }

    const seedEl = document.getElementById('hud-seed-display');
    if (seedEl) seedEl.textContent = `${currentZoneConfig.shortName} · Seed: ${seed}`;

    if (typeof window.showKillFeedBanner === 'function' && currentZoneConfig) {
        window.showKillFeedBanner(currentZoneConfig.banner, '#fbbf24');
    }

    console.log(`[TankClash] New Battlefield Generated — Zone: ${currentZoneConfig.name} (${nextZone}), Seed: ${seed}`);
}

function setZone(zoneId) {
    if (!ZONE_CONFIGS[zoneId]) return;
    restartGame(null, zoneId);
}

function cycleZone() {
    const idx = ALL_ZONES.indexOf(currentZone);
    const nextZone = ALL_ZONES[(idx + 1) % ALL_ZONES.length];
    restartGame(null, nextZone);
}
window.setZone = setZone;
window.cycleZone = cycleZone;

// ============================================================================
// EXPORTS & WINDOW ATTACHMENTS
// ============================================================================
// ============================================================================
// GRASS DISPLAY TOGGLE & QUALITY SYSTEM
// ============================================================================
let currentGrassMode = 'high'; // 'high', 'low', 'off'

function setGrassMode(mode) {
    currentGrassMode = mode;

    if (mode === 'high') {
        if (grassLOD0Mesh) grassLOD0Mesh.visible = true;
        if (grassLOD0MidMesh) grassLOD0MidMesh.visible = true;
        if (grassBillboardCloseMesh) grassBillboardCloseMesh.visible = false;
        if (grassLOD0FarMesh) grassLOD0FarMesh.visible = true;
    } else if (mode === 'low') {
        // Lowest res tier billboard grass covers ground instead of nothing
        if (grassLOD0Mesh) grassLOD0Mesh.visible = false;
        if (grassLOD0MidMesh) grassLOD0MidMesh.visible = false;
        if (grassBillboardCloseMesh) grassBillboardCloseMesh.visible = true;
        if (grassLOD0FarMesh) grassLOD0FarMesh.visible = true;
    } else if (mode === 'off') {
        if (grassLOD0Mesh) grassLOD0Mesh.visible = false;
        if (grassLOD0MidMesh) grassLOD0MidMesh.visible = false;
        if (grassBillboardCloseMesh) grassBillboardCloseMesh.visible = false;
        if (grassLOD0FarMesh) grassLOD0FarMesh.visible = false;
    }

    // Update HUD button label & styling
    const labelEl = document.getElementById('hud-grass-label');
    const btnEl = document.getElementById('btn-grass-toggle');
    if (labelEl) {
        if (mode === 'high') labelEl.textContent = 'Grass: High';
        else if (mode === 'low') labelEl.textContent = 'Grass: Low';
        else labelEl.textContent = 'Grass: Off';
    }
    if (btnEl) {
        if (mode === 'high') {
            btnEl.className = 'hud-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-300';
        } else if (mode === 'low') {
            btnEl.className = 'hud-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold text-amber-300';
        } else {
            btnEl.className = 'hud-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-400 opacity-60';
        }
    }
    console.log(`[Grass] Switched to mode: ${mode}`);
}

function isNonMobileDevice() {
    if (typeof window.isMobileBrowser === 'function' && window.isMobileBrowser()) return false;
    if (typeof window.isMobileDevice === 'function' && window.isMobileDevice()) return false;
    const ua = (navigator.userAgent || '').toLowerCase();
    const isMobileUA = /android|iphone|ipad|ipod|blackberry|mobile|tablet/i.test(ua);
    return !isMobileUA;
}
window.isNonMobileDevice = isNonMobileDevice;

function toggleGrass() {
    const nonMobile = isNonMobileDevice();
    if (nonMobile) {
        // On non-mobile device, make the ground always at least cover with lowest res tier billboard grass instead of nothing!
        // Toggle switches between High (3D tufts + far billboards) and Low (lowest res tier billboard grass everywhere)
        if (currentGrassMode === 'high') {
            setGrassMode('low');
        } else {
            setGrassMode('high');
        }
    } else {
        // On mobile devices, toggle between High and Off
        setGrassMode(currentGrassMode === 'off' ? 'high' : 'off');
    }
}
window.setGrassMode = setGrassMode;
window.toggleGrass = toggleGrass;
window.getGrassMode = () => currentGrassMode;
window.grassBillboardCloseMesh = grassBillboardCloseMesh;

window.environmentMode = environmentMode;
window.envGroup = envGroup;
window.chunksGroup = chunksGroup;
window.obstacles = obstacles;
window.targets = targets;
window.swayTrees = swayTrees;
window.worldBuildings = worldBuildings;
window.worldObstacles = worldObstacles;
window.terrainMeshRef = terrainMeshRef;
window.aimRaycastMeshes = aimRaycastMeshes;
window.waterMeshRef = waterMeshRef;
window.grassLOD0Mesh = grassLOD0Mesh;
window.grassLOD0MidMesh = grassLOD0MidMesh;
window.grassLOD0FarMesh = grassLOD0FarMesh;
window.grassLOD1Mesh = grassLOD1Mesh;
window.grassMeshRef = grassMeshRef;
window.skyDome = skyDome;
window.skyMat = skyMat;
window.terrainUniforms = terrainUniforms;
window.grassUniforms = grassUniforms;
window.updateSkyDome = updateSkyDome;
window.updateDaylightSystem = updateDaylightSystem;
window.getTerrainHeight = getTerrainHeight;
window.getTerrainNormal = getTerrainNormal;
window.getRoadDistance = getRoadDistance;
window.getRoadCenterX = getRoadCenterX;
window.getRoadFactor = getRoadFactor;
window.initEnvironment = initEnvironment;
window.buildEnvironment = buildEnvironment;
window.updateEnvironment = updateEnvironment;
window.restartGame = restartGame;
window.setWorldSeed = setWorldSeed;
window.currentSeed = currentSeed;
