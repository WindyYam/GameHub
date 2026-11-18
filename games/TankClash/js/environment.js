// ============================================================================
// World War 2 Simulator — Procedural Infinite Battlefield Environment
// Features:
// - Infinite Chunk-Based Procedural Terrain Streaming around Tank
// - Smooth & Uniform Toroidal Grass Distribution (Stratified Grid, Zero Bald Patches)
// - Accurate Terrain Height Alignment (1:1 Synchronized CPU & GPU Height Functions)
// - Dynamic Grass Culling on Roads, Cottages, Ruins, Rocks & Spawn Clearing
// - Reverted to Authentic Maldive Celestial Sky Dome (Milky Way, Stars, Moon, Clouds)
// - Detailed Botanical Multi-Bough Spruce & Forked Deciduous Trees
// - European Timber-Framed Cottages & Smoldering War Ruins with Smoke Plumes
// - Deterministic Seeded PRNG with Session Persistence & 'R' Restart
// - Large seeded landscape zones with smoothly blended terrain
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
var sessionFallenTreesMeta = new Map();
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
        fogColor: 0xbacfe2,
        fogDensity: 0.00084,
        dayHorizonTint: 0x8ebce0,
        groundDayTint: 0x9c826b,
        trackDustColor: 0xb89f86
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
    },
    winter: {
        id: 'winter',
        typeIndex: 4,
        name: 'Ardennes Winter',
        shortName: 'Winter',
        icon: '❄️',
        banner: '❄️ ZONE: ARDENNES WINTER & FROZEN STEPPE',
        fogColor: 0xd0e0ec,
        fogDensity: 0.00092,
        dayHorizonTint: 0x9bc2e8,
        groundDayTint: 0xd8e4f0,
        trackDustColor: 0xd0dce6
    },
    bocage: {
        id: 'bocage',
        typeIndex: 5,
        name: 'Normandy Bocage',
        shortName: 'Bocage',
        icon: '🌾',
        banner: '🌾 ZONE: NORMANDY BOCAGE & SUNKEN LANES',
        fogColor: 0xc4d4c2,
        fogDensity: 0.00088,
        dayHorizonTint: 0x86b4dc,
        groundDayTint: 0x486e2e,
        trackDustColor: 0x4c3a26
    },
    monument: {
        id: 'monument',
        typeIndex: 6,
        name: 'Monument Valley',
        shortName: 'Monument',
        icon: '🏜️',
        banner: '🏜️ ZONE: ARIZONA MONUMENT VALLEY & RED SANDSTONE BUTTES',
        fogColor: 0xdfb498,
        fogDensity: 0.00080,
        dayHorizonTint: 0xd48962,
        groundDayTint: 0xb44426,
        trackDustColor: 0xc85a32
    },
    canyon: {
        id: 'canyon',
        typeIndex: 7,
        name: 'Grand Canyon',
        shortName: 'Canyon',
        icon: '🏞️',
        banner: '🏞️ ZONE: GRAND CANYON GORGE & TERRACED CHASMS',
        fogColor: 0xd6c2b0,
        fogDensity: 0.00078,
        dayHorizonTint: 0xc68e6e,
        groundDayTint: 0x8c5438,
        trackDustColor: 0xa46e50
    },
    egypt: {
        id: 'egypt',
        typeIndex: 8,
        name: 'Ancient Egypt',
        shortName: 'Egypt',
        icon: '🏛️',
        banner: '🏛️ ZONE: ANCIENT EGYPT & THE GREAT PYRAMIDS',
        fogColor: 0xe8d8be,
        fogDensity: 0.00075,
        dayHorizonTint: 0xf0c888,
        groundDayTint: 0xd4aa66,
        trackDustColor: 0xe0be80
    },
    jungle: {
        id: 'jungle',
        typeIndex: 9,
        name: 'Tropical Jungle',
        shortName: 'Jungle',
        icon: '🌴',
        banner: '🌴 ZONE: PACIFIC TROPICAL JUNGLE & RAINFOREST',
        fogColor: 0xb8c2a8,
        fogDensity: 0.00115,
        dayHorizonTint: 0x8fa98c,
        groundDayTint: 0x4a5230,
        trackDustColor: 0x3e3220
    },
    greece: {
        id: 'greece',
        typeIndex: 10,
        name: 'Ancient Greece',
        shortName: 'Greece',
        icon: '🏛️',
        banner: '🏛️ ZONE: ANCIENT GREECE & ACROPOLIS PARTHENON',
        fogColor: 0xc8dff0,
        fogDensity: 0.00075,
        dayHorizonTint: 0x7ec0ee,
        groundDayTint: 0x869262,
        trackDustColor: 0xc8be9e
    },
    rome: {
        id: 'rome',
        typeIndex: 11,
        name: 'Ancient Rome',
        shortName: 'Rome',
        icon: '🦅',
        banner: '🦅 ZONE: IMPERIAL ROME, COLOSSEUM & PANTHEON',
        fogColor: 0xdccab8,
        fogDensity: 0.00078,
        dayHorizonTint: 0xd8a878,
        groundDayTint: 0x68763e,
        trackDustColor: 0xb89672
    }
};
Object.defineProperty(ZONE_CONFIGS, 'roma', {
    value: ZONE_CONFIGS.rome,
    enumerable: false,
    configurable: true
});

const ALL_ZONES = ['meadow', 'desert', 'mountain', 'hills', 'winter', 'bocage', 'monument', 'canyon', 'egypt', 'jungle', 'greece', 'rome'];
var initialRandomZoneIndex = Math.floor(Math.random() * ALL_ZONES.length);
var currentZone = ALL_ZONES[initialRandomZoneIndex];
var currentZoneIndex = initialRandomZoneIndex;
var currentZoneConfig = ZONE_CONFIGS[currentZone];
var spawnZoneIndex = initialRandomZoneIndex;

try {
    const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
    const rawZone = urlParams ? urlParams.get('zone') : null;
    const requestedZone = (rawZone === 'roma') ? 'rome' : rawZone;
    if (requestedZone && ZONE_CONFIGS[requestedZone]) {
        initialRandomZoneIndex = ZONE_CONFIGS[requestedZone].typeIndex;
        currentZone = ZONE_CONFIGS[requestedZone].id;
        currentZoneIndex = initialRandomZoneIndex;
        currentZoneConfig = ZONE_CONFIGS[currentZone];
        spawnZoneIndex = initialRandomZoneIndex;
    }
} catch (e) {}

window.ZONE_CONFIGS = ZONE_CONFIGS;
window.ALL_ZONES = ALL_ZONES;
window.currentZone = currentZone;
window.currentZoneIndex = currentZoneIndex;
window.currentZoneConfig = currentZoneConfig;
window.spawnZoneIndex = spawnZoneIndex;

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
    if (terrainUniforms && terrainUniforms.uSpawnZone) {
        terrainUniforms.uSpawnZone.value = spawnZoneIndex;
    }
    if (grassUniforms && grassUniforms.uZoneType) {
        grassUniforms.uZoneType.value = currentZoneIndex;
    }
    if (grassUniforms && grassUniforms.uSpawnZone) {
        grassUniforms.uSpawnZone.value = spawnZoneIndex;
    }
    if (waterMeshRef) {
        if (waterMeshRef.material && waterMeshRef.material.uniforms) {
            if (waterMeshRef.material.uniforms.uZoneType) {
                waterMeshRef.material.uniforms.uZoneType.value = currentZoneIndex;
            }
            if (waterMeshRef.material.uniforms.uSpawnZone) {
                waterMeshRef.material.uniforms.uSpawnZone.value = spawnZoneIndex;
            }
        }
    }

    const zoneLabelEl = document.getElementById('hud-zone-label');
    if (zoneLabelEl && currentZoneConfig) {
        zoneLabelEl.textContent = `Zone: ${currentZoneConfig.shortName}`;
    }
    const zoneIconEl = document.getElementById('hud-zone-icon');
    if (zoneIconEl && currentZoneConfig) {
        zoneIconEl.textContent = currentZoneConfig.icon;
    }
}

function setCurrentZone(zoneIndex) {
    currentZoneIndex = zoneIndex;
    currentZone = ALL_ZONES[zoneIndex];
    currentZoneConfig = ZONE_CONFIGS[currentZone];
    window.currentZone = currentZone;
    window.currentZoneIndex = currentZoneIndex;
    window.currentZoneConfig = currentZoneConfig;
    syncZoneUniformsAndHUD();
}

function setWorldSeed(seed, targetSpawnZone) {
    currentSeed = seed;
    window.currentSeed = currentSeed;
    seedOffset.x = (currentSeed % 289);
    seedOffset.z = ((Math.floor(currentSeed / 289)) % 289);
    roadBaseX = Math.sin(seedOffset.z * 0.009) * 32.0 + Math.cos(seedOffset.z * 0.021) * 12.0 + Math.sin(seedOffset.z * 0.0035) * 20.0;
    road2BaseZ = Math.sin(seedOffset.x * 0.010) * 22.0 + Math.cos(seedOffset.x * 0.022) * 8.0;
    road3BaseX = Math.sin(seedOffset.z * 0.014) * 20.0 + Math.cos(seedOffset.z * 0.028) * 7.0;
    road4BaseX = Math.sin(seedOffset.z * 0.012) * 18.0 + Math.cos(seedOffset.z * 0.025) * 6.0;

    if (targetSpawnZone !== undefined && targetSpawnZone !== null) {
        if (typeof targetSpawnZone === 'string') {
            const normZone = (targetSpawnZone === 'roma') ? 'rome' : targetSpawnZone;
            spawnZoneIndex = (ZONE_CONFIGS[normZone] ? ZONE_CONFIGS[normZone].typeIndex : 0);
        } else {
            const maxIdx = (typeof ALL_ZONES !== 'undefined' && ALL_ZONES.length) ? ALL_ZONES.length - 1 : 11;
            spawnZoneIndex = Math.max(0, Math.min(maxIdx, Math.floor(targetSpawnZone)));
        }
    } else {
        spawnZoneIndex = 0;
    }
    window.spawnZoneIndex = spawnZoneIndex;

    if (terrainUniforms && terrainUniforms.uSeedOffset) {
        terrainUniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        terrainUniforms.uRoadBaseX.value = roadBaseX;
        terrainUniforms.uRoad2BaseZ.value = road2BaseZ;
        terrainUniforms.uRoad3BaseX.value = road3BaseX;
        terrainUniforms.uRoad4BaseX.value = road4BaseX;
        if (terrainUniforms.uSpawnZone) terrainUniforms.uSpawnZone.value = spawnZoneIndex;
    }
    if (grassUniforms && grassUniforms.uSeedOffset) {
        grassUniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        grassUniforms.uRoadBaseX.value = roadBaseX;
        grassUniforms.uRoad2BaseZ.value = road2BaseZ;
        grassUniforms.uRoad3BaseX.value = road3BaseX;
        grassUniforms.uRoad4BaseX.value = road4BaseX;
        if (grassUniforms.uSpawnZone) grassUniforms.uSpawnZone.value = spawnZoneIndex;
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
        if (waterMeshRef.material.uniforms.uSpawnZone) {
            waterMeshRef.material.uniforms.uSpawnZone.value = spawnZoneIndex;
        }
    }

    setCurrentZone(spawnZoneIndex);
    sessionFallenTrees.clear();
    sessionFallenTreesMeta.clear();
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

const ZONE_SIZE = 1600;

function getZoneGrid(x, z) {
    return [
        (x + Math.sin(z * 0.0014 + seedOffset.z * 0.017) * 130) / ZONE_SIZE,
        (z + Math.sin(x * 0.0014 + seedOffset.x * 0.017) * 130) / ZONE_SIZE
    ];
}

function getZoneCenter(x, z) {
    const [gx, gz] = getZoneGrid(x, z);
    return [Math.floor(gx + 0.5) * ZONE_SIZE, Math.floor(gz + 0.5) * ZONE_SIZE];
}

function getZoneWeights(x, z) {
    const [gx, gz] = getZoneGrid(x, z);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const tx = smoothstep(0.4, 0.6, gx - ix);
    const tz = smoothstep(0.4, 0.6, gz - iz);
    const numZones = (typeof ALL_ZONES !== 'undefined' && ALL_ZONES.length) ? ALL_ZONES.length : 12;
    const weights = new Array(numZones).fill(0);
    const sz = (typeof spawnZoneIndex !== 'undefined') ? spawnZoneIndex : 0;
    const add = (cx, cz, weight) => {
        if (weight === 0) return;
        const zone = (cx === 0 && cz === 0)
            ? sz
            : Math.min(numZones - 1, Math.floor(hash2D(cx + seedOffset.x, cz + seedOffset.z) * numZones));
        weights[zone] += weight;
    };
    add(ix, iz, (1 - tx) * (1 - tz));
    add(ix + 1, iz, tx * (1 - tz));
    add(ix, iz + 1, (1 - tx) * tz);
    add(ix + 1, iz + 1, tx * tz);
    return weights;
}

function getZoneIndexAt(x, z) {
    const weights = getZoneWeights(x, z);
    let zone = 0;
    for (let i = 1; i < weights.length; i++) {
        if (weights[i] > weights[zone]) zone = i;
    }
    return zone;
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
    uniform int uSpawnZone;

    float mod289_gpu(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289_gpu(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    float permute_gpu(float x) { return mod289_gpu(((x * 34.0) + 1.0) * x); }
    vec2 permute_gpu(vec2 x) { return mod289_gpu(((x * 34.0) + 1.0) * x); }

    float hash2D_gpu(vec2 p) {
        vec2 ip = floor(p);
        return permute_gpu(permute_gpu(ip.x) + ip.y) * (1.0 / 288.0);
    }

    float getZoneCellId_gpu(vec2 cell) {
        if (cell.x == 0.0 && cell.y == 0.0) return float(uSpawnZone);
        return min(11.0, floor(hash2D_gpu(cell + uSeedOffset) * 12.0));
    }

    vec2 getZoneGrid_gpu(vec2 pos) {
        vec2 warp = vec2(sin(pos.y * 0.0014 + uSeedOffset.y * 0.017),
                         sin(pos.x * 0.0014 + uSeedOffset.x * 0.017)) * 130.0;
        return (pos + warp) / 1600.0;
    }

    void getZoneWeights12_gpu(vec2 pos, out float w[12]) {
        for (int i = 0; i < 12; i++) w[i] = 0.0;
        vec2 grid = getZoneGrid_gpu(pos);
        vec2 cell = floor(grid);
        vec2 t = smoothstep(vec2(0.4), vec2(0.6), fract(grid));

        int z00 = int(getZoneCellId_gpu(cell) + 0.5);
        int z10 = int(getZoneCellId_gpu(cell + vec2(1.0, 0.0)) + 0.5);
        int z01 = int(getZoneCellId_gpu(cell + vec2(0.0, 1.0)) + 0.5);
        int z11 = int(getZoneCellId_gpu(cell + vec2(1.0, 1.0)) + 0.5);

        w[z00] += (1.0 - t.x) * (1.0 - t.y);
        w[z10] += t.x * (1.0 - t.y);
        w[z01] += (1.0 - t.x) * t.y;
        w[z11] += t.x * t.y;
    }

    void getZoneWeights10_gpu(vec2 pos, out float w[10]) {
        float w12[12];
        getZoneWeights12_gpu(pos, w12);
        for (int i = 0; i < 10; i++) w[i] = w12[i];
    }

    void getZoneWeights6_gpu(vec2 pos, out float w[6]) {
        float w12[12];
        getZoneWeights12_gpu(pos, w12);
        for (int i = 0; i < 6; i++) w[i] = w12[i];
    }

    int getZoneIndex12_gpu(float w[12]) {
        int best = 0;
        float maxW = w[0];
        for (int i = 1; i < 12; i++) {
            if (w[i] > maxW) {
                maxW = w[i];
                best = i;
            }
        }
        return best;
    }

    int getZoneIndex10_gpu(float w[10]) {
        int best = 0;
        float maxW = w[0];
        for (int i = 1; i < 10; i++) {
            if (w[i] > maxW) {
                maxW = w[i];
                best = i;
            }
        }
        return best;
    }

    int getZoneIndex6_gpu(float w[6]) {
        int best = 0;
        float maxW = w[0];
        for (int i = 1; i < 6; i++) {
            if (w[i] > maxW) {
                maxW = w[i];
                best = i;
            }
        }
        return best;
    }

    vec4 getZoneWeights_gpu(vec2 pos) {
        float w[6];
        getZoneWeights6_gpu(pos, w);
        return vec4(w[0], w[1], w[2], w[3]);
    }

    int getZoneIndex_gpu(vec4 weights) {
        int zone = 0;
        float best = weights.x;
        if (weights.y > best) { zone = 1; best = weights.y; }
        if (weights.z > best) { zone = 2; best = weights.z; }
        if (weights.w > best) { zone = 3; }
        return zone;
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

    float getRiverDistance_gpu(float x, float z) {
        // River 1: East-West Meandering Valley River (passing through z = -64 at x = 0)
        float riv1BaseZ = sin(uSeedOffset.x * 0.0075) * 26.0 + cos(uSeedOffset.x * 0.017) * 11.0 + sin(uSeedOffset.x * 0.0032) * 18.0;
        float riv1Z = -64.0 + (sin((x + uSeedOffset.x) * 0.0075) * 26.0 + cos((x + uSeedOffset.x) * 0.017) * 11.0 + sin((x + uSeedOffset.x) * 0.0032) * 18.0) - riv1BaseZ;
        float dRiv1 = abs(z - riv1Z) * 0.90;

        // River 2: Eastern North-South Meandering River (passing through x = 128 at z = 0, emptying to +Z ocean)
        float riv2BaseX = sin(uSeedOffset.y * 0.0070) * 28.0 + cos(uSeedOffset.y * 0.016) * 12.0 + sin(uSeedOffset.y * 0.0028) * 18.0;
        float riv2X = 128.0 + (sin((z + uSeedOffset.y) * 0.0070) * 28.0 + cos((z + uSeedOffset.y) * 0.016) * 12.0 + sin((z + uSeedOffset.y) * 0.0028) * 18.0) - riv2BaseX;
        float dRiv2 = abs(x - riv2X) * 0.90;

        // River 3: Western North-South Tributary River (passing through x = -128 at z = 0, emptying to +Z ocean)
        float riv3BaseX = sin(uSeedOffset.y * 0.0080 + 1.4) * 26.0 + cos(uSeedOffset.y * 0.018 + 0.8) * 11.0;
        float riv3X = -128.0 + (sin((z + uSeedOffset.y) * 0.0080 + 1.4) * 26.0 + cos((z + uSeedOffset.y) * 0.018 + 0.8) * 11.0) - riv3BaseX;
        float dRiv3 = abs(x - riv3X) * 0.90;

        // Smooth confluence blending between the main river and tributaries
        float d23 = min(dRiv2, dRiv3);
        float h = max(7.0 - abs(dRiv1 - d23), 0.0) / 7.0;
        return min(dRiv1, d23) - h * h * 7.0 * 0.25;
    }

    float getRiverFactor_gpu(float x, float z) {
        float dist = getRiverDistance_gpu(x, z);
        float halfWidth = 22.0;
        if (dist > halfWidth) return 0.0;
        float t = 1.0 - (dist / halfWidth);
        return t * t * (3.0 - 2.0 * t);
    }

    float getRiversideFactor_gpu(float x, float z) {
        float dist = getRiverDistance_gpu(x, z);
        return smoothstep(4.5, 8.2, dist) * (1.0 - smoothstep(13.5, 23.5, dist));
    }

    const float SEA_LEVEL = -2.5;

    float applyRiverTerrainHeight_gpu(float x, float z, float h, float dSpawn, float roadF) {
        float rivDist = getRiverDistance_gpu(x, z);
        if (rivDist >= 25.5) return h;
        vec2 s = vec2(x, z) + uSeedOffset;
        float bankWobble = sin(s.x * 0.043 + cos(s.y * 0.039) * 1.6) * 1.35;
        float effDist = max(0.0, rivDist + bankWobble);
        if (effDist >= 24.5) return h;

        float spawnProtect = smoothstep(26.0, 44.0, dSpawn);
        if (spawnProtect <= 0.001) return h;

        // Stage 1: Outer valley bank grades down to the riverside beach/cobblestone terrace (-1.15m)
        float shelfBlend = (1.0 - smoothstep(12.5, 24.5, effDist)) * spawnProtect;
        float carvedH = mix(h, min(h, -1.15), shelfBlend);

        // Stage 2: Gentle riverside terrace (7.8m..14.0m) sloping into the water channel (0..8.2m, bed at ~ -4.10m)
        float shoreSlope = 1.0 - smoothstep(7.8, 14.0, effDist);
        float bedRipple = sin(s.x * 0.08 + s.y * 0.07) * 0.15;
        float channelDepth = (1.0 - smoothstep(0.0, 8.2, effDist)) * (1.65 + bedRipple);
        float targetRiverH = -1.15 - shoreSlope * 1.30 - channelDepth;
        float innerBlend = (1.0 - smoothstep(7.5, 14.0, effDist)) * spawnProtect;
        carvedH = mix(carvedH, min(carvedH, targetRiverH), innerBlend);

        // Road-river crossing: shallow cobblestone ford / causeway so road vehicles & soldiers cross smoothly
        if (roadF > 0.01) {
            float fordH = -2.28 - roadF * 0.14;
            carvedH = mix(carvedH, max(carvedH, fordH), smoothstep(0.04, 0.55, roadF) * innerBlend);
        }
        return carvedH;
    }

    float getZone2Height_gpu(float x, float z, float dSpawn, float roadDist, float roadF, vec2 zoneCenter, float coastalDescent, float bayOpen) {
        vec2 s = vec2(x, z) + uSeedOffset;
        float valleyHills = fbm4_gpu(s * 0.0036) * 5.8;
        float foothillBumps = fbm3_gpu(s * 0.011) * 1.8;
        float microRock = valueNoise2D_gpu(s * 0.085) * 0.25;
        float h = 6.5 + valleyHills + foothillBumps + microRock;

        // Ridged Multifractal Alpine Peaks & Massifs flanking the passes (gentle slopes)
        float r1 = 1.0 - abs(valueNoise2D_gpu(s * 0.0042));
        float r2 = 1.0 - abs(valueNoise2D_gpu(s * 0.0090 + vec2(19.0, 31.0)));
        float ridgeCrest = (r1 * r1 * 0.72 + r2 * r2 * 0.28);
        float massifEnv = fbm3_gpu(s * 0.0032 + vec2(53.0, 17.0)) * 0.5 + 0.5;
        float baseMtn = pow(max(0.0, massifEnv), 1.35) * 32.0 + pow(ridgeCrest, 1.8) * 24.0;
        // Softened terracing so hills are gradual rather than sheer cliffs
        float terraceT = baseMtn / 6.5;
        float terraceF = terraceT - floor(terraceT);
        float terraced = (floor(terraceT) + smoothstep(0.42, 0.95, terraceF)) * 6.5;
        float mtn = mix(baseMtn, terraced, 0.28 * smoothstep(10.0, 28.0, baseMtn));
        float mountainHeight = mtn + (r2 * r2 * 3.0 + microRock * 2.5) * smoothstep(8.0, 32.0, baseMtn);

        // Large-scale ~200m high alpine mountain range with gentle, broad slopes (reuses massifEnv & r1)
        float rangeMask = smoothstep(0.34, 0.92, massifEnv);
        float highRange = rangeMask * (135.0 + r1 * 45.0);
        float rangeCorridor = smoothstep(30.0, 280.0, roadDist) * smoothstep(60.0, 280.0, dSpawn);

        float passCorridor = smoothstep(14.0, 95.0, roadDist);
        float spawnCorridor = smoothstep(28.0, 120.0, dSpawn);
        float screeLedge = foothillBumps * 0.35;
        h += (mountainHeight + screeLedge) * passCorridor * spawnCorridor * bayOpen;
        h += highRange * rangeCorridor * bayOpen;

        float dTarn = length(vec2(x, z) - zoneCenter - vec2(-54.0, 92.0));
        float tarnDip = (1.0 - smoothstep(14.0, 46.0, dTarn)) * 11.5;
        h -= tarnDip;

        h += coastalDescent;

        float spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.2, h, spawnClear);

        if (roadF > 0.01) {
            float passGrade = 6.5 + valleyHills * 0.55 - tarnDip + coastalDescent;
            h = mix(h, passGrade, roadF * 0.60);
            float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.30;
            h -= (roadF * 0.28 + rut * roadF) * dryRoad;
        }
        return h;
    }

    float getZoneTerrainHeight_gpu(float x, float z, int zoneType, float dSpawn, float roadDist, float roadF, vec2 zoneCenter, float coastalDescent, float bayOpen) {
        vec2 s = vec2(x, z) + uSeedOffset;
        float finalH = 0.0;

        // ZONE 1: SAHARA DESERT DUNES, SANDSTONE MESAS & OASIS
        if (zoneType == 1) {
            float duneWarp = fbm3_gpu(s * 0.0055) * 2.2;
            float dunePhase = (s.x * 0.82 + s.y * 0.57) * 0.019 + duneWarp;
            float duneWave = (sin(dunePhase) + 0.30 * sin(dunePhase * 2.0 - 0.55)) * 4.2;

            float macroErg = fbm4_gpu(s * 0.0036) * 6.5;
            float medDunes = fbm3_gpu(s * 0.014) * 1.8;
            float microRipples = valueNoise2D_gpu(s * 0.09) * 0.18;
            float h = 5.8 + macroErg + duneWave + medDunes + microRipples;

            // Flat-topped Sandstone Mesas / Buttes & Dry Wadi Channels in the outer desert
            float mesaNoise = fbm3_gpu(s * 0.0042 + vec2(37.0, 61.0));
            float outerDesertMask = smoothstep(55.0, 105.0, dSpawn) * smoothstep(10.0, 32.0, roadDist) * bayOpen;
            float mesaMask = smoothstep(0.34, 0.48, mesaNoise) * outerDesertMask;
            float terraceStep = smoothstep(0.22, 0.34, mesaNoise) * outerDesertMask * 4.2;
            float wadiCut = smoothstep(-2.8, -4.6, macroErg + medDunes) * outerDesertMask * 3.0;
            h += mesaMask * 13.5 + terraceStep - wadiCut;

            float dOasis = length(vec2(x, z) - zoneCenter - vec2(58.0, 78.0));
            float oasisDip = (1.0 - smoothstep(14.0, 48.0, dOasis)) * 9.8;
            h -= oasisDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(6.2, h, spawnClear);

            if (roadF > 0.01) {
                float wadiTarget = 5.4 + macroErg * 0.45 - oasisDip + coastalDescent;
                h = mix(h, wadiTarget, roadF * 0.65);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.25;
                h -= (roadF * 0.22 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 2: ALPINE MOUNTAIN PASS, CRAGGY RIDGES & GLACIAL TARN
        else if (zoneType == 2) {
            finalH = getZone2Height_gpu(x, z, dSpawn, roadDist, roadF, zoneCenter, coastalDescent, bayOpen);
        }

        // ZONE 3: HIGHLAND ROLLING HILLS, DRUMLINS & SUNKEN LANES
        else if (zoneType == 3) {
            float bigHills = fbm4_gpu(s * 0.0062) * 10.5;
            float warp = fbm3_gpu(s * 0.009) * 2.2;
            float drumlins = sin(s.x * 0.021 + warp) * cos(s.y * 0.019 - warp) * 5.2;
            float medSlopes = fbm3_gpu(s * 0.020) * 2.4;
            float microTurf = valueNoise2D_gpu(s * 0.08) * 0.28;
            float h = 7.4 + bigHills + drumlins + medSlopes + microTurf;

            // Terraced hillside lynchets & chalky escarpment swells away from spawn
            float hillOuter = smoothstep(45.0, 95.0, dSpawn) * smoothstep(8.0, 24.0, roadDist) * bayOpen;
            float lynchet = smoothstep(2.0, 6.5, bigHills) * 2.4 * hillOuter;
            h += lynchet;

            float knoll = (1.0 - smoothstep(15.0, 75.0, dSpawn)) * 3.2;
            h += knoll;

            float dPond = length(vec2(x, z) - zoneCenter - vec2(62.0, -82.0));
            float pondDip = (1.0 - smoothstep(12.0, 42.0, dPond)) * 11.2;
            h -= pondDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(8.5, h, spawnClear);

            if (roadF > 0.01) {
                float laneGrade = 7.2 + bigHills * 0.55 + drumlins * 0.35 - pondDip + coastalDescent;
                h = mix(h, laneGrade, roadF * 0.55);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
                h -= (roadF * 0.42 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 4: ARDENNES WINTER & FROZEN STEPPE
        else if (zoneType == 4) {
            float snowRoll = fbm4_gpu(s * 0.0052) * 7.5;
            float driftWarp = fbm3_gpu(s * 0.008) * 2.5;
            float snowDrifts = (sin((s.x + s.y) * 0.018 + driftWarp) + 0.35 * cos(s.x * 0.032 - driftWarp)) * 4.8;
            float microCrust = valueNoise2D_gpu(s * 0.08) * 0.22;
            float h = 7.0 + snowRoll + snowDrifts + microCrust;

            float snowOuter = smoothstep(45.0, 95.0, dSpawn) * smoothstep(8.0, 24.0, roadDist) * bayOpen;
            float driftBerm = smoothstep(1.5, 5.0, snowRoll + snowDrifts) * 3.0 * snowOuter;
            h += driftBerm;

            float dIce = length(vec2(x, z) - zoneCenter - vec2(-48.0, -72.0));
            float iceDip = (1.0 - smoothstep(14.0, 44.0, dIce)) * 10.5;
            h -= iceDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(7.5, h, spawnClear);

            if (roadF > 0.01) {
                float roadGrade = 6.8 + snowRoll * 0.55 - iceDip + coastalDescent;
                h = mix(h, roadGrade, roadF * 0.60);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.34;
                h -= (roadF * 0.32 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 5: NORMANDY BOCAGE & SUNKEN LANES
        else if (zoneType == 5) {
            float bocageFields = fbm4_gpu(s * 0.0048) * 5.8;
            float pastureUndul = fbm3_gpu(s * 0.015) * 2.2;
            float microTurf = valueNoise2D_gpu(s * 0.085) * 0.25;
            float h = 7.2 + bocageFields + pastureUndul + microTurf;

            float fieldGridX = sin(s.x * 0.024);
            float fieldGridZ = sin(s.y * 0.024);
            float dikePattern = max(smoothstep(0.78, 0.98, abs(fieldGridX)), smoothstep(0.78, 0.98, abs(fieldGridZ)));
            float bocageOuter = smoothstep(35.0, 85.0, dSpawn) * smoothstep(7.0, 22.0, roadDist) * bayOpen;
            h += dikePattern * 2.2 * bocageOuter;

            float dFarmPond = length(vec2(x, z) - zoneCenter - vec2(72.0, 48.0));
            float pondDip = (1.0 - smoothstep(12.0, 40.0, dFarmPond)) * 10.2;
            h -= pondDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(7.2, h, spawnClear);

            if (roadF > 0.01) {
                float sunkenGrade = 6.2 + bocageFields * 0.65 - pondDip + coastalDescent;
                h = mix(h, sunkenGrade, roadF * 0.65);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.40;
                h -= (roadF * 0.52 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 6: MONUMENT VALLEY & RED BUTTES FORTRESS
        else if (zoneType == 6) {
            float desertPlain = fbm4_gpu(s * 0.0035) * 3.8;
            float redRipples = valueNoise2D_gpu(s * 0.085) * 0.24;
            float h = 6.4 + desertPlain + redRipples;

            // Gigantic fortress-like red sandstone buttes & flat-topped mesas
            float butteNoise = fbm3_gpu(s * 0.0042 + vec2(43.0, 79.0));
            float outerButteMask = smoothstep(45.0, 95.0, dSpawn) * smoothstep(12.0, 36.0, roadDist) * bayOpen;
            float talusApron = smoothstep(0.22, 0.35, butteNoise) * 6.2;
            float fortressCliff = smoothstep(0.35, 0.42, butteNoise) * 16.5;
            float needleSpire = pow(max(0.0, 1.0 - abs(valueNoise2D_gpu(s * 0.010 + vec2(17.0, 89.0)))), 3.5) * 18.0;
            h += (talusApron + fortressCliff + needleSpire * smoothstep(0.32, 0.45, butteNoise)) * outerButteMask;

            float dWash = length(vec2(x, z) - zoneCenter - vec2(68.0, -52.0));
            float washDip = (1.0 - smoothstep(14.0, 48.0, dWash)) * 8.5;
            h -= washDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(6.5, h, spawnClear);

            if (roadF > 0.01) {
                float passGrade = 6.2 + desertPlain * 0.45 - washDip + coastalDescent;
                h = mix(h, passGrade, roadF * 0.65);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.28;
                h -= (roadF * 0.25 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 7: GRAND CANYON GORGE & TERRACED CHASMS
        else if (zoneType == 7) {
            float plateauBase = 18.5 + fbm4_gpu(s * 0.0032) * 4.2 + valueNoise2D_gpu(s * 0.08) * 0.25;

            // Deep dendritic winding canyon chasm
            float canyonBranch1 = sin(s.x * 0.0062 + fbm3_gpu(s * 0.008) * 1.8);
            float canyonBranch2 = cos(s.y * 0.0055 - fbm3_gpu(s * 0.007) * 1.5);
            float canyonPath = abs(canyonBranch1 * 0.65 + canyonBranch2 * 0.35);
            float chasmCut = (1.0 - smoothstep(0.06, 0.38, canyonPath)) * 16.0;

            float rawH = plateauBase - chasmCut;
            // Stepped geological terraces every ~3.8m
            float stepFrac = fract(rawH / 3.8);
            float steppedH = floor(rawH / 3.8) * 3.8 + smoothstep(0.25, 0.75, stepFrac) * 3.8;
            float h = mix(rawH, steppedH, 0.65);

            float dGorgeWash = length(vec2(x, z) - zoneCenter - vec2(-62.0, -68.0));
            float gorgeDip = (1.0 - smoothstep(14.0, 46.0, dGorgeWash)) * 7.5;
            h -= gorgeDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 22.0, dSpawn);
            h = mix(7.2, h, spawnClear);

            if (roadF > 0.01) {
                float canyonRoadTarget = 7.0 + fbm3_gpu(s * 0.006) * 2.5 - gorgeDip + coastalDescent;
                h = mix(h, canyonRoadTarget, roadF * 0.75);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.32;
                h -= (roadF * 0.30 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 8: ANCIENT EGYPT & THE GREAT PYRAMIDS
        else if (zoneType == 8) {
            float barchanPhase = (s.x * 0.75 + s.y * 0.66) * 0.016 + fbm3_gpu(s * 0.006) * 2.4;
            float barchanWave = (sin(barchanPhase) + 0.35 * sin(barchanPhase * 2.0 - 0.7)) * 4.6;
            float ergRoll = fbm4_gpu(s * 0.0035) * 6.5;
            float rippleMicro = valueNoise2D_gpu(s * 0.09) * 0.18;
            float h = 6.2 + ergRoll + barchanWave + rippleMicro;

            // Flat Giza limestone plateau overlooking the Nile
            float dNile = length(vec2(x, z) - zoneCenter - vec2(-65.0, 72.0));
            float nileValley = (1.0 - smoothstep(16.0, 52.0, dNile)) * 10.2;
            h -= nileValley;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(6.8, h, spawnClear);

            if (roadF > 0.01) {
                float caravanGrade = 6.0 + ergRoll * 0.45 - nileValley + coastalDescent;
                h = mix(h, caravanGrade, roadF * 0.65);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.25;
                h -= (roadF * 0.22 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 9: PACIFIC TROPICAL JUNGLE & RAINFOREST
        else if (zoneType == 9) {
            float karstBasin = fbm4_gpu(s * 0.0045) * 6.5;
            float mogoteNoise = fbm3_gpu(s * 0.008 + vec2(23.0, 67.0)) * 0.5 + 0.5;
            float conicalMogote = pow(max(0.0, mogoteNoise), 2.2) * 15.0;
            float microFernHummock = valueNoise2D_gpu(s * 0.08) * 0.32;
            float h = 6.8 + karstBasin + microFernHummock;

            float jungleOuter = smoothstep(40.0, 90.0, dSpawn) * smoothstep(9.0, 26.0, roadDist) * bayOpen;
            h += conicalMogote * jungleOuter;

            float dJungleRiver = length(vec2(x, z) - zoneCenter - vec2(52.0, -78.0));
            float riverDip = (1.0 - smoothstep(14.0, 46.0, dJungleRiver)) * 10.8;
            h -= riverDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(7.0, h, spawnClear);

            if (roadF > 0.01) {
                float jungleRoadGrade = 6.2 + karstBasin * 0.55 - riverDip + coastalDescent;
                h = mix(h, jungleRoadGrade, roadF * 0.65);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.45;
                h -= (roadF * 0.48 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 10: ANCIENT GREECE, ACROPOLIS PLATEAU & AEGEAN HILLS
        else if (zoneType == 10) {
            float aegeanHills = fbm4_gpu(s * 0.0046) * 5.8;
            float oliveSlopes = fbm3_gpu(s * 0.015) * 2.1;
            float microKarst = valueNoise2D_gpu(s * 0.085) * 0.25;
            float h = 7.0 + aegeanHills + oliveSlopes + microKarst;

            // Terraced limestone Acropolis plateaus & Aegean coastal ridges
            float acropolisOuter = smoothstep(42.0, 92.0, dSpawn) * smoothstep(10.0, 28.0, roadDist) * bayOpen;
            float terraceStep = smoothstep(1.2, 4.2, aegeanHills) * 3.8 * acropolisOuter;
            h += terraceStep;

            float dAegeanCove = length(vec2(x, z) - zoneCenter - vec2(58.0, 76.0));
            float coveDip = (1.0 - smoothstep(14.0, 48.0, dAegeanCove)) * 10.2;
            h -= coveDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(7.2, h, spawnClear);

            if (roadF > 0.01) {
                float sacredWayGrade = 6.8 + aegeanHills * 0.50 - coveDip + coastalDescent;
                h = mix(h, sacredWayGrade, roadF * 0.65);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.26;
                h -= (roadF * 0.24 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 11: IMPERIAL ROME, SEVEN HILLS & TIBER VALLEY
        else if (zoneType == 11) {
            float sevenHills = fbm4_gpu(s * 0.0044) * 5.2;
            float campagnaRoll = fbm3_gpu(s * 0.014) * 1.9;
            float microTufa = valueNoise2D_gpu(s * 0.08) * 0.22;
            float h = 6.8 + sevenHills + campagnaRoll + microTufa;

            float romanOuter = smoothstep(44.0, 94.0, dSpawn) * smoothstep(10.0, 28.0, roadDist) * bayOpen;
            float palatineBluff = smoothstep(1.0, 3.8, sevenHills) * 3.2 * romanOuter;
            h += palatineBluff;

            float dTiberBend = length(vec2(x, z) - zoneCenter - vec2(-58.0, 74.0));
            float tiberDip = (1.0 - smoothstep(14.0, 48.0, dTiberBend)) * 9.8;
            h -= tiberDip;

            h += coastalDescent;

            float spawnClear = smoothstep(4.0, 18.0, dSpawn);
            h = mix(7.0, h, spawnClear);

            if (roadF > 0.01) {
                float viaAppiaGrade = 6.6 + sevenHills * 0.48 - tiberDip + coastalDescent;
                h = mix(h, viaAppiaGrade, roadF * 0.68);
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.24;
                h -= (roadF * 0.22 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        // ZONE 0 (DEFAULT): COASTAL MEADOW COUNTRYSIDE
        else {
            float rollingHills = fbm4_gpu(s * 0.0042) * 4.5;
            float mediumUndulation = fbm3_gpu(s * 0.016) * 1.8;
            float microBumps = valueNoise2D_gpu(s * 0.08) * 0.25;
            float h = 6.8 + rollingHills + mediumUndulation + microBumps;

            // Gentle meadow creek hollows & karst knolls away from spawn
            float meadowOuter = smoothstep(48.0, 100.0, dSpawn) * smoothstep(9.0, 26.0, roadDist) * bayOpen;
            float karstKnoll = smoothstep(1.2, 3.2, rollingHills + mediumUndulation) * 3.2 * meadowOuter;
            float creekHollow = smoothstep(-1.4, -3.0, rollingHills + mediumUndulation) * 2.0 * meadowOuter;
            h += karstKnoll - creekHollow;

            // Elevated grassy ridge around tank spawn (0, 0) overlooking the seaside
            float ridgeElev = (1.0 - smoothstep(12.0, 95.0, dSpawn)) * 2.8;
            h += ridgeElev;

            h += coastalDescent;

            // Spawn pad clearing
            float spawnClear = smoothstep(3.5, 16.0, dSpawn);
            h = mix(7.2, h, spawnClear);

            if (roadF > 0.01) {
                float dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
                float rut = exp(-pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
                h -= (roadF * 0.35 + rut * roadF) * dryRoad;
            }
            finalH = h;
        }

        return finalH;
    }

    float getTerrainHeight_gpu(float x, float z) {
        vec2 s = vec2(x, z) + uSeedOffset;
        float dSpawn = length(vec2(x, z));
        float roadDist = getRoadDistance_gpu(x, z);
        float roadF = (roadDist > 4.6) ? 0.0 : (1.0 - roadDist / 4.6) * (1.0 - roadDist / 4.6) * (3.0 - 2.0 * (1.0 - roadDist / 4.6));
        vec2 zoneCenter = floor(getZoneGrid_gpu(vec2(x, z)) + 0.5) * 1600.0;

        float coastalDist = z + (fbm3_gpu(s * 0.009) * 28.0);
        float coastalSlope = smoothstep(110.0, 360.0, coastalDist) * 12.8;
        float headland = smoothstep(60.0, 200.0, abs(x)) * smoothstep(60.0, 420.0, coastalDist) * 6.5;
        float coastalExtent = (1.0 - smoothstep(600.0, 900.0, abs(x))) * (1.0 - smoothstep(750.0, 1200.0, z));
        float coastalDescent = (-coastalSlope + headland) * coastalExtent;
        float bayOpen = (1.0 - smoothstep(90.0, 260.0, coastalDist) * (1.0 - smoothstep(220.0, 450.0, abs(x))));

        float w[12];
        getZoneWeights12_gpu(vec2(x, z), w);
        float h = 0.0;
        for (int i = 0; i < 12; i++) {
            if (w[i] > 0.0) h += w[i] * getZoneTerrainHeight_gpu(x, z, i, dSpawn, roadDist, roadF, zoneCenter, coastalDescent, bayOpen);
        }
        return applyRiverTerrainHeight_gpu(x, z, h, dSpawn, roadF);
    }

    float getTerrainSurfaceHeight_gpu(float x, float z, out vec3 surfaceNormal) {
        vec2 s = vec2(x, z) + uSeedOffset;
        float h0 = getTerrainHeight_gpu(x, z);
        float gx = valueNoise2D_gpu((s + vec2(2.0, 0.0)) * 0.015) - valueNoise2D_gpu((s - vec2(2.0, 0.0)) * 0.015);
        float gz = valueNoise2D_gpu((s + vec2(0.0, 2.0)) * 0.015) - valueNoise2D_gpu((s - vec2(0.0, 2.0)) * 0.015);
        surfaceNormal = normalize(vec3(-gx * 1.8, 4.0, -gz * 1.8));
        return h0;
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

function getRiverDistance(x, z) {
    // River 1: East-West Meandering Valley River (passing through z = -64 at x = 0)
    const riv1BaseZ = Math.sin(seedOffset.x * 0.0075) * 26.0 + Math.cos(seedOffset.x * 0.017) * 11.0 + Math.sin(seedOffset.x * 0.0032) * 18.0;
    const riv1Z = -64.0 + (Math.sin((x + seedOffset.x) * 0.0075) * 26.0 + Math.cos((x + seedOffset.x) * 0.017) * 11.0 + Math.sin((x + seedOffset.x) * 0.0032) * 18.0) - riv1BaseZ;
    const dRiv1 = Math.abs(z - riv1Z) * 0.90;

    // River 2: Eastern North-South Meandering River (passing through x = 128 at z = 0, emptying to +Z ocean)
    const riv2BaseX = Math.sin(seedOffset.z * 0.0070) * 28.0 + Math.cos(seedOffset.z * 0.016) * 12.0 + Math.sin(seedOffset.z * 0.0028) * 18.0;
    const riv2X = 128.0 + (Math.sin((z + seedOffset.z) * 0.0070) * 28.0 + Math.cos((z + seedOffset.z) * 0.016) * 12.0 + Math.sin((z + seedOffset.z) * 0.0028) * 18.0) - riv2BaseX;
    const dRiv2 = Math.abs(x - riv2X) * 0.90;

    // River 3: Western North-South Tributary River (passing through x = -128 at z = 0, emptying to +Z ocean)
    const riv3BaseX = Math.sin(seedOffset.z * 0.0080 + 1.4) * 26.0 + Math.cos(seedOffset.z * 0.018 + 0.8) * 11.0;
    const riv3X = -128.0 + (Math.sin((z + seedOffset.z) * 0.0080 + 1.4) * 26.0 + Math.cos((z + seedOffset.z) * 0.018 + 0.8) * 11.0) - riv3BaseX;
    const dRiv3 = Math.abs(x - riv3X) * 0.90;

    // Smooth confluence blending between the main river and tributaries
    const d23 = Math.min(dRiv2, dRiv3);
    const h = Math.max(7.0 - Math.abs(dRiv1 - d23), 0.0) / 7.0;
    return Math.min(dRiv1, d23) - h * h * 7.0 * 0.25;
}

function getRiverFactor(x, z) {
    const dist = getRiverDistance(x, z);
    const halfWidth = 22.0;
    if (dist > halfWidth) return 0.0;
    const t = 1.0 - (dist / halfWidth);
    return t * t * (3.0 - 2.0 * t);
}

function getRiversideFactor(x, z) {
    const dist = getRiverDistance(x, z);
    return smoothstep(4.5, 8.2, dist) * (1.0 - smoothstep(13.5, 23.5, dist));
}

const SEA_LEVEL = -2.5;

function applyRiverTerrainHeight(x, z, h, dSpawn, roadF) {
    const rivDist = getRiverDistance(x, z);
    if (rivDist >= 25.5) return h;
    const sx = x + seedOffset.x;
    const sz = z + seedOffset.z;
    const bankWobble = Math.sin(sx * 0.043 + Math.cos(sz * 0.039) * 1.6) * 1.35;
    const effDist = Math.max(0.0, rivDist + bankWobble);
    if (effDist >= 24.5) return h;

    const spawnProtect = smoothstep(26.0, 44.0, dSpawn);
    if (spawnProtect <= 0.001) return h;

    const shelfBlend = (1.0 - smoothstep(12.5, 24.5, effDist)) * spawnProtect;
    let carvedH = mix(h, Math.min(h, -1.15), shelfBlend);

    const shoreSlope = 1.0 - smoothstep(7.8, 14.0, effDist);
    const bedRipple = Math.sin(sx * 0.08 + sz * 0.07) * 0.15;
    const channelDepth = (1.0 - smoothstep(0.0, 8.2, effDist)) * (1.65 + bedRipple);
    const targetRiverH = -1.15 - shoreSlope * 1.30 - channelDepth;
    const innerBlend = (1.0 - smoothstep(7.5, 14.0, effDist)) * spawnProtect;
    carvedH = mix(carvedH, Math.min(carvedH, targetRiverH), innerBlend);

    if (roadF > 0.01) {
        const fordH = -2.28 - roadF * 0.14;
        carvedH = mix(carvedH, Math.max(carvedH, fordH), smoothstep(0.04, 0.55, roadF) * innerBlend);
    }
    return carvedH;
}

function getTerrainHeight(x, z) {
    if (environmentMode === 'studio') return 0;
    const weights = getZoneWeights(x, z);
    let height = 0;
    for (let i = 0; i < weights.length; i++) {
        if (weights[i] > 0) height += weights[i] * getZoneTerrainHeight(x, z, i);
    }
    const dSpawn = Math.hypot(x, z);
    const roadDist = getRoadDistance(x, z);
    const roadF = (roadDist > 4.6) ? 0.0 : (1.0 - roadDist / 4.6) * (1.0 - roadDist / 4.6) * (3.0 - 2.0 * (1.0 - roadDist / 4.6));
    return applyRiverTerrainHeight(x, z, height, dSpawn, roadF);
}

function getZoneTerrainHeight(x, z, currentZoneIndex) {
    const sx = x + seedOffset.x;
    const sz = z + seedOffset.z;
    const dSpawn = Math.hypot(x, z);
    const roadDist = getRoadDistance(x, z);
    const roadF = (roadDist > 4.6) ? 0.0 : (1.0 - roadDist / 4.6) * (1.0 - roadDist / 4.6) * (3.0 - 2.0 * (1.0 - roadDist / 4.6));
    const [zoneX, zoneZ] = getZoneCenter(x, z);

    // Shared coastal slope and bay framing toward +Z ocean
    const coastalDist = z + (fbm3(sx * 0.009, sz * 0.009) * 28.0);
    const coastalSlope = smoothstep(110.0, 360.0, coastalDist) * 12.8;
    const headland = smoothstep(60.0, 200.0, Math.abs(x)) * smoothstep(60.0, 420.0, coastalDist) * 6.5;
    const coastalExtent = (1.0 - smoothstep(600.0, 900.0, Math.abs(x))) * (1.0 - smoothstep(750.0, 1200.0, z));
    const coastalDescent = (-coastalSlope + headland) * coastalExtent;
    const bayOpen = (1.0 - smoothstep(90.0, 260.0, coastalDist) * (1.0 - smoothstep(220.0, 450.0, Math.abs(x))));

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
        const outerDesertMask = smoothstep(55.0, 105.0, dSpawn) * smoothstep(10.0, 32.0, roadDist) * bayOpen;
        const mesaMask = smoothstep(0.34, 0.48, mesaNoise) * outerDesertMask;
        const terraceStep = smoothstep(0.22, 0.34, mesaNoise) * outerDesertMask * 4.2;
        const wadiCut = smoothstep(-2.8, -4.6, macroErg + medDunes) * outerDesertMask * 3.0;
        h += mesaMask * 13.5 + terraceStep - wadiCut;

        const dOasis = Math.hypot(x - zoneX - 58.0, z - zoneZ - 78.0);
        const oasisDip = (1.0 - smoothstep(14.0, 48.0, dOasis)) * 9.8;
        h -= oasisDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(6.2, h, spawnClear);

        if (roadF > 0.01) {
            const wadiTarget = 5.4 + macroErg * 0.45 - oasisDip + coastalDescent;
            h = mix(h, wadiTarget, roadF * 0.65);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.25;
            h -= (roadF * 0.22 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 2: ALPINE MOUNTAIN PASS, CRAGGY RIDGES & GLACIAL TARN
    if (currentZoneIndex === 2) {
        const valleyHills = fbm4(sx * 0.0036, sz * 0.0036) * 5.8;
        const foothillBumps = fbm3(sx * 0.011, sz * 0.011) * 1.8;
        const microRock = valueNoise2D(sx * 0.085, sz * 0.085) * 0.25;
        let h = 6.5 + valleyHills + foothillBumps + microRock;

        const r1 = 1.0 - Math.abs(valueNoise2D(sx * 0.0042, sz * 0.0042));
        const r2 = 1.0 - Math.abs(valueNoise2D(sx * 0.0090 + 19.0, sz * 0.0090 + 31.0));
        const ridgeCrest = (r1 * r1 * 0.72 + r2 * r2 * 0.28);
        const massifEnv = fbm3(sx * 0.0032 + 53.0, sz * 0.0032 + 17.0) * 0.5 + 0.5;
        const baseMtn = Math.pow(Math.max(0.0, massifEnv), 1.35) * 32.0 + Math.pow(ridgeCrest, 1.8) * 24.0;
        const terraceT = baseMtn / 6.5;
        const terraceF = terraceT - Math.floor(terraceT);
        const terraced = (Math.floor(terraceT) + smoothstep(0.42, 0.95, terraceF)) * 6.5;
        const mtn = mix(baseMtn, terraced, 0.28 * smoothstep(10.0, 28.0, baseMtn));
        const mountainHeight = mtn + (r2 * r2 * 3.0 + microRock * 2.5) * smoothstep(8.0, 32.0, baseMtn);

        // Large-scale ~200m high alpine mountain range with gentle, broad slopes (reuses massifEnv & r1)
        const rangeMask = smoothstep(0.34, 0.92, massifEnv);
        const highRange = rangeMask * (135.0 + r1 * 45.0);
        const rangeCorridor = smoothstep(30.0, 280.0, roadDist) * smoothstep(60.0, 280.0, dSpawn);

        const passCorridor = smoothstep(14.0, 95.0, roadDist);
        const spawnCorridor = smoothstep(28.0, 120.0, dSpawn);
        const screeLedge = foothillBumps * 0.35;
        h += (mountainHeight + screeLedge) * passCorridor * spawnCorridor * bayOpen;
        h += highRange * rangeCorridor * bayOpen;

        const dTarn = Math.hypot(x - zoneX + 54.0, z - zoneZ - 92.0);
        const tarnDip = (1.0 - smoothstep(14.0, 46.0, dTarn)) * 11.5;
        h -= tarnDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.2, h, spawnClear);

        if (roadF > 0.01) {
            const passGrade = 6.5 + valleyHills * 0.55 - tarnDip + coastalDescent;
            h = mix(h, passGrade, roadF * 0.60);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.30;
            h -= (roadF * 0.28 + rut * roadF) * dryRoad;
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

        const hillOuter = smoothstep(45.0, 95.0, dSpawn) * smoothstep(8.0, 24.0, roadDist) * bayOpen;
        const lynchet = smoothstep(2.0, 6.5, bigHills) * 2.4 * hillOuter;
        h += lynchet;

        const knoll = (1.0 - smoothstep(15.0, 75.0, dSpawn)) * 3.2;
        h += knoll;

        const dPond = Math.hypot(x - zoneX - 62.0, z - zoneZ + 82.0);
        const pondDip = (1.0 - smoothstep(12.0, 42.0, dPond)) * 11.2;
        h -= pondDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(8.5, h, spawnClear);

        if (roadF > 0.01) {
            const laneGrade = 7.2 + bigHills * 0.55 + drumlins * 0.35 - pondDip + coastalDescent;
            h = mix(h, laneGrade, roadF * 0.55);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
            h -= (roadF * 0.42 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 4: ARDENNES WINTER & FROZEN STEPPE
    if (currentZoneIndex === 4) {
        const snowRoll = fbm4(sx * 0.0052, sz * 0.0052) * 7.5;
        const driftWarp = fbm3(sx * 0.008, sz * 0.008) * 2.5;
        const snowDrifts = (Math.sin((sx + sz) * 0.018 + driftWarp) + 0.35 * Math.cos(sx * 0.032 - driftWarp)) * 4.8;
        const microCrust = valueNoise2D(sx * 0.08, sz * 0.08) * 0.22;
        let h = 7.0 + snowRoll + snowDrifts + microCrust;

        const snowOuter = smoothstep(45.0, 95.0, dSpawn) * smoothstep(8.0, 24.0, roadDist) * bayOpen;
        const driftBerm = smoothstep(1.5, 5.0, snowRoll + snowDrifts) * 3.0 * snowOuter;
        h += driftBerm;

        const dIce = Math.hypot(x - zoneX + 48.0, z - zoneZ + 72.0);
        const iceDip = (1.0 - smoothstep(14.0, 44.0, dIce)) * 10.5;
        h -= iceDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.5, h, spawnClear);

        if (roadF > 0.01) {
            const roadGrade = 6.8 + snowRoll * 0.55 - iceDip + coastalDescent;
            h = mix(h, roadGrade, roadF * 0.60);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.34;
            h -= (roadF * 0.32 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 5: NORMANDY BOCAGE & SUNKEN LANES
    if (currentZoneIndex === 5) {
        const bocageFields = fbm4(sx * 0.0048, sz * 0.0048) * 5.8;
        const pastureUndul = fbm3(sx * 0.015, sz * 0.015) * 2.2;
        const microTurf = valueNoise2D(sx * 0.085, sz * 0.085) * 0.25;
        let h = 7.2 + bocageFields + pastureUndul + microTurf;

        const fieldGridX = Math.sin(sx * 0.024);
        const fieldGridZ = Math.sin(sz * 0.024);
        const dikePattern = Math.max(smoothstep(0.78, 0.98, Math.abs(fieldGridX)), smoothstep(0.78, 0.98, Math.abs(fieldGridZ)));
        const bocageOuter = smoothstep(35.0, 85.0, dSpawn) * smoothstep(7.0, 22.0, roadDist) * bayOpen;
        h += dikePattern * 2.2 * bocageOuter;

        const dFarmPond = Math.hypot(x - zoneX - 72.0, z - zoneZ - 48.0);
        const pondDip = (1.0 - smoothstep(12.0, 40.0, dFarmPond)) * 10.2;
        h -= pondDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.2, h, spawnClear);

        if (roadF > 0.01) {
            const sunkenGrade = 6.2 + bocageFields * 0.65 - pondDip + coastalDescent;
            h = mix(h, sunkenGrade, roadF * 0.65);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.40;
            h -= (roadF * 0.52 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 6: MONUMENT VALLEY & RED BUTTES FORTRESS
    if (currentZoneIndex === 6) {
        const desertPlain = fbm4(sx * 0.0035, sz * 0.0035) * 3.8;
        const redRipples = valueNoise2D(sx * 0.085, sz * 0.085) * 0.24;
        let h = 6.4 + desertPlain + redRipples;

        const butteNoise = fbm3(sx * 0.0042 + 43.0, sz * 0.0042 + 79.0);
        const outerButteMask = smoothstep(45.0, 95.0, dSpawn) * smoothstep(12.0, 36.0, roadDist) * bayOpen;
        const talusApron = smoothstep(0.22, 0.35, butteNoise) * 6.2;
        const fortressCliff = smoothstep(0.35, 0.42, butteNoise) * 16.5;
        const needleSpire = Math.pow(Math.max(0.0, 1.0 - Math.abs(valueNoise2D(sx * 0.010 + 17.0, sz * 0.010 + 89.0))), 3.5) * 18.0;
        h += (talusApron + fortressCliff + needleSpire * smoothstep(0.32, 0.45, butteNoise)) * outerButteMask;

        const dWash = Math.hypot(x - zoneX - 68.0, z - zoneZ + 52.0);
        const washDip = (1.0 - smoothstep(14.0, 48.0, dWash)) * 8.5;
        h -= washDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(6.5, h, spawnClear);

        if (roadF > 0.01) {
            const passGrade = 6.2 + desertPlain * 0.45 - washDip + coastalDescent;
            h = mix(h, passGrade, roadF * 0.65);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.28;
            h -= (roadF * 0.25 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 7: GRAND CANYON GORGE & TERRACED CHASMS
    if (currentZoneIndex === 7) {
        const plateauBase = 18.5 + fbm4(sx * 0.0032, sz * 0.0032) * 4.2 + valueNoise2D(sx * 0.08, sz * 0.08) * 0.25;

        const canyonBranch1 = Math.sin(sx * 0.0062 + fbm3(sx * 0.008, sz * 0.008) * 1.8);
        const canyonBranch2 = Math.cos(sz * 0.0055 - fbm3(sx * 0.007, sz * 0.007) * 1.5);
        const canyonPath = Math.abs(canyonBranch1 * 0.65 + canyonBranch2 * 0.35);
        const chasmCut = (1.0 - smoothstep(0.06, 0.38, canyonPath)) * 16.0;

        const rawH = plateauBase - chasmCut;
        const stepFrac = ((rawH / 3.8) % 1 + 1) % 1;
        const steppedH = Math.floor(rawH / 3.8) * 3.8 + smoothstep(0.25, 0.75, stepFrac) * 3.8;
        let h = mix(rawH, steppedH, 0.65);

        const dGorgeWash = Math.hypot(x - zoneX + 62.0, z - zoneZ + 68.0);
        const gorgeDip = (1.0 - smoothstep(14.0, 46.0, dGorgeWash)) * 7.5;
        h -= gorgeDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 22.0, dSpawn);
        h = mix(7.2, h, spawnClear);

        if (roadF > 0.01) {
            const canyonRoadTarget = 7.0 + fbm3(sx * 0.006, sz * 0.006) * 2.5 - gorgeDip + coastalDescent;
            h = mix(h, canyonRoadTarget, roadF * 0.75);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.32;
            h -= (roadF * 0.30 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 8: ANCIENT EGYPT & THE GREAT PYRAMIDS
    if (currentZoneIndex === 8) {
        const barchanPhase = (sx * 0.75 + sz * 0.66) * 0.016 + fbm3(sx * 0.006, sz * 0.006) * 2.4;
        const barchanWave = (Math.sin(barchanPhase) + 0.35 * Math.sin(barchanPhase * 2.0 - 0.7)) * 4.6;
        const ergRoll = fbm4(sx * 0.0035, sz * 0.0035) * 6.5;
        const rippleMicro = valueNoise2D(sx * 0.09, sz * 0.09) * 0.18;
        let h = 6.2 + ergRoll + barchanWave + rippleMicro;

        const dNile = Math.hypot(x - zoneX + 65.0, z - zoneZ - 72.0);
        const nileValley = (1.0 - smoothstep(16.0, 52.0, dNile)) * 10.2;
        h -= nileValley;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(6.8, h, spawnClear);

        if (roadF > 0.01) {
            const caravanGrade = 6.0 + ergRoll * 0.45 - nileValley + coastalDescent;
            h = mix(h, caravanGrade, roadF * 0.65);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.25;
            h -= (roadF * 0.22 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 9: PACIFIC TROPICAL JUNGLE & RAINFOREST
    if (currentZoneIndex === 9) {
        const karstBasin = fbm4(sx * 0.0045, sz * 0.0045) * 6.5;
        const mogoteNoise = fbm3(sx * 0.008 + 23.0, sz * 0.008 + 67.0) * 0.5 + 0.5;
        const conicalMogote = Math.pow(Math.max(0.0, mogoteNoise), 2.2) * 15.0;
        const microFernHummock = valueNoise2D(sx * 0.08, sz * 0.08) * 0.32;
        let h = 6.8 + karstBasin + microFernHummock;

        const jungleOuter = smoothstep(40.0, 90.0, dSpawn) * smoothstep(9.0, 26.0, roadDist) * bayOpen;
        h += conicalMogote * jungleOuter;

        const dJungleRiver = Math.hypot(x - zoneX - 52.0, z - zoneZ + 78.0);
        const riverDip = (1.0 - smoothstep(14.0, 46.0, dJungleRiver)) * 10.8;
        h -= riverDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.0, h, spawnClear);

        if (roadF > 0.01) {
            const jungleRoadGrade = 6.2 + karstBasin * 0.55 - riverDip + coastalDescent;
            h = mix(h, jungleRoadGrade, roadF * 0.65);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.45;
            h -= (roadF * 0.48 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 10: ANCIENT GREECE, ACROPOLIS PLATEAU & AEGEAN HILLS
    if (currentZoneIndex === 10) {
        const aegeanHills = fbm4(sx * 0.0046, sz * 0.0046) * 5.8;
        const oliveSlopes = fbm3(sx * 0.015, sz * 0.015) * 2.1;
        const microKarst = valueNoise2D(sx * 0.085, sz * 0.085) * 0.25;
        let h = 7.0 + aegeanHills + oliveSlopes + microKarst;

        const acropolisOuter = smoothstep(42.0, 92.0, dSpawn) * smoothstep(10.0, 28.0, roadDist) * bayOpen;
        const terraceStep = smoothstep(1.2, 4.2, aegeanHills) * 3.8 * acropolisOuter;
        h += terraceStep;

        const dAegeanCove = Math.hypot(x - zoneX - 58.0, z - zoneZ - 76.0);
        const coveDip = (1.0 - smoothstep(14.0, 48.0, dAegeanCove)) * 10.2;
        h -= coveDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.2, h, spawnClear);

        if (roadF > 0.01) {
            const sacredWayGrade = 6.8 + aegeanHills * 0.50 - coveDip + coastalDescent;
            h = mix(h, sacredWayGrade, roadF * 0.65);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.26;
            h -= (roadF * 0.24 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 11: IMPERIAL ROME, SEVEN HILLS & TIBER VALLEY
    if (currentZoneIndex === 11) {
        const sevenHills = fbm4(sx * 0.0044, sz * 0.0044) * 5.2;
        const campagnaRoll = fbm3(sx * 0.014, sz * 0.014) * 1.9;
        const microTufa = valueNoise2D(sx * 0.08, sz * 0.08) * 0.22;
        let h = 6.8 + sevenHills + campagnaRoll + microTufa;

        const romanOuter = smoothstep(44.0, 94.0, dSpawn) * smoothstep(10.0, 28.0, roadDist) * bayOpen;
        const palatineBluff = smoothstep(1.0, 3.8, sevenHills) * 3.2 * romanOuter;
        h += palatineBluff;

        const dTiberBend = Math.hypot(x - zoneX + 58.0, z - zoneZ - 74.0);
        const tiberDip = (1.0 - smoothstep(14.0, 48.0, dTiberBend)) * 9.8;
        h -= tiberDip;

        h += coastalDescent;

        const spawnClear = smoothstep(4.0, 18.0, dSpawn);
        h = mix(7.0, h, spawnClear);

        if (roadF > 0.01) {
            const viaAppiaGrade = 6.6 + sevenHills * 0.48 - tiberDip + coastalDescent;
            h = mix(h, viaAppiaGrade, roadF * 0.68);
            const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
            const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.24;
            h -= (roadF * 0.22 + rut * roadF) * dryRoad;
        }
        return h;
    }

    // ZONE 0 (DEFAULT): COASTAL MEADOW COUNTRYSIDE
    const rollingHills = fbm4(sx * 0.0042, sz * 0.0042) * 4.5;
    const mediumUndulation = fbm3(sx * 0.016, sz * 0.016) * 1.8;
    const microBumps = valueNoise2D(sx * 0.08, sz * 0.08) * 0.25;

    let h = 6.8 + rollingHills + mediumUndulation + microBumps;

    const meadowOuter = smoothstep(48.0, 100.0, dSpawn) * smoothstep(9.0, 26.0, roadDist) * bayOpen;
    const karstKnoll = smoothstep(1.2, 3.2, rollingHills + mediumUndulation) * 3.2 * meadowOuter;
    const creekHollow = smoothstep(-1.4, -3.0, rollingHills + mediumUndulation) * 2.0 * meadowOuter;
    h += karstKnoll - creekHollow;

    const ridgeElev = (1.0 - smoothstep(12.0, 95.0, dSpawn)) * 2.8;
    h += ridgeElev;

    h += coastalDescent;

    const spawnClear = smoothstep(3.5, 16.0, dSpawn);
    h = mix(7.2, h, spawnClear);

    if (roadF > 0.01) {
        const dryRoad = smoothstep(SEA_LEVEL - 0.5, SEA_LEVEL + 1.2, h);
        const rut = Math.exp(-Math.pow(roadDist - 1.35, 2.0) / 0.35) * 0.38;
        h -= (roadF * 0.35 + rut * roadF) * dryRoad;
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
// ============================================================================
// Babylon-Inspired Dual-Layer Analytical Aerial Perspective & Haze
// ============================================================================
const BABYLON_HAZE_GLSL = `
vec3 applyBabylonAerialHaze(vec3 col, vec3 worldPos, vec3 camPos, vec3 sunDir, vec3 sunCol, vec3 skyHor, vec3 skyTop, float hazeStrength) {
    vec3 toPt = worldPos - camPos;
    float dist = length(toPt);
    if (dist < 1.0) return col;
    vec3 V = toPt / dist;
    float y0 = max(camPos.y, -2.5);
    float y1 = max(worldPos.y, -2.5);
    float avgY = 0.5 * (y0 + y1);
    float lowDensity = exp(-max(avgY + 4.0, 0.0) / 135.0) * 0.85;
    float highDensity = exp(-max(avgY + 4.0, 0.0) / 1800.0) * 0.15;
    float effDist = max(0.0, dist - 95.0);
    float optical = (lowDensity + highDensity) * (effDist / 5600.0) * hazeStrength;
    float hazeAmt = 1.0 - exp(-optical * 1.15);
    hazeAmt = clamp(hazeAmt + smoothstep(3400.0, 6500.0, dist) * 0.60, 0.0, 0.88);
    float sunAlign = max(dot(V, normalize(sunDir)), 0.0);
    float mieGlow = pow(sunAlign, 5.0) * 0.42 + pow(sunAlign, 2.0) * 0.16;
    // Convert sRGB uniform colors to linear space so ACES + sRGB output encoding does not double-brighten haze
    vec3 linSkyHor = pow(max(skyHor, vec3(0.001)), vec3(2.2));
    vec3 linSkyTop = pow(max(skyTop, vec3(0.001)), vec3(2.2));
    vec3 linSunCol = pow(max(sunCol, vec3(0.001)), vec3(2.2));
    vec3 horizonCol = mix(linSkyHor, linSkyTop, clamp(V.y * 0.45, 0.0, 0.45));
    vec3 hazeCol = mix(horizonCol, linSunCol * 0.85 + linSkyHor * 0.22, mieGlow * clamp(sunDir.y * 2.5 + 0.35, 0.0, 1.0));
    return mix(col, hazeCol, hazeAmt);
}
`;

const CLOUD_SHADOW_GLSL = `
uniform sampler2D uCloudTex;
uniform vec4 uCloudShadowParams;
uniform float uCloudTime;
uniform vec3 uCloudSunDir;

float sampleCloudShadowFactor(vec3 worldPos, vec3 sunDir, float uTimeVal, sampler2D cloudTex, vec4 params) {
    if (params.x <= 0.001) return 1.0;
    float sunY = max(sunDir.y, 0.22);
    vec2 cloudWorldXZ = worldPos.xz + (sunDir.xz / sunY) * max(480.0 - worldPos.y, 60.0);
    vec2 uv = cloudWorldXZ * params.z;
    vec2 wind = vec2(uTimeVal * 0.012, uTimeVal * 0.0042);
    vec2 baseUV = uv * 0.18 + wind;
    float masses = texture2D(cloudTex, baseUV).r;
    vec2 warp = vec2(masses - 0.5, texture2D(cloudTex, baseUV * 0.7 + vec2(0.41, 0.23)).r - 0.5) * 0.14;
    mat2 rot1 = mat2(0.80, 0.60, -0.60, 0.80);
    float billow = texture2D(cloudTex, (rot1 * uv) * 0.42 - wind * 0.45 + warp + vec2(0.37, 0.61)).g;
    float baseShape = masses * 0.76 + billow * 0.24;
    float erosion = (1.0 - billow) * 0.16;
    float density = smoothstep(params.y - 0.042, params.y + 0.068, baseShape - erosion);
    float shadowMask = density * params.x * params.w;
    return 1.0 - shadowMask;
}
`;

function bindCloudShadowUniforms(shader) {
    const cl = window.celestialLighting;
    if (cl) {
        if (!cl.cloudTex.value && window.getSharedCloudNoiseTexture) {
            cl.cloudTex.value = window.getSharedCloudNoiseTexture();
        }
        shader.uniforms.uCloudTex = cl.cloudTex;
        shader.uniforms.uCloudShadowParams = cl.cloudShadowParams;
        shader.uniforms.uCloudTime = cl.time;
        shader.uniforms.uCloudSunDir = cl.sunDirection;
    } else {
        shader.uniforms.uCloudTex = { value: null };
        shader.uniforms.uCloudShadowParams = { value: new THREE.Vector4(0, 0.48, 0.0018, 0.74) };
        shader.uniforms.uCloudTime = { value: 0 };
        shader.uniforms.uCloudSunDir = { value: new THREE.Vector3(0, 1, 0) };
    }
}

function injectCloudShadowFragment(shader, worldPosExpr, noIndirectSpecular = false) {
    bindCloudShadowUniforms(shader);
    shader.fragmentShader = CLOUD_SHADOW_GLSL + '\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
            float _cloudLit = sampleCloudShadowFactor(${worldPosExpr}, uCloudSunDir, uCloudTime, uCloudTex, uCloudShadowParams);
            reflectedLight.directDiffuse *= _cloudLit;
            reflectedLight.directSpecular *= _cloudLit;
            ${noIndirectSpecular ? 'reflectedLight.indirectSpecular = vec3(0.0);' : ''}
        }`
    );
}

// Automatically apply daytime cloud shadows to all standard/lambert/phong scene materials
// (tanks, soldiers, bicycles, props, monumentRockMat, etc.) that do not override onBeforeCompile.
THREE.Material.prototype.customProgramCacheKey = function() {
    return (this.userData && this.userData.noIndirectSpecular) ? 'noIndSpec' : '';
};

THREE.Material.prototype.onBeforeCompile = function(shader) {
    if (this.isMeshStandardMaterial || this.isMeshLambertMaterial || this.isMeshPhongMaterial) {
        bindCloudShadowUniforms(shader);
        const stripIndirectSpec = Boolean(this.userData && this.userData.noIndirectSpecular);
        shader.vertexShader = 'varying vec3 vCloudWorldPos;\n' + shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
            {
                vec4 _cwp = vec4(transformed, 1.0);
                #ifdef USE_INSTANCING
                    _cwp = instanceMatrix * _cwp;
                #endif
                vCloudWorldPos = (modelMatrix * _cwp).xyz;
            }`
        );
        shader.fragmentShader = 'varying vec3 vCloudWorldPos;\n' + CLOUD_SHADOW_GLSL + '\n' + shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            {
                float _cloudLit = sampleCloudShadowFactor(vCloudWorldPos, uCloudSunDir, uCloudTime, uCloudTex, uCloudShadowParams);
                reflectedLight.directDiffuse *= _cloudLit;
                reflectedLight.directSpecular *= _cloudLit;
                ${stripIndirectSpec ? 'reflectedLight.indirectSpecular = vec3(0.0);' : ''}
            }`
        );
    }
};

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
    uSpawnZone: { value: spawnZoneIndex },
    uBuildings: { value: Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uBuildingCount: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.72, -0.52).normalize() },
    uSunColor: { value: new THREE.Color(0xfff5e0) },
    uSkyColor: { value: new THREE.Color(0x82b6e5) },
    uSkyTopColor: { value: new THREE.Color(0x1958aa) },
    uHazeStrength: { value: 1.0 },
    uTerrainNormalAtlas: { value: null }
};

let terrainNormalAtlas = null;
function getTerrainNormalAtlas() {
    if (!terrainNormalAtlas && typeof createTerrainNormalAtlas === 'function') {
        terrainNormalAtlas = createTerrainNormalAtlas();
    }
    return terrainNormalAtlas;
}

// Non-metal ground & vegetation: reduced static steel IBL fill for stronger sun/shade contrast
const GROUND_ENV_MAP_INTENSITY = 0.25;

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    fog: false
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
    shader.uniforms.uSpawnZone = terrainUniforms.uSpawnZone;
    shader.uniforms.uBuildings = terrainUniforms.uBuildings;
    shader.uniforms.uBuildingCount = terrainUniforms.uBuildingCount;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
    shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
    shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
    shader.uniforms.uSssStrength = (window.celestialLighting && window.celestialLighting.sssStrength)
        ? window.celestialLighting.sssStrength
        : { value: 1.0 };
    shader.uniforms.uTerrainNormalAtlas = terrainUniforms.uTerrainNormalAtlas;

    shader.vertexShader = `
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        varying float vTerrainSlope;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(normal);
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
        uniform vec3 uSkyTopColor;
        uniform float uHazeStrength;
        uniform sampler2D uTerrainNormalAtlas;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        varying float vTerrainSlope;
        ${SHARED_TERRAIN_GLSL}
        ${BABYLON_HAZE_GLSL}

        vec4 evalRiverCobble_gpu(vec2 p, out vec2 cobbleGrad) {
            vec2 cell = floor(p);
            vec2 fracP = fract(p) - 0.5;
            float h = hash2D_gpu(cell);
            vec2 jit = vec2(fract(h * 13.7) - 0.5, fract(h * 29.3) - 0.5) * 0.34;
            vec2 delta = (fracP - jit) * vec2(1.0, 0.82 + 0.36 * fract(h * 7.3));
            float d = length(delta);
            float mortarMask = smoothstep(0.34, 0.48, d);
            float dome = smoothstep(0.48, 0.12, d);
            cobbleGrad = -delta * (2.6 * dome);
            return vec4(dome, mortarMask, h, d);
        }
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `
        #include <normal_fragment_begin>
        float distToCamNorm = length(vTerrainWorldPos.xz - uCameraPos.xz);
        float distFadeClose = 1.0 - smoothstep(42.0, 145.0, distToCamNorm);
        float distFadeMacro = 1.0 - smoothstep(420.0, 1650.0, distToCamNorm);

        if (distFadeMacro > 0.002) {
            mat2 rotNorm = mat2(0.80, 0.60, -0.60, 0.80);
            vec2 groundNormWarp = vec2(
                sin(vTerrainWorldPos.z * 0.048 + vTerrainWorldPos.x * 0.029),
                cos(vTerrainWorldPos.x * 0.043 - vTerrainWorldPos.z * 0.035)
            ) * 3.4 + vec2(
                sin(vTerrainWorldPos.x * 0.089 - vTerrainWorldPos.z * 0.071),
                cos(vTerrainWorldPos.z * 0.078 + vTerrainWorldPos.x * 0.063)
            ) * 1.2;
            vec2 posGroundWarped = vTerrainWorldPos.xz + groundNormWarp;

            float roadDistForNorm = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
            float roadFactorNorm = getRoadFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
            float riverDistNorm = getRiverDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
            float riversideFactorNorm = getRiversideFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
            float beachFactorNorm = 1.0 - smoothstep(-2.55, -1.35, vTerrainWorldPos.y);

            float wZoneNorm[12];
            getZoneWeights12_gpu(vTerrainWorldPos.xz, wZoneNorm);

            float sandBlendFactor = clamp(wZoneNorm[1] * 0.95 + wZoneNorm[8] * 0.95 + beachFactorNorm * 0.92 + riversideFactorNorm * 0.65, 0.0, 1.0);
            float mtnHighRock = wZoneNorm[2] * smoothstep(14.0, 28.0, vTerrainWorldPos.y);
            float snowLineElev = smoothstep(44.0, 72.0, vTerrainWorldPos.y - vTerrainSlope * 20.0);
            float snowBlendFactor = clamp(wZoneNorm[4] * 0.95 + wZoneNorm[2] * snowLineElev * 0.85, 0.0, 1.0);
            float rockCliffWeight = clamp(wZoneNorm[2] * 0.85 + wZoneNorm[6] * 0.90 + wZoneNorm[7] * 0.95 + wZoneNorm[10] * 0.72 + wZoneNorm[11] * 0.65, 0.0, 1.0);
            float rockFactorNorm = clamp(smoothstep(0.045, 0.16, vTerrainSlope) * (0.45 + 0.55 * rockCliffWeight) + mtnHighRock * 0.88, 0.0, 1.0);

            vec2 deltaSurfN = vec2(0.0);

            // 1. Close/Mid High-Res Atlas Normal Layer (0m to 145m)
            if (distFadeClose > 0.002) {
                vec2 uvGroundNorm1 = fract(posGroundWarped * 0.054) * 0.484 + vec2(0.008, 0.008);
                vec2 uvGroundNorm2 = fract((rotNorm * posGroundWarped) * 0.021 + vec2(0.31, 0.77)) * 0.484 + vec2(0.008, 0.008);
                vec3 nGround1 = texture2D(uTerrainNormalAtlas, uvGroundNorm1).xyz * 2.0 - 1.0;
                vec3 nGround2 = texture2D(uTerrainNormalAtlas, uvGroundNorm2).xyz * 2.0 - 1.0;
                float groundBlendMask = 0.5 + 0.45 * sin(vTerrainWorldPos.x * 0.032 + vTerrainWorldPos.z * 0.025 + cos(vTerrainWorldPos.z * 0.039));
                vec3 nGroundSample = normalize(nGround1 + vec3(nGround2.xy * (0.55 + 0.35 * groundBlendMask), 0.0));

                // Road aggregate normal using world-warped coords (eliminates diagonal seam stripes)
                vec2 uvRoadNorm = fract(posGroundWarped * 0.085) * 0.484 + vec2(0.508, 0.008);
                vec3 nRoadSample = texture2D(uTerrainNormalAtlas, uvRoadNorm).xyz * 2.0 - 1.0;

                vec2 posSandWarped = vTerrainWorldPos.xz + groundNormWarp * 0.7;
                vec2 uvSandNorm1 = fract(posSandWarped * 0.075) * 0.484 + vec2(0.008, 0.508);
                vec2 uvSandNorm2 = fract((rotNorm * posSandWarped) * 0.030 + vec2(0.48, 0.22)) * 0.484 + vec2(0.008, 0.508);
                vec3 nSand1 = texture2D(uTerrainNormalAtlas, uvSandNorm1).xyz * 2.0 - 1.0;
                vec3 nSand2 = texture2D(uTerrainNormalAtlas, uvSandNorm2).xyz * 2.0 - 1.0;
                vec3 nSandSample = normalize(nSand1 + vec3(nSand2.xy * 0.55, 0.0));

                vec2 uvRockNorm = fract(vec2((vTerrainWorldPos.x - vTerrainWorldPos.z * 0.7) * 0.11, vTerrainWorldPos.y * 0.22 + groundNormWarp.x * 0.08)) * 0.484 + vec2(0.508, 0.508);
                vec3 nRockSample = texture2D(uTerrainNormalAtlas, uvRockNorm).xyz * 2.0 - 1.0;

                deltaSurfN = nGroundSample.xy * 0.26;
                vec2 closeN = deltaSurfN;
                closeN = mix(closeN, nSandSample.xy * 0.24, sandBlendFactor);
                closeN = mix(closeN, nRockSample.xy * 0.32, rockFactorNorm);
                closeN = mix(closeN, nRoadSample.xy * 0.16, smoothstep(0.04, 0.38, roadFactorNorm));

                if (riversideFactorNorm > 0.01 && riverDistNorm < 24.5) {
                    float riverCobbleMask = riversideFactorNorm * (0.45 + 0.55 * smoothstep(-0.15, 0.35, valueNoise2D_gpu(posGroundWarped * 0.032)));
                    vec2 cobbleNormalXY = _cachedCobbleGrad1 * 0.30 + _cachedCobbleGrad2 * 0.14 + nRoadSample.xy * 0.16;
                    closeN = mix(closeN, cobbleNormalXY, clamp(riverCobbleMask * 0.90 + smoothstep(0.05, 0.45, roadFactorNorm) * 0.5, 0.0, 0.95));
                }

                if (roadFactorNorm > 0.05) {
                    float rutOffset = roadDistForNorm - 1.35;
                    float rutSlope = (rutOffset / 0.28) * exp(-pow(rutOffset, 2.0) / 0.28) * roadFactorNorm * 0.11;
                    closeN += vec2(rutSlope * 0.22);
                }
                if (sandBlendFactor > 0.05) {
                    float ripplePhase = (vTerrainWorldPos.x * 0.82 + vTerrainWorldPos.z * 0.57 + sin(vTerrainWorldPos.z * 0.35) * 0.9) * 2.4;
                    closeN += vec2(0.82, 0.57) * cos(ripplePhase) * 0.06 * sandBlendFactor * (1.0 - roadFactorNorm);
                }
                if (snowBlendFactor > 0.05) {
                    float sastrugiPhase = (vTerrainWorldPos.x * 0.65 - vTerrainWorldPos.z * 0.75) * 2.2;
                    closeN += vec2(0.65, -0.75) * cos(sastrugiPhase) * 0.08 * snowBlendFactor * (1.0 - roadFactorNorm);
                }
                deltaSurfN = closeN * distFadeClose;
            }

            // 2. Multi-Band Meso & Macro 3D Procedural Relief Layer (active from 15m out to 1650m!)
            // Subtle natural relief bridging beyond 3D grass (~40m) without over-bumpy artifacts
            float fadeBand1 = 1.0 - smoothstep(55.0, 185.0, distToCamNorm);   // ~2.3m turf clods / ripples / scree
            float fadeBand2 = 1.0 - smoothstep(220.0, 780.0, distToCamNorm);  // ~8.5m hummocks / rills / dune facets
            float fadeBand3 = distFadeMacro;                                   // ~28m gullies / crags / escarpments

            vec2 mesoGrad = vec2(0.0);
            float b1C = 0.0;
            float b2C = 0.0;

            // Band 1: ~2.3m clod & tuft relief (skipped beyond 185m)
            if (fadeBand1 > 0.002) {
                vec2 pB1 = posGroundWarped * 0.42;
                b1C = valueNoise2D_gpu(pB1);
                float b1X = valueNoise2D_gpu(pB1 + vec2(0.35, 0.0));
                float b1Z = valueNoise2D_gpu(pB1 + vec2(0.0, 0.35));
                mesoGrad += vec2(b1C - b1X, b1C - b1Z) * 0.58 * fadeBand1;
            }

            // Band 2: ~8.5m meso hummocks, erosion rills & pasture swells (skipped beyond 780m)
            if (fadeBand2 > 0.002) {
                vec2 pB2 = posGroundWarped * 0.115;
                b2C = valueNoise2D_gpu(pB2) + 0.5 * valueNoise2D_gpu(pB2 * 2.15 + vec2(17.3, 31.7));
                float b2X = valueNoise2D_gpu(pB2 + vec2(0.28, 0.0)) + 0.5 * valueNoise2D_gpu((pB2 + vec2(0.28, 0.0)) * 2.15 + vec2(17.3, 31.7));
                float b2Z = valueNoise2D_gpu(pB2 + vec2(0.0, 0.28)) + 0.5 * valueNoise2D_gpu((pB2 + vec2(0.0, 0.28)) * 2.15 + vec2(17.3, 31.7));
                mesoGrad += vec2(b2C - b2X, b2C - b2Z) * 0.45 * fadeBand2;
            }

            // Band 3: ~28m macro ridges, drainage gullies & craggy rock facets
            vec2 pB3 = (vTerrainWorldPos.xz + uSeedOffset) * 0.034;
            float b3C = valueNoise2D_gpu(pB3) - 0.65 * abs(valueNoise2D_gpu(pB3 * 1.9 + vec2(41.0, 13.0)));
            float b3X = valueNoise2D_gpu(pB3 + vec2(0.22, 0.0)) - 0.65 * abs(valueNoise2D_gpu((pB3 + vec2(0.22, 0.0)) * 1.9 + vec2(41.0, 13.0)));
            float b3Z = valueNoise2D_gpu(pB3 + vec2(0.0, 0.22)) - 0.65 * abs(valueNoise2D_gpu((pB3 + vec2(0.0, 0.22)) * 1.9 + vec2(41.0, 13.0)));
            mesoGrad += vec2(b3C - b3X, b3C - b3Z) * (0.30 + 0.24 * rockFactorNorm * (1.0 - mtnHighRock * 0.65)) * fadeBand3;

            // Meso dune wave & wind-ripple facets for desert & Egypt at distance
            if (sandBlendFactor > 0.05) {
                if (fadeBand2 > 0.002) {
                    float mesoDunePhase = (posGroundWarped.x * 0.78 + posGroundWarped.y * 0.62) * 0.28 + b2C * 1.5;
                    mesoGrad += vec2(0.78, 0.62) * cos(mesoDunePhase) * 0.22 * sandBlendFactor * fadeBand2;
                }
                if (fadeBand1 > 0.002) {
                    float fineDunePhase = (vTerrainWorldPos.x * 0.82 + vTerrainWorldPos.z * 0.57) * 1.35 + b1C * 1.2;
                    mesoGrad += vec2(0.82, 0.57) * cos(fineDunePhase) * 0.18 * sandBlendFactor * fadeBand1;
                }
            }

            deltaSurfN += mesoGrad * (1.0 - roadFactorNorm * 0.88);
            // Reduce normal map intensity on Alpine Mountain slopes/peaks for cleaner large-scale silhouettes
            deltaSurfN *= (1.0 - mtnHighRock * 0.62);

            vec3 q0 = dFdx(-vViewPosition);
            vec3 q1 = dFdy(-vViewPosition);
            vec2 st0 = dFdx(vTerrainWorldPos.xz);
            vec2 st1 = dFdy(vTerrainWorldPos.xz);
            vec3 N = normal;
            vec3 q1perp = cross(q1, N);
            vec3 q0perp = cross(N, q0);
            vec3 T = q1perp * st0.x + q0perp * st1.x;
            vec3 B = q1perp * st0.y + q0perp * st1.y;
            float det = max(dot(T, T), dot(B, B));
            float invDet = (det == 0.0) ? 0.0 : inversesqrt(det);
            normal = normalize(T * (deltaSurfN.x * invDet) + B * (deltaSurfN.y * invDet) + N);
        }
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float distToCam = length(vTerrainWorldPos.xz - uCameraPos.xz);
        float roadMask = getRoadFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        float grassSurfaceMask = (1.0 - smoothstep(0.08, 0.42, roadMask)) * (1.0 - smoothstep(0.08, 0.24, vTerrainSlope));

        // Multi-scale domain-warped procedural terrain noises (Micro + Clump + Meso + Macro + Strata)
        vec2 worldS = vTerrainWorldPos.xz + uSeedOffset;
        vec2 domainWarp = vec2(
            fbm3_gpu(worldS * 0.011),
            fbm3_gpu(worldS * 0.011 + vec2(43.7, 19.3))
        ) * 22.0;
        vec2 warpedXZ = worldS + domainWarp;

        float microNoise  = valueNoise2D_gpu(vTerrainWorldPos.xz * 3.8) * 0.5 + 0.5;
        float gravelNoise = valueNoise2D_gpu(vTerrainWorldPos.xz * 10.5) * 0.5 + 0.5;
        float detailNoise = valueNoise2D_gpu(vTerrainWorldPos.xz * 0.52 + domainWarp * 0.12) * 0.5 + 0.5;
        float clumpNoise  = valueNoise2D_gpu(warpedXZ * 0.13) * 0.5 + 0.5;
        float mesoPatch   = fbm3_gpu(warpedXZ * 0.032) * 0.5 + 0.5;
        float macroPatch  = fbm3_gpu(warpedXZ * 0.0085) * 0.5 + 0.5;

        // Natural topographic & geological factors for large-scale realism
        float valleyMoisture = 1.0 - smoothstep(1.5, 11.5, vTerrainWorldPos.y);
        float ridgeCrestExposure = smoothstep(8.0, 20.0, vTerrainWorldPos.y) * smoothstep(0.015, 0.10, vTerrainSlope);
        float contourStrata = sin(vTerrainWorldPos.y * 1.55 + mesoPatch * 4.5 + clumpNoise * 1.6) * 0.5 + 0.5;
        float slopeBreak = smoothstep(0.035, 0.14, vTerrainSlope + (clumpNoise - 0.5) * 0.03);
        float cliffMask  = smoothstep(0.075, 0.22, vTerrainSlope + (mesoPatch - 0.5) * 0.04);

        // Synchronized rolling wind waves
        float tWind = uTime * uWindSpeed;
        float wave1 = sin(vTerrainWorldPos.x * 0.14 + vTerrainWorldPos.z * 0.12 + tWind * 2.4);
        float wave2 = cos(vTerrainWorldPos.x * 0.35 - vTerrainWorldPos.z * 0.28 + tWind * 3.6) * 0.45;
        float windWave = (wave1 + wave2 * 0.7) * 0.5 + 0.5;

        // Convert vertex color from sRGB to linear space
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.001)), vec3(2.2));

        vec3 baseZoneColor = diffuseColor.rgb;
        vec3 blendedZoneColor = vec3(0.0);
        float zoneWeights12[12];
        getZoneWeights12_gpu(vTerrainWorldPos.xz, zoneWeights12);
        for (int localZone = 0; localZone < 12; localZone++) {
            float zoneWeight = zoneWeights12[localZone];
            if (zoneWeight <= 0.0) continue;
            diffuseColor.rgb = baseZoneColor;
            if (localZone == 1) {
                // ZONE 1: SAHARA DESERT — Warm golden-ochre erg dunes, terracotta slip-faces, dark gravel reg & salt wadis
                float sandRipple = sin(vTerrainWorldPos.x * 2.8 + vTerrainWorldPos.z * 1.9 + detailNoise * 2.4) * 0.5 + 0.5;
                float mesoDuneShade = sin((warpedXZ.x * 0.82 + warpedXZ.y * 0.57) * 0.065) * 0.5 + 0.5;
                vec3 sunlitErg   = vec3(0.33, 0.22, 0.13);
                vec3 warmOchre   = vec3(0.24, 0.15, 0.085);
                vec3 slipTerracotta = vec3(0.18, 0.105, 0.060);
                vec3 gravelReg   = vec3(0.14, 0.10, 0.068);
                vec3 wadiSabkha  = vec3(0.28, 0.23, 0.17);

                vec3 duneTint = mix(warmOchre, sunlitErg, smoothstep(0.22, 0.78, macroPatch * 0.50 + mesoDuneShade * 0.35 + sandRipple * 0.15));
                duneTint = mix(duneTint, slipTerracotta, smoothstep(0.35, 0.80, mesoPatch) * (0.45 + 0.45 * slopeBreak));
                // Dark wind-scoured desert pavement (reg) & pebble clusters in troughs
                float regMask = smoothstep(0.54, 0.82, (1.0 - macroPatch) * 0.6 + clumpNoise * 0.4) * (0.4 + 0.6 * valleyMoisture);
                duneTint = mix(duneTint, gravelReg, regMask * 0.68);
                // Crusted salt-pan sabkha in low dry basins
                float saltPanMask = smoothstep(0.68, 0.90, macroPatch * 0.65 + mesoPatch * 0.35) * valleyMoisture;
                duneTint = mix(duneTint, wadiSabkha, saltPanMask * 0.52);
                // Clump & micro pebble contrast that stays crisp at large scale
                duneTint *= (0.82 + clumpNoise * 0.22 + detailNoise * 0.12) * (0.97 + windWave * 0.05);
                diffuseColor.rgb = mix(diffuseColor.rgb, duneTint, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Stratified desert sandstone & dark ironstone strata on mesa cliffs & dune slip-faces
                if (vTerrainSlope > 0.045) {
                    float strata = sin(vTerrainWorldPos.y * 2.1 + mesoPatch * 2.8 + detailNoise * 1.4) * 0.5 + 0.5;
                    vec3 sandstoneA = vec3(0.28, 0.16, 0.095);
                    vec3 sandstoneB = vec3(0.14, 0.08, 0.048);
                    vec3 ironBand   = vec3(0.09, 0.052, 0.032);
                    vec3 mesaRock = mix(sandstoneB, sandstoneA, strata * 0.72 + clumpNoise * 0.28);
                    mesaRock = mix(mesaRock, ironBand, smoothstep(0.76, 0.94, contourStrata) * 0.65);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mesaRock, smoothstep(0.045, 0.18, vTerrainSlope));
                }

                // Compacted Desert Hardpan & Gravel Wadi Trail
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 wadiGravel = mix(vec3(0.20, 0.14, 0.09), vec3(0.14, 0.095, 0.06), gravelNoise * 0.5 + clumpNoise * 0.5);
                    vec3 dustyRut = vec3(0.10, 0.068, 0.042);
                    vec3 wadiColor = mix(wadiGravel, dustyRut, rutMask * 0.80);
                    diffuseColor.rgb = mix(diffuseColor.rgb, wadiColor, smoothstep(0.02, 0.48, roadMask));
                }

                // Lush Oasis Fringe & Wet Sand along oasis water edge
                float oasisMask = 1.0 - smoothstep(-2.55, -0.35, vTerrainWorldPos.y);
                if (oasisMask > 0.001) {
                    float wetZone = 1.0 - smoothstep(-2.65, -1.95, vTerrainWorldPos.y);
                    vec3 oasisMoss = mix(vec3(0.045, 0.11, 0.022), vec3(0.12, 0.14, 0.045), clumpNoise * 0.6 + detailNoise * 0.4);
                    vec3 wetOasisSand = vec3(0.075, 0.055, 0.032);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(oasisMoss, wetOasisSand, wetZone), oasisMask * (1.0 - roadMask * 0.7));
                }
            } else if (localZone == 2) {
                // ZONE 2: ALPINE MOUNTAINS — Dark craggy granite/slate massifs, subalpine tundra/scree & couloir snow
                // 1. Valley floor & lower foothills (< 18m): Rich dark spruce/pine turf, moss & needle duff
                vec3 pineTurf     = vec3(0.020, 0.052, 0.012);
                vec3 sunlitMeadow = vec3(0.044, 0.078, 0.018);
                vec3 needleDuff   = vec3(0.038, 0.028, 0.015);
                vec3 alpineHeather = vec3(0.058, 0.042, 0.020);

                vec3 valleyGround = mix(pineTurf, sunlitMeadow, smoothstep(0.25, 0.78, macroPatch * 0.55 + mesoPatch * 0.45));
                valleyGround = mix(valleyGround, needleDuff, smoothstep(0.55, 0.86, clumpNoise * 0.65 + (1.0 - mesoPatch) * 0.35) * 0.65);

                // 2. Subalpine transition (11m to 28m): Grass thins into alpine heather, krummholz scrub & dark talus scree
                float subalpineElev = vTerrainWorldPos.y + (mesoPatch - 0.5) * 5.5 + (clumpNoise - 0.5) * 2.5;
                float tundraFactor = smoothstep(10.5, 22.0, subalpineElev);
                valleyGround = mix(valleyGround, alpineHeather, tundraFactor * 0.75);
                valleyGround *= (0.82 + clumpNoise * 0.24 + detailNoise * 0.12) * (0.96 + windWave * 0.06);

                // 3. Dark Craggy Alpine Granite, Gneiss & Slate Massif (dominates all slopes AND elevations above ~20m)
                float rockAltitudeMask = smoothstep(15.0, 30.0, subalpineElev - vTerrainSlope * 18.0);
                float rockSlopeMask = smoothstep(0.032, 0.13, vTerrainSlope + (clumpNoise - 0.5) * 0.025);
                float totalRockMask = clamp(max(rockSlopeMask, rockAltitudeMask), 0.0, 1.0);

                // Couloir / ridge structural noise (ridges = 1, deep gullies/couloirs = 0)
                float rRidge1 = 1.0 - abs(valueNoise2D_gpu(worldS * 0.016));
                float rRidge2 = 1.0 - abs(valueNoise2D_gpu(worldS * 0.042 + vec2(29.0, 17.0)));
                float rRidge3 = 1.0 - abs(valueNoise2D_gpu(worldS * 0.095 + vec2(11.0, 53.0)));
                float ridgeStructure = clamp(rRidge1 * 0.55 + rRidge2 * 0.30 + rRidge3 * 0.15, 0.0, 1.0);
                // Tilted diagonal geological foliation (avoids horizontal contour-line stripes on peaks)
                float foliation = fbm3_gpu(vec2(worldS.x * 0.025 + vTerrainWorldPos.y * 0.045, worldS.y * 0.025 - vTerrainWorldPos.y * 0.035)) * 0.5 + 0.5;

                vec3 deepSlateCrevice = vec3(0.024, 0.027, 0.033);
                vec3 coldGranite      = vec3(0.056, 0.062, 0.072);
                vec3 weatheredGneiss  = vec3(0.076, 0.070, 0.062);
                vec3 sunlitCragLedge  = vec3(0.098, 0.104, 0.116);

                vec3 alpineRock = mix(deepSlateCrevice, coldGranite, smoothstep(0.18, 0.78, ridgeStructure * 0.55 + clumpNoise * 0.45));
                alpineRock = mix(alpineRock, weatheredGneiss, smoothstep(0.42, 0.78, foliation) * 0.55);
                alpineRock = mix(alpineRock, sunlitCragLedge, smoothstep(0.65, 0.92, ridgeStructure * detailNoise) * 0.52);
                // Darken vertical fracture chutes & scree gullies for strong large-scale 3D depth
                float chuteShadow = smoothstep(0.52, 0.15, ridgeStructure) * (0.5 + 0.5 * (1.0 - detailNoise));
                alpineRock *= (1.0 - chuteShadow * 0.45) * (0.82 + detailNoise * 0.30);

                vec3 mtnSurface = mix(valleyGround, alpineRock, totalRockMask);
                diffuseColor.rgb = mix(diffuseColor.rgb, mtnSurface, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // 4. Realistic High-Altitude Alpine Snow & Glacier Couloirs (above y ~ 42m)
                // Snow collects in concave gullies/couloirs and ledges, while steep crags & wind-scoured ridges stay dark rock!
                float gullySnowPocket = (1.0 - ridgeStructure) * 18.0 + (mesoPatch - 0.5) * 9.0 + (clumpNoise - 0.5) * 4.5;
                float snowElev = vTerrainWorldPos.y + gullySnowPocket - vTerrainSlope * 55.0;
                float rawSnowMask = smoothstep(42.0, 72.0, snowElev) * (1.0 - roadMask * 0.90);
                // Steep granite faces & sharp ridge crests break through the snowpack even at the summit
                float exposedRockRibs = smoothstep(0.085, 0.21, vTerrainSlope + ridgeStructure * 0.042 - (1.0 - mesoPatch) * 0.025);
                float snowMask = rawSnowMask * (1.0 - exposedRockRibs * 0.72);
                if (snowMask > 0.005) {
                    vec3 shadowFirnIce = vec3(0.18, 0.23, 0.30);
                    vec3 sunlitSnowPack = vec3(0.36, 0.40, 0.46);
                    vec3 alpineSnowCol = mix(shadowFirnIce, sunlitSnowPack, smoothstep(0.20, 0.82, clumpNoise * 0.55 + detailNoise * 0.45));
                    diffuseColor.rgb = mix(diffuseColor.rgb, alpineSnowCol, snowMask);
                }

                // Crushed Dark Slate & Wet Gravel Mountain Pass Road
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 slateRoad = mix(vec3(0.058, 0.062, 0.068), vec3(0.038, 0.041, 0.046), gravelNoise * 0.5 + clumpNoise * 0.5);
                    vec3 wetTrack  = vec3(0.022, 0.024, 0.028);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(slateRoad, wetTrack, rutMask * 0.85), smoothstep(0.02, 0.48, roadMask));
                }

                // Glacial Tarn Shoreline (dark slate pebbles & wet boulders)
                float tarnShore = 1.0 - smoothstep(-2.55, -1.35, vTerrainWorldPos.y);
                if (tarnShore > 0.001) {
                    vec3 pebbleShore = mix(vec3(0.065, 0.070, 0.078), vec3(0.028, 0.032, 0.038), gravelNoise * 0.6 + clumpNoise * 0.4);
                    diffuseColor.rgb = mix(diffuseColor.rgb, pebbleShore, tarnShore);
                }
            } else if (localZone == 3) {
                // ZONE 3: HIGHLAND ROLLING HILLS — Lush glens, golden gorse/bracken, purple-russet heather moors & chalk/limestone bluffs
                float hillCrestFactor = smoothstep(8.2, 16.5, vTerrainWorldPos.y + (macroPatch - 0.5) * 4.5);
                vec3 glenPasture   = vec3(0.022, 0.058, 0.012);
                vec3 sunlitTurf    = vec3(0.048, 0.088, 0.020);
                vec3 goldenBracken = vec3(0.086, 0.062, 0.016);
                vec3 moorHeather   = vec3(0.058, 0.032, 0.028);
                vec3 peatLoam      = vec3(0.036, 0.026, 0.016);

                vec3 hillGround = mix(glenPasture, sunlitTurf, smoothstep(0.20, 0.78, macroPatch * 0.55 + mesoPatch * 0.45));
                hillGround = mix(hillGround, goldenBracken, smoothstep(0.38, 0.82, mesoPatch * 0.65 + clumpNoise * 0.35) * (0.35 + 0.65 * hillCrestFactor));
                hillGround = mix(hillGround, moorHeather, smoothstep(0.52, 0.88, (1.0 - macroPatch) * 0.6 + clumpNoise * 0.4) * hillCrestFactor * 0.80);
                hillGround = mix(hillGround, peatLoam, slopeBreak * 0.55);
                hillGround *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14) * (0.96 + windWave * 0.07);
                diffuseColor.rgb = mix(diffuseColor.rgb, hillGround, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Exposed Weathered Limestone & Chalk Escarpment Bluffs on drumlin flanks
                if (vTerrainSlope > 0.05) {
                    vec3 darkLimestone = vec3(0.095, 0.088, 0.074);
                    vec3 chalkLedge    = vec3(0.19, 0.175, 0.145);
                    vec3 limestoneCol  = mix(darkLimestone, chalkLedge, contourStrata * 0.60 + clumpNoise * 0.40);
                    diffuseColor.rgb = mix(diffuseColor.rgb, limestoneCol, smoothstep(0.05, 0.19, vTerrainSlope));
                }

                // Sunken Country Lane with cobble/gravel & muddy wheel ruts
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    float centerCrown = exp(-pow(distFromCenter, 2.0) / 0.65);
                    vec3 dryRoad = mix(vec3(0.095, 0.072, 0.046), vec3(0.062, 0.046, 0.030), gravelNoise * 0.55 + clumpNoise * 0.45);
                    dryRoad = mix(dryRoad, goldenBracken, centerCrown * 0.42);
                    vec3 wetRut = vec3(0.028, 0.020, 0.012);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(dryRoad, wetRut, rutMask * 0.88), smoothstep(0.02, 0.48, roadMask));
                }
            } else if (localZone == 4) {
                // ZONE 4: ARDENNES WINTER & FROZEN STEPPE — Calibrated non-clipping snow drifts, wind-scoured frozen earth & dead bracken
                vec3 driftShadow  = vec3(0.22, 0.27, 0.35);
                vec3 sunlitSnow   = vec3(0.40, 0.44, 0.50);
                vec3 windCrust    = vec3(0.32, 0.36, 0.42);
                vec3 frozenEarth  = vec3(0.062, 0.048, 0.034);
                vec3 winterRush   = vec3(0.085, 0.068, 0.036);

                vec3 snowTint = mix(driftShadow, sunlitSnow, smoothstep(0.18, 0.82, macroPatch * 0.45 + mesoPatch * 0.35 + windWave * 0.20));
                snowTint = mix(snowTint, windCrust, clumpNoise * 0.35);
                // Wind-scoured patches of frozen mud, pine duff & winter reeds breaking up large-scale snowfields
                float barePatchMask = smoothstep(0.64, 0.88, (1.0 - macroPatch) * 0.5 + clumpNoise * 0.5) * (0.35 + 0.65 * slopeBreak);
                vec3 bareGround = mix(frozenEarth, winterRush, detailNoise);
                snowTint = mix(snowTint, bareGround, barePatchMask * 0.65);
                snowTint *= (0.88 + clumpNoise * 0.14 + detailNoise * 0.08);
                diffuseColor.rgb = mix(diffuseColor.rgb, snowTint, 1.0 - smoothstep(0.08, 0.42, roadMask));

                if (vTerrainSlope > 0.045) {
                    vec3 frostedSlate = mix(vec3(0.055, 0.058, 0.065), vec3(0.16, 0.18, 0.22), contourStrata * 0.6 + detailNoise * 0.4);
                    diffuseColor.rgb = mix(diffuseColor.rgb, frostedSlate, smoothstep(0.045, 0.18, vTerrainSlope));
                }

                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 packedSnowRoad = mix(vec3(0.24, 0.28, 0.33), vec3(0.14, 0.16, 0.19), gravelNoise * 0.5 + clumpNoise * 0.5);
                    vec3 icySlush = vec3(0.048, 0.042, 0.036);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(packedSnowRoad, icySlush, rutMask * 0.88), smoothstep(0.02, 0.48, roadMask));
                }

                float iceHole = 1.0 - smoothstep(-2.55, -1.35, vTerrainWorldPos.y);
                if (iceHole > 0.001) {
                    vec3 lakeIce = mix(vec3(0.16, 0.24, 0.32), vec3(0.32, 0.40, 0.48), clumpNoise * 0.6 + microNoise * 0.4);
                    diffuseColor.rgb = mix(diffuseColor.rgb, lakeIce, iceHole);
                }
            } else if (localZone == 5) {
                // ZONE 5: NORMANDY BOCAGE & SUNKEN LANES — Hedgerow field quilt, orchard clover, golden stubble & churned loam
                float fieldQuilt = sin(worldS.x * 0.024 + domainWarp.x * 0.04) * sin(worldS.y * 0.024 + domainWarp.y * 0.04);
                float quiltMask = smoothstep(-0.25, 0.25, fieldQuilt);
                vec3 deepOrchardGreen = vec3(0.018, 0.056, 0.011);
                vec3 lushBocagePasture = vec3(0.036, 0.082, 0.017);
                vec3 goldenHayField   = vec3(0.076, 0.072, 0.020);
                vec3 plowedClayLoam   = vec3(0.048, 0.034, 0.020);

                vec3 fieldA = mix(deepOrchardGreen, lushBocagePasture, mesoPatch * 0.65 + clumpNoise * 0.35);
                vec3 fieldB = mix(lushBocagePasture, goldenHayField, smoothstep(0.25, 0.80, macroPatch * 0.6 + mesoPatch * 0.4));
                vec3 bocageGround = mix(fieldA, fieldB, quiltMask);
                // Dark earthy hedgerow dike banks & churned field margins
                float dikeEdge = smoothstep(0.72, 0.96, max(abs(sin(worldS.x * 0.024)), abs(sin(worldS.y * 0.024))));
                bocageGround = mix(bocageGround, plowedClayLoam, clamp(dikeEdge * 0.55 + slopeBreak * 0.65, 0.0, 0.85));
                bocageGround *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14) * (0.96 + windWave * 0.07);
                diffuseColor.rgb = mix(diffuseColor.rgb, bocageGround, 1.0 - smoothstep(0.08, 0.42, roadMask));

                if (vTerrainSlope > 0.05) {
                    vec3 clayBank = mix(vec3(0.085, 0.060, 0.036), vec3(0.048, 0.034, 0.020), contourStrata * 0.6 + gravelNoise * 0.4);
                    diffuseColor.rgb = mix(diffuseColor.rgb, clayBank, smoothstep(0.05, 0.18, vTerrainSlope));
                }

                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    float centerCrown = exp(-pow(distFromCenter, 2.0) / 0.65);
                    vec3 heavyMud = mix(vec3(0.078, 0.054, 0.032), vec3(0.048, 0.033, 0.019), gravelNoise * 0.5 + clumpNoise * 0.5);
                    heavyMud = mix(heavyMud, deepOrchardGreen, centerCrown * 0.42);
                    vec3 wetMudRut = vec3(0.022, 0.015, 0.009);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(heavyMud, wetMudRut, rutMask * 0.90), smoothstep(0.02, 0.48, roadMask));
                }
            } else if (localZone == 6) {
                // ZONE 6: MONUMENT VALLEY — Deep Navajo vermilion sand, dark ironstone talus, arid scrub & De Chelly strata
                vec3 deepNavajoRed = vec3(0.24, 0.082, 0.038);
                vec3 sunlitVermilion = vec3(0.35, 0.135, 0.065);
                vec3 ironTalus     = vec3(0.13, 0.048, 0.026);
                vec3 desertSage    = vec3(0.095, 0.088, 0.042);

                vec3 sandTint = mix(deepNavajoRed, sunlitVermilion, smoothstep(0.20, 0.80, macroPatch * 0.50 + mesoPatch * 0.35 + detailNoise * 0.15));
                sandTint = mix(sandTint, ironTalus, smoothstep(0.52, 0.84, (1.0 - mesoPatch) * 0.6 + clumpNoise * 0.4) * 0.60);
                float scrubDots = smoothstep(0.68, 0.90, clumpNoise * detailNoise) * (1.0 - slopeBreak);
                sandTint = mix(sandTint, desertSage, scrubDots * 0.55);
                sandTint *= (0.82 + clumpNoise * 0.24 + detailNoise * 0.12);
                diffuseColor.rgb = mix(diffuseColor.rgb, sandTint, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Deep Navajo & Wingate Sandstone Strata on butte aprons & cliffs
                if (vTerrainSlope > 0.04) {
                    float strata = sin(vTerrainWorldPos.y * 1.85 + mesoPatch * 2.2 + detailNoise * 1.2) * 0.5 + 0.5;
                    vec3 vermilionRock = vec3(0.36, 0.115, 0.052);
                    vec3 burntUmber    = vec3(0.15, 0.048, 0.024);
                    vec3 capLedge      = vec3(0.34, 0.20, 0.11);
                    vec3 cliffColor    = mix(burntUmber, vermilionRock, strata * 0.72 + clumpNoise * 0.28);
                    cliffColor = mix(cliffColor, capLedge, smoothstep(0.76, 0.95, contourStrata) * 0.65);
                    diffuseColor.rgb = mix(diffuseColor.rgb, cliffColor, smoothstep(0.04, 0.17, vTerrainSlope));
                }

                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 redGravel = mix(vec3(0.22, 0.085, 0.042), vec3(0.14, 0.052, 0.026), gravelNoise * 0.5 + clumpNoise * 0.5);
                    vec3 deepRut = vec3(0.09, 0.034, 0.016);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(redGravel, deepRut, rutMask * 0.85), smoothstep(0.02, 0.48, roadMask));
                }
            } else if (localZone == 7) {
                // ZONE 7: GRAND CANYON — Stratified Kaibab/Coconino/Redwall/Hermit formations & terraced plateau
                float strataY = vTerrainWorldPos.y * 1.35 + mesoPatch * 1.6 + detailNoise * 0.7;
                float band1 = sin(strataY) * 0.5 + 0.5;
                float band2 = cos(strataY * 2.1 + clumpNoise * 1.2) * 0.5 + 0.5;
                vec3 kaibabBuff   = vec3(0.28, 0.21, 0.14);
                vec3 coconinoOchre = vec3(0.26, 0.15, 0.085);
                vec3 redwallRust  = vec3(0.28, 0.092, 0.048);
                vec3 hermitShale  = vec3(0.13, 0.048, 0.028);
                vec3 pinyonScrub  = vec3(0.055, 0.075, 0.028);

                vec3 plateauTint = mix(coconinoOchre, kaibabBuff, smoothstep(0.22, 0.78, macroPatch * 0.55 + band1 * 0.45));
                plateauTint = mix(plateauTint, redwallRust, smoothstep(0.55, 0.85, (1.0 - mesoPatch) * 0.6 + band2 * 0.4) * 0.55);
                float scrubPatch = smoothstep(0.62, 0.88, clumpNoise * macroPatch) * (1.0 - slopeBreak);
                plateauTint = mix(plateauTint, pinyonScrub, scrubPatch * 0.60);
                plateauTint *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14);
                diffuseColor.rgb = mix(diffuseColor.rgb, plateauTint, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Multi-layered Canyon Wall Strata on terrace steps & chasm walls
                if (vTerrainSlope > 0.035) {
                    vec3 canyonRock = mix(hermitShale, redwallRust, band1);
                    canyonRock = mix(canyonRock, coconinoOchre, smoothstep(0.45, 0.75, band2) * 0.60);
                    canyonRock = mix(canyonRock, kaibabBuff, smoothstep(0.75, 0.94, band2) * 0.68);
                    canyonRock *= (0.84 + detailNoise * 0.24);
                    diffuseColor.rgb = mix(diffuseColor.rgb, canyonRock, smoothstep(0.035, 0.16, vTerrainSlope));
                }

                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 canyonRoad = mix(vec3(0.18, 0.12, 0.08), vec3(0.11, 0.072, 0.048), gravelNoise * 0.55 + clumpNoise * 0.45);
                    vec3 wetTrack = vec3(0.065, 0.042, 0.028);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(canyonRoad, wetTrack, rutMask * 0.88), smoothstep(0.02, 0.48, roadMask));
                }
            } else if (localZone == 8) {
                // ZONE 8: ANCIENT EGYPT — Golden Saharan barchan dunes, Giza limestone bedrock shelves & Nile alluvial silt
                float duneRipple = sin(vTerrainWorldPos.x * 3.0 + vTerrainWorldPos.z * 2.1 + detailNoise * 2.2) * 0.5 + 0.5;
                vec3 sunlitGold    = vec3(0.36, 0.26, 0.14);
                vec3 deepBronzeSand = vec3(0.23, 0.155, 0.082);
                vec3 gizaLimestone = vec3(0.32, 0.27, 0.19);
                vec3 desertPebbles = vec3(0.16, 0.115, 0.068);

                vec3 duneTint = mix(deepBronzeSand, sunlitGold, smoothstep(0.20, 0.80, macroPatch * 0.50 + mesoPatch * 0.35 + duneRipple * 0.15));
                duneTint = mix(duneTint, gizaLimestone, smoothstep(0.58, 0.86, mesoPatch * 0.65 + contourStrata * 0.35) * 0.52);
                duneTint = mix(duneTint, desertPebbles, smoothstep(0.62, 0.88, clumpNoise * (1.0 - macroPatch)) * 0.50);
                duneTint *= (0.82 + clumpNoise * 0.22 + detailNoise * 0.12);
                diffuseColor.rgb = mix(diffuseColor.rgb, duneTint, 1.0 - smoothstep(0.08, 0.42, roadMask));

                if (vTerrainSlope > 0.045) {
                    vec3 nummuliticRock = mix(vec3(0.20, 0.155, 0.10), vec3(0.34, 0.28, 0.19), contourStrata * 0.65 + clumpNoise * 0.35);
                    diffuseColor.rgb = mix(diffuseColor.rgb, nummuliticRock, smoothstep(0.045, 0.18, vTerrainSlope));
                }

                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 caravanGravel = mix(vec3(0.22, 0.165, 0.105), vec3(0.15, 0.11, 0.068), gravelNoise * 0.55 + clumpNoise * 0.45);
                    vec3 dustyTrack = vec3(0.10, 0.072, 0.045);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(caravanGravel, dustyTrack, rutMask * 0.82), smoothstep(0.02, 0.48, roadMask));
                }

                // Nile Valley fertile black-silt & papyrus fringe
                float nileFringe = 1.0 - smoothstep(-2.55, -0.35, vTerrainWorldPos.y);
                if (nileFringe > 0.001) {
                    vec3 nileReeds = mix(vec3(0.035, 0.095, 0.018), vec3(0.048, 0.036, 0.022), clumpNoise * 0.55 + detailNoise * 0.45);
                    diffuseColor.rgb = mix(diffuseColor.rgb, nileReeds, nileFringe * (1.0 - roadMask * 0.7));
                }
            } else if (localZone == 9) {
                // ZONE 9: PACIFIC TROPICAL JUNGLE — Deep rainforest humus, vibrant emerald moss, laterite clay & mossy karst
                vec3 darkHumus     = vec3(0.034, 0.028, 0.014);
                vec3 emeraldMoss   = vec3(0.050, 0.068, 0.020);
                vec3 canopySunFern = vec3(0.105, 0.112, 0.030);
                vec3 lateriteSoil  = vec3(0.135, 0.060, 0.026);
                vec3 leafLitter    = vec3(0.115, 0.078, 0.032);

                vec3 jungleGround = mix(darkHumus, emeraldMoss, smoothstep(0.20, 0.78, macroPatch * 0.50 + mesoPatch * 0.50));
                jungleGround = mix(jungleGround, leafLitter, smoothstep(0.40, 0.75, (1.0 - macroPatch) * 0.6 + detailNoise * 0.4) * 0.70);
                jungleGround = mix(jungleGround, canopySunFern, smoothstep(0.55, 0.88, clumpNoise * mesoPatch) * 0.60);
                jungleGround = mix(jungleGround, lateriteSoil, clamp(slopeBreak * 0.65 + smoothstep(0.62, 0.88, 1.0 - clumpNoise) * 0.45, 0.0, 0.80));
                jungleGround *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14) * (0.95 + windWave * 0.08);
                diffuseColor.rgb = mix(diffuseColor.rgb, jungleGround, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Mossy Karst Limestone Mogote Cliffs
                if (vTerrainSlope > 0.045) {
                    vec3 karstDark = vec3(0.060, 0.056, 0.046);
                    vec3 karstLight = vec3(0.17, 0.155, 0.125);
                    vec3 karstRock = mix(karstDark, karstLight, contourStrata * 0.60 + clumpNoise * 0.40);
                    diffuseColor.rgb = mix(diffuseColor.rgb, karstRock, smoothstep(0.045, 0.18, vTerrainSlope));
                }

                // Sunken Jungle Red Laterite Mud Road
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 redLaterite = mix(vec3(0.11, 0.046, 0.020), vec3(0.068, 0.028, 0.012), gravelNoise * 0.55 + clumpNoise * 0.45);
                    vec3 deepMudRut  = vec3(0.024, 0.011, 0.005);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(redLaterite, deepMudRut, rutMask * 0.92), smoothstep(0.02, 0.48, roadMask));
                }
            } else if (localZone == 10) {
                // ZONE 10: ANCIENT GREECE — Mediterranean olive garrigue, golden dry phrygana, terra-rossa red soil & Pentelic karst
                vec3 oliveGarrigue = vec3(0.042, 0.072, 0.022);
                vec3 dryPhrygana   = vec3(0.14, 0.115, 0.052);
                vec3 terraRossa    = vec3(0.145, 0.068, 0.036);
                vec3 limestoneReg  = vec3(0.24, 0.22, 0.18);

                vec3 aegeanGround = mix(oliveGarrigue, dryPhrygana, smoothstep(0.22, 0.78, macroPatch * 0.55 + mesoPatch * 0.45));
                aegeanGround = mix(aegeanGround, terraRossa, smoothstep(0.52, 0.84, (1.0 - mesoPatch) * 0.6 + clumpNoise * 0.4) * 0.58);
                aegeanGround = mix(aegeanGround, limestoneReg, clamp(ridgeCrestExposure * 0.55 + smoothstep(0.68, 0.92, macroPatch * clumpNoise) * 0.40, 0.0, 0.75));
                aegeanGround *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14) * (0.96 + windWave * 0.06);
                diffuseColor.rgb = mix(diffuseColor.rgb, aegeanGround, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Sun-bleached Pentelic Marble & Attica Limestone Cliffs
                if (vTerrainSlope > 0.045) {
                    vec3 marbleShadow = vec3(0.16, 0.15, 0.13);
                    vec3 marbleLight  = vec3(0.32, 0.30, 0.25);
                    vec3 marbleCliff  = mix(marbleShadow, marbleLight, contourStrata * 0.65 + clumpNoise * 0.35);
                    diffuseColor.rgb = mix(diffuseColor.rgb, marbleCliff, smoothstep(0.045, 0.18, vTerrainSlope));
                }

                // Classical Greek Panathenaic Sacred Way (limestone flagstones & gravel)
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 sacredStone = mix(vec3(0.24, 0.21, 0.17), vec3(0.16, 0.14, 0.11), gravelNoise * 0.55 + clumpNoise * 0.45);
                    vec3 chariotRut  = vec3(0.11, 0.095, 0.075);
                    diffuseColor.rgb = mix(diffuseColor.rgb, mix(sacredStone, chariotRut, rutMask * 0.78), smoothstep(0.02, 0.48, roadMask));
                }
            } else if (localZone == 11) {
                // ZONE 11: IMPERIAL ROME — Campagna Romana pastures, golden Lazio wheatfields, sienna pozzolana earth & travertine bluffs
                vec3 romanPasture   = vec3(0.032, 0.072, 0.016);
                vec3 goldenCampagna = vec3(0.115, 0.092, 0.036);
                vec3 siennaEarth    = vec3(0.11, 0.058, 0.032);
                vec3 tufaOutcrop    = vec3(0.18, 0.145, 0.105);

                vec3 romanGround = mix(romanPasture, goldenCampagna, smoothstep(0.22, 0.78, macroPatch * 0.55 + mesoPatch * 0.45));
                romanGround = mix(romanGround, siennaEarth, smoothstep(0.54, 0.86, (1.0 - mesoPatch) * 0.6 + clumpNoise * 0.4) * 0.58);
                romanGround = mix(romanGround, tufaOutcrop, ridgeCrestExposure * 0.50);
                romanGround *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14) * (0.96 + windWave * 0.06);
                diffuseColor.rgb = mix(diffuseColor.rgb, romanGround, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Warm Roman Travertine & Volcanic Tufa Bluffs on the Seven Hills
                if (vTerrainSlope > 0.045) {
                    vec3 tufaDark       = vec3(0.13, 0.098, 0.068);
                    vec3 travertineLight = vec3(0.26, 0.21, 0.15);
                    vec3 travertineBluff = mix(tufaDark, travertineLight, contourStrata * 0.65 + clumpNoise * 0.35);
                    diffuseColor.rgb = mix(diffuseColor.rgb, travertineBluff, smoothstep(0.045, 0.18, vTerrainSlope));
                }

                // Roman Via Appia Basalt Polygonal Cobblestone Road (Via Consularis)
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    vec3 viaBasalt = mix(vec3(0.11, 0.105, 0.098), vec3(0.072, 0.068, 0.064), gravelNoise * 0.55 + clumpNoise * 0.45);
                    vec3 travertineCurb = vec3(0.22, 0.185, 0.14);
                    float curbMask = smoothstep(2.4, 3.6, distFromCenter) * (1.0 - smoothstep(3.6, 4.4, distFromCenter));
                    vec3 romanRoad = mix(viaBasalt, vec3(0.045, 0.042, 0.038), rutMask * 0.75);
                    romanRoad = mix(romanRoad, travertineCurb, curbMask * 0.65);
                    diffuseColor.rgb = mix(diffuseColor.rgb, romanRoad, smoothstep(0.02, 0.48, roadMask));
                }
            } else {
                // ZONE 0 (DEFAULT): COASTAL MEADOW COUNTRYSIDE — Rich multi-scale clover, sunlit fescue, golden thatch & loam breaks
                vec3 dampClover   = vec3(0.020, 0.056, 0.011);
                vec3 lushMeadow   = vec3(0.038, 0.082, 0.018);
                vec3 goldenThatch = vec3(0.074, 0.078, 0.020);
                vec3 richLoam     = vec3(0.044, 0.032, 0.018);

                vec3 meadowGround = mix(dampClover, lushMeadow, smoothstep(0.18, 0.76, macroPatch * 0.55 + mesoPatch * 0.45));
                meadowGround = mix(meadowGround, goldenThatch, smoothstep(0.42, 0.84, (1.0 - macroPatch) * 0.50 + mesoPatch * 0.50) * (0.45 + 0.55 * (1.0 - valleyMoisture)));
                meadowGround = mix(meadowGround, richLoam, clamp(slopeBreak * 0.60 + smoothstep(0.70, 0.92, clumpNoise * (1.0 - mesoPatch)) * 0.35, 0.0, 0.78));
                meadowGround *= (0.80 + clumpNoise * 0.26 + detailNoise * 0.14) * (0.96 + windWave * 0.07);

                diffuseColor.rgb = mix(diffuseColor.rgb, meadowGround, 1.0 - smoothstep(0.08, 0.42, roadMask));

                // Exposed Coastal Limestone & Craggy Outcrops on steeper meadow bluffs
                if (vTerrainSlope > 0.055) {
                    vec3 bluffDark  = vec3(0.075, 0.072, 0.064);
                    vec3 bluffLight = vec3(0.155, 0.148, 0.130);
                    vec3 bluffRock  = mix(bluffDark, bluffLight, contourStrata * 0.60 + clumpNoise * 0.40);
                    diffuseColor.rgb = mix(diffuseColor.rgb, bluffRock, smoothstep(0.055, 0.19, vTerrainSlope));
                }

                // Country Dirt Road with compacted dark earth, subtle verge crown, and matte wheel ruts
                if (roadMask > 0.02) {
                    float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
                    float rutMask = exp(-pow(distFromCenter - 1.35, 2.0) / 0.28);
                    float centerCrown = exp(-pow(distFromCenter, 2.0) / 0.65);
                    vec3 dryRoad = mix(vec3(0.068, 0.048, 0.029), vec3(0.044, 0.031, 0.018), gravelNoise * 0.55 + clumpNoise * 0.45);
                    dryRoad *= (0.86 + detailNoise * 0.24);
                    dryRoad = mix(dryRoad, lushMeadow, centerCrown * 0.38);
                    vec3 wetRut = vec3(0.024, 0.017, 0.010);
                    vec3 roadColor = mix(dryRoad, wetRut, rutMask * 0.88);
                    diffuseColor.rgb = mix(diffuseColor.rgb, roadColor, smoothstep(0.02, 0.48, roadMask));
                }
            }

            blendedZoneColor += diffuseColor.rgb * zoneWeight;
        }
        diffuseColor.rgb = blendedZoneColor;

        // Coastal Shoreline: Golden beach sand right along the water edge (-2.6m to -1.35m) across all coastal biomes
        float beachMask = 1.0 - smoothstep(-2.55, -1.35, vTerrainWorldPos.y);
        if (beachMask > 0.001) {
            float wetZone = 1.0 - smoothstep(-2.65, -2.05, vTerrainWorldPos.y);
            vec3 drySand = mix(vec3(0.24, 0.19, 0.12), vec3(0.18, 0.14, 0.09), clumpNoise * 0.5 + detailNoise * 0.5);
            vec3 wetSand = vec3(0.065, 0.072, 0.065);
            vec3 sandCol = mix(drySand, wetSand, wetZone * 0.90);
            diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, beachMask * (1.0 - roadMask * 0.8));
        }

        // Riverside: Cobblestones ("cobber stone"), alluvial sandbars, pebble shingle, wet waterline silt & riparian moss
        float riverDist = getRiverDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        vec2 _cachedCobbleGrad1 = vec2(0.0);
        vec2 _cachedCobbleGrad2 = vec2(0.0);
        if (riverDist < 24.5) {
            float dSpawnRiv = length(vTerrainWorldPos.xz);
            float spawnRivFade = smoothstep(26.0, 44.0, dSpawnRiv);
            float bankNoise = (mesoPatch - 0.5) * 2.8 + (clumpNoise - 0.5) * 1.4;
            float rDist = max(0.0, riverDist + bankNoise);
            float estuaryFade = 1.0 - smoothstep(200.0, 340.0, vTerrainWorldPos.z);
            float riversideZone = (1.0 - smoothstep(14.0, 23.5, rDist)) * spawnRivFade * estuaryFade;
            if (riversideZone > 0.001) {
                float cobbleDetailFade = 1.0 - smoothstep(65.0, 210.0, distToCam);
                vec2 cobbleWarp = vec2(detailNoise - 0.5, microNoise - 0.5) * 0.55;
                vec4 cobble1 = evalRiverCobble_gpu(vTerrainWorldPos.xz * 2.35 + cobbleWarp, _cachedCobbleGrad1);
                vec4 cobble2 = evalRiverCobble_gpu(vTerrainWorldPos.xz * 4.8 + vec2(31.7, 14.3) - cobbleWarp, _cachedCobbleGrad2);

                // Mineral color palette for rounded river cobblestones
                float cid = cobble1.z;
                vec3 stoneCol = vec3(0.105, 0.115, 0.128);
                stoneCol = mix(stoneCol, vec3(0.165, 0.145, 0.120), smoothstep(0.22, 0.42, cid));
                stoneCol = mix(stoneCol, vec3(0.210, 0.165, 0.105), smoothstep(0.48, 0.68, cid));
                stoneCol = mix(stoneCol, vec3(0.070, 0.072, 0.076), smoothstep(0.72, 0.86, cid));
                stoneCol = mix(stoneCol, vec3(0.265, 0.245, 0.205), smoothstep(0.88, 0.98, cid));
                stoneCol *= (0.86 + detailNoise * 0.22 + microNoise * 0.10);

                // Smaller river pebble shingle layer
                float pid = cobble2.z;
                vec3 pebbleCol = mix(vec3(0.12, 0.11, 0.095), vec3(0.22, 0.18, 0.13), pid);
                pebbleCol *= (0.85 + gravelNoise * 0.24);
                vec3 pebbleMortar = vec3(0.068, 0.055, 0.038);
                vec3 cobblePebbleCol = mix(pebbleCol * (0.82 + 0.28 * cobble2.x), pebbleMortar, cobble2.y * 0.72 * cobbleDetailFade);

                vec3 sandSiltMortar = vec3(0.065, 0.052, 0.036);
                vec3 cobbleCol = mix(stoneCol * (0.78 + 0.34 * cobble1.x), sandSiltMortar, cobble1.y * 0.85 * cobbleDetailFade);
                float finePebbleMix = smoothstep(0.45, 0.82, 1.0 - clumpNoise) * 0.55;
                cobbleCol = mix(cobbleCol, cobblePebbleCol, finePebbleMix);

                // Alluvial river sand & current ripple bars
                float riverSandRipple = sin(vTerrainWorldPos.x * 2.6 - vTerrainWorldPos.z * 1.8 + detailNoise * 2.8) * 0.5 + 0.5;
                vec3 dryRiverSand = mix(vec3(0.19, 0.15, 0.095), vec3(0.27, 0.215, 0.135), riverSandRipple * 0.40 + clumpNoise * 0.35 + detailNoise * 0.25);
                dryRiverSand *= (0.86 + microNoise * 0.22);

                // Pebble shingle / gravel transition
                vec3 shingleCol = mix(dryRiverSand * 0.78, cobblePebbleCol, 0.62);

                // Distribute sandbars, shingle, and cobblestone shoals organically along the riverside
                float barSelect = clamp(mesoPatch * 0.62 + clumpNoise * 0.38, 0.0, 1.0);
                float sandBarMask = 1.0 - smoothstep(0.28, 0.60, barSelect);
                float cobbleBarMask = smoothstep(0.36, 0.68, barSelect);
                float fordMask = smoothstep(0.05, 0.45, roadMask);

                vec3 riversideCol = mix(shingleCol, dryRiverSand, sandBarMask);
                riversideCol = mix(riversideCol, cobbleCol, clamp(cobbleBarMask * 0.88 + fordMask * 0.85, 0.0, 1.0));

                // Upper bank riparian moss & damp alluvial loam (suppressed in arid/winter zones)
                float aridRiverFactor = clamp(zoneWeights12[1] + zoneWeights12[6] + zoneWeights12[7] + zoneWeights12[8], 0.0, 1.0);
                float winterRiverFactor = clamp(zoneWeights12[4], 0.0, 1.0);
                float bankMossMask = smoothstep(10.5, 16.5, rDist) * (1.0 - smoothstep(17.5, 23.5, rDist))
                    * smoothstep(0.35, 0.75, clumpNoise) * (1.0 - aridRiverFactor * 0.85) * (1.0 - winterRiverFactor * 0.75);
                vec3 riparianMoss = mix(vec3(0.028, 0.064, 0.014), vec3(0.050, 0.038, 0.020), detailNoise * 0.55 + slopeBreak * 0.45);
                riversideCol = mix(riversideCol, riparianMoss, bankMossMask * 0.72);

                // Waterline wet darkening & submerged riverbed silt
                float wetBank = 1.0 - smoothstep(-2.60, -1.65, vTerrainWorldPos.y);
                float submergedBed = 1.0 - smoothstep(-2.90, -2.35, vTerrainWorldPos.y);
                riversideCol *= mix(1.0, 0.45, wetBank * 0.85);
                riversideCol = mix(riversideCol, vec3(0.030, 0.032, 0.026), submergedBed * 0.55);

                // Subtle winter frost dusting on dry upper cobbles & sandbars in winter zone
                if (winterRiverFactor > 0.01) {
                    float snowRim = smoothstep(-2.1, -1.2, vTerrainWorldPos.y) * smoothstep(0.35, 0.85, clumpNoise);
                    riversideCol = mix(riversideCol, vec3(0.30, 0.34, 0.40), winterRiverFactor * snowRim * 0.55);
                }

                float dryRoadOverride = smoothstep(0.15, 0.65, roadMask) * smoothstep(-1.95, -1.10, vTerrainWorldPos.y) * 0.55;
                diffuseColor.rgb = mix(diffuseColor.rgb, riversideCol, riversideZone * (1.0 - dryRoadOverride));
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
        float wRoughZ[12];
        getZoneWeights12_gpu(vTerrainWorldPos.xz, wRoughZ);
        float aridRoughMask = clamp(wRoughZ[1] + wRoughZ[6] + wRoughZ[7] + wRoughZ[8], 0.0, 1.0);
        float wetShoreRough = (1.0 - smoothstep(-2.4, -1.25, vTerrainWorldPos.y)) * (1.0 - aridRoughMask * 0.95);
        float rRoad = getRoadFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        roughnessFactor = mix(0.88, 0.76, smoothstep(0.1, 0.6, rRoad));
        if (rRoad > 0.05) {
            float distFromCenter = getRoadDistance_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
            float rut = exp(-pow(distFromCenter - 1.35, 2.0) / 0.35);
            float wetRutR = mix(0.62, 0.30, wRoughZ[4]);
            wetRutR = mix(wetRutR, 0.36, wRoughZ[5]);
            roughnessFactor = mix(roughnessFactor, mix(wetRutR, 0.86, aridRoughMask), rut * rRoad);
        }
        if (wRoughZ[2] > 0.0 && vTerrainWorldPos.y > 42.0) {
            float snowR = smoothstep(42.0, 72.0, vTerrainWorldPos.y - vTerrainSlope * 30.0);
            roughnessFactor = mix(roughnessFactor, 0.72, snowR * 0.75 * wRoughZ[2]);
        }
        if (wRoughZ[4] > 0.0) {
            roughnessFactor = mix(roughnessFactor, 0.74, wRoughZ[4] * 0.75);
        }
        roughnessFactor = mix(roughnessFactor, 0.26, wetShoreRough * 0.90);
        float rRiver = getRiverFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        float rRiverside = getRiversideFactor_gpu(vTerrainWorldPos.x, vTerrainWorldPos.z);
        if (rRiver > 0.01 || rRiverside > 0.01) {
            float wetRiver = (1.0 - smoothstep(-2.60, -1.65, vTerrainWorldPos.y)) * clamp(rRiver + rRiverside, 0.0, 1.0);
            roughnessFactor = mix(roughnessFactor, 0.68, rRiverside * (1.0 - wetRiver) * 0.65);
            roughnessFactor = mix(roughnessFactor, 0.22, wetRiver * 0.92);
        }
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `
        #include <lights_fragment_end>
        float dryTerrainSpecScale = mix(0.95, 0.24, smoothstep(0.55, 0.85, roughnessFactor));
        reflectedLight.directSpecular *= dryTerrainSpecScale;
        reflectedLight.indirectSpecular *= dryTerrainSpecScale * 0.85;
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `
        gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vTerrainWorldPos, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
        #include <tonemapping_fragment>
        `
    );

    injectCloudShadowFragment(shader, 'vTerrainWorldPos');
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
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    fog: false
});

const TREE_WIND_SWAY_UNIFORMS_GLSL = `
    uniform float uTime;
    uniform float uWindSpeed;
    uniform vec3 uCameraPos;
`;

/**
 * Builds the shared vertex wind-sway GLSL chunk for treeMaterial and its shadow depth material.
 * Passing includeVaryings=false omits varyings and normal tilting in the depth pass.
 */
function buildTreeWindSwayVertexChunk(includeVaryings) {
    return `
        #include <begin_vertex>
        float treeVertHeight = max(0.0, position.y);
        float treeCanopyOuter = clamp(length(position.xz) / 3.2, 0.0, 1.0);

        vec4 localBasePos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
            localBasePos = instanceMatrix * localBasePos;
        #endif
        vec4 baseWorld = modelMatrix * localBasePos;
        float distTreeSway = length(baseWorld.xz - uCameraPos.xz);
        bool isFoliageVert = (uv.y > 0.5 || uv.x < 0.5);
        float tW = uTime * uWindSpeed;
        // Synchronized rolling wind waves across trees & grass (matching coastal_countryside_3d_scene.html)
        float wave1 = sin(baseWorld.x * 0.14 + baseWorld.z * 0.12 + tW * 2.4);
        float wave2 = (distTreeSway < 85.0)
            ? cos(baseWorld.x * 0.35 - baseWorld.z * 0.28 + tW * 3.6) * 0.45 * (1.0 - smoothstep(60.0, 85.0, distTreeSway))
            : 0.0;
        float heightFactor = pow(clamp(treeVertHeight / 12.0, 0.0, 1.2), 1.35);
        float trunkSway = (wave1 + wave2 * 0.5) * 0.22 * heightFactor;
        transformed.x += trunkSway;
        transformed.z += trunkSway * 0.60;

        if (isFoliageVert) {
            float boughWave = (wave1 + wave2) * 0.15 * (0.30 + 0.70 * treeCanopyOuter);
            float leafFlutter = (distTreeSway < 65.0)
                ? sin(tW * 4.2 + position.x * 2.6 + position.y * 1.8 + position.z * 2.6) * 0.045 * (0.3 + 0.7 * treeCanopyOuter) * (1.0 - smoothstep(45.0, 65.0, distTreeSway))
                : 0.0;
            transformed.x += boughWave + leafFlutter;
            transformed.z += (boughWave + leafFlutter) * 0.65;
            transformed.y -= abs(boughWave) * 0.10;
        }
        ${includeVaryings ? `
        vFoliageUv = uv;
        vTreeHeight = treeVertHeight;
        vCanopyOuter = treeCanopyOuter;
        vTreeWindWave = wave1 * 0.5 + 0.5;
        vec4 swayedLocalPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
            swayedLocalPos = instanceMatrix * swayedLocalPos;
        #endif
        vTreeWorldPos = (modelMatrix * swayedLocalPos).xyz;

        // True world-space & view-space outward canopy normals tilted by wind waves for light-angle illumination
        vec3 tiltedObjNorm = objectNormal;
        if (isFoliageVert) {
            tiltedObjNorm = normalize(objectNormal + vec3(-trunkSway * 0.55, 0.0, -trunkSway * 0.35));
        }
        #ifdef USE_INSTANCING
            tiltedObjNorm = normalize(mat3(instanceMatrix) * tiltedObjNorm);
        #endif
        vTreeWorldNormal = normalize((modelMatrix * vec4(tiltedObjNorm, 0.0)).xyz);
        vBotanicalNormal = normalize(normalMatrix * tiltedObjNorm);
        ` : ''}
    `;
}

let sharedTreeDepthMaterial = null;
function getTreeDepthMaterial() {
    if (!sharedTreeDepthMaterial) {
        sharedTreeDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: getBotanicalAtlas(),
            alphaTest: 0.48,
            side: THREE.DoubleSide
        });
        sharedTreeDepthMaterial.customProgramCacheKey = () => 'tree-depth-wind-sway';
        sharedTreeDepthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = terrainUniforms.uTime;
            shader.uniforms.uWindSpeed = terrainUniforms.uWindSpeed;
            shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
            shader.vertexShader = TREE_WIND_SWAY_UNIFORMS_GLSL + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                buildTreeWindSwayVertexChunk(false)
            );
        };
    }
    return sharedTreeDepthMaterial;
}
treeMaterial.customDepthMaterial = getTreeDepthMaterial();

treeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uWindSpeed = terrainUniforms.uWindSpeed;
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
    shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
    shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
    shader.uniforms.uSssStrength = (window.celestialLighting && window.celestialLighting.sssStrength)
        ? window.celestialLighting.sssStrength
        : { value: 1.0 };
    shader.uniforms.uFoliageMap = { value: getBotanicalAtlas() };
    shader.uniforms.uSeedOffset = terrainUniforms.uSeedOffset;
    shader.uniforms.uRoadBaseX = terrainUniforms.uRoadBaseX;
    shader.uniforms.uZoneType = terrainUniforms.uZoneType;
    shader.uniforms.uSpawnZone = terrainUniforms.uSpawnZone;

    shader.vertexShader = TREE_WIND_SWAY_UNIFORMS_GLSL + `
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
        buildTreeWindSwayVertexChunk(true)
    );

    shader.fragmentShader = `
        uniform sampler2D uFoliageMap;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSkyTopColor;
        uniform float uHazeStrength;
        uniform float uSssStrength;
        varying vec3 vTreeWorldPos;
        varying vec3 vTreeWorldNormal;
        varying vec3 vBotanicalNormal;
        varying float vTreeHeight;
        varying float vCanopyOuter;
        varying float vTreeWindWave;
        varying vec2 vFoliageUv;
        ${SHARED_TERRAIN_GLSL}
        ${BABYLON_HAZE_GLSL}
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

        float wTreeZone[6];
        getZoneWeights6_gpu(vTreeWorldPos.xz, wTreeZone);
        float winterTreeFactor = clamp(wTreeZone[4] + wTreeZone[2] * smoothstep(58.0, 76.0, vTreeWorldPos.y), 0.0, 1.0);

        if (isFoliage) {
            float distTreeCam = length(vTreeWorldPos.xz - uCameraPos.xz);
            float alphaBoost = 1.0 + clamp((distTreeCam - 35.0) / 320.0, 0.0, 0.35);
            if (texelColor.a * alphaBoost < 0.48) discard;
            vec3 viewDir = normalize(cameraPosition - vTreeWorldPos);
            vec3 sunDir = normalize(uSunDir);
            vec3 worldNorm = normalize(vTreeWorldNormal);

            // Light-angle-dependent sun & distributed backlit SSS
            float sunDot = max(dot(worldNorm, sunDir), 0.0);
            float backLight = pow(max(dot(-viewDir, sunDir), 0.0), 3.0);
            float outerTip = smoothstep(0.12, 0.92, vCanopyOuter);
            float clusterShade = clamp(dot(diffuseColor.rgb, vec3(0.30, 0.59, 0.11)) * 1.35, 0.25, 1.15);
            float leafDistVar = 0.55 + 0.45 * sin(vTreeWorldPos.x * 1.7 + vTreeWorldPos.y * 2.3 + vTreeWorldPos.z * 1.9);
            float canopyAO = mix(0.60, 1.05, vCanopyOuter);
            float sssFactor = backLight * outerTip * clusterShade * leafDistVar;
            float _treeCloudLit = sampleCloudShadowFactor(vTreeWorldPos, uCloudSunDir, uCloudTime, uCloudTex, uCloudShadowParams);
            vec3 sss = uSunColor * sssFactor * (linearTexel * 1.25 + vec3(0.02, 0.04, 0.005)) * 0.65 * uSssStrength * _treeCloudLit;
            vec3 halfVec = normalize(sunDir + viewDir);
            float specSheen = pow(max(dot(worldNorm, halfVec), 0.0), 14.0) * sunDot * vCanopyOuter * _treeCloudLit;
            vec3 treeBaseColor = (linearTexel * diffuseColor.rgb * canopyAO + sss + uSunColor * specSheen * 0.08) * (0.90 + vTreeWindWave * 0.20 * vCanopyOuter);

            // Winter snow accumulation on conifer boughs, tiers & foliage canopy
            if (winterTreeFactor > 0.01) {
                float snowAngle = smoothstep(0.14, 0.62, worldNorm.y * 0.82 + vCanopyOuter * 0.30);
                float needleSnow = clamp(snowAngle * 1.10, 0.0, 1.0) * winterTreeFactor;

                vec3 snowSun = mix(vec3(0.28, 0.33, 0.40), vec3(0.46, 0.50, 0.56), sunDot * 0.5 + 0.5);
                float needleSparkle = pow(max(dot(worldNorm, halfVec), 0.0), 24.0) * 0.14;
                vec3 snowFoliageCol = snowSun * (0.92 + needleSparkle);

                treeBaseColor = mix(treeBaseColor, snowFoliageCol, needleSnow * 0.85);
            }

            diffuseColor.rgb = treeBaseColor;
        } else {
            vec3 trunkBase = linearTexel * diffuseColor.rgb;
            if (winterTreeFactor > 0.01) {
                vec3 worldNorm = normalize(vTreeWorldNormal);
                float trunkSnow = smoothstep(0.38, 0.85, worldNorm.y) * winterTreeFactor * 0.65;
                trunkBase = mix(trunkBase, vec3(0.36, 0.40, 0.46), trunkSnow);
            }
            diffuseColor.rgb = trunkBase;
        }
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `
        gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vTreeWorldPos, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
        #include <tonemapping_fragment>
        `
    );

    injectCloudShadowFragment(shader, 'vTreeWorldPos');
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

const vInitAtlas = getVillageAtlas();
const villageMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.04,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide,
    fog: false,
    map: vInitAtlas ? vInitAtlas.albedo : null,
    normalMap: vInitAtlas ? vInitAtlas.normal : null,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: vInitAtlas ? vInitAtlas.roughness : null
});

villageMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSeedOffset = terrainUniforms.uSeedOffset;
    shader.uniforms.uRoadBaseX = terrainUniforms.uRoadBaseX;
    shader.uniforms.uZoneType = terrainUniforms.uZoneType;
    shader.uniforms.uSpawnZone = terrainUniforms.uSpawnZone;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
    shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;

    shader.vertexShader = `
        varying vec3 vBldgWorldPos;
        varying vec3 vBldgWorldNormal;
        varying vec3 vBldgModelPos;
        varying vec2 vBldgUv;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vBldgModelPos = position;
        vBldgUv = uv;
        vBldgWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vBldgWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        `
    );

    shader.fragmentShader = `
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSkyTopColor;
        uniform vec3 uCameraPos;
        uniform float uHazeStrength;
        varying vec3 vBldgWorldPos;
        varying vec3 vBldgWorldNormal;
        varying vec3 vBldgModelPos;
        varying vec2 vBldgUv;
        ${SHARED_TERRAIN_GLSL}
        ${BABYLON_HAZE_GLSL}
    ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #include <normal_fragment_maps>
        #ifdef USE_NORMALMAP
        float wBldgZoneNorm[6];
        getZoneWeights6_gpu(vBldgWorldPos.xz, wBldgZoneNorm);
        float winterBldgFactorNorm = clamp(wBldgZoneNorm[4] + wBldgZoneNorm[2] * smoothstep(58.0, 76.0, vBldgWorldPos.y), 0.0, 1.0);
        bool isRoofSurfNorm = (vBldgWorldNormal.y > 0.22) && (vBldgModelPos.y > 1.2 || (vBldgUv.x > 0.50 && vBldgUv.y > 0.50));
        if (isRoofSurfNorm && winterBldgFactorNorm > 0.05) {
            float roofSmooth = smoothstep(0.22, 0.50, vBldgWorldNormal.y) * winterBldgFactorNorm;
            normal = normalize(mix(normal, normalize(vNormal), roofSmooth * 0.82));
        }
        #endif
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float wBldgZone[6];
        getZoneWeights6_gpu(vBldgWorldPos.xz, wBldgZone);
        float winterBldgFactor = clamp(wBldgZone[4] + wBldgZone[2] * smoothstep(58.0, 76.0, vBldgWorldPos.y), 0.0, 1.0);

        bool isRoofSurface = (vBldgWorldNormal.y > 0.22) && (vBldgModelPos.y > 1.2 || (vBldgUv.x > 0.50 && vBldgUv.y > 0.50));

        if (winterBldgFactor > 0.02) {
            vec3 sunD = normalize(uSunDir);
            float sunLit = max(dot(vBldgWorldNormal, sunD), 0.0);

            if (isRoofSurface) {
                float roofSlope = smoothstep(0.20, 0.48, vBldgWorldNormal.y);
                float roofSnow = roofSlope * winterBldgFactor;

                vec3 roofSnowColor = mix(vec3(0.32, 0.36, 0.42), vec3(0.48, 0.52, 0.58), sunLit * 0.45 + 0.55);
                float drift = sin(vBldgWorldPos.x * 2.8 + vBldgWorldPos.z * 1.9) * cos(vBldgWorldPos.z * 2.4) * 0.03;
                roofSnowColor += drift;

                diffuseColor.rgb = mix(diffuseColor.rgb, roofSnowColor, roofSnow * 0.92);
            } else if (vBldgWorldNormal.y > 0.70 && vBldgModelPos.y > 0.75) {
                float ledgeSnow = smoothstep(0.70, 0.90, vBldgWorldNormal.y) * winterBldgFactor * 0.72;
                vec3 ledgeSnowColor = vec3(0.44, 0.48, 0.54);
                diffuseColor.rgb = mix(diffuseColor.rgb, ledgeSnowColor, ledgeSnow);
            }
        }
        // Babylon-style wall-foot dampness & ground contact AO
        float wallFoot = 1.0 - smoothstep(0.0, 1.35, max(0.0, vBldgModelPos.y));
        diffuseColor.rgb *= mix(1.0, 0.72, wallFoot * 0.75);
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `
        gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vBldgWorldPos, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
        #include <tonemapping_fragment>
        `
    );

    injectCloudShadowFragment(shader, 'vBldgWorldPos', true);
};

const rockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8a8479).convertSRGBToLinear(),
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.03,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide,
    fog: false
});

// Mossy weathered craggy boulders: fractured stone faces, crevice AO, lichen mottling & patchy moss
rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
    shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
    shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
    shader.uniforms.uSssStrength = (window.celestialLighting && window.celestialLighting.sssStrength)
        ? window.celestialLighting.sssStrength
        : { value: 1.0 };
    shader.vertexShader = 'varying vec3 vRockWN;\nvarying vec3 vRockWP;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRockWN = normalize(mat3(modelMatrix) * normal);
        vRockWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = `varying vec3 vRockWN;
        varying vec3 vRockWP;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSkyTopColor;
        uniform float uHazeStrength;
        ${BABYLON_HAZE_GLSL}
        float rockHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float rockNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(rockHash(i), rockHash(i + vec2(1.0, 0.0)), f.x), mix(rockHash(i + vec2(0.0, 1.0)), rockHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float rockFbm(vec2 p) {
            return rockNoise(p) * 0.50 + rockNoise(p * 2.13 + vec2(5.2, 1.3)) * 0.26 + rockNoise(p * 4.7 + vec2(1.7, 9.2)) * 0.15 + rockNoise(p * 10.3) * 0.09;
        }
    ` + shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 rUv = vRockWP.xz * 1.8 + vec2(vRockWP.y * 1.4, -vRockWP.y * 1.1);
        float hC = rockFbm(rUv * 3.8);
        float hX = rockFbm((rUv + vec2(0.025, 0.0)) * 3.8);
        float hY = rockFbm((rUv + vec2(0.0, 0.025)) * 3.8);
        vec3 bumpN = normalize(vec3((hC - hX) * 9.5, (hC - hY) * 9.5, 1.0));
        normal = normalize(normal + vec3(bumpN.x, bumpN.y * 0.65, bumpN.x * 0.65) * 0.65);
        `
    ).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 rp = vRockWP.xz * 1.35 + vRockWP.y * 0.95;
        float rn = rockFbm(rp * 2.8);
        float microN = rockNoise(rp * 18.0);
        float fineN  = rockNoise(rp * 42.0);
        float crackMask = smoothstep(0.042, 0.0, abs(rockNoise(rp * 1.9 + vec2(rn * 0.45)) - 0.5));
        vec3 wn = normalize(vRockWN);
        float up = smoothstep(0.25, 0.78, wn.y);

        // Weathered grey-brown limestone/granite with fine mineral grain & dark crevices
        vec3 darkStone = vec3(0.18, 0.16, 0.13);
        vec3 lightStone = vec3(0.48, 0.44, 0.37);
        vec3 warmStone = mix(darkStone, lightStone, rn * 0.60 + microN * 0.28 + fineN * 0.12);
        float lichen = smoothstep(0.64, 0.80, rockNoise(rp * 5.5)) * 0.38;
        warmStone = mix(warmStone, vec3(0.54, 0.55, 0.43), lichen);
        warmStone *= (1.0 - crackMask * 0.68);
        vec3 stone = diffuseColor.rgb * warmStone * 1.75;

        // Organic patchy moss & olive lichen clinging to upper crags & pockets (not a solid paint coat)
        float mossCluster = rockFbm(vRockWP.xz * 1.6 + vec2(3.7, 8.1));
        float mossTufts = smoothstep(0.38, 0.68, mossCluster * 0.72 + microN * 0.28);
        float mossAmt = clamp(up * mossTufts + crackMask * up * 0.45, 0.0, 1.0);
        vec3 deepMoss = vec3(0.048, 0.090, 0.018);
        vec3 sunlitMoss = vec3(0.155, 0.210, 0.045);
        vec3 mossCol = mix(deepMoss, sunlitMoss, microN * 0.65 + fineN * 0.35);
        diffuseColor.rgb = mix(stone, mossCol, mossAmt * 0.78);
        `
    ).replace(
        '#include <tonemapping_fragment>',
        `
        gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vRockWP, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
        #include <tonemapping_fragment>
        `
    );

    injectCloudShadowFragment(shader, 'vRockWP', true);
};

const desertRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x9a5c32).convertSRGBToLinear(),
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.03,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide,
    fog: false
});

desertRockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
    shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
    shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
    shader.vertexShader = 'varying vec3 vDesertRockWP;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDesertRockWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = `varying vec3 vDesertRockWP;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSkyTopColor;
        uniform float uHazeStrength;
        ${BABYLON_HAZE_GLSL}
    ` + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float strata = 0.78 + 0.22 * sin(vDesertRockWP.y * 5.5 + vDesertRockWP.x * 0.8);
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.001)), vec3(1.5)) * strata;`
    ).replace(
        '#include <tonemapping_fragment>',
        `gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vDesertRockWP, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
        #include <tonemapping_fragment>`
    );

    injectCloudShadowFragment(shader, 'vDesertRockWP', true);
};

const mountainRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xa8b2be).convertSRGBToLinear(),
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.04,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide,
    fog: false
});

mountainRockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uSunColor = terrainUniforms.uSunColor;
    shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
    shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
    shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
    shader.vertexShader = 'varying vec3 vMtnRockWN;\nvarying vec3 vMtnRockWP;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMtnRockWN = normalize(mat3(modelMatrix) * normal);
        vMtnRockWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader = `varying vec3 vMtnRockWN;
        varying vec3 vMtnRockWP;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSkyTopColor;
        uniform float uHazeStrength;
        ${BABYLON_HAZE_GLSL}
        float mRockHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mRockNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mRockHash(i), mRockHash(i + vec2(1.0, 0.0)), f.x), mix(mRockHash(i + vec2(0.0, 1.0)), mRockHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float mRockFbm(vec2 p) {
            return mRockNoise(p) * 0.50 + mRockNoise(p * 2.13 + vec2(5.2, 1.3)) * 0.26 + mRockNoise(p * 4.7 + vec2(1.7, 9.2)) * 0.15 + mRockNoise(p * 10.3) * 0.09;
        }
    ` + shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec2 rUv = vMtnRockWP.xz * 1.8 + vec2(vMtnRockWP.y * 1.6, -vMtnRockWP.y * 1.2);
        float hC = mRockFbm(rUv * 3.8);
        float hX = mRockFbm((rUv + vec2(0.025, 0.0)) * 3.8);
        float hY = mRockFbm((rUv + vec2(0.0, 0.025)) * 3.8);
        vec3 bumpN = normalize(vec3((hC - hX) * 10.5, (hC - hY) * 10.5, 1.0));
        normal = normalize(normal + vec3(bumpN.x, bumpN.y * 0.65, bumpN.x * 0.65) * 0.70);
        `
    ).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 rp = vMtnRockWP.xz * 1.4 + vMtnRockWP.y * 1.1;
        float rn = mRockFbm(rp * 2.8);
        float microN = mRockNoise(rp * 18.0);
        float fineN  = mRockNoise(rp * 42.0);
        float crackMask = smoothstep(0.045, 0.0, abs(mRockNoise(rp * 1.9 + vec2(rn * 0.45)) - 0.5));
        vec3 wn = normalize(vMtnRockWN);
        float up = smoothstep(0.30, 0.80, wn.y);

        // Cold alpine slate & dark granite with quartz veins, deep fractures & alpine moss/lichen
        vec3 darkSlate = vec3(0.18, 0.20, 0.23);
        vec3 coldGranite = vec3(0.42, 0.45, 0.49);
        vec3 slateStone = mix(darkSlate, coldGranite, rn * 0.58 + microN * 0.30 + fineN * 0.12);
        float lichen = smoothstep(0.62, 0.80, mRockNoise(rp * 5.2)) * 0.35;
        slateStone = mix(slateStone, vec3(0.32, 0.36, 0.24), lichen);
        slateStone *= (1.0 - crackMask * 0.65);
        vec3 stone = diffuseColor.rgb * slateStone * 1.65;

        // High-altitude snow frost when the boulder sits above the mountain snowline (y > 42m)
        float highSnow = smoothstep(42.0, 65.0, vMtnRockWP.y) * up;
        stone = mix(stone, vec3(0.34, 0.38, 0.44), highSnow * 0.82);
        diffuseColor.rgb = stone;
        `
    ).replace(
        '#include <tonemapping_fragment>',
        `gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vMtnRockWP, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
        #include <tonemapping_fragment>`
    );

    injectCloudShadowFragment(shader, 'vMtnRockWP', true);
};

const monumentRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
monumentRockMat.userData.noIndirectSpecular = true;

const canyonRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.02,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
canyonRockMat.userData.noIndirectSpecular = true;

const egyptSandstoneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.03,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
egyptSandstoneMat.userData.noIndirectSpecular = true;

const jungleTempleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
jungleTempleMat.userData.noIndirectSpecular = true;

// Dark mossy volcanic/karst boulders for the jungle floor (same stone texture, much darker & warmer tint)
const jungleRockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x6e6a5a),
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
jungleRockMat.userData.noIndirectSpecular = true;

const greekMarbleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.04,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
greekMarbleMat.userData.noIndirectSpecular = true;

const romanTravertineMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: 0.80,
    metalness: 0.03,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide
});
romanTravertineMat.userData.noIndirectSpecular = true;

let sharedRockNormalMap = null;
let sharedMonumentSandstonePBR = null;
let sharedEgyptLimestonePBR = null;
let sharedJungleTemplePBR = null;
let sharedGreekMarblePBR = null;
let sharedRomanTravertinePBR = null;

function finalizePBRDataTexture(rgbaData, size) {
    const tex = new THREE.DataTexture(rgbaData, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
}

function createMonumentSandstonePBR() {
    const size = 256;
    const albedoData = new Uint8Array(size * size * 4);
    const normData = new Uint8Array(size * size * 4);
    const heights = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
        const v = y / size;
        // Multi-scale horizontal Navajo / De Chelly sandstone sedimentary bedding planes
        const bed1 = Math.sin(v * Math.PI * 14.0);
        const bed2 = Math.sin(v * Math.PI * 32.0 + 1.2) * 0.50;
        const bed3 = Math.cos(v * Math.PI * 64.0 - 0.7) * 0.25;
        const strataWave = (bed1 + bed2 + bed3) / 1.75;

        for (let x = 0; x < size; x++) {
            const u = x / size;
            const crossBed = Math.sin((v * 18.0 + Math.sin(u * Math.PI * 4.0) * 0.45) * Math.PI) * 0.20;
            const grain = (hash2D(x * 0.35, y * 0.35) - 0.5) * 0.08;
            // Vertical desert-varnish mineral streaks on cliff faces
            const varnish = Math.max(0.0, Math.sin(u * Math.PI * 14.0 + Math.sin(v * Math.PI * 4.0) * 1.5)) * 0.08;
            const h = strataWave * 0.42 + crossBed + grain;
            heights[y * size + x] = h;

            const idx = (y * size + x) * 4;
            const bandLight = 0.90 + strataWave * 0.11 + crossBed * 0.12 + grain * 0.14 - varnish;
            albedoData[idx]     = Math.min(255, Math.max(160, Math.round((0.97 * bandLight + (strataWave > 0.2 ? 0.03 : 0.0)) * 255)));
            albedoData[idx + 1] = Math.min(255, Math.max(130, Math.round((0.90 * bandLight + (strataWave > 0.35 ? 0.05 : -0.02)) * 255)));
            albedoData[idx + 2] = Math.min(255, Math.max(110, Math.round((0.84 * bandLight + (strataWave > 0.35 ? 0.06 : -0.04)) * 255)));
            albedoData[idx + 3] = 255;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = heights[y * size + (x + size - 1) % size];
            const right = heights[y * size + (x + 1) % size];
            const down = heights[((y + size - 1) % size) * size + x];
            const up = heights[((y + 1) % size) * size + x];
            const n = new THREE.Vector3(-(right - left) * 2.2, -(up - down) * 3.8, 1.0).normalize();
            const idx = (y * size + x) * 4;
            normData[idx]     = Math.round((n.x * 0.5 + 0.5) * 255);
            normData[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
            normData[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            normData[idx + 3] = 255;
        }
    }

    return {
        albedo: finalizePBRDataTexture(albedoData, size),
        normal: finalizePBRDataTexture(normData, size)
    };
}

function createEgyptLimestonePBR() {
    const size = 256;
    const albedoData = new Uint8Array(size * size * 4);
    const normData = new Uint8Array(size * size * 4);
    const heights = new Float32Array(size * size);
    const courses = 10;
    const blocksPerRow = 5;

    for (let y = 0; y < size; y++) {
        const v = y / size;
        const coursePos = v * courses;
        const courseIdx = Math.floor(coursePos);
        const courseFrac = coursePos - courseIdx;

        for (let x = 0; x < size; x++) {
            const u = x / size;
            const rowStagger = (courseIdx % 2) * 0.5 + ((courseIdx * 37) % 5) * 0.08;
            const blockPos = u * blocksPerRow + rowStagger;
            const blockIdx = Math.floor(blockPos);
            const blockFrac = blockPos - blockIdx;

            // Recessed horizontal and vertical limestone ashlar mortar seams + weathered, broken bevels
            const edgeRough = (hash2D(x * 2.3, y * 2.3) - 0.5) * 0.035;
            const hJoint = Math.max(0.0, Math.min(courseFrac, 1.0 - courseFrac) + edgeRough);
            const vJoint = Math.max(0.0, Math.min(blockFrac, 1.0 - blockFrac) + edgeRough);
            const hBevel = smoothstep(0.0, 0.11, hJoint);
            const vBevel = smoothstep(0.0, 0.08, vJoint);
            const blockBevel = hBevel * vBevel;

            // Per-block warm Tura/Giza limestone variation & wind-pitted desert patina
            const blockSeed = hash2D(blockIdx * 13.0 + courseIdx * 7.0, courseIdx * 29.0);
            const pitNoise = Math.sin(v * Math.PI * 24.0 + u * 6.0) * 0.04;

            // --- WIND-SCOURED SCRATCHES & CHISEL GROOVES ---
            const sAng1 = (u * 42.0 + v * 30.0 + Math.sin(u * 16.0) * 0.4) * Math.PI;
            const sLine1 = 1.0 - smoothstep(0.0, 0.055, Math.abs(Math.sin(sAng1)));
            const sMask1 = smoothstep(0.56, 0.88, hash2D(Math.floor((u * 42.0 + v * 30.0) * 0.28), Math.floor(v * 9.0)));
            const scratch1 = sLine1 * sMask1;

            const sAng2 = (u * 26.0 - v * 46.0 + Math.cos(v * 14.0) * 0.3) * Math.PI;
            const sLine2 = 1.0 - smoothstep(0.0, 0.05, Math.abs(Math.sin(sAng2)));
            const sMask2 = smoothstep(0.62, 0.90, hash2D(Math.floor(u * 10.0), Math.floor((u * 26.0 - v * 46.0) * 0.24)));
            const scratch2 = sLine2 * sMask2;

            const totalScratch = Math.max(scratch1 * 1.0, scratch2 * 0.85);

            // --- BROKEN MEGALITH FRACTURES & SPALLED PITS ---
            const crackWave = Math.sin(v * 16.0 + Math.sin(u * 12.0) * 1.4);
            const crackDist = Math.abs(Math.sin((u * 7.0 + v * 5.0 + crackWave * 0.5) * Math.PI));
            const crackMask = smoothstep(0.55, 0.84, hash2D(Math.floor(u * 5.0), Math.floor(v * 5.0)));
            const crack = (1.0 - smoothstep(0.0, 0.048, crackDist)) * crackMask;

            // Weathered spall pits (desert wind erosion & shattered corners)
            const chipSeed = hash2D(Math.floor(u * 14.0), Math.floor(v * 14.0));
            const chipU = (u * 14.0) % 1.0 - 0.5;
            const chipV = (v * 14.0) % 1.0 - 0.5;
            const chipDist = Math.hypot(chipU, chipV);
            const chip = (chipSeed > 0.80 && chipDist < 0.40) ? (1.0 - smoothstep(0.12, 0.40, chipDist)) : 0.0;

            const h = blockBevel * 0.62 + (blockSeed - 0.5) * 0.12 + pitNoise -
                      totalScratch * 0.22 - crack * 0.36 - chip * 0.30;
            heights[y * size + x] = h;

            const mortarDark = 0.72 + 0.28 * blockBevel;
            const crackDark = crack * 0.52;
            const scratchDark = totalScratch * 0.25;
            const chipDark = chip * 0.38;

            const blockTone = (0.92 + (blockSeed - 0.5) * 0.12 + pitNoise * 0.25 + totalScratch * 0.10) *
                              mortarDark * (1.0 - crackDark - scratchDark - chipDark);
            const warmShift = (blockSeed - 0.5) * 0.04;

            const idx = (y * size + x) * 4;
            albedoData[idx]     = Math.min(255, Math.max(120, Math.round((blockTone + warmShift) * 255)));
            albedoData[idx + 1] = Math.min(255, Math.max(105, Math.round((blockTone * 0.95) * 255)));
            albedoData[idx + 2] = Math.min(255, Math.max(85, Math.round((blockTone * 0.86 - warmShift) * 255)));
            albedoData[idx + 3] = 255;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = heights[y * size + (x + size - 1) % size];
            const right = heights[y * size + (x + 1) % size];
            const down = heights[((y + size - 1) % size) * size + x];
            const up = heights[((y + 1) % size) * size + x];
            const n = new THREE.Vector3(-(right - left) * 3.6, -(up - down) * 4.2, 1.0).normalize();
            const idx = (y * size + x) * 4;
            normData[idx]     = Math.round((n.x * 0.5 + 0.5) * 255);
            normData[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
            normData[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            normData[idx + 3] = 255;
        }
    }

    return {
        albedo: finalizePBRDataTexture(albedoData, size),
        normal: finalizePBRDataTexture(normData, size)
    };
}

function createJungleTemplePBR() {
    const size = 256;
    const albedoData = new Uint8Array(size * size * 4);
    const normData = new Uint8Array(size * size * 4);
    const heights = new Float32Array(size * size);
    const courses = 8;
    const blocksPerRow = 4;

    for (let y = 0; y < size; y++) {
        const v = y / size;
        const coursePos = v * courses;
        const courseIdx = Math.floor(coursePos);
        const courseFrac = coursePos - courseIdx;
        const isFriezeRow = (courseIdx % 4 === 2);

        for (let x = 0; x < size; x++) {
            const u = x / size;
            const stagger = (courseIdx % 2) * 0.5;
            const blockPos = u * blocksPerRow + stagger;
            const blockIdx = Math.floor(blockPos);
            const blockFrac = blockPos - blockIdx;

            const hJoint = Math.min(courseFrac, 1.0 - courseFrac);
            const vJoint = Math.min(blockFrac, 1.0 - blockFrac);
            const seam = smoothstep(0.0, 0.12, hJoint) * smoothstep(0.0, 0.09, vJoint);

            // Carved Mesoamerican / Khmer geometric step-fret relief pattern on frieze rows
            let relief = 0.0;
            if (isFriezeRow && courseFrac > 0.20 && courseFrac < 0.80) {
                const fretX = Math.floor(u * 16.0) % 4;
                const fretY = courseFrac > 0.5 ? 1 : 0;
                relief = ((fretX + fretY) % 2 === 0) ? 0.16 : -0.10;
            }

            const blockSeed = hash2D(blockIdx * 19.0 + courseIdx * 11.0, courseIdx * 23.0);
            const mossWave = Math.sin(u * Math.PI * 6.0 + courseIdx * 1.7) * Math.cos(v * Math.PI * 8.0) * 0.5 + 0.5;
            const mossMask = Math.max(0.0, (1.0 - seam) * 0.60 + (mossWave > 0.58 ? (mossWave - 0.58) * 1.3 : 0.0));

            const h = seam * 0.65 + relief + (blockSeed - 0.5) * 0.10;
            heights[y * size + x] = h;

            const stoneVal = (0.52 + 0.32 * seam) * (0.86 + (blockSeed - 0.5) * 0.14 + relief * 0.22);
            const rStone = stoneVal * 0.96;
            const gStone = stoneVal * 0.89;
            const bStone = stoneVal * 0.80;

            // Blend lush jade-emerald moss into recessed mortar joints and mossy stone patches
            // Weathered olive-brown lichen & dark rain-streak staining instead of bright emerald moss
            const mAmt = Math.min(0.40, mossMask * 0.55);
            const streak = Math.max(0.0, Math.sin(u * 61.0 + blockIdx * 3.1) * 0.5 + 0.5 - 0.55) * (1.0 - v * 0.5) * 0.9;
            const dirt = 1.0 - Math.min(0.35, streak);
            const r = (rStone * (1.0 - mAmt) + 0.34 * mAmt) * dirt;
            const g = (gStone * (1.0 - mAmt) + 0.33 * mAmt) * dirt;
            const b = (bStone * (1.0 - mAmt) + 0.20 * mAmt) * dirt;

            const idx = (y * size + x) * 4;
            albedoData[idx]     = Math.min(255, Math.max(55, Math.round(r * 255)));
            albedoData[idx + 1] = Math.min(255, Math.max(55, Math.round(g * 255)));
            albedoData[idx + 2] = Math.min(255, Math.max(45, Math.round(b * 255)));
            albedoData[idx + 3] = 255;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = heights[y * size + (x + size - 1) % size];
            const right = heights[y * size + (x + 1) % size];
            const down = heights[((y + size - 1) % size) * size + x];
            const up = heights[((y + 1) % size) * size + x];
            const n = new THREE.Vector3(-(right - left) * 2.8, -(up - down) * 3.2, 1.0).normalize();
            const idx = (y * size + x) * 4;
            normData[idx]     = Math.round((n.x * 0.5 + 0.5) * 255);
            normData[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
            normData[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            normData[idx + 3] = 255;
        }
    }

    return {
        albedo: finalizePBRDataTexture(albedoData, size),
        normal: finalizePBRDataTexture(normData, size)
    };
}

function createGreekMarblePBR() {
    const size = 256;
    const albedoData = new Uint8Array(size * size * 4);
    const normData = new Uint8Array(size * size * 4);
    const heights = new Float32Array(size * size);
    const courses = 8;
    const blocksPerRow = 4;

    for (let y = 0; y < size; y++) {
        const v = y / size;
        const coursePos = v * courses;
        const courseIdx = Math.floor(coursePos);
        const courseFrac = coursePos - courseIdx;

        for (let x = 0; x < size; x++) {
            const u = x / size;
            const stagger = (courseIdx % 2) * 0.5;
            const blockPos = u * blocksPerRow + stagger;
            const blockIdx = Math.floor(blockPos);
            const blockFrac = blockPos - blockIdx;

            const hJoint = Math.min(courseFrac, 1.0 - courseFrac);
            const vJoint = Math.min(blockFrac, 1.0 - blockFrac);

            // Ragged, chipped mortar seams & spalled bevels
            const seamNoise = (hash2D(x * 2.1, y * 2.1) - 0.5) * 0.024;
            const seam = smoothstep(0.0, 0.075, Math.max(0.0, hJoint + seamNoise)) *
                         smoothstep(0.0, 0.065, Math.max(0.0, vJoint + seamNoise));

            // Pentelic marble veining & fine fluted/chiseled relief
            const vein = Math.sin((u * 4.5 + v * 3.2 + Math.sin(u * 12.0) * 0.25) * Math.PI) * 0.5 + 0.5;
            const veinLine = Math.pow(vein, 8.0) * 0.08;
            const blockSeed = hash2D(blockIdx * 17.0 + courseIdx * 13.0, courseIdx * 31.0);
            const fluteMicro = Math.sin(u * Math.PI * 32.0) * 0.025;

            // --- MULTI-DIRECTIONAL SCRATCHES & CHISEL GOUGES ---
            // Scratch Set 1: Diagonal scratches & tool abrasions
            const sAng1 = (u * 46.0 + v * 34.0 + Math.sin(v * 20.0) * 0.35) * Math.PI;
            const sLine1 = 1.0 - smoothstep(0.0, 0.055, Math.abs(Math.sin(sAng1)));
            const sMask1 = smoothstep(0.58, 0.88, hash2D(Math.floor((u * 46.0 + v * 34.0) * 0.25), Math.floor(v * 8.0)));
            const scratch1 = sLine1 * sMask1;

            // Scratch Set 2: Counter-diagonal scrapes & weapon/impact scratches
            const sAng2 = (u * 32.0 - v * 50.0 + Math.cos(u * 16.0) * 0.3) * Math.PI;
            const sLine2 = 1.0 - smoothstep(0.0, 0.05, Math.abs(Math.sin(sAng2)));
            const sMask2 = smoothstep(0.64, 0.92, hash2D(Math.floor(u * 9.0), Math.floor((u * 32.0 - v * 50.0) * 0.22)));
            const scratch2 = sLine2 * sMask2;

            // Scratch Set 3: Fine horizontal dragged abrasive scratches
            const sAng3 = (v * 74.0 + Math.sin(u * 28.0) * 0.45) * Math.PI;
            const sLine3 = 1.0 - smoothstep(0.0, 0.05, Math.abs(Math.sin(sAng3)));
            const sMask3 = smoothstep(0.70, 0.94, hash2D(Math.floor(v * 16.0), Math.floor(u * 6.0)));
            const scratch3 = sLine3 * sMask3;

            const totalScratch = Math.max(scratch1 * 1.0, scratch2 * 0.9, scratch3 * 0.65);

            // --- BROKEN MARBLE CRACKS & IMPACT CHIPS ---
            // Jagged structural fracture cracks splitting across slabs
            const crackWave = Math.sin(v * 18.0 + Math.cos(u * 14.0) * 1.5);
            const crackDist = Math.abs(Math.sin((u * 8.0 + v * 6.0 + crackWave * 0.6) * Math.PI));
            const crackMask = smoothstep(0.54, 0.84, hash2D(Math.floor(u * 6.0), Math.floor(v * 6.0)));
            const crack = (1.0 - smoothstep(0.0, 0.045, crackDist)) * crackMask;

            // Spalled impact craters / chipped marble flakes
            const chipSeed = hash2D(Math.floor(u * 16.0), Math.floor(v * 16.0));
            const chipU = (u * 16.0) % 1.0 - 0.5;
            const chipV = (v * 16.0) % 1.0 - 0.5;
            const chipDist = Math.hypot(chipU, chipV);
            const chip = (chipSeed > 0.81 && chipDist < 0.38) ? (1.0 - smoothstep(0.14, 0.38, chipDist)) : 0.0;

            // Height combining seams, veining, scratches, cracks and chips
            const h = seam * 0.60 + (blockSeed - 0.5) * 0.06 + fluteMicro - veinLine * 0.25 -
                      totalScratch * 0.20 - crack * 0.34 - chip * 0.30;
            heights[y * size + x] = h;

            // Albedo: Pentelic marble with dark weathered cracks, powdered scratch rims, and oxidized patina
            const scratchRim = totalScratch * 0.18; // pulverized pale marble edge
            const scratchGroove = totalScratch * 0.30; // dark shadow in groove
            const crackDark = crack * 0.50; // grime and shadow in fissure
            const chipDark = chip * 0.38; // rough exposed interior stone

            const tone = (0.86 + 0.14 * seam) * (0.95 + (blockSeed - 0.5) * 0.06 - veinLine + scratchRim) *
                         (1.0 - scratchGroove - crackDark - chipDark);

            // Weathered antique amber/ochre oxidation in fractures and scratches
            const grimeAmt = Math.min(0.65, crack * 0.72 + chip * 0.55 + totalScratch * 0.32 + (1.0 - seam) * 0.35);
            const rBase = tone;
            const gBase = tone * 0.98;
            const bBase = tone * 0.94;

            const r = rBase * (1.0 - grimeAmt * 0.25);
            const g = gBase * (1.0 - grimeAmt * 0.32);
            const b = bBase * (1.0 - grimeAmt * 0.45); // ochre/amber shift in cracks

            const idx = (y * size + x) * 4;
            albedoData[idx]     = Math.min(255, Math.max(135, Math.round(r * 255)));
            albedoData[idx + 1] = Math.min(255, Math.max(125, Math.round(g * 255)));
            albedoData[idx + 2] = Math.min(255, Math.max(100, Math.round(b * 255)));
            albedoData[idx + 3] = 255;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = heights[y * size + (x + size - 1) % size];
            const right = heights[y * size + (x + 1) % size];
            const down = heights[((y + size - 1) % size) * size + x];
            const up = heights[((y + 1) % size) * size + x];
            const n = new THREE.Vector3(-(right - left) * 3.6, -(up - down) * 4.2, 1.0).normalize();
            const idx = (y * size + x) * 4;
            normData[idx]     = Math.round((n.x * 0.5 + 0.5) * 255);
            normData[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
            normData[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            normData[idx + 3] = 255;
        }
    }

    return {
        albedo: finalizePBRDataTexture(albedoData, size),
        normal: finalizePBRDataTexture(normData, size)
    };
}

function createRomanTravertinePBR() {
    const size = 256;
    const albedoData = new Uint8Array(size * size * 4);
    const normData = new Uint8Array(size * size * 4);
    const heights = new Float32Array(size * size);
    const courses = 9;
    const blocksPerRow = 4;

    for (let y = 0; y < size; y++) {
        const v = y / size;
        const coursePos = v * courses;
        const courseIdx = Math.floor(coursePos);
        const courseFrac = coursePos - courseIdx;

        for (let x = 0; x < size; x++) {
            const u = x / size;
            const stagger = (courseIdx % 2) * 0.5;
            const blockPos = u * blocksPerRow + stagger;
            const blockIdx = Math.floor(blockPos);
            const blockFrac = blockPos - blockIdx;

            const hJoint = Math.min(courseFrac, 1.0 - courseFrac);
            const vJoint = Math.min(blockFrac, 1.0 - blockFrac);
            const seam = smoothstep(0.0, 0.10, hJoint) * smoothstep(0.0, 0.08, vJoint);

            // Characteristic horizontal porous cavities (vugs) of Roman Tivoli travertine
            const poreNoise = Math.sin(u * Math.PI * 22.0 + courseIdx * 2.1) * Math.cos(v * Math.PI * 44.0);
            const porePit = poreNoise > 0.72 ? -(poreNoise - 0.72) * 0.45 : 0.0;
            const blockSeed = hash2D(blockIdx * 23.0 + courseIdx * 9.0, courseIdx * 19.0);

            const h = seam * 0.68 + porePit + (blockSeed - 0.5) * 0.10;
            heights[y * size + x] = h;

            const tone = (0.78 + 0.22 * seam) * (0.93 + (blockSeed - 0.5) * 0.10 + porePit * 0.35);
            const idx = (y * size + x) * 4;
            albedoData[idx]     = Math.min(255, Math.max(160, Math.round(tone * 255)));
            albedoData[idx + 1] = Math.min(255, Math.max(145, Math.round(tone * 0.94 * 255)));
            albedoData[idx + 2] = Math.min(255, Math.max(125, Math.round(tone * 0.85 * 255)));
            albedoData[idx + 3] = 255;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = heights[y * size + (x + size - 1) % size];
            const right = heights[y * size + (x + 1) % size];
            const down = heights[((y + size - 1) % size) * size + x];
            const up = heights[((y + 1) % size) * size + x];
            const n = new THREE.Vector3(-(right - left) * 2.8, -(up - down) * 3.4, 1.0).normalize();
            const idx = (y * size + x) * 4;
            normData[idx]     = Math.round((n.x * 0.5 + 0.5) * 255);
            normData[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
            normData[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
            normData[idx + 3] = 255;
        }
    }

    return {
        albedo: finalizePBRDataTexture(albedoData, size),
        normal: finalizePBRDataTexture(normData, size)
    };
}

function createRockNormalMap() {
    const size = 128;
    const heights = new Float32Array(size * size);
    const data = new Uint8Array(size * size * 3);
    const sampleNoise = (u, v, cells, seed) => {
        const x = u * cells;
        const y = v * cells;
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const tx = THREE.MathUtils.smoothstep(x - x0, 0, 1);
        const ty = THREE.MathUtils.smoothstep(y - y0, 0, 1);
        const hash = (ix, iy) => {
            const value = Math.sin(((ix % cells) + seed * 17) * 127.1 + ((iy % cells) + seed * 31) * 311.7) * 43758.5453;
            return (value - Math.floor(value)) * 2 - 1;
        };
        const top = THREE.MathUtils.lerp(hash(x0, y0), hash(x0 + 1, y0), tx);
        const bottom = THREE.MathUtils.lerp(hash(x0, y0 + 1), hash(x0 + 1, y0 + 1), tx);
        return THREE.MathUtils.lerp(top, bottom, ty);
    };

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            heights[y * size + x] = sampleNoise(u, v, 3, 1) * 0.52
                + sampleNoise(u, v, 6, 2) * 0.26
                + sampleNoise(u, v, 12, 3) * 0.15
                + sampleNoise(u, v, 24, 4) * 0.07;
        }
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const left = heights[y * size + (x + size - 1) % size];
            const right = heights[y * size + (x + 1) % size];
            const down = heights[((y + size - 1) % size) * size + x];
            const up = heights[((y + 1) % size) * size + x];
            const normal = new THREE.Vector3(-(right - left) * 6.5, -(up - down) * 6.5, 1).normalize();
            const offset = (y * size + x) * 3;
            data[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
            data[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
            data[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;
    return texture;
}

const cactusMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: GROUND_ENV_MAP_INTENSITY
});
cactusMat.userData.noIndirectSpecular = true;

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
    out.computeBoundingSphere();
    out.computeBoundingBox();
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

// 5D. Detailed Broadleaf Undergrowth Bush / Shrub (Botanical Atlas Q1 or Q2)
function createDetailedBushGeometry(useFlowerQuad = false) {
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
    const u0 = useFlowerQuad ? 0.02 : 0.52;
    const u1 = useFlowerQuad ? 0.48 : 0.98;
    const v0 = useFlowerQuad ? 0.02 : 0.52;
    const v1 = useFlowerQuad ? 0.48 : 0.98;
    lobes.forEach(([bx, by, bz, br, shade], lIdx) => {
        bushOrientations.forEach(ori => {
            const w = br * 1.35;
            const h = br * 1.25;
            const card = createCurvedFoliageCard(w, h, 0.22, u0, u1, v0, v1);
            card.translate(0, -h * 0.48, 0);
            card.rotateZ(ori.rz);
            card.rotateX(ori.rx);
            card.rotateY(ori.ry + lIdx * 0.5);
            card.translate(bx, by, bz);

            applyCanopyVolumeShading(card, bushCenter, 0.42 * shade, 0.54 * shade, 0.34 * shade, 0.28);
            parts.push(card);
        });
    });
    return mergeBufferGeometries(parts);
}

// 5E. Massive Limestone Boulder & Defensive Outcrop Geometry (Sized for Tank Hull-Down & Full Cover)
function smoothDuplicateVertexNormals(geo) {
    geo.computeVertexNormals();
    const positions = geo.attributes.position;
    const normals = geo.attributes.normal;
    const accumulated = new Map();
    const keyFor = i => `${positions.getX(i).toFixed(5)},${positions.getY(i).toFixed(5)},${positions.getZ(i).toFixed(5)}`;

    for (let i = 0; i < positions.count; i++) {
        const key = keyFor(i);
        const normal = accumulated.get(key) || new THREE.Vector3();
        normal.x += normals.getX(i);
        normal.y += normals.getY(i);
        normal.z += normals.getZ(i);
        accumulated.set(key, normal);
    }
    for (let i = 0; i < positions.count; i++) {
        const normal = accumulated.get(keyFor(i)).normalize();
        normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    normals.needsUpdate = true;
}

function createLimestoneRockGeometry() {
    const parts = [];
    const boulders = [
        // Main central craggy fieldstone boulder (natural rounded-yet-faceted massif)
        { x: 0,     y: 1.75, z: 0,     sx: 3.15, sy: 1.90, sz: 2.55, rot: 0.25 },
        // Left flanking shoulder crag
        { x: -2.2,  y: 1.35, z: 0.35,  sx: 2.15, sy: 1.48, sz: 1.95, rot: 1.15 },
        // Right buttress outcrop
        { x: 2.05,  y: 1.25, z: -0.45, sx: 2.05, sy: 1.38, sz: 1.85, rot: 2.35 },
        // Upper weathered cap crag
        { x: 0.35,  y: 2.45, z: -0.25, sx: 1.85, sy: 1.28, sz: 1.65, rot: 0.75 }
    ];

    boulders.forEach((b, bIdx) => {
        // Detail 2 icosahedron/dodecahedron gives crisp natural rock facets instead of smooth horizontal rings
        const geo = new THREE.DodecahedronGeometry(1.0, 2);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const n1 = hash2D(vx * 2.4 + bIdx * 7.1, vz * 2.4 + vy * 1.9) - 0.5;
            const n2 = hash2D(vx * 5.8 - vy * 3.1, vz * 5.8 + bIdx * 3.7) - 0.5;
            // Flatten bottom slightly so boulder sits firmly in the meadow soil
            const bottomFlat = vy < -0.45 ? 0.78 : 1.0;
            const s = 0.90 + n1 * 0.24 + n2 * 0.10;
            p.setXYZ(i, vx * s * b.sx, vy * s * b.sy * bottomFlat, vz * s * b.sz);
        }
        // Mostly smooth normals with subtle 16% facet definition so boulder looks organically craggy, not low-poly
        geo.computeVertexNormals();
        const flatNorms = new Float32Array(geo.attributes.normal.array);
        smoothDuplicateVertexNormals(geo);
        const smoothNorms = geo.attributes.normal;
        for (let i = 0; i < smoothNorms.count; i++) {
            const nx = flatNorms[i * 3] * 0.16 + smoothNorms.getX(i) * 0.84;
            const ny = flatNorms[i * 3 + 1] * 0.16 + smoothNorms.getY(i) * 0.84;
            const nz = flatNorms[i * 3 + 2] * 0.16 + smoothNorms.getZ(i) * 0.84;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            smoothNorms.setXYZ(i, nx / len, ny / len, nz / len);
        }
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);

        const col = new Float32Array(p.count * 3);
        for (let k = 0; k < p.count; k++) {
            const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
            const heightAO = 0.52 + 0.48 * Math.min(1.0, Math.max(0.0, vy / 3.4));
            const crevice = 0.85 + 0.30 * (hash2D(vx * 3.5, vz * 3.5) - 0.5);
            const shade = heightAO * crevice;
            col[k * 3 + 0] = 0.78 * shade;
            col[k * 3 + 1] = 0.75 * shade;
            col[k * 3 + 2] = 0.70 * shade;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.22, 0.30);
        parts.push(geo);
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionCircles: [
            { x:  0.0,  z:  0.0,  r: 2.50 },
            { x: -1.3,  z:  0.2,  r: 2.20 },
            { x:  1.2,  z: -0.2,  r: 2.10 },
            { x: -2.6,  z:  0.4,  r: 1.95 },
            { x:  2.3,  z: -0.5,  r: 1.90 },
            { x:  0.4,  z: -0.4,  r: 1.80 },
            { x:  0.0,  z:  1.2,  r: 1.50 },
            { x:  0.0,  z: -1.2,  r: 1.50 }
        ]
    };
    return merged;
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

function tintBuildingPart(geo, r, g, b, maxH = 5.0) {
    const pos = geo.attributes.position;
    const c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const vy = pos.getY(i);
        const shade = 0.72 + 0.28 * Math.min(1.0, Math.max(0.0, vy / maxH));
        c[i * 3 + 0] = r * shade;
        c[i * 3 + 1] = g * shade;
        c[i * 3 + 2] = b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
}

// Helper: Builds a hollow walk-in house shell with 4 outer walls, 3D window openings, interior floor,
// timber architectural framing, and an open front doorway with a swung-open door panel.
function buildHollowHouseShell(parts, opts) {
    const w = opts.w || 5.0;
    const h = opts.h || 3.4;
    const l = opts.l || 6.6;
    const wt = opts.wallThick || 0.32;
    const doorW = opts.doorW || 1.65;
    const doorH = opts.doorH || 2.45;
    const floorY = opts.floorY !== undefined ? opts.floorY : 0.16;
    // Default to Village Atlas Q2 (clean masonry/plaster without baked painted windows)
    const u0 = opts.u0 !== undefined ? opts.u0 : 0.02;
    const u1 = opts.u1 !== undefined ? opts.u1 : 0.48;
    const v0 = opts.v0 !== undefined ? opts.v0 : 0.02;
    const v1 = opts.v1 !== undefined ? opts.v1 : 0.48;
    const tint = opts.tint || [0.92, 0.88, 0.80];
    const foundTint = opts.foundTint || [0.62, 0.59, 0.55];
    const floorTint = opts.floorTint || [0.58, 0.44, 0.30];
    const doorTint = opts.doorTint || [0.42, 0.28, 0.18];

    const addPart = (geo, uMin, uMax, vMin, vMax, rgb) => {
        setGeometryUVBox(geo, uMin, uMax, vMin, vMax);
        if (rgb) tintBuildingPart(geo, rgb[0], rgb[1], rgb[2], h + 1.5);
        parts.push(geo);
    };

    // 1. Sub-terrain foundation plinth (stops at y = floorY - 0.02 so doorway is never blocked)
    const foundH = 1.35;
    const found = new THREE.BoxGeometry(w + 0.28, foundH, l + 0.28);
    found.translate(0, floorY - 0.02 - foundH * 0.5, 0);
    addPart(found, 0.02, 0.48, 0.02, 0.48, foundTint);

    // 2. Interior Floor Slab (top surface sits exactly at y = floorY so rugs above never Z-fight)
    const floorSlab = new THREE.BoxGeometry(w - wt * 0.5, 0.12, l - wt * 0.5);
    floorSlab.translate(0, floorY - 0.06, 0);
    addPart(floorSlab, 0.52, 0.98, 0.02, 0.48, floorTint);

    // 3. Back Wall (-Z) with 3D framed window opening
    const winW = Math.min(1.4, w * 0.30);
    const winH = 1.05;
    const winSillH = 1.15;
    const backZ = -l * 0.5 + wt * 0.5;
    const backSill = new THREE.BoxGeometry(w, winSillH, wt);
    backSill.translate(0, floorY + winSillH * 0.5, backZ);
    addPart(backSill, u0, u1, v0, v1, tint);

    const backLintelH = Math.max(0.3, h - (winSillH + winH));
    const backLintel = new THREE.BoxGeometry(w, backLintelH, wt);
    backLintel.translate(0, floorY + h - backLintelH * 0.5, backZ);
    addPart(backLintel, u0, u1, v0, v1, tint);

    const backPierW = (w - winW) * 0.5;
    [-1, 1].forEach(side => {
        const pier = new THREE.BoxGeometry(backPierW, winH, wt);
        pier.translate(side * (winW * 0.5 + backPierW * 0.5), floorY + winSillH + winH * 0.5, backZ);
        addPart(pier, u0, u1, v0, v1, tint);
    });

    // Back window 3D timber sill, lintel & mullion frame
    const backWinSill = new THREE.BoxGeometry(winW + 0.18, 0.08, wt + 0.08);
    backWinSill.translate(0, floorY + winSillH, backZ);
    addPart(backWinSill, 0.52, 0.98, 0.02, 0.48, doorTint);
    const backWinHead = new THREE.BoxGeometry(winW + 0.18, 0.08, wt + 0.08);
    backWinHead.translate(0, floorY + winSillH + winH, backZ);
    addPart(backWinHead, 0.52, 0.98, 0.02, 0.48, doorTint);
    const backMullionV = new THREE.BoxGeometry(0.06, winH, 0.06);
    backMullionV.translate(0, floorY + winSillH + winH * 0.5, backZ);
    addPart(backMullionV, 0.52, 0.98, 0.02, 0.48, doorTint);

    // 4. Left (-X) & Right (+X) Side Walls with 3D window openings
    const sideWinL = Math.min(1.5, l * 0.26);
    const sidePierL = (l - sideWinL) * 0.5;
    [-1, 1].forEach(side => {
        const sideX = side * (w * 0.5 - wt * 0.5);
        const sSill = new THREE.BoxGeometry(wt, winSillH, l);
        sSill.translate(sideX, floorY + winSillH * 0.5, 0);
        addPart(sSill, u0, u1, v0, v1, tint);

        const sLintel = new THREE.BoxGeometry(wt, backLintelH, l);
        sLintel.translate(sideX, floorY + h - backLintelH * 0.5, 0);
        addPart(sLintel, u0, u1, v0, v1, tint);

        [-1, 1].forEach(zSide => {
            const sPier = new THREE.BoxGeometry(wt, winH, sidePierL);
            sPier.translate(sideX, floorY + winSillH + winH * 0.5, zSide * (sideWinL * 0.5 + sidePierL * 0.5));
            addPart(sPier, u0, u1, v0, v1, tint);
        });

        // Side window 3D timber sill, header & mullion crossbars
        const sillTrim = new THREE.BoxGeometry(wt + 0.08, 0.08, sideWinL + 0.18);
        sillTrim.translate(sideX, floorY + winSillH, 0);
        addPart(sillTrim, 0.52, 0.98, 0.02, 0.48, doorTint);

        const headTrim = new THREE.BoxGeometry(wt + 0.08, 0.08, sideWinL + 0.18);
        headTrim.translate(sideX, floorY + winSillH + winH, 0);
        addPart(headTrim, 0.52, 0.98, 0.02, 0.48, doorTint);

        const sideMullionV = new THREE.BoxGeometry(0.06, winH, 0.06);
        sideMullionV.translate(sideX, floorY + winSillH + winH * 0.5, 0);
        addPart(sideMullionV, 0.52, 0.98, 0.02, 0.48, doorTint);
    });

    // 5. Front Wall (+Z) split around the Open Walk-In Doorway
    const frontZ = l * 0.5 - wt * 0.5;
    const frontPierW = Math.max(0.45, (w - doorW) * 0.5);
    [-1, 1].forEach(side => {
        const fPier = new THREE.BoxGeometry(frontPierW, h, wt);
        fPier.translate(side * (doorW * 0.5 + frontPierW * 0.5), floorY + h * 0.5, frontZ);
        addPart(fPier, u0, u1, v0, v1, tint);
    });

    const doorLintelH = Math.max(0.28, h - doorH);
    const doorLintel = new THREE.BoxGeometry(doorW, doorLintelH, wt);
    doorLintel.translate(0, floorY + doorH + doorLintelH * 0.5, frontZ);
    addPart(doorLintel, u0, u1, v0, v1, tint);

    // 6. Corner Timber Framing Posts (gives crisp architectural definition without UV distortion)
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
        const cornerPost = new THREE.BoxGeometry(0.14, h, 0.14);
        cornerPost.translate(cx * (w * 0.5 - 0.04), floorY + h * 0.5, cz * (l * 0.5 - 0.04));
        addPart(cornerPost, 0.52, 0.98, 0.02, 0.48, doorTint);
    });

    // 7. Door Frame Jambs, Threshold Step & Swung-Open Wooden Door Leaf
    [-1, 1].forEach(side => {
        const jamb = new THREE.BoxGeometry(0.10, doorH, wt + 0.06);
        jamb.translate(side * (doorW * 0.5 - 0.03), floorY + doorH * 0.5, frontZ);
        addPart(jamb, 0.52, 0.98, 0.02, 0.48, doorTint);
    });
    const headerJamb = new THREE.BoxGeometry(doorW + 0.16, 0.12, wt + 0.08);
    headerJamb.translate(0, floorY + doorH + 0.02, frontZ);
    addPart(headerJamb, 0.52, 0.98, 0.02, 0.48, doorTint);

    const doorStep = new THREE.BoxGeometry(doorW + 0.45, 0.14, 0.65);
    doorStep.translate(0, floorY - 0.07, l * 0.5 + 0.25);
    addPart(doorStep, 0.02, 0.48, 0.02, 0.48, foundTint);

    // Open wooden door panel swung outward on its left hinge so player can walk right in
    const leafW = Math.min(1.25, doorW * 0.82);
    const leafH = doorH - 0.08;
    const doorLeaf = new THREE.BoxGeometry(leafW, leafH, 0.08);
    doorLeaf.translate(leafW * 0.5, 0, 0);
    doorLeaf.rotateY(-1.32); // Swung ~76 degrees open outward
    doorLeaf.translate(-doorW * 0.5 + 0.06, floorY + leafH * 0.5 + 0.02, l * 0.5 + 0.02);
    addPart(doorLeaf, 0.52, 0.98, 0.02, 0.48, doorTint);

    return { w, h, l, wallThick: wt, doorW, doorH, floorY, winW, winH, winSillH, sideWinL };
}

function createEuropeanCottageGeometry() {
    const parts = [];
    const w = 5.0, h = 3.2, l = 6.6;
    const floorY = 0.16;

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.32, doorW: 1.65, doorH: 2.45, floorY,
        tint: [0.94, 0.90, 0.82],
        foundTint: [0.64, 0.61, 0.57],
        floorTint: [0.58, 0.44, 0.30],
        doorTint: [0.42, 0.28, 0.18]
    });

    // Overhanging Pitched Terracotta Roof with Exposed Eaves (Q1: [0.5..1.0, 0.5..1.0])
    const roof = createPitchedRoofGeometry(w + 1.2, l + 1.3, 2.65);
    setGeometryUVBox(roof, 0.52, 0.98, 0.52, 0.98);
    roof.translate(0, floorY + h, 0);
    parts.push(roof);

    // Eave fascia rafter beam (Q3: Timber)
    const fasciaL = new THREE.BoxGeometry(0.18, 0.22, l + 1.35);
    setGeometryUVBox(fasciaL, 0.52, 0.98, 0.02, 0.48);
    fasciaL.translate(-(w + 1.2) * 0.5, floorY + h - 0.05, 0);
    parts.push(fasciaL);

    const fasciaR = new THREE.BoxGeometry(0.18, 0.22, l + 1.35);
    setGeometryUVBox(fasciaR, 0.52, 0.98, 0.02, 0.48);
    fasciaR.translate((w + 1.2) * 0.5, floorY + h - 0.05, 0);
    parts.push(fasciaR);

    // Corbeled Fieldstone Chimney Stack & Pots (Q2)
    const chim = new THREE.BoxGeometry(0.85, 3.0, 0.85);
    setGeometryUVBox(chim, 0.02, 0.48, 0.02, 0.48);
    chim.translate(w * 0.24, floorY + h + 1.4, -l * 0.25);
    parts.push(chim);

    for (let cp = -1; cp <= 1; cp += 2) {
        const pot = new THREE.CylinderGeometry(0.12, 0.15, 0.65, 8);
        setGeometryUVBox(pot, 0.52, 0.98, 0.52, 0.98); // Terracotta
        pot.translate(w * 0.24 + cp * 0.2, floorY + h + 3.1, -l * 0.25);
        parts.push(pot);
    }

    // Front Timber Entrance Porch Canopy above Open Door (Q3 Posts, Q1 Tiled Roof)
    const porchRoof = createPitchedRoofGeometry(2.3, 1.7, 0.85);
    setGeometryUVBox(porchRoof, 0.52, 0.98, 0.52, 0.98);
    porchRoof.translate(0, floorY + 2.65, l * 0.5 + 0.75);
    parts.push(porchRoof);

    [-0.95, 0.95].forEach(px => {
        const post = new THREE.BoxGeometry(0.14, 2.55, 0.14);
        setGeometryUVBox(post, 0.52, 0.98, 0.02, 0.48);
        post.translate(px, floorY + 1.25, l * 0.5 + 1.45);
        parts.push(post);
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
}

// 5G. Smoldering Ruined House (Walk-In & Standable Multi-Level Ruin with Stepped Masonry Ledges)
function createRuinedHouseGeometry() {
    const parts = [];
    const w = 5.4, h = 3.0, l = 6.6;

    function tintRuinPart(geo, r, g, b) {
        const c = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < geo.attributes.position.count; i++) {
            const vy = geo.attributes.position.getY(i);
            const soot = 0.42 + 0.38 * Math.min(1.0, Math.max(0.0, (2.4 - Math.max(0, vy)) / 2.4));
            c[i * 3 + 0] = r * soot;
            c[i * 3 + 1] = g * soot;
            c[i * 3 + 2] = b * soot;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return geo;
    }

    // 1. Sub-terrain foundation skirt & walkable stone/rubble floor slab (top at y = 0.32m)
    const foundH = 3.6;
    const foundation = new THREE.BoxGeometry(w + 0.4, foundH, l + 0.4);
    setGeometryUVBox(foundation, 0.02, 0.48, 0.02, 0.48);
    foundation.translate(0, -foundH * 0.5 + 0.04, 0);
    parts.push(tintRuinPart(foundation, 0.55, 0.52, 0.48));

    const floorH = 0.32;
    const floorSlab = new THREE.BoxGeometry(w, floorH, l);
    setGeometryUVBox(floorSlab, 0.02, 0.48, 0.02, 0.48);
    floorSlab.translate(0, floorH * 0.5, 0);
    parts.push(tintRuinPart(floorSlab, 0.68, 0.64, 0.60));

    // 2. Standing broken perimeter walls (leaving wide walk-in breaches on front-left +Z and right +X)
    // Back gable wall (-Z)
    const gableWall = new THREE.BoxGeometry(w, h * 1.15, 0.56);
    setGeometryUVBox(gableWall, 0.02, 0.48, 0.02, 0.48);
    gableWall.translate(0, h * 0.575, -l * 0.5 + 0.28);
    parts.push(tintRuinPart(gableWall, 0.65, 0.60, 0.56));

    // Tall brick chimney (-X, -Z corner)
    const chimney = new THREE.BoxGeometry(0.95, 4.4, 0.95);
    setGeometryUVBox(chimney, 0.02, 0.48, 0.02, 0.48);
    chimney.translate(-w * 0.28, 2.2, -l * 0.34);
    parts.push(tintRuinPart(chimney, 0.58, 0.54, 0.50));

    // Left standing wall segment (-X)
    const leftWall = new THREE.BoxGeometry(0.56, 2.15, l * 0.72);
    setGeometryUVBox(leftWall, 0.02, 0.48, 0.02, 0.48);
    leftWall.translate(-w * 0.5 + 0.28, 1.075, -l * 0.14);
    parts.push(tintRuinPart(leftWall, 0.70, 0.66, 0.62));

    // Front-right standing wall corner (+Z, +X)
    const frontRightWall = new THREE.BoxGeometry(w * 0.38, 1.95, 0.56);
    setGeometryUVBox(frontRightWall, 0.02, 0.48, 0.02, 0.48);
    frontRightWall.translate(w * 0.31, 0.975, l * 0.5 - 0.28);
    parts.push(tintRuinPart(frontRightWall, 0.72, 0.68, 0.64));

    // 3. Stepped climbable masonry ruin ledges (so soldiers can walk/jump up and stand on the ruin!)
    const step1 = new THREE.BoxGeometry(2.1, 0.76, 2.2);
    setGeometryUVBox(step1, 0.02, 0.48, 0.02, 0.48);
    step1.translate(w * 0.26, 0.38, 0.9);
    parts.push(tintRuinPart(step1, 0.72, 0.68, 0.64));

    const step2 = new THREE.BoxGeometry(2.1, 1.24, 2.2);
    setGeometryUVBox(step2, 0.02, 0.48, 0.02, 0.48);
    step2.translate(w * 0.26, 0.62, -1.1);
    parts.push(tintRuinPart(step2, 0.70, 0.66, 0.62));

    const step3 = new THREE.BoxGeometry(1.8, 1.68, 1.8);
    setGeometryUVBox(step3, 0.02, 0.48, 0.02, 0.48);
    step3.translate(-0.4, 0.84, -1.6);
    parts.push(tintRuinPart(step3, 0.66, 0.62, 0.58));

    // Charred dark fallen timber rafters above the high back corner
    for (let r = -1; r <= 1; r++) {
        const rafter = new THREE.BoxGeometry(0.18, 2.8, 0.18);
        setGeometryUVBox(rafter, 0.52, 0.98, 0.02, 0.48);
        rafter.rotateZ(0.72 + (r * 0.04));
        rafter.translate(-1.1, h * 0.86, -1.5 + r * 0.85);
        parts.push(tintRuinPart(rafter, 0.25, 0.20, 0.16));
    }

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: [
            // Full-height standing walls & chimney
            { minX: -w * 0.5, maxX: w * 0.5, minZ: -l * 0.5, maxZ: -l * 0.5 + 0.58 },
            { minX: -w * 0.28 - 0.5, maxX: -w * 0.28 + 0.5, minZ: -l * 0.34 - 0.5, maxZ: -l * 0.34 + 0.5 },
            { minX: -w * 0.5, maxX: -w * 0.5 + 0.58, minZ: -l * 0.5, maxZ: l * 0.22 },
            { minX: w * 0.12, maxX: w * 0.5, minZ: l * 0.5 - 0.58, maxZ: l * 0.5 },
            // Stepped climbable ruin ledges (height-capped so soldiers can climb & stand on top!)
            { minX: w * 0.26 - 1.05, maxX: w * 0.26 + 1.05, minZ: -0.2, maxZ: 2.0, maxY: 0.76 },
            { minX: w * 0.26 - 1.05, maxX: w * 0.26 + 1.05, minZ: -2.2, maxZ: 0.0, maxY: 1.24 },
            { minX: -1.3, maxX: 0.5, minZ: -2.5, maxZ: -0.7, maxY: 1.68 }
        ],
        walkablePlatforms: [
            { minX: -w * 0.5 - 0.15, maxX: w * 0.5 + 0.15, minZ: -l * 0.5 - 0.15, maxZ: l * 0.5 + 0.15, y: floorH },
            { minX: w * 0.26 - 1.05, maxX: w * 0.26 + 1.05, minZ: -0.2, maxZ: 2.0, y: 0.76 },
            { minX: w * 0.26 - 1.05, maxX: w * 0.26 + 1.05, minZ: -2.2, maxZ: 0.0, y: 1.24 },
            { minX: -1.3, maxX: 0.5, minZ: -2.5, maxZ: -0.7, y: 1.68 }
        ]
    };
    return merged;
}

// 5H. European Farm Barn with Walk-In Open Double Doors
function createBarnGeometry() {
    const parts = [];
    const w = 6.4, h = 4.0, l = 9.6;
    const floorY = 0.16;

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.34, doorW: 2.15, doorH: 2.85, floorY,
        u0: 0.52, u1: 0.98, v0: 0.02, v1: 0.48,
        tint: [0.78, 0.58, 0.42],
        floorTint: [0.54, 0.42, 0.28],
        doorTint: [0.42, 0.28, 0.18]
    });

    // High Terracotta Gambrel Barn Roof (Q1: Terracotta Tiles)
    const roof = createPitchedRoofGeometry(w + 1.2, l + 1.3, 3.2);
    setGeometryUVBox(roof, 0.52, 0.98, 0.52, 0.98);
    roof.translate(0, floorY + h, 0);
    parts.push(roof);

    // Overhanging Hayloft Crane Timber Awning (Q3)
    const loftAwning = new THREE.BoxGeometry(1.6, 0.22, 1.4);
    setGeometryUVBox(loftAwning, 0.52, 0.98, 0.02, 0.48);
    loftAwning.translate(0, floorY + h + 1.4, l * 0.5 + 0.75);
    parts.push(loftAwning);

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
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

// 5J. Desert Oasis Date Palm Tree (4 Distinct Botanical Variants: Classic, Tall Royal, Windswept Leaning, Compact Fan)
function createDatePalmGeometry(variant = 0) {
    const parts = [];
    const varIdx = Math.abs(Math.floor(variant)) % 4;

    const trunkHeight = (varIdx === 1) ? 14.2
                      : (varIdx === 2) ? 10.2
                      : (varIdx === 3) ? 7.8
                      : 11.8;

    const rTop = (varIdx === 1) ? 0.18 : (varIdx === 3) ? 0.20 : 0.16;
    const rBot = (varIdx === 1) ? 0.46 : (varIdx === 3) ? 0.48 : (varIdx === 2) ? 0.40 : 0.42;
    const trunk = new THREE.CylinderGeometry(rTop, rBot, trunkHeight, 8, 9);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);

    function getCurve(ny) {
        if (varIdx === 1) {
            // Gentle upright majestic royal curve
            return {
                x: Math.sin(ny * Math.PI * 0.58) * 0.75,
                z: Math.sin(ny * Math.PI * 0.85) * 0.45
            };
        } else if (varIdx === 2) {
            // Deep windswept desert lean
            return {
                x: Math.pow(ny, 1.45) * 2.5,
                z: Math.sin(ny * Math.PI * 0.88) * 0.85
            };
        } else if (varIdx === 3) {
            // Compact fan palm curve
            return {
                x: Math.sin(ny * Math.PI * 0.72) * 0.55,
                z: -Math.sin(ny * Math.PI * 0.60) * 0.35
            };
        } else {
            // Classic arching curve
            return {
                x: Math.sin(ny * Math.PI * 0.82) * 1.15,
                z: (1.0 - Math.cos(ny * Math.PI * 0.65)) * 0.55
            };
        }
    }

    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const ny = (tPos.getY(i) + trunkHeight * 0.5) / trunkHeight;
        const ring = 1.0 + Math.sin(ny * 36.0) * 0.07;
        const c = getCurve(ny);
        tPos.setX(i, tPos.getX(i) * ring + c.x);
        tPos.setZ(i, tPos.getZ(i) * ring + c.z);
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

    const tipCurve = getCurve(1.0);
    const crownX = tipCurve.x;
    const crownZ = tipCurve.z;
    const crownY = trunkHeight - 0.15;
    const crownCenter = new THREE.Vector3(crownX, crownY - 0.6, crownZ);

    // Date fruit clusters beneath crown
    const dateClusterCount = (varIdx === 1) ? 6 : (varIdx === 2) ? 3 : (varIdx === 3) ? 2 : 4;
    for (let d = 0; d < dateClusterCount; d++) {
        const dAng = (d / dateClusterCount) * Math.PI * 2.0 + 0.4;
        const cluster = new THREE.DodecahedronGeometry((varIdx === 1 ? 0.36 : 0.30), 0);
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

    // Botanical Frond Layers with variant-specific morphology, density and natural shading
    let frondLayers;
    if (varIdx === 1) {
        // Tall Royal Palm: 3 dense tiers (18 fronds)
        frondLayers = [
            { count: 8, tilt: 0.72, arch: 1.65, len: 5.2, width: 2.15, yOff: -0.15, shade: 0.80, r: 0.64, g: 0.78, b: 0.40 },
            { count: 6, tilt: 0.42, arch: 1.30, len: 4.6, width: 1.95, yOff:  0.18, shade: 0.96, r: 0.68, g: 0.84, b: 0.44 },
            { count: 4, tilt: 0.18, arch: 0.90, len: 3.6, width: 1.65, yOff:  0.45, shade: 1.08, r: 0.72, g: 0.88, b: 0.46 }
        ];
    } else if (varIdx === 2) {
        // Windswept Leaning Palm: amber dry skirt + sweeping upper fronds
        frondLayers = [
            { count: 6, tilt: 0.82, arch: 1.55, len: 4.8, width: 2.00, yOff: -0.28, shade: 0.75, r: 0.74, g: 0.60, b: 0.30 },
            { count: 8, tilt: 0.46, arch: 1.25, len: 4.2, width: 1.85, yOff:  0.12, shade: 0.92, r: 0.66, g: 0.80, b: 0.40 }
        ];
    } else if (varIdx === 3) {
        // Compact Fan Palm: wide spreading fresh fronds
        frondLayers = [
            { count: 7, tilt: 0.52, arch: 1.20, len: 3.6, width: 2.20, yOff: -0.05, shade: 0.90, r: 0.68, g: 0.86, b: 0.44 },
            { count: 5, tilt: 0.25, arch: 0.92, len: 3.0, width: 1.85, yOff:  0.22, shade: 1.04, r: 0.72, g: 0.90, b: 0.46 }
        ];
    } else {
        // Classic 14 arching fronds
        frondLayers = [
            { count: 8, tilt: 0.58, arch: 1.45, len: 4.5, width: 1.95, yOff: -0.05, shade: 0.86, r: 0.68, g: 0.82, b: 0.42 },
            { count: 6, tilt: 0.32, arch: 1.15, len: 3.9, width: 1.75, yOff:  0.22, shade: 1.00, r: 0.70, g: 0.85, b: 0.44 }
        ];
    }

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
                layer.r * layer.shade,
                layer.g * layer.shade,
                layer.b * layer.shade,
                0.45
            );
            parts.push(frond);
        }
    });

    return mergeBufferGeometries(parts);
}

// 5K. Sahara Desert Umbrella Thorn Acacia (Acacia tortilis / Vachellia tortilis)
function createDesertAcaciaGeometry() {
    const parts = [];
    const trunkHeight = 4.2;

    // Gnarled lower trunk
    const lowerTrunk = new THREE.CylinderGeometry(0.24, 0.44, trunkHeight, 8, 5);
    setGeometryUVBox(lowerTrunk, 0.52, 0.98, 0.02, 0.48);
    const ltPos = lowerTrunk.attributes.position;
    for (let i = 0; i < ltPos.count; i++) {
        const ny = (ltPos.getY(i) + trunkHeight * 0.5) / trunkHeight;
        ltPos.setX(i, ltPos.getX(i) + Math.sin(ny * 2.8) * 0.28);
        ltPos.setZ(i, ltPos.getZ(i) + Math.cos(ny * 2.4) * 0.20 - 0.20);
    }
    lowerTrunk.computeVertexNormals();
    lowerTrunk.translate(0, trunkHeight * 0.5, 0);

    const ltCol = new Float32Array(ltPos.count * 3);
    for (let i = 0; i < ltPos.count; i++) {
        const y = ltPos.getY(i);
        const ao = Math.min(1.0, Math.max(0.35, y / 2.0));
        ltCol[i * 3 + 0] = 0.48 * ao;
        ltCol[i * 3 + 1] = 0.38 * ao;
        ltCol[i * 3 + 2] = 0.26 * ao;
    }
    lowerTrunk.setAttribute('color', new THREE.BufferAttribute(ltCol, 3));
    parts.push(lowerTrunk);

    // Spreading tortuous boughs branching toward flat parasols
    const boughs = [
        { from: [0, 3.8, 0], to: [ 1.8, 6.2,  0.7], r: 0.18 },
        { from: [0, 3.8, 0], to: [-1.6, 6.0,  0.8], r: 0.17 },
        { from: [0, 3.8, 0], to: [ 0.1, 6.5, -1.8], r: 0.18 },
        { from: [ 1.2, 5.2, 0.4], to: [ 2.8, 6.7, -0.4], r: 0.13 },
        { from: [-1.0, 5.0, 0.5], to: [-2.5, 6.5, -0.3], r: 0.13 },
        { from: [ 0.1, 5.4,-1.2], to: [-0.6, 6.8,  1.7], r: 0.13 }
    ];

    boughs.forEach(b => {
        const p1 = new THREE.Vector3(...b.from);
        const p2 = new THREE.Vector3(...b.to);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const bGeo = new THREE.CylinderGeometry(b.r * 0.75, b.r, len, 6, 2);
        setGeometryUVBox(bGeo, 0.52, 0.98, 0.02, 0.48);
        bGeo.translate(0, len * 0.5, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        bGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
        bGeo.translate(p1.x, p1.y, p1.z);

        const bCol = new Float32Array(bGeo.attributes.position.count * 3);
        for (let k = 0; k < bGeo.attributes.position.count; k++) {
            bCol[k * 3 + 0] = 0.44;
            bCol[k * 3 + 1] = 0.35;
            bCol[k * 3 + 2] = 0.24;
        }
        bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
        parts.push(bGeo);
    });

    // Flat-topped horizontal parasol canopy disks (Acacia umbrella crown)
    const parasolPads = [
        { x:  0.0, y: 7.2, z:  0.0, rad: 2.6, cards: 5 },
        { x:  2.5, y: 6.8, z:  0.5, rad: 2.4, cards: 5 },
        { x: -2.3, y: 6.6, z:  0.6, rad: 2.4, cards: 5 },
        { x:  0.2, y: 7.0, z: -2.2, rad: 2.3, cards: 5 },
        { x: -0.6, y: 6.8, z:  1.8, rad: 2.2, cards: 4 },
        { x:  2.4, y: 6.7, z: -0.8, rad: 2.1, cards: 4 },
        { x: -2.2, y: 6.5, z: -0.7, rad: 2.0, cards: 4 }
    ];

    const acaciaCenter = new THREE.Vector3(0, 5.8, 0);
    parasolPads.forEach((pad, pIdx) => {
        for (let c = 0; c < pad.cards; c++) {
            const ang = (c / pad.cards) * Math.PI * 2.0 + pIdx * 0.72;
            const card = createCurvedFoliageCard(pad.rad * 0.95, pad.rad, 0.16, 0.52, 0.98, 0.52, 0.98);
            card.rotateX(Math.PI * 0.5 + 0.08);
            card.rotateY(ang);
            card.translate(pad.x, pad.y, pad.z);
            applyCanopyVolumeShading(
                card,
                acaciaCenter,
                0.70,
                0.78,
                0.36,
                0.42
            );
            parts.push(card);
        }
    });

    return mergeBufferGeometries(parts);
}

// 5L. Desert Saguaro & Cactus Geometries (3 Morphological Variants: Classic 2-Arm, Giant 4-Arm, Multi-Column Organ Pipe)
function createDesertCactusGeometry(variant = 0) {
    const parts = [];
    const varIdx = Math.abs(Math.floor(variant)) % 3;

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

    if (varIdx === 2) {
        // Multi-Column Organ Pipe / Cardon Cactus cluster
        const columns = [
            { x:  0.00, z:  0.00, h: 4.4, r: 0.28 },
            { x:  0.46, z:  0.22, h: 3.4, r: 0.23 },
            { x: -0.42, z: -0.18, h: 2.7, r: 0.20 },
            { x:  0.18, z: -0.42, h: 2.0, r: 0.18 },
            { x: -0.25, z:  0.38, h: 1.5, r: 0.16 }
        ];
        columns.forEach(col => {
            const stem = new THREE.CylinderGeometry(col.r * 0.9, col.r, col.h, 9, 3);
            stem.translate(col.x, col.h * 0.5, col.z);
            parts.push(tintCactusPart(stem, 0, 4.5));

            const cap = new THREE.SphereGeometry(col.r * 0.9, 9, 5);
            cap.translate(col.x, col.h, col.z);
            parts.push(tintCactusPart(cap, 0, 4.5));
        });
        return mergeBufferGeometries(parts);
    }

    // Main ribbed stem
    const mainH = (varIdx === 1) ? 5.8 : 4.8;
    const stemR = (varIdx === 1) ? 0.32 : 0.28;
    const stem = new THREE.CylinderGeometry(stemR, stemR * 1.2, mainH, 10, 4);
    stem.translate(0, mainH * 0.5, 0);
    parts.push(tintCactusPart(stem, 0, mainH));

    const cap = new THREE.SphereGeometry(stemR, 10, 6);
    cap.translate(0, mainH, 0);
    parts.push(tintCactusPart(cap, 0, mainH));

    function addArm(horizLen, startY, elbowOffset, vertLen, rotY = 0) {
        const armH = new THREE.CylinderGeometry(0.18, 0.20, horizLen, 8);
        armH.rotateZ(Math.PI * 0.5);
        armH.translate(horizLen * 0.5, startY, 0);
        armH.rotateY(rotY);
        parts.push(tintCactusPart(armH, 0, mainH));

        const armElb = new THREE.SphereGeometry(0.19, 8, 6);
        armElb.translate(horizLen, startY, 0);
        armElb.rotateY(rotY);
        parts.push(tintCactusPart(armElb, 0, mainH));

        const armV = new THREE.CylinderGeometry(0.17, 0.19, vertLen, 8);
        armV.translate(horizLen, startY + vertLen * 0.5, 0);
        armV.rotateY(rotY);
        parts.push(tintCactusPart(armV, 0, mainH));

        const armC = new THREE.SphereGeometry(0.17, 8, 6);
        armC.translate(horizLen, startY + vertLen, 0);
        armC.rotateY(rotY);
        parts.push(tintCactusPart(armC, 0, mainH));
    }

    if (varIdx === 1) {
        // Giant 4-Arm Saguaro
        addArm(1.05, 2.2, 0, 1.8, Math.PI);       // Left
        addArm(0.95, 3.2, 0, 1.6, 0);             // Right
        addArm(0.85, 2.7, 0, 1.4, Math.PI * 0.5); // Forward
        addArm(0.90, 3.8, 0, 1.3, -Math.PI * 0.5);// Back

        // 2 Base barrels
        const b1 = new THREE.SphereGeometry(0.40, 8, 6);
        b1.scale(1.0, 1.2, 1.0);
        b1.translate(0.55, 0.40, -0.45);
        parts.push(tintCactusPart(b1, 0.4, mainH));

        const b2 = new THREE.SphereGeometry(0.35, 8, 6);
        b2.scale(1.0, 1.2, 1.0);
        b2.translate(-0.48, 0.35, 0.42);
        parts.push(tintCactusPart(b2, 0.4, mainH));
    } else {
        // Classic 2-Arm Saguaro
        addArm(0.98, 2.35, 0, 1.75, Math.PI);
        addArm(0.90, 2.85, 0, 1.45, 0.15);

        const barrel = new THREE.SphereGeometry(0.42, 8, 6);
        barrel.scale(1.0, 1.25, 1.0);
        barrel.translate(0.55, 0.42, -0.48);
        parts.push(tintCactusPart(barrel, 0.5, mainH));
    }

    return mergeBufferGeometries(parts);
}

// 5L. Desert Stratified Sandstone Rock & Eroded Hoodoo Outcrop
function createSandstoneRockGeometry(isRedMonument = false) {
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
        smoothDuplicateVertexNormals(geo);
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);

        const col = new Float32Array(p.count * 3);
        for (let k = 0; k < p.count; k++) {
            const vy = p.getY(k);
            const band = 0.88 + 0.12 * Math.sin(vy * 5.2);
            const shade = (0.64 + 0.32 * Math.min(1.0, Math.max(0.0, vy / 4.2))) * band;
            if (isRedMonument) {
                col[k * 3 + 0] = 0.88 * shade;
                col[k * 3 + 1] = 0.39 * shade;
                col[k * 3 + 2] = 0.24 * shade;
            } else {
                col[k * 3 + 0] = 0.92 * shade;
                col[k * 3 + 1] = 0.68 * shade;
                col[k * 3 + 2] = 0.46 * shade;
            }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.22, 0.30);
        parts.push(geo);
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionCircles: [
            { x:  0.0,  z:  0.0,  r: 2.50 },
            { x: -1.3,  z:  0.2,  r: 2.20 },
            { x:  1.2,  z: -0.2,  r: 2.10 },
            { x: -2.6,  z:  0.4,  r: 1.95 },
            { x:  2.3,  z: -0.5,  r: 1.90 },
            { x:  0.4,  z: -0.4,  r: 1.80 },
            { x:  0.0,  z:  1.2,  r: 1.50 },
            { x:  0.0,  z: -1.2,  r: 1.50 }
        ]
    };
    return merged;
}

// 5M. North African Desert Adobe / Mud-Brick Kasbah House (Flat Roof, Parapet, Corner Watchtower & Open Walk-In Door)
function createDesertKasbahGeometry() {
    const parts = [];
    const w = 5.4, h = 3.6, l = 6.4;
    const floorY = 0.16;

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

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.34, doorW: 1.65, doorH: 2.45, floorY,
        tint: [0.96, 0.84, 0.70],
        foundTint: [0.86, 0.74, 0.60],
        floorTint: [0.76, 0.64, 0.50],
        doorTint: [0.48, 0.34, 0.22]
    });

    // Flat Roof Slab & Parapet Rim (Q2 Masonry)
    const roofY = floorY + h;
    const roofSlab = new THREE.BoxGeometry(w, 0.24, l);
    setGeometryUVBox(roofSlab, 0.02, 0.48, 0.02, 0.48);
    roofSlab.translate(0, roofY + 0.10, 0);
    parts.push(tintAdobe(roofSlab, 0.90, 0.78, 0.64));

    const paraF = new THREE.BoxGeometry(w + 0.25, 0.55, 0.35);
    setGeometryUVBox(paraF, 0.02, 0.48, 0.02, 0.48);
    paraF.translate(0, roofY + 0.35, l * 0.5);
    parts.push(tintAdobe(paraF, 0.92, 0.80, 0.66));

    const paraB = new THREE.BoxGeometry(w + 0.25, 0.55, 0.35);
    setGeometryUVBox(paraB, 0.02, 0.48, 0.02, 0.48);
    paraB.translate(0, roofY + 0.35, -l * 0.5);
    parts.push(tintAdobe(paraB, 0.92, 0.80, 0.66));

    const paraL = new THREE.BoxGeometry(0.35, 0.55, l + 0.25);
    setGeometryUVBox(paraL, 0.02, 0.48, 0.02, 0.48);
    paraL.translate(-w * 0.5, roofY + 0.35, 0);
    parts.push(tintAdobe(paraL, 0.92, 0.80, 0.66));

    const paraR = new THREE.BoxGeometry(0.35, 0.55, l + 0.25);
    setGeometryUVBox(paraR, 0.02, 0.48, 0.02, 0.48);
    paraR.translate(w * 0.5, roofY + 0.35, 0);
    parts.push(tintAdobe(paraR, 0.92, 0.80, 0.66));

    // Elevated Kasbah Watchtower Turret on Corner
    const turret = new THREE.BoxGeometry(2.4, 2.2, 2.4);
    setGeometryUVBox(turret, 0.02, 0.48, 0.02, 0.48);
    turret.translate(-w * 0.28, roofY + 1.2, -l * 0.28);
    parts.push(tintAdobe(turret, 0.96, 0.84, 0.70));

    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
        const merlon = new THREE.BoxGeometry(0.65, 0.55, 0.65);
        setGeometryUVBox(merlon, 0.02, 0.48, 0.02, 0.48);
        merlon.translate(-w * 0.28 + cx * 0.85, roofY + 2.55, -l * 0.28 + cz * 0.85);
        parts.push(tintAdobe(merlon, 0.94, 0.82, 0.68));
    });

    // Projecting Cedar Roof Beams (Vigas) & Shaded Courtyard Arcade Porch (Q3 Timber)
    for (let v = -2; v <= 2; v++) {
        const viga = new THREE.BoxGeometry(w + 0.7, 0.16, 0.16);
        setGeometryUVBox(viga, 0.52, 0.98, 0.02, 0.48);
        viga.translate(0, roofY - 0.15, v * 1.25);
        parts.push(tintAdobe(viga, 0.55, 0.40, 0.26));
    }

    const awning = new THREE.BoxGeometry(2.8, 0.20, 1.5);
    setGeometryUVBox(awning, 0.52, 0.98, 0.02, 0.48);
    awning.translate(0, floorY + 2.65, l * 0.5 + 0.70);
    parts.push(tintAdobe(awning, 0.62, 0.45, 0.30));

    [-1.15, 1.15].forEach(px => {
        const pillar = new THREE.BoxGeometry(0.28, 2.55, 0.28);
        setGeometryUVBox(pillar, 0.02, 0.48, 0.02, 0.48);
        pillar.translate(px, floorY + 1.28, l * 0.5 + 1.25);
        parts.push(tintAdobe(pillar, 0.90, 0.78, 0.64));
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
}

// 5N. Desert Ruined Sandstone / Mud-Brick Compound (Walk-In & Standable Multi-Level Ruin)
function createDesertRuinGeometry() {
    const parts = [];
    const w = 5.6, h = 3.1, l = 6.6;

    function tintSandRuin(geo, r, g, b) {
        const c = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < geo.attributes.position.count; i++) {
            const vy = geo.attributes.position.getY(i);
            const shade = 0.55 + 0.38 * Math.min(1.0, Math.max(0.0, Math.max(0, vy) / 3.5));
            c[i * 3 + 0] = r * shade;
            c[i * 3 + 1] = g * shade;
            c[i * 3 + 2] = b * shade;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return geo;
    }

    // 1. Sub-terrain foundation skirt & walkable sandstone floor slab (top at y = 0.35m)
    const foundH = 3.8;
    const foundation = new THREE.BoxGeometry(w + 0.4, foundH, l + 0.4);
    setGeometryUVBox(foundation, 0.02, 0.48, 0.02, 0.48);
    foundation.translate(0, -foundH * 0.5 + 0.04, 0);
    parts.push(tintSandRuin(foundation, 0.78, 0.60, 0.38));

    const floorH = 0.35;
    const floorSlab = new THREE.BoxGeometry(w, floorH, l);
    setGeometryUVBox(floorSlab, 0.02, 0.48, 0.02, 0.48);
    floorSlab.translate(0, floorH * 0.5, 0);
    parts.push(tintSandRuin(floorSlab, 0.90, 0.71, 0.47));

    // 2. Standing broken watchtower (-X, -Z corner) & breached adobe/sandstone walls
    const brokenTower = new THREE.BoxGeometry(2.3, h * 1.25, 2.3);
    setGeometryUVBox(brokenTower, 0.02, 0.48, 0.02, 0.48);
    brokenTower.translate(-w * 0.28, h * 0.625, -l * 0.28);
    parts.push(tintSandRuin(brokenTower, 0.88, 0.68, 0.45));

    const leftWall = new THREE.BoxGeometry(0.58, 2.2, l * 0.68);
    setGeometryUVBox(leftWall, 0.02, 0.48, 0.02, 0.48);
    leftWall.translate(-w * 0.5 + 0.29, 1.1, -l * 0.16);
    parts.push(tintSandRuin(leftWall, 0.90, 0.70, 0.46));

    const backWall = new THREE.BoxGeometry(w * 0.74, 2.3, 0.58);
    setGeometryUVBox(backWall, 0.02, 0.48, 0.02, 0.48);
    backWall.translate(-w * 0.13, 1.15, -l * 0.5 + 0.29);
    parts.push(tintSandRuin(backWall, 0.87, 0.67, 0.44));

    const archWall = new THREE.BoxGeometry(w * 0.48, h * 0.92, 0.58);
    setGeometryUVBox(archWall, 0.02, 0.48, 0.02, 0.48);
    archWall.translate(w * 0.26, h * 0.46, l * 0.5 - 0.29);
    parts.push(tintSandRuin(archWall, 0.85, 0.65, 0.42));

    // 3. Stepped climbable sandstone ruin blocks (so soldiers can climb & stand on the ruin!)
    const step1 = new THREE.BoxGeometry(2.2, 0.80, 2.2);
    setGeometryUVBox(step1, 0.02, 0.48, 0.02, 0.48);
    step1.translate(w * 0.26, 0.40, 0.6);
    parts.push(tintSandRuin(step1, 0.92, 0.72, 0.48));

    const step2 = new THREE.BoxGeometry(2.2, 1.28, 2.2);
    setGeometryUVBox(step2, 0.02, 0.48, 0.02, 0.48);
    step2.translate(w * 0.26, 0.64, -1.4);
    parts.push(tintSandRuin(step2, 0.90, 0.70, 0.46));

    const step3 = new THREE.BoxGeometry(1.9, 1.75, 1.9);
    setGeometryUVBox(step3, 0.02, 0.48, 0.02, 0.48);
    step3.translate(0.3, 0.875, -1.8);
    parts.push(tintSandRuin(step3, 0.88, 0.68, 0.45));

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: [
            // Full-height watchtower & standing wall segments
            { minX: -w * 0.28 - 1.15, maxX: -w * 0.28 + 1.15, minZ: -l * 0.28 - 1.15, maxZ: -l * 0.28 + 1.15 },
            { minX: -w * 0.5, maxX: -w * 0.5 + 0.60, minZ: -l * 0.5, maxZ: l * 0.18 },
            { minX: -w * 0.5, maxX: w * 0.24, minZ: -l * 0.5, maxZ: -l * 0.5 + 0.60 },
            { minX: w * 0.02, maxX: w * 0.5, minZ: l * 0.5 - 0.60, maxZ: l * 0.5 },
            // Stepped climbable ruin blocks (height-capped so soldiers can climb & stand on top!)
            { minX: w * 0.26 - 1.1, maxX: w * 0.26 + 1.1, minZ: -0.5, maxZ: 1.7, maxY: 0.80 },
            { minX: w * 0.26 - 1.1, maxX: w * 0.26 + 1.1, minZ: -2.5, maxZ: -0.3, maxY: 1.28 },
            { minX: -0.65, maxX: 1.25, minZ: -2.75, maxZ: -0.85, maxY: 1.75 }
        ],
        walkablePlatforms: [
            { minX: -w * 0.5 - 0.15, maxX: w * 0.5 + 0.15, minZ: -l * 0.5 - 0.15, maxZ: l * 0.5 + 0.15, y: floorH },
            { minX: w * 0.26 - 1.1, maxX: w * 0.26 + 1.1, minZ: -0.5, maxZ: 1.7, y: 0.80 },
            { minX: w * 0.26 - 1.1, maxX: w * 0.26 + 1.1, minZ: -2.5, maxZ: -0.3, y: 1.28 },
            { minX: -0.65, maxX: 1.25, minZ: -2.75, maxZ: -0.85, y: 1.75 }
        ]
    };
    return merged;
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
        smoothDuplicateVertexNormals(geo);
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);

        const col = new Float32Array(p.count * 3);
        const nAttr = geo.attributes.normal;
        for (let k = 0; k < p.count; k++) {
            const vy = p.getY(k);
            const ny = nAttr.getY(k);
            const ridgeCrest = (vy > 3.0 && ny > 0.35) ? Math.min(1.0, (vy - 3.0) * 0.35) : 0.0;
            const shade = 0.42 + 0.30 * Math.min(1.0, Math.max(0.0, vy / 4.8));
            col[k * 3 + 0] = THREE.MathUtils.lerp(0.46 * shade, 0.54, ridgeCrest);
            col[k * 3 + 1] = THREE.MathUtils.lerp(0.50 * shade, 0.58, ridgeCrest);
            col[k * 3 + 2] = THREE.MathUtils.lerp(0.56 * shade, 0.64, ridgeCrest);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.22, 0.30);
        parts.push(geo);
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionCircles: [
            { x:  0.0,  z:  0.0,  r: 2.50 },
            { x: -1.3,  z:  0.2,  r: 2.20 },
            { x:  1.2,  z: -0.2,  r: 2.10 },
            { x: -2.6,  z:  0.4,  r: 1.95 },
            { x:  2.3,  z: -0.5,  r: 1.90 },
            { x:  0.4,  z: -0.4,  r: 1.80 },
            { x:  0.0,  z:  1.2,  r: 1.50 },
            { x:  0.0,  z: -1.2,  r: 1.50 }
        ]
    };
    return merged;
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

// 5Q. Two-Story European Village Townhouse / Manor with Steep Gable Roof & Open Walk-In Door
function createVillageTownhouseGeometry() {
    const parts = [];
    const w = 5.2, h = 4.6, l = 6.8;
    const floorY = 0.16;

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.34, doorW: 1.65, doorH: 2.48, floorY,
        tint: [0.96, 0.91, 0.84],
        foundTint: [0.62, 0.60, 0.58],
        floorTint: [0.56, 0.40, 0.26],
        doorTint: [0.38, 0.25, 0.16]
    });

    // Timber belt-course band between 1st and 2nd floor
    const belt = new THREE.BoxGeometry(w + 0.14, 0.18, l + 0.14);
    setGeometryUVBox(belt, 0.52, 0.98, 0.02, 0.48);
    belt.translate(0, floorY + 2.65, 0);
    parts.push(tintBuildingPart(belt, 0.42, 0.29, 0.18, h));

    // Steep Slate/Terracotta Roof
    const roof = createPitchedRoofGeometry(w + 1.1, l + 1.2, 3.1);
    setGeometryUVBox(roof, 0.52, 0.98, 0.52, 0.98);
    roof.translate(0, floorY + h, 0);
    parts.push(tintBuildingPart(roof, 0.72, 0.38, 0.28, h + 3.0));

    // Twin brick chimneys
    [-1, 1].forEach(side => {
        const chim = new THREE.BoxGeometry(0.75, 2.8, 0.75);
        setGeometryUVBox(chim, 0.02, 0.48, 0.02, 0.48);
        chim.translate(side * (w * 0.30), floorY + h + 1.5, -l * 0.28);
        parts.push(tintBuildingPart(chim, 0.70, 0.44, 0.36, h + 3.5));
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
}

// 5R. Rustic Normandy / Highland Stone Farmhouse with Veranda & Open Walk-In Door
function createStoneFarmhouseGeometry() {
    const parts = [];
    const w = 5.8, h = 3.4, l = 7.4;
    const floorY = 0.16;

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.34, doorW: 1.70, doorH: 2.45, floorY,
        u0: 0.02, u1: 0.48, v0: 0.02, v1: 0.48,
        tint: [0.82, 0.78, 0.70],
        foundTint: [0.58, 0.55, 0.50],
        floorTint: [0.52, 0.40, 0.28],
        doorTint: [0.44, 0.30, 0.18]
    });

    const roof = createPitchedRoofGeometry(w + 1.3, l + 1.4, 2.75);
    setGeometryUVBox(roof, 0.52, 0.98, 0.52, 0.98);
    roof.translate(0, floorY + h, 0);
    parts.push(tintBuildingPart(roof, 0.56, 0.48, 0.42, h + 3.0));

    // Stone hearth chimney on left wall
    const hearthChim = new THREE.BoxGeometry(0.95, h + 2.4, 1.25);
    setGeometryUVBox(hearthChim, 0.02, 0.48, 0.02, 0.48);
    hearthChim.translate(-w * 0.5 - 0.35, floorY + (h + 2.4) * 0.5, -0.4);
    parts.push(tintBuildingPart(hearthChim, 0.68, 0.64, 0.58, h + 2.5));

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
}

// 5S. Desert Whitewashed & Sandstone Domed Adobe House (Koubba) with Open Walk-In Door
function createDesertAdobeHouseGeometry() {
    const parts = [];
    const w = 5.2, h = 3.4, l = 6.0;
    const floorY = 0.16;

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.34, doorW: 1.65, doorH: 2.42, floorY,
        tint: [0.94, 0.89, 0.81],
        foundTint: [0.80, 0.70, 0.58],
        floorTint: [0.72, 0.60, 0.48],
        doorTint: [0.36, 0.48, 0.58] // Traditional oasis blue-stained timber door
    });

    const roofY = floorY + h;
    const roofCap = new THREE.BoxGeometry(w + 0.18, 0.28, l + 0.18);
    setGeometryUVBox(roofCap, 0.02, 0.48, 0.02, 0.48);
    roofCap.translate(0, roofY + 0.12, 0);
    parts.push(tintBuildingPart(roofCap, 0.90, 0.84, 0.76, roofY + 2.0));

    // Domed rooftop cupola (Koubba)
    const dome = new THREE.SphereGeometry(1.55, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    setGeometryUVBox(dome, 0.02, 0.48, 0.02, 0.48);
    dome.translate(0, roofY + 0.22, -0.35);
    parts.push(tintBuildingPart(dome, 0.96, 0.92, 0.85, roofY + 2.0));

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
}

// 5T. Alpine Timber & Stone Mountain Chalet with Wide Eaves, Balcony & Open Walk-In Door
function createAlpineChaletGeometry() {
    const parts = [];
    const w = 5.6, h = 3.6, l = 6.8;
    const floorY = 0.16;

    const spec = buildHollowHouseShell(parts, {
        w, h, l, wallThick: 0.34, doorW: 1.68, doorH: 2.45, floorY,
        u0: 0.52, u1: 0.98, v0: 0.02, v1: 0.48,
        tint: [0.68, 0.50, 0.34],
        foundTint: [0.62, 0.65, 0.70],
        floorTint: [0.58, 0.44, 0.30],
        doorTint: [0.42, 0.28, 0.18]
    });

    // Broad low-pitched Alpine snow-dusted roof
    const roof = createPitchedRoofGeometry(w + 1.8, l + 1.8, 2.35);
    setGeometryUVBox(roof, 0.02, 0.48, 0.02, 0.48);
    roof.translate(0, floorY + h, 0);
    parts.push(tintBuildingPart(roof, 0.86, 0.90, 0.95, h + 3.0));

    // Front timber balcony rail above open doorway
    const balcDeck = new THREE.BoxGeometry(w * 0.78, 0.14, 1.15);
    setGeometryUVBox(balcDeck, 0.52, 0.98, 0.02, 0.48);
    balcDeck.translate(0, floorY + 2.65, l * 0.5 + 0.52);
    parts.push(tintBuildingPart(balcDeck, 0.52, 0.36, 0.22, h));

    const balcRail = new THREE.BoxGeometry(w * 0.78, 0.62, 0.10);
    setGeometryUVBox(balcRail, 0.52, 0.98, 0.02, 0.48);
    balcRail.translate(0, floorY + 3.02, l * 0.5 + 1.02);
    parts.push(tintBuildingPart(balcRail, 0.56, 0.39, 0.24, h));

    const merged = mergeBufferGeometries(parts);
    merged.userData = { enterableSpec: spec };
    return merged;
}

// 5U. Additional Botanical Variety: Silver Birch, Mediterranean Cypress, Weeping Willow, Alpine Larch,
// Joshua Tree, Desert Agave, Prickly Pear, Wildflower Shrub & Woodland Ferns
function createBirchTreeGeometry() {
    const parts = [];
    const trunkH = 7.4;
    const trunk = new THREE.CylinderGeometry(0.11, 0.28, trunkH, 7, 6);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const ny = (tPos.getY(i) + trunkH * 0.5) / trunkH;
        tPos.setX(i, tPos.getX(i) + Math.sin(ny * 3.4) * 0.18);
        tPos.setZ(i, tPos.getZ(i) + Math.cos(ny * 2.7) * 0.14);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkH * 0.5, 0);

    const colorWhiteBark = (geo) => {
        const p = geo.attributes.position;
        const col = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
            const y = p.getY(i);
            const band = (Math.sin(y * 9.5) > 0.68) ? 0.25 : 1.0;
            const ao = Math.min(1.0, Math.max(0.42, y / 1.8)) * band;
            // Boosted vertex color compensates for dark Q3 bark albedo to render crisp silver-white birch bark
            col[i * 3 + 0] = 4.6 * ao;
            col[i * 3 + 1] = 5.8 * ao;
            col[i * 3 + 2] = 7.8 * ao;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return geo;
    };
    parts.push(colorWhiteBark(trunk));

    // Forked upper white-bark limbs reaching into the canopy clusters
    const forks = [
        { from: [0.12, 4.6, 0.08], to: [1.45, 7.2, 0.85], r1: 0.12, r2: 0.06 },
        { from: [0.10, 4.8, 0.06], to: [-1.35, 7.0, -0.75], r1: 0.12, r2: 0.06 },
        { from: [0.08, 5.2, 0.05], to: [0.55, 8.2, -1.15], r1: 0.10, r2: 0.05 },
        { from: [0.06, 5.4, 0.04], to: [-0.85, 8.0, 1.10], r1: 0.10, r2: 0.05 },
        { from: [0.04, 6.2, 0.02], to: [0.15, 9.2, 0.10], r1: 0.09, r2: 0.04 }
    ];
    forks.forEach(b => {
        const p1 = new THREE.Vector3(...b.from);
        const p2 = new THREE.Vector3(...b.to);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const cyl = new THREE.CylinderGeometry(b.r2, b.r1, len, 6, 2);
        setGeometryUVBox(cyl, 0.52, 0.98, 0.02, 0.48);
        cyl.translate(0, len * 0.5, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        cyl.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        cyl.translate(p1.x, p1.y, p1.z);
        parts.push(colorWhiteBark(cyl));
    });

    // 12 Overlapping Canopy Sub-Domes using Q1 Broadleaf Alpha-Cutout UVs (0.52..0.98, 0.52..0.98)
    const canopyClusters = [
        [ 0.0,  6.4,  0.0, 2.1, 0.62],
        [ 0.0,  7.8,  0.0, 2.2, 0.74],
        [ 1.4,  6.8,  0.8, 1.9, 0.80],
        [-1.3,  6.6, -0.7, 1.9, 0.78],
        [ 0.6,  6.2, -1.2, 1.8, 0.76],
        [-0.8,  6.3,  1.1, 1.8, 0.78],
        [ 1.2,  8.0, -0.6, 1.9, 0.88],
        [-1.1,  7.9,  0.9, 1.9, 0.86],
        [ 0.5,  8.3,  1.1, 1.8, 0.88],
        [-0.6,  8.2, -1.0, 1.8, 0.86],
        [ 0.3,  9.3,  0.2, 2.0, 0.96],
        [-0.3,  9.0, -0.2, 1.9, 0.94]
    ];
    const crownCenter = new THREE.Vector3(0, 7.4, 0);
    const cardOrientations = [
        { rx:  0.18, ry: 0.00, rz:  0.12 },
        { rx: -0.22, ry: 1.05, rz: -0.15 },
        { rx:  0.25, ry: 2.10, rz:  0.18 },
        { rx:  0.92, ry: 0.52, rz:  0.00 },
        { rx:  0.86, ry: 2.09, rz:  0.20 }
    ];
    canopyClusters.forEach(([cx, cy, cz, rad, brightness], cIdx) => {
        cardOrientations.forEach((ori) => {
            const w = rad * 1.42;
            const h = rad * 1.36;
            const card = createCurvedFoliageCard(w, h, 0.26, 0.52, 0.98, 0.52, 0.98);
            // Center card before rotating so all 5 cards intersect around their geometric center
            card.translate(0, -h * 0.48, 0);
            card.rotateZ(ori.rz);
            card.rotateX(ori.rx);
            card.rotateY(ori.ry + cIdx * 0.45);
            card.translate(cx, cy, cz);
            applyCanopyVolumeShading(
                card,
                crownCenter,
                0.72 * brightness,
                0.88 * brightness,
                0.42 * brightness,
                0.38 * brightness
            );
            parts.push(card);
        });
    });
    return mergeBufferGeometries(parts);
}

function createCypressTreeGeometry() {
    const parts = [];
    const trunkH = 11.2;
    const trunk = new THREE.CylinderGeometry(0.10, 0.34, trunkH, 7, 3);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    trunk.translate(0, trunkH * 0.5, 0);
    tintBuildingPart(trunk, 0.42, 0.32, 0.24, 5.0);
    parts.push(trunk);

    // Dense flame-shaped Italian Cypress spire using Q0 Conifer Alpha-Cutout UVs (0.02..0.48, 0.52..0.98)
    const crownCenter = new THREE.Vector3(0, 7.0, 0);
    const tiers = 13;
    for (let t = 0; t < tiers; t++) {
        const frac = t / (tiers - 1);
        const y = 1.8 + frac * 10.6;
        // Flame silhouette: widest around 25-35% height, tapering to a fine tip at the top
        const envelope = Math.sin(Math.pow(frac, 0.72) * Math.PI);
        const rad = 0.55 + envelope * 1.35;
        const cardW = rad * 1.65;
        const cardH = 2.35 * (1.0 - frac * 0.35);

        // 6 radial upward-cupped foliage cards + 2 crossed horizontal volume cards per tier
        const numCards = 6;
        for (let c = 0; c < numCards; c++) {
            const ang = (c / numCards) * Math.PI * 2 + t * 0.52;
            const card = createCurvedFoliageCard(cardW, cardH, 0.24, 0.02, 0.48, 0.52, 0.98);
            card.translate(0, -cardH * 0.32, 0);
            card.rotateX(0.28 + (c % 2) * 0.12);
            card.rotateY(ang);
            card.translate(0, y, 0);
            applyCanopyVolumeShading(card, crownCenter, 0.38, 0.56, 0.32, 0.36);
            parts.push(card);
        }
        // Horizontal cross-section fill card so looking up/down into the spire has full density
        const fillCard = createCurvedFoliageCard(rad * 1.75, rad * 1.75, 0.18, 0.02, 0.48, 0.52, 0.98);
        fillCard.translate(0, -rad * 0.85, 0);
        fillCard.rotateX(Math.PI * 0.46);
        fillCard.rotateY(t * 0.95);
        fillCard.translate(0, y + 0.2, 0);
        applyCanopyVolumeShading(fillCard, crownCenter, 0.34, 0.50, 0.28, 0.34);
        parts.push(fillCard);
    }
    return mergeBufferGeometries(parts);
}

function createWillowTreeGeometry() {
    const parts = [];
    const trunkH = 4.6;
    const trunk = new THREE.CylinderGeometry(0.28, 0.54, trunkH, 8, 4);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    trunk.translate(0, trunkH * 0.5, 0);
    tintBuildingPart(trunk, 0.40, 0.33, 0.25, trunkH);
    parts.push(trunk);

    // 6 Spreading gnarled willow boughs arching outward from trunk top
    const boughs = [
        { from: [0, 3.9, 0], to: [ 2.1, 6.4,  0.6], r1: 0.22, r2: 0.10 },
        { from: [0, 4.0, 0], to: [-2.0, 6.3,  0.7], r1: 0.22, r2: 0.10 },
        { from: [0, 3.8, 0], to: [ 0.7, 6.2,  2.1], r1: 0.20, r2: 0.09 },
        { from: [0, 4.1, 0], to: [-0.6, 6.5, -2.0], r1: 0.20, r2: 0.09 },
        { from: [0, 4.2, 0], to: [ 1.6, 6.8, -1.5], r1: 0.18, r2: 0.08 },
        { from: [0, 4.3, 0], to: [-1.5, 6.7,  1.6], r1: 0.18, r2: 0.08 }
    ];
    boughs.forEach(b => {
        const p1 = new THREE.Vector3(...b.from);
        const p2 = new THREE.Vector3(...b.to);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const cyl = new THREE.CylinderGeometry(b.r2, b.r1, len, 6, 2);
        setGeometryUVBox(cyl, 0.52, 0.98, 0.02, 0.48);
        cyl.translate(0, len * 0.5, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        cyl.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        cyl.translate(p1.x, p1.y, p1.z);
        tintBuildingPart(cyl, 0.40, 0.33, 0.25, 6.5);
        parts.push(cyl);
    });

    const crownCenter = new THREE.Vector3(0, 6.0, 0);

    // 1. Upper overarching crown domes (Q1 Broadleaf Alpha-Cutout: 0.52..0.98, 0.52..0.98)
    const domeClusters = [
        [ 0.0,  7.0,  0.0, 2.4, 0.72],
        [ 0.0,  8.1,  0.0, 2.2, 0.90],
        [ 1.9,  6.4,  0.5, 2.0, 0.82],
        [-1.8,  6.3,  0.6, 2.0, 0.80],
        [ 0.6,  6.2,  1.9, 2.0, 0.82],
        [-0.5,  6.4, -1.8, 2.0, 0.80],
        [ 1.4,  6.7, -1.3, 1.9, 0.84],
        [-1.3,  6.6,  1.4, 1.9, 0.84]
    ];
    const domeOrients = [
        { rx:  0.22, ry: 0.00, rz:  0.14 },
        { rx: -0.24, ry: 1.05, rz: -0.14 },
        { rx:  0.88, ry: 0.52, rz:  0.00 },
        { rx:  0.84, ry: 2.09, rz:  0.18 }
    ];
    domeClusters.forEach(([cx, cy, cz, rad, brightness], idx) => {
        domeOrients.forEach(ori => {
            const w = rad * 1.4;
            const h = rad * 1.3;
            const card = createCurvedFoliageCard(w, h, 0.28, 0.52, 0.98, 0.52, 0.98);
            card.translate(0, -h * 0.48, 0);
            card.rotateZ(ori.rz);
            card.rotateX(ori.rx);
            card.rotateY(ori.ry + idx * 0.5);
            card.translate(cx, cy, cz);
            applyCanopyVolumeShading(card, crownCenter, 0.62 * brightness, 0.84 * brightness, 0.42 * brightness, 0.38 * brightness);
            parts.push(card);
        });
    });

    // 2. Cascading Weeping Frond Curtains hanging down from the boughs (Q1 Alpha-Cutout!)
    const drapes = 16;
    for (let d = 0; d < drapes; d++) {
        const ang = (d / drapes) * Math.PI * 2;
        const r = 1.65 + (d % 3) * 0.55;
        const topY = 6.2 + (d % 2) * 0.55;
        const drapeH = 3.5;
        for (let cross = 0; cross < 2; cross++) {
            const card = createCurvedFoliageCard(1.75, drapeH, 0.34, 0.52, 0.98, 0.52, 0.98);
            // Anchor near top of card so it hangs downward from the bough tip
            card.translate(0, -drapeH * 0.72, 0);
            card.rotateX(0.14);
            card.rotateY(ang + cross * 0.65);
            card.translate(Math.cos(ang) * r, topY, Math.sin(ang) * r);
            applyCanopyVolumeShading(card, crownCenter, 0.64, 0.86, 0.44, 0.40);
            parts.push(card);
        }
    }
    return mergeBufferGeometries(parts);
}

function createAlpineLarchGeometry() {
    const parts = [];
    const trunkH = 13.8;
    const trunk = new THREE.CylinderGeometry(0.08, 0.42, trunkH, 8, 5);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    trunk.translate(0, trunkH * 0.5, 0);
    tintBuildingPart(trunk, 0.42, 0.32, 0.24, trunkH);
    parts.push(trunk);

    // 13 Dense Overlapping Conical Tiers of Drooping Golden-Olive Larch Boughs (Q0: [0.02..0.48, 0.52..0.98])
    const tierConfigs = [
        { y: 1.8,  rad: 3.8, boughs: 8, droop: 0.34 },
        { y: 2.8,  rad: 3.5, boughs: 8, droop: 0.32 },
        { y: 3.8,  rad: 3.2, boughs: 7, droop: 0.29 },
        { y: 4.8,  rad: 2.9, boughs: 7, droop: 0.26 },
        { y: 5.8,  rad: 2.6, boughs: 7, droop: 0.24 },
        { y: 6.8,  rad: 2.4, boughs: 6, droop: 0.21 },
        { y: 7.8,  rad: 2.1, boughs: 6, droop: 0.18 },
        { y: 8.8,  rad: 1.8, boughs: 6, droop: 0.15 },
        { y: 9.7,  rad: 1.5, boughs: 5, droop: 0.12 },
        { y: 10.6, rad: 1.2, boughs: 5, droop: 0.09 },
        { y: 11.5, rad: 0.9, boughs: 4, droop: 0.06 },
        { y: 12.3, rad: 0.7, boughs: 4, droop: 0.03 },
        { y: 13.0, rad: 0.45, boughs: 4, droop: 0.00 }
    ];

    tierConfigs.forEach((cfg, t) => {
        const tierCenter = new THREE.Vector3(0, cfg.y - 0.45, 0);
        const heightShade = 0.56 + (cfg.y / trunkH) * 0.44;
        for (let b = 0; b < cfg.boughs; b++) {
            const angle = (b / cfg.boughs) * Math.PI * 2.0 + t * 0.65;
            const bLen = cfg.rad;
            const bWidth = cfg.rad * 0.80;

            // Main drooping larch bough
            const mainCard = createCurvedFoliageCard(bWidth, bLen, 0.36, 0.02, 0.48, 0.52, 0.98);
            mainCard.rotateX(Math.PI * 0.5 + cfg.droop);
            mainCard.rotateY(angle);
            mainCard.translate(Math.cos(angle) * 0.10, cfg.y, Math.sin(angle) * 0.10);
            applyCanopyVolumeShading(mainCard, tierCenter, 0.84 * heightShade, 0.76 * heightShade, 0.34 * heightShade, 0.38);
            parts.push(mainCard);

            // Secondary angled upper-fill bough to hide inter-tier gaps
            if (b % 2 === 0) {
                const fillCard = createCurvedFoliageCard(bWidth * 0.85, bLen * 0.88, 0.28, 0.02, 0.48, 0.52, 0.98);
                fillCard.rotateZ(0.38);
                fillCard.rotateX(Math.PI * 0.40 + cfg.droop * 0.65);
                fillCard.rotateY(angle + 0.26);
                fillCard.translate(Math.cos(angle + 0.26) * 0.12, cfg.y + 0.32, Math.sin(angle + 0.26) * 0.12);
                applyCanopyVolumeShading(fillCard, tierCenter, 0.78 * heightShade, 0.70 * heightShade, 0.30 * heightShade, 0.34);
                parts.push(fillCard);
            }
        }
    });
    return mergeBufferGeometries(parts);
}

function createJoshuaTreeGeometry() {
    const parts = [];
    const branches = [
        { from: [0, 0, 0], to: [0, 3.2, 0], r: 0.26, tip: false },
        { from: [0, 2.8, 0], to: [1.15, 4.5, 0.35], r: 0.19, tip: true },
        { from: [0, 2.6, 0], to: [-1.05, 4.2, -0.30], r: 0.18, tip: true },
        { from: [1.05, 4.3, 0.30], to: [1.55, 5.5, -0.20], r: 0.15, tip: true },
        { from: [-0.95, 4.0, -0.25], to: [-0.45, 5.3, 0.75], r: 0.15, tip: true },
        { from: [0, 3.0, 0], to: [0.15, 5.8, 0.10], r: 0.17, tip: true }
    ];
    const crownCenter = new THREE.Vector3(0, 4.5, 0);
    branches.forEach((b, bIdx) => {
        const p1 = new THREE.Vector3(...b.from);
        const p2 = new THREE.Vector3(...b.to);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const cyl = new THREE.CylinderGeometry(b.r * 0.78, b.r, len, 7, 2);
        setGeometryUVBox(cyl, 0.52, 0.98, 0.02, 0.48);
        cyl.translate(0, len * 0.5, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        cyl.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        cyl.translate(p1.x, p1.y, p1.z);
        tintBuildingPart(cyl, 0.46, 0.38, 0.28, 5.5);
        parts.push(cyl);

        if (b.tip) {
            // Spiky Yucca rosette tuft at branch apex using Q0 Conifer Needle Alpha-Cutout UVs (0.02..0.48, 0.52..0.98)
            for (let c = 0; c < 5; c++) {
                const card = createCurvedFoliageCard(1.35, 1.35, 0.22, 0.02, 0.48, 0.52, 0.98);
                card.translate(0, -0.65, 0);
                card.rotateX((c % 2 === 0 ? 0.45 : -0.45));
                card.rotateY((c / 5) * Math.PI * 2 + bIdx * 0.7);
                card.translate(p2.x, p2.y + 0.1, p2.z);
                applyCanopyVolumeShading(card, crownCenter, 0.56, 0.68, 0.34, 0.38);
                parts.push(card);
            }
        }
    });
    return mergeBufferGeometries(parts);
}

function createDesertAgaveGeometry() {
    const parts = [];
    const blades = 12;
    for (let i = 0; i < blades; i++) {
        const ang = (i / blades) * Math.PI * 2;
        const tilt = (i % 2 === 0) ? 0.55 : 0.85;
        const blade = new THREE.ConeGeometry(0.22, 1.35, 5);
        blade.scale(1.0, 1.0, 0.35);
        blade.translate(0, 0.65, 0);
        blade.rotateX(tilt);
        blade.rotateY(ang);
        tintBuildingPart(blade, 0.34, 0.52, 0.42, 1.5);
        parts.push(blade);
    }
    return mergeBufferGeometries(parts);
}

function createPricklyPearGeometry() {
    const parts = [];
    const pads = [
        { x: 0, y: 0.45, z: 0, rx: 0, ry: 0, rz: 0, s: 0.48 },
        { x: 0.38, y: 0.95, z: 0.05, rx: 0.1, ry: 0.3, rz: -0.45, s: 0.40 },
        { x: -0.36, y: 0.90, z: -0.05, rx: -0.1, ry: -0.2, rz: 0.42, s: 0.38 },
        { x: 0.05, y: 1.15, z: 0.25, rx: 0.35, ry: 0.8, rz: 0.1, s: 0.35 }
    ];
    pads.forEach(p => {
        const pad = new THREE.SphereGeometry(p.s, 8, 6);
        pad.scale(1.0, 1.25, 0.32);
        pad.rotateX(p.rx);
        pad.rotateY(p.ry);
        pad.rotateZ(p.rz);
        pad.translate(p.x, p.y, p.z);
        tintBuildingPart(pad, 0.28, 0.50, 0.24, 1.6);
        parts.push(pad);
    });
    return mergeBufferGeometries(parts);
}

function createWildflowerBushGeometry() {
    const geo = createDetailedBushGeometry(true);
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.75 && (i % 5 === 0)) {
            col.setXYZ(i, 0.92, 0.72, 0.28);
        }
    }
    col.needsUpdate = true;
    return geo;
}

function createFernClusterGeometry() {
    const parts = [];
    const center = new THREE.Vector3(0, 0.55, 0);
    // Outer sweeping tropical fern / palm-fern fronds
    for (let f = 0; f < 10; f++) {
        const ang = (f / 10) * Math.PI * 2;
        const frond = createCurvedFoliageCard(1.05, 1.85, 0.58, 0.52, 0.98, 0.52, 0.98);
        frond.rotateX(Math.PI * 0.38);
        frond.rotateY(ang);
        frond.translate(0, 0.14, 0);
        applyCanopyVolumeShading(frond, center, 0.34, 0.72, 0.24, 0.36);
        parts.push(frond);
    }
    // Inner upright young tropical elephant-ear / fern crown fronds
    for (let f = 0; f < 6; f++) {
        const ang = (f / 6) * Math.PI * 2 + 0.32;
        const inner = createCurvedFoliageCard(0.88, 1.42, 0.36, 0.52, 0.98, 0.52, 0.98);
        inner.rotateX(Math.PI * 0.22);
        inner.rotateY(ang);
        inner.translate(0, 0.22, 0);
        applyCanopyVolumeShading(inner, center, 0.46, 0.84, 0.30, 0.44);
        parts.push(inner);
    }
    return mergeBufferGeometries(parts);
}


// ---------------------------------------------------------------------------
// OBSTACLE FOOTPRINTS & WALK-IN ENTERABLE HOUSE COLLISION
// Building collision uses an oriented XZ box measured from the model geometry
// for tanks, while enterable houses expose individual `wallBoxes` (leaving the
// front doorway open) and distance-streamed `interiorBoxes` for soldiers on foot.
// ---------------------------------------------------------------------------
function getGeometryFootprint(geo) {
    if (!geo.__footprint) {
        if (typeof geo.computeBoundingBox === 'function') geo.computeBoundingBox();
        const bb = geo.boundingBox || { min: { x: -3, y: 0, z: -3 }, max: { x: 3, y: 3, z: 3 } };
        const pos = (geo.attributes && geo.attributes.position) ? geo.attributes.position : null;
        if (!pos) {
            const maxR = Math.max(
                Math.hypot(bb.min.x, bb.min.z), Math.hypot(bb.max.x, bb.min.z),
                Math.hypot(bb.min.x, bb.max.z), Math.hypot(bb.max.x, bb.max.z)
            );
            geo.__footprint = { minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, maxR: maxR };
            return geo.__footprint;
        }
        const hRange = bb.max.y - bb.min.y;
        const yCutoff = hRange > 1.0 ? Math.min(bb.min.y + 3.2, bb.min.y + hRange * 0.45) : Infinity;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxR = 0;
        let count = 0;
        for (let i = 0; i < pos.count; i++) {
            const vy = pos.getY(i);
            if (vy <= yCutoff) {
                const vx = pos.getX(i), vz = pos.getZ(i);
                if (vx < minX) minX = vx;
                if (vx > maxX) maxX = vx;
                if (vz < minZ) minZ = vz;
                if (vz > maxZ) maxZ = vz;
                const r = Math.hypot(vx, vz);
                if (r > maxR) maxR = r;
                count++;
            }
        }
        if (count < 4) {
            minX = bb.min.x; maxX = bb.max.x; minZ = bb.min.z; maxZ = bb.max.z;
            maxR = 0;
            for (let i = 0; i < pos.count; i++) {
                const r = Math.hypot(pos.getX(i), pos.getZ(i));
                if (r > maxR) maxR = r;
            }
        }
        geo.__footprint = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, maxR: maxR };
    }
    return geo.__footprint;
}

function makeObstacleShape(geo, scale, rot) {
    const f = getGeometryFootprint(geo);
    const shape = {
        minX: f.minX * scale, maxX: f.maxX * scale,
        minZ: f.minZ * scale, maxZ: f.maxZ * scale,
        rot: rot, c: Math.cos(rot), s: Math.sin(rot), radius: 0
    };
    shape.radius = Math.max(
        Math.hypot(shape.minX, shape.minZ), Math.hypot(shape.maxX, shape.minZ),
        Math.hypot(shape.minX, shape.maxZ), Math.hypot(shape.maxX, shape.maxZ)
    );
    return shape;
}

// Attach an oriented box (buildings, walls). Sets obs.box and obs.radius,
// plus walk-in `wallBoxes` if the geometry defines `userData.enterableSpec`,
// or tight multi-primitive `collisionCircles` / `collisionBoxes` for rocks & monuments.
function attachObstacleBox(obj, geo, scale, rot) {
    const sc = scale || 1.0;
    const rt = (rot !== undefined) ? rot : (obj.rot || (obj.mesh && obj.mesh.rotation ? obj.mesh.rotation.y : 0.0));
    obj.box = makeObstacleShape(geo, sc, rt);
    obj.radius = obj.box.radius;
    obj.scale = sc;
    obj.rot = rt;
    obj.c = obj.box.c;
    obj.s = obj.box.s;

    if (geo && geo.userData) {
        if (geo.userData.isRock) obj.isRock = true;
        if (geo.userData.useMeshRaycastOnly) obj.useMeshRaycastOnly = true;
        if (geo.userData.collisionCircles && !obj.isWall) {
            obj.collisionCircles = geo.userData.collisionCircles.map(c => ({
                x: c.x * sc,
                z: c.z * sc,
                r: c.r * sc
            }));
        }
        if (geo.userData.collisionBoxes && !obj.isWall) {
            obj.collisionBoxes = geo.userData.collisionBoxes.map(b => ({
                minX: b.minX * sc,
                maxX: b.maxX * sc,
                minZ: b.minZ * sc,
                maxZ: b.maxZ * sc,
                maxY: (b.maxY !== undefined) ? b.maxY * sc : undefined
            }));
        }
        if (geo.userData.walkablePlatforms && !obj.isWall) {
            obj.walkablePlatforms = geo.userData.walkablePlatforms.map(p => ({
                minX: (p.minX !== undefined) ? p.minX * sc : undefined,
                maxX: (p.maxX !== undefined) ? p.maxX * sc : undefined,
                minZ: (p.minZ !== undefined) ? p.minZ * sc : undefined,
                maxZ: (p.maxZ !== undefined) ? p.maxZ * sc : undefined,
                x: (p.x !== undefined) ? p.x * sc : 0,
                z: (p.z !== undefined) ? p.z * sc : 0,
                r: (p.r !== undefined) ? p.r * sc : undefined,
                y: (p.y !== undefined) ? p.y * sc : 0,
                y0: (p.y0 !== undefined) ? p.y0 * sc : undefined,
                y1: (p.y1 !== undefined) ? p.y1 * sc : undefined,
                rampAxis: p.rampAxis
            }));
        }
        if (obj.collisionCircles || obj.collisionBoxes || obj.walkablePlatforms) {
            let tightR = 0;
            if (obj.collisionCircles) {
                for (let i = 0; i < obj.collisionCircles.length; i++) {
                    const c = obj.collisionCircles[i];
                    const d = Math.hypot(c.x, c.z) + c.r;
                    if (d > tightR) tightR = d;
                }
            }
            if (obj.collisionBoxes) {
                for (let i = 0; i < obj.collisionBoxes.length; i++) {
                    const b = obj.collisionBoxes[i];
                    const d = Math.max(
                        Math.hypot(b.minX, b.minZ), Math.hypot(b.maxX, b.minZ),
                        Math.hypot(b.minX, b.maxZ), Math.hypot(b.maxX, b.maxZ)
                    );
                    if (d > tightR) tightR = d;
                }
            }
            if (obj.walkablePlatforms) {
                for (let i = 0; i < obj.walkablePlatforms.length; i++) {
                    const p = obj.walkablePlatforms[i];
                    const d = (p.r !== undefined)
                        ? (Math.hypot(p.x || 0, p.z || 0) + p.r)
                        : Math.max(
                            Math.hypot(p.minX || 0, p.minZ || 0), Math.hypot(p.maxX || 0, p.minZ || 0),
                            Math.hypot(p.minX || 0, p.maxZ || 0), Math.hypot(p.maxX || 0, p.maxZ || 0)
                        );
                    if (d > tightR) tightR = d;
                }
            }
            if (tightR > 0) {
                obj.radius = tightR;
                obj.box.radius = tightR;
            }
        }
    }

    if (geo && geo.userData && geo.userData.enterableSpec && !obj.isRuin && !obj.isWall) {
        const spec = geo.userData.enterableSpec;
        const hw = (spec.w * 0.5) * sc;
        const hl = (spec.l * 0.5) * sc;
        const wt = Math.max(0.28, (spec.wallThick || 0.32) * sc);
        const hdw = ((spec.doorW || 1.65) * 0.5) * sc;
        const winW = (spec.winW || Math.min(1.4, spec.w * 0.30)) * sc;
        const winH = (spec.winH || 1.05) * sc;
        const winSillH = (spec.winSillH || 1.15) * sc;
        const sideWinL = (spec.sideWinL || Math.min(1.5, spec.l * 0.26)) * sc;
        const flY = (spec.floorY !== undefined ? spec.floorY : 0.16) * sc;

        obj.enterable = true;
        obj.enterableSpec = spec;
        obj.floorHeight = flY;
        obj.ceilingHeight = (spec.h || 3.4) * sc;
        obj.wallBoxes = [
            // Back wall (-Z)
            { minX: -hw, maxX: hw, minZ: -hl, maxZ: -hl + wt },
            // Left wall (-X)
            { minX: -hw, maxX: -hw + wt, minZ: -hl, maxZ: hl },
            // Right wall (+X)
            { minX: hw - wt, maxX: hw, minZ: -hl, maxZ: hl },
            // Front-left wall (+Z, left of doorway)
            { minX: -hw, maxX: -hdw, minZ: hl - wt, maxZ: hl },
            // Front-right wall (+Z, right of doorway)
            { minX: hdw, maxX: hw, minZ: hl - wt, maxZ: hl }
        ];
        obj.windows = [
            // Back window (-Z)
            {
                type: 'back',
                minX: -winW * 0.5 - 0.20,
                maxX: winW * 0.5 + 0.20,
                minY: flY + winSillH - 0.15,
                maxY: flY + winSillH + winH + 0.15,
                minZ: -hl - 0.80,
                maxZ: -hl + wt + 0.80
            },
            // Left window (-X)
            {
                type: 'left',
                minX: -hw - 0.80,
                maxX: -hw + wt + 0.80,
                minY: flY + winSillH - 0.15,
                maxY: flY + winSillH + winH + 0.15,
                minZ: -sideWinL * 0.5 - 0.25,
                maxZ: sideWinL * 0.5 + 0.25
            },
            // Right window (+X)
            {
                type: 'right',
                minX: hw - wt - 0.80,
                maxX: hw + 0.80,
                minY: flY + winSillH - 0.15,
                maxY: flY + winSillH + winH + 0.15,
                minZ: -sideWinL * 0.5 - 0.25,
                maxZ: sideWinL * 0.5 + 0.25
            }
        ];
        obj.interiorLoaded = false;
        obj.interiorMesh = null;
        obj.interiorBoxes = [];
    }
    if (obj.mesh) {
        obj.mesh.userData = obj.mesh.userData || {};
        obj.mesh.userData.obstacle = obj;
    }
    return obj;
}

// Attach a measured circle or multi-circle cluster (rocks).
function attachObstacleCircle(obj, geo, scale, rot) {
    const sc = scale || 1.0;
    const rt = (rot !== undefined) ? rot : (obj.rot || (obj.mesh && obj.mesh.rotation ? obj.mesh.rotation.y : 0.0));
    obj.box = makeObstacleShape(geo, sc, rt);
    obj.scale = sc;
    obj.rot = rt;
    obj.c = obj.box.c;
    obj.s = obj.box.s;

    if (geo && geo.userData) {
        if (geo.userData.isRock) obj.isRock = true;
        if (geo.userData.useMeshRaycastOnly) obj.useMeshRaycastOnly = true;
        if (geo.userData.collisionCircles) {
            obj.collisionCircles = geo.userData.collisionCircles.map(c => ({
                x: c.x * sc,
                z: c.z * sc,
                r: c.r * sc
            }));
        }
        if (geo.userData.collisionBoxes) {
            obj.collisionBoxes = geo.userData.collisionBoxes.map(b => ({
                minX: b.minX * sc,
                maxX: b.maxX * sc,
                minZ: b.minZ * sc,
                maxZ: b.maxZ * sc,
                maxY: (b.maxY !== undefined) ? b.maxY * sc : undefined
            }));
        }
        if (geo.userData.walkablePlatforms) {
            obj.walkablePlatforms = geo.userData.walkablePlatforms.map(p => ({
                minX: (p.minX !== undefined) ? p.minX * sc : undefined,
                maxX: (p.maxX !== undefined) ? p.maxX * sc : undefined,
                minZ: (p.minZ !== undefined) ? p.minZ * sc : undefined,
                maxZ: (p.maxZ !== undefined) ? p.maxZ * sc : undefined,
                x: (p.x !== undefined) ? p.x * sc : 0,
                z: (p.z !== undefined) ? p.z * sc : 0,
                r: (p.r !== undefined) ? p.r * sc : undefined,
                y: (p.y !== undefined) ? p.y * sc : 0,
                y0: (p.y0 !== undefined) ? p.y0 * sc : undefined,
                y1: (p.y1 !== undefined) ? p.y1 * sc : undefined,
                rampAxis: p.rampAxis
            }));
        }
    }

    if ((obj.collisionCircles && obj.collisionCircles.length > 0) || (obj.collisionBoxes && obj.collisionBoxes.length > 0)) {
        let maxR = 0;
        if (obj.collisionCircles) {
            for (let i = 0; i < obj.collisionCircles.length; i++) {
                const c = obj.collisionCircles[i];
                const d = Math.hypot(c.x, c.z) + c.r;
                if (d > maxR) maxR = d;
            }
        }
        if (obj.collisionBoxes) {
            for (let i = 0; i < obj.collisionBoxes.length; i++) {
                const b = obj.collisionBoxes[i];
                const d = Math.max(
                    Math.hypot(b.minX, b.minZ), Math.hypot(b.maxX, b.minZ),
                    Math.hypot(b.minX, b.maxZ), Math.hypot(b.maxX, b.maxZ)
                );
                if (d > maxR) maxR = d;
            }
        }
        obj.radius = maxR;
        if (obj.box) obj.box.radius = maxR;
    } else {
        obj.radius = getGeometryFootprint(geo).maxR * sc;
        if (obj.box) obj.box.radius = obj.radius;
    }
    if (obj.mesh) {
        obj.mesh.userData = obj.mesh.userData || {};
        obj.mesh.userData.obstacle = obj;
    }
    return obj;
}

// Checks if a 3D world position is within any window opening of an enterable obstacle
function isPointInObstacleWindow(obs, pt) {
    if (!obs || !pt || !obs.box || !obs.windows || obs.windows.length === 0) return false;
    const l = obstacleLocalCoords(obs, pt.x, pt.z);
    const ly = pt.y - (typeof obs.y === 'number' ? obs.y : 0);
    for (let i = 0; i < obs.windows.length; i++) {
        const win = obs.windows[i];
        if (l.x >= win.minX && l.x <= win.maxX &&
            l.z >= win.minZ && l.z <= win.maxZ &&
            ly >= win.minY && ly <= win.maxY) {
            return true;
        }
    }
    return false;
}

// World XZ offset -> obstacle local (un-rotated) coordinates.
function obstacleLocalCoords(obs, x, z) {
    const b = obs.box;
    const c = b ? b.c : (typeof obs.c === 'number' ? obs.c : Math.cos(obs.rot || 0));
    const s = b ? b.s : (typeof obs.s === 'number' ? obs.s : Math.sin(obs.rot || 0));
    const dx = x - obs.x, dz = z - obs.z;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
}

function pushOutOfLocalAABB(lx, lz, box, p) {
    const minX = box.minX - p, maxX = box.maxX + p;
    const minZ = box.minZ - p, maxZ = box.maxZ + p;
    if (lx <= minX || lx >= maxX || lz <= minZ || lz >= maxZ) return null;
    const dL = lx - minX, dR = maxX - lx, dB = lz - minZ, dF = maxZ - lz;
    const m = Math.min(dL, dR, dB, dF);
    if (m === dL) return { dx: minX - lx, dz: 0 };
    if (m === dR) return { dx: maxX - lx, dz: 0 };
    if (m === dB) return { dx: 0, dz: minZ - lz };
    return { dx: 0, dz: maxZ - lz };
}

function pushOutOfLocalCircle(lx, lz, circle, p) {
    const dx = lx - circle.x, dz = lz - circle.z;
    const d = Math.hypot(dx, dz);
    const R = circle.r + p;
    if (d >= R) return null;
    if (d < 1e-6) return { dx: R, dz: 0 };
    const k = (R - d) / d;
    return { dx: dx * k, dz: dz * k };
}

function segmentEntryLocalAABB(ax, az, bx, bz, box, p) {
    const minX = box.minX - p, maxX = box.maxX + p;
    const minZ = box.minZ - p, maxZ = box.maxZ + p;
    const dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) {
        if (ax <= minX || ax >= maxX) return -1;
    } else {
        let ta = (minX - ax) / dx, tb = (maxX - ax) / dx;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return -1;
    }
    if (Math.abs(dz) < 1e-9) {
        if (az <= minZ || az >= maxZ) return -1;
    } else {
        let ta = (minZ - az) / dz, tb = (maxZ - az) / dz;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return -1;
    }
    return t0;
}

function segmentEntryLocalCircle(ax, az, bx, bz, circle, p) {
    const R = circle.r + p;
    const fx = ax - circle.x, fz = az - circle.z;
    const c = fx * fx + fz * fz - R * R;
    if (c <= 0) return 0;
    const dx = bx - ax, dz = bz - az;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return -1;
    const bq = 2 * (fx * dx + fz * dz);
    const disc = bq * bq - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-bq - Math.sqrt(disc)) / (2 * a);
    return (t >= 0 && t <= 1) ? t : -1;
}

// Returns the world XZ displacement that moves (x, z) out of the obstacle
// expanded by `pad`, or null if the point is already clear.
// Supports tight multi-circle / multi-box clusters (rocks, buttes, colonnades, arches, temples, ruins)
// as well as enterable houses with open doorways and height-capped climbable ruin/pyramid ledges.
function obstaclePushOut(obs, x, z, pad, entityRelY) {
    const p = pad || 0;
    if ((obs.collisionCircles && obs.collisionCircles.length > 0) || (obs.collisionBoxes && obs.collisionBoxes.length > 0)) {
        const b = obs.box;
        const c = b ? b.c : (typeof obs.c === 'number' ? obs.c : Math.cos(obs.rot || 0));
        const s = b ? b.s : (typeof obs.s === 'number' ? obs.s : Math.sin(obs.rot || 0));
        const l = obstacleLocalCoords(obs, x, z);
        let curX = l.x, curZ = l.z;
        let moved = false;
        for (let iter = 0; iter < 3; iter++) {
            let iterMoved = false;
            if (obs.collisionCircles) {
                for (let i = 0; i < obs.collisionCircles.length; i++) {
                    const push = pushOutOfLocalCircle(curX, curZ, obs.collisionCircles[i], p);
                    if (push) {
                        curX += push.dx;
                        curZ += push.dz;
                        iterMoved = true;
                        moved = true;
                    }
                }
            }
            if (obs.collisionBoxes) {
                for (let i = 0; i < obs.collisionBoxes.length; i++) {
                    const cb = obs.collisionBoxes[i];
                    // If this box is a low ruin ledge or stepped pyramid terrace with maxY, and the soldier's
                    // feet are already high enough to step/stand on top of it, do not push the soldier off!
                    if (cb.maxY !== undefined && typeof entityRelY === 'number' && entityRelY >= cb.maxY - 0.65) {
                        continue;
                    }
                    const push = pushOutOfLocalAABB(curX, curZ, cb, p);
                    if (push) {
                        curX += push.dx;
                        curZ += push.dz;
                        iterMoved = true;
                        moved = true;
                    }
                }
            }
            if (!iterMoved) break;
        }
        if (!moved) return null;
        const px = curX - l.x, pz = curZ - l.z;
        return { x: px * c + pz * s, z: -px * s + pz * c };
    }
    if (!obs.box) {
        const dx = x - obs.x, dz = z - obs.z;
        const d = Math.hypot(dx, dz);
        const R = obs.radius + p;
        if (d >= R) return null;
        if (d < 1e-6) return { x: R, z: 0 };
        const k = (R - d) / d;
        return { x: dx * k, z: dz * k };
    }
    const b = obs.box;
    const l = obstacleLocalCoords(obs, x, z);

    if (obs.enterable && obs.wallBoxes && p <= 0.65) {
        let curX = l.x, curZ = l.z;
        let moved = false;
        for (let i = 0; i < obs.wallBoxes.length; i++) {
            const push = pushOutOfLocalAABB(curX, curZ, obs.wallBoxes[i], p);
            if (push) {
                curX += push.dx;
                curZ += push.dz;
                moved = true;
            }
        }
        if (obs.interiorLoaded && obs.interiorBoxes) {
            for (let i = 0; i < obs.interiorBoxes.length; i++) {
                const push = pushOutOfLocalAABB(curX, curZ, obs.interiorBoxes[i], p);
                if (push) {
                    curX += push.dx;
                    curZ += push.dz;
                    moved = true;
                }
            }
        }
        if (!moved) return null;
        const px = curX - l.x, pz = curZ - l.z;
        return { x: px * b.c + pz * b.s, z: -px * b.s + pz * b.c };
    }

    const minX = b.minX - p, maxX = b.maxX + p;
    const minZ = b.minZ - p, maxZ = b.maxZ + p;
    if (l.x <= minX || l.x >= maxX || l.z <= minZ || l.z >= maxZ) return null;
    // Exit through the nearest face.
    const dL = l.x - minX, dR = maxX - l.x, dB = l.z - minZ, dF = maxZ - l.z;
    const m = Math.min(dL, dR, dB, dF);
    let lx = l.x, lz = l.z;
    if (m === dL) lx = minX;
    else if (m === dR) lx = maxX;
    else if (m === dB) lz = minZ;
    else lz = maxZ;
    const px = lx - l.x, pz = lz - l.z;
    return { x: px * b.c + pz * b.s, z: -px * b.s + pz * b.c };
}

// Fraction t in [0, 1] where segment A->B first enters the obstacle expanded by
// `pad`, or -1 if it never does. Starting inside returns 0.
function obstacleSegmentEntry(obs, ax, az, bx, bz, pad) {
    const p = pad || 0;
    if ((obs.collisionCircles && obs.collisionCircles.length > 0) || (obs.collisionBoxes && obs.collisionBoxes.length > 0)) {
        const A = obstacleLocalCoords(obs, ax, az);
        const B = obstacleLocalCoords(obs, bx, bz);
        let bestT = -1;
        if (obs.collisionCircles) {
            for (let i = 0; i < obs.collisionCircles.length; i++) {
                const t = segmentEntryLocalCircle(A.x, A.z, B.x, B.z, obs.collisionCircles[i], p);
                if (t >= 0 && (bestT < 0 || t < bestT)) bestT = t;
            }
        }
        if (obs.collisionBoxes) {
            for (let i = 0; i < obs.collisionBoxes.length; i++) {
                const t = segmentEntryLocalAABB(A.x, A.z, B.x, B.z, obs.collisionBoxes[i], p);
                if (t >= 0 && (bestT < 0 || t < bestT)) bestT = t;
            }
        }
        return bestT;
    }
    if (!obs.box) {
        const R = obs.radius + p;
        const fx = ax - obs.x, fz = az - obs.z;
        const c = fx * fx + fz * fz - R * R;
        if (c <= 0) return 0;
        const dx = bx - ax, dz = bz - az;
        const a = dx * dx + dz * dz;
        if (a < 1e-9) return -1;
        const bq = 2 * (fx * dx + fz * dz);
        const disc = bq * bq - 4 * a * c;
        if (disc < 0) return -1;
        const t = (-bq - Math.sqrt(disc)) / (2 * a);
        return (t >= 0 && t <= 1) ? t : -1;
    }
    const b = obs.box;
    const A = obstacleLocalCoords(obs, ax, az);
    const B = obstacleLocalCoords(obs, bx, bz);

    if (obs.enterable && obs.wallBoxes && p <= 0.65) {
        let bestT = -1;
        for (let i = 0; i < obs.wallBoxes.length; i++) {
            const t = segmentEntryLocalAABB(A.x, A.z, B.x, B.z, obs.wallBoxes[i], p);
            if (t >= 0 && (bestT < 0 || t < bestT)) bestT = t;
        }
        if (p > 0.05 && obs.interiorLoaded && obs.interiorBoxes) {
            for (let i = 0; i < obs.interiorBoxes.length; i++) {
                const t = segmentEntryLocalAABB(A.x, A.z, B.x, B.z, obs.interiorBoxes[i], p);
                if (t >= 0 && (bestT < 0 || t < bestT)) bestT = t;
            }
        }
        return bestT;
    }

    return segmentEntryLocalAABB(A.x, A.z, B.x, B.z, b, p);
}

// Returns the floor elevation if (x, z) is inside an enterable building's room,
// or on top of a ruin / temple / colonnade / stepped pyramid platform, or terrainY otherwise.
function getBuildingFloorHeight(x, z, terrainY, currentEntityY) {
    let bestH = (typeof terrainY === 'number') ? terrainY : ((typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) : 0);
    const obstacles = window.worldObstacles || worldObstacles || [];
    for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (!obs || (!obs.enterable && (!obs.walkablePlatforms || obs.walkablePlatforms.length === 0))) continue;
        const dx = x - obs.x, dz = z - obs.z;
        const maxR = (obs.radius || 8.0) + 1.5;
        if (dx * dx + dz * dz > maxR * maxR) continue;
        const l = obstacleLocalCoords(obs, x, z);

        if (obs.enterable && obs.box) {
            const spec = obs.enterableSpec;
            const sc = obs.scale || 1.0;
            const hw = (spec ? spec.w * 0.5 : 2.5) * sc;
            const hl = (spec ? spec.l * 0.5 : 3.2) * sc;
            if (Math.abs(l.x) <= hw + 0.1 && Math.abs(l.z) <= hl + 0.35) {
                const bldgFloorY = obs.y - 0.12 + (obs.floorHeight || 0.16);
                if (bldgFloorY > bestH) bestH = bldgFloorY;
            }
        }

        if (obs.walkablePlatforms && obs.walkablePlatforms.length > 0) {
            const meshBaseY = (obs.mesh && obs.mesh.position && typeof obs.mesh.position.y === 'number')
                ? obs.mesh.position.y
                : ((typeof obs.y === 'number' ? obs.y : 0) - 0.15);
            for (let pIdx = 0; pIdx < obs.walkablePlatforms.length; pIdx++) {
                const plat = obs.walkablePlatforms[pIdx];
                let inside = false;
                if (plat.r !== undefined) {
                    const pdx = l.x - (plat.x || 0);
                    const pdz = l.z - (plat.z || 0);
                    if (pdx * pdx + pdz * pdz <= (plat.r + 0.22) * (plat.r + 0.22)) {
                        inside = true;
                    }
                } else if (plat.minX !== undefined) {
                    if (l.x >= plat.minX - 0.18 && l.x <= plat.maxX + 0.18 &&
                        l.z >= plat.minZ - 0.18 && l.z <= plat.maxZ + 0.18) {
                        inside = true;
                    }
                }
                if (!inside) continue;

                let platLocalY = plat.y || 0;
                if (plat.rampAxis === 'z' && plat.y0 !== undefined && plat.y1 !== undefined) {
                    const spanZ = Math.max(0.01, plat.maxZ - plat.minZ);
                    const t = THREE.MathUtils.clamp((l.z - plat.minZ) / spanZ, 0.0, 1.0);
                    platLocalY = plat.y0 + t * (plat.y1 - plat.y0);
                } else if (plat.rampAxis === 'x' && plat.y0 !== undefined && plat.y1 !== undefined) {
                    const spanX = Math.max(0.01, plat.maxX - plat.minX);
                    const t = THREE.MathUtils.clamp((l.x - plat.minX) / spanX, 0.0, 1.0);
                    platLocalY = plat.y0 + t * (plat.y1 - plat.y0);
                }

                const platWorldY = meshBaseY + platLocalY;
                // Walk-on platforms/steps (platLocalY <= 1.35m) or ramps are always reachable;
                // higher ruin/pyramid ledges require the entity's feet to be within step/jump reach (0.75m).
                const isReachable = (typeof currentEntityY !== 'number') ||
                    (platLocalY <= 1.35) ||
                    (plat.rampAxis !== undefined && currentEntityY >= platWorldY - 1.45) ||
                    (currentEntityY >= platWorldY - 0.75);
                if (isReachable && platWorldY > bestH) {
                    bestH = platWorldY;
                }
            }
        }
    }
    return bestH;
}

// ---------------------------------------------------------------------------
// PROCEDURAL DISTANCE-STREAMED HOUSE INTERIORS
// To save memory and GPU resources, house interior furniture is generated
// procedurally ONLY when the player closes in (< 38m) and disposed when far (> 48m).
// ---------------------------------------------------------------------------
const INTERIOR_LOAD_DIST = 38.0;
const INTERIOR_UNLOAD_DIST = 48.0;
let sharedInteriorMat = null;

function getInteriorMaterial() {
    if (!sharedInteriorMat) {
        sharedInteriorMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.80,
            metalness: 0.05,
            envMapIntensity: GROUND_ENV_MAP_INTENSITY,
            side: THREE.DoubleSide
        });
        sharedInteriorMat.userData.noIndirectSpecular = true;
    }
    return sharedInteriorMat;
}

function loadBuildingInterior(bldg) {
    if (!bldg || !bldg.enterable || bldg.interiorLoaded || !bldg.mesh) return;
    const spec = bldg.enterableSpec || { w: 5.0, h: 3.4, l: 6.6, wallThick: 0.32, floorY: 0.16 };
    const w = spec.w;
    const l = spec.l;
    const wt = spec.wallThick || 0.32;
    const floorY = spec.floorY !== undefined ? spec.floorY : 0.16;
    const innerW = w - wt * 2.2;
    const innerL = l - wt * 2.2;

    // Deterministic PRNG seeded by building world coordinates
    const rng = createChunkRNG(Math.round(bldg.x * 13), Math.round(bldg.z * 31), currentSeed + 701);
    const parts = [];
    const furnBoxes = [];
    const sc = bldg.scale || 1.0;

    const addFurnPart = (sx, sy, sz, px, py, pz, r, g, b, rotY = 0) => {
        const box = new THREE.BoxGeometry(sx, sy, sz);
        setGeometryUVBox(box, 0.52, 0.98, 0.02, 0.48);
        if (rotY !== 0) box.rotateY(rotY);
        box.translate(px, floorY + py, pz);
        tintBuildingPart(box, r, g, b, 2.5);
        parts.push(box);
    };

    // 1. Center Woven Rug / Carpet (elevated 3cm above floorSlab top at y = floorY so it never Z-fights)
    const rugPalette = (rng() < 0.5) ? [0.64, 0.24, 0.20] : [0.24, 0.42, 0.54];
    const rugBorder  = (rng() < 0.5) ? [0.82, 0.68, 0.42] : [0.76, 0.62, 0.38];
    const rugW = innerW * 0.52;
    const rugL = innerL * 0.46;
    addFurnPart(rugW + 0.14, 0.024, rugL + 0.14, 0, 0.022, -0.2, rugBorder[0], rugBorder[1], rugBorder[2]);
    addFurnPart(rugW, 0.026, rugL, 0, 0.036, -0.2, rugPalette[0], rugPalette[1], rugPalette[2]);

    // 2. Wooden Table & Chairs on one side of the room
    const tableSide = (rng() < 0.5) ? -1 : 1;
    const tableX = tableSide * (innerW * 0.5 - 0.85);
    const tableZ = -0.35 + (rng() - 0.5) * 0.5;
    const tableW = 1.15, tableL = 1.55, tableH = 0.78;
    addFurnPart(tableW, 0.08, tableL, tableX, tableH, tableZ, 0.52, 0.36, 0.22);
    [[-0.48, -0.65], [0.48, -0.65], [-0.48, 0.65], [0.48, 0.65]].forEach(([lx, lz]) => {
        addFurnPart(0.09, tableH, 0.09, tableX + lx, tableH * 0.5, tableZ + lz, 0.44, 0.30, 0.18);
    });
    // Tabletop lantern / ration crate prop
    addFurnPart(0.24, 0.28, 0.24, tableX + 0.1, tableH + 0.16, tableZ - 0.15, 0.72, 0.62, 0.32);
    // Chair next to table
    const chairX = tableX - tableSide * 0.68;
    addFurnPart(0.46, 0.06, 0.46, chairX, 0.46, tableZ, 0.48, 0.33, 0.20);
    addFurnPart(0.08, 0.46, 0.46, chairX - tableSide * 0.20, 0.70, tableZ, 0.48, 0.33, 0.20);
    furnBoxes.push({
        minX: (tableX - tableW * 0.55) * sc,
        maxX: (tableX + tableW * 0.55) * sc,
        minZ: (tableZ - tableL * 0.55) * sc,
        maxZ: (tableZ + tableL * 0.55) * sc
    });

    // 3. Bed / Cot in opposite back corner
    const bedSide = -tableSide;
    const bedW = 1.15, bedL = 1.95;
    const bedX = bedSide * (innerW * 0.5 - bedW * 0.5 - 0.12);
    const bedZ = -innerL * 0.5 + bedL * 0.5 + 0.18;
    // Bed frame
    addFurnPart(bedW, 0.32, bedL, bedX, 0.22, bedZ, 0.45, 0.30, 0.18);
    // Headboard
    addFurnPart(bedW, 0.85, 0.10, bedX, 0.46, bedZ - bedL * 0.5 + 0.06, 0.40, 0.26, 0.15);
    // Mattress & blanket
    addFurnPart(bedW - 0.08, 0.16, bedL - 0.14, bedX, 0.42, bedZ + 0.04, 0.84, 0.82, 0.76);
    addFurnPart(bedW - 0.06, 0.17, bedL * 0.55, bedX, 0.43, bedZ + bedL * 0.18, 0.34, 0.46, 0.32);
    // Pillow
    addFurnPart(bedW * 0.65, 0.12, 0.36, bedX, 0.54, bedZ - bedL * 0.32, 0.92, 0.90, 0.86);
    furnBoxes.push({
        minX: (bedX - bedW * 0.5) * sc,
        maxX: (bedX + bedW * 0.5) * sc,
        minZ: (bedZ - bedL * 0.5) * sc,
        maxZ: (bedZ + bedL * 0.5) * sc
    });

    // 4. Storage Cabinet / Bookshelf or Supply Crates against back wall
    const cabW = 1.25, cabD = 0.48, cabH = 1.75;
    const cabX = tableSide * (innerW * 0.5 - cabW * 0.5 - 0.15);
    const cabZ = -innerL * 0.5 + cabD * 0.5 + 0.12;
    addFurnPart(cabW, cabH, cabD, cabX, cabH * 0.5, cabZ, 0.42, 0.28, 0.17);
    furnBoxes.push({
        minX: (cabX - cabW * 0.5) * sc,
        maxX: (cabX + cabW * 0.5) * sc,
        minZ: (cabZ - cabD * 0.5) * sc,
        maxZ: (cabZ + cabD * 0.5) * sc
    });

    // 5. Wooden Supply Crate near front-side corner
    const crateS = 0.68;
    const crateX = bedSide * (innerW * 0.5 - crateS * 0.5 - 0.15);
    const crateZ = innerL * 0.5 - crateS * 0.5 - 0.35;
    addFurnPart(crateS, crateS, crateS, crateX, crateS * 0.5, crateZ, 0.58, 0.44, 0.26);
    furnBoxes.push({
        minX: (crateX - crateS * 0.5) * sc,
        maxX: (crateX + crateS * 0.5) * sc,
        minZ: (crateZ - crateS * 0.5) * sc,
        maxZ: (crateZ + crateS * 0.5) * sc
    });

    const interiorGeo = mergeBufferGeometries(parts);
    const interiorMesh = new THREE.Mesh(interiorGeo, getInteriorMaterial());
    interiorMesh.castShadow = true;
    interiorMesh.receiveShadow = true;
    interiorMesh.name = 'proceduralHouseInterior';
    bldg.mesh.add(interiorMesh);

    bldg.interiorMesh = interiorMesh;
    bldg.interiorBoxes = furnBoxes;
    bldg.interiorLoaded = true;
    return interiorMesh;
}

function unloadBuildingInterior(bldg) {
    if (!bldg || !bldg.interiorLoaded) return;
    if (bldg.interiorMesh) {
        if (bldg.mesh) bldg.mesh.remove(bldg.interiorMesh);
        if (bldg.interiorMesh.geometry) bldg.interiorMesh.geometry.dispose();
        bldg.interiorMesh = null;
    }
    bldg.interiorBoxes = [];
    bldg.interiorLoaded = false;
}

function updateBuildingInteriors(px, pz) {
    const loadSq = INTERIOR_LOAD_DIST * INTERIOR_LOAD_DIST;
    const unloadSq = INTERIOR_UNLOAD_DIST * INTERIOR_UNLOAD_DIST;
    for (let i = 0; i < worldBuildings.length; i++) {
        const bldg = worldBuildings[i];
        if (!bldg || !bldg.enterable) continue;
        const dx = bldg.x - px;
        const dz = bldg.z - pz;
        const dSq = dx * dx + dz * dz;
        if (!bldg.interiorLoaded && dSq <= loadSq) {
            loadBuildingInterior(bldg);
        } else if (bldg.interiorLoaded && dSq > unloadSq) {
            unloadBuildingInterior(bldg);
        }
    }
}

window.getGeometryFootprint = getGeometryFootprint;
window.attachObstacleBox = attachObstacleBox;
window.attachObstacleCircle = attachObstacleCircle;
window.obstacleLocalCoords = obstacleLocalCoords;
window.obstaclePushOut = obstaclePushOut;
window.obstacleSegmentEntry = obstacleSegmentEntry;
window.getBuildingFloorHeight = getBuildingFloorHeight;
window.loadBuildingInterior = loadBuildingInterior;
window.unloadBuildingInterior = unloadBuildingInterior;
window.updateBuildingInteriors = updateBuildingInteriors;
window.isPointInObstacleWindow = isPointInObstacleWindow;
window.INTERIOR_LOAD_DIST = INTERIOR_LOAD_DIST;
window.INTERIOR_UNLOAD_DIST = INTERIOR_UNLOAD_DIST;

// Third-person camera obstacle obstruction resolution: pushes camera closer to anchor
// when an obstacle (building, wall, rock, ruin, temple, monument, or tank wreck) blocks the line of sight
function resolveCameraObstacleCollision(anchor, camPos, options = {}) {
    if (!anchor || !camPos) return camPos;
    const pad = (typeof options.pad === 'number') ? options.pad : 0.22;
    const marginT = (typeof options.marginT === 'number') ? options.marginT : 0.08;
    const minSafeT = (typeof options.minSafeT === 'number') ? options.minSafeT : 0.20;
    const soldier = options.soldier || (typeof window !== 'undefined' && window.playerSoldier && window.playerMode === 'soldier' ? window.playerSoldier : null);
    const anchorYOffset = (typeof options.anchorYOffset === 'number') ? options.anchorYOffset : 0.15;

    const ax = anchor.x, ay = anchor.y, az = anchor.z;
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    const segDx = cx - ax;
    const segDy = cy - ay;
    const segDz = cz - az;
    const segLenSq = segDx * segDx + segDz * segDz;
    if (segLenSq < 0.001) return camPos;

    const camHorizDist = Math.sqrt(segLenSq);
    let minT = 1.0;
    let insideObs = null;

    // 1. Check worldObstacles (buildings, walls, rocks, ruins, temples, monuments, trees)
    const obstacles = (typeof window !== 'undefined' && Array.isArray(window.worldObstacles))
        ? window.worldObstacles
        : (typeof worldObstacles !== 'undefined' && Array.isArray(worldObstacles) ? worldObstacles : []);
    const segEntryFn = (typeof window !== 'undefined' && typeof window.obstacleSegmentEntry === 'function')
        ? window.obstacleSegmentEntry
        : (typeof obstacleSegmentEntry === 'function' ? obstacleSegmentEntry : null);

    if (typeof segEntryFn === 'function' && Array.isArray(obstacles)) {
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            if (!obs) continue;

            const ox = (typeof obs.x === 'number') ? obs.x : 0;
            const oz = (typeof obs.z === 'number') ? obs.z : 0;
            const r = (typeof obs.radius === 'number') ? obs.radius : 5.0;

            // Broadphase: circle test against segment from anchor to camPos
            const maxReach = camHorizDist + r + pad + 2.0;
            const dAnchorX = ax - ox;
            const dAnchorZ = az - oz;
            if (dAnchorX * dAnchorX + dAnchorZ * dAnchorZ > maxReach * maxReach) continue;

            // Check if player soldier is inside an enterable house
            const locFn = (typeof window !== 'undefined' && typeof window.obstacleLocalCoords === 'function')
                ? window.obstacleLocalCoords
                : (typeof obstacleLocalCoords === 'function' ? obstacleLocalCoords : null);
            if (soldier && obs.enterable && obs.enterableSpec && typeof locFn === 'function') {
                const loc = locFn(obs, soldier.x, soldier.z);
                const sc = obs.scale || 1.0;
                if (Math.abs(loc.x) < obs.enterableSpec.w * 0.5 * sc && Math.abs(loc.z) < obs.enterableSpec.l * 0.5 * sc) {
                    insideObs = obs;
                }
            }

            const t = segEntryFn(obs, ax, az, cx, cz, pad);
            if (t >= 0 && t < minT) {
                // Vertical clearance check: does the line segment at parameter t actually intersect the height of the obstacle?
                const hitY = ay + t * segDy;
                const obsBaseY = (typeof obs.y === 'number') ? obs.y : 0;
                const obsHeight = (typeof obs.height === 'number') ? obs.height : (r * 2.0);
                const obsTopY = obsBaseY + obsHeight;

                // If hitY is below the obstacle top and above its base (with small padding), it obstructs the view!
                if (hitY <= obsTopY + 0.15 && hitY >= obsBaseY - 1.0) {
                    minT = t;
                }
            }
        }
    }

    // 2. Check tank wrecks and knocked-out tanks
    const wrecks = [];
    if (typeof window !== 'undefined') {
        if (Array.isArray(window.activeEnemyTanks)) {
            for (let i = 0; i < window.activeEnemyTanks.length; i++) {
                const et = window.activeEnemyTanks[i];
                if (et && et.isDestroyed && typeof et.x === 'number') wrecks.push(et);
            }
        }
        if (window.tankState && window.tankState.isKnockedOut && window.playerMode === 'soldier') {
            wrecks.push(window.tankState);
        }
    }
    for (let i = 0; i < wrecks.length; i++) {
        const wreck = wrecks[i];
        const wx = wreck.x, wz = wreck.z;
        const wy = (typeof wreck.y === 'number') ? wreck.y : 0;
        const wRadius = 2.4 + pad;

        const fx = ax - wx, fz = az - wz;
        const c = fx * fx + fz * fz - wRadius * wRadius;
        if (c <= 0) {
            minT = Math.min(minT, minSafeT);
            continue;
        }
        const bq = 2 * (fx * segDx + fz * segDz);
        const a = segLenSq;
        const disc = bq * bq - 4 * a * c;
        if (disc >= 0) {
            const t = (-bq - Math.sqrt(disc)) / (2 * a);
            if (t >= 0 && t < minT) {
                const hitY = ay + t * segDy;
                if (hitY <= wy + 2.8 && hitY >= wy - 0.5) {
                    minT = t;
                }
            }
        }
    }

    // Apply camera push forward if obstructed
    if (minT < 1.0) {
        const safeT = Math.max(minSafeT, minT - marginT);
        const lerpFn = (typeof THREE !== 'undefined' && THREE.MathUtils && THREE.MathUtils.lerp)
            ? THREE.MathUtils.lerp
            : (v0, v1, val) => v0 + (v1 - v0) * val;
        camPos.x = lerpFn(ax, cx, safeT);
        camPos.z = lerpFn(az, cz, safeT);
        camPos.y = lerpFn(ay + anchorYOffset, cy, safeT);
    }

    // If inside an enterable house, keep camera below ceiling
    if (insideObs) {
        const maxCeilY = insideObs.y + (insideObs.floorHeight || 0.16) + (insideObs.ceilingHeight || 3.2) - 0.32;
        if (camPos.y > maxCeilY) camPos.y = maxCeilY;
    }

    return camPos;
}
window.resolveCameraObstacleCollision = resolveCameraObstacleCollision;


// Helper: World-scaled triplanar/box UV projection so stone blocks & sandstone strata tile crisply without stretching
function applyWorldBoxUVs(geo, scaleU = 0.22, scaleV = 0.26) {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const uvArr = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const nx = Math.abs(norm.getX(i)), ny = Math.abs(norm.getY(i)), nz = Math.abs(norm.getZ(i));
        let u, v;
        if (ny > 0.72 && ny >= nx && ny >= nz) {
            u = vx * scaleU;
            v = vz * scaleU;
        } else if (nx >= nz) {
            u = vz * scaleU;
            v = vy * scaleV;
        } else {
            u = vx * scaleU;
            v = vy * scaleV;
        }
        uvArr[i * 2] = u;
        uvArr[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    return geo;
}

// ============================================================================
// 5R. Egyptian Great Pyramid of Giza / Khafre
// (Unified 38-Course Stepped Nummulitic Limestone from Base to Apex
//  + Deep Sub-Terrain Foundation + Megalithic Chevron North Entrance & Pylon Forecourt)
// ============================================================================
// 5R. Egyptian Great Pyramid of Giza / Khafre
// (38-Course Stepped Nummulitic Limestone with Broken Summit, Weathered Courses,
//  Scattered Fallen Broken Megaliths & Megalithic Chevron North Entrance)
// ============================================================================
function createEgyptianGreatPyramidGeometry(baseW = 42.0, hTotal = 26.5, stepTiers = 38) {
    const parts = [];

    function colorLimestonePart(geo, baseR, baseG, baseB) {
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hFrac = Math.max(0.0, Math.min(1.0, Math.max(0.0, vy) / hTotal));
            const heightAO = 0.76 + 0.24 * Math.pow(hFrac, 0.7);
            const strataBand = Math.sin(vy * 3.2 + (vx + vz) * 0.15) * 0.055;
            const blockVar = (hash2D(Math.floor(vx * 0.8), Math.floor(vy * 1.4 + vz * 0.8)) - 0.5) * 0.095;
            const scratchShade = (hash2D(Math.floor((vx + vz) * 3.5), Math.floor(vy * 5.0)) > 0.85) ? -0.12 : 0.0;
            const shade = heightAO + strataBand + blockVar + scratchShade;
            col[i * 3 + 0] = Math.min(1.0, Math.max(0.28, baseR * shade));
            col[i * 3 + 1] = Math.min(1.0, Math.max(0.23, baseG * shade));
            col[i * 3 + 2] = Math.min(1.0, Math.max(0.18, baseB * shade));
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.24, 0.34);
        return geo;
    }

    // 0. Deep Sub-Terrain Limestone Foundation Skirt
    const foundH = 7.5;
    const foundation = new THREE.BoxGeometry(baseW + 3.4, foundH, baseW + 3.4);
    foundation.translate(0, -foundH * 0.5 + 0.04, 0);
    parts.push(colorLimestonePart(foundation, 0.82, 0.70, 0.48));

    // 1. Sacred Tura Limestone Foundation Pavement Court & Corner Socket Plinth
    const courtH = 0.55;
    const court = new THREE.BoxGeometry(baseW + 3.4, courtH, baseW + 3.4);
    court.translate(0, courtH * 0.5, 0);
    parts.push(colorLimestonePart(court, 0.88, 0.76, 0.54));

    const socleH = 0.65;
    const socle = new THREE.BoxGeometry(baseW + 1.2, socleH, baseW + 1.2);
    socle.translate(0, courtH + socleH * 0.5, 0);
    parts.push(colorLimestonePart(socle, 0.90, 0.79, 0.56));

    // 2. 38 Finely Graduated Stepped Giza Limestone Courses from Base to Summit
    // with broken, chipped, and collapsed block sections
    const stepStartY = courtH + socleH;
    const stepH = (hTotal - stepStartY) / stepTiers;
    for (let s = 0; s < stepTiers - 1; s++) { // Stop 1 tier before apex for historical broken summit
        const frac = s / stepTiers;
        const w = Math.max(1.55, baseW * (1.0 - frac * 0.945));
        const y = stepStartY + s * stepH + stepH * 0.5;
        const tier = new THREE.BoxGeometry(w, stepH + 0.08, w, 2, 1, 2);
        
        // Organic corner and edge weathering & chipped block fractures
        const tPos = tier.attributes.position;
        const isBrokenTier = (s === 6 || s === 13 || s === 20 || s === 27 || s === 32);
        const maxWear = isBrokenTier ? Math.min(0.55, w * 0.08) : Math.min(0.24, w * 0.04);
        for (let k = 0; k < tPos.count; k++) {
            const tx = tPos.getX(k), tz = tPos.getZ(k);
            if (Math.abs(tx) > w * 0.44 || Math.abs(tz) > w * 0.44) {
                const wear = (hash2D(s * 7.0 + tx * 2.0, s * 13.0 + tz * 2.0) - 0.5) * maxWear;
                tPos.setX(k, tx + wear);
                tPos.setZ(k, tz + wear);
            }
        }
        tier.computeVertexNormals();
        tier.translate(0, y, 0);
        const isCreamBand = (s % 5 === 0 || s % 7 === 0);
        parts.push(colorLimestonePart(
            tier,
            isCreamBand ? 0.95 : 0.91,
            isCreamBand ? 0.84 : 0.78,
            isCreamBand ? 0.61 : 0.54
        ));

        // On broken tiers, add jutting / displaced broken megaliths resting on the step
        if (isBrokenTier) {
            const side = (s % 4);
            const bx = (side === 0) ? (w * 0.42) : (side === 1) ? -(w * 0.42) : 0;
            const bz = (side === 2) ? (w * 0.42) : (side === 3) ? -(w * 0.42) : 0;
            const displacedBlk = new THREE.BoxGeometry(1.2, stepH * 0.9, 1.4);
            displacedBlk.rotateY((s * 1.7) % 1.2);
            displacedBlk.translate(bx, y + stepH * 0.35, bz);
            parts.push(colorLimestonePart(displacedBlk, 0.89, 0.77, 0.53));
        }
    }

    // 3. Truncated, Jagged Historical Broken Summit of the Great Pyramid (Missing Capstone)
    const apexPlatformH = stepH * 0.75;
    const apexPlatform = new THREE.BoxGeometry(2.6, apexPlatformH, 2.6);
    apexPlatform.translate(0, hTotal - apexPlatformH * 0.4, 0);
    parts.push(colorLimestonePart(apexPlatform, 0.92, 0.80, 0.56));

    // Broken, uneven capstone blocks scattered on summit terrace
    const summitBroken = [
        { x: -0.65, z: -0.55, w: 1.05, h: 0.65, d: 0.95, ry: 0.25 },
        { x:  0.55, z: -0.45, w: 0.90, h: 0.48, d: 1.00, ry: -0.22 },
        { x: -0.45, z:  0.60, w: 0.95, h: 0.72, d: 0.85, ry: 0.45 },
        { x:  0.58, z:  0.55, w: 0.80, h: 0.42, d: 0.75, ry: -0.38 }
    ];
    summitBroken.forEach(sb => {
        const blk = new THREE.BoxGeometry(sb.w, sb.h, sb.d);
        blk.rotateY(sb.ry);
        blk.translate(sb.x, hTotal + apexPlatformH * 0.25 + sb.h * 0.5, sb.z);
        parts.push(colorLimestonePart(blk, 0.90, 0.78, 0.54));
    });

    // 4. Iconic Giza North Face Megalithic Chevron Relieving Arch Entrance (+Z Face)
    const portalY = 2.6;
    const portalZ = baseW * 0.465;

    const bastion = new THREE.BoxGeometry(6.8, 4.6, 2.2);
    bastion.translate(0, portalY + 0.5, portalZ - 0.3);
    parts.push(colorLimestonePart(bastion, 0.90, 0.78, 0.55));

    [-1, 1].forEach(side => {
        const chevron1 = new THREE.BoxGeometry(2.8, 0.95, 1.6);
        chevron1.rotateZ(-side * 0.52);
        chevron1.translate(side * 1.15, portalY + 2.55, portalZ + 0.45);
        parts.push(colorLimestonePart(chevron1, 0.95, 0.84, 0.60));

        const chevron2 = new THREE.BoxGeometry(3.1, 0.85, 1.5);
        chevron2.rotateZ(-side * 0.52);
        chevron2.translate(side * 1.25, portalY + 3.35, portalZ + 0.30);
        parts.push(colorLimestonePart(chevron2, 0.92, 0.80, 0.57));
    });

    [-1.85, 1.85].forEach(px => {
        const jamb = new THREE.BoxGeometry(1.1, 3.2, 1.8);
        jamb.translate(px, portalY - 0.1, portalZ + 0.35);
        parts.push(colorLimestonePart(jamb, 0.88, 0.76, 0.52));
    });

    const corridor = new THREE.BoxGeometry(2.6, 2.6, 3.6);
    corridor.translate(0, portalY - 0.2, portalZ - 0.8);
    tintBuildingPart(corridor, 0.12, 0.09, 0.06, hTotal);
    applyWorldBoxUVs(corridor, 0.24, 0.24);
    parts.push(corridor);

    const ramp = new THREE.BoxGeometry(4.6, 1.35, 4.2);
    ramp.translate(0, 0.68, portalZ + 2.2);
    parts.push(colorLimestonePart(ramp, 0.90, 0.78, 0.55));

    const rampStep = new THREE.BoxGeometry(4.8, 0.65, 2.2);
    rampStep.translate(0, 0.325, portalZ + 4.8);
    parts.push(colorLimestonePart(rampStep, 0.88, 0.76, 0.54));

    [-3.4, 3.4].forEach(px => {
        const pylonPedestal = new THREE.BoxGeometry(1.6, 2.2, 2.8);
        pylonPedestal.translate(px, 1.1, portalZ + 2.4);
        parts.push(colorLimestonePart(pylonPedestal, 0.93, 0.81, 0.57));
    });

    // 5. Fallen Broken Megaliths & Tumbled Limestone Debris around Base & Corners
    const halfBase = baseW * 0.5;
    const fallenMegaliths = [
        { x: -halfBase * 0.82, z:  halfBase + 1.2, w: 2.6, h: 1.3, d: 1.8, rx: 0.14, rz: -0.24, ry: 0.45 },
        { x: -halfBase * 0.38, z:  halfBase + 1.6, w: 2.0, h: 0.95, d: 2.2, rx: -0.16, rz: 0.18, ry: 0.82 },
        { x:  halfBase * 0.42, z:  halfBase + 1.4, w: 2.7, h: 1.4, d: 1.7, rx: 0.09, rz: 0.26, ry: -0.35 },
        { x:  halfBase * 0.76, z:  halfBase + 0.9, w: 2.2, h: 1.1, d: 2.1, rx: -0.22, rz: -0.15, ry: 0.60 },
        { x:  halfBase + 1.3, z: -halfBase * 0.35, w: 2.5, h: 1.25, d: 1.9, rx: 0.19, rz: 0.25, ry: 0.16 },
        { x:  halfBase + 0.9, z:  halfBase * 0.48, w: 1.9, h: 1.5, d: 2.1, rx: -0.14, rz: -0.22, ry: -0.50 },
        { x: -(halfBase + 1.2), z: -halfBase * 0.28, w: 2.4, h: 1.1, d: 2.2, rx: 0.24, rz: -0.18, ry: 0.72 },
        { x: -(halfBase + 1.5), z:  halfBase * 0.38, w: 2.1, h: 1.35, d: 1.8, rx: -0.15, rz: 0.29, ry: -0.58 },
        { x: -halfBase * 0.55, z: -(halfBase + 1.3), w: 2.3, h: 1.4, d: 1.9, rx: 0.16, rz: 0.20, ry: 0.38 },
        { x:  halfBase * 0.25, z: -(halfBase + 1.6), w: 2.8, h: 1.15, d: 2.0, rx: -0.19, rz: -0.24, ry: -0.40 },
        { x:  halfBase * 0.68, z: -(halfBase + 1.1), w: 2.0, h: 1.25, d: 1.7, rx: 0.12, rz: 0.28, ry: 0.90 },
        { x:  halfBase * 0.94, z:  halfBase * 0.94, w: 2.9, h: 1.65, d: 2.3, rx: 0.26, rz: -0.32, ry: 0.52 },
        { x: -halfBase * 0.94, z: -halfBase * 0.94, w: 2.5, h: 1.35, d: 2.5, rx: -0.24, rz: 0.30, ry: -0.36 },
        { x: -halfBase * 0.92, z:  halfBase * 0.92, w: 2.4, h: 1.25, d: 2.2, rx: 0.22, rz: 0.24, ry: 0.78 }
    ];

    fallenMegaliths.forEach(fm => {
        const blk = new THREE.BoxGeometry(fm.w, fm.h, fm.d);
        blk.rotateX(fm.rx);
        blk.rotateZ(fm.rz);
        blk.rotateY(fm.ry);
        blk.translate(fm.x, courtH + fm.h * 0.42, fm.z);
        parts.push(colorLimestonePart(blk, 0.88, 0.76, 0.52));
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: [
            { minX: -halfBase, maxX: halfBase, minZ: -halfBase, maxZ: halfBase },
            { minX: -(halfBase + 0.6), maxX: halfBase + 0.6, minZ: -(halfBase + 0.6), maxZ: halfBase + 0.6, maxY: courtH + socleH },
            { minX: -4.25, maxX: -2.55, minZ: portalZ + 0.8, maxZ: portalZ + 3.85 },
            { minX:  2.55, maxX:  4.25, minZ: portalZ + 0.8, maxZ: portalZ + 3.85 },
            { minX: -3.45, maxX:  3.45, minZ: portalZ - 1.4, maxZ: portalZ + 1.25 },
            { minX: -2.35, maxX: 2.35, minZ: portalZ + 0.1, maxZ: portalZ + 4.3, maxY: 1.35 }
        ],
        walkablePlatforms: [
            { minX: -(halfBase + 1.7), maxX: halfBase + 1.7, minZ: -(halfBase + 1.7), maxZ: halfBase + 1.7, y: courtH },
            { minX: -(halfBase + 0.65), maxX: halfBase + 0.65, minZ: -(halfBase + 0.65), maxZ: halfBase + 0.65, y: courtH + socleH },
            { minX: -2.45, maxX: 2.45, minZ: portalZ + 3.7, maxZ: portalZ + 6.0, y: 0.65 },
            { minX: -2.35, maxX: 2.35, minZ: portalZ + 0.1, maxZ: portalZ + 4.3, y: 1.35 }
        ]
    };
    return merged;
}

// ============================================================================
function createEgyptianObeliskGeometry(baseW = 2.6, height = 17.5) {
    const parts = [];

    const addObeliskPart = (geo, r, g, b) => {
        tintBuildingPart(geo, r, g, b, height);
        applyWorldBoxUVs(geo, 0.28, 0.32);
        parts.push(geo);
    };

    const foundH = 4.2;
    const found = new THREE.BoxGeometry(baseW * 1.70, foundH, baseW * 1.70);
    found.translate(0, -foundH * 0.5 + 0.04, 0);
    addObeliskPart(found, 0.80, 0.68, 0.48);

    const plinth1 = new THREE.BoxGeometry(baseW * 1.65, 1.15, baseW * 1.65);
    plinth1.translate(0, 0.575, 0);
    addObeliskPart(plinth1, 0.88, 0.76, 0.54);

    // Egyptian cavetto cornice pedestal
    const plinth2 = new THREE.BoxGeometry(baseW * 1.30, 0.90, baseW * 1.30);
    plinth2.translate(0, 1.15 + 0.45, 0);
    addObeliskPart(plinth2, 0.92, 0.80, 0.58);

    const shaftH = height - 4.4;
    const shaft = new THREE.CylinderGeometry(baseW * 0.48, baseW * 0.78, shaftH, 4, 4);
    shaft.rotateY(Math.PI * 0.25);
    shaft.translate(0, 2.05 + shaftH * 0.5, 0);
    addObeliskPart(shaft, 0.94, 0.78, 0.56);

    const apexH = 2.35;
    const apex = new THREE.ConeGeometry(baseW * 0.48, apexH, 4);
    apex.rotateY(Math.PI * 0.25);
    apex.translate(0, 2.05 + shaftH + apexH * 0.5, 0);
    addObeliskPart(apex, 1.0, 0.86, 0.42);

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: [
            { minX: -baseW * 0.65, maxX: baseW * 0.65, minZ: -baseW * 0.65, maxZ: baseW * 0.65 },
            { minX: -baseW * 0.825, maxX: baseW * 0.825, minZ: -baseW * 0.825, maxZ: baseW * 0.825, maxY: 1.15 }
        ],
        walkablePlatforms: [
            { minX: -baseW * 0.825, maxX: baseW * 0.825, minZ: -baseW * 0.825, maxZ: baseW * 0.825, y: 1.15 }
        ]
    };
    return merged;
}

// ============================================================================
// 5T. Egyptian Sandstone Colonnade / Hypostyle Hall & Pylon Ruin
// ============================================================================
function createEgyptianColonnadeGeometry(w = 13.0, l = 17.0) {
    const parts = [];
    const addColPart = (geo, r, g, b) => {
        tintBuildingPart(geo, r, g, b, 9.0);
        applyWorldBoxUVs(geo, 0.26, 0.30);
        parts.push(geo);
    };

    // Sub-terrain sandstone foundation skirt (prevents floating on sloped desert dunes)
    const foundH = 5.0;
    const found = new THREE.BoxGeometry(w + 0.3, foundH, l + 0.3);
    found.translate(0, -foundH * 0.5 + 0.04, 0);
    addColPart(found, 0.80, 0.68, 0.48);

    const platH = 0.70;
    const plat = new THREE.BoxGeometry(w, platH, l);
    plat.translate(0, platH * 0.5, 0);
    addColPart(plat, 0.88, 0.76, 0.54);

    // Front (+Z) and Back (-Z) stepped sandstone entrance stairs leading onto the stylobate platform
    [-1, 1].forEach(zSide => {
        const stairStep = new THREE.BoxGeometry(w * 0.58, platH * 0.52, 1.35);
        stairStep.translate(0, platH * 0.26, zSide * (l * 0.5 + 0.55));
        addColPart(stairStep, 0.86, 0.74, 0.52);
    });

    const colPositions = [
        [-3.8, -5.6], [3.8, -5.6],
        [-3.8,  0.0], [3.8,  0.0],
        [-3.8,  5.6], [3.8,  5.6]
    ];
    colPositions.forEach(([cx, cz]) => {
        const colH = 6.0;
        // Papyrus-bundle column base disc
        const colBase = new THREE.CylinderGeometry(0.98, 1.08, 0.45, 12);
        colBase.translate(cx, platH + 0.225, cz);
        addColPart(colBase, 0.86, 0.74, 0.52);

        const colShaft = new THREE.CylinderGeometry(0.74, 0.88, colH, 12, 3);
        colShaft.translate(cx, platH + 0.45 + colH * 0.5, cz);
        addColPart(colShaft, 0.94, 0.82, 0.58);

        // Flared Egyptian Lotus/Papyrus Bell Capital + Abacus block
        const cap = new THREE.CylinderGeometry(1.32, 0.74, 1.05, 12);
        cap.translate(cx, platH + 0.45 + colH + 0.525, cz);
        addColPart(cap, 0.96, 0.85, 0.62);

        const abacus = new THREE.BoxGeometry(1.65, 0.38, 1.65);
        abacus.translate(cx, platH + 0.45 + colH + 1.05 + 0.19, cz);
        addColPart(abacus, 0.92, 0.80, 0.56);
    });

    // Stepped ruined sandstone blocks on the colonnade perimeter (climbable & standable ruin ledges!)
    const ruinBlock1 = new THREE.BoxGeometry(2.1, 0.68, 2.6);
    ruinBlock1.translate(w * 0.38, platH + 0.34, -2.6);
    addColPart(ruinBlock1, 0.90, 0.78, 0.55);

    const ruinBlock2 = new THREE.BoxGeometry(2.0, 1.15, 2.4);
    ruinBlock2.translate(-w * 0.38, platH + 0.575, 2.6);
    addColPart(ruinBlock2, 0.88, 0.76, 0.53);

    // Longitudinal & transverse stone architrave lintels
    const beamY = platH + 0.45 + 6.0 + 1.05 + 0.38 + 0.45;
    [-3.8, 3.8].forEach(cx => {
        const longBeam = new THREE.BoxGeometry(1.45, 0.90, l * 0.82);
        longBeam.translate(cx, beamY, 0);
        addColPart(longBeam, 0.92, 0.80, 0.56);
    });
    [-5.6, 0.0, 5.6].forEach(cz => {
        const crossBeam = new THREE.BoxGeometry(w * 0.78, 0.88, 1.45);
        crossBeam.translate(0, beamY, cz);
        addColPart(crossBeam, 0.94, 0.82, 0.58);
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionCircles: colPositions.map(([cx, cz]) => ({ x: cx, z: cz, r: 1.08 })),
        collisionBoxes: [
            // Climbable ruined sandstone blocks on the platform
            { minX: w * 0.38 - 1.05, maxX: w * 0.38 + 1.05, minZ: -3.9, maxZ: -1.3, maxY: platH + 0.68 },
            { minX: -w * 0.38 - 1.0, maxX: -w * 0.38 + 1.0, minZ: 1.4, maxZ: 3.8, maxY: platH + 1.15 }
        ],
        walkablePlatforms: [
            // Front & back entrance steps
            { minX: -w * 0.32, maxX: w * 0.32, minZ: -l * 0.5 - 1.25, maxZ: l * 0.5 + 1.25, y: platH * 0.52 },
            // Full sandstone stylobate platform floor
            { minX: -w * 0.5 - 0.15, maxX: w * 0.5 + 0.15, minZ: -l * 0.5 - 0.15, maxZ: l * 0.5 + 0.15, y: platH },
            // Stepped ruin blocks on the platform
            { minX: w * 0.38 - 1.05, maxX: w * 0.38 + 1.05, minZ: -3.9, maxZ: -1.3, y: platH + 0.68 },
            { minX: -w * 0.38 - 1.0, maxX: -w * 0.38 + 1.0, minZ: 1.4, maxZ: 3.8, y: platH + 1.15 }
        ]
    };
    return merged;
}

// ============================================================================
// 5U. Arizona Monument Valley Natural Red Sandstone Butte (West/East Mitten & Merrick Butte)
// Natural Eroded Geological Formation: Sweeping Conical Fluted Talus Apron
// + Stratified De Chelly Red Sandstone Cliff Massif + Iconic Detached "Mitten Thumb" Spire!
// ============================================================================
function createMonumentButteGeometry(baseW = 34.0, l = 36.0, h = 21.5) {
    const parts = [];

    function colorMonumentStrata(geo, maxH) {
        smoothDuplicateVertexNormals(geo);
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hFrac = Math.max(0.0, Math.min(1.0, vy / maxH));
            // Multi-layered Arizona Colorado Plateau geological strata (Organ Rock shale -> De Chelly sandstone -> Shinarump caprock)
            const s1 = Math.sin(vy * 1.85 + (vx + vz) * 0.06);
            const s2 = Math.cos(vy * 4.4 - vx * 0.10) * 0.5;
            const varnish = Math.sin(Math.atan2(vz, vx) * 9.0) * 0.06;
            const ao = 0.68 + 0.32 * Math.pow(hFrac, 0.65);

            let r, g, b;
            if (vy < 5.8) {
                // Organ Rock Member: rich deep rust-terracotta sloping talus scree
                r = 0.74 + s1 * 0.06;
                g = 0.27 + s1 * 0.04;
                b = 0.14 + s1 * 0.02;
            } else if (vy > maxH - 2.4) {
                // Shinarump Conglomerate Caprock: sun-bleached warm buff-ochre & orange rim
                r = 0.94 + s2 * 0.05;
                g = 0.54 + s2 * 0.05;
                b = 0.30 + s2 * 0.04;
            } else {
                // De Chelly Sandstone Cliff Face: glowing Arizona red-orange with pale cross-bedding bands
                const buffBand = Math.max(0.0, s1 + s2 * 0.6);
                r = 0.86 + buffBand * 0.12 + varnish;
                g = 0.33 + buffBand * 0.16 + varnish * 0.5;
                b = 0.16 + buffBand * 0.10;
            }
            col[i * 3 + 0] = Math.min(1.0, Math.max(0.2, r * ao));
            col[i * 3 + 1] = Math.min(1.0, Math.max(0.1, g * ao));
            col[i * 3 + 2] = Math.min(1.0, Math.max(0.06, b * ao));
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.16, 0.22);
        return geo;
    }

    // 1. Wide Conical Fluted Talus Apron Skirt (Natural ~36° scree slope, NOT a vertical box!)
    const talusH = 6.8;
    const talus = new THREE.CylinderGeometry(baseW * 0.30, baseW * 0.54, talusH, 20, 6);
    const tPos = talus.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const vx = tPos.getX(i), vy = tPos.getY(i), vz = tPos.getZ(i);
        const ny = (vy + talusH * 0.5) / talusH; // 0 at bottom, 1 at top
        const ang = Math.atan2(vz, vx);
        // Natural concave scree profile + radial erosion gullies/flutes
        const concave = 1.0 - Math.sin(ny * Math.PI) * 0.12;
        const flute = 1.0 + (Math.sin(ang * 5.0 + 0.4) * 0.11 + Math.cos(ang * 9.0) * 0.07) * (1.0 - ny * 0.35);
        const strataStep = Math.sin(ny * 12.0) * 0.22;
        tPos.setX(i, vx * concave * flute * 1.06 + Math.cos(ang) * strataStep);
        tPos.setZ(i, vz * concave * flute * (l / baseW) * 0.94 + Math.sin(ang) * strataStep);
    }
    talus.translate(0, talusH * 0.5, 0);
    parts.push(colorMonumentStrata(talus, h));

    // 2. Main Sculpted De Chelly Sandstone Butte Massif (Irregular eroded cliff face with horizontal strata ledges)
    const cliffH = h - talusH + 1.2;
    const cliff = new THREE.CylinderGeometry(baseW * 0.24, baseW * 0.29, cliffH, 18, 9);
    const cPos = cliff.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
        const vx = cPos.getX(i), vy = cPos.getY(i), vz = cPos.getZ(i);
        const ny = (vy + cliffH * 0.5) / cliffH;
        const ang = Math.atan2(vz, vx);
        // Sculpted vertical sandstone flutes, clefts, and horizontal sedimentary shelves
        const verticalFlutes = 1.0 + Math.sin(ang * 4.0 + 0.6) * 0.14 + Math.cos(ang * 7.0 - 0.5) * 0.09;
        const horizStrata = 1.0 + Math.sin(ny * Math.PI * 7.0) * 0.065 + (ny > 0.86 ? 0.06 : 0.0);
        // Flatten top plateau caprock slightly while keeping craggy rim undulations
        let yOut = vy;
        if (ny > 0.95) {
            yOut = cliffH * 0.47 + (hash2D(vx * 0.4, vz * 0.4) - 0.5) * 0.45;
        }
        cPos.setXYZ(
            i,
            vx * verticalFlutes * horizStrata * 0.92 - baseW * 0.05,
            yOut,
            vz * verticalFlutes * horizStrata * 0.76
        );
    }
    cliff.translate(0, talusH + cliffH * 0.5 - 0.8, 0);
    parts.push(colorMonumentStrata(cliff, h));

    // 3. Secondary Stepped Mesa Shoulder Buttress (gives natural asymmetric Colorado Plateau massif silhouette)
    const shoulderH = cliffH * 0.76;
    const shoulder = new THREE.CylinderGeometry(baseW * 0.15, baseW * 0.19, shoulderH, 14, 6);
    const sPos = shoulder.attributes.position;
    for (let i = 0; i < sPos.count; i++) {
        const vx = sPos.getX(i), vy = sPos.getY(i), vz = sPos.getZ(i);
        const ang = Math.atan2(vz, vx);
        const rug = 1.0 + Math.sin(ang * 5.0) * 0.12 + Math.sin(vy * 2.4) * 0.07;
        sPos.setXYZ(i, vx * rug * 0.95, vy, vz * rug * 0.85);
    }
    shoulder.translate(-baseW * 0.18, talusH + shoulderH * 0.5 - 0.9, -l * 0.08);
    parts.push(colorMonumentStrata(shoulder, h));

    // 4. Iconic Detached "Mitten Thumb" Spire rising beside the main Butte from the Talus Skirt!
    const thumbH = cliffH * 0.88;
    const thumb = new THREE.CylinderGeometry(baseW * 0.055, baseW * 0.105, thumbH, 12, 7);
    const thPos = thumb.attributes.position;
    for (let i = 0; i < thPos.count; i++) {
        const vx = thPos.getX(i), vy = thPos.getY(i), vz = thPos.getZ(i);
        const ny = (vy + thumbH * 0.5) / thumbH;
        const necking = 1.0 + Math.sin(ny * Math.PI * 5.0) * 0.12 - Math.sin(ny * Math.PI) * 0.08;
        thPos.setXYZ(i, vx * necking, vy, vz * necking);
    }
    thumb.translate(baseW * 0.25, talusH + thumbH * 0.5 - 1.1, l * 0.06);
    parts.push(colorMonumentStrata(thumb, h));

    // 5. Basal Eroded Sandstone Scree Boulders & Talus Spurs around the foot
    const basalBoulders = [
        { x:  baseW * 0.36, y: 1.6, z:  l * 0.18, sx: 3.8, sy: 2.2, sz: 3.2, rot: 0.4 },
        { x: -baseW * 0.35, y: 1.8, z: -l * 0.15, sx: 4.2, sy: 2.4, sz: 3.4, rot: 1.5 },
        { x:  baseW * 0.12, y: 1.5, z: -l * 0.36, sx: 3.6, sy: 2.0, sz: 3.0, rot: 2.2 },
        { x: -baseW * 0.16, y: 1.7, z:  l * 0.34, sx: 4.0, sy: 2.1, sz: 3.1, rot: 0.9 }
    ];
    basalBoulders.forEach(b => {
        const bGeo = new THREE.DodecahedronGeometry(1.0, 1);
        const bp = bGeo.attributes.position;
        for (let i = 0; i < bp.count; i++) {
            const vx = bp.getX(i), vy = bp.getY(i), vz = bp.getZ(i);
            const flat = vy > 0.5 ? 0.5 + (vy - 0.5) * 0.35 : vy;
            const st = 0.92 + Math.sin(vy * 6.0) * 0.12;
            bp.setXYZ(i, vx * st * b.sx, flat * b.sy, vz * st * b.sz);
        }
        bGeo.rotateY(b.rot);
        bGeo.translate(b.x, b.y, b.z);
        parts.push(colorMonumentStrata(bGeo, h));
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionBoxes: [
            // Solid mesa cliff core
            { minX: -baseW * 0.44, maxX: baseW * 0.44, minZ: -l * 0.44, maxZ: l * 0.44 }
        ],
        collisionCircles: [
            { x:  0.0,           z:  0.0,           r: baseW * 0.46 },
            { x: -baseW * 0.20,  z: -l * 0.20,      r: baseW * 0.28 },
            { x:  baseW * 0.20,  z:  l * 0.20,      r: baseW * 0.28 },
            { x: -baseW * 0.20,  z:  l * 0.20,      r: baseW * 0.28 },
            { x:  baseW * 0.20,  z: -l * 0.20,      r: baseW * 0.28 }
        ]
    };
    return merged;
}

// ============================================================================
// 5V. Arizona Monument Valley "Three Sisters / Totem Pole" Red Rock Hoodoo Spire Cluster
// ============================================================================
function createMonumentSpireGeometry(baseW = 8.4, h = 24.5) {
    const parts = [];

    function colorSpireStrata(geo) {
        smoothDuplicateVertexNormals(geo);
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hFrac = Math.max(0.0, Math.min(1.0, vy / h));
            const band = Math.sin(vy * 2.4 + (vx + vz) * 0.18);
            const ao = 0.68 + 0.32 * Math.pow(hFrac, 0.65);
            const r = (vy < 5.0 ? 0.74 : 0.88 + band * 0.10) * ao;
            const g = (vy < 5.0 ? 0.26 : 0.34 + band * 0.12) * ao;
            const b = (vy < 5.0 ? 0.13 : 0.17 + band * 0.08) * ao;
            col[i * 3 + 0] = Math.min(1.0, r);
            col[i * 3 + 1] = Math.min(1.0, g);
            col[i * 3 + 2] = Math.min(1.0, b);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.18, 0.24);
        return geo;
    }

    // 1. Wide Conical Fluted Talus Scree Pedestal (Natural sloping rock mound, NOT a box!)
    const baseH = 5.6;
    const baseCone = new THREE.CylinderGeometry(baseW * 0.42, baseW * 0.92, baseH, 16, 5);
    const bPos = baseCone.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
        const vx = bPos.getX(i), vy = bPos.getY(i), vz = bPos.getZ(i);
        const ny = (vy + baseH * 0.5) / baseH;
        const ang = Math.atan2(vz, vx);
        const gully = 1.0 + (Math.sin(ang * 5.0) * 0.14 + Math.cos(ang * 8.0) * 0.08) * (1.0 - ny * 0.3);
        bPos.setXYZ(i, vx * gully, vy, vz * gully);
    }
    baseCone.translate(0, baseH * 0.5, 0);
    parts.push(colorSpireStrata(baseCone));

    // 2. Trio of Wind-Eroded Red Sandstone Hoodoo Needles ("Three Sisters / Totem Pole")
    const spires = [
        { x:  0.0,           z:  0.0,           rTop: baseW * 0.14, rBot: baseW * 0.28, sh: h - 4.8 },
        { x:  baseW * 0.28,  z:  baseW * 0.08,  rTop: baseW * 0.11, rBot: baseW * 0.21, sh: (h - 4.8) * 0.74 },
        { x: -baseW * 0.26,  z: -baseW * 0.10,  rTop: baseW * 0.10, rBot: baseW * 0.19, sh: (h - 4.8) * 0.58 }
    ];
    spires.forEach((sp, idx) => {
        const colGeo = new THREE.CylinderGeometry(sp.rTop, sp.rBot, sp.sh, 12, 8);
        const cp = colGeo.attributes.position;
        for (let i = 0; i < cp.count; i++) {
            const vx = cp.getX(i), vy = cp.getY(i), vz = cp.getZ(i);
            const ny = (vy + sp.sh * 0.5) / sp.sh;
            const ang = Math.atan2(vz, vx);
            // Horizontal wind-scoured hoodoo necking rings + vertical rock ribs
            const hoodooRing = 1.0 + Math.sin(ny * Math.PI * 6.0 + idx) * 0.14 + Math.sin(ang * 4.0 + idx) * 0.10;
            cp.setXYZ(i, vx * hoodooRing, vy, vz * hoodooRing);
        }
        colGeo.translate(sp.x, baseH - 0.8 + sp.sh * 0.5, sp.z);
        parts.push(colorSpireStrata(colGeo));

        // Eroded flat-topped hoodoo caprock stone
        const capRock = new THREE.DodecahedronGeometry(sp.rTop * 1.28, 1);
        capRock.scale(1.0, 0.55, 0.92);
        capRock.translate(sp.x, baseH - 0.8 + sp.sh, sp.z);
        parts.push(colorSpireStrata(capRock));
    });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionCircles: [
            { x:  0.0,           z:  0.0,           r: baseW * 0.72 },
            { x:  baseW * 0.28,  z:  baseW * 0.08,  r: baseW * 0.28 },
            { x: -baseW * 0.26,  z: -baseW * 0.10,  r: baseW * 0.26 }
        ]
    };
    return merged;
}

// ============================================================================
// 5W. Grand Canyon Terraced Cliff Promontory & Temple Butte
// ============================================================================
function createCanyonCliffGeometry(w = 28.0, l = 32.0, h = 18.5) {
    const parts = [];
    const benches = 5;
    const bH = h / benches;
    for (let b = 0; b < benches; b++) {
        const frac = b / benches;
        const bw = w * (1.0 - frac * 0.44);
        const bl = l * (1.0 - frac * 0.44);
        const cyl = new THREE.CylinderGeometry(bw * 0.46, bw * 0.54, bH + 0.15, 16, 3);
        const p = cyl.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const ang = Math.atan2(vz, vx);
            const crag = 1.0 + Math.sin(ang * 5.0 + b) * 0.12 + Math.cos(ang * 9.0) * 0.07;
            p.setXYZ(i, vx * crag, vy, vz * crag * (bl / bw));
        }
        cyl.translate(0, b * bH + bH * 0.5, 0);
        smoothDuplicateVertexNormals(cyl);

        const strataTint = (b === 0) ? [0.52, 0.20, 0.11]
                         : (b === 1) ? [0.42, 0.15, 0.08]
                         : (b === 2) ? [0.58, 0.28, 0.15]
                         : (b === 3) ? [0.62, 0.42, 0.26]
                         : [0.66, 0.50, 0.34];
        tintBuildingPart(cyl, strataTint[0], strataTint[1], strataTint[2], h);
        applyWorldBoxUVs(cyl, 0.18, 0.24);
        parts.push(cyl);
    }
    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionCircles: [
            { x: 0, z:  0.0,       r: w * 0.48 },
            { x: 0, z:  l * 0.20,  r: w * 0.45 },
            { x: 0, z: -l * 0.20,  r: w * 0.45 },
            { x: 0, z:  l * 0.36,  r: w * 0.42 },
            { x: 0, z: -l * 0.36,  r: w * 0.42 }
        ]
    };
    return merged;
}

function createCanyonTowerGeometry(baseW = 9.2, h = 17.0) {
    const parts = [];
    const bH = h / 4;
    for (let b = 0; b < 4; b++) {
        const bw = baseW * (1.0 - b * 0.18);
        const cyl = new THREE.CylinderGeometry(bw * 0.44, bw * 0.54, bH + 0.12, 14, 3);
        const p = cyl.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const ang = Math.atan2(vz, vx);
            const crag = 1.0 + Math.sin(ang * 4.0 + b) * 0.13;
            p.setXYZ(i, vx * crag, vy, vz * crag);
        }
        cyl.translate(0, b * bH + bH * 0.5, 0);
        smoothDuplicateVertexNormals(cyl);
        const strata = (b === 0) ? [0.50, 0.18, 0.10] : (b === 1) ? [0.40, 0.14, 0.08] : (b === 2) ? [0.58, 0.34, 0.20] : [0.64, 0.48, 0.32];
        tintBuildingPart(cyl, strata[0], strata[1], strata[2], h);
        applyWorldBoxUVs(cyl, 0.18, 0.24);
        parts.push(cyl);
    }
    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        isRock: true,
        useMeshRaycastOnly: true,
        collisionCircles: [
            { x: 0, z: 0, r: baseW * 0.48 }
        ]
    };
    return merged;
}

// ============================================================================
// 5X. Tropical Jungle Giant Emergent Rainforest Canopy Tree (Kapok / Strangler Banyan)
// Features: Organic Flaring Buttress Root Fins, Gnarled Mossy Trunk, 8 Spreading Primary
// Boughs, 22 Multi-Tiered 3D Volumetric Broadleaf Canopy Domes (Mid-Story + Emergent Crown),
// Epiphyte Fern Rosettes, and Foliated Hanging Liana Curtains!
// ============================================================================
function createJungleCanopyTreeGeometry(variant = 0) {
    const parts = [];
    const trunkH = 13.5;
    // Per-variant foliage palettes [tint0, tint1] (olive / dry-yellow + flame-tree blooms / dusky blue-green)
    const PAL = [
        { a: [0.50, 0.64, 0.24], b: [0.64, 0.70, 0.28], bloom: null },
        { a: [0.66, 0.62, 0.26], b: [0.52, 0.54, 0.22], bloom: [0.92, 0.38, 0.18] },
        { a: [0.26, 0.44, 0.28], b: [0.38, 0.54, 0.30], bloom: null }
    ][variant % 3];

    function colorJungleBark(geo, maxY = 14.0) {
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vy = pos.getY(i);
            const ny = Math.max(0.0, Math.min(1.0, vy / maxY));
            const ao = 0.52 + 0.48 * Math.min(1.0, vy / 3.5);
            // Warm pale-grey/tan Kapok bark with lush emerald moss at base and bough forks
            const moss = Math.max(0.0, 1.0 - vy / 3.2) * 0.55;
            const r = (0.54 * (1.0 - moss) + 0.24 * moss) * ao;
            const g = (0.46 * (1.0 - moss) + 0.48 * moss) * ao;
            const b = (0.36 * (1.0 - moss) + 0.20 * moss) * ao;
            col[i * 3 + 0] = r;
            col[i * 3 + 1] = g;
            col[i * 3 + 2] = b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return geo;
    }

    // 1. Sinuous Mossy Emergent Trunk (Q3 Bark UVs)
    const trunk = new THREE.CylinderGeometry(0.55, 1.18, trunkH, 10, 6);
    setGeometryUVBox(trunk, 0.52, 0.98, 0.02, 0.48);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const vy = tPos.getY(i);
        const ny = (vy + trunkH * 0.5) / trunkH;
        const flare = ny < 0.28 ? 1.0 + Math.pow(1.0 - ny / 0.28, 2.0) * 0.55 : 1.0;
        tPos.setX(i, tPos.getX(i) * flare + Math.sin(ny * 2.8) * 0.28);
        tPos.setZ(i, tPos.getZ(i) * flare + Math.cos(ny * 2.2) * 0.22 - 0.22);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkH * 0.5, 0);
    parts.push(colorJungleBark(trunk, trunkH));

    // 2. 6 Organic Flaring Buttress Root Fins (Tapered angled root ridges, NEVER black boxes!)
    for (let r = 0; r < 6; r++) {
        const ang = (r / 6) * Math.PI * 2.0 + 0.25;
        const p1 = new THREE.Vector3(Math.cos(ang) * 0.55, 3.8, Math.sin(ang) * 0.55);
        const p2 = new THREE.Vector3(Math.cos(ang) * 2.35, 0.0, Math.sin(ang) * 2.35);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const rootFin = new THREE.CylinderGeometry(0.42, 0.16, len, 6, 2);
        rootFin.scale(0.45, 1.0, 1.35);
        setGeometryUVBox(rootFin, 0.52, 0.98, 0.02, 0.48);
        rootFin.translate(0, len * 0.5, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        rootFin.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        rootFin.translate(p1.x, p1.y, p1.z);
        parts.push(colorJungleBark(rootFin, 5.0));
    }

    // 3. 8 Spreading Primary & Sub-Canopy Boughs
    const boughs = [
        { from: [0, 11.2, 0], to: [ 4.2, 14.5,  1.2], r1: 0.42, r2: 0.18 },
        { from: [0, 11.5, 0], to: [-4.0, 14.2,  1.4], r1: 0.40, r2: 0.18 },
        { from: [0, 11.0, 0], to: [ 1.3, 14.0,  4.1], r1: 0.38, r2: 0.17 },
        { from: [0, 11.4, 0], to: [-1.2, 14.4, -4.0], r1: 0.38, r2: 0.17 },
        { from: [0, 11.8, 0], to: [ 3.2, 15.2, -3.0], r1: 0.34, r2: 0.15 },
        { from: [0, 11.6, 0], to: [-3.1, 15.0, -2.9], r1: 0.34, r2: 0.15 },
        // Lower mid-story branches so trunk isn't bare
        { from: [0,  7.4, 0], to: [ 2.8,  9.2, -1.2], r1: 0.28, r2: 0.12 },
        { from: [0,  8.0, 0], to: [-2.6,  9.6,  1.5], r1: 0.26, r2: 0.12 }
    ];
    boughs.forEach(b => {
        const p1 = new THREE.Vector3(...b.from);
        const p2 = new THREE.Vector3(...b.to);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const cyl = new THREE.CylinderGeometry(b.r2, b.r1, len, 6, 2);
        setGeometryUVBox(cyl, 0.52, 0.98, 0.02, 0.48);
        cyl.translate(0, len * 0.5, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        cyl.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        cyl.translate(p1.x, p1.y, p1.z);
        parts.push(colorJungleBark(cyl, 15.0));
    });

    // 4. 20 Volumetric 3D Broadleaf Canopy Domes (Mid-story understory + Wide Main Crown + Sunlit Apex)
    const crownCenter = new THREE.Vector3(0, 12.8, 0);
    const canopyClusters = [
        // Lower/mid-story sub-canopy foliage clouds (y = 8.2m..10.5m)
        [ 2.6,  8.8, -1.1, 2.4, 0.72, 0],
        [-2.5,  9.2,  1.4, 2.4, 0.74, 1],
        [ 0.8,  9.6,  2.2, 2.3, 0.75, 0],
        [-0.9,  9.0, -2.1, 2.3, 0.72, 1],
        // Core shadow volume domes
        [ 0.0, 12.6,  0.0, 3.2, 0.65, 0],
        [ 0.0, 14.4,  0.0, 3.4, 0.78, 1],
        // Wide spreading main rainforest canopy (radius ~6m, diameter ~13m)
        [ 4.2, 14.2,  1.2, 3.0, 0.86, 0],
        [-4.0, 14.0,  1.4, 3.0, 0.85, 1],
        [ 1.3, 13.8,  4.1, 2.9, 0.86, 0],
        [-1.2, 14.1, -4.0, 2.9, 0.84, 1],
        [ 3.2, 14.8, -3.0, 2.8, 0.90, 0],
        [-3.1, 14.6, -2.9, 2.8, 0.88, 1],
        [ 3.0, 14.5,  3.1, 2.8, 0.88, 1],
        [-3.0, 14.3,  3.0, 2.8, 0.86, 0],
        // Upper-mid fullness domes
        [ 2.1, 15.8,  1.6, 2.9, 0.94, 0],
        [-2.1, 15.6, -1.5, 2.9, 0.92, 1],
        [-1.8, 15.9,  1.9, 2.8, 0.94, 0],
        [ 1.9, 15.7, -1.8, 2.8, 0.92, 1],
        // Sunlit emergent upper crown domes
        [ 0.5, 17.0,  0.4, 3.0, 1.02, 0],
        [-0.6, 16.8, -0.5, 2.8, 0.98, 1]
    ];

    const cardOrientations = [
        { rx:  0.22, ry: 0.00, rz:  0.14 },
        { rx: -0.25, ry: 1.05, rz: -0.16 },
        { rx:  0.28, ry: 2.10, rz:  0.18 },
        { rx:  0.92, ry: 0.52, rz:  0.00 },
        { rx:  0.86, ry: 2.09, rz:  0.20 }
    ];

    canopyClusters.forEach(([cx, cy, cz, rad, brightness, tintType], cIdx) => {
        cardOrientations.forEach((ori) => {
            const w = rad * 1.48;
            const h = rad * 1.38;
            const card = createCurvedFoliageCard(w, h, 0.30, 0.52, 0.98, 0.52, 0.98);
            card.translate(0, -h * 0.48, 0);
            card.rotateZ(ori.rz);
            card.rotateX(ori.rx);
            card.rotateY(ori.ry + cIdx * 0.48);
            card.translate(cx, cy, cz);

            // Varied rainforest foliage: olive / dry yellow-green / dusky blue-green, with occasional flowering crowns
            const pc = (tintType === 0) ? PAL.a : PAL.b;
            let tr = pc[0] * brightness, tg = pc[1] * brightness, tb = pc[2] * brightness;
            if (PAL.bloom && cIdx >= 14 && cIdx % 2 === 0) {
                tr = PAL.bloom[0] * brightness; tg = PAL.bloom[1] * brightness; tb = PAL.bloom[2] * brightness;
            }
            // subtle per-cluster hue jitter
            const jit = 0.90 + hash2D(cIdx * 7.3, variant * 3.1) * 0.20;
            tr *= jit; tb *= (2.0 - jit);
            applyCanopyVolumeShading(card, crownCenter, tr, tg, tb, 0.38 * brightness);
            parts.push(card);
        });
    });

    // 5. Epiphyte Tropical Fern Rosette perched on lower trunk fork + Foliated Hanging Liana Curtains
    for (let f = 0; f < 6; f++) {
        const fAng = (f / 6) * Math.PI * 2.0 + 0.3;
        const epiphyte = createCurvedFoliageCard(1.35, 2.1, 0.48, 0.52, 0.98, 0.52, 0.98);
        epiphyte.rotateX(Math.PI * 0.36);
        epiphyte.rotateY(fAng);
        epiphyte.translate(0, 7.6, 0);
        applyCanopyVolumeShading(epiphyte, new THREE.Vector3(0, 7.8, 0), 0.40, 0.58, 0.24, 0.45);
        parts.push(epiphyte);
    }

    // Hanging foliated liana curtains (alpha-cutout leaf drapes, NOT rigid solid sticks)
    for (let v = 0; v < 10; v++) {
        const vAng = (v / 10) * Math.PI * 2.0 + 0.38;
        const vRad = 2.6 + (v % 3) * 1.15;
        const drapeH = 4.2 + (v % 2) * 1.4;
        const topY = 13.8 + (v % 2) * 0.6;
        const vineCard = createCurvedFoliageCard(1.35, drapeH, 0.28, 0.52, 0.98, 0.52, 0.98);
        vineCard.translate(0, -drapeH * 0.75, 0);
        vineCard.rotateX(0.10);
        vineCard.rotateY(vAng + 0.4);
        vineCard.translate(Math.cos(vAng) * vRad, topY, Math.sin(vAng) * vRad);
        applyCanopyVolumeShading(vineCard, crownCenter, 0.40, 0.52, 0.24, 0.42);
        parts.push(vineCard);
    }

    return mergeBufferGeometries(parts);
}

// ============================================================================
// 5Y. Tropical Jungle Ancient Stepped Pyramid Temple (Chichen Itza / Tikal / Angkor Style)
// Features: 8 Talud-Tablero Stepped Terraces with Overhanging Cornices, 4-Sided Balustraded
// Ceremonial Stairways with Serpent-Head Base Blocks, Carved Upper Sanctuary, Perforated
// Maya Roof Comb (Crestería), and Overgrown Rainforest Vines & Moss!
// ============================================================================
function createJungleTempleGeometry() {
    const parts = [];
    const maxTempleH = 14.5;

    function addTempleStonePart(geo, baseR = 0.80, baseG = 0.78, baseB = 0.70, mossBoost = 0.0) {
        const pos = geo.attributes.position;
        const norm = geo.attributes.normal;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const ny = norm ? norm.getY(i) : 0.0;
            const hFrac = Math.max(0.0, Math.min(1.0, vy / maxTempleH));
            const heightAO = 0.72 + 0.28 * Math.pow(hFrac, 0.65);
            const blockVar = (hash2D(Math.floor(vx * 0.9), Math.floor(vy * 1.5 + vz * 0.9)) - 0.5) * 0.12;
            // Upward-facing terrace ledges & lower steps accumulate lush tropical jade moss
            const ledgeMoss = Math.min(0.42, Math.max(0.0, (ny > 0.5 ? 0.20 : 0.0) + (1.0 - hFrac) * 0.12 + mossBoost * 0.6));
            const r = (baseR * (1.0 - ledgeMoss) + 0.40 * ledgeMoss) * (heightAO + blockVar);
            const g = (baseG * (1.0 - ledgeMoss) + 0.42 * ledgeMoss) * (heightAO + blockVar);
            const b = (baseB * (1.0 - ledgeMoss) + 0.22 * ledgeMoss) * (heightAO + blockVar);
            col[i * 3 + 0] = Math.min(1.0, Math.max(0.25, r));
            col[i * 3 + 1] = Math.min(1.0, Math.max(0.28, g));
            col[i * 3 + 2] = Math.min(1.0, Math.max(0.22, b));
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.26, 0.32);
        parts.push(geo);
    }

    // 0. Deep Sub-Terrain Stone Foundation Skirt (prevents floating on sloped jungle hillsides)
    const numTiers = 7;
    const baseW = 20.5;
    const tierH = 1.18;
    const foundH = 5.5;
    const foundation = new THREE.BoxGeometry(baseW + 0.6, foundH, baseW + 0.6);
    foundation.translate(0, -foundH * 0.5, 0);
    addTempleStonePart(foundation, 0.72, 0.70, 0.62, 0.18);

    // 1. 7 Stepped Talud-Tablero Pyramid Terraces (Sloped base + Projecting Framed Cornice Panel)
    let curY = 0.0;
    const collisionBoxes = [];
    const walkablePlatforms = [];
    const stairW = 3.8;
    const stairHalf = stairW * 0.5;

    for (let t = 0; t < numTiers; t++) {
        const frac = t / numTiers;
        const w = baseW * (1.0 - frac * 0.58);
        const halfW = (w + 0.18) * 0.5;
        const tierTopY = (t + 1) * tierH;

        // Lower sloped Talud core
        const taludH = tierH * 0.48;
        const talud = new THREE.BoxGeometry(w - 0.25, taludH + 0.04, w - 0.25);
        talud.translate(0, curY + taludH * 0.5, 0);
        addTempleStonePart(talud, 0.78, 0.76, 0.68, 0.08);

        // Upper projecting Tablero cornice frame with recessed panel
        const tabH = tierH * 0.52;
        const tablero = new THREE.BoxGeometry(w + 0.18, tabH + 0.02, w + 0.18);
        tablero.translate(0, curY + taludH + tabH * 0.5, 0);
        addTempleStonePart(tablero, 0.86, 0.83, 0.74, (t % 2 === 0 ? 0.05 : 0.14));

        // 4 quadrant collision boxes per tier (leaves the 4 axial stair channels open for climbing!)
        [-1, 1].forEach(sx => {
            [-1, 1].forEach(sz => {
                collisionBoxes.push({
                    minX: sx < 0 ? -halfW : stairHalf,
                    maxX: sx < 0 ? -stairHalf : halfW,
                    minZ: sz < 0 ? -halfW : stairHalf,
                    maxZ: sz < 0 ? -stairHalf : halfW,
                    maxY: tierTopY
                });
            });
        });

        // Walkable terrace deck for this tier
        walkablePlatforms.push({
            minX: -halfW, maxX: halfW,
            minZ: -halfW, maxZ: halfW,
            y: tierTopY
        });

        curY += tierH;
    }

    // 2. 4-Sided Monumental Balustraded Ceremonial Stairways (+Z, -Z, +X, -X)
    const stairSteps = 18;
    const stairTopR = (baseW * (1.0 - ((numTiers - 1) / numTiers) * 0.58)) * 0.5;
    const stairBotR = baseW * 0.5 + 1.85;

    for (let side = 0; side < 4; side++) {
        const rotY = side * Math.PI * 0.5;

        // Individual carved stone steps rising up the pyramid face
        for (let s = 0; s < stairSteps; s++) {
            const sFrac = s / stairSteps;
            const sh = curY / stairSteps;
            const sy = s * sh + sh * 0.5;
            const sz = stairBotR - sFrac * (stairBotR - stairTopR);
            const stepDepth = ((stairBotR - stairTopR) / stairSteps) + 0.35;
            const step = new THREE.BoxGeometry(stairW, sh + 0.04, stepDepth);
            step.translate(0, sy, sz);
            step.rotateY(rotY);
            addTempleStonePart(step, 0.82, 0.80, 0.72, 0.06);
        }

        // Flanking Sloped Stone Balustrades (Alfardas) & Carved Serpent-Head Base Blocks
        const dZ = stairBotR - stairTopR;
        const dY = curY;
        const balLen = Math.hypot(dZ, dY);
        const balAngle = Math.atan2(dZ, dY);

        [-1, 1].forEach(bSide => {
            const bx = bSide * (stairW * 0.5 + 0.38);
            const balustrade = new THREE.BoxGeometry(0.68, balLen, 0.92);
            balustrade.rotateX(-balAngle);
            balustrade.translate(bx, dY * 0.5, (stairBotR + stairTopR) * 0.5 + 0.15);
            balustrade.rotateY(rotY);
            addTempleStonePart(balustrade, 0.88, 0.85, 0.76, 0.04);

            // Carved Serpent-Head / Jaguar Altar Block at the foot of each balustrade
            const serpentBlock = new THREE.BoxGeometry(0.95, 1.15, 1.45);
            serpentBlock.translate(bx, 0.575, stairBotR + 0.65);
            serpentBlock.rotateY(rotY);
            addTempleStonePart(serpentBlock, 0.90, 0.86, 0.76, 0.12);
        });
    }

    // 3. Upper Temple Sanctuary with Carved Pillars & Corbeled Entablature Frieze
    const shrineW = 7.4, shrineH = 3.2, shrineL = 7.4;
    const shrineCore = new THREE.BoxGeometry(shrineW, shrineH, shrineL);
    shrineCore.translate(0, curY + shrineH * 0.5, 0);
    addTempleStonePart(shrineCore, 0.84, 0.81, 0.73, 0.08);

    // Overhanging 2-tier corbeled Maya frieze cornice above the sanctuary
    const frieze1 = new THREE.BoxGeometry(shrineW + 0.65, 0.55, shrineL + 0.65);
    frieze1.translate(0, curY + shrineH + 0.275, 0);
    addTempleStonePart(frieze1, 0.90, 0.87, 0.78, 0.05);

    const frieze2 = new THREE.BoxGeometry(shrineW + 0.95, 0.48, shrineL + 0.95);
    frieze2.translate(0, curY + shrineH + 0.55 + 0.24, 0);
    addTempleStonePart(frieze2, 0.88, 0.85, 0.76, 0.18);

    // Recessed sanctuary portals & carved stone doorway columns on all 4 faces
    for (let side = 0; side < 4; side++) {
        const rotY = side * Math.PI * 0.5;
        const doorRecess = new THREE.BoxGeometry(2.4, 2.35, 0.65);
        doorRecess.translate(0, curY + 1.18, shrineL * 0.5 - 0.15);
        doorRecess.rotateY(rotY);
        tintBuildingPart(doorRecess, 0.14, 0.15, 0.12, maxTempleH);
        applyWorldBoxUVs(doorRecess, 0.26, 0.26);
        parts.push(doorRecess);

        [-0.85, 0.85].forEach(px => {
            const col = new THREE.BoxGeometry(0.42, 2.35, 0.55);
            col.translate(px, curY + 1.18, shrineL * 0.5 + 0.08);
            col.rotateY(rotY);
            addTempleStonePart(col, 0.90, 0.86, 0.76, 0.05);
        });
    }

    // 4. Towering Perforated Maya Roof Comb (Crestería) at the Temple Summit
    const combBaseY = curY + shrineH + 1.03;
    const comb1 = new THREE.BoxGeometry(5.6, 1.35, 1.35);
    comb1.translate(0, combBaseY + 0.675, 0);
    addTempleStonePart(comb1, 0.88, 0.85, 0.76, 0.15);

    for (let p = -2; p <= 2; p++) {
        const pillar = new THREE.BoxGeometry(0.68, 1.45, 1.10);
        pillar.translate(p * 1.10, combBaseY + 1.35 + 0.725, 0);
        addTempleStonePart(pillar, 0.90, 0.87, 0.78, 0.12);
    }

    const combCap = new THREE.BoxGeometry(4.8, 0.65, 1.25);
    combCap.translate(0, combBaseY + 2.80 + 0.325, 0);
    addTempleStonePart(combCap, 0.92, 0.88, 0.78, 0.22);

    // Balustrade & Serpent-Head Altar Block collisions on all 4 ceremonial stairways
    const balMinR = stairTopR;
    const balMaxR = stairBotR + 1.40;
    const balInner = stairW * 0.5;
    const balOuter = stairW * 0.5 + 0.85;
    [-1, 1].forEach(bSide => {
        const minC = bSide < 0 ? -balOuter : balInner;
        const maxC = bSide < 0 ? -balInner : balOuter;
        // +Z and -Z stair balustrades
        collisionBoxes.push({ minX: minC, maxX: maxC, minZ: balMinR, maxZ: balMaxR, maxY: curY + 0.8 });
        collisionBoxes.push({ minX: minC, maxX: maxC, minZ: -balMaxR, maxZ: -balMinR, maxY: curY + 0.8 });
        // +X and -X stair balustrades
        collisionBoxes.push({ minX: balMinR, maxX: balMaxR, minZ: minC, maxZ: maxC, maxY: curY + 0.8 });
        collisionBoxes.push({ minX: -balMaxR, maxX: -balMinR, minZ: minC, maxZ: maxC, maxY: curY + 0.8 });
    });

    // Upper sanctuary 4 corner wall piers (leaves 2.4m portals open on all 4 faces!)
    const shHalf = shrineW * 0.5;
    const doorHalf = 1.15;
    [-1, 1].forEach(sx => {
        [-1, 1].forEach(sz => {
            collisionBoxes.push({
                minX: sx < 0 ? -shHalf : doorHalf,
                maxX: sx < 0 ? -doorHalf : shHalf,
                minZ: sz < 0 ? -shHalf : doorHalf,
                maxZ: sz < 0 ? -doorHalf : shHalf
            });
        });
    });

    // 4 Sloped Ceremonial Stairway Ramps so soldiers & players can climb from ground (y=0) to top terrace (y=curY)
    walkablePlatforms.push(
        { minX: -stairHalf, maxX: stairHalf, minZ: stairTopR, maxZ: stairBotR + 0.65, rampAxis: 'z', y0: curY, y1: 0.0 },
        { minX: -stairHalf, maxX: stairHalf, minZ: -(stairBotR + 0.65), maxZ: -stairTopR, rampAxis: 'z', y0: 0.0, y1: curY },
        { minX: stairTopR, maxX: stairBotR + 0.65, minZ: -stairHalf, maxZ: stairHalf, rampAxis: 'x', y0: curY, y1: 0.0 },
        { minX: -(stairBotR + 0.65), maxX: -stairTopR, minZ: -stairHalf, maxZ: stairHalf, rampAxis: 'x', y0: 0.0, y1: curY }
    );

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: collisionBoxes,
        walkablePlatforms: walkablePlatforms
    };
    return merged;
}

// ============================================================================
// 5Z-1. Ancient Greece Parthenon / Acropolis Doric Peripteral Temple
// Features: 3-Step Pentelic Marble Crepidoma & Stylobate, 6x8 Fluted Doric Peristyle
// Columns with Echinus & Abacus Capitals, Architrave + Triglyph/Metope Frieze + Geison
// Cornice, Triangular Pediments with Sculpted Relief Figures & Golden Akroteria,
// Pitched Marble Roof, Walk-In Cella Sanctuary & Athena Statue Pedestal!
// ============================================================================
// 5Z-1. Ancient Greece Parthenon / Acropolis Doric Peripteral Temple
// (Ruined Classical Sanctuary: Broken Columns, Collapsed Flank Architrave,
//  Fallen Fluted Marble Drums, Collapsed Roof Breach, Scratches & Cella Ruins)
// ============================================================================
// ============================================================================
// Jungle ancient-site variety: ruined pyramid, round temple, ball court, Puuc palace,
// stelae plaza & colossal basalt head (all share jungleTempleMat; weathered limestone palette)
// ============================================================================
const JUNGLE_STRUCT_H = {
    jungleTemple: 14.5, jungleRuinPyramid: 10.0, jungleRoundTemple: 11.5,
    jungleBallCourt: 5.4, junglePalace: 7.0, jungleStelae: 7.0, jungleHead: 4.4
};
let sharedJungleStructGeos = null;

// Weighted pick: returns a jungle structure descriptor. pool: array of [key, weight]
function pickJungleStruct(sel, pool) {
    let total = 0;
    pool.forEach(p => { total += p[1]; });
    let acc = 0;
    const t = sel * total;
    for (let i = 0; i < pool.length; i++) {
        acc += pool[i][1];
        if (t < acc) return pool[i][0];
    }
    return pool[pool.length - 1][0];
}
function getJungleStructGeo(key) {
    if (key === 'jungleTemple') return sharedJungleTempleGeo;
    return (sharedJungleStructGeos && sharedJungleStructGeos[key]) || sharedJungleTempleGeo;
}
const JUNGLE_POOL_MAJOR = [['jungleTemple', 2], ['jungleRoundTemple', 2], ['junglePalace', 3], ['jungleBallCourt', 2], ['jungleRuinPyramid', 3]];
const JUNGLE_POOL_RUIN = [['jungleRuinPyramid', 3], ['jungleStelae', 3], ['jungleHead', 2], ['jungleBallCourt', 1]];
const JUNGLE_POOL_ROADSIDE = [['jungleTemple', 2], ['jungleRuinPyramid', 2], ['jungleRoundTemple', 2], ['junglePalace', 2], ['jungleStelae', 2], ['jungleHead', 1], ['jungleBallCourt', 1]];

function jungleStone(geo, base, moss = 0.08, maxH = 12.0, cap = 0.45) {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const ny = norm.getY(i);
        const hFrac = Math.max(0.0, Math.min(1.0, vy / maxH));
        const ao = 0.74 + 0.26 * Math.pow(hFrac, 0.6);
        const n = (hash2D(Math.floor(vx * 1.7 + vz * 0.3), Math.floor(vy * 2.1 + vz * 1.3)) - 0.5) * 0.16;
        const m = Math.min(cap, Math.max(0.0, (ny > 0.5 ? 0.18 : 0.0) + (vy < 1.2 ? 0.10 : 0.0) + moss));
        col[i * 3]     = Math.min(1.0, Math.max(0.2, (base[0] * (1 - m) + 0.40 * m) * (ao + n)));
        col[i * 3 + 1] = Math.min(1.0, Math.max(0.2, (base[1] * (1 - m) + 0.42 * m) * (ao + n)));
        col[i * 3 + 2] = Math.min(1.0, Math.max(0.2, (base[2] * (1 - m) + 0.22 * m) * (ao + n)));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    applyWorldBoxUVs(geo, 0.26, 0.32);
    return geo;
}

function jungleBox(parts, w, h, d, x, y, z, base, moss, ry = 0, maxH = 12.0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(jungleStone(g, base, moss, maxH));
    return g;
}

// A. Collapsed stepped pyramid with broken summit shrine & scattered fallen blocks
function createJungleRuinedPyramidGeometry() {
    const parts = [];
    const stone = [0.70, 0.66, 0.56];
    const ochre = [0.78, 0.60, 0.44];
    jungleBox(parts, 18, 4, 18, 0, -2, 0, [0.56, 0.52, 0.44], 0.2);
    let y = 0.0;
    const baseW = 15.5, tierH = 1.6;
    for (let t = 0; t < 4; t++) {
        const w = baseW * (1 - t * 0.15);
        if (t < 3) {
            jungleBox(parts, w, tierH, w, 0, y + tierH * 0.5, 0, t === 1 ? ochre : stone, 0.10 + t * 0.06);
        } else {
            // broken 4th tier: only the rear half survives
            jungleBox(parts, w, tierH, w * 0.55, 0, y + tierH * 0.5, -w * 0.225, stone, 0.25);
            jungleBox(parts, w * 0.45, tierH * 0.5, w * 0.30, w * 0.18, y + tierH * 0.25, w * 0.30, [0.62, 0.58, 0.50], 0.30, 0.2);
        }
        y += tierH;
    }
    // Front stairway, upper steps missing
    const steps = 9, topY = 3 * tierH, zBot = 9.4, zTop = 5.55;
    for (let s = 0; s < steps; s++) {
        if (s >= 7) break;
        const sTop = (s + 1) * (topY / steps);
        const sz = zBot - (s + 0.5) * ((zBot - zTop) / steps);
        const wid = (s === 4) ? 1.7 : 3.2;
        jungleBox(parts, wid, sTop + 0.3, (zBot - zTop) / steps + 0.1, (s === 4 ? -0.7 : 0), (sTop - 0.3) * 0.5, sz, [0.74, 0.70, 0.60], 0.15);
    }
    // Broken summit shrine fragments
    const sy = 4 * tierH;
    jungleBox(parts, 5.0, 2.8, 0.7, 0.4, sy + 1.4, -3.6, [0.76, 0.72, 0.62], 0.12);
    jungleBox(parts, 0.8, 2.6, 4.0, -2.4, sy + 1.3, -1.6, [0.74, 0.70, 0.60], 0.16);
    jungleBox(parts, 1.4, 1.2, 0.7, 2.2, sy + 0.6, -3.0, [0.70, 0.66, 0.58], 0.20, 0.4);
    jungleBox(parts, 2.4, 0.5, 0.9, -1.0, sy + 0.25, -0.8, [0.66, 0.62, 0.52], 0.22, 0.7);
    // Fallen blocks around the base
    for (let b = 0; b < 12; b++) {
        const ang = b * 2.399 + 0.4;
        const rad = 9.6 + hash2D(b * 3.7, 1.3) * 4.0;
        const bs = 0.8 + hash2D(b * 5.1, 2.7) * 1.1;
        jungleBox(parts, bs * 1.4, bs, bs, Math.cos(ang) * rad, bs * 0.38, Math.sin(ang) * rad, [0.68, 0.64, 0.55], 0.22, ang, 12.0, (hash2D(b, 9.1) - 0.5) * 0.35);
    }
    const merged = mergeBufferGeometries(parts);
    merged.userData = { useMeshRaycastOnly: true };
    return merged;
}

// B. Round Aztec/Huastec-style wind-god temple: circular platforms, tower, thatched cone roof
function createJungleRoundTempleGeometry() {
    const parts = [];
    const add = (g, base, moss, cap) => parts.push(jungleStone(g, base, moss, 12.0, cap));
    let g = new THREE.CylinderGeometry(9.0, 9.0, 4.0, 22); g.translate(0, -2.0, 0); add(g, [0.55, 0.50, 0.42], 0.2);
    g = new THREE.CylinderGeometry(8.2, 8.7, 1.1, 22); g.translate(0, 0.55, 0); add(g, [0.76, 0.70, 0.58], 0.08);
    g = new THREE.CylinderGeometry(7.0, 7.4, 1.0, 22); g.translate(0, 1.6, 0); add(g, [0.72, 0.66, 0.54], 0.10);
    g = new THREE.CylinderGeometry(5.8, 6.2, 1.0, 20); g.translate(0, 2.6, 0); add(g, [0.78, 0.72, 0.60], 0.10);
    g = new THREE.CylinderGeometry(3.5, 3.9, 4.2, 16); g.translate(0, 5.2, 0); add(g, [0.80, 0.62, 0.46], 0.04, 0.2);
    g = new THREE.CylinderGeometry(4.0, 4.0, 0.5, 16); g.translate(0, 7.55, 0); add(g, [0.55, 0.40, 0.30], 0.0, 0.1);
    g = new THREE.ConeGeometry(4.7, 3.8, 16); g.translate(0, 9.7, 0); add(g, [0.46, 0.36, 0.20], 0.0, 0.05);
    // dark doorway + lintel + flanking pillars
    let d = new THREE.BoxGeometry(1.5, 2.4, 1.2); d.translate(0, 4.3, 3.5); parts.push(tintBuildingPart(applyWorldBoxUVs(d, 0.26, 0.26), 0.12, 0.11, 0.10, 12));
    jungleBox(parts, 2.6, 0.45, 1.4, 0, 5.65, 3.6, [0.82, 0.78, 0.66], 0.05);
    [-1, 1].forEach(s => jungleBox(parts, 0.45, 2.6, 0.6, s * 1.25, 4.4, 3.7, [0.82, 0.78, 0.66], 0.04));
    // Front stairs
    for (let s = 0; s < 8; s++) {
        const sTop = (s + 1) * (3.1 / 8);
        jungleBox(parts, 3.2, sTop + 0.3, 0.5, 0, (sTop - 0.3) * 0.5, 9.0 - (s + 0.5) * 0.4, [0.76, 0.72, 0.60], 0.12);
    }
    const merged = mergeBufferGeometries(parts);
    merged.userData = { useMeshRaycastOnly: true, collisionCircles: [{ x: 0, z: 0, r: 8.8 }] };
    return merged;
}

// C. Mesoamerican ball court: two parallel stepped walls, stone hoops, end temples
function createJungleBallCourtGeometry() {
    const parts = [];
    const stone = [0.74, 0.70, 0.60];
    jungleBox(parts, 8.4, 0.3, 23, 0, 0.0, 0, [0.62, 0.58, 0.50], 0.25);
    jungleBox(parts, 18, 3, 25, 0, -1.5, 0, [0.55, 0.51, 0.44], 0.2);
    [-1, 1].forEach(s => {
        jungleBox(parts, 1.5, 1.3, 22, s * 4.75, 0.65, 0, [0.80, 0.74, 0.62], 0.08);
        jungleBox(parts, 2.2, 3.6, 22, s * 6.6, 1.8, 0, stone, 0.12);
        jungleBox(parts, 3.6, 0.5, 22.6, s * 6.6, 3.85, 0, [0.82, 0.78, 0.66], 0.06);
        // carved hoop ring
        const ring = new THREE.TorusGeometry(0.6, 0.18, 8, 16);
        ring.rotateY(Math.PI / 2); ring.translate(s * 5.35, 2.7, 0.0);
        parts.push(jungleStone(ring, [0.70, 0.66, 0.56], 0.05, 12));
    });
    // End shrines (west wall's far shrine collapsed)
    jungleBox(parts, 3.2, 1.9, 3.2, 6.6, 4.9, 8.2, [0.82, 0.76, 0.64], 0.08);
    jungleBox(parts, 3.2, 1.9, 3.2, 6.6, 4.9, -8.2, [0.80, 0.74, 0.62], 0.10);
    jungleBox(parts, 3.2, 1.0, 3.0, -6.6, 4.4, 8.2, [0.78, 0.72, 0.60], 0.18);
    for (let b = 0; b < 6; b++) {
        const bs = 0.7 + hash2D(b * 2.9, 4.4) * 0.9;
        jungleBox(parts, bs * 1.3, bs, bs, -8.0 - hash2D(b, 6.3) * 2.0, bs * 0.4, -9.0 + b * 2.4, [0.70, 0.66, 0.56], 0.25, b * 0.8);
    }
    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: [
            { minX: 4.0, maxX: 8.4, minZ: -11.4, maxZ: 11.4 },
            { minX: -8.4, maxX: -4.0, minZ: -11.4, maxZ: 11.4 }
        ]
    };
    return merged;
}

// D. Long Puuc-style palace with doorway row, columns, mosaic frieze, collapsed west end
function createJunglePalaceGeometry() {
    const parts = [];
    const stone = [0.80, 0.76, 0.64];
    jungleBox(parts, 27, 3, 11, 0, -1.5, 0, [0.55, 0.51, 0.44], 0.2);
    jungleBox(parts, 26, 1.2, 10, 0, 0.6, 0, [0.72, 0.68, 0.58], 0.12);
    jungleBox(parts, 22, 3.4, 5.6, 0, 2.9, -0.5, stone, 0.06);
    for (let i = -2; i <= 2; i++) {
        if (i === -2) continue; // collapsed doorway
        const d = new THREE.BoxGeometry(1.3, 2.4, 0.6); d.translate(i * 4.0, 2.4, 2.2);
        parts.push(tintBuildingPart(applyWorldBoxUVs(d, 0.26, 0.26), 0.12, 0.11, 0.10, 12));
        jungleBox(parts, 1.9, 0.35, 0.7, i * 4.0, 3.75, 2.3, [0.86, 0.82, 0.70], 0.03);
    }
    [-1.3, 1.3].forEach(x => jungleBox(parts, 0.4, 2.4, 0.5, x, 2.4, 2.5, [0.86, 0.82, 0.70], 0.03));
    // Medial moulding + mosaic frieze (east 3/4 only)
    jungleBox(parts, 17, 0.5, 6.2, 2.5, 4.85, -0.5, [0.84, 0.80, 0.68], 0.05);
    jungleBox(parts, 16.6, 1.8, 5.8, 2.5, 5.9, -0.5, [0.76, 0.66, 0.52], 0.04);
    for (let i = 0; i < 16; i++) {
        const dark = (i % 2 === 0);
        jungleBox(parts, 0.7, dark ? 1.1 : 0.7, 0.35, -5.5 + i * 1.04, 5.9, 2.5, dark ? [0.50, 0.40, 0.30] : [0.88, 0.84, 0.72], 0.0);
    }
    jungleBox(parts, 17.4, 0.4, 6.4, 2.5, 7.0, -0.5, [0.86, 0.82, 0.70], 0.10);
    // Entrance stairs & rubble heap on the collapsed end
    for (let s = 0; s < 4; s++) {
        const sTop = (s + 1) * 0.3;
        jungleBox(parts, 6.2, sTop + 0.2, 0.7, 4.0, (sTop - 0.2) * 0.5, 5.3 + (3 - s) * 0.6 + 0.3, [0.76, 0.72, 0.60], 0.12);
    }
    for (let b = 0; b < 9; b++) {
        const bs = 0.7 + hash2D(b * 3.3, 7.7) * 1.1;
        jungleBox(parts, bs * 1.3, bs, bs, -10.5 - hash2D(b, 3.1) * 2.0, 1.2 + bs * 0.35 + (b % 3) * 0.3, -2.0 + b * 0.7, [0.74, 0.70, 0.60], 0.25, b * 1.1, 12, (hash2D(b, 5.5) - 0.5) * 0.5);
    }
    const merged = mergeBufferGeometries(parts);
    merged.userData = { useMeshRaycastOnly: true };
    return merged;
}

// E. Stelae plaza: carved standing stones, fallen stela, round altar on a cracked platform
function createJungleStelaeGeometry() {
    const parts = [];
    jungleBox(parts, 11.5, 3, 11.5, 0, -1.5, 0, [0.55, 0.51, 0.44], 0.2);
    jungleBox(parts, 11, 0.5, 5.4, 0, 0.25, -2.8, [0.72, 0.68, 0.58], 0.20);
    jungleBox(parts, 10.6, 0.45, 5.0, 0.2, 0.22, 2.9, [0.70, 0.66, 0.56], 0.26, 0.04);
    let g = new THREE.CylinderGeometry(1.5, 1.8, 0.9, 14); g.translate(0, 0.95, 0); parts.push(jungleStone(g, [0.76, 0.72, 0.62], 0.08, 12));
    g = new THREE.CylinderGeometry(1.7, 1.7, 0.2, 14); g.translate(0, 1.5, 0); parts.push(jungleStone(g, [0.82, 0.78, 0.66], 0.05, 12));
    const stelae = [[-4, -3, 6.2, 0.2, 0.03], [3.8, -3.4, 5.4, -0.3, -0.06], [-3.6, 3.2, 4.6, 0.5, 0.0], [4.0, 3.6, 6.8, 0.1, 0.08], [0.0, -4.5, 5.0, 0.0, -0.02]];
    const circles = [{ x: 0, z: 0, r: 1.9 }];
    stelae.forEach(([x, z, h, ry, tilt], i) => {
        const col = i % 2 ? [0.60, 0.58, 0.52] : [0.72, 0.68, 0.58];
        let s = new THREE.BoxGeometry(1.4, h, 0.6); s.translate(0, h * 0.5, 0); s.rotateZ(tilt); s.rotateY(ry); s.translate(x, 0.5, z);
        parts.push(jungleStone(s, col, 0.12, 12));
        let r = new THREE.BoxGeometry(0.9, h * 0.6, 0.12); r.translate(0, h * 0.55, 0.32); r.rotateZ(tilt); r.rotateY(ry); r.translate(x, 0.5, z);
        parts.push(jungleStone(r, [col[0] * 0.65, col[1] * 0.62, col[2] * 0.58], 0.0, 12));
        let cp = new THREE.BoxGeometry(1.7, 0.45, 0.8); cp.translate(0, h + 0.2, 0); cp.rotateZ(tilt); cp.rotateY(ry); cp.translate(x, 0.5, z);
        parts.push(jungleStone(cp, col, 0.10, 12));
        circles.push({ x: x, z: z, r: 1.0 });
    });
    jungleBox(parts, 4.6, 0.6, 1.3, 1.2, 0.8, 0.1 + 5.0 - 5.0 + 0.0, [0.66, 0.62, 0.54], 0.25, 0.6);
    const merged = mergeBufferGeometries(parts);
    merged.userData = { useMeshRaycastOnly: true, collisionCircles: circles };
    return merged;
}

// F. Colossal Olmec-style basalt head on a plinth
function createJungleColossalHeadGeometry() {
    const parts = [];
    const basalt = [0.50, 0.49, 0.45];
    jungleBox(parts, 4.6, 3, 4.6, 0, -1.5, 0, [0.52, 0.48, 0.42], 0.2);
    jungleBox(parts, 4.0, 0.7, 4.0, 0, 0.35, 0, [0.70, 0.66, 0.56], 0.15);
    const addS = (r, sx, sy, sz, x, y, z, col, moss) => {
        const s = new THREE.SphereGeometry(r, 16, 12); s.scale(sx, sy, sz); s.translate(x, y, z);
        parts.push(jungleStone(s, col, moss, 6.0));
    };
    addS(1.7, 1.0, 1.0, 1.1, 0, 2.5, 0, basalt, 0.10);                 // skull
    addS(1.8, 1.02, 0.55, 1.12, 0, 3.55, 0, [0.44, 0.43, 0.40], 0.12);  // helmet cap
    addS(0.62, 1.0, 0.9, 0.9, -0.95, 1.9, 1.45, basalt, 0.06);          // cheeks
    addS(0.62, 1.0, 0.9, 0.9, 0.95, 1.9, 1.45, basalt, 0.06);
    addS(0.45, 0.6, 1.1, 0.8, -1.7, 2.3, 0.0, basalt, 0.06);            // ears
    addS(0.45, 0.6, 1.1, 0.8, 1.7, 2.3, 0.0, basalt, 0.06);
    jungleBox(parts, 0.8, 0.8, 0.7, 0, 2.1, 1.85, basalt, 0.04);        // nose
    jungleBox(parts, 1.5, 0.4, 0.55, 0, 1.45, 1.8, [0.46, 0.45, 0.42], 0.03); // lips
    jungleBox(parts, 2.3, 0.4, 0.7, 0, 2.95, 1.55, [0.46, 0.45, 0.42], 0.05); // brow
    [-0.65, 0.65].forEach(x => jungleBox(parts, 0.45, 0.22, 0.25, x, 2.55, 1.95, [0.26, 0.25, 0.23], 0.0)); // eyes
    const merged = mergeBufferGeometries(parts);
    merged.userData = { useMeshRaycastOnly: true, collisionCircles: [{ x: 0, z: 0, r: 2.4 }] };
    return merged;
}

function createGreekParthenonGeometry(w = 19.5, l = 29.0) {
    const parts = [];
    const maxH = 14.5;

    function addMarblePart(geo, r = 0.95, g = 0.92, b = 0.86, uvScale = 0.26) {
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hAO = 0.78 + 0.22 * Math.min(1.0, Math.max(0.0, vy / maxH));
            const warmVein = Math.sin(vx * 0.6 + vy * 1.1 + vz * 0.5) * 0.03;
            const chiselMark = (hash2D(Math.floor((vx + vz) * 4.0), Math.floor(vy * 6.0)) > 0.88) ? -0.10 : 0.0;
            col[i * 3 + 0] = Math.min(1.0, (r + warmVein + chiselMark) * hAO);
            col[i * 3 + 1] = Math.min(1.0, (g + warmVein * 0.8 + chiselMark) * hAO);
            col[i * 3 + 2] = Math.min(1.0, (b + warmVein * 0.5 + chiselMark * 0.8) * hAO);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, uvScale, uvScale * 1.15);
        parts.push(geo);
    }

    // 0. Deep Sub-Terrain Pentelic Marble & Limestone Foundation
    const foundH = 5.0;
    const foundation = new THREE.BoxGeometry(w + 2.6, foundH, l + 2.6);
    foundation.translate(0, -foundH * 0.5, 0);
    addMarblePart(foundation, 0.88, 0.85, 0.78);

    // 1. 3-Step Pentelic Marble Crepidoma & Stylobate Platform
    const stepH = 0.42;
    const walkablePlatforms = [];
    for (let s = 0; s < 3; s++) {
        const sw = w + (2 - s) * 1.25;
        const sl = l + (2 - s) * 1.25;
        const step = new THREE.BoxGeometry(sw, stepH + 0.02, sl);
        step.translate(0, s * stepH + stepH * 0.5, 0);
        addMarblePart(step, 0.92 + s * 0.02, 0.89 + s * 0.02, 0.82 + s * 0.02);
        walkablePlatforms.push({
            minX: -sw * 0.5, maxX: sw * 0.5,
            minZ: -sl * 0.5, maxZ: sl * 0.5,
            y: (s + 1) * stepH
        });
    }
    const stylobateY = 3 * stepH;

    // 2. Fluted Doric Peristyle Columns with Authentically Broken Columns & Fallen Drums
    const colH = 6.8;
    const colPositions = [];
    const colsX = 6, colsZ = 8;
    const spanX = w - 2.2, spanZ = l - 2.2;

    const brokenColMap = {
        '0,2': 2.3, // West flank: broken stump
        '0,3': 4.1, // West flank: mid-height broken column
        '0,4': 1.6, // West flank: low broken stump
        '5,3': 3.1, // East flank: broken column
        '5,5': 2.6, // East flank: broken column
        '2,0': 3.6  // Back facade: broken column
    };

    for (let ix = 0; ix < colsX; ix++) {
        for (let iz = 0; iz < colsZ; iz++) {
            if (ix > 0 && ix < colsX - 1 && iz > 0 && iz < colsZ - 1) continue;
            const cx = -spanX * 0.5 + (ix / (colsX - 1)) * spanX;
            const cz = -spanZ * 0.5 + (iz / (colsZ - 1)) * spanZ;
            colPositions.push([cx, cz]);

            const colKey = `${ix},${iz}`;
            const brokenH = brokenColMap[colKey];
            const isBroken = (brokenH !== undefined);
            const thisColH = isBroken ? brokenH : colH;

            const shaft = new THREE.CylinderGeometry(
                isBroken ? 0.48 : 0.46,
                0.58,
                thisColH,
                16,
                isBroken ? 2 : 3
            );
            const sp = shaft.attributes.position;
            for (let k = 0; k < sp.count; k++) {
                const vx = sp.getX(k), vy = sp.getY(k), vz = sp.getZ(k);
                const ang = Math.atan2(vz, vx);
                const flute = 1.0 - Math.abs(Math.sin(ang * 8.0)) * 0.045;
                const entasis = 1.0 + Math.sin(((vy + thisColH * 0.5) / colH) * Math.PI) * 0.03;
                sp.setX(k, vx * flute * entasis);
                sp.setZ(k, vz * flute * entasis);
            }
            shaft.computeVertexNormals();
            shaft.translate(cx, stylobateY + thisColH * 0.5, cz);
            addMarblePart(shaft, 0.96, 0.93, 0.87, 0.32);

            if (isBroken) {
                const capBroken = new THREE.CylinderGeometry(0.48, 0.49, 0.28, 12);
                capBroken.rotateZ((ix + iz) * 0.35);
                capBroken.translate(cx, stylobateY + thisColH + 0.12, cz);
                addMarblePart(capBroken, 0.90, 0.87, 0.81);
            } else {
                const echinus = new THREE.CylinderGeometry(0.68, 0.46, 0.34, 16);
                echinus.translate(cx, stylobateY + colH + 0.17, cz);
                addMarblePart(echinus, 0.97, 0.94, 0.88);

                const abacus = new THREE.BoxGeometry(1.42, 0.28, 1.42);
                abacus.translate(cx, stylobateY + colH + 0.34 + 0.14, cz);
                addMarblePart(abacus, 0.95, 0.92, 0.85);
            }
        }
    }

    // Fallen Column Drums & Shattered Architrave Megaliths scattered on stylobate and steps
    const fallenDrums = [
        { x: -spanX * 0.5 + 0.5, z: -1.2, r: 0.50, len: 1.6, rx: Math.PI * 0.5, ry: 0.22, rz: 0.12, y: stylobateY + 0.50 },
        { x: -spanX * 0.5 - 1.2, z:  1.5, r: 0.48, len: 1.3, rx: Math.PI * 0.48, ry: -0.35, rz: -0.18, y: stylobateY - 0.15 },
        { x:  spanX * 0.5 - 0.4, z: -1.8, r: 0.49, len: 1.5, rx: Math.PI * 0.52, ry: 0.40, rz: 0.08, y: stylobateY + 0.49 },
        { x:  spanX * 0.5 + 1.1, z:  4.5, r: 0.47, len: 1.2, rx: Math.PI * 0.46, ry: -0.15, rz: 0.25, y: stylobateY - 0.12 }
    ];
    fallenDrums.forEach(fd => {
        const drum = new THREE.CylinderGeometry(fd.r, fd.r, fd.len, 16);
        drum.rotateX(fd.rx);
        drum.rotateY(fd.ry);
        drum.rotateZ(fd.rz);
        drum.translate(fd.x, fd.y, fd.z);
        addMarblePart(drum, 0.94, 0.91, 0.85, 0.30);
    });

    const fallenBeam = new THREE.BoxGeometry(2.4, 0.68, 0.72);
    fallenBeam.rotateY(0.42);
    fallenBeam.rotateZ(0.12);
    fallenBeam.translate(-spanX * 0.5 + 1.2, stylobateY + 0.35, 0.5);
    addMarblePart(fallenBeam, 0.93, 0.90, 0.84);

    const fallenAbacus = new THREE.BoxGeometry(1.35, 0.28, 1.35);
    fallenAbacus.rotateZ(0.32);
    fallenAbacus.rotateY(0.55);
    fallenAbacus.translate(-spanX * 0.5 - 0.9, stylobateY + 0.18, -3.2);
    addMarblePart(fallenAbacus, 0.92, 0.89, 0.83);

    // 3. Classical Doric Entablature with Broken Architrave Breach
    const entabY = stylobateY + colH + 0.62;

    const archEast = new THREE.BoxGeometry(1.2, 0.72, l - 0.6);
    archEast.translate((w - 0.6) * 0.5 - 0.6, entabY + 0.36, 0);
    addMarblePart(archEast, 0.96, 0.93, 0.87);

    const archFront = new THREE.BoxGeometry(w - 0.6, 0.72, 1.2);
    archFront.translate(0, entabY + 0.36, (l - 0.6) * 0.5 - 0.6);
    addMarblePart(archFront, 0.96, 0.93, 0.87);

    const archBack = new THREE.BoxGeometry(w - 0.6, 0.72, 1.2);
    archBack.translate(0, entabY + 0.36, -(l - 0.6) * 0.5 + 0.6);
    addMarblePart(archBack, 0.96, 0.93, 0.87);

    const westSegL = (l - 12.0) * 0.5;
    const archWestFront = new THREE.BoxGeometry(1.2, 0.72, westSegL);
    archWestFront.translate(-(w - 0.6) * 0.5 + 0.6, entabY + 0.36, (l - 0.6) * 0.5 - westSegL * 0.5 - 0.6);
    addMarblePart(archWestFront, 0.95, 0.92, 0.86);

    const archWestBack = new THREE.BoxGeometry(1.2, 0.72, westSegL);
    archWestBack.translate(-(w - 0.6) * 0.5 + 0.6, entabY + 0.36, -(l - 0.6) * 0.5 + westSegL * 0.5 + 0.6);
    addMarblePart(archWestBack, 0.95, 0.92, 0.86);

    const archSnap1 = new THREE.BoxGeometry(1.1, 0.68, 0.95);
    archSnap1.rotateZ(-0.18);
    archSnap1.translate(-(w - 0.6) * 0.5 + 0.6, entabY + 0.28, (l - 0.6) * 0.5 - westSegL - 0.4);
    addMarblePart(archSnap1, 0.92, 0.89, 0.83);

    const friezeY = entabY + 0.72;
    const friezeCore = new THREE.BoxGeometry(w - 0.7, 0.78, l - 0.7);
    friezeCore.translate(0, friezeY + 0.39, 0);
    addMarblePart(friezeCore, 0.84, 0.56, 0.46);

    for (let tx = -6; tx <= 6; tx++) {
        [-1, 1].forEach(zSide => {
            const trig = new THREE.BoxGeometry(0.42, 0.76, 0.16);
            trig.translate(tx * ((w - 1.6) / 12), friezeY + 0.39, zSide * ((l - 0.62) * 0.5));
            addMarblePart(trig, 0.88, 0.90, 0.94);
        });
    }
    for (let tz = -9; tz <= 9; tz++) {
        if (Math.abs(tz) < 4) continue; // collapsed west breach
        const trig = new THREE.BoxGeometry(0.16, 0.76, 0.42);
        trig.translate(-((w - 0.62) * 0.5), friezeY + 0.39, tz * ((l - 1.6) / 18));
        addMarblePart(trig, 0.88, 0.90, 0.94);
    }
    for (let tz = -9; tz <= 9; tz++) {
        const trig = new THREE.BoxGeometry(0.16, 0.76, 0.42);
        trig.translate(((w - 0.62) * 0.5), friezeY + 0.39, tz * ((l - 1.6) / 18));
        addMarblePart(trig, 0.88, 0.90, 0.94);
    }

    const corniceY = friezeY + 0.78;
    const cornice = new THREE.BoxGeometry(w + 0.4, 0.38, l + 0.4);
    cornice.translate(0, corniceY + 0.19, 0);
    addMarblePart(cornice, 0.98, 0.95, 0.89);

    // 4. Triangular Pediments & Pitched Marble Roof with Collapsed Skylight Breach
    const roofBaseY = corniceY + 0.38;
    const roofH = 2.85;

    const roofFront = createPitchedRoofGeometry(w + 0.6, (l + 0.6) * 0.42, roofH);
    roofFront.translate(0, roofBaseY, (l + 0.6) * 0.29);
    addMarblePart(roofFront, 0.93, 0.88, 0.78, 0.22);

    const roofBack = createPitchedRoofGeometry(w + 0.6, (l + 0.6) * 0.42, roofH);
    roofBack.translate(0, roofBaseY, -(l + 0.6) * 0.29);
    addMarblePart(roofBack, 0.93, 0.88, 0.78, 0.22);

    for (let rz = -2.5; rz <= 2.5; rz += 1.8) {
        const rafter = new THREE.BoxGeometry(w - 2.8, 0.32, 0.36);
        rafter.translate(0, roofBaseY + 0.35, rz);
        addMarblePart(rafter, 0.82, 0.76, 0.68);
    }

    [-1, 1].forEach(zSide => {
        const gz = zSide * (l * 0.5 - 0.05);
        const sculptPositions = [
            { x:  0.0,  h: 1.65, w: 0.75 },
            { x: -1.8,  h: 1.35, w: 0.65 },
            { x:  1.8,  h: 1.35, w: 0.65 },
            { x: -3.5,  h: 0.95, w: 0.60 },
            { x:  3.5,  h: 0.95, w: 0.60 }
        ];
        sculptPositions.forEach((sp, sIdx) => {
            if (zSide === -1 && sIdx === 1) return;
            const figH = (zSide === -1 && sIdx === 2) ? sp.h * 0.55 : sp.h;
            const fig = new THREE.CylinderGeometry(sp.w * 0.38, sp.w * 0.48, figH, 8);
            fig.translate(sp.x, roofBaseY + figH * 0.5 + 0.05, gz);
            addMarblePart(fig, 0.98, 0.94, 0.86);
        });

        if (zSide === 1) {
            const akro = new THREE.ConeGeometry(0.55, 1.15, 6);
            akro.translate(0, roofBaseY + roofH + 0.45, zSide * (l * 0.5 + 0.15));
            addMarblePart(akro, 0.96, 0.82, 0.42);
        } else {
            const akroStump = new THREE.CylinderGeometry(0.35, 0.45, 0.45, 6);
            akroStump.translate(0, roofBaseY + roofH + 0.20, zSide * (l * 0.5 + 0.15));
            addMarblePart(akroStump, 0.90, 0.78, 0.40);
        }
    });

    // 5. Walk-In Interior Cella Sanctuary Walls with Stepped Ruin Profile & Athena Statue
    const cellaW = w - 6.8;
    const cellaL = l - 9.2;
    const cellaH = colH + 0.5;
    const wallT = 0.65;
    const doorHalfW = 2.1;

    const sideWallEast = new THREE.BoxGeometry(wallT, cellaH, cellaL);
    sideWallEast.translate(cellaW * 0.5 - wallT * 0.5, stylobateY + cellaH * 0.5, 0);
    addMarblePart(sideWallEast, 0.93, 0.90, 0.84);

    const westLower = new THREE.BoxGeometry(wallT, cellaH * 0.62, cellaL);
    westLower.translate(-(cellaW * 0.5 - wallT * 0.5), stylobateY + cellaH * 0.31, 0);
    addMarblePart(westLower, 0.93, 0.90, 0.84);

    const westUpperSeg = new THREE.BoxGeometry(wallT, cellaH * 0.38, cellaL * 0.45);
    westUpperSeg.translate(-(cellaW * 0.5 - wallT * 0.5), stylobateY + cellaH * 0.62 + cellaH * 0.19, cellaL * 0.25);
    addMarblePart(westUpperSeg, 0.92, 0.89, 0.83);

    const jambW = (cellaW - doorHalfW * 2.0) * 0.5;
    [-1, 1].forEach(zSide => {
        const wz = zSide * (cellaL * 0.5 - wallT * 0.5);
        [-1, 1].forEach(xSide => {
            const wx = xSide * (doorHalfW + jambW * 0.5);
            const jambWall = new THREE.BoxGeometry(jambW, cellaH, wallT);
            jambWall.translate(wx, stylobateY + cellaH * 0.5, wz);
            addMarblePart(jambWall, 0.93, 0.90, 0.84);
        });
        const lintel = new THREE.BoxGeometry(doorHalfW * 2.0 + 0.4, 1.45, wallT);
        lintel.translate(0, stylobateY + cellaH - 0.725, wz);
        addMarblePart(lintel, 0.95, 0.92, 0.86);
    });

    const ped = new THREE.BoxGeometry(2.4, 1.35, 2.4);
    ped.translate(0, stylobateY + 0.675, 0);
    addMarblePart(ped, 0.88, 0.85, 0.79);

    const statue = new THREE.CylinderGeometry(0.52, 0.68, 3.8, 10);
    statue.translate(0, stylobateY + 1.35 + 1.9, 0);
    addMarblePart(statue, 0.98, 0.86, 0.48);

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionCircles: colPositions.map(([cx, cz]) => ({ x: cx, z: cz, r: 0.62 })),
        collisionBoxes: [
            { minX: -cellaW * 0.5, maxX: -cellaW * 0.5 + wallT, minZ: -cellaL * 0.5, maxZ: cellaL * 0.5 },
            { minX:  cellaW * 0.5 - wallT, maxX: cellaW * 0.5,  minZ: -cellaL * 0.5, maxZ: cellaL * 0.5 },
            { minX: -cellaW * 0.5, maxX: -doorHalfW, minZ:  cellaL * 0.5 - wallT, maxZ:  cellaL * 0.5 },
            { minX:  doorHalfW,    maxX:  cellaW * 0.5, minZ:  cellaL * 0.5 - wallT, maxZ:  cellaL * 0.5 },
            { minX: -cellaW * 0.5, maxX: -doorHalfW, minZ: -cellaL * 0.5, maxZ: -cellaL * 0.5 + wallT },
            { minX:  doorHalfW,    maxX:  cellaW * 0.5, minZ: -cellaL * 0.5, maxZ: -cellaL * 0.5 + wallT },
            { minX: -1.25, maxX: 1.25, minZ: -1.25, maxZ: 1.25 }
        ],
        walkablePlatforms: walkablePlatforms
    };
    return merged;
}

// ============================================================================
// 5Z-2. Ancient Greece Sanctuary of Athena Pronaia Tholos (Delphi Circular Marble Rotunda)
// (Ruined Circular Colonnade: Broken Column Stumps, Fallen Fluted Drums & Altar)
// ============================================================================
function createGreekTholosGeometry(radius = 8.2) {
    const parts = [];
    const maxH = 11.8;

    const addTholosPart = (geo, r = 0.95, g = 0.92, b = 0.86) => {
        tintBuildingPart(geo, r, g, b, maxH);
        applyWorldBoxUVs(geo, 0.26, 0.30);
        parts.push(geo);
    };

    // Sub-Terrain Circular Marble Foundation
    const foundH = 4.5;
    const found = new THREE.CylinderGeometry(radius + 1.35, radius + 1.55, foundH, 24);
    found.translate(0, -foundH * 0.5, 0);
    addTholosPart(found, 0.88, 0.85, 0.78);

    // 3-Step Circular Marble Crepidoma
    const stepH = 0.36;
    const walkablePlatforms = [];
    for (let s = 0; s < 3; s++) {
        const sr = radius + (2 - s) * 0.65;
        const disc = new THREE.CylinderGeometry(sr, sr + 0.08, stepH + 0.02, 24);
        disc.translate(0, s * stepH + stepH * 0.5, 0);
        addTholosPart(disc, 0.92 + s * 0.02, 0.89 + s * 0.02, 0.83 + s * 0.02);
        walkablePlatforms.push({ x: 0, z: 0, r: sr + 0.05, y: (s + 1) * stepH });
    }
    const baseY = 3 * stepH;

    // 12 Outer Peristyle Columns with Ruined Delphi Broken Columns
    const numCols = 12;
    const colRingR = radius - 0.85;
    const colH = 5.8;
    const colCircles = [];

    const brokenCols = {
        2: 1.5,
        4: 2.7,
        5: 3.6,
        8: 2.0
    };

    for (let i = 0; i < numCols; i++) {
        const ang = (i / numCols) * Math.PI * 2.0;
        const cx = Math.cos(ang) * colRingR;
        const cz = Math.sin(ang) * colRingR;
        colCircles.push({ x: cx, z: cz, r: 0.55 });

        const isBroken = (brokenCols[i] !== undefined);
        const thisColH = isBroken ? brokenCols[i] : colH;

        const shaft = new THREE.CylinderGeometry(isBroken ? 0.40 : 0.38, 0.48, thisColH, 12, 2);
        shaft.translate(cx, baseY + thisColH * 0.5, cz);
        addTholosPart(shaft, 0.96, 0.93, 0.87);

        if (isBroken) {
            const brokenCap = new THREE.CylinderGeometry(0.40, 0.42, 0.22, 10);
            brokenCap.rotateZ((i * 0.4) % 0.3);
            brokenCap.translate(cx, baseY + thisColH + 0.10, cz);
            addTholosPart(brokenCap, 0.90, 0.86, 0.80);
        } else {
            const cap = new THREE.CylinderGeometry(0.58, 0.38, 0.32, 12);
            cap.translate(cx, baseY + colH + 0.16, cz);
            addTholosPart(cap, 0.97, 0.94, 0.88);

            const abacus = new THREE.BoxGeometry(1.18, 0.24, 1.18);
            abacus.rotateY(-ang);
            abacus.translate(cx, baseY + colH + 0.32 + 0.12, cz);
            addTholosPart(abacus, 0.95, 0.92, 0.86);
        }
    }

    // Fallen Fluted Column Drums on Stylobate
    const fallenTholosDrums = [
        { ang: 0.9, dist: colRingR - 0.3, r: 0.42, len: 1.3, tilt: 0.15 },
        { ang: 2.4, dist: colRingR + 0.2, r: 0.40, len: 1.1, tilt: -0.22 },
        { ang: 4.2, dist: colRingR - 0.5, r: 0.44, len: 1.4, tilt: 0.18 }
    ];
    fallenTholosDrums.forEach(fd => {
        const drum = new THREE.CylinderGeometry(fd.r, fd.r, fd.len, 14);
        drum.rotateX(Math.PI * 0.5);
        drum.rotateZ(fd.tilt);
        drum.translate(Math.cos(fd.ang) * fd.dist, baseY + 0.42, Math.sin(fd.ang) * fd.dist);
        addTholosPart(drum, 0.93, 0.90, 0.84);
    });

    // Circular Marble Entablature Ring & Conical Roof
    const ringY = baseY + colH + 0.56;
    const entabRing = new THREE.CylinderGeometry(radius - 0.2, radius - 0.2, 1.15, 24, 1, true);
    entabRing.translate(0, ringY + 0.575, 0);
    addTholosPart(entabRing, 0.95, 0.91, 0.84);

    const entabCap = new THREE.CylinderGeometry(radius + 0.15, radius + 0.15, 0.34, 24);
    entabCap.translate(0, ringY + 1.15, 0);
    addTholosPart(entabCap, 0.97, 0.94, 0.88);

    const coneRoof = new THREE.ConeGeometry(radius + 0.35, 2.85, 24);
    coneRoof.translate(0, ringY + 1.32 + 1.425, 0);
    addTholosPart(coneRoof, 0.88, 0.72, 0.56);

    const finial = new THREE.ConeGeometry(0.48, 1.1, 8);
    finial.translate(0, ringY + 1.32 + 2.85 + 0.45, 0);
    addTholosPart(finial, 0.98, 0.84, 0.42);

    const altar = new THREE.CylinderGeometry(0.95, 1.15, 1.25, 12);
    altar.translate(0, baseY + 0.625, 0);
    addTholosPart(altar, 0.90, 0.86, 0.78);
    colCircles.push({ x: 0, z: 0, r: 1.15 });

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionCircles: colCircles,
        walkablePlatforms: walkablePlatforms
    };
    return merged;
}

// ============================================================================
// 5Z-3. Ancient Greece Classical Agora Stoa Colonnade Portico
// (Ruined Stoa: Broken Columns, Tumbled Drums, Eroded Masonry Walls & Tile Roof)
// ============================================================================
function createGreekStoaGeometry(w = 18.0, l = 8.4) {
    const parts = [];
    const maxH = 8.6;
    const addStoaPart = (geo, r = 0.94, g = 0.91, b = 0.85) => {
        tintBuildingPart(geo, r, g, b, maxH);
        applyWorldBoxUVs(geo, 0.26, 0.30);
        parts.push(geo);
    };

    const foundH = 4.2;
    const found = new THREE.BoxGeometry(w + 0.8, foundH, l + 0.8);
    found.translate(0, -foundH * 0.5, 0);
    addStoaPart(found, 0.86, 0.83, 0.76);

    const step1 = new THREE.BoxGeometry(w + 0.6, 0.34, l + 0.6);
    step1.translate(0, 0.17, 0);
    addStoaPart(step1, 0.88, 0.85, 0.78);

    const baseH = 0.65;
    const base = new THREE.BoxGeometry(w, baseH, l);
    base.translate(0, baseH * 0.5, 0);
    addStoaPart(base, 0.90, 0.87, 0.80);

    // Front row of 6 Doric columns (+Z) with broken columns
    const colH = 5.0;
    const colCircles = [];
    const brokenStoaCols = { 1: 2.2, 4: 3.3 };

    for (let i = 0; i < 6; i++) {
        const cx = -w * 0.42 + (i / 5) * (w * 0.84);
        const cz = l * 0.36;
        colCircles.push({ x: cx, z: cz, r: 0.48 });

        const isBroken = (brokenStoaCols[i] !== undefined);
        const thisColH = isBroken ? brokenStoaCols[i] : colH;

        const col = new THREE.CylinderGeometry(isBroken ? 0.36 : 0.34, 0.42, thisColH, 12);
        col.translate(cx, baseH + thisColH * 0.5, cz);
        addStoaPart(col, 0.96, 0.93, 0.87);

        if (isBroken) {
            const cap = new THREE.CylinderGeometry(0.36, 0.38, 0.20, 10);
            cap.rotateZ(0.25);
            cap.translate(cx, baseH + thisColH + 0.08, cz);
            addStoaPart(cap, 0.91, 0.88, 0.82);
        } else {
            const cap = new THREE.BoxGeometry(0.96, 0.28, 0.96);
            cap.translate(cx, baseH + colH + 0.14, cz);
            addStoaPart(cap, 0.95, 0.92, 0.86);
        }
    }

    // Fallen Column Drums lying on the Stoa porch
    const fallenStoaDrum = new THREE.CylinderGeometry(0.36, 0.36, 1.4, 12);
    fallenStoaDrum.rotateX(Math.PI * 0.5);
    fallenStoaDrum.rotateY(0.35);
    fallenStoaDrum.translate(-w * 0.22, baseH + 0.36, l * 0.28);
    addStoaPart(fallenStoaDrum, 0.93, 0.90, 0.84);

    const fallenStoaDrum2 = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12);
    fallenStoaDrum2.rotateX(Math.PI * 0.5);
    fallenStoaDrum2.rotateY(-0.28);
    fallenStoaDrum2.translate(w * 0.28, baseH + 0.35, l * 0.30);
    addStoaPart(fallenStoaDrum2, 0.93, 0.90, 0.84);

    // Rear masonry wall (-Z) with central open portal
    const wallT = 0.60;
    const doorHalf = 1.6;
    const segW = (w - doorHalf * 2.0) * 0.5;
    [-1, 1].forEach(side => {
        const wallSeg = new THREE.BoxGeometry(segW, colH + 0.28, wallT);
        wallSeg.translate(side * (doorHalf + segW * 0.5), baseH + (colH + 0.28) * 0.5, -l * 0.42);
        addStoaPart(wallSeg, 0.92, 0.89, 0.82);
    });

    const lintel = new THREE.BoxGeometry(doorHalf * 2.0 + 0.4, 0.85, wallT);
    lintel.translate(0, baseH + colH - 0.14, -l * 0.42);
    addStoaPart(lintel, 0.94, 0.91, 0.85);

    // Entablature & Pitched Terracotta Tile Roof
    const entab = new THREE.BoxGeometry(w + 0.2, 0.85, l - 0.2);
    entab.translate(0, baseH + colH + 0.28 + 0.425, 0);
    addStoaPart(entab, 0.95, 0.92, 0.85);

    const roof = createPitchedRoofGeometry(w + 0.6, l + 0.6, 1.85);
    roof.translate(0, baseH + colH + 1.13, 0);
    addStoaPart(roof, 0.82, 0.46, 0.32);

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionCircles: colCircles,
        collisionBoxes: [
            { minX: -w * 0.5, maxX: -doorHalf, minZ: -l * 0.42 - wallT * 0.5, maxZ: -l * 0.42 + wallT * 0.5 },
            { minX:  doorHalf, maxX:  w * 0.5, minZ: -l * 0.42 - wallT * 0.5, maxZ: -l * 0.42 + wallT * 0.5 }
        ],
        walkablePlatforms: [
            { minX: -(w + 0.6) * 0.5, maxX: (w + 0.6) * 0.5, minZ: -(l + 0.6) * 0.5, maxZ: (l + 0.6) * 0.5, y: 0.34 },
            { minX: -w * 0.5, maxX: w * 0.5, minZ: -l * 0.5, maxZ: l * 0.5, y: baseH }
        ]
    };
    return merged;
}

// ============================================================================
// 5Z-4. Ancient Rome Flavian Amphitheatre (The Colosseum / Coliseum)
// Features: Monumental 16-Bay Elliptical Travertine Facade, 3 Superposed Stories of
// Open Vaulted Arcades with Engaged Columns & Entablature Cornices, Iconic Asymmetric
// 4th-Story North Attic Wall, Ruined South Cutaway Revealing Tiered Cavea Seating &
// Sandy Arena Floor, and Per-Pier Collision so Soldiers Can Walk/Shoot Through the Arches!
// ============================================================================
function createRomanColosseumGeometry(rxOuter = 23.5, rzOuter = 19.5) {
    const parts = [];
    const maxH = 21.0;

    function addTravertinePart(geo, r = 0.90, g = 0.82, b = 0.68, uvScale = 0.24) {
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hAO = 0.74 + 0.26 * Math.min(1.0, Math.max(0.0, vy / maxH));
            const courseVar = (hash2D(Math.floor(vx * 0.7), Math.floor(vy * 1.2 + vz * 0.7)) - 0.5) * 0.08;
            col[i * 3 + 0] = Math.min(1.0, (r + courseVar) * hAO);
            col[i * 3 + 1] = Math.min(1.0, (g + courseVar * 0.9) * hAO);
            col[i * 3 + 2] = Math.min(1.0, (b + courseVar * 0.7) * hAO);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, uvScale, uvScale * 1.2);
        parts.push(geo);
    }

    const numBays = 16;
    const tierH = 4.6;
    const pierCircles = [];

    // 0. Sub-Terrain Travertine Foundation & Sandy Arena Floor Slab
    const foundH = 5.0;
    const found = new THREE.CylinderGeometry(rxOuter + 1.2, rxOuter + 1.5, foundH, 24);
    found.scale(1.0, 1.0, rzOuter / rxOuter);
    found.translate(0, -foundH * 0.5, 0);
    addTravertinePart(found, 0.82, 0.74, 0.60);

    const arenaFloorH = 0.35;
    const arenaFloor = new THREE.CylinderGeometry(rxOuter + 1.0, rxOuter + 1.2, arenaFloorH, 24);
    arenaFloor.scale(1.0, 1.0, rzOuter / rxOuter);
    arenaFloor.translate(0, arenaFloorH * 0.5, 0);
    addTravertinePart(arenaFloor, 0.88, 0.79, 0.63);

    // 1. Elliptical Travertine Ring Foundation & Central Sandy Arena Podium Wall
    for (let i = 0; i < numBays; i++) {
        const ang = (i / numBays) * Math.PI * 2.0;
        const nextAng = ((i + 1) / numBays) * Math.PI * 2.0;
        const midAng = (ang + nextAng) * 0.5;

        const px = Math.cos(ang) * rxOuter;
        const pz = Math.sin(ang) * rzOuter;
        const nx = Math.cos(nextAng) * rxOuter;
        const nz = Math.sin(nextAng) * rzOuter;
        const mx = (px + nx) * 0.5;
        const mz = (pz + nz) * 0.5;
        const baySpan = Math.hypot(nx - px, nz - pz);
        const tangentRot = -Math.atan2(nz - pz, nx - px);

        // Tight collision circle on each travertine arcade pier (leaves the 5.5m bay arches open!)
        pierCircles.push({ x: px, z: pz, r: 1.55 });

        // Iconic asymmetric Colosseum preservation: North half (sin(ang) < 0.25) preserves all 3 tiers + 4th-story Attic;
        // South half steps down to 2 tiers revealing the interior cavea seating tiers!
        const isNorthPreserved = (Math.sin(midAng) < 0.28);
        const activeTiers = isNorthPreserved ? 3 : 2;

        for (let t = 0; t < activeTiers; t++) {
            const y0 = t * tierH;

            // Travertine Arcade Pier + Engaged Classical Half-Column on outer face
            const pier = new THREE.BoxGeometry(1.85, tierH, 2.35);
            pier.rotateY(-ang + Math.PI * 0.5);
            pier.translate(px, y0 + tierH * 0.5, pz);
            addTravertinePart(pier, 0.90, 0.81, 0.66);

            const engCol = new THREE.CylinderGeometry(0.38, 0.44, tierH - 0.45, 10);
            engCol.translate(px * 1.045, y0 + (tierH - 0.45) * 0.5, pz * 1.045);
            addTravertinePart(engCol, 0.95, 0.87, 0.72);

            // Upper Arch Lintel / Spandrel & Projecting Cornice Belt over the open archway
            const spandrelH = 1.45;
            const spandrel = new THREE.BoxGeometry(baySpan + 0.35, spandrelH, 2.25);
            spandrel.rotateY(tangentRot);
            spandrel.translate(mx, y0 + tierH - spandrelH * 0.5, mz);
            addTravertinePart(spandrel, 0.92, 0.83, 0.68);

            // Angled Haunch Corbels framing the semi-circular Roman arch opening
            [-1, 1].forEach(hSide => {
                const haunch = new THREE.BoxGeometry(1.35, 1.15, 2.05);
                haunch.rotateZ(hSide * 0.48);
                haunch.rotateY(tangentRot);
                const hx = mx + Math.cos(-tangentRot) * hSide * (baySpan * 0.28);
                const hz = mz + Math.sin(-tangentRot) * hSide * (baySpan * 0.28);
                haunch.translate(hx, y0 + tierH - spandrelH - 0.25, hz);
                addTravertinePart(haunch, 0.88, 0.79, 0.64);
            });

            // Projecting Classical Entablature Cornice Band above each tier
            const cornice = new THREE.BoxGeometry(baySpan + 0.55, 0.42, 2.65);
            cornice.rotateY(tangentRot);
            cornice.translate(mx, y0 + tierH + 0.12, mz);
            addTravertinePart(cornice, 0.96, 0.88, 0.74);
        }

        // 4th-Story Colosseum Attic Wall with Corinthian Pilasters & Velarium Mast Brackets on preserved North Wing
        if (isNorthPreserved) {
            const atticH = 4.2;
            const yAttic = 3 * tierH;
            const atticWall = new THREE.BoxGeometry(baySpan + 0.45, atticH, 1.95);
            atticWall.rotateY(tangentRot);
            atticWall.translate(mx, yAttic + atticH * 0.5, mz);
            addTravertinePart(atticWall, 0.93, 0.84, 0.69);

            const atticCornice = new THREE.BoxGeometry(baySpan + 0.75, 0.55, 2.55);
            atticCornice.rotateY(tangentRot);
            atticCornice.translate(mx, yAttic + atticH + 0.22, mz);
            addTravertinePart(atticCornice, 0.97, 0.89, 0.75);
        }

        // 2. Interior Tiered Cavea Stadium Seating Wedges & Vomitoria Radial Walls (leaving 4 cardinal arena gates open!)
        const isArenaGate = (i === 0 || i === 4 || i === 8 || i === 12);
        if (!isArenaGate) {
            const innerR1 = 0.78, innerR2 = 0.62;
            const seat1 = new THREE.BoxGeometry(baySpan * 0.76, 3.2, 2.8);
            seat1.rotateX(0.32);
            seat1.rotateY(tangentRot);
            seat1.translate(mx * innerR1, 1.8, mz * innerR1);
            addTravertinePart(seat1, 0.84, 0.75, 0.60);

            const seat2 = new THREE.BoxGeometry(baySpan * 0.64, 2.2, 2.6);
            seat2.rotateX(0.28);
            seat2.rotateY(tangentRot);
            seat2.translate(mx * innerR2, 0.9, mz * innerR2);
            addTravertinePart(seat2, 0.86, 0.77, 0.62);

            // Collision circles for the interior stadium seating wedges so players & enemies don't walk through them
            pierCircles.push(
                { x: mx * innerR1, z: mz * innerR1, r: 2.15 },
                { x: mx * innerR2, z: mz * innerR2, r: 1.85 }
            );
        }
    }

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionCircles: pierCircles,
        walkablePlatforms: [
            { x: 0, z: 0, r: rxOuter + 1.0, y: arenaFloorH }
        ]
    };
    return merged;
}

// ============================================================================
// 5Z-5. Ancient Rome Pantheon (Octastyle Corinthian Portico, Cylindrical Drum & Stepped Oculus Dome)
// ============================================================================
function createRomanPantheonGeometry(rotundaR = 13.5) {
    const parts = [];
    const maxH = 20.5;

    const addPantheonPart = (geo, r = 0.92, g = 0.85, b = 0.73) => {
        tintBuildingPart(geo, r, g, b, maxH);
        applyWorldBoxUVs(geo, 0.25, 0.30);
        parts.push(geo);
    };

    const colCircles = [];

    // 0. Sub-Terrain Roman Concrete Foundation & Marble Floor Slab
    const foundH = 5.0;
    const found = new THREE.CylinderGeometry(rotundaR + 1.1, rotundaR + 1.4, foundH, 24);
    found.translate(0, -foundH * 0.5, 0);
    addPantheonPart(found, 0.82, 0.74, 0.62);

    const floorSlab = new THREE.CylinderGeometry(rotundaR + 0.9, rotundaR + 1.0, 0.45, 24);
    floorSlab.translate(0, 0.225, 0);
    addPantheonPart(floorSlab, 0.90, 0.84, 0.74);

    // 1. Cylindrical Roman Concrete/Brick & Travertine Rotunda Drum (hollow with front entrance portal!)
    const drumH = 11.2;
    const drumSegs = 16;
    for (let s = 0; s < drumSegs; s++) {
        const ang = (s / drumSegs) * Math.PI * 2.0;
        const nextAng = ((s + 1) / drumSegs) * Math.PI * 2.0;
        const midAng = (ang + nextAng) * 0.5;
        const mx = Math.cos(midAng) * rotundaR;
        const mz = Math.sin(midAng) * rotundaR;
        // Leave front portal (+Z, where mz > rotundaR * 0.90) open into the Rotunda!
        if (mz > rotundaR * 0.90 && Math.abs(mx) < 3.6) continue;

        const segLen = 2.0 * rotundaR * Math.sin(Math.PI / drumSegs) + 0.35;
        const rotY = -midAng + Math.PI * 0.5;
        const wall = new THREE.BoxGeometry(segLen, drumH, 1.65);
        wall.rotateY(rotY);
        wall.translate(mx, drumH * 0.5, mz);
        addPantheonPart(wall, 0.86, 0.74, 0.62);
        // Place 2 overlapping collision circles along each 5.3m wall segment so there are zero wall gaps!
        const a1 = ang + (nextAng - ang) * 0.25;
        const a2 = ang + (nextAng - ang) * 0.75;
        colCircles.push(
            { x: Math.cos(a1) * rotundaR, z: Math.sin(a1) * rotundaR, r: 1.48 },
            { x: Math.cos(a2) * rotundaR, z: Math.sin(a2) * rotundaR, r: 1.48 }
        );
    }

    // 2. 3 Horizontal Travertine Cornice Rings around the Rotunda Drum
    [0.45, 5.6, drumH].forEach(ry => {
        const ring = new THREE.CylinderGeometry(rotundaR + 0.65, rotundaR + 0.65, 0.48, 24);
        if (ry > 3.0) {
            ring.translate(0, ry, 0);
            addPantheonPart(ring, 0.95, 0.88, 0.76);
        }
    });

    // 3. Signature 6-Step Roman Saucer Dome Rings & Open Central Oculus
    for (let st = 0; st < 6; st++) {
        const sr = rotundaR * (1.0 - st * 0.08);
        const stepRing = new THREE.CylinderGeometry(sr - 0.4, sr, 0.62, 24);
        stepRing.translate(0, drumH + 0.24 + st * 0.58, 0);
        addPantheonPart(stepRing, 0.90, 0.83, 0.71);
    }
    const domeCupola = new THREE.CylinderGeometry(3.8, rotundaR * 0.54, 2.8, 24, 2, true);
    domeCupola.translate(0, drumH + 3.6 + 1.4, 0);
    addPantheonPart(domeCupola, 0.88, 0.82, 0.72);

    // 4. Intermediate Rectangular Vestibule Block + Octastyle Corinthian Portico (+Z)
    const portW = 19.0;
    const portZ = rotundaR + 5.2;
    const colH = 8.4;

    const portFound = new THREE.BoxGeometry(portW + 1.0, foundH + 0.45, 7.2);
    portFound.translate(0, (0.45 - foundH) * 0.5, rotundaR + 2.4);
    addPantheonPart(portFound, 0.88, 0.82, 0.72);

    // 8 Monolithic Egyptian Grey/Rose Granite Corinthian Columns across the front portico
    for (let i = 0; i < 8; i++) {
        const cx = -portW * 0.46 + (i / 7) * (portW * 0.92);
        const cz = portZ;
        colCircles.push({ x: cx, z: cz, r: 0.72 });

        const base = new THREE.BoxGeometry(1.15, 0.45, 1.15);
        base.translate(cx, 0.225, cz);
        addPantheonPart(base, 0.94, 0.88, 0.78);

        const shaft = new THREE.CylinderGeometry(0.46, 0.54, colH, 12);
        shaft.translate(cx, 0.45 + colH * 0.5, cz);
        addPantheonPart(shaft, (i % 2 === 0 ? 0.76 : 0.82), 0.72, 0.68);

        const corinthCap = new THREE.CylinderGeometry(0.68, 0.46, 0.75, 12);
        corinthCap.translate(cx, 0.45 + colH + 0.375, cz);
        addPantheonPart(corinthCap, 0.97, 0.92, 0.82);
    }

    // Portico Entablature (M·AGRIPPA frieze), Triangular Pediment & Pitched Portico Roof
    const entabY = 0.45 + colH + 0.75;
    const portEntab = new THREE.BoxGeometry(portW, 1.45, 6.4);
    portEntab.translate(0, entabY + 0.725, rotundaR + 2.4);
    addPantheonPart(portEntab, 0.95, 0.88, 0.76);

    const portRoof = createPitchedRoofGeometry(portW + 0.6, 6.8, 3.1);
    portRoof.translate(0, entabY + 1.45, rotundaR + 2.4);
    addPantheonPart(portRoof, 0.88, 0.76, 0.62);

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionCircles: colCircles,
        walkablePlatforms: [
            { x: 0, z: 0, r: rotundaR + 0.8, y: 0.45 },
            { minX: -(portW + 1.0) * 0.5, maxX: (portW + 1.0) * 0.5, minZ: rotundaR - 1.2, maxZ: rotundaR + 6.0, y: 0.45 }
        ]
    };
    return merged;
}

// ============================================================================
// 5Z-6. Ancient Rome Triple-Bay Monumental Triumphal Arch (Arch of Constantine / Septimius Severus)
// Features: Central & Flanking Vaulted Archways, 8 Detached Corinthian Columns on Tall Plinths,
// Sculpted Relief Medallions, Monumental Inscribed Attic Story, and 4 Pier Collision Boxes
// so Tanks, Soldiers, and Shells Pass Freely Through the Open Archways!
// ============================================================================
function createRomanTriumphalArchGeometry(w = 18.8, h = 15.2, d = 5.4) {
    const parts = [];
    const addArchPart = (geo, r = 0.94, g = 0.87, b = 0.75) => {
        tintBuildingPart(geo, r, g, b, h);
        applyWorldBoxUVs(geo, 0.26, 0.30);
        parts.push(geo);
    };

    // 4 Structural Piers defining 3 open vaulted archways:
    // Central archway: x in [-2.4, 2.4] (4.8m wide!)
    // Left archway:    x in [-6.8, -4.4] (2.4m wide!)
    // Right archway:   x in [ 4.4,  6.8] (2.4m wide!)
    const pierSpecs = [
        { minX: -w * 0.5, maxX: -6.8 },
        { minX: -4.4,     maxX: -2.4 },
        { minX:  2.4,     maxX:  4.4 },
        { minX:  6.8,     maxX:  w * 0.5 }
    ];
    const lowerH = 9.6;
    const foundH = 4.2;
    const collisionBoxes = [];

    pierSpecs.forEach(ps => {
        const pw = ps.maxX - ps.minX;
        const px = (ps.minX + ps.maxX) * 0.5;
        const pierFound = new THREE.BoxGeometry(pw + 0.2, foundH, d + 2.3);
        pierFound.translate(px, -foundH * 0.5, 0);
        addArchPart(pierFound, 0.86, 0.79, 0.67);

        const pier = new THREE.BoxGeometry(pw, lowerH, d);
        pier.translate(px, lowerH * 0.5, 0);
        addArchPart(pier, 0.93, 0.86, 0.74);
        // Extend Z to ±(d * 0.5 + 1.15) so the 8 projecting Corinthian column plinths are fully covered!
        collisionBoxes.push({ minX: ps.minX, maxX: ps.maxX, minZ: -d * 0.5 - 1.15, maxZ: d * 0.5 + 1.15 });

        // Detached Corinthian Columns on Sculpted Plinths on both Front (+Z) and Back (-Z) facades
        [-1, 1].forEach(zSide => {
            const cz = zSide * (d * 0.5 + 0.55);
            const plinth = new THREE.BoxGeometry(1.15, 2.3, 1.15);
            plinth.translate(px, 1.15, cz);
            addArchPart(plinth, 0.90, 0.82, 0.70);

            const col = new THREE.CylinderGeometry(0.38, 0.44, 6.2, 12);
            col.translate(px, 2.3 + 3.1, cz);
            addArchPart(col, 0.97, 0.91, 0.80);

            const cap = new THREE.CylinderGeometry(0.58, 0.38, 0.65, 12);
            cap.translate(px, 2.3 + 6.2 + 0.325, cz);
            addArchPart(cap, 0.98, 0.93, 0.82);
        });
    });

    // Side archway upper spandrels & circular Hadrianic relief medallions (above y = 5.6m)
    [-5.6, 5.6].forEach(sx => {
        const sideSpan = new THREE.BoxGeometry(2.6, lowerH - 5.4, d);
        sideSpan.translate(sx, 5.4 + (lowerH - 5.4) * 0.5, 0);
        addArchPart(sideSpan, 0.92, 0.85, 0.73);

        [-1, 1].forEach(zSide => {
            [-0.65, 0.65].forEach(mx => {
                const medallion = new THREE.CylinderGeometry(0.52, 0.52, 0.24, 12);
                medallion.rotateX(Math.PI * 0.5);
                medallion.translate(sx + mx, 7.6, zSide * (d * 0.5 + 0.08));
                addArchPart(medallion, 0.97, 0.90, 0.78);
            });
        });
    });

    // Central archway upper spandrel & keystone (above y = 7.4m so tanks & soldiers drive right through!)
    const centerSpan = new THREE.BoxGeometry(5.0, lowerH - 7.4, d);
    centerSpan.translate(0, 7.4 + (lowerH - 7.4) * 0.5, 0);
    addArchPart(centerSpan, 0.94, 0.87, 0.75);

    // Projecting Main Entablature Cornice & Tall Inscribed Roman Attic Story
    const mainCornice = new THREE.BoxGeometry(w + 1.4, 0.75, d + 1.6);
    mainCornice.translate(0, lowerH + 0.375, 0);
    addArchPart(mainCornice, 0.98, 0.92, 0.80);

    const atticH = h - lowerH - 0.75;
    const attic = new THREE.BoxGeometry(w + 0.4, atticH, d - 0.2);
    attic.translate(0, lowerH + 0.75 + atticH * 0.5, 0);
    addArchPart(attic, 0.95, 0.88, 0.76);

    // Central Inscribed Dedication Tablet & Crowning Cornice
    [-1, 1].forEach(zSide => {
        const tablet = new THREE.BoxGeometry(6.8, atticH * 0.68, 0.28);
        tablet.translate(0, lowerH + 0.75 + atticH * 0.5, zSide * (d * 0.5));
        addArchPart(tablet, 0.99, 0.94, 0.84);
    });

    const topCornice = new THREE.BoxGeometry(w + 1.1, 0.58, d + 0.8);
    topCornice.translate(0, h - 0.29, 0);
    addArchPart(topCornice, 0.98, 0.92, 0.80);

    const merged = mergeBufferGeometries(parts);
    merged.userData = {
        useMeshRaycastOnly: true,
        collisionBoxes: collisionBoxes
    };
    return merged;
}

var sharedSpruceGeo = null;
var sharedPineGeo = null;
var sharedDecidGeo = null;
var sharedBirchGeo = null;
var sharedCypressGeo = null;
var sharedWillowGeo = null;
var sharedLarchGeo = null;
var sharedJoshuaTreeGeo = null;
var sharedAgaveGeo = null;
var sharedPricklyPearGeo = null;
var sharedFlowerBushGeo = null;
var sharedFernGeo = null;
var sharedBushGeo = null;
var sharedRockGeo = null;
var sharedCottageGeo = null;
var sharedRuinGeo = null;
var sharedBarnGeo = null;
var sharedTownhouseGeo = null;
var sharedFarmhouseGeo = null;
var sharedAdobeHouseGeo = null;
var sharedChaletGeo = null;
var sharedStoneWallGeo = null;
var sharedPalmGeo = null;
var sharedPalmGeos = [];
var sharedAcaciaGeo = null;
var sharedCactusGeo = null;
var sharedCactusGeos = [];
var sharedSandstoneRockGeo = null;
var sharedMonumentRockGeo = null;
var sharedKasbahGeo = null;
var sharedDesertRuinGeo = null;
var sharedMountainRockGeo = null;
var sharedMountainBunkerGeo = null;
var sharedGreatPyramidGeo = null;
var sharedObeliskGeo = null;
var sharedEgyptColonnadeGeo = null;
var sharedMonumentButteGeo = null;
var sharedMonumentSpireGeo = null;
var sharedCanyonCliffGeo = null;
var sharedCanyonTowerGeo = null;
var sharedJungleTreeGeo = null;
var sharedJungleTreeGeos = null;
var sharedJungleTempleGeo = null;
var sharedGreekParthenonGeo = null;
var sharedGreekTholosGeo = null;
var sharedGreekStoaGeo = null;
var sharedRomanColosseumGeo = null;
var sharedRomanPantheonGeo = null;
var sharedRomanArchGeo = null;
var sharedSmokeTex = null;
var sharedFireTex = null;

function ensureSharedGeometries() {
    if (!sharedSpruceGeo) sharedSpruceGeo = createDetailedSpruceGeometry();
    if (!sharedPineGeo) sharedPineGeo = createDetailedPineGeometry();
    if (!sharedDecidGeo) sharedDecidGeo = createDetailedDeciduousGeometry();
    if (!sharedBirchGeo) sharedBirchGeo = createBirchTreeGeometry();
    if (!sharedCypressGeo) sharedCypressGeo = createCypressTreeGeometry();
    if (!sharedWillowGeo) sharedWillowGeo = createWillowTreeGeometry();
    if (!sharedLarchGeo) sharedLarchGeo = createAlpineLarchGeometry();
    if (!sharedJoshuaTreeGeo) sharedJoshuaTreeGeo = createJoshuaTreeGeometry();
    if (!sharedAgaveGeo) sharedAgaveGeo = createDesertAgaveGeometry();
    if (!sharedPricklyPearGeo) sharedPricklyPearGeo = createPricklyPearGeometry();
    if (!sharedFlowerBushGeo) sharedFlowerBushGeo = createWildflowerBushGeometry();
    if (!sharedFernGeo) sharedFernGeo = createFernClusterGeometry();
    if (!sharedBushGeo) sharedBushGeo = createDetailedBushGeometry();
    if (!sharedRockGeo) sharedRockGeo = createLimestoneRockGeometry();
    if (!sharedCottageGeo) sharedCottageGeo = createEuropeanCottageGeometry();
    if (!sharedRuinGeo) sharedRuinGeo = createRuinedHouseGeometry();
    if (!sharedBarnGeo) sharedBarnGeo = createBarnGeometry();
    if (!sharedTownhouseGeo) sharedTownhouseGeo = createVillageTownhouseGeometry();
    if (!sharedFarmhouseGeo) sharedFarmhouseGeo = createStoneFarmhouseGeometry();
    if (!sharedAdobeHouseGeo) sharedAdobeHouseGeo = createDesertAdobeHouseGeometry();
    if (!sharedChaletGeo) sharedChaletGeo = createAlpineChaletGeometry();
    if (!sharedStoneWallGeo) sharedStoneWallGeo = createStoneWallGeometry();
    if (!sharedPalmGeos || sharedPalmGeos.length === 0) {
        sharedPalmGeos = [
            createDatePalmGeometry(0),
            createDatePalmGeometry(1),
            createDatePalmGeometry(2),
            createDatePalmGeometry(3)
        ];
        sharedPalmGeo = sharedPalmGeos[0];
    } else if (!sharedPalmGeo) {
        sharedPalmGeo = sharedPalmGeos[0];
    }
    if (!sharedAcaciaGeo) sharedAcaciaGeo = createDesertAcaciaGeometry();
    if (!sharedCactusGeos || sharedCactusGeos.length === 0) {
        sharedCactusGeos = [
            createDesertCactusGeometry(0),
            createDesertCactusGeometry(1),
            createDesertCactusGeometry(2)
        ];
        sharedCactusGeo = sharedCactusGeos[0];
    } else if (!sharedCactusGeo) {
        sharedCactusGeo = sharedCactusGeos[0];
    }
    if (!sharedSandstoneRockGeo) sharedSandstoneRockGeo = createSandstoneRockGeometry(false);
    if (!sharedMonumentRockGeo) sharedMonumentRockGeo = createSandstoneRockGeometry(true);
    if (!sharedKasbahGeo) sharedKasbahGeo = createDesertKasbahGeometry();
    if (!sharedDesertRuinGeo) sharedDesertRuinGeo = createDesertRuinGeometry();
    if (!sharedMountainRockGeo) sharedMountainRockGeo = createMountainPeakCragGeometry();
    if (!sharedMountainBunkerGeo) sharedMountainBunkerGeo = createMountainBunkerGeometry();
    if (!sharedGreatPyramidGeo) sharedGreatPyramidGeo = createEgyptianGreatPyramidGeometry();
    if (!sharedObeliskGeo) sharedObeliskGeo = createEgyptianObeliskGeometry();
    if (!sharedEgyptColonnadeGeo) sharedEgyptColonnadeGeo = createEgyptianColonnadeGeometry();
    if (!sharedMonumentButteGeo) sharedMonumentButteGeo = createMonumentButteGeometry();
    if (!sharedMonumentSpireGeo) sharedMonumentSpireGeo = createMonumentSpireGeometry();
    if (!sharedCanyonCliffGeo) sharedCanyonCliffGeo = createCanyonCliffGeometry();
    if (!sharedCanyonTowerGeo) sharedCanyonTowerGeo = createCanyonTowerGeometry();
    if (!sharedJungleTreeGeo) sharedJungleTreeGeo = createJungleCanopyTreeGeometry(0);
    if (!sharedJungleTreeGeos) sharedJungleTreeGeos = [sharedJungleTreeGeo, createJungleCanopyTreeGeometry(1), createJungleCanopyTreeGeometry(2)];
    if (!sharedJungleStructGeos) sharedJungleStructGeos = {
        jungleRuinPyramid: createJungleRuinedPyramidGeometry(),
        jungleRoundTemple: createJungleRoundTempleGeometry(),
        jungleBallCourt: createJungleBallCourtGeometry(),
        junglePalace: createJunglePalaceGeometry(),
        jungleStelae: createJungleStelaeGeometry(),
        jungleHead: createJungleColossalHeadGeometry()
    };
    if (!sharedJungleTempleGeo) sharedJungleTempleGeo = createJungleTempleGeometry();
    if (!sharedGreekParthenonGeo) sharedGreekParthenonGeo = createGreekParthenonGeometry();
    if (!sharedGreekTholosGeo) sharedGreekTholosGeo = createGreekTholosGeometry();
    if (!sharedGreekStoaGeo) sharedGreekStoaGeo = createGreekStoaGeometry();
    if (!sharedRomanColosseumGeo) sharedRomanColosseumGeo = createRomanColosseumGeometry();
    if (!sharedRomanPantheonGeo) sharedRomanPantheonGeo = createRomanPantheonGeometry();
    if (!sharedRomanArchGeo) sharedRomanArchGeo = createRomanTriumphalArchGeometry();

    window.sharedGreatPyramidGeo = sharedGreatPyramidGeo;
    window.sharedObeliskGeo = sharedObeliskGeo;
    window.sharedEgyptColonnadeGeo = sharedEgyptColonnadeGeo;
    window.sharedMonumentButteGeo = sharedMonumentButteGeo;
    window.sharedMonumentSpireGeo = sharedMonumentSpireGeo;
    window.sharedCanyonCliffGeo = sharedCanyonCliffGeo;
    window.sharedCanyonTowerGeo = sharedCanyonTowerGeo;
    window.sharedJungleTreeGeo = sharedJungleTreeGeo;
    window.sharedJungleTempleGeo = sharedJungleTempleGeo;
    window.sharedGreekParthenonGeo = sharedGreekParthenonGeo;
    window.sharedGreekTholosGeo = sharedGreekTholosGeo;
    window.sharedGreekStoaGeo = sharedGreekStoaGeo;
    window.sharedRomanColosseumGeo = sharedRomanColosseumGeo;
    window.sharedRomanPantheonGeo = sharedRomanPantheonGeo;
    window.sharedRomanArchGeo = sharedRomanArchGeo;
    window.sharedSpruceGeo = sharedSpruceGeo;
    window.sharedPineGeo = sharedPineGeo;
    window.sharedDecidGeo = sharedDecidGeo;
    window.sharedBirchGeo = sharedBirchGeo;
    window.sharedCypressGeo = sharedCypressGeo;
    window.sharedWillowGeo = sharedWillowGeo;
    window.sharedLarchGeo = sharedLarchGeo;
    window.sharedJoshuaTreeGeo = sharedJoshuaTreeGeo;
    window.sharedAgaveGeo = sharedAgaveGeo;
    window.sharedPricklyPearGeo = sharedPricklyPearGeo;
    window.sharedFlowerBushGeo = sharedFlowerBushGeo;
    window.sharedFernGeo = sharedFernGeo;
    window.sharedBushGeo = sharedBushGeo;
    window.sharedRockGeo = sharedRockGeo;
    window.sharedCottageGeo = sharedCottageGeo;
    window.sharedBarnGeo = sharedBarnGeo;
    window.sharedTownhouseGeo = sharedTownhouseGeo;
    window.sharedFarmhouseGeo = sharedFarmhouseGeo;
    window.sharedAdobeHouseGeo = sharedAdobeHouseGeo;
    window.sharedChaletGeo = sharedChaletGeo;
    window.sharedRuinGeo = sharedRuinGeo;
    window.sharedPalmGeo = sharedPalmGeo;
    window.sharedPalmGeos = sharedPalmGeos;
    window.sharedAcaciaGeo = sharedAcaciaGeo;
    window.sharedCactusGeo = sharedCactusGeo;
    window.sharedCactusGeos = sharedCactusGeos;
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
    uSpawnZone: terrainUniforms.uSpawnZone,
    uBuildings: terrainUniforms.uBuildings,
    uBuildingCount: terrainUniforms.uBuildingCount,
    uSunDir: terrainUniforms.uSunDir,
    uSunColor: terrainUniforms.uSunColor,
    uSkyColor: terrainUniforms.uSkyColor,
    uLowGraphics: { value: 0.0 }
};

// 2 Orthogonal Crossed Botanical Tuft Geometry with Upward Normals (33% less overdraw & vertices than 3-plane!)
function createCrossedTuftGeometry() {
    const planes = [
        { ang: 0.0,  tilt: 0.08 },
        { ang: 1.5708, tilt: -0.08 }
    ];
    // Optimized lush WW2 meadow grass geometry (natural knee/track height)
    const w = 1.45;
    const h = 0.92;
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
    // Optimized distant billboard grass geometry
    const w = 1.55;
    const h = 0.94;
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
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.04,
        fog: false
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
        shader.uniforms.uSpawnZone = grassUniforms.uSpawnZone;
        shader.uniforms.uBuildings = grassUniforms.uBuildings;
        shader.uniforms.uBuildingCount = grassUniforms.uBuildingCount;
        shader.uniforms.uSunDir = grassUniforms.uSunDir;
        shader.uniforms.uSunColor = grassUniforms.uSunColor;
        shader.uniforms.uSkyColor = grassUniforms.uSkyColor;
        shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
        shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
        shader.uniforms.uSssStrength = (window.celestialLighting && window.celestialLighting.sssStrength)
            ? window.celestialLighting.sssStrength
            : { value: 1.0 };
        shader.uniforms.uPatchSize = { value: patchSize };
        shader.uniforms.uMinRadius = { value: minRadius };
        shader.uniforms.uMaxRadius = { value: maxRadius };
        shader.uniforms.uGrassAtlas = { value: getGrassTuftAtlas() };
        shader.uniforms.uGrassEdgeAtlas = { value: getGrassTuftEdgeAtlas() };
        shader.uniforms.uLowGraphics = grassUniforms.uLowGraphics;

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
            varying float vGrassDistCam;
            varying vec3 vTerrainNormalUp;
            varying vec4 vGrassZoneWeights;
            varying vec4 vGrassZoneWeightsExt;
            varying vec4 vGrassZoneWeightsExt2;
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
            float tuftRandom = fract(sin(dot(aInstanceData.xy, vec2(12.9898, 78.233))) * 43758.5453);

            // 1. Cheap early-outs FIRST (before the expensive zone/terrain math).
            // Rings overlap in a dithered cross-fade band: each tuft has a stable random value and is kept
            // with a probability that ramps down in the outer ring while ramping up in the next ring,
            // so LOD transitions blend with no hard line or popping.
            float fadeHalf = 4.0;
            float fadeRand = fract(tuftRandom * 17.13 + 0.31);
            float keepOut = 1.0 - smoothstep(uMaxRadius - fadeHalf, uMaxRadius + fadeHalf, distFromCam);
            float keepIn = (uMinRadius > 0.0) ? smoothstep(uMinRadius - fadeHalf, uMinRadius + fadeHalf, distFromCam) : 1.0;
            if (fadeRand >= keepOut || fadeRand >= keepIn) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            // Thin out oversized near-camera tufts (0..5m) to cut screen-filling overdraw
            if (distFromCam < 5.0 && fadeRand > mix(0.55, 1.0, smoothstep(1.5, 5.0, distFromCam))) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            // Camera Frustum Culling
            if (distFromCam > 10.0) {
                float viewDot = dot(normalize(relXZ), uCameraForwardXZ);
                if (viewDot < -0.10) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
            }

            float wGrass[12];
            getZoneWeights12_gpu(worldXZ, wGrass);
            vGrassZoneWeights = vec4(wGrass[0], wGrass[1], wGrass[2], wGrass[3]);
            vGrassZoneWeightsExt = vec4(wGrass[4], wGrass[5], wGrass[6], wGrass[7]);
            vGrassZoneWeightsExt2 = vec4(wGrass[8], wGrass[9], wGrass[10], wGrass[11]);
            int localZone = getZoneIndex12_gpu(wGrass);

            // 2. Terrain height & road/river/beach/building culling
            float roadMask = getRoadFactor_gpu(worldXZ.x, worldXZ.y);
            float roadCull = 1.0 - smoothstep(0.06, 0.36, roadMask);
            if (roadCull <= 0.01) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            float riverDistGrass = getRiverDistance_gpu(worldXZ.x, worldXZ.y);
            float riverCull = smoothstep(13.2, 18.5, riverDistGrass + (tuftRandom - 0.5) * 2.5);
            if (riverCull <= 0.01) {
                gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                return;
            }

            vec3 surfNorm;
            float groundY = getTerrainSurfaceHeight_gpu(worldXZ.x, worldXZ.y, surfNorm);
            vTerrainNormalUp = normalize(normalMatrix * surfNorm);

            float waterCull = smoothstep(-1.4, 0.5, groundY) * (1.0 - smoothstep(0.22, 0.38, 1.0 - surfNorm.y));
            float spawnCull = smoothstep(2.8, 5.5, length(worldXZ));


            // Zone-specific grass & scrub culling
            float zoneCull = 1.0;
            if (localZone == 1) {
                // Desert zone: dense around oasis shoreline, sparse desert scrub tufts on dry sand dunes
                if (groundY > -0.4 && tuftRandom > 0.14) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                zoneCull = (groundY > -0.4) ? 0.72 : 1.0;
            } else if (localZone == 2) {
                // Mountain zone: match terrain mesh 2.5m vertex-normal slope & snowline so grass covers all green areas and stops right at rock/snow
                float slopeEps = 2.5;
                float z2dSpawn = length(worldXZ);
                vec2 z2Center = floor(getZoneGrid_gpu(worldXZ) + 0.5) * 1600.0;
                float hPx_z2 = getZone2Height_gpu(worldXZ.x + slopeEps, worldXZ.y, z2dSpawn, getRoadDistance_gpu(worldXZ.x + slopeEps, worldXZ.y), 0.0, z2Center, 0.0, 1.0);
                float hMx_z2 = getZone2Height_gpu(worldXZ.x - slopeEps, worldXZ.y, z2dSpawn, getRoadDistance_gpu(worldXZ.x - slopeEps, worldXZ.y), 0.0, z2Center, 0.0, 1.0);
                float hPz_z2 = getZone2Height_gpu(worldXZ.x, worldXZ.y + slopeEps, z2dSpawn, getRoadDistance_gpu(worldXZ.x, worldXZ.y + slopeEps), 0.0, z2Center, 0.0, 1.0);
                float hMz_z2 = getZone2Height_gpu(worldXZ.x, worldXZ.y - slopeEps, z2dSpawn, getRoadDistance_gpu(worldXZ.x, worldXZ.y - slopeEps), 0.0, z2Center, 0.0, 1.0);
                vec3 realNorm = normalize(vec3(hMx_z2 - hPx_z2, 2.0 * slopeEps, hMz_z2 - hPz_z2));
                float realSlope = 1.0 - realNorm.y;
                float snowElevZ2 = groundY - realSlope * 11.5;
                float snowCull = 1.0 - smoothstep(62.0, 72.0, snowElevZ2);
                float rockSlopeCull = 1.0 - smoothstep(0.11, 0.145, realSlope);
                zoneCull = snowCull * rockSlopeCull;
                if (zoneCull <= 0.01) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
            } else if (localZone == 6) {
                // Monument Valley: sparse desert scrub
                if (tuftRandom > 0.16) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                zoneCull = 0.75;
            } else if (localZone == 7) {
                // Grand Canyon: arid scrub on plateaus and floor, cull on vertical canyon walls
                if (tuftRandom > 0.12) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                if (groundY > 3.8 && groundY < 16.8) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                zoneCull = 0.70;
            } else if (localZone == 8) {
                // Ancient Egypt: sparse on open dunes, lush near Nile / oasis
                if (groundY > -0.4 && tuftRandom > 0.12) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                zoneCull = (groundY > -0.4) ? 0.65 : 1.0;
            } else if (localZone == 9) {
                // Tropical Jungle: tall, lush jungle ferns and elephant grass
                zoneCull = 1.25;
            } else if (localZone == 10) {
                // Ancient Greece: Mediterranean olive-hill & garrigue grass
                if (groundY > 12.5 && tuftRandom > 0.42) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
                    return;
                }
                zoneCull = 0.88;
            } else if (localZone == 11) {
                // Ancient Rome: Sun-warmed Latium Campagna meadow grass
                zoneCull = 0.92;
            }

            float bldgCull = 1.0;
            for (int b = 0; b < 32; b++) {
                if (b >= uBuildingCount) break;
                float dB = length(worldXZ - uBuildings[b].xy);
                if (dB < uBuildings[b].z + 0.8) {
                    bldgCull = min(bldgCull, smoothstep(uBuildings[b].z - 0.2, uBuildings[b].z + 0.8, dB));
                }
            }

            float totalMask = roadCull * riverCull * waterCull * spawnCull * bldgCull;
            if (totalMask < 0.28) {
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
            flowerChance *= (1.0 - vGrassZoneWeights.y) * (1.0 - vGrassZoneWeightsExt.z) * (1.0 - vGrassZoneWeightsExt.w) * (1.0 - vGrassZoneWeightsExt2.x) * (1.0 - vGrassZoneWeightsExt2.y);
            float flowerColor = valueNoise2D_gpu(meadowPos * 0.035 + vec2(31.0, 17.0));
            float noPlumeZone = clamp(vGrassZoneWeights.y + vGrassZoneWeightsExt.z + vGrassZoneWeightsExt.w + vGrassZoneWeightsExt2.x + vGrassZoneWeightsExt2.y, 0.0, 1.0);
            float plumeThreshold = mix(mix(0.90, 0.50, areaFlowerMod), 1.0, noPlumeZone);

            float colIdx = aInstanceData.w < flowerChance
                ? (flowerColor < 0.0 ? 2.0 : 3.0)
                : (aInstanceData.w < plumeThreshold ? 0.0 : 1.0);
            // Sparse random gathering patches of extra species (atlas cols 4..9):
            // lupine, pampas grass, sunflower, lavender, poppy, cornflower.
            // Each species has its own low-frequency noise field; only the peaks above a high threshold
            // become a patch, so clusters are rare, randomly placed, and different per world seed.
            float speciesHeightMul = 1.0;
            float greenMeadowMask = (1.0 - vGrassZoneWeights.y) * (1.0 - vGrassZoneWeightsExt.x) * (1.0 - vGrassZoneWeightsExt.z) * (1.0 - vGrassZoneWeightsExt.w) * (1.0 - vGrassZoneWeightsExt2.x) * (1.0 - vGrassZoneWeightsExt2.y);
            if (greenMeadowMask > 0.5) {
                float speciesRand = fract(tuftRandom * 7.31 + aInstanceData.w * 3.17);
                for (int sp = 0; sp < 6; sp++) {
                    float fsp = float(sp);
                    // Pampas (sp==1) forms large, low-frequency stands; the rest are small, rare clusters
                    float freq = (sp == 1) ? 0.007 : (0.020 + 0.002 * fsp);
                    float thr = 0.925;
                    float pn = valueNoise2D_gpu(meadowPos * freq + vec2(113.0 + fsp * 57.0, 29.0 + fsp * 83.0)) * 0.5 + 0.5;
                    float inPatch = smoothstep(thr, thr + 0.03, pn);
                    float density = inPatch * ((sp == 1) ? 0.16 : 0.14);
                    if (speciesRand < density) {
                        colIdx = 4.0 + fsp;
                        speciesHeightMul = (sp == 2) ? 0.95 : ((sp == 0) ? 1.3 : ((sp == 1) ? 0.85 : 1.0));
                    }
                }
            }
            float heightPatch = valueNoise2D_gpu(meadowPos * 0.035 + vec2(13.0, 47.0)) * 0.5 + 0.5;
            float heightVar = (0.68 + 0.62 * tuftRandom) * (0.78 + 0.44 * heightPatch) * zoneCull * speciesHeightMul;
            vGrassAtlasUv = vec2(
                (colIdx + clamp(uv.x, 0.02, 0.98)) * 0.1,
                clamp(uv.y, 0.02, 0.98)
            );
            vGrassHeightFrac = uv.y;

            float windT = uTime * uWindSpeed;
            float wave1 = sin(worldXZ.x * 0.14 + worldXZ.y * 0.12 + windT * 2.4);
            float wave2 = (distFromCam < 65.0)
                ? cos(worldXZ.x * 0.35 - worldXZ.y * 0.28 + windT * 3.6) * 0.45 * (1.0 - smoothstep(48.0, 65.0, distFromCam))
                : 0.0;
            float windDistFade = 1.0 - smoothstep(140.0, 230.0, distFromCam) * 0.45;
            float windWave = (wave1 + wave2) * pow(max(uv.y, 0.0), 1.65) * 0.38 * windDistFade;

            vec3 localP = transformed;
            float distWidthBoost = 1.0 + smoothstep(32.0, 200.0, distFromCam) * 0.9;
            float outerTaper = (uMaxRadius > 120.0) ? (1.0 - smoothstep(uMaxRadius * 0.70, uMaxRadius, distFromCam) * 0.35) : 1.0;
            localP.xz *= (0.85 + 0.30 * sizeVar) * smoothstep(0.24, 0.65, totalMask) * distWidthBoost;
            localP.y *= (heightVar * totalMask * outerTaper);
            vGrassDistCam = distFromCam;

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
            uniform vec3 uCameraPos;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uSkyColor;
            uniform vec3 uSkyTopColor;
            uniform float uHazeStrength;
            uniform float uSssStrength;
            uniform float uLowGraphics;
            varying vec2 vGrassAtlasUv;
            varying vec3 vGrassWorldPos;
            varying float vGrassHeightFrac;
            varying float vGrassDistCam;
            varying vec3 vTerrainNormalUp;
            varying vec4 vGrassZoneWeights;
            varying vec4 vGrassZoneWeightsExt;
            varying vec4 vGrassZoneWeightsExt2;
            ${BABYLON_HAZE_GLSL}
        ` + shader.fragmentShader;

        // Blend grass normal from terrain up at the root toward camera/blade-facing on upper blades so sun-facing grass catches direct light
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_begin>',
            `
            #include <normal_fragment_begin>
            float bladeTilt = mix(0.15, 0.65, smoothstep(0.05, 0.75, vGrassHeightFrac));
            normal = normalize(mix(normalize(vTerrainNormalUp), normalize(vViewPosition), bladeTilt));
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            vec4 texelColor = texture2D(uGrassAtlas, vGrassAtlasUv);
            float alphaBoost = 1.0 + clamp(vGrassDistCam / 130.0, 0.0, 0.80);
            if (texelColor.a * alphaBoost < 0.40) discard;

            // Convert grass atlas from sRGB to linear space and lift green biomes slightly lighter
            vec3 bladeLinear = pow(max(texelColor.rgb, vec3(0.001)), vec3(2.2));
            float greenBiomeWeight = clamp(vGrassZoneWeights.x + vGrassZoneWeights.z + vGrassZoneWeights.w + vGrassZoneWeightsExt.y + vGrassZoneWeightsExt2.z * 0.5 + vGrassZoneWeightsExt2.w * 0.65, 0.0, 1.0);
            vec3 lighterBlade = bladeLinear * vec3(1.24, 1.36, 1.15) + vec3(0.012, 0.026, 0.005);
            bladeLinear = mix(bladeLinear, lighterBlade, greenBiomeWeight * 0.65);

            // Seamlessly blend bottom root of grass tuft into the zone's linear ground color
            float oasisF = 1.0 - smoothstep(-2.0, -0.3, vGrassWorldPos.y);
            float heatherH = smoothstep(9.5, 17.5, vGrassWorldPos.y);
            vec3 groundRootCol = vec3(0.028, 0.070, 0.014) * vGrassZoneWeights.x
                + mix(vec3(0.62, 0.52, 0.35), vec3(0.10, 0.22, 0.04), oasisF) * vGrassZoneWeights.y
                + vec3(0.024, 0.060, 0.015) * vGrassZoneWeights.z
                + mix(vec3(0.028, 0.068, 0.014), vec3(0.068, 0.052, 0.015), heatherH * 0.78) * vGrassZoneWeights.w
                + vec3(0.72, 0.78, 0.88) * vGrassZoneWeightsExt.x
                + vec3(0.022, 0.075, 0.016) * vGrassZoneWeightsExt.y
                + vec3(0.56, 0.20, 0.10) * vGrassZoneWeightsExt.z
                + vec3(0.38, 0.26, 0.17) * vGrassZoneWeightsExt.w
                + vec3(0.68, 0.50, 0.26) * vGrassZoneWeightsExt2.x
                + vec3(0.046, 0.052, 0.018) * vGrassZoneWeightsExt2.y
                + vec3(0.10, 0.11, 0.04) * vGrassZoneWeightsExt2.z
                + vec3(0.06, 0.10, 0.03) * vGrassZoneWeightsExt2.w;
            float bladeLuma = clamp(dot(bladeLinear, vec3(0.299, 0.587, 0.114)) * 2.35, 0.32, 1.45);
            float aridScrubFactor = vGrassZoneWeights.y + vGrassZoneWeightsExt.z + vGrassZoneWeightsExt.w + vGrassZoneWeightsExt2.x;
            vec3 dryDesertScrub = mix(vec3(0.55, 0.48, 0.30), vec3(0.48, 0.40, 0.22), vGrassHeightFrac) * bladeLuma;
            bladeLinear = mix(bladeLinear, mix(dryDesertScrub, bladeLinear, oasisF), clamp(aridScrubFactor, 0.0, 1.0));
            if (vGrassZoneWeights.y > 0.02) {
                // Desert zone lighter grass: sunlit pale golden straw dune scrub and fresh light oasis grass
                vec3 lightDesertGrass = mix(vec3(0.68, 0.60, 0.38), vec3(0.85, 0.78, 0.52), vGrassHeightFrac) * bladeLuma;
                vec3 lightOasisGrass = mix(vec3(0.14, 0.30, 0.08), vec3(0.28, 0.50, 0.15), vGrassHeightFrac) * bladeLuma;
                vec3 desertZoneGrass = mix(lightDesertGrass, lightOasisGrass, oasisF);
                bladeLinear = mix(bladeLinear, desertZoneGrass, vGrassZoneWeights.y * 0.95);
            }
            if (vGrassZoneWeightsExt.x > 0.05) {
                float snowBladeLuma = clamp(bladeLuma * 0.55 + 0.48, 0.60, 1.02);
                vec3 winterFrosted = mix(vec3(0.46, 0.50, 0.54), vec3(0.78, 0.84, 0.91), smoothstep(0.25, 0.88, vGrassHeightFrac)) * snowBladeLuma;
                bladeLinear = mix(bladeLinear, winterFrosted, vGrassZoneWeightsExt.x * 0.90);
            }
            if (vGrassZoneWeightsExt.z > 0.05) {
                vec3 redScrub = mix(vec3(0.36, 0.18, 0.09), vec3(0.28, 0.22, 0.11), vGrassHeightFrac) * bladeLuma;
                bladeLinear = mix(bladeLinear, redScrub, vGrassZoneWeightsExt.z * 0.85);
            }
            if (vGrassZoneWeightsExt2.x > 0.05) {
                vec3 egyptScrub = mix(vec3(0.42, 0.32, 0.15), vec3(0.32, 0.26, 0.12), vGrassHeightFrac) * bladeLuma;
                bladeLinear = mix(bladeLinear, egyptScrub, vGrassZoneWeightsExt2.x * 0.85);
            }
            if (vGrassZoneWeightsExt2.y > 0.05) {
                vec3 jungleBlade = mix(vec3(0.050, 0.085, 0.024), vec3(0.150, 0.190, 0.050), vGrassHeightFrac) * bladeLuma;
                // Patchy variety: dry straw-yellow elephant grass, olive fern, and deeper green pockets
                float jPatch = sin(vGrassWorldPos.x * 0.11 + vGrassWorldPos.z * 0.05) * cos(vGrassWorldPos.z * 0.09 - vGrassWorldPos.x * 0.04) * 0.5 + 0.5;
                float jFine = fract(sin(dot(floor(vGrassWorldPos.xz * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
                vec3 jungleStraw = mix(vec3(0.17, 0.13, 0.045), vec3(0.34, 0.27, 0.10), vGrassHeightFrac) * bladeLuma;
                vec3 jungleDeep  = mix(vec3(0.020, 0.050, 0.020), vec3(0.060, 0.120, 0.045), vGrassHeightFrac) * bladeLuma;
                jungleBlade = mix(jungleBlade, jungleStraw, smoothstep(0.55, 0.85, jPatch * 0.7 + jFine * 0.3) * 0.75);
                jungleBlade = mix(jungleBlade, jungleDeep, smoothstep(0.30, 0.10, jPatch) * 0.55);
                bladeLinear = mix(bladeLinear, jungleBlade, vGrassZoneWeightsExt2.y * 0.92);
            }
            if (vGrassZoneWeightsExt2.z > 0.05) {
                vec3 greeceBlade = mix(vec3(0.11, 0.14, 0.05), vec3(0.24, 0.26, 0.11), vGrassHeightFrac) * bladeLuma;
                bladeLinear = mix(bladeLinear, greeceBlade, vGrassZoneWeightsExt2.z * 0.72);
            }
            if (vGrassZoneWeightsExt2.w > 0.05) {
                vec3 romeBlade = mix(vec3(0.06, 0.13, 0.04), vec3(0.18, 0.24, 0.08), vGrassHeightFrac) * bladeLuma;
                bladeLinear = mix(bladeLinear, romeBlade, vGrassZoneWeightsExt2.w * 0.65);
            }
            float rootBlend = smoothstep(0.02, 0.36, vGrassHeightFrac);
            bladeLinear = mix(groundRootCol, bladeLinear, rootBlend);

            // Subsurface scattering from sunlight on blade edges & translucent upper blades
            vec3 viewDir = normalize(cameraPosition - vGrassWorldPos);
            vec3 sunDir = normalize(uSunDir);
            float backLight = pow(max(dot(-viewDir, sunDir), 0.0), 2.1);

            // Blade-contour edge mask + alpha rim + subtle upper blade translucency
            float edgeMask = smoothstep(0.18, 0.68, texture2D(uGrassEdgeAtlas, vGrassAtlasUv).r);
            float alphaRim = smoothstep(0.36, 0.48, texelColor.a) * (1.0 - smoothstep(0.58, 0.78, texelColor.a));
            float bladeInterior = smoothstep(0.66, 0.88, texelColor.a);
            float edgeOnly = clamp((edgeMask * 1.08 + alphaRim * 1.18) * (1.0 - bladeInterior * 0.78), 0.0, 1.0);
            float interiorTranslucency = bladeInterior * 0.22;

            // Fade backlight smoothly from lower stem to upper blade
            float heightWeight = smoothstep(0.12, 0.68, vGrassHeightFrac);
            float edgeAndTip = clamp((edgeOnly + interiorTranslucency) * heightWeight, 0.0, 1.0);

            // Multi-scale natural variety across meadow tufts
            float macroWave = sin(vGrassWorldPos.x * 0.08 + vGrassWorldPos.z * 0.07) * cos(vGrassWorldPos.x * 0.05 - vGrassWorldPos.z * 0.09) * 0.5 + 0.5;
            float microRand = fract(sin(dot(floor(vGrassWorldPos.xz * 2.8), vec2(12.9898, 78.233))) * 43758.5453);
            float sssVariety = mix(0.60, 1.38, macroWave * 0.65 + microRand * 0.35);

            vec3 sssColor = bladeLinear * 1.85 + uSunColor * (bladeLinear * 1.25 + vec3(0.03, 0.045, 0.01)) * 0.48;
            float distSssFade = 1.0 - smoothstep(50.0, 165.0, vGrassDistCam) * 0.70;
            vec3 grassSss = sssColor * backLight * edgeAndTip * sssVariety * 1.10 * distSssFade * uSssStrength;
            float grassAO = mix(mix(0.52, 0.58, vGrassZoneWeightsExt.x), 1.0, smoothstep(0.0, 0.58, vGrassHeightFrac));
            float distGroundBlend = smoothstep(70.0, 230.0, vGrassDistCam) * 0.60;
            vec3 farMeadowMatch = mix(groundRootCol * 1.45, vec3(0.088, 0.155, 0.036) * vGrassZoneWeights.x + groundRootCol * (1.0 - vGrassZoneWeights.x), 0.65);
            vec3 finalBlade = mix(bladeLinear * grassAO, farMeadowMatch, distGroundBlend);

            diffuseColor.rgb = finalBlade;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `
            #include <lights_fragment_end>
            #if ( NUM_POINT_LIGHTS > 0 )
                IncidentLight grassPointLight;
                #pragma unroll_loop_start
                for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
                    getPointDirectLightIrradiance( pointLights[ i ], geometry, grassPointLight );
                    if ( grassPointLight.visible ) {
                        float horizCatch = max(0.0, 0.75 - max(dot(geometry.normal, grassPointLight.direction), 0.0));
                        reflectedLight.directDiffuse += grassPointLight.color * diffuseColor.rgb * horizCatch * RECIPROCAL_PI;
                    }
                }
                #pragma unroll_loop_end
            #endif
            #if ( NUM_SPOT_LIGHTS > 0 )
                IncidentLight grassSpotLight;
                #pragma unroll_loop_start
                for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
                    getSpotDirectLightIrradiance( spotLights[ i ], geometry, grassSpotLight );
                    if ( grassSpotLight.visible ) {
                        float horizCatch = max(0.0, 0.80 - max(dot(geometry.normal, grassSpotLight.direction), 0.0));
                        reflectedLight.directDiffuse += grassSpotLight.color * diffuseColor.rgb * horizCatch * RECIPROCAL_PI;
                    }
                }
                #pragma unroll_loop_end
            #endif
            reflectedLight.directSpecular *= 0.04;
            reflectedLight.indirectSpecular *= 0.04;
            float sssShadow = 1.0;
            #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
                if ( receiveShadow && uLowGraphics < 0.5 ) {
                    DirectionalLightShadow sssDirShadow = directionalLightShadows[ 0 ];
                    sssShadow = getShadow(
                        directionalShadowMap[ 0 ],
                        sssDirShadow.shadowMapSize,
                        sssDirShadow.shadowBias,
                        sssDirShadow.shadowRadius,
                        vDirectionalShadowCoord[ 0 ]
                    );
                    #if NUM_DIR_LIGHT_SHADOWS > 1
                        DirectionalLightShadow sssDirShadow1 = directionalLightShadows[ 1 ];
                        float sssShadow1 = getShadow(
                            directionalShadowMap[ 1 ],
                            sssDirShadow1.shadowMapSize,
                            sssDirShadow1.shadowBias,
                            sssDirShadow1.shadowRadius,
                            vDirectionalShadowCoord[ 1 ]
                        );
                        sssShadow = min( sssShadow, sssShadow1 );
                    #endif
                }
            #endif
            float _grassCloudLit = sampleCloudShadowFactor(vGrassWorldPos, uCloudSunDir, uCloudTime, uCloudTex, uCloudShadowParams);
            totalEmissiveRadiance += grassSss * sssShadow * _grassCloudLit;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',
            `
            gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vGrassWorldPos, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
            #include <tonemapping_fragment>
            `
        );

        injectCloudShadowFragment(shader, 'vGrassWorldPos');
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
const VIEW_RADIUS = 5; // 11x11 = 121 chunks (400m radius) + FarTerrainRing out to 4500m
const UNLOAD_RADIUS = 6; // Hysteresis buffer: only dispose chunks when player is >= 6 chunks (480m) away

const _tvLushGrass = new THREE.Color(0x283e1c);
const _tvDryGrass  = new THREE.Color(0x565026);
const _tvSunlitGrass = new THREE.Color(0x405828);
const _tvMudRoad   = new THREE.Color(0x2a2016);
const _tvWetRut    = new THREE.Color(0x16100a);
const _tvCliffRock = new THREE.Color(0x524e48);
const _tvMountain  = new THREE.Color(0x3a4048);
const _tvDesertSand = new THREE.Color(0x9e744e);
const _tvDesertDune = new THREE.Color(0xb88c62);
const _tvSandstone  = new THREE.Color(0x7c5238);
const _tvDesertOasisGrass = new THREE.Color(0x426624);
const _tvAlpineSnow = new THREE.Color(0x8c9aa8);
const _tvHeather    = new THREE.Color(0x5a421e);
const _tvTempCol = new THREE.Color();
const _tvTempDirtCol = new THREE.Color();
const _tvScratchA = new THREE.Color();
const _tvScratchB = new THREE.Color();

function sampleTerrainVertexColor(wx, wz, wy, n, outArr, offset) {
    const slope = 1.0 - n.y;
    const fieldNoise = fbm3((wx + seedOffset.x) * 0.014, (wz + seedOffset.z) * 0.014) * 0.5 + 0.5;
    const roadF = getRoadFactor(wx, wz);
    const weights = getZoneWeights(wx, wz);
    let red = 0, green = 0, blue = 0;

    for (let currentZoneIndex = 0; currentZoneIndex < weights.length; currentZoneIndex++) {
        if (weights[currentZoneIndex] === 0) continue;
        if (currentZoneIndex === 1) {
            _tvTempCol.copy(_tvDesertSand).lerp(_tvDesertDune, smoothstep(0.20, 0.80, fieldNoise));
            if (wy < -0.3) {
                const oasisGreenery = 1.0 - smoothstep(-1.9, -0.3, wy);
                _tvTempCol.lerp(_tvDesertOasisGrass, oasisGreenery * 0.85);
            }
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0x6e4b2a);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.06) {
                _tvTempCol.lerp(_tvSandstone, Math.min(1.0, (slope - 0.06) * 5.0));
            }
        } else if (currentZoneIndex === 2) {
            _tvTempCol.copy(_tvLushGrass).lerp(_tvSunlitGrass, smoothstep(0.15, 0.65, fieldNoise) * 0.65);
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0x3a3e44);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            const subalpineRock = Math.max(
                slope > 0.04 ? Math.min(1.0, (slope - 0.04) * 7.5) : 0.0,
                wy > 16.0 ? Math.min(1.0, (wy - 16.0) / 14.0) : 0.0
            );
            if (subalpineRock > 0.0) {
                _tvTempCol.lerp(_tvMountain, subalpineRock);
            }
            if (wy > 62.0) {
                const snowBlend = Math.min(1.0, (wy - 62.0) / 28.0) * (1.0 - smoothstep(0.06, 0.16, slope) * 0.85);
                _tvTempCol.lerp(_tvAlpineSnow, snowBlend);
            }
        } else if (currentZoneIndex === 3) {
            _tvTempCol.copy(_tvLushGrass).lerp(_tvSunlitGrass, smoothstep(0.10, 0.60, fieldNoise) * 0.75);
            _tvTempCol.lerp(_tvDryGrass, smoothstep(0.55, 0.92, fieldNoise) * 0.78);
            if (wy > 8.5) {
                _tvTempCol.lerp(_tvHeather, Math.min(1.0, (wy - 8.5) / 8.5) * 0.75);
            }
            if (roadF > 0.01) {
                const distFromCenter = getRoadDistance(wx, wz);
                const rutDist = Math.abs(distFromCenter - 1.35);
                const isRut = rutDist < 0.55 ? 0.75 : 0.0;
                _tvTempDirtCol.copy(_tvMudRoad).lerp(_tvWetRut, isRut);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.06) {
                _tvTempCol.lerp(_tvCliffRock, Math.min(1.0, (slope - 0.06) * 5.5));
            }
        } else if (currentZoneIndex === 4) {
            _tvTempCol.setHex(0x8494a6).lerp(_tvAlpineSnow, smoothstep(0.15, 0.75, fieldNoise));
            if (roadF > 0.01) {
                const distFromCenter = getRoadDistance(wx, wz);
                const rutDist = Math.abs(distFromCenter - 1.35);
                const isRut = rutDist < 0.55 ? 0.85 : 0.0;
                _tvTempDirtCol.setHex(0x424850).lerp(_tvScratchA.setHex(0x24282c), isRut);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.05) {
                _tvTempCol.lerp(_tvScratchA.setHex(0x38342e), Math.min(1.0, (slope - 0.05) * 5.0));
            }
            if (slope > 0.14) {
                _tvTempCol.lerp(_tvMountain, Math.min(1.0, (slope - 0.14) * 5.5));
            }
        } else if (currentZoneIndex === 5) {
            _tvTempCol.setHex(0x365820).lerp(_tvLushGrass, smoothstep(0.12, 0.65, fieldNoise));
            _tvTempCol.lerp(_tvSunlitGrass, smoothstep(0.60, 0.95, fieldNoise) * 0.6);
            if (roadF > 0.01) {
                const distFromCenter = getRoadDistance(wx, wz);
                const rutDist = Math.abs(distFromCenter - 1.35);
                const isRut = rutDist < 0.55 ? 0.85 : 0.0;
                _tvTempDirtCol.setHex(0x423220).lerp(_tvScratchA.setHex(0x24180e), isRut);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.16) {
                _tvTempCol.lerp(_tvScratchA.setHex(0x4c3c28), Math.min(1.0, (slope - 0.16) * 4.0));
            }
        } else if (currentZoneIndex === 6) {
            _tvTempCol.setHex(0xb44426).lerp(_tvScratchA.setHex(0xd46842), smoothstep(0.15, 0.75, fieldNoise));
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0x8c341b);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.14) {
                _tvTempCol.lerp(_tvScratchA.setHex(0x7a220e), Math.min(1.0, (slope - 0.14) * 4.2));
            }
        } else if (currentZoneIndex === 7) {
            _tvTempCol.setHex(0x8c5438).lerp(_tvScratchA.setHex(0xa86e50), smoothstep(0.15, 0.75, fieldNoise));
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0x5c3420);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.12) {
                _tvTempCol.lerp(_tvScratchA.setHex(0x6e2a18), Math.min(1.0, (slope - 0.12) * 4.5));
            }
        } else if (currentZoneIndex === 8) {
            _tvTempCol.setHex(0xd4aa66).lerp(_tvScratchA.setHex(0xebb874), smoothstep(0.12, 0.70, fieldNoise));
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0xa07842);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.16) {
                _tvTempCol.lerp(_tvScratchA.setHex(0xc29c60), Math.min(1.0, (slope - 0.16) * 4.0));
            }
        } else if (currentZoneIndex === 9) {
            _tvTempCol.setHex(0x1e421a).lerp(_tvScratchA.setHex(0x2d6824), smoothstep(0.10, 0.65, fieldNoise));
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0x381e0e);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.15) {
                _tvTempCol.lerp(_tvScratchA.setHex(0x3c4832), Math.min(1.0, (slope - 0.15) * 4.2));
            }
        } else if (currentZoneIndex === 10) {
            _tvTempCol.setHex(0x5c6838).lerp(_tvScratchA.setHex(0xa89268), smoothstep(0.32, 0.85, fieldNoise));
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0xd2c4aa);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.14) {
                _tvTempCol.lerp(_tvScratchA.setHex(0xdcd4c4), Math.min(1.0, (slope - 0.14) * 4.2));
            }
        } else if (currentZoneIndex === 11) {
            _tvTempCol.setHex(0x465c2c).lerp(_tvScratchA.setHex(0x7c7040), smoothstep(0.35, 0.88, fieldNoise));
            if (roadF > 0.01) {
                _tvTempDirtCol.setHex(0x52504c);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.15) {
                _tvTempCol.lerp(_tvScratchA.setHex(0xc2b092), Math.min(1.0, (slope - 0.15) * 4.2));
            }
        } else {
            _tvTempCol.copy(_tvLushGrass).lerp(_tvSunlitGrass, smoothstep(0.10, 0.60, fieldNoise) * 0.75);
            _tvTempCol.lerp(_tvDryGrass, smoothstep(0.58, 0.94, fieldNoise) * 0.82);
            if (roadF > 0.01) {
                const distFromCenter = getRoadDistance(wx, wz);
                const rutDist = Math.abs(distFromCenter - 1.35);
                const isRut = rutDist < 0.55 ? 0.75 : 0.0;
                _tvTempDirtCol.copy(_tvMudRoad).lerp(_tvWetRut, isRut);
                _tvTempCol.lerp(_tvTempDirtCol, Math.min(1.0, roadF * 1.1));
            }
            if (slope > 0.22) {
                _tvTempCol.lerp(_tvCliffRock, Math.min(1.0, (slope - 0.22) * 4.5));
            }
            if (wy > 12.0) {
                _tvTempCol.lerp(_tvMountain, Math.min(1.0, (wy - 12.0) / 12.0) * 0.75);
            }
        }
        red += _tvTempCol.r * weights[currentZoneIndex];
        green += _tvTempCol.g * weights[currentZoneIndex];
        blue += _tvTempCol.b * weights[currentZoneIndex];
    }
    const riverDist = getRiverDistance(wx, wz);
    if (riverDist < 23.0 && Math.hypot(wx, wz) > 26.0) {
        const rivZoneF = 1.0 - smoothstep(13.5, 23.0, riverDist);
        const bankNoise = fbm3((wx + seedOffset.x) * 0.035, (wz + seedOffset.z) * 0.035) * 0.5 + 0.5;
        const sandCol = _tvScratchA.setHex(0xb89464);
        const cobbleCol = _tvScratchB.setHex(0x6e6a62);
        _tvTempCol.copy(sandCol).lerp(cobbleCol, smoothstep(0.32, 0.72, bankNoise));
        if (wy < -1.8) {
            const wetF = 1.0 - smoothstep(-2.8, -1.8, wy);
            _tvTempCol.lerp(_tvTempDirtCol.setHex(0x282620), wetF * 0.72);
        }
        red = mix(red, _tvTempCol.r, rivZoneF * 0.85);
        green = mix(green, _tvTempCol.g, rivZoneF * 0.85);
        blue = mix(blue, _tvTempCol.b, rivZoneF * 0.85);
    }
    outArr[offset] = red;
    outArr[offset + 1] = green;
    outArr[offset + 2] = blue;
}

// Non-blocking asynchronous chunk streaming queue
var chunkLoadQueue = [];
var chunkLoadSet = new Set();
var chunkUnloadQueue = [];

/**
 * Computes the deterministic tree count for a terrain chunk, concentrating trees into forest patches and leaving clearings open.
 */
function getChunkTargetTreeCount(chunkCenterX, chunkCenterZ, forestNoise, zoneIdx, isVillage, isMobile, rng) {
    let count = 0;

    if (zoneIdx === 1) {
        const [zx, zz] = getZoneCenter(chunkCenterX, chunkCenterZ);
        const distFromOasis = Math.hypot(chunkCenterX - zx - 58.0, chunkCenterZ - zz - 78.0);
        if (distFromOasis < 95.0) count = 10 + Math.floor(rng() * 7);
        else if (isVillage) count = 3 + Math.floor(rng() * 3);
        else if (forestNoise > 0.54) count = 4 + Math.floor(rng() * 4);
        else count = rng() < 0.35 ? 1 : 0;
    } else if (zoneIdx === 2) {
        if (isVillage) count = 3 + Math.floor(rng() * 3);
        else if (forestNoise > 0.48) count = 24 + Math.floor(rng() * 14);
        else if (forestNoise > 0.38) count = 6 + Math.floor(rng() * 6);
        else count = rng() < 0.35 ? 1 : 0;
    } else if (zoneIdx === 3) {
        if (isVillage) count = 4 + Math.floor(rng() * 3);
        else if (forestNoise > 0.49) count = 22 + Math.floor(rng() * 12);
        else if (forestNoise > 0.38) count = 6 + Math.floor(rng() * 5);
        else count = rng() < 0.30 ? 1 : 0;
    } else if (zoneIdx === 6) {
        count = isVillage ? (1 + Math.floor(rng() * 3)) : (forestNoise > 0.54 ? (4 + Math.floor(rng() * 4)) : (rng() < 0.4 ? 1 : 0));
    } else if (zoneIdx === 8) {
        count = isVillage ? (5 + Math.floor(rng() * 4)) : (forestNoise > 0.50 ? (8 + Math.floor(rng() * 6)) : (1 + Math.floor(rng() * 2)));
    } else if (zoneIdx === 9) {
        if (isVillage) count = 15 + Math.floor(rng() * 6);
        else if (forestNoise > 0.38) count = 34 + Math.floor(rng() * 12);
        else count = 18 + Math.floor(rng() * 8);
    } else if (zoneIdx === 10 || zoneIdx === 11) {
        if (isVillage) count = 5 + Math.floor(rng() * 4);
        else if (forestNoise > 0.48) count = 18 + Math.floor(rng() * 10);
        else if (forestNoise > 0.36) count = 5 + Math.floor(rng() * 4);
        else count = rng() < 0.35 ? 1 : 0;
    } else {
        if (isVillage) count = 3 + Math.floor(rng() * 3);
        else if (forestNoise > 0.49) count = 24 + Math.floor(rng() * 14);
        else if (forestNoise > 0.38) count = 6 + Math.floor(rng() * 5);
        else count = rng() < 0.30 ? 1 : 0;
    }

    return isMobile ? Math.ceil(count * 0.45) : count;
}

/**
 * Generates 1–3 grove anchor centers within a chunk so trees merge into large forests.
 */
function createChunkTreeGroves(xMin, zMin, targetTreeCount, rng) {
    if (targetTreeCount <= 0) return [];
    const groveCount = targetTreeCount >= 22 ? 3 : (targetTreeCount >= 10 ? 2 : 1);
    const groves = [];
    for (let g = 0; g < groveCount; g++) {
        groves.push({
            x: xMin + (0.15 + rng() * 0.70) * CHUNK_SIZE,
            z: zMin + (0.15 + rng() * 0.70) * CHUNK_SIZE
        });
    }
    return groves;
}

/**
 * Picks a clustered tree position around a chunk grove center (or [null, null] if rejected in an open clearing).
 */
function pickClusteredTreePosition(xMin, zMin, groves, isVillage, zoneIdx, rng) {
    let tx, tz;
    if (!isVillage && groves.length > 0 && rng() < 0.88) {
        const grove = groves[Math.floor(rng() * groves.length)];
        const angle = rng() * Math.PI * 2;
        const maxRadius = groves.length >= 3 ? 25.0 : (groves.length === 2 ? 19.0 : 14.0);
        const radius = 2.0 + Math.pow(rng(), 0.75) * maxRadius;
        tx = Math.max(xMin + 3.0, Math.min(xMin + CHUNK_SIZE - 3.0, grove.x + Math.cos(angle) * radius));
        tz = Math.max(zMin + 3.0, Math.min(zMin + CHUNK_SIZE - 3.0, grove.z + Math.sin(angle) * radius));
    } else {
        tx = xMin + (0.06 + rng() * 0.88) * CHUNK_SIZE;
        tz = zMin + (0.06 + rng() * 0.88) * CHUNK_SIZE;
        if (!isVillage && zoneIdx !== 9) {
            const localForest = fbm3((tx + seedOffset.x) * 0.0045, (tz + seedOffset.z) * 0.0045) * 0.5 + 0.5;
            if (localForest < 0.42 && rng() < 0.70) return [null, null];
        }
    }
    return [tx, tz];
}

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
        this.extraPlantMeshes = [];

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

        const xMin = this.cx * CHUNK_SIZE;
        const zMin = this.cz * CHUNK_SIZE;
        let minWy = Infinity;

        for (let i = 0; i < count; i++) {
            const lx = pos.getX(i);
            const lz = pos.getZ(i);
            const wx = xMin + lx + CHUNK_SIZE * 0.5;
            const wz = zMin + lz + CHUNK_SIZE * 0.5;
            const wy = getTerrainHeight(wx, wz);
            if (wy < minWy) minWy = wy;
            let meshY = wy;
            if (wy < -2.90) {
                const submergeDepth = smoothstep(-2.90, -3.80, wy);
                meshY -= submergeDepth * 1.2;
            }

            pos.setXYZ(i, lx, meshY, lz);

            const n = getTerrainNormal(wx, wz);
            sampleTerrainVertexColor(wx, wz, wy, n, colors, i * 3);
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        this.hasWater = (minWy < -1.8);
        this.waterBounds = new THREE.Box3(
            new THREE.Vector3(xMin, -12, zMin),
            new THREE.Vector3(xMin + CHUNK_SIZE, -1.5, zMin + CHUNK_SIZE)
        );
        this.terrainMesh = new THREE.Mesh(geo, terrainMat);
        this.terrainMesh.position.set(xMin + CHUNK_SIZE * 0.5, 0, zMin + CHUNK_SIZE * 0.5);
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.layers.enable(2);
        this.terrainMesh.updateMatrix();
        this.terrainMesh.matrixAutoUpdate = false;
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
        const currentZoneIndex = getZoneIndexAt(chunkCenterX, chunkCenterZ);
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
                { rx: -15, rz: 15, type: isWestVillage ? 'ruin' : 'townhouse', rot: 1.25, scale: 0.98 },
                { rx: 18, rz: 16, type: isWestVillage ? 'farmhouse' : 'barn', rot: -1.15, scale: 1.02 },
                { rx: 0, rz: 2, type: isCrossroadsVillage ? 'townhouse' : 'farmhouse', rot: 0.12, scale: 1.0 },
                { rx: -1, rz: -26, type: 'wall', rot: 0.05, scale: 1.0 },
                { rx: 1, rz: 26, type: 'wall', rot: 0.08, scale: 1.0 }
            ];

            villageTemplates.forEach((struct, idx) => {
                let bx = chunkCenterX + struct.rx + (rng() - 0.5) * 4.0;
                let bz = chunkCenterZ + struct.rz + (rng() - 0.5) * 4.0;
                bx = THREE.MathUtils.clamp(bx, xMin + 8, xMin + CHUNK_SIZE - 8);
                bz = THREE.MathUtils.clamp(bz, zMin + 8, zMin + CHUNK_SIZE - 8);
                if (Math.hypot(bx, bz) < 32) return; // Keep spawn pad clear
                if (Math.hypot(bx - (-18), bz - 112) < 24) return; // Don't duplicate signature landmark
                if (Math.hypot(bx - (-19), bz - 22) < 20) return; // Don't duplicate signature rock

                const baseBy = getTerrainHeight(bx, bz);
                const norm = getTerrainNormal(bx, bz);
                const minNormY = (currentZoneIndex === 2) ? 0.80 : 0.85;
                if (baseBy < -1.8 || getRiverDistance(bx, bz) < 20.0 || norm.y < minNormY || (currentZoneIndex === 2 && baseBy > 16.5)) return;
                const by = Math.max(
                    baseBy,
                    getTerrainHeight(bx - 2.6, bz - 2.6),
                    getTerrainHeight(bx + 2.6, bz - 2.6),
                    getTerrainHeight(bx - 2.6, bz + 2.6),
                    getTerrainHeight(bx + 2.6, bz + 2.6)
                );

                let bldgGeo, height, isRuin = false, isWall = false, resolvedType = struct.type;
                if (currentZoneIndex === 1) {
                    // Desert Kasbah, Adobe House & Mud-Brick Settlement
                    if (struct.type === 'cottage' || struct.type === 'townhouse') {
                        bldgGeo = sharedKasbahGeo;
                        height = 6.8 * struct.scale;
                        resolvedType = 'kasbah';
                    } else if (struct.type === 'barn' || struct.type === 'farmhouse') {
                        bldgGeo = sharedAdobeHouseGeo || sharedKasbahGeo;
                        height = 4.6 * struct.scale;
                        resolvedType = 'adobe';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedDesertRuinGeo;
                        height = 4.2 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                } else if (currentZoneIndex === 2) {
                    // Alpine Mountain Timber Chalets, Stone Farmhouses & Bunkers
                    if (struct.type === 'cottage' || struct.type === 'barn') {
                        bldgGeo = sharedChaletGeo || sharedCottageGeo;
                        height = 7.4 * struct.scale;
                        resolvedType = 'chalet';
                    } else if (struct.type === 'farmhouse') {
                        bldgGeo = sharedFarmhouseGeo || sharedCottageGeo;
                        height = 6.4 * struct.scale;
                        resolvedType = 'farmhouse';
                    } else if (struct.type === 'townhouse') {
                        bldgGeo = (idx % 2 === 0 && sharedChaletGeo) ? sharedChaletGeo : sharedMountainBunkerGeo;
                        height = 6.2 * struct.scale;
                        resolvedType = (bldgGeo === sharedChaletGeo) ? 'chalet' : 'bunker';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedRuinGeo;
                        height = 4.2 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                } else if (currentZoneIndex === 6) {
                    // Arizona Monument Valley: Natural Red Sandstone Mitten Buttes, Hoodoo Spires & Stratified Outcrops (Zero Buildings)
                    if (struct.type === 'townhouse' || struct.type === 'cottage') {
                        bldgGeo = (idx % 2 === 0) ? sharedMonumentButteGeo : sharedMonumentSpireGeo;
                        height = (bldgGeo === sharedMonumentButteGeo ? 26.5 : 29.0) * struct.scale;
                        resolvedType = (bldgGeo === sharedMonumentButteGeo) ? 'butte' : 'spire';
                    } else if (struct.type === 'farmhouse' || struct.type === 'barn') {
                        bldgGeo = (idx % 2 === 0) ? sharedMonumentSpireGeo : sharedMonumentRockGeo;
                        height = (bldgGeo === sharedMonumentSpireGeo ? 22.0 : 4.8) * struct.scale;
                        resolvedType = (bldgGeo === sharedMonumentSpireGeo) ? 'spire' : 'rock';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedMonumentSpireGeo || sharedMonumentRockGeo;
                        height = 18.0 * struct.scale;
                        isRuin = true;
                        resolvedType = 'spire';
                    } else {
                        bldgGeo = sharedMonumentRockGeo;
                        height = 3.2 * struct.scale;
                        isWall = false;
                        resolvedType = 'rock';
                    }
                } else if (currentZoneIndex === 7) {
                    // Grand Canyon: Stepped Canyon Promontories, Cliff Towers, and Sandstone Boulders
                    if (struct.type === 'townhouse' || struct.type === 'cottage') {
                        bldgGeo = (idx % 2 === 0) ? sharedCanyonCliffGeo : sharedCanyonTowerGeo;
                        height = 17.0 * struct.scale;
                        resolvedType = 'canyonCliff';
                    } else if (struct.type === 'farmhouse' || struct.type === 'barn') {
                        bldgGeo = sharedCanyonTowerGeo || sharedMonumentRockGeo;
                        height = 16.0 * struct.scale;
                        resolvedType = 'canyonTower';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedCanyonTowerGeo || sharedMonumentRockGeo;
                        height = 12.0 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedMonumentRockGeo;
                        height = 3.0 * struct.scale;
                        isWall = false;
                        resolvedType = 'rock';
                    }
                } else if (currentZoneIndex === 8) {
                    // Ancient Egypt: Hypostyle Colonnades, Monolithic Obelisks, Desert Kasbahs & Ruins (Giza Pyramids placed in static landmarks)
                    if (struct.type === 'townhouse') {
                        const farFromGizaTriad = Math.hypot(bx - (-18), bz - 112) > 110 && Math.hypot(bx - 58, bz - 142) > 110 && Math.hypot(bx - (-74), bz - 146) > 110;
                        bldgGeo = (isProceduralVillage && idx === 2 && farFromGizaTriad) ? sharedGreatPyramidGeo : sharedEgyptColonnadeGeo;
                        height = (bldgGeo === sharedGreatPyramidGeo ? 26.5 : 8.2) * struct.scale;
                        resolvedType = (bldgGeo === sharedGreatPyramidGeo) ? 'pyramid' : 'colonnade';
                    } else if (struct.type === 'cottage') {
                        bldgGeo = (idx % 2 === 0) ? sharedObeliskGeo : sharedEgyptColonnadeGeo;
                        height = (bldgGeo === sharedObeliskGeo ? 17.5 : 8.2) * struct.scale;
                        resolvedType = (bldgGeo === sharedObeliskGeo) ? 'obelisk' : 'colonnade';
                    } else if (struct.type === 'barn' || struct.type === 'farmhouse') {
                        bldgGeo = sharedKasbahGeo || sharedAdobeHouseGeo;
                        height = 6.8 * struct.scale;
                        resolvedType = 'kasbah';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedEgyptColonnadeGeo || sharedDesertRuinGeo;
                        height = 8.0 * struct.scale;
                        isRuin = true;
                        resolvedType = 'ruin';
                    } else {
                        bldgGeo = sharedSandstoneRockGeo;
                        height = 2.8 * struct.scale;
                        isWall = false;
                        resolvedType = 'rock';
                    }
                } else if (currentZoneIndex === 9) {
                    // Tropical Jungle: varied ancient Mesoamerican-style sites (pyramids, round temples, ball courts, palaces, stelae, colossal heads)
                    const jSel = hash2D(this.cx * 3.7 + idx * 1.9, this.cz * 5.3 + idx * 0.7);
                    const jPool = (struct.type === 'ruin') ? JUNGLE_POOL_RUIN : JUNGLE_POOL_MAJOR;
                    if (struct.type === 'townhouse' || struct.type === 'cottage' || struct.type === 'barn' || struct.type === 'farmhouse' || struct.type === 'ruin') {
                        const jKey = pickJungleStruct(jSel, jPool);
                        bldgGeo = getJungleStructGeo(jKey);
                        height = JUNGLE_STRUCT_H[jKey] * struct.scale;
                        resolvedType = jKey;
                        if (struct.type === 'ruin') isRuin = true;
                    } else {
                        bldgGeo = sharedRockGeo;
                        height = 2.6 * struct.scale;
                        isWall = false;
                        resolvedType = 'rock';
                    }
                } else if (currentZoneIndex === 10) {
                    // Ancient Greece: Acropolis Parthenon Temples, Delphi Tholos Rotundas, Agora Stoas & Classical Houses
                    if (struct.type === 'townhouse') {
                        bldgGeo = (isProceduralVillage && idx === 2) ? sharedGreekParthenonGeo : sharedGreekTholosGeo;
                        height = (bldgGeo === sharedGreekParthenonGeo ? 14.5 : 11.8) * struct.scale;
                        resolvedType = (bldgGeo === sharedGreekParthenonGeo) ? 'parthenon' : 'tholos';
                    } else if (struct.type === 'cottage') {
                        bldgGeo = (idx % 2 === 0) ? sharedGreekStoaGeo : sharedGreekTholosGeo;
                        height = (bldgGeo === sharedGreekStoaGeo ? 8.6 : 11.8) * struct.scale;
                        resolvedType = (bldgGeo === sharedGreekStoaGeo) ? 'stoa' : 'tholos';
                    } else if (struct.type === 'barn' || struct.type === 'farmhouse') {
                        bldgGeo = sharedGreekStoaGeo || sharedFarmhouseGeo;
                        height = 8.6 * struct.scale;
                        resolvedType = 'stoa';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedGreekStoaGeo;
                        height = 8.6 * struct.scale;
                        isRuin = true;
                        resolvedType = 'stoa';
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                } else if (currentZoneIndex === 11) {
                    // Ancient Rome: Roman Pantheon Temples, Monumental Triumphal Arches, Basilica Porticos & Roman Villas
                    if (struct.type === 'townhouse') {
                        bldgGeo = (isProceduralVillage && idx === 2) ? sharedRomanColosseumGeo : sharedRomanPantheonGeo;
                        height = (bldgGeo === sharedRomanColosseumGeo ? 21.0 : 20.5) * struct.scale;
                        resolvedType = (bldgGeo === sharedRomanColosseumGeo) ? 'colosseum' : 'pantheon';
                    } else if (struct.type === 'cottage') {
                        bldgGeo = (idx % 2 === 0) ? sharedRomanArchGeo : sharedRomanPantheonGeo;
                        height = (bldgGeo === sharedRomanArchGeo ? 15.2 : 20.5) * struct.scale;
                        resolvedType = (bldgGeo === sharedRomanArchGeo) ? 'romanArch' : 'pantheon';
                    } else if (struct.type === 'barn' || struct.type === 'farmhouse') {
                        bldgGeo = (idx % 2 === 0) ? sharedGreekStoaGeo : (sharedTownhouseGeo || sharedFarmhouseGeo);
                        height = 8.6 * struct.scale;
                        resolvedType = (bldgGeo === sharedGreekStoaGeo) ? 'stoa' : 'townhouse';
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedRomanArchGeo;
                        height = 15.2 * struct.scale;
                        isRuin = true;
                        resolvedType = 'romanArch';
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                } else {
                    // Meadow & Rolling Hills: European Cottages, Townhouses, Stone Farmhouses & Barns
                    if (struct.type === 'cottage') {
                        bldgGeo = sharedCottageGeo;
                        height = 6.6 * struct.scale;
                    } else if (struct.type === 'townhouse') {
                        bldgGeo = sharedTownhouseGeo || sharedCottageGeo;
                        height = 9.0 * struct.scale;
                    } else if (struct.type === 'farmhouse') {
                        bldgGeo = sharedFarmhouseGeo || sharedCottageGeo;
                        height = 6.5 * struct.scale;
                    } else if (struct.type === 'barn') {
                        bldgGeo = sharedBarnGeo;
                        height = 7.5 * struct.scale;
                    } else if (struct.type === 'ruin') {
                        bldgGeo = sharedRuinGeo;
                        height = 4.2 * struct.scale;
                        isRuin = true;
                    } else {
                        bldgGeo = sharedStoneWallGeo;
                        height = 1.4 * struct.scale;
                        isWall = true;
                    }
                }

                // Enterable houses use 5-point max `by` so their interior floor is never buried;
                // Monuments, ruins, and colonnades have deep sub-terrain foundations and sit at `baseBy` so their steps are never floating!
                const placeBy = (bldgGeo && bldgGeo.userData && bldgGeo.userData.enterableSpec) ? by : baseBy;

                let chosenBldgMat = villageMat;
                if (currentZoneIndex === 6) chosenBldgMat = monumentRockMat;
                else if (currentZoneIndex === 7) chosenBldgMat = canyonRockMat;
                else if (currentZoneIndex === 8 && (bldgGeo === sharedGreatPyramidGeo || bldgGeo === sharedObeliskGeo || bldgGeo === sharedEgyptColonnadeGeo || bldgGeo === sharedSandstoneRockGeo)) chosenBldgMat = egyptSandstoneMat;
                else if (currentZoneIndex === 9) chosenBldgMat = jungleTempleMat;
                else if (currentZoneIndex === 10 && (bldgGeo === sharedGreekParthenonGeo || bldgGeo === sharedGreekTholosGeo || bldgGeo === sharedGreekStoaGeo)) chosenBldgMat = greekMarbleMat;
                else if (currentZoneIndex === 11 && (bldgGeo === sharedRomanColosseumGeo || bldgGeo === sharedRomanPantheonGeo || bldgGeo === sharedRomanArchGeo || bldgGeo === sharedGreekStoaGeo)) chosenBldgMat = romanTravertineMat;
                const bMesh = new THREE.Mesh(bldgGeo, chosenBldgMat);
                bMesh.position.set(bx, placeBy - 0.15, bz);
                bMesh.rotation.y = (bldgGeo === sharedGreatPyramidGeo) ? 0.18 : (struct.rot + (rng() - 0.5) * 0.25);
                bMesh.scale.setScalar(struct.scale);
                bMesh.castShadow = true;
                bMesh.receiveShadow = true;
                this.group.add(bMesh);

                this.raycastMeshes.push(bMesh);
                aimRaycastMeshes.push(bMesh);

                const bldgObj = attachObstacleBox({
                    mesh: bMesh,
                    x: bx,
                    y: placeBy,
                    z: bz,
                    height: height,
                    isRuin: isRuin,
                    isWall: isWall,
                    type: resolvedType
                }, bldgGeo, struct.scale, bMesh.rotation.y);
                this.buildings.push(bldgObj);
                worldBuildings.push(bldgObj);
                worldObstacles.push(bldgObj);
            });
        } else if (distFromSpawn > 35 && rng() < 0.36) {
            // Roadside Landmark, Outcrop, Homestead, Chalet, Kasbah, or Temple along road verges
            const roadDistCenter = getRoadDistance(chunkCenterX, chunkCenterZ);
            if (roadDistCenter < 38) {
                const sideSign = (rng() > 0.5) ? 1 : -1;
                let hx = chunkCenterX + sideSign * (14.0 + rng() * 8.0);
                let hz = chunkCenterZ + (rng() - 0.5) * 18.0;
                hx = THREE.MathUtils.clamp(hx, xMin + 8, xMin + CHUNK_SIZE - 8);
                hz = THREE.MathUtils.clamp(hz, zMin + 8, zMin + CHUNK_SIZE - 8);
                const canPlaceRoadside = Math.hypot(hx, hz) >= 32
                    && Math.hypot(hx - (-18), hz - 112) >= 24
                    && Math.hypot(hx - (-19), hz - 22) >= 20;
                const baseHy = canPlaceRoadside ? getTerrainHeight(hx, hz) : -999;
                const norm = canPlaceRoadside ? getTerrainNormal(hx, hz) : null;

                if (canPlaceRoadside && baseHy > -1.8 && getRiverDistance(hx, hz) >= 20.0 && norm && norm.y > 0.84 && (currentZoneIndex !== 2 || baseHy < 15.5)) {
                    const hy = Math.max(
                        baseHy,
                        getTerrainHeight(hx - 2.6, hz - 2.6),
                        getTerrainHeight(hx + 2.6, hz - 2.6),
                        getTerrainHeight(hx - 2.6, hz + 2.6),
                        getTerrainHeight(hx + 2.6, hz + 2.6)
                    );
                    const roll = rng();
                    let bType = 'cottage';
                    let bldgGeo = sharedCottageGeo;
                    let roadsideMat = villageMat;
                    let allowWall = true;
                    if (currentZoneIndex === 1) {
                        if (roll < 0.18) { bType = 'ruin'; bldgGeo = sharedDesertRuinGeo; }
                        else if (roll < 0.60) { bType = 'adobe'; bldgGeo = sharedAdobeHouseGeo || sharedKasbahGeo; }
                        else { bType = 'kasbah'; bldgGeo = sharedKasbahGeo; }
                    } else if (currentZoneIndex === 2) {
                        if (roll < 0.18) { bType = 'ruin'; bldgGeo = sharedRuinGeo; }
                        else if (roll < 0.65) { bType = 'chalet'; bldgGeo = sharedChaletGeo || sharedCottageGeo; }
                        else if (roll < 0.85) { bType = 'farmhouse'; bldgGeo = sharedFarmhouseGeo || sharedCottageGeo; }
                        else { bType = 'bunker'; bldgGeo = sharedMountainBunkerGeo; }
                    } else if (currentZoneIndex === 6) {
                        roadsideMat = monumentRockMat;
                        allowWall = false;
                        if (roll < 0.55) { bType = 'spire'; bldgGeo = sharedMonumentSpireGeo; }
                        else { bType = 'rock'; bldgGeo = sharedMonumentRockGeo; }
                    } else if (currentZoneIndex === 7) {
                        roadsideMat = canyonRockMat;
                        allowWall = false;
                        if (roll < 0.55) { bType = 'canyonTower'; bldgGeo = sharedCanyonTowerGeo; }
                        else { bType = 'rock'; bldgGeo = sharedMonumentRockGeo; }
                    } else if (currentZoneIndex === 8) {
                        allowWall = false;
                        if (roll < 0.42) { bType = 'obelisk'; bldgGeo = sharedObeliskGeo; roadsideMat = egyptSandstoneMat; }
                        else if (roll < 0.76) { bType = 'colonnade'; bldgGeo = sharedEgyptColonnadeGeo; roadsideMat = egyptSandstoneMat; }
                        else { bType = 'kasbah'; bldgGeo = sharedKasbahGeo; roadsideMat = villageMat; }
                    } else if (currentZoneIndex === 9) {
                        roadsideMat = jungleTempleMat;
                        allowWall = false;
                        bType = pickJungleStruct(roll, JUNGLE_POOL_ROADSIDE);
                        bldgGeo = getJungleStructGeo(bType);
                    } else if (currentZoneIndex === 10) {
                        roadsideMat = greekMarbleMat;
                        allowWall = false;
                        if (roll < 0.52) { bType = 'tholos'; bldgGeo = sharedGreekTholosGeo; }
                        else { bType = 'stoa'; bldgGeo = sharedGreekStoaGeo; }
                    } else if (currentZoneIndex === 11) {
                        roadsideMat = romanTravertineMat;
                        allowWall = false;
                        if (roll < 0.55) { bType = 'romanArch'; bldgGeo = sharedRomanArchGeo; }
                        else { bType = 'pantheon'; bldgGeo = sharedRomanPantheonGeo; }
                    } else {
                        if (roll < 0.18) { bType = 'ruin'; bldgGeo = sharedRuinGeo; }
                        else if (roll < 0.42) { bType = 'cottage'; bldgGeo = sharedCottageGeo; }
                        else if (roll < 0.66) { bType = 'farmhouse'; bldgGeo = sharedFarmhouseGeo || sharedCottageGeo; }
                        else if (roll < 0.84) { bType = 'townhouse'; bldgGeo = sharedTownhouseGeo || sharedCottageGeo; }
                        else { bType = 'barn'; bldgGeo = sharedBarnGeo; }
                    }
                    const placeHy = (bldgGeo && bldgGeo.userData && bldgGeo.userData.enterableSpec) ? hy : baseHy;
                    const bScale = 0.95 + rng() * 0.25;
                    const bMesh = new THREE.Mesh(bldgGeo, roadsideMat);
                    bMesh.position.set(hx, placeHy - 0.15, hz);
                    bMesh.rotation.y = rng() * Math.PI * 2;
                    bMesh.scale.setScalar(bScale);
                    bMesh.castShadow = true;
                    bMesh.receiveShadow = true;
                    this.group.add(bMesh);

                    this.raycastMeshes.push(bMesh);
                    aimRaycastMeshes.push(bMesh);

                    const bldgObj = attachObstacleBox({
                        mesh: bMesh,
                        x: hx,
                        y: placeHy,
                        z: hz,
                        height: (bType === 'spire' ? 24.0 : bType === 'pantheon' ? 20.5 : bType === 'obelisk' ? 17.5 : bType === 'romanArch' ? 15.2 : (JUNGLE_STRUCT_H[bType] || 0) > 0 ? JUNGLE_STRUCT_H[bType] : bType === 'tholos' ? 11.8 : bType === 'stoa' ? 8.6 : bType === 'colonnade' ? 8.2 : bType === 'ruin' ? 4.2 : (bType === 'townhouse' ? 9.0 : (bType === 'barn' ? 7.5 : 6.6))) * bScale,
                        isRuin: (bType === 'ruin'),
                        type: bType
                    }, bldgGeo, bScale, bMesh.rotation.y);
                    this.buildings.push(bldgObj);
                    worldBuildings.push(bldgObj);
                    worldObstacles.push(bldgObj);

                    // Add an attached stone wall border for homestead zones only
                    if (allowWall && rng() < 0.60) {
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
                        const wallObj = attachObstacleBox({ mesh: wMesh, x: wx, y: wy, z: wz, height: 1.4 * bScale, isRuin: false, isWall: true, type: 'wall' }, sharedStoneWallGeo, bScale, wMesh.rotation.y);
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
        const rockProb = (currentZoneIndex === 6 || currentZoneIndex === 7) ? (isMobile ? 0.65 : 0.94)
                       : (currentZoneIndex === 2 || currentZoneIndex === 4) ? (isMobile ? 0.55 : 0.90)
                       : (currentZoneIndex === 1 || currentZoneIndex === 3 || currentZoneIndex === 5 || currentZoneIndex === 8 || currentZoneIndex === 10 || currentZoneIndex === 11) ? (isMobile ? 0.45 : 0.80)
                       : (isMobile ? 0.35 : 0.70);
        const maxExtraRocks = (currentZoneIndex === 6 || currentZoneIndex === 7) ? (isMobile ? 2 : 4)
                            : (currentZoneIndex === 2 || currentZoneIndex === 4) ? (isMobile ? 2 : 3)
                            : (isMobile ? 1 : 2);
        const rockCount = (distFromSpawn > 20 && (!isVillage || currentZoneIndex === 6 || currentZoneIndex === 7) && rng() < rockProb)
            ? (1 + Math.floor(rng() * maxExtraRocks))
            : 0;

        const zoneRockGeo = (currentZoneIndex === 6 || currentZoneIndex === 7) ? sharedMonumentRockGeo
                          : (currentZoneIndex === 1 || currentZoneIndex === 8) ? sharedSandstoneRockGeo
                          : (currentZoneIndex === 2 || currentZoneIndex === 4) ? sharedMountainRockGeo
                          : sharedRockGeo;
        const zoneRockMat = (currentZoneIndex === 1) ? desertRockMat
                          : (currentZoneIndex === 8) ? egyptSandstoneMat
                          : (currentZoneIndex === 6) ? monumentRockMat
                          : (currentZoneIndex === 7) ? canyonRockMat
                          : (currentZoneIndex === 9) ? jungleRockMat
                          : (currentZoneIndex === 10) ? greekMarbleMat
                          : (currentZoneIndex === 11) ? romanTravertineMat
                          : (currentZoneIndex === 2 || currentZoneIndex === 4) ? mountainRockMat
                          : rockMat;

        for (let r = 0; r < rockCount; r++) {
            let rx = xMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            let rz = zMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            if (Math.hypot(rx, rz) < 26) continue;
            if (Math.hypot(rx - (-19), rz - 22) < 18) continue;
            if (getRoadFactor(rx, rz) > 0.25) continue;
            if (getRiverDistance(rx, rz) < 11.0) continue;
            const ry = getTerrainHeight(rx, rz);
            if (ry < -2.0) continue;
            if (currentZoneIndex === 2 && ry > 65.0) continue;

            const rs = (currentZoneIndex === 6 || currentZoneIndex === 7 ? 1.25 : currentZoneIndex === 2 ? 1.15 : 1.0) + rng() * (currentZoneIndex === 6 ? 0.85 : 0.50);
            const rockMesh = new THREE.Mesh(zoneRockGeo, zoneRockMat);
            rockMesh.position.set(rx, ry - 0.2, rz);
            rockMesh.rotation.y = rng() * Math.PI * 2;
            rockMesh.scale.set(rs, rs, rs);
            rockMesh.castShadow = true;
            rockMesh.receiveShadow = true;
            this.group.add(rockMesh);

            this.raycastMeshes.push(rockMesh);
            aimRaycastMeshes.push(rockMesh);

            const rockObj = attachObstacleCircle({
                mesh: rockMesh,
                x: rx,
                y: ry,
                z: rz,
                height: 4.4 * rs,
                type: 'rock',
                isRock: true,
                isRuin: false
            }, zoneRockGeo, rs, rockMesh.rotation.y);
            this.rocks.push(rockObj);
            worldObstacles.push(rockObj);
            worldBuildings.push(rockObj);
        }

        // ---------------------------------------------------------------------
        // 3. ZONE-SPECIFIC BOTANICAL FLORA (PALMS/CACTI, ALPINE CONIFERS, WOODLANDS)
        // ---------------------------------------------------------------------
        const forestNoise = fbm3((chunkCenterX + seedOffset.x) * 0.0022, (chunkCenterZ + seedOffset.z) * 0.0022) * 0.5 + 0.5;
        const targetTreeCount = getChunkTargetTreeCount(chunkCenterX, chunkCenterZ, forestNoise, currentZoneIndex, isVillage, isMobile, rng);
        const treeGroves = createChunkTreeGroves(xMin, zMin, targetTreeCount, rng);

        for (let t = 0; t < targetTreeCount; t++) {
            const [tx, tz] = pickClusteredTreePosition(xMin, zMin, treeGroves, isVillage, currentZoneIndex, rng);
            if (tx === null) continue;

            if (Math.hypot(tx, tz) < 20) continue; // Keep spawn clear
            if (getRoadFactor(tx, tz) > 0.20) continue; // Keep roads clear
            if (getRiverDistance(tx, tz) < 13.0) continue; // Keep river channel & cobble shore clear

            let collidesBuilding = false;
            for (let b = 0; b < this.buildings.length; b++) {
                const bldg = this.buildings[b];
                if (Math.hypot(tx - bldg.x, tz - bldg.z) < bldg.radius + 1.8) {
                    collidesBuilding = true;
                    break;
                }
            }
            if (!collidesBuilding && zoneStaticBuildings) {
                for (let b = 0; b < zoneStaticBuildings.length; b++) {
                    const bldg = zoneStaticBuildings[b];
                    if (Math.hypot(tx - bldg.x, tz - bldg.z) < (bldg.radius || 18.0) + 2.5) {
                        collidesBuilding = true;
                        break;
                    }
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
                // Desert: Varied Date Palms near oasis/villages/low wadis, Saguaro Cacti, Joshua Trees, & Umbrella Acacias
                const nearOasis = Math.hypot(tx - 58.0, tz - 78.0) < 88.0;
                if (nearOasis || isVillage || (ty < 1.8 && treeRoll < 0.65)) {
                    if (treeRoll < 0.78 || nearOasis) {
                        const pVar = Math.floor(rng() * (sharedPalmGeos.length || 1));
                        treeGeo = (sharedPalmGeos && sharedPalmGeos[pVar]) ? sharedPalmGeos[pVar] : sharedPalmGeo;
                        treeType = 'palm';
                        trunkH = (pVar === 1 ? 13.8 : pVar === 3 ? 7.8 : pVar === 2 ? 10.2 : 11.5);
                    } else {
                        treeGeo = sharedAcaciaGeo;
                        treeType = 'acacia';
                        trunkH = 7.8;
                    }
                } else {
                    if (treeRoll < 0.48) {
                        const cVar = Math.floor(rng() * (sharedCactusGeos.length || 1));
                        treeGeo = (sharedCactusGeos && sharedCactusGeos[cVar]) ? sharedCactusGeos[cVar] : sharedCactusGeo;
                        treeType = 'cactus';
                        trunkH = (cVar === 1 ? 5.8 : cVar === 2 ? 4.4 : 4.8);
                        chosenMat = cactusMat;
                        useTreeDepth = false;
                    } else if (treeRoll < 0.74 && sharedJoshuaTreeGeo) {
                        treeGeo = sharedJoshuaTreeGeo;
                        treeType = 'joshua';
                        trunkH = 6.2;
                    } else {
                        treeGeo = sharedAcaciaGeo;
                        treeType = 'acacia';
                        trunkH = 7.8;
                    }
                }
            } else if (currentZoneIndex === 2) {
                // Alpine Mountains: Nordic Spruce, Alpine Larch, Scots Pine, and Silver Birch in valleys
                if (treeRoll < 0.48) {
                    treeGeo = sharedSpruceGeo;
                    treeType = 'spruce';
                    trunkH = 14.2;
                } else if (treeRoll < 0.72 && sharedLarchGeo) {
                    treeGeo = sharedLarchGeo;
                    treeType = 'larch';
                    trunkH = 13.2;
                } else if (treeRoll < 0.90) {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.5;
                } else {
                    treeGeo = sharedBirchGeo || sharedDecidGeo;
                    treeType = 'birch';
                    trunkH = 10.6;
                }
            } else if (currentZoneIndex === 3) {
                // Rolling Hills: Broadleaf Oak/Beech, Silver Birch, Mediterranean Cypress, and Scots Pine
                if (treeRoll < 0.36) {
                    treeGeo = sharedDecidGeo;
                    treeType = 'beech';
                    trunkH = 10.2;
                } else if (treeRoll < 0.56 && sharedBirchGeo) {
                    treeGeo = sharedBirchGeo;
                    treeType = 'birch';
                    trunkH = 10.6;
                } else if (treeRoll < 0.72 && sharedCypressGeo) {
                    treeGeo = sharedCypressGeo;
                    treeType = 'cypress';
                    trunkH = 13.5;
                } else if (treeRoll < 0.88) {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.5;
                } else {
                    treeGeo = sharedSpruceGeo;
                    treeType = 'spruce';
                    trunkH = 14.2;
                }
            } else if (currentZoneIndex === 4) {
                // Ardennes Winter: Dense frosted Scots Pine & Nordic Spruce evergreen forests
                if (treeRoll < 0.55) {
                    treeGeo = sharedSpruceGeo;
                    treeType = 'spruce';
                    trunkH = 14.2;
                } else if (treeRoll < 0.85) {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.5;
                } else {
                    treeGeo = sharedBirchGeo || sharedDecidGeo;
                    treeType = 'birch';
                    trunkH = 10.6;
                }
            } else if (currentZoneIndex === 5) {
                // Normandy Bocage: Apple orchards, broadleaf Oak/Beech hedgerows, and Cypress windbreaks
                if (treeRoll < 0.48) {
                    treeGeo = sharedDecidGeo;
                    treeType = 'beech';
                    trunkH = 10.2;
                } else if (treeRoll < 0.74 && sharedBirchGeo) {
                    treeGeo = sharedBirchGeo;
                    treeType = 'birch';
                    trunkH = 10.6;
                } else if (treeRoll < 0.88 && sharedCypressGeo) {
                    treeGeo = sharedCypressGeo;
                    treeType = 'cypress';
                    trunkH = 13.5;
                } else {
                    treeGeo = sharedWillowGeo || sharedDecidGeo;
                    treeType = 'willow';
                    trunkH = 9.8;
                }
            } else if (currentZoneIndex === 6) {
                // Monument Valley: Desert Joshua Trees, Acacias, Saguaro Cacti & Agaves
                if (treeRoll < 0.42 && sharedJoshuaTreeGeo) {
                    treeGeo = sharedJoshuaTreeGeo;
                    treeType = 'joshua';
                    trunkH = 6.2;
                } else if (treeRoll < 0.70 && sharedAcaciaGeo) {
                    treeGeo = sharedAcaciaGeo;
                    treeType = 'acacia';
                    trunkH = 7.8;
                } else if (sharedCactusGeo) {
                    treeGeo = sharedCactusGeo;
                    treeType = 'cactus';
                    trunkH = 4.8;
                    chosenMat = cactusMat;
                    useTreeDepth = false;
                } else {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 11.0;
                }
            } else if (currentZoneIndex === 7) {
                // Grand Canyon: Cliff Pinyon Pines, Utah Junipers, Desert Acacias & Mountain Scrub
                if (treeRoll < 0.52) {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.0;
                } else if (treeRoll < 0.78 && sharedLarchGeo) {
                    treeGeo = sharedLarchGeo;
                    treeType = 'larch';
                    trunkH = 11.5;
                } else if (sharedAcaciaGeo) {
                    treeGeo = sharedAcaciaGeo;
                    treeType = 'acacia';
                    trunkH = 7.8;
                } else {
                    treeGeo = sharedDecidGeo;
                    treeType = 'beech';
                    trunkH = 9.5;
                }
            } else if (currentZoneIndex === 8) {
                // Ancient Egypt: Royal Date Palms along the Nile, Fan Palms & Umbrella Acacias
                if (treeRoll < 0.82) {
                    const pVar = Math.floor(rng() * (sharedPalmGeos.length || 1));
                    treeGeo = (sharedPalmGeos && sharedPalmGeos[pVar]) ? sharedPalmGeos[pVar] : sharedPalmGeo;
                    treeType = 'palm';
                    trunkH = (pVar === 1 ? 14.5 : pVar === 3 ? 8.2 : 11.5);
                } else if (sharedAcaciaGeo) {
                    treeGeo = sharedAcaciaGeo;
                    treeType = 'acacia';
                    trunkH = 7.8;
                } else {
                    treeGeo = sharedPalmGeo;
                    treeType = 'palm';
                    trunkH = 11.5;
                }
            } else if (currentZoneIndex === 9) {
                // Tropical Jungle: Giant Emergent Rainforest Canopy Trees, Tall Royal Palms, Weeping Willows & Broadleaf Trees
                if (treeRoll < 0.62 && sharedJungleTreeGeo) {
                    treeGeo = sharedJungleTreeGeos ? sharedJungleTreeGeos[Math.floor(hash2D(tx * 0.37, tz * 0.53) * 2.999)] : sharedJungleTreeGeo;
                    treeType = 'jungleCanopy';
                    trunkH = 17.5;
                } else if (treeRoll < 0.76 && sharedPalmGeos && sharedPalmGeos[1]) {
                    treeGeo = sharedPalmGeos[1];
                    treeType = 'palm';
                    trunkH = 14.2;
                } else if (treeRoll < 0.90 && sharedWillowGeo) {
                    treeGeo = sharedWillowGeo;
                    treeType = 'willow';
                    trunkH = 11.2;
                } else {
                    treeGeo = sharedDecidGeo;
                    treeType = 'beech';
                    trunkH = 11.8;
                }
            } else if (currentZoneIndex === 10 || currentZoneIndex === 11) {
                // Ancient Greece & Imperial Rome: Mediterranean Cypress, Umbrella Stone Pines & Gnarled Olive/Broadleaf Trees
                if (treeRoll < 0.46 && sharedCypressGeo) {
                    treeGeo = sharedCypressGeo;
                    treeType = 'cypress';
                    trunkH = 13.8;
                } else if (treeRoll < 0.76) {
                    treeGeo = sharedPineGeo;
                    treeType = 'pine';
                    trunkH = 12.6;
                } else {
                    treeGeo = sharedDecidGeo;
                    treeType = 'beech';
                    trunkH = 9.8;
                }
            } else {
                // Coastal Meadow: Weeping Willow near water/hollows, Silver Birch, Cypress, Beech, Pine & Spruce
                if (ty < 1.2 && treeRoll < 0.42 && sharedWillowGeo) {
                    treeGeo = sharedWillowGeo;
                    treeType = 'willow';
                    trunkH = 9.4;
                } else if (isVillage) {
                    if (treeRoll < 0.38 && sharedCypressGeo) {
                        treeGeo = sharedCypressGeo;
                        treeType = 'cypress';
                        trunkH = 13.5;
                    } else if (treeRoll < 0.72) {
                        treeGeo = sharedDecidGeo;
                        treeType = 'beech';
                        trunkH = 10.2;
                    } else {
                        treeGeo = sharedBirchGeo || sharedPineGeo;
                        treeType = 'birch';
                        trunkH = 10.6;
                    }
                } else if (forestNoise > 0.52) {
                    if (treeRoll < 0.42) {
                        treeGeo = sharedSpruceGeo;
                        treeType = 'spruce';
                        trunkH = 14.2;
                    } else if (treeRoll < 0.68) {
                        treeGeo = sharedPineGeo;
                        treeType = 'pine';
                        trunkH = 12.8;
                    } else if (treeRoll < 0.86 && sharedBirchGeo) {
                        treeGeo = sharedBirchGeo;
                        treeType = 'birch';
                        trunkH = 10.6;
                    } else {
                        treeGeo = sharedDecidGeo;
                        treeType = 'beech';
                        trunkH = 10.5;
                    }
                } else {
                    if (treeRoll < 0.36) {
                        treeGeo = sharedSpruceGeo;
                        treeType = 'spruce';
                        trunkH = 14.2;
                    } else if (treeRoll < 0.62) {
                        treeGeo = sharedPineGeo;
                        treeType = 'pine';
                        trunkH = 12.5;
                    } else if (treeRoll < 0.82 && sharedBirchGeo) {
                        treeGeo = sharedBirchGeo;
                        treeType = 'birch';
                        trunkH = 10.4;
                    } else {
                        treeGeo = sharedDecidGeo;
                        treeType = 'beech';
                        trunkH = 9.8;
                    }
                }
            }

            const scale = (treeType === 'acacia') ? (0.80 + rng() * 0.45) : (0.85 + rng() * 0.55);
            const treeGroup = new THREE.Group();
            treeGroup.position.set(tx, ty, tz);
            treeGroup.scale.setScalar(scale);

            const treeMesh = new THREE.Mesh(treeGeo, chosenMat);
            treeMesh.rotation.y = rng() * Math.PI * 2;
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
                radius: (treeType === 'cactus' || treeType === 'joshua' ? 0.80 : treeType === 'acacia' || treeType === 'willow' ? 1.55 : treeType === 'cypress' ? 0.95 : 1.35) * scale,
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
        // 4. UNDERGROWTH BUSHES, WILDFLOWERS, FERNS & SUCCULENTS (INSTANCED MESH)
        // ---------------------------------------------------------------------
        const bushMatrices = [];
        const extraPlantMatrices = [];
        const secondaryPlantMatrices = [];
        let bushCount = (forestNoise > 0.52) ? (6 + Math.floor(rng() * 5)) : (Math.floor(rng() * 4) + 2);
        if (currentZoneIndex === 1 || currentZoneIndex === 6 || currentZoneIndex === 7 || currentZoneIndex === 8) {
            bushCount = 4 + Math.floor(rng() * 4); // Desert wadi bushes, agave & prickly pear
        } else if (currentZoneIndex === 9) {
            bushCount = isMobile ? (14 + Math.floor(rng() * 6)) : (28 + Math.floor(rng() * 12)); // Dense tropical fern & broadleaf undergrowth
        }
        const dummyBush = new THREE.Object3D();

        for (let b = 0; b < bushCount; b++) {
            const bx = xMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            const bz = zMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            if (getRoadFactor(bx, bz) > 0.28 || getRiverDistance(bx, bz) < 12.5) continue;
            const by = getTerrainHeight(bx, bz);
            if (by < -2.4 || (currentZoneIndex === 2 && by > 15.0)) continue;
            const bs = (currentZoneIndex === 9) ? (1.05 + rng() * 0.95) : (0.75 + rng() * 0.65);

            dummyBush.position.set(bx, by, bz);
            dummyBush.scale.set(bs * 1.15, bs * (currentZoneIndex === 9 ? 1.10 : 0.90), bs * 1.15);
            dummyBush.rotation.y = rng() * Math.PI * 2;
            dummyBush.updateMatrix();
            const pRoll = rng();
            if (currentZoneIndex === 1 || currentZoneIndex === 6 || currentZoneIndex === 7 || currentZoneIndex === 8) {
                if (pRoll < 0.42 && sharedAgaveGeo) extraPlantMatrices.push(dummyBush.matrix.clone());
                else if (pRoll < 0.76 && sharedPricklyPearGeo) secondaryPlantMatrices.push(dummyBush.matrix.clone());
                else bushMatrices.push(dummyBush.matrix.clone());
            } else if (currentZoneIndex === 9) {
                if (pRoll < 0.65 && sharedFernGeo) extraPlantMatrices.push(dummyBush.matrix.clone());
                else bushMatrices.push(dummyBush.matrix.clone());
            } else if (currentZoneIndex === 2) {
                if (pRoll < 0.50 && sharedFernGeo) extraPlantMatrices.push(dummyBush.matrix.clone());
                else if (pRoll < 0.75 && sharedFlowerBushGeo) secondaryPlantMatrices.push(dummyBush.matrix.clone());
                else bushMatrices.push(dummyBush.matrix.clone());
            } else {
                if (pRoll < 0.40 && sharedFlowerBushGeo) extraPlantMatrices.push(dummyBush.matrix.clone());
                else if (pRoll < 0.68 && sharedFernGeo) secondaryPlantMatrices.push(dummyBush.matrix.clone());
                else bushMatrices.push(dummyBush.matrix.clone());
            }
        }

        const applyUndergrowthTint = (instMesh, count) => {
            const baseTint = (currentZoneIndex === 1 || currentZoneIndex === 6 || currentZoneIndex === 7 || currentZoneIndex === 8)
                ? [0.68, 0.62, 0.42]
                : (currentZoneIndex === 3)
                    ? [0.78, 0.72, 0.52]
                    : (currentZoneIndex === 4)
                        ? [0.55, 0.62, 0.56]
                        : (currentZoneIndex === 9)
                            ? [0.65, 0.78, 0.58]
                            : (currentZoneIndex === 10 || currentZoneIndex === 11)
                                ? [0.76, 0.78, 0.56]
                                : [0.78, 0.84, 0.68];
            const instCol = new THREE.Color();
            for (let i = 0; i < count; i++) {
                const v = 0.86 + rng() * 0.18;
                instCol.setRGB(baseTint[0] * v, baseTint[1] * v, baseTint[2] * v);
                instMesh.setColorAt(i, instCol);
            }
            if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
        };

        if (bushMatrices.length > 0) {
            const bushInstMesh = new THREE.InstancedMesh(sharedBushGeo, treeMaterial, bushMatrices.length);
            for (let i = 0; i < bushMatrices.length; i++) {
                bushInstMesh.setMatrixAt(i, bushMatrices[i]);
            }
            applyUndergrowthTint(bushInstMesh, bushMatrices.length);
            bushInstMesh.instanceMatrix.needsUpdate = true;
            bushInstMesh.castShadow = true;
            bushInstMesh.receiveShadow = true;
            bushInstMesh.customDepthMaterial = getTreeDepthMaterial();
            this.group.add(bushInstMesh);
            this.bushMesh = bushInstMesh;
        }

        const isAridSucculentZone = (currentZoneIndex === 1 || currentZoneIndex === 6 || currentZoneIndex === 7 || currentZoneIndex === 8);
        const primaryExtraGeo = isAridSucculentZone ? sharedAgaveGeo : ((currentZoneIndex === 2 || currentZoneIndex === 9) ? sharedFernGeo : sharedFlowerBushGeo);
        const primaryMat = isAridSucculentZone ? cactusMat : treeMaterial;
        if (extraPlantMatrices.length > 0 && primaryExtraGeo) {
            const extraInst = new THREE.InstancedMesh(primaryExtraGeo, primaryMat, extraPlantMatrices.length);
            for (let i = 0; i < extraPlantMatrices.length; i++) {
                extraInst.setMatrixAt(i, extraPlantMatrices[i]);
            }
            if (!isAridSucculentZone) applyUndergrowthTint(extraInst, extraPlantMatrices.length);
            extraInst.instanceMatrix.needsUpdate = true;
            extraInst.castShadow = true;
            extraInst.receiveShadow = true;
            if (!isAridSucculentZone) extraInst.customDepthMaterial = getTreeDepthMaterial();
            this.group.add(extraInst);
            this.extraPlantMeshes.push(extraInst);
        }

        const secondaryExtraGeo = isAridSucculentZone ? sharedPricklyPearGeo : (currentZoneIndex === 9 ? (sharedPalmGeos && sharedPalmGeos[3]) : (currentZoneIndex === 2 ? sharedFlowerBushGeo : sharedFernGeo));
        const secondaryMat = isAridSucculentZone ? cactusMat : treeMaterial;
        if (secondaryPlantMatrices.length > 0 && secondaryExtraGeo) {
            const secInst = new THREE.InstancedMesh(secondaryExtraGeo, secondaryMat, secondaryPlantMatrices.length);
            for (let i = 0; i < secondaryPlantMatrices.length; i++) {
                secInst.setMatrixAt(i, secondaryPlantMatrices[i]);
            }
            if (!isAridSucculentZone) applyUndergrowthTint(secInst, secondaryPlantMatrices.length);
            secInst.instanceMatrix.needsUpdate = true;
            secInst.castShadow = true;
            secInst.receiveShadow = true;
            if (!isAridSucculentZone) secInst.customDepthMaterial = getTreeDepthMaterial();
            this.group.add(secInst);
            this.extraPlantMeshes.push(secInst);
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
            unloadBuildingInterior(b);
            const idx = worldBuildings.indexOf(b);
            if (idx !== -1) worldBuildings.splice(idx, 1);
            const oIdx = worldObstacles.indexOf(b);
            if (oIdx !== -1) worldObstacles.splice(oIdx, 1);
        });

        if (this.rocks) {
            this.rocks.forEach(r => {
                const oIdx = worldObstacles.indexOf(r);
                if (oIdx !== -1) worldObstacles.splice(oIdx, 1);
                const bIdx = worldBuildings.indexOf(r);
                if (bIdx !== -1) worldBuildings.splice(bIdx, 1);
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
        if (this.extraPlantMeshes) {
            this.extraPlantMeshes.forEach(m => m && m.dispose && m.dispose());
            this.extraPlantMeshes.length = 0;
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
            farPropLastCX = null;
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
            farPropLastCX = null;
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
// 8B. BABYLON-INSPIRED TERRAIN, TREE-TYPE, ROCK & HOUSE FAR LOD SYSTEM
// ============================================================================
let farTerrainGroup = null;
let farMidMesh = null;
let farOuterMesh = null;
let farLastSnapX = null;
let farLastSnapZ = null;
let farPropLastCX = null;
let farPropLastCZ = null;
const farChunkPropCache = new Map();

const farLodMeshes = {
    conifer: null,
    cypress: null,
    broadleaf: null,
    palm: null,
    acacia: null,
    cactus: null,
    rock: null,
    sandstoneRock: null,
    house: null,
    adobe: null,
    butte: null,
    monumentSpire: null,
    canyonCliff: null,
    canyonTower: null
};

const reflInnerLodMeshes = {};

function buildFarRingMesh(centerX, centerZ, halfExtent, step, skipInnerHalf, ySkirt, receiveShadow) {
    const cells = Math.round((halfExtent * 2) / step);
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const vertIndexMap = new Int32Array((cells + 1) * (cells + 1)).fill(-1);
    const rgb = [0, 0, 0];

    const getVert = (ix, iz) => {
        const key = iz * (cells + 1) + ix;
        if (vertIndexMap[key] !== -1) return vertIndexMap[key];
        const wx = centerX - halfExtent + ix * step;
        const wz = centerZ - halfExtent + iz * step;
        const wy = getTerrainHeight(wx, wz);
        let meshY = wy;
        if (wy < -2.90) {
            meshY -= smoothstep(-2.90, -3.80, wy) * 1.2;
        }
        const n = getTerrainNormal(wx, wz);
        sampleTerrainVertexColor(wx, wz, wy, n, rgb, 0);
        const idx = positions.length / 3;
        positions.push(wx, meshY + ySkirt, wz);
        normals.push(n.x, n.y, n.z);
        colors.push(rgb[0], rgb[1], rgb[2]);
        vertIndexMap[key] = idx;
        return idx;
    };

    for (let iz = 0; iz < cells; iz++) {
        const czLocal = -halfExtent + (iz + 0.5) * step;
        for (let ix = 0; ix < cells; ix++) {
            const cxLocal = -halfExtent + (ix + 0.5) * step;
            if (Math.abs(cxLocal) < skipInnerHalf && Math.abs(czLocal) < skipInnerHalf) continue;
            const v00 = getVert(ix, iz);
            const v10 = getVert(ix + 1, iz);
            const v01 = getVert(ix, iz + 1);
            const v11 = getVert(ix + 1, iz + 1);
            indices.push(v00, v01, v10);
            indices.push(v10, v01, v11);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    return mesh;
}

function createFarHazedLambertMaterial(options = {}) {
    const mat = new THREE.MeshLambertMaterial({
        map: options.map || null,
        alphaTest: options.alphaTest || 0.0,
        side: options.side || THREE.FrontSide,
        vertexColors: Boolean(options.vertexColors),
        fog: false
    });
    const hasWindSway = Boolean(options.windSway);
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
        shader.uniforms.uSunDir = terrainUniforms.uSunDir;
        shader.uniforms.uSunColor = terrainUniforms.uSunColor;
        shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
        shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
        shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
        shader.uniforms.uSssStrength = (window.celestialLighting && window.celestialLighting.sssStrength)
            ? window.celestialLighting.sssStrength
            : { value: 1.0 };
        if (hasWindSway) {
            shader.uniforms.uTime = grassUniforms.uTime;
            shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
        }
        shader.vertexShader = (hasWindSway ? 'uniform float uTime;\nuniform float uWindSpeed;\n' : '') + 'varying vec3 vFarPropWP;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>` + (hasWindSway ? `
            vec3 farBasePos = vec3(0.0);
            #ifdef USE_INSTANCING
            farBasePos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            #else
            farBasePos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            #endif
            float farWave = sin(farBasePos.x * 0.14 + farBasePos.z * 0.12 + uTime * uWindSpeed * 2.4);
            float farH = pow(clamp(transformed.y / 12.0, 0.0, 1.2), 1.35);
            float farSway = farWave * 0.24 * farH;
            transformed.x += farSway;
            transformed.z += farSway * 0.60;` : '') + `
            vec4 fpWp = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
            fpWp = instanceMatrix * fpWp;
            #endif
            vFarPropWP = (modelMatrix * fpWp).xyz;`
        );
        shader.fragmentShader = `
            uniform vec3 uCameraPos;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uSkyColor;
            uniform vec3 uSkyTopColor;
            uniform float uHazeStrength;
            uniform float uSssStrength;
            varying vec3 vFarPropWP;
            ${BABYLON_HAZE_GLSL}
        ` + shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',
            `gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vFarPropWP, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
            #include <tonemapping_fragment>`
        );

        injectCloudShadowFragment(shader, 'vFarPropWP');
    };
    return mat;
}

function createFarHazedStandardMaterial(options = {}) {
    const mat = new THREE.MeshStandardMaterial({
        map: options.map || null,
        normalMap: options.normalMap || null,
        normalScale: options.normalScale || new THREE.Vector2(0.55, 0.55),
        roughness: options.roughness !== undefined ? options.roughness : 0.88,
        metalness: options.metalness !== undefined ? options.metalness : 0.02,
        envMapIntensity: GROUND_ENV_MAP_INTENSITY,
        side: options.side || THREE.FrontSide,
        vertexColors: Boolean(options.vertexColors),
        fog: false
    });
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
        shader.uniforms.uSunDir = terrainUniforms.uSunDir;
        shader.uniforms.uSunColor = terrainUniforms.uSunColor;
        shader.uniforms.uSkyColor = terrainUniforms.uSkyColor;
        shader.uniforms.uSkyTopColor = terrainUniforms.uSkyTopColor;
        shader.uniforms.uHazeStrength = terrainUniforms.uHazeStrength;
        shader.vertexShader = 'varying vec3 vFarStdWP;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vec4 fsWp = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
            fsWp = instanceMatrix * fsWp;
            #endif
            vFarStdWP = (modelMatrix * fsWp).xyz;`
        );
        shader.fragmentShader = `
            uniform vec3 uCameraPos;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uSkyColor;
            uniform vec3 uSkyTopColor;
            uniform float uHazeStrength;
            varying vec3 vFarStdWP;
            ${BABYLON_HAZE_GLSL}
        ` + shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',
            `gl_FragColor.rgb = applyBabylonAerialHaze(gl_FragColor.rgb, vFarStdWP, uCameraPos, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);
            #include <tonemapping_fragment>`
        );

        injectCloudShadowFragment(shader, 'vFarStdWP', true);
    };
    return mat;
}

let _farTreeMat = null;
function getFarTreeImpostorMaterial() {
    if (!_farTreeMat) {
        _farTreeMat = createFarHazedLambertMaterial({
            map: getBotanicalAtlas(),
            alphaTest: 0.30,
            side: THREE.DoubleSide,
            vertexColors: false
        });
    }
    return _farTreeMat;
}

let _farSolidMat = null;
function getFarSolidLodMaterial() {
    if (!_farSolidMat) {
        _farSolidMat = createFarHazedLambertMaterial({
            vertexColors: true,
            side: THREE.FrontSide
        });
    }
    return _farSolidMat;
}

function appendCrossedCard(pos, norm, uv, y0, y1, w0, w1, uMin, vMin, uMax, vMax) {
    const base = pos.length / 3;
    // Plane A (XY)
    pos.push(-w0, y0, 0,   w0, y0, 0,   w1, y1, 0,  -w1, y1, 0);
    norm.push(0, 0.35, 1,  0, 0.35, 1,  0, 0.65, 1,  0, 0.65, 1);
    uv.push(uMin, vMin,  uMax, vMin,  uMax, vMax,  uMin, vMax);
    // Plane B (ZY)
    pos.push(0, y0, -w0,   0, y0, w0,   0, y1, w1,   0, y1, -w1);
    norm.push(1, 0.35, 0,  1, 0.35, 0,  1, 0.65, 0,  1, 0.65, 0);
    uv.push(uMin, vMin,  uMax, vMin,  uMax, vMax,  uMin, vMax);
    return [
        base + 0, base + 1, base + 2, base + 0, base + 2, base + 3,
        base + 4, base + 5, base + 6, base + 4, base + 6, base + 7
    ];
}

function finalizeCardGeo(pos, norm, uv, idx) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
}

function buildFarConiferGeo() {
    // Tapered trunk (Q3) + 3-tier conical needle boughs (Q0: [0..0.5, 0.5..1.0])
    const pos = [], norm = [], uv = [], idx = [];
    idx.push(...appendCrossedCard(pos, norm, uv, 0, 5.5, 0.45, 0.25, 0.54, 0.04, 0.96, 0.46));
    idx.push(...appendCrossedCard(pos, norm, uv, 2.8, 7.8, 3.2, 1.9, 0.02, 0.52, 0.48, 0.98));
    idx.push(...appendCrossedCard(pos, norm, uv, 6.2, 11.2, 2.3, 1.1, 0.02, 0.52, 0.48, 0.98));
    idx.push(...appendCrossedCard(pos, norm, uv, 9.5, 13.8, 1.3, 0.2, 0.02, 0.52, 0.48, 0.98));
    return finalizeCardGeo(pos, norm, uv, idx);
}

function buildFarCypressGeo() {
    // Tall columnar Mediterranean cypress silhouette (Q0 needles + Q3 trunk)
    const pos = [], norm = [], uv = [], idx = [];
    idx.push(...appendCrossedCard(pos, norm, uv, 0, 2.8, 0.35, 0.25, 0.54, 0.04, 0.96, 0.46));
    idx.push(...appendCrossedCard(pos, norm, uv, 1.8, 13.6, 1.45, 0.35, 0.02, 0.52, 0.48, 0.98));
    return finalizeCardGeo(pos, norm, uv, idx);
}

function buildFarBroadleafGeo() {
    // Trunk (Q3) + broad rounded deciduous crown (Q1: [0.5..1.0, 0.5..1.0])
    const pos = [], norm = [], uv = [], idx = [];
    idx.push(...appendCrossedCard(pos, norm, uv, 0, 5.2, 0.55, 0.35, 0.54, 0.04, 0.96, 0.46));
    idx.push(...appendCrossedCard(pos, norm, uv, 3.6, 10.6, 3.6, 3.2, 0.52, 0.52, 0.98, 0.98));
    return finalizeCardGeo(pos, norm, uv, idx);
}

function buildFarPalmGeo() {
    // Tall slender trunk (Q3) + high radiating frond crown (Q0/Q2)
    const pos = [], norm = [], uv = [], idx = [];
    idx.push(...appendCrossedCard(pos, norm, uv, 0, 10.5, 0.35, 0.22, 0.54, 0.04, 0.96, 0.46));
    idx.push(...appendCrossedCard(pos, norm, uv, 8.6, 12.6, 3.8, 2.6, 0.02, 0.52, 0.48, 0.98));
    return finalizeCardGeo(pos, norm, uv, idx);
}

function buildFarAcaciaGeo() {
    // Savannah/desert umbrella acacia: trunk (Q3) + wide flat canopy (Q1)
    const pos = [], norm = [], uv = [], idx = [];
    idx.push(...appendCrossedCard(pos, norm, uv, 0, 5.8, 0.42, 0.25, 0.54, 0.04, 0.96, 0.46));
    idx.push(...appendCrossedCard(pos, norm, uv, 5.0, 8.2, 4.4, 4.6, 0.52, 0.52, 0.98, 0.98));
    return finalizeCardGeo(pos, norm, uv, idx);
}

function buildFarCactusGeo() {
    const geo = new THREE.CylinderGeometry(0.32, 0.40, 4.8, 6);
    geo.translate(0, 2.4, 0);
    const count = geo.attributes.position.count;
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        cols[i * 3 + 0] = 0.24;
        cols[i * 3 + 1] = 0.46;
        cols[i * 3 + 2] = 0.20;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
}

function buildFarRockGeo() {
    // Wide craggy boulder cluster matching createLimestoneRockGeometry (~8.5m wide, 3.8m tall, 5.1m deep)
    const boulders = [
        { x: 0,     y: 1.75, z: 0,     sx: 3.15, sy: 1.90, sz: 2.55, rot: 0.25 },
        { x: -2.2,  y: 1.35, z: 0.35,  sx: 2.15, sy: 1.48, sz: 1.95, rot: 1.15 },
        { x: 2.05,  y: 1.25, z: -0.45, sx: 2.05, sy: 1.38, sz: 1.85, rot: 2.35 },
        { x: 0.35,  y: 2.45, z: -0.25, sx: 1.85, sy: 1.28, sz: 1.65, rot: 0.75 }
    ];
    const parts = boulders.map(b => {
        const g = new THREE.DodecahedronGeometry(1.0, 0);
        const pos = g.attributes.position;
        const cols = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const bottomFlat = vy < -0.45 ? 0.78 : 1.0;
            pos.setXYZ(i, vx * 0.92 * b.sx, vy * 0.92 * b.sy * bottomFlat, vz * 0.92 * b.sz);
        }
        g.rotateY(b.rot);
        g.translate(b.x, b.y, b.z);
        g.computeVertexNormals();
        for (let i = 0; i < pos.count; i++) {
            const shade = 0.28 + Math.min(1.0, Math.max(0.0, pos.getY(i) / 4.0)) * 0.16;
            cols[i * 3 + 0] = shade;
            cols[i * 3 + 1] = shade;
            cols[i * 3 + 2] = shade;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        applyWorldBoxUVs(g, 0.22, 0.30);
        return g;
    });
    return mergeBufferGeometries(parts);
}

function buildFarSandstoneRockGeo() {
    // Low-poly stratified flat-topped desert sandstone cluster matching createSandstoneRockGeometry
    const slabs = [
        { x: 0,     y: 1.95, z: 0,     sx: 3.5, sy: 2.10, sz: 2.8, rot: 0.15 },
        { x: -2.5,  y: 1.35, z: 0.5,   sx: 2.4, sy: 1.45, sz: 2.1, rot: 0.85 },
        { x: 2.3,   y: 1.50, z: -0.4,  sx: 2.3, sy: 1.60, sz: 2.0, rot: 1.95 },
        { x: 0.2,   y: 3.35, z: -0.2,  sx: 2.6, sy: 0.95, sz: 2.1, rot: 0.45 }
    ];
    const parts = slabs.map(b => {
        const g = new THREE.DodecahedronGeometry(1.0, 0);
        const pos = g.attributes.position;
        const cols = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const flatTop = vy > 0.55 ? 0.55 + (vy - 0.55) * 0.35 : vy;
            pos.setXYZ(i, vx * 0.95 * b.sx, flatTop * b.sy, vz * 0.95 * b.sz);
        }
        g.rotateY(b.rot);
        g.translate(b.x, b.y, b.z);
        g.computeVertexNormals();
        for (let i = 0; i < pos.count; i++) {
            const wy = pos.getY(i);
            const band = 0.88 + 0.12 * Math.sin(wy * 5.2);
            const shade = (0.64 + 0.32 * Math.min(1.0, Math.max(0.0, wy / 4.2))) * band;
            cols[i * 3 + 0] = shade;
            cols[i * 3 + 1] = shade;
            cols[i * 3 + 2] = shade;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        applyWorldBoxUVs(g, 0.22, 0.30);
        return g;
    });
    return mergeBufferGeometries(parts);
}

function buildFarHouseGeo() {
    // Low-poly pitched-roof house (unit width ~7.5m, wall height 3.4m, roof peak 5.8m)
    const w = 3.8, d = 3.2, h = 3.4, peak = 5.8;
    const pos = [
        // Front/Back/Sides walls
        -w,0,d,  w,0,d,  w,h,d,  -w,h,d,
        w,0,-d, -w,0,-d, -w,h,-d, w,h,-d,
        -w,0,-d, -w,0,d, -w,h,d, -w,h,-d,
        w,0,d,   w,0,-d, w,h,-d, w,h,d,
        // Roof slopes
        -w,h,d,  w,h,d,  w,peak,0,  -w,peak,0,
        w,h,-d, -w,h,-d, -w,peak,0,  w,peak,0,
        // Gable triangles
        -w,h,-d, -w,h,d, -w,peak,0,
        w,h,d,   w,h,-d, w,peak,0
    ];
    const col = [];
    for (let i = 0; i < 16; i++) col.push(0.28, 0.25, 0.21); // Warm stone/plaster walls (linear space)
    for (let i = 0; i < 8; i++) col.push(0.26, 0.08, 0.05);  // Terracotta roof (linear space)
    for (let i = 0; i < 6; i++) col.push(0.24, 0.21, 0.18);  // Gables (linear space)
    const idx = [
        0,1,2, 0,2,3,  4,5,6, 4,6,7,  8,9,10, 8,10,11,  12,13,14, 12,14,15,
        16,17,18, 16,18,19,  20,21,22, 20,22,23,
        24,25,26,  27,28,29
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

function buildFarAdobeGeo() {
    const geo = new THREE.BoxGeometry(6.8, 4.8, 6.2);
    geo.translate(0, 2.4, 0);
    const count = geo.attributes.position.count;
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const y = geo.attributes.position.getY(i);
        const s = y > 3.5 ? 0.92 : 0.78;
        cols[i * 3 + 0] = 0.36 * s;
        cols[i * 3 + 1] = 0.24 * s;
        cols[i * 3 + 2] = 0.14 * s;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
}

function buildFarButteGeo() {
    // Low-poly Monument Valley Mitten Butte matching createMonumentButteGeometry(34.0, 36.0, 21.5)
    const baseW = 34.0, l = 36.0, h = 21.5;
    const parts = [];

    function colorFarMonumentStrata(geo) {
        geo.computeVertexNormals();
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hFrac = Math.max(0.0, Math.min(1.0, vy / h));
            const s1 = Math.sin(vy * 1.85 + (vx + vz) * 0.06);
            const s2 = Math.cos(vy * 4.4 - vx * 0.10) * 0.5;
            const varnish = Math.sin(Math.atan2(vz, vx) * 9.0) * 0.06;
            const ao = 0.68 + 0.32 * Math.pow(hFrac, 0.65);

            let r, g, b;
            if (vy < 5.8) {
                r = 0.74 + s1 * 0.06;
                g = 0.27 + s1 * 0.04;
                b = 0.14 + s1 * 0.02;
            } else if (vy > h - 2.4) {
                r = 0.94 + s2 * 0.05;
                g = 0.54 + s2 * 0.05;
                b = 0.30 + s2 * 0.04;
            } else {
                const buffBand = Math.max(0.0, s1 + s2 * 0.6);
                r = 0.86 + buffBand * 0.12 + varnish;
                g = 0.33 + buffBand * 0.16 + varnish * 0.5;
                b = 0.16 + buffBand * 0.10;
            }
            col[i * 3 + 0] = Math.min(1.0, Math.max(0.2, r * ao));
            col[i * 3 + 1] = Math.min(1.0, Math.max(0.1, g * ao));
            col[i * 3 + 2] = Math.min(1.0, Math.max(0.06, b * ao));
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.16, 0.22);
        return geo;
    }

    // 1. Talus apron skirt
    const talusH = 6.8;
    const talus = new THREE.CylinderGeometry(baseW * 0.30, baseW * 0.54, talusH, 10, 2);
    const tPos = talus.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const vx = tPos.getX(i), vy = tPos.getY(i), vz = tPos.getZ(i);
        const ny = (vy + talusH * 0.5) / talusH;
        const ang = Math.atan2(vz, vx);
        const flute = 1.0 + (Math.sin(ang * 5.0 + 0.4) * 0.11 + Math.cos(ang * 9.0) * 0.07) * (1.0 - ny * 0.35);
        tPos.setX(i, vx * flute * 1.06);
        tPos.setZ(i, vz * flute * (l / baseW) * 0.94);
    }
    talus.translate(0, talusH * 0.5, 0);
    parts.push(colorFarMonumentStrata(talus));

    // 2. Main sandstone cliff massif
    const cliffH = h - talusH + 1.2;
    const cliff = new THREE.CylinderGeometry(baseW * 0.24, baseW * 0.29, cliffH, 10, 3);
    const cPos = cliff.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
        const vx = cPos.getX(i), vy = cPos.getY(i), vz = cPos.getZ(i);
        const ang = Math.atan2(vz, vx);
        const verticalFlutes = 1.0 + Math.sin(ang * 4.0 + 0.6) * 0.14 + Math.cos(ang * 7.0 - 0.5) * 0.09;
        cPos.setXYZ(i, vx * verticalFlutes * 0.92 - baseW * 0.05, vy, vz * verticalFlutes * 0.76);
    }
    cliff.translate(0, talusH + cliffH * 0.5 - 0.8, 0);
    parts.push(colorFarMonumentStrata(cliff));

    // 3. Secondary shoulder buttress
    const shoulderH = cliffH * 0.76;
    const shoulder = new THREE.CylinderGeometry(baseW * 0.15, baseW * 0.19, shoulderH, 8, 2);
    shoulder.translate(-baseW * 0.18, talusH + shoulderH * 0.5 - 0.9, -l * 0.08);
    parts.push(colorFarMonumentStrata(shoulder));

    // 4. Detached "Mitten Thumb" spire
    const thumbH = cliffH * 0.88;
    const thumb = new THREE.CylinderGeometry(baseW * 0.055, baseW * 0.105, thumbH, 7, 2);
    thumb.translate(baseW * 0.25, talusH + thumbH * 0.5 - 1.1, l * 0.06);
    parts.push(colorFarMonumentStrata(thumb));

    return mergeBufferGeometries(parts);
}

function buildFarMonumentSpireGeo() {
    // Low-poly Monument Valley "Three Sisters" Spire Cluster matching createMonumentSpireGeometry(8.4, 24.5)
    const baseW = 8.4, h = 24.5;
    const parts = [];

    function colorFarSpireStrata(geo) {
        geo.computeVertexNormals();
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
            const hFrac = Math.max(0.0, Math.min(1.0, vy / h));
            const band = Math.sin(vy * 2.4 + (vx + vz) * 0.18);
            const ao = 0.68 + 0.32 * Math.pow(hFrac, 0.65);
            const r = (vy < 5.0 ? 0.74 : 0.88 + band * 0.10) * ao;
            const g = (vy < 5.0 ? 0.26 : 0.34 + band * 0.12) * ao;
            const b = (vy < 5.0 ? 0.13 : 0.17 + band * 0.08) * ao;
            col[i * 3 + 0] = Math.min(1.0, r);
            col[i * 3 + 1] = Math.min(1.0, g);
            col[i * 3 + 2] = Math.min(1.0, b);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        applyWorldBoxUVs(geo, 0.18, 0.24);
        return geo;
    }

    const baseH = 5.6;
    const baseCone = new THREE.CylinderGeometry(baseW * 0.42, baseW * 0.92, baseH, 9, 2);
    baseCone.translate(0, baseH * 0.5, 0);
    parts.push(colorFarSpireStrata(baseCone));

    const spires = [
        { x:  0.0,           z:  0.0,           rTop: baseW * 0.14, rBot: baseW * 0.28, sh: h - 4.8 },
        { x:  baseW * 0.28,  z:  baseW * 0.08,  rTop: baseW * 0.11, rBot: baseW * 0.21, sh: (h - 4.8) * 0.74 },
        { x: -baseW * 0.26,  z: -baseW * 0.10,  rTop: baseW * 0.10, rBot: baseW * 0.19, sh: (h - 4.8) * 0.58 }
    ];
    spires.forEach(sp => {
        const colGeo = new THREE.CylinderGeometry(sp.rTop, sp.rBot, sp.sh, 7, 3);
        colGeo.translate(sp.x, baseH - 0.8 + sp.sh * 0.5, sp.z);
        parts.push(colorFarSpireStrata(colGeo));
    });

    return mergeBufferGeometries(parts);
}

function buildFarCanyonCliffGeo() {
    // Low-poly terraced Grand Canyon promontory matching createCanyonCliffGeometry(28.0, 32.0, 18.5)
    const parts = [];
    const w = 28.0, l = 32.0, h = 18.5, benches = 5;
    const bH = h / benches;
    for (let b = 0; b < benches; b++) {
        const frac = b / benches;
        const bw = w * (1.0 - frac * 0.44);
        const bl = l * (1.0 - frac * 0.44);
        const cyl = new THREE.CylinderGeometry(bw * 0.46, bw * 0.54, bH + 0.15, 10, 1);
        const p = cyl.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const ang = Math.atan2(vz, vx);
            const crag = 1.0 + Math.sin(ang * 5.0 + b) * 0.12 + Math.cos(ang * 9.0) * 0.07;
            p.setXYZ(i, vx * crag, vy, vz * crag * (bl / bw));
        }
        cyl.translate(0, b * bH + bH * 0.5, 0);
        cyl.computeVertexNormals();
        const strataTint = (b === 0) ? [0.42, 0.15, 0.08]
                         : (b === 1) ? [0.34, 0.11, 0.06]
                         : (b === 2) ? [0.48, 0.22, 0.12]
                         : (b === 3) ? [0.52, 0.34, 0.20]
                         : [0.56, 0.40, 0.26];
        tintBuildingPart(cyl, strataTint[0], strataTint[1], strataTint[2], h);
        applyWorldBoxUVs(cyl, 0.18, 0.24);
        parts.push(cyl);
    }
    return mergeBufferGeometries(parts);
}

function buildFarCanyonTowerGeo() {
    // Low-poly stepped Grand Canyon spire/tower matching createCanyonTowerGeometry(9.2, 17.0)
    const parts = [];
    const baseW = 9.2, h = 17.0;
    const bH = h / 4;
    for (let b = 0; b < 4; b++) {
        const bw = baseW * (1.0 - b * 0.18);
        const cyl = new THREE.CylinderGeometry(bw * 0.44, bw * 0.54, bH + 0.12, 8, 1);
        const p = cyl.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            const ang = Math.atan2(vz, vx);
            const crag = 1.0 + Math.sin(ang * 4.0 + b) * 0.13;
            p.setXYZ(i, vx * crag, vy, vz * crag);
        }
        cyl.translate(0, b * bH + bH * 0.5, 0);
        cyl.computeVertexNormals();
        const strata = (b === 0) ? [0.40, 0.14, 0.08] : (b === 1) ? [0.32, 0.10, 0.05] : (b === 2) ? [0.48, 0.26, 0.15] : [0.54, 0.38, 0.24];
        tintBuildingPart(cyl, strata[0], strata[1], strata[2], h);
        applyWorldBoxUVs(cyl, 0.18, 0.24);
        parts.push(cyl);
    }
    return mergeBufferGeometries(parts);
}

function ensureFarLodInstancedMeshes(isMobile) {
    if (!farTerrainGroup) return;
    if (!sharedMonumentSandstonePBR) sharedMonumentSandstonePBR = createMonumentSandstonePBR();
    const sandstoneMap = sharedMonumentSandstonePBR ? sharedMonumentSandstonePBR.albedo : null;
    const sandstoneNorm = sharedMonumentSandstonePBR ? sharedMonumentSandstonePBR.normal : null;
    const treeCap = isMobile ? 700 : 2400;
    const specs = [
        ['conifer',   buildFarConiferGeo,   true,  treeCap, null, null],
        ['cypress',   buildFarCypressGeo,   true,  Math.floor(treeCap * 0.5), null, null],
        ['broadleaf', buildFarBroadleafGeo, true,  treeCap, null, null],
        ['palm',      buildFarPalmGeo,      true,  Math.floor(treeCap * 0.5), null, null],
        ['acacia',    buildFarAcaciaGeo,    true,  Math.floor(treeCap * 0.4), null, null],
        ['cactus',    buildFarCactusGeo,    false, Math.floor(treeCap * 0.3), null, null],
        ['rock',          buildFarRockGeo,          false, isMobile ? 500 : 1600, null, null],
        ['sandstoneRock', buildFarSandstoneRockGeo, false, isMobile ? 500 : 1600, sandstoneMap, sandstoneNorm],
        ['house',         buildFarHouseGeo,         false, isMobile ? 250 : 700, null, null],
        ['adobe',     buildFarAdobeGeo,     false, isMobile ? 120 : 320, null, null],
        ['butte',     buildFarButteGeo,     false, isMobile ? 90 : 260, sandstoneMap, sandstoneNorm],
        ['monumentSpire', buildFarMonumentSpireGeo, false, isMobile ? 90 : 260, sandstoneMap, sandstoneNorm],
        ['canyonCliff', buildFarCanyonCliffGeo, false, isMobile ? 70 : 200, sandstoneMap, sandstoneNorm],
        ['canyonTower', buildFarCanyonTowerGeo, false, isMobile ? 90 : 260, sandstoneMap, sandstoneNorm]
    ];
    const initCol = new THREE.Color(1, 1, 1);
    for (let i = 0; i < specs.length; i++) {
        const [key, geoFn, isCard, cap, texMap, normMap] = specs[i];
        if (!farLodMeshes[key]) {
            const mat = isCard
                ? createFarHazedLambertMaterial({ map: getBotanicalAtlas(), alphaTest: 0.30, side: THREE.DoubleSide, vertexColors: false, windSway: true })
                : (texMap && normMap
                    ? createFarHazedStandardMaterial({ map: texMap, normalMap: normMap, vertexColors: true, side: THREE.DoubleSide })
                    : createFarHazedLambertMaterial({ map: texMap, vertexColors: true, side: THREE.FrontSide }));
            const mesh = new THREE.InstancedMesh(geoFn(), mat, cap);
            mesh.setColorAt(0, initCol);
            mesh.instanceColor.needsUpdate = true;
            mesh.frustumCulled = false;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.layers.enable(2);
            mesh.count = 0;
            farLodMeshes[key] = mesh;
            farTerrainGroup.add(mesh);
        }
        if (!reflInnerLodMeshes[key] && farLodMeshes[key]) {
            const innerCap = Math.max(32, Math.ceil(cap * 0.35));
            const innerMesh = new THREE.InstancedMesh(farLodMeshes[key].geometry, farLodMeshes[key].material, innerCap);
            innerMesh.setColorAt(0, initCol);
            innerMesh.instanceColor.needsUpdate = true;
            innerMesh.frustumCulled = false;
            innerMesh.castShadow = false;
            innerMesh.receiveShadow = false;
            innerMesh.layers.set(2);
            innerMesh.count = 0;
            reflInnerLodMeshes[key] = innerMesh;
            farTerrainGroup.add(innerMesh);
        }
    }
}

function getFarChunkProps(cx, cz, isMobile) {
    const key = `${cx},${cz}`;
    const cached = farChunkPropCache.get(key);
    if (cached) return cached;

    const rng = createChunkRNG(cx, cz, currentSeed);
    const xMin = cx * CHUNK_SIZE;
    const zMin = cz * CHUNK_SIZE;
    const chunkCenterX = xMin + CHUNK_SIZE * 0.5;
    const chunkCenterZ = zMin + CHUNK_SIZE * 0.5;
    const zoneIdx = getZoneIndexAt(chunkCenterX, chunkCenterZ);
    const distFromSpawn = Math.hypot(chunkCenterX, chunkCenterZ);

    const houses = [];
    const rocks = [];
    const trees = [];

    // 1. Exact deterministic village/landmark pass (matching TerrainChunk.populateChunkContent)
    const isCrossroadsVillage = (cx === 0 && cz === -1);
    const isEastVillage = (cx === 1 && cz === 1);
    const isWestVillage = (cx === -1 && cz === 1);
    const isProceduralVillage = (Math.abs(cx) + Math.abs(cz) >= 3) && ((Math.abs(cx * 11 + cz * 17) % 5) === 0);
    const isVillage = isCrossroadsVillage || isEastVillage || isWestVillage || isProceduralVillage;

    if (isVillage) {
        const villageTemplates = [
            { rx: -16, rz: -14, type: 'cottage', rot: 0.35, scale: 1.05 },
            { rx: 16, rz: -16, type: 'barn', rot: -0.42, scale: 1.10 },
            { rx: -15, rz: 15, type: isWestVillage ? 'ruin' : 'townhouse', rot: 1.25, scale: 0.98 },
            { rx: 18, rz: 16, type: isWestVillage ? 'farmhouse' : 'barn', rot: -1.15, scale: 1.02 },
            { rx: 0, rz: 2, type: isCrossroadsVillage ? 'townhouse' : 'farmhouse', rot: 0.12, scale: 1.0 },
            { rx: -1, rz: -26, type: 'wall', rot: 0.05, scale: 1.0 },
            { rx: 1, rz: 26, type: 'wall', rot: 0.08, scale: 1.0 }
        ];
        for (let idx = 0; idx < villageTemplates.length; idx++) {
            const struct = villageTemplates[idx];
            let bx = chunkCenterX + struct.rx + (rng() - 0.5) * 4.0;
            let bz = chunkCenterZ + struct.rz + (rng() - 0.5) * 4.0;
            bx = THREE.MathUtils.clamp(bx, xMin + 8, xMin + CHUNK_SIZE - 8);
            bz = THREE.MathUtils.clamp(bz, zMin + 8, zMin + CHUNK_SIZE - 8);
            if (Math.hypot(bx, bz) < 32) continue;
            if (Math.hypot(bx + 18, bz - 112) < 24) continue;
            if (Math.hypot(bx + 19, bz - 22) < 20) continue;

            const baseBy = getTerrainHeight(bx, bz);
            const norm = getTerrainNormal(bx, bz);
            const minNormY = (zoneIdx === 2) ? 0.80 : 0.85;
            if (baseBy < -1.8 || getRiverDistance(bx, bz) < 20.0 || norm.y < minNormY || (zoneIdx === 2 && baseBy > 16.5)) continue;
            const by = Math.max(
                baseBy,
                getTerrainHeight(bx - 2.6, bz - 2.6),
                getTerrainHeight(bx + 2.6, bz - 2.6),
                getTerrainHeight(bx - 2.6, bz + 2.6),
                getTerrainHeight(bx + 2.6, bz + 2.6)
            );
            const isGreatPyramid = (zoneIdx === 8 && struct.type === 'townhouse' && isProceduralVillage && idx === 2
                && Math.hypot(bx + 18, bz - 112) > 110 && Math.hypot(bx - 58, bz - 142) > 110 && Math.hypot(bx + 74, bz - 146) > 110);
            const rot = isGreatPyramid ? 0.18 : (struct.rot + (rng() - 0.5) * 0.25);

            if (struct.type === 'wall' && zoneIdx !== 6 && zoneIdx !== 7) continue;

            let kind = 'house';
            if (zoneIdx === 1 || zoneIdx === 8) kind = 'adobe';
            else if (zoneIdx === 6) {
                if (struct.type === 'townhouse' || struct.type === 'cottage') {
                    kind = (idx % 2 === 0) ? 'butte' : 'monumentSpire';
                } else if (struct.type === 'farmhouse' || struct.type === 'barn') {
                    if (idx % 2 === 0) {
                        kind = 'monumentSpire';
                    } else {
                        rocks.push({ x: bx, y: baseBy - 0.2, z: bz, scale: struct.scale, rot, zoneIdx });
                        continue;
                    }
                } else if (struct.type === 'ruin') {
                    kind = 'monumentSpire';
                } else {
                    rocks.push({ x: bx, y: baseBy - 0.2, z: bz, scale: struct.scale, rot, zoneIdx });
                    continue;
                }
            }
            else if (zoneIdx === 7) {
                if (struct.type === 'townhouse' || struct.type === 'cottage') kind = (idx % 2 === 0) ? 'canyonCliff' : 'canyonTower';
                else if (struct.type === 'farmhouse' || struct.type === 'barn' || struct.type === 'ruin') kind = 'canyonTower';
                else kind = 'sandstoneRock';
            }
            houses.push({ x: bx, y: by, z: bz, rot, scale: struct.scale, kind, zoneIdx, radius: 5.5 * struct.scale });
        }
    } else if (distFromSpawn > 35 && rng() < 0.36) {
        const roadDistCenter = getRoadDistance(chunkCenterX, chunkCenterZ);
        if (roadDistCenter < 38) {
            const sideSign = (rng() > 0.5) ? 1 : -1;
            let hx = chunkCenterX + sideSign * (14.0 + rng() * 8.0);
            let hz = chunkCenterZ + (rng() - 0.5) * 18.0;
            hx = THREE.MathUtils.clamp(hx, xMin + 8, xMin + CHUNK_SIZE - 8);
            hz = THREE.MathUtils.clamp(hz, zMin + 8, zMin + CHUNK_SIZE - 8);
            const canPlaceRoadside = Math.hypot(hx, hz) >= 32
                && Math.hypot(hx + 18, hz - 112) >= 24
                && Math.hypot(hx + 19, hz - 22) >= 20;
            const baseHy = canPlaceRoadside ? getTerrainHeight(hx, hz) : -999;
            const norm = canPlaceRoadside ? getTerrainNormal(hx, hz) : null;

            if (canPlaceRoadside && baseHy > -1.8 && getRiverDistance(hx, hz) >= 20.0 && norm && norm.y > 0.84 && (zoneIdx !== 2 || baseHy < 15.5)) {
                const hy = Math.max(
                    baseHy,
                    getTerrainHeight(hx - 2.6, hz - 2.6),
                    getTerrainHeight(hx + 2.6, hz - 2.6),
                    getTerrainHeight(hx - 2.6, hz + 2.6),
                    getTerrainHeight(hx + 2.6, hz + 2.6)
                );
                const roll = rng();
                let bType = 'cottage';
                let allowWall = true;
                if (zoneIdx === 1) {
                    if (roll < 0.18) bType = 'ruin';
                    else if (roll < 0.60) bType = 'adobe';
                    else bType = 'kasbah';
                } else if (zoneIdx === 2) {
                    if (roll < 0.18) bType = 'ruin';
                    else if (roll < 0.65) bType = 'chalet';
                    else if (roll < 0.85) bType = 'farmhouse';
                    else bType = 'bunker';
                } else if (zoneIdx === 6) {
                    allowWall = false;
                    bType = (roll < 0.55) ? 'spire' : 'rock';
                } else if (zoneIdx === 7) {
                    allowWall = false;
                    bType = (roll < 0.55) ? 'canyonTower' : 'rock';
                } else if (zoneIdx === 8) {
                    allowWall = false;
                    if (roll < 0.42) bType = 'obelisk';
                    else if (roll < 0.76) bType = 'colonnade';
                    else bType = 'kasbah';
                } else if (zoneIdx === 9) {
                    allowWall = false;
                    bType = 'jungleTemple';
                } else if (zoneIdx === 10) {
                    allowWall = false;
                    bType = (roll < 0.52) ? 'tholos' : 'stoa';
                } else if (zoneIdx === 11) {
                    allowWall = false;
                    bType = (roll < 0.55) ? 'romanArch' : 'pantheon';
                } else {
                    if (roll < 0.18) bType = 'ruin';
                    else if (roll < 0.42) bType = 'cottage';
                    else if (roll < 0.66) bType = 'farmhouse';
                    else if (roll < 0.84) bType = 'townhouse';
                    else bType = 'barn';
                }
                const bScale = 0.95 + rng() * 0.25;
                const bRot = rng() * Math.PI * 2;
                if (bType === 'rock') {
                    rocks.push({ x: hx, y: baseHy - 0.2, z: hz, scale: bScale, rot: bRot, zoneIdx });
                } else {
                    let kind = 'house';
                    if (zoneIdx === 1 || zoneIdx === 8) kind = 'adobe';
                    else if (zoneIdx === 6) kind = 'monumentSpire';
                    else if (zoneIdx === 7) kind = 'canyonTower';
                    houses.push({ x: hx, y: hy, z: hz, rot: bRot, scale: bScale, kind, zoneIdx, radius: 5.5 * bScale });
                }
                if (allowWall && rng() < 0.60) {
                    rng();
                    rng();
                }
            }
        }
    }

    // 2. Exact deterministic rocks pass
    const rockProb = (zoneIdx === 6 || zoneIdx === 7) ? (isMobile ? 0.65 : 0.94)
                   : (zoneIdx === 2 || zoneIdx === 4) ? (isMobile ? 0.55 : 0.90)
                   : (zoneIdx === 1 || zoneIdx === 3 || zoneIdx === 5 || zoneIdx === 8 || zoneIdx === 10 || zoneIdx === 11) ? (isMobile ? 0.45 : 0.80)
                   : (isMobile ? 0.35 : 0.70);
    const maxExtraRocks = (zoneIdx === 6 || zoneIdx === 7) ? (isMobile ? 2 : 4)
                        : (zoneIdx === 2 || zoneIdx === 4) ? (isMobile ? 2 : 3)
                        : (isMobile ? 1 : 2);
    const rockCount = (distFromSpawn > 20 && (!isVillage || zoneIdx === 6 || zoneIdx === 7) && rng() < rockProb)
        ? (1 + Math.floor(rng() * maxExtraRocks))
        : 0;

    for (let r = 0; r < rockCount; r++) {
        const rx = xMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
        const rz = zMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
        if (Math.hypot(rx, rz) < 26) continue;
        if (Math.hypot(rx + 19, rz - 22) < 18) continue;
        if (getRoadFactor(rx, rz) > 0.25) continue;
        if (getRiverDistance(rx, rz) < 11.0) continue;
        const ry = getTerrainHeight(rx, rz);
        if (ry < -2.0) continue;
        if (zoneIdx === 2 && ry > 65.0) continue;
        const rs = (zoneIdx === 6 || zoneIdx === 7 ? 1.25 : zoneIdx === 2 ? 1.15 : 1.0) + rng() * (zoneIdx === 6 ? 0.85 : 0.50);
        const rot = rng() * Math.PI * 2;
        rocks.push({ x: rx, y: ry - 0.2, z: rz, scale: rs, rot, zoneIdx });
    }

    // 3. Exact deterministic trees pass with exact tree-type classification
    const forestNoise = fbm3((chunkCenterX + seedOffset.x) * 0.0022, (chunkCenterZ + seedOffset.z) * 0.0022) * 0.5 + 0.5;
    const targetTreeCount = getChunkTargetTreeCount(chunkCenterX, chunkCenterZ, forestNoise, zoneIdx, isVillage, isMobile, rng);
    const treeGroves = createChunkTreeGroves(xMin, zMin, targetTreeCount, rng);

    for (let t = 0; t < targetTreeCount; t++) {
        const [tx, tz] = pickClusteredTreePosition(xMin, zMin, treeGroves, isVillage, zoneIdx, rng);
        if (tx === null) continue;
        if (Math.hypot(tx, tz) < 20) continue;
        if (getRoadFactor(tx, tz) > 0.20) continue;
        if (getRiverDistance(tx, tz) < 13.0) continue;

        let collidesBuilding = false;
        for (let b = 0; b < houses.length; b++) {
            const bldg = houses[b];
            if (Math.hypot(tx - bldg.x, tz - bldg.z) < (bldg.radius || 5.5) + 1.8) {
                collidesBuilding = true;
                break;
            }
        }
        if (!collidesBuilding && zoneStaticBuildings) {
            for (let b = 0; b < zoneStaticBuildings.length; b++) {
                const bldg = zoneStaticBuildings[b];
                if (Math.hypot(tx - bldg.x, tz - bldg.z) < (bldg.radius || 18.0) + 2.5) {
                    collidesBuilding = true;
                    break;
                }
            }
        }
        if (collidesBuilding) continue;

        const ty = getTerrainHeight(tx, tz);
        if (ty < -2.4) continue;
        if (zoneIdx === 2 && ty > 17.0) continue;

        const treeRoll = rng();
        let cat = 'broadleaf';
        let sizeMult = 1.0;
        let isAcacia = false;
        if (zoneIdx === 1) {
            const nearOasis = Math.hypot(tx - 58.0, tz - 78.0) < 88.0;
            if (nearOasis || isVillage || (ty < 1.8 && treeRoll < 0.65)) {
                if (treeRoll < 0.78 || nearOasis) {
                    const pVar = Math.floor(rng() * (sharedPalmGeos.length || 1));
                    cat = 'palm';
                    sizeMult = (pVar === 1 ? 1.15 : pVar === 3 ? 0.68 : pVar === 2 ? 0.88 : 1.0);
                } else {
                    cat = 'acacia';
                    isAcacia = true;
                }
            } else {
                if (treeRoll < 0.48) {
                    const cVar = Math.floor(rng() * (sharedCactusGeos.length || 1));
                    cat = 'cactus';
                    sizeMult = (cVar === 1 ? 1.2 : cVar === 2 ? 0.92 : 1.0);
                } else if (treeRoll < 0.74 && sharedJoshuaTreeGeo) {
                    cat = 'acacia';
                    sizeMult = 0.78;
                } else {
                    cat = 'acacia';
                    isAcacia = true;
                }
            }
        } else if (zoneIdx === 2) {
            cat = (treeRoll < 0.90) ? 'conifer' : 'broadleaf';
        } else if (zoneIdx === 3) {
            if (treeRoll < 0.56) cat = 'broadleaf';
            else if (treeRoll < 0.72) cat = 'cypress';
            else cat = 'conifer';
        } else if (zoneIdx === 4) {
            cat = (treeRoll < 0.85) ? 'conifer' : 'broadleaf';
        } else if (zoneIdx === 5) {
            cat = (treeRoll >= 0.74 && treeRoll < 0.88) ? 'cypress' : 'broadleaf';
        } else if (zoneIdx === 6) {
            if (treeRoll < 0.42 && sharedJoshuaTreeGeo) { cat = 'acacia'; sizeMult = 0.78; }
            else if (treeRoll < 0.70) { cat = 'acacia'; isAcacia = true; }
            else if (sharedCactusGeo) cat = 'cactus';
            else cat = 'conifer';
        } else if (zoneIdx === 7) {
            if (treeRoll < 0.78) cat = 'conifer';
            else if (sharedAcaciaGeo) { cat = 'acacia'; isAcacia = true; }
            else cat = 'broadleaf';
        } else if (zoneIdx === 8) {
            if (treeRoll < 0.82) {
                const pVar = Math.floor(rng() * (sharedPalmGeos.length || 1));
                cat = 'palm';
                sizeMult = (pVar === 1 ? 1.2 : pVar === 3 ? 0.7 : 1.0);
            } else {
                cat = 'acacia';
                isAcacia = true;
            }
        } else if (zoneIdx === 9) {
            if (treeRoll < 0.62 && sharedJungleTreeGeo) { cat = 'broadleaf'; sizeMult = 1.55; }
            else if (treeRoll < 0.76) { cat = 'palm'; sizeMult = 1.15; }
            else cat = 'broadleaf';
        } else if (zoneIdx === 10 || zoneIdx === 11) {
            if (treeRoll < 0.46) cat = 'cypress';
            else if (treeRoll < 0.76) cat = 'conifer';
            else cat = 'broadleaf';
        } else {
            if (ty < 1.2 && treeRoll < 0.42) cat = 'broadleaf';
            else if (isVillage) cat = (treeRoll < 0.38) ? 'cypress' : 'broadleaf';
            else if (forestNoise > 0.52) cat = (treeRoll < 0.68) ? 'conifer' : 'broadleaf';
            else cat = (treeRoll < 0.62) ? 'conifer' : 'broadleaf';
        }

        const scale = isAcacia ? (0.80 + rng() * 0.45) : (0.85 + rng() * 0.55);
        const rot = rng() * Math.PI * 2;
        rng(); // Consume phase RNG to stay 100% locked with TerrainChunk.populateChunkContent
        trees.push({ x: tx, y: ty, z: tz, scale: scale * sizeMult, rot, cat, zoneIdx });
    }

    const entry = { houses, rocks, trees };
    farChunkPropCache.set(key, entry);
    return entry;
}

function updateFarPropLODs(playerX, playerZ, force, isMobile) {
    const playerCX = Math.floor(playerX / CHUNK_SIZE);
    const playerCZ = Math.floor(playerZ / CHUNK_SIZE);
    if (!force && playerCX === farPropLastCX && playerCZ === farPropLastCZ) return;
    farPropLastCX = playerCX;
    farPropLastCZ = playerCZ;

    ensureFarLodInstancedMeshes(isMobile);

    const innerRadius = isMobile ? 2 : VIEW_RADIUS;
    const outerRadius = isMobile ? 10 : 16; // Up to 1,280m radius for trees, rocks & houses
    const counts = { conifer: 0, cypress: 0, broadleaf: 0, palm: 0, acacia: 0, cactus: 0, rock: 0, sandstoneRock: 0, house: 0, adobe: 0, butte: 0, monumentSpire: 0, canyonCliff: 0, canyonTower: 0 };
    const innerCounts = { conifer: 0, cypress: 0, broadleaf: 0, palm: 0, acacia: 0, cactus: 0, rock: 0, sandstoneRock: 0, house: 0, adobe: 0, butte: 0, monumentSpire: 0, canyonCliff: 0, canyonTower: 0 };
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    // Evict stale cache entries outside outerRadius + 3
    for (const [k] of farChunkPropCache.entries()) {
        const [cxStr, czStr] = k.split(',');
        if (Math.abs(Number(cxStr) - playerCX) > outerRadius + 3 || Math.abs(Number(czStr) - playerCZ) > outerRadius + 3) {
            farChunkPropCache.delete(k);
        }
    }

    for (let dx = -outerRadius; dx <= outerRadius; dx++) {
        for (let dz = -outerRadius; dz <= outerRadius; dz++) {
            const cKey = `${playerCX + dx},${playerCZ + dz}`;
            const isInner = (Math.abs(dx) <= innerRadius && Math.abs(dz) <= innerRadius && activeChunks.has(cKey));
            const targetMeshes = isInner ? reflInnerLodMeshes : farLodMeshes;
            const targetCounts = isInner ? innerCounts : counts;
            const props = getFarChunkProps(playerCX + dx, playerCZ + dz, isMobile);

            for (let i = 0; i < props.trees.length; i++) {
                const tr = props.trees[i];
                const mesh = targetMeshes[tr.cat];
                if (!mesh || targetCounts[tr.cat] >= mesh.instanceMatrix.count) continue;
                dummy.position.set(tr.x, tr.y, tr.z);
                dummy.rotation.set(0, tr.rot, 0);
                dummy.scale.setScalar(tr.scale);
                dummy.updateMatrix();
                const idx = targetCounts[tr.cat]++;
                mesh.setMatrixAt(idx, dummy.matrix);
                if (tr.zoneIdx === 4) col.setRGB(0.68, 0.78, 0.85);
                else if (tr.zoneIdx === 9) col.setRGB(0.45, 0.62, 0.34);
                else col.setRGB(0.75, 0.82, 0.72);
                mesh.setColorAt(idx, col);
            }

            for (let i = 0; i < props.rocks.length; i++) {
                const rk = props.rocks[i];
                const isSandstone = (rk.zoneIdx === 1 || rk.zoneIdx === 6 || rk.zoneIdx === 7 || rk.zoneIdx === 8);
                const rKey = isSandstone ? 'sandstoneRock' : 'rock';
                const mesh = targetMeshes[rKey];
                if (!mesh || targetCounts[rKey] >= mesh.instanceMatrix.count) continue;
                dummy.position.set(rk.x, rk.y, rk.z);
                dummy.rotation.set(0, rk.rot, 0);
                dummy.scale.setScalar(rk.scale);
                dummy.updateMatrix();
                const idx = targetCounts[rKey]++;
                mesh.setMatrixAt(idx, dummy.matrix);
                if (rk.zoneIdx === 6 || rk.zoneIdx === 7) col.setRGB(0.88, 0.39, 0.24);
                else if (rk.zoneIdx === 1 || rk.zoneIdx === 8) col.setHex(0xebae75);
                else if (rk.zoneIdx === 10) col.setHex(0xd8d2c6);
                else if (rk.zoneIdx === 2 || rk.zoneIdx === 4) col.setHex(0x6e7680);
                else col.setHex(0x6e6a60);
                mesh.setColorAt(idx, col);
            }

            for (let i = 0; i < props.houses.length; i++) {
                const hs = props.houses[i];
                const mesh = targetMeshes[hs.kind];
                if (!mesh || targetCounts[hs.kind] >= mesh.instanceMatrix.count) continue;
                dummy.position.set(hs.x, hs.y - 0.1, hs.z);
                dummy.rotation.set(0, hs.rot, 0);
                dummy.scale.setScalar(hs.scale);
                dummy.updateMatrix();
                const idx = targetCounts[hs.kind]++;
                mesh.setMatrixAt(idx, dummy.matrix);
                col.setRGB(1.0, 1.0, 1.0);
                mesh.setColorAt(idx, col);
            }
        }
    }

    for (const key of Object.keys(farLodMeshes)) {
        const mesh = farLodMeshes[key];
        if (mesh) {
            mesh.count = counts[key];
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        const innerMesh = reflInnerLodMeshes[key];
        if (innerMesh) {
            innerMesh.count = innerCounts[key];
            innerMesh.instanceMatrix.needsUpdate = true;
            if (innerMesh.instanceColor) innerMesh.instanceColor.needsUpdate = true;
        }
    }
}

function updateFarTerrainAndTrees(playerX, playerZ, force = false) {
    if (environmentMode === 'studio' || !envGroup) return;
    const isMobile = (typeof window.isMobileBrowser === "function" && window.isMobileBrowser()) || (typeof window.isMobileDevice === "function" && window.isMobileDevice());

    if (!farTerrainGroup) {
        farTerrainGroup = new THREE.Group();
        envGroup.add(farTerrainGroup);
    }

    updateFarPropLODs(playerX, playerZ, force, isMobile);

    const snapStep = CHUNK_SIZE * 2; // 160m snap prevents terrain vertex swimming
    const snapX = Math.round(playerX / snapStep) * snapStep;
    const snapZ = Math.round(playerZ / snapStep) * snapStep;
    if (!force && snapX === farLastSnapX && snapZ === farLastSnapZ) return;
    farLastSnapX = snapX;
    farLastSnapZ = snapZ;

    if (farMidMesh) {
        farTerrainGroup.remove(farMidMesh);
        farMidMesh.geometry.dispose();
        farMidMesh = null;
    }
    if (farOuterMesh) {
        farTerrainGroup.remove(farOuterMesh);
        farOuterMesh.geometry.dispose();
        farOuterMesh = null;
    }

    const currentViewRadius = isMobile ? 2 : VIEW_RADIUS;
    const innerSkip = Math.max(80, currentViewRadius * CHUNK_SIZE - 24);
    farMidMesh = buildFarRingMesh(snapX, snapZ, 1280, 24, innerSkip, -0.45, true);
    farOuterMesh = buildFarRingMesh(snapX, snapZ, isMobile ? 2800 : 4480, 128, 1152, -1.6, false);
    farMidMesh.layers.enable(2);
    farOuterMesh.layers.enable(2);
    farTerrainGroup.add(farMidMesh);
    farTerrainGroup.add(farOuterMesh);
}
window.updateFarTerrainAndTrees = updateFarTerrainAndTrees;

// ============================================================================
// 9. TREE DESTRUCTION & PERSISTENCE
// ============================================================================
function hitTree(tree, hitDir, force = 3.5, isRemote = false) {
    if (!tree || tree.isFallen) return;
    tree.isFallen = true;
    // Gentle initial impulse so tree starts tipping slowly, not snapping down
    tree.angularVel = Math.min(0.35, Math.max(0.12, (force || 1.0) * 0.05));

    const hDir = new THREE.Vector3(hitDir ? hitDir.x : 0, 0, hitDir ? hitDir.z : 1).normalize();
    if (hDir.lengthSq() < 0.001) hDir.set(0, 0, 1);

    if (tree.id) {
        sessionFallenTrees.add(tree.id);
        sessionFallenTreesMeta.set(tree.id, { dx: hDir.x, dz: hDir.z });
        if (!isRemote && window.networkManager && typeof window.networkManager.sendTreeHit === 'function') {
            window.networkManager.sendTreeHit(tree.id, hDir.x, hDir.z, force);
        }
    }

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
window.sessionFallenTrees = sessionFallenTrees;
window.sessionFallenTreesMeta = sessionFallenTreesMeta;
window.applyRemoteTreeHit = function (treeId, dx, dz, force = 3.5) {
    if (!treeId) return;
    sessionFallenTrees.add(treeId);
    sessionFallenTreesMeta.set(treeId, { dx: dx || 0, dz: dz || 1 });
    for (let i = 0; i < swayTrees.length; i++) {
        if (swayTrees[i] && swayTrees[i].id === treeId) {
            hitTree(swayTrees[i], { x: dx || 0, z: dz || 1 }, force, true);
            break;
        }
    }
};

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
        villageMat.normalScale = new THREE.Vector2(1.35, 1.35);
        villageMat.roughnessMap = vAtlas.roughness;
        villageMat.needsUpdate = true;
    }

    if (!terrainUniforms.uTerrainNormalAtlas.value) {
        terrainUniforms.uTerrainNormalAtlas.value = getTerrainNormalAtlas();
    }

    if (!sharedRockNormalMap) sharedRockNormalMap = createRockNormalMap();
    [rockMat, desertRockMat, mountainRockMat].forEach(mat => {
        mat.normalMap = sharedRockNormalMap;
        mat.normalScale = new THREE.Vector2(0.55, 0.55);
        mat.needsUpdate = true;
    });

    if (!sharedMonumentSandstonePBR) sharedMonumentSandstonePBR = createMonumentSandstonePBR();
    [monumentRockMat, canyonRockMat].forEach(mat => {
        mat.map = sharedMonumentSandstonePBR.albedo;
        mat.normalMap = sharedMonumentSandstonePBR.normal;
        mat.normalScale = new THREE.Vector2(0.55, 0.55);
        mat.needsUpdate = true;
    });

    if (!sharedEgyptLimestonePBR) sharedEgyptLimestonePBR = createEgyptLimestonePBR();
    egyptSandstoneMat.map = sharedEgyptLimestonePBR.albedo;
    egyptSandstoneMat.normalMap = sharedEgyptLimestonePBR.normal;
    egyptSandstoneMat.normalScale = new THREE.Vector2(0.92, 0.92);
    egyptSandstoneMat.needsUpdate = true;

    if (!sharedJungleTemplePBR) sharedJungleTemplePBR = createJungleTemplePBR();
    jungleTempleMat.map = sharedJungleTemplePBR.albedo;
    jungleTempleMat.normalMap = sharedJungleTemplePBR.normal;
    jungleTempleMat.normalScale = new THREE.Vector2(0.60, 0.60);
    jungleTempleMat.needsUpdate = true;
    jungleRockMat.map = sharedJungleTemplePBR.albedo;
    jungleRockMat.normalMap = sharedJungleTemplePBR.normal;
    jungleRockMat.normalScale = new THREE.Vector2(0.60, 0.60);
    jungleRockMat.needsUpdate = true;

    if (!sharedGreekMarblePBR) sharedGreekMarblePBR = createGreekMarblePBR();
    greekMarbleMat.map = sharedGreekMarblePBR.albedo;
    greekMarbleMat.normalMap = sharedGreekMarblePBR.normal;
    greekMarbleMat.normalScale = new THREE.Vector2(0.92, 0.92);
    greekMarbleMat.needsUpdate = true;

    if (!sharedRomanTravertinePBR) sharedRomanTravertinePBR = createRomanTravertinePBR();
    romanTravertineMat.map = sharedRomanTravertinePBR.albedo;
    romanTravertineMat.normalMap = sharedRomanTravertinePBR.normal;
    romanTravertineMat.normalScale = new THREE.Vector2(0.50, 0.50);
    romanTravertineMat.needsUpdate = true;

    ensureSharedGeometries();
    if (!sharedSmokeTex) sharedSmokeTex = createSmokeCanvasTexture();
    if (!sharedFireTex) sharedFireTex = createFireCanvasTexture();
}

function createZoneWaterMaterial() {
    const rippleTex = (typeof window.createWaterRippleTexture === 'function') ? window.createWaterRippleTexture() : null;
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSeedOffset: terrainUniforms.uSeedOffset,
            uRoadBaseX: terrainUniforms.uRoadBaseX,
            uRoad2BaseZ: terrainUniforms.uRoad2BaseZ,
            uRoad3BaseX: terrainUniforms.uRoad3BaseX,
            uRoad4BaseX: terrainUniforms.uRoad4BaseX,
            uZoneType: terrainUniforms.uZoneType,
            uSpawnZone: terrainUniforms.uSpawnZone,
            uSunDir: terrainUniforms.uSunDir,
            uSunColor: terrainUniforms.uSunColor,
            uSkyColor: terrainUniforms.uSkyColor,
            uSkyTopColor: terrainUniforms.uSkyTopColor,
            uHazeStrength: terrainUniforms.uHazeStrength,
            tRippleMap: { value: rippleTex },
            tReflection: { value: null },
            uReflectVP: { value: new THREE.Matrix4() },
            uHasReflection: { value: 0.0 },
            uCloudTex: (window.celestialLighting && window.celestialLighting.cloudTex) ? window.celestialLighting.cloudTex : { value: null },
            uCloudShadowParams: (window.celestialLighting && window.celestialLighting.cloudShadowParams) ? window.celestialLighting.cloudShadowParams : { value: new THREE.Vector4(0, 0.48, 0.0018, 0.74) },
            uCloudTime: (window.celestialLighting && window.celestialLighting.time) ? window.celestialLighting.time : { value: 0 },
            uCloudSunDir: (window.celestialLighting && window.celestialLighting.sunDirection) ? window.celestialLighting.sunDirection : { value: new THREE.Vector3(0, 1, 0) }
        },
        transparent: true,
        depthWrite: false,
        fog: false,
        vertexShader: `
            uniform float uTime;
            uniform mat4 uReflectVP;
            varying vec3 vWorldPos;
            varying float vWaveHeight;
            varying vec4 vReflClip;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                float waveScale = mix(0.10, 1.0, smoothstep(120.0, 240.0, wp.z));
                float w1 = sin(wp.x * 0.032 + uTime * 1.45) * cos(wp.z * 0.026 + uTime * 1.15) * 0.22 * waveScale;
                float w2 = sin(wp.x * 0.085 - wp.z * 0.065 + uTime * 2.15) * 0.09 * waveScale;
                float w3 = cos(wp.z * 0.16 + uTime * 2.85) * 0.04 * waveScale;
                wp.y += w1 + w2 + w3;
                vWaveHeight = w1 + w2 + w3;
                vWorldPos = wp.xyz;
                vReflClip = uReflectVP * vec4(wp.x, -2.5, wp.z, 1.0);
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform vec3 uSkyColor;
            uniform vec3 uSkyTopColor;
            uniform float uHazeStrength;
            uniform float uSssStrength;
            uniform sampler2D tRippleMap;
            uniform sampler2D tReflection;
            uniform float uHasReflection;
            ${CLOUD_SHADOW_GLSL}
            varying vec3 vWorldPos;
            varying float vWaveHeight;
            varying vec4 vReflClip;
            ${SHARED_TERRAIN_GLSL}
            ${BABYLON_HAZE_GLSL}

            void main() {
                float terrainY = getTerrainHeight_gpu(vWorldPos.x, vWorldPos.z);
                float waterDepth = (-2.5) - terrainY;
                if (waterDepth < -0.25) discard;

                vec2 p = vWorldPos.xz;
                float distToCam = length(p - cameraPosition.xz);

                // Babylon-inspired 4-scale LEAN/Stokes ripple sampling (43m, 11.7m, 3.1m, 0.83m)
                vec4 r0 = texture2D(tRippleMap, p / 43.0  + vec2( uTime * 0.014,  uTime * 0.009));
                vec4 r1 = texture2D(tRippleMap, p / 11.7  + vec2(-uTime * 0.024,  uTime * 0.018));
                vec4 r2 = texture2D(tRippleMap, p / 3.1   + vec2( uTime * 0.045, -uTime * 0.032));
                vec4 r3 = texture2D(tRippleMap, p / 0.83  + vec2(-uTime * 0.070, -uTime * 0.055));

                float detailFade = 1.0 - smoothstep(120.0, 900.0, distToCam);
                vec2 slope = (r0.rg - 0.5) * 0.16
                           + (r1.rg - 0.5) * 0.24
                           + (r2.rg - 0.5) * (0.28 * (0.25 + 0.75 * detailFade))
                           + (r3.rg - 0.5) * (0.20 * detailFade);
                float slopeVar = r0.b * 0.2 + r1.b * 0.3 + r2.b * 0.3 + r3.b * 0.2;

                vec3 N = normalize(vec3(-slope.x * 1.15, 1.0, -slope.y * 1.15));
                vec3 V = normalize(cameraPosition - vWorldPos);
                vec3 L = normalize(uSunDir);
                vec3 H = normalize(L + V);
                vec3 R = reflect(-V, N);

                // Schlick Fresnel (Babylon water.js: 0.02 + 0.98 * (1 - NdotV)^5)
                float NdotV = max(dot(N, V), 0.0);
                float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

                // Dual-lobe sun glitter modulated by LEAN slope variance
                float sunVis = smoothstep(-0.04, 0.14, L.y);
                float sharpPow = mix(280.0, 120.0, clamp(slopeVar, 0.0, 1.0));
                float spec = (pow(max(dot(N, H), 0.0), sharpPow) * 3.2 + pow(max(dot(N, H), 0.0), 32.0) * 0.35) * sunVis;

                // Zone-adapted water colors (turquoise desert oasis, glacial alpine tarn, coastal sea)
                vec3 deepCol = vec3(0.02, 0.12, 0.24);
                vec3 midCol = vec3(0.04, 0.25, 0.36);
                vec3 shallowCol = vec3(0.10, 0.42, 0.44);
                float wWater[12];
                getZoneWeights12_gpu(vWorldPos.xz, wWater);
                deepCol = mix(deepCol, vec3(0.02, 0.20, 0.26), wWater[1]);
                midCol = mix(midCol, vec3(0.05, 0.36, 0.38), wWater[1]);
                shallowCol = mix(shallowCol, vec3(0.14, 0.54, 0.48), wWater[1]);
                deepCol = mix(deepCol, vec3(0.02, 0.14, 0.28), wWater[2]);
                midCol = mix(midCol, vec3(0.05, 0.28, 0.42), wWater[2]);
                shallowCol = mix(shallowCol, vec3(0.12, 0.46, 0.54), wWater[2]);
                deepCol = mix(deepCol, vec3(0.18, 0.32, 0.44), wWater[4]);
                midCol = mix(midCol, vec3(0.35, 0.50, 0.62), wWater[4]);
                shallowCol = mix(shallowCol, vec3(0.60, 0.75, 0.85), wWater[4]);
                deepCol = mix(deepCol, vec3(0.03, 0.10, 0.08), wWater[5]);
                midCol = mix(midCol, vec3(0.06, 0.18, 0.14), wWater[5]);
                shallowCol = mix(shallowCol, vec3(0.12, 0.32, 0.22), wWater[5]);
                deepCol = mix(deepCol, vec3(0.18, 0.08, 0.04), wWater[6]);
                midCol = mix(midCol, vec3(0.28, 0.12, 0.06), wWater[6]);
                shallowCol = mix(shallowCol, vec3(0.42, 0.18, 0.09), wWater[6]);
                deepCol = mix(deepCol, vec3(0.06, 0.12, 0.10), wWater[7]);
                midCol = mix(midCol, vec3(0.12, 0.22, 0.16), wWater[7]);
                shallowCol = mix(shallowCol, vec3(0.24, 0.34, 0.22), wWater[7]);
                deepCol = mix(deepCol, vec3(0.01, 0.14, 0.32), wWater[8]);
                midCol = mix(midCol, vec3(0.03, 0.28, 0.48), wWater[8]);
                shallowCol = mix(shallowCol, vec3(0.08, 0.48, 0.62), wWater[8]);
                deepCol = mix(deepCol, vec3(0.02, 0.12, 0.08), wWater[9]);
                midCol = mix(midCol, vec3(0.04, 0.24, 0.14), wWater[9]);
                shallowCol = mix(shallowCol, vec3(0.10, 0.42, 0.24), wWater[9]);
                deepCol = mix(deepCol, vec3(0.01, 0.16, 0.36), wWater[10]);
                midCol = mix(midCol, vec3(0.03, 0.34, 0.56), wWater[10]);
                shallowCol = mix(shallowCol, vec3(0.10, 0.58, 0.72), wWater[10]);
                deepCol = mix(deepCol, vec3(0.02, 0.14, 0.28), wWater[11]);
                midCol = mix(midCol, vec3(0.05, 0.28, 0.44), wWater[11]);
                shallowCol = mix(shallowCol, vec3(0.12, 0.46, 0.56), wWater[11]);

                float depthFactor = clamp(waterDepth / 9.0, 0.0, 1.0);
                vec3 waterCol = mix(shallowCol, midCol, smoothstep(0.0, 0.45, depthFactor));
                waterCol = mix(waterCol, deepCol, smoothstep(0.35, 1.0, depthFactor));
                // Lit turbid scattering
                float cloudLit = sampleCloudShadowFactor(vWorldPos, uCloudSunDir, uCloudTime, uCloudTex, uCloudShadowParams);
                float dayLit = clamp(L.y * 1.4 + 0.35, 0.15, 1.15) * mix(0.28, 1.0, cloudLit);
                waterCol *= dayLit;

                // Analytical sky reflection fallback
                float skyGrad = clamp(R.y * 0.7 + 0.15, 0.0, 1.0);
                vec3 skyRefl = mix(uSkyColor * 0.92, uSkyTopColor * 0.85, skyGrad);
                skyRefl += uSunColor * pow(max(dot(R, L), 0.0), 10.0) * 0.35 * sunVis * cloudLit;

                // Babylon-style planar reflection with 4-tap anisotropic wave-jittered lookup
                vec3 envRefl = skyRefl;
                if (uHasReflection > 0.5 && vReflClip.w > 0.05) {
                    vec2 baseUV = (vReflClip.xy / vReflClip.w) * 0.5 + 0.5;
                    vec2 distort = N.xz * mix(0.055, 0.018, clamp(distToCam / 400.0, 0.0, 1.0));
                    vec2 uvR = baseUV + distort;
                    float edgeFade = smoothstep(0.0, 0.06, uvR.x) * smoothstep(1.0, 0.94, uvR.x)
                                   * smoothstep(0.0, 0.06, uvR.y) * smoothstep(1.0, 0.94, uvR.y);
                    if (edgeFade > 0.01) {
                        vec2 j1 = vec2(0.0022, 0.0045);
                        vec2 j2 = vec2(-0.0022, 0.0025);
                        vec3 reflTex = (
                            texture2D(tReflection, clamp(uvR + j1, 0.002, 0.998)).rgb +
                            texture2D(tReflection, clamp(uvR - j1, 0.002, 0.998)).rgb +
                            texture2D(tReflection, clamp(uvR + j2, 0.002, 0.998)).rgb +
                            texture2D(tReflection, clamp(uvR - j2, 0.002, 0.998)).rgb
                        ) * 0.25;
                        envRefl = mix(skyRefl, reflTex, edgeFade * 0.92);
                    }
                }

                waterCol = mix(waterCol, envRefl, clamp(fresnel * 0.92 + 0.04, 0.0, 0.96));
                waterCol += uSunColor * spec * cloudLit;

                // Fine multi-scale foam noise and lacy cellular breakup
                vec4 rFoam = texture2D(tRippleMap, p / 0.37 + vec2(uTime * 0.085, -uTime * 0.062));
                float foamWarp = (r0.a - 0.5) * 2.4 + (r1.a - 0.5) * 1.8 + (r2.a - 0.5) * 1.1;
                float lacyDetail = clamp(0.38 * r2.a + 0.37 * r3.a + 0.25 * rFoam.a, 0.0, 1.0);
                float foamFilaments = 1.0 - smoothstep(0.0, 0.36, abs(r3.a - 0.5));
                float microBreakup = smoothstep(0.34, 0.78, lacyDetail) * (0.45 + 0.55 * foamFilaments);

                // Inward-flowing surf wavelets (+uTime moves crests toward waterDepth = 0, i.e. toward land)
                float surfWaveA = sin(waterDepth * 14.0 + uTime * 2.5 + foamWarp);
                float surfWaveB = sin(waterDepth * 23.0 + uTime * 3.3 - foamWarp * 0.65 + 1.9);
                float crestA = pow(max(surfWaveA, 0.0), 5.0);
                float crestB = pow(max(surfWaveB, 0.0), 6.0);

                // Thin, delicate shoreline contact foam and narrow shallow-water ripples
                float shoreEdge = (1.0 - smoothstep(0.0, 0.38, max(waterDepth, 0.0)))
                                * smoothstep(-0.14, 0.04, waterDepth)
                                * (0.35 + 0.65 * crestA)
                                * (0.28 + 0.72 * microBreakup);
                float primaryRipple = smoothstep(0.02, 0.22, waterDepth)
                                    * (1.0 - smoothstep(0.35, 1.35, waterDepth))
                                    * crestA
                                    * smoothstep(0.24, 0.72, lacyDetail);
                float secondaryRipple = smoothstep(0.18, 0.55, waterDepth)
                                      * (1.0 - smoothstep(0.75, 1.85, waterDepth))
                                      * crestB
                                      * smoothstep(0.30, 0.78, lacyDetail)
                                      * (0.35 + 0.65 * detailFade);
                float whitecap = smoothstep(0.24, 0.38, vWaveHeight + (r2.a - 0.5) * 0.14 + (r3.a - 0.5) * 0.10)
                               * smoothstep(1.5, 5.0, waterDepth)
                               * smoothstep(0.36, 0.76, lacyDetail) * 0.32;
                float totalFoam = clamp(shoreEdge * 0.52 + primaryRipple * 0.42 + secondaryRipple * 0.26 + whitecap, 0.0, 0.76);

                vec3 foamColor = mix(vec3(0.88, 0.93, 0.96), uSunColor, 0.22) * dayLit;
                waterCol = mix(waterCol, foamColor, totalFoam);

                float riverWaterMask = getRiverFactor_gpu(vWorldPos.x, vWorldPos.z);
                float alphaDepthMax = mix(0.45, 1.05, riverWaterMask);
                float shoreAlpha = smoothstep(-0.18, alphaDepthMax, waterDepth);
                waterCol = applyBabylonAerialHaze(waterCol, vWorldPos, cameraPosition, uSunDir, uSunColor, uSkyColor, uSkyTopColor, uHazeStrength);

                gl_FragColor = vec4(waterCol, clamp(shoreAlpha * 0.94 + totalFoam * 0.06, 0.0, 0.98));
            }
        `
    });
}

function createCoastalOceanMesh() {
    const oceanGeo = new THREE.PlaneGeometry(10000, 10000, 160, 160);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = createZoneWaterMaterial();
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(0, -2.5, 0);
    oceanMesh.receiveShadow = true;
    oceanMesh.renderOrder = -10; // Environmental water surface: always render before transparent particle effects
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
        unloadBuildingInterior(b);
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

    const sigTreeGeo = (currentZoneIndex === 1 || currentZoneIndex === 8) ? ((sharedPalmGeos && sharedPalmGeos[1]) || sharedPalmGeo)
                     : (currentZoneIndex === 3) ? sharedDecidGeo
                     : (currentZoneIndex === 6) ? sharedJoshuaTreeGeo
                     : (currentZoneIndex === 7) ? sharedPineGeo
                     : (currentZoneIndex === 9) ? sharedJungleTreeGeo
                     : (currentZoneIndex === 10 || currentZoneIndex === 11) ? sharedCypressGeo
                     : sharedSpruceGeo;
    const sigTreeType = (currentZoneIndex === 1 || currentZoneIndex === 8) ? 'palm'
                      : (currentZoneIndex === 3) ? 'beech'
                      : (currentZoneIndex === 6) ? 'joshua'
                      : (currentZoneIndex === 7) ? 'pine'
                      : (currentZoneIndex === 9) ? 'jungleCanopy'
                      : (currentZoneIndex === 10 || currentZoneIndex === 11) ? 'cypress'
                      : 'spruce';
    const sigMesh = new THREE.Mesh(sigTreeGeo, treeMaterial);
    sigMesh.rotation.y = 1.15;
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
    const sigBldgGeo = (currentZoneIndex === 1) ? sharedKasbahGeo
                     : (currentZoneIndex === 2 || currentZoneIndex === 4) ? (sharedChaletGeo || sharedMountainBunkerGeo)
                     : (currentZoneIndex === 6) ? sharedMonumentButteGeo
                     : (currentZoneIndex === 7) ? sharedCanyonCliffGeo
                     : (currentZoneIndex === 8) ? sharedGreatPyramidGeo
                     : (currentZoneIndex === 9) ? getJungleStructGeo('junglePalace')
                     : (currentZoneIndex === 10) ? sharedGreekParthenonGeo
                     : (currentZoneIndex === 11) ? sharedRomanColosseumGeo
                     : sharedCottageGeo;
    const cotY = (sigBldgGeo && sigBldgGeo.userData && sigBldgGeo.userData.enterableSpec)
        ? Math.max(
            getTerrainHeight(cotX, cotZ),
            getTerrainHeight(cotX - 2.6, cotZ - 2.6),
            getTerrainHeight(cotX + 2.6, cotZ - 2.6),
            getTerrainHeight(cotX - 2.6, cotZ + 2.6),
            getTerrainHeight(cotX + 2.6, cotZ + 2.6)
        )
        : getTerrainHeight(cotX, cotZ);
    const sigBldgMat = (currentZoneIndex === 6) ? monumentRockMat
                     : (currentZoneIndex === 7) ? canyonRockMat
                     : (currentZoneIndex === 8) ? egyptSandstoneMat
                     : (currentZoneIndex === 9) ? jungleTempleMat
                     : (currentZoneIndex === 10) ? greekMarbleMat
                     : (currentZoneIndex === 11) ? romanTravertineMat
                     : villageMat;
    const cotScale = (currentZoneIndex === 6 || currentZoneIndex === 8 || currentZoneIndex === 9 || currentZoneIndex === 10 || currentZoneIndex === 11) ? 1.14 : 1.05;
    const cotBaseH = (currentZoneIndex === 8) ? 26.5
                   : (currentZoneIndex === 6) ? 24.0
                   : (currentZoneIndex === 11) ? 21.0
                   : (currentZoneIndex === 7) ? 18.0
                   : (currentZoneIndex === 9) ? 7.0
                   : (currentZoneIndex === 10) ? 14.5
                   : 6.6;
    const cotMesh = new THREE.Mesh(sigBldgGeo, sigBldgMat);
    cotMesh.position.set(cotX, cotY - 0.1, cotZ);
    cotMesh.rotation.y = (currentZoneIndex === 8 || currentZoneIndex === 10 || currentZoneIndex === 11) ? 0.18 : 0.42;
    cotMesh.scale.setScalar(cotScale);
    cotMesh.castShadow = true;
    cotMesh.receiveShadow = true;
    zoneStaticGroup.add(cotMesh);
    aimRaycastMeshes.push(cotMesh);
    zoneStaticRaycastMeshes.push(cotMesh);
    const staticCotObj = attachObstacleBox({ mesh: cotMesh, x: cotX, y: cotY, z: cotZ, height: cotBaseH * cotScale, isRuin: false, type: 'house' }, sigBldgGeo, cotScale, cotMesh.rotation.y);
    worldBuildings.push(staticCotObj);
    worldObstacles.push(staticCotObj);
    zoneStaticBuildings.push(staticCotObj);
    zoneStaticObstacles.push(staticCotObj);

    // 3. Signature Tactical Cover Rock Formation near Spawn at (-19.0, 22.0)
    const sigRockX = -19.0;
    const sigRockZ = 22.0;
    const sigRockY = getTerrainHeight(sigRockX, sigRockZ);
    const sigRGeo = (currentZoneIndex === 1) ? sharedSandstoneRockGeo
                  : (currentZoneIndex === 2 || currentZoneIndex === 4) ? sharedMountainRockGeo
                  : (currentZoneIndex === 6) ? sharedMonumentSpireGeo
                  : (currentZoneIndex === 7) ? sharedCanyonTowerGeo
                  : (currentZoneIndex === 8) ? sharedObeliskGeo
                  : (currentZoneIndex === 10) ? sharedGreekTholosGeo
                  : (currentZoneIndex === 11) ? sharedRomanArchGeo
                  : sharedRockGeo;
    const sigRMat = (currentZoneIndex === 1) ? desertRockMat
                  : (currentZoneIndex === 2 || currentZoneIndex === 4) ? mountainRockMat
                  : (currentZoneIndex === 6) ? monumentRockMat
                  : (currentZoneIndex === 7) ? canyonRockMat
                  : (currentZoneIndex === 8) ? egyptSandstoneMat
                  : (currentZoneIndex === 9) ? jungleRockMat
                  : (currentZoneIndex === 10) ? greekMarbleMat
                  : (currentZoneIndex === 11) ? romanTravertineMat
                  : rockMat;
    const sigRockMesh = new THREE.Mesh(sigRGeo, sigRMat);
    sigRockMesh.position.set(sigRockX, sigRockY - 0.25, sigRockZ);
    sigRockMesh.rotation.y = (currentZoneIndex === 10 || currentZoneIndex === 11) ? 0.22 : 0.85;
    const sigRockScale = (currentZoneIndex === 10 || currentZoneIndex === 11) ? 0.92 : 1.2;
    const sigRockBaseH = (currentZoneIndex === 6) ? 24.0
                       : (currentZoneIndex === 8) ? 17.5
                       : (currentZoneIndex === 7) ? 16.0
                       : (currentZoneIndex === 11) ? 15.2
                       : (currentZoneIndex === 10) ? 11.8
                       : 4.8;
    sigRockMesh.scale.setScalar(sigRockScale);
    sigRockMesh.castShadow = true;
    sigRockMesh.receiveShadow = true;
    zoneStaticGroup.add(sigRockMesh);
    aimRaycastMeshes.push(sigRockMesh);
    zoneStaticRaycastMeshes.push(sigRockMesh);
    const sigRockObj = attachObstacleCircle({ mesh: sigRockMesh, x: sigRockX, y: sigRockY, z: sigRockZ, height: sigRockBaseH * sigRockScale, type: 'rock', isRock: true, isRuin: false }, sigRGeo, sigRockScale, sigRockMesh.rotation.y);
    worldBuildings.push(sigRockObj);
    worldObstacles.push(sigRockObj);
    zoneStaticBuildings.push(sigRockObj);
    zoneStaticObstacles.push(sigRockObj);

    // 4. Zone-Specific Iconic Panorama Formations & Groves
    if (currentZoneIndex === 1) {
        // Ring of lush Date Palms framing the Desert Oasis at (58, 78) with distinct variants & natural radial rotation
        for (let p = 0; p < 8; p++) {
            const ang = (p / 8) * Math.PI * 2.0 + 0.25;
            const rad = 36.0 + (p % 2) * 5.0;
            const px = 58.0 + Math.cos(ang) * rad;
            const pz = 78.0 + Math.sin(ang) * rad;
            if (getRoadFactor(px, pz) > 0.2) continue;
            const py = getTerrainHeight(px, pz);
            const pScale = 0.92 + (p % 3) * 0.20;
            const pGroup = new THREE.Group();
            pGroup.position.set(px, py, pz);
            pGroup.scale.setScalar(pScale);

            const pGeo = (sharedPalmGeos && sharedPalmGeos.length > 0)
                ? sharedPalmGeos[p % sharedPalmGeos.length]
                : sharedPalmGeo;
            const pMesh = new THREE.Mesh(pGeo, treeMaterial);
            pMesh.rotation.y = ang + Math.PI * 0.5 + ((p % 2) ? 0.35 : -0.35);
            pMesh.castShadow = true;
            pMesh.receiveShadow = true;
            pMesh.customDepthMaterial = getTreeDepthMaterial();
            pGroup.add(pMesh);
            zoneStaticGroup.add(pGroup);
            aimRaycastMeshes.push(pMesh);
            zoneStaticRaycastMeshes.push(pMesh);
            const pTrunkH = ((p % 4) === 1 ? 13.8 : (p % 4) === 3 ? 7.8 : (p % 4) === 2 ? 10.2 : 11.5);
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
                trunkHeight: pTrunkH * pScale,
                type: 'palm'
            };
            swayTrees.push(palmObj);
            zoneStaticTrees.push(palmObj);
        }
    } else if (currentZoneIndex === 6) {
        // Arizona Monument Valley Panorama: East Mitten Butte, Merrick Butte & Three Sisters Spires
        const monumentFormations = [
            { x: 54.0,  z: 98.0,  geo: sharedMonumentButteGeo, scale: 1.04, rot: -0.68, h: 27.5, type: 'butte' },
            { x: -68.0, z: 84.0,  geo: sharedMonumentButteGeo, scale: 0.94, rot: 1.22,  h: 25.0, type: 'butte' },
            { x: 38.0,  z: 48.0,  geo: sharedMonumentSpireGeo, scale: 1.12, rot: 0.35,  h: 30.0, type: 'spire' },
            { x: -46.0, z: 46.0,  geo: sharedMonumentRockGeo,  scale: 1.75, rot: 1.85,  h: 6.5,  type: 'rock' }
        ];
        monumentFormations.forEach(mf => {
            const my = getTerrainHeight(mf.x, mf.z);
            const mMesh = new THREE.Mesh(mf.geo, monumentRockMat);
            mMesh.position.set(mf.x, my - 0.15, mf.z);
            mMesh.rotation.y = mf.rot;
            mMesh.scale.setScalar(mf.scale);
            mMesh.castShadow = true;
            mMesh.receiveShadow = true;
            zoneStaticGroup.add(mMesh);
            aimRaycastMeshes.push(mMesh);
            zoneStaticRaycastMeshes.push(mMesh);
            const mObj = attachObstacleBox({ mesh: mMesh, x: mf.x, y: my, z: mf.z, height: mf.h, isRuin: false, type: mf.type }, mf.geo, mf.scale, mf.rot);
            worldBuildings.push(mObj);
            worldObstacles.push(mObj);
            zoneStaticBuildings.push(mObj);
            zoneStaticObstacles.push(mObj);
        });
    } else if (currentZoneIndex === 8) {
        // Giza Necropolis Triad: Second Pyramid of Khafre, Third Pyramid of Menkaure & Processional Obelisk/Colonnade
        const egyptMonuments = [
            { x: 58.0,  z: 142.0, geo: sharedGreatPyramidGeo,   scale: 0.82, rot: 0.18, h: 22.0, type: 'pyramid' },
            { x: -74.0, z: 146.0, geo: sharedGreatPyramidGeo,   scale: 0.56, rot: 0.18, h: 15.0, type: 'pyramid' },
            { x: 22.0,  z: 68.0,  geo: sharedObeliskGeo,        scale: 1.15, rot: 0.18, h: 19.0, type: 'obelisk' },
            { x: -42.0, z: 66.0,  geo: sharedEgyptColonnadeGeo, scale: 1.08, rot: 0.18, h: 8.5,  type: 'colonnade' }
        ];
        egyptMonuments.forEach(em => {
            const ey = getTerrainHeight(em.x, em.z);
            const eMesh = new THREE.Mesh(em.geo, egyptSandstoneMat);
            eMesh.position.set(em.x, ey - 0.15, em.z);
            eMesh.rotation.y = em.rot;
            eMesh.scale.setScalar(em.scale);
            eMesh.castShadow = true;
            eMesh.receiveShadow = true;
            zoneStaticGroup.add(eMesh);
            aimRaycastMeshes.push(eMesh);
            zoneStaticRaycastMeshes.push(eMesh);
            const eObj = attachObstacleBox({ mesh: eMesh, x: em.x, y: ey, z: em.z, height: em.h, isRuin: false, type: em.type }, em.geo, em.scale, em.rot);
            worldBuildings.push(eObj);
            worldObstacles.push(eObj);
            zoneStaticBuildings.push(eObj);
            zoneStaticObstacles.push(eObj);
        });
    } else if (currentZoneIndex === 9) {
        // Foreground Stepped Jungle Temple Shrine + Dense Tropical Rainforest Sanctuary Grove framing the Valley
        const templeX = 24.0, templeZ = 62.0;
        const templeY = getTerrainHeight(templeX, templeZ);
        const tMesh = new THREE.Mesh(sharedJungleTempleGeo, jungleTempleMat);
        tMesh.position.set(templeX, templeY - 0.15, templeZ);
        tMesh.rotation.y = -0.38;
        tMesh.scale.setScalar(0.95);
        tMesh.castShadow = true;
        tMesh.receiveShadow = true;
        zoneStaticGroup.add(tMesh);
        aimRaycastMeshes.push(tMesh);
        zoneStaticRaycastMeshes.push(tMesh);
        const tObj = attachObstacleBox({ mesh: tMesh, x: templeX, y: templeY, z: templeZ, height: 14.0, isRuin: false, type: 'jungleTemple' }, sharedJungleTempleGeo, 0.95, -0.38);
        worldBuildings.push(tObj);
        worldObstacles.push(tObj);
        zoneStaticBuildings.push(tObj);
        zoneStaticObstacles.push(tObj);

        const jungleSpots = [
            [-32, 34, 0, 1.22], [30, 26, 0, 1.18], [-44, 58, 1, 1.15], [44, 48, 0, 1.28],
            [-36, 74, 0, 1.25], [42, 76, 1, 1.12], [-52, 92, 0, 1.32], [48, 92, 0, 1.24],
            [14, 38, 1, 1.08],  [-28, 48, 2, 1.14], [34, 112, 0, 1.30], [-48, 122, 0, 1.26],
            [12, 94, 0, 1.20],  [-36, 16, 1, 1.10], [36, 14, 0, 1.16], [-32, 86, 1, 1.12]
        ];
        jungleSpots.forEach(([jx, jz, kind, jScale], idx) => {
            if (getRoadFactor(jx, jz) > 0.22) return;
            const jy = getTerrainHeight(jx, jz);
            const jGroup = new THREE.Group();
            jGroup.position.set(jx, jy, jz);
            jGroup.scale.setScalar(jScale);
            const jGeo = (kind === 0 && sharedJungleTreeGeo) ? sharedJungleTreeGeo
                       : (kind === 1 && sharedPalmGeos && sharedPalmGeos[1]) ? sharedPalmGeos[1]
                       : (sharedWillowGeo || sharedDecidGeo);
            const jType = (kind === 0) ? 'jungleCanopy' : (kind === 1 ? 'palm' : 'willow');
            const jTrunkH = (kind === 0) ? 17.5 : (kind === 1 ? 12.0 : 11.2);
            const jMesh = new THREE.Mesh(jGeo, treeMaterial);
            jMesh.rotation.y = idx * 1.15;
            jMesh.castShadow = true;
            jMesh.receiveShadow = true;
            jMesh.customDepthMaterial = getTreeDepthMaterial();
            jGroup.add(jMesh);
            zoneStaticGroup.add(jGroup);
            aimRaycastMeshes.push(jMesh);
            zoneStaticRaycastMeshes.push(jMesh);
            const jTreeObj = {
                id: `jungle:static:${idx}`,
                group: jGroup,
                mesh: jMesh,
                phase: idx * 0.65,
                x: jx, y: jy, z: jz,
                scale: jScale,
                isFallen: false, fallAngle: 0, angularVel: 0,
                maxFallAngle: Math.PI * 0.48,
                fallAxis: new THREE.Vector3(1, 0, 0),
                radius: 1.45 * jScale,
                trunkHeight: jTrunkH * jScale,
                type: jType
            };
            swayTrees.push(jTreeObj);
            zoneStaticTrees.push(jTreeObj);
        });
    } else if (currentZoneIndex === 10) {
        // Ancient Greece Acropolis & Sanctuary Panorama: Parthenon of Athena, Delphi Tholos Rotunda, Agora Stoa Colonnades & Cypress/Olive Grove
        const greekMonuments = [
            { x: 46.0,  z: 92.0,  geo: sharedGreekParthenonGeo, scale: 0.96, rot: -0.24, h: 16.5, type: 'parthenon' },
            { x: 24.0,  z: 52.0,  geo: sharedGreekTholosGeo,    scale: 1.08, rot: 0.15,  h: 12.0, type: 'tholos' },
            { x: -46.0, z: 64.0,  geo: sharedGreekStoaGeo,      scale: 1.06, rot: 0.32,  h: 9.2,  type: 'stoa' },
            { x: 52.0,  z: 142.0, geo: sharedGreekStoaGeo,      scale: 1.12, rot: -0.45, h: 9.5,  type: 'stoa' }
        ];
        greekMonuments.forEach(gm => {
            const gy = getTerrainHeight(gm.x, gm.z);
            const gMesh = new THREE.Mesh(gm.geo, greekMarbleMat);
            gMesh.position.set(gm.x, gy - 0.15, gm.z);
            gMesh.rotation.y = gm.rot;
            gMesh.scale.setScalar(gm.scale);
            gMesh.castShadow = true;
            gMesh.receiveShadow = true;
            zoneStaticGroup.add(gMesh);
            aimRaycastMeshes.push(gMesh);
            zoneStaticRaycastMeshes.push(gMesh);
            const gObj = attachObstacleBox({ mesh: gMesh, x: gm.x, y: gy, z: gm.z, height: gm.h, isRuin: false, type: gm.type }, gm.geo, gm.scale, gm.rot);
            worldBuildings.push(gObj);
            worldObstacles.push(gObj);
            zoneStaticBuildings.push(gObj);
            zoneStaticObstacles.push(gObj);
        });

        const greekGrove = [
            [-32, 36, 0, 1.25], [34, 34, 0, 1.22], [-38, 86, 1, 1.18], [38, 72, 0, 1.28],
            [-28, 94, 0, 1.24], [14, 78, 1, 1.12], [-52, 48, 0, 1.20], [54, 62, 0, 1.26]
        ];
        greekGrove.forEach(([gx, gz, kind, gScale], idx) => {
            if (getRoadFactor(gx, gz) > 0.22) return;
            const gy = getTerrainHeight(gx, gz);
            const gGroup = new THREE.Group();
            gGroup.position.set(gx, gy, gz);
            gGroup.scale.setScalar(gScale);
            const gGeo = (kind === 0 && sharedCypressGeo) ? sharedCypressGeo : sharedDecidGeo;
            const gType = (kind === 0) ? 'cypress' : 'beech';
            const gTrunkH = (kind === 0) ? 13.8 : 9.8;
            const gMesh = new THREE.Mesh(gGeo, treeMaterial);
            gMesh.rotation.y = idx * 1.05;
            gMesh.castShadow = true;
            gMesh.receiveShadow = true;
            gMesh.customDepthMaterial = getTreeDepthMaterial();
            gGroup.add(gMesh);
            zoneStaticGroup.add(gGroup);
            aimRaycastMeshes.push(gMesh);
            zoneStaticRaycastMeshes.push(gMesh);
            const gTreeObj = {
                id: `greece:static:${idx}`,
                group: gGroup,
                mesh: gMesh,
                phase: idx * 0.65,
                x: gx, y: gy, z: gz,
                scale: gScale,
                isFallen: false, fallAngle: 0, angularVel: 0,
                maxFallAngle: Math.PI * 0.48,
                fallAxis: new THREE.Vector3(1, 0, 0),
                radius: (kind === 0 ? 0.95 : 1.35) * gScale,
                trunkHeight: gTrunkH * gScale,
                type: gType
            };
            swayTrees.push(gTreeObj);
            zoneStaticTrees.push(gTreeObj);
        });
    } else if (currentZoneIndex === 11) {
        // Imperial Rome Forum Panorama: Roman Pantheon Rotunda, Triumphal Arches of Constantine & Forum Basilica Colonnade
        const romanMonuments = [
            { x: 46.0,  z: 88.0,  geo: sharedRomanPantheonGeo, scale: 0.98, rot: -0.22, h: 17.5, type: 'pantheon' },
            { x: 20.0,  z: 48.0,  geo: sharedRomanArchGeo,     scale: 1.06, rot: 0.12,  h: 13.5, type: 'romanArch' },
            { x: -48.0, z: 66.0,  geo: sharedRomanArchGeo,     scale: 1.04, rot: 0.48,  h: 13.2, type: 'romanArch' },
            { x: 56.0,  z: 144.0, geo: sharedGreekStoaGeo,     scale: 1.15, rot: -0.35, h: 9.8,  type: 'stoa' }
        ];
        romanMonuments.forEach(rm => {
            const ry = getTerrainHeight(rm.x, rm.z);
            const rMesh = new THREE.Mesh(rm.geo, romanTravertineMat);
            rMesh.position.set(rm.x, ry - 0.15, rm.z);
            rMesh.rotation.y = rm.rot;
            rMesh.scale.setScalar(rm.scale);
            rMesh.castShadow = true;
            rMesh.receiveShadow = true;
            zoneStaticGroup.add(rMesh);
            aimRaycastMeshes.push(rMesh);
            zoneStaticRaycastMeshes.push(rMesh);
            const rObj = attachObstacleBox({ mesh: rMesh, x: rm.x, y: ry, z: rm.z, height: rm.h, isRuin: false, type: rm.type }, rm.geo, rm.scale, rm.rot);
            worldBuildings.push(rObj);
            worldObstacles.push(rObj);
            zoneStaticBuildings.push(rObj);
            zoneStaticObstacles.push(rObj);
        });

        const romanGrove = [
            [-32, 36, 0, 1.26], [36, 32, 1, 1.22], [-38, 86, 0, 1.24], [38, 66, 0, 1.28],
            [-28, 94, 1, 1.18], [12, 76, 0, 1.22], [-52, 48, 0, 1.24], [54, 60, 1, 1.20]
        ];
        romanGrove.forEach(([rx, rz, kind, rScale], idx) => {
            if (getRoadFactor(rx, rz) > 0.22) return;
            const ry = getTerrainHeight(rx, rz);
            const rGroup = new THREE.Group();
            rGroup.position.set(rx, ry, rz);
            rGroup.scale.setScalar(rScale);
            const rGeo = (kind === 0 && sharedCypressGeo) ? sharedCypressGeo : sharedPineGeo;
            const rType = (kind === 0) ? 'cypress' : 'pine';
            const rTrunkH = (kind === 0) ? 13.8 : 12.6;
            const rMesh = new THREE.Mesh(rGeo, treeMaterial);
            rMesh.rotation.y = idx * 1.10;
            rMesh.castShadow = true;
            rMesh.receiveShadow = true;
            rMesh.customDepthMaterial = getTreeDepthMaterial();
            rGroup.add(rMesh);
            zoneStaticGroup.add(rGroup);
            aimRaycastMeshes.push(rMesh);
            zoneStaticRaycastMeshes.push(rMesh);
            const rTreeObj = {
                id: `rome:static:${idx}`,
                group: rGroup,
                mesh: rMesh,
                phase: idx * 0.65,
                x: rx, y: ry, z: rz,
                scale: rScale,
                isFallen: false, fallAngle: 0, angularVel: 0,
                maxFallAngle: Math.PI * 0.48,
                fallAxis: new THREE.Vector3(1, 0, 0),
                radius: (kind === 0 ? 0.95 : 1.35) * rScale,
                trunkHeight: rTrunkH * rScale,
                type: rType
            };
            swayTrees.push(rTreeObj);
            zoneStaticTrees.push(rTreeObj);
        });
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
        skyDome.traverse((c) => c.layers.enable(2));
        window.skyDome = skyDome;
        window.skyMat = skyMat;
        envGroup.add(skyDome);
    }

    // High-Performance Botanical Texture-Atlas Grass & Wildflower System
    if (!grassLOD0Mesh) {
        const tuftGeo = createCrossedTuftGeometry();
        const billboardGeo = createBillboardTuftGeometry();

        const isMobile = (typeof window.isMobileBrowser === "function" && window.isMobileBrowser()) || (typeof window.isMobileDevice === "function" && window.isMobileDevice());
        const closePatchSize = isMobile ? 74.0 : 96.0;
        const closeRadius    = isMobile ? 37.0 : 48.0;
        const tuftCount      = isMobile ? 10000 : 16000; // Matches PC close-range density (~1.83 vs ~1.74 tufts/m²)
        const midPatchSize   = isMobile ? 160.0 : 192.0;
        const midRadius      = isMobile ? 80.0 : 98.0;
        const midCount       = isMobile ? 12000 : 30000;
        const farPatchSize   = isMobile ? 320.0 : 460.0;
        const farMaxRadius   = isMobile ? 160.0 : 230.0;
        const farCount       = isMobile ? 20000 : 90000;

        grassLOD0Mesh = createTexturedToroidalGrass(tuftGeo, tuftCount, closePatchSize, 0.0, closeRadius, false);
        grassLOD0MidMesh = createTexturedToroidalGrass(billboardGeo, midCount, midPatchSize, closeRadius, midRadius, true);
        grassLOD0FarMesh = createTexturedToroidalGrass(billboardGeo, farCount, farPatchSize, midRadius, farMaxRadius, true);
        grassLOD1Mesh = grassLOD0MidMesh;

        grassLOD0Mesh.renderOrder = 1;
        grassLOD0MidMesh.renderOrder = 2;
        grassLOD0FarMesh.renderOrder = 3;

        const closeBillboardCount = isMobile ? 6000 : 8000;
        grassBillboardCloseMesh = createTexturedToroidalGrass(billboardGeo, closeBillboardCount, midPatchSize, 0.0, midRadius, true);
        grassBillboardCloseMesh.visible = false;
        grassBillboardCloseMesh.renderOrder = 1;

        envGroup.add(grassLOD0Mesh);
        envGroup.add(grassLOD0MidMesh);
        envGroup.add(grassBillboardCloseMesh);
        if (farCount > 0) envGroup.add(grassLOD0FarMesh);

        window._grassReflectionSkipMeshes = [grassLOD0Mesh, grassLOD0MidMesh, grassLOD0FarMesh, grassBillboardCloseMesh].filter(Boolean);
        grassMeshRef = grassLOD0Mesh;
        window.grassLOD0Mesh = grassLOD0Mesh;
        window.grassLOD0MidMesh = grassLOD0MidMesh;
        window.grassLOD0FarMesh = grassLOD0FarMesh;
        window.grassBillboardCloseMesh = grassBillboardCloseMesh;
        window.grassLOD1Mesh = grassLOD1Mesh;
        window.grassMeshRef = grassMeshRef;
        if (typeof setGraphicsMode === 'function') {
            setGraphicsMode(isNonMobileDevice() ? 'high' : 'medium');
        }
    }

    if (!waterMeshRef) {
        waterMeshRef = createCoastalOceanMesh();
        envGroup.add(waterMeshRef);
        const _waterVisFrustum = new THREE.Frustum();
const _waterVisProjMat = new THREE.Matrix4();
const _waterVisFwd = new THREE.Vector3();

/**
 * Returns true if any water surface is potentially visible to `cam`,
 * allowing inland scenes to skip the planar reflection pass.
 */
function hasVisibleWaterForCamera(cam) {
    if (!waterMeshRef || !waterMeshRef.visible || !cam) return false;
    _waterVisProjMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _waterVisFrustum.setFromProjectionMatrix(_waterVisProjMat);

    for (const chunk of activeChunks.values()) {
        if (chunk.hasWater && chunk.waterBounds && _waterVisFrustum.intersectsBox(chunk.waterBounds)) {
            return true;
        }
    }

    cam.getWorldDirection(_waterVisFwd);
    const fl = Math.hypot(_waterVisFwd.x, _waterVisFwd.z);
    const fx = fl > 1e-4 ? _waterVisFwd.x / fl : 0;
    const fz = fl > 1e-4 ? _waterVisFwd.z / fl : 1;
    const rx = -fz;
    const rz = fx;
    const cx = cam.position.x;
    const cz = cam.position.z;

    const farDists = [180, 320, 500, 750];
    for (let i = 0; i < farDists.length; i++) {
        const d = farDists[i];
        const wx = cx + fx * d;
        const wz = cz + fz * d;
        if (getTerrainHeight(wx, wz) < -2.1) return true;
        const spread = d * 0.45;
        if (getTerrainHeight(wx + rx * spread, wz + rz * spread) < -2.1) return true;
        if (getTerrainHeight(wx - rx * spread, wz - rz * spread) < -2.1) return true;
    }
    return false;
}

window.waterMeshRef = waterMeshRef;
window.hasVisibleWaterForCamera = hasVisibleWaterForCamera;
    }

    setWorldSeed(currentSeed, currentZone);
    rebuildZoneStaticProps();

    farLastSnapX = null;
    farLastSnapZ = null;
    farPropLastCX = null;
    farPropLastCZ = null;
    farChunkPropCache.clear();
    updateTerrainChunks(0, 0, true);
    updateFarTerrainAndTrees(0, 0, true);
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
        if (window.celestialLighting.skyTopColor) {
            terrainUniforms.uSkyTopColor.value.copy(window.celestialLighting.skyTopColor.value);
        }
        if (window.celestialLighting.hazeStrength) {
            terrainUniforms.uHazeStrength.value = window.celestialLighting.hazeStrength.value;
        }
    }

    const focus = (window.playerMode === 'soldier' && window.playerSoldier) ? window.playerSoldier : tankState;
    const px = (focus && focus.x !== undefined) ? focus.x : 0;
    const pz = (focus && focus.z !== undefined) ? focus.z : 0;
    const nextZone = getZoneIndexAt(px, pz);
    if (nextZone !== currentZoneIndex) {
        setCurrentZone(nextZone);
        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner(currentZoneConfig.banner, '#fbbf24');
        }
    }

    const cam = window.activeCamera;
    const cx = (cam && cam.position && !isNaN(cam.position.x)) ? cam.position.x : px;
    const cy = (cam && cam.position && !isNaN(cam.position.y)) ? cam.position.y : 5.0;
    const cz = (cam && cam.position && !isNaN(cam.position.z)) ? cam.position.z : pz;

    terrainUniforms.uCameraPos.value.set(cx, cy, cz);
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
        waterMeshRef.position.set(px, -2.5, pz);
        waterMeshRef.renderOrder = -10;
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
    updateFarTerrainAndTrees(px, pz);
    processChunkStreamingQueue(3.5);
    updateBuildingInteriors(px, pz);

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
// 11. GAME RESPAWN (PRESERVES THE SAME WORLD SEED & BIOME ZONE)
// ============================================================================
function getPlayerRespawnPosition() {
    const death = window.lastPlayerDeathPosition;
    const WATER_LEVEL = (typeof window.SEA_LEVEL === 'number') ? window.SEA_LEVEL : -2.5;
    if (!death || typeof death.x !== 'number' || typeof death.z !== 'number') {
        const defaultY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(0, 0) : 0;
        return { x: 0, y: Math.max(defaultY, WATER_LEVEL - 1.25), z: 0, heading: 0 };
    }

    const dx = death.x;
    const dz = death.z;
    const dh = (typeof death.heading === 'number') ? death.heading : 0;

    // Search for a clear spawn point near where the player was killed (12-24 meters away)
    // Preference: behind the direction the player was facing (cover / friendly approach direction), on dry land
    const testDistances = [18.0, 12.0, 24.0];
    const candidateAngles = [
        dh + Math.PI,          // Directly behind
        dh + Math.PI * 0.75,   // Back-left
        dh - Math.PI * 0.75,   // Back-right
        dh + Math.PI * 0.5,    // Left
        dh - Math.PI * 0.5,    // Right
        dh + Math.PI * 0.25,   // Front-left
        dh - Math.PI * 0.25,   // Front-right
        dh                     // Directly ahead
    ];

    const obstacles = window.worldObstacles || [];
    const enemyTanks = window.activeEnemyTanks || [];

    let bestWaterCandidate = null;

    for (let d = 0; d < testDistances.length; d++) {
        const offsetDistance = testDistances[d];
        for (let i = 0; i < candidateAngles.length; i++) {
            const ang = candidateAngles[i];
            const cx = dx + Math.sin(ang) * offsetDistance;
            const cz = dz + Math.cos(ang) * offsetDistance;

            // Check distance against obstacles
            let blocked = false;
            for (let j = 0; j < obstacles.length; j++) {
                const obs = obstacles[j];
                if (!obs || typeof obs.x !== 'number' || typeof obs.z !== 'number') continue;
                const minDist = (obs.radius || 2.0) + 3.2;
                if ((cx - obs.x) ** 2 + (cz - obs.z) ** 2 < minDist * minDist) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;

            // Check distance against enemy tanks and wrecks
            for (let j = 0; j < enemyTanks.length; j++) {
                const et = enemyTanks[j];
                if (!et || typeof et.x !== 'number' || typeof et.z !== 'number') continue;
                if ((cx - et.x) ** 2 + (cz - et.z) ** 2 < 6.0 * 6.0) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;

            // Sample terrain height
            const cy = (typeof getTerrainHeight === 'function')
                ? getTerrainHeight(cx, cz)
                : ((typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(cx, cz) : 0);

            // Face toward the location where player was killed so they are oriented toward the battle
            const lookHeading = Math.atan2(dx - cx, dz - cz);

            // Prioritize dry land above sea level
            if (cy >= WATER_LEVEL + 0.3) {
                return { x: cx, y: cy, z: cz, heading: lookHeading };
            }

            // Save water candidate in case dry land isn't found
            if (!bestWaterCandidate) {
                bestWaterCandidate = { x: cx, y: Math.max(cy, WATER_LEVEL - 1.25), z: cz, heading: lookHeading };
            }
        }
    }

    if (bestWaterCandidate) {
        return bestWaterCandidate;
    }

    // Fallback: 18m behind last death heading
    const fallbackX = dx - Math.sin(dh) * 18.0;
    const fallbackZ = dz - Math.cos(dh) * 18.0;
    let fallbackY = (typeof getTerrainHeight === 'function')
        ? getTerrainHeight(fallbackX, fallbackZ)
        : ((typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(fallbackX, fallbackZ) : 0);
    if (fallbackY < WATER_LEVEL - 1.25) {
        fallbackY = WATER_LEVEL - 1.25;
    }
    const fallbackHeading = Math.atan2(dx - fallbackX, dz - fallbackZ);
    return { x: fallbackX, y: fallbackY, z: fallbackZ, heading: fallbackHeading };
}
window.getPlayerRespawnPosition = getPlayerRespawnPosition;

function restartGame(customSeed, customZone) {
    // Preserve the same world seed and origin zone every time we respawn unless explicitly changed
    const seed = (customSeed !== undefined && customSeed !== null) ? customSeed : currentSeed;
    let nextZone = (customZone !== undefined && customZone !== null) ? customZone : spawnZoneIndex;
    const nextZoneIdx = (typeof nextZone === 'string' && ZONE_CONFIGS[nextZone])
        ? ZONE_CONFIGS[nextZone].typeIndex
        : ((typeof nextZone === 'number') ? nextZone : spawnZoneIndex);
    const isSameWorld = (seed === currentSeed && nextZoneIdx === spawnZoneIndex && activeChunks.size > 0);

    if (!isSameWorld) {
        window.lastPlayerDeathPosition = null;
        setWorldSeed(seed, nextZone);
        rebuildZoneStaticProps();
    }

    const respawnPos = getPlayerRespawnPosition();
    const groundY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(respawnPos.x, respawnPos.z) : 0;
    const waterLvl = (typeof window !== 'undefined' && typeof window.SEA_LEVEL === 'number') ? window.SEA_LEVEL : -2.5;
    const spawnY = (groundY < waterLvl - 1.25) ? (waterLvl - 1.25) : groundY;
    const spawnHeading = (typeof respawnPos.heading === 'number') ? respawnPos.heading : 0;

    if (window.tankState) {
        window.tankState.x = respawnPos.x;
        window.tankState.z = respawnPos.z;
        window.tankState.heading = spawnHeading;
        window.tankState.speed = 0;
        window.tankState.turnRate = 0;
        window.tankState.pitch = window.tankState.roll = window.tankState.pitchVel = window.tankState.rollVel = 0;
        window.tankState.heave = window.tankState.heaveVel = 0;
        window.tankState.turretYaw = window.tankState.gunElevation = 0;
        window.tankState.targetTurretYaw = window.tankState.targetGunElevation = 0;
        window.tankState.hitsCount = 0;
        window.tankState.reloadTimer = 0;
        window.tankState.mgHeat = 0;
        window.tankState.isKnockedOut = false;
        window.tankState.y = spawnY;

        if (window.tankRoot) {
            window.tankRoot.position.set(respawnPos.x, spawnY, respawnPos.z);
            window.tankRoot.rotation.y = spawnHeading;
            window.tankRoot.visible = false;
        }
        if (window.tankState) {
            window.tankState.hasTank = false;
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
        window.camOrbit.theta = spawnHeading + Math.PI + 0.38;
        window.camOrbit.phi = 1.42;
        window.camOrbit.distance = 10.5;
    }

    if (!isSameWorld) {
        for (const chunk of activeChunks.values()) chunk.dispose();
        activeChunks.clear();
        activeChunkCenterX = null;
        activeChunkCenterZ = null;
        chunkLoadQueue.length = 0;
        chunkLoadSet.clear();
        chunkUnloadQueue.length = 0;
        updateTerrainChunks(respawnPos.x, respawnPos.z, true);
    } else {
        // Keep the scene intact when respawning in the same battlefield:
        // Do not unload or reload chunks, do not reset props or trees.
        chunkUnloadQueue.length = 0; // Clear any pending unloads to guarantee no terrain chunks get removed
        // Bypassed: updateTerrainChunks(0, 0, false);
    }
    if (typeof window.clearParticles === 'function') window.clearParticles();
    if (!isSameWorld) {
        if (typeof window.resetEnemyTanks === 'function') window.resetEnemyTanks();
        if (typeof window.resetSoldiers === 'function') window.resetSoldiers();
    } else {
        // Keep existing enemies on respawn in the same battlefield!
        if (!window.activeEnemyTanks || window.activeEnemyTanks.length === 0) {
            if (typeof window.spawnZoneEnemies === 'function') window.spawnZoneEnemies();
        }
    }
    if (typeof window.resetPlayerHealth === 'function') window.resetPlayerHealth();
    if (typeof window.resetPlayerSoldier === 'function') window.resetPlayerSoldier();
    if (typeof window.initWorldBicycles === 'function') window.initWorldBicycles();
    if (typeof window.hideKnockoutModal === 'function') window.hideKnockoutModal();
    window.playerIsDead = false;
    if (typeof window.updateMoneyHUD === 'function') window.updateMoneyHUD();

    const ALL_CAMPAIGNS = ['tiger', 'kingtiger', 'sherman', 'pershing', 't34', 'kv2'];
    if (typeof window.showSpawnSelectionModal === 'function') {
        window.showSpawnSelectionModal();
    }

    if (typeof window.showKillFeedBanner === 'function' && currentZoneConfig) {
        window.showKillFeedBanner(currentZoneConfig.banner, '#fbbf24');
    }

    console.log(`[World War 2 Simulator] Battlefield Active — Zone: ${currentZoneConfig.name}, Seed: ${seed}`);
}

// ============================================================================
// EXPORTS & WINDOW ATTACHMENTS
// ============================================================================
// ============================================================================
// GRAPHICS QUALITY PRESET (HIGH / LOW) & GRASS DISPLAY SYSTEM
// ============================================================================
let currentGrassMode = 'high'; // 'high', 'low', 'off'
let currentGraphicsMode = 'high'; // 'high', 'low' (mobile defaults to 'low')

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
    console.log(`[Grass] Switched to mode: ${mode}`);
}

function setGraphicsMode(mode) {
    const next = (mode === 'low') ? 'low' : (mode === 'medium' ? 'medium' : 'high');
    currentGraphicsMode = next;
    window.graphicsMode = next;

    if (grassUniforms && grassUniforms.uLowGraphics) {
        grassUniforms.uLowGraphics.value = (next === 'high') ? 0.0 : 1.0;
    }
    // Keep full 3D + mid + far grass in High & Medium; use lightweight close billboards in Low
    setGrassMode(next === 'low' ? 'low' : 'high');

    // Update HUD Graphic button label & styling
    const labelEl = document.getElementById('hud-graphic-label') || document.getElementById('hud-grass-label');
    const btnEl = document.getElementById('btn-graphic-toggle') || document.getElementById('btn-grass-toggle');
    if (labelEl) {
        if (next === 'high') labelEl.textContent = 'Graphic: High';
        else if (next === 'medium') labelEl.textContent = 'Graphic: Medium';
        else labelEl.textContent = 'Graphic: Low';
    }
    if (btnEl) {
        if (next === 'high') {
            btnEl.className = 'hud-btn px-2 md:px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-300';
        } else if (next === 'medium') {
            btnEl.className = 'hud-btn px-2 md:px-2.5 py-1 rounded-lg text-[11px] font-semibold text-sky-300';
        } else {
            btnEl.className = 'hud-btn px-2 md:px-2.5 py-1 rounded-lg text-[11px] font-semibold text-amber-300';
        }
    }
    console.log(`[Graphics] Switched preset to: ${next}`);
}

function isNonMobileDevice() {
    if (typeof window.isMobileBrowser === 'function' && window.isMobileBrowser()) return false;
    if (typeof window.isMobileDevice === 'function' && window.isMobileDevice()) return false;
    const ua = (navigator.userAgent || '').toLowerCase();
    const isMobileUA = /android|iphone|ipad|ipod|blackberry|mobile|tablet/i.test(ua);
    return !isMobileUA;
}
window.isNonMobileDevice = isNonMobileDevice;
currentGraphicsMode = isNonMobileDevice() ? 'high' : 'medium';
window.graphicsMode = currentGraphicsMode;

function toggleGraphics() {
    const next = (currentGraphicsMode === 'high') ? 'medium' : (currentGraphicsMode === 'medium' ? 'low' : 'high');
    setGraphicsMode(next);
}
window.setGraphicsMode = setGraphicsMode;
window.toggleGraphics = toggleGraphics;
window.getGraphicsMode = () => currentGraphicsMode;

function toggleGrass() {
    toggleGraphics();
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
const _waterVisFrustum = new THREE.Frustum();
const _waterVisProjMat = new THREE.Matrix4();
const _waterVisFwd = new THREE.Vector3();

/**
 * Returns true if any water surface is potentially visible to `cam`,
 * allowing inland scenes to skip the planar reflection pass.
 */
function hasVisibleWaterForCamera(cam) {
    if (!waterMeshRef || !waterMeshRef.visible || !cam) return false;
    _waterVisProjMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _waterVisFrustum.setFromProjectionMatrix(_waterVisProjMat);

    for (const chunk of activeChunks.values()) {
        if (chunk.hasWater && chunk.waterBounds && _waterVisFrustum.intersectsBox(chunk.waterBounds)) {
            return true;
        }
    }

    cam.getWorldDirection(_waterVisFwd);
    const fl = Math.hypot(_waterVisFwd.x, _waterVisFwd.z);
    const fx = fl > 1e-4 ? _waterVisFwd.x / fl : 0;
    const fz = fl > 1e-4 ? _waterVisFwd.z / fl : 1;
    const rx = -fz;
    const rz = fx;
    const cx = cam.position.x;
    const cz = cam.position.z;

    const farDists = [180, 320, 500, 750];
    for (let i = 0; i < farDists.length; i++) {
        const d = farDists[i];
        const wx = cx + fx * d;
        const wz = cz + fz * d;
        if (getTerrainHeight(wx, wz) < -2.1) return true;
        const spread = d * 0.45;
        if (getTerrainHeight(wx + rx * spread, wz + rz * spread) < -2.1) return true;
        if (getTerrainHeight(wx - rx * spread, wz - rz * spread) < -2.1) return true;
    }
    return false;
}

window.waterMeshRef = waterMeshRef;
window.hasVisibleWaterForCamera = hasVisibleWaterForCamera;
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
window.getRiverDistance = getRiverDistance;
window.getRiverFactor = getRiverFactor;
window.getRiversideFactor = getRiversideFactor;
window.initEnvironment = initEnvironment;
window.buildEnvironment = buildEnvironment;
window.updateEnvironment = updateEnvironment;
window.restartGame = restartGame;
window.getPlayerRespawnPosition = getPlayerRespawnPosition;
window.setWorldSeed = setWorldSeed;
window.currentSeed = currentSeed;
window.spawnZoneIndex = spawnZoneIndex;
window.sharedPalmGeo = sharedPalmGeo;
window.sharedPalmGeos = sharedPalmGeos;
window.sharedAcaciaGeo = sharedAcaciaGeo;
window.sharedCactusGeo = sharedCactusGeo;
window.sharedCactusGeos = sharedCactusGeos;
window.sharedBirchGeo = sharedBirchGeo;
window.sharedCypressGeo = sharedCypressGeo;
window.sharedWillowGeo = sharedWillowGeo;
window.sharedLarchGeo = sharedLarchGeo;
window.sharedJoshuaTreeGeo = sharedJoshuaTreeGeo;
window.sharedAgaveGeo = sharedAgaveGeo;
window.sharedPricklyPearGeo = sharedPricklyPearGeo;
window.sharedFlowerBushGeo = sharedFlowerBushGeo;
window.sharedFernGeo = sharedFernGeo;
window.sharedTownhouseGeo = sharedTownhouseGeo;
window.sharedFarmhouseGeo = sharedFarmhouseGeo;
window.sharedAdobeHouseGeo = sharedAdobeHouseGeo;
window.sharedChaletGeo = sharedChaletGeo;
