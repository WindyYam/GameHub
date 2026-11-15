const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

function readScript(file) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
}

test('getPlayerRespawnPosition calculates a spawn location near death position and faces the battle', () => {
    const envSrc = readScript('environment.js');
    const startIdx = envSrc.indexOf('function getPlayerRespawnPosition()');
    const endIdx = envSrc.indexOf('window.getPlayerRespawnPosition = getPlayerRespawnPosition;', startIdx);
    assert.ok(startIdx !== -1 && endIdx !== -1, 'getPlayerRespawnPosition must exist in environment.js');

    const context = {
        window: {
            lastPlayerDeathPosition: { x: 120, y: 5, z: -80, heading: 0 },
            worldObstacles: [],
            activeEnemyTanks: []
        },
        getTerrainHeight: (x, z) => 3.5,
        Math
    };
    vm.createContext(context);
    vm.runInContext(envSrc.slice(startIdx, endIdx) + '\nthis.getPlayerRespawnPosition = getPlayerRespawnPosition;', context);

    const pos = context.getPlayerRespawnPosition();
    assert.ok(pos, 'Respawn position should be returned');
    const distToDeath = Math.hypot(pos.x - 120, pos.z - (-80));
    assert.ok(distToDeath >= 10 && distToDeath <= 25, `Respawn distance (${distToDeath}) must be near death location (10-25m)`);
    assert.equal(pos.y, 3.5, 'Terrain height should be applied to respawn point');

    // Direction should face toward the death position
    const angleToDeath = Math.atan2(120 - pos.x, -80 - pos.z);
    assert.ok(Math.abs(pos.heading - angleToDeath) < 1e-4, 'Heading should orient player toward where they were killed');
});

test('getPlayerRespawnPosition defaults to origin (0, 0) when player has not died', () => {
    const envSrc = readScript('environment.js');
    const startIdx = envSrc.indexOf('function getPlayerRespawnPosition()');
    const endIdx = envSrc.indexOf('window.getPlayerRespawnPosition = getPlayerRespawnPosition;', startIdx);

    const context = {
        window: {
            lastPlayerDeathPosition: null,
            worldObstacles: [],
            activeEnemyTanks: []
        },
        getTerrainHeight: () => 1.2,
        Math
    };
    vm.createContext(context);
    vm.runInContext(envSrc.slice(startIdx, endIdx) + '\nthis.getPlayerRespawnPosition = getPlayerRespawnPosition;', context);

    const pos = context.getPlayerRespawnPosition();
    assert.equal(pos.x, 0);
    assert.equal(pos.z, 0);
    assert.equal(pos.y, 1.2);
});

test('restartGame preserves enemy tanks and soldiers when respawning in the same battlefield', () => {
    const envSrc = readScript('environment.js');
    assert.ok(envSrc.includes('!isSameWorld'), 'restartGame must check !isSameWorld before resetting enemies');
    assert.ok(envSrc.includes('resetEnemyTanks'), 'resetEnemyTanks should only be called if world changed');
    assert.ok(envSrc.includes('resetSoldiers'), 'resetSoldiers should only be called if world changed');
    assert.ok(envSrc.includes('getPlayerRespawnPosition()'), 'restartGame must call getPlayerRespawnPosition()');
});

test('physics.js onPlayerDeath and playerSoldier.js onPlayerSoldierDie record lastPlayerDeathPosition', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(physicsSrc.includes('window.lastPlayerDeathPosition'), 'physics.js onPlayerDeath must save lastPlayerDeathPosition');

    const soldierSrc = readScript('playerSoldier.js');
    assert.ok(soldierSrc.includes('window.lastPlayerDeathPosition'), 'playerSoldier.js onPlayerSoldierDie must save lastPlayerDeathPosition');

    const enemySrc = readScript('enemyAI.js');
    assert.ok(enemySrc.includes('window.lastPlayerDeathPosition'), 'enemyAI.js must save lastPlayerDeathPosition on knockout/death modal');
});

test('main.js deployPurchasedTank and deployAsSoldier deploy at respawn location near death point', () => {
    const mainSrc = readScript('main.js');
    const tankIdx = mainSrc.indexOf('function deployPurchasedTank(tankId)');
    const tankSnippet = mainSrc.slice(tankIdx, tankIdx + 2000);
    assert.ok(tankSnippet.includes('getPlayerRespawnPosition'), 'deployPurchasedTank must use getPlayerRespawnPosition');

    const soldierIdx = mainSrc.indexOf('function deployAsSoldier(');
    const soldierSnippet = mainSrc.slice(soldierIdx, soldierIdx + 2000);
    assert.ok(soldierSnippet.includes('getPlayerRespawnPosition'), 'deployAsSoldier must use getPlayerRespawnPosition');
});

test('restartGame keeps the scene and chunks intact without calling updateTerrainChunks(0,0)', () => {
    const envSrc = readScript('environment.js');
    const restartIdx = envSrc.indexOf('function restartGame(customSeed, customZone)');
    const snippet = envSrc.slice(restartIdx, restartIdx + 3000);

    // Verify chunkUnloadQueue is cleared to prevent disposal of terrain
    assert.ok(snippet.includes('chunkUnloadQueue.length = 0'), 'chunkUnloadQueue must be cleared on same-world respawn to prevent terrain unloading');
    // Verify tankState coordinates are initialized to respawnPos
    assert.ok(snippet.includes('window.tankState.x = respawnPos.x'), 'tankState.x must remain at respawnPos to prevent camera and chunk drift');
    assert.ok(snippet.includes('window.tankState.z = respawnPos.z'), 'tankState.z must remain at respawnPos to prevent camera and chunk drift');
});
