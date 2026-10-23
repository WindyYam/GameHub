// ============================================================================
// 1. GLOBAL STATE & CONFIGURATION
// ============================================================================
const IS_MOBILE = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 840 && ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)))
);

const CONFIG = {
    isMobile: IS_MOBILE,
    maxPixelRatio: IS_MOBILE ? 1.5 : 2.0,
    terrainSegments: IS_MOBILE ? 128 : 200,
    oceanSegments: IS_MOBILE ? 128 : 240,
    totalTrees: IS_MOBILE ? 70 : 135,
    totalBushes: IS_MOBILE ? 90 : 210,
    treeFronds: IS_MOBILE ? 16 : 22,
    bushFronds: IS_MOBILE ? 9 : 13,
    coralCount: IS_MOBILE ? 120 : 240,
    skyRaymarchSteps: IS_MOBILE ? 16 : 32,
    oceanReflectionSteps: IS_MOBILE ? 4 : 12,
    shadowMapSize: IS_MOBILE ? 1024 : 2048,
    shadowType: THREE.PCFSoftShadowMap
};

const CUMULUS_SEED = Math.random() * 1000;
const STATE = {
    timeOfDay: 13.5,        // 0.0 to 24.0 hours
    autoCycle: true,
    cycleSpeed: 0.6,        // Hours per real second when auto-cycling
    waveScale: 1.15,
    cloudCoverage: 0.1,     // Controls high-altitude texture cloud deck
    cumulusCoverage: 0.75,  // Controls isolated 3D volumetric giant cumulus mountains
    elapsedTime: 0,
    sunDirection: new THREE.Vector3(0, 1, 0),
    moonDirection: new THREE.Vector3(0, -1, 0),
    sunColor: new THREE.Color(0xffffff),
    skyTopColor: new THREE.Color(0x0284c7),
    skyHorizonColor: new THREE.Color(0x7dd3fc),
    cameraAnimating: false,
    cameraTargetPos: new THREE.Vector3(),
    cameraTargetLook: new THREE.Vector3()
};

// Campfire and Tribal Cabin coordinates on the beach
const CAMPFIRE_POS = { x: 52.0, z: 22.0 };
const CABIN_SITE = { x: 40.5, z: 10.5, rotY: 0.74, scale: 1.85 };

let scene, camera, renderer, controls, clock;
let skyMat, skyMesh, cumulusMat, cumulusMesh, oceanMat, oceanMesh, sandMat;
let sunLight, moonLight, hemiLight;
let frondMaterials = [];
let trunkMaterials = [];
let treeLocations = [];
let bushLocations = [];
let marineLifeAgents = [];
let seagullAgents = [];
let dynamicLights = [];
let flameMeshes = [];
let fireSparks = [];
let fireRenderItems = [];
let smokePuffs = [];
let windChimeGroups = [];
let bbqSpitRod = null;
let batchableMeshes = []; // static meshes collected during the build, merged into instanced batches at startup
const smokeCameraPosition = new THREE.Vector3();
const smokeWorldPosition = new THREE.Vector3();
const cumulusForward = new THREE.Vector3();
const CELESTIAL_LIGHT_DISTANCE = 10000;
let MAX_PIXEL_RATIO = CONFIG.maxPixelRatio;

// ============================================================================
// 2. DETERMINISTIC NOISE & TERRAIN HEIGHT FUNCTION (JS + GLSL MATCHED)
// ============================================================================
function fract(x) { return x - Math.floor(x); }
function mix(a, b, t) { return a * (1.0 - t) + b * t; }
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
}

function hash2D(x, y) {
    let px = fract(x * 0.1031);
    let py = fract(y * 0.1030);
    let pz = fract(x * 0.0973);
    const dot = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
    px += dot; py += dot; pz += dot;
    return fract((px + py) * pz);
}

function valueNoise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    const a = hash2D(ix, iy);
    const b = hash2D(ix + 1, iy);
    const c = hash2D(ix, iy + 1);
    const d = hash2D(ix + 1, iy + 1);
    return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

function fbm2D(x, y) {
    let v = 0.0;
    let a = 0.5;
    for (let i = 0; i < 4; i++) {
        v += a * valueNoise2D(x, y);
        x = x * 2.02 + 17.1;
        y = y * 2.02 + 13.7;
        a *= 0.5;
    }
    return v;
}

/**
 * Returns the exact island seabed/terrain height at world (x, z).
 * Matches the analytical bathymetry inside the Ocean GLSL shader so
 * shallow turquoise lagoon water, sandbars, and shoreline foam hug the beach accurately.
 */
function getIslandHeight(x, z) {
    // Much larger Maldives island crescent + sweeping sandbar spit + expansive coral lagoon shelf
    const angle = Math.atan2(z, x);
    const rMain = Math.sqrt(x * x + z * z);

    // Organic coastline modulation scaled for the much larger island footprint
    const coastWave = Math.sin(angle * 3.0 + 0.8) * 16.5 + Math.cos(angle * 2.0 - 0.5) * 22.0 + Math.sin(angle * 5.0) * 6.2;
    const effectiveR = rMain + coastWave;

    // Secondary sandbar spit lobe extending far out into the turquoise lagoon
    const dxSpit = x - 138.0;
    const dzSpit = z - 44.0;
    const rSpit = Math.sqrt(dxSpit * dxSpit * 0.42 + dzSpit * dzSpit * 1.32);

    // Western coral cove lobe for added island landmass & bay complexity
    const dxCove = x + 92.0;
    const dzCove = z - 52.0;
    const rCove = Math.sqrt(dxCove * dxCove * 0.85 + dzCove * dzCove * 0.75);

    // Broad shallow coral lagoon platform (~370m radius) before the outer reef drop-off
    const mainMound = 9.35 * Math.exp(-(effectiveR * effectiveR) / (112.0 * 112.0));
    const spitMound = 4.65 * Math.exp(-(rSpit * rSpit) / (82.0 * 82.0));
    const coveMound = 4.25 * Math.exp(-(rCove * rCove) / (68.0 * 68.0));
    const lagoonAtollPlatform = 7.45 * Math.exp(-Math.pow(rMain / 370.0, 2.6));

    // Natural topological dunes & submerged coral bommie undulations
    const duneDetail = (fbm2D(x * 0.018, z * 0.018) - 0.5) * 1.65 * Math.exp(-(rMain * rMain) / (195.0 * 195.0));
    const reefDetail = (fbm2D(x * 0.014 + 11.3, z * 0.014 - 7.9) - 0.5) * 1.25 * (1.0 - Math.exp(-(rMain * rMain) / (110.0 * 110.0)));

    let h = -9.2 + mainMound + spitMound + coveMound + lagoonAtollPlatform + duneDetail + reefDetail;

    // Gently flatten the central island crest for natural tropical atoll profile
    if (h > 1.95) {
        h = 1.95 + (h - 1.95) * 0.36;
    }
    return h;
}


// Bakes the current world matrices of static meshes into THREE.InstancedMesh batches,
// one draw call per geometry + material + shadow flags. Frustum culling is disabled
// because r128 bounds only cover a single instance.
function batchStaticMeshes(meshes) {
    if (!meshes.length) return;
    scene.updateMatrixWorld(true);

    const buckets = new Map();
    meshes.forEach((mesh) => {
        const key = [mesh.geometry.uuid, mesh.material.uuid, mesh.castShadow, mesh.receiveShadow].join('|');
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(mesh);
    });

    buckets.forEach((items) => {
        const ref = items[0];
        const batch = new THREE.InstancedMesh(ref.geometry, ref.material, items.length);
        batch.castShadow = ref.castShadow;
        batch.receiveShadow = ref.receiveShadow;
        batch.frustumCulled = false;
        items.forEach((mesh, idx) => {
            batch.setMatrixAt(idx, mesh.matrixWorld);
            if (mesh.parent) mesh.parent.remove(mesh);
        });
        batch.instanceMatrix.needsUpdate = true;
        scene.add(batch);
    });
}

// Merges geometries, each with its own transform, into one non-indexed BufferGeometry
function mergeGeometryParts(parts) {
    const geos = parts.map((part) => {
        const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        g.applyMatrix4(part.matrix);
        return g;
    });
    const total = geos.reduce((sum, g) => sum + g.attributes.position.count, 0);
    const merged = new THREE.BufferGeometry();
    ['position', 'normal', 'color'].forEach((name) => {
        if (!geos[0].attributes[name]) return;
        const itemSize = geos[0].attributes[name].itemSize;
        const data = new Float32Array(total * itemSize);
        let offset = 0;
        geos.forEach((g) => {
            const arr = g.attributes[name].array;
            data.set(arr, offset);
            offset += arr.length;
        });
        merged.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
    });
    return merged;
}
