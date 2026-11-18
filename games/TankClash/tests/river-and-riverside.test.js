const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const envSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'environment.js'), 'utf8').replace(/\r\n/g, '\n');

function extractSection(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `Could not find section ${startMarker} -> ${endMarker}`);
    return src.slice(start, end);
}

function createRiverWorld() {
    const context = vm.createContext({
        window: {},
        document: { getElementById: () => null },
        terrainUniforms: null,
        grassUniforms: null,
        waterMeshRef: null,
        environmentMode: 'wild',
        sessionFallenTrees: new Set(),
        sessionFallenTreesMeta: new Map(),
        sessionDestroyedTargets: new Set()
    });
    vm.runInContext(`
        const ALL_ZONES = ['meadow', 'desert', 'mountain', 'hills', 'winter', 'bocage', 'monument', 'canyon', 'egypt', 'jungle', 'greece', 'rome'];
        const ZONE_CONFIGS = Object.fromEntries(ALL_ZONES.map((id, typeIndex) => [id, { id, typeIndex }]));
        var currentZone = 'meadow', currentZoneIndex = 0, currentZoneConfig = ZONE_CONFIGS.meadow;
        var spawnZoneIndex = 0, currentSeed = 0, seedOffset = { x: 0, z: 0 };
        var roadBaseX = 0, road2BaseZ = 0, road3BaseX = 0, road4BaseX = 0;
        ${extractSection(envSrc, 'function syncZoneUniformsAndHUD()', '// ============================================================================\n// 2. MATH')}
        ${extractSection(envSrc, 'function fract(x)', '// Shared GLSL snippet')}
        ${extractSection(envSrc, 'function getRoadDistance(x, z)', 'function getTerrainNormal(x, z)')}
    `, context);
    return context;
}

test('river network functions and window exports exist in environment.js', () => {
    assert.ok(envSrc.includes('float getRiverDistance_gpu(float x, float z)'), 'GPU getRiverDistance_gpu missing');
    assert.ok(envSrc.includes('float getRiverFactor_gpu(float x, float z)'), 'GPU getRiverFactor_gpu missing');
    assert.ok(envSrc.includes('float getRiversideFactor_gpu(float x, float z)'), 'GPU getRiversideFactor_gpu missing');
    assert.ok(envSrc.includes('float applyRiverTerrainHeight_gpu('), 'GPU applyRiverTerrainHeight_gpu missing');
    assert.ok(envSrc.includes('function getRiverDistance(x, z)'), 'CPU getRiverDistance missing');
    assert.ok(envSrc.includes('function getRiverFactor(x, z)'), 'CPU getRiverFactor missing');
    assert.ok(envSrc.includes('function getRiversideFactor(x, z)'), 'CPU getRiversideFactor missing');
    assert.ok(envSrc.includes('function applyRiverTerrainHeight('), 'CPU applyRiverTerrainHeight missing');
    assert.ok(envSrc.includes('window.getRiverDistance = getRiverDistance;'), 'window.getRiverDistance export missing');
    assert.ok(envSrc.includes('window.getRiverFactor = getRiverFactor;'), 'window.getRiverFactor export missing');
    assert.ok(envSrc.includes('window.getRiversideFactor = getRiversideFactor;'), 'window.getRiversideFactor export missing');
});

test('rivers span across the map, carve below sea level, and keep spawn pad dry', () => {
    const world = createRiverWorld();
    world.setWorldSeed(246810, 'meadow');

    // 1. Spawn pad at (0, 0) remains well above sea level
    const spawnH = world.getTerrainHeight(0, 0);
    assert.ok(spawnH > 4.0, `Spawn height should stay dry above sea level, got ${spawnH}`);
    assert.ok(world.getRiverDistance(0, 0) > 40.0, 'Spawn (0, 0) should be clear of river channel');

    // 2. East-West river crosses far west, mid, and far east map coordinates below SEA_LEVEL (-2.5m)
    for (const x of [-400, -160, 0, 160, 400]) {
        const riv1BaseZ = Math.sin(world.seedOffset.x * 0.0075) * 26.0 + Math.cos(world.seedOffset.x * 0.017) * 11.0 + Math.sin(world.seedOffset.x * 0.0032) * 18.0;
        const riv1Z = -64.0 + (Math.sin((x + world.seedOffset.x) * 0.0075) * 26.0 + Math.cos((x + world.seedOffset.x) * 0.017) * 11.0 + Math.sin((x + world.seedOffset.x) * 0.0032) * 18.0) - riv1BaseZ;
        const d = world.getRiverDistance(x, riv1Z);
        assert.ok(d < 0.01, `River 1 center should have ~0 distance at x=${x}, got ${d}`);
        if (Math.hypot(x, riv1Z) > 45) {
            const bedH = world.getTerrainHeight(x, riv1Z);
            assert.ok(bedH < -3.0, `River 1 bed at (${x}, ${riv1Z.toFixed(1)}) must carve below SEA_LEVEL (-2.5m), got ${bedH}`);
        }
    }

    // 3. Eastern & Western North-South rivers connect across -Z..+Z into the coastal sea
    for (const z of [-360, -140, 40, 220]) {
        const riv2BaseX = Math.sin(world.seedOffset.z * 0.0070) * 28.0 + Math.cos(world.seedOffset.z * 0.016) * 12.0 + Math.sin(world.seedOffset.z * 0.0028) * 18.0;
        const riv2X = 128.0 + (Math.sin((z + world.seedOffset.z) * 0.0070) * 28.0 + Math.cos((z + world.seedOffset.z) * 0.016) * 12.0 + Math.sin((z + world.seedOffset.z) * 0.0028) * 18.0) - riv2BaseX;
        const bedH = world.getTerrainHeight(riv2X, z);
        assert.ok(bedH < -3.0, `Eastern river bed at (${riv2X.toFixed(1)}, ${z}) must be submerged below -2.5m, got ${bedH}`);
    }

    // 4. Riverside bank terrace (~10-12m from river center) sits gently above water level (-2.5m..-1.0m)
    const bankDist = world.getRiverDistance(0, -64.0 + 12.0);
    const bankH = world.getTerrainHeight(0, -64.0 + 12.0);
    assert.ok(bankDist > 8.0 && bankDist < 15.0, `Expected riverside bank distance 8..15m, got ${bankDist}`);
    assert.ok(bankH > -2.5 && bankH < 2.0, `Riverside bank should form a gentle terrace near waterline, got ${bankH}`);
});

test('road-river intersections create shallow cobblestone fords for crossing', () => {
    const world = createRiverWorld();
    world.setWorldSeed(123456, 'meadow');

    // Find intersection of Road 1 (x = getRoadCenterX(z)) and River 1 (z ~ -64)
    let crossZ = -64.0;
    let crossX = world.getRoadCenterX(crossZ);
    for (let iter = 0; iter < 12; iter++) {
        const riv1BaseZ = Math.sin(world.seedOffset.x * 0.0075) * 26.0 + Math.cos(world.seedOffset.x * 0.017) * 11.0 + Math.sin(world.seedOffset.x * 0.0032) * 18.0;
        crossZ = -64.0 + (Math.sin((crossX + world.seedOffset.x) * 0.0075) * 26.0 + Math.cos((crossX + world.seedOffset.x) * 0.017) * 11.0 + Math.sin((crossX + world.seedOffset.x) * 0.0032) * 18.0) - riv1BaseZ;
        crossX = world.getRoadCenterX(crossZ);
    }

    const roadF = world.getRoadFactor(crossX, crossZ);
    const rivD = world.getRiverDistance(crossX, crossZ);
    assert.ok(roadF > 0.9, `Expected crossing on Road 1 centerline, got roadF=${roadF}`);
    assert.ok(rivD < 0.2, `Expected crossing on River 1 centerline, got rivD=${rivD}`);

    const fordY = world.getTerrainHeight(crossX, crossZ);
    assert.ok(fordY > -2.65 && fordY < -1.9, `Road-river crossing must form a shallow passable ford (~ -2.4m), got ${fordY}`);
});

test('terrain shader includes riverside cobblestone, sandbar, shingle, and wet bank textures & normals', () => {
    assert.ok(envSrc.includes('vec4 evalRiverCobble_gpu('), 'Missing evalRiverCobble_gpu procedural cobblestone shader');
    assert.ok(envSrc.includes('riverCobbleMask'), 'Missing riverCobbleMask normal perturbation');
    assert.ok(envSrc.includes('dryRiverSand'), 'Missing dryRiverSand riverside sandbar texture');
    assert.ok(envSrc.includes('shingleCol'), 'Missing shingleCol pebble gravel transition');
    assert.ok(envSrc.includes('riparianMoss'), 'Missing riparianMoss riverbank moss/loam texture');
    assert.ok(envSrc.includes('riverCull'), 'Missing riverCull grass exclusion on riverbeds/cobbles');
});
