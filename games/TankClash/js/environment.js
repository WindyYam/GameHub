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
var terrainMeshRef = null;
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

function setWorldSeed(seed) {
    currentSeed = seed;
    window.currentSeed = currentSeed;
    seedOffset.x = (currentSeed % 289);
    seedOffset.z = ((Math.floor(currentSeed / 289)) % 289);
    roadBaseX = Math.sin(seedOffset.z * 0.009) * 32.0 + Math.cos(seedOffset.z * 0.021) * 12.0 + Math.sin(seedOffset.z * 0.0035) * 20.0;

    if (terrainUniforms && terrainUniforms.uSeedOffset) {
        terrainUniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        terrainUniforms.uRoadBaseX.value = roadBaseX;
    }
    if (grassUniforms && grassUniforms.uSeedOffset) {
        grassUniforms.uSeedOffset.value.set(seedOffset.x, seedOffset.z);
        grassUniforms.uRoadBaseX.value = roadBaseX;
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

    float getRoadCenterX_gpu(float z) {
        return (sin((z + uSeedOffset.y) * 0.009) * 32.0 + cos((z + uSeedOffset.y) * 0.021) * 12.0 + sin((z + uSeedOffset.y) * 0.0035) * 20.0) - uRoadBaseX;
    }

    float getRoadFactor_gpu(float x, float z) {
        float roadX = getRoadCenterX_gpu(z);
        float dist = abs(x - roadX);
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
            float roadX = getRoadCenterX_gpu(z);
            float offset = abs(x - roadX);
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

function getRoadCenterX(z) {
    return (Math.sin((z + seedOffset.z) * 0.009) * 32.0 + Math.cos((z + seedOffset.z) * 0.021) * 12.0 + Math.sin((z + seedOffset.z) * 0.0035) * 20.0) - roadBaseX;
}

function getRoadFactor(x, z) {
    const roadX = getRoadCenterX(z);
    const dist = Math.abs(x - roadX);
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
        const roadX = getRoadCenterX(z);
        const offset = Math.abs(x - roadX);
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
// 4. SHARED MATERIALS & SHADERS
// ============================================================================
const terrainUniforms = {
    uTime: { value: 0 },
    uWindSpeed: { value: 1.2 },
    uCameraPos: { value: new THREE.Vector3() },
    uSeedOffset: { value: new THREE.Vector2(0, 0) },
    uRoadBaseX: { value: 0 }
};

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.04
});

terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uWindSpeed = terrainUniforms.uWindSpeed;
    shader.uniforms.uCameraPos = terrainUniforms.uCameraPos;
    shader.uniforms.uSeedOffset = terrainUniforms.uSeedOffset;
    shader.uniforms.uRoadBaseX = terrainUniforms.uRoadBaseX;

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
        float grassSurfaceMask = (1.0 - smoothstep(0.12, 0.45, roadMask)) * (1.0 - smoothstep(0.20, 0.38, vTerrainSlope));

        // High-frequency micro-blade noise for distant LOD continuity
        float microGrass = valueNoise2D_gpu(vTerrainWorldPos.xz * 3.8) * 0.5 + 0.5;

        // Animated traveling wind wave
        vec2 windUV = vTerrainWorldPos.xz * 0.055 + vec2(uTime * 0.38 * uWindSpeed, uTime * 0.18 * uWindSpeed);
        float windRipple = valueNoise2D_gpu(windUV);

        vec3 farBladeTint = mix(vec3(0.07, 0.12, 0.025), vec3(0.19, 0.25, 0.05), microGrass);
        diffuseColor.rgb = mix(diffuseColor.rgb, farBladeTint, grassSurfaceMask * 0.62);
        diffuseColor.rgb *= (1.0 + windRipple * 0.12 * grassSurfaceMask);

        // Shoreline sandy beach & pebble gradient where terrain slopes into the sea
        float beachMask = 1.0 - smoothstep(-2.5, -1.8, vTerrainWorldPos.y);
        vec3 sandCol = mix(vec3(0.66, 0.60, 0.48), vec3(0.48, 0.44, 0.38), microGrass);
        diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, beachMask * 0.88);
        `
    );
};

const treeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.03
});

treeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uWindSpeed = terrainUniforms.uWindSpeed;

    shader.vertexShader = `
        uniform float uTime;
        uniform float uWindSpeed;
        varying vec3 vTreeWorldPos;
        varying float vTreeHeight;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vTreeHeight = max(0.0, position.y);
        vec4 instWorld = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(instWorld.x * 0.08 + instWorld.z * 0.08 + uTime * 1.6 * uWindSpeed) * 0.018 * vTreeHeight;
        transformed.x += sway;
        vTreeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
    );
};

const villageMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04
});

const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7c7972,
    roughness: 0.92,
    metalness: 0.05
});

// ============================================================================
// 5. BOTANICAL MODEL GENERATORS (PRE-COMPILED SHARED BUFFER GEOMETRIES)
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
        mergedPos.set(pos, vOffset * 3);
        mergedNorm.set(norm, vOffset * 3);
        mergedCol.set(col, vOffset * 3);

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
    out.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
    return out;
}

function colorizeBotanicalGeometry(geo, innerHex, outerHex, maxRadius = 2.5) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const count = pos.count;
    const colArr = new Float32Array(count * 3);
    const cInner = new THREE.Color(innerHex);
    const cOuter = new THREE.Color(outerHex);
    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ny = norm ? norm.getY(i) : 0.5;
        const radialDist = Math.hypot(x, z);

        // Core ambient occlusion: vertices near the trunk or beneath foliage layers stay dark
        const radialFactor = Math.min(1.0, radialDist / maxRadius);
        const sunFactor = Math.max(0.0, ny * 0.65 + 0.35);
        const aoFactor = radialFactor * 0.75 + sunFactor * 0.25;

        c.copy(cInner).lerp(cOuter, aoFactor);
        const jitter = (hash2D(x * 12.3 + i, z * 12.3) - 0.5) * 0.04;
        colArr[i * 3 + 0] = Math.min(1, Math.max(0, c.r + jitter));
        colArr[i * 3 + 1] = Math.min(1, Math.max(0, c.g + jitter));
        colArr[i * 3 + 2] = Math.min(1, Math.max(0, c.b + jitter));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    return geo;
}

// Global PBR shading for merged tree geometries: deep trunk shadows, lush mid-foliage & golden sunlit tips
function applyTreePBRShading(geo, trunkRadius, innerHex, midHex, sunlitHex) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const colAttr = geo.attributes.color;
    const count = pos.count;
    const colArr = colAttr ? colAttr.array : new Float32Array(count * 3);

    const cInner = new THREE.Color(innerHex);
    const cMid   = new THREE.Color(midHex);
    const cSun   = new THREE.Color(sunlitHex);
    const c      = new THREE.Color();

    for (let i = 0; i < count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        const ny = norm ? norm.getY(i) : 0.5;

        // Skip trunk vertices (r < 0.45 and low y)
        if (r < 0.42 && y < 11.5) {
            continue;
        }

        const ao = Math.min(1.0, Math.max(0.0, (r - 0.35) / Math.max(0.1, trunkRadius - 0.35)));
        const sun = Math.max(0.0, ny * 0.75 + 0.25);

        // Core to Mid transition based on distance from trunk
        c.copy(cInner).lerp(cMid, ao);
        // Sunlit highlights on upper/outer surfaces
        if (sun > 0.55 && ao > 0.3) {
            c.lerp(cSun, (sun - 0.55) * 1.8 * ao);
        }

        const jitter = (hash2D(x * 14.1 + i, z * 14.1) - 0.5) * 0.035;
        colArr[i * 3 + 0] = Math.min(1, Math.max(0, c.r + jitter));
        colArr[i * 3 + 1] = Math.min(1, Math.max(0, c.g + jitter));
        colArr[i * 3 + 2] = Math.min(1, Math.max(0, c.b + jitter));
    }

    if (!colAttr) {
        geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    }
    return geo;
}

function colorizeSolidGeometry(geo, hexColor, variance = 0.05) {
    const pos = geo.attributes.position;
    const count = pos.count;
    const colArr = new Float32Array(count * 3);
    const base = new THREE.Color(hexColor);
    for (let i = 0; i < count; i++) {
        const v = (hash2D(pos.getX(i) * 7.3 + i, pos.getZ(i) * 7.3) - 0.5) * variance;
        colArr[i * 3 + 0] = Math.min(1, Math.max(0, base.r + v));
        colArr[i * 3 + 1] = Math.min(1, Math.max(0, base.g + v));
        colArr[i * 3 + 2] = Math.min(1, Math.max(0, base.b + v));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    return geo;
}

function createPitchedRoofGeometry(width, length, height) {
    const hw = width * 0.5;
    const hl = length * 0.5;
    const vertices = new Float32Array([
        -hw, 0, -hl,   -hw, 0,  hl,    0, height,  hl,
        -hw, 0, -hl,    0, height,  hl,    0, height, -hl,
         hw, 0,  hl,    hw, 0, -hl,    0, height, -hl,
         hw, 0,  hl,    0, height, -hl,    0, height,  hl,
        -hw, 0,  hl,    hw, 0,  hl,    0, height,  hl,
         hw, 0, -hl,   -hw, 0, -hl,    0, height, -hl
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
}

// 5A. Detailed Multi-Bough Alpine Spruce Tree Geometry (Layered Tiered Needle Boughs)
function createDetailedSpruceGeometry() {
    const parts = [];

    // 1. Tapered Trunk with Flared Root Base & Longitudinal Furrows
    const trunkHeight = 13.8;
    const trunk = new THREE.CylinderGeometry(0.06, 0.52, trunkHeight, 10, 8);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const y = tPos.getY(i);
        const normY = (y + trunkHeight * 0.5) / trunkHeight;
        if (normY < 0.16) {
            const flare = Math.pow((0.16 - normY) / 0.16, 1.8) * 0.75;
            tPos.setX(i, tPos.getX(i) * (1.0 + flare));
            tPos.setZ(i, tPos.getZ(i) * (1.0 + flare));
        }
        const lean = Math.sin(normY * 3.14159) * 0.12;
        tPos.setX(i, tPos.getX(i) + lean);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkHeight * 0.5, 0);
    parts.push(colorizeSolidGeometry(trunk, 0x241810, 0.04));

    // Helper: Creates an arched, faceted needle spray frond with upward-biased normals
    function createNeedleFrond(width, length, droopAngle) {
        const frond = new THREE.ConeGeometry(width, length, 6, 2);
        frond.scale(1.0, 0.20, 0.82);
        frond.rotateZ(Math.PI * 0.5 - droopAngle);
        const n = frond.attributes.normal;
        for (let k = 0; k < n.count; k++) {
            const ny = Math.max(0.48, n.getY(k) + 0.42);
            const nx = n.getX(k) * 0.8;
            const nz = n.getZ(k) * 0.8;
            const len = Math.hypot(nx, ny, nz) || 1.0;
            n.setXYZ(k, nx / len, ny / len, nz / len);
        }
        return frond;
    }

    // 2. 9 Distinct Pronounced Tiers with Natural Branch Spacing & Layered Shadows
    const tiers = 9;
    const tierConfigs = [
        { y: 2.1,  rad: 4.1, boughs: 8, droop: 0.28 },
        { y: 3.4,  rad: 3.8, boughs: 8, droop: 0.25 },
        { y: 4.8,  rad: 3.4, boughs: 7, droop: 0.22 },
        { y: 6.2,  rad: 3.0, boughs: 7, droop: 0.18 },
        { y: 7.6,  rad: 2.5, boughs: 6, droop: 0.15 },
        { y: 9.0,  rad: 2.0, boughs: 6, droop: 0.12 },
        { y: 10.3, rad: 1.5, boughs: 5, droop: 0.09 },
        { y: 11.5, rad: 1.0, boughs: 5, droop: 0.06 },
        { y: 12.5, rad: 0.6, boughs: 4, droop: 0.03 }
    ];

    tierConfigs.forEach((cfg, t) => {
        const yBase = cfg.y;
        const tierRadius = cfg.rad;
        const boughCount = cfg.boughs;
        const tierDroop  = cfg.droop;

        for (let b = 0; b < boughCount; b++) {
            const baseAngle = (b / boughCount) * Math.PI * 2.0 + t * 0.72;
            const angle = baseAngle + (hash2D(b * 3.3 + t, t * 8.1) - 0.5) * 0.15;
            const boughLen = tierRadius * (0.94 + hash2D(b + 7.1, t + 3.3) * 0.20);

            // Woody branch core limb
            const limbLen = boughLen * 0.82;
            const limb = new THREE.CylinderGeometry(0.018, 0.068 * (1.0 - t * 0.08), limbLen, 5);
            limb.rotateZ(Math.PI * 0.5 - tierDroop * 0.75);
            limb.rotateY(angle);
            limb.translate(
                Math.cos(angle) * (limbLen * 0.48),
                yBase - Math.sin(tierDroop) * (limbLen * 0.48),
                Math.sin(angle) * (limbLen * 0.48)
            );
            parts.push(colorizeSolidGeometry(limb, 0x281c12, 0.03));

            // Layered Needle Sprays along bough
            const sprayStations = [0.42, 0.72, 1.02];
            sprayStations.forEach((st, sIdx) => {
                const distAlong = boughLen * st;
                const sprayDroop = tierDroop + (sIdx / sprayStations.length) * 0.14;
                const sprayW = (tierRadius * 0.36) * (1.12 - sIdx * 0.16);
                const sprayL = (tierRadius * 0.52) * (1.08 - sIdx * 0.14);

                const px = Math.cos(angle) * distAlong;
                const py = yBase - Math.sin(sprayDroop) * distAlong;
                const pz = Math.sin(angle) * distAlong;

                // Center main needle spray
                const centerFrond = createNeedleFrond(sprayW, sprayL, sprayDroop);
                centerFrond.rotateY(angle);
                centerFrond.translate(px, py, pz);
                parts.push(centerFrond);

                // Flanking side needle sprays (left & right fan) on outer stations
                if (sIdx >= 1) {
                    const sideAngleOffset = 0.34;
                    const leftFrond = createNeedleFrond(sprayW * 0.82, sprayL * 0.84, sprayDroop + 0.05);
                    leftFrond.rotateY(angle - sideAngleOffset);
                    leftFrond.translate(px, py - 0.04, pz);
                    parts.push(leftFrond);

                    const rightFrond = createNeedleFrond(sprayW * 0.82, sprayL * 0.84, sprayDroop + 0.05);
                    rightFrond.rotateY(angle + sideAngleOffset);
                    rightFrond.translate(px, py - 0.04, pz);
                    parts.push(rightFrond);
                }
            });
        }
    });

    // 3. Dense Apical Spire / Crown Tip
    const crownSpire = new THREE.ConeGeometry(0.35, 2.2, 7, 3);
    crownSpire.translate(0, 13.4, 0);
    parts.push(crownSpire);

    // Merge & Apply PBR Depth Shading
    const merged = mergeBufferGeometries(parts);
    return applyTreePBRShading(merged, 4.2, 0x0c1b0e, 0x1d441c, 0x3d7426);
}

// 5B. Detailed Maritime / Scots Pine Geometry (Rugged Cinnamon Bark & Layered Umbrella Canopy)
function createDetailedPineGeometry() {
    const parts = [];

    // 1. Rugged Trunk with Cinnamon-Red Upper Bark
    const trunkHeight = 11.8;
    const trunk = new THREE.CylinderGeometry(0.09, 0.44, trunkHeight, 8, 6);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const y = tPos.getY(i);
        const ny = (y + trunkHeight * 0.5) / trunkHeight;
        const windLean = Math.sin(ny * 2.8) * 0.35;
        tPos.setX(i, tPos.getX(i) + windLean);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkHeight * 0.5, 0);
    parts.push(colorizeSolidGeometry(trunk, 0x58311e, 0.06));

    // 2. Spreading Umbrella Boughs with Clustered Needle Pads
    const limbConfigs = [
        { y: 5.8, len: 4.2, rx:  0.45, rz:  0.42, rad: 2.3 },
        { y: 6.9, len: 4.6, rx: -0.48, rz:  0.38, rad: 2.5 },
        { y: 7.8, len: 4.1, rx:  0.35, rz: -0.52, rad: 2.2 },
        { y: 8.6, len: 3.8, rx: -0.38, rz: -0.40, rad: 2.1 },
        { y: 9.6, len: 3.2, rx:  0.22, rz:  0.28, rad: 1.9 },
        { y: 10.8, len: 2.4, rx: -0.15, rz: -0.18, rad: 1.5 }
    ];

    limbConfigs.forEach((cfg, idx) => {
        const arm = new THREE.CylinderGeometry(0.055, 0.15, cfg.len, 6);
        arm.translate(0, cfg.len * 0.5, 0);
        arm.rotateX(cfg.rx);
        arm.rotateZ(cfg.rz);
        arm.translate(0, cfg.y, 0);
        parts.push(colorizeSolidGeometry(arm, 0x6e3c23, 0.05));

        const tipPos = new THREE.Vector3(0, cfg.len, 0);
        tipPos.applyEuler(new THREE.Euler(cfg.rx, 0, cfg.rz));
        tipPos.add(new THREE.Vector3(0, cfg.y, 0));

        const padCount = 3;
        for (let p = 0; p < padCount; p++) {
            const padRadius = cfg.rad * (0.85 + p * 0.12);
            const pad = new THREE.CylinderGeometry(padRadius * 0.88, padRadius, 0.52, 9, 1);
            pad.scale(1.0, 0.42, 0.82);

            const n = pad.attributes.normal;
            for (let k = 0; k < n.count; k++) {
                const ny = Math.max(0.58, n.getY(k) + 0.45);
                const nx = n.getX(k) * 0.75;
                const nz = n.getZ(k) * 0.75;
                const len = Math.hypot(nx, ny, nz) || 1.0;
                n.setXYZ(k, nx / len, ny / len, nz / len);
            }

            const ox = (hash2D(idx * 4.3 + p, p * 7.1) - 0.5) * 0.72;
            const oz = (hash2D(p * 9.2 + idx, idx * 3.3) - 0.5) * 0.72;
            pad.translate(tipPos.x + ox, tipPos.y + p * 0.26 - 0.12, tipPos.z + oz);
            parts.push(pad);
        }
    });

    const merged = mergeBufferGeometries(parts);
    return applyTreePBRShading(merged, 4.5, 0x122410, 0x284a1b, 0x4d7927);
}

// 5C. Detailed European Deciduous Tree Geometry (Lush Leafy Canopy with Soft Volumetric Shading)
function createDetailedDeciduousGeometry() {
    const parts = [];

    // 1. Organic Curved Trunk Forking into Scaffold Limbs
    const trunkHeight = 4.6;
    const trunk = new THREE.CylinderGeometry(0.18, 0.48, trunkHeight, 8, 5);
    const tPos = trunk.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        const y = tPos.getY(i);
        const ny = (y + trunkHeight * 0.5) / trunkHeight;
        if (ny < 0.2) {
            const flare = Math.pow((0.2 - ny) / 0.2, 1.6) * 0.42;
            tPos.setX(i, tPos.getX(i) * (1.0 + flare));
            tPos.setZ(i, tPos.getZ(i) * (1.0 + flare));
        }
        const naturalCurve = Math.sin(ny * 2.5) * 0.22;
        tPos.setX(i, tPos.getX(i) + naturalCurve);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, trunkHeight * 0.5, 0);
    parts.push(colorizeSolidGeometry(trunk, 0x483d31, 0.04));

    // Major Scaffold Limbs twisting into crown
    const limbConfigs = [
        { rx:  0.48, rz:  0.42, len: 3.5, y: 3.8, rad: 0.16 },
        { rx: -0.52, rz:  0.36, len: 3.4, y: 4.1, rad: 0.15 },
        { rx:  0.34, rz: -0.55, len: 3.6, y: 3.7, rad: 0.16 },
        { rx: -0.40, rz: -0.45, len: 3.2, y: 4.3, rad: 0.14 },
        { rx:  0.15, rz:  0.18, len: 2.8, y: 4.5, rad: 0.13 }
    ];
    limbConfigs.forEach(cfg => {
        const limb = new THREE.CylinderGeometry(cfg.rad * 0.55, cfg.rad, cfg.len, 6);
        limb.translate(0, cfg.len * 0.5, 0);
        limb.rotateX(cfg.rx);
        limb.rotateZ(cfg.rz);
        limb.translate(0, cfg.y, 0);
        parts.push(colorizeSolidGeometry(limb, 0x403529, 0.04));
    });

    // 2. Volumetric Leafy Canopy Clouds
    const crownCenter = new THREE.Vector3(0, 6.6, 0);
    const canopyLobes = [
        [ 0.0,  6.8,  0.0, 2.35],
        [ 0.2,  8.2,  0.1, 1.95],
        [-1.6,  5.8,  1.1, 1.85],
        [ 1.7,  5.9, -0.8, 1.90],
        [ 1.1,  5.6,  1.6, 1.80],
        [-1.3,  5.5, -1.5, 1.85],
        [-2.3,  5.2,  0.2, 1.65],
        [ 2.4,  5.3,  0.4, 1.70],
        [ 0.3,  5.4, -2.2, 1.75],
        [-0.4,  5.3,  2.3, 1.75],
        [ 1.1,  7.4,  0.9, 1.65],
        [-1.0,  7.5, -0.7, 1.70],
        [-0.8,  7.3,  1.2, 1.60],
        [ 1.2,  7.2, -1.1, 1.65],
        [ 0.0,  9.1,  0.0, 1.45],
        [-1.8,  4.4,  0.8, 1.45],
        [ 1.9,  4.5, -0.7, 1.50],
        [ 0.8,  4.3,  1.9, 1.40],
        [-0.9,  4.2, -1.8, 1.40],
        [-2.7,  4.5, -0.4, 1.25],
        [ 2.6,  4.6,  0.7, 1.30],
        [ 0.0,  4.5, -2.5, 1.25],
        [ 0.2,  4.4,  2.6, 1.25]
    ];

    canopyLobes.forEach(([cx, cy, cz, radius], idx) => {
        const lobe = new THREE.IcosahedronGeometry(radius, 2);
        const lPos = lobe.attributes.position;
        const lNorm = lobe.attributes.normal;

        for (let k = 0; k < lPos.count; k++) {
            const vx = lPos.getX(k), vy = lPos.getY(k), vz = lPos.getZ(k);
            const leafTurb = Math.sin(vx * 4.2 + idx * 2.1) * Math.cos(vy * 4.8 + vz * 3.5) * 0.16
                           + (hash2D(vx * 7.3 + idx, vz * 7.3) - 0.5) * 0.12;
            const s = 1.0 + leafTurb;
            lPos.setXYZ(k, vx * s, vy * (0.84 + leafTurb * 0.3) * s, vz * s);

            const worldPt = new THREE.Vector3(lPos.getX(k) + cx, lPos.getY(k) + cy, lPos.getZ(k) + cz);
            const outwardNorm = worldPt.clone().sub(crownCenter).normalize();
            const localNorm = new THREE.Vector3(lNorm.getX(k), lNorm.getY(k), lNorm.getZ(k));
            const blended = localNorm.lerp(outwardNorm, 0.68).normalize();
            blended.y = Math.max(0.2, blended.y + 0.15);
            blended.normalize();
            lNorm.setXYZ(k, blended.x, blended.y, blended.z);
        }

        lobe.translate(cx, cy, cz);
        parts.push(lobe);
    });

    const merged = mergeBufferGeometries(parts);
    return applyTreePBRShading(merged, 4.0, 0x162c0e, 0x355a1a, 0x5a8726);
}

// 5D. Detailed Meadow Shrub / Wildflower Bush Geometry
function createDetailedBushGeometry() {
    const parts = [];
    const lobes = [
        [ 0.0,  0.88,  0.0, 1.25],
        [-0.85, 0.68,  0.48, 0.98],
        [ 0.90, 0.72, -0.38, 1.02],
        [ 0.30, 0.64,  0.82, 0.92],
        [-0.40, 0.66, -0.78, 0.94],
        [ 0.0,  1.35,  0.12, 0.90],
        [-0.55, 1.15, -0.35, 0.78],
        [ 0.60, 1.12,  0.42, 0.82]
    ];
    lobes.forEach(([bx, by, bz, br], idx) => {
        const g = new THREE.IcosahedronGeometry(br, 2);
        const p = g.attributes.position;
        const n = g.attributes.normal;
        for (let k = 0; k < p.count; k++) {
            const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
            const turb = (hash2D(vx * 8.5 + idx, vz * 8.5) - 0.5) * 0.22;
            const s = 1.0 + turb;
            p.setXYZ(k, vx * s, vy * 0.8 * s, vz * s);
            n.setY(k, Math.max(0.35, n.getY(k) + 0.3));
        }
        g.computeVertexNormals();
        g.translate(bx, by, bz);
        const outerCol = (idx % 2 === 0) ? 0x4a7324 : 0x59842a;
        parts.push(colorizeBotanicalGeometry(g, 0x182811, outerCol, 1.8));
    });
    return mergeBufferGeometries(parts);
}

// 5E. Limestone Boulder & Outcrop Geometry (Stratified Bedding & Weathered Crevices)
function createLimestoneRockGeometry() {
    const parts = [];
    // Multiple interlocking boulders forming an organic outcrop cluster
    const boulders = [
        { x: 0, y: 0.45, z: 0, sx: 1.45, sy: 0.85, sz: 1.25, rot: 0.2 },
        { x: 0.85, y: 0.32, z: 0.45, sx: 1.1, sy: 0.65, sz: 0.95, rot: 1.1 },
        { x: -0.75, y: 0.28, z: -0.35, sx: 1.0, sy: 0.55, sz: 0.85, rot: 2.3 }
    ];

    boulders.forEach(b => {
        const geo = new THREE.DodecahedronGeometry(1.0, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
            // Stratified horizontal rock bedding planes
            const layerJitter = Math.sin(vy * 8.0) * 0.08 + (hash2D(vx * 6.2, vz * 6.2) - 0.5) * 0.18;
            const s = 0.88 + layerJitter;
            p.setXYZ(i, vx * s * b.sx, vy * s * b.sy, vz * s * b.sz);
        }
        geo.computeVertexNormals();
        geo.rotateY(b.rot);
        geo.translate(b.x, b.y, b.z);
        parts.push(colorizeSolidGeometry(geo, 0x76736a, 0.08));
    });

    return mergeBufferGeometries(parts);
}

// 5E. European Timber-Framed Cottage Geometry
function createEuropeanCottageGeometry() {
    const parts = [];
    const w = 4.6, h = 3.2, l = 6.4;

    const foundation = new THREE.BoxGeometry(w + 0.25, 0.75, l + 0.25);
    foundation.translate(0, 0.375, 0);
    parts.push(colorizeSolidGeometry(foundation, 0x524e48, 0.06));

    const walls = new THREE.BoxGeometry(w, h, l);
    walls.translate(0, 0.75 + h * 0.5, 0);
    parts.push(colorizeSolidGeometry(walls, 0xe4ded3, 0.04));

    const beamMatHex = 0x332419;
    const cornerOffsets = [[-w * 0.5, -l * 0.5], [w * 0.5, -l * 0.5], [-w * 0.5, l * 0.5], [w * 0.5, l * 0.5]];
    cornerOffsets.forEach(([cx, cz]) => {
        const post = new THREE.BoxGeometry(0.22, h, 0.22);
        post.translate(cx, 0.75 + h * 0.5, cz);
        parts.push(colorizeSolidGeometry(post, beamMatHex, 0.03));
    });

    const plateBeam = new THREE.BoxGeometry(w + 0.12, 0.2, l + 0.12);
    plateBeam.translate(0, 0.75 + h * 0.55, 0);
    parts.push(colorizeSolidGeometry(plateBeam, beamMatHex, 0.03));

    const winPositions = [[-w * 0.51, 2.5, -1.5], [-w * 0.51, 2.5, 1.5], [w * 0.51, 2.5, -1.5], [w * 0.51, 2.5, 1.5]];
    winPositions.forEach(([wx, wy, wz]) => {
        const win = new THREE.BoxGeometry(0.12, 0.85, 0.75);
        win.translate(wx, wy, wz);
        parts.push(colorizeSolidGeometry(win, 0x1a2026, 0.02));
    });

    // Warm terracotta red tile roof matching seaside countryside cottage
    const roof = createPitchedRoofGeometry(w + 0.85, l + 0.9, 2.65);
    roof.translate(0, 0.75 + h, 0);
    parts.push(colorizeSolidGeometry(roof, 0xb24526, 0.06));

    const chimney = new THREE.BoxGeometry(0.65, 2.4, 0.65);
    chimney.translate(w * 0.22, 0.75 + h + 1.4, -l * 0.25);
    parts.push(colorizeSolidGeometry(chimney, 0x8a3824, 0.05));

    const shed = new THREE.BoxGeometry(2.1, 2.2, 3.6);
    shed.translate(w * 0.5 + 1.0, 1.1, 0.4);
    parts.push(colorizeSolidGeometry(shed, 0x4d3a29, 0.06));

    return mergeBufferGeometries(parts);
}

// 5F. War-Damaged Smoldering Ruined House Geometry
function createRuinedHouseGeometry() {
    const parts = [];
    const w = 4.8, h = 2.8, l = 6.2;

    const baseShell = new THREE.BoxGeometry(w, h * 0.65, l);
    baseShell.translate(0, h * 0.325, 0);
    parts.push(colorizeSolidGeometry(baseShell, 0x453f39, 0.09));

    const gableWall = new THREE.BoxGeometry(w * 0.92, h * 1.15, 0.45);
    gableWall.translate(0, h * 0.57, -l * 0.46);
    parts.push(colorizeSolidGeometry(gableWall, 0x594d43, 0.08));

    const chimney = new THREE.BoxGeometry(0.7, 4.4, 0.7);
    chimney.translate(-w * 0.25, 2.2, -l * 0.35);
    parts.push(colorizeSolidGeometry(chimney, 0x3b2a22, 0.05));

    for (let r = -2; r <= 2; r++) {
        const rafter = new THREE.BoxGeometry(0.16, 2.9, 0.16);
        rafter.rotateZ(0.68);
        rafter.translate(-1.1, h * 0.78, r * 1.1);
        parts.push(colorizeSolidGeometry(rafter, 0x1c1714, 0.03));
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

function ensureSharedGeometries() {
    if (!sharedSpruceGeo) sharedSpruceGeo = createDetailedSpruceGeometry();
    if (!sharedPineGeo) sharedPineGeo = createDetailedPineGeometry();
    if (!sharedDecidGeo) sharedDecidGeo = createDetailedDeciduousGeometry();
    if (!sharedBushGeo) sharedBushGeo = createDetailedBushGeometry();
    if (!sharedRockGeo) sharedRockGeo = createLimestoneRockGeometry();
    if (!sharedCottageGeo) sharedCottageGeo = createEuropeanCottageGeometry();
    if (!sharedRuinGeo) sharedRuinGeo = createRuinedHouseGeometry();

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
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0.0, 'rgba(65, 62, 68, 0.65)');
    grad.addColorStop(0.45, 'rgba(50, 48, 55, 0.35)');
    grad.addColorStop(1.0, 'rgba(35, 35, 42, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

function createFireCanvasTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 58);
    grad.addColorStop(0.0, 'rgba(255, 245, 190, 1.0)');
    grad.addColorStop(0.28, 'rgba(255, 145, 35, 0.85)');
    grad.addColorStop(0.65, 'rgba(215, 50, 10, 0.35)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

var sharedSmokeTex = null;
var sharedFireTex = null;

// ============================================================================
// 7. SMOOTH STRATIFIED TOROIDAL GPU WRAPPING GRASS SYSTEM
// ============================================================================
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1);
}

const LOD0_PATCH_SIZE = 110.0;       // Covers [0m .. 55m] with high LOD0 blade density (10.74 inst/m², ~32 blades/m²)
const LOD0_MID_PATCH_SIZE = 280.0;   // Covers [55m .. 140m] with identical high density as near ring (10.74 inst/m²)
const LOD0_FAR_PATCH_SIZE = 500.0;   // Covers [140m .. 250m] with previous mid ring density (1.72 inst/m²)

function createLOD0BladeGeometry() {
    const geo = new THREE.BufferGeometry();
    const bw = 0.065, bh = 0.9;
    const angles = [0.0, 1.05, 2.09]; // 0 deg, 60 deg, 120 deg
    const heightMults = [1.0, 0.92, 0.86];
    const zBends = [0.28, -0.22, 0.18];

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let b = 0; b < 3; b++) {
        const ang = angles[b];
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const h = bh * heightMults[b];
        const zb = zBends[b];
        const baseIdx = b * 7;

        const verts = [
            [-bw,        0.0,      0.0,        0.0, 0.0],
            [ bw,        0.0,      0.0,        1.0, 0.0],
            [-bw * 0.82, h * 0.33, zb * 0.15,  0.0, 0.33],
            [ bw * 0.82, h * 0.33, zb * 0.15,  1.0, 0.33],
            [-bw * 0.52, h * 0.68, zb * 0.45,  0.0, 0.68],
            [ bw * 0.52, h * 0.68, zb * 0.45,  1.0, 0.68],
            [ 0.0,       h,        zb,         0.5, 1.0]
        ];

        for (let i = 0; i < verts.length; i++) {
            let rx = verts[i][0] * ca - verts[i][2] * sa;
            let rz = verts[i][0] * sa + verts[i][2] * ca;
            positions.push(rx, verts[i][1], rz);
            uvs.push(verts[i][3], verts[i][4]);
        }

        indices.push(
            baseIdx + 0, baseIdx + 1, baseIdx + 2,
            baseIdx + 2, baseIdx + 1, baseIdx + 3,
            baseIdx + 2, baseIdx + 3, baseIdx + 4,
            baseIdx + 4, baseIdx + 3, baseIdx + 5,
            baseIdx + 4, baseIdx + 5, baseIdx + 6
        );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

function createLOD1ClumpGeometry() {
    const geo = new THREE.BufferGeometry();
    const bw1 = 0.25, bh1 = 0.94;
    const bw2 = 0.21, bh2 = 0.88;
    const ang2 = 1.15;
    const c2 = Math.cos(ang2), s2 = Math.sin(ang2);

    const positions = [];
    const uvs = [];
    const indices = [];

    // Clump blade 1
    const b1 = [
        [-bw1,        0.0,        0.0,   0.0, 0.0],
        [ bw1,        0.0,        0.0,   1.0, 0.0],
        [-bw1 * 0.70, bh1 * 0.50, 0.12,  0.0, 0.5],
        [ bw1 * 0.70, bh1 * 0.50, 0.12,  1.0, 0.5],
        [ 0.0,        bh1,        0.28,  0.5, 1.0]
    ];
    for (let i = 0; i < b1.length; i++) {
        positions.push(b1[i][0], b1[i][1], b1[i][2]);
        uvs.push(b1[i][3], b1[i][4]);
    }
    indices.push(0, 1, 2,  2, 1, 3,  2, 3, 4);

    // Clump blade 2
    const b2 = [
        [-bw2,        0.0,        0.0,   0.0, 0.0],
        [ bw2,        0.0,        0.0,   1.0, 0.0],
        [-bw2 * 0.70, bh2 * 0.50, -0.10, 0.0, 0.5],
        [ bw2 * 0.70, bh2 * 0.50, -0.10, 1.0, 0.5],
        [ 0.0,        bh2,        -0.24, 0.5, 1.0]
    ];
    const baseIdx = 5;
    for (let i = 0; i < b2.length; i++) {
        let rx = b2[i][0] * c2 - b2[i][2] * s2;
        let rz = b2[i][0] * s2 + b2[i][2] * c2;
        positions.push(rx, b2[i][1], rz);
        uvs.push(b2[i][3], b2[i][4]);
    }
    indices.push(
        baseIdx + 0, baseIdx + 1, baseIdx + 2,
        baseIdx + 2, baseIdx + 1, baseIdx + 3,
        baseIdx + 2, baseIdx + 3, baseIdx + 4
    );

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

const grassUniforms = {
    uTime: { value: 0 },
    uWindSpeed: { value: 1.2 },
    uCameraPos: { value: new THREE.Vector3() },
    uSeedOffset: terrainUniforms.uSeedOffset,
    uRoadBaseX: terrainUniforms.uRoadBaseX,
    uBuildings: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uBuildingCount: { value: 0 }
};

// Stratified jittered grid placement ensures smooth, completely uniform grass coverage
function createStratifiedToroidalGrass(geo, count, patchSize, minRadius, maxRadius, isLOD0) {
    const gridSide = Math.ceil(Math.sqrt(count));
    const cellSize = patchSize / gridSide;
    const offsets = new Float32Array(count * 4);
    let idx = 0;

    for (let gx = 0; gx < gridSide && idx < count; gx++) {
        for (let gz = 0; gz < gridSide && idx < count; gz++) {
            const jx = (gx + 0.12 + Math.random() * 0.76) * cellSize - patchSize * 0.5;
            const jz = (gz + 0.12 + Math.random() * 0.76) * cellSize - patchSize * 0.5;
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
        color: 0x668039,
        roughness: 0.88,
        metalness: 0.0,
        side: THREE.DoubleSide
    });

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = grassUniforms.uTime;
        shader.uniforms.uWindSpeed = grassUniforms.uWindSpeed;
        shader.uniforms.uCameraPos = grassUniforms.uCameraPos;
        shader.uniforms.uSeedOffset = grassUniforms.uSeedOffset;
        shader.uniforms.uRoadBaseX = grassUniforms.uRoadBaseX;
        shader.uniforms.uBuildings = grassUniforms.uBuildings;
        shader.uniforms.uBuildingCount = grassUniforms.uBuildingCount;
        shader.uniforms.uPatchSize = { value: patchSize };
        shader.uniforms.uMinRadius = { value: minRadius };
        shader.uniforms.uMaxRadius = { value: maxRadius };

        shader.vertexShader = `
            attribute vec4 aInstanceData;
            uniform float uTime;
            uniform float uWindSpeed;
            uniform vec3 uCameraPos;
            uniform float uPatchSize;
            uniform float uMinRadius;
            uniform float uMaxRadius;
            uniform vec4 uBuildings[16];
            uniform int uBuildingCount;

            varying float vHeightRatio;
            varying vec3 vWorldPos;
            varying float vBladeSeed;
            varying float vFlowerType;
            ${SHARED_TERRAIN_GLSL}
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vHeightRatio = uv.y;
            float seed = aInstanceData.w;
            vBladeSeed = seed;

            // Toroidal wrap around camera/tank XZ so grass infinitely surrounds the player
            vec2 relXZ = mod(aInstanceData.xy - uCameraPos.xz + uPatchSize * 0.5, uPatchSize) - uPatchSize * 0.5;
            vec2 worldXZ = uCameraPos.xz + relXZ;

            float worldHash = hash2D_gpu(floor(worldXZ * 2.5) + seed * 17.3);
            float distToCam = length(relXZ);

            // Crisp, solid boundary with zero cross-fade: full height & thickness across the entire layer
            float ringVisibility = (distToCam >= uMinRadius && distToCam < uMaxRadius) ? 1.0 : 0.0;

            // Accurate GPU terrain height matching CPU identically
            vec3 surfNorm;
            float groundY = getTerrainSurfaceHeight_gpu(worldXZ.x, worldXZ.y, surfNorm);
            float slope = 1.0 - surfNorm.y;
            float slopeCull = 1.0 - smoothstep(0.22, 0.35, slope);

            // Road culling: completely clear road bed and muddy tracks
            float roadF = getRoadFactor_gpu(worldXZ.x, worldXZ.y);
            float roadCull = 1.0 - smoothstep(0.08, 0.32, roadF);

            // House, farmstead & ruin building culling: zero grass inside cottages/ruins
            float bldgCull = 1.0;
            for (int b = 0; b < 16; b++) {
                if (b >= uBuildingCount) break;
                float distB = length(worldXZ - uBuildings[b].xy);
                if (distB < uBuildings[b].z) {
                    bldgCull = 0.0;
                }
            }

            // Spawn pad clearing (tight clearance around tank hull, leaving lush grass around tracks)
            float dSpawn = length(worldXZ);
            float spawnCull = smoothstep(0.8, 2.2, dSpawn);

            // Flowers (buttercups & golden seed heads) on select LOD0 blades
            vFlowerType = (${isLOD0 ? '1.0' : '0.0'} > 0.5 && seed > 0.94 && roadF < 0.20 && groundY > -1.5) ? 1.0 : 0.0;

            // Zero grass in the seaside ocean
            float waterCull = smoothstep(-2.4, -1.6, groundY);
            float masterScale = ringVisibility * roadCull * slopeCull * bldgCull * spawnCull * waterCull;

            // Blade rotation and dimensions (smooth, consistent height across meadow)
            float ang = aInstanceData.z + worldHash * 6.28318;
            float ca = cos(ang), sa = sin(ang);

            // Consistent, uniform height and thickness across the entire meadow
            float hScale = (0.94 + fract(seed * 7.13) * 0.28) * masterScale;
            float wScale = (1.05 + fract(seed * 3.7) * 0.22) * (vFlowerType > 0.5 ? 1.6 : 1.0) * step(0.001, masterScale);

            vec3 localPos = transformed;
            localPos.x *= wScale;
            localPos.y *= hScale;
            localPos.z *= wScale;

            vec3 rotPos = vec3(
                localPos.x * ca - localPos.z * sa,
                localPos.y,
                localPos.x * sa + localPos.z * ca
            );

            // Traveling wind wave across meadow
            float windWave = sin(worldXZ.x * 0.085 + worldXZ.y * 0.065 + uTime * 2.35 * uWindSpeed) * 0.28
                           + cos(worldXZ.x * 0.20 - uTime * 3.1 * uWindSpeed + seed * 6.0) * 0.10;
            float bend = windWave * vHeightRatio * vHeightRatio * hScale;
            rotPos.x += bend;
            rotPos.z += bend * 0.55;
            rotPos.y -= abs(bend) * 0.20;

            vec3 surfaceTangentX = normalize(vec3(ca, -(surfNorm.x * ca + surfNorm.z * sa) / max(surfNorm.y, 0.001), sa));
            vec3 surfaceTangentZ = normalize(cross(surfaceTangentX, surfNorm));
            vec3 surfaceOffset = surfaceTangentX * rotPos.x + surfNorm * rotPos.y + surfaceTangentZ * rotPos.z;

            transformed = surfaceOffset + vec3(worldXZ.x, groundY - 0.015, worldXZ.y);
            vWorldPos = transformed;
            `
        );

        shader.fragmentShader = `
            varying float vHeightRatio;
            varying vec3 vWorldPos;
            varying float vBladeSeed;
            varying float vFlowerType;
            ${SHARED_TERRAIN_GLSL}
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float fieldVariation = fbm3_gpu((vWorldPos.xz + uSeedOffset) * 0.007) * 0.5 + 0.5;
            float bladeVariation = hash2D_gpu(floor(vWorldPos.xz * 1.7) + vBladeSeed * 23.0);
            vec3 yellowGreen = vec3(0.66, 0.74, 0.25);
            vec3 normalGreen = vec3(0.32, 0.64, 0.19);
            vec3 fieldColor = mix(yellowGreen, normalGreen, smoothstep(0.22, 0.78, fieldVariation));
            vec3 tipCol = fieldColor * mix(0.90, 1.08, bladeVariation);
            vec3 rootCol = fieldColor * vec3(0.32, 0.42, 0.18);
            vec3 bladeGrad = mix(rootCol, tipCol, smoothstep(0.0, 0.45, vHeightRatio));

            if (vFlowerType > 0.5 && vHeightRatio > 0.72) {
                vec3 blossomCol = vBladeSeed > 0.982 ? vec3(0.98, 0.95, 0.82) : vec3(0.98, 0.78, 0.15);
                bladeGrad = mix(bladeGrad, blossomCol, smoothstep(0.72, 0.85, vHeightRatio));
            }

            diffuseColor.rgb = bladeGrad;
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
// 8. CHUNK-BASED PROCEDURAL INFINITE TERRAIN ENGINE
// ============================================================================
const CHUNK_SIZE = 80;
const CHUNK_SEGS = 32; // 2.5m resolution ensures smooth, accurate terrain curve matching
const VIEW_RADIUS = 3; // 7x7 grid = 560m x 560m around the tank

class TerrainChunk {
    constructor(cx, cz) {
        this.cx = cx;
        this.cz = cz;
        this.chunkKey = `${cx},${cz}`;
        this.group = new THREE.Group();
        this.trees = [];
        this.targets = [];
        this.buildings = [];
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

        const colLushGrass = new THREE.Color(0x263a1c);
        const colDryGrass  = new THREE.Color(0x514b23);
        const colSunlitGrass = new THREE.Color(0x3c5125);
        const colMudRoad   = new THREE.Color(0x3a2e21);
        const colWetRut    = new THREE.Color(0x221a12);
        const colCliffRock = new THREE.Color(0x52504c);
        const colMountain  = new THREE.Color(0x3a444e);
        const tempCol = new THREE.Color();

        const xMin = this.cx * CHUNK_SIZE;
        const zMin = this.cz * CHUNK_SIZE;

        for (let i = 0; i < count; i++) {
            const lx = pos.getX(i);
            const lz = pos.getZ(i);
            const wx = xMin + lx + CHUNK_SIZE * 0.5;
            const wz = zMin + lz + CHUNK_SIZE * 0.5;
            const wy = getTerrainHeight(wx, wz);

            pos.setXYZ(i, lx, wy, lz);

            const n = getTerrainNormal(wx, wz);
            const slope = 1.0 - n.y;
            const patchNoise = fbm3((wx + seedOffset.x) * 0.04, (wz + seedOffset.z) * 0.04) * 0.5 + 0.5;
            const fieldNoise = fbm3((wx + seedOffset.x) * 0.014, (wz + seedOffset.z) * 0.014) * 0.5 + 0.5;

            tempCol.copy(colLushGrass).lerp(colSunlitGrass, smoothstep(0.10, 0.60, fieldNoise) * 0.75);
            tempCol.lerp(colDryGrass, smoothstep(0.58, 0.94, fieldNoise) * 0.82);
            tempCol.lerp(colLushGrass, patchNoise * 0.12);

            const roadF = getRoadFactor(wx, wz);
            if (roadF > 0.01) {
                const roadX = getRoadCenterX(wz);
                const rutDist = Math.abs(Math.abs(wx - roadX) - 1.35);
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
    }

    populateChunkContent() {
        const rng = createChunkRNG(this.cx, this.cz, currentSeed);
        const xMin = this.cx * CHUNK_SIZE;
        const zMin = this.cz * CHUNK_SIZE;
        const distFromSpawn = Math.hypot((this.cx + 0.5) * CHUNK_SIZE, (this.cz + 0.5) * CHUNK_SIZE);

        // 1. Botanical Trees (Spruce & Deciduous)
        const treeCount = Math.floor(rng() * 4) + 2;
        for (let t = 0; t < treeCount; t++) {
            const tx = xMin + (0.08 + rng() * 0.84) * CHUNK_SIZE;
            const tz = zMin + (0.08 + rng() * 0.84) * CHUNK_SIZE;

            if (Math.hypot(tx, tz) < 14) continue;
            if (getRoadFactor(tx, tz) > 0.22) continue;

            const ty = getTerrainHeight(tx, tz);
            if (ty < -2.6) continue; // Don't spawn trees underwater in the coastal ocean
            const treeRoll = rng();
            let treeGeo, treeType, trunkH;
            if (treeRoll < 0.52) {
                treeGeo = sharedSpruceGeo;
                treeType = 'spruce';
                trunkH = 13.6;
            } else if (treeRoll < 0.76) {
                treeGeo = sharedPineGeo;
                treeType = 'pine';
                trunkH = 11.8;
            } else {
                treeGeo = sharedDecidGeo;
                treeType = 'beech';
                trunkH = 9.2;
            }
            const scale = 0.85 + rng() * 0.55;

            const treeGroup = new THREE.Group();
            treeGroup.position.set(tx, ty, tz);
            treeGroup.scale.setScalar(scale);

            const treeMesh = new THREE.Mesh(treeGeo, treeMaterial);
            treeMesh.castShadow = true;
            treeMesh.receiveShadow = true;
            treeGroup.add(treeMesh);
            this.group.add(treeGroup);

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

        // 2. Hillside Bushes
        const bushCount = Math.floor(rng() * 3) + 1;
        for (let b = 0; b < bushCount; b++) {
            const bx = xMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            const bz = zMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            if (getRoadFactor(bx, bz) > 0.28) continue;
            const by = getTerrainHeight(bx, bz);
            if (by < -2.6) continue;
            const bushMesh = new THREE.Mesh(sharedBushGeo, treeMaterial);
            const bs = 0.65 + rng() * 0.65;
            bushMesh.position.set(bx, by, bz);
            bushMesh.scale.set(bs * 1.15, bs * 0.9, bs * 1.15);
            bushMesh.rotation.y = rng() * Math.PI * 2;
            bushMesh.castShadow = true;
            bushMesh.receiveShadow = true;
            this.group.add(bushMesh);
        }

        // 3. Limestone Boulders
        const rockCount = Math.floor(rng() * 3);
        for (let r = 0; r < rockCount; r++) {
            const rx = xMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            const rz = zMin + (0.05 + rng() * 0.90) * CHUNK_SIZE;
            if (getRoadFactor(rx, rz) > 0.35) continue;
            const ry = getTerrainHeight(rx, rz);
            if (ry < -2.8) continue;
            const rockMesh = new THREE.Mesh(sharedRockGeo, rockMat);
            const rs = 0.55 + rng() * 1.15;
            rockMesh.position.set(rx, ry + 0.1, rz);
            rockMesh.scale.set(rs * 1.2, rs * 0.65, rs * 1.1);
            rockMesh.rotation.set(rng() * 3, rng() * 3, rng() * 3);
            rockMesh.castShadow = true;
            rockMesh.receiveShadow = true;
            this.group.add(rockMesh);
        }

        // 4. European Cottages, Farmsteads or Smoldering Battlefield Ruins
        if (distFromSpawn > 35 && rng() < 0.22) {
            const centerZ = zMin + CHUNK_SIZE * 0.5;
            const roadX = getRoadCenterX(centerZ);
            const sideSign = (rng() > 0.5) ? 1 : -1;
            const hx = roadX + sideSign * (14.0 + rng() * 10.0);
            const hz = centerZ + (rng() - 0.5) * 20.0;
            const hy = getTerrainHeight(hx, hz);
            const norm = getTerrainNormal(hx, hz);

            if (hy > -1.8 && norm.y > 0.88) {
                const isRuin = (rng() < 0.42);
                const bldgGeo = isRuin ? sharedRuinGeo : sharedCottageGeo;
                const bldgMesh = new THREE.Mesh(bldgGeo, villageMat);
                const bScale = 0.82 + rng() * 0.32;
                bldgMesh.position.set(hx, hy - 0.15, hz);
                bldgMesh.rotation.y = rng() * Math.PI * 2;
                bldgMesh.scale.setScalar(bScale);
                bldgMesh.castShadow = true;
                bldgMesh.receiveShadow = true;
                this.group.add(bldgMesh);

                const bldgObj = {
                    x: hx,
                    z: hz,
                    radius: (isRuin ? 3.8 : 4.5) * bScale,
                    isRuin: isRuin
                };
                this.buildings.push(bldgObj);
                worldBuildings.push(bldgObj);

                // Smoldering fire sprite, orange point light and rising smoke plume
                if (isRuin && sharedFireTex && sharedSmokeTex) {
                    const fireMat = new THREE.SpriteMaterial({
                        map: sharedFireTex,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        transparent: true
                    });
                    const fireSprite = new THREE.Sprite(fireMat);
                    fireSprite.position.set(hx, hy + 2.0, hz);
                    fireSprite.scale.set(8.5 * bScale, 6.5 * bScale, 1);
                    if (window.excludeFromSSAO) window.excludeFromSSAO(fireSprite);
                    this.group.add(fireSprite);

                    const fireLight = new THREE.PointLight(0xff6a1a, 1.8, 38);
                    fireLight.position.set(hx, hy + 3.0, hz);
                    this.group.add(fireLight);

                    const fireData = {
                        sprite: fireSprite,
                        light: fireLight,
                        baseScale: 8.5 * bScale,
                        phase: rng() * 10
                    };
                    this.fireSprites.push(fireData);
                    activeFireSprites.push(fireData);

                    const puffCount = 18;
                    for (let p = 0; p < puffCount; p++) {
                        const sMat = new THREE.SpriteMaterial({
                            map: sharedSmokeTex,
                            transparent: true,
                            depthWrite: false,
                            opacity: 0.42
                        });
                        const s = new THREE.Sprite(sMat);
                        if (window.excludeFromSSAO) window.excludeFromSSAO(s);
                        this.group.add(s);

                        const puffData = {
                            sprite: s,
                            originX: hx + (rng() - 0.5) * 3,
                            originY: hy + 1.2,
                            originZ: hz + (rng() - 0.5) * 3,
                            age: p / puffCount,
                            speed: (0.040 + rng() * 0.015) / bScale,
                            scaleMult: bScale,
                            seed: rng() * 100
                        };
                        this.smokePuffs.push(puffData);
                        activeSmokePuffs.push(puffData);
                    }
                }
            }
        }

        // 5. Reactive Armored Target Hulls for Gunnery Practice
        if (distFromSpawn > 45 && rng() < 0.16) {
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

                tg.lookAt(0, ty, 0);
                this.group.add(tg);

                if (isDestroyed) {
                    platePivot.rotation.x = Math.PI * 0.45;
                }

                const tgtObj = {
                    id: targetId,
                    group: tg,
                    pivot: platePivot,
                    plateMat: plateMat,
                    x: tx,
                    y: ty + 1.25,
                    z: tz,
                    hitAngle: isDestroyed ? Math.PI * 0.45 : 0,
                    recoverTimer: 0
                };
                this.targets.push(tgtObj);
                targets.push(tgtObj);
            }
        }
    }

    dispose() {
        chunksGroup.remove(this.group);

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
        });

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

    const neededKeys = new Set();
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
            const cx = playerCX + dx;
            const cz = playerCZ + dz;
            const key = `${cx},${cz}`;
            neededKeys.add(key);
            if (!activeChunks.has(key)) {
                activeChunks.set(key, new TerrainChunk(cx, cz));
            }
        }
    }

    for (const [key, chunk] of activeChunks.entries()) {
        if (!neededKeys.has(key)) {
            chunk.dispose();
            activeChunks.delete(key);
        }
    }
}

// ============================================================================
// 9. TREE DESTRUCTION & PERSISTENCE
// ============================================================================
function hitTree(tree, hitDir, force = 3.5) {
    if (!tree || tree.isFallen) return;
    tree.isFallen = true;
    tree.angularVel = Math.max(2.2, force);

    if (tree.id) {
        sessionFallenTrees.add(tree.id);
    }

    const hDir = new THREE.Vector3(hitDir ? hitDir.x : 0, 0, hitDir ? hitDir.z : 1).normalize();
    if (hDir.lengthSq() < 0.001) hDir.set(0, 0, 1);
    tree.fallAxis = new THREE.Vector3(-hDir.z, 0, hDir.x).normalize();

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

    ensureSharedGeometries();
    if (!sharedSmokeTex) sharedSmokeTex = createSmokeCanvasTexture();
    if (!sharedFireTex) sharedFireTex = createFireCanvasTexture();
}

function createCoastalOceanMesh() {
    const oceanGeo = new THREE.PlaneGeometry(3600, 2400, 96, 96);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = (typeof window.createCoastalOceanMaterial === 'function')
        ? window.createCoastalOceanMaterial()
        : new THREE.MeshStandardMaterial({ color: 0x0c3b6b, roughness: 0.15, metalness: 0.8 });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(0, -2.5, 1450);
    oceanMesh.receiveShadow = true;
    return oceanMesh;
}

function buildEnvironment(scene) {
    initEnvironment(scene || window.scene);

    for (const chunk of activeChunks.values()) {
        chunk.dispose();
    }
    activeChunks.clear();
    activeSmokePuffs.length = 0;
    activeFireSprites.length = 0;
    swayTrees.length = 0;
    targets.length = 0;
    worldBuildings.length = 0;

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
        terrainMeshRef = floor;
        window.terrainMeshRef = floor;
        return;
    }

    // --- REVERTED TO PREVIOUS MALDIVE CELESTIAL SKY DOME ---
    currentScene.background.setHex(0xc7d4e0);
    currentScene.fog.color.setHex(0xc2d0dc);
    currentScene.fog.density = 0.0032;

    if (window.createMaldiveSkyDome) {
        const skyData = window.createMaldiveSkyDome();
        skyDome = skyData.skyMesh;
        skyMat = skyData.skyMat;
        window.skyDome = skyDome;
        window.skyMat = skyMat;
        envGroup.add(skyDome);
    }

    // Smooth & Uniform Stratified Toroidal Grass System
    // Keep detailed blade tufts near the player and use simpler clumps in the outer rings.
    if (!grassLOD0Mesh) {
        const isMob = isMobileDevice();
        const lod0Count = isMob ? 65000 : 130000;
        // Mid ring matches near ring density (10.74 inst/m²): 78,400 m² * 10.74 = ~842,000 instances
        const lod0MidCount = isMob ? 420000 : 842000;
        // Far ring matches previous mid ring density (1.72 inst/m²): 250,000 m² * 1.72 = ~430,000 instances
        const lod0FarCount = isMob ? 210000 : 430000;

        grassLOD0Mesh = createStratifiedToroidalGrass(createLOD0BladeGeometry(), lod0Count, LOD0_PATCH_SIZE, 0.0, 55.0, true);
        grassLOD0MidMesh = createStratifiedToroidalGrass(createLOD1ClumpGeometry(), lod0MidCount, LOD0_MID_PATCH_SIZE, 55.0, 140.0, false);
        grassLOD0FarMesh = createStratifiedToroidalGrass(createLOD1ClumpGeometry(), lod0FarCount, LOD0_FAR_PATCH_SIZE, 140.0, 250.0, false);
        grassLOD1Mesh = grassLOD0FarMesh; // Alias for backward compatibility
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

    setWorldSeed(currentSeed);

    if (!waterMeshRef) {
        waterMeshRef = createCoastalOceanMesh();
        envGroup.add(waterMeshRef);
        window.waterMeshRef = waterMeshRef;
    }

    // Signature majestic Nordic spruce tree framing the left foreground (matching the reference scene)
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
        trunkHeight: 13.8 * sigScale,
        type: 'spruce'
    });

    // Signature European seaside cottage down the slope overlooking the ocean
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
    worldBuildings.push({ x: cotX, z: cotZ, radius: 4.8, isRuin: false });

    // Rising smoke plumes drifting from the hillside battle outpost toward the sea
    if (sharedSmokeTex) {
        const smokeOrigins = [
            { x: -32.0, z: 125.0, count: 16, mult: 1.1 },
            { x: -14.0, z: 135.0, count: 14, mult: 0.9 }
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
                if (window.excludeFromSSAO) window.excludeFromSSAO(s);
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

    const px = (tankState && tankState.x !== undefined) ? tankState.x : 0;
    const pz = (tankState && tankState.z !== undefined) ? tankState.z : 0;

    const cam = window.activeCamera;
    const cx = (cam && cam.position && !isNaN(cam.position.x)) ? cam.position.x : px;
    const cz = (cam && cam.position && !isNaN(cam.position.z)) ? cam.position.z : pz;

    terrainUniforms.uCameraPos.value.set(cx, 0, cz);
    grassUniforms.uCameraPos.value.set(cx, 0, cz);

    if (waterMeshRef && waterMeshRef.material && waterMeshRef.material.uniforms && waterMeshRef.material.uniforms.uTime) {
        waterMeshRef.material.uniforms.uTime.value = timeSec;
    }

    // Update building positions near player for real-time grass culling
    const nearBldgs = [];
    for (let b = 0; b < worldBuildings.length; b++) {
        const bldg = worldBuildings[b];
        const dx = bldg.x - px;
        const dz = bldg.z - pz;
        if (dx * dx + dz * dz < 140 * 140) {
            nearBldgs.push(bldg);
            if (nearBldgs.length >= 16) break;
        }
    }
    const bArr = grassUniforms.uBuildings.value;
    for (let i = 0; i < 16; i++) {
        if (i < nearBldgs.length) {
            bArr[i].set(nearBldgs[i].x, nearBldgs[i].z, nearBldgs[i].radius, 1.0);
        } else {
            bArr[i].set(0, 0, 0, 0);
        }
    }
    grassUniforms.uBuildingCount.value = nearBldgs.length;

    updateTerrainChunks(px, pz);

    // Animate active fire sprites and smoke plumes
    for (let i = 0; i < activeFireSprites.length; i++) {
        const f = activeFireSprites[i];
        const s = f.baseScale * (1.0 + Math.sin(timeSec * 12.0 + f.phase) * 0.12);
        f.sprite.scale.set(s, s * 0.85, 1);
        f.light.intensity = 1.8 + Math.sin(timeSec * 14.0 + f.phase) * 0.6;
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
window.terrainMeshRef = terrainMeshRef;
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
window.getRoadCenterX = getRoadCenterX;
window.getRoadFactor = getRoadFactor;
window.initEnvironment = initEnvironment;
window.buildEnvironment = buildEnvironment;
window.updateEnvironment = updateEnvironment;
window.restartGame = restartGame;
window.setWorldSeed = setWorldSeed;
window.currentSeed = currentSeed;
