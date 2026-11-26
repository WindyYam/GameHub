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
        globalThis.SEA_LEVEL = SEA_LEVEL;
        globalThis.RIVER_LEVEL = RIVER_LEVEL;
    `, context);
    return context;
}

test('river network functions and window exports exist in environment.js', () => {
    assert.ok(envSrc.includes('float getRiverDistance_gpu(float x, float z)'), 'GPU getRiverDistance_gpu missing');
    assert.ok(envSrc.includes('float getRiverFactor_gpu(float x, float z)'), 'GPU getRiverFactor_gpu missing');
    assert.ok(envSrc.includes('float getRiversideFactor_gpu(float x, float z)'), 'GPU getRiversideFactor_gpu missing');
    assert.ok(envSrc.includes('float getRiverWaterLevel_gpu(float x, float z)'), 'GPU getRiverWaterLevel_gpu missing');
    assert.ok(envSrc.includes('float getWaterLevel_gpu(float x, float z)'), 'GPU getWaterLevel_gpu missing');
    assert.ok(envSrc.includes('float applyRiverTerrainHeight_gpu('), 'GPU applyRiverTerrainHeight_gpu missing');
    assert.ok(envSrc.includes('function getRiverDistance(x, z)'), 'CPU getRiverDistance missing');
    assert.ok(envSrc.includes('function getRiverFactor(x, z)'), 'CPU getRiverFactor missing');
    assert.ok(envSrc.includes('function getRiversideFactor(x, z)'), 'CPU getRiversideFactor missing');
    assert.ok(envSrc.includes('function getRiverWaterLevel(x, z)'), 'CPU getRiverWaterLevel missing');
    assert.ok(envSrc.includes('function getWaterLevel(x, z)'), 'CPU getWaterLevel missing');
    assert.ok(envSrc.includes('function applyRiverTerrainHeight('), 'CPU applyRiverTerrainHeight missing');
    assert.ok(envSrc.includes('window.getRiverDistance = getRiverDistance;'), 'window.getRiverDistance export missing');
    assert.ok(envSrc.includes('window.getRiverFactor = getRiverFactor;'), 'window.getRiverFactor export missing');
    assert.ok(envSrc.includes('window.getRiversideFactor = getRiversideFactor;'), 'window.getRiversideFactor export missing');
    assert.ok(envSrc.includes('window.getRiverWaterLevel = getRiverWaterLevel;'), 'window.getRiverWaterLevel export missing');
    assert.ok(envSrc.includes('window.getWaterLevel = getWaterLevel;'), 'window.getWaterLevel export missing');
    assert.ok(envSrc.includes('window.RIVER_LEVEL = RIVER_LEVEL;'), 'window.RIVER_LEVEL export missing');
    assert.ok(envSrc.includes('window.SEA_LEVEL = SEA_LEVEL;'), 'window.SEA_LEVEL export missing');
});

test('rivers are curvy, wide, have elevated riverbeds and deeper water while keeping spawn dry', () => {
    const world = createRiverWorld();
    world.setWorldSeed(246810, 'meadow');

    // 1. Spawn pad at (0, 0) remains well above water level
    const spawnH = world.getTerrainHeight(0, 0);
    assert.ok(spawnH > 4.0, `Spawn height should stay dry above sea level, got ${spawnH}`);
    assert.ok(world.getRiverDistance(0, 0) > 40.0, 'Spawn (0, 0) should be clear of river channel');

    // 2. Curviness: River 1 sweeps across > 80m lateral excursion with steep > 42 deg bends
    let minZ = Infinity, maxZ = -Infinity, maxSlope = 0;
    let prevZ = world.getRiverCenter1Z(-400);
    for (let x = -400; x <= 400; x += 5) {
        const z = world.getRiverCenter1Z(x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        if (x > -400) {
            maxSlope = Math.max(maxSlope, Math.abs((z - prevZ) / 5));
        }
        prevZ = z;
    }
    assert.ok(maxZ - minZ > 80.0, `Expected sweeping lateral meander > 80m, got ${(maxZ - minZ).toFixed(1)}m`);
    assert.ok(maxSlope > 0.9, `Expected strong bend slope |dz/dx| > 0.9, got ${maxSlope.toFixed(2)}`);

    // 3. Elevated riverbed and deep water along River 1
    for (const x of [-400, -160, 0, 160, 400]) {
        const riv1Z = world.getRiverCenter1Z(x);
        const d = world.getRiverDistance(x, riv1Z);
        assert.ok(d < 0.01, `River 1 center should have ~0 distance at x=${x}, got ${d}`);
        if (Math.hypot(x, riv1Z) > 45) {
            const wY = world.getRiverWaterLevel(x, riv1Z);
            const bedH = world.getTerrainHeight(x, riv1Z);
            const depth = wY - bedH;
            assert.ok(Math.abs(wY - 5.2) < 0.05, `Inland river water level should be ~5.2m, got ${wY}`);
            assert.ok(bedH > 0.2 && bedH < 2.0, `Inland riverbed at (${x}, ${riv1Z.toFixed(1)}) should sit near +1.0m (not sunken to -4m), got ${bedH}`);
            assert.ok(depth >= 3.5, `River 1 depth should be >= 3.5m, got ${depth.toFixed(2)}m`);
        }
    }

    // 4. Larger water width (> 30m perpendicular width)
    const cx = 120;
    const cz = world.getRiverCenter1Z(cx);
    const slope = (world.getRiverCenter1Z(cx + 0.5) - world.getRiverCenter1Z(cx - 0.5));
    const len = Math.hypot(slope, 1);
    const nx = -slope / len;
    const nz = 1 / len;
    for (const t of [-15, -10, 0, 10, 15]) {
        const px = cx + nx * t;
        const pz = cz + nz * t;
        const h = world.getTerrainHeight(px, pz);
        const wY = world.getRiverWaterLevel(px, pz);
        assert.ok(h < wY, `River cross-section at perpendicular offset ${t}m should be submerged (${h.toFixed(2)} < ${wY.toFixed(2)})`);
    }

    // 5. Gentle brim-flush riverside bank (~24m & 30m perpendicular from center) sits low and close to RIVER_LEVEL
    const bankDist = world.getRiverDistance(cx + nx * 24.0, cz + nz * 24.0);
    const bankH = world.getTerrainHeight(cx + nx * 24.0, cz + nz * 24.0);
    assert.ok(bankDist > 19.5 && bankDist < 28.0, `Expected riverside bank distance 19.5..28.0m, got ${bankDist}`);
    assert.ok(bankH > 5.2 && bankH < 6.0, `Riverside bank should sit low and flush just above RIVER_LEVEL, got ${bankH}`);
    const outerBankH = world.getTerrainHeight(cx + nx * 30.0, cz + nz * 30.0);
    assert.ok(outerBankH > 5.2 && outerBankH < 6.4, `Outer riverside floodplain should stay low and flush with water level, got ${outerBankH}`);

    // 6. Eastern & Western North-South rivers descend smoothly into the +Z coastal ocean
    for (const z of [-200, -60]) {
        const riv2X = world.getRiverCenter2X(z);
        const wY = world.getRiverWaterLevel(riv2X, z);
        const bedH = world.getTerrainHeight(riv2X, z);
        assert.ok(wY - bedH >= 3.5, `Inland Eastern river depth at z=${z} must be >= 3.5m, got ${(wY - bedH).toFixed(2)}`);
        assert.ok(bedH > 0.2, `Inland Eastern riverbed at z=${z} must sit above +0.2m, got ${bedH}`);
    }
    for (const z of [240, 320]) {
        const riv2X = world.getRiverCenter2X(z);
        const wY = world.getRiverWaterLevel(riv2X, z);
        const bedH = world.getTerrainHeight(riv2X, z);
        assert.ok(Math.abs(wY - world.SEA_LEVEL) < 0.01, `Coastal estuary water level at z=${z} must match SEA_LEVEL (${world.SEA_LEVEL}m), got ${wY}`);
        assert.ok(bedH < world.SEA_LEVEL - 3.0, `Coastal Eastern river bed at (${riv2X.toFixed(1)}, ${z}) must be submerged deeply below SEA_LEVEL (${world.SEA_LEVEL}m), got ${bedH}`);
    }
});

test('zone lakes share river water level with submerged basins, dry shores, and dry landmarks', () => {
    const world = createRiverWorld();
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

    assert.equal(world.SEA_LEVEL, 5.2, 'SEA_LEVEL should equal unified water level 5.2');
    assert.equal(world.RIVER_LEVEL, 5.2, 'RIVER_LEVEL should equal unified water level 5.2');
    assert.ok(
        mainSrc.includes('const reflPlaneY = (typeof window.SEA_LEVEL === \'number\') ? window.SEA_LEVEL : 5.2;') &&
        !mainSrc.includes('camRivDist < 220.0 && camRivY > reflPlaneY + 0.5'),
        'main.js renderWaterReflection should use unified SEA_LEVEL reflection plane for lakes, rivers, and sea'
    );

    // 1. Desert Oasis at (58, 78): deep submerged basin, dry 8-palm shore ring, dry outer desert dunes
    world.setWorldSeed(123456, 'desert');
    assert.equal(world.getWaterLevel(58, 78), 5.2);
    const oasisCenterH = world.getTerrainHeight(58, 78);
    assert.ok(oasisCenterH < 2.5, `Desert oasis center at (58, 78) should be deeply submerged (< 2.5m), got ${oasisCenterH}`);
    for (let p = 0; p < 8; p++) {
        const ang = (p / 8) * Math.PI * 2.0 + 0.25;
        const rad = 36.0 + (p % 2) * 5.0;
        const px = 58.0 + Math.cos(ang) * rad;
        const pz = 78.0 + Math.sin(ang) * rad;
        const palmH = world.getTerrainHeight(px, pz);
        assert.ok(palmH > 5.2 && palmH < 6.5, `Oasis palm #${p} at (${px.toFixed(1)}, ${pz.toFixed(1)}) should stand dry on brim shore, got ${palmH}`);
    }
    for (let gx = -160; gx <= 160; gx += 40) {
        for (let gz = -40; gz <= 120; gz += 40) {
            if (Math.hypot(gx - 58, gz - 78) < 62 || world.getRiverDistance(gx, gz) < 40) continue;
            const duneH = world.getTerrainHeight(gx, gz);
            assert.ok(duneH > 5.3, `Desert dune trough at (${gx}, ${gz}) outside oasis/river must stay dry (> 5.3m), got ${duneH}`);
        }
    }

    // 2. Alpine Mountain Glacial Tarn at (-54, 92): submerged basin and dry brim shore
    world.setWorldSeed(123456, 'mountain');
    const tarnH = world.getTerrainHeight(-54, 92);
    const tarnShoreH = world.getTerrainHeight(-54 + 42, 92);
    assert.ok(tarnH < 2.5, `Mountain glacial tarn center at (-54, 92) should be deeply submerged (< 2.5m), got ${tarnH}`);
    assert.ok(tarnShoreH > 5.2, `Mountain glacial tarn outer shore should stay dry (> 5.2m), got ${tarnShoreH}`);

    // 3. Zone landmarks stay dry above unified water level
    world.setWorldSeed(123456, 'egypt');
    assert.ok(world.getTerrainHeight(-42, 66) > 5.2, `Egypt Colonnade at (-42, 66) must stay dry, got ${world.getTerrainHeight(-42, 66)}`);
    assert.ok(world.getTerrainHeight(58, 142) > 5.2, `Egypt Pyramid at (58, 142) must stay dry, got ${world.getTerrainHeight(58, 142)}`);

    world.setWorldSeed(123456, 'greece');
    assert.ok(world.getTerrainHeight(46, 92) > 5.2, `Greece Parthenon at (46, 92) must stay dry, got ${world.getTerrainHeight(46, 92)}`);

    world.setWorldSeed(123456, 'rome');
    assert.ok(world.getTerrainHeight(-48, 66) > 5.2, `Rome Triumphal Arch at (-48, 66) must stay dry, got ${world.getTerrainHeight(-48, 66)}`);
});

test('road-river intersections create shallow cobblestone fords for crossing', () => {
    const world = createRiverWorld();
    world.setWorldSeed(123456, 'meadow');

    // Find intersection of Road 1 (x = getRoadCenterX(z)) and River 1
    let crossZ = -112.0;
    let crossX = world.getRoadCenterX(crossZ);
    for (let iter = 0; iter < 24; iter++) {
        crossZ = 0.5 * crossZ + 0.5 * world.getRiverCenter1Z(crossX);
        crossX = world.getRoadCenterX(crossZ);
    }

    const roadF = world.getRoadFactor(crossX, crossZ);
    const rivD = world.getRiverDistance(crossX, crossZ);
    assert.ok(roadF > 0.9, `Expected crossing on Road 1 centerline, got roadF=${roadF}`);
    assert.ok(rivD < 0.25, `Expected crossing on River 1 centerline, got rivD=${rivD}`);

    const wY = world.getRiverWaterLevel(crossX, crossZ);
    const fordY = world.getTerrainHeight(crossX, crossZ);
    const fordDepth = wY - fordY;
    assert.ok(fordDepth > 0.15 && fordDepth < 0.65, `Road-river crossing must form a shallow passable ford (depth 0.15..0.65m), got ${fordDepth.toFixed(2)}m`);
});

test('terrain and water shaders support elevated flowing river, cobblestones, sandbar, shingle, and grass culling', () => {
    assert.ok(envSrc.includes('vec4 evalRiverCobble_gpu('), 'Missing evalRiverCobble_gpu procedural cobblestone shader');
    assert.ok(envSrc.includes('riverCobbleMask'), 'Missing riverCobbleMask normal perturbation');
    assert.ok(envSrc.includes('dryRiverSand'), 'Missing dryRiverSand riverside sandbar texture');
    assert.ok(envSrc.includes('shingleCol'), 'Missing shingleCol pebble gravel transition');
    assert.ok(envSrc.includes('riparianMoss'), 'Missing riparianMoss riverbank moss/loam texture');
    assert.ok(envSrc.includes('riverCull'), 'Missing riverCull grass exclusion on riverbeds/cobbles');
    assert.ok(envSrc.includes('uIsRiverWater'), 'Missing uIsRiverWater water shader uniform');
    assert.ok(envSrc.includes('uReflPlaneY'), 'Missing uReflPlaneY planar reflection uniform');
});
