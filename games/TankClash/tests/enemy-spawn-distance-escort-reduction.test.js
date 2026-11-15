const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('enemyAI.js increases enemy spawn distances to 1.2x from the player', () => {
    const aiSrc = readScript('enemyAI.js');
    assert.ok(aiSrc.includes('MIN_SPAWN_DIST = 192.0'), 'MIN_SPAWN_DIST must be 192.0 (160 * 1.2)');
    assert.ok(aiSrc.includes('MAX_SPAWN_DIST = 288.0'), 'MAX_SPAWN_DIST must be 288.0 (240 * 1.2)');
    assert.ok(aiSrc.includes('DESPAWN_DIST = 336.0'), 'DESPAWN_DIST must be 336.0 (280 * 1.2)');
    assert.ok(aiSrc.includes('168.0'), 'Strict minimum spawn distance buffer must be 168.0 (140 * 1.2)');
});

test('soldiers.js reduces soldiers spawning with the tank to 80%', () => {
    const soldiersSrc = readScript('soldiers.js');
    assert.ok(soldiersSrc.includes('spawnSoldierEscortForTank(enemyTank, enemyFaction, spawnRate = 0.80)'),
        'spawnSoldierEscortForTank must specify default 80% spawn rate');
    assert.ok(soldiersSrc.includes('Math.random() > spawnRate'),
        'spawnSoldierEscortForTank must filter soldier spawns using spawnRate');
});
