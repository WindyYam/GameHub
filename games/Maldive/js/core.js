// ============================================================================
// 1. GLOBAL STATE & CONFIGURATION
// ============================================================================
const DETECTED_MOBILE = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 840 && ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)))
);

const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
let savedMobile = null;
try {
    savedMobile = typeof localStorage !== 'undefined' ? localStorage.getItem('isMobile') : null;
} catch (e) {}

let IS_MOBILE = urlParams && urlParams.has('mobile')
    ? (urlParams.get('mobile') === '1' || urlParams.get('mobile') === 'true')
    : (savedMobile !== null ? (savedMobile === 'true') : DETECTED_MOBILE);

const CONFIG = {
    isMobile: IS_MOBILE,
    maxPixelRatio: IS_MOBILE ? 1.0 : Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 1.5),
    terrainSegments: IS_MOBILE ? 100 : 160,
    oceanSegments: IS_MOBILE ? 100 : 160,
    totalTrees: IS_MOBILE ? 70 : 130,
    totalBushes: IS_MOBILE ? 90 : 180,
    treeFronds: IS_MOBILE ? 14 : 18,
    bushFronds: IS_MOBILE ? 8 : 10,
    coralCount: 0,
    skyRaymarchSteps: IS_MOBILE ? 16 : 28,
    cumulusRaymarchSteps: IS_MOBILE ? 20 : 32,
    oceanReflectionSteps: IS_MOBILE ? 3 : 6,
    shadowMapSize: IS_MOBILE ? 1024 : 1536,
    shadowType: THREE.PCFSoftShadowMap
};

const DISTANT_ISLAND_CENTER = Object.freeze({ x: -260.0, z: -1020.0 });
const SEABED_ISLAND_CENTERS = Object.freeze([
    Object.freeze({ x: -650.0, z: -1350.0 }),
    Object.freeze({ x: -1120.0, z: -1570.0 })
]);
const SEABED_PATH_POINTS = Object.freeze([
    Object.freeze({ x: 0.0, z: -100.0 }),
    Object.freeze({ x: -110.0, z: -190.0 }),
    Object.freeze({ x: -250.0, z: -300.0 }),
    Object.freeze({ x: -420.0, z: -430.0 }),
    Object.freeze({ x: -590.0, z: -570.0 }),
    Object.freeze({ x: -720.0, z: -720.0 }),
    Object.freeze({ x: -760.0, z: -850.0 }),
    Object.freeze({ x: -690.0, z: -950.0 }),
    Object.freeze({ x: -520.0, z: -1000.0 }),
    Object.freeze({ x: -260.0, z: -1020.0 }),
    Object.freeze({ x: -380.0, z: -1060.0 }),
    Object.freeze({ x: -530.0, z: -1130.0 }),
    Object.freeze({ x: -670.0, z: -1220.0 }),
    Object.freeze({ x: -760.0, z: -1310.0 }),
    Object.freeze({ x: -650.0, z: -1350.0 }),
    Object.freeze({ x: -800.0, z: -1410.0 }),
    Object.freeze({ x: -930.0, z: -1470.0 }),
    Object.freeze({ x: -1120.0, z: -1570.0 })
]);

const CUMULUS_SEED = Math.random() * 1000;
const STATE = {
    timeOfDay: 13.5,        // 0.0 to 24.0 hours
    autoCycle: true,
    cycleSpeed: 0.1,        // Hours per real second when auto-cycling
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
let depthRenderTarget = null;
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
    // 1. Original Island Size & Crescent Layout (centered around (0,0))
    const angle = Math.atan2(z, x);
    const rMain = Math.sqrt(x * x + z * z);

    // Organic coastline modulation scaled for the island footprint
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

    // 2. Distant Island, moved twice as far from the main atoll.
    const dxDist = x - DISTANT_ISLAND_CENTER.x;
    const dzDist = z - DISTANT_ISLAND_CENTER.z;
    const rotDistX = dxDist * 0.92 - dzDist * 0.38;
    const rotDistZ = dxDist * 0.38 + dzDist * 0.92;
    const rDistLand = Math.sqrt((rotDistX * 0.72) * (rotDistX * 0.72) + (rotDistZ * 1.45) * (rotDistZ * 1.45));
    const distIslandMound = 11.2 * Math.exp(-(rDistLand * rDistLand) / (46.0 * 46.0));
    const rDistLagoon = Math.sqrt((rotDistX * 0.58) * (rotDistX * 0.58) + (rotDistZ * 1.05) * (rotDistZ * 1.05));
    const distLagoonShelf = 7.8 * Math.exp(-Math.pow(rDistLagoon / 125.0, 3.0));

    // Two further submerged shoals continue the same island chain without reaching the surface.
    let seabedIslandMounds = 0.0;
    for (const center of SEABED_ISLAND_CENTERS) {
        const dx = x - center.x;
        const dz = z - center.z;
        const rotX = dx * 0.92 - dz * 0.38;
        const rotZ = dx * 0.38 + dz * 0.92;
        const rLand = Math.sqrt((rotX * 0.72) * (rotX * 0.72) + (rotZ * 1.45) * (rotZ * 1.45));
        const rShelf = Math.sqrt((rotX * 0.58) * (rotX * 0.58) + (rotZ * 1.05) * (rotZ * 1.05));
        seabedIslandMounds += 5.4 * Math.exp(-(rLand * rLand) / (62.0 * 62.0))
            + 2.5 * Math.exp(-Math.pow(rShelf / 145.0, 3.0));
    }

    let h = -9.2 + mainMound + spitMound + coveMound + lagoonAtollPlatform + duneDetail + reefDetail
        + distIslandMound + distLagoonShelf + seabedIslandMounds;

    // Gently raise the full overwater-villa lagoon shelf to keep its pilings in shallow water.
    const residentialDx = x + 96.0;
    const residentialDz = z + 214.0;
    const residentialAlong = residentialDx * -0.39 + residentialDz * -0.92;
    const residentialAcross = residentialDx * 0.92 + residentialDz * -0.39;
    const residentialRadius = Math.sqrt(
        Math.pow(residentialAlong / 155.0, 2.0) + Math.pow(residentialAcross / 75.0, 2.0)
    );
    const residentialShelf = 1.0 - smoothstep(0.72, 1.0, residentialRadius);
    const residentialBedTarget = mix(-2.2, -1.1, smoothstep(-10.0, 50.0, residentialAlong));
    h = Math.max(h, mix(h, residentialBedTarget, residentialShelf));

    // Overlapping, gently varied ridge segments follow the broad arc between atolls.
    for (let i = 0; i < SEABED_PATH_POINTS.length - 1; i++) {
        const start = SEABED_PATH_POINTS[i];
        const end = SEABED_PATH_POINTS[i + 1];
        const axisX = end.x - start.x;
        const axisZ = end.z - start.z;
        const t = Math.max(0.0, Math.min(1.0, ((x - start.x) * axisX + (z - start.z) * axisZ)
            / (axisX * axisX + axisZ * axisZ)));
        const dx = x - (start.x + t * axisX);
        const dz = z - (start.z + t * axisZ);
        const ridgeWidth = 120.0 + 35.0 * Math.sin(x * 0.007 + z * 0.004)
            + 24.0 * Math.sin(z * 0.013 - x * 0.009);
        const ridgeEdgeWobble = 20.0 * Math.sin(x * 0.012 + z * 0.008)
            + 12.0 * Math.sin(z * 0.014 - x * 0.009);
        const ridgeDistance = Math.max(0.0, Math.sqrt(dx * dx + dz * dz) + ridgeEdgeWobble);
        const ridgeMask = 1.0 - smoothstep(ridgeWidth * 0.22, ridgeWidth * 1.85, ridgeDistance);
        const ridgeBedTarget = -4.4 + 0.45 * Math.sin(x * 0.008 + Math.sin(z * 0.006) * 1.5)
            + 0.2 * Math.sin(z * 0.015 - x * 0.01);
        h = Math.max(h, mix(h, ridgeBedTarget, ridgeMask));
    }

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


function mergeStaticMeshesInGroup(group, target = scene) {
    if (!group) return;
    group.updateMatrixWorld(true);
    const isAnimated = (obj) => {
        if (typeof bbqSpitRod !== 'undefined' && obj === bbqSpitRod) return true;
        if (typeof windChimeGroups !== 'undefined') {
            for (let i = 0; i < windChimeGroups.length; i++) {
                if (windChimeGroups[i].group === obj || windChimeGroups[i].group.getObjectById(obj.id)) return true;
            }
        }
        if (typeof flameMeshes !== 'undefined') {
            for (let i = 0; i < flameMeshes.length; i++) {
                if (flameMeshes[i].mesh === obj) return true;
            }
        }
        if (typeof fireSparks !== 'undefined') {
            for (let i = 0; i < fireSparks.length; i++) {
                if (fireSparks[i].mesh === obj) return true;
            }
        }
        if (typeof smokePuffs !== 'undefined') {
            for (let i = 0; i < smokePuffs.length; i++) {
                if (smokePuffs[i].mesh === obj) return true;
            }
        }
        return false;
    };

    const buckets = new Map();
    const toRemove = [];

    group.traverse((child) => {
        if (child.isMesh && !child.isInstancedMesh && child.geometry && child.material && !isAnimated(child)) {
            if (child.material.isShaderMaterial && child.material.uniforms && child.material.uniforms.uTime) return;
            const mat = child.material;
            const key = mat.uuid + '|' + (child.castShadow ? '1' : '0') + '|' + (child.receiveShadow ? '1' : '0');
            if (!buckets.has(key)) {
                buckets.set(key, {
                    material: mat,
                    castShadow: child.castShadow,
                    receiveShadow: child.receiveShadow,
                    parts: []
                });
            }
            if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
            buckets.get(key).parts.push({
                geometry: child.geometry,
                matrix: child.matrixWorld
            });
            toRemove.push(child);
        }
    });

    toRemove.forEach((mesh) => {
        if (mesh.parent) mesh.parent.remove(mesh);
    });

    buckets.forEach(({ material, castShadow, receiveShadow, parts }) => {
        if (parts.length > 0) {
            const merged = mergeGeometryParts(parts);
            if (merged) {
                const m = new THREE.Mesh(merged, material);
                m.castShadow = castShadow;
                m.receiveShadow = receiveShadow;
                target.add(m);
            }
        }
    });
}
