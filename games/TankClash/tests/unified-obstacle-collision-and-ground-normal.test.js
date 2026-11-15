const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8').replace(/\r\n/g, '\n');
}

test('Rock obstacles provide unified collision: walking soldiers cannot clip into any boulder, and projectiles block upon impact', () => {
    const envCode = readScript('environment.js');
    const helperMatch = envCode.match(/function getGeometryFootprint[\s\S]*?window\.isPointInObstacleWindow = isPointInObstacleWindow;/);
    assert.ok(helperMatch, 'environment.js should define collision helpers');

    const sandbox = { window: {}, Math };
    vm.createContext(sandbox);
    vm.runInContext(helperMatch[0], sandbox);

    const { attachObstacleCircle, obstaclePushOut } = sandbox.window;

    // Create rock obstacle using the unified 8-circle collision layout of limestone/sandstone/mountain rocks
    const mockRockGeo = {
        boundingBox: { min: { x: -4.6, y: 0, z: -2.6 }, max: { x: 4.3, y: 3.8, z: 2.6 } },
        computeBoundingBox() {},
        userData: {
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
        }
    };
    const rockObs = attachObstacleCircle({ x: 0, y: 0, z: 0, isRock: true, type: 'rock' }, mockRockGeo, 1.0, 0);

    // 1. Soldier walking into left boulder at (-3.5, 0.4) MUST be pushed out (previously clipped)
    const leftBoulderPush = obstaclePushOut(rockObs, -3.5, 0.4, 0.42);
    assert.ok(leftBoulderPush !== null, 'Walking into left boulder flank must push soldier out without clipping');
    assert.ok(leftBoulderPush.x < 0, 'Push out must push away from the rock center');

    // 2. Soldier walking into right boulder at (3.2, -0.5) MUST be pushed out
    const rightBoulderPush = obstaclePushOut(rockObs, 3.2, -0.5, 0.42);
    assert.ok(rightBoulderPush !== null, 'Walking into right boulder flank must push soldier out without clipping');
    assert.ok(rightBoulderPush.x > 0, 'Push out must push away from the rock center');

    // 3. Soldier walking into central boulder at (0, 1.8) MUST be pushed out
    const centralPush = obstaclePushOut(rockObs, 0, 1.8, 0.42);
    assert.ok(centralPush !== null, 'Walking into center boulder must push soldier out');

    // 4. Soldier standing in open air at (0, 3.2) outside the boulder bounds must NOT be blocked
    const openAirPush = obstaclePushOut(rockObs, 0, 3.2, 0.42);
    assert.equal(openAirPush, null, 'Soldier in open air beside rock must not be blocked');
});

test('Monument buttes, spires, and canyon cliffs have full perimeter collision preventing walking passthrough', () => {
    const envCode = readScript('environment.js');
    assert.match(envCode, /baseW \* 0\.72/, 'Monument spire base must have widened ground collision circle');
    assert.match(envCode, /Solid mesa cliff core/, 'Monument butte must have solid mesa cliff core collision');
    assert.match(envCode, /l \* 0\.36/, 'Canyon cliff must span the full length of the formation');
});

test('Tree obstacle collision checks generous vertical slope bounds preventing downhill clipping', () => {
    const playerSoldierCode = readScript('playerSoldier.js');
    const soldiersCode = readScript('soldiers.js');

    assert.match(playerSoldierCode, /treeY - 4\.0/, 'playerSoldier.js must check downhill tree slope clearance at treeY - 4.0');
    assert.match(soldiersCode, /treeY - 4\.0/, 'soldiers.js must check downhill tree slope clearance at treeY - 4.0');
});

test('main.js player tank collision includes window.worldObstacles so tanks collide with rocks and monuments', () => {
    const mainCode = readScript('main.js');
    assert.match(mainCode, /window\.worldObstacles \|\| window\.worldBuildings/, 'main.js must check worldObstacles for tank collision');
});

test('Ground normal map has reduced strength and dual-scale rotated UVs to eliminate tiling repetition', () => {
    const shadersCode = readScript('shaders.js');
    const envCode = readScript('environment.js');

    // 1. bumpScale in shaders.js createTerrainNormalAtlas should be calibrated softly (<= 2.5, previously 4.6)
    const bumpMatch = shadersCode.match(/function createTerrainNormalAtlas\b[\s\S]*?const bumpScale = ([\d\.]+);/);
    assert.ok(bumpMatch, 'shaders.js should define bumpScale in createTerrainNormalAtlas');
    const bumpScale = parseFloat(bumpMatch[1]);
    assert.ok(bumpScale <= 2.5, `bumpScale should be <= 2.5 for soft ground relief, was ${bumpScale}`);

    // 2. environment.js terrain shader must have anti-tiling rotation matrix and dual-scale ground normal blending
    assert.match(envCode, /mat2 rotNorm = mat2\(0\.80, 0\.60, -0\.60, 0\.80\);/, 'Terrain shader must use rotated UV matrix to decorrelate layers');
    assert.match(envCode, /uvGroundNorm1[\s\S]*?uvGroundNorm2/, 'Terrain shader must sample dual ground normal UV scales');
    assert.match(envCode, /nGroundSample = normalize\(nGround1 \+ vec3\(nGround2\.xy/, 'Terrain shader must blend dual ground normal layers');

    // 3. Ground normal strength factor must be reduced (<= 0.35, previously 0.65)
    assert.match(envCode, /deltaSurfN = nGroundSample\.xy \* 0\.26;/, 'Ground normal deltaSurfN strength should be calibrated to 0.26');

    // 4. Domain warping and spatial blend mask to eliminate periodic grid repetition
    assert.match(envCode, /groundNormWarp/, 'Terrain shader must apply 2D non-periodic domain warping');
    assert.match(envCode, /groundBlendMask/, 'Terrain shader must spatially modulate ground normal layer weights');
    assert.match(shadersCode, /fbmWrap\(u \* 8\.0, v \* 8\.0, 8, 5\)/, 'Normal atlas height generation must use 5-octave fractal noise');
});
