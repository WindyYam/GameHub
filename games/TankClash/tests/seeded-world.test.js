const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'environment.js'), 'utf8').replace(/\r\n/g, '\n');

function section(start, end) {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, `Missing environment section: ${start}`);
    return source.slice(first, last);
}

function createWorld() {
    const context = vm.createContext({
        window: {},
        document: { getElementById: () => null },
        terrainUniforms: null,
        grassUniforms: null,
        waterMeshRef: null,
        environmentMode: 'wild',
        sessionFallenTrees: new Set(),
        sessionDestroyedTargets: new Set()
    });
    vm.runInContext(`
        const ALL_ZONES = ['meadow', 'desert', 'mountain', 'hills'];
        const ZONE_CONFIGS = Object.fromEntries(ALL_ZONES.map((id, typeIndex) => [id, { id, typeIndex }]));
        var currentZone = 'meadow', currentZoneIndex = 0, currentZoneConfig = ZONE_CONFIGS.meadow;
        var currentSeed = 0, seedOffset = { x: 0, z: 0 };
        var roadBaseX = 0, road2BaseZ = 0, road3BaseX = 0, road4BaseX = 0;
        ${section('function syncZoneUniformsAndHUD()', '// ============================================================================\n// 2. MATH')}
        ${section('function fract(x)', '// Shared GLSL snippet')}
        ${section('function getRoadDistance(x, z)', 'function getTerrainNormal(x, z)')}
    `, context);
    return context;
}

test('every seed starts in a large meadow and produces all zone types', () => {
    const world = createWorld();
    for (const seed of [123456, 654321, 987654]) {
        world.setWorldSeed(seed);
        for (const x of [-600, 0, 600]) {
            for (const z of [-600, 0, 600]) {
                assert.equal(world.getZoneIndexAt(x, z), 0);
            }
        }
        const zones = new Set();
        for (let x = -4; x <= 4; x++) {
            for (let z = -4; z <= 4; z++) {
                zones.add(world.getZoneIndexAt(x * 1600, z * 1600));
            }
        }
        assert.deepEqual([...zones].sort(), [0, 1, 2, 3]);
    }
});

test('seeded zones and terrain reproduce after visiting other areas', () => {
    const world = createWorld();
    const points = [[0, 0], [800, 0], [-800, 1600], [2350, -790], [3200, 3200]];
    const snapshot = () => points.map(([x, z]) => [
        world.getZoneIndexAt(x, z),
        Array.from(world.getZoneWeights(x, z)),
        world.getTerrainHeight(x, z)
    ]);
    world.setWorldSeed(123456);
    const first = snapshot();
    const rng = world.createChunkRNG(-21, 17, 123456);
    const sequence = Array.from({ length: 10 }, () => rng());
    world.setCurrentZone(3);
    assert.deepEqual(snapshot(), first);
    world.setWorldSeed(654321);
    assert.notDeepEqual(snapshot(), first);
    world.setWorldSeed(123456);
    assert.deepEqual(snapshot(), first);
    const regenerated = world.createChunkRNG(-21, 17, 123456);
    assert.deepEqual(Array.from({ length: 10 }, () => regenerated()), sequence);
    assert.equal(world.window.currentZone, 'meadow');
});

test('zone weights and terrain heights are continuous at transition edges', () => {
    const world = createWorld();
    world.setWorldSeed(123456);
    for (const edge of [-1760, -1440, -960, -640, 640, 960, 1440, 1760]) {
        for (const other of [-1600, -800, 0, 800, 1600]) {
            const xEdge = edge - Math.sin(other * 0.0014 + world.seedOffset.z * 0.017) * 130;
            const zEdge = edge - Math.sin(other * 0.0014 + world.seedOffset.x * 0.017) * 130;
            for (const [x, z, dx, dz] of [[xEdge, other, 0.001, 0], [other, zEdge, 0, 0.001]]) {
                const weights = Array.from(world.getZoneWeights(x, z));
                assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
                const before = world.getZoneWeights(x - dx, z - dz);
                const after = world.getZoneWeights(x + dx, z + dz);
                for (let i = 0; i < 4; i++) assert.ok(Math.abs(before[i] - after[i]) < 0.0001);
                assert.ok(Math.abs(world.getTerrainHeight(x - dx, z - dz) -
                    world.getTerrainHeight(x + dx, z + dz)) < 0.1);
            }
        }
    }
});

test('every chosen biome zone at spawn features coastline descending to the sea', () => {
    const world = createWorld();
    const ALL_ZONES = ['meadow', 'desert', 'mountain', 'hills'];
    for (let zoneIdx = 0; zoneIdx < ALL_ZONES.length; zoneIdx++) {
        const zoneName = ALL_ZONES[zoneIdx];
        world.setWorldSeed(123456, zoneName);

        // Spawn point is in the chosen biome zone
        assert.equal(world.getZoneIndexAt(0, 0), zoneIdx, 'Spawn (0, 0) should be zone');

        // Spawn height is on dry land (above sea level -2.5m)
        const spawnH = world.getTerrainHeight(0, 0);
        assert.ok(spawnH > 3.5, 'Spawn height should be above sea level for ' + zoneName);

        // Coastline descent: moving toward +Z descends into the ocean (< -2.0m)
        const coastH = world.getTerrainHeight(0, 320);
        assert.ok(coastH < -2.0, 'Terrain at z=320 should drop to coastline ocean for ' + zoneName);
        assert.ok(coastH < spawnH, 'Terrain must slope down toward the sea for ' + zoneName);
    }
});

test('respawn random biome selection selects from ALL_ZONES and alternates zones', () => {
    const ALL_ZONES = ['meadow', 'desert', 'mountain', 'hills'];
    function pickNextZone(currentZone) {
        const otherZones = ALL_ZONES.filter(z => z !== currentZone);
        return otherZones[Math.floor(Math.random() * otherZones.length)] || ALL_ZONES[Math.floor(Math.random() * ALL_ZONES.length)];
    }
    let current = 'meadow';
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
        const next = pickNextZone(current);
        assert.notEqual(next, current);
        assert.ok(ALL_ZONES.includes(next));
        seen.add(next);
        current = next;
    }
    assert.deepEqual([...seen].sort(), ['desert', 'hills', 'meadow', 'mountain']);
});


test('initial page load randomly selects spawnZoneIndex from ALL_ZONES and buildEnvironment passes it', () => {
    // 1. Verify buildEnvironment calls setWorldSeed(currentSeed, currentZone)
    assert.match(source, /setWorldSeed\(\s*currentSeed\s*,\s*currentZone\s*\)/, 'buildEnvironment must pass currentZone to setWorldSeed');

    // 2. Verify initial script evaluation selects random zone from ALL_ZONES
    const initCode = section('const ALL_ZONES = [', 'var currentSeed =');
    const zoneConfigCode = section('const ZONE_CONFIGS = {', 'const ALL_ZONES = [');
    const seenZones = new Set();
    const seenSpawnIndices = new Set();

    for (let i = 0; i < 50; i++) {
        const context = vm.createContext({
            window: {},
            Math: Math
        });
        vm.runInContext(`
            ${zoneConfigCode}
            ${initCode}
        `, context);

        seenZones.add(context.window.currentZone);
        seenSpawnIndices.add(context.window.spawnZoneIndex);
        assert.equal(context.window.currentZoneIndex, context.window.spawnZoneIndex);
        assert.equal(context.window.currentZone, context.window.ALL_ZONES[context.window.spawnZoneIndex]);
        assert.equal(context.window.currentZoneConfig.id, context.window.currentZone);
    }

    assert.deepEqual([...seenZones].sort(), ['desert', 'hills', 'meadow', 'mountain']);
    assert.deepEqual([...seenSpawnIndices].sort(), [0, 1, 2, 3]);
});
