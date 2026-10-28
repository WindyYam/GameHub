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
// 1. SEED MANAGEMENT & DETERMINISTIC PRNG
// ============================================================================
var currentSeed = Math.floor(Math.random() * 900000) + 100000;
var seedOffset = { x: 0, z: 0 };
var roadBaseX = 0;
var road2BaseZ = 0;
var road3BaseX = 0;
var road4BaseX = 0;

function setWorldSeed(seed) {
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
        float rollingHills = fbm4_gpu(s * 0.0042) * 4.5;
        float mediumUndulation = fbm3_gpu(s * 0.016) * 1.8;
        float microBumps = valueNoise2D_gpu(s * 0.08) * 0.25;
        float h = 6.8 + rollingHills + mediumUndulation + microBumps;

        // Elevated grassy ridge around tank spawn (0, 0) overlooking the seaside
        float dSpawn = length(vec2(x, z));
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

        float roadF = getRoadFactor_gpu(x, z);
        if (roadF > 0.01) {
            float offset = getRoadDistance_gpu(x, z);
            float rut = exp(-pow(offset - 1.35, 2.0) / 0.35) * 0.38;
            h -= (roadF * 0.35 + rut * roadF);
        }
        return h;
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

    const rollingHills = fbm4(sx * 0.0042, sz * 0.0042) * 4.5;
    const mediumUndulation = fbm3(sx * 0.016, sz * 0.016) * 1.8;
    const microBumps = valueNoise2D(sx * 0.08, sz * 0.08) * 0.25;

    let h = 6.8 + rollingHills + mediumUndulation + microBumps;

    const dSpawn = Math.hypot(x, z);
    const ridgeElev = (1.0 - smoothstep(12.0, 95.0, dSpawn)) * 2.8;
    h += ridgeElev;

    const coastalDist = z + (fbm3(sx * 0.009, sz * 0.009) * 28.0);
    const coastalSlope = smoothstep(110.0, 360.0, coastalDist) * 12.8;

    const headland = smoothstep(60.0, 200.0, Math.abs(x)) * smoothstep(60.0, 420.0, coastalDist) * 6.5;
    h = h - coastalSlope + headland;

    const spawnClear = smoothstep(3.5, 16.0, dSpawn);
    h = mix(7.2, h, spawnClear);

    const roadF = getRoadFactor(x, z);
    if (roadF > 0.01) {
        const offset = getRoadDistance(x, z);
        const rut = Math.exp(-Math.pow(offset - 1.35, 2.0) / 0.35) * 0.38;
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

        // Synchronized rolling wind waves matching coastal_countryside_3d_scene.html
        float tWind = uTime * uWindSpeed;
        float wave1 = sin(vTerrainWorldPos.x * 0.14 + vTerrainWorldPos.z * 0.12 + tWind * 2.4);
        float wave2 = cos(vTerrainWorldPos.x * 0.35 - vTerrainWorldPos.z * 0.28 + tWind * 3.6) * 0.45;
        float windWave = (wave1 + wave2 * 0.7) * 0.5 + 0.5;

        // Convert vertex color from sRGB to linear space
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.001)), vec3(2.2));

        // Grass-area ground uses the same linear color as the grass root (groundRootCol)
        vec3 rootGround = vec3(0.028, 0.070, 0.014);
        float macroPatch = valueNoise2D_gpu(vTerrainWorldPos.xz * 0.06) * 0.5 + 0.5;
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
            roughnessFactor = mix(roughnessFactor, 0.42, rut * rRoad);
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

    window.sharedSpruceGeo = sharedSpruceGeo;
    window.sharedPineGeo = sharedPineGeo;
    window.sharedDecidGeo = sharedDecidGeo;
    window.sharedBushGeo = sharedBushGeo;
    window.sharedRockGeo = sharedRockGeo;
    window.sharedCottageGeo = sharedCottageGeo;
    window.sharedRuinGeo = sharedRuinGeo;
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
    // Taller, lush WW2 meadow grass geometry
    const w = 1.42;
    const h = 1.15;
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
    // Taller distant billboard grass geometry
    const w = 1.52;
    const h = 1.22;
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
            // Clumped wildflower distribution: 82% lush grass & ryegrass, 18% natural wildflower drifts
            const clumpedFlower = Math.sin(jx * 0.14 + 0.5) * Math.cos(jz * 0.14 - 0.3);
            const pick = Math.random();
            let col = 0.0;
            if (clumpedFlower > 0.38 && pick > 0.72) col = 3.0;      // Golden buttercup drift
            else if (clumpedFlower < -0.35 && pick > 0.70) col = 2.0; // White chamomile daisy drift
            else if (pick > 0.48) col = 1.0;                          // Ryegrass & seed plumes
            offsets[idx * 4 + 3] = col;
            idx++;
        }
    }
    while (idx < count) {
        offsets[idx * 4 + 0] = (Math.random() - 0.5) * patchSize;
        offsets[idx * 4 + 1] = (Math.random() - 0.5) * patchSize;
        offsets[idx * 4 + 2] = Math.random() * Math.PI * 2.0;
        offsets[idx * 4 + 3] = Math.random() > 0.5 ? 1.0 : 0.0;
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

            float sizeVar = 0.92 + 0.38 * fract(sin(dot(aInstanceData.xy, vec2(12.9898, 78.233))) * 43758.5453);
            float colIdx = aInstanceData.w;
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
            localP.y *= (sizeVar * roadCull * waterCull * spawnCull * bldgCull); // Full natural height, zero ringFade squashing!

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

            // Seamlessly blend bottom root of grass tuft into the exact linear meadow ground color
            vec3 groundRootCol = vec3(0.028, 0.070, 0.014);
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
        const tempCol = new THREE.Color();

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

            tempCol.copy(colLushGrass).lerp(colSunlitGrass, smoothstep(0.10, 0.60, fieldNoise) * 0.75);
            tempCol.lerp(colDryGrass, smoothstep(0.58, 0.94, fieldNoise) * 0.82);

            const roadF = getRoadFactor(wx, wz);
            if (roadF > 0.01) {
                const distFromCenter = getRoadDistance(wx, wz);
                const rutDist = Math.abs(distFromCenter - 1.35);
                const isRut = rutDist < 0.55 ? 0.75 : 0.0;
                const dirtCol = colMudRoad.clone().lerp(colWetRut, isRut);
                tempCol.lerp(dirtCol, Math.min(1.0, roadF * 1.1));
            }

            if (slope > 0.22) {
                const rockBlend = Math.min(1.0, (slope - 0.22) * 4.5);
                tempCol.lerp(colCliffRock, rockBlend);
            }

            if (wy > 12.0) {
                const mBlend = Math.min(1.0, (wy - 12.0) / 12.0);
                tempCol.lerp(colMountain, mBlend * 0.75);
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
        const rng = createChunkRNG(this.cx, this.cz, currentSeed);
        const xMin = this.cx * CHUNK_SIZE;
        const zMin = this.cz * CHUNK_SIZE;
        const chunkCenterX = xMin + CHUNK_SIZE * 0.5;
        const chunkCenterZ = zMin + CHUNK_SIZE * 0.5;
        const distFromSpawn = Math.hypot(chunkCenterX, chunkCenterZ);

        // ---------------------------------------------------------------------
        // 1. EUROPEAN VILLAGES, HAMLETS & TACTICAL RURAL STRUCTURES
        // ---------------------------------------------------------------------
        const isCrossroadsVillage = (this.cx === 0 && this.cz === -1);
        const isEastVillage = (this.cx === 1 && this.cz === 1);
        const isWestVillage = (this.cx === -1 && this.cz === 1);
        const isProceduralVillage = (Math.abs(this.cx) + Math.abs(this.cz) >= 3) && ((Math.abs(this.cx * 11 + this.cz * 17) % 5) === 0);
        const isVillage = isCrossroadsVillage || isEastVillage || isWestVillage || isProceduralVillage;

        if (isVillage) {
            // Village cluster of cottages, barns, ruins, and stone perimeter walls
            const villageTemplates = [
                { rx: -16, rz: -14, type: 'cottage', rot: 0.35, scale: 1.05 },
                { rx: 16, rz: -16, type: 'barn', rot: -0.42, scale: 1.10 },
                { rx: -15, rz: 15, type: isWestVillage ? 'ruin' : 'cottage', rot: 1.25, scale: 0.98 },
                { rx: 18, rz: 16, type: isWestVillage ? 'ruin' : 'barn', rot: -1.15, scale: 1.02 },
                { rx: -1, rz: -26, type: 'wall', rot: 0.05, scale: 1.0 },
                { rx: 1, rz: 26, type: 'wall', rot: 0.08, scale: 1.0 }
            ];

            villageTemplates.forEach((struct, sIdx) => {
                let bx = chunkCenterX + struct.rx + (rng() - 0.5) * 4.0;
                let bz = chunkCenterZ + struct.rz + (rng() - 0.5) * 4.0;
                bx = THREE.MathUtils.clamp(bx, xMin + 8, xMin + CHUNK_SIZE - 8);
                bz = THREE.MathUtils.clamp(bz, zMin + 8, zMin + CHUNK_SIZE - 8);
                if (Math.hypot(bx, bz) < 32) return; // Keep spawn pad clear
                if (Math.hypot(bx - (-18), bz - 112) < 24) return; // Don't duplicate signature seaside cottage
                if (Math.hypot(bx - (-19), bz - 22) < 20) return; // Don't duplicate signature rock

                const by = getTerrainHeight(bx, bz);
                const norm = getTerrainNormal(bx, bz);
                if (by < -1.8 || norm.y < 0.85) return;

                let bldgGeo, radius, height, isRuin = false, isWall = false;
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
            // Rural Farmstead, Barn, or Battlefield Ruin along road verges
            const roadDistCenter = getRoadDistance(chunkCenterX, chunkCenterZ);
            if (roadDistCenter < 35) {
                const sideSign = (rng() > 0.5) ? 1 : -1;
                let hx = chunkCenterX + sideSign * (14.0 + rng() * 8.0);
                let hz = chunkCenterZ + (rng() - 0.5) * 18.0;
                hx = THREE.MathUtils.clamp(hx, xMin + 8, xMin + CHUNK_SIZE - 8);
                hz = THREE.MathUtils.clamp(hz, zMin + 8, zMin + CHUNK_SIZE - 8);
                if (Math.hypot(hx, hz) < 32) return; // Keep spawn area clear
                if (Math.hypot(hx - (-18), hz - 112) < 24) return; // Don't duplicate signature seaside cottage
                if (Math.hypot(hx - (-19), hz - 22) < 20) return; // Don't duplicate signature rock
                const hy = getTerrainHeight(hx, hz);
                const norm = getTerrainNormal(hx, hz);

                if (hy > -1.8 && norm.y > 0.88) {
                    const bType = (rng() < 0.35) ? 'ruin' : ((rng() < 0.70) ? 'cottage' : 'barn');
                    const bldgGeo = (bType === 'ruin') ? sharedRuinGeo : ((bType === 'cottage') ? sharedCottageGeo : sharedBarnGeo);
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
        // 2. MASSIVE LIMESTONE CRAGS & ROCK COVER
        // ---------------------------------------------------------------------
        this.rocks = [];
        const rockCount = (distFromSpawn > 20 && !isVillage && rng() < 0.70) ? (1 + Math.floor(rng() * 2)) : 0;
        for (let r = 0; r < rockCount; r++) {
            let rx = xMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            let rz = zMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            if (Math.hypot(rx, rz) < 26) continue;
            if (Math.hypot(rx - (-19), rz - 22) < 18) continue;
            if (getRoadFactor(rx, rz) > 0.25) continue;
            const ry = getTerrainHeight(rx, rz);
            if (ry < -2.0) continue;

            const rs = 1.0 + rng() * 0.45;
            const rockMesh = new THREE.Mesh(sharedRockGeo, rockMat);
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
                height: 4.2 * rs,
                type: 'rock'
            };
            this.rocks.push(rockObj);
            worldObstacles.push(rockObj);
            worldBuildings.push({ x: rx, z: rz, radius: 4.8 * rs, isRuin: false, isRock: true });
        }

        // ---------------------------------------------------------------------
        // 3. BOTANICAL TREES & DENSE FOREST BIOMES
        // ---------------------------------------------------------------------
        const forestNoise = fbm3((chunkCenterX + seedOffset.x) * 0.007, (chunkCenterZ + seedOffset.z) * 0.007) * 0.5 + 0.5;

        let targetTreeCount = 0;
        if (isVillage) {
            targetTreeCount = 3 + Math.floor(rng() * 3); // Village orchard & garden trees
        } else if (forestNoise > 0.52) {
            targetTreeCount = 14 + Math.floor(rng() * 9); // Dense Forest Stand (14 to 22 trees!)
        } else if (forestNoise > 0.32) {
            targetTreeCount = 5 + Math.floor(rng() * 5); // Woodland Copse (5 to 9 trees)
        } else {
            targetTreeCount = Math.floor(rng() * 3); // Open Meadow / Pasture (0 to 2 trees)
        }

        for (let t = 0; t < targetTreeCount; t++) {
            let tx = xMin + (0.08 + rng() * 0.84) * CHUNK_SIZE;
            let tz = zMin + (0.08 + rng() * 0.84) * CHUNK_SIZE;

            if (Math.hypot(tx, tz) < 20) continue; // Keep spawn clear
            if (getRoadFactor(tx, tz) > 0.20) continue; // Keep roads clear

            // Don't collide into buildings
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

            const treeRoll = rng();
            let treeGeo, treeType, trunkH;
            if (isVillage) {
                // In villages, mostly deciduous fruit / shade trees and ornamental pines
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
                // In dense forests, tall spruces and pines dominate with occasional beech
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

            const scale = 0.85 + rng() * 0.55;
            const treeGroup = new THREE.Group();
            treeGroup.position.set(tx, ty, tz);
            treeGroup.scale.setScalar(scale);

            const treeMesh = new THREE.Mesh(treeGeo, treeMaterial);
            treeMesh.castShadow = (distFromSpawn < 85);
            treeMesh.receiveShadow = true;
            treeGroup.add(treeMesh);
            this.group.add(treeGroup);
            this.raycastMeshes.push(treeMesh);
            aimRaycastMeshes.push(treeMesh);

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
                radius: 1.35 * scale,
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
        // 4. UNDERGROWTH BUSHES (DENSER IN FORESTS)
        // ---------------------------------------------------------------------
        const bushGeos = [];
        const bushCount = (forestNoise > 0.52) ? (5 + Math.floor(rng() * 5)) : (Math.floor(rng() * 3) + 1);
        for (let b = 0; b < bushCount; b++) {
            const bx = xMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            const bz = zMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            if (getRoadFactor(bx, bz) > 0.28) continue;
            const by = getTerrainHeight(bx, bz);
            if (by < -2.4) continue;
            const bs = 0.75 + rng() * 0.65;
            const g = sharedBushGeo.clone();
            g.scale(bs * 1.15, bs * 0.9, bs * 1.15);
            g.rotateY(rng() * Math.PI * 2);
            g.translate(bx, by, bz);
            bushGeos.push(g);
        }
        if (bushGeos.length > 0) {
            const mergedBushes = mergeBufferGeometries(bushGeos);
            const bushMesh = new THREE.Mesh(mergedBushes, treeMaterial);
            bushMesh.castShadow = (distFromSpawn < 65);
            bushMesh.receiveShadow = true;
            this.group.add(bushMesh);
        }

        // ---------------------------------------------------------------------
        // 5. REACTIVE ARMORED TARGET HULLS FOR GUNNERY PRACTICE
        // ---------------------------------------------------------------------
        if (distFromSpawn > 45 && !isVillage && rng() < 0.16) {
            const tx = xMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            const tz = zMin + (0.15 + rng() * 0.70) * CHUNK_SIZE;
            if (getRoadFactor(tx, tz) < 0.35) {
                const ty = getTerrainHeight(tx, tz);
                const targetId = `${this.chunkKey}:tgt`;
                const isDestroyed = sessionDestroyedTargets.has(targetId);

                const tg = new THREE.Group();
                tg.position.set(tx, ty, tz);

                const hullMat = new THREE.MeshStandardMaterial({ color: 0x4b5338, roughness: 0.65, metalness: 0.35 });
                const baseHull = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.05, 4.4), hullMat);
                baseHull.position.y = 0.52;
                baseHull.castShadow = true;
                baseHull.receiveShadow = true;
                tg.add(baseHull);

                const platePivot = new THREE.Group();
                platePivot.position.y = 1.05;
                tg.add(platePivot);

                const plateMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5, metalness: 0.4 });
                const turretBox = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.85, 12), plateMat);
                turretBox.position.y = 0.42;
                turretBox.castShadow = true;
                platePivot.add(turretBox);

                const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 2.35), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
                crossH.position.y = 0.42;
                platePivot.add(crossH);
                this.raycastMeshes.push(baseHull, turretBox, crossH);
                aimRaycastMeshes.push(baseHull, turretBox, crossH);

                tg.lookAt(0, ty, 0);
                this.group.add(tg);

                if (isDestroyed) {
                    platePivot.rotation.x = Math.PI * 0.45;
                }

                const tgtObj = {
                    id: targetId,
                    group: tg,
                    pivot: platePivot,
                    x: tx,
                    y: ty,
                    z: tz,
                    radius: 2.4,
                    height: 2.1,
                    isDestroyed: isDestroyed,
                    hitAngle: isDestroyed ? Math.PI * 0.45 : 0
                };
                this.targets.push(tgtObj);
                targets.push(tgtObj);
            }
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
    }
}

function updateTerrainChunks(playerX, playerZ) {
    const playerCX = Math.floor(playerX / CHUNK_SIZE);
    const playerCZ = Math.floor(playerZ / CHUNK_SIZE);
    if (activeChunks.size > 0 && playerCX === activeChunkCenterX && playerCZ === activeChunkCenterZ) return;

    // Load all chunks within VIEW_RADIUS (4 chunks = 320m)
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
            const cx = playerCX + dx;
            const cz = playerCZ + dz;
            const key = `${cx},${cz}`;
            if (!activeChunks.has(key)) {
                activeChunks.set(key, new TerrainChunk(cx, cz));
            }
        }
    }

    // Only dispose chunks that are further than UNLOAD_RADIUS (5 chunks = 400m)
    // This hysteresis prevents any popping/thrashing when driving near chunk boundaries
    for (const [key, chunk] of activeChunks.entries()) {
        const distCX = Math.abs(chunk.cx - playerCX);
        const distCZ = Math.abs(chunk.cz - playerCZ);
        if (distCX > UNLOAD_RADIUS || distCZ > UNLOAD_RADIUS) {
            chunk.dispose();
            activeChunks.delete(key);
        }
    }
    activeChunkCenterX = playerCX;
    activeChunkCenterZ = playerCZ;
}

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
        window.soundFX.playTreeCrack();
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

function createCoastalOceanMesh() {
    const oceanGeo = new THREE.PlaneGeometry(3600, 2800, 128, 128);
    oceanGeo.rotateX(-Math.PI / 2);
    const seedVec = new THREE.Vector2(seedOffset.x, seedOffset.z);
    const oceanMat = (typeof window.createCoastalOceanMaterial === 'function')
        ? window.createCoastalOceanMaterial(seedVec, roadBaseX)
        : new THREE.MeshStandardMaterial({ color: 0x0c3b6b, roughness: 0.15, metalness: 0.8 });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(0, -2.5, 1500);
    oceanMesh.receiveShadow = true;
    return oceanMesh;
}

// Distant Coastal Headlands framing the bay
function createDistantHeadlands() {
    const headlandGroup = new THREE.Group();
    const hlGeoL = new THREE.PlaneGeometry(900, 280, 48, 16);
    hlGeoL.rotateX(-Math.PI / 2);
    const posL = hlGeoL.attributes.position;
    for (let i = 0; i < posL.count; i++) {
        const vx = posL.getX(i);
        const vz = posL.getZ(i);
        const taper = smoothstep(-450, 250, vx);
        const ridge = Math.exp(-(vz * vz) / 5800) * 32.0 * taper;
        posL.setY(i, Math.max(0.0, ridge + Math.sin(vx * 0.02) * 3.5 * taper));
    }
    hlGeoL.computeVertexNormals();

    const hlMat = new THREE.MeshLambertMaterial({ color: 0x5b7e9e });
    const hlMeshL = new THREE.Mesh(hlGeoL, hlMat);
    hlMeshL.position.set(-680, -2.2, 540);
    hlMeshL.rotation.y = 0.35;
    headlandGroup.add(hlMeshL);

    const hlMeshR = new THREE.Mesh(hlGeoL, hlMat);
    hlMeshR.position.set(720, -2.2, 580);
    hlMeshR.rotation.y = -0.42;
    headlandGroup.add(hlMeshR);

    return headlandGroup;
}

function buildEnvironment(scene) {
    initEnvironment(scene || window.scene);

    for (const chunk of activeChunks.values()) {
        chunk.dispose();
    }
    activeChunks.clear();
    activeChunkCenterX = null;
    activeChunkCenterZ = null;
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

    currentScene.background.setHex(0xc7d4e0);
    currentScene.fog.color.setHex(0xc2d0dc);
    currentScene.fog.density = 0.00085;

    if (window.createMaldiveSkyDome) {
        const skyData = window.createMaldiveSkyDome();
        skyDome = skyData.skyMesh;
        skyMat = skyData.skyMat;
        window.skyDome = skyDome;
        window.skyMat = skyMat;
        envGroup.add(skyDome);
    }

    // High-Performance Botanical Texture-Atlas Grass & Wildflower System
    // Area 1 (Close): 48,000 crossed tuft instances over 96m x 96m (0m to 48m radius)
    // Area 2 (Mid range): 28,000 crossed tuft instances over 192m x 192m (48m to 98m radius) - No height-based transition!
    // Area 3 (Far): 24,000 billboard grass instances over 384m x 384m (98m to 195m radius) with edge subsurface scattering
    if (!grassLOD0Mesh) {
        const tuftGeo = createCrossedTuftGeometry();
        const billboardGeo = createBillboardTuftGeometry();

        grassLOD0Mesh = createTexturedToroidalGrass(tuftGeo, 48000, 96.0, 0.0, 48.0, false);
        grassLOD0MidMesh = createTexturedToroidalGrass(tuftGeo, 28000, 192.0, 48.0, 98.0, false);
        grassLOD0FarMesh = createTexturedToroidalGrass(billboardGeo, 24000, 384.0, 98.0, 195.0, true);
        grassLOD1Mesh = grassLOD0MidMesh;

        envGroup.add(grassLOD0Mesh);
        envGroup.add(grassLOD0MidMesh);
        envGroup.add(grassLOD0FarMesh);

        grassMeshRef = grassLOD0Mesh;
        window.grassLOD0Mesh = grassLOD0Mesh;
        window.grassLOD0MidMesh = grassLOD0MidMesh;
        window.grassLOD0FarMesh = grassLOD0FarMesh;
        window.grassLOD1Mesh = grassLOD1Mesh;
        window.grassMeshRef = grassMeshRef;
    }

    if (!waterMeshRef) {
        waterMeshRef = createCoastalOceanMesh();
        envGroup.add(waterMeshRef);
        window.waterMeshRef = waterMeshRef;
    }

    setWorldSeed(currentSeed);

    // Signature majestic Nordic spruce tree framing the left foreground
    const sigTx = 16.2;
    const sigTz = 9.5;
    const sigTy = getTerrainHeight(sigTx, sigTz);
    const sigScale = 1.35;
    const sigGroup = new THREE.Group();
    sigGroup.position.set(sigTx, sigTy, sigTz);
    sigGroup.scale.setScalar(sigScale);
    const sigMesh = new THREE.Mesh(sharedSpruceGeo, treeMaterial);
    sigMesh.castShadow = true;
    sigMesh.receiveShadow = true;
    sigGroup.add(sigMesh);
    envGroup.add(sigGroup);
    swayTrees.push({
        id: 'signature:spruce:left',
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
        trunkHeight: 14.5 * sigScale,
        type: 'spruce'
    });

    // Signature European seaside cottage overlooking the ocean
    const cotX = -18.0;
    const cotZ = 112.0;
    const cotY = getTerrainHeight(cotX, cotZ);
    const cotMesh = new THREE.Mesh(sharedCottageGeo, villageMat);
    cotMesh.position.set(cotX, cotY - 0.1, cotZ);
    cotMesh.rotation.y = 0.42;
    cotMesh.scale.setScalar(1.05);
    cotMesh.castShadow = true;
    cotMesh.receiveShadow = true;
    envGroup.add(cotMesh);
    aimRaycastMeshes.push(cotMesh);
    const staticCotObj = { mesh: cotMesh, x: cotX, y: cotY, z: cotZ, radius: 5.4, height: 6.6, isRuin: false, type: 'house' };
    worldBuildings.push(staticCotObj);
    worldObstacles.push(staticCotObj);

    // Signature massive limestone cover rock formation near tank spawn for cover practice
    const sigRockX = -19.0;
    const sigRockZ = 22.0;
    const sigRockY = getTerrainHeight(sigRockX, sigRockZ);
    const sigRockMesh = new THREE.Mesh(sharedRockGeo, rockMat);
    sigRockMesh.position.set(sigRockX, sigRockY - 0.25, sigRockZ);
    sigRockMesh.rotation.y = 0.85;
    sigRockMesh.scale.set(1.2, 1.2, 1.2);
    sigRockMesh.castShadow = true;
    sigRockMesh.receiveShadow = true;
    envGroup.add(sigRockMesh);
    aimRaycastMeshes.push(sigRockMesh);
    const sigRockObj = { mesh: sigRockMesh, x: sigRockX, y: sigRockY, z: sigRockZ, radius: 5.8, height: 4.8, type: 'rock' };
    worldBuildings.push({ x: sigRockX, z: sigRockZ, radius: 5.8, isRuin: false, isRock: true });
    worldObstacles.push(sigRockObj);

    // Rising smoke plumes drifting toward the sea
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
                envGroup.add(s);
                activeSmokePuffs.push({
                    sprite: s,
                    originX: so.x + (Math.random() - 0.5) * 2.5,
                    originY: sy + 1.5,
                    originZ: so.z + (Math.random() - 0.5) * 2.5,
                    age: p / so.count,
                    speed: (0.035 + Math.random() * 0.012) / so.mult,
                    scaleMult: so.mult,
                    seed: Math.random() * 100
                });
            }
        });
    }

    updateTerrainChunks(0, 0);
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
// 11. GAME RESTART (NEW SEED ON EACH RESTART)
// ============================================================================
function restartGame(customSeed) {
    const seed = (customSeed !== undefined && customSeed !== null)
        ? customSeed
        : Math.floor(Math.random() * 900000) + 100000;

    setWorldSeed(seed);

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

        const spawnY = getTerrainHeight(0, 0);
        window.tankState.y = spawnY;

        if (window.tankRoot) {
            window.tankRoot.position.set(0, spawnY, 0);
            window.tankRoot.rotation.y = 0;
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
    updateTerrainChunks(0, 0);

    const seedEl = document.getElementById('hud-seed-display');
    if (seedEl) seedEl.textContent = `Seed: ${seed}`;

    console.log(`[TankClash] New Battlefield Generated with Seed: ${seed}`);
}

// ============================================================================
// EXPORTS & WINDOW ATTACHMENTS
// ============================================================================
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
